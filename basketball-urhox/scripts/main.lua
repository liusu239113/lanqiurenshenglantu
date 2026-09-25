-- ============================================================================
-- main — 《篮途》游戏入口
-- 串联：主菜单 → 建角 → 主页 → 比赛直播 → 事件卡 → 赛季结算
-- ============================================================================

local UI = require("urhox-libs/UI")
local Config = require("Core.Config")
local Career = require("Core.Career")
local Match = require("Core.Match")
local MatchText = require("Core.MatchText")
local EventSystem = require("Core.EventSystem")
local Audio = require("Core.Audio")
local Ads = require("Core.Ads")
local Injury = require("Core.Injury")

local MiniGame = require("Core.MiniGame")

local Theme = require("UI.Theme")
local ScreenMenu = require("UI.ScreenMenu")
local ScreenCreate = require("UI.ScreenCreate")
local ScreenHub = require("UI.ScreenHub")
local ScreenMatch = require("UI.ScreenMatch")
local ScreenEvent = require("UI.ScreenEvent")
local ScreenTraining = require("UI.ScreenTraining")
local ScreenMini = require("UI.ScreenMini")
local ScreenMatchText = require("UI.ScreenMatchText")
local AdWidgets = require("UI.AdWidgets")
local Common = require("UI.Common")

local C = Config.COLORS

-- ============================================================================
-- 全局运行时
-- ============================================================================

---@type Scene|nil
local scene_ = nil

-- 本周已选行动 id（"" 表示未选）
local selectedAction_ = ""
-- 本周行动结果描述
local actionResultText_ = ""
-- 本周是否已比赛
local weekPlayed_ = false

-- 是否正在比赛直播中（用于 tick 分发）
local inMatch_ = false
-- 是否正在文字直播中（用于 tick 分发）
local inTextMatch_ = false
-- 是否正在玩操作玩法（用于 tick 分发）
local inMini_ = false
-- 训练场返回目标："hub" 或 "menu"
local trainingReturn_ = "hub"

-- ---------------------------------------------------------------------------
-- 前向声明（这些函数在下方赋值，但被更早定义的函数引用）
-- ---------------------------------------------------------------------------
---@type fun()|nil
local showMenu
---@type fun()|nil
local showCreate
---@type fun()|nil
local showHub
---@type fun()|nil
local showTraining
---@type fun(mode: string)|nil
local enterMiniGame
---@type fun()|nil
local showDuel
---@type fun()|nil
local duelAttack
---@type fun()|nil
local duelDefend
---@type fun()|nil
local duelDribble
---@type fun()|nil
local runWeek
---@type fun()|nil
local afterMatchFlow
---@type fun()|nil
local finishWeek
---@type fun(state: CareerState)|nil
local onMatchFinished

-- ============================================================================
-- 场景与事件
-- ============================================================================

--- 创建场景（UI 库需要一个 Scene 承载渲染）
---@return Scene
local function ensureScene()
    if scene_ then return scene_ end
    scene_ = Scene()
    scene_:CreateComponent("Octree")
    -- 3D 相机（UI 渲染需要 viewport）
    local cameraNode = scene_:CreateChild("Camera")
    local camera = cameraNode:CreateComponent("Camera")
    camera.orthographic = true
    camera.orthoSize = 1.0
    cameraNode.position = Vector3(0, 0, -10)
    local viewport = Viewport:new(scene_, camera)
    renderer:SetViewport(0, viewport)
    return scene_
end

--- 处理 Update 事件（驱动比赛直播自动推进）
--- 注意：引擎按全局函数名查找回调，此处必须是全局函数，不能加 local
---@param eventType string
---@param eventData UpdateEventData
function HandleUpdate(eventType, eventData)
    local dt = eventData:GetFloat("TimeStep")
    if inMatch_ then
        ScreenMatch.tick(dt)
    end
    if inTextMatch_ then
        ScreenMatchText.tick(dt)
    end
    if inMini_ then
        ScreenMini.tick(dt)
    end
    -- 广告看门狗（超时保护）
    Ads.tick(dt)
