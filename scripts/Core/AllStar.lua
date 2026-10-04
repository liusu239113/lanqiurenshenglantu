-- ============================================================================
-- AllStar — 全明星周末
-- 《篮途》的节日庆典式玩法：三分大赛 + 扣篮大赛 + 颁奖结算
--
-- 设计要点
--   1. 资格：入选过全明星（state.allStars > 0），或第 3 赛季起综合评分与
--      人气双双达标的球员，也会收到联盟的补位邀请函；
--   2. 手感：两个小游戏都沿用 MiniGame 的「时机条」判定
--      （绿区 = 完美 / 黄区 = 命中 / 其余 = 打铁），
--      属性只影响判定窗口的宽容度与动作上限，不改变判定规则本身；
--   3. 结算：两项得分换算成人气 / 士气 / 收入 / 经验，夺冠额外写入 honors。
--
-- 本模块只持有「本赛季这一次全明星周末」的会话状态（three_ / dunk_），
-- 跨赛季的长期记录写在 state.allStar 里（见 AllStarRecord）。
-- ============================================================================

local Career = require("Core.Career")

local AllStar = {}

-- ---------------------------------------------------------------------------
-- 平衡常量（全部集中在此，方便调参）
-- ---------------------------------------------------------------------------

-- 三分大赛：5 个投篮点 × 5 球 = 25 球
AllStar.THREE_POINTS = 5
AllStar.THREE_BALLS_PER_POINT = 5
AllStar.THREE_TOTAL = AllStar.THREE_POINTS * AllStar.THREE_BALLS_PER_POINT   -- 25 球
-- 第 5 个投篮点是彩球点，价值翻倍
AllStar.MONEY_POINT = 5
-- 满分 60：普通球 20 球 × 2 分（空心）+ 彩球 5 球 × 4 分（空心）= 60 分
AllStar.THREE_MAX = 60
-- 40 分以上视为夺冠（约等于七成命中率的顶级手感）
AllStar.THREE_WIN = 40

-- 扣篮大赛：3 次扣篮，每次评委打 0-50 分
AllStar.DUNK_ROUNDS = 3
AllStar.DUNK_MAX_PER_ROUND = 50
AllStar.DUNK_MAX = AllStar.DUNK_ROUNDS * AllStar.DUNK_MAX_PER_ROUND          -- 150
-- 130 分以上视为夺冠（三次平均 43+，需要难度与完成度兼得）
AllStar.DUNK_WIN = 130

-- 全明星周末的参赛人数（排名分母，纯展示用）
AllStar.FIELD_SIZE = 8

-- ---------------------------------------------------------------------------
-- 小工具
-- ---------------------------------------------------------------------------

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

--- 判定区间（0-1 的游标空间）
---@class JudgeZones
---@field greenLo number
---@field greenHi number
---@field yellowLo number
---@field yellowHi number

--- 由中心点与窗口宽度生成判定区间
---@param center number
---@param greenWidth number
---@param yellowWidth number
---@return JudgeZones
local function makeZones(center, greenWidth, yellowWidth)
    return {
        greenLo = center - greenWidth * 0.5,
        greenHi = center + greenWidth * 0.5,
        yellowLo = center - yellowWidth * 0.5,
        yellowHi = center + yellowWidth * 0.5,
    }
end

--- 时机判定：绿区 = 完美，黄区 = 命中，其余 = 打铁
---（与 MiniGame.shoot 完全同一套手感）
---@param pos number 游标位置 0-1
---@param z JudgeZones
---@return string "perfect" | "good" | "miss"
local function judge(pos, z)
    if pos >= z.greenLo and pos <= z.greenHi then return "perfect" end
    if pos >= z.yellowLo and pos <= z.yellowHi then return "good" end
    return "miss"
end

--- 综合评分（优先复用 Career.getOverall，保证与其它系统口径一致）
---@param state CareerState
---@return number
local function overallOf(state)
    if Career.state == state then
        return Career.getOverall()
    end
    -- 传入状态与全局状态不一致的边界情况：退回基础属性均值口径
    return math.floor(Career.attrAverage(state.attrs) + 0.5)
end

-- ---------------------------------------------------------------------------
-- 生涯记录（state.allStar）
-- ---------------------------------------------------------------------------

--- 全明星周末的跨赛季记录
---@class AllStarRecord
---@field season number      最近一次参赛（或标记参加）的赛季
---@field done boolean        本赛季是否已经参加过
---@field appearances number  生涯参加全明星周末的次数
---@field bestThree number    三分大赛历史最高分
---@field bestDunk number     扣篮大赛历史最高分
---@field wonThree boolean    是否拿过三分大赛冠军
---@field wonDunk boolean     是否拿过扣篮大赛冠军

