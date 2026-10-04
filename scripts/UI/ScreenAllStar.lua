-- ============================================================================
-- ScreenAllStar — 全明星周末界面
--
-- 三个阶段共用同一棵界面树：三分大赛 → 扣篮大赛 → 颁奖结算。
-- 阶段切换时只重建中段「内容区」，不调用 UI.SetRoot，
-- 避免整屏重建带来的闪烁与输入状态丢失（与 ScreenMini 同一套思路）。
-- 每帧由 ScreenAllStar.tick(dt) 驱动游标与结果停顿。
-- ============================================================================

local UI = require("urhox-libs/UI")
local Config = require("Core.Config")
local Career = require("Core.Career")
local AllStar = require("Core.AllStar")
local Audio = require("Core.Audio")
local Common = require("UI.Common")
local Anim = require("UI.Anim")

local ScreenAllStar = {}

local C = Config.COLORS

-- 时机条分段数（与投篮训练一致，保证两个玩法的手感统一）
local BAR_SEGMENTS = 36
-- 三分出手 / 扣篮之后的停顿展示时长（秒）
local SHOT_WAIT = 0.85
local DUNK_WAIT = 1.10

-- 顶栏右侧的环节标签
local STAGE_NAME_THREE = "三 分 大 赛"
local STAGE_NAME_DUNK = "扣 篮 大 赛"
local STAGE_NAME_RESULT = "颁 奖 时 刻"

-- ---------------------------------------------------------------------------
-- 会话状态
-- ---------------------------------------------------------------------------

---@class AllStarScreen
---@field state CareerState
---@field onDone fun()
---@field attrs table<string, number>     比赛用属性（Career.matchAttrs）
---@field stage string                    "three" | "dunk" | "result"
---@field content Panel                   内容区（阶段切换时只重建这里）
---@field stageTag Label                  顶栏右侧环节标签
---@field segments Panel[]|nil           当前时机条分段
---@field cursorIdx number               当前游标所在分段
---@field zones table|nil                当前判定区间
---@field waitTimer number               结果展示倒计时（>0 时锁住按钮）
---@field resultText string              上一球的解说/结果文案
---@field resultColor RGBAColor|nil      结果文案颜色
---@field ballLog table<number, boolean> 三分逐球结果（画投篮点进度用）
---@field pickedMove DunkMoveDef|nil     已选定、等待起跳的扣篮动作
---@field final AllStarResult|nil        结算结果
---@field banners Panel[]                冠军横幅（结算页脉冲用）
---@field celebT number                  庆祝动画计时
---@field celebPulse number              上一次应用的横幅透明度

---@type AllStarScreen|nil
local st_ = nil

-- ---------------------------------------------------------------------------
-- 通用小部件
-- ---------------------------------------------------------------------------

--- 需要换行的正文段落
--- 注意：whiteSpace / lineHeight / flexGrow / flexShrink / flexBasis 五件套缺一不可。
--- 但 flexBasis = 0 只有在**行**容器里才安全：列容器的主轴是高度，
--- flexBasis=0 会把标签高度算成 0，多行文字全部叠在同一位置（看起来是一团糊字）。
--- 所以这里统一在外面包一层 row 容器，让 flexGrow 有主轴可撑。
---@param text string
---@param size number|nil
---@param color RGBAColor|nil
---@return Panel
local function Wrap(text, size, color)
    return UI.Panel {
        width = "100%",
        flexDirection = "row",
        flexShrink = 0,
        children = {
            UI.Label {
                text = text,
                fontSize = size or 13,
                fontColor = color or C.textSub,
                whiteSpace = "normal",
                lineHeight = 1.4,
                flexGrow = 1,
                flexShrink = 1,
                flexBasis = 0,
            },
        },
    }
end

--- 判定分段颜色：绿 = 空心，黄 = 命中，其余 = 打铁
---@param pos number
---@param zones table|nil { greenLo, greenHi, yellowLo, yellowHi }
---@return RGBAColor
local function segColor(pos, zones)
    if zones then
        if pos >= zones.greenLo and pos <= zones.greenHi then
            return C.success
        end
        if pos >= zones.yellowLo and pos <= zones.yellowHi then
            return C.accent
        end
    end
    return C.danger
end

--- 内容区滚动容器（所有阶段的内容都走这里，保证边距一致）
---@param children table
---@return ScrollView
local function wrapScroll(children)
    return UI.ScrollView {
        width = "100%",
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
                children = children,
            },
        },
    }
end

