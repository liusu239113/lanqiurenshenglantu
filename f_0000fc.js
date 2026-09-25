/* ============================================================================
   club_events2.js — 俱乐部专属事件引擎 · 第二期（P70：勒沃库申 + 莱比锡红牛）
   规格：docs/勒沃库申专属事件样板_v1.md（74 卡）/ docs/莱比锡专属事件样板_v1.md（71 卡）
   架构：不改 club_events.js（多特蒙顿引擎骨架不动）——本文件在 club_events.js 之后加载，
         对 window.ClubEvents 做包装派发（多特蒙顿优先 → 本引擎接管 bayer/rbl 槽）。
   槽位：d.clubEvents.bayer / d.clubEvents.rbl
   真实口径（对齐 P69 join-relative 先例）：
   · 药厂：本登尔 2014 在阵（25 岁起，tenure 6 末=2021 真实退役=泪点，tn>=7 移除）；
     亚洲一哥 tn0 末走(tn>=1 移除) / 塔赫 tn1 加盟 / 斯文·本登尔 tn3 来投(tn>=7 移除) /
     恰尔汗奥卢斯 tn2 末自由身走(tn>=3 移除) / 基斯林托 tn3 末退役(tn>=4 移除) /
     莱纳 tn3 末走(tn>=4 移除) / 赫拉德茨基·希克·维尔茨斯 tn4/tn6/tn6 真实加盟
   · 莱比锡：season>=2016 将帕登堡原地顶替为莱比锡红牛（真实升级，队 id 不变、
     赛程/杯赛池自然含新队）；凯坦 t1 末走 / 维尔那 t3 末走 + t6 真实回巢 /
     恩昆库 t3 / 奥尔莫 t4 / 塞斯科 t7 真实加盟；奥尔班 farewell ≥36 岁（tn>=13）
   铁律：触发唯一性（豁免=遗憾线 armed 结局）/ 泪点仅 farewell / 同条件排队 / 时序中性
   ============================================================================ */
