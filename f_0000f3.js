/* ============================================================================
   天赋系统 — 六选三抽卡（参考 FIFA PlayStyle / FM 特质 / 实况比赛风格）
   ★★ P113（2026-09-17 用户拍板）五档重构：
     · 五档 = 铜(bronze) < 银(silver) < 金(gold) < 铂金(platinum) < 钻石(diamond)，
       效果逐级递增，越高级出现概率越低；
     · **能力值 / 属性值类天赋出现概率最高**（cat: attr / skill），成长速度次之；
       场外（life）、衰退（decline）、受伤疲劳（body）、潜力（pot）类概率压低；
     · 旧三档（普通/稀有/顶级）19 条全部审计过 hook（全真接线），本次按"语义保留 +
       档位数值化"迁移；`untiring` 删除（与 goodBase+iceBath 复合重复，高档位已覆盖）；
     · 新增**开局生效**类：attrXxx（池内属性 +N）与 readyNow（全属性 +N）由 create.confirm
       消费 `applyOnCreate`；ceiling（潜力 +N）同批应用。
   ── 存档契约 ── d.talents = [id...]（不变）；d.talentTiers = { id: tier }（新增，缺档
     视为 "bronze" —— 旧档天赋效果落在最弱档，失败安全方向 = 不凭空增强）。
   ── hook 契约 ── 数值 hook 一律走 `TAL.val(d, id)` / 具名聚合 API（goalMult 等），
     禁止在消费点写死旧字面量（1.06 / 0.3 / 70 …）—— 那会把档位体系架空成摆设。
   ============================================================================ */
