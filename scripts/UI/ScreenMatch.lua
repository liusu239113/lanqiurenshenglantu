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
local Ads = require("Core.Ads")
local AdWidgets = require("UI.AdWidgets")
local Common = require("UI.Common")
local Anim = require("UI.Anim")

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
---@field floatHolder Panel|nil   得分飘字层
---@field scorePanel Widget|nil   比分数字容器（弹跳用）
---@field lastMyScore number|nil  上一帧我方比分（用于检测得分）
---@field cursorBar Panel|nil     投篮时机条的平滑光标
---@field barTrack Panel|nil      投篮时机条轨道
---@field adForceReady boolean    关键球广告奖励已就绪：下一次结算强制成功
---@field adForceUsed boolean     本场是否已用过关键球广告（每场一次）

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

--- 刷新比分显示（得分时数字弹跳，并飘出 +N）
---@param L MatchUI
local function refreshScore(L)
    local s = L.session
    local newMy = s.myScore
    local newOpp = s.oppScore

    -- 我方得分增加 → 飘字 + 数字弹跳
    if L.lastMyScore and newMy > L.lastMyScore then
        local delta = newMy - L.lastMyScore
        -- 飘字
        local float = UI.Label {
            text = "+" .. tostring(delta),
            fontSize = 26,
            fontWeight = "bold",
            fontColor = { 255, 206, 61, 255 },
            position = "absolute",
            left = 0, right = 0,
            textAlign = "center",
            marginTop = 0,
        }
        if L.floatHolder then
            L.floatHolder:AddChild(float)
            Anim.Float(0, -46, 0.85, Anim.Ease.outQuad, function(v)
                -- ⚠️ 必须用 SetStyle：marginTop 同样没有属性路由，直接赋值不会重排
                float:SetStyle({ marginTop = v })
                float:SetOpacity(1 - math.min(1, -v / 46))
            end, function()
                float:Remove()
            end)
        end
        -- 数字弹跳
        if L.scorePanel then
            -- 用 SetProp 设置 scale（直接赋值会与 Node.scale 的 Vector2 类型冲突）
            Anim.Float(1.0, 1.28, 0.12, Anim.Ease.outQuad, function(v)
                L.scorePanel:SetProp("scale", v)
            end, function()
                Anim.Float(1.28, 1.0, 0.16, Anim.Ease.outQuad, function(v)
                    L.scorePanel:SetProp("scale", v)
                end, function()
                    L.scorePanel:SetProp("scale", 1.0)
                end)
            end)
        end
    end
    L.lastMyScore = newMy

    L.myScoreLabel:SetText(tostring(newMy))
    L.oppScoreLabel:SetText(tostring(newOpp))
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

--- 重打本场：本场结果作废、重新跳球
--- Match.start 只读生涯状态、不写任何东西，所以「再调一次」拿到的是完全相同的对手与
--- 赛程，唯一的区别是这一场的随机流会重新走一遍 —— 这正是「再来一次」该有的语义。
---@param L MatchUI
local function retryMatch(L)
    Match.start(L.state, Career.getStage())
    ui_ = nil
    UI.SetRoot(ScreenMatch.Build(L.state, L.onFinish))
end

