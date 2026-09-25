/* ============================================================================
   P97 M3 · 三层小游戏引擎（DuelEngine）
   ---------------------------------------------------------------------------
   ★ 数据全部来自 `js/duel_tables.js`（单一来源，审计脚本读同一份）。

   本文件：
     · L0 机会数量（公式）
     · 对手模型 γ（意图层 K 动态 + 执行层 R 伪随机 + 记忆衰减）
     · L1 创造机会（进攻侧，四选一）—— 3B
     · L2 破坏机会（防守侧，四选一）—— 3B
     · L3 射门六宫格（3 列 × 2 行）—— 3A 引擎 / 3B 拆为 prepare+resolve
     · `runMatch()` —— 供 match.js 调用的整场链（3B 起为**双向**：mine / theirs）
   3B 之后仍缺：L3 的"守门侧"（门将玩家扑点）、门将的 L1 开球发动、中场模式切换（3C）

   ★ 三条设计原则（用户已拍板，见 `P97_三个小游戏_重做方案_v0.1.md`）：
     ① 情报永远真实 —— 提示只说真话，宁可少给；**绝不喂假情报**
     ② 不对称靠给对手加智能，不靠削玩家
     ③ 每个小游戏都需要一个「会适应的对手」
   ============================================================================ */
(function () {
  const CFG = () => window.DUEL_TABLES || {};
  const RN = () => (window.R && window.R.next) ? window.R.next() : Math.random();
  const clamp = (v, lo, hi) => v < lo ? lo : (v > hi ? hi : v);
  const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  const norm = a => { const s = a.reduce((x, y) => x + y, 0); return s > 0 ? a.map(v => v / s) : a.map(() => 1 / a.length); };
  const GRID = () => CFG().L3.GRID;
  const euclid = (a, b) => Math.hypot(a.col - b.col, a.row - b.row);
  function weightedIdx(w) { let r = RN(), acc = 0; for (let i = 0; i < w.length; i++) { acc += w[i]; if (r < acc) return i; } return w.length - 1; }
  function gauss() { let u = 0, v = 0; while (!u) u = RN(); while (!v) v = RN(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  /** 泊松抽样（自带回退，不依赖 poissonSample 是否已加载） */
  function pois(lam) {
    if (typeof window.poissonSample === "function") return window.poissonSample(lam);
    const L = Math.exp(-lam); let k = 0, p = 1;
    do { k++; p *= RN(); } while (p > L);
    return k - 1;
  }

  /* ── 属性读取（池内守卫：缺项给默认值，绝不产生 NaN）── */
  function av(attrs, id, def) {
    const v = attrs && attrs[id];
    return (typeof v === "number" && !isNaN(v)) ? v : (def === undefined ? 50 : def);
  }
  function amid(attrs, ids, def) { return mean(ids.map(id => av(attrs, id, def))); }

  /* ★★ P222 整体功底（profAvg）+ 辅项并入：
     玩家 attrs（外场 35 键）= 全属性均值；对手档案（≤12 键）与门将池（13-14 键）
     低于 MIN_KEYS → 返回 null = 不并辅项（对手模型 P150/P167 校准零漂移）。
     权重表驱动：DUEL_TABLES.PROFILE（W12/W3/MIN_KEYS），审计脚本读同一份。 */
  function profAvg(attrs) {
    let sum = 0, n = 0;
    for (const k of Object.keys(attrs || {})) {
      const v = attrs[k];
      if (typeof v === "number" && !isNaN(v)) { sum += v; n++; }
    }
    return n ? sum / n : 60;
  }
  function profBlend(attrs, base, w) {
    if (!(w > 0)) return base;
    const P = CFG().PROFILE || {};
    let n = 0;
    for (const k of Object.keys(attrs || {})) {
      if (typeof attrs[k] === "number" && !isNaN(attrs[k])) n++;
    }
    if (n < (P.MIN_KEYS || 16)) return base;           // 对手档案/门将池：不并辅项
    return base * (1 - w) + profAvg(attrs) * w;
  }

  /* ══════════════════════════════════════════════════════════════════
     〇-α · ★★ P150（2026-09-19 用户拍板）两个单源钩子
     ------------------------------------------------------------------
     ① oppCore —— 同场对位软化：「同为青训期，对手不可能真的强的离谱」。
        四个对手档案函数（gkProfile/oppBackLine/oppDribbler/oppShooter）原本
        直接取 oppTeam.strength（一线队强度）当 AI 属性 —— 青训小将全场对位
        75 的成年队 ⇒ 概率被钳死在下限（基线实测 L1/L2 全 15%、L3 9%~16%）。
        修法：档案强度 = min(球队强度, 玩家全属性均值 + gap)。
        · 青训小将(50) vs 豪门(85) → 档案 66（对位"同龄级"对手）；
        · genius(50) → 66 ／ hotblood(39) → 55 —— 天才少年面对更强对手档案，
          靠真实属性差赢得更高概率（用户「天才少年概率更高」的主机制）；
        · 巅峰(85+) → 帽 101 不生效 —— 职业期对手强度 100% 保真。
        ★ 只软化「对位人档案」；deltaA 的球队级口径不动（机会数 λ 的对手防线
          是"我方跑位 vs 整条防线"的球队语义，取球队强度合理）。
     ② originBonusOf —— 出身微加成（表 DUEL_TABLES.OPPONENT.ORIGIN）：
        genius +3pt（广告解锁出身）/ sports +1.5pt / hotblood 0。
        消费点：l1WinP / l2BreakP / aimBaseOf 三处，全部走本函数（杜绝双源）。
        与 ① 的关系：①是主机制（genius 属性高 → 对手档案帽高 → ΔA/dlt 优），
        ②是锦上添花的直加，让"天才"的体感更直接。
     ══════════════════════════════════════════════════════════════════ */
  function oppCore(oppTeam, d) {
    const raw = (oppTeam && oppTeam.strength) || 70;
    const O = CFG().OPPONENT || {};
    const G = O.SOFTEN;
    /* ★ P152：gap 按出身分档（genius 12 / sports 14 / hotblood 16，缺省 16）——
       恒定 gap 会把三出身的相对难度拉平（天才优势被软化抵消，实测倒挂）；
       分档后天才面对更近的对位（Δ−12），hotblood 维持 Δ−16。 */
    let gap = (G && typeof G.gap === "number") ? G.gap : 16;
    if (G && G.gapByOrigin && d) {
      const oid = (d.origin && d.origin.id) || d.originId || "";
      const g2 = G.gapByOrigin[oid];
      if (typeof g2 === "number") gap = g2;
    }
    const attrs = (d && d.player && d.player.attrs) || {};
    let sum = 0, n = 0;
    for (const k of Object.keys(attrs)) {
      const v = attrs[k];
      if (typeof v === "number" && !isNaN(v)) { sum += v; n++; }
    }
    const mine = n ? sum / n : 70;
    const cap = mine + gap;
    /* ★★ P167：超出软化帽的对手强度**不再被 min 全抹平**——保留 residual（默认 0.25）
       传导。旧写法 min(raw, cap) 让弱玩家面对强 65/75/85 的档案全部=cap ⇒ 对手梯度
       为零（"一成不变"体感的根因）。帽内（raw ≤ cap）仍 100% 保真；
       巅峰期帽不触发，豪门恐惧感不丢。 */
    if (raw <= cap) return raw;
    const res = (G && typeof G.residual === "number") ? G.residual : 0.25;
    return cap + (raw - cap) * res;
  }
  function originBonusOf(d) {
    const tbl = CFG().OPPONENT && CFG().OPPONENT.ORIGIN;
    if (!tbl || !d) return 0;
    const oid = (d && ((d.origin && d.origin.id) || d.originId)) || "";
    const v = tbl[oid];
    return (typeof v === "number") ? v : 0;
  }
  /* ★★ P167 动态下限：青训 0.35 → 成年 0.30（用户拍板「成年队 30% 基础下限」）。
     · 相位主判据 = `d.phase`（senior=成年 / academy+jump=青训，与 Youth.isProtected 同语义；
       不直接依赖 Youth 模块 → vm 探针装载面无 youth.js 也可复现）；
     · mock/极旧档无 phase 时按年龄回落（<20 岁视同青训）；两样都没有 → 成年档；
     · 年龄 19→22 线性过渡（LO_RAMP）：刚毕业仍有青训下限余韵，22 岁起全成年档，无断崖。 */
  function loOf(d, layer) {
    const L = CFG()[layer] || {};
    const y = (L.LO_YOUTH != null) ? L.LO_YOUTH : ((L.LO != null) ? L.LO : 0.25);
    const s = (L.LO_SENIOR != null) ? L.LO_SENIOR : y;
    if (y === s) return y;
    const phase = d && d.phase;
    const age = d && d.player && d.player.age;
    let t;                                   // 0 = 青训档 → 1 = 成年档
    if (phase === "senior") t = 1;
    else if (phase === "academy" || phase === "jump") t = 0;
    else if (typeof age === "number") {
      const R = (L.LO_RAMP && L.LO_RAMP.length === 2) ? L.LO_RAMP : [19, 22];
      t = clamp((age - R[0]) / (R[1] - R[0]), 0, 1);
    } else t = 1;
    return y + (s - y) * t;
  }

  /* ══════════════════════════════════════════════════════════════════
     〇 · ★ 3C 竞技技能钩子（13 项）
     ------------------------------------------------------------------
     ★ 为什么要专门一层：P97 之前，技能全部挂在 match.js 的"常规概率"上；
       M3 把玩家进球的大头搬进机会链后，**旧钩子作用面被稀释到 15%** ——
       若不重挂，玩家会感觉"我练的技能够不到了"。
     ★ 口径：`bonus` = (星级/5) × 系数（5★ 拿满），`mult` = 1 + 同式；
       不是竞技的 5 项（stamina/durability/ironMan/actor/lockerRoom）不在此列。
     ★ 系数表在 `duel_tables.js` 的 `SKILL_GAIN`（单一来源，探针读同一份）。
     ══════════════════════════════════════════════════════════════════ */
  const SGAIN = () => (CFG().SKILL_GAIN || {});
  /** 技能线性加成（无 Skills 时安全回落 0） */
  function SKB(d, id, key) {
    const g = SGAIN()[id];
    if (!g || g[key] === undefined || !window.Skills || !d) return 0;
    try { return window.Skills.bonus(d, id, g[key]); } catch (e) { return 0; }
  }
  /** 技能星级（0~5） */
  function SKN(d, id) {
    if (!window.Skills || !d) return 0;
    try { return window.Skills.stars(d, id) || 0; } catch (e) { return 0; }
  }
  /** ★ 带 tag 维度的技能系数（如 `throughPass.l1WinTag.center`）—— 只有命中的 tag 才生效 */
  function SKBtag(d, id, key, tag) {
    const g = SGAIN()[id];
    if (!g || !g[key] || g[key][tag] === undefined || !window.Skills || !d) return 0;
    try { return window.Skills.bonus(d, id, g[key][tag]); } catch (e) { return 0; }
  }
  /** ★ 大场面 / 领袖：只在"关键战 + 我出场"时生效（否则这两个技能没有激活条件）
   *  ★ 只读存档上的**轻量标记**（`d._matchFlags`，由 match.js 写）——
   *    绝不持有 MatchEngine 实例：那会形成 d → engine → d 的循环引用（存档序列化会崩）。 */
  function stageOn(d) {
    const f = d && d._matchFlags;
    if (!f) return false;
    return !!(f.cup || f.key || (f.pressure || 0) > 0);
  }
  function isCaptain(d) { return !!(d && d.intl && d.intl.captain); }
  /** ★ P112：决断 → 四层通用"读心窗口"加成 —— 决断力高 = 更会挑（FM Decisions 语义）。
   *  70 属性=0；90 → +1.6（约半档提示）；50 → −1.6。老档/缺属性 → 0（零漂移）。 */
  function decisionsBonus(d) {
    const v = d && d.player && d.player.attrs && d.player.attrs.decisions;
    if (typeof v !== "number") return 0;
    return Math.max(-2, Math.min(3, (v - 70) * 0.08));
  }


  /* ══════════════════════════════════════════════════════════════════
     一 · L0 机会数量（用户口径：真实计算双方属性差，不套固定配额）
     ══════════════════════════════════════════════════════════════════ */
  /** ΔA = 我方进攻锐度 − 对手防守钝度（两侧均为均值差，口径见 DUEL_TABLES.L0） */
  function deltaA(d, oppTeam, userTeam) {
    const L = CFG().L0, attrs = (d.player && d.player.attrs) || {};
    const myPace = amid(attrs, L.selfPace) + SKB(d, "burstPace", "pace");   // ★ 3C 技能：爆发启动
    const passer = (userTeam && userTeam.strength) || 70;         // 传球者（队友）的输送能力
    const oppDef = (oppTeam && oppTeam.strength) || 70;           // 对手防线
    const oppPace = (oppTeam && oppTeam.strength) || 70;          // 对手回追速度
    const A = L.wSelfPace * myPace + L.wSelfPass * passer;
    const D = L.wOppDef * oppDef + L.wOppPace * oppPace;
    return A - D;
  }

  /** 本场机会数量（泊松抽样 + 神迹门槛 + 硬上限） */
  function opportunities(d, oppTeam, userTeam) {
    const L = CFG().L0;
    const dA = deltaA(d, oppTeam, userTeam);
    // ★ 3C 技能：跑位嗅觉 / 任意球大师 / 爆发启动 → 直接给机会数（"我能多跑出几次机会"）
    const skLam = SKB(d, "positioning", "opportunity") + SKB(d, "freeKick", "opportunity") + SKB(d, "burstPace", "opportunity");
    // ★ P112：定位球主罚 → 机会数 λ（属性版出口，与 freeKick 技能并行）
    //   ★ P114：角球/界外球并入任意球（属性 v4 只剩 freeKicks 一项，sp 表单键）——
    //     循环键随 sp 表的**实际键**走（sp 表加键即恢复多属性，零这里改动）。
    let spLam = 0;
    const sp = L.sp || {};
    {
      const attrsSp = (d.player && d.player.attrs) || {};
      for (const k of Object.keys(sp)) {
        if (k === "floor" || k === "cap") continue;
        const w = sp[k];
        const v = attrsSp[k];
        if (w && typeof v === "number") spLam += Math.min(sp.cap || 30, Math.max(0, v - (sp.floor || 60))) * w;
      }
    }
    const lam = clamp(L.base + dA * L.slope + skLam + spLam, L.lo, L.hi);
    let n = pois(lam);
    // ★ N = 5 是「九五之尊」级神迹 → 必须来自碾压 + 运气，不能只靠抽样
    //   ★★ P166：λ 上调后泊松会抽到 6+，原「n≥5 一律钳 5/4」让 hardCap=6 成死参数。
    //     补一档「历史级演出」：n≥6 也要过**同一道神迹门**（ΔA≥28 且二次掷骰 35%），
    //     不过门削到 5 —— 神迹门槛铁律不变，只是把 6 纳入门的管辖。
    if (n >= 6) {
      const G = L.miracleGate;
      // 历史级演出（6）与九五之尊（5）同一道门；不过门直接削出神迹区（4）——
      // ★ 首版写成"削到 5"会让低 ΔA 球员白捡 5 次（绕过 5 的门检），探针 A8 拦下。
      if (!(dA >= G.dA && RN() < G.pass)) n = 4;
    } else if (n >= 5) {
      const G = L.miracleGate;
      n = (dA >= G.dA && RN() < G.pass) ? 5 : 4;
    }
    let out = Math.min(n, L.hardCap);
    /* ★ P106-B：每场**至少** minGuarantee 次机会（默认 1）。
       为什么必须在这里兜底而不是只调 lo：lo 只是**期望 λ 的下限**，泊松抽样仍会抽到 0
       （λ=1.0 时 P(0)=36.8%）。而本函数只在 `userPerf.played` 为真时才被 runMatch 调用
       （duel.js:980），所以这里给 1 不会让"没出场的球员凭空拿到机会"。
       ★ 用户口径：「每一场都要做」—— 上了场就必须有得玩。 */
    if (L.minGuarantee && out < L.minGuarantee) out = L.minGuarantee;
    return { n: out, dA, lam, skLam };
  }

  /* ══════════════════════════════════════════════════════════════════
     二 · 破坏判定（3A 用公式；3B 换成 L2 小游戏）
     ══════════════════════════════════════════════════════════════════ */
  function isBroken(d, oppTeam) {
    const B = CFG().BREAK, attrs = (d.player && d.player.attrs) || {};
    const myBody = amid(attrs, B.selfBody);
    const oppBody = (oppTeam && oppTeam.strength) || 70;
    const p = clamp(B.base + (oppBody - myBody) * B.slope, B.lo, B.hi);
    return RN() < p;
  }

  /* ══════════════════════════════════════════════════════════════════
     三 · 对手模型 γ（意图层 + 执行层）
     ══════════════════════════════════════════════════════════════════ */
  /** 门将档案：3A 由球队强度折算（3C 可改为从真实阵容取 GK）
   *  ★ 字段名必须用**真实属性 id**（与玩家 attrs 同一套）——
   *    否则 Kof/Rof 里 av(gk, "positioning") 取不到值，会静默走默认 50，
   *    导致「K 由双方能力值决定」完全失效（2026-09-13 探针实测：门将 5 档 K 值全相同）。 */
  function gkProfile(oppTeam, d) {
    /* ★ P150：强度走 oppCore 同场对位软化（青训期对手门将不再是满强度一线队） */
    const s = clamp(oppCore(oppTeam, d) + gauss() * 2.5, 40, 95);
    return { reflexes: s, diving: s, handling: s, gkPositioning: s, kicking: s, overall: s };
  }

  /** ★ K 由「门将预判力 − 射手隐蔽力」决定（用户口径） */
  function Kof(gk, attrs) {
    const O = CFG().OPPONENT.K;
    const READ = amid(gk, O.read);
    const HIDE = amid(attrs, O.hide);
    return clamp(O.base + (READ - HIDE) * O.slope, O.lo, O.hi);
  }
  /** ★ 执行层：门将能"改正"多少（用他的反应 vs 你的力量） */
  function Rof(gk, attrs) {
    const O = CFG().OPPONENT.R;
    return clamp(O.base + (av(gk, O.attr) - av(attrs, O.against)) * O.slope, O.lo, O.hi);
  }

  /** 玩家的罚点习惯（6 桶，指数衰减 —— 半衰期 ≈ 8 次，所以"换招"真的有效） */
  function habitOf(d) {
    const h = d.pkStats && d.pkStats.habit;
    if (!h || h.length !== 6) {
      const seed = CFG().OPPONENT.MEMORY.seed;
      return [seed, seed, seed, seed, seed, seed];
    }
    return h.slice();
  }
  function bumpHabit(d, idx) {
    const M = CFG().OPPONENT.MEMORY;
    if (!d.pkStats) d.pkStats = { habit: null, n: 0 };
    if (!d.pkStats.habit || d.pkStats.habit.length !== 6) d.pkStats.habit = habitOf(d);
    const h = d.pkStats.habit;
    for (let i = 0; i < 6; i++) h[i] *= M.decay;
    h[idx] += 1;
    d.pkStats.n = (d.pkStats.n || 0) + 1;
  }

  /** 门将的实际倾向 T = (1−K)×基线（可见） ⊕ K×你的历史（★ 这部分隐藏） */
  function tendencyOf(d, gk, attrs) {
    const K = Kof(gk, attrs);
    const base = norm(CFG().OPPONENT.BASE_DIST.slice());
    const hist = norm(habitOf(d));
    return { T: norm(base.map((v, i) => (1 - K) * v + K * hist[i])), K };
  }

  /** 门将的实际扑救格：1−R 扑预判格；R 朝球的方向修正一格 */
  function gkReactNoRandom(pIdx, gIdx) {
    const G = GRID(), p = G[pIdx], g = G[gIdx];
    const nc = clamp(p.col + Math.sign(g.col - p.col), 0, 2);
    const nr = clamp(p.row + Math.sign(g.row - p.row), 0, 1);
    return G.findIndex(x => x.col === nc && x.row === nr);
  }
  function gkReactIdx(pIdx, gIdx, R) { return (RN() >= R) ? pIdx : gkReactNoRandom(pIdx, gIdx); }

  /** ★ 提示（概率语言，永远真实）：对「门将倾向 T」的概率描述，精度按 Δ 分档
   *   L4「他八成又往右下倒」= 80% 权重压在 T 的最高项上 + 20% 摊回 T
   *  → 提示说的就是概率本身，玩家不会因为"没中"而觉得被骗（这是 β 方案被推翻的教训） */
  function hintOf(dscore, th) {
    const t = th || CFG().L3.HINT.th;
    return dscore >= t[0] ? 4 : dscore >= t[1] ? 3 : dscore >= t[2] ? 2 : dscore >= t[3] ? 1 : 0;
  }
  function posteriorOf(lvl, T) {
    const G = GRID(), post = [0, 0, 0, 0, 0, 0];
    if (lvl < 0) { for (let i = 0; i < 6; i++) post[i] = 1 / 6; return post; }
    let argm = 0; for (let i = 1; i < 6; i++) if (T[i] > T[argm]) argm = i;
    let bc = 0, bs = -1, lc = 0, lsv = 1e9, br = 0, bsr = -1;
    for (let c = 0; c < 3; c++) { const s2 = T[c] + T[c + 3]; if (s2 > bs) { bs = s2; bc = c; } if (s2 < lsv) { lsv = s2; lc = c; } }
    for (let r = 0; r < 2; r++) { const s2 = T[r * 3] + T[r * 3 + 1] + T[r * 3 + 2]; if (s2 > bsr) { bsr = s2; br = r; } }
    const MIX = { 4: 0.80, 3: 0.72, 2: 0.65, 1: 0.58 };
    const m = MIX[lvl] !== undefined ? MIX[lvl] : 0.5;
    const hint = [0, 0, 0, 0, 0, 0];
    if (lvl >= 4) hint[argm] = 1;
    else if (lvl === 3) G.forEach((g, i) => { if (g.col === bc) hint[i] = 0.5; });
    else if (lvl === 2) G.forEach((g, i) => { if (g.row === br) hint[i] = 1 / 3; });
    else G.forEach((g, i) => { if (g.col !== lc) hint[i] = 0.25; });   // L1 = 排除一列
    return norm(hint.map((h, i) => m * h + (1 - m) * T[i]));
  }

  /* ══════════════════════════════════════════════════════════════════
     四 · L3 射门六宫格（prepare / resolve 两段式）
     ══════════════════════════════════════════════════════════════════ */
  /** ★ 强破判定（用户定稿三档式）：★ 必须从 3% 起累加，否则 Δp=16 会比 Δp=15 更容易被扑出 */
  function strongBreak(pow, gkRef, zone) {
    const S = CFG().L3.STRONG_BREAK;
    const dp = pow - gkRef;
    let p = dp <= S.t1 ? 0 : dp <= S.t2 ? S.floorP : S.floorP + (dp - S.t2) * S.k;
    p *= (S.zoneMul[zone] !== undefined ? S.zoneMul[zone] : 1);
    return clamp(p, 0, S.cap);
  }

  /** 抽一种机会类型（5 类：单刀/抢点/远射/凌空/头球 → 射门类 5 项全部有出口） */
  function rollShotType() {
    const types = CFG().L3.SHOT_TYPES;
    return types[weightedIdx(types.map(t => t.p))];
  }
  /** 该机会类型下的「射门技术」（决定打正率）
   *  ★ P222：并入整体功底辅项（W3）—— 窄科 build 打正率从钳顶回落，均衡成长不受影响 */
  function techOf(attrs, type) {
    const P = CFG().PROFILE || {};
    return profBlend(attrs, (av(attrs, type.main) + av(attrs, type.sub)) / 2, P.W3 || 0);
  }

  /** ★ 3C 技能 → 机会类型 的固定映射（`typeAim` 系数只作用于对应的机会类型） */
  const TYPE_SKILL = [["header", "header"], ["outsideBoot", "long"], ["freeKick", "long"], ["spring", "header"]]; // ★ P185：spring（弹簧腿）并联头球打正
  /** ★ 3C 技能对"打正率"的加成（weakFoot / penaltyKick 全类型，其余按类型） */
  function skillAimBonus(d, type) {
    if (!d || !window.Skills) return 0;
    let b = SKB(d, "weakFoot", "aim") + SKB(d, "penaltyKick", "aim");
    const tid = type && type.id;
    for (let i = 0; i < TYPE_SKILL.length; i++) if (TYPE_SKILL[i][1] === tid) b += SKB(d, TYPE_SKILL[i][0], "typeAim");
    if (stageOn(d)) b += SKB(d, "bigStage", "keyAim");   // ★ 大场面：关键战打正 +
    return b;
  }

  /** 打正率（★ 与模拟器同口径：基准不含格位系数，格位在 evalCell / 最终判定处乘）
   *  `d` 可选 —— 不传则退化为"纯属性口径"（审计脚本 / 对拍用）
   *  ★ P112：罚点球（penalties）→ 射门稳定度加成（±70 基准，90 属性约 +2pp）——
   *    点球主罚与运动战射门共享"把球打在门框内"的神经稳定度，这是它在球员侧的真实出口。 */
  function aimBaseOf(attrs, type, d) {
    const A = CFG().L3.AIM;
    const pen = typeof attrs.penalties === "number" ? (attrs.penalties - 70) * 0.001 : 0;
    const base = clamp(A.base + (techOf(attrs, type) - 62) * A.slope, A.lo, A.hi) * type.aimMul;
    /* ★ P150：打正率同样吃出身微加成（d 为 null 的审计对拍口径安全回落 0） */
    return clamp(base + pen + skillAimBonus(d, type) + originBonusOf(d), 0.05, 0.985);
  }
  function aimProbOf(attrs, type, cell, d) { return clamp(aimBaseOf(attrs, type, d) * cell.aim, 0.05, 0.985); }

  /** 评估"打某一格的期望进球率"（自动决策用）—— 与玩家看到的同一套机制
   *  ★★ 3C 修正两处 3A/3B 遗留的**静默错位**（两处都不报错、判据照绿）：
   *    ① 扑对方向那一支原写 `1 − sbAvg`，实际应是 `sbAvg`（强破**成功**率才是进球率）。
   *       写反 → 自动决策以为"被扑对也几乎必进" → 系统性绕开门将真正的倾向格。
   *    ② 格位系数原乘在**门将扑救格**上（`G[gIdx].aim`），但打正率取决于**射手打的那一格**
   *       （`G[p].aim`）—— 乘错对象 → 各格期望的排序整个失真。
   *    修好后，`shotAuto` 的最大化才真正等价于"最大化进球期望"。 */
  function evalCell(gIdx, post, R, spill, sbAvg, aimBase) {
    const G = GRID();
    let ev = 0;
    for (let p = 0; p < 6; p++) {
      const wp = post[p];
      if (wp <= 0) continue;
      const aimP = clamp(aimBase * G[p].aim, 0.05, 0.985);          // ★ 打正率看的是**他打的那格**
      const rIdx = gkReactNoRandom(p, gIdx);
      const d1 = euclid(G[gIdx], G[p]), d2 = euclid(G[gIdx], G[rIdx]);
      const g1 = d1 < 0.001 ? sbAvg : (d1 <= CFG().L3.COVER_R ? spill : 1);
      const g2 = d2 < 0.001 ? sbAvg : (d2 <= CFG().L3.COVER_R ? spill : 1);
      ev += wp * aimP * ((1 - R) * g1 + R * g2);                    // 打飞 = 0 球
    }
    return ev;
  }
  /** ★ 混合策略：真实玩家会在期望接近的格之间轮换（确定性最优 = 支配策略） */
  function softmaxPick(vals, temp) {
    const mx = Math.max.apply(null, vals);
    const ex = vals.map(v => Math.exp((v - mx) / temp));
    const sum = ex.reduce((a, b) => a + b, 0);
    let r = RN() * sum;
    for (let i = 0; i < vals.length; i++) { r -= ex[i]; if (r <= 0) return i; }
    return vals.length - 1;
  }

  /** ★ L3-① 准备：把所有随机量冻结（UI 与自动决策读同一份状态） */
  function shotPrepare(d, oppTeam, opts) {
    opts = opts || {};
    const L3 = CFG().L3, G = GRID();
    const attrs = (d.player && d.player.attrs) || {};
    const gk = opts.gk || gkProfile(oppTeam, d);
    const pw = av(attrs, "strength");
    const gkRef = av(gk, "reflexes"), gkHand = av(gk, "handling");
    const sbAvg = mean(G.map(g => strongBreak(pw, gkRef, g.zone)));
    const spill = clamp(L3.SPILL.base + (pw - gkHand) * L3.SPILL.slope, L3.SPILL.lo, L3.SPILL.hi);
    const type = opts.type || rollShotType();
    let aimBase = aimBaseOf(attrs, type, d);
    /* ★★ P151（用户拍板）：单刀机会 = 进球概率 ≈ 普通射门 ×2。
       落地 = 打正率 ×aimMul（钳 0.985）+ 门将反应修正 ×rMul（单刀直面门将、
       他来不及调整）—— 只作用于玩家运动战（此处）；L3GK 守门侧不放大。
       在 prepare 层改写 aimBase/R ⇒ evalCell（格上显示的期望）与
       shotResolve/shotAuto 全部自动跟随，无需各自判 type（单源）。 */
    const ten = tendencyOf(d, gk, attrs);
    let R = Rof(gk, attrs);
    if (type.breakaway) {
      const BA = L3.BREAKAWAY || { aimMul: 2.0, rMul: 0.5 };
      aimBase = clamp(aimBase * (BA.aimMul || 2), 0, 0.985);
      R = R * (BA.rMul != null ? BA.rMul : 0.5);
    }
    const K = ten.K;
    // ★ 3C 技能：阅读比赛 / 点球心跳 / 领袖之心 → 读心窗口 Δ（提示看得更准）
    // ★ P112：决断 → 提示窗口（四层通用）
    const skDscore = SKB(d, "gameReading", "dscore") + SKB(d, "penaltyNerve", "dscore")
      + (isCaptain(d) ? SKB(d, "leadersHeart", "captainDscore") : 0) + decisionsBonus(d);
    const dscore = ((techOf(attrs, type) + av(attrs, "composure")) / 2) - ((gkRef + av(gk, "gkPositioning")) / 2) + skDscore;
    const lvl = (opts.noHint === true) ? -1 : hintOf(dscore);
    // ★ 本局意图格：**只抽一次**（weightedIdx 消耗 RNG，抽两次会取到不同格且多耗随机流）
    const aiIntent = weightedIdx(ten.T);
    const post = posterior6(lvl, ten.T, aiIntent);
    const out = {
      kind: "L3", layer: "L3", d: d, myAttrs: attrs, gk: gk, type: type,
      T: ten.T, K: K, R: R, lvl: lvl, post: post, dscore: dscore,
      pw: pw, gkRef: gkRef, sbAvg: sbAvg, spill: spill, aimBase: aimBase,
      aiIntentIdx: aiIntent,   // ★ 门将意图（提示要揭示的就是它 —— 但他之后仍会朝你修一格）
      oppName: (oppTeam && oppTeam.name) || "对手",
      skDscore: skDscore,
      // ★ 3C 技能：点球专家 → 强破判定（力量对抗时更"顶"）；点球心跳 → 变招代价减免
      sbBonus: SKB(d, "penaltyKick", "strongBreak"),
      switchKeep: clamp(1 - SKB(d, "penaltyNerve", "switchSave"), 0.4, 1),
    };
    /* ★★ P116 点球大战模式（settlement 专用）：六格骨架完全复用，只换
       标题文案与结算入口（penaltyResolve）—— 命中率/罚点球属性在结算里体现。
       门控在 opts.penalty ⇒ 常规比赛的 shotPrepare 调用方零影响（R 流不变）。 */
    if (opts.penalty) {
      out.penalty = true;
      out.i18n = { title: "点球大战", sub: "你主罚——门将的习惯你能读多少，就看这条线索。" };
    }
    return out;
  }

  /** L3-② 结算（玩家选格；switchUsed = 看过揭示后改选，代价 ×SWITCH_PENALTY）
   *  ★ P151：opts.force = 「看广告直接进球」（duel_ui 广告完播回调）——
   *    **先正常掷骰再改写**（R 消耗序不变，探针/soak 基线零影响），adForce 标记供 UI。 */
  function shotResolve(st, pickIdx, switchUsed, opts) {
    const L3 = CFG().L3, G = GRID();
    const _force = !!(opts && opts.force);
    const i = clamp(pickIdx | 0, 0, 5);
    // ★ 变招代价：SPEC.SWITCH_PENALTY 是基线；「点球心跳」把它按比例往 1 拉
    const pen = CFG().SPEC.SWITCH_PENALTY;
    const sw = switchUsed ? (1 - (1 - pen) * (st.switchKeep === undefined ? 1 : st.switchKeep)) : 1;
    const p = clamp(st.aimBase * G[i].aim * sw, 0.02, 0.985);
    if (RN() >= p) {
      if (_force) return { goal: true, saved: false, off: false, pickIdx: i, gkIdx: st.aiIntentIdx,
        dist: 2, aimP: p, switchUsed: !!switchUsed, corrected: false, adForce: true };
      return { goal: false, saved: false, off: true, pickIdx: i, gkIdx: -1, aimP: p, switchUsed: !!switchUsed, corrected: false };
    }
    const gkIdx = gkReactIdx(st.aiIntentIdx, i, st.R);
    const dist = euclid(G[i], G[gkIdx]);
    let goal, strong = false, spilled = false;
    if (dist < 0.001) { goal = RN() < clamp(strongBreak(st.pw, st.gkRef, G[i].zone) + (st.sbBonus || 0), 0, CFG().L3.STRONG_BREAK.cap); strong = true; }
    else if (dist <= L3.COVER_R) { goal = RN() < st.spill; spilled = true; }                     // 擦到 → 脱手率
    else goal = true;                                                                           // 够不到 → 进
    const r = { goal: goal, saved: !goal, off: false, pickIdx: i, gkIdx: gkIdx, dist: dist, aimP: p,
      strong: strong, spilled: spilled, switchUsed: !!switchUsed, corrected: gkIdx !== st.aiIntentIdx };
    if (_force) { r.goal = true; r.saved = false; r.strong = false; r.spilled = false; r.adForce = true; }
    return r;
  }

  /** L3 自动决策（跳过比赛 / headless 探针 / 默认模拟） */
  function shotAuto(st) {
    const G = GRID();
    const vals = G.map(function (c, i) { return evalCell(i, st.post, st.R, st.spill, st.sbAvg, st.aimBase); });
    return softmaxPick(vals, CFG().SPEC.AUTO_TEMP);
  }

  /** ★ P175：给定"玩家打 i、门将在 si"的进球概率（★ 与 shotResolve 三段判定**同口径**）
   *  扑对（d≈0）→ 强破判定（含点球专家 sbBonus）；擦到（≤COVER_R）→ 脱手率 spill；够不到 → 必进 */
  function goalGiven(st, i, si) {
    const G = GRID(), L3 = CFG().L3;
    const d = euclid(G[i], G[si]);
    if (d < 0.001) return clamp(strongBreak(st.pw, st.gkRef, G[i].zone) + (st.sbBonus || 0), 0, L3.STRONG_BREAK.cap);
    if (d <= L3.COVER_R) return st.spill;
    return 1;
  }
  /** ★★ P175（用户红线「概率不要虚标」）：L3 射门的**显示表** —— 跨局真实频率口径。
   *  与 evalCell 的两处差别（都是「显示要真」的修正）：
   *  ① 权重用真实分布 T（对手本局意图就是从 T 抽的 → 跨局频率 = Σ T[s]×[...]），
   *     不用玩家的后验 post —— post 是 auto 决策的信念口径（auto 保持不偷看，
   *     动它 = 动 P97 门禁校准过的平衡基线），但玩家看到的数字必须蒙特卡洛可复现
   *     （P175 审计：post 口径系统性偏低 4~6pp，高格偏差 13~18pp）。
   *  ② 打正率系数用**玩家选的格**（G[i].aim，与 shotResolve 的 `aimBase * G[i].aim` 同源）
   *     —— evalCell 的 G[p].aim 是 3A 时代「p=射手格」语境的遗留（现在 p 循环的是门将
   *     倾向分布），打正率乘错对象 → 各格期望排序失真。
   *  消费点：仅 UI（duel_ui.ratesOf）。auto/探针/模拟基线继续走 evalCell —— 零漂移。 */
  function shotTable(st) {
    const G = GRID();
    return [0, 1, 2, 3, 4, 5].map(function (i) {
      const aimP = clamp(st.aimBase * G[i].aim, 0.05, 0.985);
      let ev = 0;
      for (let s = 0; s < 6; s++) {
        const w = st.T[s]; if (w <= 0) continue;
        const sF = gkReactNoRandom(s, i);
        ev += w * aimP * ((1 - st.R) * goalGiven(st, i, s) + st.R * goalGiven(st, i, sF));
      }
      return ev;
    });
  }
  /** ★★ P175：点球大战的显示表 —— penaltyResolve **单段命中模型**的真实命中率。
   *  此前 UI 复用运动战 evalCell（显示 ~25-30%）而真实判定是 0.74 基准（实测 ~60-66%）
   *  → 显示虚低 31pp（P175 审计实锤，用户「不要虚标概率」的核心病灶）。
   *  点球命中与门将站位无关（强破/脱手只影响结果标签不二次扣命中），所以每格 = p_i 常数。 */
  function penaltyTable(st) {
    const G = GRID();
    const penAttr = av(st.myAttrs, "penalties");
    const attrB = (penAttr - 60) * 0.0015;
    return [0, 1, 2, 3, 4, 5].map(function (i) { return clamp((0.74 + attrB) * G[i].aim, 0.40, 0.95); });
  }

  /** 兼容入口（自动决策一步到位）—— 探针与 3A 行为保持不变 */
  function shot(d, oppTeam, opts) {
    opts = opts || {};
    const st = shotPrepare(d, oppTeam, opts);
    const pickIdx = (typeof opts.pickIdx === "number") ? clamp(opts.pickIdx | 0, 0, 5) : shotAuto(st);
    const r = shotResolve(st, pickIdx, !!opts.switchUsed);
    return Object.assign({ type: st.type.id, hintLvl: st.lvl, K: st.K, R: st.R }, r);
  }

  /** ★★ P116 点球主罚（点球大战专用，settlement.startPenalties 调用）：
   *  **单段命中模型**——点球是「一次出脚定生死」，不走运动战的"打正→再被扑"两段乘法：
   *  · 总命中率 = (0.74 + 罚点球属性修正) × 格位 aim 系数 —— 真实点球转化 ≈75-78%，
   *    显著高于运动战（同骨架实测 ~19%）；打角带 aim≈1.05 → ~78%，中路 ~0.63；
   *  · 考察「罚点球」属性：60 = 零修正，每 +1 抬命中 ~0.15pt（90 → +4.5pt），
   *    属性差的点球手更容易把球送上看台（off 占比随属性递减）；
   *  · 「点球专家」「点球心跳」技能（sbBonus/switchKeep）与门将习惯阅读（后验/线索）照常生效；
   *  · 进球结果附 strong/spilled（门将扑对方向仍被洞穿/指尖脱手）供结算文案——**不再二次扣命中**。
   *  返回形状与 shotResolve 完全一致（goal/saved/off/pickIdx/gkIdx/strong/spilled），
   *  另带 penalty:true 供 UI 识别。常规比赛零调用 ⇒ 随机流/soak 基线不受影响。 */
  function penaltyResolve(st, pickIdx, switchUsed) {
    const L3 = CFG().L3, G = GRID();
    const i = clamp(pickIdx | 0, 0, 5);
    const pen = CFG().SPEC.SWITCH_PENALTY;
    const sw = switchUsed ? (1 - (1 - pen) * (st.switchKeep === undefined ? 1 : st.switchKeep)) : 1;
    const penAttr = av(st.myAttrs, "penalties");
    const attrB = (penAttr - 60) * 0.0015;
    const p = clamp((0.74 + attrB) * G[i].aim * sw, 0.40, 0.95);
    const gkIdx = gkReactIdx(st.aiIntentIdx, i, st.R);
    const dist = euclid(G[i], G[gkIdx]);
    if (RN() >= p) {
      /* 未进：打飞（off）vs 被扑（saved）分配 —— 属性差更容易打飞 */
      const offP = clamp(0.08 - (penAttr - 60) * 0.001, 0.03, 0.14);
      const off = RN() < offP;
      return { goal: false, saved: !off, off: off, pickIdx: i, gkIdx: gkIdx, dist: dist, aimP: p, penalty: true, switchUsed: !!switchUsed };
    }
    const strong = dist < 0.001, spilled = !strong && dist <= L3.COVER_R;
    return { goal: true, saved: false, off: false, pickIdx: i, gkIdx: gkIdx, dist: dist, aimP: p,
      strong: strong, spilled: spilled, penalty: true, switchUsed: !!switchUsed, corrected: gkIdx !== st.aiIntentIdx };
  }

  /* ══════════════════════════════════════════════════════════════════
     五 · 对手模型（4 选项层）—— ★ 规格与 L3 同一套，但由各层**各自调用**
        （用户 D10：三层完全独立实现，只共用规格；不共用一个"万能引擎"）
     ══════════════════════════════════════════════════════════════════ */
  /** K：AI 的读心强度（由他的读心属性 − 你的隐蔽属性决定） */
  function KofG(prof, attrs, spec) {
    const O = CFG().OPPONENT.K;
    const READ = amid(prof, spec.read), HIDE = amid(attrs, spec.hide);
    return clamp(O.base + (READ - HIDE) * O.slope, O.lo, O.hi);
  }
  /** R：AI 的执行修正（他能把自己挪多少） */
  function RofG(prof, attrs, spec) {
    const O = CFG().OPPONENT.R;
    return clamp(O.base + (av(prof, spec.attr) - av(attrs, spec.against)) * O.slope, O.lo, O.hi);
  }

  /** 4 选项习惯（★ 按层分开存 —— L1 的防守重心习惯 ≠ L2 的防守动作习惯） */
  function habit4(d, layer) {
    const M = CFG().OPPONENT.MEMORY;
    if (!d.pkStats) d.pkStats = { habit: null, n: 0 };
    if (!d.pkStats.habit4) d.pkStats.habit4 = {};
    const h = d.pkStats.habit4[layer];
    if (!h || h.length !== 4) d.pkStats.habit4[layer] = [M.seed, M.seed, M.seed, M.seed];
    return d.pkStats.habit4[layer].slice();
  }
  /** ★ 记忆只在**一局比赛结束时批量写入**（remember）——
   *  因为"自动决策预演"与"玩家实际选择"只能有一个进记忆，否则会写两次。
   *  ★ L3 走 6 桶（pkStats.habit），L1/L2 走各自 4 桶（pkStats.habit4[layer]） */
  function remember(d, entries) {
    const M = CFG().OPPONENT.MEMORY;
    for (const e of (entries || [])) {
      if (!e || e.idx === undefined || e.idx === null) continue;
      // ★ 3C：门将的扑救习惯 → 独立 6 桶（射手会读它，就像门将读射手）
      if (e.layer === "L3GK") {
        if (!d.pkStats) d.pkStats = { habit: null, n: 0 };
        const K = CFG().L3GK.MEM_KEY;
        if (!d.pkStats[K] || d.pkStats[K].length !== 6) d.pkStats[K] = habitGkOf(d);
        const h = d.pkStats[K];
        for (let i = 0; i < 6; i++) h[i] *= M.decay;
        h[clamp(e.idx | 0, 0, 5)] += 1;
        continue;
      }
      if (e.layer === "L3" || e.layer === undefined) {
        if (!d.pkStats) d.pkStats = { habit: null, n: 0 };
        if (!d.pkStats.habit || d.pkStats.habit.length !== 6) d.pkStats.habit = habitOf(d);
        const h = d.pkStats.habit;
        for (let i = 0; i < 6; i++) h[i] *= M.decay;
        h[clamp(e.idx | 0, 0, 5)] += 1;
        d.pkStats.n = (d.pkStats.n || 0) + 1;
      } else {
        habit4(d, e.layer);                       // 确保初始化
        if (!d.pkStats.habit4) d.pkStats.habit4 = {};
        const arr = d.pkStats.habit4[e.layer];
        for (let i = 0; i < 4; i++) arr[i] *= M.decay;
        arr[clamp(e.idx | 0, 0, 3)] += 1;
      }
    }
  }
  /** AI 的倾向 T = (1−K)×基线（可见档案） ⊕ K×你的历史（★ 这部分隐藏） */
  function tendency4(d, layer, prof, attrs, baseDist, kSpec, mapFn) {
    const K = KofG(prof, attrs, kSpec);
    const base = norm(baseDist.slice());
    let hist = norm(habit4(d, layer));
    if (typeof mapFn === "function") {
      const mapped = base.map(function () { return 0; });
      for (let i = 0; i < 4; i++) { const j = mapFn(i); if (j >= 0 && j < 4) mapped[j] += hist[i]; }
      hist = norm(mapped);
    }
    return { T: norm(base.map((v, i) => (1 - K) * v + K * hist[i])), K: K };
  }
  /** ★ 4 选项的"修正一格"：四个选项围成一圈，只往**最近**方向挪一格
   *  （隔太远就来不及补救 —— 这条与 L3 的二维网格修正**规则不同**，各自独立） */
  function ringShift(p, toward) {
    if (p === toward) return p;
    const diff = (toward - p + 4) % 4;
    if (diff === 1) return (p + 1) % 4;
    if (diff === 3) return (p + 3) % 4;
    return p;                       // 对角（diff 2）来不及
  }
  /** 4 选项提示分档：候选数 1 → 2 → 3 → 4（严格单调） */
  function hintLevel4(dscore, tiers) {
    const th = tiers || CFG().SPEC.HINT_TIERS4;
    return dscore >= th[0] ? 3 : dscore >= th[1] ? 2 : dscore >= th[2] ? 1 : 0;
  }
  /** ★ 提示 → 玩家对 AI 选择的后验（混合真实分布；绝不给假情报） */
  function posterior4(lvl, T) {
    if (lvl <= 0) return [0.25, 0.25, 0.25, 0.25];
    const MIX = { 3: 0.80, 2: 0.66, 1: 0.58 };
    const m = MIX[lvl];
    const order = [0, 1, 2, 3].sort((a, b) => T[b] - T[a]);
    const hint = [0, 0, 0, 0];
    if (lvl >= 3) hint[order[0]] = 1;
    else if (lvl === 2) { hint[order[0]] = 0.5; hint[order[1]] = 0.5; }
    else { hint[order[0]] = 1 / 3; hint[order[1]] = 1 / 3; hint[order[2]] = 1 / 3; }
    return norm(hint.map((h, i) => m * h + (1 - m) * T[i]));
  }

  /** AI 后卫线档案（★ 字段名一律用**真实属性 id** —— 拼错会静默取默认 50，前科见 gkProfile 注释） */
  function oppBackLine(oppTeam, d) {
    /* ★ P150：oppCore 同场对位软化 */
    const s = clamp(oppCore(oppTeam, d) + gauss() * 2.5, 40, 95);
    const P = CFG().L1.WEAK_SIDE_P;
    return {
      marking: s, concentration: s, positioning: s, anticipation: s, tackling: s, aggression: s,
      speed: s, stamina: s, strength: s, balance: s, agility: s,
      weakSide: RN() < P ? (RN() < 0.5 ? "left" : "right") : null,   // ★ 公开档案：他的弱侧
      overall: s,
    };
  }
  /** AI 持球人档案 */
  function oppDribbler(oppTeam, d) {
    /* ★ P150：oppCore 同场对位软化 */
    const s = clamp(oppCore(oppTeam, d) + gauss() * 2.5, 40, 95);
    return {
      dribbling: s, acceleration: s, speed: s, strength: s, passing: s,
      balance: s, agility: s, vision: s, offBall: s, firstTouch: s, overall: s,
    };
  }

  /** L1 的选项组（★ 按位置给不同集合 —— "每个位置都玩得到"的落点）
   *  ★ 3C：中场球员多一个 `mode` 维度 —— pass（传球组织）/ carry（持球推进），
   *    两套选项共用同一张克制表（按 tag），玩家只需记一套关系。 */
  const MID_POS = ["CAM", "CM", "CDM", "LM", "RM", "CB", "LB", "RB"];
  function l1Options(pos, mode) {
    const L1 = CFG().L1;
    if (pos === "GK") return L1.GK_KICK;
    if (MID_POS.indexOf(pos) >= 0) return mode === "carry" ? L1.MID_CARRY : L1.MID_PASS;
    return L1.STRIKER;
  }
  /** 该位置是否有"模式"概念（UI 据此决定要不要给切换按钮） */
  function l1HasMode(pos) { return MID_POS.indexOf(pos) >= 0; }
  /** ★ 读心映射 L1：你常用哪种过人/传球方式 → 他该重点防哪个重心 */
  function l1ReadMap(pos, mode) {
    const L1 = CFG().L1, opts = l1Options(pos, mode);
    return function (i) {
      const o = opts[i];
      if (!o) return -1;
      const target = L1.TAG_DENIED_BY[o.tag];
      for (let j = 0; j < L1.DEFEND.length; j++) if (L1.DEFEND[j].id === target) return j;
      return -1;
    };
  }
  /** ★ 3C：L1 的技能胜率加成（每选项一份，prepare 时算好 → `l1WinP` 保持纯函数） */
  function l1SkillWin(d, o) {
    let v = SKB(d, "skillMoves", "l1Win");
    v += SKBtag(d, "throughPass", "l1WinTag", o.tag);
    if (stageOn(d)) v += SKB(d, "bigStage", "keyWin");
    if (isCaptain(d)) v += SKB(d, "leadersHeart", "captainWin");
    return v;
  }
  /** 弱侧加成（★ 让"往左"和"往右"不是镜像 —— 否则四个选项里必有一个永远是废的） */
  function weakBonus(opt, weakSide, base) {
    if (!weakSide || !opt.side) return 0;
    if (opt.side === weakSide) return base;
    if (opt.side === "both") return Math.round(base / 2);
    return 0;
  }

  /** ★ 3C：切换 L1 的模式（传球组织 ↔ 持球推进）
   *  ★ 不重掷任何随机量（T/K/R/aiIntentIdx 一律保持）—— 理由：
   *    换的是"我拿什么能力去对抗"，对手的重心已经站定了，不该因我换招而重抽；
   *    若重抽会消耗 RNG 流 → 破坏"默认模拟 = baseline"这条结构不变量。 */
  function l1SetMode(st, mode) {
    if (!st || !st.hasMode) return st;
    const pos = (st.d && st.d.player && st.d.player.position) || "ST";
    st.mode = (mode === "carry") ? "carry" : "pass";
    st.options = l1Options(pos, st.mode);
    st.skillWin = st.options.map(function (o) { return l1SkillWin(st.d, o); });
    st.i18n = st.mode === "carry"
      ? { title: "持球推进", sub: "你选择自己带球解决问题" }
      : { title: "创造机会", sub: "他站住了，你得决定怎么过他" };
    // ★ 记住偏好：下次默认用这套（存档级）
    if (st.d && st.d.player) st.d.player.carryMode = (st.mode === "carry");
    return st;
  }

  /* ══════════════════════════════════════════════════════════════════
     七 · L1 创造机会（进攻侧）—— ★ 独立实现
       对抗：你选"怎么过/怎么传"，AI 后卫线选"防哪"
       张力博：**方式的风险收益 vs 防守重心**
     ══════════════════════════════════════════════════════════════════ */
  /** ★ P222：L1 score 并入整体功底辅项（W12）—— 机会创造不再只看 main/sub */
  function l1Score(attrs, o, W_MAIN, W_SUB) {
    const P = CFG().PROFILE || {};
    return profBlend(attrs, av(attrs, o.main) * W_MAIN + av(attrs, o.sub) * W_SUB, P.W12 || 0);
  }
  /** 给定"我选 i、AI 最终选 j"的胜率（不含变招惩罚） */
  function l1WinP(st, i, j) {
    const L1 = CFG().L1, SP = CFG().SPEC;
    const o = st.options[i], oo = st.defOptions[j];
    let c = 0;
    if (L1.TAG_BEATS[o.tag] === oo.id) c = 1;
    else if (L1.TAG_DENIED_BY[o.tag] === oo.id) c = -1;
    const wb = weakBonus(o, st.weakSide, L1.WEAK_FOOT_BONUS);
    // ★ 3C 技能：弱脚精度 → 两侧（有惯用侧的）突破选项的属性差
    const skScore = o.side ? SKB(st.d, "weakFoot", "l1SideScore") : 0;
    const dlt = l1Score(st.myAttrs, o, L1.W_MAIN, L1.W_SUB) - l1Score(st.defProfile, oo, L1.W_MAIN, L1.W_SUB)
      + c * SP.COUNTER_BONUS + wb + skScore;
    /* ★ P167：下限走 loOf(d)（青训 0.35 → 成年 0.30 动态分档），不再读常量 L1.LO */
    let p = clamp(L1.BASE + dlt * L1.SLOPE, loOf(st.d, "L1"), L1.HI);
    p += (st.skillWin || [])[i] || 0;     // ★ 3C 技能：花式技巧 / 手术刀传球 / 大场面 / 领袖之心
    p += originBonusOf(st.d);             // ★ P150 出身微加成（genius +3pt，单源）
    return clamp(p, 0.02, 0.97);
  }
  /** L1-① 准备 */
  function l1Prepare(d, oppTeam, opts) {
    opts = opts || {};
    const L1 = CFG().L1, attrs = (d.player && d.player.attrs) || {};
    const pos = (d.player && d.player.position) || "ST";
    // ★ 3C 中场模式：显式传入 > 存档偏好 > 默认传球
    const mode = opts.mode || ((d.player && d.player.carryMode) ? "carry" : "pass");
    const options = l1Options(pos, mode);
    const def = opts.defProfile || oppBackLine(oppTeam, d);
    const ten = tendency4(d, "L1", def, attrs, L1.DEF_BASE_DIST, L1.K, l1ReadMap(pos, mode));
    const R = RofG(def, attrs, L1.R);
    // Δ = 我方隐蔽力 − 对方读心力（与 K 同源，方向相反 → 我越会藏，提示越准）
    // ★ 3C 技能：阅读比赛 / 领袖之心 → 读心窗口；★ P112：决断 → 提示窗口
    const dscore = amid(attrs, L1.K.hide) - amid(def, L1.K.read)
      + SKB(d, "gameReading", "dscore") + (isCaptain(d) ? SKB(d, "leadersHeart", "captainDscore") : 0)
      + decisionsBonus(d);
    const lvl = (opts.noHint === true) ? -1 : hintLevel4(dscore, L1.HINT_TIERS);
    const obj = {
      kind: "L1", layer: "L1", d: d, myAttrs: attrs, options: options, defOptions: L1.DEFEND,
      defProfile: def, weakSide: def.weakSide, mode: mode, hasMode: l1HasMode(pos),
      skillWin: options.map(function (o) { return l1SkillWin(d, o); }),
      T: ten.T, K: ten.K, R: R, lvl: lvl, post: posterior4(lvl, ten.T), dscore: dscore,
      aiIntentIdx: weightedIdx(ten.T),
      oppName: (oppTeam && oppTeam.name) || "对手",
    };
    obj.i18n = mode === "carry"
      ? { title: "持球推进", sub: "你选择自己带球解决问题" }
      : (pos === "GK" ? { title: "开球发动", sub: "球在你脚下，全队等你发牌" }
        : { title: "创造机会", sub: "他站住了，你得决定怎么过他" });
    return obj;
  }
  /** L1-② 结算 ★ P151：opts.force = 看广告直接成功（过人/传球成功） */
  function l1Resolve(st, pickIdx, switchUsed, opts) {
    const SP = CFG().SPEC, L1 = CFG().L1;
    const i = clamp(pickIdx | 0, 0, 3), P = st.aiIntentIdx;
    const aiFinal = (RN() < st.R) ? ringShift(P, i) : P;
    let p = l1WinP(st, i, aiFinal);
    if (switchUsed) p *= SP.SWITCH_PENALTY;
    const win = (opts && opts.force) ? true : (RN() < p);
    const o = st.options[i], oo = st.defOptions[aiFinal];
    let c = 0;
    if (L1.TAG_BEATS[o.tag] === oo.id) c = 1; else if (L1.TAG_DENIED_BY[o.tag] === oo.id) c = -1;
    return { win: win, pickIdx: i, oppIdx: aiFinal, counter: c, p: p,
      weakBonus: weakBonus(o, st.weakSide, L1.WEAK_FOOT_BONUS),
      switchUsed: !!switchUsed, corrected: aiFinal !== P, adForce: !!(opts && opts.force) };
  }
  /** L1 自动决策（期望胜率 → 混合策略） */
  function l1Auto(st) {
    const R = st.R, T = st.T, vals = [0, 1, 2, 3].map(function (i) {
      let ev = 0;
      for (let P = 0; P < 4; P++) {
        const w = T[P]; if (w <= 0) continue;
        const corr = ringShift(P, i);
        ev += w * ((1 - R) * l1WinP(st, i, P) + R * l1WinP(st, i, corr));
      }
      return ev;
    });
    return softmaxPick(vals, CFG().SPEC.AUTO_TEMP4);
  }
  function l1AutoResolve(d, oppTeam, opts) {
    const st = l1Prepare(d, oppTeam, opts);
    const r = l1Resolve(st, l1Auto(st), false);
    return Object.assign({ st: st, lvl: st.lvl, K: st.K, R: st.R }, r);
  }

  /* ══════════════════════════════════════════════════════════════════
     八 · L2 破坏机会（防守侧）—— ★ 独立实现
       对抗：AI 持球人选一种进攻方式，你选一种防守方式
       张力博：**读他的下一步 vs 保守站位**
     ══════════════════════════════════════════════════════════════════ */
  function l2Options(pos) { return (window.Pool && Pool.isGk(pos)) ? CFG().L2.OPTIONS_GK : CFG().L2.OPTIONS; }
  function l2CounterOf(pos, id) {
    const L2 = CFG().L2;
    return (window.Pool && Pool.isGk(pos)) ? L2.COUNTER_GK[id] : L2.COUNTER[id];
  }
  /** ★ 读心映射 L2：你常用哪种防守方式 → 他该改用什么进攻方式去吃你 */
  function l2ReadMap(pos) {
    const L2 = CFG().L2, opts = l2Options(pos);
    return function (i) {
      const o = opts[i];
      if (!o) return -1;
      const co = l2CounterOf(pos, o.id);
      const weak = (co && co.weak && co.weak[0]) || null;
      if (!weak) return -1;
      for (let j = 0; j < L2.ATTACK.length; j++) if (L2.ATTACK[j].id === weak) return j;
      return -1;
    };
  }
  /** ★ P222：L2 score 并入整体功底辅项（W12）—— 对手档案（键数 < MIN_KEYS）自动跳过 */
  function l2Score(attrs, o) {
    const L2 = CFG().L2, P = CFG().PROFILE || {};
    return profBlend(attrs, av(attrs, o.main) * L2.W_MAIN + av(attrs, o.sub) * L2.W_SUB + av(attrs, o.aux) * L2.W_AUX, P.W12 || 0);
  }
  /** 给定"我选 i、AI 最终选 j"的破坏成功率 */
  function l2BreakP(st, i, j) {
    const L2 = CFG().L2, SP = CFG().SPEC;
    const o = st.options[i], ao = st.atkOptions[j];
    const co = st.counterOf[o.id] || { beats: [], weak: [] };
    let c = 0;
    if (co.beats.indexOf(ao.id) >= 0) c = 1; else if (co.weak.indexOf(ao.id) >= 0) c = -1;
    const dlt = l2Score(st.myAttrs, o) - l2Score(st.atkProfile, ao) + c * SP.COUNTER_BONUS;
    /* ★ P167：下限走 loOf(d)（与 L1 同口径） */
    let p = clamp(L2.BASE_PROB + dlt * L2.SLOPE, loOf(st.d, "L2"), L2.HI);
    p += (st.skillWin || [])[i] || 0;   // ★ 3C 技能：大场面 / 领袖之心
    p += originBonusOf(st.d);           // ★ P150 出身微加成（genius +3pt，单源）
    return clamp(p, 0.02, 0.97);
  }
  /** L2-① 准备 */
  function l2Prepare(d, oppTeam, opts) {
    opts = opts || {};
    const L2 = CFG().L2, attrs = (d.player && d.player.attrs) || {};
    const pos = (d.player && d.player.position) || "CB";
    const atk = opts.atkProfile || oppDribbler(oppTeam, d);
    const ten = tendency4(d, "L2", atk, attrs, L2.ATK_BASE_DIST, L2.K, l2ReadMap(pos));
    const R = RofG(atk, attrs, L2.R);
    // ★ 3C 技能：阅读比赛（防守侧）/ 领袖之心 → 读心窗口；★ P112：决断 → 提示窗口
    const dscore = amid(attrs, L2.K.hide) - amid(atk, L2.K.read)
      + SKB(d, "gameReading", "dscoreL2") + (isCaptain(d) ? SKB(d, "leadersHeart", "captainDscore") : 0)
      + decisionsBonus(d);
    const lvl = (opts.noHint === true) ? -1 : hintLevel4(dscore, L2.HINT_TIERS);
    const options = l2Options(pos);
    const counterOf = {};
    for (const o of options) counterOf[o.id] = l2CounterOf(pos, o.id);
    const keyWin = (stageOn(d) ? SKB(d, "bigStage", "keyWin") : 0)
      + (isCaptain(d) ? SKB(d, "leadersHeart", "captainWin") : 0);
    return {
      kind: "L2", layer: "L2", d: d, myAttrs: attrs, options: options, atkOptions: L2.ATTACK,
      atkProfile: atk, counterOf: counterOf,
      skillWin: options.map(function () { return keyWin; }),
      T: ten.T, K: ten.K, R: R, lvl: lvl, post: posterior4(lvl, ten.T), dscore: dscore,
      aiIntentIdx: weightedIdx(ten.T),
      oppName: (oppTeam && oppTeam.name) || "对手",
      i18n: { title: "破坏机会", sub: "他带球冲过来了，你选怎么处理" },
    };
  }
  /** L2-② 结算 ★ P151：opts.force = 看广告防守直接成功 */
  function l2Resolve(st, pickIdx, switchUsed, opts) {
    const SP = CFG().SPEC, L2 = CFG().L2;
    const i = clamp(pickIdx | 0, 0, 3), P = st.aiIntentIdx;
    const aiFinal = (RN() < st.R) ? ringShift(P, i) : P;
    let p = l2BreakP(st, i, aiFinal);
    if (switchUsed) p *= SP.SWITCH_PENALTY;
    const broken = (opts && opts.force) ? true : (RN() < p);
    const o = st.options[i], ao = st.atkOptions[aiFinal];
    const co = st.counterOf[o.id] || { beats: [], weak: [] };
    let c = 0;
    if (co.beats.indexOf(ao.id) >= 0) c = 1; else if (co.weak.indexOf(ao.id) >= 0) c = -1;
    return { broken: broken, pickIdx: i, oppIdx: aiFinal, counter: c, p: p,
      switchUsed: !!switchUsed, corrected: aiFinal !== P, adForce: !!(opts && opts.force) };
  }
  /** L2 自动决策 */
  function l2Auto(st) {
    const R = st.R, T = st.T, vals = [0, 1, 2, 3].map(function (i) {
      let ev = 0;
      for (let P = 0; P < 4; P++) {
        const w = T[P]; if (w <= 0) continue;
        const corr = ringShift(P, i);
        ev += w * ((1 - R) * l2BreakP(st, i, P) + R * l2BreakP(st, i, corr));
      }
      return ev;
    });
    return softmaxPick(vals, CFG().SPEC.AUTO_TEMP4);
  }
  function l2AutoResolve(d, oppTeam, opts) {
    const st = l2Prepare(d, oppTeam, opts);
    const r = l2Resolve(st, l2Auto(st), false);
    return Object.assign({ st: st, lvl: st.lvl, K: st.K, R: st.R }, r);
  }

  /** ★★★ 六宫格共用的后验：**贝叶斯条件分布**（给定提示信息后的真实条件概率）
   *  ------------------------------------------------------------------
   *  ★ 为什么不能用"硬指向 + 混合"（首版 `posteriorOf` 的做法）：
   *    那一版把命中的格记成 0.5 / 1，lvl 越高混合后的分布就比 T **更尖锐** ——
   *    于是自动决策（与按提示操作的玩家）死扑峰值格，而对手有 (1−R) 概率朝
   *    **远离我**的方向修正 → **信息越准反而越吃亏**。
   *    探针实测（同起点配对）：L3 顶级射手选格 **100% 锁死同一格**、提示增益 **−0.4pt**；
   *    L3GK 门将属性 75 的条件扑救率（46.6%）反而高于 85（40.1%）。
   *  ★ 贝叶斯版：先按提示给出的信息做**条件化**（`cond = mask × T` 再归一化），再与 T 混合。
   *    这样 post 永远是「T 在某个信息子集内的分布」，**比 T 更平或同尖，绝不更尖**，
   *    也就不存在"过度自信被反制"的悖论；"读透了"的语义由 MIX 承担，不由"假确定性"承担。
   *  ★ 三层各自独立实现（用户 D10）：L1/L2 的 `posterior4` 是另一套（它们的 auto 直接用
   *    `T` 算期望，所以从来没有这个问题）。
   */
  const BAYES_MIX = { 4: 0.72, 3: 0.62, 2: 0.55, 1: 0.45 };
  /** ★ 3C/3D「真值版」专用混合权重 —— **比 bayes 版温和得多**
   *  ★ 为什么：真值版揭示的是"本局他会扑哪"，信息强度远高于"长期分布"。
   *    首版直接套用 bayes 的权重（0.72）→ 顶级射手进球率飙到 62.6%、**门将被扑率掉到 9.7%**
   *    （门禁要 ≥15%）。"完全知道门将站哪"必然导致"射手必胜" —— 这是逻辑必然，
   *    所以确定性必须**封顶在"倾向"级别**，不能给到"结论"级别。
   *  ★ 口径：lvl4 也只是"他这一下八成往那倒"（post[i0] ≈ 0.45 + 0.55×T[i0]），
   *    他之后仍会朝你选的方向修正一格（R）→ 玩家还得赌"他改不改"。 */
  const TRUE_MIX = { 4: 0.28, 3: 0.24, 2: 0.20, 1: 0.16 };
  function posteriorBayes(lvl, T) {
    const G = GRID(), u = [1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6];
    if (lvl < 0) return u.slice();
    const m = BAYES_MIX[lvl] !== undefined ? BAYES_MIX[lvl] : 0.5;
    let argm = 0; for (let i = 1; i < 6; i++) if (T[i] > T[argm]) argm = i;
    let bc = 0, bs = -1, lc = 0, lsv = 1e9, br = 0, bsr = -1;
    for (let c = 0; c < 3; c++) { const s2 = T[c] + T[c + 3]; if (s2 > bs) { bs = s2; bc = c; } if (s2 < lsv) { lsv = s2; lc = c; } }
    for (let r = 0; r < 2; r++) { const s2 = T[r * 3] + T[r * 3 + 1] + T[r * 3 + 2]; if (s2 > bsr) { bsr = s2; br = r; } }
    const mask = [0, 0, 0, 0, 0, 0];
    if (lvl >= 4) mask[argm] = 1;
    else if (lvl === 3) G.forEach((g, i) => { if (g.col === bc) mask[i] = 1; });
    else if (lvl === 2) G.forEach((g, i) => { if (g.row === br) mask[i] = 1; });
    else G.forEach((g, i) => { if (g.col !== lc) mask[i] = 1; });
    const cond = mask.map((v, i) => v * T[i]);
    let s = 0; for (let i = 0; i < 6; i++) s += cond[i];
    if (s <= 0) return T.slice();
    const cN = cond.map(v => v / s);
    return norm(cN.map((h, i) => m * h + (1 - m) * T[i]));
  }

  /** ★★★ 3D 方案②：**真实意图分层揭示**（提示指的是"他**这一下**会往哪倒"）
   *  ------------------------------------------------------------------
   *  ★ 与 `posteriorBayes` 的本质区别：
   *    · bayes —— 提示描述**长期倾向分布 T**（跨局固定）→ 玩家仍要赌"这一局他抽到哪"；
   *      `T` 的峰度又低（0.26 vs 均匀 0.167），且不看提示的自动决策**已具备几何直觉**
   *      （打死角、避开中路）→ 实测"不看信息的最优策略"≈"看了信息的最优策略"，
   *      **信息价值趋零**（进球率口径的增益天花板只有 3.0pt，门禁要 8pt）。
   *    · true  —— 提示描述**本局真值**（`aiIntentIdx`）→ 提供的是"看不见就得不到"的信息。
   *  ★ 信息仍然**全是真话**：揭示的是他的**意图格**，他之后仍会朝你选的方向修正一格（R），
   *    所以"知道方向"≠"知道结果" —— 博弈深度保留（用户"情报永远真实"铁律的落点）。
   *  ★ 分层（候选数仍严格单调 1 → 2 → 3 → 4 → 6，与 `hintCells6` 同口径）：
   *    lvl4 = 意图格本身 ／ lvl3 = 含它的**列** ／ lvl2 = 含它的**行** ／ lvl1 = 排除一个不含它的列
   */
  function posteriorTrue(lvl, T, intentIdx) {
    const G = GRID();
    if (lvl < 0 || intentIdx === undefined || intentIdx === null || intentIdx < 0) return posteriorBayes(lvl, T);
    const i0 = clamp(intentIdx | 0, 0, 5), c0 = G[i0].col, r0 = G[i0].row;
    const m = TRUE_MIX[lvl] !== undefined ? TRUE_MIX[lvl] : 0.30;   // ★ 真值版专用（比 bayes 温和）
    const mask = [0, 0, 0, 0, 0, 0];
    if (lvl >= 4) mask[i0] = 1;
    else if (lvl === 3) G.forEach((g, i) => { if (g.col === c0) mask[i] = 1; });
    else if (lvl === 2) G.forEach((g, i) => { if (g.row === r0) mask[i] = 1; });
    else {
      let lc = -1;
      for (let c = 0; c < 3; c++) if (c !== c0) { lc = c; break; }   // 排除一个不含意图格的列
      G.forEach((g, i) => { if (g.col !== lc) mask[i] = 1; });
    }
    const cond = mask.map((v, i) => v * (T[i] || 1 / 6));
    let s = 0; for (let i = 0; i < 6; i++) s += cond[i];
    if (s <= 0) return posteriorBayes(lvl, T);
    const cN = cond.map(v => v / s);
    return norm(cN.map((h, i) => m * h + (1 - m) * T[i]));
  }

  /** 六宫格后验的统一入口 —— 按 `DUEL_TABLES.L3.HINT_MODE` 分派（"true" / "bayes"） */
  function posterior6(lvl, T, intentIdx) {
    return (CFG().L3.HINT_MODE === "bayes") ? posteriorBayes(lvl, T) : posteriorTrue(lvl, T, intentIdx);
  }
  /** 提示指向的候选格（UI 高亮用）—— 与 `posterior6` 同一套口径 */
  function hintCells6Mode(lvl, T, intentIdx) {
    if (CFG().L3.HINT_MODE === "bayes" || intentIdx === undefined || intentIdx === null || intentIdx < 0) {
      return hintCells6(lvl, T);
    }
    const G = GRID(), i0 = clamp(intentIdx | 0, 0, 5), c0 = G[i0].col, r0 = G[i0].row;
    if (lvl >= 4) return { kind: "one", cells: [i0] };
    if (lvl === 3) return { kind: "col", cells: G.map((g, i) => i).filter(i => G[i].col === c0), col: c0 };
    if (lvl === 2) return { kind: "row", cells: G.map((g, i) => i).filter(i => G[i].row === r0), row: r0 };
    if (lvl === 1) {
      let lc = -1;
      for (let c = 0; c < 3; c++) if (c !== c0) { lc = c; break; }
      return { kind: "notCol", cells: G.map((g, i) => i).filter(i => G[i].col !== lc), col: lc };
    }
    return { kind: "none", cells: G.map((g, i) => i) };
  }

  /* ══════════════════════════════════════════════════════════════════
     九 · L3-GK 守门侧（门将玩家扑点）—— ★ 独立实现，与 L3 镜像
       ------------------------------------------------------------------
       ★ 为什么必须做：门将在前三层里一次操作都没有（L1 创造 / L2 破坏
         考的都是外场属性）—— 不做这一层，门将玩家是"看完整场比赛的人"。
       ★ 镜像关系：
         L3   我选格 → 门将预判（K）+ 反应修正（R）→ 我射的那格
         L3GK 我选扑格 → 射手意图（Ks）+ 执行修正（Rc）→ 他打的那格
       判定三档与数值表（GRID / COVER_R / STRONG_BREAK / SPILL）**共用**，
       保证"打门"和"守门"手感一致；K/R 的属性组、倾向基线、习惯桶各自独立。
     ══════════════════════════════════════════════════════════════════ */
  /** AI 射手档案 */
  function oppShooter(oppTeam, d) {
    /* ★ P150：oppCore 同场对位软化 */
    const s = clamp(oppCore(oppTeam, d) + gauss() * 2.5, 40, 95);
    return {
      finishing: s, strength: s, composure: s, firstTouch: s,
      longShots: s, technique: s, heading: s, offBall: s, overall: s,
    };
  }
  /** 我的扑救习惯（6 桶）—— ★ 与射手习惯分桶存：同一份存档可能既当射手又当门将 */
  function habitGkOf(d) {
    const M = CFG().OPPONENT.MEMORY, K = CFG().L3GK.MEM_KEY, seed = M.seed;
    if (!d.pkStats) d.pkStats = {};
    const h = d.pkStats[K];
    if (!h || h.length !== 6) d.pkStats[K] = [seed, seed, seed, seed, seed, seed];
    return d.pkStats[K].slice();
  }
  /** 射手倾向 T = (1−Ks)×他的自然偏好 ⊕ Ks×(他读到的"我不爱扑哪")
   *  ★ 这条就是"对手有隐藏意图"在守门侧的落点：他会主动避开我的习惯。 */
  function tendencyGk(d, shooter, attrs) {
    const G = CFG().L3GK, O = CFG().OPPONENT.K;
    const READ = amid(shooter, G.K.read), HIDE = amid(attrs, G.K.hide);
    const Ks = clamp(O.base + (READ - HIDE) * O.slope, O.lo, O.hi);
    const base = norm(G.SHOOTER_DIST.slice());
    const mine = norm(habitGkOf(d));
    const inv = norm(mine.map(v => 1.25 - v));            // 我常扑的格 → 他少打
    return { T: norm(base.map((v, i) => (1 - Ks) * v + Ks * inv[i])), K: Ks };
  }
  /** 射手执行修正：他本想打 sIdx，看到我站 pIdx → 朝**远离我**的方向挪一格
   *  （与 L3 的 `gkReactNoRandom` 朝球挪一格互为镜像，规则各自独立） */
  function shooterShift(pIdx, sIdx) {
    const G = GRID(), p = G[pIdx], s = G[sIdx];
    if (!p || !s) return sIdx;
    let nc = s.col, nr = s.row;
    if (s.col === p.col && s.row === p.row) nc = clamp(s.col + (s.col <= 1 ? 1 : -1), 0, 2); // 完全重合 → 横向让开
    else { nc = clamp(s.col + Math.sign(s.col - p.col), 0, 2); nr = clamp(s.row + Math.sign(s.row - p.row), 0, 1); }
    return G.findIndex(x => x.col === nc && x.row === nr);
  }
  /** 我的扑救力（强破判定里的"门将侧"） */
  function mySavePower(attrs) {
    const W = CFG().L3GK.SAVE_W;
    return av(attrs, "reflexes") * W.reflexes + av(attrs, "diving") * W.diving;
  }
  /** ★ 该格的扑救力：主属性（反应） + **这一格绑定的门将技术**（`GRID.gkAttr`）
   *  ★ 为什么按格拆：`GRID.gkAttr` 从 3A 起就写在表里（上角→jumping / 下角→diving /
   *    中上→reflexes / 中下→handling），但一直没人读 —— 于是"六格"除了距离没有差别，
   *    "门将的弹跳/接球/下地"在扑救里完全没出口（用户要求"每条属性都要有用"）。
   *    拆开之后：上角吃弹跳、下角吃下地、中下吃接球 → 六格对同一个门将天然不等价。 */
  function mySavePowerAt(attrs, cell) {
    const W = CFG().L3GK.SAVE_W;
    const sec = av(attrs, (cell && cell.gkAttr) || "diving");
    return av(attrs, "reflexes") * W.reflexes + sec * W.diving;
  }
  /** 单格存活率：我扑 i、他打 si 时"这球没进"的概率（含他打飞） */
  function gkSaveP(st, i, si) {
    const G = GRID(), L3 = CFG().L3;
    const aimP = clamp(aimBaseOf(st.shooter, st.type, null) * G[si].aim, 0.05, 0.985);
    const miss = 1 - aimP;                                    // 他打飞 → 不进球
    const d = euclid(G[i], G[si]);
    let keep;
    if (d < 0.001) keep = 1 - clamp((st.sbByCell || [])[i] !== undefined ? st.sbByCell[i]
      : strongBreak(av(st.shooter, "strength"), st.myPow, G[i].zone), 0, 1);   // 扑对 → 力量对抗（按格）
    else if (d <= L3.COVER_R) keep = 1 - st.spill;            // 擦到 → 我脱不脱手
    else keep = 0;                                            // 够不到
    return miss + aimP * keep;
  }
  /** L3GK-① 准备（选项冻结，UI 与自动决策读同一份状态） */
  function gkPrepare(d, oppTeam, opts) {
    opts = opts || {};
    const G = CFG().L3GK, O = CFG().OPPONENT.R, attrs = (d.player && d.player.attrs) || {};
    const shooter = opts.shooter || oppShooter(oppTeam, d);
    const ten = tendencyGk(d, shooter, attrs);
    const Rc = clamp(O.base + (av(shooter, "strength") - av(attrs, O.against)) * O.slope, O.lo, O.hi);
    const myPow = mySavePower(attrs);
    const type = opts.type || rollShotType();
    // ★ 每格的门将侧力量不同（上角吃弹跳 / 下角吃下地 / 中下吃接球）→ 六格天然不等价
    const sbByCell = GRID().map(g => strongBreak(av(shooter, "strength"), mySavePowerAt(attrs, g), g.zone));
    const sbAvg = mean(sbByCell);
    const spill = clamp(CFG().L3.SPILL.base + (av(shooter, "strength") - av(attrs, "handling")) * CFG().L3.SPILL.slope,
      CFG().L3.SPILL.lo, CFG().L3.SPILL.hi);
    // Δ = 我的读心力 − 他的隐蔽力（+ 技能 + 决断 + ★ P171 扑救直觉天赋）
    const dscore = amid(attrs, G.READ.me) - amid(shooter, G.READ.him)
      + SKB(d, "gameReading", "dscore") + (isCaptain(d) ? SKB(d, "leadersHeart", "captainDscore") : 0)
      + decisionsBonus(d)
      + ((window.TAL && TAL.gkIntuition) ? (TAL.gkIntuition(d) || 0) : 0);
    const lvl = (opts.noHint === true) ? -1 : hintOf(dscore, G.HINT_TH);
    const aiIntent = weightedIdx(ten.T);
    return {
      kind: "L3GK", layer: "L3GK", d: d, myAttrs: attrs, shooter: shooter, type: type,
      T: ten.T, K: ten.K, R: Rc, lvl: lvl, post: posterior6(lvl, ten.T, aiIntent), dscore: dscore,
      myPow: myPow, sbAvg: sbAvg, sbByCell: sbByCell, spill: spill,
      aiIntentIdx: aiIntent,
      oppName: (oppTeam && oppTeam.name) || "对手",
      i18n: { title: "扑救", sub: "他助跑过来了 —— 你往哪边倒？" },
    };
  }
  /** L3GK-② 结算（玩家选扑救格） */
  /** ★ P151：opts.force = 看广告直接扑出（gkResolve 也先正常掷骰再改写，R 序不变） */
  function gkResolve(st, pickIdx, switchUsed, opts) {
    const _force = !!(opts && opts.force);
    const G = GRID();
    const i = clamp(pickIdx | 0, 0, 5);
    st.pickIdx = i;
    const si = (RN() < st.R) ? shooterShift(i, st.aiIntentIdx) : st.aiIntentIdx;
    const aimP = clamp(aimBaseOf(st.shooter, st.type, null) * G[si].aim, 0.05, 0.985);
    if (RN() >= aimP) {
      if (_force) return { saved: true, conceded: false, pickIdx: i, shooterIdx: si, off: false,
        dist: euclid(G[i], G[si]), aimP: aimP, strong: false, spilled: false, switchUsed: !!switchUsed, adForce: true };
      return { saved: true, conceded: false, pickIdx: i, shooterIdx: si, off: true,
        dist: euclid(G[i], G[si]), aimP: aimP, strong: false, spilled: false, switchUsed: !!switchUsed };
    }
    const d = euclid(G[i], G[si]);
    let conceded, strong = false, spilled = false;
    if (d < 0.001) { conceded = RN() < clamp((st.sbByCell || [])[i] !== undefined ? st.sbByCell[i]
      : strongBreak(av(st.shooter, "strength"), st.myPow, G[i].zone), 0, CFG().L3.STRONG_BREAK.cap); strong = true; }
    else if (d <= CFG().L3.COVER_R) { conceded = RN() < st.spill; spilled = true; }
    else conceded = true;
    const r = { saved: !conceded, conceded: conceded, pickIdx: i, shooterIdx: si, off: false,
      dist: d, aimP: aimP, strong: strong, spilled: spilled, switchUsed: !!switchUsed };
    if (_force) { r.saved = true; r.conceded = false; r.adForce = true; }
    return r;
  }
  /** L3GK 自动决策（门将视角：最大化"球没进"的期望） */
  function gkAuto(st) {
    const vals = [0, 1, 2, 3, 4, 5].map(function (i) {
      let succ = 0;
      for (let s = 0; s < 6; s++) {
        const w = st.post[s]; if (w <= 0) continue;
        const sF = shooterShift(i, s);
        succ += w * ((1 - st.R) * gkSaveP(st, i, s) + st.R * gkSaveP(st, i, sF));
      }
      return succ;
    });
    return softmaxPick(vals, CFG().SPEC.AUTO_TEMP);
  }
  function gkAutoResolve(d, oppTeam, opts) {
    const st = gkPrepare(d, oppTeam, opts);
    const r = gkResolve(st, gkAuto(st), false);
    return Object.assign({ st: st, lvl: st.lvl, K: st.K, R: st.R }, r);
  }
  /** 门将开球发动（L1 的 GK 分支）→ 按选项 tag 折算的"这次发动打成助攻"的概率
   *  ★ 为什么产物是助攻而不是进球：门将的定位是"发动者"，
   *    让他直接改比分结构会破坏"球队总进球 = 配额"这条结构不变量。 */
  function gkKickBonus(d, opt) {
    const G = CFG().L1.GK_KICK_BONUS;
    let v = G.base;
    if (opt) v += SKBtag(d, "throughPass", "l1WinTag", opt.tag) * 1.5;   // 手术刀传球：发动更准
    if (stageOn(d)) v += SKB(d, "bigStage", "keyWin");
    return clamp(v, G.lo, G.hi);
  }

  /* ══════════════════════════════════════════════════════════════════
     八 · 整场链（供 match.js 调用）★ 3B 起为**双向**
       mine   我方机会链：L0 数量 → L1 创造 → L3 终结
       theirs 对手威胁机会：L2 破坏（★ 让防守位球员也有游戏玩）
     ══════════════════════════════════════════════════════════════════ */
  /**
   * @returns {{mine:Array, theirs:Array}}
   *   mine[i]   = {idx, minute, layer, prep, pick:{L1,L3}, goal, blocked, l1, l1Prep}
   *   theirs[i] = {idx, minute, layer, prep, pick:{L2}, autoBroken, broken}
   *   ★ `goal` / `broken` 是**当前生效结果**（先按自动决策填，玩家手动后由 match.js 覆盖）
   */
  /* ══════════════════════════════════════════════════════════════════
     ★ P106-B（2026-09-17）：助攻通道 —— 机会链此前**只有进球通道**
     ------------------------------------------------------------------
     背景：射门类关键时刻（单刀/点球/任意球/绝杀）删掉后，玩家助攻从 0.36
     掉到 0.06 球/场（中场 0.29 → 0.03），中场/边路球员彻底失去存在感。
     根因：机会链 mine 侧只有 L3「进 / 不进」两个落点，压根没有助攻这一维。

     语义：你创造的机会没直接进球，但球没死 —— 横传 / 被扑后队友补射入网 = 你的助攻。
     ★★ 单源纪律：本函数由 `duel.js`（baseline）与 `match.js`（玩家手动后的派生）
        共用**同一套参数** —— 两边各写一份就会退化成"默认模拟漂移"的老毛病。
     ★ 参数口径：位置决定基准（中场/边路爱传、中锋爱射），视野/短传再修一点。
     ══════════════════════════════════════════════════════════════════ */
  const ASSIST_DERIVE = {
    ST: 0.10, CF: 0.13, LW: 0.18, RW: 0.18,
    CAM: 0.22, CM: 0.24, LM: 0.22, RM: 0.22, CDM: 0.20,
    CB: 0.14, LB: 0.16, RB: 0.16, GK: 0,
  };
  function assistConvertP(d, usr) {
    const pos = (d && d.player && d.player.position) || "CM";
    const a = (d && d.player && d.player.attrs) || {};
    let p = ASSIST_DERIVE[pos] != null ? ASSIST_DERIVE[pos] : 0.18;
    const vis = a.vision != null ? a.vision : 60;
    p += (vis - 60) * 0.002;                       // 视野 ±0.05 量级
    const team = (usr && usr.strength) || 70;
    p += (team - 70) * 0.003;                      // 队友越强，越能把你的球送进去
    p += SKB(d, "throughPass", "assist");          // 手术刀传球：+（见 SKILL_GAIN）
    return clamp(p, 0.02, 0.55);
  }

  /* ══════════ P109（2026-09-17 用户拍板）：传球 ≠ 过人 —— pass 赢下 = 队友终结 ══════════
     背景：L1 的中场"传球组织"模式赢下后，原来照样接**玩家自己的** L3 单刀
     （"过掉他了——现在只有你和门将"）——传球成功之后不该由你自己出现在射门点上。
     语义修正：pass 模式赢下 = 撕开防线送出威胁球 → **队友**接球终结：
       · 队友转化 → 球进（记你一次**助攻**），条目占球队进球配额（守恒不变）；
       · 队友没吃饼 → 机会浪费（与 carry 打飞同待遇，patchDuelGoal 改写成错失良机）。
     carry 模式（持球推进）与前锋（STRIKER，无模式）赢下后**仍接玩家自己的 L3** —— 过人单刀。
     ★ 单源：baseline（runMatch）与手动（match.js duelStep）共用 mateFinishP —— 零漂移纪律。 */
  const MATE_FINISH = {
    base: 0.22,        // 威胁球传出后队友的吃饼率基准（★ P222b 收紧：原 0.34 使最优经营 CM 助攻 1.09/场（单季 37+，超助攻王门槛 5 倍 = 荣誉通胀）→ 0.22 回到巨星档 0.6-0.7/场；球队总进球守恒不受影响——没吃饼=错失良机，条目仍占配额）
    teamSlope: 0.004,  // 队友强度修正：strength 70±25 → ±0.10
    lo: 0.12, hi: 0.40,
  };
  function mateFinishP(d, usr) {
    const team = (usr && usr.strength) || 70;
    // ★ P112：团队合作（配合默契）与领导力（以身作则）→ 队友更愿意/更能把你的球送进去
    const a = (d && d.player && d.player.attrs) || {};
    const tw = typeof a.teamwork === "number" ? a.teamwork : 70;
    const ld = typeof a.leadership === "number" ? a.leadership : 70;
    return clamp(MATE_FINISH.base + (team - 70) * MATE_FINISH.teamSlope
      + (tw - 70) * 0.0015 + (ld - 70) * 0.0008, MATE_FINISH.lo, MATE_FINISH.hi);
  }

  /* ── P109：各层"选项成功率表"（供 UI 展示，口径 = 引擎同源，UI 绝不自算概率）──
     · 期望口径与 l1Auto/l2Auto/gkAuto 完全一致：Σ_j post[j] × [(1−R)·p(i,j) + R·p(i,corr(j))]，
       唯一差别是 auto 用真实分布 T、这里用**玩家的后验 post**（lvl=0 即均匀）——
       显示的是"以你目前掌握的情报"这一招的成功率，不偷看上帝视角。 */
  function l1WinTable(st) {
    const R = st.R, post = st.post || st.T;
    return [0, 1, 2, 3].map(function (i) {
      let ev = 0;
      for (let P = 0; P < 4; P++) {
        const w = post[P]; if (w <= 0) continue;
        const corr = ringShift(P, i);
        ev += w * ((1 - R) * l1WinP(st, i, P) + R * l1WinP(st, i, corr));
      }
      return ev;
    });
  }
  function l2BreakTable(st) {
    const R = st.R, post = st.post || st.T;
    return [0, 1, 2, 3].map(function (i) {
      let ev = 0;
      for (let P = 0; P < 4; P++) {
        const w = post[P]; if (w <= 0) continue;
        const corr = ringShift(P, i);
        ev += w * ((1 - R) * l2BreakP(st, i, P) + R * l2BreakP(st, i, corr));
      }
      return ev;
    });
  }
  /** L3GK：我扑 i 的期望"球没进"率（与 gkAuto 同式；gkSaveP 已含打飞 = 救到） */
  function gkSaveTable(st) {
    return [0, 1, 2, 3, 4, 5].map(function (i) {
      let succ = 0;
      for (let s = 0; s < 6; s++) {
        const w = st.post[s]; if (w <= 0) continue;
        const sF = shooterShift(i, s);
        succ += w * ((1 - st.R) * gkSaveP(st, i, s) + st.R * gkSaveP(st, i, sF));
      }
      return succ;
    });
  }

  function runMatch(match) {
    const out = { mine: [], theirs: [] };
    const d = match && match.d;
    if (!d || !d.player) return out;
    if (!match.userPerf || !match.userPerf.played) return out;
    const opp = match.opponentTeam ? match.opponentTeam() : null;
    const usr = match.userTeam ? match.userTeam() : null;
    const pos = d.player.position;
    const isGk = !!(window.Pool && Pool.isGk(pos));

    // ① 我方机会链（★ 3C：门将走 L1 开球发动 —— 他只发动、不进球）
    let op = opportunities(d, opp, usr);
    /* ★ P106-B：门将的机会数单独缩放（他只发动不终结，不该吃外场扩容的红利）
       —— 详见 DUEL_TABLES.L0.gkMul 处的注释。 */
    if (isGk) {
      const L0 = CFG().L0 || {};
      const gkLam = (L0.gkLam != null) ? L0.gkLam : 0.7;
      op = { n: Math.min(pois(gkLam), L0.hardCap || 5), dA: op.dA, lam: gkLam, skLam: op.skLam };
    }
    if (isGk) {
      // ★ 门将的产物是**助攻机会**（`kickP`），不是进球：
      //   让门将直接改比分结构会破坏"球队总进球 = 配额"这条结构不变量。
      for (let k = 0; k < op.n; k++) {
        const minute = 1 + Math.floor(RN() * 90);
        const l1 = l1Prepare(d, opp, {});
        const l1Pick = l1Auto(l1);
        const l1r = l1Resolve(l1, l1Pick, false);
        l1.pickIdx = l1Pick;
        const opt = l1.options[l1Pick];
        const kickP = gkKickBonus(d, opt);
        out.mine.push({
          idx: k, minute: minute, layer: "L1GK", prep: l1, pick: { L1: l1Pick, L3: null },
          auto: l1r, goal: false, blocked: !l1r.win, noGoal: true,
          assist: !!(l1r.win && RN() < kickP), kickP: kickP,
        });
      }
    } else {
      for (let k = 0; k < op.n; k++) {
        const minute = 1 + Math.floor(RN() * 90);
        const l1 = l1Prepare(d, opp, {});
        const l1Pick = l1Auto(l1);
        const l1r = l1Resolve(l1, l1Pick, false);
        l1.pickIdx = l1Pick;
        if (!l1r.win) {
          out.mine.push({ idx: k, minute: minute, layer: "L1", prep: l1, pick: { L1: l1Pick, L3: null },
            auto: l1r, goal: false, blocked: true });
          continue;
        }
        /* ★ P109：pass 模式赢下 = 队友终结（不再接玩家自己的 L3——传球后单刀的是队友）。
           掷一次 RN() 定队友吃饼与否；条目仍占配额（goal=true 的条目进 _duelGoals）。 */
        if (l1.hasMode && l1.mode === "pass") {
          const pM = mateFinishP(d, usr);
          const goal = RN() < pM;
          out.mine.push({ idx: k, minute: minute, layer: "L1", prep: l1, pick: { L1: l1Pick, L3: null },
            auto: l1r, goal: goal, blocked: false, l1: l1r, mateFinish: true, assist: goal });
          continue;
        }
        const l3 = shotPrepare(d, opp, {});
        const l3Pick = shotAuto(l3);
        const l3r = shotResolve(l3, l3Pick, false);
        l3.pickIdx = l3Pick;
        out.mine.push({ idx: k, minute: minute, layer: "L3", prep: l3, pick: { L1: l1Pick, L3: l3Pick },
          auto: l3r, goal: !!l3r.goal, blocked: false, l1: l1r, l1Prep: l1, shotType: l3.type.id });
      }
    }

    // ② 对手威胁机会（防守侧；对手越强机会越多，硬上限 2）
    //   ★★ 关键口径：`broken` 初始恒为 **false** —— 也就是说"默认模拟"时对手照常进球。
    //      为什么不让自动决策去吃这个收益：默认模拟要覆盖绝大多数场次，
    //      若 baseline 就扣对手进球，全联盟场均会系统性下降（漂移）。
    //      L2 的收益**只属于亲手打的玩家** —— 这正是用户"关键场次手动"的设计意图。
    const TH = CFG().L2.THEIRS;
    const lam = clamp(TH.base + (((opp && opp.strength) || 70) - ((usr && usr.strength) || 70)) * TH.slope, TH.lo, TH.hi);
    const nT = Math.min(pois(lam), TH.hardCap);
    for (let k = 0; k < nT; k++) {
      const minute = 1 + Math.floor(RN() * 90);
      // ★ 3C：门将玩家的防守 = 对方的射门/单刀 → 我去扑（L3GK）
      if (isGk) {
        const prep = gkPrepare(d, opp, {});
        const pick = gkAuto(prep);
        const r = gkResolve(prep, pick, false);
        prep.pickIdx = pick;
        out.theirs.push({ idx: k, minute: minute, layer: "L3GK", prep: prep, pick: { L3GK: pick },
          autoBroken: !!r.saved, broken: false });
        continue;
      }
      const prep = l2Prepare(d, opp, {});
      const pick = l2Auto(prep);
      const r = l2Resolve(prep, pick, false);
      prep.pickIdx = pick;
      out.theirs.push({ idx: k, minute: minute, layer: "L2", prep: prep, pick: { L2: pick },
        autoBroken: !!r.broken, broken: false });
    }
    return out;
  }

  /** ★ 提示指向的候选（供 UI 高亮 + 组句；与 posterior4/6 同一套口径，保证"说的"和"算的"一致） */
  function hintCells4(lvl, T) {
    const order = [0, 1, 2, 3].sort((a, b) => T[b] - T[a]);
    if (lvl >= 3) return { kind: "one", cells: [order[0]] };
    if (lvl === 2) return { kind: "two", cells: [order[0], order[1]] };
    if (lvl === 1) return { kind: "not", cells: order.slice(0, 3), excluded: order[3] };
    return { kind: "none", cells: [0, 1, 2, 3] };
  }
  function hintCells6(lvl, T) {
    const G = GRID();
    let argm = 0; for (let i = 1; i < 6; i++) if (T[i] > T[argm]) argm = i;
    let bc = 0, bs = -1, lc = 0, lsv = 1e9, br = 0, bsr = -1;
    for (let c = 0; c < 3; c++) { const s2 = T[c] + T[c + 3]; if (s2 > bs) { bs = s2; bc = c; } if (s2 < lsv) { lsv = s2; lc = c; } }
    for (let r = 0; r < 2; r++) { const s2 = T[r * 3] + T[r * 3 + 1] + T[r * 3 + 2]; if (s2 > bsr) { bsr = s2; br = r; } }
    const idx = G.map(function (g, i) { return i; });
    if (lvl >= 4) return { kind: "one", cells: [argm] };
    if (lvl === 3) return { kind: "col", cells: idx.filter(i => G[i].col === bc), col: bc };
    if (lvl === 2) return { kind: "row", cells: idx.filter(i => G[i].row === br), row: br };
    if (lvl === 1) return { kind: "notCol", cells: idx.filter(i => G[i].col !== lc), col: lc };
    return { kind: "none", cells: idx };
  }

  /** ★★ P111：属性 → 受它影响的小游戏选项（加点页「影响」标注的单源）。
   *  运行时扫描 DUEL_TABLES 的选项绑定（main/sub/aux/权重组），**不另维护一份映射表**
   *  —— 以后改 duel_tables 的绑定，这里的输出自动跟着变。
   *  只列**玩家侧**出口（AI 专用的 L1.DEFEND / L2.ATTACK 不算玩家加点收益）。
   *  返回去重中文名数组；空数组 = 该属性不直接影响小游戏（纯 OVR 项）。 */
  function optionsOfAttr(attrId) {
    const T = CFG();
    const out = [];
    const push = (s) => { if (s && out.indexOf(s) < 0) out.push(s); };
    const hit = (o) => o.main === attrId || o.sub === attrId || o.aux === attrId;
    // L1 创造（三组外场选项 + 门将开球；玩家属于哪组由位置决定，标注合并展示）
    for (const grp of [T.L1.STRIKER, T.L1.MID_PASS, T.L1.MID_CARRY, T.L1.GK_KICK]) {
      for (const o of grp) if (hit(o)) push(o.cn);
    }
    // L2 破坏（玩家防守四选一 + 门将四选一）
    for (const o of T.L2.OPTIONS) if (hit(o)) push(o.cn);
    for (const o of T.L2.OPTIONS_GK) if (hit(o)) push(o.cn);
    // L3 终结（打正率按机会类型 main/sub 合成）
    for (const o of T.L3.SHOT_TYPES) if (hit(o)) push(o.cn);
    // L3GK 守门侧（扑救力合成 / 读心窗口 / 反应修正）—— ★ P171：command 并入 gkPositioning
    if (attrId === "reflexes" || attrId === "diving") push("扑救成功率");
    if (attrId === "gkPositioning") push("读心提示档位");
    if (attrId === "reflexes") push("反应修正");
    if (attrId === "handling") push("脱手率压制");
    if (attrId === "strength") push("强破对抗（力量 vs 门将）");
    /* ★ P114 v4 影响标注更新：死属性标注删除、新属性出口补挂（与 duel_tables 重绑同步） */
    const inGrp = (grp) => !!grp && grp.indexOf(attrId) >= 0;
    if (attrId === "freeKicks") push("定位球机会");
    if (inGrp(T.L0.selfPace) || inGrp(T.L0.selfPass)) push("机会数量");
    if (inGrp(T.L0.oppDef)) push("对手机会压制");
    if (T.L0.sp && attrId === "freeKicks") push("定位球机会");
    if (attrId === "penalties") push("点球手稳定度（射门打正）");
    if (inGrp(T.BREAK.selfBody)) push("护球（防被断）");
    if (attrId === "vision") push("助攻转化");
    if (attrId === "longPass") push("过顶长传 / 转移分边");
    if (attrId === "feint") push("穿裆过人");
    if (attrId === "ballFeel") push("挑球过人");
    if (attrId === "slideTackle") push("铲球破坏");
    if (attrId === "interception") push("上抢拦截 / 对手机会压制");
    if (attrId === "rhythm") push("往左突破（节奏变化）");
    if (attrId === "leadership") push("带动队友吃饼");
    if (attrId === "bravery") push("关键时刻（堵枪眼）");
    // ★ P112 非小游戏出口（训练层；★ P171：naturalFitness「每日体能恢复」随疲劳机制退役删除）
    if (attrId === "determination") push("训练经验效率");
    return out;
  }

  window.Duel = {
    deltaA, opportunities, isBroken, gkProfile, Kof, Rof, habitOf, bumpHabit, tendencyOf,
    hintOf, posteriorOf, strongBreak, rollShotType, aimBaseOf, aimProbOf, techOf, evalCell,
    shotTable, penaltyTable, goalGiven,   /* ★ P175：UI 真实口径显示表（ratesOf 消费） */
    softmaxPick, shot, runMatch, gkReactNoRandom, gkReactIdx,
    // 3B 新增
    shotPrepare, shotResolve, shotAuto, penaltyResolve,   // ★ P116 点球大战六格结算
    l1Prepare, l1Resolve, l1Auto, l1AutoResolve, l1Options, l1HasMode, l1WinP, l1SkillWin, l1SetMode,
    l2Prepare, l2Resolve, l2Auto, l2AutoResolve, l2Options, l2BreakP,
    oppBackLine, oppDribbler, KofG, RofG, habit4, remember, tendency4, ringShift,
    l1ReadMap, l2ReadMap, l2CounterOf,
    // ★ P106-B 新增：助攻通道（baseline 与手动派生的**单源**参数）
    assistConvertP, ASSIST_DERIVE,
    // ★ P109 新增：传球≠过人（pass 赢下 = 队友终结）+ 各层成功率表（UI 展示单源）
    mateFinishP, MATE_FINISH, l1WinTable, l2BreakTable, gkSaveTable,
    hintLevel4, posterior4, weakBonus, pois, hintCells4, hintCells6, hintCells6Mode,
    // ★ 3C 新增：守门侧 + 门将开球 + 技能钩子
    gkPrepare, gkResolve, gkAuto, gkAutoResolve, oppShooter, tendencyGk, shooterShift,
    habitGkOf, mySavePower, mySavePowerAt, gkSaveP, gkKickBonus, skillAimBonus, SGAIN, posteriorBayes, posteriorTrue, posterior6, posteriorGkOf: posteriorBayes,
    // ★ P111 新增：属性 → 小游戏选项 反查（加点页「影响」标注的单源）
    optionsOfAttr,
    // ★ P150 新增：同场对位软化 + 出身微加成（探针/审计读同一份实现）
    oppCore, originBonusOf,
  };
})();
