/* ============================================================================
   meta.js — ★★ P97 M4-4.5 跨周目存档层（META）
   ---------------------------------------------------------------------------
   设计出处：`design/gdd/P97_潜力与位置体系_设计提案_v0.1.md` §A5.5
     META = { legacyPoints, unlockedOriginIds, cycle, best }

   ★ 为什么必须用独立键（而不是塞进 `State.data`）：
     ① **迁移风险最低** —— 不碰单档结构，旧档照读；首启动无 META → 默认值即"现状"（零迁移）
     ② 它描述的是**玩家（账号）**，不是**某一世的球员** —— 退役不该把它一起带走
     ③ 单档可删、可重开，账号级进度不该跟着消失

   ★★ 与 `core.js` 的 `LEGACY_KEY`（= `mfl_web_save_v2`，**V1 遗留的单存档键**）**无关**，
     且键名刻意取得能一眼区分 —— 那个键会在存储配额告急时被 `_localSave()` 主动清掉。

   ★★ 三条铁律：
     ① **只累积不消耗**（`legacyPoints` / `cycle` 单调不减）—— 否则"多周目成长"就不成立
     ② **任何脏数据都不得让本层崩掉** —— 它必须比主存档更耐操（`normalize` 逐字段兜底）
     ③ **失败静默** —— localStorage 不可用（node 沙箱 / 隐私模式 / 配额满）时退化为内存态，
        绝不抛异常打断退役流程（退役是**不可逆**的核心路径，不能被存档层拖垮）
   ============================================================================ */
