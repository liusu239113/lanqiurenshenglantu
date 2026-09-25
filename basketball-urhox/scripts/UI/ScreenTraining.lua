-- ============================================================================
-- ScreenTraining — 训练场 / 斗牛场
-- 核心操作玩法的入口，与生涯推进解耦（独立玩法）
-- ============================================================================

local UI = require("urhox-libs/UI")
local Config = require("Core.Config")
local Career = require("Core.Career")
local MiniGame = require("Core.MiniGame")
local Audio = require("Core.Audio")
local Common = require("UI.Common")
local AdWidgets = require("UI.AdWidgets")

local ScreenTraining = {}

local C = Config.COLORS

-- ---------------------------------------------------------------------------
-- 训练场主页：四个玩法入口
-- ---------------------------------------------------------------------------

--- 玩法入口卡（大格子，漫画风）
---@param title string
---@param desc string
---@param color RGBAColor
---@param onClick fun()
---@return Button
local function ModeCard(title, desc, color, onClick)
    return UI.Button {
        width = "100%",
        minHeight = 96,
        paddingHorizontal = 18,
        paddingVertical = 14,
        backgroundColor = color,
        hoverBackgroundColor = color,
        pressedBackgroundColor = C.primaryDark,
        borderWidth = 3,
        borderColor = C.outline,
        onClick = function()
            onClick()
        end,
        children = {
            UI.Panel {
                width = "100%",
                flexDirection = "row",
                alignItems = "center",
                justifyContent = "space-between",
                children = {
                    UI.Panel {
                        flexDirection = "column",
                        gap = 4,
                        alignItems = "flex-start",
                        flexGrow = 1,
                        flexBasis = 0,
                        children = {
                            UI.Label {
                                text = title,
                                fontSize = 20,
                                fontWeight = "bold",
                                fontColor = { 255, 255, 255, 255 },
                                letterSpacing = 2,
                                whiteSpace = "normal",
                            },
                            UI.Label {
                                text = desc,
                                fontSize = 12,
                                fontColor = { 255, 255, 255, 215 },
                                whiteSpace = "normal",
                                lineHeight = 1.4,
                            },
                        },
                    },
                    UI.Label {
                        text = "▶",
                        fontSize = 22,
                        fontWeight = "bold",
                        fontColor = { 255, 255, 255, 255 },
                        flexShrink = 0,
                    },
                },
            },
        },
    }
end

--- 构建训练场主页
---@param onPick fun(mode: string)
---@param onBack fun()
---@return Panel
function ScreenTraining.Build(onPick, onBack)
    Audio.PlayBgm("daily")

    local state = Career.state
    if not state then
        onBack()
        return UI.Panel { width = "100%", height = "100%" }
    end

    -- 展示当前属性，让玩家理解玩法与属性的关系
    ---@type table[]
    local attrRows = {}
    for i = 1, #Config.ATTRS do
        local def = Config.ATTRS[i]
        attrRows[i] = Common.AttrRow(def, state.attrs[def.key] or 0)
    end

    return Common.Screen(Config.ART.bgTraining, {
        -- 顶栏（返回键在左上角）
        Common.TopBar("训 练 馆", function()
            Audio.Play("click")
            onBack()
        end),

        UI.ScrollView {
            flexGrow = 1,
            flexBasis = 0,
            scrollY = true,
            showScrollbar = true,
            children = {
                UI.Panel {
                    width = "100%",
                    flexDirection = "column",
                    gap = 14,
                    padding = 16,
                    paddingBottom = 28,
                    children = {
                        Common.Sub("属性越强，操作容错越高。在这里磨练你的手感。", 13),

                        ModeCard("投 篮 训 练", "时机条出手，绿区命中率由【得分】决定", C.primary, function()
                            Audio.Play("click")
                            onPick("shot")
                        end),
                        ModeCard("一 对 一 突 破", "读重心变向，AI 会记住你的习惯", C.secondary, function()
                            Audio.Play("click")
                            onPick("dribble")
                        end),
                        ModeCard("防 守 读 心", "预判对手动向，属性越高提示越准", { 138, 118, 96, 255 }, function()
                            Audio.Play("click")
                            onPick("defend")
                        end),
                        ModeCard("斗 牛 赛", "1v1 单挑，先到 11 分获胜", { 168, 62, 148, 255 }, function()
                            Audio.Play("click")
                            onPick("duel")
                        end),
                        ModeCard("战 术 板", "布置攻防打法，影响比赛走势", { 62, 138, 96, 255 }, function()
                            Audio.Play("click")
                            onPick("tactic")
                        end),

                        -- 训练经验加成（广告位）
                        state.boostActive and UI.Panel {
                            width = "100%",
                            padding = 12,
                            backgroundColor = { 232, 246, 232, 255 },
                            borderWidth = 3,
                            borderColor = C.outline,
                            children = {
                                UI.Label {
                                    text = "✓ 训练经验 ×1.5 生效中（本季有效）",
                                    fontSize = 13,
                                    fontWeight = "bold",
                                    fontColor = C.success,
                                    textAlign = "center",
                                    whiteSpace = "normal",
                                },
                            },
                        } or AdWidgets.Card(state, "boost", function()
                            state.boostActive = true
                            return "训练经验 ×1.5 已生效，本季训练收益大幅提升"
                        end),

                        -- 属性面板
                        Common.Block("当 前 能 力", attrRows, { barColor = C.textMain }),
                    },
                },
            },
        },
    }, { dim = 0.5 })
