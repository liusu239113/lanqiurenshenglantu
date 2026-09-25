/* ============================================================================
   配置中心 — 数值忠实还原原版 GameConfig / PlayerSystem
   ============================================================================ */
(function () {
  // 热点资讯活动云（传奇排行榜）：网关地址与环境 ID（见 js/leaderboard.js）
  // ★ P160：切换到足球线专属新环境（app_7a3e50b0ab，技能包 app_7a3e50b0ab 开通；
  //   旧 app-1abc21354e 是篮球线环境，此前足球榜误打篮球环境 → 串榜，已纠正）。
  //   fb 三榜路由在新环境部署后自动生效；未部署前 fetchBoard 走示例兜底。
  window.ACTIVITY_API_BASE = "https://app-7a3e50b0ab-d3gm1khmv1a8e2a36-1252166086.ap-shanghai.app.tcloudbase.com";
  window.ACTIVITY_ENV_ID = "app-7a3e50b0ab-d3gm1khmv1a8e2a36";

  // ★ P163 发帖路由单源（云分享链路共用：share.js 主管道 + season_report.js 兜底裸调）。
  //   足球话题区 topicId=184 + 标签「冠军之心：足球生涯」tagId=156975（热点资讯后台已建）。
  //   与篮球线（topicId=177 湿乎乎的话题 / tagId=156346）完全分离——改路由只改这里。
  window.SHARE_ROUTE = { topicId: "184", topicName: "足球话题区", tagId: "156975", tagName: "冠军之心：足球生涯" };

  const EXTRA = window.GAME_DATA.config_extra || {};

  const CONFIG = {
    VERSION: "2.0-web",
    TITLE: "冠军之心：足球生涯",

    // 赛季设定（原版：2025-02-01 → 12-15，休赛期 12-16 → 01-31）
    SEASON_START_YEAR: EXTRA.SEASON_START_YEAR || 2025,
    SEASON_START_MONTH: 2, SEASON_START_DAY: 1,
    SEASON_END_MONTH: 12, SEASON_END_DAY: 15,

    // 能力成长（原版数值）
    EXP_PER_ABILITY: EXTRA.EXP_PER_ABILITY || 10000,
    MATCH_EXP_PER_LEVEL: EXTRA.MATCH_EXP_PER_LEVEL || 2600,
    INITIAL_ABILITY: EXTRA.INITIAL_ABILITY || 37,
    INITIAL_ABILITY_DIST: [
      { ability: 46, p: 40 }, { ability: 47, p: 30 }, { ability: 48, p: 18 },
      { ability: 49, p: 8 }, { ability: 50, p: 4 }, { ability: 51, p: 2 },
    ],
    /* ★★★ P113 初版三档出身分层；★★ P157（2026-09-19 用户拍板）整体大幅抬高 + 位置/风格倾向分配。
       ── P157 目标（用户原话）──
         · 初始 OVR 不得低于「在中超俱乐部打上主力或至少轮换」的水平——旧档 37~41「搞得太低」；
         · 不同位置、不同球风要有不同的初始属性分配（位置倾向性），不是一刀切的平均人。
       ── 标定锚（CONFIG.YOUTH 门槛体系 + MATCH_STARTER_GAP 14 / ROT_GAP 4）──
         青年队强度 = 俱乐部强度 − 20：中超 60~85 → 青年队 40~65；
         青训主力线 = 青年队强度 − 14（= 26~51）、轮换线再 −4（22~47）。
         一线队口径：中超主力线 = 46~71、轮换线 42~67。
       ── 分布（ability 是 attrs 基值；OVR ≈ ability + 位置倾向 ≈+1.3 + 球风倾向 ≈+1~2）──
         genius: 58–64 均匀 → OVR ≈ 61–68 —— 中超任何青训营**主力**稳，豪门青年队也站得住；
         sports: 52–57 均匀 → OVR ≈ 55–61 —— 轮换~主力之间；
         hotblood: 48–52 均匀 → OVR ≈ 51–56 —— 中超中下游青训**主力**、豪门青训**轮换**（≥ 轮换线 47）。
       ★ 数组 = 等权抽取（R.pick）；键缺失或 null ⇒ 回落 INITIAL_ABILITY_DIST（失败安全 = 老行为）。 */
    INITIAL_ABILITY_BY_ORIGIN: {
      genius: [58, 59, 60, 61, 62, 63, 64],
      sports: [52, 53, 54, 55, 56, 57],
      hotblood: [48, 49, 50, 51, 52],
    },
    MAX_ABILITY: 100,
    // ★ P99-A1 拍板：开局统一青训入口。唯一源就是这里——
    //   旧双源（EXTRA.INITIAL_AGE=16 覆盖）已于 P99 修复日拆除，data_config_extra 不再提供该键。
    //   ★ P261（用户拍板）：开局年龄 14 → 15。游戏内日历（SEASON_START_YEAR）与年龄解耦，
    //     初始时间不变；年龄门（<16 挡职业合同 / <16 挡国字号）对 15 岁开局分支不变；
    //     YOUTH.MULTIPLIERS 查 15 档 1.68（14 档保留不动，防 fallback 语义漂移）。
    INITIAL_AGE: 15,

    // 训练（原版：每日一次 2000 经验，20% 概率 +10 疲劳）
    DAILY_TRAINING: { exp: 2300 }, // ★ P264：免费基线 2600→2300（用户「再降低日常与比赛基础经验」；P171 的 2600 基线就此下调）
    /* ★ P131：TRAIT_TRAINING（弱脚/花式特质训练参数）已删——P114 技能库 v2 取代后全仓零读取；
       注意 d.traits 字段本体仍活着（技能星级 / traitExp 都在用），死的只是这张参数表。 */

    // ── 技能库 v2（★★ P114 用户拍板三分类重构）──
    //   三类：赛事（按位置定制 10 个，与位置关键属性强相关）/ 身体（通用 10）/ 经营（通用 10）
    //   升级成本递增（★ P174 用户拍板「0 级 1 点、1 星 2 点…要求更高」）：0→1★ 花 1、1→2 花 2、
    //   2→3 花 3、3→4 花 4、4→5 花 5（满星总 15 点/技能；
    //   全满 30×15=450 点 → 生涯收入 + 广告，取舍更狠）。
    //   ★ 消费点契约：每条技能的效果必须挂在**真实消费点**（duel/match/career/settlement/
    //     transfer/nation_dev/legacy 的 Skills.mult/bonus 调用），禁止"只展示不生效"。
    SKILL_LIBRARY: {
      MAX_STARS: 5,
      COST: [1, 2, 3, 4, 5],           // ★ P174：索引 = 当前星级（0 基）：升到下一星的花费 = 星级+1
      SP: {
        START: 3,              // 开档初始技能点
        AD_GAIN: 3,            // ★ P114：技能页「看广告 +3 技能点」（不限次；原特训指导每季 2 次+5 退役并入）
        SEASON: {              // 赛季结算公式（表现 → 技能点）
          base: 1,             // 每赛季保底
          apps20: 1,           // 出场 ≥20 场
          rating7: 1,          // 场均评分 ≥7.0
          rating75: 0,
          highlights5: 1,      // 本季高光 ≥5 次
          leagueCup: 1,        // 联赛冠军 或 国内杯赛冠军
          award: 1,            // 金靴 / 金冕奖 / 赛季最佳球员候选
          cap: 6,              // 单季上限
        },
      },
      /* ★ P119（用户拍板）：技能不再分稀有度 —— 原 RARITY 表（普通/进阶/稀有/传奇）与每条技能的
         rarity 字段已删除；技能差异只体现在「分类（赛事/身体/经营）+ 升星成本递增 + 效果」上。 */
      CATS: {
        match: { name: "赛事", icon: "target" },
        body:  { name: "身体", icon: "dumbbell" },
        biz:   { name: "经营", icon: "star" },
      },
      // effect：星级/5 × 系数 = 实际效果（Skills.mult / Skills.bonus）
      SKILLS: [
        /* ⚽ 赛事技能池（14 条，全部挂 duel/match 真实消费点）——
           每个位置按 MATCH_SKILLS_BY_POS 取 10 个，位置间组合互不相同 */
        { id: "weakFoot",     cat: "match", icon: "target",  name: "弱脚精度",   desc: "非惯用脚射门与传球", effect: "射门转化 +" },
        { id: "skillMoves",   cat: "match", icon: "sparkle", name: "花式过人",   desc: "过人假动作与一条龙", effect: "一条龙破门 +" },
        { id: "header",       cat: "match", icon: "ball",    name: "头球争顶",   desc: "抢点争顶与头球攻门", effect: "头球破门 +" },
        { id: "outsideBoot",  cat: "match", icon: "target",  name: "外脚背弧线", desc: "外脚背抽射与远世界波", effect: "远射破门 +" },
        { id: "penaltyKick",  cat: "match", icon: "ball",    name: "点球专家",   desc: "研究门将扑点习惯", effect: "点球命中率 +" },
        { id: "freeKick",     cat: "match", icon: "target",  name: "任意球大师", desc: "电梯球与圆月弯刀", effect: "直接任意球得分机会" },
        { id: "positioning",  cat: "match", icon: "chart",   name: "跑位嗅觉",   desc: "预判落点与空当跑位", effect: "吃饼概率 +" },
        { id: "throughPass",  cat: "match", icon: "chart",   name: "手术刀传球", desc: "撕裂防线的最后一传", effect: "助攻概率 +" },
        { id: "gameReading",  cat: "match", icon: "chart",   name: "阅读比赛",   desc: "预判攻防节奏掌控比赛", effect: "临场评分 +" },
        { id: "bigStage",     cat: "match", icon: "star",    name: "大场面先生", desc: "决赛与生死战挺身而出", effect: "关键战评分 ++" },
        { id: "actor",        cat: "match", icon: "star",    name: "影帝",       desc: "合理利用规则保护自己", effect: "吃牌率 −" },
        { id: "penaltyNerve", cat: "match", icon: "star",    name: "点球心跳",   desc: "十二码前心如止水", effect: "关键决策抗压 +" },
        { id: "leadersHeart", cat: "match", icon: "star",    name: "领袖之心",   desc: "戴上袖标后全队跟你走", effect: "担任队长时发挥 +" },
        { id: "counterFinish",cat: "match", icon: "thunder", name: "防反终结",   desc: "由守转攻的第一脚处理", effect: "反击破门 +" },
        /* 💪 身体技能 10（通用；挂 career/settlement/match 消费点）*/
        { id: "stamina",      cat: "body", icon: "dumbbell", name: "体能储备", desc: "心肺与恢复能力训练", effect: "训练经验 +" },   /* ★ P171 新出口 */
        { id: "durability",   cat: "body", icon: "dumbbell", name: "抗伤体质", desc: "肌肉强度与自我保护", effect: "比赛伤病率 −" },
        { id: "burstPace",    cat: "body", icon: "thunder",  name: "爆发启动", desc: "前五步的绝对速度", effect: "反击破门 +" },
        { id: "ironMan",      cat: "body", icon: "dumbbell", name: "铁人",     desc: "连轴转也不掉状态", effect: "训练伤病率 −" },   /* ★ P171 新出口 */
        { id: "spring",       cat: "body", icon: "dumbbell", name: "弹簧腿",   desc: "弹跳与滞空能力", effect: "头球对抗 +" },
        { id: "supple",       cat: "body", icon: "dumbbell", name: "柔韧灵活", desc: "变向与身体协调", effect: "近身摆脱 +" },
        { id: "coreStrength", cat: "body", icon: "dumbbell", name: "核心力量", desc: "对抗中的身体支撑", effect: "强破对抗 +" },
        { id: "secondWind",   cat: "body", icon: "dumbbell", name: "第二口气", desc: "体能分配大师，九十分钟都有油", effect: "比赛经验 +" },   /* ★ P171 新出口 */
        { id: "tenacity",     cat: "body", icon: "dumbbell", name: "坚韧",     desc: "养伤期间从不松懈", effect: "伤愈首战评分 +" },   /* ★ P171 新出口 */
        { id: "warmUp",       cat: "body", icon: "dumbbell", name: "热身大师", desc: "替补席上保持状态", effect: "替补登场评分 +" },
        /* 🌟 经营技能 10（通用；挂 career/transfer/nation_dev/legacy 消费点）*/
        { id: "negotiator",   cat: "biz", icon: "star", name: "谈判专家",   desc: "合同桌上不让步", effect: "周薪报价 +" },
        { id: "bonusHunter",  cat: "biz", icon: "star", name: "签字费猎手", desc: "每一笔签字费都咬住不放", effect: "签字费 +" },
        { id: "sponsor",      cat: "biz", icon: "star", name: "代言磁铁",   desc: "商业代言排队上门", effect: "代言收入 +" },
        { id: "imageRights",  cat: "biz", icon: "star", name: "肖像权经营", desc: "曝光就是资产", effect: "名气获取 +" },
        { id: "investor",     cat: "biz", icon: "star", name: "投资眼光",   desc: "置业与分红稳赚", effect: "持续收入 +" },
        { id: "fanGrowth",    cat: "biz", icon: "star", name: "粉丝运营",   desc: "社媒涨粉有一手", effect: "粉丝增长 +" },
        { id: "nationalAsset",cat: "biz", icon: "star", name: "国脚资产",   desc: "国家队就是最大舞台", effect: "国字号表现 +" },
        { id: "taxPlanner",   cat: "biz", icon: "star", name: "税务规划",   desc: "合法省下每一笔", effect: "经纪人抽成 −" },
        { id: "merchLine",    cat: "biz", icon: "star", name: "球衣代言",   desc: "周边分成躺赚", effect: "商业收入 +" },
        { id: "legacyBuilder",cat: "biz", icon: "star", name: "传承经营",   desc: "每一季都写进履历", effect: "生涯积分 +" },
      ],
      /* ★★ 赛事技能的位置映射（每位置恰好 10 个；从 14 条池里按位置语义取）——
         ★ 消费点全兼容：技能 id 与 duel/match 现有 Skills.* 调用一一对应；
           counterFinish（防反终结）新挂 duel 反击判定（与 burstPace 同消费点、独立乘数）。 */
      MATCH_SKILLS_BY_POS: {
        ST:  ["weakFoot", "skillMoves", "header", "outsideBoot", "penaltyKick", "freeKick", "positioning", "gameReading", "bigStage", "counterFinish"],
        CF:  ["weakFoot", "skillMoves", "header", "outsideBoot", "penaltyKick", "freeKick", "positioning", "throughPass", "bigStage", "counterFinish"],
        LW:  ["weakFoot", "skillMoves", "outsideBoot", "penaltyKick", "freeKick", "positioning", "throughPass", "gameReading", "bigStage", "counterFinish"],
        RW:  ["weakFoot", "skillMoves", "outsideBoot", "penaltyKick", "freeKick", "positioning", "throughPass", "gameReading", "bigStage", "counterFinish"],
        CAM: ["weakFoot", "skillMoves", "outsideBoot", "penaltyKick", "freeKick", "positioning", "throughPass", "gameReading", "bigStage", "penaltyNerve"],
        CM:  ["weakFoot", "skillMoves", "outsideBoot", "penaltyKick", "positioning", "throughPass", "gameReading", "bigStage", "penaltyNerve", "leadersHeart"],
        CDM: ["weakFoot", "penaltyKick", "positioning", "throughPass", "gameReading", "bigStage", "actor", "penaltyNerve", "leadersHeart", "counterFinish"],
        LM:  ["weakFoot", "skillMoves", "outsideBoot", "positioning", "throughPass", "gameReading", "bigStage", "actor", "counterFinish", "freeKick"],
        RM:  ["weakFoot", "skillMoves", "outsideBoot", "positioning", "throughPass", "gameReading", "bigStage", "actor", "counterFinish", "freeKick"],
        CB:  ["header", "penaltyKick", "positioning", "gameReading", "bigStage", "actor", "penaltyNerve", "leadersHeart", "weakFoot", "freeKick"],
        LB:  ["skillMoves", "penaltyKick", "positioning", "throughPass", "gameReading", "bigStage", "actor", "leadersHeart", "weakFoot", "freeKick"],
        RB:  ["skillMoves", "penaltyKick", "positioning", "throughPass", "gameReading", "bigStage", "actor", "leadersHeart", "weakFoot", "freeKick"],
        GK:  ["penaltyKick", "positioning", "throughPass", "gameReading", "bigStage", "actor", "penaltyNerve", "leadersHeart", "header", "freeKick"],
      },
    },

    /* ★★ P120/P127/P215 训练师系统（P127 用户定稿：兼职 → 职业 → 国家级 → 世界级 → 传说级 五档；
       ★★ P215 重设计（玩家实测逃课 + 用户拍板「训练师缓慢提升对应类能力值，不走主动加点路线」）：
       · 效果改轨：原「对应类别加点成本 ÷(1+gain)」（P205 接通手动加点）→ **每周自动提升对应类别属性**
         （weeklyGrowth，career.js 发薪点调用）——效果与时间绑定，雇一天只吃一天，套利结构性消失；
       · 速率：进度/周 = gain × 0.10 ÷ 软上限成本系数（80+/90+ 自然放缓，与手动加点经济同构）；
         进度攒满 1 点 → 类别内值最低的未满属性 +1（确定性、零 R 消耗、天然满足短板约束）；
       · 手动加点 spendOn **恢复原价**（Trainers.discountOf 已删除）——两条成长线解耦；
       · 进度 d.trainerProg[cat] 解雇/换档保留（练出的成果是自己的）；
       · 五类对齐七类属性：体能=速度+身体 / 技术=带球+传球 / 进攻=终结 / 防守=防守 / 心理=精神；
       · 私人雇员：转会不清零、退役随档清零（d.trainers 存玩家身上）；
       · 经济：签约费一次性 + 周薪（随每周发薪扣款，**养不起自动离队**——传说级训练师是巨星才养得起的奢侈品）；
       · ★★ 周薪锚定（★★ P156 用户拍板「消费大大降低，兼职 300/周，不超出球员承受范围」，
           原「40% 规则」定价（兼职合计 4,000）被实测判定超出青训/低级别球员承受力 —— 学徒周薪才 3,000）：
           fee/wage 均为**每类**，×5 = 全五类合计。
           兼职  合计 1,500/周  ≈ 学徒周薪（3,000）×50% 的 1/5 —— 青训孩子也聘得起，先尝到甜头；
           职业  合计 4,000/周  ≈ 低级别联赛主力周薪的一成；
           国家级 合计 10,000/周 ≈ 中超主力周薪的三成；
           世界级 合计 25,000/周 ≈ 中超顶薪球员周薪（≈3.5 万）×70%；
           传说级 合计 60,000/周 ≈ 顶薪 ×170%（巨星待遇级幕后团队，成名后才养得起）。
           签约费统一 = 1 周周薪（轻门槛，换人决策成本在周薪不在签字费）。
         若日后调薪曲线（wageBase），按同口径重标 —— 锚是「薪水语境」，不是绝对数。
       · 广告体验卡：看广告 → 世界级五件套效果【免费体验 1 个赛季】（★ P153：d.trainerTrialSeason
         按 season 口径，进新赛季自动失效；旧字段 trainerTrialUntil 保留兼容旧档；档位 = TRIAL_TIER）。
         （原 TRIAL_DAYS=7 天口径已弃用删除。） */
    TRAINERS: {
      TRIAL_TIER: 4,   // 体验卡对应档位（世界级；P127 五档化后从硬编码索引改配置）
      CATS: {
        body:   { name: "体能训练师", icon: "dumbbell", cats: ["pace", "physicality"], desc: "每周自动提升速度与身体" },
        tech:   { name: "技术训练师", icon: "sparkle", cats: ["dribbling", "passing"], desc: "每周自动提升带球与传球" },
        attack: { name: "进攻训练师", icon: "target",  cats: ["shooting"],             desc: "每周自动提升终结" },
        defend: { name: "防守训练师", icon: "shield",  cats: ["defending"],            desc: "每周自动提升防守" },
        mental: { name: "心理训练师", icon: "heart",   cats: ["awareness"],            desc: "每周自动提升精神" },
      },
      TIERS: [
        { id: 0, name: "未聘请", gain: 0 },
        { id: 1, name: "兼职",   gain: 0.08, fee: 300,   wage: 300 },
        { id: 2, name: "职业",   gain: 0.15, fee: 800,   wage: 800 },
        { id: 3, name: "国家级", gain: 0.25, fee: 2000,  wage: 2000 },
        { id: 4, name: "世界级", gain: 0.38, fee: 5000,  wage: 5000 },
        { id: 5, name: "传说级", gain: 0.50, fee: 12000, wage: 12000 },
      ],
      /* ★★ P222c 训练师潜力开发（用户拍板「无广告最优经营 + 最好训练师 → 巅峰 OVR ≈88」）：
         档位对应「可在潜力帽之上开发的点数」——每周自动成长的天花板 = effPot + 该值。
         传说级 +8：热血（潜力池均值 80）满经营巅峰 = 80 + 8 ≈ 88；90+ 仍是广告突破/经验突破的领域
         （96-100 广告专属口径 P194 不变）。帽下速率与历史标定零扰动（倍率只在帽上生效）。
         ★ 下标 = 档位 id（0=未聘请 ~ 5=传说级，共 6 档）——首版 [0,2,4,6,8] 只有 5 元素，
           [5] 取到 undefined → 传说级 capBonus 恒 0（微探针 _p222c_micro 实锤），已修。 */
      CAP_BONUS: [0, 1, 2, 4, 6, 8],
      /* 帽上开发速率倍率：目标值已 ≥ 潜力帽（在开发「帽上余量」）时，进度累积 ×此值 ——
         ★ P222b 生涯模拟标定（_p222b_career_sim.js）：传说级周薪 6 万 vs 巅峰前周薪 1-3 万，
         现实经营下训练师是「断续雇佣」（破产周集体离队、富了再雇回）——就业率约四成，
         ×20 ≈ 每类 20 点/雇用季 → 6-7 个雇用季填满 +8 余量，热血巅峰落在 87-89（目标 ≈88）。
         帽下（tgtV < effPot）×1 = 原速率，历史标定零扰动。 */
      HEADROOM_RATE_MULT: 20,
    },

    /* ★★ P120 等级系统（用户：「看不到等级 / 升级没获得能力值点 / 技能点如何获取不知道」）──
       · 等级由**生涯累计经验**（d.expTotal，训练+比赛入账时累加）驱动，EXP_PER_LEVEL 一级；
       · 每升 1 级：+2 个属性点（= expPool 直接 +2×EXP_PER_ABILITY，手动加点用）+1 技能点；
       · d.level 记录「已领取奖励的等级」，跨级在 Training.deposit 入账时一次性补发（幂等）；
       · UI：球员卡 Lv 徽章 + 技能页「技能点来源」说明。
       ★ P125：经验池 = 纯手动加点货币 —— 训练/比赛经验只入池（Training.deposit 单入口），
         不再自动随机转化为属性点；花不花、花在哪 100% 由玩家决定。 */
    LEVEL: {
      EXP_PER_LEVEL: 80000,   // ≈ 8 个基准属性点当量/级
      UP_ATTR_POINTS: 2,      // 每级 +2 属性点（经 expPool 发放）
      UP_SKILL_POINTS: 1,     // 每级 +1 技能点
      MAX: 40,
    },

    /* ★★ P125 同类短板约束（用户拍板）：手动加点时，单项 − 同类最低项 > 本值 → 拒绝加点。
       「专长不能建立在真空里」——同一大类内先补短板，再练专长，防畸形加点。 */
    ATTR_GAP_LIMIT: 15,

    /* ★★ P128c 财富系统单源（设计提案 §T3 定稿；Q4 起存 5 万 / Q5+R1 实业 v3 多座爬坡）：
       · 定期：期限按「月」= 30 天（与分红/月结同频）；年化为游戏内单利口径；
       · 基金：月度净值结算（R.float(lo,hi)），**只在有持仓时消耗 R**（soak 模拟档零持仓 → 零漂移）；
       · 实业 v3：多座经营 + 爬坡回款（首月 = mature×15%，月 ×1.35 约七八个月到顶后永久固定）；
         价格每 5 座一档递增 +50%（BIZ_STEP，摊到单座 +8.4%/座，符合商业规律——R1 拍板）；
         **分红恒定不随档位涨** → 边际回本周期随规模线性拉长 = 经济规律自然封顶；
         名义上限 9999 座/类；批量购买跨档分段计价（Finance.bizBundlePrice 单源）；
         成功率在每座投入时一次性判定，失败座返还 failBack 比例本金；
       · 退役清算（R2 拍板）：清算价 = Σ invested × BIZ_LIQUID_RATIO，纳入结局卡评价结语。 */
    FINANCE: {
      DEPOSIT_MIN: 50000,
      DEPOSITS: [
        { months: 3, rate: 0.02, name: "稳健定期" },
        { months: 6, rate: 0.035, name: "进阶定期" },
        { months: 12, rate: 0.06, name: "长期定期" },
      ],
      /* ★ P185（用户实测「3000w 4 个月 5500w——理财不能如此儿戏」）：
         三档 lo/hi 收窄并对称化（旧 growth -15%/+25% 单月上限 25% → 4 个月可 +144%）：
         · 稳健型：年化 ~7%（月 ±1~2%）
         · 平衡型：年化 ~11%（月 -3.5%~+5.5%）
         · 成长型：年化 ~12% 期望、月 -8%~+10%（好运 4 个月极限 +46%，但 -8% 回撤真实存在
           ——长期持有才有正期望，短线梭哈可能亏，符合"高波动高回报"的真实语义） */
      FUNDS: [
        { id: "stable", name: "稳健型基金", lo: -0.010, hi: 0.022 },
        { id: "balanced", name: "平衡型基金", lo: -0.035, hi: 0.055 },
        { id: "growth", name: "成长型基金", lo: -0.080, hi: 0.100 },
      ],
      BIZ: [
        { id: "coffee", name: "街角咖啡店", base: 250000, mature: 5000, rampStart: 0.15, rampGrowth: 1.35, success: 0.90, failBack: 0.30 },
        { id: "streetwear", name: "潮牌服装店", base: 560000, mature: 10000, rampStart: 0.15, rampGrowth: 1.35, success: 0.85, failBack: 0.25 },
        { id: "restaurant", name: "概念餐厅", base: 1000000, mature: 17000, rampStart: 0.15, rampGrowth: 1.35, success: 0.80, failBack: 0.25 },
        { id: "school", name: "足球学校", base: 3750000, mature: 62000, rampStart: 0.15, rampGrowth: 1.35, success: 0.92, failBack: 0.50, famePerYear: 200 },
      ],
      BIZ_STEP: 0.5,           // 每 BIZ_STEP_EVERY 座，档价 = base × (1 + BIZ_STEP × 档号)
      BIZ_STEP_EVERY: 5,
      BIZ_CAP_PER_TYPE: 9999,  // 名义上限（防溢出；实际靠天价自然封顶）
      BIZ_LIQUID_RATIO: 0.5,   // 退役清算 = 累计投入 × 50%（R2）
      LOG_MAX: 60,             // 收支流水环形缓冲
      /* ★ P201（用户拍板）：简况·财富页「彩票中奖」广告点位——头奖奖金单源。
         配额（3 次/季）在 ads.js LOTTERY_PER_SEASON；发放逻辑在 hub 财富页签（完播才发奖）。 */
      LOTTERY_PRIZE: 5000000,
      /* ★ P129b 建筑继承（R1/R2/T4-T6 拍板口径；★ P223 口径正名：无「家族世系/祖产」叙事
         —— 每次生涯都从同一个开始年份出发，是「第 2/3 次生涯的继承」，不是代际传承）：
         · 继承包 = 上次生涯实持按 invested 降序截前 META_LEGACY.BIZ_CAP[gen] 座（没有就 0 座，不保底）；
         · 继承折旧：继承座起步月分红 × BIZ_DECAY（matureMonthly 不折，经营可养回满租）；
         · 青训托管冻结：academy/jump 相位继承座不分红不爬坡（未成年由联盟托管），签约职业合同起交割；
         · 动态解冻封顶：交割后继承座合计月分红 ≤ 当期周薪 × BIZ_WAGE_CAP_MULT（按比例缩放，
           越强越解冻 = 成长可见的爽感刻度；职业初期 ~46% 占比是重开奖励的既定取舍 T5）。 */
      BIZ_DECAY: 0.5,
      BIZ_WAGE_CAP_MULT: 2,
    },


    /* ★★ P129a 跨周目继承（2026-09-18 用户拍板 T1-T8；★ P223 口径正名 + 缩水）：
       每次生涯退役结算按成绩「算出」一份继承包，新档开局注入 —— 上限分周目递增、严格封顶。
       ★ P223 口径（用户拍板）：**不是家族世系/代际传承** —— 每次生涯都从同一个开始年份出发，
       只是「第 2 次生涯 / 第 3 次生涯」；叙事与 UI 一律用「继承 / 上一次生涯」，
       禁用「祖产 / 下一代 / 家族世系 / 第 N 代」（防止把重玩奖励误读成血统设定）。
       · gen = 已完成结算次数（Meta.cycle；首周目 gen=0 无继承）；
       · cap 表下标 = min(gen-1, 表长-1)：gen1→8/2/2、gen2→15/4/4、gen≥3→25/6/6 封顶；
       · μ = 退役档位系数（career.js retire 返回 tierRank 0-3 —— 与 tier 判定同函数同文件，
         天然单源；tierRank 用 RANK_CUTS 独立刻度，不复制结局文案阈值防双源）；
       · attr 注入 **expPool（×EXP_PER_ABILITY）、刻意不进 expTotal** —— 等级奖励（每级+2点+1SP）
         不被继承推进，防复利（设计提案 §3.1）；
       · sp 注入 skillPoints，保底 SP_FLOOR（仅 μ>0 时给）；
       · biz（产业继承）：上次生涯实持截断 + 青训托管冻结 + 月分红 ≤ 周薪×2 动态解冻 + 继承折旧 0.5。
       · 广告动力保护：继承不提供潜力/突破/配额/特权任何一项（设计提案 §6.2）。 */
    META_LEGACY: {
      /* ★ P223 继承缩水（2026-09-20 用户拍板「不希望继承那么多祖产破坏平衡」）：
         P143 累世强化整体回撤 —— ATTR_CAP [15,30,50]→[8,15,25]、SP_CAP [4,7,12]→[2,4,6]、
         BIZ_CAP [5,10,20]→[2,4,6]、SP_FLOOR 2→1（约砍半口径：重玩收益保留，不再喧宾夺主）；
         TIER_MULT / RANK_CUTS / UNLOCK_TABLE（平衡锚点）全部不动。 */
      ATTR_CAP: [8, 15, 25],
      SP_CAP: [2, 4, 6],
      BIZ_CAP: [2, 4, 6],
      TIER_MULT: [0.30, 0.50, 0.75, 1.00],   // 下标 = tierRank（0 职业球员 … 3 一代传奇）
      SP_FLOOR: 1,
      /* ★ P202 平衡校准（真实分布实测，tools/_p202_legacy_audit.js）：平凡替补 1655 / 普通首发
         3257 / 扎实主力 6699 / 67 座奖杯+世界杯冠军巨星 21630 —— 原 tierRank 复用结局档位阈值
         （10000/22000/40000）→ μ=1.0 实际不可达、67 座奖杯巨星也只拿 μ=0.5，继承包普遍过少。
         RANK_CUTS = 继承系数的独立刻度（tier 文案阈值 10000/22000/40000 的稀缺性设计保持不动）：
         平凡/普通 → μ0.3、主力 4500+ → μ0.5、巨星 12000+ → μ0.75、传奇 26000+ → μ1.0。 */
      RANK_CUTS: [4500, 12000, 26000],
    },

    /* ★★ P128b 商业代言·四档品牌池（用户拍板 Q7 立项 T0；T8 广告刷新 P2 暂缓不做）：
       · fame 达到的**最高档**生效（逐档向上取，不降档）；
       · pay = 既有公式 (fans×0.05 + fame×2 + ovr×30)×(0.8~1.4) × mult —— 公式单源 career.js，
         分档只乘系数（对齐「费率分档只许发生在一个函数里」纪律）；
       · 品牌名全部虚构（脱敏三级 C：企业品牌必改）；
       · 邀约到达 = advanceDay 每日 roll（8%，条件短路对齐 P105-B3 绯闻模式），每季 ≤5 单、
         接受/婉拒后 30 天冷却、邀约 14 天过期自动婉拒。 */
    COMMERCE_TIERS: [
      { min: 150, name: "街头小店", mult: 0.2, fat: [2, 4], brands: [
        ["校门口烧烤店", "拍一条烟火气短视频，文案是——『踢完球，就得吃口热的。』"],
        ["本地球衣店", "在橱窗最显眼处挂上你的签名球衣，再合一张影发到社区群。"],
      ] },
      { min: 2000, name: "国产新锐", mult: 1.0, fat: [3, 8], brands: [
        ["『疾电』功能饮料", "拍摄一支热血向广告，口号是——'渴了？那是因为你还不够快。'"],
        ["『苍穹』足球鞋", "为新一代战靴代言，发布会上你要现场颠球 100 次不落地。"],
        ["『绿茵传说』手游", "你的专属球员卡将登录游戏首页，拍摄素材只需要一个下午。"],
        ["『驭风』汽车", "驾着新跑车在球场外兜一圈，快门声会比引擎声更响。"],
        ["『恒动』腕表", "西装革履拍大片，文案是——'90 分钟之外，时间由你定义。'"],
        ["『启程』银行", "成为青年理财形象大使，拍摄现场只需要微笑和签名。"],
      ] },
      { min: 10000, name: "国民品牌", mult: 2.5, fat: [5, 10], brands: [
        ["『恒越』新能源", "开着他们的新车在训练基地门口缓缓驶过，镜头只拍车标和你。"],
        ["『山河』运动服饰", "新赛季战袍之外，再为他们的城市通勤线拍一组大片。"],
      ] },
      { min: 50000, name: "国际大牌", mult: 6.0, fat: [8, 14], brands: [
        ["『启明』银行全球线", "作为全球青年形象大使，你的微笑出现在三大洲的机场巨幕上。"],
        ["『领航』运动巨头", "与退役传奇们并肩出现在同一面冠军广告墙上——那是巨星的席位。"],
      ] },
    ],

    /* ★★ P120（用户拍板）：青训营/俱乐部强度 → 经验收益分档（训练+比赛经验同乘）。
       「在哪练」很重要：豪门青训营/顶级联赛的训练设施与队友质量直接抬高成长效率。
       · 青训期读青年队强度、成年读一线队强度（Youth.clubViewOf 统一视图，单源）；
       · 转会到更强的队 → 训练变快，天然激励往上爬；失业/无队 → 回落 1.0。
       · 独立于个人努力乘数链（不占全链 ×2.5 封顶），作为环境系数单独乘。 */
    FACILITY_EXP: [
      { max: 55, mult: 0.9, label: "简陋" },
      { max: 70, mult: 1.0, label: "标准" },
      { max: 82, mult: 1.1, label: "职业" },
      { max: 99, mult: 1.2, label: "顶级" },
    ],

    // ★ P171：疲劳机制整体退役（用户拍板「疲劳太容易堆积，全删」）——
    //   MATCH_FATIGUE_*/FATIGUE_PENALTY_*/INJURY_FATIGUE_* 常量与全部消费点同步删除；
    //   伤病概率保留基础值 + 年龄因子（INJURY_BASE_CHANCE/INJURY_AGE_*）。
    INJURY_BASE_CHANCE: 0.003,
    INJURY_AGE_THRESHOLD: 30, INJURY_AGE_BONUS: 0.001,
    INJURY_DAYS_MIN: 1, INJURY_DAYS_MAX: 7,
    LOSS_EXP_MULT: EXTRA.LOSS_EXP_MULT || 0.7,

    /* ★★★ P107（2026-09-17）：**首发判定线** —— 【单一真相源】。
       规则：`OVR >= 球队强度 - MATCH_STARTER_GAP` ⇒ 本场首发（消费点 = match.js 赛前判定）。
       ★ 为什么必须提到 CONFIG：创建页的「青训营能力门槛」要用**同一个数**去算
         "玩家够不够得着这支梯队的出场标准" —— 两处各写一个 14 就是双源，
         日后改一处必分叉（"单源 ≠ 等价" 同族；实证：本项此前只有 match.js 一处字面量）。 */
    MATCH_STARTER_GAP: 14,

    /* ★ P113：**轮换线** = 首发线 − 此值。青训邀约的「出场承诺」三档判定用：
       主力 = OVR ≥ 首发线；轮换 = OVR ≥ 首发线 − 4；替补 = 其余。
       为什么进 CONFIG：邀约卡（create.js）与未来的青年队出场分档必须同用这一个数。 */
    MATCH_ROTATION_GAP: 4,

    // ★★ P99 批 1（台账 A2）：青年成长倍率【单一真相源】= CONFIG.YOUTH.MULTIPLIERS（14–22 全档）。
    //   14–17 档 = 1.72/1.68/1.62/1.56（台账 A2；随年龄单调递减，17 档 1.56 → 18 档 1.55 平滑衔接）；
    //   18–22 档数值原样迁移（原 YOUTH_MULTIPLIERS，一字未改）。
    //   ★ 唯一消费点 systems.js:367 读 CONFIG.YOUTH_MULTIPLIERS —— 该键保留为【同一对象的别名】
    //     （见本文件尾），不存在第二份表格；任何地方不得再新建倍率表（R6/A2 合并口径）。
    YOUTH: {
      MULTIPLIERS: { 14: 1.72, 15: 1.68, 16: 1.62, 17: 1.56, 18: 1.55, 19: 1.48, 20: 1.38, 21: 1.26, 22: 1.16 },

      /* ★★★ P99 批 4（R7-25 / R7-29 / R7-35 三项**反转**；用户拍板 =「青训期照原稿发 500/周」）：
         **学徒合同的周薪公式**（青训期**真发钱**，进 `d.money`）——
             学徒周薪 = 职业周薪(ovr) × RATE 与 FLOOR（500）取较大者
         · `RATE`  = 相对职业周薪曲线的比例（0.35 = 学徒拿三成半）
         · `FLOOR` = 每周下限（500）

         ★ 排版约束（批 4b 实证，**请勿"修好"这一段**）：本注释内**不得出现 ASCII 逗号**。
           `tools/ci.js` 的「死接线扫描」把对象体按 ASCII 逗号与换行切开、再按「行首标识符紧跟左括号」
           认成员名 —— 于是 `max(… 逗号 … round(…)` 这种写法会被切成以 `round(` 开头的一段、
           凭空多出一个 `CONFIG.round` 成员 → 基线 5 项涨到 6 项、**假红**。
           （实证：镜像沙箱把 config.js 换成 `_backups/p99_4b_before_*` 的旧版后该项消失。）
           故公式一律写成中文散文、分隔符用全角「，」；已由青训探针 G3④ 看守。

         ★★ 本键是青训期费率的**唯一真相源**，**唯一消费点** = `career.js` 的 `Career.youthWageOf`。
            逻辑侧**不得**再写 0.35 / 500 这两个字面量（R6/A2「一处定值」同族）。

         ★★ **为什么带 `FLOOR` 这一项（而不是只留 RATE）**：费率是**乘性**的，而
            `Career.wageBase` 有一条 **3000 的基座**（`career.js:26` `3000 + low + high`）
            → 纯乘性公式对一个 14 岁低总评球员**也会给出 > 1000/周**，
            即"学徒收入"会随基座上浮而**失去下限语义**。显式 `FLOOR` 让"最低也是 500/周"
            成为**可读的合同条款**，与设计稿 §7.5 的表述对齐。

         ★★ **本条与 "R7-29 单一发薪路径" 是一对**：费率**只在 `Career.weeklyWageOf(d)`
            里按相位分档**，发薪点（`career.js` 的每周入账）**不做任何相位判断** ——
            见 `career.js` 的函数注释（"两套发薪代码"是这里最要防的失效形态）。

         ★ 台账口径（本轮同步）：`d.contract` 仍是**独立的职业合同**，学徒合同**不进它**
            （两套合同，设计稿 §7.4）→ 故青训期**不能**读 `d.contract.wage` 当费率。 */
      /* ★★★ P99 批 5 ④（`R7-85`；设计稿 §7.5 ③ v0.1ac 已拍板 = 丙 · 分档）：
         **`tier` 正式成为费率载体** —— 学徒周薪从「只吃 ovr」扩成「吃 ovr 与档位」：

             学徒周薪(tier， ovr) = max( FLOOR， round( wageOf(ovr) * RATE * K[tier] ) )

         · `TIER_K` 的六个键 = `youth.js` 的六档（`A3`／`A2`／`A1`／`B2`／`B1`／`C`）
         · ★ **`B2` = 1.0 ⇒ 该档逐位等于旧行为（基准档零迁移）**
         · ★ **`A3` = 0.25 ⇒ `ovr` = 0 时该式给出 max(500， 290) = 500
           ⇒ `FLOOR` 第一次真正 binding**（`RU-o` 候选实例 (a) 的**工程侧关闭**）
         · ★ **整个乘积只 round 一次** —— 先取整再乘会给出 3016，与设计表的 3017 不符
         · ★ **`d.youth.tier` 缺失或非六档字符串 ⇒ 取最低档 `A3`**（失败安全方向：不凭空多给钱）
           ★★ 代价必须明写：**旧档青训周薪 1160 → 500** —— 这是**改行为**、不是零迁移（用户已拍板）

         ★★ **三条不变量（探针 `G3` 逐条断言，新增维度不得破坏）**：
           ① 费率的**读取点仍然唯一**（只在 `career.js` 的 `Career.youthWageOf`）；
           ② 仍是「**每周同值**」的纯函数（`tier` 在青训期不变 ⇒ `J3` 的精确签名继续成立）；
           ③ **相位判断仍只在 `Career.weeklyWageOf`**（发薪点一行不动）。

         ★★ **禁止 `K[tier] || 1.0` 这类 falsy 兜底**（与裁定 D 同源）：那会让 `K = 0`
            被静默改成 1.0 —— 且「缺配置」与「合法值 0」在观测上不可区分。
            口径 = **按类型判缺失**，与下面 `RATE`／`FLOOR` 的检查同源。 */
      WAGE_BASE: {
        RATE: 0.35, FLOOR: 500,
        TIER_K: { A3: 0.25, A2: 0.5, A1: 0.8, B2: 1.0, B1: 1.6, C: 2.6 },
      },

      // ★★ P99 批 3（设计稿 §5.4）：青训期**关键战（直播）上限**，单位 = 场/季。
      //   超出后只保留最高优先级（提拔考察战），其余按 出口前最后一战 > 青年杯 > 德比 > 首秀 降级。
      //   ★ 台账 A15：标定值先跑探针再反解 —— 数值只此一处，逻辑（youth.js 的 LIVE_PRIORITY）不写死。
      LIVE_MAX: 6,

      // ★★ P99 批 3（设计稿 §5.3）：七项青年荣誉的判定线。
      //   ★★ 台账 A15：**待反解**（本轮不写死标定值，先给出可跑通的默认值，由 P99-G1 系探针反解）。
      //   两项 NPC 荣誉线**由青年联赛平均强度派生**（换档位不用改代码，也不会出现
      //   "绝对常数与联赛强度脱钩"的静默失配）：
      //     射手王线 = BOOT_BASE  + 平均强度 × BOOT_SLOPE
      //     助攻线   = ASSIST_BASE + 平均强度 × ASSIST_SLOPE
      //   STAR_LINE 用与成年同构的公式（avgRating×10 + goals×2 + assists×1.5），只是阈值独立。
      HONOR: {
        BOOT_BASE: 8, BOOT_SLOPE: 0.10,
        ASSIST_BASE: 5, ASSIST_SLOPE: 0.08,
        STAR_LINE: 100,
        SQUAD_RATING: 7.3, SQUAD_APPS: 20,
        ROOKIE_GA: 6,
      },

      /* ★★★ P107（2026-09-17 用户拍板）：**青训营入营能力门槛**。
         ── 用户反馈（实测截图）── 14 岁 / OVR 38 的玩家点了「五大青训营」
            （池内最弱梯队首发线 52），进去后整季「未出场」，
            媒体头条写「训练场才是你的比赛」。这种档位**不该是可以选的**。
         ── 口径 ── 每条路由的**出场标准线** = 该路由池内最低青年队强度 − MATCH_STARTER_GAP。
            玩家 OVR 低于该线 **超过 GRACE** ⇒ 该路由**置灰不可选**（并在卡上写明差距）；
            低于但不超过 GRACE ⇒ 可选，但标注「大概率从替补打起」。
         ── 为什么要有 GRACE（而不是"够不着就一刀锁"）──
            纯首发线太硬：本土档首发线 40 而玩家 14 岁 OVR 值域 38–42，
            一刀锁会把**全部**玩家关在门外。GRACE = 「一季之内追得上的差距」。
         ★ 标定：GRACE = 10 ⇒ 五大档门槛 = 52 − 10 = 42，
           即只有初始 OVR 42（能力 41 顶档、p=2%）的天赋才有资格去五大闯，
           且明说「大概率替补」。数值可用 tools/_p107_lifecycle_audit.js R2 复算。 */
      GATE: {
        GRACE: 10,
      },

      /* ★★ P107（2026-09-17）：青年队**派生强度**的两个参数 —— 从 youth_data.js
         上收到此处，成为单一真相源。
         · `STRENGTH_OFFSET`：青年强度 = 成年强度 + 此值（原写死在 youth_data.js:45）
         · `STRENGTH_FLOOR` ：派生后的强度下限（原写死在 youth_data.js:85 的 Math.max）
         ★ 为什么要收上来：创建页的「青训营能力门槛」= 池内最低青年强度 − MATCH_STARTER_GAP，
           它必须与派生用**同一个 -20 / 30**。两处各写一份 ⇒ 将来 A15 标定回填（P99-C1）
           会出现"派生用新值、门槛用旧值"的静默失配（门槛算出一个不存在的梯队强度）。 */
      STRENGTH_OFFSET: -20,
      STRENGTH_FLOOR: 30,

      /* ★★★ P113（2026-09-17 用户拍板）：**青训生命周期** —— 16 岁征召 / 19 岁强制毕业。
         ── 用户口径 ──
           · **16 岁 = 最低征召年龄**：每季青训结算时，OVR 达到母队一线队提拔线 ⇒ 弹「一线队征召」；
           · 未达线但 16+ ⇒ **低级别球队求购**邀约（接受 = drop 出口 + nextClub 落点，走既有通道）；
           · **19 岁 = 强制青训营毕业**：毕业即给三份低级别报价（一般此时玩家已达最低中甲水平）。
         ── 标定 ──
           LINE_GAP 16：提拔线 = 母队成年强度 − 16（即「一线队轮换边缘再让 2 点」）。
             中超强队 74~78 ⇒ 线 58~62；青训倍率 1.56~1.72 下，热血少年 5 季约 +20~30 OVR
             ⇒ 40 起步 19 岁约 60~70，毕业年多数能被母队提拔，此前年份走求购/留营，不锁死。
           BUY_STRENGTH_SLACK 6：求购队强度 ≤ 玩家 OVR + 6（保证去了能进轮换，不复制 P107 的
             「够不着还让去」缺陷）。
         ★ 消费点：`Youth.finishYouthSeason`（邀约产出）与 `Career._forceYouthExit`（兜底年龄）。 */
      PROMOTE: {
        MIN_AGE: 16,
        LINE_GAP: 16,
        BUY_MAX: 2,
        BUY_STRENGTH_SLACK: 6,
        GRAD_OFFERS: 3,
      },
      FORCE_EXIT_AGE: 19,
    },

    /* ══════════════════════════════════════════════════════════════════════════
       ★★★ P107（2026-09-17 用户拍板）：**生涯生命周期分段** —— 事件分组的唯一真相源。
       ────────────────────────────────────────────────────────────────────────
       ── 根因（实证见 tools/_p107_lifecycle_audit.js 的 R1）──
          `when.minSeason` 一直直接比 `d.season`。而 `d.season` 是**年份**
          （2014 起，core.js:79 = SEASON_START_YEAR）⇒ `2014 >= 2` 恒真，
          全仓 631 处 minSeason 门**全是装饰品**（写不写一个样）。
          更根本的是 **赛季序号 ≠ 年龄**：P99 把开局统一成 14 岁青训起步之后，
          作者写「第 12 个赛季」（原意 = 30 岁上下）如今落在 25 岁，
          于是「还在青训营就弹出宿敌退役当解说」这类乌龙是**必然**、不是偶然。
       ── 口径 ── 玩家生涯按**年龄**分五段，段与段**互斥**且**覆盖**全部状态：
            youth  青训期   未签职业合同（相位判据 = CONFIG.isProContract 单一真相源）
            u21    21 岁前  已签职业 · 14–20
            u27    27 岁前  已签职业 · 21–26
            u33    33 岁前  已签职业 · 27–32
            over33 33 岁后  已签职业 · 33+    ★ 33 = Career.canRetire 的年龄线（终局窗口）
       ── 用法 ── 卡在 `when` 里写 `band: "<id>"` 即可，`pass()` 展开成相位/年龄门。
            需要精细控制时仍可直接写 `ageMin` / `ageMax`（低阶原语，与 band 可叠加）。
       ★★ 纪律：**未知 band 值 = 挡**（失败安全方向：宁可不弹，不可弹错）。
          全量 band 值由探针（_p107_lifecycle_audit R3）与 ci 断言看守，
          拼错立刻报红，不会静默退化成"永不出现的卡"。
       ★★ 互斥/覆盖不变量：任一 (相位，年龄) 组合**恰好**命中一个段 —— 探针逐点断言。
       ══════════════════════════════════════════════════════════════════════════ */
    CAREER_BANDS: [
      { id: "youth",  label: "青训期",  phase: "youth" },
      { id: "u21",    label: "21岁前",  phase: "senior", ageMin: 14, ageMax: 20 },
      { id: "u27",    label: "27岁前",  phase: "senior", ageMin: 21, ageMax: 26 },
      { id: "u33",    label: "33岁前",  phase: "senior", ageMin: 27, ageMax: 32 },
      { id: "over33", label: "33岁后",  phase: "senior", ageMin: 33 },
    ],

    // ★★ P112 属性体系 v3（2026-09-17，用户拍板「照 FM 截图重构」）：外场 36 项（技术14/精神14/身体8）+ 门将 6 项
    // 旧体系（P97 v2：7 类 25 项 + 门将 6）由 `migrateAttrPanels`（core.js，attrVer 3）一次性迁移；
    // 变更要点（合并/改名/拆分/新增，映射表见 core.js migrateAttrPanels v3 注释）：
    //   合并：短传+长传+直塞→传球；   改名：控球→停球 / 头球精度→头球 / 敏捷→灵活 / 体力→耐力 / 抗压→镇定 / 专注→集中 / 无球跑位→无球跑动；
    //   删除：射门力量（并入力量/射门）、凌空（并入技术）、拦截（并入防守站位+预判）；
    //   拆分：速度 → 爆发力 + 速度；侵略性从强壮里拆回（精神组）；
    //   新增：技术/角球/任意球/界外球/罚点球（技术组），决断/才华/勇敢/意志力/领导力/团队合作/工作投入/防守站位（精神组），体质（身体组）；
    //   门将：站位改名「门将站位」(gkPositioning)——给外场精神组的「防守站位」(positioning) 让出 id。
    // ★ 类别键（8 类）保持不变：POSITION_WEIGHTS / POOLS / pool.js / potential.js / IDENTITY.catBonus 全链零改动，
    //   只重排「哪项属性属于哪类」+ 重推 ATTRIBUTE_INNER / BUILD_PROFILES / POSITION_CORE。
    /* ★★ P114 属性体系 v4（2026-09-17，用户拍板「七类×各 5 项」）：
       旧 v3（技术/精神/身体三组 42 项）拆并为 **传球/带球/防守/终结/精神/身体/速度 七大类，
       每类 5 项 = 外场 35 项**；门将池 = 6 守门 + 身体/速度精选（13 项）。
       ── 迁移矩阵（v3 → v4，core.js migrateAttrPanels 同步实现）──
         保留改名：technique 技术（留带球）/ freeKicks 任意球（吸收角球+界外球）/
                   positioning 防守站位→卡位 / offBall 无球跑动→抢点（入终结）
         新增 6：longPass 长传 / ballFeel 球感 / feint 花式 / slideTackle 铲球 /
                 interception 拦截 / rhythm 节奏
         迁移：vision 精神→传球 / anticipation 精神→身体 / balance 身体→速度 / agility 身体→速度
         删除：decisions 决断 / concentration 集中 / teamwork 团队合作 / workRate 工作投入 /
               flair 才华 / corners 角球 / longThrows 界外球（旧权重由 overallAt 的 wsum 归一吸收）
       ★ 类别键不变式：passing/dribbling/defending/shooting/awareness/physicality/pace/goalkeeping
         八个键全部沿用（talents.catTarget / IDENTITY.catBonus / Pool 全链零改），只换类内成员。 */
    CATEGORIES: {
      passing:     { name: "传球", color: "#3b82f6" },
      dribbling:   { name: "带球", color: "#f5c542" },
      defending:   { name: "防守", color: "#a78bfa" },
      shooting:    { name: "终结", color: "#ff5a5a" },
      awareness:   { name: "精神", color: "#22d3ee" },
      physicality: { name: "身体", color: "#ff9f43" },
      pace:        { name: "速度", color: "#34d399" },
      goalkeeping: { name: "扑救", color: "#4dd0e1" },   // ★ P171：类名「门将」→「扑救」（用户拍板：终结的镜像位）
    },
    ATTRIBUTES: {
      // 传球 5 —— 视野/短传/长传/传中/任意球（角球+界外球并入任意球）
      passing: [
        ["vision", "视野"], ["passing", "短传"], ["longPass", "长传"],
        ["crossing", "传中"], ["freeKicks", "任意球"],
      ],
      // 带球 5 —— 盘带/停球/技术/球感/花式（停球拆出球感、花式）
      dribbling: [
        ["dribbling", "盘带"], ["firstTouch", "停球"], ["technique", "技术"],
        ["ballFeel", "球感"], ["feint", "花式"],
      ],
      // 防守 5 —— 抢断/铲球/盯人/拦截/卡位（抢断、盯人各拆一）
      defending: [
        ["tackling", "抢断"], ["slideTackle", "铲球"], ["marking", "盯人"],
        ["interception", "拦截"], ["positioning", "卡位"],
      ],
      // 终结 5 —— 射门/抢点/远射/头球/罚点球（射门不再影响内切突破；无球跑动→抢点）
      shooting: [
        ["finishing", "射门"], ["offBall", "抢点"], ["longShots", "远射"],
        ["heading", "头球"], ["penalties", "罚点球"],
      ],
      // 精神 5 —— 只留领导力/意志力/镇定/侵略性/勇敢
      awareness: [
        ["leadership", "领导力"], ["determination", "意志力"], ["composure", "镇定"],
        ["aggression", "侵略性"], ["bravery", "勇敢"],
      ],
      // 身体 5 —— 强壮/耐力/弹跳/体质/预判（预判自精神迁入；灵活/平衡迁出至速度）
      physicality: [
        ["strength", "强壮"], ["stamina", "耐力"], ["jumping", "弹跳"],
        ["naturalFitness", "体质"], ["anticipation", "预判"],
      ],
      // 速度 5 —— 爆发力/灵活/速度/平衡/节奏（灵活、平衡自身体迁入；节奏新增）
      pace: [
        ["acceleration", "爆发力"], ["agility", "灵活"], ["speed", "速度"],
        ["balance", "平衡"], ["rhythm", "节奏"],
      ],
      /* ★ P171（用户拍板「门将也要七类×各 5 项，终结换成扑救」）：守门 6→5 ——
         command（指挥防线）并入 gkPositioning（改名「站位指挥」涵盖指挥语义）；
         dueling 引用（duel_tables READ/K/GK_KICK/rush）同步改 gkPositioning。 */
      goalkeeping: [["reflexes", "门将反应"], ["diving", "扑救"], ["handling", "接球"], ["gkPositioning", "站位指挥"], ["kicking", "开球"]],
    },
    /* ── P114 展示组 = 七大类平铺（旧 tech/mental/phys 三组退役；门将单独一组）──
       hub 属性详情页按此渲染 tab；poolCats 过滤自动隐藏本位置池外组。 */
    ATTR_GROUPS: [
      { id: "passing",     name: "传球", color: "#3b82f6", cats: ["passing"] },
      { id: "dribbling",   name: "带球", color: "#f5c542", cats: ["dribbling"] },
      { id: "defending",   name: "防守", color: "#a78bfa", cats: ["defending"] },
      { id: "shooting",    name: "终结", color: "#ff5a5a", cats: ["shooting"] },
      /* ★ P171：扑救组（goalkeeping）插在终结之后 —— 外场玩家池外自动隐藏，
         门将玩家按「扑救/传球/带球/防守/精神/身体/速度」七类平铺。 */
      { id: "goalkeeping", name: "扑救", color: "#4dd0e1", cats: ["goalkeeping"] },
      { id: "awareness",   name: "精神", color: "#22d3ee", cats: ["awareness"] },
      { id: "physicality", name: "身体", color: "#ff9f43", cats: ["physicality"] },
      { id: "pace",        name: "速度", color: "#34d399", cats: ["pace"] },
    ],
    /* ── P111 位置核心属性（用户：不同位置有不同的技能可以加点）──
       ★ 口径：核心 = 该位置**专属玩法**绑定的属性 —— L1 本位置选项组的 main/sub
         （duel_tables.L1：锋线组/中场双模式/门将开球）∪ L3 射门类型 main+sub（终结是全体外场的出口）∪
         防守位（CDM/CB/LB/RB）加 L2 玩家防守选项的 main/sub。**全部从 duel_tables 选项绑定反推**。
       ★ 生效方式 = 价格杠杆而非硬禁止：核心 +1 平价，非核心 ×1.6（Training.spendOn）。
         —— 为什么不禁止：P97-M2 有完整改位系统（球员申请/教练指派/危机改位），
            CB 想练射门是"改造位置"的合法路径，价格杠杆让方向感与自由度并存。
       ★ 门将池 14 项，核心 8 项（体质/灵活/平衡/耐力/爆发力/速度 非核心）。 */
    /* ── P114 位置核心属性（v4 重推）：从七类 35 项中按位置玩法挑核心 ——
       核心 +1 平价，非核心 ×1.6（Training.spendOn 价格杠杆）。门将池 13 项见 POOLS.gk。 */
    POSITION_CORE: {
      ST:  ["finishing", "offBall", "heading", "longShots", "penalties", "strength", "jumping", "dribbling", "firstTouch", "technique", "ballFeel", "acceleration", "composure", "vision"],
      CF:  ["finishing", "offBall", "heading", "longShots", "penalties", "strength", "jumping", "dribbling", "firstTouch", "technique", "ballFeel", "feint", "acceleration", "composure", "vision", "passing", "crossing"],
      LW:  ["finishing", "offBall", "dribbling", "firstTouch", "technique", "ballFeel", "feint", "crossing", "acceleration", "speed", "agility", "balance", "rhythm", "vision", "composure"],
      RW:  ["finishing", "offBall", "dribbling", "firstTouch", "technique", "ballFeel", "feint", "crossing", "acceleration", "speed", "agility", "balance", "rhythm", "vision", "composure"],
      CAM: ["vision", "passing", "longPass", "crossing", "technique", "ballFeel", "feint", "dribbling", "firstTouch", "offBall", "finishing", "composure"],
      CM:  ["vision", "passing", "longPass", "technique", "ballFeel", "dribbling", "firstTouch", "tackling", "interception", "stamina", "offBall", "composure"],
      CDM: ["passing", "longPass", "vision", "tackling", "slideTackle", "marking", "interception", "positioning", "strength", "composure", "anticipation"],
      LM:  ["vision", "passing", "crossing", "dribbling", "firstTouch", "ballFeel", "feint", "acceleration", "speed", "agility", "balance", "rhythm", "tackling"],
      RM:  ["vision", "passing", "crossing", "dribbling", "firstTouch", "ballFeel", "feint", "acceleration", "speed", "agility", "balance", "rhythm", "tackling"],
      CB:  ["tackling", "slideTackle", "marking", "interception", "positioning", "strength", "jumping", "aggression", "bravery", "anticipation", "heading"],
      LB:  ["tackling", "marking", "interception", "positioning", "crossing", "speed", "acceleration", "agility", "balance", "rhythm", "stamina", "strength"],
      RB:  ["tackling", "marking", "interception", "positioning", "crossing", "speed", "acceleration", "agility", "balance", "rhythm", "stamina", "strength"],
      /* ★ P171：门将核心扩到七类 —— 扑救 5 项全核心 + 门将玩法真实消费的身体/速度项
         （弹跳上角/下地下角、预判读射门、灵活二次反应、平衡倒地、强壮强破对抗）+
         精神（镇定/勇敢 = L3GK hide 判定）+ 传球（视野开球视野）+ 带球（停球）+ 防守（卡位）。 */
      GK:  ["reflexes", "diving", "handling", "gkPositioning", "kicking", "strength", "jumping", "anticipation", "agility", "balance", "composure", "bravery", "vision", "firstTouch", "positioning"],
    },
    POSITION_CORE_MULT: 1.6,   // 非核心属性加点的溢价倍数（核心 ×1.0）
    POSITIONS: {
      ST: { name: "中锋", group: "ATK" }, CF: { name: "影锋", group: "ATK" },
      LW: { name: "左边锋", group: "ATK" }, RW: { name: "右边锋", group: "ATK" },
      CAM: { name: "前腰", group: "MF" }, CM: { name: "中前卫", group: "MF" },
      CDM: { name: "后腰", group: "MF" }, LM: { name: "左前卫", group: "MF" }, RM: { name: "右前卫", group: "MF" },
      CB: { name: "中后卫", group: "DF" }, LB: { name: "左后卫", group: "DF" }, RB: { name: "右后卫", group: "DF" },
      GK: { name: "门将", group: "GK" },
    },
    // ★★ P171 属性分池 v5（七类 35 项**全位置统一**）：门将也拿满七类（扑救替终结），
    //    GK_SUBSET 类内精选退役 —— Pool.ids/membersOf 走全类全量（subset=null 分支自动生效）。
    POOLS: {
      field: ["passing", "dribbling", "defending", "shooting", "awareness", "physicality", "pace"],
      // 门将（P171）：与外场同构的七类 —— 扑救(守门)/传球/带球/防守/精神/身体/速度，每类 5 项 = 35 项
      gk: ["goalkeeping", "passing", "dribbling", "defending", "awareness", "physicality", "pace"],
    },
    POOL_OF: {
      ST: "field", CF: "field", LW: "field", RW: "field",
      CAM: "field", CM: "field", CDM: "field", LM: "field", RM: "field",
      CB: "field", LB: "field", RB: "field",
      GK: "gk",
    },
    /* ★ P171：GK_SUBSET（类内精选）已随「门将七类 35 项」退役 —— Pool 的 subset 分支
       读不到本键即走全类全量，pool.js 逻辑零改动。保留此注释作为历史锚点。 */
    // ★★ P97 M2 位置动态化参数（用户口径：「一开始选的位置只代表潜力往哪个方向靠近」）
    //   适配度 fit(pos) 由 M0.5 的档案权重直接算出 —— **不需要新机制**：
    //     总评上限 = 位置权重 × 潜力表，同一份潜力换个位置权重，上限自然不同（如 ST 89 / CB 81）
    POSITION_DYNAMICS: {
      MASTERY_START: 50,   // 开档对「自己位置」的熟练度（= 能踢）
      MASTERY_FULL: 50,    // ≥ 此值无折扣
      PENALTY_K: 0.15,     // 每差 1 点熟练度 → OVR −0.15（熟练度 0 时 −7.5，即"生疏但能顶"）
      GAIN_START: 3,       // 每场首发 +3
      GAIN_SUB: 1.5,       // 每场替补 +1.5
      GAIN_TRAIN: 1,       // 训练重点选该位置组 +1/季
      // 三条变更通道门槛（提案 §B3）
      COACH_GAP: -2,       // 教练指派：fit(新) ≥ fit(现) + COACH_GAP
      COACH_MASTERY: 20,   // 教练指派：新位置熟练度 ≥ 20
      APPLY_GAP: -6,       // 球员申请：fit(新) ≥ fit(现) + APPLY_GAP —— ★ P272 由 0 放宽到 -6：
                           //   现位置满熟练时适配恒最高，0 门槛=申请通道结构性死路（按钮永不出）。
                           //   允许「适配略低也申请」——主动意愿改位，代价是新位置从零养熟练（既有机制）
      APPLY_APPS: 15,      // 球员申请：本季出场 ≥ 15
      APPLY_APPS_YOUTH: 5, // ★ P272 青训线申请门槛：U19 赛程短，15 场=整季不可达，降为 5
      CRISIS_MASTERY: 0.5, // 危机改位：新位置熟练度 ×0.5（不可拒绝）
      INVEST_EXP: 4000,    // ★ P272 熟练度经验投入：每 INVEST_STEP 点熟练消耗 expPool 经验
      INVEST_STEP: 2,      //   （0→100 共 50 次 = 200k 经验 ≈ 20 点属性；熟练度是实战折扣消除器，定价约 1 属性点 = 2 档熟练）
    },
    /* ══════════ P117 战术阵型（俱乐部/国家队）＋转会适配 ══════════
       ★ 史料口径（2026-09-18 检索：百科/头条战术演变史/SI）：4-2-4=1958/1970 巴西三夺
         雷敏特杯；4-4-2=1966 队短塞英格兰确立；菱形=1999 三冠王棉都红魔；4-3-3=荷兰全攻全守
         →瓜帅巴塞罗纳 2009 六冠王；3-5-2=1986 比拉尔杜为释放老马发明；4-2-3-1=90 年代末
         古典前腰时代兴起、2000s 后世界主流；圣诞树=安帅米岚 2007 欧冠。
       ★ slots 用 13 位置 id（与 POSITIONS/posMastery 同源）；games 面板/转会适配共用单源。 */
    FORMATIONS: [
      { id: "442",  name: "4-4-2 平行中场", era: "1966 年队短塞的英格兰为它加冕——此后半个世纪最经典的攻守平衡模板（老爵爷棉都红魔、匪帅曼德里红白）",
        slots: ["GK", "LB", "CB", "CB", "RB", "LM", "CM", "CM", "RM", "ST", "ST"] },
      { id: "442d", name: "4-4-2 菱形中场", era: "1999 年三冠王棉都红魔把菱形中场用到极致——后腰拖底、前腰尖顶，边路交给两个全场飞奔的边前卫",
        slots: ["GK", "LB", "CB", "CB", "RB", "CDM", "CM", "CAM", "CM", "ST", "ST"] },
      { id: "4411", name: "4-4-1-1", era: "90 年代古典前腰时代的产物——前腰从锋线拆出，埋伏在单箭头身后一击致命（狼王、里克尔梅的位置）",
        slots: ["GK", "LB", "CB", "CB", "RB", "LM", "CM", "CM", "RM", "CAM", "ST"] },
      { id: "4231", name: "4-2-3-1", era: "90 年代末随古典前腰复兴而兴起、2000 年代后的世界主流——双后腰护航，三名攻击手在两线之间做文章；西班牙凭它统治 2008-2012",
        slots: ["GK", "LB", "CB", "CB", "RB", "CDM", "CDM", "LM", "CAM", "RM", "ST"] },
      { id: "4141", name: "4-1-4-1", era: "4-2-3-1 的变形——单后腰扫荡，四名中场一线排开，攻防转换快到对手来不及落位",
        slots: ["GK", "LB", "CB", "CB", "RB", "CDM", "LM", "CM", "CM", "RM", "ST"] },
      { id: "451",  name: "4-5-1", era: "2006 年世界杯法国队把它演绎到极致——中场人数碾压，把比赛拖进自己的节奏",
        slots: ["GK", "LB", "CB", "CB", "RB", "LM", "CM", "CM", "CM", "RM", "ST"] },
      { id: "433c", name: "4-3-3 控球", era: "荷兰全攻全守的遗产——瓜帅巴塞罗纳 2009 六冠王的中场三角把它推向巅峰，边锋内切换位是灵魂",
        slots: ["GK", "LB", "CB", "CB", "RB", "CDM", "CM", "CM", "LW", "ST", "RW"] },
      { id: "433w", name: "4-3-3 两翼", era: "曼德里白舰式 4-3-3——柱式中锋顶在中央、两翼齐飞；70 年代 10 号中前卫大师们（济科、普拉蒂尼）的黄金模板",
        slots: ["GK", "LB", "CB", "CB", "RB", "CM", "CM", "CM", "LW", "CF", "RW"] },
      { id: "4321", name: "4-3-2-1 圣诞树", era: "安胖 AC 米岚 2007 年欧冠复仇之战的圣诞树——双前腰藏在单箭头身后（卡坎与西多弗的教科书）",
        slots: ["GK", "LB", "CB", "CB", "RB", "CDM", "CM", "CM", "CAM", "CAM", "ST"] },
      { id: "352",  name: "3-5-2", era: "1986 年比拉尔杜的阿根廷为了释放老马发明——三中卫+翼卫走廊；孔二愣的都林斑马把它带回豪门视野",
        slots: ["GK", "CB", "CB", "CB", "LM", "CM", "CDM", "CM", "RM", "ST", "ST"] },
      { id: "343",  name: "3-4-3", era: "贝尔桑的疯狂与孔二愣的雾都蓝狮 2016-17 夺冠阵——三中卫、双翼卫、三前锋，极致对攻",
        slots: ["GK", "CB", "CB", "CB", "LM", "CM", "CM", "RM", "LW", "ST", "RW"] },
      { id: "532",  name: "5-3-2", era: "意大利链式防守的现代形态——五后卫落位、三中场绞杀、双前锋伺机反击；弱队踢豪门的经典姿势",
        slots: ["GK", "LB", "CB", "CB", "CB", "RB", "CM", "CM", "CM", "ST", "ST"] },
      { id: "424",  name: "4-2-4", era: "1958/1962/1970 年巴西用它三夺雷敏特杯——加林查与贝利两翼齐飞的黄金年代；现代足坛几乎绝迹，只在碾压局里短暂复活",
        slots: ["GK", "LB", "CB", "CB", "RB", "CM", "CM", "LW", "ST", "ST", "RW"] },
    ],
    // 出现权重池（重复 = 更常见；4231/433 现代主流 ×3，442 经典 ×2，复古 424 极稀有 ×1）
    FORMATION_POOL: ["4231", "4231", "4231", "433c", "433c", "433c", "442", "442", "433w", "433w", "4141", "442d", "4411", "352", "343", "532", "451", "424"],
    /* 转会适配参数（Tactics.fitAssess 单源消费） */
    TACTICS: {
      MASTERY_MIN: 30,     // 球队认可「能踢该位置」的熟练度线（达标 = 正常意向通道）
      NEED_LINE_DELTA: 3,  // 槽位缺口线：现任 OVR < 队伍强度 − 3 记为缺口
      STRONGER_MARGIN: 2,  // 非缺口槽：实战战力高出现任 ≥ 2 才考虑顶替
      CROSS_MARGIN: 6,     // 同族客串（无熟练度）：实战战力高出现任 ≥ 6 才考虑
      PROMISE: { star: "承诺主力（每季 25+ 场）", rot: "承诺轮换（每季 12-22 场）", fight: "承诺进入轮换竞争（每季 8-15 场起步）" },
    },
    // 同族位置（技能可迁移）：同族槽位走「客串」通道（ CROSS_MARGIN 门），跨族绝不考虑
    POS_FAMILY: {
      GK: ["GK"],
      CB: ["CB"],
      LB: ["LB"], RB: ["RB"],
      CDM: ["CDM", "CM", "CAM"], CM: ["CM", "CDM", "CAM"], CAM: ["CAM", "CM", "CDM"],
      LM: ["LM", "RM", "LW", "RW"], RM: ["RM", "LM", "RW", "LW"],
      LW: ["LW", "LM", "RW", "RW"], RW: ["RW", "RM", "LW", "LM"],
      ST: ["ST", "CF"], CF: ["CF", "ST"],
    },
    // ★★ P114 位置 → 7 类权重（v4，程序化重推）：旧 8 类权重按「属性迁移矩阵」搬家——
    //   旧类权重由类内属性均摊承载，属性迁到新类时权重随之跟随；被删属性（决断/集中/
    //   团队合作/工作投入/才华/角球/界外球）权重归零，由 overallAt 的 wsum 归一吸收。
      //   方向自检：ST 终结 .28/速度 .23 最高 ✓；CB 防守 .35 ✓；CAM 传球 .15 ✓；
      //   门将 = goalkeeping .74 + 身体 .12 + 速度 .14（池内 13 项）。
      //   ★ CB 特调：pace .23→.17 / physicality .19→.23 —— 中卫玩法层（L2 防守）没有
      //     灵活/节奏出口（那是带球手的活），权重降回身体才符合"总评占比 = 玩法可感"铁律
      //     （weight_align 硬冲突看守：CB 灵活/节奏曾越 4% 线）。
      //   推导脚本 = tools/_p114_weights_derive.js（一次性，过程留档）。
    POSITION_WEIGHTS: {
      ST:  { passing: .05, dribbling: .13, defending: .04, shooting: .28, awareness: .05, physicality: .13, pace: .23 },
      CF:  { passing: .08, dribbling: .14, defending: .04, shooting: .24, awareness: .06, physicality: .13, pace: .20 },
      LW:  { passing: .08, dribbling: .19, defending: .04, shooting: .19, awareness: .05, physicality: .12, pace: .22 },
      RW:  { passing: .08, dribbling: .19, defending: .04, shooting: .19, awareness: .05, physicality: .12, pace: .22 },
      CAM: { passing: .15, dribbling: .18, defending: .04, shooting: .13, awareness: .07, physicality: .10, pace: .16 },
      CM:  { passing: .14, dribbling: .13, defending: .14, shooting: .05, awareness: .06, physicality: .14, pace: .20 },
      CDM: { passing: .12, dribbling: .09, defending: .26, shooting: .01, awareness: .05, physicality: .15, pace: .20 },
      LM:  { passing: .12, dribbling: .18, defending: .14, shooting: .06, awareness: .05, physicality: .12, pace: .20 },
      RM:  { passing: .12, dribbling: .18, defending: .14, shooting: .06, awareness: .05, physicality: .12, pace: .20 },
      CB:  { passing: .06, dribbling: .04, defending: .35, shooting: .01, awareness: .04, physicality: .23, pace: .17 },
      LB:  { passing: .12, dribbling: .16, defending: .23, shooting: .01, awareness: .04, physicality: .11, pace: .22 },
      RB:  { passing: .12, dribbling: .16, defending: .23, shooting: .01, awareness: .04, physicality: .11, pace: .22 },
      /* ★ P171 门将七类权重重推（Σ=1.00，池均值回填时 OVR 平滑迁移）：
         扑救 .42 仍是门将生命线；精神/身体/速度 .10-.11（反应链与扑救强相关）；
         防守 .09（站位/拦截即防线上提）/ 传球 .09（开球发动）/ 带球 .08（二次进攻持球）。 */
      GK:  { goalkeeping: .42, passing: .09, dribbling: .08, defending: .09, awareness: .10, physicality: .11, pace: .11 },
    },
    // ★★ P114 类别内细项权重 v4（Σ=1；overall() 内归一化）—— 5 项间的相对价值
    ATTRIBUTE_INNER: {
      passing:     [["vision", .24], ["passing", .26], ["longPass", .18], ["crossing", .18], ["freeKicks", .14]],
      dribbling:   [["dribbling", .26], ["firstTouch", .22], ["technique", .20], ["ballFeel", .16], ["feint", .16]],
      defending:   [["tackling", .22], ["slideTackle", .20], ["marking", .20], ["interception", .20], ["positioning", .18]],
      shooting:    [["finishing", .26], ["offBall", .22], ["longShots", .18], ["heading", .18], ["penalties", .16]],
      awareness:   [["leadership", .16], ["determination", .24], ["composure", .24], ["aggression", .18], ["bravery", .18]],
      physicality: [["strength", .24], ["stamina", .22], ["jumping", .20], ["naturalFitness", .18], ["anticipation", .16]],
      pace:        [["acceleration", .24], ["agility", .20], ["speed", .24], ["balance", .16], ["rhythm", .16]],
      /* ★ P171：守门细项 5 项重归一（command .12 并入 reflexes/diving/gkPositioning） */
      goalkeeping: [["reflexes", .26], ["diving", .26], ["handling", .20], ["gkPositioning", .16], ["kicking", .12]],
    },
    // ★★ P114 身体档案（身体 5 项的权重，Σ=1）—— 球风真正改变总评构成。
    //   v4：预判入身体（读比赛/落点预判也是身体化的能力）；灵活/平衡迁至速度类。
    BUILD_PROFILES: {
      anchor:    [["strength", .30], ["stamina", .22], ["jumping", .20], ["naturalFitness", .14], ["anticipation", .14]],  // 支点 / 中卫
      poacher:   [["strength", .22], ["stamina", .24], ["jumping", .24], ["naturalFitness", .12], ["anticipation", .18]],  // 抢点型前锋
      engine:    [["strength", .20], ["stamina", .32], ["jumping", .12], ["naturalFitness", .14], ["anticipation", .22]],  // 全场跑动型（清道夫：预判权重略升）
      technical: [["strength", .20], ["stamina", .26], ["jumping", .12], ["naturalFitness", .18], ["anticipation", .24]],  // 技术型
      winger:    [["strength", .18], ["stamina", .28], ["jumping", .14], ["naturalFitness", .18], ["anticipation", .22]],  // 边路
      keeper:    [["strength", .22], ["stamina", .24], ["jumping", .22], ["naturalFitness", .14], ["anticipation", .18]],  // 门将
    },
    // 位置 → 默认身体档案（无球风时的兜底）
    BUILD_BY_POS: {
      ST: "poacher", CF: "poacher", LW: "winger", RW: "winger", CAM: "technical", CM: "engine",
      CDM: "anchor", LM: "winger", RM: "winger", CB: "anchor", LB: "winger", RB: "winger", GK: "keeper",
    },
    // ★ 球风 → 身体档案覆盖（12 球风，id 与 data_identity.js styles 一致）
    BUILD_BY_STYLE: {
      target: "anchor", poacher: "poacher", false9: "technical",      // ATK
      engine: "engine", architect: "technical", magician: "winger",    // MF
      wall: "anchor", sweeper: "engine", wingback: "winger",           // DF
      shotstopper: "keeper", sweepergk: "keeper", commander: "keeper", // GK
    },
    // ★★ P97 M1 · 潜力上限体系（三层：天赋 pot → 积分解锁 potUnlock → 传承 starUnlock，硬顶 92）
    // 地基推论：**潜力表与位置无关**；总评上限 = 位置权重 × 潜力表的加权结果
    //   → 「位置只代表潜力往哪偏」与「位置可动态调整」自动咬合，位置适配度自然浮现
    // ★ potUnlock 由生涯积分驱动（M4 落 META）；M1 阶段按 0 代入，字段与公式先预留，不阻塞
    POTENTIAL: {
      // 三档出身的平均潜力（★ P113 用户拍板：90 / 85 / 80；选出生界面必须直接展示这三个数字）
      // id 约定：genius（足球天才·广告）/ sports（体育世家·5 冠解锁）/ hotblood（热血少年，承旧 street 野球）
      BASE: { genius: 90, sports: 85, hotblood: 80 },
      // 生成参数
      SPREAD: 14,          // 位置偏置的半宽（类别潜力极差）
      LAMBDA: 2.2,         // ★ P97 M2 上调 1.0 → 2.2：位置偏置强度
                           //   为什么必须调：归一化偏置的值域只有 ±0.32，LAMBDA=1.0 时
                           //   「同一份潜力换位置」的 OVR 差异仅 0~3 —— 位置这个维度形同虚设。
                           //   调到 2.2 后差异 5~8，配合熟练度折扣才撑得起「位置动态化」。
                           //   （M1 定稿的 LAMBDA=1.0 是拍脑袋的"按提案原值"，从未验证过差异幅度）
      CAT_NOISE: 2.0,      // 类别层高斯噪声 σ
      ATTR_JITTER: 2.5,    // 类别内各项抖动 σ
      FLOOR_OFFSET: -20,   // 类别潜力下限 = BASE + 该值
      CEIL_OFFSET: 12,     // 类别潜力上限 = BASE + 该值
      // ★ 硬顶：没有任何一项能到 99。★ P113：92 → 95 —— BASE 上调到 90 后，
      //   强项类若仍被 92 截顶，位置间上限跨度会压扁到 2（_p97_pool_probe 的 D 组判据红：
      //   "BASE 90 各位置上限跨度 2 ≥ 3"）—— 位置动态化在高潜档位失去感知。
      //   95 = 给 90 档留出 3~5 点位置差异空间（ST ~94 / CDM ~90），
      //   同时保留"个体差异 + 传承"的加成通道（unlock 12 + star 12 仍被硬顶收口）。
      HARD_CAP: 95,
      MIN: 30,
      // ★ 生涯积分 → potUnlock 阶梯查表（只累积不消耗；M4 接 META.legacyPoints）
      // ★ R7-317 重标（2026-09-15）：乙-2a 降噪（intl cap 下调）后单周目中位偏移 −16~−18%（>10% 触发
      //   R7-312③ 预留条款）⇒ 积分轴 ×0.82 缩放（8 档位数不动；解锁值列不动）。原表 [[0,0],[150,2],[300,4],[500,6],[750,8],[1000,10],[1300,11],[1600,12]]
      UNLOCK_TABLE: [[0, 0], [125, 2], [250, 4], [410, 6], [615, 8], [820, 10], [1070, 11], [1310, 12]],
      UNLOCK_CAP: 12,
      // ★ 传承上限（球星传承，定向 +1~+2/次；M4 落地）
      STAR_CAP: 12,
      // ★★ P97 M4 · L3 传承的**生涯总量**上限（提案 §A3「生涯累计 +12」）
      //   ★ 与 `STAR_CAP` 的分工：`STAR_CAP` 是**单项**封顶（`effPot` 内 `Math.min` 用），
      //     本值是**所有项求和**的封顶。两者取同一数值 12 →
      //     既允许"12 点全砸一项"的专精路线，也保证生涯总量不会失控。
      STAR_TOTAL_CAP: 12,
      // ★ 撞顶去处（D2）：单属性撞顶自动溢流 → 全池撞顶折价转 SP
      CAP_DISCOUNT: 0.7,        // 折价系数（70%）
      SP_PER_EXP: 200000,       // ★ 折价后多少 EP 换 1 SP（待标定；保守值，防 SP 通胀）
      SP_SEASON_CAP: 6,         // 每赛季折价转 SP 上限（防爆）
      /* ★★ P120（2026-09-18 用户拍板）：出身硬顶 + 出身成本系数 + 广告潜力突破 ──
         设计口号：「出身差是免费玩家的世界观，广告是氪佬的通行证」。
         · 未突破：effCap = min(ORIGIN_HARD_CAP[origin], pot + unlock + star)
           天才 95 / 体育 89 / 热血 84 —— 解锁(+12)与传承(+12)仍全出身同权，
           但被出身帽收口 → 免费梯度终盘 ≈ 92 / 86 / 80。
         · 出身成本：属性点成本 ×ORIGIN_COST_MULT[origin]（1.0 / 1.12 / 1.25）
           —— 数学上等价「热血经验获取 ×0.8」，但单点生效，天然覆盖
           训练/比赛/广告注入/等级奖励全部供给路线（广告能加速但压不平）。
         · 广告潜力突破：单项磨到帽后看广告把该项上限 +10（不限次，
           总封顶 AD_BREAK.CAP = 100）→ 体育 89→95（1 次）、热血 84→94→…
           —— 看得多就能压平出身差；96+ 段成本 ×8 是天然的最后一道缓坡。
         ★ 旧档兼容：origin 缺失或旧 id（family/scholar/street）查表 miss
           → 回落 HARD_CAP 95，旧档待遇只松不紧。 */
      /* ★ P120 标定（探针实测后微调）：首版 89/84 的帽被 26 季自然线磨满（体育 88/热血 84，
         高于目标 86/80）—— 收窄到 86/81 后广告线 ≈ 85-86/80-81，梯度 92/86/80 落位。 */
      /* ★ P121（用户拍板）：突破每季全池 3 次 —— 氪佬也要花 20+ 季才能全池到 100（成长感）；
         兄弟拍板"不限次、100 封顶"的节奏约束版：单季限流，生涯总量仍不设限。 */
      ORIGIN_HARD_CAP: { genius: 95, sports: 86, hotblood: 81 },
      ORIGIN_COST_MULT: { genius: 1.0, sports: 1.12, hotblood: 1.25 },
      /* ★★ P266（2026-09-21 用户拍板）：广告突破 10 → 5——「广告改为潜力值+5，不再是+10」。
         消费点唯一：potential.effPot 的 adBreak[id]×STEP（10→5 只改此处，机制/文案自动跟随；
         hub 按钮文案已改为读 STEP 动态拼接）。每季 3 次与总帽 100 不变 ⇒ 满池 100 需
         20 次突破（原 10 次），与 P263 经验阶价买断同向再收紧。 */
      AD_BREAK: { STEP: 5, CAP: 100, PER_SEASON: 3 },
      /* ★★ P189（用户拍板）：经验突破 —— 单项磨到帽后花经验 +1 上限（与广告突破 +10/次
         每季 3 次并行；共享总帽 100）；不限次/季（递增自带节流）；出身系数照乘单源。
         ★★ P194 重定价（用户「26 季全周期重算——上次只模拟 12 季」）：全生命周期审计
         （tools/_p194_exp_full.js，14-40 岁 26 季跑满退役）实锤 12 季口径严重低估后期：
         堆满玩家 S20+ 全池到 100 顶后经验无处可去，**期末池 3604 万**（溢出率 33.7%）。
         重定价 = BASE 8 万→12 万 + GROWTH 1.15→1.25：全池 175 点消费空间 1800→3800 万
         （5 点均价 11.3→21.7 万/点）→ 期末压到 ~1000 万量级；配合 P194 老将训练衰减
         （systems.js，30 岁+每岁 -3%）双杠杆 → 堆满溢出率 ≤10%。
         · 前期不受影响：S2-S5 池空（0-7 万）本就买不起突破，青训紧张度原样；
         · 中期更紧张 =「不看广告有点难受」的意图内；广告点注入价值反而提升。 */
      /* ★★ P196 再提价（用户「零广告 97.9/100 绝对不对——满值是看广告才配达到的标准」）：
         26 季审计（P194）+ 衰退机制（P195）联测实锤：零广告玩家中前期就能把帽推到 ~93-95，
         与堆满广告只差 1-2 点 = 广告无感。BASE 12 万→20 万（热血再 ×1.25 出身系数）：
         把「抬帽」定价抬高，经验自然流向衰退期的「维系」（补属性 > 买上限）；
         96-100 顶层区间实际由广告突破（+10/次）主导 = 广告玩家的专属标准。 */
      EXP_BREAK: { BASE: 1650000, GROWTH: 1.25, STEP: 5 },
      /* ★★ P262（2026-09-21 用户拍板）：经验突破改「阶价买断」——每次 +5 上限（EXP_BREAK.STEP=5），
         成本公式不变（BASE × GROWTH^n，n=该项已突破点数，+5 写入后恒为 5 的倍数）
         ⇒ 天然形成 5 点一阶、每阶 ×3.05（=1.25^5）跳涨：阶1 165万 / 阶2 504万 / 阶3 1537万 / 阶4 4691万。
         BASE 20万→165万 = 阶1 总价与旧逐点连买 5 点（164 万）等价起步（零变快）；
         之后逐阶指数级变贵（第 6-10 点 ≈×2.4 / 第 11-15 点 ≈×6 / 第 16-20 点 ≈×14.7）
         ——「越高阶消耗越多」精确落位，经验突破回归偶尔点一下的慢轨，顶层仍由广告突破主导。
         · 旧档兼容：expBreak 存量 n（逐点+1 时代）非 5 的倍数时公式照常（pow 连续），价格单调不减；
         · hub 按钮文案同步「经验突破+5（X万）」（顺手修 k/万 显示错：20 万旧显示 20k）。 */
      /* ★★ P196（用户拍板）：年龄分档经验消耗 —— 「28 岁前 / 28 岁后 / 36 岁后」三档逐级提价。
         语义：经验买的是身体的学习能力 —— 28 岁前原价；28-35 岁 ×2.0；36 岁起 ×3.0。
         覆盖两大消费出口：手动加点（systems.spendOn）+ 经验突破（potential.expBreakCost），
         广告侧不受影响（广告买的是现实资源，不是学习能力）。
         效果：衰退期「补身体」是净消耗且越来越贵 —— 巅峰接近顶级、 aging 被衰退不断拉低、
         经验被迫投入维系；28 岁内恒 ×1.0（soak 12 季 25 岁档零漂移）。
         与出身系数/软上限/位置杠杆连乘（hub 展示同源，ageCostMult 单源）。 */
      AGE_COST: { T1: 28, T2: 36, M1: 1.0, M2: 2.0, M3: 3.0 },
      /* ★★ P195（用户拍板）：老将衰退 —— 身体/速度双掉（能力值+潜力值）且掉得更快，
         36 岁起其他大类也缓慢掉；能力值掉更快 = 玩家可用经验补齐（spendOn 上限=衰退后的 pot）。
         · 校准锚：热血 ST 身体/速度 pot 起点 ~80-86 → 30-35 岁均 -1.5/年（-9）+
           36-40 岁 -4/年（-16）→ 40 岁 ≈ 55-61，落目标区间 50-60；
         · 下限防崩：pot 45 / attrs 35；30 岁内零触发（soak 12 季零漂移）。
         · 配合 P194 经验经济：后期「补身体」= 经验新去处（每年 ~400 万量级）。 */
      DECLINE: {
        START_AGE: 30, FAST_AGE: 36, FLOOR_POT: 45, FLOOR_ATTR: 35,
        PHY_PACE: { POT_SLOW: 1.5, POT_FAST: 4, ATTR_SLOW: 2, ATTR_FAST: 5 },
        OTHER: { POT_FAST: 0.5, ATTR_FAST: 1 },
      },
    },

    // ★★ M4 · 生涯积分（`legacyPoints`）—— 设计见 `P97_潜力与位置体系_设计提案_v0.1.md` §A5
    //   ★ 唯一货币：一份积分两个出口 —— ① 抬自己的潜力上限（`POTENTIAL.UNLOCK_TABLE`）
    //     ② 折算国家实力喂青训苗子池（§A5.1）
    //   ★ 口径：**只累积不消耗**（门槛型，攒到就给）；**每季实时重算**（幂等，不存中间态）
    //   ★★ 每个来源**单列上限**（防通胀）—— 无上限的来源（如"冠军 +30/个"）会让长生涯积分爆炸
    LEGACY: {
      VERSION: 1,
      // 逐来源分值 + 单列上限（`cap` 为该项在**整个生涯**内的计分次数上限）
      SRC: {
        apps15:    { pts: 10, cap: 20, label: "赛季出场 ≥15" },     // careerLog[].apps
        rating70:  { pts: 8,  cap: 15, label: "赛季场均 ≥7.0" },    // careerLog[].avgRating
        league:    { pts: 30, cap: 10, label: "联赛冠军" },          // trophies
        cup:       { pts: 15, cap: 10, label: "国内杯赛冠军" },
        continental:{ pts: 60, cap: 8,  label: "洲际冠军" },
        goldenBoot:{ pts: 20, cap: 8,  label: "金靴" },
        bestPlayer:{ pts: 25, cap: 6,  label: "赛季最佳 / 金冕" },
        intlApps:  { pts: 3,  cap: 40, label: "国家队出场" },        // d.intl.career.apps（R7-316 乙-2a：cap 60→40 降噪）
        intlGoals: { pts: 10, cap: 20, label: "国家队进球" },        // d.intl.career.goals（R7-316 乙-2a：cap 30→20 降噪）
        prestige:  { pts: 1,  cap: 50, label: "国际声望（超出初始 50 的部分）" },
        ending:    { pts: 50, cap: 8,  label: "独家结局" },          // d.careersCompleted
        titles:    { pts: 10, cap: 20, label: "奖杯总数" },          // trophies 里的冠军类

        // ★★ P99 批 3（主理人裁定 B1 = 方案 B；设计稿 §7.5 (iii)）：4 项**青年来源**，上限合计 63
        //   （youthApps 5×3 + youthLeague 8×3 + youthCup 6×2 + youthBoot 6×2 = 15+24+12+12 = 63，
        //    与实测的 54 分缺口同量级）。
        //   ★★ 两条硬约束（否则方案 B 是"永不落盘的静默配置"，R22）：
        //     ① label 必须与 `d.youth.trophies[].name` **逐字相同** —— J2 是"容器比对"（按 name 求交）；
        //        ★ 且 `legacy.js` 的匹配**直接读这里的 label**，所以本处是青年荣誉名的**唯一真相源**
        //        （youth.js 写入名 + 本 label + 匹配器 = 三处同名，把它们收敛成"label 一处 + 引用"）。
        //     ② 生命周期"仅青训期"：只读 `d.youth.log` / `d.youth.trophies`，**不得**回退读
        //        `d.careerLog` / `d.trophies`（否则同一季会被算两次：一次进 apps15、一次进 youthApps）。
        //   ★ 数据来源：youthApps ← d.youth.log[].apps；其余三项 ← d.youth.trophies。
        youthApps:   { pts: 5, cap: 3, label: "青年联赛出场 ≥20" },
        youthLeague: { pts: 8, cap: 3, label: "青年联赛优胜" },
        youthCup:    { pts: 6, cap: 2, label: "青年杯优胜" },
        youthBoot:   { pts: 6, cap: 2, label: "青年联赛射手王" },
      },
      PRESTIGE_INIT: 50,        // 声望初始值（超出部分才计分）
      // 目标量级（★ P100-B2 后重算：2026-09-15 · 20 种子 · 真实轮次日期轴（datePlan）使中位微移）
      //   四档中位：弱 689 / 普 707 / 强 729 / 传奇 761（严格递增）
      //   界1 = (普+强)/2 = 718 ｜ 界2 = (强+传奇)/2 = 745 ⇒ 三带包含式
      //   落带验证：弱 689→normal ✓ 普 707→normal ✓ 强 729→elite ✓ 传奇 761→legend ✓（tier 映射一致）
      //   沿革：R7-312 737/788 → R7-317 623/656（乙-2a）→ B1 729/773（跨年轴）→ B2 718/745（datePlan）→ B5 707/760（国际窗口避窗顺延；弱/普中位交叉属噪声，两档同落 normal）。
      //   ★ 判据 (a) 仍 warn（波动 85~179 vs Δ 18~32）——噪声结构同前，维持诊断位。
      BAND: { normal: [0, 707], elite: [707, 760], legend: [760, 99999] },
    },
  };

  // 联赛分级顺序（晋级/降级链，仅使用真实数据包中存在的联赛）
  CONFIG.LEAGUE_LEVEL_ORDER = ["epl", "laliga", "bundesliga", "seriea", "ligue1", "csl", "chinaleague"];

  /* ═══ P104-B4：解约金条款谈判（D7 拍板：名气达门槛才可选）═══
     FAME_MIN        名气门槛（d.fame）——防开局就握免死金牌；锚 renewalQuote 的 fameN = fame/2e6，取半程。
     WAGE_MULT_LOW   低薪档薪资折让 —— 对齐休赛期条款卡「压一档」0.9。
     CLAUSE_MULT_LOW 低档解约金折扣 —— 对齐休赛期条款卡「压一档」0.75（transfer.js applyOffer 同系数）。
     高档恒等 ×1.0/×1.0（天价基准由俱乐部风格 clauseMult 区间中值出，见 transfer.renewalClauseQuote）。 */
  CONFIG.P104_CLAUSE = {
    FAME_MIN: 1000000,
    WAGE_MULT_LOW: 0.9,
    CLAUSE_MULT_LOW: 0.75,
  };

  /* ═══ P105-B2：出场时间承诺（FM squad status 球员侧化）═══
     承诺口径单源 = transfer.playingTimeOf 的二值判定（starter/rotation）——报价卡「承诺主力」
     文案早已存在（nation_dev），B2 把它落档 + 赛末校验兑现。门槛按 38 轮口径标定：
     starter 承诺 → 出场 ≥20（半程以上主力）；rotation → ≥10。兑现是本分（零奖励）；
     未兑现 = 信任 −4 + 情绪 −5（教练骗了你）。一次性校验（签约后首个完整赛季）。 */
  CONFIG.P105_PROMISE = {
    starter: 20,
    rotation: 10,
    TRUST_MISS: -4,
    MORALE_MISS: -5,
  };

  /* ═══ P105-B3：转会兴趣动态（老狐的风声）═══
     fame ≥ FAME_MIN（50 万，比 P104-D7 解约金门槛 100 万低一档=金字塔结构）的非青训球员，
     8-11 月（夏窗前奏，文案不穿帮）表现达标时 3% 概率爆绯闻：事件卡 + d.offers 落兴趣条目
     （合同页「老狐的风声」自动有货）。30 天冷却；兴趣条目 TTL 90 天过期、上限 3 条 FIFO。
     兴趣 ≠ 报价：rumor 条目不进赛季末正式报价池（genTransferOffers 独立生成）。 */
  CONFIG.P105_RUMOR = {
    FAME_MIN: 500000,
    CHANCE: 0.03,
    COOLDOWN: 30,
    MAX: 3,
    TTL_DAYS: 90,
  };

  /* ═══ P100-B1：联赛真实赛季日历（Q1=C 拍板：按联赛分真实框架）═══
     start/end = [月, 日]；crossYear = 跨年季（end 在次年）；gap = 联赛轮间隔（天）。
     default = 未收录联赛的兜底（保持旧抽象轴 2-01~12-15 / 每 8 天一赛）。
     ★ 日期真值优先级：本表 > EXTRA.SEASON_*（data_config_extra 的旧单年轴只兜 default）。 */
  CONFIG.LEAGUE_CALENDAR = {
    default:     { start: [2, 1],  end: [12, 15], gap: 8, crossYear: false, win: [[7, 1], [7, 31]] },
    epl:         { start: [8, 16], end: [5, 24],  gap: 7, crossYear: true, win: [[1, 1], [1, 31]] },
    laliga:      { start: [8, 23], end: [5, 24],  gap: 7, crossYear: true, win: [[1, 1], [1, 31]] },
    bundesliga:  { start: [8, 22], end: [5, 23],  gap: 7, crossYear: true, win: [[1, 1], [2, 2]] },
    seriea:      { start: [8, 30], end: [5, 31],  gap: 7, crossYear: true, win: [[1, 2], [1, 31]] },
    ligue1:      { start: [8, 8],  end: [5, 23],  gap: 7, crossYear: true, win: [[1, 1], [1, 31]] },
    csl:         { start: [3, 8],  end: [11, 2],  gap: 7, crossYear: false, win: [[6, 15], [7, 15]] },
    chinaleague: { start: [3, 8],  end: [10, 26], gap: 7, crossYear: false, win: [[6, 15], [7, 15]] },
  };
  CONFIG.calOf = function (lid) {
    const C = CONFIG.LEAGUE_CALENDAR;
    return (lid && C[lid]) || C.default;
  };
  /* 赛季起始真实日期：季锚点 = d.season（欧洲 8 月在 season 年内开季；中超 3 月同） */
  CONFIG.calStart = function (lid, season) {
    const c = CONFIG.calOf(lid);
    return { year: season, month: c.start[0], day: c.start[1] };
  };
  /* 赛季结束真实日期：跨年季 end 在 season+1 年 */
  CONFIG.calEnd = function (lid, season) {
    const c = CONFIG.calOf(lid);
    return { year: season + (c.crossYear ? 1 : 0), month: c.end[0], day: c.end[1] };
  };
  /* ★ P100-B4：转会窗判定（月日范围比较，跨年由 win 单月形态天然规避） */
  CONFIG.calInWindow = function (lid, date) {
    const c = CONFIG.calOf(lid);
    if (!c || !c.win || !date) return false;
    const v = date.month * 100 + date.day;
    return v >= c.win[0][0] * 100 + c.win[0][1] && v <= c.win[1][0] * 100 + c.win[1][1];
  };
  /* 日期序比较 a >= b（休赛期结束判定用：当前 date 是否已达下季起点） */
  CONFIG.calGE = function (a, b) {
    if (a.year !== b.year) return a.year > b.year;
    if (a.month !== b.month) return a.month > b.month;
    return a.day >= b.day;
  };
  /* ★ P100-B6：赛季显示标签——欧洲跨年季 "2014-15"，单年季（中超）"2015"。
     season = 赛季锚年（跨年季的开局年）。 */
  /* ══ ★★ P161（2026-09-19 用户拍板）：联赛生态动态化（单一真相源）══════════
     用户原话：「球队除了各个联赛的豪门外，其他球队的实力要动态，即使是豪门，
     也应该冠军都有机会竞争，不要盲目出现某个球队拿一堆连冠的情况，除非是
     历史上真实出现了的，比如花都和慕城红星，亦或者曼德里白舰欧冠三连这种，
     但还是尽量给更多球队参与感。」
     ── 机制（season.js applySeasonDynamics，initSeason 每季触发）──
     · 随机游走 WALK_P：60% 概率 ±1；
     · 冠军税 CHAMP_TAX：上季冠军 −(2 + min(2, 连冠数−1))——连冠越久税越重；
     · 王朝白名单 DYNASTY：真实王朝球队税×taxMul——慕城红星/花都 0.4（历史长垄断，
       允许连冠）、羊城红虎 0.75（七连冠真实，但保留魔都浦潮 2018 式夺权空间）；
       曼德里白舰是欧冠三连（洲际赛），不在联赛白名单；
     · 垫底复兴 BOTTOM_N：末 3 队 +(1~3)（引援反弹，中下游波动本就大）；
     · 均值回归：与真实基线差 ≥2 时每季向基线拉 1（防永久漂离真实世界观）；
     · 钳位 RANGE：|strength − 真实基线| ≤ 6（强队不塌方、鱼腩不恒霸）。
     玩家队不参与漂移（实力=玩家成长）；开局季不漂移（有真实锚定拟合模型）。 */
  CONFIG.LEAGUE_DYNAMICS = {
    enabled: true,
    WALK_P: 0.6,
    CHAMP_TAX: 3,
    BOTTOM_N: 3,
    REGRESS_GAP: 2,
    RANGE: 6,
    DYNASTY: {
      "慕城红星": { taxMul: 0.4 },
      "花都红蓝": { taxMul: 0.4 },
      "羊城红虎": { taxMul: 0.75 },
    },
  };
  CONFIG.seasonLabel = function (lid, season) {
    const c = CONFIG.calOf(lid);
    if (c && c.crossYear) return season + "-" + String((season || 0) + 1).slice(2);
    return String(season || "");
  };
  /* ══════════════════════════════════════════════════════════════════════════
     ★★★ P107（2026-09-17）：生命周期四件套 —— 每一条都是**唯一真相源**。
     ══════════════════════════════════════════════════════════════════════════ */

  /** 赛季**序号**（S1 = 首季）。
   *  ★ 存在的理由：`d.season` 是**年份**（2014 起），不是序号。此前
   *    `when.minSeason` 直接拿年份比序号 ⇒ 恒真（631 处门集体失效，实证见
   *    tools/_p107_lifecycle_audit.js R1）。本函数 = 年份 → 序号的唯一换算点，
   *    消费点：eventcards 的 minSeason 门 + 顶栏 hub.js 的 "S1" 标签。 */
  CONFIG.seasonIndexOf = function (season) {
    return ((season || CONFIG.SEASON_START_YEAR) - CONFIG.SEASON_START_YEAR) + 1;
  };

  /** 是否**已签职业合同**（相位判据【唯一真相源】）。
   *  原口径散落两处：eventcards 的 `proContract` 门 + mainline 的 spineCondOk。
   *  判据 = 旗标（`d.flags.firstProContract`，Youth.leave 出口落）∨ 相位已 senior（旧档兼容）。 */
  CONFIG.isProContract = function (d) {
    return !!d && (d.phase === "senior" || !!(d.flags && d.flags.firstProContract));
  };

  /** 当前所处的生命周期段（`CONFIG.CAREER_BANDS` 的 id）。
   *  返回 null = 不变量被破坏（不应发生）—— 探针看守互斥/覆盖，见 _p107_lifecycle_audit R3。 */
  CONFIG.careerBandOf = function (d) {
    if (!d) return null;
    const phase = CONFIG.isProContract(d) ? "senior" : "youth";
    const age = (d.player && d.player.age) || 0;
    for (let i = 0; i < CONFIG.CAREER_BANDS.length; i++) {
      const b = CONFIG.CAREER_BANDS[i];
      if (b.phase && b.phase !== phase) continue;
      if (b.ageMin != null && !(age >= b.ageMin)) continue;
      if (b.ageMax != null && !(age <= b.ageMax)) continue;
      return b.id;
    }
    return null;
  };

  /** 生命周期段查表（id → 段对象）。**未知 id 返回 null** —— 调用方必须 fail-safe
   *  （eventcards 的口径 = 挡：宁可不弹，不可弹错）。 */
  CONFIG.bandOf = function (id) {
    const L = CONFIG.CAREER_BANDS;
    for (let i = 0; i < L.length; i++) if (L[i].id === id) return L[i];
    return null;
  };
  /* 日期 +1 天（月末进位；跨年由调用方 advanceDay 逻辑同理处理 12→1） */
  CONFIG.calNextDay = function (dt) {
    const DIM = { 1: 31, 2: 28, 3: 31, 4: 30, 5: 31, 6: 30, 7: 31, 8: 31, 9: 30, 10: 31, 11: 30, 12: 31 };
    const o = { year: dt.year, month: dt.month, day: dt.day + 1 };
    if (o.day > DIM[o.month]) { o.day = 1; o.month++; if (o.month > 12) { o.month = 1; o.year++; } }
    return o;
  };

  // ★ P99 批 1（A2）：倍率单一真相源别名 —— 与 CONFIG.YOUTH.MULTIPLIERS 是同一个对象。
  //   systems.js:367 的消费点零改动；改倍率只改 YOUTH.MULTIPLIERS 一处。
  CONFIG.YOUTH_MULTIPLIERS = CONFIG.YOUTH.MULTIPLIERS;

  // ★★ P99 `(0-bis)` 后续 · 主理人 2026-09-15 裁定 3（批准立项）：**成长速率量提到配置层**
  //   ---------------------------------------------------------------------------
  //   `caps` = `Growth.seasonEnd` 的**每季 delta 上限**，按 `player.hidden.growth` 档位取
  //   （ordinary 4 / excellent 6 / special 8），再 +（天赋 `prodigy` ? 2 : 0）。
  //   ★ 为什么必须可配置（三条）：
  //     ① **口径一致**：这一族的标定值（`HARD_CAP` / `UNLOCK_TABLE` / `STAR_CAP` /
  //        `CAP_DISCOUNT` / `SP_PER_EXP` / `SP_SEASON_CAP`）**全在 `CONFIG.POTENTIAL`**，
  //        **只有 `caps` 原先藏在 `systems.js` 的函数体字面量里** ⇒ 不可配置、不可注入。
  //     ② **可验证**：`(甲)` 的可用杠杆**正是 cap** ⇒ 不提到配置层，"改 caps 刻度"就
  //        **造不出真单变量对照**（探针无法注入，只能改源码后重跑）。
  //     ③ **与「天花板量」分开命名**：本值是**速率量**；天花板量是 `Potential.effPot`
  //        （定义式 `min(92, pot + potUnlock + starUnlock)`）—— 两个量**不得用一个词指**。
  //   ★ 行为契约：`systems.js` 侧写成 `(CONFIG.POTENTIAL && CONFIG.POTENTIAL.CAPS) || {字面量}`
  //     ⇒ 本键**缺失时逐位等价于历史行为**（旧配置 / 旧包兼容，保证「只增不改」）。
  CONFIG.POTENTIAL.CAPS = CONFIG.POTENTIAL.CAPS || { ordinary: 4, excellent: 6, special: 8 };

  window.CONFIG = CONFIG;
})();
