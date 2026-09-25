/* ============================================================================
   club_events4.js — 俱乐部专属事件引擎 · 第四期（P78：花都红蓝 + 玛赛 + 理昂）
   蓝本：docs/花都红蓝专属事件样板_v1.md（75 卡）/ docs/玛赛专属事件样板_v1.md（70 卡）
         / docs/理昂专属事件样板_v1.md（70 卡，ga2 已并 r2）
   架构：不改 club_events.js / 2 / 3（前三期槽位不动）——本文件在 club_events3.js 之后
         加载，对 window.ClubEvents 再做一层包装派发（前三期槽位优先 → 本引擎接管
         psg/om/ol 槽）。
   槽位：d.clubEvents.psg / d.clubEvents.om / d.clubEvents.ol
   2014 全真口径：data_real ligue1 已 2014-15 化（大奉先/卡大佐/席尔瓦/拉卡泽滕/费基厄/
   帕耶滕/吉尼亚克尼均在 base）；阵容按真实转会日历逐季迁移（MOVE 表，只管本队）。
   数值铁律（P74/P78）：冠军序数由触发器保证；玩家运行时数字不进正文。
   armed 门控（onResult 精确锚）：em1=2017 欧冠负巴塞罗纳 / uclF=2020 决赛负 /
   semi24=2024 半决赛负 / ucl1=2025 决赛胜首冠（lgEver 互斥）/ om_p7=2018 决赛负 /
   ol_r4=2025 settle / ol_mv1=2016 init（热尔兰告别）。
   ============================================================================ */
