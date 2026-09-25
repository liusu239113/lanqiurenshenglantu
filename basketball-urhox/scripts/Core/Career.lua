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

--- 创建一名新球员
---@param name string
---@param positionId string
---@param hometown string
---@return CareerState
function Career.createPlayer(name, positionId, hometown)
    local posDef = Career.getPositionDef(positionId)

    -- 初始属性 = 位置倾向 + 少量随机浮动
    ---@type table<string, number>
    local attrs = {}
    for i = 1, #Config.ATTRS do
        local def = Config.ATTRS[i]
        local base = posDef.focus[def.key] or 25
        attrs[def.key] = clamp(base + math.random(-4, 4), 1, Config.ATTR_MAX)
    end

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
        team = Teams.makeTeamName(stage.teamPrefix, hometown, nil),
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
    }

    -- 初始潜力上限：各项 99（广告可突破）
    for i = 1, #Config.ATTRS do
        local def = Config.ATTRS[i]
        state.potential[def.key] = Config.ATTR_MAX
    end

    Career.state = state
    Career.addLog(string.format("生涯起步：%s，%s，司职%s。", state.name, hometown, posDef.name))
    print(string.format("[Career] 创建球员 %s | %s | 球队 %s", state.name, posDef.name, state.team))
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

--- 按年龄与阶段重新评估球队
function Career.refreshTeam()
    local s = Career.state
    if not s then return end
    local stage = Career.getStage()
    local tier = 1
    if stage.id == "pro" or stage.id == "legend" then
        local ov = Career.getOverall()
        if ov >= 80 then tier = 3
        elseif ov >= 70 then tier = 2 end
    end
    s.team = Teams.makeTeamName(stage.teamPrefix, s.hometown, tier)
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

--- 用经验池兑换属性点（1 点 = 100 经验）
---@param key string
---@return boolean, string
function Career.spendExpForAttr(key)
    local s = Career.state
    if not s then return false, "无生涯数据" end
    local COST = 100
    if (s.expPool or 0) < COST then
        return false, string.format("经验不足（需 %d，现有 %d）", COST, s.expPool or 0)
    end
    local cap = Career.getPotential(key)
    if (s.attrs[key] or 0) >= cap then
        return false, "该项已达潜力上限，需先突破潜力"
    end
    s.expPool = s.expPool - COST
    local real = Career.addAttr(key, 1)
    if real <= 0 then
        s.expPool = s.expPool + COST   -- 未生效则退还
        return false, "该项已达上限"
    end
    return true, "属性 +1"
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
---@return string 结果描述文本
function Career.applyAction(actionId)
    local s = Career.state
    if not s then return "" end

    local cost = Config.ACTION_COST[actionId] or 0
    local gain = Config.ACTION_GAIN[actionId] or {}

    -- 体能结算（rest 的 cost 为负 = 恢复）
    Career.addStamina(-cost)

    ---@type string[]
    local parts = {}
    local mul = growthMul(s.age)

    -- 训练经验加成（广告「训练经验 ×1.5」）
    if s.boostActive then
        mul = mul * 1.5
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

    -- 所有训练都累积经验池
    if actionId ~= "rest" and actionId ~= "media" then
        Career.addExp(18)
        table.insert(parts, "经验 +18")
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

    -- 合同与薪资
    local baseSalary = math.floor((ov - 40) * (ov - 40) / 8)
    if baseSalary < 5 then baseSalary = 5 end
    s.salary = baseSalary
    Career.addMoney(s.salary)
    table.insert(out, string.format("续约：年薪 %d 万。", s.salary))

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
