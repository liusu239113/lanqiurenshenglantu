-- ============================================================================
-- Config — 《篮途》全局配置、平衡数值与动漫手绘风配色
-- 所有魔法数字集中在此，方便调参
-- ============================================================================

local Config = {}

Config.TITLE = "篮球人生：篮途"
Config.SUBTITLE = "从街球场到世界之巅"
Config.VERSION = "2.0.0"

-- 竖屏布局基准
Config.LAYOUT = {
    maxContentWidth = 560,   -- 桌面端内容列最大宽度
    topBarHeight = 64,
    bottomBarHeight = 84,
}

-- ---------------------------------------------------------------------------
-- 五项核心能力（0-99）
-- ---------------------------------------------------------------------------
---@class AttrDef
---@field key string
---@field name string
---@field desc string
---@field icon string

---@type AttrDef[]
Config.ATTRS = {
    { key = "scoring",    name = "得分", desc = "投篮、终结与攻坚能力", icon = "icon/icon_scoring.png" },
    { key = "playmaking", name = "组织", desc = "传球视野与串联能力",   icon = "icon/icon_playmaking.png" },
    { key = "defense",    name = "防守", desc = "抢断、护框与篮板",     icon = "icon/icon_defense.png" },
    { key = "athletic",   name = "体能", desc = "速度、弹跳与耐力",     icon = "icon/icon_athletic.png" },
    { key = "iq",         name = "意识", desc = "战术理解与临场决策",   icon = "icon/icon_iq.png" },
}

Config.ATTR_MAX = 99

-- ---------------------------------------------------------------------------
-- 场上位置
-- ---------------------------------------------------------------------------
---@class PositionDef
---@field id string
---@field name string
---@field short string
---@field focus table<string, number>
---@field desc string

---@type PositionDef[]
Config.POSITIONS = {
    {
        id = "PG", name = "控球后卫", short = "控卫",
        focus = { scoring = 28, playmaking = 44, defense = 26, athletic = 32, iq = 36 },
        desc = "球队大脑，掌控节奏与传球",
    },
    {
        id = "SG", name = "得分后卫", short = "分卫",
        focus = { scoring = 44, playmaking = 28, defense = 28, athletic = 34, iq = 28 },
        desc = "外线尖刀，以得分撕裂防线",
    },
    {
        id = "SF", name = "小前锋", short = "小前",
        focus = { scoring = 36, playmaking = 30, defense = 32, athletic = 34, iq = 30 },
        desc = "全能锋线，攻防两端都能承担",
    },
    {
        id = "PF", name = "大前锋", short = "大前",
        focus = { scoring = 30, playmaking = 22, defense = 42, athletic = 34, iq = 28 },
        desc = "内线苦力，篮板与对抗的保障",
    },
    {
        id = "C",  name = "中锋", short = "中锋",
        focus = { scoring = 30, playmaking = 20, defense = 48, athletic = 30, iq = 28 },
        desc = "禁区守护神，护框与内线终结",
    },
}

-- ---------------------------------------------------------------------------
-- 生涯阶段（按年龄推进）
-- ---------------------------------------------------------------------------
---@class StageDef
---@field id string
---@field name string
---@field minAge number
---@field maxAge number
---@field teamPrefix string
---@field teamStrength number
---@field bg string

-- 区间不重叠：updateStage 取首个匹配项，重叠会让实际阶段比配置晚一年
---@type StageDef[]
Config.STAGES = {
    { id = "street", name = "街头球场", minAge = 15, maxAge = 16, teamPrefix = "街区联队", teamStrength = 45, bg = "bg/bg_street.jpg" },
    { id = "high",   name = "高中联赛", minAge = 17, maxAge = 18, teamPrefix = "高中校队", teamStrength = 58, bg = "bg/bg_highschool.jpg" },
    { id = "ncaa",   name = "大学联赛", minAge = 19, maxAge = 20, teamPrefix = "大学校队", teamStrength = 72, bg = "bg/bg_college.jpg" },
    { id = "pro",    name = "职业联赛", minAge = 21, maxAge = 33, teamPrefix = "职业队",   teamStrength = 86, bg = "bg/bg_pro.jpg" },
    { id = "legend", name = "传奇殿堂", minAge = 34, maxAge = 99, teamPrefix = "名人堂",   teamStrength = 90, bg = "bg/bg_pro.jpg" },
}

