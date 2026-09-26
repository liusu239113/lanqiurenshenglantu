-- ============================================================================
-- ScreenAttr — 能力特训页（属性加点）
--
-- 玩法闭环：
--   原生路径 → 打比赛 / 周行动 / 训练馆 累积「经验池」，经验可在本页兑换属性点
--   广告路径 → 「特训名额」看一次拿 Config.AD_REWARDS.attrPoints 点（有赛季次数上限）
--
-- 广告位纪律：整页只有「特训名额」这一个广告按钮，放在顶部资源卡里，
-- 与加点功能同屏但不抢主操作（+1 按钮才是主操作）。
-- ============================================================================

local UI = require("urhox-libs/UI")
local Config = require("Core.Config")
local Career = require("Core.Career")
local Audio = require("Core.Audio")
local Common = require("UI.Common")
local AdWidgets = require("UI.AdWidgets")

local ScreenAttr = {}

local C = Config.COLORS

-- ---------------------------------------------------------------------------
-- 单行能力
-- ---------------------------------------------------------------------------

--- 能力行 + 加点按钮
---@param state CareerState
---@param def AttrDef
---@param onAdd fun(key: string)
---@return Panel
local function AttrRowWithAdd(state, def, onAdd)
    local value = state.attrs[def.key] or 0
    local cap = Career.getPotential(def.key)
    local color = Config.ATTR_COLORS[def.key] or C.primary
    local points = state.attrPoints or 0

    local atCap = value >= cap
    local canAdd = (points > 0) and not atCap

    local pct = math.min(100, math.max(0, value))

    ---@type string
    local capText
    if atCap then
        capText = string.format("上限 %d · 已满", cap)
    else
        capText = string.format("上限 %d", cap)
    end

    return UI.Panel {
        width = "100%",
        flexDirection = "row",
        alignItems = "center",
        gap = 10,
        padding = 10,
        backgroundColor = C.bgCard,
        borderWidth = 2,
        borderColor = C.outline,
        children = {
            UI.Panel {
                width = 28, height = 28,
                backgroundImage = def.icon,
                backgroundFit = "contain",
                flexShrink = 0,
            },
            UI.Panel {
                flexGrow = 1,
                flexShrink = 1,
                flexBasis = 0,
                flexDirection = "column",
                gap = 4,
                children = {
                    UI.Panel {
                        flexDirection = "row",
                        justifyContent = "space-between",
                        alignItems = "center",
                        children = {
                            UI.Label {
                                text = def.name,
                                fontSize = 13,
                                fontWeight = "bold",
                                fontColor = C.textMain,
                            },
                            UI.Panel {
                                flexDirection = "row",
                                alignItems = "baseline",
                                gap = 6,
                                children = {
                                    UI.Label {
                                        text = capText,
                                        fontSize = 10,
                                        fontColor = atCap and C.danger or C.textSub,
                                    },
                                    UI.Label {
                                        text = tostring(math.floor(value)),
                                        fontSize = 18,
                                        fontWeight = "bold",
                                        fontColor = color,
                                    },
                                },
                            },
                        },
                    },
                    UI.ProgressBar {
                        value = pct,
                        max = 100,
                        height = 10,
                        showLabel = false,
                        fillColor = color,
                        transition = "value 0.4s easeOut",
                    },
                },
            },
            -- 加点按钮（主操作）
            UI.Button {
                text = "+1",
                width = 52,
                height = 40,
                fontSize = 15,
                fontWeight = "bold",
                backgroundColor = canAdd and C.primary or { 226, 218, 204, 255 },
                textColor = canAdd and { 255, 255, 255, 255 } or { 150, 140, 126, 255 },
                hoverBackgroundColor = C.primaryLight,
                pressedBackgroundColor = C.primaryDark,
                borderWidth = 3,
                borderColor = C.outline,
                flexShrink = 0,
                disabled = not canAdd,
                onClick = function()
                    Audio.Play("click")
                    onAdd(def.key)
                end,
            },
        },
    }
end

-- ---------------------------------------------------------------------------
-- 主构建函数
-- ---------------------------------------------------------------------------

