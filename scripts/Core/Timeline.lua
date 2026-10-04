-- ============================================================================
-- Timeline — 赛季时间线
--
-- 解决的问题：
--   此前剧情事件是「推进一周 → 随机掷一次骰子」，玩家完全无法预期，
--   也感受不到"这一年我经历了什么"。生涯模拟的核心乐趣被随机性吃掉了。
--
-- 现在的做法：
--   赛季开始时，按「阶段 / 年龄 / 名气」把整赛季 12 周编排成一条时间线，
--   每一周预先定好：是不是比赛周、有没有剧情事件、事件属于哪一类。
--   玩家在主页和「本周日程」里都能提前看到，推进时按编排触发。
--
-- 为什么用 LCG 而不是 math.random：
--   时间线要在存档/读档之间保持稳定（同一赛季看到的日程不能变），
--   而 math.random 是全局状态、无法可靠地按赛季复现。这里用赛季号做种子的
--   轻量 LCG，保证同一球员同一赛季的时间线是确定的。
-- ============================================================================

local Config = require("Core.Config")
local EventSystem = require("Core.EventSystem")

local Timeline = {}

-- ---------------------------------------------------------------------------
-- 可复现随机（LCG）
-- ---------------------------------------------------------------------------

--- 以 seed 为起点构造一个确定性随机源
---@param seed number
---@return fun(n: number|nil): number
local function makeRng(seed)
    local s = math.floor(math.abs(seed)) % 2147483647
    if s <= 0 then s = s + 2147483646 end
    return function(n)
        s = (s * 16807) % 2147483647
        if n then
            return (s % n) + 1
        end
        return s / 2147483647
    end
end

-- ---------------------------------------------------------------------------
-- 周类型
-- ---------------------------------------------------------------------------

--- 该周是否有比赛（含季后赛）
---@param state CareerState
---@param week number
---@return boolean
local function hasGame(state, week)
    if state.playoff and not state.playoff.done then return true end
    local games = state.schedule or {}
    for i = 1, #games do
        if games[i].week == week then return true end
    end
    return false
end

-- ---------------------------------------------------------------------------
-- 生成
-- ---------------------------------------------------------------------------

--- 为当前赛季生成时间线（赛季开始时调用一次）
--- 结构：state.timeline = { [week] = { kind, pool, evId, title, cat } }
---   kind  "game" | "rest" | "offseason"
---   pool  预排事件所在的池子名（"pre"|"post"|"daily"|"ms"|"se"），无事件为 nil
---   evId  预排事件的 id（触发时若条件已不满足，会退回同池随机）
---   title 预排事件标题（给玩家看的预告）
---@param state CareerState
function Timeline.build(state)
    if not state then return end

    local rng = makeRng(state.season * 7919 + state.age * 131 + 17)
    local weeks = Config.SEASON.weeksPerSeason
    local chance = Config.SEASON.eventChance or 0.6

    ---@type table<number, table>
    local tl = {}

    for week = 1, weeks do
        local isGame = hasGame(state, week)
        ---@type string
        local kind = isGame and "game" or "rest"

        -- 是否给这周排一个剧情事件
        local roll = rng()
        -- 比赛周更容易出「赛前/赛后」事件；休息周出「日常」事件
        local weekChance = isGame and chance or (chance * 0.75)
        if roll > weekChance then
            tl[week] = { kind = kind }
        else
            -- 定池：比赛周在「赛前」和「赛后」之间随机（否则赛后事件永远排不上）；
            -- 休息周走日常。池子随机顺序 = 先试首选，空了再试另一个。
            ---@type string[]
            local pools
            if isGame then
                pools = (rng() < 0.5) and { "pre", "post" } or { "post", "pre" }
            else
                pools = { "daily" }
            end

            ---@type table|nil
            local picked = nil
            ---@type string|nil
            local pickedPool = nil

            for i = 1, #pools do
                local poolName = pools[i]
                local cands = EventSystem.candidates(state, poolName)
                if #cands > 0 then
                    local ev = cands[rng(#cands)]
                    if ev then
                        picked = ev
                        pickedPool = poolName
                        break
                    end
                end
            end

            if picked then
                tl[week] = {
                    kind = kind,
                    pool = pickedPool,
                    evId = picked.id,
                    title = picked.title,
                    cat = picked.cat or "misc",
                }
            else
                tl[week] = { kind = kind }
            end
        end
    end

    state.timeline = tl
    state.timelineSeason = state.season

    local n = 0
    for _ in pairs(tl) do n = n + 1 end
    print(string.format("[Timeline] 第 %d 赛季时间线已生成（%d 周）", state.season, n))
end

--- 确保当前赛季有时间线（读档 / 首次进入兜底）
---@param state CareerState
function Timeline.ensure(state)
    if not state then return end
    if not state.timeline or state.timelineSeason ~= state.season then
        Timeline.build(state)
    end
end

-- ---------------------------------------------------------------------------
-- 查询
-- ---------------------------------------------------------------------------

--- 取某周的时间线条目
---@param state CareerState
---@param week number
---@return table|nil
function Timeline.get(state, week)
    Timeline.ensure(state)
    if not state or not state.timeline then return nil end
    return state.timeline[week]
end

--- 取某周预排的事件对象（找不到返回 nil）
---@param state CareerState
---@param week number
---@return table|nil ev
---@return string|nil poolName
function Timeline.eventFor(state, week)
    local entry = Timeline.get(state, week)
    if not entry or not entry.evId then return nil, nil end
    local Events = require("Data.Events")
    local pool = Events.POOLS[entry.pool]
    if not pool then return nil, nil end
    for i = 1, #pool do
        if pool[i].id == entry.evId then
            return pool[i], entry.pool
        end
    end
    return nil, entry.pool
end

--- 给 UI 的整赛季预览（每周一行）
---@param state CareerState
---@return table[] { week, kind, hasEvent, title }
function Timeline.preview(state)
    Timeline.ensure(state)
    ---@type table[]
    local out = {}
    if not state or not state.timeline then return out end
    local weeks = Config.SEASON.weeksPerSeason
    for week = 1, weeks do
        local e = state.timeline[week] or { kind = "rest" }
        out[#out + 1] = {
            week = week,
            kind = e.kind or "rest",
            hasEvent = e.title ~= nil,
            title = e.title,
        }
    end
    return out
end

--- 某周的一句话描述（给「本周日程」用）
---@param state CareerState
---@param week number
---@return string
function Timeline.describe(state, week)
    local entry = Timeline.get(state, week)
    if not entry then return "自由安排" end
    if entry.kind == "game" then
        if entry.title then
            return string.format("比赛日 · %s", entry.title)
        end
        return "比赛日"
    end
    if entry.title then
        return string.format("休整日 · %s", entry.title)
    end
    return "休整日"
end

return Timeline
