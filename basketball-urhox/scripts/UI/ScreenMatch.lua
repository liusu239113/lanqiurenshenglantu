-- ============================================================================
-- ScreenMatch — 比赛文字直播界面
-- 顶部比分条 + 滚动解说流 + 关键回合决策
-- 自动推进由 ScreenMatch.tick(dt) 驱动（Main 订阅 Update 调用）
-- ============================================================================

local UI = require("urhox-libs/UI")
local Config = require("Core.Config")
local Match = require("Core.Match")
local Career = require("Core.Career")
local Audio = require("Core.Audio")
local Common = require("UI.Common")

local ScreenMatch = {}

local C = Config.COLORS

-- 解说条目配色（米黄纸底上用深色）
local KIND_COLOR = {
    tipoff      = { 200, 130, 0, 255 },
    normal      = { 60, 54, 48, 255 },
    score_my    = { 224, 62, 32, 255 },
    score_opp   = { 110, 100, 90, 255 },
    highlight   = { 198, 120, 0, 255 },
    quarter_end = { 28, 96, 168, 255 },
    final       = { 198, 120, 0, 255 },
}

-- 解说条目前缀
local KIND_ICON = {
    score_my  = "● ",
    score_opp = "○ ",
    highlight = "★ ",
    final     = "★ ",
}

-- 每条解说的自动推进间隔（秒）
local AUTO_INTERVAL = 0.75

-- ============================================================================
-- 直播运行时状态
-- ============================================================================

---@class LiveState
---@field finished boolean
---@field pendingAuto boolean
---@field autoTimer number
---@field myScore number
---@field oppScore number
---@field myScoreLabel Label
---@field oppScoreLabel Label
---@field minuteLabel Label
---@field feedPanel Panel
---@field feedScroll ScrollView
---@field decisionHolder Panel
---@field actionHolder Panel
---@field onFinish fun()
---@field state CareerState

---@type LiveState|nil
local live_ = nil

-- ============================================================================
-- 内部函数
-- ============================================================================

--- 按分钟推算当前比分
---@param minute number
---@return number, number
local function scoreAt(minute)
    local session = Match.session
    if not session then return 0, 0 end
    local my, opp = 0, 0
    local q = math.floor(minute / 12)
    for i = 1, q do
        my = my + (session.myQuarters[i] or 0)
        opp = opp + (session.oppQuarters[i] or 0)
    end
    return my, opp
end

--- 追加一条解说
---@param text string
---@param kind string
---@param minute number
local function appendLine(text, kind, minute)
    local L = live_
    if not L then return end
    local color = KIND_COLOR[kind] or C.textSub
    local icon = KIND_ICON[kind] or ""
    local isBig = (kind == "highlight" or kind == "final")

    L.feedPanel:AddChild(UI.Panel {
        width = "100%",
        flexDirection = "row",
        gap = 8,
        alignItems = "flex-start",
        children = {
            UI.Label {
                text = string.format("%d'", minute),
                fontSize = 11,
                fontColor = { 140, 128, 112, 255 },
                width = 30,
                flexShrink = 0,
            },
            UI.Label {
                text = icon .. text,
                fontSize = isBig and 15 or 13,
                fontWeight = isBig and "bold" or "normal",
                fontColor = color,
                whiteSpace = "normal",
                lineHeight = 1.5,
                -- 在 row 中必须显式占满剩余宽度，否则宽度塌陷导致文字不可见
                flexGrow = 1,
                flexBasis = 0,
            },
        },
    })

    L.feedScroll:ScrollToBottom()
end

--- 推进一条直播（前向声明）
local step

