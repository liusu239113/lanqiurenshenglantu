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
---@field focusCharges number    剩余「全神贯注」次数（>0 时训练必定拿满档收益）
---@field actionDoublePending boolean 下次周训练的私人教练加练奖励（存档）
---@field actionDoneKey string    已完成周行动的赛季/周标识，防止读档重复结算
---@field pickTeamCredit boolean 已观看定向转会广告但尚未签约的权益
---@field originId string         星途出身 id
---@field attrPoints number       自由属性点（广告/经验兑换获得）
---@field talentCards string[]    建角时选中的天赋卡 id
---@field tactics string[]        已解锁的广告战术 id
---@field welfareDay string        球队福利所属的"今天"（懒重置用）
---@field welfareClaims number     今天已观看广告领取的份数
---@field teamTier number         当前球队档次 1-3（影响球队强度与年薪）
---@field transferSeason number   转会问价次数所属赛季（懒重置用）
---@field transferUsed number     本赛季已用掉的问价次数
---@field transferOffers string[] 经纪人当前带来的报价（沿用上一次问价结果）
--- 徽章系统统计
---@field badges table<string, number> 已解锁徽章 id -> 等级
---@field totalAssists number     生涯累计助攻
---@field totalSteals number      生涯累计抢断
---@field totalBlocks number      生涯累计盖帽
---@field cleanGames number       未受伤完赛的场次（铁人徽章）
---@field iqSessions number       累计录像分析次数
---@field teammates table[]       队友关系
---@field storyMemory string       上一章留下的叙事回响
---@field storyPaths table<string, number> 不同人生选择的累计倾向
---@field storyHistory table[]     已完成的人生章节 { age, title, choice, response }
---@field postStoryDone boolean    退役后人生已走到终章
--- 扩充系统统计（徽章进度用）
---@field expTotal number         生涯累计获得的经验（只增不减，区别于可消费的 expPool）
---@field injuryCount number      生涯累计受伤次数
---@field clutchShots number      生涯关键球命中次数（分差 ≤3 的胜场）
--- 扩充玩法系统
---@field rival table|nil         宿敌数据（Core.Rival 维护）
---@field roster table|nil        队友阵容（Core.Teammates 维护）
---@field allStar table|nil       全明星赛季数据（Core.AllStar 维护）

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

--- 属性总和（含徽章被动加成）
---@param attrs table<string, number>
---@return number
function Career.attrTotal(attrs)
    local sum = 0
    local Badges = require("Data.Badges")
    local bonus = Career.state and Badges.totalBonus(Career.state) or {}
    for i = 1, #Config.ATTRS do
        local def = Config.ATTRS[i]
        sum = sum + (attrs[def.key] or 0) + (bonus[def.key] or 0)
    end
    return sum
end

--- 取单项属性的有效值（基础 + 徽章加成），用于展示与判定
---@param key string
---@return number
function Career.effectiveAttr(key)
    local s = Career.state
    if not s then return 0 end
    local Badges = require("Data.Badges")
    return (s.attrs[key] or 0) + Badges.bonusOf(s, key)
end

