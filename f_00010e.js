/* ============================================================================
   ★ P199 分享文案引擎（用户拍板「文学艺术般勾人 · 模仿真人写自己的游玩经历 ·
      不能频繁捏造数据 · 不同档/同档间文案有区别 · 多版本随机抽取」）
   ----------------------------------------------------------------------------
   设计：
   · **零捏造数字**：模板正文不含任何阿拉伯数字字面量，所有数字来自真实存档注入
     （age/seasons/apps/goals/assists/评分/国家队/奖杯计数/年份/传奇指数…）——
     门禁 _p199_share_copy.js 会抽正文里的每一段数字串与真实数据集对账。
   · **多版本随机抽取**：每一段（标题/开篇/生涯答卷引言/荣誉织入/叙事线/结语互动）
     都有 2-3 个文学变体；用**本地 mulberry32 PRNG**（绝不碰游戏 R 流——分享是纯
     UI 侧动作，不能扰动模拟随机序）。同档位不同抽取得不同成文；seed 可显式注入
     （ret.__copySeed）供探针确定性复现。
   · **28 荣誉文学变体库**：按真实奖杯名（含动态联赛名「XX联赛冠军」「晋级20XX世界杯」）
     正则匹配归一成 28 种，每种 2-3 条文学短句；只织入玩家**实际拿到**的荣誉，
     按稀有度取前若干条；青年荣誉读 `d.youth.trophies`（A4 单容器铁律）。
   · **档位基调 + 生涯叙事线**：结局档（king/hero/…/pro）定开篇；真实数据判定的
     「射手型/冠军型/助攻型/门将型/忠诚型/流浪型/苦旅型」选叙事线——同档不同命。
   三个出口（与 SharePoster.share 的三种 mode 对齐）：
     ShareCopy.ending(state, ret)   生涯终章
     ShareCopy.champion(state, ret) 夺冠速报
     ShareCopy.intl(state, ret)     国家队征程（升级原 intlCopy）
   ============================================================================ */
