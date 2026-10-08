-- ============================================================================
-- Ads — 激励视频广告系统（唯一入口）
--
-- ── 铁律 ───────────────────────────────────────────────────────────────────
--   ① **只有 result.success == true 才发奖**。SDK 返回 true 只代表「请求被受理」，
--      不代表看完 —— 两者混淆＝全站白嫖。
--   ② **同一个时间只允许一条广告流程**（单飞）；进行中再次调用只提示、不重复拉起。
--   ③ **失败绝不发奖，也绝不静默**：任何一条失败出口都必须给出玩家可读的提示。
--   ④ **配额只在成功发奖时消耗**；奖励发不出去时用 Ads.refund 退还（见该函数注释）。
--   ⑤ 广告位一律长在具体功能里，不做「广告聚合面板」——那会让玩家觉得在玩广告模拟器。
--
-- ── 单次观看的完整生命周期 ────────────────────────────────────────────────
--   Ads.show(placement, onReward, onFail)
--     ├─ 成功 → onReward()（调用方在这里发奖 + consume 配额）
--     └─ 失败 → onFail(中文文案, 原因码)
--
--   ⚠️ 2026-09-29：**TapDB 埋点已移除**（真机点广告闪退排查）。
--     原因：点广告时 `sdk:LogEvent` 与 `sdk:ShowRewardVideoAd` 在同一调用栈里
--     背靠背触发，而崩溃发生在广告回调之前 —— 埋点是首要嫌疑，先摘掉。
--     placement 参数保留：失败文案与日志归因仍靠它，与埋点无关。
--
-- ── 看门狗 ─────────────────────────────────────────────────────────────────
--   宿主回调可能永远不来（原生回调丢失 / 玩家在广告中切后台 / 网络挂起）。
--   90 秒硬上限（WATCHDOG_SECONDS）：超时即复位单飞并告知可重试，绝不把玩家锁死。
--
-- ── 配额语义 ───────────────────────────────────────────────────────────────
--   日配额按游戏内日期滚动；赛季配额懒重置（读到非当前赛季即清零，无时序风险）。
--   配额的唯一用途是**制造稀缺**：广告是捷径不是主路，总量必须受控，
--   否则「看广告推平一个赛季」会同时毁掉成长感和长期留存。
-- ============================================================================

local Config = require("Core.Config")

local Ads = {}

-- ---------------------------------------------------------------------------
-- 失败原因 → 玩家可读文案
--
-- 宿主回的是工程串：玩家中途关掉广告拿到的是 "embed manual close"，
-- 非宿主环境拿到的是 "unsupported platform"。直接透传等于把英文报错怼到玩家脸上——
-- 既看不懂，也不知道下一步该干什么，复看意愿就是这么丢的。
--
-- 最关键的一条是 manual_close：把「你没拿到」翻译成「再看完一次就能拿到」，
-- 把流失点变回复看引导。
-- ---------------------------------------------------------------------------

---@type table<string, string>
Ads.FAIL_TEXT = {
    manual_close = "视频没有完整播完，本次未获得奖励；完整看完即可领取",
    unsupported  = "当前环境暂不支持广告，请在 TapTap App 内打开游戏",
    timeout      = "广告响应超时，请稍后重试",
    rejected     = "广告请求未被受理，请稍等几秒后再试",
    error        = "广告加载失败，请稍后再试",
}

--- 把宿主返回的原始 msg 归类成稳定的原因码（供埋点分布与文案查表共用）
---@param msg string|nil
---@return string
function Ads.classifyFail(msg)
    local m = string.lower(tostring(msg or ""))
    if string.find(m, "manual close", 1, true) then return "manual_close" end
    if string.find(m, "unsupported", 1, true) then return "unsupported" end
    if string.find(m, "timeout", 1, true) or string.find(m, "超时", 1, true) then return "timeout" end
    if string.find(m, "未受理", 1, true) then return "rejected" end
    return "error"
end

--- 取原因码对应的玩家可读文案
---@param reason string|nil
---@return string
function Ads.failText(reason)
    return Ads.FAIL_TEXT[reason or ""] or Ads.FAIL_TEXT.error
end

-- ---------------------------------------------------------------------------
-- 配额定义（数值来自 Config.AD_REWARDS，方便后期调参）
-- ---------------------------------------------------------------------------

--- 日配额上限
Ads.DAILY_LIMIT = {
    heal = Config.AD_REWARDS.healDaily,
    stamina = Config.AD_REWARDS.staminaDaily,
}

