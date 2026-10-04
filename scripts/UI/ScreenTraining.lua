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
--- 体能不足时置灰并禁用：训练馆的属性收益需要付出体能代价，
--- 否则体力见底后反复重开玩法就能无限刷属性。
---@param title string
---@param desc string
---@param color RGBAColor
---@param cost number 单次体能消耗
---@param enabled boolean 体能是否够开练
---@param onClick fun()
---@return Button
local function ModeCard(title, desc, color, cost, enabled, onClick)
    return UI.Button {
        width = "100%",
        minHeight = 96,
        paddingHorizontal = 18,
        paddingVertical = 14,
        backgroundColor = enabled and color or { 168, 162, 152, 255 },
        hoverBackgroundColor = enabled and color or { 168, 162, 152, 255 },
        pressedBackgroundColor = C.primaryDark,
        borderWidth = 3,
        borderColor = C.outline,
        disabled = not enabled,
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
                            UI.Label {
                                text = (not enabled) and string.format("体能不足 · 需要 %d", cost)
                                    or (cost > 0) and string.format("体能 -%d", cost)
                                    or "不耗体能",
                                fontSize = 11,
                                fontWeight = "bold",
                                fontColor = enabled and { 255, 255, 255, 200 } or { 255, 226, 226, 255 },
                                whiteSpace = "normal",
                            },
                        },
                    },
                    UI.Label {
                        text = enabled and "▶" or "✕",
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

    -- 体能门槛：每个玩法都要消耗体能，不够的入口直接置灰
    local stamina = math.floor(state.stamina or 0)
    local staminaMax = Career.staminaMax()
    local canShot = Career.canTrain("shot")
    local canDribble = Career.canTrain("dribble")
    local canDefend = Career.canTrain("defend")

    ---@type table[]
    local staminaRow = {
        -- StatBar 自带 flexBasis=0，直接放进列容器高度会算成 0（条不可见），
        -- 必须像主页那样包一层 row Panel。
        UI.Panel {
            width = "100%",
            flexDirection = "row",
            children = {
                Common.StatBar("体 能", stamina, (canShot and canDribble and canDefend) and C.success or C.danger),
            },
        },
    }
    if not canShot then
        table.insert(staminaRow, Common.Sub(string.format(
            "体能不足（%d / %d），训练馆暂时练不了 —— 先回主页安排一次「休息恢复」，或推进一周。",
            stamina, staminaMax), 12))
    else
        table.insert(staminaRow, Common.Sub(string.format(
            "每次训练消耗体能（投篮 -%d，突破 -%d，防守 -%d），体能见底就无法再练。",
            Config.TRAINING.costShot, Config.TRAINING.costDribble, Config.TRAINING.costDefend), 12))
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

                        Common.Block("体 能 状 态", staminaRow, { barColor = C.success }),

                        ModeCard("投 篮 训 练", "时机条出手，绿区命中率由【得分】决定",
                            C.primary, Config.TRAINING.costShot, canShot, function()
                                Audio.Play("click")
                                onPick("shot")
                            end),
                        ModeCard("一 对 一 突 破", "读重心变向，AI 会记住你的习惯",
                            C.secondary, Config.TRAINING.costDribble, canDribble, function()
                                Audio.Play("click")
                                onPick("dribble")
                            end),
                        ModeCard("防 守 读 心", "预判对手动向，属性越高提示越准",
                            { 138, 118, 96, 255 }, Config.TRAINING.costDefend, canDefend, function()
                                Audio.Play("click")
                                onPick("defend")
                            end),
                        ModeCard("战 术 板", "布置攻防打法，影响比赛走势（不耗体能）",
                            { 62, 138, 96, 255 }, 0, true, function()
                                Audio.Play("click")
                                onPick("tactic")
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
    local ov = Career.getOverall()

    --- 战术通过综合评分或完整观看广告解锁。
    ---@param t TacticDef
    ---@return boolean
    local function tacticUnlocked(t)
        return t.reqOverall == nil or ov >= t.reqOverall or Career.hasTactic(t.id)
    end

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
            elseif not tacticUnlocked(t) then
                btn:SetStyle({ backgroundColor = { 238, 232, 220, 255 } })
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
        local locked = not tacticUnlocked(t)
        tacticButtons[i] = UI.Button {
            width = "100%",
            height = 64,
            paddingHorizontal = 14,
            textColor = C.textMain,
            borderWidth = 3,
            borderColor = C.outline,
            disabled = locked,
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
                                UI.Panel {
                                    flexDirection = "row",
                                    alignItems = "center",
                                    gap = 6,
                                    children = {
                                        UI.Label { text = t.name, fontSize = 16, fontWeight = "bold", fontColor = C.textMain },
                                        locked and Common.Tag(string.format("综合 %d 解锁", t.reqOverall or 0),
                                            { 232, 168, 32, 255 }) or UI.Panel { width = 0 },
                                    },
                                },
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

    local bonusTactic = MiniGame.getTactic("iso")
    local tacticAd = (not tacticUnlocked(bonusTactic)) and AdWidgets.Button(state, "tactic", function()
        Career.unlockTactic("iso")
        return "永久解锁巨星单打，下一场即可布置"
    end, {
        label = "▶ 看广告 · 提前永久解锁巨星单打（进攻 ×1.32）",
        onFinished = function() UI.SetRoot(ScreenTraining.BuildTactic(onConfirm, onBack)) end,
    }) or UI.Panel { height = 0 }

    return Common.Screen(Config.ART.bgTacticsRoom, {
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
                        tacticAd,
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

--- 构建玩法结算界面（可自愿看广告额外领取一次正收益）
---@param title string
---@param lines string[]
---@param reward string
---@param onDone fun()
---@param onDouble fun()|nil 完整观看激励视频后再次发放本次正向奖励
---@return Panel
function ScreenTraining.BuildResult(title, lines, reward, onDone, onDouble)
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
        -- 结算内容用 ScrollView 承载：奖励明细行数不定，内容超高时滚动，
        -- 而不是被 Yoga 压缩后把文字顶出卡片边框（截图里看到的溢出）
        UI.ScrollView {
            flexGrow = 1,
            flexBasis = 0,
            scrollY = true,
            showScrollbar = true,
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
                                    width = "100%",
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
                                onDouble and AdWidgets.Button(Career.state, "doubleReward", function()
                                    onDouble()
                                    return "教练加练完成，本次训练正向奖励再领一份"
                                end, {
                                    label = "▶ 看广告 · 本次训练正向奖励再领一份",
                                    onFinished = function()
                                        UI.SetRoot(ScreenTraining.BuildResult(title, lines, reward, onDone, nil))
                                    end,
                                }) or UI.Panel { height = 0 },
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