window.ShareCopy = (function () {

  /* ── 本地 PRNG（mulberry32）——与游戏 R 流完全隔离 ── */
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pick(arr, r) { return arr[Math.floor(r() * arr.length) % arr.length]; }
  function pickN(arr, n, r) {
    const pool = arr.slice(), out = [];
    while (pool.length && out.length < n) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
    return out;
  }
  function seedOf(state, ret) {
    if (ret && ret.__copySeed != null) return ret.__copySeed | 0;      // 探针确定性入口
    const d = state.data;
    return ((d.dayIndex || 0) * 31 + (d.season || 0) * 7 + (d.trophies || []).length * 13 + Date.now() % 100000) | 0;
  }

  /* ══ 28 荣誉文学变体库（顺序 = 匹配优先级：**青年专项在前**、具体在前、泛化在后）══
     每条 line 是「荣誉织入句」——第一人称、有画面、不带数字。 */
  const HONORS = [
    { re: /青年联赛射手王/, key: "青年射手王", lines: [
      "青训营的射手王奖状被我贴在床头上——那年我告诉自己：青年队的网窝，只是职业网窝的预演。",
    ] },
    { re: /青年联赛助攻榜首/, key: "青年助攻榜首", lines: [
      "青年联赛助攻榜首——小小年纪就懂了：让队友进球，比自己进球更让人上瘾。",
    ] },
    { re: /青年联赛年度之星/, key: "青年年度之星", lines: [
      "年度之星的评选结果贴在青训营公告栏——那天我把那页纸看了很久，像看一张未来的存根。",
    ] },
    { re: /青年联赛年度阵容/, key: "青年年度阵容", lines: [
      "青年联赛年度阵容——名单上的名字如今天各一方，只有我们还在这条路上继续跑。",
    ] },
    { re: /青年联赛新人王/, key: "青年新人王", lines: [
      "青年联赛新人王——第一年就被记住的感觉，像是在整条青训走廊里亮了一盏自己的灯。",
    ] },
    { re: /青年联赛优胜/, key: "青年联赛优胜", lines: [
      "青年联赛优胜奖牌不大，挂上脖子的那一刻却重得惊人——那是青春换来的第一份答卷。",
    ] },
    { re: /青年杯优胜/, key: "青年杯优胜", lines: [
      "青年杯优胜——雨里踢完的决赛，奖杯擦得比谁都亮，因为知道它来得多不容易。",
    ] },
    { re: /世界杯冠军/, key: "世界杯冠军", lines: [
      "举起世界杯的那一夜，我把脸埋在队徽里哭了很久——原来一个国家的梦，是可以用脚一点点缝出来的。",
      "决赛终场哨响的时候，我第一反应不是庆祝，是回头看了一眼替补席——这条路上每张脸，都该被记住。",
      "所有人都在喊我的名字，我却只记得皮球砸进网窝那一瞬间的安静。",
    ] },
    { re: /世界杯金手套|世界杯最佳门将/, key: "世界杯金手套", lines: [
      "世界杯的金手套摆在柜子最中间——它替我记住了那些飞身扑救的夜晚，和指节撞上门柱的闷响。",
      "有人问我扑点球的秘诀。哪有秘诀，不过是把每一个角度都提前死过一遍。",
    ] },
    { re: /世界杯金靴/, key: "世界杯金靴", lines: [
      "世界杯金靴到手的那晚，我把战靴擦了三遍——它们陪我跑过的每一条防线，都值一座奖杯。",
      "一届世界杯把射手的名字刻进历史——我做到了，弹无虚发。",
    ] },
    { re: /世界杯MVP/, key: "世界杯MVP", lines: [
      "世界杯MVP的奖杯不重，重的是「最好」这两个字的分量——我用了整届赛事去配得上它。",
      "从小组赛到决赛，我把最好的自己留在了最高的舞台。",
    ] },
    { re: /亚洲杯冠军/, key: "亚洲杯冠军", lines: [
      "亚洲之巅的风很大，吹得旗帜猎猎作响——那一刻，满场的呐喊都是甜的。",
      "亚洲杯冠军到手，捧杯照片里我笑得像个孩子——本来也就是个踢球的孩子。",
    ] },
    { re: /亚洲杯金靴/, key: "亚洲杯金靴", lines: [
      "亚洲杯金靴进了柜子。射手这门手艺，靠的是日复一日对自己下狠手。",
    ] },
    { re: /亚洲杯MVP/, key: "亚洲杯MVP", lines: [
      "亚洲杯MVP——裁判每吹响一次终场，我就多确定一分：这场我可以。",
    ] },
    { re: /洲际冠军杯|洲际冠军|球俱杯|^欧冠$|^亚冠$/, key: "洲际冠军杯", lines: [
      "洲际冠军杯之夜，整个城市的灯都为我们亮着——那种被一整座城市托起来的感觉，一辈子忘不掉。",
      "欧洲之巅也好，大洲之巅也好——反正那一晚，我们的队歌响彻了整座球场。",
    ] },
    { re: /洲际二级杯|球俱挑战杯|^欧联$|^亚冠2$/, key: "洲际二级杯", lines: [
      "洲际二级杯不是终点，是我向更高处递的名片——每一座奖杯都有自己的脾气，我驯服了它。",
    ] },
    { re: /国内杯赛冠军/, key: "国内杯赛冠军", lines: [
      "国内杯赛冠军的雨夜，教练把我从人堆里拽出来，狠狠抱了一下——那一抱比奖杯还沉。",
      "杯赛的草地总是最泥泞的，可捧起国内杯赛冠军那一刻，泥点子都是勋章。",
    ] },
    { re: /晋级.*世界杯/, key: "晋级世界杯", lines: [
      "又是四年，又一张世界杯门票——预选赛的每一分钟都在提醒我：这条路从来不好走。",
      "带着全国球迷的嗓门冲进世界杯——晋级那晚，我在更衣室待到很晚，舍不得走。",
    ] },
    { re: /世界杯/, key: "世界杯参赛", lines: [
      "站上世界杯草皮的那一分钟，我想起了所有没走到这里的下午。",
      "世界杯的草皮比想象中软，心却比任何时候都硬。",
    ] },
    { re: /亚洲杯/, key: "亚洲杯参赛", lines: [
      "亚洲杯的看台上全是熟悉的中国嗓——那种被自己人喊着的踏实，踢过才懂。",
    ] },
    { re: /金冕奖/, key: "金冕奖", lines: [
      "金冕奖——年度最佳。领奖时我说：这不是我一个人的年份，是所有把球传给我的人的年份。",
      "金冕奖到手那天，我把获奖感言写了很多稿，最后只说了一句：谢谢足球没收我全部的课余时间。",
    ] },
    { re: /联赛金靴/, key: "金靴", lines: [
      "金靴的重量不在金属，在每一次门前呼吸都是致命的那份笃定。",
      "射手榜第一的名字后面，是我整个赛季在录像室里啃出来的门道。",
    ] },
    { re: /联赛助攻王|助攻榜首/, key: "助攻王", lines: [
      "助攻王的奖杯属于一双「看得见别人」的眼睛——进球的人发光，传球的人隐身，我甘愿隐身了整个赛季。",
      "比起名字挂在射手榜，我更喜欢助攻榜——那是把队友变成英雄的证明。",
    ] },
    { re: /最佳阵容|年度阵容/, key: "最佳阵容", lines: [
      "赛季最佳阵容公布那晚，我把截图设成了壁纸——和这个联赛最好的球员们并排站着，像做梦。",
      "入选最佳阵容：十一人的名单里有我，纸上一个名字，背后一整个赛季。",
    ] },
    { re: /联赛最佳门将|金手套/, key: "最佳门将", lines: [
      "最佳门将的奖杯，属于所有扑出去的夜晚——手套磨破的地方，就是我的勋章。",
    ] },
    { re: /最佳新人|新人王/, key: "最佳新人", lines: [
      "最佳新人——那年我初来乍到，谁也没想到名单里会有我，包括我自己。",
      "新人王的意义不是「强」，是「开始」——从那天起，没人再敢把我当小孩。",
    ] },
    { re: /赛季最佳球员候选/, key: "最佳球员候选", lines: [
      "赛季最佳球员候选名单上有我——没捧杯也值了，被认真的评委们讨论过，就算被这个赛季记住了。",
    ] },
    { re: /冠军$/, key: "联赛冠军", lines: [
      "联赛冠军！终场哨响那一刻我瘫坐在草皮上——一整个赛季的三十四场，原来真的可以一场不辜负。",
      "捧起联赛冠军奖杯时，彩带落了我满头满肩——那种甜，是三百六十天的苦换来的。",
      "夺冠游行那天，全城的人都在唱队歌——我把奖杯举过头，看见楼下有个小孩在哭，大概就是当年的我。",
    ] },
    { re: /优胜$/, key: "青年优胜", lines: [
      "优胜的奖牌挂在更衣柜里，陪着我从青训营一路走到了职业场。",
    ] },
  ];

  /* ── 荣誉解析：奖杯名 → kind（含计数）── */
  function classify(trophies) {
    const out = [];
    const list = Array.isArray(trophies) ? trophies : [];
    for (const t of list) {
      const name = (t && t.name) || "";
      for (const h of HONORS) {
        if (h.re.test(name)) { out.push({ name: name, key: h.key, line: h.lines }); break; }
      }
    }
    const byKey = {};
    for (const o of out) {
      if (!byKey[o.key]) byKey[o.key] = { key: o.key, n: 0, lines: o.line, names: [] };
      byKey[o.key].n++;
      if (byKey[o.key].names.indexOf(o.name) < 0) byKey[o.key].names.push(o.name);
    }
    return Object.keys(byKey).map(k => byKey[k]);
  }
  /* 稀有度排序：世界级 > 洲际/年度 > 联赛 > 青年 */
  const RARE = ["世界杯冠军", "世界杯MVP", "世界杯金靴", "世界杯金手套", "金冕奖", "洲际冠军杯", "亚洲杯冠军", "亚洲杯MVP", "亚洲杯金靴",
    "联赛冠军", "联赛最佳门将", "赛季最佳阵容", "金靴", "助攻王", "洲际二级杯", "国内杯赛冠军", "世界杯参赛", "亚洲杯参赛", "晋级世界杯",
    "最佳新人", "最佳门将", "最佳球员候选", "青年年度之星", "青年新人王", "青年射手王", "青年助攻榜首", "青年年度阵容", "青年联赛优胜", "青年杯优胜", "青年优胜"];

  /* ══ 档位基调（结局 id → 开篇 ×3 + 标题骨架 ×3）══ */
  const TONES = {
    king: { open: [
      "有人问我退役是什么感觉。大概是——把一整个国家的期待背了那么多年，终于可以放下来，笑着说一句：都实现了。",
      "从第一脚球到最后一脚球，我把自己活成了一个圆——起点是热爱，终点是圆满。",
      "这个故事最不真实的地方在于：它是真的。每一座奖杯、每一个夜晚，都是真的。",
    ], title: ["我用二十年圆了一个国家的梦", "从野球场到世界之巅，这一路全是值得", "退役了——把属于我们的时代，完整地交还给了热爱"] },
    hero: { open: [
      "那一夜之后，中国足球不用再叹着气说了——而我们，就是那一夜本身。",
      "有人把职业生涯活成了成绩单，我把它活成了一次冲锋。",
      "巅峰会谢幕，热血不会。挂靴这一天，我心里的哨还没吹响。",
    ], title: ["那一夜之后，中国足球不用再叹着气说了", "巅峰谢幕，热血不散——这是我交出的答案", "退役帖：把最好的年华，押给了最高的舞台"] },
    asia: { open: [
      "亚洲之巅看过了，更高的地方没去成——但足球从来没有白走的路。",
      "我职业生涯的高光不在于抵达了哪里，在于每一站都拼到了极限。",
      "挂靴这天很平静。遗憾当然有，但后悔一点都没有。",
    ], title: ["亚洲之巅看过了，虽没去更高的地方，但不后悔", "退役帖：把「差一点」活成了「不后悔」", "挂靴：这条路上所有的风景，我都认真看过了"] },
    onecity: { open: [
      "一个人一座城，一辈子一件球衣——这不是固执，是我对「归属」二字全部的理解。",
      "别的球员换球队像换发型，我换都懒得换——因为我把根扎在了这里。",
      "退役申请递上去那天，队徽在我眼里比奖杯还亮。",
    ], title: ["一个人，一座城，一场没闹过的转会", "忠诚值几个钱？值我整个职业生涯", "退役帖：我把青春整笔存进了这家俱乐部"] },
    goals: { open: [
      "进球是我的瘾，退役是戒断的第一天——戒得很难受，但我不后悔踢过的每一脚。",
      "有人说我只会进球。对，我把「只会」两个字练到了极致。",
      "柜子空了一角没什么——每一个网窝的颤动，我都收在心里了。",
    ], title: ["进球是我的瘾，今天是戒断第一天", "退役帖：把「只会进球」练成了极致", "挂靴：网窝的颤动我都收好了，奖杯随缘"] },
    gk: { open: [
      "门将这个位置教会我的：孤独不是代价，是本事。",
      "全队都在聚光灯下，只有我背对球场——可我扑出去的每一个球，都是我的高光。",
      "退役了。十指的老茧和柜子里的手套，就是我全部的青春存根。",
    ], title: ["门将退役：我把孤独练成了本事", "退役帖：背对球场的人，守住了所有夜晚", "挂靴：十指老茧，是我全部的青春存根"] },
    injured: { open: [
      "伤病没跟我商量。但它教会我的事，比任何冠军都多——比如怎么体面地告别。",
      "医学上我退役了。热爱上，我永远不会。",
      "最后一场比赛我要求踢满全场——不是倔，是想亲口跟草地说再见。",
    ], title: ["伤病没跟我商量，但我跟足球好好告了别", "退役帖：医学上退役，热爱上永不", "挂靴：最后一舞不完美，但是我的"] },
    veteran: { open: [
      "零冠退役听起来很惨？可我带过的每个年轻人，都在替我继续奔跑。",
      "我不是主角命，我是那种把更衣室撑起来的老黄牛——今天这头牛下班了。",
      "职业生涯没有高光集锦，只有日复一日的训练场——但谁说坚持不算一种天赋。",
    ], title: ["零冠退役，但我带过的年轻人值一座杯", "退役帖：不是主角命，是更衣室的老黄牛", "挂靴：坚持这件事，我做了整整一生"] },
    legend: { open: [
      "他们叫我传奇。其实我只是把「再练一天」重复了一万遍。",
      "传奇指数什么的随缘吧——我只知道，这条路上我没有偷过一天懒。",
      "退役这天，荣誉墙挂满了整面墙。可我最舍不得的，是每天清晨那颗踩在草皮上的球。",
    ], title: ["他们叫我传奇，我只是把「再练一天」重复了一万遍", "退役帖：荣誉墙挂满，清晨那颗球最舍不得", "挂靴：这条路上我没偷过一天懒"] },
    star: { open: [
      "世界之巅走了一遭——够了。剩下的人生，我想为热爱本身踢球。",
      "星光落在肩上的时候，我没飘——因为我知道它有多沉。",
      "退役不是句号。对踢球的人来说，只有换场休息。",
    ], title: ["世界之巅走了一遭，够了", "退役帖：星光很沉，我没飘住", "挂靴：人生下半场，为热爱本身踢球"] },
    known: { open: [
      "普通但扎实——这四个字我配得上。干了这杯，敬所有平凡岗位上的坚守。",
      "没有惊天动地，只有按部就班。可足球需要主角，也需要我们。",
      "退役了。名不见经传的生涯，也是唯一的一生——我尽力让它体面。",
    ], title: ["普通但扎实的职业生涯，值得一杯酒", "退役帖：足球需要主角，也需要我们", "挂靴：名不见经传，但我尽力让它体面"] },
    pro: { open: [
      "一个平凡人的足球人生——起点不高，天赋平平，全靠不肯认输。",
      "如果你也在坚持一件看不到头的事，这篇退役帖写给你。",
      "谢幕了。球鞋可以挂起来，那股不服输的劲儿挂不住。",
    ], title: ["一个平凡人的足球人生，敬所有还在坚持的人", "退役帖：天赋平平，全靠不肯认输", "挂靴：球鞋能挂，那股劲儿挂不住"] },
  };

  /* ══ 生涯叙事线（真实数据判定，每线 ×2 变体）══ */
  function storylineOf(d, kinds) {
    const s = d.stats || {};
    const pos = (d.player && d.player.position) || "";
    const clubs = 1 + ((d.history && d.history.pastClubs) || []).length;
    const kc = {};
    (kinds || []).forEach(k => { kc[k.key] = k.n; });
    const champN = (kc["联赛冠军"] || 0) + (kc["国内杯赛冠军"] || 0) + (kc["洲际冠军杯"] || 0) + (kc["世界杯冠军"] || 0) + (kc["亚洲杯冠军"] || 0);
    if (pos === "GK" || (kc["最佳门将"] || 0) + (kc["世界杯金手套"] || 0) >= 1) return { key: "gk", lines: [
      "教练常说，好门将是半支球队。我没敢当半支，只求每一次站位都无愧于身后的球门。",
      "别的位置用进球说话，我用「没丢」说话——零封榜上每一行，都是一次全队的信任。",
    ] };
    if ((kc["世界杯冠军"] || 0) >= 1) return { key: "world", lines: [
      "这条路的尽头是世界杯冠军——中间所有的弯路、冷板凳、伤停名单，此刻都成了注脚。",
    ] };
    if ((kc["金靴"] || 0) + (kc["青年射手王"] || 0) >= 2 || (s.goals || 0) >= (s.apps || 0) * 0.55) return { key: "striker", lines: [
      "射手的哲学很简单：下一次触球，就是下一次机会——我把这句话踢了整个生涯。",
      "门前一米和门前三十米，对我来说没有区别——区别只在练习量。",
    ] };
    if (champN >= 4) return { key: "champ", lines: [
      "奖杯柜最上层放了冠军，中间放了个头，下层全是拼搏的碎屑——拿冠军这件事，是真的会上瘾。",
      "有人统计过我的夺冠履历——其实每一个冠军背后，都有一个差点放弃的雨夜。",
    ] };
    if ((kc["助攻王"] || 0) + (kc["青年助攻榜首"] || 0) >= 2) return { key: "assist", lines: [
      "我这一行干得最久的事，是把球送到别人脚下最舒服的位置——成全别人，也是我的天赋。",
    ] };
    if (clubs === 1) return { key: "loyal", lines: [
      "生涯只效力过一家俱乐部——不是因为没机会走，是因为这里的每一块草皮我都答应过要守护。",
    ] };
    if (clubs >= 5) return { key: "wander", lines: [
      "换了很多座城市、很多件球衣——每间更衣室都留了我的故事，每个主场都欠我一声再见。",
    ] };
    return { key: "allround", lines: [
      "天赋决定了上限，训练决定了下限——我的生涯就在这两条线之间，一天一天往上涨。",
      "回头看这一路：没有天才剧本，全靠笨功夫——但笨功夫最经得起回放。",
    ] };
  }

  /* ══ 内部工具 ══ */
  function baseStats(d) {
    const s = d.stats || {};
    const intl = (d.intl && d.intl.career) || { apps: 0, goals: 0 };
    const seasons = s.seasonsPlayed || (d.careerLog ? d.careerLog.length : 0) || 0;
    const clubs = 1 + ((d.history && d.history.pastClubs) || []).length;
    const rating = s.apps ? (Math.round((s.ratingSum || 0) / s.apps * 10) / 10).toFixed(1) : "0.0";
    return {
      s: s, intl: intl, seasons: seasons, clubs: clubs, rating: rating,
      name: (d.player && d.player.name) || "无名球员",
      num: (d.player && d.player.number) || 9,
      age: (d.player && d.player.age) || "?",
      pos: (d.player && d.player.position) || "",
      nTrophy: (d.trophies || []).length,
      nYouth: (d.youth && d.youth.trophies ? d.youth.trophies.length : 0) || 0,
      year: (d.date && d.date.year) || "",
      captain: !!(d.intl && d.intl.captain),
    };
  }
  /* 真实数字集（门禁用）：正文允许出现的全部数字串 */
  function numberSet(d, ret) {
    const b = baseStats(d);
    const set = {};
    const add = v => { if (v !== null && v !== undefined && v !== "" && isFinite(Number(v))) set[String(v)] = true; };
    add(b.age); add(b.seasons); add(b.s.apps); add(b.s.goals); add(b.s.assists);
    add(b.rating); add(b.rating.split(".")[0]); add(b.rating.split(".")[1]);
    add(b.intl.apps); add(b.intl.goals); add(b.nTrophy); add(b.clubs); add(b.num); add(b.year);
    add(ret && ret.legacy);
    /* ★ P261：比赛战报出口——比分/个人数据/点球/评分/compLabel 内数字全部为真实数据 */
    if (ret && ret.__matchCard) {
      const mc = ret.__matchCard;
      add(mc.home); add(mc.away); add(mc.goals); add(mc.assists); add(mc.rating); add(mc.saves); add(mc.conceded);
      if (mc.rating != null) { const rs = String(mc.rating).split("."); add(rs[0]); if (rs[1]) add(rs[1]); }
      if (mc.pens) { add(mc.pens.my); add(mc.pens.opp); }
      const cl = String(mc.compLabel || "").match(/(\d+)/g); if (cl) cl.forEach(add);
    }
    (d.trophies || []).forEach(t => { const m = String(t.name || "").match(/(\d+)/g); if (m) m.forEach(add); });
    /* 荣誉分类计数（文案里的「N 座」后缀也来自真实统计） */
    classify(d.trophies).forEach(k => add(k.n));
    classify(d.youth && d.youth.trophies).forEach(k => add(k.n));
    return set;
  }

  /* ══ 荣誉文学段（取稀有度前 N 织入，每条一变体）══ */
  function honorParagraph(kinds, r, maxN) {
    const sorted = kinds.slice().sort((a, b) => (RARE.indexOf(a.key) - RARE.indexOf(b.key)));
    const top = sorted.slice(0, maxN || 3);
    const segs = top.map(k => {
      const cnt = k.n > 1 ? "（" + k.n + " 座）" : "";
      return pick(k.lines, r) + cnt;
    });
    return segs.join("\n");
  }

  /* ══ 出口一：生涯终章 ══ */
  function ending(state, ret) {
    const d = state.data;
    const r = rng(seedOf(state, ret));
    const b = baseStats(d);
    const e = ret.ending || ret.tier || {};
    const tone = TONES[e.id] || TONES.pro;
    const youthKinds = classify(d.youth && d.youth.trophies);
    const adultKinds = classify(d.trophies);
    const kinds = adultKinds.concat(youthKinds);
    const line = storylineOf(d, kinds);

    const open = pick(tone.open, r);
    const titleCore = pick(tone.title, r);
    const title = b.num + "号退役帖：" + titleCore;

    const ratingLine = "场均评分 " + b.rating;
    const intlLine = "国家队 " + (b.intl.apps || 0) + " 场 " + (b.intl.goals || 0) + " 球" + (b.captain ? "（还是队长）" : "");
    const intro = pick([
      "先上生涯答卷：" + b.age + " 岁挂靴，踢了 " + b.seasons + " 个赛季，" + b.s.apps + " 场 " + b.s.goals + " 球 " + b.s.assists + " 助攻，" + ratingLine + "。",
      "数据摆在下面，先说结论：" + b.seasons + " 个赛季、" + b.s.apps + " 场比赛、" + b.s.goals + " 球 " + b.s.assists + " 助攻，" + b.age + " 岁那天我把球鞋挂了起来。",
      "挂靴了。生涯答卷：效力 " + b.clubs + " 家俱乐部，" + b.s.apps + " 场 " + b.s.goals + " 球 " + b.s.assists + " 助攻，" + ratingLine + "，" + intlLine + "。",
    ], r);

    const honorSeg = kinds.length
      ? pick([
          "要说值得吹的，是这些——",
          "柜子里的硬货，挑几件说说——",
          "荣誉墙不一一点了，捡最重的几座——",
        ], r) + "\n" + honorParagraph(kinds, r, 3)
      : pick([
          "没有奖杯也敢发帖？敢。因为这段路我一步没少走。",
          "荣誉柜是空的，但草皮的每一道划痕我都记得。",
        ], r);

    const story = pick(line.lines, r);

    const close = pick([
      "各位 JR 会给这份生涯打几分？轻喷，评论区聊。",
      "退役不是结束，换个看台继续爱。JR 们，你们最早的球衣号码是多少？",
      "求顶帖让更多人看到——也求推荐几部足球纪录片，退役生活要开始补课了。",
    ], r);

    const body =
      "【" + (e.name || "生涯终章") + "】" + (e.line || "") + "\n\n" +
      open + "\n\n" +
      intro + "\n\n" +
      story + "\n\n" +
      honorSeg + "\n\n" +
      "「" + (e.desc || "") + "」\n\n" +
      close + "\n" +
      "#冠军之心足球生涯 #退役大佬的生涯成绩单";
    return { title: title, body: body, honors: kinds.map(k => k.key) };
  }

  /* ══ 出口二：夺冠速报 ══ */
  function champion(state, ret) {
    const d = state.data;
    const r = rng(seedOf(state, ret));
    const c = ret.__champion || {};
    const b = baseStats(d);
    const label = c.compLabel || "冠军";
    const title = pick([
      label + "！" + (b.year || "这个赛季") + "，我们把不可能踢成了日常",
      "我们夺冠了！！决赛夜的多巴胺还没退",
      label + "到手——这一冠，全队欠的觉都值了",
    ], r);
    const body =
      pick([
        "兄弟们先看比分：" + (c.scoreLine || "—") + "，" + (c.oppName || "对手") + "倒在了我们的赛季目标面前。",
        "决赛打完：" + (c.scoreLine || "—") + " 击败 " + (c.oppName || "对手") + "——" + label + "到手！",
        "不卖关子了：" + (c.scoreLine || "—") + "，我们赢了 " + (c.oppName || "对手") + "，" + label + "！！",
      ], r) + "\n" +
      (c.userGoals ? "决赛我进了 " + c.userGoals + " 球" + (c.motm ? "，顺便把全场最佳也领了" : "") + "。" : (c.motm ? "我拿了全场最佳——就够了。" : "")) + "\n\n" +
      pick([
        "从赛季初的动员会到今晚的彩带雨，这支球队把「我们」两个字踢成了动词。",
        "更衣室现在还乱着，香槟混着汗，没人体面——但没人在乎。",
        "看台上鼓声没停过。这座城市今晚不睡，我们也不睡。",
      ], r) + "\n\n" +
      pick([
        "这个冠军你给几分？评论区开聊，理性也好，吼出来也行！",
        "久违的冠军滋味——评论区聊聊，你最难忘的一场球是哪场？",
        "此刻只想听一句：这一冠，够不够热血？",
      ], r) + "\n" +
      "#冠军之心足球生涯 #" + label;
    return { title: title, body: body };
  }

  /* ══ 出口三：国家队征程（升级原 intlCopy，多版本）══ */
  function intl(state, ret) {
    const d = state.data;
    const r = rng(seedOf(state, ret));
    const c = ret.__intl || {};
    const m = ret.__match || {};
    const b = baseStats(d);
    const comp = c.comp || "世界杯";
    const result = c.result || "champion";
    const label = result === "champion" ? (comp + "冠军")
      : result === "runner-up" ? (comp + "亚军")
      : result === "semifinal" ? (comp + "四强")
      : result === "quarterfinal" ? (comp + (c.stageLabel || "止步八强"))
      : (comp + "小组出局");
    const tones = {
      champion: [
        "从小组赛到决赛，每一场都写在战报里——这个夏天，属于整支球队。",
        "国歌响起的时候我起了一身鸡皮疙瘩——原来「替国家队出场」从来不是一句口号。",
        "冠军的重量，是身后十四亿人的期待——我们扛住了。",
      ],
      "runner-up": [
        "差一步就是最高处。银牌的重量，只有拼到最后一秒的人知道。",
        "决赛输了，但没人低头——这块银牌是我们向世界递出的名片。",
        "一分钟前还触摸着冠军，一分钟后天塌了——足球就这么残酷，我们认。",
      ],
      semifinal: [
        "倒在决赛门外，但世界已经记住了我们的名字。",
        "四强的成绩单不完美——可从死亡之组爬出来的人，配得上所有掌声。",
      ],
      quarterfinal: [
        "淘汰赛的学费交得不亏——四年后，带着它回来。",
        "八强，到了但没过——下次把门踹开。",
      ],
      group_out: [
        "小组赛的苦涩刻骨铭心——四年后，带着它回来。",
        "出局那晚没人说话。回程航班上，每个人都攥着自己的球袜——不甘心，就再来。",
      ],
    };
    const tone = pick(tones[result] || tones.champion, r);
    const title = result === "champion"
      ? pick([label + (b.year ? "！" + b.year + " " + comp : "！" + comp) + "，这一夜属于中国足球", "我们做到了：" + label + "！！全国球迷进来放烟花"], r)
      : pick([label + "！我们让世界记住了中国足球", label + "——别急着惋惜，这支球队值得看好"], r);
    const body =
      "兄弟们，" + (b.year ? (b.year + " " + comp) : comp) + "打完了，最终成绩：" + label + "。\n" +
      (c.games ? "本届 " + (c.wins || 0) + " 胜 " + ((c.games || 0) - (c.wins || 0)) + " 负" + (m.played !== false ? "，我贡献 " + (m.userGoals || 0) + " 球" + (m.motm ? "，拿过一次全场最佳" : "") : "") + "。" : "") + "\n\n" +
      tone + "\n\n" +
      pick([
        "国家队生涯累计：" + (b.intl.apps || 0) + " 场 " + (b.intl.goals || 0) + " 球" + (b.captain ? "，袖标还在我柜子里" : "") + "——每一次唱国歌，起鸡皮疙瘩的次数一次没少过。",
        "代表国家队出场 " + (b.intl.apps || 0) + " 次、进 " + (b.intl.goals || 0) + " 球——数字会老，热爱不会。",
      ], r) + "\n\n" +
      pick([
        "各位 JR 会给这届国家队打几分？",
        "评论区聊聊：这支国家队离真正的巅峰还差什么？",
        "求个客观评分——骂也可以，轻点骂。",
      ], r) + "\n" +
      "#冠军之心足球生涯 #" + comp + (result === "champion" ? "冠军" : "征程");
    return { title: title, body: body };
  }

  /* ══ 出口四：比赛战报（P261，每场赛后卡「分享战报」按钮）══
     ret.__matchCard = 结算卡真实数字（零捏造：正文数字全部来自这里或 baseStats）：
     { compLabel, homeName, awayName, home, away, res, oppName, played, rating,
       goals, assists, motm, pens:{my,opp,won}, saves, conceded, isGK, keyHook,
       careerGoalsAfter, careerAppsAfter }
     里程碑判定复用 SharePoster.matchMilestoneOf 单源（share.js 后载，运行时可达）。 */
  function match(state, ret) {
    const d = state.data;
    const r = rng(seedOf(state, ret));
    const p = ret.__matchCard || {};
    const label = p.compLabel || "比赛战报";
    const ms = (window.SharePoster && SharePoster.matchMilestoneOf) ? SharePoster.matchMilestoneOf(p) : null;
    const scoreLine = (p.homeName || "主队") + " " + (p.home != null ? p.home : 0) + " : " + (p.away != null ? p.away : 0) + " " + (p.awayName || "客队");

    const title = ms
      ? pick([
          ms.name + "！" + label + "的战报，请查收",
          label + "：" + ms.name + "！看台快被我吼塌了",
          ms.name + "！今晚我是主角",
        ], r)
      : p.res === "胜"
        ? pick(["赢下来了！" + label + "战报", label + "拿下了，一场硬仗的胜利", "三分到手！" + label], r)
        : p.res === "平"
          ? pick([label + "战平，一分也是拼出来的", "平局战报：过程比比分好看"], r)
          : pick([label + "输了，但血性还在", "输球战报：踢得不好，认，但会回来"], r);

    const open = pick([
      "兄弟们先看比分：" + scoreLine + (p.pens ? "（点球 " + p.pens.my + ":" + p.pens.opp + (p.pens.won ? " 胜" : " 负") + "）" : "") + "。",
      "打完" + label + "：" + scoreLine + "，对手是" + (p.oppName || "对手") + "。",
      "不卖关子：" + scoreLine + "，" + (p.res === "胜" ? "我们赢了" : p.res === "平" ? "拿到一分" : "输了，认") + "。",
    ], r);

    const perf = !p.played ? "本场替补席待命，没获得出场机会——回去加练，等下一次机会。"
      : p.isGK
        ? pick(["个人数据：" + (p.saves || 0) + " 次扑救，评分 " + (p.rating != null ? p.rating : "—") + (p.motm ? "，全场最佳也是我" : "") + "。",
                "扑了 " + (p.saves || 0) + " 次，评分 " + (p.rating != null ? p.rating : "—") + (p.motm ? "——门将也能拿全场最佳" : "") + "。"], r)
        : pick(["个人数据：" + (p.goals || 0) + " 球 " + (p.assists || 0) + " 助攻，评分 " + (p.rating != null ? p.rating : "—") + (p.motm ? "，全场最佳是我" : "") + "。",
                "我这场 " + (p.goals || 0) + " 球 " + (p.assists || 0) + " 助攻，评分 " + (p.rating != null ? p.rating : "—") + (p.motm ? "——把全场最佳也顺手领了" : "") + "。"], r);

    const msSeg = ms
      ? "\n【" + ms.name + "】" + pick(ms.lines, r) + "\n"
      : (p.res === "胜" ? "\n" + pick(["更衣室现在全是汗味和笑声，好闻得很。", "这种赢球的感觉，来多少次都不腻。"], r) + "\n" : "");

    const close = pick([
      "这表现大家打几分？评论区开聊。",
      "JR 们评评理：这场我该拿几分？",
      "下一场继续——你们觉得这状态能保持多久？",
    ], r);

    const body =
      open + "\n" +
      perf + "\n" +
      msSeg + "\n" +
      close + "\n" +
      "#冠军之心足球生涯 #" + label;
    return { title: title, body: body, milestone: ms ? ms.key : "" };
  }

  return {
    ending: ending, champion: champion, intl: intl, match: match,
    classify: classify, numberSet: numberSet, HONORS: HONORS, RARE: RARE,
  };
})();
