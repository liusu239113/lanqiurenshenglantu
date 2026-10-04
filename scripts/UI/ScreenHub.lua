-- ============================================================================
-- ScreenHub — 生涯主页（热血漫画分镜布局）
-- 顶栏球员牌 + 分镜格内容区 + 底栏行动
-- ============================================================================

local UI = require("urhox-libs/UI")
local Config = require("Core.Config")
local Career = require("Core.Career")
local Transfer = require("Core.Transfer")
local AdWidgets = require("UI.AdWidgets")
local Audio = require("Core.Audio")
local Common = require("UI.Common")

local ScreenHub = {}

local C = Config.COLORS

-- ---------------------------------------------------------------------------
-- 行动选择层
-- ---------------------------------------------------------------------------

--- 构建行动选择覆盖层
---@param state CareerState
---@param onSelect fun(actionId: string)
---@param onCancel fun()
---@param opts table|nil {
---  focusActive: boolean, focusCharges: number|nil, onFocusAd: fun(): string|nil,
---  onActionDouble: fun(): string|nil, actionDoubleActive: boolean|nil, rebuild: fun()|nil }
---@return Panel
function ScreenHub.BuildActionPicker(state, onSelect, onCancel, opts)
    local o = opts or {}
    local onFocusAd = o.onFocusAd
    local focusActive = o.focusActive
    local focusCharges = o.focusCharges or 0
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
                height = "92%",
                paddingHorizontal = 16,
                children = {
                    UI.Panel {
                        width = "100%",
                        height = "100%",
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
                                flexGrow = 1,
                                flexBasis = 0,
                                children = {
                                    UI.Label {
                                        text = "选择一项训练，然后推进一周",
                                        fontSize = 12,
                                        fontColor = C.textSub,
                                    },
                                    UI.ScrollView {
                                        width = "100%", flexGrow = 1, flexBasis = 0,
                                        scrollY = true, showScrollbar = true,
                                        children = { UI.Panel {
                                            width = "100%", flexDirection = "column", gap = 8,
                                            children = actionButtons,
                                        } },
                                    },

                                    focusActive and UI.Panel {
                                        width = "100%",
                                        padding = 10,
                                        backgroundColor = { 232, 246, 232, 255 },
                                        borderWidth = 2,
                                        borderColor = C.outline,
                                        children = {
                                            UI.Label {
                                                text = string.format("√ 全神贯注中：接下来 %d 次训练必定拿满档", focusCharges),
                                                fontSize = 12,
                                                fontWeight = "bold",
                                                fontColor = C.success,
                                                textAlign = "center",
                                                whiteSpace = "normal",
                                            },
                                        },
                                    } or (onFocusAd and AdWidgets.Button(state, "focus", onFocusAd,
                                        { height = 48, fontSize = 13, onFinished = o.rebuild })
                                        or UI.Panel { height = 0 }),
                                    o.onActionDouble and AdWidgets.Button(state, "actionDouble", function()
                                        return o.onActionDouble()
                                    end, {
                                        label = "▶ 看广告 · 下次周训练属性与经验翻倍",
                                        height = 48, fontSize = 12, onFinished = o.rebuild,
                                    }) or (o.actionDoubleActive and UI.Label {
                                        text = "√ 私人教练已就位：下次周训练属性与经验翻倍",
                                        fontSize = 12, fontColor = C.success, whiteSpace = "normal",
                                    } or UI.Panel { height = 0 }),

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

--- 主页各入口的回调集合
---@class HubActions
---@field onAction fun()            打开周行动选择
---@field onAdvance fun()           推进一周
---@field onTraining fun()          训练馆
---@field actionText string        本周已选行动的结果文案
---@field onToggleMode fun()|nil   切换比赛模式
---@field onAttr fun()|nil         能力特训（加点）页
---@field onTransfer fun()|nil     转会市场
---@field onFinance fun()|nil      经纪与财务
---@field onWelfare fun()|nil      球队福利
---@field onBadge fun()|nil        徽章墙
---@field onRival fun()|nil        宿敌页
---@field onRoster fun()|nil       阵容页
---@field onAllStar fun()|nil      全明星周末
---@field allStarReady boolean|nil 本赛季全明星周末是否可参加
---@field rosterNote string|nil    阵容一句话摘要（化学反应档位）
---@field rivalNote string|nil     宿敌一句话摘要（姓名 + 战绩）
---@field onStory fun()|nil        已读人生故事

--- 构建主页
---@param state CareerState
---@param actions HubActions
---@return Panel
function ScreenHub.Build(state, actions)
    local onAction = actions.onAction
    local onAdvance = actions.onAdvance
    local onTraining = actions.onTraining
    local actionText = actions.actionText
    local onToggleMode = actions.onToggleMode
    local onAttr = actions.onAttr
    local onTransfer = actions.onTransfer
    local onFinance = actions.onFinance
    local onWelfare = actions.onWelfare
    local onBadge = actions.onBadge
    local onRival = actions.onRival
    local onRoster = actions.onRoster
    local onAllStar = actions.onAllStar
    local allStarReady = actions.allStarReady == true
    local onStory = actions.onStory
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
                                    -- 带独特机制的出身加 ◆ 标记，提示玩家该出身有额外效果
                                    Common.Tag(Career.getOriginDef(state.originId).perk
                                        and ("◆ " .. Career.getOriginDef(state.originId).name)
                                        or Career.getOriginDef(state.originId).name, C.textMain),
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
    local Schedule = require("Core.Schedule")
    local Timeline = require("Core.Timeline")
    Schedule.ensure(state)
    Timeline.ensure(state)
    local wins, losses = Schedule.record(state)
    local recordText = string.format("%s · 球队强度 %d", Transfer.tierName(state.teamTier or 1),
        Transfer.teamStrength(state, stage))
    if wins + losses > 0 then
        recordText = recordText .. string.format(" · 战绩 %d胜%d负", wins, losses)
    end

    -- 季后赛进行中：在阶段卡顶部盖一条醒目横幅
    local playoffLabel = Schedule.playoffLabel(state)

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
                        text = recordText,
                        fontSize = 12,
                        fontColor = { 240, 235, 225, 220 },
                    },
                },
            },
            playoffLabel and UI.Panel {
                width = "100%",
                paddingVertical = 6,
                paddingHorizontal = 14,
                backgroundColor = C.primary,
                children = {
                    UI.Label {
                        text = "★ " .. playoffLabel,
                        fontSize = 13,
                        fontWeight = "bold",
                        fontColor = { 255, 255, 255, 255 },
                    },
                },
            } or UI.Panel { height = 0 },
        },
    })

    -- 本人正在经历的人生，比训练面板和数据更先呈现。
    local history = state.storyHistory or {}
    local lastChapter = history[#history]
    table.insert(blocks, Common.Block("人 生 故 事 · " .. tostring(state.age) .. " 岁", {
        UI.Label {
            text = lastChapter and lastChapter.title or "下一章，就从今天开始",
            fontSize = 18, fontWeight = "bold", fontColor = C.primary,
            whiteSpace = "normal",
        },
        UI.Label {
            text = lastChapter and (lastChapter.response or "") or "球场上的输赢之外，还有家人、伙伴与更漫长的人生。",
            fontSize = 13, fontColor = C.textMain, whiteSpace = "normal", lineHeight = 1.6,
        },
        Common.OutlineButton(string.format("翻 阅 人 生 故 事（%d 章）", #history), function()
            if onStory then onStory() end
        end, { height = 48, fontSize = 14 }),
    }, { barColor = C.primary }))

    -- ---- 本周日程：推进之前先告诉玩家这周会面对什么 ----
    -- 此前「推进一周」是盲盒：玩家不知道这周是比赛日还是休整日，
    -- 也不知道有没有剧情事件，更不知道自己跟谁打、比赛日程是什么。
    local weekKind = Schedule.weekKind(state)
    local opp = Schedule.weekOpponent(state)
    local tlEntry = Timeline.get(state, state.week)

    ---@type table[]
    local weekChildren = {}

    -- 本周标签
    ---@type string
    local kindText
    ---@type RGBAColor
    local kindColor
    if weekKind == "playoff" then
        kindText = "季后赛"
        kindColor = C.primary
    elseif weekKind == "game" then
        kindText = "比赛日"
        kindColor = C.primary
    elseif weekKind == "offseason" then
        kindText = "休赛期"
        kindColor = C.textSub
    else
        kindText = "休整日"
        kindColor = C.secondary
    end

    table.insert(weekChildren, UI.Panel {
        width = "100%",
        flexDirection = "row",
        alignItems = "center",
        gap = 8,
        children = {
            Common.Tag(string.format("第 %d 周", state.week), kindColor),
            Common.Tag(kindText, kindColor),
            opp and Common.Tag(opp.home and "主场" or "客场", C.textMain) or UI.Panel { width = 0 },
        },
    })

    -- 对手情报（有比赛才有）
    if opp then
        local strengthText = Schedule.strengthLabel(opp.strength, state)
        table.insert(weekChildren, UI.Panel {
            width = "100%",
            flexDirection = "row",
            justifyContent = "space-between",
            alignItems = "center",
            padding = 10,
            backgroundColor = C.bgCardLight,
            borderWidth = 2,
            borderColor = C.outline,
            children = {
                UI.Panel {
                    flexDirection = "column",
                    gap = 3,
                    flexGrow = 1,
                    flexShrink = 1,
                    flexBasis = 0,
                    children = {
                        UI.Label {
                            text = opp.playoff
                                and string.format("%s · 对阵 %s", opp.roundName or "季后赛", opp.opponent)
                                or string.format("对阵 %s", opp.opponent),
                            fontSize = 14,
                            fontWeight = "bold",
                            fontColor = C.textMain,
                            whiteSpace = "normal",
                        },
                        UI.Label {
                            text = string.format("对手实力 %d · %s", opp.strength, strengthText),
                            fontSize = 11,
                            fontColor = C.textSub,
                        },
                    },
                },
                UI.Label {
                    text = opp.home and "主场" or "客场",
                    fontSize = 12,
                    fontWeight = "bold",
                    fontColor = opp.home and C.success or C.textSub,
                    flexShrink = 0,
                },
            },
        })
    end

    -- 剧情预告（时间线上排了事件才有）
    if tlEntry and tlEntry.title then
        table.insert(weekChildren, UI.Panel {
            width = "100%",
            flexDirection = "row",
            alignItems = "flex-start",
            gap = 8,
            padding = 10,
            backgroundColor = { 255, 246, 224, 255 },
            borderWidth = 2,
            borderColor = C.accent,
            children = {
                UI.Label { text = "剧情", fontSize = 11, fontWeight = "bold", fontColor = { 196, 120, 16, 255 }, flexShrink = 0 },
                UI.Label {
                    text = tlEntry.title,
                    fontSize = 12,
                    fontWeight = "bold",
                    fontColor = C.textMain,
                    whiteSpace = "normal",
                    lineHeight = 1.4,
                    flexGrow = 1, flexShrink = 1, flexBasis = 0,
                },
            },
        })
    end

    table.insert(blocks, Common.Block("本 周 日 程", weekChildren, { barColor = kindColor }))

    -- ---- 赛程表：整个赛季 8 场，谁打谁一目了然 ----
    local rows = Schedule.rows(state)
    ---@type table[]
    local schedRows = {}
    for i = 1, #rows do
        local r = rows[i]
        local isCurrent = (r.status == "current")

        ---@type string
        local resultText
        ---@type RGBAColor
        local resultColor
        if r.status == "done" then
            resultText = r.win and "胜" or "负"
            resultColor = r.win and C.success or C.danger
        elseif isCurrent then
            resultText = "本周"
            resultColor = C.primary
        else
            resultText = "未打"
            resultColor = C.textSub
        end

        schedRows[i] = UI.Panel {
            width = "100%",
            flexDirection = "row",
            alignItems = "center",
            gap = 8,
            paddingVertical = 6,
            paddingHorizontal = 8,
            backgroundColor = isCurrent and C.bgCardLight or C.bgCard,
            borderWidth = isCurrent and 2 or 0,
            borderColor = C.primary,
            children = {
                UI.Label {
                    text = string.format("W%02d", r.week),
                    fontSize = 11,
                    fontWeight = "bold",
                    fontColor = C.textSub,
                    flexShrink = 0,
                },
                UI.Label {
                    text = (r.home and "主  " or "客  ") .. r.opponent,
                    fontSize = 12,
                    fontWeight = isCurrent and "bold" or "normal",
                    fontColor = C.textMain,
                    flexGrow = 1, flexShrink = 1, flexBasis = 0,
                    whiteSpace = "normal",
                },
                r.status == "done" and UI.Label {
                    text = string.format("%d 分", r.myPoints),
                    fontSize = 10,
                    fontColor = C.textSub,
                    flexShrink = 0,
                } or UI.Panel { width = 0 },
                UI.Label {
                    text = resultText,
                    fontSize = 12,
                    fontWeight = "bold",
                    fontColor = resultColor,
                    flexShrink = 0,
                },
            },
        }
    end

    table.insert(blocks, Common.Block(
        string.format("本 赛 季 赛 程  (%d 胜 %d 负)", wins, losses),
        schedRows, { barColor = C.textMain }))

    -- 经营与成长：2×2 网格（此前 4 个按钮挤一行，中文+emoji 在 360dp 屏上易换行/截断）
    local pts = state.attrPoints or 0
    local BadgesMod = require("Data.Badges")
    local badgePoints = state.skillPoints or 0

    ---@param text string
    ---@param bg table
    ---@param fg table
    ---@param onClick fun()
    local function gridButton(text, bg, fg, onClick)
        return UI.Button {
            text = text,
            flexGrow = 1, flexBasis = 0,
            height = 50,
            fontSize = 14,
            fontWeight = "bold",
            backgroundColor = bg,
            textColor = fg,
            borderWidth = 3,
            borderColor = C.outline,
            onClick = function()
                Audio.Play("click")
                onClick()
            end,
        }
    end

    local WHITE = { 255, 255, 255, 255 }
    table.insert(blocks, Common.Block("经 营 与 成 长", {
        UI.Panel {
            width = "100%",
            flexDirection = "column",
            gap = 8,
            children = {
                UI.Panel {
                    width = "100%",
                    flexDirection = "row",
                    gap = 8,
                    children = {
                        gridButton(
                            pts > 0 and string.format("加点 (%d)", pts) or "加点",
                            pts > 0 and C.success or C.bgCardLight,
                            pts > 0 and WHITE or C.textMain,
                            function() if onAttr then onAttr() end end),
                        gridButton(
                            badgePoints > 0 and string.format("徽章 (%d)", badgePoints) or "徽章",
                            badgePoints > 0 and C.primary or C.bgCardLight,
                            badgePoints > 0 and WHITE or C.textMain,
                            function() if onBadge then onBadge() end end),
                    },
                },
                UI.Panel {
                    width = "100%",
                    flexDirection = "row",
                    gap = 8,
                    children = {
                        gridButton("转会", C.secondary, WHITE,
                            function() if onTransfer then onTransfer() end end),
                        gridButton(
                            Career.welfareAvailable() and "福利 !" or "福利",
                            Career.welfareAvailable() and { 232, 168, 32, 255 } or C.bgCardLight,
                            Career.welfareAvailable() and { 60, 40, 0, 255 } or C.textMain,
                            function() if onWelfare then onWelfare() end end),
                    },
                },
                -- 新增玩法入口：阵容（队友/化学反应）与宿敌（恩怨线）
                UI.Panel {
                    width = "100%",
                    flexDirection = "row",
                    gap = 8,
                    children = {
                        gridButton("阵容", C.bgCardLight, C.textMain,
                            function() if onRoster then onRoster() end end),
                        gridButton("宿敌", C.bgCardLight, C.textMain,
                            function() if onRival then onRival() end end),
                    },
                },
                -- 全明星周末：可参加时用金色整行高亮，这是一次节日级的玩法
                allStarReady and gridButton(
                    "★ 全明星周末（三分大赛 · 扣篮大赛）",
                    { 232, 168, 32, 255 }, { 60, 40, 0, 255 },
                    function() if onAllStar then onAllStar() end end) or UI.Panel { height = 0 },
                -- 一句话摘要：让玩家不点进去也知道队内关系和宿敌战绩
                (actions.rosterNote or actions.rivalNote) and UI.Panel {
                    width = "100%",
                    flexDirection = "column",
                    gap = 3,
                    children = {
                        actions.rosterNote and UI.Label {
                            text = "队内：" .. tostring(actions.rosterNote),
                            fontSize = 11, fontColor = C.textSub,
                            whiteSpace = "normal", lineHeight = 1.35,
                            flexGrow = 1, flexShrink = 1, flexBasis = 0,
                        } or UI.Panel { height = 0 },
                        actions.rivalNote and UI.Label {
                            text = "宿敌：" .. tostring(actions.rivalNote),
                            fontSize = 11, fontColor = C.textSub,
                            whiteSpace = "normal", lineHeight = 1.35,
                            flexGrow = 1, flexShrink = 1, flexBasis = 0,
                        } or UI.Panel { height = 0 },
                    },
                } or UI.Panel { height = 0 },
            },
        },
    }, { barColor = C.secondary }))

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

    -- 能力面板（只读概览 + 进入加点页的入口）
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
                        -- flexGrow + flexBasis=0：让文字撑满剩余宽度。
                        -- 只用 flexShrink=1 时，在 row 布局下宽度会塌缩成 0，文字不显示（只剩左侧方块）
                        flexGrow = 1, flexShrink = 1, flexBasis = 0,
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
                UI.Label { text = "√", fontSize = 14, fontWeight = "bold", fontColor = C.success },
                UI.Label {
                    text = actionText,
                    fontSize = 12,
                    fontWeight = "bold",
                    fontColor = C.textMain,
                    whiteSpace = "normal",
                    -- 同「大事记」：row 布局下只给 flexShrink 会让宽度塌成 0，文字不显示
                    flexGrow = 1, flexShrink = 1, flexBasis = 0,
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
                text = "训 练 馆",
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
                text = state.matchMode == "text" and "文字直播" or "操作比赛",
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
                text = actionText == "" and "本 周 行 动" or "已 安 排",
                flexGrow = 1, flexBasis = 0,
                height = 54,
                fontSize = 15,
                fontWeight = "bold",
                backgroundColor = actionText == "" and C.secondary or { 150, 140, 126, 255 },
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
