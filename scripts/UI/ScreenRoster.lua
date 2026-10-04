-- ============================================================================
-- ScreenRoster — 阵容界面（队友、化学反应与羁绊）
--
-- 玩法定位：
--   这是一个「经营 + 档案」页：把队友从背景数字变成有名有姓的人。
--   上半页是球队化学反应的总账（它此刻值多少球队实力），
--   下半页是每名队友的卡片（评分、羁绊、性格、人设）与每周一次的「加练/交流」。
--
-- 数据全部来自 Core/Teammates.lua；本页只做两件事：
--   · 调 Teammates.interact 消耗体能换羁绊，并把返回文案交给 Toast
--   · 其余只读展示（存档时机由调用方决定，本页不调用 Career.save）
--
-- 布局参考 UI/ScreenBadge.lua：全屏背景 + 顶栏 + 纵向滚动的内容列。
-- ============================================================================

local UI = require("urhox-libs/UI")
local Config = require("Core.Config")
local Career = require("Core.Career")
local Audio = require("Core.Audio")
local Common = require("UI.Common")
local Teammates = require("Core.Teammates")

local ScreenRoster = {}

local C = Config.COLORS

-- 化学反应刻度条：20 格 × 5 点 = 0-100
local GAUGE_SEGMENTS = 20
local GAUGE_STEP = 100 / GAUGE_SEGMENTS
-- 基准线 55：化学反应项在这一刻恰好为 0（见 Core/Teammates.teamPowerBonus）
local CHEM_ANCHOR = 55

-- ---------------------------------------------------------------------------
-- 可换行段落
--
-- 硬性要求：需要换行的 Label 必须同时给
--   whiteSpace = "normal" / lineHeight = 1.4 / flexGrow = 1 / flexShrink = 1 / flexBasis = 0
-- 否则 Yoga 会把多行文本压成 0 宽，整段字都不显示。
-- 外面再包一层 row 容器，让 flexGrow 有主轴可撑（列容器里 flexBasis=0 会塌高）。
-- ---------------------------------------------------------------------------

---@param text string
---@param opts table|nil { fontSize, color, lineHeight }
---@return Panel
local function Paragraph(text, opts)
    local o = opts or {}
    return UI.Panel {
        width = "100%",
        flexDirection = "row",
        children = {
            UI.Label {
                text = text,
                fontSize = o.fontSize or 13,
                fontColor = o.color or C.textMain,
                whiteSpace = "normal",
                lineHeight = o.lineHeight or 1.4,
                flexGrow = 1,
                flexShrink = 1,
                flexBasis = 0,
            },
        },
    }
end

-- ---------------------------------------------------------------------------
-- 小工具
-- ---------------------------------------------------------------------------

--- 羁绊配色：低 = 冷淡，中 = 一般，高 = 铁
---@param bond number
---@return RGBAColor
local function bondColor(bond)
    if bond >= 70 then return C.success end
    if bond >= 40 then return C.secondary end
    if bond >= 20 then return C.accent end
    return C.danger
end

--- 加成值的正负配色
---@param v number
---@return RGBAColor
local function signedColor(v)
    if v > 0 then return C.success end
    if v < 0 then return C.danger end
    return C.textMain
end

--- 羁绊提示语（门槛与加成数值都从 Core 取，避免两处各写一份）
---@param bond number
---@return string
local function bondHint(bond)
    local threshold, bonus = Teammates.bondMilestone()
    if bond >= threshold then
        return string.format("羁绊已达 %d：他是你在场上的自己人（球队实力 +%.1f）。", bond, bonus)
    end
    return string.format("羁绊 %d / %d：再走近一点，他就会在比赛里给你实打实的加成。", bond, threshold)
end

-- ---------------------------------------------------------------------------
-- 化学反应刻度条
-- ---------------------------------------------------------------------------