(function () {
  if (!window.ClubEvents) return;   // 必须在 club_events.js 之后加载
  const CE1 = window.ClubEvents;

  const BAY_NAME = "勒沃库申", RBL_NAME = "莱比锡红牛", PB_NAME = "帕登堡";
  const RBL_SWAP_YEAR = 2016;      // 真实升级年（2016-17 德甲）
  const RBL_SQUAD_2016 = [          // 真实 2016-17 升班马核心（升入德甲阵容）
    ["古拉西", 26, "GK", "匈牙利", 80],
    ["奥尔班", 23, "CB", "匈牙利", 77],
    ["凯坦", 20, "CM", "几内亚", 78],
    ["福斯贝利", 24, "LW", "瑞典", 79],
    ["维尔那", 20, "ST", "德国", 79],
    ["波尔森", 22, "ST", "丹麦", 77],
  ];

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

  /* ── 存档槽位 ── */
  function ensureOf(d, slot) {
    d.clubEvents = d.clubEvents || {};
    d.clubEvents[slot] = d.clubEvents[slot] || {
      joinSeason: null, entry: null, midJoin: false, prevClubs: [],
      seen: {}, pending: [], lowStreak: 0, lastClubRound: -99,
      clubGoals: 0, clubApps: 0, lastRank: 0, lastChamp: false, firstTitle: false,
      reg1Armed: false, reg2Armed: false, reg3Armed: false,
      lgEver: false, ccEver: false, cupEver: false, lastCupChamp: false,
      farewellDone: false, forever: false,
    };
    return d.clubEvents[slot];
  }
  const seen = (ce, id) => !!ce.seen[id];
  const mark = (ce, id) => { ce.seen[id] = true; };
  function queue(ce, id) { if (!seen(ce, id)) { ce.pending.push(id); mark(ce, id); } }
  function tenure(d, ce) { return ce.joinSeason == null ? 0 : (d.season - ce.joinSeason); }

  function bayId() { const t = teamInLD(BAY_NAME); return t ? t.id : null; }
  function rblId() { const t = teamInLD(RBL_NAME); return t ? t.id : null; }
  function slotOf(d) {
    if (!d || d.clubId == null) return null;
    if (d.clubId === bayId()) return "bayer";
    if (d.clubId === rblId()) return "rbl";
    return null;
  }
  const legendAlive = (d, ce) => !ce.farewellDone && (slotOf(d) === "bayer" ? tenure(d, ce) < 7 : tenure(d, ce) < 13);

  /* ── 莱比锡 2016 升级：帕登堡原地顶替（id 不变，赛程/杯赛池自然继承）── */
  let _pbSnap = null;
  function syncSwap(d) {
    const year = (d && d.season) || 0;
    const pb = teamInLD(PB_NAME);
    if (pb) {
      if (!_pbSnap) _pbSnap = { name: pb.name, strength: pb.strength, players: pb.players.slice() };
      if (year >= RBL_SWAP_YEAR && !(d && d.clubId != null && d.clubId === pb.id)) {
        if (pb.name !== RBL_NAME) {
          pb.name = RBL_NAME; pb.strength = 79;
          pb.players = RBL_SQUAD_2016.map(p => p.slice());
        }
      }
      return;
    }
    const rbl = teamInLD(RBL_NAME);
    if (rbl && _pbSnap && year < RBL_SWAP_YEAR) {   // 新生涯回到 2014：还原帕登堡
      rbl.name = _pbSnap.name; rbl.strength = _pbSnap.strength; rbl.players = _pbSnap.players.slice();
    }
  }

  /* ── 阵容随真实时间线迁移（快照逐季重建；不污染 data_real）── */
  let _bayBase = null, _rblBase = null;
  function injectBayer(d, ce) {
    const t = teamInLD(BAY_NAME); if (!t || !t.players) return;
    if (!_bayBase) _bayBase = t.players.slice();
    const tn = tenure(d, ce);
    let arr = _bayBase.filter(p => !((p[0] === "亚洲一哥" && tn >= 1) || (p[0] === "恰尔汗奥卢斯" && tn >= 3) ||
      (p[0] === "基斯林托" && tn >= 4) || (p[0] === "莱纳" && tn >= 4)));
    if (tn < 7) arr.push(["本登尔", 25 + tn, "CDM", "德国", 81]);
    if (tn >= 1) arr.push(["塔", 19 + (tn - 1), "CB", "德国", 76]);
    if (tn >= 3 && tn < 7) arr.push(["斯文·本登尔", 28 + (tn - 3), "CB", "德国", 77]);
    if (tn >= 4) arr.push(["赫拉德茨基", 28 + (tn - 4), "GK", "芬兰", 80]);
    if (tn >= 6) arr.push(["希克", 24 + (tn - 6), "ST", "捷克", 79]);
    if (tn >= 6) arr.push(["维尔茨斯", 17 + (tn - 6), "CAM", "德国", 84]);
    t.players = arr;
  }
  function injectRbl(d, ce) {
    const t = teamInLD(RBL_NAME); if (!t || !t.players) return;
    if (!_rblBase) _rblBase = t.players.slice();
    const tn = tenure(d, ce);
    let arr = _rblBase.filter(p => !((p[0] === "凯坦" && tn >= 2) || (p[0] === "维尔那" && tn >= 4)));
    if (tn >= 3) arr.push(["恩昆库", 21 + (tn - 3), "CAM", "法国", 80]);
    if (tn >= 4) arr.push(["奥尔莫", 20 + (tn - 4), "CAM", "西班牙", 79]);
    if (tn >= 6) arr.push(["维尔那", 24 + (tn - 6), "ST", "德国", 82]);
    if (tn >= 7) arr.push(["塞斯科", 20 + (tn - 7), "ST", "斯洛文尼亚", 76]);
    t.players = arr;
  }

  /* ── 出卡（对齐多特蒙顿 showC：seen 兜底 / bodyStar 身份档 / badge 战利品）── */
  function showC(state, id, ctx, onDone) {
    const c = card(id);
    if (!c) { onDone && onDone(); return false; }
    const d = state.data;
    const slot = slotOf(d); if (!slot) { onDone && onDone(); return false; }
    const ce = ensureOf(d, slot);
    if (!ce.seen[id]) mark(ce, id);
    const cc = Object.assign({}, c);
    if (cc.bodyStar && ce.entry === "star") cc.body = cc.bodyStar;
    if (cc.options) cc.options = cc.options.map(o => ({ text: o.text, response: o.response, fx: o.fx, badge: o.badge }));
    try {
      window.EventCards._showCard(state, cc, { ctx: Object.assign({ d }, ctx) }, () => {
        const self = cc.options && cc.options.find(o => o.badge);
        if (self && self.badge) {
          d.trophies = d.trophies || [];
          d.trophies.push({ name: self.badge, icon: "", season: d.season });
          State.save();
        }
        onDone && onDone();
      });
      return true;
    } catch (e) { return false; }
  }

  /* ── 五幕一：出场 ≥3 后入队 ── */
  function tryAct1(state, slot) {
    const d = state.data;
    const ce = ensureOf(d, slot);
    const id = (slot === "bayer" ? "b04_" : "rbl_") + "act1";
    if (seen(ce, id)) return false;
    if (((d.seasonStats && d.seasonStats.apps) || 0) < 3) return false;
    return showC(state, id, {}, null);
  }

  /* ── forever 特化（一生一队卡即开关；选项即宣誓）── */
  function showForeverMine(state, slot) {
    const d = state.data;
    const ce = ensureOf(d, slot);
    const id = (slot === "bayer" ? "b04_" : "rbl_") + "forever";
    mark(ce, id);
    const c = Object.assign({}, card(id) || { title: "一生一队", body: "" });
    window.EventCards._showCard(state, c, { ctx: { d } }, () => {});
    setTimeout(() => {
      const btns = document.querySelectorAll(".ec-opt");
      btns.forEach(btn => {
        btn.onclick = () => {
          ce.forever = true;
          d.trophies = d.trophies || [];
          d.trophies.push({ name: "一生一队", icon: "", season: d.season });
          State.save();
          window.CardHost.close();
        };
      });
    }, 0);
    return true;
  }

  /* ── 挽留链第 2 轮特化（act4a；transfer.onStayWithOffers 调用）── */
  function retentionOverrideMine(state, done) {
    const d = state.data;
    const slot = slotOf(d); if (!slot) return false;
    const ce = ensureOf(d, slot);
    const id = (slot === "bayer" ? "b04_" : "rbl_") + "act4a";
    if (!seen(ce, (slot === "bayer" ? "b04_" : "rbl_") + "act1") || seen(ce, id) || !legendAlive(d, ce)) return false;
    mark(ce, id);
    const c = Object.assign({}, card(id) || { title: "留下", body: "" });
    const T = window.Transfer;
    window.EventCards._showCard(state, c, { ctx: { d } }, () => {});
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
            done && done(slot === "bayer"
              ? "你留下了。他把训练服叠好放上你的柜子：\u201c处方不变。\u201d（续约 2 年）"
              : "你留下了。他签字画押：\u201c加练搭子，终身有效。\u201d（续约 2 年）");
          } else {
            t.retention = 0;
            window.CardHost.close();
            T.startFrozen(state, slot === "bayer" ? "拒绝了本登尔的挽留" : "拒绝了奥尔班的挽留");
          }
        };
      });
    }, 0);
    return true;
  }

  /* ── 赛季初始化挂钩 ── */
  function onInitSeason(state, clubId) {
    const d = state.data;
    syncSwap(d);
    const slot = clubId === bayId() ? "bayer" : (clubId === rblId() ? "rbl" : null);
    if (slot) {
      const ce = ensureOf(d, slot);
      const P = slot === "bayer" ? "b04_" : "rbl_";
      const tn = tenure(d, ce);
      if (ce.joinSeason == null) {
        ce.joinSeason = d.season;
        ce.entry = (window.Youth ? Youth.entryOf(d) : ((d.player && d.player.age < 24) ? "youth" : "star"));
        ce.midJoin = !!(d.history && d.history.pastClubs && d.history.pastClubs.length);
        ce.prevClubs = (d.history && d.history.pastClubs ? d.history.pastClubs.slice() : []);
        if (ce.midJoin) queue(ce, P + "mid1");
      }
      if (seen(ce, P + "act5a") && !seen(ce, P + "act5b")) queue(ce, P + "act5b");
      if (slot === "bayer") {
        injectBayer(d, ce);
        if (seen(ce, "b04_inj1") && !seen(ce, "b04_inj2")) queue(ce, "b04_inj2");
        if (seen(ce, "b04_farewell") && !seen(ce, "b04_cap")) queue(ce, "b04_cap");
        if (tenure(d, ce) === 6 && !seen(ce, "b04_wz")) queue(ce, "b04_wz");   // 维尔茨斯 2020 真实提拔
      } else {
        injectRbl(d, ce);
        if (seen(ce, "rbl_inj1") && !seen(ce, "rbl_inj2")) queue(ce, "rbl_inj2");
        if (seen(ce, "rbl_farewell") && !seen(ce, "rbl_cap")) queue(ce, "rbl_cap");
        if (tenure(d, ce) === 1 && !seen(ce, "rbl_kt4")) queue(ce, "rbl_kt4"); // 凯坦 2017-08 真实官宣前告知
        if (tenure(d, ce) >= 6 && seen(ce, "rbl_wn5") && !seen(ce, "rbl_wn7")) queue(ce, "rbl_wn7"); // 维尔那 2022 真实回巢
      }
      return;
    }
    // 玩家不在两线时也维持两队阵容快照（join 槽未锚定 → 基线状态）
    safe(() => injectBayer(d, ensureOf(d, "bayer")));
    safe(() => injectRbl(d, ensureOf(d, "rbl")));
  }

  /* ── 赛季结算挂钩 ── */
  function onSeasonEnd(state) {
    const d = state.data;
    const slot = slotOf(d); if (!slot) return;
    const ce = ensureOf(d, slot);
    const P = slot === "bayer" ? "b04_" : "rbl_";
    const tn = tenure(d, ce);
    const ss = d.seasonStats || {};
    ce.clubGoals += (ss.goals || 0);
    ce.clubApps += (ss.apps || 0);
    const table = (window.SeasonSystem ? SeasonSystem.standings(state) : []) || [];
    const myRank = table.findIndex(t => t.id === d.clubId) + 1 || ce.lastRank || 99;
    const cupChamp = !!(d.cup && d.cup.alive === "champion");
    const ccChamp = !!(d.cc && d.cc.alive === "champion");
    const lgChamp = myRank === 1;
    const titleNow = lgChamp || cupChamp || ccChamp;

    /* 1) 传奇告别（唯一泪点）：本登尔 tenure 6 末 / 奥尔班 36 岁（tn>=13）*/
    if (!ce.farewellDone && (slot === "bayer" ? tn >= 6 : tn >= 13)) {
      ce.farewellDone = true;
      queue(ce, P + "farewell");
    }
    /* 2) 遗憾线结局（真实赛果二选一；允许失败）*/
    if (ce.reg1Armed) { ce.reg1Armed = false; ce.pending.push(lgChamp ? P + "reg1_win" : P + "reg1_lose"); }
    if (ce.reg2Armed) { ce.reg2Armed = false; ce.pending.push(ccChamp ? P + "reg2_win" : P + "reg2_lose"); }
    if (slot === "bayer" && ce.reg3Armed) { ce.reg3Armed = false; ce.pending.push(cupChamp ? "b04_reg3_win" : "b04_reg3_lose"); }
    /* 3) 冠军瀑布（铁律 P70b：首冠门控——「第一座/历史首冠」只在真实队史首冠触发；
       卫冕卡校验连续性；冠军数量叙述一律与玩家真实赛果一致）*/
    const firstLg = lgChamp && !ce.lgEver;
    const firstCc = ccChamp && !ce.ccEver;
    const firstCup = cupChamp && !ce.cupEver;
    if (lgChamp) ce.lgEver = true;
    if (ccChamp) ce.ccEver = true;
    if (cupChamp) ce.cupEver = true;
    if (titleNow) {
      if (firstLg) { ce.firstTitle = true; queue(ce, P + "champ1"); }
      else if (firstCup) { ce.firstTitle = true; queue(ce, P + "cup1"); }
      else if (!ce.firstTitle) { ce.firstTitle = true; queue(ce, P + "supercup"); }
      else if (slot === "bayer" && lgChamp && ce.lastChamp && seen(ce, "b04_champ1") && !seen(ce, "b04_repeat")) queue(ce, "b04_repeat");
      else if (slot === "rbl" && cupChamp && ce.lastCupChamp && seen(ce, "rbl_cup1") && !seen(ce, "rbl_cup2")) queue(ce, "rbl_cup2");
    }
    /* 4) 足球先生：单季 ≥2 冠且含联赛（传奇在场）*/
    if (legendAlive(d, ce)) {
      let n = 0; if (lgChamp) n++; if (cupChamp) n++; if (ccChamp) n++;
      if (lgChamp && n >= 2 && !seen(ce, P + "potg")) queue(ce, P + "potg");
    }
    /* 5) 幕三：亚军夜（传奇在场）*/
    if (myRank === 2 && !seen(ce, P + "act3") && legendAlive(d, ce)) queue(ce, P + "act3");
    /* 6) forever（一生一队；tenure 2 起，幕一已开）*/
    if (tn === 2 && seen(ce, P + "act1") && !ce.forever && !seen(ce, P + "forever")) queue(ce, P + "forever");
    if (slot === "bayer") {
      /* 7) 离队组告知+告别链（真实时间锚）*/
      if (tn === 0) { queue(ce, "b04_sn3"); queue(ce, "b04_sn4"); }        // 亚洲一哥 2015-05 真实官宣
      if (tn === 2) { queue(ce, "b04_ch4"); queue(ce, "b04_ch5"); }        // 恰尔汗奥卢斯 2017 自由身
      if (tn === 3) queue(ce, "b04_ks4");                                   // 基斯林托 2018 真实退役
      if (tn === 4) queue(ce, "b04_bl");                                    // 布兰滕 2019 真实转会多特蒙顿
      if (tn === 5 && !seen(ce, "b04_tw2")) queue(ce, "b04_tw2");          // 兄弟官宣（告别前季末）
      if (tn >= 1 && (ss.goals || 0) >= 15 && !seen(ce, "b04_sn6")) queue(ce, "b04_sn6"); // 隔时区的射手榜（亚洲一哥走后）
      if (ce.clubApps >= 250 && !seen(ce, "b04_appear")) queue(ce, "b04_appear");        // 里程碑按真实累计触发
      if (ce.clubGoals >= 120 && ce.clubGoals < 160 && !seen(ce, "b04_record")) queue(ce, "b04_record"); // 逼近队史纪录（162）才说「还差一点」
    } else {
      if (tn === 1) queue(ce, "rbl_kt5");                                   // 凯坦 2018-07 真实交割
      if (tn === 3) { queue(ce, "rbl_wn4"); queue(ce, "rbl_wn5"); }        // 维尔那 2020-06 真实官宣
    }
    /* 8) 里程碑（数值真实口径）+ 退役季雕像 */
    if (ce.clubApps >= 250 && !seen(ce, P + "appear")) queue(ce, P + "appear");
    if (slot === "rbl" && ce.clubGoals >= 60 && ce.clubGoals < 95 && !seen(ce, "rbl_record")) queue(ce, "rbl_record"); // 逼近维尔那队史纪录才说「打我的脸」
    if (tn >= 1 && (d.player && d.player.age >= 34) && !seen(ce, P + "act5c")) queue(ce, P + "act5c");
    ce.lastCupChamp = cupChamp;
    ce.lastRank = myRank;
    ce.lastChamp = lgChamp;
  }

  /* ── 比赛结果挂钩（同条件排队铁律）── */
  const BAY_MATCH = [
    { id: "b04_act2a", ok: (d, ce, c) => legendAlive(d, ce) && (c.userGoals || 0) >= 1 },
    { id: "b04_sn2", ok: (d, ce, c) => tenure(d, ce) < 1 && (c.userGoals || 0) >= 1 },
    { id: "b04_ch2", ok: (d, ce, c) => tenure(d, ce) < 3 && (c.userGoals || 0) >= 1 },
    { id: "b04_bb", ok: (d, ce, c) => tenure(d, ce) === 0 && c.res === "win" && (c.margin || 0) >= 3 },
    { id: "b04_trio", ok: (d, ce, c) => legendAlive(d, ce) && c.res === "win" && (c.userGoals || 0) >= 1 && (c.margin || 0) >= 2 },
    { id: "b04_nightgoal", ok: (d, ce, c) => c.res === "win" && (c.userGoals || 0) >= 1 },
    { id: "b04_kissbadge", ok: (d, ce, c) => c.res === "win" && (c.margin || 0) >= 3 },
    { id: "b04_act2b", ok: (d, ce, c) => legendAlive(d, ce) && ce.lowStreak >= 2 },
  ];
  const RBL_MATCH = [
    { id: "rbl_act2a", ok: (d, ce, c) => legendAlive(d, ce) && (c.userGoals || 0) >= 1 },
    { id: "rbl_trio", ok: (d, ce, c) => c.res === "win" && (c.userGoals || 0) >= 1 && (c.margin || 0) >= 2 && tenure(d, ce) < 4 },
    { id: "rbl_fb1", ok: (d, ce, c) => c.res === "win" && (c.userGoals || 0) >= 1 },
    { id: "rbl_wn2", ok: (d, ce, c) => tenure(d, ce) < 4 && (c.userGoals || 0) >= 1 },
    { id: "rbl_nightgoal", ok: (d, ce, c) => c.isCup && c.res === "win" && (c.userGoals || 0) >= 1 },
    { id: "rbl_kissbadge", ok: (d, ce, c) => c.res === "win" && (c.margin || 0) >= 3 },
    { id: "rbl_act2b", ok: (d, ce, c) => legendAlive(d, ce) && ce.lowStreak >= 2 },
  ];
  /* 氛围卡（上下文无关；间隔闸 6 轮；全卡生涯一次）*/
  const BAY_AMBIENT = ["b04_ks1", "b04_ks2", "b04_sn1", "b04_ch1", "b04_ch3", "b04_tw1", "b04_ks3",
    "b04_inj1", "b04_game", "b04_prank", "b04_fankid", "b04_birthday", "b04_tifo",
    "b04_city1", "b04_city2", "b04_city3", "b04_history1", "b04_history2", "b04_history3",
    "b04_ks5", "b04_ch7", "b04_bbq", "b04_y3", "b04_y6", "b04_mid3"];
  const BAY_GUARD = {
    b04_ks1: (d, ce) => tenure(d, ce) >= 1,
    b04_ks2: (d, ce) => tenure(d, ce) >= 1,
    b04_sn1: (d, ce) => tenure(d, ce) < 1,        // 亚洲一哥在阵
    b04_ch1: (d, ce) => tenure(d, ce) < 3,        // 恰尔汗奥卢斯在阵
    b04_ch3: (d, ce) => tenure(d, ce) < 3,
    b04_tw1: (d, ce) => tenure(d, ce) >= 3,       // 斯文 2017 真实来投
    b04_ks3: (d, ce) => tenure(d, ce) === 3,      // 400 场（2018 春）
    b04_inj1: (d, ce) => legendAlive(d, ce) && tenure(d, ce) >= 1,
    b04_birthday: (d, ce) => legendAlive(d, ce) && tenure(d, ce) >= 1,
    b04_tifo: (d, ce) => tenure(d, ce) >= 2,
    b04_city2: (d, ce) => tenure(d, ce) >= 1,
    b04_city3: (d, ce) => tenure(d, ce) >= 2,
    b04_history1: (d, ce) => tenure(d, ce) >= 1,
    b04_history2: (d, ce) => tenure(d, ce) >= 2,
    b04_history3: (d, ce) => tenure(d, ce) >= 3,
    b04_ks5: (d, ce) => tenure(d, ce) >= 4,       // 基斯林托退役后（楼上的人）
    b04_ch7: (d, ce) => tenure(d, ce) >= 3,       // 恰尔汗走后（配方的传人）
    b04_bbq: (d, ce) => tenure(d, ce) >= 1,
    b04_y3: (d, ce) => tenure(d, ce) === 3 && legendAlive(d, ce),
    b04_y6: (d, ce) => tenure(d, ce) === 6 && legendAlive(d, ce),
    b04_mid3: (d, ce) => legendAlive(d, ce) && tenure(d, ce) >= 3,   // 深夜的你为什么来
  };
  const RBL_AMBIENT = ["rbl_send1", "rbl_send2", "rbl_send3", "rbl_send4",
    "rbl_kt1", "rbl_kt2", "rbl_kt3", "rbl_wn1", "rbl_wn3", "rbl_ps2",
    "rbl_violin", "rbl_bach", "rbl_goethe", "rbl_stadium", "rbl_east",
    "rbl_city2", "rbl_city3", "rbl_game", "rbl_prank", "rbl_fankid", "rbl_bbq",
    "rbl_inj1", "rbl_tifo", "rbl_birthday", "rbl_y3", "rbl_y6", "rbl_y10", "rbl_y13", "rbl_wn8", "rbl_mid3"];
  const RBL_GUARD = {
    rbl_send1: (d, ce) => tenure(d, ce) >= 1,
    rbl_send2: (d, ce) => tenure(d, ce) >= 2,
    rbl_send3: (d, ce) => tenure(d, ce) >= 2,
    rbl_send4: (d, ce) => tenure(d, ce) >= 3,
    rbl_kt1: (d, ce) => tenure(d, ce) < 2,        // 凯坦在阵
    rbl_kt2: (d, ce) => tenure(d, ce) < 2,
    rbl_kt3: (d, ce) => tenure(d, ce) < 2,
    rbl_wn1: (d, ce) => tenure(d, ce) < 4,        // 维尔那在阵
    rbl_wn3: (d, ce) => tenure(d, ce) < 4,
    rbl_violin: (d, ce) => tenure(d, ce) >= 1,
    rbl_bach: (d, ce) => tenure(d, ce) >= 2,
    rbl_goethe: (d, ce) => tenure(d, ce) >= 1,
    rbl_stadium: (d, ce) => tenure(d, ce) >= 2,
    rbl_east: (d, ce) => tenure(d, ce) >= 3,
    rbl_city2: (d, ce) => tenure(d, ce) >= 1,
    rbl_city3: (d, ce) => tenure(d, ce) >= 2,
    rbl_bbq: (d, ce) => tenure(d, ce) >= 1,
    rbl_inj1: (d, ce) => tenure(d, ce) >= 2,
    rbl_tifo: (d, ce) => tenure(d, ce) >= 2,
    rbl_birthday: (d, ce) => tenure(d, ce) >= 1,
    rbl_y3: (d, ce) => tenure(d, ce) === 3 && legendAlive(d, ce),
    rbl_y6: (d, ce) => tenure(d, ce) === 6 && legendAlive(d, ce),
    rbl_y10: (d, ce) => tenure(d, ce) === 10 && legendAlive(d, ce),
    rbl_y13: (d, ce) => tenure(d, ce) === 13 && !ce.farewellDone,
    rbl_mid3: (d, ce) => legendAlive(d, ce) && tenure(d, ce) >= 3,   // 深夜的你为什么来  // 告别在 tn13 结算才挂，季中他还在
    rbl_wn8: (d, ce) => seen(ce, "rbl_wn7"),      // 回巢后
  };
  function gapOk(ce, round, gap) { return round - ce.lastClubRound >= gap; }

  function pickSilentMine(state, ctxs) {
    const d = state.data;
    const slot = slotOf(d); if (!slot || d.retired) return null;
    const ce = ensureOf(d, slot);
    const MATCH = slot === "bayer" ? BAY_MATCH : RBL_MATCH;
    const AMB = slot === "bayer" ? BAY_AMBIENT : RBL_AMBIENT;
    const GUARD = slot === "bayer" ? BAY_GUARD : RBL_GUARD;
    const list = (ctxs || []).filter(Boolean);
    for (const raw of list) {
      const ctx = Object.assign({ d }, raw);
      const round = ctx.round || Math.round((d.dayIndex || 0) / 8);
      if ((d.injuryDays || 0) > 0) break;
      for (const m of MATCH) {
        if (seen(ce, m.id)) continue;
        let ok = false;
        try { ok = m.ok(d, ce, ctx); } catch (e) { ok = false; }
        if (ok) { mark(ce, m.id); ce.lastClubRound = round; return card(m.id); }
      }
      if (!gapOk(ce, round, 6)) break;
      for (const id of AMB) {
        if (seen(ce, id)) continue;
        const g = GUARD[id];
        if (g) { try { if (!g(d, ce)) continue; } catch (e) { continue; } }
        mark(ce, id); ce.lastClubRound = round; return card(id);
      }
      break;
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

  /* ── 赛前挂钩 ── */
  function pickPreMine(state, fixture) {
    const d = state.data;
    const slot = slotOf(d); if (!slot || d.retired) return null;
    const ce = ensureOf(d, slot);
    if ((d.injuryDays || 0) > 0) return null;
    const f = fixture && (fixture.match || fixture);
    const me = f && f.home && f.home.id === d.clubId;
    const opp = f ? (me ? f.away : f.home) : null;
    const oppName = opp ? (opp.name || "") : "";
    const oppStrength = opp ? (opp.strength || 0) : 0;
    const isAway = !!(f && f.home && f.home.id !== d.clubId);
    const round = fixture.round || Math.round((d.dayIndex || 0) / 8);
    // 遗憾一：末轮争冠（距榜首 ≤2 分）
    if (fixture.type === "league") {
      const rounds = Math.max(0, ...d.fixtures.filter(x => x.type === "league").map(x => x.round || 0));
      if (fixture.round === rounds && !ce.reg1Armed && !ce.lgEver) {
        const table = (window.SeasonSystem ? SeasonSystem.standings(state) : []) || [];
        const meRow = table.find(t => t.id === d.clubId);
        const top = table[0];
        if (meRow && top && top.pts - meRow.pts <= 2) {
          ce.reg1Armed = true;
          return card(slot === "bayer" ? "b04_reg1_pre" : "rbl_reg1_pre");
        }
      }
    }
    // 遗憾二：洲际杯决赛（armed 每届可重复）
    if (fixture.type === "cc_ko" && fixture.stage === 3 && !ce.reg2Armed && !ce.ccEver) {
      ce.reg2Armed = true;
      return card(slot === "bayer" ? "b04_reg2_pre" : "rbl_reg2_pre");
    }
    // 遗憾三（仅药厂）：国内杯赛决赛（2002/2020 柏凌旧账）
    if (slot === "bayer" && fixture.type === "cup" && fixture.stage === 3 && !ce.reg3Armed && !ce.cupEver) {
      ce.reg3Armed = true;
      return card("b04_reg3_pre");
    }
    const seq = [];
    if (slot === "bayer") {
      if (oppName === "科伦" || oppName === "门兴格拉德堡") seq.push("b04_derby");   // 莱茵德比
      if (oppName && oppName.indexOf("慕城红星") >= 0) seq.push("b04_enemy1");
      if (oppName && ce.prevClubs && ce.prevClubs.indexOf(oppName) >= 0) seq.push("b04_mid2");
      if (oppName === "雾都白百合" && tenure(d, ce) >= 1 && !seen(ce, "b04_sn5")) seq.push("b04_sn5");     // 亚洲一哥重逢
      if (oppName === "米岚红黑" && tenure(d, ce) >= 3 && !seen(ce, "b04_ch6")) seq.push("b04_ch6");   // 恰尔汗重逢
    } else {
      if (isAway && oppStrength >= 85 && !seen(ce, "rbl_hated")) seq.push("rbl_hated");              // 客场的嘘声
      if (oppName === "利武浦" && tenure(d, ce) >= 2 && !seen(ce, "rbl_kt6")) seq.push("rbl_kt6");   // 凯坦重逢
      if (oppName === "雾都蓝狮" && tenure(d, ce) >= 4 && !seen(ce, "rbl_wn6")) seq.push("rbl_wn6");   // 维尔那重逢
      if (oppName && ce.prevClubs && ce.prevClubs.indexOf(oppName) >= 0) seq.push("rbl_mid2");
    }
    for (const id of seq) {
      if (seen(ce, id)) continue;
      mark(ce, id);
      ce.lastClubRound = round;
      return card(id);
    }
    return null;
  }

  /* ── 赛后挂钩 ── */
  function onResultMine(state, ctx, onDone) {
    const d = state.data;
    const slot = slotOf(d); if (!slot || d.retired) return false;
    const ce = ensureOf(d, slot);
    if (ctx && ctx.rating != null) ce.lowStreak = ctx.rating < 6.0 ? (ce.lowStreak + 1) : 0;
    const c = pickSilentMine(state, [ctx]);
    if (!c) return false;
    return showC(state, c.id, ctx || {}, onDone);
  }

  /* ── 待展示队列（Hub.enter 消费）── */
  function consumePendingMine(state) {
    const d = state.data;
    const slot = slotOf(d); if (!slot) return false;
    const ce = ensureOf(d, slot);
    const P = slot === "bayer" ? "b04_" : "rbl_";
    if (!ce.pending || !ce.pending.length) return tryAct1(state, slot);
    const id = ce.pending.shift();
    if (!card(id)) return consumePendingMine(state);
    if (id === P + "forever") return showForeverMine(state, slot);
    showC(state, id, {}, () => { State.save(); });
    return true;
  }

  /* ── 雪藏 / 离队挂钩 ── */
  function onFrozenMine(state) {
    const d = state.data;
    const slot = slotOf(d); if (!slot) return;
    const ce = ensureOf(d, slot);
    const id = (slot === "bayer" ? "b04_" : "rbl_") + "act4b";
    if (seen(ce, (slot === "bayer" ? "b04_" : "rbl_") + "act1") && !seen(ce, id) && legendAlive(d, ce)) queue(ce, id);
  }
  function onLeaveMine(state, fromClubName) {
    const d = state.data;
    const slot = slotOf(d); if (!slot) return;
    const ce = ensureOf(d, slot);
    const clubName = slot === "bayer" ? BAY_NAME : RBL_NAME;
    if (fromClubName === clubName && seen(ce, (slot === "bayer" ? "b04_" : "rbl_") + "act1") && !seen(ce, (slot === "bayer" ? "b04_" : "rbl_") + "act5a")) {
      queue(ce, (slot === "bayer" ? "b04_" : "rbl_") + "act5a");
    }
  }

  /* ── 对外派发（多特蒙顿引擎优先，本引擎接管 bayer/rbl）── */
  const mine = {
    onInitSeason, onSeasonEnd, pickSilent: pickSilentMine, noteSilent: noteSilentMine,
    pickPre: pickPreMine, onResult: onResultMine, consumePending: consumePendingMine,
    retentionOverride: retentionOverrideMine, onFrozen: onFrozenMine, onLeave: onLeaveMine,
    foreverOn: d => { if (!d) return false; const slot = slotOf(d); if (!slot) return false; return !!ensureOf(d, slot).forever; },
    canForever: () => false,   // 两线 forever 走专属卡（不挂 nation_dev 黄墙按钮）
    showForever: () => false,
  };
  window.ClubEvents = {
    ensure: d => { const slot = slotOf(d); return slot ? ensureOf(d, slot) : CE1.ensure(d); },
    onInitSeason: (state, clubId) => { safe(() => CE1.onInitSeason(state, clubId)); safe(() => mine.onInitSeason(state, clubId)); },
    onSeasonEnd: state => { safe(() => CE1.onSeasonEnd(state)); safe(() => mine.onSeasonEnd(state)); },
    pickSilent: (state, ctxs) => { const c = safe(() => CE1.pickSilent(state, ctxs), null); if (c) return c; return safe(() => mine.pickSilent(state, ctxs), null); },
    noteSilent: (state, ctxs) => { safe(() => CE1.noteSilent(state, ctxs)); safe(() => mine.noteSilent(state, ctxs)); },
    pickPre: (state, fixture) => { safe(() => { const dd = state && state.data; if (dd) syncSwap(dd); }); const c = safe(() => CE1.pickPre(state, fixture), null); if (c) return c; return safe(() => mine.pickPre(state, fixture), null); },
    onResult: (state, ctx, onDone) => { safe(() => { const dd = state && state.data; if (dd) syncSwap(dd); }); let h = safe(() => CE1.onResult(state, ctx, onDone), false); if (h) return true; return !!safe(() => mine.onResult(state, ctx, onDone), false); },
    consumePending: state => { safe(() => { const dd = state && state.data; if (dd) syncSwap(dd); }); const slot = state && state.data ? slotOf(state.data) : null; if (slot) return !!safe(() => mine.consumePending(state), false); return !!safe(() => CE1.consumePending(state), false); },
    foreverOn: d => !!safe(() => CE1.foreverOn(d), false) || !!safe(() => mine.foreverOn(d), false),
    canForever: (d) => !!safe(() => CE1.canForever(d), false),
    showForever: (state, rerender) => !!safe(() => CE1.showForever(state, rerender), false),
    retentionOverride: (state, done) => { let h = safe(() => CE1.retentionOverride(state, done), false); if (h) return true; return !!safe(() => mine.retentionOverride(state, done), false); },
    onFrozen: state => { safe(() => CE1.onFrozen(state)); safe(() => mine.onFrozen(state)); },
    onLeave: (state, from) => { safe(() => CE1.onLeave(state, from)); safe(() => mine.onLeave(state, from)); },
    /* ★ P97：`foreverLabel` 必须**逐层转发** —— 它只在 CE1 定义，
       而 `nation_dev` 的「宣誓」按钮用 `ClubEvents.foreverLabel(d)` 取文案。
       此前 CE2~CE6 全都没转发 → 所有非多特蒙顿球队都落到 `nation_dev` 的硬编码兜底，
       屏幕上是多特蒙顿的「向黄墙宣誓」（等于对每个玩家假设了出身）。 */
    foreverLabel: CE1.foreverLabel,
    atDor: CE1.atDor,
    reusAlive: CE1.reusAlive,
    _debug: Object.assign({}, CE1._debug || {}, { mine, slotOf, tenure, card, syncSwap }),
  };
})();
