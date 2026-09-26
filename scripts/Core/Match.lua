-- ============================================================================
-- Match — 回合制操作比赛引擎
-- 玩家亲自打每一个回合：突破 → 投篮 / 防守读心
-- 比赛完全由操作驱动，没有文字直播、没有决策卡
-- ============================================================================

local Config = require("Core.Config")
local Teams = require("Data.Teams")
local MiniGame = require("Core.MiniGame")
local Transfer = require("Core.Transfer")

local Match = {}

-- ---------------------------------------------------------------------------
-- 回合结果文案
-- ---------------------------------------------------------------------------

local RESULT_TEXT = {
    shot_perfect = {
        "空心入网！全场沸腾。",
        "干拔三分，球应声入网！",
        "手起刀落，球网只轻轻一颤。",
    },
    shot_good = {
        "打板命中，稳稳拿下。",
        "上篮打进，身体对抗后把球放进。",
        "球在筐上弹了一下，还是进了。",
    },
    shot_miss = {
        "出手偏出，篮筐拒绝了你。",
        "球在篮筐上转了两圈，弹了出来。",
        "被干扰了，投篮短了。",
    },
    dribble_win = {
        "一个变向晃开防守，直杀篮下！",
        "重心骗过对手，突破成功！",
        "连续胯下运球，防守者跟不上节奏。",
    },
    dribble_lose = {
        "球被捅掉了，进攻失误。",
        "防守者识破了你的意图。",
        "运球被逼到边线，只能勉强出球。",
    },
    defend_win = {
        "判断精准，直接破坏进攻！",
        "你提前半步站住了位置。",
        "读穿了对手的意图，干净利落。",
    },
    defend_lose = {
        "判断错了方向，对手打进。",
        "被假动作骗开，对手轻松得分。",
        "慢了一拍，只能看着球进筐。",
    },
}

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
---@field steals number     防守成功数
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
    local out = math.floor(v * factor + 0.5)
    if out < 1 then out = 1 end
    return out
end

-- ---------------------------------------------------------------------------
-- 开始比赛
-- ---------------------------------------------------------------------------

--- 开始一场比赛
---@param state CareerState
---@param stage StageDef
---@return MatchSession
function Match.start(state, stage)
    local cfg = Config.MATCH

    -- 球队实力（含战术加成）
    local overall = 0
    for i = 1, #Config.ATTRS do
        local def = Config.ATTRS[i]
        overall = overall + (state.attrs[def.key] or 0)
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
    local oppPower = stage.teamStrength + math.random(-8, 8)

    local opponent = Teams.randomOpponent(stage.id)

    -- 难度随对手强度提升
    local difficulty = 0.85 + (stage.teamStrength / 100) * 0.55

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
        stats = { made = 0, attempted = 0, steals = 0, turnovers = 0 },
        finished = false,
        win = false,
        flashText = "",
        -- 基础得分区间（从配置读入，便于调参）
        myBaseMin = cfg.myBaseMin,
        myBaseMax = cfg.myBaseMax,
        oppBaseMin = cfg.oppBaseMin,
        oppBaseMax = cfg.oppBaseMax,
    }

    Match.session = s
    Match.addLog(s, string.format("跳球！%s 对阵 %s。", state.team, opponent))
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
        s.stats.steals = s.stats.steals + 1
        s.flashText = pick(RESULT_TEXT.defend_win)
        table.insert(s.highlights, string.format("%s 识破对手的%s，直接破坏进攻！", state.name, actualName))
        Match.addLog(s, string.format("防守成功，破坏对手的%s。", actualName))
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
    state.morale = math.max(0, math.min(100, state.morale + moraleGain))
    state.fame = math.max(0, state.fame + fameGain)

    -- 记进结果里：战报页的广告可以再给一份（人气双倍）
    result.rewardMorale = moraleGain
    result.rewardFame = fameGain

    state.lastResult = result

    print(string.format("[Match] 结束 %s | 我 %d : %d 敌 | 个人 %d 分 | 命中 %d/%d",
        s.opponent, s.myScore, s.oppScore, s.myPoints, s.stats.made, s.stats.attempted))

    Match.session = nil
    return result
end

return Match
