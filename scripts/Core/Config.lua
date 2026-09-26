-- ============================================================================
-- Config — 《篮途》全局配置、平衡数值与动漫手绘风配色
-- 所有魔法数字集中在此，方便调参
-- ============================================================================

local Config = {}

Config.TITLE = "篮途"
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

---@type StageDef[]
Config.STAGES = {
    { id = "street", name = "街头球场", minAge = 15, maxAge = 17, teamPrefix = "街区联队", teamStrength = 45, bg = "bg/bg_street.png" },
    { id = "high",   name = "高中联赛", minAge = 17, maxAge = 19, teamPrefix = "高中校队", teamStrength = 58, bg = "bg/bg_highschool.png" },
    { id = "ncaa",   name = "大学联赛", minAge = 19, maxAge = 21, teamPrefix = "大学校队", teamStrength = 72, bg = "bg/bg_college.png" },
    { id = "pro",    name = "职业联赛", minAge = 21, maxAge = 34, teamPrefix = "职业队",   teamStrength = 86, bg = "bg/bg_pro.png" },
    { id = "legend", name = "传奇殿堂", minAge = 34, maxAge = 99, teamPrefix = "名人堂",   teamStrength = 90, bg = "bg/bg_pro.png" },
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
-- 每条出身 = 属性倾向 + 初始资源 + 叙事包装
-- adLocked = true 的出身需要看一段广告解锁（一次性，只影响本局）
-- ---------------------------------------------------------------------------
---@class OriginDef
---@field id string
---@field name string
---@field tagline string
---@field desc string
---@field attrs table<string, number?>  稀疏表：只写有加成的项
---@field init table<string, number?>|nil  初始资源 { morale, fame, money }
---@field adLocked boolean
---@field unlockText string|nil

---@type OriginDef[]
Config.ORIGINS = {
    {
        id = "street", name = "街球浪人",
        tagline = "野球场上打出来的手感",
        desc = "没人教过你，全靠一次次被打败又站起来。",
        attrs = { athletic = 4, scoring = 2 },
        init = { morale = 10, fame = 20 },
        adLocked = false,
    },
    {
        id = "academy", name = "体校科班",
        tagline = "十年系统训练打底",
        desc = "基本功扎实，战术板上的东西你看一遍就懂。",
        attrs = { iq = 4, defense = 2, playmaking = 2 },
        init = { morale = 4 },
        adLocked = false,
    },
    {
        id = "legacy", name = "名门之后",
        tagline = "父辈的名字刻在球馆墙上",
        desc = "资源从不缺，可你得证明自己不只是一个姓氏。",
        attrs = { iq = 2, playmaking = 2 },
        init = { money = 60, fame = 120 },
        adLocked = false,
    },
    {
        id = "chosen", name = "天选之星",
        tagline = "聚光灯下长大的孩子",
        desc = "全国直播看着你长大。天赋是入场券，也是枷锁。",
        attrs = { scoring = 5, athletic = 5, defense = 5 },
        init = { fame = 300, morale = -8 },
        adLocked = true,
        unlockText = "观看一段短片，本局即可使用【天选之星】出身。",
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
    pickCount      = 3,   -- 最终带走几张
    freeReroll     = 3,   -- 免费刷新次数
    legendGuarantee = 2,  -- 广告刷新时的传奇保底张数
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
-- 广告奖励参数（集中调参区：改这里就能调整广告产出，不动业务代码）
-- ---------------------------------------------------------------------------
Config.AD_REWARDS = {
    attrPoints        = 3,     -- 属性页：每次看完获得多少自由属性点
    attrPointsSeason  = 20,    -- 属性页：每赛季广告次数上限
    healDaily         = 1,     -- 队医：每天几次
    boostMultiplier   = 1.5,   -- 训练馆：训练收益倍率
    expPerAttrPoint   = 100,   -- 原生路径：多少经验换 1 点属性
    lotteryDaily      = 1,     -- 财务页：彩票每天几次
    lotteryMin        = 80,    -- 彩票最低奖金（万）
    lotteryMax        = 400,   -- 彩票最高奖金（万）
    -- 玩法结算：奖励翻倍
    doubleSeason      = 12,    -- 每赛季可用次数
    -- 赛前体能：回满体力
    staminaDaily      = 1,     -- 每天几次
    staminaGate       = 45,    -- 体力低于此值才会在赛前遇到体能师
    -- 剧情事件：追加曝光
    pressDaily        = 1,     -- 每天几次
    pressFame         = 60,    -- 追加曝光的人气收益
    -- 周行动：本周训练加倍
    actionDoubleSeason = 12,   -- 每赛季可用次数
    actionDoubleMul    = 2.0,  -- 训练收益倍率
    -- 赛后战报：教练复盘（人气再来一份 + 经验）
    reviewExp          = 40,   -- 额外经验
    -- 赛季结算：休赛期特训营（潜力上限突破）
    seasonCampStep     = 3,    -- 突破点数
    -- 球队福利：多领一份
    welfareDaily       = 1,    -- 每天几次
}

-- ---------------------------------------------------------------------------
-- 经济系统（钱必须有出口，否则财务页就只是一块广告板）
-- ---------------------------------------------------------------------------
Config.ECONOMY = {
    moneyPerAttrPoint = 80,    -- 自费特训：花多少钱直接买 1 点属性点（万）
    endorseFameGate   = 300,   -- 赛季末人气达到多少，才会有人来谈代言
    welfareExp        = 60,    -- 球队福利（每周免费一份）：经验
    welfareMorale     = 5,     -- 球队福利（每周免费一份）：士气
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
    bgMenu     = "bg/bg_menu.png",
    bgLocker   = "bg/bg_locker.png",
    bgTraining = "bg/bg_training.png",
    bgStreet   = "bg/bg_street.png",
    bgPro      = "bg/bg_pro.png",
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
}

Config.BGM = {
    daily  = "audio/bgm/bgm_daily.ogg",
    battle = "audio/bgm/bgm_battle.ogg",
}

-- 存档文件名
Config.SAVE_FILE = "basketball_career_save.json"

return Config
