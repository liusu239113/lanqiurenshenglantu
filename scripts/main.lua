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
local LifeStory = require("Data.LifeStory")
local SideStory = require("Data.SideStory")
local Audio = require("Core.Audio")
local Ads = require("Core.Ads")
local Injury = require("Core.Injury")
local Rival = require("Core.Rival")
local Teammates = require("Core.Teammates")
local AllStar = require("Core.AllStar")

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
local ScreenAttr = require("UI.ScreenAttr")
local ScreenTransfer = require("UI.ScreenTransfer")
local ScreenFinance = require("UI.ScreenFinance")
local ScreenReport = require("UI.ScreenReport")
local ScreenWelfare = require("UI.ScreenWelfare")
local ScreenBadge = require("UI.ScreenBadge")
local ScreenSettings = require("UI.ScreenSettings")
local ScreenRival = require("UI.ScreenRival")
local ScreenRoster = require("UI.ScreenRoster")
local ScreenAllStar = require("UI.ScreenAllStar")
local Anim = require("UI.Anim")
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
-- 本周行动是否已结算（幂等键：防止同一周反复执行行动刷属性）
local actionDoneThisWeek_ = false
-- 本周是否已比赛
local weekPlayed_ = false
-- 本周是否已开过「全神贯注」（广告：接下来几次训练必定满档）
local actionFocus_ = false

-- 是否正在比赛直播中（用于 tick 分发）
local inMatch_ = false
-- 是否正在文字直播中（用于 tick 分发）
local inTextMatch_ = false
-- 是否正在玩操作玩法（用于 tick 分发）
local inMini_ = false

-- ---------------------------------------------------------------------------
-- 前向声明（这些函数在下方赋值，但被更早定义的函数引用）
-- ---------------------------------------------------------------------------
---@type fun()|nil
local showMenu
---@type fun()|nil
local showCreate
---@type fun()|nil
local showLifeChapter
---@type fun(selected: number?)
local showStoryArchive
---@type fun()|nil
local showHub
---@type fun()|nil
local showAttr
---@type fun()|nil
local openActionPicker
---@type fun()|nil
local showTransfer
---@type fun()|nil
local showFinance
---@type fun()|nil
local showWelfare
---@type fun()|nil
local showBadge
---@type fun()|nil
local showRival
---@type fun()|nil
local showRoster
---@type fun()|nil
local showAllStar
---@type fun()|nil
local showSettings
---@type fun()|nil
local showTraining
---@type fun(mode: string)|nil
local enterMiniGame
---@type fun()|nil
local runWeek
---@type fun(state: CareerState)|nil
local runWeekConfirmed
---@type fun()|nil
local afterMatchFlow
---@type fun()|nil
local showRetire
---@type fun(state: CareerState)|nil
local kickoffMatch
---@type fun()|nil
local finishWeek
---@type fun(state: CareerState)|nil
local onMatchFinished
---@type fun(state: CareerState, onConfirm: fun())|nil
local showWeekPreview

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
    -- 补间动画（得分飘字、抽卡翻牌、数值跳动等）
    Anim.Update(dt)
    if inMatch_ then
        ScreenMatch.tick(dt)
    end
    if inTextMatch_ then
        ScreenMatchText.tick(dt)
    end
    if inMini_ then
        ScreenMini.tick(dt)
    end
    -- 全明星周末（三分/扣篮大赛）自管界面树，用 isActive 兜住，避免空转
    if ScreenAllStar.isActive() then
        ScreenAllStar.tick(dt)
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
        if ev.storyChapter and state.seenEvents[ev.id] then return end
        local result = EventSystem.choose(state, idx)
        if result.sfx then
            Audio.Play(result.sfx)
        end
        if ev.storyChapter then Career.save() end

        -- 显示结果反馈
        local resultScreen = ScreenEvent.BuildResult(
            ev.title or "事件",
            result.response,
            result.parts,
            function()
                -- 选项触发了退役 → 直接进入生涯结算，不再继续周循环
                if result.retired and showRetire then
                    Career.save()
                    showRetire()
                    return
                end
                onDone()
            end)
        UI.SetRoot(resultScreen)
    end

    UI.SetRoot(ScreenEvent.Build(ev, state.name, onChoose))
end

-- 主线章节不参与随机卡池：每个年龄首次到达时稳定出现。
showLifeChapter = function()
    local state = Career.state
    if not state then showMenu(); return end
    local ev = LifeStory.atAge(state)
    if ev then
        EventSystem.current = ev
        print(string.format("[Story] 开始 %d 岁章节：%s", state.age, ev.title))
        showEventCard(ev, function() showHub() end)
    else
        showHub()
    end
end

-- ---------------------------------------------------------------------------
-- 主菜单
-- ---------------------------------------------------------------------------

showMenu = function()
    inMatch_ = false
    selectedAction_ = ""
    actionResultText_ = ""
    actionDoneThisWeek_ = false
    weekPlayed_ = false
    actionFocus_ = false

    UI.SetRoot(ScreenMenu.Build(
        function()  -- 新游戏
            showCreate()
        end,
        function()  -- 继续
            local data = Career.load()
            if data then
                if data.retired then showHub() else showLifeChapter() end
            else
                UI.Toast.Show("读档失败，请重新开始", { duration = 2, variant = "error", position = "top" })
            end
        end,
        function()  -- 设置
            showSettings()
        end
    ))
end

-- ---------------------------------------------------------------------------
-- 建角
-- ---------------------------------------------------------------------------

showCreate = function()
    inMatch_ = false
    UI.SetRoot(ScreenCreate.Build(
        function(name, positionId, hometown, originId, talentIds)
            Career.createPlayer(name, positionId, hometown, originId, talentIds)
            Career.save()
            -- 建角后先进入人生序章，之后每次生日进入下一章。
            showLifeChapter()
        end,
        function()
            showMenu()
        end
    ))
end

-- ---------------------------------------------------------------------------
-- 主页
-- ---------------------------------------------------------------------------

