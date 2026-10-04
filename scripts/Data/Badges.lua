-- ============================================================================
-- Badges — 徽章（生涯里程碑被动加成）
--
-- 设计目的：
--   1. 给"长期坚持某条路线"提供可见回报（此前只有数值增长，没有身份感）
--   2. 让训练/比赛/商业活动之间形成取舍：徽章分路线，不可能全拿
--   3. 复用此前完全没被使用的 state.skillPoints 概念，改为徽章点数
--      （每解锁 1 枚徽章 +1 点，用于强化已解锁徽章）
--
-- 结构：每枚徽章 = 解锁条件 + 被动加成 + 可强化等级
--
-- 路线（track）与数据来源：
--   scoring       生涯累计得分              state.totalPoints
--   playmaking    生涯累计助攻              state.totalAssists
--   defense       生涯累计抢断 + 盖帽        state.totalSteals / state.totalBlocks
--   athletic      未受伤完赛场次（耐久线）    state.cleanGames
--   iq            累计录像分析次数           state.iqSessions
--   fame          当前人气                  state.fame
--   titles        总冠军次数                state.titles
--   allStars      全明星次数                state.allStars
--   games         生涯出场数                state.games
--   seasonPoints  生涯累计得分（总分线）      state.totalPoints
--   mvps          常规赛 MVP 次数           state.mvps
--   money         当前资金（万）             state.money
--   morale        当前士气（0-100）          state.morale
--   ppg           生涯场均得分              totalPoints / max(1, games)
--   exp           生涯累计获得经验           state.expTotal   ← Career.lua 待补字段
--   endorse       代言合约数量              #state.endorsements
--   endorseTier   代言档位（0 = 未签）        state.endorseTier
--   talent        建角天赋卡数量            #state.talentCards
--   injury        生涯累计受伤次数           state.injuryCount ← Career.lua 待补字段
--   clutch        生涯关键球命中次数         state.clutchShots ← Career.lua 待补字段
--
-- 加成 key 说明：
--   属性类 scoring / playmaking / defense / athletic / iq
--     —— 已被 Career.attrTotal（影响薪资、球队档次、生涯评分）与 Injury.recomputeRisk 消费
--   资源类 fameGain / moneyGain / moraleMax / staminaMax
--     —— 目前只有徽章墙做展示，尚无消费方，接线方案见文件末尾"接线备忘"
-- ============================================================================

local Badges = {}

---@class BadgeDef
---@field id string
---@field name string
---@field desc string
---@field icon string|nil      可选图标（目前用单个汉字兜底显示）
---@field track string         所属路线：见文件头 track 表
---@field need number          解锁阈值（含义由 track 决定）
---@field bonus table<string, number>  每级被动加成
---@field maxLevel number