--- 确保生涯里存在全明星记录（旧存档没有该字段）
---@param state CareerState
---@return AllStarRecord
local function ensure(state)
    local rec = state.allStar --[[@as AllStarRecord|nil]]
    if not rec then
        rec = {
            season = 0,
            done = false,
            appearances = 0,
            bestThree = 0,
            bestDunk = 0,
            wonThree = false,
            wonDunk = false,
        }
        local box = rec --[[@as table]]
        state.allStar = box
        print("[AllStar] 生涯首次创建全明星记录")
    end
    -- 旧存档字段补全（一律判空补齐，避免读到 nil）
    if rec.season == nil then rec.season = 0 end
    if rec.done == nil then rec.done = false end
    if rec.appearances == nil then rec.appearances = 0 end
    if rec.bestThree == nil then rec.bestThree = 0 end
    if rec.bestDunk == nil then rec.bestDunk = 0 end
    if rec.wonThree == nil then rec.wonThree = false end
    if rec.wonDunk == nil then rec.wonDunk = false end
    return rec
end

--- 本赛季是否具备全明星资格
--- 两条通道：入选过全明星（allStars > 0），或第 3 赛季起实力与人气同时达标
---@param state CareerState
---@return boolean
function AllStar.qualified(state)
    if not state then return false end

    -- 通道 1：进过全明星阵容的人，联盟年年都会给你留位置
    if (state.allStars or 0) > 0 then return true end

    -- 通道 2：老将补位——至少打到第 3 赛季，人气与综合评分双达标
    if (state.season or 1) < 3 then return false end
    if (state.fame or 0) < 400 then return false end
    return overallOf(state) >= 62
end

--- 本赛季是否还没参加过（用于决定要不要弹出入场）
---@param state CareerState
---@return boolean
function AllStar.shouldOffer(state)
    if not state then return false end
    if not AllStar.qualified(state) then return false end
    local rec = ensure(state)
    -- 同一赛季只提供一次；跨赛季后自动重新开放
    if rec.done and rec.season == (state.season or 1) then
        return false
    end
    return true
end

--- 标记本赛季已参加（同赛季重复调用不会重复计数）
---@param state CareerState
function AllStar.markDone(state)
    if not state then return end
    local rec = ensure(state)
    if rec.done and rec.season == (state.season or 1) then
        return
    end
    rec.done = true
    rec.season = state.season or 1
    rec.appearances = rec.appearances + 1
    print(string.format("[AllStar] 第 %d 赛季全明星周末已参加，生涯第 %d 次",
        rec.season, rec.appearances))
end

-- ============================================================================
-- 玩法 1：三分大赛
-- 5 个投篮点 × 5 球，每球一次时机判定；第 5 个点每球价值翻倍
-- ============================================================================

---@class Shot3State
---@field attrs table<string, number> 比赛用属性
---@field pointIndex number 当前第几个投篮点 1-5
---@field ballIndex number  当前是该点的第几球 1-5
---@field made number       已命中球数
---@field attempts number   已出手球数
---@field score number      当前总分
---@field cursor number     游标位置 0-1
---@field dir number        游标方向
---@field speed number      游标速度（每秒走多少比例）
---@field zones JudgeZones  本球判定区间
---@field window number     本球绿区宽度（判定宽容度）
---@field value number      本球满分价值（普通 2 / 彩球 4）
---@field finished boolean  25 球是否投完
---@field lastResult string|nil 最近一次判定结果

---@type Shot3State|nil
local three_ = nil

--- 开启三分大赛的一个新球（重算判定窗口与游标）
---@param s Shot3State
local function beginThreeBall(s)
    local scoring = s.attrs.scoring or 30
    -- 绿区宽度 0.09 ~ 0.24：得分属性越高，判定越宽容（手感真实成长）
    local greenWidth = 0.09 + (scoring / 100) * 0.15
    -- 彩球点窗口略窄：价值翻倍，风险同步提高
    if s.pointIndex == AllStar.MONEY_POINT then
        greenWidth = greenWidth * 0.92
    end
    local yellowWidth = greenWidth + 0.15

    local center = clamp(0.58 + math.random(-8, 8) / 100, 0.34, 0.80)

    s.zones = makeZones(center, greenWidth, yellowWidth)
    s.window = greenWidth
    s.value = (s.pointIndex == AllStar.MONEY_POINT) and 4 or 2
    -- 摆动速度：0.78 ~ 1.00 / 秒（略慢于比赛里的投篮，观赏性更强）
    s.speed = 0.78 + math.random() * 0.22
    s.cursor = 0
    s.dir = 1
end

--- 开启三分大赛
---@param attrs table<string, number> 比赛用属性（由调用方传 Career.matchAttrs()）
---@return Shot3State
function AllStar.startThree(attrs)
    ---@type Shot3State
    local s = {
        attrs = attrs or {},
        pointIndex = 1,
        ballIndex = 1,
        made = 0,
        attempts = 0,
        score = 0,
        cursor = 0,
        dir = 1,
        speed = 0.8,
        zones = makeZones(0.6, 0.12, 0.27),
        window = 0.12,
        value = 2,
        finished = false,
        lastResult = nil,
    }
    beginThreeBall(s)
    three_ = s
    print(string.format("[AllStar] 三分大赛开始：得分属性 %d，首球绿区宽度 %.3f",
        s.attrs.scoring or 30, s.window))
    return s
