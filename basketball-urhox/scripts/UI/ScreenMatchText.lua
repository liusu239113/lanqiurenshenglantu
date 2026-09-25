-- ============================================================================
-- ScreenMatchText — 文字直播比赛界面
-- 逐条解说流 + 关键回合决策卡（热血漫画分镜风）
-- 由 ScreenMatchText.tick(dt) 每帧驱动
-- ============================================================================

local UI = require("urhox-libs/UI")
local Config = require("Core.Config")
local MatchText = require("Core.MatchText")
local Career = require("Core.Career")
local Audio = require("Core.Audio")
local Common = require("UI.Common")

local ScreenMatchText = {}

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

local KIND_ICON = {
    score_my  = "● ",
    score_opp = "○ ",
    highlight = "★ ",
    final     = "★ ",
}

-- 自动推进间隔（秒）
local AUTO_INTERVAL = 0.8

-- ---------------------------------------------------------------------------
-- 运行时
-- ---------------------------------------------------------------------------

---@class TextUI
---@field state CareerState
---@field onFinish fun()
---@field myScoreLabel Label
---@field oppScoreLabel Label
---@field minuteLabel Label
---@field feedPanel Panel
---@field feedScroll ScrollView
---@field decisionHolder Panel
---@field actionHolder Panel
---@field pendingAuto boolean
---@field autoTimer number
---@field finished boolean

---@type TextUI|nil
local ui_ = nil

--- 按分钟推算当前比分
---@param minute number
---@return number, number
local function scoreAt(minute)
    local s = MatchText.session
    if not s then return 0, 0 end
    local my, opp = 0, 0
    local q = math.floor(minute / 12)
    for i = 1, q do
        my = my + (s.myQuarters[i] or 0)
        opp = opp + (s.oppQuarters[i] or 0)
    end
    return my, opp
end

--- 追加一条解说
---@param text string
---@param kind string
---@param minute number
local function appendLine(text, kind, minute)
    local L = ui_
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
                fontWeight = "bold",
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
                flexGrow = 1,
                flexBasis = 0,
            },
        },
    })

    L.feedScroll:ScrollToBottom()
end

--- 推进一条（前向声明）
---@type fun()|nil
local step