---@type BadgeDef[]
Badges.LIST = {
    -- ======================= 得分线（scoring） =======================
    { id = "scorer",   name = "得分手",   icon = "得", track = "scoring",    need = 400,
      desc = "生涯累计得分达到 400", bonus = { scoring = 2 }, maxLevel = 3 },
    { id = "sniper",   name = "神射手",   icon = "射", track = "scoring",    need = 1200,
      desc = "生涯累计得分达到 1200", bonus = { scoring = 3 }, maxLevel = 3 },
    { id = "iso_master", name = "进攻万花筒", icon = "花", track = "scoring", need = 3000,
      desc = "生涯累计得分达到 3000", bonus = { scoring = 3, playmaking = 1 }, maxLevel = 3 },
    { id = "unguardable", name = "无解单打", icon = "解", track = "scoring", need = 6500,
      desc = "生涯累计得分达到 6500", bonus = { scoring = 3, athletic = 1 }, maxLevel = 5 },

    -- ======================= 组织线（playmaking） =======================
    { id = "floor_gen", name = "场上教练", icon = "智", track = "playmaking", need = 250,
      desc = "生涯累计助攻达到 250", bonus = { playmaking = 2 }, maxLevel = 3 },
    { id = "pass_master", name = "传球大师", icon = "传", track = "playmaking", need = 700,
      desc = "生涯累计助攻达到 700", bonus = { playmaking = 3 }, maxLevel = 3 },
    { id = "alley_oop", name = "空接之城", icon = "空", track = "playmaking", need = 1500,
      desc = "生涯累计助攻达到 1500", bonus = { playmaking = 3, athletic = 1 }, maxLevel = 3 },
    { id = "offense_brain", name = "进攻大脑", icon = "脑", track = "playmaking", need = 3000,
      desc = "生涯累计助攻达到 3000", bonus = { playmaking = 3, iq = 2 }, maxLevel = 5 },

    -- ======================= 防守线（defense） =======================
    { id = "stopper",  name = "防守铁闸", icon = "闸", track = "defense",    need = 120,
      desc = "生涯累计抢断+盖帽达到 120", bonus = { defense = 2 }, maxLevel = 3 },
    { id = "rim_guard", name = "禁区守护神", icon = "禁", track = "defense", need = 300,
      desc = "生涯累计抢断+盖帽达到 300", bonus = { defense = 3 }, maxLevel = 3 },
    { id = "steal_king", name = "抢断之王", icon = "断", track = "defense",  need = 550,
      desc = "生涯累计抢断+盖帽达到 550", bonus = { defense = 3, athletic = 1 }, maxLevel = 3 },
    { id = "all_defense", name = "防守一阵", icon = "阵", track = "defense", need = 900,
      desc = "生涯累计抢断+盖帽达到 900", bonus = { defense = 3, athletic = 1 }, maxLevel = 5 },

    -- ======================= 体能 / 耐久线（athletic：未受伤完赛） =======================
    { id = "ironman",  name = "铁人",     icon = "铁", track = "athletic",   need = 30,
      desc = "完整出战 30 场比赛且未受伤", bonus = { athletic = 2, staminaMax = 3 }, maxLevel = 3 },
    { id = "steel_body", name = "钢铁之躯", icon = "钢", track = "athletic", need = 60,
      desc = "未受伤完赛达到 60 场", bonus = { athletic = 3, staminaMax = 5 }, maxLevel = 3 },
    { id = "unbreakable", name = "不坏金身", icon = "身", track = "athletic", need = 95,
      desc = "未受伤完赛达到 95 场", bonus = { athletic = 3, staminaMax = 8 }, maxLevel = 3 },
    { id = "immortal", name = "不朽之躯", icon = "朽", track = "athletic",  need = 130,
      desc = "未受伤完赛达到 130 场", bonus = { athletic = 3, staminaMax = 10, moraleMax = 3 }, maxLevel = 5 },

    -- ======================= 意识线（iq：录像分析） =======================
    { id = "student",  name = "录像狂人", icon = "录", track = "iq",         need = 40,
      desc = "累计完成 40 次录像分析", bonus = { iq = 2 }, maxLevel = 3 },
    { id = "tape_master", name = "战术大师", icon = "术", track = "iq",      need = 80,
      desc = "累计完成 80 次录像分析", bonus = { iq = 3 }, maxLevel = 3 },
    { id = "court_general", name = "场上军师", icon = "军", track = "iq",    need = 140,
      desc = "累计完成 140 次录像分析", bonus = { iq = 3, playmaking = 1 }, maxLevel = 3 },
    { id = "bball_sage", name = "篮球智者", icon = "哲", track = "iq",       need = 200,
      desc = "累计完成 200 次录像分析", bonus = { iq = 3, playmaking = 2 }, maxLevel = 3 },

    -- ======================= 出场耐久线（games） =======================
    { id = "rotation", name = "站稳脚跟", icon = "稳", track = "games",      need = 20,
      desc = "生涯出场达到 20 场", bonus = { athletic = 1, moraleMax = 2 }, maxLevel = 3 },
    { id = "veteran",  name = "百战老兵", icon = "战", track = "games",      need = 60,
      desc = "生涯出场达到 60 场", bonus = { athletic = 2, iq = 1 }, maxLevel = 3 },
    { id = "evergreen", name = "常青树",  icon = "青", track = "games",      need = 120,
      desc = "生涯出场达到 120 场", bonus = { athletic = 3, staminaMax = 5, moraleMax = 3 }, maxLevel = 3 },

    -- ======================= 生涯数据线（seasonPoints：生涯总分） =======================
    -- 注：本 track 按需求读 state.totalPoints（与 scoring 同源），用于高段位总分里程碑
    { id = "five_k",   name = "五千分先生", icon = "千", track = "seasonPoints", need = 5000,
      desc = "生涯累计得分达到 5000", bonus = { scoring = 2, fameGain = 5 }, maxLevel = 3 },
    { id = "ten_k",    name = "万分传奇", icon = "万", track = "seasonPoints", need = 10000,
      desc = "生涯累计得分达到 10000", bonus = { scoring = 3, fameGain = 10 }, maxLevel = 5 },

    -- ======================= 生涯数据线（ppg：生涯场均） =======================
    { id = "steady_gunner", name = "比赛型选手", icon = "赛", track = "ppg", need = 16,
      desc = "生涯场均得分达到 16 分", bonus = { scoring = 2, moraleMax = 3 }, maxLevel = 3 },
    { id = "ppg_machine", name = "场均机器", icon = "机", track = "ppg",     need = 26,
      desc = "生涯场均得分达到 26 分", bonus = { scoring = 3 }, maxLevel = 3 },

    -- ======================= 荣誉线（mvps / titles / allStars） =======================
    { id = "mvp",      name = "最有价值", icon = "值", track = "mvps",       need = 1,
      desc = "至少当选 1 次常规赛 MVP", bonus = { scoring = 2, fameGain = 8 }, maxLevel = 3 },
    { id = "mvp_king", name = "三度封王", icon = "霸", track = "mvps",       need = 3,
      desc = "至少 3 次当选常规赛 MVP", bonus = { scoring = 3, fameGain = 15 }, maxLevel = 5 },
    { id = "champ",    name = "冠军之心", icon = "冠", track = "titles",     need = 1,
      desc = "至少夺得 1 次总冠军", bonus = { moraleMax = 5, scoring = 1 }, maxLevel = 3 },
    { id = "dynasty",  name = "王朝基石", icon = "基", track = "titles",     need = 3,
      desc = "至少夺得 3 次总冠军", bonus = { scoring = 2, playmaking = 2, moraleMax = 5 }, maxLevel = 3 },
    { id = "dynasty_maker", name = "王朝缔造者", icon = "缔", track = "titles", need = 6,
      desc = "至少夺得 6 次总冠军", bonus = { scoring = 3, iq = 2, fameGain = 10 }, maxLevel = 3 },
    { id = "allstar",  name = "全明星",   icon = "全", track = "allStars",   need = 2,
      desc = "至少 2 次入选全明星", bonus = { fameGain = 10, moraleMax = 3 }, maxLevel = 3 },
    { id = "allstar_legend", name = "全明星常客", icon = "常", track = "allStars", need = 6,
      desc = "至少 6 次入选全明星", bonus = { fameGain = 15, scoring = 2 }, maxLevel = 3 },

    -- ======================= 人气与商业线（fame / money / endorse） =======================
    { id = "famous_low", name = "小有名气", icon = "名", track = "fame",     need = 300,
      desc = "生涯累计人气达到 300", bonus = { fameGain = 5, moraleMax = 2 }, maxLevel = 3 },
    { id = "city_hero", name = "城市英雄", icon = "城", track = "fame",      need = 1000,
      desc = "生涯累计人气达到 1000", bonus = { fameGain = 8, moraleMax = 3 }, maxLevel = 3 },
    { id = "star",     name = "全城偶像", icon = "星", track = "fame",       need = 2000,
      desc = "生涯累计人气达到 2000", bonus = { fameGain = 10 }, maxLevel = 3 },
    { id = "icon",     name = "时代符号", icon = "王", track = "fame",       need = 6000,
      desc = "生涯累计人气达到 6000", bonus = { fameGain = 20, moneyGain = 10 }, maxLevel = 3 },
    { id = "first_gold", name = "第一桶金", icon = "金", track = "money",    need = 300,
      desc = "生涯资金累积到 300 万", bonus = { moneyGain = 5 }, maxLevel = 3 },
    { id = "rich_man", name = "千万身家", icon = "财", track = "money",      need = 1000,
      desc = "生涯资金累积到 1000 万", bonus = { moneyGain = 10 }, maxLevel = 3 },
    { id = "tycoon",   name = "商业帝国", icon = "商", track = "money",      need = 2500,
      desc = "生涯资金累积到 2500 万", bonus = { moneyGain = 15, fameGain = 5 }, maxLevel = 5 },
    { id = "endorser", name = "代言人",   icon = "签", track = "endorse",    need = 1,
      desc = "签下 1 份代言合约", bonus = { moneyGain = 8, fameGain = 5 }, maxLevel = 3 },
    { id = "brand_pet", name = "品牌宠儿", icon = "牌", track = "endorseTier", need = 3,
      desc = "代言档位达到 3（人气 1400 解锁）", bonus = { fameGain = 10, moneyGain = 10 }, maxLevel = 3 },

    -- ======================= 成长线（exp / talent） =======================
    { id = "diligent", name = "勤能补拙", icon = "勤", track = "exp",        need = 800,
      desc = "生涯累计获得经验达到 800", bonus = { iq = 1, athletic = 1 }, maxLevel = 3 },
    { id = "sweat_medal", name = "汗水勋章", icon = "汗", track = "exp",     need = 2500,
      desc = "生涯累计获得经验达到 2500", bonus = { athletic = 2, iq = 1 }, maxLevel = 3 },
    { id = "grind_king", name = "训练狂人", icon = "狂", track = "exp",      need = 4500,
      desc = "生涯累计获得经验达到 4500", bonus = { athletic = 3, scoring = 1, defense = 1 }, maxLevel = 5 },
    { id = "gifted",   name = "天赋异禀", icon = "赋", track = "talent",     need = 1,
      desc = "建角时选中 1 张天赋卡", bonus = { scoring = 1, playmaking = 1, defense = 1, athletic = 1, iq = 1 }, maxLevel = 3 },
    { id = "chosen_style", name = "天选之姿", icon = "选", track = "talent", need = 3,
      desc = "建角时选满 3 张天赋卡", bonus = { scoring = 2, playmaking = 2, defense = 2, athletic = 2, iq = 2 }, maxLevel = 3 },

    -- ======================= 耐久 / 风格线（injury） =======================
    { id = "resilient", name = "百折不挠", icon = "折", track = "injury",    need = 1,
      desc = "生涯遭遇 1 次伤病后仍坚持出战", bonus = { athletic = 2, moraleMax = 3 }, maxLevel = 3 },
    { id = "scarred",  name = "伤痕勋章", icon = "痕", track = "injury",     need = 3,
      desc = "生涯累计受伤 3 次仍坚持出战", bonus = { athletic = 3, iq = 1 }, maxLevel = 3 },
    { id = "rebirth",  name = "浴火重生", icon = "焰", track = "injury",     need = 6,
      desc = "生涯累计受伤 6 次仍坚持出战", bonus = { athletic = 3, moraleMax = 8 }, maxLevel = 3 },

    -- ======================= 风格线（clutch：关键球） =======================
    { id = "big_heart", name = "大心脏",  icon = "心", track = "clutch",     need = 1,
      desc = "命中 1 次关键球（最后时刻反超/追平）", bonus = { scoring = 2, moraleMax = 3 }, maxLevel = 3 },
    { id = "mr_clutch", name = "关键先生", icon = "键", track = "clutch",    need = 5,
      desc = "生涯命中 5 次关键球", bonus = { scoring = 3, iq = 1 }, maxLevel = 3 },
    { id = "cold_blooded", name = "冷血杀手", icon = "冷", track = "clutch", need = 12,
      desc = "生涯命中 12 次关键球", bonus = { scoring = 3, moraleMax = 5 }, maxLevel = 5 },

    -- ======================= 风格线（morale：更衣室） =======================
    { id = "high_spirit", name = "斗志昂扬", icon = "志", track = "morale",  need = 80,
      desc = "士气达到 80", bonus = { moraleMax = 5, scoring = 1 }, maxLevel = 3 },
    { id = "iron_will", name = "铁血精神", icon = "魂", track = "morale",    need = 95,
      desc = "士气达到 95", bonus = { moraleMax = 8, iq = 1, defense = 1 }, maxLevel = 3 },
}

