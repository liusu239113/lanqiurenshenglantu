/* ============================================================================
   G2 联赛风云余量第一批（32 张）— 进 post 池
   子类：赛前备战 8 / 舆论风暴 6 / 队友线 6 / 教练线 4 / 裁判争议 4 / 球迷城市 2 / 状态波动 2
   沿用管线：L1 每半季≤4 / L2 ≤3 · 同类冷却 8 轮 · once 整生涯唯一
   ============================================================================ */
(function () {
  window.LEAGUE_CARDS3 = [
    // ── 赛前备战 ──
    { id: "lg3_setpiece_weapon", stage: "post", tier: "L2", cat: "prep", once: "lg3_setpiece_weapon", art: "ec_training", when: { minSeason: 1 },
      title: "定位球新武器", body: "视频分析师把对手近五场的定位球失球剪成合集：每个丢球都在同一个区域。教练拍板：「这周就练这个。」你被指派为战术角球的第一出球点。",
      options: [
        { text: "加练二十组战术角球", response: "你的弧线一遍遍碾过同一个落点，直到闭着眼都能找到队友的跑位路线。周末的战术板，多了一枚你署名的棋子。",
          fx: { coach_trust: 4, discipline: 3 } },
        { text: "提议自己也埋伏在后点", response: "「让我也插进去试试？」教练盯着你看三秒：「胆子不小。」试验成功了两次，从此对手的球探报告里多了一行你的名字。",
          fx: { confidence: 4, coach_trust: 3 } },
      ] },
    { id: "lg3_pens_helmet", stage: "post", tier: "L2", cat: "prep", once: "lg3_pens_helmet", art: "ec_penalty", when: { minSeason: 2 },
      title: "点球手的排位战争", body: "队内点球训练榜贴出来：你排第二，第一名是队内头号射手。他淡淡来了句：「正式比赛还是我来。」十二码点前，也有江湖。",
      options: [
        { text: "用命中率说话", response: "你连着两周加练到最后一颗球，命中率反超。数据贴回墙上那天，他先开了口：「下次你来罚。」——江湖规矩，赢家的。",
          fx: { confidence: 5, discipline: 4 } },
        { text: "主动让贤，专攻运动战", response: "「点球你罚，我把力气留在这九十分钟里。」他愣了一下，往后的传中球却总是先找你——有些让步，换回来的是信任。",
          fx: { chemistry: 5, coach_trust: 3 } },
      ] },
    { id: "lg3_video_night", stage: "post", tier: "L2", cat: "prep", once: "lg3_video_night", art: "ec_night", when: { minSeason: 1 },
      title: "录像室的深夜", body: "赛前夜你在录像室看对手边后卫的防守习惯，一帧一帧：他上抢前会先看一眼边裁。看完抬头，发现队友也没走——两人对着同一块屏幕，聊到了保安来锁门。",
      options: [
        { text: "把发现整理成三页笔记", response: "第二天的队会上你讲了十分钟，教练直接把你的笔记拍进战术板。那场比赛你两次从他上抢的空当身后吃掉他。",
          fx: { coach_trust: 5, confidence: 4 } },
        { text: "拉上队友一起加练跑位", response: "录像室聊出来的默契，当晚就去了训练场踩点。周末那脚心领神会的斜塞，解说喊了出来：「这俩人是不是有心灵感应！」",
          fx: { chemistry: 6, morale: 3 } },
      ] },
    { id: "lg3_boots_breakin", stage: "post", tier: "L2", cat: "prep", once: "lg3_boots_breakin", art: "ec_training", when: { minSeason: 1 },
      title: "新战靴的磨合期", body: "赞助商送来了新一代战靴：更轻、更贴、鞋钉布局全新。但两周内两场硬仗，穿新鞋还是穿老伙计？装备师说：「鞋认脚，脚也得认鞋。」",
      options: [
        { text: "信任科技，立刻切换", response: "第一天磨出水泡，第三天开始顺脚。等到比赛日，那双鞋轻得像没穿——变向的第一步，你快了半拍。",
          fx: { confidence: 4, injury_risk: -2 } },
        { text: "老鞋踢硬仗，训练磨合", response: "你让新鞋先进训练场。稳字当头的老规矩救了那场德比，也让你明白：改变可以，但别在悬崖边改。",
          fx: { discipline: 4, coach_trust: 2 } },
      ] },
    { id: "lg3_warmup_ritual", stage: "post", tier: "L2", cat: "prep", once: "lg3_warmup_ritual", art: "ec_stadium", when: { minSeason: 1 },
      title: "热身仪式被拍到了", body: "你赛前雷打不动的热身顺序被现场镜头捕捉，剪进短视频疯转：左脚先踩线、两次触地、再看一眼看台。评论区吵翻了：「迷信」还是「仪式感」？",
      options: [
        { text: "大方承认：这是我的开关", response: "你在采访里笑：「每个球员都有启动仪式，我的只是被拍到了。」当晚热身镜头给了你特写，看台齐声倒数你的两次触地。",
          fx: { fan_love: 5, morale: 3 } },
        { text: "从此换一套顺序", response: "你嫌被围观麻烦，换了套新流程。结果比赛日总觉得少了点什么——最后还是偷偷改了回来。有些东西，别说破。",
          fx: { confidence: 4, media_relation: -2 } },
      ] },
    { id: "lg3_scout_brief", stage: "post", tier: "L2", cat: "prep", once: "lg3_scout_brief", art: "ec_night", when: { minSeason: 2 },
      title: "球探的一页纸", body: "首席球探递给你一页纸：对手中场核心的七个习惯，其中一条用红笔圈着——「被逼抢时习惯性先护右脚」。他问你：「看懂了吗？」",
      options: [
        { text: "申请亲自盯防他", response: "整场比赛你像影子一样堵他右脚，他被迫用左脚出球，失误两次。赛后他找你换球衣：「下次注意点，我这页纸该更新了。」",
          fx: { coach_trust: 5, confidence: 4 } },
        { text: "把情报分享给队友", response: "你把七个习惯做成了简单口诀教给中场线。集体绞杀下对手核心半场被换下——一个人的功课，变成了全队的墙。",
          fx: { chemistry: 5, coach_trust: 3 } },
      ] },
    { id: "lg3_captain_deputy", stage: "post", tier: "L1", cat: "prep", once: "lg3_captain_deputy", art: "ec_locker", when: { minSeason: 3, minApps: 25 },
      title: "袖标递了过来", body: "队长赛前热身拉伤退阵，教练把袖标塞给你：「今天你来喊。」更衣室里二十双眼睛看着你——这不是荣誉，是九十分钟的噪音都要你来扛。",
      options: [
        { text: "「都听我的，别客气。」", response: "你学着老队长的样子在丢球时吼人、在领先时压节奏。赛后他拍你肩膀：「嗓子哑了？习惯就好。」——他年轻时也是这么哑的。",
          fx: { coach_trust: 6, chemistry: 4, confidence: 3 } },
        { text: "把指挥权分给老将", response: "你戴上袖标，却把中后场的调度交给踢了十年的老中卫：「你懂的位置比我多。」老将踢出了赛季最佳一战，你学会了袖标的另一种戴法。",
          fx: { chemistry: 6, media_relation: 3 } },
      ] },
    { id: "lg3_opponent_scout_you", stage: "post", tier: "L2", cat: "prep", once: "lg3_opponent_scout_you", art: "ec_press", when: { minSeason: 2, minApps: 15 },
      title: "对手在研究你了", body: "经纪人转来消息：下周对手的球探连续三场在看台盯着你，笔记记了满满一页。被研究的滋味很微妙——这是威胁，也是身价。",
      options: [
        { text: "特意留一手，比赛日再亮", response: "这两周训练你收着踢，把自己最好的斜塞藏了起来。对手布置完全按旧录像来——比赛日那脚斜塞撕开的缺口，就是给他们准备的。",
          fx: { confidence: 5, commercial_value: 3 } },
        { text: "无视情报，以不变应万变", response: "「让他们看，我又不是只会一招。」你照常训练照常踢。对手盯死了你的内切，你却用头球完成了助攻——球探的纸，永远写不完。",
          fx: { confidence: 4, fan_love: 3 } },
      ] },

    // ── 舆论风暴 ──
    { id: "lg3_renewal_leak", stage: "post", tier: "L1", cat: "press", once: "lg3_renewal_leak", art: "ec_press", when: { minSeason: 2, minApps: 20 },
      title: "续约报价被曝光了", body: "小报头版：你的续约周薪数字被精确到个位曝光。更衣室气氛微妙，球迷论坛吵成两派：「配」还是「不配」。经纪人电话被打爆。",
      options: [
        { text: "公开表态：专心踢球", response: "你在赛前发布会只说了一句：「数字是俱乐部和经纪人的事，我的事在草皮上。」第二天 sports 版把这句话做成了标题——这次是正面的。",
          fx: { media_relation: 5, coach_trust: 4 } },
        { text: "借势让经纪人施压", response: "你默许了烟雾弹策略。两周后续约数字上浮了一截——代价是那两周里，每次拿球看台都有零星的嘘声试音。",
          fx: { commercial_value: 5, fan_love: -4, money: 20000 } },
      ] },
    { id: "lg3_price_tag", stage: "post", tier: "L1", cat: "press", once: "lg3_price_tag", art: "ec_contract", when: { minSeason: 3, minApps: 25 },
      title: "你有了身价数字", body: "转会市场网站给你标了价，媒体用整版讨论「他值不值」。你第一次发现，自己的名字前面多了一个带零的数字——像商品条形码，也像军功章。",
      options: [
        { text: "截图存进手机相册", response: "你没告诉任何人。只是每次状态低谷时翻出来看一眼：别人眼里的你值这个数，别自己看轻自己。",
          fx: { confidence: 4, commercial_value: 4 } },
        { text: "公开回应：身价是队友的", response: "「这个数字一半属于给我传球的人。」队友群里炸出一排敬礼表情，中场核心回了句：「下赛季让你翻倍。」",
          fx: { chemistry: 5, fan_love: 4 } },
      ] },
    { id: "lg3_quote_cut", stage: "post", tier: "L2", cat: "press", once: "lg3_quote_cut", art: "ec_press", when: { minSeason: 1 },
      title: "被断章取义的采访", body: "三十分钟的采访被剪成十五秒：「我们配不上胜利。」全网都在转。可你明明说的是「如果继续这么踢，我们配不上争冠目标」——前半句被剪掉了。",
      options: [
        { text: "放出完整录音自证", response: "球队记者把原片挂出来，风向一夜反转。但你记住了那种滋味：十五秒就能定义一个人。",
          fx: { media_relation: 4, confidence: 3 } },
        { text: "沉默，用表现回击", response: "你没解释一个字，周末比赛传射建功。赛后记者围上来问那句话，你笑：「哪句？」——掌声比澄清更响。",
          fx: { confidence: 5, fan_love: 3 } },
      ] },
    { id: "lg3_social_like", stage: "post", tier: "L2", cat: "press", once: "lg3_social_like", art: "ec_phone", when: { minSeason: 1 },
      title: "手滑的点赞", body: "深夜刷手机，你给一条「主教练该变阵了」的帖子手滑点了赞。三分钟后截图已传遍全网：「球员亲口认证更衣室矛盾！」实际上你只是拇指胖了。",
      options: [
        { text: "第一时间去敲教练门", response: "你拿着手机当面解释，教练看完截图笑了：「我半夜也手滑赞过卖你传闻的帖子。」一场风暴在两声大笑里散了场。",
          fx: { coach_trust: 5, morale: 3 } },
        { text: "装死不发，等风过去", response: "谣言发酵了三天，直到队内知情人出来辟谣才平息。你学乖了：深夜的手机，得当作蝴蝶效应发生器来看。",
          fx: { media_relation: -3, discipline: 3 } },
      ] },
    { id: "lg3_legend_critic", stage: "post", tier: "L1", cat: "press", once: "lg3_legend_critic", art: "ec_press", when: { minSeason: 2, minApps: 20 },
      title: "名宿的专栏批评", body: "队史传奇在专栏里点名批评你：「态度有余，阅读比赛不足。」报纸卖断了货。全队都在偷偷观察你的反应——名宿的批评，在球迷心里是圣旨。",
      options: [
        { text: "约名宿喝咖啡请教", response: "老先生愣了一下，聊了两个小时，从跑位聊到他当年被骂的岁月。专栏下一期标题变成了：「我收回一半——他愿意听，这在今天很少见。」",
          fx: { media_relation: 5, confidence: 4, chemistry: 2 } },
        { text: "把专栏贴在储物柜内侧", response: "每天更衣第一眼就是它。一个月后你的关键传球数翻倍，记者问起，你说：「我有个每天见面的批评家。」",
          fx: { confidence: 5, discipline: 3 } },
      ] },
    { id: "lg3_deadline_day", stage: "post", tier: "L1", cat: "press", once: "lg3_deadline_day", art: "ec_phone", when: { minSeason: 2 },
      title: "转会窗最后一小时的传闻", body: "关窗前一小时，大媒体突然爆出「豪门有意」。社交网络瞬间沸腾，你人在训练场，手机在储物柜里疯狂震动——经纪人打来的第三个电话你没接。",
      options: [
        { text: "关机，专心训练", response: "你把手机扔进柜子锁上，练完加练才开机。传闻最后不了了之，但教练把你叫去：「今天你的态度，我记下了。」",
          fx: { coach_trust: 6, confidence: 4 } },
        { text: "接电话，听听也无妨", response: "经纪人说了很多「可能性」，你说：「有报价走程序，没报价别烦我。」消息传出后俱乐部高层对你多了三分敬意——专业，是双向的。",
          fx: { commercial_value: 4, media_relation: 3, coach_trust: -2 } },
      ] },

    // ── 队友线 ──
    { id: "lg3_keeper_farewell", stage: "post", tier: "L1", cat: "mate", once: "lg3_keeper_farewell", art: "ec_tribute", when: { minSeason: 2 },
      title: "替补门将的最后一舞", body: "三号门将三十八岁，赛季末退役。他十年出场次数一只手数得过来，但每次杯赛轮换他都拼到最后一秒。教练悄悄问你：「最后一轮，帮他刷一场首发？」",
      options: [
        { text: "全力支持这场告别战", response: "你赛前动员全队「为零号位而战」。那场他扑出一记必进球，终场哨响时全队把他抛向天空——草坪上撒的都是他的十年。",
          fx: { chemistry: 6, fan_love: 4, morale: 4 } },
        { text: "私下送他一件纪念品", response: "你把全队签名的比赛用球送他，球上写着：「 首发 1 次，扑救 1000 次。」他红了眼眶：「你们这帮小子，比冠军奖杯还沉。」",
          fx: { chemistry: 5, morale: 3 } },
      ] },
    { id: "lg3_language_class", stage: "post", tier: "L2", cat: "mate", once: "lg3_language_class", art: "ec_training", when: { minSeason: 1 },
      title: "外援的中文课", body: "新外援只会三个词：「传球」「快」「我的」。你在场上喊战术他一脸茫然，俱乐部请了语言老师——但进度条太慢，下周就要打硬仗。",
      options: [
        { text: "发明手势暗号系统", response: "你俩用手势编了整套暗语：拳头是长传，摸头是造越位。对手看的一头雾水，解说：「这队内线暗号比谍战片还多！」",
          fx: { chemistry: 6, confidence: 3 } },
        { text: "每天陪他练半小时语言", response: "一个月后他能听懂全部战术术语了。第一句完整中文他说的是：「传球给你，永远不亏。」全队笑疯，你们成了死党。",
          fx: { chemistry: 5, morale: 4 } },
      ] },
    { id: "lg3_rival_injured", stage: "post", tier: "L1", cat: "mate", once: "lg3_rival_injured", art: "ec_rehab", when: { minSeason: 2, minApps: 15 },
      title: "竞争对手倒下了", body: "和你竞争主力的队友训练中重伤，休战三个月。你成了最大受益者——但看着他戴上护具离场时，心里那滋味说不上来。位置是空出来了，人心也在看着你。",
      options: [
        { text: "每天康复室送一次饭", response: "你成了他的「外卖员」。三个月后他复出那天更衣室贴了张纸：「谢了兄弟——但现在，主力位置我要抢回来。」你笑着回了句：「排队。」",
          fx: { chemistry: 6, fan_love: 3, morale: 3 } },
        { text: "沉默抓住机会证明自己", response: "你用三个月的连续首发坐稳了位置。他复出后你俩的良性竞争让教练直呼内卷：「这才是我想看到的更衣室。」",
          fx: { coach_trust: 5, confidence: 4, chemistry: -2 } },
      ] },
    { id: "lg3_academy_kid", stage: "post", tier: "L2", cat: "mate", once: "lg3_academy_kid", art: "ec_youth", when: { minSeason: 2 },
      title: "青训小弟跟车", body: "刚提上一队的十七岁小将每天蹭你的车去训练，理由是「顺路」。三个月了你才发现他家和你完全反方向——他只是想多问你几个问题。",
      options: [
        { text: "把车上时间变成私教课", response: "你把你的跑位心得、恢复秘诀倾囊相授。半年后他进入大名单，上车第一句：「教练，今天讲防守吗？」——你被叫教练了，虽然只有十七岁听众。",
          fx: { chemistry: 5, media_relation: 3, morale: 3 } },
        { text: "劝他多问教练组", response: "「我的经验有限，教练组的课更系统。」他听话去问，进步飞快。教练偶然提起这事：「你把他往正道上引了，记一功。」",
          fx: { coach_trust: 5, chemistry: 3 } },
      ] },
    { id: "lg3_captain_armband", stage: "post", tier: "L1", cat: "mate", once: "lg3_captain_armband", art: "ec_locker", when: { minSeason: 3, minApps: 25 },
      title: "队长人选的风波", body: "老队长年事已高，赛季末可能交出袖标。媒体已经开始投票选「下一任队长」，你排第二——第一名是踢了十年的老中卫。更衣室里没人提这事，但每个人都提过。",
      options: [
        { text: "公开表态支持老中卫", response: "「队长就该是踢得最久、扛得最多的人。」老中卫听到后半夜发来消息：「兄弟，下赛季我们俩一起扛。」风波在你一句话里平静收场。",
          fx: { chemistry: 6, coach_trust: 4, fan_love: 3 } },
        { text: "不站队，用表现说话", response: "你全程置身事外，把票投给了比赛本身。赛季末队长投票你第二高票——教练说了句：「急什么，你的年份在后面。」",
          fx: { confidence: 4, discipline: 4, coach_trust: 3 } },
      ] },
    { id: "lg3_teammate_wedding", stage: "post", tier: "L2", cat: "mate", once: "lg3_teammate_wedding", art: "ec_family", when: { minSeason: 1 },
      title: "队友婚礼请柬", body: "替补前锋的婚礼和联赛间歇期撞车，全队都收到请柬。他平时话不多，但请柬上专门给你写了一行：「新郎席缺个会讲笑话的。」",
      options: [
        { text: "当伴郎，全场最忙", response: "你接亲、挡酒、致辞三件套全包。婚礼视频里你被灌到脸红着唱歌，成了球队群表情包——但他说：「你是我兄弟，这才叫来过。」",
          fx: { chemistry: 6, morale: 4 } },
        { text: "随礼到场，安静吃饭", response: "你送了大红包，喝了两杯就提前撤了——第二天还有训练。他后来在自传里写：「专业的人连喝喜酒都算着卡路里。」",
          fx: { chemistry: 3, discipline: 4 } },
      ] },

    // ── 教练线 ──
    { id: "lg3_new_assistant", stage: "post", tier: "L2", cat: "coach", once: "lg3_new_assistant", art: "ec_night", when: { minSeason: 2 },
      title: "新来的年轻助教", body: "俱乐部空降了位三十岁的助教，数据分析出身，开口全是模型和概率。老队员们私下叫他「Excel 先生」。教练让他负责你的位置专项训练。",
      options: [
        { text: "第一个配合他的数据训练", response: "你成了「Excel 先生」的样板间。三个月后你的跑位热图换了形状——教练看着数据说：「老法学选位，新法学跑位，你俩都占了。」",
          fx: { coach_trust: 5, confidence: 3 } },
        { text: "先观察，不站队新旧", response: "你两头都学：老助教的哲学、新助教的模型。有记者问你怎么看新旧之争，你说：「能让我进步的都是好法。」这段采访成了队内流行的外交辞令。",
          fx: { discipline: 4, media_relation: 4 } },
      ] },
    { id: "lg3_coach_pressured", stage: "post", tier: "L1", cat: "coach", once: "lg3_coach_pressured", art: "ec_press", when: { minSeason: 2 },
      title: "教练下课倒计时", body: "三连败后，「下课」横幅挂上了看台。发布会上教练的白发肉眼可见地多了。他带你的这两年，你的进步有目共睹——现在轮到你为他做点什么了。",
      options: [
        { text: "带头表态：为他而战", response: "你第一个在「支持教练」的全队合影上签字。周末比赛你拼到抽筋被抬下场，看台的嘘声慢慢变成了掌声。那场平局，救了他的帅位。",
          fx: { coach_trust: 7, chemistry: 4, morale: -2 } },
        { text: "保持距离，足球没有救世主", response: "「成绩是他自己的答卷，我踢好我的球。」你连续三场进球如数上交。新帅到来后，你没被打上「旧臣」标签——两边的路都留着。",
          fx: { confidence: 4, media_relation: 3, coach_trust: -3 } },
      ] },
    { id: "lg3_setpiece_coach", stage: "post", tier: "L2", cat: "coach", once: "lg3_setpiece_coach", art: "ec_training", when: { minSeason: 1 },
      title: "定位球大师来了", body: "俱乐部请来传说中的定位球教练，据说经手过的球队定位球得分率翻倍。第一堂课他只问了一个问题：「你的助跑是几步？为什么是这几步？」",
      options: [
        { text: "全盘接受改造", response: "四步改三步，摆球角度调了五度，你罚任意球像换了个物种。赛季末你的任意球直接得分刷了生涯新高——「大师」两个字，值回票价。",
          fx: { confidence: 5, coach_trust: 4 } },
        { text: "保留自己的习惯，取其精华", response: "你挑了跑位掩护那套学，助跑习惯保留。大师不怒反笑：「知道自己要什么的球员，比听话的球员更难得。」",
          fx: { confidence: 4, discipline: 3 } },
      ] },
    { id: "lg3_coach_notebook", stage: "post", tier: "L2", cat: "coach", once: "lg3_coach_notebook", art: "ec_letter", when: { minSeason: 2 },
      title: "教练的小本子", body: "你无意瞥见教练的战术本：每名球员一页，你的那页写着三条优点和一条「待观察：大场面心态」。他发现你看到了，合上本子：「赛季末再聊。」",
      options: [
        { text: "用大场面表现撕掉那行字", response: "接下来的德比、杯赛淘汰赛，你场场挺身而出。赛季末的总结谈话，他把那页纸撕了给你看：「待观察」三个字早就被你的表现划掉了。",
          fx: { confidence: 6, coach_trust: 4 } },
        { text: "主动约谈求批评", response: "「那行字写的是我最大的短板，我想现在就改。」教练愣了愣，跟你聊了四十分钟。后来那本子里，你的那页成了最厚的一页。",
          fx: { coach_trust: 6, discipline: 3 } },
      ] },

    // ── 裁判与争议 ──
    { id: "lg3_goal_disallowed", stage: "post", tier: "L1", cat: "ref", once: "lg3_goal_disallowed", art: "ec_goal_line", when: {played: true,  minSeason: 1 },
      title: "体毛级越位", body: "你的绝平进球被 VAR 划掉了——回放显示你的肩膀超出了防线半个身位，画出来的越位线细得像头发丝。全场嘘声十分钟不停，你盯着大屏幕，拳头攥得发白。",
      options: [
        { text: "鼓掌示意队友冷静", response: "你转身对看台鼓了鼓掌，示意队友继续。这个镜头被做成动图传疯：「这就是大将风度。」十分钟后你送出绝杀助攻——比进球更狠的回击。",
          fx: { confidence: 5, fan_love: 4, morale: 3 } },
        { text: "对裁判摊手抗议", response: "你冲着第四官员摊开双手，吃到了黄牌。赛后被罚了款，但球迷论坛置顶：「至少有人替我们喊了出来。」有些黄牌，是勋章。",
          fx: { fan_love: 5, discipline: -3, morale: 3 } },
      ] },
    { id: "lg3_dive_scandal", stage: "post", tier: "L2", cat: "ref", once: "lg3_dive_scandal", art: "ec_penalty", when: { minSeason: 1 },
      title: "假摔风波", body: "对手球员在你面前倒地赢得点球，慢镜头显示根本没碰到他。他站起来冲你眨了眨眼。点球罚进，你们输了球——你把那份屈辱记了一整周。",
      options: [
        { text: "二回合用表现讨回来", response: "你把那张截图设成了手机壁纸。二回合你造了他一张黄牌并赢回点球，赛后握手时你说：「这次没眨眼的机会了吧。」",
          fx: { confidence: 5, discipline: 3 } },
        { text: "公开呼吁引入判罚申诉", response: "你在采访里说：「裁判也是人，但假摔的人应该被追罚。」球员工会转发了你的发言——一个月后联赛真出了新规，你是第一个受益者。",
          fx: { media_relation: 5, fan_love: 4 } },
      ] },
    { id: "lg3_stoppage_protest", stage: "post", tier: "L2", cat: "ref", once: "lg3_stoppage_protest", art: "ec_stadium", when: { minSeason: 1 },
      title: "补时玄学", body: "领先时补时三分钟，落后时同一位裁判能给出七分钟。数据博主统计了你全赛季的补时曲线，配文：「这支球队每次都在和第四官员的表赛跑。」",
      options: [
        { text: "学会领先时的控场艺术", response: "教练专门加了「比赛管理」课：角旗区护球、犯规计时、门将开球节奏。丑陋但有效——从那以后你领先的比赛，补时只是走个形式。",
          fx: { coach_trust: 4, discipline: 4 } },
        { text: "练体能：补时多久都扛得住", response: "你把加练重心放在了最后十五分钟的冲刺储备。赛季末数据惊人：你第 85 分钟后的进球全联赛第一——时间越久，越是你的主场。",
          fx: { confidence: 5 } },
      ] },
    { id: "lg3_red_appeal", stage: "post", tier: "L1", cat: "ref", once: "lg3_red_appeal", art: "ec_rival", when: {played: true,  minSeason: 2 },
      title: "冤枉的红牌", body: "你被误判两黄变一红罚下，回放清清楚楚是先碰到球。俱乐部决定申诉，但流程要一周——这意味着你可能缺席下一场德比。听证会前夜，你翻来覆去睡不着。",
      options: [
        { text: "全力配合申诉，等结果", response: "你逐帧找出触球画面交给律师。申诉成功那天你在训练场加练到天黑——德比场上，你用一个进球告诉裁判：这才是你该被记住的方式。",
          fx: { confidence: 5, fan_love: 3, morale: 3 } },
        { text: "接受停赛，转化成动力", response: "「申诉是权利，但我不想把命运交给会议桌。」你接受处罚并加练体能。德比替补登场二十分钟，你把攒了一周的火全灌进了那脚射门。",
          fx: { confidence: 4, discipline: 4 } },
      ] },

    // ── 球迷与城市 ──
    { id: "lg3_tifo_crowdfund", stage: "post", tier: "L1", cat: "fan", once: "lg3_tifo_crowdfund", art: "ec_tifo", when: { minSeason: 2 },
      title: "球迷众筹的 TIFO", body: "死忠球迷区发起众筹，要为你做一幅全场最大的 TIFO：你的侧脸配上你说过的一句话。筹款页面两小时达标——他们选的那句话，正是你首秀后的采访。",
      options: [
        { text: "匿名捐了最后一笔缺口", response: "TIFO 展开那天全场沸腾，你站在草坪上看着自己的巨幅脸庞，眼眶发热。组织者后来才知道最后一笔是谁捐的，只说了句：「他懂。」",
          fx: { fan_love: 6, morale: 4 } },
        { text: "邀请众筹球迷代表观赛", response: "你自掏腰包请十位贡献者进包厢看球。赛后他们下到混合区和你合影，横幅上写着：「球迷和球员，本就是一支队伍。」",
          fx: { fan_love: 5, chemistry: 2, money: -15000 } },
      ] },
    { id: "lg3_banner_girl", stage: "post", tier: "L2", cat: "fan", once: "lg3_banner_girl", art: "ec_fan", when: {played: true,  minSeason: 1 },
      title: "看台小女孩的横幅", body: "每场主场，南看台固定位置都有一条手写横幅：「XX 加油」——落款是个八岁小女孩。工作人员说，她爸爸是季票用户，横幅是她写了三年的作业之外的作业。",
      options: [
        { text: "赛前送她一双签名球鞋", response: "小女孩抱着球鞋哭了十分钟。那晚你进球后跑向南看台做出「写字」的庆祝动作——第二天，她的新横幅变成了：「他看见我了！」",
          fx: { fan_love: 5, morale: 4 } },
        { text: "请她担任一场球童", response: "她牵着你走进球场的那天，她爸爸举着手机的手一直在抖。后来每次主场，南看台的横幅都会多一行小字：「全家都是你的人。」",
          fx: { fan_love: 4, fame: 100, morale: 3 } },
      ] },

    // ── 状态波动 ──
    { id: "lg3_goal_drought", stage: "post", tier: "L1", cat: "form", once: "lg3_goal_drought", art: "ec_bench", when: { minSeason: 2, minApps: 10, minConsecNoGoal: 7 },   // P101：文案「七场进球荒」→ 真值门（出场无进球连击）
      title: "七场进球荒", body: "七场了。你踢中了门框、被门将神扑、眼睁睁看着空门滑门而过。连自家解说都开始绕着弯安慰：「他创造的机会其实很多……」可足球只认数字。",
      options: [
        { text: "回看所有射门的录像", response: "凌晨三点的录像室里你找到了答案：压力大时你下意识提前看门将，触球瞬间眼睛离开了球。改掉这一个细节，第八场，网窝响了——你跪在草坪上捶地。",
          fx: { confidence: 6, discipline: 3 } },
        { text: "放下射手包袱做绿叶子", response: "「进球会回来的，先把别的做好。」你连续三场送出助攻、防守端跑动全队第一。进球荒结束那天，队友比你还高兴——他们看到了你扛住了什么。",
          fx: { chemistry: 5, coach_trust: 4, morale: 3 } },
      ] },
    { id: "lg3_rotation_fear", stage: "post", tier: "L2", cat: "form", once: "lg3_rotation_fear", art: "ec_bench", when: { minSeason: 1, minApps: 12, minConsecStarts: 14 },   // P101：文案「连续首发十四场」→ 真值门
      title: "轮换名单的阴影", body: "一周双赛，教练的轮换名单像悬在头上的刀：谁被轮到谁知道。你连续首发十四场后，第一感觉到了那丝异样——训练里教练看你的眼神，多了三分算计。",
      options: [
        { text: "主动申请轮休一场", response: "「我累了，让我歇一场，还您一个满血的。」教练愣了一下然后笑了——会算账的球员最省心。休息那场你坐看台上把对手战术记满了笔记本。",
          fx: { coach_trust: 5, discipline: 2 } },
        { text: "死磕首发，一场不想让", response: "你找到教练：「只要我能站着我就要踢。」连续二十场首发后你累到恢复变慢，但那个赛季的出场数你排了队内第一——硬，也是一种活法。",
          fx: { confidence: 4, injury_risk: 3 } },
      ] },
  ];
})();
