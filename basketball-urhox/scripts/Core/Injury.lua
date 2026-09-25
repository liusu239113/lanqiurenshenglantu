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

--- 判定一次伤病
--- 在比赛结束后调用
---@param state CareerState
---@param playedHard boolean 是否全力出战（操作模式 = true）
---@return table|nil { name, days, severity }
function Injury.roll(state, playedHard)
    -- 伤病风险属性（0-100，越高越容易受伤）
    local risk = state.injuryRisk or 30

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