end

-- ============================================================================
-- 界面切换
-- ============================================================================

--- 显示事件卡
---@param ev table
---@param onDone fun()
local function showEventCard(ev, onDone)
    local state = Career.state
    if not state then
        onDone()
        return
    end

    local function onChoose(idx)
        local result = EventSystem.choose(state, idx)
        if result.sfx then
            Audio.Play(result.sfx)
        end

        -- 显示结果反馈
        local resultScreen = ScreenEvent.BuildResult(
            ev.title or "事件",
            result.response,
            result.parts,
            function()
                onDone()
            end)
        UI.SetRoot(resultScreen)
    end

    UI.SetRoot(ScreenEvent.Build(ev, state.name, onChoose))
end

-- ---------------------------------------------------------------------------
-- 主菜单
-- ---------------------------------------------------------------------------

showMenu = function()
    inMatch_ = false
    selectedAction_ = ""
    actionResultText_ = ""
    weekPlayed_ = false

    UI.SetRoot(ScreenMenu.Build(
        function()  -- 新游戏
            showCreate()
        end,
        function()  -- 继续
            local data = Career.load()
            if data then
                showHub()
            else
                UI.Toast.Show("读档失败，请重新开始", { duration = 2, variant = "error", position = "bottom" })
            end
        end,
        function()  -- 训练馆
            local data = Career.load()
            if data then
                trainingReturn_ = "menu"
                showTraining()
            else
                UI.Toast.Show("请先开始生涯", { duration = 2, variant = "error", position = "bottom" })
            end
        end
    ))
end

-- ---------------------------------------------------------------------------
-- 建角
-- ---------------------------------------------------------------------------

showCreate = function()
    inMatch_ = false
    UI.SetRoot(ScreenCreate.Build(
        function(name, positionId, hometown)
            local state = Career.createPlayer(name, positionId, hometown)
            Career.save()

            -- 开场事件：生涯起步
            local intro = {
                id = "intro",
                title = "生涯，从这里开始",
                body = string.format(
                    "%s，%d 岁，来自%s。\n今天，你在%s的报名表上签下了自己的名字。\n篮球在你手里，路在你自己脚下。",
                    state.name, state.age, hometown, state.team),
                art = Config.ART.bgStreet,
                options = {
                    { text = "「我要成为最好的球员」", response = "你把这句话写在了球鞋内侧。每次低头系鞋带，都会看见它。", fx = { morale = 10, fame = 30 } },
                    { text = "「先打好每一场球」", response = "教练听到这句话，点了点头。脚踏实地，是最难得的天赋。", fx = { morale = 6, iq = 2 } },
                },
            }
            showEventCard(intro, function()
                showHub()
            end)
        end,
        function()
            showMenu()
        end
    ))
end

-- ---------------------------------------------------------------------------
-- 主页
-- ---------------------------------------------------------------------------

showHub = function()
    inMatch_ = false
    inMini_ = false
    ScreenMini.clear()
    local state = Career.state
    if not state then
        showMenu()
        return
    end

    local root = ScreenHub.Build(
        state,
        function()  -- 打开行动选择
            local picker = ScreenHub.BuildActionPicker(state,
                function(actionId)  -- 选定
                    selectedAction_ = actionId
                    actionResultText_ = Career.applyAction(actionId)
                    Audio.Play("levelup")
                    UI.Toast.Show(actionResultText_, { duration = 2.5, variant = "success", position = "bottom" })
                    showHub()
                end,
                function()  -- 取消
                    showHub()
                end)
            UI.SetRoot(picker)
        end,
        function()  -- 推进一周
            runWeek()
        end,
        function()  -- 打开训练馆
            trainingReturn_ = "hub"
            showTraining()
        end,
        actionResultText_,
        function()  -- 切换比赛模式
            state.matchMode = (state.matchMode == "text") and "live" or "text"
            Career.save()
            UI.Toast.Show(
                state.matchMode == "text" and "已切换到文字直播模式" or "已切换到操作比赛模式",
                { duration = 2, variant = "info", position = "bottom" })
            showHub()
        end
    )
    UI.SetRoot(root)