--- 显示决策卡
---@param dec Decision
local function showDecision(dec)
    local L = live_
    if not L then return end

    L.decisionHolder:ClearChildren()
    Audio.Play("whistle")

    ---@type table[]
    local optButtons = {}
    for i = 1, #dec.options do
        local opt = dec.options[i]
        local idx = i
        optButtons[i] = UI.Button {
            text = opt.text,
            width = "100%",
            height = 48,
            fontSize = 14,
            fontWeight = "bold",
            backgroundColor = C.bgCard,
            textColor = C.textMain,
            hoverBackgroundColor = C.primary,
            pressedBackgroundColor = C.primaryDark,
            borderRadius = 0,
            borderWidth = 2,
            borderColor = C.outlineSoft,
            onClick = function()
                Audio.Play("click")
                local res = Match.decide(idx)
                L.decisionHolder:ClearChildren()

                appendLine(res.text, res.success and "highlight" or "normal", dec.minute)

                if res.success then
                    Audio.Play("swish")
                    L.myScore = L.myScore + res.points
                    L.myScoreLabel:SetText(tostring(L.myScore))
                else
                    Audio.Play("rim")
                end

                -- 继续直播
                L.pendingAuto = true
                L.autoTimer = AUTO_INTERVAL
            end,
        }
    end

    L.decisionHolder:AddChild(UI.Panel {
        width = "100%",
        flexDirection = "column",
        gap = 10,
        padding = 16,
        backgroundColor = { 255, 244, 224, 255 },
        borderRadius = 0,
        borderWidth = 3,
        borderColor = C.accent,
        children = {
            UI.Label {
                text = dec.title,
                fontSize = 15,
                fontWeight = "bold",
                fontColor = C.accent,
                letterSpacing = 1,
            },
            UI.Label {
                text = dec.body,
                fontSize = 13,
                fontColor = C.textSub,
                whiteSpace = "normal",
                lineHeight = 1.5,
            },
            UI.Panel {
                flexDirection = "column",
                gap = 8,
                children = optButtons,
            },
        },
    })
end

--- 推进一条直播
step = function()
    local L = live_
    if not L or L.finished then return end

    local entry = Match.next()
    if not entry then
        -- 比赛结束
        L.finished = true
        local result = Match.finish(L.state)

        L.myScoreLabel:SetText(tostring(result.teamPoints))
        L.oppScoreLabel:SetText(tostring(result.oppPoints))
        L.minuteLabel:SetText("终场")

        L.actionHolder:ClearChildren()
        L.actionHolder:AddChild(Common.PrimaryButton(
            result.win and "胜 利 ！ 查 看 战 报" or "惜 败 · 查 看 战 报",
            function()
                Audio.Play(result.win and "win" or "click")
                local cb = L.onFinish
                live_ = nil
                cb()
            end))
        return
    end

    -- 更新时间
    if entry.minute then
        L.minuteLabel:SetText(string.format("%d'", entry.minute))
        local my, opp = scoreAt(entry.minute)
        if my > L.myScore then
            L.myScore = my
            L.myScoreLabel:SetText(tostring(my))
        end
        if opp > L.oppScore then
            L.oppScore = opp
            L.oppScoreLabel:SetText(tostring(opp))
        end
    end

    -- 决策点：停下等待玩家
    if entry.kind == "decision" and entry.decision then
        showDecision(entry.decision)
        return
    end

    -- 普通解说
    appendLine(entry.text or "", entry.kind or "normal", entry.minute or 0)

    if entry.kind == "highlight" then
        Audio.Play("dunk")
    elseif entry.kind == "score_my" then
        Audio.Play("swish", 0.8)
    elseif entry.kind == "final" then
        Audio.Play("whistle")
    end

    L.pendingAuto = true
    L.autoTimer = AUTO_INTERVAL
end

-- ============================================================================
-- 对外接口
-- ============================================================================

--- 每帧推进（由 Main 订阅 Update 事件调用）
---@param dt number
function ScreenMatch.tick(dt)
    local L = live_
    if not L or L.finished then return end
    if not L.pendingAuto then return end

    L.autoTimer = L.autoTimer - dt
    if L.autoTimer <= 0 then
        L.pendingAuto = false
        -- 等待玩家决策时不自动推进
        local session = Match.session
        if session and session.pendingDecision == nil then
            step()
        end
    end
end

