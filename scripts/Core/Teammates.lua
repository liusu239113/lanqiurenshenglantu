-- ============================================================================
-- Teammates — 队友与阵容系统（《篮途》核心玩法模块）
--
-- 设计意图：
--   在此之前，队友只是 myTeamPower 里的一个背景数字：赢了不知道是谁帮的忙，
--   输了也找不到具体的人。这个模块要让队友变成「可见、可经营、会影响胜负」的对象：
--     · 每个阶段、每支球队有一套具名队友（3-4 人），有名有姓、有位置、有评分、有性格
--     · 化学反应（chemistry）把「我们配合得好不好」量化成 0-100 的曲线，
--       并直接以 teamPowerBonus 的形式加进比赛的 myTeamPower
--     · 羁绊（bond）是玩家与单个队友的私人关系，靠每周「加练/交流」经营；
--       高羁绊队友会给球队实力一份实打实的加成
--     · 阵容随赛季成长/衰退/退役/换血，让一支球队有流动感
--
-- 与比赛层的关系（本模块不改动 Match / MatchText，只提供接入点）：
--   ① 比赛强度：算完 myTeamPower 之后叠加
--        myTeamPower = myTeamPower + Teammates.teamPowerBonus(state)
--   ② 赛后：Teammates.onMatch(state, win, myPoints, myAssists)
--      （myAssists 可为 nil；操作模式没有逐次助攻统计时，传 math.floor(myPoints / 4)
--        即可与 Career 里现有的助攻折算口径保持一致）
--   ③ 每周推进：Teammates.onWeek(state)
--   ④ 赛季末：Teammates.onSeasonEnd(state) → string[]
--
--   所有入口都是幂等 + 自愈的：即使某个入口没接上，ensure 也会在下次进入阵容界面时补做。
-- ============================================================================

local Config = require("Core.Config")
local Career = require("Core.Career")

local Teammates = {}

-- ============================================================================
-- 数值常量（设计来源集中在此，方便后续调参）
-- ============================================================================

-- 化学反应
local CHEM_INIT       = 55    -- 新阵容的初始化学反应（基准线）
local CHEM_DRIFT_TO   = 60    -- 每周自然回归的目标值（"自然消解"）
local CHEM_DRIFT_STEP = 1     -- 每周回归步长
local CHEM_MAX        = 100
local CHEM_LOW_LINE   = 50    -- 低于此值触发"独狼拖后腿"等负面机制

-- teamPowerBonus（球队实力加成）
local CHEM_ANCHOR     = 55    -- 化学反应基准线：55 时这一项为 0
local CHEM_SLOPE      = 0.12  -- 每 1 点化学反应折算的球队实力
local HIGH_BOND       = 70    -- 视为「高羁绊」的门槛
local HIGH_BOND_BONUS = 1.2   -- 每位高羁绊队友的固定加成
local TRAIT_POWER_CAP = 4     -- 全队 trait 固定加成的截断上下限（防止极端叠加）
local BONUS_MIN       = -9    -- 总加成下限
local BONUS_MAX       = 12    -- 总加成上限

-- 评分与羁绊
local RATING_MIN, RATING_MAX = 40, 95
local BOND_MIN, BOND_MAX = 0, 100
local ROSTER_MIN, ROSTER_MAX = 3, 4

-- 互动
local INTERACT_COST   = 12    -- 一次「加练/交流」的体能消耗（约等于半次训练）
local INTERACT_MORALE = 2     -- 互动带来的士气小回复
local BOND_DECAY_LINE = 40    -- 羁绊高于此值才会每周衰减 1（低频玩家不会被反噬）

-- 各阶段队友评分区间（与需求一一对应）
---@type table<string, number[]>
local STAGE_RATING = {
    street = { 40, 52 },
    high   = { 48, 62 },
    ncaa   = { 58, 72 },
    pro    = { 65, 88 },
    legend = { 70, 90 },
}

-- 各阶段队友年龄区间（决定成长/衰退曲线）
---@type table<string, number[]>
local STAGE_AGE = {
    street = { 15, 18 },
    high   = { 16, 19 },
    ncaa   = { 19, 23 },
    -- 职业/传奇阶段的上限压在 34/36：不生成"下赛季必退役"的队友，
    -- 让玩家刚建立的羁绊至少能兑现一两个赛季
    pro    = { 20, 34 },
    legend = { 22, 36 },
}

-- 注：一次互动的体能消耗、高羁绊门槛等数值通过 Teammates.interactCost / bondMilestone
--     对外暴露，避免界面与核心各写一份数值。

-- ============================================================================
-- 数据结构
-- ============================================================================

--- 一名队友（随存档一起序列化）
---@class Teammate
---@field id string              唯一 id（赛季 + 序号，跨赛季不会撞）
---@field name string            原创中文名
---@field pos string             场上位置 id（保证不与玩家位置重复）
---@field rating number          个人评分 40-95
---@field bond number            与玩家的羁绊 0-100
---@field traitId string         性格/特长 id
---@field traitName string       性格显示名（界面标签）
---@field traitDesc string       性格机制说明（一句话）
---@field bio string             人物介绍（一句话，写出画面感）
---@field age number             年龄（赛季成长/衰退/退役判定）
---@field joinedSeason number    加入球队的赛季
---@field seasonsWithTeam number 在队赛季数

--- 阵容数据（存在 state.roster，随存档序列化）
---@class RosterState
---@field list Teammate[]              队友数组（3-4 人）
---@field chemistry number             化学反应 0-100
---@field season number                阵容数据所属赛季（幂等键）
---@field team string                  阵容所属球队（换队时整队重生成）
---@field stage string                 生成时的生涯阶段 id（换阶段整队重生成）
---@field weekUsed table<string, string> 队友 id -> 上次互动时的周标识 "season-week"
---                                    （懒重置：与当前周标识不同即视为"本周还能互动"）

--- 加成拆解（teamPowerBonus 的构成，界面展示用）
---@class RosterBonus
---@field chemistry number  化学反应项
---@field bond number       高羁绊队友项
---@field trait number      性格固定加成项
---@field total number       三项合计（已截断）
---@field highBond number   高羁绊队友人数

-- ============================================================================
-- 基础工具
-- ============================================================================

--- 限定数值范围
---@param v number
---@param lo number
---@param hi number
---@return number
local function clamp(v, lo, hi)
    if v < lo then return lo end
    if v > hi then return hi end
    return v
end

--- 保留 1 位小数（避免浮点毛刺直接显示到界面上）
---@param v number
---@return number
local function round1(v)
    return math.floor(v * 10 + 0.5) / 10
end

--- 取当前生涯阶段（传入的 state 不是全局生涯时走本地兜底）
---@param state CareerState
---@return StageDef
local function stageOf(state)
    if Career.state == state then
        return Career.getStage()
    end
    return Career.getStageDef(state.stageIndex or 1)
end

--- 本阶段的队友评分区间（返回整数，供 math.random 使用）
---@param state CareerState
---@return integer, integer
local function ratingRange(state)
    -- 显式兜底：表按 key 取值在类型上是可空的，这里钉死成整数
    local range = STAGE_RATING[stageOf(state).id] --[[@as number[]|nil]]
    if range then
        local lo = math.floor(range[1] or 48)
        local hi = math.floor(range[2] or 62)
        return lo, hi
    end
    return 48, 62