--- 构建时机条，并把分段引用挂到会话上供 tick 重绘
---@param S AllStarScreen
---@param zones table
---@param caption string 时机条下方说明
---@return Panel
local function buildBar(S, zones, caption)
    ---@type Panel[]
    local segments = {}
    for i = 1, BAR_SEGMENTS do
        local pos = (i - 0.5) / BAR_SEGMENTS
        segments[i] = UI.Panel {
            flexGrow = 1,
            height = 48,
            backgroundColor = segColor(pos, zones),
        }
    end

    S.segments = segments
    S.cursorIdx = 0
    S.zones = zones

    return UI.Panel {
        width = "100%",
        flexDirection = "column",
        gap = 8,
        backgroundColor = C.bgCard,
        borderWidth = 3,
        borderColor = C.outline,
        overflow = "hidden",
        children = {
            UI.Panel {
                width = "100%",
                flexDirection = "row",
                height = 48,
                children = segments,
            },
            UI.Panel {
                width = "100%",
                padding = 10,
                children = {
                    Wrap(caption, 11, C.textSub),
                },
            },
        },
    }
end

--- 逐帧重绘游标所在分段
---@param S AllStarScreen
---@param cursor number 0-1
local function repaintCursor(S, cursor)
    local segments = S.segments
    if not segments then return end

    local idx = math.floor(cursor * BAR_SEGMENTS) + 1
    if idx < 1 then idx = 1 end
    if idx > BAR_SEGMENTS then idx = BAR_SEGMENTS end
    if idx == S.cursorIdx then return end

    local oldSeg = segments[S.cursorIdx]
    if oldSeg and S.cursorIdx >= 1 and S.cursorIdx <= BAR_SEGMENTS then
        local oldPos = (S.cursorIdx - 0.5) / BAR_SEGMENTS
        oldSeg:SetBackgroundColor(segColor(oldPos, S.zones))
    end

    local curSeg = segments[idx]
    if curSeg then
        curSeg:SetBackgroundColor({ 255, 255, 255, 255 })
    end
    S.cursorIdx = idx
end

--- 扣篮动作的难度星级
---@param difficulty number
---@return string
local function starsOf(difficulty)
    return string.rep("★", math.max(1, math.floor(difficulty)))
end

--- 结果 / 提示文字行（有上一球的结果就显示结果，否则显示提示）
---@param S AllStarScreen
---@param fallback string
---@return Panel
local function tipLine(S, fallback)
    local text = S.resultText
    if text == "" then
        text = fallback
    end
    local color = S.resultColor or (S.resultText ~= "" and C.textMain or C.textSub)
    return UI.Panel {
        width = "100%",
        paddingHorizontal = 4,
        children = { Wrap(text, 14, color) },
    }
end

-- ---------------------------------------------------------------------------
-- 阶段重建
-- ---------------------------------------------------------------------------

-- 前向声明：函数体在文件下方赋值（所有调用都发生在模块加载完成之后）
---@type fun(S: AllStarScreen)
local rebuild

--- 切换环节（更新顶栏标签 + 重建内容区）
---@param S AllStarScreen
---@param stage string
local function setStage(S, stage)
    S.stage = stage
    S.waitTimer = 0
    S.resultText = ""
    S.resultColor = nil
    print("[AllStar] 界面切换到环节：" .. stage)

    if stage == "three" then
        S.stageTag:SetText(STAGE_NAME_THREE)
    elseif stage == "dunk" then
        S.stageTag:SetText(STAGE_NAME_DUNK)
        -- 进入扣篮大赛时开一场新会话
        if AllStar.dunkPhase() == "none" then
            AllStar.startDunk(S.attrs)
        end
        Audio.Play("whistle")
    else
        S.stageTag:SetText(STAGE_NAME_RESULT)
        -- 颁奖：只结算一次
        if not S.final then
            S.final = AllStar.finish(S.state)
            Audio.Play("win")
            if S.final.wonThree or S.final.wonDunk then
                -- 冠军才有欢呼，且延迟半拍更有仪式感
                Anim.Delay(0.65, function()
                    if st_ == S then
                        Audio.Play("cheer")
                    end
                end)
            end
        end
    end

    rebuild(S)
end

-- ---------------------------------------------------------------------------
-- 阶段一：三分大赛
-- ---------------------------------------------------------------------------