end

--- 三分大赛当前球的信息（给界面用）
---@class Shot3Info
---@field pointIndex number 第几个投篮点 1-5
---@field ballIndex number  该点的第几球 1-5
---@field total number       总球数 25
---@field window number      绿区宽度（判定宽容度）
---@field value number       本球满分价值（普通 2 / 彩球 4）
---@field phase string       "shooting" 进行中 | "finished" 已结束
---@field shotIndex number   当前是第几球 1-25
---@field cursor number      游标位置 0-1
---@field speed number       游标速度
---@field greenLo number
---@field greenHi number
---@field yellowLo number
---@field yellowHi number
---@field made number        已命中球数
---@field score number       当前总分
---@field money boolean      是否处于彩球点

--- 三分大赛：当前这一球的信息（给 UI 用；没有会话时返回 nil）
---@return Shot3Info|nil
function AllStar.currentThree()
    local s = three_
    if not s then return nil end

    local shotIndex = s.attempts + 1
    if shotIndex > AllStar.THREE_TOTAL then
        shotIndex = AllStar.THREE_TOTAL
    end

    return {
        -- 规格字段
        pointIndex = s.pointIndex,
        ballIndex = s.ballIndex,
        total = AllStar.THREE_TOTAL,
        window = s.window,
        value = s.value,
        phase = s.finished and "finished" or "shooting",
        -- 扩展字段（供界面绘制时机条与进度）
        shotIndex = shotIndex,
        cursor = s.cursor,
        speed = s.speed,
        greenLo = s.zones.greenLo,
        greenHi = s.zones.greenHi,
        yellowLo = s.zones.yellowLo,
        yellowHi = s.zones.yellowHi,
        made = s.made,
        score = s.score,
        money = (s.pointIndex == AllStar.MONEY_POINT),
    }
end

--- 三分大赛：推进游标（由 UI 每帧调用）
---@param dt number
function AllStar.tickThree(dt)
    local s = three_
    if not s or s.finished then return end
    s.cursor = s.cursor + s.dir * s.speed * dt
    if s.cursor >= 1.0 then
        s.cursor = 1.0
        s.dir = -1
    elseif s.cursor <= 0.0 then
        s.cursor = 0.0
        s.dir = 1
    end
end

--- 三分大赛：当前游标位置（供 UI 每帧取用，避免频繁构造表格）
---@return number|nil
function AllStar.threeCursor()
    local s = three_
    if not s then return nil end
    return s.cursor
end

--- 一次三分出手的结果
---@class Shot3Result
---@field made boolean   是否命中
---@field points number  本次得分（0 / 1 / 2 / 4）
---@field text string    解说文案
---@field result string  "perfect" | "good" | "miss" | "none"
---@field perfect boolean 是否空心入网
---@field money boolean  是否彩球
---@field score number   出手后的累计总分

--- 三分大赛：投出当前这一球
---@param power number 0..1 玩家按下的力度/时机（传 nil 时取当前游标位置）
---@return Shot3Result
function AllStar.shootThree(power)
    local s = three_
    if not s or s.finished then
        return {
            made = false, points = 0, text = "三分大赛已经结束。",
            result = "none", perfect = false, money = false, score = 0,
        }
    end

    local pos = power
    if type(pos) ~= "number" then
        pos = s.cursor
    end
    pos = clamp(pos, 0.0, 1.0)

    local money = (s.pointIndex == AllStar.MONEY_POINT)
    local full = s.value
    local kind = judge(pos, s.zones)

    local made, points, text
    if kind == "perfect" then
        made = true
        points = full
        text = money and string.format("彩球空心入网！+%d 分", points)
            or string.format("空心入网！+%d 分", points)
    elseif kind == "good" then
        made = true
        points = math.floor(full / 2)
        text = money and string.format("彩球打板命中，+%d 分", points)
            or string.format("打板命中，+%d 分", points)
    else
        made = false
        points = 0
        text = money and "彩球弹框而出，可惜！" or "打铁！"
    end

    s.attempts = s.attempts + 1
    if made then s.made = s.made + 1 end
    s.score = s.score + points
    s.lastResult = kind

    -- 推进到下一球（最后一球投完就结束）
    if s.attempts >= AllStar.THREE_TOTAL then
        s.finished = true
        print(string.format("[AllStar] 三分大赛结束：%d 分（命中 %d / %d 球）",
            s.score, s.made, AllStar.THREE_TOTAL))
    else
        s.ballIndex = s.ballIndex + 1
        if s.ballIndex > AllStar.THREE_BALLS_PER_POINT then
            s.ballIndex = 1
            s.pointIndex = s.pointIndex + 1
        end
        beginThreeBall(s)
    end

    return {
        made = made,
        points = points,
        text = text,
        result = kind,
        perfect = (kind == "perfect"),
        money = money,
        score = s.score,
    }