--- 20 格刻度条：已填充的格子用档位色，55 基准线那一格描黑框
---@param chem number
---@param color RGBAColor
---@return Panel
local function Gauge(chem, color)
    local filled = math.floor(chem / GAUGE_STEP + 0.5)
    local baseSeg = math.floor(CHEM_ANCHOR / GAUGE_STEP)   -- 第 11 格 = 50-55，55 落在它的上沿

    ---@type Panel[]
    local segs = {}
    for i = 1, GAUGE_SEGMENTS do
        segs[i] = UI.Panel {
            flexGrow = 1,
            height = 20,
            backgroundColor = (i <= filled) and color or { 228, 220, 204, 255 },
            borderWidth = (i == baseSeg) and 3 or 0,
            borderColor = C.textMain,
        }
    end

    ---@type string[]
    local ticks = { "0", "25", "50", "75", "100" }
    ---@type table[]
    local tickLabels = {}
    for i = 1, #ticks do
        tickLabels[#tickLabels + 1] = UI.Label {
            text = ticks[i],
            fontSize = 10,
            fontColor = C.textSub,
        }
    end

    return UI.Panel {
        width = "100%",
        flexDirection = "column",
        gap = 6,
        children = {
            UI.Panel {
                width = "100%",
                flexDirection = "row",
                gap = 3,
                children = segs,
            },
            UI.Panel {
                width = "100%",
                flexDirection = "row",
                justifyContent = "space-between",
                children = tickLabels,
            },
            Paragraph("每格 5 点；黑框刻度是 55 基准线，化学反应加到那里时对球队实力既不加分也不扣分。",
                { fontSize = 11, color = C.textSub, lineHeight = 1.4 }),
        },
    }
end

-- ---------------------------------------------------------------------------
-- 化学反应卡
-- ---------------------------------------------------------------------------

---@param state CareerState
---@return Panel
local function ChemBlock(state)
    local chem = Teammates.chemistry(state)
    local tierName, tierDesc = Teammates.chemistryLabel(state)
    local color = Teammates.chemistryColor(state)
    local bonus = Teammates.breakdown(state)

    return UI.Panel {
        width = "100%",
        flexDirection = "column",
        backgroundColor = C.bgCard,
        borderWidth = 3,
        borderColor = C.outline,
        overflow = "hidden",
        children = {
            Common.Bar("球 队 化 学 反 应", color),
            UI.Panel {
                width = "100%",
                flexDirection = "column",
                gap = 10,
                padding = 14,
                children = {
                    -- 数值 + 档位标签 + 当前加成
                    UI.Panel {
                        width = "100%",
                        flexDirection = "row",
                        alignItems = "flex-end",
                        gap = 10,
                        children = {
                            UI.Label {
                                text = tostring(math.floor(chem)),
                                fontSize = 38,
                                fontWeight = "bold",
                                fontColor = color,
                                flexShrink = 0,
                            },
                            UI.Label {
                                text = "/ 100",
                                fontSize = 13,
                                fontColor = C.textSub,
                                flexShrink = 0,
                            },
                            UI.Panel {
                                flexGrow = 1,
                                flexShrink = 1,
                                flexBasis = 0,
                                flexDirection = "column",
                                alignItems = "flex-end",
                                gap = 4,
                                children = {
                                    Common.Tag(tierName, color),
                                    UI.Label {
                                        text = string.format("化学反应加成 %+.1f", bonus.chemistry),
                                        fontSize = 12,
                                        fontWeight = "bold",
                                        fontColor = signedColor(bonus.chemistry),
                                    },
                                },
                            },
                        },
                    },

                    Gauge(chem, color),

                    Paragraph(tierDesc, { fontSize = 12, color = C.textSub, lineHeight = 1.5 }),
                },
            },
        },
    }
end

-- ---------------------------------------------------------------------------
-- 队友卡
-- ---------------------------------------------------------------------------

--- 位置方块（没有专门立绘，用漫画风色块 + 位置简称做视觉焦点）
---@param tm Teammate
---@return Panel
local function PosBadge(tm)
    local posName = Career.getPositionDef(tm.pos).name
    return UI.Panel {
        width = 68,
        height = 68,
        flexShrink = 0,
        backgroundColor = C.bgCardLight,
        borderWidth = 3,
        borderColor = C.outline,
        justifyContent = "center",
        alignItems = "center",
        gap = 2,
        children = {
            UI.Label {
                text = Career.getPositionDef(tm.pos).short,
                fontSize = 19,
                fontWeight = "bold",
                fontColor = C.primary,
            },
            UI.Label {
                text = posName,
                fontSize = 9,
                fontColor = C.textSub,
            },
        },
    }
end