(function () {
  if (!window.ClubEvents) return;   // 必须在 club_events3.js 之后加载
  const CE3 = window.ClubEvents;

  const PSG = "花都红蓝", OM = "玛赛", OL = "理昂";
  const CLUB_ID = { psg: PSG, om: OM, ol: OL };
  const SLOTS = ["psg", "om", "ol"];
  const CARDS = () => (window.CLUB_EVENT_CARDS && window.CLUB_EVENT_CARDS.byId) || {};
  const card = id => CARDS()[id] || null;
  const safe = (fn, fb) => { try { const r = fn(); return r === undefined ? fb : r; } catch (e) { return fb; } };

  function teamInLD(name) {
    if (!window.LD) return null;
    for (const [, lg] of Object.entries(window.LD())) {
      const x = lg.teams.find(x => x.name === name);
      if (x) return x;
    }
    return null;
  }
  const clubIdOf = {
    psg: () => { const t = teamInLD(PSG); return t ? t.id : null; },
    om: () => { const t = teamInLD(OM); return t ? t.id : null; },
    ol: () => { const t = teamInLD(OL); return t ? t.id : null; },
  };

  /* ── 存档槽位 ── */
  function ensureOf(d, slot) {
    d.clubEvents = d.clubEvents || {};
    d.clubEvents[slot] = d.clubEvents[slot] || {
      joinSeason: null, entry: null, midJoin: false, prevClubs: [],
      seen: {}, pending: [], lowStreak: 0, lastClubRound: -99,
      clubGoals: 0, clubApps: 0, lastRank: 0, lastChamp: false, firstTitle: false,
      lgEver: false, ccEver: false, cupEver: false, lastCcChamp: false,
      cc: (slot === "om" ? 1 : 0), ccStreak: 0, ccEver: (slot === "om"),       // 玛赛 1993 起算 1 座欧洲冠军
      d2Count: 0,                                     // 德比双杀计数（对花都/圣埃迪安）
      farewellDone: false, forever: false,
    };
    return d.clubEvents[slot];
  }
  const seen = (ce, id) => !!ce.seen[id];
  const mark = (ce, id) => { ce.seen[id] = true; };
  function queue(ce, id) { if (!seen(ce, id)) { ce.pending.push(id); mark(ce, id); } }
  function tenure(d, ce) { return ce.joinSeason == null ? 0 : (d.season - ce.joinSeason); }
  function slotOf(d) {
    if (!d || d.clubId == null) return null;
    for (const s of SLOTS) if (d.clubId === clubIdOf[s]()) return s;
    return null;
  }

  /* ── 阵容真实转会日历（快照重建；out 只移除本队，in 注入本队）──
     out: [名字, 移除起始 tn]；inn: [名字, 加入 tn, 年龄@加入, 位置, 国籍, OVR]
     ★★ P138 轴约定（P135 双锚立项核实结论）：本表 tn = **绝对年轴**（d.season - 2014），
     与 INIT/SETTLE/armed 同轴——「2021 年球王加入」就发生在 season 2021，晚入队者也正确。
     ★ tn 不是 tenure！别被变量名误导（P135 审计曾误读为「入队 tenure 平移」）。
     本线 y 系列 tenure 卡（om_y3/ol_y10 等）正文已核实零点名队友，无跨轴错位。 */
  const MOVE = {
    psg: {
      out: [["大奉先", 2], ["天使", 8], ["弟媳", 6], ["卡大佐", 6], ["马图伊迪德", 6], ["魔翼", 9], ["球王", 9], ["维拉迪", 9], ["姆皇", 10]],
      inn: [["天使", 1, 27, "RW", "阿根廷", 86], ["姆皇", 3, 18, "ST", "法国", 82], ["魔翼", 3, 25, "LW", "巴西", 89], ["德拉克斯勒", 3, 23, "AM", "德国", 82], ["伊卡尔迪尔", 5, 26, "ST", "阿根廷", 84], ["球王", 7, 34, "CF", "阿根廷", 93], ["多纳鲁曼", 7, 22, "GK", "意大利", 85], ["阿什拉夫", 7, 22, "RB", "摩洛哥", 84]],
    },
    om: {
      out: [["帕耶滕", 1], ["吉尼亚克尼", 1], ["安德烈·阿尤德", 1], ["曼丹丹", 2], ["巴舒亚伊德", 2], ["托万诺", 9]],
      inn: [["托万诺", 2, 23, "RW", "法国", 78], ["帕耶滕", 3, 29, "AM", "法国", 84], ["曼丹丹", 3, 32, "GK", "法国", 81], ["贡多齐", 8, 23, "CM", "法国", 80]],
    },
    ol: {
      out: [["戈纳隆托", 3], ["拉卡泽滕", 3], ["费基厄", 5], ["德彭", 7], ["乌姆蒂迪", 9]],
      inn: [["德彭", 3, 23, "ST", "荷兰", 82], ["穆萨·登贝莱尔", 4, 21, "ST", "法国", 80], ["拉卡泽滕", 8, 31, "ST", "法国", 83], ["托利苏", 8, 27, "CM", "法国", 80]],
    },
  };
  let _baseCache = null;
  function baseOf(slot) {
    if (!_baseCache) {
      _baseCache = {};
      const lg = (window.REAL_DATA && window.REAL_DATA.leagues && window.REAL_DATA.leagues.ligue1) || null;
      if (lg) for (const t of lg.teams) {
        if (t[0] === PSG) _baseCache.psg = (t[2] || []).slice();
        if (t[0] === OM) _baseCache.om = (t[2] || []).slice();
        if (t[0] === OL) _baseCache.ol = (t[2] || []).slice();
      }
      for (const s of SLOTS) _baseCache[s] = _baseCache[s] || [];
    }
    return _baseCache[slot];
  }
  const grow = (baseAge, baseYear) => Math.min(35, baseAge + Math.max(0, (arguments[2] || 0) - 0)) || baseAge; // 兼容占位
  function rebuildSquad(d, slot) {
    const t = teamInLD(CLUB_ID[slot]);
    if (!t) return;
    const tn = d.season - 2014;
    const mv = MOVE[slot];
    let arr = baseOf(slot).slice();
    for (const inn of mv.inn) {
      if (tn >= inn[1] && !arr.some(p => p[0] === inn[0])) {
        arr = arr.concat([[inn[0], Math.min(35, inn[2] + (tn - inn[1])), inn[3], inn[4], inn[5]]]);
      }
    }
    arr = arr.filter(p => {
      const o = mv.out.find(o2 => o2[0] === p[0] && tn >= o2[1]);
      if (!o) return true;
      const inn = mv.inn.find(i2 => i2[0] === p[0]);
      if (inn && tn >= inn[1] && inn[1] > o[1]) return true;   // 回归者：inn 晚于 out（拉卡泽滕/帕耶滕式）
      return false;
    });   // out 对 base 生效；回归者（inn 后）豁免
    t.players = arr;
  }

  /* ── act1 卡名（各槽主轴第一卡 id 不同）── */
  const SLOT_ACT1 = { psg: "psg_act1", om: "om_p1", ol: "ol_l1" };

  /* ── 卡片守卫表 ── */
  const atSlot = { psg: d => slotOf(d) === "psg", om: d => slotOf(d) === "om", ol: d => slotOf(d) === "ol" };
  const AMBIENT = {
    psg: ["psg_zl1", "psg_cav1", "psg_ny2", "psg_ms2", "psg_mb2", "psg_city1", "psg_city2", "psg_bday",
      "psg_en2", "psg_pst1", "psg_pst2", "psg_vl2", "psg_md1", "psg_dm1", "psg_mid1", "psg_mid2", "psg_mid3",
      "psg_kid1", "psg_kid2", "psg_vi1"],
    om: ["om_c1", "om_c2", "om_c3", "om_c4", "om_c5", "om_c6", "om_h1", "om_h2", "om_h3", "om_h4",
      "om_r1", "om_r3", "om_fan1", "om_fan2", "om_tb1", "om_tb2", "om_lo1", "om_lo2", "om_fn1", "om_mr1",
      "om_y3", "om_y6", "om_y10", "om_y13", "om_tw1", "om_tw2", "om_sn1", "om_sn2", "om_mi1", "om_mi2",
      "om_mg1", "om_mg2", "om_kid1", "om_kid2", "om_kid3", "om_mid1", "om_mid2", "om_mid3", "om_p4"],
    ol: ["ol_j1", "ol_dp2", "ol_um1", "ol_l5", "ol_l8", "ol_c1", "ol_c2", "ol_c3", "ol_c4", "ol_h1", "ol_h2",
      "ol_h3", "ol_k1", "ol_k2", "ol_k4", "ol_y3", "ol_y6", "ol_y10", "ol_y13", "ol_to1", "ol_to2",
      "ol_md1", "ol_md2", "ol_pa1", "ol_mi1", "ol_mi2", "ol_mi3", "ol_dp4", "ol_f1", "ol_f4",
      "ol_mid1", "ol_mid2", "ol_mid3"],
  };
  const GUARDS = {
    psg: {
      psg_zl1: d => d.season <= 2015, psg_cav1: d => d.season <= 2019, psg_ny2: d => d.season >= 2017 && d.season <= 2022,
      psg_ms2: d => d.season >= 2021 && d.season <= 2022, psg_mb2: d => d.season >= 2017,
      psg_en2: d => d.season >= 2023, psg_pst1: d => d.season <= 2019, psg_pst2: d => d.season >= 2019,
      psg_vl2: d => d.season >= 2023, psg_md1: d => d.season <= 2021, psg_dm1: d => d.season <= 2021,
      psg_vi1: d => d.season <= 2022, psg_bday: d => true, psg_city1: d => true, psg_city2: d => true,
      psg_mid1: (d, ce) => ce.midJoin, psg_mid2: (d, ce) => ce.midJoin && tenure(d, ce) >= 1, psg_mid3: (d, ce) => ce.midJoin && tenure(d, ce) >= 2, psg_kid1: d => true, psg_kid2: d => true,
    },
    om: {
      om_p4: d => d.season === 2015 || d.season === 2016, om_c1: d => true, om_c2: d => true, om_c3: d => true,
      om_c4: d => d.season >= 2016, om_c5: d => true, om_c6: d => true, om_h1: d => true, om_h2: d => true,
      om_h3: d => true, om_h4: d => true, om_r1: d => d.season >= 2017, om_r3: d => true,
      om_fan1: d => true, om_fan2: d => true, om_tb1: d => d.season >= 2017, om_tb2: d => d.season >= 2017,
      om_lo1: d => d.season >= 2021, om_lo2: d => d.season >= 2021, om_fn1: d => true, om_mr1: d => true,
      om_y3: (d, ce) => tenure(d, ce) === 3, om_y6: (d, ce) => tenure(d, ce) === 6,
      om_y10: (d, ce) => tenure(d, ce) === 10, om_y13: (d, ce) => tenure(d, ce) === 13,
      om_tw1: d => d.season === 2016, om_tw2: d => d.season === 2023, om_sn1: d => true, om_sn2: d => true,
      om_mi1: d => true, om_mi2: d => true, om_mg1: d => d.season >= 2017, om_mg2: d => d.season >= 2017,
      om_kid1: d => true, om_kid2: d => true, om_kid3: d => true,
      om_mid1: (d, ce) => ce.midJoin, om_mid2: (d, ce) => ce.midJoin && tenure(d, ce) >= 1, om_mid3: (d, ce) => ce.midJoin && tenure(d, ce) >= 2,
    },
    ol: {
      ol_j1: d => d.season <= 2018, ol_dp2: d => d.season >= 2017 && d.season <= 2020,
      ol_um1: d => d.season <= 2022, ol_l5: d => d.season >= 2017 && d.season <= 2021,
      ol_l8: d => d.season >= 2022, ol_c1: d => true, ol_c2: d => true, ol_c3: d => true,
      ol_c4: d => d.season >= 2016, ol_h1: d => true, ol_h2: d => true, ol_h3: d => true,
      ol_k1: d => true, ol_k2: d => d.season >= 2023, ol_k4: d => true,
      ol_y3: (d, ce) => tenure(d, ce) === 3, ol_y6: (d, ce) => tenure(d, ce) === 6,
      ol_y10: (d, ce) => tenure(d, ce) === 10, ol_y13: (d, ce) => tenure(d, ce) === 13,
      ol_to1: d => d.season >= 2022, ol_to2: d => d.season >= 2022, ol_md1: d => true, ol_md2: d => true,
      ol_pa1: d => d.season >= 2019 && d.season <= 2021, ol_mi1: d => true, ol_mi2: d => true,
      ol_mi3: d => true, ol_dp4: d => d.season >= 2018, ol_f4: d => d.season >= 2019,
      ol_mid1: (d, ce) => ce.midJoin, ol_mid2: (d, ce) => ce.midJoin && tenure(d, ce) >= 1, ol_mid3: (d, ce) => ce.midJoin && tenure(d, ce) >= 2,
    },
  };

  /* ── init 锚（onInitSeason 入队）── */
  const INIT = {
    psg: {
      psg_zl4: 2016, psg_ny1: 2017, psg_mb1: 2017, psg_th1: 2018, psg_cav4: 2021, psg_ms1: 2021,
      psg_dg1: 2021, psg_dg2: 2021, psg_en1: 2023, psg_mb6: 2025, psg_ucl1b: 2026,
    },
    om: { om_ga1: 2016, om_p5: 2017, om_md2: 2017, om_p10: 2024 },
    ol: { ol_mv1: 2016, ol_dp1: 2017, ol_j2: 2019, ol_ga1: 2019, ol_l6: 2022, ol_gr1: 2023, ol_sg1: 2023, ol_pr3: 2023 },
  };

  /* ── settle 锚（onSeasonEnd 入队；y = d.season）── */
  const SETTLE = {
    psg: {
      psg_bk1: y => y === 2015, psg_bk2: y => y === 2016, psg_zl3: y => y === 2016,
      psg_cav2: y => y === 2018, psg_cav3: y => y === 2020, psg_th2: y => y === 2020,
      psg_mb3: y => y === 2022, psg_ny4: y => y === 2023, psg_ms3: y => y === 2023,
      psg_mb4: y => y === 2023, psg_mb5: y => y === 2024,
    },
    om: {
      om_p3: y => y === 2015, om_bi3: y => y === 2015, om_gi1: y => y === 2015, om_im1: y => y === 2015,
      om_md1: y => y === 2016, om_bs1: y => y === 2016, om_ga2: y => y === 2018, om_p9: y => y === 2023,
      om_tw2: y => y === 2023,
    },
    ol: {
      ol_r1: y => y === 2020,
      ol_l4: y => y === 2017, ol_go1: y => y === 2017, ol_gn1: y => y === 2019, ol_f3: y => y === 2018,
      ol_f2: y => y === 2018, ol_um2: y => y === 2018, ol_f4: y => y === 2019, ol_dp3: y => y === 2021,
      ol_j4: y => y === 2021, ol_ga2: y => y === 2021, ol_gr1: y => y === 2023, ol_pr2: y => y === 2023,
      ol_um3: y => y === 2023, ol_r3: y => y === 2024, ol_r4: y => y === 2025, ol_l7: y => y === 2022,
      ol_l8: y => y === 2023,
    },
  };

  /* ── 荣誉卡（onSeasonEnd，titleNow 门控）── */
  function honorCards(d, ce, flags) {
    const { lgChamp, cupChamp, ccChamp } = flags;
    const slot = slotOf(d); const P = slot;
    if (flags.supercupChamp && !seen(ce, P + "_supercup")) queue(ce, P + "_supercup");
    if (lgChamp) {
      if (!ce.firstTitle) { ce.firstTitle = true; queue(ce, P + "_champ1"); }
      else if (ce.lastChamp && !seen(ce, P + "_repeat")) queue(ce, P + "_repeat");
    }
    if (cupChamp && !seen(ce, P + "_cup1")) queue(ce, P + "_cup1");
    if (lgChamp && cupChamp && !seen(ce, P + "_potg")) queue(ce, P + "_potg");
    if (ccChamp) {
      ce.cc += 1;
      if (!ce.ccEver) {
        ce.ccEver = true;
        if (slot === "psg" && d.season === 2025) queue(ce, "psg_ucl1");   // 写实首冠门控（lgEver 互斥由 ccEver 保证）
      }
    }
  }

  /* ── onResult 精确 armed（对手/赛事/胜负/yearOf 四锚）── */
  function armedOnResult(d, ce, ctx) {
    const slot = slotOf(d); const y = d.season;
    const comp = String(ctx.comp || ""), opp = String(ctx.oppName || ""), res = ctx.res;
    const isCc = comp.indexOf("洲际") >= 0, isFinal = comp.indexOf("决赛") >= 0, isSemi = comp.indexOf("半决赛") >= 0;
    if (slot === "psg") {
      if (y === 2017 && isCc && res === "lose" && opp === "巴塞罗纳" && !seen(ce, "psg_em1")) queue(ce, "psg_em1");
      if (y === 2020 && isCc && isFinal && res === "lose" && !seen(ce, "psg_uclF")) queue(ce, "psg_uclF");
      if (y === 2024 && isCc && isSemi && res === "lose" && !seen(ce, "psg_semi24")) queue(ce, "psg_semi24");
      if (y === 2025 && isCc && isFinal && res === "win" && !ce.ccEver && !seen(ce, "psg_ucl1")) { queue(ce, "psg_ucl1"); ce.cc += 1; ce.ccEver = true; }
    }
    if (slot === "om") {
      if (y === 2015 && res === "lose" && (ctx.round || 0) <= 1 && !seen(ce, "om_bi4")) queue(ce, "om_bi4");
      if (y === 2018 && isCc && isFinal && res === "lose" && !seen(ce, "om_p7")) queue(ce, "om_p7");
      if (y === 2018 && isCc && isSemi && res === "win" && !seen(ce, "om_p6")) queue(ce, "om_p6");
      if (opp === PSG && res === "win" && isCc === false) { ce.d2Count = (ce.d2Count || 0) + 1; }
    }
    if (slot === "ol") {
      if (opp === "圣埃迪安" && res === "win") { ce.d2Count = (ce.d2Count || 0) + 1; }
    }
  }

  /* ── 派发实现 ── */
  function onInitSeasonMine(state, clubId) {
    const d = state.data;
    const slot = slotOf(d); if (!slot) return;
    const ce = ensureOf(d, slot);
    if (ce.joinSeason == null) {
      ce.joinSeason = d.season;
      ce.entry = (window.Youth ? Youth.entryOf(d) : ((d.player && d.player.age < 24) ? "youth" : "star"));   // P78c：对齐 CE1/2/3（bodyStar 换档依赖此值）
      ce.midJoin = !!(d.history && d.history.pastClubs && d.history.pastClubs.length);
      ce.prevClubs = (d.history && d.history.pastClubs ? d.history.pastClubs.slice() : []);
      if (ce.midJoin) queue(ce, slot + "_mid1");
    }
    rebuildSquad(d, slot);
    ce.lastClubRound = -99;                          // P70b 口径：跨季重置轮次窗
    /* init 锚 */
    const table = INIT[slot];
    for (const id of Object.keys(table)) if (d.season === table[id]) queue(ce, id);
    /* act 链首卡（psg/ol 有主轴 pending；om 无 act 链） */
    if (slot !== "om" && ((d.seasonStats && d.seasonStats.apps) || 0) >= 0) { /* act1 走 consumePending 延迟检查 */ }
  }
  function onSeasonEndMine(state) {
    const d = state.data;
    const slot = slotOf(d); if (!slot) return;
    const ce = ensureOf(d, slot);
    const ss = d.seasonStats || {};
    ce.clubGoals += (ss.goals || 0); ce.clubApps += (ss.apps || 0);
    const table = (window.SeasonSystem ? SeasonSystem.standings(state) : []) || [];
    const myRank = table.findIndex(x => x.id === d.clubId) + 1 || ce.lastRank || 99;
    ce.lastRank = myRank;
    const cupChamp = !!(d.cup && d.cup.alive === 'champion');
    const ccChamp = !!(d.cc && d.cc.alive === 'champion');
    const lgChamp = myRank === 1;
    const titleNow = lgChamp || cupChamp || ccChamp;
    ce._lgChamp = lgChamp; ce._cupChamp = cupChamp; ce._ccChamp = ccChamp; ce._scChamp = false;
    /* settle 锚 */
    const sTable = SETTLE[slot];
    for (const id of Object.keys(sTable)) if (!seen(ce, id) && sTable[id](d.season)) queue(ce, id);
    /* 荣誉卡 */
    if (titleNow && !ce.firstTitle) { ce.firstTitle = true; queue(ce, slot + '_supercup'); if (lgChamp && !ce.lgEver) queue(ce, slot + '_champ1'); }
    else if (lgChamp && ce.lastChamp && seen(ce, slot + '_champ1') && !seen(ce, slot + '_repeat')) queue(ce, slot + '_repeat');
    else if (cupChamp && !ce.cupEver && !seen(ce, slot + '_cup1')) { ce.cupEver = true; queue(ce, slot + '_cup1'); }
    if (lgChamp && cupChamp && !seen(ce, slot + '_potg')) queue(ce, slot + '_potg');
    if (lgChamp) ce.lgEver = true;
    if (ccChamp) {
      ce.cc += 1;
      if (!ce.ccEver) { ce.ccEver = true; if (slot === 'psg' && d.season === 2025 && !seen(ce, 'psg_ucl1')) queue(ce, 'psg_ucl1'); }
    }
    ce.lastChamp = lgChamp;
    /* P96 体检：原此处为 `if (slot === "psg" && ce.clubApps >= 200 && !seen(ce, "psg_appear")) queue(ce, "psg_appear");`
       —— 但 psg_appear 这张卡从未定义（PSG 75 卡里没有它），于是每次入队后都被
       consumePending 的 `if (!card(id)) return consumePending(state)` 静默跳过，等价死代码。
       已移除，以免留下「引用了不存在的卡」的隐患。
       ★ 若确实要做「PSG 出场 200 次里程碑」，需先补卡数据 + 插画（psg 插画清单见 tools/_p86_artgen_psg.txt）。 */
    /* rank2 act 链 */
    if (myRank === 2) {
      if (slot === 'psg' && !seen(ce, 'psg_act3') && seen(ce, 'psg_act1')) queue(ce, 'psg_act3');
      if (slot === 'ol' && !seen(ce, 'ol_l3') && seen(ce, 'ol_l1')) queue(ce, 'ol_l3');
    }
    /* 德比双杀 */
    if ((ce.d2Count || 0) >= 2 && !seen(ce, slot + "_d2")) { queue(ce, slot + "_d2"); ce.d2Count = 0; }
  }
  function pickSilentMine(state, ctxs) {
    const d = state.data;
    const slot = slotOf(d); if (!slot) return null;
    const ce = ensureOf(d, slot);
    const ctx = (ctxs && ctxs.length) ? ctxs[ctxs.length - 1] : {};
    const round = ctx.round || 0;
    const gap = round - ce.lastClubRound;
    if (gap < 6) return null;
    /* armed 优先（yearOf 锚的一次性氛围：om_r2 2021 / om_bi2 2014 赛季中） */
    if (slot === "om" && d.season === 2021 && !seen(ce, "om_r2") && round >= 8) { ce.lastClubRound = round; return card("om_r2"); }
    if (slot === "om" && d.season === 2014 && round >= 8 && !seen(ce, "om_bi2")) { ce.lastClubRound = round; return card("om_bi2"); }
    for (const id of AMBIENT[slot]) {
      if (seen(ce, id)) continue;
      const g = GUARDS[slot][id];
      if (g && !safe(() => g(d, ce), false)) continue;
      ce.lastClubRound = round;
      return card(id);
    }
    return null;
  }
  function noteSilentMine(state, ctxs) {
    const d = state.data;
    const slot = slotOf(d); if (!slot) return;
    const ce = ensureOf(d, slot);
    const last = (ctxs && ctxs.length) ? ctxs[ctxs.length - 1] : null;
    if (last && last.rating != null) ce.lowStreak = last.rating < 6.0 ? (ce.lowStreak + 1) : 0;
  }
  function pickPreMine(state, fixture) {
    const d = state.data;
    const slot = slotOf(d); if (!slot) return null;
    const ce = ensureOf(d, slot);
    const opp = String(fixture && fixture.oppName || "");
    const comp = String(fixture && fixture.comp || "");
    const isCc = comp.indexOf("洲际") >= 0, isFinal = comp.indexOf("决赛") >= 0;
    if (slot === "psg" && opp === OM && !seen(ce, "psg_derby")) { mark(ce, "psg_derby"); return card("psg_derby"); }
    if (slot === "psg" && d.season === 2020 && isCc && isFinal && !seen(ce, "psg_uclF_pre")) { mark(ce, "psg_uclF_pre"); return card("psg_uclF_pre"); }
    if (slot === "psg" && d.season === 2025 && isCc && isFinal && !seen(ce, "psg_en3")) { mark(ce, "psg_en3"); return card("psg_en3"); }
    if (slot === "om" && opp === PSG && !seen(ce, "om_d1")) { mark(ce, "om_d1"); return card("om_d1"); }
    if (slot === "om" && isCc && !seen(ce, "om_h5") && tenure(d, ce) >= 1) { mark(ce, "om_h5"); return card("om_h5"); }
    if (slot === "ol" && opp === "圣埃迪安" && !seen(ce, "ol_d1")) { mark(ce, "ol_d1"); return card("ol_d1"); }
    if (slot === "ol" && opp === "曼德里白舰" && isCc && !seen(ce, "ol_be1")) { mark(ce, "ol_be1"); return card("ol_be1"); }
    return null;
  }
  function onResultMine(state, ctx, onDone) {
    const d = state.data;
    const slot = slotOf(d); if (!slot) return false;
    const ce = ensureOf(d, slot);
    const res = ctx.res, goals = ctx.goals || 0, opp = String(ctx.oppName || "");
    /* match 槽 */
    if (slot === "psg") {
      if (res === "win" && goals >= 1 && !seen(ce, "psg_act2a") && seen(ce, "psg_act1")) { mark(ce, "psg_act2a"); return !!showC(state, "psg_act2a", ctx, onDone); }
      else if (ce.lowStreak >= 2 && !seen(ce, "psg_act2b") && seen(ce, "psg_act1")) { queue(ce, "psg_act2b"); }
      if (res === "win" && goals >= 2 && !seen(ce, "psg_zl2") && d.season <= 2015) { mark(ce, "psg_zl2"); return !!showC(state, "psg_zl2", ctx, onDone); }
    }
    if (slot === "om") {
      if (res === "win" && goals >= 1 && !seen(ce, "om_p2") && seen(ce, "om_p1")) { mark(ce, "om_p2"); return !!showC(state, "om_p2", ctx, onDone); }
    }
    if (slot === "ol") {
      if (res === "win" && goals >= 1 && !seen(ce, "ol_l2") && seen(ce, "ol_l1")) { mark(ce, "ol_l2"); return !!showC(state, "ol_l2", ctx, onDone); }
    }
    armedOnResult(d, ce, ctx);
    return false;
  }
  function consumePendingMine(state) {
    const d = state.data;
    const slot = slotOf(d); if (!slot) return false;
    const ce = ensureOf(d, slot);
    if (ce.pending && ce.pending.length) {
      const id = ce.pending.shift();
      if (!card(id)) return consumePendingMine(state);
      showC(state, id, {}, () => { if (window.State) State.save(); });
      return true;
    }
    if (slot === 'om' && !seen(ce, 'om_p1') && ((d.seasonStats && d.seasonStats.apps) || 0) >= 3) {
      mark(ce, 'om_p1');
      showC(state, 'om_p1', {}, () => { if (window.State) State.save(); });
      return true;
    }
    /* act1 延迟检查 */
    if (slot !== "om") {
      const act1 = SLOT_ACT1[slot];
      if (!seen(ce, act1) && ((d.seasonStats && d.seasonStats.apps) || 0) >= 3) {
        mark(ce, act1);
        showC(state, act1, {}, () => { if (window.State) State.save(); });
        return true;
      }
    }
    return false;
  }
  function retentionOverrideMine(state, done) {
    const d = state.data;
    const slot = slotOf(d); if (!slot) return false;
    const ce = ensureOf(d, slot);
    const id = slot + "_act4a";
    if (slot === "ol") return false;                       // 理昂无 act4a（l4 走 settle）
    if (!seen(ce, slot + "_act1") || seen(ce, id)) return false;
    mark(ce, id);
    showC(state, id, {}, () => { if (window.State) State.save(); done && done(); });
    return true;
  }
  function onFrozenMine(state) {
    const d = state.data;
    const slot = slotOf(d); if (!slot || slot === "ol") return;
    const ce = ensureOf(d, slot);
    const id = slot + "_act4b";
    if (seen(ce, slot + "_act1") && !seen(ce, id)) queue(ce, id);
  }
  function onLeaveMine(state, fromClubName) {
    const d = state.data;
    const slot = slotOf(d); if (!slot) return;
    const ce = ensureOf(d, slot);
    if (fromClubName === CLUB_ID[slot] && !seen(ce, slot + "_act5a")) queue(ce, slot + "_act5a");
  }
  function showC(state, id, ctx, onDone) {
    const c = card(id);
    if (!c) { onDone && onDone(); return false; }
    const d0 = state.data;
    const slot = slotOf(d0);
    const ce = slot ? ensureOf(d0, slot) : (CE3.ensure ? CE3.ensure(d0) : {});
    if (!ce.seen[id]) mark(ce, id);
    const cc = Object.assign({}, c);
    if (cc.bodyStar && ce.entry === "star") cc.body = cc.bodyStar;
    if (cc.options) cc.options = cc.options.map(o => ({ text: o.text, response: o.response, fx: o.fx, badge: o.badge }));
    try {
      window.EventCards._showCard(state, cc, { ctx: Object.assign({ d: d0 }, ctx) }, () => {
        const self = cc.options && cc.options.find(o => o.badge);
        if (self && self.badge) {
          const dd = state.data;
          dd.trophies = dd.trophies || [];
          dd.trophies.push({ name: self.badge, icon: "", season: dd.season });
          if (window.State) State.save();
        }
        onDone && onDone();
      });
      return true;
    } catch (e) { onDone && onDone(); return false; }
  }

  /* ── 对外派发（前三期槽位优先，本引擎接管 psg/om/ol）── */
  const mine = {
    onInitSeason: onInitSeasonMine, onSeasonEnd: onSeasonEndMine, pickSilent: pickSilentMine,
    noteSilent: noteSilentMine, pickPre: pickPreMine, onResult: onResultMine,
    consumePending: consumePendingMine, retentionOverride: retentionOverrideMine,
    onFrozen: onFrozenMine, onLeave: onLeaveMine,
    foreverOn: d => { if (!d) return false; const slot = slotOf(d); if (!slot) return false; return !!ensureOf(d, slot).forever; },
    canForever: () => false, showForever: () => false,
  };
  window.ClubEvents = {
    ensure: d => { const slot = slotOf(d); return slot ? ensureOf(d, slot) : CE3.ensure(d); },
    onInitSeason: (state, clubId) => { safe(() => CE3.onInitSeason(state, clubId)); safe(() => mine.onInitSeason(state, clubId)); },
    onSeasonEnd: state => { safe(() => CE3.onSeasonEnd(state)); safe(() => mine.onSeasonEnd(state)); },
    pickSilent: (state, ctxs) => { const c = safe(() => CE3.pickSilent(state, ctxs), null); if (c) return c; return safe(() => mine.pickSilent(state, ctxs), null); },
    noteSilent: (state, ctxs) => { safe(() => CE3.noteSilent(state, ctxs)); safe(() => mine.noteSilent(state, ctxs)); },
    pickPre: (state, fixture) => { const c = safe(() => CE3.pickPre(state, fixture), null); if (c) return c; return safe(() => mine.pickPre(state, fixture), null); },
    onResult: (state, ctx, onDone) => { let h = safe(() => CE3.onResult(state, ctx, onDone), false); if (h) return true; return !!safe(() => mine.onResult(state, ctx, onDone), false); },
    consumePending: state => { const slot = state && state.data ? slotOf(state.data) : null; if (slot) return !!safe(() => mine.consumePending(state), false); return !!safe(() => CE3.consumePending(state), false); },
    foreverOn: d => !!safe(() => CE3.foreverOn(d), false) || !!safe(() => mine.foreverOn(d), false),
    canForever: d => !!safe(() => CE3.canForever(d), false),
    showForever: (state, rerender) => !!safe(() => CE3.showForever(state, rerender), false),
    retentionOverride: (state, done) => { let h = safe(() => CE3.retentionOverride(state, done), false); if (h) return true; return !!safe(() => mine.retentionOverride(state, done), false); },
    onFrozen: state => { safe(() => CE3.onFrozen(state)); safe(() => mine.onFrozen(state)); },
    onLeave: (state, from) => { safe(() => CE3.onLeave(state, from)); safe(() => mine.onLeave(state, from)); },
    /* ★ P97：逐层转发 `foreverLabel`（见 club_events2.js 的同名注释） */
    foreverLabel: CE3.foreverLabel,
    atDor: CE3.atDor, reusAlive: CE3.reusAlive,
    /* P78 调试口 */
    _fr: { slotOf, ensureOf, card, armedOnResult, rebuildSquad, honorCards },
  };
})();
