-- ============================================================================
-- MatchText — 文字直播比赛模式
-- 四节制比分推演 + 逐条解说流 + 关键回合决策卡
-- 与 Match（操作模式）并列，由 Career.matchMode 决定用哪个
-- ============================================================================

local Config = require("Core.Config")
local Teams = require("Data.Teams")
local MiniGame = require("Core.MiniGame")
local Transfer = require("Core.Transfer")
local Career = require("Core.Career")
local Teammates = require("Core.Teammates")
local Rival = require("Core.Rival")
local Commentary = require("Data.Commentary")

local MatchText = {}

-- ---------------------------------------------------------------------------
-- 解说文案池（数据引自 Data/Commentary.lua，本模块只负责编排）
-- ---------------------------------------------------------------------------

local LINES = Commentary.TEXT
local DECISION_TEMPLATES = Commentary.DECISIONS

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

--- 依据分差与时间挑选"普通回合"的解说池
--- 新增池（clutch/blowout/comeback/defense/crowd）的实际使用点；
--- 返回的条目仍然以 kind = "normal" 写入时间线，界面配色与推进逻辑完全不变
---@param name string
---@param diff number   已完成各节的净胜分（正数表示领先）
---@param quarter number
---@param minute number
---@return string
local function pickFlowLine(name, diff, quarter, minute)
    local absDiff = diff < 0 and -diff or diff
    local roll = math.random()

    -- 决胜阶段且比分胶着：关键时刻文案
    if quarter >= 4 and minute >= 40 and absDiff <= 8 then
        if roll < 0.60 then return pickLine(LINES.clutch, name) end
    -- 分差过大：大比分文案
    elseif absDiff >= 15 then
        if roll < 0.55 then return pickLine(LINES.blowout, name) end
    -- 分差可控且非第一节：追分/拉锯文案
    elseif quarter >= 2 and absDiff <= 10 then
        if roll < 0.30 then return pickLine(LINES.comeback, name) end
    end

    if roll < 0.18 then return pickLine(LINES.defense, name) end
    if roll < 0.30 then return pickLine(LINES.crowd, name) end
    return pickLine(LINES.normal, name)
end

-- ---------------------------------------------------------------------------
-- 决策点模板（数据见 Data/Commentary.lua 的 Commentary.DECISIONS，按 minute 升序）
-- 类型 TextDecision / TextDecisionOption 也在该文件中定义
-- ---------------------------------------------------------------------------
-- 会话
-- ---------------------------------------------------------------------------

---@class TextSession
---@field opponent string
---@field myQuarters number[]
---@field oppQuarters number[]
---@field myTotal number            球队总得分（可被决策实时改写）
---@field oppTotal number           对手总得分（可被决策实时改写）
---@field myPoints number
---@field timeline table[]
---@field cursor number
---@field decisions TextDecision[]
---@field decisionsMade table[]
---@field pendingDecision TextDecision|nil
---@field finished boolean
---@field highlights string[]
---@field moraleFactor number        士气系数（决策成功时用于改写比分）
---@field derivedSteals number|nil   由成功的防守决策折算出的抢断数
---@field derivedAssists number|nil  由成功的组织决策折算出的助攻数

---@type TextSession|nil
MatchText.session = nil

-- ---------------------------------------------------------------------------
-- 比分口径
--
-- 界面（ScreenMatchText.scoreAt）按分钟线性摊平每节推演总分来显示记分牌。
-- 决策卡上的比分必须走同一口径，否则卡面写着"落后"、记分牌却是领先 ——
-- 这正是玩家反馈的"文字直播的选择和大比分没啥关系"的来源之一。
-- ---------------------------------------------------------------------------