(function () {
  const KEY = "mfl_career_meta_v1";   // ★ 与 core.js 的 LEGACY_KEY 明确区分
  const VERSION = 2;                  // ★ P113 升 2：见下方 migrateP113MockUnlocks

  /* ★★ P113（2026-09-17 用户拍板）：**mock 时代误发解锁的一次性撤销**。
     ── 事实 ── ads.js 在 P98-2~P112 期间对本地来源（桌面双击页 file://）实行
       「点击即发奖」→ 用户点广告按钮 = 120ms 后直接解锁「足球天才」并写入本层
       （unlockedOriginIds.push("genius")）——用户原话「足球天才不需要看广告就能解锁」。
     ── 迁移口径 ── ver < 2 的旧档 且 **当前非热点资讯容器**（无 window.ColorboxAI ——
       真解锁只可能发生在容器内，容器内一律不动，防误伤）且 unlockedOriginIds 含
       "genius" → 移除。执行一次后 ver 落 2，不再触发。
     ★ 只处理 "genius"：sports 的 5 冠解锁是 P113 新增通道（本层累计、无 mock 误发面）。 */
  function migrateP113MockUnlocks(parsed) {
    if (!parsed || typeof parsed !== "object") return parsed;
    if (Number(parsed.ver) >= 2) return parsed;
    let ids = Array.isArray(parsed.unlockedOriginIds) ? parsed.unlockedOriginIds : null;
    if (!ids || ids.indexOf("genius") < 0) return parsed;
    let inContainer = false;
    try { inContainer = !!window.ColorboxAI; } catch (e) { inContainer = true; }   // 探测异常保守视为容器（不误删）
    if (inContainer) return parsed;
    parsed.unlockedOriginIds = ids.filter(x => x !== "genius");
    return parsed;
  }

  function blank() {
    return { ver: VERSION, legacyPoints: 0, unlockedOriginIds: [], cycle: 1, best: {}, champions: 0, lastLegacy: null };
  }

  /** 归一化：脏数据不得穿透（本层要比主存档更"耐操"） */
  function normalize(m) {
    const b = blank();
    if (!m || typeof m !== "object" || Array.isArray(m)) return b;
    const num = (v, dflt, lo) => {
      const n = Math.round(Number(v));
      return (isFinite(n) && n >= (lo === undefined ? 0 : lo)) ? n : dflt;
    };
    return {
      ver: VERSION,
      legacyPoints: num(m.legacyPoints, 0),                       // 只增不减
      unlockedOriginIds: Array.isArray(m.unlockedOriginIds)
        ? m.unlockedOriginIds.filter(x => typeof x === "string" && x) : [],
      cycle: num(m.cycle, 1, 1),
      best: (m.best && typeof m.best === "object" && !Array.isArray(m.best)) ? m.best : {},
      /* ★ P113：跨周目累计**一线队冠军**数（体育世家解锁进度）；旧档缺省 = 0，只增不减 */
      champions: num(m.champions, 0),
      /* ★ P129a：上一次生涯的继承包（退役结算时算出；null = 首周目/旧档无记录）。
         逐字段兜底 —— 本层铁律②：脏数据不得穿透。 */
      lastLegacy: normLegacy(m.lastLegacy),
    };
  }

  /** ★ P129b：继承座快照兜底（每座 {type, invested, matureMonthly, curMonthly}）。
   *  ★ 截断口径（R1/T4）：**按 invested 降序保大**——玩家最值钱的产业优先继承到下一次生涯。 */
  function normBizSnap(v, capMax) {
    if (!Array.isArray(v)) return [];
    const cap = capMax || 20;
    const out = [];
    const src = v.filter(b => b && typeof b === "object" && typeof b.type === "string" && b.type)
      .map(b => ({ type: b.type, invested: Math.max(0, Math.round(Number(b.invested) || 0)), matureMonthly: Math.max(0, Math.round(Number(b.matureMonthly) || 0)), curMonthly: Math.max(0, Math.round(Number(b.curMonthly) || 0)) }))
      .sort((a, b) => b.invested - a.invested);
    for (const b of src) {
      out.push(b);
      if (out.length >= cap) break;
    }
    return out;
  }

  /** ★ P129a：lastLegacy 形状兜底（gen/tierRank/attr/sp/bizCount 全部数字化，biz P129b 启用） */
  function normLegacy(v) {
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    const num = (x, lo) => { const n = Math.round(Number(x)); return (isFinite(n) && n >= lo) ? n : 0; };
    return {
      gen: num(v.gen, 1),
      tierRank: num(v.tierRank, 0),
      attr: num(v.attr, 0),
      sp: num(v.sp, 0),
      bizCount: num(v.bizCount, 0),
      tierName: (typeof v.tierName === "string") ? v.tierName : "",
      biz: normBizSnap(v.biz, null),   // ★ P129b：继承快照数组（归一时无分代上下文，cap 兜底 20）
      capAttr: num(v.capAttr, 0), capSp: num(v.capSp, 0),   // ★ 结局卡「距上限」展示（P129a 探针抓漏：白名单遗漏会被静默过滤）
      ts: num(v.ts, 0),
    };
  }

  let _cache = null;

  /* ══════════ 云槽（热点资讯 Colorbox 容器内多端同步；普通网页自动降级）══════════
     ★ 为什么要有：本层存的是**账号级跨周目进度**（累计积分 / 已解锁出身 / 周目数）。
       它此前只写 localStorage —— 于是**清缓存或换设备后，主档还在、周目进度却没了**，
       玩家会觉得"我那几个周目白打了"。而主档早就有云桥（`core.js` 的 `CloudStore`）。
     ★ 键名 `mfl_meta_cloud_v1` **与主档云键 `mfl_cloud_save` 分开**：
       主档可删可重开，账号级进度不该跟着消失。
     ★ 三条铁律照旧：**失败静默**（拿不到 `ColorboxAI.storage` 就整体退化为纯本地，
       一行异常都不许冒出来）／**只增不减**（合并规则见 `merge`）／不阻塞主流程（云写 fire-and-forget）。 */
  const CLOUD_KEY = "mfl_meta_cloud_v1";

  function cloudStore() {
    /* ★ P267：底座统一走 Platform（热点资讯=ColorboxAI.storage 原样；TapTap/Web=TDS 云 KV）；
       platform.js 未装载（旧 vm 探针环境）时保持原直查逻辑，行为逐位一致。 */
    try {
      if (window.Platform && Platform.storage) return Platform.storage();
    } catch (e) { /* fallthrough */ }
    try {
      const C = window.ColorboxAI;
      if (C && C.storage
        && typeof C.storage.setValue === "function"
        && typeof C.storage.getValue === "function") return C.storage;
    } catch (e) { /* ignore */ }
    return null;
  }
  function cloudAvailable() { return !!cloudStore(); }

  /** 云写（不 await、不抛）—— 返回 Promise<boolean> 仅供探针等待 */
  function cloudPush(m) {
    const s = cloudStore();
    if (!s) return Promise.resolve(false);
    try {
      const v = s.setValue({ [CLOUD_KEY]: JSON.stringify(m || _cache || blank()) });
      return Promise.resolve(v).then(() => true).catch(() => false);
    } catch (e) { return Promise.resolve(false); }
  }

  /** ★★ 合并两份 META —— 规则是「只增不减」的延伸：
   *   积分 / 周目 → 取**大**；解锁出身 → **并集**；`best` → 逐键取大。
   *  ★ 为什么不用"新覆盖旧"：多端同时玩时，任一端的进度都不该被另一端抹掉。 */
  function merge(a, b) {
    const x = normalize(a), y = normalize(b);
    const out = blank();
    out.legacyPoints = Math.max(x.legacyPoints, y.legacyPoints);
    out.cycle = Math.max(x.cycle, y.cycle);
    out.champions = Math.max(x.champions, y.champions);   // ★ P113：冠军数跨端合并取大（与"只增不减"同向）
    out.unlockedOriginIds = Array.from(new Set(x.unlockedOriginIds.concat(y.unlockedOriginIds)));
    out.best = Object.assign({}, x.best);
    for (const k of Object.keys(y.best)) {
      const p = out.best[k], q = y.best[k];
      if (typeof q === "number") { if (typeof p !== "number" || q > p) out.best[k] = q; }
      else if (p === undefined) out.best[k] = q;
    }
    /* ★ P129a：lastLegacy 取 ts 新者（两端各有最近一次退役结算，以新的为准） */
    if (x.lastLegacy && y.lastLegacy) out.lastLegacy = (y.lastLegacy.ts >= x.lastLegacy.ts) ? y.lastLegacy : x.lastLegacy;
    else out.lastLegacy = x.lastLegacy || y.lastLegacy || null;
    return out;
  }

  /** 拉云德并合并（**幂等**，重复调用返回同一个 Promise）。启动流程调一次即可。
   *  @returns Promise<boolean> 是否真的产生了变化 */
  let _pulled = null;
  function pullCloud() {
    if (_pulled) return _pulled;
    _pulled = (function () {
      const s = cloudStore();
      if (!s) return Promise.resolve(false);
      let p;
      try { p = s.getValue(CLOUD_KEY); } catch (e) { return Promise.resolve(false); }
      return Promise.resolve(p).then(v => {
        const raw = (typeof v === "string") ? v : null;
        let remote = null;
        try { remote = raw ? JSON.parse(raw) : null; } catch (e) { remote = null; }
        if (!remote) return false;
        const local = _cache || load();
        const merged = merge(local, remote);
        if (JSON.stringify(merged) === JSON.stringify(local)) return false;   // 无变化 → 不写、不推
        save(merged);                       // save 内部会顺带推云，两边保持一致
        return true;
      }).catch(() => false);
    })();
    return _pulled;
  }

  function load() {
    if (_cache) return _cache;
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { raw = null; }   // node 沙箱 / 隐私模式
    let parsed = null;
    try { parsed = raw ? JSON.parse(raw) : null; } catch (e) { parsed = null; }
    parsed = migrateP113MockUnlocks(parsed);   // ★ P113：mock 误发解锁撤销（旧档一次性）
    _cache = normalize(parsed);
    return _cache;
  }

  function save(m) {
    _cache = normalize(m || _cache || blank());
    let ok = false;
    try { localStorage.setItem(KEY, JSON.stringify(_cache)); ok = true; } catch (e) { ok = false; }
    cloudPush(_cache);                    // ★ fire-and-forget：云写失败由下次 save 重试
    return ok;
  }

  /* ── 读 ── */
  /** 历史周目累积积分（**不含**本周目实时积分） */
  function points() { return load().legacyPoints; }
  function cycle() { return load().cycle; }
  function hasOrigin(id) { return load().unlockedOriginIds.indexOf(id) >= 0; }
  function best(k) { return load().best[k]; }
  /** ★ P113：跨周目累计一线队冠军数（体育世家解锁进度） */
  function champions() { return load().champions; }
  /** ★ P129a：上一次生涯的继承包（null = 首周目 / 旧档无记录） */
  function lastLegacy() { return load().lastLegacy; }

  /* ── 写 ── */
  /** ★★ 退役时调用：把**本周目**的生涯积分并入 META，周目 +1
   *  @returns {add, total, cycle, firstClear, legacy} —— 供结局卡展示"这一段人生留下了什么"
   *  ★ 只增不减；`add <= 0` 也照样记周目（玩家确实打完了一世）
   *  ★★ P129a 跨代传承：本函数是传承包的**唯一计算与落账点**（退役=唯一结算入口）。
   *     info.tierRank 由 flow.js 从 Career.retire 返回体透传（与 tier 同函数判定，单源）。
   *     cap 表下标 = min(cycle-1, 表长-1)（cycle 此刻=刚完成的周目号：1→首代退役→下一档 gen1 上限 10）。
   *     计算失败静默（铁律③）：lastLegacy 保持旧值/空，不打断退役流程。 */
  function retire(mine, info) {
    const m = load();
    const add = Math.max(0, Math.round(Number(mine) || 0));
    m.legacyPoints += add;
    m.cycle += 1;
    if (info && typeof info.legacy === "number") {
      const lg = Math.round(info.legacy);
      if (!(m.best.legacy >= lg)) m.best.legacy = lg;
    }
    if (info && typeof info.season === "number" && !m.best.lastSeason) m.best.lastSeason = info.season;
    /* ★ P129a：传承包计算（设计提案 §2 公式；CONFIG.META_LEGACY 缺失=未接线，静默跳过） */
    let legacyOut = null;
    try {
      const ML = (window.CONFIG && CONFIG.META_LEGACY) || null;
      if (ML && Array.isArray(ML.ATTR_CAP) && Array.isArray(ML.SP_CAP) && Array.isArray(ML.TIER_MULT)) {
        const gen = m.cycle - 1;                                   // 刚完成的世代号（1 起）
        const capIdx = Math.max(0, Math.min(gen - 1, ML.ATTR_CAP.length - 1));
        const rank = Math.max(0, Math.min(3, Math.round(Number(info && info.tierRank) || 0)));
        const mult = ML.TIER_MULT[rank];
        const attr = Math.max(0, Math.floor((ML.ATTR_CAP[capIdx] || 0) * mult));
        const spRaw = Math.floor((ML.SP_CAP[capIdx] || 0) * mult);
        const sp = Math.max(spRaw, mult > 0 ? (ML.SP_FLOOR || 0) : 0);   // T3：μ>0 时保底 1
        m.lastLegacy = {
          gen, tierRank: rank,
          attr, sp,
          bizCount: Math.max(0, Math.round(Number(info && info.bizCount) || 0)),   // ★ P128c：上代实持产业座数
          biz: normBizSnap(info && info.biz, ML.BIZ_CAP[capIdx]),   // ★ P129b：继承快照（实持降序截前 BIZ_CAP[gen] 座）
          tierName: (info && typeof info.tierName === "string") ? info.tierName : "",
          capAttr: ML.ATTR_CAP[capIdx] || 0, capSp: ML.SP_CAP[capIdx] || 0,   // 结局卡「距上限」展示用
          ts: Date.now(),
        };
        if (m.lastLegacy.biz) m.lastLegacy.bizCount = m.lastLegacy.biz.length;   // ★ P129b：bizCount 以截断后为准（继承口径）
        legacyOut = m.lastLegacy;
      }
    } catch (e) { /* 失败静默：传承不阻断退役 */ }
    save(m);
    return { add: add, total: m.legacyPoints, cycle: m.cycle, legacy: legacyOut };
  }

  /** ★ P129a：把上一次生涯的继承包注入新档（create.js confirm 建档时调用，一次）。
   *  注入 **expPool（×EXP_PER_ABILITY）与 skillPoints**；刻意**不写 expTotal** ——
   *  等级由生涯累计经验驱动（P114/P125），继承若推进度会经「每级+2点+1SP」复利（提案 §3.1）。
   *  ★ P129b：建筑继承联动 —— lastLegacy.biz 快照经 Finance.applyLegacyBiz 注入
   *  （继承折旧 ×0.5 + 青训托管冻结 + 周薪×2 解冻封顶，口径在 finance.js 单源）。
   *  @returns 注入摘要 {gen, attr, sp, biz} 或 null（无传承/零值不注入） */
  function applyLegacyTo(data) {
    if (!data) return null;
    const ll = lastLegacy();
    if (!ll || (ll.attr <= 0 && ll.sp <= 0 && !(ll.biz && ll.biz.length))) return null;
    const EXP = (window.CONFIG && CONFIG.EXP_PER_ABILITY) || 10000;
    if (ll.attr > 0) data.expPool = (data.expPool || 0) + ll.attr * EXP;
    if (ll.sp > 0) data.skillPoints = (data.skillPoints || 0) + ll.sp;
    let bizN = 0;
    try { if (window.Finance && Finance.applyLegacyBiz) bizN = Finance.applyLegacyBiz({ data: data }, ll.biz); } catch (e) { /* 产业注入失败不阻断点数传承 */ }
    return { gen: ll.gen, attr: ll.attr, sp: ll.sp, biz: bizN };
  }

  /** 出身解锁（如广告档「足球天才」）—— 跨档保留 */
  function unlockOrigin(id) {
    if (!id) return false;
    const m = load();
    if (m.unlockedOriginIds.indexOf(id) >= 0) return false;
    m.unlockedOriginIds.push(id);
    save(m);
    return true;
  }

  /* ★★ P113：冠军累计写点（唯一入口）。
     口径（用户拍板）：只算**一线队冠军** —— 识别规则 = 荣誉名以「冠军」结尾
     （联赛冠军 / 国内杯赛冠军 / 洲际冠军 / 世界杯冠军 / 亚洲杯冠军…）；
     金靴 / 金冕奖 / 「晋级 XX 世界杯」 / 青年荣誉（青年联赛优胜等，A6 命名纪律本就不含冠军字样）一律不计。
     返回是否**恰好达成了新的解锁**（供调用方弹 toast）。
     @param n 本季新增冠军数（≥1 才写）
     @param thresholds 需要检查的解锁门槛表 [{ id, need }]，达成即 unlockOrigin */
  function addChampions(n, thresholds) {
    const cnt = Math.round(Number(n) || 0);
    if (cnt <= 0) return null;
    const m = load();
    m.champions += cnt;
    save(m);
    let unlocked = null;
    if (Array.isArray(thresholds)) {
      for (const t of thresholds) {
        if (t && t.id && typeof t.need === "number" && m.champions >= t.need
          && m.unlockedOriginIds.indexOf(t.id) < 0) {
          m.unlockedOriginIds.push(t.id);
          unlocked = t.id;
        }
      }
      if (unlocked) save(m);
    }
    return { total: m.champions, unlocked: unlocked };
  }

  /** 调试 / 测试用：清空本层（**不动**任何单档存档） */
  function reset() {
    _cache = blank();
    _pulled = null;                       // ★ 允许探针重置"已拉过"标志
    try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    return _cache;
  }

  window.Meta = {
    KEY, VERSION, CLOUD_KEY,
    blank, normalize, load, save, merge,
    cloudAvailable, pullCloud,
    points, cycle, hasOrigin, best, champions, lastLegacy,
    retire, applyLegacyTo, unlockOrigin, addChampions, reset,
  };
})();