---@param state CareerState
---@param tm Teammate
---@param isStarter boolean 是否二当家（队内评分最高）
---@param onInteract fun(id: string)
---@return Panel
local function TeammateCard(state, tm, isStarter, onInteract)
    local can = Teammates.canInteract(state, tm.id)
    local usedText = can
        and ("加 练 / 交 流（体能 -" .. tostring(Teammates.interactCost()) .. "）")
        or "本周已交流"

    return UI.Panel {
        width = "100%",
        flexDirection = "column",
        backgroundColor = C.bgCard,
        borderWidth = 3,
        borderColor = C.outline,
        overflow = "hidden",
        children = {
            -- 标题条：姓名 + 评分（墨黑底，与化学反应卡区分开）
            UI.Panel {
                width = "100%",
                flexDirection = "row",
                alignItems = "center",
                justifyContent = "space-between",
                paddingHorizontal = 12,
                paddingVertical = 7,
                backgroundColor = C.textMain,
                children = {
                    UI.Panel {
                        flexDirection = "row",
                        alignItems = "center",
                        gap = 8,
                        flexShrink = 1,
                        children = {
                            UI.Label {
                                text = tm.name,
                                fontSize = 17,
                                fontWeight = "bold",
                                fontColor = { 255, 255, 255, 255 },
                                letterSpacing = 2,
                            },
                            -- 只有二当家挂标签，其余留白（位置与评分在卡片里已经写清楚了）
                            isStarter and Common.Tag("二当家", C.accent) or UI.Panel { width = 0 },
                        },
                    },
                    UI.Label {
                        text = string.format("评分 %d", tm.rating),
                        fontSize = 15,
                        fontWeight = "bold",
                        fontColor = C.accent,
                        flexShrink = 0,
                    },
                },
            },

            UI.Panel {
                width = "100%",
                flexDirection = "column",
                gap = 10,
                padding = 12,
                children = {
                    -- 位置方块 + 标签行 + 羁绊条
                    UI.Panel {
                        width = "100%",
                        flexDirection = "row",
                        alignItems = "center",
                        gap = 12,
                        children = {
                            PosBadge(tm),
                            UI.Panel {
                                flexGrow = 1,
                                flexShrink = 1,
                                flexBasis = 0,
                                flexDirection = "column",
                                gap = 8,
                                children = {
                                    UI.Panel {
                                        width = "100%",
                                        flexDirection = "row",
                                        alignItems = "center",
                                        gap = 6,
                                        flexWrap = "wrap",
                                        children = {
                                            Common.Tag(tm.traitName, C.primary),
                                            Common.Tag(string.format("%d 岁", tm.age), C.textSub),
                                            Common.Tag(string.format("在队 %d 年", tm.seasonsWithTeam), C.outlineSoft),
                                        },
                                    },
                                    -- 羁绊条（StatBar 自带 flexGrow，放进 row 容器即铺满）
                                    UI.Panel {
                                        width = "100%",
                                        flexDirection = "row",
                                        children = {
                                            Common.StatBar("羁绊", tm.bond, bondColor(tm.bond)),
                                        },
                                    },
                                },
                            },
                        },
                    },

                    -- 性格机制说明
                    Paragraph("性格 · " .. tm.traitDesc, { fontSize = 12, color = C.textMain, lineHeight = 1.45 }),
                    -- 人物介绍
                    Paragraph(tm.bio, { fontSize = 12, color = C.textSub, lineHeight = 1.5 }),
                    -- 羁绊到门槛才算"高羁绊"，会直接给球队实力加分
                    Paragraph(bondHint(tm.bond),
                        { fontSize = 11, color = bondColor(tm.bond), lineHeight = 1.4 }),

                    UI.Button {
                        text = usedText,
                        width = "100%",
                        height = 50,
                        fontSize = 15,
                        fontWeight = "bold",
                        backgroundColor = can and C.secondary or { 216, 208, 194, 255 },
                        textColor = { 255, 255, 255, 255 },
                        hoverBackgroundColor = { 72, 152, 226, 255 },
                        pressedBackgroundColor = { 28, 96, 168, 255 },
                        borderWidth = 3,
                        borderColor = C.outline,
                        letterSpacing = 2,
                        disabled = not can,
                        onClick = function()
                            onInteract(tm.id)
                        end,
                    },
                },
            },
        },
    }
end

-- ---------------------------------------------------------------------------
-- 球队实力总览
-- ---------------------------------------------------------------------------