-- ---------------------------------------------------------------------------
-- 生涯节奏
-- ---------------------------------------------------------------------------
Config.CAREER = {
    -- 每几个赛季长 1 岁。1 = 每赛季一岁（15 岁开局 → 约 20 赛季打到传奇殿堂）
    seasonsPerYear = 1,
    -- 强制退役年龄（到达后自动进入退役结算）
    retireAge      = 38,
    -- 士气对训练收益的乘算下限（士气 0 时训练打几折）
    lowMoraleMul   = 0.75,
    -- 低于该士气视为"低落"，开始吃惩罚
    lowMoraleLine  = 30,
}

-- ---------------------------------------------------------------------------
-- 每周可执行的行动
-- ---------------------------------------------------------------------------
---@class ActionDef
---@field id string
---@field name string
---@field desc string

---@type ActionDef[]
Config.ACTIONS = {
    { id = "train_scoring",    name = "加练投篮", desc = "提升【得分】" },
    { id = "train_playmaking", name = "组织训练", desc = "提升【组织】" },
    { id = "train_defense",    name = "防守特训", desc = "提升【防守】" },
    { id = "train_athletic",   name = "体能拉练", desc = "提升【体能】" },
    { id = "train_iq",         name = "录像分析", desc = "提升【意识】，几乎不耗体能" },
    { id = "rest",             name = "休息恢复", desc = "大幅恢复体能，平复士气" },
    { id = "media",            name = "商业活动", desc = "提升人气与收入" },
}

-- 体能消耗（rest 为负 = 恢复）
Config.ACTION_COST = {
    train_scoring = 18, train_playmaking = 18, train_defense = 18,
    train_athletic = 24, train_iq = 6, rest = -34, media = 14,
}

-- 属性收益基础值
Config.ACTION_GAIN = {
    train_scoring    = { scoring = 3 },
    train_playmaking = { playmaking = 3 },
    train_defense    = { defense = 3 },
    train_athletic   = { athletic = 3 },
    train_iq         = { iq = 2 },
    rest             = {},
    media            = {},
}

-- ---------------------------------------------------------------------------
-- 训练馆（独立操作玩法）
-- 训练馆的属性收益必须和「每周一次的行动」一样付出体能代价，
-- 否则体力见底后仍能无限重开玩法刷属性，一周就能把能力堆满。
-- ---------------------------------------------------------------------------
Config.TRAINING = {
    -- 进入一次玩法的体能门槛（低于此值无法开练）
    minStamina = 10,
    -- 各玩法的体能消耗
    costShot    = 12,   -- 投篮训练：10 球
    costDribble = 14,   -- 一对一突破：8 回合
    costDefend  = 14,   -- 防守读心：8 回合
}

-- ---------------------------------------------------------------------------
-- 初始状态
-- ---------------------------------------------------------------------------
Config.INIT = {
    age = 15,
    stamina = 100,
    morale = 60,
    fame = 0,
    money = 0,
    salary = 0,
}

-- 成长年龄系数：越年轻成长越快，31 岁后开始衰退
Config.GROWTH_BY_AGE = {
    { maxAge = 18, mul = 1.6 },
    { maxAge = 22, mul = 1.3 },
    { maxAge = 26, mul = 1.0 },
    { maxAge = 30, mul = 0.6 },
    { maxAge = 99, mul = 0.25 },
}