--- 徽章索引（存档里可能残留已下线的 id，取值一律判空）
---@type table<string, BadgeDef|nil>
Badges.BY_ID = {}
for i = 1, #Badges.LIST do
    Badges.BY_ID[Badges.LIST[i].id] = Badges.LIST[i]
end

-- ---------------------------------------------------------------------------
-- 进度计算
-- ---------------------------------------------------------------------------

--- 进度读取所需的扩展字段（Career.lua 尚未在 CareerState 里声明的部分在此补齐；
--- 缺字段时一律按 0 处理，保证旧存档可读）
---@class BadgeProgressState : CareerState
---@field expTotal number|nil      生涯累计获得经验（只增不减，与可消费的 expPool 区分）
---@field injuryCount number|nil   生涯累计受伤次数
---@field clutchShots number|nil  生涯关键球命中次数（最后时刻反超/追平球）
---@field endorseTier number|nil  当前代言档位（0 = 未签，1 起为已签档位）

--- 取某条路线的当前进度值
---@param state CareerState
---@param track string
---@return number
function Badges.progress(state, track)
    if not state then return 0 end
    local s = state --[[@as BadgeProgressState]]

    if track == "scoring" then
        return s.totalPoints or 0
    elseif track == "playmaking" then
        return s.totalAssists or 0
    elseif track == "defense" then
        return (s.totalSteals or 0) + (s.totalBlocks or 0)
    elseif track == "athletic" then
        return s.cleanGames or 0
    elseif track == "iq" then
        return s.iqSessions or 0
    elseif track == "fame" then
        return s.fame or 0
    elseif track == "titles" then
        return s.titles or 0
    elseif track == "allStars" then
        return s.allStars or 0
    elseif track == "games" then
        return s.games or 0
    elseif track == "seasonPoints" then
        -- 与需求一致：读生涯累计得分（高段位总分里程碑）
        return s.totalPoints or 0
    elseif track == "mvps" then
        return s.mvps or 0
    elseif track == "money" then
        return s.money or 0
    elseif track == "morale" then
        return s.morale or 0
    elseif track == "ppg" then
        return (s.totalPoints or 0) / math.max(1, s.games or 0)
    elseif track == "exp" then
        return s.expTotal or 0
    elseif track == "endorse" then
        return #(s.endorsements or {})
    elseif track == "endorseTier" then
        return s.endorseTier or 0
    elseif track == "talent" then
        return #(s.talentCards or {})
    elseif track == "injury" then
        return s.injuryCount or 0
    elseif track == "clutch" then
        return s.clutchShots or 0
    end
    return 0
