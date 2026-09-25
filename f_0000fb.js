/* ============================================================================
   club/che.js — 雾都蓝狮槽 · P94a 从 club_events.js 迁出
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

  /* ════════ CHE 雾都蓝狮第十五槽（P71，93 卡，2014 真实口径）════════ */
  const CHE_NAME = "雾都蓝狮";
  let _cheId = null;
  function cheId() {
    if (_cheId) return _cheId;
    try {
      for (const [, lg] of Object.entries(window.LD())) {
        for (const t of lg.teams) if (t.name === CHE_NAME) { _cheId = t.id; return _cheId; }
      }
    } catch (e) { /* ignore */ }
    return null;
  }
  const atChe = d => d && d.clubId === cheId();
  function ensureChe(d) {
    d.clubEvents = d.clubEvents || {};
    const ce = d.clubEvents.chelsea = d.clubEvents.chelsea || {
      joinSeason: null, entry: null, midJoin: false, prevClubs: [],
      seen: {}, pending: [], lowStreak: 0, lastClubRound: -99,
      clubGoals: 0, clubApps: 0, lastRank: 0, lastChamp: false, firstTitle: false,
      reg2Armed: false, reg3Armed: false,
      drogbaDep: false, cechDep: false, cescDep: false, costaDep: false, terryDep: false,
      azarDep: false, wiliDep: false, girDep: false, lukaDep: false,
      forever: false,
    };
    return ce;
  }
  const seenChe = (ce, id) => !!ce.seen[id];
  const markChe = (ce, id) => { ce.seen[id] = true; };
  function queueChe(ce, id) { if (!seenChe(ce, id)) { ce.pending.push(id); markChe(ce, id); } }
  function tenureChe(d, ce) { return ce.joinSeason == null ? 0 : (d.season - ce.joinSeason); }

  /* 比赛槽（德比失利学费 / 国王最后的进球） */
  const CHE_MATCH_SEQ = [
    { id: "che_r6", ok: (d, ce, ctx) => ctx.isDerby && ctx.res === "loss" },
    { id: "che_d2", ok: (d, ce, ctx) => !ce.drogbaDep && ctx.res === "win" },
  ];
  const CHE_AMBIENT = [
    "che_g1", "che_g2", "che_g3", "che_g4", "che_g5",
    "che_h1", "che_h2", "che_m1", "che_c1", "che_x1",
    "che_c2", "che_c3", "che_c4", "che_q1", "che_d1",
    "che_te4", "che_d4", "che_x4", "che_h5", "che_co1",
    "che_te5", "che_h6", "che_c5", "che_co2", "che_co3",
    "che_q3", "che_q4", "che_q5", "che_x2", "che_x3", "che_x6",
    "che_m6", "che_f1", "che_f2", "che_q2", "che_co5",
    "che_f3", "che_q6", "che_e4", "che_co7", "che_reg4",
    "che_reg6", "che_reg7", "che_q7", "che_c6", "che_reg8",
    "che_e3", "che_x5", "che_z2", "che_z3",
  ];
  const CHE_GUARDS = {
    che_g1: (d, ce) => tenureChe(d, ce) >= 0,
    che_g2: (d, ce) => tenureChe(d, ce) >= 0,
    che_g3: (d, ce) => !ce.azarDep,
    che_g4: (d, ce) => !ce.drogbaDep,
    che_g5: (d, ce) => !ce.terryDep,
    che_h1: (d, ce) => !ce.azarDep && d.season <= 2018,
    che_h2: (d, ce) => !ce.azarDep && d.season <= 2018,
    che_m1: d => d.season <= 2015,
    che_c1: (d, ce) => tenureChe(d, ce) >= 0,
    che_x1: d => d.season <= 2015,
    che_c2: d => d.season <= 2016,
    che_c3: d => d.season <= 2016,
    che_c4: d => d.season <= 2016,
    che_q1: d => d.season <= 2018,
    che_d1: (d, ce) => d.season === 2014 && !ce.drogbaDep,
    che_te4: (d, ce) => d.season === 2016 && !ce.terryDep,
    che_d4: (d, ce) => d.season >= 2015 && d.season <= 2019,
    che_x4: d => d.season >= 2015 && d.season <= 2019,
    che_h5: (d, ce) => !ce.azarDep && d.season >= 2016 && d.season <= 2018,
    che_co1: d => d.season === 2016,
    che_te5: (d, ce) => d.season === 2016 && !ce.terryDep,
    che_h6: (d, ce) => !ce.azarDep && d.season >= 2018 && d.season <= 2019,
    che_c5: (d, ce) => tenureChe(d, ce) >= 1,
    che_co2: d => d.season === 2017,
    che_co3: d => d.season === 2018,
    che_q3: d => d.season >= 2019 && d.season <= 2020,
    che_q4: d => d.season >= 2019 && d.season <= 2020,
    che_q5: d => d.season >= 2020 && d.season <= 2021,
    che_x2: d => d.season === 2018,
    che_x3: (d, ce) => tenureChe(d, ce) >= 0,
    che_x6: (d, ce) => tenureChe(d, ce) >= 0,
    che_m6: (d, ce) => d.season === 2016 && seenChe(ce, "che_m5"),
    che_f1: d => d.season === 2019,
    che_f2: d => d.season === 2019,
    che_q2: d => d.season === 2019,
    che_co5: d => d.season === 2020,
    che_f3: (d, ce) => d.season === 2020 && seenChe(ce, "che_f1"),
    che_q6: d => d.season >= 2020 && d.season <= 2022,
    che_e4: d => d.season >= 2022,
    che_co7: d => d.season >= 2022,
    che_reg4: (d, ce) => tenureChe(d, ce) >= 1,
    che_reg6: (d, ce) => tenureChe(d, ce) >= 1,
    che_reg7: d => d.season <= 2018,
    che_q7: d => d.season >= 2023,
    che_c6: d => d.season >= 2022,
    che_reg8: d => d.season >= 2017,
    che_e3: d => d.season === 2022,
    che_x5: (d, ce) => seenChe(ce, "che_gl5"),
    che_z2: (d, ce) => tenureChe(d, ce) >= 7,
    che_z3: (d, ce) => tenureChe(d, ce) >= 8,
  };

  /* 阵容随真实日历迁移（魔兽/切赫斯 2014 注入、逐年离队与去向队注入） */
  function injectSquadChe(d) {
    const yr = d.season;
    const t = teamInLD(CHE_NAME);
    if (!t || !t.players) return;
    if (!_baseCache[CHE_NAME]) _baseCache[CHE_NAME] = t.players.slice();
    const grow = (base, y0) => base + Math.max(0, yr - y0);
    let arr = _baseCache[CHE_NAME].slice();
    const out = [];
    if (yr >= 2015) out.push("切赫斯");
    if (yr >= 2017) out.push("特利", "科斯坦");
    if (yr >= 2019) out.push("小法", "扎球王", "路易斯");
    if (yr >= 2020) out.push("威廉托");
    if (yr >= 2021) out.push("大吉鲁");
    if (yr >= 2022) out.push("卢员外");
    arr = arr.filter(p => out.indexOf(p[0]) < 0);
    const inc = [];
    if (yr === 2014) inc.push(["魔兽", 36, "ST", "科特迪瓦", 80], ["切赫斯", grow(32, 2014), "GK", "捷克", 84]);
    if (yr >= 2016) inc.push(["坎特", grow(25, 2016), "CDM", "法国", 85], ["巴舒亚伊德", grow(22, 2016), "ST", "比利时", 77]);
    if (yr >= 2017 && yr <= 2018) inc.push(["莫拉坦", grow(24, 2017), "ST", "西班牙", 82]);
    if (yr >= 2018) inc.push(["若日尼奥尔", grow(26, 2018), "CDM", "意大利", 83], ["凯帕", grow(23, 2018), "GK", "西班牙", 79], ["科瓦契基", grow(24, 2018), "CM", "克罗地亚", 81]);
    if (yr >= 2019 && yr <= 2022) inc.push(["普利西奇", grow(20, 2019), "RW", "美国", 79]);
    if (yr >= 2020) inc.push(["齐耶赫德", grow(27, 2020), "RW", "摩洛哥", 80], ["维尔那", grow(24, 2020), "ST", "德国", 81], ["哈弗茨尔", grow(21, 2020), "CAM", "德国", 82], ["弟媳", grow(36, 2020), "CB", "巴西", 82]);
    if (yr === 2021) inc.push(["卢员外", 28, "ST", "比利时", 84]);
    if (yr >= 2022) inc.push(["库库雷利亚", grow(24, 2022), "LB", "西班牙", 79], ["福法那", grow(21, 2022), "CB", "法国", 78], ["穆德里克", grow(22, 2022), "LW", "乌克兰", 77], ["恩佐尼", grow(22, 2022), "CM", "阿根廷", 81]);
    if (yr >= 2023) inc.push(["杰克逊德", grow(22, 2023), "ST", "塞内加尔", 77], ["凯塞杜", grow(22, 2023), "CDM", "厄瓜多尔", 79], ["帕尔默斯", grow(21, 2023), "CAM", "英格兰", 80]);
    if (yr >= 2024) inc.push(["内通", grow(24, 2024), "LW", "葡萄牙", 79]);
    t.players = pushUnique(arr, inc);
    /* 去向队注入（重逢战可见；防御式 teamInLD） */
    if (yr >= 2015) destAppend("雾都火枪手", [["切赫斯", grow(33, 2015), "GK", "捷克", 82]]);
    if (yr >= 2017) destAppend("柏明瀚雄狮", [["特利", grow(36, 2017), "CB", "英格兰", 76]]);
    if (yr >= 2017) destAppend("曼德里红白", [["科斯坦", grow(29, 2017), "ST", "西班牙", 82]]);
    if (yr >= 2019) destAppend("莫纳哥", [["小法", grow(32, 2019), "CM", "西班牙", 79]]);
    if (yr >= 2019) destAppend("曼德里白舰", [["扎球王", grow(28, 2019), "LW", "比利时", 84]]);
    if (yr >= 2019) destAppend("雾都火枪手", [["路易斯", grow(32, 2019), "CB", "巴西", 78]]);
    if (yr >= 2020) destAppend("雾都火枪手", [["威廉托", grow(32, 2020), "RW", "巴西", 79]]);
    if (yr >= 2021) destAppend("米岚红黑", [["大吉鲁", grow(34, 2021), "ST", "法国", 78]]);
    if (yr >= 2022) destAppend("米岚蓝黑", [["卢员外", grow(29, 2022), "ST", "比利时", 83]]);
  }

  function onInitSeasonChe(state) {
    const d = state.data;
    const ce = ensureChe(d);
    if (ce.joinSeason == null) {
      ce.joinSeason = d.season;
      ce.entry = (window.Youth ? Youth.entryOf(d) : ((d.player && d.player.age < 24) ? "youth" : "star"));
      ce.midJoin = !!(d.history && d.history.pastClubs && d.history.pastClubs.length);
      ce.prevClubs = (d.history && d.history.pastClubs ? d.history.pastClubs.slice() : []);
    }
    if (d.season >= 2015) { ce.drogbaDep = true; ce.cechDep = true; }
    if (d.season >= 2017) { ce.terryDep = true; ce.costaDep = true; }
    if (d.season >= 2019) { ce.cescDep = true; ce.azarDep = true; }
    if (d.season >= 2020) ce.wiliDep = true;
    if (d.season >= 2021) ce.girDep = true;
    if (d.season >= 2022) ce.lukaDep = true;
    /* 穆帅下课链（2015-12 真实日历）：m4→m5 连排；m6 次年余温 */
    if (d.season === 2015) { queueChe(ce, "che_m4"); queueChe(ce, "che_m5"); }
    if (d.season === 2016 && seenChe(ce, "che_m5")) queueChe(ce, "che_m6");
    injectSquadChe(d);
  }

  function onSeasonEndChe(state, x) {
    const d = state.data;
    const ce = ensureChe(d);
    const ss = x.ss;
    ce.clubGoals += (ss.goals || 0); ce.clubApps += (ss.apps || 0);
    const tn = tenureChe(d, ce);
    /* 老王告别链：特利时代冠军（te1>m2>gl1）→ te2 → 2016 收官（te8+te7 armed+gl2） */
    if (x.lgChamp && !ce.terryDep && d.season <= 2016) {
      if (!seenChe(ce, "che_te1")) queueChe(ce, "che_te1");
      else if (!seenChe(ce, "che_m2")) queueChe(ce, "che_m2");
      else if (!seenChe(ce, "che_gl1")) queueChe(ce, "che_gl1");
      if (seenChe(ce, "che_te1") && !seenChe(ce, "che_te2")) queueChe(ce, "che_te2");
      if (d.season === 2016) {
        if (!seenChe(ce, "che_te8")) queueChe(ce, "che_te8");
        if ((seenChe(ce, "che_te2") || seenChe(ce, "che_te4") || seenChe(ce, "che_te6") || seenChe(ce, "che_te8")) && !seenChe(ce, "che_te7")) queueChe(ce, "che_te7");
        if (!seenChe(ce, "che_gl2")) queueChe(ce, "che_gl2");
      }
    }
    if (x.lgChamp && (d.season > 2016 || ce.terryDep) && !seenChe(ce, "che_gl6")) queueChe(ce, "che_gl6");
    /* 卫冕崩盘四视角（te3/h4/m3/e1 一季一张，优先级链；全发完落 reg1） */
    if (ce.lastChamp && !x.lgChamp) {
      if (!seenChe(ce, "che_te3")) queueChe(ce, "che_te3");
      else if (!seenChe(ce, "che_h4")) queueChe(ce, "che_h4");
      else if (!seenChe(ce, "che_m3")) queueChe(ce, "che_m3");
      else if (!seenChe(ce, "che_e1")) queueChe(ce, "che_e1");
      else if (!seenChe(ce, "che_reg1")) queueChe(ce, "che_reg1");
    }
    /* 扎球王告别信（2018 末 settle；h8 重逢 armed 前置） */
    if (d.season === 2018 && !ce.azarDep && !seenChe(ce, "che_h7")) queueChe(ce, "che_h7");
    /* 欧战决赛（cc armed 分流；co4/co6 教练视角优先） */
    const ccLoseNow = ce.reg2Armed && !x.ccChamp;
    ce.reg2Armed = false;
    if (x.ccChamp && d.season === 2018) {
      if (!seenChe(ce, "che_co4")) queueChe(ce, "che_co4");
      else if (!seenChe(ce, "che_gl3")) queueChe(ce, "che_gl3");
    }
    if (x.ccChamp && d.season === 2020) {
      if (!seenChe(ce, "che_co6")) queueChe(ce, "che_co6");
      else if (!seenChe(ce, "che_gl4")) queueChe(ce, "che_gl4");
    }
    if (x.ccChamp && d.season === 2024 && !seenChe(ce, "che_gl5")) queueChe(ce, "che_gl5");
    if (ccLoseNow && !seenChe(ce, "che_reg2")) queueChe(ce, "che_reg2");
    /* 国内杯决赛（cup armed 分流）：2021 两场决赛特化 / 通用点球 */
    const cupLoseNow = ce.reg3Armed && !x.cupChamp;
    ce.reg3Armed = false;
    if (cupLoseNow) {
      if (d.season === 2021 && !seenChe(ce, "che_e2")) queueChe(ce, "che_e2");
      else if (!seenChe(ce, "che_reg5")) queueChe(ce, "che_reg5");
    }
    /* 下半区（e5 2022 特化 / reg3 通用） */
    if (x.myRank != null && x.myRank >= 11) {
      if (d.season === 2022 && !seenChe(ce, "che_e5")) queueChe(ce, "che_e5");
      else if (d.season !== 2022 && !seenChe(ce, "che_reg3")) queueChe(ce, "che_reg3");
    }
    /* 年轮（tenure 相对） */
    if (tn === 1 && !seenChe(ce, "che_y1")) queueChe(ce, "che_y1");
    if (tn === 4 && !seenChe(ce, "che_y2")) queueChe(ce, "che_y2");
    if (tn === 5 && !seenChe(ce, "che_y3")) queueChe(ce, "che_y3");
    if (tn >= 7 && !seenChe(ce, "che_z2")) queueChe(ce, "che_z2");
    if (tn >= 9 && !seenChe(ce, "che_z3")) queueChe(ce, "che_z3");
    /* z1 袖标（armed te7 或 tenure>=3） */
    if (!seenChe(ce, "che_z1") && (seenChe(ce, "che_te7") || tn >= 3)) queueChe(ce, "che_z1");
    ce.lastRank = x.myRank; ce.lastChamp = x.lgChamp;
  }

  function pickSilentChe(state, ctxs) {
    const d = state.data;
    if (d.retired) return null;
    const ce = ensureChe(d);
    const list = (ctxs || []).filter(Boolean);
    for (const raw of list) {
      const ctx = Object.assign({ d }, raw);
      const round = ctx.round || Math.round((d.dayIndex || 0) / 8);
      if ((d.injuryDays || 0) > 0) break;
      for (const m of CHE_MATCH_SEQ) {
        if (seenChe(ce, m.id)) continue;
        let ok = false;
        try { ok = m.ok(d, ce, ctx); } catch (e) { ok = false; }
        if (ok) { markChe(ce, m.id); ce.lastClubRound = round; return card(m.id); }
      }
      if (!gapOk(d, ce, round, 6)) break;
      for (const id of CHE_AMBIENT) {
        if (seenChe(ce, id)) continue;
        const g = CHE_GUARDS[id];
        if (g) { try { if (!g(d, ce, ctx, state)) continue; } catch (e) { continue; } }
        markChe(ce, id); ce.lastClubRound = round; return card(id);
      }
      break;
    }
    return null;
  }

  function pickPreChe(state, fixture) {
    const d = state.data;
    if (!atChe(d) || d.retired) return null;
    const ce = ensureChe(d);
    if ((d.injuryDays || 0) > 0) return null;
    const f = fixture && (fixture.match || fixture);
    const oppName = f ? ((f.home && f.home.id) === d.clubId ? (f.away && f.away.name) : (f.home && f.home.name)) : "";
    const round = fixture.round || Math.round((d.dayIndex || 0) / 8);
    const isLastLgRound = fixture.type === "league" && fixture.round === Math.max(0, ...d.fixtures.filter(x => x.type === "league").map(x => x.round || 0));
    /* armed 置位（先于叙事 return） */
    if (fixture.type === "cc_ko" && fixture.stage === 3 && !ce.reg2Armed) ce.reg2Armed = true;
    if (fixture.type === "cup" && fixture.stage === 3 && !ce.reg3Armed) ce.reg3Armed = true;
    /* 特利告别战（2016 末轮主战，第 26 分钟） */
    if (isLastLgRound && d.season === 2016 && !ce.terryDep && !seenChe(ce, "che_te6")) {
      markChe(ce, "che_te6"); ce.lastClubRound = round; return card("che_te6");
    }
    /* armed 重逢：特利随维拉 / 扎球王随曼德里白舰 */
    if (oppName === "柏明瀚雄狮" && seenChe(ce, "che_te7") && !seenChe(ce, "che_te9")) {
      markChe(ce, "che_te9"); ce.lastClubRound = round; return card("che_te9");
    }
    if (oppName === "曼德里白舰" && ce.azarDep && seenChe(ce, "che_h7") && !seenChe(ce, "che_h8")) {
      markChe(ce, "che_h8"); ce.lastClubRound = round; return card("che_h8");
    }
    /* 德比对位特写 */
    if (oppName === "富勒姆" && !seenChe(ce, "che_r2")) { markChe(ce, "che_r2"); ce.lastClubRound = round; return card("che_r2"); }
    if ((oppName === "雾都火枪手" || oppName === "雾都白百合") && !seenChe(ce, "che_r3")) { markChe(ce, "che_r3"); ce.lastClubRound = round; return card("che_r3"); }
    if (oppName === "雾都铁锤" && !seenChe(ce, "che_r4")) { markChe(ce, "che_r4"); ce.lastClubRound = round; return card("che_r4"); }
    if (oppName === "棉都红魔" && d.season >= 2015 && !seenChe(ce, "che_r5")) { markChe(ce, "che_r5"); ce.lastClubRound = round; return card("che_r5"); }
    return null;
  }

  /* ── 注册（装配层据此把符号解构回 club_events.js 的作用域）── */
  REG.push({
    key: "che", name: "雾都蓝狮", order: 110,
    at: atChe, id: cheId, ensure: ensureChe,
    sym: {
      CHE_NAME: CHE_NAME, cheId: cheId, atChe: atChe, ensureChe: ensureChe, seenChe: seenChe,
      markChe: markChe, queueChe: queueChe, tenureChe: tenureChe, CHE_MATCH_SEQ: CHE_MATCH_SEQ, CHE_AMBIENT: CHE_AMBIENT,
      CHE_GUARDS: CHE_GUARDS, injectSquadChe: injectSquadChe, onInitSeasonChe: onInitSeasonChe, onSeasonEndChe: onSeasonEndChe, pickSilentChe: pickSilentChe,
      pickPreChe: pickPreChe,
    },
    hooks: {
      onInitSeason: onInitSeasonChe, onSeasonEnd: onSeasonEndChe,
      pickSilent: pickSilentChe, pickPre: pickPreChe,
    },
  });
})(typeof window !== "undefined" ? window : global);
