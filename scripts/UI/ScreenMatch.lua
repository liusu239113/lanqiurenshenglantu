-- ============================================================================
-- ScreenMatch — 回合制操作比赛界面
-- 每个回合玩家亲自操作：突破 → 投篮 / 防守读心
-- 由 ScreenMatch.tick(dt) 每帧驱动（Main 订阅 Update 调用）
-- ============================================================================

local UI = require("urhox-libs/UI")
local Config = require("Core.Config")
local Match = require("Core.Match")
local Career = require("Core.Career")
local MiniGame = require("Core.MiniGame")
local Audio = require("Core.Audio")
local Common = require("UI.Common")

local ScreenMatch = {}

local C = Config.COLORS

-- 时机条分段数
local BAR_SEGMENTS = 30

-- ============================================================================
-- 运行时状态
-- ============================================================================

---@class MatchUI
---@field state CareerState
---@field session MatchSession
---@field onFinish fun()
---@field myScoreLabel Label
---@field oppScoreLabel Label
---@field quarterLabel Label
---@field roundLabel Label
---@field actionHolder Panel     操作区（按钮/时机条）
---@field tellHolder Panel       提示区（重心/动向/结果）
---@field logHolder Panel        战报滚动区
---@field segments Panel[]       投篮时机条分段
---@field cursorIdx number
---@field waitTimer number
---@field pendingNext string|nil 等待延时后执行的动作
---@field finished boolean

---@type MatchUI|nil
local ui_ = nil

-- ============================================================================
-- 工具
-- ============================================================================

--- 投篮时机条分段颜色
---@param pos number
---@param s ShotState
---@return RGBAColor
local function segColor(pos, s)
    if pos >= s.greenLo and pos <= s.greenHi then
        return { 62, 168, 88, 255 }
    elseif pos >= s.yellowLo and pos <= s.yellowHi then
        return { 255, 206, 61, 255 }
    end
    return { 214, 68, 58, 255 }
end

--- 刷新比分显示
---@param L MatchUI
local function refreshScore(L)
    local s = L.session
    L.myScoreLabel:SetText(tostring(s.myScore))
    L.oppScoreLabel:SetText(tostring(s.oppScore))
    L.quarterLabel:SetText(string.format("第 %d 节", s.quarter))
    L.roundLabel:SetText(string.format("回合 %d / %d", s.round, s.totalRounds))
end

--- 往战报区追加一行
---@param L MatchUI
---@param text string
local function addLogLine(L, text)
    L.logHolder:AddChild(UI.Panel {
        width = "100%",
        flexDirection = "row",
        gap = 8,
        alignItems = "flex-start",
        children = {
            UI.Panel {
                width = 8, height = 8,
                marginTop = 5,
                backgroundColor = C.primary,
                flexShrink = 0,
            },
            UI.Label {
                text = text,
                fontSize = 12,
                fontColor = C.textMain,
                whiteSpace = "normal",
                lineHeight = 1.5,
                flexGrow = 1,
                flexBasis = 0,
            },
        },
    })
    -- 只保留最近 12 条，避免无限增长
    if L.logHolder:GetNumChildren() > 12 then
        local first = L.logHolder:GetChildAt(1)
        if first then L.logHolder:RemoveChild(first) end
    end
end

-- ============================================================================
-- 回合渲染
-- ============================================================================

--- 渲染当前回合（前向声明，被下方各阶段渲染函数引用）
---@type fun(L: MatchUI)|nil
local renderRound

--- 渲染：比赛结束
---@param L MatchUI
local function renderOver(L)
    L.actionHolder:ClearChildren()
    L.tellHolder:ClearChildren()

    local s = L.session
    local win = s.win

    L.tellHolder:AddChild(UI.Label {
        text = win and "★ 终场哨响 —— 胜利！" or "终场哨响 —— 惜败。",
        fontSize = 20,
        fontWeight = "bold",
        fontColor = win and C.success or C.danger,
        textAlign = "center",
        whiteSpace = "normal",
    })

    L.actionHolder:AddChild(Common.PrimaryButton(
        win and "胜 利 ！ 查 看 战 报" or "惜 败 · 查 看 战 报",
        function()
            Audio.Play(win and "win" or "click")
            local cb = L.onFinish
            ui_ = nil
            cb()
        end))