-- ---------------------------------------------------------------------------
-- 赛季结构
-- ---------------------------------------------------------------------------
Config.SEASON = {
    weeksPerSeason = 12,      -- 每赛季周数
    gamesPerSeason = 8,       -- 每赛季比赛数
    eventChance = 0.6,        -- 每周触发剧情事件的概率
    gameStaminaCost = 26,     -- 每场比赛消耗体能
}

-- ---------------------------------------------------------------------------
-- 星途出身（建角时的第一层选择）
-- 「天选之星」通过玩家主动观看激励视频解锁；其他出身正常免费选择。
-- ---------------------------------------------------------------------------
---@class OriginDef
---@field id string
---@field name string
---@field tagline string
---@field desc string
---@field attrs table<string, number?>  稀疏表：只写有加成的项
---@field init table<string, number?>|nil  初始资源 { morale, fame, money }

---@type OriginDef[]
Config.ORIGINS = {
    {
        id = "street", name = "街球浪人",
        tagline = "野球场上打出来的手感",
        desc = "没人教过你，全靠一次次被打败又站起来。",
        attrs = { athletic = 4, scoring = 2 },
        init = { morale = 10, fame = 20 },
    },
    {
        id = "academy", name = "体校科班",
        tagline = "十年系统训练打底",
        desc = "基本功扎实，战术板上的东西你看一遍就懂。",
        attrs = { iq = 4, defense = 2, playmaking = 2 },
        init = { morale = 4 },
    },
    {
        id = "legacy", name = "名门之后",
        tagline = "父辈的名字刻在球馆墙上",
        desc = "资源从不缺，可你得证明自己不只是一个姓氏。",
        attrs = { iq = 2, playmaking = 2 },
        init = { money = 60, fame = 120 },
    },
    {
        id = "chosen", name = "天选之星",
        tagline = "聚光灯下长大的孩子",
        desc = "全国直播看着你长大。天赋是入场券，也是枷锁——打得不好，嘘声比谁都响。",
        -- 属性加成仅 8 点（低于街球浪人的 6 点 × 2 项总量对比是高的，但真正价值在 perk）
        -- 设计意图：高人气起手 + 人气自增长 + 代言门槛减半 = 前期经济起飞；
        --          代价是士气 -15，而士气现在会真实影响投篮绿区与队友手感（高风险高回报）
        attrs = { scoring = 4, athletic = 4 },
        init = { fame = 300, morale = -15 },
        perk = {
            id = "chosen_star",
            name = "自带流量",
            desc = "每周 +6 人气 · 代言门槛减半 · 代言收入 +25%",
            weeklyFame = 6,
            endorseGateMul = 0.5,
            endorsePayMul = 1.25,
        },
    },
}

-- ---------------------------------------------------------------------------
-- 天赋卡（建角时的第二层选择：每次抽 6 张，选 3 张）
-- 卡片效果 = 属性加成 + 少量初始资源；数值全部集中在此，方便后期调参
-- ---------------------------------------------------------------------------
---@class TalentDef
---@field id string
---@field name string
---@field rarity string   "legend" | "silver" | "bronze"
---@field desc string
---@field attrs table<string, number?>|nil
---@field init table<string, number?>|nil

