/* ============================================================================
   核心层：随机数 / 全局状态 / 存档
   ============================================================================ */
(function () {
  // ── 可播种随机数（ mulberry32，保证可复现）──
  function makeRNG(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  let rng = makeRNG(Date.now() & 0xffffffff);
  const R = {
    set seed(s) { rng = makeRNG(s); },
    next() { return rng(); },
    int(min, max) { return min + Math.floor(rng() * (max - min + 1)); },
    float(min, max) { return min + rng() * (max - min); },
    pick(arr) { return arr[Math.floor(rng() * arr.length)]; },
    chance(p) { return rng() < p; },
    weighted(items, wFn) {
      let total = 0; for (const it of items) total += wFn(it);
      let roll = rng() * total;
      for (const it of items) { roll -= wFn(it); if (roll <= 0) return it; }
      return items[items.length - 1];
    },
  };
  window.R = R;

// ── 泊松抽样（Knuth）：P0-6 比分引擎分布修复（match.js/season.js 共用；R 消耗不定次数但双端同构） ──
window.poissonSample = function (lambda) {
  const L = Math.exp(-Math.max(0.05, lambda));
  let k = 0, p = 1;
  do { k++; p *= R.next(); } while (p > L);
  return k - 1;
};

  // ── 全局游戏状态（单自动存档：临时退出后续玩，无手动存档槽）──
  const SAVE_BASE = "mfl_web_save_v2";
  const LEGACY_KEY = "mfl_web_save_v2"; // 旧单存档：迁移到槽 0
  const slotKey = slot => SAVE_BASE + "_s" + slot;
  const BAK_KEY = SAVE_BASE + "_bak";   // 本地双备份（防单键损坏）

  /* ★★ P274 丢档防线⑦：IndexedDB 三级镜像（TapTap 玩家「几个赛季进度一夜归零」）。
     根因面：TapTap WebGL 容器里 localStorage 是 WebView 常规缓存——更新/清缓存/系统
     存储回收可整库抹掉，主档+BAK 同库同灭。IndexedDB 是独立存储区（配额更高、
     回收策略不同），镜像一份多一层。设计约束：
     · 全部能力探测 + try/catch + fire-and-forget——vm 探针/旧 WebView 无 IDB 时
       零影响，IDB 故障绝不反噬主链（主链同步语义逐位不变）；
     · 恢复入口 recoverFromIdb() 为异步，仅在「主档+BAK 双失效」时查镜像回灌，
       主档健康时快路径直通（peek 一击即回）。 */
  const IDB_MIRROR_DB = "mfl_save_mirror";
  const IDB_MIRROR_STORE = "slots";
  function idbMirrorAvailable() {
    try { return typeof indexedDB !== "undefined" && !!indexedDB; } catch (e) { return false; }
  }
  function idbMirrorPut(key, json) {
    if (!idbMirrorAvailable()) return;
    try {
      const req = indexedDB.open(IDB_MIRROR_DB, 1);
      req.onupgradeneeded = function () { try { req.result.createObjectStore(IDB_MIRROR_STORE); } catch (e) { /* ignore */ } };
      req.onerror = function () { /* 镜像失败不告警不阻断 */ };
      req.onsuccess = function () {
        try {
          const db = req.result;
          const tx = db.transaction(IDB_MIRROR_STORE, "readwrite");
          tx.objectStore(IDB_MIRROR_STORE).put(json, key);
          tx.oncomplete = function () { try { db.close(); } catch (e) { /* ignore */ } };
          tx.onerror = tx.onabort = function () { try { db.close(); } catch (e) { /* ignore */ } };
        } catch (e) { /* ignore */ }
      };
    } catch (e) { /* ignore */ }
  }
  function idbMirrorGet(key, cb) {
    if (!idbMirrorAvailable()) { cb(null); return; }
    try {
      const req = indexedDB.open(IDB_MIRROR_DB, 1);
      req.onupgradeneeded = function () { try { req.result.createObjectStore(IDB_MIRROR_STORE); } catch (e) { /* ignore */ } };
      req.onerror = function () { cb(null); };
      req.onsuccess = function () {
        try {
          const db = req.result;
          const tx = db.transaction(IDB_MIRROR_STORE, "readonly");
          const g = tx.objectStore(IDB_MIRROR_STORE).get(key);
          g.onsuccess = function () { cb(typeof g.result === "string" ? g.result : null); try { db.close(); } catch (e) { /* ignore */ } };
          g.onerror = function () { cb(null); try { db.close(); } catch (e) { /* ignore */ } };
        } catch (e) { cb(null); }
      };
    } catch (e) { cb(null); }
  }

  // ── 云端存档桥（热点资讯 Colorbox 容器内多端自动同步；普通网页环境自动降级为本地双备份）──
  // ★★ P263 云写分片（玩家反馈「退出游戏整个丢档」根因链）：
  //   容器 storage 单次写入 ≤200KB（SDK 硬约束），而全量存档 JSON 嵌完整队对象
  //   （fixtures 38 场 × 2 队引用，stringify 无引用去重）→ 中期起 200KB-1MB 恒超限
  //   ⇒ 容器拒收 ⇒ 旧实现 `.catch` 只挡 reject、resolve({ok:false}) 不检查 ⇒
  //   **云写失败全程静默、云档从未建成**；本地 localStorage 再被 App 清空（更新/清缓存常态）
  //   ⇒ boot 本地全败 + 拉云德为空 = 整档丢失。
  //   修法：≤150KB 仍走旧单键（兼容省调用）；超限切 150KB 分片多键存储，
  //   **索引键最后写 = 提交点**（半写状态读不到索引即弃，绝不拼出半档）；
  //   每次 setValue 检查 res.ok，任一片失败 → console.warn + BMC 埋点（可见化）。
  const CLOUD_KEY = "mfl_cloud_save";
  const CLOUD_IX_KEY = "mfl_cloud_save_ix";
  const CLOUD_PART_PREFIX = "mfl_cloud_save_p";
  /* ★ P286b（兄弟反馈：登录玩家 iOS+其他设备「单纯丢档」）：云档镜像键——主键写入成功后
     追加写一份镜像（value 同 payload，<200KB KV 单限恒成立：P283b 压缩后峰值 ~38KB）。
     load 主键无档/残缺时回落镜像键。云侧自身冗余，防单键损坏/清理事故/分片迁移事故。
     镜像写失败只 warn 不阻断（主键已成功=本次保存仍算成功）。 */
  const CLOUD_MIRROR_KEY = "mfl_cloud_save_m";
  /* ★★ P283b 云写压缩（渐进增强）：存档长线 20 季实测峰值 132KB（世界杯大满贯玩家
     逼近 150KB 单片线）+ 每次 save 全量重写分片 = 写放大。修法：**只压云 KV 通道**——
     deflate-raw + base64，魔数 "MFLZ1:" 识别；CompressionStream 不可用（老 WebView/
     vm 沙箱）或压缩不赚 → 原样明文（读侧无魔数直回 = 旧云档/明文档全兼容）；
     解压失败（云档损坏）返回 null → 走本地 BAK 兜底链。本地同步通道（pagehide
     同步窗口）不压缩——pack 明文已是瘦身态，异步压缩会破坏退出钩子同步语义。
     典型收益：JSON 文本 deflate-raw 65-75%（球队 id 重复 380 次对 deflate 极友好）
     → 云串恒单片、写放大减半。 */
  const CLOUD_MAGIC = "MFLZ1:";
  /* ★ P288 云档解码加固（审计 SR-004 评估回应）：atob→DecompressionStream→JSON.parse
     全程纯数据变换、无执行原语消费（全库零 eval/Function，输出唯一去向=pullCloud 结构
     判据+档字段还原）——SR-004「解码后执行」不成立。真实风险仅「解压炸弹」（恶意/损坏
     deflate 流解压出超大输出撑爆内存）→ 解压输出硬上限 8MB（真实档 ~200KB，40 倍余量），
     流式累计提前掐断，超限/非法 base64 → null（走 BAK/IDB/镜像兜底链）。零兼容风险：
     正常档与旧云档逐位不变。 */
  const CLOUD_UNPACK_MAX = 8 * 1024 * 1024;
  /* ★ P288 完整性校验（审计诉求「仅可信存档进入解码流程」）：写侧对**最终存储串**
     （压缩后 payload，单片与分片同口径）算 FNV-1a 32bit，落独立 KV 键 mfl_cloud_save_h；
     读侧拼出 payload 后先校验再解压——不匹配（云侧损坏/篡改/半写）= null → 既有
     镜像键/BAK/IDB 兜底链。**有则校验、无则放行**：旧版本客户端写的档（无 h 键）直读
     兼容，新版读旧档零迁移。h 键写失败只 warn 不阻断（主键已成功）。 */
  const CLOUD_HASH_KEY = "mfl_cloud_save_h";
  function fnv1a(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return ("0000000" + h.toString(16)).slice(-8);
  }
  /* ★★ P283f：云串压缩/解压提升为**双通道共用**独立函数（热点资讯 KV 与 Tap 原生云存档
     同一套 deflate-raw+base64+魔数语义）。失败/不支持/不赚 → 明文回落；解压失败 →
     null（调用方走本地兜底）。Tap 端档限 10MB 远未触及，压缩价值=上传流量与本地
     文件体积，读侧旧明文云档直回兼容。 */
  function cloudPackStr(json) {
    try {
      if (typeof CompressionStream === "undefined" || typeof Blob === "undefined" || typeof btoa !== "function") return Promise.resolve(json);
      return new Response(new Blob([json]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer().then(ab => {
        const u8 = new Uint8Array(ab);
        let bin = "";
        const CH = 0x8000;
        for (let i = 0; i < u8.length; i += CH) bin += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
        const packed = CLOUD_MAGIC + btoa(bin);
        return packed.length < json.length ? packed : json;
      });
    } catch (e) { return Promise.resolve(json); }
  }
  /* ═════════ ★★ P291 安全审计标注：cloudPackStr/cloudUnpackStr = 「纯数据变换 · 非执行路径」 ═════════
     复核结论（SR-004 二审收口；安全团队发布前复核入口=tools/_p291_exec_path_gate.js + tools/_p291_exec_audit.txt）：
     · 全链 = btoa/atob（base64 字符集映射）→ Compression/DecompressionStream（deflate-raw
       字节流变换）→ TextDecoder（UTF-8 解码）→ JSON.parse（结构还原）。四者均为纯数据
       原语，**全程不存在任何形式的动态代码执行**：无 eval / new Function / setTimeout(字符串) /
       import(动态表达式) / document.write / execScript（全仓运行时 js 扫描零命中，门禁 G1）。
     · 解码输出（字符串）**唯一去向**＝JSON.parse 做结构还原，消费点共三处且全部先过
       「完整档判据」（meta.dataset==="real-v1" && player && clubId）：
       ① State.pullCloud（core.js）→ 结构判据后写入 _cloudCache / 本地槽；
       ② State.load（core.js）→ 迁移链字段补齐 → State.data；
       ③ hub.js 设置面板「从云端恢复」→ 校验后 reload。
       输出从不进入 innerHTML/script src/属性拼接/任何函数调用形态——不存在注入面。
     · 完整性机制（「签名验证」确认）：写侧对最终存储串（压缩后 payload）算 FNV-1a 32bit
       + 长度，落独立 KV 键 mfl_cloud_save_h；读侧解压前校验，**有则校验、无则放行**
       （旧档零迁移）。★性质声明：这是**完整性校验（防损坏/半写/陈旧），不是密码学签名**
       ——防不了「同账号攻击者直接改云 KV 并重算 FNV」（该威胁模型下任何前端方案均无解，
       前端内嵌 HMAC 密钥可被提取重签=安全剧场，P288 已向审计说明）；真正的信任边界=
       热点资讯平台 KV 的登录态账号隔离 + 服务端 ACL。跨账号/服务端侧篡改属平台责任面。
     · 纵深防御三件套（P288）：base64 字符集预检（非法早拒）+ 解压输出硬上限 8MB
       （防解压炸弹=唯一真实风险面「资源耗尽」，非代码执行）+ FNV-1a 完整性校验。
     ═══════════════════════════════════════════════════════════════════════════ */
  function cloudUnpackStr(raw) {
    try {
      if (typeof raw !== "string" || raw.indexOf(CLOUD_MAGIC) !== 0) return Promise.resolve(raw);
      if (typeof DecompressionStream === "undefined" || typeof Blob === "undefined" || typeof atob !== "function") return Promise.resolve(null);
      const b64 = raw.slice(CLOUD_MAGIC.length);
      /* ★ P288：base64 字符集预检（非法/超限串早拒，不依赖 atob throw；空串拒） */
      if (!b64 || b64.length > (CLOUD_UNPACK_MAX * 4 / 3 + 8) || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return Promise.resolve(null);
      const bin = atob(b64);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      /* ★ P288：流式解压 + 输出硬上限（防解压炸弹——唯一真实风险面是资源耗尽，
         非「代码执行」：atob/DecompressionStream/JSON.parse 全程纯数据变换） */
      const reader = new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).body.getReader();
      /* TextDecoder 与 DecompressionStream 同代际（Streams/Encoding 标准，有前者必有
         后者）——缺失即视为不支持解压走兜底，绝不做逐字节假解码（UTF-8 中文会乱码）。 */
      if (typeof TextDecoder === "undefined") return Promise.resolve(null);
      const dec = new TextDecoder();
      const pump = (out, total) => reader.read().then(r => {
        if (r.done) return out + dec.decode();   // 流结束 → flush 尾字节返回全文
        const n = total + r.value.length;
        if (n > CLOUD_UNPACK_MAX) { try { reader.cancel(); } catch (eC) { /* ignore */ } return null; }   // 超限 → 掐断
        return pump(out + dec.decode(r.value, { stream: true }), n);
      }).catch(() => null);
      return pump("", 0);
    } catch (e) { return Promise.resolve(null); }
  }
  /* ★ P267：单片上限按平台取 min(150KB, 平台上限)——热点资讯 150KB 原值不变；
     TapTap TDS 通道 96KB（云端单对象体积约束）。platform.js 未装载（旧 vm 探针
     环境）时回落 150KB，历史探针的键位/分片数语义不变。 */
  const CLOUD_CHUNK = (window.Platform && Platform.cloudChunkMax)
    ? Math.min(150 * 1024, Platform.cloudChunkMax())
    : 150 * 1024;
  /* ★ P267：云 KV 底座统一走 Platform（热点资讯=ColorboxAI.storage 原样；
     TapTap/Web=platform_web_ext.js 注册的 TDS 云 KV；未配置=null → 本地退化）。
     platform.js 未装载时直查热点资讯底座（旧 vm 探针环境兼容，行为与历史逐位一致）。 */
  function cloudBase() {
    if (window.Platform && Platform.storage) return Platform.storage();
    try {
      const C = window.ColorboxAI;
      return (C && C.storage && typeof C.storage.setValue === "function" &&
        typeof C.storage.getValue === "function") ? C.storage : null;
    } catch (e) { return null; }
  }
  const CloudStore = {
    lastOkAt: 0,   /* ★ P283b 显式初始化（导出后成员名一致性扫描面；_put 成功时更新，_warnQuota 消费） */
    _cloudUnavailableLogged: false,   /* ★ P286b 显式初始化（成员名一致性扫描面；save 云通道不可用会话一次埋点用） */
    /** ★ P283f：薄委托到共用 cloudPackStr/cloudUnpackStr（Tap 通道同语义）。 */
    async _compress(json) { return cloudPackStr(json); },
    async _decompress(raw) { return cloudUnpackStr(raw); },
    /** 单键写入并检查 ok（P263：resolve({ok:false}) 必须算失败；★ P275 记录最近成功时刻） */
    _put(key, val) {
      return Promise.resolve().then(() => cloudBase().setValue({ [key]: val }))
        .then(res => {
          const ok = !!(res && res.ok !== false);
          if (ok) this.lastOkAt = Date.now();
          return ok;
        })
        .catch(() => false);
    },
    /** 单键读取；空串/异常一律 null（旧实现空串会漏判） */
    _get(key) {
      try {
        return cloudBase().getValue(key)
          .then(v => (typeof v === "string" && v.length) ? v : null)
          .catch(() => null);
      } catch (e) { return Promise.resolve(null); }
    },
    /** 删除（覆盖空串语义——容器 storage 无删除 API 时以空串占用替代） */
    _del(key) {
      try { const r = cloudBase().setValue({ [key]: "" }); return Promise.resolve(r).catch(() => null); }
      catch (e) { return Promise.resolve(null); }
    },
    available() {
      try { return !!cloudBase(); } catch (e) { return false; }
    },
    /** ★ P263：写云（分片感知）。resolve(boolean) = 全链成功与否（旧调用方只 catch 不判值，
     *  现在内部已把失败 warn+埋点，调用方可选择检查返回值）。 */
    save(json) {
      const self = this;
      return Promise.resolve().then(async () => {
        const payload = await self._compress(json);   // ★ P283b：压缩串（或明文回落）统一进分片
        if (payload.length <= CLOUD_CHUNK) {
          // 小档：单键直写 + 清理历史分片（大档回小档的迁移；失败不阻断本次保存）
          const ok = await self._put(CLOUD_KEY, payload);
          if (ok) {
            // ★ 先删索引再删分片（commit-flip）：残留旧索引会让 load 读到已删分片
            //   走 catch 返回 null，小档云档永远读不回来（P263 探针 T7 场景）
            await self._del(CLOUD_IX_KEY);
            self._cleanupParts(0);
            /* ★ P286b：镜像键冗余写（失败只 warn——主键已成功，本次保存仍算成功） */
            try { const mok = await self._put(CLOUD_MIRROR_KEY, payload); if (!mok) console.warn("[cloud-save] 镜像键写失败（主键已成功）"); } catch (eM) { /* ignore */ }
            /* ★ P288：完整性校验键（对最终存储串的 FNV-1a+长度；失败只 warn 不阻断） */
            try { const hok = await self._put(CLOUD_HASH_KEY, "v1:" + fnv1a(payload) + ":" + payload.length); if (!hok) console.warn("[cloud-save] 校验键写失败（主键/镜像已成功）"); } catch (eH) { /* ignore */ }
          }
          return ok;
        }
        // 大档：150KB 分片（按 payload 切）。先写全部数据片，**索引最后写（提交点）**——
        // 读取链「无索引 ⇒ 弃分片走单键/本地」，任何半写状态都不会被读到。
        const n = Math.ceil(payload.length / CLOUD_CHUNK);
        for (let i = 0; i < n; i++) {
          const part = payload.slice(i * CLOUD_CHUNK, (i + 1) * CLOUD_CHUNK);
          if (!(await self._put(CLOUD_PART_PREFIX + i, part))) return false;   // 任一片失败 ⇒ 本次云写失败（可见化在下方统一做）
        }
        const ix = { v: 1, n: n, saved: Date.now(), len: payload.length };
        if (!(await self._put(CLOUD_IX_KEY, JSON.stringify(ix)))) return false;
        /* ★ P288：大档路径同写校验键（尽力而为） */
        try { await self._put(CLOUD_HASH_KEY, "v1:" + fnv1a(payload) + ":" + payload.length); } catch (eH) { /* ignore */ }
        self._cleanupParts(n);   // 提交成功后清多余旧分片（n 之外的残留键）
        return true;
      }).then(ok => {
        if (!ok) self._onCloudFail(json.length);
        return ok;
      }).catch(() => { self._onCloudFail(json.length); return false; });
    },
    /** 提交成功后清 n 之外的残留分片（探测到无值即停；最多扫到旧档可能的最大片数+4） */
    _cleanupParts(n) {
      const self = this;
      (function del(i) {
        if (i > n + 15) return;
        self._get(CLOUD_PART_PREFIX + i).then(v => {
          if (v == null) return;
          self._del(CLOUD_PART_PREFIX + i);
          del(i + 1);
        });
      })(n);
    },
    /** ★ P263 失败可见化：console.warn 一次 + BMC 埋点（track.js 台账；失败绝不再静默） */
    _onCloudFail(size) {
      try { console.warn("[cloud-save] 云存档写入失败（size=" + size + "）——本机档仍安全，下次存档自动重试"); } catch (e) { /* ignore */ }
      try { if (window.Track && Track.click) Track.click("BMC026", "SAVE", "cloud_write_fail:" + size); } catch (e) { /* 埋点失败不影响 */ }
    },
    /** ★ P289：云-only 清空（设置面板「清空存档」热点资讯包路径专用）——容器 storage 无
     *  删除 API，按既有 _del 约定以空串覆写全部云键（主键/索引/镜像/校验/历史分片
     *  扫到 24 片封顶）。 resolve(boolean)=全键覆写是否至少发起成功；fire-and-forget
     *  调用（hub.js reload 前发起，不等结果——空串覆写发出即基本生效）。 */
    wipe() {
      const self = this;
      const keys = [CLOUD_KEY, CLOUD_IX_KEY, CLOUD_MIRROR_KEY, CLOUD_HASH_KEY];
      for (let i = 0; i < 24; i++) keys.push(CLOUD_PART_PREFIX + i);
      const jobs = keys.map(k => { try { return self._del(k); } catch (e) { return Promise.resolve(null); } });
      return Promise.all(jobs).then(rs => rs.some(v => v !== null)).catch(() => false);
    },
    /** 读云（分片感知）：索引优先，无索引回落旧单键（P263 前的存量云档兼容）；
     *  ★ P286b：主链无档/残缺 → 回落镜像键（mfl_cloud_save_m，与主键同步写）。
     *  返回 Promise<string|null>；分片长度校验不过 = null（走本地 BAK 链兜底）。 */
    load() {
      const self = this;
      /* ★ P283b：魔数档透明解压，明文/旧档直回。入参可能是 Promise（单键路径）或串（分片路径），统一 then。 */
      /* ★ P288：解压前先过完整性校验——h 键缺失（旧版写的档）放行；校验失败 = null
         （上层既有 mirrorFallback/BAK 兜底链接管）。校验通道自身异常 = 放行（不因
         校验故障丢档——可用性优先，损坏档本来也会被 JSON.parse/结构判据拦下）。 */
      const finish = payload => Promise.resolve(payload).then(async v => {
        if (v == null) return null;
        try {
          const hRaw = await self._get(CLOUD_HASH_KEY);
          if (hRaw) {
            const mm = /^v1:([0-9a-f]{8}):(\d+)$/.exec(hRaw);
            if (mm && (mm[2] !== String(v.length) || mm[1] !== fnv1a(v))) return null;
          }
        } catch (e) { /* 放行 */ }
        return self._decompress(v);
      });
      /* ★ P286b：主链（索引/单键/分片）拿不到有效 payload 时的镜像键兜底 */
      const mirrorFallback = () => finish(self._get(CLOUD_MIRROR_KEY));
      return self._get(CLOUD_IX_KEY).then(ixRaw => {
        if (!ixRaw) return finish(self._get(CLOUD_KEY)).then(v => (v != null) ? v : mirrorFallback());   // 旧单键档（或从未上云）→ 镜像兜底
        let ix = null;
        try { ix = JSON.parse(ixRaw); } catch (e) { return finish(self._get(CLOUD_KEY)).then(v => (v != null) ? v : mirrorFallback()); }
        if (!ix || ix.v !== 1 || !(ix.n > 0) || !(ix.len > 0)) return finish(self._get(CLOUD_KEY)).then(v => (v != null) ? v : mirrorFallback());
        const parts = [];
        let p = Promise.resolve();
        for (let i = 0; i < ix.n; i++) {
          p = p.then(() => self._get(CLOUD_PART_PREFIX + i)).then(v => {
            if (v == null) throw new Error("part-missing:" + i);
            parts.push(v);
          });
        }
        return p.then(() => {
          const payload = parts.join("");
          if (payload.length !== ix.len) return mirrorFallback();   // 半写/不一致 ⇒ 镜像兜底（再无则本地 BAK 链）
          return finish(payload).then(v => (v != null) ? v : mirrorFallback());   // ★ P288：fnv 校验失败同样走镜像兜底
        }).catch(() => mirrorFallback());
      });
    },
  };

  /* ★★ P274b TapTap 原生云存档桥（官方 CloudSaveManager，无需 TDS 配置）。
     tap 全局对象只在 TapTap 容器存在（hupu/web/vm 一律 available()=false，零影响）。
     官方约束：存档名 ≤60B 无空格无中文（用 mfl_auto）；单文件 ≤10MB（本游戏存档
     几百 KB 量级，富余）；**每分钟最多上传 1 次（400001）** → push 内置 65s 节流，
     关键节点（forceCloud/退出）忽略节流，400001 静默跳过（本地三层已兜底）。 */
  const TAP_ARCHIVE_NAME = "mfl_auto";
  let _tapLastPush = 0;
  /* ★★ P290 存档双轨加固（兄弟令：Tap 包存档逻辑独立设计，禁止简单套用热点资讯轨）。
     对照《冠军之心：篮球生涯》Maker 版 Save.lua 的已验证设计移植三件套：
     ① dirty 重试语义——push 失败/被节流跳过 ≠ 放弃，_tapDirty 置位，后续每次
        State.save（15s 心跳）在节流窗过期后自动补推，直到成功（篮球线 Save.update
        的 6s 防抖重试在 Tap 65s 节流约束下的等价形态）；
     ② 成功时刻 + 连败计数——_tapOkAt 供设置面板「云端最近同步」状态行（Hub 消费），
        _tapFailStreak ≥3 触发 BMC031 诊断埋点（对齐 BMC026/BMC030 的失败可见化纪律，
        绝不静默——此前 Tap 云推失败完全无观测面）；
     ③ 官方限制口径修正：文档（developer.taptap.cn cloudsave/features）= 单档 ≤10MB、
        每玩家 100 档/100MB、创建/更新 60 次/分钟；小游戏桥实测另有 400001 限频码
        （P274b）→ 65s 节流保持（对 60/min 合规且留裕量），force 关键节点照旧越过。 */
  let _tapOkAt = 0;
  let _tapFailStreak = 0;
  let _tapDirty = false;
  /* ★★ P298 [Tap] 丢档修复三件（兄弟令：只动 Tap 发布包，热点资讯 v85 不重打；TapTap
     9/23-24 三条差评：手动存档后重开仍丢 / 看广告被杀整档蒸发 / 保存了第二次打开没了）：
     ① _tapArchiveUuid——拉/推成功后缓存云档 uuid：getArchiveList 瞬败或列表瞬态缺项
        时仍可走 updateArchive（不再盲目 createArchive，防重复档逼近 100 档上限风暴）；
     ② _tapForceTimer——force 推云撞官方 65s 限频窗（400001 静默拒收：本地节流跳得过、
        官方的跳不过）时改为延迟到窗外自动补推一次，被杀前最后一次同步不再白丢；
     ③ 推云闸（push 内消费 _tapPullSettled）：boot 云态未落定前禁止推云——堵死
        「云迟到 → 主菜单按无档渲染 → 玩家开新档 → 首存覆盖云上唯一旧档」真丢档链。 */
  let _tapArchiveUuid = null;
  let _tapForceTimer = 0;
  const _tapSettle = function (ok, bytes) {
    if (ok) { _tapOkAt = Date.now(); _tapFailStreak = 0; _tapDirty = false; return; }
    _tapFailStreak++;
    _tapDirty = true;
    if (_tapFailStreak === 3 || _tapFailStreak % 10 === 0) {
      try { console.warn("[tap-cloud] 云存档推送连续失败 " + _tapFailStreak + " 次（bytes=" + bytes + "）——本地多层仍兜底，待节流窗后自动重试"); } catch (e) { /* ignore */ }
      try { if (window.Track && Track.click) Track.click("BMC031", "SAVE", "tap_cloud_push_fail:" + bytes + ":" + _tapFailStreak); } catch (e) { /* ignore */ }
    }
  };
  const TapCloudStore = {
    /** ★ P290 诊断只读口（hub.js 设置面板状态行 / 探针消费） */
    lastOkAt() { return _tapOkAt; },
    failStreak() { return _tapFailStreak; },
    isDirty() { return _tapDirty; },
    _bridge() {
      try {
        const t = window.tap;
        if (!t || typeof t.getCloudSaveManager !== "function" || typeof t.getFileSystemManager !== "function") return null;
        const cloud = t.getCloudSaveManager();
        const fsm = t.getFileSystemManager();
        const base = (t.env && t.env.USER_DATA_PATH) || "tapfile://usr";
        return (cloud && fsm) ? { cloud, fsm, base } : null;
      } catch (e) { return null; }
    },
    available() { return !!this._bridge(); },
    /** 推送：写本地文件 → getArchiveList → update/create（官方推荐双层流程）。
     *  resolve(boolean)=成功与否；所有失败路径（含 400001 限频）静默——本地三层已兜。
     *  ★ P283f：写云前压缩（cloudPackStr 共用语义；官方档限 10MB 未触及，压缩省
     *    上传流量与本地文件体积；65s 节流 = 官方「每分钟最多上传 1 次」约束的合规
     *    实现，force=退役/结算/退出钩子等关键节点跳过节流）。 */
    push(json, force) {
      const b = this._bridge();
      if (!b || typeof json !== "string" || !json) return Promise.resolve(false);
      const now = Date.now();
      /* ★★ P298-D [Tap] 推云闸：boot 云态未落定（pullCloud 未给出「云里有什么」的答案，
         含「确认云空」）前禁止任何推云——此窗口里新档首存会把云上唯一旧档覆盖掉
         （TapTap 三差评的真丢档根因）。闸门在 pullCloud 拿到云态即开；拉云德持续异常时
         闸保持关闭 = 宁可不推云也不冒覆盖风险（本地三层仍在兜底）。 */
      try { if (window.State && !State._tapPullSettled) { _tapDirty = true; return Promise.resolve(false); } } catch (e) { /* ignore */ }
      if (!force && now - _tapLastPush < 65000) { _tapDirty = true; return Promise.resolve(false); }   // ★ P290：节流跳过 = 待重试（非失败，不进连败）
      /* ★★ P298-E [Tap] force 撞官方限频窗：65s 本地节流跳得过、官方「每分钟 1 次」
         跳不过——旧实现 force 硬闯吃 400001 静默拒收（被杀前最后一推白丢）。改为不
         更新 _tapLastPush、延迟到窗外自动补推一次（进程存活期；真被杀则本地层兜底）。 */
      if (force && now - _tapLastPush < 65000) {
        _tapDirty = true;
        try { clearTimeout(_tapForceTimer); } catch (e) { /* ignore */ }
        const payload = json;
        _tapForceTimer = setTimeout(() => { try { this.push(payload, true); } catch (e) { /* ignore */ } }, 65000 - (now - _tapLastPush) + 800);
        return Promise.resolve(false);
      }
      _tapLastPush = now;
      return cloudPackStr(json).then(payload => new Promise(resolve => {
        let done = false;
        /* ★ P290：终态统一经 _tapSettle 落账（成功/失败可见化 + dirty 翻转） */
        const fin = v => { if (!done) { done = true; _tapSettle(!!v, payload ? payload.length : 0); resolve(v); } };
        const t = setTimeout(() => fin(false), 10000);
        try {
          b.fsm.writeFile({
            filePath: b.base + "/mfl_save.json",
            data: payload,   /* ★ P283f：压缩串（cloudPackStr 产出；失败/不赚时=原明文） */
            encoding: "utf8",
            success: () => {
              try {
                b.cloud.getArchiveList({
                  success: (res) => {
                    try {
                      const saves = (res && res.saves) || [];
                      /* ★ P298-E [Tap] uuid 缓存 + 去重：列表瞬态缺项/瞬态空时走缓存 uuid
                         仍走 updateArchive（缓存失效才回落 createArchive 并清缓存）——杜绝
                         createArchive 风暴（重复档逼近官方 100 档上限后推云永久失败）。 */
                      const mine = saves.filter(s => s && s.name === TAP_ARCHIVE_NAME);
                      const ex = mine.find(s => s.uuid === _tapArchiveUuid) || mine[0] || null;
                      if (ex && ex.uuid) _tapArchiveUuid = ex.uuid;
                      const useUuid = (ex && ex.uuid) || (!ex ? _tapArchiveUuid : null);
                      const opts = {
                        archiveMetaData: { name: TAP_ARCHIVE_NAME, summary: "MFL auto save", playtime: 0 },
                        archiveFilePath: b.base + "/mfl_save.json",
                        success: () => { clearTimeout(t); fin(true); },
                        fail: () => { clearTimeout(t); if (!ex && useUuid) _tapArchiveUuid = null; fin(false); },
                      };
                      const doPush = () => {
                        if (useUuid) b.cloud.updateArchive(Object.assign({ archiveUUID: useUuid }, opts));
                        else b.cloud.createArchive(opts);
                      };
                      /* ★★ P301 [Tap] 推前核验（防覆盖最后一道闸）——boot 云态未知
                         （_tapPullUnknown，重试耗尽）或本会话新开生涯（meta.created ≥
                         _bootAt）时，首次命中云端既有档先读其 meta.created 对比：
                         · 同生涯 → 照常 update；列表确认空 → 照常 create（云空实锤）；
                         · 云档读不出且本地是新档 → 本轮跳过（脏重试，绝不盲覆盖不可读档）；
                         · 云端是另一生涯且本地是新档 → 落 _cloudRescue 拒推（玩家可在
                           设置里「从云端恢复」或「放弃云端旧档」）。
                         核验每会话至多一次（_tapPushVerified），老会话续玩零开销。 */
                      const S = window.State;
                      const sessNew = !!(S && S.data && S.data.meta && (S.data.meta.created || 0) >= (S._bootAt || 0) && S._bootAt > 0);
                      const needVerify = !!(S && !S._tapPushVerified && ex && (S._tapPullUnknown === true || sessNew));
                      if (!needVerify) {
                        if (S && !ex) { S._tapPushVerified = true; S._tapPullUnknown = false; }   // 列表实锤空 → 云空确认
                        doPush();
                        return;
                      }
                      this._fetchArchive(b, ex, ctext => {
                        try {
                          let proceed = false;
                          const cp = ctext ? JSON.parse(ctext) : null;
                          const cCreated = (cp && cp.meta && cp.meta.created) || 0;
                          const lCreated = (S.data && S.data.meta && S.data.meta.created) || 0;
                          if (!ctext) {
                            /* 云档读不出：本地新档绝不覆盖（本轮跳过待重试）；本地老生涯照常
                               （四态合并语义：saved 取新者，下次 pullCloud 会正确选边） */
                            proceed = !sessNew;
                          } else if (cCreated && cCreated === lCreated) {
                            proceed = true;   // 同一生涯，正常 update
                          } else if (sessNew) {
                            /* 会话内新开生涯 vs 云端另一生涯 → 冲突保护（旧 P286 救援态复用：
                               save() 见 _cloudRescue 拒推云、本地照写） */
                            S._cloudRescue = ctext;
                            S._tapPullUnknown = false;
                            S._tapPushVerified = true;
                            try { if (window.UIkit) UIkit.toast("检测到云端已有另一份存档——本局进度暂不上云，可在设置里处理", "gold"); } catch (e3) { /* ignore */ }
                            clearTimeout(t); fin(false); return;
                          } else {
                            proceed = true;   // 本地老生涯续玩：按 saved 取新者语义照常推
                          }
                          if (proceed) {
                            S._tapPushVerified = true;
                            S._tapPullUnknown = false;
                            doPush();
                          } else {
                            /* 云档不可读且本地是新档 → 保持「未核验」态，下轮 push 重新核验
                               （绝不盲覆盖读不出的云端档；本地三层照兜） */
                            clearTimeout(t); fin(false);
                          }
                        } catch (eV) { clearTimeout(t); fin(false); }
                      });
                    } catch (e) { clearTimeout(t); fin(false); }
                  },
                  fail: () => { clearTimeout(t); fin(false); },
                });
              } catch (e) { clearTimeout(t); fin(false); }
            },
            fail: () => { clearTimeout(t); fin(false); },
          });
        } catch (e) { clearTimeout(t); fin(false); }
      }));   /* ★ P283f：cloudPackStr(json).then(payload => new Promise(...))——压缩串落盘上云 */
    },
    /** 拉取（★ P301 [Tap] 三态增强版）：getArchiveList → getArchiveData → readFile。
     *  返回 {state, raw, entry}：
     *    state="data"    —— 云档存在且成功读出（raw=解压后 json 串）
     *    state="empty"   —— 列表成功且确认无本游戏档（云空实锤）
     *    state="unknown" —— 列表失败/超时，或列表有档但读不出（云态未知）
     *  ★★ P301 [Tap] 丢档根因修补：旧 pull() 把一切失败都 resolve(null)，上层把
     *    null 当「确认云空」→ settle 开推云闸 → 玩家被当无档开新档 → 首存覆盖
     *    云端唯一旧档（真丢档）。现三态区分，「未知」绝不再被当成「云空」。 */
    pullEx() {
      const b = this._bridge();
      if (!b) return Promise.resolve({ state: "unknown", raw: null, entry: null });
      const self = this;
      return new Promise(resolve => {
        let done = false;
        const fin = v => { if (!done) { done = true; resolve(v); } };
        const t = setTimeout(() => fin({ state: "unknown", raw: null, entry: null }), 10000);
        try {
          b.cloud.getArchiveList({
            success: (res) => {
              try {
                const saves = (res && res.saves) || [];
                /* ★ P298-E [Tap] 与 push 同一 uuid 缓存语义：列表瞬态缺项不误判「云空」 */
                const mine = saves.filter(s => s && s.name === TAP_ARCHIVE_NAME);
                const ex = mine.find(s => s.uuid === _tapArchiveUuid) || mine[0] || null;
                if (ex && ex.uuid) _tapArchiveUuid = ex.uuid;
                if (!ex) { clearTimeout(t); return fin({ state: "empty", raw: null, entry: null }); }
                self._fetchArchive(b, ex, raw => {
                  clearTimeout(t);
                  fin(raw ? { state: "data", raw: raw, entry: ex } : { state: "unknown", raw: null, entry: ex });
                });
              } catch (e) { clearTimeout(t); fin({ state: "unknown", raw: null, entry: null }); }
            },
            fail: () => { clearTimeout(t); fin({ state: "unknown", raw: null, entry: null }); },
          });
        } catch (e) { clearTimeout(t); fin({ state: "unknown", raw: null, entry: null }); }
      });
    },
    /** 单档读取（getArchiveData → readFile → 透明解压）。
     *  ★ P301 [Tap]：从旧 pull 内抽出，push 侧「推前核验」复用同一读链（同判据）。 */
    _fetchArchive(b, entry, cb) {
      try {
        b.cloud.getArchiveData({
          archiveUUID: entry.uuid,
          archiveFileId: entry.fileId,
          targetFilePath: b.base + "/mfl_save_pull.json",
          success: (r) => {
            try {
              b.fsm.readFile({
                filePath: (r && r.filePath) || (b.base + "/mfl_save_pull.json"),
                encoding: "utf8",
                success: (fr) => {
                  const raw = (typeof fr.data === "string" && fr.data) ? fr.data : null;
                  if (!raw) return cb(null);
                  cloudUnpackStr(raw).then(text => cb(typeof text === "string" && text ? text : null)).catch(() => cb(null));
                },
                fail: () => cb(null),
              });
            } catch (e) { cb(null); }
          },
          fail: () => cb(null),
        });
      } catch (e) { cb(null); }
    },
    /** 拉取（旧签名薄委托）：返回 json 串或 null；三态语义见 pullEx。
     *  ★ P283f：读后透明解压（魔数档）；旧版明文云档直回兼容；解压失败=null 走本地链。 */
    pull() {
      return this.pullEx().then(r => r.raw);
    },
  };

  const State = {
    data: null,           // 生涯存档对象
    isNew: true,
    slot: 0,              // 当前存档槽（0-2）
    /* ★ P275 存储降级状态（显式初始化——成员名一致性扫描面 + 探针可读） */
    _idbMode: false,      // localStorage 连败≥2 后切「IDB+云」备用通道（金 toast 一次）
    _lsFailStreak: 0,     // localStorage 连败计数（成功即清零）
    _idbBootRaw: null,    // IDB 镜像内存旁路：回灌 localStorage 失败时持有的镜像档
    _bigSaveLogged: false, // ★ P290：大档诊断埋点会话一次旗标（>500KB 触发 BMC032）
    /* ★★ P289 热点资讯发布包存档独立设计（★用户铁律 2026-09-23：Tap 发布包与热点资讯发布包的
       存档逻辑禁互相套用，各自独立设计演进）。热点资讯包 = **云存档单轨**：
       ColorboxAI.storage（云 KV，多端自动同步）为唯一持久层；本地 localStorage/IDB
       不再写入、不再是读档真相源——本地旧键仅保留为「云整体拉取失败时的一次性回退」
       （存量玩家升级后自然陈旧化，绝不删除，升级首日进度无感）。
       · _cloudCache：boot pullCloud 按「取新者」选定来源后持有的**原始存档串**——
         云 KV 只能异步读，而 peek/hasSave/主菜单卡是同步消费点，全走此缓存；
         save 成功后同步刷新，会话内自洽。
       · 迁移：存量玩家首次 boot 云为空、本地有档 → 本地档推云 + 入缓存（pullCloud
         场景 2 既有链路），一次迁移后本地即退役。 */
    _cloudCache: null,    // P289：云-only 模式当前存档原始串（peek/load/hasSave 同步消费）
    /* ★★ P301 [Tap] 丢档二次加固三态位（热点资讯云-only 不消费；成员显式初始化） */
    _bootAt: 0,           // 本次 boot 时刻（pullCloud 起点写；「会话内新开生涯」判定基准）
    _tapPullUnknown: false,   // boot 拉云德重试耗尽仍未知（push 侧推前核验的触发条件之一）
    _tapPushVerified: false,  // 本会话「推前核验」已做过一次（老会话续玩零开销）
    _tapPullSettled: false,   // ★ P298-D 推云闸旗标（P301 起显式初始化；false=boot 云态未落定）

    /** ★ P289：云-only 存档模式判定（热点资讯发布包专属；Tap/Web 路径逐位不受影响）。
     *  条件=热点资讯容器（Platform.kind()==="hupu"）且云 KV 底座可用。云不可用的热点资讯
     *  容器（理论不应出现）自动落回既有「本地+云」双轨——宁可降级也不让玩家无档可存。 */
    cloudOnlyMode() {
      try {
        return !!(window.Platform && typeof Platform.kind === "function" &&
          Platform.kind() === "hupu" && Platform.storageAvailable && Platform.storageAvailable());
      } catch (e) { return false; }
    },

    /** ★ P289：云-only 模式下云写失败的如实提示（30s 节流）——本地无副本可兜，
     *  必须让玩家知道本次进度尚未上云（BMC026 由 CloudStore._onCloudFail 已埋）。 */
    _warnCloudFail() {
      const now = Date.now();
      if (this._cloudFailWarnAt && now - this._cloudFailWarnAt < 30000) return;
      this._cloudFailWarnAt = now;
      try { if (window.UIkit) UIkit.toast("云端存档写入失败，本次进度尚未上云——请检查网络，稍后自动重试", "red"); } catch (e) { /* ignore */ }
    },

    newCareer(opts) {
      this.data = {
        meta: { version: CONFIG.VERSION, dataset: "real-v1", attrVer: 4, poolVer: 3, created: Date.now(), saved: Date.now() },
        player: null,       // 由 PlayerSystem 创建
        clubId: null, leagueId: null,
        season: CONFIG.SEASON_START_YEAR,
        date: { year: CONFIG.SEASON_START_YEAR, month: 2, day: 1 },
        dayIndex: 0,
        money: 20000, fans: 500, fame: 0,
        morale: 70,   // ★ P171：fatigue 字段随疲劳机制退役（旧档残留键不消费）
        injuryDays: 0,
        attributes: null,
        traits: { weakFoot: 1, skillMoves: 1, traitExp: { weakFoot: 0, skillMoves: 0 } },
        skillPoints: CONFIG.SKILL_LIBRARY.SP.START, // SP 投入制：开档初始技能点
        _seasonHighlights: 0, // 本季高光次数（赛季结算兑付技能点）
        expPool: 0, matchExpPool: 0,
        hidden: { xp: {} },   // 隐藏天赋经验桶（生活事件 traitExp 写入；天赋本体在 player.hidden）
        stats: { apps: 0, goals: 0, assists: 0, cleanSheets: 0, saves: 0, motm: 0, yellow: 0, red: 0, ratingSum: 0, seasonsPlayed: 0, wageEarned: 0 },
        seasonStats: { apps: 0, goals: 0, assists: 0, saves: 0, ratingSum: 0, motm: 0 },
        careerLog: [],      // 每赛季履历 {season, club, league, apps, goals, assists, avgRating, awards[]}
        trophies: [],       // {name, season, icon}
        leagueTable: null,  // 由 SeasonSystem 生成
        fixtures: null,
        cup: null,
        nextFixtureIdx: 0,
        offers: [],
        contract: { years: 2, wage: 3000 },
        housing: { level: 0, name: "青年公寓" },
        car: { level: 0, name: "地铁 + 共享单车" },
        commerce: { active: null, completed: 0 },
        storyFlags: {},
        settings: { textSpeed: 1, sound: true, autoSim: true },
        matchPlan: {},      // P100-A1：逐场勾选表（Q6 默认全手动）——键见 GameLoop.matchPlanKey，值 "sim"=跳过；赛季切换清空
        anchorUsed: {},     // P100-B3：名局直灌消费账（键=名局主客id对，值=1；赛季切换清空）
        history: { pastClubs: [] },
        phase: "senior",    // P99 批 0：生涯相位（三值 academy|jump|senior；新档从职业期起步）。★普通可写字段（A10/C1），禁止 getter 派生（R24：JSON.stringify 会把 getter 抹掉）
        retired: false,
        intl: { version: 1, asiaCup: null, wcq: null, seenCallupYears: {}, career: { apps: 0, goals: 0, assists: 0 } },
        expBoost: false,
        keySimUnlocked: false,  // 「只打关键比赛」广告解锁（本局永久）
        talents: [],        // 天赋系统：开档六选三（talents.js）
        adUsage: { day: "", heal: 0, transferSeason: 0 },   // ★ P171：fatigue 配额键随疲劳点位退役
      };
      this.isNew = true;
      return this.data;
    },

    /** localStorage 容量保护：写入失败（配额超限）时清理可回收空间后重试一次
     *  ★ P274：主档写成功后异步镜像一份到 IndexedDB（防线⑦，失败静默不阻断）
     *  ★★ P275 iOS 存档专项：热点资讯 App 内 iOS WebView 的 localStorage 可能配额被
     *    同容器其他活动数据挤占/被禁用/瞬态存储——旧实现主槽写失败即 return，
     *    IDB 镜像永远不执行，「本地三层防线」在 iOS 上实际全灭（玩家截图：红 toast
     *    反复出现+重启整档丢失）。现镜像无条件先行（localStorage 成败均写 IDB，
     *    主槽+BAK 双键）；localStorage 清理重试仍败 ≥2 次且 IDB 可用 → 切 _idbMode
     *    （进度改由 IDB+云承接，金 toast 提示一次，不再红 toast 刷屏）。
     *    主链返回值语义不变（=localStorage 成败）。 */
    _localSave(json, force) {
      idbMirrorPut(slotKey(this.slot), json);
      idbMirrorPut(BAK_KEY, json);
      const write = () => {
        try { localStorage.setItem(slotKey(this.slot), json); } catch (e) { return false; }
        /* ★ P283 BAK 降频：每 5 次存档落一次（force=退出钩子/手动存档必写）；IDB 镜像
           仍无条件全量双键。localStorage 主通道占用直接减半（玩家档中期 100KB+，
           主槽+BAK 双份是 WebView 配额挤占的主嫌疑之一）。BAK 落后窗口 ≤4 个心跳
           （60s），有 IDB+云双防线兜底，灾备语义不降级。 */
        if (force || ((this._bakTick = ((this._bakTick || 0) + 1)) % 5 === 1)) {
          try { localStorage.setItem(BAK_KEY, json); } catch (e) { /* 备份失败不影响主档 */ }
        }
        return true;
      };
      if (write()) { this._lsFailStreak = 0; return true; }
      // 首写失败：清理可回收空间——旧版单存档键、历史遗留槽位（均已迁移合并至槽 0）、
      // ★ P233（复审）：**BAK_KEY 旧备份**（当前档镜像，删除可由下次 save 自动重建）——回收优先级最后
      try {
        localStorage.removeItem(LEGACY_KEY);
        for (const s of [1, 2]) if (s !== this.slot) localStorage.removeItem(slotKey(s));
        localStorage.removeItem(BAK_KEY);
      } catch (e) { /* ignore */ }
      if (write()) {
        this._lsFailStreak = 0;
        try { if (window.UIkit) UIkit.toast("本地存储空间已整理，存档恢复正常", "gold"); } catch (e) { /* ignore */ }
        return true;
      }
      // ★ P275：清理重试仍败 = localStorage 持续不可用（iOS 形态）——计数并降级
      // ★ P301 [Tap]：TapTap 容器实测存在 localStorage 恒不可用形态（玩家手机 40G
      //   空闲仍报「本地存储空间不足」）——tap 平台首次失败即切备用通道（IDB 镜像在
      //   本方法头部已无条件双键写成功），不再空转第二次失败、不再误报红 toast。
      //   热点资讯云-only 不经此路径（save 云-only 分支与退出钩子均有 cloudOnlyMode 守卫）。
      this._lsFailStreak = (this._lsFailStreak || 0) + 1;
      const _fastIdb = (typeof window !== "undefined" && window.Platform && Platform.kind && Platform.kind() === "tap");
      if (this._lsFailStreak >= (_fastIdb ? 1 : 2) && !this._idbMode && idbMirrorAvailable()) {
        this._idbMode = true;
        try { if (window.UIkit) UIkit.toast("本地空间受限，已切换备用存档通道，进度可正常保存", "gold"); } catch (e) { /* ignore */ }
        try { if (window.Track && Track.click) Track.click("BMC027", "SAVE", "local_quota_fallback_idb"); } catch (e) { /* ignore */ }
      }
      return false;
    },
    /** ★ P233（复审）：定期存储卫生巡检（7 天节流，save 路径触发，零 UI 干扰）——
     *  清理对象只限「确定可回收」：旧版迁移残留（LEGACY_KEY）、废弃槽位（单存档设计下
     *  槽 1/2 迁移完成后即残留）、**损坏/陈旧孤儿备份**（BAK_KEY 非 real-v1 或解析失败 →
     *  清掉，下次 save 自动重建）。玩家当前主档/有效备份不动。 */
    _maybeStorageSweep(now) {
      try {
        const last = +(localStorage.getItem("mfl_storage_sweep_at") || 0);
        if (now - last < 7 * 86400000) return;
        localStorage.setItem("mfl_storage_sweep_at", String(now));
        localStorage.removeItem(LEGACY_KEY);
        for (const s of [1, 2]) if (s !== this.slot) localStorage.removeItem(slotKey(s));
        const bak = localStorage.getItem(BAK_KEY);
        if (bak && bak !== localStorage.getItem(slotKey(this.slot))) {
          try {
            const bm = JSON.parse(bak);
            if (!bm || typeof bm !== "object" || !bm.meta || bm.meta.dataset !== "real-v1") localStorage.removeItem(BAK_KEY);
          } catch (e) { localStorage.removeItem(BAK_KEY); }   // 损坏备份 → 清，下次 save 重建
        }
      } catch (e) { /* 巡检失败不影响存档 */ }
    },
    /** 配额持续不足提示（30 秒节流，避免高频存档刷屏）
     *  ★ P275：_idbMode 下进度真实存于 IDB+云，不再红 toast 刷屏；
     *    云侧补充句按 CloudStore 最近一次写云真实结果区分（60s 内成功=已同步云端；
     *    失败/未知=云端同步未完成+主动补推一次），不再无条件承诺。 */
    _warnQuota() {
      if (this._idbMode) return;
      const now = Date.now();
      if (this._quotaWarnAt && now - this._quotaWarnAt < 30000) return;
      this._quotaWarnAt = now;
      let cloudTail = "；热点资讯 App 内已同步云端";
      try {
        if (CloudStore.available()) {
          const okAt = CloudStore.lastOkAt || 0;
          if (okAt && now - okAt < 60000) {
            cloudTail = (window.Platform && Platform.saveQuotaHint && Platform.kind() !== "hupu") ? Platform.saveQuotaHint() : "；热点资讯 App 内已同步云端";
          } else {
            cloudTail = "；云端同步未完成，稍后自动补传";
            if (this.data) { try { CloudStore.save(JSON.stringify(this.data)); } catch (e) { /* 主动补推失败由下次存档重试 */ } }
          }
        } else if (window.Platform && Platform.saveQuotaHint) {
          cloudTail = Platform.saveQuotaHint();
        }
      } catch (e) { /* ignore */ }
      try { if (window.UIkit) UIkit.toast("本地存储空间不足，进度可能未保存" + cloudTail, "red"); } catch (e) { /* ignore */ }
    },
    /** ★★ P241（用户指令）：存档码导出/导入整体退役 —— 跨设备迁移与灾备一律由
     *  「本地双备份 + 云端自动同步」双重复核承接（见 pullCloud），不再提供手工码通道。
     *  （旧 exportSave/importSave 已删，杜绝导入覆盖与粘贴码误用两类玩家风险） */
    /** 存档：本地主档 + 本地双备份 + 云端双写（容器内）。forceCloud=true 跳过节流立即上云
     *  ★★ P154b 丢档防线①：**无效档不落盘不推云**。
     *    · isNew=true 的窗口 =「新开一局」确认后到签约/入营完成（create.js 两处提前
     *      save 已删，签约回调先置 isNew=false 再 save）——此窗口 State.data 是半档；
     *    · 无 player（newCareer 模板期）或无 clubId（青训路由卡半档，clubId 写点归
     *      initYouthSeason）同理。落盘 = 覆盖槽 0 玩家旧档、推云 = 污染云端。
     *    全仓合法 save 调用点（生涯中/签约回调/休赛期/青训稳态/探针）均 isNew=false
     *    且 player+clubId 齐全。 */
    save(forceCloud) {
      if (!this.data || !this.data.player || !this.data.clubId || this.isNew) return;
      /* ★★ P286：云档救援态未清 → **拒绝推云**（防「云端唯一旧档」被空开的新生涯覆盖——
         玩家丢档的最终形态）。玩家手动「从云端恢复」成功后清除；本会话坚持玩新档时，
         刷新后救援态自然失效（pullCloud 重跑），届时新档覆盖视为玩家明确选择。 */
      if (this._cloudRescue) {
        if (!this._cloudRescueWarned) {
          this._cloudRescueWarned = true;
          try { if (window.UIkit) UIkit.toast("检测到云端历史存档但本地恢复失败——本局进度暂不上云，可在设置中「从云端恢复」", "gold"); } catch (e) { /* ignore */ }
        }
        this.data.meta.saved = Date.now();
        this._localSave(this._packSaveJson(), !!forceCloud);   // 本地照写（进度不丢），仅不推云
        return;
      }
      this.data.meta.saved = Date.now();
      /* ★ P283 序列化视图：fixtures 每场的 match.home/away 在存档串里降为 id 字符串
         （运行时对象形态不变，读档 _unpackLoaded 还原）——38 轮×2 队完整对象被
         stringify 重复展开是存档体积第一大头（12 季实测 43-50KB / 全档 42-59%）。 */
      const json = this._packSaveJson();
      /* ★ P290：大档诊断埋点（会话一次）——「玩得久才丢档」的体积假说验证面：
         长生涯档超 500KB 时上报体积+平台（BMC032），为 Tap 本地配额/云档体积的
         下一步定向加固提供真实分布数据。 */
      if (json.length > 500 * 1024 && !this._bigSaveLogged) {
        this._bigSaveLogged = true;
        try { if (window.Track && Track.click) Track.click("BMC032", "SAVE", "big_save:" + json.length + ":" + ((window.Platform && Platform.kind) ? Platform.kind() : "?")); } catch (e) { /* ignore */ }
      }
      /* ★★ P289 云-only 主路径（热点资讯发布包）：不再写本地（localStorage/IDB 全跳过、
         本地配额警告/卫生巡检一并跳过），云 KV 是唯一持久层；_cloudCache 同步刷新
         保住会话内 peek/load 一致性。云写失败 = 本次进度未落任何盘 → 红 toast 如实
         告知（30s 节流）+ BMC026（_onCloudFail），下次存档/15s 心跳自动重试。 */
      if (this.cloudOnlyMode()) {
        this._cloudCache = json;
        const now = Date.now();
        if (forceCloud || !this._lastCloudWrite || now - this._lastCloudWrite > 3000) {   // 云写节流与双轨时代同值（P275 3s）
          this._lastCloudWrite = now;
          CloudStore.save(json).then(ok => { if (!ok) this._warnCloudFail(); }).catch(() => { this._warnCloudFail(); });
        }
      } else {
      if (!this._localSave(json, !!forceCloud)) this._warnQuota();
      this._maybeStorageSweep(Date.now());   // ★ P233（复审）：定期存储卫生巡检（7 天节流，内部空转为主）
      if (CloudStore.available()) {
        const now = Date.now();
        if (forceCloud || !this._lastCloudWrite || now - this._lastCloudWrite > 3000) {   // ★ P275：5s→3s，iOS 杀进程前云端快照更密
          this._lastCloudWrite = now;
          CloudStore.save(json).catch(() => { /* 云写失败由下次存档重试 */ });
        }
      }
      }
      /* ★ P274b：TapTap 原生云存档并行推送（65s 节流；forceCloud=退役/结算等关键节点忽略节流）
         ★ P298-G [Tap]：推云 Promise 透出（设置面板手动存档等终态再报，不再抢报成功）；
         其余调用方不消费返回值，行为逐位不变。 */
      if (TapCloudStore.available()) return TapCloudStore.push(json, !!forceCloud);
      /* ★ P286b：云通道不可用诊断埋点（会话一次）——「登录玩家单纯丢档」排查面：
         若玩家从未上过云（容器/平台判定不可用），本地一丢即全丢，后台可见规模。 */
      if (!CloudStore.available() && !TapCloudStore.available() && !this._cloudUnavailableLogged) {
        this._cloudUnavailableLogged = true;
        try { if (window.Track && Track.click) Track.click("BMC030", "SAVE", "cloud_unavailable"); } catch (e) { /* ignore */ }
      }
    },
    /* ── ★★ P283 存档体积专项：序列化视图（pack/unpack） ─────────────────────
     *  玩家四张截图（2026-09-22）：红 toast「本地存储空间不足」+ 云端同步未完成。
     *  根因链：fixtures 每场 match.home/away 存**完整球队对象引用**，stringify 时
     *  38 轮×2 队对象被逐场重复展开（12 季档 fixtures 43-50KB = 全档 42-59%）；
     *  本地主槽+BAK 双份全量 + IDB 双键镜像 ×2 → WebView 配额（热点资讯 App 内 iOS
     *  本就紧张，P275 结论）被挤占 → QuotaExceeded 刷屏；云档同步跟着变胖。
     *  修法：**只在存档串里降维**——pack 把 home/away 换成 id 字符串，运行时
     *  State.data 形态逐位不变（46 处消费点全部 .id/.name 属性访问，已审计）；
     *  读档 _unpackLoaded 用 teamById 还原（数据集静态，id 必可还原；失败保留
     *  字符串+console.warn 不阻断）。旧档（对象形态）load/save 双向幂等兼容。 */
    _packSaveJson() {
      const d = this.data;
      const fx = d && d.fixtures;
      if (!Array.isArray(fx) || !fx.length) return JSON.stringify(d);
      let need = false;
      const packed = new Array(fx.length);
      for (let i = 0; i < fx.length; i++) {
        const f = fx[i], m = f && f.match;
        if (m && typeof m.home === "object" && m.home && m.home.id != null &&
            typeof m.away === "object" && m.away && m.away.id != null) {
          packed[i] = Object.assign({}, f, { match: Object.assign({}, m, { home: m.home.id, away: m.away.id }) });
          need = true;
        } else packed[i] = f;
      }
      if (!need) return JSON.stringify(d);
      d.fixtures = packed;
      try { return JSON.stringify(d); } finally { d.fixtures = fx; }   // 同步窗口还原，运行时形态零变化
    },
    _unpackLoaded(d) {
      try {
        const byId = (typeof teamById === "function") ? teamById : ((window.teamById) || null);
        if (!byId) return;
        /* ★ P283e 修复：teamById 只查成年联赛表——青训档 fixtures 的球队 id（ycsl_NN）
           在成年表查不到 → 还原失败残留字符串 → 消费点 fx.match.home.id 变 undefined
           （青训赛程对手/新闻/赛后归属全断）。回落查 youthLeagues（同 teamById 的
           拷贝语义：Object.assign 新对象，id/name/strength 与 initSeason 拷贝同值）。 */
        const youthById = function (id) {
          try {
            const G = window.GAME_DATA && window.GAME_DATA.youthLeagues;
            if (G) {
              for (const lg of G) {
                const t = lg.teams && lg.teams.find(t2 => t2.id === id);
                if (t) return Object.assign({}, t, { league: lg.id });
              }
            }
          } catch (e) { /* ignore */ }
          return null;
        };
        const resolveTeam = function (id) { return byId(id) || youthById(id); };
        const fx = d && d.fixtures;
        if (!Array.isArray(fx)) return;
        for (const f of fx) {
          const m = f && f.match;
          if (!m) continue;
          if (typeof m.home === "string") { const t = resolveTeam(m.home); if (t) m.home = t; else console.warn("[save] 球队还原失败(主):", m.home); }
          if (typeof m.away === "string") { const t = resolveTeam(m.away); if (t) m.away = t; else console.warn("[save] 球队还原失败(客):", m.away); }
        }
      } catch (e) { /* 还原失败不阻断读档（消费点均有存在性防御） */ }
    },
    /** 启动时拉取云端存档：云端比本地任意副本新 → 覆盖本地；无容器环境立即返回 null
     *  ★★ P154b 丢档防线③：云档必须过「可续玩完整档」校验（player+clubId，与 save 守卫
     *    同判据）——拒收创建期半档（pagehide 曾在无守卫时代把半档推上云的存量污染）。
     *  ★★ 丢档防线④（迟到竞态）：boot 1.8s 超时兜底放行后，玩家可能已 load 旧档进入生涯
     *    （isNew=false）——此时迟到的云覆盖会把「云里的旧进度」砸进槽 0。已进入生涯会话
     *    就放弃本次覆盖（内存档更新，下次 save 自然同步云）。 */
    /** ★★ P241：本地+云存档双重复核（对齐篮球线 Save.loadLatest 已验证方案）
     *  时机：boot 启动一次 + 载入兜底（flow.loadSaveWithProgress 本地全败时）。
     *  规则：本地有效副本（主槽/BAK/旧槽）与云档按 meta.saved 取新者，**双向回写**：
     *    · 云新 → 覆盖本地主槽+BAK（仅当尚未进入生涯会话——防线④同判据；
     *      已进会话则内存档为准，返回 "session-active"，下次 save 自然推云）；
     *    · 本地新 → 立即主动补推云（治「save 云写失败后云一直落后」与多设备回切场景）；
     *    · 本地全败（主槽+BAK 均损坏/无档）+ 云有有效档 → 云兜底恢复（救「换设备/清缓存」）。
     *  校验：云档与本地副本均须过完整档判据（dataset=real-v1 + player + clubId），
     *  半档/污染档双向拒收——与 save() 守卫同口径。
     *  @returns {Promise<string>} "cloud-restored" | "local-newer-synced" | "in-sync"
     *           | "local-newer" | "session-active" | "no-cloud" | "no-save" */
    /** 云端原始档读取（双源）：TDS KV 优先，无配置/空档回落 TapTap 原生 CloudSave */
    _cloudRawLoad() {
      if (CloudStore.available()) {
        return CloudStore.load().then(r => (r != null) ? r : (TapCloudStore.available() ? TapCloudStore.pull() : null));
      }
      if (TapCloudStore.available()) return TapCloudStore.pull();
      return Promise.resolve(null);
    },
    /** 云端原始档补推（双源并行，任一成功即可）：本地新于云时治云陈旧 */
    _cloudRawSave(json) {
      const jobs = [];
      if (CloudStore.available()) jobs.push(CloudStore.save(json));
      if (TapCloudStore.available()) jobs.push(TapCloudStore.push(json, true));
      if (!jobs.length) return Promise.resolve(false);
      return Promise.all(jobs).then(rs => rs.some(Boolean));
    },
    pullCloud() {
      if (!CloudStore.available() && !TapCloudStore.available()) return Promise.resolve("no-cloud");
      /* ★ P291 非执行路径：raw（cloudUnpackStr 产出）唯一去向=JSON.parse 结构还原，
         判据通过后才进 _cloudCache/本地槽——从不进入 innerHTML/脚本/属性拼接。 */
      /* ★★ P301 [Tap] 轨道分流：Tap 轨走 pullEx 三态（「未知」≠「确认云空」）；
         热点资讯云-only 轨保持 _cloudRawLoad 原语义（raw=null 一律按确认云空走旧链，
         逐位不变——用户铁律：热点资讯存档轨不再改动）。_bootAt 只在 Tap 轨记录。 */
      const tapTrack = !this.cloudOnlyMode() &&
        (typeof TapCloudStore !== "undefined") && TapCloudStore.available && TapCloudStore.available();
      try { if (tapTrack && !this._bootAt) this._bootAt = Date.now(); } catch (e0) { /* ignore */ }
      const loadP = tapTrack
        ? TapCloudStore.pullEx()
        : this._cloudRawLoad().then(raw => ({ state: (raw != null) ? "data" : "empty", raw: raw }));   /* ★[热点资讯] 包装层：语义与旧链逐位一致 */
      return loadP.then(ex => {
        if (tapTrack && ex.state === "unknown") {
          /* ★★ P301 [Tap]：云态未知 → **不 settle**（推云闸保持关闭，boot 期间新档
             首存不可能覆盖云端）+ 后台重试拉云德。重试成功 → 走下方正常合并（递归
             pullCloud 时 pullEx 已是确认态）；重试耗尽 → 开闸但置 _tapPullUnknown
             （push 侧推前核验兜底 + 主菜单新档风险确认）。堵死「云迟到/拉取失败 →
             被当云空 → 新档首存覆盖云端唯一旧档」真丢档链的最后一环。 */
          return this._tapPullRetry();
        }
        if (tapTrack) this._tapPullUnknown = false;
        const raw = ex.raw;
        let cloud = null;
        try { cloud = raw ? JSON.parse(raw) : null; } catch (e) { cloud = null; }
        const cloudOk = !!(cloud && typeof cloud === "object" && cloud.meta &&
          cloud.meta.dataset === "real-v1" && cloud.player && cloud.clubId);   // 防线③同判据
        /* ★★ P298-D [Tap] 云态已落定（无论云里有什么，含「确认云空」）→ 开推云闸。
           放在本地扫描之前：pullCloud 自身的补推（_cloudRawSave）也在闸开之后执行。
           热点资讯云-only 不消费此标记（TapCloudStore 在 hupu 恒不可用），零行为差异。 */
        this._tapPullSettled = true;
        /* 本地最新有效副本（主槽→BAK→旧槽，损坏副本跳过）
           ★★ P298-C [Tap]：候选补 IDB 镜像——容器清掉 localStorage 但镜像还在时，
           旧实现把镜像里的最新档当「本地无档」，四态合并反而选中较旧的云档。镜像与
           本地键同判据（dataset/player/clubId + meta.saved 取新）；热点资讯云-only 不查
           镜像（本地仅为存量迁移源，行为逐位不变）。 */
        const considerSave = (r) => {
          try {
            if (!r) return null;
            const p = JSON.parse(r);
            if (p && typeof p === "object" && p.meta && p.meta.dataset === "real-v1" && p.player && p.clubId) return p;
          } catch (e) { /* skip 损坏副本 */ }
          return null;
        };
        const scanLocalCopies = (idbCands) => {
          let lr = null, ls = -1;
          const take = (r) => {
            const p = considerSave(r);
            if (p && (p.meta.saved || 0) > ls) { ls = p.meta.saved || 0; lr = r; }
          };
          for (const k of [slotKey(this.slot || 0), BAK_KEY, slotKey(1), slotKey(2)]) {
            try { take(localStorage.getItem(k)); } catch (e) { /* skip 损坏副本 */ }
          }
          for (const r of (idbCands || [])) take(r);
          return { localRaw: lr, localSaved: ls };
        };
        /* IDB 镜像候选（1.5s 超时兜底——IDB 卡死绝不拖死 pullCloud/推云闸） */
        const idbCandsP = (this.cloudOnlyMode && this.cloudOnlyMode()) ? Promise.resolve([]) : new Promise(resolve => {
          let finished = false;
          const out = [];
          let n = 0;
          const fin = () => { if (!finished) { finished = true; resolve(out); } };
          const done = () => { if (++n >= 2) fin(); };
          try {
            idbMirrorGet(slotKey(this.slot || 0), r => { out.push(r); done(); });
            idbMirrorGet(BAK_KEY, r => { out.push(r); done(); });
          } catch (e) { resolve([]); return; }
          setTimeout(fin, 1500);
        });
        return idbCandsP.then(idbCands => {
        const local = scanLocalCopies(idbCands);
        const localRaw = local.localRaw, localSaved = local.localSaved;
        /* 场景 1：本地无有效档 —— 云有则兜底恢复，双无则无档
         *  ★★ P286（玩家持续反馈「热点资讯端依旧丢档」）：本场景是「云档成为唯一真相」的
         *    最后防线，此前两条漏网路都通向真丢档：
         *    ① localStorage 回灌失败（iOS 配额）→ return "no-save" → 玩家被当成无档
         *       空开新生涯 → 新档首存**自动推云覆盖云上唯一旧档** ⇒ 真进度永失；
         *    ② 回灌成功但玩家手滑开了新档 → 同上覆盖。
         *    修法三件套：救援态 `_cloudRescue`（内存，本会话有效）——
         *      · 写失败 → 云档存入 `_idbBootRaw` 内存旁路（load() :925 即时可用）+
         *        idbMirrorPut 异步持久化，返回 "cloud-restored"（load 链走旁路）；
         *      · save() 在 `_cloudRescue` 未清时**拒绝推云**（防新生涯覆盖唯一旧档）+
         *        一次性金 toast 提示；
         *      · 设置面板新增「从云端恢复存档」手动逃生门（hub.js）。 */
        if (!localRaw) {
          if (cloudOk) {
            /* ★ P289 云-only：云档直接入缓存——内存写入不可能失败，救援态机制
               （双轨下防 localStorage 写失败丢档）在云-only 天然无触发场景。 */
            if (this.cloudOnlyMode()) { this._cloudCache = raw; return "cloud-restored"; }
            this._cloudRescue = raw;   // 先亮救援态（恢复成功后清除）
            try {
              localStorage.setItem(slotKey(this.slot || 0), raw);
              localStorage.setItem(BAK_KEY, raw);
              this._cloudRescue = null;
              return "cloud-restored";
            } catch (e) {
              /* localStorage 满 → IDB 内存旁路 + 异步持久化（load 链 _idbBootRaw 即时消费） */
              this._idbBootRaw = raw;
              try { idbMirrorPut(slotKey(this.slot || 0), raw); idbMirrorPut(BAK_KEY, raw); } catch (e2) { /* ignore */ }
              try { if (window.UIkit) UIkit.toast("本地空间不足，云端存档已载入临时通道——请勿开新档，先在设置里处理", "gold"); } catch (e3) { /* ignore */ }
              return "cloud-restored";
            }
          }
          return "no-save";
        }
        /* 场景 2：云无有效档（或损坏）—— 本地有效则补推云（治云陈旧/被清）
         *  ★ P263：save 返回 Promise<boolean>（分片云写逐片判 ok），必须 .then 判布尔——
         *    旧写法 `if (CloudStore.save(...))` 拿 Promise 当真值，写失败也谎报 synced。 */
        if (!cloudOk) {
          /* ★ P289 云-only：本地唯一有效档（存量玩家首次升级 / 云被清）→ 推云迁移 +
             入缓存。★推云失败也照常入缓存——进度本会话可用，下次 save/心跳继续重试
             上云；这正是「不影响现有玩家存档」的迁移承诺。 */
          if (this.cloudOnlyMode()) this._cloudCache = localRaw;
          return this._cloudRawSave(localRaw).then(ok => ok ? "local-newer-synced" : "local-newer");
        }
        /* 场景 3：两边都有有效档 —— 按 saved 取新者，双向回写 */
        const cloudSaved = cloud.meta.saved || 0;
        if (cloudSaved > localSaved) {
          if (this.data && this.isNew === false) return "session-active";   // 防线④：已进会话，迟到覆盖放弃
          /* ★ P289 云-only：云新 → 入缓存即恢复（不再回写本地键） */
          if (this.cloudOnlyMode()) { this._cloudCache = raw; return "cloud-restored"; }
          try {
            localStorage.setItem(slotKey(this.slot || 0), raw);
            localStorage.setItem(BAK_KEY, raw);
            return "cloud-restored";
          } catch (e) { return "local-newer"; }
        }
        if (cloudSaved < localSaved) {
          /* ★ P263：同场景 2——.then 判布尔，云写失败如实回落 "local-newer" */
          /* ★ P289 云-only：本地新 → 入缓存 + 主动补推云（迁移语义同场景 2） */
          if (this.cloudOnlyMode()) this._cloudCache = localRaw;
          return this._cloudRawSave(localRaw).then(ok => ok ? "local-newer-synced" : "local-newer");   // 本地新 → 主动补推云
        }
        return "in-sync";
        });   /* ★ P298-C [Tap] idbCandsP.then 闭合（本地副本扫描含 IDB 镜像候选） */
      }).catch(() => "no-cloud");
    },
    /** ★★ P301 [Tap] 云态未知后台重试：5s × 5 次（约 25s 窗口，进度条/主菜单掩护）。
     *  任意一次拿到确认态 → 走正常合并（递归 pullCloud——此时 pullEx 不会再落 unknown，
     *  无死循环）；重试耗尽 → 开闸但置 _tapPullUnknown（push 推前核验兜底）。
     *  结果经返回值（main.js statePull 的迟到链天然触发菜单重渲染/toast）+
     *  mfl-cloud-settled DOM 事件双通道通知。 */
    _tapPullRetry() {
      const self = this;
      const attempt = (left) => TapCloudStore.pullEx().then(ex => {
        if (ex.state !== "unknown") {
          self._tapPullUnknown = false;
          return self.pullCloud().then(r => { try { self._notifyCloudSettled(r); } catch (eN) { /* ignore */ } return r; });
        }
        if (left <= 0) {
          self._tapPullUnknown = true;
          self._tapPullSettled = true;   // 重试耗尽：开闸（新档闸转 push 侧核验 + 主菜单确认）
          try { self._notifyCloudSettled("cloud-unknown"); } catch (eN) { /* ignore */ }
          return "cloud-unknown";
        }
        return new Promise(res => setTimeout(res, 5000)).then(() => attempt(left - 1));
      });
      return attempt(5);
    },
    /** ★ P301 [Tap] 云态结算通知（DOM 事件， vm 无 document 时静默） */
    _notifyCloudSettled(result) {
      try {
        if (typeof document !== "undefined" && document.dispatchEvent && typeof CustomEvent === "function") {
          document.dispatchEvent(new CustomEvent("mfl-cloud-settled", { detail: { result: result || null } }));
        }
      } catch (e) { /* ignore */ }
    },
    /** ★★ 属性体系迁移（两段式，P97-M0.3 → P112 v3）
     *  第一段（v1→v2，P97）：旧 36 项（6 类×6）→ 31 项（外场 7 类 25 + 门将 6）。
     *    规则权威实现：tools/_p97_attr_migrate_check.js　｜　文档：design/gdd/P97-M0_属性迁移映射表_v1.1.md
     *    ★ 语义解耦：外场 speed 只取 acceleration/sprintSpeed；旧「门将速度」转入 diving。
     *  第二段（v2→v3，P112 2026-09-17 用户拍板「照 FM 截图重构」）：31 项 → 42 项
     *    （外场 36 = 技术14/精神14/身体8 + 门将 6）。映射表：
     *    · 直迁 17：crossing/dribbling/tackling/marking/concentration/finishing/longShots/
     *      strength/stamina/jumping/agility/balance/speed/offBall/anticipation/vision/composure
     *    · 合并：短传+长传+直塞 → passing；   改名：ballControl→firstTouch、headingAccuracy→heading
     *    · 拆分：speed → speed + acceleration；strength 里的侵略性拆回 → aggression
     *    · 删除：shotPower（并入 strength/finishing 对抗位）、volleys（并入 technique）、
     *      interceptions（并入 positioning/anticipation）、throughBall（并入 passing）
     *    · 新增播种：technique/corners/freeKicks/longThrows/penalties/decisions/flair/bravery/
     *      determination/leadership/teamwork/workRate/positioning(外场防守站位)/naturalFitness
     *    · 门将：旧「站位」positioning → gkPositioning（给外场防守站位让出 id）
     *  ★ 幂等：靠 meta.attrVer 标记（≥3 直接返回）；重复调用不再转换（否则二次平均会衰减值）
     *  ★ 形态探测：attrVer 缺失但 attrs 已是 v2 形态（有 offBall/throughBall）→ 跳过第一段
     *    （★ 修掉一个 P97 遗留隐患：新档此前从不落 attrVer，重载时第一段会把
     *      offBall/anticipation/tackling/speed 错误地均值化 —— 新档现在 newCareer 即盖 3 版标记）
     *  ★ 绝不留 null：任何缺失项用「已有项均值」补齐 —— 否则 PlayerSystem.overall() 会算出 NaN
     *  ★ 更老的两代 id（penalties / freeKickAccuracy v1 旧义）不再迁移（游戏未发布，不做三代兼容） */
    migrateAttrPanels(data) {
      const a = data && data.player && data.player.attrs;
      if (!a) return;
      const ver = (data.meta && data.meta.attrVer) || 0;
      if (ver >= 5) return;   // ★ P171：v5 = 当前最新（三段链：v1→v2→v3→v4→v5）
      const looksV2 = a.offBall !== undefined || a.throughBall !== undefined;
      if (ver < 2 && !looksV2) {
        const num1 = k => (typeof a[k] === "number" && !isNaN(a[k])) ? a[k] : null;
        const mg1 = (...ks) => {
          const v = ks.map(num1).filter(x => x !== null);
          return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : null;
        };
        const m1 = {
          // ① 意识（全部由别类迁入）
          offBall: num1("attPositioning"), anticipation: mg1("reactions", "defensiveAwareness"),
          vision: num1("vision"), composure: num1("composure"),
          // ② 传控
          shortPassing: num1("shortPassing"), longPassing: num1("longPassing"), crossing: num1("crossing"),
          throughBall: mg1("shortPassing", "longPassing", "crossing"),
          // ③ 持球
          dribbling: num1("dribbling"), ballControl: num1("ballControl"), agility: num1("agility"), balance: num1("balance"),
          // ④ 防守
          tackling: mg1("slidingTackle", "standingTackle"), interceptions: num1("interceptions"),
          marking: num1("marking"), concentration: num1("concentration"),
          // ⑤ 终结
          finishing: num1("finishing"), shotPower: num1("shotPower"), longShots: num1("longShots"),
          headingAccuracy: num1("headingAccuracy"), volleys: num1("volleys"),
          // ⑥ 身体
          strength: mg1("strength", "aggression"), stamina: num1("stamina"), jumping: num1("jumping"),
          // ⑦ 速度（★ 只取外场来源）
          speed: mg1("acceleration", "sprintSpeed"),
          // ⑧ 门将
          reflexes: num1("reflexes"), diving: mg1("diving", "speed"), handling: num1("handling"),
          positioning: num1("positioning"), kicking: num1("kicking"),
          command: mg1("reflexes", "diving", "handling", "positioning", "kicking"),
        };
        const vals1 = Object.values(m1).filter(v => typeof v === "number");
        const base1 = vals1.length ? Math.round(vals1.reduce((s, v) => s + v, 0) / vals1.length) : 50;
        for (const k of Object.keys(m1)) if (m1[k] === null) m1[k] = base1;
        data.player.attrs = m1;
        if (data.meta) data.meta.attrVer = 2;
      }
      // ── 第二段：v2（31 项）→ v3（42 项，FM 三分类）—— ★ P114：加门槛（ver≥3 的档跳过，
      //    否则 v3 attrs 缺 v2 旧 id → num 全 null → base 兜底 = 数据损坏）──
      if (ver < 3) {
      const b = data.player.attrs;
      const num = k => (typeof b[k] === "number" && !isNaN(b[k])) ? b[k] : null;
      const mg = (...ks) => {
        const v = ks.map(num).filter(x => x !== null);
        return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : null;
      };
      const n = {
        // 直迁（id 与语义都不变）
        crossing: num("crossing"), dribbling: num("dribbling"), tackling: num("tackling"),
        marking: num("marking"), concentration: num("concentration"), finishing: num("finishing"),
        longShots: num("longShots"), strength: num("strength"), stamina: num("stamina"),
        jumping: num("jumping"), agility: num("agility"), balance: num("balance"),
        speed: num("speed"), offBall: num("offBall"), anticipation: num("anticipation"),
        vision: num("vision"), composure: num("composure"),
        // 合并 / 改名
        passing: mg("shortPassing", "longPassing", "throughBall"),   // 三合一套"传球"
        firstTouch: num("ballControl"),                              // 控球 → 停球
        heading: num("headingAccuracy"),                             // 头球精度 → 头球
        technique: mg("dribbling", "ballControl", "volleys"),        // 技术：持球族 + 凌空折入
        corners: mg("crossing", "longPassing"),                      // 角球：起球传中族
        freeKicks: mg("crossing", "finishing"),                      // 任意球：弧线 + 射术
        longThrows: mg("crossing", "strength"),                      // 界外球：臂力 + 起球
        penalties: mg("finishing", "composure"),                     // 罚点球：射术 + 心态
        // 精神组新项（按相关旧项播种）
        decisions: mg("anticipation", "vision"),                     // 决断：预判 + 视野
        flair: mg("vision", "dribbling"),                            // 才华：想象力
        aggression: mg("strength", "tackling"),                      // 侵略性：从强壮拆回
        bravery: mg("strength", "composure"),                        // 勇敢：敢拼 + 不慌
        determination: mg("stamina", "composure"),                   // 意志力：续航 + 心态
        leadership: mg("composure", "vision"),                       // 领导力：稳 + 阅读比赛
        teamwork: mg("vision", "offBall"),                           // 团队合作：配合意识
        positioning: mg("interceptions", "marking"),                 // 外场防守站位：拦截+盯人折入
        workRate: mg("stamina", "concentration"),                    // 工作投入：跑动 + 专注
        naturalFitness: num("stamina"),                              // 体质：体能底子
        acceleration: num("speed"),                                  // 爆发力：从速度拆出（两者同源起步）
        // 门将（旧「站位」→ gkPositioning；外场 pool 无此项，会被 migratePool 裁掉）
        reflexes: num("reflexes"), diving: num("diving"), handling: num("handling"),
        gkPositioning: num("positioning"), kicking: num("kicking"), command: num("command"),
      };
      const vals = Object.values(n).filter(v => typeof v === "number");
      const base = vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : 50;
      for (const k of Object.keys(n)) if (n[k] === null) n[k] = base;
      data.player.attrs = n;
      if (data.meta) data.meta.attrVer = 3;
      }   // ★ P114：第二段 ver<3 门槛闭合
      /* ══ 第三段：v3（42 项 FM 三分类）→ v4（七类 35 项，P114）══
         ★ 迁移矩阵（与 config.js ATTRIBUTES v4 注释逐字对应）：
           · 直迁改名：technique→球感义（id 不变）/ freeKicks 任意球（吸收角球+界外球）/
             positioning→卡位 / offBall→抢点（入终结）
           · 迁移：vision 精神→传球 / anticipation 精神→身体 / balance、agility 身体→速度
           · 新增播种：longPass 长传（短传+视野折入）/ ballFeel 球感（技术+停球折入）/
             feint 花式（盘带+技术折入）/ slideTackle 铲球（抢断折入）/
             interception 拦截（盯人+卡位折入）/ rhythm 节奏（速度+平衡折入）
           · 删除：decisions / concentration / teamwork / workRate / flair / corners / longThrows
             （旧值并入相关新项：decisions→镇定/预判、concentration→镇定、teamwork→短传、
               workRate→耐力、flair→花式/盘带、corners→任意球、longThrows→长传） */
      /* ══ 第三段（v3→v4）门槛块：v4+ 档跳过本体直达第四段 ══ */
      if (ver < 4) {
      const c = data.player.attrs;
      const num3 = k => (typeof c[k] === "number" && !isNaN(c[k])) ? c[k] : null;
      const mg3 = (...ks) => {
        const v = ks.map(num3).filter(x => x !== null);
        return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : null;
      };
      const n4 = {
        // 直迁（id 不变）
        crossing: num3("crossing"), freeKicks: num3("freeKicks"), dribbling: num3("dribbling"),
        firstTouch: num3("firstTouch"), technique: num3("technique"), tackling: num3("tackling"),
        marking: num3("marking"), finishing: num3("finishing"), longShots: num3("longShots"),
        heading: num3("heading"), penalties: num3("penalties"),
        leadership: num3("leadership"), determination: num3("determination"), composure: num3("composure"),
        aggression: num3("aggression"), bravery: num3("bravery"),
        strength: num3("strength"), stamina: num3("stamina"), jumping: num3("jumping"),
        naturalFitness: num3("naturalFitness"),
        acceleration: num3("acceleration"), agility: num3("agility"), speed: num3("speed"),
        // 改名 / 迁移
        vision: num3("vision"),                                   // 精神 → 传球
        anticipation: num3("anticipation"),                       // 精神 → 身体
        balance: num3("balance"),                                 // 身体 → 速度
        positioning: num3("positioning"),                         // 防守站位 → 卡位
        offBall: num3("offBall"),                                 // 无球跑动 → 抢点
        // 新增播种
        longPass: mg3("passing", "vision", "longThrows"),         // 长传：短传 + 视野 + 界外球
        ballFeel: mg3("technique", "firstTouch", "flair"),        // 球感：技术 + 停球 + 才华
        feint: mg3("dribbling", "technique", "flair"),            // 花式：盘带 + 技术 + 才华
        slideTackle: mg3("tackling", "aggression"),               // 铲球：抢断 + 侵略性
        interception: mg3("marking", "positioning", "anticipation"), // 拦截：盯人 + 站位 + 预判
        rhythm: mg3("speed", "balance", "agility"),               // 节奏：速度 + 平衡 + 灵活
        // 删除属性的余量并入
        composure: mg3("composure", "decisions", "concentration"),   // 决断/集中 → 镇定
        stamina: mg3("stamina", "workRate"),                         // 工作投入 → 耐力
        passing: mg3("passing", "teamwork"),                         // 团队合作 → 短传
        freeKicks: mg3("freeKicks", "corners", "longThrows"),        // 角球/界外球 → 任意球
        // 门将 6（不变）
        reflexes: num3("reflexes"), diving: num3("diving"), handling: num3("handling"),
        gkPositioning: num3("gkPositioning"), kicking: num3("kicking"), command: num3("command"),
      };
      const vals4 = Object.values(n4).filter(v => typeof v === "number");
      const base4 = vals4.length ? Math.round(vals4.reduce((s, v) => s + v, 0) / vals4.length) : 50;
      for (const k of Object.keys(n4)) if (n4[k] === null) n4[k] = base4;
      data.player.attrs = n4;
      if (data.meta) data.meta.attrVer = 4;
      }   // ★ P171：第三段 ver<4 门槛闭合
      /* ══ 第四段：v4 → v5（★ P171 门将七类 35 项）══
         · goalkeeping 6→5：command（指挥防线）的值并入 gkPositioning（取 max）——
           语义=「站位指挥」，duel_tables 的 READ/K 表与 GK_KICK/rush 绑定已同步改绑。
         · 22 个新类属性（传球/带球/防守/精神 + 身体/速度补齐）**不在此补值** ——
           交给 migratePool 的「池内缺失项用已有项均值回填」逻辑（poolVer 3→4 触发），
           回填 = 旧 13 项均值 ⇒ POSITION_WEIGHTS.GK 重推（Σ=1）下 OVR 平滑迁移。 */
      if (data.meta && data.meta.attrVer >= 4) {
        const c5 = data.player.attrs;
        if (typeof c5.command === "number" && !isNaN(c5.command)) {
          c5.gkPositioning = Math.max(typeof c5.gkPositioning === "number" ? c5.gkPositioning : 0, c5.command);
          delete c5.command;
        }
        if (data.meta) data.meta.attrVer = 5;
      }
    },
    /** ★★ P97-M2 属性分池迁移：把 attrs 裁剪到**该位置的池**（P114 v4：外场 7 类 35 项 /
     *  门将 = 6 守门 + 身体/速度精选 7 = 13 项，见 CONFIG.GK_SUBSET）
     *  池外项**直接删除**（不是"权重置 0"）—— 分池是结构性的：
     *    门将的进攻属性没有意义，外场的守门属性也没有。
     *  ★ 为什么读档时可以"删属性"：本游戏**未发布**（用户 2026-09-13 明确口径）。
     *    迁移只是开发期便利工具，任何设计决策都不为老档兼容让路。
     *  ★ 删除不影响 OVR —— 池外类本来就不在 POSITION_WEIGHTS 的键里，从不参与总评。
     *  ★ 幂等：靠 meta.poolVer 标记（★ P114：v4 属性集成员变了 → 版本升 3 强制重裁）。 */
    migratePool(data) {
      const pl = data && data.player;
      if (!pl || !pl.attrs || !window.Pool) return;
      if (data.meta && data.meta.poolVer >= 4) return;
      const dropped = Pool.trim(pl.position, pl.attrs);
      // 防御：池内项若有缺失，用「已有项均值」补齐
      //   （不补的话 overall() 会走 30 兜底 → 球员静默变弱，且没有任何报错）
      //   ★ P171：poolVer 3→4 —— 门将池扩为七类 35 项（GK_SUBSET 退役），
      //     旧门将档的 22 个新属性在此按「旧池 13 项均值」回填 ⇒ OVR 平滑迁移（权重 Σ=1 守恒）。
      const ids = Pool.ids(pl.position);
      const have = Object.keys(pl.attrs);
      const base = have.length ? Math.round(have.reduce((s, k) => s + pl.attrs[k], 0) / have.length) : 50;
      let filled = 0;
      for (const id of ids) if (pl.attrs[id] === undefined) { pl.attrs[id] = base; filled++; }
      if (data.meta) data.meta.poolVer = 4;
      return { dropped, filled };
    },
    /** 读取指定槽位（0-2）；旧版单存档自动迁移到槽 0 */
    load(slot) {
      this.slot = (typeof slot === "number") ? slot : this.slot;
      // 旧存档迁移（一次性）
      try {
        if (this.slot === 0 && !localStorage.getItem(slotKey(0)) && localStorage.getItem(LEGACY_KEY)) {
          localStorage.setItem(slotKey(0), localStorage.getItem(LEGACY_KEY));
          localStorage.removeItem(LEGACY_KEY);
        }
      } catch (e) { /* ignore */ }
      try {
        let raw = null;
        /* ★★ P289 云-only（热点资讯包）：云缓存优先——boot pullCloud 已按「取新者」把
           云档/迁移档选定入 _cloudCache，读档以它为真相源；本地键仅在缓存缺失
           （云整体拉取失败）时作一次性回退，恢复会话后下次 save 即推云回正。 */
        if (this.cloudOnlyMode() && this._cloudCache) {
          try {
            const pc = JSON.parse(this._cloudCache);
            if (pc && pc.meta && pc.meta.dataset === "real-v1" && pc.player && pc.clubId) raw = this._cloudCache;
          } catch (eC) { raw = null; }
        }
        if (!raw) { try { raw = localStorage.getItem(slotKey(this.slot)); } catch (e) { raw = null; } }
        /* ★ P275 丢档防线⑧（消费端）：主槽读不到（含 iOS localStorage 禁用读抛异常）
           时采用 recoverFromIdb 留下的内存旁路档——回灌写不进 localStorage 也能进会话 */
        if (!raw && this._idbBootRaw) {
          try {
            const pIdb = JSON.parse(this._idbBootRaw);
            if (pIdb && pIdb.meta && pIdb.meta.dataset === "real-v1") raw = this._idbBootRaw;
          } catch (e) { /* ignore */ }
        }
        if (!raw) return null;
        let parsed = null;
        /* ★ P291 非执行路径：raw（本地键或 _cloudCache，同源受控）只做 JSON.parse
           结构还原 → 迁移链字段补齐 → State.data；无任何执行形态消费。 */
        try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }   // ★ P275：parse 失败不直接弃——落到下方校验块统一走 IDB 旁路
        // 数据集版本校验：旧存档 / 脏数据（非对象 JSON）无法在真实数据下运行，弃读
        // ★ P154b 丢档防线⑤：**load 永不删档**（原 removeItem 会把可诊断的现场抹掉）——
        //   读不出时由 peek→BAK 兜底链 + loadSaveWithProgress 的 restoreFromBackup 接管恢复。
        if (typeof parsed !== "object" || !parsed || !parsed.meta || parsed.meta.dataset !== "real-v1") {
          /* ★ P275：主槽坏档 → IDB 内存旁路顶上（镜像档必过同口径校验才采用） */
          if (this._idbBootRaw && raw !== this._idbBootRaw) {
            try {
              const pIdb2 = JSON.parse(this._idbBootRaw);
              if (pIdb2 && pIdb2.meta && pIdb2.meta.dataset === "real-v1") parsed = pIdb2;
            } catch (e) { /* ignore */ }
          }
          if (typeof parsed !== "object" || !parsed || !parsed.meta || parsed.meta.dataset !== "real-v1") return null;
        }
        this.data = parsed;
        this.isNew = false;
        this._unpackLoaded(this.data);   // ★ P283：pack 过的 fixtures 球队 id → 还原数据集对象（幂等；旧档对象形态直接跳过）
        // 旧档迁移：比赛节奏设置（keySimUnlocked 缺省未解锁；autoSim 缺省开启）
        if (!this.data.settings) this.data.settings = { textSpeed: 1, sound: true, autoSim: true };
        if (this.data.settings.autoSim === undefined) this.data.settings.autoSim = true;
        if (this.data.keySimUnlocked === undefined) this.data.keySimUnlocked = false;
        // 旧档迁移：隐藏天赋经验桶（缺失会导致 traitExp 事件点击报错）
        if (!this.data.hidden) this.data.hidden = { xp: {} };
        if (!this.data.hidden.xp) this.data.hidden.xp = {};
        // 旧档迁移：属性面板（方案 C 五类×6 项）
        this.migrateAttrPanels(this.data);
        // ★ P97-M2：属性分池（把 attrs 裁剪到该位置的池 —— 先裁再生成潜力，顺序不可反）
        this.migratePool(this.data);
        // ★ P97-M1：潜力上限表迁移（老档无 pot → 按出身档生成；★ 绝不把已有属性"砍"下去）
        if (window.Potential) Potential.ensure(this.data);
        // ★ P97-M2：位置动态化字段（originPosition / posMastery / posHistory）
        if (window.Position) Position.ensure(this.data);
        // 旧档迁移：后期补增字段的统一兜底（缺失会直接 TypeError）
        const dd = this.data;
        if (!dd.traits) dd.traits = { weakFoot: 1, skillMoves: 1, traitExp: {} };
        if (!dd.traits.traitExp) dd.traits.traitExp = {};
        if (dd.skillPoints === undefined) dd.skillPoints = CONFIG.SKILL_LIBRARY.SP.START; // SP 制迁移：旧档一次性补发初始点
        if (dd._seasonHighlights === undefined) dd._seasonHighlights = 0;
        if (!dd.commerce) dd.commerce = { active: null, completed: 0 };
        if (!Array.isArray(dd.commerce.history)) dd.commerce.history = []; // ★ P128b：代言履历（新字段，旧档补空）
        if (dd.commerce.seasonCount === undefined) dd.commerce.seasonCount = 0; // ★ P128b：本季额度（P0-1 旧档兜底）
        /* ★ P128c 财富域（懒结构：Finance.ensure 亦兜底；此处补默认防旧档 TypeError） */
        if (!dd.finance) dd.finance = { deposits: [], funds: {}, biz: [], log: [] };
        if (!Array.isArray(dd.finance.deposits)) dd.finance.deposits = [];
        if (!dd.finance.funds || typeof dd.finance.funds !== "object") dd.finance.funds = {};
        if (!Array.isArray(dd.finance.biz)) dd.finance.biz = [];
        if (!Array.isArray(dd.finance.log)) dd.finance.log = [];
        if (!dd.housing) dd.housing = { level: 0, name: "青年公寓" };
        if (!dd.car) dd.car = { level: 0, name: "地铁 + 共享单车" };
        if (!dd.tempEffects) dd.tempEffects = [];
        if (!dd.history) dd.history = { pastClubs: [] };
        if (!dd.careerLog) dd.careerLog = [];
        if (!dd.trophies) dd.trophies = [];
        /* ★ P274 奖杯名自愈：曼德里白舰线纪念卡 badge「第十一座/第十四座」是计数残句——
           独立展示在奖杯列表里不知所云（玩家实测反馈）。迁移为完整表述；
           幂等（新文案不匹配旧名即跳过），改名只影响展示，fx/纪念语义不变。 */
        if (Array.isArray(dd.trophies) && dd.trophies.length) {
          const _badgeFix = { "第十一座": "队史第十一座洲际冠军", "第十四座": "队史第十四座洲际冠军" };
          for (const _t of dd.trophies) {
            if (_t && _badgeFix[_t.name]) _t.name = _badgeFix[_t.name];
          }
        }
        if (dd.phase === undefined) dd.phase = "senior"; // P99 批 0：旧档兜底补相位，字面量 "senior"（A10：禁止用 age<=17 推导 —— undefined !== "senior" 会让判据全落非青训，逐字节等价于今日行为）
        if (!dd.delayedQueue) dd.delayedQueue = [];
        if (dd.insured === undefined) dd.insured = false;
        if (!dd.matchPlan || typeof dd.matchPlan !== "object") dd.matchPlan = {}; // P100-A1：旧档兜底（Q6 逐场勾选表）
        if (!dd.anchorUsed || typeof dd.anchorUsed !== "object") dd.anchorUsed = {}; // P100-B3：旧档兜底（名局消费账）
        /* ★ P211 工资曲线写实化迁移（一次性，只升不降）：旧档合同周薪是旧曲线（P1-16）
           快照，中段 ovr80-88 偏低（玩家实录：冠军队 25 万/周）。按新曲线重算当前合同，
           rand 取 0（×0.85 保守档）；仅上调，绝不降薪。_wageMigrated211 幂等标记。 */
        if (dd.player && dd.contract && dd.contract.wage > 0 && dd._wageMigrated211 !== true) {
          try {
            const _ovr = (window.PlayerSystem && PlayerSystem.overall) ? PlayerSystem.overall(dd.player) : (dd.player.overall || 70);
            const _str = (typeof teamById === "function" && teamById(dd.clubId) && teamById(dd.clubId).strength) || 60;
            const _nw = (window.Career && Career.wageOf) ? Career.wageOf(_ovr, _str, 0) : 0;
            if (_nw > dd.contract.wage) {
              const _old = dd.contract.wage;
              dd.contract.wage = _nw;
              try { if (window.Finance) Finance.log(dd, "工资", 0, "薪资普调（联盟新转播协议）：周薪 " + _old + " → " + _nw); } catch (eFL) { /* ignore */ }
            }
          } catch (eWM) { /* ignore */ }
          dd._wageMigrated211 = true;
        }
        // 损坏档防御①：签约确认前退出的档（有球员无俱乐部）→ 弃读（★ P154b：不再
        //   removeItem——守卫体系下半档不会落盘，存量半档保留现场交给 BAK 恢复链）
        if (dd.player && !dd.clubId) {
          return null;
        }
        // 损坏档防御②：签约揭示页退出的档（有俱乐部无赛程）→ 自动补开赛季
        if (dd.player && dd.clubId && (!dd.fixtures || !dd.fixtures.length)) {
          try { SeasonSystem.initSeason(this, dd.clubId, dd.leagueId); } catch (e) { /* ignore */ }
        }
        return this.data;
      } catch (e) { return null; }
    },
    hasSave(slot) {
      const s = (typeof slot === "number") ? slot : this.slot;
      /* ★ P289 云-only：缓存优先，本地键回退（全仓暂无外部调用者，口径对齐 peek） */
      if (this.cloudOnlyMode() && s === 0 && this._cloudCache) return true;
      try { return !!localStorage.getItem(slotKey(s)); }
      catch (e) { return false; }
    },
    /** 旧版迁移：单存档 → 槽 0；多槽 → 取最新档归并到槽 0（载入存档功能已下线，仅保留单自动存档） */
    migrateLegacy() {
      try {
        if (!localStorage.getItem(slotKey(0)) && localStorage.getItem(LEGACY_KEY)) {
          localStorage.setItem(slotKey(0), localStorage.getItem(LEGACY_KEY));
          localStorage.removeItem(LEGACY_KEY);
        }
        const cands = [0, 1, 2].map(i => {
          const r = localStorage.getItem(slotKey(i));
          if (!r) return null;
          try { const p = JSON.parse(r); return (p && p.meta) ? { i, saved: p.meta.saved || 0, raw: r } : null; }
          catch (e) { return null; }
        }).filter(Boolean);
        if (cands.length > 1) {
          cands.sort((a, b) => b.saved - a.saved);
          if (cands[0].i !== 0) localStorage.setItem(slotKey(0), cands[0].raw);
          for (const c of cands) if (c.i !== 0) localStorage.removeItem(slotKey(c.i));
          try { localStorage.setItem(BAK_KEY, cands[0].raw); } catch (e) { /* ignore */ }
        }
      } catch (e) { /* ignore */ }
    },
    deleteSave(slot) {
      try { localStorage.removeItem(slotKey(typeof slot === "number" ? slot : this.slot)); }
      catch (e) { /* ignore */ }
    },
    /** 槽位摘要（主菜单卡片用）：无存档返回 null
     *  ★ P154b：槽 0 读不出（损坏/半档被弃读）→ 兜双备份键 BAK——主菜单仍显示
     *    「重返游戏」，真正 load 时由 restoreFromBackup 把 BAK 写回主槽恢复。 */
    peek(slot) {
      const readOne = key => {
        try {
          const raw = localStorage.getItem(key);
          if (!raw) return null;
          const p = JSON.parse(raw);
          if (typeof p !== "object" || !p || !p.meta || p.meta.dataset !== "real-v1" || !p.player) return null;
          return p;
        } catch (e) { return null; }
      };
      const s = (typeof slot === "number") ? slot : this.slot;
      /* ★ P289 云-only：云缓存优先（boot 后同步可得）；缓存无效或缺失回落本地键 */
      if (this.cloudOnlyMode() && s === 0 && this._cloudCache) {
        try {
          const p = JSON.parse(this._cloudCache);
          if (typeof p === "object" && p && p.meta && p.meta.dataset === "real-v1" && p.player) return p;
        } catch (e) { /* 回落本地键 */ }
      }
      /* ★ P301 [Tap]：IDB 内存旁路兜底——recoverFromIdb 回灌 localStorage 失败时把镜像
         档留在 _idbBootRaw（容器禁写/恒满 localStorage 形态，玩家 40G 空闲仍报「空间
         不足」实测）。主菜单 peek 必须能看到它，否则玩家被当无档渲染「开始游戏」→
         开新档覆盖（读侧与写侧同一判据）。热点资讯云-only 无本地旁路语义，不参与。 */
      if (!this.cloudOnlyMode() && s === 0 && this._idbBootRaw) {
        try {
          const p = JSON.parse(this._idbBootRaw);
          if (typeof p === "object" && p && p.meta && p.meta.dataset === "real-v1" && p.player) return p;
        } catch (e) { /* 旁路损坏按无档 */ }
      }
      return readOne(slotKey(s)) || (s === 0 ? readOne(BAK_KEY) : null);
    },
    /** ★ P154b 丢档防线⑥：主槽读不出时，把双备份键 BAK（上一次成功 save 的快照）
     *  写回主槽并重载，救回「主键损坏/半档污染」场景。BAK 也无效 → 返回 null。 */
    restoreFromBackup() {
      try {
        const raw = localStorage.getItem(BAK_KEY);
        if (!raw) return null;
        const p = JSON.parse(raw);
        if (!p || typeof p !== "object" || !p.meta || p.meta.dataset !== "real-v1" || !p.player || !p.clubId) return null;
        try {
          localStorage.setItem(slotKey(this.slot || 0), raw);
        } catch (e) {
          /* ★ P275：回灌失败（iOS 形态）→ 旁路持有，load 主槽读不到时采用 */
          this._idbBootRaw = raw;
        }
        return this.load(this.slot || 0);
      } catch (e) { return null; }
    },
    /** ★★ P274 丢档防线⑦：IndexedDB 镜像恢复（异步）。主档或 BAK 任一可读 → 快路径
     *  直通（不碰 IDB）；全失效且镜像有有效档 → 回灌主槽+BAK，返回 true（调用方重走
     *  load 链即得档）。4s 超时兜底——IDB 卡死绝不让读档界面挂住。 */
    recoverFromIdb() {
      const self = this;
      return new Promise(resolve => {
        let done = false;
        const fin = v => { if (!done) { done = true; resolve(v); } };
        try {
          if (self.peek && self.peek(0)) return fin(false);   // 本地健康，无需 IDB
        } catch (e) { /* ignore */ }
        if (!idbMirrorAvailable()) return fin(false);
        const t = setTimeout(() => fin(false), 4000);
        idbMirrorGet(slotKey(0), raw => {
          try {
            clearTimeout(t);
            if (!raw) return fin(false);
            const p = JSON.parse(raw);
            if (!p || typeof p !== "object" || !p.meta || p.meta.dataset !== "real-v1" || !p.player || !p.clubId) return fin(false);
            try {
              localStorage.setItem(slotKey(0), raw);
            } catch (e) {
              /* ★ P275 丢档防线⑧：回灌 localStorage 失败（iOS 配额/禁用永久形态）不再
                 放弃恢复——镜像档留在内存旁路 _idbBootRaw，State.load 主槽读不到时
                 直接采用（旧实现 return false=IDB 有档也救不回，重启永远空档）。 */
              self._idbBootRaw = raw;
              return fin(true);
            }
            try { localStorage.setItem(BAK_KEY, raw); } catch (e) { /* 主槽已回灌即救活 */ }
            fin(true);
          } catch (e) { clearTimeout(t); fin(false); }
        });
      });
    },
    /** ★ P298-F [Tap]：IDB 镜像主槽只读探测（设置面板诊断行消费）——只读不回灌、
       不写本地键；回调参数=镜像里过完整档判据的原始串（无/损坏=null）。 */
    idbMirrorPeek(cb) {
      try {
        idbMirrorGet(slotKey(0), raw => {
          let good = null;
          try {
            const p = JSON.parse(raw);
            if (p && typeof p === "object" && p.meta && p.meta.dataset === "real-v1" && p.player) good = raw;
          } catch (e) { /* 损坏=null */ }
          try { if (cb) cb(good); } catch (e2) { /* ignore */ }
        });
      } catch (e) { try { if (cb) cb(null); } catch (e2) { /* ignore */ } }
    },
  };
  window.State = State;
  window.TapCloudStore = TapCloudStore;   /* ★ P274b 导出供探针/调试 */
  window.CloudStore = CloudStore;         /* ★ P283b 导出供探针/诊断（云压缩验证/云档对账；成员均为内部实现，业务侧一律走 State.save/pullCloud） */

  // ── ★ P263 退出/后台自动存档兜底（玩家反馈「退出游戏就丢失存档」）──
  //  根因面（P263 取证）：
  //  ① 比赛路径本已每场一存（settlement.js applyResult 内 advanceDay 后 State.save()，
  //     silent/compact/full 三路分流之前，覆盖直播/自动完赛/国家队）——缺口不在比赛；
  //  ② 主页经营时段（技能加点/转会/置业/训练）全靠下一场比赛或事件卡才顺带落盘，
  //     hub.js 全文件零 save 调用 → 退出即回退到「上一场比赛后」，玩家感知=丢档；
  //  ③ 旧 pagehide 只推云（异步容器桥，杀进程时来不及发）且不写本地（同步
  //     localStorage 本来得及）；App 直接杀 WebView 时 pagehide 还可能不触发。
  //  修法三层：hidden/pagehide 双钩子【本地同步写+云推】+ 45s 心跳节流存档。
  //  守卫沿用防线①（isNew=false 且 player 齐全才写，半档绝不落盘）。
  function _flushOnExit() {
    try {
      if (!State.data || State.isNew !== false || !State.data.player || !State.data.clubId) return;   // ★ P275：clubId 对齐防线①口径（半档不落盘不推云）
      /* ★ P283：一次 pack 三路共用（本地/云/Tap 同一串；退出关键路径少 2 次全量 stringify） */
      const json = State._packSaveJson();
      /* ★ P289 云-only（热点资讯包）：退出钩子只推云，本地不再写入。云 setValue 为异步
         容器桥，杀进程前能否送达取决于桥实现；15s 心跳 + 3s 云写节流已把回退窗口
         压到最小，此处是最后一搏（尽力而为语义）。 */
      try { if (!State.cloudOnlyMode()) State._localSave(json, true); } catch (e) { /* 本地失败仍试云 */ }
      if (CloudStore.available()) CloudStore.save(json);
      try { if (TapCloudStore.available()) TapCloudStore.push(json, true); } catch (e) { /* ignore */ }
    } catch (e) { /* ignore */ }
  }
  if (typeof window.addEventListener === "function") {
    window.addEventListener("pagehide", _flushOnExit);
    /* ★ P280（玩家实测 iOS 仍退出丢档）：补第三钩子 beforeunload——部分 iOS WebView
       关闭路径只发 beforeunload 不发 pagehide；三钩子幂等（_flushOnExit 纯覆盖写）。 */
    window.addEventListener("beforeunload", _flushOnExit);
    /* ★ 切后台（回主界面/锁屏）先于 pagehide 触发且更可靠——hidden 同款兜底 */
    if (typeof document !== "undefined" && document.addEventListener) {
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "hidden") _flushOnExit();
      });
    }
  }
  /* ★ P263 心跳存档：非比赛时段的最终兜底——任何时点杀进程最多回退一个心跳周期。
     save 本身不耗 R、纯 stringify+localStorage（微秒级），云写自带节流；
     vm 沙箱无 setInterval 防御式注册；save 守卫挡半档，心跳空转无害。
     ★ P275：45s→25s——iOS 杀进程前云端/IDB 快照更密。
     ★ P280：25s→15s（玩家实测 iOS 仍丢档——本机存储若为容器级易失，云侧快照
       越密回退窗口越小；15s 在性能上仍可忽略）。
     ★ P301（用户指令「自动存档要考虑各平台保存频率」）——本心跳=本地层写盘节奏，
       平台频率分工如下（[热点资讯] 轨不动，仅注释归档口径）：
       · [Tap] 本地（LS/IDB 镜像）15s 全量写 + 云推随 State.save 受官方 65s 限频
         （400001），force 节点（结算/退出/手动）越过本地节流、撞官方窗自动补推；
       · [热点资讯] 云-only 15s 心跳 + 云 KV 3s 写节流（平台无官方限频，本地不写盘）。 */
  const _HEARTBEAT_MS = 15000;
  if (typeof window.setInterval === "function") {
    window.setInterval(function () {
      try {
        if (State.data && State.isNew === false && State.data.player && State.data.clubId) State.save();
      } catch (e) { /* ignore */ }
    }, _HEARTBEAT_MS);
  }
  /* ★ P275：持久化存储申请（fire-and-forget）——iOS/Android WebView 下降低
     IndexedDB/localStorage 被系统按「可回收存储」清理的概率；不支持的平台静默跳过。 */
  try {
    if (typeof navigator !== "undefined" && navigator.storage && typeof navigator.storage.persist === "function") navigator.storage.persist();
  } catch (e) { /* ignore */ }
})();