--- 赛前说明
---@param S AllStarScreen
---@return Widget
local function buildThreeIntro(S)
    local attrs = S.attrs

    return wrapScroll({
        Common.Block("赛 制", {
            Wrap(string.format(
                "五个投篮点，每点五球，共 %d 球。前四个点每球满分 2 分，第五个点是价值翻倍的彩球点（满分 4 分）。",
                AllStar.THREE_TOTAL), 12, C.textMain),
            Wrap(string.format("满分 %d 分，拿到 %d 分以上就是三分王。",
                AllStar.THREE_MAX, AllStar.THREE_WIN), 12, C.textMain),
        }, { barColor = C.primary }),

        Common.Block("操 作", {
            Wrap("游标会在判定条上来回摆动，按下「出手」把它停在绿色区域：", 12),
            Wrap("绿色 = 空心入网（满分）　黄色 = 打板命中（减半分）　其余 = 打铁（0 分）", 12, C.textMain),
            Wrap(string.format("判定窗口宽度由【得分】属性决定，当前得分 %d——练得越准，绿区越宽。",
                attrs.scoring or 0), 11),
        }, { barColor = C.secondary }),

        Common.Block("奖 励", {
            Wrap("周末两场比赛合计换算人气、士气、收入与经验；夺冠还会写进你的生涯荣誉簿。", 12),
        }, { barColor = C.success }),

        UI.Button {
            text = "开 始 三 分 大 赛",
            width = "100%",
            height = 68,
            fontSize = 21,
            fontWeight = "bold",
            backgroundColor = C.primary,
            textColor = { 255, 255, 255, 255 },
            hoverBackgroundColor = C.primaryLight,
            pressedBackgroundColor = C.primaryDark,
            borderWidth = 3,
            borderColor = C.outline,
            letterSpacing = 4,
            onClick = function()
                if st_ ~= S then return end
                Audio.Play("whistle")
                AllStar.startThree(S.attrs)
                S.ballLog = {}
                S.resultText = ""
                rebuild(S)
            end,
        },
    })
end

--- 投篮点进度：5 个点 × 5 球的方格
---@param S AllStarScreen
---@param cur Shot3Info
---@return Panel
local function buildPointTrack(S, cur)
    local currentOrder = (cur.pointIndex - 1) * AllStar.THREE_BALLS_PER_POINT + cur.ballIndex

    ---@type Panel[]
    local cols = {}
    for p = 1, AllStar.THREE_POINTS do
        local isMoneyPoint = (p == AllStar.MONEY_POINT)

        ---@type Panel[]
        local pips = {}
        for b = 1, AllStar.THREE_BALLS_PER_POINT do
            local order = (p - 1) * AllStar.THREE_BALLS_PER_POINT + b
            local hit = S.ballLog[order]
            local isCurrent = (order == currentOrder)

            local color
            if hit == true then
                color = isMoneyPoint and C.accent or C.primary
            elseif hit == false then
                color = { 186, 176, 160, 255 }
            else
                color = { 240, 234, 220, 255 }
            end

            pips[#pips + 1] = UI.Panel {
                width = 34,
                height = 13,
                backgroundColor = color,
                borderWidth = isCurrent and 3 or 2,
                borderColor = isCurrent and C.secondary or C.outline,
            }
        end

        cols[#cols + 1] = UI.Panel {
            flexDirection = "column",
            alignItems = "center",
            gap = 5,
            children = {
                UI.Panel {
                    flexDirection = "column",
                    gap = 4,
                    children = pips,
                },
                UI.Label {
                    text = isMoneyPoint and "彩球" or ("第 " .. p .. " 点"),
                    fontSize = 10,
                    fontWeight = "bold",
                    fontColor = isMoneyPoint and C.primary or C.textSub,
                },
            },
        }
    end

    return UI.Panel {
        width = "100%",
        flexDirection = "row",
        justifyContent = "space-around",
        alignItems = "flex-end",
        children = cols,
    }
end

--- 出手一次（由「出手」按钮触发）
---@param S AllStarScreen
local function fireThreeShot(S)
    local cur = AllStar.currentThree()
    if not cur or cur.phase ~= "shooting" then return end

    local shotIndex = cur.shotIndex
    local res = AllStar.shootThree(cur.cursor)

    S.ballLog[shotIndex] = res.made
    S.resultText = res.text
    if res.perfect then
        S.resultColor = C.success
        Audio.Play("swish")
    elseif res.made then
        S.resultColor = C.accent
        Audio.Play("swish", 0.62)
    else
        S.resultColor = C.danger
        Audio.Play("rim")
    end

    S.waitTimer = SHOT_WAIT
    rebuild(S)
end

