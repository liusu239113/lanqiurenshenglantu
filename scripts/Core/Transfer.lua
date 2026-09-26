-- ============================================================================
-- Transfer — 转会市场
--
-- 玩法闭环：
--   原生路径 → 每赛季有 Config.TRANSFER.offersPerSeason 次免费「问价」，
--              经纪人随机带来几份报价（纯运气，档次随机）
--   广告路径 → 「定向转会」，看完直接指定想去的球队（确定性替代概率）
--
-- 球队档次不是摆设：会通过 Transfer.teamStrength 影响比赛里的球队强度（队友水平），
-- 并通过 Config.TRANSFER.tierSalaryMul 影响赛季年薪。
-- ============================================================================

local Config = require("Core.Config")
local Career = require("Core.Career")
local Teams = require("Data.Teams")

local Transfer = {}

-- 报价档次权重：按球员当前综合评分分档（不是硬编码在业务里，方便调参）
---@type table<string, table<number, number>>
local TIER_WEIGHT = {
    high = { [1] = 25, [2] = 45, [3] = 30 },   -- 已达豪门门槛
    mid  = { [1] = 45, [2] = 45, [3] = 10 },   -- 已达中游门槛
    low  = { [1] = 70, [2] = 30, [3] = 0 },    -- 新军水平
}

-- ---------------------------------------------------------------------------
-- 档次查询
-- ---------------------------------------------------------------------------

--- 取某档次的加盟门槛（综合评分）
---@param tier number
---@return number
function Transfer.requiredOverall(tier)
    if tier >= 3 then return Config.TRANSFER.tier3MinOverall end
    if tier == 2 then return Config.TRANSFER.tier2MinOverall end
    return 0
end

--- 档次显示名
---@param tier number
---@return string
function Transfer.tierName(tier)
    return Teams.TIER_NAMES[tier] or "新军"
end

--- 某档次的球队强度修正
---@param tier number
---@return number
function Transfer.tierBonus(tier)
    return Config.TRANSFER.tierBonus[tier] or 0
end

--- 某档次的年薪倍率
---@param tier number
---@return number
function Transfer.salaryMul(tier)
    return Config.TRANSFER.tierSalaryMul[tier] or 1.0
end

--- 当前球队强度（比赛用：舞台基础强度 + 档次修正）
---@param state CareerState
---@param stage StageDef
---@return number
function Transfer.teamStrength(state, stage)
    return stage.teamStrength + Transfer.tierBonus(state.teamTier or 1)
end

--- 某支球队的强度（用于转会页展示）
---@param stage StageDef
---@param tier number
---@return number
function Transfer.teamStrengthOf(stage, tier)
    return stage.teamStrength + Transfer.tierBonus(tier)
end

--- 球员当前是否够格加盟某档次
---@param state CareerState
---@param tier number
---@return boolean, string
function Transfer.canJoin(state, tier)
    local need = Transfer.requiredOverall(tier)
    local ov = Career.getOverall()
    if ov >= need then
        return true, ""
    end
    return false, string.format("需要综合评分 %d（当前 %d）", need, ov)
end

-- ---------------------------------------------------------------------------
-- 问价次数（懒重置：赛季变化即清零）
-- ---------------------------------------------------------------------------

--- 本赛季剩余问价次数
---@param state CareerState
---@return number
function Transfer.offersLeft(state)
    if state.transferSeason ~= state.season then
        return Config.TRANSFER.offersPerSeason
    end
    local left = Config.TRANSFER.offersPerSeason - (state.transferUsed or 0)
    if left < 0 then left = 0 end
    return left
end

--- 消耗一次问价次数
---@param state CareerState
function Transfer.consumeOffer(state)
    if state.transferSeason ~= state.season then
        state.transferSeason = state.season
        state.transferUsed = 0
    end
    state.transferUsed = (state.transferUsed or 0) + 1
end

-- ---------------------------------------------------------------------------
-- 报价
-- ---------------------------------------------------------------------------

--- 按当前评分选取档次权重
---@return table<number, number>
local function tierWeights()
    local ov = Career.getOverall()
    if ov >= Config.TRANSFER.tier3MinOverall then return TIER_WEIGHT.high end
    if ov >= Config.TRANSFER.tier2MinOverall then return TIER_WEIGHT.mid end
    return TIER_WEIGHT.low
end

--- 按权重掷一个档次
---@return number
local function rollTier()
    local w = tierWeights()
    local total = 0
    for tier = 1, 3 do
        total = total + (w[tier] or 0)
    end
    if total <= 0 then return 1 end

    local r = math.random() * total
    for tier = 1, 3 do
        r = r - (w[tier] or 0)
        if r < 0 then return tier end
    end
    return 1
end

--- 从某个档次里随机取一支不是当前球队的队
---@param stageId string
---@param tier number
---@param exclude table<string, boolean>
---@return string|nil
local function pickTeam(stageId, tier, exclude)
    local list = Teams.teamsInTier(stageId, tier)
    ---@type string[]
    local cands = {}
    for i = 1, #list do
        local name = list[i]
        if name and not exclude[name] then
            table.insert(cands, name)
        end
    end
    if #cands == 0 then return nil end
    return cands[math.random(1, #cands)]
end

--- 生成一份随机报价（原生「问价」用）
---@param state CareerState
---@param stage StageDef
---@param count number
---@return string[] 球队名列表
function Transfer.rollOffers(state, stage, count)
    ---@type string[]
    local offers = {}
    ---@type table<string, boolean>
    local used = {}
    if state.team then used[state.team] = true end

    local guard = 0
    while #offers < count and guard < 40 do
        guard = guard + 1
        local tier = rollTier()
        local name = pickTeam(stage.id, tier, used)
        if name then
            used[name] = true
            table.insert(offers, name)
        end
    end
    return offers
end

--- 检查一支球队能否加盟（供定向转会使用）
---@param state CareerState
---@param stage StageDef
---@param teamName string
---@return boolean, string
function Transfer.canSign(state, stage, teamName)
    if state.team == teamName then
        return false, "已在这支球队"
    end
    local tier = Teams.tierOf(stage.id, teamName)
    return Transfer.canJoin(state, tier)
end

--- 完成转会
---@param state CareerState
---@param stage StageDef
---@param teamName string
---@param reason string 转会理由（写进大事记的叙事包装）
---@return string 提示文案
function Transfer.accept(state, stage, teamName, reason)
    local oldTeam = state.team
    local tier = Teams.tierOf(stage.id, teamName)

    state.team = teamName
    state.teamTier = tier
    -- 换队后需要重新适应，士气有小幅波动
    Career.addMorale(-4)

    local text = string.format("从【%s】转会至【%s】（%s）",
        oldTeam or "自由身", teamName, Transfer.tierName(tier))
    if reason and reason ~= "" then
        text = text .. "，" .. reason
    end
    Career.addLog(text)
    print(string.format("[Transfer] %s | 档次 %d | 球队强度 %d",
        text, tier, Transfer.teamStrengthOf(stage, tier)))
    return string.format("已加盟【%s】，球队强度 %d", teamName, Transfer.teamStrengthOf(stage, tier))
end

return Transfer
