-- ============================================================================
-- Injury — 伤病系统
-- 比赛后按体能/年龄/伤病风险掷骰；伤病期间无法出战
-- 「立即痊愈」广告位依赖此系统
-- ============================================================================

local Config = require("Core.Config")

local Injury = {}

-- 基础受伤概率
local BASE_CHANCE = 0.06
-- 年龄加成（30 岁后每岁 +0.004）
local AGE_BONUS = 0.004
-- 体能低于此值时风险翻倍
local LOW_STAMINA = 40

-- 伤病名称池（按严重程度）
---@type table<string, string[]>
local INJURY_NAMES = {
    light = { "脚踝轻度扭伤", "手指挫伤", "膝盖酸痛", "腰背拉伤" },
    mid   = { "大腿肌肉拉伤", "脚踝二级扭伤", "肩部撞击伤" },
    heavy = { "膝盖韧带损伤", "脚部骨折", "跟腱炎" },
}

--- 重新计算伤病风险（0-100）
-- 此前 injuryRisk 恒为 30，伤病完全是运气；现在它由体能属性、年龄、疲劳累积共同决定，
-- 玩家可以通过拉体能、休息、控制连续出战来主动管理它。
---@param state CareerState
---@return number
function Injury.recomputeRisk(state)
    if not state then return 30 end

    -- 体能属性越高越抗伤（55 为基准线）；含徽章被动加成
    local athletic = (require("Core.Career").matchAttrs().athletic) or 50
    local base = 40 - (athletic - 55) * 0.35

    -- 年龄增长
    if state.age >= 30 then
        base = base + (state.age - 30) * 1.2
    end

    -- 疲劳：体能越低风险越高（体能满时不额外加，空时 +25）
    local stamina = state.stamina or 100
    base = base + (1 - stamina / 100) * 25

    -- 连续出战累积（每周恢复；打比赛时 +8）
    base = base + (state.fatigueStreak or 0) * 2.5

    -- 徽章被动：铁人体质降低风险
    local ok, Badges = pcall(require, "Data.Badges")
    if ok and Badges then
        base = base - Badges.bonusOf(state, "athletic") * 1.5
    end

    if base < 5 then base = 5 end
    if base > 95 then base = 95 end
    state.injuryRisk = math.floor(base + 0.5)
    return state.injuryRisk
end

--- 判定一次伤病
--- 在比赛结束后调用
---@param state CareerState
---@param playedHard boolean 是否全力出战（操作模式 = true）
---@return table|nil { name, days, severity }
function Injury.roll(state, playedHard)
    -- 动态伤病风险（每次判定前重算，让体能/年龄/疲劳实时生效）
    local risk = Injury.recomputeRisk(state)

    local chance = BASE_CHANCE
    chance = chance + (state.age >= 30 and (state.age - 30) * AGE_BONUS or 0)
    chance = chance + (risk / 100) * 0.06
    if state.stamina < LOW_STAMINA then
        chance = chance * 2.0
    end
    if playedHard then
        chance = chance * 1.15
    end

    if math.random() > chance then
        return nil
    end

    -- 严重程度
    local roll = math.random()
    ---@type string
    local severity
    ---@type number
    local days
    if roll < 0.62 then
        severity = "light"
        days = math.random(1, 4)
    elseif roll < 0.92 then
        severity = "mid"
        days = math.random(5, 14)
    else
        severity = "heavy"
        days = math.random(15, 40)
    end

    local pool = INJURY_NAMES[severity]
    local name = pool[math.random(1, #pool)]

    return { name = name, days = days, severity = severity }
end

--- 应用伤病到状态
---@param state CareerState
---@param inj table
function Injury.apply(state, inj)
    state.injuryDays = (state.injuryDays or 0) + inj.days
    state.injuryName = inj.name
    -- 受伤降低士气
    state.morale = math.max(0, state.morale - (inj.severity == "heavy" and 12 or 6))
    -- 累计伤病次数（「浴火重生」徽章线）
    state.injuryCount = (state.injuryCount or 0) + 1
    print(string.format("[Injury] %s，伤停 %d 天", inj.name, inj.days))
end

--- 是否处于伤病中
---@param state CareerState
---@return boolean
function Injury.isInjured(state)
    return (state.injuryDays or 0) > 0
end

--- 推进一周，扣减伤病天数
---@param state CareerState
---@return string|nil 痊愈提示
function Injury.advanceWeek(state)
    if (state.injuryDays or 0) <= 0 then
        return nil
    end
    state.injuryDays = state.injuryDays - 7
    if state.injuryDays <= 0 then
        state.injuryDays = 0
        local name = state.injuryName or "伤病"
        state.injuryName = nil
        state.morale = math.min(100, state.morale + 8)
        print("[Injury] " .. name .. " 已痊愈")
        return string.format("%s 已经痊愈，可以复出了。", name)
    end
    return nil
end

--- 立即痊愈（广告奖励）
---@param state CareerState
---@return string 提示文案
function Injury.healAll(state)
    local days = state.injuryDays or 0
    local name = state.injuryName or "伤病"
    state.injuryDays = 0
    state.injuryName = nil
    state.morale = math.min(100, state.morale + 10)
    print("[Injury] 广告痊愈，清除 " .. tostring(days) .. " 天伤停")
    if days > 0 then
        return string.format("%s 已痊愈，免去 %d 天伤停。", name, days)
    end
    return "你没有任何伤病，身体状态良好。"
end

--- 伤停显示文案
---@param state CareerState
---@return string
function Injury.statusText(state)
    local days = state.injuryDays or 0
    if days <= 0 then return "健康" end
    return string.format("%s（%d 天）", state.injuryName or "伤病", days)
end

return Injury