--- 需要【现实日期】滚动的广告位上限
---
--- 与 DAILY_LIMIT（按游戏内 赛季-周-年龄 滚动）不同：跳过比赛的免费额度是
--- 「每天 5 场」，必须以真实世界的一天为界 —— 玩家一天内推进好几个游戏周，
--- 若用游戏内周次计数，额度会在几分钟内被刷光，免费额度形同虚设。
--- 见 Ads.realDayLeft / Ads.addQuota。
Ads.REAL_DAY_LIMIT = {
    skipMatch = Config.SKIP_MATCH.freePerDay,
}

--- 赛季配额上限
Ads.SEASON_LIMIT = {
    attrPoints = Config.AD_REWARDS.attrPointsSeason,
    focus = Config.AD_REWARDS.focusSeason,
    pickTeam = Config.AD_REWARDS.pickTeamSeason,
    welfare = Config.AD_REWARDS.welfareSeason,
    boost = Config.AD_REWARDS.boostSeason,
    doubleReward = Config.AD_REWARDS.doubleRewardSeason,
    review = Config.AD_REWARDS.reviewSeason,
    press = Config.AD_REWARDS.pressSeason,
    lottery = Config.AD_REWARDS.lotterySeason,
    actionDouble = Config.AD_REWARDS.actionDoubleSeason,
    seasonCamp = Config.AD_REWARDS.seasonCampSeason,
    tactic = Config.AD_REWARDS.tacticSeason,
    retry = Config.AD_REWARDS.retrySeason,
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
        desc = "伤停清零 · 下一场立刻能打（原生路径要等满伤停天数）",
        quotaType = "daily", quotaKey = "heal",
    },
    stamina = {
        id = "stamina", name = "体能师急救",
        desc = "体能直接拉满 100 · 本场出手窗口不再缩水（体能越低越值得点）",
        quotaType = "daily", quotaKey = "stamina",
    },
    focus = {
        id = "focus", name = "全神贯注",
        desc = string.format("接下来 %d 次训练必定拿满档收益（无视士气、伤病、年龄带来的折扣）",
            Config.AD_REWARDS.focusCharges),
        quotaType = "season", quotaKey = "focus",
    },
    attrPoints = {
        id = "attrPoints", name = "特训名额",
        desc = string.format("立刻到账 %d 点自由属性点，随便加到哪一项",
            Config.AD_REWARDS.attrPoints),
        quotaType = "season", quotaKey = "attrPoints",
    },
    pickTeam = {
        id = "pickTeam", name = "定向转会",
        desc = "跳过随机报价，直接指定想去的球队",
        quotaType = "season", quotaKey = "pickTeam",
    },
    chosen = {
        id = "chosen", name = "解锁天选之星", desc = "解锁高风险高回报出身",
        quotaType = "none", quotaKey = "chosen",
    },
    talentReroll = {
        id = "talentReroll", name = "重拟球探报告", desc = "重抽 6 张卡，保底 2 张传奇",
        quotaType = "none", quotaKey = "talentReroll",
    },
    talentAll = {
        id = "talentAll", name = "全部带走", desc = "带走这轮抽到的全部 6 张卡",
        quotaType = "none", quotaKey = "talentAll",
    },
    welfare = {
        id = "welfare", name = "本周球队补给", desc = string.format("完整观看后领取经验 +%d、士气 +%d",
            Config.ECONOMY.welfareExp, Config.ECONOMY.welfareMorale),
        quotaType = "season", quotaKey = "welfare",
    },
    boost = {
        id = "boost", name = "体能师快速恢复", desc = string.format("体能立刻 +%d · 本季可反复用",
            Config.AD_REWARDS.boostStamina),
        quotaType = "season", quotaKey = "boost",
    },
    doubleReward = {
        id = "doubleReward", name = "再来一组",
        desc = "本次训练奖励原样再领一次（等于白多练一组，不消耗体能）",
        quotaType = "season", quotaKey = "doubleReward",
    },
    review = {
        id = "review", name = "教练复盘", desc = string.format("赛后额外 +%d 经验",
            Config.AD_REWARDS.reviewExp),
        quotaType = "season", quotaKey = "review",
    },
    press = {
        id = "press", name = "经纪人放料", desc = string.format("人气 +%d · 直接推高代言档位",
            Config.AD_REWARDS.pressFame),
        quotaType = "season", quotaKey = "press",
    },
    lottery = {
        id = "lottery", name = "商业推广", desc = string.format("收入 +%d 万，无随机不落空",
            Config.AD_REWARDS.lotteryMoney),
        quotaType = "season", quotaKey = "lottery",
    },
    actionDouble = {
        id = "actionDouble", name = "私人教练加练", desc = "下次周训练属性与经验收益翻倍（不额外耗体能）",
        quotaType = "season", quotaKey = "actionDouble",
    },
    seasonCamp = {
        id = "seasonCamp", name = "休赛期特训营",
        desc = string.format("最强项潜力上限 +%d · 唯一能突破 99 的途径",
            Config.AD_REWARDS.seasonCampStep),
        quotaType = "season", quotaKey = "seasonCamp",
    },
    tactic = {
        id = "tactic", name = "解锁巨星单打", desc = "永久解锁特殊进攻战术（之后每场都能用）",
        quotaType = "season", quotaKey = "tactic",
    },
    -- 失利重赛：终场哨响、输球的那一刻才出现。位置选在玩家情绪最强的地方，
    -- 但次数必须严控 —— 这是唯一一个能直接改写比赛结果的点位。
    retry = {
        id = "retry", name = "不甘心，重打本场",
        desc = "本场结果作废，重新跳球再打一遍（对手与赛程不变）",
        quotaType = "season", quotaKey = "retry",
    },
    -- 关键球保险：比赛内每一次出手/突破/防守前都能看到，但**每场只能用一次**。
    -- 配额不走赛季表（per-match 由 ScreenMatch 自己的 adForceUsed 把守），
    -- 所以 quotaType = "none" —— 它买的是「这一回合」，不是「这一赛季」。
    matchForce = {
        id = "matchForce", name = "关键球保险", desc = "接下来这一次出手 / 突破 / 防守必定成功",
        quotaType = "none", quotaKey = "matchForce",
    },
    -- 跳过比赛：每天免费 5 场，用完后看一次广告 +15 场（当天有效）。
    -- quotaType = "realday" —— 免费额度按【现实日期】滚动，见 Ads.REAL_DAY_LIMIT。
    -- 广告看完后不是把次数「补满」，而是直接追加 adBonus 次，所以连看两次能叠到 30 场。
    skipMatch = {
        id = "skipMatch", name = "快速模拟",
        desc = string.format("跳过本场比赛，直接按球队实力推演出结果与战报（看完追加 %d 次）",
            Config.SKIP_MATCH.adBonus),
        quotaType = "realday", quotaKey = "skipMatch",
    },
}

