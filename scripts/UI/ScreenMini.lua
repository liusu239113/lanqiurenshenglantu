-- ============================================================================
-- ScreenMini — 核心操作玩法界面
-- 投篮时机条 / 运球过人 / 防守预判
-- 由 ScreenMini.tick(dt) 每帧驱动（Main 订阅 Update 调用）
-- ============================================================================

local UI = require("urhox-libs/UI")
local Config = require("Core.Config")
local MiniGame = require("Core.MiniGame")
local Audio = require("Core.Audio")
local Common = require("UI.Common")

local ScreenMini = {}

local C = Config.COLORS

-- 时机条分段数
local BAR_SEGMENTS = 36

-- ============================================================================
-- 玩法 1：投篮时机条
-- ============================================================================

---@class ShotUI
---@field state ShotState
---@field segments Panel[]
---@field cursorIdx number
---@field attrs table<string, number>
---@field stamina number
---@field difficulty number
---@field shotsTotal number
---@field shotsLeft number
---@field madeCount number
---@field totalPoints number
---@field finished boolean
---@field waitTimer number
---@field resultLabel Label
---@field scoreLabel Label
---@field pointsLabel Label
---@field shootBtn Button
---@field onFinish fun(made: number, points: number)

---@type ShotUI|nil
local shotUI_ = nil

--- 判定分段颜色
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

--- 刷新整条时机条颜色
---@param L ShotUI
local function repaintBar(L)
    for i = 1, BAR_SEGMENTS do
        local pos = (i - 0.5) / BAR_SEGMENTS
        L.segments[i]:SetBackgroundColor(segColor(pos, L.state))
        L.segments[i]:SetBorderWidth(0)
    end
    L.cursorIdx = 0
end

--- 开始下一球
---@param L ShotUI
local function nextShot(L)
    if L.shotsLeft <= 0 then
        L.finished = true
        L.shootBtn:SetDisabled(true)
        L.onFinish(L.madeCount, L.totalPoints)
        return
    end
    L.state = MiniGame.startShot(L.attrs, L.stamina, L.difficulty)
    repaintBar(L)
    L.resultLabel:SetText("在绿色区域点击「出手」")
    L.resultLabel:SetFontColor(C.textSub)
    L.shootBtn:SetDisabled(false)
end