end

-- ---------------------------------------------------------------------------
-- 战术板
-- ---------------------------------------------------------------------------

--- 构建战术板界面
---@param onConfirm fun(tacticId: string, defenseId: string)
---@param onBack fun()
---@return Panel
function ScreenTraining.BuildTactic(onConfirm, onBack)
    local state = Career.state
    if not state then
        onBack()
        return UI.Panel { width = "100%", height = "100%" }
    end

    local selTactic = state.tacticId or "balanced"
    local selDefense = state.defenseId or "man"

    ---@type table[]
    local tacticButtons = {}
    ---@type table[]
    local defenseButtons = {}

    local function refreshTactics()
        for i = 1, #tacticButtons do
            local t = MiniGame.TACTICS[i]
            local btn = tacticButtons[i]
            if t.id == selTactic then
                btn:SetStyle({ backgroundColor = C.primary })
            else
                btn:SetStyle({ backgroundColor = C.bgCard })
            end
        end
    end

    local function refreshDefense()
        for i = 1, #defenseButtons do
            local d = MiniGame.DEFENSE[i]
            local btn = defenseButtons[i]
            if d.id == selDefense then
                btn:SetStyle({ backgroundColor = C.secondary })
            else
                btn:SetStyle({ backgroundColor = C.bgCard })
            end
        end
    end

    for i = 1, #MiniGame.TACTICS do
        local t = MiniGame.TACTICS[i]
        local id = t.id
        tacticButtons[i] = UI.Button {
            width = "100%",
            height = 64,
            paddingHorizontal = 14,
            textColor = C.textMain,
            borderWidth = 3,
            borderColor = C.outline,
            onClick = function()
                Audio.Play("click")
                selTactic = id
                refreshTactics()
            end,
            children = {
                UI.Panel {
                    width = "100%",
                    flexDirection = "row",
                    justifyContent = "space-between",
                    alignItems = "center",
                    children = {
                        UI.Panel {
                            flexDirection = "column",
                            gap = 2,
                            alignItems = "flex-start",
                            children = {
                                UI.Label { text = t.name, fontSize = 16, fontWeight = "bold", fontColor = C.textMain },
                                UI.Label { text = t.desc, fontSize = 11, fontColor = C.textSub },
                            },
                        },
                        UI.Panel {
                            flexDirection = "column",
                            gap = 2,
                            alignItems = "flex-end",
                            children = {
                                UI.Label {
                                    text = string.format("进攻 ×%.2f", t.offense),
                                    fontSize = 11,
                                    fontWeight = "bold",
                                    fontColor = t.offense >= 1.0 and C.success or C.danger,
                                },
                                UI.Label {
                                    text = string.format("防守 ×%.2f", t.defense),
                                    fontSize = 11,
                                    fontWeight = "bold",
                                    fontColor = t.defense >= 1.0 and C.success or C.danger,
                                },
                            },
                        },
                    },
                },
            },
        }
    end

    for i = 1, #MiniGame.DEFENSE do
        local d = MiniGame.DEFENSE[i]
        local id = d.id
        defenseButtons[i] = UI.Button {
            width = "100%",
            height = 56,
            paddingHorizontal = 14,
            borderWidth = 3,
            borderColor = C.outline,
            onClick = function()
                Audio.Play("click")
                selDefense = id
                refreshDefense()
            end,
            children = {
                UI.Panel {
                    width = "100%",
                    flexDirection = "row",
                    justifyContent = "space-between",
                    alignItems = "center",
                    children = {
                        UI.Panel {
                            flexDirection = "column",
                            gap = 2,
                            alignItems = "flex-start",
                            children = {
                                UI.Label { text = d.name, fontSize = 15, fontWeight = "bold", fontColor = C.textMain },
                                UI.Label { text = d.desc, fontSize = 11, fontColor = C.textSub },
                            },
                        },
                        UI.Label {
                            text = string.format("体力 ×%.1f", d.staminaCost),
                            fontSize = 11,
                            fontWeight = "bold",
                            fontColor = C.textSub,
                        },
                    },
                },
            },
        }
    end

    refreshTactics()
    refreshDefense()

    return Common.Screen(Config.ART.bgLocker, {
        Common.TopBar("战 术 板", function()
            Audio.Play("click")
            onBack()
        end),

        UI.ScrollView {
            flexGrow = 1,
            flexBasis = 0,
            scrollY = true,
            showScrollbar = true,
            children = {
                UI.Panel {
                    width = "100%",
                    flexDirection = "column",
                    gap = 14,
                    padding = 16,
                    paddingBottom = 28,
                    children = {
                        Common.Block("进 攻 战 术", tacticButtons, { barColor = C.primary }),
                        Common.Block("防 守 策 略", defenseButtons, { barColor = C.secondary }),
                    },
                },
            },
        },

        UI.Panel {
            padding = 16,
            children = {
                Common.PrimaryButton("确 定 战 术", function()
                    Audio.Play("whistle")
                    onConfirm(selTactic, selDefense)
                end),
            },
        },
    }, { dim = 0.55 })