--- 三分大赛进行中
---@param S AllStarScreen
---@param cur Shot3Info
---@return Widget
local function buildThreePlay(S, cur)
    local locked = S.waitTimer > 0
    local zones = {
        greenLo = cur.greenLo,
        greenHi = cur.greenHi,
        yellowLo = cur.yellowLo,
        yellowHi = cur.yellowHi,
    }

    local tipFallback = cur.money
        and "彩球点！这一球价值翻倍。"
        or "把游标停在绿色区域，按下「出手」。"

    return wrapScroll({
        -- 球序 / 命中 / 得分
        UI.Panel {
            width = "100%",
            flexDirection = "row",
            gap = 10,
            children = {
                Common.StatBox(string.format("%d/%d", cur.shotIndex, AllStar.THREE_TOTAL), "当前球序", C.secondary),
                Common.StatBox(tostring(cur.made), "命中", C.success),
                Common.StatBox(tostring(cur.score), "得分", C.primary),
            },
        },

        Common.Block("投 篮 点 进 度", {
            buildPointTrack(S, cur),
        }, { barColor = C.textMain }),

        buildBar(S, zones, string.format(
            "第 %d 个投篮点 · 第 %d 球 · 本球满分 %d 分 · 判定窗口 %.3f",
            cur.pointIndex, cur.ballIndex, cur.value, cur.window)),

        tipLine(S, tipFallback),

        UI.Button {
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
            disabled = locked,
            onClick = function()
                if st_ ~= S or S.waitTimer > 0 then return end
                fireThreeShot(S)
            end,
        },
    })
end

--- 三分大赛结束（小结卡片）
---@param S AllStarScreen
---@return Widget
local function buildThreeSummary(S)
    local cur = AllStar.currentThree()
    local made = cur and cur.made or 0
    local score = AllStar.threeScore()
    local champion = score >= AllStar.THREE_WIN
    local gap = AllStar.THREE_WIN - score

    ---@type table[]
    local lines = {
        Wrap(string.format("%d 球命中 %d 球，总分 %d / %d。",
            AllStar.THREE_TOTAL, made, score, AllStar.THREE_MAX), 15, C.textMain),
    }
    if champion then
        table.insert(lines, Wrap("达到夺冠分数线！三分王的奖杯正在向你招手。", 12, C.success))
    else
        table.insert(lines, Wrap(string.format("距离夺冠线 %d 分还差 %d 分。", AllStar.THREE_WIN, gap), 12))
    end
    table.insert(lines, Common.KV("夺冠线", tostring(AllStar.THREE_WIN)))
    table.insert(lines, Common.KV("你的成绩", string.format("%d 分", score), champion and C.success or C.textMain))

    return wrapScroll({
        Common.Block("三 分 大 赛 结 束", lines,
            { barColor = champion and C.accent or C.primary }),

        tipLine(S, "五个投篮点的成绩都记在记分牌上了。"),
        Wrap("接下来是扣篮大赛：三次机会，先挑动作，再拼时机。", 12),

        UI.Button {
            text = "进 入 扣 篮 大 赛",
            width = "100%",
            height = 62,
            fontSize = 19,
            fontWeight = "bold",
            backgroundColor = C.secondary,
            textColor = { 255, 255, 255, 255 },
            borderWidth = 3,
            borderColor = C.outline,
            letterSpacing = 3,
            onClick = function()
                if st_ ~= S then return end
                Audio.Play("click")
                setStage(S, "dunk")
            end,
        },
    })
end

--- 三分大赛阶段入口
---@param S AllStarScreen
---@return Widget[]
local function buildThreeStage(S)
    local cur = AllStar.currentThree()
    if not cur then
        return { buildThreeIntro(S) }
    end
    if cur.phase == "finished" then
        return { buildThreeSummary(S) }
    end
    return { buildThreePlay(S, cur) }
end

-- ---------------------------------------------------------------------------
-- 阶段二：扣篮大赛
-- ---------------------------------------------------------------------------

--- 扣篮成绩单（每一扣一行）
---@param S AllStarScreen
---@return Panel
local function buildDunkScoreboard(S)
    local results = AllStar.dunkResults()

    ---@type table[]
    local rows = {}
    for i = 1, #results do
        local r = results[i]
        local value = string.format("%d 分", r.score)
        table.insert(rows, Common.KV(
            string.format("第 %d 扣 · %s", i, r.moveName),
            r.failed and (value .. "（失手）") or value,
            r.failed and C.danger or C.primary))
    end
    if #rows == 0 then
        table.insert(rows, Wrap("还没有完成任何一扣。", 12))
    end
    table.insert(rows, Common.KV("当前总分", string.format("%d / %d", AllStar.dunkScore(), AllStar.DUNK_MAX), C.textMain))
    return Common.Panel_(rows, { gap = 8 })