end

--- 阵容视图（nil 安全；所有 state.roster 的访问都必须经过这里）
---@param state CareerState|nil
---@return RosterState|nil
local function rosterOf(state)
    if not state then return nil end
    local r = state.roster --[[@as RosterState|nil]]
    if type(r) ~= "table" then return nil end
    if type(r.list) ~= "table" then return nil end
    return r
end

--- 写生涯大事记（只有传入的 state 就是当前生涯时才写，避免写错对象）
---@param state CareerState
---@param text string
local function logLine(state, text)
    if Career.state == state then
        Career.addLog(text)
    end
end

--- 消耗体能（走 Career 入口，让徽章的体能上限生效）
---@param state CareerState
---@param amount number
local function spendStamina(state, amount)
    if Career.state == state then
        Career.addStamina(-amount)
    else
        state.stamina = clamp((state.stamina or 0) - amount, 0, 100)
    end
end

--- 增加士气（走 Career 入口，让徽章的士气上限生效）
---@param state CareerState
---@param amount number
local function gainMorale(state, amount)
    if Career.state == state then
        Career.addMorale(amount)
    else
        state.morale = clamp((state.morale or 50) + amount, 0, 100)
    end
end

--- 本周的周标识（懒重置用；与广告日配额同一套口径）
---@param state CareerState
---@return string
local function weekKey(state)
    return string.format("%d-%d", state.season or 1, state.week or 1)
end

--- 按 id 找队友
---@param r RosterState
---@param id string
---@return Teammate|nil
local function findById(r, id)
    if type(id) ~= "string" or id == "" then return nil end
    for i = 1, #r.list do
        if r.list[i].id == id then return r.list[i] end
    end
    return nil
end

-- ============================================================================
-- 性格 / 特长（trait）
--
-- 每种性格都有真实机制效果，落在三个地方：
--   · teamPowerBonus：powerBonus（固定加成）
--   · 化学反应变化率：chemWin / chemLoss / chemDrift / chemFloor / assistChem / lowChemPenalty
--   · 羁绊与赛季推进：bondBias / bondGainMul / bondDecay / growthBias / declineBias / departRisk
-- ============================================================================

---@class TraitDef
---@field id string              性格 id
---@field name string            性格显示名（界面标签）
---@field desc string            一句话机制说明
---@field ratingBias number      生成/成长时的评分偏移
---@field bondBias number        初始羁绊偏移
---@field powerBonus number      直接计入 teamPowerBonus 的固定加成
---@field chemWin number         赢球时化学反应追加
---@field chemLoss number        输球时化学反应追加（负数）
---@field chemDrift number       每周向基准回归的额外步长
---@field chemFloor number       化学反应下限抬升量（更衣室领袖）
---@field bondGainMul number     羁绊增长倍率（<1 = 涨得慢）
---@field bondDecay number       全队羁绊每周衰减修正（-1 = 抵消衰减）
---@field assistChem number      每场 5+ 助攻时追加的化学反应
---@field lowChemPenalty number  化学反应 < 50 时的追加惩罚（独狼）
---@field growthBias number      赛季成长偏移（评分上升时）
---@field declineBias number     赛季衰退偏移（正数 = 衰退更慢）
---@field departRisk number      赛季末离队概率加成

---@type TraitDef[]
local TRAITS = {
    {
        id = "leader", name = "更衣室领袖",
        desc = "化学反应下限抬升 12 点，全队每周自然回归 +1，队友羁绊不再自然衰减",
        ratingBias = 2, bondBias = 8, powerBonus = 0.5,
        chemWin = 0, chemLoss = 1, chemDrift = 1, chemFloor = 12,
        bondGainMul = 1.0, bondDecay = -1, assistChem = 0, lowChemPenalty = 0,
        growthBias = 0, declineBias = 0, departRisk = -0.05,
    },
    {
        id = "silent_shooter", name = "沉默射手",
        desc = "评分天生更高，但羁绊涨得比谁都快不了——他不太需要朋友",
        ratingBias = 6, bondBias = -6, powerBonus = 0,
        chemWin = 0, chemLoss = 0, chemDrift = 0, chemFloor = 0,
        bondGainMul = 0.6, bondDecay = 0, assistChem = 0, lowChemPenalty = 0,
        growthBias = 1, declineBias = 0, departRisk = 0,
    },
    {
        id = "hothead", name = "刺头",
        desc = "赢球时化学反应涨得更猛，输球时也散得更快",
        ratingBias = 3, bondBias = -5, powerBonus = 0,
        chemWin = 2, chemLoss = -2, chemDrift = 0, chemFloor = 0,
        bondGainMul = 1.0, bondDecay = 0, assistChem = 0, lowChemPenalty = 0,
        growthBias = 0, declineBias = 0, departRisk = 0.05,
    },
    {
        id = "veteran", name = "老兵",
        desc = "衰退速度减半，进队就自带一份信任；他在，年轻人就不敢偷懒",
        ratingBias = 2, bondBias = 12, powerBonus = 0.5,
        chemWin = 0, chemLoss = 0, chemDrift = 1, chemFloor = 0,
        bondGainMul = 1.0, bondDecay = 0, assistChem = 0, lowChemPenalty = 0,
        growthBias = 0, declineBias = 2, departRisk = -0.05,
    },
    {
        id = "glass", name = "玻璃人",
        desc = "天赋够好，可赛季末的衰退来得又快又狠，也更容易被交易走",
        ratingBias = 4, bondBias = 0, powerBonus = 0,
        chemWin = 0, chemLoss = 0, chemDrift = 0, chemFloor = 0,
        bondGainMul = 1.1, bondDecay = 0, assistChem = 0, lowChemPenalty = 0,
        growthBias = 1, declineBias = -2, departRisk = 0.15,
    },
    {
        id = "rookie", name = "新秀",
        desc = "起点低、每年都在涨，是最值得长期投资的那种队友",
        ratingBias = -5, bondBias = 6, powerBonus = 0,
        chemWin = 0, chemLoss = 0, chemDrift = 0, chemFloor = 0,
        bondGainMul = 1.2, bondDecay = 0, assistChem = 0, lowChemPenalty = 0,
        growthBias = 2, declineBias = 0, departRisk = 0,
    },
    {
        id = "defender", name = "防守悍将",
        desc = "不管进攻打成什么样，他都能把对面的箭头人物磨掉一层皮（球队实力 +2.5）",
        ratingBias = 1, bondBias = 0, powerBonus = 2.5,
        chemWin = 0, chemLoss = 0, chemDrift = 0, chemFloor = 0,
        bondGainMul = 0.9, bondDecay = 0, assistChem = 0, lowChemPenalty = 0,
        growthBias = 0, declineBias = 0, departRisk = 0,
    },
    {
        id = "floor_general", name = "组织核心",
        desc = "球队实力 +1；他在场时，你的助攻能额外换来化学反应",
        ratingBias = 2, bondBias = 4, powerBonus = 1,
        chemWin = 0, chemLoss = 0, chemDrift = 0, chemFloor = 0,
        bondGainMul = 1.0, bondDecay = 0, assistChem = 1, lowChemPenalty = 0,
        growthBias = 1, declineBias = 0, departRisk = 0,
    },
    {
        id = "lone_wolf", name = "独狼",
        desc = "个人能力突出（评分 +4），但化学反应一旦跌破 50 就会额外拖后腿",
        ratingBias = 4, bondBias = -8, powerBonus = -1,
        chemWin = 0, chemLoss = 0, chemDrift = 0, chemFloor = 0,
        bondGainMul = 0.8, bondDecay = 0, assistChem = 0, lowChemPenalty = -1.5,
        growthBias = 1, declineBias = 0, departRisk = 0.05,
    },
    {
        id = "joker", name = "开心果",
        desc = "更衣室里最吵的那个，化学反应每周自然回升更快，输球也不容易散",
        ratingBias = -2, bondBias = 8, powerBonus = 0,
        chemWin = 0, chemLoss = 1, chemDrift = 2, chemFloor = 0,
        bondGainMul = 1.2, bondDecay = 0, assistChem = 0, lowChemPenalty = 0,
        growthBias = 0, declineBias = 0, departRisk = 0,
    },
    {
        id = "clutch", name = "大心脏",
        desc = "第四节敢要球也敢承担，球队实力 +1，赢球时化学反应追加 +1",
        ratingBias = 3, bondBias = 2, powerBonus = 1,
        chemWin = 1, chemLoss = 0, chemDrift = 0, chemFloor = 0,
        bondGainMul = 1.0, bondDecay = 0, assistChem = 0, lowChemPenalty = 0,
        growthBias = 0, declineBias = 0, departRisk = 0,
    },
    {
        id = "peacemaker", name = "和事佬",
        desc = "矛盾到了他这里就化掉了：化学反应下限抬升 5 点，输球时少掉 1 点",
        ratingBias = -1, bondBias = 10, powerBonus = 0,
        chemWin = 0, chemLoss = 1, chemDrift = 1, chemFloor = 5,
        bondGainMul = 1.1, bondDecay = 0, assistChem = 0, lowChemPenalty = 0,
        growthBias = 0, declineBias = 1, departRisk = -0.05,
    },
}

