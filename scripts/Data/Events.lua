-- ============================================================================
-- Events — 《篮途》剧情事件卡池
-- 全部原创文案，动漫热血风格
--
-- 事件结构：
--   id      唯一标识
--   cat     分类（同类事件有冷却，避免连续出现）
--   once    整生涯只触发一次
--   when    触发条件 { minSeason, maxSeason, minAge, maxAge, stage, res, goalsMin,
--                      staminaMax, moraleMax, moraleMin, minFame }
--   title   标题
--   body    正文（%s 会被替换为球员名）
--   art     插图路径
--   options 选项列表 { text, response, fx }
--   fx      效果 { scoring/playmaking/defense/athletic/iq, morale, fame, money, stamina }
-- ============================================================================

local Config = require("Core.Config")

local Events = {}

local A = Config.ART

-- ---------------------------------------------------------------------------
-- 赛前事件（比赛前发生，影响比赛）
-- ---------------------------------------------------------------------------
---@type table[]
Events.PRE = {
    {
        id = "pre_nervous",
        cat = "pre",
        when = { maxSeason = 2 },
        title = "第一次首发",
        body = "更衣室的灯光有点晃眼。教练把写着你名字的战术板拍在你胸口：「今天你首发。」\n你的手心开始出汗——%s，这是你第一次真正站在聚光灯下。",
        art = A.bgLocker,
        options = {
            { text = "深呼吸，告诉自己「我准备好了」", response = "你闭上眼睛，把呼吸压到最慢。再睁眼时，手不抖了。", fx = { morale = 8, iq = 1 } },
            { text = "找老队员聊两句，取取经", response = "老将拍拍你肩膀：「紧张说明你在乎。把它当成燃料。」", fx = { morale = 4, iq = 2 } },
            { text = "什么都不想，直接上场热身", response = "你把球砸向地板，听着那声回响。身体比脑子先进入状态。", fx = { athletic = 2, stamina = -5 } },
        },
    },
    {
        id = "pre_press_fire",
        cat = "pre",
        when = { minSeason = 2, minFame = 200 },
        title = "赛前发布会",
        body = "记者把话筒递到你面前：「对手说你们这赛季没戏，你怎么看？」\n三十台摄像机的红点同时亮起，%s。",
        art = A.evPress,
        options = {
            { text = "「让他们赛后再说一遍」", response = "这句话当晚上了热搜。你把压力变成了火药。", fx = { morale = 6, fame = 150 } },
            { text = "「我们只关注自己」", response = "滴水不漏的回答。教练在台下点头——他喜欢这样的你。", fx = { iq = 2, morale = 3 } },
            { text = "沉默三秒，只说「球场上见」", response = "简短，冰冷，有分量。第二天的标题是《沉默的杀手》。", fx = { fame = 100, iq = 1 } },
        },
    },
    {
        id = "pre_teammate_conflict",
        cat = "pre",
        when = { minSeason = 1 },
        title = "更衣室里的火药味",
        body = "主力控卫把毛巾摔在长椅上：「球为什么不传给我？」\n空气僵住了。所有人都在看%s怎么接这句话。",
        art = A.bgLocker,
        options = {
            { text = "「下一场，我第一个找你」", response = "他愣了一下，伸手跟你碰拳。裂痕补上了。", fx = { morale = 5, playmaking = 1 } },
            { text = "「机会是自己跑出来的」", response = "他瞪了你一眼走开。但下一场，他跑得比谁都积极。", fx = { iq = 2, morale = -3 } },
            { text = "不接话，自己加练到深夜", response = "球馆的灯亮到凌晨一点。你用行动回答了一切。", fx = { scoring = 2, stamina = -10 } },
        },
    },
    {
        id = "pre_injury_risk",
        cat = "pre",
        when = { minSeason = 3, minAge = 24 },
        title = "脚踝的旧伤",
        body = "队医按住你的脚踝，眉头皱起来：「今天最好别打。」\n但这是关键战。%s看着战术板上自己的名字。",
        art = A.evInjury,
        options = {
            { text = "打封闭，上场", response = "针扎进去的时候你咬紧了牙。你打满了全场。", fx = { morale = 8, stamina = -20, fame = 120 } },
            { text = "听队医的，坐替补席", response = "你在场边喊到嗓子哑。球队输了，但你保住了未来。", fx = { stamina = 15, morale = -6, iq = 2 } },
            { text = "只打关键的最后五分钟", response = "你上场时球队落后 9 分。你做了能做的一切。", fx = { stamina = -8, morale = 3, iq = 2 } },
        },
    },
    {
        id = "pre_rookie_hazing",
        cat = "pre",
        once = true,
        when = { maxSeason = 1 },
        title = "老队员的「欢迎仪式」",
        body = "你的更衣柜被塞满了爆米花，球鞋被挂在天花板上。\n老队员们靠在墙边笑：「新人，想拿回鞋子，先证明你能打。」%s。",
        art = A.bgLocker,
        options = {
            { text = "笑着爬上梯子取鞋", response = "你抱着鞋下来时，全队鼓掌。这关，过了。", fx = { morale = 6 } },
            { text = "「不如球场上见真章」", response = "训练赛你打爆了对面。第二天，没人再开你玩笑。", fx = { scoring = 3, morale = 4 } },
            { text = "把爆米花分给所有人吃", response = "更衣室变成了派对。你成了那个「有意思的新人」。", fx = { morale = 8, fame = 50 } },
        },
    },
    {
        id = "pre_big_game_focus",
        cat = "pre",
        when = { minSeason = 2 },
        title = "决战前夜",
        body = "明天是赛季最重要的一场。你在酒店房间里翻来覆去，\n脑海里反复播放着对手的每一个假动作。%s。",
        art = A.bgTraining,
        options = {
            { text = "起身去健身房加练", response = "凌晨两点的酒店健身房，只有你一个人的喘息声。", fx = { athletic = 2, stamina = -8 } },
            { text = "打开战术录像，看到天亮", response = "你记住了对手所有的习惯动作。第二天，你提前了半步。", fx = { iq = 3, stamina = -6 } },
            { text = "强迫自己睡觉", response = "你睡了八小时，醒来时身体轻得像羽毛。", fx = { stamina = 12 } },
        },
    },
}