end

--- 三分大赛是否结束（没有会话时返回 false）
---@return boolean
function AllStar.threeFinished()
    return three_ ~= nil and three_.finished
end

--- 三分大赛总分（没有会话时返回 0）
---@return number
function AllStar.threeScore()
    if not three_ then return 0 end
    return three_.score
end

-- ============================================================================
-- 玩法 2：扣篮大赛
-- 3 次扣篮：先选动作（难度越高窗口越窄、基础分越高），再做一次时机判定
-- 评委单次 0-50 分，三次总和 0-150
-- ============================================================================

--- 扣篮动作定义
---@class DunkMoveDef
---@field id string
---@field name string
---@field desc string
---@field difficulty number 难度 1-5（影响摆动速度与窗口）
---@field baseScore number 难度基础分
---@field window number    绿区宽度（越小越难）
---@field reqAthletic number 需要的体能属性（0 = 无门槛）

--- 扣篮动作表：难度越高基础分越高，但判定窗口越窄、摆动越快
---@type DunkMoveDef[]
local DUNK_MOVES = {
    {
        id = "two_hand", name = "双手重扣",
        desc = "最稳的开场动作，用力量把球直接砸进篮筐。",
        difficulty = 1, baseScore = 34, window = 0.24, reqAthletic = 0,
    },
    {
        id = "baseline_reverse", name = "底线反扣",
        desc = "从篮板后方绕出，反手把球按进篮筐。",
        difficulty = 2, baseScore = 36, window = 0.21, reqAthletic = 0,
    },
    {
        id = "tomahawk", name = "战斧劈扣",
        desc = "单臂高举劈下，气势压满整个球馆。",
        difficulty = 3, baseScore = 38, window = 0.18, reqAthletic = 42,
    },
    {
        id = "windmill", name = "空中大风车",
        desc = "起跳后手臂抡满一整圈，再把球砸进。",
        difficulty = 4, baseScore = 40, window = 0.15, reqAthletic = 52,
    },
    {
        id = "eastbay", name = "空中换手",
        desc = "第一只手举球后，在空中换到另一侧终结。",
        difficulty = 4, baseScore = 41, window = 0.15, reqAthletic = 52,
    },
    {
        id = "free_throw_line", name = "罚球线起跳",
        desc = "从罚球线起飞，滑翔到篮下才把球放进。",
        difficulty = 5, baseScore = 42, window = 0.12, reqAthletic = 62,
    },
}

--- 时机条状态（扣篮版）
---@class DunkBar
---@field moveId string
---@field cursor number
---@field dir number
---@field speed number
---@field zones JudgeZones
---@field window number

--- 单次扣篮的结果记录
---@class DunkResult
---@field moveId string
---@field moveName string
---@field points number  本次难度分（含时机加成，不含观赏分）
---@field score number   评委最终得分 0-50（计入总分）
---@field failed boolean 是否失手
---@field result string  "perfect" | "good" | "miss" | "out_of_reach"
---@field text string

---@class DunkState
---@field attrs table<string, number>
---@field round number          当前第几扣 1-3
---@field total number          当前总分
---@field results DunkResult[]  每扣成绩
---@field offers DunkMoveDef[]  本轮 3 个候选动作
---@field pendingMove DunkMoveDef|nil 已选定、等待起跳的动作
---@field bar DunkBar|nil      起跳阶段的时机条
---@field finished boolean

---@type DunkState|nil
local dunk_ = nil

--- 按 id 取扣篮动作
---@param moveId string
---@return DunkMoveDef|nil
local function findDunkMove(moveId)
    for i = 1, #DUNK_MOVES do
        if DUNK_MOVES[i].id == moveId then
            return DUNK_MOVES[i]
        end
    end
    return nil
end

--- 体能允许尝试的动作（体能不够的动作会被锁住）
---@param attrs table<string, number>
---@return DunkMoveDef[]
local function availableMoves(attrs)
    local ath = attrs.athletic or 30
    ---@type DunkMoveDef[]
    local out = {}
    for i = 1, #DUNK_MOVES do
        if ath >= DUNK_MOVES[i].reqAthletic then
            table.insert(out, DUNK_MOVES[i])
        end
    end
    return out
end