---@type TalentDef[]
Config.TALENTS = {
    -- 传奇（金）
    { id = "chosen_one",  name = "天选之子", rarity = "legend", desc = "全属性 +3",            attrs = { scoring = 3, playmaking = 3, defense = 3, athletic = 3, iq = 3 } },
    { id = "scoring_god", name = "得分机器", rarity = "legend", desc = "得分 +8",              attrs = { scoring = 8 } },
    { id = "prodigy",     name = "百年一遇", rarity = "legend", desc = "全属性 +2 · 人气 +150", attrs = { scoring = 2, playmaking = 2, defense = 2, athletic = 2, iq = 2 }, init = { fame = 150 } },
    -- 精英（银）
    { id = "clutch_heart", name = "决胜之心", rarity = "silver", desc = "全属性 +1 · 士气 +8",  attrs = { scoring = 1, playmaking = 1, defense = 1, athletic = 1, iq = 1 }, init = { morale = 8 } },
    { id = "rain_three",   name = "三分雨",   rarity = "silver", desc = "得分 +4",             attrs = { scoring = 4 } },
    { id = "iron_gate",    name = "铁闸",     rarity = "silver", desc = "防守 +4",             attrs = { defense = 4 } },
    { id = "floor_coach",  name = "场上教练", rarity = "silver", desc = "组织 +3 · 意识 +3",   attrs = { playmaking = 3, iq = 3 } },
    { id = "spring_legs",  name = "弹簧腿",   rarity = "silver", desc = "体能 +4",             attrs = { athletic = 4 } },
    -- 基础（铜）
    { id = "putback",      name = "冲抢补篮", rarity = "bronze", desc = "得分 +2",   attrs = { scoring = 2 } },
    { id = "quick_hand",   name = "快手切球", rarity = "bronze", desc = "防守 +2",   attrs = { defense = 2 } },
    { id = "steady_ball",  name = "稳定运球", rarity = "bronze", desc = "组织 +2",   attrs = { playmaking = 2 } },
    { id = "stamina_tank", name = "耐力储备", rarity = "bronze", desc = "体能 +2",   attrs = { athletic = 2 } },
    { id = "video_notes",  name = "录像笔记", rarity = "bronze", desc = "意识 +2",   attrs = { iq = 2 } },
    { id = "gym_rat",      name = "训练狂",   rarity = "bronze", desc = "属性 +1 · 经验 +200", attrs = { scoring = 1, defense = 1 }, init = { exp = 200 } },
}

--- 抽卡与选卡规则
Config.TALENT = {
    drawCount      = 6,   -- 每次抽几张
    pickCount      = 3,   -- 普通报告最终带走几张
    adLegendCount  = 2,   -- 看广告重拟报告时保底传奇张数
}

--- 稀有度展示色（描边/标签用）
---@type table<string, RGBAColor>
Config.TALENT_RARITY_COLOR = {
    legend = { 232, 168, 32, 255 },    -- 金
    silver = { 150, 158, 172, 255 },   -- 银
    bronze = { 186, 124, 74, 255 },    -- 铜
}

--- 稀有度显示名
---@type table<string, string>
Config.TALENT_RARITY_NAME = {
    legend = "传奇",
    silver = "精英",
    bronze = "基础",
}

-- 抽卡稀有度权重（普通刷新用；广告刷新会额外保底传奇）
Config.TALENT_WEIGHT = {
    legend = 8,
    silver = 30,
    bronze = 62,
}