end

--- 徽章是否已解锁
---@param state CareerState
---@param id string
---@return boolean
function Badges.isUnlocked(state, id)
    if not state or not state.badges then return false end
    return state.badges[id] ~= nil
end

--- 徽章当前等级（未解锁 = 0）
---@param state CareerState
---@param id string
---@return number
function Badges.level(state, id)
    if not state or not state.badges then return 0 end
    return state.badges[id] or 0
end

-- ---------------------------------------------------------------------------
-- 解锁检查（每周 / 每次数据变化后调用）
-- ---------------------------------------------------------------------------

--- 检查并解锁新徽章
---@param state CareerState
---@return string[] 本次新解锁的徽章 id
function Badges.check(state)
    ---@type string[]
    local unlocked = {}
    if not state then return unlocked end
    state.badges = state.badges or {}

    for i = 1, #Badges.LIST do
        local def = Badges.LIST[i]
        if state.badges[def.id] == nil then
            if Badges.progress(state, def.track) >= def.need then
                state.badges[def.id] = 1
                -- 每解锁一枚徽章，奖励 1 点徽章点数
                state.skillPoints = (state.skillPoints or 0) + 1
                table.insert(unlocked, def.id)
                print(string.format("[Badges] 解锁徽章：%s", def.name))
            end
        end
    end
    return unlocked
