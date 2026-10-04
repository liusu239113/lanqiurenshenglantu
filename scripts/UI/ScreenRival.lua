-- ============================================================================
-- ScreenRival — 宿敌界面
--
-- 玩法定位：
--   这是一个"关系档案页"，不承担操作，只负责把一段宿敌关系讲清楚：
--   他是谁、他有多强、你们打了多少次、谁占上风、现在走到哪一步了。
--   所有数据来自 Core/Rival.lua，本页只读不写（除了首次进入时触发一次生成）。
--
-- 布局参考 UI/ScreenBadge.lua：全屏背景 + 顶栏 + 纵向滚动的内容列。
-- ============================================================================

local UI = require("urhox-libs/UI")
local Config = require("Core.Config")
local Career = require("Core.Career")
local Audio = require("Core.Audio")
local Common = require("UI.Common")
local Rival = require("Core.Rival")
local Schedule = require("Core.Schedule")

local ScreenRival = {}

local C = Config.COLORS

-- ---------------------------------------------------------------------------
-- 可换行段落
--
-- 硬性要求：需要换行的 Label 必须同时给
--   whiteSpace = "normal" / lineHeight = 1.4 / flexGrow = 1 / flexShrink = 1 / flexBasis = 0
-- 否则在 flex 布局里会被压成 0 宽，整段字都不显示。
-- 外面再包一层 row 容器，让 flexGrow 有主轴可撑（列容器里 flexBasis=0 会塌高）。
-- ---------------------------------------------------------------------------

--- 可换行正文段落
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
-- 宿敌头像占位块
-- 没有专门为宿敌准备立绘资源，用漫画风色块 + 姓名做视觉焦点，
-- 比直接复用玩家头像更不容易让人误会。
-- ---------------------------------------------------------------------------

---@param r RivalDef
---@return Panel
local function Portrait(r)
    return UI.Panel {
        width = 76,
        height = 76,
        flexShrink = 0,
        backgroundColor = C.bgCardLight,
        borderWidth = 3,
        borderColor = C.outline,
        justifyContent = "center",
        alignItems = "center",
        children = {
            UI.Label {
                text = r.name or "宿敌",
                fontSize = 24,
                fontWeight = "bold",
                fontColor = C.danger,
                textAlign = "center",
                whiteSpace = "normal",
                lineHeight = 1.1,
            },
        },
    }
end

-- ---------------------------------------------------------------------------
-- 宿敌主卡
-- ---------------------------------------------------------------------------

---@param state CareerState
---@param r RivalDef
---@return Panel
local function RivalCard(state, r)
    local power = Rival.power(state)
    local stageTitle = Rival.stageTitle(state)
    local posName = Career.getPositionDef(r.pos or state.positionId).name
    local injured = Rival.isInjured(state)

    return UI.Panel {
        width = "100%",
        flexDirection = "column",
        backgroundColor = C.bgCard,
        borderWidth = 3,
        borderColor = C.outline,
        overflow = "hidden",
        children = {
            -- 标题条：用成长阶段做副标题，一眼看出关系走到哪一步
            Common.Bar("宿 敌 · " .. stageTitle, C.danger),

            UI.Panel {
                width = "100%",
                flexDirection = "column",
                gap = 10,
                padding = 14,
                children = {
                    -- 头像 + 姓名 / 位置 / 球队
                    UI.Panel {
                        width = "100%",
                        flexDirection = "row",
                        alignItems = "center",
                        gap = 12,
                        children = {
                            Portrait(r),
                            UI.Panel {
                                flexGrow = 1,
                                flexShrink = 1,
                                flexBasis = 0,
                                flexDirection = "column",
                                gap = 6,
                                children = {
                                    UI.Label {
                                        text = r.name or "宿敌",
                                        fontSize = 24,
                                        fontWeight = "bold",
                                        fontColor = C.textMain,
                                    },
                                    UI.Panel {
                                        flexDirection = "row",
                                        alignItems = "center",
                                        gap = 6,
                                        children = {
                                            Common.Tag(posName, C.secondary),
                                            Common.Tag(r.team or "未知球队", C.textMain),
                                            injured and Common.Tag("伤停中", C.danger) or UI.Panel { width = 0 },
                                        },
                                    },
                                    -- 球风描述：走 Paragraph（外层 row 容器），避免在列容器里塌高
                                    Paragraph(r.style or "", { fontSize = 12, color = C.textSub, lineHeight = 1.4 }),
                                },
                            },
                        },
                    },

                    -- 实力条（单个 StatBar 放进 row 容器即铺满整行）
                    UI.Panel {
                        width = "100%",
                        flexDirection = "row",
                        children = {
                            Common.StatBar("实力评估", power, C.danger),
                        },
                    },

                    Common.KV("结怨赛季", string.format("第 %d 赛季", r.formedSeason or 1)),
                    Common.KV(
                        "首次交手",
                        (r.seasonTag or 0) > 0 and string.format("第 %d 赛季", r.seasonTag) or "尚未交手",
                        (r.seasonTag or 0) > 0 and C.textMain or C.textSub),
                },
            },
        },
    }