--- 比赛用属性（基础属性 + 徽章被动加成）
--- Match / MatchText / Injury 一律走这张派生表：
--- 此前它们直接读 state.attrs，导致"徽章加了属性但比赛里毫无感觉"。
---@return table<string, number>
function Career.matchAttrs()
    local s = Career.state
    ---@type table<string, number>
    local out = {}
    if not s then return out end
    local bonus = {}
    if s.badges then
        local Badges = require("Data.Badges")
        bonus = Badges.totalBonus(s)
    end
    for i = 1, #Config.ATTRS do
        local key = Config.ATTRS[i].key
        out[key] = (s.attrs[key] or 0) + (bonus[key] or 0)
    end
    return out
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
        focusCharges = 0,
        actionDoublePending = false,
        actionDoneKey = "",
        pickTeamCredit = false,
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
        -- 赛季赛程与季后赛
        schedule = nil,
        scheduleSeason = 0,
        playoff = nil,
        playoffResult = nil,
        -- 赛季时间线（剧情事件的预排表，见 Core/Timeline.lua）
        timeline = nil,
        timelineSeason = 0,
        endorseTier = 0,
        -- 徽章系统
        badges = {},
        totalAssists = 0,
        totalSteals = 0,
        totalBlocks = 0,
        cleanGames = 0,
        iqSessions = 0,
        fatigueStreak = 0,   -- 连续出战周数（推高伤病风险，休息可清零）
        -- 队友关系
        teammates = {},
        storyMemory = "",
        storyPaths = {},
        storyHistory = {},
        postStoryDone = false,
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
    -- 转会报价属于上一阶段的球队池，晋级后作废；已购买的定向机会保留。
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
--- expTotal 记录「生涯累计获得」（只增不减），用于徽章进度；
--- expPool 是「可消费余额」，兑换属性点会扣减。两者必须分开，否则徽章会掉级。
---@param amount number
function Career.addExp(amount)
    local s = Career.state
    if not s then return end
    s.expPool = (s.expPool or 0) + amount
    if amount > 0 then
        s.expTotal = (s.expTotal or 0) + amount
    end
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

--- 发放「全神贯注」次数（广告奖励）：接下来这几次训练必定拿满档收益
---@param amount number
---@return string 提示文案
function Career.grantFocus(amount)
    local s = Career.state
    if not s then return "" end
    s.focusCharges = (s.focusCharges or 0) + amount
    return string.format("专注状态已就位：接下来 %d 次训练必定拿满档（现有 %d 次）",
        amount, s.focusCharges)
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
-- 球队福利（每周限一份，由 UI 的激励广告成功回调领取）
-- ============================================================================

--- 本周的日期键（与广告日配额同一套口径）
---@param s CareerState
---@return string
local function welfareKey(s)
    return string.format("%d-%d-%d", s.season, s.week, s.age)
end

--- 本周的球队福利是否还能领取
---@return boolean
function Career.welfareAvailable()
    local s = Career.state
    if not s then return false end
    if s.welfareDay ~= welfareKey(s) then return true end
    return (s.welfareClaims or 0) < 1
end

--- 领取本周球队福利；已经领过则返回 nil。只由激励广告成功回调调用。
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

--- 计算某档代言的实际年薪（含出身 perk 加成，如「天选之星」代言收入 +25%）
---@param tier table 代言档位定义
---@param fame number 当前人气
---@return number
function Career.calcEndorsePay(tier, fame)
    local pay = tier.payBase + fame * Config.ECONOMY.endorsePayPerFame
    local perk = Career.getPerk()
    if perk and perk.endorsePayMul then
        pay = pay * perk.endorsePayMul
    end
    return math.floor(pay)
end

--- 当前出身的独特机制（无则返回 nil）
---@return table|nil
function Career.getPerk()
    local s = Career.state
    if not s then return nil end
    local origin = Career.getOriginDef(s.originId)
    return origin and origin.perk or nil
end

--- 代言人气门槛（受出身 perk 影响，如「天选之星」自带流量 → 门槛减半）
---@return number
function Career.endorseFameGate()
    local gate = Config.ECONOMY.endorseFameGate
    local perk = Career.getPerk()
    if perk and perk.endorseGateMul then
        gate = math.floor(gate * perk.endorseGateMul)
    end
    return gate
end

--- 当前人气对应的代言档位（1 起；低于门槛返回 0）
---@param fame number
---@return number
function Career.endorseTierOf(fame)
    local tiers = Config.ECONOMY.endorseTiers or {}
    local idx = 0
    for i = 1, #tiers do
        if fame >= tiers[i].fame then idx = i end
    end
    return idx
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

