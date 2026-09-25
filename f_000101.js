/* ============================================================================
   club_events6.js — 俱乐部专属事件引擎 · 第六期（P82：意甲五强）
   规格：docs/都林斑马|米岚蓝黑|纳普勒斯|永恒城|米岚红黑专属事件样板（v1/v1.1 定稿，361 卡）
   架构：对齐 ce3/ce4/ce5 包装派发（在 club_events5.js 之后加载）——
         六期槽位优先 → 本引擎接管 juv/int/nap/rom/acm 槽，其余 fallback CE5。
   数据：data_club_juv/int/nap/rom/acm.js（tools/_p82_serie_md2data.js 自动生成）。
   排程：数据驱动——开局幕 tn0 / STORY 组自动均分 tn1..fareTn-1 / ambient 冷却池 /
         年轮 tn 门控 / armed 决赛两轮（玩家赛果驱动）/ 结算瀑布。
   farewell 真实 tn 锚：都林斑马 基耶利宁 tn8 / 米岚蓝黑 汉达 tn9 / 纳普勒斯 哈姆西克德 tn5 /
         永恒城 德罗辛 tn4（狼王 tn2 早退链）/ 米岚 马队 tn8。
   铁律：冠军序数由触发器保证（lgEver/lastChamp）/ 卡文不锁玩家数字。
   ============================================================================ */