--- 打开周行动选择层（内含「私人教练加练」广告位）
openActionPicker = function()
    local state = Career.state
    if not state then
        showMenu()
        return
    end

    -- 幂等保护：本周行动已经结算过就不再放行（否则可以反复点"更换行动"刷属性）
    if actionDoneThisWeek_ then
        UI.Toast.Show("本周行动已经安排过了，推进一周后再来。",
            { duration = 2, variant = "warning", position = "top" })
        showHub()
        return
    end

    -- 周行动的结算键保存在生涯存档中，重新进入游戏也不能再次刷奖励。
    if state.actionDoneKey == string.format("%d-%d", state.season, state.week) then
        UI.Toast.Show("本周行动已经安排过了，推进一周后再来。",
            { duration = 2, variant = "warning", position = "top" })
        showHub()
        return
    end

    UI.SetRoot(ScreenHub.BuildActionPicker(state,
        function(actionId)  -- 选定行动
            if actionDoneThisWeek_ or state.actionDoneKey == string.format("%d-%d", state.season, state.week) then return end
            selectedAction_ = actionId
            actionDoneThisWeek_ = true
            state.actionDoneKey = string.format("%d-%d", state.season, state.week)
            -- 加练只随训练消耗；休息/商业活动不会浪费已观看的奖励。
            local training = actionId:sub(1, 6) == "train_"
            local boosted = training and state.actionDoublePending == true
            actionResultText_ = Career.applyAction(actionId, boosted and 2.0 or 1.0)
            if boosted then state.actionDoublePending = false end
            Career.save()
            actionFocus_ = false
            Audio.Play("levelup")
            UI.Toast.Show(actionResultText_, { duration = 2.5, variant = "success", position = "top" })
            showHub()
        end,
        function()  -- 取消
            actionFocus_ = false
            showHub()
        end,
        {
            focusActive = actionFocus_,
            focusCharges = state.focusCharges or 0,
            actionDoubleActive = state.actionDoublePending == true,
            onFocusAd = function()
                actionFocus_ = true
                return Career.grantFocus(Config.AD_REWARDS.focusCharges)
            end,
            onActionDouble = not state.actionDoublePending and function()
                state.actionDoublePending = true
                return "私人教练已就位：下次周训练属性与经验收益翻倍（休息/商业活动不消耗）"
            end or nil,
            rebuild = function()
                openActionPicker()
            end,
        }))
end

showHub = function()
    inMatch_ = false
    inMini_ = false
    ScreenMini.clear()
    local state = Career.state
    if not state then
        showMenu()
        return
    end

    -- 生涯已结束：退役后的人生章节继续推进。
    if state.retired then
        showRetire()
        return
    end

    local root = ScreenHub.Build(state, {
        onAction = function()  -- 打开行动选择
            openActionPicker()
        end,
        onAdvance = function()  -- 推进一周
            runWeek()
        end,
        onTraining = function()  -- 打开训练馆
            showTraining()
        end,
        actionText = actionResultText_,
        onToggleMode = function()  -- 切换比赛模式
            state.matchMode = (state.matchMode == "text") and "live" or "text"
            Career.save()
            UI.Toast.Show(
                state.matchMode == "text" and "已切换到文字直播模式" or "已切换到操作比赛模式",
                { duration = 2, variant = "info", position = "top" })
            showHub()
        end,
        onAttr = function()  -- 打开能力特训（加点）页
            showAttr()
        end,
        onTransfer = function()
            showTransfer()
        end,
        onFinance = function()
            showFinance()
        end,
        onWelfare = function()
            showWelfare()
        end,
        onBadge = function()
            showBadge()
        end,
        onRival = function()
            showRival()
        end,
        onRoster = function()
            showRoster()
        end,
        onAllStar = function()
            showAllStar()
        end,
        allStarReady = AllStar.shouldOffer(state),
        rosterNote = Teammates.chemistryLabel(state),
        rivalNote = (function()
            local r = Rival.get(state)
            if not r then return nil end
            local w, l = Rival.headToHead(state)
            return string.format("%s · %d胜%d负", r.name, w, l)
        end)(),
        onStory = function()
            showStoryArchive()
        end,
    })
    UI.SetRoot(root)
end