---@type table<string, TraitDef>
local TRAIT_BY_ID = {}
for i = 1, #TRAITS do
    TRAIT_BY_ID[TRAITS[i].id] = TRAITS[i]
end

--- 兜底性格：旧存档里的 traitId 认不出来时用它，保证界面不会出现空字段
---@type TraitDef
local NEUTRAL_TRAIT = {
    id = "role_player", name = "角色球员",
    desc = "没有特别的性格标签，训练和比赛都按部就班",
    ratingBias = 0, bondBias = 0, powerBonus = 0,
    chemWin = 0, chemLoss = 0, chemDrift = 0, chemFloor = 0,
    bondGainMul = 1.0, bondDecay = 0, assistChem = 0, lowChemPenalty = 0,
    growthBias = 0, declineBias = 0, departRisk = 0,
}

--- 取性格定义（永不返回 nil，调用方无需判空）
---@param traitId string|nil
---@return TraitDef
local function traitOf(traitId)
    if type(traitId) == "string" then
        local t = TRAIT_BY_ID[traitId] --[[@as TraitDef|nil]]
        if t then return t end
    end
    return NEUTRAL_TRAIT
end

-- ============================================================================
-- 队友角色池（原创中文名 + 一句话人物介绍）
-- posPool 为空表示任何位置都能安排；给了 posPool 的，人物介绍与位置绑定
-- ============================================================================

---@class PersonaDef
---@field name string           姓名
---@field traitId string        性格 id（与人物介绍互相呼应）
---@field bio string            一句话人物介绍
---@field posPool string[]|nil  可接受的位置（nil = 不限）

---@type PersonaDef[]
local PERSONAS = {
    {
        name = "韩青野", traitId = "leader",
        bio = "训练馆的灯永远是他最后关的。谁状态不好，第二天更衣柜上就会多一瓶他放的水。",
    },
    {
        name = "池砚舟", traitId = "silent_shooter",
        bio = "赢球不笑，输球不吼。他把所有情绪都塞进了每天清晨那五百个投篮里。",
    },
    {
        name = "傅野", traitId = "hothead",
        bio = "队内对抗赛能跟队友吵到教练摔战术板，可第二天他又是第一个到球馆的人。",
    },
    {
        name = "邵鹤鸣", traitId = "veteran",
        bio = "三十三岁，膝盖里留着两块钢板。他跑不动了，却知道对面每个战术的第一传会去哪。",
    },
    {
        name = "商锦", traitId = "glass",
        bio = "天赋好得让人眼红，也脆得让人心疼。队医见他进治疗室，会先叹一口气。",
    },
    {
        name = "岑一白", traitId = "rookie",
        bio = "第一次进职业球馆时在门口站了半分钟，他说他在记地板的样子。",
    },
    {
        name = "铁骊", traitId = "defender", posPool = { "PF", "C", "SF" },
        bio = "对位过他的人都说，那四十八分钟里，你连呼吸都要先问过他。",
    },
    {
        name = "谢知遥", traitId = "floor_general", posPool = { "PG", "SG" },
        bio = "他记得每个队友在哪块地板上最舒服。传球比说话多，说话比抱怨多。",
    },
    {
        name = "罗盛", traitId = "lone_wolf", posPool = { "SG", "SF" },
        bio = "单打效率联盟前十，可教练每次画战术都得先问他愿不愿意跑。",
    },
    {
        name = "温小满", traitId = "joker",
        bio = "更衣室里的活宝，能把一场二十连败讲成段子。没人知道他私下加练到几点。",
    },
    {
        name = "江雪原", traitId = "clutch", posPool = { "PG", "SG", "SF" },
        bio = "最后两分钟他的心跳据说比平时还慢。球到他手里，替补席会全体站起来。",
    },
    {
        name = "鲁大川", traitId = "peacemaker",
        bio = "队里吵起来，他往中间一站，两边就都说不出话了。",
    },
    {
        name = "顾长庚", traitId = "veteran", posPool = { "PF", "C" },
        bio = "在这个联盟打了十一年，换过六支球队，行李永远只带一个箱子。",
    },
    {
        name = "苏晚舟", traitId = "silent_shooter", posPool = { "PG", "SG" },
        bio = "话少到记者都懒得采访他，可他的投篮热区图漂亮得像一张海报。",
    },
    {
        name = "岳昆仑", traitId = "defender", posPool = { "PF", "C" },
        bio = "进联盟时只会防守，三年后还是只会防守，但已经没人敢在他面前上篮。",
    },
    {
        name = "米乐", traitId = "rookie", posPool = { "PG", "SG" },
        bio = "选秀夜掉到第二轮最后一位，他把那条落选的弹幕截图设成了手机壁纸。",
    },
    {
        name = "段千帆", traitId = "leader", posPool = { "SF", "PF" },
        bio = "球队连败那阵子，是他把所有人拉进录像室，一帧一帧看到凌晨三点。",
    },
    {
        name = "裴照", traitId = "clutch", posPool = { "SG", "SF" },
        bio = "训练里平平无奇，一到第四节就像换了个人。教练说这叫天生的比赛球员。",
    },
    {
        name = "何汀", traitId = "joker", posPool = { "PG", "SG" },
        bio = "赛前热身一定要放同一首歌，谁换了顺序他都要重来一遍。",
    },
    {
        name = "邢铁山", traitId = "lone_wolf", posPool = { "PF", "C" },
        bio = "背身单打是他唯一信的战术。他从不解释，也从不道歉。",
    },
    {
        name = "沐云开", traitId = "floor_general", posPool = { "PG", "SF" },
        bio = "队友跑出空位的那一瞬间，球已经在他手上了——他好像提前两秒就看见了。",
    },
    {
        name = "燕小北", traitId = "hothead", posPool = { "SF", "PF" },
        bio = "被吹犯规会盯着裁判看三秒，可下一回合他又会把自己整个人扔进人堆里抢球。",
    },
}

