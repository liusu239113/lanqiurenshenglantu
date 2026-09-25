/* ============================================================================
   fifa_points.js — FIFA SUM 积分体系 + 种子分档抽签（纯函数）
   规格：docs/休赛期消费体系与国足发展规格_v1.md §2.6

   红线：
     · 抽签**不得暗改**（禁止「降低遇强队概率」式隐藏修正）——强弱完全由积分与
       现实抽签规程决定
     · 抽签函数必须是纯函数 + 可注入随机源，否则无法写固定 seed 的断言
     · 本模块只负责「积分 / 排名 / 分档 / 抽签」；**比赛模拟用的强度是另一个数**
       （intl.js 的 nationStrength），两者不得混用

   本步（第一步）只交付模块与单测，**不接入实时抽签**（接入属第三步 §2.6.5）。
   ============================================================================ */
(function () {
  'use strict';

  /* ── 赛事重要性系数（FIFA 现行完整表，已联网核实） ── */
  const IMPORTANCE = {
    FRIENDLY_OUT: 5,    // 国际比赛日窗口之外的友谊赛
    FRIENDLY_IN: 10,    // 国际比赛日窗口之内的友谊赛
    NATIONS_GROUP: 15,  // 欧国联小组赛（本游戏无对应赛事）
    NATIONS_FINAL: 25,  // 欧国联附加赛/决赛
    QUALIFIER: 25,      // 各大洲杯赛预选赛 + 世界杯预选赛
    CONFED_PRE_QF: 35,  // 洲际杯赛决赛圈 1/4 决赛之前
    CONFED_QF_PLUS: 40, // 洲际杯赛决赛圈 1/4 决赛及之后（含联合会杯）
    WC_PRE_QF: 50,      // 世界杯决赛圈 1/4 决赛之前
    WC_QF_PLUS: 60,     // 世界杯决赛圈 1/4 决赛及之后
  };

  /* ── 初始积分映射（两点锚定，与真实 FIFA 积分同阶） ──
     强度 64（中国）→ 1250 ；强度 92（法国）→ 1850
     真实对照：日本 ~1650、韩国 ~1580、中国 ~1250、法国 ~1850 */
  const ANCHOR = { lo: 64, loPts: 1250, hi: 92, hiPts: 1850 };
  const SLOPE = (ANCHOR.hiPts - ANCHOR.loPts) / (ANCHOR.hi - ANCHOR.lo);
  function strengthToPoints(strength) {
    const s = Math.max(0, Math.min(100, strength || 60));
    return Math.max(900, Math.round(ANCHOR.loPts + (s - ANCHOR.lo) * SLOPE));
  }

  /* ── 洲际归属（用于抽签回避；依据现实所属大洲足联） ── */
  const CONFED = {};
  const put = (c, arr) => arr.forEach(n => { CONFED[n] = c; });
  put("AFC", ["日本", "韩国", "伊朗", "澳大利亚", "沙特阿拉伯", "卡塔尔", "伊拉克", "乌兹别克斯坦",
    "阿联酋", "约旦", "阿曼", "中国", "巴林", "越南", "泰国", "朝鲜", "印度尼西亚",
    "塔吉克斯坦", "吉尔吉斯斯坦", "科威特", "巴勒斯坦", "黎巴嫩", "新加坡", "也门",
    "叙利亚", "阿富汗", "马来西亚", "印度", "中国香港"]);
  put("UEFA", ["法国", "西班牙", "英格兰", "葡萄牙", "荷兰", "德国", "意大利", "比利时", "克罗地亚", "瑞士",
    "丹麦", "奥地利", "土耳其", "挪威", "塞尔维亚", "波兰", "瑞典", "捷克"]);
  put("CONMEBOL", ["阿根廷", "巴西", "乌拉圭", "哥伦比亚", "厄瓜多尔", "巴拉圭", "委内瑞拉", "秘鲁"]);
  put("CAF", ["摩洛哥", "塞内加尔", "尼日利亚", "埃及", "阿尔及利亚", "科特迪瓦",
    "喀麦隆", "突妮斯", "马里", "加纳", "布基纳法索"]);
  /* P81m 补全：此前 38 队未归类（confedOf → "OTHER"）→ ①不进任何洲际取数，世界杯池残缺
     ②东道主（如 2018 俄罗塞）匹配不到洲 → 靠兜底 push 入列 → 总数 33 超员 → 抽签不均 → 赛程越界崩溃 */
  put("AFC", ["菲律宾", "土库曼斯坦", "尼泊尔", "不丹", "马尔代夫", "关岛", "缅甸", "老挝", "柬埔寨",
    "蒙古", "文莱", "东帝汶", "巴基斯坦", "斯里兰卡", "孟加拉国", "中国台北", "中国澳门"]);
  put("CONMEBOL", ["智利"]);
  put("UEFA", ["希腊", "波黑", "俄罗塞", "乌克兰", "苏格兰", "爱尔兰", "威尔士", "北爱尔兰", "以色列",
    "保加利亚", "永恒城尼亚", "匈牙利", "斯洛伐克", "斯洛文尼亚"]);
  put("CAF", ["南非", "赞比亚", "刚果民主共和国", "安哥拉"]);
  put("OFC", ["斐济", "所罗门群岛"]);
  put("CONCACAF", ["墨西哥", "美国", "加拿大", "哥斯达黎加", "巴拿马", "牙买加", "洪都拉斯", "萨尔万多"]);
  put("OFC", ["新西兰", "新喀里多尼亚"]);
  function confedOf(nation) { return CONFED[nation] || "OTHER"; }

  /* ── 世界杯名额分配（双赛制，按届次取用） ──
     32 队制（2018/2022，现实官方）：UEFA 13（含东道主）/ CAF 5 / AFC 5（2022 含东道主卡塔尔）
       / CONMEBOL 5 / CONCACAF 4（含附加赛胜者）= 32
     48 队制（2026 起，现实官方方案）：UEFA 16 / CAF 9 / AFC 8 / CONMEBOL 6 / CONCACAF 6 / OFC 1
       = 46，+ 跨洲附加赛 2 = 48 */
  const WC_SLOTS = { UEFA: 16, CAF: 9, AFC: 8, CONMEBOL: 6, CONCACAF: 6, OFC: 1, PLAYOFF: 2 };
  const WC_SLOTS_32 = { UEFA: 13, CAF: 5, AFC: 5, CONMEBOL: 5, CONCACAF: 4, OFC: 0, PLAYOFF: 0 };
  function wcSlotsFor(year) { return (year || 2030) <= 2022 ? WC_SLOTS_32 : WC_SLOTS; }

  /* ── 世界杯东道主（按届次；现实未定届次按「无东道主、纯积分种子」处理） ── */
  const WC_HOSTS = {
    2018: ["俄罗塞"],                        // 现实：2018 俄罗塞（2014 起点世界）
    2022: ["卡塔尔"],                        // 现实：2022 卡塔尔
    2026: ["美国", "墨西哥", "加拿大"],        // 现实：2026 美加墨合办
    2030: ["西班牙", "葡萄牙", "摩洛哥"],   // 现实：摩洛哥/葡萄牙/西班牙主办，南美三国办开幕赛
    2034: ["沙特阿拉伯"],                    // 现实：2034 沙特阿拉伯
  };
  function hostsOf(year) { return (WC_HOSTS[year] || []).slice(); }

  function hostGroupAssign(hosts, groupCount) {
    const letters = "ABCDEFGHIJKL".slice(0, groupCount || 12);
    const m = {};
    (hosts || []).forEach((h, i) => { m[h] = letters[i]; });
    return m;
  }

  /**
   * 世界杯资格决定（纯函数，只读积分）
   * 各洲按积分取前 N；hosts / forced 强制入围（优先占本洲席位）；落选队积分最高的 2 支补足跨洲附加赛
   *
   * forced 的用途：玩家所在国（中国）**通过世预赛出线**的事实必须覆盖静态积分排名——
   * 否则按初始积分中国仅列亚洲第 12，永远进不了世界杯，玩家视角的整个赛事就不存在了。
   * 世预赛的胜负本身也会通过 applyMatch 累计进 FIFA 积分，两者是同一套体系，forced 只是兜底。
   *
   * @returns {{ teams:string[], byConfed:Object, playoff:string[], total:number }}
   */
  function qualifyWorldCup(state, hosts, forced, groupCount, wcYear) {
    hosts = hosts || [];
    const SLOTS = wcSlotsFor(wcYear);
    const force = (forced || []).filter(n => hosts.indexOf(n) < 0);
    ensurePoints(state);
    const teams = (window.NATIONS_DATA && NATIONS_DATA.teams) || {};
    const pool = Object.keys(teams);
    const byConfed = {};
    for (const c of Object.keys(SLOTS)) {
      if (c === "PLAYOFF") continue;
      byConfed[c] = pool.filter(n => confedOf(n) === c)
        .sort((a, b) => pointsOf(state, b) - pointsOf(state, a) || (a < b ? -1 : 1));
    }
    const picked = [];
    for (const c of Object.keys(byConfed)) {
      const need = SLOTS[c];
      const poolC = byConfed[c];
      const must = hosts.concat(force).filter(h => confedOf(h) === c);
      // 强制入围优先占位，其余按积分补足
      const take = must.concat(poolC.filter(n => must.indexOf(n) < 0)).slice(0, need);
      picked.push(...take);
    }
    hosts.concat(force).forEach(h => { if (picked.indexOf(h) < 0) picked.push(h); });
    // 跨洲附加赛：全局落选队按积分取前 N（48 队制 2 席；32 队制 0 席）
    const rest = pool.filter(n => picked.indexOf(n) < 0)
      .sort((a, b) => pointsOf(state, b) - pointsOf(state, a) || (a < b ? -1 : 1));
    const playoff = rest.slice(0, SLOTS.PLAYOFF);
    let all = picked.concat(playoff);
    /* P81m 防御：席位总和即硬上限（32/48）。任何数据缺口致超员时截断，
       但 hosts/forced 必须保留（否则东道主/中国可能被裁掉、抽签组数失衡）。 */
    const cap = Object.keys(SLOTS).reduce((a, k) => a + SLOTS[k], 0);
    if (all.length > cap) {
      const key = hosts.concat(force);
      all = key.filter(n => all.indexOf(n) >= 0)
        .concat(all.filter(n => key.indexOf(n) < 0))
        .slice(0, cap);
    }
    return { teams: all, byConfed, playoff, total: all.length };
  }

  /**
   * 「每组至少 1 支欧洲队」修复（现实抽签硬约束；仅做组内交换，不改变分档）
   * 做法：从「有 2 支欧洲队」的组取 1 支，与「0 支欧洲队」的组中的非欧洲队互换
   * @param {string[]} pin 不可移动的队（东道主——已被指派到指定组，交换会破坏落位）
   * @returns {boolean} 是否修复成功
   */
  function fixUefaMin(groups, groupNames, pin) {
    pin = pin || [];
    for (let guard = 0; guard < 200; guard++) {
      const none = groupNames.filter(g => groups[g].every(n => confedOf(n) !== "UEFA"));
      if (!none.length) return true;
      const two = groupNames.filter(g => groups[g].filter(n => confedOf(n) === "UEFA").length === 2);
      let moved = false;
      for (const e of none) {
        for (const f of two) {
          const donor = groups[f].find(n => confedOf(n) === "UEFA" && pin.indexOf(n) < 0);
          // 从 e 组挑一个「换到 f 组后不违反洲际限制」的队（东道主不参与）
          const recv = groups[e].find(x => confedOf(x) !== "UEFA" && pin.indexOf(x) < 0 &&
            confedOk(groups[f].filter(n => n !== donor), x));
          if (donor && recv) {
            groups[f] = groups[f].filter(n => n !== donor).concat(recv);
            groups[e] = groups[e].filter(n => n !== recv).concat(donor);
            moved = true;
            break;
          }
        }
        if (moved) break;
      }
      if (!moved) return false;
    }
    return false;
  }

  const defaultRng = () => (window.R && R.next ? R.next() : Math.random());

  /* ══════════ 积分 ══════════ */

  /** 存档惰性初始化：旧档没有 d.fifaPoints 时按强度表生成 */
  function ensurePoints(state) {
    const d = state.data;
    d.fifaPoints = d.fifaPoints || {};
    const teams = (window.NATIONS_DATA && NATIONS_DATA.teams) || {};
    for (const n of Object.keys(teams)) {
      if (typeof d.fifaPoints[n] !== "number") d.fifaPoints[n] = strengthToPoints(teams[n]);
    }
    return d.fifaPoints;
  }

  function pointsOf(state, nation) {
    const p = ensurePoints(state);
    return typeof p[nation] === "number" ? p[nation] : null;
  }

  /** 预期结果 We = 1 / (10^(−dr/600) + 1) */
  function expected(pa, pb) {
    return 1 / (Math.pow(10, -(pa - pb) / 600) + 1);
  }

  /**
   * 单场积分更新（纯函数，不写存档）
   * @param {number} pa  A 队赛前积分
   * @param {number} pb  B 队赛前积分
   * @param {object} m   { result:"win"|"draw"|"loss"（A 视角）, importance, knockout, pens:"a"|"b"|null }
   * @returns {{dA:number, dB:number, wa:number, wb:number, we:number}}
   */
  function matchDelta(pa, pb, m) {
    const I = (m && m.importance) || IMPORTANCE.QUALIFIER;
    let wa, wb;
    if (m && m.pens === "a") { wa = 0.75; wb = 0.5; }        // 点球：胜 0.75 / 负 0.5（非零和）
    else if (m && m.pens === "b") { wa = 0.5; wb = 0.75; }
    else {
      const r = (m && m.result) || "draw";
      wa = r === "win" ? 1 : r === "draw" ? 0.5 : 0;
      wb = 1 - wa;                                            // 正常比赛零和
    }
    const we = expected(pa, pb);
    let dA = I * (wa - we);
    let dB = I * (wb - (1 - we));
    // 附加条件：决赛圈淘汰赛 (W−We) < 0 则不掉分（保护晋级球队）
    if (m && m.knockout) {
      if (dA < 0) dA = 0;
      if (dB < 0) dB = 0;
    }
    return { dA, dB, wa, wb, we };
  }

  /** 应用到存档（写 d.fifaPoints），返回明细 */
  function applyMatch(state, a, b, m) {
    const pts = ensurePoints(state);
    const pa = pts[a] != null ? pts[a] : strengthToPoints(60);
    const pb = pts[b] != null ? pts[b] : strengthToPoints(60);
    const r = matchDelta(pa, pb, m);
    pts[a] = Math.round((pa + r.dA) * 100) / 100;
    pts[b] = Math.round((pb + r.dB) * 100) / 100;
    return {
      a: { name: a, before: pa, after: pts[a], delta: Math.round(r.dA * 100) / 100 },
      b: { name: b, before: pb, after: pts[b], delta: Math.round(r.dB * 100) / 100 },
    };
  }

  /** 排名（积分降序） */
  function ranking(state) {
    const p = ensurePoints(state);
    return Object.keys(p).map(n => ({ name: n, points: p[n] }))
      .sort((x, y) => y.points - x.points || (x.name < y.name ? -1 : 1));
  }
  function rankOf(state, nation) {
    const list = ranking(state);
    for (let i = 0; i < list.length; i++) if (list[i].name === nation) return i + 1;
    return null;
  }

  /* ══════════ 分档与抽签 ══════════ */

  /**
   * 分档：东道主强制进第 1 档；其余按积分降序切分
   * @returns {{ pots: string[][], rank: string[] }}
   */
  function buildPots(state, teams, potSize, hosts) {
    hosts = hosts || [];
    const ranked = ranking(state).map(x => x.name).filter(n => teams.indexOf(n) >= 0);
    const rest = ranked.filter(n => hosts.indexOf(n) < 0);
    const pots = [hosts.concat(rest.slice(0, potSize - hosts.length))];
    let i = potSize - hosts.length;
    while (i < rest.length) { pots.push(rest.slice(i, i + potSize)); i += potSize; }
    return { pots, rank: ranked };
  }

  /** 同组洲际限制：同洲最多 1 队；UEFA 例外，最多 2 队 */
  function confedOk(groupArr, cand) {
    const c = confedOf(cand);
    const same = groupArr.filter(n => confedOf(n) === c).length;
    return c === "UEFA" ? same < 2 : same < 1;
  }

  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /**
   * 抽签分组（纯函数，rng 可注入）
   * 逐档落位：第 pi 档的每支球队，只能落到「当前已有人数 === pi」的组。
   * 第 1 档时东道主已先占位（其组人数为 1），故其余第 1 档球队会自动避开东道主所在组。
   * @param {object} opt { teams, groupNames, hosts, hostGroups, rng, tries, noConfed }
   *        noConfed=true 时不施加洲际回避（用于亚洲杯等「全部同属一个洲际足联」的赛事，
   *        否则「同洲最多 1 队」会让抽签永远无解）
   * @returns {{ groups:Object|null, pots:string[][], attempts:number, relaxed:boolean, failed?:boolean }}
   */
  function drawGroups(state, opt) {
    const o = opt || {};
    const teams = o.teams || [];
    const groupNames = o.groupNames || "ABCDEFGHIJKL".split("").slice(0, Math.floor(teams.length / 4));
    const potSize = groupNames.length;
    const rng = o.rng || defaultRng;
    const maxTries = o.tries || 300;
    const hosts = o.hosts || [];
    const hostGroups = o.hostGroups || {};
    const noConfed = !!o.noConfed;
    const { pots } = buildPots(state, teams, potSize, hosts);

    for (let attempt = 1; attempt <= maxTries; attempt++) {
      const relaxed = attempt > Math.floor(maxTries / 2);   // 后半程放宽洲际限制
      const groups = {}; groupNames.forEach(g => { groups[g] = []; });
      /* 东道主先占位 */
      for (const h of hosts) {
        const g = hostGroups[h];
        if (g && groups[g]) groups[g].push(h);
      }
      let ok = true;
      for (let pi = 0; pi < pots.length && ok; pi++) {
        const list = shuffle(pots[pi].filter(t => !(pi === 0 && hosts.indexOf(t) >= 0 && hostGroups[t])), rng);
        for (const team of list) {
          const cands = groupNames.filter(g =>
            groups[g].length === pi && groups[g].indexOf(team) < 0 &&
            (noConfed || relaxed || confedOk(groups[g], team)));
          if (!cands.length) { ok = false; break; }
          groups[cands[Math.floor(rng() * cands.length)]].push(team);
        }
      }
      if (ok) {
        /* 完整性校验：不得重复、不得漏人 */
        const flat = groupNames.reduce((a, g) => a.concat(groups[g]), []);
        if (flat.length === teams.length && new Set(flat).size === teams.length) {
          // 世界杯额外硬约束：每组至少 1 支欧洲队（修复失败则换一次随机重抽）
          if (!o.uefaMin || noConfed || fixUefaMin(groups, groupNames, hosts)) {
            return { groups, pots, attempts: attempt, relaxed };
          }
        }
      }
    }
    return { groups: null, pots, attempts: maxTries, relaxed: true, failed: true };
  }

  /**
   * 前四名分流（2026 世界杯新增规则）：排名 1 与 2 进不同半区，3 与 4 亦同
   * 半区口径：groupNames 前半 = 上半区，后半 = 下半区
   * @returns {{ok:boolean, halves:Object}} halves: { name: "upper"|"lower" }
   */
  function top4Pathways(state, teams, groupNames) {
    const ranked = ranking(state).map(x => x.name).filter(n => teams.indexOf(n) >= 0);
    const top4 = ranked.slice(0, 4);
    const half = g => (groupNames.indexOf(g) < groupNames.length / 2 ? "upper" : "lower");
    const halves = {};
    if (top4[0]) halves[top4[0]] = "upper";
    if (top4[1]) halves[top4[1]] = "lower";
    if (top4[2]) halves[top4[2]] = "upper";
    if (top4[3]) halves[top4[3]] = "lower";
    return { ok: top4.length === 4, top4, halves, halfOf: half, note: "仅约束半区；具体组位由固定分配模式决定" };
  }

  window.FifaPoints = {
    IMPORTANCE, CONFED, strengthToPoints, confedOf,
    expected, matchDelta, applyMatch, ensurePoints, pointsOf, ranking, rankOf,
    buildPots, drawGroups, top4Pathways,
    // 世界杯赛事组织（2026-09-10 补）
    WC_SLOTS, WC_SLOTS_32, wcSlotsFor, WC_HOSTS, hostsOf, hostGroupAssign, qualifyWorldCup, fixUefaMin,   // P81m：补导出供探针/双端核对
  };
})();