--- 比赛进行到 minute 分钟时的比分
---@param s TextSession
---@param minute number
---@return number my
---@return number opp
local function scoresAt(s, minute)
    local my, opp = 0, 0
    local q = math.floor(minute / 12)
    if q > 4 then q = 4 end
    for i = 1, q do
        my = my + (s.myQuarters[i] or 0)
        opp = opp + (s.oppQuarters[i] or 0)
    end
    -- 当前节按分钟线性推进
    if q < 4 then
        local frac = (minute - q * 12) / 12
        my = my + math.floor((s.myQuarters[q + 1] or 0) * frac)
        opp = opp + math.floor((s.oppQuarters[q + 1] or 0) * frac)
    end
    return my, opp
end

--- 把决策卡文案里的 %s 占位符换成实时比分
---@param dec TextDecision
---@param s TextSession
---@return string
local function decisionBody(dec, s)
    local my, opp = scoresAt(s, dec.minute)
    return string.format(dec.body, string.format("%d:%d", my, opp))
end

--- 开始一场文字直播比赛
---@param state CareerState
---@param stage StageDef
---@return TextSession
function MatchText.start(state, stage)
    local cfg = Config.MATCH
    -- 兜底：stage 未传时按当前年龄推断（与 Match.start 保持一致）
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
    local CareerMod = require("Core.Career")
    local ma = CareerMod.matchAttrs()
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

    -- 球队档次影响队友水平（与操作模式保持一致）
    local myTeamPower = (Transfer.teamStrength(state, stage) + (overall - 40) * 0.55) * tacticOff * tacticDef
    -- 队友系统：化学反应 + 羁绊 + 性格特长 → 球队实力加减（与操作模式同一公式）
    myTeamPower = myTeamPower + Teammates.teamPowerBonus(state)

    -- 对手来自赛季赛程（与操作模式一致）
    local game = Career.getGameThisWeek()
    local opponent = game and game.opponent or Teams.randomOpponent(stage.id)
    -- 宿敌之战：打宿敌所在球队时对手强度上浮
    local oppPower = (game and game.strength or (stage.teamStrength + math.random(-10, 10)))
        + Rival.matchBoost(state, opponent)

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

    -- 从决策池里挑本场真正要用的几个：每节 1~2 个。
    -- 此前是把池里所有决策点按 minute 全部塞进比赛，22 个决策会淹没解说，
    -- 一场球变成"做选择题"，直播感就没了。
    ---@type TextDecision[]
    local chosen = {}
    do
        ---@type TextDecision[]
        local pool = {}
        for i = 1, #DECISION_TEMPLATES do pool[i] = DECISION_TEMPLATES[i] end
        for i = #pool, 2, -1 do
            local j = math.random(1, i)
            pool[i], pool[j] = pool[j], pool[i]
        end
        local want = cfg.quarters * (1 + math.random(0, 1))
        if want > #pool then want = #pool end
        for i = 1, want do chosen[i] = pool[i] end
        table.sort(chosen, function(l, r) return l.minute < r.minute end)
    end

    local quarterStarts = { 0, 12, 24, 36 }
    local decisionIdx = 1
    -- 已完成各节的净胜分（正数领先），用于挑选与局势相符的解说池
    ---@type number
    local runningDiff = 0

    for q = 1, cfg.quarters do
        local qStart = quarterStarts[q]
        local lineCount = 4 + math.random(0, 2)
        for i = 1, lineCount do
            local minute = qStart + math.floor((i / (lineCount + 1)) * 12)

            local dec = chosen[decisionIdx]
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
                table.insert(timeline, { minute = minute, kind = "normal",
                    text = pickFlowLine(state.name, runningDiff, q, minute) })
            end
        end

        -- 累计本节净胜分，供后续几节挑选解说池
        runningDiff = runningDiff + (myQuarters[q] or 0) - (oppQuarters[q] or 0)

        -- 只记录节次，比分留到播放时现算：决策会改写本节得分，
        -- 生成时就烘焙比分会播出一个和记分牌对不上的旧值。
        if LINES.quarter_end[q] then
            table.insert(timeline, {
                minute = qStart + 12,
                kind = "quarter_end",
                quarter = q,
            })
        end
    end

    while decisionIdx <= #chosen do
        local dec = chosen[decisionIdx]
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
        decisions = chosen,
        decisionsMade = {},
        pendingDecision = nil,
        finished = false,
        highlights = highlights,
        moraleFactor = moraleFactor,
    }

    MatchText.session = session
    print(string.format("[MatchText] 开始 %s vs %s | 我方 %d : %d", state.team, opponent, myTotal, oppTotal))
    return session
