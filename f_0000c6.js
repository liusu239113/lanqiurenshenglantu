/* ============================================================================
   P20 内容侧收尾批（21 张）— G1 尾 1（92/92 完结）/ G11 +8（40/40）/ G12 +6（24/24）/ G14 +6（24/24）
   MAINLINE_BRANCHES4 进 post 池 · OFF4_* 进 offseason 池（cat 分流同 OFF3）
   沿用管线：L1 每半季≤4 / L2 ≤3 · 同类冷却 8 轮 · once 整生涯唯一
   ============================================================================ */
(function () {
  /* ── G1 主线支线尾张（ch7 伤病与转会）── */
  window.MAINLINE_BRANCHES4 = [
    { id: "mlb4_rehab_brotherhood", stage: "post", tier: "L2", cat: "mainline_ch7", once: "mlb4_rehab_brotherhood", art: "ec_rehab", when: { minSeason: 2 },
      title: "康复室的第二张床", body: "长期康复室里隔壁床来了个十九岁的少年，和你一样的伤。他看你每天雷打不动做三组训练，忍不住问：「哥，你不烦吗？」你指了指窗外：「看见那片场地吗？我在攒回去的门票。」",
      options: [
        { text: "把你的康复计划抄一份给他", response: "你把整理了半年的康复笔记复印给他，标注了每一处「这里最容易偷懒」。三个月后他先你一步出院，临走敬了个礼：「哥，场地见。」——伤病偷走时间，但偷不走传下去的东西。",
          fx: { chemistry: 5, morale: 4, professionalism: 3 } },
        { text: "和他约定复出后同场竞技", response: "你们约定各自复出后的第一场对决——不管谁在哪家俱乐部。半年后这个约定成了体育版的浪漫新闻，而你多了一个每场都拼命的理由。",
          fx: { confidence: 5, morale: 3, fan_love: 3 } },
      ] },
  ];

  /* ── G11 休赛日常 +8（40/40 完结）── */
  window.OFF4_DAILY = [
    { id: "off4_roof_garden", stage: "offseason", tier: "L2", cat: "off_daily", once: "off4_roof_garden", art: "ec_city", when: {},
      title: "阳台上的小菜园", body: "你在阳台种了番茄和薄荷，说是「休赛期第二运动」。浇水时邻居大爷探头：「小伙子，你那颗番茄的跑位有问题——长歪了。」",
      options: [
        { text: "认真请教大爷园艺经", response: "大爷的三分钟番茄课比你想的深：「侧枝要掐，主秆才壮。」你听出了弦外之机——这不就是轮换与核心的关系吗。菜和球商一起长。",
          fx: { morale: 4, exp: 30 } },
        { text: "给大爷送两张季票", response: "大爷接过票时手都在抖。此后每个主场他都提前一小时到，还会给你带自家种的黄瓜——「吃了有力气踢」。日常的善意，会长出最铁的球迷。",
          fx: { fan_love: 4, morale: 3 } },
      ] },
    { id: "off4_old_boots", stage: "offseason", tier: "L2", cat: "off_daily", once: "off4_old_boots", art: "ec_tribute", when: { minSeason: 3 },
      title: "第一双球鞋的去向", body: "搬家整理出职业生涯第一双专业球鞋——鞋底磨穿、鞋头开胶，但你一直没舍得扔。它见过你第一次被骂哭，也见过你第一次进球。",
      options: [
        { text: "裱起来挂新家玄关", response: "它被装进框里挂在玄关最显眼处，旁边一张便签：「出门前看一眼，你是从哪来的。」每个来家里的朋友都会问它的故事——你已经讲了二十遍，还会讲二十遍。",
          fx: { morale: 5, confidence: 3 } },
        { text: "寄回青训基地传给孩子们", response: "你把它寄回了母训基地，附了张卡：「这双鞋陪我踢到了职业，接下来看你们的。」教练把它摆进了荣誉柜——孩子们每天路过都会看一眼。",
          fx: { fan_love: 4, professionalism: 3, morale: 3 } },
      ] },
    { id: "off4_lang_app", stage: "offseason", tier: "L2", cat: "off_daily", once: "off4_lang_app", art: "ec_letter", when: { minSeason: 2 },
      title: "外语打卡第 100 天", body: "为了转会后的更衣室，你下了个外语 App，今天打卡满 100 天。等级测试把你分进了「能点菜但聊不了战术」级别。",
      options: [
        { text: "请个线上外教专攻足球术语", response: "你把课程全换成足球场景：逼抢、落位、套边。三个月后你在外籍队友面前完整讲了一遍战术——他用你家乡话回了句「牛」，全场笑翻，但从此战术课你有了发言权。",
          fx: { chemistry: 4, coach_trust: 4, exp: 30 } },
        { text: "保持兴趣学习，追剧学口语", response: "你用追剧代替课本，口语越来越地道。更衣室里的梗你都能接住了——语言不是考试，是入会的门票。",
          fx: { morale: 4, chemistry: 3 } },
      ] },
    { id: "off4_rain_window", stage: "offseason", tier: "L2", cat: "off_daily", once: "off4_rain_window", art: "ec_night", when: {},
      title: "雨天窗边的发呆权", body: "休赛期暴雨天，你泡了杯茶趴在窗边看雨——什么都没干，就看了四十分钟。手机弹出提醒：「今日训练量：0。」你居然有点心虚。",
      options: [
        { text: "心安理得地继续发呆", response: "你把手机调飞行模式，接着看雨。心理教练说过：「大脑需要无任务的时段来整理训练记忆。」发呆是恢复的一部分——你把它过成了正经事。",
          fx: { morale: 5 } },
        { text: "被雨天勾起球瘾，出门淋雨踢两脚", response: "你抓着球冲进雨里，在小区空地踢了半小时雨球。湿透回家被队医念叨，但那晚睡得像小孩——有些瘾，满足比压抑健康。",
          fx: { morale: 5, confidence: 3 } },
      ] },
    { id: "off4_hometown_stadium", stage: "offseason", tier: "L2", cat: "off_daily", once: "off4_hometown_stadium", art: "ec_street", when: { minSeason: 2 },
      title: "回乡看一场业余联赛", body: "回老家时路过当年的野球场，正好有一场业余联赛决赛。你戴着帽子坐进人群，被大爷认出来的那一刻，全场都在传：「那个谁回来了！」",
      options: [
        { text: "被起哄上场客串十分钟", response: "你上场踢了十分钟，认真得像世界杯。赛后全场排队合影，组织者说：「这是咱球场历史上最大牌的外援。」乡音和掌声一起涌上来——你是从这片水泥地上长出来的。",
          fx: { fan_love: 5, morale: 5, confidence: 3 } },
        { text: "安静看完，给冠军队买单庆功", response: "你悄悄把庆功宴的账结了，留了句话：「替我多吃点，下次回来看你们踢职业。」大排档老板娘后来把那张条子裱在了墙上。",
          fx: { fan_love: 4, morale: 4, money: -5000 } },
      ] },
    { id: "off4_book_club", stage: "offseason", tier: "L2", cat: "off_daily", once: "off4_book_club", art: "ec_letter", when: { minSeason: 1 },
      title: "球员读书会", body: "队友群里有人发起「休赛期读书会」，书目投票第一的是一本传记。你半开玩笑报了名——结果真来了五个人，第一轮讨论就吵了起来。",
      options: [
        { text: "认真读完并主持第二轮", response: "你做了满页笔记主持讨论，把书里的团队治理和更衣室管理对照着聊。读书会后来成了每休赛期的保留节目——足球之外的输入，都在场上以直觉的形式还给你。",
          fx: { exp: 50, chemistry: 4, professionalism: 3 } },
        { text: "听大家聊，做好吃瓜群众", response: "你负责订咖啡和点心，听着队友们从书聊到八卦。读书会存活了三轮，但那五次下午茶把关系处铁了——形式不重要，聚在一起才重要。",
          fx: { chemistry: 5, morale: 3 } },
      ] },
    { id: "off4_physio_duet", stage: "offseason", tier: "L2", cat: "off_daily", once: "off4_physio_duet", art: "ec_rehab", when: { minSeason: 2 },
      title: "理疗师的「客人清单」", body: "休赛期理疗师终于排到了普通人：白领、大妈、学生。你插队做了理疗，听见他跟阿姨聊自己的职业理想——他想考运动科学学位，但学费差一截。",
      options: [
        { text: "悄悄帮他交了学费", response: "你没留名，但他查到了转账人。新学期他发来长消息：「我一定学成回来，把你这台老机器保养到四十岁。」——你的身体，从此有了最上心的人。",
          fx: { money: -30000, professionalism: 3, morale: 4 } },
        { text: "帮他拉来一车球员客户", response: "你把队友全介绍给了他，他的诊所生意翻了三倍。他给你立了「终身 VIP 金卡」——人脉的复利，从帮第一个人开始。",
          fx: { chemistry: 4, professionalism: 3, fan_love: 2 } },
      ] },
    { id: "off4_blackout_night", stage: "offseason", tier: "L2", cat: "off_daily", once: "off4_blackout_night", art: "ec_night", when: {},
      title: "停电的一夜", body: "小区整晚停电，手机没电、Wi-Fi 断了。你点着蜡烛翻出一本纸质书——这个夜晚突然回到了二十年前。没有屏幕的一晚，原来这么长。",
      options: [
        { text: "享受数字断食，早睡早起", response: "你九点睡、六点自然醒，晨训状态好到惊人。你把「每月一晚断电日」固定了下来——现代人的自律，从对抗屏幕开始。",
          fx: { discipline: 4, professionalism: 3 } },
        { text: "约邻居下楼踢夜光球", response: "你翻出孩童荧光足球在楼下吆喝了一声，下来了十几个邻居。烛光小区里踢球的声音笑了一整晚——停电停出的社区联赛，后来真办了起来。",
          fx: { morale: 5, fan_love: 3, chemistry: 2 } },
      ] },
  ];

  /* ── G12 青训工程 +6（24/24 完结）── */
  window.OFF4_YOUTH = [
    { id: "yp4_goalkeeper_girl", stage: "offseason", tier: "L2", cat: "youth", once: "yp4_goalkeeper_girl", art: "ec_youth", when: { minSeason: 1 },
      title: "梯队里的女孩门将", body: "青训基地里有个女孩一直跟着 U12 训练，扑救比同龄男孩都狠。但她卡在注册问题上——梯队名单里没有女足编制。教练私下问你意见。",
      options: [
        { text: "公开支持她进梯队", response: "你发了条动态：「门将看的是反应和勇气，不是性别。」舆论炸了但也推了流程，她成了基地第一个正式注册的女门将。两年后她戴着队长袖标举起了青年杯——看台上有你送的手套。",
          fx: { fan_love: 6, professionalism: 4, fame: 1500 } },
        { text: "低调资助她走女足通道", response: "你帮她联系了女足青训营并承担了第一年费用。她临走时说：「我会用扑救证明你的眼光。」——不是每份支持都需要镜头。",
          fx: { money: -20000, professionalism: 4, morale: 4 } },
      ] },
    { id: "yp4_tactics_kid", stage: "offseason", tier: "L2", cat: "youth", once: "yp4_tactics_kid", art: "ec_locker", when: { minSeason: 2 },
      title: "会画战术板的小胖子", body: "梯队有个跑不快的小胖子，但战术理解力惊人——他能把你的比赛录像复盘成手绘攻防图，错误比你自己的笔记还少。教练发愁：技术跟不上脑子，怎么办？",
      options: [
        { text: "推荐他走教练/分析师路线", response: "你把他引荐给了数据分析师团队，十三岁的他开始学视频剪辑和建模。十年后你的某任主教练身边站着位王牌助教——简历第一行写着「七号推荐」。",
          fx: { chemistry: 4, exp: 40, professionalism: 3 } },
        { text: "每天陪他加练体能半小时", response: "你陪他跑了整个休赛期的折返跑，进步慢得像种树。但第二年他瘦了十斤，能踢满全场了——技术可以练，心气要先保住，你保住了。",
          fx: { chemistry: 5, morale: 4 } },
      ] },
    { id: "yp4_old_ground", stage: "offseason", tier: "L2", cat: "youth", once: "yp4_old_ground", art: "ec_street", when: { minSeason: 3 },
      title: "老球场的拆留听证", body: "你的母训老球场要被改造，社区开了听证会。孩子们举着自己画的球场海报来了，媒体注意到你也到场——你的发言有分量。",
      options: [
        { text: "力挺保留球场并注资翻新", response: "你发言三分钟讲了自己在这片草皮上学会的一切，然后承诺注资翻新。球场保住了，门口新挂的牌子上刻着一句话：「这里长出过职业球员，还会长出更多。」",
          fx: { fan_love: 6, money: -50000, fame: 1500 } },
        { text: "提议改建多功能足球中心", response: "你提议球场改造为「社区足球中心」，保留天然草皮并加建室内场——既满足规划又留下根。方案通过那天，规划局长说：「懂球的人提方案，果然不一样。」",
          fx: { fan_love: 4, money: -30000, professionalism: 4 } },
      ] },
    { id: "yp4_scholarship_fund", stage: "offseason", tier: "L2", cat: "youth", once: "yp4_scholarship_fund", art: "ec_contract", when: { minSeason: 3 },
      title: "青训奖学金的署名题", body: "一家体育品牌想以你的名义设青训奖学金，出资全额。但合同里有个条款：奖学金选拔须优先考察「品牌合作潜力」——这偏离了你想要的纯足球标准。",
      options: [
        { text: "拒绝品牌条款，自掏一半", response: "你自掏腰包补齐了差额，奖学金标准只看球和品格。金额少了一半，但每一分都干净。三年后首届获奖者登上一线队，接受采访时说：「感谢那个不看流量的前辈。」",
          fx: { money: -100000, professionalism: 5, fan_love: 5 } },
        { text: "接受品牌方案，先让钱进来", response: "你签了——十个孩子的学费立刻到位，总比零个强。你默默在选拔委员会里保留了一个「足球纯度」席位，尽量对冲商业权重。现实不完美，但你让它好了一点。",
          fx: { money: 200000, professionalism: 3, fan_love: 2, discipline: -2 } },
      ] },
    { id: "yp4_bully_coach", stage: "offseason", tier: "L2", cat: "youth", once: "yp4_bully_coach", art: "ec_press", when: { minSeason: 2 },
      title: "青训营的「吼叫式」教练", body: "有家长投诉某青训教练动辄辱骂孩子「废物」。你当年也挨过他的骂——那代人的逻辑是「骂是为你好」。现在你是基地股东之一，这件事到了你桌上。",
      options: [
        { text: "推动心理培训与执教红线", response: "你力主引入青少年心理培训，立下执教红线：技术可以严，人格不许辱。老教练不服但接受了培训，半年后他感慨：「不吼之后，孩子们反而敢做动作了。」",
          fx: { professionalism: 5, fan_love: 4, money: -20000 } },
        { text: "私下找教练聊你自己的阴影", response: "你没开会没发文，只请他喝了顿酒，讲了你当年被吼到吐的真实故事。他沉默了很久说：「我以为那叫磨练。」第二天他在全队面前道了歉——有些转变，只能从人心开始。",
          fx: { chemistry: 5, morale: 4, professionalism: 3 } },
      ] },
    { id: "yp4_scout_letter", stage: "offseason", tier: "L2", cat: "youth", once: "yp4_scout_letter", art: "ec_letter", when: { minSeason: 4 },
      title: "一封迟到的球探信", body: "整理旧物时翻到一封你十五岁收到的球探试训邀请——当年因为家里拿不出路费，你把它压在了箱底，靠自己踢野球绕了远路。如今你在老家发现一个和你当年一模一样的孩子。",
      options: [
        { text: "替他出全部路费与试训费用", response: "你匿名付了所有费用，只提了一个条件：「去了就别回头。」半年后他在试训营拿了最佳——记者问秘诀，他说：「有个哥哥告诉我，穷只能挡住路费，挡不住球路。」",
          fx: { money: -15000, fan_love: 4, morale: 5 } },
        { text: "设立「路费基金」帮所有这样的孩子", response: "你在母训基地设了小额路费基金，专帮拿不起路费的试训孩子。基金牌子上写着你的初心：「别让天赋死在汽车站。」——你绕过的远路，成了别人的近道。",
          fx: { money: -50000, fan_love: 6, professionalism: 4 } },
      ] },
  ];

  /* ── G14 商业代言 +6（24/24 完结）── */
  window.OFF4_COMM = [
    { id: "cm4_museum_visit", stage: "offseason", tier: "L2", cat: "commercial", once: "cm4_museum_visit", art: "ec_tribute", when: { minSeason: 2 },
      title: "体育博物馆想收你的球衣", body: "国家体育博物馆来函：希望收藏你职业生涯首秀球衣，标注「城市足球记忆」。经纪人觉得「收球衣没变现价值」，建议拖一拖。",
      options: [
        { text: "无偿捐赠并出席开展", response: "你把球衣捐了，展签上写着你首秀那天的气温和比分。开展那天来了几百个孩子——你的首秀球衣比任何代言位都贵重，因为它标价是「永久」。",
          fx: { fan_love: 6, fame: 1500, professionalism: 3 } },
        { text: "借展+联名纪念款两不误", response: "你和博物馆谈成借展，同时推出纪念徽章，收益捐给青训。商业和情怀各得其所——经纪人直呼内行。",
          fx: { money: 50000, fan_love: 3, commercial_value: 4 } },
      ] },
    { id: "cm4_game_skin", stage: "offseason", tier: "L2", cat: "commercial", once: "cm4_game_skin", art: "ec_press", when: { minSeason: 1 },
      title: "足球游戏想收录你的招牌动作", body: "一款国民足球游戏邀请收录你的招牌射门动作做成「技能皮肤」。授权费可观，但对方要求动作数据「可以适当夸张化」——变成一个超现实技能。",
      options: [
        { text: "坚持真实动作数据", response: "你要求按真实动作建模：「我的招牌是练出来的，不是编出来的。」游戏上线后玩家评价这技能「最难用但最爽」——因为它是真的。真实成了最好的卖点。",
          fx: { commercial_value: 4, fan_love: 5, professionalism: 3 } },
        { text: "授权夸张版，玩家开心就好", response: "你签了夸张版，游戏里你的射门能打出「流星轨迹」。孩子们在操场模仿这个不存在的动作，笑作一团——虚构的浪漫，也是足球传播的一部分。",
          fx: { money: 80000, commercial_value: 4, fan_love: 3 } },
      ] },
    { id: "cm4_farm_endorse", stage: "offseason", tier: "L2", cat: "commercial", once: "cm4_farm_endorse", art: "ec_contract", when: { minSeason: 2 },
      title: "家乡农产品的代言邀约", body: "家乡政府来函：希望你免费代言家乡的猕猴桃，助农增收。团队认为「零代言费还占用档期」，但你盯着信纸上的乡邮戳看了很久。",
      options: [
        { text: "免费代言，拍一条走心广告", response: "你回乡拍了条广告：从你家后山讲到果农的凌晨。视频爆了，那季猕猴桃卖断货。助农海报贴在县汽车站——你成名的地方，正是你要报答的地方。",
          fx: { fan_love: 7, fame: 1000, money: -10000 } },
        { text: "代言+设购销合作社", response: "你不只代言，还牵头搞了电商合作社，教果农直播。第一年收入翻倍，你多了个头衔：「荣誉果农」。可持续的输血，比一次代言更久。",
          fx: { fan_love: 5, commercial_value: 3, professionalism: 3 } },
      ] },
    { id: "cm4_ai_clone", stage: "offseason", tier: "L2", cat: "commercial", once: "cm4_ai_clone", art: "ec_press", when: { minSeason: 3 },
      title: "AI 数字人分身提案", body: "科技公司提议做你的「AI 数字分身」：用你的形象和声音自动回复粉丝、直播带货，宣称「睡觉也能营业」。团队眼睛亮了，你后背发凉。",
      options: [
        { text: "拒绝：形象人格不能外包", response: "你拒绝了：「我的声音只说我自己写的话。」几个月后另一家公司的 AI 分身翻车塌房，你的拒绝上了热搜——「清醒」。人格是球员最后的资产，你守住了。",
          fx: { professionalism: 5, fan_love: 5, commercial_value: -2 } },
        { text: "有限授权：只做训练问答库", response: "你只授权了一个基于你真实采访的「训练问答」功能，人工审核每条回复。粉丝得到了干货，你没有失控——科技的西域界，可以试，但要系绳。",
          fx: { money: 40000, commercial_value: 3, professionalism: 3 } },
      ] },
    { id: "cm4_childhood_club_sponsor", stage: "offseason", tier: "L2", cat: "commercial", once: "cm4_childhood_club_sponsor", art: "ec_youth", when: { minSeason: 2 },
      title: "儿时俱乐部的赞助商之争", body: "你母训的社区俱乐部要倒闭了。两家赞助商来谈：一家要求挂他们的品牌改名，一家是本地小企业只想「打个小logo、尽点心意」。",
      options: [
        { text: "牵线本地企业+你补差额", response: "你选了那个「尽点心意的」，自己补齐了差额。俱乐部保住了原名和底色，墙上多了三块牌子：小企业的、你的、和孩子们的合影。钱有价，根无价。",
          fx: { money: -40000, fan_love: 6, professionalism: 3 } },
        { text: "选大品牌，救活最重要", response: "你选了大品牌——俱乐部改名换标识，但场地翻新、梯队扩编全部到位。名字变了，踢球的孩子多了三倍。你安慰自己：内容比招牌重要，活着比体面重要。",
          fx: { commercial_value: 4, fan_love: 2, money: 100000 } },
      ] },
    { id: "cm4_legacy_licensing", stage: "offseason", tier: "L2", cat: "commercial", once: "cm4_legacy_licensing", art: "ec_trophy", when: { minSeason: 5 },
      title: "退役后的「名字授权」预签约", body: "经纪团队提议趁巅峰预签「退役后名字授权」总协议：纪念品、学院、纪录片打包给一家公司运营二十年。预付金是天文数字，但你二十年的名字只标一个价。",
      options: [
        { text: "拒绝打包，保留分期自主权", response: "你拒绝了总包：「我的名字不能被一家公司定义二十年。」你保留分项授权的自由——短期少赚，长期每一步都在自己手里。名人最大的风险是过早贱卖未来。",
          fx: { professionalism: 5, commercial_value: 3, money: -100000 } },
        { text: "签约但保留品格否决权", response: "你签了打包协议，但加了一条硬条款：所有项目我有品格否决权，违者解约。预付金到账，你用第一笔钱给老家建了灯光球场——钱要为名字打工，不是反过来。",
          fx: { money: 500000, commercial_value: 5, professionalism: 3 } },
      ] },
  ];
})();