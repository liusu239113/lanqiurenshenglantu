-- ============================================================================
-- EventSystem — 剧情事件卡的筛选、触发与效果结算
-- ============================================================================

local Config = require("Core.Config")
local Events = require("Data.Events")
local Career = require("Core.Career")

local EventSystem = {}

-- 同类事件冷却周数
local CAT_COOLDOWN = 4
-- 当前待处理事件
---@type table|nil
EventSystem.current = nil

-- ---------------------------------------------------------------------------
-- 条件判定
-- ---------------------------------------------------------------------------

--- 判断事件条件是否满足
---@param ev table
---@param ctx table
---@return boolean
local function pass(ev, ctx)
    local w = ev.when
    if not w then return true end

    if w.minSeason and ctx.season < w.minSeason then return false end
    if w.maxSeason and ctx.season > w.maxSeason then return false end
    if w.minAge and ctx.age < w.minAge then return false end
    if w.maxAge and ctx.age > w.maxAge then return false end
    if w.stage and ctx.stageId ~= w.stage then return false end
    if w.res and ctx.res ~= w.res then return false end
    if w.goalsMin and ctx.myPoints < w.goalsMin then return false end
    if w.staminaMax and ctx.stamina > w.staminaMax then return false end
    if w.moraleMax and ctx.morale > w.moraleMax then return false end
    if w.moraleMin and ctx.morale < w.moraleMin then return false end
    if w.minFame and ctx.fame < w.minFame then return false end
    if w.maxFame and ctx.fame > w.maxFame then return false end

    return true
end

--- 构建判定上下文
---@param state CareerState
---@param extra table|nil
---@return table
local function makeContext(state, extra)
    ---@type table
    local ctx = {
        season = state.season,
        age = state.age,
        stageId = Career.getStage().id,
        stamina = state.stamina,
        morale = state.morale,
        fame = state.fame,
        res = nil,
        myPoints = 0,
    }
    if extra then
        for k, v in pairs(extra) do
            ctx[k] = v
        end
    end
    return ctx
end

-- ---------------------------------------------------------------------------
-- 事件抽取
-- ---------------------------------------------------------------------------

--- 列出指定池中当前可用的事件（不做随机，交给调用方决定选哪张）
--- 这是「赛季时间线」预排事件的基础：Timeline 在赛季开始时用确定性随机源
--- 从中挑一张排进某一周，触发时再按 id 找回来。
---@param state CareerState
---@param poolName string "pre" | "post" | "daily" | "ms" | "se"
---@param ctx table|nil 额外判定上下文（不传则按当前状态构造）
---@param allowCooldown boolean|nil 是否受分类冷却限制
---@return table[]
function EventSystem.candidates(state, poolName, ctx, allowCooldown)
    local pool = Events.POOLS[poolName]
    if not pool or not state then return {} end

    local context = ctx or makeContext(state)
    ---@type table[]
    local out = {}
    for i = 1, #pool do
        local ev = pool[i]
        -- 只触发一次的事件已看过则跳过
        if not (ev.once and state.seenEvents[ev.id]) and pass(ev, context) then
            -- 分类冷却（时间戳 = season*100 + week，实现真正的"同类 N 周内不重复"）
            local cat = ev.cat or "misc"
            local lastStamp = state.catCooldown[cat]
            local blocked = false
            if allowCooldown ~= false and lastStamp ~= nil then
                local nowStamp = context.season * 100 + (context.week or 1)
                if nowStamp - lastStamp < CAT_COOLDOWN then
                    blocked = true
                end
            end
            if not blocked then
                table.insert(out, ev)
            end
        end
    end
    return out
end