end

--- 选动作
---@param S AllStarScreen
---@return Widget
local function buildDunkPick(S)
    local locked = S.waitTimer > 0
    local offers = AllStar.dunkOffers()
    local ath = S.attrs.athletic or 30

    ---@type table[]
    local cards = {
        -- 上一扣的结果会在这里停留一会儿，然后换成提示
        tipLine(S, string.format("第 %d / %d 扣：挑一个动作。难度越高基础分越高，但判定窗口更窄、游标更快。",
            AllStar.dunkRound(), AllStar.DUNK_ROUNDS)),
        buildDunkScoreboard(S),
    }

    for i = 1, #offers do
        local move = offers[i]
        local lockedMove = ath < move.reqAthletic

        table.insert(cards, UI.Panel {
            width = "100%",
            flexDirection = "column",
            gap = 6,
            padding = 12,
            backgroundColor = lockedMove and { 238, 232, 220, 255 } or C.bgCard,
            borderWidth = 3,
            borderColor = C.outline,
            children = {
                -- 名称 + 难度星级
                UI.Panel {
                    width = "100%",
                    flexDirection = "row",
                    alignItems = "center",
                    justifyContent = "space-between",
                    children = {
                        UI.Label {
                            text = move.name,
                            fontSize = 17,
                            fontWeight = "bold",
                            fontColor = lockedMove and C.textSub or C.textMain,
                        },
                        UI.Label {
                            text = starsOf(move.difficulty),
                            fontSize = 14,
                            fontColor = lockedMove and C.textSub or C.accent,
                        },
                    },
                },
                -- 基础分 + 判定窗口
                UI.Panel {
                    width = "100%",
                    flexDirection = "row",
                    alignItems = "center",
                    justifyContent = "space-between",
                    children = {
                        UI.Label {
                            text = string.format("基础分 %d", move.baseScore),
                            fontSize = 12,
                            fontWeight = "bold",
                            fontColor = lockedMove and C.textSub or C.primary,
                        },
                        UI.Label {
                            text = string.format("判定窗口 %.2f · 难度 %d", move.window, move.difficulty),
                            fontSize = 11,
                            fontColor = C.textSub,
                        },
                    },
                },
                Wrap(move.desc, 11),
                UI.Button {
                    text = lockedMove
                        and string.format("体能不足（需要体能 %d）", move.reqAthletic)
                        or "选 择 这 个 动 作",
                    width = "100%",
                    height = 48,
                    fontSize = 15,
                    fontWeight = "bold",
                    backgroundColor = lockedMove and { 226, 218, 204, 255 } or C.secondary,
                    textColor = { 255, 255, 255, 255 },
                    borderWidth = 3,
                    borderColor = C.outline,
                    disabled = lockedMove or locked,
                    onClick = function()
                        if st_ ~= S or S.waitTimer > 0 then return end
                        if not AllStar.selectDunkMove(move.id) then
                            UI.Toast.Show("这个动作暂时做不了", {
                                duration = 1.6, variant = "warning", position = "top",
                            })
                            return
                        end
                        Audio.Play("click")
                        S.pickedMove = move
                        S.resultText = ""
                        rebuild(S)
                    end,
                },
            },
        })
    end

    table.insert(cards, Wrap(string.format(
        "当前体能 %d，可挑战的最高难度为 %d 星；体能决定扣篮难度上限，意识决定评委的观赏分。",
        ath, AllStar.maxDunkDifficulty(S.attrs)), 11))

    return wrapScroll(cards)
end

