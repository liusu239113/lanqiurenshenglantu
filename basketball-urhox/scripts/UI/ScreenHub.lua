-- ============================================================================
-- ScreenHub — 生涯主页（热血漫画分镜布局）
-- 顶栏球员牌 + 分镜格内容区 + 底栏行动
-- ============================================================================

local UI = require("urhox-libs/UI")
local Config = require("Core.Config")
local Career = require("Core.Career")
local MiniGame = require("Core.MiniGame")
local Injury = require("Core.Injury")
local Audio = require("Core.Audio")
local Common = require("UI.Common")
local AdWidgets = require("UI.AdWidgets")

local ScreenHub = {}

local C = Config.COLORS

-- ---------------------------------------------------------------------------
-- 行动选择层
-- ---------------------------------------------------------------------------

--- 构建行动选择覆盖层
---@param state CareerState
---@param onSelect fun(actionId: string)
---@param onCancel fun()
---@return Panel
function ScreenHub.BuildActionPicker(state, onSelect, onCancel)
    ---@type table[]
    local actionButtons = {}

    for i = 1, #Config.ACTIONS do
        local act = Config.ACTIONS[i]
        local cost = Config.ACTION_COST[act.id] or 0
        local enough = true
        local costText

        if cost > 0 then
            costText = string.format("体力 -%d", cost)
            if state.stamina < cost then
                enough = false
                costText = costText .. " 不足"
            end
        elseif cost < 0 then
            costText = string.format("体力 +%d", -cost)
        else
            costText = "无消耗"
        end

        local id = act.id
        actionButtons[i] = UI.Button {
            width = "100%",
            height = 64,
            paddingHorizontal = 14,
            backgroundColor = enough and C.bgCard or { 232, 226, 212, 255 },
            hoverBackgroundColor = C.bgCardLight,
            pressedBackgroundColor = { 236, 226, 208, 255 },
            borderWidth = 3,
            borderColor = C.outline,
            disabled = not enough,
            onClick = function()
                Audio.Play("click")
                onSelect(id)
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
                            flexShrink = 1,
                            children = {
                                UI.Label {
                                    text = act.name,
                                    fontSize = 16,
                                    fontWeight = "bold",
                                    fontColor = enough and C.textMain or C.textSub,
                                },
                                UI.Label {
                                    text = act.desc,
                                    fontSize = 11,
                                    fontColor = C.textSub,
                                },
                            },
                        },
                        UI.Label {
                            text = costText,
                            fontSize = 12,
                            fontWeight = "bold",
                            fontColor = enough and C.secondary or C.danger,
                        },
                    },
                },
            },
        }
    end

    return UI.Panel {
        width = "100%",
        height = "100%",
        flexDirection = "row",
        justifyContent = "center",
        alignItems = "center",
        backgroundColor = { 26, 22, 20, 200 },
        children = {
            UI.Panel {
                width = "100%",
                maxWidth = Common.CONTENT_MAX_W,
                paddingHorizontal = 16,
                children = {
                    UI.Panel {
                        width = "100%",
                        flexDirection = "column",
                        backgroundColor = C.bgCard,
                        borderWidth = 3,
                        borderColor = C.outline,
                        overflow = "hidden",
                        children = {
                            Common.Bar("本 周 行 动", C.primary),
                            UI.Panel {
                                width = "100%",
                                flexDirection = "column",
                                gap = 10,
                                padding = 14,
                                children = {
                                    UI.Label {
                                        text = "选择一项训练，然后推进一周",
                                        fontSize = 12,
                                        fontColor = C.textSub,
                                    },
                                    UI.Panel {
                                        flexDirection = "column",
                                        gap = 10,
                                        children = actionButtons,
                                    },
                                    Common.OutlineButton("取消", function()
                                        Audio.Play("click")
                                        onCancel()
                                    end),
                                },
                            },
                        },
                    },
                },
            },
        },
    }
end

-- ---------------------------------------------------------------------------
-- 主页
-- ---------------------------------------------------------------------------

