-- ============================================================================
-- Ads — 激励视频广告系统
--
-- 设计参考同类生涯模拟游戏，包含 12 个广告位：
--   日配额：伤病痊愈
--   赛季配额：属性点 / 潜力突破 / 技能点 / 转会刷新 / 指定下家 / 天赋升级 /
--             青训加速 / 代言邀约 / 抽奖
--   一次性：天赋重抽 / 六选全
--
-- 核心纪律（与 SDK 契约一致）：
--   1. 只有 result.success == true 才发奖
--   2. 配额只在成功回调里扣，失败不扣（玩家可重试）
--   3. 单飞锁 + 看门狗 + 一次性完成状态，防重复发奖 / 卡死 UI
--   4. 配额用"懒重置"：读取时对比游戏内日期/赛季，自动清零
-- ============================================================================

local Config = require("Core.Config")

local Ads = {}

-- ---------------------------------------------------------------------------
-- 配额定义
-- ---------------------------------------------------------------------------

--- 日配额上限
Ads.DAILY_LIMIT = {
    heal = 1,            -- 伤病痊愈：每天 1 次
}

--- 赛季配额上限
Ads.SEASON_LIMIT = {
    attrPoints   = 20,   -- 属性点 +5
    sp           = 5,    -- 技能点 +3
    adBreak      = 3,    -- 潜力上限突破 +5
    transfer     = 2,    -- 刷新转会报价
    pickClub     = 1,    -- 指定下家
    talentUp     = 1,    -- 天赋升级
    youthEarly   = 3,    -- 青训加速
    endorse      = 3,    -- 代言邀约
    lottery      = 3,    -- 抽奖头奖
}

--- 广告位文案（按钮上直接说明行为与收益）
---@class AdPlacement
---@field id string
---@field name string
---@field desc string
---@field quotaType string  "daily"|"season"|"none"
---@field quotaKey string

---@type table<string, AdPlacement>
Ads.PLACEMENTS = {
    heal = {
        id = "heal", name = "立即痊愈",
        desc = "免去全部伤停天数",
        quotaType = "daily", quotaKey = "heal",
    },
    attrPoints = {
        id = "attrPoints", name = "属性点 +5",
        desc = "5 点自由属性立即入账",
        quotaType = "season", quotaKey = "attrPoints",
    },
    sp = {
        id = "sp", name = "技能点 +3",
        desc = "3 点技能点立即入账",
        quotaType = "season", quotaKey = "sp",
    },
    adBreak = {
        id = "adBreak", name = "潜力突破 +5",
        desc = "单项能力上限提升 5 点",
        quotaType = "season", quotaKey = "adBreak",
    },
    transfer = {
        id = "transfer", name = "刷新转会报价",
        desc = "重新生成一份转会报价",
        quotaType = "season", quotaKey = "transfer",
    },
    pickClub = {
        id = "pickClub", name = "指定下家",
        desc = "任选一支球队直接加盟",
        quotaType = "season", quotaKey = "pickClub",
    },
    talentUp = {
        id = "talentUp", name = "天赋升级",
        desc = "指定一项天赋档位 +1",
        quotaType = "season", quotaKey = "talentUp",
    },
    youthEarly = {
        id = "youthEarly", name = "青训加速",
        desc = "提前看到青训苗子的成材结果",
        quotaType = "season", quotaKey = "youthEarly",
    },
    endorse = {
        id = "endorse", name = "领取代言邀约",
        desc = "立即获得一份商业代言",
        quotaType = "season", quotaKey = "endorse",
    },
    lottery = {
        id = "lottery", name = "领取头奖",
        desc = "完整观看即可中头奖，奖金直接入账",
        quotaType = "season", quotaKey = "lottery",
    },
    talentReroll = {
        id = "talentReroll", name = "天赋重抽",
        desc = "重掷天赋，保底 2 个顶级天赋",
        quotaType = "none", quotaKey = "",
    },
    talentAll = {
        id = "talentAll", name = "六选全拿",
        desc = "天赋六选三升级为六选六",
        quotaType = "none", quotaKey = "",
    },
    boost = {
        id = "boost", name = "训练经验 ×1.5",
        desc = "本赛季所有训练收益提升 50%",
        quotaType = "none", quotaKey = "",
    },
}

-- ---------------------------------------------------------------------------
-- 配额读写（懒重置）
-- ---------------------------------------------------------------------------

--- 当前游戏内日期键
---@param state CareerState
---@return string
local function dayKey(state)
    return string.format("%d-%d-%d", state.season, state.week, state.age)
end

--- 确保 adUsage 结构存在
---@param state CareerState
---@return table
local function ensure(state)
    local s = state
    if s.adUsage == nil then
        ---@type table
        s.adUsage = { day = "", heal = 0 }
    end
    return s.adUsage
end

--- 滚动日期：新的一天重置日配额
---@param state CareerState
local function rollDay(state)
    local u = ensure(state)
    local key = dayKey(state)
    if u.day ~= key then
        u.day = key
        u.heal = 0
    end
end

