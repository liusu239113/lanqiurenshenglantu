/* ============================================================================
   国际赛事系统 v3 — 真实赛历循环化
   · 世界杯：每 4 年（year%4==2：2026/2030/2034…），6-7 月，48 队赛制
   · 亚洲杯：每 4 年（year%4==3：2027/2031/2035…），1-2 月，24 队赛制
   · 世预赛：每届世界杯前两年（r36 → r18 → 附加赛），按届次滚动征召
   · 友谊赛窗口：每年 3/6/9/10/11 月，年轻球员的国家队敲门砖
   · 征召按届次（edition）记录，杜绝"一次落选永久出局"
   · 难度基调：梦想成真型——赛制写实，玩家成长扛中国队
   ============================================================================ */
(function () {
  const ND = () => window.NATIONS_DATA;

  // ── 国家队阵容生成（缓存）──
  const squadCache = {};
  /* ★★ P109（2026-09-17 用户拍板）：投资国家队 → 直接抬升**当前名单球员的基准 OVR**。
     基线名单只生成一次（缓存），国力加成的折算量在**每次读取时叠加**（派生、不落盘）：
     投入落地后的下一次展示/比赛读取立即看到 OVR 变化 —— 延迟反馈改即时反馈。
     分布：整数部分全员 +N；小数余数四舍五入折成整点，按名单顺序（真名球星在前）补足，
     使平均值 = 基线 + squadBonusOf（±1 人舍入差）。 */
  function applySquadBoost(squad, bonus) {
    if (!(bonus > 0) || !squad || !squad.length) return squad;
    const whole = Math.floor(bonus), frac = bonus - whole;
    const extra = Math.round(frac * squad.length);
    return squad.map((p, i) => Object.assign({}, p, {
      overall: Math.min(99, (p.overall || 0) + whole + (i < extra ? 1 : 0)),
    }));
  }
  function nationSquadBoost(nation) {
    if (nation !== "中国" || !window.State || !window.State.data || !window.NationDev) return 0;
    try { return NationDev.squadBonusOf(window.State) || 0; } catch (e) { return 0; }
  }
  function nationSquad(nation) {
    if (!squadCache[nation]) {
      const NDd = ND();
      const strength = NDd.teams[nation] || 64;
      const stars = (NDd.stars[nation] || []).map(s => ({ name: s[0], age: s[1], position: s[2], nationality: nation, overall: s[4], real: true }));
      const genName = window.REAL_DATA && window.REAL_DATA.genIntlFillerName; // P108：按国家文化圈音译（中文语境国家自动走中文名）
      const rng = mulberry32(hashStr(nation));
      const plan = [["GK", 3], ["CB", 4], ["LB", 1], ["RB", 1], ["CDM", 2], ["CM", 2], ["CAM", 1], ["LW", 1], ["RW", 1], ["ST", 2]];
      const taken = new Set(stars.map(s => s.name));
      const fillers = [];
      // P108：统一补足到 23 人（大赛名单口径）；plan 一轮 18 槽不够时第二轮只补非门将位置
      const need = Math.max(0, 23 - stars.length);
      let made = 0, pass = 0;
      while (made < need && pass < 3) {
        for (const [pos, n] of plan) {
          if (pass > 0 && pos === "GK") continue; // 二轮起不再堆门将
          for (let i = 0; i < n && made < need; i++) {
            fillers.push({ name: genName ? genName(nation, rng, taken) : "球员" + (fillers.length + 1), position: pos, nationality: nation, age: 19 + Math.floor(rng() * 15), overall: Math.max(40, strength - 2 - Math.floor(rng() * 12)) });
            made++;
          }
        }
        pass++;
      }
      // 真实球星插入前 11 人：按评分排序前 11 视为首发线
      squadCache[nation] = stars.concat(fillers).slice(0, 23);
    }
    const bonus = nationSquadBoost(nation);
    return bonus > 0 ? applySquadBoost(squadCache[nation], bonus) : squadCache[nation];
  }
  /** ★★ P187（玩家实测「OVR 达标也进不去国家队」）：基线名单（**不含** squadBonus）。
   *  根因：P109 的 applySquadBoost 把投资加成折算成**全队队友 OVR 提升（封顶 +10）**，
   *  而 tryCallup 的同位置竞争（better）用的是同一份被抬高的名单 → **投资越多队友越强，
   *  玩家反而被挤出名单**（复现：OVR70 零投资=首发；投 5 亿 squadBonus 满额 → 队友均
   *  60→70 → 降级替补；CB 等 fillers 多的位置 better 超 posCap 直接落选）。P186 投资深度
   *  加大后此矛盾爆发。
   *  修法：**征召竞争一律用基线名单**——squadBonus 的「投资看得见」反馈保留在
   *  名单展示（nationSquad）与比赛强度（nationSquadOf）两处，不再参与征召竞争。 */
  function nationSquadBase(nation) {
    if (!squadCache[nation]) nationSquad(nation);   // 触发生成（nationSquad 内部写缓存）
    return squadCache[nation];
  }
  window.nationSquadOf = nationSquad; // 供比赛引擎读取真实国家队阵容（含 squadBonus）
  function hashStr(str) {
    let h = 2166136261; str = String(str || "");
    for (let i = 0; i < str.length; i++) { h = (h ^ str.charCodeAt(i)) * 16777619; h = h & 0x7fffffff; }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 14)) >>> 0) / 4294967296;
      return t;
    };
  }
  function nationStrength(nation) {
    const base = (ND().teams[nation]) || 64;
    // P0-4：中国强度随玩家成长联动（ovr70 前不加成；ovr90 时 64+8=72），治"18 强出线率 0.3%、世界杯死内容"
    // P45：再叠加「国力加成」——休赛期投资带来的递减不封顶增益
    //      规格 docs/休赛期消费体系与国足发展规格_v1.md §2
    if (nation === "中国" && window.State && State.data && State.data.player) {
      try {
        let s = base;
        if (window.PlayerSystem) {
          const ovr = PlayerSystem.overall(State.data.player);
          /* ★ P143 超级巨星效应：系数 0.4→0.8 单源化（NationDev.ovrBonusOf；回落保留旧 0.4 防加载序） */
          s += (window.NationDev && NationDev.ovrBonusOf) ? NationDev.ovrBonusOf(ovr) : Math.max(0, ovr - 70) * 0.4;
        }
        if (window.NationDev) s += NationDev.boost(State);
        // 封顶保护：理论上限 92（世界第一水平），正常玩法只能逼近、不会触及
        const cap = (window.NationDev && NationDev.CFG && NationDev.CFG.MAX_STRENGTH) || 92;
        return Math.round(Math.min(cap, s));
      } catch (e) { /* 回落基础值 */ }
    }
    return base;
  }

  // ── 日历工具 ──
  const DIM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  function calNum(y, m, d) { return y * 10000 + m * 100 + d; }
  function wcYearFor(year) { return year + ((2 - (year % 4)) + 4) % 4; } // 距最近的世界杯年
  /* ★ P285（玩家实测「亚洲杯也要有」）：旧门槛 `A >= 2027` 把 2015/2019/2023 三届真实
     亚洲杯全部挡死（数据层 asiaCupEdition 本就支持 2015 澳大利亚 16 队/2019/2023 24 队
     真实分组）——玩家整个早年生涯零亚洲杯。放开到 2015 起（真实亚洲杯年 = 2015+4k）。 */
  function isAsiaCupYear(A) { return A >= 2015 && (A - 2015) % 4 === 0; }

  // ── 征召判定 v3（分层门槛）──
  // 梦想成真型：赛制写实，门槛随赛事层级递增；年轻球员有宽限；33 岁后逐步淡出
  const TIERS = {
    friendly: { first: 50, squad: 44, posCap: 6, youngBonus: 6, youngAge: 19, youngFame: 2500 },
    ac:       { first: 54, squad: 46, posCap: 4, youngBonus: 6, youngAge: 19 },
    wcq:      { first: 56, squad: 48, posCap: 4, youngBonus: 6, youngAge: 20 },
    wc:       { first: 58, squad: 50, posCap: 3, youngBonus: 4, youngAge: 21 },
  };
  function tryCallup(state, nation, tier) {
    tier = tier || "wcq";
    const t = TIERS[tier] || TIERS.wcq;
    const d = state.data;
    const p = d.player;
    /* ★★★ P99 批 4c ④（台账 A11 + 设计稿 §7.10.1「国家队征召门」K19 / J18 / D18）——历史口径存档：
       原门 = `Youth.isProtected(d) || p.age < 18`（青训期与未成年一律不征召）。
       ★★ P300（2026-09-24 兄弟拍板「国家队准入 16 岁 + 青训期 16+ 放行」，翻 A11 之案）：
         新门 = 单一年龄判据 `p.age < 16`：
         · 14–15 岁（无论是否青训期）一律不征召——低龄梯队由 P115 国少线承接（16 岁进国少）；
         · 16 岁起 academy/jump 球员可被成年队直接征召（现实口径：亚马尔 16 岁国家队首秀）。
       ★ 旧版教训仍在（P99：「17 岁青训反而比 18 岁容易入选」的 youngBonus 反向放大）：
         本门必须放在 `ovr` 计算之前——16-17 岁按下方 young 分支享受降线，
         15 岁及以下在此被拦，不存在「先降线再拦截」的次序颠倒。
       ★ 返回形状与既有失败分支逐字一致（`{called:false, reason}`），不新增字段；不抛错。 */
    if (p && p.age < 16) {
      return {
        called: false,
        reason: "未满 16 岁不参加成年国家队征召（16 岁起走国字号阶梯）",
      };
    }
    let ovr = PlayerSystem.overall(p);
    if (p.age > 33) ovr -= (p.age - 33) * 2; // 老将淡出曲线
    /* ★ P185：「国脚资产」技能 = 考察印象加成（5★ +2.5 OVR 当量）——教练组眼里你
       "为国家打球的样子更亮眼"；同时作用于首发线/深度排名的判定基线。 */
    if (window.Skills && Skills.bonus) ovr += Skills.bonus(d, "nationalAsset", 2.5);
    /* ★★ P187：竞争判定改用**基线名单**（nationSquadBase，不含 squadBonus）——
       投资加成只应抬「国家队实力展示 + 比赛强度」，不能把玩家自己挤出名单
       （复现与修法见 nationSquadBase 处的注释）。 */
    const squad = nationSquadBase(nation);
    // 位置深度：玩家在该国同位置球员中的排名
    const samePos = squad.filter(pl => pl.position === p.position);
    const better = samePos.filter(pl => pl.overall > ovr).length;
    let role = null, reason = "";
    if (d.injuryDays > 0) return { called: false, reason: "伤病未愈，国家队医疗组未征召你" };
    const young = p.age <= t.youngAge;
    const squadLine = t.squad - (young ? t.youngBonus : 0);
    if (ovr >= t.first && better <= 1) role = "starter";
    else if (ovr >= squadLine && better <= t.posCap) role = "bench";
    if (!role) {
      reason = better > t.posCap ? "同位置竞争激烈（现役 " + better + " 人评分高于你）" : "总评未达大名单线（需 " + squadLine + "，当前 " + Math.round(ovr) + "）";
      return { called: false, reason, ovr, line: squadLine };
    }
    return { called: true, role, ovr, better, tier };
  }
  /* ★ P187 探针钩子（vm 验证用；生产无消费方，零副作用） */
  if (typeof window !== "undefined") { window.__tryCallupHook = tryCallup; window.__nationSquadBaseHook = nationSquadBase; }

  // ── 状态初始化与 v1→v3 迁移 ──
  function ensureIntl(state) {
    const d = state.data;
    d.intl = d.intl || { version: 3, asiaCup: null, wcq: null, seenCallupYears: {}, career: { apps: 0, goals: 0, assists: 0 } };
    const intl = d.intl;
    intl.career = intl.career || { apps: 0, goals: 0, assists: 0 };
    intl.shooters = intl.shooters || {};
    intl.editions = intl.editions || {};
    intl.friendlyFixtures = intl.friendlyFixtures || [];
    intl.friendlyWindows = intl.friendlyWindows || {};
    intl.friendlyResults = intl.friendlyResults || [];
    /* ★★ P115 国家队年龄阶梯：国少（U17）/ 国青（U20）—— 16 岁前零国家队事件，
       16-17 岁走国少、18-20 岁走国青（与成年队 18+ 门并行为真实双通道）。 */
    intl.youth = intl.youth || { u17: { years: {} }, u20: { years: {} } };
    intl.youthCareer = intl.youthCareer || {
      u17: { apps: 0, goals: 0, assists: 0 },
      u20: { apps: 0, goals: 0, assists: 0 },
    };
    intl.youthPending = intl.youthPending || [];
    /* ★★ P295：东亚杯（E-1，奇数年 7 月）+ 奥运会 U23（%4==0 年 7 月）+ 国家队荣誉榜。
       miniFixtures = 两项新赛事的赛程（type:"intl"，复用友谊赛/大赛的结算/追平/调度通道）；
       honors = 历届大赛成绩档案（世界杯/亚洲杯/东亚杯/奥运会，上限 40 条）。 */
    intl.miniFixtures = intl.miniFixtures || [];
    intl.eaffYears = intl.eaffYears || {};
    intl.olyYears = intl.olyYears || {};
    intl.honors = intl.honors || [];
    if (intl.version !== 3) {
      // 旧档一次性标记 → 按届次记录
      if (intl.asiaCupSquadDone !== undefined) {
        intl.editions["AC-2027"] = { announced: true, missNoted: true, squad: intl.asiaCupCallup || { called: false } };
        delete intl.asiaCupSquadDone; delete intl.asiaCupCallup;
      }
      if (intl.wcqSquad !== undefined) { intl.editions["WCQ-2030"] = { squad: intl.wcqSquad, missNoted: true }; delete intl.wcqSquad; }
      if (intl.wcSquad !== undefined) { intl.editions["WC-2030"] = { squad: intl.wcSquad, missNoted: true }; delete intl.wcSquad; }
      if (intl.wcq && !intl.wcq.worldCupYear) intl.wcq.worldCupYear = 2030;
      if (intl.asiaCup && !intl.asiaCup.year) intl.asiaCup.year = 2027;
      if (intl.worldCup && !intl.worldCup.year) intl.worldCup.year = 2030;
      intl.version = 3;
    }
    return intl;
  }

  // ── 过期国际赛自动结算（宽限 7 天：受伤/跳过的场次到期后按双方实力快速结算，不再无限顺延）──
  function autoSettleOverdue(state, today) {
    const d = state.data;
    const intl = d.intl;
    const GRACE = 7;
    let swept = 0;
    const settle = fx => {
      if (!fx || fx.played) return;
      const userIsHome = fx.match.home.id === "nat_中国" || (fx.match.home.id || "").indexOf("intl_me") === 0;
      const me = userIsHome ? fx.match.home : fx.match.away;
      const opp = userIsHome ? fx.match.away : fx.match.home;
      const [g1, g2] = quickScore(me.strength || nationStrength("中国"), opp.strength || 70);
      const result = userIsHome ? { home: g1, away: g2 } : { home: g2, away: g1 };
      result.userGoals = 0; result.userAssists = 0; result.rating = 0; result.played = false; result.missed = true;
      applyResult(state, fx, result);
      /* ★ P96 修复：cupKO 判定收紧到「世界杯 / 亚洲杯」两系。
         原条件 `if (fx.cupKO)` 会把「世预赛跨洲附加赛」误判为亚洲杯淘汰赛 ——
         该 fixture 由 settlePlayoff 生成（stage="playoff" / comp="世预赛跨洲附加赛" / cupKO=true），
         它不是亚洲杯系；当年无亚洲杯时 d.intl.asiaCup 为 null → advanceKO 里 cup.results.push 崩。
         收紧后它落到下面的 `comp.indexOf("世预赛") >= 0` 分支 → settlePlayoff，走正确路径。 */
      if (fx.cupKO && (fx.comp.indexOf("世界杯") >= 0 || fx.comp.indexOf("亚洲杯") >= 0)) {
        const isWc = fx.comp.indexOf("世界杯") >= 0;
        const ko = isWc ? advanceWcKO(state, fx, result, null) : advanceKO(state, fx, result, null);
        if (ko && (ko.out || ko.champion)) { if (isWc) settleWorldCup(state); else settleAsiaCup(state); }
      } else if (fx.comp.indexOf("亚洲杯小组赛") >= 0) {
        const cup = d.intl.asiaCup;
        if (cup && cup.fixtures.every(f => f.played)) {
          const g = onGroupComplete(state);
          if (!g.qualified) settleAsiaCup(state);
        }
      } else if (fx.comp.indexOf("世界杯") >= 0 && fx.stage === "wc-group") {
        const wc = d.intl.worldCup;
        if (wc && wc.groupResult && wc.groupResult.qualified === false && wc.stage === "group-out") settleWorldCup(state);
      } else if (fx.comp.indexOf("世预赛") >= 0) {
        const q = d.intl.wcq;
        if (q) {
          const r18 = q.fixtures.filter(f => f.stage === "r18");
          const po = q.fixtures.filter(f => f.stage === "playoff");
          if (q.stage === "r36" && q.fixtures.filter(f => f.stage === "r36").every(f => f.played)) { const s = settleWcq36(state); if (s.qualified && !q.r36FameDone) { q.r36FameDone = true; if (window.Career) Career.addFame(state, 3000); } } // P2-3：防双发标记
          else if (q.stage === "r18" && r18.length && r18.every(f => f.played)) settleR18(state);
          else if (q.stage === "playoff" && po.length && po.every(f => f.played)) settlePlayoff(state);
        }
      }
      swept++;
    };
    const wc = intl.worldCup, cup = intl.asiaCup, q = intl.wcq;
    if (wc && wc.stage !== "done") {
      for (const f of wc.fixtures) if (!f.played && today - calNum(f.year || wc.year, f.month, f.day) > GRACE) settle(f);
      if (wc.nextKO && wc.nextKO.fixture && !wc.nextKO.fixture.played && today - calNum(wc.year, wc.nextKO.fixture.month, wc.nextKO.fixture.day) > GRACE) settle(wc.nextKO.fixture);
    }
    if (cup && cup.stage !== "done") {
      for (const f of cup.fixtures) if (!f.played && today - calNum(f.year || cup.year, f.month, f.day) > GRACE) settle(f);
      if (cup.nextKO && cup.nextKO.fixture && !cup.nextKO.fixture.played && today - calNum(cup.year, cup.nextKO.fixture.month, cup.nextKO.fixture.day) > GRACE) settle(cup.nextKO.fixture);
    }
    if (q && q.fixtures) {
      /* ★★ P285（玩家实测：18 年世界杯/世预赛「没有比赛、没有结果，直接跳过」）：
         此前本段有 `ed.squad.called` 门槛——玩家落选/青训期错过征召时，**世预赛赛程完全
         冻结**（NPC 中国队一场都不踢）→ 周期永不推进 → stage 永不到 worldcup-qualified →
         世界杯正赛与「无缘公告」全部静默 → 整届凭空消失。
         修法：与世界杯/亚洲杯同口径（:264/:268 均无 called 条件）——未征召也自动结算，
         settle() 的 quickScore+missed 语义本就是「缺席完赛」通道；pickDueMatch 的
         called 门槛保留（不给玩家排比赛日），仅去掉**追平结算**的门槛。 */
      for (const f of q.fixtures) if (!f.played && today - calNum(f.year, f.month, f.day) > GRACE) settle(f);
    }
    for (const f of intl.friendlyFixtures) if (!f.played && today - calNum(f.year, f.month, f.day) > GRACE) settle(f);
    /* ★ P295：东亚杯/奥运会——过期场同样走「缺席完赛」通道（applyResult → miniAfterResult
       推进小组榜/淘汰赛/荣誉入账；未征召届的 NPC 赛果也由这里兜住，绝不冻结） */
    for (const f of intl.miniFixtures || []) if (!f.played && today - calNum(f.year, f.month, f.day) > GRACE) settle(f);
    return swept;
  }

  // ── 到期比赛调度（过期顺延：与俱乐部赛程冲突时自动挪到下一个空闲日；超宽限期自动结算）──
  function pickDueMatch(state, today) {
    const intl = state.data.intl;
    const sweptN = autoSettleOverdue(state, today);
    if (sweptN > 0) intl._sweptNotice = (intl._sweptNotice || 0) + sweptN;
    const cands = [];
    const wc = intl.worldCup;
    if (wc && wc.stage !== "done") {
      for (const f of wc.fixtures) if (!f.played) cands.push([calNum(f.year || wc.year, f.month, f.day), f]);
      if (wc.nextKO && wc.nextKO.fixture && !wc.nextKO.fixture.played) cands.push([calNum(wc.year, wc.nextKO.fixture.month, wc.nextKO.fixture.day), wc.nextKO.fixture]);
    }
    const cup = intl.asiaCup;
    if (cup && cup.stage !== "done") {
      for (const f of cup.fixtures) if (!f.played) cands.push([calNum(f.year || cup.year, f.month, f.day), f]);
      if (cup.nextKO && cup.nextKO.fixture && !cup.nextKO.fixture.played) cands.push([calNum(cup.year, cup.nextKO.fixture.month, cup.nextKO.fixture.day), cup.nextKO.fixture]);
    }
    const q = intl.wcq;
    if (q && q.fixtures) {
      const ed = intl.editions["WCQ-" + q.worldCupYear];
      if (ed && ed.squad && ed.squad.called) for (const f of q.fixtures) if (!f.played) cands.push([calNum(f.year, f.month, f.day), f]);
    }
    for (const f of intl.friendlyFixtures) if (!f.played) cands.push([calNum(f.year, f.month, f.day), f]);
    /* ★ P295：东亚杯/奥运会——仅**被征召**的届次给玩家排比赛日（未征召届走自动结算） */
    for (const f of intl.miniFixtures || []) {
      if (f.played) continue;
      const ed = intl.eaffYears[f.year] || intl.olyYears[f.year];
      if (ed && ed.called) cands.push([calNum(f.year, f.month, f.day), f]);
    }
    let best = null, bestN = Infinity;
    for (const [n, f] of cands) if (n <= today && n < bestN) { best = f; bestN = n; }
    return best;
  }

  // 当天国家队赛事事件入口（Career.advanceDay 与 fixtureToday 调用）
  function onDay(state) {
    const d = state.data;
    if (d.retired) return null;
    const intl = ensureIntl(state);
    const { year, month, day } = d.date;
    const today = calNum(year, month, day);

    // ① 到期国家队比赛（俱乐部赛程在 fixtureToday 中优先，冲突时比赛顺延）
    const fx = pickDueMatch(state, today);
    if (fx) return { type: "match", fixture: fx };

    // ⓪★ P115：到期梯队比赛（国少/国青系列赛自动结算，逐日一场结果卡）
    //   ★ 与②~⑤同款 pendingEvent 暂存 —— fixtureToday 先行调用 onDay 会丢弃非比赛事件
    const yMatch = youthResolveDue(state, today);
    if (yMatch) return (intl.pendingEvent = yMatch, yMatch);

    // ①b 过期结算通报（fixtureToday 只认 match 类型，通报走 pendingEvent 由 advanceDay 补发）
    if (!fx && intl._sweptNotice) {
      const n = intl._sweptNotice; intl._sweptNotice = 0;
      const ev = { title: "国足 · 国家队赛程追平", plain: true, text: "因伤病/缺席错过了 " + n + " 场国家队比赛，教练组已按双方实力安排球队完赛。下一个窗口，别再缺席了。", effects: { morale: -3 } };
      return (intl.pendingEvent = ev, ev);
    }

    // ② 世界杯正赛大名单（世界杯年 5.20，需本届预选赛出线）
    const wcAnn = wcSquadAnnouncement(state, year, month, day);
    if (wcAnn) return (intl.pendingEvent = wcAnn, wcAnn);

    // ③ 亚洲杯大名单（A-1 年 12.18 起，默认已晋级正赛）
    const acAnn = acSquadAnnouncement(state, year, month, day);
    if (acAnn) return (intl.pendingEvent = acAnn, acAnn);

    // ④ 世预赛滚动征召（每窗口首个比赛日评估，落选不锁死）
    const wcqEv = wcqTick(state, today, year);
    if (wcqEv) return (intl.pendingEvent = wcqEv, wcqEv);

    // ⑤ 友谊赛窗口（每年 3/6/9/10/11 月）
    const frEv = friendlyTick(state, year, month, day, today);
    if (frEv) return (intl.pendingEvent = frEv, frEv);

    // ⑤b★ P295 东亚杯（奇数年 7 月）/ 奥运会 U23（%4==0 年 7 月）——征召公告 + 赛程生成
    const miniEv = miniTick(state, year, month, day, today);
    if (miniEv) return (intl.pendingEvent = miniEv, miniEv);

    // ⑥★ P115 梯队阶梯窗口（国少 10 月 / 国青 11 月；16 岁前零事件）
    const yEv = youthTick(state, year, month, day, today);
    if (yEv) return (intl.pendingEvent = yEv, yEv);

    // ⑦★ P285（玩家实测「冠军是谁都不知道」）：玩家未参赛届次的 NPC 冠军播报——
    //   世界杯年 7 月中 / 亚洲杯年 2 月下旬，该届已过公告时点且玩家没有参赛数据 →
    //   按实力池**确定性**选出冠军/亚军（纯算术取模，零 R 消耗、soak 指纹零扰动），
    //   发 News 公告；幂等键 editions["WCNPC-"/"ACNPC-"+year]。
    if (month === 7 && day >= 15 && year % 4 === 2 && !intl.editions["WCNPC-" + year]
      && intl.editions["WC-" + year] && (!intl.worldCup || intl.worldCup.year !== year)) {
      intl.editions["WCNPC-" + year] = { done: true };
      const P8 = ["法国", "巴西", "德国", "阿根廷", "西班牙", "英格兰", "葡萄牙", "荷兰"];
      const sc = seededChampionOf(P8, year, 0);
      try { News.onEvent(state, "npc_wc_champion", { year: year, champion: sc.champion, runnerup: sc.runnerUp, player: d.player.name }); } catch (e) { /* ignore */ }
      try { pushHonor(state, "worldcup", year, sc.champion, sc.runnerUp, "未晋级正赛"); } catch (e) { /* ignore */ }   // ★ P295 荣誉榜
    }
    if (month === 2 && day >= 20 && !intl.editions["ACNPC-" + year] && intl.editions["AC-" + year]
      && (!intl.asiaCup || intl.asiaCup.year !== year)) {
      intl.editions["ACNPC-" + year] = { done: true };
      const A8 = ["日本", "伊朗", "韩国", "澳大利亚", "沙特阿拉伯", "卡塔尔", "伊拉克", "阿联酋"];
      const sc = seededChampionOf(A8, year, 1);
      try { News.onEvent(state, "npc_ac_champion", { year: year, champion: sc.champion, runnerup: sc.runnerUp, player: d.player.name }); } catch (e) { /* ignore */ }
      try { pushHonor(state, "asiacup", year, sc.champion, sc.runnerUp, "未晋级正赛"); } catch (e) { /* ignore */ }   // ★ P295 荣誉榜
    }

    return null;
  }

  // fixtureToday / homeTab 渲染会先行调用 onDay 并丢弃非比赛事件——
  // 这里把事件暂存，供 Career.advanceDay 补发给玩家，避免公告被静默吞掉
  function takePendingEvent(state) {
    const intl = state.data.intl;
    const ev = (intl && intl.pendingEvent) || null;
    if (intl) intl.pendingEvent = null;
    return ev;
  }

  // ── 世界杯正赛大名单公布 ──
  function wcSquadAnnouncement(state, year, month, day) {
    /* ★★ P285c（全生命周期实证 _p285c/_p285e：玩家 2018 整届蒸发真根因）：窗口原为
       `month===5 && day>=20` **唯一窗口**——5.20~5.31 期间只要有连续俱乐部比赛日
       （epl 收官轮/杯赛决赛都压在 5 月末）/休赛期事件挤压（onDay:317 pickDueMatch
       返回 match 即 early-return），公告被无限顺延，6 月起 month!==5 永不再触发
       → 大名单/正赛整届蒸发（与青训无关——2014/2022 能进纯属那两年 5 月下旬有空档）。
       修：窗口放宽为 **5.20 ~ 6.30 每天可触发**（正赛 6.9/15/21——6 月上旬弹=全程可踢，
       中下旬弹=赶得上后段场次，过期场次由 GRACE sweep 兜底），仍幂等（editions 键）。 */
    const inWindow = (month === 5 && day >= 20) || (month === 6 && day <= 30);
    if (year % 4 !== 2 || !inWindow) return null;
    const intl = state.data.intl;
    const key = "WC-" + year;
    if (intl.editions[key]) return null;
    const q = intl.wcq;
    /* ★★ P285（玩家实测「18 年世界杯直接跳过、22/26 外连公告都无」）：旧版在此处
       `q.stage !== "worldcup-qualified"` 即**静默 return**——周期冻结/错过窗口/未出线的
       生涯，世界杯整届零公告零结果。修法分三路，全部幂等落 editions[key]：
       ①已出线 → 原大名单流程；②周期存在但未出线/未走完 → 「无缘世界杯」公告；
       ③周期不存在（错过创建窗口）→ 「世界杯今夏开打，中国队缺席」中立公告。 */
    if (!q || q.worldCupYear !== year) {
      intl.editions[key] = { missNoted: true };
      return { title: year + " 世界杯", plain: true, text: year + " 世界杯大幕今夏拉开。中国队未能获得本届参赛资格——四年后的预选赛，从现在就开始准备。", effects: { morale: -2 } };
    }
    if (q.stage !== "worldcup-qualified") {
      intl.editions[key] = { missNoted: true };
      return { title: year + " 世界杯 · 亚洲区收官", plain: true, text: year + " 世界杯亚洲区预选赛落幕，中国队未能突围，无缘今夏的世界杯。看台上的你记住的是遗憾的滋味——下一届，把中国队带回去。", effects: { morale: -6 } };
    }
    intl.editions[key] = { missNoted: true };
    const res = tryCallup(state, "中国", "wc");
    intl.editions[key].squad = res;
    if (res.called) {
      initWorldCup(state, year);
      try { if (window.News) News.onEvent(state, "callup", { player: state.data.player.name, comp: "世界杯" }); } catch (e) { /* ignore */ }
      return { title: "世界杯大名单公布", plain: true, text: "历史性一刻——你入选了 " + year + " 世界杯中国队的最终 26 人名单！主教练说：让世界看看中国足球。", effects: { fame: 5000, morale: 12 } };
    }
    return { title: "世界杯大名单公布", text: year + " 世界杯 26 人名单公布，你遗憾落选。原因：" + res.reason + " —— 四年后，再来。", effects: { morale: -10 } };
  }

  // ── 亚洲杯大名单公布（每届独立评估）──
  function acSquadAnnouncement(state, year, month, day) {
    if (month !== 12 || day < 18) return null;
    const A = year + 1;
    if (!isAsiaCupYear(A)) return null;
    const intl = state.data.intl;
    const key = "AC-" + A;
    if (intl.editions[key]) return null;
    intl.editions[key] = { announced: true, missNoted: true };
    const res = tryCallup(state, "中国", "ac");
    intl.editions[key].squad = res;
    if (res.called) {
      initAsiaCup(state, A);
      try { if (window.News) News.onEvent(state, "callup", { player: state.data.player.name, comp: "亚洲杯" }); } catch (e) { /* ignore */ }
      return { title: "国足 · 国家队大名单公布", plain: true, text: A + " 亚洲杯 23 人大名单公布——你的名字赫然在列！" + (res.role === "starter" ? "名单备注写着：预计担任主力。" : "教练组备注：重点考察的年轻球员。"), effects: { fame: 800, morale: 10 } };
    }
    return { title: "国足 · 国家队大名单公布", text: A + " 亚洲杯 23 人名单公布，你遗憾落选。原因：" + res.reason + " —— 用俱乐部和友谊赛表现敲开国家队的大门。", effects: { morale: -6 } };
  }

  // ── 世预赛滚动征召：新周期开打 / 每窗口重新评估 ──
  function wcqTick(state, today, year) {
    const intl = state.data.intl;
    const W = wcYearFor(year);
    const key = "WCQ-" + W;
    let q = intl.wcq;
    if (!q || q.worldCupYear !== W) {
      // 周期创建门控：仅在第一阶段首窗口之后、第二阶段首窗口之前加入（避免开档晚的生涯追打整段过期赛程）。
      // 首窗口按届次数据取（2018 周期 40 强赛 2015-06 开打，早于硬编码 W-3.9）
      const cycG = (ND().wcqCycles || {})[W];
      const fw = cycG && (cycG.format === "r40r12" ? cycG.r40Windows : cycG.r36Windows);
      const gate = fw && fw[0] && fw[0].matches && fw[0].matches[0]
        ? calNum(fw[0].y || W - 3, fw[0].matches[0].month, fw[0].matches[0].day)
        : calNum(W - 3, 9, 8);
      if (today < gate || today > calNum(W - 2, 6, 8)) return null;
      initWcq(state, W);
      intl.editions[key] = { squad: null, missNoted: false };
      q = intl.wcq;
    }
    const ed = intl.editions[key] || (intl.editions[key] = { squad: null, missNoted: false });
    if (ed.squad && ed.squad.called) return null; // 已在名单中，比赛走 pickDueMatch
    const next = q.fixtures.find(f => !f.played);
    if (!next || calNum(next.year, next.month, next.day) > today) return null;
    const res = tryCallup(state, "中国", "wcq");
    ed.squad = res;
    if (res.called) {
      // 补赛错过场次：球队在没有你的情况下按实力快速模拟
      q.fixtures.forEach(f => { if (!f.played && calNum(f.year, f.month, f.day) < today) applyResult(state, f, quickScore(f.match.home.strength, f.match.away.strength).reduce((o, g, i) => (o[i ? "away" : "home"] = g, o), { userGoals: 0, userAssists: 0, played: false, rating: 6.5 })); });
      try { if (window.News) News.onEvent(state, "callup", { player: state.data.player.name, comp: "世界杯预选赛" }); } catch (e) { /* ignore */ }
      return { title: "国足 · 世预赛大名单公布", plain: true, text: "你入选了 " + W + " 世界杯亚洲区预选赛国家队大名单！" + (res.role === "starter" ? "主教练在名单会上点名：主力候选。" : "主教练：年轻球员，重点培养。"), effects: { fame: 600, morale: 8 } };
    }
    if (!ed.missNoted) {
      ed.missNoted = true;
      return { title: "国足 · 世预赛名单无缘", text: "世预赛大名单没有你的名字。原因：" + res.reason + " —— 窗口还多，用表现说话。", effects: { morale: -5 } };
    }
    return null;
  }

  // ── 友谊赛窗口 ──
  const FR_WINDOWS = [[3, 22], [6, 8], [9, 9], [10, 12], [11, 15]];

  /* ★ P100-B5：真实国际比赛日窗口（data_intl_windows.js，2014-2016 精确）。
     命中 → 触发日 = 窗口 start、友谊赛比赛日 = 表内 play（贴近真实节奏）；
     无表年份（2017+）→ 回落 FR_WINDOWS 惯例近似值 + 窗口日+4 旧语义（Q2 生成式节奏）。 */
  function intlWindowAt(year, month, day) {
    const T = window.INTL_WINDOWS;
    const arr = (T && T[String(year)]) || null;
    if (!arr) return null;
    const v = month * 100 + day;
    for (const w of arr) {
      const s = w.start[0] * 100 + w.start[1], e = w.end[0] * 100 + w.end[1];
      if (v >= s && v <= e) return w;
    }
    return null;
  }
  window.intlWindowAt = intlWindowAt; // 探针/规格对拍用
  const FR_POOLS = {
    a: ["叙利亚", "阿曼", "约旦", "泰国", "越南", "巴林", "乌兹别克斯坦", "马来西亚", "印度", "中国香港", "塔吉克斯坦", "朝鲜", "科威特", "新加坡", "黎巴嫩", "阿富汗"],
    b: ["沙特阿拉伯", "卡塔尔", "伊拉克", "阿联酋", "印度尼西亚"],
    c: ["墨西哥", "加拿大", "克罗地亚", "乌拉圭", "瑞士", "摩洛哥", "塞内加尔"],
  };
  function pickFriendlyOpp() {
    const r = R.next();
    const pool = r < 0.68 ? FR_POOLS.a : r < 0.9 ? FR_POOLS.b : FR_POOLS.c;
    return R.pick(pool);
  }
  // 当月是否有正式国际比赛（国家队层面让位，与是否在名单无关）
  function hasCompetitiveThisMonth(state, year, month) {
    const intl = state.data.intl;
    /* ★ P295：东亚杯/奥运会当月也是"竞争月"——友谊赛窗口让位（避免同月双国家比赛日） */
    if (intl.miniFixtures && intl.miniFixtures.some(f => !f.played && f.year === year && f.month === month)) return true;
    const wc = intl.worldCup;
    if (wc && wc.year === year && wc.stage !== "done" && month >= 5 && month <= 7) return true;
    const cup = intl.asiaCup;
    if (cup && cup.year === year && cup.stage !== "done" && month <= 3) return true;
    const q = intl.wcq;
    if (q && q.fixtures && q.fixtures.some(f => !f.played && f.year === year && f.month === month)) return true;
    return false;
  }
  function friendlyTick(state, year, month, day, today) {
    /* ★ P100-B5：优先真实窗口表——触发窗 = start ~ start+2 天（缓冲期：同日撞上
       世预赛大名单等其他事件时，次日仍可补触发，窗口不丢——旧单日触发会静默丢窗）；
       无表年回落 FR_WINDOWS 旧近似（单日触发 + 窗口日+4 比赛日）。 */
    const win = intlWindowAt(year, month, day);
    let isTrigger = false;
    if (win) {
      const ms = Date.UTC(year, month - 1, day, 12);
      const sMs = Date.UTC(year, win.start[0] - 1, win.start[1], 12);
      isTrigger = ms >= sMs && ms <= sMs + 2 * 86400000;
    } else {
      isTrigger = FR_WINDOWS.some(w => w[0] === month && w[1] === day);
    }
    if (!isTrigger) return null;
    const d = state.data, intl = d.intl;
    /* 幂等键 = 窗口实例（跨月窗口触发日与补触发日跨月也不重复；表内窗口 start 唯一） */
    const wKey = win ? (year + "-W" + win.start[0] + "-" + win.start[1]) : (year + "-" + month);
    if (intl.friendlyWindows[wKey]) return null;
    intl.friendlyWindows[wKey] = {};
    if (hasCompetitiveThisMonth(state, year, month)) { intl.friendlyWindows[wKey].skipped = true; return null; }
    const res = tryCallup(state, "中国", "friendly");
    const young = d.player.age <= 19;
    const fameGate = !young || (d.fame || 0) >= 2500; // 年轻人还需一点名气才会被考察
    if (!res.called || !fameGate) {
      intl.friendlyWindows[wKey].missed = true;
      /* ★★ P115（用户拍板）：国家队考察门 = **16 岁**。此前 age<=19 就弹「国家队考察中」，
         实测 14 岁青训生也收到 —— 12~15 岁被成年国家队考察不合现实。
         16 岁起的考察文案同步指向梯队阶梯（国少 → 国青 → 成年队），不再是成年队敲门。 */
      if (!intl.frHintDone && d.player.age >= 16 && d.player.age <= 19) {
        intl.frHintDone = true;
        return { title: "国字号考察中", text: "16 岁起国字号大门全面打开——国少、国青、成年队同步考察（成年队 16 岁准入），更高级别优先：进过成年队就不再回头踢梯队。攒够评分与名气，一级级往上走。", effects: { morale: 3 } };
      }
      return null;
    }
    // 比赛日 = 窗口表 play（真实日期轴）；无表年 → 窗口日 + 4 天（月底钳制）
    let md, mo;
    if (win && win.play) { md = win.play[1]; mo = win.play[0]; }
    else { md = day + 4; mo = month; }
    if (md > DIM[mo - 1]) { md -= DIM[mo - 1]; mo++; }
    const opp = pickFriendlyOpp();
    const me = { id: "nat_中国", name: "中国", strength: nationStrength("中国") };
    const o = { id: "nat_" + opp, name: opp, strength: nationStrength(opp) };
    const home = R.chance(0.5);
    intl.friendlyFixtures.push({ type: "intl", comp: "国际友谊赛", year, month: mo, day: md, played: false, result: null, friendly: true, match: home ? { home: me, away: o } : { home: o, away: me } });
    intl.friendlyWindows[wKey].called = true;
    try { if (window.News) News.onEvent(state, "callup", { player: d.player.name, comp: "国家队友谊赛" }); } catch (e) { /* ignore */ }
    return { title: "国足 · 友谊赛征召", plain: true, text: "你入选了国家队 " + mo + " 月国际友谊赛窗口的大名单——" + (home ? "主场" : "客场") + "迎战" + opp + "。教练组想看看你在国际赛场的成色。", effects: { fame: 250, morale: 6 } };
  }

  // ── 亚洲杯届次：东道主（2015/2019/2023/2027 为现实举办地；其后为游戏内设定轮换）──
  const AC_HOSTS = ["沙特阿拉伯", "韩国", "日本", "卡塔尔", "中国", "澳大利亚"];
  const AC_REAL_HOSTS = { 2015: "澳大利亚", 2019: "阿联酋", 2023: "卡塔尔", 2027: "沙特阿拉伯" };
  function asiaCupHost(year) {
    if (AC_REAL_HOSTS[year || 2027]) return AC_REAL_HOSTS[year || 2027];
    const idx = Math.max(0, Math.round(((year || 2027) - 2027) / 4));
    return AC_HOSTS[idx % AC_HOSTS.length];
  }
  // 届次数据：真实届次（2015 澳大利亚/2019 阿联酋/2023 卡塔尔）取 asiaCups，其余年份回落 2027 模板
  function asiaCupEdition(year) {
    const cups = ND().asiaCups || {};
    return cups[year || 2027] || ND().asiaCup2027;
  }

  /**
   * 亚洲杯动态分档抽签（2031 届起）
   * 24 队 = 东道主 + 亚足联 FIFA 积分排名前 23；4 档 × 6 队；东道主进第 1 档并落入 A 组。
   * 全部为亚足联成员 → **不施加洲际回避**（否则「同洲最多 1 队」会让抽签永远无解）。
   * 2027 届**不调用本函数**，保留现实官方分组（规格 §2.6.5 忠实现实优先）。
   */
  function drawAsiaCup(state, year) {
    const FP = window.FifaPoints;
    if (!FP) return null;
    const teams0 = ND().teams;
    const host = asiaCupHost(year);
    const afc = Object.keys(teams0).filter(n => FP.confedOf(n) === "AFC");
    const ranked = FP.ranking(state).map(x => x.name).filter(n => afc.indexOf(n) >= 0 && n !== host);
    const SLOTS = 24;
    const teams = [host].concat(ranked.slice(0, SLOTS - 1));
    // 防御：中国若因积分垫底被挤出（29 支亚足联球队取 24，实际不会发生），
    // 顶替末位以保证玩家国家队路径不中断
    if (teams.indexOf("中国") < 0) {
      if (teams.length >= SLOTS) teams[teams.length - 1] = "中国"; else teams.push("中国");
    }
    const groupNames = ["A", "B", "C", "D", "E", "F"];
    const hostGroups = {}; hostGroups[host] = "A";
    const res = FP.drawGroups(state, {
      teams, groupNames, potSize: 6, hosts: [host], hostGroups,
      rng: () => R.next(), tries: 600, noConfed: true,
    });
    return (res && res.groups) ? res.groups : null;
  }

  // ── 亚洲杯初始化（届次参数化：2015 澳大利亚 16 队真实分组；2019/2023 24 队真实分组；2027 官方真实分组，2031 起动态抽签）──
  function initAsiaCup(state, year) {
    const d = state.data;
    const A = year || 2027;
    const ed = asiaCupEdition(A);
    const tpl = ND().asiaCup2027;
    let groups = ed.groups;
    let drawn = false;
    if (A > 2027) {
      const g2 = drawAsiaCup(state, A);
      // 只有抽签结果里确实含中国才采用（否则安全回落到官方模板）
      if (g2 && Object.keys(g2).some(g => (g2[g] || []).indexOf("中国") >= 0)) { groups = g2; drawn = true; }
    }
    const table = {};
    for (const [g, teams] of Object.entries(groups)) {
      table[g] = teams.map(t => ({ name: t, strength: nationStrength(t), p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }));
    }
    const myGroup = Object.keys(groups).find(g => (groups[g] || []).indexOf("中国") >= 0) || "C";
    const opps = (groups[myGroup] || []).filter(t => t !== "中国");
    // 赛程日期沿用该届真实窗口（每届同期），对手换成本届抽签/官方结果
    const dates = (ed.chinaMatches || tpl.chinaMatches).map(m => ({ month: m.month, day: m.day, home: m.home }));
    d.intl.asiaCup = {
      year: A, stage: "group", round: 0, drawn, myGroup,
      host: A > 2027 ? asiaCupHost(A) : (ed.host || asiaCupHost(A)), // 动态抽签届走轮换东道主，真实届次用现实东道主
      format16: ed.teams === 16, // 2015 届 16 队制：4 组 × 4，无十六强轮
      table,
      fixtures: dates.map((m, i) => ({
        type: "intl", comp: "亚洲杯小组赛 R" + (i + 1), year: A, month: m.month, day: m.day, played: false, result: null,
        match: m.home
          ? { home: { id: "nat_中国", name: "中国", strength: nationStrength("中国") }, away: { id: "nat_" + opps[i], name: opps[i], strength: nationStrength(opps[i]) } }
          : { home: { id: "nat_" + opps[i], name: opps[i], strength: nationStrength(opps[i]) }, away: { id: "nat_中国", name: "中国", strength: nationStrength("中国") } },
      })),
      results: [],
    };
    d.intl.asiaCupStats = { goals: 0, ratingSum: 0, apps: 0 };
    return d.intl.asiaCup;
  }

  /** 窗口日期展平：优先窗口级 y 标注，否则从 startYear 起按月份回绕推算年份 */
  function flattenWindows(winArr, startYear) {
    const out = [];
    let y = startYear || 2027, prevM = 0;
    (winArr || []).forEach(w => {
      if (w && w.y) y = w.y;
      ((w && w.matches) || []).forEach(md => {
        if (md.month < prevM && !(w && w.y)) y++;
        prevM = md.month;
        out.push({ y, m: md.month, d: md.day });
      });
    });
    return out;
  }

  // ── 世预赛第一阶段初始化（2018/2022=40 强赛真实对手组 8 场双循环；2026/2030=36 强赛 6 场）──
  function initWcq(state, wcYear) {
    const d = state.data;
    const W = wcYear || 2030;
    const cyc = (ND().wcqCycles || {})[W] || null;
    const format = (cyc && cyc.format) === "r40r12" ? "r40r12" : "r36r18";

    let opps, seq, isHome, compName;
    if (format === "r40r12") {
      // 40 强赛：真实对手组（2018=C 组 卡塔尔/马尔代夫/中国香港/不丹；2022=A 组 叙利亚/菲律宾/马尔代夫/关岛）
      opps = (cyc.r40Opps || []).slice();
      while (opps.length < 4) opps.push("不丹");
      // 前 4 轮主场、后 4 轮客场倒序（收尾战客场对头名种子 = 真实的"末轮生死战"结构）
      seq = [opps[0], opps[1], opps[2], opps[3], opps[3], opps[2], opps[1], opps[0]];
      isHome = [true, true, true, true, false, false, false, false];
      compName = "世预赛40强赛";
    } else {
      // 36 强赛（2026/2030 周期，官方无静态抽签前随机对手池）
      const pot1 = ["日本", "韩国", "伊朗", "澳大利亚", "沙特阿拉伯", "卡塔尔", "乌兹别克斯坦", "伊拉克", "阿联酋"];
      const pot3 = ["巴林", "泰国", "巴勒斯坦", "越南", "塔吉克斯坦"];
      const pot4 = ["吉尔吉斯斯坦", "朝鲜", "印度尼西亚", "科威特", "新加坡"];
      opps = [R.pick(pot1), R.pick(pot3), R.pick(pot4)];
      seq = [opps[0], opps[1], opps[2], opps[2], opps[1], opps[0]];
      isHome = [true, false, true, false, true, false];
      compName = "世预赛36强赛";
    }
    const dates = flattenWindows(
      cyc && (format === "r40r12" ? cyc.r40Windows : cyc.r36Windows),
      cyc && (format === "r40r12" ? cyc.r40Start : cyc.r36Start) && (format === "r40r12" ? cyc.r40Start.year : cyc.r36Start.year) || W - 3
    );
    const fixtures = [];
    for (let idx = 0; idx < seq.length; idx++) {
      const opp = seq[idx], hm = isHome[idx];
      const md = dates[idx] || { y: W - 3, m: 9, d: 8 };
      fixtures.push({
        type: "intl", stage: "r36", comp: compName + " R" + (idx + 1), year: md.y, month: md.m, day: md.d, played: false, result: null,
        match: hm
          ? { home: { id: "nat_中国", name: "中国", strength: nationStrength("中国") }, away: { id: "nat_" + opp, name: opp, strength: nationStrength(opp) } }
          : { home: { id: "nat_" + opp, name: opp, strength: nationStrength(opp) }, away: { id: "nat_中国", name: "中国", strength: nationStrength("中国") } },
      });
    }
    d.intl.wcq = {
      worldCupYear: W, stage: "r36", format,
      r1Name: compName,
      r2Name: format === "r40r12" ? "世预赛12强赛" : "世预赛18强赛",
      group: ["中国"].concat(opps), opps,
      table: ["中国"].concat(opps).map(t => ({ name: t, strength: nationStrength(t), p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 })),
      fixtures, results: [],
    };
    return d.intl.wcq;
  }

  // ── 第二阶段初始化（2018/2022=12 强赛 2 组×6 真实分组；2026/2030=18 强赛 3 组×6）──
  function initR18(state) {
    const d = state.data;
    const q = d.intl.wcq;
    const W = q.worldCupYear || 2030;
    const cyc = (ND().wcqCycles || {})[W] || null;
    const format = q.format === "r40r12" ? "r40r12" : "r36r18";
    const r2Name = q.r2Name || (format === "r40r12" ? "世预赛12强赛" : "世预赛18强赛");
    let windowsArr, startYear, uniq, sideGroups;

    if (format === "r40r12") {
      /* 12 强赛（2 组 × 6 队双循环 10 轮）：每组前 2 直通世界杯（4 席）；两个第三打亚洲附加赛（胜者再跨洲附加赛=0.5 席）。
         中国组用真实分组：2018=A 组（伊朗/韩国/乌兹别克/卡塔尔/叙利亚）、2022=B 组（日本/澳大利亚/沙特/阿曼/越南）。
         本实现展开中国组，另一组在 settleR18 中 quickSim。 */
      uniq = ((cyc && cyc.r12Group) || ["伊朗", "韩国", "乌兹别克斯坦", "卡塔尔", "叙利亚"]).slice();
      while (uniq.length < 5) uniq.push("泰国");
      // 旁组：剩余亚洲强队组一组（仅 quickSim 出线判定）
      const poolAll = ["澳大利亚", "沙特阿拉伯", "日本", "韩国", "伊朗", "乌兹别克斯坦", "阿联酋", "伊拉克", "约旦", "阿曼", "巴林", "朝鲜"];
      sideGroups = [];
      const rest = poolAll.filter(t => uniq.indexOf(t) < 0);
      for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(R.next() * (i + 1)); const t = rest[i]; rest[i] = rest[j]; rest[j] = t; }
      sideGroups.push(rest.slice(0, 6));
      windowsArr = cyc && cyc.r12Windows;
      startYear = cyc && cyc.r12Start && cyc.r12Start.year || W - 2;
    } else {
      /* 18 强赛（3 组 × 6 队）：每组前 2 直通（6 席）；每组 3、4 名共 6 队进第四阶段（2 组 × 3 队，第 1 出线，2 席）→ 亚洲 8 席。 */
      const pot1 = ["日本", "韩国", "伊朗"];
      const pot2 = ["澳大利亚", "沙特阿拉伯", "卡塔尔", "乌兹别克斯坦", "伊拉克"];
      const mid = ["约旦", "阿曼", "阿联酋", "巴林", "越南"];
      const low = ["泰国", "朝鲜", "印度尼西亚", "科威特", "巴勒斯坦", "塔吉克斯坦"];
      const opps = [R.pick(pot1), R.pick(pot2), R.pick(mid), R.pick(mid), R.pick(low)];
      uniq = [];
      opps.forEach(o => { if (uniq.indexOf(o) < 0) uniq.push(o); });
      while (uniq.length < 5) { const c = R.pick(low.concat(mid)); if (uniq.indexOf(c) < 0) uniq.push(c); }
      const poolAll = pot1.concat(pot2, mid, low, ["吉尔吉斯斯坦", "叙利亚", "印度", "马来西亚", "新加坡"]);
      const rest = [];
      poolAll.forEach(t => { if (t !== "中国" && uniq.indexOf(t) < 0 && rest.indexOf(t) < 0) rest.push(t); });
      while (rest.length < 12) { const c = R.pick(poolAll); if (c !== "中国" && uniq.indexOf(c) < 0 && rest.indexOf(c) < 0) rest.push(c); }
      for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(R.next() * (i + 1)); const t = rest[i]; rest[i] = rest[j]; rest[j] = t; }
      sideGroups = [rest.slice(0, 6), rest.slice(6, 12)];
      windowsArr = cyc && cyc.r18Windows;
      startYear = cyc && cyc.r18Start && cyc.r18Start.year || W - 2;
    }

    q.r18Groups = sideGroups;
    const group = ["中国"].concat(uniq);
    // 双循环 10 轮（主客交替简化）
    const seq = uniq.concat(uniq.slice().reverse());
    const isHome = [];
    for (let i = 0; i < 10; i++) isHome.push(i % 2 === 0);
    const dates = flattenWindows(windowsArr, startYear);
    const fixtures = [];
    for (let idx = 0; idx < seq.length; idx++) {
      const opp = seq[idx], hm = isHome[idx];
      const md = dates[idx] || { y: W - 2, m: 6, d: 8 };
      fixtures.push({
        type: "intl", stage: "r18", comp: r2Name + " R" + (idx + 1), year: md.y, month: md.m, day: md.d, played: false, result: null,
        match: hm
          ? { home: { id: "nat_中国", name: "中国", strength: nationStrength("中国") }, away: { id: "nat_" + opp, name: opp, strength: nationStrength(opp) } }
          : { home: { id: "nat_" + opp, name: opp, strength: nationStrength(opp) }, away: { id: "nat_中国", name: "中国", strength: nationStrength("中国") } },
      });
    }
    q.stage = "r18";
    q.r18Group = group;
    q.r18Table = group.map(t => ({ name: t, strength: nationStrength(t), p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }));
    q.fixtures = q.fixtures.concat(fixtures);
    d.intl.shooters = d.intl.shooters || {};
    d.intl.shooters[r2Name] = [];
    return q;
  }

  // ── 第四阶段（W-1 的 9-10 月）：6 队分 2 组 × 3 队，每组第 1 出线（亚洲第 7、8 席）──
  function initPlayoff(state) {
    const d = state.data;
    const q = d.intl.wcq;
    const W = q.worldCupYear || 2030;

    if (q.format === "r40r12") {
      /* 12 强赛附加赛（现实）：两个小组第三打亚洲附加赛（双循环 2 场），胜者进跨洲附加赛（1 场）。
         跨洲附加赛对手在前两场打完后由 settlePlayoff 生成（stage 同为 "playoff"，钩子自动接力）。 */
      const pool = (q.playoffTeams || []).filter(t => t !== "中国");
      const fallback = ["阿联酋", "约旦", "阿曼", "伊拉克", "巴林"];
      while (pool.length < 1) { const c = R.pick(fallback); if (pool.indexOf(c) < 0) pool.push(c); }
      const opp = pool[0];
      q.playoffGroup = ["中国", opp];
      q.playoffSide = [];
      q.playoffAgg = null;
      const fixtures = [
        { type: "intl", stage: "playoff", comp: "世预赛亚洲附加赛 R1", year: W - 1, month: 9, day: 5, played: false, result: null,
          match: { home: { id: "nat_中国", name: "中国", strength: nationStrength("中国") }, away: { id: "nat_" + opp, name: opp, strength: nationStrength(opp) } } },
        { type: "intl", stage: "playoff", comp: "世预赛亚洲附加赛 R2", year: W - 1, month: 9, day: 12, played: false, result: null,
          match: { home: { id: "nat_" + opp, name: opp, strength: nationStrength(opp) }, away: { id: "nat_中国", name: "中国", strength: nationStrength("中国") } } },
      ];
      q.stage = "playoff";
      q.fixtures = q.fixtures.concat(fixtures);
      d.intl.shooters = d.intl.shooters || {};
      d.intl.shooters["世预赛附加赛"] = [];
      return fixtures;
    }

    /* 现实赛制（18 强周期）：3 个组的第 3、4 名共 6 队，分 2 组 × 3 队单循环，每组第 1 直通世界杯。
       本实现展开中国所在组（中国 + 2 队），另一组在 settlePlayoff 中 quickSim。 */
    const pool = (q.playoffTeams || []).filter(t => t !== "中国");
    const fallback = ["约旦", "阿曼", "阿联酋", "巴林", "越南", "泰国"];
    while (pool.length < 5) { const c = R.pick(fallback); if (pool.indexOf(c) < 0) pool.push(c); }
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(R.next() * (i + 1)); const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
    const peers = pool.slice(0, 2);
    q.playoffGroup = ["中国"].concat(peers);
    q.playoffSide = pool.slice(2, 5);
    const fixtures = [
      { type: "intl", stage: "playoff", comp: "世预赛第四阶段 R1", year: W - 1, month: 9, day: 10, played: false, result: null,
        match: { home: { id: "nat_中国", name: "中国", strength: nationStrength("中国") }, away: { id: "nat_" + peers[0], name: peers[0], strength: nationStrength(peers[0]) } } },
      { type: "intl", stage: "playoff", comp: "世预赛第四阶段 R2", year: W - 1, month: 10, day: 12, played: false, result: null,
        match: { home: { id: "nat_" + peers[1], name: peers[1], strength: nationStrength(peers[1]) }, away: { id: "nat_中国", name: "中国", strength: nationStrength("中国") } } },
    ];
    q.stage = "playoff";
    q.fixtures = q.fixtures.concat(fixtures);
    d.intl.shooters = d.intl.shooters || {};
    d.intl.shooters["世预赛第四阶段"] = [];
    return fixtures;
  }

  // ── 世界杯正赛初始化（双赛制：2018/2022 = 32 队 8 组×4 前二出线；2026 起 48 队 12 组×4 前 2+8 最好第三）──
  const WC_GROUPS = "ABCDEFGHIJKL".split("");
  const WC_GROUPS_32 = "ABCDEFGH".split("");
  function wcGroupNames(W) { return (W || 2030) <= 2022 ? WC_GROUPS_32 : WC_GROUPS; }
  const WC_KO_DAYS = { "32强": { m: 6, d: 28, p: 0.2 }, "十六强": { m: 7, d: 3, p: 0.35 }, "八强": { m: 7, d: 9, p: 0.5 }, "半决赛": { m: 7, d: 13, p: 0.65 }, "决赛": { m: 7, d: 19, p: 0.8 } };
  // 32 队制淘汰赛日历（现实 2018 俄罗塞：1/8 决赛 7.3 前 / 决赛 7.15）
  const WC_KO_DAYS_32 = { "十六强": { m: 7, d: 3, p: 0.35 }, "八强": { m: 7, d: 7, p: 0.5 }, "半决赛": { m: 7, d: 11, p: 0.65 }, "决赛": { m: 7, d: 15, p: 0.8 } };
  function wcKoDays(W) { return (W || 2030) <= 2022 ? WC_KO_DAYS_32 : WC_KO_DAYS; }

  /**
   * 世界杯正赛初始化（P48 改造：48 队全场真实抽签，不再是「中国所在一个小组」）
   * ① 资格决定：各洲按 FIFA 积分取额（UEFA16/CAF9/AFC8/CONMEBOL6/CONCACAF6/OFC1 + 跨洲附加赛 2）
   * ② 分档抽签：4 档 ×12，东道主进第 1 档，洲际回避（同洲≤1，UEFA 1~2 队/组）
   * ③ 只把中国所在组展开成 3 场小组赛；其余 11 组在小组赛结束时 quickSim（见 settleWcGroup）
   */
  function initWorldCup(state, wcYear) {
    const d = state.data;
    const W = wcYear || 2030;
    const GN = wcGroupNames(W);           // 2018/2022：8 组；2026 起：12 组
    const FP = window.FifaPoints;
    let groups = null, myGroup = null, pots = [], hosts = [], hostGroups = {}, qualify = null;
    if (FP) {
      try {
        hosts = FP.hostsOf(W);
        hostGroups = FP.hostGroupAssign(hosts, GN.length);
        // 亚洲席 = 世预赛实际出线队（12 强/第四阶段或 18 强/第四阶段）；中国已出线故必在其中。
        // 出线事实必须覆盖静态积分排名——按初始积分中国仅列亚洲第 12。
        const asian = (d.intl.wcq && d.intl.wcq.qualifiedTeams) || ["中国"];
        const forced = asian.indexOf("中国") < 0 ? asian.concat(["中国"]) : asian;
        qualify = FP.qualifyWorldCup(state, hosts, forced, GN.length, W);
        const dr = FP.drawGroups(state, {
          teams: qualify.teams, groupNames: GN, hosts, hostGroups,
          rng: () => R.next(), tries: 400, uefaMin: true,
        });
        if (dr.groups) {
          groups = dr.groups; pots = dr.pots;
          myGroup = GN.filter(g => groups[g].indexOf("中国") >= 0)[0] || null;
        }
      } catch (err) { console.warn("世界杯抽签失败，回落简化分组：", err); }
    }
    /* 兜底：抽签不可用时退回「1 强 + 2 中游」的简化组（保证赛事仍可玩） */
    let groupTeams;
    if (groups && myGroup) {
      groupTeams = groups[myGroup].slice();
    } else {
      const top = ["法国", "阿根廷", "西班牙", "英格兰", "巴西"];
      const mid = ["瑞士", "墨西哥", "美国", "加拿大", "厄瓜多尔", "摩洛哥", "塞内加尔", "哥伦比亚", "乌拉圭"];
      const gOpp = [R.pick(top), R.pick(mid), R.pick(mid)];
      const uniq = []; gOpp.forEach(t => { if (uniq.indexOf(t) < 0) uniq.push(t); });
      while (uniq.length < 3) { const t = R.pick(mid); if (uniq.indexOf(t) < 0) uniq.push(t); }
      groupTeams = ["中国"].concat(uniq);
      groups = null; myGroup = "C";
    }
    // 小组赛 3 轮（世界杯年 6 月真实窗口）
    const order = groupTeams.filter(t => t !== "中国");
    const isHome = [false, true, false];
    const daysBase = [{ m: 6, d: 9 }, { m: 6, d: 15 }, { m: 6, d: 21 }];
    /* P81m 防御：组内队数异常（>4）时不再越界崩溃，按 5 天递推补足日历 */
    const days = order.map((_, i) => daysBase[i] || { m: 6, d: 21 + (i - 2) * 5 });
    const fixtures = [];
    order.forEach((opp, i) => {
      const hm = isHome[i];
      fixtures.push({
        type: "intl", stage: "wc-group", comp: "世界杯小组赛 R" + (i + 1), year: W, month: days[i].m, day: days[i].d, played: false, result: null,
        match: hm
          ? { home: { id: "nat_中国", name: "中国", strength: nationStrength("中国") }, away: { id: "nat_" + opp, name: opp, strength: nationStrength(opp) } }
          : { home: { id: "nat_" + opp, name: opp, strength: nationStrength(opp) }, away: { id: "nat_中国", name: "中国", strength: nationStrength("中国") } },
      });
    });
    d.intl.worldCup = {
      year: W, stage: "group",
      teams32: W <= 2022, // 32 队制（2018/2022）：8 组前二 → 十六强起步
      groups, myGroup, group: groupTeams,
      pots, hosts, hostGroups, qualify,
      table: groupTeams.map(t => ({ name: t, strength: nationStrength(t), p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 })),
      fixtures, koDays: wcKoDays(W), results: [], round: 0, alive: [],
    };
    d.intl.wcStats = { goals: 0, ratingSum: 0, apps: 0 };
    d.intl.shooters = d.intl.shooters || {};
    d.intl.shooters["世界杯"] = [];
    return d.intl.worldCup;
  }

  // 世界杯 fixture 查询（保留兼容）
  function wcFixtureForDate(state, month, day) {
    const wc = state.data.intl.worldCup;
    if (!wc) return null;
    return wc.fixtures.find(f => !f.played && f.month === month && f.day === day) || null;
  }
  function asiaCupFixtureForDate(state, month, day) {
    const d = state.data;
    const cup = d.intl.asiaCup;
    if (!cup) return null;
    return cup.fixtures.find(f => !f.played && f.month === month && f.day === day) || null;
  }
  function wcqFixtureForDate(state, year, month, day) {
    const d = state.data;
    const q = d.intl.wcq;
    if (!q || !q.fixtures) return null;
    return q.fixtures.find(f => !f.played && f.year === year && f.month === month && f.day === day) || null;
  }

  /* ★ P141 国家队战绩突破挂账（ NationDev 缺失/异常绝不影响赛事流程） */
  function mile(state, key) {
    try { if (window.NationDev && NationDev.onIntlMilestone) NationDev.onIntlMilestone(state, key); } catch (e) { /* ignore */ }
  }
  /* 淘汰赛出局 → 最终名次档（fixture.comp 含阶段词；决赛出局=亚军） */
  function mileByStage(state, comp, map) {
    const s = String(comp || "");
    for (const k of Object.keys(map)) if (s.indexOf(k) >= 0) { mile(state, map[k]); return; }
  }
  const AC_STAGE_KEY = { "十六强": "ac_r16", "八强": "ac_qf", "半决赛": "ac_sf", "决赛": "ac_ru" };
  const WC_STAGE_KEY = { "十六强": "wc_r16", "八强": "wc_qf", "半决赛": "wc_sf", "决赛": "wc_ru" };

  /**
   * P48：把一场国家队比赛结果写进 FIFA 积分（规格 §2.6.4）
   * 重要性系数：世预赛 25 / 洲际决赛圈 ≤1/8 35、≥1/4 40 / 世界杯 ≤1/8 50、≥1/4 60
   * 淘汰赛 (W−We) < 0 不掉分（由 matchDelta 内部处理）
   */
  function applyFifaPoints(state, fixture, myGoals, oppGoals) {
    if (!window.FifaPoints || !fixture || !fixture.match) return null;
    const home = fixture.match.home, away = fixture.match.away;
    if (!home || !away || !home.name || !away.name) return null;
    const iAmHome = home.id === "nat_中国";
    let r = myGoals > oppGoals ? "win" : (myGoals < oppGoals ? "loss" : "draw");
    if (!iAmHome) r = r === "win" ? "loss" : (r === "loss" ? "win" : "draw");
    const label = fixture.comp || "";
    let importance = 25;
    if (label.indexOf("世界杯") >= 0) importance = fixture.cupKO ? (/八强|半决赛|决赛/.test(label) ? 60 : 50) : 50;
    else if (label.indexOf("亚洲杯") >= 0) importance = fixture.cupKO ? (/八强|半决赛|决赛/.test(label) ? 40 : 35) : 35;
    /* ★ P141：友谊赛入积分（真实 FIFA 规则：国际比赛日窗口内 I=10；本游戏友谊赛恒在窗口内） */
    else if (label.indexOf("友谊赛") >= 0) importance = 10;
    try {
      return window.FifaPoints.applyMatch(state, home.name, away.name, { result: r, importance, knockout: !!fixture.cupKO });
    } catch (err) { return null; }
  }

  /* ── 通用小组模拟（旁组/低级别阶段用；真实强度驱动 quickScore） ──
     ★ P141：每场模拟结果同步入 FIFA 积分（真实 FIFA 排名由所有国家的比赛结果驱动，
     只记中国队的比赛 → 排名不真实）。applyMatch 纯算术零 R，随机流不受影响。 */

  /** 单场模拟结果入积分（try-catch：积分失败绝不影响赛事模拟） */
  function simMatchPts(state, a, b, ga, gb) {
    try {
      if (window.FifaPoints && a && b && a !== b) {
        FifaPoints.applyMatch(state, a, b, { result: ga > gb ? "win" : ga < gb ? "loss" : "draw", importance: 25 });
      }
    } catch (e) { /* ignore */ }
  }

  /** 单组 N 队单循环 quickSim → 排序后的积分行 */
  function simGroupSingle(state, teams) {
    if (!teams || !teams.length) return [];
    const rows = teams.map(t => ({ name: t, strength: nationStrength(t), p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }));
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const sc = quickScore(rows[i].strength, rows[j].strength);
        rows[i].p++; rows[j].p++;
        rows[i].gf += sc[0]; rows[i].ga += sc[1];
        rows[j].gf += sc[1]; rows[j].ga += sc[0];
        if (sc[0] > sc[1]) { rows[i].w++; rows[i].pts += 3; rows[j].l++; }
        else if (sc[0] < sc[1]) { rows[j].w++; rows[j].pts += 3; rows[i].l++; }
        else { rows[i].d++; rows[j].d++; rows[i].pts++; rows[j].pts++; }
        simMatchPts(state, rows[i].name, rows[j].name, sc[0], sc[1]);
      }
    }
    return sortRows(rows);
  }

  /** 单组 N 队双循环 quickSim（18 强赛旁组口径） */
  function simGroupDouble(state, teams) {
    if (!teams || !teams.length) return [];
    const rows = teams.map(t => ({ name: t, strength: nationStrength(t), p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }));
    for (let i = 0; i < rows.length; i++) {
      for (let j = 0; j < rows.length; j++) {
        if (i === j) continue;
        const sc = quickScore(rows[i].strength, rows[j].strength);
        rows[i].p++;
        rows[i].gf += sc[0]; rows[i].ga += sc[1];
        if (sc[0] > sc[1]) { rows[i].w++; rows[i].pts += 3; }
        else if (sc[0] < sc[1]) { rows[i].l++; }
        else { rows[i].d++; rows[i].pts++; }
        /* 双循环 j<i 时是回程（同一对阵的次回合）——只入 i<j 的正向场次防双记 */
        if (i < j) simMatchPts(state, rows[i].name, rows[j].name, sc[0], sc[1]);
      }
    }
    return sortRows(rows);
  }

  /* ── 小组排名排序（积分 → 净胜球 → 进球） ── */
  function sortRows(rows) {
    rows.sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf);
    return rows;
  }

  /** 单组 4 队单循环 quickSim（返回排序后的行） */
  function simGroupQuick(state, gname) {
    const wc = state.data.intl.worldCup;
    const teams = (wc.groups && wc.groups[gname]) || [];
    const rows = teams.map(t => ({ name: t, strength: nationStrength(t), p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }));
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const sc = quickScore(rows[i].strength, rows[j].strength);
        rows[i].p++; rows[j].p++;
        rows[i].gf += sc[0]; rows[i].ga += sc[1];
        rows[j].gf += sc[1]; rows[j].ga += sc[0];
        if (sc[0] > sc[1]) { rows[i].w++; rows[i].pts += 3; rows[j].l++; }
        else if (sc[0] < sc[1]) { rows[j].w++; rows[j].pts += 3; rows[i].l++; }
        else { rows[i].d++; rows[j].d++; rows[i].pts++; rows[j].pts++; }
        simMatchPts(state, rows[i].name, rows[j].name, sc[0], sc[1]);
      }
    }
    return sortRows(rows);
  }

  /**
   * 小组赛结束 → 12 组排名 + 32 强（前 2 直通 24 队 + 8 个最佳第三）
   * @returns {{qualified:boolean, rank:number, viaThird?:boolean, all32?:string[]}}
   */
  function settleWcGroup(state) {
    const d = state.data;
    const wc = d.intl.worldCup;
    // ① 中国组其余两队补赛（简化：每队补满 3 场）
    wc.table.forEach(r => {
      if (r.name === "中国") return;
      const str = nationStrength(r.name);
      while (r.p < 3) {
        // P0-4：世界杯小组填充同改 quickScore
        const oppStr = Math.max(45, str + R.int(-8, 8));
        const sc = quickScore(str, oppStr);
        const gf = sc[0], ga = sc[1];
        r.p++; r.gf += gf; r.ga += ga;
        if (gf > ga) { r.w++; r.pts += 3; } else if (gf < ga) r.l++; else { r.d++; r.pts++; }
      }
    });
    sortRows(wc.table);
    const rank = wc.table.findIndex(r => r.name === "中国") + 1;
    wc.groupRank = rank;
    const me = wc.table.find(r => r.name === "中国") || wc.table[2];

    /* 兜底路径：未取到 48 队全场数据时，按排名做简化判定 */
    if (!wc.groups) {
      if (rank <= 2) return { qualified: true, rank };
      if (me.pts >= 4) return { qualified: true, rank, viaThird: true };
      if (me.pts === 3 && (me.gf - me.ga) >= 0) return { qualified: R.chance(0.5), rank, viaThird: true };
      return { qualified: false, rank };
    }

    // ② 全组汇总：中国组用真实结果，其余组 quickSim（32 队制 8 组 / 48 队制 12 组）
    const GN = wcGroupNames(wc.year);
    const table = {};
    GN.forEach(g => {
      if (g === wc.myGroup) { table[g] = wc.table; return; }
      table[g] = simGroupQuick(state, g);
    });
    GN.forEach(g => {
      table[g].forEach((r, i) => { r.group = g; r.rank = i + 1; });
    });
    wc.allTables = table;

    if (wc.teams32) {
      // 32 队制（2018/2022）：每组前 2 直通十六强，无最佳第三
      const direct = [];
      GN.forEach(g => { direct.push(table[g][0], table[g][1]); });
      wc.all32 = direct.map(r => ({ name: r.name, group: r.group, rank: r.rank, pts: r.pts, gd: r.gf - r.ga }));
      wc.alive = direct.map(r => r.name).filter(n => n !== "中国");
      if (rank > 2) return { qualified: false, rank, all32: wc.all32.map(r => r.name) };
      return { qualified: true, rank, viaThird: false, all32: wc.all32.map(r => r.name) };
    }

    // ③ 48 队制（2026 起）：前 2 直通 + 8 个最佳第三（现实 2026 赛制）
    const direct = [], thirds = [];
    GN.forEach(g => { direct.push(table[g][0], table[g][1]); thirds.push(table[g][2]); });
    sortRows(thirds);
    const all32 = direct.concat(thirds.slice(0, 8));
    wc.all32 = all32.map(r => ({ name: r.name, group: r.group, rank: r.rank, pts: r.pts, gd: r.gf - r.ga }));
    wc.alive = all32.map(r => r.name).filter(n => n !== "中国");

    const in32 = rank <= 2 || thirds.slice(0, 8).some(r => r.name === "中国");
    if (!in32) return { qualified: false, rank, all32: wc.all32.map(r => r.name) };
    return { qualified: true, rank, viaThird: rank > 2, all32: wc.all32.map(r => r.name) };
  }

  /**
   * 32 强对手：按「档次对位」从其他组的出线队中选
   * （FIFA 官方 32 强对阵表依赖 8 个最佳第三的具体组合，逐格复刻性价比低；
   *   此处用档次对位替代：小组第 1 → 挑别组第 2；小组第 2/3 → 挑别组第 1，难度随排名递增）
   */
  function pickR32Opp(state) {
    const wc = state.data.intl.worldCup;
    const myRank = wc.groupRank || 2;
    const pool = (wc.all32 || []).filter(r => r.name !== "中国" && r.group !== wc.myGroup);
    if (!pool.length) return R.pick(["瑞士", "墨西哥", "美国", "加拿大", "厄瓜多尔"]);
    const want = myRank === 1 ? 2 : 1;
    const cands = pool.filter(r => r.rank === want);
    return R.pick(cands.length ? cands : pool).name;
  }

  /** 淘汰赛每轮：存活池两两配对，强度高者晋级概率大 */
  function simKoRound(state) {
    const wc = state.data.intl.worldCup;
    const list = (wc.alive || []).slice();
    for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(R.next() * (i + 1)); const t = list[i]; list[i] = list[j]; list[j] = t; }
    const next = [];
    for (let i = 0; i < list.length; i += 2) {
      const a = list[i], b = list[i + 1];
      if (!b) { next.push(a); continue; }
      const sa = nationStrength(a), sb = nationStrength(b);
      next.push(R.chance(sa / (sa + sb)) ? a : b);
    }
    wc.alive = next;
  }

  /** 下一轮对手：从存活池强度靠前的一半里随机取（轮次越后池子越强） */
  function pickKoOpp(state) {
    const wc = state.data.intl.worldCup;
    const pool = (wc.alive || []).slice().sort((a, b) => nationStrength(b) - nationStrength(a));
    if (!pool.length) return R.pick(["法国", "阿根廷", "西班牙", "英格兰", "巴西"]);
    const n = Math.max(1, Math.ceil(pool.length / 2));
    return R.pick(pool.slice(0, n));
  }

  // 世界杯淘汰赛推进（R32 → 决赛）
  const WC_KO_NEXT = { "32强": ["十六强", "r16"], "十六强": ["八强", "qf"], "八强": ["半决赛", "sf"], "半决赛": ["决赛", "final"] };
  function advanceWcKO(state, fixture, result, pens) {
    const d = state.data;
    const wc = d.intl.worldCup;
    const userIsHome = fixture.match.home.id === "nat_中国";
    const myGoals = userIsHome ? result.home : result.away;
    const oppGoals = userIsHome ? result.away : result.home;
    const oppName = userIsHome ? fixture.match.away.name : fixture.match.home.name;
    const won = myGoals > oppGoals || (myGoals === oppGoals && pens && pens.won);
    wc.results.push({ round: fixture.comp, opp: oppName, myGoals, oppGoals, won: !!won, pens: pens ? pens.my + "-" + pens.opp : null });
    if (!won) { mileByStage(state, fixture.comp, WC_STAGE_KEY); wc.stage = "done"; wc.nextKO = null; return { out: true, stage: fixture.comp }; }
    let label = null, key = null;
    for (const k of Object.keys(WC_KO_NEXT)) {
      if (fixture.comp.indexOf(k) >= 0) { label = WC_KO_NEXT[k][0]; key = WC_KO_NEXT[k][1]; break; }
    }
    if (!label) { mile(state, "wc_ch"); wc.stage = "champion"; wc.nextKO = null; return { champion: true }; }
    // P48：从存活池推进——移除刚击败的对手，模拟本轮其他比赛，再从剩余强队里取下一个对手
    const idx = (wc.alive || []).indexOf(oppName);
    if (idx >= 0) wc.alive.splice(idx, 1);
    simKoRound(state);
    let oppName2 = pickKoOpp(state);
    // 防重：仅避开已经交手过的**淘汰赛**对手（小组赛同组对手在 16 强及以后相遇是允许的）
    const used = wc.results.filter(r => (r.round || "").indexOf("小组赛") < 0).map(r => r.opp);
    if (used.indexOf(oppName2) >= 0) {
      const alt = (wc.alive || []).filter(p => used.indexOf(p) < 0);
      if (alt.length) oppName2 = R.pick(alt);
    }
    const opp = { id: "nat_" + oppName2, name: oppName2, strength: nationStrength(oppName2) };
    const me = { id: "nat_中国", name: "中国", strength: nationStrength("中国") };
    const kd = wc.koDays[label];
    wc.stage = key;
    wc.nextKO = { stage: label, fixture: { type: "intl", comp: "世界杯" + label, year: wc.year, month: kd.m, day: kd.d, played: false, result: null, cupKO: true, pressure: kd.p, match: R.chance(0.5) ? { home: me, away: opp } : { home: opp, away: me } } };
    return { won: true, next: label, opp: oppName2 };
  }

  // 世界杯结算（冠军/金靴/MVP/荣誉，届次动态命名）
  function settleWorldCup(state) {
    const d = state.data;
    const wc = d.intl.worldCup;
    if (!wc || wc.settled) return { awards: [], stats: d.intl.wcStats || { goals: 0, ratingSum: 0, apps: 0 } };
    wc.settled = true;
    const W = wc.year || 2030;
    const stats = d.intl.wcStats || { goals: 0, ratingSum: 0, apps: 0 };
    const awards = [];
    // 参赛荣誉（小组赛打满即算）
    d.trophies.push({ name: W + "世界杯参赛", icon: "", season: d.season });
    Career.addFame(state, 8000);
    if (wc.stage === "champion") {
      mile(state, "wc_ch");   /* ★ P273 结算端兜底挂账：advanceWcKO 已挂则幂等挡重，漏挂则此处必补 */
      awards.push({ name: "世界杯冠军", icon: "" });
      d.trophies.push({ name: "世界杯冠军", icon: "", season: d.season });
      d.intl.statue = true;
      Career.addFame(state, 30000);
    }
    /* ★★ P285c（兄弟质疑「冠军是谁都不知道」）：玩家参赛届的冠军播报——正赛收口时
       本届冠军必须有名有姓（玩家夺冠=我们自己；否则确定性取模强队池，零 R 消耗）。 */
    try {
      const P8 = ["法国", "巴西", "德国", "阿根廷", "西班牙", "英格兰", "葡萄牙", "荷兰"];
      const sc = seededChampionOf(P8, W, 0);
      if (window.News) {
        if (wc.stage === "champion") {
          News.onEvent(state, "intl_champion", { player: d.player.name, comp: W + "世界杯", team: "中国队" });
        } else {
          News.onEvent(state, "npc_wc_champion", { year: W, champion: sc.champion, runnerup: sc.runnerUp, player: d.player.name });
        }
      }
      /* ★ P295：荣誉榜落账（玩家参赛届——世界杯） */
      pushHonor(state, "worldcup", W, wc.stage === "champion" ? "中国" : sc.champion, sc.runnerUp,
        wc.stage === "champion" ? "冠军" : (wc.groupResult && wc.groupResult.qualified === false ? "小组出局" : "淘汰赛"));
    } catch (eN) { /* 播报失败不影响结算 */ }
    if (stats.goals >= 5 && R.chance(0.55)) { awards.push({ name: "世界杯金靴", icon: "" }); d.trophies.push({ name: "世界杯金靴", icon: "", season: d.season }); Career.addFame(state, 12000); }
    if (stats.apps >= 5 && stats.ratingSum / Math.max(1, stats.apps) >= 7.9) { awards.push({ name: "世界杯MVP", icon: "" }); d.trophies.push({ name: "世界杯MVP", icon: "", season: d.season }); Career.addFame(state, 15000); }
    /* P133 门将专属荣誉：世界杯金手套（现实对标雅辛奖；GK 场均≥7.5 且主打出 5 场 + 0.5 掷骰） */
    if (d.player && d.player.position === "GK" && stats.apps >= 5 && stats.ratingSum / Math.max(1, stats.apps) >= 7.5 && R.chance(0.5)) { awards.push({ name: "世界杯金手套", icon: "" }); d.trophies.push({ name: "世界杯金手套", icon: "", season: d.season }); Career.addFame(state, 12000); }
    wc.stage = "done";
    return { awards, stats };
  }

  // ── 比分快速模拟（其他队/其他组）──
  function quickScore(sa, sb) {
    const xa = Math.max(0.25, 1.3 + (sa - sb) * 0.055);
    const xb = Math.max(0.25, 1.3 - (sa - sb) * 0.055);
    const g = x => (R.chance(x % 1) ? Math.floor(x) + 1 : Math.floor(x));
    return [g(xa), g(xb)];
  }

  // 用户比赛结果写入 → 更新小组榜 / 推进赛事
  function applyResult(state, fixture, result) {
    const d = state.data;
    fixture.played = true;
    fixture.result = result;
    const myId = "nat_中国";
    const userIsHome = fixture.match.home.id === myId || (fixture.match.home.id || "").indexOf("intl_me") === 0;
    const myGoals = userIsHome ? result.home : result.away;
    const oppGoals = userIsHome ? result.away : result.home;
    const oppName = userIsHome ? fixture.match.away.name : fixture.match.home.name;
    if (fixture.comp.indexOf("友谊赛") >= 0) {
      recordPlayerGoals(d, "国际友谊赛", result.userGoals || 0);
      recordShooters(d, "国际友谊赛", oppName, oppGoals);
      d.intl.friendlyResults.push({ year: fixture.year, opp: oppName, myGoals, oppGoals, win: myGoals > oppGoals });
      if (d.intl.friendlyResults.length > 60) d.intl.friendlyResults.shift();
      /* ★ P141：友谊赛结果入 FIFA 积分（此前缺席 → 排名对友谊赛无感，不真实） */
      applyFifaPoints(state, fixture, myGoals, oppGoals);
    } else if (fixture.comp.indexOf("东亚杯") >= 0 || fixture.comp.indexOf("奥运会") >= 0) {
      /* ★★ P295：东亚杯 / 奥运会 U23 —— 记射手/个人数据 + FIFA 积分 + 推进（小组榜/淘汰赛/荣誉） */
      recordPlayerGoals(d, fixture.comp.indexOf("奥运会") >= 0 ? "奥运会" : "东亚杯", result.userGoals || 0);
      recordShooters(d, fixture.comp.indexOf("奥运会") >= 0 ? "奥运会" : "东亚杯", oppName, oppGoals);
      applyFifaPoints(state, fixture, myGoals, oppGoals);
      miniAfterResult(state, fixture, result, myGoals, oppGoals, oppName);
    } else if (fixture.comp.indexOf("亚洲杯") >= 0) {
      const cup = d.intl.asiaCup;
      recordPlayerGoals(d, "亚洲杯", result.userGoals || 0);
      applyFifaPoints(state, fixture, myGoals, oppGoals);   // P48：洲际赛积分入账
      // 仅小组赛更新积分榜（KO 对手来自其他组，不在 C 组表中）
      if (fixture.comp.indexOf("小组赛") >= 0) {
        // P47：届次参数化后中国的组不再是固定的 C 组（2031 起为动态抽签结果）
        const grp = cup.myGroup || "C";
        const rowC = cup.table[grp].find(r => r.name === "中国");
        const rowO = cup.table[grp].find(r => r.name === oppName);
        rowC.p++; rowO.p++;
        rowC.gf += myGoals; rowC.ga += oppGoals;
        rowO.gf += oppGoals; rowO.ga += myGoals;
        if (myGoals > oppGoals) { rowC.w++; rowC.pts += 3; rowO.l++; }
        else if (myGoals < oppGoals) { rowO.w++; rowO.pts += 3; rowC.l++; }
        else { rowC.d++; rowO.d++; rowC.pts++; rowO.pts++; }
        // 同组其他队该轮 quickSim（简化：另外两队互打）
        const others = cup.table[grp].filter(r => r.name !== "中国" && r.name !== oppName);
        if (others.length === 2) {
          const [g1, g2] = quickScore(others[0].strength, others[1].strength);
          others[0].p++; others[1].p++; others[0].gf += g1; others[0].ga += g2; others[1].gf += g2; others[1].ga += g1;
          if (g1 > g2) { others[0].w++; others[0].pts += 3; others[1].l++; }
          else if (g1 < g2) { others[1].w++; others[1].pts += 3; others[0].l++; }
          else { others[0].d++; others[1].d++; others[0].pts++; others[1].pts++; }
          cup.round++;
        }
      }
      recordShooters(d, "亚洲杯", oppName, oppGoals); // 对手进球全额计入对手射手榜（此前误减我方进球）
      if (fixture.comp.indexOf("小组赛") >= 0) cup.results.push({ round: fixture.comp, opp: oppName, myGoals, oppGoals }); // KO 场次由 advanceKO 记（防双记）
    } else if (fixture.comp.indexOf("世界杯") >= 0) {
      const wc = d.intl.worldCup;
      recordPlayerGoals(d, "世界杯", result.userGoals || 0);
      recordShooters(d, "世界杯", oppName, oppGoals);
      applyFifaPoints(state, fixture, myGoals, oppGoals);   // P48：世界杯积分入账（小组赛 50 / 1/4 起 60）
      if (fixture.stage === "wc-group") {
        const rowC = wc.table.find(r => r.name === "中国");
        const rowO = wc.table.find(r => r.name === oppName);
        if (rowC && rowO) {
          rowC.p++; rowO.p++;
          rowC.gf += myGoals; rowC.ga += oppGoals;
          rowO.gf += oppGoals; rowO.ga += myGoals;
          if (myGoals > oppGoals) { rowC.w++; rowC.pts += 3; rowO.l++; }
          else if (myGoals < oppGoals) { rowO.w++; rowO.pts += 3; rowC.l++; }
          else { rowC.d++; rowO.d++; rowC.pts++; rowO.pts++; }
        }
      }
      if (fixture.stage === "wc-group") wc.results.push({ round: fixture.comp, opp: oppName, myGoals, oppGoals }); // KO 场次由 advanceWcKO 记（防双记）
      if (fixture.stage === "wc-group" && wc.fixtures.every(f => f.played)) {
        const g = settleWcGroup(state);
        wc.groupResult = g;
        if (g.qualified) {
          mile(state, "wc_group");   // ★ P141 世界杯小组出线 → 战绩突破挂账
          // 首轮淘汰赛对手：从出线池按档次对位选（P48；32 队制=十六强，48 队制=32 强）
          const oppName2 = pickR32Opp(state);
          const opp = { id: "nat_" + oppName2, name: oppName2, strength: nationStrength(oppName2) };
          const me = { id: "nat_中国", name: "中国", strength: nationStrength("中国") };
          if (wc.teams32) {
            const kd = wc.koDays["十六强"];
            wc.stage = "r16";
            wc.nextKO = { stage: "十六强", fixture: { type: "intl", comp: "世界杯十六强", year: wc.year, month: kd.m, day: kd.d, played: false, result: null, cupKO: true, pressure: kd.p, match: R.chance(0.5) ? { home: me, away: opp } : { home: opp, away: me } } };
          } else {
            const kd = wc.koDays["32强"];
            wc.stage = "r32";
            wc.nextKO = { stage: "32强", fixture: { type: "intl", comp: "世界杯32强淘汰赛", year: wc.year, month: kd.m, day: kd.d, played: false, result: null, cupKO: true, pressure: kd.p, match: R.chance(0.5) ? { home: me, away: opp } : { home: opp, away: me } } };
          }
        } else {
          wc.stage = "group-out";
        }
      }
    } else if (fixture.comp.indexOf("世预赛") >= 0) {
      const q = d.intl.wcq;
      applyFifaPoints(state, fixture, myGoals, oppGoals);   // P48：世预赛积分入账（I=25）
      const compName = fixture.comp.indexOf("18强赛") >= 0 ? "世预赛18强赛"
        : (fixture.comp.indexOf("12强赛") >= 0 ? "世预赛12强赛"
        : (fixture.comp.indexOf("40强赛") >= 0 ? "世预赛40强赛"
        : (fixture.comp.indexOf("第四阶段") >= 0 ? "世预赛第四阶段"
        : (fixture.comp.indexOf("附加赛") >= 0 ? "世预赛附加赛" : "世预赛36强赛"))));
      // 射手榜：记录双方进球射手
      recordShooters(d, compName, oppName, oppGoals);
      if (fixture.stage === "playoff") {
        /* 第四阶段（2 组 × 3 队）：积分表在 settlePlayoff 中依 fixtures 重建，此处不重复记账 */
      } else if (fixture.stage === "r18" || q.stage === "r18") {
        const rowC = q.r18Table.find(r => r.name === "中国");
        const rowO = q.r18Table.find(r => r.name === oppName);
        if (rowC && rowO) {
          rowC.p++; rowO.p++;
          rowC.gf += myGoals; rowC.ga += oppGoals;
          rowO.gf += oppGoals; rowO.ga += myGoals;
          if (myGoals > oppGoals) { rowC.w++; rowC.pts += 3; rowO.l++; }
          else if (myGoals < oppGoals) { rowO.w++; rowO.pts += 3; rowC.l++; }
          else { rowC.d++; rowO.d++; rowC.pts++; rowO.pts++; }
        }
      } else {
        const rowC = q.table.find(r => r.name === "中国");
        const rowO = q.table.find(r => r.name === oppName);
        if (rowC && rowO) {
          rowC.p++; rowO.p++;
          rowC.gf += myGoals; rowC.ga += oppGoals;
          rowO.gf += oppGoals; rowO.ga += myGoals;
          if (myGoals > oppGoals) { rowC.w++; rowC.pts += 3; rowO.l++; }
          else if (myGoals < oppGoals) { rowO.w++; rowO.pts += 3; rowC.l++; }
          else { rowC.d++; rowO.d++; rowC.pts++; rowO.pts++; }
        }
      }
      recordPlayerGoals(d, compName, result.userGoals || 0);
      q.results.push({ round: fixture.comp, opp: oppName, myGoals, oppGoals });
    }
  }

  /* ══════════════════════════════════════════════════════════════════════════
     ★★ P295（用户拍板「全做」）：东亚杯 + 奥运会 U23 + 国家队荣誉榜
     ──────────────────────────────────────────────────────────────────────────
     · 东亚杯（E-1 口径）：**奇数年** 7 月，4 队单循环 3 轮（中国+3 支东亚/亚洲队）。
       冠军 = 4 队积分榜第 1（另外 3 场交叉赛果用**届次种子**确定性模拟，零 R 消耗）。
     · 奥运会 U23：**%4==0 年** 7 月小组赛 3 轮（4 队一组）+ 出线后单场淘汰赛
       （八强→半决赛→决赛）。球员 23 岁及以下才可被征召；超龄走 NPC 通道。
     · 荣誉榜：d.intl.honors = [{type, year, champion, runnerUp, china}] ——
       四项大赛（世界杯/亚洲杯/东亚杯/奥运会）每届收口时落账，幂等（type+year 键），
       上限 40 条；hub 国家队页签渲染「历届成绩 + 射手榜 + 生涯数据」。
     · R 纪律：新赛事自身的赛程生成/交叉赛模拟全部用**届次种子 rng**（mulberry32），
       唯一的新增 R 消耗 = 玩家实际出场的比赛（与友谊赛同族，soak 重签覆盖）。
     ══════════════════════════════════════════════════════════════════════════ */

  /** 荣誉榜落账（幂等：type+year 已存在则跳过；上限 40 条丢最旧） */
  function pushHonor(state, type, year, champion, runnerUp, china) {
    const intl = ensureIntl(state);
    if (intl.honors.some(h => h.type === type && h.year === year)) return;
    intl.honors.push({ type, year, champion: champion || "—", runnerUp: runnerUp || "—", china: china || "未参赛" });
    intl.honors.sort((a, b) => b.year - a.year);
    if (intl.honors.length > 40) intl.honors.length = 40;
  }
  /** 确定性冠军（取模强队池，与 NPC 播报同式） */
  function seededChampionOf(pool, year, salt) {
    const ci = (year * 7 + salt) % pool.length;
    const ri = (ci + 1 + (year * 11 + 5 + salt) % (pool.length - 1)) % pool.length;
    return { champion: pool[ci], runnerUp: pool[ri] };
  }
  /** 届次种子 rng（零主 R 消耗） */
  function miniRng(key) {
    return (window.REAL_DATA && REAL_DATA.mulberry32)
      ? REAL_DATA.mulberry32(hashStr(key))
      : (function () { let s = hashStr(key); return function () { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; })();
  }
  /** 从候选里取数据层真实存在的 N 支（保序） */
  function presentTeams(cands, need) {
    const teams = (ND() && ND().teams) || {};
    const out = [];
    for (const c of cands) { if (teams[c] != null && out.length < need) out.push({ name: c, strength: teams[c] }); }
    return out;
  }
  const EAFF_POOL = ["日本", "韩国", "朝鲜", "澳大利亚", "沙特阿拉伯"];
  const EAFF_SEED_CHAMP = ["日本", "韩国", "澳大利亚", "沙特阿拉伯", "伊朗", "卡塔尔"];
  const OLY_POOL = ["巴西", "阿根廷", "德国", "西班牙", "日本", "韩国", "墨西哥", "尼日利亚"];
  const OLY_SEED_CHAMP = ["巴西", "阿根廷", "德国", "西班牙", "法国", "英格兰"];
  /** 中国队名次文案 */
  function rankTextOf(rank, total) {
    if (rank === 1) return "冠军";
    if (rank === 2) return "亚军";
    if (rank === 3) return "季军";
    return "第 " + rank + " 名（共 " + total + " 队）";
  }

  /** 东亚杯/奥运会届次开窗（onDay ⑤b；窗口内幂等） */
  function miniTick(state, year, month, day, today) {
    const d = state.data;
    const intl = ensureIntl(state);
    const p = d.player;
    if (!p) return null;

    /* ── 东亚杯：奇数年，7 月上旬开窗 ── */
    if (year >= 2015 && year % 2 === 1 && month === 7 && day <= 10 && !intl.eaffYears[year]) {
      const opps = presentTeams(EAFF_POOL, 3);
      if (opps.length < 3) { intl.eaffYears[year] = { skipped: true }; return null; }
      const res = tryCallup(state, "中国", "friendly");
      const ed = { called: !!res.called, role: res.role || null };
      intl.eaffYears[year] = ed;
      const me = { id: "nat_中国", name: "中国", strength: nationStrength("中国") };
      ed.table = [{ name: "中国", strength: me.strength, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }]
        .concat(opps.map(o => ({ name: o.name, strength: o.strength, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 })));
      const days = [9, 13, 16];
      opps.forEach((o, i) => {
        const home = (i % 2 === 0);   // 主客交替，确定形态（零 R）
        intl.miniFixtures.push({
          type: "intl", comp: "东亚杯第" + (i + 1) + "轮", stage: "eaff-group", round: i + 1, year,
          month: 7, day: days[i], played: false, result: null,
          match: home ? { home: me, away: { id: "nat_" + o.name, name: o.name, strength: o.strength } }
            : { home: { id: "nat_" + o.name, name: o.name, strength: o.strength }, away: me },
        });
      });
      if (ed.called) {
        try { if (window.News) News.onEvent(state, "callup", { player: p.name, comp: "东亚杯" }); } catch (e) { /* ignore */ }
        return {
          title: "国足 · 东亚杯征召", plain: true,
          text: "你入选了 " + year + " 东亚杯大名单——7 月连战 " + opps.map(o => o.name).join("、")
            + " 三支劲旅。" + (res.role === "starter" ? "教练组把你当进攻核心用。" : "轮换阵容也是国字号履历。"),
          effects: { fame: 300, morale: 5 },
        };
      }
      return {
        title: "国足 · 东亚杯名单无缘", plain: true,
        text: year + " 东亚杯大名单没有你的名字。原因：" + (res.reason || "同位置竞争激烈") + "——俱乐部和友谊赛的表现是唯一敲门砖。",
        effects: { morale: -3 },
      };
    }

    /* ── 奥运会 U23：%4==0 年，6 月下旬开窗（正赛 7 月） ── */
    if (year >= 2016 && year % 4 === 0 && month === 6 && day >= 15 && day <= 25 && !intl.olyYears[year]) {
      const rng = miniRng("OLY-" + year);
      const pool = OLY_POOL.filter(n => (ND() && ND().teams && ND().teams[n]) != null);
      if (pool.length < 3) { intl.olyYears[year] = { skipped: true }; return null; }
      // 抽 3 个小组对手（届次种子，确定性；强队优先权重 = 简化等权）
      const shuffled = pool.slice();
      for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = t; }
      const opps = shuffled.slice(0, 3).map(n => ({ name: n, strength: ND().teams[n] }));
      const under23 = p.age <= 23;
      /* ★★ P300（兄弟拍板「奥运会符合年龄标准是一定要参赛的」）：U23 且非伤病 → **必入选**，
         跳过 tryCallup 的 OVR 竞争线——奥运会是年龄门槛赛事而非实力门槛赛事（现实口径：
         国奥适龄应征是义务）。受伤仍无缘（医疗组不放行），超龄照旧无缘（U23 门槛）。
         role 二分：OVR ≥ 国足强度−6 = 主力核心档，否则替补档（仅影响征召文案）。 */
      let res;
      if (!under23) res = { called: false, reason: "超龄球员不参加奥运会（U23 门槛）" };
      else if (d.injuryDays > 0) res = { called: false, reason: "伤病未愈，国家队医疗组未征召你" };
      else res = { called: true, role: PlayerSystem.overall(p) >= nationStrength("中国") - 6 ? "starter" : "bench" };
      const ed = { called: !!res.called, role: res.role || null, groupOpps: opps.map(o => o.name) };
      intl.olyYears[year] = ed;
      const me = { id: "nat_中国", name: "中国", strength: Math.round(nationStrength("中国") * 0.92) }; // U23 国奥 ≈ 成年队 92%
      const days = [22, 25, 28];
      opps.forEach((o, i) => {
        intl.miniFixtures.push({
          type: "intl", comp: "奥运会小组赛第" + (i + 1) + "轮", stage: "oly-group", round: i + 1, year,
          month: 7, day: days[i], played: false, result: null,
          match: (i % 2 === 0) ? { home: me, away: { id: "nat_" + o.name, name: o.name, strength: o.strength } }
            : { home: { id: "nat_" + o.name, name: o.name, strength: o.strength }, away: me },
        });
      });
      ed.table = [{ name: "中国", strength: me.strength, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }]
        .concat(opps.map(o => ({ name: o.name, strength: o.strength, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 })));
      if (ed.called) {
        try { if (window.News) News.onEvent(state, "callup", { player: p.name, comp: "奥运会" }); } catch (e) { /* ignore */ }
        return {
          title: "国足 · 国奥队征召", plain: true,
          text: "你入选了 " + year + " 奥运会国奥队大名单（U23）——小组赛连战 " + opps.map(o => o.name).join("、")
            + "。" + (res.role === "starter" ? "你是这支国奥的进攻核心。" : "奥运舞台，一步一个脚印。"),
          effects: { fame: 500, morale: 6 },
        };
      }
      return {
        title: "国足 · 国奥队名单无缘", plain: true,
        text: year + " 奥运会国奥队大名单没有你的名字。" + (under23 ? "原因：" + (res.reason || "竞争激烈") : "23 岁以上的老将不再参赛——把舞台留给年轻人。"),
        effects: { morale: -2 },
      };
    }
    return null;
  }

  /** 东亚杯/奥运会结果推进（applyResult 分支调用；autoSettle 追平同路） */
  function miniAfterResult(state, fixture, result, myGoals, oppGoals, oppName) {
    const d = state.data;
    const intl = ensureIntl(state);
    const isOly = fixture.comp.indexOf("奥运会") >= 0;
    const ed = isOly ? intl.olyYears[fixture.year] : intl.eaffYears[fixture.year];
    if (!ed || ed.done) return;

    /* ── 小组赛记分 ── */
    if (fixture.stage === "eaff-group" || fixture.stage === "oly-group") {
      const table = isOly ? ed.table : (ed.table || (ed.table = [
        { name: "中国", strength: nationStrength("中国"), p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 },
      ].concat(presentTeams(EAFF_POOL, 3).map(o => ({ name: o.name, strength: o.strength, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }))))); // 表建在建档处（P295），此处仅旧档防御回落
      const rowC = table.find(r => r.name === "中国");
      const rowO = table.find(r => r.name === oppName);
      if (rowC && rowO) {
        rowC.p++; rowO.p++;
        rowC.gf += myGoals; rowC.ga += oppGoals;
        rowO.gf += oppGoals; rowO.ga += myGoals;
        if (myGoals > oppGoals) { rowC.w++; rowC.pts += 3; rowO.l++; }
        else if (myGoals < oppGoals) { rowO.w++; rowO.pts += 3; rowC.l++; }
        else { rowC.d++; rowO.d++; rowC.pts++; rowO.pts++; }
      }
      /* 三轮全踢完 → 收口 */
      const mine = intl.miniFixtures.filter(f => f.year === fixture.year && f.stage === fixture.stage);
      if (mine.length && mine.every(f => f.played)) {
        /* 其他队交叉赛果：届次种子确定性模拟（零 R）——东亚杯补 3 场 / 奥运会补 3 场 */
        const rng = miniRng((isOly ? "OLY" : "EAFF") + "-" + fixture.year + "-x");
        const others = table.filter(r => r.name !== "中国");
        const pairs = [[0, 1], [0, 2], [1, 2]];
        for (const [a, b] of pairs) {
          if (others[a].p >= 3 && others[b].p >= 3) continue;   // 已满场（防御）
          const [g1, g2] = [Math.floor(rng() * 4), Math.floor(rng() * 3)];
          others[a].p++; others[b].p++;
          others[a].gf += g1; others[a].ga += g2; others[b].gf += g2; others[b].ga += g1;
          if (g1 > g2) { others[a].w++; others[a].pts += 3; others[b].l++; }
          else if (g1 < g2) { others[b].w++; others[b].pts += 3; others[a].l++; }
          else { others[a].d++; others[b].d++; others[a].pts++; others[b].pts++; }
        }
        table.sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf);
        const myRank = table.findIndex(r => r.name === "中国") + 1;
        ed.rank = myRank;
        if (!isOly) {
          /* 东亚杯收口：冠军 + 荣誉榜 + 播报 */
          ed.done = true;
          const champ = table[0];
          pushHonor(state, "eaff", fixture.year, champ.name, table[1] ? table[1].name : "—", rankTextOf(myRank, table.length));
          try { if (window.News) News.onEvent(state, "mini_champion", { year: fixture.year, champion: champ.name, comp: "东亚杯", china: rankTextOf(myRank, table.length) }); } catch (e) { /* ignore */ }
        } else {
          /* 奥运会：小组前 2 出线 → 淘汰赛阶梯（八强→半决赛→决赛） */
          if (myRank <= 2) {
            const rng2 = miniRng("OLY-" + fixture.year + "-ko");
            const strongPool = OLY_POOL.filter(n => n !== oppName && !ed.groupOpps.some(g => g === n) && (ND() && ND().teams && ND().teams[n]) != null);
            const oppN = strongPool.length ? strongPool[Math.floor(rng2() * strongPool.length)] : oppName;
            const me = { id: "nat_中国", name: "中国", strength: Math.round(nationStrength("中国") * 0.92) };
            const opp = { id: "nat_" + oppN, name: oppN, strength: ND().teams[oppN] || 80 };
            const koFixture = { type: "intl", comp: "奥运会八强", stage: "oly-ko", koIdx: 0, year: fixture.year, month: 8, day: 2, played: false, result: null, match: (myRank === 1) ? { home: me, away: opp } : { home: opp, away: me } };
            intl.miniFixtures.push(koFixture);
            ed.koStage = "奥运会八强";
          } else {
            ed.done = true;
            pushHonor(state, "olympic", fixture.year, seededChampionOf(OLY_SEED_CHAMP, fixture.year, 2).champion, seededChampionOf(OLY_SEED_CHAMP, fixture.year, 2).runnerUp, "小组出局（第 " + myRank + "）");
            try { if (window.News) News.onEvent(state, "mini_champion", { year: fixture.year, champion: seededChampionOf(OLY_SEED_CHAMP, fixture.year, 2).champion, comp: "奥运会足球赛", china: "小组出局" }); } catch (e) { /* ignore */ }
          }
        }
      }
      return;
    }

    /* ── 奥运会淘汰赛阶梯（单场决胜；胜=造下一场，负/收口=落账） ── */
    if (fixture.stage === "oly-ko") {
      const won = myGoals > oppGoals;
      const LADDER = ["奥运会八强", "奥运会半决赛", "奥运会决赛"];
      const idx = fixture.koIdx || 0;
      if (won && idx < LADDER.length - 1) {
        const rng = miniRng("OLY-" + fixture.year + "-ko" + (idx + 1));
        const pool = OLY_POOL.filter(n => (ND() && ND().teams && ND().teams[n]) != null);
        const oppN = pool[Math.floor(rng() * pool.length)];
        const me = { id: "nat_中国", name: "中国", strength: Math.round(nationStrength("中国") * 0.92) };
        const opp = { id: "nat_" + oppN, name: oppN, strength: ND().teams[oppN] || 82 };
        intl.miniFixtures.push({ type: "intl", comp: LADDER[idx + 1], stage: "oly-ko", koIdx: idx + 1, year: fixture.year, month: 8, day: 6 + idx * 4, played: false, result: null, match: (idx % 2 === 0) ? { home: me, away: opp } : { home: opp, away: me } });
        ed.koStage = LADDER[idx + 1];
        return;
      }
      ed.done = true;
      const sc = seededChampionOf(OLY_SEED_CHAMP, fixture.year, 3);
      if (won) {   // 决赛赢 = 冠军
        ed.rank = 1;
        pushHonor(state, "olympic", fixture.year, "中国", oppName, "冠军");
        try { if (window.News) News.onEvent(state, "intl_champion", { player: d.player.name, comp: fixture.year + "奥运会足球赛", team: "国奥队" }); } catch (e) { /* ignore */ }
        d.trophies.push({ name: "奥运会冠军", icon: "", season: d.season });
        if (window.Career) Career.addFame(state, 20000);
      } else {
        const place = idx === LADDER.length - 1 ? "亚军" : idx === 1 ? "四强" : "八强";
        ed.rank = idx + 2;
        pushHonor(state, "olympic", fixture.year, sc.champion, sc.runnerUp, place);
        try { if (window.News) News.onEvent(state, "mini_champion", { year: fixture.year, champion: sc.champion, comp: "奥运会足球赛", china: place }); } catch (e) { /* ignore */ }
        if (place === "亚军") { d.trophies.push({ name: "奥运会亚军", icon: "", season: d.season }); if (window.Career) Career.addFame(state, 8000); }
      }
    }
  }

  // ── 赛会射手榜 ──
  function recordShooters(d, comp, team, goals) {
    if (!goals || goals <= 0) return;
    d.intl.shooters = d.intl.shooters || {};
    d.intl.shooters[comp] = d.intl.shooters[comp] || [];
    const board = d.intl.shooters[comp];
    const squad = nationSquad(team);
    const atk = squad.filter(p => ["ST", "CF", "LW", "RW", "CAM"].indexOf(p.position) >= 0);
    for (let i = 0; i < goals; i++) {
      const scorer = atk.length ? R.pick(atk).name : team + "球员";
      let row = board.find(b => b.name === scorer && b.team === team);
      if (!row) { row = { name: scorer, team, goals: 0 }; board.push(row); }
      row.goals++;
    }
  }
  function recordPlayerGoals(d, comp, goals) {
    if (!goals || goals <= 0) return;
    d.intl.shooters = d.intl.shooters || {};
    d.intl.shooters[comp] = d.intl.shooters[comp] || [];
    const board = d.intl.shooters[comp];
    let row = board.find(b => b.name === d.player.name);
    if (!row) { row = { name: d.player.name, team: "中国", goals: 0, me: true }; board.push(row); }
    row.goals += goals; row.me = true;
  }

  // 小组赛全部打完 → 排名 → 出线判定 → 生成淘汰赛
  function onGroupComplete(state) {
    const d = state.data;
    const cup = d.intl.asiaCup;
    // C 组最终排名
    const myG = cup.myGroup || "C";
    cup.table[myG].sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf);
    const myRank = cup.table[myG].findIndex(r => r.name === "中国") + 1;
    // 其他组 quickSim
    for (const g of Object.keys(cup.table).filter(x => x !== myG)) {
      const rows = cup.table[g];
      // 简化：未满 3 场的队按剩余比赛全部模拟
      for (const r of rows) { while (r.p < 3) { const [gf, ga] = quickScore(r.strength, Math.max(50, r.strength - R.int(0, 8))); r.p++; r.gf += gf; r.ga += ga; if (gf > ga) { r.w++; r.pts += 3; } else if (gf < ga) r.l++; else { r.d++; r.pts++; } } }
      rows.sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf);
    }
    const koDays = asiaCupEdition(cup.year).koDays || ND().asiaCup2027.koDays;
    if (cup.format16) {
      // 2015 届 16 队制：4 组前 2 出线共 8 队，直接打八强（1v8 标准种子对阵）
      const seeded = [];
      for (const g of Object.keys(cup.table)) {
        seeded.push(Object.assign({ seedG: g }, cup.table[g][0]));
        seeded.push(Object.assign({ seedG: g }, cup.table[g][1]));
      }
      seeded.forEach((r, i) => r.seed = i + 1);
      const mySeed = seeded.findIndex(r => r.name === "中国") + 1;
      if (mySeed >= 1 && mySeed <= 8) {
        const oppSeed = 9 - mySeed;
        const oppRow = seeded[oppSeed - 1];
        const userIsHome = mySeed < oppSeed;
        const opp = { id: "nat_" + oppRow.name, name: oppRow.name, strength: oppRow.strength };
        const me = { id: "nat_中国", name: "中国", strength: nationStrength("中国") };
        const kd = koDays.qf;
        cup.nextKO = { stage: "八强", fixture: { type: "intl", comp: "亚洲杯八强", year: cup.year, month: kd.month, day: kd.day, played: false, result: null, cupKO: true, pressure: 0.3, match: userIsHome ? { home: me, away: opp } : { home: opp, away: me } } };
        mile(state, "ac_group");   // ★ P141 亚洲杯小组出线（16 队制直通八强）
        return { qualified: true, myRank, mySeed, opp: oppRow.name, koDays };
      }
      return { qualified: false, myRank };
    }
    // 24 队制（2019/2023/2027…）：6 组前 2 + 4 最好第三 → 十六强
    const seeded = [];
    const thirds = [];
    for (const g of Object.keys(cup.table)) {
      seeded.push(Object.assign({ seedG: g }, cup.table[g][0]));
      seeded.push(Object.assign({ seedG: g }, cup.table[g][1]));
      thirds.push(Object.assign({ seedG: g }, cup.table[g][2]));
    }
    thirds.sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga));
    seeded.push(...thirds.slice(0, 4));
    seeded.forEach((r, i) => r.seed = i + 1);
    // 我的名次 → seed
    const mySeed = seeded.findIndex(r => r.name === "中国") + 1;
    // 1v16 / 2v15 … 标准 seed 对阵
    const ko = { stage: "r16", alive: true, mySeed };
    if (mySeed >= 1 && mySeed <= 16) {
      const oppSeed = 17 - mySeed;
      const oppRow = seeded[oppSeed - 1];
      const userIsHome = mySeed < oppSeed;
      const opp = { id: "nat_" + oppRow.name, name: oppRow.name, strength: oppRow.strength };
      const me = { id: "nat_中国", name: "中国", strength: nationStrength("中国") };
      const kd = koDays.r16;
      cup.nextKO = { stage: "十六强", fixture: { type: "intl", comp: "亚洲杯十六强", year: cup.year, month: kd.month, day: kd.day, played: false, result: null, cupKO: true, pressure: 0.3, match: userIsHome ? { home: me, away: opp } : { home: opp, away: me } } };
      mile(state, "ac_group");   // ★ P141 亚洲杯小组出线（24 队制进十六强）
      return { qualified: true, myRank, mySeed, opp: oppRow.name, koDays };
    }
    return { qualified: false, myRank };
  }

  // 淘汰赛打完 → 下一轮或出局/夺冠
  function advanceKO(state, fixture, result, pens) {
    const d = state.data;
    const cup = d.intl.asiaCup;
    /* ★ P96 防御（第二重保险）：本函数只服务亚洲杯淘汰赛。
       正常流程已在调用点把 cupKO 收紧到「世界杯 / 亚洲杯」（intl.js autoSettleOverdue 与
       v2/settlement.js 两处）；这里再挡一次，避免任何非亚洲杯 fixture 误入时
       解引用 null 崩溃、或返回 {out:true} 让调用方误调 settleAsiaCup。 */
    if (!cup || (fixture.comp || "").indexOf("亚洲杯") < 0) return { out: false, noop: true, stage: fixture.comp };
    const userIsHome = fixture.match.home.id === "nat_中国";
    const myGoals = userIsHome ? result.home : result.away;
    const oppGoals = userIsHome ? result.away : result.home;
    const oppName = userIsHome ? fixture.match.away.name : fixture.match.home.name;
    const won = myGoals > oppGoals || (myGoals === oppGoals && (pens ? pens.won : R.chance(0.5))); // 有点球结果以点球为准
    cup.results.push({ round: fixture.comp, opp: oppName, myGoals, oppGoals, won });
    if (!won) { mileByStage(state, fixture.comp, AC_STAGE_KEY); cup.stage = "done"; cup.nextKO = null; return { out: true, stage: fixture.comp }; }
    const nextMap = { "十六强": ["八强", "qf"], "八强": ["半决赛", "sf"], "半决赛": ["决赛", "final"] };
    let label = null, key = null;
    for (const k of Object.keys(nextMap)) {
      if (fixture.comp.indexOf(k) >= 0) { label = nextMap[k][0]; key = nextMap[k][1]; break; }
    }
    if (!label) { mile(state, "ac_ch"); cup.stage = "champion"; cup.nextKO = null; return { champion: true }; }
    // 新对手：从尚未被淘汰的强队池抽
    const pools = ["日本", "韩国", "伊朗", "澳大利亚", "沙特阿拉伯", "卡塔尔", "乌兹别克斯坦", "伊拉克", "阿联酋", "约旦", "阿曼", "巴林", "越南", "泰国", "塔吉克斯坦"];
    const used = cup.results.map(r => r.opp);
    const avail = pools.filter(p => used.indexOf(p) < 0 && p !== "中国");
    const nextOpp = avail.length ? R.pick(avail) : R.pick(pools.filter(p => p !== "中国"));
    const opp = { id: "nat_" + nextOpp, name: nextOpp, strength: nationStrength(nextOpp) };
    const me = { id: "nat_中国", name: "中国", strength: nationStrength("中国") };
    const kd = (asiaCupEdition(cup.year).koDays || ND().asiaCup2027.koDays)[key];
    cup.stage = key;
    const pressureMap = { "八强": 0.3, "半决赛": 0.45, "决赛": 0.6 };
    cup.nextKO = { stage: label, fixture: { type: "intl", comp: "亚洲杯" + label, year: cup.year, month: kd.month, day: kd.day, played: false, result: null, cupKO: true, pressure: pressureMap[label] || 0.3, match: R.chance(0.5) ? { home: me, away: opp } : { home: opp, away: me } } };
    return { won: true, next: label, opp: nextOpp };
  }

  // 亚洲杯全部结束（决赛获胜/出局/小组出局）→ 结算
  function settleAsiaCup(state) {
    const d = state.data;
    const cup = d.intl.asiaCup;
    if (!cup || cup.settled) return { awards: [], stats: d.intl.asiaCupStats || { goals: 0, ratingSum: 0, apps: 0 } };
    cup.settled = true;
    const stats = d.intl.asiaCupStats || { goals: 0, ratingSum: 0, apps: 0 };
    const awards = [];
    // 参赛荣誉（与世界杯对称）
    d.trophies.push({ name: (cup.year || 2027) + "亚洲杯参赛", icon: "", season: d.season });
    Career.addFame(state, 3000);
    if (cup.stage === "champion") { mile(state, "ac_ch"); /* ★ P273 结算端兜底挂账（幂等） */ awards.push({ name: "亚洲杯冠军", icon: "" }); d.trophies.push({ name: "亚洲杯冠军", icon: "", season: d.season }); Career.addFame(state, 8000); }
    if (stats.goals >= 4 && R.chance(0.6)) { awards.push({ name: "亚洲杯金靴", icon: "" }); d.trophies.push({ name: "亚洲杯金靴", icon: "", season: d.season }); Career.addFame(state, 4000); }
    if (stats.apps >= 4 && stats.ratingSum / Math.max(1, stats.apps) >= 7.8) { awards.push({ name: "亚洲杯MVP", icon: "" }); d.trophies.push({ name: "亚洲杯MVP", icon: "", season: d.season }); Career.addFame(state, 5000); }
    /* ★ P295：荣誉榜落账（玩家参赛届——亚洲杯；冠军播报对称世界杯） */
    try {
      const A8 = ["日本", "伊朗", "韩国", "澳大利亚", "沙特阿拉伯", "卡塔尔", "伊拉克", "阿联酋"];
      const sc = seededChampionOf(A8, cup.year || 2027, 1);
      if (window.News && cup.stage !== "champion") {
        News.onEvent(state, "npc_ac_champion", { year: cup.year || 2027, champion: sc.champion, runnerup: sc.runnerUp, player: d.player.name });
      } else if (window.News) {
        News.onEvent(state, "intl_champion", { player: d.player.name, comp: (cup.year || 2027) + "亚洲杯", team: "中国队" });
      }
      pushHonor(state, "asiacup", cup.year || 2027, cup.stage === "champion" ? "中国" : sc.champion, sc.runnerUp,
        cup.stage === "champion" ? "冠军" : (cup.myRank != null && cup.myRank > 2 ? "止步小组赛" : "淘汰赛"));
    } catch (eN) { /* ignore */ }
    cup.stage = "done";
    return { awards, stats };
  }

  // 世预赛第一阶段结束 → 出线判定（40 强：第一直通+4 最好第二；36 强：前二直通）
  function settleWcq36(state) {
    const d = state.data;
    const q = d.intl.wcq;
    // 对手互赛补齐（此前对手只有对阵中国的记录、从不对垒 → 出线率虚高）。
    // 双循环：每对手间补 2 场，与中国场次持平；quickScore 按真实国家强度。
    (function playR36PeerMatches() {
      const others = q.table.filter(r => r.name !== "中国");
      for (let i = 0; i < others.length; i++) {
        for (let j = i + 1; j < others.length; j++) {
          const A = others[i], B = others[j];
          if (!A || !B) continue;
          const sA = nationStrength(A.name), sB = nationStrength(B.name);
          for (let leg = 0; leg < 2; leg++) {
            const homeFirst = leg === 0;
            const sc = homeFirst ? quickScore(sA, sB) : quickScore(sB, sA);
            const H = homeFirst ? A : B, W = homeFirst ? B : A;
            const hg = sc[0], ag = sc[1];
            H.p++; W.p++; H.gf += hg; H.ga += ag; W.gf += ag; W.ga += hg;
            if (hg > ag) { H.w++; H.pts += 3; W.l++; }
            else if (hg < ag) { W.w++; W.pts += 3; H.l++; }
            else { H.d++; W.d++; H.pts++; W.pts++; }
            /* ★ P141：真实对手互赛入 FIFA 积分（homeFirst 时 H=主队视角） */
            simMatchPts(state, H.name, W.name, hg, ag);
          }
        }
      }
    })();
    q.table.sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf);
    const rank = q.table.findIndex(r => r.name === "中国") + 1;

    if (q.format === "r40r12") {
      // 40 强赛 8 组：8 个小组第一 + 4 个最好小组第二 → 12 强赛
      // 旁组第一/第二按真实强度 quickSim（种子=伊朗/日本/沙特/澳/乌/阿联酋/约旦/阿曼）
      const seeds = ["伊朗", "日本", "沙特阿拉伯", "澳大利亚", "乌兹别克斯坦", "阿联酋", "约旦", "阿曼"];
      const secondRows = [];
      for (let g = 0; g < 7; g++) {
        const s = nationStrength(seeds[g % seeds.length]) + R.int(-2, 2);
        const rival = Math.max(40, s - R.int(6, 16));
        const pts = 12 + R.int(0, 6);
        secondRows.push({ pts, gd: R.int(2, 14) });
      }
      if (rank === 1) {
        mile(state, "wcq36");   // ★ P141
        initR18(state);
        return { rank, qualified: true, table: q.table.slice() };
      }
      if (rank === 2) {
        // 中国第二：与 7 个旁组第二比"4 个最好第二"（积分+净胜）
        const mine = q.table.find(r => r.name === "中国");
        const myRow = { pts: mine.pts, gd: mine.gf - mine.ga };
        const better = secondRows.filter(r => r.pts > myRow.pts || (r.pts === myRow.pts && r.gd > myRow.gd)).length;
        if (better < 4) {
          mile(state, "wcq36");   // ★ P141
          initR18(state);
          return { rank, qualified: true, via: "best-second", table: q.table.slice() };
        }
      }
      q.stage = "r36-out";
      return { rank, qualified: false, table: q.table.slice() };
    }

    // 36 强赛（9 组 × 4 队）每组前 2 进第三轮，其余直接淘汰（无附加赛路径）
    if (rank <= 2) {
      mile(state, "wcq36");   // ★ P141
      initR18(state);
      return { rank, qualified: true, table: q.table.slice() };
    }
    q.stage = "r36-out";
    return { rank, qualified: false, table: q.table.slice() };
  }

  // 18 强赛 10 轮打完 → 排名结算（前 2 直通；3/4 名附加赛）
  function settleR18(state) {
    const d = state.data;
    const q = d.intl.wcq;
    // 其他队剩余比赛快速模拟（保证积分榜真实感）
    q.r18Table.forEach(r => {
      if (r.name === "中国") return;
      const str = nationStrength(r.name);
      while (r.p < 10) {
        // P0-4：填充局改按真实强度的伪对手 quickScore（原 R.int(0,3) 强度盲 → 日本=科威特）
        const oppStr = Math.max(45, str + R.int(-8, 8));
        const sc = quickScore(str, oppStr);
        const gf = sc[0], ga = sc[1];
        r.p++; r.gf += gf; r.ga += ga;
        if (gf > ga) { r.w++; r.pts += 3; } else if (gf < ga) r.l++; else { r.d++; r.pts++; }
      }
    });
    sortRows(q.r18Table);
    const rank = q.r18Table.findIndex(r => r.name === "中国") + 1;
    q.r18Rank = rank;

    // 旁组 quickSim（双循环）：12 强=1 组 / 18 强=2 组
    const side = (q.r18Groups || []).map(g => simGroupDouble(state, g));
    q.r18Side = side;

    if (q.format === "r40r12") {
      /* 12 强赛出线分配（现实）：每组前 2 直通（4 席）；两个第三打亚洲附加赛（胜者 0.5 席） */
      const direct = [q.r18Table[0].name, q.r18Table[1].name];
      const playoffTeams = [q.r18Table[2].name];
      side.forEach(rows => {
        if (rows[0]) direct.push(rows[0].name);
        if (rows[1]) direct.push(rows[1].name);
        if (rows[2]) playoffTeams.push(rows[2].name);
      });
      q.qualifiedTeams = direct.slice(0, 4);       // 已直通的亚洲 4 队
      q.playoffTeams = playoffTeams.slice(0, 2);   // 亚洲附加赛 2 队
      if (rank <= 2) {
        q.stage = "worldcup-qualified";
        d.trophies.push({ name: "晋级" + (q.worldCupYear || 2030) + "世界杯", icon: "", season: d.season });
        mile(state, "wcq18");   // ★ P141 世预赛出线晋级世界杯
        Career.addFame(state, 10000);
        return { rank, qualified: true };
      }
      if (rank === 3) {
        initPlayoff(state);
        return { rank, qualified: false, playoff: true };
      }
      q.stage = "r18-out";
      return { rank, qualified: false };
    }

    /* 18 强赛出线分配（现实）：每组前 2 直通（6 席）；每组 3、4 名进第四阶段（6 队争 2 席） */
    const direct = [q.r18Table[0].name, q.r18Table[1].name];
    const playoffTeams = [q.r18Table[2].name, q.r18Table[3].name];
    side.forEach(rows => {
      if (rows[0]) direct.push(rows[0].name);
      if (rows[1]) direct.push(rows[1].name);
      if (rows[2]) playoffTeams.push(rows[2].name);
      if (rows[3]) playoffTeams.push(rows[3].name);
    });
    q.qualifiedTeams = direct.slice(0, 6);       // 已直通的亚洲 6 队
    q.playoffTeams = playoffTeams.slice(0, 6);   // 第四阶段 6 队

    if (rank <= 2) {
      q.stage = "worldcup-qualified";
      d.trophies.push({ name: "晋级" + (q.worldCupYear || 2030) + "世界杯", icon: "", season: d.season });
      mile(state, "wcq18");   // ★ P141 世预赛出线晋级世界杯（18 强周期）
      Career.addFame(state, 10000);
      return { rank, qualified: true };
    }
    if (rank <= 4) {
      initPlayoff(state);
      return { rank, qualified: false, playoff: true };
    }
    q.stage = "r18-out";
    return { rank, qualified: false };
  }

  // 附加赛打完 → 出线判定
  // 12 强周期两段接力：亚洲附加赛 2 场（总比分）→ 胜者生成跨洲附加赛 1 场 → 终判
  // 18 强周期：第四阶段 2 组 × 3 队单循环，每组第 1 直通
  function settlePlayoff(state) {
    const d = state.data;
    const q = d.intl.wcq;

    if (q.format === "r40r12") {
      const played = q.fixtures.filter(f => f.stage === "playoff" && f.played);
      if (!q.interCup) {
        if (played.length < 2) return { qualified: false, pending: true };
        let aggMe = 0, aggOpp = 0;
        played.forEach(f => {
          const meHome = f.match.home.id === "nat_中国";
          aggMe += meHome ? f.result.home : f.result.away;
          aggOpp += meHome ? f.result.away : f.result.home;
        });
        q.playoffAgg = { me: aggMe, opp: aggOpp };
        let through = aggMe > aggOpp;
        if (aggMe === aggOpp) {
          // 总比分相同 → 点球决胜（按强度微偏；史实 2017 叙利亚-澳大利亚即此场景）
          const oppName = (q.playoffGroup || []).find(t => t !== "中国") || "伊拉克";
          through = R.chance(nationStrength("中国") >= nationStrength(oppName) ? 0.55 : 0.45);
        }
        if (!through) {
          q.stage = "playoff-out";
          return { qualified: false, rank: 2, agg: q.playoffAgg, penalty: aggMe === aggOpp };
        }
        // 亚洲附加赛胜 → 跨洲附加赛（0.5 席；真实 2018=洪都拉斯 / 2022=秘鲁档）
        const oppName = R.pick(["洪都拉斯", "秘鲁", "巴拉圭", "牙买加", "巴拿马", "萨尔万多"]);
        const W = q.worldCupYear || 2030;
        q.interCup = true;
        q.fixtures.push({
          type: "intl", stage: "playoff", comp: "世预赛跨洲附加赛", year: W - 1, month: 11, day: 14, played: false, result: null, cupKO: true, pressure: 0.5,
          match: R.chance(0.5)
            ? { home: { id: "nat_中国", name: "中国", strength: nationStrength("中国") }, away: { id: "nat_" + oppName, name: oppName, strength: nationStrength(oppName) } }
            : { home: { id: "nat_" + oppName, name: oppName, strength: nationStrength(oppName) }, away: { id: "nat_中国", name: "中国", strength: nationStrength("中国") } },
        });
        return { qualified: false, pending: true, next: "intercontinental" };
      }
      const interF = played[played.length - 1];
      if (!interF || !interF.result) return { qualified: false, pending: true };
      const meHome = interF.match.home.id === "nat_中国";
      const mg = meHome ? interF.result.home : interF.result.away;
      const og = meHome ? interF.result.away : interF.result.home;
      if (mg > og || (mg === og && R.chance(0.5))) {
        q.stage = "worldcup-qualified";
        d.trophies.push({ name: "晋级" + (q.worldCupYear || 2030) + "世界杯", icon: "", season: d.season });
        mile(state, "wcqPO");   // ★ P141 跨洲附加赛胜出晋级世界杯
        Career.addFame(state, 10000);
        return { qualified: true, rank: 1, via: "intercontinental" };
      }
      q.stage = "playoff-out";
      return { qualified: false, rank: 2, via: "intercontinental" };
    }

    /* 中国组（中国 + 2 队单循环）：中国的 2 场已记录，补两邻居互打的 1 场 */
    const gname = q.playoffGroup || ["中国"];
    const rows = gname.map(t => ({ name: t, strength: nationStrength(t), p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }));
    const rowOf = n => rows.filter(r => r.name === n)[0];
    q.fixtures.filter(f => f.stage === "playoff" && f.played).forEach(f => {
      const meHome = f.match.home.id === "nat_中国";
      const oppName = meHome ? f.match.away.name : f.match.home.name;
      const me = rowOf("中国"), opp = rowOf(oppName);
      if (!me || !opp) return;
      const mg = meHome ? f.result.home : f.result.away;
      const og = meHome ? f.result.away : f.result.home;
      me.p++; opp.p++; me.gf += mg; me.ga += og; opp.gf += og; opp.ga += mg;
      if (mg > og) { me.w++; me.pts += 3; opp.l++; }
      else if (mg < og) { opp.w++; opp.pts += 3; me.l++; }
      else { me.d++; opp.d++; me.pts++; opp.pts++; }
    });
    if (gname.length === 3) {
      const a = rowOf(gname[1]), b = rowOf(gname[2]);
      const sc = quickScore(a.strength, b.strength);
      a.p++; b.p++; a.gf += sc[0]; a.ga += sc[1]; b.gf += sc[1]; b.ga += sc[0];
      if (sc[0] > sc[1]) { a.w++; a.pts += 3; b.l++; }
      else if (sc[0] < sc[1]) { b.w++; b.pts += 3; a.l++; }
      else { a.d++; b.d++; a.pts++; b.pts++; }
      simMatchPts(state, a.name, b.name, sc[0], sc[1]);   // ★ P141 附加赛旁组积分入账
    }
    sortRows(rows);
    const rank = rows.findIndex(r => r.name === "中国") + 1;
    q.playoffRank = rank;
    // 另一组第 1（亚洲第 8 席）
    const sideRows = simGroupSingle(state, q.playoffSide || []);
    const extras = [rows[0].name, sideRows.length ? sideRows[0].name : null].filter(Boolean);
    q.qualifiedTeams = (q.qualifiedTeams || []).concat(extras).slice(0, 8);
    if (rank === 1) {
      q.stage = "worldcup-qualified";
      d.trophies.push({ name: "晋级" + (q.worldCupYear || 2030) + "世界杯", icon: "", season: d.season });
      mile(state, "wcqPO");   // ★ P141 附加赛（第四阶段/跨洲）胜出晋级世界杯
      Career.addFame(state, 10000);
      return { qualified: true, rank };
    }
    q.stage = "playoff-out";
    return { qualified: false, rank };
  }

  /**
   * P48：世界杯概览 HTML（两壳共用：12 组分组全景 / 中国组积分榜 / 中国队征程）
   * 由 v1 赛程页与 v2 赛程页共同调用，避免两侧各写一份导致内容漂移
   */
  function wcSummaryHtml() {
    const wc = (window.State && State.data && State.data.intl) ? State.data.intl.worldCup : null;
    if (!wc) return "";
    const esc2 = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    let html = "";
    /* ① 12 组分组全景 */
    if (wc.groups) {
      html += '<div class="panel hl-gold-strong"><div class="panel-title">' + wc.year + " 世界杯分组 · 48 队 / 12 组</div>";
      Object.keys(wc.groups).forEach(g => {
        const mine = g === wc.myGroup;
        html += '<div class="li-tight" style="padding:3px 6px;display:flex;gap:8px;align-items:baseline' +
          (mine ? ";background:rgba(233,193,90,.14);border-radius:4px" : "") + '">' +
          '<b style="width:32px;color:' + (mine ? "var(--gold)" : "var(--text-dim)") + '">' + g + "组</b>" +
          '<div style="font-size:12px;flex:1">' +
          wc.groups[g].map(n => n === "中国" ? '<b style="color:var(--gold)">中国</b>' : esc2(n)).join(" · ") +
          "</div></div>";
      });
      html += "</div>";
    }
    /* ② 中国组积分榜 */
    if (wc.table) {
      html += '<div class="panel hl-gold-strong"><div class="panel-title">世界杯小组赛积分榜（' + (wc.myGroup || "?") + " 组）</div>";
      wc.table.slice().sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga)).forEach((t, i) => {
        const mine = t.name === "中国";
        html += '<div class="list-item' + (mine ? " win" : "") + ' li-tight"><span style="width:22px;color:' + (i <= 1 ? "var(--success)" : "var(--text-dim)") + ';font-weight:800">' + (i + 1) + "</span>" +
          '<div class="li-main" style="font-size:13px' + (mine ? ";font-weight:800;color:var(--gold)" : "") + '">' + esc2(t.name) + "</div>" +
          '<div class="li-right muted-12">' + t.p + "场 " + t.pts + "分</div></div>";
      });
      html += "</div>";
    }
    /* ③ 中国队征程 */
    if (wc.results && wc.results.length) {
      html += '<div class="panel hl-gold-strong"><div class="panel-title">世界杯征程</div>';
      wc.results.forEach(r => {
        const won = typeof r.won === "boolean" ? r.won : r.myGoals > r.oppGoals;
        html += '<div class="list-item' + (won ? " win" : " loss") + ' li-tight">' +
          '<div class="li-main"><div class="li-title">' + esc2(r.round) + " vs " + esc2(r.opp) + '</div><div class="li-sub">' + r.myGoals + " : " + r.oppGoals + (r.pens ? "（点球 " + r.pens + "）" : "") + (won ? " · 胜" : " · 负") + "</div></div></div>";
      });
      if (wc.stage === "champion") html += '<div class="li-title" style="color:var(--gold);font-weight:800;text-align:center;padding:6px">世界冠军</div>';
      html += "</div>";
    }
    return html;
  }

  // 队长袖标判定：国家队出场 30+ 或单届大赛 5 球
  function checkCaptain(state) {
    const d = state.data;
    if (d.intl.captain) return true;
    const c = d.intl.career;
    const wcG = d.intl.wcStats ? d.intl.wcStats.goals : 0;
    const acG = d.intl.asiaCupStats ? d.intl.asiaCupStats.goals : 0;
    if (c.apps >= 30 || wcG >= 5 || acG >= 5) { d.intl.captain = true; return true; }
    return false;
  }

  // ════════════════════════════════════════════════════════════════════
  // ★★ P115 国家队年龄阶梯（用户拍板）：12~15 岁零国家队事件；16 岁进国少、
  //    18 岁进国青 —— 与现实「国少队→国青队→国家队」逐级走同构。
  //    ★ P300 更新：成年队门 18→16（青训期 16+ 放行）；级别互斥=更高级别优先
  //      （成年队出场后梯队窗口关闭，见 youthTick 门）；奥运会符合年龄必参赛（P295 通道）。
  //    梯队赛事 = 每年一个考察窗口 + 入选后 3 场系列赛（亚洲同龄对手，自动结算结果卡）。
  // ════════════════════════════════════════════════════════════════════
  const YOUTH_TIERS = {
    u17: {
      id: "u17", name: "国少队（U17）", series: "U17亚洲杯预选赛", minAge: 16, maxAge: 17,
      line: 40, winMonth: 10, winDay: 10,
      opps: ["日本", "韩国", "澳大利亚", "沙特阿拉伯", "伊朗", "卡塔尔", "阿联酋", "乌兹别克斯坦", "泰国", "越南", "印度尼西亚", "印度", "马来西亚", "约旦"],
    },
    u20: {
      id: "u20", name: "国青队（U20）", series: "U20亚洲杯预选赛", minAge: 18, maxAge: 20,
      line: 46, winMonth: 11, winDay: 12,
      opps: ["日本", "韩国", "澳大利亚", "沙特阿拉伯", "伊朗", "伊拉克", "卡塔尔", "乌兹别克斯坦", "约旦", "阿曼", "巴林", "泰国", "越南", "叙利亚"],
    },
  };
  const YOUTH_SERIES_N = 3;

  /** 梯队中国队强度：成年强度 ×0.78（青年队折损）+ 玩家超线贡献（你越强，队越强） */
  function youthChinaStrength(state, tier) {
    const p = state.data.player;
    const ovr = PlayerSystem.overall(p);
    const boost = Math.max(0, Math.min(6, (ovr - tier.line) * 0.3));
    return Math.max(30, Math.round(nationStrength("中国") * 0.78 + boost));
  }
  function youthOppStrength(opp) {
    return Math.max(28, Math.round(nationStrength(opp) * 0.78));
  }
  /** 玩家在梯队赛的个人表现（位置化概率，确定性读 R —— 与整场配对探针同源的噪声量级） */
  function youthPlayerLine(state, tier) {
    const d = state.data, p = d.player;
    const ovr = PlayerSystem.overall(p);
    const rel = ovr - tier.line;
    const atk = ["ST", "CF", "LW", "RW"].indexOf(p.position) >= 0 ? 1
      : ["CAM", "CM", "LM", "RM", "CDM"].indexOf(p.position) >= 0 ? 0.5
      : p.position === "GK" ? 0 : 0.25;
    const goalP = Math.max(0.02, Math.min(0.6, (0.16 + rel * 0.02) * atk * 2));
    const assistP = Math.max(0.02, Math.min(0.45, (0.10 + rel * 0.015) * atk * 2));
    const goals = R.chance(goalP) ? 1 : 0;
    const assists = !goals && R.chance(assistP) ? 1 : 0;
    const rating = Math.max(5.4, Math.min(9.2, 6.2 + rel * 0.06 + R.float(-0.4, 0.6)));
    return { goals, assists, rating: Math.round(rating * 10) / 10 };
  }

  /** 梯队考察窗口评估（每年每档一次；未达线首年给提示，之后静默） */
  function youthTick(state, year, month, day, today) {
    const d = state.data;
    const p = d.player;
    if (p.age < 16) return null;                       // ★ 16 岁 = 一切国字号事件的最低年龄
    const intl = ensureIntl(state);
    /* ★★ P300（兄弟拍板「更高级别优先」）：级别互斥——生涯已代表成年国家队出场
       （intl.career.apps>0）→ 国少/国青窗口全部关闭：跳级怪物不回头踢同龄段；
       国青 > 国少由年龄段天然成立（u17=16-17 / u20=18-20 无交叠，无需额外判定）。
       ★ 奥运会不在此限（P295 独立通道；「符合年龄必参赛」= P300 例外条款）。
       ★ 口径注：以「出场 apps>0」为升帐点（入选未出场的受伤/缺席极端态不锁门）。 */
    if (((intl.career && intl.career.apps) || 0) > 0) return null;
    for (const tier of Object.values(YOUTH_TIERS)) {
      if (p.age < tier.minAge || p.age > tier.maxAge) continue;
      if (month !== tier.winMonth || day < tier.winDay) continue;
      const key = tier.id + "-" + year;
      if (intl.youth[tier.id].years[key]) continue;
      intl.youth[tier.id].years[key] = {};
      const ovr = PlayerSystem.overall(p);
      if (d.injuryDays > 0) {
        return { title: tier.name + "考察无缘", plain: true, text: tier.series + " 的集训名单没有你——伤病未愈，医疗组没有放行。伤愈后用表现把名字赢回来。", effects: { morale: -3 } };
      }
      if (ovr >= tier.line) {
        // 征召：生成 3 场系列赛（+5/+8/+11 天，逐日自动结算）
        const myStr = youthChinaStrength(state, tier);
        const opps = [];
        const pool = tier.opps.slice();
        for (let i = 0; i < YOUTH_SERIES_N && pool.length; i++) {
          const opp = pool.splice(R.int(0, pool.length - 1), 1)[0];
          opps.push(opp);
          const mday = day + 5 + i * 3;
          let mo = month, dd = mday;
          while (dd > DIM[mo - 1]) { dd -= DIM[mo - 1]; mo++; }
          if (mo > 12) { mo = 12; dd = 31; }   // 防御：跨年回落到 12.31（窗口内实际不会触发；防"明年 1 月被今年 calNum 提前结算"）
          intl.youthPending.push({ tier: tier.id, year, month: mo, day: dd, opp, home: R.chance(0.5), idx: i, total: YOUTH_SERIES_N, played: false, myStr, yearKey: key });
        }
        try { if (window.News) News.onEvent(state, "callup", { player: p.name, comp: tier.name }); } catch (e) { /* ignore */ }
        return {
          title: "国足 · " + tier.name + "征召", plain: true,
          text: "你入选了 " + year + " " + tier.series + " 的" + tier.name + "集训名单，将连战 " + opps.join("、") + " 三支同龄对手。" + (ovr >= tier.line + 6 ? "教练组把你当进攻核心用。" : "教练组想看看你在同年龄段里的成色。"),
          effects: { fame: 300, morale: 6 },
        };
      }
      if (!intl.youth[tier.id].years[key + "-hint"]) {
        intl.youth[tier.id].years[key + "-hint"] = true;
        return {
          title: tier.name + "考察中", plain: true,
          text: tier.name + "教练组在关注你这个年龄段的孩子——考察线是总评 " + tier.line + "（你当前 " + Math.round(ovr) + "）。在俱乐部踢上比赛、把评分攒上去，明年窗口再来。",
          effects: { morale: 2 },
        };
      }
      return null;
    }
    return null;
  }

  /** 到期梯队比赛结算（逐日一场 → 结果卡；连场未上线时按日追平） */
  function youthResolveDue(state, today) {
    const d = state.data;
    if (!d.intl || !d.intl.youthPending || !d.intl.youthPending.length) return null;
    const fx = d.intl.youthPending.find(f => !f.played && today >= calNum(f.year, f.month, f.day));
    if (!fx) return null;
    const tier = YOUTH_TIERS[fx.tier];
    if (!tier) { fx.played = true; return null; }
    fx.played = true;
    const intl = ensureIntl(state);
    const oppStr = youthOppStrength(fx.opp);
    const [g1, g2] = quickScore(fx.myStr, oppStr);
    const myHome = fx.home;
    const gf = myHome ? g1 : g2, ga = myHome ? g2 : g1;
    const win = gf > ga, draw = gf === ga;
    fx.gf = gf; fx.ga = ga;   // ★ P115：比分落盘——收官总战绩必须复述真实已播报结果（重掷 = 编造）
    const perf = youthPlayerLine(state, tier);
    const yc = intl.youthCareer[fx.tier] || (intl.youthCareer[fx.tier] = { apps: 0, goals: 0, assists: 0 });
    yc.apps++; yc.goals += perf.goals; yc.assists += perf.assists;
    const fame = win ? 250 : draw ? 150 : 80;
    if (window.Career && Career.addFame) { try { Career.addFame(state, fame); } catch (e) { /* ignore */ } }
    d.expPool = (d.expPool || 0) + 2200;   // 梯队比赛经验（≈0.25 属性点等值 + 等级经验；★ P264：2500→2200 与主出口 MATCH_EXP 降幅对齐）
    const resTxt = (myHome ? gf + " : " + ga : ga + " : " + gf) + "（" + (win ? "胜" : draw ? "平" : "负") + "）";
    const perfTxt = perf.goals ? "你打进 " + perf.goals + " 球" : perf.assists ? "你送出 1 次助攻" : "你踢了 " + (R.chance(0.5) ? "全场" : "60 分钟") + "，评分 " + perf.rating.toFixed(1);
    /* 系列赛收官 = 最后一场附带总战绩（读**落盘比分**，与逐日战报严格一致） */
    let tail = "";
    if (fx.idx === fx.total - 1) {
      const done = d.intl.youthPending.filter(f => f.yearKey === fx.yearKey && f.played && typeof f.gf === "number");
      const w = done.filter(f => f.gf > f.ga).length;
      const dr = done.filter(f => f.gf === f.ga).length;
      tail = w + dr >= 2 ? "预选赛 " + w + " 胜 " + dr + " 平收官——出线！明年正赛名单里应该还会有你。" : "预选赛 " + w + " 胜 " + dr + " 平收官——未能出线，同龄段的竞争同样残酷。";
    }
    return {
      title: "国足 · " + tier.name + " · " + (win ? "战报" : "赛报"), plain: true,
      text: tier.series + "小组赛第 " + (fx.idx + 1) + " 轮，" + (fx.home ? "主场" : "客场") + "对阵" + fx.opp + " " + resTxt + "。" + perfTxt + "。" + tail,
      effects: { morale: win ? 4 : draw ? 1 : -2 },
    };
  }

  /** 梯队阶梯状态（hub 国家队页 / 属性页·球探 单源读取；纯只读） */
  function youthStatusOf(state) {
    const d = state && state.data;
    if (!d || !d.player) return null;
    const intl = ensureIntl(state);
    const tiers = [];
    for (const tier of Object.values(YOUTH_TIERS)) {
      const active = d.player.age >= tier.minAge && d.player.age <= tier.maxAge;
      tiers.push({
        id: tier.id, name: tier.name, line: tier.line, active,
        ageWindow: tier.minAge + "-" + tier.maxAge,
        career: (intl.youthCareer && intl.youthCareer[tier.id] && intl.youthCareer[tier.id].apps > 0) ? intl.youthCareer[tier.id] : null,
      });
    }
    const age = d.player.age;
    const note = age < 16
      ? "未满 16 岁不参加任何国字号考察——先在青年联赛练级。"
      : activeTierNote(d);
    return { tiers, note };
  }
  function activeTierNote(d) {
    const age = d.player.age;
    if (age <= 17) return "你正处于国少队（U17）考察年龄段——每年 10 月评估，考察线随名单竞争浮动。";
    if (age <= 20) return "你正处于国青队（U20）考察年龄段——每年 11 月评估；成年队（18+）与国青双通道并行。";
    return "已过梯队年龄段——国家队大门只看俱乐部与友谊赛表现。";
  }

  window.INTL = {
    onDay, takePendingEvent, tryCallup, ensureIntl, nationSquad, nationStrength,
    applyResult, onGroupComplete, advanceKO, settleAsiaCup, settleWcq36, settleR18, settlePlayoff,
    initWcq, initAsiaCup, initR18, initPlayoff, recordPlayerGoals,
    initWorldCup, settleWorldCup, advanceWcKO, checkCaptain, wcSummaryHtml,
    wcYearFor, calNum, pickDueMatch, wcFixtureForDate, asiaCupFixtureForDate, wcqFixtureForDate,
    youthTick, youthResolveDue, youthStatusOf,   // ★ P115 梯队阶梯
  };
})();
