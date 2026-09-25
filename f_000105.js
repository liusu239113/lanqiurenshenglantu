/* ============================================================================
   nation_dev.js — 休赛期消费体系与国足发展（规格 docs/休赛期消费体系与国足发展规格_v1.md）
   职责：
     · 国力加成曲线（递减不封顶，底数 3）
     · 三条线的投入记账：投资理财（锁定 3 季 / 到期结算 / 赎回返 50%）、
       形象投入（国内 + 国外）、青训投入（复用 OffseasonDev 的累计值）
     · 投资页 UI + 国足发展面板 UI
   红线（规格 §8）：
     · 投资理财期望值必须 ≤ 0，赎回惩罚 50% 不得放宽（防通胀失控）
     · 强度（管比赛模拟）与积分（管抽签）必须分开 —— 本文件只碰强度
     · 双端同构：本文件属引擎层语义，Lua 端须同值同步
   数据层无 DOM 依赖部分可在 node 沙箱内被 test_nation_dev.js 直接调用。
   ============================================================================ */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&#39;", "'": "&#39;" }[c]));
  const fmt = v => (window.Career ? Career.fmtMoney(v) : String(v));
  /* P52：卡片头部双标签——转调 EventCards.cardHeadHtml，保证与事件卡完全同源 */
  const head = k => (window.EventCards && EventCards.cardHeadHtml)
    ? EventCards.cardHeadHtml(k)
    : '<div class="ec-cardhead"><span class="ec-tag">' + esc(String(k).split(" · ")[0]) + "</span></div>";

  /* P92：插画样式串——ArtSprite 可用时走图集定位（发布包内不含单图，直发原图请求会
     404）；ArtSprite 缺席（本地开发 / 单图版）时回退单图。
     ★ P293（SR-022 收口）：回退分支补 P226 同口径白名单（此前裸拼 n）——
       可用时优先走 ArtSprite.safeUrl 成品串守卫，双分支统一 fail-closed。 */
  const artOf = n => (window.ArtSprite && window.ArtSprite.style)
    ? window.ArtSprite.style(n)
    : (function () {
        let a = String(n == null ? "goal" : n).replace(/^ec_/, "").replace(/\.webp$/, "");
        if (!/^[a-z0-9_]{1,40}$/i.test(a)) a = "goal";
        return "background-image:url(assets/comic/ec_" + a + ".webp)";
      })();

  /* 多行选项按钮：.btn 是固定 46px 的 inline-flex 单行按钮，塞两行会重叠，
     故这里用内联样式覆盖为纵向布局（两壳通用，不依赖各自的 CSS 文件） */
  const BTN_MULTI = "height:auto;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:2px;text-align:left;padding:10px 14px;line-height:1.5;white-space:normal";
  function optBtn(attr, title, sub, disabled) {
    return '<button class="btn btn-ghost btn-block mb-8"' + (attr ? " " + attr : "") + (disabled ? " disabled" : "") +
      ' style="' + BTN_MULTI + '">' +
      '<span style="font-size:13.5px;font-weight:700">' + title + "</span>" +
      '<span style="font-size:11.5px;font-weight:400;color:var(--dim)">' + sub + "</span></button>";
  }

  /* ── 数值表（改这里等于改平衡；与规格 §2/§3 逐项对应） ── */
  const CFG = {
    BASE_STRENGTH: 64,        // 国足静态基础强度（NATIONS_DATA 中「中国」的值）
    BOOST_MAX: 18,            // 国力加成渐近线
    E_HALF: 5e8,              // 尺度 5 亿（元）
    E_BASE: 3,                // 曲线底数（用户要求「更陡」→ 由 2 提到 3）
    TIERS: [2, 4, 6, 9, 12, 15, 18],   // 面板展示用的档位
    MAX_STRENGTH: 92,         // 与世界第一同水平（理论上限，实际不可达；仅用于封顶保护）
    // ── P143 超级巨星效应（2026-09-19 用户拍板「天才要有爽感，但模拟要正确」）──
    //   主角球员对国家队的实力贡献系数：ovr 每超 70 加 SUPERSTAR_COEF 点。
    //   0.4→0.8：一名金球级球员（ovr95）把 64 基础队抬到 ~86（哈兰登/大圣效应的现实锚），
    //   配合国力投资与 meterBonus 可逼近 92 帽 → 世界杯冠军从「理论不可能」变「全广告天才可冲」。
    //   ★ 单源：三处消费（intl.js nationStrength / 本文件 FIFA 锚 / status）一律走 NationDev.ovrBonusOf。
    SUPERSTAR_COEF: 0.8,
    // ── P109 名单直反馈（2026-09-17 用户拍板：投资不再"看不见变化"）──
    //   国力加成 boost 直接折算成**当前国家队 23 人名单的基准 OVR 提升**（1:1，封顶 10）：
    //   · 名单页/球队强度用的 overall 立即抬升（intl.js nationSquad 应用 squadBonusOf）；
    //   · 小额投入也能在平均 OVR 的小数位上看到变化（延迟反馈 → 即时反馈）。
    SQUAD_OVR_CAP: 10,
    // ── 苗子流转链（规格 §4）──
    INTL_POT: 85,             // 国脚级门槛：潜力 ≥85（用户拍板）
    POT_JITTER: 3,            // 判定时的成长/衰退波动 ±3
    INTL_BOOST: 0.5,          // 每输送 1 名国脚 → 国力加成 +0.5
    DEV_MIN: 2, DEV_MAX: 4,   // 提拔后在国内俱乐部 2~4 季后判定
    // ── 休赛期卡片流（P49 用户拍板）──
    OFF_DECISIONS: 3,        // 每届休赛期决策次数（一笔操作 = 一次决策）
    OFF_HEAL_DAYS: 21,       // 个人特训 · 静养康复：伤病天数减少
    OFF_REST_MORALE: 12,     // 个人特训 · 调整状态：士气上升（★ P218：原「疲劳下降」随疲劳机制退役删除——恢复型选项保留士气收益）
    OFF_TRAIN_EXP: 4000,     // 个人特训 · 加练提升：经验池（EXP_PER_ABILITY = 10000）
  };

  /* 线 1｜投资理财：期望值必须为负，波动 ±10~40%，锁定 3 季 */
  const CFG_FIN = [
    { id: "bond", name: "稳健债基", min: 5e6, vol: 0.10, mean: -0.01, lock: 3, desc: "波动小，长期仍小幅亏损——理财不是致富手段。" },
    { id: "fund", name: "成长混合基金", min: 1e7, vol: 0.25, mean: -0.025, lock: 3, desc: "牛熊交替，三年到期才知道答案。" },
    { id: "venture", name: "高风险创投", min: 2e7, vol: 0.40, mean: -0.05, lock: 3, desc: "要么翻倍，要么腰斩。九成的人拿不回本金。" },
  ];
  const REDEEM_RATE = 0.5;   // 提前赎回仅返还本金 50%（用户指定：惩罚要大）

  /* 线 3｜提升足球形象（计入国力加成 E）
   *  ★★ P186（用户拍板「投资深度加大，让钱有地方用」）：
   *  ① 每项**重复可投**（旧版每季一次封死容量）——单价 ×IMAGE_STEP^(已投次数) 递增：
   *    300w → 450w → 675w → …（第 8 次 ≈ 3417w），自然形成「越投越贵」的梯度；
   *  ② 新增 2 个大项目补高位容量（青训足球之城 5000w / 申办世界杯 2 亿）。 */
  const CFG_IMAGE = [
    { id: "pitch", name: "捐建基层球场", cost: 3e6, desc: "国内轨：让县城的孩子们有块像样的场地。" },
    { id: "coach", name: "草根教练培养计划", cost: 5e6, desc: "国内轨：好苗子常有，会教的人不常有。" },
    { id: "overseas", name: "海外青训合作", cost: 8e6, desc: "国外轨：把教练和课程请进来，把球员送出去。" },
    { id: "host", name: "承办国际赛事", cost: 1.5e7, desc: "国外轨：让世界看到这里的球场和球迷。" },
    { id: "city", name: "青训足球之城", cost: 5e7, desc: "国内轨：一整座城的球场、校园与社区联赛。" },
    { id: "wcbid", name: "申办世界杯", cost: 2e8, desc: "国外轨：倾尽全力，让世界为中国足球停下来。" },
  ];
  const IMAGE_STEP = 1.5;   // 每重复投入一期，单价上浮 50%
  /** 第 count 期（0 基）的单价 = cost × IMAGE_STEP^count */
  function imagePriceOf(cfg, count) { return Math.round(cfg.cost * Math.pow(IMAGE_STEP, Math.max(0, count || 0))); }

  /* ══ P186 长期项目（年度维持 · 订阅制）═════════════════════════════
     用户拍板「固定持续维持的项目，玩家可以中断，持续期间每年从薪水扣」。
     · 年费在**年度懒 tick**（meterTick 的 seasonAnchor 处）扣除——钱不够自动断供；
     · 效果全在足球发展域内（兴趣度 / 注册球员 / 青训苗子率 / 苗子潜力下限），
       由 offseason_dev 的苗子链与 meterTick 消费——不跨到伤病/比赛系统（零 R 消耗）。 */
  const CFG_SUBS = [
    { id: "grassroot", name: "乡村足球支教", fee: 8e5, interest: 2, reg: 1.5, rate: 0, potFloor: 0,
      desc: "派出教练驻村带练——足球在县乡生根，兴趣度与注册球员年年涨。" },
    { id: "scout", name: "海外球探常驻站", fee: 2e6, rate: 0.06, potFloor: 0, interest: 0.5, reg: 0.5,
      desc: "常驻 6 国的球探网络——青训苗子成材率显著提升。" },
    { id: "medcenter", name: "梯队运动科学中心", fee: 3.5e6, rate: 0.03, potFloor: 0, interest: 1, reg: 0.8,
      desc: "科学选材与运动监测——苗子率再上台阶。" },
    { id: "coacht", name: "青训教练天团", fee: 5e6, rate: 0, potFloor: 2, interest: 1.5, reg: 1,
      desc: "顶级青训教练团队坐镇——在培苗子的潜力下限整体抬升。" },
  ];
  /** 订阅快照：{rate: 苗子率加成(pp), potFloor: 潜力下限+}（供 offseason_dev 苗子链消费；旧档零订阅=零加成零漂移） */
  function subBonusOf(d) {
    const out = { rate: 0, potFloor: 0 };
    try {
      const n = d && d.nation;
      if (!n || !Array.isArray(n.subs)) return out;
      for (const s of n.subs) {
        if (!s || s.paused) continue;
        const cfg = CFG_SUBS.find(x => x.id === s.id);
        if (!cfg) continue;
        out.rate += cfg.rate; out.potFloor += cfg.potFloor;
      }
    } catch (e) { /* ignore */ }
    return out;
  }

  /* ── 国力加成曲线 ── */
  function boostOf(E) {
    E = Math.max(0, E || 0);
    const b = CFG.BOOST_MAX * (1 - Math.pow(CFG.E_BASE, -E / CFG.E_HALF));
    return Math.max(0, Math.min(CFG.BOOST_MAX, b));
  }
  /** 反函数：达到指定加成所需累计投入（用于「距离下一档还差 X」） */
  function eForBoost(target) {
    if (target <= 0) return 0;
    if (target >= CFG.BOOST_MAX) return Infinity;
    return CFG.E_HALF * (-Math.log(1 - target / CFG.BOOST_MAX) / Math.log(CFG.E_BASE));
  }
  /** ★ P143 超级巨星效应单源：主角球员对国家队的实力贡献
   *  （ovr 每超 70 加 CFG.SUPERSTAR_COEF 点；intl.js nationStrength 与本文件共用） */
  function ovrBonusOf(ovr) {
    return Math.max(0, (ovr || 0) - 70) * CFG.SUPERSTAR_COEF;
  }

  /* ══ P141 国家足球指标（2026-09-19 用户拍板）═════════════════════════
     国家队界面展示「国内足球兴趣度 / 注册球员人数 / 世界排名」三指标：
     · 投资青训/球场（青训四动作 + 形象四项目）→ 兴趣度↑ 注册球员↑
     · 国家队战绩突破（世预赛出线/亚洲杯/世界杯各阶段定局）→ 兴趣度↑ 注册球员↑
     · 两指标【增量】反馈国家队实力（meterBonus，封顶 6）——增量口径保证旧档零冲击
     · 兴趣度年衰减 -2、注册球员按兴趣度自然增长（不投入就回落，现实叙事）
     · 世界排名 = FIFA SUM 积分（fifa_points.js，友谊赛/旁组模拟赛全额入账 +
       年度向基准回归 8% 覆盖欧洲杯等未模拟赛事），积分决定排名，排名不上屏不改比赛 */
  const METER = {
    INTEREST0: 42,          // 兴趣度初始基线（现实基调：有基础但不狂热）
    REG0: 5,                // 注册球员初始值（万人）
    REG_CAP: 80,            // 注册球员封顶（万人）
    DECAY_YEAR: 2,          // 兴趣度年衰减
    REG_GROW: 0.06,         // 注册球员年自然增长系数（× 兴趣度/100 × 存量）
    REG_BASE_GROW: 0.3,     // 年基线增长（万人）
    REGRESS: 0.08,          // FIFA 积分年度向基准回归率
    BONUS_CAP: 6,           // 指标增量实力反馈封顶
  };
  /** 战绩突破表：v = 兴趣度增量（注册球员同时 +v×0.15 万人）
   *  ★ P141b 拍板（2026-09-19）：wcq18 8→12 / ac_ch 12→8 / wc_ch 15→20，其余维持 */
  const MILESTONES = {
    wcq36:    { v: 4,  label: "世预赛第二阶段出线" },
    wcq18:    { v: 12, label: "世预赛出线，晋级世界杯" },
    wcqPO:    { v: 6,  label: "附加赛胜出，晋级世界杯" },
    ac_group: { v: 4,  label: "亚洲杯小组出线" },
    ac_r16:   { v: 4,  label: "亚洲杯十六强" },
    ac_qf:    { v: 5,  label: "亚洲杯八强" },
    ac_sf:    { v: 7,  label: "亚洲杯四强" },
    ac_ru:    { v: 7,  label: "亚洲杯亚军" },
    ac_ch:    { v: 8,  label: "亚洲杯冠军" },
    wc_group: { v: 15, label: "世界杯小组出线" },
    wc_r16:   { v: 5,  label: "世界杯十六强" },
    wc_qf:    { v: 6,  label: "世界杯八强" },
    wc_sf:    { v: 8,  label: "世界杯四强" },
    wc_ru:    { v: 10, label: "世界杯亚军" },
    wc_ch:    { v: 20, label: "世界杯冠军" },
  };

  const NationDev = {
    CFG, CFG_FIN, CFG_IMAGE, boostOf, eForBoost,

    /** 存档结构兜底（旧档可读） */
    ensure(d) {
      d.nation = d.nation || {};
      const n = d.nation;
      n.ver = n.ver || 1;
      n.image = n.image || { invested: 0, items: {} };
      n.image.items = n.image.items || {};
      n.finance = n.finance || { holdings: [], principal: 0, payout: 0, settled: 0 };
      n.finance.holdings = n.finance.holdings || [];
      n.lastTick = n.lastTick || 0;
      /* ★ P141 国家足球指标兜底（旧档自动获得基线）。
         ★ earned = 人工增量账本（投资 0.5/百万 + 战绩里程碑逐项累计）——实力反馈
           只吃 earned，不读 interest/reg 绝对值：基线年度自然增长不产生实力漂移，
           「无投资时与旧公式一致」恒成立（P141 探针实证后重构）。 */
      n.meters = n.meters || { interest: METER.INTEREST0, regPlayers: METER.REG0, seasonAnchor: null, milestones: [], earned: 0 };
      n.meters.milestones = n.meters.milestones || [];
      if (typeof n.meters.earned !== "number") n.meters.earned = 0;
      /* ★ P186 长期项目（订阅制）：[{id, startedSeason, lastCharge, paused}]——旧档自动获得空表 */
      n.subs = Array.isArray(n.subs) ? n.subs : [];
      /* 旧档迁移：graduates 里的历史条目没有 status 字段，一律按「普通职业球员」归档 */
      const grads = (d.academy && d.academy.graduates) || [];
      grads.forEach(g => { if (!g.status) g.status = "pro"; });
      /* ★★ P273 挂账自愈：冠军奖杯在册而战绩突破挂账缺失（历史吞账 / 旧档损伤）→
         从 trophies 补挂里程碑记录（只补记录不补兴趣度——兴趣度已是结果态，补加会虚增）。
         锚点：settleWorldCup/settleAsiaCup 夺冠时必 push「世界杯冠军」/「亚洲杯冠军」奖杯（带 season）。
         补挂后按赛季稳定排序（「最近」= 数组尾语义恢复），超 30 条裁最老。 */
      try {
        if (Array.isArray(d.trophies) && Array.isArray(n.meters.milestones)) {
          let healed = false;
          for (const t of d.trophies) {
            if (!t || typeof t.season !== "number") continue;
            let mk = null;
            if (t.name === "世界杯冠军") mk = "wc_ch";
            else if (t.name === "亚洲杯冠军") mk = "ac_ch";
            if (!mk) continue;
            if (!n.meters.milestones.some(x => x.key === mk && x.season === t.season)) {
              n.meters.milestones.push({ key: mk, season: t.season, label: MILESTONES[mk].label, v: MILESTONES[mk].v });
              healed = true;
            }
          }
          if (healed) {
            n.meters.milestones.sort((a, b) => a.season - b.season);
            if (n.meters.milestones.length > 30) n.meters.milestones = n.meters.milestones.slice(-30);
          }
        }
      } catch (e) { /* 自愈失败不影响读取 */ }
      return n;
    },

    /* ══ P186 长期项目（年度维持 · 订阅制）══════════════════════════
       · 开通 = 立即生效（本年度 tick 不再重复扣——lastCharge 记账）；
       · 年费在 meterTick 的 seasonAnchor 懒扣（每年恰一次；钱不够自动断供 paused）；
       · 中断 = 从列表摘除（可随时重新开通，重新计费）。 */
    SUBS: CFG_SUBS, subBonusOf,
    openSub(state, id) {
      const d = state.data, n = this.ensure(d);
      const cfg = CFG_SUBS.find(x => x.id === id);
      if (!cfg) return { ok: false, msg: "没有这个长期项目。" };
      if (n.subs.some(s => s.id === id && !s.paused)) return { ok: false, msg: "「" + cfg.name + "」正在维持中。" };
      if ((d.money || 0) < cfg.fee) return { ok: false, msg: "首年维持费 " + fmt(cfg.fee) + "，存款不足。" };
      d.money -= cfg.fee;
      const old = n.subs.find(s => s.id === id);
      if (old) { old.paused = false; old.lastCharge = d.season; old.startedSeason = old.startedSeason || d.season; }
      else n.subs.push({ id: id, startedSeason: d.season, lastCharge: d.season, paused: false });
      try { if (window.Finance) Finance.log(d, "足球发展", -cfg.fee, "开通「" + cfg.name + "」（年费，可随时中断）"); } catch (e) { /* ignore */ }
      return { ok: true, msg: "「" + cfg.name + "」开通：首年 " + fmt(cfg.fee) + " 已缴，此后每年自动续扣（可随时中断）。" };
    },
    cancelSub(state, id) {
      const d = state.data, n = this.ensure(d);
      const cfg = CFG_SUBS.find(x => x.id === id);
      const i = n.subs.findIndex(s => s.id === id);
      if (i < 0) return { ok: false, msg: "没有这个长期项目。" };
      n.subs.splice(i, 1);
      return { ok: true, msg: "「" + (cfg ? cfg.name : id) + "」已中断：停止扣费，效果即时失效。" };
    },

    /** 累计有效投入 E = 青训累计 + 形象累计（投资理财不计入，见规格 §3 线1） */
    effectiveE(state) {
      const d = state.data, n = this.ensure(d);
      let academy = 0;
      try { academy = (d.academy && d.academy.invested) || 0; } catch (e) { academy = 0; }
      return academy + (n.image.invested || 0);
    },

    /** 国力加成（供 intl.js nationStrength 调用）
     *  = 投入曲线加成 + 国脚输送加成（0.5 × 已入选国脚数）+ ★P141 指标增量加成
     *  前两项相加不分摊到 E，避免与「投入计入 E」重复计数 */
    boost(state) {
      return boostOf(this.effectiveE(state)) + CFG.INTL_BOOST * this.intlCount(state) + this.meterBonusOf(state);
    },

    /** ★ P141：不含指标项的基础加成（meterTick 回归基准用，防递归） */
    boostNoMeter(state) {
      return boostOf(this.effectiveE(state)) + CFG.INTL_BOOST * this.intlCount(state);
    },

    /** ★ P141 指标增量实力反馈：只由【人工增量】驱动（投资 0.5/百万 + 战绩里程碑），
     *  封顶 METER.BONUS_CAP。interest/reg 的年度自然演化不产生实力反馈——
     *  保证「无投资时与旧公式一致」恒成立（语义忠实：投资与战绩才反馈实力）。 */
    meterBonusOf(state) {
      const n = this.ensure(state.data), m = n.meters;
      return Math.max(0, Math.min(METER.BONUS_CAP, (m.earned || 0) / 16));
    },

    /** ★ P141 年度懒 tick（seasonAnchor 幂等）：兴趣度衰减 / 注册球员增长 / FIFA 积分回归。
     *  ★★ 绝不调 this.ensure —— meterTick ↔ ensure 互调会形成递归链（boostNoMeter→ensure
     *  再入 meterTick），栈溢出被 catch 吞掉后回归静默跳过（P141 首版实测）。
     *  这里自带 meters 兜底；调用点 = status() / onIntlMilestone()（幂等，任意次调用安全）。 */
    meterTick(state) {
      const d = state.data;
      d.nation = d.nation || {};
      const n = d.nation;
      n.meters = n.meters || { interest: METER.INTEREST0, regPlayers: METER.REG0, seasonAnchor: null, milestones: [] };
      const m = n.meters;
      if (m.seasonAnchor === d.season) return;
      m.seasonAnchor = d.season;
      m.interest = Math.max(10, m.interest - METER.DECAY_YEAR);
      m.regPlayers = Math.min(METER.REG_CAP, m.regPlayers + METER.REG_BASE_GROW + m.regPlayers * (m.interest / 100) * METER.REG_GROW);
      /* ★ P186 长期项目年度扣费（订阅制）：每年恰一次（seasonAnchor 幂等）。
         · 钱不够 → 自动断供（paused=true，效果失效，UI 提示补缴/重开）；
         · 扣费顺序固定（CFG_SUBS 表序）——R 零消耗，soak 零漂移（无订阅档零变化）。 */
      try {
        if (Array.isArray(n.subs) && n.subs.length) {
          for (const s of n.subs) {
            if (s.paused) continue;
            /* ★★ P190 双扣修复（复审探针实锤）：openSub 已缴首年（lastCharge=开通季），
               同年首次 meterTick 若不查 lastCharge 会**再扣一次**——双扣与否取决于玩家
               「先开通还是先看状态页」的操作顺序。跳过当年已缴项（去年前缴的照扣）。 */
            if ((s.lastCharge || 0) >= d.season) continue;
            const cfg = CFG_SUBS.find(x => x.id === s.id);
            if (!cfg) continue;
            if ((d.money || 0) >= cfg.fee) {
              d.money -= cfg.fee;
              s.lastCharge = d.season;
              try { if (window.Finance) Finance.log(d, "足球发展", -cfg.fee, "「" + cfg.name + "」年度维持费"); } catch (eL) { /* ignore */ }
            } else {
              s.paused = true;
              try { if (window.Finance) Finance.log(d, "足球发展", 0, "「" + cfg.name + "」资金断供，暂停维持"); } catch (eL) { /* ignore */ }
            }
          }
        }
      } catch (eS) { /* 扣费失败不阻断 tick */ }
      /* FIFA 积分年度回归：向「该国静态基准强度对应的积分」靠拢 8% ——
         覆盖欧洲杯/欧国联等本游戏未模拟的赛事；中国队的回归基准含国力加成
         （投资抬基准 → 回归目标抬 → 积分长期可持续上涨）。纯算术零 R。 */
      try {
        if (window.FifaPoints && window.NATIONS_DATA) {
          const pts = FifaPoints.ensurePoints(state);
          const teams = NATIONS_DATA.teams || {};
          const bCN = this.boostNoMeter(state);
          let ovrBonusCN = 0;
          try { if (window.PlayerSystem && d.player) ovrBonusCN = ovrBonusOf(PlayerSystem.overall(d.player)); } catch (e) { }
          for (const name of Object.keys(pts)) {
            const baseStr = teams[name] != null ? teams[name] : 60;
            /* 目标强度 → 目标积分（一次性转换；中国队的基准含国力加成——投资抬基准 → 回归目标抬） */
            const tgtStr = (name === "中国") ? baseStr + bCN + ovrBonusCN : baseStr;
            const tPts = FifaPoints.strengthToPoints(tgtStr);
            pts[name] = pts[name] + (tPts - pts[name]) * METER.REGRESS;
          }
        }
      } catch (e) { /* 回归失败不阻断 */ }
    },

    /** ★ P141 投资挂账：青训四动作（offseason_dev）调用——兴趣度/注册球员同步增长，
     *  并累计人工增量账本 earned（实力反馈唯一来源） */
    onAcademyInvest(state, cost) {
      if (!cost || cost <= 0) return;
      const n = this.ensure(state.data), m = n.meters;
      const v = (cost / 1e6) * 0.5;
      m.interest = Math.min(100, m.interest + v);
      m.regPlayers = Math.min(METER.REG_CAP, m.regPlayers + cost / 1e7);
      m.earned = (m.earned || 0) + v;
    },

    /** ★ P141 国家队战绩突破挂账（intl.js 各定局点调用；同 key 同季幂等防重）
     *  ★★ P273 修复：原幂等条件写成 `key === key`（参数自比恒真）⇒ 退化为「同季即拒」
     *  —— 同一赛季先拿亚洲杯冠军、再夺世界杯冠军时，后者挂账被静默吞掉，
     *  「最近战绩突破」永远显示先到的那条。修正为 x.key === key（同键同季才幂等）。 */
    onIntlMilestone(state, key) {
      const d = state.data, n = this.ensure(d), m = n.meters;
      const cfg = MILESTONES[key];
      if (!cfg) return null;
      if (m.milestones.some(x => x.key === key && x.season === d.season)) return null;
      try { this.meterTick(state); } catch (e) { /* tick 失败不阻断挂账 */ }
      m.milestones.push({ key, season: d.season, label: cfg.label, v: cfg.v });
      if (m.milestones.length > 30) m.milestones.shift();
      m.interest = Math.min(100, m.interest + cfg.v);
      m.regPlayers = Math.min(METER.REG_CAP, m.regPlayers + cfg.v * 0.15);
      m.earned = (m.earned || 0) + cfg.v;
      return cfg;
    },

    /** ★ P109：当前国家队名单的"基准 OVR 直提升"（intl.js nationSquad 消费的唯一入口）
     *  换算 = 国力加成 **1:1**（口径好解释：面板加成 +0.1 ⇒ 名单基准 OVR +0.1），封顶 SQUAD_OVR_CAP。
     *  ★ 派生值不落盘——投资落地后的下一次读取立即反映（"不再延迟反馈"）。 */
    squadBonusOf(state) {
      const b = this.boost(state);
      return Math.max(0, Math.min(CFG.SQUAD_OVR_CAP, b));
    },

    /** 已入选国足的苗子（唯一数据源：academy.graduates 中 status === "intl"） */
    intlList(state) {
      const d = state.data;
      const g = (d.academy && d.academy.graduates) || [];
      return g.filter(x => x.status === "intl");
    },
    intlCount(state) { return this.intlList(state).length; },

    /** 发展中的苗子（已提拔、在国内俱乐部、尚未判定） */
    devList(state) {
      const d = state.data;
      const g = (d.academy && d.academy.graduates) || [];
      return g.filter(x => x.status === "dev");
    },
    /** 落选者（留队成为普通职业球员，不消失） */
    proList(state) {
      const d = state.data;
      const g = (d.academy && d.academy.graduates) || [];
      return g.filter(x => x.status === "pro");
    },

    /** 综合状态（面板与投资页共用） */
    status(state) {
      const d = state.data, n = this.ensure(d);
      /* ★ P141 年度指标演化触发点（幂等；读取面板/投资页时演化到当前赛季） */
      try { this.meterTick(state); } catch (e) { /* tick 失败不阻断 */ }
      const e = this.effectiveE(state);
      const curve = boostOf(e);
      const intlN = this.intlCount(state);
      const rosterBoost = CFG.INTL_BOOST * intlN;
      /* ★ P141：boost 三来源 = 投入曲线 + 国脚输送 + 指标增量反馈（与 boost() 同口径） */
      const meterBonus = this.meterBonusOf(state);
      const boost = curve + rosterBoost + meterBonus;
      const academy = (d.academy && d.academy.invested) || 0;
      let ovrBonus = 0;
      try {
        if (window.PlayerSystem) ovrBonus = ovrBonusOf(PlayerSystem.overall(d.player));
      } catch (err) { ovrBonus = 0; }
      const tiers = CFG.TIERS;
      let next = null;
      for (const t of tiers) {
        if (boost < t - 0.05) { next = { boost: t, needE: eForBoost(t), needMoney: Math.max(0, eForBoost(t) - e) }; break; }
      }
      /* ★ P141 国家足球指标 + 世界排名（FifaPoints；缺模块时优雅降级） */
      const meters = n.meters;
      let rank = null, rankTotal = 0, rankAsia = null, fifaPts = null;
      try {
        if (window.FifaPoints) {
          fifaPts = Math.round(FifaPoints.pointsOf(state, "中国") || 0);
          rank = FifaPoints.rankOf(state, "中国");
          const list = FifaPoints.ranking(state);
          rankTotal = list.length;
          rankAsia = list.filter(x => FifaPoints.confedOf(x.name) === "AFC").findIndex(x => x.name === "中国") + 1;
        }
      } catch (e) { /* 排名查询失败不阻断 */ }
      return {
        e, boost, curve, rosterBoost, meterBonus, intlN, academy, image: n.image.invested || 0, ovrBonus,
        squadBonus: this.squadBonusOf(state),   // ★ P109：名单基准 OVR 直提升量
        devN: this.devList(state).length, proN: this.proList(state).length,
        strength: Math.min(CFG.MAX_STRENGTH, Math.round(CFG.BASE_STRENGTH + ovrBonus + boost)),
        next, holdings: n.finance.holdings,
        financePrincipal: n.finance.principal, financePayout: n.finance.payout,
        meters, meterBonus: this.meterBonusOf(state),          // ★ P141
        rank, rankTotal, rankAsia, fifaPts,                    // ★ P141 世界排名
      };
    },

    /* ══════════ 线 1｜投资理财 ══════════ */

    finById(id) { return CFG_FIN.filter(x => x.id === id)[0] || null; },

    investFinance(state, id) {
      const d = state.data, n = this.ensure(d);
      const cfg = this.finById(id);
      if (!cfg) return { ok: false, msg: "没有这个标的。" };
      if ((d.money || 0) < cfg.min) return { ok: false, msg: "资金不足，起投 " + fmt(cfg.min) };
      d.money -= cfg.min;
      n.finance.principal += cfg.min;
      n.finance.holdings.push({ id, name: cfg.name, amount: cfg.min, dueSeason: d.season + cfg.lock, vol: cfg.vol, mean: cfg.mean });
      return { ok: true, msg: "买入「" + cfg.name + "」" + fmt(cfg.min) + "，锁定 " + cfg.lock + " 季（第 " + (d.season + cfg.lock) + " 赛季到期）" };
    },

    /** 提前赎回：仅返还本金 50%（红线，不得放宽） */
    redeemFinance(state, idx) {
      const d = state.data, n = this.ensure(d);
      const h = n.finance.holdings[idx];
      if (!h) return { ok: false, msg: "没有这笔持仓。" };
      const back = Math.round(h.amount * REDEEM_RATE);
      d.money += back;
      n.finance.holdings.splice(idx, 1);
      n.finance.payout += back;
      return { ok: true, msg: "违约赎回「" + h.name + "」：本金 " + fmt(h.amount) + " → 只拿回 " + fmt(back) + "（罚没 50%）" };
    },

    /* ══════════ 线 3｜提升足球形象 ══════════ */

    investImage(state, id) {
      const d = state.data, n = this.ensure(d);
      const cfg = CFG_IMAGE.filter(x => x.id === id)[0];
      if (!cfg) return { ok: false, msg: "没有这个项目。" };
      const st = n.image.items[id];
      /* ★ P186：重复可投——单价 ×1.5 递增（第 N 期价格由 imagePriceOf 单源），上不封顶。 */
      const count = (st && st.count) || 0;
      const price = imagePriceOf(cfg, count);
      if ((d.money || 0) < price) return { ok: false, msg: "资金不足，本期需要 " + fmt(price) + "（已投 " + count + " 期，逐期上浮 50%）" };
      d.money -= price;
      n.image.invested = (n.image.invested || 0) + price;
      n.image.items[id] = { count: count + 1, lastSeason: d.season };
      /* ★ P141：形象投资同步抬升国内足球兴趣度（统一系数 0.5/百万） */
      this.onAcademyInvest(state, price);
      const b0 = boostOf(this.effectiveE(state) - price), b1 = boostOf(this.effectiveE(state));
      /* ★ P109：反馈落地可见——同一条 toast 里带上名单基准 OVR 的即时抬升 */
      const dSquad = this.squadBonusOf(state) - Math.max(0, Math.min(CFG.SQUAD_OVR_CAP, b0));
      const nextPrice = imagePriceOf(cfg, count + 1);
      return { ok: true, msg: "「" + cfg.name + "」第 " + (count + 1) + " 期落地，国力加成 +" + (b1 - b0).toFixed(2) +
        "（现 " + b1.toFixed(2) + "），名单基准 OVR +" + dSquad.toFixed(1) +
        "。下一期 " + fmt(nextPrice) + "。" };
    },

    /* ══════════ 苗子流转：提拔 → 真实国内俱乐部 → 国足后备池 ══════════ */

    /** 依据潜力把苗子分配到真实存在的国内俱乐部（不复用玩家所在队） */
    pickRealClub(state, pot) {
      const d = state.data;
      let L = null;
      try { L = window.LD ? (LD().leagues || LD()) : null; } catch (e) { L = null; }
      const csl = (L && L.csl && L.csl.teams) || [];
      const china = (L && L.chinaleague && L.chinaleague.teams) || [];
      let pool;
      if (pot >= 80) {
        /* P64 G2：国际声望加宽尖子池（6→12）并给直落豪门概率（70+：15%，80+：25%） */
        const g2 = (window.StarFavor) ? StarFavor.g2Elite(state, 6) : { n: 6, direct: 0, keep: 2 };
        pool = csl.slice(0, Math.min(csl.length, Math.max(6, g2.n)));
        if (g2.direct && R.chance(g2.direct)) pool = csl.slice(0, Math.min(csl.length, g2.keep));
      }
      else if (pot >= 72) pool = csl.slice(6) .concat(csl.slice(0, 6));  // 其余 → 中超
      else pool = china;                                 // 一般 → 中甲
      if (!pool.length) pool = csl.concat(china);
      pool = pool.filter(t => t && t.id !== d.clubId);
      if (!pool.length) return { id: null, name: "国内联赛俱乐部" };
      const t = pool[Math.floor(R.next() * pool.length)];
      return { id: t.id, name: t.name, strength: t.strength || 60 };
    },

    /** 国脚级判定：潜力 + 成长波动 ≥ 门槛 */
    judgeIntl(pot) {
      const jitter = R.int(-CFG.POT_JITTER, CFG.POT_JITTER);
      return { finalPot: pot + jitter, ok: pot + jitter >= CFG.INTL_POT, jitter };
    },

    /** ★ P211：理财到期结算（从 tickSeason 抽出，独立于 lastTick 幂等）。
     *  幂等性 = 「结算即从 holdings 移除」——同一持仓不会被结两次，因此**任何时刻
     *  触碰都安全**（含本季 tick 已跑后新过期的持仓：玩家档 7 季不结算的形态）。
     *  每笔结算消耗 1 次 R.next（roll 盈亏）；无持仓时零消耗。 */
    settleFinance(state) {
      const d = state.data, n = this.ensure(d);
      const settled = [];
      let total = 0;
      const keep = [];
      for (const h of (n.finance.holdings || [])) {
        if (d.season < h.dueSeason) { keep.push(h); continue; }
        const r = (h.mean || 0) + (R.next() * 2 - 1) * (h.vol || 0);
        const back = Math.max(0, Math.round(h.amount * (1 + r)));
        d.money = (d.money || 0) + back;
        n.finance.payout += back;
        n.finance.settled += 1;
        total += back - h.amount;
        settled.push({ name: h.name, amount: h.amount, back, delta: back - h.amount });
        /* ★ P211：到期结算逐笔进账户流水（此前只在 entryCard 新闻行体现，而 entryCard 死代码） */
        try { if (window.Finance) Finance.log(d, "足球发展", back, "「" + h.name + "」到期结算（本金 " + fmt(h.amount) + "）"); } catch (eFL) { /* ignore */ }
        /* ★★ P295（玩家反馈「国债到期最好加提示收回了多少，不知道有没有收到钱」）：
           结算进新闻流（News.post 模板 finance_due）——不只挂在三个 UI 入口的临时位置，
           玩家打开新闻列表就能看到回款金额与盈亏。新闻随机源独立于主 R（news.js 内部），
           不吃 soak 随机流。 */
        try {
          if (window.News && News.post) {
            News.post(state, "finance_due", {
              name: h.name,
              back: fmt(back),
              delta: ((back - h.amount) >= 0 ? "+" : "") + fmt(back - h.amount),
              heat: 60,
            });
          }
        } catch (eN) { /* 新闻失败不影响结算 */ }
      }
      n.finance.holdings = keep;
      return { settled, total };
    },

    /** 休赛期结算：理财到期 + 苗子成长/判定（苗子按 season 幂等）。
     *  ★ P211：理财段改为先行调用 settleFinance——原实现把理财包进 lastTick guard，
     *  幂等命中时理财一并跳过（放大了 entryCard 死代码 bug 的破坏面）。 */
    tickSeason(state) {
      const d = state.data, n = this.ensure(d);
      const fin = this.settleFinance(state);
      if (n.lastTick === d.season) return { ticked: false, settled: fin.settled, total: fin.total, intlNew: [], proNew: [] };
      n.lastTick = d.season;

      /* ② 苗子成长与国脚级判定 */
      const intlNew = [], proNew = [];
      const grads = (d.academy && d.academy.graduates) || [];
      for (const g of grads) {
        if (g.status !== "dev") continue;
        g.dev = (g.dev || 0) + 1;
        if (g.dev < (g.need || CFG.DEV_MIN)) continue;
        const j = this.judgeIntl(g.pot);
        g.finalPot = j.finalPot;
        if (j.ok) {
          g.status = "intl";
          g.intlSeason = d.season;
          intlNew.push(g);
        } else {
          g.status = "pro";
          proNew.push(g);
        }
      }
      return { ticked: true, settled: fin.settled, total: fin.total, intlNew, proNew };
    },

    /** ★ P211：理财到期结算兜底入口。
     *  背景（玩家实录）：tickSeason 的唯一触发点曾挂在休赛期入口卡 entryCard，
     *  而 P49 休赛期卡片流重构（homeCardHtml）后 entryCard **没有任何调用点**（死代码）
     *  → 持仓「还剩 0 季」挂 7 个赛季无人结算。
     *  修复：所有理财 UI 入口（休赛期主页卡 homeCardHtml / 理财环节卡 openFinanceCard /
     *  国家队 tab 渲染）先过这里。★刻意只挂 UI 层：soak headless 不渲染 UI，
     *  零随机流消耗、零指纹漂移。 */
    settleDue(state) {
      const fin = this.settleFinance(state);   // 理财：结算即移除，天然幂等，任何时刻触碰即结
      const t = this.tickSeason(state);        // 苗子：按 season 幂等（内部 settleFinance 已结完，no-op）
      const out = { ticked: fin.settled.length > 0 || t.ticked, settled: fin.settled, total: fin.total, intlNew: t.intlNew || [], proNew: t.proNew || [] };
      if (out.ticked) { try { State.save(); } catch (eS) { /* 存档失败不阻断 */ } }
      return out;
    },

    /** ★ P145 广告「青训苗子提前出结果」（A 档，2026-09-19 用户拍板）：
     *  对全部发展中（status="dev"）苗子立即执行国脚级判定（跳过 2~4 季观察期等待）。
     *  判定逻辑与 tickSeason ② 完全同源（judgeIntl 单源）——只是把「等」变成「现在」。
     *  配额：Ads.youthLeft 3/季（onReward 内 consume，失败不扣次数）。 */
    onYouthAd(state) {
      const d = state.data;
      const intlNew = [], proNew = [];
      const grads = (d.academy && d.academy.graduates) || [];
      for (const g of grads) {
        if (g.status !== "dev") continue;
        const j = this.judgeIntl(g.pot);
        g.finalPot = j.finalPot;
        if (j.ok) {
          g.status = "intl";
          g.intlSeason = d.season;
          intlNew.push(g);
        } else {
          g.status = "pro";
          proNew.push(g);
        }
      }
      return { intlNew, proNew };
    },

    /* ══════════ UI：投资页 ══════════ */

    show(state, onDone) {
      if (!window.UIkit || !window.State) return;
      const self = this;
      const d = state.data;
      const render = () => {
        const st = self.status(state);
        const n = self.ensure(d);
        const pct = Math.max(0, Math.min(100, (st.boost / CFG.BOOST_MAX) * 100));
        /* ★★ P97 M4-4.4：生涯积分的**第二出口** —— 与 `st.boost`（钱买的国足强度）并列展示，
           让玩家看见"我的生涯成就正在抬高整个国家的青训土壤"。0 档时不显示（避免噪音）。 */
        const odY = (window.OffseasonDev && OffseasonDev.nationShift) ? OffseasonDev.nationShift(state) : 0;
        const odPts = (window.Legacy && Legacy.points) ? Legacy.points(d) : 0;
        let html = "<h3 style='text-align:center'>" + (window.ICO ? ICO("city", 18) + " " : "") + "休赛期 · 投资安排</h3>" +
          '<div class="panel hl"><div class="panel-title">国足发展</div>' +
          '<div class="row"><span>国力加成</span><b class="c-gold">+' + st.boost.toFixed(2) + "</b></div>" +
          '<div class="stat-bar"><div class="stat-fill" style="width:' + pct + "%;background:var(--accent)\"></div></div>" +
          '<div class="dim12" style="margin-top:6px">累计有效投入 ' + fmt(st.e) +
          (st.intlN ? "　·　国脚输送 " + st.intlN + " 人 +" + st.rosterBoost.toFixed(2) : "") +
          (st.next ? "　·　下一档 +" + st.next.boost + " 还需 " + fmt(st.next.needMoney) : "　·　已接近上限") + "</div>" +
          (odY > 0 ? '<div class="dim12" style="margin-top:4px">生涯积分 <b class="c-gold">' + odPts
            + "</b> → 青训苗子潜力上限 <b class=\"c-gold\">+" + odY + "</b>（足球学校 / 青训营同步上移）</div>" : "") +
          '<div class="divider"></div><div class="row"><span>可用资金</span><b class="c-gold">' + fmt(d.money) + "</b></div></div>";

        /* 线 1：投资理财 */
        html += '<div class="panel"><div class="panel-title">投资理财 · 个人资产</div>' +
          '<div class="dim12" style="margin-bottom:8px">锁定 3 季，到期结算；期望为负，赎回只返本金 50%。<b>理财不能致富，只是为了换个方式把钱花掉。</b></div>';
        CFG_FIN.forEach(f => {
          html += optBtn('data-fin="' + f.id + '"',
            esc(f.name) + " · 起投 " + fmt(f.min),
            esc(f.desc) + "　波动 ±" + Math.round(f.vol * 100) + "%　锁定 " + f.lock + " 季");
        });
        if (n.finance.holdings.length) {
          html += '<div class="divider"></div>';
          n.finance.holdings.forEach((h, i) => {
            html += '<div class="list-item"><div class="li-main"><div class="li-title">' + esc(h.name) + " · " + fmt(h.amount) +
              '</div><div class="li-sub">第 ' + h.dueSeason + " 赛季到期（还剩 " + Math.max(0, h.dueSeason - d.season) + " 季）</div></div>" +
              '<button class="btn btn-sm btn-ghost" data-redeem="' + i + '">赎回</button></div>';
          });
        }
        html += "</div>";

        /* 线 2：赞助青训（复用现有系统） */
        html += '<div class="panel"><div class="panel-title">赞助青训 · 国内人才</div>' +
          '<div class="row"><span>累计投入</span><b>' + fmt(st.academy) + "</b></div>" +
          '<div class="divider"></div><div class="dim12">青少年邀请赛 / 足球学校 / 青训营 / 捐赠球场 —— 沿用原有青训界面。</div>' +
          '<button class="btn btn-ghost btn-block mt-8" id="nd-academy">进入青训投资 ▸</button>' +
          (st.devN > 0 && window.Ads && Ads.youthLeft(state) > 0
            ? '<button class="btn btn-gold btn-block mt-8" id="nd-youthad">' + (window.ICO ? ICO("play") : "") + " 看视频 · 青训苗子提前出结果（在培 " + st.devN + " 人，本季剩 " + Ads.youthLeft(state) + " 次）</button>"
            : "") + "</div>";

        /* 线 3：提升足球形象（★ P186：重复可投 · 递增价 + 长期项目订阅制） */
        html += '<div class="panel"><div class="panel-title">提升足球形象 · 国内 / 国外</div>' +
          '<div class="dim12" style="margin-bottom:8px">可<b>重复投入</b>——同一项目每多投一期，价格上浮 50%（投入全部计入国力加成）。</div>';
        CFG_IMAGE.forEach(it => {
          const s2 = n.image.items[it.id] || { count: 0 };
          const price = imagePriceOf(it, s2.count);
          const afford = (d.money || 0) >= price;
          html += optBtn('data-image="' + it.id + '"',
            esc(it.name) + " · " + fmt(price),
            esc(it.desc) + "　已投 " + s2.count + " 期" + (s2.count ? "（下期 " + fmt(imagePriceOf(it, s2.count + 1)) + "）" : ""),
            !afford);
        });
        html += "</div>";

        /* ★ P186 长期项目（年度维持 · 订阅制） */
        html += '<div class="panel"><div class="panel-title">长期项目 · 年度维持</div>' +
          '<div class="dim12" style="margin-bottom:8px">持续投入换来持续回报——每年自动从资金里扣维持费，<b>可随时中断</b>；资金不够自动断供（重新开通即恢复）。</div>';
        CFG_SUBS.forEach(sc => {
          const st = n.subs.find(x => x.id === sc.id);
          const active = st && !st.paused;
          const yrs = st ? Math.max(1, d.season - (st.startedSeason || d.season) + 1) : 0;
          const eff = [sc.rate ? "苗子率 +" + Math.round(sc.rate * 100) + "pp" : "",
            sc.potFloor ? "苗子潜力下限 +" + sc.potFloor : "",
            sc.interest ? "兴趣度 +" + sc.interest + "/年" : "",
            sc.reg ? "注册球员 +" + sc.reg + " 万/年" : ""].filter(Boolean).join(" · ");
          if (active) {
            html += '<div class="list-item"><div class="li-main"><div class="li-title">' + esc(sc.name) +
              ' · <span style="color:var(--gold)">维持中</span></div><div class="li-sub">' + esc(eff) +
              "　年费 " + fmt(sc.fee) + " · 已持续 " + yrs + " 年</div></div>" +
              '<button class="btn btn-sm btn-ghost" data-subcancel="' + sc.id + '">中断</button></div>';
          } else {
            const paused = st && st.paused;
            html += optBtn('data-subopen="' + sc.id + '"',
              (paused ? "恢复 " : "开通 ") + esc(sc.name) + " · 年费 " + fmt(sc.fee),
              esc(eff) + (paused ? "　<b>此前资金断供</b>" : ""),
              (d.money || 0) < sc.fee);
          }
        });
        html += "</div>";

        html += '<div class="panel"><div class="panel-title">投资理财账目</div>' +
          '<div class="stat-row"><span>累计本金 ' + fmt(n.finance.principal) + "</span><span>累计回收 " + fmt(n.finance.payout) +
          "</span><span>已结算 " + n.finance.settled + " 笔</span></div></div>";

        html += '<button class="btn btn-primary btn-block mt-12" id="nd-done">结束投资安排 ▸</button>';
        const root = UIkit.modal(html, { dismissable: false });

        const guard = (window.UIkit.guard) ? UIkit.guard : (fn => fn);
        const act = (fn, label) => guard(() => {
          const r = fn();
          UIkit.toast(r.msg, r.ok ? "green" : "");
          State.save();
          if (r.ok) render();
        }, label);

        root.querySelectorAll("[data-fin]").forEach(b => { b.onclick = act(() => self.investFinance(state, b.dataset.fin), "买入"); });
        root.querySelectorAll("[data-redeem]").forEach(b => { b.onclick = act(() => self.redeemFinance(state, +b.dataset.redeem), "赎回"); });
        root.querySelectorAll("[data-image]").forEach(b => { b.onclick = act(() => self.investImage(state, b.dataset.image), "形象投入"); });
        /* ★ P186：长期项目开通/中断 */
        root.querySelectorAll("[data-subopen]").forEach(b => { b.onclick = act(() => self.openSub(state, b.dataset.subopen), "开通长期项目"); });
        root.querySelectorAll("[data-subcancel]").forEach(b => { b.onclick = act(() => self.cancelSub(state, b.dataset.subcancel), "中断长期项目"); });
        const ac = $("#nd-academy");
        if (ac) ac.onclick = guard(() => {
          UIkit.closeModal();
          if (window.OffseasonDev) { try { OffseasonDev.show(); return; } catch (e) { /* 回落 */ } }
          render();
        }, "青训投资");
        /* ★ P145 A2：青训苗子提前出结果（配额 3/季；consume 只在 onReward 内——失败不扣） */
        const ya = root.querySelector("#nd-youthad");
        if (ya) ya.onclick = () => {
          try { if (window.Track) Track.click("BMC005", "T1", "ad_youth_early"); } catch (eT) { /* 埋点失败不阻断 */ }
          Ads.show("youth_early", () => {
            Ads.consumeYouth(state);
            const rY = self.onYouthAd(state);
            try { State.save(); } catch (eS) { /* 存档失败不阻断 */ }
            UIkit.toast({ html: (window.ICO ? ICO("check") : ""), text: " 苗子提前判定完成：国脚级 " + rY.intlNew.length + " 人 · 职业球员 " + rY.proNew.length + " 人" }, rY.intlNew.length ? "gold" : "green");
            render();
          });
        };
        const done = $("#nd-done");
        if (done) done.onclick = guard(() => { UIkit.closeModal(); onDone && onDone(); }, "结束投资");
      };
      render();
    },

    /* ══════════ UI：休赛期入口卡 ══════════
       ★ P211 考古标注：本函数是 P49 休赛期卡片流重构前的旧入口，现**无任何调用点**（死代码）。
       tickSeason 的结算触发已迁至 settleDue（homeCardHtml / openFinanceCard / 国家队 tab 三入口）。
       保留仅为回滚参照，勿再在此挂业务逻辑。 */
    entryCard(state, onDone) {
      const self = this;
      const d = state.data;
      /* 休赛期结算入口：理财到期 + 苗子成长/国脚级判定（按 season 幂等，只会跑一次） */
      const tick = this.tickSeason(state);
      if (tick.ticked) State.save();
      const st = this.status(state);
      let news = "";
      if (tick.settled && tick.settled.length) {
        news += "<br>理财到期：" + tick.settled.map(s => esc(s.name) + " " + (s.delta >= 0 ? "+" : "") + fmt(s.delta)).join("、");
      }
      if (tick.intlNew && tick.intlNew.length) {
        news += "<br><b class='c-gold'>" + tick.intlNew.map(g => esc(g.name)).join("、") + " 入选国家队！</b>　国力加成 +" +
          (CFG.INTL_BOOST * tick.intlNew.length).toFixed(2);
      }
      if (tick.proNew && tick.proNew.length) {
        news += "<br><span style='color:var(--dim)'>" + tick.proNew.map(g => esc(g.name)).join("、") + " 没能进入国足，留在俱乐部继续踢。</span>";
      }
      const html = '<div class="ec-card">' +
        head("休赛期 · 赛季落幕") +
        '<div class="ec-art" style="' + artOf("stadium") + '"></div>' +
        '<div class="ec-title">赛季结束了</div>' +
        '<div class="ec-body">赛季的账单已经结清，账户里躺着 <b>' + fmt(d.money) + "</b>。" +
        "接下来这几个月，你打算怎么安排？<br>国力加成 <b>+" + st.boost.toFixed(2) + "</b>　·　国足强度 <b>" + st.strength + "</b>" +
        (st.next ? "<br>距离下一档（+" + st.next.boost + "）还需 " + fmt(st.next.needMoney) : "") +
        news + "</div>" +
        '<div class="ec-opts">' +
        '<button class="btn btn-ghost ec-opt" id="nd-open">进投资页安排</button>' +
        '<button class="btn btn-ghost ec-opt" id="nd-panel">先看看国足发展</button>' +
        '<button class="btn btn-ghost ec-opt" id="nd-skip">这次不投，直接过休赛期</button>' +
        "</div></div>";
      CardHost.show(html, { dismissable: false });
      const guard = (window.UIkit.guard) ? UIkit.guard : (fn => fn);
      const close = () => CardHost.close();
      $("#nd-open").onclick = guard(() => { close(); self.show(state, onDone); }, "进投资页");
      $("#nd-panel").onclick = guard(() => { close(); self.panel(state, () => self.entryCard(state, onDone)); }, "国足发展");
      $("#nd-skip").onclick = guard(() => { UIkit.toast("这个休赛期没有安排投资", ""); close(); onDone && onDone(); }, "跳过休赛期");
    },

    /* ══════════ UI：国足发展面板 ══════════ */

    panel(state, back) {
      const d = state.data;
      const st = this.status(state);
      const pct = Math.max(0, Math.min(100, (st.boost / CFG.BOOST_MAX) * 100));
      const intl = this.intlList(state);
      const dev = this.devList(state);
      const pro = this.proList(state);
      const prospects = (d.academy && d.academy.prospects) || [];
      const POS_CN = { ST: "前锋", CF: "中锋", LW: "左边锋", RW: "右边锋", CAM: "前腰", CM: "中场", CDM: "后腰", CB: "中后卫", LB: "左后卫", RB: "右后卫", GK: "门将" };
      const pos = p => POS_CN[p] || p || "球员";
      const row = (label, val, cls) => '<div class="row"><span>' + label + "</span><b" + (cls ? ' class="' + cls + '"' : "") + ">" + val + "</b></div>";

      let html = "<h3 style='text-align:center'>" + (window.ICO ? ICO("cup", 18) + " " : "") + "国足发展</h3>" +
        '<div class="panel hl">' + row("国足强度", st.strength, "c-gold") +
        '<div class="dim12">基础 ' + CFG.BASE_STRENGTH + "　＋　生涯总评 " + st.ovrBonus.toFixed(1) + "　＋　投入曲线 " + st.curve.toFixed(2) +
        (st.intlN ? "　＋　国脚输送 " + st.rosterBoost.toFixed(2) + "（" + st.intlN + " 人）" : "") +
        "　（理论上限 " + CFG.MAX_STRENGTH + "）</div>" +
        '<div class="stat-bar"><div class="stat-fill" style="width:' + pct + "%;background:var(--accent)\"></div></div>" +
        '<div class="dim12" style="margin-top:6px">' + (st.next ? "下一档 +" + st.next.boost + "：还需投入 " + fmt(st.next.needMoney) : "已接近理论上限") + "</div></div>";

      html += '<div class="panel"><div class="panel-title">投入构成</div>' +
        row("青训投入", fmt(st.academy)) + '<div class="divider"></div>' +
        row("形象投入", fmt(st.image)) + '<div class="divider"></div>' +
        row("累计有效投入", fmt(st.e), "c-gold") + '<div class="divider"></div>' +
        row("国脚输送", st.intlN + " 人 × " + CFG.INTL_BOOST + " = +" + st.rosterBoost.toFixed(2)) + "</div>";

      /* ① 已入选国足 */
      html += '<div class="panel"><div class="panel-title">已入选国足（' + intl.length + "）</div>";
      if (intl.length) {
        html += intl.map(g => '<div class="list-item"><div class="li-main"><div class="li-title">' + esc(g.name) + " · " + esc(pos(g.position)) +
          '　<span class="c-gold">潜力 ' + (g.finalPot != null ? g.finalPot : g.pot) + "</span></div>" +
          '<div class="li-sub">' + esc(g.gradClubName || "国内联赛") + " · " + (g.intlSeason || "") + " 赛季入选国家队</div></div></div>").join("");
      } else {
        html += '<div class="dim12">还没有输送过国脚级球员——潜力 ≥' + CFG.INTL_POT + " 的青训苗子提拔后才有机会。</div>";
      }
      html += "</div>";

      /* ② 国内联赛发展中 */
      if (dev.length) {
        html += '<div class="panel"><div class="panel-title">国内联赛发展中（' + dev.length + "）</div>" +
          dev.map(g => '<div class="list-item"><div class="li-main"><div class="li-title">' + esc(g.name) + " · " + esc(pos(g.position)) +
            '</div><div class="li-sub">' + esc(g.gradClubName || "国内联赛") + " · 潜力 " + g.pot + " · 还有 " +
            Math.max(0, (g.need || CFG.DEV_MIN) - (g.dev || 0)) + " 季见分晓</div></div></div>").join("") + "</div>";
      }

      /* ③ 青训在训 */
      if (prospects.length) {
        html += '<div class="panel"><div class="panel-title">青训在训（' + prospects.length + "）</div>" +
          prospects.map(p => '<div class="list-item"><div class="li-main"><div class="li-title">' + esc(p.name) + " · " + esc(pos(p.position)) +
            '</div><div class="li-sub">潜力 ' + p.pot + " · 已培养 " + (p.seasons || 0) + " 季</div></div></div>").join("") + "</div>";
      }

      /* ④ 落选留队（不消失） */
      if (pro.length) {
        html += '<div class="panel"><div class="panel-title">留队成为职业球员（' + pro.length + '）</div><div class="dim12">' +
          pro.slice(-8).map(g => esc(g.name)).join("、") + (pro.length > 8 ? " 等" : "") + "——没能进国足，但一直在踢。</div></div>";
      }
      html += '<button class="btn btn-primary btn-block mt-12" id="nd-back">返回 ▸</button>';
      UIkit.modal(html, { dismissable: false });
      const guard = (window.UIkit.guard) ? UIkit.guard : (fn => fn);
      $("#nd-back").onclick = guard(() => { UIkit.closeModal(); back && back(); }, "返回");
    },

    /* ══════════ 休赛期卡片流（P49：一笔操作 = 一次决策，每届 3 次） ══════════ */

    /** 休赛期计划状态（按 season 幂等重置） */
    ensurePlan(d) {
      d.offseasonPlan = d.offseasonPlan || {};
      const p = d.offseasonPlan;
      if (p.season !== d.season) {
        p.season = d.season;
        p.left = CFG.OFF_DECISIONS;
        p.done = [];
        p.narration = false;
        /* ★ P295（玩家反馈「几年前邀请一次，之后一直灰色不能选」）：inviteUsed 只在此前
           付了「每季重置」的账本却没进重置清单 —— 邀请过一次后跨季永久置灰。
           邀请语义 = 每届休赛期一次（UI 文案「本届已发出过邀请」），随届重置。 */
        p.inviteUsed = false;
      }
      if (typeof p.left !== "number") p.left = CFG.OFF_DECISIONS;
      if (!Array.isArray(p.done)) p.done = [];
      return p;
    },

    /** 剩余安排次数 */
    decisionsLeft(state) { return this.ensurePlan(state.data).left; },

    /** 消耗一次决策（返回是否成功） */
    useDecision(state, label) {
      const d = state.data;
      const p = this.ensurePlan(d);
      if (p.left <= 0) return false;
      p.left -= 1;
      p.done.push({ season: d.season, label: label || "" });
      State.save();
      return true;
    },

    /* ── 主页内嵌：休赛期日程卡 ── */
    homeCardHtml(state) {
      const d = state.data;
      /* ★ P211：进入休赛期主页卡即结算到期理财（tickSeason 幂等；原 entryCard 死代码导致永不结算） */
      const tick = this.settleDue(state);
      let news = "";
      if (tick.settled && tick.settled.length) {
        news += "<br><b class='c-gold'>理财到期：</b>" + tick.settled.map(s => esc(s.name) + " " + (s.delta >= 0 ? "+" : "") + fmt(s.delta)).join("、");
      }
      if (tick.intlNew && tick.intlNew.length) {
        news += "<br><b class='c-gold'>" + tick.intlNew.map(g => esc(g.name)).join("、") + " 入选国家队！</b>";
      }
      if (tick.proNew && tick.proNew.length) {
        news += "<br><span style='color:var(--dim)'>" + tick.proNew.map(g => esc(g.name)).join("、") + " 没能进入国足，留在俱乐部继续踢。</span>";
      }
      const p = this.ensurePlan(d);
      const st = this.status(state);
      const left = p.left;
      const offers = (d.seasonEndOffers || []).length;
      const SFN = window.StarFavor ? StarFavor.poolOf().length : 0;
      const inviteSub = !SFN ? "暂无可邀球星" : p.inviteUsed ? "本届已发出过邀请" : "把一位足坛巨星请到中国";
      const opt = (act, name, sub, dis) =>
        '<button class="btn btn-ghost ec-opt" data-plan="' + act + '"' + (dis ? " disabled" : "") + ">" + name +
        '<span class="ec-opt-sub">' + sub + "</span></button>";
      return '<div class="ec-card">' +
        head("休赛期 · " + (d.season - 1) + " 赛季落幕") +
        '<div class="ec-art" style="' + artOf("stadium") + '"></div>' +
        '<div class="ec-title">这个休赛期，你打算怎么安排？</div>' +
        '<div class="ec-body">账户 <b>' + fmt(d.money) + "</b>　·　国力加成 <b>+" + st.boost.toFixed(2) + "</b>　·　国足强度 <b>" + st.strength + "</b>" +
        (st.next ? "<br>距离下一档（+" + st.next.boost + "）还需 " + fmt(st.next.needMoney) : "") +
        news +
        '<br><span class="' + (left > 0 ? "c-gold" : "") + '" style="font-weight:800">' +
        (left > 0 ? "还可以安排 " + left + " 次" : "安排次数已用完，准备进入新赛季") + "</span></div>" +
        '<div class="ec-opts grid2">' +
        opt("finance", "投资理财", "3 标的 · 50 万起", left <= 0) +
        opt("build", "足球建设", "青训 5 · 形象 4", left <= 0) +
        opt("training", "个人特训", "养伤 · 状态 · 加练", left <= 0) +
        opt("transfer", "转会与合同", offers ? offers + " 份报价" : "暂无报价", left <= 0) +
        opt("invite", "邀请球星", inviteSub, left <= 0 || !SFN || p.inviteUsed) +
        "</div>" +
        '<div class="ec-opts" style="margin-top:10px">' +
        '<button class="btn btn-gold ec-opt" data-plan="end">结束休赛期 ▸</button>' +
        "</div></div>";
    },

    /** 绑定主页休赛期卡（由 v2/hub.js 在渲染后调用） */
    bindHomeCard(state, rerender) {
      const self = this;
      document.querySelectorAll("[data-plan]").forEach(b => {
        b.onclick = () => {
          const act = b.dataset.plan;
          if (act === "end") {
            const left = self.decisionsLeft(state);
            /* P133：原生 confirm → UIkit.confirm（WebView 兼容；Promise 链保序） */
            const doEnd = () => {
              if (window.Hub && Hub.skipOffseason) Hub.skipOffseason();
              else if (window.Hub) Hub.refresh(null);
            };
            if (left > 0) {
              UIkit.confirm({
                title: "结束休赛期？",
                body: "还有 " + left + " 次安排机会。确定结束休赛期？将一次性快进到新赛季开启，沿途公告会依次补呈。",
                okText: "结束休赛期"
              }).then(ok => { if (ok) doEnd(); });
              return;
            }
            doEnd();
            return;
          }
          if (act === "finance") self.openFinanceCard(state, rerender);
          else if (act === "build") self.openBuildCard(state, rerender);
          else if (act === "training") self.openTrainingCard(state, rerender);
          else if (act === "transfer") self.openTransferCard(state, rerender);
          else if (act === "invite") self.openInviteCard(state, rerender);
        };
      });
    },

    /** 环节卡通用外框（art 可选：P64 邀请链用专属插画，默认体育场） */
    cardShell(kicker, title, body, opts, art) {
      return '<div class="ec-card">' +
        head(kicker) +
        '<div class="ec-art" style="' + artOf(art ? String(art).replace(/^ec_/, "") : "stadium") + '"></div>' +
        '<div class="ec-title">' + esc(title) + "</div>" +
        '<div class="ec-body">' + body + "</div>" +
        '<div class="ec-opts">' + opts + "</div>" +
        '<div style="text-align:center;font-size:11px;color:var(--gray);margin-top:8px">每执行一笔操作消耗 1 次安排</div>' +
        "</div>";
    },

    /* ── 环节卡 1：投资理财（个人资产，不计入国力） ── */
    openFinanceCard(state, rerender) {
      const self = this;
      const d = state.data;
      const n = this.ensure(d);
      /* ★ P211：入口兜底结算（幂等）——休赛期主页卡已先跑过则此处 no-op；
         赛季中从国家队 tab 直入时在此补结算，杜绝「还剩 0 季」挂账。 */
      const tick = this.settleDue(state);
      if (tick.ticked && tick.settled && tick.settled.length) {
        try { UIkit.toast("理财到期结算：" + tick.settled.map(s => s.name + " " + (s.delta >= 0 ? "+" : "") + fmt(s.delta)).join("、"), "gold"); } catch (eT) { /* ignore */ }
      }
      const g = window.UIkit.guard ? UIkit.guard : (fn => fn);
      const close = () => CardHost.close();
      const done = msg => { close(); UIkit.toast(msg, "gold"); rerender && rerender(); };
      const opts = CFG_FIN.map(f => {
        const can = (d.money || 0) >= f.min;
        return '<button class="btn btn-ghost ec-opt" data-fin="' + f.id + '"' + (can ? "" : " disabled") + ">" + f.name + " · " + fmt(f.min) +
          '<span class="ec-opt-sub">' + f.desc + "（波动 ±" + Math.round(f.vol * 100) + "%）</span></button>";
      }).join("");
      const holds = (n.finance.holdings || []).map((h, i) =>
        '<div class="list-item"><div class="li-main"><div class="li-title">' + esc(h.name) + "</div>" +
        '<div class="li-sub">' + fmt(h.amount) + " · 第 " + h.dueSeason + " 赛季到期</div></div>" +
        '<button class="btn btn-sm btn-ghost" data-redeem="' + i + '">赎回</button></div>').join("");
      CardHost.show(this.cardShell("休赛期 · 投资理财", "选择一笔投资",
        "账户 <b>" + fmt(d.money) + "</b>　·　个人资产，<b>不计入国力</b>；锁定 3 季到期结算，期望略亏。赎回按 50% 返还。",
        opts + '<button class="btn btn-ghost ec-opt" id="of-back">返回 ▸</button>') +
        (holds ? '<div class="panel" style="margin-top:10px"><div class="panel-title">当前持仓</div>' + holds + "</div>" : ""),
        { dismissable: false });
      document.querySelectorAll("[data-fin]").forEach(b => {
        b.onclick = g(() => {
          const r = self.investFinance(state, b.dataset.fin);
          if (!r.ok) { UIkit.toast(r.msg, "red"); return; }
          self.useDecision(state, "投资");
          done(r.msg + "（还剩 " + self.decisionsLeft(state) + " 次安排）");
        }, "买入");
      });
      document.querySelectorAll("[data-redeem]").forEach(b => {
        b.onclick = g(() => {
          const r = self.redeemFinance(state, +b.dataset.redeem);
          if (!r.ok) { UIkit.toast(r.msg, "red"); return; }
          self.useDecision(state, "赎回");
          done(r.msg + "（还剩 " + self.decisionsLeft(state) + " 次安排）");
        }, "赎回");
      });
      const back = document.querySelector("#of-back");
      if (back) back.onclick = g(() => { close(); rerender && rerender(); }, "返回");
    },

    /* ── 环节卡 2：足球建设（青训 5 项 + 形象 4 项；提拔不消耗次数） ── */
    openBuildCard(state, rerender) {
      const self = this;
      const d = state.data;
      const n = this.ensure(d);   // ★ P186：形象项目递增价要读 image.items
      const OD = window.OffseasonDev;
      const C = (OD && OD.CFG) || {};
      const g = window.UIkit.guard ? UIkit.guard : (fn => fn);
      const close = () => CardHost.close();
      const done = msg => { close(); UIkit.toast(msg, "gold"); rerender && rerender(); };
      const can = v => (d.money || 0) >= v;
      const item = (act, name, cost, sub) =>
        '<button class="btn btn-ghost ec-opt" data-build="' + act + '"' + (can(cost) ? "" : " disabled") + ">" + name + " · " + fmt(cost) +
        '<span class="ec-opt-sub">' + sub + "</span></button>";
      let opts = '<div style="width:100%;font-size:12px;font-weight:700;color:var(--gray);margin:2px 0 0">青训轨道（提升国力）</div>';
      opts += item("inv_s", "办小型青少年邀请赛", C.INVITE_SMALL ? C.INVITE_SMALL.cost : 500000, "声望 +800");
      opts += item("inv_b", "办大型青少年邀请赛", C.INVITE_BIG ? C.INVITE_BIG.cost : 2000000, "声望 +2000，苗子率更高");
      opts += item("school", "足球学校本期投入", C.SCHOOL ? C.SCHOOL.costPerSeason : 1000000, "分期 " + (C.SCHOOL ? C.SCHOOL.seasons : 3) + " 期建成，每季产苗 35%");
      opts += item("camp", "新建青训营", C.CAMP ? C.CAMP.cost : 1500000, "下季落成，每季产苗 45%");
      /* ★ P186 高阶项目（钱有地方用） */
      opts += item("proteam", "职业梯队共建", C.PROTEAM ? C.PROTEAM.cost : 8e6, "一次性，每季产苗 55%（潜力 80-90）");
      opts += item("center", "全国青训中心本期投入", C.CENTER ? C.CENTER.costPerSeason : 25e6, "分期 3 期建成，每季产苗 65%（潜力 83-92）");
      opts += item("donate", "捐赠家乡球场", C.DONATE ? C.DONATE.cost : 300000, "声望 +500");
      opts += '<div style="width:100%;font-size:12px;font-weight:700;color:var(--gray);margin:8px 0 0">形象轨道（提升国力 · 可重复投入，逐期上浮 50%）</div>';
      CFG_IMAGE.forEach(it => {
        const cnt = (n.image.items[it.id] || {}).count || 0;
        const price = imagePriceOf(it, cnt);
        opts += '<button class="btn btn-ghost ec-opt" data-image="' + it.id + '"' + (can(price) ? "" : " disabled") + ">" + it.name + " · " + fmt(price) +
          '<span class="ec-opt-sub">' + it.desc + "　已投 " + cnt + " 期</span></button>";
      });
      opts += '<button class="btn btn-ghost ec-opt" id="of-back">返回 ▸</button>';
      CardHost.show(this.cardShell("休赛期 · 足球建设", "把钱花在中国足球上",
        "账户 <b>" + fmt(d.money) + "</b>　·　青训与形象投入<b>计入国力加成</b>，是提升国足强度的主路径。",
        opts), { dismissable: false });
      const act = (fn, label, key) => g(() => {
        const r = fn();
        if (!r || !r.ok) { UIkit.toast((r && r.msg) || "无法执行", "red"); return; }
        self.useDecision(state, key);
        done(r.msg + "（还剩 " + self.decisionsLeft(state) + " 次安排）");
      }, label);
      const bind = (sel, fn, label, key) => { const b = document.querySelector(sel); if (b) b.onclick = act(fn, label, key); };
      bind("[data-build='inv_s']", () => OD.investInvite(state, false), "小型邀请赛", "青训·邀请赛");
      bind("[data-build='inv_b']", () => OD.investInvite(state, true), "大型邀请赛", "青训·邀请赛");
      bind("[data-build='school']", () => OD.investSchool(state), "学校投入", "青训·学校");
      bind("[data-build='camp']", () => OD.investCamp(state), "新建青训营", "青训·青训营");
      /* ★ P186 高阶项目绑定 */
      bind("[data-build='proteam']", () => OD.investProteam(state), "职业梯队共建", "青训·梯队");
      bind("[data-build='center']", () => OD.investCenter(state), "青训中心投入", "青训·中心");
      bind("[data-build='donate']", () => OD.donate(state), "捐球场", "青训·捐赠");
      document.querySelectorAll("[data-image]").forEach(b => {
        b.onclick = act(() => self.investImage(state, b.dataset.image), "形象投入", "形象投入");
      });
      const back = document.querySelector("#of-back");
      if (back) back.onclick = g(() => { close(); rerender && rerender(); }, "返回");
    },

    /* ── 环节卡 3：个人特训（恢复型 + 成长型） ── */
    openTrainingCard(state, rerender) {
      const self = this;
      const d = state.data;
      const g = window.UIkit.guard ? UIkit.guard : (fn => fn);
      const close = () => CardHost.close();
      const done = msg => { close(); UIkit.toast(msg, "gold"); rerender && rerender(); };
      const canHeal = (d.injuryDays || 0) > 0;
      const opts =
        '<button class="btn btn-ghost ec-opt" id="ot-heal"' + (canHeal ? "" : " disabled") + ">静养康复" +
        '<span class="ec-opt-sub">' + (canHeal ? "伤病 −" + CFG.OFF_HEAL_DAYS + " 天（当前 " + d.injuryDays + " 天）" : "当前没有伤病") + "</span></button>" +
        /* ★ P218：疲劳文本随疲劳机制退役删除——「调整状态」保留士气收益 */
        '<button class="btn btn-ghost ec-opt" id="ot-rest">调整状态' +
        '<span class="ec-opt-sub">士气 +' + CFG.OFF_REST_MORALE + " · 放松身心</span></button>" +
        '<button class="btn btn-ghost ec-opt" id="ot-train">加练提升' +
        '<span class="ec-opt-sub">经验池 +' + CFG.OFF_TRAIN_EXP + "（约 0.4 点属性，新赛季首次训练结算）</span></button>" +
        '<button class="btn btn-ghost ec-opt" id="of-back">返回 ▸</button>';
      CardHost.show(this.cardShell("休赛期 · 个人特训", "把时间花在自己身上",
        "士气 <b>" + Math.round(d.morale || 0) + "</b>　·　伤病 <b>" + (d.injuryDays || 0) + " 天</b>", opts),
        { dismissable: false });
      const heal = document.querySelector("#ot-heal");
      if (heal) heal.onclick = g(() => {
        const days = d.injuryDays;
        d.injuryDays = Math.max(0, days - CFG.OFF_HEAL_DAYS);
        if (d.injuryDays === 0) { d.flags = d.flags || {}; d.flags.justReturned = true; }
        self.useDecision(state, "静养康复");
        done("伤病 " + days + " → " + d.injuryDays + " 天（还剩 " + self.decisionsLeft(state) + " 次安排）");
      }, "静养");
      const rest = document.querySelector("#ot-rest");
      if (rest) rest.onclick = g(() => {
        /* ★ P218：疲劳衰减随疲劳机制退役删除——保留士气收益 */
        d.morale = Math.min(100, (d.morale || 60) + CFG.OFF_REST_MORALE);
        self.useDecision(state, "调整状态");
        done("状态已调整（还剩 " + self.decisionsLeft(state) + " 次安排）");
      }, "调整状态");
      const train = document.querySelector("#ot-train");
      if (train) train.onclick = g(() => {
        d.expPool = (d.expPool || 0) + CFG.OFF_TRAIN_EXP;
        self.useDecision(state, "加练提升");
        done("加练完成，经验 +" + CFG.OFF_TRAIN_EXP + "（还剩 " + self.decisionsLeft(state) + " 次安排）");
      }, "加练");
      const back = document.querySelector("#of-back");
      if (back) back.onclick = g(() => { close(); rerender && rerender(); }, "返回");
    },

    /* ── P100-B4：赛季中转会窗卡（欧洲冬窗 1 月 / 中超夏窗 6-7 月，hub 非比赛日入口） ── */
    openWinterCard(state, rerender) {
      const d = state.data;
      const T = window.Transfer;
      const g = window.UIkit.guard ? UIkit.guard : (fn => fn);
      const close = () => CardHost.close();
      const done = msg => { close(); UIkit.toast(msg, "gold"); State.save(); rerender && rerender(); };
      /* esc/fmt 用模块顶层定义（:17-18） */

      if (!T || !T.windowOpen || !T.windowOpen(d)) {
        CardHost.show('<div class="ec-card"><div class="ec-title">转会窗未开放</div><div class="ec-body">窗口开放期：欧洲联赛 1 月冬窗 / 中超 6-7 月夏窗。</div><div class="ec-opts"><button class="btn btn-ghost ec-opt" id="wf-stay">返回 ▸</button></div></div>');
        const bk = document.querySelector("#wf-stay");
        if (bk) bk.onclick = g(close, "返回");
        return;
      }

      /* ★★ P299（Tap 玩家反馈「转会窗可以无限转会」实锤，热点资讯同源双端在案）：本窗已完成过一次
         转会/外租 → 整窗关闭（报价 / 外租 / 广告刷新全部不再出现）。applyMidSeason 侧另有硬门
         双保险（midMovedSeason 比对 d.season，跨季天然失效）。 */
      const _tMoved = d.transfer || {};
      if (_tMoved.midMovedSeason === d.season) {
        CardHost.show('<div class="ec-card"><div class="ec-title">本窗交易已完成</div><div class="ec-body">一个转会窗只有一次机会——你在这个窗已经完成转会或外租。下一个窗口开放前，安心踢球。</div><div class="ec-opts"><button class="btn btn-ghost ec-opt" id="wf-moved-ok">返回 ▸</button></div></div>');
        const dk = document.querySelector("#wf-moved-ok");
        if (dk) dk.onclick = g(close, "返回");
        return;
      }

      // 窗内一次性生成报价（_winterAdded 每季重置；窗内重开复用已生成列表）
      // ★ P285：读缓存前过滤现队——修复旧档已污染的缓存（报价里挂着自己现队「冬窗加盟」，
      //   能把自己转会给自己）；新档由 resetWindow/applyMidSeason 双清保证不再产生。
      const t = d.transfer = d.transfer || {};
      let offers = t._winterOffers || null;
      if (offers && offers.length) offers = offers.filter(o => o.clubId !== d.clubId);
      if (!offers || !offers.length) {
        const trig = T.winterTriggers(state);
        const apps = (d.seasonStats && d.seasonStats.apps) || 0;
        const avgR = apps ? (d.seasonStats.ratingSum || 0) / apps : 6.8;
        offers = T.genMidSeasonOffers(state, trig || "listed", avgR);
        t._winterOffers = offers;
        t._winterAdded = true;
        State.save();
      }

      let list = "";
      offers.forEach((o, i) => {
        list += '<div class="panel" style="margin-bottom:8px"><b>' + esc(o.clubName) + "</b>（" + esc(o.leagueName) + "）" +
          '<div class="dim12" style="margin:4px 0">周薪 ' + fmt(o.wage) + " · 签字费 " + fmt(o.signingBonus || 0) +
          (o.tag ? " · " + esc(o.tag) : "") + "</div>" +
          '<button class="btn btn-primary ec-opt" id="wf-go-' + i + '">冬窗加盟 ▸</button></div>';
      });
      if (!offers.length) list = '<div class="dim12" style="margin:8px 0">窗开着，但暂时没有实质报价——用表现让市场记住你。</div>';

      /* ★ P100-B6：外租锻炼（赛季中租借）——无永久报价时的练级通道；季末自动归队（career.js 归还链）。
         报价每窗一次（_winterLoans），仅非租借状态开放。 */
      let loanList = "";
      let loanOffers = [];
      if (!d.loan) {
        loanOffers = t._winterLoans || null;
        if (!loanOffers) {
          loanOffers = (T.genLoanOffers ? T.genLoanOffers(state, 2) : []).filter(o => CONFIG.calOf(o.leagueId).crossYear === CONFIG.calOf(d.leagueId).crossYear);
          t._winterLoans = loanOffers;
          State.save();
        }
        loanOffers.forEach((o, i) => {
          loanList += '<div class="panel" style="margin-bottom:8px"><b>' + esc(o.clubName) + "</b>（" + esc(o.leagueName) + "）" +
            '<div class="dim12" style="margin:4px 0">租借至赛季末 · 上场机会 ' + esc(o.playingTime || "轮换") + '</div>' +
            '<button class="btn btn-ghost ec-opt" id="wf-loan-' + i + '">外租锻炼 ▸</button></div>';
        });
      }

      const tfLeft = (window.Ads && Ads.transferLeft) ? Ads.transferLeft(state) : 0;
      const html = '<div class="ec-card">' +
        (window.EventCards && EventCards.cardHeadHtml ? EventCards.cardHeadHtml("transfer") : "") +
        '<div class="ec-title">' + (d.leagueId === "csl" || d.leagueId === "chinaleague" ? "夏窗 · 赛季中转会" : "冬窗 · 赛季中转会") + "</div>" +
        '<div class="ec-body">' + list +
        (list ? "" : "") +
        '<div class="row" style="margin-top:8px"><button class="btn btn-ghost ec-opt" id="wf-refresh"' + (tfLeft <= 0 || !window.Ads ? " disabled" : "") + '>▶ 看广告 · 刷新报价（本季剩 ' + tfLeft + ' 次）</button></div>' +
        (loanOffers.length ? '<div class="panel-title" style="margin-top:10px">外租锻炼（租借至赛季末，期满归队）</div>' + loanList : "") +
        '<div class="dim12" style="margin-top:6px">赛季中转会立即生效：杯赛资格不随人走，剩余赛程按新球队接续。</div></div>' +
        '<div class="ec-opts"><button class="btn btn-ghost ec-opt" id="wf-stay">留队 ▸</button></div></div>';
      CardHost.show(html);

      /* ★ P120：看广告刷新窗内报价（每季 2 次；重掷 _winterOffers 缓存后重开卡片） */
      const rf = document.querySelector("#wf-refresh");
      if (rf) rf.onclick = g(() => {
        if (!window.Ads) { UIkit.toast("广告能力暂不可用", "red"); return; }
        if (Ads.transferLeft(state) <= 0) { UIkit.toast("本赛季刷新次数已用完", "red"); return; }
        Ads.show("transfer", () => {
          Ads.consumeSeason(state);
          delete t._winterOffers;
          delete t._winterAdded;
          State.save();
          UIkit.toast({ html: "", text: " 又有几家俱乐部打来电话…" }, "gold");
          if (window.NationDev) NationDev.openWinterCard(state, rerender);
        });
      }, "刷新报价");

      offers.forEach((o, i) => {
        const b = document.querySelector("#wf-go-" + i);
        if (b) b.onclick = g(() => {
          const from = T.applyMidSeason(state, o);
          done(from ? "冬窗官宣：你已从 " + from + " 加盟 " + o.clubName + "！" : "转会窗未开放");
        }, "冬窗加盟");
      });
      loanOffers.forEach((o, i) => {
        const b = document.querySelector("#wf-loan-" + i);
        if (b) b.onclick = g(() => {
          const from = T.applyMidSeason(state, o, { loan: true });
          done(from ? "外租官宣：你已从 " + from + " 租借加盟 " + o.clubName + "（赛季末归队）。" : "转会窗未开放");
        }, "外租锻炼");
      });
      const stay = document.querySelector("#wf-stay");
      if (stay) stay.onclick = g(() => { close(); rerender && rerender(); }, "留队");
    },

    /* ── 环节卡 4：转会与合同（P61 重构：风格报价对比 + 解约金谈判 + 冬窗通道） ── */
    openTransferCard(state, rerender) {
      const self = this;
      const d = state.data;
      const T = window.Transfer;
      const offers = d.seasonEndOffers || [];
      const club = ((window.teamById && teamById(d.clubId)) || { name: "现俱乐部" }).name;
      const g = window.UIkit.guard ? UIkit.guard : (fn => fn);
      const close = () => CardHost.close();
      const done = msg => { close(); UIkit.toast(msg, "gold"); rerender && rerender(); };
      const meta = d.seasonEndMeta || {};

      // 冬窗触发（救援/挂牌/强挖）：追加额外报价（一次性）
      if (T) {
        /* ★ P299（同类口子一并收口）：已接受下家（nextClub）/租借期内不再追加冬窗报价——
           堵「休赛期先签 X，重开卡时 megaswap 又掷中 → 追加报价再签 Y」的同窗双转会口子
           （原口径下 _winterAdded 未置位时最多可两连；无限循环只在赛季中窗，见 openWinterCard）。 */
        const trig = (!d.nextClub && !d.loan) ? T.winterTriggers(state) : null;
        if (trig && !d.transfer._winterAdded) {
          const extra = T.genWinterOffers(state, trig, meta.avgRating);
          if (extra.length) {
            d.seasonEndOffers = offers.concat(extra);
            d.transfer._winterAdded = true;
            offers.push(...extra);
          }
        }
      }

      // ── 特例区：解约金被触发 / 降级危机 ──
      let special = "";
      const tc = T && d.transfer && d.transfer.clauseTriggered;
      if (tc) {
        special += '<div class="panel alt" style="margin-bottom:10px"><b style="color:var(--gold)">' + (window.ICO ? ICO("thunder", 13) + " " : "") + '解约金被触发</b>' +
          '<div class="dim12" style="margin:6px 0">' + esc(tc.clubName) + " 直接掏了 " + fmt(tc.fee) + " 违约金——按条款，决定权在你。</div>" +
          '<button class="btn btn-ghost ec-opt" id="tf-clause-walk">履行条款，' + esc(tc.clubName) + " ▸</button>" +
          '<button class="btn btn-ghost ec-opt" id="tf-clause-stay">留下（母队涨薪 18% + 解约金上调）▸</button></div>';
      }
      if (T && d.transfer && d.transfer.relegCrisis && !meta.expired && !d.nextClub) { /* ★ P299：已锁定下家不再渲染降级条款（tf-releg-free 会重掷报价=二次转会口子） */
        special += '<div class="panel alt" style="margin-bottom:10px"><b style="color:var(--gold)">▼ 降级危机条款</b>' +
          '<div class="dim12" style="margin:6px 0">球队深陷降级区。你的合同含降级条款：可接受降薪 40% 留队，或激活条款恢复自由身。</div>' +
          '<button class="btn btn-ghost ec-opt" id="tf-releg-stay">接受降薪 40% 留队 ▸</button>' +
          '<button class="btn btn-ghost ec-opt" id="tf-releg-free">激活条款，恢复自由身 ▸</button></div>';
      }

      // ── 报价列表（富化字段）──
      let opts = "";
      offers.forEach((o, i) => {
        const stCfg = T ? (T.STYLE_CFG[o.style] || T.STYLE_CFG.regular) : null;
        const stTag = stCfg ? '<span style="font-size:10px;border:1px solid var(--line);border-radius:99px;padding:0 6px;margin-left:6px;color:var(--gray)">' + stCfg.label + "</span>" : "";
        /* ★ P220：续约报价专属渲染（俱乐部主动挽留，置首） */
        const label = o.renew
          ? '<b style="color:var(--gold)">与 ' + esc(o.clubName || o.clubId) + " 续约</b>"
          : esc(o.clubName || o.clubId);
        const sub = o.renew
          ? '<span class="ec-opt-sub">俱乐部主动挽留：周薪 ' + fmt(o.wage) + " · 续约 " + (o.years || 2) + " 年 · 忠诚奖金 " + fmt(o.signingBonus || 0) + "（不消耗安排次数）</span>"
          : '<span class="ec-opt-sub">周薪 ' + fmt(o.wage || 0) + " · 签字费 " + fmt(o.signingBonus || 0) +
          (o.fee ? " · 转会费 " + fmt(o.fee) : " · 自由转会") +
          /* ★ P117 战术适配：报价必带承诺位置与球队战术（球队地位=承诺出场时间） */
          (o.slotPos ? " · <b style='color:var(--gold)'>承诺位置：" + esc(o.slotPosName || o.slotPos) + (o.cross ? "（客串）" : "") + "</b>" : " · " + (o.playingTime === "starter" ? "承诺主力" : "轮换定位")) +
          (o.promise ? " · " + esc(o.promise) : "") +
          (o.tactic ? " · 球队战术：" + esc(o.tactic) : "") +
          (o.ambition ? " · " + o.ambition : "") +
          (o.releaseClause ? " · 解约金 " + fmt(o.releaseClause) : stCfg && o.style === "elite" ? " · 无解约金" : "") +
          (o.winter ? " · " + (o.winterTag || "冬窗") : "") + "</span>";
        opts += '<button class="btn btn-ghost ec-opt" data-offer="' + i + '">' + label + stTag + sub + "</button>";
      });
      const T2 = T && d.transfer ? d.transfer : null;
      const _fv = window.ClubEvents && ClubEvents.foreverOn(d);
      /* ★ P299（规矩：每窗最多转会一次）：canReq/canPressure 加 nextClub 门——
         已锁定下家后递交申请/施压会经 genWinterOffers 追加新报价 → 二次转会口子，全部关闭。 */
      const canReq = T && T2 && !T2.requested && !T2.listed && !T2.frozen && !d.loan && !d.nextClub && !_fv; // P63 forever：申请按钮隐藏
      const canPressure = T && T2 && T2.requested && T2.reqRefused && !T2.pressureUsed && !T2.listed && !T2.frozen && !d.nextClub && !_fv;
      const canLoan = T && T.loanEligible(state) && T.loanAuction(state);
      if (canReq) opts += '<button class="btn btn-ghost ec-opt" id="tf-req">递交转会申请' +
        '<span class="ec-opt-sub">公开要求离队：球迷关系受损，俱乐部可能放人也可能翻脸</span></button>';
      if (canPressure) opts += '<button class="btn btn-ghost ec-opt" id="tf-pressure">联合队友施压' +
        '<span class="ec-opt-sub">更衣室联名逼宫（一次性）：看人缘，也看俱乐部的强硬程度</span></button>';
      if (canLoan) opts += '<button class="btn btn-ghost ec-opt" id="tf-loan-open">外租练级（租借市场）' +
        '<span class="ec-opt-sub">多家俱乐部排队求租：挑时间、挑联赛，或拒绝留在母队</span></button>';
      /* ★★ P180（用户拍板）：看广告自选下家（1 次/季）—— 联赛 → 球队 → 锁定加盟（走既有条款谈判/applyOffer 链）
         ★ P299（规矩：每个转会窗最多转会一次）：已锁定下家（d.nextClub）后按钮隐藏——
           广告自选是「这一窗唯一一次转会」的选人方式，不是绕过一次上限的后门；能力本体不动。 */
      const canPick = window.Ads && T && T2 && !T2.frozen && !d.loan && !d.nextClub && !_fv;
      if (canPick) {
        const pickLeft = Ads.pickClubLeft(state);
        opts += '<button class="btn btn-ghost ec-opt" id="tf-pick"' + (pickLeft <= 0 ? " disabled" : "") + '>' + (window.ICO ? ICO("play", 13) + " " : "") + (pickLeft > 0 ? "看视频 · 指定下家" : "指定下家（本季已用）") +
          '<span class="ec-opt-sub">' + (pickLeft > 0 ? "看一次视频：任选联赛与球队，直接锁定加盟（每季 1 次）" : "每季仅 1 次，本季机会已用") + "</span></button>";
      }
      if (window.ClubEvents && ClubEvents.canForever(d)) opts += '<button class="btn btn-ghost ec-opt" id="dor-forever">' + (ClubEvents.foreverLabel ? ClubEvents.foreverLabel(d) : "向看台宣誓（永不离队）") +
        '<span class="ec-opt-sub">不可逆：从此封锁全部转会通道，直到退役——荣誉页解锁「一生一队」</span></button>'; // P63
      opts += '<button class="btn btn-ghost ec-opt" id="ot-stay">' + (d.loan ? "返回母队 " + esc(d.loan.fromClubName) : "留守 " + esc(club)) +
        '<span class="ec-opt-sub">' + (d.loan ? "租借期满自动归队（不消耗安排次数）" : "放弃本季报价（不消耗安排次数）") + "</span></button>" +
        '<button class="btn btn-ghost ec-opt" id="of-back">返回 ▸</button>';

      let kicker = "休赛期 · 转会与合同", head = offers.length ? "去，还是留" : "暂无报价";
      let body = offers.length ? "共 " + offers.length + " 份报价。接受一份将改变下赛季的俱乐部。" : "本赛季没有俱乐部向你报价，可以选择留守。";
      /* ★ P220：合同到期 → 显性「自由身」状态文案（旧文案「暂无报价」让玩家以为无事发生） */
      if (meta.expired && !d.loan) {
        const hasRenew = offers.some(o => o.renew);
        head = "合同到期 · 自由身";
        body = "你的合同已经到期。" + (hasRenew ? "现俱乐部递上了续约报价；" : "") +
          "自由身加盟任何球队都不产生转会费，签字费也更丰厚——这份选择权，是你职业生涯最值钱的筹码之一。";
      }
      if (T && d.transfer && d.transfer.frozen) { head = "雪藏中的转会窗"; body = "你仍处于雪藏状态（第 " + d.transfer.frozen.weeks + " 周）。接受报价是唯一的出路，或者向管理层低头。"; }
      else if (T && d.transfer && d.transfer.listed) { head = "你已被挂牌"; body = "俱乐部不再强留你。收好这些报价——走得体面一点。"; }
      else if (d.loan) { head = "租借期转会窗"; body = "你在 " + esc(d.loan.fromClubName) + " 的外租赛季结束。用表现换一份正式报价，或回母队重新开始。"; }
      else if (_fv) { head = "你是多特蒙顿的人"; body = "这里没有你的转会窗。"; } // P63 forever：单卡文案

      CardHost.show('<div class="ec-card">' +
        (window.EventCards && EventCards.cardHeadHtml ? EventCards.cardHeadHtml(kicker) : "") +
        '<div class="ec-art" style="' + artOf(T && d.transfer && d.transfer.frozen ? "bench" : "transfer") + '"></div>' +
        '<div class="ec-title">' + esc(head) + "</div>" +
        '<div class="ec-body"><div class="dim12">' + body + "</div>" + special + "</div>" +
        '<div class="ec-opts">' + opts + "</div></div>", { dismissable: false });

      const acceptOffer = o => {
        /* ★ P299（规矩：每个转会窗最多转会一次）：UI 侧总闸——已锁定下家后，常规报价/看广告指定下家/
           条款路径全部在此拒绝（applyOffer 仍可被探针直调，硬门在 Transfer 侧按各自口径把守）。 */
        if (d.nextClub) { UIkit.toast("本转会窗已锁定下家——每个窗只能转会一次", "red"); return; }
        const finish = clauseMult => {
          const old = T ? T.applyOffer(state, o, clauseMult) : club;
          d.seasonEndMeta = null;
          self.useDecision(state, "转会");
          State.save();
          done("加盟 " + (o.clubName || o.clubId) + "！（还剩 " + self.decisionsLeft(state) + " 次安排）");
        };
        const stCfg = T ? (T.STYLE_CFG[o.style] || T.STYLE_CFG.regular) : null;
        const clauseHtml = o.releaseClause
          ? '<div class="panel alt"><div class="panel-title">合同条款谈判</div><div class="dim12">报价自带解约金 <b>' + fmt(o.releaseClause) + "</b>。压低解约金 = 让渡部分薪资（跳板条款的逻辑）。</div>" +
            '<button class="btn btn-ghost ec-opt" data-cm="1">按报价签：周薪 ' + fmt(o.wage) + " · 解约金 " + fmt(o.releaseClause) + "</button>" +
            '<button class="btn btn-ghost ec-opt" data-cm="0.9">压一档：周薪 ' + fmt(Math.round(o.wage * 0.9)) + " · 解约金 " + fmt(Math.round(o.releaseClause * 0.75)) + "</button>" +
            '<button class="btn btn-ghost ec-opt" data-cm="0.81">压两档：周薪 ' + fmt(Math.round(o.wage * 0.81)) + " · 解约金 " + fmt(Math.round(o.releaseClause * 0.56)) + "</button></div>"
          : '<div class="panel alt"><div class="panel-title">合同条款</div><div class="dim12">' +
            (stCfg && o.style === "elite" ? "豪门惯例：合同不含解约金条款——他们不打算放你走。" : "本报价不含解约金条款。") + "</div>" +
            '<button class="btn btn-ghost ec-opt" data-cm="1">签字：周薪 ' + fmt(o.wage) + " × 3 年</button></div>";
        const negCard = T ? T.cardHtml({
          kicker: "条款谈判 · " + (o.clubName || o.clubId), art: "contract",
          title: "最后一页纸", body: "经纪人把合同推到你面前：「看完再签，签完别哭。」",
          opts: clauseHtml + '<button class="btn btn-ghost ec-opt" id="tf-neg-back">◂ 重新选</button>',
        }) : '<div class="ec-card"><div class="ec-body">' + clauseHtml + '<button class="btn btn-ghost ec-opt" id="tf-neg-back">◂ 重新选</button></div></div>';
        CardHost.show(negCard, { dismissable: false });
        document.querySelectorAll("[data-cm]").forEach(b => {
          b.onclick = g(() => finish(parseFloat(b.dataset.cm)), "签下合同");
        });
        const back = document.querySelector("#tf-neg-back");
        if (back) back.onclick = g(() => self.openTransferCard(state, rerender), "重新选");
      };

      document.querySelectorAll("[data-offer]").forEach(b => {
        b.onclick = g(() => {
          const o = (d.seasonEndOffers || offers)[+b.dataset.offer];
          if (!o) return;
          /* ★ P220：续约报价接受分支——原俱乐部留任（不换队、不入 pastClubs、不消耗安排次数） */
          if (o.renew) {
            d.contract = { years: o.years || 2, wage: o.wage };
            if (o.signingBonus) d.money = (d.money || 0) + Math.round(o.signingBonus * (window.TAL ? TAL.moneyMult(d) : 1));
            d.seasonEndOffers = []; d.seasonEndMeta = null;
            State.save();
            done("与 " + o.clubName + " 续约成功！忠诚奖金已入账（不消耗安排次数）");
            return;
          }
          acceptOffer(o);
        }, "查看报价");
      });

      // P63 forever 宣誓
      const fvBtn = document.querySelector("#dor-forever");
      if (fvBtn) fvBtn.onclick = g(() => { ClubEvents.showForever(state, rerender); }, "向黄墙宣誓");

      /* ── ★ P180 看广告自选下家：联赛 → 球队 → 生成该队报价 → 复用 acceptOffer（条款谈判/applyOffer）── */
      const pickBtn = document.querySelector("#tf-pick");
      if (pickBtn && !pickBtn.disabled) pickBtn.onclick = g(() => {
        Ads.show("pick_club", () => {
          Ads.consumePickClub(state);
          State.save();
          const lg = window.LD ? window.LD() : {};
          const lids = Object.keys(lg).filter(lid => (lg[lid].teams || []).length);
          const lgCard = T.cardHtml({
            kicker: "指定下家 · 第一步", art: "transfer", title: "选择联赛",
            body: "经纪人摊开了地图：「想去哪踢？这次你说了算。」",
            opts: lids.map(lid => '<button class="btn btn-ghost ec-opt" data-pick-lg="' + lid + '">' + esc(lg[lid].name || lid) +
              '<span class="ec-opt-sub">' + (lg[lid].teams || []).length + " 支球队</span></button>").join("") +
              '<button class="btn btn-ghost ec-opt" id="tf-pick-back">◂ 回到转会窗</button>',
          });
          CardHost.show(lgCard, { dismissable: false });
          document.querySelector("#tf-pick-back").onclick = g(() => self.openTransferCard(state, rerender), "回到转会窗");
          document.querySelectorAll("[data-pick-lg]").forEach(b => {
            b.onclick = g(() => {
              const lid = b.dataset.pickLg;
              const teams = (lg[lid].teams || []).filter(t => t.id !== d.clubId);
              const teamCard = T.cardHtml({
                kicker: "指定下家 · " + (lg[lid].short || lg[lid].name), art: "transfer", title: "选择球队",
                body: "选定期望加盟的俱乐部——看过视频的机会不退，选定即进入合同谈判。",
                opts: teams.map(t2 => '<button class="btn btn-ghost ec-opt" data-pick-team="' + t2.id + '">' + esc(t2.name) +
                  '<span class="ec-opt-sub">球队实力 ' + t2.strength + "</span></button>").join("") +
                  '<button class="btn btn-ghost ec-opt" id="tf-pick-back2">◂ 重选联赛</button>',
              });
              CardHost.show(teamCard, { dismissable: false });
              document.querySelector("#tf-pick-back2").onclick = g(() => self.openTransferCard(state, rerender), "重选联赛");
              document.querySelectorAll("[data-pick-team]").forEach(tb => {
                tb.onclick = g(() => {
                  const team = teams.find(x => x.id === tb.dataset.pickTeam);
                  if (!team) return;
                  const ovr = window.PlayerSystem ? PlayerSystem.overall(d.player) : 60;
                  const expired2 = ((d.contract && d.contract.years) || 0) <= 0;
                  /* ★ P185：广告自选下家同样吃谈判专家/签字费猎手（与冬窗报价同权） */
                  const negoM = (window.Skills && Skills.mult) ? (Skills.mult(d, "negotiator", 0.08) || 1) : 1;
                  const bhM = (window.Skills && Skills.mult) ? (Skills.mult(d, "bonusHunter", 0.15) || 1) : 1;
                  const wage = Math.max(1000, Math.round((window.Career ? Career.wageOf(ovr, team.strength, R.next()) : 3000) * negoM));
                  const offer = {
                    clubId: team.id, clubName: team.name, leagueId: lid, leagueName: lg[lid].name || lid,
                    wage: wage, signingBonus: Math.round(wage * 4 * bhM),
                    fee: expired2 ? 0 : Math.round(wage * 104),
                    style: "regular",
                    playingTime: ovr >= team.strength + 6 ? "starter" : "rotation",
                    slotPos: d.player.position, slotPosName: (window.CONFIG && CONFIG.POSITIONS[d.player.position] || {}).name || d.player.position,
                    pickedByAd: true,   // 标记：广告自选（审计用）
                  };
                  acceptOffer(offer);   // 复用既有条款谈判 → Transfer.applyOffer → 完成
                }, "锁定下家");
              });
            }, "选联赛");
          });
        });
      }, "指定下家广告");

      // 解约金触发：走 / 留
      const cw = document.querySelector("#tf-clause-walk");
      if (cw) cw.onclick = g(() => {
        const tc2 = d.transfer.clauseTriggered;
        d.money = (d.money || 0) + Math.round((d.contract.wage || 3000) * 4 * (window.TAL ? TAL.moneyMult(d) : 1));
        d.contract = { years: 3, wage: Math.min(window.Career ? Career.WAGE_CAP : 6e6, Math.round((d.contract.wage || 3000) * 1.2)) };
        d.history = d.history || {}; d.history.pastClubs = d.history.pastClubs || [];
        d.history.pastClubs.push(club);
        /* ★ P220：解约金转会落转会记录（费用=解约金条款金额） */
        d.history.transfers = d.history.transfers || [];
        d.history.transfers.push({ season: d.season, to: tc2.clubName, fee: tc2.fee || 0, free: false, clause: true });
        d.nextClub = { clubId: tc2.clubId, leagueId: tc2.leagueId };
        d.seasonEndOffers = []; d.seasonEndMeta = null;
        d.transfer.clauseTriggered = null; d.transfer.frozen = null; d.transfer.listed = false;
        self.useDecision(state, "转会");
        State.save();
        done("履行解约金条款加盟 " + tc2.clubName + "！（还剩 " + self.decisionsLeft(state) + " 次安排）");
      }, "履行条款");
      const cs = document.querySelector("#tf-clause-stay");
      if (cs) cs.onclick = g(() => {
        const nw = Math.min(window.Career ? Career.WAGE_CAP : 6e6, Math.round((d.contract.wage || 3000) * 1.18));
        d.contract = { years: Math.max(2, d.contract.years || 2), wage: nw };
        if (d.contract.releaseClause) d.contract.releaseClause.fee = Math.round(d.contract.releaseClause.fee * 1.3);
        d.transfer.clauseTriggered = null;
        State.save();
        done("留队：涨薪 18%（周薪 " + fmt(nw) + "），解约金上调 30%");
      }, "留队");

      // 降级危机：降薪留队 / 条款自由身
      const rs = document.querySelector("#tf-releg-stay");
      if (rs) rs.onclick = g(() => {
        const nw = Math.max(1000, Math.round((d.contract.wage || 3000) * 0.6));
        d.contract = { years: 2, wage: nw };
        d.transfer.relegCrisis = false;
        d.seasonEndOffers = [];
        State.save();
        done("与球队共渡难关：周薪降至 " + fmt(nw) + "，续约 2 年");
      }, "降薪留队");
      const rf = document.querySelector("#tf-releg-free");
      if (rf) rf.onclick = g(() => {
        d.contract = { years: 0, wage: d.contract.wage || 3000 };
        d.transfer.relegCrisis = false;
        const regen = SeasonSystem.genTransferOffers(state, meta.avgRating || 6.5, meta.myRank || 10);
        d.seasonEndOffers = regen;
        State.save();
        self.openTransferCard(state, rerender); // 自由身报价重开
      }, "恢复自由身");

      // 留守 → 挽留链（租借期=自动归队，不进挽留链）
      const stay = document.querySelector("#ot-stay");
      if (stay) stay.onclick = g(() => {
        const finishStay = msg => {
          if (d.seasonEndOffers) d.seasonEndOffers = [];
          if (meta.expired && d.contract && (d.contract.years || 0) > 0) { /* 挽留链已处理 */ }
          else if (meta.expired) {
            /* ★ P220：留守=标准续约——若续约报价在列则吃同一份周薪（口径统一，不再双标） */
            const rw = (d.seasonEndOffers || []).find(o => o.renew);
            d.contract = { years: 2, wage: rw ? rw.wage : meta.renewWage };
          }
          d.seasonEndMeta = null;
          State.save();
          done(msg || (meta.expired ? "续约成功，周薪 " + fmt(meta.renewWage) + "（不消耗安排次数）" : "留在 " + club + "（不消耗安排次数）"));
        };
        if (d.loan) { finishStay("租借期满，休赛期结束时返回 " + d.loan.fromClubName + "（不消耗安排次数）"); }
        else if (T && offers.length && !meta.expired) {
          T.onStayWithOffers(state, offers, msg => finishStay(msg));
        } else {
          finishStay(null);
        }
      }, "留守");

      // ── P62 转会申请 ──
      const reqBtn = document.querySelector("#tf-req");
      if (reqBtn) reqBtn.onclick = g(() => {
        const r = T.evaluateRequest(state);
        if (r.outcome === "freeze") {
          CardHost.close();
          T.startFrozen(state, "递交转会申请撕破脸");
          return;
        }
        const extra = r.outcome === "listed" ? T.genWinterOffers(state, "listed", meta.avgRating, "申请放行") : [];
        if (extra.length) { d.seasonEndOffers = (d.seasonEndOffers || []).concat(extra); }
        CardHost.show(T.cardHtml({
          kicker: "转会申请", art: "press", title: r.title,
          body: r.body + (extra.length ? "<br><b style='color:var(--gold)'>挂牌生效：新增 " + extra.length + " 份报价。</b>" : ""),
          opts: '<button class="btn btn-primary ec-opt" id="tf-req-back">回到转会窗 ▸</button>',
        }), { dismissable: false });
        document.querySelector("#tf-req-back").onclick = g(() => { State.save(); self.openTransferCard(state, rerender); }, "回到转会窗");
      }, "递交转会申请");

      // ── P62 联合施压 ──
      const preBtn = document.querySelector("#tf-pressure");
      if (preBtn) preBtn.onclick = g(() => {
        const r = T.evaluatePressure(state);
        if (r.outcome === "freeze") {
          CardHost.close();
          T.startFrozen(state, "联名逼宫触怒管理层");
          return;
        }
        const listed = r.outcome === "listed";
        const extra = listed ? T.genWinterOffers(state, "listed", meta.avgRating, "联名放行") : [];
        if (extra.length) { d.seasonEndOffers = (d.seasonEndOffers || []).concat(extra); }
        CardHost.show(T.cardHtml({
          kicker: "更衣室联名", art: "locker", title: listed ? "俱乐部让步了" : "俱乐部硬扛到底",
          body: (listed
            ? esc(r.clubName) + " 收到了更衣室的联名信——" + r.sup + " 名主力签了名。管理层权衡了三天：「挂牌吧。我们不跟整个更衣室作对。」" + (extra.length ? "新增 " + extra.length + " 份报价。" : "")
            : esc(r.clubName) + " 当众撕了联名信：「联名？把签名的名字一个个报给媒体，扣奖金。」更衣室瞬间安静——这次逼宫没成，你和队友都被架在了火上。"),
          opts: '<button class="btn btn-primary ec-opt" id="tf-pre-back">' + (listed ? "回到转会窗 ▸" : "咽下这口气 ▸") + "</button>",
        }), { dismissable: false });
        document.querySelector("#tf-pre-back").onclick = g(() => { State.save(); if (listed) self.openTransferCard(state, rerender); else { CardHost.close(); rerender && rerender(); } }, "联名结果");
      }, "联合施压");

      // ── P62 租借竞拍（高价值）──
      const loanBtn = document.querySelector("#tf-loan-open");
      if (loanBtn) loanBtn.onclick = g(() => {
        const lo = T.genLoanOffers(state, 3);
        if (!lo.length) { UIkit.toast("租借市场上没有合适的下家", "gray"); return; }
        let lOpts = "";
        lo.forEach((o, i) => {
          lOpts += '<button class="btn btn-ghost ec-opt" data-loan="' + i + '">' + esc(o.clubName) +
            '<span class="ec-opt-sub">' + esc(o.leagueName) + " · " + (o.playingTime === "starter" ? "承诺常备主力" : "轮换练级") + " · 母队照付周薪 · 租期 1 季</span></button>";
        });
        lOpts += '<button class="btn btn-ghost ec-opt" id="tf-loan-back">拒绝全部，留在母队 ▸</button>';
        CardHost.show(T.cardHtml({
          kicker: "租借市场 · 竞拍", art: "training",
          title: "多家俱乐部为你排队",
          body: "你的名字出现在租借市场上的第一时间，经纪人电话被打爆。高水平 + 年轻 = 租借市场的硬通货——现在轮到你挑下家了。",
          hint: "租期一个赛季，期满自动回归母队。外租期间的表现会决定你回归后的地位。",
          opts: lOpts,
        }), { dismissable: false });
        document.querySelectorAll("[data-loan]").forEach(b => {
          b.onclick = g(() => {
            const o = lo[+b.dataset.loan];
            if (!o) return;
            const from = T.applyLoan(state, o);
            d.seasonEndMeta = null;
            self.useDecision(state, "外租");
            State.save();
            done("租借加盟 " + o.clubName + "，期满回归 " + from + "（还剩 " + self.decisionsLeft(state) + " 次安排）");
          }, "接受租借");
        });
        const lb = document.querySelector("#tf-loan-back");
        if (lb) lb.onclick = g(() => self.openTransferCard(state, rerender), "拒绝租借");
      }, "外租练级");

      const back = document.querySelector("#of-back");
      if (back) back.onclick = g(() => { close(); rerender && rerender(); }, "返回");
    },

    /* ══════════ 环节卡 5：邀请球星（P64；设计稿 docs/球星好感度与休赛期邀请设计稿_v1.md） ══════════
       占 1 次决策 · 每届 1 次 · 同星每年 1 次 · 声望 G1 档位门槛；
       结果卡统一走 EventCards.showCard（#ec-ok 继续，fx 经 applyFx 结算显示 chips） */

    /** 选人卡：候选池（favor 降序 → OVR 降序，最多展示 10 人） */
    openInviteCard(state, rerender) {
      const self = this;
      const d = state.data;
      const SF = window.StarFavor;
      if (!SF) { UIkit.toast("好感系统未加载", "red"); return; }
      const g = window.UIkit.guard ? UIkit.guard : (fn => fn);
      const p = this.ensurePlan(d);
      if (p.inviteUsed) { UIkit.toast("本届休赛期已发出过邀请", "red"); return; }
      const pool = SF.poolOf().slice().sort((a, b) => {
        const fa = SF.favorOf(d, a.pid), fb = SF.favorOf(d, b.pid);
        return fb - fa || b.ovr - a.ovr || a.name.localeCompare(b.name);
      });
      if (!pool.length) { UIkit.toast("暂无可邀球星", "red"); return; }
      const rows = pool.slice(0, 10).map(s => {
        const el = SF.inviteEligible(state, s);
        const v = SF.favorOf(d, s.pid);
        const acts = SF.inviteActions(state, s).filter(x => x.ok).map(x => x.name).join(" / ") || "仅观赛";
        const sub = "羁绊 " + v + "（" + SF.tierOf(v) + "）· 可邀：" + acts + (el.ok ? "" : "｜" + el.reason);
        return '<button class="btn btn-ghost ec-opt" data-star="' + esc(s.pid) + '"' + (el.ok ? "" : " disabled") + ">" +
          esc(s.name + " · " + s.clubName + " · OVR" + s.ovr) +
          '<span class="ec-opt-sub">' + esc(sub) + "</span></button>";
      }).join("") + '<button class="btn btn-ghost ec-opt" id="od-back">再想想（不消耗决策）</button>';
      CardHost.show(this.cardShell("休赛期 · 邀请球星", "谁会来？",
        "名单不长，但每一个名字都够重。<br>国际声望 <b>" + Math.round(d.prestige || 50) + "</b>（决定能邀到的球星档位）",
        rows, "ec_invite"), { dismissable: false });
      document.querySelectorAll("[data-star]").forEach(b => {
        b.onclick = g(() => {
          const s = SF.starById(b.dataset.star);
          if (!s) return;
          self.openInviteActionCard(state, s, rerender);
        }, "选择球星");
      });
      const back = document.querySelector("#od-back");
      if (back) back.onclick = g(() => { CardHost.close(); rerender && rerender(); }, "返回");
    },

    /** 互动选择卡：按好感档位亮灰；确认即扣决策（婉拒也算发出过邀请） */
    openInviteActionCard(state, s, rerender) {
      const self = this;
      const d = state.data;
      const SF = window.StarFavor;
      const g = window.UIkit.guard ? UIkit.guard : (fn => fn);
      const v = SF.favorOf(d, s.pid);
      const acts = SF.inviteActions(state, s);
      const rows = acts.map(a =>
        '<button class="btn btn-ghost ec-opt" id="od-i-' + a.kind + '"' + (a.ok ? "" : " disabled") + ">" + a.name +
        '<span class="ec-opt-sub">' + esc(a.sub) + "</span></button>").join("") +
        '<button class="btn btn-ghost ec-opt" id="od-back2">重新选人</button>';
      CardHost.show(this.cardShell("休赛期 · 邀请球星", "想请 " + s.name + " 做什么？",
        esc(s.name + "（" + s.clubName + " · OVR" + s.ovr + "）") + "　羁绊 <b>" + v + "</b>（" + SF.tierOf(v) + "）",
        rows, "ec_invite"), { dismissable: false });
      const fire = (kind, youth) => {
        if ((d.offseasonPlan || {}).inviteUsed) return; // P64：防双击重入（决策双扣）
        if (!self.useDecision(state, "邀请球星")) { UIkit.toast("没有剩余安排次数", "red"); return; }
        self.ensurePlan(d).inviteUsed = true;
        const res = SF.doInvite(state, s, kind, youth);
        if (!res.ok) { UIkit.toast(res.msg || "无法邀请", "red"); rerender && rerender(); return; }
        const done2 = () => {
          CardHost.close();
          UIkit.toast("邀请已发出（还剩 " + self.decisionsLeft(state) + " 次安排）", "gold");
          rerender && rerender();
        };
        EventCards.showCard(state, res.card, { ctx: { d, teamName: (window.teamById && teamById(d.clubId) || { name: "" }).name } }, done2);
      };
      const w = document.querySelector("#od-i-watch");
      if (w) w.onclick = g(() => fire("watch"), "邀请观赛");
      const t = document.querySelector("#od-i-train");
      if (t) t.onclick = g(() => fire("train"), "邀请合练");
      const c = document.querySelector("#od-i-coach");
      if (c) c.onclick = g(() => {
        const prospects = ((d.academy && d.academy.prospects) || []).filter(x => x.status === "dev");
        const youth = prospects.slice().sort((a, b) => (b.pot || 0) - (a.pot || 0))[0] || null;
        fire("coach", youth);
      }, "指点青训");
      const back2 = document.querySelector("#od-back2");
      if (back2) back2.onclick = g(() => self.openInviteCard(state, rerender), "重新选人");
    },
  };

  window.NationDev = NationDev;
  NationDev.ovrBonusOf = ovrBonusOf;   // ★ P143 单源导出（intl.js nationStrength / 探针用）
})();