--- 徽章被动加成查询（懒加载 Badges，避免 require 循环）
---@param key string
---@return number
local function badgeBonus(key)
    local s = Career.state
    if not s then return 0 end
    local Badges = require("Data.Badges")
    return Badges.bonusOf(s, key)
end

--- 体能上限（徽章「不朽之躯」等可抬高）
---@return number
function Career.staminaMax()
    return 100 + badgeBonus("staminaMax")
end

--- 士气上限（徽章「冠军之心」等可抬高）
---@return number
function Career.moraleMax()
    return 100 + badgeBonus("moraleMax")
end

--- 增减体能
---@param delta number
function Career.addStamina(delta)
    local s = Career.state
    if not s then return end
    s.stamina = clamp(s.stamina + delta, 0, Career.staminaMax())
end

--- 训练馆体能门槛
---@return number
function Career.trainingMinStamina()
    return Config.TRAINING.minStamina or 10
end

--- 某玩法开练所需的体能消耗
---@param mode string "shot" | "dribble" | "defend"
---@return number
function Career.trainingCost(mode)
    local T = Config.TRAINING
    if mode == "shot" then return T.costShot or 12 end
    if mode == "dribble" then return T.costDribble or 14 end
    if mode == "defend" then return T.costDefend or 14 end
    return 0
end

--- 当前体能是否够开练（第二个返回值是体能不足时的提示文案）
---@param mode string
---@return boolean
---@return string
function Career.canTrain(mode)
    local s = Career.state
    if not s then return false, "无生涯数据" end
    local minStamina = Career.trainingMinStamina()
    local cost = Career.trainingCost(mode)
    local now = math.floor(s.stamina or 0)
    if now < minStamina then
        return false, string.format("体能不足（当前 %d），先安排一次「休息恢复」再来训练馆。", now)
    end
    if cost > 0 and now < cost then
        return false, string.format("体能不够完成这次训练（需要 %d，当前 %d），先休息一下。", cost, now)
    end
    return true, ""
end

--- 增减士气
---@param delta number
function Career.addMorale(delta)
    local s = Career.state
    if not s then return end
    s.morale = clamp(s.morale + delta, 0, Career.moraleMax())
end

--- 增减人气（徽章「时代符号」等可按百分比放大正向收益）
---@param delta number
function Career.addFame(delta)
    local s = Career.state
    if not s then return end
    local real = delta
    if delta > 0 then
        real = delta + math.floor(delta * badgeBonus("fameGain") / 100)
    end
    s.fame = math.max(0, s.fame + real)
end

--- 增减金钱（徽章「商业帝国」等可按百分比放大正向收益）
---@param delta number
function Career.addMoney(delta)
    local s = Career.state
    if not s then return end
    local real = delta
    if delta > 0 then
        real = delta + math.floor(delta * badgeBonus("moneyGain") / 100)
    end
    s.money = math.max(0, s.money + real)
end

--- 记录一次关键球命中（末节/终场分差 ≤3 的胜场），供「关键先生」徽章线使用
function Career.noteClutchShot()
    local s = Career.state
    if not s then return end
    s.clutchShots = (s.clutchShots or 0) + 1
end