showStoryArchive = function(selected)
    local state = Career.state
    if not state then showMenu(); return end
    local history = state.storyHistory or {}
    local index = selected or #history
    local content = {}
    if index > 0 then
        local chapter = history[index]
        content = {
            Common.Block(string.format("%d 岁 · %s", chapter.age, chapter.title), {
                Common.Body(LifeStory.read(state, chapter), 14),
                Common.Sub("你的选择 · " .. chapter.choice, 13),
                Common.Body(chapter.response, 13),
            }, { barColor = C.primary }),
        }
    else
        content = { Common.Block("第一页", {
            Common.Body("每一年，都有值得记住的生活。打完人生序章，这本故事就会有第一篇。", 14),
        }) }
    end
    local pager = {}
    if index > 1 then
        pager[#pager + 1] = UI.Button {
            text = "◀ 上一章", flexGrow = 1, flexBasis = 0, height = 48,
            onClick = function() showStoryArchive(index - 1) end,
        }
    end
    if index < #history then
        pager[#pager + 1] = UI.Button {
            text = "下一章 ▶", flexGrow = 1, flexBasis = 0, height = 48,
            onClick = function() showStoryArchive(index + 1) end,
        }
    end
    UI.SetRoot(Common.Screen(Career.getStage().bg, {
        Common.TopBar(string.format("人生故事 %d / %d", index, #history), function()
            if state.retired then showRetire() else showHub() end
        end),
        UI.ScrollView {
            flexGrow = 1, flexBasis = 0, scrollY = true, showScrollbar = true,
            children = { UI.Panel {
                width = "100%", padding = 14, gap = 12,
                children = content,
            } },
        },
        UI.Panel {
            width = "100%", flexDirection = "row", gap = 8,
            padding = 12, backgroundColor = C.bgPanel,
            children = pager,
        },
    }, { dim = 0.55 }))
end

-- ---------------------------------------------------------------------------
-- 能力特训（属性加点）
-- ---------------------------------------------------------------------------

showAttr = function()
    inMatch_ = false
    UI.SetRoot(ScreenAttr.Build(function()
        showHub()
    end))
end

--- 转会市场
showTransfer = function()
    inMatch_ = false
    UI.SetRoot(ScreenTransfer.Build(function()
        showHub()
    end))
end

--- 球队福利社
showWelfare = function()
    inMatch_ = false
    UI.SetRoot(ScreenWelfare.Build(function()
        showHub()
    end))
end

--- 设置页
showSettings = function()
    UI.SetRoot(ScreenSettings.Build(function()
        showMenu()
    end))
end

--- 徽章墙
showBadge = function()
    inMatch_ = false
    UI.SetRoot(ScreenBadge.Build(function()
        showHub()
    end))
end

--- 宿敌页：职业阶段起，宿敌是本季最重要的叙事线
showRival = function()
    inMatch_ = false
    inMini_ = false
    local state = Career.state
    if not state then
        showMenu()
        return
    end
    Rival.ensure(state)
    UI.SetRoot(ScreenRival.Build(state, function()
        Career.save()
        showHub()
    end))
end

--- 阵容页：队友、羁绊与化学反应（化学反应会真实影响球队实力）
showRoster = function()
    inMatch_ = false
    inMini_ = false
    local state = Career.state
    if not state then
        showMenu()
        return
    end
    Teammates.ensure(state)
    UI.SetRoot(ScreenRoster.Build(state, function()
        Career.save()
        showHub()
    end))
end

--- 全明星周末：三分大赛 + 扣篮大赛（赛季中段自动开启，也可从主页手动进入）
showAllStar = function()
    inMatch_ = false
    inMini_ = false
    local state = Career.state
    if not state then
        showMenu()
        return
    end
    if not AllStar.shouldOffer(state) then
        UI.Toast.Show("本赛季的全明星周末已经结束了", { duration = 2.5, variant = "info", position = "top" })
        showHub()
        return
    end
    UI.SetRoot(ScreenAllStar.Build(state, function()
        Career.save()
        showHub()
    end))
end

--- 经纪与财务（可以从财务页直接跳到能力特训去花钱）
showFinance = function()
    inMatch_ = false
    UI.SetRoot(ScreenFinance.Build(function()
        showHub()
    end, function()
        showAttr()
    end))
end

-- ---------------------------------------------------------------------------
-- 训练馆（独立操作玩法）
-- ---------------------------------------------------------------------------

--- 结算一份玩法奖励，返回本次实际变化的明细文案
---@param rewards table|nil { scoring, playmaking, defense, athletic, iq, stamina, morale, fame }
---@param forDouble boolean|nil 加倍那一次：只翻正收益，不再重复扣体力
---@return string[]
local function applyMiniRewards(rewards, forDouble)
    local state = Career.state
    ---@type string[]
    local texts = {}
    if not state or not rewards then return texts end

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
                table.insert(texts, string.format("%s %+d", names[def.key] or def.key, real))
            end
        end
    end

    local stamina = rewards.stamina
    if stamina and stamina ~= 0 and (not forDouble or stamina > 0) then
        local before = state.stamina
        Career.addStamina(stamina)
        local actual = state.stamina - before
        if actual ~= 0 then table.insert(texts, string.format("体力 %+d", actual)) end
    end
    if rewards.morale and rewards.morale ~= 0 and (not forDouble or rewards.morale > 0) then
        local before = state.morale
        Career.addMorale(rewards.morale)
        local actual = state.morale - before
        if actual ~= 0 then table.insert(texts, string.format("士气 %+d", actual)) end
    end
    if rewards.fame and rewards.fame ~= 0 and (not forDouble or rewards.fame > 0) then
        Career.addFame(rewards.fame)
        table.insert(texts, string.format("人气 %+d", rewards.fame))
    end
    Career.save()
    return texts
end

--- 显示玩法结算并应用奖励
--- 训练基础奖励在玩法结束时结算；可选看广告额外领取一次正收益。
---@param title string
---@param lines string[]
---@param rewards table|nil
---@param onDone fun()
local function showMiniResult(title, lines, rewards, onDone)
    local rewardTexts = applyMiniRewards(rewards, false)
    local rewardStr = "无变化"
    if #rewardTexts > 0 then
        rewardStr = table.concat(rewardTexts, "   ")
    end

    local canDouble = false
    if rewards then
        local state = Career.state
        if state then
            for i = 1, #Config.ATTRS do
                local key = Config.ATTRS[i].key
                if (rewards[key] or 0) > 0 and (state.attrs[key] or 0) < Career.getPotential(key) then
                    canDouble = true
                end
            end
            if (rewards.morale or 0) > 0 and state.morale < 100 then canDouble = true end
            if (rewards.stamina or 0) > 0 and state.stamina < 100 then canDouble = true end
            if (rewards.fame or 0) > 0 then canDouble = true end
        end
    end
    UI.SetRoot(ScreenTraining.BuildResult(title, lines, rewardStr, function()
        onDone()
    end, canDouble and function()
        applyMiniRewards(rewards, true)
    end or nil))
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
            showHub()
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

    -- 体能门槛：训练馆的属性收益必须付出体能代价，否则体力见底后
    -- 反复重开玩法就能无限刷属性（一周把能力堆满）。这里做入口兜底，
    -- 界面上的入口在体能不足时也会置灰。
    local ok, reason = Career.canTrain(mode)
    if not ok then
        Audio.Play("rim", 0.6)
        UI.Toast.Show(reason, { duration = 2.4, variant = "warning", position = "top" })
        inMini_ = false
        showTraining()
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
                    stamina = -Career.trainingCost("shot"),
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
                    stamina = -Career.trainingCost("dribble"),
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
                    stamina = -Career.trainingCost("defend"),
                }, function()
                    showTraining()
                end)
            end)
        UI.SetRoot(root)
    end
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
    local wonTitle = false
    for i = 1, #events do
        if events[i]:find("总冠军") then wonTitle = true end
        lines[i] = UI.Label {
            text = events[i],
            fontSize = 13,
            fontColor = Config.COLORS.textMain,
            whiteSpace = "normal",
            lineHeight = 1.6,
        }
    end

    -- 夺冠是情绪高点：用欢呼声强调（其他赛季结算走普通音效）
    Audio.Play(wonTitle and "cheer" or "levelup")

    local state = Career.state
    -- 本赛季的广告次数由存档配额限制，达到潜力硬上限时不提供无收益广告。
    local campAd = state and not state.retired
        and Ads.left(state, "seasonCamp") > 0
    -- bestVal 必须与 bestKey/bestName 同层：下方的广告说明文案要用它展示「现在多少」
    local bestKey, bestName, bestVal = nil, nil, 0
    if campAd then
        bestVal = -1
        for i = 1, #Config.ATTRS do
            local def = Config.ATTRS[i]
            local value = state.attrs[def.key] or 0
            if value > bestVal then
                bestKey, bestName, bestVal = def.key, def.name, value
            end
        end
        if bestKey and Career.getPotential(bestKey) >= Config.ATTR_MAX + 20 then campAd = false end
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
            -- 潜力突破：点之前就要看得见「差多少」。
            -- 只写「上限 +5」玩家无感——写清「现在 82 / 上限 87，已经练不动了」，
            -- 这个广告位才有说服力（按钮上直接内联突破前后的数值）。
            campAd and AdWidgets.AdTag(string.format(
                "%s 现在 %d，潜力上限 %d —— 已经顶到头，再练也不涨。突破后才继续涨。",
                bestName or "最高能力", bestVal,
                Career.getPotential(bestKey))) or UI.Panel { height = 0 },
            campAd and AdWidgets.Button(state, "seasonCamp", function()
                local msg = Career.breakPotentialTop(Config.AD_REWARDS.seasonCampStep)
                return "休赛期特训营：" .. msg .. "（仅提升潜力上限，不直接增加能力）"
            end, {
                label = string.format("▶ 看广告 · %s上限 %d → %d（本季剩 %d 次）",
                    bestName or "最高能力",
                    Career.getPotential(bestKey),
                    Career.getPotential(bestKey) + Config.AD_REWARDS.seasonCampStep,
                    Ads.left(state, "seasonCamp")),
                onFinished = function() showSeasonReport(events, onDone) end,
            }) or UI.Panel { height = 0 },
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