--- 起跳：时机判定
---@param S AllStarScreen
---@return Widget
local function buildDunkAim(S)
    local barView = AllStar.dunkBarView()
    if not barView then
        return wrapScroll({ Wrap("时机条正在准备…", 13) })
    end

    local locked = S.waitTimer > 0
    local move = S.pickedMove
    local moveName = move and move.name or "扣篮"
    local zones = {
        greenLo = barView.greenLo,
        greenHi = barView.greenHi,
        yellowLo = barView.yellowLo,
        yellowHi = barView.yellowHi,
    }

    ---@type table[]
    local children = {
        UI.Panel {
            width = "100%",
            flexDirection = "row",
            gap = 10,
            children = {
                Common.StatBox(string.format("%d/%d", AllStar.dunkRound(), AllStar.DUNK_ROUNDS), "第几扣", C.secondary),
                Common.StatBox(tostring(AllStar.dunkScore()), "当前得分", C.primary),
            },
        },
        Wrap(string.format("本扣动作：%s　难度 %s　基础分 %d",
            moveName, move and starsOf(move.difficulty) or "-", move and move.baseScore or 0), 13, C.textMain),
        buildBar(S, zones, string.format("判定窗口 %.3f——绿色是完美，黄色是完成，红区会砸筐。", barView.window)),
        tipLine(S, "等游标进入绿色区域，按下「起 跳」。"),
        UI.Button {
            text = "起 跳",
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
            disabled = locked,
            onClick = function()
                if st_ ~= S or S.waitTimer > 0 then return end

                local bar = AllStar.dunkBarView()
                if not bar then return end
                -- 动作 id 以时机条为准（即使界面丢了选中引用也不会点空）
                local moveId = move and move.id or bar.moveId
                local res = AllStar.performDunk(moveId, bar.cursor)

                S.resultText = res.text
                if res.failed then
                    S.resultColor = C.danger
                    Audio.Play("block")
                elseif res.result == "perfect" then
                    S.resultColor = C.success
                    Audio.Play("dunk")
                else
                    S.resultColor = C.accent
                    Audio.Play("dunk", 0.65)
                end

                S.pickedMove = nil
                S.waitTimer = DUNK_WAIT
                rebuild(S)
            end,
        },
    }

    return wrapScroll(children)
end

--- 扣篮大赛结束（小结卡片）
---@param S AllStarScreen
---@return Widget
local function buildDunkSummary(S)
    local total = AllStar.dunkScore()
    local champion = total >= AllStar.DUNK_WIN

    ---@type table[]
    local lines = { buildDunkScoreboard(S) }
    if champion then
        table.insert(lines, Wrap("评委席全体起立——你踩到扣篮王的分数线了。", 12, C.success))
    else
        table.insert(lines, Wrap(string.format("距离夺冠线 %d 分还差 %d 分。", AllStar.DUNK_WIN, AllStar.DUNK_WIN - total), 12))
    end

    return wrapScroll({
        Common.Block("扣 篮 大 赛 结 束", lines,
            { barColor = champion and C.accent or C.primary }),

        tipLine(S, "三次扣篮全部完成，评委正在核对分数。"),
        Wrap("周末的两场比赛都打完了，去颁奖台看看这一趟收获了什么。", 12),
        UI.Button {
            text = "前 往 颁 奖",
            width = "100%",
            height = 62,
            fontSize = 19,
            fontWeight = "bold",
            backgroundColor = C.primary,
            textColor = { 255, 255, 255, 255 },
            borderWidth = 3,
            borderColor = C.outline,
            letterSpacing = 3,
            onClick = function()
                if st_ ~= S then return end
                Audio.Play("click")
                setStage(S, "result")
            end,
        },
    })
end

--- 扣篮大赛阶段入口
---@param S AllStarScreen
---@return Widget[]
local function buildDunkStage(S)
    local phase = AllStar.dunkPhase()
    if phase == "aim" then
        return { buildDunkAim(S) }
    end
    if phase == "done" then
        return { buildDunkSummary(S) }
    end
    return { buildDunkPick(S) }
end

-- ---------------------------------------------------------------------------
-- 阶段三：颁奖结算
-- ---------------------------------------------------------------------------

--- 冠军横幅（结算页会做透明度脉冲）
---@param text string
---@return Panel
local function buildBanner(text)
    return UI.Panel {
        width = "100%",
        flexDirection = "column",
        alignItems = "center",
        gap = 4,
        paddingVertical = 14,
        backgroundColor = C.primary,
        borderWidth = 3,
        borderColor = C.outline,
        children = {
            UI.Label {
                text = text,
                fontSize = 20,
                fontWeight = "bold",
                fontColor = { 255, 255, 255, 255 },
                letterSpacing = 3,
                textAlign = "center",
                whiteSpace = "normal",
            },
        },
    }
end

--- 成绩卡
---@param title string
---@param score number
---@param max number
---@param rank number
---@param fieldSize number
---@param champion boolean
---@return Panel
local function buildScoreCard(title, score, max, rank, fieldSize, champion)
    return Common.Block(title, {
        UI.Panel {
            width = "100%",
            flexDirection = "row",
            gap = 10,
            children = {
                Common.StatBox(string.format("%d", score), string.format("得分 / %d", max), champion and C.accent or C.primary),
                Common.StatBox(string.format("第 %d", rank), string.format("名次 / %d 人", fieldSize), champion and C.accent or C.secondary),
            },
        },
        Wrap(champion and "冠军——这个项目的奖杯归你了。" or
            string.format("本次排在第 %d 位，下一次把名次再往前挪一挪。", rank), 11,
            champion and C.success or C.textSub),
    }, { barColor = champion and C.accent or C.primary })
