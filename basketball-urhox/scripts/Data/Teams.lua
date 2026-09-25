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

--- 生成球队名
---@param prefix string 阶段前缀，例如「高中校队」
---@param hometown string 出身地
---@param tier number|nil 档次（仅职业阶段使用）
---@return string
function Teams.makeTeamName(prefix, hometown, tier)
    if tier ~= nil then
        local pool = Teams.PRO_TEAMS[tier]
        if pool ~= nil then
            -- 用出身地做确定性索引，保证同一球员球队稳定
            local idx = 1
            for i = 1, #Teams.HOMETOWNS do
                if Teams.HOMETOWNS[i] == hometown then
                    idx = i
                    break
                end
            end
            local name = pool[((idx - 1) % #pool) + 1]
            if name ~= nil then
                return name
            end
        end
    end
    return hometown .. prefix
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