end

-- ---------------------------------------------------------------------------
-- 玩法结算界面
-- ---------------------------------------------------------------------------

--- 构建玩法结算界面
---@param title string
---@param lines string[]
---@param reward string
---@param onDone fun()
---@return Panel
function ScreenTraining.BuildResult(title, lines, reward, onDone)
    ---@type table[]
    local lineWidgets = {}
    for i = 1, #lines do
        lineWidgets[i] = UI.Label {
            text = lines[i],
            fontSize = 14,
            fontWeight = "bold",
            fontColor = C.textMain,
            whiteSpace = "normal",
            lineHeight = 1.6,
        }
    end

    return Common.Screen(Config.ART.evTrophy, {
        UI.Panel {
            flexGrow = 1,
            flexBasis = 0,
            justifyContent = "center",
            padding = 20,
            children = {
                UI.Panel {
                    width = "100%",
                    flexDirection = "column",
                    backgroundColor = C.bgCard,
                    borderWidth = 3,
                    borderColor = C.outline,
                    overflow = "hidden",
                    children = {
                        Common.Bar(title, C.primary),
                        UI.Panel {
                            width = "100%",
                            flexDirection = "column",
                            gap = 12,
                            padding = 18,
                            children = {
                                UI.Panel {
                                    flexDirection = "column",
                                    gap = 8,
                                    children = lineWidgets,
                                },
                                UI.Panel {
                                    width = "100%",
                                    padding = 12,
                                    backgroundColor = C.bgCardLight,
                                    borderWidth = 2,
                                    borderColor = C.outline,
                                    children = {
                                        UI.Label {
                                            text = reward,
                                            fontSize = 15,
                                            fontWeight = "bold",
                                            fontColor = C.primary,
                                            whiteSpace = "normal",
                                            textAlign = "center",
                                        },
                                    },
                                },
                                Common.PrimaryButton("继 续", function()
                                    Audio.Play("click")
                                    onDone()
                                end),
                            },
                        },
                    },
                },
            },
        },
    }, { dim = 0.6 })
end

return ScreenTraining