end

--- 渲染：节间休息
---@param L MatchUI
local function renderQuarterEnd(L)
    L.actionHolder:ClearChildren()
    L.tellHolder:ClearChildren()

    local s = L.session
    L.tellHolder:AddChild(UI.Label {
        text = string.format("第 %d 节结束\n%d : %d", s.quarter - 1, s.myScore, s.oppScore),
        fontSize = 19,
        fontWeight = "bold",
        fontColor = C.textMain,
        textAlign = "center",
        whiteSpace = "normal",
        lineHeight = 1.6,
    })

    L.actionHolder:AddChild(Common.PrimaryButton("开 始 第 " .. s.quarter .. " 节", function()
        Audio.Play("whistle")
        Match.continueFromBreak(s, L.state)
        refreshScore(L)
        renderRound(L)
    end))
end

--- 渲染：防守回合
---@param L MatchUI
local function renderDefend(L)
    local s = L.session
    L.actionHolder:ClearChildren()
    L.tellHolder:ClearChildren()

    local d = s.defend
    if not d then return end

    L.tellHolder:AddChild(UI.Label {
        text = "—— 对手的动向 ——",
        fontSize = 12,
        fontWeight = "bold",
        fontColor = C.textSub,
        textAlign = "center",
    })
    L.tellHolder:AddChild(UI.Label {
        text = d.tell,
        fontSize = 17,
        fontWeight = "bold",
        fontColor = C.textMain,
        textAlign = "center",
        whiteSpace = "normal",
        lineHeight = 1.6,
    })

    local NAMES = { drive = "突破", shoot = "投篮", pass = "传球" }

    --- 做出防守选择
    ---@param choice string
    local function choose(choice)
        if L.waitTimer > 0 then return end
        local success, actual = MiniGame.defend(s.defend, choice, L.state.attrs.defense or 30)

        Match.resolveDefend(s, L.state, success, actual)
        addLogLine(L, s.log[1] or "")
        refreshScore(L)

        -- 反馈
        L.tellHolder:ClearChildren()
        L.tellHolder:AddChild(UI.Label {
            text = s.flashText,
            fontSize = 16,
            fontWeight = "bold",
            fontColor = success and C.success or C.danger,
            textAlign = "center",
            whiteSpace = "normal",
            lineHeight = 1.6,
        })

        if success then
            Audio.Play("block")
        else
            Audio.Play("rim", 0.7)
        end

        L.actionHolder:ClearChildren()
        L.waitTimer = 0.9
        L.pendingNext = "round"
    end

    L.actionHolder:AddChild(UI.Panel {
        width = "100%",
        flexDirection = "column",
        gap = 10,
        children = {
            UI.Panel {
                flexDirection = "row",
                gap = 10,
                children = {
                    UI.Button {
                        text = "防 突 破",
                        flexGrow = 1, flexBasis = 0,
                        height = 62,
                        fontSize = 15,
                        fontWeight = "bold",
                        backgroundColor = C.secondary,
                        textColor = { 255, 255, 255, 255 },
                        borderWidth = 3,
                        borderColor = C.outline,
                        onClick = function() choose("drive") end,
                    },
                    UI.Button {
                        text = "防 投 篮",
                        flexGrow = 1, flexBasis = 0,
                        height = 62,
                        fontSize = 15,
                        fontWeight = "bold",
                        backgroundColor = C.primary,
                        textColor = { 255, 255, 255, 255 },
                        borderWidth = 3,
                        borderColor = C.outline,
                        onClick = function() choose("shoot") end,
                    },
                },
            },
            UI.Button {
                text = "防 传 球",
                width = "100%",
                height = 54,
                fontSize = 15,
                fontWeight = "bold",
                backgroundColor = { 138, 118, 96, 255 },
                textColor = { 255, 255, 255, 255 },
                borderWidth = 3,
                borderColor = C.outline,
                onClick = function() choose("pass") end,
            },
        },
    })