--- 记录一次受伤，供「浴火重生」徽章线使用
function Career.noteInjury()
    local s = Career.state
    if not s then return end
    s.injuryCount = (s.injuryCount or 0) + 1
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

    -- 伤病期间训练效果减半
    if (s.injuryDays or 0) > 0 then
        mul = mul * 0.5
        table.insert(parts, "（伤病中，训练效果减半）")
    end

    -- 低士气真实拖慢成长：士气越低乘算越低（30 以下开始吃惩罚，0 时打 lowMoraleMul 折）
    local moraleLine = Config.CAREER.lowMoraleLine or 30
    local moraleMul = 1.0
    if s.morale < moraleLine then
        local floorMul = Config.CAREER.lowMoraleMul or 0.75
        moraleMul = floorMul + (1.0 - floorMul) * (s.morale / moraleLine)
        mul = mul * moraleMul
    end

    -- 全神贯注（广告）：把本次训练的随机性整个买断 —— 取满档收益且不吃高龄衰退
    -- 注意只对训练生效（rest / media 没有属性收益，不能白扣次数）
    local focused = false
    if (s.focusCharges or 0) > 0 and next(gain) ~= nil then
        focused = true
        s.focusCharges = s.focusCharges - 1
        -- 满档 = 无视年龄衰退、士气低落、伤病减半这三层折扣
        mul = 1.0 * extra
    end

    -- 属性收益（受年龄成长系数影响）
    for i = 1, #Config.ATTRS do
        local def = Config.ATTRS[i]
        local g = gain[def.key]
        if g then
            local add
            if focused then
                -- 必定满额，不做取整抖动
                add = math.floor(g * mul + 0.5)
            else
                local delta = g * mul
                local lo = math.floor(delta)
                local frac = delta - lo
                add = lo + (math.random() < frac and 1 or 0)
                -- 高龄衰退风险
                if s.age >= 31 and math.random() < 0.25 then
                    add = 0
                end
            end
            if add < 1 then add = 1 end
            local real = Career.addAttr(def.key, add)
            if real > 0 then
                table.insert(parts, string.format("%s +%d", def.name, real))
            end
        end
    end

    if focused then
        table.insert(parts, string.format("（全神贯注 · 剩余 %d 次）", s.focusCharges))
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

    -- 录像分析计数（录像狂人徽章的进度来源）
    if actionId == "train_iq" then
        s.iqSessions = (s.iqSessions or 0) + 1
    end

    -- 行动后检查徽章解锁
    local Badges = require("Data.Badges")
    local newBadges = Badges.check(s)
    for i = 1, #newBadges do
        local def = Badges.BY_ID[newBadges[i]]
        if def then
            table.insert(parts, string.format("★ 解锁徽章【%s】", def.name))
            Career.addLog(string.format("★ 解锁徽章【%s】：%s", def.name, def.desc))
        end
    end

    -- 低士气提示（惩罚已在上面乘算进 mul）
    if s.morale < moraleLine then
        table.insert(parts, string.format("（士气低落，训练效率 ×%.2f）", moraleMul))
    end

    if #parts == 0 then
        return "这一周平淡地过去了。"
    end
    return table.concat(parts, "，")
end

-- ============================================================================
-- 周推进
-- ============================================================================

--- 确保本周依赖的赛季数据（赛程 + 时间线）都已就绪
--- 主页/日程页/推进流程都先调它，避免各处各自 ensure 出现时序差
---@param s CareerState
local function ensureSeasonData(s)
    if not s then return end
    local ScheduleMod = require("Core.Schedule")
    ScheduleMod.ensure(s)
    local TimelineMod = require("Core.Timeline")
    TimelineMod.ensure(s)
end

--- 判定本周是否有比赛
---@return boolean
function Career.hasGameThisWeek()
    local s = Career.state
    if not s then return false end
    ensureSeasonData(s)
    -- 季后赛期间：每周都有比赛（逐轮晋级）
    if s.playoff and not s.playoff.done then
        return true
    end
    local ScheduleMod = require("Core.Schedule")
    return ScheduleMod.hasGameThisWeek(s)
end