-- ---------------------------------------------------------------------------
-- 赛后事件
-- ---------------------------------------------------------------------------
---@type table[]
Events.POST = {
    {
        id = "post_big_scoring",
        cat = "post",
        when = { goalsMin = 25 },
        title = "一个人的进攻",
        body = "%s 今晚砍下高分，全场都在喊你的名字。\n退场通道里，有小孩举着写有你的名字的纸板。",
        art = A.evShot,
        options = {
            { text = "把比赛用球抱回家", response = "你把球放在床头。它提醒你，这只是开始。", fx = { morale = 8, fame = 120 } },
            { text = "走向那个小孩，把护腕送给他", response = "小孩哭了出来。第二天，这段视频传遍了网络。", fx = { fame = 200, morale = 6 } },
            { text = "直接回更衣室加练罚球", response = "「今天罚丢了三个。」你对教练说。他笑了。", fx = { scoring = 3, morale = 2 } },
        },
    },
    {
        id = "post_dunk_highlight",
        cat = "post",
        when = { res = "win", minSeason = 1 },
        title = "海报级暴扣",
        body = "第三节还剩 4 秒，%s 从罚球线起跳，隔着对方中锋把球砸进篮筐。\n整座球馆的顶棚都快被吼声掀翻。",
        art = A.evDunk,
        options = {
            { text = "落地后对着镜头怒吼", response = "照片登上了所有体育媒体的头版。", fx = { fame = 250, morale = 8 } },
            { text = "面无表情地回防", response = "「这很平常。」你赛后说。记者们疯狂了。", fx = { fame = 150, iq = 2 } },
            { text = "先去扶起被隔扣的对手", response = "对手拍了拍你的背。体育精神的一幕被反复播放。", fx = { fame = 180, morale = 5, iq = 1 } },
        },
    },
    {
        id = "post_loss_hard",
        cat = "post",
        when = { res = "loss" },
        title = "失利之夜",
        body = "终场哨响，记分牌上的数字刺眼。%s 坐在更衣室角落，\n毛巾盖着头，很久没有动。",
        art = A.bgLocker,
        options = {
            { text = "把这场比赛的录像看三遍", response = "你记下了每一次失误。下一次，不会了。", fx = { iq = 3, morale = 2 } },
            { text = "一个人回球馆练到凌晨", response = "空荡的球馆里，只有球撞击地板的声音陪着你。", fx = { scoring = 2, stamina = -12, morale = 4 } },
            { text = "接受采访，把责任揽在自己身上", response = "「是我没做好。」你的担当让球迷更加支持你。", fx = { morale = -3, fame = 120 } },
        },
    },
    {
        id = "post_clutch_shot",
        cat = "post",
        when = { res = "win" },
        title = "终场前的绝杀",
        body = "最后 6 秒，%s 在三分线外接球，虚晃，起跳——\n球在空中划出一道弧线，空心入网。蜂鸣器同时响起。",
        art = A.evShot,
        options = {
            { text = "被队友淹没在人群里", response = "你被抬了起来。这一刻，你属于这支球队。", fx = { morale = 12, fame = 200 } },
            { text = "跑向场边，抱住教练", response = "老教练的眼眶红了。他等这个球等了很久。", fx = { morale = 10, iq = 2 } },
            { text = "站在原地，看着记分牌", response = "你告诉自己：记住这个感觉，以后还要更多次。", fx = { morale = 8, iq = 3 } },
        },
    },
    {
        id = "post_block_key",
        cat = "post",
        when = { res = "win", minSeason = 2 },
        title = "钉板大帽",
        body = "对手快攻上篮，球已经离开指尖。%s 从后场追了 20 米，\n在球碰到篮板的一瞬间，把它钉在了板上。",
        art = A.evBlock,
        options = {
            { text = "怒吼着捶胸", response = "整座球馆跟着你一起沸腾。这是防守的力量。", fx = { morale = 8, fame = 120, defense = 1 } },
            { text = "立刻发动快攻", response = "你抢下球，一传到前场，助攻队友轻松得分。", fx = { playmaking = 2, morale = 5 } },
        },
    },
    {
        id = "post_steal_fastbreak",
        cat = "post",
        when = { minSeason = 1 },
        title = "抢断一条龙",
        body = "%s 预判了对手的传球路线，断球后全速推进。\n身后两名防守球员拼命追赶，但只能看着你上篮得分。",
        art = A.evSteal,
        options = {
            { text = "上篮得手后回防", response = "干净利落。教练在场边鼓掌。", fx = { defense = 2, morale = 4 } },
            { text = "背后传球给跟进的队友", response = "全场惊呼。这个传球入选了本周最佳。", fx = { playmaking = 3, fame = 120 } },
        },
    },
    {
        id = "post_fans_tifo",
        cat = "post",
        when = { minFame = 500 },
        title = "看台上的巨幅 TIFO",
        body = "你抬头，看台上展开了一面巨大的横幅——上面是你的画像。\n上万名球迷齐声喊着你的名字。%s 站在场上，愣住了。",
        art = A.evFans,
        options = {
            { text = "向看台鞠躬", response = "欢呼声又高了一层。你和这座城市，连在了一起。", fx = { morale = 12, fame = 300 } },
            { text = "用一记扣篮回应", response = "你把这股力量砸进了篮筐。球迷疯了。", fx = { morale = 10, fame = 250, athletic = 1 } },
        },
    },
    {
        id = "post_media_criticism",
        cat = "post",
        when = { res = "loss", minSeason = 2 },
        title = "名嘴开炮",
        body = "「他配不上这个位置，数据不会说谎。」\n某位评论员在节目里点名批评 %s。截图传遍了球迷群。",
        art = A.evPress,
        options = {
            { text = "「下次见面，继续看」", response = "三周后，同一张嘴改口的速度比翻书还快。", fx = { morale = 5, iq = 2 } },
            { text = "把节目音频设成训练闹钟", response = "每天清晨那段批评准时叫醒你。一个月后你关掉了它——不需要了。", fx = { scoring = 3, morale = 3, stamina = -6 } },
            { text = "完全无视", response = "你连那条新闻都没点开。专注，是最好的反击。", fx = { iq = 3, morale = 4 } },
        },
    },
    {
        id = "post_coach_trust",
        cat = "post",
        when = { minSeason = 1 },
        title = "教练的单独谈话",
        body = "训练结束后，教练把你叫到办公室。他调出一段录像：\n「看到这个空位了吗？你该传的。」%s 盯着屏幕。",
        art = A.bgTraining,
        options = {
            { text = "「我明白了，是我太急」", response = "教练笑了：「你学得很快。」", fx = { iq = 3, morale = 4 } },
            { text = "「但我觉得我能打进」", response = "教练沉默两秒：「那你就得打进。每一次。」", fx = { scoring = 2, morale = -2 } },
            { text = "把这段录像存进手机", response = "此后每次训练前，你都会看一遍。", fx = { iq = 2, playmaking = 1 } },
        },
    },
    {
        id = "post_injury_major",
        cat = "post",
        once = true,
        when = { minSeason = 3 },
        title = "倒下的瞬间",
        body = "落地时脚踝传来一声闷响。%s 躺在木地板上，\n看着球馆的顶灯，第一次觉得它那么远。",
        art = A.evInjury,
        options = {
            { text = "把康复期当成第二课堂", response = "你研究了上百小时录像。回来时，你比受伤前更懂球。", fx = { iq = 5, stamina = -25, morale = -5 } },
            { text = "每天泡在康复室，拼命恢复", response = "你比预计时间提前三周复出。医生都说不可思议。", fx = { athletic = 3, stamina = -15, morale = 2 } },
            { text = "静下心来，重新认识身体", response = "你学会了保护自己。这让你多打了五年球。", fx = { iq = 3, defense = 2, stamina = -10 } },
        },
    },
    {
        id = "post_teammate_bond",
        cat = "post",
        when = { minSeason = 1 },
        title = "空接之城",
        body = "%s 和队里的中锋完成了一次教科书级的空中接力。\n两人落地后对视一眼，什么都没说，但都笑了。",
        art = A.evDunk,
        options = {
            { text = "约他赛后一起加练挡拆", response = "你们的二人转，成了球队最锋利的武器。", fx = { playmaking = 3, morale = 5 } },
            { text = "把这段配合发到社媒", response = "球迷开始给你们起组合名。热度飙升。", fx = { fame = 150, morale = 4 } },
        },
    },
    {
        id = "post_double_double",
        cat = "post",
        when = { minSeason = 2 },
        title = "全面数据",
        body = "得分、篮板、助攻全部上双。技术统计单上，%s 的名字\n后面跟着一排漂亮的数字。教练把它贴在了更衣室门口。",
        art = A.evTraining,
        options = {
            { text = "「这只是常规操作」", response = "队友们起哄。但你知道，保持稳定比爆发更难。", fx = { morale = 6, iq = 2 } },
            { text = "把统计单折起来收好", response = "你把它夹进了训练日记。第 17 页。", fx = { morale = 4, athletic = 2 } },
        },
    },
}