--- 性格池里每个 trait 至少要有人，避免生成时 trait 重复导致挑不到人
---@param persona PersonaDef
---@param pos string
---@return boolean
local function personaAccepts(persona, pos)
    local pool = persona.posPool
    if not pool then return true end
    for i = 1, #pool do
        if pool[i] == pos then return true end
    end
    return false
end

-- ============================================================================
-- 队友生成
-- ============================================================================

--- 生成一名队友
---@param state CareerState
---@param pos string
---@param persona PersonaDef
---@param index number
---@param opts table|nil { rookie = boolean }  rookie = 新入队的新人（低评分、低年龄）
---@return Teammate
local function makeTeammate(state, pos, persona, index, opts)
    local o = opts or {}
    local lo, hi = ratingRange(state)
    local t = traitOf(persona.traitId)

    -- 评分：阶段区间内随机 + 性格偏移（仍截断在阶段区间内，保证强度曲线可控）
    ---@type number
    local rating
    if o.rookie then
        rating = lo + math.random(0, 6)
    else
        rating = math.random(lo, hi)
    end
    rating = clamp(rating + t.ratingBias, lo, hi)

    -- 年龄：按阶段给区间；新秀一律取区间下沿（整数，供 math.random 使用）
    ---@type integer
    local ageLo = 20
    ---@type integer
    local ageHi = 30
    local ageRange = STAGE_AGE[stageOf(state).id] --[[@as number[]|nil]]
    if ageRange then
        ageLo = math.floor(ageRange[1] or ageLo)
        ageHi = math.floor(ageRange[2] or ageHi)
    end
    local age = o.rookie and ageLo or math.random(ageLo, ageHi)

    -- 初始羁绊：随机 + 性格偏移（老兵 / 和事佬自带信任，独狼 / 刺头难接近）
    local bond = clamp(math.random(20, 38) + t.bondBias, 10, 70)

    local season = state.season or 1
    ---@type Teammate
    local tm = {
        -- 加一段随机后缀：保证同一赛季内多次补人也不会撞 id
        id = string.format("tm%d_s%d_%d", index, season, math.random(0, 9999)),
        name = persona.name,
        pos = pos,
        rating = rating,
        bond = bond,
        traitId = t.id,
        traitName = t.name,
        traitDesc = t.desc,
        bio = persona.bio,
        age = age,
        joinedSeason = season,
        seasonsWithTeam = 0,
    }

    print(string.format("[Teammates] 生成队友 %s | %s | 评分 %d | 年龄 %d | 羁绊 %d | 性格 %s",
        tm.name, tm.pos, tm.rating, tm.age, tm.bond, tm.traitName))
    return tm
end

--- 挑一个还没用过、且能打这个位置的 persona 下标
---@param used table<number, boolean>
---@param usedTraits table<string, boolean>
---@param pos string
---@return number|nil
local function pickPersonaIndex(used, usedTraits, pos)
    -- 第一轮：位置匹配 + 性格不重复（让 3-4 人的性格尽量分散）
    for i = 1, #PERSONAS do
        local p = PERSONAS[i]
        if not used[i] and personaAccepts(p, pos) and not usedTraits[p.traitId] then
            return i
        end
    end
    -- 第二轮：只要求位置匹配
    for i = 1, #PERSONAS do
        if not used[i] and personaAccepts(PERSONAS[i], pos) then
            return i
        end
    end
    -- 第三轮：位置偏好让位，随便给一个没用过的
    for i = 1, #PERSONAS do
        if not used[i] then return i end
    end
    return nil
end

