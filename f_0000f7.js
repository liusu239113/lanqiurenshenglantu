/* ============================================================================
   club/liv.js — 利武浦槽（P71：101 卡）· P94a 从 club_events.js 迁出
   绝对赛季年锚 d.season；L13 数值不锁死（卡内无冠军序数/等待年数/比分细节）。
   自足性：本文件只依赖 club/_shared.js；顶层**只定义、不调用**，
   因此加载顺序不影响行为（调用发生在 club_events.js 的钩子运行期）。
   ============================================================================ */
(function (root) {
  "use strict";
  const REG = root.__ClubReg;
  const S = REG.shared;
  const card = S.card, seen = S.seen, tenure = S.tenure, gapOk = S.gapOk;
  const teamInLD = S.teamInLD, pushUnique = S.pushUnique;
  const destRebuild = S.destRebuild, destAppend = S.destAppend, _baseCache = S.baseCache;

  /* ── 利武浦槽（P71：101 卡；绝对赛季年锚 d.season；L13 数值不锁死：
     卡内无冠军序数/等待年数/比分细节；2018 决赛负→k7、2019 决赛胜→k8 特化吃掉 reg2 位，
     错位年份回落通用 reg2_win/lose；2020 联赛冠→k9/h6 特化；2022 杯冠→gl4；2024 杯冠→gl5）──
     真实日历：杰队官宣 2015 初/告别 2015 末（2016 起缺席）；斯特林托 2016 起缺席；
     渣叔 2015 秋上任（k1/k2）、2024 官宣+告别（k11/k11b/k12）；库鸟 2018 起缺席（冬窗→季初偏差注）；
     亨德森德接袖标 2016 初、告别 2023 末（2024 起缺席）；菲尔米纳告别 2023 末；
     注入窗口：奥里吉诺/斯图里基 2014，菲尔米纳/米尔纳 2015，阿诺德 2016，萨拉赫德/罗伯逊德 2017，
     范戴克/阿利松/法比尼奥德/凯坦 2018（凯坦 8 号传承卡 g8 锚）*/
  const LIV_NAME = "利武浦";
  let _livId = null;
  function livId() {
    if (_livId) return _livId;
    if (!window.LD) return null;
    for (const [, lg] of Object.entries(window.LD())) {
      for (const t of lg.teams) if (t.name === LIV_NAME) { _livId = t.id; return _livId; }
    }
    return null;
  }
  const atLiv = d => d && d.clubId === livId();
  function ensureLiv(d) {
    d.clubEvents = d.clubEvents || {};
    const le = d.clubEvents.liverpool = d.clubEvents.liverpool || {
      joinSeason: null, entry: null, midJoin: false, prevClubs: [],
      seen: {}, pending: [], lowStreak: 0, lastClubRound: -99,
      clubGoals: 0, clubApps: 0, lastRank: 0, lastChamp: false, firstTitle: false,
      reg1Armed: false, reg2Armed: false, reg3Armed: false, c6Armed: false,
      gerrDep: false, sterDep: false, coutDep: false, hendDep: false, firDep: false,
      forever: false,
    };
    return le;
  }
  const seenL = (le, id) => !!le.seen[id];
  const markL = (le, id) => { le.seen[id] = true; };
  function queueL(le, id) { if (!seenL(le, id)) { le.pending.push(id); markL(le, id); } }
  function tenureLiv(d, le) { return le.joinSeason == null ? 0 : (d.season - le.joinSeason); }

  /* 比赛槽（同条件排队：g3 > s2 > c2 > h4 > f1 > e4 > m1；g9 走氛围） */
  const LIV_MATCH_SEQ = [
    { id: "liv_g3", ok: (d, le, ctx) => !le.gerrDep && (ctx.userGoals || 0) >= 1 },
    { id: "liv_s2", ok: (d, le, ctx) => !le.sterDep && (ctx.userGoals || 0) >= 1 },
    { id: "liv_c2", ok: (d, le, ctx) => !le.coutDep && (ctx.userGoals || 0) >= 1 },
    { id: "liv_h4", ok: (d, le, ctx) => !le.hendDep && (ctx.userGoals || 0) >= 1 },
    { id: "liv_f1", ok: (d, le, ctx) => !le.firDep && (ctx.userGoals || 0) >= 1 },
    { id: "liv_e4", ok: (d, le, ctx) => d.season >= 2017 && (ctx.userGoals || 0) >= 1 },
    { id: "liv_m1", ok: (d, le, ctx) => ctx.isDerby && ctx.res === "win" && d.season === 2018 },
  ];
  const LIV_AMBIENT = [
    "liv_ct1", "liv_m6", "liv_g2", "liv_g9", "liv_h1", "liv_x1", "liv_s1", "liv_c1", "liv_k15",
    "liv_k1", "liv_k2", "liv_k4", "liv_x7", "liv_e3", "liv_m3",
    "liv_k5", "liv_e1", "liv_e6", "liv_e7",
    "liv_k13", "liv_x2", "liv_x5", "liv_x8", "liv_x4",
    "liv_ct3", "liv_ct6", "liv_ct7", "liv_m2", "liv_m4",
    "liv_k10", "liv_m5", "liv_e5",
    "liv_s6", "liv_c7", "liv_h9", "liv_f4",
    "liv_y4", "liv_z1", "liv_z2", "liv_z3",
    "liv_mid2", "liv_mid3",
  ];
  const LIV_GUARDS = {
    liv_mid2: (d, le) => le.midJoin && tenureLiv(d, le) >= 1,
    liv_mid3: (d, le) => le.midJoin && tenureLiv(d, le) >= 2,
    liv_ct1: (d, le) => tenureLiv(d, le) >= 0,
    liv_m6: (d, le) => tenureLiv(d, le) >= 0,
    liv_g2: (d, le) => !le.gerrDep,
    liv_g9: (d, le) => !le.gerrDep && tenureLiv(d, le) >= 1,
    liv_h1: (d, le) => !le.hendDep,
    liv_x1: d => d.season === 2014,
    liv_s1: (d, le) => !le.sterDep,
    liv_c1: (d, le) => !le.coutDep,
    liv_k15: (d, le) => seenL(le, "liv_k1"),
    liv_k1: d => d.season === 2015,
    liv_k2: (d, le) => d.season === 2015 && seenL(le, "liv_k1"),
    liv_k4: d => d.season === 2016,
    liv_x7: d => d.season === 2016,
    liv_e3: (d, le) => d.season >= 2016 && tenureLiv(d, le) >= 2,
    liv_m3: d => d.season >= 2015,
    liv_k5: d => d.season === 2017,
    liv_e1: d => d.season === 2017,
    liv_e6: d => d.season === 2017,
    liv_e7: d => d.season >= 2017,
    liv_m4: d => d.season >= 2017,
    liv_k13: (d, le) => le.coutDep && seenL(le, "liv_c4"),
    liv_x2: (d, le) => le.coutDep && seenL(le, "liv_c4"),
    liv_x5: d => d.season === 2018,
    liv_x8: (d, le) => d.season === 2018 && seenL(le, "liv_x5"),
    liv_x4: d => d.season >= 2018,
    liv_ct3: (d, le) => tenureLiv(d, le) >= 1,
    liv_ct6: (d, le) => tenureLiv(d, le) >= 1,
    liv_ct7: (d, le) => tenureLiv(d, le) >= 1,
    liv_m2: d => d.season <= 2016,
    liv_k10: d => d.season === 2021,
    liv_m5: d => d.season >= 2018,
    liv_e5: d => d.season >= 2018,
    liv_s6: (d, le) => le.sterDep,
    liv_c7: (d, le) => le.coutDep,
    liv_h9: (d, le) => le.hendDep,
    liv_f4: (d, le) => le.firDep,
    liv_y4: (d, le) => tenureLiv(d, le) >= 6,
    liv_z1: (d, le) => tenureLiv(d, le) >= 2,
    liv_z2: (d, le) => tenureLiv(d, le) >= 4,
    liv_z3: d => d.season >= 2025,
  };

  /* 阵容随真实日历迁移（base 快照逐季重建；去向队注入：斯特林托→棉都蓝月 / 库鸟→巴塞罗纳） */
  function injectSquadLiv(d) {
    const yr = d.season;
    const t = teamInLD(LIV_NAME);
    if (!t || !t.players) return;
    if (!_baseCache[LIV_NAME]) _baseCache[LIV_NAME] = t.players.slice();
    const grow = (base, y0) => base + Math.max(0, yr - y0);
    let arr = _baseCache[LIV_NAME].slice();
    const out = [];
    if (yr >= 2016) out.push("杰队", "斯特林托");
    if (yr >= 2018) out.push("库鸟");
    if (yr >= 2024) out.push("亨德森德", "菲尔米纳");
    arr = arr.filter(p => out.indexOf(p[0]) < 0);
    const inc = [["奥里吉诺", grow(21, 2014), "ST", "比利时", 76]];
    if (yr <= 2018) inc.push(["斯图里基", grow(25, 2014), "ST", "英格兰", 81]);
    if (yr >= 2015 && yr <= 2022) inc.push(["菲尔米纳", grow(23, 2015), "ST", "巴西", 82], ["米尔纳", grow(29, 2015), "CM", "英格兰", 76]);
    if (yr >= 2016) inc.push(["阿诺德", grow(18, 2016), "RB", "英格兰", 78]);
    if (yr >= 2017) inc.push(["萨拉赫德", grow(25, 2017), "RW", "埃及", 84], ["罗伯逊德", grow(24, 2017), "LB", "苏格兰", 78]);
    if (yr >= 2018) inc.push(["范戴克", grow(26, 2018), "CB", "荷兰", 85], ["阿利松", grow(25, 2018), "GK", "巴西", 84], ["法比尼奥德", grow(24, 2018), "CDM", "巴西", 82], ["凯坦", grow(23, 2018), "CM", "几内亚", 79]);
    t.players = pushUnique(arr, inc);
    if (yr >= 2016) destAppend("棉都蓝月", [["斯特林托", grow(20, 2015), "RW", "英格兰", 84]]);
    if (yr >= 2018) destRebuild("巴塞罗纳", [["库鸟", grow(25, 2018), "CAM", "巴西", 84]]);
  }

  function onInitSeasonLiv(state) {
    const d = state.data;
    const le = ensureLiv(d);
    if (le.joinSeason == null) {
      le.joinSeason = d.season;
      le.entry = (window.Youth ? Youth.entryOf(d) : ((d.player && d.player.age < 24) ? "youth" : "star"));
      le.midJoin = !!(d.history && d.history.pastClubs && d.history.pastClubs.length);
      le.prevClubs = (d.history && d.history.pastClubs ? d.history.pastClubs.slice() : []);
      if (le.midJoin) queueL(le, "liv_mid1");   // P78c：中途加入欢迎卡
    }
    if (d.season >= 2016) { le.gerrDep = true; le.sterDep = true; }
    if (d.season >= 2018) le.coutDep = true;
    if (d.season >= 2024) { le.hendDep = true; le.firDep = true; }
    /* 日历队列（绝对年锚；玩家在队即触发，晚加盟者错过的自然沉默） */
    if (d.season === 2015 && le.joinSeason != null && le.joinSeason <= 2014) queueL(le, "liv_g4");
    if (d.season === 2015 && !le.sterDep) queueL(le, "liv_s3");
    if (d.season === 2016 && seenL(le, "liv_g6")) queueL(le, "liv_h2");
    if (d.season === 2017 && seenL(le, "liv_g6") && !le.midJoin) queueL(le, "liv_g7");   // P78c：青训回忆卡对中途加入者沉默
    if (d.season === 2018 && seenL(le, "liv_g6")) queueL(le, "liv_g8");
    if (d.season === 2018 && seenL(le, "liv_c3")) queueL(le, "liv_c4");
    if (d.season === 2023 && !le.hendDep) queueL(le, "liv_h7");
    if (d.season === 2024) { queueL(le, "liv_k11"); queueL(le, "liv_k11b"); }
    injectSquadLiv(d);
  }

  function onSeasonEndLiv(state, x) {
    const d = state.data;
    const le = ensureLiv(d);
    const ss = x.ss;
    le.clubGoals += (ss.goals || 0); le.clubApps += (ss.apps || 0);
    const tn = tenureLiv(d, le);
    /* 告别（泪点各自 once；真实年锚） */
    if (d.season === 2015 && !seenL(le, "liv_g6")) { queueL(le, "liv_g6"); queueL(le, "liv_s4"); }
    if (d.season === 2017 && !le.coutDep && !seenL(le, "liv_c3")) queueL(le, "liv_c3");
    if (d.season === 2023) { if (!seenL(le, "liv_h8")) queueL(le, "liv_h8"); if (!seenL(le, "liv_f3")) queueL(le, "liv_f3"); }
    if (d.season === 2024 && !seenL(le, "liv_k12")) queueL(le, "liv_k12");
    /* 遗憾结局（armed 豁免；2018 负→k7 / 2019 胜→k8 特化吃位，其余回落 reg2） */
    if (le.reg1Armed) { le.reg1Armed = false; le.pending.push(x.lgChamp ? "liv_reg1_win" : "liv_reg1_lose"); }
    const ccLoseNow = le.reg2Armed && !x.ccChamp;
    const ccWinNow = le.reg2Armed && x.ccChamp;
    le.reg2Armed = false;
    if (ccWinNow && d.season === 2019) {
      queueL(le, "liv_k8"); queueL(le, "liv_h5"); queueL(le, "liv_x6");
      if (le.c6Armed) { le.c6Armed = false; queueL(le, "liv_c6"); }
    } else if (ccWinNow) { le.pending.push("liv_reg2_win"); }
    else if (ccLoseNow && d.season === 2018) { queueL(le, "liv_k7"); }
    else if (ccLoseNow) { le.pending.push("liv_reg2_lose"); }
    if (le.reg3Armed) { le.reg3Armed = false; le.pending.push(x.cupChamp ? "liv_reg3_win" : "liv_reg3_lose"); }
    /* 冠军卡：2020 联赛冠→k9/h6 特化吃位；其余 gl1(首冠)>gl2(卫冕)>gl4(2022 杯)>gl3(杯) */
    const wasFirst = x.titleNow && !le.firstTitle;
    if (x.titleNow) le.firstTitle = true;
    if (x.lgChamp && d.season === 2020 && !seenL(le, "liv_k9")) {
      queueL(le, "liv_k9"); queueL(le, "liv_h6");
    } else if (x.titleNow) {
      if (wasFirst) queueL(le, "liv_gl1");
      else if (x.lgChamp && le.lastChamp && seenL(le, "liv_gl1") && !seenL(le, "liv_gl2")) queueL(le, "liv_gl2");
      else if (x.cupChamp && d.season === 2022 && !seenL(le, "liv_gl4")) queueL(le, "liv_gl4");
      else if (x.cupChamp && !seenL(le, "liv_gl3")) queueL(le, "liv_gl3");
    }
    if (x.cupChamp && d.season === 2024 && seenL(le, "liv_k11") && !seenL(le, "liv_gl5")) queueL(le, "liv_gl5");
    /* 考验之春（2015 无冠）/ 夏天第一天（2019 洲际无冠）——赛果条件，L13 */
    if (d.season === 2015 && !x.titleNow && !seenL(le, "liv_k3")) queueL(le, "liv_k3");
    if (d.season === 2019 && !x.ccChamp && !seenL(le, "liv_k8")) queueL(le, "liv_k14");
    /* x3：高分成色亚军（reg1 同季已出则跳过，L5） */
    if (x.myRank === 2 && !le.reg1Armed && !seenL(le, "liv_x3")) {
      try {
        const tb = (window.SeasonSystem ? SeasonSystem.standings(state) : []) || [];
        const me = tb.find(t => t.id === d.clubId);
        if (me && me.pts >= 95) queueL(le, "liv_x3");
      } catch (e) { /* ignore */ }
    }
    /* 年轮（tenure 相对） */
    if (!seenL(le, "liv_y1") && tn === 3) queueL(le, "liv_y1");
    if (!seenL(le, "liv_y2") && tn === 6) queueL(le, "liv_y2");
    if (!seenL(le, "liv_y3") && tn === 10) queueL(le, "liv_y3");
    le.lastRank = x.myRank; le.lastChamp = x.lgChamp;
  }

  function pickSilentLiv(state, ctxs) {
    const d = state.data;
    if (d.retired) return null;
    const le = ensureLiv(d);
    const list = (ctxs || []).filter(Boolean);
    for (const raw of list) {
      const ctx = Object.assign({ d }, raw);
      const round = ctx.round || Math.round((d.dayIndex || 0) / 8);
      if ((d.injuryDays || 0) > 0) break;
      for (const m of LIV_MATCH_SEQ) {
        if (seenL(le, m.id)) continue;
        let ok = false;
        try { ok = m.ok(d, le, ctx); } catch (e) { ok = false; }
        if (ok) { markL(le, m.id); le.lastClubRound = round; return card(m.id); }
      }
      if (!gapOk(d, le, round, 6)) break;
      for (const id of LIV_AMBIENT) {
        if (seenL(le, id)) continue;
        const g = LIV_GUARDS[id];
        if (g) { try { if (!g(d, le, ctx, state)) continue; } catch (e) { continue; } }
        markL(le, id); le.lastClubRound = round; return card(id);
      }
      break;
    }
    return null;
  }

  function pickPreLiv(state, fixture) {
    const d = state.data;
    if (!atLiv(d) || d.retired) return null;
    const le = ensureLiv(d);
    if ((d.injuryDays || 0) > 0) return null;
    const f = fixture && (fixture.match || fixture);
    const oppName = f ? ((f.home && f.home.id) === d.clubId ? (f.away && f.away.name) : (f.home && f.home.name)) : "";
    const round = fixture.round || Math.round((d.dayIndex || 0) / 8);
    const isLastLgRound = fixture.type === "league" && fixture.round === Math.max(0, ...d.fixtures.filter(x => x.type === "league").map(x => x.round || 0));
    // 告别战（2015 末轮，先于遗憾线）
    if (isLastLgRound && d.season === 2015 && !seenL(le, "liv_g5") && !le.gerrDep) {
      markL(le, "liv_g5"); le.lastClubRound = round; return card("liv_g5");
    }
    // 红港球场之夜（2019 洲际半决赛 vs 巴塞罗纳；还鞋 armed 随行）
    if (fixture.type === "cc_ko" && fixture.stage === 2 && oppName === "巴塞罗纳" && d.season === 2019 && !seenL(le, "liv_k6")) {
      le.c6Armed = le.coutDep && seenL(le, "liv_c4");
      markL(le, "liv_k6"); le.lastClubRound = round; return card("liv_k6");
    }
    // 遗憾一：末轮争冠
    if (isLastLgRound && !le.reg1Armed) {
      const table = (window.SeasonSystem ? SeasonSystem.standings(state) : []) || [];
      const me = table.find(t => t.id === d.clubId);
      const top = table[0];
      if (me && top && top.pts - me.pts <= 2) { le.reg1Armed = true; return card("liv_reg1_pre"); }
    }
    // 遗憾二：洲际决赛 armed（结局走 settle 特化分流）
    if (fixture.type === "cc_ko" && fixture.stage === 3 && !le.reg2Armed) { le.reg2Armed = true; return card("liv_reg2_pre"); }
    // 遗憾三：国内杯赛决赛 armed
    if (fixture.type === "cup" && fixture.stage === 3 && !le.reg3Armed) { le.reg3Armed = true; return card("liv_reg3_pre"); }
    // 赛前叙事卡
    const seq = [];
    if (oppName && oppName.indexOf("利武浦蓝塔") >= 0) seq.push("liv_ct4");
    if (oppName && oppName.indexOf("棉都红魔") >= 0) seq.push("liv_ct5");
    if (oppName && le.sterDep && seenL(le, "liv_s4") && !seenL(le, "liv_s5") && oppName === "棉都蓝月") seq.push("liv_s5");
    if (oppName && le.coutDep && seenL(le, "liv_c4") && !seenL(le, "liv_c5") && oppName === "巴塞罗纳") seq.push("liv_c5");
    for (const id of seq) {
      if (seenL(le, id)) continue;
      markL(le, id); le.lastClubRound = round; return card(id);
    }
    return null;
  }

  /* ── 注册（装配层据此把符号解构回 club_events.js 的作用域）── */
  REG.push({
    key: "liv", name: "利武浦", order: 60,
    at: atLiv, id: livId, ensure: ensureLiv,
    sym: {
      livId: livId, atLiv: atLiv, ensureLiv: ensureLiv,
      seenL: seenL, markL: markL, queueL: queueL, tenureLiv: tenureLiv,
      injectSquadLiv: injectSquadLiv,
      onInitSeasonLiv: onInitSeasonLiv, onSeasonEndLiv: onSeasonEndLiv,
      pickSilentLiv: pickSilentLiv, pickPreLiv: pickPreLiv,
      LIV_MATCH_SEQ: LIV_MATCH_SEQ, LIV_AMBIENT: LIV_AMBIENT, LIV_GUARDS: LIV_GUARDS,
    },
    hooks: {
      onInitSeason: onInitSeasonLiv, onSeasonEnd: onSeasonEndLiv,
      pickSilent: pickSilentLiv, pickPre: pickPreLiv,
    },
  });
})(typeof window !== "undefined" ? window : global);
