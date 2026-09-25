/* ============================================================================
   club/tot.js — 雾都白百合槽 · P94a 从 club_events.js 迁出
   自足性：只依赖 club/_shared.js；顶层**只定义、不调用**，
   因此加载顺序不影响行为（调用发生在 club_events.js 的钩子运行期）。
   ============================================================================ */
(function (root) {
  "use strict";
  const REG = root.__ClubReg;
  const S = REG.shared;
  const card = S.card, seen = S.seen, tenure = S.tenure, gapOk = S.gapOk;
  const teamInLD = S.teamInLD, pushUnique = S.pushUnique;
  const destRebuild = S.destRebuild, destAppend = S.destAppend, _baseCache = S.baseCache;

  /* ── TOT 雾都白百合第十一槽（P71；90 卡；绝对赛季年锚 d.season；无 coach_trust）──
     三条人物主线：洛利 l1-l9（t0-t9）/凯恩德 ke1-ke11（t0-t9）/亚洲一哥 s1-s10（t1-t11）；
     波切蒂诺 p1-p7（t0-t5）+ 后波帅流水席 m1-m4；搬家三幕 ho1-ho4；
     特化：reg2=2016 争冠失败 / ke5=2019 欧冠决赛负（reg3 兜底）/ reg1=2015 杯决赛负 /
     s8=2025 欧联夺冠（gl1 兜底）/ l6+ke9=2023 一夏双告别 / s9=2025 末告别。
     真实日历：亚洲一哥 2015 到港（勒沃库申）；大圣 2020-21 回归租借；
     凯恩德+洛利 2023 末告别（2024 起缺席→凯恩德注入慕城红星）；亚洲一哥 2025 末告别（2026 起缺席）；
     埃里克森斯/维尔通亨诺 2020 起缺席；拉梅兰 2021 起缺席 */
  const TOT_NAME = "雾都白百合";
  let _totId = null;
  function totId() {
    if (_totId) return _totId;
    if (!window.LD) return null;
    for (const [, lg] of Object.entries(window.LD())) {
      for (const t of lg.teams) if (t.name === TOT_NAME) { _totId = t.id; return _totId; }
    }
    return null;
  }
  const atTot = d => d && d.clubId === totId();
  function ensureTot(d) {
    d.clubEvents = d.clubEvents || {};
    const te = d.clubEvents.tottenham = d.clubEvents.tottenham || {
      joinSeason: null, entry: null, midJoin: false, prevClubs: [],
      seen: {}, pending: [], lowStreak: 0, lastClubRound: -99,
      clubGoals: 0, clubApps: 0, lastRank: 0, lastChamp: false, firstTitle: false,
      reg1Armed: false, reg2Armed: false, reg3Armed: false,
      kaneDep: false, lorDep: false, sonDep: false, eriDep: false, vertDep: false, lamDep: false,
      forever: false,
    };
    return te;
  }
  const seenT = (te, id) => !!te.seen[id];
  const markT = (te, id) => { te.seen[id] = true; };
  function queueT(te, id) { if (!seenT(te, id)) { te.pending.push(id); markT(te, id); } }
  function tenureTot(d, te) { return te.joinSeason == null ? 0 : (d.season - te.joinSeason); }

  /* 比赛槽（孙凯连线 > 教学片） */
  const TOT_MATCH_SEQ = [
    { id: "tot_s4", ok: (d, te, ctx) => !te.kaneDep && !te.sonDep && (ctx.userGoals || 0) >= 1 },
    { id: "tot_ke3", ok: (d, te, ctx) => !te.kaneDep && (ctx.userGoals || 0) >= 2 },
  ];
  const TOT_AMBIENT = [
    "tot_g1", "tot_g2", "tot_g3", "tot_g4", "tot_g5",
    "tot_ke1", "tot_ke2", "tot_l1",
    "tot_s1", "tot_s2",
    "tot_p1", "tot_p2",
    "tot_l2", "tot_p3", "tot_ho1",
    "tot_ho2", "tot_l3", "tot_ke4",
    "tot_l4", "tot_ke6", "tot_p4", "tot_p5", "tot_p6",
    "tot_ho3", "tot_gl3", "tot_p7", "tot_m2",
    "tot_l5", "tot_m3", "tot_s5",
    "tot_m4", "tot_ke7", "tot_s6", "tot_ke8",
    "tot_ho4", "tot_l7", "tot_c3",
    "tot_ke10", "tot_s7", "tot_l8",
    "tot_s10", "tot_l9",
    "tot_r1", "tot_r2", "tot_r3", "tot_r4", "tot_r5", "tot_r6",
    "tot_c1", "tot_c2", "tot_c4", "tot_c5", "tot_c6",
    "tot_x1", "tot_x2", "tot_x3", "tot_x4", "tot_x5", "tot_x6", "tot_x7",
    "tot_reg4", "tot_reg5", "tot_reg6", "tot_reg7", "tot_reg8",
    "tot_gl5", "tot_gl6",
    "tot_y1", "tot_y2", "tot_y3", "tot_z1", "tot_z2", "tot_z3",
    "tot_mid2", "tot_mid3",
  ];
  const TOT_GUARDS = {
    tot_mid2: (d, te) => te.midJoin && tenureTot(d, te) >= 1,
    tot_mid3: (d, te) => te.midJoin && tenureTot(d, te) >= 2,
    tot_g1: (d, te) => tenureTot(d, te) >= 0,
    tot_g2: (d, te) => d.season <= 2019,
    tot_g3: (d, te) => !te.kaneDep,
    tot_g4: (d, te) => !te.lorDep && d.season <= 2018,
    tot_g5: (d, te) => tenureTot(d, te) >= 0,
    tot_ke1: d => d.season === 2014,
    tot_ke2: (d, te) => !te.kaneDep && tenureTot(d, te) >= 1,
    tot_l1: (d, te) => !te.lorDep,
    tot_s1: d => d.season === 2015,
    tot_s2: (d, te) => !te.sonDep,
    tot_p1: (d, te) => d.season <= 2015 && tenureTot(d, te) >= 0,
    tot_p2: d => d.season >= 2015 && d.season <= 2016,
    tot_l2: d => d.season === 2016,
    tot_p3: d => d.season === 2016,
    tot_ho1: (d, te) => d.season === 2016 && seenT(te, "tot_p3"),
    tot_ho2: d => d.season === 2017 || d.season === 2018,
    tot_l3: d => d.season === 2017 || d.season === 2018,
    tot_ke4: (d, te) => !te.kaneDep && d.season >= 2017,
    tot_l4: d => d.season >= 2019 && d.season <= 2023,
    tot_ke6: (d, te) => !te.kaneDep && d.season >= 2018 && d.season <= 2021,
    tot_p4: d => d.season === 2019 && d.season >= 2019,
    tot_p5: (d, te) => d.season === 2019 && tenureTot(d, te) >= 0,
    tot_p6: (d, te) => d.season === 2020 && seenT(te, "tot_p5"),
    tot_ho3: d => d.season === 2019,
    tot_gl3: (d, te) => d.season === 2019 && seenT(te, "tot_ho3"),
    tot_p7: (d, te) => d.season >= 2020 && seenT(te, "tot_p5"),
    tot_m2: (d, te) => d.season === 2021 && seenT(te, "tot_m1"),
    tot_l5: d => d.season === 2021,
    tot_m3: d => d.season >= 2021 && d.season <= 2023,
    tot_s5: (d, te) => !te.sonDep && d.season >= 2016,
    tot_m4: d => d.season >= 2023,
    tot_ke7: d => d.season === 2022,
    tot_s6: (d, te) => d.season === 2023 && te.kaneDep,
    tot_ke8: (d, te) => d.season === 2023 && !te.kaneDep,
    tot_ho4: d => d.season >= 2019,
    tot_l7: (d, te) => te.lorDep,
    tot_c3: (d, te) => tenureTot(d, te) >= 0,
    tot_ke10: (d, te) => te.kaneDep && seenT(te, "tot_ke9"),
    tot_s7: (d, te) => te.kaneDep && d.season >= 2023,
    tot_l8: (d, te) => te.lorDep && d.season >= 2025,
    tot_s10: (d, te) => te.sonDep && seenT(te, "tot_s9"),
    tot_l9: (d, te) => te.lorDep && d.season >= 2026,
    tot_r1: (d, te) => tenureTot(d, te) >= 0,
    tot_r2: (d, te) => tenureTot(d, te) >= 1,
    tot_r3: (d, te) => tenureTot(d, te) >= 1,
    tot_r4: d => d.season <= 2016,
    tot_r5: d => d.season >= 2020 && d.season <= 2021,
    tot_r6: (d, te) => tenureTot(d, te) >= 1,
    tot_c1: (d, te) => tenureTot(d, te) >= 0,
    tot_c2: (d, te) => !te.kaneDep,
    tot_c4: (d, te) => tenureTot(d, te) >= 0,
    tot_c5: d => d.season >= 2019,
    tot_c6: d => d.season >= 2020,
    tot_x1: (d, te) => !te.sonDep,
    tot_x2: (d, te) => !te.eriDep,
    tot_x3: d => d.season >= 2019,
    tot_x4: d => d.season <= 2016,
    tot_x5: d => d.season >= 2019,
    tot_x6: (d, te) => tenureTot(d, te) >= 0,
    tot_x7: (d, te) => tenureTot(d, te) >= 0,
    tot_reg4: (d, te) => d.season >= 2016,
    tot_reg5: (d, te) => d.season >= 2016,
    tot_reg6: (d, te) => !te.kaneDep && d.season >= 2017,
    tot_reg7: (d, te) => !te.kaneDep && d.season >= 2016,
    tot_reg8: (d, te) => tenureTot(d, te) >= 1,
    tot_gl5: (d, te) => d.season >= 2016,
    tot_gl6: (d, te) => d.season >= 2016,
    tot_y1: (d, te) => tenureTot(d, te) === 3,
    tot_y2: (d, te) => tenureTot(d, te) === 6,
    tot_y3: (d, te) => tenureTot(d, te) === 10,
    tot_z1: (d, te) => tenureTot(d, te) >= 2,
    tot_z2: (d, te) => tenureTot(d, te) >= 7,
    tot_z3: (d, te) => tenureTot(d, te) >= 9,
  };

  /* 阵容随真实日历迁移（凯恩德/洛利 2024 起缺席→慕城红星；亚洲一哥 2026 起缺席→洛山矶FC；
     埃里克森斯→米岚蓝黑；大圣 2020-21 回归租借注入） */
  function injectSquadTot(d) {
    const yr = d.season;
    const t = teamInLD(TOT_NAME);
    if (!t || !t.players) return;
    if (!_baseCache[TOT_NAME]) _baseCache[TOT_NAME] = t.players.slice();
    const grow = (base, y0) => base + Math.max(0, yr - y0);
    let arr = _baseCache[TOT_NAME].slice();
    const out = [];
    if (yr >= 2020) out.push("埃里克森斯", "维尔通亨诺");
    if (yr >= 2021) out.push("拉梅兰");
    if (yr >= 2024) out.push("凯恩德", "洛利");
    if (yr >= 2026) out.push("亚洲一哥");
    arr = arr.filter(p => out.indexOf(p[0]) < 0);
    const inc = [];
    if (yr >= 2015 && yr <= 2025) inc.push(["亚洲一哥", grow(22, 2015), "LW", "韩国", 84], ["阿尔德韦雷尔登", grow(26, 2015), "CB", "比利时", 81], ["万亚曼", grow(23, 2015), "CDM", "肯尼亚", 79], ["特里皮厄", grow(24, 2015), "RB", "英格兰", 79]);
    if (yr >= 2017 && yr <= 2022) inc.push(["达文森·桑切塞", grow(21, 2017), "CB", "哥伦比亚", 79]);
    if (yr === 2020 || yr === 2021) inc.push(["大圣", grow(31, 2020), "RW", "威尔士", 83], ["赫伊别尔", grow(25, 2020), "CDM", "丹麦", 80]);
    if (yr >= 2022) inc.push(["罗梅隆", grow(24, 2022), "CB", "阿根廷", 83], ["麦迪逊", grow(26, 2022), "CAM", "英格兰", 81]);
    if (yr >= 2023) inc.push(["范德文", grow(22, 2023), "CB", "荷兰", 80]);
    if (yr >= 2024) inc.push(["索兰克", grow(26, 2024), "ST", "英格兰", 79]);
    t.players = pushUnique(arr, inc);
    if (yr >= 2024) destAppend("慕城红星", [["凯恩德", grow(30, 2023), "ST", "英格兰", 89]]);
    if (yr >= 2020) destAppend("米岚蓝黑", [["埃里克森斯", grow(27, 2019), "CAM", "丹麦", 84]]);
    const lafc = teamInLD("洛山矶FC");
    if (lafc && lafc.players && yr >= 2024) destAppend("洛山矶FC", [["洛利", grow(36, 2023), "GK", "法国", 82]]);
    if (lafc && lafc.players && yr >= 2026) destAppend("洛山矶FC", [["亚洲一哥", grow(33, 2025), "LW", "韩国", 84]]);
  }

  function onInitSeasonTot(state) {
    const d = state.data;
    const te = ensureTot(d);
    if (te.joinSeason == null) {
      te.joinSeason = d.season;
      te.entry = (window.Youth ? Youth.entryOf(d) : ((d.player && d.player.age < 24) ? "youth" : "star"));
      te.midJoin = !!(d.history && d.history.pastClubs && d.history.pastClubs.length);
      te.prevClubs = (d.history && d.history.pastClubs ? d.history.pastClubs.slice() : []);
      if (te.midJoin) queueT(te, "tot_mid1");   // P78c：中途加入欢迎卡
    }
    if (d.season >= 2020) { te.eriDep = true; te.vertDep = true; }
    if (d.season >= 2021) te.lamDep = true;
    if (d.season >= 2024) { te.kaneDep = true; te.lorDep = true; }
    if (d.season >= 2026) te.sonDep = true;
    /* 日历队列（绝对年锚） */
    if (d.season === 2015 && te.joinSeason != null && te.joinSeason <= 2014) queueT(te, "tot_s1");
    if (d.season === 2017) queueT(te, "tot_ho2");
    if (d.season === 2019 && te.joinSeason != null) queueT(te, "tot_ho3");
    if (d.season === 2021 && te.joinSeason != null) queueT(te, "tot_m1");
    if (d.season === 2023) { queueT(te, "tot_ke8"); }
    injectSquadTot(d);
  }

  function onSeasonEndTot(state, x) {
    const d = state.data;
    const te = ensureTot(d);
    const ss = x.ss;
    te.clubGoals += (ss.goals || 0); te.clubApps += (ss.apps || 0);
    const tn = tenureTot(d, te);
    /* 告别（泪点各自 once；真实年锚） */
    if (d.season === 2023) {
      if (!seenT(te, "tot_l6")) queueT(te, "tot_l6");
      if (!seenT(te, "tot_ke9")) queueT(te, "tot_ke9");
    }
    if (d.season === 2025) { if (!seenT(te, "tot_s9")) queueT(te, "tot_s9"); }
    /* armed 分流（L13：特化卡只在真实年份吻合时触发，错位沉默） */
    if (te.reg1Armed) {
      te.reg1Armed = false;
      if (d.season === 2016 && !x.lgChamp && x.myRank != null && x.myRank <= 3) queueT(te, "tot_reg2");
    }
    const ccWinNow = te.reg2Armed && x.ccChamp;
    const ccLoseNow = te.reg2Armed && !x.ccChamp;
    te.reg2Armed = false;
    if (ccWinNow && d.season === 2025 && !seenT(te, "tot_s8")) { queueT(te, "tot_s8"); }
    else if (ccWinNow && !seenT(te, "tot_gl1")) { queueT(te, "tot_gl1"); }
    else if (ccLoseNow && d.season === 2019 && !seenT(te, "tot_ke5")) { queueT(te, "tot_ke5"); }
    if (te.reg3Armed) {
      te.reg3Armed = false;
      if (d.season === 2015 && !x.cupChamp && !seenT(te, "tot_reg1")) queueT(te, "tot_reg1");
    }
    /* 冠军卡：gl5(杯通用)>gl6(联赛通用) */
    const wasFirst = x.titleNow && !te.firstTitle;
    if (x.titleNow) te.firstTitle = true;
    if (x.titleNow && d.season !== 2025) {
      if (x.cupChamp && !seenT(te, "tot_gl5")) queueT(te, "tot_gl5");
      else if (x.lgChamp && !seenT(te, "tot_gl6")) queueT(te, "tot_gl6");
    }
    if (wasFirst && d.season !== 2025 && !seenT(te, "tot_gl5") && !seenT(te, "tot_gl6")) {
      /* 首冠无特卡（雾都白百合 2025 前无冠），由 gl5/gl6 覆盖；占位保持与利武浦 firstTitle 结构一致 */
    }
    /* 争冠亚军之秋（2017 亚军且排名压过雾都火枪手走 gl4；其余年亚军不特化） */
    if (x.myRank === 2 && d.season === 2017 && !seenT(te, "tot_gl4")) queueT(te, "tot_gl4");
    /* 年轮（tenure 相对） */
    if (!seenT(te, "tot_y1") && tn === 3) queueT(te, "tot_y1");
    if (!seenT(te, "tot_y2") && tn === 6) queueT(te, "tot_y2");
    if (!seenT(te, "tot_y3") && tn === 10) queueT(te, "tot_y3");
    te.lastRank = x.myRank; te.lastChamp = x.lgChamp;
  }

  function pickSilentTot(state, ctxs) {
    const d = state.data;
    if (d.retired) return null;
    const te = ensureTot(d);
    const list = (ctxs || []).filter(Boolean);
    for (const raw of list) {
      const ctx = Object.assign({ d }, raw);
      const round = ctx.round || Math.round((d.dayIndex || 0) / 8);
      if ((d.injuryDays || 0) > 0) break;
      for (const m of TOT_MATCH_SEQ) {
        if (seenT(te, m.id)) continue;
        let ok = false;
        try { ok = m.ok(d, te, ctx); } catch (e) { ok = false; }
        if (ok) { markT(te, m.id); te.lastClubRound = round; return card(m.id); }
      }
      if (!gapOk(d, te, round, 6)) break;
      for (const id of TOT_AMBIENT) {
        if (seenT(te, id)) continue;
        const g = TOT_GUARDS[id];
        if (g) { try { if (!g(d, te, ctx, state)) continue; } catch (e) { continue; } }
        markT(te, id); te.lastClubRound = round; return card(id);
      }
      break;
    }
    return null;
  }

  function pickPreTot(state, fixture) {
    const d = state.data;
    if (!atTot(d) || d.retired) return null;
    const te = ensureTot(d);
    if ((d.injuryDays || 0) > 0) return null;
    const f = fixture && (fixture.match || fixture);
    const oppName = f ? ((f.home && f.home.id) === d.clubId ? (f.away && f.away.name) : (f.home && f.home.name)) : "";
    const round = fixture.round || Math.round((d.dayIndex || 0) / 8);
    const isLastLgRound = fixture.type === "league" && fixture.round === Math.max(0, ...d.fixtures.filter(x => x.type === "league").map(x => x.round || 0));
    // 白鹿巷告别战（2016 末轮；ho1 球场视角优先）
    if (isLastLgRound && d.season === 2016 && !seenT(te, "tot_ho1")) {
      markT(te, "tot_ho1"); te.lastClubRound = round; return card("tot_ho1");
    }
    // armed 重逢：凯恩德随慕城红星回访 / 洛利随洛山矶FC 回访
    if (oppName === "慕城红星" && te.kaneDep && seenT(te, "tot_ke9") && !seenT(te, "tot_ke11")) {
      markT(te, "tot_ke11"); te.lastClubRound = round; return card("tot_ke11");
    }
    if (oppName === "洛山矶FC" && te.lorDep && !seenT(te, "tot_l8")) {
      markT(te, "tot_l8"); te.lastClubRound = round; return card("tot_l8");
    }
    // 波切蒂诺以客队教练回访（花都/雾都蓝狮）
    if ((oppName === "花都红蓝" || oppName === "雾都蓝狮") && te.pchSeen && !seenT(te, "tot_p7")) {
      markT(te, "tot_p7"); te.lastClubRound = round; return card("tot_p7");
    }
    // 北雾都德比（赛季内一次， ambient r1 之外的对位特写）
    if (oppName && oppName.indexOf("雾都火枪手") >= 0 && !seenT(te, "tot_r1")) {
      markT(te, "tot_r1"); te.lastClubRound = round; return card("tot_r1");
    }
    // armed（不 return 卡，settle 分流：L13）
    if (isLastLgRound && !te.reg1Armed) {
      const table = (window.SeasonSystem ? SeasonSystem.standings(state) : []) || [];
      const me = table.find(t2 => t2.id === d.clubId);
      const top = table[0];
      if (me && top && top.pts - me.pts <= 2) te.reg1Armed = true;
    }
    if (fixture.type === "cc_ko" && fixture.stage === 3 && !te.reg2Armed) te.reg2Armed = true;
    if (fixture.type === "cup" && fixture.stage === 3 && !te.reg3Armed) te.reg3Armed = true;
    return null;
  }

  /* ── 注册（装配层据此把符号解构回 club_events.js 的作用域）── */
  REG.push({
    key: "tot", name: "雾都白百合", order: 70,
    at: atTot, id: totId, ensure: ensureTot,
    sym: {
      TOT_NAME: TOT_NAME, totId: totId, atTot: atTot, ensureTot: ensureTot, seenT: seenT,
      markT: markT, queueT: queueT, tenureTot: tenureTot, TOT_MATCH_SEQ: TOT_MATCH_SEQ, TOT_AMBIENT: TOT_AMBIENT,
      TOT_GUARDS: TOT_GUARDS, injectSquadTot: injectSquadTot, onInitSeasonTot: onInitSeasonTot, onSeasonEndTot: onSeasonEndTot, pickSilentTot: pickSilentTot,
      pickPreTot: pickPreTot,
    },
    hooks: {
      onInitSeason: onInitSeasonTot, onSeasonEnd: onSeasonEndTot,
      pickSilent: pickSilentTot, pickPre: pickPreTot,
    },
  });
})(typeof window !== "undefined" ? window : global);
