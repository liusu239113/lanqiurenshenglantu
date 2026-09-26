-- ============================================================================
-- Career — 生涯状态与推进逻辑
-- 《篮途》核心数据层：球员属性、周循环、赛季推进、荣誉记录、存档
-- ============================================================================

local Config = require("Core.Config")
local Teams = require("Data.Teams")

local Career = {}

-- ============================================================================
-- 生涯状态定义
-- ============================================================================

---@class CareerState
---@field name string
---@field positionId string
---@field hometown string
---@field age number
---@field stageIndex number
---@field season number
---@field week number
---@field attrs table<string, number>
---@field stamina number
---@field morale number
---@field fame number
---@field money number
---@field salary number
---@field team string
---@field honors string[]
---@field games number
---@field totalPoints number
---@field seasonPoints number
---@field seasonGames number
---@field mvps number
---@field allStars number
---@field titles number
---@field log string[]
---@field lastResult table|nil
---@field pendingEvent table|nil
---@field seenEvents table<string, boolean>
---@field catCooldown table<string, number>
---@field retired boolean
---@field tacticId string|nil   训练馆布置的进攻战术
---@field defenseId string|nil  训练馆布置的防守策略
--- 扩展系统字段
---@field injuryDays number       剩余伤停天数
---@field injuryName string|nil   伤病名称
---@field injuryRisk number       伤病风险 0-100
---@field expPool number          经验池（可兑换属性点）
---@field skillPoints number      技能点
---@field potential table<string, number> 各项能力上限（默认 99）
---@field talents string[]        已获得的天赋
---@field endorsements table[]    代言合约 { name, pay, seasons }
---@field adUsage table          广告配额记录
---@field matchMode string       "live"（操作比赛）| "text"（文字直播）
---@field boostActive boolean    训练经验加成是否生效
---@field originId string         星途出身 id
---@field attrPoints number       自由属性点（广告/经验兑换获得）
---@field talentCards string[]    建角时选中的天赋卡 id
---@field tactics string[]        已解锁的广告战术 id
---@field welfareDay string        球队福利所属的"今天"（懒重置用）
---@field welfareClaims number     今天已免费领过几份
---@field teamTier number         当前球队档次 1-3（影响球队强度与年薪）
---@field transferSeason number   转会问价次数所属赛季（懒重置用）
---@field transferUsed number     本赛季已用掉的问价次数
---@field transferOffers string[] 经纪人当前带来的报价（沿用上一次问价结果）

---@type CareerState|nil
Career.state = nil

-- ============================================================================
-- 工具函数
-- ============================================================================

--- 限定数值范围
---@param v number
---@param lo number
---@param hi number
---@return number
local function clamp(v, lo, hi)
    if v < lo then return lo end
    if v > hi then return hi end
    return v
end

--- 按年龄取成长系数
---@param age number
---@return number
local function growthMul(age)
    for i = 1, #Config.GROWTH_BY_AGE do
        local entry = Config.GROWTH_BY_AGE[i]
        if age <= entry.maxAge then
            return entry.mul
        end
    end
    return 0.25
end

--- 属性总和
---@param attrs table<string, number>
---@return number
function Career.attrTotal(attrs)
    local sum = 0
    for i = 1, #Config.ATTRS do
        local def = Config.ATTRS[i]
        sum = sum + (attrs[def.key] or 0)
    end
    return sum
end

--- 属性平均值
---@param attrs table<string, number>
---@return number
function Career.attrAverage(attrs)
    return Career.attrTotal(attrs) / #Config.ATTRS
end

--- 取位置定义
---@param positionId string
---@return PositionDef
function Career.getPositionDef(positionId)
    for i = 1, #Config.POSITIONS do
        local p = Config.POSITIONS[i]
        if p.id == positionId then
            return p
        end
    end
    return assert(Config.POSITIONS[1])
end