(function () {
  if (!window.ClubEvents) return;
  const CE5 = window.ClubEvents;

  const CLUBS = {
    juv: { name: "都林斑马", fareTn: 8 },
    int: { name: "米岚蓝黑", fareTn: 9 },
    nap: { name: "纳普勒斯", fareTn: 5 },
    rom: { name: "永恒城", fareTn: 4 },
    acm: { name: "米岚红黑", fareTn: 8 },
  };
  const POOLS = Object.keys(CLUBS);

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
  const clubIdOf = {};
  for (const s of POOLS) clubIdOf[s] = () => { const t = teamInLD(CLUBS[s].name); return t ? t.id : null; };

  function ensureOf(d, slot) {
    d.clubEvents = d.clubEvents || {};
    d.clubEvents[slot] = d.clubEvents[slot] || {
      joinSeason: null, seen: {}, pending: [], ambIdx: 0, lastClubRound: -99,
      lgEver: false, lastChamp: false, cupEver: false,
      farewellDone: false, forever: false,
      regArmed1: false, regArmed2: false, regUsed1: false, regUsed2: false,
      mcPhase: 0,
    };
    return d.clubEvents[slot];
  }
  const seen = (ce, id) => !!ce.seen[id];
  const mark = (ce, id) => { ce.seen[id] = true; };
  function queue(ce, id) { if (!seen(ce, id) && card(id)) { ce.pending.push(id); mark(ce, id); } }
  function tenure(d, ce) { return ce.joinSeason == null ? 0 : (d.season - ce.joinSeason); }
  function slotOf(d) {
    if (!d || d.clubId == null) return null;
    for (const s of POOLS) if (d.clubId === clubIdOf[s]()) return s;
    return null;
  }

  /* ── 告别链配置（先于排程） ──
     ★★ P138 轴约定（P135 双锚立项核实结论，禁止误改）：
     本线告别锚是 **tenure 轴**（玩家入队后第 N 年），与 club_events3/4 的绝对年轴（atn=season-2014）
     **并存**——这是设计选择不是缺陷：
       ① 本线阵容是静态快照（无 MOVE 逐年迁移）——「基耶利宁一直踢到玩家 tenure8」在游戏
          世界内自洽；若改绝对年轴，晚入队（2019+）玩家的告别链整条不可达（真实里已发生），
          六条最精华的叙事资产对晚入队者永久关闭；
       ② 首季（2014 基线）入队者 tenure8 ≈ 真实告别年（基耶利宁 2022≈2023），误差 1 年内；
       ③ tenure 轴卡（y3/y6/y10 系列）正文已核实**零点名具体队友**（全是城市/球迷文化叙事），
          不存在「卡文点名 × 绝对年阵容已迁移」的错位。
     若未来把本线阵容改为 MOVE 动态迁移，再评估切绝对年轴——两件事必须一起动。 */
  const FARE = {
    juv: { tn: 8, chain: ["juv_cap8", "juv_cap9", "juv_cap10", "juv_cap11"] },
    int: { tn: 9, chain: ["int_hd10", "int_hd11"] },
    nap: { tn: 5, chain: ["nap_hs9", "nap_hs10", "nap_hs11", "nap_hs12"] },
    rom: { tn: 4, chain: ["rom_dd6", "rom_dd7"] },
    acm: { tn: 8, chain: ["acm_md12", "acm_md13", "acm_md14", "acm_md15"] },
  };
  const FARE_EXTRA = {
    rom: [{ tn: 2, chain: ["rom_tt10", "rom_tt11"] }, { tn: 3, chain: ["rom_tt13", "rom_tt13b", "rom_tt14"] }],
    acm: [{ tn: 8, chain: ["acm_act5a", "acm_act5b", "acm_act5c"] }],
    juv: [{ tn: 4, chain: ["juv_bf7", "juv_bf8"] }, { tn: 5, chain: ["juv_bf9", "juv_bf10"] }, { tn: 7, chain: ["juv_bf11"] }, { tn: 8, chain: ["juv_act5a", "juv_act5b", "juv_act5c"] }],
    int: [{ tn: 5, chain: ["int_ic6", "int_ic7", "int_ic8"] }, { tn: 9, chain: ["int_act5a", "int_act5b", "int_act5c"] }],
    nap: [{ tn: 8, chain: ["nap_ins7", "nap_ins8"] }, { tn: 9, chain: ["nap_act5a", "nap_act5b", "nap_act5c"] }],
  };

  /* ── 排程：STORY 组自动均分 + 特例覆盖 ── */
  const Y_TN = id => { const m = id.match(/y(\d+)$/); return m ? +m[1] : null; };
  function buildPlan(pool) {
    const g = (window.CLUB_EVENT_CARDS && window.CLUB_EVENT_CARDS[pool]) || [];
    const fareTn = CLUBS[pool].fareTn;
    const plan = { tn: {}, amb: [] };
    const story = [];
    // farewell 链卡先收集（防止被 STORY 均分/amb 池提前消费）
    const fareSet = new Set(FARE[pool].chain || []);
    for (const ex of (FARE_EXTRA[pool] || [])) for (const id of ex.chain) fareSet.add(id);
    for (const c of g) {
      const id = c.id, tail = id.slice(pool.length + 1);
      const ytn = Y_TN(id);
      if (/^st\d/.test(tail)) { (plan.tn[0] = plan.tn[0] || []).push(id); continue; }
      if (/^y\d+$/.test(tail) && ytn != null) { (plan.tn[ytn] = plan.tn[ytn] || []).push(id); continue; }
      if (/^(act5|forever|farewell)/.test(tail)) continue;
      if (/^(reg|mc)/.test(tail)) continue;
      if (/^(champ1|repeat|gl_|supercup|cup\d?)/.test(tail)) continue;
      if (fareSet.has(id)) continue;   // 告别链卡 → FARE 链专用（tn 到点推入）
      plan.amb.push(id);
      story.push(id);
    }
    let t = 1, cnt = 0;
    for (const id of story) {
      if (cnt >= 2 && t < fareTn - 1) { t++; cnt = 0; }
      (plan.tn[t] = plan.tn[t] || []).push(id);
      cnt++;
    }
    return plan;
  }
  const PLANS = {};
  const planOf = s => PLANS[s] || (PLANS[s] = buildPlan(s));

  /* ── 告别链 / armed / 结算配置 ── */
  const REG = {
    juv: { pre1: "juv_reg1_pre", win1: "juv_reg1_win", lose1: "juv_reg1_lose", pre2: "juv_reg2_pre", win2: "juv_reg2_win", lose2: "juv_reg2_lose", amb: ["juv_reg3"] },
    int: { pre1: "int_reg1_pre", win1: "int_reg1_win", lose1: "int_reg1_lose", pre2: "int_reg2_pre", win2: "int_reg2_win", lose2: "int_reg2_lose" },
    nap: { pre1: "nap_reg1_pre", win1: "nap_reg1_win", lose1: "nap_reg1_lose", runnerUp: "nap_reg2" },
    rom: { mc1: "rom_mc1", mc2: "rom_mc2", mc3: "rom_mc3", mc4: "rom_mc4", runnerUp: "rom_reg1", amb: ["rom_reg2", "rom_reg3"] },
    acm: { runnerUp: "acm_reg2", amb: ["acm_reg1", "acm_reg3"] },
  };
  const SETTLE = {
    juv: { champ: "juv_champ1", repeat: "juv_repeat", supercup: "juv_supercup", cup: "juv_gl_cup", gl6: "juv_gl6", glEnd: "juv_gl_end", glPirlo: "juv_gl_pirlo" },
    int: { champ: "int_champ1", repeat: "int_repeat", supercup: "int_gl_supercup", cup: "int_gl_cup" },
    nap: { champ: "nap_champ1", repeat: "nap_repeat", cup: "nap_gl_cup", kvara: "nap_gl_kvara", pride: "nap_gl_pride" },
    rom: { champ: "rom_champ1", repeat: "rom_repeat", supercup: "rom_gl_supercup", cup: "rom_gl_cup", four: "rom_reg2" },
    acm: { champ: "acm_champ1", repeat: "acm_repeat", supercup: "acm_gl_supercup", cup: "acm_gl_cup" },
  };
  const DERBY = { juv: { card: "juv_derby", vs: "米岚蓝黑" }, int: { card: "int_derby", vs: "米岚红黑" }, nap: { card: "nap_derby", vs: "永恒城" }, rom: { card: "rom_derby", vs: "永恒城蓝鹰" }, acm: { card: "acm_derby", vs: "米岚蓝黑" } };
  const FOREVER_ID = { juv: "juv_forever", int: "int_forever", nap: "nap_forever", rom: "rom_forever", acm: "acm_forever" };
  const REG_AMB = { juv: ["juv_reg3"], rom: ["rom_reg2", "rom_reg3"], acm: ["acm_reg1", "acm_reg3"] };

  function fareChainIds(pool, tn) {
    const out = [];
    if (FARE[pool] && tn >= FARE[pool].tn) out.push(...FARE[pool].chain);
    for (const ex of (FARE_EXTRA[pool] || [])) if (tn >= ex.tn) out.push(...ex.chain);
    return out;
  }

  function onInitSeason(state) {
    const d = state.data;
    const slot = slotOf(d); if (!slot) return;
    const ce = ensureOf(d, slot);
    if (ce.joinSeason == null) ce.joinSeason = d.season;
    const tn = tenure(d, ce);
    for (const id of ((planOf(slot).tn[tn] || []))) queue(ce, id);
    for (const id of fareChainIds(slot, tn)) if (!seen(ce, id)) ce.pending.push(id), mark(ce, id);
  }

  function ambientGuard(pool, id, d, ce) {
    const tn = tenure(d, ce);
    const tail = id.slice(pool.length + 1);
    const m = tail.match(/y(\d+)$/);
    if (m) return tn >= +m[1];
    return true;
  }

  function pickSilent(state, ctxs) {
    const d = state.data;
    const slot = slotOf(d); if (!slot) return null;
    const ce = ensureOf(d, slot);
    while (ce.pending.length) {
      const id = ce.pending.shift();
      const c = card(id);
      if (c) return c;
    }
    /* ★ P97 缺陷修复（「字段没人写」型，与 `legacyPoints`/`starUnlock` 同族）：
       原代码的门控是 `d.round != null && d.round - ce.lastClubRound >= 6` ——
       而 **`d.round` 这个字段全仓不存在**（存档模板里只有 `dayIndex`，且没有任何地方写 `d.round`）。
       于是 `d.round != null` **恒为 false** → 这一整段 **ambient（日常）池永不触发**：
       `juv_reg3` / `rom_reg2` / `rom_reg3` / `acm_reg1` / `acm_reg3` 共 5 张卡不可达。
       ★ 改法与 CE1~CE3 **同口径**（`Math.round(dayIndex / 8)`）—— 那几层本来就是这么算的，
         只有 CE6 用了这个不存在的字段（同族的「字段名对不上」）。 */
    const round = d.dayIndex ? Math.round(d.dayIndex / 8) : 0;
    if (round - ce.lastClubRound >= 6) {
      const amb = planOf(slot).amb.concat(REG_AMB[slot] || []);
      for (let i = 0; i < amb.length; i++) {
        const id = amb[(ce.ambIdx + i) % amb.length];
        if (seen(ce, id)) continue;
        if (!safe(() => ambientGuard(slot, id, d, ce), true)) continue;
        ce.ambIdx = (ce.ambIdx + i + 1) % amb.length;
        ce.lastClubRound = round;          // ★ 同步改成本地轮次（与门控同口径，否则永远记不上）
        queue(ce, id);
        return card(id);
      }
    }
    return null;
  }

  function onSeasonEnd(state) {
    const d = state.data;
    const slot = slotOf(d); if (!slot) return;
    const ce = ensureOf(d, slot);
    const tn = tenure(d, ce);
    const table = (window.SeasonSystem ? SeasonSystem.standings(state) : []) || [];
    const myRank = table.findIndex(t => t.id === d.clubId) + 1 || 99;
    const cupChamp = !!(d.cup && d.cup.alive === "champion");
    const lgChamp = myRank === 1;
    const S = SETTLE[slot], R = REG[slot];
    const wasChamp = ce.lastChamp;
    if (lgChamp) ce.lgEver = true;
    ce.lastChamp = lgChamp;

    if (lgChamp) {
      if (!seen(ce, S.champ)) queue(ce, S.champ);
      else if (S.repeat && wasChamp && !seen(ce, S.repeat)) queue(ce, S.repeat);
      if (S.gl6 && tn >= 5) queue(ce, S.gl6);
      if (S.kvara && tn >= 7) { queue(ce, S.kvara); queue(ce, S.pride); }
      if (S.glPirlo && tn >= 5) queue(ce, S.glPirlo);
    } else {
      if (S.glEnd && tn >= 6 && wasChamp) queue(ce, S.glEnd);
    }
    if (cupChamp && S.cup && !seen(ce, S.cup)) queue(ce, S.cup);
    if (myRank === 2 && R.runnerUp) queue(ce, R.runnerUp);
    if (S.four && tn >= 3 && myRank >= 3 && myRank <= 4) queue(ce, S.four);
    if (ce.lgEver && S.supercup && !seen(ce, S.supercup) && tn >= 1) queue(ce, S.supercup);
  }

  function pickPre(state, fixture) {
    const d = state.data;
    const slot = slotOf(d); if (!slot) return null;
    const ce = ensureOf(d, slot);
    const R = REG[slot];
    if (fixture && fixture.type === "cc_ko" && fixture.stage === 3) {
      if (R && R.pre1 && !ce.regUsed1) { ce.regArmed1 = true; return card(R.pre1); }
      if (R && R.pre2 && !ce.regUsed2 && ce.regUsed1) { ce.regArmed2 = true; return card(R.pre2); }
    }
    // 永恒城奇迹组：次回合前夜（淘汰赛次回合任意 stage，mc1 触发后）
    if (slot === "rom" && R && R.mc2 && ce.mcPhase === 1) { ce.mcPhase = 2; return card(R.mc2); }
    const D2 = DERBY[slot];
    if (D2 && fixture && !seen(ce, D2.card)) {
      const opp = fixture.oppName || (fixture.opponent && fixture.opponent.name) || "";
      if (opp === D2.vs) { queue(ce, D2.card); return card(D2.card); }
    }
    return null;
  }

  function onResult(state, ctx, onDone) {
    const d = state.data;
    const slot = slotOf(d); if (!slot) return false;
    const ce = ensureOf(d, slot);
    const res = ctx && (ctx.res || ctx.result);
    const isCC = !!(ctx && (ctx.type === "cc_ko" || (ctx.fixture && ctx.fixture.type === "cc_ko")));
    const R = REG[slot];
    if (isCC && R) {
      if (ce.regArmed1) { ce.regArmed1 = false; ce.regUsed1 = true; const id = res === "win" ? R.win1 : R.lose1; if (id) { ce.pending.push(id); mark(ce, id); return true; } }
      if (ce.regArmed2) { ce.regArmed2 = false; ce.regUsed2 = true; const id = res === "win" ? R.win2 : R.lose2; if (id) { ce.pending.push(id); mark(ce, id); return true; } }
      if (slot === "rom" && res === "lose" && ce.mcPhase === 0 && R.mc1) { ce.mcPhase = 1; ce.pending.push(R.mc1); mark(ce, R.mc1); return true; }
      if (slot === "rom" && ce.mcPhase === 2) { ce.mcPhase = 0; const id = res === "win" ? R.mc3 : R.mc4; if (id) { ce.pending.push(id); mark(ce, id); return true; } }
    }
    return false;
  }

  /* ── ★★ 卡片展示：必须走 V2 的 `EventCards._showCard` ─────────────────────────
     ★ 历史缺陷（P97 第 6 次同型坑 · 「调用了不存在的方法」）：
       原代码写 `safe(() => window.Hub && Hub.showEventCard && Hub.showEventCard(c))`，
       而 **`Hub.showEventCard` 在全仓从未定义过**（连 V1 归档里也没有）——
       于是 `safe()` 把 TypeError 吞掉、函数照样 `return true`，调用方以为"卡片已展示"，
       实际结果是**卡被 shift 出队列后永久丢弃**。
       受损的就是赛季结算排进来的高光卡：联赛冠军 / 卫冕 / 杯赛冠军 / 亚军 / 前四 /
       超级杯 / 欧战冠军组（gl6·kvara·pride·glPirlo）/ 欧冠淘汰赛 win-lose 链 /
       永恒城奇迹链 + 告别链（基耶利宁·汉达·哈姆西克德·德罗辛·马队）。
       ★ 为什么没被发现：队列还有**另一个消费者** `pickSilent` —— 它把卡**返回**给调用方
         （那条路是通的）。所以只在"这次排空轮到 `consumePending`"时才丢卡，
         表现是**间歇性缺卡**，不像"整条线全黑"那样一眼可见。
     ★ 修法：与 CE5 的 `showC` 完全同形（`bodyStar` / `badge` / `seen` 语义一致），
       保证六期引擎的展示行为逐位对齐。 */
  function showC(state, id, ctx, onDone) {
    const c = card(id);
    if (!c) { onDone && onDone(); return false; }
    const d0 = state.data;
    const slot = slotOf(d0);
    const ce = slot ? ensureOf(d0, slot) : {};
    if (!ce.seen) ce.seen = {};
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

  function consumePending(state) {
    const d = state.data;
    const slot = slotOf(d); if (!slot) return false;
    const ce = ensureOf(d, slot);
    while (ce.pending.length) {
      const id = ce.pending.shift();
      if (!card(id)) continue;          // 引用不存在的卡 → 只跳过这个 id，继续看队列
      if (showC(state, id, {}, () => { if (window.State) State.save(); })) return true;
      ce.pending.unshift(id);           // ★ 展示**失败** → 把卡放回队首，绝不静默吞掉
      return false;
    }
    return false;
  }

  const mine = {
    ensure: d => { const slot = slotOf(d); return slot ? ensureOf(d, slot) : CE5.ensure(d); },
    onInitSeason: state => safe(() => onInitSeason(state)),
    onSeasonEnd: state => safe(() => onSeasonEnd(state)),
    pickSilent: (state, ctxs) => safe(() => pickSilent(state, ctxs), null),
    noteSilent: () => {},
    pickPre: (state, fixture) => safe(() => pickPre(state, fixture), null),
    onResult: (state, ctx, onDone) => !!safe(() => onResult(state, ctx, onDone), false),
    consumePending: state => !!safe(() => consumePending(state), false),
    foreverOn: d => { const slot = slotOf(d); if (!slot) return false; return !!ensureOf(d, slot).forever; },
    canForever: d => { const slot = slotOf(d); if (!slot) return false; return tenure(d, ensureOf(d, slot)) >= CLUBS[slot].fareTn; },
    showForever: (state, rerender) => {
      const d = state.data;
      const slot = slotOf(d); if (!slot) return false;
      const ce = ensureOf(d, slot);
      if (ce.forever) return false;
      const c = card(FOREVER_ID[slot]); if (!c) return false;
      ce.forever = true;
      /* ★ 同 `consumePending`：原来这里也是 `Hub.showEventCard`（不存在的方法）→ 永久卡静默不显示 */
      return !!showC(state, FOREVER_ID[slot], {}, () => { if (typeof rerender === "function") rerender(); });
    },
    retentionOverride: (state, done) => false,
    onFrozen: () => {},
    onLeave: () => {},
    _debug: { slotOf, tenure, card, ensureOf, PLANS, REG, SETTLE, FARE, DERBY },
  };
  window._CE6 = mine;

  /* ★ P301：阵容地板兜底（实现体；挂点见 window.ClubEvents.onInitSeason 处注释）。
     补位种子 = hashSeed(tid + "|p301floor")——与 install 的 tid 种子刻意错开，
     杜绝与既有补位球员同名；taken 集合二次防撞。FLOOR=18 与 data_real.install 同口径。 */
  function ensureSquadFloors() {
    const RD = window.REAL_DATA;
    if (!RD || typeof RD.buildFillers !== "function" || typeof RD.mulberry32 !== "function" || typeof LD !== "function") return;
    const FLOOR = 18;
    for (const [, lg] of Object.entries(LD())) {
      if (!lg || !Array.isArray(lg.teams)) continue;
      for (const t of lg.teams) {
        if (!t || !Array.isArray(t.players) || t.players.length >= FLOOR) continue;
        const rng = RD.mulberry32(RD.hashSeed(String(t.id || "") + "|p301floor"));
        const names = t.players.map(p => (Array.isArray(p) ? p[0] : p.name)).filter(Boolean);
        const fill = RD.buildFillers(String(t.id || ""), t.strength || 60, lg.country || "", rng, names).slice(0, FLOOR - t.players.length);
        if (fill.length) t.players = t.players.concat(fill);
      }
    }
  }

  window.ClubEvents = {
    ensure: d => { const slot = slotOf(d); return slot ? ensureOf(d, slot) : CE5.ensure(d); },
    onInitSeason: (state, clubId) => { safe(() => CE5.onInitSeason(state, clubId)); safe(() => mine.onInitSeason(state)); safe(() => ensureSquadFloors()); },
    /* ★ P301（玩家反馈「球队里的人越来越少」实锤修复）：阵容地板兜底（链尾单点）。
       真实转会日历引擎（club_events1~6 / club/*）每季重建 t.players：out 名单随赛季
       单调增长、in 补入窗口会关闭 ⇒ 盖尔森基欣矿工/曼德里白舰/巴塞罗纳/多特蒙顿等多队跌破 18 人基线，
       且边锋/边后卫整组位置消失（战术图空槽逐年变多）。此处每季装配后统一扫全联赛，
       <18 人的队用 buildFillers 确定性补足（自带 mulberry32(tid) 种子 + taken 防撞名，
       零 R 消耗、跨 boot 逐位一致、双端一致）。
       ★ 挂在链尾导出 = 覆盖全部 6 模块迁移后（P99 青训闸同位理由）。 */
    /* ★★ P99 批 3（R17/R19，最高优先级）：**青训期整条链早退**。
       为什么闸门必须打在"**链尾导出**"（本处）而不是 CE1 的导出（`club_events.js:1161`）
       或 CE1 的 `onSeasonEnd`（`club_events.js:286`）：
       `window.ClubEvents` 是 6 模块**链式覆盖**，链尾这一版是**唯一一个能覆盖全部 6 个模块**的点
       —— 打在第一环只挡得住 CE1，CE2~CE6 的 `ce.clubApps` / `ce.clubGoals`（以及各自的
       `lgEver` / `cupEver` / `firstTitle`）照样写。
       ★ 更正记录：本注释的早期草稿把依据写成 "`club_events3.js:229`" —— 那一行在
         `catchUp()` 里（由 `onInitSeason` 调用），**不是** `onSeasonEnd` 的证据，属引用不准，
         已改为上面两处真实行号（CE1 导出 / CE1 `onSeasonEnd`）。
       不早退的后果（**实测**，见下）：
         · R19（**可证、已证实**）：链首 `club_events.js:293-294` 的
           `ce.clubGoals += ss.goals` / `ce.clubApps += ss.apps` 位于 `onSeasonEnd` 开头、
           **任何归属守卫之前** → 青训期必然执行。全库累加点共 **14 处**
           （CE1 4 处 + CE2/CE3/CE4/CE5 各 1 处 + `club/*.js` 6 处），全部都只增不减、无清零路径。
           实测（摘掉本闸门跑一季青训）：`d.clubEvents.dortmund.clubApps 0→34`、`clubGoals 0→68`
           （34 = 青训赛季 `d.seasonStats.apps`）→ 「第 250 场」类里程碑卡整体提前到 20 岁。
         · R17（**内容消失型，比数据错严重一级**）：`myRank = 青年榜排名` → `lgChamp = myRank===1`
           → 本该置位 `ce.lgEver` / `ce.firstTitle` → 职业期的「效力期开门红」「首座杯赛奖杯」卡
           **永久不再触发**。
           ★★ **措辞定性（按相位分档，不能一句"不可达"）**：
             · `phase === "academy"`（青训态）：**本相位下未观测到命中**。机制**不是**"结构上不可达"，
               而是**一条实现选择** —— `youth.js:199 d.clubId = youthClubId`
               （青年队 id = `y` + 成年 id），而 6 个模块的 slot 映射**全部按成年 id 匹配**：
               CE1 `atDor(d)`（`club/dor.js:47`）、CE2 `slotOf`（`:65`）、CE3 `slotOf`
               （`:57-59`，只匹配 `["rma","bar","atm"]`）、CE4 `SLOTS`（`:22`）+ `slotOf`（`:59-61`）、
               CE5 `slotOf`（`:829`）、CE6 `POOLS`（`:24`）+ `slotOf`（`:56-58`）
               ⇒ 青年队 id 过不了这些归属守卫，`onSeasonEnd` 在 `const slot = slotOf(d); if (!slot) return;`
               处天然早退。**这是一条"未声明的不变量"**：它没有任何注释/类型/测试把它锁住，
               谁改了 `youth.js:199` 或给某个模块加了"按 id 前缀/兜底"的 slot 解析，保护立刻失效。
             · ★★ **决定性理由（本闸门存在的真正原因）**：`enter` → 首个 `initYouthSeason` 之间，
               `enter` / `applyEntry`（`youth.js:151-158`，只写 `y.tier/academyId/entrySeason/contractYears`）
               **都不写 `d.clubId`** ⇒ 这段时间 `d.clubId` 可能**仍是母队成年 id**
               → 任何 `onSeasonEnd` 类逻辑跑过 `slotOf` 就**命中**。
               **链尾闸门是这条窗口的唯一防线**（入口分派管不住"此刻 `d.clubId` 是什么"）。
             · `phase === "jump"`（跳级态）：`slotOf` **命中，且属设计允许**
               （§7.4.1 跳级者走正常路径、可拿职业荣誉）⇒ 闸门按 `inAcademy`（仅 `"academy"`
               相位）而非 `isProtected` 判定，跳级态照常放行。
           ★ 与设计稿的**已知不一致（登记，待设计侧处置）**：§3.3 把 `d.youth.academyId`
             解释为「母队 clubId（**与 `d.clubId` 同值**）」—— 与实现（`d.clubId` = 青年队 id）**相反**。
           ⇒ 因此：**R19 是可证判据**（写入点在归属守卫之前，青训期必然执行，已实测）；**R17 保持为活风险 E-6**
             （本相位下靠未声明不变量"侥幸"不命中，不构成"不可达"的证明）。
           ★ 实测（摘闸后青训跑一季）：`lgEver` / `cupEver` / `firstTitle` **一个都没被置位**
             —— 这正是上面"未观测到命中"的观测来源，**不可**据此推出"不可达"。
             CE2/CE3/CE5 的 `onSeasonEnd` 第一句即守卫，CE1 的冠军分支在 `atDor(d)` 之内
             （`club_events.js:322`）。
       ★ 与 `SeasonSystem.finishSeason` 第一行的入口分派是**两道独立防线**：那道管"调用点"
         （青训路径根本不进来），这道管"被调用者"（未来任何新增调用方也进不来）。
       ★ 本闸门**不是"存在即绿"**：`tools/_p99_youth_probe.js` 的 F3 在青训季末**直调**
         `ClubEvents.onSeasonEnd(State)` 并断言 `ce` 快照逐位不变（J11）；
         F7① 再把本行**摘掉**重跑，证明 J11 真的会红（并顺带量出上面那两组数字）。
       ★ 未做（已登记，批 5）：`consumePending` 同样在青训期要早退（设计稿 C-3 / 陷阱②，
         `v2/hub.js:26` 每日调用；本批任务书只点名 `onSeasonEnd`）。 */
    onSeasonEnd: state => {
      if (window.Youth && Youth.inAcademy(state && state.data)) return;
      safe(() => CE5.onSeasonEnd(state)); safe(() => mine.onSeasonEnd(state));
    },
    pickSilent: (state, ctxs) => { const c = safe(() => CE5.pickSilent(state, ctxs), null); if (c) return c; return safe(() => mine.pickSilent(state, ctxs), null); },
    noteSilent: (state, ctxs) => { safe(() => CE5.noteSilent(state, ctxs)); safe(() => mine.noteSilent(state, ctxs)); },
    pickPre: (state, fixture) => { const c = safe(() => CE5.pickPre(state, fixture), null); if (c) return c; return safe(() => mine.pickPre(state, fixture), null); },
    onResult: (state, ctx, onDone) => { const h = safe(() => CE5.onResult(state, ctx, onDone), false); if (h) return true; return !!safe(() => mine.onResult(state, ctx, onDone), false); },
    consumePending: state => { const slot = state && state.data ? slotOf(state.data) : null; if (slot) return !!safe(() => mine.consumePending(state), false); return !!safe(() => CE5.consumePending(state), false); },
    foreverOn: d => !!safe(() => CE5.foreverOn(d), false) || !!safe(() => mine.foreverOn(d), false),
    /* ★ 缺陷修复（P97）：原来 `canForever` / `showForever` **只委托 CE5、漏了 `mine`** ——
       而 `mine.canForever`（tenure ≥ fareTn）与 `mine.showForever`（展示 `*_forever` 卡）
       都是**完整实现**，`FOREVER_ID` 映射的 5 张卡（juv/int/nap/rom/acm_forever）在数据里也真实存在。
       后果：意甲五强 `canForever` 恒 false → `nation_dev` 的「宣誓（永不离队）」按钮**永不渲染**
       → `mine.showForever` 不可达 → 5 张队魂卡 + 「一生一队」（foreverOn 关掉报价池/挽留链）整条线失效。
       ★ 与同文件其它方法（pickSilent/pickPre/onResult/retentionOverride 都是「先 CE5 再 mine」）
       对比即可看出这是**漏写**，不是设计。 */
    canForever: d => !!safe(() => CE5.canForever(d), false) || !!safe(() => mine.canForever(d), false),
    showForever: (state, rerender) => { const h = safe(() => CE5.showForever(state, rerender), false); if (h) return true; return !!safe(() => mine.showForever(state, rerender), false); },
    retentionOverride: (state, done) => { const h = safe(() => CE5.retentionOverride(state, done), false); if (h) return true; return !!safe(() => mine.retentionOverride(state, done), false); },
    onFrozen: state => { safe(() => CE5.onFrozen(state)); safe(() => mine.onFrozen(state)); },
    onLeave: (state, from) => { safe(() => CE5.onLeave(state, from)); safe(() => mine.onLeave(state, from)); },
    /* ★ P97：逐层转发 `foreverLabel`（见 club_events2.js 的同名注释） */
    foreverLabel: CE5.foreverLabel,
    _debug: Object.assign({}, CE5._debug || {}, mine._debug),
  };
})();
