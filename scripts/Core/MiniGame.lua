-- ============================================================================
-- MiniGame — 篮球核心操作玩法引擎
-- 四种玩法：投篮时机条 / 运球过人 / 防守预判 / 战术板
-- 这是《篮途》区别于文字卡牌游戏的"手感"层
-- ============================================================================

local Config = require("Core.Config")

local MiniGame = {}

-- ============================================================================
-- 玩法 1：投篮时机条
-- 力度游标来回摆动，玩家在最佳时机出手
-- 绿色区 = 空心入网，黄色区 = 命中，红色区 = 打铁
-- 绿区宽度由【得分】属性和体能决定 → 属性成长带来真实手感提升
-- ============================================================================

---@class ShotState
---@field cursor number      游标位置 0-1
---@field dir number         摆动方向
---@field speed number       摆动速度
---@field greenLo number     绿色区下界
---@field greenHi number     绿色区上界
---@field yellowLo number
---@field yellowHi number
---@field result string|nil  "perfect"|"good"|"miss"
---@field done boolean
---@field points number

--- 开始一次投篮
---@param attrs table<string, number>
---@param stamina number 0-100
---@param difficulty number 1.0 为基础难度
---@return ShotState
function MiniGame.startShot(attrs, stamina, difficulty)
    difficulty = difficulty or 1.0
    local scoring = attrs.scoring or 30

    -- 绿区宽度：属性越高越宽（0.10 ~ 0.26）
    local greenWidth = 0.10 + (scoring / 100) * 0.16
    -- 体能影响（体能低于 40 明显缩窄）
    local staminaMul = 0.7 + (stamina / 100) * 0.3
    greenWidth = greenWidth * staminaMul / difficulty

    -- 黄区在绿区两侧各加宽
    local yellowWidth = greenWidth + 0.16

    local center = 0.62 + math.random(-6, 6) / 100
    if center < 0.35 then center = 0.35 end
    if center > 0.88 then center = 0.88 end

    -- 摆动速度：难度越高越快
    local speed = (0.75 + math.random() * 0.25) * difficulty

    ---@type ShotState
    local s = {
        cursor = 0.0,
        dir = 1,
        speed = speed,
        greenLo = center - greenWidth * 0.5,
        greenHi = center + greenWidth * 0.5,
        yellowLo = center - yellowWidth * 0.5,
        yellowHi = center + yellowWidth * 0.5,
        result = nil,
        done = false,
        points = 0,
    }
    return s
end

--- 推进投篮游标
---@param s ShotState
---@param dt number
function MiniGame.tickShot(s, dt)
    if s.done then return end
    s.cursor = s.cursor + s.dir * s.speed * dt
    if s.cursor >= 1.0 then
        s.cursor = 1.0
        s.dir = -1
    elseif s.cursor <= 0.0 then
        s.cursor = 0.0
        s.dir = 1
    end
end

--- 出手判定
---@param s ShotState
---@return string result, number points
function MiniGame.shoot(s)
    if s.done then return s.result or "miss", s.points end
    s.done = true

    local c = s.cursor
    if c >= s.greenLo and c <= s.greenHi then
        s.result = "perfect"
        s.points = 3
    elseif c >= s.yellowLo and c <= s.yellowHi then
        s.result = "good"
        s.points = 2
    else
        s.result = "miss"
        s.points = 0
    end
    return s.result, s.points
end

-- ============================================================================
-- 玩法 2：运球过人
-- 防守者重心偏向一侧，玩家选择变向方向
-- 防守 AI 会记住玩家习惯，连续同侧会被识破
-- ============================================================================

---@class DribbleState
---@field lean LeanSide       防守者重心 -1(左) / 1(右)
---@field feint number        假动作幅度（迷惑值）
---@field history number[]    玩家历史选择
---@field round number
---@field done boolean
---@field lastResult string|nil

--- 防守者重心方向（-1 左 / 1 右）
---@alias LeanSide -1|1

--- 开始一次过人
---@param round number 第几回合（用于AI适应）
---@param history number[] 玩家历史选择（-1 左 / 1 右）
---@param difficulty number
---@return DribbleState
function MiniGame.startDribble(round, history, difficulty)
    difficulty = difficulty or 1.0

    -- 防守者重心：随机偏向一侧
    ---@type LeanSide
    local lean = (math.random() < 0.5) and -1 or 1
    -- 假动作：有一定概率重心是假的（诱导玩家反向）
    local feint = 0.0
    if math.random() < 0.3 * difficulty then
        lean = (lean == 1) and -1 or 1
        feint = 0.6
    end

    ---@type DribbleState
    return {
        lean = lean,
        feint = feint,
        history = history or {},
        round = round,
        done = false,
        lastResult = nil,
    }
