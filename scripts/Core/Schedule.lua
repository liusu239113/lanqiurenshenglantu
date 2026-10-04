-- ============================================================================
-- Schedule — 赛季赛程与季后赛
--
-- 此前：比赛对手纯随机（Teams.randomOpponent），冠军是赛季末的一次掷骰子
--       （math.random() < 0.35），玩家感受不到"我变强了 → 球队走得更远"的因果。
-- 现在：赛季开始时生成固定赛程（8 场常规赛，对手不重复），
--       赛季末按战绩排名进入季后赛（4 强 → 决赛），冠军必须逐轮打出来。
-- ============================================================================

local Config = require("Core.Config")
local Teams = require("Data.Teams")

local Schedule = {}

-- 季后赛轮次名
Schedule.ROUND_NAMES = {
    semi = "半决赛",
    final = "总决赛",
}

-- ---------------------------------------------------------------------------
-- 生成
-- ---------------------------------------------------------------------------

--- 为当前赛季生成赛程（覆盖旧赛程）
---@param state CareerState
function Schedule.generate(state)
    local stageId = Config.STAGES[state.stageIndex] and Config.STAGES[state.stageIndex].id or "street"
    local n = Config.SEASON.gamesPerSeason
    local weeks = Config.SEASON.weeksPerSeason

    -- 均匀铺开比赛周：12 周打 8 场 → 第 1、2、4、5、7、8、10、11 周
    local interval = weeks / n
    ---@type number[]
    local gameWeeks = {}
    for i = 0, n - 1 do
        gameWeeks[#gameWeeks + 1] = math.floor(i * interval) + 1
    end

    -- 对手池：同阶段球队优先，不足则用随机队名补齐，且尽量不重复。
    -- 注意 getStageTeams 返回的是「按档次分组的队名数组」(string[][])，
    -- 此前写成 stageTeams[i].name 恒为 nil，导致赛程对手全部退化成随机队名。
    ---@type string[]
    local pool = {}
    local stageTeams = Teams.getStageTeams(stageId)
    for tier = 1, #stageTeams do
        local list = stageTeams[tier]
        for i = 1, #list do
            pool[#pool + 1] = list[i]
        end
    end
    while #pool < n do
        pool[#pool + 1] = Teams.randomOpponent(stageId)
    end

    -- 宿敌所在球队：进入职业阶段后保证至少出现一次（宿敌之战是本赛季的重头戏）
    local Rival = require("Core.Rival")
    local rivalTeam = Rival.teamName and Rival.teamName(state) or nil
    if rivalTeam and rivalTeam ~= "" and state.stageIndex >= 4 then
        local hasRival = false
        for i = 1, #pool do
            if pool[i] == rivalTeam then hasRival = true break end
        end
        if not hasRival then pool[#pool + 1] = rivalTeam end
    end

    -- 洗牌（Fisher-Yates）
    for i = #pool, 2, -1 do
        local j = math.random(1, i)
        pool[i], pool[j] = pool[j], pool[i]
    end

    ---@type table[]
    local games = {}
    for i = 1, n do
        games[i] = {
            week = gameWeeks[i] or i,
            opponent = pool[i] or "对手队",
            -- 对手强度：以当前阶段基准为中线浮动
            strength = Schedule.rollOpponentStrength(state),
            -- 主客场：让赛程读起来像真实赛季（主场略占优，写进比赛解说）
            home = (i % 2 == 1),
            win = nil,        -- 赛后写入
            myPoints = 0,
        }
    end

    state.schedule = games
    state.scheduleSeason = state.season
    state.playoff = nil
    state.playoffResult = nil
    print(string.format("[Schedule] 第 %d 赛季赛程已生成，共 %d 场", state.season, #games))
end

--- 对手强度（相对当前阶段基准浮动 ±8）
---@param state CareerState
---@return number
function Schedule.rollOpponentStrength(state)
    local stage = Config.STAGES[state.stageIndex] or Config.STAGES[1]
    local base = stage.teamStrength or 60
    return math.floor(base + math.random(-8, 8) + 0.5)
end

--- 确保当前赛季有赛程（读档/首次进入时兜底）
---@param state CareerState
function Schedule.ensure(state)
    if not state.schedule or #state.schedule == 0 then
        Schedule.generate(state)
        return
    end
    -- 赛季变了但赛程还是旧的 → 重新生成
    if state.scheduleSeason ~= state.season then
        Schedule.generate(state)
    end
    state.scheduleSeason = state.season
end

-- ---------------------------------------------------------------------------
-- 查询
-- ---------------------------------------------------------------------------

--- 本周是否有比赛
---@param state CareerState
---@return boolean
function Schedule.hasGameThisWeek(state)
    if not state or not state.schedule then return false end
    for i = 1, #state.schedule do
        if state.schedule[i].week == state.week then
            return true
        end
    end
    return false
end

--- 取本周的比赛（无则返回 nil）
---@param state CareerState
---@return table|nil
function Schedule.gameThisWeek(state)
    if not state or not state.schedule then return nil end
    for i = 1, #state.schedule do
        local g = state.schedule[i]
        if g.week == state.week then
            return g
        end
    end
    return nil
end

--- 常规赛战绩
---@param state CareerState
---@return number wins, number losses
function Schedule.record(state)
    local w, l = 0, 0
    local games = state.schedule or {}
    for i = 1, #games do
        if games[i].win == true then w = w + 1
        elseif games[i].win == false then l = l + 1 end
    end
    return w, l
end

--- 记录一场比赛结果
---@param state CareerState
---@param game table
---@param win boolean
---@param myPoints number
function Schedule.recordResult(state, game, win, myPoints)
    game.win = win
    game.myPoints = myPoints or 0
end

-- ---------------------------------------------------------------------------
-- 季后赛
-- ---------------------------------------------------------------------------

--- 常规赛结束后，按战绩决定是否进入季后赛并生成对阵
---@param state CareerState
---@return table|nil 季后赛状态（未晋级返回 nil）
function Schedule.buildPlayoff(state)
    local wins, losses = Schedule.record(state)
    local total = wins + losses
    if total == 0 then return nil end

    local rate = wins / total
    -- 晋级门槛：胜率 >= 0.5 进半决赛；>= 0.75 直接进决赛（头号种子）
    local seed = nil
    if rate >= 0.75 then seed = 1
    elseif rate >= 0.5 then seed = 2
    else
        state.playoffResult = "regular"
        return nil
    end

    local stageId = Config.STAGES[state.stageIndex] and Config.STAGES[state.stageIndex].id or "street"
    ---@type table
    local po = {
        seed = seed,
        round = seed == 1 and "final" or "semi",
        wins = wins,
        losses = losses,
        opponent = Teams.randomOpponent(stageId),
        opponentStrength = math.floor((Config.STAGES[state.stageIndex] or {}).teamStrength or 60) + (seed == 1 and 4 or 0),
        history = {},
        done = false,
        champion = false,
    }
    state.playoff = po
    return po
end

--- 打一轮季后赛，返回是否获胜
---@param state CareerState
---@param win boolean 本场胜负
---@return table 结果 { champion, advanced, eliminated, roundName }
function Schedule.advancePlayoff(state, win)
    local po = state.playoff
    if not po or po.done then
        return { champion = false, advanced = false, eliminated = false, roundName = "" }
    end

    local roundName = Schedule.ROUND_NAMES[po.round] or "季后赛"
    table.insert(po.history, { round = po.round, win = win })

    if not win then
        po.done = true
        state.playoffResult = "eliminated"
        return { champion = false, advanced = false, eliminated = true, roundName = roundName }
    end

    if po.round == "semi" then
        -- 赢下半决赛 → 进决赛
        po.round = "final"
        local stageId = Config.STAGES[state.stageIndex] and Config.STAGES[state.stageIndex].id or "street"
        po.opponent = Teams.randomOpponent(stageId)
        po.opponentStrength = math.floor((Config.STAGES[state.stageIndex] or {}).teamStrength or 60) + 6
        return { champion = false, advanced = true, eliminated = false, roundName = roundName }
    end

    -- 赢下决赛 → 夺冠
    po.done = true
    po.champion = true
    state.playoffResult = "champion"
    return { champion = true, advanced = false, eliminated = false, roundName = roundName }
end

--- 季后赛当前轮次描述
---@param state CareerState
---@return string|nil
function Schedule.playoffLabel(state)
    local po = state.playoff
    if not po or po.done then return nil end
    return string.format("%s · 对阵 %s", Schedule.ROUND_NAMES[po.round] or "季后赛", po.opponent)
end

-- ---------------------------------------------------------------------------
-- 赛程表 / 日程（给玩家看的"我这一年要打谁"）
-- ---------------------------------------------------------------------------

---@class ScheduleRow
---@field week number
---@field opponent string
---@field strength number
---@field home boolean
---@field win boolean|nil
---@field myPoints number
---@field status string   "done" | "current" | "upcoming"

--- 当前赛季赛程表（含每场的状态，供主页赛程卡渲染）
---@param state CareerState
---@return ScheduleRow[]
function Schedule.rows(state)
    Schedule.ensure(state)
    ---@type ScheduleRow[]
    local rows = {}
    local games = state.schedule or {}
    for i = 1, #games do
        local g = games[i]
        ---@type string
        local status
        if g.win ~= nil then
            status = "done"
        elseif g.week == state.week then
            status = "current"
        else
            status = "upcoming"
        end
        rows[#rows + 1] = {
            week = g.week,
            opponent = g.opponent,
            strength = g.strength,
            home = g.home ~= false,
            win = g.win,
            myPoints = g.myPoints or 0,
            status = status,
        }
    end
    return rows
end

--- 本周类型：让玩家在推进前就知道这周会面对什么
---@param state CareerState
---@return string "playoff" | "game" | "rest" | "offseason"
function Schedule.weekKind(state)
    if not state then return "rest" end
    if state.playoff and not state.playoff.done then return "playoff" end
    if state.week > Config.SEASON.weeksPerSeason then return "offseason" end
    if Schedule.hasGameThisWeek(state) then return "game" end
    return "rest"
end

--- 本周对手（含季后赛），无比赛返回 nil
---@param state CareerState
---@return table|nil { opponent, strength, home, playoff, roundName }
function Schedule.weekOpponent(state)
    if not state then return nil end
    if state.playoff and not state.playoff.done then
        return {
            opponent = state.playoff.opponent,
            strength = state.playoff.opponentStrength,
            home = true,
            playoff = true,
            roundName = Schedule.ROUND_NAMES[state.playoff.round] or "季后赛",
        }
    end
    local g = Schedule.gameThisWeek(state)
    if not g then return nil end
    return {
        opponent = g.opponent,
        strength = g.strength,
        home = g.home ~= false,
        playoff = false,
        roundName = nil,
    }
end

--- 对手强度档位文案（给玩家一个"这场难不难"的直觉）
---@param strength number
---@param state CareerState
---@return string
function Schedule.strengthLabel(strength, state)
    local stage = Config.STAGES[state.stageIndex] or Config.STAGES[1]
    local base = stage.teamStrength or 60
    local diff = strength - base
    if diff >= 6 then return "强敌" end
    if diff >= -6 then return "旗鼓相当" end
    return "弱旅"
end

return Schedule