end

-- ---------------------------------------------------------------------------
-- 训练馆（独立操作玩法）
-- ---------------------------------------------------------------------------

--- 显示玩法结算并应用奖励
---@param title string
---@param lines string[]
---@param rewards table|nil { scoring, playmaking, defense, athletic, iq, stamina, morale, fame }
---@param onDone fun()
local function showMiniResult(title, lines, rewards, onDone)
    local state = Career.state

    ---@type string[]
    local rewardTexts = {}
    if state and rewards then
        local names = {
            scoring = "得分", playmaking = "组织", defense = "防守",
            athletic = "体能", iq = "意识",
        }
        for i = 1, #Config.ATTRS do
            local def = Config.ATTRS[i]
            local v = rewards[def.key]
            if v and v ~= 0 then
                local real = Career.addAttr(def.key, v)
                if real ~= 0 then
                    table.insert(rewardTexts, string.format("%s %+d", names[def.key] or def.key, real))
                end
            end
        end
        if rewards.stamina then
            Career.addStamina(rewards.stamina)
            table.insert(rewardTexts, string.format("体力 %+d", rewards.stamina))
        end
        if rewards.morale then
            Career.addMorale(rewards.morale)
            table.insert(rewardTexts, string.format("士气 %+d", rewards.morale))
        end
        if rewards.fame then
            Career.addFame(rewards.fame)
            table.insert(rewardTexts, string.format("人气 %+d", rewards.fame))
        end
        Career.save()
    end

    local rewardStr = "无变化"
    if #rewardTexts > 0 then
        rewardStr = table.concat(rewardTexts, "   ")
    end

    UI.SetRoot(ScreenTraining.BuildResult(title, lines, rewardStr, function()
        onDone()
    end))
end

showTraining = function()
    inMini_ = false
    ScreenMini.clear()

    UI.SetRoot(ScreenTraining.Build(
        function(mode)
            if mode == "tactic" then
                UI.SetRoot(ScreenTraining.BuildTactic(
                    function(tacticId, defenseId)
                        local state = Career.state
                        if state then
                            state.tacticId = tacticId
                            state.defenseId = defenseId
                            Career.save()
                        end
                        local t = MiniGame.getTactic(tacticId)
                        local d = MiniGame.getDefense(defenseId)
                        showMiniResult("战 术 已 设 定", {
                            string.format("进攻战术：%s", t.name),
                            string.format("防守策略：%s", d.name),
                            "下一场比赛将按此战术推演。",
                        }, nil, function()
                            showTraining()
                        end)
                    end,
                    function()
                        showTraining()
                    end))
            else
                enterMiniGame(mode)
            end
        end,
        function()  -- 返回
            if trainingReturn_ == "menu" then
                showMenu()
            else
                showHub()
            end
        end
    ))
end