--- 启动本周比赛（操作模式 / 文字直播模式）
---@param state CareerState
local function startWeekMatch(state)
    local stage = Career.getStage()

    if state.matchMode == "text" then
        MatchText.start(state, stage)
        inTextMatch_ = true
        UI.SetRoot(ScreenMatchText.Build(state, function()
            inTextMatch_ = false
            if onMatchFinished then onMatchFinished(state) end
        end))
    else
        Match.start(state, stage)
        inMatch_ = true
        UI.SetRoot(ScreenMatch.Build(state, function()
            inMatch_ = false
            if onMatchFinished then onMatchFinished(state) end
        end))
    end
end

--- 带伤出战前，队医在更衣室拦住你
--- 这里的广告是「刚需型」：跳过伤停等待，由玩家主动点，不做强制弹窗
---@param state CareerState
---@param onRest fun() 带伤休战（放弃本周比赛）
local function showInjuryCard(state, onRest)
    local days = state.injuryDays or 0
    local name = state.injuryName or "伤病"

    ---@type table[]
    local choices = {}

    -- 广告选项：只有还有次数时才给（没有次数就不显示，避免死按钮）
    if Ads.left(state, "heal") > 0 then
        table.insert(choices, AdWidgets.Button(state, "heal", function()
            local msg = Injury.healAll(state)
            Career.addLog(string.format("队医加急治疗，%s提前痊愈。", name))
            Career.save()
            return msg
        end, {
            label = string.format("▶ 队医加急治疗 · 免去 %d 天伤停，立刻上场", days),
            height = 54,
            onFinished = function()
                startWeekMatch(state)
            end,
        }))
    end

    table.insert(choices, Common.OutlineButton("带 伤 休 战（放弃本周比赛）", function()
        Audio.Play("click")
        UI.Toast.Show(
            string.format("伤病中（%s），本周无法出战", Injury.statusText(state)),
            { duration = 3, variant = "warning", position = "top" })
        Career.addLog(string.format("因%s缺席本周比赛。", name))
        onRest()
    end, { height = 52 }))

    table.insert(choices, Common.OutlineButton("再 想 想", function()
        Audio.Play("click")
        showHub()
    end, { height = 46, fontSize = 14 }))

    local card = UI.Panel {
        width = "100%",
        flexDirection = "column",
        backgroundColor = C.bgCard,
        borderWidth = 3,
        borderColor = C.outline,
        overflow = "hidden",
        children = {
            UI.Panel {
                width = "100%",
                height = 150,
                backgroundImage = Config.ART.evInjury,
                backgroundFit = "cover",
                borderBottomWidth = 3,
                borderBottomColor = C.outline,
            },
            Common.Bar("赛 前 更 衣 室", C.danger),
            UI.Panel {
                width = "100%",
                flexDirection = "column",
                gap = 14,
                padding = 16,
                children = {
                    UI.Label {
                        text = string.format(
                            "队医按了按你的伤处，眉头没松开：\n「%s，还有 %d 天。这状态上场，风险你自己清楚。」",
                            name, days),
                        fontSize = 14,
                        fontColor = C.textMain,
                        whiteSpace = "normal",
                        lineHeight = 1.7,
                    },
                    AdWidgets.AdTag("队医是外请的专家，出手一次就要占用他一段档期。"),
                    UI.Panel {
                        width = "100%",
                        flexDirection = "column",
                        gap = 10,
                        children = choices,
                    },
                },
            },
        },
    }

    UI.SetRoot(UI.Panel {
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
                children = { card },
            },
        },
    })
end

-- ---------------------------------------------------------------------------
-- 跳过比赛（快速模拟）
--
-- 免费额度每天 5 场（现实日期滚动），用完后看一次广告 +15 场。
-- 跳过完全走文字直播的推演引擎（MatchText.skipWholeMatch），因此结果与亲手打
-- 同一量级 —— 它省的是时间，不是难度。跳过之后照常走 onMatchFinished，
-- 赛程、伤病、队友、宿敌、战报一个都不少。
-- ---------------------------------------------------------------------------