end

--- 渲染：投篮回合
---@param L MatchUI
local function renderShot(L)
    local s = L.session
    L.actionHolder:ClearChildren()
    L.tellHolder:ClearChildren()

    local shot = s.shot
    if not shot then return end

    L.tellHolder:AddChild(UI.Label {
        text = "突破成功！获得出手机会 —— 在绿色区域出手",
        fontSize = 13,
        fontWeight = "bold",
        fontColor = C.success,
        textAlign = "center",
        whiteSpace = "normal",
        lineHeight = 1.5,
    })

    -- 时机条
    ---@type Panel[]
    local segments = {}
    for i = 1, BAR_SEGMENTS do
        local pos = (i - 0.5) / BAR_SEGMENTS
        segments[i] = UI.Panel {
            flexGrow = 1,
            height = 46,
            backgroundColor = segColor(pos, shot),
        }
    end
    L.segments = segments
    L.cursorIdx = 0

    L.tellHolder:AddChild(UI.Panel {
        width = "100%",
        flexDirection = "row",
        height = 46,
        borderWidth = 3,
        borderColor = C.outline,
        overflow = "hidden",
        children = segments,
    })
    L.tellHolder:AddChild(UI.Label {
        text = "绿色 = 空心入网(3分)  ·  黄色 = 命中(2分)",
        fontSize = 11,
        fontColor = C.textSub,
        textAlign = "center",
    })

    --- 出手
    local function shoot()
        if L.waitTimer > 0 then return end
        local result, points = MiniGame.shoot(s.shot)

        Match.resolveShot(s, L.state, result, points)
        addLogLine(L, s.log[1] or "")
        refreshScore(L)

        L.tellHolder:ClearChildren()
        L.tellHolder:AddChild(UI.Label {
            text = s.flashText,
            fontSize = 16,
            fontWeight = "bold",
            fontColor = (result == "miss") and C.danger or C.success,
            textAlign = "center",
            whiteSpace = "normal",
            lineHeight = 1.6,
        })

        if result == "perfect" then
            Audio.Play("swish")
        elseif result == "good" then
            Audio.Play("swish", 0.6)
        else
            Audio.Play("rim")
        end

        L.actionHolder:ClearChildren()
        L.waitTimer = 0.9
        L.pendingNext = "round"
    end

    L.actionHolder:AddChild(UI.Button {
        text = "出 手",
        width = "100%",
        height = 66,
        fontSize = 22,
        fontWeight = "bold",
        backgroundColor = C.primary,
        textColor = { 255, 255, 255, 255 },
        hoverBackgroundColor = C.primaryLight,
        pressedBackgroundColor = C.primaryDark,
        borderWidth = 3,
        borderColor = C.outline,
        letterSpacing = 5,
        onClick = function() shoot() end,
    })
end