--- 生成整套阵容（首次进入 / 换队 / 换阶段）
---@param state CareerState
---@return RosterState
local function generate(state)
    local stage = stageOf(state)
    -- 街头阶段打的是三对三，人少一个更贴合场景；其余阶段满编 4 人
    local size = (stage.id == "street") and 3 or ROSTER_MAX

    -- 位置：从玩家的四个非本行位置里抽，保证不与玩家位置重复
    ---@type string[]
    local pool = {}
    for i = 1, #Config.POSITIONS do
        local def = Config.POSITIONS[i]
        if def.id ~= state.positionId then
            pool[#pool + 1] = def.id
        end
    end
    for i = #pool, 2, -1 do
        local j = math.random(1, i)
        pool[i], pool[j] = pool[j], pool[i]
    end
    if #pool > size then
        -- 截断到需要的数量（池子已洗牌，取前 size 个即为随机组合）
        local trimmed = {}
        for i = 1, size do trimmed[i] = pool[i] end
        pool = trimmed
    end

    ---@type RosterState
    local roster = {
        list = {},
        chemistry = CHEM_INIT,
        season = state.season or 1,
        team = state.team or "",
        stage = stage.id,
        weekUsed = {},
    }

    ---@type table<number, boolean>
    local used = {}
    ---@type table<string, boolean>
    local usedTraits = {}
    for i = 1, #pool do
        local idx = pickPersonaIndex(used, usedTraits, pool[i])
        local persona = idx and PERSONAS[idx] or nil
        if persona and idx then
            used[idx] = true
            usedTraits[persona.traitId] = true
            roster.list[#roster.list + 1] = makeTeammate(state, pool[i], persona, i, nil)
        end
    end

    -- 兜底：角色池异常导致人数不足时，补足到 ROSTER_MIN
    local fallbackPersona = assert(PERSONAS[1])
    while #roster.list < ROSTER_MIN do
        local posDef = Config.POSITIONS[((#roster.list + 1) % #Config.POSITIONS) + 1]
        local pos = posDef and posDef.id or "SF"
        if pos == state.positionId then pos = "SF" end
        roster.list[#roster.list + 1] = makeTeammate(state, pos, fallbackPersona, #roster.list + 1, nil)
    end

    state.roster = roster

    ---@type string[]
    local names = {}
    for i = 1, #roster.list do
        names[#names + 1] = string.format("%s(%s %d)", roster.list[i].name, roster.list[i].pos, roster.list[i].rating)
    end
    logLine(state, string.format("新阵容成型：%s，队友 %d 人。", state.team or "球队", #roster.list))
    print(string.format("[Teammates] 阵容生成完毕：%s | 阶段 %s | %d 人 | %s | 化学反应 %d",
        state.team or "", stage.id, #roster.list, table.concat(names, "、"), roster.chemistry))
    return roster
end

-- ============================================================================
-- 存档兼容
-- ============================================================================

--- 兼容旧存档 / 脏数据：补齐字段、修正非法值
---@param r RosterState
---@return boolean 数据是否可用（false = 需要整队重生成）
local function sanitize(r)
    if type(r.list) ~= "table" then return false end
    if #r.list < ROSTER_MIN or #r.list > ROSTER_MAX then return false end

    r.chemistry = clamp(math.floor(tonumber(r.chemistry) or CHEM_INIT), 0, CHEM_MAX)
    r.season = math.max(1, math.floor(tonumber(r.season) or 1))
    if type(r.team) ~= "string" then r.team = "" end
    if type(r.stage) ~= "string" or r.stage == "" then r.stage = "high" end
    if type(r.weekUsed) ~= "table" then r.weekUsed = {} end

    for i = 1, #r.list do
        local tm = r.list[i]
        if type(tm) ~= "table" then return false end
        if type(tm.id) ~= "string" or tm.id == "" then return false end
        if type(tm.name) ~= "string" or tm.name == "" then tm.name = "替补球员" end
        if type(tm.pos) ~= "string" or tm.pos == "" then tm.pos = "SF" end
        if type(tm.bio) ~= "string" then tm.bio = "" end

        local t = traitOf(tm.traitId)
        tm.traitId = t.id
        tm.traitName = t.name
        tm.traitDesc = t.desc

        tm.rating = clamp(math.floor(tonumber(tm.rating) or 55), RATING_MIN, RATING_MAX)
        tm.bond = clamp(math.floor(tonumber(tm.bond) or 30), BOND_MIN, BOND_MAX)
        tm.age = clamp(math.floor(tonumber(tm.age) or 24), 15, 45)
        tm.joinedSeason = math.max(1, math.floor(tonumber(tm.joinedSeason) or r.season))
        tm.seasonsWithTeam = math.max(0, math.floor(tonumber(tm.seasonsWithTeam) or 0))
    end
    return true
end

-- ============================================================================
-- 化学反应与加成
-- ============================================================================

--- 化学反应下限
--- 基础下限 20：再低就是彻底失控的更衣室，游戏里不该出现，也不该让玩家绝望。
--- 更衣室领袖（+12）与和事佬（+5）会把这条线抬上去，这正是"下限高"的实现方式。
--- 上限压到 55（基准线）：性格只能托底，不能把球队直接顶成正向加成。
---@param r RosterState
---@return number
local function chemFloor(r)
    ---@type number
    local floorBonus = 0
    for i = 1, #r.list do
        floorBonus = floorBonus + traitOf(r.list[i].traitId).chemFloor
    end
    return math.min(55, 20 + floorBonus)
end

--- 写回化学反应
--- 统一在这里取整：性格修正里存在 -1.5 这类小数，如果让小数留在 state 里，
--- 既会让 string.format("%d") 在 Lua 5.4 下报"没有整数表示"，也会让存档出现 53.5 这种脏数据。
---@param r RosterState
---@param value number 期望值（可为小数）
local function setChemistry(r, value)
    local floor = math.floor(chemFloor(r) + 0.5)
    r.chemistry = clamp(math.floor(value + 0.5), floor, CHEM_MAX)
end

--- 队伍里高羁绊队友的数量
---@param r RosterState
---@return number
local function countHighBond(r)
    local n = 0
    for i = 1, #r.list do
        if r.list[i].bond >= HIGH_BOND then n = n + 1 end
    end
    return n
end

-- ============================================================================
-- 对外接口
-- ============================================================================

--- 确保阵容已生成（首次调用创建；换队 / 换阶段整队重生成；新赛季自动推进）
---@param state CareerState
function Teammates.ensure(state)
    if not state then return end

    local r = rosterOf(state)
    if r and not sanitize(r) then
        print("[Teammates] 存档中的阵容数据不可用，重新生成")
        state.roster = nil
        r = nil
    end

    -- 换队 / 换阶段：整队重生成（"球队换了，队友自然也要换"）
    local stage = stageOf(state)
    if r and (r.team ~= (state.team or "") or r.stage ~= stage.id) then
        print(string.format("[Teammates] 球队/阶段变更（%s -> %s | %s -> %s），整队重生成",
            r.team, state.team or "", r.stage, stage.id))
        state.roster = nil
        r = nil
    end

    if not r then
        r = generate(state)
    end

    -- 赛季已经翻页但没有任何入口调用过 onSeasonEnd → 这里兜底推进（幂等）
    if r and r.season ~= (state.season or 1) then
        local msgs = Teammates.onSeasonEnd(state)
        print(string.format("[Teammates] ensure 兜底推进赛季（本赛季未收到 onSeasonEnd），共 %d 条变化", #msgs))
    end
end

--- 取当前队友列表（未生成时返回空表，绝不返回 nil）
--- 注意：返回的是阵容内部的数组引用，调用方只读，不要直接改（改羁绊请走 improveBond / interact）
---@param state CareerState
---@return Teammate[]
function Teammates.list(state)
    local r = rosterOf(state)
    if not r then return {} end
    return r.list
end

--- 球队化学反应（0-100）
---@param state CareerState
---@return number
function Teammates.chemistry(state)
    local r = rosterOf(state)
    if not r then return CHEM_INIT end
    return r.chemistry
end

--- 化学反应档位文案
--- 返回值 1 是档位名（可用作标签），返回值 2 是一句话解读，
--- 解读里带上"此刻给球队实力带来多少加成"，让玩家一眼看懂这条件值多少钱。
---@param state CareerState
---@return string name, string desc
function Teammates.chemistryLabel(state)
    local chem = Teammates.chemistry(state)
    local term = round1((chem - CHEM_ANCHOR) * CHEM_SLOPE)

    local name, line
    if chem >= 90 then
        name = "兄弟连"
        line = "一个眼神就知道彼此要去哪，替补席会为场上的每一次轮转站起来。"
    elseif chem >= 75 then
        name = "默契之师"
        line = "球在手上不用抬头，也知道队友会出现在哪。"
    elseif chem >= 60 then
        name = "渐入佳境"
        line = "该传的球传得出去，该背的锅有人一起背。"
    elseif chem >= 45 then
        name = "磨合期"
        line = "配合打得出来，但还差一点火候，传球总是慢半拍。"
    elseif chem >= 30 then
        name = "各打各的"
        line = "战术跑得像打卡，谁都不想为谁多跑一步。"
    else
        name = "貌合神离"
        line = "更衣室里没人说话，传球都带着犹豫。"
    end

    -- 档位说明必须让玩家看懂"它此刻对球队实力意味着什么"
    local desc = string.format("%s 目前给球队实力带来 %+.1f 的化学反应加成。", line, term)
    return name, desc
end

--- 化学反应档位颜色（界面用；与 chemistryLabel 的档位一一对应）
---@param state CareerState
---@return RGBAColor
function Teammates.chemistryColor(state)
    local chem = Teammates.chemistry(state)
    local C = Config.COLORS
    if chem >= 75 then return C.success end
    if chem >= 60 then return C.secondary end
    if chem >= 45 then return C.accent end
    if chem >= 30 then return C.primary end
    return C.danger
end

--- 单个队友羁绊（0-100；找不到返回 0）
---@param state CareerState
---@param id string
---@return number
function Teammates.bondOf(state, id)
    local r = rosterOf(state)
    if not r then return 0 end
    local tm = findById(r, id)
    if not tm then return 0 end
    return tm.bond
end

--- 加成拆解（teamPowerBonus 的构成，界面展示与调参都用它）
---@param state CareerState
---@return RosterBonus
function Teammates.breakdown(state)
    local r = rosterOf(state)
    if not r then
        return { chemistry = 0, bond = 0, trait = 0, total = 0, highBond = 0 }
    end

    local chemTerm = (r.chemistry - CHEM_ANCHOR) * CHEM_SLOPE
    local highBond = countHighBond(r)
    local bondTerm = highBond * HIGH_BOND_BONUS

    ---@type number
    local traitTerm = 0
    for i = 1, #r.list do
        traitTerm = traitTerm + traitOf(r.list[i].traitId).powerBonus
    end
    traitTerm = clamp(traitTerm, -TRAIT_POWER_CAP, TRAIT_POWER_CAP)

    local total = clamp(chemTerm + bondTerm + traitTerm, BONUS_MIN, BONUS_MAX)

    return {
        chemistry = round1(chemTerm),
        bond = round1(bondTerm),
        trait = round1(traitTerm),
        total = round1(total),
        highBond = highBond,
    }
end

--- 队友给球队实力的加成（加在 myTeamPower 上，返回值可为负数）
--- 构成：化学反应项 (chemistry - 55) * 0.12 + 每位高羁绊队友 +1.2 + 性格固定项
---@param state CareerState
---@return number
function Teammates.teamPowerBonus(state)
    local bonus = Teammates.breakdown(state)
    return round1(bonus.total)
end

--- 二当家（队内评分最高的队友）名字
---@param state CareerState
---@return string
function Teammates.starterName(state)
    local r = rosterOf(state)
    if not r or #r.list == 0 then return "暂无" end

    ---@type Teammate|nil
    local best = nil
    for i = 1, #r.list do
        local tm = r.list[i]
        if tm and (not best or tm.rating > best.rating) then
            best = tm
        end
    end
    if not best then return "暂无" end

    return best.name
end

--- 阵容平均评分（保留 1 位小数）
---@param state CareerState
---@return number
function Teammates.avgRating(state)
    local r = rosterOf(state)
    if not r or #r.list == 0 then return 0 end

    ---@type number
    local sum = 0
    for i = 1, #r.list do
        sum = sum + r.list[i].rating
    end
    return round1(sum / #r.list)
end

-- ============================================================================
-- 赛后更新
-- ============================================================================

--- 赛后更新（胜负、个人得分、助攻）
--- 化学反应：赢 +2~+4，输 -3~-5；独占球权微降，分享球上升；trait 修正变化率
---@param state CareerState
---@param win boolean
---@param myPoints number
---@param myAssists number|nil
function Teammates.onMatch(state, win, myPoints, myAssists)
    if not state then return end
    Teammates.ensure(state)
    local r = rosterOf(state)
    if not r then return end

    local points = math.max(0, math.floor(tonumber(myPoints) or 0))
    local assists = math.max(0, math.floor(tonumber(myAssists) or 0))

    -- 1) 胜负基础值
    ---@type number
    local delta
    if win then
        delta = math.random(2, 4)
    else
        delta = -math.random(3, 5)
    end
    local base = delta

    -- 2) 全队性格修正（刺头放大波动、开心果和事佬减小波动、组织核心放大助攻收益）
    ---@type number
    local winBonus = 0
    ---@type number
    local lossBonus = 0
    ---@type number
    local assistBonus = 0
    ---@type number
    local lowPenalty = 0
    for i = 1, #r.list do
        local t = traitOf(r.list[i].traitId)
        winBonus = winBonus + t.chemWin
        lossBonus = lossBonus + t.chemLoss
        assistBonus = assistBonus + t.assistChem
        lowPenalty = lowPenalty + t.lowChemPenalty
    end
    delta = delta + (win and winBonus or lossBonus)
    local traitDelta = delta - base

    -- 3) "独"的代价 / 团队篮球的回报
    -- 队友得分 = 全队得分 - 个人得分（来自上一场战报；缺失时跳过这一段）
    ---@type number|nil
    local teamPoints = nil
    local last = state.lastResult --[[@as table|nil]]
    if type(last) == "table" then
        local v = last.teamPoints
        if type(v) == "number" then teamPoints = v end
    end

    local hog = false
    if teamPoints and teamPoints > 0 then
        local others = math.max(0, teamPoints - points)
        if points >= 18 and points > others * 1.35 then
            delta = delta - 1          -- 球权过度集中，队友变成了看客
            hog = true
        elseif others >= points + 10 then
            delta = delta + 1          -- 队友手感被喂出来了，球队打得更整体
        end
    end

    -- 4) 助攻：分享球直接换化学反应
    if assists >= 5 then
        local add = 1 + assistBonus
        if assists >= 9 then add = add + 1 end
        delta = delta + add
    end

    -- 5) 化学反应已经很低时，独狼性格会额外拖后腿
    if r.chemistry < CHEM_LOW_LINE then
        delta = delta + lowPenalty
    end

    local before = r.chemistry
    setChemistry(r, r.chemistry + delta)

    -- 6) 羁绊：赢球且分享球 → 关系升温；输球且独占球权 → 关系降温
    local bondDelta = 0
    if win and assists >= 5 then
        bondDelta = 1
    elseif (not win) and hog then
        bondDelta = -1
    end
    if bondDelta ~= 0 then
        for i = 1, #r.list do
            local tm = r.list[i]
            tm.bond = clamp(tm.bond + bondDelta, BOND_MIN, BOND_MAX)
        end
    end

    print(string.format(
        "[Teammates] 赛后更新：%s | 个人 %d 分 %d 助攻 | 化学反应 %d -> %d（胜负 %+d，性格 %+d，合计 %+d）| 全队羁绊 %+d",
        win and "胜" or "负", points, assists, before, r.chemistry,
        base, traitDelta, r.chemistry - before, bondDelta))
end

-- ============================================================================
-- 每周自然变化
-- ============================================================================

--- 每周自然变化（化学反应向基准回归、羁绊衰减）
---@param state CareerState
function Teammates.onWeek(state)
    if not state then return end
    Teammates.ensure(state)
    local r = rosterOf(state)
    if not r then return end

    -- 1) 化学反应：向 CHEM_DRIFT_TO 回归（自然消解），性格可以加快回归
    ---@type number
    local driftBonus = 0
    for i = 1, #r.list do
        driftBonus = driftBonus + traitOf(r.list[i].traitId).chemDrift
    end
    local step = CHEM_DRIFT_STEP + math.min(2, driftBonus)

    local before = r.chemistry
    if r.chemistry > CHEM_DRIFT_TO then
        r.chemistry = clamp(math.floor(r.chemistry - step + 0.5), CHEM_DRIFT_TO, CHEM_MAX)
    elseif r.chemistry < CHEM_DRIFT_TO then
        setChemistry(r, math.min(r.chemistry + step, CHEM_DRIFT_TO))
    end

    -- 2) 羁绊衰减：高羁绊需要维护，超过阈值后每周 -1（更衣室领袖可全队抵消）
    ---@type number
    local decay = 1
    for i = 1, #r.list do
        decay = decay + traitOf(r.list[i].traitId).bondDecay
    end
    if decay < 0 then decay = 0 end

    ---@type string[]
    local decayed = {}
    if decay > 0 then
        for i = 1, #r.list do
            local tm = r.list[i]
            if tm.bond > BOND_DECAY_LINE then
                tm.bond = clamp(tm.bond - decay, BOND_DECAY_LINE, BOND_MAX)
                decayed[#decayed + 1] = tm.name
            end
        end
    end

    -- 3) 清理过期的互动记录
    --    判定本身是"懒"的（比较 season-week 即可），这里顺手把旧周次的记录删掉，
    --    避免跨赛季时 weekUsed 里的 id 越积越多。
    --    注意只删过期项：正在进行的这一周记录必须保留，否则同一周可以反复交流。
    local key = weekKey(state)
    for i = 1, #r.list do
        local tm = r.list[i]
        if r.weekUsed[tm.id] ~= nil and r.weekUsed[tm.id] ~= key then
            r.weekUsed[tm.id] = nil
        end
    end

    print(string.format("[Teammates] 每周变化：化学反应 %d -> %d | 羁绊衰减 %d 人%s",
        before, r.chemistry, #decayed, #decayed > 0 and ("（" .. table.concat(decayed, "、") .. "）") or ""))
end

-- ============================================================================
-- 赛季末推进
-- ============================================================================

--- 赛季末推进（队友成长/衰退/退役/新人加入），返回提示文案数组
--- 幂等：同一赛季只推进一次（幂等键 = roster.season）
---@param state CareerState
---@return string[]
function Teammates.onSeasonEnd(state)
    ---@type string[]
    local out = {}
    if not state then return out end

    local r = rosterOf(state)
    if not r then
        Teammates.ensure(state)
        r = rosterOf(state)
        if not r then return out end
    end

    local season = state.season or 1
    if r.season == season then
        return out   -- 本赛季已经推进过（onSeasonEnd 与 ensure 共用这一个幂等键）
    end
    r.season = season

    local stage = stageOf(state)
    local isPro = (stage.id == "pro" or stage.id == "legend")
    local lo, hi = ratingRange(state)

    -- 1) 逐人成长 / 衰退，并判定退役与离队
    ---@type Teammate[]
    local kept = {}
    local leftNames = {}
    local grewNames = {}
    local fellNames = {}

    for i = 1, #r.list do
        local tm = r.list[i]
        local t = traitOf(tm.traitId)

        tm.age = tm.age + 1
        tm.seasonsWithTeam = tm.seasonsWithTeam + 1

        -- 成长曲线：22 岁前涨得快，28 岁后开始下滑，32 岁后明显衰退
        local delta
        if tm.age <= 22 then
            delta = math.random(2, 4)
        elseif tm.age <= 27 then
            delta = math.random(0, 2)
        elseif tm.age <= 31 then
            delta = math.random(-1, 0)
        else
            delta = math.random(-4, -2)
        end
        -- 性格修正：新秀涨得更多，老兵衰退更慢，玻璃人垮得更快
        if delta >= 0 then
            delta = delta + t.growthBias
        else
            delta = delta + t.declineBias
        end

        local oldRating = tm.rating
        tm.rating = clamp(tm.rating + delta, RATING_MIN, RATING_MAX)
        local real = tm.rating - oldRating

        -- 退役：只在职业/传奇阶段发生（学校阶段是"毕业"，由换阶段整队重生成处理）
        local retire = false
        if isPro then
            if tm.age >= 37 then
                retire = true
            elseif tm.age >= 34 and tm.rating < 70 then
                retire = math.random() < 0.6
            elseif tm.age >= 32 and math.random() < 0.15 then
                retire = true
            end
        end

        -- 离队：学校阶段偶尔转学/退队，职业阶段是交易与自由市场
        local departChance = isPro and 0.12 or 0.05
        local depart = (not retire) and (math.random() < (departChance + t.departRisk))

        if retire then
            leftNames[#leftNames + 1] = tm.name
            out[#out + 1] = string.format(
                "%s 宣布退役，%d 岁，把最后一场球留在了这个赛季。",
                tm.name, tm.age)
        elseif depart then
            leftNames[#leftNames + 1] = tm.name
            if isPro then
                out[#out + 1] = string.format("%s 在休赛期转投他队，更衣柜上只剩一个姓名牌。", tm.name)
            else
                out[#out + 1] = string.format("%s 离开了球队，临走前把训练服叠得整整齐齐。", tm.name)
            end
        else
            kept[#kept + 1] = tm
            tm.bond = clamp(tm.bond + 2, BOND_MIN, BOND_MAX)   -- 又一起打了一年，关系更近一点
            if real >= 3 then
                grewNames[#grewNames + 1] = string.format("%s +%d", tm.name, real)
            elseif real <= -3 then
                fellNames[#fellNames + 1] = string.format("%s %d", tm.name, real)
            end
        end
    end
    r.list = kept

    -- 2) 补人：掉到 3 人以下必补；否则有概率补一名新秀（阵容流动感）
    local needNew = (#r.list < ROSTER_MIN) or math.random() < 0.35
    if needNew and #r.list < ROSTER_MAX then
        -- 位置同样避开玩家
        ---@type string[]
        local posPool = {}
        for i = 1, #Config.POSITIONS do
            local def = Config.POSITIONS[i]
            if def.id ~= state.positionId then
                local taken = false
                for j = 1, #r.list do
                    if r.list[j].pos == def.id then taken = true end
                end
                if not taken then posPool[#posPool + 1] = def.id end
            end
        end
        -- 兜底：极端情况下（位置被占满）也要给一个合法位置，不能让 math.random 收到空区间
        local pos = "SF"
        if #posPool > 0 then
            pos = posPool[math.random(1, #posPool)] or "SF"
        end

        -- 新人优先挑"新秀"性格，让成长线能接上
        ---@type number|nil
        local rookieIdx = nil
        ---@type number|nil
        local anyIdx = nil
        for i = 1, #PERSONAS do
            local used = false
            for j = 1, #r.list do
                if r.list[j].name == PERSONAS[i].name then used = true end
            end
            if not used and personaAccepts(PERSONAS[i], pos) then
                if PERSONAS[i].traitId == "rookie" and not rookieIdx then
                    rookieIdx = i
                end
                if not anyIdx then anyIdx = i end
            end
        end
        local idx = rookieIdx or anyIdx
        local persona = idx and PERSONAS[idx] or nil
        if persona then
            local nt = makeTeammate(state, pos, persona, #r.list + 1, { rookie = true })
            nt.rating = clamp(lo + math.random(0, 8), lo, hi)
            r.list[#r.list + 1] = nt
            out[#out + 1] = string.format(
                "新面孔：%s（%s，评分 %d，%s）加入球队，第一次训练就被安排加练折返跑。",
                nt.name, Career.getPositionDef(nt.pos).short, nt.rating, nt.traitName)
        end
    end

    -- 3) 超编裁人（保留羁绊最高的那批）
    while #r.list > ROSTER_MAX do
        local worst = 1
        local worstBond = r.list[1] and r.list[1].bond or 0
        for i = 2, #r.list do
            local tm = r.list[i]
            if tm and tm.bond < worstBond then
                worst = i
                worstBond = tm.bond
            end
        end
        local gone = table.remove(r.list, worst) --[[@as Teammate|nil]]
        if gone then
            out[#out + 1] = string.format("%s 被球队送走，你甚至没来得及和他好好道别。", gone.name)
        end
    end

    -- 4) 化学反应结算：换血要付磨合成本，稳定则沉淀默契
    if #leftNames > 0 or needNew then
        if #leftNames > 0 then
            setChemistry(r, r.chemistry - 3)   -- 有人走了，默契要重新攒
        end
        if needNew then
            setChemistry(r, r.chemistry - 2)   -- 新人进队，磨合成本
        end
    else
        setChemistry(r, r.chemistry + 1)       -- 原班人马，默契沉淀
    end

    -- 5) 新赛季：清掉上一赛季的互动记录（本周刚交流过的要保留，否则同一周能重复交流）
    local keepKey = weekKey(state)
    ---@type table<string, string>
    local freshUsed = {}
    for i = 1, #r.list do
        local id = r.list[i].id
        if r.weekUsed[id] == keepKey then
            freshUsed[id] = keepKey
        end
    end
    r.weekUsed = freshUsed

    -- 6) 汇总进大事记（即使调用方漏了返回值，玩家也能在生涯记录里看到变化）
    if #grewNames > 0 then
        out[#out + 1] = "休赛期进步明显：" .. table.concat(grewNames, "、") .. "。"
    end
    if #fellNames > 0 then
        out[#out + 1] = "状态下滑：" .. table.concat(fellNames, "、") .. "，他们自己比谁都清楚。"
    end
    if #out > 0 then
        for i = 1, #out do
            logLine(state, out[i])
        end
    end

    print(string.format("[Teammates] 赛季推进：第 %d 赛季 | %d 人留队 | 离队 %d 人 | 化学反应 %d | 二当家 %s",
        season, #r.list, #leftNames, r.chemistry, Teammates.starterName(state)))

    return out
end

-- ============================================================================
-- 羁绊互动
-- ============================================================================

--- 提升某个队友的羁绊（事件/互动用）
---@param state CareerState
---@param id string
---@param delta number
---@return string 提示文案
function Teammates.improveBond(state, id, delta)
    if not state then return "" end
    Teammates.ensure(state)
    local r = rosterOf(state)
    if not r then return "球队还没有阵容" end

    local tm = findById(r, id)
    if not tm then return "没有找到这名队友" end

    local amount = math.floor(tonumber(delta) or 0)
    -- 沉默射手 / 独狼这类性格，正向羁绊增长会打折
    if amount > 0 then
        local mul = traitOf(tm.traitId).bondGainMul
        amount = math.max(1, math.floor(amount * mul + 0.5))
    end

    local before = tm.bond
    tm.bond = clamp(tm.bond + amount, BOND_MIN, BOND_MAX)
    local real = tm.bond - before

    local msg = string.format("与 %s 的羁绊 %+d（现 %d）", tm.name, real, tm.bond)
    print(string.format("[Teammates] 羁绊变化：%s %d -> %d（%+d，%s）",
        tm.name, before, tm.bond, real, tm.traitName))
    return msg
end

--- 队友是否有可互动（本周未互动过）
---@param state CareerState
---@param id string
---@return boolean
function Teammates.canInteract(state, id)
    local r = rosterOf(state)
    if not r then return false end
    local tm = findById(r, id)
    if not tm then return false end
    return r.weekUsed[tm.id] ~= weekKey(state)
end

--- 与队友互动（每周行动可选，消耗体能换羁绊）
---@param state CareerState
---@param id string
---@return boolean, string
function Teammates.interact(state, id)
    if not state then return false, "没有生涯数据" end
    Teammates.ensure(state)
    local r = rosterOf(state)
    if not r then return false, "球队还没有阵容" end

    local tm = findById(r, id)
    if not tm then return false, "没有找到这名队友" end

    if not Teammates.canInteract(state, id) then
        return false, string.format("本周已经和 %s 交流过了，让他先回去休息", tm.name)
    end

    local stamina = state.stamina or 0
    if stamina < INTERACT_COST then
        return false, string.format("体能不足：和 %s 加练需要 %d 点体能，你现在只有 %d",
            tm.name, INTERACT_COST, math.floor(stamina))
    end

    -- 1) 消耗体能，换一次共同训练的时间
    spendStamina(state, INTERACT_COST)
    gainMorale(state, INTERACT_MORALE)

    -- 2) 羁绊增长（受性格倍率影响）
    local t = traitOf(tm.traitId)
    local gain = math.floor(math.random(6, 9) * t.bondGainMul + 0.5)
    if gain < 1 then gain = 1 end
    local bondBefore = tm.bond
    tm.bond = clamp(tm.bond + gain, BOND_MIN, BOND_MAX)
    local realGain = tm.bond - bondBefore

    -- 3) 一起训练也是磨合，化学反应 +1
    local chemBefore = r.chemistry
    setChemistry(r, r.chemistry + 1)

    -- 4) 记账：本周这个人已经交流过了（懒重置，key = "赛季-周"）
    r.weekUsed[tm.id] = weekKey(state)

    local msg = string.format("和 %s 加练到球馆关灯：羁绊 +%d（现 %d），化学反应 +%d",
        tm.name, realGain, tm.bond, r.chemistry - chemBefore)
    print(string.format(
        "[Teammates] 互动：%s | 羁绊 %d -> %d | 化学反应 %d -> %d | 体能 -%d | 士气 +%d（%s）",
        tm.name, bondBefore, tm.bond, chemBefore, r.chemistry,
        INTERACT_COST, INTERACT_MORALE, t.name))
    return true, msg
end

--- 羁绊里程碑：羁绊达到门槛的队友会直接给球队实力加成
--- 界面用来显示「羁绊 62 / 70」，避免 UI 与核心各写一份数值
---@return number threshold, number bonus
function Teammates.bondMilestone()
    return HIGH_BOND, HIGH_BOND_BONUS
end

--- 一次「加练/交流」的体能消耗
---@return number
function Teammates.interactCost()
    return INTERACT_COST
end

--- 清空（换队时）
---@param state CareerState
function Teammates.reset(state)
    if not state then return end
    state.roster = nil
    print("[Teammates] 阵容已清空（下次 ensure 时重新生成）")
end

return Teammates
