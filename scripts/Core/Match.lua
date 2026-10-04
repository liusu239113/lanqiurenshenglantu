-- ============================================================================
-- Match — 回合制操作比赛引擎
-- 玩家亲自打每一个回合：突破 → 投篮 / 防守读心
-- 比赛完全由操作驱动，没有文字直播、没有决策卡
-- ============================================================================

local Config = require("Core.Config")
local Teams = require("Data.Teams")
local MiniGame = require("Core.MiniGame")
local Transfer = require("Core.Transfer")
local Commentary = require("Data.Commentary")
local Career = require("Core.Career")
local Teammates = require("Core.Teammates")
local Rival = require("Core.Rival")

local Match = {}

-- ---------------------------------------------------------------------------
-- 回合结果文案（数据引自 Data/Commentary.lua 的 Commentary.MATCH_RESULT）
-- ---------------------------------------------------------------------------

local RESULT_TEXT = Commentary.MATCH_RESULT

--- 随机取一条文案
---@param pool string[]
---@return string
local function pick(pool)
    if #pool == 0 then return "" end
    return assert(pool[math.random(1, #pool)])
end

-- ---------------------------------------------------------------------------
-- 会话状态
-- ---------------------------------------------------------------------------

---@class MatchStats
---@field made number       命中数
---@field attempted number  出手数
---@field steals number     抢断数（防守成功且对手非投篮）
---@field blocks number     盖帽数（防守成功且对手投篮）
---@field turnovers number  失误数

---@class MatchSession
---@field opponent string
---@field myScore number
---@field oppScore number
---@field myPoints number          玩家个人得分
---@field quarter number
---@field roundInQuarter number
---@field round number             总回合序号
---@field totalRounds number
---@field phase string             "dribble"|"shot"|"defend"|"quarter_end"|"over"
---@field possession string        "attack"|"defend"
---@field dribble DribbleState|nil
---@field shot ShotState|nil
---@field defend DefendState|nil
---@field dribbleHistory number[]
---@field difficulty number
---@field myTeamPower number
---@field oppPower number
---@field log string[]
---@field highlights string[]
---@field stats MatchStats
---@field finished boolean
---@field win boolean
---@field flashText string        最近一次动作的结果文案
---@field myBaseMin number        我方背景得分下限
---@field myBaseMax number        我方背景得分上限
---@field oppBaseMin number       对手背景得分下限
---@field oppBaseMax number       对手背景得分上限

---@type MatchSession|nil
Match.session = nil

-- ---------------------------------------------------------------------------
-- 工具
-- ---------------------------------------------------------------------------

--- 追加一条比赛日志
---@param s MatchSession
---@param text string
function Match.addLog(s, text)
    table.insert(s.log, 1, text)
    while #s.log > 24 do
        table.remove(s.log)
    end
end

--- 计算某一方本回合的基础得分（队友/对手贡献）
---@param s MatchSession
---@param isMine boolean
---@return number
local function baseScore(s, isMine)
    local lo = isMine and s.myBaseMin or s.oppBaseMin
    local hi = isMine and s.myBaseMax or s.oppBaseMax
    local v = math.random(lo, hi)
    -- 实力差修正
    local ratio = s.myTeamPower / (s.myTeamPower + s.oppPower)
    local factor = isMine and (0.78 + ratio * 0.44) or (1.22 - ratio * 0.44)
    -- 士气修正：只作用于我方（队友手感），对手不受影响
    if isMine then
        factor = factor * (s.moraleFactor or 1.0)
    end
    local out = math.floor(v * factor + 0.5)
    if out < 1 then out = 1 end
    return out
end

-- ---------------------------------------------------------------------------
-- 开始比赛
-- ---------------------------------------------------------------------------

--- 开始一场比赛
---@param state CareerState
---@param stage StageDef|nil 不传则按当前年龄阶段推断（避免调用方遗漏时崩溃）
---@return MatchSession
function Match.start(state, stage)
    local cfg = Config.MATCH
    -- 兜底：stage 未传时按当前年龄推断，防止 Transfer.teamStrength 索引 nil
    if not stage then
        for i = 1, #Config.STAGES do
            local def = Config.STAGES[i]
            if state.age >= def.minAge and state.age <= def.maxAge then
                stage = def
                break
            end
        end
        stage = stage or Config.STAGES[1]
    end

    -- 球队实力（含徽章被动加成与战术加成）
    local ma = Career.matchAttrs()
    local overall = 0
    for i = 1, #Config.ATTRS do
        local def = Config.ATTRS[i]
        overall = overall + (ma[def.key] or 0)
    end
    overall = overall / #Config.ATTRS

    local tacticOff, tacticDef = 1.0, 1.0
    if state.tacticId then
        tacticOff = MiniGame.getTactic(state.tacticId).offense
    end
    if state.defenseId then
        tacticDef = MiniGame.getDefense(state.defenseId).defense
    end

    -- 球队档次影响队友水平：加盟豪门更容易赢，这也是转会的直接收益
    local myTeamPower = (Transfer.teamStrength(state, stage) + (overall - 40) * 0.55) * tacticOff * tacticDef
    -- 队友系统：化学反应 + 羁绊 + 性格特长 → 球队实力加减（约 -9 ~ +12）
    myTeamPower = myTeamPower + Teammates.teamPowerBonus(state)

    -- 对手来自赛季赛程（季后赛则是当前轮次对手），不再是纯随机
    local game = Career.getGameThisWeek()
    local oppStrength = game and game.strength or (stage.teamStrength + math.random(-8, 8))
    local opponent = game and game.opponent or Teams.randomOpponent(stage.id)
    -- 宿敌之战：打宿敌所在球队时对手强度上浮，赢了更有分量
    local oppPower = oppStrength + Rival.matchBoost(state, opponent)

    -- 难度随对手强度提升
    local difficulty = 0.85 + (stage.teamStrength / 100) * 0.55

    -- 士气系数：士气 0 → 0.88，士气 100 → 1.12（与文字直播同一公式，保证两模式手感一致）
    -- 士气同时影响队友背景得分，低士气球队整体会打得更挣扎
    local moraleFactor = 0.88 + ((state.morale or 50) / 100) * 0.24
    -- 难度再乘一个反向的士气修正：士气低 → 出手窗口更窄
    difficulty = difficulty / moraleFactor

    ---@type MatchSession
    local s = {
        opponent = opponent,
        myScore = 0,
        oppScore = 0,
        myPoints = 0,
        quarter = 1,
        roundInQuarter = 1,
        round = 1,
        totalRounds = cfg.quarters * cfg.roundsPerQuarter,
        phase = "dribble",
        possession = "attack",
        dribble = nil,
        shot = nil,
        defend = nil,
        dribbleHistory = {},
        difficulty = difficulty,
        myTeamPower = myTeamPower,
        oppPower = oppPower,
        log = {},
        highlights = {},
        stats = { made = 0, attempted = 0, steals = 0, blocks = 0, turnovers = 0 },
        finished = false,
        win = false,
        flashText = "",
        -- 基础得分区间（从配置读入，便于调参）
        myBaseMin = cfg.myBaseMin,
        myBaseMax = cfg.myBaseMax,
        oppBaseMin = cfg.oppBaseMin,
        oppBaseMax = cfg.oppBaseMax,
        -- 士气系数：低士气时投篮绿区缩窄、队友得分下降
        -- （此前操作模式完全不读士气，导致「天选之星」的 -8 士气惩罚毫无代价）
        moraleFactor = moraleFactor,
    }

    Match.session = s
    -- 主客场写进开场解说：赛程表上标了主/客，比赛里就得能感受到
    local venue = (game and game.home == false) and "客场" or "主场"
    Match.addLog(s, string.format("跳球！%s 在%s迎战 %s。", state.team, venue, opponent))
    Match.beginRound(s, state)

    print(string.format("[Match] 开始 %s vs %s | 难度 %.2f | 共 %d 回合",
        state.team, opponent, difficulty, s.totalRounds))
    return s
end

-- ---------------------------------------------------------------------------
-- 回合驱动
-- ---------------------------------------------------------------------------

--- 开始当前回合（设置 phase 与对应的 mini-game 状态）
---@param s MatchSession
---@param state CareerState
function Match.beginRound(s, state)
    if s.round > s.totalRounds then
        s.phase = "over"
        s.finished = true
        s.win = s.myScore > s.oppScore
        return
    end

    -- 攻守交替：每节内 1、3 回合进攻，2、4 回合防守
    local isAttack = (s.roundInQuarter % 2 == 1)

    if isAttack then
        s.possession = "attack"
        s.phase = "dribble"
        s.dribble = MiniGame.startDribble(s.round, s.dribbleHistory, s.difficulty)
    else
        s.possession = "defend"
        s.phase = "defend"
        s.defend = MiniGame.startDefend(s.difficulty, state.attrs.defense or 30)
    end
end

--- 结束当前回合，结算背景得分并进入下一回合
---@param s MatchSession
---@param state CareerState
---@param myBase number|nil 我方队友本回合得分（nil 则自动）
---@param oppBase number|nil 对手本回合得分（nil 则自动）
function Match.endRound(s, state, myBase, oppBase)
    local myGain = myBase or baseScore(s, true)
    local oppGain = oppBase or baseScore(s, false)

    s.myScore = s.myScore + myGain
    s.oppScore = s.oppScore + oppGain

    -- 推进回合计数
    s.round = s.round + 1
    s.roundInQuarter = s.roundInQuarter + 1

    -- 节结束？
    if s.roundInQuarter > Config.MATCH.roundsPerQuarter then
        s.roundInQuarter = 1
        s.quarter = s.quarter + 1
        if s.quarter > Config.MATCH.quarters then
            s.phase = "over"
            s.finished = true
            s.win = s.myScore > s.oppScore
            Match.addLog(s, string.format("终场！%d : %d", s.myScore, s.oppScore))
            return
        end
        s.phase = "quarter_end"
        return
    end

    Match.beginRound(s, state)
end

--- 玩家点击继续（用于 quarter_end 阶段）
---@param s MatchSession
---@param state CareerState
function Match.continueFromBreak(s, state)
    if s.phase == "quarter_end" then
        Match.beginRound(s, state)
    end
end

-- ---------------------------------------------------------------------------
-- 动作结算
-- ---------------------------------------------------------------------------

--- 突破结算
---@param s MatchSession
---@param state CareerState
---@param success boolean
function Match.resolveDribble(s, state, success)
    if success then
        s.flashText = pick(RESULT_TEXT.dribble_win)
        Match.addLog(s, "突破成功，获得出手机会。")
        -- 进入投篮阶段
        s.phase = "shot"
        s.shot = MiniGame.startShot(state.attrs, state.stamina, s.difficulty)
        return
    end

    -- 突破失败：失误，回合结束
    s.stats.turnovers = s.stats.turnovers + 1
    s.flashText = pick(RESULT_TEXT.dribble_lose)
    Match.addLog(s, "突破被断，进攻失败。")
    Match.endRound(s, state)
end

--- 投篮结算
---@param s MatchSession
---@param state CareerState
---@param result string "perfect"|"good"|"miss"
---@param points number
function Match.resolveShot(s, state, result, points)
    s.stats.attempted = s.stats.attempted + 1

    if result == "perfect" then
        s.stats.made = s.stats.made + 1
        s.myPoints = s.myPoints + points
        s.myScore = s.myScore + points
        s.flashText = pick(RESULT_TEXT.shot_perfect)
        table.insert(s.highlights, string.format("%s 三分线外出手，空心入网！", state.name))
        Match.addLog(s, string.format("三分命中！+%d 分。", points))
    elseif result == "good" then
        s.stats.made = s.stats.made + 1
        s.myPoints = s.myPoints + points
        s.myScore = s.myScore + points
        s.flashText = pick(RESULT_TEXT.shot_good)
        Match.addLog(s, string.format("出手命中，+%d 分。", points))
    else
        s.flashText = pick(RESULT_TEXT.shot_miss)
        Match.addLog(s, "出手不中。")
    end

    -- 回合结束（队友/对手的背景得分在 endRound 里结算）
    Match.endRound(s, state)
end

--- 防守结算
---@param s MatchSession
---@param state CareerState
---@param success boolean
---@param actual string 对手实际动作
function Match.resolveDefend(s, state, success, actual)
    local NAMES = { drive = "突破", shoot = "投篮", pass = "传球" }
    local actualName = NAMES[actual] or "进攻"

    if success then
        -- 区分抢断与盖帽：封住投篮 = 盖帽，其余 = 抢断。
        -- 此前只有 steals 一项且 blocks 从未累加，导致「防守铁闸」徽章线只统计抢断。
        if actual == "shoot" then
            s.stats.blocks = (s.stats.blocks or 0) + 1
            s.flashText = pick(RESULT_TEXT.defend_win)
            table.insert(s.highlights, string.format("%s 正面封盖了对手的投篮！", state.name))
            Match.addLog(s, "防守成功，封盖对手的投篮。")
        else
            s.stats.steals = s.stats.steals + 1
            s.flashText = pick(RESULT_TEXT.defend_win)
            table.insert(s.highlights, string.format("%s 识破对手的%s，直接破坏进攻！", state.name, actualName))
            Match.addLog(s, string.format("防守成功，破坏对手的%s。", actualName))
        end
        -- 防守成功：对手本回合得分减半
        local oppBase = baseScore(s, false)
        Match.endRound(s, state, nil, math.max(1, math.floor(oppBase * 0.45)))
        return
    end

    -- 防守失败：对手得分
    local oppPoints = math.random(2, 3)
    s.flashText = pick(RESULT_TEXT.defend_lose)
    Match.addLog(s, string.format("判断失误，对手%s得手 +%d 分。", actualName, oppPoints))
    local oppBase = baseScore(s, false)
    Match.endRound(s, state, nil, oppBase + oppPoints)
end

-- ---------------------------------------------------------------------------
-- 收尾
-- ---------------------------------------------------------------------------

--- 结算比赛并写入生涯状态
---@param state CareerState
---@return table result
function Match.finish(state)
    local s = Match.session
    if not s then
        return { win = false, myPoints = 0, oppPoints = 0, teamPoints = 0, summary = "", highlights = {} }
    end

    local win = s.myScore > s.oppScore

    ---@type string
    local summary
    if win then
        summary = string.format("对阵 %s，%d:%d 取胜，你得到 %d 分。",
            s.opponent, s.myScore, s.oppScore, s.myPoints)
    else
        summary = string.format("对阵 %s，%d:%d 落败，你得到 %d 分。",
            s.opponent, s.myScore, s.oppScore, s.myPoints)
    end

    ---@type table
    local result = {
        opponent = s.opponent,
        win = win,
        myPoints = s.myPoints,
        oppPoints = s.oppScore,
        teamPoints = s.myScore,
        summary = summary,
        highlights = s.highlights,
        stats = s.stats,
    }

    -- ---- 状态结算 ----
    state.games = state.games + 1
    state.seasonGames = state.seasonGames + 1
    state.seasonPoints = state.seasonPoints + s.myPoints
    state.totalPoints = state.totalPoints + s.myPoints
    state.stamina = math.max(0, state.stamina - Config.SEASON.gameStaminaCost)

    local moraleGain = 0
    local fameGain = 0
    if win then
        moraleGain = 6
        fameGain = math.floor(s.myPoints / 3)
    else
        moraleGain = -5
    end
    -- 走 Career 入口，让徽章的人气/士气上限与百分比加成生效
    Career.addMorale(moraleGain)
    Career.addFame(fameGain)
    -- 关键球：分差 ≤3 的胜场，记一次（「关键先生」徽章线）
    if win and (s.myScore - s.oppScore) <= 3 then
        Career.noteClutchShot()
    end

    -- 徽章统计累加（操作模式能拿到抢断/盖帽细分数据）
    state.totalSteals = (state.totalSteals or 0) + (s.stats.steals or 0)
    state.totalBlocks = (state.totalBlocks or 0) + (s.stats.blocks or 0)
    state.totalAssists = (state.totalAssists or 0) + math.floor(s.myPoints / 4)
    -- 铁人徽章：未受伤完赛
    if (state.injuryDays or 0) <= 0 then
        state.cleanGames = (state.cleanGames or 0) + 1
    end
    -- 连续出战累积（推高伤病风险，休息/轮空周自动衰减）
    state.fatigueStreak = (state.fatigueStreak or 0) + 1

    -- 战报展示本场基础收益；可选复盘广告另行奖励经验。
    result.rewardMorale = moraleGain
    result.rewardFame = fameGain

    state.lastResult = result

    -- 比赛后检查徽章解锁
    local CareerMod = require("Core.Career")
    local Badges = require("Data.Badges")
    local newBadges = Badges.check(state)
    for i = 1, #newBadges do
        local def = Badges.BY_ID[newBadges[i]]
        if def then
            CareerMod.addLog(string.format("★ 解锁徽章【%s】：%s", def.name, def.desc))
        end
    end
    result.newBadges = newBadges

    print(string.format("[Match] 结束 %s | 我 %d : %d 敌 | 个人 %d 分 | 命中 %d/%d",
        s.opponent, s.myScore, s.oppScore, s.myPoints, s.stats.made, s.stats.attempted))

    Match.session = nil
    return result
end

return Match
