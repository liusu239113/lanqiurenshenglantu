/* ============================================================================
   G 组：日常事件卡池（P56）— 非比赛日抽卡

   设计意图（用户锁定 1+3 方案的第 3 条）：
   原先「非比赛日」只有生活事件（平均 15 天一次），没有比赛就没剧情。
   本池补充**可循环**的日常小场景（球迷/媒体/训练/更衣室/城市/家庭/康复/社区），
   与生活事件互补：生活事件走 Career.advanceDay 的 ev 通道，本池走事件卡通道。

   与其它池的关键差异：
   - **可循环**：不受 once / 半季配额约束，只受「日常卡全局间隔 21 天」+
     「单卡冷却 45 天」限制（见 eventcards.js rollDaily）
   - 因此每张卡都是「可以再发生一次的日常」，文案避免「第一次…」这类一次性口吻
   - 选项效果刻意保持小额（±1~4），因为密度高，单卡影响必须小
   ============================================================================ */
(function () {
  window.DAILY_CARDS = [

    /* ── 球迷 ── */
    { id: "dy_fan_banner", stage: "daily", cat: "dailyFan", art: "ec_tifo", when: { minSeason: 1 },
      title: "看台横幅", body: "北看台挂出了新的横幅，上面是你的名字和一句拼错的标语。错别字在灯光下格外醒目。",
      options: [
        { text: "在采访里主动念出那句标语", response: "你照着横幅念了一遍，还夸了句「就是这个味儿」。第二天看台又多了三条同款横幅。",
          fx: { fan_love: 4, fame: 200 } },
        { text: "私下告诉球迷会负责人", response: "你托人把正确的写法发了过去。横幅没换，但球迷会回了句「懂了，下次一定」，语气比谁都开心。",
          fx: { fan_love: 2, chemistry: 1 } },
      ] },
    { id: "dy_fan_kid", stage: "daily", cat: "dailyFan", art: "ec_fan", when: { minSeason: 1 },
      title: "训练基地门口的小孩", body: "训练结束，栅栏外有个小孩举着球衣站了很久。保安说他已经等了两个小时。",
      options: [
        { text: "停下来签名合影", response: "你蹲下来和他平视，问他踢什么位置。他说「和你一样」。你把训练背心脱下来送了他。",
          fx: { fan_love: 5, morale: 3 } },
        { text: "让工作人员带他进场看训练", response: "小孩坐在场边看完了整堂训练课，全程没说话。临走时他把自己的糖塞给了队医。",
          fx: { fan_love: 3, chemistry: 2 } },
      ] },
    { id: "dy_fan_bus", stage: "daily", cat: "dailyFan", art: "ec_street", when: { minSeason: 1 },
      title: "球迷大巴", body: "客场路上，你们的大巴和球迷包车并排停在服务区。他们摇下车窗，唱起了助威歌。",
      options: [
        { text: "下车打招呼", response: "你下车和他们合了影，还接了一瓶水。上车时队友都在笑，但司机说那首歌一路没停过。",
          fx: { fan_love: 4, morale: 2 } },
        { text: "在车窗内挥手致意", response: "隔着玻璃挥手，对方却喊得更大声了。有时候距离感反而让热情更纯粹。",
          fx: { fan_love: 2, chemistry: 1 } },
      ] },
    { id: "dy_fan_oldshirt", stage: "daily", cat: "dailyFan", art: "ec_letter", when: { minSeason: 2 },
      title: "一件洗褪色的旧球衣", body: "一位老球迷寄来他 30 年前买的球衣，说想让你签个名，签完再寄回去给他儿子。",
      options: [
        { text: "签名并附一封手写信", response: "你写了两页纸，讲自己第一次看球的记忆。老人回信说，儿子已经把球衣裱起来了。",
          fx: { fan_love: 5, morale: 3 } },
        { text: "签在球衣内侧", response: "你把名字签在领口内侧——「这样穿在身上才贴着心口」。老人逢人就说这句话。",
          fx: { fan_love: 4, fame: 150 } },
      ] },
    { id: "dy_fan_boo", stage: "daily", cat: "dailyFan", art: "ec_stadium", when: { minSeason: 2 },
      title: "零星的嘘声", body: "最近几个主场，看台上偶尔会飘来零星的嘘声。没有针对谁，但也没人愿意承认是冲着自己。",
      options: [
        { text: "在混合区主动回应", response: "你说「嘘得对，我们踢得不好」。记者愣了一下，第二天的标题反而全是支持。",
          fx: { media_relation: 3, confidence: 2 } },
        { text: "用下一次触球比赛", response: "你没说话。下一场你从第一分钟拼到最后一分钟，嘘声变成了掌声。",
          fx: { confidence: 3, physicalTalent: 2 } },
      ] },
    { id: "dy_fan_flag", stage: "daily", cat: "dailyFan", art: "ec_flag", when: { minSeason: 1 },
      title: "看台上的中文横幅", body: "客队看台的角落里，一面手写的中文横幅被举了起来——几个留学生坐了十几个小时的车过来。",
      options: [
        { text: "赛后绕场致意", response: "你走向那个角落，把手套扔了上去。他们在异国的看台上哭了。",
          fx: { fan_love: 5, morale: 4 } },
        { text: "托人送几件训练装备过去", response: "装备送到时他们还在停车场。领头的那个说：「值了。」",
          fx: { fan_love: 3, fame: 200 } },
      ] },

    /* ── 媒体 ── */
    { id: "dy_media_podcast", stage: "daily", cat: "dailyMedia", art: "ec_press", when: { minSeason: 1 },
      title: "一档播客的邀约", body: "一档球迷自己做的播客发来私信，说想请你聊 40 分钟，没有任何商业合作，只是「想听你说说」。",
      options: [
        { text: "抽一个晚上录一期", response: "聊到凌晨一点，从青训聊到退役以后想做什么。节目上线那周冲上了平台榜首。",
          fx: { media_relation: 4, fan_love: 3 } },
        { text: "婉拒但推荐队友去", response: "你推荐了队里最会说话的老将。他在节目里把更衣室的故事讲了两个小时，顺便把你夸了一遍。",
          fx: { chemistry: 3, media_relation: 2 } },
      ] },
    { id: "dy_media_rumor", stage: "daily", cat: "dailyMedia", art: "ec_phone", when: { minSeason: 2 },
      title: "一条转会传闻", body: "手机推送弹出一条转会传闻，说你已经和另一家俱乐部谈妥了个人条款。你自己都没听说过这件事。",
      options: [
        { text: "发一条澄清动态", response: "你只发了四个字：「假的，谢谢。」评论区瞬间变成了大型打脸现场。",
          fx: { fan_love: 3, media_relation: 2 } },
        { text: "什么都不说", response: "你选择让时间说话。三天后传闻自己消失了，但教练组记住了你没添乱。",
          fx: { coach_trust: 3, confidence: 1 } },
      ] },
    { id: "dy_media_stats", stage: "daily", cat: "dailyMedia", art: "ec_scan", when: { minSeason: 1 },
      title: "跑动榜第九", body: "数据网站更新了联赛跑动榜，你排第九。评论区说「看不出来啊，他踢得那么懒」。",
      options: [
        { text: "把榜单截图设成手机壁纸", response: "你每天解锁都在看那个「第九」。两周后你上了前三。",
          fx: { physicalTalent: 3, confidence: 2 } },
        { text: "研究自己的跑动热区", response: "你找分析师要了热区图，发现自己有大量无效跑动。跑得聪明比跑得多更难。",
          fx: { coach_trust: 3, professionalism: 3 } },
      ] },
    { id: "dy_media_critic", stage: "daily", cat: "dailyMedia", art: "ec_press", when: { minSeason: 2 },
      title: "名嘴的批评", body: "一位名嘴在节目里点名批评你：「有天赋，但没有把天赋当回事。」这句话被剪成短视频疯传。",
      options: [
        { text: "看完完整的 20 分钟", response: "你从头到尾看完了。他后面还说了很多难听的话，但有三句是对的。你记了下来。",
          fx: { professionalism: 4, confidence: 2 } },
        { text: "约他吃一顿饭", response: "饭桌上他比节目里温和得多。临走他说：「骂你是因为觉得你还能更好。」",
          fx: { media_relation: 4, confidence: 3 } },
      ] },
    { id: "dy_media_doc", stage: "daily", cat: "dailyMedia", art: "ec_scan", when: { minSeason: 3 },
      title: "纪录片跟拍", body: "一支纪录片团队想跟拍你一个赛季，条件是完全不干预、不删改，包括拍到你失误和发脾气。",
      options: [
        { text: "答应，全部开放", response: "摄制组在更衣室架了半年的机位。成片播出后，最打动人的反而是你输球后独自坐着的三分钟。",
          fx: { fame: 600, media_relation: 4 } },
        { text: "只开放训练场", response: "你划了一条线：训练可以拍，生活不行。成片克制但专业，没人觉得失望。",
          fx: { media_relation: 2, fame: 250 } },
      ] },

    /* ── 训练与更衣室 ── */
    { id: "dy_train_setpiece", stage: "daily", cat: "dailyTrain", art: "ec_training", when: { minSeason: 1, posExclude: ["GK"] },
      title: "加练定位球", body: "训练结束后你留下来加练任意球。球场的灯关了一半，捡球的还是那个不想下班的球童。",
      options: [
        { text: "练到球童困得打哈欠", response: "你让他先回去，自己又练了四十分钟。第二天那孩子递给你一张纸条，写着他记的全部进球数。",
          fx: { professionalism: 4, exp: 800 } },
        { text: "改成和他比谁踢得准", response: "你们赌十次定位球，输的人买饮料。你输了三次。回到更衣室你笑了一路。",
          fx: { morale: 4, exp: 500 } },
      ] },
    { id: "dy_train_setpiece_gk", stage: "daily", cat: "dailyTrain", art: "ec_training", when: { minSeason: 1, pos: ["GK"] },
      title: "加练发动", body: "训练结束后你留下来加练手抛球和球门球。球场的灯关了一半，接球的还是那个不想下班的球童。",
      options: [
        { text: "练到球童困得打哈欠", response: "你让他先回去，自己又练了四十分钟。第二天那孩子递给你一张纸条，写着他记下的全部落点。",
          fx: { professionalism: 4, exp: 800 } },
        { text: "改成和他比谁扔得准", response: "你们赌十次手抛球，输的人买饮料。你三次都砸中了广告牌。回到更衣室你笑了一路。",
          fx: { morale: 4, exp: 500 } },
      ] },
    { id: "dy_train_youth", stage: "daily", cat: "dailyTrain", art: "ec_youth", when: { minSeason: 2 },
      title: "青年队的小将", body: "青年队一个 17 岁的孩子被叫来和一线队合练。他全程低着头，接球前会先看你一眼。",
      options: [
        { text: "主动把球传给他", response: "你连着给他喂了四个球。第四个他终于敢转身了，场边的青训教练鼓了掌。",
          fx: { chemistry: 3, coach_trust: 2 } },
        { text: "训练后留他聊十分钟", response: "你告诉他：「别看我，看空当。」他后来说这句话他记了很多年。",
          fx: { chemistry: 4, morale: 3 } },
      ] },
    { id: "dy_train_tactics", stage: "daily", cat: "dailyTrain", art: "ec_bench", when: { minSeason: 1 },
      title: "战术板上的新位置", body: "教练在战术板上把你挪到了一个新的位置，和录像分析课上的画法完全不一样。他不解释。",
      options: [
        { text: "训练里直接照着踢", response: "第一周你踢得很别扭，第二周你开始要球了。教练在第三周才说：「你终于看懂了。」",
          fx: { coach_trust: 5, professionalism: 3 } },
        { text: "课后去问清楚原因", response: "他在白板上给你画了 20 分钟。你要的不是位置，而是他的逻辑。",
          fx: { coach_trust: 4, confidence: 2 } },
      ] },
    { id: "dy_train_keeper", stage: "daily", cat: "dailyTrain", art: "ec_bench", when: { minSeason: 1, posExclude: ["GK"] },
      title: "和门将的赌约", body: "门将说他能扑出你十次点球中的七个。你在训练场中央接下了这个赌。",
      options: [
        { text: "认真踢满十轮", response: "你进了五个。他赢了赌局，但你发现了自己助跑节奏的问题——这比赌注值钱。",
          fx: { exp: 900, confidence: 2 } },
        { text: "改成让他教你怎么罚", response: "他从门将视角讲了十分钟，你当场进了八个。有些课只有对手能教。",
          fx: { coach_trust: 2, morale: 3 } },
      ] },
    { id: "dy_train_keeper_gk", stage: "daily", cat: "dailyTrain", art: "ec_bench", when: { minSeason: 1, pos: ["GK"] },
      title: "和前锋的赌约", body: "队里的头号射手说他十次点球能踢进你八个。你在训练场中央接下了这个赌。",
      options: [
        { text: "认真扑满十轮", response: "你扑出了三个。他赢了赌局，但你发现了自己提前移动的老毛病——这比赌注值钱。",
          fx: { exp: 900, confidence: 2 } },
        { text: "改成请他教你射手的思路", response: "他从射手视角讲了十分钟，再站回门线时那些助跑假动作在你眼里全慢了半拍。有些课只有对手能教。",
          fx: { coach_trust: 2, morale: 3 } },
      ] },
    { id: "dy_train_ice", stage: "daily", cat: "dailyTrain", art: "ec_freeze", when: { minSeason: 1 },
      title: "冰浴的三分钟", body: "冰浴桶里，物理治疗师开着秒表。三分钟每次都像三年，但今天桶边多放了张纸条。",
      options: [
        { text: "咬牙待满三分钟", response: "纸条上写着「今天你多待了 20 秒」。没人说好，但你自己知道。",
          fx: { physicalTalent: 3, professionalism: 2 } },
        { text: "找人一起泡", response: "你拉着队友一起下水。两个人喊得整个康复室都听见了，笑完之后第二天腿都不酸。",
          fx: { chemistry: 3 } },
      ] },
    { id: "dy_train_nutrition", stage: "daily", cat: "dailyTrain", art: "ec_training", when: { minSeason: 1 },
      title: "营养师的新菜单", body: "营养师换了新菜单：没有油炸，没有甜点，连盐都精确到克。她在餐台前盯着你的盘子。",
      options: [
        { text: "完全照做一个月", response: "第一个星期你做梦都在想炸鸡。第四周体脂率下降了，跑起来像换了一条腿。",
          fx: { physicalTalent: 4, professionalism: 4 } },
        { text: "申请每周一次自由餐", response: "营养师同意了——条件是自由餐后加一趟 5 公里。你答应了，并且真的跑了。",
          fx: { morale: 4, physicalTalent: 2 } },
      ] },
    { id: "dy_train_seat", stage: "daily", cat: "dailyTrain", art: "ec_locker", when: { minSeason: 1 },
      title: "更衣室的座位", body: "你的更衣柜旁边空了一个位置，那是刚离队的老将留下的。队里有人在争，有人绕着走。",
      options: [
        { text: "主动把那格收拾干净", response: "你把老将留下的护腿板放进储物箱，贴了张便签。没人说什么，但每个人都看见了。",
          fx: { chemistry: 4, morale: 3 } },
        { text: "把位置让给新来的小将", response: "小将受宠若惊，坐得笔直。老队员看了你一眼，点了下头。",
          fx: { chemistry: 3, coach_trust: 3 } },
      ] },
    { id: "dy_train_shout", stage: "daily", cat: "dailyTrain", art: "ec_locker", when: { minSeason: 2 },
      title: "队长没喊的那句话", body: "赛前更衣室安静得能听见空调声，队长张了几次嘴都没说出口。这气氛不太对。",
      options: [
        { text: "自己站起来说两句", response: "你说得很短，只有一句「今天别让球迷白来」。出门时全队的走路声音都变了。",
          fx: { chemistry: 5, morale: 4 } },
        { text: "把音响打开", response: "你把更衣室的音响开到最大，放的是队长最爱的那首老歌。他笑了，气氛活了。",
          fx: { chemistry: 4, morale: 3 } },
      ] },

    /* ── 城市与生活 ── */
    { id: "dy_city_cafe", stage: "daily", cat: "dailyCity", art: "ec_city", when: { minSeason: 1 },
      title: "街角咖啡店", body: "你常去的那家咖啡店在菜单上加了一款以你名字命名的饮品。老板没告诉你，是他女儿的主意。",
      options: [
        { text: "点一杯，全款付", response: "你拍下来发了动态，那家店一周内排起了队。老板说要给你分红，你没要。",
          fx: { fan_love: 4, fame: 250 } },
        { text: "悄悄把这家店买下一年的咖啡券送球迷", response: "你没让老板说出去。后来有球迷在网上晒券，才知道是你。",
          fx: { fan_love: 5, chemistry: 2 } },
      ] },
    { id: "dy_city_bike", stage: "daily", cat: "dailyCity", art: "ec_street", when: { minSeason: 1 },
      title: "骑车被认出来了", body: "你骑共享单车去买东西，路口等红灯时，旁边的外卖小哥盯着你看了三秒。",
      options: [
        { text: "摘下口罩打招呼", response: "小哥激动得差点把车骑进绿化带，还非要请你喝奶茶。你喝了，甜得发齁。",
          fx: { fan_love: 3, morale: 3 } },
        { text: "假装不是", response: "你摇了摇头。小哥半信半疑地走了。第二天你有点后悔。",
          fx: { confidence: 1 } },
      ] },
    { id: "dy_city_market", stage: "daily", cat: "dailyCity", art: "ec_city", when: { minSeason: 1 },
      title: "菜市场", body: "你戴着帽子去买鱼，摊主一边刮鳞一边说：「小伙子这身板，踢球的吧？」",
      options: [
        { text: "承认，并聊了两句", response: "摊主说他是老球迷，顺手多塞了两条小黄鱼。你提着鱼回家的路上一直在笑。",
          fx: { morale: 4, fan_love: 2 } },
        { text: "问他要不要签名", response: "摊主愣了一下，然后喊来了整条街的邻居。那天你签了一百多个名。",
          fx: { fan_love: 5, fame: 150 } },
      ] },
    { id: "dy_city_neighbor", stage: "daily", cat: "dailyCity", art: "ec_family", when: { minSeason: 1 },
      title: "楼下的老太太", body: "楼下住户敲门，说你家昨晚的跑步机声音有点大。她手里端着一碗刚煮好的汤。",
      options: [
        { text: "道歉并把跑步机挪到阳台", response: "第二天她敲门送来第二碗汤，说：「我孙子也是踢球的。」",
          fx: { morale: 4, fan_love: 2 } },
        { text: "请她进屋坐坐", response: "她看了一圈你的奖牌，说「这孩子瘦了」。你听得很暖。",
          fx: { morale: 5, chemistry: 1 } },
      ] },
    { id: "dy_city_game", stage: "daily", cat: "dailyCity", art: "ec_phone", when: { minSeason: 1 },
      title: "网吧里的足球游戏", body: "路过一家网吧，屏幕上一群人在踢足球游戏，其中一个用的id里有你的名字。",
      options: [
        { text: "站在后面看完全场", response: "那人用的「你」进了两球，操作很烂但气势很足。你憋着笑走出门才笑出声。",
          fx: { morale: 5 } },
        { text: "开一台机器和他对战", response: "你选了自己的球队，用自己打进制胜球。他摘下耳机看了你半天。",
          fx: { fan_love: 4, morale: 4 } },
      ] },
    { id: "dy_city_rain", stage: "daily", cat: "dailyCity", art: "ec_rain", when: { minSeason: 1 },
      title: "雨天的出租车", body: "训练结束下大雨，你在路边等车。一辆出租车停下，司机摇下窗说：「上来吧，我不要钱。」",
      options: [
        { text: "上车，但把钱塞进扶手箱", response: "下车时你把钱留下了。司机追出来喊，你已经跑进了雨里。",
          fx: { fan_love: 3, morale: 3 } },
        { text: "记下工号，赛后送他球票", response: "两周后司机坐在主场第三排，全程举着手机录像。他儿子说那是他爸最开心的一天。",
          fx: { fan_love: 5, fame: 150 } },
      ] },

    /* ── 家庭 ── */
    { id: "dy_home_call", stage: "daily", cat: "dailyHome", art: "ec_phone", when: { minSeason: 1 },
      title: "深夜的电话", body: "晚上十一点，家里打来电话。你以为是急事，接起来只听到一句：「没事，就是想听听你声音。」",
      options: [
        { text: "聊到手机发烫", response: "你们聊了一个多小时，从天气聊到小时候的球场。挂断时屏幕显示通话 78 分钟。",
          fx: { morale: 6, confidence: 2 } },
        { text: "第二天寄一份体检报告回去", response: "你把队医的报告复印了一份寄回家。母亲说，看不懂，但放心。",
          fx: { morale: 5 } },
      ] },
    { id: "dy_home_visit", stage: "daily", cat: "dailyHome", art: "ec_family", when: { minSeason: 1 },
      title: "爸妈来看球", body: "父母第一次来看你踢职业比赛，坐在最便宜的看台。父亲穿了一件明显不搭的运动外套。",
      options: [
        { text: "赛后带他们去球员通道", response: "你拉着他们走过混合采访区，记者们全都停下了提问。父亲那件外套拍进了当天的最好照片。",
          fx: { morale: 6, fame: 200 } },
        { text: "把比赛用球送给他们", response: "母亲把球放在客厅的柜子最上层，旁边是你小时候的第一个足球。",
          fx: { morale: 5, fan_love: 1 } },
      ] },
    { id: "dy_home_pet", stage: "daily", cat: "dailyHome", art: "ec_night", when: { minSeason: 2 },
      title: "要不要养条狗", body: "你开始考虑养条狗。经纪人说会分散精力，队医说散步对恢复有好处，你自己想的是回家时屋里有动静。",
      options: [
        { text: "养一条，从收容所领", response: "它每天在门口等你回家。输球那天它只是把头放在你腿上，一句话也没说。",
          fx: { morale: 7 } },
        { text: "算了，专注赛季", response: "你把那个领养页面收藏了，想着明年再说。人总得给自己留个念想。",
          fx: { professionalism: 3, confidence: 1 } },
      ] },
    { id: "dy_home_album", stage: "daily", cat: "dailyHome", art: "ec_letter", when: { minSeason: 2 },
      title: "旧相册", body: "搬东西时翻出一本旧相册，里面是你在土场上踢球的样子，膝盖全是泥，笑得没心没肺。",
      options: [
        { text: "抽一张夹进钱包", response: "你把那张照片夹进了钱包。之后每次点球大战，你都会先看它一眼。",
          fx: { confidence: 4, morale: 3 } },
        { text: "发到社媒上配一句话", response: "你写：「这块场地现在是个停车场。」评论区变成了所有人的童年回忆。",
          fx: { fan_love: 4, fame: 200 } },
      ] },
    { id: "dy_home_spring", stage: "daily", cat: "dailyHome", art: "ec_family", when: { minSeason: 2, month: 2 },
      title: "回家的几天", body: "赛季间隙有几天假。家里的年夜饭还留着你的位置，碗筷摆得整整齐齐。",
      options: [
        { text: "老老实实待满几天", response: "你那几天没碰球，只陪家里人买菜、贴春联。归队时教练说你眼神变亮了。",
          fx: { morale: 8 } },
        { text: "只回一天，其余时间加练", response: "你在家待了一天就走了。母亲把你最爱吃的菜装了两大盒塞进包里。",
          fx: { professionalism: 5, morale: 2 } },
      ] },

    /* ── 康复（伤病期专属） ── */
    { id: "dy_rehab_pool", stage: "daily", cat: "dailyRehab", art: "ec_rehab", when: { injured: true },
      title: "康复池里的独角戏", body: "队友在场上训练，你在康复池里慢走。水声、计时器、玻璃墙外模糊的喊声。",
      options: [
        { text: "把康复计划提前完成", response: "你把每天的康复提前了半小时做完，多出来的时间全泡在录像室。",
          fx: { professionalism: 4, injury_risk: -3 } },
        { text: "隔着玻璃看完整堂训练", response: "你站在玻璃后站了一个小时，把新战术的跑位记在了本子上。",
          fx: { coach_trust: 3, professionalism: 3 } },
      ] },
    { id: "dy_rehab_boring", stage: "daily", cat: "dailyRehab", art: "ec_rehab", when: { injured: true },
      title: "健身房里的第四十天", body: "第四十天，同一个器械，同一组动作。理疗师说今天可以加一点重量，也可以不加。",
      options: [
        { text: "加，但要理疗师全程盯着", response: "你加了 10%。理疗师全程没说话，结束时说了句「稳」。",
          fx: { physicalTalent: 3, injury_risk: -2 } },
        { text: "不加，把动作做到标准", response: "你用空杆做了 200 次，做到最后肌肉发抖。理疗师说这比加重量难。",
          fx: { professionalism: 4 } },
      ] },
    { id: "dy_rehab_visit", stage: "daily", cat: "dailyRehab", art: "ec_family", when: { injured: true },
      title: "有人来探病", body: "队友们拎着水果来看你，坐了十分钟就开始聊下一场的对手，聊着聊着才想起你还不能上场。",
      options: [
        { text: "认真给他们出主意", response: "你把看出来的对手弱点全说了，还画了张图。下一场他们真用了那套打法。",
          fx: { chemistry: 5, coach_trust: 3 } },
        { text: "装作不在意", response: "你笑着说「早点回来帮我」，他们走了以后，房间里安静得有点过分。",
          fx: { chemistry: 2, morale: 3 } },
      ] },
    { id: "dy_rehab_doubt", stage: "daily", cat: "dailyRehab", art: "ec_night", when: { injured: true },
      title: "复出前一晚的自我怀疑", body: "明天就要复查了。你躺在床上想：如果恢复不到从前怎么办？这个问题没人能替你回答。",
      options: [
        { text: "给启蒙教练打个电话", response: "他听完只说了一句：「你以前连球都颠不过五个。」你笑出了声，然后睡着了。",
          fx: { confidence: 5, morale: 4 } },
        { text: "爬起来看自己的比赛录像", response: "你从第一场看到最后一场，看到了自己有多想踢球。天亮的时候你反而不怕了。",
          fx: { confidence: 4, professionalism: 3 } },
      ] },

    /* ── 社区与公益 ── */
    { id: "dy_youth_school", stage: "daily", cat: "dailyCity", art: "ec_youth", when: { minSeason: 2 },
      title: "回母校", body: "小学请你去参加校庆。操场上画着歪歪扭扭的球门线，就是你当年踢球的地方。",
      options: [
        { text: "给孩子们上一节课", response: "你教了一节最基础的停球课，孩子们问的问题比教练还专业。",
          fx: { fan_love: 4, morale: 4 } },
        { text: "给学校捐一批球和球门", response: "两个月后校长发来照片：操场换了新球门，排队的孩子从教室门口一直排到校门。",
          fx: { fan_love: 5, fame: 300, money: -50000 } },
      ] },
    { id: "dy_youth_charity", stage: "daily", cat: "dailyCity", art: "ec_fan", when: { minSeason: 2 },
      title: "一堂公益训练课", body: "公益组织邀请你去给一群特殊的孩子上一堂足球课。他们中有的人一辈子都不会看一场完整的比赛。",
      options: [
        { text: "全程参加，不当嘉宾", response: "你换了运动服站在场边，一节课下来嗓子哑了。有个孩子抱了你很久不撒手。",
          fx: { morale: 7, fan_love: 5 } },
        { text: "出钱把场地和装备包下来", response: "你付了一年的场地费，没让任何人说出去。组织者说，这是他们收到过最多的一次匿名捐赠。",
          fx: { fan_love: 4, fame: 200, money: -200000 } },
      ] },

    /* ── 球星好感（P64）：与池内球星（好感>0 者优先）的日常互动；favor 无条件入账 ──
       favorPid:"dyn" = 动态选星（StarFavor.resolveTarget）；when.favorStar 保证抽到时必有对象 */
    { id: "dy_star_shirt", stage: "daily", cat: "dailyFan", art: "ec_shirt", when: { minSeason: 1, favorStar: true },
      title: "衣橱最上层", body: "收拾衣橱，最上层那件 {star} 的球衣被你压出了折痕——是交换来的。你还记得他递过来时说了句什么，原话已经模糊，只记得语气很轻，像顺手递一瓶水。",
      options: [
        { text: "拍下来发个帖：它陪我搬了两次家。", response: "帖子下面有人问在哪买的同款。你回了句：非卖品。评论区吵起来了，你没再说话，把手机扣在桌上，笑了一会儿。",
          fx: { fan_love: 3, fame: 120, favor: 6, favorPid: "dyn" } },
        { text: "什么也不做，重新叠好", response: "折痕对着折痕，球衣回到衣橱最上层。有些东西不需要被看见，也一直都在。",
          fx: { morale: 3, favor: 6, favorPid: "dyn" } },
      ] },
    { id: "dy_star_visit", stage: "daily", cat: "dailyTrain", art: "ec_locker", when: { minSeason: 1, favorStar: true },
      title: "加练日的访客", body: "加练到一半，你发现场边站着个人——{star} 来基地参加活动，工作人员想拦，他摆摆手就走到了训练场边。你六组折返跑没停，他就一直看。结束后他走过来：「最后一组的冲刺，节奏不错。」",
      options: [
        { text: "请教一个问题", response: "他蹲下来拿矿泉水瓶给你画了半天跑位，讲到一半自己笑了：「这东西写出来就变味了，你先这么练。」晚上的加练笔记，你写满了两页。",
          fx: { professionalism: 3, favor: 6, favorPid: "dyn" } },
        { text: "只聊了聊天气和家常", response: "没聊球，聊了各自城市的堵车和早餐。临走他说：「踢球的人，先把日子过明白。」你琢磨了一路。",
          fx: { morale: 3, chemistry: 2, favor: 6, favorPid: "dyn" } },
      ] },
    { id: "dy_star_press", stage: "daily", cat: "dailyMedia", art: "ec_press", when: { minSeason: 1, favorStar: true },
      title: "他的采访里有你", body: "队友把采访链接甩进群里：{star} 在采访里被问到「近年印象最深的年轻球员」，他报出了你的名字，还提了那场比赛的一个细节——那个细节连本地媒体都没注意到。",
      options: [
        { text: "公开回应致意", response: "你转发并写了句「向前辈学习」。热评第一：梦幻联动。你的关注列表里，从此多了一群蹲更新的球迷。",
          fx: { fan_love: 3, fame: 150, favor: 8, favorPid: "dyn" } },
        { text: "私下发消息道谢", response: "他回得很快，就一句：「细节是你自己踢出来的，不用谢。」你盯着这句话看了很久，截图，没发给任何人。",
          fx: { media_relation: 3, favor: 8, favorPid: "dyn" } },
      ] },
  ];
})();
