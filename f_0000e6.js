/* ============================================================================
   P97 M1 · 潜力上限体系（三层叠加，硬顶 92）
   ---------------------------------------------------------------------------
   地基推论（提案 §A1）：**潜力表与位置无关**；
     总评上限 = 「位置权重 × 潜力表」的加权结果
     → 「位置只代表潜力往哪偏」与「位置可动态调整」自动咬合，位置适配度自然浮现。

   三层语义（加性）：
     L1 天赋上限 pot[attr]        开档一次生成（该位置池上的均值**精确等于**出身基准）
     L2 积分解锁 potUnlock        生涯积分阶梯查表（只累积不消耗）—— M4 接 META
     L3 传承上限 starUnlock[attr] 球星传承（定向 +1~+2/次）—— M4/M5
     effPot[attr] = min(92, pot + potUnlock + starUnlock)

   ★ 为什么必须有硬顶：没有上限时「自由分配 + 无上限」= 玩家必然把高权重项吃满 99。
   ★ 撞顶必须有去处，否则训练变废操作 → 单属性撞顶自动溢流；**全池撞顶折价 70% 转 SP**。
   ============================================================================ */
(function () {
  // ★ P97 M2：池定义已抽到 `js/pool.js`（跨模块唯一出口）；此处保留**回退常量**以防加载顺序意外
  const POOL_OUT = ["awareness", "passing", "dribbling", "defending", "shooting", "physicality", "pace"];
  const POOL_GK = ["goalkeeping", "physicality", "pace"];

  const P = () => (window.CONFIG && window.CONFIG.POTENTIAL) || {};
  const A = () => (window.CONFIG && window.CONFIG.ATTRIBUTES) || {};
  const RND = () => (window.R && window.R.next) ? window.R.next() : Math.random();

  function poolOf(position) {
    if (window.Pool) return Pool.catsOf(position);
    return position === "GK" ? POOL_GK : POOL_OUT;
  }
  function idsOf(position) {
    if (window.Pool) return Pool.ids(position);
    const A_ = A(), out = [];
    for (const cat of poolOf(position)) for (const pair of (A_[cat] || [])) out.push(pair[0]);
    return out;
  }
  const clamp = (v, lo, hi) => v < lo ? lo : (v > hi ? hi : v);
  function gauss() {
    let u = 0, v = 0;
    while (!u) u = RND();
    while (!v) v = RND();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** ★ 整数均值锁死：使 Σ pot 精确等于 targetSum（"平均潜力 85/80/76"要字面成立）
   *  ★ 必须按**整数 ±1** 调整，不能按浮点分摊：`per = d/n` 这种微小增量跨不过 Math.round 的
   *    .5 边界 → 迭代永远不收敛（2026-09-13 探针实测：genius/ST 停在 84.92 而非 85）。 */
  function lockMean(pot, ids, targetSum, lo, hi) {
    const ip = {};
    for (const id of ids) ip[id] = clamp(Math.round(pot[id]), lo, hi);
    const commit = () => { for (const id of ids) pot[id] = ip[id]; };
    for (let it = 0; it < 200; it++) {
      let s = 0;
      for (const id of ids) s += ip[id];
      const d = targetSum - s;
      if (d === 0) { commit(); return it; }
      const step = d > 0 ? 1 : -1;
      const adj = ids.filter(id => (step > 0 ? ip[id] < hi : ip[id] > lo));
      if (!adj.length) { commit(); return -1; }        // 无调整空间（理论不可达）
      let need = Math.abs(d), i = 0;
      while (need > 0 && i < adj.length * 400) {
        const id = adj[i % adj.length];
        if (step > 0 ? ip[id] < hi : ip[id] > lo) { ip[id] += step; need--; }
        i++;
      }
      if (need > 0) { commit(); return -1; }
    }
    commit();
    return -2;
  }

  /** 生成潜力表（位置无关的种子 + 位置只决定偏置方向；均值锁死在出身基准） */
  function generate(position, base) {
    const C = window.CONFIG, p = P(), AT = A();
    const W = C.POSITION_WEIGHTS[position] || {};
    const pool = poolOf(position), ids = idsOf(position);
    const lo = Math.max(p.MIN || 30, base + (p.FLOOR_OFFSET || -20));
    const hi = Math.min(p.HARD_CAP || 92, base + (p.CEIL_OFFSET || 12));
    const wbar = pool.reduce((s, c) => s + (W[c] || 0), 0) / (pool.length || 1);
    const denom = pool.reduce((s, c) => s + Math.abs((W[c] || 0) - wbar), 0) || 1;
    const pot = {};
    for (const cat of pool) {
      const z = ((W[cat] || 0) - wbar) / denom;                       // 归一化偏置方向
      const cv = clamp(Math.round(base + (p.SPREAD || 14) * z * (p.LAMBDA || 1) + gauss() * (p.CAT_NOISE || 2)), lo, hi);
      for (const pair of (AT[cat] || [])) pot[pair[0]] = cv + gauss() * (p.ATTR_JITTER || 2.5);
    }
    lockMean(pot, ids, base * ids.length, lo, hi);                    // ★ 锁死均值（内部已取整）
    const out = {};
    for (const id of ids) out[id] = pot[id];
    return out;
  }

  /** 生涯积分 → potUnlock（阶梯查表，只累积不消耗） */
  function unlockOf(points) {
    const T = P().UNLOCK_TABLE || [[0, 0]];
    let v = 0;
    for (const row of T) if (points >= row[0]) v = row[1];
    return Math.min(v, P().UNLOCK_CAP || 12);
  }
  /** 生涯积分来源（M1：优先读存档/兼容全局；M4 接 META.legacyPoints） */
  function pointsOf(d) {
    if (d && typeof d.legacyPoints === "number") return d.legacyPoints;
    if (window.META && typeof window.META.legacyPoints === "number") return window.META.legacyPoints;
    return 0;
  }
  function potUnlockOf(d) {
    // ★★ M4：优先用 `Legacy` **实时重算**的积分 —— 保证 `effPot`（实际生效）
    //   与赛季账单（玩家看到的"生涯积分 N 分 → 已解锁 +M"）永远是同一份数据。
    //   ★ `Legacy.sync` 带键值缓存（赛季/奖杯数/日志长度/结局数/声望/apps 变化才重算），
    //     所以 `effPot` 在属性面板里被逐项调用（31 次）也不会重复遍历生涯日志。
    if (window.Legacy && typeof Legacy.sync === "function") return unlockOf(Legacy.sync(d));
    return unlockOf(pointsOf(d));
  }

  /** 出身档 → 潜力基准（★ 兼容旧四卡 id：family 足球世家→genius；scholar/street→hotblood） */
  function baseOf(d) {
    const B = P().BASE || {};
    const oid = (d && ((d.origin && d.origin.id) || d.originId)) || "";
    const ALIAS = { family: "genius", scholar: "hotblood", street: "hotblood" };
    return B[oid] || B[ALIAS[oid]] || B.hotblood || 76;
  }

  /** 潜力表均值（≈ 出身基准）；用于"池外项"的上限：外场球员不该把门将项练高 */
  function potMeanOf(pl) {
    const n = Object.keys(pl.pot).length;
    if (pl.__potMean !== undefined && pl.__potMeanN === n) return pl.__potMean;
    let s = 0, k = 0;
    for (const id in pl.pot) { s += pl.pot[id]; k++; }
    pl.__potMean = k ? Math.round(s / k) : 76;
    pl.__potMeanN = n;
    return pl.__potMean;
  }

  /** 有效上限：min(硬顶, pot + potUnlock + starUnlock)
   *  ★ 池外项（如外场球员的门将 6 项）没有自己的 pot → 取**潜力均值**作上限，
   *    绝不能返回 99：否则外场项撞顶后经验会全部倾泻到门将项、一路涨到 99，
   *    硬顶形同虚设（2026-09-13 探针实测：a99 = 6 项，正是这个 bug）。M2 分池后此路径自然消失。
   *  ★★ P120：出身硬顶收口 + 广告潜力突破抬帽 ——
   *    effCap = min(AD_BREAK.CAP(100), min(ORIGIN_HARD_CAP[origin], pot + unlock + star) + adBreak[id]×STEP)
   *    · 未突破：出身帽 95/89/84 收口（unlock/star 仍同权但压不平出身差）
   *    · 突破：到帽后看广告 +10/次、不限次，总封顶 100（96+ 段成本 ×8 缓坡）
   *    · 旧档：origin 缺失/旧 id 查表 miss → 回落 HARD_CAP 95 = 行为不变 */
  function effPot(d, id) {
    const pl = d && d.player;
    if (!pl || !pl.pot || !Object.keys(pl.pot).length) return 99;   // 无潜力表 → 不设限（兼容极旧档）
    const p = P();
    const base = (pl.pot[id] !== undefined) ? pl.pot[id] : potMeanOf(pl);
    const star = Math.min((pl.starUnlock && pl.starUnlock[id]) || 0, p.STAR_CAP || 12);
    const oid = (d && ((d.origin && d.origin.id) || d.originId)) || "";
    const originCap = (p.ORIGIN_HARD_CAP && p.ORIGIN_HARD_CAP[oid]) || p.HARD_CAP || 95;
    const broken = ((pl.adBreak && pl.adBreak[id]) || 0) * ((p.AD_BREAK && p.AD_BREAK.STEP) || 5)   // ★ P266：STEP 10→5（fallback 同步）
      + ((pl.expBreak && pl.expBreak[id]) || 0);   // ★ P189/P262：经验突破点数直加（+5/次阶价）
    const capAll = (p.AD_BREAK && p.AD_BREAK.CAP) || 100;
    const reach = Math.min(originCap, base + potUnlockOf(d) + star);
    return Math.min(capAll, reach + broken);
  }
  /** 全池有效上限表（供 applyExp 候选池 / seasonEnd 用） */
  function effMap(d) {
    const out = {};
    for (const id of Object.keys((d && d.player && d.player.attrs) || {})) out[id] = effPot(d, id);
    return out;
  }
  /** 是否全池已撞顶（没有任何一项还能涨） */
  function isCapped(d) {
    const pl = d && d.player;
    if (!pl) return false;
    for (const [id, v] of Object.entries(pl.attrs)) if (v < effPot(d, id)) return false;
    return true;
  }

  /** 老档迁移：无 pot 则按出身档生成（★ pot 不得低于已有的 attrs，否则等于"砍属性"）
   *  ★ P97 M2：pot 同样按池裁剪 —— 分池后池外项既没有 attrs 也不该有 pot */
  function ensure(d) {
    const pl = d && d.player;
    if (!pl) return false;
    const ids = idsOf(pl.position);
    if (pl.pot && typeof pl.pot === "object" && Object.keys(pl.pot).length) {
      let changed = false;
      if (window.Pool) { const dropped = Pool.trim(pl.position, pl.pot); if (dropped.length) changed = true; }
      // 池内项缺 pot → 用池内均值补齐（否则 effPot 会走"池外项"分支、上限失真）
      const mean = potMeanOf(pl);
      for (const id of ids) if (pl.pot[id] === undefined) { pl.pot[id] = mean; changed = true; }
      if (!pl.starUnlock) pl.starUnlock = {};
      return changed;
    }
    const base = baseOf(d);
    const pot = generate(pl.position, base);
    const p = P();
    for (const [id, v] of Object.entries(pl.attrs || {})) {
      if (pot[id] === undefined) continue;                                                                 // 池外项（旧档残留）→ 不进 pot
      if (pot[id] < v) pot[id] = Math.min(p.HARD_CAP || 92, Math.max(pot[id], v));                          // ★ 不砍已有属性
    }
    pl.pot = pot;
    pl.starUnlock = {};
    pl._potBase = base;
    pl._potVer = 1;
    return true;
  }

  /** ★ 全池撞顶：把无处可去的经验折价 70% 转 SP（每赛季有上限，防爆） */
  function depositSpill(d, expLeft, seasonKey) {
    const p = P();
    const left = Number(expLeft) || 0;
    if (left <= 0) return 0;
    const usable = Math.floor(left * (p.CAP_DISCOUNT || 0.7));
    const raw = Math.floor(usable / (p.SP_PER_EXP || 200000));
    if (raw <= 0) return 0;
    const key = String(seasonKey == null ? (d.season || 0) : seasonKey);
    if (d._spillSeason !== key) { d._spillSeason = key; d._spillSp = 0; }
    const cap = p.SP_SEASON_CAP || 6;
    const give = Math.max(0, Math.min(raw, cap - (d._spillSp || 0)));
    if (give > 0) {
      d.skillPoints = (d.skillPoints || 0) + give;
      d._spillSp = (d._spillSp || 0) + give;
    }
    return give;
  }

  /** 诊断用：该位置池上的潜力均值（应精确等于出身基准） */
  function meanPot(d) {
    const pl = d && d.player;
    if (!pl || !pl.pot) return null;
    const ids = idsOf(pl.position);
    let s = 0, n = 0;
    for (const id of ids) if (typeof pl.pot[id] === "number") { s += pl.pot[id]; n++; }
    return n ? { sum: s, n, mean: s / n } : null;
  }

  /* ══════════════════════════════════════════════════════════════════
     L3 · 球星传承（starUnlock）
     ------------------------------------------------------------------
     ★ 为什么现在才补：`effPot` 从 M1 起就在算 `pot + potUnlock + starUnlock[id]`，
       但**从来没有任何代码写过 `starUnlock`** —— 它恒为 0。
       这跟 M4 的 `legacyPoints` 是**同一个坑**：
       「读一个没人写的字段会静默退化成常量」，而 0 恰好等价于"还没传承过"这个合法状态，
       所以不报错、不红判据、也没人发现。
     ★ 本函数的职责只有一件：**把某一项的上限永久抬高**。
       触发时机由调用方决定 —— 当前唯一调用方是 `star_favor.js` 的合练分支
       （合练文案本来就在说"把短板练到发烫"，是"衣钵相传"的天然场景）。
     ══════════════════════════════════════════════════════════════════ */

  /** 生涯传承累计（所有项求和） */
  function starTotal(pl) {
    let s = 0;
    for (const k in ((pl && pl.starUnlock) || {})) s += (pl.starUnlock[k] || 0);
    return s;
  }

  /** ★ L3 传承：把 `cat` 类别里**当前属性最低的那一项**上限永久 +amount
   *  ------------------------------------------------------------------
   *  @returns {ok:true, attr, attrCn, add, val, before, after, total, cap} | {ok:false, why}
   *  ★ 落点取"该类别里的短板"而非随机 / 最强项：设计口径是「传承用来**补短板**」（提案 §A3）；
   *    于是"跟哪个球星合练"本身就成了策略选择（前锋教你射门、中场教你组织、后卫教你防守）。
   *  ★ 类别不在玩家池内 → 直接拒绝。门将的守门心得对外场球员没有指点意义；
   *    这是 M2「池外类根本不进 attrs」的**必然推论**，不是额外规则。
   *  ★ 双重封顶：单项 ≤ `STAR_CAP`，生涯累计 ≤ `STAR_TOTAL_CAP`。 */
  function inherit(d, cat, amount) {
    const pl = d && d.player, p = P();
    if (!pl || !pl.attrs) return { ok: false, why: "无存档或属性表" };
    if (!pl.pot || !Object.keys(pl.pot).length) return { ok: false, why: "尚无潜力体系（先 ensure）" };
    const list = A()[cat];
    if (!list || !list.length) return { ok: false, why: "未知属性类别 " + cat };
    const ids = idsOf(pl.position);
    const inPool = list.filter(pair => ids.indexOf(pair[0]) >= 0);
    if (!inPool.length) return { ok: false, why: "该类别不在你的属性池内" };
    if (!pl.starUnlock) pl.starUnlock = {};

    const capTotal = p.STAR_TOTAL_CAP || 12, capOne = p.STAR_CAP || 12;
    const total = starTotal(pl);
    if (total >= capTotal) return { ok: false, why: "已到生涯传承上限（+" + capTotal + "）", capped: true };

    // 目标 = 该类别里当前属性最低的一项（并列时取面板顺序在前的那个）
    let tgt = inPool[0];
    for (const pair of inPool) if ((pl.attrs[pair[0]] || 0) < (pl.attrs[tgt[0]] || 0)) tgt = pair;

    let add = Math.max(1, Math.round(amount || 1));
    add = Math.min(add, capTotal - total);
    add = Math.min(add, Math.max(0, capOne - (pl.starUnlock[tgt[0]] || 0)));
    if (add <= 0) return { ok: false, why: "该项已到单项传承上限" };

    const before = effPot(d, tgt[0]);          // ★ 写入前先记，供 UI 显示"上限 84 → 86"
    pl.starUnlock[tgt[0]] = (pl.starUnlock[tgt[0]] || 0) + add;
    return {
      ok: true, attr: tgt[0], attrCn: tgt[1], add: add,
      val: pl.attrs[tgt[0]] || 0,
      before: before, after: effPot(d, tgt[0]),
      total: total + add, cap: capTotal,
    };
  }

  /* ★ P121 突破季配额：每季全池 3 次（AD_BREAK.PER_SEASON），懒重置（读自愈，无时序风险） */
  function breakLeft(d) {
    const pl = d && d.player, p = P();
    if (!pl) return 0;
    const per = (p.AD_BREAK && p.AD_BREAK.PER_SEASON) || 0;
    if (!per) return Infinity;
    const s = d.season != null ? d.season : "";
    if (!pl.adBreakSeason || pl.adBreakSeason.season !== s) { pl.adBreakSeason = { season: s, used: 0 }; }
    return Math.max(0, per - (pl.adBreakSeason.used || 0));
  }

  /** ★ P120 广告潜力突破：单项**磨到当前上限**后看广告 → 该项上限 +STEP（P266 起 STEP=5；总封顶 AD_BREAK.CAP=100）
   *  ★ "到帽才能突破"是用户拍板的原型语义 —— 广告买的是上限空间，成长仍要肝。
   *  ★ P121：每季全池 3 次（breakLeft 配额，调用方看按钮置灰，这里兜底再校验）。
   *  @returns {ok:true, from, to} | {ok:false, why} */
  function adBreak(d, id) {
    const pl = d && d.player, p = P();
    if (!pl || !pl.attrs || !(id in pl.attrs)) return { ok: false, why: "未知属性" };
    const cap = effPot(d, id);
    const capAll = (p.AD_BREAK && p.AD_BREAK.CAP) || 100;
    if (cap >= capAll) return { ok: false, why: "已到突破总上限 " + capAll };
    if ((pl.attrs[id] || 0) < cap) return { ok: false, why: "先练到当前上限 " + cap + " 才能突破" };
    if (breakLeft(d) <= 0) return { ok: false, why: "本季突破次数已用完（每季 " + ((p.AD_BREAK && p.AD_BREAK.PER_SEASON) || 0) + " 次）" };
    if (!pl.adBreak) pl.adBreak = {};
    pl.adBreak[id] = (pl.adBreak[id] || 0) + 1;
    pl.adBreakSeason.used = (pl.adBreakSeason.used || 0) + 1;
    return { ok: true, from: cap, to: effPot(d, id) };
  }

  /* ★★ P189 经验突破（用户拍板「用经验值突破潜力上限，需求很高，解决经验溢出」）──
     与广告突破（P266 起 +5/次 · 每季 3 次）并行的**高价慢轨**：+1 上限/次，不限季次（递增自带节流）。
     · 成本单源 expBreakCost：BASE × GROWTH^该项已突破点数 × 出身系数 —— UI 展示与实扣同源；
     · 审计锚定（tools/_p189_exp_audit.js）：堆满 12 季溢出 1680 万 EP → 96+ ×8 加点坑（~1400 万）
       + 全池 175 点经验突破空间（均价 ~15 万）= 溢出被精确吸收；零广告玩家前期紧张不变。
     · cap 总封顶与广告共用 AD_BREAK.CAP=100（P120 拍板不动）。 */
  /* ★★ P196 年龄分档经验消耗（用户拍板「28 岁前/28 岁后/36 岁后三档，越老越贵」）──
     经验买的是身体的学习能力：28 岁前原价 ×1.0，28-35 岁 ×M2，36 岁起 ×M3。
     · 单源：potential.expBreakCost 与 systems.spendOn（经 window.Potential 守卫调用）、
       hub 展示（costOf）三处共用本函数 —— 展示与实扣永远同价；
     · 广告侧不乘（广告买现实资源）；d.player.age 缺失回落 1.0（旧档/极端档安全）。 */
  function ageCostMult(d) {
    const C = P().AGE_COST;
    if (!C) return 1;
    const age = (d && d.player && d.player.age) || 0;
    return age >= C.T2 ? C.M3 : (age >= C.T1 ? C.M2 : C.M1);
  }

  /* ★★ P262（用户拍板）：经验突破改阶价买断 —— expBreak 每次 +5 上限（EXP_BREAK.STEP），
     cost 公式零改动（BASE × GROWTH^n × 出身 × 年龄，n=已突破点数）：+5 写入让 n 恒为
     5 的倍数 ⇒ 自动形成「5 点一阶、每阶 ×3.05 跳涨」的阶梯定价，越高阶越贵、整体减慢。
     旧档存量 n（逐点 +1 时代）非 5 的倍数也安全：公式连续，价格单调不减、行为不回退。 */
  function expBreakCost(d, id) {
    const pl = d && d.player, p = P();
    if (!pl) return Infinity;
    const cfg = p.EXP_BREAK || {};
    const base = cfg.BASE || 80000, grow = cfg.GROWTH || 1.15;
    const n = ((pl.expBreak && pl.expBreak[id]) || 0);
    const oid = (d && ((d.origin && d.origin.id) || d.originId)) || "";
    const om = (p.ORIGIN_COST_MULT && p.ORIGIN_COST_MULT[oid]) || 1;
    return Math.round(base * Math.pow(grow, n) * om * ageCostMult(d));   // ★ P196：年龄档连乘
  }

  /** @returns {ok:true, from, to, cost} | {ok:false, why} */
  function expBreak(d, id) {
    const pl = d && d.player, p = P();
    if (!pl || !pl.attrs || !(id in pl.attrs)) return { ok: false, why: "未知属性" };
    const cap = effPot(d, id);
    const capAll = (p.AD_BREAK && p.AD_BREAK.CAP) || 100;
    if (cap >= capAll) return { ok: false, why: "已到突破总上限 " + capAll };
    if ((pl.attrs[id] || 0) < cap) return { ok: false, why: "先练到当前上限 " + cap + " 才能突破" };
    const cost = expBreakCost(d, id);
    if ((d.expPool || 0) < cost) return { ok: false, why: "经验不足：需要 " + cost + "，当前经验池 " + (d.expPool || 0) };
    if (!pl.expBreak) pl.expBreak = {};
    d.expPool -= cost;
    pl.expBreak[id] = (pl.expBreak[id] || 0) + ((p.EXP_BREAK && p.EXP_BREAK.STEP) || 5);   // ★ P262：+5/次阶价买断
    return { ok: true, from: cap, to: effPot(d, id), cost: cost };
  }

  window.Potential = {
    CFG: P, poolOf, idsOf, generate, lockMean, baseOf,
    unlockOf, pointsOf, potUnlockOf, effPot, effMap, isCapped,
    ensure, depositSpill, meanPot,
    starTotal, inherit,          // ★ P97 M4 · L3 传承
    adBreak, breakLeft,          // ★ P120/P121 · 广告潜力突破（+每季配额）
    expBreak, expBreakCost,      // ★ P189/P262 · 经验突破（+5/次阶价慢轨，越高阶越贵）
    ageCostMult,                 // ★ P196 · 年龄三档经验消耗系数（spendOn/expBreakCost/hub 同源）
  };
})();