end

--- 颁奖结算
---@param S AllStarScreen
---@return Widget[]
local function buildResultStage(S)
    local fin = S.final
    if not fin then
        -- 兜底：正常情况下 setStage 已经结算过
        fin = AllStar.finish(S.state)
        S.final = fin
    end

    S.banners = {}

    ---@type table[]
    local children = {
        UI.Panel {
            width = "100%",
            flexDirection = "column",
            alignItems = "center",
            gap = 2,
            paddingVertical = 6,
            children = {
                UI.Label {
                    text = "全 明 星 周 末",
                    fontSize = 24,
                    fontWeight = "bold",
                    fontColor = C.textMain,
                    letterSpacing = 4,
                },
                UI.Label {
                    text = string.format("第 %d 赛季 · 颁奖时刻", fin.season),
                    fontSize = 12,
                    fontColor = C.textSub,
                },
            },
        },
    }

    -- 夺冠庆祝横幅
    if fin.wonThree then
        local banner = buildBanner("★ 三 分 大 赛 冠 军 ★")
        S.banners[#S.banners + 1] = banner
        table.insert(children, banner)
    end
    if fin.wonDunk then
        local banner = buildBanner("★ 扣 篮 大 赛 冠 军 ★")
        S.banners[#S.banners + 1] = banner
        table.insert(children, banner)
    end
    if fin.bothWon then
        table.insert(children, UI.Panel {
            width = "100%",
            padding = 12,
            backgroundColor = C.bgCardLight,
            borderWidth = 3,
            borderColor = C.accent,
            children = {
                Wrap("双 冠 王 —— 这一届全明星周末只属于你一个人。", 15, C.primaryDark),
            },
        })
    end

    -- 两项成绩与排名
    table.insert(children, buildScoreCard("三 分 大 赛", fin.threeScore, fin.threeMax,
        fin.threeRank, fin.fieldSize, fin.wonThree))
    table.insert(children, buildScoreCard("扣 篮 大 赛", fin.dunkScore, fin.dunkMax,
        fin.dunkRank, fin.fieldSize, fin.wonDunk))

    -- 奖励清单
    local rewards = fin.rewards --[[@as string[] ]]
    ---@type table[]
    local rewardLines = {}
    for i = 1, #rewards do
        table.insert(rewardLines, Wrap("· " .. rewards[i], 12, C.textMain))
    end
    if #rewardLines == 0 then
        table.insert(rewardLines, Wrap("这个周末没有留下什么。", 12))
    end
    table.insert(children, Common.Block("本 次 收 获", rewardLines, { barColor = C.success }))

    -- 生涯全明星履历
    local rec = S.state and S.state.allStar
    ---@type table[]
    local recordLines = {}
    if rec then
        table.insert(recordLines, Common.KV("参加全明星周末", string.format("%d 次", rec.appearances or 0)))
        table.insert(recordLines, Common.KV("三分大赛最好成绩",
            string.format("%d 分", rec.bestThree or 0), C.primary))
        table.insert(recordLines, Common.KV("扣篮大赛最好成绩",
            string.format("%d 分", rec.bestDunk or 0), C.primary))
    end
    table.insert(recordLines, Common.KV("生涯入选全明星",
        string.format("%d 次", (S.state and S.state.allStars) or 0), C.secondary))
    table.insert(children, Common.Block("全 明 星 履 历", recordLines, { barColor = C.textMain }))

    table.insert(children, UI.Button {
        text = "完 成",
        width = "100%",
        height = 62,
        fontSize = 19,
        fontWeight = "bold",
        backgroundColor = C.primary,
        textColor = { 255, 255, 255, 255 },
        hoverBackgroundColor = C.primaryLight,
        pressedBackgroundColor = C.primaryDark,
        borderWidth = 3,
        borderColor = C.outline,
        letterSpacing = 4,
        onClick = function()
            if st_ ~= S then return end
            Audio.Play("click")
            print("[AllStar] 全明星周末流程结束，返回生涯")
            st_ = nil
            AllStar.reset()
            S.onDone()
        end,
    })

    return { wrapScroll(children) }
end

-- ---------------------------------------------------------------------------
-- 内容区重建
-- ---------------------------------------------------------------------------

--- 重建内容区（只动中段，不动整棵树）
---@param S AllStarScreen
rebuild = function(S)
    local content = S.content

    -- 先摘下来再统一销毁：ClearChildren 只解除父子关系，不会释放 Yoga 节点
    ---@type Widget[]
    local old = {}
    local kids = content:GetChildren()
    for i = 1, #kids do
        old[i] = kids[i]
    end
    content:ClearChildren()
    for i = 1, #old do
        old[i]:Destroy()
    end

    S.segments = nil
    S.cursorIdx = 0
    S.zones = nil

    ---@type Widget[]
    local children
    if S.stage == "three" then
        children = buildThreeStage(S)
    elseif S.stage == "dunk" then
        children = buildDunkStage(S)
    else
        children = buildResultStage(S)
    end

    for i = 1, #children do
        content:AddChild(children[i])
    end
end

-- ---------------------------------------------------------------------------
-- 每帧驱动
-- ---------------------------------------------------------------------------

--- 结算页：冠军横幅做透明度脉冲
---@param S AllStarScreen
---@param dt number
local function tickResult(S, dt)
    S.celebT = S.celebT + dt
    if #S.banners == 0 then return end

    local a = 0.6 + 0.4 * math.abs(math.sin(S.celebT * 3.0))
    -- 透明度变化不明显时跳过，避免每帧都去改样式（省一次布局失效）
    if math.abs(a - S.celebPulse) < 0.05 then return end
    S.celebPulse = a
    for i = 1, #S.banners do
        S.banners[i]:SetOpacity(a)
    end
end

--- 每帧驱动（main.lua 会在 Update 里调用）
---@param dt number
function ScreenAllStar.tick(dt)
    local S = st_
    if not S then return end

    if S.stage == "result" then
        tickResult(S, dt)
        return
    end

    -- 结果停顿期：不推进游标，避免下一次判定被误触
    if S.waitTimer > 0 then
        S.waitTimer = S.waitTimer - dt
        if S.waitTimer <= 0 then
            S.waitTimer = 0
            S.resultText = ""
            S.resultColor = nil
            rebuild(S)
        end
        return
    end

    -- 推进当前时机条
    if S.stage == "three" then
        local cur = AllStar.currentThree()
        if cur and cur.phase == "shooting" then
            AllStar.tickThree(dt)
            repaintCursor(S, AllStar.threeCursor() or 0)
        end
    elseif S.stage == "dunk" then
        if AllStar.dunkPhase() == "aim" then
            AllStar.tickDunk(dt)
            repaintCursor(S, AllStar.dunkCursor() or 0)
        end
    end
end

--- 是否正在全明星流程中
---@return boolean
function ScreenAllStar.isActive()
    return st_ ~= nil
end

-- ---------------------------------------------------------------------------
-- 构建
-- ---------------------------------------------------------------------------

--- 构建全明星周末界面
---@param state CareerState
---@param onDone fun()
---@return Widget
function ScreenAllStar.Build(state, onDone)
    -- 每次进入都从零开始：清掉可能残留的会话
    AllStar.reset()

    -- 顶栏右侧的环节标签（阶段切换时只改文字）
    local stageTag = UI.Label {
        text = STAGE_NAME_THREE,
        fontSize = 12,
        fontWeight = "bold",
        fontColor = { 255, 255, 255, 255 },
        paddingHorizontal = 9,
        paddingVertical = 4,
        backgroundColor = C.primary,
        flexShrink = 0,
    }

    local content = UI.Panel {
        width = "100%",
        flexGrow = 1,
        flexBasis = 0,
        flexDirection = "column",
    }

    local root = Common.Screen(Config.ART.bgMatch, {
        Common.TopBar("全 明 星 周 末", nil, stageTag),
        content,
    }, { dim = 0.45 })

    ---@type AllStarScreen
    local S = {
        state = state,
        onDone = onDone,
        attrs = Career.matchAttrs(),
        stage = "three",
        content = content,
        stageTag = stageTag,
        segments = nil,
        cursorIdx = 0,
        zones = nil,
        waitTimer = 0,
        resultText = "",
        resultColor = nil,
        ballLog = {},
        pickedMove = nil,
        final = nil,
        banners = {},
        celebT = 0,
        celebPulse = 0,
    }
    st_ = S

    Audio.PlayBgm("battle")

    print(string.format("[AllStar] 界面构建完成：得分 %d 体能 %d 意识 %d",
        S.attrs.scoring or 0, S.attrs.athletic or 0, S.attrs.iq or 0))

    rebuild(S)
    return root
end

return ScreenAllStar
