-- ============================================================================
-- Teams — 球队与出身地数据（原创虚构设定）
-- ============================================================================

local Teams = {}

-- 可选出身地（影响球队命名）
---@type string[]
Teams.HOMETOWNS = {
    "临江", "海州", "北岭", "南屿", "西塘", "云港", "青川", "铁岭",
}

-- 职业阶段球队名（原创虚构队名，按档次划分）
---@type string[][]
Teams.PRO_TEAMS = {
    -- tier 1：重建中的队伍
    { "临江新航线", "海州潮汐", "北岭矿工", "南屿灯塔" },
    -- tier 2：季后赛常客
    { "云港飞隼", "青川巨浪", "西塘铁匠", "铁岭狼烟" },
    -- tier 3：争冠豪门
    { "海州王冠", "临江龙焰", "云港极光", "青川风暴" },
}

-- 各生涯阶段的三档球队池（转会市场用；同样按 tier1/tier2/tier3 划分）
---@type table<string, string[][]>
Teams.STAGE_TEAMS = {
    street = {
        { "临江野火", "海州巷战", "北岭铁砧" },
        { "南屿浪人", "西塘老街", "云港夜行" },
        { "青川街头王", "铁岭狼牙", "临江午夜" },
    },
    high = {
        { "临江二中", "海州育英", "北岭附中" },
        { "南屿育才", "西塘二中", "云港中学" },
        { "青川高中", "铁岭体校", "海州实验" },
    },
    ncaa = {
        { "临江理工大学", "海州师范学院", "北岭农学院" },
        { "南屿海洋大学", "西塘工程学院", "云港科技大学" },
        { "青川大学", "铁岭体育大学", "海州交通大学" },
    },
    pro = Teams.PRO_TEAMS,
    legend = Teams.PRO_TEAMS,
}

-- 档次显示名
---@type table<number, string>
Teams.TIER_NAMES = {
    [1] = "新军",
    [2] = "中游",
    [3] = "豪门",
}

--- 取某个阶段的三档球队池
---@param stageId string
---@return string[][]
function Teams.getStageTeams(stageId)
    local pool = Teams.STAGE_TEAMS[stageId]
    if pool then return pool end
    return Teams.STAGE_TEAMS.pro or Teams.PRO_TEAMS
end

--- 取某支球队所属档次（找不到返回 1）
---@param stageId string
---@param teamName string
---@return number
function Teams.tierOf(stageId, teamName)
    local pool = Teams.getStageTeams(stageId)
    for tier = 1, #pool do
        local list = pool[tier]
        for i = 1, #list do
            if list[i] == teamName then return tier end
        end
    end
    return 1
end

--- 取某档次的球队列表
---@param stageId string
---@param tier number
---@return string[]
function Teams.teamsInTier(stageId, tier)
    local pool = Teams.getStageTeams(stageId)
    local list = pool[tier]
    if list then return list end
    return pool[1] or {}
end

-- 对手队名池（用于比赛）
---@type string[]
local OPPONENT_POOL = {
    "临江新航线", "海州潮汐", "北岭矿工", "南屿灯塔",
    "云港飞隼", "青川巨浪", "西塘铁匠", "铁岭狼烟",
    "海州王冠", "临江龙焰", "云港极光", "青川风暴",
}

-- 高中/大学阶段对手名
---@type string[]
local SCHOOL_POOL = {
    "临江一中", "海州实验", "北岭附中", "南屿育才",
    "西塘二中", "云港中学", "青川高中", "铁岭体校",
}

--- 生成球队名（按阶段 + 档次从球队池里取）
--- 用出身地做确定性索引，保证同一球员的初始球队稳定
---@param stageId string 阶段 id，例如 "high"
---@param hometown string 出身地
---@param tier number|nil 档次 1-3，nil 视为 1
---@param prefix string|nil 兜底前缀，球队池为空时使用
---@return string
function Teams.makeTeamName(stageId, hometown, tier, prefix)
    ---@type number
    local idx = 1
    for i = 1, #Teams.HOMETOWNS do
        if Teams.HOMETOWNS[i] == hometown then
            idx = i
            break
        end
    end

    local list = Teams.teamsInTier(stageId, tier or 1)
    if #list > 0 then
        local name = list[((idx - 1) % #list) + 1]
        if name then return name end
    end
    return hometown .. (prefix or "联队")
end

--- 随机对手队名
---@param stageId string|nil 当前阶段 id
---@return string
function Teams.randomOpponent(stageId)
    local pool = OPPONENT_POOL
    if stageId == "street" or stageId == "high" or stageId == "ncaa" then
        pool = SCHOOL_POOL
    end
    local name = pool[math.random(1, #pool)]
    if name == nil then
        return "对手队"
    end
    return name
end

return Teams