--- 渲染：突破回合
---@param L MatchUI
local function renderDribble(L)
    local s = L.session
    L.actionHolder:ClearChildren()
    L.tellHolder:ClearChildren()

    local d = s.dribble
    if not d then return end

    local leanText
    if d.lean < 0 then
        leanText = "◀ 防守者重心偏左"
    else
        leanText = "防守者重心偏右 ▶"
    end
    if d.feint > 0 then
        leanText = leanText .. "\n（这个重心…感觉有点假）"
    end

    L.tellHolder:AddChild(UI.Label {
        text = "观察防守者的重心，选择变向方向",
        fontSize = 12,
        fontWeight = "bold",
        fontColor = C.textSub,
        textAlign = "center",
    })
    L.tellHolder:AddChild(UI.Label {
        text = leanText,
        fontSize = 18,
        fontWeight = "bold",
        fontColor = C.textMain,
        textAlign = "center",
        whiteSpace = "normal",
        lineHeight = 1.6,
    })

    --- 做出变向选择
    ---@param choice number
    local function choose(choice)
        if L.waitTimer > 0 then return end
        local _, success = MiniGame.dribble(s.dribble, choice, L.state.attrs)

        Match.resolveDribble(s, L.state, success)
        refreshScore(L)

        L.tellHolder:ClearChildren()
        L.tellHolder:AddChild(UI.Label {
            text = s.flashText,
            fontSize = 16,
            fontWeight = "bold",
            fontColor = success and C.success or C.danger,
            textAlign = "center",
            whiteSpace = "normal",
            lineHeight = 1.6,
        })

        L.actionHolder:ClearChildren()

        if success then
            Audio.Play("sneaker")
            -- 突破成功 → 立即进入投篮
            L.waitTimer = 0.55
            L.pendingNext = "shot"
        else
            Audio.Play("block", 0.7)
            addLogLine(L, s.log[1] or "")
            L.waitTimer = 0.9
            L.pendingNext = "round"
        end
    end

    L.actionHolder:AddChild(UI.Panel {
        width = "100%",
        flexDirection = "row",
        gap = 12,
        children = {
            UI.Button {
                text = "◀ 左 变 向",
                flexGrow = 1, flexBasis = 0,
                height = 70,
                fontSize = 17,
                fontWeight = "bold",
                backgroundColor = C.secondary,
                textColor = { 255, 255, 255, 255 },
                borderWidth = 3,
                borderColor = C.outline,
                onClick = function() choose(-1) end,
            },
            UI.Button {
                text = "右 变 向 ▶",
                flexGrow = 1, flexBasis = 0,
                height = 70,
                fontSize = 17,
                fontWeight = "bold",
                backgroundColor = C.primary,
                textColor = { 255, 255, 255, 255 },
                borderWidth = 3,
                borderColor = C.outline,
                onClick = function() choose(1) end,
            },
        },
    })
end

--- 渲染当前回合（分发到各阶段）
---@param L MatchUI
renderRound = function(L)
    if L.finished then return end
    local s = L.session

    if s.finished or s.phase == "over" then
        L.finished = true
        renderOver(L)
        return
    end

    if s.phase == "quarter_end" then
        renderQuarterEnd(L)
        return
    end

    if s.phase == "dribble" then
        renderDribble(L)
    elseif s.phase == "shot" then
        renderShot(L)
    elseif s.phase == "defend" then
        renderDefend(L)
    end
end

-- ============================================================================
-- 每帧推进
-- ============================================================================

--- 每帧推进（由 Main 订阅 Update 调用）
---@param dt number
function ScreenMatch.tick(dt)
    local L = ui_
    if not L or L.finished then return end

    local s = L.session

    -- 延时后切换到下一阶段
    if L.waitTimer > 0 then
        L.waitTimer = L.waitTimer - dt
        if L.waitTimer <= 0 then
            L.waitTimer = 0
            local nextPhase = L.pendingNext
            L.pendingNext = nil

            if nextPhase == "shot" then
                renderShot(L)
            elseif nextPhase == "round" then
                renderRound(L)
            end
        end
        return
    end

    -- 投篮阶段：推进游标
    if s.phase == "shot" and s.shot and not s.shot.done then
        MiniGame.tickShot(s.shot, dt)

        local idx = math.floor(s.shot.cursor * BAR_SEGMENTS) + 1
        if idx < 1 then idx = 1 end
        if idx > BAR_SEGMENTS then idx = BAR_SEGMENTS end

        if idx ~= L.cursorIdx and #L.segments >= BAR_SEGMENTS then
            if L.cursorIdx >= 1 and L.cursorIdx <= BAR_SEGMENTS then
                local oldPos = (L.cursorIdx - 0.5) / BAR_SEGMENTS
                L.segments[L.cursorIdx]:SetBackgroundColor(segColor(oldPos, s.shot))
            end
            L.segments[idx]:SetBackgroundColor({ 255, 255, 255, 255 })
            L.cursorIdx = idx
        end
    end
