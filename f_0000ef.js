/* ============================================================================
   生涯系统 — 日常循环 / 生活事件 / 商业活动 / 退役结算
   ============================================================================ */
(function () {
  /* ══════════════════════════════════════════════════════════════════════════════
     ★★★ P99 批 4c ⑤：`LIFE()` / `SCANDALS()` 的**数据契约**（本文件对宿主的唯一要求）
     ------------------------------------------------------------------------------
     这两个是**读点**（不是数据），形态刻意写成 thunk 而不是 `const LIFE = window.GAME_DATA.life.EVENTS`：

     ① **为什么必须是 thunk（函数）**：`career.js` 只要「被加载」就会执行本行，
        而 `GAME_DATA.life` 由 `data_life.js` / `data_hupu_flavor.js` 在**加载期**建立。
        写成 `const` 则**加载顺序**决定本文件读到 undefined 还是会话 —— 而它**不报错**
        （`undefined.slice()` 要到 `rollLifeEvent` 才炸，那时已经在一局生涯里了）。
        thunk 把"取数据"推迟到**每次调用**，与顺序解耦。

     ② **契约（调用方必须满足的形状）**：
            window.GAME_DATA            —— 对象，**必须存在**
            window.GAME_DATA.life       —— 对象，**必须存在**
            …life.EVENTS                —— 数组（`|| []` 兜底「缺键」，但**不兜「缺父对象」**）
            …life.SCANDAL_EVENTS        —— 数组（同上）
        ★★ **"缺键兜零、缺父对象抛错"这一点是有意的，不是疏漏** —— 但它是**双刃**：
          · 好处：写错名字（`life.EVENT` 少个 S）会被兜成空池 ⇒ 表现为"生活事件消失了"，
            这是**静默**的（`rollLifeEvent` 返回 null，玩家只是觉得没事件）；
            ⇒ 所以真正的防线是**读点数**：本文件是全仓 **唯一** 读 `GAME_DATA.life` 的地方
              （`grep -n 'GAME_DATA.life' web_port/game/js/` 只应命中本文件两行），
              数据侧改名时**只需核这一处**。
          · 代价：`GAME_DATA.life` 整体缺失 ⇒ `TypeError: Cannot read properties of undefined`
            **炸在 `Career.advanceDay` 里**（不是炸在加载期）—— 批 3 的探针首跑就踩到过，
            于是 `tools/_p99_youth_probe.js:180` 显式预置了空集合，并把这个契约写在了那里。
        ⇒ ★ 本节就是那份契约的**本仓落点**：任何新测试沙箱若只加载 `data_real.js`
          （不加载全部 `data_*.js`），**必须**按同一契约预置：
              sandbox.GAME_DATA.life = sandbox.GAME_DATA.life || { EVENTS: [], SCANDAL_EVENTS: [] };
          否则会以"随机炸在 advanceDay"的形式出现 —— 那种失败**看起来像**业务 bug，
          排查成本极高（批 3 已实证）。

     ③ **单一读点**：`LIFE()` 的唯一调用点是 `rollLifeEvent`；`SCANDALS()` 的唯一调用点也在那里。
        别处要生活事件请走 `Career.rollLifeEvent`，不要自己再读一遍 `GAME_DATA.life`。
     ══════════════════════════════════════════════════════════════════════════════ */
  const LIFE = () => window.GAME_DATA.life.EVENTS || [];
  const SCANDALS = () => window.GAME_DATA.life.SCANDAL_EVENTS || [];

  const DAYS_IN_MONTH = { 1: 31, 2: 28, 3: 31, 4: 30, 5: 31, 6: 30, 7: 31, 8: 31, 9: 30, 10: 31, 11: 30, 12: 31 };

  const Career = {
    dateStr(d) {
      return d.date.year + "年" + d.date.month + "月" + d.date.day + "日";
    },
    fmtMoney(v) {
      if (v >= 100000000) return (v / 100000000).toFixed(2) + "亿";
      if (v >= 10000) return (v / 10000).toFixed(1) + "万";
      return Math.round(v).toLocaleString();
    },

    // ── 薪资曲线：^4 指数 + 封顶（低段平缓、70+ 巨星段陡增）──
    /* ★ P211 曲线写实化（玩家实录「冠军队一年 1300w 追不上 2 亿级投资」）：
       巨星段系数 550 万→900 万、低端 5 万→6 万、帽 600 万→750 万/周。
       写实锚（×1.63 ≈ 中值状态×强队系数）：ovr82 冠军核心 ≈42 万/周（年薪 2200 万，
       金元中超顶薪档）· ovr88 豪门主力 ≈196 万/周（年薪 1 亿）。
       ★★ P295（用户拍板「压顶部曲线」；玩家实录「玩几个赛季就周薪 500 万」）：
         巨星段 900 万→700 万、帽 750 万→600 万 —— 顶部通胀回收：
         ovr82 ≈33 万/周 · ovr88 ≈153 万/周 · ovr92 ≈335 万/周（P211 时代 431 万）·
         ovr95+ 触帽 600 万/周（年薪 3.1 亿，历史级总包档）。低段（<85）逐位不变。 */
    WAGE_CAP: 6000000, // P211：600 万→750 万；P295：750 万→600 万/周
    wageBase(ovr) {
      const o = Math.max(0, Math.min(100, ovr));
      const low = 60000 * Math.pow(o / 100, 4);                            // 基础段（P211：5 万→6 万微调）
      const high = 7000000 * Math.pow(Math.max(0, o - 70) / 30, 4);        // 巨星段（P211 550万→900万；P295 900万→700万，70+ 启动不变）
      return Math.round(3000 + low + high);
    },
    /** 周薪 = 基础曲线 × 状态随机(0.85~1.25) × 俱乐部实力系数，封顶 1200 万 */
    wageOf(ovr, strength, rand) {
      const w = Math.round(this.wageBase(ovr) * (0.85 + (rand || 0) * 0.4) * (0.7 + (strength || 60) / 100));
      return Math.min(this.WAGE_CAP, w);
    },

    /* ══════════════════════════════════════════════════════════════════════════
       ★★★ P99 批 4（R7-25 / R7-29 反转）：周薪的**唯一费率入口**
       --------------------------------------------------------------------------
       背景：用户拍板「青训期照发 500/周」（推翻了本批原先的"零收入"口径）。
       于是本批有两件**同时**要做的事，且它们必须成对：
         （a）青训期**有**货币收入 → 需要一个**学徒费率**；
         （b）**仍必须只有一条发薪路径** → 费率分档只许发生在**一个函数**里。

       ★★ 为什么 (b) 与 (a) 同等重要（R7-29 第二个半句）：若在发薪点写成
          `if (青训) { d.money += 学徒 } else { d.money += d.contract.wage }`，
          就是**两套发薪代码** —— 日后改口径要改两处、判据要覆盖两条分支，
          而"同一状态两处"这种漏点在本项目已经复发过四次（`club_events` 链 / R18 /
          `d.stats` 五字段 / `LEAVE_REASONS` 与注释）。
          → 所以本文件里**只有 `advanceDay` 一处**写 `d.money += …周薪`，
            而"该发多少"**全部**由下面两个函数回答。

       ★ 三个不变量（探针 G3 逐条断言）：
         ① 相位判断只出现在 `weeklyWageOf` 内 —— `advanceDay` 的周薪段里
            **不得**出现 `Youth.isProtected` / `d.phase === …`；
         ② `CONFIG.YOUTH.WAGE_BASE` 的读取点全仓唯一（= `youthWageOf`）；
         ③ 成年档逐位等于旧行为（`d.contract.wage > 0 ? 该值 : 0`）→ 旧档零迁移。
       ────────────────────────────────────────────────────────────────────────── */

    /** 青训期（学徒合同）周薪 —— 公式与理由见 `CONFIG.YOUTH.WAGE_BASE` 处注释。
     *  ★★ 为什么 `wageOf` **只传 1 个参数**（不传 strength / rand）：
     *    · 传 `rand` 会让**每周金额都不同** → "ΔwageEarned === 期数 × 周薪" 这条
     *      精确签名**不成立**，探针无法归因（J3/F3 的整个设计就建立在"每周同值"上）；
     *    · 且每次调用都会**多消耗一次 `R.next`** → 打乱双端 R 消耗序 / soak 指纹；
     *    · 省略后 `wageOf` 内部取 `rand = 0 → ×0.85`、`strength = 60 → ×1.3`，
     *      是 `ovr` 的**纯函数**（每周同值、零 R 消耗）。
     *  ★ 不读 `d.contract.wage`：学徒合同**不进** `d.contract`（两套合同，§7.4），
     *    青训期读它 = 读一份与本相位无关的数字。
     *
     *  ★★★ P99 批 5 ④（R7-85 / 设计稿 §7.5 ③ v0.1ac）：**新增 `tier` 维度**。
     *    · `tier` 在青训期**不变**（只在 `applyEntry` 写一次）⇒ 本函数仍是 `(ovr, tier)` 的
     *      **纯函数** ⇒ 「每周同值」成立 ⇒ **J3 的精确签名继续成立**（第二条不变量）；
     *    · `tier` **缺失或非六档字符串 → 取最低档 `A3`**（**失败安全**方向：不凭空多给钱）。
     *      ★★ 代价必须明写：**旧档青训周薪 1160 → 500** —— 这是**改行为**、不是"零迁移"
     *         （用户 2026-09-15 已拍板，见 `CONFIG.YOUTH.WAGE_BASE` 注释）；
     *    · ★ **值域的单点真源 = `TIER_K` 自己的键**：本函数**不**再抄一份六档枚举
     *      （抄一份 = 又一处"同一语义两处"：日后加第七档时这份不会跟着变、且会静默并到 `A3`）；
     *    · ★★ **禁止 `K[tier] || 1.0` 这类 falsy 兜底**（与裁定 D 同源）：`K = 0` 会被静默
     *      改成 1.0，且"缺配置"与"合法值 0"在观测上不可区分 ⇒ 一律**按类型判缺失**。
     *  ★ 只 round **一次**（对整个乘积取整）—— 先取整再乘会给出 3016、与设计表的 3017 不符。 */
    youthWageOf(ovr, tier) {
      const Y = (window.CONFIG && CONFIG.YOUTH && CONFIG.YOUTH.WAGE_BASE) || null;
      /* ★★ 这里**不许**写 `Y.RATE || 0.35` 这种"falsy 兜底"（本行第一版就是这么写的，
         被探针 G3③a 当场抓到）：
           —— `0 || 0.35 === 0.35` ⇒ **RATE = 0 不可表达**（"把费率设成 0"会被静默改成 0.35），
              于是 `FLOOR` 这条下限**永远不可能被观测到** → 它成了"写进去的值永不生效"的
              死配置（R22 同族），而判据侧的"可达性构造"会以"不可达"的形式报出来。
           —— 同族的更本质问题：**用默认值兜"缺配置"与兜"合法值 0"在观测上不可区分**
              （与 R-i「基准必须与结论同界」是同一个病：`undefined` 与"语义默认值"不可分）。
         → 因此改为**按类型判缺失**；缺配置时返回 **0（= 不发薪）**而不是"悄悄按 0.35 发"：
           0 是**失败安全**方向（不会凭空造钱），且会被 F3 的精确签名当场抓到。
         ★ P99 批 5 ④：`TIER_K` 一并进这道**形状检查**（按类型判缺失，不看真假值）——
           它缺失/非对象时同样返回 0，**绝不**退化成一个"档位系数 = 1"的隐含默认。 */
      if (!Y || typeof Y.RATE !== "number" || typeof Y.FLOOR !== "number"
        || !Y.TIER_K || typeof Y.TIER_K !== "object") {
        if (!Career._ybWarned) {
          Career._ybWarned = true;
          console.warn("Career.youthWageOf：CONFIG.YOUTH.WAGE_BASE 缺失或形状不符 → 本次返回 0（青训期不发薪）。"
            + "★ 不静默兜默认费率 —— 那会让 CONFIG 里那几个数字变成可选，且掩盖配置错误。");
        }
        return 0;
      }
      const K = Y.TIER_K;
      /* ★ 档位归一（**按类型判缺失**）：`tier` 是字符串且 `TIER_K` 里确有该键 ⇒ 用它；
         否则（`null` / `undefined` / 数字 / 第七档…）→ `A3`（最低档 = 失败安全）。
         ★ 注意此处**不**判断"这条档位系数是不是 0" —— `K = 0` 是合法配置（"该档不发薪"），
           正是 falsy 兜底会吃掉它的那个值域。 */
      const t = (typeof tier === "string" && typeof K[tier] === "number") ? tier : "A3";
      const k = K[t];
      if (typeof k !== "number") {
        if (!Career._ybWarned) {
          Career._ybWarned = true;
          console.warn("Career.youthWageOf：CONFIG.YOUTH.WAGE_BASE.TIER_K 缺 '" + t + "' 档系数（按类型判缺失）"
            + " → 本次返回 0。★ 不退回 1.0 —— 那会让配置错误变成「按基准档发薪」的静默行为。");
        }
        return 0;
      }
      /* ★ 只 round 一次：`round(wageOf(ovr) × RATE × K)`（对整个乘积取整）。
         先 round 再乘会给出 3016、与设计稿 §7.5 ③ 表的 3017 不符。 */
      return Math.max(Y.FLOOR, Math.round(this.wageOf(ovr) * Y.RATE * k));
    },

    /** ★★ 周薪的**唯一费率入口** —— 按相位取费率。返回本周应发多少（0 = 不发）。
     *  · 青训期（`Youth.isProtected`：`academy` **与** `jump` 两个相位）→ 学徒周薪；
     *  · 成年期（`senior`）→ `d.contract.wage`（值域与语义一字未改）。
     *
     *  ★★ 关于 `isProtected` 这个判据（R7-29 反转的**准确**含义，别读反）：
     *    反转前它是**发薪的阻断条件**（`!isProtected` 才发）→ 青训期**零收入**；
     *    反转后它变成**费率的选取条件**（是青训期就取学徒费率）→ 青训期**照发**。
     *    ★ **同一个判据、相反的用法** —— 这正是"一个符号两个含义族"的高发处，
     *      故在此写明：本函数里 `isProtected` **不承担"发不发"**，
     *      "发不发"只由返回值 `> 0` 决定（成年期无合同 = 0）。
     *  ★ 跳级态（`phase === "jump"`）算青训期 ⇒ 也走学徒费率：跳级者仍是学徒合同
     *    （`Youth.jump` 走的是 `applyEntry({tier:"C"})`），且他受 17 岁出口约束（§7.4.1）。 */
    weeklyWageOf(d) {
      if (!d) return 0;
      if (window.Youth && Youth.isProtected(d)) {
        const ovr = (window.PlayerSystem && d.player) ? PlayerSystem.overall(d.player) : 0;
        /* ★★★ P99 批 5 ④（R7-85）：把**档位**取出来一起交给费率函数。
           · 本行**只做"取出来"**，归一（六档白名单 / 缺失取 `A3`）**统一在 `youthWageOf` 内** ——
             两处各判一次值域 = "同一语义两处"，正是本项目已复发过数次的那个形态；
           · **按类型判缺失**（与 `youthWageOf` 同口径）：`typeof !== "string"` ⇒ 传 `null`，
             **不写** `d.youth.tier || "A3"` 这类 falsy 兜底（那会把 `""` 也算成缺失，
             虽然此处语义上等价，但它让"值域"多出一个隐式默认 —— 一律禁止）；
           · `d.youth` 不存在（老档 / 未走 `Youth.ensure`）也不报错：传 `null` ⇒ 走最低档 `A3`。
           · ★ 这里**读 `tier` 不是相位判断** —— 相位判断仍是上一行那唯一的一处 `isProtected`。 */
        const tier = (d.youth && typeof d.youth.tier === "string") ? d.youth.tier : null;
        return this.youthWageOf(ovr, tier);
      }
      return (d.contract && d.contract.wage > 0) ? d.contract.wage : 0;
    },

    /** P24 分析落地：合同奖金（轻量真实合同结构）——进球奖金 / 出场费，按周薪比例，俱乐部赛事专享 */
    goalBonusOf(wage) { return Math.max(2000, Math.round((wage || 0) * 0.05)); }, // P1-20：1%→5%（评审：奖金过轻无感）
    appearanceBonusOf(wage) { return Math.max(1000, Math.round((wage || 0) * 0.03)); }, // P1-20：0.2%→3%

    /* ════ P104-B1 合同域扩展（D1~D8 已拍板，全按推荐） ════
       架构注：奖金**不落 contract 字段**——沿用 P1-20 先例「公式即时算」，
       appearanceBonusOf/goalBonusOf/assistBonusOf 三件套同源同款；合同结构
       {years,wage,releaseClause?} 保持不变，旧档零迁移（v0.1 规格的"扩字段"
       方案经实测撤销：transfer.js 已有 signingBonus/releaseClause 全套）。 */
    /** P104-B1：助攻奖金 —— 出场费的一半（低于进球 5%，与真实合同结构同序） */
    assistBonusOf(wage) { return Math.max(800, Math.round((wage || 0) * 0.015)); },

    /** P104-B1 经纪人佣金分档（D4 拍板：按周薪分档固定 5/8/12%，不可谈）。
        分档锚 wageBase 曲线：OVR70≈1.5万 → 低档；OVR80≈9万 → 中档；
        OVR85+ 进入 30 万顶薪档。 */
    AGENT_TIERS: [[20000, 0.05], [300000, 0.08], [Infinity, 0.12]],
    agentFeeRateOf(wage) {
      const w = wage || 0;
      for (const [cap, rate] of this.AGENT_TIERS) if (w < cap) return rate;
      return 0.12;
    },
    /** 佣金 = 费率 × (签字费 + 合同期内涨薪差总额)。涨薪差只在 Δ>0 时计（降薪不倒贴）。
        years 传合同年限；signingBonus 传**实际入账额**（含 TAL 加成后的到手值）。
        ★ P185：第 5 参 d（可选）——「税务规划」技能按 (星级/5)×20% 压抽成（5★ 12%→9.6%）；
        旧调用不传 d = 无技能加成（兼容）。 */
    agentFeeOf(signingBonus, oldWage, newWage, years, d) {
      const delta = Math.max(0, (newWage || 0) - (oldWage || 0));
      const base = (signingBonus || 0) + delta * 52 * (years || 0);
      let rate = this.agentFeeRateOf(newWage || oldWage || 0);
      if (d && window.Skills && Skills.mult) rate *= Math.max(0.5, Skills.mult(d, "taxPlanner", -0.20) || 1);
      return Math.round(rate * base);
    },
    /* ════ P297（Tap 玩家实录「续约/转会后资金变负数」）：经纪人佣金落账**单点** ════
       根因：agentFeeOf 的应付额 = 费率 ×（签字费 + 涨薪差×52×年限），暴涨薪的续约/
       转会一笔就能算出远超身家的佣金，而四处扣款点全部裸减 d.money → 击穿为负。
       现实口径：佣金从现有资产支付，付不起的部分不再倒扣——**球员不为签约负债**。
       实付 = min(应付, 当前余额)；agentFeesPaid 只记实付；返回实付额（UI 如实展示）。 */
    payAgentFee(d, fee) {
      if (!fee || fee <= 0) return 0;
      const bal = Math.max(0, d.money || 0);
      const paid = Math.min(fee, bal);
      if (paid > 0) {
        d.money = bal - paid;
        d.stats = d.stats || {};
        d.stats.agentFeesPaid = (d.stats.agentFeesPaid || 0) + paid;   // 账目累计（合同页展示）
      }
      return paid;
    },

    /* ════ P104-B2 主动续约谈判（D2: 1+1 轮 / D3: 仅剩 1 年才掉信任） ════
       纯函数三件套 —— UI 只调用，不内写公式；探针直测本层。
       ★ 全程零 R 调用（确定性公式），soak 基线不漂移。 */
    /** 俱乐部续约报价：应值（wageOf）与当前周薪取高 × 系数上浮。
        perfScore∈[0,1] = 评分 0.6 + 名气 0.2 + 出场地位 0.2。 */
    renewalQuote(d) {
      const ovr = window.PlayerSystem ? PlayerSystem.overall(d.player) : (d.player && d.player.ovr) || 70;
      const team = (window.teamById && teamById(d.clubId)) || null;
      const strength = team ? (team.strength || team.ovr || 60) : 60;
      const target = this.wageOf(ovr, strength);
      const ss = d.seasonStats || {};
      const avg = ss.apps ? (ss.ratingSum || 0) / ss.apps : 6.5;
      const perf = Math.max(0, Math.min(1, (avg - 6.5) / 0.9));
      const fameN = Math.min(1, (d.fame || 0) / 2e6);
      const starter = (ss.apps || 0) >= 10 ? 1 : 0;
      const perfScore = 0.6 * perf + 0.2 * fameN + 0.2 * starter;
      const cur = d.contract ? (d.contract.wage || 0) : 0;
      /* ★ P185：谈判专家技能 = 上浮系数放大（5★ ×1.10 → uplift 上限 1.35→1.485）——
         「合同桌上不让步」落在续约报价的上浮空间。 */
      let uplift = 1.05 + 0.30 * perfScore;                      // 1.05 ~ 1.35（D2 系数域）
      if (window.Skills && Skills.mult) uplift *= Math.max(1, Skills.mult(d, "negotiator", 0.10) || 1);
      const nw = Math.min(this.WAGE_CAP, Math.round(Math.max(cur * uplift, target)));
      return { nw, perfScore, target, cur };
    },
    /** 还价：报价再 +10%，俱乐部确定性应允判定（D3：不掷骰）——
        应值高于还价（俱乐部本就欠薪）或 perfScore ≥ 0.5（表现说话）→ 应允。 */
    renewalCounter(quote) {
      const nw2 = Math.min(this.WAGE_CAP, Math.round(quote.nw * 1.10));
      const ok = quote.target >= nw2 || quote.perfScore >= 0.5;
      return { nw2, ok };
    },
    /** 续约落地：years=3（对齐 applyOffer 口径），经纪人抽佣（D4），仅剩 1 年时谈判失败掉信任（D3）。
        P104-B4 第三参 clauseFee：解约金随新合同重谈（renewalClauseQuote 的档位 fee）——
        传了落 releaseClause，不传 = 无条款（旧条款随 contract 对象重建自然清除，设计内语义）。
        失败路径只动信任与冷却旗标，不改合同。返回 { ok, wage, fee, clauseFee, msg }。 */
    renewalAccept(state, wage, clauseFee) {
      const d = state.data;
      const old = d.contract ? (d.contract.wage || 0) : 0;
      const fee = this.agentFeeOf(0, old, wage, 3, d);   // ★ P185：传 d → 税务规划技能压抽成
      d.contract = { years: 3, wage: wage };
      if (clauseFee) d.contract.releaseClause = { fee: Math.round(clauseFee) };
      /* P105-B2：续约 = 与现队重新约定，旧承诺作废（只有转会签约才有承诺） */
      if (d.transfer && d.transfer.promise) d.transfer.promise = null;
      /* ★ P297：佣金走 payAgentFee 单点——不超过余额，资金永不击穿为负 */
      const feePaid = this.payAgentFee(d, fee);
      return { ok: true, wage, fee: feePaid, clauseFee: clauseFee ? Math.round(clauseFee) : 0,
        msg: "续约三年，周薪 " + this.fmtMoney(wage) +
             (clauseFee ? "，附解约金条款 " + this.fmtMoney(clauseFee) : "") +
             (feePaid > 0 ? "（经纪人老狐抽走 " + this.fmtMoney(feePaid) + "）" : "") };
    },

    /* ══════════════════════════════════════════════════════════════════════════
       ★★★ P99 批 4c ①：**赛季初始化的唯一路由** + **17 岁强制出口**
       --------------------------------------------------------------------------
       为什么必须"唯一路由"：`SeasonSystem.initSeason`（成年）与
       `Youth.initYouthSeason`（青训）是**两份实现**（设计稿 §7.4.1 明文要求
       "容器复用、函数不复用"，禁止给 `initSeason` 加 `if` 分支）——
       两份实现 + 两个调用点 = **一个状态两处分派**，正是本项目已复发四次的失效形态
       （`club_events` 链 / R18 / `d.stats` 五字段 / `LEAVE_REASONS` 与注释）。
       ⇒ 分派只在本函数一处；两个调用点（本文件 `advanceDay` 的休赛期结束 /
       `v2/create.js` 签约）都走它。

       ★ 青训期**不需要**重新推导青年队 id：青训期 `d.clubId` / `d.leagueId`
         **本来就是**青年队 / 青年联赛 id（设计稿 A1 更正段：`initYouthSeason` 写点 +
         `Youth.leave` 还原点）⇒ 直接用调用方传进来的 id，
         **不在这里再写一遍 `"y" + 成年id` 的前缀规则**（那会是第二份命名空间规则）。

       ★ 判据用 `Youth.isProtected`（`academy` **与** `jump`）而**不是** `inAcademy`，
         但两个相位走的初始化**不同**，必须分开：
           · `academy` → 青年赛程（`Youth.initYouthSeason`）
           · `jump`    → **一线队赛程**（跳级者在一线队注册、按一线队规则比赛）
         ⇒ 这是"同一个判据、两种处置"的高发处，故在此写明，避免后来者"统一"成一种。

       ★★★ **返回值为什么用 `route*` 前缀，而不直接复用相位 token**（J12 的正面执行）：
         本函数返回 `"routeExit" / "routeAcademy" / "routeJump" / "routePro"` ——
         它们是**路由标签**，**不是**相位值。两个理由，缺一都不成立：
           ① J12 的静态判据（`tools/_p99_youth_probe.js` 的 G1）断言"相位字面量只允许
              出现在 `youth.js`"。本函数第一版直接返回 `"jump"` / `"academy"` 字面量，
              当场被 G1 抓到 **2 处泄漏**（career.js + v2/create.js）——**判据是对的**：
              它拦下的不是"多写了两个字符串"，而是**把相位 token 复用成了第二种含义**。
           ② 复用相位 token 会让"我是什么相位"与"这次走了哪条路由"**在类型上不可分**
              （只看得见字符串）—— 这正是本项目已复发多次的"一个符号两个含义"。
             加前缀后，路由标签与相位值**永远不可能相等**，后续任何扫描器都能分辨。 */
    beginSeason(state, clubId, leagueId) {
      const d = state.data;
      /* ★★ P191：clubId 青年 id 残留防御（P188 leagueId 防御的**姊妹层**）——
         17 岁强制出口/leave 的还原在 clubId 侧的兜底（youth.js P191 自愈）之外的
         **第二道闸**：clubId 是青年队 id（Youth.teamById 命中）时按 y 前缀派生规则
         剥出成年母队（youth_data.js:95 铁则），leagueId 交给下方现有防御链反查。
         ★ 豁免 = **青训相位**（academy：clubId 本来就是青年 id，是合法态）；
         出口分支（forceYouthExit 先跑、phase 已改 senior）与成年/jump 路由照常覆盖。
         正常建档（create.js:927 写成年 academyId）不触发，零漂移。 */
      const _inYouthPhase = !!(window.Youth && Youth.isProtected && Youth.isProtected(d) && Youth.inAcademy && Youth.inAcademy(d));
      if (!_inYouthPhase && clubId && window.Youth && Youth.teamById && Youth.teamById(clubId)) {
        const _ad = (typeof clubId === "string" && clubId.charAt(0) === "y") ? clubId.slice(1) : null;
        const _ok = _ad && window.teamById && window.teamById(_ad);
        if (_ok) {
          console.warn("Career.beginSeason：clubId=" + String(clubId) + " 是青年队 id（出口残留）→ 剥前缀自愈 → " + _ad);
          clubId = _ad;
          d.clubId = _ad;
          const _lgFix = this._leagueIdOfClub(_ad);
          if (_lgFix) leagueId = _lgFix;
        }
      }
      /* 17 岁强制出口**先于**初始化判定（顺序反了会先建出一整季青年赛程再作废：
         白消耗随机数 + 白建积分榜 + 白建青年杯）。
         ★ 但**不依赖本函数被调用**来保证"不卡死" —— 见 `advanceDay` 里的每日守卫。 */
      if (Career._forceYouthExit(state)) {
        /* ★★ 出口这一格**不能**用调用方传进来的 `leagueId`：调用方是在"青训期"这个前提下
           算出的 id（青训期 `d.leagueId` = **青年联赛 id**），而出口已经发生
           ⇒ 那对 id 已过期，照用会建出一份"队/联赛都不存在"的赛程而**可能不报错**。
           ⇒ 改为从**不变量**派生：出口后 `d.clubId` 必定是可解析成年队 id（R7-21），
             联赛由它反查（见 `_leagueIdOfClub`）。
           ★ 反查不到 ⇒ **不硬编一个联赛**，只 warn + 本季不初始化：
             那种状态本身已经违反 R7-21，属**上游**缺陷，必须让它在读数里可见。 */
        const adult = Career._leagueIdOfClub(d.clubId);
        if (!adult) {
          console.warn("Career.beginSeason：17 岁出口后无法从 d.clubId=" + String(d.clubId)
            + " 反查成年联赛 ⇒ 本季未初始化（**不**用调用方那份青训期算出的 leagueId ——"
            + " 那会建出一份队/联赛都不存在的赛程，且可能不报错）。请检查 Youth.leave 的落点队还原。");
          return "routeExitNoLeague";
        }
        SeasonSystem.initSeason(state, d.clubId, adult);
        return "routeExit";
      }
      if (window.Youth && Youth.isProtected(d)) {
        if (Youth.inAcademy(d)) { Youth.initYouthSeason(state, clubId, leagueId); return "routeAcademy"; }
        SeasonSystem.initSeason(state, clubId, leagueId);   // jump：一线队赛程
        return "routeJump";
      }
      /* ★★ P188 防御（玩家实测「过了整季推不动」）：成年/jump 初始化前校验 leagueId
         可解析——青训出口/邀约转移的旧档可能残留青年联赛 id（leave 的还原在 P188 才补上）
         ⇒ 直接初始化会在成年数据里查表 undefined.teams 抛 TypeError，被 refresh 的
         try-catch 吞掉 = 玩家无限"日程推进中"。兜底序：反查落点队 → 仍失败 warn（由
         advanceDay 调用方的 last-resort 兜底接管）。 */
      const _lgOk = (typeof LD === "function" && (function () { try { return !!LD()[leagueId]; } catch (e) { return false; } })());
      if (!_lgOk) {
        const back = this._leagueIdOfClub(clubId);
        if (back) {
          console.warn("Career.beginSeason：leagueId=" + String(leagueId) + " 不可解析（疑为青年联赛残留）→ 反查落点队得 " + back);
          leagueId = back;
        } else {
          console.warn("Career.beginSeason：clubId=" + String(clubId) + " / leagueId=" + String(leagueId) + " 均不可解析 → 交由调用方 last-resort 兜底");
        }
      }
      SeasonSystem.initSeason(state, clubId, leagueId);
      return "routePro";
    },

    /** ★★★ P99 批 4c ①：**17 岁强制出口**（设计稿 §6.4）。
     *  返回 true = **本次调用真的出口了**（调用方须按"已非青训期"继续）。
     *  幂等：出口后 `isProtected` 转假 ⇒ 后续调用恒返回 false。
     *
     *  ── 判据（§6.4 / §8 R3）──
     *    `Youth.isProtected(d)`（**academy 与 jump 都在列**）**且** `player.age >= 17`。
     *    ★ 用 `isProtected` **不是** `inAcademy`：跳级签豪门 + 三年零出场
     *      必须也被强制出口，否则**永久卡死**（违反支柱 P3）。
     *
     *  ── 为什么挂在**每日**路径上（`advanceDay`），而不是只挂在赛季初始化上 ──
     *    赛季初始化只有在 `d.offseason` 变为真、且走到"休赛期结束"那一条分支时才跑。
     *    而"青训期是否进休赛期"目前是**待设计口径**（批 5 ⑤-2 的 Q2 第 8 格）。
     *    ⇒ 把出口**只**挂在赛季初始化上，等于把"不卡死"这条支柱**寄托在一个待裁口径上**。
     *    每日路径是**必然执行**的，故用每日守卫保证 P3 无条件成立。
     *    ★ 时机口径（登记）：§6.4 原文写"季末判定"，本实现落在"年龄跨过 17 岁后的第一天"
     *      （`player.age++` 在 `systems.js:402` 的季末成长里发生）⇒ 实际效果 = **下一季开始前**，
     *      与"季末"在同一次休赛期窗口内，但**不是** `finishYouthSeason` 的那一帧。
     *      差别只影响"哪一屏弹三选一"（属 ⑤-2 的 UX），不影响"是否卡死"。
     *
     *  ── ★★ 不发明任何阈值（A15 待标定）──
     *    三支（母队留用 / 外租 / 转投低级别）的判定要 `PROMOTE_LINE`、`PEER_SLOT`、
     *    `WINDOW` 与 `Division.pair` 的可达性 —— 而 **`CONFIG.YOUTH.ACADEMY` 目前在
     *    config.js 里根本不存在**（A15 待标定）⇒ 本函数**只**做两件事：
     *      ① 保证有一个**恒可达**的出口（`fallback`：设计稿 §6.5 明说"必然存在（池非空）"）；
     *      ② 把"三支判定尚未实装"这件事**可见地报出来**（console.warn 一次）。
     *    ★ 与 `Career.youthWageOf` 同口径：**按类型判缺失 → 缺配置走失败安全方向 →
     *      只 warn 不抛**。**不**写 `PROMOTE_LINE || 65` 这种"falsy 兜默认值"
     *      （那会让"把阈值设成 0"不可表达，且掩盖配置错误）。 */
    _forceYouthExit(state) {
      const d = state && state.data;
      if (!d || d.retired) return false;
      if (!window.Youth || !Youth.isProtected(d)) return false;
      const age = d.player ? d.player.age : 0;
      /* ★ P113：强制毕业年龄 17 → 19（CONFIG.YOUTH.FORCE_EXIT_AGE 单一真相源；用户拍板）。
         常规出口已由青训结算卡的生命周期邀约承担（v2/flow.js）；本守卫只兜"UI 层漏选"的底。 */
      const _fe = (window.CONFIG && CONFIG.YOUTH && CONFIG.YOUTH.FORCE_EXIT_AGE != null)
        ? CONFIG.YOUTH.FORCE_EXIT_AGE : 19;
      if (!(age >= _fe)) return false;
      /* 缺配置 → 走保底出口（恒可达），并把"三支未实装"报出来（只报一次） */
      const YA = (window.CONFIG && CONFIG.YOUTH && CONFIG.YOUTH.ACADEMY) || null;
      if (!YA && !Career._exitBranchWarned) {
        Career._exitBranchWarned = true;
        console.warn("Career._forceYouthExit：CONFIG.YOUTH.ACADEMY 缺失（A15 待标定）⇒ " + _fe + " 岁出口走**保底支 fallback**"
          + "（「三支：母队留用 / 外租 / 转投低级别」的判定尚未实装，待 A15 回填后接入）。"
          + "★ 不发明阈值、不静默兜默认值 —— 保底支是设计稿 §6.5 明写「必然存在」的那一支。");
      }
      const ok = Youth.leave(d, "fallback");
      if (!ok) {
        console.warn("Career._forceYouthExit：Youth.leave 拒绝出口（相位 " + String(d.phase)
          + "，age=" + age + "）—— 这会让青训期**卡死**，属支柱 P3 违约，请检查 youth.js 的 leave 守卫");
      }
      return ok;
    },

    /** 错过的比赛（伤病等）—— ★ P178（用户拍板「缺席不能 0:3 判负」）：由队友真实模拟战绩
     *  （SeasonSystem.simulateAbsentMatch 泊松强度模型 + 核心缺阵削弱），比分进积分榜/杯赛，
     *  士气按球队战绩分档（胜 0 / 平 −3 / 负 −6，原一刀切 −8 退役）。 */
    processMissedFixtures(state) {
      const d = state.data;
      if (!d.fixtures) return null;
      // 已淘汰杯赛的残余赛程不算缺席（否则玩家被淘汰后，后面每一轮都会被误判
      // 判负并扣士气）。⚠ cup / cc_ko / scc 三条线都要排除（原实现只排除了 cup）
      const alive = (obj) => obj && obj.alive !== false;
      const missed = d.fixtures.filter(f => !f.played && f.day < d.dayIndex &&
        !((f.type === "cup" || f.type === "cc_ko" || f.type === "scc") &&
          !alive(f.type === "cup" ? d.cup : f.type === "cc_ko" ? d.cc : d.scc)));
      if (!missed.length) return null;
      let w = 0, dr = 0, l = 0;
      const lines = [];
      for (const f of missed) {
        const userIsHome = f.match.home.id === d.clubId;
        /* ★ P178：球队模拟比分（泊松强度 + 核心缺阵削弱）；玩家个人数据全 0（缺席语义保留） */
        const sc = SeasonSystem.simulateAbsentMatch(state, f);
        const result = { home: sc.home, away: sc.away, userGoals: 0, userAssists: 0, rating: 0, played: false, motm: false, missed: true };
        SeasonSystem.applyResult(state, f, result);
        /* ★★★ P99 批 4（R7-15①；判据 ⑤a 的恒红根因）：**缺席的比赛也要把同轮其余场次记进积分榜**。
           历史缺陷：本函数只调 `applyResult`（只记玩家那 2 行），而正常路径
           （`v2/settlement.js:308`）是 `applyResult` **+** `simulateRound` 两者都调
           → 每有一场缺席的联赛，该轮其余 **n−2** 场**永远不会进积分榜**，
           于是 `Σp` 少 `(n−2)×缺席场次`，而**玩家行 `p` 完全正确**（不算错的那半边）。
           ★ 它不报错、不卡死，只有"积分守恒律"这一半断言能看见 → ⑤a 由此**长期红着**，
             而当时的处置是"标成 explained 并进 warns"（= 让一个真门禁长期不生效）。
           ★★ 口径与正常路径**逐字同源**：只对 `type === "league"` 调 `simulateRound`
             （杯赛/洲际靠 `applyResult` 自己的分支，`simulateRound` 只认联赛积分榜）。
           ★★ 顺序与 `settlement.js:308` 一致（先 `applyResult` 再 `simulateRound`）：
             `simulateRound` 的跳过集来自 `fixture.match`（不是积分榜状态），
             故顺序不影响结果 —— 但**保持一致**才能让"两条路径同构"这件事可被断言。 */
        if (f.type === "league") SeasonSystem.simulateRound(state, f);
        const my = userIsHome ? sc.home : sc.away, opp = userIsHome ? sc.away : sc.home;
        if (my > opp) w++; else if (my < opp) l++; else dr++;
        const oppName = userIsHome ? f.match.away.name : f.match.home.name;
        lines.push((userIsHome ? "主" : "客") + "场 " + my + ":" + opp + " " + (userIsHome ? f.match.away.name : f.match.home.name) + (my > opp ? "（胜）" : my < opp ? "（负）" : "（平）"));
      }
      // ★ P178 士气按战绩分档：赢球不罚、平小罚、输中罚（原一刀切 −8 退役）
      const moraleHit = l > 0 ? -6 : (dr > 0 ? -3 : 0);
      if (moraleHit) this.applyEffects(state, { morale: moraleHit });
      const resText = (w ? w + " 胜" : "") + (dr ? (w ? " " : "") + dr + " 平" : "") + (l ? (w || dr ? " " : "") + l + " 负" : "");
      return { title: "缺席比赛",
        text: "因伤病/缺席错过了 " + missed.length + " 场比赛，队友们交出 " + resText.trim() + "："
          + lines.slice(0, 4).join("；") + (lines.length > 4 ? "；等 " + lines.length + " 场" : "") + "。",
        effects: { morale: moraleHit } };
    },

    /** ★★★ P99 批 4c ①：**成年队 id → 它所属的成年联赛 id** 的反查（数据源 = `LD()` 单一真源）。
     *  返回 null = **查不到**（0 支命中）或**有歧义**（≥2 支命中）⇒ 调用方必须显式处置，**不猜**。
     *
     *  ── 为什么需要它（这是 ① 落地时**当场发现的一个真缺陷**，不是预防性设计）──
     *    17 岁出口那一格原写法是"用调用方传进来的 `clubId`/`leagueId` 去 `initSeason`"。
     *    但调用方（`advanceDay` 的休赛期结束段）是在**青训期这个前提下**算出的 id：
     *      `cId = d.nextClub?…: d.clubId`（青训期 = **青年队 id**）
     *      `lId = d.nextClub?…: d.leagueId`（青训期 = **青年联赛 id**）
     *    而 `_forceYouthExit` 已经在**这之前**把相位切到 `senior` 并把 `d.clubId` 还原成成年队
     *    ⇒ 那对 id **已经过期**，照用会 `initSeason(state, 青年id, 青年联赛id)` → 建出一份
     *      "队不存在 / 联赛不存在"的赛程 —— 而它**可能不报错**（`season.js:47` 的 Division 分支、
     *      `_buildLeagueFixtures` 找不到玩家队时只是静默生成空赛程）。
     *  ── 为什么反查而不是"让调用方重新算" ──
     *    出口后的 `d.clubId` 是**不变量**（R7-21：必为可解析成年队 id），
     *    而 `d.leagueId` 在出口当季**仍是脏的**（青年联赛 id；`youth.js` 已登记其还原口径待裁）。
     *    ⇒ **从不变量派生，不信脏字段**：这与"能消灭就不要断言"同族 —— 与其断言二者一致，
     *      不如只读那个有保证的。
     *  ★ 副作用（正面）：`SeasonSystem.initSeason` 会在 `season.js:36` **同时**写
     *    `d.clubId` / `d.leagueId` ⇒ 走完这一格，那条"`d.leagueId` 出口当季是脏的"登记
     *    **在这个时机被自然修好**，不需要去动 `youth.js` 的 `leave`（那会多一个写点）。 */
    _leagueIdOfClub(clubId) {
      if (!clubId || typeof LD !== "function") return null;
      let L = null;
      try { L = LD(); } catch (e) { return null; }
      if (!L || typeof L !== "object") return null;
      const hits = [];
      for (const lid of Object.keys(L)) {
        const lg = L[lid];
        if (lg && Array.isArray(lg.teams) && lg.teams.some(t => t && t.id === clubId)) hits.push(lid);
      }
      return hits.length === 1 ? hits[0] : null;
    },

    /** 推进一天（非比赛日） */
    advanceDay(state) {
      const d = state.data;
      let notes_income = null;
      d.dayIndex++;
      // 日期推进（2/1 → 12/15，跨年）
      d.date.day++;
      const dim = DAYS_IN_MONTH[d.date.month];
      if (d.date.day > dim) {
        d.date.day = 1; d.date.month++;
        if (d.date.month > 12) { d.date.month = 1; d.date.year++; }
      }
      /* ══════════════════════════════════════════════════════════════════════════
         ★★★ P99 批 4c ①：**17 岁强制出口的每日守卫**（设计稿 §6.4；判据与理由见
         `_forceYouthExit` 的长注释）
         --------------------------------------------------------------------------
         ── 位置（不是随手放的）──
           在**日期推进之后**、**每日恢复 / 周薪 / 事件之前**：
             · 之后 ⇒ 「年龄跨过 17 岁后的第一天」这个时点由 `d.date` 的真实推进决定；
             · 之前 ⇒ 本日的**一切**（恢复 / 收入 / 事件 / 征召）都在**新相位**下发生，
               否则这一天会"半天算学徒、半天算职业"。
           ★ 唯一被允许的残留不连续：出口**当周**若恰逢 `dayIndex % 7 === 0`，那一次周薪
             会按新相位的费率发（≤1 周）。这是相位切换的**必然**结果，不是缺陷；
             若要消除它就得让相位在周中不可变 —— 那会把"17 岁出口"推迟到周末，
             于是"不卡死"又要多依赖一个时钟口径。故保留并在此登记。

         ── 为什么挂在**每日**路径，而不是只挂在赛季初始化（`Career.beginSeason`）──
           `beginSeason` 只在 `d.offseason` 变为真、且走到"休赛期结束"那一格时才跑；
           而「青训期是否进休赛期」目前是**待设计口径**（批 5 ⑤-2 的 Q2 第 8 格）。
           ⇒ 把"不卡死"（支柱 P3）寄托在一个待裁口径上 = 用未定的东西背书已承诺的东西。
           每日路径是**必然执行**的，故 P3 无条件成立。
           ★★ 登记（本守卫**不覆盖**的面）：它只保证"不会永久卡在青训期"，
             **不保证"青训期能连打多季"** —— 第 2 季起的赛程重建要走 `beginSeason`，
             而那取决于上面那个待裁口径（⑤-2）。两件事不要互相背书。

         ── 成年期的开销 = 0 ──
           `Youth.isProtected` 对 `"senior"` 首行即返回 false ⇒ 零状态改动、零 R 消耗
           ⇒ **成年生涯逐位不变**（① 的 soak 基线不受影响，这是刻意保证的）。

         ── 返回值**刻意忽略** ──
           这里是"保证不卡死"的**守卫**，不是 UI 触发点。出口的三选一交互属 ⑤-2
           （§6.5 四支 + A15 待标定）⇒ 本守卫**不生成事件**、不改动 `advanceDay` 的
           返回值形状 —— 否则每日事件流与 R 消耗序都会漂移，且"哪一屏弹"是 UX 口径。
         ══════════════════════════════════════════════════════════════════════════ */
      Career._forceYouthExit(state);
      /* ★ P171：每日疲劳恢复整段退役（recoverBonus/住房舒适度恢复/体质恢复）——
         疲劳机制已删；住房舒适度的玩法出口改走「每日训练经验加成」（systems.dailyTrain），
         tickTempEffects 的临时效果若无其他消费点会自然闲置（详见 P171 日志）。 */
      if (d.injuryDays > 0) { d.injuryDays--; if (d.injuryDays === 0) { d.flags = d.flags || {}; d.flags.justReturned = true; } }
      /* 周薪发放（每 7 天真实入账，高周薪终于有意义）
         ★★★ P99 批 4（R7-29 第二半 · **单一发薪路径**）：本处**只**问
           `Career.weeklyWageOf(d)`"本周发多少"，**不做任何相位判断** ——
           相位分档全部发生在那一处（见其函数注释）。
           ★ 这里的 `_w > 0` **不是**相位判断：它逐位等价于旧写法的
             `d.contract && d.contract.wage > 0`（成年期无合同 = 0；青训期恒 > 0）。
           ★★ 探针 G3① 会断言本段内**不出现** `Youth.isProtected` / `d.phase ===`
             —— 若日后有人在此补一句相位 `if`（= 第二套发薪代码），立刻红。 */
      if (d.dayIndex % 7 === 0 && !d.retired) {
        const _w = Career.weeklyWageOf(d);
        if (_w > 0) {
          d.money += _w;
          d.stats.wageEarned = (d.stats.wageEarned || 0) + _w;
          try { if (window.Finance) Finance.log(d, "薪资", _w, "周薪"); } catch (e) { /* 流水失败不影响发薪 */ }
        }
      }
      /* ★ P128b 邀约过期检查（静默婉拒进冷却；无 R 消耗——纯状态检查不进 R 序）。
         正常时序下邀约卡是模态的（玩家必须处理才能推进日期），此处只兜极端时序。 */
      if (d.commerce && d.commerce.active && d.commerce.active.expireDay != null && d.dayIndex > d.commerce.active.expireDay) {
        this.declineCommerce(state);
      }
      if (d.dayIndex % 7 === 0 && window.Transfer) Transfer.weeklyTick(state); // P61：雪藏周结算（士气衰减）
      /* ★★ P120：训练师周薪（随发薪日扣款；养不起全员自动离队）
         —— 与发薪同频但**独立段落**（不是发薪相位判断，不触探针 G3① 的"第二套发薪代码"红线）。
         ★ P215：付费周同步结算训练师自动成长（weeklyGrowth——欠薪离队周不成长）。 */
      if (d.dayIndex % 7 === 0 && !d.retired && window.Trainers) {
        const tc = Trainers.weeklyCost(d);
        if (tc < 0) notes_income = (notes_income ? notes_income + "；" : "") + "训练师团队因欠薪集体离队…";
        else if (tc > 0) {
          const gw = Trainers.weeklyGrowth(state);
          for (const g of (gw.grown || [])) {
            notes_income = (notes_income ? notes_income + "；" : "") + "训练师团队帮你把「" + g.name + "」练到了 " + g.to;
          }
        }
      }
      // 延迟效果结算（生活事件 delayedEffect：到期弹出后续事件并应用数值）
      if (d.delayedQueue && d.delayedQueue.length) {
        const due = d.delayedQueue.filter(x => x.dueDay <= d.dayIndex);
        if (due.length) {
          d.delayedQueue = d.delayedQueue.filter(x => x.dueDay > d.dayIndex);
          for (const x of due) this.applyEffects(state, x.effects || {});
          return { title: "旧事重提", text: due[0].message || "之前的选择有了后续。", effects: {}, _notes: due[0]._notes || [] };
        }
      }
      // 月度分红（餐厅合伙等长期投资：每 30 天入账一次，按年扣减）
      if (d.incomeStreams && d.incomeStreams.length && d.dayIndex > 0 && d.dayIndex % 30 === 0) {
        let sum = 0;
        d.incomeStreams = d.incomeStreams.filter(s => {
          if (s.remainingMonths > 0) { sum += s.monthly; s.remainingMonths--; return s.remainingMonths > 0; }
          return false;
        });
        if (sum > 0) { d.money += sum; d.stats.wageEarned = (d.stats.wageEarned || 0) + sum; notes_income = "分红入账 +" + Career.fmtMoney(sum); try { if (window.Finance) Finance.log(d, "分红", sum, "长期分红月结"); } catch (e) { /* ignore */ } }
      }
      /* ★★ P128c 财富月结（与分红同节拍）：定期到期 → 基金净值（有持仓才耗 R）→ 产业分红/爬坡。
         摘要并入 notes_income 一并播报；全程 try 包裹（理财失败不阻断每日推进）。 */
      if (d.dayIndex > 0 && d.dayIndex % 30 === 0 && window.Finance) {
        try {
          const _ms = Finance.monthlySettle(state);
          const _parts = [];
          if (_ms.depositGain > 0) _parts.push("定期到期 +" + this.fmtMoney(_ms.depositGain));
          if (_ms.fundMoved.length) _parts.push("基金净值变动（" + _ms.fundMoved.join("、") + "）");
          if (_ms.bizGain > 0) _parts.push("产业分红 +" + this.fmtMoney(_ms.bizGain));
          if (_parts.length) notes_income = notes_income ? notes_income + "；理财月结：" + _parts.join("，") : "理财月结：" + _parts.join("，");
        } catch (e) { console.warn("finance monthly", e); }
      }
      // 士气回归基线（天赋：天生领袖 → 士气下限 70；出身：足球世家 → 士气下限 +5；技能：更衣室黏合剂；性格：职业素养 5★ +5）
      const moraleBase = 65 + (window.Skills ? Skills.bonus(d, "lockerRoom", 10) : 0) + (window.Personality ? Personality.bonus(d, "professionalism", 5) : 0); // 黏合剂 5★ → 75，职业素养 5★ 再 +5 → 80
      d.morale += (moraleBase - d.morale) * 0.05;
      if (window.TAL && TAL.moraleFloor) { const _mf = TAL.moraleFloor(d); if (_mf > 0) d.morale = Math.max(d.morale, _mf); } // P113 五档：天生领袖士气下限 55~80
      if (window.IDENTITY && d.origin && d.origin.fx && d.origin.fx.moraleFloor) d.morale = Math.max(d.morale, d.origin.fx.moraleFloor);
      // 国际赛事调度（征召公布/国家队比赛日）
      if (window.INTL && !d.retired) {
        const intlEv = INTL.onDay(state);
        if (intlEv && intlEv.type === "match") return null; // 比赛日由 fixtureToday 呈现，不作为事件
        if (intlEv) {
          if (INTL.takePendingEvent) INTL.takePendingEvent(state); // 事件已直接返回，清掉暂存防重复
          return intlEv;
        }
        // fixtureToday（Hub 渲染/harness）可能已先行触发并吞掉本日公告——补发
        const pend = INTL.takePendingEvent ? INTL.takePendingEvent(state) : null;
        if (pend) return pend;
      }
      // 休赛期结束 → 新赛季初始化
      /* ★ P100-B1：判定改为「当前日期已达**下赛季起点**」（LEAGUE_CALENDAR，calStart(season)）。
         欧洲跨年季休赛期 = 5 月下旬 ~ 8 月中；中超 = 11 月上 ~ 次年 3 月上。
         旧硬编码（month===2 && day>=2 / month 3..11）只对旧抽象轴成立。
         ★★ P197 修正（用户实测截图实锤：S1 于 2010.12 结束后休赛期空转到 2011.12 还没完）：
           终点应为 `calStart(d.leagueId, d.season)`——finishSeason 结算时已 `d.season++`（season.js:904），
           自增后的 label 就是下赛季锚年，且 initSeason/initYouthSeason 的日期归一口径正是
           `calStart(leagueId, d.season)`（season.js:39）。旧 `+1` 在真实年份轴下多拖整整一年
           （青训 12 月休赛 → 次年 2 月该开季，却等到第三年 2 月），随后 init 再把日期**回拨**一年，
           形成「休赛期 13 个月 + 日历倒退」的双重病灶。抽象轴探针（season=小序数）因 calGE 的
           年份数值比较恒真而从未暴露。 */
      if (d.offseason && CONFIG.calGE(d.date, CONFIG.calStart(d.leagueId, d.season))) {
        d.offseason = false;
        // P62 租借期满：未 permanent 转会 → 自动回归母队
        const backLoan = (!d.nextClub && d.loan) ? d.loan : null;
        /* ★ P301（玩家反馈「租借没有期限」修复）：休赛期租借的开季路由。
           applyLoan 产物 = nextClub（租借俱乐部）+ d.loan.endSeason（租期凭证）。
           此前开季把 nextClub 当永久转会处理并无条件清 d.loan ⇒ 归队永不触发、
           外租门重开可连环租借。修复：endSeason > 当前季 = 租借*启程*年——
           去租借俱乐部报到但保留 d.loan；到 endSeason 季开季才走 backLoan 归队。
           （中租/季末归队路径 nextClub 恒空，backLoan 判据不变。） */
        const _loanStart = (d.nextClub && d.loan && d.loan.endSeason != null && d.loan.endSeason > d.season) ? d.loan : null;
        const cId = d.nextClub ? d.nextClub.clubId : (backLoan ? backLoan.fromClubId : d.clubId);
        const lId = d.nextClub ? d.nextClub.leagueId : (backLoan ? backLoan.fromLeagueId : d.leagueId);
        d.loan = _loanStart;   // 租借启程年保留凭证（非启程年 = null，与旧行为一致）
        /* ★★★ P99 批 4c ①：改走**唯一路由** `Career.beginSeason`（理由见其函数注释）。
           ★ 为什么这里**不能**保留对 `SeasonSystem.initSeason` 的直调：青训期从休赛期
             回到赛季时必须走 `Youth.initYouthSeason`，直调会拿到一份**成年**赛程
             —— 而它**不报错**（队、联赛、积分榜都会"看起来对"），属静默错档。
           ★ 顺序逐位保留：`d.loan = null` 仍在初始化**之前**（与旧行为一致）。
           ★★ P188 last-resort（用户拍板「不要影响到玩家玩游戏」）：beginSeason 抛错
             （旧档残留青年 id 且反查也失败等极端态）→ **强制自愈**：用可解析的第一成年
             联赛重建赛程，保证玩家永远能进入新赛季——牺牲精确性换可用性。 */
        try {
          Career.beginSeason(state, cId, lId);
        } catch (eBS) {
          console.error("Career.advanceDay：beginSeason 失败（" + eBS.message + "）→ last-resort 自愈");
          let fbLg = this._leagueIdOfClub(cId);
          if (!fbLg && typeof LD === "function") { try { fbLg = Object.keys(LD())[0]; } catch (eL) { /* ignore */ } }
          if (fbLg) {
            SeasonSystem.initSeason(state, cId, fbLg);
          } else {
            // 终极兜底：连联赛表都不可用 → 手工把日期推过季初，至少让循环继续（空赛季可玩）
            d.date = CONFIG.calNextDay(CONFIG.calStart(lId, d.season)); // ★ P197：口径同步（原 +1 多拖一年）
            /* ★ P285b（Tap 玩家「时间空转」实锤）：终极兜底不跑 initSeason →
               _seasonSettled 残留 true + 赛程耗尽 → seasonEnd 被守卫拦 = 永久死锁。
               必须同步复位，让守卫放行空赛季结算收口（flow 侧另有自愈双保险）。 */
            d._seasonSettled = false;
          }
        }
        d.nextClub = null;
        if (backLoan) {
          return { title: "租借期满归队", text: "租借期满，你回到 " + backLoan.fromClubName + " 报到。外租这一年的比赛感觉还在腿上——季前训练课，主教练多看了你两眼。", effects: { morale: 4 } };
        }
        /* ★ P301：租借启程年播报（外租 1 季，期满自动归队——与租借页/竞拍卡文案同口径） */
        if (_loanStart) {
          return { title: "租借报到", text: "你以租借身份加盟 " + _loanStart.clubName + "——外租一个赛季（" + _loanStart.endSeason + " 赛季期满自动回归 " + _loanStart.fromClubName + "）。母队合同不变，租借期间的每一场球，母队都看在眼里。", effects: { morale: 2 } };
        }
        // P81j 升降级播报：上季降级/升级/保级结果在集结日告知（读完即清，防重复）
        if (window.Division) { try { const nv = Division.takeNews(state); if (nv) return nv; } catch (e) { console.warn("division news", e); } }
        return { title: "新赛季集结", text: "休赛期结束，新 leagues 赛程公布。你的新赛季从这里开始。", effects: { morale: 3 } };
      }
      // ═══ P105-B3 转会兴趣动态（夏窗苗头升级版）：8-11 月表现达标 + fame 达门槛 →
      //     绯闻事件卡 + d.offers 落兴趣条目（合同页「老狐的风声」自动展示）。
      //     ★ R 流变化 = 设计内行为漂移（fame 短路使未达门槛球员不再消耗判定 R）。
      const cfg_R = CONFIG.P105_RUMOR || { FAME_MIN: 500000, CHANCE: 0.03, COOLDOWN: 30, MAX: 3, TTL_DAYS: 90 };
      if (!d.retired && d.date.month >= 8 && d.date.month <= 11 && d.dayIndex - (d._rumorDay || -999) >= (cfg_R.COOLDOWN) && window.LD && (d.fame || 0) >= cfg_R.FAME_MIN) {
        const avgR = d.seasonStats.apps ? d.seasonStats.ratingSum / d.seasonStats.apps : 0;
        const ovrR = PlayerSystem.overall(d.player);
        if (avgR >= 6.8 || ovrR >= 65) {
          const curStr = (typeof teamById === "function" && teamById(d.clubId)?.strength) || 60;
          const suitors = [];
          for (const [lid, lg] of Object.entries(LD())) for (const t of lg.teams) {
            /* ★★ P265（用户实录「转会窗长期固定的某两个球队」）：旧池 (curStr+2, ovrR+12]
               是**静态窄带**——curStr/ovr 每季才涨 1-2，池内容年年几乎不变，风声每季 8-11 月
               反复触发（期望 3-4 次/季）⇒ 玩家每年看到的风声全是同 3-6 支队（fitAssess 再过滤
               后更窄）= 「固定两队」观感的最大来源。放宽为 (curStr-8, ovrR+14]：弱队的球探也
               会来关注强队的轮换球员（现实中中乙队想要中超替补很正常），池摊开数倍，
               战术适配（fitAssess）仍保留「缺后腰只要后腰」口径。 */
            if (t.id === d.clubId || !(t.strength > curStr - 8 && t.strength <= ovrR + 14)) continue;
            /* ★★ P117 战术适配：风声也走 fitAssess —— 球队战术里没有你能踢的槽位，
               球探连看台都不会来（「缺后腰只要后腰」口径；客串/顶替通道同正式报价）。 */
            const fit = (window.Tactics && Tactics.fitAssess) ? Tactics.fitAssess(state, t, d.season) : null;
            if (fit) suitors.push({ t, lid, fit });
          }
          if (suitors.length && R.chance(cfg_R.CHANCE)) {
            d._rumorDay = d.dayIndex;
            /* 兴趣条目簿维护：TTL 过期剔除 + 上限 FIFO（生成点顺带清理，无独立 tick） */
            d.offers = (d.offers || []).filter(o => !o.rumor || d.dayIndex - (o.day || 0) <= cfg_R.TTL_DAYS);
            const pick = suitors[R.int(0, suitors.length - 1)];
            const fee = Math.round(Career.wageBase(ovrR) * 600 * 1.1 * (0.8 + R.next() * 0.4));   // 对齐 genWinterOffers 估值口径
            const wage = Math.round(Career.wageOf(ovrR, pick.t.strength, R.next()));
            d.offers.push({ clubId: pick.t.id, clubName: pick.t.name, leagueId: pick.lid, leagueName: LD()[pick.lid].name, fee, wage, rumor: true, day: d.dayIndex,
              slotPos: pick.fit.pos, slotPosName: pick.fit.posName, promise: pick.fit.promise, tactic: pick.fit.tactic, cross: pick.fit.cross });
            while (d.offers.filter(o => o.rumor).length > cfg_R.MAX) {
              const idx = d.offers.findIndex(o => o.rumor);
              d.offers.splice(idx, 1);
            }
            return { title: "转会窗风声", text: "据可靠消息，" + pick.t.name + " 的球探已连续三场出现在看台上——他们在「" + pick.fit.tactic + "」里缺一个" + pick.fit.posName + "，看中了你（许诺" + pick.fit.promise.replace("承诺", "") + "）。开价的意向已经递到了老狐手里（愿出 " + this.fmtMoney(fee) + " · 周薪 " + this.fmtMoney(wage) + "）。赛季结束后，正式报价可能真的会来。", effects: { morale: 4 } };
          }
        }
      }
      // ═══ P128b 商业代言邀约（四档品牌；对齐 P105-B3 绯闻模式：条件短路 + 每日一 roll + return 卡）═══
      //  R 消耗说明：条件全满足才消耗 1 次 R.chance —— 与绯闻段同族（soak 重签一次覆盖）。
      //  接受/婉拒副作用打包进 effects.commerceAccept / effects.commerceDecline（applyEffects 统一入口），
      //  邀约卡 = 标准 choices 卡（choices.effects 纯数据，可安全落 _stashedEvent）。
      //  ★ P259：键名必须用 effects —— showEventModal 只消费 c.effects（fx: 是 EventCards 引擎
      //  options[] 的键名口径，混用会导致选卡静默不结算：钱/粉/账本/冷却全部不发生，玩家还得去
      //  简况页签二次确认 = 双确认 bug 根因）。hub.js 侧另有 c.fx 防御归一兜底。
      if (!d.retired && !d.offseason && window.CONFIG && CONFIG.COMMERCE_TIERS && CONFIG.COMMERCE_TIERS.length) {
        const _cm = d.commerce;
        /* ★ P286（兄弟指令）：代言满季上限（5）后邀约**不再被拦**——满额时邀约照常来，
           卡内切换为「替换老代言」形态（见下方 choices 组装；选谁换谁，seasonCount 置换不变）。 */
        const _ok = _cm && !_cm.active
          && d.dayIndex >= (_cm.cooldownUntil || 0)
          && (d.fame || 0) >= CONFIG.COMMERCE_TIERS[0].min;
        /* ★ P185：「代言磁铁」技能 = 邀约到达率放大（5★ 8%→10.4%——「商业代言排队上门」）。 */
        const _spMul = (window.Skills && Skills.mult) ? (Skills.mult(d, "sponsor", 0.30) || 1) : 1;
        if (_ok && R.chance(0.08 * _spMul)) {
          const _offer = this.genCommercialOffer(state);
          if (_offer) {
            _cm.active = _offer;
            const _full = (_cm.seasonCount || 0) >= this.COMMERCIAL_PER_SEASON;
            const _payTxt = "（入账 " + this.fmtMoney(_offer.pay) + "）";
            /* 满额形态：最近每份老代言一个「替换」选项（新单入账 + 旧单终止出列，
               seasonCount 一减一加=置换不涨）；未满额保持原「接下代言」。 */
            const _choices = _full
              ? (_cm.history || []).slice(-this.COMMERCIAL_PER_SEASON).map(h => ({
                  text: "替换「" + h.brand + "」" + _payTxt,
                  effects: { money: _offer.pay, fans: Math.round(_offer.pay * 0.3), commerceAccept: true, commerceReplace: h.brand },
                  response: "官宣换约：「" + h.brand + "」的合作落幕，「" + _offer.brand + "」接棒登场。",
                })).concat([
                  { text: "婉拒（进入 30 天冷却）", effects: { commerceDecline: true },
                    response: "你礼貌地推掉了这单生意。经纪人说：档期空出来了，就把它留给训练。" },
                ])
              : [
                  { text: "接下代言" + _payTxt,
                    effects: { money: _offer.pay, fans: Math.round(_offer.pay * 0.3), commerceAccept: true },
                    response: "拍摄完成，品牌方相当满意——你的名字又亮了一点。" },
                  { text: "婉拒（进入 30 天冷却）", effects: { commerceDecline: true },
                    response: "你礼貌地推掉了这单生意。经纪人说：档期空出来了，就把它留给训练。" },
                ];
            return {
              title: "代言邀约 · " + _offer.brand,
              cat: "商业",
              text: _offer.desc + "（档位：" + _offer.tierName + " · 报酬 " + this.fmtMoney(_offer.pay) + " · " + Math.max(1, _offer.expireDay - (d.dayIndex || 0)) + " 天内有效）" + (_full ? "<br><span class=\"dim12\">本季代言已满 " + this.COMMERCIAL_PER_SEASON + " 份——可以选择替换掉一份老代言。</span>" : ""),
              choices: _choices,
            };
          }
        }
      }
      // 随机生活事件（每天 6%）
      if (R.chance(0.06) && !d.retired) {
        const ev = this.rollLifeEvent(state);
        if (ev && notes_income) ev._notes = (ev._notes || []).concat(notes_income);
        if (ev) return ev;
      }
      if (notes_income) return { title: "分红到账", text: notes_income, effects: {} };
      return null;
    },

    isOffSeason(d) {
      const { month, day } = d.date;
      return (month === 12 && day >= 16) || month === 1;
    },

    /** 应用效果（统一入口：数值/天赋经验/临时效果） */
    applyEffects(state, fx) {
      if (!fx) return [];
      const d = state.data;
      const notes = [];
      if (fx.morale) {
        let mv = fx.morale;
        if (mv < 0 && window.TAL && TAL.moraleHitCut) {
          const _cut = TAL.moraleHitCut(d);
          if (_cut > 0) mv = Math.round(mv * (1 - _cut)); // P113 五档：更衣室好人负面士气减免 25~85%
        }
        d.morale = Math.max(5, Math.min(100, d.morale + mv)); notes.push("士气" + (mv > 0 ? "+" : "") + mv);
      }
      if (fx.money) { d.money += fx.money; notes.push("金钱" + (fx.money > 0 ? "+" : "") + Career.fmtMoney(fx.money)); try { if (window.Finance) Finance.log(d, "事件", fx.money, notes[notes.length - 1]); } catch (e) { /* ignore */ } }
      if (fx.fans) { d.fans = Math.max(0, d.fans + fx.fans); notes.push("粉丝" + (fx.fans > 0 ? "+" : "") + Career.fmtMoney(fx.fans)); }
      if (fx.fame) { d.fame = Math.max(0, d.fame + fx.fame); notes.push("名气" + (fx.fame > 0 ? "+" : "") + Career.fmtMoney(fx.fame)); }
      /* ★ P171：fx.fatigue 分支随疲劳机制退役删除 —— 数据文件中的 fatigue 值静默失效（不显示不生效）。 */
      // ★ P128b 代言邀约卡选择副作用（账本单源 = settleCommerce/declineCommerce）：
      //   钱/粉由上方常规 fx 键承担（邀约生成时已预计算），这里只补账本 + 清 active。
      if (fx.commerceAccept) {
        const _done = this.settleCommerce(state);
        if (_done) notes.push("代言达成：" + _done.brand);
      }
      /* ★ P286：满额换约——新单已由 commerceAccept 结算入账；这里把被替换的老代言
         从本季列表出列（seasonCount 一减一加=置换不涨，可继续替换）。 */
      if (fx.commerceReplace) {
        const _c = d.commerce;
        if (_c && Array.isArray(_c.history)) {
          const _i = _c.history.findIndex(h => h.brand === fx.commerceReplace);
          if (_i >= 0) _c.history.splice(_i, 1);
        }
        _c.seasonCount = Math.max(this.COMMERCIAL_PER_SEASON, (_c.seasonCount || 1) - 1);
        notes.push("换约：「" + fx.commerceReplace + "」终止合作");
      }
      if (fx.commerceDecline) { this.declineCommerce(state); notes.push("婉拒代言 · 30 天冷却"); }
      // 投资回报（事件选择后立即结算；此前该字段被静默丢弃，扣了钱没有下文）
      if (fx.investReturn) {
        const win = R.chance(fx.investReturn.chance);
        const delta = win ? fx.investReturn.gain : (fx.investReturn.loss || 0);
        if (delta) { d.money = Math.max(0, d.money + delta); notes.push((win ? fx.investReturn.desc || "投资回报" : "投资打水漂") + " 金钱" + (delta > 0 ? "+" : "") + Career.fmtMoney(Math.abs(delta))); }
        else notes.push("投资血本无归…");
      }
      // 彩票（极低概率大奖）
      if (fx.lotteryChance) {
        if (R.chance(fx.lotteryChance)) { d.money += fx.lotteryPrize || 0; notes.push("彩票中奖！金钱+" + Career.fmtMoney(fx.lotteryPrize || 0)); }
        else notes.push("没中，就当买个念想");
      }
      // 伤病保险（投保后大伤按休战天数赔付，赔付一次失效）
      if (fx.insurance === true) { d.insured = true; notes.push("保险已生效（受伤赔付一次）"); }
      /* ★★ P102（用户反馈）：`fx.trust` 原写独立死字段 `d.trust` —— 与事件卡的
         `d.chars.coach_trust` 同名不同源，且 `d.trust` 全仓无人读取、无处显示。
         现统一写入 `d.chars.coach_trust`（旧档 `d.trust` 的并入迁移在 EventCards.charsOf）。
         ★ 读旧值也要走迁移口径：chars 未初始化时先从 d.trust 播种，避免旧档积累清零。 */
      if (fx.trust) {
        d.chars = d.chars || {};
        if (d.chars.coach_trust == null) d.chars.coach_trust = (d.trust != null) ? Math.max(0, Math.min(100, Math.round(d.trust))) : 50;
        d.chars.coach_trust = Math.max(0, Math.min(100, d.chars.coach_trust + fx.trust));
        d.trust = d.chars.coach_trust; // 兼容旧读点（现无读点，仅为档内一致性保留）
        notes.push("教练信任" + (fx.trust > 0 ? "+" : "") + fx.trust);
      }
      if (fx.traitExp) {
        d.traits.traitExp = d.traits.traitExp || {};
        d.hidden = d.hidden || { xp: {} }; // 修复：d.hidden 从未初始化导致带 traitExp 的事件点击即炸（按钮无响应）
        d.hidden.xp = d.hidden.xp || {};
        /* ★★ P115（用户拍板「不明不白的效果都改成能找到的属性」）：原聚合文案
           「隐藏天赋经验+6」是黑话 —— 玩家不知道它是什么、在哪看。
           实际去向 = 性格系统（Personality 三维度：自律/职业素养/身体天赋，
           属性页·性格页签可见等级与进度，每 60 点升 1 级、有真实数值效果）。
           ⇒ 按**维度逐个**输出「性格·自律 +6」；未知维度不静默吞（warn + 丢弃）。 */
        for (const [k, v] of Object.entries(fx.traitExp)) {
          const pd = (window.Personality && Personality.def) ? Personality.def(k) : null;
          if (!pd) {
            console.warn("Career.applyEffects：未知性格维度 \"" + k + "\"（效果已丢弃）——请检查事件数据");
            continue;
          }
          d.hidden.xp[k] = (d.hidden.xp[k] || 0) + v; // SP 制：技能成长只走技能点，事件经验统一归入性格系统
          notes.push("性格·" + pd.name + (v > 0 ? "+" : "") + v);
        }
      }
      // 长期分红（事件选择后挂收入流，每 30 天入账）
      if (fx.monthlyReturn) {
        d.incomeStreams = d.incomeStreams || [];
        d.incomeStreams.push({ monthly: fx.monthlyReturn, remainingMonths: (fx.monthlyReturnYears || 3) * 12, name: fx.incomeName || "长期分红" }); // P2-1：年是 12 个月（原按 3 个月扣完，潜伏 ×12 bug）
        notes.push("每年分红 " + Career.fmtMoney(fx.monthlyReturn * 12) + "，持续 " + (fx.monthlyReturnYears || 3) + " 年");
      }
      if (fx.temporaryEffect) {
        d.tempEffects = d.tempEffects || [];
        d.tempEffects.push(Object.assign({ leftDays: fx.temporaryEffect.days || 28 }, fx.temporaryEffect));
        notes.push("获得效果：" + fx.temporaryEffect.name);
      }
      return notes;
    },

    /** 临时效果每日结算：递减天数（★ P171：疲劳恢复加成随疲劳机制退役——天数递减保留，
     *  临时效果的 injuryRiskMultiplier 等其他通道照常工作） */
    tickTempEffects(state) {
      const d = state.data;
      if (!d.tempEffects || !d.tempEffects.length) return;
      d.tempEffects = d.tempEffects.filter(t => {
        t.leftDays = (t.leftDays || 0) - 1;
        return t.leftDays > 0;
      });
    },

    /** 训练伤病风险乘数（来自临时效果） */
    injuryRiskMultiplier(state) {
      const d = state.data;
      if (!d.tempEffects) return 1;
      let m = 1;
      for (const t of d.tempEffects) m *= (t.injuryRiskMultiplier || 1);
      return Math.max(0.2, Math.min(3, m));
    },

    /** 随机生活事件（支持原版 a/b 选择交互） */
    rollLifeEvent(state) {
      const d = state.data;
      let pool = LIFE().slice();
      if (R.chance(0.12) && SCANDALS().length) pool.push(R.pick(SCANDALS()));
      // conditions 过滤：minAge/minWealth/minFans/minHousingLevel/insured/hasTeam/hasRomance（此前全部形同虚设）
      pool = pool.filter(ev => {
        const c = ev.conditions;
        if (!c) return true;
        if (c.minAge !== undefined && d.player.age < c.minAge) return false;
        if (c.minWealth !== undefined && d.money < c.minWealth) return false;
        if (c.minFans !== undefined && d.fans < c.minFans) return false;
        if (c.minHousingLevel !== undefined && (d.housing && d.housing.level || 0) < c.minHousingLevel) return false;
        if (c.insured !== undefined && !!d.insured !== !!c.insured) return false;
        if (c.hasTeam !== undefined && (!!d.clubId) !== !!c.hasTeam) return false;
        if (c.hasRomance) return false; // 恋爱系统未实装，相关事件不投
        return true;
      });
      if (!pool.length) return null;
      const ev = R.pick(pool);
      // 交互事件（原版 a/b 选择格式）
      if (ev.a && ev.b) {
        return {
          title: "生活事件", text: ev.desc,
          choices: [
            { text: ev.a.text, effects: ev.a.effects, hidden: ev.a.hiddenEffects, delayed: ev.a.delayedEffect },
            { text: ev.b.text, effects: ev.b.effects, hidden: ev.b.hiddenEffects, delayed: ev.b.delayedEffect },
          ],
        };
      }
      // 纯文本事件
      const fx = ev.effects || {};
      const notes = this.applyEffects(state, fx);
      return { title: ev.title || "生活事件", text: ev.text || ev.desc || "", effects: { morale: fx.morale || 0, fans: fx.fans || 0, money: fx.money || 0, fame: fx.fame || 0 }, _notes: notes };
    },

    // ── 商业活动（★★ P128b 死代码接线 + 四档品牌；此前 genCommercialOffer/acceptCommercial 无任何调用者）──
    COMMERCIAL_PER_SEASON: 5, // P0-1：每季代言上限（防切页刷单）
    /** 生成一份代言邀约（advanceDay 每日 roll 命中后调用；fame 取**可达最高档**）。
     *  pay 公式单源在此（CONFIG.COMMERCE_TIERS 只供档位倍率）；
     *  天赋「商业头脑」moneyMult 在**生成时**乘入 —— 邀约卡上显示的就是到手价（更透明）。 */
    genCommercialOffer(state) {
      const d = state.data;
      const TIERS = (window.CONFIG && CONFIG.COMMERCE_TIERS) || [];
      if (!TIERS.length) return null;
      const c = d.commerce;
      /* ★ P286（兄弟指令）：满季上限不再拦截邀约**生成**（满了走「替换老代言」形态），
         仅保留冷却/档位门——上限语义从「拒收」改为「换约」。 */
      if (d.dayIndex != null && d.dayIndex < (c.cooldownUntil || 0)) return null; // 拒约冷却 30 天
      let tier = null;
      const fame = d.fame || 0;
      for (const t of TIERS) if (fame >= t.min) tier = t;                          // 可达最高档
      if (!tier) return null;
      const ovr = PlayerSystem.overall(d.player);
      let pay = Math.round((d.fans * 0.05 + fame * 2 + ovr * 30) * (0.8 + R.next() * 0.6) * tier.mult); // P0-1：fans 系数 0.05 去复利；×P128b 档位倍率
      if (window.TAL) pay = Math.round(pay * TAL.moneyMult(d));                   // 天赋：商业头脑 +20%（P128b 移到生成时）
      /* ★ P185：「球衣代言」技能 = 代言/周边商业收入放大（5★ ×1.20）——「周边分成躺赚」。 */
      if (window.Skills && Skills.mult) pay = Math.round(pay * (Skills.mult(d, "merchLine", 0.20) || 1));
      const b = tier.brands[R.int(0, tier.brands.length - 1)];
      return {
        brand: b[0], desc: b[1], pay, tierName: tier.name,
        days: R.int(5, 10),
        expireDay: (d.dayIndex || 0) + 14,   // 邀约有效期 14 天，过期自动婉拒进冷却
      };
    },
    /** 接受邀约的**账本结算**（P128b：钱/粉/疲劳由邀约卡的常规 fx 键承担——事件卡走
     *  applyEffects 预计算数值；本函数只补账本 + 清 active。active 丢失（极端时序）时
     *  仍兜底记账，防「钱发了、账没了」。返回结算的邀约或 null。 */
    settleCommerce(state) {
      const d = state.data;
      const c = d.commerce;
      const o = c.active;
      c.completed = (c.completed || 0) + 1;
      c.seasonCount = (c.seasonCount || 0) + 1;
      c.cooldownUntil = (d.dayIndex || 0) + 30; // P0-1：接单后冷却 30 天
      c.history = c.history || [];
      if (o) {
        c.history.push({ season: d.season, brand: o.brand, pay: o.pay });
        try { if (window.Finance) Finance.log(d, "代言", o.pay, "代言达成：" + o.brand); } catch (e) { /* 流水失败不影响结算 */ }
        c.active = null;
        if (c.history.length > 30) c.history.shift();   // 环形上限，防长档膨胀
        return o;
      }
      return null;
    },
    /** 婉拒邀约（30 天冷却；P128b 新增——旧实现拒约无独立入口） */
    declineCommerce(state) {
      const d = state.data;
      d.commerce.cooldownUntil = (d.dayIndex || 0) + 30;
      d.commerce.active = null;
    },
    /** ★ P301（玩家反馈「可以自己在代言里取消代言」→ 兄弟拍板做成功能）：
     *  主动解约**本季已签**的代言。规则：无赔偿、已入账报酬不退；解约后 30 天内
     *  经纪人不接新单（cooldownUntil 同婉拒口径）；本季额度同步腾出一格
     *  （seasonCount −1，新邀约可正常接）；履历该单出列（解约不是完成）。
     *  往季代言不涉及解约（关系本就随季终结）。返回 {ok, msg}。 */
    cancelCommerce(state, brand) {
      const d = state.data;
      const c = d.commerce;
      if (!c || !Array.isArray(c.history)) return { ok: false, msg: "没有可解约的代言。" };
      const i = c.history.findIndex(h => h && h.brand === brand && h.season === d.season);
      if (i < 0) return { ok: false, msg: "找不到这份本季代言（往季代言已随赛季自然结束，无需解约）。" };
      c.history.splice(i, 1);
      c.seasonCount = Math.max(0, (c.seasonCount || 0) - 1);
      c.cooldownUntil = (d.dayIndex || 0) + 30;
      return { ok: true, msg: "已与 " + brand + " 解约——已结算的报酬不退，30 天内经纪人不接新单。" };
    },

    // ── 住房（原版 HousingSystem）──
    housingLevels: [
      { level: 0, name: "青年公寓", cost: 0, comfort: 1 },
      { level: 1, name: "市区精装公寓", cost: 800000, comfort: 2 },
      { level: 2, name: "江景大平层", cost: 4000000, comfort: 3 },
      { level: 3, name: "山间庄园别墅", cost: 20000000, comfort: 4 },
    ],
    upgradeHousing(state) {
      const d = state.data;
      const next = this.housingLevels[d.housing.level + 1];
      if (!next || d.money < next.cost) return false;
      d.money -= next.cost;
      d.housing.level = next.level;
      d.housing.name = next.name;
      d.morale = Math.min(100, d.morale + 8);
      try { if (window.Finance) Finance.log(d, "置业", -next.cost, "购入" + next.name); } catch (e) { /* ignore */ }
      return true;
    },

    // ── 座驾（存款消费出口之一，与房产同构）──
    carLevels: [
      { level: 0, name: "地铁 + 共享单车", cost: 0, style: 0 },
      { level: 1, name: "代步小钢炮", cost: 150000, style: 1 },
      { level: 2, name: "轿跑", cost: 800000, style: 2 },
      { level: 3, name: "豪华 SUV", cost: 3500000, style: 3 },
      { level: 4, name: "定制超跑", cost: 15000000, style: 4 },
    ],
    carOf(d) { return this.carLevels[(d.car && d.car.level) || 0]; },
    upgradeCar(state) {
      const d = state.data;
      const next = this.carLevels[((d.car && d.car.level) || 0) + 1];
      if (!next || d.money < next.cost) return false;
      d.money -= next.cost;
      d.car = { level: next.level, name: next.name };
      d.morale = Math.min(100, d.morale + 6);
      try { if (window.Finance) Finance.log(d, "置业", -next.cost, "购入" + next.name); } catch (e) { /* ignore */ }
      return true;
    },

    /* ★★ P185（用户拍板「车子房子能不能一次买到位」）：一步到位批量购置。
       · maxTo = 买到目标档（默认顶档）；途中**钱不够的档直接跳过**（不中断）——
         「有多少钱办多少事，能升几级升几级」；返回 { from, to, spent, skipped }。
       · 每级独立走 upgradeHousing/upgradeCar（士气/流水/单源口径零旁路）。 */
    maxLevelsOf(levels, money, from) {
      let to = from, spent = 0;
      for (let lv = from + 1; lv < levels.length; lv++) {
        if (money - spent >= levels[lv].cost) { spent += levels[lv].cost; to = lv; }
      }
      return { to, spent };
    },
    housingMaxInfo(d) {
      const from = (d.housing && d.housing.level) || 0;
      return Object.assign({ from }, this.maxLevelsOf(this.housingLevels, d.money, from));
    },
    carMaxInfo(d) {
      const from = (d.car && d.car.level) || 0;
      return Object.assign({ from }, this.maxLevelsOf(this.carLevels, d.money, from));
    },
    upgradeHousingMax(state) {
      const info = this.housingMaxInfo(state.data);
      if (info.to <= info.from) return { ok: false, msg: "存款不够再升任何一档" };
      const fromLv = info.from;
      for (let lv = fromLv + 1; lv <= info.to; lv++) this.upgradeHousing(state);   // 逐级落地（士气每级+8 会累计，设计内）
      return { ok: true, from: fromLv, to: info.to, spent: info.spent,
        name: this.housingLevels[info.to].name };
    },
    upgradeCarMax(state) {
      const info = this.carMaxInfo(state.data);
      if (info.to <= info.from) return { ok: false, msg: "存款不够再升任何一档" };
      const fromLv = info.from;
      for (let lv = fromLv + 1; lv <= info.to; lv++) this.upgradeCar(state);
      return { ok: true, from: fromLv, to: info.to, spent: info.spent,
        name: this.carLevels[info.to].name };
    },

    // ── 退役（原版 RetirementSystem 精神）──
    canRetire(state) {
      const d = state.data;
      const ovr = PlayerSystem.overall(d.player);
      return d.player.age >= 33 || (ovr < 52 && d.player.age >= 24); // 低能力年轻球员留给自然成长，不开退役通道
    },
    forcedRetirement(state) {
      const d = state.data;
      const ovr = PlayerSystem.overall(d.player);
      return d.player.age >= 40 || (d.player.age >= 35 && ovr < 48);
    },
    /** 传奇指数（退役结算与结局预览共用公式） */
    legacyOf(state) {
      const d = state.data;
      const s = d.stats;
      const avgRating = s.apps ? s.ratingSum / s.apps : 0;
      const ovr = PlayerSystem.overall(d.player);
      // 传奇指数（国际成就加成）
      const intlBonus = (d.intl && d.intl.statue ? 3000 : 0) +
        (d.trophies.some(t => t.name === "世界杯冠军") ? 3000 : 0) +
        (d.trophies.some(t => t.name === "世界杯金靴") ? 1500 : 0) +
        (d.trophies.some(t => t.name === "世界杯MVP") ? 1500 : 0);
      // 房车小加成（消费出口反馈到传奇指数，最高约 1400 点）
      const homeComfort = (this.housingLevels[(d.housing && d.housing.level) || 0] || this.housingLevels[0]).comfort;
      return Math.round(
        s.goals * 12 + s.assists * 7 + s.apps * 3 + s.motm * 25 +
        d.trophies.reduce((acc, t) => acc + ((t.name || "").indexOf("冠军") >= 0 ? 120 : 40), 0) + // P0-3：冠军类×120、个人奖×40（治个数通胀）
        avgRating * 60 + ovr * 8 + d.fame / 100 + intlBonus +
        homeComfort * 200 + this.carOf(d).style * 150
      );
    },
    /** 退役结算（forced=强制退役标记，会落盘用于结局回看） */
    retire(state, forced) {
      const d = state.data;
      d.retired = true;
      if (forced) d.retiredForced = true;
      d._stashedEvent = null; // 退役后不再补弹遗留事件
      /* ★ P274b：TapTap 原生排行榜提交（退役=积分定格点；官方 newBest 只留最佳，重复安全） */
      try {
        if (window.LFB && typeof LFB.submitTap === "function" && window.Legacy) {
          LFB.submitTap(Legacy.effectivePoints ? Legacy.effectivePoints(d) : (Legacy.points ? Legacy.points(d) : 0));
        }
      } catch (e) { /* 排行榜提交失败不影响退役结算 */ }
      const s = d.stats;
      const avgRating = s.apps ? s.ratingSum / s.apps : 0;
      const legacy = this.legacyOf(state);
      const tier = legacy > 40000 ? { name: "一代传奇", icon: "", desc: "你的名字被写进了足球历史。未来的孩子们会在海报上看到你的脸。" } // P0-3：档位上调对冲通胀
        : legacy > 22000 ? { name: "世界巨星", icon: "", desc: "你曾站上世界之巅，球迷会永远记得你的高光时刻。" }
        : legacy > 10000 ? { name: "知名球星", icon: "", desc: "一段值得骄傲的职业生涯，你赢得了尊重与荣誉。" }
        : { name: "职业球员", icon: "", desc: "平凡而真实的足球人生，你曾为梦想全力以赴。" };
      /* ★ P129a：tierRank（0-3）——★ P202 起改用 META_LEGACY.RANK_CUTS 独立刻度：
         结局档位 tier 文案保持原阈值（10000/22000/40000，P0-3 稀缺性设计不动），
         继承系数 μ 按真实生涯分布校准（67 座奖杯巨星实测 21630 分 = 旧刻度只拿 μ0.5），
         校准依据与分布见 CONFIG.META_LEGACY.RANK_CUTS 注释（tools/_p202_legacy_audit.js）。 */
      const _MLR = (window.CONFIG && CONFIG.META_LEGACY && CONFIG.META_LEGACY.RANK_CUTS) || [4500, 12000, 26000];
      const tierRank = legacy >= _MLR[2] ? 3 : legacy >= _MLR[1] ? 2 : legacy >= _MLR[0] ? 1 : 0;
      const intlCareer = (d.intl && d.intl.career) || { apps: 0, goals: 0, assists: 0 };
      // 结局判定：特殊结局（8 种）优先命中，否则落回底轨 4 档
      const ending = (window.ENDINGS_DATA && ENDINGS_DATA.resolve(d, legacy, !!forced)) || tier;
      return { legacy, tier, tierRank, ending, avgRating: Math.round(avgRating * 10) / 10, stats: Object.assign({}, s),
        intl: Object.assign({}, intlCareer), statue: !!(d.intl && d.intl.statue),
        wageEarned: d.stats.wageEarned || 0,
        home: (this.housingLevels[(d.housing && d.housing.level) || 0] || this.housingLevels[0]).name,
        car: this.carOf(d).name,
        /* ★ P128c 退役清算（R2）：清算价 = Σ invested × 50%（叙事展示；P129b 建筑继承读同源数据） */
        bizLegacy: (window.Finance && Finance.liquidateBiz) ? Finance.liquidateBiz(d) : { count: 0, invested: 0, liquid: 0 } };
    },

    // ── 名气/声望（原版 FameSystem 精神）──
    addFame(state, delta) {
      const d = state.data;
      if (window.TAL) delta = Math.round(delta * TAL.fameMult(d)); // 天赋：镜头宠儿 +25%
      if (window.IDENTITY) delta = Math.round(delta * IDENTITY.fameMult(d)); // 出身：足球世家 名气获取 ×1.1
      /* ★ P185：「肖像权经营」技能 = 名气获取放大（5★ ×1.20）——「曝光就是资产」；
         同时带动粉丝增长（fans 随 delta 同源放大）。 */
      if (window.Skills && Skills.mult) delta = Math.round(delta * (Skills.mult(d, "imageRights", 0.20) || 1));
      /* ★ P128b Q9（用户拍板）：座驾排面 → 名气获取 ×(1+style×0.03)（定制超跑 +12%；
         现役 style=0 → 数学恒等零影响）。展示文案在置业页（hub.js assets），口径 = 本表达式。 */
      const _sty = (this.carOf(d).style || 0);
      if (_sty > 0) delta = Math.round(delta * (1 + _sty * 0.03));
      d.fame = Math.max(0, d.fame + delta);
      /* ★ P185：「粉丝运营」技能 = 粉丝增长放大（5★ ×1.25）——「社媒涨粉有一手」。 */
      if (window.Skills && Skills.mult) delta = Math.round(delta * (Skills.mult(d, "fanGrowth", 0.25) || 1));
      d.fans = Math.max(0, d.fans + Math.round(delta * 2.5));
    },
  };

  window.Career = Career;
})();