--- 本周的赛程条目（供比赛界面取对手）
---@return table|nil
function Career.getGameThisWeek()
    local s = Career.state
    if not s then return nil end
    ensureSeasonData(s)

    -- 季后赛优先
    if s.playoff and not s.playoff.done then
        return {
            week = s.week,
            opponent = s.playoff.opponent,
            strength = s.playoff.opponentStrength,
            playoff = true,
            round = s.playoff.round,
        }
    end
    local ScheduleMod = require("Core.Schedule")
    return ScheduleMod.gameThisWeek(s)
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

    -- 疲劳恢复：每周衰减 1 层，风险随之回落
    if (s.fatigueStreak or 0) > 0 then
        s.fatigueStreak = s.fatigueStreak - 1
    end

    -- 出身 perk：自带流量（每周自动积累人气，人气本身会持续变现为代言收入）
    -- 注意：必须写进 events，否则效果完全不可见，玩家会以为该出身没有特色
    local perk = Career.getPerk()
    if perk and perk.weeklyFame and perk.weeklyFame > 0 then
        Career.addFame(perk.weeklyFame)
        table.insert(events, string.format("◆ %s：人气 +%d（现 %d）", perk.name, perk.weeklyFame, s.fame))
    end

    -- 赛季推进
    local Schedule = require("Core.Schedule")
    s.week = s.week + 1

    -- 常规赛打满 → 构建季后赛
    if s.week > Config.SEASON.weeksPerSeason and s.playoff == nil then
        Career.startPlayoff()
    end

    -- 季后赛进行中：本周刚打完一轮，只要没被淘汰/没夺冠就继续下一轮
    if s.playoff and not s.playoff.done then
        s.week = Config.SEASON.weeksPerSeason + 1
        local msg = string.format("★ 季后赛【%s】对手：%s",
            Schedule.ROUND_NAMES[s.playoff.round] or "季后赛", s.playoff.opponent)
        table.insert(events, msg)
        Career.addLog(msg)
        return events
    end

    -- 赛季真正结束（常规赛未晋级，或季后赛已打完）
    if s.week > Config.SEASON.weeksPerSeason then
        s.week = 1
        s.season = s.season + 1
        local seasonEvents = Career.endSeason()
        for i = 1, #seasonEvents do
            table.insert(events, seasonEvents[i])
        end
    end

    -- 年龄推进（周期由 Config.CAREER.seasonsPerYear 控制）
    local perYear = Config.CAREER.seasonsPerYear or 1
    if (s.season - 1) % perYear == 0 and s.week == 1 then
        s.age = s.age + 1
        Career.updateStage()
    end

    -- 到达强制退役年龄 → 触发退役
    if s.age >= (Config.CAREER.retireAge or 38) and not s.retired then
        s.retired = true
        Career.addLog("打完了最后一个赛季，正式挂靴。")
        table.insert(events, "★ 你宣布退役，生涯就此落幕。")
    end

    return events
end

-- ============================================================================
-- 退役
-- ============================================================================

--- 主动退役（由「最后一舞」事件的"宣布退役"选项调用）
---@return boolean 是否成功触发
function Career.retire()
    local s = Career.state
    if not s or s.retired then return false end
    s.retired = true
    Career.addLog("在发布会上宣布退役，一个时代结束了。")
    return true
end

--- 生涯综合评分（0-100），用于名人堂评价
---@return number
function Career.careerScore()
    local s = Career.state
    if not s then return 0 end
    local score = 0
    score = score + (s.titles or 0) * 12
    score = score + (s.mvps or 0) * 10
    score = score + (s.allStars or 0) * 5
    score = score + math.min(30, (s.totalPoints or 0) / 400)
    score = score + math.min(15, (s.fame or 0) / 200)
    score = score + math.min(10, (Career.getOverall() - 50) / 5)
    if score < 0 then score = 0 end
    if score > 100 then score = 100 end
    return math.floor(score + 0.5)
end

