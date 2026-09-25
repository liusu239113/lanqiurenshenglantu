/* ============================================================================
   事件卡池 · 比赛间隙抉择卡（美漫足球化 P2 首批）
   设计原则（对标《冠军之心：篮球生涯》）：
   · 每张卡 = 场景描写 + 二选一两难，没有明显正解
   · 卡文用占位符注入真实比赛数据：{player} {num} {opp} {score} {goals} {rating} {res} {round} {team}
   · effects 写真实数值：morale 士气 / fatigue 疲劳 / fame 名气 / money 现金
     / exp 经验池 / discipline 自律 / professionalism 职业素养 / physicalTalent 身体天赋
   · tier: L1 大事件(每半季≤4) / L2 小事件(每半季≤3) · once: 一次生涯唯一
   · art: assets/comic/ec_<art>.webp
   ============================================================================ */
(function () {
  const POST = [
    /* ── 更衣室 ── */
    { id: "post_locker_loss_001", tier: "L1", cat: "locker", art: "locker",
      when: { res: "loss", maxMargin: 2 },
      title: "差之毫厘",
      body: "回放看了一遍又一遍：总有那么一两个回合，换种处理就不一样。终场哨响，{score}。更衣室里没人说话，只有冰袋咔咔响的声音。",
      options: [
        { text: "拉队友加练最后一射", response: "晚上十点的训练基地，你们加练了两百脚射门。没人说话，但第二天全队的眼神都不一样了。", fx: { morale: 3, professionalism: 20 } },
        { text: "关掉手机睡一觉", response: "你只发了一条动态：明天继续。然后关机。热搜小爆了一下，主教练给你点了个赞。", fx: { morale: 4, discipline: 25 } },
      ] },
    { id: "post_locker_brace_001", tier: "L1", cat: "locker", art: "locker", once: "firstBrace",
      when: { goalsMin: 2 },
      title: "更衣室的朝拜",
      body: "{goals}球！终场哨响时你看了一眼技术统计——那个数字属于你。更衣室的电视在放你的集锦，循环播放。你 {score} 一人打崩了{opp}。",
      options: [
        { text: "安静收好比赛用球", response: "你没有发任何动态，只是把球签了名收好。多年后你可以告诉孩子：这是爸爸第一场真正的比赛。", fx: { morale: 5, professionalism: 30 } },
        { text: "趁热复盘为什么爆发", response: "你逐回合看了录像：不是超常发挥，是对位错配加战术红利。知道「为什么」比拿到「多少」更重要。", fx: { exp: 1200, fame: 60 } },
      ] },
    { id: "post_locker_draw_001", tier: "L2", cat: "locker", art: "locker",
      when: {played: true, assistsMin: 2,  res: "draw", minRound: 10 },
      title: "闷平之后",
      body: "被{opp}把大巴停到门线前的一个夜晚。看台上有人提前退场，也有人唱完了最后一首歌。",
      options: [
        { text: "公开揽下创造力的责任", response: "「创造机会是我的活，今天我没做到。」敢于认错的核心，更衣室最服气。", fx: { morale: 2, professionalism: 25 } },
        { text: "默默研究破密集防守", response: "你把对手的防守站位画进笔记，研究到凌晨。三周后再遇铁桶阵，你送出两次助攻。", fx: { exp: 800 } },
      ] },

    /* ── 发布会 ── */
    { id: "post_press_loss_001", tier: "L1", cat: "press", art: "press",
      when: { res: "loss", maxMargin: 1 },
      title: "发布会上的拷问",
      body: "「最后那个单刀为什么不进？」二十支话筒怼过来。你听见自己的心跳。这种时刻，说每个字都会被做成标题。",
      options: [
        { text: "「我的责任，下一场我会改」", response: "第二天体育版头条：《男人的担当》。主教练在办公室看了报纸，什么都没说，把你叫进了定位球战术组。", fx: { fame: 80, morale: 3 } },
        { text: "把问题抛回给战术", response: "「那是教练组的布置。」现场安静了两秒。你说的是事实，但更衣室的气氛微妙了起来。", fx: { fame: 120, morale: -3 } },
      ] },
    /* ★ P105-B4：发布会覆盖空隙补全（平局向 / 惨败向）——原 press 池只覆盖惜败与大胜 */
    { id: "post_press_draw_001", tier: "L1", cat: "press", art: "press",
      when: { res: "draw", minApps: 3 },
      title: "不咸不淡的平局之夜",
      body: "一个被大巴锁死的夜晚，连话筒都懒得举高。角落里有个记者还是开了口：「球队需要进球的时候，你在想什么？」",
      options: [
        { text: "「我在想怎么赢，不是怎么不输」", response: "这句话被印在了次日的双关标题里。教练组觉得你憋着一股劲——正是他们想要的劲。", fx: { fame: 60, morale: 2 } },
        { text: "「足球有时候就是这样」", response: "标准答案，标准报道，什么都没发生。老狐在电话里说：安全，但也仅此而已。", fx: { morale: 1 } },
      ] },
    { id: "post_press_heavy_001", tier: "L1", cat: "press", art: "press",
      when: { res: "loss", minMargin: 3 },
      title: "大比分之后的长枪短炮",
      body: "惨败之夜的混合采访区像一片雷区。摄影机红灯全亮着，等你走过。有人喊：「你们更衣室是不是已经散了？」",
      options: [
        { text: "停下脚步，正面回应", response: "「散没散，下周一场上见。」十秒的回答上了热搜。有人骂你嘴硬，但队友在群里发了一排鼓掌。", fx: { fame: 100, morale: 3 } },
        { text: "低头快走，不接一个字", response: "沉默被解读了一整晚。第二天训练场上的加练，比任何回应都响。", fx: { exp: 600, professionalism: 15 } },
      ] },
    { id: "post_press_win_001", tier: "L2", cat: "press", art: "press",
      when: { res: "win", goalsMin: 1, ratingMin: 7.5 },
      title: "话筒围上来的夜晚",
      body: "{goals}球，评分{rating}。混合采访区的记者差点把话筒戳到你脸上——「现在的你配得上{team}的主力吗？」",
      options: [
        { text: "「主力与否教练说了算」", response: "你的谦逊上了本地新闻。教练组私下说：这孩子懂事。下周的首发名单里果然有你的名字。", fx: { morale: 4 } },
        { text: "「我只想赢下每一场」", response: "这句话成了你的个人标签。极端球迷会专门为你做了TIFO，也有人等着看你被打脸。", fx: { fame: 100, morale: 2 } },
      ] },
    { id: "post_press_crown_001", tier: "L2", cat: "press", art: "press",
      when: { res: "win", minRound: 22 },
      title: "争冠期的措辞",
      body: "联赛还剩{round}轮往后的每一步都是通稿。赛后采访你的措辞越来越像老将：「我们还没赢下任何东西。」",
      options: [
        { text: "强调更衣室氛围", response: "「赢球的秘密在更衣室。」你把功劳分给每一个没上场的人。管理层注意到了你的领袖气质。", fx: { morale: 4, professionalism: 20 } },
        { text: "把压力留给自己", response: "「压力我来扛，队友只需要踢球。」这句话传到更衣室，全队当晚的团建火锅你请的客。", fx: { morale: 6, fame: 60 } },
      ] },

    /* ── 社媒 ── */
    { id: "post_social_clip_001", tier: "L1", cat: "social", art: "social", once: "mediaStorm",
      when: { ratingMin: 7.5, minRound: 6 },
      title: "十五秒的风暴",
      body: "你赛后的一句牢骚被剪成了十五秒短视频，标题是《他对球队不满实锤？》。三小时，两千万播放。真相不重要了。",
      options: [
        { text: "开直播澄清", response: "你完整讲清了来龙去脉，两小时直播比十五秒剪辑有力一百倍。风暴平息，人设立住。", fx: { fame: 150, morale: 2 } },
        { text: "用下一场表现回应", response: "你什么都没说。三天后你轰出赛季最佳一战，对着镜头做了个「嘘」的手势。这比任何澄清都帅。", fx: { fame: 220, morale: 3 } },
      ] },
    { id: "post_social_goal_001", tier: "L2", cat: "social", art: "social",
      when: { goalsMin: 2 },
      title: "剪辑师最爱你",
      body: "你的{goals}球被做成了鬼畜视频和慢镜混剪。一条「{num}号未来可期」的热评点赞破了十万。",
      options: [
        { text: "转发最欢乐的一条", response: "你和JR玩到了一起。评论区画风从此跑偏，但粉丝数实打实涨了三万。", fx: { fame: 120, morale: 3 } },
        { text: "专注球场不看手机", response: "你卸载了推送。巨星的标配不是粉丝，是屏蔽噪音的能力。第二天你照常最早到基地。", fx: { morale: 2, discipline: 30 } },
      ] },
    { id: "post_social_loss_001", tier: "L2", cat: "social", art: "social",
      when: { res: "loss" },
      title: "凌晨三点的评论区",
      body: "输球夜你失眠了。躺床上刷手机到凌晨三点，每条热评都在骂你。你知道这种被全世界审判的感觉有保质期——前提是你得熬过去。",
      options: [
        { text: "卸载社媒一周", response: "你把手机调成了黑白模式。噪音没有了，世界安静得能听见自己的呼吸。", fx: { morale: 3, discipline: 25 } },
        { text: "把愤怒写进训练计划", response: "你把失眠的怒火全部写进了下一阶段的训练计划：三个弱项，两个新招。愤怒也是燃料。", fx: { exp: 1000 } },
      ] },

    /* ── 训练基地 ── */
    { id: "post_train_loss_001", tier: "L2", cat: "training", art: "training",
      when: { res: "loss" },
      title: "晨雾里的加练",
      body: "输球的第二天清晨，你比保安到得还早。晨雾里的训练场只有你和一颗球的声音。",
      options: [
        { text: "针对性补短板", response: "你把上一场丢球权的三个回合逐帧拆解，练到早餐车来为止。助教默默把你的训练报告标了星。", fx: { exp: 1100 } },
        { text: "纯粹地踢球找快乐", response: "你放起了音乐，随心所欲地颠球一小时。纯粹地踢球——你想起自己为什么热爱这项运动。", fx: { morale: 5 } },
      ] },
    { id: "post_train_new_001", tier: "L2", cat: "training", art: "training", once: "firstExtra",
      when: { maxRound: 12 },
      title: "加练到极限",
      body: "体能教练拦住你：「再练就要受伤了。」你的球衣能拧出水，但你知道自己的短板还差最后五十次重复。",
      options: [
        { text: "再练五十次", response: "第五十次终于成了肌肉记忆。风险与回报，在晨光里各占一半。", fx: { exp: 1600, professionalism: 20 } },
        { text: "听体能教练的话", response: "你信了科学。恢复室里你做了整套理疗，周末的你像换了个人。", fx: { morale: 2 } },
      ] },

    /* ── 球员通道（德比/杯赛） ── */
    { id: "post_tunnel_derby_001", tier: "L1", cat: "tunnel", art: "tunnel", once: "firstDerby",
      when: { derby: true },
      title: "德比的第一夜",
      body: "球员通道里能听见{opp}球迷的战歌。老队长拍拍你的肩：「德比不是比赛，是战争。今晚整座城市都看着你。」",
      options: [
        { text: "把紧张转化为怒吼", response: "出洞那一刻你怒吼出声。摄像机拍到了——第二天这个镜头成了德比海报的背景。", fx: { fame: 100, morale: 4 } },
        { text: "深呼吸，保持冰冷", response: "你全程面无表情。解说员说：这孩子的眼神像刺客。对手的中场整晚都在提防你。", fx: { morale: 2, discipline: 25 } },
      ] },
    { id: "post_tunnel_cup_001", tier: "L2", cat: "tunnel", art: "tunnel",
      when: { cup: true },
      title: "淘汰赛的窄门",
      body: "赢或回家的夜晚。通道墙上的破损海报还留着上一个英雄的名字——杯赛从不等待任何人。",
      options: [
        { text: "给全队打气", response: "你挨个和队友撞肩：「九十分钟，够我们写一个故事了。」那晚你们真做到了。", fx: { morale: 5 } },
        { text: "独自热身到发烫", response: "你把耳机音量调到最大，热身服湿透才罢休。开哨后你的第一次冲刺就撕开了防线。", fx: { exp: 900 } },
      ] },

    /* ── 看台 ── */
    { id: "post_tifo_faith_001", tier: "L2", cat: "tifo", art: "tifo",
      when: { minRound: 8 },
      title: "死忠区的新横幅",
      body: "北看台展开了一条新横幅，上面缝着你的{num}号。你朝那边鼓掌，他们回以一整面旗的海浪。",
      options: [
        { text: "赛后去北看台谢场", response: "十分钟的谢幕上了本地新闻：《他记得我们》。从这天起，北看台的战歌里有你的名字。", fx: { fame: 90, morale: 4 } },
        { text: "把这份重量带进下一场", response: "你没有停留，只是看了一眼就转身回更衣室。欠看台的，你打算用进球还。", fx: { morale: 3, exp: 600 } },
      ] },
    { id: "post_tifo_loss_001", tier: "L2", cat: "tifo", art: "tifo",
      when: { res: "loss", minRound: 6 },
      title: "输球夜的歌声",
      body: "终场哨响，比分{score}。你想低头快走，北看台却唱起了你的名字——比赢球的日子还要响。",
      options: [
        { text: "停下鞠躬致谢", response: "你站在风里对北看台深深鞠了一躬。第二天，这个画面在球迷论坛置顶了一周。", fx: { fame: 110, morale: 3 } },
        { text: "咬着牙快步离场", response: "你把眼泪憋了回去。更衣室里你第一个表态：「下一场，我去拼回这三分。」", fx: { morale: 2, professionalism: 20 } },
      ] },

    /* ── 雨战 ── */
    { id: "post_rain_win_001", tier: "L2", cat: "rain", art: "rain",
      when: { res: "win", ratingMin: 7.0 },
      title: "暴雨里的 Mint 时间",
      body: "大雨、长草、湿滑的皮球——这种夜晚技术失效，只剩下意志。你的拼抢让全场沸腾，{score}里有你的一份功劳。",
      options: [
        { text: "泡冰浴恢复", response: "你在冰桶里咬着毛巾泡了十五分钟。职业球员的身体是本钱，你开始学着省着花。", fx: { professionalism: 20 } },
        { text: "把这场写成日记", response: "你在笔记本上写下：「雨越大，心越要静。」这种夜晚的进球，观众一辈子忘不掉。", fx: { morale: 4, fame: 60 } },
      ] },
    { id: "post_rain_loss_001", tier: "L2", cat: "rain", art: "rain",
      when: { res: "loss", minRound: 4 },
      title: "雨停之后的更衣室",
      body: "雨战{score}。湿透的球衣挂在柜子里，滴了一夜的水。有人说雨天输球不算数，你知道积分榜不相信天气预报。",
      options: [
        { text: "带全队复盘雨战细节", response: "你把雨天站位的问题一条条列出来。教练看了你的笔记，把雨天战术页重写了一遍。", fx: { exp: 900, professionalism: 25 } },
        { text: "约队友吃饭散心", response: "你包场了火锅店。三盘毛肚下肚，更衣室的阴云散了一半。团队感情需要非正式场合。", fx: { morale: 5, money: -500 } },
      ] },

    /* ── 点球 ── */
    { id: "post_penalty_draw_001", tier: "L2", cat: "penalty", art: "penalty", once: "firstPen",
      when: { res: "draw", cup: true },
      title: "点球点的一夜长大",
      body: "十二码。全场的呼吸都压在你身上。你把球放好，后退四步——那一瞬间的寂静，会陪你一辈子。",
      options: [
        { text: "坚持主罚下一个", response: "「下一轮我还来。」敢于站在点球点的人，比进球的人更稀缺。教练记住了这句话。", fx: { morale: 5, fame: 80 } },
        { text: "让状态更好的队友来", response: "你把机会让了出去。这不是逃避，是判断。队友罚进后紧紧抱住了你——信任是相互的。", fx: { morale: 3, professionalism: 25 } },
      ] },
    { id: "post_penalty_practice_001", tier: "L2", cat: "penalty", art: "penalty",
      when: { res: "draw" },
      title: "散场后的点球点",
      body: "平局收场，看台空了大半。你一个人留下来，对着空门罚了一夜点球。保安大叔已经习惯了：「又是你啊。」",
      options: [
        { text: "练到命中率为止", response: "二十罚十八中。你把最后一个的录像存进手机，标题是：忘了这一夜，不可能。", fx: { exp: 1000 } },
        { text: "奖励自己一场放松", response: "你收起球，去吃了顿好的。有些夜晚需要记住，但不需要刻进骨头。", fx: { morale: 4 } },
      ] },

    /* ── 绝杀/里程碑 ── */
    { id: "post_goal_lastmin_001", tier: "L1", cat: "goal", art: "goal", once: "firstLastMin",
      when: { res: "win", goalsMin: 1, ratingMin: 7.5 },
      title: "绝杀之夜",
      body: "补时读秒阶段——皮球应声入网。你狂奔向角旗区，全队从身后把你扑倒。{score}，你是这座球馆今晚的神。",
      options: [
        { text: "对着镜头怒吼", response: "你的怒吼登上了五佳球封面。有人说狂，有人叫它巨星相——直到你一次次重演这一幕。", fx: { fame: 200, morale: 5 } },
        { text: "把球塞给看台上的孩子", response: "你把比赛用球送给了角落里一直为你加油的小球迷。多年后他带着这张照片进了你的球迷会。", fx: { fame: 140, morale: 4, professionalism: 15 } },
      ] },
    { id: "post_goal_milestone_001", tier: "L1", cat: "goal", art: "goal", once: "milestoneApps",
      when: { goalsMin: 1, minApps: 25, maxApps: 40 },
      title: "属于你的里程碑",
      body: "这一球，是你的第{goals}粒俱乐部进球——也是生涯一个新的刻度。广播里念着你的名字，全场起立。",
      options: [
        { text: "感谢所有帮过你的人", response: "达成那晚你列了一张感谢名单：青训教练、父母、还有当年没看走眼的球探。名单很长，梦想也很长。", fx: { fame: 150, morale: 4 } },
        { text: "达成后立刻定新目标", response: "里程碑只是路过。你在更衣室白板写下新数字。队友看到后摇头笑了：「这人没救了。」", fx: { exp: 1500, morale: 3 } },
      ] },

    /* ── 主场 ── */
    { id: "post_stadium_home_001", tier: "L2", cat: "stadium", art: "stadium",
      when: { minRound: 3, maxRound: 20 },
      title: "夜幕下的主场",
      body: "泛光灯亮起，草皮在夜色里绿得发亮。你从通道走出，抬头看了一眼满座的看台——这种画面，看多少次都不会腻。",
      options: [
        { text: "在场边多站一分钟", response: "你闭上眼听了一分钟人声。有些东西比胜负更值得记住——比如此刻你真的站在了职业赛场上。", fx: { morale: 4 } },
        { text: "用表现回报门票", response: "你深吸一口气走回更衣室。今晚的目标很简单：让买票进来的每一个人都觉得值。", fx: { exp: 700, professionalism: 20 } },
      ] },
  ];

  /* ── 赛前抉择卡（写模拟消费键 _ecSim，影响下一场模拟） ── */
  const PRE = [
    { id: "pre_illness", cat: "press", art: "press", seasonOnce: true,
      when: { minRound: 4 },
      title: "流感之夜",
      body: "赛前一天你开始低烧。队医把报告放在桌上：可以上场，但状态至少打八折。首发名单一小时后公布。",
      options: [
        { text: "打封闭也要上（状态↓ 意志↑）", response: "你对队医说：把药给我。教练握了握你的手什么也没说——但你看见他眼里有光。", fx: { morale: 4 }, sim: { illness: "play" } },
        { text: "服从队医轮休（心态平复）", response: "你把自己裹进被子里看完了全场直播。赢了你跟着喊，输了你骂了句球誉难保。职业素养 +1。", fx: { professionalism: 20 }, sim: { illness: "rest" } },
      ] },
    { id: "pre_press_tone", cat: "press", art: "press",
      when: { minRound: 6 },
      title: "发布会前的定调",
      body: "新闻官递来提词卡：「赛前发布会，你想用什么调子？对面{opp}的主教练刚放了话，说你们「技术粗糙」。",
      options: [
        { text: "硬刚回去（话题度↑ 对手警觉）", response: "「场上见真章。」这句话登上了头条，对手把你的照片贴进了更衣室——他们记住你了。", fx: { fame: 120 }, sim: { press: "fire" } },
        { text: "示弱藏锋（心态沉稳）", response: "「他们说得对，我们还要学习。」你把锋芒收进鞘里。全队的心态出奇地平静。", fx: { morale: 3 }, sim: { press: "calm" } },
      ] },
    { id: "pre_rotation", cat: "training", art: "training",
      when: { minRound: 9 },
      title: "密集赛程的取舍",
      body: "一周双赛，教练组征询你的意见：全力拼每一场，还是这场蓄力下一场？你的名字在两份首发名单上摇摆。",
      options: [
        { text: "场场全力（体能↓ 表现↑）", response: "「我来踢球不是为了蓄力。」你把连续两场首发钉死在了名单上。", fx: { morale: 3 }, sim: { rotation: "push" } },
        { text: "科学轮换（保存体能）", response: "你和教练组制定了负荷计划：重要场次全力，次要场次蓄电。寿星公式，稳字当头。", fx: { professionalism: 15 }, sim: { rotation: "save" } },
      ] },
    { id: "pre_derby_fire", cat: "tunnel", art: "tunnel", seasonOnce: true,
      when: { derby: true },
      title: "德比战前的动员",
      body: "队长把全队叫到了一起：「德比前夜，说点什么吧，新来的。」所有人的目光落在你身上——你甚至还不是绝对主力。",
      options: [
        { text: "点火：「让他们闭嘴」（气势↑）", response: "更衣室炸了。你听见有人把柜子拍得震天响。那一刻，这支球队是你的。", fx: { morale: 5, fame: 60 }, sim: { derby: "fire" } },
        { text: "冷静：「我们按训练踢」（稳）", response: "你只说了一句：「把平时练的踢出来，就够了。」老队长看了你一眼，点了点头。", fx: { morale: 3, discipline: 20 }, sim: { derby: "calm" } },
      ] },
  ];

  /* ── A 组：赛前卡（状态/心态/舆论）新增 8 张 ── */
  PRE.push(
    { id: "pre_fitness_doubt", cat: "training", art: "training",
      when: { minRound: 8 },
      title: "赛前体检的红灯",
      body: "体能报告上你的肌肉疲劳指数偏高。教练把你单独留下：「今晚要不要首发，你自己说。」这是信任，也是考验。",
      options: [
        { text: "请战：我能踢满全场", response: "你选择了首发。第 70 分钟腿开始发沉，但你咬着牙没举手——教练赛后只说了一个字：硬。", fx: { morale: 4 }, sim: { illness: "play" } },
        { text: "如实报告，坐一场", response: "你把真实数据给了教练组。替补席上你第一次完整看懂了这支球队的进攻套路。", fx: { professionalism: 20 }, sim: { rotation: "save" } },
      ] },
    { id: "pre_opponent_scout", cat: "press", art: "press",
      when: { minRound: 5 },
      title: "球探报告与你的选择",
      body: "视频分析课刚结束。报告最后一页写着{opp}左后卫的致命弱点：回追速度。你盯着这一行看了很久。",
      options: [
        { text: "通宵研究对手弱点", response: "你把对手近五场的左路防守剪成了合集。第二天训练赛，你三次从那条边路撕开防线。", fx: { exp: 900 } },
        { text: "按教练部署来", response: "你信战术板，也信队友。比赛里你严格执行换位指令——那场你虽然没进球，却赢得了教练的信任。", fx: { morale: 3, professionalism: 20 } },
      ] },
    { id: "pre_fan_letter", cat: "tifo", art: "tifo",
      when: { minRound: 7 },
      title: "通道口的信封",
      body: "进场前，一个小球迷塞给你一封信：「哥哥，我下周也要比赛了，你能给我签个名吗？」你抬头，看台第一排的他穿着你的{num}号。",
      options: [
        { text: "蹲下来认真签名", response: "你蹲下签了名，还写了句「别怕，我也紧张过」。这段视频被家长传到网上，转发过万。", fx: { fame: 90, morale: 4 } },
        { text: "先专注比赛，赛后再说", response: "你摸了摸他的头跑进通道，心里却一直惦记着那句「我也紧张过」。那晚你踢得像个孩子。", fx: { morale: 3, exp: 500 } },
      ] },
    { id: "pre_media_storm", cat: "social", art: "social", once: "preMediaStorm",
      when: { minRound: 12 },
      title: "开赛前的热搜",
      body: "出场名单公布前一小时，#他该不该首发# 冲上热搜。有人在夸你，也有人在翻你上一场的失误集锦。",
      options: [
        { text: "关掉手机专心热身", response: "你把手机锁进柜子。热身时你对着空门连轰十脚，最后一脚把网都掀了起来。", fx: { morale: 4, discipline: 20 } },
        { text: "顺势回应两句", response: "你发了一张训练照配文「球场见」。这条动态点赞三十万，也把你的压力推到了顶点。", fx: { fame: 120, morale: -2 }, sim: { press: "fire" } },
      ] },
    { id: "pre_captain_armband", cat: "locker", art: "locker", once: "captainOnce",
      when: { minRound: 18, minApps: 30 },
      title: "袖标递到你面前",
      body: "赛前更衣室，队长把自己的袖标摘下来递给你：「今晚你来。」全队安静了两秒，然后开始鼓掌。",
      options: [
        { text: "戴上，扛起来", response: "你戴上袖标的那一刻，感觉球衣重了三斤。那场你跑动距离全队第一，虽然腿抽筋到走路都疼。", fx: { morale: 6, fame: 80 } },
        { text: "推给更老的老将", response: "你把袖标转给了那位效力十年的老将。全场球迷起立——有些尊重，比分牌给不了。", fx: { morale: 4, professionalism: 30 } },
      ] },
    { id: "pre_weather_bad", cat: "rain", art: "rain",
      when: { minRound: 6 },
      title: "天气预报说有暴雨",
      body: "教练组讨论要不要改打地面渗透。雨战里长传冲吊更稳，但你的脚下技术会被积水吃掉。你被问了意见。",
      options: [
        { text: "建议打简单直接", response: "你的建议被采纳。雨夜里两次长传反击奏效，解说员说这孩子球商高。", fx: { morale: 3, exp: 600 } },
        { text: "坚持地面配合", response: "你坚持短传渗透。前二十分钟失误两次，但你的一次直塞撕开了整条防线。", fx: { exp: 800, fame: 50 } },
      ] },
    { id: "pre_agent_call", cat: "transfer", art: "transfer", seasonOnce: true,
      when: { minRound: 20 },
      title: "经纪人赛前的电话",
      body: "「有家俱乐部准备赛季末正式报价，前提是你接下来几场别掉链子。」电话挂断，你看着首发名单，手心有点汗。",
      options: [
        { text: "把压力变成动力", response: "这几场你像换了个人。数据不会说谎，你的身价曲线开始上扬。", fx: { morale: 4, fame: 100 } },
        { text: "先不想这些", response: "你把转会的事推给经纪人：「踢好球，其他你来。」专心的人运气都不会太差。", fx: { morale: 3, professionalism: 20 } },
      ] },
    { id: "pre_youth_visit", cat: "stadium", art: "stadium",
      when: { minRound: 10 },
      title: "青训队的小观众",
      body: "赛前一小时，青训队二十个孩子被带来看你热身。教练说：「给他们讲两句？」你想起了十年前的自己。",
      options: [
        { text: "讲讲野球场的故事", response: "你讲了自己在泥地上练球的日子。有个孩子举手说：我也要像你一样。那晚你为他们进了一球。", fx: { morale: 5, fame: 60 } },
        { text: "带他们练一组动作", response: "你带着孩子们练了半小时球感。教练在旁边笑：「你以后可以当青训教练。」", fx: { morale: 3, professionalism: 25 } },
      ] },
  );

  /* ── C 组：转会窗卡（夏窗/冬窗）12 张 = 迁移 2 + 新增 10 ── */
  const TRANSFER = [
    { id: "post_transfer_rumor_001", tier: "L1", cat: "transfer", art: "transfer",
      when: { minRound: 14, maxRound: 32 },
      title: "流言中的自己",
      body: "经纪人深夜来电：「有家俱乐部在打听你，{team}高层已经知道了。」打开手机，全是你穿别人球衣的P图。",
      options: [
        { text: "「我只专注当下」", response: "你对着镜头说了这六个字，然后继续用表现说话。流言止于数据。", fx: { morale: 3, professionalism: 25 } },
        { text: "让子弹再飞一会", response: "你不澄清也不否认，让热度抬一抬身价。总经理的来电很快到了——语气不太友善。", fx: { fame: 130, morale: -2 } },
      ] },
    { id: "post_transfer_mate_001", tier: "L2", cat: "transfer", art: "transfer", once: "mateSold",
      when: { minRound: 16 },
      title: "储物柜一夜清空",
      body: "你最好的朋友被卖去了海外联赛。他的柜子里只剩一枚护腕，和一张你们青训时期的合影。",
      options: [
        { text: "收下护腕接过责任", response: "你把护腕收好：「哥，你的那份我来打。」当晚你把所有情绪都灌进了加练场。", fx: { morale: 4, exp: 800 } },
        { text: "约教练谈心腹之患", response: "你找总经理聊了阵容稳定的重要性。他被你的真诚打动，承诺引援会听更衣室的声音。", fx: { morale: 2, professionalism: 30 } },
      ] },
    { id: "tr_big_offer", tier: "L1", cat: "transfer", art: "transfer", seasonOnce: true,
      when: { minSeason: 2 },
      title: "豪门的试探",
      body: "经纪人把一份报价截图发来——周薪是你现在的三倍。他没有评价，只是说：「你想清楚，这是你应得的。」",
      options: [
        { text: "先看竞技层面", response: "你问的不是钱，是出场时间。经纪人愣了一下，然后说：你比我想的成熟。", fx: { professionalism: 30, morale: 3 } },
        { text: "让经纪人去谈条件", response: "你把谈判交给专业的人。三天后合同里的解约金条款被砍掉了一半——这才是真金白银。", fx: { fame: 120, money: 0 } },
      ] },
    { id: "tr_renew_talk", tier: "L2", cat: "transfer", art: "transfer",
      when: { minSeason: 1 },
      title: "续约谈判桌",
      body: "俱乐部递来续约合同，年限三年，周薪涨幅不大。总经理说：「我们是看着你长大的。」你看着数字。",
      options: [
        { text: "签字，先还这份情", response: "你签了字。更衣室里老队员拍拍你：知道感恩的人，运气不会差。球迷论坛一片叫好。", fx: { morale: 5, professionalism: 20 } },
        { text: "再等等更好的报价", response: "你把合同压在经纪人那里。一周后确实来了更高的报价，但总经理看你的眼神变了。", fx: { fame: 80, morale: -3 } },
      ] },
    { id: "tr_loan_choice", tier: "L2", cat: "transfer", art: "transfer",
      when: { minSeason: 1, maxApps: 60 },
      title: "租借邀约",
      body: "一支中游球队开出租借邀约：保证主力位置，但你要离开熟悉的更衣室。留下来是替补，走出去是未知。",
      options: [
        { text: "出去踢主力", response: "你在新球队场场首发。虽然城市陌生，但每一脚触球都在提醒你：这才是我要的。", fx: { exp: 1200, morale: 4 } },
        { text: "留在豪门等待机会", response: "你选择留下。每天和顶级队友对抗，你的训练数据悄悄涨了——机会来时你得接得住。", fx: { exp: 600, professionalism: 25 } },
      ] },
    { id: "tr_release_clause", tier: "L1", cat: "transfer", art: "transfer", once: "clauseOnce",
      when: { minSeason: 3 },
      title: "解约金条款",
      body: "合同里那条解约金，如今只有你身价的一半。经纪人说：「只要你想走，明天就能走。」你第一次真正掌握命运。",
      options: [
        { text: "激活条款主动求变", response: "你激活了解约金。球迷烧了你的球衣，也在机场送了你最后一程。职业足球从不温柔。", fx: { fame: 200, morale: -5 } },
        { text: "不动它，用表现重谈", response: "你没动那条条款，而是用半个赛季的表现换来了新合同。忠诚被写进了通稿里。", fx: { morale: 6, professionalism: 30 } },
      ] },
    { id: "tr_rival_interest", tier: "L2", cat: "transfer", art: "transfer",
      when: { minSeason: 2 },
      title: "死敌的兴趣",
      body: "联赛直接竞争对手私下接触了你。若真去了，北看台会烧你的球衣；可那是争冠级别的阵容。",
      options: [
        { text: "拒绝，不给自己留骂名", response: "你明确拒绝了。消息传出，北看台当晚挂出你的巨幅画像——有些东西比冠军更值钱。", fx: { fame: 150, morale: 5 } },
        { text: "听听他们的计划", response: "你听完了他们的规划。竞技层面确实诱人，但你走出会议室时，手心全是汗。", fx: { fame: 100, morale: -2 } },
      ] },
    { id: "tr_family_say", tier: "L2", cat: "transfer", art: "transfer",
      when: { minSeason: 2 },
      title: "家里的电话",
      body: "父亲在电话那头说：「外面钱多，但也冷。你自己拿主意。」你想起小时候他骑车载你去训练场的路。",
      options: [
        { text: "听家里的，稳一点", response: "你选择留下。父亲在看台上第一次哭了，虽然他嘴上说「风吹的」。", fx: { morale: 5 } },
        { text: "去更大的舞台", response: "你告诉父亲：我想看看自己究竟能到哪一步。他沉默了三秒，说：那就去吧。", fx: { morale: 3, fame: 100 } },
      ] },
    { id: "tr_abroad_offer", tier: "L1", cat: "transfer", art: "transfer", once: "abroadOnce",
      when: { minSeason: 3 },
      title: "海外邀约",
      body: "一封外语邮件躺在收件箱：五大联赛的球队希望你过去试训两周。语言、食物、气候，全是未知数。",
      options: [
        { text: "去试，哪怕失败", response: "两周试训你拼命到呕吐。回国那天教练组给了你一份新计划——他们看到了你的变化。", fx: { exp: 1500, fame: 150 } },
        { text: "在国内再打一年", response: "你决定把数据再堆一年。第二年你的报价翻了一倍——耐心也是一种天赋。", fx: { exp: 700, professionalism: 20 } },
      ] },
    { id: "tr_deadline_day", tier: "L1", cat: "transfer", art: "transfer", seasonOnce: true,
      when: { minSeason: 1 },
      title: "关窗日最后一小时",
      body: "转会窗今晚 24 点关闭。经纪人的电话一直在响，你的名字被反复提起。决定只有一次机会。",
      options: [
        { text: "压哨签约", response: "你在截止前十七分钟签了字。第二天头条：《最后时刻的决定》。此后你必须用表现证明它。", fx: { fame: 180, morale: 3 } },
        { text: "关窗也不走", response: "你关掉手机睡了一觉。第二天训练场，队友什么都没问，只是把球传给了你。", fx: { morale: 6, professionalism: 25 } },
      ] },
    { id: "tr_position_rival", tier: "L2", cat: "transfer", art: "transfer",
      when: { minSeason: 2 },
      title: "同位置的引援",
      body: "俱乐部签下了和你同位置的球员，转会费是你的两倍。训练场上，你们第一次站在同一条边。",
      options: [
        { text: "把他当竞争对手", response: "你每天比他多练半小时。一个月后，教练的首发名单上还是你的名字。", fx: { exp: 1000, morale: 3 } },
        { text: "向他学，组双核", response: "你主动找他研究配合。半个赛季后，你们成了联赛最有默契的搭档之一。", fx: { morale: 4, professionalism: 25 } },
      ] },
    { id: "tr_old_club_return", tier: "L2", cat: "transfer", art: "transfer", once: "returnOnce",
      when: { minSeason: 4 },
      title: "老东家的回购条款",
      body: "当年签的回购条款被激活了。那座城市、那片看台、那个把你从青训营提拔上来的老教练——都在等你回去。",
      options: [
        { text: "回去，把故事写完整", response: "你回到了梦开始的地方。球迷举着十年前的照片来接机——有些人，从未离开。", fx: { morale: 6, fame: 120 } },
        { text: "留下，继续往前走", response: "你谢绝了回购。老教练在电话里笑了：「去吧，别回头。」", fx: { professionalism: 25, fame: 60 } },
      ] },
  ];

  /* ── D 组：赛季末卡（奖项/升降级之夜）6 张 ── */
  const SEASON_END = [
    { id: "se_best_eleven", tier: "L1", cat: "award", art: "awards",
      when: { minSeason: 2 },
      title: "赛季最佳阵容候选",
      body: "联赛官方公布最佳阵容候选名单，你的名字在列。投票截止前，有记者问你：觉得谁该入选？",
      options: [
        { text: "推荐队友", response: "你报出了队友的名字。第二天更衣室里，他把自己的护腿板送给了你。", fx: { morale: 6, professionalism: 25 } },
        { text: "表达对自己的信心", response: "「我觉得我配得上。」这句话被剪成短视频，有人说狂，有人说这才是巨星相。", fx: { fame: 150, morale: 3 } },
      ] },
    { id: "se_golden_boot", tier: "L1", cat: "award", art: "awards",
      when: { minSeason: 2 },
      title: "金靴之争的最后一轮",
      body: "你还差一球就能追上射手榜第一。最后一轮，队友在中场拿球——是传给你，还是自己突破？",
      options: [
        { text: "举手要球", response: "队友把球给了你。你打进了那一球，然后在采访里说：这个奖有一半是他的。", fx: { fame: 180, morale: 5 } },
        { text: "摆手让他自己来", response: "你摆了摆手。队友打进后跑向你庆祝——更衣室里没有人记得射手榜第二名是谁。", fx: { morale: 6, professionalism: 30 } },
      ] },
    { id: "se_relegation_night", tier: "L1", cat: "stadium", art: "stadium",
      when: { minSeason: 2 },
      title: "降级之夜",
      body: "终场哨响，积分榜定格。看台没有提前离场，他们唱了整整二十分钟。队长哭了，你不知道该说什么。",
      options: [
        { text: "承诺留下来踢次级联赛", response: "你在混采区说出「下赛季我还在」。第二天，季票销量不降反升。", fx: { morale: 6, fame: 120 } },
        { text: "沉默，让表现说话", response: "你一个字没说，只是把球衣脱下来给了看台上的孩子。有些承诺不需要说出口。", fx: { morale: 4, professionalism: 25 } },
      ] },
    { id: "se_promotion_party", tier: "L1", cat: "tifo", art: "tifo",
      when: { minSeason: 2 },
      title: "冲超之夜",
      body: "全场四万人没有一个人坐下。有人哭了，有人把孩子举过头顶。你被队友抛起来，看见漫天的纸屑。",
      options: [
        { text: "和球迷一起疯", response: "你跳下看台和他们唱到凌晨。多年后你还会记得，那晚的啤酒是甜的。", fx: { morale: 7, fame: 150 } },
        { text: "悄悄离场给家人打电话", response: "你躲进通道给母亲打了电话。她说：我在电视里看见了。你哭了。", fx: { morale: 5, professionalism: 20 } },
      ] },
    { id: "se_mvp_vote", tier: "L2", cat: "award", art: "awards",
      when: { minSeason: 1 },
      title: "队内 MVP 投票",
      body: "队内赛季最佳投票，你和老队长票数接近。更衣室里有人开玩笑：「今年该换人了。」",
      options: [
        { text: "把票投给老队长", response: "你的票投给了他。他领奖时说：该轮到你了。第二年，你真的接过了这个奖。", fx: { morale: 6, professionalism: 25 } },
        { text: "坦然接受这份荣誉", response: "你上台领了奖，第一句话是：这是我接到过的第二重的奖杯——第一重是十号球衣。", fx: { fame: 120, morale: 4 } },
      ] },
    { id: "se_farewell", tier: "L2", cat: "locker", art: "locker",
      when: { minSeason: 3 },
      title: "老将的告别赛",
      body: "效力十年的老将今晚退役。赛前他把一双旧球鞋放进你的柜子：「该你了。」你抱着鞋站了很久。",
      options: [
        { text: "穿着他的鞋上场", response: "你穿着那双鞋踢满了全场。解说员说：传承这个词，今天有了画面。", fx: { morale: 7, fame: 150 } },
        { text: "收藏起来，另选一双", response: "你把鞋收进柜子深处，换上自己的战靴。有些重量，需要再过几年才扛得动。", fx: { morale: 4, professionalism: 20 } },
      ] },
  ];

  /* ── F 组：休赛期养成卡（青训投资界面联动）8 张 ── */
  const OFFSEASON = [
    { id: "off_invite_day", cat: "offseason", art: "stadium",
      when: { minSeason: 2 },
      title: "办赛那天的太阳",
      body: "第一届青少年邀请赛开赛。三十支县城小学的队伍挤在你捐的球场上，有人赤脚，有人穿的是你的旧球鞋。你在场边站了一整天。",
      options: [
        { text: "亲自给孩子们当裁判", response: "你吹了一整天哨，嗓子哑了。有个孩子问你：「哥哥，我以后能像你一样吗？」你说：能，但要每天练。", fx: { fame: 120, morale: 6 } },
        { text: "默默坐在看台看完", response: "你没出面，只是坐在最后一排。散场时有位教练认出了你，什么都没说，只是鞠了一躬。", fx: { fame: 60, professionalism: 20 } },
      ] },
    { id: "off_school_ground", cat: "offseason", art: "training",
      when: { minSeason: 2 },
      title: "足球学校的第一块草皮",
      body: "奠基仪式上，施工方递给你一把铁锹。荒地上插着一面旗，风很大。你知道这坑里埋的不是土，是十年后的某个人。",
      options: [
        { text: "亲手铲下第一锹", response: "你铲了第一锹土，照片上了本地新闻。多年后这所学校的第一位国脚，会在采访里提到这张照片。", fx: { fame: 150, morale: 5 } },
        { text: "把仪式交给老教练", response: "你把铁锹递给了当年带你的青训教练。他愣了一下，然后铲得比谁都用力。", fx: { morale: 6, professionalism: 25 } },
      ] },
    { id: "off_camp_sign", cat: "offseason", art: "training",
      when: { minSeason: 3 },
      title: "青训营的合作协议",
      body: "合作方把合同推到你面前：你出钱，他们出教练。条款里有一条——每年要有两个免费名额给山里的孩子。",
      options: [
        { text: "加上更多的免费名额", response: "你把免费名额从两个改成了十个。经纪人皱眉，但签字那刻你想起自己当年交不起的集训费。", fx: { fame: 180, morale: 6 } },
        { text: "按合同来，先把营办好", response: "你按原条款签了字，把省下的钱投进了训练设备。活下来，才能帮更多人。", fx: { professionalism: 25, money: -100000 } },
      ] },
    { id: "off_donate_pitch", cat: "offseason", art: "tifo",
      when: { minSeason: 1 },
      title: "希望小学的球场",
      body: "母校来信：操场还是煤灰地，孩子们摔一跤就是一片血。信的最后一行写着「不打扰你，只是想让你知道」。",
      options: [
        { text: "全额捐一块人工草皮", response: "新球场落成那天，孩子们在上面打滚。校长发来照片，你把手机壁纸换成了它。", fx: { fame: 200, morale: 7, money: -300000 } },
        { text: "捐球和装备，草皮缓一缓", response: "你先寄了两百个球和五十双鞋。有些帮助不宏大，但立刻能落地。", fx: { fame: 100, morale: 4, money: -80000 } },
      ] },
    { id: "off_scout_home", cat: "offseason", art: "press",
      when: { minSeason: 3 },
      title: "家乡球探网络",
      body: "你打算在老家布一张球探网。亲戚推荐的人情、专业球探的成本、还是两者都要？你只有一个休赛期的时间。",
      options: [
        { text: "请专业团队，按数据说话", response: "你砸钱请了专业团队。第一个赛季他们送来三个苗子，数据详实得像体检报告。", fx: { money: -600000, exp: 600 } },
        { text: "找熟人，先铺开再说", response: "你用了几个熟人。消息灵通但良莠不齐——有个孩子是真的，其他几个只是亲戚家的。", fx: { morale: 3, money: -150000 } },
      ] },
    { id: "off_trial_prospect", cat: "offseason", art: "goal",
      when: { minSeason: 3 },
      title: "苗子的试训日",
      body: "试训场上站着一个瘦得像竹竿的孩子，技术粗糙，但每一次丢球都拼命回追。教练们摇头，你却看了很久。",
      options: [
        { text: "留下他，赌那股狠劲", response: "你留下了那个瘦孩子。三年后他成了队里最能跑的那个——狠劲是练不出来的天赋。", fx: { morale: 6, exp: 800 } },
        { text: "按标准来，不破例", response: "你按标准淘汰了他。临走时他鞠了一躬说谢谢。你把他的名字记在了本子上。", fx: { professionalism: 25, morale: -2 } },
      ] },
    { id: "off_brand_deal", cat: "offseason", art: "social",
      when: { minSeason: 2 },
      title: "休赛期的代言",
      body: "品牌方开出七位数代言，要求你整个休赛期配合拍摄——但你已经答应了青训营的开营仪式，档期撞了。",
      options: [
        { text: "推掉代言去开营", response: "你推了七位数，站在了开营仪式的土台子上。第二年代言费翻了——他们说你「有故事」。", fx: { fame: 160, professionalism: 25 } },
        { text: "接下代言，青训改期", response: "你接了代言，把开营改到下个月。孩子们等了三十天，你寄去的球先到了。", fx: { money: 800000, morale: -3 } },
      ] },
    { id: "off_public_class", cat: "offseason", art: "tifo",
      when: { minSeason: 2 },
      title: "公益足球课堂",
      body: "电视台想做一期你的公益课堂。编导问：「要不要安排几个孩子现场被你感动哭？」你愣住了。",
      options: [
        { text: "拒绝摆拍，正常上课", response: "你坚持不摆拍。那期节目没有眼泪，但有个孩子课后说：原来职业球员是这么练的。", fx: { fame: 120, professionalism: 30 } },
        { text: "配合节目效果", response: "你配合了流程。节目播放量很高，弹幕里有人说假——你看了很难受。", fx: { fame: 200, morale: -4 } },
      ] },
  ];

  /* ── E 组：国家队比赛周卡 8 张 ── */
  const INTL_CARDS = [
    { id: "intl_first_callup", cat: "intl", art: "international", once: "firstCallup",
      when: { minApps: 10 },
      title: "第一次征召",
      body: "国家队传真到了俱乐部：你的名字出现在大名单上。总经理签字时说了一句：「去吧，这是球员能收到的最好的信。」",
      options: [
        { text: "连夜给父母打电话", response: "母亲在电话那头哭了，父亲抢过手机说：「替我们把国旗穿在身上。」", fx: { morale: 8, fame: 300 } },
        { text: "先谢教练和队友", response: "你在更衣室挨个道谢。老队长说：「从今天起，你代表的不止我们。」", fx: { morale: 6, professionalism: 30 } },
      ] },
    { id: "intl_shirt_number", cat: "intl", art: "international",
      when: { minSeason: 2 },
      title: "国家队的号码",
      body: "装备管理员拿着号码板问你：「想要几号？」10 号是核心的印记，9 号是前锋的勋章，也有你熟悉的{num}号。",
      options: [
        { text: "选 10 号，扛核心的重量", response: "你选了 10 号。看台上有人举着「新 10 号」的牌子——重量和荣耀是一枚硬币的两面。", fx: { fame: 200, morale: 5 } },
        { text: "沿用{num}号，不忘来路", response: "你说：「这个号码跟我从青年队走到今天。」装备管理员笑了：「好号码是自己踢出来的。」", fx: { morale: 6, professionalism: 20 } },
      ] },
    { id: "intl_overseas_adapt", cat: "intl", art: "international",
      when: { minSeason: 3 },
      title: "留洋球员的时差",
      body: "集结日报到，从海外回来的队友时差还没倒过来，训练里两次慢了半拍。有记者开始写「留洋球员状态成疑」。",
      options: [
        { text: "帮他向媒体挡话", response: "你在混采区替他解围：「他刚踢完欧战，这点时差算什么。」三天后他用进球回了所有质疑。", fx: { morale: 6, professionalism: 20 } },
        { text: "加练陪他找回节奏", response: "你每天留场陪他加练半小时。正式比赛那天，他助攻了你——时差这种事，兄弟一起扛。", fx: { morale: 5, exp: 600 } },
      ] },
    { id: "intl_squad_list", cat: "intl", art: "international",
      when: { minSeason: 2 },
      title: "23 人名单的悬念",
      body: "大赛前的名单公布夜。记者问主教练：「他进了吗？」主教练只回了三个字：「看状态。」而你知道，自己的状态在烫手。",
      options: [
        { text: "用最后一场热身赛锁死名额", response: "你轰进了两球。名单公布时你的名字排在锋线第一位——稳得没有悬念。", fx: { fame: 200, morale: 6 } },
        { text: "主动找教练谈话", response: "你敲开了教练办公室的门：「告诉我差在哪，我去补。」教练在名单备注栏里写下：态度满分。", fx: { morale: 5, professionalism: 25 } },
      ] },
    { id: "intl_penalty_taker", cat: "intl", art: "penalty",
      when: { minSeason: 2 },
      title: "点球手之争",
      body: "训练课的十二码轮换，教练让你们自己商量谁主罚。老将们互相谦让，所有目光慢慢转向了你。",
      options: [
        { text: "「我来」，只说两个字", response: "你接过球放在点球点上，一句话没多说。从这天起，国家队的十二码归你管。", fx: { fame: 150, morale: 5 } },
        { text: "推荐状态更好的队友", response: "你指了那位刚上演帽子戏法的队友。大赛前让对的人站在对的位置，这是队长的思维。", fx: { morale: 4, professionalism: 30 } },
      ] },
    { id: "intl_captain_deputy", cat: "intl", art: "international",
      when: { minSeason: 3 },
      title: "袖标的候补",
      body: "队长伤退，教练把你叫到房间：「这两天训练，你来带。」袖标就在桌上，但正式任命还没有。",
      options: [
        { text: "临时带队，全力以赴", response: "你带着全队跑战术、开小会。教练在观察报告里写：可托付。", fx: { morale: 6, professionalism: 25 } },
        { text: "推给资历更老的队友", response: "你把袖标递给了那位三十岁的中卫。他愣了一下，然后拍了拍你的肩：「会有这一天。」", fx: { morale: 5, professionalism: 25 } },
      ] },
    { id: "intl_focused_rival", cat: "intl", art: "international",
      when: { minSeason: 2 },
      title: "生死战的预热",
      body: "关键战的赛前发布会，对面主帅放话：「他们的前锋（看了你一眼）还需要证明自己。」第二天的头条全是这句话。",
      options: [
        { text: "「场上见」", response: "你只回了三个字，全网刷屏。对手更衣室把你的照片贴上了墙——正合你意。", fx: { fame: 180, morale: 4 } },
        { text: "保持沉默，赛前关机", response: "你没接受任何采访，赛前一晚十点准时熄灯。用表现回话，是前锋最体面的方式。", fx: { morale: 5, discipline: 25 } },
      ] },
    { id: "intl_naturalized_teammate", cat: "intl", art: "international",
      when: { minSeason: 2 },
      title: "归化队友的融入",
      body: "新归化的队友中文还不利索，训练里跑错了两次位。更衣室有人小声嘀咕，他一个人坐在角落系鞋带。",
      options: [
        { text: "主动坐过去聊战术", response: "你用最简单的词加比诺划帮他捋清跑位。第二天的合练，你们完成了两次漂亮的连线。", fx: { morale: 5, professionalism: 25 } },
        { text: "请全队吃火锅破冰", response: "你张罗了一桌火锅。他举着筷子说「谢谢」，从这顿饭起，更衣室少了一个角落，多了一个兄弟。", fx: { morale: 6, money: -20000 } },
      ] },
  ];

  const CAT_KICKER = {
    locker: "更衣室 · 赛后", press: "混合采访区 · 赛后", social: "深夜 · 社媒风暴",
    training: "训练基地 · 清晨", transfer: "转会窗 · 经纪人来电", tunnel: "球员通道 · 关键战",
    tifo: "北看台 · 死忠区", rain: "雨战 · 当夜", penalty: "十二码 · 心理战",
    goal: "终场哨响 · 当夜", stadium: "主场 · 夜场", award: "赛季末 · 颁奖典礼",
    intl: "国家队 · 比赛周", offseason: "休赛期 · 青训投资",
    // P56：G 组日常卡（非比赛日）
    dailyFan: "球迷 · 场外", dailyMedia: "媒体 · 场外", dailyTrain: "训练基地 · 日常",
    dailyCity: "城市 · 日常", dailyHome: "家 · 深夜", dailyRehab: "康复室 · 养伤期",
  };

  window.EVENT_CARDS = {
    // M2.5 六组时机：A 赛前 / B 赛后 / C 转会窗 / D 赛季末 / E 国家队周 / F 休赛期养成
    pre: PRE, post: POST, transfer: TRANSFER, seasonEnd: SEASON_END,
    intl: INTL_CARDS,        // E 组：国家队比赛周（M4 接线：isIntl 场次优先抽本组）
    offseason: OFFSEASON,   // F 组：M3 休赛期养成界面接线
    kicker: CAT_KICKER,
    ART_DIR: "assets/comic/ec_",
  };
})();