-- ---------------------------------------------------------------------------
-- 首次转化加码
--
-- 广告转化率低的核心原因是「第一次点不知道值不值」。这里给每个点位配一份
-- 首次额外奖励：首次观看除了正常收益，再白送一笔确定的资源。
-- 首次奖励只在生涯内第一次观看该点位时触发，之后消失（不破坏长期平衡）。
-- ---------------------------------------------------------------------------

-- 前向声明：ensure 定义在本节之后，但首次转化逻辑要用到它。
-- Lua 的 local function 必须先声明后使用，否则运行时这里会取到 nil。
---@type fun(state: CareerState): table
local ensure

---@class AdFirstBonus
---@field text string            首次奖励说明（按钮角标与 Toast 共用）
---@field fame number|nil
---@field morale number|nil
---@field money number|nil
---@field exp number|nil
---@field attrPoints number|nil

---@type table<string, AdFirstBonus>
Ads.FIRST_BONUS = {
    heal        = { text = "首次额外 +8 士气",        morale = 8 },
    stamina     = { text = "首次额外 +50 经验",       exp = 50 },
    welfare     = { text = "首份额外 +60 经验",       exp = 60 },
    boost       = { text = "首次额外 +40 经验",       exp = 40 },
    focus       = { text = "首次额外 +60 经验",       exp = 60 },
    -- 首份奖励 ≈ 再送一次单次收益：基础涨到 +3 后若只给 +1，首点反而弱于第二次点击，白丢首转化
    attrPoints  = { text = "首份额外 +3 属性点",      attrPoints = 3 },
    doubleReward= { text = "首次额外 +50 经验",       exp = 50 },
    review      = { text = "首次额外 +60 经验",       exp = 60 },
    press       = { text = "首份额外 +80 人气",       fame = 80 },
    lottery     = { text = "首份额外 +30 万收入",     money = 30 },
    actionDouble= { text = "首次额外 +50 经验",       exp = 50 },
    seasonCamp  = { text = "首次额外 +100 经验",      exp = 100 },
    tactic      = { text = "首次额外 +60 经验",       exp = 60 },
    pickTeam    = { text = "首次额外 +60 人气",       fame = 60 },
}