-- ---------------------------------------------------------------------------
-- 可选资源奖励需完整观看广告；比赛与周训练仍可直接进行。
-- ---------------------------------------------------------------------------
Config.AD_REWARDS = {
    talentRerollSeason = 1,    -- 每次建角重拟报告次数
    welfareSeason     = 12,    -- 每赛季领取球队补给上限（每周一次，需观看广告）
    boostSeason       = 4,     -- 球队恢复室快速恢复次数
    boostStamina      = 30,    -- 单次快速恢复体力
    doubleRewardSeason = 6,    -- 训练馆额外复制本次正向奖励
    reviewSeason      = 4,     -- 赛后教练复盘次数
    pressSeason       = 4,     -- 经纪人放料次数
    lotterySeason     = 3,     -- 商业推广次数（对齐「每季 3 次」口径：中奖是巨额收入，次数越少越像运气）
    actionDoubleSeason = 4,    -- 周行动加练次数
    -- 潜力突破：每季 3 次、单次 +5 上限。落到瓶颈时才有按钮，是本作最强的「卡住了」时刻。
    seasonCampSeason  = 3,     -- 每赛季休赛期潜力突破次数（仅尚未达到硬上限时可选）
    tacticSeason      = 1,     -- 解锁高级战术次数
    reviewExp         = 60,
    pressFame         = 100,
    lotteryMoney      = 30,
    seasonCampStep    = 5,
    -- 广告是「捷径」不是「主路」：量级需与原生路径（训练拿经验 → 经验换属性点）保持同一档
    -- 【单次给爽 · 定调】对齐参考作（足球生涯：单次 +5、每季 20 次）的体感——
    -- 把价值压进「单次点击」而不是「能点很多次」：+1×20 次 与 +3×8 次总量接近，
    -- 但前者要连点 20 次才有感觉，后者点第一下就觉得划算，完播与复看都更高。
    attrPoints        = 3,     -- 属性页：每次看完获得多少自由属性点
    -- ⚠️ 平衡红线：「练不如看」是主动选的方向（转化优先），但训练必须仍然有用。
    --    满额 8 × 3 = 24 点 vs 原生 10+ 点（≈70%）。若玩家反馈「练没意义了」，
    --    压次数（4~6 次 → 12~18 点），别动单次的 +3 —— 单次爽感才是转化来源。
    attrPointsSeason  = 8,     -- 属性页：每赛季广告次数上限
    healDaily         = 1,     -- 队医：每天几次
    expPerAttrPoint   = 100,   -- 原生路径：多少经验换 1 点属性
    -- 全神贯注：把「训练会失误、收益打折」这件事一次性买断
    -- 训练本来就有三档收益（手感差时只拿 1 点），且士气/伤病/年龄都会继续打折；
    -- 这个广告的卖点是「接下来几次训练必定拿满档」，是确定性收益，不是再抽一次。
    focusCharges      = 3,     -- 看一次广告获得几次「满分训练」
    focusSeason       = 6,     -- 每赛季可用次数
    -- 赛前体能：回满体力
    staminaDaily      = 1,     -- 每天几次
    staminaGate       = 45,    -- 体力低于此值才会在赛前遇到体能师
    -- 转会市场：定向转会
    pickTeamSeason     = 1,    -- 每赛季可用次数（与原生问价同口径，避免广告完全替代抽签）
    -- 失利重赛：唯一能直接改写比赛结果的点位，必须严控。
    -- 3 次/赛季 ≈ 每 10~15 场才用得起一次，玩家会留给真正的关键战（季后赛、宿敌、争冠），
    -- 而不是「输了就重开」把整个赛季的难度抹平。
    retrySeason        = 3,    -- 每赛季「看广告重打本场」次数
}

-- ---------------------------------------------------------------------------
-- 经济系统（钱必须有出口，否则财务页就只是一块广告板）
-- ---------------------------------------------------------------------------
Config.ECONOMY = {
    moneyPerAttrPoint = 80,    -- 自费特训：花多少钱直接买 1 点属性点（万）
    endorseFameGate   = 300,   -- 赛季末人气达到多少，才会有人来谈代言
    welfareExp        = 60,    -- 球队福利（每周看广告领一次）：经验
    welfareMorale     = 5,     -- 球队福利（每周看广告领一次）：士气

    -- 代言分档：人气越高，能签的牌子越大、每赛季进账越多。
    -- 此前代言只有「有 / 无」两态，人气超过 300 后再涨完全不产生收益，
    -- 导致「经纪人放料」等一切加人气的途径在中后期全部失效（点了白点）。
    -- 现在人气是持续收益曲线：每 400 人气解锁更高一档品牌。
    endorseTiers = {
        { fame = 300,   brands = { "运动饮料", "健身器材" },              payBase = 24  },
        { fame = 700,   brands = { "球鞋品牌", "功能饮料" },              payBase = 70  },
        { fame = 1400,  brands = { "腕表", "手机" },                      payBase = 180 },
        { fame = 2600,  brands = { "汽车", "航空公司" },                  payBase = 420 },
        { fame = 4500,  brands = { "全球运动品牌", "奢侈品" },            payBase = 900 },
    },
    endorsePayPerFame = 0.06,  -- 代言年薪 = 档位基准 + 人气 × 该系数（人气持续放大收益）
}