end

--- 强化徽章（消耗 skillPoints）
---@param state CareerState
---@param id string
---@return boolean, string
function Badges.upgrade(state, id)
    local def = Badges.BY_ID[id]
    if not def then return false, "徽章不存在" end
    if not state or not state.badges then return false, "无存档" end

    local lv = state.badges[id]
    if lv == nil then return false, "徽章尚未解锁" end
    if lv >= def.maxLevel then return false, "已达最高等级" end

    local cost = lv  -- 1→2 花 1 点，2→3 花 2 点，以此类推
    if (state.skillPoints or 0) < cost then
        return false, string.format("徽章点数不足（需 %d，现有 %d）", cost, state.skillPoints or 0)
    end

    state.skillPoints = state.skillPoints - cost
    state.badges[id] = lv + 1
    print(string.format("[Badges] %s 强化至 Lv.%d", def.name, lv + 1))
    return true, string.format("%s 强化至 Lv.%d", def.name, lv + 1)
end

-- ---------------------------------------------------------------------------
-- 加成汇总
-- ---------------------------------------------------------------------------

--- 汇总所有已解锁徽章的被动加成
---@param state CareerState
---@return table<string, number>
function Badges.totalBonus(state)
    ---@type table<string, number>
    local sum = {}
    if not state or not state.badges then return sum end

    for id, lv in pairs(state.badges) do
        local def = Badges.BY_ID[id]
        if def then
            for k, v in pairs(def.bonus) do
                sum[k] = (sum[k] or 0) + v * lv
            end
        end
    end
    return sum