end

--- 比赛进行到 minute 分钟时的比分（界面记分牌与决策卡共用同一口径）
---@param minute number
---@return number my
---@return number opp
function MatchText.scoreAt(minute)
    local s = MatchText.session
    if not s then return 0, 0 end
    return scoresAt(s, minute)
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
        -- body 里的 %s 在这里替换成实时比分：决策卡面与记分牌同源，不会再出现
        -- "卡上说落后、记分牌却领先"的割裂。
        ---@type TextDecision
        local shown = {
            minute = dec.minute,
            title = dec.title,
            body = decisionBody(dec, s),
            options = dec.options,
        }
        return { kind = "decision", decision = shown, minute = entry.minute }
    end

    -- 节间解说：本节比分现算，把决策带来的改动算进去
    if entry.kind == "quarter_end" then
        local q = entry.quarter
        local qLine = LINES.quarter_end[q] or "本节结束。"
        return {
            kind = "quarter_end",
            text = string.format("%s 本节比分 %d : %d。",
                qLine, s.myQuarters[q] or 0, s.oppQuarters[q] or 0),
            minute = entry.minute,
        }
    end

    return { kind = entry.kind, text = entry.text, minute = entry.minute }
end

--- 做出决策
---
--- 决策会实时改写比分：成功的进攻选项给自己加分，成功的防守选项直接掐掉对手
--- 一次进攻，失败的选项则送给对手一次转换机会。这是"选择影响大比分"的实现点 ——
--- 此前 decide 只往 myPoints 里加分，球队总分（决定胜负）完全不受选择影响，
--- 玩家怎么点都不会输，选择也就失去了意义。
---@param optionIndex number
---@return table { text, success, points, myDelta, oppDelta }
function MatchText.decide(optionIndex)
    local s = MatchText.session
    if not s or not s.pendingDecision then
        return { text = "", success = false, points = 0, myDelta = 0, oppDelta = 0 }
    end

    local dec = s.pendingDecision
    local opt = dec.options[optionIndex]
    s.pendingDecision = nil

    if not opt then
        return { text = "", success = false, points = 0, myDelta = 0, oppDelta = 0 }
    end

    local CareerMod = require("Core.Career")
    local state = CareerMod.state
    local attrVal = 30
    if state then
        -- 走 matchAttrs：徽章被动加成要进比赛判定
        local ma = CareerMod.matchAttrs()
        attrVal = ma[opt.attrKey] or 30
    end

    -- 成功率 35% ~ 88%
    local rate = 0.35 + (attrVal / 100) * 0.53
    if rate > 0.92 then rate = 0.92 end

    local success = math.random() < rate
    local points = 0
    local myDelta, oppDelta = 0, 0
    -- 决策点落在哪一节，就把比分改动记进哪一节（记分牌按节推演）
    local quarter = math.floor(dec.minute / 12) + 1
    if quarter < 1 then quarter = 1 end
    if quarter > 4 then quarter = 4 end

    ---@type string
    local text
    if success then
        if opt.attrKey == "defense" then
            -- 防守成功：对手这一次进攻被破坏，直接扣掉他们的分数
            oppDelta = -math.random(2, 3)
            s.oppQuarters[quarter] = math.max(0, (s.oppQuarters[quarter] or 0) + oppDelta)
            s.oppTotal = math.max(0, s.oppTotal + oppDelta)
            text = string.format("【%s】成功！你掐掉了对手这一攻，对方的势头被打断。", opt.text)
        else
            points = math.random(2, 4)
            -- 士气参与加成，与 Match.start 的 moraleFactor 同一口径
            local gain = math.floor(points * (s.moraleFactor or 1.0) + 0.5)
            if gain < 1 then gain = 1 end
            points = gain
            myDelta = gain
            s.myQuarters[quarter] = (s.myQuarters[quarter] or 0) + gain
            s.myTotal = s.myTotal + gain
            text = string.format("【%s】成功！你拿下 %d 分，全场沸腾。", opt.text, gain)
        end
    else
        -- 失败：球权转换，对手反击得手
        oppDelta = math.random(2, 3)
        s.oppQuarters[quarter] = (s.oppQuarters[quarter] or 0) + oppDelta
        s.oppTotal = s.oppTotal + oppDelta
        text = string.format("【%s】没能打成，对手抓住机会反击得手 +%d 分。", opt.text, oppDelta)
    end

    table.insert(s.decisionsMade, {
        minute = dec.minute, option = opt.text, success = success,
        points = points, myDelta = myDelta, oppDelta = oppDelta,
    })
    s.myPoints = s.myPoints + points

    if success and state then
        -- 关键球记进高光，赛后战报能看到
        table.insert(s.highlights, string.format("%d' %s", dec.minute, text))
        -- 文字直播没有逐回合明细，用成功的防守/组织决策折算防守数据，
        -- 否则「防守铁闸」徽章线在文字直播模式下永远不涨。
        if opt.attrKey == "defense" then
            s.derivedSteals = (s.derivedSteals or 0) + 1
        elseif opt.attrKey == "playmaking" then
            s.derivedAssists = (s.derivedAssists or 0) + 1
        end
    end

    print(string.format("[MatchText] 决策 %d' %s | %s | 我方 %+d 对手 %+d | 当前 %d : %d",
        dec.minute, opt.text, success and "成功" or "失败", myDelta, oppDelta, s.myTotal, s.oppTotal))

    return { text = text, success = success, points = points, myDelta = myDelta, oppDelta = oppDelta }
