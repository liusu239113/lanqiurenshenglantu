-- ============================================================================
-- Rival — 宿敌系统（《篮途》核心玩法模块）
--
-- 设计意图：
--   一个人打球是没有故事的。玩家需要一个"同位置、同期、会被反复比较"的参照物：
--   输给他会难受，赢回来会痛快，他倒下的那一下你会复杂，很多年后你们会在同一面
--   墙上看到彼此的球衣。宿敌不是随机刷出来的 BOSS，而是一条跟着玩家一起长的曲线。
--
-- 与 Data/SideStory.lua「宿敌线」的关系：
--   支线里的韩彻写的是"很多年里断断续续的几次相遇"，是文学化的长镜头；
--   本模块负责的是一条高频、可量化的宿敌关系——他常驻赛程、每个赛季都会碰上、
--   实力跟着玩家的 overall 走、交手战绩与成长阶段都会被写进生涯数据。
--   两边呼应（同样是同位置的对手、同样会互相研究对方），但人物与事件互不重复。
--
-- 生命周期：
--   1. 玩家进入职业联赛（stageIndex == 4，21 岁）→ Rival.ensure 生成宿敌
--   2. 宿敌球队会被植入本赛季赛程（pinScheduleGame，幂等）
--   3. 每场与宿敌球队的比赛结束后 → 调用方调用 Rival.onMatch 记录战绩并取回剧情卡
--   4. 赛季结束 → 调用方调用 Rival.onSeasonEnd 推进宿敌成长
--
-- 接线说明（本模块只交付 Core/Rival.lua 与 UI/ScreenRival.lua，不改动其它文件）：
--   · 赛程层：可用 Rival.teamName(state) 让宿敌球队周期性出现在赛程里；即便不接，
--     Rival.ensure / Rival.pinSchedule 也会把宿敌战植入本赛季剩余赛程（幂等兜底）。
--   · 比赛层：对阵宿敌球队时用 Rival.matchBoost(state, opponent) 叠加难度（+0~+8）。
--     注意：赛程植入不会改 strength，避免与 matchBoost 重复计数。
--   · 赛后：if opponent == Rival.teamName(state) then local ev = Rival.onMatch(...) end
--     拿到事件卡后按项目既有方式展示（EventSystem.current = ev → ScreenEvent.Build）。
-- ============================================================================

local Config = require("Core.Config")
local Teams = require("Data.Teams")
local Career = require("Core.Career")

local Rival = {}

local A = Config.ART

-- 交手记录保留条数（界面展示最近 5 次）
local HISTORY_KEEP = 5

-- 单赛季实力成长幅度上限：让宿敌"追着玩家长"，而不是一次跳到位
local GROWTH_STEP_MAX = 6

-- 宿敌之战的强度修正（下标 = 成长阶段 1-5），由比赛层通过 Rival.matchBoost 取用
---@type table<number, number>
local BOOST_BY_STAGE = { 3, 5, 6, 7, 8 }

-- 成长阶段标题：媒体叙事里"你们的关系"走到哪一步
---@type table<number, string>
local STAGE_TITLES = { "初遇", "压制", "交锋", "超越", "宿命" }

-- ============================================================================
-- 数据结构
-- ============================================================================

--- 一次交手的记录（玩家视角）
---@class RivalMeeting
---@field season number      赛季
---@field win boolean         玩家是否取胜
---@field myPoints number     玩家本场得分
---@field power number        当时宿敌的实力（用于回看"他那会儿有多强"）

--- 宿敌数据（存在 state.rival，随存档一起序列化）
---@class RivalDef
---@field name string              姓名（原创中文名，2-3 字）
---@field pos string               场上位置 id（与玩家同位置 = 直接对位）
---@field team string              所在球队（职业球队池，永不与玩家同队）
---@field power number             当前实力 40-97，随赛季跟着玩家成长
---@field stage number             成长阶段 1-5（初遇/压制/交锋/超越/宿命）
---@field wins number              交手战绩：玩家胜场
---@field losses number            交手战绩：玩家负场
---@field met boolean              是否已经交过手
---@field formedSeason number      结怨赛季（宿敌生成的那一季）
---@field seasonTag number         首次交手的赛季（0 = 尚未交手）
---@field history RivalMeeting[]   最近 HISTORY_KEEP 次交手
---@field style string             球风标签（文案用）
---@field origin string            来历（文案用）
---@field lastGrowthSeason number  上一次赛季成长的赛季（幂等保护）
---@field lastGrowthStep number    上一次赛季的实力变化量（赛季文案用）
---@field lastSummarySeason number 上一次输出赛季文案的赛季（幂等保护）
---@field injurySeason number|nil  受伤赛季（剧情「他倒下的那一下」）
---@field injuredUntil number|nil  伤停到哪个赛季（该赛季内他都不上场）
---@field returnPending boolean    是否待触发「伤愈复出」剧情
---@field absentLoggedSeason number|nil 伤停缺阵提示已记账的赛季

--- 宿敌候选人的性格模板（抽到谁决定这段宿敌关系的气质）
---@class RivalPersona
---@field name string   姓名
---@field style string  球风
---@field origin string 来历

-- ============================================================================
-- 基础工具
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