(function () {

  /* ── 五档定义（rank 越大越强；weight 越小越稀有）──
     ★ P168（用户反馈「金、铜等级标志颜色接近」）：五档全部重调 + 新增 solid（实底徽章色）
     与 card（卡片描边色）两个字段——铜改深红棕（原 #b0703c 与金 #d9a418 同为暖色系，
     小字号 chip 里几乎分不清）；银压深；金提亮。徽章一律实底白字，明度即档位。 */
  const TIER = {
    bronze:   { name: "铜",   rank: 1, color: "#9c5327", bg: "rgba(156,83,39,.12)",   border: "rgba(156,83,39,.65)",  solid: "#9c5327", card: "#b0622e" },
    silver:   { name: "银",   rank: 2, color: "#5d6b7a", bg: "rgba(93,107,122,.14)",  border: "rgba(93,107,122,.65)", solid: "#647482", card: "#8794a3" },
    gold:     { name: "金",   rank: 3, color: "#c79000", bg: "rgba(217,164,24,.16)",  border: "rgba(199,144,0,.7)",   solid: "#d9a418", card: "#d9a418" },
    platinum: { name: "铂金", rank: 4, color: "#12857c", bg: "rgba(18,133,124,.13)",  border: "rgba(18,133,124,.6)",  solid: "#1fa79b", card: "#2aa79c" },
    diamond:  { name: "钻石", rank: 5, color: "#5646d8", bg: "rgba(108,92,231,.16)",  border: "rgba(86,70,216,.6)",   solid: "#6c5ce7", card: "#7b6cf6" },
  };
  const TIER_ORDER = ["bronze", "silver", "gold", "platinum", "diamond"];

  /* 档位稀有度权重：铜 100 / 银 50 / 金 24 / 铂金 10 / 钻 4（≈ 56%/28%/13.4%/5.6%/2.2%）
     ★ 用户口径：能力值类概率高 ⇒ 由 CAT_WEIGHT 放大，与档位权重相乘。 */
  const TIER_WEIGHT = { bronze: 1, silver: 0.5, gold: 0.24, platinum: 0.1, diamond: 0.04 };

  /* 类别权重（乘在档位权重上）：
     attr（属性/能力直接加成）最高 → skill（技术产出）次之 → grow（成长速度）居中 →
     body（疲劳/伤病）→ life（场外）→ pot（潜力）→ decline（衰退）最低。 */
  const CAT_WEIGHT = { attr: 1.7, skill: 1.2, grow: 1.0, body: 0.7, life: 0.6, pot: 0.5, decline: 0.4 };

  /* 每类别的百分比数值按 /100 存（fatigue 减免 0.15 = -15%）；乘数类按字面倍数存（1.06）。 */
  const pct = (v) => v; // 语义标注：vals 存小数比例，desc 端 ×100 展示

  /* ── 天赋池（26 条 × 5 档）──
     vals: { bronze, silver, gold, platinum, diamond } —— 消费端经 val(d,id) 取当前档数值
     pos:  位置亲和（抽取权重 ×1.5）；null = 全位置
     onCreate: "attrs"（池内属性类加成）| "allAttrs"（全属性）| "pot"（潜力表）| undefined */
  const POOL = [
    /* ⚽ 属性直接类（开局生效 · 概率最高）*/
    { id: "attrFinish", name: "终结本能", cat: "attr", pos: ["ST", "CF", "LW", "RW", "CAM"], onCreate: "attrs", catTarget: "shooting",
      vals: { bronze: 1, silver: 2, gold: 3, platinum: 4, diamond: 6 }, unit: "pt",
      desc: "终结类属性 +{v}（开局生效）" },
    { id: "attrTouch", name: "天生脚法", cat: "attr", pos: ["ST", "CF", "LW", "RW", "CAM", "CM", "LM", "RM"], onCreate: "attrs", catTarget: "dribbling",
      vals: { bronze: 1, silver: 2, gold: 3, platinum: 4, diamond: 6 }, unit: "pt",
      desc: "持球类属性 +{v}（开局生效）" },
    { id: "attrPass", name: "传球大脑", cat: "attr", pos: ["CAM", "CM", "CDM", "LM", "RM", "LB", "RB"], onCreate: "attrs", catTarget: "passing",
      vals: { bronze: 1, silver: 2, gold: 3, platinum: 4, diamond: 6 }, unit: "pt",
      desc: "传球类属性 +{v}（开局生效）" },
    { id: "attrDefend", name: "防守基因", cat: "attr", pos: ["CB", "LB", "RB", "CDM", "GK"], onCreate: "attrs", catTarget: "defending",
      vals: { bronze: 1, silver: 2, gold: 3, platinum: 4, diamond: 6 }, unit: "pt",
      desc: "防守类属性 +{v}（开局生效）" },
    { id: "attrMental", name: "大心脏", cat: "attr", pos: null, onCreate: "attrs", catTarget: "awareness",
      vals: { bronze: 1, silver: 2, gold: 3, platinum: 4, diamond: 6 }, unit: "pt",
      desc: "精神类属性 +{v}（开局生效）" },
    { id: "attrPhys", name: "钢筋铁骨", cat: "attr", pos: null, onCreate: "attrs", catTarget: "physicality",
      vals: { bronze: 1, silver: 2, gold: 3, platinum: 4, diamond: 6 }, unit: "pt",
      desc: "身体类属性 +{v}（开局生效）" },
    { id: "attrPace", name: "风之子", cat: "attr", pos: ["LW", "RW", "LB", "RB", "ST", "LM", "RM"], onCreate: "attrs", catTarget: "pace",
      vals: { bronze: 1, silver: 2, gold: 3, platinum: 4, diamond: 6 }, unit: "pt",
      desc: "速度类属性 +{v}（开局生效）" },
    { id: "readyNow", name: "即战力", cat: "attr", pos: null, onCreate: "allAttrs",
      vals: { bronze: 1, silver: 1, gold: 2, platinum: 2, diamond: 3 }, unit: "pt",
      desc: "全部属性 +{v}（开局生效，直线抬高 OVR）" },
    /* 🌟 潜力类（低概率）*/
    { id: "ceiling", name: "超凡潜力", cat: "pot", pos: null, onCreate: "pot",
      vals: { bronze: 2, silver: 3, gold: 4, platinum: 5, diamond: 7 }, unit: "pt",
      desc: "潜力上限全表 +{v}（开局生效，决定你能长到多高）" },
    /* 🌱 成长速度类 */
    { id: "diligent", name: "刻苦训练", cat: "grow", pos: null,
      vals: { bronze: 0.05, silver: 0.10, gold: 0.15, platinum: 0.20, diamond: 0.30 }, unit: "pctUp",
      desc: "训练经验 +{v}" },
    { id: "matchSage", name: "以赛代练", cat: "grow", pos: null,
      vals: { bronze: 0.05, silver: 0.10, gold: 0.15, platinum: 0.20, diamond: 0.30 }, unit: "pctUp",
      desc: "比赛经验 +{v}" },
    { id: "youngGenius", name: "少年天才", cat: "grow", pos: null,
      vals: { bronze: 1.15, silver: 1.2, gold: 1.3, platinum: 1.4, diamond: 1.5 }, unit: "mult",
      desc: "21 岁及以下经验获取 ×{v}" },
    { id: "prodigy2", name: "天资异禀", cat: "grow", pos: null,
      vals: { bronze: 1.05, silver: 1.1, gold: 1.15, platinum: 1.2, diamond: 1.25 }, unit: "mult",
      capBonus: { bronze: 1, silver: 1, gold: 2, platinum: 2, diamond: 4 },
      desc: "全年龄经验 ×{v} · 赛季成长上限 +{cap}" },
    { id: "lateBloomer", name: "大器晚成", cat: "decline", pos: null,
      vals: { bronze: 0.20, silver: 0.35, gold: 0.50, platinum: 0.65, diamond: 0.80 }, unit: "pctUp",
      desc: "31 岁后状态衰退减轻 {v}" },
    /* ⚽ 技术产出类 */
    { id: "strikerSense", name: "射手嗅觉", cat: "skill", pos: ["ST", "CF", "LW", "RW", "CAM"],
      vals: { bronze: 1.04, silver: 1.07, gold: 1.10, platinum: 1.14, diamond: 1.18 }, unit: "mult",
      desc: "进球概率 ×{v}" },
    { id: "keyPass", name: "关键一传", cat: "skill", pos: ["CAM", "CM", "LM", "RM", "CDM", "LW", "RW"],
      vals: { bronze: 1.05, silver: 1.10, gold: 1.15, platinum: 1.20, diamond: 1.25 }, unit: "mult",
      desc: "助攻概率 ×{v}" },
    { id: "stabilizer", name: "稳定器", cat: "skill", pos: ["CB", "LB", "RB", "GK", "CDM"],
      vals: { bronze: 6.0, silver: 6.1, gold: 6.2, platinum: 6.3, diamond: 6.5 }, unit: "raw",
      desc: "单场评分保底 {v}" },
    { id: "bigGame", name: "大场面先生", cat: "skill", pos: null,
      vals: { bronze: 0.15, silver: 0.2, gold: 0.3, platinum: 0.4, diamond: 0.5 }, unit: "dec",
      desc: "杯赛 / 关键战评分 +{v}" },
    /* 💪 体质类（低概率）*/
    /* ★★ P171（疲劳机制退役）：原「好底子/冰浴爱好者」（疲劳积累/每日恢复）两条换新效果——
       板凳奇兵 = 替补出场评分加成（替补玩法生态位此前无天赋）；扑救直觉 = 门将读心窗口加成
       （门将专属天赋生态位，消费点 duel.js gkPrepare dscore）。 */
    { id: "goodBase", name: "板凳奇兵", cat: "body", pos: null,
      vals: { bronze: 0.2, silver: 0.4, gold: 0.6, platinum: 0.8, diamond: 1.0 }, unit: "dec",
      desc: "替补出场时评分 +{v}" },
    { id: "iceBath", name: "扑救直觉", cat: "body", pos: ["GK"],
      vals: { bronze: 0.3, silver: 0.6, gold: 0.9, platinum: 1.2, diamond: 1.5 }, unit: "raw",
      desc: "门将读心窗口 +{v}（扑救小游戏的线索更准）" },
    { id: "ironMan", name: "铁人", cat: "body", pos: null,
      vals: { bronze: 0.15, silver: 0.25, gold: 0.35, platinum: 0.45, diamond: 0.55 }, unit: "pctUp",
      desc: "训练与比赛伤病概率 -{v}" },
    { id: "fastHeal", name: "快速康复", cat: "body", pos: null,
      vals: { bronze: 0.85, silver: 0.75, gold: 0.6, platinum: 0.5, diamond: 0.4 }, unit: "multDown",
      desc: "伤病恢复天数 ×{v}" },
    /* 🌟 场外类（低概率）*/
    { id: "cameraFavorite", name: "镜头宠儿", cat: "life", pos: null,
      vals: { bronze: 0.10, silver: 0.20, gold: 0.30, platinum: 0.45, diamond: 0.60 }, unit: "pctUp",
      desc: "名气获取 +{v}" },
    { id: "businessMind", name: "商业头脑", cat: "life", pos: null,
      vals: { bronze: 0.10, silver: 0.20, gold: 0.30, platinum: 0.40, diamond: 0.50 }, unit: "pctUp",
      desc: "赞助收入与签字费 +{v}" },
    { id: "dressingRoom", name: "更衣室好人", cat: "life", pos: null,
      vals: { bronze: 0.25, silver: 0.40, gold: 0.55, platinum: 0.70, diamond: 0.85 }, unit: "pctUp",
      chemBonus: { bronze: 4, silver: 6, gold: 10, platinum: 14, diamond: 20 },
      desc: "负面士气事件减轻 {v} · 赛季化学反应 +{chem}" },
    { id: "transferDarling", name: "转会宠儿", cat: "life", pos: null,
      vals: { bronze: 0.10, silver: 0.20, gold: 0.30, platinum: 0.40, diamond: 0.50 }, unit: "pctUp",
      desc: "签字费 +{v}（金档及以上：转会报价 +1 份）" },
    { id: "naturalLeader", name: "天生领袖", cat: "life", pos: null,
      vals: { bronze: 55, silver: 62, gold: 68, platinum: 74, diamond: 80 }, unit: "raw",
      desc: "士气不会低于 {v}" },
  ];

  const byId = {};
  for (const t of POOL) byId[t.id] = t;

  /* ── 随机器：优先全局 R（core.js），缺失时兜底 Math.random ── */
  const RNG = (typeof R !== "undefined") ? R : {
    next: () => Math.random(),
    int: (a, b) => a + Math.floor(Math.random() * (b - a + 1)),
    pick: (arr) => arr[RNG.int(0, arr.length - 1)],
  };

  /* ══════════ 查询 ══════════ */
  /** 当前档位（唯一读点）：存档 d.talentTiers[id]，缺省 = bronze（旧档/异常档失败安全） */
  function tierOf(d, id) {
    const t = (d && d.talentTiers && d.talentTiers[id]) || "bronze";
    return TIER[t] ? t : "bronze";
  }
  /** 当前档数值（0 = 未拥有该天赋 / 数值型 hook 的统一读点） */
  function val(d, id) {
    if (!has(d, id)) return 0;
    return byId[id] ? byId[id].vals[tierOf(d, id)] : 0;
  }
  function has(d, id) { return !!(d && d.talents && d.talents.indexOf(id) >= 0 && byId[id]); }
  function list(d) { return (d && d.talents) || []; }

  /* ══════════ 抽卡 ══════════ */
  /** ★ P180（用户拍板「赛季结算看广告升级天赋」）：天赋升档唯一写点——tier 在 TIER_ORDER
   *  上 +1（bronze→silver→…→diamond；已满档/未拥有返回 false）。数值效果经 val(d,id)
   *  自动跟随新档（消费端 hook 全部走 TAL.val，无需逐点通知）。 */
  function tierUp(d, id) {
    if (!has(d, id)) return false;
    const idx = TIER_ORDER.indexOf(tierOf(d, id));
    if (idx < 0 || idx >= TIER_ORDER.length - 1) return false;
    d.talentTiers = d.talentTiers || {};
    d.talentTiers[id] = TIER_ORDER[idx + 1];
    return true;
  }
  /** 天赋基础权重（类别 × 位置亲和；档位独立掷 —— 见 roll6） */
  function talentWeight(t, position) {
    let w = CAT_WEIGHT[t.cat] || 1;
    if (t.pos && position && t.pos.indexOf(position) >= 0) w *= 1.5;
    return w;
  }
  /** 独立掷档位：按 TIER_WEIGHT 归一化（每个天赋五档等概分布内再按稀有度倾斜） */
  function rollTier() {
    let total = 0;
    for (const k of TIER_ORDER) total += TIER_WEIGHT[k];
    let roll = RNG.next() * total;
    for (const k of TIER_ORDER) { roll -= TIER_WEIGHT[k]; if (roll <= 0) return k; }
    return "bronze";
  }

  /**
   * 掷 6 个不重复天赋；返回 [{ id, tier }]（create.js 消费；confirm 时把 tier 写入 d.talentTiers）
   * @param {string} position 玩家位置（位置亲和）
   * @param {object} opts { guaranteeDiamond: 2 } —— 广告刷新保底 2 个钻石档
   */
  function roll6(position, opts) {
    opts = opts || {};
    const picked = [];
    const pool = POOL.slice();
    for (let i = 0; i < 6 && pool.length; i++) {
      const weights = pool.map(t => talentWeight(t, position));
      let roll = RNG.next() * weights.reduce((a, b) => a + b, 0);
      let idx = 0;
      for (; idx < pool.length - 1; idx++) { roll -= weights[idx]; if (roll <= 0) break; }
      const t = pool.splice(idx, 1)[0];
      picked.push({ id: t.id, tier: rollTier() });
    }
    // 保底：钻石不足 → 用未入选天赋**整体替换**最低档卡（替换后重掷该卡档位为 diamond）
    const guarantee = opts.guaranteeDiamond || 0;
    let diamonds = picked.filter(c => c.tier === "diamond");
    if (diamonds.length < guarantee) {
      const outside = POOL.filter(t => !picked.some(c => c.id === t.id));
      while (diamonds.length < guarantee && outside.length) {
        // 被替换者 = 当前档位最低的一张（并列取先出现）
        let minIdx = 0;
        for (let i = 1; i < picked.length; i++) {
          if (TIER[picked[i].tier].rank < TIER[picked[minIdx].tier].rank) minIdx = i;
        }
        const rep = outside.splice(RNG.int(0, outside.length - 1), 1)[0];
        picked[minIdx] = { id: rep.id, tier: "diamond" };
        diamonds = picked.filter(c => c.tier === "diamond");
      }
    }
    return picked;
  }

  /* ══════════ 描述渲染 ══════════ */
  const fmtPct = (v) => Math.round(v * 100) + "%";
  function descOf(id, tier) {
    const t = byId[id];
    if (!t) return "";
    const v = t.vals[tier] !== undefined ? t.vals[tier] : t.vals.bronze;
    let s = t.desc;
    if (t.unit === "pctUp") s = s.replace("{v}", fmtPct(v));
    else if (t.unit === "pctDown") s = s.replace("{v}", fmtPct(v));
    else if (t.unit === "mult") s = s.replace("{v}", v);
    else if (t.unit === "multDown") s = s.replace("{v}", v);
    else if (t.unit === "dec") s = s.replace("{v}", (Math.round(v * 100) / 100).toFixed(2).replace(/0$/, ""));
    else if (t.unit === "pt") s = s.replace("{v}", v);   // ★ 模板已写「+{v}」→ 这里直接替换，不再加「+」（否则 ++1）
    else s = s.replace("{v}", v);
    if (t.capBonus) s = s.replace("{cap}", t.capBonus[tier]);
    if (t.chemBonus) s = s.replace("{chem}", t.chemBonus[tier]);
    return s;
  }

  /* ══════════ 生效聚合 API（所有 hook 消费点从这里拿数值；旧存档缺 talentTiers 视为铜档）══════════ */
  /** 经验获取乘数（kind: "train" | "match"） */
  function expMult(d, kind) {
    let m = 1;
    if (kind === "train" && has(d, "diligent")) m *= 1 + val(d, "diligent");
    if (kind === "match" && has(d, "matchSage")) m *= 1 + val(d, "matchSage");
    if (has(d, "youngGenius") && d.player && d.player.age <= 21) m *= val(d, "youngGenius");
    if (has(d, "prodigy2")) m *= val(d, "prodigy2");
    return m;
  }
  /** 赛季成长上限加成（systems.js Growth.seasonEnd 消费） */
  function growthCapBonus(d) { return has(d, "prodigy2") ? (byId.prodigy2.capBonus[tierOf(d, "prodigy2")] || 0) : 0; }
  /** 31+ 衰退减免比例（0~0.8；systems.js 消费：delta ×(1−cut)） */
  function declineCut(d) { return val(d, "lateBloomer"); }
  /** ★ P171：替补出场评分加成（settlement.js 消费；板凳奇兵，0 = 无） */
  function benchBoost(d) { return val(d, "goodBase"); }
  /** ★ P171：门将读心窗口加成（duel.js gkPrepare dscore 消费；扑救直觉，0 = 无） */
  function gkIntuition(d) { return has(d, "iceBath") ? val(d, "iceBath") : 0; }
  /** 伤病概率乘数 */
  function injuryMult(d) { return 1 - val(d, "ironMan"); }
  /** 伤病恢复天数乘数（vals 存的就是倍数：0.85 → 恢复更快） */
  function healMult(d) { return has(d, "fastHeal") ? val(d, "fastHeal") : 1; }
  /** 名气乘数 */
  function fameMult(d) { return 1 + val(d, "cameraFavorite"); }
  /** 商业收入乘数 */
  function moneyMult(d) { return 1 + val(d, "businessMind"); }
  /** 进球概率乘数（vals 即乘数 1.04~1.18） */
  function goalMult(d) { return has(d, "strikerSense") ? val(d, "strikerSense") : 1; }
  /** 助攻概率乘数（vals 即乘数 1.05~1.25） */
  function assistMult(d) { return has(d, "keyPass") ? val(d, "keyPass") : 1; }
  /** 单场评分保底（0 = 无保底） */
  function ratingFloor(d) { return has(d, "stabilizer") ? val(d, "stabilizer") : 0; }
  /** 关键战评分加成（0 = 无） */
  function bigGameBonus(d) { return val(d, "bigGame"); }
  /** 士气下限（0 = 无下限） */
  function moraleFloor(d) { return has(d, "naturalLeader") ? val(d, "naturalLeader") : 0; }
  /** 负面士气事件减免比例（0~0.85） */
  function moraleHitCut(d) { return val(d, "dressingRoom"); }
  /** 赛季化学加成 */
  function chemBonus(d) { return has(d, "dressingRoom") ? (byId.dressingRoom.chemBonus[tierOf(d, "dressingRoom")] || 0) : 0; }
  /** 转会报价加成份数（金档及以上 +1） */
  function transferOfferBonus(d) { return (has(d, "transferDarling") && TIER[tierOf(d, "transferDarling")].rank >= 3) ? 1 : 0; }

  /* 开局应用（create.confirm 消费）：把 onCreate 类天赋写进新球员
     ★ 全部走池内判定（Pool.catsOf / CONFIG.ATTRIBUTES 池外不写），上限 99 / HARD_CAP。 */
  function applyOnCreate(data, player, Potential) {
    const P = (window.CONFIG && CONFIG.POTENTIAL) || {};
    const cap = P.HARD_CAP || 92;
    for (const id of list(data)) {
      const t = byId[id];
      if (!t || !t.onCreate) continue;
      const v = val(data, id);
      if (!v) continue;
      if (t.onCreate === "attrs" && t.catTarget) {
        for (const [aid] of (CONFIG.ATTRIBUTES[t.catTarget] || [])) {
          if (player.attrs[aid] === undefined) continue;   // 池外不写（门将无终结类等）
          player.attrs[aid] = Math.min(99, player.attrs[aid] + v);
        }
      } else if (t.onCreate === "allAttrs") {
        for (const aid of Object.keys(player.attrs)) player.attrs[aid] = Math.min(99, player.attrs[aid] + v);
      } else if (t.onCreate === "pot" && player.pot) {
        for (const aid of Object.keys(player.pot)) {
          if (typeof player.pot[aid] === "number") player.pot[aid] = Math.min(cap, player.pot[aid] + v);
        }
        player._potBase = (player._potBase || 0) + v;   // 均值口径同步上抬（选出身界面对拍用）
      }
    }
  }

  window.TAL = {
    POOL, TIER, TIER_ORDER, TIER_WEIGHT, CAT_WEIGHT, byId,
    roll6, tierOf, tierUp, val, has, list, descOf,
    expMult, growthCapBonus, declineCut, benchBoost, gkIntuition, injuryMult, healMult,
    fameMult, moneyMult, goalMult, assistMult, ratingFloor, bigGameBonus, moraleFloor,
    moraleHitCut, chemBonus, transferOfferBonus, applyOnCreate,
  };
})();