-- ---------------------------------------------------------------------------
-- 日常事件（非比赛周触发）
-- ---------------------------------------------------------------------------
---@type table[]
Events.DAILY = {
    {
        id = "daily_night_training",
        cat = "daily",
        title = "深夜球馆",
        body = "凌晨一点，球馆的灯还亮着。%s 一个人反复练习着同一个动作，\n球撞击地板的声音在空旷的场馆里回荡。",
        art = A.evTraining,
        options = {
            { text = "再练 200 个投篮", response = "离开时天快亮了。你的手臂抬不起来，但心里很踏实。", fx = { scoring = 3, stamina = -12 } },
            { text = "研究自己的投篮录像", response = "你发现了出手点偏低的毛病。这值 200 次练习。", fx = { iq = 3, scoring = 1 } },
            { text = "收工回家，明天还有训练", response = "懂得休息也是一种职业素养。", fx = { stamina = 10, morale = 3 } },
        },
    },
    {
        id = "daily_family_call",
        cat = "daily",
        title = "家里的电话",
        body = "妈妈在电话那头说：「电视上看到你了，瘦了。」\n%s 靠在宿舍窗边，看着楼下的路灯。",
        art = A.bgLocker,
        options = {
            { text = "「我很好，别担心」", response = "挂了电话，你在窗边站了很久。", fx = { morale = 8 } },
            { text = "「等我打出名堂，接你们来现场看球」", response = "这句话，成了你此后每一次加练的理由。", fx = { morale = 12, stamina = -5 } },
        },
    },
    {
        id = "daily_street_game",
        cat = "daily",
        when = { maxSeason = 3 },
        title = "街球场的邀约",
        body = "老家的球场上，一群人在等你。\n「哟，职业球员回来了？」%s 笑着脱下外套。",
        art = A.bgStreet,
        options = {
            { text = "上场打一场野球", response = "没有战术，没有教练，只有篮球最原始的快乐。", fx = { morale = 10, scoring = 1, stamina = -8 } },
            { text = "教孩子们几个动作", response = "看着他们笨拙地模仿，你想起了十岁的自己。", fx = { morale = 8, fame = 60 } },
            { text = "只看不打，怕受伤", response = "职业球员的自觉。但心里有点空落落的。", fx = { morale = -3, stamina = 5 } },
        },
    },
    {
        id = "daily_commercial",
        cat = "daily",
        when = { minFame = 300 },
        title = "品牌代言邀约",
        body = "经纪人的电话打进来：「有家运动品牌想签你，报价不错。」\n%s 看着合同，数字后面有好几个零。",
        art = A.evPress,
        options = {
            { text = "签下来", response = "钱到账了。但你知道，球场上的表现才是根基。", fx = { money = 200, fame = 150 } },
            { text = "先问会不会影响训练", response = "经纪人愣了一下：「你是第一个这么问的。」", fx = { iq = 3, morale = 4 } },
            { text = "拒绝，专注赛季", response = "你挂断电话，回到了球馆。", fx = { scoring = 2, morale = 3, stamina = -6 } },
        },
    },
    {
        id = "daily_fan_letter",
        cat = "daily",
        when = { minFame = 150 },
        title = "一封球迷来信",
        body = "一封手写信躺在训练馆门口的箱子里。\n「我今年 12 岁，因为你，我开始打篮球。」%s 把信读了三遍。",
        art = A.evFans,
        options = {
            { text = "回一封信，附上签名球鞋", response = "两周后你收到回信，字迹歪歪扭扭：「我一定会打进 NBA！」", fx = { morale = 12, fame = 100 } },
            { text = "把信贴在更衣柜里", response = "每次训练前，你都会看它一眼。", fx = { morale = 10, stamina = -4 } },
        },
    },
    {
        id = "daily_rival_trash_talk",
        cat = "daily",
        when = { minSeason = 2 },
        title = "宿敌的挑衅",
        body = "社媒上，同位置的另一位球星发了条动态：\n「有些人只是运气好。」配图是 %s 的防守截图。",
        art = A.evPress,
        options = {
            { text = "在训练中把防守练到吐", response = "下一次交手，他 15 投 3 中。", fx = { defense = 4, stamina = -14 } },
            { text = "评论区回一句「球场上见」", response = "这条回复被转发了两万次。下一次对决，全城瞩目。", fx = { fame = 200, morale = 5 } },
            { text = "关掉手机，什么都不看", response = "你只关心明天的训练计划。", fx = { iq = 3, morale = 4 } },
        },
    },
    {
        id = "daily_slump",
        cat = "daily",
        when = { moraleMax = 45 },
        title = "低迷期",
        body = "连续几场比赛，球就是不进。%s 站在空无一人的球馆里，\n看着篮筐，第一次怀疑自己。",
        art = A.bgTraining,
        options = {
            { text = "找个老前辈聊聊", response = "「我生涯有过三次这样的低谷。」他说，「第三次之后我拿了冠军。」", fx = { morale = 15, iq = 2 } },
            { text = "从最基础的运球重新练起", response = "你回到了原点。三天后，手感回来了。", fx = { morale = 10, playmaking = 2, stamina = -8 } },
            { text = "给自己放三天假", response = "你去了海边。回来时，整个人都轻了。", fx = { morale = 18, stamina = 20 } },
        },
    },
    {
        id = "daily_youth_camp",
        cat = "daily",
        when = { minSeason = 3 },
        title = "青训营的孩子们",
        body = "俱乐部安排你去青训营指导。一群十岁出头的孩子\n围着你，眼睛亮得像灯泡。%s 蹲下来。",
        art = A.evTraining,
        options = {
            { text = "手把手教他们投篮", response = "有个孩子投进了人生第一个三分，跑过来抱住你的腿。", fx = { morale = 10, fame = 80 } },
            { text = "告诉他们「天赋不如坚持」", response = "这句话，也是你对自己说的。", fx = { morale = 8, iq = 2 } },
        },
    },
    {
        id = "daily_gym_session",
        cat = "daily",
        title = "力量房",
        body = "体能师把新的训练计划拍在 %s 面前：「想在内线立足，\n你得再壮十斤。」",
        art = A.bgTraining,
        options = {
            { text = "咬牙完成全部计划", response = "三个月后，你在对抗中再也推不动了。", fx = { athletic = 4, stamina = -14 } },
            { text = "要求加入灵活性训练", response = "「聪明。」体能师点头，「力量不是全部。」", fx = { athletic = 3, iq = 2, stamina = -8 } },
        },
    },
    {
        id = "daily_contract_talk",
        cat = "daily",
        when = { minSeason = 3, minFame = 400 },
        title = "续约谈判",
        body = "经纪人和球队管理层坐在长桌两端。\n桌上摊着一份新合同，%s 的名字印在最上面。",
        art = A.evPress,
        options = {
            { text = "争取顶薪", response = "谈判僵持了两周，最终球队让步。", fx = { money = 400, morale = 6 } },
            { text = "接受略低的报价，换取球队补强承诺", response = "管理层愣住了，随即握手：「我们会为你带来帮手。」", fx = { money = 200, morale = 12, fame = 100 } },
            { text = "让经纪人全权处理，自己专心训练", response = "你在球馆里，直到合同签完才看手机。", fx = { money = 300, iq = 3 } },
        },
    },
    {
        id = "daily_media_viral",
        cat = "daily",
        when = { minSeason = 2, minFame = 250 },
        title = "训练视频意外走红",
        body = "一段你加练的竖屏视频被路人传上网，配乐是悲壮的曲子。\n评论区最热：「原来职业球员的『下班』是别人的『上班』。」",
        art = A.evTraining,
        options = {
            { text = "点赞那条最热的评论", response = "一个赞让视频二次爆火。你顺手关注了拍摄的路人。", fx = { fame = 200, morale = 5 } },
            { text = "什么都不做，继续练", response = "第二天你还是练到最后一刻。热度会过去，弧线不会。", fx = { scoring = 3, morale = 6 } },
        },
    },
}