--- 渲染：比赛结束
---@param L MatchUI
local function renderOver(L)
    L.actionHolder:ClearChildren()
    L.tellHolder:ClearChildren()

    local s = L.session
    local win = s.win

    L.tellHolder:AddChild(UI.Label {
        text = win and "★ 终场哨响 —— 胜利！" or "终场哨响 —— 惜败。",
        width = "100%",
        fontSize = 20,
        fontWeight = "bold",
        fontColor = win and C.success or C.danger,
        textAlign = "center",
        whiteSpace = "normal",
    })

    -- 失利重赛：只在输球那一刻出现（赢了不需要），且本季次数用完就不给按钮 ——
    -- 死按钮比没有按钮更伤——玩家会以为游戏坏了。
    if not win and Ads.left(L.state, "retry") > 0 then
        L.actionHolder:AddChild(AdWidgets.Button(L.state, "retry", function()
            return "本场结果作废，重新跳球"
        end, {
            label = string.format("▶ 不甘心？看广告重打本场（本季剩 %d 次）",
                Ads.left(L.state, "retry")),
            height = 52,
            onFinished = function() retryMatch(L) end,
        }))
    end

    L.actionHolder:AddChild(Common.PrimaryButton(
        win and "胜 利 ！ 查 看 战 报" or "惜 败 · 查 看 战 报",
        function()
            Audio.Play(win and "win" or "click")
            local cb = L.onFinish
            ui_ = nil
            -- ⚠️ 必须先结算再回调：Match.finish 负责把本场写进生涯（出场次数、赛季/
            -- 生涯总得分、抢断盖帽、徽章统计、赛程战绩、lastResult）。此前这里直接
            -- 调 onFinish，结算被整个跳过 —— 手操打完的比赛不写入任何生涯数据，
            -- 战报页也拿不到 result。文字直播模式一直是先 finish 再回调的。
            Match.finish(L.state)
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
        width = "100%",
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

-- ============================================================================
-- 关键球广告位 —— 把「这一下可能不进」变成「这一下一定进」
--
-- 位置选在玩家最犹豫的那一刻：投篮条已经开始摆动、防守动向还没看透、突破方向
-- 还拿不定。看完广告后按钮就地变成「奖励已就绪」，下一次结算强制成功并立即失效。
--
-- **每场只有一次**：它买的是这一回合的保险，不是整场的免死金牌。三个决策阶段
-- （投篮/突破/防守）都会出现，但玩家只能在其中之一花掉它 —— 选择权在玩家手上。
-- ============================================================================

--- 构建关键球广告按钮（本场用过后返回 nil）
---@param L MatchUI
---@param offerText string 未使用时的按钮文案
---@return Button|nil
local function adForceButton(L, offerText)
    if L.adForceUsed then return nil end

    local ready = L.adForceReady
    ---@type Button
    local btn = UI.Button {
        text = ready and "✓ 广告奖励已就绪 · 这一次必定成功" or ("▶ " .. offerText),
        width = "100%",
        height = 46,
        fontSize = 13,
        fontWeight = "bold",
        backgroundColor = { 255, 246, 224, 255 },
        textColor = { 176, 122, 8, 255 },
        borderWidth = 2,
        borderColor = { 232, 168, 32, 255 },
        disabled = ready,
        onClick = function(self)
            if L.adForceReady then return end
            Audio.Play("click")
            self:SetDisabled(true)
            self:SetText("广告播放中…")

            Ads.show("matchForce",
                function()  -- 完播：本回合的保险到手
                    L.adForceReady = true
                    L.adForceUsed = true
                    Audio.Play("levelup")
                    self:SetText("✓ 广告奖励已就绪 · 这一次必定成功")
                    UI.Toast.Show("广告奖励已就绪 —— 这一次必定成功", {
                        duration = 2.5, variant = "success", position = "top",
                    })
                end,
                function(msg, reason)
                    -- 失败不发奖、不消耗本场机会，按钮复位可重试
                    self:SetText("▶ " .. offerText)
                    self:SetDisabled(false)
                    local retryable = (reason == "manual_close" or reason == "rejected" or reason == "timeout")
                    UI.Toast.Show(msg, {
                        duration = retryable and 3.5 or 2.5,
                        variant = retryable and "info" or "warning",
                        position = "top",
                    })
                end)
        end,
    }
    return btn
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
        width = "100%",
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
        local success, actual = MiniGame.defend(s.defend, choice, Career.matchAttrs().defense or 30)

        -- 关键球保险已就绪：不论猜的是哪一边，这一次防守都成功（用完即失效）
        if L.adForceReady then
            L.adForceReady = false
            success, actual = true, d.actual
        end

        Match.resolveDefend(s, L.state, success, actual)
        addLogLine(L, s.log[1] or "")
        refreshScore(L)

        -- 反馈
        L.tellHolder:ClearChildren()
        L.tellHolder:AddChild(UI.Label {
            text = s.flashText,
            width = "100%",
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
            -- 本场已用过时返回 nil，nil 落在表末位会被自然丢弃
            adForceButton(L, "看广告 · 这次防守直接成功"),
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
        width = "100%",
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

    -- 平滑滑动光标（替代此前的逐格点亮，手感更连贯）
    local cursorBar = UI.Panel {
        position = "absolute",
        top = -3, bottom = -3,
        width = 5,
        marginLeft = -2,
        backgroundColor = { 255, 255, 255, 255 },
        borderWidth = 2,
        borderColor = C.outline,
    }
    L.cursorBar = cursorBar
    L.barTrack = UI.Panel {
        width = "100%",
        flexDirection = "row",
        height = 46,
        borderWidth = 3,
        borderColor = C.outline,
        overflow = "visible",
        position = "relative",
        children = segments,
    }
    -- 光标作为轨道子节点，按百分比定位
    -- ⚠️ 必须走 SetStyle：Widget 没有 SetLeft 属性路由，直接 `cursorBar.left = "0%"`
    -- 只会写进 Lua 表，不会同步到 Yoga 节点，光标会永远停在起点（比赛时投篮条不动）
    cursorBar:SetStyle({ left = "0%" })
    L.barTrack:AddChild(cursorBar)

    L.tellHolder:AddChild(L.barTrack)
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

        -- 关键球保险已就绪：不看时机条，这一球直接空心入网（用完即失效）
        if L.adForceReady then
            L.adForceReady = false
            result, points = "perfect", 3
        end

        Match.resolveShot(s, L.state, result, points)
        addLogLine(L, s.log[1] or "")
        refreshScore(L)

        L.tellHolder:ClearChildren()
        L.tellHolder:AddChild(UI.Label {
            text = s.flashText,
            width = "100%",
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

    L.actionHolder:AddChild(UI.Panel {
        width = "100%",
        flexDirection = "column",
        gap = 10,
        children = {
            UI.Button {
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
            },
            -- 本场已用过时返回 nil，nil 落在表末位会被自然丢弃
            adForceButton(L, "看广告 · 这一球必进"),
        },
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
        width = "100%",
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

        -- 关键球保险已就绪：不论重心猜哪边，这一次突破都成功（用完即失效）
        if L.adForceReady then
            L.adForceReady = false
            success = true
        end

        Match.resolveDribble(s, L.state, success)
        refreshScore(L)

        L.tellHolder:ClearChildren()
        L.tellHolder:AddChild(UI.Label {
            text = s.flashText,
            width = "100%",
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
        flexDirection = "column",
        gap = 10,
        children = {
            UI.Panel {
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
            },
            -- 本场已用过时返回 nil，nil 落在表末位会被自然丢弃
            adForceButton(L, "看广告 · 这次突破直接过掉他"),
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

    -- 投篮阶段：平滑推进光标（不再逐格点亮）
    if s.phase == "shot" and s.shot and not s.shot.done then
        MiniGame.tickShot(s.shot, dt)

        -- 光标按实际进度平滑移动（百分比定位）
        -- ⚠️ 必须用 SetStyle，直接赋值 left 不会触发 Yoga 重排，光标不会动
        if L.cursorBar then
            local pct = math.max(0, math.min(1, s.shot.cursor)) * 100
            L.cursorBar:SetStyle({ left = string.format("%.2f%%", pct) })
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

    -- 飘字层（得分 +N 从这里向上飘出）
    local floatHolder = UI.Panel {
        position = "absolute",
        top = 0, left = 0, right = 0, bottom = 0,
        alignItems = "center",
        justifyContent = "center",
        pointerEvents = "none",
    }

    local scoreboard = UI.Panel {
        width = "100%",
        padding = 14,
        backgroundColor = C.bgPanel,
        borderBottomWidth = 3,
        borderBottomColor = C.outline,
        position = "relative",
        children = {
            floatHolder,
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

    -- 比赛用球馆专用背景，不再复用阶段场景图
    local stageBg = Config.ART.bgMatch

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
        floatHolder = floatHolder,
        scorePanel = myScoreLabel,
        lastMyScore = session.myScore,
        adForceReady = false,
        adForceUsed = false,
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
