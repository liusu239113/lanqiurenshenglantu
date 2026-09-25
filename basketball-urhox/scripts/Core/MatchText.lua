-- ============================================================================
-- MatchText — 文字直播比赛模式
-- 四节制比分推演 + 逐条解说流 + 关键回合决策卡
-- 与 Match（操作模式）并列，由 Career.matchMode 决定用哪个
-- ============================================================================

local Config = require("Core.Config")
local Teams = require("Data.Teams")
local MiniGame = require("Core.MiniGame")

local MatchText = {}

-- ---------------------------------------------------------------------------
-- 解说文案池
-- ---------------------------------------------------------------------------

local LINES = {
    normal = {
        "%s 在弧顶持球，观察着防守的站位。",
        "球在外线快速转移，防守阵型被拉扯开。",
        "%s 借掩护切出，接球后面框三威胁。",
        "双方在这一回合都加强了身体对抗。",
        "%s 退到后场，指挥队友落位。",
        "进攻时间还剩 8 秒，球交到了 %s 手里。",
        "%s 在低位要到位置，背身单打。",
        "防守强度上来了，这一节双方都在拼。",
        "教练在场边大声提醒着防守轮转。",
        "%s 快速推进到前场，寻找快攻机会。",
    },
    score_my = {
        "%s 中距离跳投，球稳稳落袋。",
        "%s 突破上篮，身体对抗后把球放进篮筐。",
        "%s 底角三分出手——空心入网！",
        "%s 抢下前场篮板，二次进攻打成。",
        "%s 接队友传球，空切上篮得手。",
        "%s 在罚球线附近抛投命中。",
        "%s 强打造成犯规，两罚全中。",
        "%s 快攻中接长传，双手扣篮！",
    },
    score_opp = {
        "对手外线连续传导，找到空位三分机会。",
        "对方中锋在篮下强打，勾手命中。",
        "对手打出快速反击，上篮得手。",
        "对方后卫变向突破，抛投打进。",
        "对手抢断后一条龙，暴扣得分。",
        "对方底角三分命中，分差被拉开。",
    },
    highlight = {
        "%s 从弱侧飞身而来，一记追身大帽扇飞了对手的上篮！",
        "%s 在三人包夹中把球分到底角，助攻队友命中三分！",
        "%s 连续胯下运球晃开防守人，后撤步跳投命中！",
        "%s 抢断成功，一条龙快攻战斧式劈扣！",
        "%s 在最后时刻高高跃起，把对手的投篮钉在篮板上！",
    },
    quarter_end = {
        "第一节结束，双方都还在试探。",
        "半场哨响，球员们走向更衣室。",
        "第三节结束，比赛进入白热化。",
    },
}