-- ---------------------------------------------------------------------------
-- 里程碑事件（确定性触发，每阶段一次）
-- ---------------------------------------------------------------------------
---@type table[]
Events.MILESTONE = {
    {
        id = "ms_debut",
        cat = "ms",
        once = true,
        when = { minSeason = 1 },
        title = "职业生涯第一场",
        body = "球衣挂在你面前，背号是你自己选的。\n%s 伸手摸了摸那个数字，然后把它套在头上。",
        art = A.bgLocker,
        options = {
            { text = "「从今天开始」", response = "你走上球场。记分牌上，你的名字第一次亮起。", fx = { morale = 10, fame = 50 } },
        },
    },
    {
        id = "ms_allstar",
        cat = "ms",
        once = true,
        when = { minSeason = 3, minFame = 600 },
        title = "首次入选全明星",
        body = "名单公布的那一刻，%s 正在训练馆投篮。\n手机在长椅上震了整整一分钟。",
        art = A.evFans,
        options = {
            { text = "把好消息第一个告诉家人", response = "电话那头，妈妈哭了。", fx = { morale = 15, fame = 400 } },
            { text = "继续把那组投篮投完", response = "投完最后一个，你才拿起手机。全明星只是起点。", fx = { morale = 12, scoring = 2, fame = 400 } },
        },
    },
    {
        id = "ms_champion",
        cat = "ms",
        once = true,
        when = { minSeason = 5, minFame = 1000 },
        title = "总冠军之夜",
        body = "终场哨响，彩带从天而降。%s 抱着奖杯，\n看着看台上哭成一片的球迷，忽然什么都听不见了。",
        art = A.evTrophy,
        options = {
            { text = "把奖杯举过头顶", response = "这一刻，你等了整整十年。", fx = { morale = 20, fame = 800, money = 300 } },
            { text = "把奖杯先递给老教练", response = "「这是你应得的。」你说。老人摇了摇头，笑了。", fx = { morale = 20, fame = 600, iq = 3 } },
        },
    },
    {
        id = "ms_mvp",
        cat = "ms",
        once = true,
        when = { minSeason = 6, minFame = 1500 },
        title = "常规赛 MVP",
        body = "联盟总裁念出 %s 名字的瞬间，\n整个球馆起立。这是对一个赛季最高的肯定。",
        art = A.evTrophy,
        options = {
            { text = "「这个奖属于整支球队」", response = "队友们在台下鼓掌。你把奖杯带回了更衣室。", fx = { morale = 18, fame = 700 } },
        },
    },
    {
        id = "ms_retire",
        cat = "ms",
        once = true,
        when = { minAge = 33 },
        title = "最后一舞",
        body = "合同到期了。%s 坐在空荡的更衣室里，\n看着自己穿了十几年的那个号码。是时候了吗？",
        art = A.bgLocker,
        options = {
            { text = "再打一年", response = "你把球衣重新挂好。「再来一次。」", fx = { morale = 10, stamina = 20 } },
            { text = "宣布退役", response = "发布会那天，很多老球迷来了。他们举着你年轻时的海报。", fx = { morale = -5, fame = 500 } },
        },
    },
}