--- 从指定池中抽一张可用事件
---@param poolName string "pre" | "post" | "daily" | "ms" | "se"
---@param state CareerState
---@param ctx table
---@param allowCooldown boolean|nil 是否受分类冷却限制
---@return table|nil
local function draw(poolName, state, ctx, allowCooldown)
    local candidates = EventSystem.candidates(state, poolName, ctx, allowCooldown)
    if #candidates == 0 then return nil end
    return candidates[math.random(1, #candidates)]
end

--- 记录事件已触发
---@param state CareerState
---@param ev table
local function markSeen(state, ev)
    if ev.once then
        state.seenEvents[ev.id] = true
    end
    local cat = ev.cat or "misc"
    -- 时间戳 = season*100 + week，配合 CAT_COOLDOWN 实现"同类 N 周内不重复"
    state.catCooldown[cat] = state.season * 100 + (state.week or 1)
end

-- ---------------------------------------------------------------------------
-- 对外接口
-- ---------------------------------------------------------------------------

--- 赛前事件
---@param state CareerState
---@param matchInfo table|nil
---@return table|nil
function EventSystem.beforeMatch(state, matchInfo)
    local ctx = makeContext(state, matchInfo)
    local ev = draw("pre", state, ctx)
    if ev then
        markSeen(state, ev)
        EventSystem.current = ev
    end
    return ev
end

--- 赛后事件
---@param state CareerState
---@param result table
---@return table|nil
function EventSystem.afterMatch(state, result)
    local ctx = makeContext(state, {
        res = result.win and "win" or "loss",
        myPoints = result.myPoints or 0,
    })
    -- 优先里程碑
    local ev = draw("ms", state, ctx)
    if not ev then
        ev = draw("post", state, ctx)
    end
    if ev then
        markSeen(state, ev)
        EventSystem.current = ev
    end
    return ev
end

--- 日常事件
---@param state CareerState
---@return table|nil
function EventSystem.daily(state)
    local ctx = makeContext(state)
    local ev = draw("daily", state, ctx)
    if ev then
        markSeen(state, ev)
        EventSystem.current = ev
    end
    return ev
end

--- 赛季末事件
---@param state CareerState
---@return table|nil
function EventSystem.seasonEnd(state)
    local ctx = makeContext(state)
    local ev = draw("se", state, ctx)
    if ev then
        markSeen(state, ev)
        EventSystem.current = ev
    end
    return ev
end

-- ---------------------------------------------------------------------------
-- 按赛季时间线触发
-- ---------------------------------------------------------------------------

--- 触发赛季时间线上预排的事件
--- 时间线在赛季开始时已定好「这一周发生哪件事」，这里按 id 找回来。
--- 若该事件此刻条件已不满足（属性/名气变了），退回同池随机抽一张，
--- 保证玩家在时间线上看到的"这周有事件"不会落空。
---@param state CareerState
---@param week number
---@return table|nil
function EventSystem.fromTimeline(state, week)
    local Timeline = require("Core.Timeline")
    local ev, poolName = Timeline.eventFor(state, week)
    if not ev then
        if poolName then
            -- 预排的事件条件已失效 → 同池兜底
            ev = draw(poolName, state, makeContext(state))
        end
        if not ev then return nil end
    end
    markSeen(state, ev)
    EventSystem.current = ev
    return ev
end

-- ---------------------------------------------------------------------------
-- 效果结算
-- ---------------------------------------------------------------------------

--- 应用事件选项效果，返回描述文本列表
---@param state CareerState
---@param fx table
---@return string[]
function EventSystem.applyFx(state, fx)
    ---@type string[]
    local parts = {}

    if fx.scoring then
        local real = Career.addAttr("scoring", fx.scoring)
        if real ~= 0 then table.insert(parts, string.format("得分 %+d", real)) end
    end
    if fx.playmaking then
        local real = Career.addAttr("playmaking", fx.playmaking)
        if real ~= 0 then table.insert(parts, string.format("组织 %+d", real)) end
    end
    if fx.defense then
        local real = Career.addAttr("defense", fx.defense)
        if real ~= 0 then table.insert(parts, string.format("防守 %+d", real)) end
    end
    if fx.athletic then
        local real = Career.addAttr("athletic", fx.athletic)
        if real ~= 0 then table.insert(parts, string.format("体能 %+d", real)) end
    end
    if fx.iq then
        local real = Career.addAttr("iq", fx.iq)
        if real ~= 0 then table.insert(parts, string.format("意识 %+d", real)) end
    end

    if fx.morale then
        Career.addMorale(fx.morale)
        table.insert(parts, string.format("士气 %+d", fx.morale))
    end
    if fx.stamina then
        Career.addStamina(fx.stamina)
        table.insert(parts, string.format("体能储备 %+d", fx.stamina))
    end
    if fx.fame then
        Career.addFame(fx.fame)
        table.insert(parts, string.format("人气 %+d", fx.fame))
    end
    if fx.money then
        Career.addMoney(fx.money)
        table.insert(parts, string.format("收入 %+d万", fx.money))
    end

    return parts
end

--- 选择某个选项
---@param state CareerState
---@param optionIndex number
---@return table { response, parts, sfx }
function EventSystem.choose(state, optionIndex)
    local ev = EventSystem.current
    if not ev then
        return { response = "", parts = {}, sfx = "click" }
    end

    local opt = ev.options[optionIndex]
    if not opt then
        return { response = "", parts = {}, sfx = "click" }
    end

    local parts = EventSystem.applyFx(state, opt.fx or {})

    -- 把选项结果写进大事记
    if opt.response and opt.response ~= "" then
        Career.addLog(string.format("%s — %s", ev.title, opt.text))
    end

    if ev.storyChapter then
        state.storyPaths = state.storyPaths or {}
        state.storyHistory = state.storyHistory or {}
        if opt.path then
            state.storyPaths[opt.path] = (state.storyPaths[opt.path] or 0) + 1
        end
        state.storyMemory = opt.memory or ""
        table.insert(state.storyHistory, {
            id = ev.id,
            age = ev.age or state.age,
            title = ev.title,
            choice = opt.text,
            response = opt.response or "",
        })
        state.seenEvents[ev.id] = true
        print(string.format("[Story] %s · %s", ev.title, opt.text))
    end

    -- 选项可以显式触发退役（如「最后一舞」的"宣布退役"）
    local retired = false
    if opt.retire then
        retired = Career.retire()
    end

    EventSystem.current = nil

    return {
        response = opt.response or "",
        parts = parts,
        sfx = "levelup",
        retired = retired,
    }
end

return EventSystem