--- 随机取一条并填充球员名
---@param pool string[]
---@param name string
---@return string
local function pickLine(pool, name)
    if #pool == 0 then return "" end
    local line = pool[math.random(1, #pool)]
    if line == nil then return "" end
    return string.format(line, name)
end

-- ---------------------------------------------------------------------------
-- 决策点模板
-- ---------------------------------------------------------------------------

---@class TextDecisionOption
---@field text string
---@field attrKey string

---@class TextDecision
---@field minute number
---@field title string
---@field body string
---@field options TextDecisionOption[]

---@type TextDecision[]
local DECISION_TEMPLATES = {
    {
        minute = 10,
        title = "第一节 · 进攻选择",
        body = "你在弧顶持球，防守人贴得很紧，内线有一个空档。",
        options = {
            { text = "强突内线，自己终结", attrKey = "athletic" },
            { text = "击地传球给切入的队友", attrKey = "playmaking" },
            { text = "后撤步三分出手", attrKey = "scoring" },
        },
    },
    {
        minute = 22,
        title = "第二节 · 防守回合",
        body = "对方核心持球单打，全队都在看你如何应对。",
        options = {
            { text = "贴身紧逼，逼迫他失误", attrKey = "defense" },
            { text = "放一步，赌他的投篮", attrKey = "iq" },
            { text = "呼叫队友包夹", attrKey = "playmaking" },
        },
    },
    {
        minute = 34,
        title = "第四节 · 决胜时刻",
        body = "比赛还剩最后几分钟，分差很小。球权在你手上。",
        options = {
            { text = "自己来，扛起球队", attrKey = "scoring" },
            { text = "吸引包夹，为队友创造机会", attrKey = "playmaking" },
            { text = "稳住节奏，打成功率", attrKey = "iq" },
        },
    },
}

-- ---------------------------------------------------------------------------
-- 会话
-- ---------------------------------------------------------------------------

---@class TextSession
---@field opponent string
---@field myQuarters number[]
---@field oppQuarters number[]
---@field myTotal number
---@field oppTotal number
---@field myPoints number
---@field timeline table[]
---@field cursor number
---@field decisions TextDecision[]
---@field decisionsMade table[]
---@field pendingDecision TextDecision|nil
---@field finished boolean
---@field win boolean
---@field highlights string[]

---@type TextSession|nil
MatchText.session = nil

--- 开始一场文字直播比赛
---@param state CareerState
---@param stage StageDef
---@return TextSession
function MatchText.start(state, stage)
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

    local myTeamPower = (stage.teamStrength + (overall - 40) * 0.55) * tacticOff * tacticDef
    local oppPower = stage.teamStrength + math.random(-10, 10)
    local opponent = Teams.randomOpponent(stage.id)

    -- 逐节比分推演
    ---@type number[]
    local myQuarters = {}
    ---@type number[]
    local oppQuarters = {}
    local myTotal, oppTotal = 0, 0
    local powerRatio = myTeamPower / (myTeamPower + oppPower)

    for _ = 1, cfg.quarters do
        local qBase = 22 + math.random(-5, 5)
        local myQ = math.floor(qBase * powerRatio * 2 + math.random(-3, 3))
        local oppQ = math.floor(qBase * (1 - powerRatio) * 2 + math.random(-3, 3))
        if myQ < 12 then myQ = 12 + math.random(0, 5) end
        if oppQ < 12 then oppQ = 12 + math.random(0, 5) end
        table.insert(myQuarters, myQ)
        table.insert(oppQuarters, oppQ)
        myTotal = myTotal + myQ
        oppTotal = oppTotal + oppQ
    end

    -- 个人得分预估（受属性/体能/士气影响）
    local a = state.attrs
    local staminaFactor = 0.6 + (state.stamina / 100) * 0.4
    local moraleFactor = 0.88 + (state.morale / 100) * 0.24
    local stageFactor = 0.85 + stage.teamStrength / 400.0
    local myPoints = math.floor((a.scoring or 25) * 0.42 * staminaFactor * moraleFactor * stageFactor + math.random(-6, 8) + 0.5)
    if myPoints < 0 then myPoints = 0 end
    if myPoints > myTotal then myPoints = myTotal end

    -- 构建时间线
    ---@type table[]
    local timeline = {}
    ---@type string[]
    local highlights = {}

    table.insert(timeline, { minute = 0, kind = "tipoff",
        text = string.format("跳球！%s 对阵 %s 的比赛正式开始。", state.team, opponent) })

    local quarterStarts = { 0, 12, 24, 36 }
    local decisionIdx = 1

    for q = 1, cfg.quarters do
        local qStart = quarterStarts[q]
        local lineCount = 4 + math.random(0, 2)
        for i = 1, lineCount do
            local minute = qStart + math.floor((i / (lineCount + 1)) * 12)

            local dec = DECISION_TEMPLATES[decisionIdx]
            if dec and minute >= dec.minute then
                table.insert(timeline, { minute = dec.minute, kind = "decision", decisionIndex = decisionIdx })
                decisionIdx = decisionIdx + 1
            end

            local roll = math.random()
            if roll < 0.22 then
                local line = pickLine(LINES.highlight, state.name)
                table.insert(timeline, { minute = minute, kind = "highlight", text = line })
                table.insert(highlights, line)
            elseif roll < 0.42 then
                table.insert(timeline, { minute = minute, kind = "score_my", text = pickLine(LINES.score_my, state.name) })
            elseif roll < 0.60 then
                table.insert(timeline, { minute = minute, kind = "score_opp", text = pickLine(LINES.score_opp, state.name) })
            else
                table.insert(timeline, { minute = minute, kind = "normal", text = pickLine(LINES.normal, state.name) })
            end
        end

        local qLine = LINES.quarter_end[q]
        if qLine then
            table.insert(timeline, {
                minute = qStart + 12,
                kind = "quarter_end",
                text = string.format("%s 本节比分 %d : %d。", qLine, myQuarters[q], oppQuarters[q]),
            })
        end
    end

    while decisionIdx <= #DECISION_TEMPLATES do
        local dec = DECISION_TEMPLATES[decisionIdx]
        table.insert(timeline, { minute = dec.minute, kind = "decision", decisionIndex = decisionIdx })
        decisionIdx = decisionIdx + 1
    end

    table.insert(timeline, { minute = 48, kind = "final", text = "终场哨响！" })

    table.sort(timeline, function(l, r)
        if l.minute == r.minute then return false end
        return l.minute < r.minute
    end)

    ---@type TextSession
    local session = {
        opponent = opponent,
        myQuarters = myQuarters,
        oppQuarters = oppQuarters,
        myTotal = myTotal,
        oppTotal = oppTotal,
        myPoints = myPoints,
        timeline = timeline,
        cursor = 1,
        decisions = DECISION_TEMPLATES,
        decisionsMade = {},
        pendingDecision = nil,
        finished = false,
        win = myTotal > oppTotal,
        highlights = highlights,
    }

    MatchText.session = session
    print(string.format("[MatchText] 开始 %s vs %s | 我方 %d : %d", state.team, opponent, myTotal, oppTotal))
    return session
end

--- 取下一个直播事件
---@return table|nil
function MatchText.next()
    local s = MatchText.session
    if not s then return nil end

    if s.cursor > #s.timeline then
        s.finished = true
        return nil
    end

    local entry = s.timeline[s.cursor]
    s.cursor = s.cursor + 1

    if entry == nil then
        s.finished = true
        return nil
    end

    if entry.kind == "decision" then
        local dec = s.decisions[entry.decisionIndex]
        s.pendingDecision = dec
        return { kind = "decision", decision = dec, minute = entry.minute }
    end

    return { kind = entry.kind, text = entry.text, minute = entry.minute }
end

--- 做出决策
---@param optionIndex number
---@return table { text, success, points }
function MatchText.decide(optionIndex)
    local s = MatchText.session
    if not s or not s.pendingDecision then
        return { text = "", success = false, points = 0 }
    end

    local dec = s.pendingDecision
    local opt = dec.options[optionIndex]
    s.pendingDecision = nil

    if not opt then
        return { text = "", success = false, points = 0 }
    end

    local state = require("Core.Career").state
    local attrVal = 30
    if state then
        attrVal = state.attrs[opt.attrKey] or 30
    end

    -- 成功率 35% ~ 88%
    local rate = 0.35 + (attrVal / 100) * 0.53
    if rate > 0.92 then rate = 0.92 end

    local success = math.random() < rate
    local points = 0
    ---@type string
    local text
    if success then
        points = math.random(2, 4)
        text = string.format("【%s】成功！你拿下 %d 分，全场沸腾。", opt.text, points)
    else
        text = string.format("【%s】没能打成，但你的态度赢得了掌声。", opt.text)
    end

    table.insert(s.decisionsMade, {
        minute = dec.minute, option = opt.text, success = success, points = points,
    })
    s.myPoints = s.myPoints + points

    return { text = text, success = success, points = points }
end

--- 结算并写入生涯状态
---@param state CareerState
---@return table result
function MatchText.finish(state)
    local s = MatchText.session
    if not s then
        return { win = false, myPoints = 0, oppPoints = 0, teamPoints = 0, summary = "", highlights = {} }
    end

    local myPoints = s.myPoints
    if myPoints > s.myTotal then myPoints = s.myTotal end
    local win = s.myTotal > s.oppTotal

    ---@type string
    local summary
    if win then
        summary = string.format("对阵 %s，%d:%d 取胜，你得到 %d 分。", s.opponent, s.myTotal, s.oppTotal, myPoints)
    else
        summary = string.format("对阵 %s，%d:%d 落败，你得到 %d 分。", s.opponent, s.myTotal, s.oppTotal, myPoints)
    end

    ---@type table
    local result = {
        opponent = s.opponent,
        win = win,
        myPoints = myPoints,
        oppPoints = s.oppTotal,
        teamPoints = s.myTotal,
        myQuarterScores = s.myQuarters,
        oppQuarterScores = s.oppQuarters,
        highlights = s.highlights,
        decisions = s.decisionsMade,
        summary = summary,
    }

    -- 状态结算
    state.games = state.games + 1
    state.seasonGames = state.seasonGames + 1
    state.seasonPoints = state.seasonPoints + myPoints
    state.totalPoints = state.totalPoints + myPoints
    state.stamina = math.max(0, state.stamina - Config.SEASON.gameStaminaCost)

    if win then
        state.morale = math.min(100, state.morale + 6)
        state.fame = state.fame + math.floor(myPoints / 3)
    else
        state.morale = math.max(0, state.morale - 5)
    end

    state.lastResult = result

    print(string.format("[MatchText] 结束 %s | 我 %d : %d 敌 | 个人 %d 分",
        s.opponent, s.myTotal, s.oppTotal, myPoints))

    MatchText.session = nil
    return result
end

return MatchText