---@param state CareerState
---@return Panel
local function OverviewBlock(state)
    local bonus = Teammates.breakdown(state)
    local avg = Teammates.avgRating(state)
    local count = #Teammates.list(state)
    local bondThreshold, bondBonus = Teammates.bondMilestone()

    return Common.Block("球 队 实 力 总 览", {
        UI.Panel {
            width = "100%",
            flexDirection = "row",
            gap = 10,
            children = {
                Common.StatBox(string.format("%.1f", avg), "阵容评分", C.primary),
                Common.StatBox(string.format("%+.1f", bonus.chemistry), "化学反应加成", signedColor(bonus.chemistry)),
                Common.StatBox(string.format("%+.1f", bonus.total), "合计加成", signedColor(bonus.total)),
            },
        },
        Common.KV("高羁绊队友",
            string.format("%d / %d 人（羁绊 ≥ %d，每人 +%.1f）", bonus.highBond, count, bondThreshold, bondBonus),
            C.secondary),
        Common.KV("性格固定加成", string.format("%+.1f", bonus.trait), signedColor(bonus.trait)),
        Common.KV("二当家", Teammates.starterName(state)),
        Paragraph(
            "合计加成会直接加在比赛里的球队实力上：正值让队友多跑一步、多抢一个篮板；负值则相反，" ..
            "球队会在你手感不好的晚上也跟着一起哑火。",
            { fontSize = 11, color = C.textSub, lineHeight = 1.5 }),
    }, { barColor = C.primary })
end

-- ---------------------------------------------------------------------------
-- 构建
-- ---------------------------------------------------------------------------

--- 构建阵容界面
---@param state CareerState
---@param onBack fun()
---@return Widget
function ScreenRoster.Build(state, onBack)
    local function handleBack()
        Audio.Play("click")
        onBack()
    end

    -- 无存档兜底
    if not state then
        return Common.Screen(Config.ART.bgLocker, {
            Common.TopBar("阵 容", handleBack),
            UI.Panel {
                width = "100%",
                padding = 16,
                children = { Common.Sub("没有生涯数据。", 14) },
            },
        }, { dim = 0.5 })
    end

    Audio.PlayBgm("daily")

    -- 首次进入 / 换队 / 新赛季时把阵容补齐（幂等，重复调用无副作用）
    Teammates.ensure(state)

    -- 互动成功后整页重建，把羁绊条、化学反应与按钮状态一次刷新到位
    -- （与 ScreenBadge 同一套刷新方式；存档时机由调用方决定，这里只负责提示）
    local refresh
    refresh = function()
        UI.SetRoot(ScreenRoster.Build(state, onBack))
    end

    ---@param id string
    local function handleInteract(id)
        local ok, msg = Teammates.interact(state, id)
        UI.Toast.Show({
            message = msg,
            variant = ok and "success" or "warning",
            duration = 2,
        })
        if ok then
            Audio.Play("levelup")
            refresh()
        else
            Audio.Play("click")
        end
    end

    local list = Teammates.list(state)

    -- 二当家 = 队内评分最高的队友（并列时取靠前的那个）
    local starterIdx = 0
    ---@type Teammate|nil
    local starter = nil
    for i = 1, #list do
        local tm = list[i]
        if tm and (not starter or tm.rating > starter.rating) then
            starter = tm
            starterIdx = i
        end
    end

    ---@type table[]
    local cards = {
        ChemBlock(state),
        Common.Sub(string.format("%s · 队友 %d 人（每周每人可交流一次）", state.team or "球队", #list), 12),
    }
    for i = 1, #list do
        cards[#cards + 1] = TeammateCard(state, list[i], i == starterIdx, handleInteract)
    end
    cards[#cards + 1] = OverviewBlock(state)

    print(string.format("[ScreenRoster] 打开阵容界面：%s | %d 人 | 化学反应 %d | 合计加成 %+.1f",
        state.team or "", #list, Teammates.chemistry(state), Teammates.teamPowerBonus(state)))

    return Common.Screen(Config.ART.bgLocker, {
        Common.TopBar("阵 容", handleBack),

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
                    padding = 16,
                    paddingBottom = 28,
                    children = cards,
                },
            },
        },
    }, { dim = 0.45 })
end

return ScreenRoster