end

--- 结算并写入生涯状态
---@param state CareerState
---@return table result
function MatchText.finish(state)
    local s = MatchText.session
    if not s then
        return { win = false, myPoints = 0, oppPoints = 0, teamPoints = 0, summary = "", highlights = {} }
    end

    -- 决策会改写 myTotal，个人得分是它的子集，必须重新夹紧
    local myPoints = s.myPoints
    if myPoints > s.myTotal then myPoints = s.myTotal end
    if myPoints < 0 then myPoints = 0 end
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

    local moraleGain = 0
    local fameGain = 0
    if win then
        moraleGain = 6
        fameGain = math.floor(myPoints / 3)
    else
        moraleGain = -5
    end
    -- 走 Career 入口，让徽章的人气/士气上限与百分比加成生效
    local CareerMod = require("Core.Career")
    CareerMod.addMorale(moraleGain)
    CareerMod.addFame(fameGain)
    -- 关键球：分差 ≤3 的胜场记一次（「关键先生」徽章线）
    if win and (s.myTotal - s.oppTotal) <= 3 then
        CareerMod.noteClutchShot()
    end

    -- 徽章统计累加（文字直播无逐回合数据，按得分 + 防守决策折算）
    state.totalAssists = (state.totalAssists or 0)
        + math.floor(myPoints / 4) + (s.derivedAssists or 0)
    state.totalSteals = (state.totalSteals or 0) + (s.derivedSteals or 0)
    if (state.injuryDays or 0) <= 0 then
        state.cleanGames = (state.cleanGames or 0) + 1
    end
    -- 连续出战累积（推高伤病风险，休息/轮空周自动衰减）
    state.fatigueStreak = (state.fatigueStreak or 0) + 1

    -- 记进结果里：战报页的广告可以再给一份（人气双倍）
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

    print(string.format("[MatchText] 结束 %s | 我 %d : %d 敌 | 个人 %d 分",
        s.opponent, s.myTotal, s.oppTotal, myPoints))

    MatchText.session = nil
    return result
end

return MatchText