-- ---------------------------------------------------------------------------
-- 赛季末事件
-- ---------------------------------------------------------------------------
---@type table[]
Events.SEASON_END = {
    {
        id = "se_season_review",
        cat = "se",
        title = "赛季总结会",
        body = "教练在白板上写下整个赛季的数据。\n%s 看着自己的那一行，思考着下个赛季要变成什么样。",
        art = A.bgTraining,
        options = {
            { text = "「我想成为球队的第一选择」", response = "教练盯着你看了很久，然后点头：「那就去证明。」", fx = { morale = 8, scoring = 2 } },
            { text = "「我想成为更全面的球员」", response = "你列了一张清单，五项能力，每一项都要提升。", fx = { iq = 3, playmaking = 1 } },
            { text = "「我想赢球，其他都不重要」", response = "「那你得先让身边的人变得更好。」教练说。", fx = { morale = 6, playmaking = 2 } },
        },
    },
    {
        id = "se_offseason_plan",
        cat = "se",
        title = "休赛期计划",
        body = "漫长的休赛期开始了。%s 手里有一份空白日历，\n和整整三个月可以自由支配的时间。",
        art = A.bgTraining,
        options = {
            { text = "报一个投篮特训营", response = "每天 1000 次投篮。三个月后，你的出手速度提升了一个档次。", fx = { scoring = 5, stamina = -20 } },
            { text = "增重 8 公斤，强化对抗", response = "力量房成了你的第二个家。三个月后，没人能轻易顶动你。", fx = { athletic = 5, stamina = -20 } },
            { text = "研究联盟所有对手的录像", response = "你成了联盟里最了解对手的人。", fx = { iq = 5, stamina = -10 } },
        },
    },
}

-- 拼装完整卡池
---@type table<string, table[]>
Events.POOLS = {
    pre = Events.PRE,
    post = Events.POST,
    daily = Events.DAILY,
    ms = Events.MILESTONE,
    se = Events.SEASON_END,
}

return Events