--- 进入某个操作玩法
---@param mode string
enterMiniGame = function(mode)
    local state = Career.state
    if not state then
        showMenu()
        return
    end

    inMini_ = true
    ScreenMini.clear()

    local attrs = state.attrs

    if mode == "shot" then
        -- 投篮训练：10 球
        local root = ScreenMini.BuildShot(attrs, state.stamina, 10, 1.0,
            function(made, points)
                inMini_ = false
                ScreenMini.clear()
                -- 奖励：命中数决定属性收益
                local gain = 0
                if made >= 9 then gain = 3
                elseif made >= 7 then gain = 2
                elseif made >= 4 then gain = 1 end
                showMiniResult("投 篮 训 练 结 束", {
                    string.format("10 球命中 %d 个，共 %d 分。", made, points),
                    made >= 9 and "手感火热，教练在场边点头。" or
                    made >= 5 and "中规中矩，继续打磨。" or
                    "手感冰凉，明天再来。",
                }, {
                    scoring = gain,
                    stamina = -12,
                    morale = made >= 7 and 4 or -2,
                }, function()
                    showTraining()
                end)
            end)
        UI.SetRoot(root)

    elseif mode == "dribble" then
        -- 突破训练：8 回合
        local root = ScreenMini.BuildDribble(attrs, 8, 1.0,
            function(success, total)
                inMini_ = false
                ScreenMini.clear()
                local gain = 0
                if success >= 7 then gain = 3
                elseif success >= 5 then gain = 2
                elseif success >= 3 then gain = 1 end
                showMiniResult("突 破 训 练 结 束", {
                    string.format("8 回合突破成功 %d 次。", success),
                    success >= 6 and "你的变向让防守者苦不堪言。" or
                    success >= 3 and "有进步，但假动作还能更逼真。" or
                    "防守者看穿了你的习惯，换个节奏吧。",
                }, {
                    playmaking = gain,
                    athletic = gain > 0 and 1 or 0,
                    stamina = -14,
                }, function()
                    showTraining()
                end)
            end)
        UI.SetRoot(root)

    elseif mode == "defend" then
        -- 防守训练：8 回合
        local root = ScreenMini.BuildDefend(attrs.defense or 30, 8, 1.0,
            function(success, total)
                inMini_ = false
                ScreenMini.clear()
                local gain = 0
                if success >= 7 then gain = 3
                elseif success >= 5 then gain = 2
                elseif success >= 3 then gain = 1 end
                showMiniResult("防 守 训 练 结 束", {
                    string.format("8 回合判断正确 %d 次。", success),
                    success >= 6 and "你的预判几乎读穿了对手。" or
                    success >= 3 and "判断还行，但还能更早半步。" or
                    "被假动作骗了很多次，多看看录像吧。",
                }, {
                    defense = gain,
                    iq = gain > 0 and 1 or 0,
                    stamina = -14,
                }, function()
                    showTraining()
                end)
            end)
        UI.SetRoot(root)

    elseif mode == "duel" then
        showDuel()
    end
end

-- ---------------------------------------------------------------------------
-- 斗牛赛（1v1，串联突破 + 投篮 + 防守）
-- ---------------------------------------------------------------------------

---@type DuelState|nil
local duel_ = nil

--- 斗牛赛进攻：突破阶段
duelDribble = function()
    local state = Career.state
    if not state or not duel_ then return end
    inMini_ = true
    ScreenMini.clear()

    local root = ScreenMini.BuildDribble(state.attrs, 1, 1.0,
        function(success)
            inMini_ = false
            ScreenMini.clear()
            local d = duel_
            if not d then return end

            if success then
                MiniGame.duelLog(d, string.format("第 %d 回合：突破成功，获得出手机会。", d.round))
                -- 突破成功 → 进入投篮
                duelAttack()
            else
                MiniGame.duelLog(d, string.format("第 %d 回合：突破被断，进攻失败。", d.round))
                Audio.Play("rim")
                -- 进攻失败 → 轮到对手
                duelDefend()
            end
        end)
    UI.SetRoot(root)
end

--- 斗牛赛进攻：投篮阶段
duelAttack = function()
    local state = Career.state
    if not state or not duel_ then return end
    inMini_ = true
    ScreenMini.clear()

    local root = ScreenMini.BuildShot(state.attrs, state.stamina, 1, 1.0,
        function(made, points)
            inMini_ = false
            ScreenMini.clear()
            local d = duel_
            if not d then return end

            if made > 0 then
                d.myScore = d.myScore + points
                MiniGame.duelLog(d, string.format("第 %d 回合：出手命中 +%d 分（%d:%d）。", d.round, points, d.myScore, d.oppScore))
                Audio.Play("cheer", 0.5)
            else
                MiniGame.duelLog(d, string.format("第 %d 回合：出手不中（%d:%d）。", d.round, d.myScore, d.oppScore))
            end
            d.round = d.round + 1

            if MiniGame.duelCheckOver(d) then
                showDuel()
            else
                duelDefend()
            end
        end)
    UI.SetRoot(root)
