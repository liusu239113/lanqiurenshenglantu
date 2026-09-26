-- ============================================================================
-- Ads — 激励视频广告系统
--
-- 点位设计纪律（每条都对应一个玩家主动操作的功能，不做全屏堆砌）：
--   1. 每个广告位都必须挂在某个具体的玩法子模块里，同一界面最多 1 个按钮
--   2. 广告只是"捷径"，原生路径永远保留（训练拿经验 / 经验换属性点）
--   3. 奖励数值集中在 Config.AD_REWARDS，改数值不动业务代码
--
-- 当前点位（5 个，各自独立分布）：
--   heal         → 伤病卡「队医加急治疗」（刚需：跳过伤停等待）
--   attrPoints   → 属性页「特训名额」（刚需：确定性拿属性点）
--   boost        → 训练馆「聘请体能师」（拆分链路：训练收益放大器）
--   talentReroll → 建角天赋卡「球探重拟报告」（保底传奇，替代纯随机）
--   talentAll    → 建角天赋卡「全部带走」（六选三 → 六选六）
--   lottery      → 财务页「刮一张彩票」（拆分链路 D：资金）
--   pickTeam     → 转会市场「定向转会」（刚需：确定性替代抽签）
--   doubleReward → 玩法结算页「再来一组」（立竿见影：收益翻倍）
--   stamina      → 赛前体能师「体能师急救」（刚需：体力低时回满）
--   press        → 剧情事件结果「经纪人放料」（拆分链路：人气）
--   tactic       → 战术板「秘密战术」（特权服务：解锁特殊战术）
--   actionDouble → 周行动弹窗「私人教练加练」（拆分链路：训练收益）
--   review       → 赛后战报「教练复盘」（立竿见影：人气/经验再来一份）
--   seasonCamp   → 赛季结算「休赛期特训营」（刚需：潜力上限突破）
--   welfare      → 球队福利页「找队长多领一份」（拆分链路 D：资源）
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
-- 配额定义（数值来自 Config.AD_REWARDS，方便后期调参）
-- ---------------------------------------------------------------------------

--- 日配额上限
Ads.DAILY_LIMIT = {
    heal = Config.AD_REWARDS.healDaily,
    lottery = Config.AD_REWARDS.lotteryDaily,
    stamina = Config.AD_REWARDS.staminaDaily,
    press = Config.AD_REWARDS.pressDaily,
    welfare = Config.AD_REWARDS.welfareDaily,
}

--- 赛季配额上限
Ads.SEASON_LIMIT = {
    attrPoints = Config.AD_REWARDS.attrPointsSeason,
    doubleReward = Config.AD_REWARDS.doubleSeason,
    actionDouble = Config.AD_REWARDS.actionDoubleSeason,
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
        id = "heal", name = "队医加急治疗",
        desc = "免去全部伤停天数，下一场立刻能打",
        quotaType = "daily", quotaKey = "heal",
    },
    attrPoints = {
        id = "attrPoints", name = "特训名额",
        desc = string.format("%d 点自由属性立即入账", Config.AD_REWARDS.attrPoints),
        quotaType = "season", quotaKey = "attrPoints",
    },
    review = {
        id = "review", name = "教练复盘",
        desc = "把人气和经验再结算一份",
        quotaType = "none", quotaKey = "",
    },
    seasonCamp = {
        id = "seasonCamp", name = "休赛期特训营",
        desc = string.format("当前最强项的潜力上限 +%d", Config.AD_REWARDS.seasonCampStep),
        quotaType = "none", quotaKey = "",
    },
    welfare = {
        id = "welfare", name = "找队长多领一份",
        desc = "本周福利再领一份",
        quotaType = "daily", quotaKey = "welfare",
    },
    doubleReward = {
        id = "doubleReward", name = "再来一组",
        desc = "本次训练 / 比赛的收益翻倍结算",
        quotaType = "season", quotaKey = "doubleReward",
    },
    stamina = {
        id = "stamina", name = "体能师急救",
        desc = "赛前把体能拉满，手感不再打折",
        quotaType = "daily", quotaKey = "stamina",
    },
    press = {
        id = "press", name = "经纪人放料",
        desc = string.format("把这件事捅给媒体，人气 +%d", Config.AD_REWARDS.pressFame),
        quotaType = "daily", quotaKey = "press",
    },
    tactic = {
        id = "tactic", name = "秘密战术",
        desc = "解锁战术「巨星单打」，永久可用",
        quotaType = "none", quotaKey = "",
    },
    actionDouble = {
        id = "actionDouble", name = "私人教练加练",
        desc = string.format("本周训练收益 ×%.1f", Config.AD_REWARDS.actionDoubleMul),
        quotaType = "season", quotaKey = "actionDouble",
    },
    lottery = {
        id = "lottery", name = "刮一张彩票",
        desc = string.format("必中，奖金 %d~%d 万直接入账",
            Config.AD_REWARDS.lotteryMin, Config.AD_REWARDS.lotteryMax),
        quotaType = "daily", quotaKey = "lottery",
    },
    pickTeam = {
        id = "pickTeam", name = "定向转会",
        desc = "跳过随机报价，直接指定想去的球队",
        quotaType = "none", quotaKey = "",
    },
    boost = {
        id = "boost", name = "聘请体能师",
        desc = string.format("本赛季训练收益 +%d%%", math.floor((Config.AD_REWARDS.boostMultiplier - 1) * 100)),
        quotaType = "none", quotaKey = "",
    },
    talentReroll = {
        id = "talentReroll", name = "球探重拟报告",
        desc = string.format("重抽 6 张，保底 %d 张传奇", Config.TALENT.legendGuarantee),
        quotaType = "none", quotaKey = "",
    },
    talentAll = {
        id = "talentAll", name = "全部带走",
        desc = "六选三升级为六选六",
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

--- 滚动日期：新的一天重置全部日配额
---@param state CareerState
local function rollDay(state)
    local u = ensure(state)
    local key = dayKey(state)
    if u.day ~= key then
        u.day = key
        -- 逐个清零（新增日配额广告位时这里同步加一行）
        u.heal = 0
        u.lottery = 0
        u.stamina = 0
        u.press = 0
        u.welfare = 0
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
--- 无配额的广告位（quotaType == "none"）不依赖生涯数据
---@param state CareerState|nil
---@param placementId string
function Ads.consume(state, placementId)
    local p = Ads.PLACEMENTS[placementId]
    if not p or not state then return end
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
---@param state CareerState|nil
---@param placementId string
---@return number
function Ads.left(state, placementId)
    local p = Ads.PLACEMENTS[placementId]
    if not p then return 0 end
    if p.quotaType == "none" then
        return 999   -- 无限制（也不需要生涯数据）
    end
    if not state then return 0 end

    if p.quotaType == "daily" then
        return Ads.dailyLeft(state, p.quotaKey)
    elseif p.quotaType == "season" then
        return Ads.seasonLeft(state, p.quotaKey)
    end
    return 999
end

--- 生成按钮文案（含剩余次数）
---@param state CareerState|nil
---@param placementId string
---@return string
function Ads.buttonText(state, placementId)
    local p = Ads.PLACEMENTS[placementId]
    if not p then return "看广告" end

    if p.quotaType == "none" then
        return string.format("▶ 看广告 · %s", p.name)
    end
    if not state then
        return p.name
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