end

--- AI 预判玩家习惯：统计历史中占比高的一侧
---@param history number[]
---@return number|nil 玩家偏好的方向
function MiniGame.predictHabit(history)
    if #history < 3 then return nil end
    local left, right = 0, 0
    for i = 1, #history do
        if history[i] < 0 then left = left + 1 else right = right + 1 end
    end
    local n = #history
    if left / n >= 0.6 then return -1 end
    if right / n >= 0.6 then return 1 end
    return nil
end

--- 做出变向选择
---@param s DribbleState
---@param choice number -1 左 / 1 右
---@param attrs table<string, number>
---@return string result, boolean success
function MiniGame.dribble(s, choice, attrs)
    if s.done then return s.lastResult or "fail", false end
    s.done = true
    table.insert(s.history, choice)

    local playmaking = attrs.playmaking or 30
    local athletic = attrs.athletic or 30

    -- 基础成功率
    local rate = 0.45 + ((playmaking + athletic) * 0.5 / 100) * 0.35

    -- 防守者重心方向：与选择相反 = 过人成功
    local beatLean = (choice ~= s.lean)
    if beatLean then
        rate = rate + 0.25
    else
        rate = rate - 0.30
    end

    -- AI 适应：如果玩家习惯被识破，成功率下降
    local habit = MiniGame.predictHabit(s.history)
    if habit ~= nil and habit == choice then
        rate = rate - 0.20
        s.feint = s.feint + 0.4
    end

    if rate < 0.08 then rate = 0.08 end
    if rate > 0.94 then rate = 0.94 end

    local success = math.random() < rate
    s.lastResult = success and "success" or "fail"
    return s.lastResult, success
end

-- ============================================================================
-- 玩法 3：防守预判读心
-- 对手给出动向提示，玩家预判进攻方式
-- ============================================================================

---@class DefendState
---@field tell string        动向提示
---@field actual string      真实动作 "drive"|"shoot"|"pass"
---@field done boolean
---@field lastResult string|nil

-- 动向提示文案池
local TELLS = {
    drive = {
        "对手肩膀明显下沉，重心压低。",
        "他的运球节奏突然加快，球压得很低。",
        "他抬头扫了一眼篮下，脚下开始发力。",
    },
    shoot = {
        "他把球收到胸前，双腿微微下蹲。",
        "他的出手手型已经架起来了。",
        "他退后半步，寻找出手空间。",
    },
    pass = {
        "他的视线扫向弱侧的队友。",
        "他侧身护球，手臂向外张开。",
        "他停下了运球，双手持球在腰侧。",
    },
}