--- 执行跳过：推演 + 结算 + 照常走赛后流程
---@param state CareerState
local function doSkipMatch(state)
    MatchText.skipWholeMatch(state, Career.getStage())
    Career.save()
    -- 跳过不占用比赛界面状态（inMatch_/inTextMatch_），直接进赛后结算
    if onMatchFinished then onMatchFinished(state) end
end

--- 弹出「跳过比赛」确认卡
--- 免费额度用完时，主按钮变成广告按钮（看完 +15 场并直接跳过本场）。
---@param state CareerState
---@param onCancel fun() 取消后回到赛前卡片
local function showSkipCard(state, onCancel)
    local left = Ads.left(state, "skipMatch")
    local bonus = Config.SKIP_MATCH.adBonus
    local free = Config.SKIP_MATCH.freePerDay

    ---@type string
    local tip
    if left > 0 then
        tip = string.format("今天还能免费跳过 %d 场（每天 %d 场，现实时间刷新）。", left, free)
    else
        tip = string.format("今天的免费跳过次数已用完。看一次广告可追加 %d 场。", bonus)
    end

    ---@type table[]
    local buttons = {}

    if left > 0 then
        -- 免费跳过：直接推演
        table.insert(buttons, Common.PrimaryButton("跳 过 本 场", function()
            Audio.Play("whistle")
            Ads.consume(state, "skipMatch")
            doSkipMatch(state)
        end))
    else
        -- 额度用完：看广告换次数（看完直接跳过本场，不再多一步确认）
        table.insert(buttons, AdWidgets.Button(state, "skipMatch", function()
            -- onReward：先加次数，再消耗一次完成本场跳过。
            -- 顺序不能反 —— addQuota 内部会先做懒重置，若先 consume 会把
            -- 刚补发的次数当成旧额度处理。
            Ads.addQuota(state, "skipMatch", bonus)
            Ads.consume(state, "skipMatch")
            doSkipMatch(state)
            return string.format("已追加 %d 场跳过次数，本场已模拟完成", bonus)
        end, {
            label = string.format("▶ 看广告 · 追加 %d 场跳过（今日已用完）", bonus),
            height = 56,
            fontSize = 15,
        }))
    end

    table.insert(buttons, Common.OutlineButton("再 想 想（回到赛前）", function()
        Audio.Play("click")
        onCancel()
    end, { height = 46, fontSize = 14 }))

    local card = UI.Panel {
        width = "100%",
        flexDirection = "column",
        backgroundColor = C.bgCard,
        borderWidth = 3,
        borderColor = C.outline,
        overflow = "hidden",
        children = {
            Common.Bar("快 速 模 拟", C.secondary),
            UI.Panel {
                width = "100%",
                flexDirection = "column",
                gap = 12,
                padding = 16,
                children = {
                    Common.Body("跳过本场比赛，直接按你的球队实力推演出结果与战报。", 14),
                    Common.Sub("对手强度、体能消耗、伤病判定、队友化学反应都与亲手打完全一致；省下的是时间，不是难度。", 12),
                    Common.Sub(tip, 12),
                },
            },
        },
    }

    UI.SetRoot(UI.Panel {
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
                        gap = 10,
                        children = {
                            card,
                            UI.Panel {
                                width = "100%",
                                flexDirection = "column",
                                gap = 8,
                                children = buttons,
                            },
                        },
                    },
                },
            },
        },
    })
end

--- 体能见底时，体能师在更衣室拦住你（看广告把体能拉满）
---@param state CareerState
---@param onGo fun() 直接上场
local function showStaminaCard(state, onGo)
    local now = math.floor(state.stamina or 0)

    ---@type table[]
    local choices = {
        AdWidgets.Button(state, "stamina", function()
            Career.addStamina(100)
            Career.save()
            return string.format("体能拉满（%d → 100），手感不会再打折", now)
        end, {
            label = string.format("▶ 体能师急救 · 体能拉满（现在 %d）", now),
            height = 54,
            onFinished = function()
                onGo()
            end,
        }),
        Common.OutlineButton("就 这 样 上 场", function()
            Audio.Play("click")
            onGo()
        end, { height = 52 }),
    }

    local card = UI.Panel {
        width = "100%",
        flexDirection = "column",
        backgroundColor = C.bgCard,
        borderWidth = 3,
        borderColor = C.outline,
        overflow = "hidden",
        children = {
            Common.Bar("赛 前 体 能", { 96, 200, 140, 255 }),
            UI.Panel {
                width = "100%",
                flexDirection = "column",
                gap = 14,
                padding = 16,
                children = {
                    UI.Label {
                        text = string.format(
                            "体能师看了一眼你的数据：\n「%d 的体能，出手绿区要缩一圈。今晚这场，你自己掂量。」",
                            now),
                        fontSize = 14,
                        fontColor = C.textMain,
                        whiteSpace = "normal",
                        lineHeight = 1.7,
                    },
                    AdWidgets.AdTag("体能师是按次收费的，一次顶你半天工资。"),
                    UI.Panel {
                        width = "100%",
                        flexDirection = "column",
                        gap = 10,
                        children = choices,
                    },
                },
            },
        },
    }

    UI.SetRoot(UI.Panel {
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
                children = { card },
            },
        },
    })
end