--- 玩家综合实力（0-99）
--- 正常情况下直接用 Career.getOverall（含徽章加成，与界面显示一致）；
--- 只有传入的 state 不是全局当前生涯时才走本地兜底算法。
---@param state CareerState
---@return number
local function playerOverall(state)
    if Career.state == state then
        return Career.getOverall()
    end
    ---@type number
    local sum = 0
    local attrs = state.attrs or {}
    for i = 1, #Config.ATTRS do
        sum = sum + (attrs[Config.ATTRS[i].key] or 0)
    end
    return math.floor(sum / #Config.ATTRS + 0.5)
end

--- 宿敌是否正在伤停（该赛季内他不会上场）
---@param state CareerState
---@return boolean
local function injuredNow(state)
    local r = state and state.rival
    if type(r) ~= "table" then return false end
    local untilSeason = tonumber(r.injuredUntil)
    if not untilSeason then return false end
    return (state.season or 1) <= untilSeason
end

--- 剧情正文的展示上下文
---@param state CareerState
---@param r RivalDef
---@return table
local function context(state, r)
    return {
        name = r.name or "他",
        team = r.team or "对手球队",
        pos = Career.getPositionDef(r.pos or state.positionId or "SF").name,
        style = r.style or "同位置的对手",
    }
end

--- 替换正文里的 @name / @team / @pos / @style 占位符。
--- 注意：这里不能用 %s —— ScreenEvent 会把 %s 当成"玩家名"去格式化，
--- 而宿敌名字是模块自己抽的，必须在这里替换掉。
---@param text string|nil
---@param c table
---@return string
local function fill(text, c)
    if not text then return "" end
    local out = text
    out = out:gsub("@name", c.name or "他")
    out = out:gsub("@team", c.team or "对手球队")
    out = out:gsub("@pos", c.pos or "同位置")
    out = out:gsub("@style", c.style or "")
    return out
end

--- 从职业球队池里取一个与玩家当前球队不同的队名
---@param state CareerState
---@return string
local function pickTeam(state)
    ---@type string[]
    local pool = {}
    for tier = 1, #Teams.PRO_TEAMS do
        local list = Teams.PRO_TEAMS[tier]
        for i = 1, #list do
            if list[i] ~= (state.team or "") then
                pool[#pool + 1] = list[i]
            end
        end
    end
    if #pool == 0 then return "海州王冠" end
    return pool[math.random(1, #pool)] or "海州王冠"
end

-- ============================================================================
-- 成长阶段
-- ============================================================================

--- 由交手战绩与时间跨度推导"关系阶段"候选值
--- 1 初遇（已结怨未交手） / 2 压制（他赢面在你之上） / 3 交锋（互有胜负）
--- 4 超越（你明显占优） / 5 宿命（缠斗多年）
---@param state CareerState
---@param r RivalDef
---@return number
local function stageCandidate(state, r)
    local wins = r.wins or 0
    local losses = r.losses or 0
    local met = wins + losses
    if met <= 0 then return 1 end

    local span = (state.season or 1) - (r.formedSeason or 1)
    if met >= 8 and (span >= 4 or (state.age or 0) >= 30) then
        return 5
    end
    if wins >= losses + 2 then return 4 end
    if losses > wins then return 2 end
    return 3
end

--- 刷新并写回阶段
--- 阶段只升不降：它是"这段宿敌关系的进展"，不是即时的强弱状态；
--- 一时的胜负起伏交给 power / 交手战绩去表达。
---@param state CareerState
local function refreshStage(state)
    local r = state and state.rival
    if type(r) ~= "table" then return end
    local nextStage = stageCandidate(state, r)
    if nextStage > (r.stage or 1) then
        r.stage = clamp(nextStage, 1, 5)
    end
end

-- ============================================================================
-- 存档兼容
-- ============================================================================

--- 兼容旧存档：补齐缺失字段、修正非法值、避免"宿敌变成队友"的设定冲突
---@param state CareerState
---@return boolean 数据是否可用（false = 需要重新生成）
local function sanitize(state)
    local r = state.rival
    if type(r) ~= "table" then return false end
    if type(r.name) ~= "string" or r.name == "" then return false end

    if type(r.pos) ~= "string" or r.pos == "" then r.pos = state.positionId end
    -- 玩家转会可能恰好转到宿敌所在球队：这时给他换一支，避免"宿敌=队友"
    if type(r.team) ~= "string" or r.team == "" or r.team == state.team then
        r.team = pickTeam(state)
    end

    r.power = clamp(math.floor(tonumber(r.power) or 60), 40, 97)
    r.stage = clamp(math.floor(tonumber(r.stage) or 1), 1, 5)
    r.wins = math.max(0, math.floor(tonumber(r.wins) or 0))
    r.losses = math.max(0, math.floor(tonumber(r.losses) or 0))
    r.met = r.met == true
    r.formedSeason = math.max(1, math.floor(tonumber(r.formedSeason) or state.season or 1))
    r.seasonTag = math.max(0, math.floor(tonumber(r.seasonTag) or 0))
    r.lastGrowthSeason = math.floor(tonumber(r.lastGrowthSeason) or 0)
    r.lastGrowthStep = math.floor(tonumber(r.lastGrowthStep) or 0)
    r.lastSummarySeason = math.floor(tonumber(r.lastSummarySeason) or 0)
    r.returnPending = r.returnPending == true
    r.injuredUntil = tonumber(r.injuredUntil)
    r.injurySeason = tonumber(r.injurySeason)
    r.absentLoggedSeason = tonumber(r.absentLoggedSeason)
    if type(r.style) ~= "string" then r.style = "" end
    if type(r.origin) ~= "string" then r.origin = "" end

    if type(r.history) ~= "table" then r.history = {} end
    while #r.history > HISTORY_KEEP do
        table.remove(r.history, 1)
    end

    return true
end

-- ============================================================================
-- 宿敌候选人（原创角色）
-- 每个人一套球风与来历：抽到谁，这段宿敌关系的气质就不同
-- ============================================================================

---@type RivalPersona[]
local PERSONAS = {
    {
        name = "陆骁",
        style = "第一步快得离谱的左手突破手",
        origin = "南方小城出来的二轮秀，新秀年几乎没上过场，靠一个夏天的对抗训练把自己练成了首发。",
    },
    {
        name = "沈砚",
        style = "中距离像用尺子量过的技术流锋线",
        origin = "体校科班出身，家里两代都是体育老师，打球干净到连垃圾话都带着礼貌。",
    },
    {
        name = "贺鸣",
        style = "落阵地就要背身单打的低位终结者",
        origin = "高中联赛成名，被伤病和体重反复折腾，靠脚步和手感在联盟站住了脚。",
    },
    {
        name = "周凛",
        style = "全联盟最不想对位的外线防守者",
        origin = "选秀报告上写着「没有进攻」，三年后他让所有同位置的人都记住了他的名字。",
    },
    {
        name = "许川",
        style = "跑不死也投不停的射手",
        origin = "落选秀出身，在发展联盟熬了两个赛季，用一场四十分把自己打回了联盟。",
    },
    {
        name = "裴野",
        style = "身体天赋顶级的攻框怪物",
        origin = "被媒体捧为「十年一遇」的天才，进联盟第一年就被拿来和所有人比较。",
    },
}

-- ============================================================================
-- 宿敌剧情事件池
-- 按优先级从高到低排列：一场球最多触发一张，先满足的先生效
-- 事件卡格式与 Data/Events.lua 完全一致（title/body/art/options[{text,response,fx}]）
-- ============================================================================

---@class RivalEventDef
---@field id string        事件 id（同时用作 seenEvents 去重键，once 语义）
---@field title string     标题
---@field art string       插图
---@field body string      正文（可用 @name/@team/@pos/@style 占位）
---@field options table[]  选项 { text, response, fx }
---@field check fun(state: CareerState, r: RivalDef, ctx: table): boolean 触发条件
---@field apply fun(state: CareerState, r: RivalDef)|nil                 触发时的状态变更

---@type RivalEventDef[]
local EVENTS = {
    -- -----------------------------------------------------------------------
    -- 他复出（优先级最高：伤停结束后的第一次交手必须是这一张）
    -- -----------------------------------------------------------------------
    {
        id = "rival_return",
        title = "他回来的那场",
        art = A.evShot,
        body = "缺了大半个赛季之后，@name 在你们主场复出。赛前热身时他在另一侧，动作比记忆里慢，但每个动作都做完，一个不多一个不少。开场介绍到他名字的时候，观众全体站了起来，掌声持续了将近半分钟。你站在自己半场，跟着拍了几下手。\n第一节他明显跟不上节奏，被换下时低着头。第二节重新上场，他不再突破了，改用背身和传球，用大伤换来的耐心一球一球地磨，整个下半场只失误了一次。\n终场你赢了。你去中线跟他握手，他说打得不错，你说你也是。他笑了一下：这大概是你给过我最实在的鼓励。",
        options = {
            {
                text = "赛后公开说：他是我遇到过最难打的对手",
                response = "记者问你怎么看他的复出，你说如果将来有人要学这个位置，你会让他先看 @name 的比赛。第二天这段采访被剪成短视频，标题起得很煽情。他发消息来：别肉麻。你回：是真话。",
                fx = { fame = 100, morale = 6 },
            },
            {
                text = "约他休赛期一起训练",
                response = "他先答应了，两周后又反悔，说不想让你看见自己现在的样子。你说那就等你愿意。第二年夏天你们真的练了两周：他教你怎么在无球时省力，你教他落地时的细节。互相都占了不少便宜。",
                fx = { iq = 2, playmaking = 1, morale = 5 },
            },
        },
        check = function(_, r, _)
            return r.returnPending == true
        end,
        apply = function(_, r)
            r.returnPending = false
        end,
    },

    -- -----------------------------------------------------------------------
    -- 他受伤（脚本化的一次重伤：至少交手 3 次、跨越 1 个赛季之后）
    -- -----------------------------------------------------------------------
    {
        id = "rival_injury",
        title = "他倒下的那一下",
        art = A.evInjury,
        body = "第三节还剩四分钟，@name 突破落地时脚踝别了一下。他不是被谁撞倒的，就是自己没踩稳，然后整个人坐在地板上，抱着腿，一声没出。\n队医跑进场的那十几秒里，整个球馆安静得能听见球在地上滚。你站在三步之外，忽然发现自己什么也做不了。\n赛后你去客队更衣室找他。他坐在那儿，冰袋绑在脚踝上，见你进来先笑了一下，说别用那种表情看我，我又没死。你问他什么时候回来，他说不知道，要等片子出来。临走他补了一句：你今天那两个后仰，是真的练出来了。",
        options = {
            {
                text = "把「他还能回来」这句话听进去了",
                response = "回酒店的路上你一直在想他那句玩笑。你第一次意识到，这个和你争了这么久的人，也会在某一天突然停下来，而且不会提前打招呼。",
                fx = { morale = -4, iq = 2 },
            },
            {
                text = "回去就把自己的落地和恢复计划重排一遍",
                response = "你当晚就找了队医，改了三个一直将就的动作。你不是因为怕受伤才改的，是因为第一次近距离看见一个和你一样的人突然停下。这一改，让你多打了很多年。",
                fx = { athletic = 1, iq = 1, stamina = 8 },
            },
        },
        check = function(_, r, ctx)
            return ctx.after >= 3 and ctx.span >= 1 and not r.injurySeason
        end,
        apply = function(state, r)
            r.injurySeason = state.season or 1
            r.injuredUntil = state.season or 1   -- 本赛季剩下的比赛他都不在
            r.returnPending = false
        end,
    },

    -- -----------------------------------------------------------------------
    -- 首次听闻（媒体开始拿你们比较，就在第一次交手这一周）
    -- -----------------------------------------------------------------------
    {
        id = "rival_first_hearsay",
        title = "第一次听到那个名字",
        art = A.evPress,
        body = "和 @team 的比赛排进赛程表之后，本地报纸把你们两个的名字并排放在了一栏里——同一个位置，同一届进联盟，连场均出手数都差不多。你在酒店餐厅翻到那一页，看了两秒，把它折起来压在盘子下面。\n赛前热身时你第一次近距离看他。@name 在另一侧半场练投篮，节奏像节拍器，一个不多一个不少。你数着他连续命中的球，数到第九个，他忽然停下来，转头看了你一眼，又转回去继续投。\n跳球前两秒，你们在中圈旁边第二次对视。他没有表情，你也没有。开场第一个回合，他就贴到了你的胸口——你这才明白，那份报纸不是恭维，是通知。",
        options = {
            {
                text = "把那份报纸收进更衣柜，当成提醒",
                response = "你把报纸折好，压进更衣柜最底下。你没有把它当成挑衅，只当成一份通知：从今天起，你的名字会一直和他写在同一行里。",
                fx = { iq = 2, morale = 5 },
            },
            {
                text = "第一节就要球，先试他的斤两",
                response = "第一次进攻你就要了球，背身顶了两下，发现他下盘比录像里稳得多。那球没投进，但你记住了那个对抗的力度，也记住了他整场没有说一句话。",
                fx = { athletic = 2, stamina = -5 },
            },
            {
                text = "赛前走过去，报上自己的名字",
                response = "你走到他半场边线，伸出手说了自己的名字。他愣了一下，握住，说「知道」。两个字，没有多余的东西，但这一晚之后你们都记住了对方。",
                fx = { fame = 60, morale = 4 },
            },
        },
        check = function(_, _, ctx)
            return ctx.before == 0
        end,
    },

    -- -----------------------------------------------------------------------
    -- 首次交手的回响（第二次交手，他先开口说起上一场）
    -- -----------------------------------------------------------------------
    {
        id = "rival_he_remembers",
        title = "他也记得那场",
        art = A.bgTraining,
        body = "第二次交手前的热身，你在通道口碰见 @name。他先开口，说的是你们上一场的第三节：你那次从底线绕出来的接球，他承认自己慢了半步。\n你这才知道，那场球他也看了不止一遍。\n职业联盟里没有人有义务记住对手的细节。他记住了，说明那场球对他也不是普通的一晚。你们各自回了自己的半场，热身照做，谁都没有再说话。跳球的时候，你发现自己比上一场更专心了。",
        options = {
            {
                text = "回他一句：你那次变向我也研究过",
                response = "他挑了下眉，说「那你练吧」。这不是客套，是两个同位置的人之间最短的一次交流——你们都知道对方在说什么。",
                fx = { iq = 2, morale = 6 },
            },
            {
                text = "什么都不说，把话留到比赛里",
                response = "你只是点了点头。四十八分钟之后，技术统计上你们两个人的名字挨在一起，数据也咬得很紧。有些回应不用嘴说。",
                fx = { scoring = 2, stamina = -4 },
            },
        },
        check = function(_, _, ctx)
            return ctx.before == 1
        end,
    },

    -- -----------------------------------------------------------------------
    -- 被他打爆（被压制：输了球，而且是低分或被实力差压住的输法）
    -- -----------------------------------------------------------------------
    {
        id = "rival_crushed",
        title = "被打爆的那晚",
        art = A.evBlock,
        body = "那场球从一开始就不对。@name 第一节在你头上连着得分，两次都是从你右侧过去的——和录像里一模一样，你就是慢了那半步。\n第三节教练把你换下来，让你在场边看。你看着他在同一个位置用同一种方式得分，也看着自己的投篮一次次磕在篮筐前沿。终场你的得分停在一个你自己都不想看的数字上，回到更衣室，你把毛巾盖在脸上坐了很久。\n第二天训练前，助教把剪好的录像放在你更衣柜上，只留了一句话：他研究你，比你自己研究他还早。",
        options = {
            {
                text = "关掉手机，从第一回合开始重看录像",
                response = "你把那场球看了三遍，第三遍开始记笔记：他的起手位置、他逼你走哪一边、你每一次被顶开的角度。你在训练馆待到凌晨，灯是你自己关的。",
                fx = { iq = 2, defense = 2, stamina = -8 },
            },
            {
                text = "第二天约队里最好的防守人加练",
                response = "你找了个子比你高、脚步比你快的队友，一遍遍重复那个被过掉的防守动作。练到吐。一周之后，你不再怕那个动作了。",
                fx = { defense = 3, stamina = -10 },
            },
            {
                text = "先承认差距，把身体练回来",
                response = "你没有急着改技术，先回了健身房。被压制的夜晚看多了你就会发现：差距有时候不在技术，在你扛不扛得住那一下。",
                fx = { athletic = 3, morale = -3 },
            },
        },
        check = function(_, _, ctx)
            if ctx.win then return false end
            -- 低分输球，或者他确实比你强一档
            return ctx.myPoints <= 14 or (ctx.power - ctx.ov) >= 5
        end,
    },

    -- -----------------------------------------------------------------------
    -- 复仇（先输过，再赢回来）
    -- -----------------------------------------------------------------------
    {
        id = "rival_revenge",
        title = "还回去的那场",
        art = A.evDunk,
        body = "上一场输给他的账，你记了很久。这次跳球前你什么都没想，只想着第一回合就要球。\n第一节你用他上次对付你的方式还了回去：同一个位置，同一种变向，只是这次被过掉的人是他。他没有追上来，只在你身后拍了一下你的腰。\n第四节最后三分钟，他连拿五分把分差追到两分。暂停时你主动跟教练要了那个球权。回到场上，你在他面前投进了那球——落地的时候你没有喊，只是往回跑，因为你知道下一次他还会来。",
        options = {
            {
                text = "把这场的技术统计剪下来，贴进训练本",
                response = "你把那张数据剪下来贴在训练本上，正好在上一次输球的那张纸背面。一正一反摆在一起，只有你自己知道那是什么意思。",
                fx = { morale = 8, iq = 2 },
            },
            {
                text = "赛后跟他说一句：下次见",
                response = "你在中线附近等了他两秒，说了句「下次见」。他点头，说「下次我先撞你」。你们都笑了，但谁都没当玩笑。",
                fx = { morale = 6, fame = 80 },
            },
        },
        check = function(_, r, ctx)
            return ctx.win and (r.losses or 0) >= 1
        end,
    },

    -- -----------------------------------------------------------------------
    -- 宿命之战（交手 6 次以上、跨越 3 个赛季：转播方把这场标成「宿敌之战」）
    -- -----------------------------------------------------------------------
    {
        id = "rival_milestone",
        title = "宿命之战",
        art = A.bgMatch,
        body = "转播方把这场标成了「宿敌之战」，全国直播的机位比平时多了六个。热身时大屏幕放了一段你们前几次交手的剪辑，从第一场到最后一场，背景音乐放得很满。\n你抬头看了两眼。第一场里的那个你，还在为他的一次贴身防守手忙脚乱；屏幕最后定格的画面，是你上一次在他头上投进的那球。\n第四节最后两分钟，你们像约好了一样互相找对方——他要求换防到你面前，你要求用一个掩护把他换过来。这两分钟里没有别人，只有你们两个人和一块地板。终场哨响，你们的数据被打在大屏幕上，挨在一起。",
        options = {
            {
                text = "在最后两分钟主动要那个球权",
                response = "暂停时你走到战术板前，跟教练说了三个字：给我球。那两分钟你拿了五分，也让他拿了四分。有些夜晚不需要总结，打完了你自己知道。",
                fx = { scoring = 2, morale = 9, fame = 120 },
            },
            {
                text = "把这场当成普通比赛来打",
                response = "你没有看那段剪辑，也没有回应任何关于宿敌的提问。赛前你只做了两件事：绑紧鞋带，把战术记熟。结果你打出了本赛季最干净的一场球。",
                fx = { iq = 3, morale = 5 },
            },
        },
        check = function(_, _, ctx)
            return ctx.after >= 6 and ctx.span >= 3
        end,
    },

    -- -----------------------------------------------------------------------
    -- 惺惺相惜（多年以后：交手 7 次以上，人过三十或已进入宿命阶段）
    -- -----------------------------------------------------------------------
    {
        id = "rival_mutual_respect",
        title = "多年以后",
        art = A.evTrophy,
        body = "很多年以后，你们在一场联盟的纪念活动上又见面。走廊里挂着历年球员的球衣，你的那件和他那件之间，隔着一件别人的。\n他走过来，说这面墙真挤。你们站在那里看了一会儿自己年轻时候的号码，谁都没提当年那些球。\n临走他忽然说，其实他第一年就被教练拉着看你高中时期的录像，看完之后失眠了两天。你笑着说你早知道了——你并不知道，但你不想让这句话落在地上。\n你们在停车场各自上车。你发动引擎的时候想：这么多年，你从来没有真正恨过他，只是不能让他在你前面。",
        options = {
            {
                text = "告诉他：我留着你所有比赛的剪辑",
                response = "你说你电脑里有一个文件夹，从很多年前存到现在，里面全是他。他愣了两秒，说别恶心我，然后转头看别的地方。你看见他耳根红了。",
                fx = { morale = 12, iq = 1 },
            },
            {
                text = "约定退役后一起做点事",
                response = "你们说好退役后合开一个训练营，专门教小孩怎么用脑子打球。这句话当时说得很随意，但后来真的开了。第一期学员名册上，你们把彼此的名字写在教练栏最前面。",
                fx = { morale = 10, fame = 150 },
            },
        },
        check = function(state, _, ctx)
            return ctx.after >= 7 and ((state.age or 0) >= 29 or ctx.stage >= 5)
        end,
    },

    -- -----------------------------------------------------------------------
    -- 全明星同场（入选过全明星之后，你们第一次在同一块地板上做队友）
    -- -----------------------------------------------------------------------
    {
        id = "rival_allstar",
        title = "同一块地板",
        art = A.evFans,
        body = "你第一次进全明星的那年，他也在。全明星周末的更衣室不按球队分座位，你们被安排在同一排，中间隔了两个更衣柜。\n训练结束他递给你一瓶水，问你平时怎么保养脚踝。你说了自己常做的那两个动作，他听完点点头，没再说什么。第二天正赛你们的配合意外地顺——他给你传了三个球，你投进了两个。\n那两天没人提「宿敌」两个字，你反而有些不习惯。",
        options = {
            {
                text = "把保养的细节一条条讲给他",
                response = "你把理疗师教的东西一条条说了，连热身的时间点都没漏。他掏出手机记。那一刻你忽然意识到，你们并不是敌人，只是被放在同一行里的两个人。",
                fx = { morale = 6, iq = 1 },
            },
            {
                text = "反问他：你的背身是怎么练的",
                response = "他没有藏私，把起手的那个小动作拆开讲给你听。你回去练了半个夏天，在下一个赛季用在了他身上。他看见那球之后，在场边笑了很久。",
                fx = { scoring = 2, iq = 1 },
            },
        },
        check = function(state, _, ctx)
            return (state.allStars or 0) >= 1 and ctx.after >= 3
        end,
    },

    -- -----------------------------------------------------------------------
    -- 卡位里的那句话（交手次数够多、关系已经紧张起来之后的火药味）
    -- -----------------------------------------------------------------------
    {
        id = "rival_trash_talk",
        title = "卡位里的那句话",
        art = A.evPress,
        body = "第三节的一次卡位，你们都用了多余的力量。裁判响哨，给了双方技术犯规。他从你身边走过去的时候说了一句话，声音很小，只有你听见。\n你没有回嘴。下一个回合，你把他顶出了三秒区，抢下那个前场篮板。\n赛后有记者问你们是不是有私人恩怨，你说没有，他只是打球很硬。这句话传出去，有人说你软，也有人翻出他几年前的旧视频说他脏。晚上你收到一条陌生号码的消息：不用替我说好话。你回了三个字：我没替。",
        options = {
            {
                text = "回他：那就场上见",
                response = "你只回了几个字。从那以后，你们之间的话越来越少，比赛却越来越长——每次遇上都要打到最后两分钟才分得开。",
                fx = { morale = 5, scoring = 1 },
            },
            {
                text = "把那条消息截图存下来",
                response = "你把那条消息截图存进相册最底下。很多年以后你换了几部手机，这张图一直在。你自己也说不清为什么留着它。",
                fx = { iq = 2, morale = 3 },
            },
        },
        check = function(_, _, ctx)
            return ctx.after >= 3 and ctx.stage >= 2
        end,
    },

    -- -----------------------------------------------------------------------
    -- 交易流言（人气够高之后：球队可能把他交易过来，你们要变成队友）
    -- -----------------------------------------------------------------------
    {
        id = "rival_trade_rumor",
        title = "交易流言",
        art = A.evPress,
        body = "赛季中期，有记者放出一条消息：@team 正在考虑把 @name 送到你的球队。消息不算大，但足够让所有记者都来问你同一个问题——你们能不能做队友。\n你在采访里说了一句实话：能。\n晚上你把这条新闻翻来覆去看了几遍，第一次认真想象那个画面：训练里他防你，你们站在同一侧底线，穿同一种颜色的球衣。你竟然觉得那画面不错，然后又有点说不出的失落——如果真成了队友，每年那两场球就没了。",
        options = {
            {
                text = "公开说欢迎他来",
                response = "你在采访里说了欢迎，还补了一句：训练里有人天天这么防我，我可能还能再进一步。第二天标题写得很热闹，但你知道那句话是认真的。",
                fx = { fame = 150, morale = 5 },
            },
            {
                text = "把这件事交给球队，自己不看新闻",
                response = "你关掉了所有推送，照常训练。流言最后也没成真。赛季末你们又在季后赛碰上，他在跳球前看了你一眼，你忽然很庆幸他还是站在对面。",
                fx = { iq = 2, morale = 4 },
            },
        },
        check = function(state, _, ctx)
            return (state.fame or 0) >= 800 and ctx.after >= 5
        end,
    },
}

-- ============================================================================
-- 事件实例化与挑选
-- ============================================================================

--- 把事件模板实例化：替换占位符，生成一张可直接交给 ScreenEvent / EventSystem 的事件卡
---@param def RivalEventDef
---@param c table
---@return table
local function instantiate(def, c)
    ---@type table
    local ev = {
        id = def.id,
        cat = "rival",       -- 分类冷却键（与其它事件池互不干扰）
        once = true,         -- 整生涯只触发一次
        title = def.title,
        art = def.art,
        body = fill(def.body, c),
        options = {},
    }
    for i = 1, #def.options do
        local opt = def.options[i]
        ev.options[i] = {
            text = opt.text,
            response = fill(opt.response, c),
            fx = opt.fx,
        }
    end
    return ev
end

--- 从事件池里挑一张本场可触发的事件卡（一场最多一张，按优先级从上到下）
---@param state CareerState
---@param r RivalDef
---@param ctx table { win, myPoints, before, after }
---@return table|nil
local function pickEvent(state, r, ctx)
    local seen = state.seenEvents
    if type(seen) ~= "table" then
        seen = {}
        state.seenEvents = seen
    end

    -- 判定上下文：把本场与当前生涯的关键数值一次算好，check 函数只读不写
    ---@type table
    local env = {
        win = ctx.win == true,
        myPoints = ctx.myPoints or 0,
        before = ctx.before or 0,
        after = ctx.after or 0,
        ov = playerOverall(state),
        power = r.power or 60,
        span = (state.season or 1) - (r.formedSeason or 1),
        stage = Rival.stageOf(state),
    }

    local c = context(state, r)
    for i = 1, #EVENTS do
        local def = EVENTS[i]
        if not seen[def.id] and def.check(state, r, env) then
            seen[def.id] = true       -- once 语义：本模块自己记账，不依赖事件系统
            if def.apply then
                def.apply(state, r)
            end
            refreshStage(state)
            print(string.format("[Rival] 触发宿敌剧情《%s》| 第 %d 次交手 | 阶段 %d",
                def.title, env.after, Rival.stageOf(state)))
            return instantiate(def, c)
        end
    end
    return nil
end

-- ============================================================================
-- 生成与赛程植入
-- ============================================================================

--- 生成一名宿敌（只在玩家进入职业联赛后调用）
---@param state CareerState
---@return RivalDef|nil
local function generate(state)
    local persona = PERSONAS[math.random(1, #PERSONAS)] or PERSONAS[1]
    if not persona then return nil end

    local ov = playerOverall(state)
    -- 旗鼓相当：以玩家综合实力为中线浮动，避免出现"完全打不过"或"毫无威胁"的宿敌
    local power = clamp(ov + math.random(-6, 8), 45, 97)

    ---@type RivalDef
    local r = {
        -- 同位置 = 直接对位，才有"谁是这个位置第一人"的叙事
        name = persona.name,
        pos = state.positionId,
        team = pickTeam(state),
        power = power,
        stage = 1,
        wins = 0,
        losses = 0,
        met = false,
        formedSeason = state.season or 1,
        seasonTag = 0,                          -- 0 = 还没交过手
        history = {},
        style = persona.style,
        origin = persona.origin,
        lastGrowthSeason = state.season or 1,   -- 生成当季不再额外成长
        lastGrowthStep = 0,
        lastSummarySeason = 0,                  -- 0 = 还没输出过赛季文案
        injurySeason = nil,
        injuredUntil = nil,
        returnPending = false,
        absentLoggedSeason = nil,
    }
    state.rival = r

    Career.addLog(string.format("宿敌出现：%s，%s，效力 %s。", r.name, r.style, r.team))
    print(string.format("[Rival] 生成宿敌 %s | %s | 球队 %s | 位置 %s | 实力 %d | 结怨赛季 %d",
        r.name, r.style, r.team, r.pos, r.power, r.formedSeason))
    return r
end

--- 推进宿敌实力一个赛季（成长曲线跟着玩家走）
--- 目标 = clamp(玩家 overall + 随机(-6, 8), 45, 97)，单赛季最多变化 GROWTH_STEP_MAX 点，
--- 让差距是"追"上来的而不是瞬移；31 岁后成长放缓，与玩家的高龄衰退节奏对齐。
---@param state CareerState
---@param r RivalDef
---@return number 实际变化量
local function growPower(state, r)
    local oldPower = math.floor(tonumber(r.power) or 60)
    local target = clamp(playerOverall(state) + math.random(-6, 8), 45, 97)
    local step = clamp(target - oldPower, -GROWTH_STEP_MAX, GROWTH_STEP_MAX)
    if (state.age or 0) >= 31 and step > 0 then
        step = math.max(1, math.floor(step * 0.6 + 0.5))
    end
    r.power = clamp(oldPower + step, 40, 97)
    return r.power - oldPower
end

--- 伤停推进：赛季翻页之后清除伤停，并挂上"待复出"标记
--- （复出剧情在伤停结束后的第一次交手时由 rival_return 触发）
---@param state CareerState
---@param r RivalDef
local function advanceInjury(state, r)
    if r.injuredUntil and (state.season or 1) > r.injuredUntil then
        r.injuredUntil = nil
        if r.injurySeason then
            r.returnPending = true
        end
    end
end

--- 赛季兜底推进
--- 如果赛季已经翻页，但没有任何入口调用过 onSeasonEnd（接线不完整 / 旧存档），
--- 就在 ensure 时补一次数值推进，保证宿敌不会停在几年前的实力上。
--- 注意：这里只做数值，赛季文案仍由 onSeasonEnd 负责（它有自己的幂等键），两边不会重复。
---@param state CareerState
---@param r RivalDef
local function catchUpSeason(state, r)
    local season = state.season or 1
    local last = math.floor(tonumber(r.lastGrowthSeason) or 0)
    if last <= 0 then
        r.lastGrowthSeason = season
        return
    end
    if season <= last then return end

    r.lastGrowthSeason = season
    local step = growPower(state, r)
    r.lastGrowthStep = step
    advanceInjury(state, r)
    refreshStage(state)
    print(string.format("[Rival] 赛季兜底推进：%s 实力 %+d -> %d（本赛季未收到 onSeasonEnd）",
        r.name or "宿敌", step, r.power))
end

--- 赛程写入视图
--- CareerState 的公开类型定义里没有声明赛程字段（赛程由 Core.Schedule 维护），
--- 这里用一个局部视图类型承接，避免 LSP 误报 undefined-field。
---@class RivalScheduleView
---@field schedule table[]|nil       本赛季常规赛赛程
---@field scheduleSeason number|nil  赛程所属赛季

--- 把宿敌球队植入本赛季赛程（幂等）
--- 设计意图：让"宿敌"真实出现在玩家的赛程表上，而不是只活在界面里的几个数字。
--- 因为本模块不改动 Core/Schedule，这里做一次安全兜底：
---   · 只处理本赛季的常规赛赛程，只动还没打过的比赛
---   · 一赛季最多植入一场；若赛程里已经有他的球队，只补标记
---   · 不修改 strength —— 难度加成由比赛层调用 Rival.matchBoost 叠加，避免重复计数
---@param state CareerState
---@param r RivalDef
local function pinScheduleGame(state, r)
    local raw = state --[[@as RivalScheduleView]]
    ---@type table[]|nil
    local schedule = raw.schedule
    if not schedule or #schedule == 0 then return end
    if raw.scheduleSeason ~= state.season then return end   -- 赛程属于旧赛季，等下次生成

    -- 赛程里已经有他（含已打完的）→ 补标记即可
    local found = false
    for i = 1, #schedule do
        if schedule[i].opponent == r.team then
            schedule[i].rivalGame = true
            found = true
        end
    end
    if found then return end

    -- 挑一场还没打的常规赛；循环结束时 pick 落在最后一场未打的比赛上
    --（宿敌战放在赛季后段更有分量）
    ---@type table|nil
    local pick = nil
    for i = 1, #schedule do
        local g = schedule[i]
        if g.win == nil and (g.week or 0) >= (state.week or 1) then
            pick = g
        end
    end
    if not pick then return end

    pick.opponent = r.team
    pick.rivalGame = true

    local venue = pick.home == false and "客场" or "主场"
    Career.addLog(string.format("赛程更新：第 %d 周，%s迎战 %s。", pick.week or 0, venue, r.team))
    print(string.format("[Rival] 宿敌战已植入赛程：第 %d 周 %s vs %s",
        pick.week or 0, venue, r.team))
end

-- ============================================================================
-- 对外接口
-- ============================================================================

--- 确保宿敌已生成（首次调用时创建；读档后也可安全调用）
--- 生成时机：玩家进入职业联赛（stageIndex == 4，21 岁）；此前不会有宿敌
---@param state CareerState
function Rival.ensure(state)
    if not state then return end
    if (state.stageIndex or 1) < 4 then return end   -- 职业阶段之前：还没有宿敌

    -- 旧存档兜底：字段缺失就补，数据不可用就重新生成
    if state.rival and not sanitize(state) then
        print("[Rival] 存档中的宿敌数据不可用，重新生成")
        state.rival = nil
    end

    local r = state.rival
    if not r then
        r = generate(state)
    end
    if not r then return end

    -- 兜底 1：赛季翻页但没人调用 onSeasonEnd 时，补一次数值推进
    catchUpSeason(state, r)

    -- 兜底 2：让宿敌球队出现在本赛季赛程里（幂等，重复调用无副作用）
    pinScheduleGame(state, r)
end

--- 取当前宿敌（未生成返回 nil）
---@param state CareerState
---@return RivalDef|nil
function Rival.get(state)
    if not state then return nil end
    local r = state.rival
    if type(r) ~= "table" then return nil end
    if type(r.name) ~= "string" or r.name == "" then return nil end
    return r
end

--- 宿敌是否正在伤停（扩展接口：界面用来显示状态标签）
---@param state CareerState
---@return boolean
function Rival.isInjured(state)
    return injuredNow(state)
end

--- 宿敌当前实力（随赛季成长；伤停期间下调）
---@param state CareerState
---@return number
function Rival.power(state)
    local r = Rival.get(state)
    if not r then return 0 end
    local p = tonumber(r.power) or 60
    if injuredNow(state) then
        p = p - 8     -- 打不了球的人，威胁评估自然要下调
    end
    return clamp(math.floor(p + 0.5), 40, 97)
end

--- 玩家与宿敌的实力差（正数 = 宿敌更强）
---@param state CareerState
---@return number
function Rival.powerDelta(state)
    if not state then return 0 end
    local r = Rival.get(state)
    if not r then return 0 end
    return Rival.power(state) - playerOverall(state)
end

--- 交手战绩（玩家视角）
---@param state CareerState
---@return number wins, number losses
function Rival.headToHead(state)
    local r = Rival.get(state)
    if not r then return 0, 0 end
    return math.max(0, math.floor(tonumber(r.wins) or 0)),
        math.max(0, math.floor(tonumber(r.losses) or 0))
end

--- 宿敌成长阶段 1-5（用于文案与界面展示）
---@param state CareerState
---@return number
function Rival.stageOf(state)
    local r = Rival.get(state)
    if not r then return 1 end
    local candidate = stageCandidate(state, r)
    local stored = clamp(math.floor(tonumber(r.stage) or 1), 1, 5)
    if candidate > stored then return candidate end
    return stored
end

--- 阶段标题，如「初遇」「压制」「交锋」「超越」「宿命」
--- 未生成宿敌时返回「初遇」（界面此时显示占位说明）
---@param state CareerState
---@return string
function Rival.stageTitle(state)
    local stage = Rival.stageOf(state)
    return STAGE_TITLES[stage] or STAGE_TITLES[1] or "初遇"
end

--- 记录一次交手（当 opponent == 宿敌所在球队名 时调用）
--- 返回本场触发的宿敌剧情事件（table|nil，格式同 Events 事件）
---@param state CareerState
---@param opponent string
---@param win boolean
---@param myPoints number
---@return table|nil
function Rival.onMatch(state, opponent, win, myPoints)
    if not state then return nil end
    Rival.ensure(state)

    local r = Rival.get(state)
    if not r then return nil end
    if type(opponent) ~= "string" or opponent ~= r.team then return nil end

    myPoints = math.max(0, math.floor(tonumber(myPoints) or 0))

    -- 兜底：赛季已经翻页但没人调用 onSeasonEnd 时，把"伤愈复出"标记补上，
    -- 保证复出剧情不会因为接线不完整而永久丢失。
    advanceInjury(state, r)

    -- 他伤停中：这场他没有上场，不计入交手，也不触发剧情
    if injuredNow(state) then
        if r.absentLoggedSeason ~= state.season then
            r.absentLoggedSeason = state.season
            Career.addLog(string.format("%s 因伤缺阵，你们没能对上位。", r.name))
            print(string.format("[Rival] %s 伤停中，本场不计入交手记录", r.name))
        end
        return nil
    end

    -- 记录战绩（玩家视角）
    local before = (r.wins or 0) + (r.losses or 0)
    if win then
        r.wins = (r.wins or 0) + 1
    else
        r.losses = (r.losses or 0) + 1
    end
    r.met = true
    if (r.seasonTag or 0) == 0 then
        r.seasonTag = state.season or 1      -- 首次交手的赛季
    end

    -- 最近交手记录（只留最近 HISTORY_KEEP 场，供界面展示）
    table.insert(r.history, {
        season = state.season or 1,
        win = win == true,
        myPoints = myPoints,
        power = r.power or 60,
    })
    while #r.history > HISTORY_KEEP do
        table.remove(r.history, 1)
    end

    refreshStage(state)

    local after = before + 1
    print(string.format("[Rival] 交手记录：vs %s %s（你得 %d 分）| 累计 %d 胜 %d 负 | 阶段 %d",
        r.team, win and "胜" or "负", myPoints, r.wins, r.losses, Rival.stageOf(state)))

    local ev = pickEvent(state, r, {
        win = win == true,
        myPoints = myPoints,
        before = before,
        after = after,
    })
    if ev then
        Career.addLog(string.format("宿敌剧情《%s》", ev.title))
    end
    return ev
end

--- 赛季末推进宿敌成长，返回提示文案数组
--- 成长曲线跟着玩家走：目标值 = clamp(玩家 overall + 随机(-6, 8), 45, 97)，
--- 单赛季最多靠近 GROWTH_STEP_MAX 点，让差距是"追"上来的而不是瞬移。
---@param state CareerState
---@return string[]
function Rival.onSeasonEnd(state)
    ---@type string[]
    local out = {}
    if not state then return out end

    Rival.ensure(state)
    local r = Rival.get(state)
    if not r then return out end

    -- ---- 数值推进：同一赛季只做一次 ----
    -- ensure 里的赛季兜底与这里共用 lastGrowthSeason 这一个幂等键：
    -- 无论哪个入口先跑，实力都不会被推进两次。
    local oldPower = math.floor(tonumber(r.power) or 60)
    if r.lastGrowthSeason ~= state.season then
        r.lastGrowthSeason = state.season
        r.lastGrowthStep = growPower(state, r)
        advanceInjury(state, r)
    end
    local step = math.floor(tonumber(r.lastGrowthStep) or 0)

    -- ---- 阶段刷新 ----
    local stageBefore = Rival.stageOf(state)
    refreshStage(state)
    local stageAfter = Rival.stageOf(state)

    -- ---- 文案：同一赛季只出一次（与数值推进分开记账，互不干扰）----
    if r.lastSummarySeason == state.season then
        return out
    end
    r.lastSummarySeason = state.season

    table.insert(out, string.format("宿敌近况：%s 本赛季继续留在 %s，联赛评估实力 %d。",
        r.name, r.team, r.power))

    if step >= 3 then
        table.insert(out, "他休赛期练得很凶，据说换了一套新的训练团队，体测数据比去年还好。")
    elseif step <= -2 then
        table.insert(out, "他的状态在下滑，赛季末那几场球已经跟不住年轻人的第一步了。")
    end

    local delta = Rival.powerDelta(state)
    if delta >= 5 then
        table.insert(out, "媒体依然认为他比你高一档。这个说法，他本人从来没有回应过。")
    elseif delta <= -5 then
        table.insert(out, "你们之间的差距正在缩小——现在是他需要研究你了。")
    else
        table.insert(out, "你们的实力评估咬得很紧，谁也说不清下一次交手会是什么结果。")
    end

    if r.injurySeason and r.returnPending and not Rival.isInjured(state) then
        table.insert(out, string.format("他的伤已经养好了，下赛季会回来。%s 在康复视频里说，他不想让人记住一个跑不动的自己。", r.name))
    end

    if stageAfter > stageBefore then
        table.insert(out, string.format("你们的宿敌关系进入新阶段：%s。", Rival.stageTitle(state)))
    end

    for i = 1, #out do
        Career.addLog(out[i])
    end
    print(string.format("[Rival] 赛季推进：%s 实力 %d -> %d（本季 %+d，玩家 overall %d，差值 %+d）",
        r.name, oldPower, r.power, step, playerOverall(state), delta))

    return out
end

--- 宿敌所在的球队名（比赛生成赛程时，宿敌所在球队会周期性出现在赛程里）
--- 未到职业阶段返回空串（调用方判空即可，不会误匹配任何对手）
---@param state CareerState
---@return string
function Rival.teamName(state)
    if not state then return "" end
    Rival.ensure(state)     -- 赛程生成可能早于任何界面调用，这里顺手保证已生成
    local r = Rival.get(state)
    if not r then return "" end
    return r.team or ""
end

--- 给比赛用的强度修正（宿敌之战更艰难，+0~+8）
---@param state CareerState
---@param opponent string
---@return number
function Rival.matchBoost(state, opponent)
    local r = Rival.get(state)
    if not r then return 0 end
    if type(opponent) ~= "string" or opponent ~= r.team then return 0 end
    if injuredNow(state) then return 0 end   -- 他挂免战牌，这场反而好打
    local boost = BOOST_BY_STAGE[Rival.stageOf(state)] or 4
    return clamp(math.floor(boost + 0.5), 0, 8)
end

--- 把宿敌球队排进本赛季剩余赛程（扩展接口，供赛程层在生成后主动调用）
---@param state CareerState
function Rival.pinSchedule(state)
    if not state then return end
    Rival.ensure(state)
    local r = Rival.get(state)
    if not r then return end
    pinScheduleGame(state, r)
end

return Rival
