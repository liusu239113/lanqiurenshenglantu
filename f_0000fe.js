/* ============================================================================
   club_events3.js — 俱乐部专属事件引擎 · 第三期（P73：曼德里白舰 + 巴塞罗纳 + 曼德里红白）
   规格：docs/曼德里白舰专属事件样板_v1.md（75 卡 v1.1）/ docs/巴塞罗纳专属事件样板_v1.md（79 卡 v1.1）
         / docs/曼德里红白专属事件样板_v1.md（75 卡 v1.1）
   架构：不改 club_events.js / club_events2.js（多特蒙顿+药厂/莱比锡引擎骨架不动）——
         本文件在 club_events2.js 之后加载，对 window.ClubEvents 再做一层包装派发
         （前三期槽位优先 → 本引擎接管 rma/bar/atm 槽）。
   槽位：d.clubEvents.rma / d.clubEvents.bar / d.clubEvents.atm
   2014 全真口径：data_real 三强区块已 2014-15 化；阵容按真实转会日历逐季迁移（MOVE 表）；
   数值口径铁律（P74）：冠军序数由触发器保证（ce.cc 洲际冠军计数器 2014=10 起 /
   卫冕与三连判定 / 三冠王达成判定），玩家运行时数字不进正文。
   特殊分支：zidStay（齐祖挽留，用户已确认）；ucl15 黄黑决赛彩蛋（用户已确认保留）；
   曼德里红白 匪帮组/阴影组/夺冠游行组（v1.1）。
   ============================================================================ */