--- 显示决策卡
---@param dec TextDecision
local function showDecision(dec)
    local L = ui_
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
            height = 50,
            fontSize = 14,
            fontWeight = "bold",
            backgroundColor = C.bgCardLight,
            textColor = C.textMain,
            hoverBackgroundColor = C.primary,
            pressedBackgroundColor = C.primaryDark,
            borderWidth = 3,
            borderColor = C.outline,
            onClick = function()
                Audio.Play("click")
                local res = MatchText.decide(idx)
                L.decisionHolder:ClearChildren()

                appendLine(res.text, res.success and "highlight" or "normal", dec.minute)
                if res.success then
                    Audio.Play("swish")
                    L.myScoreLabel:SetText(tostring((tonumber(L.myScoreLabel:GetText()) or 0) + res.points))
                else
                    Audio.Play("rim")
                end

                L.pendingAuto = true
                L.autoTimer = AUTO_INTERVAL
            end,
        }
    end

    L.decisionHolder:AddChild(UI.Panel {
        width = "100%",
        flexDirection = "column",
        gap = 10,
        padding = 14,
        backgroundColor = { 255, 244, 224, 255 },
        borderWidth = 3,
        borderColor = C.outline,
        children = {
            UI.Label {
                text = dec.title,
                fontSize = 15,
                fontWeight = "bold",
                fontColor = C.primary,
                letterSpacing = 1,
            },
            UI.Label {
                text = dec.body,
                fontSize = 13,
                fontColor = C.textMain,
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
    local L = ui_
    if not L or L.finished then return end

    local entry = MatchText.next()
    if not entry then
        -- 比赛结束
        L.finished = true
        local result = MatchText.finish(L.state)

        L.myScoreLabel:SetText(tostring(result.teamPoints))
        L.oppScoreLabel:SetText(tostring(result.oppPoints))
        L.minuteLabel:SetText("终场")

        L.actionHolder:ClearChildren()
        L.actionHolder:AddChild(Common.PrimaryButton(
            result.win and "胜 利 ！ 查 看 战 报" or "惜 败 · 查 看 战 报",
            function()
                Audio.Play(result.win and "win" or "click")
                local cb = L.onFinish
                ui_ = nil
                cb()
            end))
        return
    end

    -- 更新时间与比分
    if entry.minute then
        L.minuteLabel:SetText(string.format("%d'", entry.minute))
        local my, opp = scoreAt(entry.minute)
        local curMy = tonumber(L.myScoreLabel:GetText()) or 0
        local curOpp = tonumber(L.oppScoreLabel:GetText()) or 0
        if my > curMy then L.myScoreLabel:SetText(tostring(my)) end
        if opp > curOpp then L.oppScoreLabel:SetText(tostring(opp)) end
    end

    -- 决策点：停下等玩家
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

-- ---------------------------------------------------------------------------
-- 对外
-- ---------------------------------------------------------------------------

--- 每帧推进
---@param dt number
function ScreenMatchText.tick(dt)
    local L = ui_
    if not L or L.finished then return end
    if not L.pendingAuto then return end

    L.autoTimer = L.autoTimer - dt
    if L.autoTimer <= 0 then
        L.pendingAuto = false
        local s = MatchText.session
        if s and s.pendingDecision == nil then
            step()
        end
    end
end

--- 构建界面
---@param state CareerState
---@param onFinish fun()
---@return Panel
function ScreenMatchText.Build(state, onFinish)
    Audio.PlayBgm("battle")

    local session = MatchText.session
    if not session then
        onFinish()
        return UI.Panel { width = "100%", height = "100%" }
    end

    local myScoreLabel = UI.Label {
        text = "0",
        fontSize = 40,
        fontWeight = "bold",
        fontColor = C.primary,
        textStroke = { width = 3, color = "#1a1614" },
    }
    local oppScoreLabel = UI.Label {
        text = "0",
        fontSize = 40,
        fontWeight = "bold",
        fontColor = C.secondary,
        textStroke = { width = 3, color = "#1a1614" },
    }
    local minuteLabel = UI.Label {
        text = "0'",
        fontSize = 14,
        fontWeight = "bold",
        fontColor = C.textMain,
    }

    local feedPanel = UI.Panel {
        width = "100%",
        flexDirection = "column",
        gap = 10,
        padding = 14,
    }
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

    local scoreboard = UI.Panel {
        width = "100%",
        padding = 14,
        backgroundColor = C.bgPanel,
        borderBottomWidth = 3,
        borderBottomColor = C.outline,
        children = {
            UI.Panel {
                flexDirection = "row",
                justifyContent = "center",
                alignItems = "center",
                gap = 12,
                children = {
                    UI.Panel {
                        flexGrow = 1, flexBasis = 0,
                        flexDirection = "column",
                        alignItems = "center",
                        gap = 2,
                        children = {
                            UI.Label {
                                text = state.team, fontSize = 12, fontWeight = "bold",
                                fontColor = C.textSub, whiteSpace = "normal",
                            },
                            myScoreLabel,
                        },
                    },
                    UI.Panel {
                        width = 70, flexShrink = 0,
                        flexDirection = "column",
                        alignItems = "center",
                        gap = 3,
                        children = {
                            minuteLabel,
                            UI.Label { text = "VS", fontSize = 12, fontWeight = "bold", fontColor = C.textSub },
                        },
                    },
                    UI.Panel {
                        flexGrow = 1, flexBasis = 0,
                        flexDirection = "column",
                        alignItems = "center",
                        gap = 2,
                        children = {
                            UI.Label {
                                text = session.opponent, fontSize = 12, fontWeight = "bold",
                                fontColor = C.textSub, whiteSpace = "normal",
                            },
                            oppScoreLabel,
                        },
                    },
                },
            },
        },
    }

    local root = Common.Screen(Career.getStage().bg, {
        scoreboard,
        feedScroll,
        UI.Panel {
            width = "100%",
            padding = 12,
            backgroundColor = C.bgPanel,
            borderTopWidth = 3,
            borderTopColor = C.outline,
            children = { decisionHolder, actionHolder },
        },
    }, { dim = 0.45 })

    ---@type TextUI
    ui_ = {
        state = state,
        onFinish = onFinish,
        myScoreLabel = myScoreLabel,
        oppScoreLabel = oppScoreLabel,
        minuteLabel = minuteLabel,
        feedPanel = feedPanel,
        feedScroll = feedScroll,
        decisionHolder = decisionHolder,
        actionHolder = actionHolder,
        pendingAuto = false,
        autoTimer = 0,
        finished = false,
    }

    appendLine(string.format("欢迎收看 %s 对阵 %s 的现场直播。", state.team, session.opponent), "tipoff", 0)
    ui_.pendingAuto = true
    ui_.autoTimer = 0.8

    return root
end

return ScreenMatchText
