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
