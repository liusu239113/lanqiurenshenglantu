/* ============================================================================
   P4 · G3 国内杯赛 20 张（十六强5 / 八强5 / 半决赛5 / 决赛5）— 进 post 池
   触发：when { cup:true, cupStage:0-3 } + 引擎旗标（htDown3/lastMinGoal/
   sentOff/pensWon）——全部由比赛引擎诚实计算（策划案 7.1）。
   ============================================================================ */
(function () {
  window.CUP_CARDS = [
    // ── 十六强（stage 0）──
    /* ★★ P116（用户拍板「没有的比赛就不要凭空捏造」）：**删除** cup_r16_rotation
       「杯赛首战的取舍」—— 选项回应捏造具体出场事实（「你首发了并踢满 75 分钟」
       「替补登场 20 分钟进球了」），而每场比赛都已由引擎真实模拟（本场可能未出场/替补），
       事件卡与真实战报（「未出场」）同屏对撞 = 穿帮。同类口径审计见本文件下方两处重写。 */
    { id: "cup_r16_upset", stage: "post", tier: "L1", cat: "cup_r16", once: "cup_r16_upset", art: "ec_rain", when: { cup: true, cupStage: 0, minSeason: 2 },
      title: "弱旅的铜墙铁壁", body: "低级别对手摆出了全员退守的阵型——十个人缩在禁区里，摆大巴摆出了艺术感。你的每一次渗透都撞在墙上，看台开始焦躁。",
      options: [
        { text: "「耐心传，让他们先出错。」", response: "你们把传控节奏放到最慢，逼对手自己出来。他们终于忍不住压出来——空间立刻出现了。",
          fx: { coach_trust: 4, discipline: 3 } },
        { text: "「远射！炸开铁桶！」", response: "你带头在外围发炮。第四脚终于制造了角球，角球制造了混乱——铁桶最怕的就是不按套路的重锤。",
          fx: { confidence: 4, morale: 3 } },
      ] },
    { id: "cup_r16_pen_shoot", stage: "post", tier: "L1", cat: "cup_r16", once: "cup_r16_pen", art: "ec_penalty", when: { cup: true, cupStage: 0, pensWon: "win", userPen: "scored" },
      title: "点球大战的幸存者", body: "五轮互射，你顶住压力罚进了自己那轮。终场哨响那一刻，你瘫坐在草皮上——杯赛首轮就用光了心脏的额度。",
      options: [
        { text: "把这场写进「大心脏存折」", response: "你在备忘录里给这场点球战画了颗星。往后每次紧张，你都翻出来看一眼——原来我扛住过。",
          fx: { confidence: 6, morale: 4 } },
        { text: "感谢门将，把功劳分他", response: "你公开说：「门将扑出的那一记才是胜负手。」门将把你抱了起来——更衣室的最硬关系又硬了一层。",
          fx: { chemistry: 5, morale: 4 } },
      ] },
    { id: "cup_r16_pen_lose", stage: "post", tier: "L1", cat: "cup_r16", once: "cup_r16_penl", art: "ec_penalty", when: { cup: true, cupStage: 0, pensWon: "lose", userPen: "scored" },
      title: "十二码的告别", body: "你罚进了，但队友失手了。点球大战输掉的感觉很奇怪——你个人没有失败，但集体出局了。看台上有人骂，也有人鼓掌。",
      options: [
        { text: "安慰罚丢的队友", response: "你搂住他：「明年我们再回来。」他抬头看了你一眼——那一眼里有感激，也有不甘。",
          fx: { chemistry: 5, morale: 2 } },
        { text: "把遗憾刻进下赛季", response: "你在赛季目标清单里加了一条粗体：杯赛，走到最后。输过的滋味，是最好的燃料。",
          fx: { confidence: 4, discipline: 4 } },
      ] },
    { id: "cup_r16_young_blood", stage: "post", tier: "L1", cat: "cup_r16", once: "cup_r16_young", art: "ec_youth", when: { cup: true, cupStage: 0, minSeason: 3 },
      title: "带新人踢杯赛", body: "教练在杯赛首轮排出轮换阵容，一名 17 岁青训生迎来一线队首秀——位置就在你旁边。他热身时腿在抖。",
      options: [
        { text: "「跟紧我，出球找我。」", response: "你把跑位路线掰开揉碎讲给他听，热身时一直带着他做。首秀的紧张在信任里化开——传承的第一课，教得漂亮。",
          fx: { chemistry: 5, morale: 4 } },
        { text: "让他自己面对压力", response: "你没有特殊照顾他，让他在对抗里自己找答案。那晚青训营的灯亮到最晚——野生的成长，同样珍贵。",
          fx: { chemistry: 3, confidence: 3 } },
      ] },
    // ── 八强（stage 1）──
    { id: "cup_qf_giant", stage: "post", tier: "L1", cat: "cup_qf", once: "cup_qf_giant", art: "ec_stadium", when: { cup: true, cupStage: 1, minSeason: 1 },
      title: "八强抽中的巨人", body: "八强抽签，你们抽中了联赛领头羊——那支人人畏惧的巨无霸。更衣室里有人叹气，教练却把抽签结果贴在最显眼处：「证明自己的机会来了。」",
      options: [
        { text: "「巨人也是十一个人踢。」", response: "你把这句话发在了队群。训练周的氛围从恐惧变成了亢奋——有时候球队需要的只是一句合适的话。",
          fx: { confidence: 5, chemistry: 4 } },
        { text: "研究巨人近五场的疲态", response: "你发现巨人最近三周踢了六场比赛，核心中场跑了最长的距离。疲惫是巨人唯一的软肋——你把它标红了。",
          fx: { coach_trust: 5, discipline: 4 } },
      ] },
    { id: "cup_qf_dark_horse", stage: "post", tier: "L1", cat: "cup_qf", once: "cup_qf_dark", art: "ec_stadium", when: { cup: true, cupStage: 1, minSeason: 2 },
      title: "黑马的对决", body: "八强的对手也是本届黑马——一支和你一样连爆冷门的队伍。两家球迷已经开始炒作「草根对决」。这场比赛，是两个逆袭故事必须死一个的残忍剧本。",
      options: [
        { text: "「我们更渴望。」", response: "你在发布会上说了这三个字。渴望这种东西，看不见摸不着，但它决定了我方每球的拼抢高度。",
          fx: { confidence: 4, fan_love: 4 } },
        { text: "尊重对手，专注自己", response: "你拒绝参与口水战：「他们值得尊重。」这份体面被对手主帅公开点赞——黑马与黑马之间，也可以惺惺相惜。",
          fx: { media_relation: 5, discipline: 3 } },
      ] },
    { id: "cup_qf_yellow_risk", stage: "post", tier: "L1", cat: "cup_qf", once: "cup_qf_yellow", art: "ec_penalty", when: { cup: true, cupStage: 1, minSeason: 2 },
      title: "黄牌的达摩克利斯之剑", body: "你身背一张淘汰赛黄牌——再吃一张就停赛半决赛。对手的前锋赛前放话：「我们会专门找你。」挂账踢关键战，是每个后卫和中场的噩梦。",
      options: [
        { text: "「该铲还得铲，技术性防守。」", response: "你研究了干净的防守姿势：卡位代替出脚。全场零犯规完成封锁——克制也是一种武器。",
          fx: { discipline: 5, confidence: 4 } },
        { text: "申请改打不担责的位置", response: "你主动和教练沟通换位。教练欣赏你的清醒：「知道自己的价值，才是真正的成熟。」",
          fx: { coach_trust: 4, discipline: 3 } },
      ] },
    { id: "cup_qf_ht_bomb", stage: "post", tier: "L1", cat: "cup_qf", once: "cup_qf_htbomb", art: "ec_halftime", when: { cup: true, cupStage: 1, htDown3: true },
      title: "八强战的悬崖", body: "半场结束，你们已经三球落后。八强的梦想在四十五分钟里碎了一地。教练在更衣室没有发火，只是问了一句：「你们还想不想踢？想踢的人，下半场跟我走。」",
      options: [
        { text: "第一个站起来", response: "你站起来的瞬间，全队陆续站起。下半场你们赢了——虽不足以逆转比分，但足以赢回尊严。看台为下半场单独鼓掌。",
          fx: { morale: 6, confidence: 4, fan_love: 3 } },
        { text: "「保住净胜球，别崩盘。」", response: "你提议务实收缩，避免一场惨案毁掉赛季心态。教练同意了——溃败边缘，止损也是勇气。",
          fx: { coach_trust: 4, discipline: 3 } },
      ] },
    { id: "cup_qf_lastmin", stage: "post", tier: "L1", cat: "cup_qf", once: "cup_qf_lastmin", art: "ec_goal", when: { cup: true, cupStage: 1, lastMinGoal: true },
      title: "八十五分钟后的心跳", body: "这场比赛的胜负在第 85 分钟之后才见分晓——有进球，有心跳骤停，有你这辈子跑得最快的十秒。终场哨响时你听见了自己的耳鸣。",
      options: [
        { text: "「记住这种感觉——会上瘾。」", response: "你在日记里写：「这就是足球为什么让人发疯。」肾上腺素是最好的记忆剂，这一夜终生难忘。",
          fx: { confidence: 6, morale: 5 } },
        { text: "第一时间找队友击掌", response: "你逐个和队友击掌——那种时刻没有人应该独自庆祝。集体的心跳，才是最响的。",
          fx: { chemistry: 5, morale: 4 } },
      ] },
    // ── 半决赛（stage 2）──
    { id: "cup_sf_two_leg", stage: "post", tier: "L1", cat: "cup_sf", once: "cup_sf_twoleg", art: "ec_training", when: { cup: true, cupStage: 2, minSeason: 2 },
      title: "半决赛的心理战", body: "半决赛前，对手主帅在发布会上玩起了心理战：「他们那个年轻人会被大场面吓坏。」所有人知道「那个年轻人」是谁——是你。",
      options: [
        { text: "「大场面？我就是为这个长大的。」", response: "你的回应上了头条，配图是你首秀时的青涩照。媒体帮你讲了个最好的成长故事——然后你用表现给它结了尾。",
          fx: { confidence: 6, media_relation: 4 } },
        { text: "沉默，让球说话", response: "你全程未回应，专注备战。赛后你没有庆祝——对手主帅主动握手：「你让我闭嘴的方式很高级。」",
          fx: { discipline: 4, confidence: 4 } },
      ] },
    { id: "cup_sf_squad_ban", stage: "post", tier: "L1", cat: "cup_sf", once: "cup_sf_ban", art: "ec_penalty", when: { cup: true, cupStage: 2, sentOff: true },
      title: "半决赛的红牌", body: "你在半决赛被红牌罚下——那是你职业生涯的第一张直接红牌。离场时全场的声浪像潮水一样淹没你，你走过通道时不敢抬头。",
      options: [
        { text: "公开发表道歉声明", response: "你的道歉诚恳而克制，联盟和球迷都接受了。犯错不可怕，可怕的是不认——这份担当给你挣回了口碑。",
          fx: { fan_love: 3, discipline: 3, morale: -2 } },
        { text: "用停赛期做全队后勤", response: "停赛期间你成了「编外助教」：帮队友分析、递水、打杂。复出那天，全队为你鼓掌——坐过冷板凳的人，更懂热身的重要性。",
          fx: { chemistry: 6, morale: 4 } },
      ] },
    { id: "cup_sf_final_step", stage: "post", tier: "L1", cat: "cup_sf", once: "cup_sf_step", art: "ec_trophy", when: { cup: true, cupStage: 2, pensWon: "win", played: true },
      title: "距离决赛只差一步", body: "点球大战淘汰对手，球队闯入决赛。更衣室的香槟被拦下了——队长说：「决赛再开。现在开始，谁也不许提『尽力了』三个字。」",
      options: [
        { text: "「决赛，我们把奖杯带回家。」", response: "你的表态让更衣室的火焰烧得更旺。距离历史只有一步——全队都闻到了奖杯上的香水味。",
          fx: { confidence: 6, morale: 5 } },
        { text: "「冷静。决赛是另一场 90 分钟。」", response: "你主动给热潮降温。防止决赛前的膨胀，也是老队员的价值——后来教练说，这句话值一个冠军。",
          fx: { coach_trust: 5, discipline: 4 } },
      ] },
    { id: "cup_sf_underdog_win", stage: "post", tier: "L1", cat: "cup_sf", once: "cup_sf_underdog", art: "ec_tifo", when: { cup: true, cupStage: 2, minSeason: 3 },
      title: "以下克上之夜", body: "全队赛前被一致看衰——纸面实力、身价、历史交锋全部落后。但 90 分钟后，晋级的是你们。更衣室里有人哭了，有人笑了，有人开始打电话告诉家里。",
      options: [
        { text: "「我们不叫冷门，叫实力。」", response: "你在赛后采访里的宣言成了次日头版。黑马的身份用一场比赛洗掉——从此你们的对手不敢再用旧眼光。",
          fx: { confidence: 6, fame: 300, fan_love: 4 } },
        { text: "感谢每一个不被看好的人", response: "你逐个感谢了被媒体质疑的队友。被看衰的日子一起扛过来的人，感情比顺境里深十倍。",
          fx: { chemistry: 6, morale: 5 } },
      ] },
    { id: "cup_sf_final_ticket", stage: "post", tier: "L1", cat: "cup_sf", once: "cup_sf_ticket", art: "ec_trophy", when: { cup: true, cupStage: 2, minSeason: 1 },
      title: "决赛门票的重量", body: "球队挺进决赛。你第一次距离职业冠军这么近——训练基地的走廊里，每个人走路都带风。你的手机里躺着 47 条祝贺短信。",
      options: [
        { text: "给自己定「决赛纪律」", response: "你写下决赛周纪律：早睡、拒酒、不看评论。纪律这种东西，平时像枷锁，决赛前像护身符。",
          fx: { discipline: 5, confidence: 4 } },
        { text: "给家人留最好的位置", response: "你把决赛票寄回家。母亲回消息：「你爸已经把西装熨好了。」那是他这辈子第二次穿西装。",
          fx: { morale: 6, fan_love: 3 } },
      ] },
    // ── 决赛（stage 3）──
    { id: "cup_f_pen_win", stage: "post", tier: "L1", cat: "cup_final", once: "cup_f_penw", art: "ec_trophy", when: { cup: true, cupStage: 3, pensWon: "win", userPen: "scored" },
      title: "决赛点球：心脏的极限运动", body: "决赛拖入点球大战——体育世界里最残酷的十分钟。你顶住一切罚进了那一轮，然后全队等来了最后一声哨。冠军。你们是冠军。",
      options: [
        { text: "跪地长啸，把整季的压力放空", response: "你跪在草皮上嘶吼的画面成为赛季最佳镜头。有些情绪必须释放——攒了一季的东西，值得一次全力的宣泄。",
          fx: { morale: 10, confidence: 8, fame: 500 } },
        { text: "先去找扑救的门将", response: "全队冲向你的时候，你却跑向了反方向——去拥抱门将。点球大战的英雄是他，你只是没有搞砸的人。",
          fx: { chemistry: 8, morale: 8, fan_love: 5 } },
      ] },
    { id: "cup_f_pen_lose", stage: "post", tier: "L1", cat: "cup_final", once: "cup_f_penl", art: "ec_penalty", when: { cup: true, cupStage: 3, pensWon: "lose", played: true },
      title: "决赛点球：一步之遥的银牌", body: "点球大战输了。决赛的银牌在领奖台上闪着让人难过的光。你站在领奖台上没有笑——亚军的奖牌，是全世界最重的安慰奖。",
      options: [
        { text: "「银牌是下赛季的路标。」", response: "你在更衣室说了这句话，然后把银牌收进柜子最深处。有些疼痛要留着——它比香槟更能让人清醒。",
          fx: { discipline: 6, confidence: 4, morale: -3 } },
        { text: "感谢走到决赛的每一个人", response: "你在更衣室向全队鞠躬：「我们输了一场比赛，但赢了一个赛季的尊重。」眼泪在更衣室里流，但腰杆是直的。",
          fx: { chemistry: 6, morale: 4, fan_love: 4 } },
      ] },
    { id: "cup_f_ht_cliff", stage: "post", tier: "L1", cat: "cup_final", once: "cup_f_ht", art: "ec_halftime", when: { cup: true, cupStage: 3, htDown3: true },
      title: "决赛的三球悬崖", body: "决赛半场三球落后——职业生涯最黑暗的四十五分钟正在发生。教练的眼神里有火：「还有四十五分钟，够写一个奇迹。写不写，你们定。」",
      options: [
        { text: "「写。用四个球写。」", response: "你们真的追了回来——虽然奇迹最终由引擎裁定，但你带头反扑的那口气，看台看得清清楚楚。历史会记住不放弃的人。",
          fx: { morale: 8, confidence: 6, fan_love: 5 } },
        { text: "「保住尊严，别让比分难看。」", response: "你选择收缩止损。决赛大败是常态，但崩溃不是——你保住了球队的体面，也保住了下季的心态。",
          fx: { coach_trust: 5, discipline: 4 } },
      ] },
    { id: "cup_f_sent_off", stage: "post", tier: "L1", cat: "cup_final", once: "cup_f_sentoff", art: "ec_penalty", when: { cup: true, cupStage: 3, sentOff: true },
      title: "决赛红牌：最痛的离场", body: "你在决赛被红牌罚下——职业生涯最痛的离场。走过通道时，你能听见队友在少一人的情况下继续拼杀。你坐在更衣室里，通过墙壁的震动「看」完了剩下的比赛。",
      options: [
        { text: "「我会用整个生涯赎这张牌。」", response: "你在发布会上说了这句话，然后真的做到了——此后三年零红牌。错误的价值，在于它变成转折点的那一天。",
          fx: { discipline: 6, morale: -2, confidence: 3 } },
        { text: "通道里陪着被换下的人聊天", response: "你没有独自消化痛苦，而是和其他离场的人一起给场上「远程加油」。集体的失败没有个人，集体的荣誉也不会忘记任何一员。",
          fx: { chemistry: 5, morale: 3 } },
      ] },
    { id: "cup_f_last_min", stage: "post", tier: "L1", cat: "cup_final", once: "cup_f_lastmin", art: "ec_goal", when: { cup: true, cupStage: 3, lastMinGoal: true },
      title: "决赛第 85 分钟之后", body: "决赛的胜负在第 85 分钟后才尘埃落定——那种心跳的频率，你这辈子只在决赛体验过。终场哨响的瞬间，时间和声音都变了质。",
      options: [
        { text: "把球衣撕了（开玩笑的那种）", response: "你兴奋到差点真撕了球衣，被队友笑着按住。这个「未遂撕衫」成了球迷最爱的梗图——快乐需要一点荒诞。",
          fx: { morale: 10, confidence: 6, fan_love: 5 } },
        { text: "找场边的家人", response: "你冲向看台边，和家人隔栏相拥。进球的荣耀只有一瞬，但让爱你的人看到你的荣耀——那是永恒。",
          fx: { morale: 8, fan_love: 5, fame: 200 } },
      ] },
  ];

  // ── G6 国家队窗口首批（10 张，进 intl 池）──
  window.INTL_EXTRA = [
    { id: "iw2_first_camp", stage: "intl", tier: "L2", cat: "intl_camp", once: "iw2_first_camp", art: "ec_flag", when: {},
      title: "国家队首训的更衣室", body: "国家队更衣室的柜子上印着国徽。你的名字第一次出现在国家队名单上——训练前你盯着那个柜子看了整整一分钟。",
      options: [
        { text: "摸一摸国徽再打开柜门", response: "这个小动作被拍了下来，配文：「他知道自己代表什么。」千万网友点赞了这个瞬间。",
          fx: { morale: 5, fan_love: 4 } },
        { text: "「别看柜子，看训练场。」", response: "你拍了拍自己的脸走进训练场。第一堂训练课，你用一次世界级扑救式的铲断让老国脚记住了你。",
          fx: { confidence: 5, coach_trust: 3 } },
      ] },
    { id: "iw2_jetlag", stage: "intl", tier: "L2", cat: "intl_camp", once: "iw2_jetlag", art: "ec_flag", when: {},
      title: "跨时区的疲惫", body: "客场洲际拉练：三个国家、两次转机、五个小时的时差。你的生物钟像被揉皱的纸。队医说：「国际比赛日的旅程，本身就是对手。」",
      options: [
        { text: "严格执行倒时差方案", response: "你按队医的方案光照、进食、睡眠三线并调。第三天你成为了全队状态最稳的人——细节的胜利。",
          fx: { discipline: 4 } },
        { text: "用训练强度倒逼适应", response: "你选择用高强度训练强行「重置」身体。第一场疲惫不堪，第二场神清气爽——赌对了，但队医捏了把汗。",
          fx: { confidence: 4 } },
      ] },
    { id: "iw2_national_anthem", stage: "intl", tier: "L2", cat: "intl_camp", once: "iw2_anthem", art: "ec_flag", when: {},
      title: "第一次奏国歌", body: "生涯第一次以国字号身份站在场上听国歌奏响。旁边是两夺亚洲杯的老队长，他唱国歌时眼里有光。你跟着张了张嘴——你还没背熟歌词。",
      options: [
        { text: "当晚背熟国歌歌词", response: "第二场比赛，你全程大声唱完了国歌。老队长拍拍你：「这才像个国家队的人。」",
          fx: { morale: 5, fan_love: 4 } },
        { text: "在更衣室问国歌的故事", response: "老队长给你讲了国歌在客场的三个名场面。从此你唱国歌时，不只是唱——是在接棒。",
          fx: { morale: 4, chemistry: 4 } },
      ] },
    { id: "iw2_position_bench", stage: "intl", tier: "L2", cat: "intl_camp", once: "iw2_bench", art: "ec_bench", when: {},
      title: "国家队的三号选择", body: "国家队同一位置人才济济，你的顺位暂时是第三。老国脚们私下说：「第三号的任务是随时待命——可能在任何时候被扔上场。」",
      options: [
        { text: "「把每次热身都当世界杯踢。」", response: "你用训练态度征服了教练组。第 60 分钟的登场机会来临时，你已经热身完毕——机会来了就抓得住。",
          fx: { confidence: 4, discipline: 4 } },
        { text: "申请去国家二队练级", response: "你主动申请下级梯队打主力。「宁做鸡头不做凤尾」的选择有争议——但比赛时间不会骗人，你涨球了。",
          fx: { confidence: 3, coach_trust: 3 } },
      ] },
    { id: "iw2_club_coach_call", stage: "intl", tier: "L2", cat: "intl_camp", once: "iw2_clubcall", art: "ec_phone", when: {},
      title: "俱乐部的「关心」电话", body: "国家队集训期间，俱乐部教练打来电话：「注意别受伤，联赛更靠你。」挂电话后你陷入两难——为国征战是荣誉，俱乐部是你的饭碗。",
      options: [
        { text: "两头都拼，身体自己管好", response: "你在国家队比赛里全力发挥，归队后主动加练恢复。两边教练都挑不出毛病——累，但值。",
          fx: { confidence: 5, coach_trust: 3 } },
        { text: "和国家队长谈负荷管理", response: "国家队长帮你和教练组沟通了负荷方案。成熟的沟通让你两边都拿到了信任——管理期望也是职业素养。",
          fx: { coach_trust: 4, discipline: 3 } },
      ] },
    { id: "iw2_big_opponent", stage: "intl", tier: "L2", cat: "intl_match", once: "iw2_bigopp", art: "ec_flag", when: {},
      title: "亚洲之巅的对手", body: "预选赛抽到亚洲排名第一的劲旅。全队筑起大巴，你被赋予反击箭头的重任——全场可能只有三次触球机会，但每一次都是黄金。",
      options: [
        { text: "「三次机会，进一次就够。」", response: "你把三次触球变成了一次单刀。效率让对手胆寒——弱队打强队，比的不是场面，是刀锋。",
          fx: { confidence: 6, fame: 250 } },
        { text: "「我回撤当第七个防守人。」", response: "你主动承担防守任务，跑出了全场最长距离。虽无进球，防守数据拉满——团队需要的英雄，有时候不进球。",
          fx: { coach_trust: 5, fan_love: 4 } },
      ] },
    { id: "iw2_home_debut_goal", stage: "intl", tier: "L2", cat: "intl_match", once: "iw2_homegoal", art: "ec_goal", when: {},
      title: "主场首球献给看台", body: "国家队主场首球——皮球入网时，看台的声浪像海啸压过来。你跑向角旗区，身后是万人跟跑的名场面。",
      options: [
        { text: "行军礼庆祝", response: "你的军礼庆祝上了热搜第一：「这个进球，敬所有守夜的人。」家国情怀与足球在这里合流。",
          fx: { fame: 300, fan_love: 6, morale: 5 } },
        { text: "展示藏在球衣里的照片", response: "球衣里面的照片是你 10 岁第一次踢球的合影。这个庆祝让全国人看到了你为什么出发。",
          fx: { fame: 250, morale: 6, fan_love: 5 } },
      ] },
    { id: "iw2_media_nation", stage: "intl", tier: "L2", cat: "intl_camp", once: "iw2_media", art: "ec_press", when: {},
      title: "国家队的镜头密度", body: "国家队的媒体关注度是俱乐部的十倍——你绑鞋带的动作都能上热搜。队里的老国脚提醒：「在这里，你说的话是 14 亿人听的。」",
      options: [
        { text: "谨言慎行，只谈足球", response: "你给自己立了「国家队发言三原则」。低调让你的场上表现成为唯一话题——这是最安全的路线。",
          fx: { media_relation: 3, discipline: 4 } },
        { text: "展现个性，敢于表达", response: "你有话直说的真性情圈粉无数。国家队需要的不只是机器人——个性也是凝聚力的一部分。",
          fx: { fan_love: 5, media_relation: 3 } },
      ] },
    { id: "iw2_teammate_legend", stage: "intl", tier: "L2", cat: "intl_camp", once: "iw2_legend", art: "ec_tribute", when: {},
      title: "和传奇同场", body: "这场比赛你与亚洲足球的活传奇同场竞技——他 38 岁，第五次冲击世界杯。中场休息他跟你说：「小子，我看你传球像看到当年的我。」",
      options: [
        { text: "「我要接过你的旗。」", response: "传奇大笑：「旗子给你留着——先把它抢过去。」这场对话的照片后来配上了「交接棒」的标题。",
          fx: { confidence: 5, morale: 4 } },
        { text: "「先教我怎么在 38 岁还在踢。」", response: "传奇认真地讲了十分钟保养心得——关于睡眠、饮食、心态。传奇的经验，是比签名更珍贵的东西。",
          fx: { discipline: 4, injury_risk: -3 } },
      ] },
    { id: "iw2_qualify_night", stage: "intl", tier: "L2", cat: "intl_match", once: "iw2_qualify", art: "ec_trophy", when: {},
      title: "出线之夜", body: "终场哨响，球队拿到了大赛正赛资格。全场陷入狂欢，有人跪地痛哭，有人脱衣狂奔。你站在草皮中央，让这个瞬间烙进记忆。",
      options: [
        { text: "拥抱身边每一个人", response: "你一个不落地拥抱了全体成员——包括队务和厨师。出线是几十人的事业，荣耀属于所有人。",
          fx: { chemistry: 5, morale: 6, fan_love: 4 } },
        { text: "给青训教练打视频电话", response: "你把镜头对准狂欢的球场，对启蒙教练说：「当年你说的那句话，我做到了。」电话那头泣不成声。",
          fx: { morale: 6, fame: 200, confidence: 4 } },
      ] },
  ];
})();