end

--- 取单项加成（供 Career 计算属性时叠加）
---@param state CareerState
---@param key string
---@return number
function Badges.bonusOf(state, key)
    local b = Badges.totalBonus(state)
    return b[key] or 0
end

-- ---------------------------------------------------------------------------
-- 接线备忘（本文件不改动其他模块，以下为 Career / Match / Injury 维护者的接入点）
--
-- 1) 属性类（scoring / playmaking / defense / athletic / iq）：
--    已通过 Career.attrTotal → Career.attrAverage → Career.getOverall 生效，
--    影响薪资、球队档次、生涯评分；但 Match.lua / MatchText.lua / MiniGame
--    仍直接读 state.attrs，若要影响比赛内表现，请改用 Career.effectiveAttr(key)
--    （该函数目前无调用方）。注意 Injury.recomputeRisk 已单独叠加 athletic 徽章，
--    改用 effectiveAttr 时不要重复计算。
--    另：defense track 读 totalSteals + totalBlocks，但 MatchStats 没有 blocks 字段
--    （Match.lua:183 的 stats 表只有 steals/turnovers），s.stats.blocks 恒为 nil，
--    所以总盖帽恒为 0；文字直播（MatchText.finish）也完全不累加 steals/blocks。
--    若要"抢断+盖帽"名副其实，需要在 Match 里补 blocks 统计并在 MatchText 里补两项累加。
--
-- 2) fameGain（当前无消费方）：在 Career.addFame 的正向增量上按百分比放大
--      local b = Badges.bonusOf(s, "fameGain")
--      if delta > 0 and b > 0 then delta = delta + math.floor(delta * b / 100) end
--
-- 3) moneyGain（当前无消费方）：同上，接在 Career.addMoney 的正向增量上
--    （年薪、代言收入、抽奖收入都走这个入口）。
--
-- 4) moraleMax（当前无消费方）：把上限从 100 改为 100 + 加成，
--    需同时改 Career.addMorale、Match.lua:450、MatchText.lua:425、
--    Injury.lua:138/153 里的 math.min(100, ...)。
--
-- 5) staminaMax（当前无消费方）：把上限从 100 改为 100 + 加成，
--    需改 Career.addStamina 与 Config.INIT.stamina 的初始化/恢复上限。
--
-- 6) 新 track 依赖的新字段（Career.lua 侧累加，本文件只做安全读取）：
--    expTotal     —— 在 Career.addExp 里 `s.expTotal = (s.expTotal or 0) + amount`
--    injuryCount  —— 在 Injury.apply 里 `state.injuryCount = (state.injuryCount or 0) + 1`
--    clutchShots  —— 在 Match.finish / MatchText.finish 结算处，对"最后时刻反超/追平球"
--                    `state.clutchShots = (state.clutchShots or 0) + 1`
-- ---------------------------------------------------------------------------

return Badges