--- 构建投篮玩法界面
---@param attrs table<string, number>
---@param stamina number
---@param shots number
---@param difficulty number
---@param onFinish fun(made: number, points: number)
---@return Panel
function ScreenMini.BuildShot(attrs, stamina, shots, difficulty, onFinish)
    local s0 = MiniGame.startShot(attrs, stamina, difficulty)

    ---@type Panel[]
    local segments = {}
    for i = 1, BAR_SEGMENTS do
        local pos = (i - 0.5) / BAR_SEGMENTS
        segments[i] = UI.Panel {
            flexGrow = 1,
            height = 46,
            backgroundColor = segColor(pos, s0),
        }
    end

    local resultLabel = UI.Label {
        text = "在绿色区域点击「出手」",
        width = "100%",
        fontSize = 15,
        fontWeight = "bold",
        fontColor = C.textSub,
        textAlign = "center",
        whiteSpace = "normal",
        minHeight = 26,
    }

    local scoreLabel = UI.Label {
        text = string.format("命中 0 / %d", shots),
        fontSize = 14,
        fontWeight = "bold",
        fontColor = C.textMain,
    }

    local pointsLabel = UI.Label {
        text = "得分 0",
        fontSize = 14,
        fontWeight = "bold",
        fontColor = C.primary,
    }

    ---@type ShotUI
    local L
    ---@type Button
    local shootBtn

    shootBtn = UI.Button {
        text = "出 手",
        width = "100%",
        height = 68,
        fontSize = 23,
        fontWeight = "bold",
        backgroundColor = C.primary,
        textColor = { 255, 255, 255, 255 },
        hoverBackgroundColor = C.primaryLight,
        pressedBackgroundColor = C.primaryDark,
        borderWidth = 3,
        borderColor = C.outline,
        letterSpacing = 5,
        onClick = function()
            if L.finished or L.waitTimer > 0 then return end
            local result, points = MiniGame.shoot(L.state)

            L.shotsLeft = L.shotsLeft - 1
            if result == "perfect" then
                L.madeCount = L.madeCount + 1
                L.totalPoints = L.totalPoints + points
                Audio.Play("swish")
                L.resultLabel:SetText("空心入网！+3")
                L.resultLabel:SetFontColor(C.success)
            elseif result == "good" then
                L.madeCount = L.madeCount + 1
                L.totalPoints = L.totalPoints + points
                Audio.Play("swish", 0.6)
                L.resultLabel:SetText("打板命中 +2")
                L.resultLabel:SetFontColor(C.accent)
            else
                Audio.Play("rim")
                L.resultLabel:SetText("打铁！")
                L.resultLabel:SetFontColor(C.danger)
            end

            L.scoreLabel:SetText(string.format("命中 %d / %d", L.madeCount, shots - L.shotsLeft))
            L.pointsLabel:SetText(string.format("得分 %d", L.totalPoints))
            L.shootBtn:SetDisabled(true)
            L.waitTimer = 0.7
        end,
    }

    L = {
        state = s0,
        segments = segments,
        cursorIdx = 0,
        attrs = attrs,
        stamina = stamina,
        difficulty = difficulty,
        shotsTotal = shots,
        shotsLeft = shots,
        madeCount = 0,
        totalPoints = 0,
        finished = false,
        waitTimer = 0,
        resultLabel = resultLabel,
        scoreLabel = scoreLabel,
        pointsLabel = pointsLabel,
        shootBtn = shootBtn,
        onFinish = onFinish,
    }
    shotUI_ = L

    return Common.Screen(Config.ART.bgTraining, {
        UI.Panel {
            height = 60,
            flexDirection = "row",
            alignItems = "center",
            justifyContent = "space-between",
            paddingHorizontal = 16,
            children = { Common.Title("投 篮 训 练", 19), pointsLabel },
        },
        UI.Panel {
            paddingHorizontal = 16,
            paddingBottom = 10,
            children = { scoreLabel },
        },
        -- 中段用 ScrollView 承载：内容超高时滚动，而不是被 Yoga 压缩后溢出边框。
        -- justifyContent="center" 让内容不足一屏时垂直居中，超出则正常滚动。
        UI.ScrollView {
            flexGrow = 1,
            flexBasis = 0,
            scrollY = true,
            showScrollbar = true,
            justifyContent = "center",
            padding = 16,
            children = {
                UI.Panel {
                    width = "100%",
                    flexDirection = "column",
                    backgroundColor = C.bgCard,
                    borderWidth = 3,
                    borderColor = C.outline,
                    overflow = "hidden",
                    children = {
                        UI.Panel {
                            width = "100%",
                            flexDirection = "row",
                            height = 46,
                            borderBottomWidth = 3,
                            borderBottomColor = C.outline,
                            children = segments,
                        },
                        UI.Panel {
                            width = "100%",
                            flexDirection = "column",
                            gap = 8,
                            padding = 14,
                            children = {
                                resultLabel,
                                UI.Label {
                                    text = "绿色 = 空心入网(3分)  ·  黄色 = 命中(2分)",
                                    fontSize = 11,
                                    fontColor = C.textSub,
                                    textAlign = "center",
                                    whiteSpace = "normal",
                                },
                            },
                        },
                    },
                },
            },
        },
        UI.Panel {
            padding = 16,
            children = { shootBtn },
        },
    }, { dim = 0.55 })
end

--- 每帧推进投篮玩法
---@param dt number
local function tickShot(dt)
    local L = shotUI_
    if not L or L.finished then return end

    -- 等待下一球
    if L.waitTimer > 0 then
        L.waitTimer = L.waitTimer - dt
        if L.waitTimer <= 0 then
            L.waitTimer = 0
            nextShot(L)
        end
        return
    end

    if L.state.done then return end
    MiniGame.tickShot(L.state, dt)

    local idx = math.floor(L.state.cursor * BAR_SEGMENTS) + 1
    if idx < 1 then idx = 1 end
    if idx > BAR_SEGMENTS then idx = BAR_SEGMENTS end

    if idx ~= L.cursorIdx then
        if L.cursorIdx >= 1 and L.cursorIdx <= BAR_SEGMENTS then
            local oldPos = (L.cursorIdx - 0.5) / BAR_SEGMENTS
            L.segments[L.cursorIdx]:SetBackgroundColor(segColor(oldPos, L.state))
        end
        L.segments[idx]:SetBackgroundColor({ 255, 255, 255, 255 })
        L.cursorIdx = idx
    end