--- 生涯总评文案
---@return string
function Career.careerVerdict()
    local score = Career.careerScore()
    if score >= 85 then return "历史级别：你的名字会被刻在球馆穹顶。" end
    if score >= 65 then return "名人堂成员：一个值得被讲述的职业生涯。" end
    if score >= 45 then return "全明星级别：你在联盟里留下了自己的印记。" end
    if score >= 25 then return "合格首发：稳定而体面的职业生涯。" end
    return "角色球员：至少，你认真打过每一场球。"
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

    -- 总冠军：由季后赛结果决定（此前是 math.random() < 0.35 的纯掷骰）
    local Schedule = require("Core.Schedule")
    local po = s.playoff
    if po and po.champion then
        s.titles = s.titles + 1
        table.insert(s.honors, string.format("第%d赛季 总冠军", seasonNo))
        table.insert(out, "★★★ 夺得总冠军！")
        Career.addFame(1500)
    elseif po then
        -- 打进季后赛但没夺冠：给与战绩相称的荣誉
        local wins, losses = Schedule.record(s)
        if po.round == "final" then
            table.insert(out, string.format("总决赛惜败，与冠军擦肩而过（常规赛 %d 胜 %d 负）。", wins, losses))
            Career.addFame(400)
        else
            table.insert(out, string.format("止步半决赛（常规赛 %d 胜 %d 负）。", wins, losses))
        end
    elseif s.playoffResult == "regular" then
        local wins, losses = Schedule.record(s)
        table.insert(out, string.format("常规赛 %d 胜 %d 负，未能进入季后赛。", wins, losses))
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

    -- 代言签约：人气越高可签的品牌档位越高，且年薪随人气线性放大。
    -- 这是「人气」这一资源的核心出口——人气不再是死资源，每一点都会持续变现。
    if s.fame >= Career.endorseFameGate() then
        local tierIdx = Career.endorseTierOf(s.fame)
        local tier = Config.ECONOMY.endorseTiers[tierIdx]
        -- 已有代言：只做「升档」判定（不重复堆叠份数，避免后期收入爆炸）
        local currentTier = s.endorseTier or 0
        if tierIdx > currentTier then
            local brand = tier.brands[math.random(1, #tier.brands)] or "运动饮料"
            local pay = Career.calcEndorsePay(tier, s.fame)
            -- 升档时替换旧代言（旧合约让位给更大的牌子）
            s.endorsements = {}
            Career.addEndorsement(brand, pay, 2)
            s.endorseTier = tierIdx
            if currentTier == 0 then
                table.insert(out, string.format("签下「%s」代言，每赛季 %d 万。", brand, pay))
            else
                table.insert(out, string.format("★ 代言升级为「%s」，每赛季 %d 万！", brand, pay))
                Career.addFame(200)
            end
        elseif #(s.endorsements or {}) == 0 then
            -- 兜底：档位没变但代言到期了，按当前档位续一份
            local brand = tier.brands[math.random(1, #tier.brands)] or "运动饮料"
            local pay = Career.calcEndorsePay(tier, s.fame)
            Career.addEndorsement(brand, pay, 2)
            table.insert(out, string.format("续签「%s」代言，每赛季 %d 万。", brand, pay))
        end
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

    -- 季后赛、赛程与时间线归档，下赛季开始时重新生成
    s.playoff = nil
    s.playoffResult = nil
    s.schedule = nil
    s.timeline = nil

    print(string.format("[Career] 赛季结算完成，场均 %.1f 分，荣誉 %d 项", ppg, #s.honors))
    return out
end

--- 常规赛打完后，构建季后赛（赛季最后一周结束时调用）
---@return table|nil
function Career.startPlayoff()
    local s = Career.state
    if not s then return nil end
    local Schedule = require("Core.Schedule")
    local po = Schedule.buildPlayoff(s)
    if po then
        Career.addLog(string.format("【%s】对手：%s", Schedule.ROUND_NAMES[po.round] or "季后赛", po.opponent))
    else
        Career.addLog("常规赛结束，未能进入季后赛。")
    end
    return po
end

-- ============================================================================
-- 存档 / 读档
-- ============================================================================

--- 把内容写到指定文件
---@param path string
---@param content string
---@return boolean
local function writeFile(path, content)
    local file = File(path, FILE_WRITE)
    if not file:IsOpen() then
        print("[Career] 写入失败：无法打开 " .. path)
        return false
    end
    file:WriteString(content)
    -- 先落盘再关闭，减少掉电/崩溃时丢数据的窗口
    file:Flush()
    file:Close()
    return true
end

--- 读取文件内容，失败返回 nil
---@param path string
---@return string|nil
local function readFile(path)
    local file = File(path, FILE_READ)
    if not file:IsOpen() then return nil end
    local raw = file:ReadString()
    file:Close()
    return raw
end

--- 解析存档文本，失败返回 nil
---@param raw string|nil
---@return CareerState|nil
local function decodeState(raw)
    if not raw or raw == "" then return nil end
    local ok, data = pcall(cjson.decode, raw)
    if not ok or type(data) ~= "table" then return nil end
    ---@type CareerState
    local state = data
    -- 存档必须能认出是哪个球员，否则视为无效
    if type(state.name) ~= "string" or state.name == "" then return nil end
    return state
end

--- 保存生涯进度
--- 采用「写临时文件 → 备份旧档 → 原子替换」三步，任何一步失败都不会破坏现有存档
---@return boolean
function Career.save()
    local s = Career.state
    if not s then return false end

    local encoded = cjson.encode(s)
    if not encoded or encoded == "" then
        print("[Career] 存档失败：序列化结果为空")
        return false
    end

    -- 1. 先完整写入临时文件（此时正式存档仍是上一个好版本）
    if not writeFile(Config.SAVE_TMP_FILE, encoded) then
        return false
    end

    -- 2. 把当前正式存档轮换为备份（供读档兜底）
    if fileSystem:FileExists(Config.SAVE_FILE) then
        fileSystem:Copy(Config.SAVE_FILE, Config.SAVE_BAK_FILE)
    end

    -- 3. 原子替换：临时文件改名为正式存档
    if not fileSystem:Rename(Config.SAVE_TMP_FILE, Config.SAVE_FILE) then
        print("[Career] 存档失败：替换正式存档失败")
        return false
    end

    print("[Career] 存档成功")
    return true
end

--- 是否存在存档
---@return boolean
function Career.hasSave()
    return fileSystem:FileExists(Config.SAVE_FILE)
end

--- 读取存档
--- 正式存档损坏时自动回退到上一次的备份
---@return CareerState|nil
function Career.load()
    if not Career.hasSave() then return nil end

    ---@type CareerState|nil
    local state = decodeState(readFile(Config.SAVE_FILE))
    if not state and fileSystem:FileExists(Config.SAVE_BAK_FILE) then
        print("[Career] 正式存档损坏，尝试读取备份")
        state = decodeState(readFile(Config.SAVE_BAK_FILE))
        if state then
            print("[Career] 已从备份恢复存档")
        end
    end
    if not state then
        print("[Career] 存档损坏且无可用备份，已忽略")
        return nil
    end

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
    if state.focusCharges == nil then state.focusCharges = 0 end
    if state.actionDoublePending == nil then state.actionDoublePending = false end
    if state.actionDoneKey == nil then state.actionDoneKey = "" end
    if state.pickTeamCredit == nil then state.pickTeamCredit = false end
    if state.timeline == nil then state.timeline = nil end
    if state.timelineSeason == nil then state.timelineSeason = 0 end
    if state.storyMemory == nil then state.storyMemory = "" end
    if state.storyPaths == nil then state.storyPaths = {} end
    if state.storyHistory == nil then state.storyHistory = {} end
    if state.postStoryDone == nil then state.postStoryDone = false end
    Career.state = state
    -- 读档后补齐本周依赖的赛程与时间线（旧存档没有这两个字段）
    ensureSeasonData(state)
    print("[Career] 读档成功：" .. tostring(state.name))
    return state
end

--- 删除存档（连同临时文件与备份一起清掉，否则备份会让已删存档复活）
function Career.clearSave()
    fileSystem:Delete(Config.SAVE_FILE)
    fileSystem:Delete(Config.SAVE_TMP_FILE)
    fileSystem:Delete(Config.SAVE_BAK_FILE)
    Career.state = nil
end

return Career