--- 抽本轮 3 个候选动作（从体能允许的动作池里随机）
---@param attrs table<string, number>
---@return DunkMoveDef[]
local function rollOffers(attrs)
    local pool = availableMoves(attrs)
    if #pool < 3 then
        -- 兜底：难度 1-2 无门槛，正常不会走到这里
        pool = DUNK_MOVES
    end

    -- 洗牌（Lua 数组从 1 开始）
    ---@type number[]
    local idx = {}
    for i = 1, #pool do idx[i] = i end
    for i = #idx, 2, -1 do
        local j = math.random(1, i)
        idx[i], idx[j] = idx[j], idx[i]
    end

    ---@type DunkMoveDef[]
    local out = {}
    for i = 1, math.min(3, #idx) do
        local pick = idx[i]
        if pick then
            out[i] = pool[pick]
        end
    end
    return out
end

--- 生成某个动作的时机条
---@param attrs table<string, number>
---@param move DunkMoveDef
---@return DunkBar
local function makeDunkBar(attrs, move)
    ---@type number
    local ath = attrs.athletic or 30
    -- 体能越好，判定窗口越宽容（难度上限之外的第二层收益）
    local greenWidth = move.window * (0.85 + (ath / 100) * 0.30)
    local yellowWidth = greenWidth + 0.13
    local center = clamp(0.60 + math.random(-7, 7) / 100, 0.36, 0.80)

    return {
        moveId = move.id,
        cursor = 0,
        dir = 1,
        -- 难度越高摆动越快：1 难度约 0.78/秒，5 难度约 1.05/秒
        speed = 0.72 + move.difficulty * 0.06 + math.random() * 0.12,
        zones = makeZones(center, greenWidth, yellowWidth),
        window = greenWidth,
    }
end

--- 开启扣篮大赛
---@param attrs table<string, number>
---@return DunkState
function AllStar.startDunk(attrs)
    ---@type DunkState
    local d = {
        attrs = attrs or {},
        round = 1,
        total = 0,
        results = {},
        offers = {},
        pendingMove = nil,
        bar = nil,
        finished = false,
    }
    d.offers = rollOffers(d.attrs)
    dunk_ = d
    print(string.format("[AllStar] 扣篮大赛开始：体能 %d，可尝试难度上限 %d",
        d.attrs.athletic or 30, AllStar.maxDunkDifficulty(attrs)))
    return d
end

--- 可选扣篮动作列表（静态表，请勿修改返回值）
---@return table[] { id, name, desc, difficulty(1-5), baseScore, window }
function AllStar.dunkMoves()
    return DUNK_MOVES
end

--- 某个动作当前是否够格尝试（体能门槛）
---@param moveId string
---@return boolean
function AllStar.dunkMoveAvailable(moveId)
    local move = findDunkMove(moveId)
    if not move then return false end
    ---@type number
    local ath = 30
    if dunk_ then
        ath = dunk_.attrs.athletic or 30
    end
    return ath >= move.reqAthletic
end

--- 当前体能允许挑战的最高难度
---@param attrs table<string, number>|nil
---@return number
function AllStar.maxDunkDifficulty(attrs)
    ---@type number
    local ath = (attrs and attrs.athletic) or (dunk_ and dunk_.attrs.athletic) or 30
    ---@type number
    local best = 0
    for i = 1, #DUNK_MOVES do
        local move = DUNK_MOVES[i]
        if ath >= move.reqAthletic and move.difficulty > best then
            best = move.difficulty
        end
    end
    return best
end

--- 本轮 3 个候选动作（没有会话时返回空表）
---@return DunkMoveDef[]
function AllStar.dunkOffers()
    if not dunk_ then return {} end
    return dunk_.offers
end

--- 扣篮大赛当前阶段："none" 未开始 | "pick" 选动作 | "aim" 待起跳 | "done" 已结束
---@return string
function AllStar.dunkPhase()
    local d = dunk_
    if not d then return "none" end
    if d.finished then return "done" end
    if d.pendingMove then return "aim" end
    return "pick"
end

--- 选定本扣动作（选定后进入起跳阶段，时机条开始摆动）
---@param moveId string
---@return boolean 是否选定成功
function AllStar.selectDunkMove(moveId)
    local d = dunk_
    if not d or d.finished then return false end
    local move = findDunkMove(moveId)
    if not move then
        print("[AllStar] 未知扣篮动作：" .. tostring(moveId))
        return false
    end
    d.pendingMove = move
    d.bar = makeDunkBar(d.attrs, move)
    print(string.format("[AllStar] 第 %d 扣选定动作：%s（难度 %d，窗口 %.3f）",
        d.round, move.name, move.difficulty, d.bar.window))
    return true
end

--- 扣篮大赛：当前轮到第几扣（1-3）
---@return number
function AllStar.dunkRound()
    local d = dunk_
    if not d then return 1 end
    return math.min(math.max(d.round, 1), AllStar.DUNK_ROUNDS)
end

--- 扣篮时机条（给界面绘制用的扁平快照）
---@class DunkBarView
---@field moveId string
---@field cursor number
---@field speed number
---@field window number
---@field greenLo number
---@field greenHi number
---@field yellowLo number
---@field yellowHi number

--- 扣篮大赛：当前时机条（给 UI 绘制用；没有起跳阶段时返回 nil）
---@return DunkBarView|nil
function AllStar.dunkBarView()
    local d = dunk_
    if not d or not d.bar then return nil end
    return {
        moveId = d.bar.moveId,
        cursor = d.bar.cursor,
        speed = d.bar.speed,
        window = d.bar.window,
        greenLo = d.bar.zones.greenLo,
        greenHi = d.bar.zones.greenHi,
        yellowLo = d.bar.zones.yellowLo,
        yellowHi = d.bar.zones.yellowHi,
    }
end

--- 扣篮大赛：当前游标位置（供 UI 每帧取用）
---@return number|nil
function AllStar.dunkCursor()
    local d = dunk_
    if not d or not d.bar then return nil end
    return d.bar.cursor
end

--- 扣篮大赛：推进时机条游标（由 UI 每帧调用，仅起跳阶段有效）
---@param dt number
function AllStar.tickDunk(dt)
    local d = dunk_
    if not d or d.finished or not d.bar then return end
    local b = d.bar
    b.cursor = b.cursor + b.dir * b.speed * dt
    if b.cursor >= 1.0 then
        b.cursor = 1.0
        b.dir = -1
    elseif b.cursor <= 0.0 then
        b.cursor = 0.0
        b.dir = 1
    end
end

--- 一次扣篮的结果
---@class DunkPerfResult
---@field points number  本次难度分（基础分 + 时机加成，不含观赏分）
---@field score number   评委最终得分 0-50（计入扣篮大赛总分）
---@field total number   本次扣篮后的累计总分
---@field moveId string
---@field moveName string
---@field failed boolean 是否失手
---@field outOfReach boolean 是否因体能不足而动作变形
---@field result string  "perfect" | "good" | "miss" | "out_of_reach" | "none"
---@field text string    解说文案

--- 执行一次扣篮
--- 打分规则：
---   绿区（完美）= 难度基础分 + 8，黄区（完成）= +3，红区（失手）= 基础分 × 0.3
---   再加上「观赏分」= 意识属性换算的 0-4 分，最终封顶 50 分
---   体能低于动作门槛时不锁死，而是动作变形：分数减半并记为失败
---@param moveId string
---@param timing number 0..1 时机判定
---@return DunkPerfResult
function AllStar.performDunk(moveId, timing)
    local d = dunk_
    if not d or d.finished then
        return {
            points = 0, score = 0, total = 0, moveId = moveId, moveName = "",
            failed = true, outOfReach = false, result = "none",
            text = "扣篮大赛尚未开始或已经结束。",
        }
    end

    local move = findDunkMove(moveId)
    if not move then
        print("[AllStar] performDunk 收到未知动作：" .. tostring(moveId))
        return {
            points = 0, score = 0, total = d.total, moveId = moveId, moveName = "",
            failed = true, outOfReach = false, result = "none",
            text = "没有这个扣篮动作。",
        }
    end

    local pos = timing
    if type(pos) ~= "number" then
        pos = (d.bar and d.bar.cursor) or 0.5
    end
    pos = clamp(pos, 0.0, 1.0)

    -- 直接用当前动作的判定窗口复算一次（不依赖 selectDunkMove，单独调用也能用）
    local bar = d.bar
    if not bar or bar.moveId ~= move.id then
        bar = makeDunkBar(d.attrs, move)
        bar.cursor = pos
    end
    local kind = judge(pos, bar.zones)

    local ath = d.attrs.athletic or 30
    local iq = d.attrs.iq or 30
    local outOfReach = ath < move.reqAthletic
    -- 观赏分：意识越高，动作编排越讨评委喜欢（0-4 分）
    local style = clamp(math.floor(iq / 20) - 1, 0, 4)

    local points, score, text, failed
    if outOfReach then
        points = math.floor(move.baseScore * 0.5)
        score = points
        failed = true
        kind = "out_of_reach"
        text = string.format("体能撑不住这个动作——起跳高度不够，%s只做了一半，%d 分。",
            move.name, score)
    elseif kind == "perfect" then
        points = move.baseScore + 8
        score = clamp(points + style, 0, AllStar.DUNK_MAX_PER_ROUND)
        failed = false
        text = string.format("完美！%s一气呵成，评委打出 %d 分！", move.name, score)
    elseif kind == "good" then
        points = move.baseScore + 3
        score = clamp(points + style, 0, AllStar.DUNK_MAX_PER_ROUND)
        failed = false
        text = string.format("%s完成度不错，只是落地时略微踉跄，%d 分。", move.name, score)
    else
        points = math.floor(move.baseScore * 0.3)
        score = points
        failed = true
        text = string.format("砸在篮筐前沿！%s失手，只拿到 %d 分。", move.name, score)
    end

    local record = {
        moveId = move.id,
        moveName = move.name,
        points = points,
        score = score,
        failed = failed,
        result = kind,
        text = text,
    }
    table.insert(d.results, record)
    d.total = d.total + score

    -- 进入下一扣
    d.pendingMove = nil
    d.bar = nil
    d.round = d.round + 1
    if d.round > AllStar.DUNK_ROUNDS then
        d.finished = true
        d.offers = {}
        print(string.format("[AllStar] 扣篮大赛结束：总分 %d / %d", d.total, AllStar.DUNK_MAX))
    else
        d.offers = rollOffers(d.attrs)
    end

    print(string.format("[AllStar] 第 %d 扣 %s：%s（%d 分，累计 %d）",
        d.round - 1, move.name, kind, score, d.total))

    return {
        points = points,
        score = score,
        total = d.total,
        moveId = move.id,
        moveName = move.name,
        failed = failed,
        outOfReach = outOfReach,
        result = kind,
        text = text,
    }
end

--- 扣篮大赛是否结束
---@return boolean
function AllStar.dunkFinished()
    return dunk_ ~= nil and dunk_.finished
end

--- 扣篮大赛总分
---@return number
function AllStar.dunkScore()
    if not dunk_ then return 0 end
    return dunk_.total
end

--- 扣篮大赛每扣成绩（给界面展示用）
---@return DunkResult[]
function AllStar.dunkResults()
    if not dunk_ then return {} end
    return dunk_.results
end

-- ============================================================================
-- 结算
-- ============================================================================

--- 三分大赛排名（1 = 冠军；1 名之后按分数线落位，共 FIELD_SIZE 人）
---@param score number
---@return number
local function threeRankOf(score)
    if score >= AllStar.THREE_WIN then return 1 end
    if score >= 30 then return 2 end
    if score >= 22 then return 3 end
    if score >= 15 then return 4 end
    if score >= 9 then return 5 end
    if score >= 4 then return 6 end
    if score >= 1 then return 7 end
    return AllStar.FIELD_SIZE
end

--- 扣篮大赛排名（1 = 冠军）
---@param score number
---@return number
local function dunkRankOf(score)
    if score >= AllStar.DUNK_WIN then return 1 end
    if score >= 108 then return 2 end
    if score >= 88 then return 3 end
    if score >= 70 then return 4 end
    if score >= 50 then return 5 end
    if score >= 32 then return 6 end
    if score >= 15 then return 7 end
    return AllStar.FIELD_SIZE
end

--- 全明星周末的结算结果
---@class AllStarResult
---@field threeScore number 三分大赛得分
---@field dunkScore number  扣篮大赛得分
---@field threeRank number  三分大赛排名（1 = 冠军）
---@field dunkRank number   扣篮大赛排名（1 = 冠军）
---@field rewards string[]  奖励清单（界面直接展示）
---@field fame number       实际入账人气
---@field morale number     实际入账士气
---@field money number      实际入账收入（万）
---@field exp number        实际入账经验
---@field wonThree boolean  是否三分夺冠
---@field wonDunk boolean   是否扣篮夺冠
---@field threeMax number   三分满分（展示用）
---@field dunkMax number    扣篮满分（展示用）
---@field fieldSize number  参赛人数（排名分母）
---@field bothWon boolean   是否包揽双冠
---@field season number     结算时的赛季

--- 结算整个全明星周末，写入生涯状态并返回结果
---@param state CareerState
---@return AllStarResult
function AllStar.finish(state)
    if not state then
        print("[AllStar] finish 收到空生涯状态")
        return {
            threeScore = 0, dunkScore = 0,
            threeRank = AllStar.FIELD_SIZE, dunkRank = AllStar.FIELD_SIZE,
            rewards = {}, fame = 0, morale = 0, money = 0, exp = 0,
            wonThree = false, wonDunk = false,
            threeMax = AllStar.THREE_MAX, dunkMax = AllStar.DUNK_MAX,
            fieldSize = AllStar.FIELD_SIZE, bothWon = false,
            season = 1,
        }
    end

    local rec = ensure(state)
    local ts = AllStar.threeScore()
    local ds = AllStar.dunkScore()
    local threeRank = threeRankOf(ts)
    local dunkRank = dunkRankOf(ds)
    local wonThree = (threeRank == 1)
    local wonDunk = (dunkRank == 1)
    local seasonNo = state.season or 1

    -- ---- 表现系数：两项得分各归一化后取均值（0-1）----
    local perf = (ts / AllStar.THREE_MAX + ds / AllStar.DUNK_MAX) * 0.5
    perf = clamp(perf, 0, 1)

    local fameBase = 100 + math.floor(perf * 700)     -- 100 ~ 800
    local moraleAdd = 5 + math.floor(perf * 13)       -- 5 ~ 18
    local moneyAdd = math.floor(perf * 200)           -- 0 ~ 200
    local expAdd = 80 + math.floor(perf * 320)        -- 80 ~ 400

    -- ---- 夺冠额外加成 ----
    local fameBonus = 0
    if wonThree then fameBonus = fameBonus + 150 end
    if wonDunk then fameBonus = fameBonus + 200 end
    local bothWon = wonThree and wonDunk
    if bothWon then fameBonus = fameBonus + 100 end
    if bothWon then moraleAdd = moraleAdd + 4 end

    -- ---- 快照，用于统计「实际入账」（徽章会放大正向收益）----
    local beforeFame = state.fame or 0
    local beforeMorale = state.morale or 0
    local beforeMoney = state.money or 0
    local beforeExp = state.expPool or 0

    -- 统一走 Career 的写入入口，让徽章被动（人气获取 / 收入）正常生效
    Career.addFame(fameBase + fameBonus)
    Career.addMorale(moraleAdd)
    Career.addMoney(moneyAdd)
    Career.addExp(expAdd)

    local gainedFame = (state.fame or 0) - beforeFame
    local gainedMorale = (state.morale or 0) - beforeMorale
    local gainedMoney = (state.money or 0) - beforeMoney
    local gainedExp = (state.expPool or 0) - beforeExp

    -- ---- 奖励清单（界面直接展示）----
    ---@type string[]
    local rewards = {}
    table.insert(rewards, string.format("三分大赛 %d 分，第 %d 名（共 %d 人）",
        ts, threeRank, AllStar.FIELD_SIZE))
    table.insert(rewards, string.format("扣篮大赛 %d 分，第 %d 名（共 %d 人）",
        ds, dunkRank, AllStar.FIELD_SIZE))
    table.insert(rewards, string.format("全明星周末的曝光：人气 +%d", gainedFame))
    table.insert(rewards, string.format("更衣室与球迷的认可：士气 +%d", gainedMorale))
    if gainedMoney > 0 then
        table.insert(rewards, string.format("周末分红与商业活动：收入 +%d 万", gainedMoney))
    end
    table.insert(rewards, string.format("与联盟顶尖球员同场：经验 +%d", gainedExp))

    -- ---- 冠军荣誉 ----
    state.honors = state.honors or {}
    if wonThree then
        table.insert(state.honors, string.format("第%d赛季 全明星三分大赛冠军", seasonNo))
        table.insert(rewards, "★ 三分大赛冠军！最后一颗彩球落网时，全场都站了起来。")
        Career.addLog(string.format("★ 第%d赛季全明星三分大赛夺冠（%d 分）。", seasonNo, ts))
    end
    if wonDunk then
        table.insert(state.honors, string.format("第%d赛季 全明星扣篮大赛冠军", seasonNo))
        table.insert(rewards, "★ 扣篮大赛冠军！评委席集体举起了满分牌。")
        Career.addLog(string.format("★ 第%d赛季全明星扣篮大赛夺冠（%d 分）。", seasonNo, ds))
    end
    if bothWon then
        table.insert(state.honors, string.format("第%d赛季 全明星周末双冠王", seasonNo))
        table.insert(rewards, "★ 双冠王！这个周末只属于你一个人。")
        Career.addLog(string.format("★ 第%d赛季全明星周末包揽三分与扣篮双冠。", seasonNo))
    end

    -- ---- 记录与参赛标记 ----
    rec.bestThree = math.max(rec.bestThree, ts)
    rec.bestDunk = math.max(rec.bestDunk, ds)
    if wonThree then rec.wonThree = true end
    if wonDunk then rec.wonDunk = true end
    AllStar.markDone(state)

    -- ---- 总结大事记 ----
    Career.addLog(string.format("参加第%d赛季全明星周末：三分 %d 分（第%d）、扣篮 %d 分（第%d）。",
        seasonNo, ts, threeRank, ds, dunkRank))

    -- ---- 结算后可能解锁荣誉类徽章（全明星 / 人气线）----
    local Badges = require("Data.Badges")
    local newBadges = Badges.check(state)
    for i = 1, #newBadges do
        local def = Badges.BY_ID[newBadges[i]]
        if def then
            table.insert(rewards, string.format("★ 解锁徽章【%s】：%s", def.name, def.desc))
            Career.addLog(string.format("★ 解锁徽章【%s】：%s", def.name, def.desc))
        end
    end

    print(string.format("[AllStar] 结算完成：三分 %d（第%d）扣篮 %d（第%d）人气 +%d 士气 +%d 收入 +%d 经验 +%d",
        ts, threeRank, ds, dunkRank, gainedFame, gainedMorale, gainedMoney, gainedExp))

    return {
        threeScore = ts,
        dunkScore = ds,
        threeRank = threeRank,
        dunkRank = dunkRank,
        rewards = rewards,
        fame = gainedFame,
        morale = gainedMorale,
        money = gainedMoney,
        exp = gainedExp,
        wonThree = wonThree,
        wonDunk = wonDunk,
        -- 扩展字段（供界面展示满分与规模）
        threeMax = AllStar.THREE_MAX,
        dunkMax = AllStar.DUNK_MAX,
        fieldSize = AllStar.FIELD_SIZE,
        bothWon = bothWon,
        season = seasonNo,
    }
end

--- 清空当前会话（离开界面 / 重新进入时调用）
function AllStar.reset()
    three_ = nil
    dunk_ = nil
    print("[AllStar] 会话已清空")
end

return AllStar
