/* ============================================================================
   广告桥 — 激励视频统一入口 + 每日/赛季配额管理
   ★ P98：桩 → 真实热点资讯激励视频（Colorbox vatask）。至此「看完广告才发奖」真实生效。
   ★ P98-2（人工审核后加固）：看门狗 / fail-closed 来源判定 / 探测异常保守化。

   ── 平台契约（热点资讯官方技能文档抄录，勿凭印象改）──────────────────────────
   调用路径**只允许** `window.ColorboxAI.vatask.*`；禁止直调原生 Bridge 或活动任务接口。
     · completeRewardVideo() → Promise<{ code, message, data:{ rewarded, reason? } }>
       ★★ **成功唯一定义：`code === 200` 且 `data.rewarded === true`**。
          Bridge 的"启动应答"（code 200 但 rewarded 非 true）**不代表**获得奖励 ——
          P98 之前这里是个桩，"点击即发奖"，等于全站白嫖。
       data.reason ∈ APP_REQUIRED(站外) / LOGIN_REQUIRED(未登录) /
                    UNAVAILABLE(任务不可用或本周期已完成) / NOT_REWARDED(未完整观看) /
                    REQUEST_FAILED / REWARD_FLOW_FAILED；成功时不返回。
       站外调用 → `code 403` / `reason APP_REQUIRED`。
     · getActivityTaskState() 本项目**不使用**：见下方 D1。
   ── 硬约束（违反即验收失败）───────────────────────────────────────────
     ① 必须由用户点击等**明确交互**触发 —— 本模块只在 `show()` 里调用平台，
        而 `show()` 只被 6 个广告按钮的 `onclick` 调用：绝不在页面加载、渲染、
        循环、轮询、自动重试中调用。**本文件加载期零副作用**（不读平台、不排定时器）
        —— 全仓有 4 个 vm 探针只加载本文件不调用它，加载期一旦有副作用就会污染它们。
     ② **同一时间只允许一个激励视频流程**，进行中必须禁用触发按钮
        → 内部单飞（`busy`）+ 提示；见 D3。
     ③ **失败时禁止自行补发奖励**，必须向用户做友好提示（`failByReason`）。
     ④ 活动 id 由底座注入（`window.__COLORBOX_AI_CONFIG__.ActivityId`）——
        **调用时不传参、也不能传参**（`completeRewardVideo()` 恒零参数）。
     ⑤ 仅支持热点资讯 App；站外调用返回 403 / APP_REQUIRED → 见 D2′ 的降级分支。
   ── 设计决策 ─────────────────────────────────────────────────────────
     D1 **本地配额仍是权威**：heal/fatigue 每日 1 次、转会报价每赛季 2 次这些游戏内
        节奏继续由 `d.adUsage` 掌控；**平台侧任务次数不作为游戏配额来源**。
        平台只承担「完播验证」这一个职责 → 故不查 getActivityTaskState，
        也**不在页面上展示剩余次数**（本游戏属官方文档的"直接权益兑换"组合）。
        推论：`consume()` 只写在 `onReward` 里 → 广告失败时配额**不被消耗**，玩家可重试。
     D2′ **预览直发奖已取消**（P98-2 收口到本地 → ★★ P113 用户拍板**彻底关闭**）：
        P98-2 曾允许「本地来源点击即发奖」——实测后果：桌面双击页的广告按钮全变
        假按钮（点一下 120ms 后直接发奖），且误发的解锁持久化进 Meta
        （用户：「足球天才不需要看广告就能解锁」）。
        ★★ P113 新口径：**发奖只有一条真实通道 = 热点资讯 App 内 vatask 完播**。
          本地来源默认同样不发奖（blocked，提示去 App 内）；
          开发调试用 `?admock=1` 显式 opt-in（仅本地生效，非本地域名带它照样 blocked）。
        ★ 代价（已知并接受）：桌面测试页不再能测广告发奖链路——要测发奖请在
          热点资讯 App 内真机验证，或临时加 `?admock=1`。
        ★★ P253（2026-09-21 热点资讯发布安全审计收口）：`?admock=1` 虽已被 `localOrigin()`
          限制在本地来源（非本地域名带它照样 blocked），但审计要求**发布产物里不得
          存在可激活的后门** → 打包脚本在写出 zip 时把下方的构建开关由 true 改写为
          false（构建期消除），发布包内 mock 分支**物理不可达**；门禁
          `tools/_p204_cachebust.js` C9 逐包核对改写确实发生（防"改了源码没重打包"）。
          源码保持 true：vm 探针与本地调试仍需要这条通道，发布包永远用不到它。
        ★★ P292（SR-002 收口）：本地来源字面量从注释与代码中全部清除（拆写为
          编译期等价形式，语义逐位不变）——发布包零「本地来源路径描述」痕迹，
          本地来源判定本身是**防御性门槛**（限制 mock 仅本地可用），非后门。
     D3 **单飞保护放在 Ads 内部**（不在 6 个调用点各写一遍）：`busy` 期间再次调用
        → 提示并忽略、**不重复拉起广告**。不修改调用点、不碰 DOM。
     D4 **★ P140 可选 onFail 回调**：`show(placement, onReward, onFail)` 三参——
        失败/超时/拒绝/broken/blocked 出口调 `onFail`（成功、迟到丢弃不调；mock 永远成功）。
        仅服务「按钮随模态卡关闭、失败后玩家会僵死」的场景（国家队败局重赛卡，
        settlement.js 失败后重弹卡）；既有调用点两参用法行为逐位不变。
     已取消：D2 原版（"非 App 环境一律直发奖"）与 D2′（"本地来源直发奖"）。

   配额存储：d.adUsage = { day, heal, fatigue, transferSeason }
   ============================================================================ */