end

--- 斗牛赛防守回合
duelDefend = function()
    local state = Career.state
    if not state or not duel_ then return end
    inMini_ = true
    ScreenMini.clear()

    local root = ScreenMini.BuildDefend(state.attrs.defense or 30, 1, 1.0,
        function(success)
            inMini_ = false
            ScreenMini.clear()
            local d = duel_
            if not d then return end

            if success then
                MiniGame.duelLog(d, string.format("第 %d 回合：防守成功，夺回球权（%d:%d）。", d.round, d.myScore, d.oppScore))
                Audio.Play("block", 0.7)
            else
                local oppPoints = math.random(1, 3)
                d.oppScore = d.oppScore + oppPoints
                MiniGame.duelLog(d, string.format("第 %d 回合：对手打进 +%d 分（%d:%d）。", d.round, oppPoints, d.myScore, d.oppScore))
            end

            if MiniGame.duelCheckOver(d) then
                showDuel()
            else
                duelDribble()
            end
        end)
    UI.SetRoot(root)
end

showDuel = function()
    inMini_ = false
    ScreenMini.clear()

    local state = Career.state
    local d = duel_
    if not state or not d then return end

    -- 结束：展示结算
    if d.done then
        local win = d.win
        local rewardLines = {
            string.format("最终比分  %d : %d", d.myScore, d.oppScore),
            win and "你在这片场地上赢下了对手。" or "对手先到分，这场输了。",
        }
        showMiniResult(
            win and "斗 牛 胜 利" or "斗 牛 落 败",
            rewardLines,
            {
                scoring = win and 2 or 1,
                playmaking = win and 1 or 0,
                athletic = win and 1 or 0,
                morale = win and 8 or -4,
                fame = win and 60 or 10,
                stamina = -18,
            },
            function()
                duel_ = nil
                showTraining()
            end)
        return
    end

    -- 进行中：展示战况
    ---@type table[]
    local logWidgets = {}
    local n = math.min(8, #d.log)
    for i = 1, n do
        logWidgets[i] = UI.Label {
            text = d.log[i],
            fontSize = 12,
            fontColor = C.textSub,
            whiteSpace = "normal",
            lineHeight = 1.5,
        }
    end

    local root = Common.Screen(Config.ART.bgStreet, {
        UI.Panel {
            height = 60,
            flexDirection = "row",
            alignItems = "center",
            justifyContent = "space-between",
            paddingHorizontal = 16,
            children = {
                Common.Title("斗 牛 赛", 20),
                UI.Button {
                    text = "退出",
                    width = 68,
                    height = 36,
                    fontSize = 13,
                    backgroundColor = C.bgCard,
                    textColor = C.textMain,
                    borderWidth = 3,
                    borderColor = C.outline,
                    onClick = function()
                        Audio.Play("click")
                        duel_ = nil
                        showTraining()
                    end,
                },
            },
        },

        -- 比分板
        UI.Panel {
            margin = 14,
            flexDirection = "row",
            alignItems = "center",
            justifyContent = "center",
            gap = 14,
            padding = 16,
            backgroundColor = C.bgCard,
            borderWidth = 3,
            borderColor = C.outline,
            children = {
                UI.Panel {
                    flexGrow = 1, flexBasis = 0,
                    flexDirection = "column", alignItems = "center",
                    children = {
                        UI.Label { text = "你", fontSize = 12, fontWeight = "bold", fontColor = C.textSub },
                        UI.Label {
                            text = tostring(d.myScore),
                            fontSize = 44,
                            fontWeight = "bold",
                            fontColor = C.primary,
                            textStroke = { width = 3, color = "#1a1614" },
                        },
                    },
                },
                UI.Label {
                    text = string.format("先到 %d 分", d.targetScore),
                    fontSize = 12,
                    fontWeight = "bold",
                    fontColor = C.textSub,
                },
                UI.Panel {
                    flexGrow = 1, flexBasis = 0,
                    flexDirection = "column", alignItems = "center",
                    children = {
                        UI.Label { text = "对手", fontSize = 12, fontWeight = "bold", fontColor = C.textSub },
                        UI.Label {
                            text = tostring(d.oppScore),
                            fontSize = 44,
                            fontWeight = "bold",
                            fontColor = C.secondary,
                            textStroke = { width = 3, color = "#1a1614" },
                        },
                    },
                },
            },
        },

        -- 战况日志
        UI.ScrollView {
            flexGrow = 1,
            flexBasis = 0,
            scrollY = true,
            showScrollbar = true,
            children = {
                UI.Panel {
                    width = "100%",
                    flexDirection = "column",
                    gap = 8,
                    paddingHorizontal = 16,
                    paddingBottom = 16,
                    children = logWidgets,
                },
            },
        },

        UI.Panel {
            padding = 14,
            children = {
                Common.PrimaryButton("开 始 第 " .. d.round .. " 回 合", function()
                    Audio.Play("whistle")
                    duelDribble()
                end),
            },
        },
    }, { dim = 0.5 })

    UI.SetRoot(root)
end

-- ---------------------------------------------------------------------------
-- 周流程
-- ---------------------------------------------------------------------------

--- 处理赛季结束后的结算展示
---@param events string[]
---@param onDone fun()
local function showSeasonReport(events, onDone)
    ---@type table[]
    local lines = {}
    for i = 1, #events do
        lines[i] = UI.Label {
            text = events[i],
            fontSize = 13,
            fontColor = Config.COLORS.textMain,
            whiteSpace = "normal",
            lineHeight = 1.6,
        }
    end

    local card = UI.Panel {
        width = "100%",
        flexDirection = "column",
        gap = 14,
        padding = 22,
        backgroundColor = Config.COLORS.bgPanel,
        borderRadius = 24,
        borderWidth = 3,
        borderColor = Config.COLORS.outline,
        children = {
            UI.Panel {
                width = "100%",
                height = 150,
                backgroundImage = Config.ART.evTrophy,
                backgroundFit = "cover",
                borderRadius = 16,
                borderWidth = 2,
                borderColor = Config.COLORS.outline,
            },
            UI.Label {
                text = "赛 季 结 算",
                fontSize = 22,
                fontWeight = "bold",
                fontColor = Config.COLORS.accent,
                letterSpacing = 3,
                textAlign = "center",
            },
            UI.Panel {
                flexDirection = "column",
                gap = 8,
                children = lines,
            },
            UI.Button {
                text = "进 入 新 赛 季",
                width = "100%",
                height = 52,
                fontSize = 16,
                fontWeight = "bold",
                backgroundColor = Config.COLORS.primary,
                textColor = { 255, 255, 255, 255 },
                borderRadius = 999,
                borderWidth = 2,
                borderColor = Config.COLORS.outline,
                onClick = function()
                    Audio.Play("whistle")
                    onDone()
                end,
            },
        },
    }

    UI.SetRoot(UI.Panel {
        width = "100%",
        height = "100%",
        flexDirection = "row",
        justifyContent = "center",
        alignItems = "center",
        backgroundColor = { 10, 12, 24, 230 },
        children = {
            UI.Panel {
                width = "100%",
                maxWidth = 560,
                paddingHorizontal = 16,
                children = { card },
            },
        },
    })
end

runWeek = function()
    local state = Career.state
    if not state then
        showMenu()
        return
    end

    -- 1) 若本周有比赛 → 先打比赛
    if Career.hasGameThisWeek() then
        -- 伤病期间无法出战
        if Injury.isInjured(state) then
            UI.Toast.Show(
                string.format("伤病中（%s），本周无法出战", Injury.statusText(state)),
                { duration = 3, variant = "warning", position = "bottom" })
            Career.addLog(string.format("因%s缺席本周比赛。", state.injuryName or "伤病"))
            afterMatchFlow()
            return
        end

        local stage = Career.getStage()

        -- 比赛模式分流：操作模式 / 文字直播模式
        if state.matchMode == "text" then
            MatchText.start(state, stage)
            inTextMatch_ = true
            local root = ScreenMatchText.Build(state, function()
                inTextMatch_ = false
                onMatchFinished(state)
            end)
            UI.SetRoot(root)
        else
            Match.start(state, stage)
            inMatch_ = true
            local root = ScreenMatch.Build(state, function()
                inMatch_ = false
                onMatchFinished(state)
            end)
            UI.SetRoot(root)
        end
        return
    end

    -- 无比赛 → 日常事件
    afterMatchFlow()
