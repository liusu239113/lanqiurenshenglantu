/* ============================================================================
   G2 联赛风云收尾批（28 张）— 进 post 池 · G2 本批后达成 140/140
   子类：赛前备战 7 / 舆论风暴 5 / 队友线 5 / 教练线 4 / 裁判争议 3 / 球迷城市 2 / 状态波动 2
   沿用管线：L1 每半季≤4 / L2 ≤3 · 同类冷却 8 轮 · once 整生涯唯一
   ============================================================================ */
(function () {
  window.LEAGUE_CARDS5 = [
    // ── 赛前备战 ──
    { id: "lg5_deadball_exam", stage: "post", tier: "L2", cat: "prep", once: "lg5_deadball_exam", art: "ec_training", when: { minSeason: 2 },
      title: "定位球突击测验", body: "训练结束的哨响后，教练组突然发卷：过去五轮对手的定位球攻防图、我方每一套战术的代号与跑位顺序。闭卷，二十分钟。老将们叫苦连天。",
      options: [
        { text: "提前一周把战术代号做成卡片背", response: "发卷那天你是唯一全对的人。教练把你的卡片复印了全队人手一套——从此你成了队内战术代号的「活字典」。",
          fx: { coach_trust: 5, discipline: 4 } },
        { text: "凭理解答题，写出自己的理解", response: "卷面上你不仅答对了代号，还在空白处画了两套新跑位。教练盯着你画的那两套看了很久：「周末热身赛，用你画的这套。」",
          fx: { confidence: 5, coach_trust: 4 } },
      ] },
    { id: "lg5_gk_launch_study", stage: "post", tier: "L2", cat: "prep", once: "lg5_gk_launch_study", art: "ec_goal", when: { minSeason: 1 },
      title: "对手门将的开球密码", body: "分析师塞给你一段剪辑：对手门将门球全走短传，但被逼近时必开大脚找左路边线。他把音量调小：「这是你作为第一逼抢人的功课。抢断和进球之间，隔着一脚聪明逼抢。」",
      options: [
        { text: "反复看片设计逼抢路线", response: "你把他回传接球的惯用脚、抬头观察的时机全画进了脑子里。比赛日你佯装封近角、突然切传球线断球——单刀，进球，整套动作像抄过答案。",
          fx: { confidence: 5, coach_trust: 4 } },
        { text: "把情报同步给中场线", response: "你拉着中场一起看片，统一逼抢暗号。那次三人心有灵犀的围抢断球，被解说称为「教科书级的前场压迫」——一个人的作业，变成三条线的默契。",
          fx: { chemistry: 5, discipline: 3 } },
      ] },
    { id: "lg5_team_breakfast", stage: "post", tier: "L2", cat: "prep", once: "lg5_team_breakfast", art: "ec_family", when: { minSeason: 1 },
      title: "队长发起的集体早餐", body: "队长的提议：每周三全队提前一小时到，一起吃早餐，手机一律不准上桌。第一天，餐桌安静得可怕——平时在群里聊得火热的这帮人，面对面竟然没话说。",
      options: [
        { text: "第一个打破沉默讲糗事", response: "你把自己青年队时代的乌龙球故事全盘托出，全桌笑到拍桌。第三周起，早餐成了全队最抢的「节目」——比分落后时，是这桌饭把更衣室焊在了一起。",
          fx: { chemistry: 6, morale: 4 } },
        { text: "安静吃，观察谁被冷落", response: "你注意到总是独坐角落的年轻门将。你默默搬到他旁边，聊了第一次真正意义上的对话。两周后他在杯赛扑出两粒点球——没人知道那次早餐发生了什么。",
          fx: { chemistry: 5, confidence: 3 } },
      ] },
    { id: "lg5_pitch_meeting", stage: "post", tier: "L2", cat: "prep", once: "lg5_pitch_meeting", art: "ec_rain", when: { minSeason: 1 },
      title: "雨战装备会议", body: "天气预报：比赛日降水概率 90%，场地排水一般。队务摆出一排钉鞋：长钉、短钉、混合钉。老队医敲着桌子：「选错钉子，草皮会吃掉你的脚踝。」",
      options: [
        { text: "听队医的，选长钉求稳", response: "雨战里对手滑倒三次，你稳稳站住了每一次对抗。终场哨响时你踩着泥浆举起双臂——雨夜里的稳，比漂亮更值钱。",
          fx: { discipline: 4, injury_risk: -2, coach_trust: 3 } },
        { text: "折中选混合钉，兼顾出球", response: "你赌了一把中间值。上半场的一次打滑让你惊出一身冷汗，你及时换回了长钉——这次试错让你记住：天气不服从任何人的技术特点。",
          fx: { confidence: 3, discipline: 3 } },
      ] },
    { id: "lg5_sports_psych", stage: "post", tier: "L2", cat: "prep", once: "lg5_sports_psych", art: "ec_locker", when: { minSeason: 2 },
      title: "运动心理师进驻", body: "俱乐部请来一位运动心理师，办公室挂着褪色的窗帘。全队都以「我心理没问题」为由绕着他走。你路过时他叫住你：「你的赛前心率变异数据，全队最差——你比谁都紧张，只是装得好。」",
      options: [
        { text: "推门进去，聊一次试试", response: "一小时后你走出来，感觉肩膀轻了两斤。他教你的「呼吸锚点法」第一次用上，就把点球冷静地罚进了死角——心理训练不是治病，是上润滑油。",
          fx: { confidence: 5, morale: 3 } },
        { text: "帮他打破全队的回避", response: "你公开预约了他的时间。三天后他的预约表排满了一个月，更衣室的暗流第一次有了出口。他私下说：「你推开的那扇门，救的不止你一个人。」",
          fx: { chemistry: 5, discipline: 3, coach_trust: 3 } },
      ] },
    { id: "lg5_role_cut", stage: "post", tier: "L2", cat: "prep", once: "lg5_role_cut", art: "ec_night", when: { minSeason: 2 },
      title: "教练给你放的私人剪辑", body: "录像室里只有你和他。他放的不是对手——是你本赛季的三十次无球跑动剪辑。「看，」他暂停画面，「这三十次里，二十二次你没接到球。但正是这二十二次，拉开了别人的进球空间。」",
      options: [
        { text: "接受「隐形价值」，继续做蓝领", response: "你把这条剪辑存了下来。此后每次没接到传球你都不再烦躁——你知道摄像机没拍到的部分，教练都记着。体系因你而转。",
          fx: { coach_trust: 6, discipline: 4 } },
        { text: "「我想把这二十二次变成三十八次」，再加威胁", response: "你请求在无球跑动里加入「接球终结」的分支路线。教练同意实验，一个月后你的触球点覆盖了禁区肋部——蓝领的手上，长出了刀。",
          fx: { confidence: 5, coach_trust: 4 } },
      ] },
    { id: "lg5_back_build", stage: "post", tier: "L2", cat: "prep", once: "lg5_back_build", art: "ec_training", when: { minSeason: 1 },
      title: "后场出球演练", body: "新战术要求门将短传出球、后卫线拆成三个出球点。作为出球链条里最靠前的一环，教练要求你在压迫下「永远给出第三个选项」。第一次合练，你们后场丢了三次球权，门将脸色发白。",
      options: [
        { text: "加练回撤接应，练到条件反射", response: "你把回撤的角度、时机拆成三档练了两周。当压迫再度袭来时，你们的后场出球像钟表一样精确——从门将到你，十二脚传递撕开全场。",
          fx: { coach_trust: 5, chemistry: 4 } },
        { text: "建议设置「保底长传」预案", response: "「漂亮要打，命也要保。」你说服教练保留一脚解围保底。这套「双保险」让全队踢新战术时心里有底——变革期的球队，需要一个敢说真话的人。",
          fx: { coach_trust: 4, discipline: 3 } },
      ] },

    // ── 舆论风暴 ──
    { id: "lg5_doc_crew", stage: "post", tier: "L1", cat: "press", once: "lg5_doc_crew", art: "ec_press", when: { minSeason: 2 },
      title: "纪录片镜头进了更衣室", body: "俱乐部和流媒体平台签约，纪录片摄制组进驻：全天候跟拍、机位藏在角落、麦克风别在教练领口。队员们瞬间学会了两件事：管住嘴，和对着镜头「正常」。",
      options: [
        { text: "做真实的自己，镜头当空气", response: "你在镜头前加练、失落、大笑、骂草皮。纪录片播出后，你的片段成了全网最火的部分——「真实」是流量时代最稀缺的表演。",
          fx: { fan_love: 6, media_relation: 4 } },
        { text: "借镜头经营人设", response: "你对镜头的每句话都精心设计，播出后热度暴涨、商业邀约翻倍。但有队友私下说：「跟纪录片里的你比，我们更想念真人。」",
          fx: { commercial_value: 5, media_relation: 3, chemistry: -3 } },
      ] },
    { id: "lg5_pundit_jinx", stage: "post", tier: "L2", cat: "press", once: "lg5_pundit_jinx", art: "ec_press", when: {played: true,  minSeason: 1 },
      title: "名嘴的「毒奶」", body: "著名解说在节目里预测：「这场他必哑火，我愿用下个月工资担保。」这段话被剪成视频在球迷群疯传。更衣室里，队友把视频转到了队群，配了三个吃瓜表情。",
      options: [
        { text: "在队群回了一句「记账」", response: "比赛日你梅开二度，指了指耳朵的庆祝动作被做成动图。赛后那位解说真发了条道歉视频——你和全队笑着转发了三遍。舆论这东西，赢球是最好的回敬。",
          fx: { confidence: 5, fan_love: 4, morale: 3 } },
        { text: "一笑了之，拒绝回应", response: "你没有回应一个字。赛后记者追问，你说：「解说也是他的工作。」这段回答被赞「高情商」，但你自己知道——那口气，你咽下去的时候就没打算吐出来。",
          fx: { media_relation: 4, discipline: 3 } },
      ] },
    { id: "lg5_forum_thread", stage: "post", tier: "L2", cat: "press", once: "lg5_forum_thread", art: "ec_phone", when: { minSeason: 2 },
      title: "球迷论坛的万字分析帖", body: "一位球迷写了篇一万两千字的帖子分析你的跑位，配图二十张、动图六段，结论是「他被严重低估」。帖子盖到八百楼。经纪人把链接转给你：「看看人家怎么看你。」",
      options: [
        { text: "注册小号回帖致谢", response: "你用小号回了句「谢谢，我会继续跑」。楼主后来查出是你，激动到发帖手抖——这个故事传开后，你的球迷论坛成了全网最暖的社区。",
          fx: { fan_love: 5, morale: 4 } },
        { text: "把帖子里的建议研究一遍", response: "你认真读完一万两千字，发现那位球迷指出的「回防时机偏晚」是真的。你针对性改了三周——世界上最好的分析师，有时候在看台上免费打工。",
          fx: { discipline: 4, coach_trust: 4 } },
      ] },
    { id: "lg5_charity_gala", stage: "post", tier: "L2", cat: "press", once: "lg5_charity_gala", art: "ec_city", when: { minSeason: 2 },
      title: "慈善晚宴的红毯首秀", body: "俱乐部年度慈善晚宴，你第一次踏上红毯。造型师给你配了全套西装，媒体长枪短炮排列成阵。你意识到：今晚你代表的不是自己，而是墙上那行字——「为山区孩子捐一座球场」。",
      options: [
        { text: "捐出球衣义卖并致辞", response: "你的签名球衣拍出了当晚最高价。致辞时你没背稿子，只说了句「山里的孩子踢球的样子，和你们一样」。当晚筹款额破了纪录。",
          fx: { fan_love: 5, media_relation: 4, money: -20000 } },
        { text: "安静捐款，婉拒镜头", response: "你捐了一笔不小的数目却躲开了所有镜头。主办方最后还是把你的名字印在了答谢名单——有人拍到你离场时在门口蹲着逗主办方的导盲犬，那张照片比任何红毯照都火。",
          fx: { fan_love: 4, morale: 4, money: -30000 } },
      ] },
    { id: "lg5_leak_rumor", stage: "post", tier: "L1", cat: "press", once: "lg5_leak_rumor", art: "ec_social", when: { minSeason: 2 },
      title: "更衣室录音风波", body: "某小报声称拿到「更衣室录音」：你和教练爆发激烈争吵。录音模糊得像隔着三堵墙，但标题耸动。俱乐部公关紧急开会，问你：「要不要发联合声明？」",
      options: [
        { text: "不声明，让教练来定调", response: "教练在发布会上主动提起：「我们吵了——为了一个战术细节，吵完一起去吃了火锅。」一句话把风暴变成了更衣室的佳话。跟对教练，连辟谣都自带温度。",
          fx: { coach_trust: 6, media_relation: 3 } },
        { text: "联合声明+主动接受专访", response: "你配合公关做了深度专访，把「争吵」的真相摆上台面。舆论平息了，但你在队内多了个外号——「发言人」。有些澄清，做得越漂亮，离队友越远。",
          fx: { media_relation: 5, chemistry: -2 } },
      ] },

    // ── 队友线 ──
    { id: "lg5_debut_gift", stage: "post", tier: "L2", cat: "mate", once: "lg5_debut_gift", art: "ec_youth", when: { minSeason: 2 },
      title: "新秀的首秀前夜", body: "十八岁的新秀明天生涯首次首发。你在走廊撞见他一个人对着墙练深呼吸，紧张得同手同脚。你想起自己当年首秀前夜——也是这样，在走廊里像只无头苍蝇。",
      options: [
        { text: "送他一句你当年的「救命话」", response: "「紧张说明你在乎。把第一个动作做简单，后面的交给身体。」第二天他首秀送出助攻，跑过来抱住你——那句话，从老将传给你，现在传给了他。",
          fx: { chemistry: 6, morale: 3 } },
        { text: "赛前把他拽进热身圈", response: "你拉着他和主力组一起热身、一起喊口号，让他在笑声里忘了紧张。他后来在采访里说：「那十分钟，比什么心理课都管用。」",
          fx: { chemistry: 5, fan_love: 3 } },
      ] },
    { id: "lg5_bro_rival", stage: "post", tier: "L1", cat: "mate", once: "lg5_bro_rival", art: "ec_rival", when: { minSeason: 3 },
      title: "兄弟转会去了死敌", body: "和你一起成长了四年的兄弟，转会窗最后一天官宣加盟同城死敌。他的告别长文里没提你，你的手机停在他的对话框——上一条还是上周约的烧烤，永远赴不了局了。",
      options: [
        { text: "公开发文送别：兄弟不受队籍约束", response: "「球场上见要下脚，球场下永远是兄弟。」这条动态成了当季最暖转会文案。首回合德比你们对位九十分钟，赛后交换球衣——看台上的嘘声，是给你俩的伴奏。",
          fx: { fan_love: 5, confidence: 4, chemistry: -2 } },
        { text: "冷处理，把他当普通对手", response: "你没有发一个字。德比战你拼到犯规染黄，他摔倒了又爬起来冲你吼。赛后他先伸出了手——你握了。有些告别不需要文案，需要在场上证明：谁也没让谁。",
          fx: { confidence: 5, discipline: 3 } },
      ] },
    { id: "lg5_roommate", stage: "post", tier: "L2", cat: "mate", once: "lg5_roommate", art: "ec_night", when: { minSeason: 1 },
      title: "客场同房的学问", body: "客场统一双人间，这次和你同房的是队里最闷的后腰。熄灯前他刷着手机不说话，你刷着手机不说话，房间里只有两部手机的电流声。关系学第一课：和一个陌生人共处十小时。",
      options: [
        { text: "主动开个话头聊球之外的事", response: "你们从「小时候看的第一场球」聊到凌晨一点。他居然是钓鱼高手，你居然会弹吉他。此后每次客场分房，队务都自动把你俩排一起——你们成了「官方室友」。",
          fx: { chemistry: 6, morale: 3 } },
        { text: "各睡各的，尊重边界", response: "你戴上耳塞睡觉，他戴上耳机打游戏。第二天他忽然说：「谢谢你没非要聊天，比赛前我需要静。」原来边界感也是一种体贴——不是所有同房都得成为朋友。",
          fx: { discipline: 4, chemistry: 2 } },
      ] },
    { id: "lg5_gk_shadow", stage: "post", tier: "L1", cat: "mate", once: "lg5_gk_shadow", art: "ec_rehab", when: { minSeason: 2 },
      title: "门将的至暗一周", body: "主力门将连续两场低级失误，社交媒体上被做成了鬼畜合集。训练里他扑救正常，但眼神躲着所有人。他是你加练的搭档，你知道那层「没事」的壳，一碰就碎。",
      options: [
        { text: "拉他加练，只用行动说话", response: "你们每天加练一小时传接，一周里一句心理疏导都没有。周末他完成九次扑救零封，终场哨响时他冲过来抱住你——有些支撑不需要语言，需要的是「我一直在」。",
          fx: { chemistry: 7, morale: 3 } },
        { text: "直接把他的鬼畜视频全看一遍", response: "你约他吃饭，当面把鬼畜合集从头放到尾，然后说：「看，我最烂的失误比你多三个，我还活着。」他愣了三秒笑出声——直面伤疤，是兄弟间最狠的解药。",
          fx: { chemistry: 6, confidence: 3 } },
      ] },
    { id: "lg5_number_give", stage: "post", tier: "L1", cat: "mate", once: "lg5_number_give", art: "ec_tribute", when: { minSeason: 3 },
      title: "九号的重量", body: "功勋老前锋退役了，留下的九号球衣悬在更衣室。管理层问你的意见——你现在的号码是二十七号，但所有人都默认「九号该是你的」。老将临走前托人带话：「别有包袱，号码要配得上，不是要得来。」",
      options: [
        { text: "接过九号，扛起重量", response: "换号发布会那天你说：「九号不是继承，是重新开始。」赛季你顶着「配不上」的质疑轰出生涯最佳数据——号码的重量，最后都变成了你的肌肉。",
          fx: { confidence: 6, fan_love: 4, commercial_value: 3 } },
        { text: "婉拒：二十七号是我的故事", response: "「二十七号陪我进的第一个球，我想穿着它拿冠军。」老将听到后笑了：「这才是踢球的。」你的二十七号后来成了球队商店卖得最好的号码——故事比数字值钱。",
          fx: { confidence: 4, fan_love: 5, discipline: 3 } },
      ] },

    // ── 教练线 ──
    { id: "lg5_board_game", stage: "post", tier: "L2", cat: "coach", once: "lg5_board_game", art: "ec_training", when: { minSeason: 1 },
      title: "教练的战术桌游", body: "教练自制了一套战术桌游：磁贴球场、可移动棋子、事件卡（红牌/雨战/体能崩盘）。规则只有一个——把你这周的战术困境摆上桌，全队轮流出招。第一晚，后卫线输给了厨师的餐车。",
      options: [
        { text: "认真研究每套卡组", response: "三周后你在真实比赛里预判了对手的每一次换人——那张「对手换高中锋」的桌游事件卡，你早就推演过五遍。玩得最认真的人，成了场上最淡定的人。",
          fx: { coach_trust: 5, discipline: 4 } },
        { text: "提议加入「球员自由卡」", response: "你设计了一套自由发挥卡：允许棋子脱离战术板即兴跑位。教练看完拍板加入——三个月后那套「自由卡」演变成了球队标志性的肋部渗透，版权页写着全队的名字。",
          fx: { chemistry: 5, confidence: 4 } },
      ] },
    { id: "lg5_team_vote", stage: "post", tier: "L1", cat: "coach", once: "lg5_team_vote", art: "ec_locker", when: { minSeason: 2 },
      title: "队内的民主实验", body: "教练做了个大胆决定：点球手和场上指挥由全队投票产生，票数公开。你的名字在两张选票上都排第二——票差只差两票。投票结果揭晓前的更衣室，比决赛夜还安静。",
      options: [
        { text: "接受票选结果，全力支持当选者", response: "你带头鼓掌，当天就把加练对象换成了当选的点球手的「喂饼路线」。一个月后他主动找教练：「关键球让我罚，但他制造的点球最多。」民主的真正产出，是彼此成全。",
          fx: { chemistry: 6, coach_trust: 4 } },
        { text: "下次投票，用表现拉票", response: "你把票差当成燃料：连续一个月的高强度输出后，第二次临时点球权落到了你头上——教练没再投票：「这次不用投了，数据替你们投了。」",
          fx: { confidence: 5, coach_trust: 4, discipline: 3 } },
      ] },
    { id: "lg5_press_rotation", stage: "post", tier: "L2", cat: "coach", once: "lg5_press_rotation", art: "ec_press", when: { minSeason: 2 },
      title: "发布会轮值制", body: "教练推行「发布会轮值」：每场赛后由一名球员出席，轮流直面媒体。轮到你的那周，正好是输球后——你将独自面对话筒阵，替全队回答那个最难的问题：「为什么会输？」",
      options: [
        { text: "坦诚担责，不甩锅", response: "「上半场我们犯了错，我犯了其中一个。下一场改。」十分钟的提问被你这十二个字钉住了。第二天报纸标题：《一个男人的发布会》——轮值表上，你被标成了「常驻嘉宾」。",
          fx: { media_relation: 5, coach_trust: 5 } },
        { text: "用战术解读化解尖锐提问", response: "你把每个尖锐问题都拉回战术分析，滴水不漏。记者们写着「这位球员说话滴水不漏」，教练评价「专业得像教练组成员」——但你也发现，没人再问你「你昨晚几点睡的」这种有人味的问题了。",
          fx: { media_relation: 4, discipline: 4 } },
      ] },
    { id: "lg5_mentor_watch", stage: "post", tier: "L2", cat: "coach", once: "lg5_mentor_watch", art: "ec_tribute", when: { minSeason: 2 },
      title: "青训恩师来了看台", body: "你的青训教练——那个在你十二岁时每天陪练到天黑的老头——买了一张普通球票坐在客队看台。赛前他没找你，只托队务带了一张纸条：「第 63 分钟，看教练席左侧广告牌。」",
      options: [
        { text: "63 分钟进球后飞奔致意", response: "第 63 分钟，你真的转头望向教练席左侧的广告牌——老头就站在客队看台的人堆里，挥着那条围巾——那是你十二岁时他送你的同款。这个画面上了当晚热搜：「一个球员和他的启蒙教练，隔着十五年。」",
          fx: { fan_love: 6, morale: 5 } },
        { text: "赛后请他进入更衣室", response: "你把他请进更衣室介绍给全队：「没有他就没有我今天的一切。」老头挨个和年轻球员握手，顺手指出你助跑的一个小毛病——十五年过去，他看你的眼神还是教练看弟子。",
          fx: { chemistry: 4, confidence: 4, fan_love: 3 } },
      ] },

    // ── 裁判与争议 ──
    { id: "lg5_captain_talk", stage: "post", tier: "L2", cat: "ref", once: "lg5_captain_talk", art: "ec_stadium", when: { minSeason: 2 },
      title: "只有队长能说话", body: "新赛季裁判新规：只有队长有权和裁判沟通，其他球员围拢一律黄牌警告。教练看着你：「今天你戴袖标——这份和裁判说话的权利，得会用。」对手显然还没适应新规，率先围拢吃了一黄。",
      options: [
        { text: "礼貌沟通，做规则的受益者", response: "每次争议判罚你都单独走向裁判，语气平静、观点清晰。半场后裁判开始主动向你解释判罚依据——规则给了话语权，礼貌让它生效。",
          fx: { coach_trust: 5, discipline: 4 } },
        { text: "少说多做，把争议留在场上", response: "你只在必要时行使权利，其余时间专注比赛。对手队长整场在和裁判纠缠，你在沉默里进了制胜球——有些沟通权，最好的行使方式是别用。",
          fx: { confidence: 4, discipline: 3 } },
      ] },
    { id: "lg5_armpit_offside", stage: "post", tier: "L1", cat: "ref", once: "lg5_armpit_offside", art: "ec_goal_line", when: { minSeason: 2 },
      title: "腋下越位之夜", body: "你的进球被划掉，理由是慢镜头里你的腋窝超出了最后一名后卫的腋窝。全网都在玩「腋毛越位」的梗，你在热搜挂了两天。媒体采访你：「你觉得规则需要改吗？」",
      options: [
        { text: "幽默回应，玩梗自救", response: "你发了一张自己的腋窝特写配文：「下赛季练小了点。」这条动态成了当周体育区顶流——当你对荒诞幽默时，荒诞就伤不到你。",
          fx: { fan_love: 6, media_relation: 4 } },
        { text: "严肃回应：支持技术也要保护进球", response: "你认真谈了「进攻有利原则与技术判罚的平衡」，被联赛官方转引。半年后越位判定细则微调，评论员说：「这条修改里，有那晚的腋窝。」",
          fx: { media_relation: 5, fan_love: 3 } },
      ] },
    { id: "lg5_peacemaker", stage: "post", tier: "L1", cat: "ref", once: "lg5_peacemaker", art: "ec_rival", when: { minSeason: 2 },
      title: "大规模冲突前的十秒", body: "队友被恶意犯规放倒，两队二十多人瞬间围成一团，推搡开始升级。裁判被挤在人墙外。你看见对方的年轻球员被人潮推着往前——他眼睛里是恐惧，不是愤怒。",
      options: [
        { text: "第一时间把队友拉出人堆", response: "你死死抱住自己的队友退出来，又顺势把那个吓傻的对方小将拉到身后。冲突降温了，裁判只出示了两张黄牌。赛后裁判专门找你握手：「今天多亏你，两队都欠你一次。」",
          fx: { coach_trust: 5, discipline: 4, fan_love: 3 } },
        { text: "站在己方人墙最前，气势不能输", response: "你站在最前面寸步不退，直到裁判恢复秩序。全队赛后击掌：「今天这口气没输！」但那张赛后追罚的传票也到了——气势值三分，罚款四千块。",
          fx: { chemistry: 5, confidence: 3, money: -4000 } },
      ] },

    // ── 球迷与城市 ──
    { id: "lg5_grandpa_90", stage: "post", tier: "L2", cat: "fan", once: "lg5_grandpa_90", art: "ec_fan", when: {played: true,  minSeason: 1 },
      title: "九十岁的季票球迷", body: "南看台有位九十岁的老爷子，持有本队季票六十二年。这个生日周他照常到场，家里人推着轮椅，他挥着围巾。广播里念了他的名字，全场起立鼓掌——他颤巍巍站起来，站直了。",
      options: [
        { text: "赛前把围巾亲手戴到他脖子上", response: "你单膝蹲在轮椅前给他围好围巾，他拍着你的手背说了句「小伙子，替我多跑跑」。那场比赛你跑出了赛季最高冲刺距离——九十岁的人看台看着，你不敢慢。",
          fx: { fan_love: 6, morale: 4 } },
        { text: "进球后展示他的生日横幅", response: "你进球后从角旗区举起球迷准备的贺卡：「九十岁生日快乐」。转播镜头拍到他抹眼泪——进球有很多种意义，那晚的意义叫做「被一个六十二年的约定看见」。",
          fx: { fan_love: 5, fame: 100, morale: 4 } },
      ] },
    { id: "lg5_shirt_soldout", stage: "post", tier: "L2", cat: "fan", once: "lg5_shirt_soldout", art: "ec_city", when: { minSeason: 2 },
      title: "你的球衣卖断码了", body: "球队商店经理打来电话：你的球衣全线断码，补货排到三周后。俱乐部商店门口排起了队，黄牛把你的球衣炒到了原价三倍。你的第一个念头居然是：我妈那件是不是买贵了。",
      options: [
        { text: "协调俱乐部平价补货", response: "你推动俱乐部紧急加印并承诺「原价供应，限购两件」。黄牛傻眼了，球迷在商店门口拉横幅谢你——你护住的不是销量，是「喜欢一个球员不该那么贵」这件事。",
          fx: { fan_love: 6, commercial_value: 3 } },
        { text: "自掏腰包买一百件送青训队", response: "一百件球衣送进了青训营，孩子们穿着你的号码在雨天训练。照片传遍了全网——比任何广告都动人的，是一群「未来的你」穿着「现在的你」。",
          fx: { fan_love: 5, morale: 4, money: -25000 } },
      ] },

    // ── 状态波动 ──
    { id: "lg5_assist_greedy", stage: "post", tier: "L2", cat: "form", once: "lg5_assist_greedy", art: "ec_goal", when: { minSeason: 2, minApps: 15, posExclude: ["GK"] },
      title: "助攻上瘾症", body: "数据网站给你起了新外号：「助攻艺术家」。可教练在录像里指出了一个危险信号：三次明明可以自己射门的机会，你都为了「更漂亮的助攻」多传了一脚——结果被断。好看的数据，正在偷走你的进球。",
      options: [
        { text: "定规矩：禁区内独食优先", response: "你给自己立了铁律：进禁区就是射手，出禁区才是组织者。三条规则让你的进球数一个月涨了四个——艺术家学会了在最该自私的地方自私。",
          fx: { confidence: 5, coach_trust: 4 } },
        { text: "坚持自己的风格不变", response: "「团队足球没有独食。」你顶着质疑继续做饼，直到队友用三连帽子戏法替你正名——你们的连线成了联赛最难防的风景。风格没有错，错的是质疑。",
          fx: { chemistry: 6, confidence: 3 } },
      ] },
    { id: "lg5_perfect_ten", stage: "post", tier: "L1", cat: "form", once: "lg5_perfect_ten", art: "ec_trophy", when: { minSeason: 3, ratingMin: 9 },
      title: "满分之夜之后", body: "职业生涯第一个满分评分。手机从凌晨起就没停过：祝贺、专访邀约、商业合作、甚至梦工场的球探邮件。第二天训练，你发现自己的传接球开始「表演化」——满分是个危险的数字，它让人想做更满分的事。",
      options: [
        { text: "把满分评分截图设为「警示」", response: "你把那张 10 分截图存进了相册最深处，备注写着：「这是别人眼中的你，不是你该成为的样子。」第二周你踢得朴素却高效——满分之后的最好状态，是忘记满分。",
          fx: { discipline: 5, confidence: 4 } },
        { text: "乘着满分势头冲击纪录", response: "你带着史诗级自信连场爆发，五场八球刷新个人纪录。第九场你累垮了——满分像烟花，照亮了夜空，也照出了你还没建好的地基。这课学费不便宜。",
          fx: { confidence: 5, injury_risk: 3 } },
      ] },
  ];
})();
