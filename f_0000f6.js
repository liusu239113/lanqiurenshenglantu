/* ============================================================================
   事件卡引擎 — 比赛间隙抉择系统（对标篮球版管线：条件筛选 → 配额门控 → 抽卡 →
   抉择 → 效果写入；赛前卡额外写模拟消费键 _ecSim 供 MatchEngine 消费）
   配额（足球 38 轮校准）：L1 每半季≤4 / L2 每半季≤3 · 两卡间隔≥3轮（关键战降为1）
   · 同类 category 冷却 8 轮 · once/seasonOnce 整生涯/整赛季唯一
   ============================================================================ */
(function () {
  const $ = s => document.querySelector(s);
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&#39;" }[c]));
  }
  const BASE_CARDS = () => window.EVENT_CARDS || { post: [], pre: [], kicker: {}, ART_DIR: "assets/comic/ec_" };
  /* P56：G 组日常池 = 环境卡克隆（剥离 once，改由「单卡冷却」约束）+ 新写日常卡。
     克隆而非直接引用：环境卡在 post 池里仍是整生涯一次的叙事卡，两处语义不互相污染。 */
  const DAILY = () => (window.AMBIENT_CARDS || []).concat(window.AMBIENT2_CARDS || [])
    .map(c => Object.assign({}, c, { once: null, seasonOnce: null, stage: "daily" }))
    .concat(window.DAILY_CARDS || []);
  const EC = () => {
    const base = BASE_CARDS();
    const extra = (window.ECHO_SEEDS || []).concat(window.MAINLINE_BRANCHES || [])
      .concat(window.MAINLINE_BRANCHES2 || []).concat(window.MAINLINE_BRANCHES3 || []).concat(window.MAINLINE_BRANCHES4 || []).concat(window.WINTER_CARDS || []).concat(window.LEAGUE_CARDS || [])
      .concat(window.LEAGUE_CARDS2 || []).concat(window.LEAGUE_CARDS3 || [])
      .concat(window.LEAGUE_CARDS4 || [])
      .concat(window.LEAGUE_CARDS5 || [])
      .concat(window.LEAGUE_FINAL_CARDS || [])
      .concat(window.AMBIENT_CARDS || []).concat(window.AMBIENT2_CARDS || [])
      .concat(window.CUP_CARDS || []).concat(window.CUP_CARDS2 || []).concat(window.CC_CARDS || []).concat(window.CC2_CARDS || []).concat(window.SCC_CARDS || []).concat(window.INJURY_CARDS || []).concat(window.INJURY2_CARDS || []).concat(window.INJURY3_CARDS || []).concat(window.LEGACY2_CARDS || [])
      .concat(window.LEGACY_CARDS || []);
    return Object.assign({}, base, {
      /* ★ P136（E 组）：赛前池扩容接线——data_pre_extra.js（18 张）并入 pre 池 */
      pre: (base.pre || []).concat(window.PRE_EXTRA || []),
      post: base.post.concat(extra),                                    // 仅扩展 post 池
      offseason: (base.offseason || []).concat(window.OFFSEASON_EXTRA || [])
      .concat(window.OFF3_DAILY || []).concat(window.OFF3_YOUTH || []).concat(window.OFF3_COMM || []).concat(window.OFF4_DAILY || []).concat(window.OFF4_YOUTH || []).concat(window.OFF4_COMM || []),  // P3+P16+P20：休赛期池扩展
      intl: (base.intl || []).concat(window.INTL_EXTRA || []).concat(window.INTL_EXTRA2 || []).concat(window.TOURNEY_CARDS || []), // P4+P18：国家队窗口+大赛年
      transfer: (base.transfer || []).concat(window.TRANSFER_EXTRA || []),              // P15：转会窗池扩展
      daily: (base.daily || []).concat(DAILY()),                                        // P56：G 组日常池（非比赛日）
    });   // 其余组原样保留
  };

  /**
   * P101：连续状态真值门（minConsecStarts/minConsecBench/minConsecGoals，
   *        真值源 = settlement.applyResult 维护的 d.consec*，俱乐部口径）。
   * P56：轮次归一。
   * 杯赛 / 洲际淘汰赛 / 国家队 fixture 都没有 round 字段，原先直接回落 dayIndex
   * （联赛日间隔恰好 8 天，故 dayIndex ≈ 8 × 联赛轮次）。后果是 _ec.lastRound 被抬到
   * 一个赛季内再也追不上的高度 —— 一旦本赛季出过一张杯赛卡，此后所有联赛场次
   * 的 `ctx.round - lastRound` 恒为负，抽卡静默失效。
   * 统一折算为「虚拟联赛轮次」即可修复，且不改变原有间隔阈值语义。
   */
  function roundOf(fx, d) {
    if (fx && fx.round) return fx.round;
    return Math.round((((d || {}).dayIndex) || 0) / 8);
  }

  /* ── 计数状态（存档内持久化） ── */
  function ensure(d) {
    d.flags = d.flags || {};
    d._ec = d._ec || { season: 0, L1: 0, L2: 0, lastRound: -99, catRound: {}, once: {} };
    if (d._ec.dailyRound == null) d._ec.dailyRound = -999;   // P56：日常卡全局间隔锚点（dayIndex）
    d._ec.dailyLast = d._ec.dailyLast || {};                 // P56：单卡冷却表
    d.echoQueue = d.echoQueue || [];      // 回响队列 [{id, due}]（P1：策划案 G13）
    d._ml = d._ml || { next: 1 };         // 主线十二章进度（P2：下一章序号）
    if (d._ec.season !== d.season) {
      // 新赛季：轮次从 1 重新计数，间隔/冷却/半季配额全部重置（once 保留=整生涯唯一）
      d._ec.season = d.season;
      d._ec.L1 = 0; d._ec.L2 = 0;
      d._ec.lastRound = -99; d._ec.catRound = {};
      d._ec.L1_h0 = 0; d._ec.L1_h1 = 0; d._ec.L2_h0 = 0; d._ec.L2_h1 = 0;
      d._ec.dailyRound = -999; d._ec.dailyLast = {};   // P56：日常卡按赛季重置（dayIndex 也按赛季归零）
    }
    return d._ec;
  }

  /* ── 条件评估：when = {res, minMargin, maxMargin, minRound, maxRound, goalsMin,
        ratingMin, motm, cup, derby, intl, minApps, maxApps, minSeason,
        starter, careerAppsMin, careerAppsMax,
        band, ageMin, ageMax} ──
        ★ P107（2026-09-17）：`band` = 生命周期段（CONFIG.CAREER_BANDS 的 id），
          事件分组的推荐写法；`ageMin`/`ageMax` = 低阶年龄原语（与 band 可叠加）。 */
  /* ── `minSeason` 的真值源（**唯一换算点**）────────────────────────────────
     ★★★ P107（2026-09-17）：此前 `when.minSeason` 直接比 `d.season`，而 `d.season` 是
     **年份**（2014 起，core.js:79）⇒ `2014 >= 2` 恒真：全仓 631 处门集体失效
     （实证 tools/_p107_lifecycle_audit.js R1）。
     ★★ 为什么真值源选「**职业**赛季序号」而不是「总赛季序号（年份 - 起始年 + 1）」：
       ① **作者原意**：这些门写于 P99（14 岁统一开局）之前，当时的生涯是从职业起步的
          ⇒ "第 N 个赛季" 的口径本来就是职业赛季；
       ② **自动实现"严格分组"**：青训期 `d.stats.seasonsPlayed` **恒为 0**
          （youth.js 结算不递增，J5）⇒ 428 张声明 `minSeason ≥ 2` 的"成年联赛语境"卡
          自动被挡在青训期之外 —— 这正是用户要的（实证：14 岁弹出「宿敌退役当解说」）；
       ③ **口径统一**：与 milestone 层（data_ms4 的 `cond: seasonsPlayed >= 8`）
          同口径，不再"两层各算一套赛季"（口径铁律：T 与 K 必须同口径）。
     ★ 语义：`minSeason: N` = 从**第 N 个职业赛季**起可抽。
        N = 1 在青训期与首个职业赛季都成立（= 无赛季限制，与历史行为一致）。 */
  function seasonNoOf(d) {
    return ((d.stats && d.stats.seasonsPlayed) || 0) + 1;
  }

  /* ── 相位判据的**本地守卫入口** ──────────────────────────────────────────
     ★ 唯一真相源仍是 `CONFIG.isProContract`（config.js 定义）。
     ★★ 为什么这里还要包一层：本项目多个探针（如 tools/_p97_mainline_probe.js）
        只 `window.CONFIG = window.CONFIG || {}` 就装载 eventcards.js ——
        它们**不加载 config.js**，于是任何新增的 CONFIG 成员在探针里都是 undefined，
        直接调用 ⇒ `TypeError: CONFIG.isProContract is not a function` ⇒ 探针整块崩。
        （已知同族先例：P104 的 `Career.agentFeeOf` 必须写成 `(window.Career && Career.agentFeeOf)`。）
     ★ 兜底分支与 CONFIG 实现**逐字同义**（phase === "senior" ∨ flags.firstProContract）；
        它只在"CONFIG 缺席"的测试环境生效，生产路径永远走 CONFIG。 */
  function proContractOf(d) {
    if (window.CONFIG && typeof CONFIG.isProContract === "function") return CONFIG.isProContract(d);
    return !!(d && (d.phase === "senior" || (d.flags && d.flags.firstProContract)));
  }

  function pass(when, ctx, d) {
    if (!when) return true;
    if (when.res && ctx.res !== when.res) return false;
    if (when.minMargin != null && !(ctx.margin >= when.minMargin)) return false;
    if (when.maxMargin != null && !(ctx.margin <= when.maxMargin)) return false;
    if (when.minRound != null && !(ctx.round >= when.minRound)) return false;
    if (when.maxRound != null && !(ctx.round <= when.maxRound)) return false;
    if (when.goalsMin != null && !((ctx.userGoals || 0) >= when.goalsMin)) return false;
    if (when.ratingMin != null && !((ctx.rating || 0) >= when.ratingMin)) return false;
    if (when.motm && !ctx.motm) return false;
    /* ★ 2026-09-16（用户反馈：「生涯第一次首发」类文案说谎）：when.starter =
       本场是否首发（真值源 settlement.ecCtxOf 的 ctx.userStarter ← MatchEngine.userStarter）。
       「第一次/首个」类断言一律挂真值门，不靠 once 旗标兜底 —— once 只防重复，不防"过晚触发"。 */
    if (when.starter && !ctx.userStarter) return false;
    /* ★★ P116（用户拍板「没有的比赛就不要凭空捏造」）：when.played = 本场是否出场
       （真值源 settlement.ecCtxOf 的 ctx.played ← engine.result.played）。
       赛后卡里凡断言「你首发/替补登场/踢满/你打进」等**出场事实**的，一律挂
       played:true —— 未出场的场次的赛后卡池直接不含它们（宁可卡不弹，不可卡说谎）。
       when.assistsMin：助攻数精确门（「你送出两次助攻」类断言的真值门）。 */
    if (when.played != null && (!!ctx.played) !== !!when.played) return false;
    if (when.assistsMin != null && !((ctx.userAssists || 0) >= when.assistsMin)) return false;
    if (when.cup && !ctx.isCup) return false;
    if (when.derby && !ctx.isDerby) return false;
    if (when.intl && !ctx.isIntl) return false;
    if (when.minApps != null && !((d.seasonStats ? d.seasonStats.apps : 0) >= when.minApps)) return false;
    if (when.maxApps != null && !((d.seasonStats ? d.seasonStats.apps : 0) <= when.maxApps)) return false;
    /* ★★★ P107 修复（2026-09-17）：`minSeason` 此前直接比 `d.season` ——
       而 `d.season` 是**年份**（2014 起，core.js:79 = CONFIG.SEASON_START_YEAR）
       ⇒ `2014 >= 2` 恒真：全仓 631 处 minSeason 门**集体失效**（写不写一个样）。
       用户实测证据：14 岁青训期弹出 `lg_farewell_rival_tribute`（「宿敌的退役致敬视频」，
       门写 minSeason:12 —— 它本该等到生涯第 12 季）。
       ⇒ 改用 `seasonNoOf(d)`（真值源与理由见该函数的函数头注释）。
       ★★ 注意：本项修复后 `minSeason` 才第一次真正生效 ⇒ 首季/青训期可抽卡池会显著收窄，
          这是**设计内**（用户拍板「严格分组」），不是回归。 */
    if (when.minSeason != null && !(seasonNoOf(d) >= when.minSeason)) return false;
    /* ★★★ P107 新增（2026-09-17 用户拍板：「事件严格分组」）：**生命周期段门**。
       五段 = 青训期 / 21岁前 / 27岁前 / 33岁前 / 33岁后（CONFIG.CAREER_BANDS 单一真相源）。
       ★ 未知 band 值 ⇒ **挡**（失败安全方向：宁可不弹，不可弹错；
         拼错由探针 R3 报红，不会静默退化成"永不出现的卡"）。 */
    if (when.band != null) {
      const _b = (window.CONFIG && CONFIG.bandOf) ? CONFIG.bandOf(when.band) : null;
      if (!_b) return false;
      if (_b.phase && _b.phase !== (proContractOf(d) ? "senior" : "youth")) return false;
      const _age = (d.player && d.player.age) || 0;
      if (_b.ageMin != null && !(_age >= _b.ageMin)) return false;
      if (_b.ageMax != null && !(_age <= _b.ageMax)) return false;
    }
    /* ★ P107 低阶原语：精确年龄门（真值源 = d.player.age）。
       与 band 的关系：band 是"设计分段"（推荐），ageMin/ageMax 是"临时精确控制"。 */
    if (when.ageMin != null && !(((d.player && d.player.age) || 0) >= when.ageMin)) return false;
    if (when.ageMax != null && !(((d.player && d.player.age) || 0) <= when.ageMax)) return false;
    /* ★ 2026-09-16：生涯累计出场门（真值源 = d.stats.apps 生涯账本，与 chapters.js
       caps100 / milestone 层同源）。★ 注意与上面 minApps/maxApps 的区别：
       那两个读 **赛季** d.seasonStats.apps（"本赛季站稳脚跟"类），
       这两个读 **生涯** d.stats.apps（"第一百场正式比赛"类精确断言）。
       精确值（如恰好第 100 场）用 careerAppsMin === careerAppsMax 表达；
       若那一场不是符合条件的比赛，卡**永久休眠** —— 宁可不弹也不说谎。 */
    if (when.careerAppsMin != null && !((d.stats && d.stats.apps || 0) >= when.careerAppsMin)) return false;
    if (when.careerAppsMax != null && !((d.stats && d.stats.apps || 0) <= when.careerAppsMax)) return false;
    /* ★ P101（2026-09-16）：「连续X场替补/首发/进球」类卡的文案断言必须与模拟一致，
       一律挂 minConsec* 门（真值源见 settlement.applyResult 的 d.consec* 记账）。 */
    if (when.minConsecStarts != null && !((d.consecStarts || 0) >= when.minConsecStarts)) return false;
    if (when.minConsecBench != null && !((d.consecBench || 0) >= when.minConsecBench)) return false;
    if (when.minConsecGoals != null && !((d.consecGoals || 0) >= when.minConsecGoals)) return false;
    if (when.minConsecNoGoal != null && !((d.consecNoGoal || 0) >= when.minConsecNoGoal)) return false;
    /* ★ 2026-09-16（用户反馈：门将抽到「和门将的赌约」）：事件池此前无位置维度。
       when.pos = 白名单（仅这些位置可抽）；when.posExclude = 黑名单。选卡是
       先过滤后随机 ⇒ 加门/加 GK 专属卡只影响门将档候选集，场上档随机流零扰动。 */
    if (when.pos && (!d.player || when.pos.indexOf(d.player.position) < 0)) return false;
    if (when.posExclude && d.player && when.posExclude.indexOf(d.player.position) >= 0) return false;
    /* ★ P101-3（2026-09-16）：「签职业合同/经纪人谈合同/代言合同」类断言卡的相位门 ——
       学徒期（academy+jump，未成年）不可抽。
       ★ P107（2026-09-17）：判据收敛到 `CONFIG.isProContract`（唯一真相源）——
         此前这段与 `spineCondOk` 各写一份同样的表达式（双源，改一处必分叉）。 */
    if (when.proContract != null) {
      if (when.proContract !== proContractOf(d)) return false;
    }
    /* ★ P97：`ovrMin` 在 `when` 里此前**完全没被处理** —— 声明了它的卡
       （`data_branches2.js` 的 mlb2_star_pressure 74 / mlb2_media_star 76）
       等于没有这条门槛、提前就发。与 `spineCondOk` 统一口径。 */
    if (when.ovrMin != null && !(ovrOf(d) >= when.ovrMin)) return false;
    // 引擎旗标（P4 杯赛系）：ctx.eng / ctx.cupStage / ctx.cupFinal
    const eng = ctx.eng || {};
    if (when.htDown3 != null && !!(eng.htDown3) !== !!when.htDown3) return false;
    if (when.lastMinGoal != null && !!(eng.lastMinGoal) !== !!when.lastMinGoal) return false;
    if (when.sentOff != null && !!(eng.sentOff) !== !!when.sentOff) return false;
    if (when.pensWon && eng.pensWon !== when.pensWon) return false;
    if (when.cupStage != null && ctx.cupStage !== when.cupStage) return false;
    if (when.cupFinal != null && !!(ctx.cupFinal) !== !!when.cupFinal) return false;
    // 洲际旗标（P11c G4/G5）：ccLeague=true 限定联赛阶段 / ccRound 限定具体轮次 / ccStage 0-3 / ccFinal
    if (when.ccLeague != null) {
      const inCcLeague = ctx.ccLeague != null;
      if (when.ccLeague === true && !inCcLeague) return false;
      if (when.ccLeague === false && inCcLeague) return false;
    }
    if (when.ccRound != null && ctx.ccLeague !== when.ccRound) return false;
    if (when.ccStage != null && ctx.ccStage !== when.ccStage) return false;
    if (when.ccFinal != null && !!(ctx.ccFinal) !== !!when.ccFinal) return false;
    if (when.sccStage != null && ctx.sccStage !== when.sccStage) return false;
    if (when.sccFinal != null && !!(ctx.sccFinal) !== !!when.sccFinal) return false;
    /* ★ P136（事件审计 A 组）：点球主罚真值门 —— ctx.userPen ∈ scored/missed/notaken/null
       （settlement.js 两条路径同口径注入）。「你罚进/你罚丢」类断言一律挂本门。 */
    if (when.userPen != null && (ctx.userPen || null) !== when.userPen) return false;
    /* ★ P136：零封真值门（settlement.ecCtxOf 注入，常规时间失球=0）。「零封」类断言专用。 */
    if (when.cleanSheet != null && (!!ctx.cleanSheet) !== !!when.cleanSheet) return false;
    // 大赛年旗标（G7）
    if (when.intlComp != null && ctx.intlComp !== when.intlComp) return false;
    if (when.intlStage != null && ctx.intlStage !== when.intlStage) return false;
    if (when.intlKO != null && !!(ctx.intlKO) !== !!when.intlKO) return false;
    if (when.intlFinal != null && !!(ctx.intlFinal) !== !!when.intlFinal) return false;
    if (when.intlKoStage != null && ctx.intlKoStage !== when.intlKoStage) return false;
    if (when.majorTournament != null && !!(ctx.majorTournament) !== !!when.majorTournament) return false;
    if (when.month != null && ((d.date && d.date.month) || 0) !== when.month) return false; // P24：月份语境（冬窗=1 等）
    if (when.justReturned != null && !!(ctx.justReturned) !== !!when.justReturned) return false;
    if (when.heavyReturn && !(ctx.justReturned && ctx.lastInjDays >= 30)) return false;
    if (when.maxLastInj != null && !((ctx.lastInjDays || 0) <= when.maxLastInj)) return false;
    if (when.injured != null && !!(ctx.injured) !== !!when.injured) return false;   // P56：伤病期专属日常卡
    if (when.favorStar != null && !!(window.StarFavor && StarFavor.hasSocialStar(d)) !== !!when.favorStar) return false; // P64：需要可互动的池内球星
    return true;
  }

  function pick(pool, ctx, d, usedCount) {
    const cands = pool.filter(c =>
      pass(c.when, ctx, d)
      && !(c.once && d._ec.once[c.once])
      && !(c.seasonOnce && d._ec.once[c.season + "_" + c.id])
      && (usedCount[c.tier] || 0) < quotaOf(c.tier, ctx)
      && ctx.round - (d._ec.catRound[c.cat] || -99) >= 8);
    return cands.length ? cands[R.int(0, cands.length - 1)] : null;
  }

  function quotaOf(tier, ctx) {
    const keyMatch = ctx.isCup || ctx.isDerby || ctx.isIntl;
    return tier === "L1" ? 4 : 3; // 每半季上限（足球 38 轮 = 两个半季）
  }

  /* ── 通用抽卡（M2.5：A/B/C/D/E/F 六组共用同一条管线） ── */
  function drawCard(state, poolName, ctx, opts) {
    const d = state.data;
    ensure(d);
    const ec = d._ec;
    const pool = EC()[poolName] || [];
    if (!pool.length) return null;
    const keyMatch = ctx.isCup || ctx.isDerby || ctx.isIntl;
    /* ★ P158：赛后普通池默认间隔 1/3 → 2/4（关键场隔场出、联赛每 4 轮）——
       与间隔预算（PACE.CAP=2）配合，把「场场弹卡」压成「偶尔调剂」。 */
    const requiredGap = (opts && opts.gap != null) ? opts.gap : (keyMatch ? 2 : 4);
    if (ctx.round - ec.lastRound < requiredGap) return null;
    const half = (d.seasonStats ? d.seasonStats.apps : 0) < 19 ? 0 : 1;
    const used = { L1: ec["L1_h" + half] || 0, L2: ec["L2_h" + half] || 0 };
    // 无 tier 卡（赛前组）走第三轮：不占半季配额，只受间隔/类别冷却约束
    let card = pick(pool.filter(c => c.tier === "L1"), ctx, d, used)
      || pick(pool.filter(c => c.tier === "L2"), ctx, d, used)
      || pick(pool.filter(c => !c.tier), ctx, d, used);
    if (!card) return null;
    if (card.tier === "L1") { ec.L1++; ec["L1_h" + half] = used.L1 + 1; }
    else if (card.tier === "L2") { ec.L2++; ec["L2_h" + half] = used.L2 + 1; }
    ec.lastRound = ctx.round;
    ec.catRound[card.cat] = ctx.round;
    if (card.once) ec.once[card.once] = true;
    if (card.seasonOnce) ec.once[d.season + "_" + card.id] = true;
    return card;
  }

  /* ── 里程碑层（融合第二批③：Analyzer 式优先调度）──
     确定性条件触发：无随机、不占 L1/L2 配额、不受间隔限制，优先于一切抽卡。
     once 守卫复用 d._ec.once。落地即记 once，保证一生一次。 */
  const MILESTONES = [
    /* ★★ 2026-09-16 移除（用户实测："没进球却弹生涯首球"+"第一次进球反复出现"）：
       `ms_first_goal` / `ms_hat_trick` 与 chapters.js 章回卡（first_goal / hatrick）
       **同事件双发** —— 同一场比赛弹两张卡 = "反复出现"的根源。
       首球/帽子戏法唯一承载 = 章回层（已加"青训期整族不检查"相位门，见 chapters.js check）。
       ★ `ms_first_goal` 旧判据是算术洞（账本未更新时 `0-1<=0` 恒真 ⇒ 青训期照弹）—— 一并作废。
       ★ 老存档 `_ec.once.ms_first_goal` 残留旗标无害（卡不存在 = 遍历不到）。 */
    { once: "ms_50", cat: "成就", art: "ec_tifo", tier: "milestone",
      title: "生涯 50 球",
      body: "第 50 球落袋。五十粒进球写进俱乐部史册，也刻进你的传奇——距离传说，又近了一步。",
      fx: { morale: 8, fame: 1200 },
      cond: (ctx, d) => (d.stats.goals || 0) >= 50 },
    /* ★★ 2026-09-16 移除：`ms_100apps` 与章回 `caps100`（百场里程碑）同事件双发。
       百场唯一承载 = 章回层。 */
  ];

  function pickMilestone(ctx, d) {
    EventCards.ensure(d);   // _ec 未初始化时兜底（milestone 在 drawCard 之前判定）
    const ALL_MS = MILESTONES.concat(window.MS_EXTRA || []).concat(window.MS_EXTRA2 || []).concat(window.MS_EXTRA3 || []);
    for (const ms of ALL_MS) {
      if (d._ec.once[ms.once]) continue;
      let ok = false;
      try { ok = ms.cond(ctx, d); } catch (e) { ok = false; }
      if (ok) {
        d._ec.once[ms.once] = true;
        return { id: ms.once, tier: "milestone", cat: ms.cat, art: ms.art, once: ms.once,
          title: ms.title, body: ms.body, fx: ms.fx, _source: "milestone" };
      }
    }
    return null;
  }

  /* ── 回响兑现层（P1 G13）：每场比赛后 due-1，归零弹出，不占配额，队列上限3 ── */
  function popEcho(state, ctx) {
    const d = state.data;
    ensure(d);
    const q = d.echoQueue || [];
    if (!q.length) return null;
    q.forEach(e => { e.due -= 1; });
    let idx = -1;
    for (let i = 0; i < q.length; i++) { if (q[i].due <= 0) { idx = i; break; } }
    if (idx < 0) return null;
    const ent = q.splice(idx, 1)[0];
    const def = (window.ECHO_DEFS || {})[ent.id];
    if (!def) return null;
    d._ec.once["echo_done_" + ent.id] = true;
    return { id: def.id, tier: "echo", cat: def.cat || "echo", art: def.art, once: "echo_done_" + ent.id,
      title: def.title, body: def.body, fx: def.fx, _source: "echo" };
  }

  /* ── 主线脊柱层（P2 G1）：十二章按序解锁，cond 结构化求值（双端同构） ── */
  /** ★ 当前总评（唯一口径）—— 两条求值器（`spineCondOk` 与 `pass`）都必须用它。
   *  ★★ 为什么单独抽出来：原代码读的是 **`d.ovr`**，而这个字段**全仓从未被写过**
   *    （存档模板里没有 `ovr`，也没有任何赋值点）→ `d.ovr || 0` 恒为 0。 */
  function ovrOf(d) {
    try { return (window.PlayerSystem && d && d.player) ? PlayerSystem.overall(d.player) : 0; }
    catch (e) { return 0; }
  }
  function spineCondOk(cond, ctx, d) {
    if (!cond) return true;
    /* ★★★ P107 修复（2026-09-17）：这是 `minSeason` 的**同族缺陷第二例** ——
       主线脊柱的 `cond.seasonMin` 此前也直接比 `d.season`，而 `d.season` 是**年份**
       ⇒ `2014 >= 3` 恒真：ch7 / ch9 / ch10 / ch11 四章的赛季门**同样是摆设**
       （`data_mainline.js` 的 seasonMin 3/4/6/10）。
       ★ 教训（"修一处 ≠ 修一类"）：本次审计用**穷举**而不是"改完那处就算"——
         `grep 'd\.season' | grep '[<>]=?'` 全仓只揪出两处：`pass` 的 minSeason
         与本处；其余 `d.season` 比较（club_events 的 `d.season === 2017`）
         是**真实历史年份**锚点，语义正确、**不得**改。
       ⇒ 与 `minSeason` 用**同一个真值源** `seasonNoOf(d)`，口径不再分叉。 */
    if (cond.seasonMin != null && !(seasonNoOf(d) >= cond.seasonMin)) return false;
    if (cond.appsCareer != null && !((d.stats ? d.stats.apps : 0) >= cond.appsCareer)) return false;
    /* ★★★ P97 缺陷修复（「字段没人写」型的**最严重一例**）：
       原来这里是 `(d.ovr || 0) >= cond.ovrMin` —— `d.ovr` 恒为 0。
       而 `pickMainline` 只有在**卡真正发出**时才把 `d._ml.next` +1 ——
       于是**只要某章声明了 `ovrMin`，主线就永久停在那章**：
       ch8「转会十字路口」(ovrMin 68) / ch9「大赛初征」(72) / ch10「袖标」(78) /
       ch11「王朝与倦怠」(60) → **第 8~12 章五张脊柱卡 + 之后全部主线内容不可达**。 */
    if (cond.ovrMin != null && !(ovrOf(d) >= cond.ovrMin)) return false;
    if (cond.intlCapMin != null && !((d.intl && d.intl.career ? d.intl.career.apps : 0) >= cond.intlCapMin)) return false;
    if (cond.derby && !ctx.isDerby) return false;
    if (cond.heavyInjury && !(d.flags && d.flags.heavy14Ever)) return false;
    if (cond.minTrophies != null && !((d.trophies || []).length >= cond.minTrophies)) return false;
    /* ★ P101-3（2026-09-16 用户拍板「第一份合同应在 16 岁签职业合同时出现」）：
       cond.proContract = 「已签第一份职业合同」判据（双端同构字段）。
       旧 cond=appsCareer 驱动会让 14 岁跳级学徒弹出（jump 相位 d.stats.apps 照写，
       match.js 设计拍板）。判据 = 旗标（Youth.leave 出口转职业时落）∨ 相位已 senior
       （旧档兼容：senior 必经出口/创建页职业开局，两者都已签职业合同，无需回填脚本）。
       ★ 为什么不信 d.contract：模板默认 {years:2,wage:3000} 恒在（A15 登记未回填），
         跳级者也带它 ⇒ d.contract 无法区分学徒/职业。 */
    if (cond.proContract != null) {
      /* ★ P107：判据收敛到 CONFIG.isProContract（与 pass 的 proContract 门同一真相源） */
      if (cond.proContract !== proContractOf(d)) return false;
    }
    return true;
  }

  function pickMainline(state, ctx) {
    const d = state.data;
    ensure(d);
    const next = d._ml.next;
    if (next > 12) return null;
    const sp = (window.MAINLINE_SPINE || []).find(c => c.chapter === next);
    if (!sp) return null;
    if (!spineCondOk(sp.cond, ctx, d)) return null;
    d._ml.next = next + 1;
    return { id: sp.id, tier: "mainline", cat: "mainline", art: sp.art, once: "ml_" + next,
      title: sp.title, body: sp.body, fx: sp.fx, _source: "mainline" };
  }

  /* ── 赛后抽卡入口（ctx 由 MatchUI.applyResult 组装；国家队场次优先 E 组）
     优先级（策划案 7.2）：里程碑 > 回响兑现 > 主线脊柱 > 普通池 ── */
  function postMatch(state, ctx) {
    const d = state.data;
    if (!d.fixtures && !ctx.round) return null;
    interReset(d);   // ★ P158：一场比赛完成 = 新间隔起点（预算清零）
    const ms = pickMilestone(ctx, d);
    if (ms) return ms;
    const echo = popEcho(state, ctx);
    if (echo) return echo;
    const spine = pickMainline(state, ctx);
    if (spine) return spine;
    /* ★ P158：普通池（调剂卡）走间隔预算 —— 叙事层上面三关不占预算 */
    if (ctx.isIntl) {
      if (!interAllow(d)) return null;
      const c = drawCard(state, "intl", ctx) || drawCard(state, "post", ctx);
      if (c) interUse(d);
      return c;
    }
    if (!interAllow(d)) return null;
    const c = drawCard(state, "post", ctx);
    if (c) interUse(d);
    return c;
  }

  /* ── 赛前抽卡入口（fixture 上下文） ── */
  function beforeMatch(state, fixture) {
    const d = state.data;
    const m = fixture.match || fixture;
    const round = roundOf(fixture, d);
    const ctx = {
      round,
      isCup: !!fixture.cup || !!fixture.cupKO,
      isIntl: !!(fixture.comp || String((m.home && m.home.id) || "").indexOf("nat_") === 0),
      isDerby: false,
    };
    try { ctx.isDerby = SeasonSystem.matchImportance(state, fixture).reason === "德比战"; } catch (e) { /* ignore */ }
    Object.assign(ctx, intlFlagsOf(fixture.comp, fixture.stage, fixture.cupKO)); // 大赛年旗标（G7）
    // 国家队场次（E 组）优先，未中回退 A 组赛前卡
    /* ★ P158：赛前卡属调剂卡 —— 走间隔预算；间隔 2→3（P158 节奏收紧） */
    if (ctx.isIntl) {
      if (!interAllow(d)) return null;
      const c = drawCard(state, "intl", ctx, { gap: 3 }) || drawCard(state, "pre", ctx, { gap: 3 });
      if (c) interUse(d);
      return c;
    }
    if (!interAllow(d)) return null;
    const c = drawCard(state, "pre", ctx, { gap: 3 }); // 赛前卡不与赛后卡贴脸
    if (c) interUse(d);
    return c;
  }

  /* ── 效果写入（真实数值系统） ── */
  const FX_CN = { morale: "士气", fatigue: "体能", fame: "名气", money: "现金", exp: "经验", discipline: "自律", professionalism: "职业素养", physicalTalent: "身体天赋" };
  // chars 八键（策划案 3：数值层扩展，0-100 归一，默认 50；injury_risk 挂伤病概率）
  const CHAR_KEYS = { confidence: 1, coach_trust: 1, media_relation: 1,
    fan_love: 1, chemistry: 1, commercial_value: 1, injury_risk: 1 };
  const CHAR_CN = { confidence: "自信", coach_trust: "教练信任",
    media_relation: "媒体关系", fan_love: "球迷好感", chemistry: "化学反应",
    commercial_value: "商业价值", injury_risk: "伤病风险" };
  /* ★★ P102（用户反馈 2026-09-16「事件里提到教练信任度，属性里却看不到」）：
     这 7 项此前**只活在卡片结算条**（弹完即逝），属性面板从不渲染 —— 玩家无从查看。
     同时存在**两套"教练信任"**：事件卡走 `d.chars.coach_trust`，生活事件（career.js fx.trust）
     走独立的 `d.trust` —— 同名不同源，且 `d.trust` 全仓无人读取（死字段）。
     ★ `charsOf(d)`：统一读取口（含旧档迁移：`d.trust` 首读并入 coach_trust，一次性打标）。
       属性面板与任何后续消费方**只准走这里**，不得再各自直读 `d.chars`。 */
  function charsOf(d) {
    if (!d) return [];
    // 旧档迁移（一次性）：生活事件的教练信任并入统一字段
    if (d.trust != null && !(d._trustMigrated)) {
      d.chars = d.chars || {};
      if (d.chars.coach_trust == null) d.chars.coach_trust = Math.max(0, Math.min(100, Math.round(d.trust)));
      d._trustMigrated = true;
    }
    d.chars = d.chars || {};
    return Object.keys(CHAR_KEYS).map(id => ({
      id,
      name: CHAR_CN[id],
      value: (d.chars[id] != null) ? d.chars[id] : 50,
    }));
  }
  function applyFx(state, fx, card) {
    const d = state.data, chips = [];
    if (!fx) return chips;
    for (const [k, v] of Object.entries(fx)) {
      if (!v) continue;
      if (k === "morale") { d.morale = Math.max(20, Math.min(100, (d.morale || 60) + v)); chips.push(chip("士气 " + sgn(v), v)); }
      /* ★ P171：fatigue 分支随疲劳机制退役 —— 数据文件中的 fatigue 值静默失效（不显示不生效）。 */
      else if (k === "fame") { if (window.Career) Career.addFame(state, v); chips.push(chip("名气 " + sgn(v), v)); }
      else if (k === "money") {
        /* ★ P297（同族全面收口）：负值 fx 也不得把资金打穿为负——与经纪人佣金
           payAgentFee 同一口径（资金永不为负）。数据显示面仍按 fx 原值展示。 */
        if (v < 0) { d.money = Math.max(0, (d.money || 0) + v); }
        else { d.money = (d.money || 0) + v; }
        chips.push(chip((v > 0 ? "+" : "") + "¥" + v, v));
      }
      /* ★★ P97 缺陷修复（「数据声明了、代码没处理」型 —— 第四把尺子扫出来的最多一例）：
         `fans` 在**生活事件**（`career.js` 的 fx 分发）里是被处理的，但**这张卡片分发器漏了它**
         → 数据里 **45 处 `fx: { fans: … }`**（`data_club_bja/jsu/lno/shs/tan` + `data_hupu_flavor`）
         全部**静默失效**：卡文承诺的"球迷变多/变少"从来没有发生，且不报错。
         ★ 语义与 `career.js` 完全对齐（`Math.max(0, …)` 防负数粉丝）。 */
      else if (k === "fans") { d.fans = Math.max(0, (d.fans || 0) + v); chips.push(chip("粉丝 " + sgn(v), v)); }
      else if (k === "exp") { d.expPool = (d.expPool || 0) + v; chips.push(chip("经验 " + sgn(v), v)); }
      else if (k === "favor") {
        /* P64 球星好感：fx.favorPid 显式指星 / 卡级 starPid / "dyn" 动态选星（好感>0 者最高） */
        const pid = fx.favorPid || (card && card.starPid) || "dyn";
        const target = (window.StarFavor) ? StarFavor.resolveTarget(state, pid) : null;
        if (target) {
          const nv = StarFavor.addFavor(state, target.pid, v);
          chips.push(chip("与 " + target.name + " 羁绊 " + sgn(v) + "（" + StarFavor.tierOf(nv) + "）", v));
        }
      }
      else if (k === "echo") {
        // 回响播种（P1 G13）：值 "echo_id:延迟场数"；每链一生一次；队列上限3
        const parts = String(v).split(":");
        const eid = parts[0], delay = Math.max(1, parseInt(parts[1] || "3", 10) || 3);
        ensure(d);
        if (!d._ec.once["planted_" + eid]) {
          if (d.echoQueue.length >= 3) d.echoQueue.shift();   // 队列上限：最旧让位
          d.echoQueue.push({ id: eid, due: delay });
          d._ec.once["planted_" + eid] = true;
        }
      }
      else if (CHAR_KEYS[k]) {
        d.chars = d.chars || {};
        const cur = d.chars[k] != null ? d.chars[k] : 50;
        d.chars[k] = Math.max(0, Math.min(100, cur + v));
        chips.push(chip(CHAR_CN[k] + " " + sgn(v), v));
      }
      else if (FX_CN[k]) {
        d.hidden = d.hidden || {}; d.hidden.xp = d.hidden.xp || {};
        d.hidden.xp[k] = (d.hidden.xp[k] || 0) + v;
        chips.push(chip(FX_CN[k] + " " + sgn(v), v));
      }
    }
    return chips;
  }
  const sgn = v => (v > 0 ? "+" : "") + v;
  const chip = (label, v) => ({ label, cls: v > 0 ? "" : "neg" });

  /* ── 占位符解析 ── */
  function resolve(text, ctx) {
    const d = ctx && ctx.d;
    let starName = "";
    try {
      if (window.StarFavor && d) { const t = StarFavor.resolveTarget({ data: d }, "dyn"); starName = t ? t.name : ""; }
    } catch (e) { starName = ""; }
    const map = {
      player: d ? d.player.name : "",
      star: starName,
      num: d ? (d.player.number || 9) + "号" : "",
      team: ctx && ctx.teamName ? ctx.teamName : "",
      opp: ctx && ctx.oppName ? ctx.oppName : "",
      score: ctx && ctx.score ? ctx.score : "",
      comp: ctx && ctx.comp ? ctx.comp : "",
      goals: ctx && ctx.userGoals != null ? ctx.userGoals : 0,
      rating: ctx && ctx.rating != null ? ctx.rating : "",
      res: ctx && ctx.res ? ctx.res : "",
      round: ctx && ctx.round != null ? ctx.round : "",
      /* ★ P136（B 组）：复出卡 {lastInjDays} 占位符真值（ctx 由 settlement.ecCtxOf 注入） */
      lastInjDays: (ctx && ctx.lastInjDays != null) ? ctx.lastInjDays : "",
    };
    /* ★ P226（审计 SR）：占位符替换值统一实体转义——{player}/{team}/{opp} 等动态值
       （玩家名为用户输入）进 innerHTML 前过 esc()；卡文案自带的合法 HTML 标签保留 */
    /* ★ P232（复审）：出口过**标签白名单**——只保留无害行内标签（b/i/em/strong/br，且不带任何
       属性），a/img/iframe/script 等可执行或外链载体连标签剥除（script/style 容器连内容整块剥）。
       esc() 产生的实体（&lt; 等）是文本不匹配 <[^>]*>，不受影响。 */
    return sanitizeCardHtml(String(text || "").replace(/\{(\w+)\}/g, (m, k) => (map[k] != null && map[k] !== "") ? esc(String(map[k])) : m));
  }

  /* ★ P232（复审）：卡文案标签白名单过滤器（eventcards 卡文案 + club_events 文案共用，经 EventCards 导出） */
  const CARD_BLOCK_RE = /<(script|style|iframe)\b[\s\S]*?<\/\1\s*>/gi;
  const CARD_TAG_RE = /<[^>]*>/g;
  function sanitizeCardHtml(html) {
    let s = String(html || "");
    s = s.replace(CARD_BLOCK_RE, " ");
    s = s.replace(CARD_TAG_RE, t => /^<\/?(b|i|em|strong|br)\s*\/?>$/i.test(t) ? t.toLowerCase() : "");
    return s;
  }

  /* ── 插画 URL 归一化 ──
     历史遗留：ART_DIR 已含 "ec_" 前缀，但相当一部分卡片的 art 字段也自带
     "ec_"（如 art:"ec_trophy"）→ 被拼成 assets/comic/ec_ec_trophy.webp（404，
     插画整片空白）。实测曾影响 877/935 张卡。此处统一剥掉重复前缀。
     另有 international / awards 两个名字在 assets/comic 下没有对应文件，
     按语义就近映射到 flag / trophy。 */
  const ART_ALIAS = { international: "flag", awards: "trophy" };
  /* ★ P254（2026-09-21 热点资讯发布安全审计收口）：成品 URL 守卫。
     口径与 art_sprite.js 的 SAFE_URL_RE 完全一致，ArtSprite 在场时**直接共用它的实现**
     （单一真源，防第四份口令漂移）；ArtSprite 缺席（node/vm 探针）时走本地同口径兜底。 */
  const ART_SAFE_RE = /^assets\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.webp$/;
  const ART_SAFE_FALLBACK = "assets/comic/ec_goal.webp";
  function artGuard(u) {
    const s = String(u == null ? "" : u);
    if (window.ArtSprite && window.ArtSprite.safeUrl) return window.ArtSprite.safeUrl(s, ART_SAFE_FALLBACK);
    return ART_SAFE_RE.test(s) ? s : ART_SAFE_FALLBACK;
  }
  function artUrl(card) {
    let a = String((card && card.art) || "goal").trim().replace(/^.*\//, "").replace(/^ec_/, "");
    if (ART_ALIAS[a]) a = ART_ALIAS[a];
    /* ★ P226（审计 SR）：插画名白名单（与 ArtSprite.bare 同口径），不匹配回退默认图 */
    if (!/^[a-z0-9_]{1,40}$/i.test(a)) a = "goal";
    /* ★ P254：成品串再过一道协议/域名/字符守卫（a 已白名单，ART_DIR 属配置位） */
    return artGuard((EC().ART_DIR || "assets/comic/ec_") + a + ".webp");
  }
  /* P92：插画样式串。ArtSprite 可用时走图集定位（发布包内不含单图，直接发原图请求
     会 404）；ArtSprite 缺席（本地开发 / 单图版发布包）时回退原单图行为。
     注意 artUrl() 保留原语义 —— tools/v2_art_audit.js 依赖它做引用审计。 */
  function artStyleStr(card) {
    if (window.ArtSprite && window.ArtSprite.style) {
      let a = String((card && card.art) || "goal").trim().replace(/^.*\//, "").replace(/^ec_/, "");
      if (ART_ALIAS[a]) a = ART_ALIAS[a];
      if (!/^[a-z0-9_]{1,40}$/i.test(a)) a = "goal";   // ★ P226（审计 SR）白名单
      return window.ArtSprite.style(a);
    }
    return "background-image:url(" + artUrl(card) + ")";
  }

  /* ── UI：模态渲染（复用 UIkit.modal + ec-* 样式） ── */
  /** P52：卡片头部双标签（映射自 EC().kicker）——P53 起统一转调 CardHost，避免两套实现漂移 */
  function cardHeadHtml(card) {
    const kick = typeof card === "string"
      ? String(card)
      : String((EC().kicker && EC().kicker[card.cat]) || "生涯 · 抉择");
    return (window.CardHost && CardHost.headTags)
      ? CardHost.headTags(kick)
      : '<div class="ec-cardhead"><span class="ec-tag">' + esc(kick.split(" · ")[0]) + "</span></div>";
  }

  function showCard(state, card, opts, onDone) {
    const d = state.data;
    /* 通告卡兼容：pickMilestone / pickMainline / popEcho 合成的卡片只带
       {title, body, fx, _source} 而**没有 options**，此前无条件调用
       card.options.map 直接抛 TypeError（里程碑/十二章主线/回响全部弹不出来，
       且被 guard 吞成一句 toast）。无选项时渲染为单按钮通告卡。
       附：这三类卡的效果只写在 card 级 fx 上，历史上从未有人结算 → 在此接上。 */
    const choices = Array.isArray(card.options) ? card.options : [];
    let noticeChips = [];
    if (!choices.length && card.fx) {
      noticeChips = applyFx(state, card.fx);
      State.save();
    }
    const chipHtml = noticeChips.length
      ? '<div class="ec-fx">' + noticeChips.map(c => '<span class="fx-chip ' + c.cls + '">' + esc(c.label) + "</span>").join("") + "</div>"
      : "";
    /* P64：好感注脚（高光/观赛/B2 保底排队，此处统一消费渲染） */
    let favHtml = "";
    try {
      const favNotes = (window.StarFavor) ? StarFavor.takeFavNotes(d) : [];
      favHtml = favNotes.length
        ? '<div class="ec-favnote">' + favNotes.map(n => esc(n)).join("<br>") + "</div>"
        : "";
    } catch (e) { favHtml = ""; }
    /* P52：卡片头部改成双标签（场景 + 时机），对齐篮球生涯的事件卡样式 */
    const head = cardHeadHtml(card);
    const html =
      '<div class="ec-card">' +
        head +
        '<div class="ec-art" style="' + artStyleStr(card) + '"></div>' +
        '<div class="ec-title">' + esc(card.title) + "</div>" +
        '<div class="ec-body">' + resolve(card.body, opts.ctx) + "</div>" +
        favHtml +
        (choices.length
          ? '<div class="ec-opts">' + choices.map((o, i) =>
              '<button class="btn btn-ghost ec-opt" data-i="' + i + '">' + esc(o.text) + "</button>").join("") + "</div>" +
            '<div class="ec-hint">做出选择后才能继续</div>'
          : chipHtml + '<button class="btn btn-primary mt-8" id="ec-ok">继续 ▸</button>') +
      "</div>";
    const root = CardHost.show(html, { dismissable: false });
    if (!choices.length) {
      $("#ec-ok").onclick = () => { CardHost.close(); onDone && onDone(); };
      return;
    }
    root.querySelectorAll(".ec-opt").forEach(btn => {
      btn.onclick = () => {
        /* ★ P295（玩家反馈「选中一个选项后其他选项要置灰示意已选择」）：点击瞬间
           全组禁用+置灰（防双击双结算竞态），已选项高亮保留——回应态渲染前不回弹。 */
        root.querySelectorAll(".ec-opt").forEach(b2 => {
          b2.disabled = true;
          if (b2 !== btn) b2.classList.add("ec-opt-dim");
          else b2.classList.add("ec-opt-picked");
        });
        const o = card.options[+btn.dataset.i];
        const chips = applyFx(state, o.fx, card);
        if (o.sim) { d.flags._ecSim = Object.assign(d.flags._ecSim || {}, o.sim); }
        State.save();
        // 抉择回应 + 效果结算 + 继续
        const fxHtml = chips.length ? '<div class="ec-fx">' + chips.map(c => '<span class="fx-chip ' + c.cls + '">' + esc(c.label) + "</span>").join("") + "</div>" : "";
        /* P52：回应态保留插画与头部——此前整卡内容被替换，插画消失导致下半屏全空 */
        root.querySelector(".ec-card").innerHTML =
          head +
          '<div class="ec-art" style="' + artStyleStr(card) + '"></div>' +
          '<div class="ec-title" style="font-size:18px">' + esc(card.title) + " · 你的选择</div>" +
          '<div class="ec-response">' + resolve(o.response, opts.ctx) + "</div>" + fxHtml +
          '<div style="flex:1"></div>' +
          '<button class="btn btn-primary" id="ec-go">继续 ▸</button>';
        $("#ec-go").onclick = () => { CardHost.close(); onDone && onDone(); };
      };
    });
  }

  /* ══════════ P56：G 组日常卡 + 静默批次抽卡 ══════════
     背景：事件卡原先只挂在「直播场次」上（afterResult / showPre），联赛 30 轮里
     通常只有 2~4 场关键战，导致一赛季仅 3~7 张卡、899 张池子要 150 季才看完。
     本层补两条抽卡通道：
       ① 静默批次（普通场自动完赛）→ 里程碑/回响/主线逐场判定 + 普通池按间隔抽
       ② 非比赛日（含伤病期）→ 可循环日常池
     两者都不需要玩家多看一场比赛，但事件密度翻倍。 */

  /** 日常卡参数（密度调节点：改这两个数即可整体调松/调紧）
     ★ P158：GAP_DAYS 24→32 —— 日常卡与「间隔预算」（PACE）同权竞争出卡位后整体调松一档。 */
  const DAILY_CFG = {
    GAP_DAYS: 32,    // 全局间隔：两次日常卡之间至少隔多少「天」（dayIndex）
    CARD_CD: 45,     // 单卡冷却：同一张日常卡至少隔多少天才可能再次出现
  };

  /* ── ★★ P158（2026-09-19 用户拍板）：比赛间隔事件预算（节奏单源）──────────
     用户原话：「每场比赛之间不要有太多事件，把游戏节奏搞得稀碎，每场比赛间应该
     只有 1-2 个事件卡作为调剂即可，除非是漫长的休赛期，那个另说。」
     ── 结构 ──
     · 一个「间隔」= 两场比赛完成之间。重置点 = postMatch 入口（直播场完成）/
       silentPick 入口（静默批完成）/ onOffseason 入口（赛季翻页，防御性）；
     · 调剂卡四通道各消耗 1：赛前 beforeMatch / 赛后普通池 postMatch 末级 /
       日常 rollDaily / 静默普通池 silentPick 末级。预算见底 ⇒ 返回 null
       （上游本来就把 null 当「无卡」处理，UI/链路零感知）；
     · 叙事层不占预算也不被拦：里程碑 / 回响 / 主线脊柱 / 俱乐部专属 /
       章回 / 球星称赞 —— 各自有 once / 6 轮闸 / 章节门等独立节流，且是内容主体；
     · 自愈：dayIndex 距锚 ≥ STALE_DAYS（约两个联赛周期，覆盖长期养伤/冬歇）
       视为间隔自然终结，预算重置 —— 防止养伤期把伤病期专属日常卡整段饿死；
     · 休赛期豁免：rollDaily 本就被 gameloop 的 !d.offseason 门挡住，
       onOffseason（休赛期专属池）不经过本预算 —— 「休赛期另说」成立。 */
  const PACE = {
    CAP: 2,          // 每个比赛间隔的调剂卡上限（用户口径「1-2 个」）
    STALE_DAYS: 16,  // 间隔自愈阈值（天）
  };
  function interReset(d) {
    const ec = ensure(d);
    ec.interAnchor = d.dayIndex || 0;
    ec.interUsed = 0;
    return ec;
  }
  function interFresh(d) {
    const ec = ensure(d);
    if (ec.interUsed == null) { ec.interUsed = 0; ec.interAnchor = d.dayIndex || 0; }
    else if ((d.dayIndex || 0) - (ec.interAnchor || 0) >= PACE.STALE_DAYS) { ec.interAnchor = d.dayIndex || 0; ec.interUsed = 0; }
    return ec;
  }
  function interAllow(d) { return interFresh(d).interUsed < PACE.CAP; }
  function interUse(d) { const ec = interFresh(d); ec.interUsed = (ec.interUsed || 0) + 1; return ec.interUsed; }

  /** 抽一张日常卡（只判定与登记，不出 UI）：返回 card 或 null */
  function rollDaily(state) {
    const d = state && state.data;
    if (!d || d.retired) return null;
    const ec = ensure(d);
    const pool = EC().daily || [];
    if (!pool.length) return null;
    const day = d.dayIndex || 0;
    if (day - ec.dailyRound < DAILY_CFG.GAP_DAYS) return null;
    /* ★ P158：日常卡是调剂卡 —— 间隔预算见底则整段休息日静音 */
    if (!interAllow(d)) return null;
    const ctx = {
      d, round: day, dayIndex: day,
      res: "", margin: 0, userGoals: 0, userAssists: 0, rating: 0, motm: false,
      isCup: false, isDerby: false, isIntl: false,
      injured: (d.injuryDays || 0) > 0,          // 伤病期专属卡（when.injured）
      comp: "非比赛日",
      month: (d.date && d.date.month) || 0,
    };
    const last = ec.dailyLast;
    const cands = pool.filter(c =>
      pass(c.when, ctx, d) &&
      (day - (last[c.id] != null ? last[c.id] : -999) >= DAILY_CFG.CARD_CD));
    if (!cands.length) return null;
    const card = cands[R.int(0, cands.length - 1)];
    ec.dailyRound = day;
    last[card.id] = day;
    interUse(d);   // ★ P158
    return card;
  }

  /** 展示日常卡（复用 showCard 的抉择 → 回应 → 效果 chip 链） */
  function showDaily(state, card, onDone) {
    if (!card) { onDone && onDone(); return false; }
    const d = state.data;
    /* P64 B2 首季保底：首次高光后的下一张日常卡搭车 +8（不另出新卡） */
    try {
      if (window.StarFavor && d._favGlowFirst) {
        const st = StarFavor.starById(d._favGlowFirstPid || "");
        if (st) {
          StarFavor.addFavor(state, st.pid, 8);
          StarFavor.pushNote(d, st.name + " 私信问你要了那场比赛的集锦——羁绊 +8");
        }
        d._favGlowFirst = false; d._favGlowFirstPid = null;
      }
    } catch (e) { /* ignore */ }
    const ctx = {
      d, round: d.dayIndex || 0, oppName: "", comp: "非比赛日",
      teamName: (window.teamById && teamById(d.clubId) || {}).name || "",
    };
    showCard(state, card, { ctx }, onDone);
    return true;
  }

  /**
   * 静默批次抽卡（确定性层优先，语义对齐 postMatch 的优先级）：
   * 逐场判定 里程碑 > 回响 > 主线（这样「静默场打进的生涯首球」也不会被漏掉），
   * 全部未命中才用最后一场的上下文走普通池，且间隔比直播场次更宽（默认 6 轮）。
   */
  function silentPick(state, ctxs) {
    const d = state.data;
    ensure(d);
    const list = (ctxs || []).filter(Boolean);
    if (!list.length) return null;
    interReset(d);   // ★ P158：静默批（≥1 场完成）= 间隔起点
    for (const raw of list) {
      const ctx = Object.assign({ d }, raw);
      let c = null;
      try { c = pickMilestone(ctx, d); } catch (e) { c = null; }
      if (c) return c;
      try { c = popEcho(state, ctx); } catch (e) { c = null; }
      if (c) return c;
      if (window.ClubEvents) { try { c = ClubEvents.pickSilent(state, ctxs); } catch (e) { c = null; } if (c) return c; } // P63 俱乐部线档
      try { c = pickMainline(state, ctx); } catch (e) { c = null; }
      if (c) return c;
    }
    const last = Object.assign({ d }, list[list.length - 1]);
    const gap = (last.isCup || last.isDerby || last.isIntl) ? 2 : 6;
    /* ★ P158：静默普通池同样受间隔预算约束（确定性层上面不受限） */
    try {
      if (last.isIntl) {
        if (!interAllow(d)) return null;
        const c = drawCard(state, "intl", last, { gap }) || drawCard(state, "post", last, { gap });
        if (c) interUse(d);
        return c;
      }
      if (!interAllow(d)) return null;
      const c = drawCard(state, "post", last, { gap });
      if (c) interUse(d);
      return c;
    } catch (e) { return null; }
  }

  /** 静默批次钩子：战报卡关闭后调用（逐行对齐 afterResult 的对外契约） */
  function afterSilentBatch(state, ctxs, onDone) {
    /* P64 球星好感：静默场逐场判高光 + 观赛结算（称赞卡优先） */
    let praiseCard = null;
    try {
      if (window.StarFavor) {
        for (const c of (ctxs || [])) {
          StarFavor.applyGlow(state, c);
          const w = StarFavor.consumeWatchOnResult(state, c);
          if (w && w.praiseCard) praiseCard = w.praiseCard;
        }
      }
    } catch (e) { console.warn("starfavor silent", e); }
    if (praiseCard) {
      const d0 = state.data;
      const lastCtx = (ctxs && ctxs.length) ? ctxs[ctxs.length - 1] : {};
      showCard(state, praiseCard, { ctx: Object.assign({ d: d0 }, lastCtx) }, onDone);
      return true;
    }
    if (window.ClubEvents) { try { ClubEvents.noteSilent(state, ctxs); } catch (e) { /* ignore */ } } // P63 低谷连击记档
    let card = null;
    try { card = silentPick(state, ctxs); } catch (e) { console.warn("eventcard silent", e); }
    if (!card) { onDone && onDone(); return false; }
    const d = state.data;
    const last = (ctxs && ctxs.length) ? ctxs[ctxs.length - 1] : {};
    const ctx = Object.assign({
      d, round: last.round || d.dayIndex || 0, oppName: last.oppName || "",
      comp: last.comp || "非比赛日", teamName: (window.teamById && teamById(d.clubId) || {}).name || "",
    }, last);
    showCard(state, card, { ctx }, onDone);
    return true;
  }

  /**
   * headless：自动处理一张卡（回归/soak 专用，不走 UI）。
   * 只为让自动化覆盖「899 张卡的抽取与效果结算」——此前 soak 用 simMatch 代替直播，
   * 事件卡整块内容从未被任何自动化触达过。选项走与 showCard 相同的 applyFx 通道。
   */
  function autoResolve(state, card) {
    if (!card) return null;
    let fx = card.fx || null, text = "";
    if (Array.isArray(card.options) && card.options.length) {
      const o = card.options[R.int(0, card.options.length - 1)];
      fx = (o && o.fx) || null;
      text = (o && o.response) || "";
      if (o && o.sim) {
        const d = state.data;
        d.flags = d.flags || {};
        d.flags._ecSim = Object.assign(d.flags._ecSim || {}, o.sim);
      }
    }
    let n = 0;
    try { n = applyFx(state, fx, card).length; } catch (e) { n = 0; }
    return { id: card.id, tier: card.tier || "", cat: card.cat || "", title: card.title, chips: n, text: String(text).slice(0, 30) };
  }

  /* ── 赛后钩子：结算弹窗关闭后调用（无卡直接回调） ── */
  function afterResult(state, ctx, onDone) {
    /* P64 球星好感：对位高光入账 + 友谊赛观赛结算（称赞卡优先于普通抽卡） */
    try {
      if (window.StarFavor) {
        StarFavor.applyGlow(state, ctx);
        const w = StarFavor.consumeWatchOnResult(state, ctx);
        if (w && w.praiseCard) {
          showCard(state, w.praiseCard, { ctx: Object.assign({ d: state.data }, ctx) }, onDone);
          return;
        }
      }
    } catch (e) { console.warn("starfavor post", e); }
    if (window.ClubEvents) { let handled = false; try { handled = ClubEvents.onResult(state, ctx, onDone); } catch (e) { handled = false; } if (handled) return; } // P63 赛后俱乐部卡
    let card = null;
    try { card = postMatch(state, ctx); } catch (e) { console.warn("eventcard draw", e); }
    if (!card) { onDone && onDone(); return; }
    showCard(state, card, { ctx: Object.assign({ d: state.data }, ctx) }, onDone);
  }

  /* ── 赛前钩子：有卡先弹卡，选完再进比赛 ── */
  function showPre(state, fixture, onDone) {
    if (window.ClubEvents) { let pc = null; try { pc = ClubEvents.pickPre(state, fixture); } catch (e) { pc = null; }
      if (pc) { const d0 = state.data; let oppName = "对手";
        try { const m = fixture.match || fixture; const opp = (m.home && m.home.id) === d0.clubId ? m.away : m.home; oppName = opp.name || oppName; } catch (e) { /* ignore */ }
        showCard(state, pc, { ctx: { d: d0, oppName, round: fixture.round || d0.dayIndex || "", teamName: (window.teamById && teamById(d0.clubId) || {}).name || "" } }, onDone); return true; } } // P63 赛前俱乐部卡
    let card = null;
    try { card = beforeMatch(state, fixture); } catch (e) { console.warn("eventcard pre", e); }
    if (!card) { onDone(); return false; }
    const d = state.data;
    let oppName = "对手";
    try { const m = fixture.match || fixture; const opp = (m.home && m.home.id) === d.clubId ? m.away : m.home; oppName = opp.name || oppName; } catch (e) { /* ignore */ }
    const ctx = { d, oppName, round: fixture.round || d.dayIndex || "", teamName: (window.teamById && teamById(d.clubId) || {}).name || "" };
    showCard(state, card, { ctx }, onDone);
    return true;
  }

  /* ── C 组：转会窗（赛季末报价环节；M2.5 新增入口） ── */
  function onTransferWindow(state, ctx, onDone) {
    let card = null;
    try { card = drawCard(state, "transfer", ctx, { gap: 0 }); } catch (e) { console.warn("eventcard transfer", e); }
    if (!card) { onDone && onDone(); return false; }
    showCard(state, card, { ctx: Object.assign({ d: state.data }, ctx) }, onDone);
    return true;
  }

  /* ── D 组：赛季末（结算完成后；C 组未中时兜底，一次只弹一张） ── */
  function afterSeasonEnd(state, ctx, onDone) {
    const d = state.data;
    const base = Object.assign({
      d, round: roundOf(null, d), score: "", oppName: "", comp: "赛季末",
      isCup: false, isDerby: false, isIntl: false,
      teamName: (window.teamById && teamById(d.clubId) || {}).name || "",
    }, ctx || {});
    let card = null;
    try { card = drawCard(state, "transfer", base, { gap: 0 }) || drawCard(state, "seasonEnd", base, { gap: 0 }); } catch (e) { console.warn("eventcard seasonEnd", e); }
    if (!card) { onDone && onDone(); return false; }
    showCard(state, card, { ctx: base }, onDone);
    return true;
  }

  /* ── F 组：休赛期（青训投资界面打开前；M3 新增入口） ── */
  function onOffseason(state, ctx, onDone) {
    const d = state.data;
    interReset(d);   // ★ P158：进入休赛期 = 预算清零（休赛期卡片流不占预算；新季首战干净起步）
    const base = Object.assign({
      d, round: roundOf(null, d), score: "", oppName: "", comp: "休赛期",
      isCup: false, isDerby: false, isIntl: false,
      teamName: (window.teamById && teamById(d.clubId) || {}).name || "",
    }, ctx || {});
    let card = null;
    try { card = drawCard(state, "offseason", base, { gap: 0 }); } catch (e) { console.warn("eventcard offseason", e); }
    if (!card) { onDone && onDone(); return false; }
    showCard(state, card, { ctx: base }, onDone);
    return true;
  }

  /* ── 大赛年旗标（G7）：国家队赛事 comp/stage/cupKO → 卡片条件旗标（赛前/赛后共用） ── */
  function intlFlagsOf(comp, stage, cupKO) {
    const c = comp || "";
    const isIntl = c.indexOf("亚洲杯") >= 0 || c.indexOf("世预赛") >= 0 || c.indexOf("世界杯") >= 0 || c.indexOf("友谊赛") >= 0 || c.indexOf("附加赛") >= 0;
    if (!isIntl) return { intlComp: null, intlStage: null, intlKO: false, intlFinal: false, intlKoStage: null, majorTournament: false };
    const isWc = c.indexOf("世界杯") >= 0, isAsia = c.indexOf("亚洲杯") >= 0,
          isWcq = c.indexOf("世预赛") >= 0 || c.indexOf("附加赛") >= 0, isFriendly = c.indexOf("友谊赛") >= 0;
    return {
      intlComp: isWc ? "wc" : isAsia ? "asia" : isWcq ? "wcq" : isFriendly ? "friendly" : null,
      intlStage: stage || (c.indexOf("亚洲杯小组赛") >= 0 ? "asia-group" : null),
      intlKO: !!cupKO,
      intlFinal: c.indexOf("决赛") >= 0 && c.indexOf("半决赛") < 0, // 半决赛含「决赛」子串，需排除
      intlKoStage: cupKO ? (c.indexOf("32强") >= 0 ? 0 : c.indexOf("十六强") >= 0 ? 1 : c.indexOf("八强") >= 0 ? 2 : c.indexOf("半决赛") >= 0 ? 3 : 4) : null,
      majorTournament: isWc || isAsia,
    };
  }

  window.EventCards = { popEcho, pickMainline, pickMilestone, intlFlagsOf,
    rollDaily, showDaily, afterSilentBatch, silentPick, autoResolve, DAILY_CFG, roundOf,
    sanitizeCardHtml,   // ★ P232：卡文案标签白名单（club_events 等外部拼接点共用）
    dailyPool: () => EC().daily,   // P56：G 组日常卡 + 静默批次 + 轮次归一
    afterResult, showPre, applyFx, ensure, onTransferWindow, afterSeasonEnd, onOffseason,
    charsOf,   // P102：关系/声望 7 项统一读取口（含 d.trust 旧档迁移）—— 属性面板渲染用
    _postMatch: postMatch, _beforeMatch: beforeMatch, _drawCard: drawCard,
    /* ★ P107（2026-09-17）：把「门判定」与「赛季序号换算」暴露给探针，避免探针自己
       再写一份 pass 逻辑（双源 ⇒ 探针假绿）。消费点：tools/_p107_lifecycle_audit.js。 */
    _pass: pass, _seasonNoOf: seasonNoOf, _EC: EC,
    artUrl,   // 供插画引用审计（tools/v2_art_audit.js）直接调用，避免逻辑漂移
    artStyle: artStyleStr,   // P92：插画样式串（图集感知）——渲染点统一走它，避免发布包内直发原图请求 404
    cardHeadHtml,   // P52：卡片头部标签（休赛期卡复用，保证两处样式同源）
    showCard,   // P64：邀请结果卡公开渲染入口（nation_dev.fire 使用；此前只挂了 _showCard，两壳调用都抛 not a function）
    _showCard: showCard,   // 兼容旧引用（tools/v2_smoke.js 通告卡渲染路径验证）
    showCard,   // P63 修复：nation_dev 观赛结果卡外部调用公开名（此前未导出 → TypeError）
  };
})();