--- 日配额剩余
---@param state CareerState
---@param key string
---@return number
function Ads.dailyLeft(state, key)
    rollDay(state)
    local u = ensure(state)
    local cap = Ads.DAILY_LIMIT[key] or 0
    local used = u[key] or 0
    local left = cap - used
    if left < 0 then left = 0 end
    return left
end

--- 赛季配额剩余（懒重置：赛季变化即清零）
---@param state CareerState
---@param key string
---@return number
function Ads.seasonLeft(state, key)
    local u = ensure(state)
    local ofKey = key .. "Of"
    if u[ofKey] ~= state.season then
        u[ofKey] = state.season
        u[key] = 0
    end
    local cap = Ads.SEASON_LIMIT[key] or 0
    local used = u[key] or 0
    local left = cap - used
    if left < 0 then left = 0 end
    return left
end

--- 消耗一次配额（只在成功回调里调用）
---@param state CareerState
---@param placementId string
function Ads.consume(state, placementId)
    local p = Ads.PLACEMENTS[placementId]
    if not p then return end
    local u = ensure(state)

    if p.quotaType == "daily" then
        rollDay(state)
        u[p.quotaKey] = (u[p.quotaKey] or 0) + 1
    elseif p.quotaType == "season" then
        -- 先触发懒重置，再累加
        Ads.seasonLeft(state, p.quotaKey)
        u[p.quotaKey] = (u[p.quotaKey] or 0) + 1
    end
end

--- 查询某个广告位剩余次数
---@param state CareerState
---@param placementId string
---@return number
function Ads.left(state, placementId)
    local p = Ads.PLACEMENTS[placementId]
    if not p then return 0 end
    if p.quotaType == "daily" then
        return Ads.dailyLeft(state, p.quotaKey)
    elseif p.quotaType == "season" then
        return Ads.seasonLeft(state, p.quotaKey)
    end
    return 999   -- 无限制
end

--- 生成按钮文案（含剩余次数）
---@param state CareerState
---@param placementId string
---@return string
function Ads.buttonText(state, placementId)
    local p = Ads.PLACEMENTS[placementId]
    if not p then return "看广告" end

    if p.quotaType == "none" then
        return string.format("▶ 看广告 · %s", p.name)
    end

    local left = Ads.left(state, placementId)
    if left <= 0 then
        return string.format("%s（今日已用完）", p.name)
    end
    if p.quotaType == "daily" then
        return string.format("▶ 看广告 · %s（今日剩 %d 次）", p.name, left)
    end
    return string.format("▶ 看广告 · %s（本季剩 %d 次）", p.name, left)
end

-- ---------------------------------------------------------------------------
-- 播放流程
-- ---------------------------------------------------------------------------

-- 单飞锁：同一时刻只允许一个广告流程
local inFlight_ = false
-- 看门狗超时（秒）
local WATCHDOG_SECONDS = 90

-- 当前流程的看门狗状态（由 Ads.tick 驱动）
local watchdogElapsed_ = 0
---@type fun(result: table?)|nil
local finish_ = nil

--- 每帧推进看门狗（由 Main 订阅 Update 调用）
--- 只在超时时结束为失败，绝不推断成功
---@param dt number
function Ads.tick(dt)
    if not inFlight_ or not finish_ then return end
    watchdogElapsed_ = watchdogElapsed_ + dt
    if watchdogElapsed_ >= WATCHDOG_SECONDS then
        local f = finish_
        finish_ = nil
        f({ success = false, msg = "广告响应超时，请稍后重试" })
    end
end

--- 播放激励视频
--- 成功才调用 onReward；失败/超时/未受理调用 onFail（可选）
---@param onReward fun()
---@param onFail fun(msg: string)|nil
function Ads.show(onReward, onFail)
    -- 单飞保护
    if inFlight_ then
        if onFail then onFail("广告正在播放，看完后即可领取奖励") end
        return
    end
    inFlight_ = true
    watchdogElapsed_ = 0

    -- 一次性完成状态
    local completed = false
    local callbackFired = false

    --- 结束本次流程（所有路径共用，只生效一次）
    ---@param result table?
    local function finish(result)
        if completed then return end
        completed = true
        inFlight_ = false
        finish_ = nil

        if result and result.success == true then
            print("[Ads] 广告完整观看，发放奖励")
            onReward()
            return
        end

        local msg = (result and result.msg) or "广告暂不可用"
        print("[Ads] 广告未完成: " .. tostring(msg))
        if onFail then onFail(msg) end
    end

    finish_ = finish

    -- 发起请求
    local accepted = false
    local ok, err = pcall(function()
        accepted = sdk:ShowRewardVideoAd(function(result)
            callbackFired = true
            finish(result)
        end)
    end)

    if not ok then
        print("[Ads] SDK 调用异常: " .. tostring(err))
        finish({ success = false, msg = "广告暂不可用，请稍后重试" })
        return
    end

    -- 未受理且回调未同步触发 → 立即失败
    if accepted == false and not callbackFired then
        finish({ success = false, msg = "广告暂不可用，请稍后重试" })
    end
end

--- 是否正在播放广告
---@return boolean
function Ads.isBusy()
    return inFlight_
end

return Ads