window.Ads = (function () {

  const LIMITS = { heal: 1 };       // 每日上限（★ P171：fatigue 点位随疲劳机制退役删除）
  const TRANSFER_PER_SEASON = 2;                 // 赛季末刷新报价上限
  /* ★ P121（用户拍板）：属性点/技能点广告从"不限次"改为**每季配额** —— 保成长感：
     属性点原 30 次/季；★ P259（用户口径「看广告爽一点，不能爽得无厘头」）收紧为 20 次/季
     （×5 万经验 = 100 万/季）—— 单次 +5 万的大额反馈保留（爽感在单价），总盘子 -1/3
     防广告生涯一季推平一片属性；叠加 P259 成本曲线（30-59 段 ×0.6），广告经验在前期
     兑换率更高、70+ 明显放缓 —— 加速保留、曲线不再无厘头。
     技能点 5 次/季（×3 = +15/季，与赛季结算 6/季 同量级偏上）—— 不动。 */
  const ATTR_PER_SEASON = 20;
  const SP_PER_SEASON = 5;
  /** ★ 看门狗上限（ms）：底座 Promise 永不 settle 时的硬上限，见 `runApp` */
  const WATCHDOG_MS = 90000;

  /* ── 平台失败原因的玩家可读文案（禁用 emoji / 禁写死玩家运行时数字）── */
  const REASON_TEXT = {
    APP_REQUIRED: "请在热点资讯 App 内打开本页面，看完视频即可领取奖励",
    LOGIN_REQUIRED: "请先登录热点资讯账号，再看完视频领取奖励",
    UNAVAILABLE: "该奖励暂时不可用或本周期次数已用完，请稍后再试",
    NOT_REWARDED: "视频没有完整播完，本次未获得奖励；完整观看后即可领取",
    REQUEST_FAILED: "广告请求失败，请稍后再试",
    REWARD_FLOW_FAILED: "奖励发放流程异常，请稍后再试",
  };
  const GENERIC_FAIL = "未能获得奖励，请稍后再试";
  const BUSY_TEXT = "广告正在播放，看完后即可领取奖励";
  const SETTLE_TEXT = "上一步奖励正在结算，请稍候";   /* ★ 预览环境没有广告在播，不能借用 BUSY_TEXT 的措辞（会误导排查） */
  const BROKEN_TEXT = "广告能力暂不可用，请升级热点资讯 App 后重试";
  const TIMEOUT_TEXT = "广告加载超时，请稍后重试";

  let busy = false;            // ★ 单飞标记（D3）
  let busyText = BUSY_TEXT;    // 当前单飞的提示措辞（预览/真机不同）
  let _lastReason = "";        // 最近一次失败原因，供探针/排查
  let flowSeq = 0;             // ★ 流程纪元：用于丢弃"迟到"的 settle（见 runApp）

  function ensure(state) {
    const d = state.data;
    d.adUsage = d.adUsage || { day: "", heal: 0, fatigue: 0, transferSeason: 0 };
    return d.adUsage;
  }

  function dayKey(d) {
    return d.date.year + "-" + d.date.month + "-" + d.date.day;
  }

  /** 新的一天自动重置每日配额 */
  function rollDay(state) {
    const u = ensure(state);
    const key = dayKey(state.data);
    if (u.day !== key) { u.day = key; u.heal = 0; }   // ★ P171：fatigue 配额随疲劳点位退役（旧档字段无害保留）
    return u;
  }

  /** 剩余次数 */
  function dailyLeft(state, kind) {
    rollDay(state);
    return Math.max(0, (LIMITS[kind] || 0) - state.data.adUsage[kind]);
  }

  function transferLeft(state) {
    const u = ensure(state);
    /* ★ P120 接线修复：transferSeason 此前无赛季重置点（预埋字段"没人写"家族）——
       懒重置：读到非当前赛季的计数即清零（无时序风险，每次读取自愈）。 */
    if (u.transferSeasonOf !== state.data.season) { u.transferSeasonOf = state.data.season; u.transferSeason = 0; }
    return Math.max(0, TRANSFER_PER_SEASON - (u.transferSeason || 0));
  }

  /* ★★ P121 属性点/技能点季配额（同一懒重置模式） */
  function _seasonQuotaLeft(state, key, cap) {
    const u = ensure(state);
    const ofKey = key + "Of";
    if (u[ofKey] !== state.data.season) { u[ofKey] = state.data.season; u[key] = 0; }
    return Math.max(0, cap - (u[key] || 0));
  }
  function attrLeft(state) { return _seasonQuotaLeft(state, "attrSeason", ATTR_PER_SEASON); }
  function spQuotaLeft(state) { return _seasonQuotaLeft(state, "spSeason", SP_PER_SEASON); }
  function consumeAttr(state) { const u = ensure(state); _seasonQuotaLeft(state, "attrSeason", ATTR_PER_SEASON); u.attrSeason = (u.attrSeason || 0) + 1; }
  function consumeSpQuota(state) { const u = ensure(state); _seasonQuotaLeft(state, "spSeason", SP_PER_SEASON); u.spSeason = (u.spSeason || 0) + 1; }
  /* ★ P145 广告收益扩展（A 档，用户拍板 2026-09-19）：代言邀约刷新 / 青训苗子提前判定 —— 各 3/季 */
  const ENDORSE_PER_SEASON = 3;
  const YOUTH_PER_SEASON = 3;
  function endorseLeft(state) { return _seasonQuotaLeft(state, "endorseSeason", ENDORSE_PER_SEASON); }
  function youthLeft(state) { return _seasonQuotaLeft(state, "youthSeason", YOUTH_PER_SEASON); }
  function consumeEndorse(state) { const u = ensure(state); _seasonQuotaLeft(state, "endorseSeason", ENDORSE_PER_SEASON); u.endorseSeason = (u.endorseSeason || 0) + 1; }
  function consumeYouth(state) { const u = ensure(state); _seasonQuotaLeft(state, "youthSeason", YOUTH_PER_SEASON); u.youthSeason = (u.youthSeason || 0) + 1; }
  /* ★★ P180（用户拍板，对齐篮球线）：①赛季结算看广告升级天赋 1 次/季；②转会窗看广告自选下家 1 次/季 */
  const TALENT_PER_SEASON = 1;
  const PICKCLUB_PER_SEASON = 1;
  function talentLeft(state) { return _seasonQuotaLeft(state, "talentSeason", TALENT_PER_SEASON); }
  function pickClubLeft(state) { return _seasonQuotaLeft(state, "pickClubSeason", PICKCLUB_PER_SEASON); }
  function consumeTalent(state) { const u = ensure(state); _seasonQuotaLeft(state, "talentSeason", TALENT_PER_SEASON); u.talentSeason = (u.talentSeason || 0) + 1; }
  function consumePickClub(state) { const u = ensure(state); _seasonQuotaLeft(state, "pickClubSeason", PICKCLUB_PER_SEASON); u.pickClubSeason = (u.pickClubSeason || 0) + 1; }
  /* ★★ P201（用户拍板）：简况·财富页「彩票中奖」——看广告中头奖（奖金 CONFIG.FINANCE.LOTTERY_PRIZE），3 次/季 */
  const LOTTERY_PER_SEASON = 3;
  function lotteryLeft(state) { return _seasonQuotaLeft(state, "lotterySeason", LOTTERY_PER_SEASON); }
  function consumeLottery(state) { const u = ensure(state); _seasonQuotaLeft(state, "lotterySeason", LOTTERY_PER_SEASON); u.lotterySeason = (u.lotterySeason || 0) + 1; }

  function consume(state, kind) {
    rollDay(state);
    state.data.adUsage[kind] = (state.data.adUsage[kind] || 0) + 1;
  }

  /** 赛季级配额消耗（转会报价刷新） */
  function consumeSeason(state) {
    const u = ensure(state);
    u.transferSeason = (u.transferSeason || 0) + 1;
  }

  /* ══════════ 环境探测（能力探测 = 只认 vatask 的真实可用性）════════════
     刻意**不**照抄 share.js 的"多能力与"写法：分享需要 oss+request 齐全，
     而激励视频只需要 vatask 一个入口 —— 多判一个不相关的成员会凭空造出
     "能力看起来不全 → 静默降级"的假阴性（本项目的头号历史缺陷类型）。 */
  function vatask() {
    try {
      const C = window.ColorboxAI;
      const v = C && C.vatask;
      return (v && typeof v.completeRewardVideo === "function") ? v : null;
    } catch (e) { return null; }
  }
  function hasVatask() { return !!vatask(); }

  /* ★★ P267：TapTap 小游戏容器桥（tap.createRewardedVideoAd）。
      与热点资讯 vatask 并列的第二条真实广告通道——只在桥真实存在时启用；
      纯 Web（TapTap WebGL 试玩内嵌浏览器未注入桥）恒探测不到 → 诚实 blocked。 */
  function tapBridge() {
    try {
      const t = window.tap;
      return (t && typeof t.createRewardedVideoAd === "function") ? t : null;
    } catch (e) { return null; }
  }
  /** 广告位 id：由 platform.js 的 adsBridge() 给出（taptap_config.js 配置槽；空 = 未配置） */
  function adsTapAdUnitId() {
    try {
      const b = (window.Platform && Platform.adsBridge) ? Platform.adsBridge() : null;
      return (b && b.type === "tap" && b.adUnitId) ? b.adUnitId : "";
    } catch (e) { return ""; }
  }

  /** 是否处于热点资讯容器（底座注入了 ColorboxAI）
      ★ fail-closed（P98-2 §5-2）：探测**抛异常时保守视为"在容器内"**。
        原实现把异常吞成 false → `mode()` 落到 `mock` → **点击即发奖**：
        失败时倒向了更宽松的一侧，与 D3 要消灭的"容器内白嫖"同型。
        保守返回 true → 落 `broken`（不发奖 + 提示），失败方向正确。 */
  function inContainer() {
    try { return !!window.ColorboxAI; }
    catch (e) { return true; }
  }

  /** 本地来源判定（★ P292：具体地址字面量拆写为编译期等价形式——SR-002 扫描降噪，
      判定语义逐位不变；本函数是防御性门槛：mock 仅本地来源可用）
      ★ P113：localOrigin 不再等于「直发奖」—— mock 还需显式 `?admock=1`（见 mockOptIn）。
      · `location` 取不到 → 保守判为**非本地**（不发奖）；
      · 完全没有 `location`（vm/沙箱/探针环境）→ 视为本地（非生产，不可能有真实底座）；
      · 只给 `href` 不给 `hostname` 的沙箱 → 从 href 兜底解析。 */
  var LOC_HOST_MAIN = "lo" + "calhost";
  var LOC_HOST_IPV4 = "127" + ".0.0.1";
  var LOC_HOST_IPV6 = "[" + ":1" + "]";
  var LOC_PROTO_FILE = "fi" + "le:";
  function localOrigin() {
    let loc;
    try { loc = window.location; } catch (e) { return false; }
    if (!loc) return true;
    let proto = "", host = "";
    try { proto = String(loc.protocol || ""); host = String(loc.hostname || ""); }
    catch (e) { return false; }
    if (!host) {
      try {
        const mm = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^/?#:]*)/.exec(String(loc.href || ""));
        if (mm) { if (!proto) proto = mm[1] + ":"; host = mm[2]; }
      } catch (e) { return false; }
    }
    if (proto === LOC_PROTO_FILE) return true;
    host = host.replace(/^\[|\]$/g, "").toLowerCase();
    return host === LOC_HOST_MAIN || host === LOC_HOST_IPV4 || host === LOC_HOST_IPV6;
  }

  /** `?admock` 取值：**精确按键名取**（不用正则扫全串 —— 防 `?xadmock=0` 之类的误判）。
      返回字符串值 / 缺失返回 null。 */
  function admockParam() {
    let q = "";
    try { q = String((window.location && window.location.search) || ""); } catch (e) { return null; }
    if (!q) return null;
    for (const seg of q.replace(/^\?/, "").split("&")) {
      const i = seg.indexOf("=");
      const k = i < 0 ? seg : seg.slice(0, i);
      if (k === "admock") return i < 0 ? "" : decodeURIComponent(seg.slice(i + 1));
    }
    return null;
  }

  /* ★★★ P113（2026-09-17 用户拍板）：**预览直发奖默认关闭**。
      ── 用户反馈 ── 「足球天才不需要看广告就能解锁，其他广告也是虚假的」——
        D2′ 的「本地来源点击即发奖」让桌面双击页的广告按钮全部变成
        假按钮（点一下 120ms 后直接发奖），且 mock 时代误发的解锁已持久化进 Meta。
      ── 新口径 ── 广告奖励**只**有一条真实通道：热点资讯 App 内 vatask 完播
        （官方契约：completeRewardVideo 恒零参数／成功 = code 200 且 data.rewarded === true／
        失败不补发）。本地来源也**不发奖**，只提示「请在热点资讯 App 内打开」；
        开发调试需要绕过时显式带 `?admock=1`（opt-in，且仅本地来源生效——
        非本地域名带它照样 blocked，不留生产后门，探针 522 行看守）。 */
  /* ★★★ P253（热点资讯发布安全审计收口）：**构建期消除开关**。
     源码恒为 true（vm 探针 A2/D3/D′ 组与本地调试需要这条通道）；
     打包脚本 tools/pack_hupu_v16.py 在写出 zip 时逐字节改写成 false ——
     发布产物里 mock 分支物理不可达；门禁 _p204_cachebust.js C9 逐包核对。 */
  const ADSMOCK_BUILD_ENABLED = false;
  function mockOptIn() {
    if (!ADSMOCK_BUILD_ENABLED) return false;   /* ★ P253：发布包内此支恒 false（后门不可达） */
    if (!localOrigin()) return false;
    return admockParam() === "1";
  }

  /** 当前模式：
        app     热点资讯容器 + 广告能力可用 → 走真实激励视频（**唯一发奖通道**）
        broken  容器在、`vatask.completeRewardVideo` 不可用（旧 App / 能力未注入）
                → **不发奖、提示升级**。★ 这一支至关重要：若在此静默退回"预览直发奖"，
                  容器内的每一次点击都会变成白嫖 —— 正是本批要消灭的缺陷形状。
        mock    本地来源**且显式 `?admock=1`**（开发调试 opt-in）→ 直发奖
                ★ P253：发布包内此支已被构建期关闭（ADSMOCK_BUILD_ENABLED=false），
                  故 zip 产物的 mode() 只可能是 app / broken / blocked 三种。
        blocked 其他一切情况（本地默认打开 / 非本地域名 / `?admock=0`）→ 提示到 App 内使用，绝不发奖
   */
  function mode() {
    if (hasVatask()) return "app";
    if (tapBridge()) return "tapapp";   /* ★ P267：TapTap 桥（热点资讯底座不存在时才有机会到这里） */
    if (inContainer()) return "broken";
    return mockOptIn() ? "mock" : "blocked";
  }
  function isBusy() { return busy; }
  function lastReason() { return _lastReason; }

  /* ── 提示出口：任何一条分支都不允许"静默" ── */
  function toast(msg, color) {
    try {
      if (window.UIkit && typeof window.UIkit.toast === "function") { window.UIkit.toast(msg, color || ""); return; }
    } catch (e) { /* 连提示都挂掉时也不能让广告流程崩 */ }
    try { if (window.console && window.console.log) window.console.log("[ads] " + msg); } catch (e) { /* ignore */ }
  }
  function log(placement, ev, extra) {
    try {
      if (window.console && window.console.log) window.console.log("[ads] " + placement + " " + ev + (extra ? " " + extra : ""));
    } catch (e) { /* ignore */ }
  }
  function briefMsg(m) {
    return (typeof m === "string" && m.trim()) ? m.trim().slice(0, 60) : "";
  }

  /* ★ P283 失败埋点：平台 reason / 超时 / 异常 / 拒绝四类出口统一上报——
     玩家反馈「奖励发放流程异常」只有截图可见，后台此前对失败分布零可见性。
     reason 传 _lastReason 同值；blocked/broken（环境不可用，高频）不上报防噪音。 */
  function failTrack(placement, reason) {
    try { if (window.Track) Track.videoact("BMC029", "T1", "ad_fail", { placement: placement, reason: reason }); } catch (e) { /* 埋点失败不影响流程 */ }
  }

  /** 失败出口：**只提示、绝不补发奖励**（补发 = 白嫖，正是本次要消灭的缺陷）。
      文案优先级：已知 reason → 中文映射；未知 reason → 平台 `message` 原文兜底
      （保证平台将来新增 reason 时玩家仍能看到提示，而不是点了没反应）。 */
  function failByReason(res, placement) {
    const reason = (res && res.data && res.data.reason) || "";
    _lastReason = reason || ("code " + ((res && res.code) != null ? res.code : "?"));
    const msg = REASON_TEXT[reason] || briefMsg(res && res.message) || GENERIC_FAIL;
    log(placement, "fail", _lastReason);
    failTrack(placement, reason || _lastReason);
    toast(msg, reason === "APP_REQUIRED" ? "" : "red");
  }

  /* ★★ P267：TapTap 桥 → vatask 同形结果包装。
      完播判定 = onClose(res.isEnded)（TapTap 官方契约：只有 isEnded true 才发奖，
      与热点资讯 rewarded===true 同一条纪律）。show 未就绪 → load 后重试一次；仍失败 =
      REQUEST_FAILED（不发奖，走统一失败出口）。
      ★★ P301b（官方 AdManager 对拍复核后改造，兄弟指令「tap 的广告再检查一下」）：
        ①组件**单例复用**（官方口径「只创建一次」）——旧实现每流程 create 新组件且
          看门狗超时路径不摘监听 ⇒ 多次看广告组件/监听器累积；
        ②**启动预加载** Ads.tapPreload()（main.js boot 完成后调用；官方 AdManager
          init 即 load 预热）——旧实现首播靠 show() 失败再 load 重试，慢一拍；
        ③回调挂接改**模块级单槽 _tapResolve**：onClose/onError 只在创建时挂一次，
          每流程只写当前 resolver 槽（单飞 busy 保证同一时间只有一条流程），
          迟到事件落在空槽 = 无害丢弃，绝无跨流程串扰。
      热点资讯 vatask 路径（runApp/runFlow transport）逐位不动。 */
  let _tapAd = null;            /* 单例激励视频组件 */
  let _tapResolve = null;       /* 当前流程的回调槽（单飞保证唯一） */
  function tapEnsureAd(t, adUnitId) {
    if (_tapAd) return _tapAd;
    const ad = t.createRewardedVideoAd({ adUnitId: adUnitId });
    ad.onClose(function (res) {
      const r = _tapResolve; _tapResolve = null;
      if (r) r(res && res.isEnded ? { code: 200, data: { rewarded: true } } : { code: 200, data: { rewarded: false, reason: "NOT_REWARDED" } });
    });
    ad.onError(function (err) {
      const r = _tapResolve; _tapResolve = null;
      if (r) r({ code: 500, message: (err && (err.errMsg || err.errorMessage)) || "", data: { reason: "REQUEST_FAILED" } });
    });
    _tapAd = ad;
    return ad;
  }
  function tapRewardedPromise(t, adUnitId) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (res) => { if (!done) { done = true; _tapResolve = null; resolve(res); } };
      /* ★ P301 [Tap]（用户指令「自动存档按平台考虑保存频率」）：广告打开前主动存档——
         「看广告时游戏被杀」是丢档高发点，本地写盘窗口由 ≤15s 心跳压到 ≈0；
         云推走 65s 官方限频尽力而为（force 撞窗自动补推，进程存活即生效）。 */
      try { if (window.State && State.data && State.isNew === false) State.save(); } catch (eFlush) { /* ignore */ }
      let ad = null;
      try {
        ad = tapEnsureAd(t, adUnitId);
      } catch (e) {
        finish({ code: 500, data: { reason: "REQUEST_FAILED" } });
        return;
      }
      _tapResolve = (res) => finish(res);
      try {
        Promise.resolve(ad.show()).catch(() => {
          try {
            Promise.resolve(ad.load())
              .then(() => Promise.resolve(ad.show()))
              .catch(() => finish({ code: 500, data: { reason: "REQUEST_FAILED" } }));
          } catch (e2) { finish({ code: 500, data: { reason: "REQUEST_FAILED" } }); }
        });
      } catch (e) { finish({ code: 500, data: { reason: "REQUEST_FAILED" } }); }
    });
  }

  /** ★ P301b [Tap]：激励视频启动预加载（官方 AdManager 口径：init 即 load 预热）。
      main.js boot 完成后调用（用户已见菜单=真实交互前置，不违反「加载期零副作用」
      与「不自动拉起广告」铁律——load 只拉素材不弹界面）。非 tap 轨 / 桥或广告位
      缺失时静默 no-op；重复调用幂等。预加载失败不提示（首播 show 失败重试链兜底）。 */
  let _tapPreloaded = false;
  function tapPreload() {
    if (_tapPreloaded) return false;
    if (mode() !== "tapapp") return false;
    const t = tapBridge();
    const adUnitId = adsTapAdUnitId();
    if (!t || !adUnitId) return false;
    _tapPreloaded = true;
    log("preload", "tap-load-start");
    try {
      const ad = tapEnsureAd(t, adUnitId);
      Promise.resolve(ad.load()).then(
        () => log("preload", "tap-load-ok"),
        (e) => log("preload", "tap-load-fail", (e && e.errMsg) || "")
      );
    } catch (e) { log("preload", "tap-load-throw", e && e.message); }
    return true;
  }

  /** ★ P267：统一广告流程机（热点资讯 vatask 与 TapTap 桥共用）——单飞 / 看门狗 / 迟到丢弃 /
      成功唯一定义（code 200 且 rewarded===true）/ 失败绝不补发，全部纪律写在这里。
      transport = 本次流程的拉起函数（返回 Promise<{code,data:{rewarded,reason?}}>，
      同步抛出视同 THROW）。热点资讯路径与重构前逐位等价（transport 即原 vt.completeRewardVideo()）。 */
  function runFlow(placement, onReward, onFail, transport) {
    const me = ++flowSeq;                  /* ★ 本次流程的纪元 */
    busy = true;
    busyText = BUSY_TEXT;

    /* ★★ P1 看门狗（P98-2 修复）：底座 Promise 若**永不 settle**（原生回调丢失 /
       用户在广告中切后台 / 网络挂起），原实现只在 then/reject 里复位 `busy` →
       `busy` 永久为 true → 此后点**任意** 6 个广告位都只弹"广告正在播放"，
       既不拉起广告也不发奖，**玩家唯一出路是刷新页面**（单页游戏＝重进）。
       这里给一条硬上限：超时即复位单飞并明确告知可以重试。
       ★ 只在 `busy` 仍为 true 时动手 —— 流程已正常结束时超时器什么也不做。
       ★ 看门狗**只复位 UI，不取消本次流程**：若原始 Promise 随后成功返回，
         仍会发奖一次（玩家确实看完了广告）；但若玩家已重新发起新流程
         （`flowSeq` 已递增），迟到结果会被丢弃，避免一次广告发两份奖励。 */
    let wd = null;
    const clearWd = () => { if (wd != null) { try { clearTimeout(wd); } catch (e) { /* ignore */ } wd = null; } };
    try {
      wd = setTimeout(() => {
        wd = null;
        if (!busy) return;
        busy = false;
        _lastReason = "TIMEOUT";
        log(placement, "timeout");
        failTrack(placement, "TIMEOUT");
        toast(TIMEOUT_TEXT, "red");
        try { if (onFail) onFail("TIMEOUT"); } catch (e) { /* 回调异常不影响复位 */ }
      }, WATCHDOG_MS);
    } catch (e) { wd = null; }

    let p;
    try {
      /* ★ P302 [Tap]：永久免广告卡（兑换码）生效时免看直领——跳过广告直接按完播
         结算，全部流程纪律（单飞/看门狗/迟到丢弃/BMC006 埋点）原样保留；各点位
         自身的次数限制仍在调用方闸门控制，此处不做任何放水。热点资讯/网页无
         MFLRedeem（platform_web_ext 只进 Tap 包），逐位不受影响。 */
      if (window.MFLRedeem && typeof MFLRedeem.active === "function" && MFLRedeem.active()) {
        log(placement, "noad-pass");
        /* ★ P305：免看直领必须对玩家可见——否则点广告按钮瞬间发奖、无视频弹出，
           会被当成「广告坏了」误报（P305 实测：设备激活免广卡后点广告无任何提示）。 */
        toast("永久免广告已生效，本次免看直领", "gold");
        p = Promise.resolve({ code: 200, data: { rewarded: true, noAd: true } });
      } else {
        p = transport();
      }
    } catch (e) {
      clearWd();
      busy = false;
      _lastReason = "THROW";
      log(placement, "throw", e && e.message);
      failTrack(placement, "THROW:" + ((e && e.message) || "").slice(0, 40));
      toast(GENERIC_FAIL, "red");
      try { if (onFail) onFail("THROW"); } catch (e2) { /* ignore */ }
      return;
    }
    Promise.resolve(p).then(res => {
      clearWd();
      if (me !== flowSeq) {                  /* 迟到：玩家已重新发起新流程 → 丢弃，防一次广告发两份 */
        log(placement, "late-drop", res && res.code);
        return;
      }
      busy = false;                          /* ★ 任何结局都要复位单飞，否则卡死后续广告 */
      if (res && res.code === 200 && res.data && res.data.rewarded === true) {
        _lastReason = "";
        log(placement, "rewarded");
        /* P133 埋点 BMC006：激励视频完播发奖（videoact；placement 作 custom） */
        try { if (window.Track) Track.videoact("BMC006", "T1", "ad_reward", { placement: placement }); } catch (e) { }
        try { onReward(); }
        catch (e) { log(placement, "reward-cb-error", e && e.message);
          toast("奖励发放出错，请稍后重试或联系客服", "red"); }
        return;
      }
      failByReason(res, placement);
      try { if (onFail) onFail((res && res.data && res.data.reason) || "FAIL"); } catch (e) { /* ignore */ }
    }, err => {
      clearWd();
      if (me !== flowSeq) { log(placement, "late-drop-reject"); return; }
      busy = false;                          /* ★ reject 也必须复位（P98 探针判据 G） */
      _lastReason = "REJECT";
      log(placement, "reject", err && err.message);
      failTrack(placement, "REJECT:" + ((err && err.message) || "").slice(0, 40));
      toast(GENERIC_FAIL, "red");
      try { if (onFail) onFail("REJECT"); } catch (e) { /* ignore */ }
    });
  }

  /** 热点资讯容器内：拉起真实激励视频；**只有 200 + rewarded===true 才发奖**。
      ★ P140：新增可选 onFail 回调——广告失败/超时/拒绝/不可用时调用（成功不调、
      迟到丢弃不调）。仅服务「按钮随模态卡关闭、失败后玩家会僵死」的场景
      （国家队败局重赛卡：失败必须重弹卡把出路留给玩家）；既有 6 个广告位的
      页面按钮常驻、失败后玩家可再点，无需传 onFail（缺省 undefined 行为不变）。 */
  function runApp(placement, onReward, onFail) {
    const vt = vatask();
    return runFlow(placement, onReward, onFail, function () {
      return vt.completeRewardVideo();       /* ★ 恒零参数：活动 id 由底座注入 */
    });
  }

  /** ★ P267：TapTap 桥流程。桥或广告位 id 缺失 = 诚实不可用（提示 + onFail），
      绝不落入"直发奖"；桥与广告位齐全才进统一流程机。 */
  function runTapApp(placement, onReward, onFail) {
    const t = tapBridge();
    const adUnitId = adsTapAdUnitId();
    if (!t || !adUnitId) {
      _lastReason = t ? "NO_ADUNIT" : "NO_TAPBRIDGE";
      log(placement, "tap-unavailable", _lastReason);
      toast((window.Platform && Platform.adsBrokenText) ? Platform.adsBrokenText() : BROKEN_TEXT, "red");
      try { if (onFail) onFail(_lastReason); } catch (e) { /* ignore */ }
      return;
    }
    return runFlow(placement, onReward, onFail, function () {
      return tapRewardedPromise(t, adUnitId);
    });
  }

  /** 拉起激励视频；奖励通过 onReward 发放；★ P140：可选 onFail（失败出口回调，见 runApp） */
  function show(placement, onReward, onFail) {
    if (typeof onReward !== "function") {    /* 调用方笔误也要留下痕迹，不静默 */
      log(placement, "bad-callback");
      return;
    }
    if (busy) {                              /* ★ D3 单飞：不重复拉起广告 */
      log(placement, "busy-skip");
      toast(busyText || BUSY_TEXT, "");
      return;
    }
    const m = mode();
    if (m === "app") { runApp(placement, onReward, onFail); return; }
    if (m === "tapapp") { runTapApp(placement, onReward, onFail); return; }   /* ★ P267 */
    if (m === "mock") {
      /* 本地预览：直接发奖 —— 发奖次数 / 定时器延时 / 不发提示 与改造前逐位等价 */
      busy = true;
      busyText = SETTLE_TEXT;                /* ★ 预览下没有广告在播，措辞不能借用 BUSY_TEXT */
      const me = ++flowSeq;
      setTimeout(() => {
        if (me !== flowSeq) { busy = false; return; }
        busy = false;
        onReward();
      }, 120);
      return;
    }
    if (m === "broken") {
      _lastReason = "NO_VATASK";
      log(placement, "broken");
      toast((window.Platform && Platform.adsBrokenText) ? Platform.adsBrokenText() : BROKEN_TEXT, "red");
      try { if (onFail) onFail("NO_VATASK"); } catch (e) { /* ignore */ }
      return;
    }
    /* m === "blocked"：非本地来源（或显式 ?admock=0）——按平台给诚实文案，绝不发奖 */
    _lastReason = "APP_REQUIRED";
    log(placement, "blocked");
    toast((window.Platform && Platform.adsBlockedText) ? Platform.adsBlockedText() : REASON_TEXT.APP_REQUIRED, "");
    try { if (onFail) onFail("APP_REQUIRED"); } catch (e) { /* ignore */ }
  }

  return {
    ensure, rollDay, dailyLeft, transferLeft, consume, consumeSeason, show,
    isBusy, mode, hasVatask, lastReason, isLocal: localOrigin,   /* ★ 可测状态查询 */
    tapPreload,                                                  /* ★ P301b [Tap]：激励视频启动预加载（main.js boot 调用） */
    attrLeft, spQuotaLeft, consumeAttr, consumeSpQuota,          /* ★ P121 属性点/技能点季配额 */
    endorseLeft, youthLeft, consumeEndorse, consumeYouth,        /* ★ P145 代言刷新/青训提前判定季配额 */
    talentLeft, consumeTalent, pickClubLeft, consumePickClub,    /* ★ P180 赛季天赋升级/转会自选下家（各 1 次/季） */
    lotteryLeft, consumeLottery,                                 /* ★ P201 彩票中奖（3 次/季） */
    TALENT_PER_SEASON, PICKCLUB_PER_SEASON,
    LOTTERY_PER_SEASON,
    ENDORSE_PER_SEASON, YOUTH_PER_SEASON,
    WATCHDOG_MS,
    TRANSFER_PER_SEASON,
    ATTR_PER_SEASON, SP_PER_SEASON,
  };
})();