--- 推进前的「本周日程」确认
--- 此前点「推进一周」直接开打，玩家不知道对手是谁、主场还是客场、有没有剧情。
--- 现在先摊开这周要面对什么，玩家确认后才进入比赛。
---@param state CareerState
---@param onConfirm fun()
showWeekPreview = function(state, onConfirm)
    local Schedule = require("Core.Schedule")
    local Timeline = require("Core.Timeline")

    local weekKind = Schedule.weekKind(state)
    local opp = Schedule.weekOpponent(state)
    local tlEntry = Timeline.get(state, state.week)

    ---@type table[]
    local children = {}

    -- 周次 + 类型
    ---@type string
    local kindText
    ---@type RGBAColor
    local kindColor
    if weekKind == "playoff" then
        kindText, kindColor = "季后赛", C.primary
    elseif weekKind == "game" then
        kindText, kindColor = "比赛日", C.primary
    elseif weekKind == "offseason" then
        kindText, kindColor = "休赛期", C.textSub
    else
        kindText, kindColor = "休整日", C.secondary
    end

    table.insert(children, UI.Panel {
        width = "100%",
        flexDirection = "row",
        alignItems = "center",
        gap = 8,
        children = {
            Common.Tag(string.format("第 %d 周", state.week), kindColor),
            Common.Tag(kindText, kindColor),
        },
    })

    -- 对手情报
    if opp then
        table.insert(children, UI.Panel {
            width = "100%",
            flexDirection = "column",
            gap = 8,
            padding = 14,
            backgroundColor = C.bgCardLight,
            borderWidth = 2,
            borderColor = C.outline,
            children = {
                UI.Label {
                    text = opp.playoff
                        and string.format("%s · 对阵 %s", opp.roundName or "季后赛", opp.opponent)
                        or string.format("对阵 %s", opp.opponent),
                    fontSize = 17,
                    fontWeight = "bold",
                    fontColor = C.textMain,
                    whiteSpace = "normal",
                },
                UI.Panel {
                    width = "100%",
                    flexDirection = "row",
                    justifyContent = "space-between",
                    children = {
                        Common.KV("对手实力", string.format("%d（%s）", opp.strength,
                            Schedule.strengthLabel(opp.strength, state))),
                        Common.KV("场地", opp.home and "主场" or "客场",
                            opp.home and C.success or C.textSub),
                    },
                },
                Common.KV("你的体能", string.format("%d", math.floor(state.stamina or 0)),
                    (state.stamina or 0) < Config.AD_REWARDS.staminaGate and C.danger or C.success),
            },
        })
    else
        table.insert(children, Common.Body(
            "本周没有比赛。可以安排一次周行动（训练 / 休息 / 商业活动），再推进到下一周。", 13))
    end

    -- 剧情预告
    if tlEntry and tlEntry.title then
        table.insert(children, UI.Panel {
            width = "100%",
            flexDirection = "row",
            alignItems = "flex-start",
            gap = 8,
            padding = 10,
            backgroundColor = { 255, 246, 224, 255 },
            borderWidth = 2,
            borderColor = C.accent,
            children = {
                UI.Label { text = "本周剧情", fontSize = 11, fontWeight = "bold",
                    fontColor = { 196, 120, 16, 255 }, flexShrink = 0 },
                UI.Label {
                    text = tlEntry.title,
                    fontSize = 13,
                    fontWeight = "bold",
                    fontColor = C.textMain,
                    whiteSpace = "normal",
                    flexGrow = 1, flexShrink = 1, flexBasis = 0,
                },
            },
        })
    end

    -- 未安排行动时提醒一句（不阻塞，只提示）
    if actionResultText_ == "" and not Career.hasGameThisWeek() then
        table.insert(children, Common.Sub("提示：本周还没安排行动，推进前可以先安排一次。", 11))
    end

    local card = UI.Panel {
        width = "100%",
        flexDirection = "column",
        backgroundColor = C.bgCard,
        borderWidth = 3,
        borderColor = C.outline,
        overflow = "hidden",
        children = {
            Common.Bar("本 周 日 程", kindColor),
            UI.Panel {
                width = "100%",
                flexDirection = "column",
                gap = 12,
                padding = 16,
                children = children,
            },
        },
    }

    ---@type table[]
    local actions = {}
    if opp then
        table.insert(actions, Common.PrimaryButton("开 打", function()
            Audio.Play("whistle")
            onConfirm()
        end))
        -- 跳过本场：免去 16 回合的手动操作，直接推演结果。
        -- 免费额度每天 5 场，用完看广告续 —— 额度信息放在按钮上，不用点进去才知道。
        local skipLeft = Ads.left(state, "skipMatch")
        ---@type string
        local skipLabel
        if skipLeft > 0 then
            skipLabel = string.format("跳 过 本 场 · 快速模拟（今日剩 %d）", skipLeft)
        else
            skipLabel = "跳 过 本 场 · 看广告追加次数"
        end
        table.insert(actions, Common.SecondaryButton(skipLabel, function()
            Audio.Play("click")
            showSkipCard(state, function()
                -- 取消后回到赛前卡片
                showWeekPreview(state, onConfirm)
            end)
        end))
    else
        table.insert(actions, Common.PrimaryButton("推 进 一 周", function()
            Audio.Play("whistle")
            onConfirm()
        end))
    end
    table.insert(actions, Common.OutlineButton("先 去 安 排 行 动", function()
        Audio.Play("click")
        openActionPicker()
    end, { height = 46, fontSize = 14 }))

    UI.SetRoot(UI.Panel {
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
                        gap = 10,
                        children = {
                            card,
                            UI.Panel {
                                width = "100%",
                                flexDirection = "column",
                                gap = 8,
                                children = actions,
                            },
                        },
                    },
                },
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

    -- 生涯已结束 → 直接进入退役结算
    if state.retired then
        showRetire()
        return
    end

    -- 只有本年龄主线读完才允许推进，老存档也不会错过当前年龄的篇章。
    if LifeStory.atAge(state) then
        showLifeChapter()
        return
    end

    -- 先摊开本周日程，玩家确认后再进入比赛
    showWeekPreview(state, function()
        runWeekConfirmed(state)
    end)
end

--- 玩家确认日程后，真正执行本周
---@param state CareerState
runWeekConfirmed = function(state)
    -- 1) 若本周有比赛 → 先打比赛
    if Career.hasGameThisWeek() then
        -- 伤病期间：队医询问（广告在这里是"跳过等待"的捷径，原生路径是休战）
        if Injury.isInjured(state) then
            showInjuryCard(state, function()
                afterMatchFlow()
            end)
            return
        end

        -- 体能见底：体能师询问（广告把体能拉满，原生路径是硬着头皮上）
        if (state.stamina or 0) < Config.AD_REWARDS.staminaGate and Ads.left(state, "stamina") > 0 then
            showStaminaCard(state, function()
                kickoffMatch(state)
            end)
            return
        end

        kickoffMatch(state)
        return
    end

    -- 无比赛 → 日常事件
    afterMatchFlow()