-- ---------------------------------------------------------------------------
-- 转会市场
-- 球队档次真实影响玩法：比赛里的球队强度（队友水平）+ 年薪倍率
-- ---------------------------------------------------------------------------
Config.TRANSFER = {
    offersPerSeason = 3,       -- 原生「问价」次数（每赛季，免费）
    offersPerRoll   = 3,       -- 每次问价经纪人带回几份报价
    tier2MinOverall = 55,      -- 中游球队的加盟门槛（综合评分）
    tier3MinOverall = 70,      -- 豪门球队的加盟门槛（综合评分）
    -- 下标即档次：球队强度修正
    tierBonus = { -10, 2, 12 },
    -- 下标即档次：年薪倍率
    tierSalaryMul = { 0.85, 1.15, 1.5 },
}

-- ---------------------------------------------------------------------------
-- 比赛参数（回合制操作比赛）
-- ---------------------------------------------------------------------------
Config.MATCH = {
    quarters = 4,
    -- 每节玩家操作的回合数（4 节 × 4 回合 = 16 个操作回合/场）
    roundsPerQuarter = 4,
    -- 队友每回合背景得分区间（玩家操作之外的得分）
    myBaseMin = 1,
    myBaseMax = 4,
    -- 对手每回合背景得分区间
    oppBaseMin = 1,
    oppBaseMax = 4,
}

-- ---------------------------------------------------------------------------
-- 跳过比赛（快速模拟）
--
-- 跳过完全复用文字直播的平衡公式（MatchText.skipWholeMatch），不做第二套模拟，
-- 所以跳过与亲手打的结果量级天然一致 —— 它省的是时间，不是难度。
-- 门槛设计成「每日免费 5 次，用完后看一次广告 +15 次」：
-- 免费额度覆盖「这周不想打这场」的偶发需求；高频跳过才需要看广告。
-- 额度按【现实日期】滚动（玩家一天最多免费跳 5 场），不是游戏内周次。
-- ---------------------------------------------------------------------------
Config.SKIP_MATCH = {
    freePerDay = 5,      -- 每天免费跳过次数（现实日期滚动）
    adBonus    = 15,     -- 看完一次广告追加的跳过次数
    -- 个人能力加成：把玩家能力换算成「每场净胜分贡献」，直接调整推演总分。
    --
    -- 为什么需要它：文字直播的推演只看球队实力，玩家的个人能力完全不参与
    -- （操作模式里个人得分能占全队 30~50%，是胜负的关键）。若跳过直接复用这套
    -- 公式，实测新秀胜率只有 5~8%，而操作模式随机打也有 25% —— 跳过会变成
    -- 「省了时间但基本必输」，没人会用。
    --
    -- 定标（同一新秀、80 场/档）：0→8%、5→40%、8→61%、12→89%。
    -- 取 8：新秀跳过约 60%，高于乱打、低于熟练操作。玩家想赢仍值得亲手打，
    -- 但跳过不是惩罚 —— 这是「省时间」与「保留手感价值」的平衡点。
    playerCarry = 8,
}

-- ---------------------------------------------------------------------------
-- 动漫手绘风配色
-- 暖橙主色 + 深靛蓝底 + 米白文字，粗描边、高饱和
-- ---------------------------------------------------------------------------
---@class GameColors
---@field primary RGBAColor
---@field primaryLight RGBAColor
---@field primaryDark RGBAColor
---@field accent RGBAColor
---@field secondary RGBAColor
---@field danger RGBAColor
---@field success RGBAColor
---@field bgDeep RGBAColor
---@field bgPanel RGBAColor
---@field bgCard RGBAColor
---@field bgCardLight RGBAColor
---@field cream RGBAColor
---@field textMain RGBAColor
---@field textSub RGBAColor
---@field textDark RGBAColor
---@field outline RGBAColor
---@field outlineSoft RGBAColor

