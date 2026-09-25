/* ============================================================================
   club/mnu.js — 棉都红魔槽 · P94a 从 club_events.js 迁出
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

  /* ── MNU 棉都红魔第十三槽（P71；102 卡；绝对赛季年锚；无 coach_trust——教练流水席全日历锚）──
     双主角：小胖线 w1-w9（t0-t3 告别，season 2016 末）/鸭爸线 d1-d12（t1-t9，season 2022 末告别）；
     教练流水席 m1-m16 六任全日历锚（穆帅下课 2018/索帅救火 2018 末/下课 2021/滕哈赫 2022-2024/阿莫林 2024）；
     特化：m2=2015 足总杯/m5=2016 欧联（斯德哥尔魔）/m11=2022 联赛杯/m12=2023 足总杯胜棉都蓝月/
     h3=2016 联赛杯大奉先/gl1=2016 双冠三银器/d6=2020 欧联点球负/r6=2023 足总杯胜棉都蓝月/gl5 兜底；
     armed：w5→w7→w8 袖标链/reg1-reg3 置 flag 不 return 卡（同雾都白百合模式）；
     注入：马夏厄+拉什福登 2015/大奉先+波霸 2016/卢员外 2017/B费 2019/总裁 2021/卡塞米隆 2022；
     离队：天使+罗宾侠 2015/小胖 2017→利武浦蓝塔/大奉先 2018/埃雷兰+费莱宁 2019/波霸+马坦+总裁 2022→总裁理雅得/鸭爸 2023 */
  const MNU_NAME = "棉都红魔";
  let _mnuId = null;
  function mnuId() {
    if (_mnuId) return _mnuId;
    if (!window.LD) return null;
    for (const [, lg] of Object.entries(window.LD())) {
      for (const t of lg.teams) if (t.name === MNU_NAME) { _mnuId = t.id; return _mnuId; }
    }
    return null;
  }
  const atMnu = d => d && d.clubId === mnuId();
  function ensureMnu(d) {
    d.clubEvents = d.clubEvents || {};
    const nu = d.clubEvents.manutd = d.clubEvents.manutd || {
      joinSeason: null, entry: null, midJoin: false, prevClubs: [],
      seen: {}, pending: [], lowStreak: 0, lastClubRound: -99,
      clubGoals: 0, clubApps: 0, lastRank: 0, lastChamp: false, firstTitle: false,
      reg1Armed: false, reg2Armed: false, reg3Armed: false, cupFinalArmed: false,
      w5Promise: false, roonDep: false, dehDep: false, diaDep: false, verDep: false,
      ibraDep: false, pogDep: false, herDep: false, mataDep: false, felDep: false, crDep: false,
      forever: false,
    };
    return nu;
  }
  const seenN = (nu, id) => !!nu.seen[id];
  const markN = (nu, id) => { nu.seen[id] = true; };
  function queueN(nu, id) { if (!seenN(nu, id)) { nu.pending.push(id); markN(nu, id); } }
  function tenureMnu(d, nu) { return nu.joinSeason == null ? 0 : (d.season - nu.joinSeason); }

  /* 比赛槽（德比双结局） */
  const MNU_MATCH_SEQ = [
    { id: "mnu_r2", ok: (d, nu, ctx) => !!ctx.isDerby },
  ];
  const MNU_AMBIENT = [
    "mnu_g1", "mnu_g2", "mnu_g3", "mnu_g4", "mnu_g5",
    "mnu_w1", "mnu_w2", "mnu_m1", "mnu_d1", "mnu_q1", "mnu_q2",
    "mnu_x1", "mnu_c1", "mnu_c2", "mnu_c4",
    "mnu_d2", "mnu_d3", "mnu_w4", "mnu_w5", "mnu_c3",
    "mnu_w3", "mnu_std2", "mnu_d4", "mnu_m16", "mnu_c6",
    "mnu_m4", "mnu_h1", "mnu_h5", "mnu_h2", "mnu_d5", "mnu_c5", "mnu_reg8",
    "mnu_m15", "mnu_std3", "mnu_d7", "mnu_h13", "mnu_reg6",
    "mnu_x4", "mnu_r5", "mnu_reg7", "mnu_reg3", "mnu_std4",
    "mnu_w6", "mnu_d8", "mnu_x6",
    "mnu_m14", "mnu_d11", "mnu_c11", "mnu_y2",
    "mnu_x3",
  ];
  const MNU_GUARDS = {
    mnu_g1: (d, nu) => tenureMnu(d, nu) >= 0,
    mnu_g2: (d, nu) => tenureMnu(d, nu) >= 0,
    mnu_g3: d => d.season === 2014,
    mnu_g4: (d, nu) => tenureMnu(d, nu) >= 0,
    mnu_g5: (d, nu) => seenN(nu, "mnu_g2"),
    mnu_w1: d => d.season === 2014,
    mnu_w2: (d, nu) => !nu.roonDep && d.season <= 2015,
    mnu_m1: d => d.season === 2014,
    mnu_d1: (d, nu) => !nu.dehDep,
    mnu_q1: (d, nu) => tenureMnu(d, nu) >= 0,
    mnu_q2: d => d.season <= 2015,
    mnu_x1: (d, nu) => tenureMnu(d, nu) <= 1,
    mnu_c1: (d, nu) => tenureMnu(d, nu) >= 0,
    mnu_c2: (d, nu) => tenureMnu(d, nu) >= 0,
    mnu_c4: (d, nu) => tenureMnu(d, nu) >= 0,
    mnu_d3: (d, nu) => d.season === 2015 && seenN(nu, "mnu_d2"),
    mnu_w4: d => d.season === 2015,
    mnu_c3: d => d.season >= 2015 && d.season <= 2017,
    mnu_w5: (d, nu) => d.season === 2016 && (d.dayIndex || 0) > 150 && !nu.roonDep,
    mnu_std2: d => d.season >= 2015 && d.season <= 2016,
    mnu_d4: (d, nu) => !nu.dehDep && d.season >= 2016 && d.season <= 2022,
    mnu_m16: (d, nu) => tenureMnu(d, nu) >= 1,
    mnu_c6: (d, nu) => tenureMnu(d, nu) >= 1,
    mnu_m4: d => d.season === 2016,
    mnu_h1: (d, nu) => !nu.ibraDep && d.season === 2016,
    mnu_h5: d => d.season === 2016,
    mnu_h2: (d, nu) => !nu.ibraDep && d.season === 2016,
    mnu_d5: (d, nu) => !nu.dehDep && d.season >= 2017 && d.season <= 2020,
    mnu_c5: (d, nu) => tenureMnu(d, nu) >= 3,
    mnu_reg8: (d, nu) => tenureMnu(d, nu) <= 2,
    mnu_m15: d => [2016, 2018, 2021, 2022, 2024].indexOf(d.season) >= 0,
    mnu_std3: d => d.season >= 2018 && d.season <= 2022,
    mnu_d7: (d, nu) => d.season === 2022 && !nu.dehDep,
    mnu_h13: d => d.season === 2022,
    mnu_reg6: (d, nu) => tenureMnu(d, nu) >= 2,
    mnu_x4: (d, nu) => tenureMnu(d, nu) >= 1,
    mnu_r5: d => d.season >= 2016 && d.season <= 2019,
    mnu_reg7: (d, nu) => tenureMnu(d, nu) >= 1,
    mnu_reg3: (d, nu) => tenureMnu(d, nu) >= 2,
    mnu_std4: d => d.season >= 2020 && d.season <= 2023,
    mnu_w6: (d, nu) => d.season === 2016 && seenN(nu, "mnu_w5"),
    mnu_d8: (d, nu) => !nu.dehDep && d.season === 2022,
    mnu_x6: (d, nu) => tenureMnu(d, nu) >= 0,
    mnu_m14: (d, nu) => tenureMnu(d, nu) >= 4,
    mnu_d11: (d, nu) => nu.dehDep,
    mnu_c11: (d, nu) => nu.komDep === true ? false : d.season >= 2020,
    mnu_y2: (d, nu) => tenureMnu(d, nu) >= 4,
    mnu_x3: (d, nu) => tenureMnu(d, nu) >= 2,
    mnu_x5: (d, nu) => seenN(nu, "mnu_m5") && d.season >= 2017,
    mnu_w9: (d, nu) => nu.roonDep,
    mnu_d12: (d, nu) => nu.dehDep && d.season >= 2024,
    mnu_h12: (d, nu) => nu.crDep,
    mnu_y1: (d, nu) => tenureMnu(d, nu) === 1,
    mnu_y3: (d, nu) => tenureMnu(d, nu) === 5,
    mnu_z2: (d, nu) => tenureMnu(d, nu) >= 7,
    mnu_z3: (d, nu) => tenureMnu(d, nu) >= 9,
    mnu_std5: (d, nu) => nu.firstTitle && tenureMnu(d, nu) >= 3,
  };

  /* 阵容随真实日历迁移 */
  function injectSquadMnu(d) {
    const yr = d.season;
    const t = teamInLD(MNU_NAME);
    if (!t || !t.players) return;
    if (!_baseCache[MNU_NAME]) _baseCache[MNU_NAME] = t.players.slice();
    const grow = (base, y0) => base + Math.max(0, yr - y0);
    let arr = _baseCache[MNU_NAME].slice();
    const out = [];
    if (yr >= 2015) out.push("天使", "罗宾侠");
    if (yr >= 2017) out.push("小胖");
    if (yr >= 2018) out.push("大奉先", "大奉先");
    if (yr >= 2019) out.push("埃雷兰", "费莱宁");
    if (yr >= 2022) out.push("波霸", "马坦");
    if (yr >= 2023) out.push("鸭爸", "总裁", "克里斯蒂亚诺·大罗");
    arr = arr.filter(p => out.indexOf(p[0]) < 0);
    const inc = [];
    if (yr >= 2015) inc.push(["马夏厄", grow(19, 2015), "ST", "法国", 80], ["拉什福登", grow(18, 2015), "ST", "英格兰", 75]);
    if (yr >= 2016 && yr <= 2017) inc.push(["大奉先", grow(34, 2016), "ST", "瑞典", 84], ["波霸", grow(23, 2016), "CM", "法国", 86], ["拜利", grow(22, 2016), "CB", "科特迪瓦", 79]);
    if (yr >= 2017) inc.push(["卢员外", grow(24, 2017), "ST", "比利时", 85], ["马蒂基", grow(28, 2017), "CDM", "塞尔维亚", 81]);
    if (yr >= 2019) inc.push(["B费", grow(25, 2019), "CAM", "葡萄牙", 84], ["卡大佐", grow(33, 2020), "ST", "乌拉圭", 83]);
    if (yr >= 2021 && yr <= 2022) inc.push(["总裁", grow(36, 2021), "ST", "葡萄牙", 87], ["桑乔", grow(21, 2021), "RW", "英格兰", 82], ["瓦拉内", grow(28, 2021), "CB", "法国", 84]);
    if (yr >= 2022) inc.push(["卡塞米隆", grow(30, 2022), "CDM", "巴西", 85]);
    if (yr >= 2023) inc.push(["奥纳那", grow(27, 2023), "GK", "喀麦隆", 80], ["霍伊伦", grow(20, 2023), "ST", "丹麦", 78]);
    t.players = pushUnique(arr, inc);
    if (yr >= 2017) destAppend("利武浦蓝塔", [["小胖", grow(31, 2017), "ST", "英格兰", 82]]);
    if (yr >= 2019) destAppend("花都红蓝", [["埃雷兰", grow(29, 2019), "CM", "西班牙", 80]]);
    if (yr >= 2022) destAppend("都林斑马", [["波霸", grow(29, 2022), "CM", "法国", 84]]);
  }

  function onInitSeasonMnu(state) {
    const d = state.data;
    const nu = ensureMnu(d);
    if (nu.joinSeason == null) {
      nu.joinSeason = d.season;
      nu.entry = (window.Youth ? Youth.entryOf(d) : ((d.player && d.player.age < 24) ? "youth" : "star"));
      nu.midJoin = !!(d.history && d.history.pastClubs && d.history.pastClubs.length);
      nu.prevClubs = (d.history && d.history.pastClubs ? d.history.pastClubs.slice() : []);
    }
    if (d.season >= 2015) { nu.diaDep = true; nu.verDep = true; }
    if (d.season >= 2017) nu.roonDep = true;
    if (d.season >= 2018) nu.ibraDep = true;
    if (d.season >= 2019) { nu.herDep = true; nu.felDep = true; }
    if (d.season >= 2022) { nu.pogDep = true; nu.mataDep = true; }
    if (d.season >= 2023) { nu.dehDep = true; nu.crDep = true; }
    /* 日历队列（绝对年锚） */
    if (d.season === 2015 && !nu.dehDep) queueN(nu, "mnu_d2");
    if (d.season === 2021 && nu.joinSeason != null) queueN(nu, "mnu_h11");
    if (d.season === 2022) queueN(nu, "mnu_m10");
    if (d.season === 2024) queueN(nu, "mnu_m13");
    injectSquadMnu(d);
  }

  function onSeasonEndMnu(state, x) {
    const d = state.data;
    const nu = ensureMnu(d);
    const ss = x.ss;
    nu.clubGoals += (ss.goals || 0); nu.clubApps += (ss.apps || 0);
    const tn = tenureMnu(d, nu);
    /* 小胖告别链（season 2016 末=2016-17 季，真实 2017-07 走） */
    if (d.season === 2016 && !seenN(nu, "mnu_w6") && !nu.roonDep) queueN(nu, "mnu_w6");
    if (d.season === 2016 && seenN(nu, "mnu_w5") && !seenN(nu, "mnu_w8")) queueN(nu, "mnu_w8");
    /* 鸭爸告别（season 2022 末=2022-23 季，真实 2023-07 走） */
    if (d.season === 2022) {
      if (nu.cupFinalArmed && !seenN(nu, "mnu_d9")) queueN(nu, "mnu_d9");
      if (!seenN(nu, "mnu_d10")) queueN(nu, "mnu_d10");
      nu.cupFinalArmed = false;
    }
    /* 教练流水席（全日历锚） */
    if (d.season === 2015 && x.cupChamp && !seenN(nu, "mnu_m2")) queueN(nu, "mnu_m2");
    if (d.season === 2015 && seenN(nu, "mnu_m2") && !seenN(nu, "mnu_m3")) queueN(nu, "mnu_m3");
    if (d.season === 2016 && x.ccChamp && !seenN(nu, "mnu_m5")) queueN(nu, "mnu_m5");
    if (d.season === 2018) { queueN(nu, "mnu_m6"); queueN(nu, "mnu_m7"); }
    if (d.season === 2021) queueN(nu, "mnu_m9");
    if (d.season === 2022 && x.cupChamp && !seenN(nu, "mnu_m11")) queueN(nu, "mnu_m11");
    if (d.season === 2023 && x.cupChamp && !seenN(nu, "mnu_m12")) queueN(nu, "mnu_m12");
    /* 名人堂来去（settle 锚） */
    if (d.season === 2016 && x.cupChamp && !seenN(nu, "mnu_h3")) queueN(nu, "mnu_h3");
    if (d.season === 2017) queueN(nu, "mnu_h4");
    if (d.season === 2018) { queueN(nu, "mnu_h8"); queueN(nu, "mnu_h10"); }
    if (d.season === 2022) { queueN(nu, "mnu_h7"); queueN(nu, "mnu_h9"); queueN(nu, "mnu_h12"); }
    /* armed 分流（reg 组无 pre 卡，同雾都白百合模式） */
    if (nu.reg1Armed) { nu.reg1Armed = false; if (x.myRank != null && x.myRank >= 5 && !seenN(nu, "mnu_reg1")) queueN(nu, "mnu_reg1"); }
    const ccLoseNow = nu.reg2Armed && !x.ccChamp;
    const ccWinNow = nu.reg2Armed && x.ccChamp;
    nu.reg2Armed = false;
    if (ccLoseNow) {
      if (d.season === 2020 && !seenN(nu, "mnu_d6")) queueN(nu, "mnu_d6");
      else if (!seenN(nu, "mnu_reg2")) queueN(nu, "mnu_reg2");
    } else if (ccWinNow && !seenN(nu, "mnu_x5")) queueN(nu, "mnu_x5");
    if (nu.reg3Armed) {
      nu.reg3Armed = false;
      if (x.cupChamp && d.season === 2023 && !seenN(nu, "mnu_r6")) queueN(nu, "mnu_r6");
      else if (x.cupChamp && d.season === 2023 && !seenN(nu, "mnu_gl5")) queueN(nu, "mnu_gl5");
      else if (!x.cupChamp && !seenN(nu, "mnu_reg5")) queueN(nu, "mnu_reg5");
    }
    /* 冠军卡 */
    const wasFirst = x.titleNow && !nu.firstTitle;
    if (x.titleNow) nu.firstTitle = true;
    if (x.ccChamp && x.cupChamp && d.season === 2016 && !seenN(nu, "mnu_gl1")) queueN(nu, "mnu_gl1");
    else if (wasFirst && !seenN(nu, "mnu_gl6")) queueN(nu, "mnu_gl6");
    else if (x.lgChamp && nu.lastChamp && !seenN(nu, "mnu_gl6")) queueN(nu, "mnu_gl6");
    /* 其余特化 */
    if (x.myRank === 2 && !seenN(nu, "mnu_reg4")) queueN(nu, "mnu_reg4");
    if (d.season === 2015 && x.myRank != null && x.myRank > 4 && !seenN(nu, "mnu_std1")) queueN(nu, "mnu_std1");
    /* 年轮（tenure 相对） */
    if (!seenN(nu, "mnu_y1") && tn === 1) queueN(nu, "mnu_y1");
    if (!seenN(nu, "mnu_y2") && tn === 4) queueN(nu, "mnu_y2");
    if (!seenN(nu, "mnu_y3") && tn === 5) queueN(nu, "mnu_y3");
    /* z1 袖标（armed w8 或 tenure>=3） */
    if (!seenN(nu, "mnu_z1") && (seenN(nu, "mnu_w8") || tn >= 3)) queueN(nu, "mnu_z1");
    nu.lastRank = x.myRank; nu.lastChamp = x.lgChamp;
  }

  function pickSilentMnu(state, ctxs) {
    const d = state.data;
    if (d.retired) return null;
    const nu = ensureMnu(d);
    const list = (ctxs || []).filter(Boolean);
    for (const raw of list) {
      const ctx = Object.assign({ d }, raw);
      const round = ctx.round || Math.round((d.dayIndex || 0) / 8);
      if ((d.injuryDays || 0) > 0) break;
      for (const m of MNU_MATCH_SEQ) {
        if (seenN(nu, m.id)) continue;
        let ok = false;
        try { ok = m.ok(d, nu, ctx); } catch (e) { ok = false; }
        if (ok) { markN(nu, m.id); nu.lastClubRound = round; return card(m.id); }
      }
      if (!gapOk(d, nu, round, 6)) break;
      for (const id of MNU_AMBIENT) {
        if (seenN(nu, id)) continue;
        const g = MNU_GUARDS[id];
        if (g) { try { if (!g(d, nu, ctx, state)) continue; } catch (e) { continue; } }
        markN(nu, id); nu.lastClubRound = round; return card(id);
      }
      break;
    }
    return null;
  }

  function pickPreMnu(state, fixture) {
    const d = state.data;
    if (!atMnu(d) || d.retired) return null;
    const nu = ensureMnu(d);
    if ((d.injuryDays || 0) > 0) return null;
    const f = fixture && (fixture.match || fixture);
    const oppName = f ? ((f.home && f.home.id) === d.clubId ? (f.away && f.away.name) : (f.home && f.home.name)) : "";
    const round = fixture.round || Math.round((d.dayIndex || 0) / 8);
    const isLastLgRound = fixture.type === "league" && fixture.round === Math.max(0, ...d.fixtures.filter(x => x.type === "league").map(x => x.round || 0));
    /* armed 置位（必须先于任何 return；同雾都白百合模式） */
    if (isLastLgRound && !nu.reg1Armed) {
      const table = (window.SeasonSystem ? SeasonSystem.standings(state) : []) || [];
      const meRow = table.find(t2 => t2.id === d.clubId);
      const top = table[0];
      if (meRow && top && top.id !== d.clubId && top.pts - meRow.pts <= 2) nu.reg1Armed = true;
    }
    if (fixture.type === "cc_ko" && fixture.stage === 3 && !nu.reg2Armed) nu.reg2Armed = true;
    if (fixture.type === "cup" && fixture.stage === 3) {
      if (!nu.reg3Armed) nu.reg3Armed = true;
      if (!nu.cupFinalArmed) nu.cupFinalArmed = true;   // d9 决赛日 flag（无论胜负）
    }
    /* 小胖告别战（2016 末轮主战） */
    if (isLastLgRound && d.season === 2016 && !nu.roonDep && !seenN(nu, "mnu_w7")) {
      markN(nu, "mnu_w7"); nu.lastClubRound = round; return card("mnu_w7");
    }
    /* armed 重逢：小胖随利武浦蓝塔回访 */
    if (oppName === "利武浦蓝塔" && nu.roonDep && !seenN(nu, "mnu_w9")) {
      markN(nu, "mnu_w9"); nu.lastClubRound = round; return card("mnu_w9");
    }
    /* 花都之夜（2018 欧冠淘汰赛窗口） */
    if (fixture.type === "cc_ko" && d.season === 2018 && !seenN(nu, "mnu_m8")) {
      markN(nu, "mnu_m8"); nu.lastClubRound = round; return card("mnu_m8");
    }
    /* 德比/双红会 pre 特写 */
    if (oppName === "棉都蓝月" && !seenN(nu, "mnu_r1")) {
      markN(nu, "mnu_r1"); nu.lastClubRound = round; return card("mnu_r1");
    }
    if (oppName && oppName.indexOf("利武浦") >= 0 && !seenN(nu, "mnu_r3")) {
      markN(nu, "mnu_r3"); nu.lastClubRound = round; return card("mnu_r3");
    }
    return null;
  }

  /* ── 注册（装配层据此把符号解构回 club_events.js 的作用域）── */
  REG.push({
    key: "mnu", name: "棉都红魔", order: 90,
    at: atMnu, id: mnuId, ensure: ensureMnu,
    sym: {
      MNU_NAME: MNU_NAME, mnuId: mnuId, atMnu: atMnu, ensureMnu: ensureMnu, seenN: seenN,
      markN: markN, queueN: queueN, tenureMnu: tenureMnu, MNU_MATCH_SEQ: MNU_MATCH_SEQ, MNU_AMBIENT: MNU_AMBIENT,
      MNU_GUARDS: MNU_GUARDS, injectSquadMnu: injectSquadMnu, onInitSeasonMnu: onInitSeasonMnu, onSeasonEndMnu: onSeasonEndMnu, pickSilentMnu: pickSilentMnu,
      pickPreMnu: pickPreMnu,
    },
    hooks: {
      onInitSeason: onInitSeasonMnu, onSeasonEnd: onSeasonEndMnu,
      pickSilent: pickSilentMnu, pickPre: pickPreMnu,
    },
  });
})(typeof window !== "undefined" ? window : global);