--- 构建比赛界面
---@param state CareerState
---@param onFinish fun()
---@return Panel
function ScreenMatch.Build(state, onFinish)
    Audio.PlayBgm("battle")

    local session = Match.session
    if not session then
        onFinish()
        return UI.Panel { width = "100%", height = "100%" }
    end

    -- ---- 控件 ----
    local myScoreLabel = UI.Label {
        text = "0",
        fontSize = 40,
        fontWeight = "bold",
        fontColor = C.primary,
        textStroke = { width = 2, color = "#1a1c28" },
    }
    local oppScoreLabel = UI.Label {
        text = "0",
        fontSize = 40,
        fontWeight = "bold",
        fontColor = { 42, 122, 200, 255 },
        textStroke = { width = 2, color = "#1a1c28" },
    }
    local minuteLabel = UI.Label {
        text = "0'",
        fontSize = 14,
        fontWeight = "bold",
        fontColor = C.accent,
    }
    local feedPanel = UI.Panel {
        width = "100%",
        flexDirection = "column",
        gap = 10,
        padding = 16,
    }
    -- 解说流放在半透明纸底格内，保证文字在背景图上的可读性
    local feedScroll = UI.ScrollView {
        flexGrow = 1,
        flexBasis = 0,
        scrollY = true,
        showScrollbar = true,
        children = {
            UI.Panel {
                width = "100%",
                margin = 12,
                backgroundColor = { 255, 252, 244, 242 },
                borderWidth = 3,
                borderColor = C.outline,
                children = { feedPanel },
            },
        },
    }
    local decisionHolder = UI.Panel { width = "100%", flexDirection = "column" }
    local actionHolder = UI.Panel { width = "100%", flexDirection = "column" }

    -- 比分条
    local scoreboard = UI.Panel {
        width = "100%",
        padding = 14,
        backgroundColor = { 255, 252, 244, 255 },
        borderBottomWidth = 3,
        borderBottomColor = C.outline,
        children = {
            UI.Panel {
                flexDirection = "row",
                justifyContent = "center",
                alignItems = "center",
                gap = 14,
                children = {
                    UI.Panel {
                        flexGrow = 1, flexBasis = 0,
                        flexDirection = "column",
                        alignItems = "flex-end",
                        gap = 2,
                        children = {
                            UI.Label { text = state.team, fontSize = 12, fontColor = C.textSub },
                            myScoreLabel,
                        },
                    },
                    UI.Panel {
                        width = 70, flexShrink = 0,
                        flexDirection = "column",
                        alignItems = "center",
                        gap = 2,
                        children = {
                            minuteLabel,
                            UI.Label { text = "VS", fontSize = 11, fontWeight = "bold", fontColor = C.textSub },
                        },
                    },
                    UI.Panel {
                        flexGrow = 1, flexBasis = 0,
                        flexDirection = "column",
                        alignItems = "flex-start",
                        gap = 2,
                        children = {
                            UI.Label { text = session.opponent, fontSize = 12, fontColor = C.textSub },
                            oppScoreLabel,
                        },
                    },
                },
            },
        },
    }

    local stageBg = Career.getStage().bg

    local root = Common.Screen(stageBg, {
        scoreboard,
        feedScroll,
        UI.Panel {
            width = "100%",
            flexDirection = "column",
            gap = 10,
            padding = 14,
            backgroundColor = { 255, 252, 244, 255 },
            borderTopWidth = 3,
            borderTopColor = C.outline,
            children = { decisionHolder, actionHolder },
        },
    }, { dim = 0.5 })

    -- 建立运行时状态
    ---@type LiveState
    live_ = {
        finished = false,
        pendingAuto = false,
        autoTimer = 0,
        myScore = 0,
        oppScore = 0,
        myScoreLabel = myScoreLabel,
        oppScoreLabel = oppScoreLabel,
        minuteLabel = minuteLabel,
        feedPanel = feedPanel,
        feedScroll = feedScroll,
        decisionHolder = decisionHolder,
        actionHolder = actionHolder,
        onFinish = onFinish,
        state = state,
    }

    -- 开场
    appendLine(string.format("欢迎收看 %s 对阵 %s 的现场直播。", state.team, session.opponent), "tipoff", 0)
    live_.pendingAuto = true
    live_.autoTimer = 0.8

    return root
end

return ScreenMatch