--- 该点位是否还没被使用过（首次转化机会）
---@param state CareerState|nil
---@param placementId string
---@return boolean
function Ads.isFirstUse(state, placementId)
    if not state then return false end
    if not Ads.FIRST_BONUS[placementId] then return false end
    local u = ensure(state)
    return (u.firstUse == nil) or (u.firstUse[placementId] ~= true)
end

--- 取首次奖励的自定义文案（没有则返回 nil）
---@param state CareerState|nil
---@param placementId string
---@return string|nil
function Ads.firstBonusText(state, placementId)
    if not Ads.isFirstUse(state, placementId) then return nil end
    local b = Ads.FIRST_BONUS[placementId]
    return b and b.text or nil
end

--- 结算首次奖励：返回发放的提示文案（无首次奖励时返回 nil）
--- 必须在 Ads.consume 之前调用（consume 会写入 firstUse 标记）
---@param state CareerState|nil
---@param placementId string
---@return string|nil
function Ads.grantFirstBonus(state, placementId)
    if not Ads.isFirstUse(state, placementId) then return nil end
    local b = Ads.FIRST_BONUS[placementId]
    if not b then return nil end

    local Career = require("Core.Career")
    local parts = {}
    if b.exp and b.exp > 0 then
        Career.addExp(b.exp)
        table.insert(parts, string.format("经验 +%d", b.exp))
    end
    if b.fame and b.fame > 0 then
        Career.addFame(b.fame)
        table.insert(parts, string.format("人气 +%d", b.fame))
    end
    if b.money and b.money > 0 then
        Career.addMoney(b.money)
        table.insert(parts, string.format("收入 +%d 万", b.money))
    end
    if b.morale and b.morale > 0 then
        Career.addMorale(b.morale)
        table.insert(parts, string.format("士气 +%d", b.morale))
    end
    if b.attrPoints and b.attrPoints > 0 then
        Career.addAttrPoints(b.attrPoints)
        table.insert(parts, string.format("属性点 +%d", b.attrPoints))
    end

    if #parts == 0 then return nil end
    print(string.format("[Ads] 首次转化奖励 %s：%s", placementId, table.concat(parts, " ")))
    return "首次观看额外奖励 " .. table.concat(parts, " · ")
end

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
function ensure(state)
    local s = state
    if s.adUsage == nil then
        ---@type table
        s.adUsage = { day = "" }
    end
    if s.adUsage.firstUse == nil then
        s.adUsage.firstUse = {}
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
        u.stamina = 0
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

-- ---------------------------------------------------------------------------
-- 现实日期配额（跳过比赛用）
--
-- 与游戏内日期配额（dailyLeft）的区别：这里以**真实世界的一天**为界。
-- 判定用「当前剩余 + 距上次重置经过的天数 × 每日免费额度」递增补发，
-- 而不是「换天即清零」—— 后者会把「昨天看广告攒的 20 次」直接抹掉，
-- 玩家会觉得广告白看了。递增补发意味着没花掉的次数最多攒到上限。
--
-- 日期取 os.date("*t")（设备本地时间）。这是单机游戏，玩家改系统时间刷次数
-- 只影响自己的体验，不涉及公平性；如需防作弊可换 common.get_server_time()。
-- ---------------------------------------------------------------------------

--- 本地日期序号（自 1970-01-01 起的天数，取整）
--- 用 os.time 直接除，避免依赖 os.date 的字段拼接。
---@return integer
local function realDayIndex()
    local t = os.time()
    if not t then return 0 end
    return math.floor(t / 86400)
end

--- 现实日期配额剩余（懒重置：按经过的天数补发每日免费额度）
---@param state CareerState
---@param key string
---@return number
function Ads.realDayLeft(state, key)
    local u = ensure(state)
    local cap = Ads.REAL_DAY_LIMIT[key] or 0
    local idxKey = key .. "DayIdx"
    local leftKey = key .. "Left"
    local today = realDayIndex()

    -- 首次使用：直接给满
    if u[idxKey] == nil then
        u[idxKey] = today
        u[leftKey] = cap
    end

    local last = u[idxKey] or today
    if today > last then
        -- 每经过一天补发一次每日额度，但总量不超过上限
        local gained = (today - last) * cap
        u[leftKey] = math.min(cap, (u[leftKey] or 0) + gained)
        u[idxKey] = today
    end

    local left = u[leftKey] or 0
    if left < 0 then left = 0 end
    return left
end

--- 追加现实日期配额（看完广告时调用）
---@param state CareerState|nil
---@param key string
---@param n number
function Ads.addQuota(state, key, n)
    if not state or n <= 0 then return end
    local u = ensure(state)
    -- 先触发懒重置，确保 leftKey 已初始化
    Ads.realDayLeft(state, key)
    local leftKey = key .. "Left"
    u[leftKey] = (u[leftKey] or 0) + n
    print(string.format("[Ads] 追加现实日配额 %s +%d（剩余 %d）", key, n, u[leftKey]))