end

-- ============================================================================
-- 构建界面
-- ============================================================================

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

    -- ---- 比分条 ----
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
    local quarterLabel = UI.Label {
        text = "第 1 节",
        fontSize = 12,
        fontWeight = "bold",
        fontColor = C.textSub,
    }
    local roundLabel = UI.Label {
        text = "回合 1 / 16",
        fontSize = 12,
        fontWeight = "bold",
        fontColor = C.textSub,
    }

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
                                text = state.team,
                                fontSize = 12,
                                fontWeight = "bold",
                                fontColor = C.textSub,
                                whiteSpace = "normal",
                            },
                            myScoreLabel,
                        },
                    },
                    UI.Panel {
                        width = 88, flexShrink = 0,
                        flexDirection = "column",
                        alignItems = "center",
                        gap = 3,
                        children = {
                            quarterLabel,
                            UI.Label {
                                text = "VS",
                                fontSize = 13,
                                fontWeight = "bold",
                                fontColor = C.textMain,
                            },
                            roundLabel,
                        },
                    },
                    UI.Panel {
                        flexGrow = 1, flexBasis = 0,
                        flexDirection = "column",
                        alignItems = "center",
                        gap = 2,
                        children = {
                            UI.Label {
                                text = session.opponent,
                                fontSize = 12,
                                fontWeight = "bold",
                                fontColor = C.textSub,
                                whiteSpace = "normal",
                            },
                            oppScoreLabel,
                        },
                    },
                },
            },
        },
    }

    -- ---- 提示区（重心/动向/时机条/结果）----
    local tellHolder = UI.Panel {
        width = "100%",
        flexDirection = "column",
        gap = 10,
        padding = 16,
        justifyContent = "center",
        alignItems = "center",
    }

    -- ---- 操作区 ----
    local actionHolder = UI.Panel {
        width = "100%",
        flexDirection = "column",
        gap = 10,
    }

    -- ---- 战报区 ----
    local logHolder = UI.Panel {
        width = "100%",
        flexDirection = "column",
        gap = 7,
    }

    local stageBg = Career.getStage().bg

    local root = Common.Screen(stageBg, {
        scoreboard,

        -- 提示区（纸底分镜格）
        UI.Panel {
            width = "100%",
            paddingHorizontal = 12,
            paddingTop = 12,
            children = {
                UI.Panel {
                    width = "100%",
                    minHeight = 150,
                    backgroundColor = { 255, 252, 244, 245 },
                    borderWidth = 3,
                    borderColor = C.outline,
                    children = { tellHolder },
                },
            },
        },

        -- 战报滚动区
        UI.ScrollView {
            flexGrow = 1,
            flexBasis = 0,
            scrollY = true,
            showScrollbar = true,
            children = {
                UI.Panel {
                    width = "100%",
                    flexDirection = "column",
                    gap = 7,
                    padding = 14,
                    children = { logHolder },
                },
            },
        },

        -- 操作区
        UI.Panel {
            width = "100%",
            padding = 12,
            backgroundColor = C.bgPanel,
            borderTopWidth = 3,
            borderTopColor = C.outline,
            children = { actionHolder },
        },
    }, { dim = 0.45 })

    -- 建立运行时
    ---@type MatchUI
    ui_ = {
        state = state,
        session = session,
        onFinish = onFinish,
        myScoreLabel = myScoreLabel,
        oppScoreLabel = oppScoreLabel,
        quarterLabel = quarterLabel,
        roundLabel = roundLabel,
        actionHolder = actionHolder,
        tellHolder = tellHolder,
        logHolder = logHolder,
        segments = {},
        cursorIdx = 0,
        waitTimer = 0,
        pendingNext = nil,
        finished = false,
    }

    -- 回放开场日志
    for i = #session.log, 1, -1 do
        addLogLine(ui_, session.log[i])
    end

    refreshScore(ui_)
    renderRound(ui_)

    return root
end

return ScreenMatch
