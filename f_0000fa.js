/* ============================================================================
   club/ars.js — 雾都火枪手槽 · P94a 从 club_events.js 迁出
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

  /* ── ARS 雾都火枪手第十四槽（P71；90 卡；绝对赛季年锚；三段王朝：教授→过渡→阿尔特坦）──
     教授线 w1-w9（season 2014-2017，2018-05 离任）；厄弃儿诺线 o1-o8（2021-01 走=season 2020 末）；
     阿尔特坦线 a1-a2 退役（2016-05=season 2015 末）→a4 回家（2019-12=season 2019 末）→a6 首冠（2020-08）；
     埃梅利过渡 e1-e4（芭库 2019-05=season 2018 末/下课 2019-11/永贝利/官宣）；
     青年军 s1-s8（萨卡 2018/厄德高托 2020/萨利巴 2022/马丁内利斯 2019）；
     特化：w3=2014 足总杯卫冕/w4=2015 莱斯堡亚军/w5=2016 足总杯/w6-w8=2017 教授告别/
     e1=2018 欧联决赛负/a6=2019 足总杯首冠/a9=2022 亚军领跑/gl1=2014 杯/gl2=2016 杯/gl3=2019 杯兜底/gl4=2023 社区盾；
     armed：w6→w8 最后一课/a1→a2 袖标→z1/e2→e3→e4→a4 回家链/z2→z3；
     注入：切赫斯 2015/扎坎 2016/奥巴梅扬诺 2017-2021/姆希塔良尔 2018/萨卡 2018/托雷兰 2018/马丁内利斯 2019/
     厄德高托 2020/加布里埃尔 2020/本怀特+拉姆斯代厄 2021/热苏塞+津琴科+萨利巴+维埃拉 2022/赖斯+哈弗茨尔+特隆萨德 2023；
     离队：桑切塞 2017→棉都红魔/小老虎+大吉鲁 2017/卡索兰 2018 退役/科斯切尔宁+队短塞 2019/姆希塔良尔 2020/
     厄弃儿诺 2021→费内巴切（卡文防御式）/奥巴梅扬诺 2022→巴塞罗纳/拉姆斯代厄 2024→南安普雷 */
  const ARS_NAME = "雾都火枪手";
  let _arsId = null;
  function arsId() {
    if (_arsId) return _arsId;
    if (!window.LD) return null;
    for (const [, lg] of Object.entries(window.LD())) {
      for (const t of lg.teams) if (t.name === ARS_NAME) { _arsId = t.id; return _arsId; }
    }
    return null;
  }
  const atArs = d => d && d.clubId === arsId();
  function ensureArs(d) {
    d.clubEvents = d.clubEvents || {};
    const ae = d.clubEvents.arsenal = d.clubEvents.arsenal || {
      joinSeason: null, entry: null, midJoin: false, prevClubs: [],
      seen: {}, pending: [], lowStreak: 0, lastClubRound: -99,
      clubGoals: 0, clubApps: 0, lastRank: 0, lastChamp: false, firstTitle: false,
      reg2Armed: false, reg3Armed: false,
      ozilDep: false, sanDep: false, cazDep: false, kosDep: false, ramDep: false,
      welbDep: false, lacaDep: false, obaDep: false, ramdalDep: false, mkhDep: false,
      wengerGone: false, artetaIn: false,
      forever: false,
    };
    return ae;
  }
  const seenA = (ae, id) => !!ae.seen[id];
  const markA = (ae, id) => { ae.seen[id] = true; };
  function queueA(ae, id) { if (!seenA(ae, id)) { ae.pending.push(id); markA(ae, id); } }
  function tenureArs(d, ae) { return ae.joinSeason == null ? 0 : (d.season - ae.joinSeason); }

  /* 比赛槽（桑切塞连线） */
  const ARS_MATCH_SEQ = [
    { id: "ars_o3", ok: (d, ae, ctx) => !ae.sanDep && !ae.ozilDep && (ctx.userGoals || 0) >= 1 },
    { id: "ars_r2", ok: (d, ae, ctx) => !!ctx.isDerby },
  ];
  const ARS_AMBIENT = [
    "ars_g1", "ars_g2", "ars_g3", "ars_g4", "ars_g5",
    "ars_w1", "ars_w2", "ars_w6", "ars_o1", "ars_o2", "ars_o3", "ars_o4",
    "ars_ct1", "ars_ct2", "ars_c1", "ars_c2",
    "ars_d4", "ars_c3", "ars_w9",
    "ars_o5", "ars_o6", "ars_a5", "ars_a7", "ars_c4", "ars_s1",
    "ars_s5", "ars_d7", "ars_x5", "ars_reg8",
    "ars_a8", "ars_s4", "ars_s6", "ars_c6",
    "ars_a10", "ars_c6", "ars_d6",
  ];
  const ARS_GUARDS = {
    ars_g1: (d, ae) => tenureArs(d, ae) >= 0,
    ars_g2: (d, ae) => tenureArs(d, ae) >= 0,
    ars_g3: (d, ae) => !ae.sanDep,
    ars_g4: (d, ae) => !ae.ozilDep,
    ars_g5: (d, ae) => tenureArs(d, ae) >= 0,
    ars_w1: (d, ae) => !ae.wengerGone && d.season <= 2015,
    ars_w2: (d, ae) => !ae.wengerGone && d.season <= 2016,
    ars_o1: (d, ae) => !ae.ozilDep,
    ars_o2: (d, ae) => !ae.ozilDep && d.season <= 2018,
    ars_o4: (d, ae) => !ae.ozilDep && d.season >= 2015 && d.season <= 2018,
    ars_ct1: (d, ae) => tenureArs(d, ae) >= 0,
    ars_ct2: (d, ae) => tenureArs(d, ae) >= 1,
    ars_c1: (d, ae) => tenureArs(d, ae) >= 0,
    ars_c2: (d, ae) => tenureArs(d, ae) >= 0,
    ars_d4: (d, ae) => d.season === 2017,
    ars_c3: (d, ae) => tenureArs(d, ae) >= 1,
    ars_w9: (d, ae) => ae.wengerGone,
    ars_o5: (d, ae) => d.season >= 2019 && !ae.ozilDep,
    ars_o6: (d, ae) => d.season >= 2020 && !ae.ozilDep,
    ars_a5: (d, ae) => d.season >= 2020,
    ars_a7: (d, ae) => d.season === 2020 || d.season === 2021,
    ars_c4: (d, ae) => tenureArs(d, ae) >= 2,
    ars_s1: d => d.season === 2018 || d.season === 2019,
    ars_s5: d => d.season >= 2020,
    ars_d7: (d, ae) => d.season >= 2020 && d.season <= 2022 && seenA(ae, "ars_a7"),
    ars_x5: d => d.season >= 2020,
    ars_reg8: d => d.season >= 2017,
    ars_a8: d => d.season === 2022,
    ars_s4: d => d.season >= 2022,
    ars_s6: d => d.season >= 2022,
    ars_c6: d => d.season >= 2019,
    ars_a10: d => d.season >= 2023,
    ars_d6: (d, ae) => ae.ramdalDep,
    ars_reg1: (d, ae) => tenureArs(d, ae) >= 2,
    ars_reg4: (d, ae) => tenureArs(d, ae) >= 2,
    ars_reg5: (d, ae) => tenureArs(d, ae) >= 2,
    ars_reg6: (d, ae) => tenureArs(d, ae) >= 1,
    ars_reg7: d => d.season <= 2017,
    ars_gl2: (d, ae) => tenureArs(d, ae) >= 1,
    ars_gl3: (d, ae) => tenureArs(d, ae) >= 2,
    ars_x3: (d, ae) => tenureArs(d, ae) >= 1,
    ars_x6: (d, ae) => tenureArs(d, ae) >= 0,
    ars_x7: (d, ae) => tenureArs(d, ae) >= 2,
    ars_r6: (d, ae) => tenureArs(d, ae) >= 1,
    ars_y1: (d, ae) => tenureArs(d, ae) === 1,
    ars_y2: (d, ae) => tenureArs(d, ae) === 4,
    ars_y3: (d, ae) => tenureArs(d, ae) === 5,
    ars_z2: (d, ae) => tenureArs(d, ae) >= 7,
    ars_z3: (d, ae) => tenureArs(d, ae) >= 9,
    ars_o8: (d, ae) => ae.ozilDep,
    ars_r5: d => d.season >= 2018 && d.season <= 2020,
  };

  /* 阵容随真实日历迁移 */
  function injectSquadArs(d) {
    const yr = d.season;
    const t = teamInLD(ARS_NAME);
    if (!t || !t.players) return;
    if (!_baseCache[ARS_NAME]) _baseCache[ARS_NAME] = t.players.slice();
    const grow = (base, y0) => base + Math.max(0, yr - y0);
    let arr = _baseCache[ARS_NAME].slice();
    const out = [];
    if (yr >= 2015) out.push("什琴斯宁");
    if (yr >= 2017) out.push("桑切塞", "小老虎", "大吉鲁");
    if (yr >= 2018) out.push("卡索兰");
    if (yr >= 2019) out.push("科斯切尔宁", "队短塞");
    if (yr >= 2020) out.push("姆希塔良尔");
    if (yr >= 2021) out.push("厄弃儿诺");
    if (yr >= 2022) out.push("奥巴梅扬诺");
    if (yr >= 2024) out.push("拉姆斯代厄");
    arr = arr.filter(p => out.indexOf(p[0]) < 0);
    const inc = [];
    if (yr >= 2015) inc.push(["切赫斯", grow(33, 2015), "GK", "捷克", 84]);
    if (yr >= 2016) inc.push(["扎坎", grow(24, 2016), "CDM", "瑞士", 81], ["科拉希纳茨", grow(23, 2016), "LB", "波黑", 79]);
    if (yr >= 2017 && yr <= 2021) inc.push(["奥巴梅扬诺", grow(28, 2017), "ST", "加蓬", 85]);
    if (yr >= 2018 && yr <= 2019) inc.push(["姆希塔良尔", grow(29, 2018), "CAM", "亚美尼亚", 80], ["托雷兰", grow(22, 2018), "CDM", "乌拉圭", 79]);
    if (yr >= 2018) inc.push(["萨卡", grow(17, 2018), "RW", "英格兰", 76]);
    if (yr >= 2019) inc.push(["马丁内利斯", grow(18, 2019), "LW", "巴西", 78]);
    if (yr >= 2020) inc.push(["厄德高托", grow(22, 2020), "CAM", "挪威", 82], ["加布里埃尔", grow(23, 2020), "CB", "巴西", 80]);
    if (yr >= 2021 && yr <= 2023) inc.push(["本·怀特", grow(24, 2021), "CB", "英格兰", 80], ["拉姆斯代厄", grow(23, 2021), "GK", "英格兰", 79]);
    if (yr >= 2022) inc.push(["热苏塞", grow(25, 2022), "ST", "巴西", 83], ["津琴科", grow(25, 2022), "LB", "乌克兰", 80], ["萨利巴", grow(21, 2022), "CB", "法国", 81], ["维埃拉", grow(22, 2022), "CAM", "葡萄牙", 78]);
    if (yr >= 2023) inc.push(["赖斯", grow(24, 2023), "CDM", "英格兰", 85], ["哈弗茨尔", grow(24, 2023), "CAM", "德国", 83], ["特隆萨德", grow(28, 2023), "LW", "比利时", 80]);
    t.players = pushUnique(arr, inc);
    if (yr >= 2017) destAppend("棉都红魔", [["桑切塞", grow(29, 2018), "RW", "智利", 84]]);
    if (yr >= 2022) destAppend("巴塞罗纳", [["奥巴梅扬诺", grow(32, 2022), "ST", "加蓬", 82]]);
    const sou = teamInLD("南安普雷");
    if (sou && sou.players && yr >= 2024) destAppend("南安普雷", [["拉姆斯代厄", grow(26, 2024), "GK", "英格兰", 79]]);
  }

  function onInitSeasonArs(state) {
    const d = state.data;
    const ae = ensureArs(d);
    if (ae.joinSeason == null) {
      ae.joinSeason = d.season;
      ae.entry = (window.Youth ? Youth.entryOf(d) : ((d.player && d.player.age < 24) ? "youth" : "star"));
      ae.midJoin = !!(d.history && d.history.pastClubs && d.history.pastClubs.length);
      ae.prevClubs = (d.history && d.history.pastClubs ? d.history.pastClubs.slice() : []);
    }
    if (d.season >= 2015) ae.sanDep = true;
    if (d.season >= 2017) { ae.sanDep = true; }
    if (d.season >= 2018) ae.cazDep = true;
    if (d.season >= 2019) { ae.kosDep = true; ae.ramDep = true; }
    if (d.season >= 2020) ae.mkhDep = true;
    if (d.season >= 2021) ae.ozilDep = true;
    if (d.season >= 2022) ae.obaDep = true;
    if (d.season >= 2024) ae.ramdalDep = true;
    if (d.season >= 2018) ae.wengerGone = true;
    if (d.season >= 2020) ae.artetaIn = true;
    /* 日历队列（绝对年锚） */
    if (d.season === 2023) queueA(ae, "ars_gl4");   // 2023 社区盾（真实固定历史）
    injectSquadArs(d);
  }

  function onSeasonEndArs(state, x) {
    const d = state.data;
    const ae = ensureArs(d);
    const ss = x.ss;
    ae.clubGoals += (ss.goals || 0); ae.clubApps += (ss.apps || 0);
    const tn = tenureArs(d, ae);
    /* 教授告别链（season 2017 末=2017-18 季） */
    if (d.season === 2017) {
      if (!seenA(ae, "ars_w6") && !ae.wengerGone) queueA(ae, "ars_w6");
      if (seenA(ae, "ars_w6") && !seenA(ae, "ars_w8")) queueA(ae, "ars_w8");
    }
    /* 阿尔特坦退役+回家链 */
    if (d.season === 2015) { queueA(ae, "ars_a1"); }
    if (d.season === 2015 && seenA(ae, "ars_a1")) queueA(ae, "ars_a2");
    if (d.season === 2019) { queueA(ae, "ars_e2"); if (seenA(ae, "ars_e2")) queueA(ae, "ars_e3"); queueA(ae, "ars_e4"); queueA(ae, "ars_a4"); }
    /* 厄弃儿诺/离队 settle 链 */
    if (d.season === 2020 && !ae.ozilDep) queueA(ae, "ars_o7");
    if (d.season === 2017) { queueA(ae, "ars_d1"); queueA(ae, "ars_d2"); }
    if (d.season === 2018) queueA(ae, "ars_d3");
    if (d.season === 2021) queueA(ae, "ars_d5");
    /* armed 分流（无 pre 卡，同雾都白百合/棉都红魔模式） */
    const ccLoseNow = ae.reg2Armed && !x.ccChamp;
    ae.reg2Armed = false;
    if (ccLoseNow) {
      if (d.season === 2018 && !seenA(ae, "ars_e1")) queueA(ae, "ars_e1");
      else if (!seenA(ae, "ars_reg2")) queueA(ae, "ars_reg2");
    }
    if (ae.reg3Armed) {
      ae.reg3Armed = false;
      if (!x.cupChamp && !seenA(ae, "ars_reg4")) queueA(ae, "ars_reg4");
    }
    /* 冠军/杯赛特化 */
    const wasFirst = x.titleNow && !ae.firstTitle;
    if (x.titleNow) ae.firstTitle = true;
    if (x.cupChamp && d.season === 2014 && !seenA(ae, "ars_w3")) queueA(ae, "ars_w3");
    else if (x.cupChamp && d.season === 2014 && !seenA(ae, "ars_gl1")) queueA(ae, "ars_gl1");
    if (x.cupChamp && d.season === 2016 && !seenA(ae, "ars_w5")) queueA(ae, "ars_w5");
    else if (x.cupChamp && d.season === 2016 && !seenA(ae, "ars_gl2")) queueA(ae, "ars_gl2");
    if (x.cupChamp && d.season === 2019) {
      if (!seenA(ae, "ars_a6")) queueA(ae, "ars_a6");
      else if (!seenA(ae, "ars_x4")) queueA(ae, "ars_x4");
      else if (!seenA(ae, "ars_gl3")) queueA(ae, "ars_gl3");
    }
    if (wasFirst && !seenA(ae, "ars_gl5")) queueA(ae, "ars_gl5");
    else if (x.lgChamp && !seenA(ae, "ars_gl5")) queueA(ae, "ars_gl5");
    /* 亚军特化（a9 2022 领跑版优先，其余 reg3） */
    if (x.myRank === 2) {
      if (d.season === 2015 && !seenA(ae, "ars_w4")) queueA(ae, "ars_w4");
      if (d.season === 2022 && !seenA(ae, "ars_a9")) queueA(ae, "ars_a9");
      else if (d.season !== 2022 && !seenA(ae, "ars_reg3")) queueA(ae, "ars_reg3");
    }
    /* 圣托特纳姆日（排名高于雾都白百合） */
    if (x.myRank != null) {
      try {
        const tb = (window.SeasonSystem ? SeasonSystem.standings(state) : []) || [];
        const spurs = tb.find(t2 => t2.id === (window.ClubEvents.totId ? window.ClubEvents.totId() : null) || (window.LD && (function () { for (const [, lg] of Object.entries(window.LD())) { const tt = lg.teams.find(tt2 => tt2.name === "雾都白百合"); if (tt && tt.id === t2.id) return true; } return false; })()));
        const meRow = tb.find(t2 => t2.id === d.clubId);
        if (spurs && meRow && tb.indexOf(meRow) < tb.indexOf(spurs) && !seenA(ae, "ars_r2")) queueA(ae, "ars_r2");
      } catch (e) { /* ignore */ }
    }
    /* 年轮（tenure 相对） */
    if (!seenA(ae, "ars_y1") && tn === 1) queueA(ae, "ars_y1");
    if (!seenA(ae, "ars_y2") && tn === 4) queueA(ae, "ars_y2");
    if (!seenA(ae, "ars_y3") && tn === 5) queueA(ae, "ars_y3");
    /* z1 袖标（armed a2 或 tenure>=3） */
    if (!seenA(ae, "ars_z1") && (seenA(ae, "ars_a2") || tn >= 3)) queueA(ae, "ars_z1");
    ae.lastRank = x.myRank; ae.lastChamp = x.lgChamp;
  }

  function pickSilentArs(state, ctxs) {
    const d = state.data;
    if (d.retired) return null;
    const ae = ensureArs(d);
    const list = (ctxs || []).filter(Boolean);
    for (const raw of list) {
      const ctx = Object.assign({ d }, raw);
      const round = ctx.round || Math.round((d.dayIndex || 0) / 8);
      if ((d.injuryDays || 0) > 0) break;
      for (const m of ARS_MATCH_SEQ) {
        if (seenA(ae, m.id)) continue;
        let ok = false;
        try { ok = m.ok(d, ae, ctx); } catch (e) { ok = false; }
        if (ok) { markA(ae, m.id); ae.lastClubRound = round; return card(m.id); }
      }
      if (!gapOk(d, ae, round, 6)) break;
      for (const id of ARS_AMBIENT) {
        if (seenA(ae, id)) continue;
        const g = ARS_GUARDS[id];
        if (g) { try { if (!g(d, ae, ctx, state)) continue; } catch (e) { continue; } }
        markA(ae, id); ae.lastClubRound = round; return card(id);
      }
      break;
    }
    return null;
  }

  function pickPreArs(state, fixture) {
    const d = state.data;
    if (!atArs(d) || d.retired) return null;
    const ae = ensureArs(d);
    if ((d.injuryDays || 0) > 0) return null;
    const f = fixture && (fixture.match || fixture);
    const oppName = f ? ((f.home && f.home.id) === d.clubId ? (f.away && f.away.name) : (f.home && f.home.name)) : "";
    const round = fixture.round || Math.round((d.dayIndex || 0) / 8);
    const isLastLgRound = fixture.type === "league" && fixture.round === Math.max(0, ...d.fixtures.filter(x => x.type === "league").map(x => x.round || 0));
    /* armed 置位（先于叙事 return） */
    if (fixture.type === "cc_ko" && fixture.stage === 3 && !ae.reg2Armed) ae.reg2Armed = true;
    if (fixture.type === "cup" && fixture.stage === 3 && !ae.reg3Armed) ae.reg3Armed = true;
    /* 教授告别战（2017 末轮主战） */
    if (isLastLgRound && d.season === 2017 && !ae.wengerGone && !seenA(ae, "ars_w7")) {
      markA(ae, "ars_w7"); ae.lastClubRound = round; return card("ars_w7");
    }
    /* 德比 pre 特写 */
    if (oppName === "雾都白百合" && !seenA(ae, "ars_r1")) {
      markA(ae, "ars_r1"); ae.lastClubRound = round; return card("ars_r1");
    }
    if (oppName === "雾都蓝狮" && !seenA(ae, "ars_r4")) {
      markA(ae, "ars_r4"); ae.lastClubRound = round; return card("ars_r4");
    }
    return null;
  }

  /* ── 注册（装配层据此把符号解构回 club_events.js 的作用域）── */
  REG.push({
    key: "ars", name: "雾都火枪手", order: 100,
    at: atArs, id: arsId, ensure: ensureArs,
    sym: {
      ARS_NAME: ARS_NAME, arsId: arsId, atArs: atArs, ensureArs: ensureArs, seenA: seenA,
      markA: markA, queueA: queueA, tenureArs: tenureArs, ARS_MATCH_SEQ: ARS_MATCH_SEQ, ARS_AMBIENT: ARS_AMBIENT,
      ARS_GUARDS: ARS_GUARDS, injectSquadArs: injectSquadArs, onInitSeasonArs: onInitSeasonArs, onSeasonEndArs: onSeasonEndArs, pickSilentArs: pickSilentArs,
      pickPreArs: pickPreArs,
    },
    hooks: {
      onInitSeason: onInitSeasonArs, onSeasonEnd: onSeasonEndArs,
      pickSilent: pickSilentArs, pickPre: pickPreArs,
    },
  });
})(typeof window !== "undefined" ? window : global);