end

--- 消耗一次配额（只在成功回调里调用）
--- 无配额的广告位（quotaType == "none"）不依赖生涯数据
---@param state CareerState|nil
---@param placementId string
function Ads.consume(state, placementId)
    local p = Ads.PLACEMENTS[placementId]
    if not p or not state then return end
    local u = ensure(state)

    -- 记录「已不是首次」（首次奖励由 Ads.grantFirstBonus 在 consume 之前发放）
    u.firstUse[placementId] = true

    if p.quotaType == "daily" then
        rollDay(state)
        u[p.quotaKey] = (u[p.quotaKey] or 0) + 1
    elseif p.quotaType == "season" then
        -- 先触发懒重置，再累加
        Ads.seasonLeft(state, p.quotaKey)
        u[p.quotaKey] = (u[p.quotaKey] or 0) + 1
    elseif p.quotaType == "realday" then
        -- 现实日期配额：消耗 = 剩余减一（不看 adUsage 里的绝对计数）
        Ads.realDayLeft(state, p.quotaKey)
        local leftKey = p.quotaKey .. "Left"
        u[leftKey] = math.max(0, (u[leftKey] or 0) - 1)
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
    elseif p.quotaType == "realday" then
        return Ads.realDayLeft(state, p.quotaKey)
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
        local scope = "本季"
        if p.quotaType == "daily" then scope = "今日"
        elseif p.quotaType == "realday" then scope = "今日" end
        return string.format("%s（%s已用完）", p.name, scope)
    end
    if p.quotaType == "daily" or p.quotaType == "realday" then
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
        f({ success = false, reason = "timeout" })
    end
end

--- 播放激励视频
--- 成功才调用 onReward；失败/超时/未受理调用 onFail（可选）
---@param placement string 广告点位 id（用于日志归因，必填）
---@param onReward fun()
---@param onFail fun(msg: string, reason: string)|nil reason 见 Ads.FAIL_TEXT 的键
function Ads.show(placement, onReward, onFail)
    -- 单飞保护
    if inFlight_ then
        if onFail then onFail(Ads.failText("rejected"), "rejected") end
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
            print(string.format("[Ads] %s 完整观看，发放奖励（用时 %d 秒）",
                tostring(placement), math.floor(watchdogElapsed_)))
            onReward()
            return
        end

        -- 失败：先把宿主工程串归类成稳定原因码，再据此决定玩家文案
        local reason = (result and result.reason) or Ads.classifyFail(result and result.msg)
        print(string.format("[Ads] %s 未完成（%s · 原始: %s）",
            tostring(placement), reason, tostring(result and result.msg or "")))
        if onFail then onFail(Ads.failText(reason), reason) end
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
        finish({ success = false, reason = "error" })
        return
    end

    -- 未受理且回调未同步触发 → 立即失败
    -- 返回 false 的常见来源：3 秒防抖、冷却未结束、已有广告请求进行中、宿主不可用
    if accepted == false and not callbackFired then
        finish({ success = false, reason = "rejected" })
    end
end

--- 退还一次配额（发奖失败时显式调用）
---
--- 广告看完了、奖励却发不出去（运行时的前置条件不满足）时，次数必须还回去。
--- 「看了广告还被扣次数」是这个点位复看意愿的直接杀手。
---
--- 注意：只回滚配额计数，不回滚 firstUse 标记——首次奖励在 consume 之前就已实发，
--- 回滚标记会让玩家重复领取首份加码。
---@param state CareerState|nil
---@param placementId string
function Ads.refund(state, placementId)
    local p = Ads.PLACEMENTS[placementId]
    if not p or not state then return end
    if p.quotaType == "none" then return end

    local u = ensure(state)
    if p.quotaType == "realday" then
        -- 现实日期配额的计数器在 "<key>Left"，与 daily/season 的绝对计数不同
        Ads.realDayLeft(state, p.quotaKey)
        local leftKey = p.quotaKey .. "Left"
        u[leftKey] = (u[leftKey] or 0) + 1
    else
        u[p.quotaKey] = math.max(0, (u[p.quotaKey] or 0) - 1)
    end
    print(string.format("[Ads] 退还配额 %s.%s（剩余 %d）",
        placementId, p.quotaKey, Ads.left(state, placementId)))
end

--- 是否正在播放广告
---@return boolean
function Ads.isBusy()
    return inFlight_
end

return Ads