end

--- 比赛结束后的统一处理：伤病判定 → 赛后事件
---@param state CareerState
onMatchFinished = function(state)
    local result = state.lastResult

    -- 伤病判定（操作模式全力出战，风险略高）
    local inj = Injury.roll(state, state.matchMode == "live")
    if inj then
        Injury.apply(state, inj)
        UI.Toast.Show(
            string.format("受伤！%s，预计伤停 %d 天", inj.name, inj.days),
            { duration = 3.5, variant = "error", position = "bottom" })
        Career.addLog(string.format("比赛中%s，伤停 %d 天。", inj.name, inj.days))
    end

    -- 赛后事件
    local ev = EventSystem.afterMatch(state, result or {})
    if ev then
        showEventCard(ev, function()
            Career.save()
            afterMatchFlow()
        end)
    else
        Career.save()
        afterMatchFlow()
    end
end

--- 比赛之后：日常事件 → 推进
afterMatchFlow = function()
    local state = Career.state
    if not state then
        showMenu()
        return
    end

    local ev = EventSystem.daily(state)
    if ev then
        showEventCard(ev, function()
            finishWeek()
        end)
    else
        finishWeek()
    end
end

--- 完成本周：推进时间，检查赛季结束
finishWeek = function()
    local state = Career.state
    if not state then
        showMenu()
        return
    end

    local beforeSeason = state.season
    local events = Career.advanceWeek()
    Career.save()

    -- 重置本周状态
    selectedAction_ = ""
    actionResultText_ = ""
    weekPlayed_ = false

    -- 赛季结束
    if state.season ~= beforeSeason then
        -- 赛季末事件
        local ev = EventSystem.seasonEnd(state)
        if ev then
            showEventCard(ev, function()
                showSeasonReport(events, function()
                    Career.save()
                    showHub()
                end)
            end)
        else
            showSeasonReport(events, function()
                Career.save()
                showHub()
            end)
        end
        return
    end

    -- 展示本周发生的事
    if #events > 0 then
        UI.Toast.Show(table.concat(events, "  "), { duration = 3, variant = "info", position = "bottom" })
    end

    showHub()
end

-- ============================================================================
-- 入口
-- ============================================================================

function Start()
    print("========================================")
    print("[篮途] 游戏启动")
    print("[篮途] 版本 " .. Config.VERSION)
    print("========================================")

    -- 场景
    ensureScene()

    -- 音频
    Audio.Init(scene_)

    -- 主题
    Theme.Setup()

    -- UI 初始化
    UI.Init({
        theme = "basketball",
        scale = UI.Scale.DEFAULT,
    })

    -- 订阅 Update（驱动比赛直播）
    SubscribeToEvent("Update", "HandleUpdate")

    -- 进入主菜单
    showMenu()

    print("[篮途] 主菜单已加载")
end

function Stop()
    print("[篮途] 游戏退出")
end