end

--- 生涯结算：退役典礼 + 名人堂评价
showRetire = function()
    inMatch_ = false
    inMini_ = false
    ScreenMini.clear()

    local state = Career.state
    if not state then
        showMenu()
        return
    end

    -- 主动退役也要读完当年的主线，不能从「最后一舞」直接跳过人生章节。
    local missedChapter = LifeStory.atAge(state)
    if missedChapter then
        EventSystem.current = missedChapter
        showEventCard(missedChapter, function() showRetire() end)
        return
    end

    -- 退役后继续推进人生章节；终章读完才显示最终评价。
    local nextChapter = LifeStory.afterRetirement(state)
    if nextChapter then
        EventSystem.current = nextChapter
        print(string.format("[Story] 退役后章节：%s", nextChapter.title))
        showEventCard(nextChapter, function()
            Career.save()
            showRetire()
        end)
        return
    end
    state.postStoryDone = true

    local C = Config.COLORS
    local verdict = Career.careerVerdict()
    local seasons = state.season - 1

    ---@type table[]
    local statRows = {
        { "效力赛季", tostring(seasons) .. " 季" },
        { "出场次数", tostring(state.games or 0) .. " 场" },
        { "生涯总得分", tostring(state.totalPoints or 0) .. " 分" },
        { "全明星", tostring(state.allStars or 0) .. " 次" },
        { "常规赛 MVP", tostring(state.mvps or 0) .. " 次" },
        { "总冠军", tostring(state.titles or 0) .. " 座" },
        { "生涯人气", tostring(math.floor(state.fame or 0)) },
    }

    ---@type table[]
    local rows = {}
    for i = 1, #statRows do
        rows[i] = UI.Panel {
            width = "100%",
            flexDirection = "row",
            justifyContent = "space-between",
            children = {
                UI.Label { text = statRows[i][1], fontSize = 13, fontColor = C.textSub },
                UI.Label { text = statRows[i][2], fontSize = 13, fontWeight = "bold", fontColor = C.textMain },
            },
        }
    end

    ---@type table[]
    local honorWidgets = {}
    local honors = state.honors or {}
    local hn = math.min(6, #honors)
    for i = 1, hn do
        honorWidgets[i] = UI.Label {
            text = "· " .. honors[#honors - hn + i],
            fontSize = 12,
            fontColor = C.accent,
            whiteSpace = "normal",
        }
    end

    local card = UI.Panel {
        width = "100%",
        flexDirection = "column",
        gap = 12,
        padding = 22,
        backgroundColor = C.bgPanel,
        borderWidth = 3,
        borderColor = C.outline,
        children = {
            UI.Panel {
                width = "100%",
                height = 130,
                backgroundImage = Config.ART.evTrophy,
                backgroundFit = "cover",
                borderWidth = 2,
                borderColor = C.outline,
            },
            UI.Label {
                text = "一 生 的 尾 声",
                fontSize = 22,
                fontWeight = "bold",
                fontColor = C.primary,
                letterSpacing = 3,
                textAlign = "center",
            },
            UI.Label {
                text = LifeStory.ending(state),
                fontSize = 14,
                fontColor = C.textMain,
                whiteSpace = "normal",
                lineHeight = 1.8,
            },
            UI.Label {
                text = "球场记录 · 回望这一生",
                fontSize = 16,
                fontWeight = "bold",
                fontColor = C.textSub,
            },
            UI.Panel {
                width = "100%",
                padding = 12,
                flexDirection = "column",
                gap = 6,
                backgroundColor = C.bgDeep,
                borderWidth = 2,
                borderColor = C.outline,
                children = rows,
            },
            UI.Label {
                text = "职业生涯评价 · " .. verdict,
                fontSize = 13,
                fontColor = C.textMain,
                textAlign = "center",
                whiteSpace = "normal",
                lineHeight = 1.5,
            },
            #honorWidgets > 0 and UI.Panel {
                width = "100%",
                flexDirection = "column",
                gap = 4,
                children = honorWidgets,
            } or UI.Panel { width = 0, height = 0 },
            Common.OutlineButton("翻 阅 我 的 一 生", function()
                showStoryArchive()
            end),
            UI.Button {
                text = "开 启 新 的 生 涯",
                width = "100%",
                height = 52,
                fontSize = 16,
                fontWeight = "bold",
                backgroundColor = C.primary,
                textColor = { 255, 255, 255, 255 },
                borderWidth = 3,
                borderColor = C.outline,
                onClick = function()
                    Audio.Play("whistle")
                    showCreate()
                end,
            },
            Common.OutlineButton("返 回 主 菜 单", function()
                Career.save()
                showMenu()
            end),
        },
    }

    Audio.Play("levelup")
    UI.SetRoot(Common.Screen(Config.ART.bgPro, {
        UI.ScrollView {
            flexGrow = 1,
            flexBasis = 0,
            scrollY = true,
            showScrollbar = true,
            children = {
                UI.Panel {
                    width = "100%",
                    padding = 16,
                    flexDirection = "column",
                    children = { card },
                },
            },
        },
    }, { dim = 0.6 }))
end

--- 赛前事件 → 正式开赛（此前 beforeMatch 事件池从未被调用，6 条高质量内容被埋没）
---@param state CareerState
kickoffMatch = function(state)
    local ev = EventSystem.beforeMatch(state, {})
    if ev then
        showEventCard(ev, function()
            Career.save()
            startWeekMatch(state)
        end)
    else
        startWeekMatch(state)
    end
end

--- 比赛结束后的统一处理：伤病判定 → 赛后事件
---@param state CareerState
onMatchFinished = function(state)
    local result = state.lastResult

    -- 把本场结果写回赛程 / 驱动季后赛晋级
    if result then
        local Schedule = require("Core.Schedule")
        local win = (result.win == true) or (result.won == true)
        local myPoints = result.myPoints or result.points or 0

        if state.playoff and not state.playoff.done then
            local po = Schedule.advancePlayoff(state, win)
            if po.champion then
                UI.Toast.Show("★★★ 夺得总冠军！", { duration = 4, variant = "success", position = "top" })
                Audio.Play("cheer")
                Audio.Play("win")
            elseif po.eliminated then
                UI.Toast.Show(string.format("季后赛止步于%s", po.roundName), { duration = 3, variant = "error", position = "top" })
            elseif po.advanced then
                UI.Toast.Show("晋级总决赛！", { duration = 3, variant = "success", position = "top" })
            end
        else
            local game = Schedule.gameThisWeek(state)
            if game then
                Schedule.recordResult(state, game, win, myPoints)
                print(string.format("[Schedule] 第%d周 对阵%s %s", game.week, game.opponent, win and "胜" or "负"))
            end
        end
    end

    -- 伤病判定（操作模式全力出战，风险略高）
    local inj = Injury.roll(state, state.matchMode == "live")
    if inj then
        Injury.apply(state, inj)
        Audio.Play("injury")
        UI.Toast.Show(
            string.format("受伤！%s，预计伤停 %d 天", inj.name, inj.days),
            { duration = 3.5, variant = "error", position = "top" })
        Career.addLog(string.format("比赛中%s，伤停 %d 天。", inj.name, inj.days))
    end

    -- 队友系统：赛后更新化学反应与羁绊（直接影响下一场的球队实力）
    -- 宿敌系统：本场对手是宿敌所在球队时记录交手，并按剧情弧返回一张宿敌事件卡
    ---@type table|nil
    local rivalEvent = nil
    if result then
        local win = (result.win == true) or (result.won == true)
        local myPoints = result.myPoints or result.points or 0
        Teammates.onMatch(state, win, myPoints, math.floor(myPoints / 4))
        rivalEvent = Rival.onMatch(state, result.opponent or "", win, myPoints)
    end

    --- 战报之后：宿敌剧情 → 赛后事件 → 日常事件
    local function afterReport()
        local function afterRival()
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

        if rivalEvent then
            -- 宿敌事件走同一套事件卡流程；标记 once 语义由 Rival 内部用 seenEvents 保证
            EventSystem.current = rivalEvent
            showEventCard(rivalEvent, function()
                Career.save()
                afterRival()
            end)
            return
        end
        afterRival()
    end

    -- 赛后战报
    if result then
        UI.SetRoot(ScreenReport.Build(result, afterReport))
    else
        afterReport()
    end
end

--- 比赛之后：本周剧情事件 → 推进
--- 事件由赛季时间线预先编排（见 Core/Timeline.lua），不再是推进时的随机盲盒。
--- 时间线上这周没排事件，就安静地过去。
afterMatchFlow = function()
    local state = Career.state
    if not state then
        showMenu()
        return
    end

    local Timeline = require("Core.Timeline")
    local ev = EventSystem.fromTimeline(state, state.week)
    if not ev then
        -- 时间线这周没排事件时，交给支线剧情（9 条关系线 / 63 章）。
        -- 支线此前只存在于数据文件里，完全没接入流程，等于白写。
        ev = SideStory.pick(state)
        if ev then
            EventSystem.current = ev
            print(string.format("[SideStory] %s · %s", tostring(ev.line), tostring(ev.title)))
        end
    end
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
    -- 队友系统：每周自然变化（化学反应向基准回归、羁绊缓慢衰减）
    Teammates.onWeek(state)
    Career.save()

    -- 重置本周状态
    selectedAction_ = ""
    actionResultText_ = ""
    actionDoneThisWeek_ = false
    weekPlayed_ = false

    -- 到达退役年龄：仍先让玩家读完这一年龄的篇章，再进入尾声。
    if state.retired then
        local lastChapter = LifeStory.atAge(state)
        if lastChapter then
            EventSystem.current = lastChapter
            showEventCard(lastChapter, function()
                showSeasonReport(events, function()
                    Career.save()
                    showRetire()
                end)
            end)
        else
            showSeasonReport(events, function()
                Career.save()
                showRetire()
            end)
        end
        return
    end

    -- 赛季结束：保留原有休赛期事件，再进入新年龄的人生章节。
    if state.season ~= beforeSeason then
        -- 队友与宿敌的赛季推进（成长/衰退/离队/新人、宿敌实力成长）
        local rosterMsgs = Teammates.onSeasonEnd(state)
        for i = 1, #rosterMsgs do events[#events + 1] = rosterMsgs[i] end
        local rivalMsgs = Rival.onSeasonEnd(state)
        for i = 1, #rivalMsgs do events[#events + 1] = rivalMsgs[i] end

        local function afterSeasonEvent()
            showSeasonReport(events, function()
                Career.save()
                showLifeChapter()
            end)
        end
        local ev = EventSystem.seasonEnd(state)
        if ev then
            showEventCard(ev, afterSeasonEvent)
        else
            afterSeasonEvent()
        end
        return
    end

    -- 展示本周发生的事
    if #events > 0 then
        UI.Toast.Show(table.concat(events, "  "), { duration = 3, variant = "info", position = "top" })
    end

    -- 全明星周末：赛季过半（第 6 周）自动开启，作为赛季中段的节日与喘息点。
    -- 先 markDone 再进入，避免玩家退出后每周重复被拦。
    if state.week == 6 and AllStar.shouldOffer(state) then
        AllStar.markDone(state)
        Career.save()
        UI.Toast.Show("★ 你入选了本赛季全明星！周末的挑战开始了", { duration = 3, variant = "success", position = "top" })
        Audio.Play("crowdRoar")
        showAllStar()
        return
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
    -- 应用上次保存的音量/静音设置
    ScreenSettings.LoadAndApply()

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
    -- 退出兜底：把当前进度落盘，避免最后一次操作（如比赛奖励）随进程一起丢掉
    if Career.state then
        Career.save()
    end
    print("[篮途] 游戏退出")
end