--- 构建能力特训页
---@param onBack fun()
---@return Panel
function ScreenAttr.Build(onBack)
    Audio.PlayBgm("daily")

    ---@type fun(): Panel
    local render
    --- 渲染并设为当前根（内部重绘也必须设根，否则界面不刷新）
    ---@type fun(): Panel
    local renderAndSet

    render = function()
        local state = Career.state
        if not state then
            onBack()
            return UI.Panel { width = "100%", height = "100%" }
        end

        local points = state.attrPoints or 0
        local expPool = state.expPool or 0
        local cost = Config.AD_REWARDS.expPerAttrPoint
        local canBuy = expPool >= cost
        local money = state.money or 0
        local moneyCost = Config.ECONOMY.moneyPerAttrPoint
        local canAfford = money >= moneyCost

        --- 重建本页（加点后刷新数值）
        local function refresh()
            renderAndSet()
        end

        --- 加一点
        ---@param key string
        local function addPoint(key)
            local ok, msg = Career.spendAttrPoint(key)
            if not ok then
                UI.Toast.Show(msg, { duration = 2, variant = "warning", position = "bottom" })
                refresh()
                return
            end
            Career.save()
            for i = 1, #Config.ATTRS do
                local def = Config.ATTRS[i]
                if def.key == key then
                    UI.Toast.Show(string.format("%s %s", def.name, msg),
                        { duration = 1.6, variant = "success", position = "bottom" })
                    break
                end
            end
            Audio.Play("levelup")
            refresh()
        end

        ---@type table[]
        local rows = {}
        for i = 1, #Config.ATTRS do
            table.insert(rows, AttrRowWithAdd(state, Config.ATTRS[i], addPoint))
        end

        -- 顶部资源卡
        local headerCard = UI.Panel {
            width = "100%",
            flexDirection = "column",
            gap = 12,
            padding = 14,
            backgroundColor = C.bgCard,
            borderWidth = 3,
            borderColor = C.outline,
            children = {
                UI.Panel {
                    width = "100%",
                    flexDirection = "row",
                    alignItems = "center",
                    justifyContent = "space-between",
                    children = {
                        UI.Panel {
                            flexDirection = "column",
                            gap = 2,
                            children = {
                                UI.Label {
                                    text = "综合评分",
                                    fontSize = 11,
                                    fontWeight = "bold",
                                    fontColor = C.textSub,
                                },
                                UI.Label {
                                    text = tostring(Career.getOverall()),
                                    fontSize = 30,
                                    fontWeight = "bold",
                                    fontColor = C.primary,
                                },
                            },
                        },
                        UI.Panel {
                            flexDirection = "column",
                            alignItems = "flex-end",
                            gap = 4,
                            children = {
                                UI.Label {
                                    text = string.format("可用属性点  %d", points),
                                    fontSize = 15,
                                    fontWeight = "bold",
                                    fontColor = points > 0 and C.success or C.textSub,
                                },
                                UI.Label {
                                    text = string.format("经验池  %d", expPool),
                                    fontSize = 12,
                                    fontColor = C.textSub,
                                },
                            },
                        },
                    },
                },

                UI.Divider { color = { 26, 22, 20, 40 } },

                -- 原生路径：经验换属性点（广告只是捷径，这条永远保留）
                UI.Button {
                    text = string.format("用 %d 经验兑换 1 点属性点（现有 %d）", cost, expPool),
                    width = "100%",
                    height = 44,
                    fontSize = 13,
                    fontWeight = "bold",
                    backgroundColor = canBuy and C.secondary or { 226, 218, 204, 255 },
                    textColor = canBuy and { 255, 255, 255, 255 } or { 150, 140, 126, 255 },
                    hoverBackgroundColor = { 72, 152, 226, 255 },
                    pressedBackgroundColor = { 28, 96, 168, 255 },
                    borderWidth = 3,
                    borderColor = C.outline,
                    disabled = not canBuy,
                    onClick = function()
                        Audio.Play("click")
                        local ok, msg = Career.buyAttrPointWithExp()
                        if ok then
                            Career.save()
                            Audio.Play("levelup")
                            UI.Toast.Show(msg, { duration = 2, variant = "success", position = "bottom" })
                        else
                            UI.Toast.Show(msg, { duration = 2, variant = "warning", position = "bottom" })
                        end
                        refresh()
                    end,
                },

                -- 原生路径之二：花钱请私教（钱从年薪/代言/商业活动/彩票来）
                UI.Button {
                    text = canAfford
                        and string.format("自费私教：花 %d 万买 1 点属性点（现有 %d 万）", moneyCost, money)
                        or string.format("自费私教需 %d 万（现有 %d 万）", moneyCost, money),
                    width = "100%",
                    height = 44,
                    fontSize = 13,
                    fontWeight = "bold",
                    backgroundColor = canAfford and C.success or { 226, 218, 204, 255 },
                    textColor = canAfford and { 255, 255, 255, 255 } or { 150, 140, 126, 255 },
                    hoverBackgroundColor = { 82, 188, 108, 255 },
                    pressedBackgroundColor = { 44, 138, 68, 255 },
                    borderWidth = 3,
                    borderColor = C.outline,
                    disabled = not canAfford,
                    onClick = function()
                        Audio.Play("click")
                        local ok, msg = Career.buyAttrPointWithMoney()
                        if ok then
                            Career.save()
                            Audio.Play("levelup")
                            UI.Toast.Show(msg, { duration = 2, variant = "success", position = "bottom" })
                        else
                            UI.Toast.Show(msg, { duration = 2, variant = "warning", position = "bottom" })
                        end
                        refresh()
                    end,
                },
            },
        }

        return Common.Screen(Config.ART.bgLocker, {
            Common.TopBar("能 力 特 训", function()
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
                            headerCard,

                            -- 全页唯一的广告入口，放在资源卡下方
                            Common.Block("特 训 名 额", {
                                Common.Sub("名额有限，一次特训直接换来自由属性点。", 11),
                                AdWidgets.Button(state, "attrPoints", function()
                                    local gain = Config.AD_REWARDS.attrPoints
                                    Career.addAttrPoints(gain)
                                    Career.save()
                                    return string.format("属性点 +%d，去下面加点吧", gain)
                                end, { height = 48, fontSize = 14, onFinished = refresh }),
                            }, { barColor = { 232, 168, 32, 255 } }),

                            Common.Block("五 项 能 力", rows, { barColor = C.textMain }),
                        },
                    },
                },
            },
        }, { dim = 0.5 })
    end

    renderAndSet = function()
        local screen = render()
        UI.SetRoot(screen)
        return screen
    end

    return renderAndSet()
end

return ScreenAttr
