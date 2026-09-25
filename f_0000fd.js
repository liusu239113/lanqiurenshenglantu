/* ============================================================================
   club_events.js — 俱乐部专属事件引擎（P63 施工）
   规格：docs/多特蒙顿专属事件样板_v1.md（P63 锁稿 70 卡）
   铁律：触发唯一性（豁免=遗憾×2）/ 泪点仅 farewell / 性格锚点 / 同条件排队
   挂钩：season.initSeason(加盟/回归/阵容注入/新季队列)、season.finishSeason(结算/告别/
         遗憾结局)、eventcards.silentPick+afterResult+showPre(卡链插入)、
         transfer(挽留特化/雪藏/离队/forever 六处短路)、nation_dev(转会卡 UI)、
         v2/hub.enter(待展示队列)
   存档：d.clubEvents.dortmund = { joinSeason, entry, seen{}, pending[], ... }
   ============================================================================ */
(function () {
  const R = window.R;

  /* ══ P94a：子模块装载（拆分接缝）════════════════════════════════════════
     · Node（36 个球队探针 require 本文件）→ 同步 require 子模块
     · 浏览器 → 由 index.html 的 script 串在本文件之前加载
     · soak   → 由 _v2_soak.js 从 index.html 解析出的顺序加载（vm 内无 require）
     注册表 = club/_reg.js；共享工具 = club/_shared.js。 */
  if (typeof require === "function" && typeof module !== "undefined") {
    ["_reg", "_shared", "liv", "tot", "mci", "mnu", "ars", "che", "dor", "bay", "sch", "bmg"].forEach(function (f) { require("./club/" + f + ".js"); });
  }
  const REG = window.__ClubReg;
  const SH = REG.shared;
  /* 共享工具：原先散落本文件 5 处，P94a 起单一定义在 club/_shared.js */
  const CARDS = SH.CARDS, card = SH.card;
  const seen = SH.seen, mark = SH.mark, queue = SH.queue;
  const tenure = SH.tenure, gapOk = SH.gapOk;
  const teamInLD = SH.teamInLD, pushUnique = SH.pushUnique;
  const destRebuild = SH.destRebuild, destAppend = SH.destAppend;
  const _baseCache = SH.baseCache;          // ★ 单例：切不可各模块一份（阵容快照会分裂）
  /* 各队符号解构回本作用域 → 下方 13 个钩子里的调用点零改动 */
  const LIV = REG.sym("liv");
  const livId = LIV.livId, atLiv = LIV.atLiv, ensureLiv = LIV.ensureLiv;
  const seenL = LIV.seenL, markL = LIV.markL, queueL = LIV.queueL, tenureLiv = LIV.tenureLiv;
  const injectSquadLiv = LIV.injectSquadLiv;
  const onInitSeasonLiv = LIV.onInitSeasonLiv, onSeasonEndLiv = LIV.onSeasonEndLiv;
  const pickSilentLiv = LIV.pickSilentLiv, pickPreLiv = LIV.pickPreLiv;
  const LIV_MATCH_SEQ = LIV.LIV_MATCH_SEQ, LIV_AMBIENT = LIV.LIV_AMBIENT, LIV_GUARDS = LIV.LIV_GUARDS;
  const TOT = REG.sym("tot");
  const { TOT_NAME, totId, atTot, ensureTot, seenT, markT, queueT, tenureTot, TOT_MATCH_SEQ, TOT_AMBIENT, TOT_GUARDS, injectSquadTot, onInitSeasonTot, onSeasonEndTot, pickSilentTot, pickPreTot } = TOT;
  const MCI = REG.sym("mci");
  const { MCI_NAME, mciId, atMci, ensureMci, seenM, markM, queueM, tenureMci, MCI_MATCH_SEQ, MCI_AMBIENT, MCI_GUARDS, injectSquadMci, onInitSeasonMci, onSeasonEndMci, pickSilentMci, pickPreMci } = MCI;
  const MNU = REG.sym("mnu");
  const { MNU_NAME, mnuId, atMnu, ensureMnu, seenN, markN, queueN, tenureMnu, MNU_MATCH_SEQ, MNU_AMBIENT, MNU_GUARDS, injectSquadMnu, onInitSeasonMnu, onSeasonEndMnu, pickSilentMnu, pickPreMnu } = MNU;
  const ARS = REG.sym("ars");
  const { ARS_NAME, arsId, atArs, ensureArs, seenA, markA, queueA, tenureArs, ARS_MATCH_SEQ, ARS_AMBIENT, ARS_GUARDS, injectSquadArs, onInitSeasonArs, onSeasonEndArs, pickSilentArs, pickPreArs } = ARS;
  const CHE = REG.sym("che");
  const { CHE_NAME, cheId, atChe, ensureChe, seenChe, markChe, queueChe, tenureChe, CHE_MATCH_SEQ, CHE_AMBIENT, CHE_GUARDS, injectSquadChe, onInitSeasonChe, onSeasonEndChe, pickSilentChe, pickPreChe } = CHE;
  const DOR = REG.sym("dor");
  const { DOR_NAME, REUS_NAME, REUS_BASE_AGE, REUS_FAREWELL_AGE, REUS_DEP_T, HL_NAME, SJ_NAME, HL_NEW_CLUB, SJ_NEW_CLUB, SJ_JOIN_T, SJ_DEP_T, HL_JOIN_T, HL_DEP_T, TRIO, KLOPP_TUCH_T, dorId, atDor, tw, reusAge, reusAlive, hlActive, sjActive, injectSquad, showKp3b, done3b } = DOR;
  const BAY = REG.sym("bay");
  const { BAY_NAME, bayId, atBay, ensureBay, tenureB, MUE_DEP_Y, seenB, markB, queueB, BAY_AMBIENT, BAY_GUARDS, BAY_MATCH_SEQ, pickSilentBay } = BAY;
  const SCH = REG.sym("sch");
  const { SCH_NAME, schId, atSch, ensureSch, seenS, markS, queueS, tenureSch, SCH_MATCH_SEQ, SCH_AMBIENT, SCH_GUARDS, pickSilentSch, pickPreSch, showDc3b, doneSpec } = SCH;
  const BMG = REG.sym("bmg");
  const { BMG_NAME, STINDL_JOIN_Y, STINDL_DEP_Y, bmgId, atBmg, ensureBmg, seenB2, markB2, queueBmg, tenureBmg, stActive, BMG_MATCH_SEQ, BMG_AMBIENT, BMG_GUARDS, pickSilentBmg, pickPreBmg } = BMG;
  /* ensure（主状态容器）定义在下方；函数声明提升 → 此处把引用交给 club/*.js
     （showKp3b 等后期函数要调它）。注意各模块的 require 自举在更上面，已就绪。 */
  SH.ensure = ensure;
  /* ── 盖尔森基欣矿工/门兴阵容随真实时间线迁移（P70；夏窗离队=Y 起缺席；去向队真实注入）
     共享目的地（慕城红星/棉都蓝月/多特蒙顿）走追加式（多特蒙顿引擎每季重建后 append，dedup 防重）；
     独占目的地（盖尔森基欣矿工/门兴/汉诺瓦/狼堡/药厂/雾都火枪手）走重建式（base 快照 + 本引擎注入）── */
  function migrateSquads(d) {
    const yr = d.season;
    const grow = (base, y0) => base + Math.max(0, yr - y0);
    /* 盖尔森基欣矿工：萨内斯 2016 / 赫韦德塞·亨特拉厄 2017 / 迈厄 2018 真实离队；
       德拉克斯勒 2015 / 格雷茨坎 2018 / 科拉希纳茨·内田 2017 补入 base 外真实球员 */
    const s04 = teamInLD(SCH_NAME);
    if (s04 && s04.players) {
      if (!_baseCache[SCH_NAME]) _baseCache[SCH_NAME] = s04.players.slice();
      let arr = _baseCache[SCH_NAME].slice();
      const outS = [];
      if (yr >= 2016) outS.push("萨内斯");
      if (yr >= 2017) outS.push("赫韦德塞", "亨特拉厄");
      if (yr >= 2018) outS.push("迈厄");
      arr = arr.filter(p => outS.indexOf(p[0]) < 0);
      const inS = [];
      if (yr <= 2014) inS.push(["德拉克斯勒", grow(21, 2014), "CAM", "德国", 82]);
      if (yr <= 2017) inS.push(["格雷茨坎", grow(19, 2014), "CM", "德国", 78]);
      if (yr <= 2016) { inS.push(["科拉希纳茨", grow(21, 2014), "LB", "波黑", 78]); inS.push(["内田笃铭", grow(26, 2014), "RB", "日本", 76]); }
      s04.players = pushUnique(arr, inS);
    }
    /* 门兴：克鲁泽斯 2015 / 扎坎 2016 / 达胡德 2017 / 施廷德厄·图拉姆尔·霍夫曼 2023 / 索默德 2023 冬窗；
       克拉默斯 2015 真实租借满期空窗一季（2016 起永久回归） */
    const bmgT = teamInLD(BMG_NAME);
    if (bmgT && bmgT.players) {
      if (!_baseCache[BMG_NAME]) _baseCache[BMG_NAME] = bmgT.players.slice();
      let arr = _baseCache[BMG_NAME].slice();
      const outB = [];
      if (yr >= 2015) outB.push("克鲁泽斯");
      if (yr >= 2016) outB.push("扎坎");
      if (yr >= 2023) outB.push("索默德");
      if (yr === 2015) outB.push("克拉默斯");
      arr = arr.filter(p => outB.indexOf(p[0]) < 0);
      const inB = [];
      if (yr >= STINDL_JOIN_Y && yr <= STINDL_DEP_Y) inB.push(["施廷德厄", grow(26, 2014), "CAM", "德国", 78]);
      if (yr <= 2016) inB.push(["达胡德", grow(18, 2014), "CM", "德国", 74]);
      if (yr >= 2016 && yr <= 2022) inB.push(["霍夫曼", grow(22, 2014), "RW", "德国", 76]);
      if (yr >= 2019 && yr <= 2022) inB.push(["图拉姆尔", grow(17, 2014), "ST", "法国", 78]);
      if (yr >= 2016) inB.push(["克拉默斯", grow(23, 2014), "CDM", "德国", 77]);
      bmgT.players = pushUnique(arr, inB);
    }
    /* 汉诺瓦红绿：施廷德厄 2015 夏真实转出门兴 */
    const h96 = teamInLD("汉诺瓦红绿");
    if (h96 && h96.players) {
      if (!_baseCache["汉诺瓦红绿"]) _baseCache["汉诺瓦红绿"] = h96.players.slice();
      h96.players = yr >= STINDL_JOIN_Y ? _baseCache["汉诺瓦红绿"].filter(p => p[0] !== "施廷德厄") : _baseCache["汉诺瓦红绿"].slice();
    }
    /* 慕城红星（P72 主线 BAY_OUT/BAY_IN：真实转会日历；出簿 filter 当前值以承接多特蒙顿段胡梅尔塞注入与盖尔森基欣矿工段格雷茨坎 append）*/
    const bayT = teamInLD(BAY_NAME);
    if (bayT && bayT.players) {
      const outY = [];
      if (yr >= 2015) outY.push("小猪");            // 2015 夏 → 棉都红魔
      if (yr >= 2018) outY.push("队短");                    // 2017-05 退役
      if (yr >= 2019) outY.push("小飞侠", "刀疤侠");          // 2019 夏合同到期
      if (yr >= 2021) outY.push("阿拉帕");                  // 2021 夏 → 曼德里白舰
      if (yr >= 2022) outY.push("九五之尊");            // 2022 夏 → 巴塞罗纳
      if (yr >= MUE_DEP_Y) outY.push("二娃");               // 2025 夏真实告别
      bayT.players = bayT.players.filter(p => outY.indexOf(p[0]) < 0);
      const inY = [];
      if (yr >= 2019 && yr <= 2024) inY.push(["卢卡斯·埃尔南德塞", grow(23, 2014), "CB", "法国", 84]);   // 2019 天价后卫
      if (yr >= 2020) inY.push(["萨内斯", grow(18, 2014), "LW", "德国", 84]);                              // 2020 回城
      if (yr >= 2023) inY.push(["凯恩德", grow(20, 2014), "ST", "英格兰", 90]);                            // 2023 破亿
      if (yr >= 2024) inY.push(["奥利塞托", grow(16, 2014), "RW", "法国", 80]);                            // 2024 新星
      const inNames = inY.map(p => p[0]);
      bayT.players = bayT.players.filter(p => inNames.indexOf(p[0]) < 0);   // 注入重建（年龄逐年增长）
      bayT.players = pushUnique(bayT.players, inY);
    }
    /* 独占目的地（重建式） */
    destRebuild("沃尔芬堡", yr >= 2015 ? [["克鲁泽斯", grow(26, 2014), "ST", "德国", 81]] : []);
    destRebuild("勒沃库申", yr === 2015 ? [["克拉默斯", grow(23, 2014), "CDM", "德国", 80]]
      : (yr >= 2023 ? [["霍夫曼", grow(22, 2014), "RW", "德国", 82]] : []));
    /* ★ P95 修：雾都火枪手阵容随真实年份演进必须在**全局**做。
       真实转会（扎坎 2016 从门兴来 / 奥巴梅扬诺 2017 从多特蒙顿来）与「玩家效力哪支队」无关，
       但 injectSquadArs 原先只挂在 onInitSeasonArs 上 —— 那是「玩家在雾都火枪手」才跑的钩子，
       于是玩家不在雾都火枪手时，雾都火枪手阵容永远停在 2014（扎坎永远不会出现在雾都火枪手）。
       探针 _p70_bmg_probe「2016 阵容：扎坎→雾都火枪手」正是这么红起来的。
       injectSquadArs 从 baseCache 重建、结果确定，与「玩家在雾都火枪手」那条路径重复调用也无害。 */
    injectSquadArs(d);
    /* 共享目的地（追加式：多特蒙顿引擎每季重建后 append） */
    destAppend("慕城红星", yr >= 2018 ? [["格雷茨坎", grow(19, 2014), "CM", "德国", 84]] : []);
    destAppend("棉都蓝月", yr >= 2016 ? [["萨内斯", grow(18, 2014), "LW", "德国", 81]] : []);
    destAppend("多特蒙顿", yr >= 2017 ? [["达胡德", grow(18, 2014), "CM", "德国", 78]] : []);
  }







  /* ── 存档槽位 ── */
  function ensure(d) {
    d.clubEvents = d.clubEvents || {};
    const ce = d.clubEvents.dortmund = d.clubEvents.dortmund || {
      joinSeason: null, entry: null, midJoin: false, prevClubs: [],
      seen: {}, pending: [], lowStreak: 0, lastClubRound: -99,
      clubGoals: 0, clubApps: 0, lastRank: 0, lastChamp: false, firstTitle: false,
      reg1Armed: false, reg2Armed: false, kpR1Armed: false,
      humDep: false, mkhDep: false, gunDep: false,
      kloppStay: false, kloppAsked: false, kloppStayDone: false,
      haalandDep: false, sanchoDep: false, hlClub: HL_NEW_CLUB, sjClub: SJ_NEW_CLUB,
      farewellDone: false, forever: false,
    };
    return ce;
  }
  /* ── 赛季初始化挂钩（season.initSeason 调用；clubId 已写入 d）── */
  function onInitSeason(state, clubId) {
    const d = state.data;
    const ce = ensure(d);
    const isDor = clubId === dorId();
    // 中途离队回归：无操作；新加盟（首次效力多特蒙顿）
    if (isDor && ce.joinSeason == null) {
      ce.joinSeason = d.season;
      ce.entry = (window.Youth ? Youth.entryOf(d) : ((d.player && d.player.age < 24) ? "youth" : "star"));   // 二点十 身份档
      ce.midJoin = !!(d.history && d.history.pastClubs && d.history.pastClubs.length);
      ce.prevClubs = (d.history && d.history.pastClubs ? d.history.pastClubs.slice() : []);
      if (ce.midJoin) queue(ce, "dor_mid1");                            // 68 发布会的灯
    }
    // 回归（曾触发幕五a）
    if (isDor && ce.joinSeason != null && seen(ce, "dor_act5a") && !seen(ce, "dor_act5b")) {
      queue(ce, "dor_act5b");
    }
    // 真实时间线离队标志（P66）：桑乔 tenure 7 起 / 哈兰登 tenure 8 起 / 三连出走 tenure 2 起
    if (isDor && ce.joinSeason != null) {
      if (tenure(d, ce) >= SJ_DEP_T) ce.sanchoDep = true;
      if (tenure(d, ce) >= HL_DEP_T) ce.haalandDep = true;
      for (const p of TRIO) if (tenure(d, ce) >= p.depT) ce[p.key + "Dep"] = true;
    }
    // 教练线（P66+教练组审议稿）：图赫伦接任（2015-07 真实；挽留成功顺延一季）
    if (isDor && ce.joinSeason != null) {
      const tuchT = ce.kloppStay ? KLOPP_TUCH_T + 1 : KLOPP_TUCH_T;
      if (tenure(d, ce) >= tuchT && !seen(ce, "dor_tuch1")) queue(ce, "dor_tuch1");
    }
    // 慕城红星教练组（P71）：换帅年锚（海因克斯 2017-10 / 弗里克 2019-11 真实时点）
    if (clubId === bayId()) {
      const be = ensureBay(d);
      if (d.season === 2017) queueB(be, "bay_hey1");
      if (d.season === 2019) queueB(be, "bay_flick1");
    }
    /* ── 盖尔森基欣矿工槽初始化（P70）── */
    if (clubId === schId()) {
      const se = ensureSch(d);
      if (se.joinSeason == null) {
        se.joinSeason = d.season;
        se.entry = (window.Youth ? Youth.entryOf(d) : ((d.player && d.player.age < 24) ? "youth" : "star"));
        se.midJoin = !!(d.history && d.history.pastClubs && d.history.pastClubs.length);
        se.prevClubs = (d.history && d.history.pastClubs ? d.history.pastClubs.slice() : []);
        if (se.midJoin) queueS(se, "sch_mid1");
      }
      if (se.joinSeason != null && seenS(se, "sch_look5a") && !seenS(se, "sch_look5b")) queueS(se, "sch_look5b");
      if (se.joinSeason != null) {
        if (d.season >= 2016) se.snDep = true;   // 萨内斯 2016 夏真实→棉都蓝月
        if (d.season >= 2018) se.gkDep = true;   // 格雷茨坎 2018 夏真实→慕城红星
      }
      // 大逃亡（2017 夏五人真实出走）+ 袖标（赫韦德塞 2017 走后传承）：需至少共事一季
      if (se.joinSeason != null && se.joinSeason <= 2016 && d.season === 2017) {
        queueS(se, "sch_exo1");
        queueS(se, "sch_cap");
      }
    }
    /* ── 门兴槽初始化（P70）── */
    if (clubId === bmgId()) {
      const be = ensureBmg(d);
      if (be.joinSeason == null) {
        be.joinSeason = d.season;
        be.entry = (window.Youth ? Youth.entryOf(d) : ((d.player && d.player.age < 24) ? "youth" : "star"));
        be.midJoin = !!(d.history && d.history.pastClubs && d.history.pastClubs.length);
        be.prevClubs = (d.history && d.history.pastClubs ? d.history.pastClubs.slice() : []);
        if (be.midJoin) queueBmg(be, "bmg_mid1");
      }
      if (be.joinSeason != null && seenB2(be, "bmg_st5a") && !seenB2(be, "bmg_st5b")) queueBmg(be, "bmg_st5b");
      if (be.joinSeason != null && seenB2(be, "bmg_inj1") && !seenB2(be, "bmg_inj2") && stActive(d, be)) queueBmg(be, "bmg_inj2");   // 复出之夜（inj1 后揭幕）
      if (be.joinSeason != null) {
        if (d.season >= 2016) be.xhDep = true;   // 扎坎 2016-05 真实→雾都火枪手
        if (d.season >= 2017) be.dahDep = true;  // 达胡德 2017 夏真实→多特蒙顿
        if (d.season >= 2023) { be.thDep = true; be.hfDep = true; be.somDep = true; }  // 图拉姆尔/霍夫曼/索默德 2023 真实离队
      }
      if (be.joinSeason != null && d.season === 2016) queueBmg(be, "bmg_cap");   // 扎坎走后施廷德厄真实接袖标
      if (be.joinSeason != null && d.season === 2019) queueBmg(be, "bmg_rose1"); // 罗塞 2019-07 真实上任
    }
    /* ── 慕城红星槽初始化（P72 主线）── */
    if (clubId === bayId()) {
      const be = ensureBay(d);
      if (be.joinSeason == null) {
        be.joinSeason = d.season;
        be.entry = (window.Youth ? Youth.entryOf(d) : ((d.player && d.player.age < 24) ? "youth" : "star"));
        be.midJoin = !!(d.history && d.history.pastClubs && d.history.pastClubs.length);
        be.prevClubs = (d.history && d.history.pastClubs ? d.history.pastClubs.slice() : []);
        if (be.midJoin) queueB(be, "bay_mid1");
        if (be.midJoin) queueB(be, "bay_mid3");
      }
      if (be.joinSeason != null && d.season >= MUE_DEP_Y) be.mueDep = true;   // 二娃 2025 夏真实告别
      if (be.joinSeason != null && seenB(be, "bay_m1") && !seenB(be, "bay_pl1")) queueB(be, "bay_pl1");    // Mia san mia 在幕一后揭幕
      if (be.joinSeason != null && seenB(be, "bay_pl3") && !seenB(be, "bay_pl4")) queueB(be, "bay_pl4");   // 慕城的雨（低谷后）
      if (be.joinSeason != null && seenB(be, "bay_pl5") && !seenB(be, "bay_pl7")) queueB(be, "bay_pl7");   // 玛丽恩广场（首冠后）
      if (be.joinSeason != null && seenB(be, "bay_m4") && !seenB(be, "bay_pl8")) queueB(be, "bay_pl8");    // 赛前夜的安静（重大战前）
      if (be.joinSeason != null && seenB(be, "bay_dep4") && !seenB(be, "bay_pl9")) queueB(be, "bay_pl9");  // 离队期袖标
    }
    if (clubId === livId()) onInitSeasonLiv(state);
    if (clubId === totId()) onInitSeasonTot(state);
    if (clubId === mciId()) onInitSeasonMci(state);
    if (clubId === mnuId()) onInitSeasonMnu(state);
    if (clubId === arsId()) onInitSeasonArs(state);
    if (clubId === cheId()) onInitSeasonChe(state);
    injectSquad(d, ce);
    migrateSquads(d);   // P70：盖尔森基欣矿工/门兴真实转会日历（在多特蒙顿注入之后 append 共享目的地）
    /* P70 修复：轮次每季从 1 重计，lastClubRound 跨季累计会永久卡死轮次窗口卡（如门兴 som1 冬窗 17~20 轮）——季初统一重置 */
    ce.lastClubRound = -99;
    if (d.clubEvents.bayern) d.clubEvents.bayern.lastClubRound = -99;
    if (d.clubEvents.schalke) d.clubEvents.schalke.lastClubRound = -99;
    if (d.clubEvents.gladbach) d.clubEvents.gladbach.lastClubRound = -99;
    if (d.clubEvents.liverpool) d.clubEvents.liverpool.lastClubRound = -99;
    if (d.clubEvents.tottenham) d.clubEvents.tottenham.lastClubRound = -99;
    if (d.clubEvents.mancity) d.clubEvents.mancity.lastClubRound = -99;
    if (d.clubEvents.manutd) d.clubEvents.manutd.lastClubRound = -99;
    if (d.clubEvents.arsenal) d.clubEvents.arsenal.lastClubRound = -99;
    if (d.clubEvents.chelsea) d.clubEvents.chelsea.lastClubRound = -99;
    if (!isDor) return;
    // 新季队列：复出之夜（inj1 后揭幕）/ 袖标（farewell 后首日）
    if (seen(ce, "dor_inj1") && !seen(ce, "dor_inj2")) queue(ce, "dor_inj2");
    if (seen(ce, "dor_farewell") && !seen(ce, "dor_cap")) queue(ce, "dor_cap");
    if (seen(ce, "dor_farewell") && !seen(ce, "dor_num11")) queue(ce, "dor_num11");   // 42 传承三部曲收尾
  }

  /* ── 赛季结算挂钩（season.finishSeason 在 d.season++ 前调用）── */
  function onSeasonEnd(state) {
    const d = state.data;
    const ce = ensure(d);
    const tn = tenure(d, ce);
    // 累计效力数据（里程碑锚点）
    const ss = d.seasonStats || {};
    ce.clubGoals += (ss.goals || 0);
    ce.clubApps += (ss.apps || 0);
    const table = (window.SeasonSystem ? SeasonSystem.standings(state) : []) || [];
    const myRank = table.findIndex(t => t.id === d.clubId) + 1 || ce.lastRank || 99;
    const cupChamp = !!(d.cup && d.cup.alive === "champion");
    const ccChamp = !!(d.cc && d.cc.alive === "champion");
    const lgChamp = myRank === 1;
    const titleNow = lgChamp || cupChamp || ccChamp;

    /* 1) 小火箭告别（唯一泪点；年龄判定，短线玩家约第 6 季）*/
    if (atDor(d) && !ce.farewellDone && reusAge(d, ce) >= REUS_FAREWELL_AGE) {
      ce.farewellDone = true;
      queue(ce, "dor_farewell");
    }
    /* 2) 遗憾线结局（按真实赛果二选一；允许失败）*/
    if (ce.reg1Armed) {
      ce.reg1Armed = false;
      if (atDor(d)) ce.pending.push(lgChamp ? "dor_reg1_win" : "dor_reg1_lose");   // 遗憾豁免：结局卡不设 seen
    }
    if (ce.reg2Armed) {
      ce.reg2Armed = false;
      if (atDor(d)) ce.pending.push(ccChamp ? "dor_reg2_win" : "dor_reg2_lose");
    }
    /* 2b) 渣叔回访结局（欧冠决赛 vs 利武浦；真实 2018 负/2019 胜，赛果开放）*/
    if (ce.kpR1Armed) {
      ce.kpR1Armed = false;
      if (atDor(d)) ce.pending.push(ccChamp ? "dor_kpR1win" : "dor_kpR1lose");   // 遗憾豁免：结局卡不设 seen
    }
    /* 3) 冠军卡（同季多冠按优先级只出一张：supercup > champ1 > repeat > cup1）*/
    if (atDor(d) && titleNow) {
      if (!ce.firstTitle) { ce.firstTitle = true; queue(ce, "dor_supercup"); }        // 效力期首冠=开门红
      else if (lgChamp && !seen(ce, "dor_champ1") && (seen(ce, "dor_act3") || seen(ce, "dor_reg1_win") || seen(ce, "dor_reg1_lose"))) queue(ce, "dor_champ1");
      else if (lgChamp && ce.lastChamp && seen(ce, "dor_champ1") && !seen(ce, "dor_repeat")) queue(ce, "dor_repeat");
      else if (cupChamp && !seen(ce, "dor_cup1")) queue(ce, "dor_cup1");
      else if (cupChamp && sjActive(ce) && !seen(ce, "dor_sj7")) queue(ce, "dor_sj7"); // 排队 cup1 > sj7
      else if (!seen(ce, "dor_cup1") && (lgChamp || ccChamp)) { /* 联赛/洲际年 cup1 让位 */ }
    }
    /* 4) 德国足球先生：单季 ≥2 冠且含联赛（重塑荣光 → 小火箭当选）*/
    if (atDor(d) && reusAlive(d, ce)) {
      let n = 0; if (lgChamp) n++; if (cupChamp) n++; if (ccChamp) n++;
      if (lgChamp && n >= 2 && !seen(ce, "dor_potg")) queue(ce, "dor_potg");
    }
    /* 5) 幕三：亚军夜 */
    if (atDor(d) && myRank === 2 && !seen(ce, "dor_act3") && reusAlive(d, ce)) queue(ce, "dor_act3");
    /* 6) 离队告知（官宣前私下告知；真实时间锚：三连 tenure 1 末（2016 春）/ 桑乔 tenure 6 末 / 哈兰登 tenure 7 末）*/
    if (atDor(d) && sjActive(ce) && tn === SJ_DEP_T - 1 && !seen(ce, "dor_sj4")) queue(ce, "dor_sj4");
    if (atDor(d) && hlActive(ce) && tn === HL_DEP_T - 1 && !seen(ce, "dor_hl4")) queue(ce, "dor_hl4");
    for (const p of TRIO) {
      if (atDor(d) && !ce[p.key + "Dep"] && tn === p.depT - 1 && !seen(ce, "dor_" + p.key + "4")) queue(ce, "dor_" + p.key + "4");
    }
    /* 6b) 教练线：渣叔 2015-04 官宣离任（tenure 0 末）→ 挽留（仅当 S1 夺冠，一次性；选择在 kp3b 卡内写回 kloppStay）
       挽留成功 → 留任一季，tenure 1 末走 kp4stay 告别（无第二次邀请）；不挽留/未夺冠 → 史实路径 kp4 */
    if (atDor(d) && !seen(ce, "dor_kp3") && tn === 0 && seen(ce, "dor_kp1")) {
      queue(ce, "dor_kp3");
      if (titleNow && !ce.kloppAsked) { ce.kloppAsked = true; queue(ce, "dor_kp3b"); }
      else queue(ce, "dor_kp4");
    }
    if (atDor(d) && ce.kloppStay && !ce.kloppStayDone && tn === 1) {
      ce.kloppStayDone = true;
      queue(ce, "dor_kp4stay");   // 借来的一年到账：S2 末告别（若 S1 已 queue 过会被 seen 去重）
    }
    /* 6c) 渣叔回访兜底：tenure ≥4 从未在欧冠决赛重逢 → 新闻里读到他登顶 */
    if (atDor(d) && tn >= 4 && !seen(ce, "dor_kpR1pre") && !seen(ce, "dor_kpR2")) queue(ce, "dor_kpR2");
    /* 6d) 慕城红星槽结算（P71 教练组 + P72 主线：冠军比较制/armed 双结局/年轮/G40——铁律：实际赛果驱动，卡文无序数）*/
    if (atBay(d)) {
      const be = ensureBay(d);
      be.clubGoals += (ss.goals || 0); be.clubApps += (ss.apps || 0);
      const tnB = tenureB(d, be);
      /* armed 结局（赛果开放，win/lose 分流；结局卡豁免 seen）*/
      if (be.pep3Armed) { be.pep3Armed = false; be.pending.push(cupChamp ? "bay_pep3win" : "bay_pep3lose"); }
      if (be.rb3Armed) { be.rb3Armed = false; be.pending.push(cupChamp ? "bay_rb3win" : "bay_rb3lose"); }
      if (be.r1Armed) { be.r1Armed = false; be.pending.push(ccChamp ? "bay_r1win" : "bay_r1lose"); }
      if (be.r2Armed) { be.r2Armed = false; be.pending.push(ccChamp ? "bay_r2win" : "bay_r2lose"); }
      if (be.r3Armed) { be.r3Armed = false; be.pending.push(ccChamp ? "bay_r3win" : "bay_r3lose"); }
      /* 教练组时点（P71）*/
      if (d.season === 2017 && seenB(be, "bay_hey1")) queueB(be, "bay_hey2");
      if (d.season === 2020 && seenB(be, "bay_flick1")) queueB(be, "bay_flick2");
      /* 冠军比较制组（实际夺冠才触发；卡文无序数）*/
      if (titleNow) {
        if (!be.firstTitle) { be.firstTitle = true; queueB(be, "bay_supercup"); queueB(be, "bay_pl5"); }
        else if (cupChamp && !seenB(be, "bay_supercup")) queueB(be, "bay_supercup");
        if (lgChamp && cupChamp && !seenB(be, "bay_double")) queueB(be, "bay_double");
      }
      if (ccChamp && !seenB(be, "bay_ccnight")) queueB(be, "bay_ccnight");
      if (lgChamp) {
        let nB = 0; if (lgChamp) nB++; if (cupChamp) nB++; if (ccChamp) nB++;
        if (nB >= 2 && !seenB(be, "bay_potg")) queueB(be, "bay_potg");
      }
      /* m4b 最后一块拼图（ccChamp 窗口 2019-2021 需 m4 已看——铁律：实际洲际夺冠才出）*/
      if (ccChamp && d.season >= 2019 && d.season <= 2021 && seenB(be, "bay_m4") && !seenB(be, "bay_m4b")) queueB(be, "bay_m4b");
      /* G40 第四十一个（玩家单季 41 球比较制；轰炸机 40 球为 2014 前固定历史）*/
      if ((ss.goals || 0) >= 41 && !seenB(be, "bay_g40")) queueB(be, "bay_g40");
      /* 年轮（tenure 锚；y10 与 m5 同年 2024——m5 氛围池季中出，y10 季末出）*/
      if (!seenB(be, "bay_y3") && tnB === 3) queueB(be, "bay_y3");
      if (!seenB(be, "bay_y6") && tnB === 6) queueB(be, "bay_y6");
      if (!seenB(be, "bay_y10") && tnB === 10) queueB(be, "bay_y10");
    }
    /* 7) 里程碑 / 年轮（全部生涯一次）*/
    if (atDor(d)) {
      if (ce.clubApps >= 250 && !seen(ce, "dor_appear")) queue(ce, "dor_appear");
      if (ce.clubGoals >= 120 && !seen(ce, "dor_record")) queue(ce, "dor_record");
      if ((ss.goals || 0) >= 20 && reusAlive(d, ce) && !seen(ce, "dor_boot")) queue(ce, "dor_boot");
      if ((ss.goals || 0) >= 15 && myRank <= 2 && reusAlive(d, ce) && !seen(ce, "dor_trio")) queue(ce, "dor_trio");
      if (((ss.goals || 0) >= 25 || (d.fame || 0) >= 800) && reusAlive(d, ce) && !seen(ce, "dor_fifacover")) queue(ce, "dor_fifacover");
      if (reusAlive(d, ce) && !seen(ce, "dor_y3") && tn === 3) queue(ce, "dor_y3");
      if (reusAlive(d, ce) && !seen(ce, "dor_y6") && tn === 6) queue(ce, "dor_y6");
      if (reusAlive(d, ce) && !seen(ce, "dor_y10") && tn === 10) queue(ce, "dor_y10");
      if (reusAlive(d, ce) && !seen(ce, "dor_y13") && tn === 13) queue(ce, "dor_y13");
      if (reusAlive(d, ce) && !seen(ce, "dor_legacy") && tn >= 4) queue(ce, "dor_legacy");
      if (reusAlive(d, ce) && tn >= 1 && (d.player && d.player.age >= 34) && !seen(ce, "dor_act5c")) queue(ce, "dor_act5c"); // 退役季雕像
    }
    /* ── 盖尔森基欣矿工结算（P70）── */
    if (atSch(d)) {
      const se = ensureSch(d);
      se.clubGoals += (ss.goals || 0); se.clubApps += (ss.apps || 0);
      const tnS = tenureSch(d, se);
      /* 迪马特奥线：2014-15 季末（2015-05 真实下课）→ 挽留分支（仅当 S1 夺冠） */
      if (d.season === 2014 && seenS(se, "sch_dc1") && !seenS(se, "sch_dc3")) {
        queueS(se, "sch_dc3");
        if (titleNow && !se.dcAsked) { se.dcAsked = true; queueS(se, "sch_dc3b"); }
        else queueS(se, "sch_dc4");
      }
      if (se.dcStay && !se.dcStayDone && d.season === 2015) { se.dcStayDone = true; queueS(se, "sch_dc4stay"); }
      /* 遗憾结局（armed 豁免） */
      if (se.reg1Armed) { se.reg1Armed = false; se.pending.push(lgChamp ? "sch_reg1_win" : "sch_reg1_lose"); }
      if (se.reg2Armed) { se.reg2Armed = false; se.pending.push(ccChamp ? "sch_reg2_win" : "sch_reg2_lose"); }
      /* 冠军卡（supercup > champ1 > repeat > cup1）+ 红黑大球场（洲际）+ 奖盘进城 */
      if (titleNow) {
        if (!se.firstTitle) { se.firstTitle = true; queueS(se, "sch_supercup"); }
        else if (lgChamp && !seenS(se, "sch_champ1") && (seenS(se, "sch_look3") || seenS(se, "sch_reg1_win") || seenS(se, "sch_reg1_lose"))) queueS(se, "sch_champ1");
        else if (lgChamp && se.lastChamp && seenS(se, "sch_champ1") && !seenS(se, "sch_repeat")) queueS(se, "sch_repeat");
        else if (cupChamp && !seenS(se, "sch_cup1")) queueS(se, "sch_cup1");
      }
      if (ccChamp && !seenS(se, "sch_milan")) queueS(se, "sch_milan");
      if (lgChamp) {
        let n = 0; if (lgChamp) n++; if (cupChamp) n++; if (ccChamp) n++;
        if (n >= 2 && !seenS(se, "sch_potg")) queueS(se, "sch_potg");
      }
      if (myRank === 2 && !seenS(se, "sch_look3")) queueS(se, "sch_look3");
      if (myRank === 2 && seenS(se, "sch_ted1") && !seenS(se, "sch_ted3")) queueS(se, "sch_ted3");
      /* 离队告知（官宣前私下告知；真实时点：萨内斯 2015 季末（2016 夏→棉都蓝月）/ 格雷茨坎 2017 季末（2018 夏自由身→慕城红星）） */
      if (d.season === 2015 && !se.snDep && !seenS(se, "sch_sn4")) queueS(se, "sch_sn4");
      if (d.season === 2017 && !se.gkDep && !seenS(se, "sch_gk4")) queueS(se, "sch_gk4");
      /* 里程碑 / 年轮 */
      if (se.clubApps >= 250 && !seenS(se, "sch_appear")) queueS(se, "sch_appear");
      if (se.clubGoals >= 120 && !seenS(se, "sch_record")) queueS(se, "sch_record");
      if ((ss.goals || 0) >= 15 && myRank <= 2 && !seenS(se, "sch_trio")) queueS(se, "sch_trio");
      if (!seenS(se, "sch_y3") && tnS === 3) queueS(se, "sch_y3");
      if (!seenS(se, "sch_y6") && tnS === 6) queueS(se, "sch_y6");
      if (!seenS(se, "sch_y10") && tnS === 10) queueS(se, "sch_y10");
      if (!seenS(se, "sch_y13") && tnS === 13) queueS(se, "sch_y13");
      /* 退役季（Glück auf 关灯） */
      if (tnS >= 1 && d.player && d.player.age >= 34 && !seenS(se, "sch_look5c")) queueS(se, "sch_look5c");
      /* 保级惊魂结局（需先触发 surv1/surv2 武装） */
      const survArmed = seenS(se, "sch_surv1") || seenS(se, "sch_surv2");
      if (survArmed && myRank >= 15 && myRank <= 16 && !seenS(se, "sch_surv3")) queueS(se, "sch_surv3");
      if (survArmed && myRank >= 17 && !seenS(se, "sch_surv4")) queueS(se, "sch_surv4");
      se.lastRank = myRank; se.lastChamp = lgChamp;
    }
    /* ── 门兴结算（P70）── */
    if (atBmg(d)) {
      const be = ensureBmg(d);
      be.clubGoals += (ss.goals || 0); be.clubApps += (ss.apps || 0);
      const tnB = tenureBmg(d, be);
      const stAct = stActive(d, be);
      if (d.season === 2014 && titleNow) be.fvS1Title = true;   // S1 夺冠 → 法夫尔被拒挽留卡解锁
      /* 遗憾结局（armed 豁免） */
      if (be.reg1Armed) { be.reg1Armed = false; be.pending.push(lgChamp ? "bmg_reg1_win" : "bmg_reg1_lose"); }
      if (be.reg2Armed) { be.reg2Armed = false; be.pending.push(ccChamp ? "bmg_reg2_win" : "bmg_reg2_lose"); }
      /* 冠军卡（supercup > champ1 > repeat > cup1）+ 两座杯子的城（洲际） */
      if (titleNow) {
        if (!be.firstTitle) { be.firstTitle = true; queueBmg(be, "bmg_supercup"); }
        else if (lgChamp && !seenB2(be, "bmg_champ1") && (seenB2(be, "bmg_st3") || seenB2(be, "bmg_reg1_win") || seenB2(be, "bmg_reg1_lose"))) queueBmg(be, "bmg_champ1");
        else if (lgChamp && be.lastChamp && seenB2(be, "bmg_champ1") && !seenB2(be, "bmg_repeat")) queueBmg(be, "bmg_repeat");
        else if (cupChamp && !seenB2(be, "bmg_cup1")) queueBmg(be, "bmg_cup1");
      }
      if (ccChamp && !seenB2(be, "bmg_uefa")) queueBmg(be, "bmg_uefa");
      if (lgChamp) {
        let n = 0; if (lgChamp) n++; if (cupChamp) n++; if (ccChamp) n++;
        if (n >= 2 && stAct && !seenB2(be, "bmg_potg")) queueBmg(be, "bmg_potg");
      }
      if (myRank === 2 && stAct && !seenB2(be, "bmg_st3")) queueBmg(be, "bmg_st3");
      /* 真实事件锚：2015 第三名（扎坎组 xh1 先行 > 法夫尔 fv2）/ 达胡德 2017 / 图拉姆尔·霍夫曼·告别 2022 季末 */
      if (d.season === 2014 && myRank === 3) {
        if (!seenB2(be, "bmg_xh1")) queueBmg(be, "bmg_xh1");
        if (!seenB2(be, "bmg_fv2")) queueBmg(be, "bmg_fv2");
      }
      if (d.season === 2016 && !be.dahDep && !seenB2(be, "bmg_dah2")) queueBmg(be, "bmg_dah2");
      if (d.season === 2015 && !be.xhDep && !seenB2(be, "bmg_xh3")) queueBmg(be, "bmg_xh3");   // 扎坎 2016-05 真实官宣（雾都的电话）
      if (d.season === 2022 && !be.thDep && !seenB2(be, "bmg_th4")) queueBmg(be, "bmg_th4");
      if (d.season === 2022 && !be.hfDep && !seenB2(be, "bmg_hf4")) queueBmg(be, "bmg_hf4");
      if (d.season === 2022 && stAct) { be.farewellDone = true; queueBmg(be, "bmg_farewell"); }   // 施廷德厄 2023 夏真实告别（唯一泪点）
      /* 里程碑 / 年轮 / 采访（stActive 守卫：施廷德厄 2022 后 y10/y13/legacy 静默过期，L6 已知边界） */
      if (be.clubApps >= 250 && !seenB2(be, "bmg_appear")) queueBmg(be, "bmg_appear");
      if (be.clubGoals >= 120 && !seenB2(be, "bmg_record")) queueBmg(be, "bmg_record");
      if ((ss.goals || 0) >= 15 && myRank <= 2 && !seenB2(be, "bmg_trio")) queueBmg(be, "bmg_trio");
      if (stAct && !seenB2(be, "bmg_y3") && tnB === 3) queueBmg(be, "bmg_y3");
      if (stAct && !seenB2(be, "bmg_y6") && tnB === 6) queueBmg(be, "bmg_y6");
      if (stAct && !seenB2(be, "bmg_y10") && tnB === 10) queueBmg(be, "bmg_y10");
      if (stAct && !seenB2(be, "bmg_y13") && tnB === 13) queueBmg(be, "bmg_y13");
      if (stAct && !seenB2(be, "bmg_legacy") && tnB >= 4) queueBmg(be, "bmg_legacy");
      if (stAct && !seenB2(be, "bmg_aca4") && tnB >= 8) queueBmg(be, "bmg_aca4");
      /* 退役季（二十分钟的绝杀） */
      if (stAct && tnB >= 1 && d.player && d.player.age >= 34 && !seenB2(be, "bmg_st5c")) queueBmg(be, "bmg_st5c");
      be.lastRank = myRank; be.lastChamp = lgChamp;
    }
    if (atLiv(d)) onSeasonEndLiv(state, { myRank, lgChamp, cupChamp, ccChamp, titleNow, ss });
    if (atTot(d)) onSeasonEndTot(state, { myRank, lgChamp, cupChamp, ccChamp, titleNow, ss });
    if (atMci(d)) onSeasonEndMci(state, { myRank, lgChamp, cupChamp, ccChamp, titleNow, ss });
    if (atMnu(d)) onSeasonEndMnu(state, { myRank, lgChamp, cupChamp, ccChamp, titleNow, ss });
    if (atArs(d)) onSeasonEndArs(state, { myRank, lgChamp, cupChamp, ccChamp, titleNow, ss });
    if (atChe(d)) onSeasonEndChe(state, { myRank, lgChamp, cupChamp, ccChamp, titleNow, ss });
    ce.lastRank = myRank;
    ce.lastChamp = lgChamp;
  }

  /* ── 比赛结果挂钩（live + 静默共用；返回卡或 null）──
     同条件排队铁律：act2a > milestone > nightgoal > kissbadge > hl6 > sj2 > hl2 > act2b */
  const MATCH_SEQ = [
    { id: "dor_act2a", ok: (d, ce, ctx) => reusAlive(d, ce) && (ctx.userGoals || 0) >= 1 },
    { id: "dor_milestone", ok: (d, ce, ctx) => reusAlive(d, ce) && (ctx.userGoals || 0) >= 1 },
    { id: "dor_nightgoal", ok: (d, ce, ctx) => reusAlive(d, ce) && ctx.res === "win" && (ctx.userGoals || 0) >= 1 && ctx.isDerby },  // P67 修复：isRuhr 从未赋值 → 用引擎通用德比判定
    { id: "dor_kissbadge", ok: (d, ce, ctx) => reusAlive(d, ce) && ctx.res === "win" && (ctx.margin || 0) >= 3 },
    { id: "dor_hl6", ok: (d, ce, ctx) => hlActive(ce) && ctx.res === "win" && (ctx.margin || 0) >= 3 },  // 引擎无 NPC 单场进球字段：以大胜代偿（样板偏差已注）
    { id: "dor_sj2", ok: (d, ce, ctx) => sjActive(ce) && (ctx.userGoals || 0) >= 1 },
    { id: "dor_hl2", ok: (d, ce, ctx) => hlActive(ce) && (ctx.userGoals || 0) >= 1 },
    { id: "dor_act2b", ok: (d, ce, ctx) => reusAlive(d, ce) && ce.lowStreak >= 2 },
  ];
  /* 氛围卡（上下文无关；match 流里插播，全卡生涯一次）*/
  const AMBIENT = [
    "dor_wcwound1",
    "dor_kp1", "dor_kp2",
    "dor_hum1", "dor_hum2", "dor_hum3",
    "dor_mkh1", "dor_mkh2", "dor_mkh3",
    "dor_gun1", "dor_gun2", "dor_gun3",
    "dor_inj1", "dor_game", "dor_prank", "dor_bbq", "dor_car", "dor_fankid", "dor_birthday",
    "dor_charity", "dor_pilot", "dor_goetze", "dor_sj6", "dor_hl1", "dor_hl3",
    "dor_sj1", "dor_sj3", "dor_tifo", "dor_history1", "dor_history3",
    "dor_city1", "dor_city2", "dor_city3", "dor_history2",
    "dor_mid3",
  ];
  const AMBIENT_GUARD = {
    dor_wcwound1: (d, ce) => reusAlive(d, ce) && tenure(d, ce) === 0,   // 开档季：2014-06 世界杯之伤只隔两个月
    dor_kp1: (d, ce) => reusAlive(d, ce) && tenure(d, ce) === 0 && !seen(ce, "dor_kp3"),   // 渣叔在任（S1）
    dor_kp2: (d, ce) => reusAlive(d, ce) && tenure(d, ce) === 0 && seen(ce, "dor_kp1") && !seen(ce, "dor_kp3"),
    dor_goetze: (d, ce) => reusAlive(d, ce) && tenure(d, ce) >= 2,      // 格策诺 2016-07 真实回归（tenure 2）
    dor_history2: (d, ce) => reusAlive(d, ce) && d.ccQual === "top",
    dor_history3: (d, ce) => reusAlive(d, ce) && tenure(d, ce) >= 2,
    dor_city3: (d, ce) => tenure(d, ce) >= 3,
    dor_mid3: (d, ce) => reusAlive(d, ce) && tenure(d, ce) >= 3,   // 深夜的你为什么来（小火箭在场）
    dor_bbq: (d, ce) => tenure(d, ce) >= 1,
    dor_car: (d, ce) => tenure(d, ce) >= 1,
    dor_fankid: (d, ce) => tenure(d, ce) >= 1,
    dor_birthday: (d, ce) => reusAlive(d, ce) && tenure(d, ce) >= 1,
    dor_charity: (d, ce) => reusAlive(d, ce) && seen(ce, "dor_act1"),
    dor_pilot: (d, ce) => reusAlive(d, ce) && tenure(d, ce) >= 1,
    dor_tifo: (d, ce) => reusAlive(d, ce) && tenure(d, ce) >= 2,
    dor_sj6: (d, ce) => sjActive(ce),
    dor_inj1: (d, ce) => reusAlive(d, ce) && tenure(d, ce) >= 1,
    dor_hl1: (d, ce) => hlActive(ce),
    dor_hl3: (d, ce) => hlActive(ce),
    dor_sj1: (d, ce) => sjActive(ce),
    dor_sj3: (d, ce) => sjActive(ce),
    dor_hum1: (d, ce) => !ce.humDep, dor_hum2: (d, ce) => !ce.humDep, dor_hum3: (d, ce) => !ce.humDep,
    dor_mkh1: (d, ce) => !ce.mkhDep, dor_mkh2: (d, ce) => !ce.mkhDep, dor_mkh3: (d, ce) => !ce.mkhDep,
    dor_gun1: (d, ce) => !ce.gunDep, dor_gun2: (d, ce) => !ce.gunDep, dor_gun3: (d, ce) => !ce.gunDep,
  };
  function showC(state, id, ctx, onDone) {
    const c = card(id);
    if (!c) { onDone && onDone(); return false; }
    const d0 = state.data;
    const ce = atSch(d0) ? ensureSch(d0) : atBmg(d0) ? ensureBmg(d0) : atBay(d0) ? ensureBay(d0) : atLiv(d0) ? ensureLiv(d0) : atTot(d0) ? ensureTot(d0) : atMci(d0) ? ensureMci(d0) : atMnu(d0) ? ensureMnu(d0) : atArs(d0) ? ensureArs(d0) : atChe(d0) ? ensureChe(d0) : ensure(d0);
    if (!ce.seen[id]) { mark(ce, id); }  // pick 时已标记；此处兜底（直接 show 场景）
    const cc = Object.assign({}, c);
    if (cc.bodyStar && ce.entry === "star") cc.body = cc.bodyStar;   // 二点十 身份档
    if (cc.options) cc.options = cc.options.map(o => ({ text: o.text, response: o.response, fx: o.fx, badge: o.badge }));
    try {
      window.EventCards._showCard(state, cc, { ctx: Object.assign({ d: state.data }, ctx) }, () => {
        const self = cc.options && cc.options.find(o => o.badge);
        if (self && self.badge) {
          const dd = state.data;
          dd.trophies = dd.trophies || [];
          dd.trophies.push({ name: self.badge, icon: "", season: dd.season });
          State.save();
        }
        onDone && onDone();
      });
      return true;
    } catch (e) { return false; }
  }
  /** 静默批次/赛后卡链槽位（里程碑 > 回响 > 俱乐部线 > 主线 中的俱乐部档）*/
  /* 慕城红星氛围卡链（无 MATCH_SEQ：教练组全走氛围槽，间隔 6 轮）*/
  function pickSilent(state, ctxs) {
    const d = state.data;
    if (atSch(d)) return pickSilentSch(state, ctxs);
    if (atBmg(d)) return pickSilentBmg(state, ctxs);
    if (atBay(d)) return pickSilentBay(state, ctxs);
    if (atLiv(d)) return pickSilentLiv(state, ctxs);
    if (atTot(d)) return pickSilentTot(state, ctxs);
    if (atMci(d)) return pickSilentMci(state, ctxs);
    if (atMnu(d)) return pickSilentMnu(state, ctxs);
    if (atArs(d)) return pickSilentArs(state, ctxs);
    if (atChe(d)) return pickSilentChe(state, ctxs);
    if (!atDor(d) || d.retired) return null;
    const ce = ensure(d);
    const list = (ctxs || []).filter(Boolean);
    for (const raw of list) {
      const ctx = Object.assign({ d }, raw);
      const round = ctx.round || Math.round((d.dayIndex || 0) / 8);
      // 伤停不弹俱乐部卡
      if ((d.injuryDays || 0) > 0) break;
      for (const m of MATCH_SEQ) {
        if (seen(ce, m.id)) continue;
        let ok = false;
        try { ok = m.ok(d, ce, ctx); } catch (e) { ok = false; }
        if (ok) { mark(ce, m.id); ce.lastClubRound = round; return card(m.id); }  // 同条件排队：不受间隔限制
      }
      if (!gapOk(d, ce, round, 6)) break;   // 间隔只压氛围槽
      for (const id of AMBIENT) {
        if (seen(ce, id)) continue;
        const g = AMBIENT_GUARD[id];
        if (g) { try { if (!g(d, ce)) continue; } catch (e) { continue; } }
        mark(ce, id); ce.lastClubRound = round; return card(id);
      }
      break;
    }
    return null;
  }
  /** 静默上下文记档（低谷连击等）*/
  function noteSilent(state, ctxs) {
    const d = state.data;
    const slot = atSch(d) ? ensureSch(d) : atBmg(d) ? ensureBmg(d) : atBay(d) ? ensureBay(d) : atLiv(d) ? ensureLiv(d) : atTot(d) ? ensureTot(d) : atMci(d) ? ensureMci(d) : atMnu(d) ? ensureMnu(d) : atArs(d) ? ensureArs(d) : ensure(d);
    const last = (ctxs && ctxs.length) ? ctxs[ctxs.length - 1] : null;
    if (last && last.rating != null) slot.lowStreak = last.rating < 6.0 ? (slot.lowStreak + 1) : 0;
  }

  /* ── 赛前挂钩（showPre 优先于通用赛前池）── */
  function pickPre(state, fixture) {
    const d = state.data;
    if (atSch(d) && !d.retired) return pickPreSch(state, fixture);
    if (atBmg(d) && !d.retired) return pickPreBmg(state, fixture);
    if (atLiv(d) && !d.retired) return pickPreLiv(state, fixture);
    if (atTot(d) && !d.retired) return pickPreTot(state, fixture);
    if (atMci(d) && !d.retired) return pickPreMci(state, fixture);
    if (atMnu(d) && !d.retired) return pickPreMnu(state, fixture);
    if (atArs(d) && !d.retired) return pickPreArs(state, fixture);
    if (atChe(d) && !d.retired) return pickPreChe(state, fixture);
    if (atBay(d) && !d.retired) {
      const be = ensureBay(d);
      if ((d.injuryDays || 0) > 0) return null;
      const fB = fixture && (fixture.match || fixture);
      const oppB = fB ? ((fB.home && fB.home.id) === d.clubId ? (fB.away && fB.away.name) : (fB.home && fB.home.name)) : "";
      // 柏凌告别战（2016 真实届 = 赛季 2015 的德国杯决赛）：armed 静默，结局卡季末结算
      if (fixture.type === "cup" && fixture.stage === 3 && d.season === 2015) be.pep3Armed = true;
      // 罗贝里告别（2018 柏凌杯决赛真实谢幕届）：armed 静默，赛果开放双结局
      if (fixture.type === "cup" && fixture.stage === 3 && d.season === 2018) be.rb3Armed = true;
      /* 遗憾线 armed（cc_ko 决赛 + yearOf + 对手字面量；模拟碰不到则沉默——卡文不写比分，赛果开放）*/
      if (fixture.type === "cc_ko" && fixture.stage === 3) {
        if (d.season === 2015 && oppB.indexOf("巴塞") >= 0 && !be.r1Armed) { be.r1Armed = true; return card("bay_r1pre"); }
        if (d.season === 2017 && oppB.indexOf("曼德里白舰") >= 0 && !be.r2Armed) { be.r2Armed = true; return card("bay_r2pre"); }
        if (d.season === 2023 && oppB.indexOf("曼德里白舰") >= 0 && !be.r3Armed) { be.r3Armed = true; return card("bay_r3pre"); }
      }
      /* 德比组（对手字面量排队）*/
      const seqB = [];
      if (oppB && oppB.indexOf("多特蒙顿") >= 0) seqB.push("bay_derby3");
      if (oppB && oppB.indexOf("多特蒙顿") >= 0 && seenB(be, "bay_derby3")) seqB.push("bay_derby4");
      if (oppB && oppB.indexOf("1860") >= 0 && d.season <= 2016) seqB.push("bay_derby1");
      if (oppB && oppB.indexOf("莱比锡") >= 0) seqB.push("bay_derby2");
      if (oppB && be.prevClubs && be.prevClubs.indexOf(oppB) >= 0) seqB.push("bay_mid2");
      for (const id of seqB) {
        if (seenB(be, id)) continue;
        markB(be, id); be.lastClubRound = fixture.round || Math.round((d.dayIndex || 0) / 8); return card(id);
      }
      return null;
    }
    if (!atDor(d) || d.retired) return null;
    const ce = ensure(d);
    if ((d.injuryDays || 0) > 0) return null;
    const f = fixture && (fixture.match || fixture);
    const oppName = f ? ((f.home && f.home.id) === d.clubId ? (f.away && f.away.name) : (f.home && f.home.name)) : "";
    const round = fixture.round || Math.round((d.dayIndex || 0) / 8);
    // 遗憾一：末轮争冠（距榜首 ≤2 分）
    if (fixture.type === "league") {
      const rounds = Math.max(0, ...d.fixtures.filter(x => x.type === "league").map(x => x.round || 0));
      if (fixture.round === rounds && !ce.reg1Armed) {
        const table = (window.SeasonSystem ? SeasonSystem.standings(state) : []) || [];
        const me = table.find(t => t.id === d.clubId);
        const top = table[0];
        if (me && top && top.pts - me.pts <= 2) {
          ce.reg1Armed = true;
          return card("dor_reg1_pre");   // 遗憾豁免：随赛果可重复（armed 每季一次）
        }
      }
    }
    // 渣叔回访：欧冠决赛对手=利武浦（真实 2018 基铺 / 2019 曼德里；赛果开放双结局）。
    // 放在遗憾二之前：更具体的卡优先；reg2 保持每届决赛可重复的 armed 模式。
    if (fixture.type === "cc_ko" && fixture.stage === 3 && oppName === "利武浦" && !ce.kpR1Armed && !seen(ce, "dor_kpR1pre")) {
      ce.kpR1Armed = true;
      mark(ce, "dor_kpR1pre");
      ce.lastClubRound = round;
      return card("dor_kpR1pre");
    }
    // 遗憾二：洲际杯决赛
    if (fixture.type === "cc_ko" && fixture.stage === 3 && !ce.reg2Armed) {
      ce.reg2Armed = true;
      return card("dor_reg2_pre");     // 遗憾豁免：随赛果可重复
    }
    // 赛前卡全部为生涯一次叙事卡，不受氛围间隔闸限制（触发唯一性即节流）
    const seq = [];
    if (oppName && oppName.indexOf("盖尔森基欣矿工") >= 0) { seq.push("dor_derby", "dor_enemy2"); }   // 排队：derby > enemy2
    if (oppName && oppName.indexOf("慕城红星") >= 0) seq.push("dor_enemy1");
    if (oppName && ce.prevClubs && ce.prevClubs.indexOf(oppName) >= 0) seq.push("dor_mid2");
    if (oppName && ce.haalandDep && seen(ce, "dor_hl4") && !seen(ce, "dor_hl5") && oppName === ce.hlClub) seq.push("dor_hl5"); // P63 重逢：相视一笑
    if (oppName && ce.sanchoDep && seen(ce, "dor_sj4") && !seen(ce, "dor_sj5") && oppName === ce.sjClub) seq.push("dor_sj5");
    // 三连出走重逢（真实去向：胡梅尔塞→慕城红星 / 姆希塔良尔→棉都红魔 / 京多安诺→棉都蓝月）
    for (const p of TRIO) {
      if (oppName && ce[p.key + "Dep"] && seen(ce, "dor_" + p.key + "4") && !seen(ce, "dor_" + p.key + "5") && oppName === p.to) seq.push("dor_" + p.key + "5");
    }
    for (const id of seq) {
      if (seen(ce, id)) continue;
      if ((id === "dor_derby" || id === "dor_enemy2" || id === "dor_enemy1" || id === "dor_mid2") && !reusAlive(d, ce)) continue;
      mark(ce, id);
      ce.lastClubRound = round;
      return card(id);
    }
    return null;
  }

  /* ── 赛后挂钩（afterResult：优于通用 post 池）── */
  function onResult(state, ctx, onDone) {
    const d = state.data;
    if (atSch(d) && !d.retired) {
      const se = ensureSch(d);
      if (ctx && ctx.rating != null) se.lowStreak = ctx.rating < 6.0 ? (se.lowStreak + 1) : 0;
      const c = pickSilentSch(state, [ctx]);
      if (!c) return false;
      return showC(state, c.id, ctx || {}, onDone);
    }
    if (atBmg(d) && !d.retired) {
      const be = ensureBmg(d);
      if (ctx && ctx.rating != null) be.lowStreak = ctx.rating < 6.0 ? (be.lowStreak + 1) : 0;
      const c = pickSilentBmg(state, [ctx]);
      if (!c) return false;
      return showC(state, c.id, ctx || {}, onDone);
    }
    if (atBay(d) && !d.retired) {
      const c = pickSilentBay(state, [ctx]);
      if (!c) return false;
      return showC(state, c.id, ctx || {}, onDone);
    }
    if (atLiv(d) && !d.retired) {
      const le = ensureLiv(d);
      if (ctx && ctx.rating != null) le.lowStreak = ctx.rating < 6.0 ? (le.lowStreak + 1) : 0;
      const c = pickSilentLiv(state, [ctx]);
      if (!c) return false;
      return showC(state, c.id, ctx || {}, onDone);
    }
    if (atTot(d) && !d.retired) {
      const te = ensureTot(d);
      if (ctx && ctx.rating != null) te.lowStreak = ctx.rating < 6.0 ? (te.lowStreak + 1) : 0;
      const c = pickSilentTot(state, [ctx]);
      if (!c) return false;
      return showC(state, c.id, ctx || {}, onDone);
    }
    if (atMci(d) && !d.retired) {
      const me = ensureMci(d);
      if (ctx && ctx.rating != null) me.lowStreak = ctx.rating < 6.0 ? (me.lowStreak + 1) : 0;
      const c = pickSilentMci(state, [ctx]);
      if (!c) return false;
      return showC(state, c.id, ctx || {}, onDone);
    }
    if (atMnu(d) && !d.retired) {
      const nu = ensureMnu(d);
      if (ctx && ctx.rating != null) nu.lowStreak = ctx.rating < 6.0 ? (nu.lowStreak + 1) : 0;
      const c = pickSilentMnu(state, [ctx]);
      if (!c) return false;
      return showC(state, c.id, ctx || {}, onDone);
    }
    if (atArs(d) && !d.retired) {
      const ae = ensureArs(d);
      if (ctx && ctx.rating != null) ae.lowStreak = ctx.rating < 6.0 ? (ae.lowStreak + 1) : 0;
      const c = pickSilentArs(state, [ctx]);
      if (!c) return false;
      return showC(state, c.id, ctx || {}, onDone);
    }
    if (atChe(d) && !d.retired) {
      const che = ensureChe(d);
      if (ctx && ctx.rating != null) che.lowStreak = ctx.rating < 6.0 ? (che.lowStreak + 1) : 0;
      const c = pickSilentChe(state, [ctx]);
      if (!c) return false;
      return showC(state, c.id, ctx || {}, onDone);
    }
    if (!atDor(d) || d.retired) return false;
    const ce = ensure(d);
    if (ctx && ctx.rating != null) ce.lowStreak = ctx.rating < 6.0 ? (ce.lowStreak + 1) : 0;
    const c = pickSilent(state, [ctx]);
    if (!c) return false;
    return showC(state, c.id, ctx || {}, onDone);
  }

  /* ── 幕一：出场 ≥3 后入队（多特蒙顿 act1 / 盖尔森基欣矿工 look1 / 门兴 st1；门兴需施廷德厄 2015 已到队）── */
  function tryAct1(state, onDone) {
    const d = state.data;
    if (((d.seasonStats && d.seasonStats.apps) || 0) < 3) return false;
    if (atDor(d)) {
      const ce = ensure(d);
      if (seen(ce, "dor_act1")) return false;
      return showC(state, "dor_act1", {}, onDone);
    }
    if (atSch(d)) {
      const se = ensureSch(d);
      if (seenS(se, "sch_look1")) return false;
      return showC(state, "sch_look1", {}, onDone);
    }
    if (atBmg(d)) {
      const be = ensureBmg(d);
      if (seenB2(be, "bmg_st1") || d.season < STINDL_JOIN_Y) return false;
      return showC(state, "bmg_st1", {}, onDone);
    }
    if (atBay(d)) {
      const be = ensureBay(d);
      if (seenB(be, "bay_m1")) return false;
      return showC(state, "bay_m1", {}, onDone);   // P72 幕一：空间解读者
    }
    if (atLiv(d)) {
      const le = ensureLiv(d);
      if (seenL(le, "liv_g1")) return false;
      return showC(state, "liv_g1", {}, onDone);
    }
    if (atTot(d)) {
      const te = ensureTot(d);
      if (seenT(te, "tot_g1")) return false;
      return showC(state, "tot_g1", {}, onDone);
    }
    if (atMci(d)) {
      const me = ensureMci(d);
      if (seenM(me, "mci_c1")) return false;
      return showC(state, "mci_c1", {}, onDone);
    }
    if (atMnu(d)) {
      const nu = ensureMnu(d);
      if (seenN(nu, "mnu_g1")) return false;
      return showC(state, "mnu_g1", {}, onDone);
    }
    if (atArs(d)) {
      const ae = ensureArs(d);
      if (seenA(ae, "ars_g1")) return false;
      return showC(state, "ars_g1", {}, onDone);
    }
    if (atChe(d)) {
      const ce2 = ensureChe(d);
      if (seenChe(ce2, "che_g1")) return false;
      return showC(state, "che_g1", {}, onDone);
    }
    return false;
  }

  /* ── 待展示队列（Hub.enter 消费，一次一张）── */
  function consumePending(state) {
    const d = state.data;
    if (atBay(d)) {
      const be = ensureBay(d);
      if (be.pending && be.pending.length) {
        const id = be.pending.shift();
        if (!card(id)) return consumePending(state);
        showC(state, id, {}, () => { State.save(); });
        return true;
      }
      return false;
    }
    if (atSch(d)) {
      const se = ensureSch(d);
      if (se.pending && se.pending.length) {
        const id = se.pending.shift();
        if (!card(id)) return consumePending(state);
        if (id === "sch_dc3b") return showDc3b(state);   // 挽留选择特化
        showC(state, id, {}, () => { State.save(); });
        return true;
      }
      return tryAct1(state);
    }
    if (atBmg(d)) {
      const be = ensureBmg(d);
      if (be.pending && be.pending.length) {
        const id = be.pending.shift();
        if (!card(id)) return consumePending(state);
        showC(state, id, {}, () => { State.save(); });
        return true;
      }
      return tryAct1(state);
    }
    if (atMnu(d)) {
      const nu = ensureMnu(d);
      if (nu.pending && nu.pending.length) {
        const id = nu.pending.shift();
        if (!card(id)) return consumePending(state);
        showC(state, id, {}, () => { State.save(); });
        return true;
      }
      return tryAct1(state);
    }
    if (atLiv(d)) {
      const le = ensureLiv(d);
      if (le.pending && le.pending.length) {
        const id = le.pending.shift();
        if (!card(id)) return consumePending(state);
        showC(state, id, {}, () => { State.save(); });
        return true;
      }
      return tryAct1(state);
    }
    if (atTot(d)) {
      const te = ensureTot(d);
      if (te.pending && te.pending.length) {
        const id = te.pending.shift();
        if (!card(id)) return consumePending(state);
        showC(state, id, {}, () => { State.save(); });
        return true;
      }
      return tryAct1(state);
    }
    if (atMci(d)) {
      const me = ensureMci(d);
      if (me.pending && me.pending.length) {
        const id = me.pending.shift();
        if (!card(id)) return consumePending(state);
        showC(state, id, {}, () => { State.save(); });
        return true;
      }
      return tryAct1(state);
    }
    if (atArs(d)) {
      const ae = ensureArs(d);
      if (ae.pending && ae.pending.length) {
        const id = ae.pending.shift();
        if (!card(id)) return consumePending(state);
        showC(state, id, {}, () => { State.save(); });
        return true;
      }
      return tryAct1(state);
    }
    if (atChe(d)) {
      const che = ensureChe(d);
      if (che.pending && che.pending.length) {
        const id = che.pending.shift();
        if (!card(id)) return consumePending(state);
        showC(state, id, {}, () => { State.save(); });
        return true;
      }
      return tryAct1(state);
    }
    const ce = ensure(d);
    if (!ce.pending || !ce.pending.length) {
      // 幕一延迟检查：出场数达标即弹（优先于其它队列）
      return tryAct1(state);
    }
    const id = ce.pending.shift();
    const c = card(id);
    if (!c) return consumePending(state);
    if (id === "dor_kp3b") return showKp3b(state);   // 挽留选择特化
    showC(state, id, {}, () => { State.save(); });
    return true;
  }

  /* ── forever（一生一队；转会窗终点开关；P70 起多俱乐部）── */
  function foreverOn(d) {
    const dce = d && d.clubEvents;
    return !!((dce.dortmund && dce.dortmund.forever) || (dce.schalke && dce.schalke.forever) || (dce.gladbach && dce.gladbach.forever) || (dce.liverpool && dce.liverpool.forever) || (dce.tottenham && dce.tottenham.forever) || (dce.mancity && dce.mancity.forever) || (dce.manutd && dce.manutd.forever) || (dce.arsenal && dce.arsenal.forever) || (dce.chelsea && dce.chelsea.forever));
  }
  function canForever(d) {
    if (atLiv(d)) {
      const le = ensureLiv(d);
      return atLiv(d) && !le.forever && seenL(le, "liv_g1") && tenureLiv(d, le) >= 2;
    }
    if (atTot(d)) {
      const te = ensureTot(d);
      return atTot(d) && !te.forever && seenT(te, "tot_g1") && tenureTot(d, te) >= 2;
    }
    if (atMci(d)) {
      const me = ensureMci(d);
      return atMci(d) && !me.forever && seenM(me, "mci_c1") && tenureMci(d, me) >= 2;
    }
    if (atMnu(d)) {
      const nu = ensureMnu(d);
      return atMnu(d) && !nu.forever && seenN(nu, "mnu_g1") && tenureMnu(d, nu) >= 2;
    }
    if (atArs(d)) {
      const ae = ensureArs(d);
      return atArs(d) && !ae.forever && seenA(ae, "ars_g1") && tenureArs(d, ae) >= 2;
    }
    if (atChe(d)) {
      const che = ensureChe(d);
      return atChe(d) && !che.forever && seenChe(che, "che_g1") && tenureChe(d, che) >= 2;
    }
    if (atSch(d)) {
      const se = ensureSch(d);
      return atSch(d) && !se.forever && seenS(se, "sch_look1") && tenureSch(d, se) >= 2;
    }
    if (atBmg(d)) {
      const be = ensureBmg(d);
      return atBmg(d) && !be.forever && seenB2(be, "bmg_st1") && tenureBmg(d, be) >= 2;
    }
    const ce = ensure(d);
    return atDor(d) && !ce.forever && !ce.farewellDone && seen(ce, "dor_act1") && tenure(d, ce) >= 2;
  }
  function foreverLabel(d) {
    if (atLiv(d)) return "向香克利之门宣誓（永不离队）";
    if (atTot(d)) return "向南看台的公鸡宣誓（永不离队）";
    if (atMci(d)) return "向基石墙宣誓（永不离队）";
    if (atMnu(d)) return "向标准之墙宣誓（永不离队）";
    if (atArs(d)) return "向炮塔宣誓（永不离队）";
    if (atChe(d)) return "向私宅的门岗宣誓（永不离队）";
    if (atSch(d)) return "向北看台宣誓（永不离队）";
    if (atBmg(d)) return "向西看台宣誓（永不离队）";
    if (atDor(d)) return "向黄墙宣誓（永不离队）";
    /* ★ P97：CE1 名单之外的球队（意甲五强 / 法甲三线 / 未来新增）走**中性**文案。
       原实现把多特蒙顿的"黄墙"当兜底 → 会对都林斑马/米岚蓝黑玩家说「向黄墙宣誓」——
       正是项目铁律里禁止的「假设玩家出身」。中性版既不假设，也不编造球场地标。 */
    return "向看台宣誓（永不离队）";
  }
  function showForever(state, rerender) {
    const d = state.data;
    const isSch = atSch(d), isBmg = atBmg(d), isLiv = atLiv(d), isTot = atTot(d), isMci = atMci(d), isMnu = atMnu(d), isArs = atArs(d), isChe = atChe(d);
    const ce = isSch ? ensureSch(d) : isBmg ? ensureBmg(d) : isLiv ? ensureLiv(d) : isTot ? ensureTot(d) : isMci ? ensureMci(d) : isMnu ? ensureMnu(d) : isArs ? ensureArs(d) : isChe ? ensureChe(d) : ensure(d);
    if (!canForever(d)) return false;
    ce.forever = true;
    const cid = isSch ? "sch_forever" : isBmg ? "bmg_forever" : isLiv ? "liv_z4" : isTot ? "tot_forever" : isMci ? "mci_z3" : isMnu ? "mnu_forever" : isArs ? "ars_forever" : isChe ? "che_forever" : "dor_forever";
    const headTxt = isSch ? "盖尔森基欣矿工 · 宣誓" : isBmg ? "门兴格拉德堡 · 宣誓" : isLiv ? "利武浦 · 宣誓" : isTot ? "雾都白百合 · 宣誓" : isMci ? "棉都蓝月 · 宣誓" : isMnu ? "棉都红魔 · 宣誓" : isArs ? "雾都火枪手 · 宣誓" : isChe ? "雾都蓝狮 · 宣誓" : "多特蒙顿 · 宣誓";
    const btnId = isSch ? "sch-forever-ok" : isBmg ? "bmg-forever-ok" : isLiv ? "liv-forever-ok" : isTot ? "tot-forever-ok" : isMci ? "mci-forever-ok" : isMnu ? "mnu-forever-ok" : isArs ? "ars-forever-ok" : isChe ? "che-forever-ok" : "dor-forever-ok";
    d.trophies = d.trophies || [];
    d.trophies.push({ name: "一生一队", icon: "", season: d.season });
    mark(ce, cid);
    const c = Object.assign({}, card(cid) || { title: "一生一队", body: "" });
    const _san = (window.EventCards && EventCards.sanitizeCardHtml) ? EventCards.sanitizeCardHtml : function (s) { return s; };   // ★ P232：标签白名单（防御式引用）
    const html = '<div class="ec-card">' +
      (window.EventCards && EventCards.cardHeadHtml ? EventCards.cardHeadHtml(headTxt) : "") +
      '<div class="ec-art" style="' + ((window.ArtSprite && ArtSprite.style)
        ? ArtSprite.style(c.art || cid)
        : "background-image:url(" + (window.EventCards ? EventCards.artUrl({ art: c.art }) : (/^[a-z0-9_]{1,40}$/i.test(cid) ? "assets/comic/ec_" + cid + ".webp" : "assets/comic/ec_goal.webp")) + ")") + '"></div>' +
      '<div class="ec-title">' + _san(String(c.title || "")) + "</div>" +
      '<div class="ec-body">' + _san(String(c.body || "")) + "</div>" +
      '<div class="ec-opts"><button class="btn btn-primary ec-opt" id="' + btnId + '">从此，这里就是终点 ▸</button></div></div>';
    window.CardHost.show(html, { dismissable: false });
    const b = document.querySelector("#" + btnId);
    if (b) b.onclick = () => { window.CardHost.close(); State.save(); rerender && rerender(); };
    return true;
  }

  /* ── 挽留链第 2 轮特化（多特蒙顿 act4a 小火箭的咖啡 / 盖尔森基欣矿工 look4a 看台的挽留 / 门兴 st4a 队长的问话）── */
  function retentionOverride(state, done) {
    const d = state.data;
    /* 盖尔森基欣矿工：看台的挽留（选项 0 续约 2 年 / 选项 1 冻结雪藏线） */
    if (atSch(d)) {
      const se = ensureSch(d);
      if (!seenS(se, "sch_look1") || seenS(se, "sch_look4a")) return false;
      markS(se, "sch_look4a");
      const c = Object.assign({}, card("sch_look4a"));
      window.EventCards._showCard(state, c, { ctx: { d } }, () => {});
      setTimeout(() => {
        const btns = document.querySelectorAll(".ec-opt");
        btns.forEach((btn, i) => {
          btn.onclick = () => {
            const T = window.Transfer;
            const t = T && T.ensure ? T.ensure(d) : (d.transfer = d.transfer || {});
            if (i === 0) {
              const nw = Math.min(window.Career ? Career.WAGE_CAP : 6e6, Math.round((d.contract.wage || 3000) * 1.25));
              d.contract = { years: 2, wage: nw };
              t.retention = 0; t.seasonEndOffers = []; t.seasonEndMeta = null;
              State.save(); window.CardHost.close();
              done && done("你留下了。当晚北看台把那首歌又唱了一遍。（续约 2 年）");
            } else {
              t.retention = 0;
              window.CardHost.close();
              T.startFrozen(state, "拒绝了看台的挽留");
            }
          };
        });
      }, 0);
      return true;
    }
    /* 门兴：队长的问话 */
    if (atBmg(d)) {
      const be = ensureBmg(d);
      if (!stActive(d, be) || !seenB2(be, "bmg_st1") || seenB2(be, "bmg_st4a")) return false;
      markB2(be, "bmg_st4a");
      const c = Object.assign({}, card("bmg_st4a"));
      window.EventCards._showCard(state, c, { ctx: { d } }, () => {});
      setTimeout(() => {
        const btns = document.querySelectorAll(".ec-opt");
        btns.forEach((btn, i) => {
          btn.onclick = () => {
            const T = window.Transfer;
            const t = T && T.ensure ? T.ensure(d) : (d.transfer = d.transfer || {});
            if (i === 0) {
              const nw = Math.min(window.Career ? Career.WAGE_CAP : 6e6, Math.round((d.contract.wage || 3000) * 1.25));
              d.contract = { years: 2, wage: nw };
              t.retention = 0; t.seasonEndOffers = []; t.seasonEndMeta = null;
              State.save(); window.CardHost.close();
              done && done("你留下了。他只说了一句：欢迎回家。（续约 2 年）");
            } else {
              t.retention = 0;
              window.CardHost.close();
              T.startFrozen(state, "拒绝了队长的挽留");
            }
          };
        });
      }, 0);
      return true;
    }
    const d2 = state.data;
    const ce = ensure(d2);
    if (!atDor(d2) || !seen(ce, "dor_act1") || seen(ce, "dor_act4a") || !reusAlive(d2, ce)) return false;
    mark(ce, "dor_act4a");
    const c = Object.assign({}, card("dor_act4a"));
    const T = window.Transfer;
    window.EventCards._showCard(state, c, { ctx: { d } }, () => {});
    // _showCard 用 options 渲染按钮但回调在选后触发——此处改挂自定义行为：
    // 选项 0 = 留下（续约 2 年），选项 1 = 坚持离开（走第三轮 → 豪门雪藏）
    setTimeout(() => {
      const btns = document.querySelectorAll(".ec-opt");
      btns.forEach((btn, i) => {
        btn.onclick = () => {
          const t = T && T.ensure ? T.ensure(d) : (d.transfer = d.transfer || {});
          if (i === 0) {
            const nw = Math.min(window.Career ? Career.WAGE_CAP : 6e6, Math.round((d.contract.wage || 3000) * 1.25));
            d.contract = { years: 2, wage: nw };
            t.retention = 0; t.seasonEndOffers = []; t.seasonEndMeta = null;
            State.save(); window.CardHost.close();
            done && done("你留下了。小火箭只回了一个字：\u201c好。\u201d（续约 2 年）");
          } else {
            t.retention = 0;
            window.CardHost.close();
            T.startFrozen(state, "拒绝了小火箭的挽留");
          }
        };
      });
    }, 0);
    return true;
  }

  /* ── 雪藏挂钩（startFrozen 后排队：多特蒙顿 act4b 字条 / 盖尔森基欣矿工 look4b 横幅 / 门兴 st4b 箭头纸）── */
  function onFrozen(state) {
    const d = state.data;
    const ce = ensure(d);
    if (atDor(d) && seen(ce, "dor_act1") && !seen(ce, "dor_act4b") && reusAlive(d, ce)) queue(ce, "dor_act4b");
    if (atSch(d)) {
      const se = ensureSch(d);
      if (seenS(se, "sch_look1") && !seenS(se, "sch_look4b")) queueS(se, "sch_look4b");
    }
    if (atBmg(d)) {
      const be = ensureBmg(d);
      if (stActive(d, be) && seenB2(be, "bmg_st1") && !seenB2(be, "bmg_st4b")) queueBmg(be, "bmg_st4b");
    }
  }
  /* ── 离队挂钩（applyOffer 接受报价时）── */
  function onLeave(state, fromClubName) {
    const d = state.data;
    const ce = ensure(d);
    if (fromClubName === DOR_NAME && seen(ce, "dor_act1") && !seen(ce, "dor_act5a")) queue(ce, "dor_act5a");
    if (fromClubName === SCH_NAME) {
      const se = ensureSch(d);
      if (seenS(se, "sch_look1") && !seenS(se, "sch_look5a")) queueS(se, "sch_look5a");
    }
    if (fromClubName === BMG_NAME) {
      const be = ensureBmg(d);
      if (seenB2(be, "bmg_st1") && !seenB2(be, "bmg_st5a")) queueBmg(be, "bmg_st5a");
    }
  }

  window.ClubEvents = {
    ensure, onInitSeason, onSeasonEnd, pickSilent, noteSilent, pickPre, onResult,
    consumePending, foreverOn, canForever, showForever, retentionOverride, onFrozen, onLeave,
    atDor, reusAlive: d => { const ce = ensure(d); return reusAlive(d, ce); },
    atBay, ensureBay,
    atSch, ensureSch, atBmg, ensureBmg, atLiv, ensureLiv, atTot, ensureTot, atMci, ensureMci, atMnu, ensureMnu, atArs, ensureArs, arsId, atChe, ensureChe, cheId, foreverLabel,
    /* ★ P97：`ars.js` 的"圣托特纳姆日"判定一直在调 `window.ClubEvents.totId()`
       （带守卫 → 恒为 undefined → **静默退化**为每次全量扫描 `LD()` 找"雾都白百合"）。
       同类的 `arsId` / `cheId` 早就导出了，唯独 `totId` 漏了 —— 补上，
       让守卫生效并省掉每季一次的整表扫描。 */
    totId,
    _debug: { tenure, reusAge, card, tenureSch, tenureBmg, stActive },
  };
})();