end

-- ============================================================================
-- 玩法 2：运球过人
-- ============================================================================

---@class DribbleUI
---@field history number[]
---@field rounds number
---@field successCount number
---@field current DribbleState
---@field attrs table<string, number>
---@field difficulty number
---@field finished boolean
---@field waitTimer number
---@field leanLabel Label
---@field roundLabel Label
---@field historyLabel Label
---@field onFinish fun(success: number, total: number)

---@type DribbleUI|nil
local dribbleUI_ = nil

--- 渲染防守者重心提示
---@param L DribbleUI
local function refreshLean(L)
    local cur = L.current
    local text
    if cur.lean < 0 then
        text = "◀ 防守者重心偏左"
    else
        text = "防守者重心偏右 ▶"
    end
    if cur.feint > 0 then
        text = text .. "\n（这个重心…感觉有点假）"
    end
    L.leanLabel:SetText(text)
    L.leanLabel:SetFontColor(C.textMain)
end

--- 构建运球玩法界面
---@param attrs table<string, number>
---@param rounds number
---@param difficulty number
---@param onFinish fun(success: number, total: number)
---@return Panel
function ScreenMini.BuildDribble(attrs, rounds, difficulty, onFinish)
    -- 注意：用 minHeight 而非 height，多行文字（含换行）会撑开高度，避免裁切；
    -- 同时必须给 width = "100%"，否则按不换行的整行宽度测高，卡片高度会算小
    local leanLabel = UI.Label {
        text = "",
        width = "100%",
        fontSize = 18,
        fontWeight = "bold",
        fontColor = C.textMain,
        textAlign = "center",
        whiteSpace = "normal",
        lineHeight = 1.6,
        minHeight = 64,
    }

    local roundLabel = UI.Label {
        text = string.format("第 1 / %d 回合", rounds),
        fontSize = 14,
        fontWeight = "bold",
        fontColor = C.textMain,
    }

    local historyLabel = UI.Label {
        text = "突破 0 / 0",
        fontSize = 14,
        fontWeight = "bold",
        fontColor = C.primary,
    }

    ---@type DribbleUI
    local L
    L = {
        history = {},
        rounds = rounds,
        successCount = 0,
        current = MiniGame.startDribble(1, {}, difficulty),
        attrs = attrs,
        difficulty = difficulty,
        finished = false,
        waitTimer = 0,
        leanLabel = leanLabel,
        roundLabel = roundLabel,
        historyLabel = historyLabel,
        onFinish = onFinish,
    }
    dribbleUI_ = L

    --- 做出变向选择
    ---@param choice number
    local function choose(choice)
        if L.finished or L.waitTimer > 0 then return end
        if #L.history >= L.rounds then return end

        local _, success = MiniGame.dribble(L.current, choice, L.attrs)
        if success then
            L.successCount = L.successCount + 1
            Audio.Play("sneaker")
            leanLabel:SetText("突破成功！\n防守者被甩在身后。")
            leanLabel:SetFontColor(C.success)
        else
            Audio.Play("block", 0.7)
            leanLabel:SetText("被识破了\n球被断掉。")
            leanLabel:SetFontColor(C.danger)
        end

        historyLabel:SetText(string.format("突破 %d / %d", L.successCount, #L.history))
        L.waitTimer = 0.8
    end

    local root = Common.Screen(Config.ART.bgStreet, {
        UI.Panel {
            height = 60,
            flexDirection = "row",
            alignItems = "center",
            justifyContent = "space-between",
            paddingHorizontal = 16,
            children = { Common.Title("一 对 一 突 破", 19), historyLabel },
        },
        UI.Panel {
            paddingHorizontal = 16,
            paddingBottom = 8,
            children = { roundLabel },
        },
        -- 中段可滚动：重心提示带换行，压缩后会溢出卡片。
        -- justifyContent="center" 让内容不足一屏时垂直居中，超出则正常滚动。
        UI.ScrollView {
            flexGrow = 1,
            flexBasis = 0,
            scrollY = true,
            showScrollbar = true,
            justifyContent = "center",
            padding = 16,
            children = {
                UI.Panel {
                    width = "100%",
                    flexDirection = "column",
                    gap = 14,
                    padding = 20,
                    backgroundColor = C.bgCard,
                    borderWidth = 3,
                    borderColor = C.outline,
                    children = {
                        UI.Label {
                            text = "观察防守者的重心，选择变向方向",
                            fontSize = 12,
                            fontColor = C.textSub,
                            textAlign = "center",
                            whiteSpace = "normal",
                        },
                        leanLabel,
                    },
                },
            },
        },
        UI.Panel {
            padding = 16,
            flexDirection = "row",
            gap = 12,
            children = {
                UI.Button {
                    text = "◀ 左 变 向",
                    flexGrow = 1, flexBasis = 0,
                    height = 74,
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
                    height = 74,
                    fontSize = 17,
                    fontWeight = "bold",
                    backgroundColor = C.primary,
                    textColor = { 255, 255, 255, 255 },
                    borderWidth = 3,
                    borderColor = C.outline,
                    onClick = function() choose(1) end,
                },
            },
        },
    }, { dim = 0.5 })

    refreshLean(L)
    return root
end

--- 每帧推进运球玩法
---@param dt number
local function tickDribble(dt)
    local L = dribbleUI_
    if not L or L.finished then return end
    if L.waitTimer <= 0 then return end

    L.waitTimer = L.waitTimer - dt
    if L.waitTimer > 0 then return end
    L.waitTimer = 0

    if #L.history >= L.rounds then
        L.finished = true
        L.onFinish(L.successCount, L.rounds)
        return
    end

    L.current = MiniGame.startDribble(#L.history + 1, L.history, L.difficulty)
    L.roundLabel:SetText(string.format("第 %d / %d 回合", #L.history + 1, L.rounds))
    refreshLean(L)
end

-- ============================================================================
-- 玩法 3：防守预判
-- ============================================================================

---@class DefendUI
---@field current DefendState
---@field rounds number
---@field played number
---@field successCount number
---@field defendAttr number
---@field difficulty number
---@field finished boolean
---@field waitTimer number
---@field tellLabel Label
---@field roundLabel Label
---@field resultLabel Label
---@field onFinish fun(success: number, total: number)

---@type DefendUI|nil
local defendUI_ = nil

--- 构建防守玩法界面
---@param defendAttr number
---@param rounds number
---@param difficulty number
---@param onFinish fun(success: number, total: number)
---@return Panel
function ScreenMini.BuildDefend(defendAttr, rounds, difficulty, onFinish)
    -- 注意两点，否则提示会溢出卡片外框：
    --   1. 用 minHeight 而非 height，避免多行提示被裁切
    --   2. 必须给 width = "100%"，否则 Yoga 按「不换行的整行宽度」测量，
    --      高度算小了 → 卡片高度不足 → 文字画到底框外面
    local tellLabel = UI.Label {
        text = "",
        width = "100%",
        fontSize = 18,
        fontWeight = "bold",
        fontColor = C.textMain,
        textAlign = "center",
        whiteSpace = "normal",
        lineHeight = 1.6,
        minHeight = 64,
    }

    local roundLabel = UI.Label {
        text = string.format("第 1 / %d 回合", rounds),
        fontSize = 14,
        fontWeight = "bold",
        fontColor = C.textMain,
    }

    local resultLabel = UI.Label {
        text = "读懂对手的意图",
        width = "100%",
        fontSize = 14,
        fontWeight = "bold",
        fontColor = C.textSub,
        textAlign = "center",
        whiteSpace = "normal",
        minHeight = 24,
    }

    ---@type DefendUI
    local L
    L = {
        current = MiniGame.startDefend(difficulty, defendAttr),
        rounds = rounds,
        played = 0,
        successCount = 0,
        defendAttr = defendAttr,
        difficulty = difficulty,
        finished = false,
        waitTimer = 0,
        tellLabel = tellLabel,
        roundLabel = roundLabel,
        resultLabel = resultLabel,
        onFinish = onFinish,
    }
    defendUI_ = L
    tellLabel:SetText(L.current.tell)

    local NAMES = { drive = "突破", shoot = "投篮", pass = "传球" }

    --- 做出防守选择
    ---@param choice string
    local function choose(choice)
        if L.finished or L.waitTimer > 0 then return end
        if L.played >= L.rounds then return end

        local success, actual = MiniGame.defend(L.current, choice, L.defendAttr)
        L.played = L.played + 1

        local actualName = NAMES[actual] or "进攻"
        if success then
            L.successCount = L.successCount + 1
            Audio.Play("block")
            resultLabel:SetText("判断正确！" .. actualName .. "被你破坏。")
            resultLabel:SetFontColor(C.success)
        else
            Audio.Play("rim", 0.7)
            resultLabel:SetText("判断失误——对手选择了" .. actualName .. "。")
            resultLabel:SetFontColor(C.danger)
        end

        L.waitTimer = 0.85
    end

    local root = Common.Screen(Config.ART.bgPro, {
        UI.Panel {
            height = 60,
            flexDirection = "row",
            alignItems = "center",
            justifyContent = "space-between",
            paddingHorizontal = 16,
            children = { Common.Title("防 守 读 心", 19), roundLabel },
        },
        -- 中段可滚动：长提示文案（2~3 行）不会被压缩后顶出卡片边框。
        -- justifyContent="center" 让内容不足一屏时仍然垂直居中，超出则正常滚动。
        UI.ScrollView {
            flexGrow = 1,
            flexBasis = 0,
            scrollY = true,
            showScrollbar = true,
            justifyContent = "center",
            padding = 16,
            children = {
                UI.Panel {
                    width = "100%",
                    flexDirection = "column",
                    gap = 14,
                    padding = 20,
                    backgroundColor = C.bgCard,
                    borderWidth = 3,
                    borderColor = C.outline,
                    children = {
                        UI.Label {
                            text = "—— 对手的动向 ——",
                            fontSize = 12,
                            fontWeight = "bold",
                            fontColor = C.textSub,
                            textAlign = "center",
                        },
                        tellLabel,
                        UI.Divider { color = { 26, 22, 20, 60 } },
                        resultLabel,
                    },
                },
            },
        },
        UI.Panel {
            padding = 16,
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
                    height = 58,
                    fontSize = 15,
                    fontWeight = "bold",
                    backgroundColor = { 138, 118, 96, 255 },
                    textColor = { 255, 255, 255, 255 },
                    borderWidth = 3,
                    borderColor = C.outline,
                    onClick = function() choose("pass") end,
                },
            },
        },
    }, { dim = 0.5 })

    return root
end

--- 每帧推进防守玩法
---@param dt number
local function tickDefend(dt)
    local L = defendUI_
    if not L or L.finished then return end
    if L.waitTimer <= 0 then return end

    L.waitTimer = L.waitTimer - dt
    if L.waitTimer > 0 then return end
    L.waitTimer = 0

    if L.played >= L.rounds then
        L.finished = true
        L.onFinish(L.successCount, L.rounds)
        return
    end

    L.current = MiniGame.startDefend(L.difficulty, L.defendAttr)
    L.tellLabel:SetText(L.current.tell)
    L.roundLabel:SetText(string.format("第 %d / %d 回合", L.played + 1, L.rounds))
    L.resultLabel:SetText("读懂对手的意图")
    L.resultLabel:SetFontColor(C.textSub)
end

-- ============================================================================
-- 统一 tick 分发
-- ============================================================================

--- 每帧推进当前激活的玩法（由 Main 订阅 Update 调用）
---@param dt number
function ScreenMini.tick(dt)
    if shotUI_ then tickShot(dt) end
    if dribbleUI_ then tickDribble(dt) end
    if defendUI_ then tickDefend(dt) end
end

--- 清理当前玩法状态（离开界面时调用）
function ScreenMini.clear()
    shotUI_ = nil
    dribbleUI_ = nil
    defendUI_ = nil
end

--- 是否有玩法正在运行
---@return boolean
function ScreenMini.isActive()
    return shotUI_ ~= nil or dribbleUI_ ~= nil or defendUI_ ~= nil
end

return ScreenMini