---@type GameColors
Config.COLORS = {
    -- 主色系：热血橙红
    primary      = { 255, 77, 46, 255 },
    primaryLight = { 255, 124, 94, 255 },
    primaryDark  = { 198, 46, 24, 255 },
    accent       = { 255, 206, 61, 255 },   -- 高光黄
    secondary    = { 42, 122, 200, 255 },   -- 天空蓝
    danger       = { 214, 48, 42, 255 },
    success      = { 62, 168, 88, 255 },

    -- 背景层：米黄纸底（亮底，与暗色卡片风完全相反）
    bgDeep       = { 244, 236, 218, 255 },  -- 纸底
    bgPanel      = { 255, 252, 244, 255 },  -- 面板
    bgCard       = { 255, 255, 255, 255 },  -- 卡片纯白
    bgCardLight  = { 255, 244, 224, 255 },  -- 卡片高亮
    cream        = { 255, 255, 255, 255 },

    -- 文字：墨黑（深字）
    textMain     = { 26, 22, 20, 255 },
    textSub      = { 96, 86, 76, 255 },
    textDark     = { 26, 22, 20, 255 },

    -- 描边：漫画墨线
    outline      = { 26, 22, 20, 255 },
    outlineSoft  = { 150, 138, 122, 255 },
}

-- 属性对应的主题色（用于进度条）
---@class AttrColors
---@field scoring RGBAColor
---@field playmaking RGBAColor
---@field defense RGBAColor
---@field athletic RGBAColor
---@field iq RGBAColor

---@type AttrColors
Config.ATTR_COLORS = {
    scoring    = { 245, 138, 46, 255 },
    playmaking = { 84, 148, 240, 255 },
    defense    = { 156, 122, 236, 255 },
    athletic   = { 96, 200, 140, 255 },
    iq         = { 84, 200, 216, 255 },
}

-- ---------------------------------------------------------------------------
-- 资源路径
-- ---------------------------------------------------------------------------
Config.ART = {
    -- 背景统一用 JPEG（1080x1920，单张 250~580KB，比原 PNG 省约 60% 体积）
    bgMenu         = "bg/bg_menu.jpg",
    bgLocker       = "bg/bg_locker.jpg",
    bgTraining     = "bg/bg_training.jpg",
    bgStreet       = "bg/bg_street.jpg",
    bgPro          = "bg/bg_pro.jpg",
    -- 高中 / 大学阶段专属背景（LifeStory 早已引用，此前 Config.ART 漏定义导致取到 nil）
    bgHighschool   = "bg/bg_highschool.jpg",
    bgCollege      = "bg/bg_college.jpg",
    -- 功能页专属背景（此前 5 个页面共用 bgLocker，视觉上无法区分系统）
    bgTrainingRoom = "bg/bg_training_room.jpg",
    bgOffice       = "bg/bg_office.jpg",
    bgFinanceRoom  = "bg/bg_finance_room.jpg",
    bgWelfareRoom  = "bg/bg_welfare_room.jpg",
    bgTacticsRoom  = "bg/bg_tactics_room.jpg",
    -- 比赛专用背景（此前复用阶段场景图，与"比赛"语义不符）
    bgMatch        = "bg/bg_match.jpg",
    -- 扩充场景（补齐此前缺失的语义场景：盛典/媒体/夜训/私人/康复）
    bgAllstarArena = "bg/bg_allstar_arena.jpg",
    bgPressRoom    = "bg/bg_press_room.jpg",
    bgNightCourt   = "bg/bg_night_court.jpg",
    bgApartment    = "bg/bg_apartment.jpg",
    bgRehabRoom    = "bg/bg_rehab_room.jpg",
    logo       = "icon/logo_badge.png",
    avatar     = "icon/avatar_player.png",
    evShot     = "ev/ev_shot.png",
    evDunk     = "ev/ev_dunk.png",
    evBlock    = "ev/ev_block.png",
    evSteal    = "ev/ev_steal.png",
    evPress    = "ev/ev_press.png",
    evInjury   = "ev/ev_injury.png",
    evTrophy   = "ev/ev_trophy.png",
    evTraining = "ev/ev_training.png",
    evFans     = "ev/ev_fans.png",
    -- 扩充插图
    evRival          = "ev/ev_rival.png",
    evDraft          = "ev/ev_draft.png",
    evChampionParade = "ev/ev_champion_parade.png",
    evHallOfFame     = "ev/ev_hall_of_fame.png",
    evContract       = "ev/ev_contract.png",
}