--- 取阶段定义
---@param index number
---@return StageDef
function Career.getStageDef(index)
    local s = Config.STAGES[index]
    if s == nil then
        s = Config.STAGES[#Config.STAGES]
    end
    return assert(s)
end

-- ============================================================================
-- 创建新生涯
-- ============================================================================

--- 取星途出身定义（缺省用第一条）
---@param originId string|nil
---@return OriginDef
function Career.getOriginDef(originId)
    if originId then
        for i = 1, #Config.ORIGINS do
            local o = Config.ORIGINS[i]
            if o.id == originId then
                return o
            end
        end
    end
    return assert(Config.ORIGINS[1])
end

--- 取天赋卡定义
---@param talentId string
---@return TalentDef|nil
function Career.getTalentDef(talentId)
    for i = 1, #Config.TALENTS do
        local t = Config.TALENTS[i]
        if t.id == talentId then
            return t
        end
    end
    return nil
end

--- 把一份 { 属性key = 加成 } 叠加到属性表（受潜力上限约束）
---@param attrs table<string, number>
---@param bonus table<string, number?>|nil
local function applyAttrBonus(attrs, bonus)
    if not bonus then return end
    for i = 1, #Config.ATTRS do
        local def = Config.ATTRS[i]
        local add = bonus[def.key]
        if add then
            attrs[def.key] = clamp((attrs[def.key] or 0) + add, 1, Config.ATTR_MAX)
        end
    end
end

--- 创建一名新球员
---@param name string
---@param positionId string
---@param hometown string
---@param originId string|nil 星途出身
---@param talentIds string[]|nil 建角选中的天赋卡
---@return CareerState
function Career.createPlayer(name, positionId, hometown, originId, talentIds)
    local posDef = Career.getPositionDef(positionId)
    local origin = Career.getOriginDef(originId)

    -- 初始属性 = 位置倾向 + 少量随机浮动 + 出身加成
    ---@type table<string, number>
    local attrs = {}
    for i = 1, #Config.ATTRS do
        local def = Config.ATTRS[i]
        local base = posDef.focus[def.key] or 25
        attrs[def.key] = clamp(base + math.random(-4, 4), 1, Config.ATTR_MAX)
    end
    applyAttrBonus(attrs, origin.attrs)

    local stage = Config.STAGES[1]

    ---@type CareerState
    local state = {
        name = name ~= "" and name or "无名球员",
        positionId = posDef.id,
        hometown = hometown,
        age = Config.INIT.age,
        stageIndex = 1,
        season = 1,
        week = 1,
        attrs = attrs,
        stamina = Config.INIT.stamina,
        morale = Config.INIT.morale,
        fame = Config.INIT.fame,
        money = Config.INIT.money,
        salary = Config.INIT.salary,
        team = Teams.makeTeamName(stage.id, hometown, 1, stage.teamPrefix),
        honors = {},
        games = 0,
        totalPoints = 0,
        seasonPoints = 0,
        seasonGames = 0,
        mvps = 0,
        allStars = 0,
        titles = 0,
        log = {},
        lastResult = nil,
        pendingEvent = nil,
        seenEvents = {},
        catCooldown = {},
        retired = false,
        -- 扩展系统
        injuryDays = 0,
        injuryName = nil,
        injuryRisk = 30,
        expPool = 0,
        skillPoints = 0,
        potential = {},
        talents = {},
        endorsements = {},
        adUsage = { day = "", heal = 0 },
        matchMode = "live",
        boostActive = false,
        tacticId = nil,
        defenseId = nil,
        -- 球队与转会
        tactics = {},
        welfareDay = "",
        welfareClaims = 0,
        teamTier = 1,
        transferSeason = 0,
        transferUsed = 0,
        transferOffers = {},
        -- 建角选择
        originId = origin.id,
        attrPoints = 0,
        talentCards = {},
    }

    -- 初始潜力上限：各项 99（广告可突破）
    for i = 1, #Config.ATTRS do
        local def = Config.ATTRS[i]
        state.potential[def.key] = Config.ATTR_MAX
    end

    -- 出身带来的初始资源
    if origin.init then
        state.morale = clamp(state.morale + (origin.init.morale or 0), 0, 100)
        state.fame = math.max(0, state.fame + (origin.init.fame or 0))
        state.money = math.max(0, state.money + (origin.init.money or 0))
    end

    -- 天赋卡：属性加成 + 初始资源 + 记入天赋列表
    if talentIds then
        for i = 1, #talentIds do
            local card = Career.getTalentDef(talentIds[i])
            if card then
                applyAttrBonus(attrs, card.attrs)
                if card.init then
                    state.morale = clamp(state.morale + (card.init.morale or 0), 0, 100)
                    state.fame = math.max(0, state.fame + (card.init.fame or 0))
                    state.expPool = state.expPool + (card.init.exp or 0)
                end
                table.insert(state.talentCards, card.id)
                Career.state = state   -- addTalent 依赖 state
                Career.addTalent(card.name)
            end
        end
    end

    Career.state = state
    Career.addLog(string.format("生涯起步：%s，%s，司职%s，出身【%s】。",
        state.name, hometown, posDef.name, origin.name))
    print(string.format("[Career] 创建球员 %s | %s | 球队 %s | 出身 %s | 天赋卡 %d 张",
        state.name, posDef.name, state.team, origin.name, #state.talentCards))
    return state
end

-- ============================================================================
-- 大事记
-- ============================================================================

--- 追加一条生涯大事记（保留最近 40 条）
---@param text string
function Career.addLog(text)
    local s = Career.state
    if not s then return end
    table.insert(s.log, 1, text)
    while #s.log > 40 do
        table.remove(s.log)
    end
end

-- ============================================================================
-- 查询
-- ============================================================================

--- 当前生涯阶段定义
---@return StageDef
function Career.getStage()
    local s = Career.state
    if not s then return assert(Config.STAGES[1]) end
    return Career.getStageDef(s.stageIndex)
end

--- 当前阶段名称
---@return string
function Career.getStageName()
    return Career.getStage().name
end

--- 球员综合实力（0-99）
---@return number
function Career.getOverall()
    local s = Career.state
    if not s then return 0 end
    return math.floor(Career.attrAverage(s.attrs) + 0.5)
end

--- 位置显示名
---@return string
function Career.getPositionName()
    local s = Career.state
    if not s then return "" end
    return Career.getPositionDef(s.positionId).name
end

--- 赛季场均得分
---@return number
function Career.getPPG()
    local s = Career.state
    if not s or s.seasonGames == 0 then return 0 end
    return s.seasonPoints / s.seasonGames
end

--- 按当前阶段与实力重新分配球队（晋级后重新落位，转会记录随之作废）
--- 球员实力够强时会被更高档次的球队接走，这是"不花广告"的原生上升通道
function Career.refreshTeam()
    local s = Career.state
    if not s then return end
    local stage = Career.getStage()
    local ov = Career.getOverall()
    local tier = 1
    if ov >= Config.TRANSFER.tier3MinOverall then
        tier = 3
    elseif ov >= Config.TRANSFER.tier2MinOverall then
        tier = 2
    end
    s.teamTier = tier
    s.team = Teams.makeTeamName(stage.id, s.hometown, tier, stage.teamPrefix)
    -- 转会报价属于上一阶段的球队池，晋级后作废
    s.transferOffers = {}
    s.transferSeason = 0
    s.transferUsed = 0
end

-- ============================================================================
-- 属性变更（统一入口，便于记录）
-- ============================================================================

--- 取某项能力的上限（默认 ATTR_MAX，广告可突破）
---@param key string
---@return number
function Career.getPotential(key)
    local s = Career.state
    if not s or not s.potential then return Config.ATTR_MAX end
    return s.potential[key] or Config.ATTR_MAX
end

--- 直接增减属性（受潜力上限约束）
---@param key string
---@param delta number
---@return number 实际变化量
function Career.addAttr(key, delta)
    local s = Career.state
    if not s then return 0 end
    local cap = Career.getPotential(key)
    local before = s.attrs[key] or 0
    s.attrs[key] = clamp(before + delta, 1, cap)
    return s.attrs[key] - before
end

--- 提升某项能力的潜力上限（广告「潜力突破」奖励）
---@param key string
---@param step number
---@return number 新的上限
function Career.addPotential(key, step)
    local s = Career.state
    if not s then return Config.ATTR_MAX end
    if not s.potential then s.potential = {} end
    local cur = s.potential[key] or Config.ATTR_MAX
    local next_ = cur + step
    if next_ > Config.ATTR_MAX + 20 then next_ = Config.ATTR_MAX + 20 end
    s.potential[key] = next_
    return next_
end

--- 增加经验池
---@param amount number
function Career.addExp(amount)
    local s = Career.state
    if not s then return end
    s.expPool = (s.expPool or 0) + amount
end

--- 用经验池兑换自由属性点（原生路径，不依赖广告）
---@return boolean, string
function Career.buyAttrPointWithExp()
    local s = Career.state
    if not s then return false, "无生涯数据" end
    local cost = Config.AD_REWARDS.expPerAttrPoint
    if (s.expPool or 0) < cost then
        return false, string.format("经验不足（需 %d，现有 %d）", cost, s.expPool or 0)
    end
    s.expPool = s.expPool - cost
    s.attrPoints = (s.attrPoints or 0) + 1
    return true, "兑换 1 点属性点"
end

--- 自费特训：花钱直接买 1 点属性点（原生路径，也是钱的消费出口）
---@return boolean, string
function Career.buyAttrPointWithMoney()
    local s = Career.state
    if not s then return false, "无生涯数据" end
    local cost = Config.ECONOMY.moneyPerAttrPoint
    if (s.money or 0) < cost then
        return false, string.format("资金不足（需 %d 万，现有 %d 万）", cost, s.money or 0)
    end
    s.money = s.money - cost
    s.attrPoints = (s.attrPoints or 0) + 1
    return true, string.format("自费特训完成，属性点 +1（-%d 万）", cost)
end

--- 增加自由属性点
---@param amount number
function Career.addAttrPoints(amount)
    local s = Career.state
    if not s then return end
    s.attrPoints = (s.attrPoints or 0) + amount
end

--- 消耗 1 点自由属性点，加到指定能力上
---@param key string
---@return boolean, string
function Career.spendAttrPoint(key)
    local s = Career.state
    if not s then return false, "无生涯数据" end
    if (s.attrPoints or 0) <= 0 then
        return false, "没有可用的属性点"
    end
    local cap = Career.getPotential(key)
    if (s.attrs[key] or 0) >= cap then
        return false, "已达潜力上限，需先突破潜力"
    end
    local real = Career.addAttr(key, 1)
    if real <= 0 then
        return false, "该项已达上限"
    end
    s.attrPoints = s.attrPoints - 1
    return true, "属性 +1"
end

--- 是否已解锁某个广告战术
---@param id string
---@return boolean
function Career.hasTactic(id)
    local s = Career.state
    if not s or not s.tactics then return false end
    for i = 1, #s.tactics do
        if s.tactics[i] == id then return true end
    end
    return false
end

--- 解锁一个广告战术（永久，记在生涯里）
---@param id string
---@return boolean 是否新解锁
function Career.unlockTactic(id)
    local s = Career.state
    if not s then return false end
    if not s.tactics then s.tactics = {} end
    if Career.hasTactic(id) then return false end
    table.insert(s.tactics, id)
    return true
end

-- ============================================================================
-- 球队福利（每周免费一份，广告可以多领一份）
-- ============================================================================

--- 本周的日期键（与广告日配额同一套口径）
---@param s CareerState
---@return string
local function welfareKey(s)
    return string.format("%d-%d-%d", s.season, s.week, s.age)
end

--- 本周的球队福利是否还能免费领
---@return boolean
function Career.welfareAvailable()
    local s = Career.state
    if not s then return false end
    if s.welfareDay ~= welfareKey(s) then return true end
    return (s.welfareClaims or 0) < 1
end

--- 免费领取本周球队福利；已经领过则返回 nil
---@return string|nil
function Career.claimWelfare()
    local s = Career.state
    if not s then return nil end
    if not Career.welfareAvailable() then return nil end

    local key = welfareKey(s)
    if s.welfareDay ~= key then
        s.welfareDay = key
        s.welfareClaims = 0
    end
    s.welfareClaims = (s.welfareClaims or 0) + 1

    local exp = Config.ECONOMY.welfareExp
    local morale = Config.ECONOMY.welfareMorale
    Career.addExp(exp)
    Career.addMorale(morale)
    return string.format("领到本周福利：经验 +%d，士气 +%d", exp, morale)
end

--- 额外发一份球队福利（广告用），返回提示文案
---@return string
function Career.grantExtraWelfare()
    local s = Career.state
    if not s then return "" end
    local exp = Config.ECONOMY.welfareExp
    local morale = Config.ECONOMY.welfareMorale
    Career.addExp(exp)
    Career.addMorale(morale)
    return string.format("又多领一份：经验 +%d，士气 +%d", exp, morale)
end

--- 突破当前最高一项能力的潜力上限（赛季特训营奖励）
---@param step number
---@return string 提示文案
function Career.breakPotentialTop(step)
    local s = Career.state
    if not s then return "" end

    local bestKey = nil
    local bestVal = -1
    local bestName = ""
    for i = 1, #Config.ATTRS do
        local def = Config.ATTRS[i]
        local v = s.attrs[def.key] or 0
        if v > bestVal then
            bestKey, bestVal, bestName = def.key, v, def.name
        end
    end
    if not bestKey then return "没有可突破的项目" end

    local cap = Career.addPotential(bestKey, step)
    return string.format("%s 的潜力上限提升到 %d", bestName, cap)
end

--- 增加技能点
---@param amount number
function Career.addSkillPoints(amount)
    local s = Career.state
    if not s then return end
    s.skillPoints = (s.skillPoints or 0) + amount
end

--- 添加天赋
---@param name string
---@return boolean 是否新增成功
function Career.addTalent(name)
    local s = Career.state
    if not s then return false end
    if not s.talents then s.talents = {} end
    for i = 1, #s.talents do
        if s.talents[i] == name then return false end
    end
    table.insert(s.talents, name)
    return true
end

--- 添加代言合约
---@param name string
---@param pay number 每赛季收入（万元）
---@param seasons number 合约年数
function Career.addEndorsement(name, pay, seasons)
    local s = Career.state
    if not s then return end
    if not s.endorsements then s.endorsements = {} end
    table.insert(s.endorsements, { name = name, pay = pay, seasons = seasons })
end

--- 代言每赛季总收入
---@return number
function Career.endorsementIncome()
    local s = Career.state
    if not s or not s.endorsements then return 0 end
    local total = 0
    for i = 1, #s.endorsements do
        total = total + (s.endorsements[i].pay or 0)
    end
    return total
end

--- 代言合约推进一赛季（年数 -1，到期移除）
---@return string[] 到期提示
function Career.advanceEndorsements()
    local s = Career.state
    if not s or not s.endorsements then return {} end
    ---@type string[]
    local out = {}
    local kept = {}
    for i = 1, #s.endorsements do
        local e = s.endorsements[i]
        e.seasons = (e.seasons or 1) - 1
        if e.seasons > 0 then
            table.insert(kept, e)
        else
            table.insert(out, string.format("代言合约「%s」到期。", e.name))
        end
    end
    s.endorsements = kept
    return out
end

--- 增减体能
---@param delta number
function Career.addStamina(delta)
    local s = Career.state
    if not s then return end
    s.stamina = clamp(s.stamina + delta, 0, 100)
end

--- 增减士气
---@param delta number
function Career.addMorale(delta)
    local s = Career.state
    if not s then return end
    s.morale = clamp(s.morale + delta, 0, 100)
end

--- 增减人气
---@param delta number
function Career.addFame(delta)
    local s = Career.state
    if not s then return end
    s.fame = math.max(0, s.fame + delta)
end

--- 增减金钱
---@param delta number
function Career.addMoney(delta)
    local s = Career.state
    if not s then return end
    s.money = math.max(0, s.money + delta)
end

-- ============================================================================
-- 周行动
-- ============================================================================

--- 执行一周行动，返回结果描述
---@param actionId string
---@param extraMul number|nil 额外收益倍率（广告「私人教练加练」用），默认 1.0
---@return string 结果描述文本
function Career.applyAction(actionId, extraMul)
    local s = Career.state
    if not s then return "" end
    local extra = extraMul or 1.0

    local cost = Config.ACTION_COST[actionId] or 0
    local gain = Config.ACTION_GAIN[actionId] or {}

    -- 体能结算（rest 的 cost 为负 = 恢复）
    Career.addStamina(-cost)

    ---@type string[]
    local parts = {}
    local mul = growthMul(s.age) * extra

    -- 训练经验加成（训练馆广告奖励的「体能师」效果）
    if s.boostActive then
        mul = mul * Config.AD_REWARDS.boostMultiplier
    end

    -- 伤病期间训练效果减半
    if (s.injuryDays or 0) > 0 then
        mul = mul * 0.5
        table.insert(parts, "（伤病中，训练效果减半）")
    end

    -- 属性收益（受年龄成长系数影响）
    for i = 1, #Config.ATTRS do
        local def = Config.ATTRS[i]
        local g = gain[def.key]
        if g then
            local delta = g * mul
            local lo = math.floor(delta)
            local frac = delta - lo
            local add = lo + (math.random() < frac and 1 or 0)
            if add < 1 then add = 1 end
            -- 高龄衰退风险
            if s.age >= 31 and math.random() < 0.25 then
                add = 0
            end
            if add > 0 then
                local real = Career.addAttr(def.key, add)
                if real > 0 then
                    table.insert(parts, string.format("%s +%d", def.name, real))
                end
            end
        end
    end

    -- 休息：额外恢复士气
    if actionId == "rest" then
        Career.addMorale(4)
        table.insert(parts, "体能大幅恢复")
    end

    -- 商业活动：人气 + 收入
    if actionId == "media" then
        local add = math.floor(4 * (1 + Career.getOverall() / 100))
        Career.addFame(add)
        local income = math.floor(add * (1 + s.salary / 50))
        Career.addMoney(income)
        table.insert(parts, string.format("人气 +%d", add))
        table.insert(parts, string.format("收入 +%d万", income))
    end

    -- 所有训练都累积经验池（倍率生效）
    if actionId ~= "rest" and actionId ~= "media" then
        local exp = math.floor(18 * extra + 0.5)
        Career.addExp(exp)
        table.insert(parts, string.format("经验 +%d", exp))
    end

    -- 低士气拖慢成长
    if s.morale < 30 then
        table.insert(parts, "（士气低落，状态不佳）")
    end

    if #parts == 0 then
        return "这一周平淡地过去了。"
    end
    return table.concat(parts, "，")
end

-- ============================================================================
-- 周推进
-- ============================================================================

--- 判定本周是否有比赛
---@return boolean
function Career.hasGameThisWeek()
    local s = Career.state
    if not s then return false end
    local cfg = Config.SEASON
    local interval = cfg.weeksPerSeason / cfg.gamesPerSeason
    local pos = (s.week - 1) % interval
    return math.floor(pos) == 0
end

--- 推进一周，返回本周发生的事项列表
---@return string[]
function Career.advanceWeek()
    local s = Career.state
    if not s then return {} end

    ---@type string[]
    local events = {}

    -- 伤病恢复推进
    local Injury = require("Core.Injury")
    local healed = Injury.advanceWeek(s)
    if healed then
        table.insert(events, healed)
        Career.addLog(healed)
    end

    -- 赛季推进
    s.week = s.week + 1
    if s.week > Config.SEASON.weeksPerSeason then
        s.week = 1
        s.season = s.season + 1
        local seasonEvents = Career.endSeason()
        for i = 1, #seasonEvents do
            table.insert(events, seasonEvents[i])
        end
    end

    -- 年龄推进（每 4 个赛季长一岁）
    if (s.season - 1) % 4 == 0 and s.week == 1 then
        s.age = s.age + 1
        Career.updateStage()
    end

    return events
end

--- 依据年龄更新生涯阶段
function Career.updateStage()
    local s = Career.state
    if not s then return end
    for i = 1, #Config.STAGES do
        local stage = Config.STAGES[i]
        if s.age >= stage.minAge and s.age <= stage.maxAge then
            if i ~= s.stageIndex then
                s.stageIndex = i
                Career.addLog(string.format("晋级至【%s】。", stage.name))
                Career.refreshTeam()
            end
            return
        end
    end
end

-- ============================================================================
-- 赛季结算
-- ============================================================================

--- 赛季结束：评奖、发薪
---@return string[]
function Career.endSeason()
    local s = Career.state
    if not s then return {} end

    ---@type string[]
    local out = {}

    local ppg = Career.getPPG()
    local seasonNo = s.season - 1

    table.insert(out, string.format("第 %d 赛季结束，场均 %.1f 分。", seasonNo, ppg))

    local ov = Career.getOverall()

    -- 全明星
    if ppg >= 18 and ov >= 62 and math.random() < 0.6 then
        s.allStars = s.allStars + 1
        table.insert(s.honors, string.format("第%d赛季 全明星", seasonNo))
        table.insert(out, "★ 入选全明星阵容！")
        Career.addFame(300)
    end

    -- 常规赛 MVP
    if ppg >= 26 and ov >= 78 and math.random() < 0.45 then
        s.mvps = s.mvps + 1
        table.insert(s.honors, string.format("第%d赛季 常规赛MVP", seasonNo))
        table.insert(out, "★★ 当选常规赛 MVP！")
        Career.addFame(1200)
    end

    -- 总冠军
    if ov >= 72 and ppg >= 16 and math.random() < 0.35 then
        s.titles = s.titles + 1
        table.insert(s.honors, string.format("第%d赛季 总冠军", seasonNo))
        table.insert(out, "★★★ 夺得总冠军！")
        Career.addFame(1500)
    end

    -- 合同与薪资（球队档次影响年薪倍率，这是转会的直接收益）
    local tier = s.teamTier or 1
    local tierMul = Config.TRANSFER.tierSalaryMul[tier] or 1.0
    local baseSalary = math.floor((ov - 40) * (ov - 40) / 8 * tierMul)
    if baseSalary < 5 then baseSalary = 5 end
    s.salary = baseSalary
    Career.addMoney(s.salary)
    table.insert(out, string.format("续约：%s 档球队年薪 %d 万（×%.2f）。",
        Teams.TIER_NAMES[tier] or "新军", s.salary, tierMul))

    -- 代言收入
    local endorseIncome = Career.endorsementIncome()
    if endorseIncome > 0 then
        Career.addMoney(endorseIncome)
        table.insert(out, string.format("代言收入 %d 万。", endorseIncome))
    end

    -- 代言合约到期推进
    local expired = Career.advanceEndorsements()
    for i = 1, #expired do
        table.insert(out, expired[i])
    end

    -- 人气够高时，经纪公司会主动带代言上门（原生路径，不依赖广告；同时只保留一份）
    if s.fame >= Config.ECONOMY.endorseFameGate and #(s.endorsements or {}) == 0 then
        local BRANDS = { "运动饮料", "球鞋品牌", "腕表", "汽车", "手机" }
        local brand = BRANDS[math.random(1, #BRANDS)] or "运动饮料"
        local pay = math.floor(20 + s.fame / 12)
        Career.addEndorsement(brand, pay, 2)
        table.insert(out, string.format("签下「%s」代言，每赛季 %d 万。", brand, pay))
    end

    -- 训练经验加成到期（按赛季失效）
    if s.boostActive then
        s.boostActive = false
    end

    -- 士气浮动
    if ppg >= 15 then
        Career.addMorale(10)
    else
        Career.addMorale(-8)
    end

    for i = 1, #out do
        Career.addLog(out[i])
    end

    -- 重置赛季统计
    s.seasonPoints = 0
    s.seasonGames = 0

    print(string.format("[Career] 赛季结算完成，场均 %.1f 分，荣誉 %d 项", ppg, #s.honors))
    return out
end

-- ============================================================================
-- 存档 / 读档
-- ============================================================================

--- 保存生涯进度
---@return boolean
function Career.save()
    local s = Career.state
    if not s then return false end
    local file = File(Config.SAVE_FILE, FILE_WRITE)
    if not file:IsOpen() then
        print("[Career] 存档失败：无法打开文件")
        return false
    end
    file:WriteString(cjson.encode(s))
    file:Close()
    print("[Career] 存档成功")
    return true
end

--- 是否存在存档
---@return boolean
function Career.hasSave()
    return fileSystem:FileExists(Config.SAVE_FILE)
end

--- 读取存档
---@return CareerState|nil
function Career.load()
    if not Career.hasSave() then return nil end
    local file = File(Config.SAVE_FILE, FILE_READ)
    if not file:IsOpen() then return nil end
    local raw = file:ReadString()
    file:Close()

    local ok, data = pcall(cjson.decode, raw)
    if not ok or type(data) ~= "table" then
        print("[Career] 存档损坏，已忽略")
        return nil
    end
    ---@type CareerState
    local state = data
    -- 兼容性补全
    if state.seenEvents == nil then state.seenEvents = {} end
    if state.catCooldown == nil then state.catCooldown = {} end
    if state.retired == nil then state.retired = false end
    if state.log == nil then state.log = {} end
    if state.honors == nil then state.honors = {} end
    if state.potential == nil then state.potential = {} end
    if state.talents == nil then state.talents = {} end
    if state.talentCards == nil then state.talentCards = {} end
    if state.attrPoints == nil then state.attrPoints = 0 end
    if state.originId == nil then state.originId = Config.ORIGINS[1].id end
    if state.teamTier == nil then
        state.teamTier = Teams.tierOf(Career.getStageDef(state.stageIndex).id, state.team or "")
    end
    if state.transferSeason == nil then state.transferSeason = 0 end
    if state.transferUsed == nil then state.transferUsed = 0 end
    if state.transferOffers == nil then state.transferOffers = {} end
    if state.tactics == nil then state.tactics = {} end
    if state.welfareDay == nil then state.welfareDay = "" end
    if state.welfareClaims == nil then state.welfareClaims = 0 end
    Career.state = state
    print("[Career] 读档成功：" .. tostring(state.name))
    return state
end

--- 删除存档
function Career.clearSave()
    if Career.hasSave() then
        local file = File(Config.SAVE_FILE, FILE_WRITE)
        if file:IsOpen() then
            file:WriteString("")
            file:Close()
        end
    end
    Career.state = nil
end

return Career