(function () {
  if (!window.ClubEvents) return;   // 必须在 club_events2.js 之后加载
  const CE2 = window.ClubEvents;

  const RMA = "曼德里白舰", BAR = "巴塞罗纳", ATM = "曼德里红白";
  const CLUB_ID = { rma: RMA, bar: BAR, atm: ATM };
  const CC_BASE = 10;               // 2014 夏史实：曼德里白舰已 10 座大耳朵
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
  const clubIdOf = { rma: () => { const t = teamInLD(RMA); return t ? t.id : null; },
                     bar: () => { const t = teamInLD(BAR); return t ? t.id : null; },
                     atm: () => { const t = teamInLD(ATM); return t ? t.id : null; } };

  /* ── 存档槽位 ── */
  function ensureOf(d, slot) {
    d.clubEvents = d.clubEvents || {};
    d.clubEvents[slot] = d.clubEvents[slot] || {
      joinSeason: null, entry: null, midJoin: false, prevClubs: [],
      seen: {}, pending: [], lowStreak: 0, lastClubRound: -99,
      clubGoals: 0, clubApps: 0, lastRank: 0, lastChamp: false, firstTitle: false,
      lgEver: false, ccEver: false, cupEver: false, lastCcChamp: false,
      cc: CC_BASE, ccStreak: 0,
      reg1Armed: false, reg2Armed: false, cupRmaArmed: false, ccBvbArmed: false,
      zidAsk: false, zidStay: false,
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
    for (const s of ["rma", "bar", "atm"]) if (d.clubId === clubIdOf[s]()) return s;
    return null;
  }
  /* ★★ P138 轴约定：水爷/小白走绝对年（真实告别年 2021/2018，晚入队者不再遇到——正确，
     因为 rma/bar 阵容有 MOVE 动态迁移，人走了就该在）；科克尔(atm)走 tenure（曼德里红白阵容坎文
     依赖他在队，且无独立迁移表）——两轴并存是设计选择，别「统一」掉。 */
  const FARE_TN = { rma: 6, bar: 3, atm: 14 };            // 告别结算季（tn）：水爷 2021 / 小白 2018 / 科克尔 36 岁
  const legendAlive = (d, ce, slot) => !ce.farewellDone && (slot === "atm"
    ? tenure(d, ce) < FARE_TN[slot] + 1
    : (d.season - ABS0) < FARE_TN[slot] + 1);

  /* ── 阵容真实转会日历迁移（快照逐季重建；不污染 data_real）──
     out: [名字, 移除的起始 tn]；inn: [名字, 加入 tn, 年龄@加入, 位置, 国籍, OVR] */
  const MOVE = {
    rma: {
      out: [["圣卡西", 1], ["总裁", 4], ["大圣", 8], ["水爷", 7], ["阿宽", 10], ["魔笛", 11]],
      inn: [["小熊", 4, 18, "LW", "巴西", 84], ["贝林厄姆尔", 9, 20, "CAM", "英格兰", 87], ["姆皇", 10, 25, "ST", "法国", 90]],
    },
    bar: {
      out: [["节拍器", 1], ["阿尔维塞", 2], ["魔翼", 3], ["小白", 4], ["苏神", 6], ["球王", 7], ["皮主任", 8]],
      inn: [["佩德里", 6, 18, "CM", "西班牙", 82], ["亚马尔", 8, 15, "RW", "西班牙", 82], ["莱万", 8, 34, "ST", "波兰", 88]],
    },
    atm: {
      out: [["曼朱基基", 1], ["图兰诺", 1], ["米兰达", 1], ["加比诺", 4], ["托雷塞", 4], ["戈丁尼", 5], ["格里兹曼尼", 5], ["菲利克塞", 8]],
      inn: [["托雷塞", 1, 31, "ST", "西班牙", 80], ["菲利克塞", 4, 19, "ST", "葡萄牙", 81], ["苏神", 6, 33, "ST", "乌拉圭", 86], ["格里兹曼尼", 7, 30, "ST", "法国", 87], ["阿尔瓦雷塞", 10, 24, "ST", "阿根廷", 86]],
    },
  };
  const _base = {};
  function inject3(d, ce, slot) {
    const t = teamInLD(CLUB_ID[slot]); if (!t || !t.players) return;
    if (!_base[slot]) _base[slot] = t.players.slice();
    const tn = atnOf(d);                                    // 真实转会日历按绝对年（玩家中途加入也正确；对手视角同步演进）
    let arr = _base[slot].filter(p => !MOVE[slot].out.some(o => p[0] === o[0] && tn >= o[1]));
    for (const inn of MOVE[slot].inn) {
      if (tn >= inn[1]) arr.push([inn[0], inn[2] + (tn - inn[1]), inn[3], inn[4], inn[5]]);
    }
    t.players = arr;
  }

  /* ── 出卡（seen 兜底 / bodyStar 身份档 / 选项级+卡级 badge 战利品）── */
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
        const self = (cc.options && cc.options.find(o => o.badge)) || (cc.badge ? { badge: cc.badge } : null);
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
    const id = slot + "_act1";
    if (seen(ce, id)) return false;
    if (((d.seasonStats && d.seasonStats.apps) || 0) < 3) return false;
    return showC(state, id, {}, null);
  }

  /* ── forever 特化（一生一队卡即开关；任何选项均宣誓）── */
  function showForeverMine(state, slot) {
    const d = state.data;
    const ce = ensureOf(d, slot);
    const id = slot + "_forever";
    mark(ce, id);
    const c = Object.assign({}, card(id) || { title: "一生一队", body: "" });
    window.EventCards._showCard(state, c, { ctx: { d } }, () => {
      ce.forever = true;
      d.trophies = d.trophies || [];
      d.trophies.push({ name: "一生一队", icon: "", season: d.season });
      State.save();
    });
    setTimeout(() => {
      const btns = document.querySelectorAll(".ec-opt");
      btns.forEach(btn => { btn.onclick = () => { ce.forever = true; State.save(); window.CardHost.close(); }; });
    }, 0);
    return true;
  }

  /* ── 挽留链第 2 轮特化（act4a；transfer.onStayWithOffers 调用）── */
  const STAY_MSG = {
    rma: "你留下了。他把一条白毛巾搭上你的肩：\u201c欢迎背上来。\u201d（续约 2 年）",
    bar: "你留下了。他把一件青训旧训练服放上你的柜子：\u201c欢迎继续扎根。\u201d（续约 2 年）",
    atm: "你留下了。他把一条红白围巾搭上你的肩：\u201c欢迎上船。\u201d（续约 2 年）",
  };
  const LEAVE_MSG = { rma: "拒绝了队长的挽留", bar: "拒绝了小白的挽留", atm: "拒绝了科克尔的挽留" };
  function retentionOverrideMine(state, done) {
    const d = state.data;
    const slot = slotOf(d); if (!slot) return false;
    const ce = ensureOf(d, slot);
    const zid3bReady = slot === "rma" && seen(ce, "rma_zid3") && !ce.zidAsk;
    if (zid3bReady) {
      ce.zidAsk = true;
      const c3 = Object.assign({}, card("rma_zid3b") || { title: "再借一年", body: "" });
      window.EventCards._showCard(state, c3, { ctx: { d } }, () => {});
      setTimeout(() => {
        const btns = document.querySelectorAll(".ec-opt");
        btns.forEach((btn, i) => {
          btn.onclick = () => {
            const t = window.Transfer && window.Transfer.ensure ? window.Transfer.ensure(d) : (d.transfer = d.transfer || {});
            t.retention = 0; t.seasonEndOffers = []; t.seasonEndMeta = null;
            if (i === 0) { ce.zidStay = true; State.save(); window.CardHost.close(); done && done("他签了名：「就一年。为你们这群贪心的。」（齐祖再借一年）"); }
            else { State.save(); window.CardHost.close(); done && done("你选择了沉默。史实照常——他在最顶点离开。"); }
          };
        });
      }, 0);
      return true;
    }
    const id = slot + "_act4a";
    if (!seen(ce, slot + "_act1") || seen(ce, id) || !legendAlive(d, ce, slot)) return false;
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
            done && done(STAY_MSG[slot]);
          } else {
            t.retention = 0;
            window.CardHost.close();
            T.startFrozen(state, LEAVE_MSG[slot]);
          }
        };
      });
    }, 0);
    return true;
  }

  /* ── 双时间轴 ──
     A 层（真实日历）：atn = d.season - 2014，era 卡/真人告别/教练任期/MOVE 转会/冠军年窗按绝对年；
       玩家中途加入时：锚年已过的 mark seen（历史不重放），锚年==当前的正好在加入季触发（切入），未来的按绝对年到。
     B 层（玩家生涯）：tenure = d.season - joinSeason，五幕/挽留/告别链/里程碑等师徒叙事按相对。 */
  const ABS0 = 2014;
  const atnOf = d => (d.season || ABS0) - ABS0;
  /* 追赶预标：锚年已过的 A 类卡沉默（历史不重放） */
  const ABS_PAST = {
    rma: [["rma_cas2",0],["rma_cas3",0],["rma_anc2",0],["rma_zid1",2],["rma_cr4",3],["rma_dark1",4],["rma_vin1",4],["rma_zid4",4],["rma_mod3",4],["rma_zid5",6],["rma_potg",8],["rma_bb1",9],["rma_kro2",9],["rma_mb1",10],["rma_mod4",10]],
    bar: [["bar_xav2",0],["bar_potg",1],["bar_ney4",2],["bar_pau1",3],["bar_pau3",4],["bar_valv2",5],["bar_leo4",5],["bar_su4",5],["bar_leo5",6],["bar_leo6",6],["bar_pedri",6],["bar_xc1",7],["bar_yamal",8],["bar_lg19",4],["bar_lg23",8],["bar_fl1",10],["bar_home",11]],
    atm: [["atm_tor1",1],["atm_calderon",2],["atm_metropolitano",3],["atm_gr4",3],["atm_tor3",3],["atm_god1",4],["atm_god2",4],["atm_gr5",4],["atm_fel1",5],["atm_sua1",6],["atm_gr6",7],["atm_sim3",6],["atm_fel3",8],["atm_sim4",10],["atm_lg21",6]],
  };
  function catchUp(ce, slot, atn) {
    for (const [id, anchor] of ABS_PAST[slot]) {
      if (atn > anchor && !ce.seen[id]) ce.seen[id] = 1;
    }
    /* 俱乐部荣誉史实基数校准：cc 洲际冠军计数器与 ccEver 对齐加入时点的真实值（曼德里白舰三连 2016-18 完成于 atn4；巴塞罗纳 2015 三冠王后 Ever 位） */
    if (slot === "rma") {
      if (atn >= 2) ce.cc = Math.max(ce.cc, 11);
      if (atn >= 3) ce.cc = Math.max(ce.cc, 12);
      if (atn >= 4) { ce.cc = Math.max(ce.cc, 13); ce.ccEver = true; }
    } else if (slot === "bar") {
      if (atn >= 1) { ce.lgEver = true; ce.ccEver = true; ce.cupEver = true; } // 2015 三冠王+卫冕联赛
    }
  }

  /* ── 赛季初始化挂钩 ── */
  function onInitSeason(state, clubId) {
    const d = state.data;
    const slot = ["rma", "bar", "atm"].find(s => clubId === clubIdOf[s]());
    if (slot) {
      const ce = ensureOf(d, slot);
      const tn = tenure(d, ce);
      const atn = atnOf(d);
      if (ce.joinSeason == null) {
        ce.joinSeason = d.season;
        ce.entry = (window.Youth ? Youth.entryOf(d) : ((d.player && d.player.age < 24) ? "youth" : "star"));
        ce.midJoin = !!(d.history && d.history.pastClubs && d.history.pastClubs.length);
        ce.prevClubs = (d.history && d.history.pastClubs ? d.history.pastClubs.slice() : []);
        if (ce.midJoin) queue(ce, slot + "_mid1");
        if (slot === "atm" && atn === 0) queue(ce, "atm_gr1"); // 同期生开局（仅 2014 夏建队；中途加入沉默）
        catchUp(ce, slot, atn);                                 // 中途加入：锚年已过的真实事件沉默
      }
      if (seen(ce, slot + "_act5a") && !seen(ce, slot + "_act5b")) queue(ce, slot + "_act5b");
      if (seen(ce, slot + "_inj1") && !seen(ce, slot + "_inj2")) queue(ce, slot + "_inj2");
      if (ce.farewellDone && !seen(ce, slot + "_cap")) queue(ce, slot + "_cap");
      if (slot === "rma") {
        if (atn === 2) queue(ce, "rma_zid1");               // 2016-01 齐祖上任
        if (atn === 4 && !ce.zidStay && seen(ce, "rma_cr4") && !seen(ce, "rma_dark1")) queue(ce, "rma_dark1"); // 2018-19 看衰季（zidStay 时被挽留改写）
        if (!ce.zidStay && atn === 4 && !seen(ce, "rma_zid4")) queue(ce, "rma_zid4");
        if (ce.zidStay && atn === 6 && !seen(ce, "rma_zid4")) queue(ce, "rma_zid4");
        const zid5tn = ce.zidStay ? 8 : 6;
        if (atn === zid5tn && seen(ce, "rma_zid4") && !seen(ce, "rma_zid5")) queue(ce, "rma_zid5"); // 二次辞职（真实 2021-05；借年顺延）
        if (atn === 4) queue(ce, "rma_vin1");               // 2018 小熊来投
        if (atn === 9) queue(ce, "rma_bb1");                // 2023 贝林厄姆尔
        if (atn === 10) queue(ce, "rma_mb1");               // 2024 姆皇
      } else if (slot === "bar") {
        if (atn === 3) queue(ce, "bar_pau1");               // 2017 夏：从中超来的巴西人（跨线互文 · 与恒大 gv_pl 组镜像）
        if (atn === 4) queue(ce, "bar_pau3");               // 2018 夏：他租借回去了
        if (atn === 6) queue(ce, "bar_pedri");              // 2020 佩德里来投
        if (atn === 7) queue(ce, "bar_xc1");                // 2021-11 节拍器回归执教
        if (atn === 8) { queue(ce, "bar_yamal"); }          // 2023 亚马尔
        if (atn === 10) queue(ce, "bar_fl1");               // 2024 弗里克
        if (atn === 11) queue(ce, "bar_home");              // 2025 新蓝红竞技场回家
      } else {
        if (atn === 1) queue(ce, "atm_tor1");               // 2015-01 托雷塞回归
        if (atn === 3) queue(ce, "atm_metropolitano");      // 2017-09 新大都会首季
        if (atn === 5) queue(ce, "atm_fel1");               // 2019 菲利克塞
        if (atn === 5 && seen(ce, "atm_god2") && !seen(ce, "atm_cap") && tn === 5) queue(ce, "atm_cap");
        if (atn === 6) queue(ce, "atm_sua1");               // 2020 苏神来投
        if (atn === 7 && seen(ce, "atm_gr5")) queue(ce, "atm_gr6"); // 2021 格子回归
      }
      inject3(d, ce, slot);
      return;
    }
    // 玩家不在三线时也维持三强阵容快照（对手视角真实性）
    for (const s of ["rma", "bar", "atm"]) safe(() => inject3(d, ensureOf(d, s), s));
  }

  /* ── 赛季结算挂钩 ── */
  function onSeasonEnd(state) {
    const d = state.data;
    const slot = slotOf(d); if (!slot) return;
    const ce = ensureOf(d, slot);
    const tn = tenure(d, ce);
    const atn = atnOf(d);
    const ss = d.seasonStats || {};
    ce.clubGoals += (ss.goals || 0);
    ce.clubApps += (ss.apps || 0);
    const table = (window.SeasonSystem ? SeasonSystem.standings(state) : []) || [];
    const myRank = table.findIndex(t => t.id === d.clubId) + 1 || ce.lastRank || 99;
    const cupChamp = !!(d.cup && d.cup.alive === "champion");
    const ccChamp = !!(d.cc && d.cc.alive === "champion");
    const lgChamp = myRank === 1;
    const titleNow = lgChamp || cupChamp || ccChamp;

    /* 洲际冠军计数器（数值口径铁律：序数由触发器保证）*/
    if (ccChamp) { ce.cc += 1; ce.ccStreak = ce.lastCcChamp ? ce.ccStreak + 1 : 1; }
    else ce.ccStreak = 0;
    ce.lastCcChamp = ccChamp;
    const firstLg = lgChamp && !ce.lgEver;
    const firstCc = ccChamp && !ce.ccEver;
    const firstCup = cupChamp && !ce.cupEver;
    if (lgChamp) ce.lgEver = true;
    if (ccChamp) ce.ccEver = true;
    if (cupChamp) ce.cupEver = true;

    /* 1) 传奇告别（水爷 2021=tn6 / 小白 2018=tn3 / 科克尔 36 岁=tn14）*/
    const fareTn = slot === "atm" ? tn : atn;               // atm 科克尔现役（相对 36 岁线）；rma/bar 真实告别年
    if (!ce.farewellDone && fareTn >= FARE_TN[slot]) { ce.farewellDone = true; queue(ce, slot + "_farewell"); }

    /* 2) 遗憾线结局（armed 每季一次豁免；ccChamp 近似判定——两队同处淘汰赛，非冠即负）*/
    if (ce.reg1Armed) { ce.reg1Armed = false; ce.pending.push(ccChamp ? slot + "_reg1_win" : slot + "_reg1_lose"); if (slot === "atm") queue(ce, "atm_sim2"); }
    if (ce.reg2Armed) { ce.reg2Armed = false; ce.pending.push(ccChamp ? slot + "_reg2_win" : slot + "_reg2_lose"); }

    /* 3) 首冠瀑布 + 冠军卡（全部触发器保证）*/
    const firstTitle = titleNow && !ce.firstTitle;
    if (titleNow) {
      if (firstTitle && slot !== "bar") { ce.firstTitle = true; queue(ce, slot + "_supercup"); } // bar 无超杯卡：首冠由 treble/lg23/canaletes 兜底
      if (slot === "rma") {
        if (ccChamp && ce.cc === 11 && !seen(ce, "rma_ucl11")) queue(ce, "rma_ucl11");                  // 第 11 座（cc 门控：中途加入玩家 cc 已校准则自然沉默）
        if (ccChamp && ce.ccStreak >= 2 && !seen(ce, "rma_repeat")) queue(ce, "rma_repeat");            // 真卫冕（连续两年）
        if (ccChamp && ce.ccStreak >= 2 && !seen(ce, "rma_ucl13")) { queue(ce, "rma_ucl13"); queue(ce, "rma_zid3"); ce.zid3AskDone = true; }
        if (ccChamp && ce.cc === 14 && !seen(ce, "rma_ucl14")) queue(ce, "rma_ucl14");
        if (ccChamp && ce.ccBvbArmed) { ce.ccBvbArmed = false; queue(ce, "rma_ucl15"); }                // 黄黑决赛彩蛋
      } else if (slot === "bar") {
        const treble = lgChamp && cupChamp && ccChamp;
        if (treble && !seen(ce, "bar_treble")) { queue(ce, "bar_treble"); queue(ce, "bar_enr2"); }      // 三冠王达成判定
        if (lgChamp && cupChamp && !ccChamp && !seen(ce, "bar_repeat")) queue(ce, "bar_repeat");
        if (lgChamp && atn === 4 && !seen(ce, "bar_lg19")) queue(ce, "bar_lg19");   // 真实 2019 联赛
        if (lgChamp && atn === 8 && !seen(ce, "bar_lg23")) { queue(ce, "bar_lg23"); queue(ce, "bar_reb2"); } // 真实 2023 联赛
        if (cupChamp && ce.cupRmaArmed) { ce.cupRmaArmed = false; queue(ce, "bar_cup25"); }
      } else {
        if (ccChamp && tn >= 3 && !seen(ce, "atm_europa")) queue(ce, "atm_europa");                      // 玩家赛果驱动（相对窗）
        if (lgChamp && atn === 6 && firstLg) queue(ce, "atm_lg21");                                      // 真实 2021 末轮首冠+firstLg 门控
        if (lgChamp && !firstLg && !seen(ce, "atm_lgrepeat")) queue(ce, "atm_lgrepeat");
      }
    }

    /* 4) 各线专属结算队列（真实年锚）*/
    if (slot === "rma") {
      if (atn === 0) { queue(ce, "rma_cas2"); queue(ce, "rma_cas3"); queue(ce, "rma_anc2"); } // 2015 传真机/无仪式告别/安帅下课
      if (atn === 3 && !seen(ce, "rma_cr4")) queue(ce, "rma_cr4");                            // 2018 公开信
      if (atn === 5 && lgChamp && !seen(ce, "rma_dark2")) queue(ce, "rma_dark2");
      if (atn === 4 && !seen(ce, "rma_mod3")) queue(ce, "rma_mod3");                          // 2018 金球
      if (atn === 8 && !seen(ce, "rma_potg")) queue(ce, "rma_potg");                          // 2022 金球
      if (atn === 9 && !seen(ce, "rma_kro2")) queue(ce, "rma_kro2");                          // 2024 阿宽告别
      if (atn === 10 && !seen(ce, "rma_mod4")) queue(ce, "rma_mod4");                         // 2025 魔笛告别
    } else if (slot === "bar") {
      if (atn === 0) queue(ce, "bar_xav2");                                                   // 2015 节拍器告别
      if (atn === 2 && !seen(ce, "bar_ney4")) queue(ce, "bar_ney4");                          // 2017 魔翼移阵告知
      if (atn === 5 && !seen(ce, "bar_leo4")) queue(ce, "bar_leo4");                          // 2020 burofax
      if (atn === 5 && !seen(ce, "bar_su4")) queue(ce, "bar_su4");                            // 2020 58 秒电话
      if (atn >= 5 && seen(ce, "bar_dark8") && !seen(ce, "bar_reb1")) queue(ce, "bar_reb1");  // 讹告闭环（玩家惨案后）
      if (atn === 6) { queue(ce, "bar_leo5"); queue(ce, "bar_leo6"); }                        // 2021 球王告别
      if (atn === 1 && !seen(ce, "bar_potg")) queue(ce, "bar_potg");                          // 2015 金球第五座
      if (atn === 5 && !seen(ce, "bar_valv2")) queue(ce, "bar_valv2");                        // 2020-01 巴尔韦登下课
    } else {
      if (atn === 2) queue(ce, "atm_calderon");                                               // 2017 卡尔德隆告别
      if (atn === 3) { queue(ce, "atm_gr4"); queue(ce, "atm_tor3"); }                         // 2018《决定》/托雷塞告别
      if (atn === 4) { queue(ce, "atm_god1"); queue(ce, "atm_god2"); queue(ce, "atm_gr5"); }  // 2019 戈丁尼含泪/大撤离/格子出走
      if (atn === 8 && !seen(ce, "atm_fel3")) queue(ce, "atm_fel3");                          // 2023 冬窗菲利克塞
      if (atn === 6 && !seen(ce, "atm_sim3")) queue(ce, "atm_sim3");                          // 2020 十年
      if (atn === 3 && !seen(ce, "atm_potg")) queue(ce, "atm_potg");                          // 2018 世界杯年
      if (myRank === 3 && !seen(ce, "atm_shadow1")) queue(ce, "atm_shadow1");
      if ((lgChamp || cupChamp || ccChamp) && !seen(ce, "atm_parade1")) { queue(ce, "atm_parade1"); queue(ce, "atm_parade2"); }
    }

    /* 5) 幕三：亚军夜（主轴在场）*/
    if (myRank === 2 && !seen(ce, slot + "_act3") && legendAlive(d, ce, slot)) queue(ce, slot + "_act3");

    /* 6) forever（tenure 2 起，幕一已开）*/
    if (tn === 2 && seen(ce, slot + "_act1") && !ce.forever && !seen(ce, slot + "_forever")) queue(ce, slot + "_forever");

    /* 7) 里程碑 + 退役季雕像 */
    if (ce.clubApps >= 250 && !seen(ce, slot + "_appear")) queue(ce, slot + "_appear");
    if (ce.clubGoals >= 120 && !seen(ce, slot + "_record")) queue(ce, slot + "_record");
    if (tn >= 1 && (d.player && d.player.age >= 34) && !seen(ce, slot + "_act5c")) queue(ce, slot + "_act5c");

    ce.lastRank = myRank;
    ce.lastChamp = lgChamp;
  }

  /* ── 比赛结果挂钩（同条件排队铁律）── */
  const MATCH = {
    rma: [
      { id: "rma_act2a", ok: (d, ce, c) => legendAlive(d, ce, "rma") && (c.userGoals || 0) >= 1 },
      { id: "rma_cr2", ok: (d, ce, c) => atnOf(d) < 4 && (c.userGoals || 0) >= 1 },
      { id: "rma_trio", ok: (d, ce, c) => c.res === "win" && (c.userGoals || 0) >= 1 && (c.margin || 0) >= 2 },
      { id: "rma_nightgoal", ok: (d, ce, c) => c.res === "win" && (c.userGoals || 0) >= 1 && (c.oppName || "").indexOf("曼德里红白") >= 0 },
      { id: "rma_kissbadge", ok: (d, ce, c) => c.res === "win" && (c.margin || 0) >= 3 },
      { id: "rma_act2b", ok: (d, ce, c) => legendAlive(d, ce, "rma") && ce.lowStreak >= 2 },
    ],
    bar: [
      { id: "bar_act2a", ok: (d, ce, c) => legendAlive(d, ce, "bar") && (c.userGoals || 0) >= 1 },
      { id: "bar_leo2", ok: (d, ce, c) => atnOf(d) < 7 && (c.userGoals || 0) >= 1 },
      { id: "bar_su2", ok: (d, ce, c) => atnOf(d) < 6 && (c.userGoals || 0) >= 1 },
      { id: "bar_ney2", ok: (d, ce, c) => atnOf(d) < 3 && (c.userGoals || 0) >= 1 },
      { id: "bar_trio", ok: (d, ce, c) => atnOf(d) < 3 && c.res === "win" && (c.userGoals || 0) >= 1 && (c.margin || 0) >= 2 },
      { id: "bar_remo", ok: (d, ce, c) => c.isIntl && c.res === "win" && (c.margin || 0) >= 3 },
      { id: "bar_kissbadge", ok: (d, ce, c) => c.res === "win" && (c.margin || 0) >= 3 },
      { id: "bar_act2b", ok: (d, ce, c) => legendAlive(d, ce, "bar") && ce.lowStreak >= 2 },
      { id: "bar_pau2", ok: (d, ce, c) => atnOf(d) === 3 && c.res === "win" && (c.userGoals || 0) >= 1 },  // 跨线互文（最低优先级）
    ],
    atm: [
      { id: "atm_act2a", ok: (d, ce, c) => legendAlive(d, ce, "atm") && (c.userGoals || 0) >= 1 },
      { id: "atm_gr2", ok: (d, ce, c) => atnOf(d) < 5 && (c.userGoals || 0) >= 1 },
      { id: "atm_trio", ok: (d, ce, c) => c.res === "win" && (c.userGoals || 0) >= 1 && (c.margin || 0) >= 2 },
      { id: "atm_nightgoal", ok: (d, ce, c) => c.res === "win" && (c.userGoals || 0) >= 1 && (c.oppName || "").indexOf("曼德里白舰") >= 0 },
      { id: "atm_kissbadge", ok: (d, ce, c) => c.res === "win" && (c.margin || 0) >= 3 },
      { id: "atm_act2b", ok: (d, ce, c) => legendAlive(d, ce, "atm") && ce.lowStreak >= 2 },
    ],
  };
  /* 氛围卡（上下文无关；间隔闸 6 轮；全卡生涯一次）*/
  const AMBIENT = {
    rma: ["rma_anc1", "rma_cas1", "rma_cr1", "rma_cr3", "rma_kro1", "rma_mod1", "rma_mod2", "rma_city1", "rma_city2",
      "rma_city3", "rma_history1", "rma_history2", "rma_history3", "rma_game", "rma_bbq", "rma_prank",
      "rma_fankid", "rma_y3", "rma_y6", "rma_mid3", "rma_inj1"],
    bar: ["bar_enr1", "bar_valv1", "bar_xav1", "bar_leo1", "bar_leo3", "bar_ney1", "bar_ney3", "bar_su1", "bar_su3", "bar_city1",
      "bar_city2", "bar_history1", "bar_history2", "bar_history3", "bar_game", "bar_bbq", "bar_prank",
      "bar_fankid", "bar_y3", "bar_y5", "bar_mid3", "bar_inj1", "bar_canaletes"],
    atm: ["atm_gang1", "atm_gang3", "atm_shadow2", "atm_sim1", "atm_sim4", "atm_gr3", "atm_gr7", "atm_tor2",
      "atm_fel2", "atm_history1", "atm_history2", "atm_neptuno", "atm_workers", "atm_game", "atm_bbq",
      "atm_prank", "atm_fankid", "atm_y3", "atm_y6", "atm_mid3", "atm_inj1"],
  };
  const GUARD = {
    rma: {
      rma_anc1: (d, ce) => atnOf(d) < 2,                            // 安帅一期在任（2014-16）
      rma_cas1: (d, ce) => atnOf(d) < 1,                            // 卡西最后一季
      rma_cr1: (d, ce) => atnOf(d) < 4,                             // 总裁在阵（2018 走）
      rma_cr3: (d, ce) => atnOf(d) < 4,
      rma_kro1: (d, ce) => atnOf(d) < 10,                           // 阿宽在阵（2024 走）
      rma_mod1: (d, ce) => atnOf(d) >= 1 && atnOf(d) < 11,
      rma_mod2: (d, ce) => atnOf(d) >= 2 && atnOf(d) < 11,
      rma_city1: (d, ce) => ce.firstTitle,                          // 夺冠后（西贝莱斯）
      rma_city2: (d, ce) => tenure(d, ce) >= 1,
      rma_city3: (d, ce) => tenure(d, ce) >= 2,
      rma_history1: (d, ce) => tenure(d, ce) >= 2,
      rma_history2: (d, ce) => tenure(d, ce) >= 2,
      rma_history3: (d, ce) => tenure(d, ce) >= 3,
      rma_bbq: (d, ce) => tenure(d, ce) >= 1,
      rma_y3: (d, ce) => tenure(d, ce) === 3 && legendAlive(d, ce, "rma"),
      rma_y6: (d, ce) => tenure(d, ce) === 6 && legendAlive(d, ce, "rma"),
      rma_mid3: (d, ce) => ce.midJoin && tenure(d, ce) >= 1,
      rma_inj1: (d, ce) => legendAlive(d, ce, "rma") && tenure(d, ce) >= 1,
    },
    bar: {
      bar_enr1: (d, ce) => atnOf(d) < 3,                            // 恩里克尼在任（2014-17）
      bar_valv1: (d, ce) => atnOf(d) >= 3 && atnOf(d) < 5,          // 巴尔韦登在任（2017-2020）
      bar_xav1: (d, ce) => atnOf(d) < 1,                            // 节拍器最后一季
      bar_leo1: (d, ce) => atnOf(d) < 7,                            // 球王在阵（2021 走）
      bar_leo3: (d, ce) => atnOf(d) < 7,
      bar_ney1: (d, ce) => atnOf(d) < 3,                            // 魔翼在阵（2017 走）
      bar_ney3: (d, ce) => atnOf(d) < 3,
      bar_su1: (d, ce) => atnOf(d) < 1,                             // 苏牙禁赛季
      bar_su3: (d, ce) => atnOf(d) >= 1 && atnOf(d) < 6,
      bar_city1: (d, ce) => tenure(d, ce) >= 1,
      bar_city2: (d, ce) => tenure(d, ce) >= 1,
      bar_history1: (d, ce) => tenure(d, ce) >= 2,
      bar_history2: (d, ce) => tenure(d, ce) >= 2,
      bar_history3: (d, ce) => tenure(d, ce) >= 3,
      bar_bbq: (d, ce) => tenure(d, ce) >= 1,
      bar_y3: (d, ce) => tenure(d, ce) === 3 && legendAlive(d, ce, "bar"),
      bar_y5: (d, ce) => tenure(d, ce) === 5 && atnOf(d) < 7,       // 第五年轮（相对）+球王在阵窗
      bar_mid3: (d, ce) => ce.midJoin && tenure(d, ce) >= 1,
      bar_inj1: (d, ce) => legendAlive(d, ce, "bar") && tenure(d, ce) >= 1,
      bar_canaletes: (d, ce) => ce.firstTitle,                      // 夺冠后（兰布拉喷泉）
    },
    atm: {
      atm_gang1: (d, ce) => tenure(d, ce) >= 1,
      atm_gang3: (d, ce) => tenure(d, ce) >= 2,
      atm_shadow2: (d, ce) => tenure(d, ce) >= 3,
      atm_sim1: (d, ce) => tenure(d, ce) >= 1,
      atm_sim4: (d, ce) => tenure(d, ce) >= 10,
      atm_gr3: (d, ce) => atnOf(d) < 5,                             // 格子首段在阵（2019 走）
      atm_gr7: (d, ce) => seen(ce, "atm_gr6"),                      // 回归后
      atm_tor2: (d, ce) => atnOf(d) === 4,                          // 托雷塞最后一年（真实 2018）
      atm_fel2: (d, ce) => atnOf(d) >= 5 && atnOf(d) < 8,           // 菲利克塞在阵（2019-2023）
      atm_history1: (d, ce) => tenure(d, ce) >= 2,
      atm_history2: (d, ce) => tenure(d, ce) >= 3,
      atm_neptuno: (d, ce) => ce.firstTitle,                        // 夺冠后（海神喷泉）
      atm_workers: (d, ce) => tenure(d, ce) >= 1,
      atm_bbq: (d, ce) => tenure(d, ce) >= 1,
      atm_y3: (d, ce) => tenure(d, ce) === 3 && legendAlive(d, ce, "atm"),
      atm_y6: (d, ce) => tenure(d, ce) === 6 && legendAlive(d, ce, "atm"),
      atm_mid3: (d, ce) => ce.midJoin && tenure(d, ce) >= 1,
      atm_inj1: (d, ce) => legendAlive(d, ce, "atm") && tenure(d, ce) >= 1,
    },
  };
  function gapOk(ce, round, gap) { return round - ce.lastClubRound >= gap; }

  function pickSilentMine(state, ctxs) {
    const d = state.data;
    const slot = slotOf(d); if (!slot || d.retired) return null;
    const ce = ensureOf(d, slot);
    const list = (ctxs || []).filter(Boolean);
    for (const raw of list) {
      const ctx = Object.assign({ d }, raw);
      const round = ctx.round || Math.round((d.dayIndex || 0) / 8);
      if ((d.injuryDays || 0) > 0) break;
      if (slot === "bar" && ctx.isIntl && (ctx.margin || 0) <= -4 && !seen(ce, "bar_dark8")) { queue(ce, "bar_dark8"); }
      for (const m of MATCH[slot]) {
        if (seen(ce, m.id)) continue;
        let ok = false;
        try { ok = m.ok(d, ce, ctx); } catch (e) { ok = false; }
        if (ok) {
          mark(ce, m.id); ce.lastClubRound = round;
          if (m.id === "atm_nightgoal") queue(ce, "atm_gang4");   // 匪帮的宴席挂德比绝杀后
          return card(m.id);
        }
      }
      if (!gapOk(ce, round, 6)) break;
      for (const id of AMBIENT[slot]) {
        if (seen(ce, id)) continue;
        const g = GUARD[slot][id];
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
    const isAway = !!(f && f.home && f.home.id !== d.clubId);
    const round = fixture.round || Math.round((d.dayIndex || 0) / 8);
    const seq = [];
    if (slot === "rma") {
      if (fixture.type === "cc_ko" && me && fixture.stage >= 1 && fixture.stage < 3 && !ce.reg1Armed) { ce.reg1Armed = true; ce.lastClubRound = round; return card("rma_reg1_pre"); }
      if (fixture.type === "cc_ko" && isAway && fixture.stage === 2 && !ce.reg2Armed) { ce.reg2Armed = true; ce.lastClubRound = round; return card("rma_reg2_pre"); }
      if (fixture.type === "cc_ko" && fixture.stage === 3 && oppName === "多特蒙顿") ce.ccBvbArmed = true;
      if (oppName === BAR) seq.push("rma_derby");
      if (oppName === ATM) seq.push("rma_enemy2");
      if (oppName === "都林斑马" && tenure(d, ce) >= 4 && !seen(ce, "rma_cr5")) seq.push("rma_cr5");
      if (oppName && ce.prevClubs && ce.prevClubs.indexOf(oppName) >= 0) seq.push("rma_mid2");
    } else if (slot === "bar") {
      if (fixture.type === "cc_ko" && isAway && fixture.stage >= 1 && fixture.stage < 3 && !ce.reg1Armed && fixture.stage !== 2) { ce.reg1Armed = true; ce.lastClubRound = round; return card("bar_reg1_pre"); }
      if (fixture.type === "cc_ko" && isAway && fixture.stage === 2 && !ce.reg2Armed) { ce.reg2Armed = true; ce.lastClubRound = round; return card("bar_reg2_pre"); }
      if (fixture.type === "cup" && fixture.stage === 3 && oppName === RMA) ce.cupRmaArmed = true;
      if (oppName === RMA) seq.push("bar_derby");
      if (oppName === "巴塞罗纳蓝白军") seq.push("bar_enemy2");
      if (oppName === "花都红蓝" && tenure(d, ce) >= 3 && !seen(ce, "bar_ney5")) seq.push("bar_ney5");
      if (oppName === "花都红蓝" && tenure(d, ce) >= 7 && !seen(ce, "bar_leo7")) seq.push("bar_leo7");
      if (oppName === ATM && tenure(d, ce) >= 6 && !seen(ce, "bar_su5")) seq.push("bar_su5");
      if (oppName && ce.prevClubs && ce.prevClubs.indexOf(oppName) >= 0) seq.push("bar_mid2");
    } else {
      if (fixture.type === "cc_ko" && fixture.stage === 3 && oppName === RMA && !ce.reg1Armed) { ce.reg1Armed = true; ce.lastClubRound = round; return card("atm_reg1_pre"); }
      if (fixture.type === "cc_ko" && fixture.stage < 3 && oppName === RMA && !ce.reg2Armed) { ce.reg2Armed = true; ce.lastClubRound = round; return card("atm_reg2_pre"); }
      if (fixture.type === "league" && opp && !seen(ce, "atm_gang2")) {
        const table = (window.SeasonSystem ? SeasonSystem.standings(state) : []) || [];
        const rank = table.findIndex(t => t.id === opp.id) + 1;
        if (rank >= 1 && rank <= 2) seq.push("atm_gang2");
      }
      if (oppName === RMA) seq.push("atm_derby");
      if (oppName === BAR) seq.push("atm_enemy2");
      if (oppName && ce.prevClubs && ce.prevClubs.indexOf(oppName) >= 0) seq.push("atm_mid2");
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
    if (!ce.pending || !ce.pending.length) return tryAct1(state, slot);
    const id = ce.pending.shift();
    if (!card(id)) return consumePendingMine(state);
    if (id === slot + "_forever") return showForeverMine(state, slot);
    showC(state, id, {}, () => { State.save(); });
    return true;
  }

  /* ── 雪藏 / 离队挂钩 ── */
  function onFrozenMine(state) {
    const d = state.data;
    const slot = slotOf(d); if (!slot) return;
    const ce = ensureOf(d, slot);
    const id = slot + "_act4b";
    if (seen(ce, slot + "_act1") && !seen(ce, id) && legendAlive(d, ce, slot)) queue(ce, id);
  }
  function onLeaveMine(state, fromClubName) {
    const d = state.data;
    const slot = slotOf(d); if (!slot) return;
    const ce = ensureOf(d, slot);
    if (fromClubName === CLUB_ID[slot] && seen(ce, slot + "_act1") && !seen(ce, slot + "_act5a")) queue(ce, slot + "_act5a");
  }

  /* ── 对外派发（前三期槽位优先，本引擎接管 rma/bar/atm）── */
  const mine = {
    onInitSeason, onSeasonEnd, pickSilent: pickSilentMine, noteSilent: noteSilentMine,
    pickPre: pickPreMine, onResult: onResultMine, consumePending: consumePendingMine,
    retentionOverride: retentionOverrideMine, onFrozen: onFrozenMine, onLeave: onLeaveMine,
    foreverOn: d => { if (!d) return false; const slot = slotOf(d); if (!slot) return false; return !!ensureOf(d, slot).forever; },
    canForever: () => false, showForever: () => false,
  };
  window.ClubEvents = {
    ensure: d => { const slot = slotOf(d); return slot ? ensureOf(d, slot) : CE2.ensure(d); },
    onInitSeason: (state, clubId) => { safe(() => CE2.onInitSeason(state, clubId)); safe(() => mine.onInitSeason(state, clubId)); },
    onSeasonEnd: state => { safe(() => CE2.onSeasonEnd(state)); safe(() => mine.onSeasonEnd(state)); },
    pickSilent: (state, ctxs) => { const c = safe(() => CE2.pickSilent(state, ctxs), null); if (c) return c; return safe(() => mine.pickSilent(state, ctxs), null); },
    noteSilent: (state, ctxs) => { safe(() => CE2.noteSilent(state, ctxs)); safe(() => mine.noteSilent(state, ctxs)); },
    pickPre: (state, fixture) => { const c = safe(() => CE2.pickPre(state, fixture), null); if (c) return c; return safe(() => mine.pickPre(state, fixture), null); },
    onResult: (state, ctx, onDone) => { let h = safe(() => CE2.onResult(state, ctx, onDone), false); if (h) return true; return !!safe(() => mine.onResult(state, ctx, onDone), false); },
    consumePending: state => { const slot = state && state.data ? slotOf(state.data) : null; if (slot) return !!safe(() => mine.consumePending(state), false); return !!safe(() => CE2.consumePending(state), false); },
    foreverOn: d => !!safe(() => CE2.foreverOn(d), false) || !!safe(() => mine.foreverOn(d), false),
    canForever: d => !!safe(() => CE2.canForever(d), false),
    showForever: (state, rerender) => !!safe(() => CE2.showForever(state, rerender), false),
    retentionOverride: (state, done) => { let h = safe(() => CE2.retentionOverride(state, done), false); if (h) return true; return !!safe(() => mine.retentionOverride(state, done), false); },
    onFrozen: state => { safe(() => CE2.onFrozen(state)); safe(() => mine.onFrozen(state)); },
    onLeave: (state, from) => { safe(() => CE2.onLeave(state, from)); safe(() => mine.onLeave(state, from)); },
    /* ★ P97：逐层转发 `foreverLabel`（见 club_events2.js 的同名注释） */
    foreverLabel: CE2.foreverLabel,
    atDor: CE2.atDor, reusAlive: CE2.reusAlive,
    _debug: Object.assign({}, CE2._debug || {}, { mine, slotOf, tenure, card, ensureOf, inject3 }),
  };
})();