Config.SFX = {
    click    = "audio/sfx/sfx_click.mp3",
    swish    = "audio/sfx/sfx_swish.mp3",
    rim      = "audio/sfx/sfx_rim.mp3",
    dunk     = "audio/sfx/sfx_dunk.mp3",
    block    = "audio/sfx/sfx_block.mp3",
    whistle  = "audio/sfx/sfx_whistle.mp3",
    cheer    = "audio/sfx/sfx_cheer.mp3",
    levelup  = "audio/sfx/sfx_levelup.mp3",
    injury   = "audio/sfx/sfx_injury.mp3",
    win      = "audio/sfx/sfx_win.mp3",
    dribble  = "audio/sfx/sfx_dribble.mp3",
    sneaker  = "audio/sfx/sfx_sneaker.mp3",
    -- 扩充音效
    crowdRoar     = "audio/sfx/sfx_crowd_roar.mp3",     -- 全场爆发欢呼
    buzzer        = "audio/sfx/sfx_buzzer.mp3",         -- 终场蜂鸣
    netSwish      = "audio/sfx/sfx_net_swish.mp3",      -- 刷网
    mvpChant      = "audio/sfx/sfx_mvp_chant.mp3",      -- MVP 呼声
    cameraBurst   = "audio/sfx/sfx_camera_burst.mp3",   -- 快门连拍
    moneyCoin     = "audio/sfx/sfx_money_coin.mp3",     -- 金币入账
    cardFlip      = "audio/sfx/sfx_card_flip.mp3",      -- 翻牌
    powerup       = "audio/sfx/sfx_powerup.mp3",        -- 能力突破
    booCrowd      = "audio/sfx/sfx_boo_crowd.mp3",      -- 客场嘘声
    sneakerSqueak = "audio/sfx/sfx_sneaker_squeak.mp3", -- 急停摩擦
    heartbeat     = "audio/sfx/sfx_heartbeat_tense.mp3",-- 关键时刻心跳
    fanfare       = "audio/sfx/sfx_trophy_fanfare.mp3", -- 夺冠号角
}

Config.BGM = {
    daily  = "audio/bgm/bgm_daily.ogg",
    battle = "audio/bgm/bgm_battle.ogg",
    -- 情绪分层：此前 9 个场景共用 daily，情绪曲线完全平坦
    menu   = "audio/bgm/bgm_menu.ogg",     -- 主菜单主题
    create = "audio/bgm/bgm_create.ogg",   -- 建角/抽卡
    result = "audio/bgm/bgm_result.ogg",   -- 赛季结算/夺冠/退役
    sad    = "audio/bgm/bgm_sad.ogg",      -- 伤病/低谷
}

-- 存档文件名
Config.SAVE_FILE = "basketball_career_save.json"
-- 写入用的临时文件（写完再原子替换到 SAVE_FILE，避免中途崩溃留下半截存档）
Config.SAVE_TMP_FILE = Config.SAVE_FILE .. ".tmp"
-- 上一次成功存档的备份（原子替换前轮换，供读档兜底）
Config.SAVE_BAK_FILE = Config.SAVE_FILE .. ".bak"

return Config