end

-- ---------------------------------------------------------------------------
-- 交手战绩
-- ---------------------------------------------------------------------------

--- 本赛季还没打的宿敌战（走 Schedule 的公开查询接口，不直接读存档字段）
---@param state CareerState
---@param r RivalDef
---@return ScheduleRow|nil
local function nextRivalGame(state, r)
    local rows = Schedule.rows(state)
    for i = 1, #rows do
        local row = rows[i]
        if row.opponent == r.team and row.win == nil then
            return row
        end
    end
    return nil
end

---@param state CareerState
---@param r RivalDef
---@return Panel
local function RecordBlock(state, r)
    local wins, losses = Rival.headToHead(state)
    local history = r.history or {}

    ---@type table[]
    local children = {
        -- 胜 / 负
        UI.Panel {
            width = "100%",
            flexDirection = "row",
            gap = 10,
            children = {
                Common.StatBox(tostring(wins), "你赢", C.success),
                Common.StatBox(tostring(losses), "他赢", C.danger),
            },
        },
    }

    -- 赛程提醒：下一次交手在哪一周、主客场
    local nextGame = nextRivalGame(state, r)
    if nextGame then
        children[#children + 1] = Common.KV(
            "下一次交手",
            string.format("第 %d 周 · %s", nextGame.week, nextGame.home and "主场" or "客场"),
            C.primary)
    elseif Rival.isInjured(state) then
        children[#children + 1] = Common.Sub("他正在伤停，本赛季剩下的比赛都见不到他。", 12)
    else
        children[#children + 1] = Common.Sub("本赛季的赛程里暂时没有他。", 12)
    end

    -- 最近交手记录（倒序：最新一场在最上面）
    if #history == 0 then
        children[#children + 1] = Common.Sub("你们还没有在正式比赛里交过手。", 12)
    else
        children[#children + 1] = Common.Sub("最近交手（最新在上）", 11)
        for i = #history, 1, -1 do
            local h = history[i]
            local win = h.win == true
            children[#children + 1] = UI.Panel {
                width = "100%",
                flexDirection = "row",
                alignItems = "center",
                gap = 8,
                paddingVertical = 6,
                paddingHorizontal = 8,
                backgroundColor = C.bgCardLight,
                borderWidth = 2,
                borderColor = C.outlineSoft,
                children = {
                    UI.Label {
                        text = string.format("第 %d 赛季", h.season or 0),
                        fontSize = 12,
                        fontColor = C.textSub,
                        flexShrink = 0,
                    },
                    Common.Tag(win and "胜" or "负", win and C.success or C.danger),
                    UI.Label {
                        text = string.format("你 %d 分", h.myPoints or 0),
                        fontSize = 12,
                        fontWeight = "bold",
                        fontColor = C.textMain,
                        textAlign = "right",
                        whiteSpace = "normal",
                        lineHeight = 1.4,
                        flexGrow = 1,
                        flexShrink = 1,
                        flexBasis = 0,
                    },
                },
            }
        end
    end

    return Common.Block("交 手 战 绩", children, { barColor = C.textMain })
end

-- ---------------------------------------------------------------------------
-- 实力对比
-- ---------------------------------------------------------------------------

---@param state CareerState
---@param r RivalDef
---@return Panel
local function CompareBlock(state, r)
    local mine = Career.getOverall()
    local his = Rival.power(state)
    local delta = Rival.powerDelta(state)
    local injured = Rival.isInjured(state)

    -- 一句话说清差距：正数 = 他更强
    local line
    if delta >= 5 then
        line = string.format("他目前领先你 %d 点。这不是媒体的说法，是数据。", delta)
    elseif delta >= 1 then
        line = string.format("他领先你 %d 点。差距不大，但每次都是他先伸手。", delta)
    elseif delta == 0 then
        line = "你们咬得死死的，谁先松一口气谁就输。"
    elseif delta >= -4 then
        line = string.format("你领先他 %d 点。优势很薄，一场球就能翻过来。", -delta)
    else
        line = string.format("你领先他 %d 点。现在轮到他研究你了。", -delta)
    end
    if injured then
        line = "（他正在伤停，这份评估已经下调过。）" .. line
    end

    return Common.Block("实 力 对 比", {
        UI.Panel {
            width = "100%",
            flexDirection = "row",
            gap = 14,
            children = {
                Common.StatBar("你", mine, C.primary),
                Common.StatBar(r.name or "宿敌", his, C.danger),
            },
        },
        Paragraph(line, { fontSize = 12, color = C.textSub, lineHeight = 1.4 }),
    }, { barColor = C.primary })
end

-- ---------------------------------------------------------------------------
-- 恩怨简史（按成长阶段给不同文案，把这段关系讲成一个故事）
-- ---------------------------------------------------------------------------

---@param state CareerState
---@param r RivalDef
---@return string
local function historyStory(state, r)
    local wins, losses = Rival.headToHead(state)
    local met = wins + losses
    local stage = Rival.stageOf(state)
    local span = math.max(1, (state.season or 1) - (r.formedSeason or 1))
    local name = r.name or "他"
    local team = r.team or "他的球队"
    local posName = Career.getPositionDef(r.pos or state.positionId).short

    if stage == 1 then
        return string.format(
            "你还没有和 %s 交过手。关于他的消息都是别人转述的：%s 的%s，这赛季打出了生涯最好的一段球，有人说他是你们这一届最像样的一个。你听着，不接话，只是把他的名字记进了训练笔记的最后一页。",
            name, team, posName)
    elseif stage == 2 then
        return string.format(
            "你们交手 %d 次，你只赢了 %d 次。%s 好像总能提前半步知道你要做什么——不是天赋，是他把你拆开看过。你在录像里数他每一次提前站位，越数越明白：他比你自己还熟悉你。",
            met, wins, name)
    elseif stage == 3 then
        return string.format(
            "你们交手 %d 次，你 %d 胜 %d 负，谁都压不住谁。赛前你们会互相看一眼，不说话；赛后握手的时候，握的时间比和别人长一点。这个联盟里，没有人比你们更了解对方的第一步。",
            met, wins, losses)
    elseif stage == 4 then
        return string.format(
            "你们交手 %d 次，你 %d 胜 %d 负，占着上风。他开始在赛前加练你说的那个动作，也开始在采访里提你的名字——比你提他更多。你没有因此轻松，因为你太清楚他是什么人：他从来没打算认输。",
            met, wins, losses)
    end
    return string.format(
        "你们交手 %d 次，横跨了 %d 个赛季。这些年里他换过球衣号码，你换过球队，只有每年那两场球没有变。到后来你已经不太在意输赢了，只在意他还在对面——只要他还在，这场球就值得打。",
        met, span)
end

-- ---------------------------------------------------------------------------
-- 未结怨占位说明
-- ---------------------------------------------------------------------------

---@return Panel
local function PlaceholderBlock()
    return Common.Block("宿 敌", {
        UI.Label {
            text = "你的宿敌还未出现",
            fontSize = 18,
            fontWeight = "bold",
            fontColor = C.textMain,
        },
        Paragraph(
            "在你踏上职业赛场之前，没有人有资格被叫做宿敌。\n" ..
            "等你进入职业联赛（21 岁），联盟里会出现一个和你打同一个位置、同一年进来、会被媒体反复拿来和你比较的人。他会跟着你一起变强，你们每个赛季都会遇上，胜负会被一笔一笔记下来。\n" ..
            "到那一天，这个页面会亮起来。",
            { fontSize = 13, color = C.textSub, lineHeight = 1.6 }),
    }, { barColor = C.danger })
end

-- ---------------------------------------------------------------------------
-- 构建
-- ---------------------------------------------------------------------------

--- 构建宿敌界面
---@param state CareerState
---@param onBack fun()
---@return Widget
function ScreenRival.Build(state, onBack)
    local function handleBack()
        Audio.Play("click")
        onBack()
    end

    -- 无存档兜底
    if not state then
        return Common.Screen(Config.ART.bgPro, {
            Common.TopBar("宿 敌", handleBack),
            UI.Panel {
                width = "100%",
                padding = 16,
                children = { Common.Sub("没有生涯数据。", 14) },
            },
        }, { dim = 0.5 })
    end

    Audio.PlayBgm("daily")

    -- 首次进入时触发生成；生成后立刻落盘，避免读档后宿敌换人
    local hadRival = Rival.get(state) ~= nil
    Rival.ensure(state)
    local r = Rival.get(state)
    if r and not hadRival then
        Career.save()
    end

    ---@type table[]
    local blocks = {}

    if not r then
        -- pro 阶段之前：还没有宿敌，只给一段说明
        blocks[#blocks + 1] = PlaceholderBlock()
    else
        blocks[#blocks + 1] = RivalCard(state, r)
        blocks[#blocks + 1] = RecordBlock(state, r)
        blocks[#blocks + 1] = CompareBlock(state, r)

        ---@type table[]
        local storyChildren = {
            Paragraph(historyStory(state, r), { fontSize = 13, lineHeight = 1.7 }),
        }
        if r.origin and r.origin ~= "" then
            storyChildren[#storyChildren + 1] = Common.Sub("来历：" .. r.origin, 11)
        end
        blocks[#blocks + 1] = Common.Block("恩 怨 简 史", storyChildren, { barColor = C.secondary })
    end

    print(string.format("[Rival] 打开宿敌界面 | %s", r and (r.name .. " · " .. Rival.stageTitle(state)) or "尚未结怨"))

    return Common.Screen(Config.ART.bgPro, {
        Common.TopBar("宿 敌", handleBack),

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
                    children = blocks,
                },
            },
        },
    }, { dim = 0.5 })
end

return ScreenRival