--- 开始一次防守
---@param difficulty number
---@param defendAttr number 防守属性
---@return DefendState
function MiniGame.startDefend(difficulty, defendAttr)
    difficulty = difficulty or 1.0

    -- 真实动作
    local roll = math.random()
    local actual
    if roll < 0.42 then
        actual = "drive"
    elseif roll < 0.78 then
        actual = "shoot"
    else
        actual = "pass"
    end

    -- 提示：属性高时提示更明确（有概率给假提示）
    local pool = TELLS[actual]
    local tell = pool[math.random(1, #pool)]

    -- 低防守属性 → 有概率给出误导提示
    local confuse = (1 - (defendAttr or 30) / 100) * 0.35 * difficulty
    if math.random() < confuse then
        local keys = { "drive", "shoot", "pass" }
        local other = keys[math.random(1, 3)]
        local otherPool = TELLS[other]
        tell = otherPool[math.random(1, #otherPool)]
    end

    ---@type DefendState
    return {
        tell = tell,
        actual = actual,
        done = false,
        lastResult = nil,
    }
end

--- 做出防守选择
---@param s DefendState
---@param choice string "drive"|"shoot"|"pass"
---@param defendAttr number
---@return boolean success, string resultKind
function MiniGame.defend(s, choice, defendAttr)
    if s.done then return false, "none" end
    s.done = true

    if choice == s.actual then
        s.lastResult = "success"
        return true, s.actual
    end
    s.lastResult = "fail"
    return false, s.actual
end

-- ============================================================================
-- 玩法 4：战术板（球队经营）
-- 布置首发与战术倾向，影响比赛模拟
-- ============================================================================

--- 战术类型
---@class TacticDef
---@field id string
---@field name string
---@field desc string
---@field offense number
---@field defense number
---@field staminaCost number
---@field adLocked boolean|nil 需要看广告解锁（一次性，记在生涯里）

---@type TacticDef[]
MiniGame.TACTICS = {
    { id = "run_gun",  name = "跑轰",   desc = "极速攻防，体力消耗大",   offense = 1.25, defense = 0.85, staminaCost = 1.4 },
    { id = "balanced", name = "均衡",   desc = "攻守平衡，稳定发挥",     offense = 1.00, defense = 1.00, staminaCost = 1.0 },
    { id = "half",     name = "阵地战", desc = "落阵地，稳扎稳打",       offense = 0.92, defense = 1.15, staminaCost = 0.8 },
    { id = "lockdown", name = "铁血防守", desc = "以防守带动进攻",       offense = 0.85, defense = 1.28, staminaCost = 1.1 },
    -- 广告解锁的特殊战术：单核拉开的极端打法，风险与收益都拉满
    { id = "iso",      name = "巨星单打", desc = "全队拉开，把球交给你", offense = 1.32, defense = 0.78, staminaCost = 1.6, adLocked = true },
}

--- 防守策略
---@type TacticDef[]
MiniGame.DEFENSE = {
    { id = "man",   name = "人盯人", desc = "紧贴对位，考验体能",   offense = 1.00, defense = 1.10, staminaCost = 1.2 },
    { id = "zone",  name = "联防",   desc = "收缩护框，省体力",     offense = 0.95, defense = 1.05, staminaCost = 0.8 },
    { id = "press", name = "全场紧逼", desc = "施压抢断，高风险",   offense = 1.05, defense = 1.15, staminaCost = 1.5 },
}

--- 取战术定义
---@param id string
---@return TacticDef
function MiniGame.getTactic(id)
    for i = 1, #MiniGame.TACTICS do
        if MiniGame.TACTICS[i].id == id then
            return MiniGame.TACTICS[i]
        end
    end
    return assert(MiniGame.TACTICS[2])
end

--- 取防守策略定义
---@param id string
---@return TacticDef
function MiniGame.getDefense(id)
    for i = 1, #MiniGame.DEFENSE do
        if MiniGame.DEFENSE[i].id == id then
            return MiniGame.DEFENSE[i]
        end
    end
    return assert(MiniGame.DEFENSE[1])
end

-- ============================================================================
-- 斗牛赛（1v1 单挑）—— 把前三种玩法串成一局
-- ============================================================================

---@class DuelState
---@field myScore number
---@field oppScore number
---@field targetScore number   先到多少分获胜
---@field round number
---@field phase string         "attack"|"defend"|"shot"|"over"
---@field shot ShotState|nil
---@field dribble DribbleState|nil
---@field defend DefendState|nil
---@field dribbleHistory number[]
---@field log string[]
---@field done boolean
---@field win boolean

--- 开始一局斗牛
---@param targetScore number|nil 默认 11 分
---@return DuelState
function MiniGame.startDuel(targetScore)
    ---@type DuelState
    return {
        myScore = 0,
        oppScore = 0,
        targetScore = targetScore or 11,
        round = 1,
        phase = "attack",
        shot = nil,
        dribble = nil,
        defend = nil,
        dribbleHistory = {},
        log = {},
        done = false,
        win = false,
    }
end

--- 追加一条斗牛日志
---@param d DuelState
---@param text string
function MiniGame.duelLog(d, text)
    table.insert(d.log, 1, text)
    while #d.log > 30 do
        table.remove(d.log)
    end
end

--- 检查斗牛是否结束
---@param d DuelState
---@return boolean
function MiniGame.duelCheckOver(d)
    if d.done then return true end
    if d.myScore >= d.targetScore then
        d.done = true
        d.win = true
        d.phase = "over"
        MiniGame.duelLog(d, "★ 你赢下了这场斗牛！")
        return true
    end
    if d.oppScore >= d.targetScore then
        d.done = true
        d.win = false
        d.phase = "over"
        MiniGame.duelLog(d, "对手先到分，你输了这局。")
        return true
    end
    return false
end

return MiniGame