--- 构建主页
---@param state CareerState
---@param onAction fun()
---@param onAdvance fun()
---@param onTraining fun()
---@param actionText string
---@param onToggleMode fun()|nil 切换比赛模式
---@return Panel
function ScreenHub.Build(state, onAction, onAdvance, onTraining, actionText, onToggleMode)
    Audio.PlayBgm("daily")

    local stage = Career.getStage()
    local ov = Career.getOverall()
    local posName = Career.getPositionName()
    local ppg = Career.getPPG()
    local injured = (state.injuryDays or 0) > 0

    -- ---- 顶栏：球员牌 ----
    local topBar = UI.Panel {
        width = "100%",
        flexDirection = "column",
        gap = 10,
        padding = 14,
        backgroundColor = C.bgPanel,
        borderBottomWidth = 3,
        borderBottomColor = C.outline,
        children = {
            UI.Panel {
                flexDirection = "row",
                alignItems = "center",
                gap = 12,
                children = {
                    -- 头像（方形，漫画格）
                    UI.Panel {
                        width = 58, height = 58,
                        flexShrink = 0,
                        backgroundImage = Config.ART.avatar,
                        backgroundFit = "cover",
                        borderWidth = 3,
                        borderColor = C.outline,
                    },
                    -- 姓名 + 标签
                    UI.Panel {
                        flexGrow = 1, flexShrink = 1, flexBasis = 0,
                        flexDirection = "column",
                        gap = 5,
                        children = {
                            UI.Label {
                                text = state.name,
                                fontSize = 20,
                                fontWeight = "bold",
                                fontColor = C.textMain,
                                letterSpacing = 1,
                            },
                            UI.Panel {
                                flexDirection = "row",
                                gap = 5,
                                flexWrap = "wrap",
                                children = {
                                    Common.Tag(posName, C.secondary),
                                    Common.Tag(stage.name, C.primary),
                                    Common.Tag(string.format("%d岁", state.age)),
                                },
                            },
                        },
                    },
                    -- 综合评分（橙红方块）
                    UI.Panel {
                        width = 64, flexShrink = 0,
                        flexDirection = "column",
                        alignItems = "center",
                        paddingVertical = 6,
                        backgroundColor = C.primary,
                        borderWidth = 3,
                        borderColor = C.outline,
                        children = {
                            UI.Label {
                                text = tostring(ov),
                                fontSize = 26,
                                fontWeight = "bold",
                                fontColor = { 255, 255, 255, 255 },
                            },
                            UI.Label {
                                text = "综合",
                                fontSize = 10,
                                fontWeight = "bold",
                                fontColor = { 255, 235, 225, 240 },
                            },
                        },
                    },
                },
            },

            -- 赛季信息行
            UI.Panel {
                flexDirection = "row",
                justifyContent = "space-between",
                alignItems = "center",
                children = {
                    UI.Label {
                        text = string.format("第 %d 赛季 · 第 %d 周", state.season, state.week),
                        fontSize = 12,
                        fontWeight = "bold",
                        fontColor = C.textSub,
                    },
                    UI.Label {
                        text = state.team,
                        fontSize = 12,
                        fontWeight = "bold",
                        fontColor = C.primary,
                    },
                },
            },

            -- 体力 / 士气
            UI.Panel {
                flexDirection = "row",
                gap = 14,
                children = {
                    Common.StatBar("体力", state.stamina, C.success),
                    Common.StatBar("士气", state.morale, C.primary),
                },
            },

            -- 伤病徽章 + 常驻痊愈按钮（顶栏常驻，与参考设计一致）
            injured and UI.Panel {
                width = "100%",
                flexDirection = "row",
                alignItems = "center",
                gap = 8,
                padding = 8,
                backgroundColor = { 255, 232, 228, 255 },
                borderWidth = 2,
                borderColor = C.danger,
                children = {
                    UI.Label {
                        text = string.format("伤病 %d 天", state.injuryDays),
                        fontSize = 12,
                        fontWeight = "bold",
                        fontColor = C.danger,
                        flexShrink = 0,
                    },
                    UI.Label {
                        text = state.injuryName or "",
                        fontSize = 11,
                        fontColor = C.textSub,
                        flexGrow = 1,
                        flexBasis = 0,
                        whiteSpace = "normal",
                    },
                },
            } or UI.Panel { height = 0 },
        },
    }

    -- ---- 内容分镜格 ----
    ---@type table[]
    local blocks = {}

    -- 阶段卡（带背景图的大格）
    table.insert(blocks, UI.Panel {
        width = "100%",
        height = 140,
        backgroundImage = stage.bg,
        backgroundFit = "cover",
        borderWidth = 3,
        borderColor = C.outline,
        overflow = "hidden",
        children = {
            UI.Panel {
                width = "100%",
                height = "100%",
                justifyContent = "flex-end",
                padding = 14,
                backgroundColor = { 26, 22, 20, 110 },
                children = {
                    UI.Label {
                        text = stage.name,
                        fontSize = 24,
                        fontWeight = "bold",
                        fontColor = { 255, 255, 255, 255 },
                        letterSpacing = 2,
                    },
                    UI.Label {
                        text = string.format("球队强度 %d", stage.teamStrength),
                        fontSize = 12,
                        fontColor = { 240, 235, 225, 220 },
                    },
                },
            },
        },
    })

    -- 最近战报
    local lr = state.lastResult
    if lr then
        local resultColor = lr.win and C.success or C.danger
        table.insert(blocks, Common.Block("最 近 战 报", {
            UI.Panel {
                flexDirection = "row",
                alignItems = "center",
                gap = 12,
                children = {
                    UI.Panel {
                        width = 52, height = 52, flexShrink = 0,
                        backgroundColor = resultColor,
                        borderWidth = 3,
                        borderColor = C.outline,
                        justifyContent = "center",
                        alignItems = "center",
                        children = {
                            UI.Label {
                                text = lr.win and "胜" or "负",
                                fontSize = 26,
                                fontWeight = "bold",
                                fontColor = { 255, 255, 255, 255 },
                            },
                        },
                    },
                    UI.Panel {
                        flexGrow = 1, flexShrink = 1, flexBasis = 0,
                        flexDirection = "column",
                        gap = 4,
                        children = {
                            UI.Label {
                                text = lr.summary or "",
                                fontSize = 13,
                                fontWeight = "bold",
                                fontColor = C.textMain,
                                whiteSpace = "normal",
                                lineHeight = 1.4,
                            },
                            UI.Label {
                                text = string.format("比分 %d : %d", lr.teamPoints or 0, lr.oppPoints or 0),
                                fontSize = 12,
                                fontColor = C.textSub,
                            },
                        },
                    },
                },
            },
        }, { barColor = resultColor }))

        -- 高光
        if lr.highlights and #lr.highlights > 0 then
            ---@type table[]
            local hl = {}
            for i = 1, math.min(2, #lr.highlights) do
                hl[i] = UI.Label {
                    text = "★ " .. lr.highlights[i],
                    fontSize = 12,
                    fontColor = C.textMain,
                    whiteSpace = "normal",
                    lineHeight = 1.5,
                }
            end
            table.insert(blocks, Common.Block("本 场 高 光", hl, { barColor = C.accent }))
        end
    end

    -- 能力面板
    ---@type table[]
    local attrRows = {}
    for i = 1, #Config.ATTRS do
        local def = Config.ATTRS[i]
        attrRows[i] = Common.AttrRow(def, state.attrs[def.key] or 0)
    end
    table.insert(blocks, Common.Block("能 力 面 板", attrRows))

    -- 生涯数据
    table.insert(blocks, Common.Block("生 涯 数 据", {
        UI.Panel {
            flexDirection = "row",
            gap = 8,
            children = {
                Common.StatBox(tostring(state.games), "出场"),
                Common.StatBox(tostring(state.totalPoints), "总得分", C.primary),
                Common.StatBox(string.format("%.1f", ppg), "场均", C.accent),
                Common.StatBox(tostring(#state.honors), "荣誉", C.success),
            },
        },
        UI.Divider { color = { 26, 22, 20, 60 } },
        Common.KV("人气", tostring(state.fame), C.accent),
        Common.KV("存款", string.format("%d 万", state.money), C.success),
        Common.KV("年薪", string.format("%d 万", state.salary)),
    }, { barColor = C.textMain }))

    -- 免费福利（广告位聚合面板）
    table.insert(blocks, AdWidgets.WelfarePanel(state, {
        heal = function()
            return Injury.healAll(state)
        end,
        attrPoints = function()
            Career.addExp(500)
            return "经验池 +500（可兑换 5 点属性）"
        end,
        sp = function()
            Career.addSkillPoints(3)
            return "技能点 +3"
        end,
        adBreak = function()
            -- 突破当前最高属性项的潜力上限
            local bestKey, bestVal = nil, -1
            for i = 1, #Config.ATTRS do
                local def = Config.ATTRS[i]
                local v = state.attrs[def.key] or 0
                if v > bestVal then bestKey, bestVal = def.key, v end
            end
            if bestKey then
                Career.addPotential(bestKey, 5)
                return "潜力上限 +5，可以继续成长了"
            end
            return "潜力已提升"
        end,
        endorse = function()
            local pay = math.floor(20 + state.fame / 12)
            local names = { "运动饮料", "球鞋品牌", "腕表", "汽车", "手机" }
            local name = names[math.random(1, #names)]
            Career.addEndorsement(name, pay, 2)
            return string.format("签下「%s」代言，每赛季 %d 万", name, pay)
        end,
        lottery = function()
            local prize = 300
            Career.addMoney(prize)
            return string.format("恭喜中头奖！奖金 +%d 万", prize)
        end,
    }))

    -- 大事记
    if #state.log > 0 then
        ---@type table[]
        local logs = {}
        local n = math.min(5, #state.log)
        for i = 1, n do
            logs[i] = UI.Panel {
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
                        text = state.log[i],
                        fontSize = 12,
                        fontColor = C.textSub,
                        whiteSpace = "normal",
                        lineHeight = 1.5,
                        flexShrink = 1,
                    },
                },
            }
        end
        table.insert(blocks, Common.Block("生 涯 大 事 记", logs, { barColor = C.secondary }))
    end

    -- ---- 底栏 ----
    ---@type table[]
    local bottomChildren = {}

    if actionText and actionText ~= "" then
        table.insert(bottomChildren, UI.Panel {
            width = "100%",
            flexDirection = "row",
            alignItems = "center",
            gap = 8,
            padding = 9,
            backgroundColor = { 232, 246, 232, 255 },
            borderWidth = 2,
            borderColor = C.outline,
            children = {
                UI.Label { text = "✓", fontSize = 14, fontWeight = "bold", fontColor = C.success },
                UI.Label {
                    text = actionText,
                    fontSize = 12,
                    fontWeight = "bold",
                    fontColor = C.textMain,
                    whiteSpace = "normal",
                    flexShrink = 1,
                },
            },
        })
    end

    -- 训练馆入口 + 比赛模式切换
    table.insert(bottomChildren, UI.Panel {
        width = "100%",
        flexDirection = "row",
        gap = 10,
        children = {
            UI.Button {
                text = "🏀 训 练 馆",
                flexGrow = 1, flexBasis = 0,
                height = 46,
                fontSize = 14,
                fontWeight = "bold",
                backgroundColor = { 168, 62, 148, 255 },
                textColor = { 255, 255, 255, 255 },
                borderWidth = 3,
                borderColor = C.outline,
                onClick = function()
                    Audio.Play("click")
                    onTraining()
                end,
            },
            UI.Button {
                text = state.matchMode == "text" and "📺 文字直播" or "🎮 操作比赛",
                flexGrow = 1, flexBasis = 0,
                height = 46,
                fontSize = 14,
                fontWeight = "bold",
                backgroundColor = C.textMain,
                textColor = { 255, 255, 255, 255 },
                borderWidth = 3,
                borderColor = C.outline,
                onClick = function()
                    Audio.Play("click")
                    if onToggleMode then onToggleMode() end
                end,
            },
        },
    })

    table.insert(bottomChildren, UI.Panel {
        flexDirection = "row",
        gap = 10,
        children = {
            UI.Button {
                text = actionText == "" and "本 周 行 动" or "更 换 行 动",
                flexGrow = 1, flexBasis = 0,
                height = 54,
                fontSize = 15,
                fontWeight = "bold",
                backgroundColor = C.secondary,
                textColor = { 255, 255, 255, 255 },
                borderWidth = 3,
                borderColor = C.outline,
                onClick = function()
                    Audio.Play("click")
                    onAction()
                end,
            },
            UI.Button {
                text = "推 进 一 周",
                flexGrow = 1, flexBasis = 0,
                height = 54,
                fontSize = 15,
                fontWeight = "bold",
                backgroundColor = C.primary,
                textColor = { 255, 255, 255, 255 },
                borderWidth = 3,
                borderColor = C.outline,
                onClick = function()
                    Audio.Play("whistle")
                    onAdvance()
                end,
            },
        },
    })

    return Common.Screen(stage.bg, {
        topBar,
        UI.ScrollView {
            flexGrow = 1,
            flexBasis = 0,
            scrollY = true,
            showScrollbar = true,
            children = {
                UI.Panel {
                    width = "100%",
                    flexDirection = "column",
                    gap = 12,
                    padding = 14,
                    paddingBottom = 24,
                    children = blocks,
                },
            },
        },
        UI.Panel {
            width = "100%",
            flexDirection = "column",
            gap = 9,
            padding = 12,
            backgroundColor = C.bgPanel,
            borderTopWidth = 3,
            borderTopColor = C.outline,
            children = bottomChildren,
        },
    }, { dim = 0.5 })
end

return ScreenHub
