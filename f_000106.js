/* ============================================================================
   transfer.js — 转会窗机制核心（P61 一期）

   规格：docs/转会窗机制设计稿_v1.md（用户 2026-09-11 逐条锁定）
   覆盖：俱乐部转会风格 / 报价富化（风格+上场承诺+解约金）/ 解约金谈判与触发
         / 挽留 3 轮 × 4 风格 / 雪藏状态机 / 冬窗触发（并入休赛期转会卡）
         / 金主→豪门风格演化

   设计稿偏差说明（1 处）：18 张事件卡内容全部依赖运行时状态（报价/风格/轮次），
   无法静态化，故以渲染函数内聚在本模块（仍走 CardHost.show 内嵌漫画卡，P53 合规），
   不设独立 data_transfer_cards.js。

   日历口径：本游戏赛季 2 月~12 月中，1 月属休赛期 → 「冬窗」即休赛期转会卡中的
   触发式通道（救援/挂牌/强挖），不另行中途弹卡。
   ============================================================================ */
(function () {
  const R = window.R;
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&#39;", "'": "&#39;" }[c]));
  const fmt = v => (window.Career && Career.fmtMoney) ? Career.fmtMoney(v) : String(v == null ? 0 : v);

  /* P92：插画样式串——ArtSprite 可用时走图集定位（发布包内不含单图），否则回退单图
     ★ P293（SR-022 收口）：回退分支补 P226 同口径白名单（此前裸拼 n），双分支统一 fail-closed */
  const artOf = n => (window.ArtSprite && window.ArtSprite.style)
    ? window.ArtSprite.style(n)
    : (function () {
        let a = String(n == null ? "goal" : n).replace(/^ec_/, "").replace(/\.webp$/, "");
        if (!/^[a-z0-9_]{1,40}$/i.test(a)) a = "goal";
        return "background-image:url(assets/comic/ec_" + a + ".webp)";
      })();

  /* ── 身价估值曲线（内部定价用，仅锚定解约金；展示转会费沿用 P1-16 公式）──
     分段线性：OVR 65→800万 70→2000万 75→4500万 80→8000万 85→1.3亿 90→1.8亿 96→3亿 */
  const FEE_PTS = [[60, 4e6], [65, 8e6], [70, 2e7], [75, 4.5e7], [80, 8e7], [85, 1.3e8], [90, 1.8e8], [96, 3e8], [100, 4.5e8]];
  function feeBaseOf(ovr) {
    const o = Math.max(60, Math.min(100, ovr));
    for (let i = 1; i < FEE_PTS.length; i++) {
      if (o <= FEE_PTS[i][0]) {
        const [x0, y0] = FEE_PTS[i - 1], [x1, y1] = FEE_PTS[i];
        return y0 + (y1 - y0) * (o - x0) / (x1 - x0);
      }
    }
    return FEE_PTS[FEE_PTS.length - 1][1];
  }
  function ageMult(age) { return age <= 21 ? 1.2 : age <= 26 ? 1.15 : age <= 29 ? 1.0 : age <= 32 ? 0.6 : 0.35; }
  function yearsMult(y) { const v = y || 0; return v <= 0 ? 0.55 : v <= 1 ? 0.6 : v === 2 ? 0.9 : 1.0; }
  function perfMult(avgRating) {
    const m = 1 + Math.max(-0.3, Math.min(0.3, ((avgRating || 6.5) - 6.5) * 0.3 * 10));
    return m;
  }

  /* ── 四类风格参数（定价倍率区间 + 挽留/雪藏行为）── */
  const STYLE_CFG = {
    elite: { label: "豪门型", tag: "冠军竞逐", clauseMult: null, wageMult: [1.0, 1.0], keepFx: "captain", freezeOnRefuse: true },
    feeder: { label: "培养型", tag: "跳板条款", clauseMult: [0.9, 1.3], wageMult: [0.9, 1.1], keepFx: "project", freezeOnRefuse: false },
    money: { label: "金主型", tag: "高薪新贵", clauseMult: [2.0, 3.0], wageMult: [1.5, 2.2], keepFx: "raise", freezeOnRefuse: false },
    regular: { label: "常规型", tag: "稳定主力", clauseMult: [1.5, 2.5], wageMult: [0.9, 1.2], keepFx: "raise", freezeOnRefuse: false },
  };

  /* ── 演化参数（金主型 → 豪门型）──
     ★★★ P97 修复记录：这里原本把门槛**写死**在 `evolveCheck` 里（`team.strength >= 78`），
     而**被标注为 money 的球队恰恰都在 76~77**（纽卡斯堡 77 / 妮斯 76，见联赛数据）→
     门槛对所有 money 队恒假 → `e.streak` 每季被 `else` 重置为 0 → `if (e.streak >= 3)` 永不成立
     → **整条演化机制 100% 锁死**（探针模拟 60 季：演化 0 次、最长 streak 0、streak 从未出现过）
     → 玩家**一次也见不到**那张「一支新贵，加冕豪门」的播报卡。

     ★ 修法：门槛收进配置，取 **0（不限）**。理由：
       `money` 是**人工标注**的语义（"这是新贵"），"够不够格演化为豪门"应由标注本身决定；
       再叠一个绝对强度门槛既多余，又必然与标注数据冲突（标注看的是"资本背景"，强度走的是"战绩分档"，
       两者本来就不同源）。稀缺性由「连续 3 季 × 50%」承担（期望 ~8 季/队），不需要再加一层。
     ★ 若日后想再加防线，只改这个数字即可 —— 探针 §C 会给各档的实际触发率。 */
  const EVOLVE_CFG = { MIN_STRENGTH: 0, CHANCE: 0.5, STREAK: 3 };

  let _idx = null;
  function styleIndex() {
    if (_idx) return _idx;
    _idx = {};
    const byName = window.TRANSFER_STYLE_BY_NAME || {};
    if (window.LD) {
      for (const [, lg] of Object.entries(window.LD())) {
        for (const t of lg.teams) _idx[t.id] = byName[t.name] || (t.strength >= 85 ? "elite" : "regular");
      }
    }
    return _idx;
  }
  function styleOf(clubId) {    if (!clubId) return "regular";
    /* ★★★ P97 修复（与「门槛锁死」同批发现）：**存档优先**。
       `evolveCheck` 演化时会改写内存里的 `TRANSFER_STYLE_BY_NAME[队名] = "elite"`，
       但那张表**不随存档持久化**（每次刷新都由 `data_transfer_styles.js` 原样重建）。
       于是刷新后出现自相矛盾的状态：
         存档：`clubEvolve[id].evolved = true`（持久，且挡住重复演化播报）
         内存：`styleOf(id)` 回答 "money"
       → 转会报价 / 挽留链 / 雪藏行为全部按"金主型"走，而玩家已经看过那张
         「一支新贵，加冕豪门」的播报卡。这正是 P97 反复出现的
         「同一状态存在两处、其中一处没同步」型缺陷。
       ★ 修法：让**存档成为唯一权威**（`evolved` 为真一律 elite），内存表只作兜底。
         成本 O(1)，且不依赖 `_idx` 缓存是否新鲜 —— 读档后无需额外重建索引。 */
    const ce = (window.State && State.data && State.data.clubEvolve) || null;
    if (ce && ce[clubId] && ce[clubId].evolved) return "elite";
    const s = styleIndex()[clubId];
    if (s) return s;
    const t = window.teamById ? teamById(clubId) : null;
    return t && t.strength >= 85 ? "elite" : "regular";
  }
  /** ★ 让 `_idx` 缓存失效并重建 —— 演化（`evolveCheck`）内部已自动做，
   *  这里额外导出供**读档流程**与**探针**使用：改名表 / 换存档后需要一次显式重建。
   *  ★ 注意 `styleOf` 现已优先读存档，所以即使缓存陈旧也不会答错；
   *    本函数主要用于「按名字表整体重算」的场景。 */
  function rebuildStyleIndex() { _idx = null; return styleIndex(); }

  function styleLabel(s) { return (STYLE_CFG[s] || STYLE_CFG.regular).label; }

  /* ── 存档槽位初始化 ── */
  function ensure(d) {
    d.transfer = d.transfer || { frozen: null, retention: 0, benchStreak: 0, listed: false,
      clauseTriggered: null, relegCrisis: false, winterPending: null, winterEvalDone: false };
    d.clubEvolve = d.clubEvolve || {};
    return d.transfer;
  }

  /* ── 位置分组（上场承诺判定用）── */
  const POS_GROUP = p => {
    if (p === "GK") return "GK";
    if (["CB", "LB", "RB"].indexOf(p) >= 0) return "DEF";
    if (["CDM", "CM", "CAM"].indexOf(p) >= 0) return "MID";
    return "ATT";
  };
  function playingTimeOf(clubId, ovr, pos) {
    const t = window.teamById ? teamById(clubId) : null;
    if (!t || !t.players) return "starter";
    const g = POS_GROUP(pos);
    /* ★ P143（2026-09-19 用户拍板「不看广告也有概率成为五大联赛一线队主力」）：
       巨星级自动主力 —— ovr ≥ 队内同位置组最高评分 ⇒ starter（世界级球员加盟即核心，
       现实口径）；只有当组内存在**严格更强**的同类竞争者时才轮换。旧判定「同组有
       ≥ovr-2 即 rotation」会把 92 分巨星压成 88 豪门的替补（穿帮）。 */
    let best = 0;
    for (const pl of (t.players || [])) {
      if (POS_GROUP(pl[2]) === g && pl[4] > best) best = pl[4];
    }
    return ovr >= best ? "starter" : "rotation";
  }
  /* 球队野心分级（用户 2026-09-14 拍板：中档 78 → 76）。
     ★ 唯一用处 = 转会报价卡上的一句"球队野心"文案（`o.ambition`），**不参与任何数值判定**。
     ★ 为什么降：78 会把 strength 77 的队（如纽卡）说成「保级」—— 观感突兀；
       实际数据里 76~77 这一档是"联赛中上游"，本就该落在「欧战」。 */
  function ambitionOf(strength) { return strength >= 85 ? "争冠" : strength >= 76 ? "欧战" : "保级"; }

  /* ── 报价富化：赛季末 genTransferOffers 产物 → 加风格/承诺/解约金 ── */
  function enrichOffers(state, offers, avgRating, rank) {
    const d = state.data;
    const t = ensure(d);
    const ovr = window.PlayerSystem ? PlayerSystem.overall(d.player) : 70;
    const fv = feeBaseOf(ovr) * ageMult(d.player.age) * yearsMult(d.contract ? d.contract.years : 3) * perfMult(avgRating);
    // 演化播报先入队（若有）
    evolveCheck(state, avgRating, rank);
    for (const o of (offers || [])) {
      const st = styleOf(o.clubId);
      const cfg = STYLE_CFG[st] || STYLE_CFG.regular;
      o.style = st;
      o.playingTime = playingTimeOf(o.clubId, ovr, d.player.pos);
      const tw = window.teamById ? teamById(o.clubId) : null;
      o.ambition = ambitionOf(tw ? tw.strength : 70);
      o.releaseClause = cfg.clauseMult ? Math.round(fv * (cfg.clauseMult[0] + R.next() * (cfg.clauseMult[1] - cfg.clauseMult[0]))) : null;
      if (st === "money") o.wage = Math.min(window.Career ? Career.WAGE_CAP : 6e6, Math.round((o.wage || 0) * (1.5 + R.next() * 0.7)));
      /* ★★ P117 战术适配（用户拍板「球队买人看是否适配阵容」）：
         fitAssess = 球队阵型槽位 × 玩家位置熟练度的唯一真源——
         · 有适配槽 → 报价带上承诺位置/出场时间（球队地位）/球队战术；
         · 战术里没有玩家能踢的槽位 → o.noFit = true，球队**无意向**（报价被过滤）；
         · 救援/挂牌触发（o.rescue，弱队病急乱投医）豁免过滤，仍尽量带适配信息。 */
      const fit = (window.Tactics && Tactics.fitAssess) ? Tactics.fitAssess(state, tw, d.season) : null;
      if (fit) {
        o.slotPos = fit.pos; o.slotPosName = fit.posName;
        o.cross = fit.cross; o.tactic = fit.tactic; o.tacticEra = fit.tacticEra;
        o.promiseKey = fit.promiseKey; o.promise = fit.promise;
        /* ★ P144：巨星级旁路——P143 的 playingTimeOf 主力语义此前被本行覆盖绕过；
           ovr ≥ 队伍强度−3（当打核心）时即使 fit 判 rot 也给主力承诺（现实口径：
           世界级引援不会以轮换身份加盟）。 */
        o.playingTime = (fit.promiseKey === "star" || ovr >= (tw ? tw.strength : 70) - 3) ? "starter" : "rotation";
      } else if (!o.rescue) {
        o.noFit = true;
      }
    }
    // 解约金被触发：外部报价转会费 ≥ 我方条款 ×0.9
    if (d.contract && d.contract.releaseClause && offers && offers.length) {
      const hit = offers.find(o => (o.fee || 0) >= d.contract.releaseClause.fee * 0.9);
      if (hit) t.clauseTriggered = { clubId: hit.clubId, clubName: hit.clubName, leagueId: hit.leagueId, fee: d.contract.releaseClause.fee };
    } else if (t.clauseTriggered) t.clauseTriggered = null;
    // 降级危机：保级队 + 联赛倒数 3 席
    const lg = window.LD ? LD()[d.leagueId] : null;
    const n = lg ? lg.teams.length : 20;
    t.relegCrisis = !!(lg && (tw0(d) || { strength: 70 }).strength <= 78 && rank > n - 3 && rank <= n);
    // 低价值青年被安排外租（P62）：零报价 + 弱龄 + 强队踢不上 → 俱乐部单方面决定（通知卡）
    const kept = (offers || []).filter(o => !o.noFit);
    if (!kept.length) {
      const twA = tw0(d), ovrA = window.PlayerSystem ? PlayerSystem.overall(d.player) : 70;
      if (twA && twA.strength >= 82 && ovrA <= twA.strength - 10 && d.player.age <= 20 && !d.loan && !d.nextClub &&
          d.contract && (d.contract.years || 0) >= 2 && !t.relegCrisis && !t.clauseTriggered && !(window.ClubEvents && ClubEvents.foreverOn(d))) {
        const lo = genLoanOffers(state, 1)[0];
        if (lo) t_pendingPush(d, { kind: "loanArranged", offer: lo });
      }
    }
    return kept;
  }
  function tw0(d) { return window.teamById ? teamById(d.clubId) : null; }

  /* ── 风格演化：金主型连续 3 季"投入见效"（R.chance(0.5) 代理战绩达标）→ elite ── */
  function evolveCheck(state, avgRating, rank) {
    const d = state.data;
    const lg = window.LD ? LD()[d.leagueId] : null;
    if (!lg) return;
    for (const team of lg.teams) {
      if (styleOf(team.id) !== "money" || (d.clubEvolve[team.id] || {}).evolved) continue;
      const e = d.clubEvolve[team.id] = d.clubEvolve[team.id] || { streak: 0, evolved: false };
      /* ★ 门槛与概率走配置（原为写死的 `>= 78`，锁死了全部 money 队 —— 见 EVOLVE_CFG 注释） */
      if (team.strength >= EVOLVE_CFG.MIN_STRENGTH && R.chance(EVOLVE_CFG.CHANCE)) e.streak++; else e.streak = 0;
      if (e.streak >= EVOLVE_CFG.STREAK) {
        e.evolved = true;
        if (window.TRANSFER_STYLE_BY_NAME) window.TRANSFER_STYLE_BY_NAME[team.name] = "elite";
        _idx = null; // 重建索引
        t_pendingPush(d, { kind: "evolve", clubName: team.name });
      }
    }
  }

  /* ── 待展示卡队列（演化播报；Hub.enter 消费）── */
  function t_pendingPush(d, card) { ensure(d); (d.transfer.pendingCards = d.transfer.pendingCards || []).push(card); }
  function checkPending(state) {
    const d = state.data;
    const t = ensure(d);
    if (t.pendingCards && t.pendingCards.length) {
      const c = t.pendingCards.shift();
      if (c.kind === "evolve") {
        CardHost.show(cardHtml({
          kicker: "足坛风向", art: "tifo",
          title: "一支新贵，加冕豪门",
          body: esc(c.clubName) + " 连续三个赛季砸出统治级战绩，资本终于兑现成了底蕴——欧洲主流媒体已把他们列入「豪门」名录。转会市场的规则，从此对他们不再适用。",
          opts: '<button class="btn btn-primary ec-opt" id="tf-pend-ok">知道了 ▸</button>',
        }), { dismissable: false });
        const b = document.querySelector("#tf-pend-ok");
        if (b) b.onclick = () => { CardHost.close(); State.save(); };
        return true;
      }
      if (c.kind === "loanArranged") {        CardHost.show(cardHtml({
          kicker: "俱乐部决定", art: "training",
          title: "你被外租了",
          body: esc(c.offer.clubName) + " 的租借申请被俱乐部接受了——这份通知没有抄送你的意见箱。「年轻球员需要比赛，这是为你好。」母队继续支付你的周薪，租期一个赛季。",
          hint: "低价值球员的租借没有选择权——练出来，下赛季再谈。",
          opts: '<button class="btn btn-primary ec-opt" id="tf-arr-ok">收拾行李 ▸</button>',
        }), { dismissable: false });
        const b2 = document.querySelector("#tf-arr-ok");
        if (b2) b2.onclick = () => { applyLoan(state, c.offer); CardHost.close(); State.save(); UIkit.toast("租借加盟 " + c.offer.clubName + "，一个赛季后归队"); };
        return true;
      }
      /* ★ P97：未知 kind **不得吞卡** —— 与 CE6 队列同型的修法。
         `shift()` 已经把卡取出队列，若下面没有分支接住它，这张卡就**永久消失且不报错**
         （版本错配、旧档里留着已废弃的 kind、或将来新增 kind 时忘了补分支，都会走到这里）。
         放回队首并退出：留痕 + 下一轮再试，绝不静默丢弃。 */
      if (window.console && console.warn) console.warn("[transfer] 未知播报卡 kind，已放回队列：" + c.kind);
      t.pendingCards.unshift(c);
      return false;
    }
    return false;
  }

  /* ── 挽留链（留守且手握报价时触发；不消耗安排次数）── */
  function onStayWithOffers(state, offers, done) {
    const d = state.data;
    const t = ensure(d);
    if (!offers || !offers.length) { done && done(null); return; }
    if (window.ClubEvents && ClubEvents.foreverOn(d)) { done && done(null); return; } // P63 forever：挽留链永久跳过
    const st = styleOf(d.clubId);
    const cfg = STYLE_CFG[st] || STYLE_CFG.regular;
    const r = (t.retention || 0) + 1;
    t.retention = r;
    const clubName = (tw0(d) || { name: "俱乐部" }).name;
    if (r === 1) {
      const nw = Math.min(window.Career ? Career.WAGE_CAP : 6e6, Math.round((d.contract.wage || 3000) * 1.12));
      d.contract.wage = nw;
      State.save();
      done && done("母队第一时间加薪 12% 挽留（周薪 " + fmt(nw) + "）");
      return;
    }
    if (r === 2) {
      if (window.ClubEvents && ClubEvents.retentionOverride(state, done)) return; // P63 多特蒙顿特化：小火箭的咖啡
      let title, body;
      if (cfg.keepFx === "captain") {
        title = "袖标递到了你面前";
        body = "第二次挽留，" + esc(clubName) + " 把队长袖标摆上了谈判桌：「围绕你建队，袖标是你的。」这是这家豪门能给外的最高承诺——除了冠军本身。";
      } else if (cfg.keepFx === "project") {
        title = "「你是建队核心」";
        body = "第二次挽留，" + esc(clubName) + " 摊开了未来三年的建队图：转会预算、战术板中心、你的名字被圈了三圈。「外面给的是合同，我们给的是蓝图。」";
      } else {
        const nw = Math.min(window.Career ? Career.WAGE_CAP : 6e6, Math.round((d.contract.wage || 3000) * 1.25));
        t._keepWage = nw;
        title = "涨薪 25%，别走了";
        body = "第二次挽留，" + esc(clubName) + " 直接把新数字拍在桌上：周薪 " + fmt(nw) + "。管理层的态度很简单——钱能解决的挽留，不算难题。";
      }
      CardHost.show(cardHtml({
        kicker: "挽留 · 第二轮", art: "contract", title,
        body, hint: "这是续约的最后窗口：再拒绝一次，就没有回头路了。",
        opts: '<button class="btn btn-primary ec-opt" id="tf-keep-acc">接受挽留，续约 2 年 ▸</button>' +
              '<button class="btn btn-ghost ec-opt" id="tf-keep-ref">心意已决，拒绝 ▸</button>',
      }), { dismissable: false });
      const acc = document.querySelector("#tf-keep-acc");
      const ref = document.querySelector("#tf-keep-ref");
      if (acc) acc.onclick = () => {
        const ow = d.contract ? (d.contract.wage || 3000) : 3000;
        const nw = cfg.keepFx === "raise" ? (t._keepWage || Math.round(ow * 1.25)) : Math.min(window.Career ? Career.WAGE_CAP : 6e6, Math.round(ow * 1.25));
        d.contract = { years: 2, wage: nw };
        /* P104-B1：续约成交经纪人抽佣（D4 分档；无签字费，佣金=费率×涨薪差×52×年限）
           ★ P297：payAgentFee 单点落账——实付不超过余额，资金永不击穿为负 */
        const afee = (window.Career && Career.agentFeeOf) ? Career.agentFeeOf(0, ow, nw, 2, d) : 0;   // ★ P185 传 d
        const afeePaid = (window.Career && Career.payAgentFee) ? Career.payAgentFee(d, afee) : 0;
        if (cfg.keepFx === "captain") { d.flags = d.flags || {}; d.flags.captain = true; }
        t.retention = 0;
        t.seasonEndOffers = [];
        t.seasonEndMeta = null;
        State.save();
        CardHost.close();
        done && done("续约完成：周薪 " + fmt(nw) + " × 2 年" + (afeePaid > 0 ? "（经纪人抽成 " + fmt(afeePaid) + "）" : "") + (cfg.keepFx === "captain" ? "，你戴上了队长袖标" : ""));
      };
      if (ref) ref.onclick = () => { CardHost.close(); refuseFinal(state, done); };
      return;
    }
    refuseFinal(state, done);
  }
  /* 第三轮拒绝：按风格分流——豪门雪藏，其余挂牌放人 */
  function refuseFinal(state, done) {
    const d = state.data;
    const t = ensure(d);
    const st = styleOf(d.clubId);
    const cfg = STYLE_CFG[st] || STYLE_CFG.regular;
    t.retention = 0;
    const clubName = (tw0(d) || { name: "俱乐部" }).name;
    if (cfg.freezeOnRefuse && !t.frozen) {
      startFrozen(state, "多次拒绝豪门挽留");
    } else {
      t.listed = true;
      CardHost.show(cardHtml({
        kicker: "挂牌通知", art: "press",
        title: "俱乐部决定放人",
        body: esc(clubName) + " 不再强留：「我们尊重你的选择，也标好了价。」你被官方挂牌——接下来收到的报价，俱乐部都会认真考虑。职业体育的体面告别，大概就是这样。",
        opts: '<button class="btn btn-primary ec-opt" id="tf-listed-ok">接受现实 ▸</button>',
      }), { dismissable: false });
      const b = document.querySelector("#tf-listed-ok");
      if (b) b.onclick = () => { CardHost.close(); State.save(); done && done("你已被挂牌，夏窗报价会更多"); };
    }
    State.save();
  }

  /* ── 雪藏状态机 ── */
  function startFrozen(state, reason) {
    const d = state.data;
    const t = ensure(d);
    t.frozen = { weeks: 0, reason: reason || "与俱乐部决裂" };
    if (window.ClubEvents) { try { ClubEvents.onFrozen(state); } catch (e) { /* ignore */ } } // P63 act4b 字条卡入队
    const clubName = (tw0(d) || { name: "俱乐部" }).name;
    CardHost.show(cardHtml({
      kicker: "雪藏 · 决裂", art: "bench",
      title: "你被雪藏了",
      body: esc(clubName) + " 的态度冷得像板凳：训练单独一组，名单不再有你。管理层放话——「合同还在一天，他就得按合同坐着。」距离下一个转会窗还有整整半个赛季。",
      hint: "雪藏期间无法出场，士气每周下滑。归队或冬窗离队是仅有的两条路。",
      opts: '<button class="btn btn-primary ec-opt" id="tf-fz-acc">低头认错，续约归队 ▸</button>' +
            '<button class="btn btn-ghost ec-opt" id="tf-fz-fight">硬扛到底 ▸</button>',
    }), { dismissable: false });
    const acc = document.querySelector("#tf-fz-acc");
    const fig = document.querySelector("#tf-fz-fight");
    if (acc) acc.onclick = () => {
      const ow = d.contract ? (d.contract.wage || 3000) : 3000;
      const yrs = Math.max(2, (d.contract && d.contract.years) || 2);
      const nw = Math.min(window.Career ? Career.WAGE_CAP : 6e6, Math.round(ow * 1.15));
      d.contract = { years: yrs, wage: nw };
      /* P104-B1：和解续约同样抽佣（D4 分档）★ P297：payAgentFee 单点，余额防线 */
      const afee = (window.Career && Career.agentFeeOf) ? Career.agentFeeOf(0, ow, nw, yrs, d) : 0;   // ★ P185 传 d
      const afeePaid = (window.Career && Career.payAgentFee) ? Career.payAgentFee(d, afee) : 0;
      t.frozen = null; t.retention = 0;
      d.morale = Math.min(100, (d.morale || 60) + 8);
      State.save(); CardHost.close();
      UIkit.toast("和解成功：续约周薪 " + fmt(nw) + (afeePaid > 0 ? "（经纪人抽成 " + fmt(afeePaid) + "）" : "") + "，重回大名单");
    };
    if (fig) fig.onclick = () => { State.save(); CardHost.close(); UIkit.toast("你选择了硬扛……板凳的日子开始了", "gray"); };
  }
  function isFrozen(d) { return !!(d && d.transfer && d.transfer.frozen); }
  function weeklyTick(state) {
    const d = state.data;
    if (!isFrozen(d)) return;
    d.transfer.frozen.weeks++;
    d.morale = Math.max(0, (d.morale || 60) - 2);
  }
  /* 雪藏/挂牌期间的出场压制（match.js 挂钩） */
  function blockPlaying(d) {
    return isFrozen(d);
  }
  function registerMatch(d, played) {
    if (!d || !d.transfer) return;
    d.transfer.benchStreak = played ? 0 : (d.transfer.benchStreak || 0) + 1;
  }

  /* ── 冬窗通道（并入休赛期转会卡：救援/挂牌/强挖三类触发）── */
  function winterTriggers(state) {
    const d = state.data;
    const t = ensure(d);
    if (window.ClubEvents && ClubEvents.foreverOn(d)) return null; // P63 forever：冬窗三触发全关
    const ovr = window.PlayerSystem ? PlayerSystem.overall(d.player) : 70;
    const apps = (d.seasonStats && d.seasonStats.apps) || 0;
    const avgR = apps ? (d.seasonStats.ratingSum || 0) / apps : 6.5;
    if (t.frozen) return "rescue";
    if (t.listed) return "listed";
    if ((t.benchStreak || 0) >= 6) return "rescue";
    if (ovr >= 80 && avgR >= 7.2 && R.chance(0.6)) return "megaswap";   // ★ P143：82→80 / 0.45→0.6（豪门直通车更可达）
    return null;
  }
  function genWinterOffers(state, trigger, avgRating, tag) {
    const d = state.data;
    const ovr = window.PlayerSystem ? PlayerSystem.overall(d.player) : 70;
    const curStr = (tw0(d) || { strength: 60 }).strength;
    const want = trigger === "megaswap" ? ["elite"] : ["feeder", "regular", "money"];
    const targets = [];
    for (const [lid, lg] of Object.entries(LD())) {
      for (const team of lg.teams) {
        if (team.id === d.clubId) continue;
        const st = styleOf(team.id);
        if (want.indexOf(st) < 0) continue;
        if (trigger === "megaswap" ? team.strength >= 85 : (team.strength > curStr - 5 && team.strength <= ovr + 10)) {
          targets.push({ team, league: lid });
        }
      }
    }
    const out = [];
    /* ★ P285（玩家反馈「转会固定两个球队」观感）：每窗报价数 2→3——缓存跨季残留才是
       「固定」的主因（resetWindow 已修），但 2 份的观感多样性也确实弱；megaswap 维持 3。 */
    const n = Math.min(trigger === "megaswap" ? 3 : 3, targets.length);
    for (let i = 0; i < n; i++) {
      const pick = targets.splice(R.int(0, targets.length - 1), 1)[0];
      /* ★ P185：谈判专家 → 转会报价周薪上浮（5★ ×1.08）；签字费猎手 → 签字费放大（5★ ×1.15） */
      const negoMult = (window.Skills && Skills.mult) ? (Skills.mult(d, "negotiator", 0.08) || 1) : 1;
      const wage = Math.min(window.Career ? Career.WAGE_CAP : 6e6, Math.round(Career.wageOf(ovr, pick.team.strength, R.next()) * (want[0] === "elite" ? 1 : 1.1) * negoMult));
      const fee = Math.round(Math.min(5e8, Career.wageBase(ovr) * 600 * 1.1 * (0.8 + R.next() * 0.4)));
      const bhMult = (window.Skills && Skills.mult) ? (Skills.mult(d, "bonusHunter", 0.15) || 1) : 1;
      out.push({
        clubId: pick.team.id, clubName: pick.team.name, leagueId: pick.league,
        leagueName: LD()[pick.league].name, wage, fee,
        signingBonus: Math.round(wage * 5 * bhMult),
        winter: true,
        winterTag: tag || "冬窗",
        /* ★ P117：救援/挂牌 = 弱队病急乱投医，战术适配豁免过滤（缺人>适配） */
        rescue: trigger === "rescue" || trigger === "listed",
      });
    }
    return enrichOffers(state, out, avgRating || 6.8, 99);
  }
  /* ══════════ P100-B4：赛季中转会窗（欧洲冬窗 1 月 / 中超夏窗 6-7 月）══════════ */

  /** 窗口开放判定：联赛日历 win 区间内 + 休赛期外 + 生涯中（青训/退役不可转会） */
  function windowOpen(d) {
    if (!d || d.offseason || d.retired) return false;
    /* ★ P101-3（2026-09-16 用户拍板「未成年不签职业合同」）：判据必须用 **isProtected**
       （academy+jump）而不是 inAcademy —— 原写法只挡 academy，**跳级者（phase="jump"）
       照样进窗** ⇒ 14 岁学徒被报价、applyOffer 写下 d.contract 职业合同（穿帮实锤）。
       保护语义与 intl.js 征召门 / career.js 学徒费率同源：跳级者受 17 岁出口约束，
       出口前转会窗一律关闭（挽留流走 NationDev 转会卡 UI，同样经过本判定 ⇒ 自动关闭）。 */
    if (window.Youth && Youth.isProtected && Youth.isProtected(d)) return false;
    return !!(window.CONFIG && CONFIG.calInWindow && CONFIG.calInWindow(d.leagueId, d.date));
  }

  /** 赛季中报价：同冬窗三触发，但目标限**同一日历组**（crossYear 相同）——
     跨日历组（欧↔中超）的季节相位不同步，中期换队会落进对方休赛期，不开放。 */
  function genMidSeasonOffers(state, trigger, avgRating) {
    const d = state.data;
    const myCross = CONFIG.calOf(d.leagueId).crossYear;
    const all = genWinterOffers(state, trigger, avgRating, d.leagueId === "csl" || d.leagueId === "chinaleague" ? "夏窗" : "冬窗");
    return all.filter(o => CONFIG.calOf(o.leagueId).crossYear === myCross);
  }

  /** ★ 赛季中转会（立即生效）：记账（对齐 applyOffer，不设 nextClub）+ 世界重建。
     世界重建：新队剩余赛程重定基到当前 dayIndex 轴；同联赛保留积分榜（新队已有模拟历史）；
     跨联赛重建积分榜（已完成轮次即时模拟）；杯赛/洲际资格不随人走（杯赛绑人）→ 残余赛程幽灵化。 */
  function applyMidSeason(state, o, opts) {
    const d = state.data;
    if (!windowOpen(d)) return null; // 窗外调用 = 响亮拒绝
    /* ★★ P299（Tap 玩家反馈「转会窗可以无限转会」实锤，热点资讯同源双端在案）：本窗一次交易硬门。
       根因：applyMidSeason 成功后清 _winterOffers/_winterLoans（P285 换队作废缓存），但窗还开着
       （欧洲 1 月 / 中超 6-7 月整月开放）→ openWinterCard 重开即重新生成新报价 → 再转会 → 无限循环；
       连锁伤害（玩家实录「转会多了以后什么都做不了，也推进不了」）：①永久转会分支漏清 d.loan
       （applyOffer 有清、这里漏了）→ 季末归队链把人拽回旧租借母队；②连环转会反复重建赛程/写花
       fromClubId，推进链损坏。修法：midMovedSeason 只在成功交易时写入（= d.season），
       同季内任何二次交易在此响亮拒绝；UI 侧 openWinterCard 同步关门（双保险）。
       ★ 形态约束：不进 ensure() 默认对象、不在 resetWindow 里重置（比较 d.season 天然跨窗失效）
         —— 字段只在 applyMidSeason 内落盘，soak 基线（P264 三种子指纹）零漂移。 */
    const _tGate = ensure(d);
    if (_tGate.midMovedSeason === d.season) return null;
    const isLoan = !!(opts && opts.loan); // ★ P100-B6：赛季中租借形态（不覆盖母队合同、设 d.loan，季末 career.js 自动归队）
    /* ★ P301：租借年内再外租 = 连环租借（会覆盖 d.loan、抹掉租期凭证）→ 响亮拒绝。
       租借年内 permanent 转会仍放行（applyOffer:624 / 本函数 :503 有清 d.loan 的合法分支）。 */
    if (isLoan && d.loan) return null;
    const sameLeague = o.leagueId === d.leagueId;
    const clubName = (tw0(d) || { name: "现俱乐部" }).name;
    const fromClubId = d.clubId, fromLeagueId = d.leagueId;

    // ① 记账（对齐 applyOffer :408-425，去掉 nextClub；租借保留母队合同与薪金）
    const sbMs = Math.round((o.signingBonus || 0) * (window.TAL ? TAL.moneyMult(d) : 1));
    d.money = (d.money || 0) + sbMs;
    const oldWageMs = d.contract ? (d.contract.wage || 0) : 0;
    if (!isLoan) {
      d.contract = { years: 3, wage: o.wage };
      if (o.releaseClause) d.contract.releaseClause = { fee: o.releaseClause };
      d.loan = null; /* ★ P299：赛季中永久转会终结租借关系（对齐 applyOffer「从租借俱乐部 permanent 转会」分支）——
                        此前漏清，租借期再 permanent 会残留 d.loan → 季末归队链把人拽回旧租借母队（推进不了实锤之一） */
      /* ★ P297 续（兄弟拍板「对齐」）：赛季中永久转会同样抽佣——口径与 applyOffer 完全一致
         （基数 = 签字费实际入账 + 涨薪差×52×3；payAgentFee 单点，实付不超过余额，
         资金永不击穿为负）。租借形态不抽（母队合同保留，无涨薪差，与 applyLoan 同口径）。 */
      const afeeMs = (window.Career && Career.agentFeeOf) ? Career.agentFeeOf(sbMs, oldWageMs, o.wage, 3, d) : 0;
      if (window.Career && Career.payAgentFee) Career.payAgentFee(d, afeeMs);
    } else {
      /* ★ P301：租期凭证统一（endSeason = 下季）——季初 backLoan 归队判据单源；
         语义与旧实现一致（1 月短租到本赛季结束，S+1 季开季归队）。 */
      d.loan = { fromClubId: fromClubId, fromLeagueId: fromLeagueId, fromClubName: clubName, clubName: o.clubName, endSeason: d.season + 1 };
    }
    d.history = d.history || {};
    d.history.pastClubs = d.history.pastClubs || [];
    d.history.pastClubs.push(clubName);
    /* ★ P220：赛季中永久转会同样落转会费记录（赛季中窗 = 冬窗口径；租借形态不记——无永久加盟） */
    if (!isLoan) {
      d.history.transfers = d.history.transfers || [];
      d.history.transfers.push({
        season: d.season, to: o.clubName || o.clubId, fee: o.fee || 0,
        free: !(o.fee > 0), winter: true, ad: !!o.pickedByAd,
      });
    }
    d.seasonEndOffers = []; d.seasonEndMeta = null;
    const t = ensure(d);
    t.midMovedSeason = d.season; /* ★ P299：本窗一次交易凭证（同季拒绝二次交易；见函数头注释） */
    t.frozen = null; t.listed = false; t.retention = 0; t.benchStreak = 0;
    t.clauseTriggered = null;
    t._winterAdded = true;
    /* ★★ P285（玩家截图实锤「已是曼德里球员还显示转回」）：换队即刻作废旧窗的报价/租借
       缓存——否则同窗内（如 1 月冬窗转会后再开窗）_winterOffers 仍挂旧列表，
       其中就有刚加盟的**现队**（能把自己转会给自己）。下窗由 openWinterCard 重新生成。 */
    t._winterOffers = null;
    t._winterLoans = null;
    /* P105-B2：赛季中永久转会同样落出场承诺（租借形态不落——母队合同保留，无新约可背） */
    if (!isLoan) t.promise = { role: o.playingTime === "rotation" ? "rotation" : "starter", season: d.season, clubId: o.clubId, met: null };
    if (window.ClubEvents) { try { ClubEvents.onLeave(state, clubName); } catch (e) { /* ignore */ } }

    // ② 杯赛/洲际资格不随人走（已代表旧队报名）→ 残余赛程幽灵化
    if (d.cup) d.cup.alive = false;
    if (d.cc) d.cc.alive = false;
    if (d.scc) d.scc.alive = false;

    // ③ 换队
    d.clubId = o.clubId;
    const oldLeagueId = d.leagueId;
    d.leagueId = o.leagueId;

    // ④ 新队剩余赛程：整季生成 → 取比赛日 ≥ 今天 → 重定基到当前 dayIndex 轴
    const lg = LD()[o.leagueId];
    const teams = lg.teams.map(x => ({ id: x.id, name: x.name, strength: x.strength }));
    const gap = CONFIG.calOf(o.leagueId).gap;
    const st = CONFIG.calStart(o.leagueId, d.season);
    const anchorMs = Date.UTC(st.year, st.month - 1, st.day, 12);
    const rsSeason = (window.REAL_SCHEDULE && window.REAL_SCHEDULE.meta && window.REAL_SCHEDULE.meta.season) || "2014";
    /* ★ 取值姿势与 initSeason 同款：条件链必须以 _dpRaw 本身结尾——以布尔比较结尾会让
       dpRaw 变成 true、Object.assign 丢掉全部 dates（B3 在 season.js 修过的同款坑） */
    const _dpRaw = (window.REAL_SCHEDULE && window.REAL_SCHEDULE.leagues && window.REAL_SCHEDULE.leagues[o.leagueId]) || null;
    const dp = (_dpRaw && String(d.season) === String(rsSeason)) ? Object.assign({}, _dpRaw, { _anchorMs: anchorMs }) : null;
    const full = SeasonSystem._buildLeagueFixtures(teams, o.clubId, gap, dp);
    const nowMs = Date.UTC(d.date.year, d.date.month - 1, d.date.day, 12);
    const kept = [];
    let completedRounds = 0;
    for (const f of full) {
      const fd = f.date ? Date.parse(f.date + "T12:00:00Z") : anchorMs + f.day * 86400000;
      if (fd < nowMs) { completedRounds = Math.max(completedRounds, f.round); continue; }
      kept.push(Object.assign({}, f, { day: d.dayIndex + Math.max(1, Math.round((fd - nowMs) / 86400000)) }));
    }
    d.fixtures = kept;

    // ⑤ 积分榜：同联赛保留（新队已有模拟历史）；跨联赛重建（已完成轮次即时模拟）
    if (!sameLeague) {
      d.table = teams.map(x => ({ id: x.id, name: x.name, strength: x.strength, p: 0, w: 0, dr: 0, l: 0, gf: 0, ga: 0, pts: 0 }));
      for (let r = 0; r < completedRounds; r++) SeasonSystem.simulateRound(state, null, { includeAll: true });
    }
    State.save();
    return clubName;
  }

  /* 接受一份报价（转会/冬窗/解约金共用） */
  function applyOffer(state, o, clauseMult) {
    const d = state.data;
    const t = ensure(d);
    const club = (tw0(d) || { name: "现俱乐部" }).name;
    const oldWage = d.contract ? (d.contract.wage || 0) : 0;
    const sbActual = Math.round((o.signingBonus || 0) * (window.TAL ? TAL.moneyMult(d) : 1));
    d.money = (d.money || 0) + sbActual;
    const wage = clauseMult && clauseMult < 1 ? Math.max(1000, Math.round(o.wage * clauseMult)) : o.wage;
    d.contract = { years: 3, wage };
    /* P104-B1：转会签约经纪人抽佣（D4；基数=签字费实际入账 + 涨薪差×52×3）。
       ★ 租借（applyLoan）不抽佣：母队合同保留，无涨薪差。
       ★ P297：payAgentFee 单点落账——实付不超过余额（签字费先行入账，余额含签字费），
       转会暴涨薪不再把资金击穿为负（Tap 玩家实录反馈）。 */
    const afee = (window.Career && Career.agentFeeOf) ? Career.agentFeeOf(sbActual, oldWage, wage, 3, d) : 0;   // ★ P185 传 d
    const afeePaid = (window.Career && Career.payAgentFee) ? Career.payAgentFee(d, afee) : 0;
    if (o.releaseClause && clauseMult) {
      d.contract.releaseClause = { fee: Math.round(o.releaseClause * (clauseMult < 0.85 ? 0.56 : 0.75)) };
    } else if (o.releaseClause) {
      d.contract.releaseClause = { fee: o.releaseClause };
    }
    d.history = d.history || {};
    d.history.pastClubs = d.history.pastClubs || [];
    d.history.pastClubs.push(club);
    /* ★★ P220：转会费记录（玩家拍板：每一笔转会留痕，无转会费=自由转会）。
       season = 即将开始的赛季（finishSeason 已 d.season++）；传奇排行榜逐季标注加盟方式。 */
    d.history.transfers = d.history.transfers || [];
    d.history.transfers.push({
      season: d.season, to: o.clubName || o.clubId, fee: o.fee || 0,
      free: !(o.fee > 0), winter: !!o.winter, ad: !!o.pickedByAd,
    });
    d.nextClub = { clubId: o.clubId, leagueId: o.leagueId };
    /* ★★ P296（玩家实测「雾都蓝狮青训看广告转会棉都红魔 → 已在棉都红魔一线队 → 16 岁达线又被『青训征召』拽回雾都蓝狮一线队」）：
       青训期接受任何转会（报价/冬窗/解约金/看广告指定下家，全部汇入 applyOffer 单点）
       ⇒ **立即终结青训相位**（Youth.leave 单一写点，语义 = 离开青训转投他队 "drop"）。
       ★ 顺序铁律：leave("drop") 的落点还原**读 d.nextClub** ⇒ 必须在 nextClub 写入**之后**调用；
         leave 内部会把 d.clubId 还原成新东家成年 id、置 phase=senior + firstProContract ——
         下季 beginSeason 走 routePro 直建新东家一线队赛程，finishYouthSeason 永不再触发征召。
       ★ 不修它：相位残留 academy → 达线年 finishYouthSeason 仍按**入营时**的 academyId 出
         「一线队征召」，把已在新东家一线队的球员拽回母队（报告原案）。 */
    if (window.Youth && Youth.isProtected && Youth.isProtected(d)) {
      const _okLeave = Youth.leave(d, "drop");
      if (!_okLeave) console.warn("transfer.applyOffer：青训相位终结被拒（落点 " + String(o.clubId) + "）—— 转会照常，青训出口交由 19 岁守卫兜底");
    }
    d.loan = null; // 从租借俱乐部 permanent 转会 → 租借关系终结
    d.seasonEndOffers = [];
    t.frozen = null; t.listed = false; t.retention = 0; t.benchStreak = 0;
    t.clauseTriggered = null;
    /* P105-B2：转会签约落出场时间承诺（口径单源 = enrichOffers 的 playingTime 二值判定；
       报价卡「承诺主力」文案早已存在，本批起真正落档+赛末校验）。 */
    t.promise = { role: o.playingTime === "rotation" ? "rotation" : "starter", season: d.season, clubId: o.clubId, met: null };
    if (window.ClubEvents) { try { ClubEvents.onLeave(state, club); } catch (e) { /* ignore */ } } // P63 act5a 灯还亮着
    State.save();
    return club;
  }

  /* ── 卡片外壳（对齐 nation_dev.cardShell 的 ec-card 结构，插画可指定）── */
  function head(k) {
    if (window.EventCards && EventCards.cardHeadHtml) return EventCards.cardHeadHtml(k);
    return '<div class="ec-head"><span class="ec-kicker">' + esc(k) + "</span></div>";
  }
  function cardHtml(o) {
    return '<div class="ec-card">' + head(o.kicker) +
      '<div class="ec-art" style="' + artOf(o.art || "transfer") + '"></div>' +
      '<div class="ec-title">' + esc(o.title) + "</div>" +
      '<div class="ec-body">' + (o.body || "") +
      (o.hint ? '<div class="ec-hint">' + esc(o.hint) + "</div>" : "") + "</div>" +
      '<div class="ec-opts">' + (o.opts || "") + "</div></div>";
  }

  /* ══════════ P62 二期：转会申请 / 联合施压 / 租借二段式 ══════════ */

  /* 窗口旗标重置（initSeason 调用）：冬窗追加/申请/施压均为单窗口状态，不跨季
     （P61 的 _winterAdded 曾因不重置导致冬窗触发全生涯只生效一次——本函数即修复） */
  function resetWindow(d) {
    const t = ensure(d);
    t._winterAdded = false;
    t.requested = false;
    t.reqRefused = false;
    t.pressureUsed = false;
    /* ★★ P285（玩家实测截图：①「转会固定两个球队」②「已是本队球员还显示转回」）：
       _winterOffers/_winterLoans 是窗内一次性生成的**报价缓存**，此前只在新窗生成时写入、
       广告刷新时清除——initSeason 不清 ⇒ **跨季残留**（每年冬窗都弹同一份报价列表）；
       窗内转会成功后也不清 ⇒ **跨转会残留**（加盟 X 队后再开窗，报价里还挂着「X · 冬窗加盟」，
       能把自己转会给自己）。修法：每季开季随窗口旗标一并重置（换队作废由 applyMidSeason 清）。 */
    t._winterOffers = null;
    t._winterLoans = null;
  }

  /* ── 转会申请（球员的核武器）：纯判定，UI 在 nation_dev.openTransferCard ── */
  function importanceOf(state) {
    const d = state.data;
    const tw = tw0(d);
    const ovr = window.PlayerSystem ? PlayerSystem.overall(d.player) : 70;
    const apps = (d.seasonStats && d.seasonStats.apps) || 0;
    const avgR = apps ? (d.seasonStats.ratingSum || 0) / apps : 6.0;
    // 0.5×实力契合 + 0.3×出勤 + 0.2×评分：对俱乐部越重要，越难放手也越可能撕破脸
    const fit = tw ? Math.max(0, Math.min(1, (ovr - (tw.strength - 12)) / 12)) : 0.5;
    return 0.5 * fit + 0.3 * Math.min(1, apps / 25) + 0.2 * Math.max(0, Math.min(1, (avgR - 6.0) / 1.5));
  }
  function evaluateRequest(state) {
    const d = state.data;
    const t = ensure(d);
    t.requested = true;
    const st = styleOf(d.clubId);
    const cfg = STYLE_CFG[st] || STYLE_CFG.regular;
    const tw = tw0(d);
    const clubName = (tw || { name: "俱乐部" }).name;
    const imp = importanceOf(state);
    const lastYear = d.contract && (d.contract.years || 0) <= 1;
    if (window.ClubEvents && ClubEvents.foreverOn(d)) return { outcome: "refused", clubName, title: "一生一队", body: "申请在半路被你自己的誓言拦下了。你对着南看台喊过那句话——这里没有你的转会窗。" }; // P63 forever
    d.morale = Math.max(0, (d.morale || 60) - 8);
    if (lastYear) {
      t.listed = true;
      return { outcome: "listed", clubName, title: "俱乐部同意放人",
        body: "合同只剩最后一年，" + esc(clubName) + " 没有强留的筹码：「挂牌吧。好聚好散，别把最后半年的情分耗光。」球迷会烧你的球衣，但你知道自己没做错——职业生涯只有一次。" };
    }
    if (cfg.freezeOnRefuse && imp >= 0.62 && R.chance(0.6)) {
      return { outcome: "freeze", clubName };
    }
    if (st === "money" && R.chance(0.5)) {
      t.reqRefused = true;
      return { outcome: "refused", clubName, title: "金主的傲慢",
        body: esc(clubName) + " 直接把申请拍了回来：「我们买你来是让你踢球的，不是让你挑主席的。」钱他们有的是，耐心没有——想走？先拿出让俱乐部亏钱的本事。" };
    }
    if (st === "elite" || st === "money") {
      t.reqRefused = true;
      return { outcome: "refused", clubName, title: "「申请驳回」",
        body: esc(clubName) + " 的回应公事公办：转会申请收到，予以驳回。「合同还有 " + (d.contract.years || 2) + " 年，请尊重契约。」看台上的嘘声告诉了你球迷的态度——但那份白纸黑字的文件，收不回来了。" };
    }
    t.listed = true;
    return { outcome: "listed", clubName, title: "俱乐部决定放人",
      body: esc(clubName) + " 算了一笔账：转会费 + 省下的薪资，大于强留一个心不在焉的球员。「挂牌吧，我们会为你的下一站要个好价钱。」中层俱乐部的体面，就是从不为难想走的人。" };
  }

  /* ── 联合施压：更衣室联名逼宫（转会申请被拒后的一次性选项）── */
  function lockerSupport(state) {
    const d = state.data;
    const apps = (d.seasonStats && d.seasonStats.apps) || 0;
    let s = 0;
    if (d.flags && d.flags.captain) s += 2;                       // 队长：更衣室话语权
    if (apps >= 15) s += 1;                                        // 主力：有人愿意跟你站
    if ((d.morale || 60) >= 65) s += 1;                            // 人缘没崩
    const tw = tw0(d);
    if (tw && window.PlayerSystem && PlayerSystem.overall(d.player) >= tw.strength - 3) s += 1; // 队内顶星
    return s; // 0~5
  }
  function evaluatePressure(state) {
    const d = state.data;
    const t = ensure(d);
    t.pressureUsed = true;
    const sup = lockerSupport(state);
    const st = styleOf(d.clubId);
    const cfg = STYLE_CFG[st] || STYLE_CFG.regular;
    const clubName = (tw0(d) || { name: "俱乐部" }).name;
    const p = sup >= 4 ? 0.85 : sup >= 3 ? 0.65 : sup >= 2 ? 0.4 : 0.15;
    if (R.chance(p)) {
      t.listed = true;
      return { outcome: "listed", sup, clubName };
    }
    d.morale = Math.max(0, (d.morale || 60) - 8);                  // 硬扛：你先被架上火烤
    if (cfg.freezeOnRefuse && R.chance(0.35)) return { outcome: "freeze", sup, clubName };
    return { outcome: "standoff", sup, clubName };
  }

  /* ── 租借二段式：高价值（OVR≥74 且 ≤24 岁）= 竞拍自选；低价值 = 俱乐部安排 ── */

  /* ── P104-B3：队内身份单源判定（FM 口径：全队能力排序，前 11 主力 / 12-16 轮换 / 其余替补） ──
     ★ 唯一口径源：俱乐部页阵容显示（hub.js roleOf 引用同一档位常量）、租借申请门（D5 主力不放）、
       B4 挂牌门三处共用——「修一处 ≠ 修一类」，档位数字不许在第二处硬编码。
     青训期 / 玩家不在阵容列表 → role:"none"（门判定交给 loanEligible 的实力条件）。 */
  const SQUAD_ROLE_CUT = { starter: 11, rotation: 16 };
  function squadRoleOf(state) {
    const d = state.data;
    const tw = tw0(d);
    const players = (tw && tw.players) || [];
    if (!players.length) return { rank: -1, role: "none", total: 0 };
    const rank = players.slice().sort((a, b) => (b[4] || 0) - (a[4] || 0));
    const i = rank.findIndex(p => p[0] === d.player.name);
    const role = i < 0 ? "none" : i < SQUAD_ROLE_CUT.starter ? "starter" : i < SQUAD_ROLE_CUT.rotation ? "rotation" : "bench";
    return { rank: i, role: role, total: rank.length };
  }

  /* ── P104-B3：主动申请外租的门（D5 拍板：教练信任 ≥60 且 非主力绝对不放） ──
     与 loanEligible 的关系：同一批硬条件 + 两条玩家申请专属软门（信任 / 地位）；
     俱乐部**安排**外租（事件卡通道）只走 loanEligible，不受信任与地位约束。
     ★ 门只做「挡/放 + 原因文案」判定，零 R；真实报价由点击后的 genLoanOffers
       生成（用户交互耗 R，与转会报价同理——页面渲染必须零 R，soak 基线不漂移）。 */
  function loanRequestGate(state) {
    const d = state.data;
    if (d.loan || d.nextClub) return { ok: false, why: "你正在外租期内，租借合同未满。" };
    if (window.ClubEvents && ClubEvents.foreverOn(d)) return { ok: false, why: "你的外租豁免条款仍在生效。" };
    const t = ensure(d);
    if (t.frozen) return { ok: false, why: "你正被俱乐部雪藏，谈判窗口不会为你打开。" };
    if (t.listed) return { ok: false, why: "你已在转会市场被挂牌——先看转会市场的下家吧。" };
    if (t.relegCrisis) return { ok: false, why: "球队正处保级危机，这个时候谁也走不了。" };
    if (t.clauseTriggered) return { ok: false, why: "解约金条款生效期间，你的去向由条款决定。" };
    if (!d.contract || (d.contract.years || 0) < 2) return { ok: false, why: "合同进入最后一年——俱乐部不会在续约之前外租你。" };
    const tw = tw0(d);
    if (!tw) return { ok: false, why: "你目前没有所属俱乐部。" };
    const ovr = window.PlayerSystem ? PlayerSystem.overall(d.player) : 70;
    if (!(tw.strength >= 82 && ovr <= tw.strength - 8)) return { ok: false, why: "你在队里踢得上球——只有强队里打不上比赛的球员，俱乐部才肯放出去练级。" };
    const trust = (d.chars && d.chars.coach_trust != null) ? d.chars.coach_trust : 50;
    if (trust < 60) return { ok: false, why: "教练信任还不够——他不放心把你放出去练级。" };
    const sq = squadRoleOf(state);
    if (sq.role === "starter") return { ok: false, why: "你是球队主力——俱乐部不会放主力走。" };
    return { ok: true, why: "" };
  }

  function loanEligible(state) {
    const d = state.data;
    if (d.loan || d.nextClub) return false;
    if (window.ClubEvents && ClubEvents.foreverOn(d)) return false; // P63 forever：低价值外租豁免
    const t = ensure(d);
    if (t.frozen || t.listed || t.relegCrisis || t.clauseTriggered) return false;
    if (!d.contract || (d.contract.years || 0) < 2) return false;  // 合同末年不外租
    const tw = tw0(d);
    if (!tw) return false;
    const ovr = window.PlayerSystem ? PlayerSystem.overall(d.player) : 70;
    return tw.strength >= 82 && ovr <= tw.strength - 8;            // 强队踢不上球
  }

  /* ── P105-B2：出场时间承诺的赛末兑现校验（FM squad status 球员侧化） ──
     语义：转会签约/赛季中永久转会时俱乐部给的「主力/轮换」承诺（playingTime 二值单源），
     在**新队打满一季**的季末校验一次。达门槛 = 兑现（本分，零奖励）；
     未达 = 信任 −4 + 情绪 −5（教练骗了你）。校验后 met 固化，不再重复结算。
     ★ 时序：applyOffer（休赛期通道）只写 nextClub 人未到 → 落档 clubId=新队、d.clubId=旧队；
       校验条件 p.clubId === d.clubId 即「等人到位」（新季 init 后 d.clubId 赶上承诺方）。
       applyMidSeason 立即换队 → 落档即匹配，本季末校验（半季口径，冬窗转会门槛实际更松=设计内）。
     ★ 返回值只供调用方临时读（met/role），**不得进 finishSeason result**——
       soak 会把 result 整包深拷进存档快照，返回值结构变化 = 末态指纹假漂移（P105-B1 实证）。 */
  function promiseSettle(state, apps) {
    const d = state.data;
    const t = ensure(d);
    const p = t.promise;
    if (!p || p.met !== null) return null;
    if (p.clubId !== d.clubId) { p.met = null; return null; }      // 承诺不跟着人走（保险分支）
    const cfg = CONFIG.P105_PROMISE || { starter: 20, rotation: 10, TRUST_MISS: -4, MORALE_MISS: -5 };
    const bar = p.role === "rotation" ? cfg.rotation : cfg.starter;
    p.met = (apps | 0) >= bar;
    if (p.met) return { role: p.role, met: true };
    d.chars = d.chars || {};
    d.chars.coach_trust = Math.max(0, (d.chars.coach_trust == null ? 50 : d.chars.coach_trust) + cfg.TRUST_MISS);
    d.morale = Math.max(0, (d.morale || 60) + cfg.MORALE_MISS);
    return { role: p.role, met: false };
  }

  /* ── P104-B4：赛季中「请求挂牌」的门（规格 §3.2；D6 冷却沿用单旗标 t.requested） ──
     与休赛期卡 canReq 同口径（同一面旗标，互斥防刷：赛季中申请过 → 休赛期不能再申请，
     被拒后仍可走既有施压通道）。evaluateRequest 本体零改动（雪藏/拒绝/放人三分支管道照旧）。
     ★ 注意**不挡**合同末年 / 保级危机——evaluateRequest 对这两态本就有专属分支（末年直接放人）。
     门只做挡/放 + 原因文案，零 R；真正的裁决在点击后的 evaluateRequest（用户交互耗 R）。 */
  function listingGate(state) {
    const d = state.data;
    if (window.ClubEvents && ClubEvents.foreverOn(d)) return { ok: false, why: "你对南看台宣过誓——这里没有你的转会窗。" };
    const t = ensure(d);
    if (t.frozen) return { ok: false, why: "你正被俱乐部雪藏——低头认错，或者接受报价走人。" };
    if (t.listed) return { ok: false, why: "你已在转会市场被挂牌——等俱乐部把报价送进办公室。" };
    if (t.clauseTriggered) return { ok: false, why: "解约金条款生效期间，你的去向由条款决定。" };
    if (d.loan || d.nextClub) return { ok: false, why: "你正在外租期内，租借合同未满。" };
    if (!d.clubId) return { ok: false, why: "你目前没有所属俱乐部。" };
    if (d.phase === "academy") return { ok: false, why: "青训学徒没有转会申请——先签下职业合同。" };
    if (t.requested) return { ok: false, why: "本赛季已经递交过一次申请——俱乐部记性很好，没有第二次。" };
    return { ok: true, why: "" };
  }

  /* ── P104-B4：续约条款报价单（规格 §3.3：高薪+天价 vs 低薪+低解约，金额一律从身价公式出） ──
     D7 拍板：名气 ≥ CONFIG.P104_CLAUSE.FAME_MIN 才可选；豪门（elite）惯例不给条款——
     对齐转会卡既有文案「豪门惯例：合同不含解约金条款」。
     基准 = clauseBaseOf(新合同 3 年) × 风格 clauseMult 区间**中值**（取中值保持零 R——
     renewalQuote 全链确定性，还价应允判定不掷骰的口径延伸到条款侧）。
     低薪档系数对齐休赛期条款卡「压一档」（0.9 薪 / 0.75 解约金）。
     ★ 零 R（查表+公式）；renewalQ 传 Career.renewalQuote 的返回（UI 已持有，做桥）。 */
  function clauseBaseOf(d, avgRating, years) {
    const ovr = window.PlayerSystem ? PlayerSystem.overall(d.player) : (d.player && d.player.ovr) || 70;
    return feeBaseOf(ovr) * ageMult(d.player.age) * yearsMult(years) * perfMult(avgRating);
  }
  function renewalClauseQuote(state, renewalQ) {
    const d = state.data;
    const cfg = (window.CONFIG && CONFIG.P104_CLAUSE) || { FAME_MIN: 1e6, WAGE_MULT_LOW: 0.9, CLAUSE_MULT_LOW: 0.75 };
    if ((d.fame || 0) < cfg.FAME_MIN) return { eligible: false, why: "fame" };
    const st = styleOf(d.clubId);
    const sc = STYLE_CFG[st] || STYLE_CFG.regular;
    if (!sc.clauseMult) return { eligible: false, why: "elite" };   // 豪门型：clauseMult 为 null
    const mid = (sc.clauseMult[0] + sc.clauseMult[1]) / 2;
    const ss = d.seasonStats || {};
    const avg = ss.apps ? (ss.ratingSum || 0) / ss.apps : 6.5;      // 赛季场均评分（未出场退默认 6.5，同 perfMult 兜底）
    const base = Math.round(clauseBaseOf(d, avg, 3) * mid);         // 新合同 3 年 ⇒ yearsMult(3)=1.0
    const nw = renewalQ ? renewalQ.nw : 0;
    return {
      eligible: true, base, why: "",
      high: { wage: nw, fee: base },                                         // 按报价签：天价解约金（形同虚设的诚意）
      low:  { wage: Math.round(nw * cfg.WAGE_MULT_LOW), fee: Math.round(base * cfg.CLAUSE_MULT_LOW) }, // 让渡一成薪换真跳板条款
    };
  }
  function loanAuction(state) { return loanEligible(state) && window.PlayerSystem &&
    PlayerSystem.overall(d_player(state)) >= 74 && d_player(state).age <= 24; }
  function d_player(state) { return state.data.player; }
  function genLoanOffers(state, n) {
    const d = state.data;
    const ovr = window.PlayerSystem ? PlayerSystem.overall(d.player) : 70;
    const curStr = (tw0(d) || { strength: 60 }).strength;
    const targets = [];
    for (const [lid, lg] of Object.entries(LD())) {
      for (const team of lg.teams) {
        if (team.id === d.clubId) continue;
        if (team.strength > curStr) continue;                      // 租借一般往低处/平级走
        if (team.strength < ovr - 8) continue;                     // 太弱练不到级
        if (team.strength > ovr + 6) continue;                     // 太强又踢不上
        targets.push({ team, league: lid });
      }
    }
    const out = [];
    const cnt = Math.min(n, targets.length);
    for (let i = 0; i < cnt; i++) {
      const pick = targets.splice(R.int(0, targets.length - 1), 1)[0];
      out.push({
        clubId: pick.team.id, clubName: pick.team.name, leagueId: pick.league,
        leagueName: LD()[pick.league].name,
        playingTime: playingTimeOf(pick.team.id, ovr, d.player.pos),
        loan: true,
      });
    }
    return out;
  }
  function applyLoan(state, o) {
    const d = state.data;
    ensure(d);
    const club = (tw0(d) || { name: "俱乐部" }).name;
    /* ★ P301（玩家反馈「租借没有期限，母队合同到期才回去」实锤修复）：
       休赛期租借 = 外租 1 季。此前 applyLoan 复用永久转会的 nextClub 通道，开季路由
       （career.js advanceDay）把 nextClub 优先当永久转会处理并无条件清 d.loan ⇒
       归队分支永不触发、外租门（d.loan||d.nextClub）重新放开可连环租借（门德→蓝白→红星穿帮）。
       修复：d.loan 落租期凭证（clubId/leagueId/endSeason），career.js 开季按 endSeason
       保留 d.loan 至期满才走 backLoan 归队。租借俱乐部 id 一并入凭证（租借年显示/探针用）。 */
    d.loan = { fromClubId: d.clubId, fromLeagueId: d.leagueId, fromClubName: club, clubName: o.clubName,
      clubId: o.clubId, leagueId: o.leagueId, endSeason: d.season + 1 };
    d.nextClub = { clubId: o.clubId, leagueId: o.leagueId };
    d.seasonEndOffers = [];
    const t = d.transfer;
    t.frozen = null; t.listed = false; t.retention = 0; t.benchStreak = 0;
    t.clauseTriggered = null; t.requested = false; t.reqRefused = false;
    State.save();
    return club;
  }

  window.Transfer = {
    ensure, styleOf, styleLabel, STYLE_CFG,
    /* ★ P97：把演化机制暴露出来 —— 它此前只能通过 `enrichOffers` 间接驱动，
       既不可测（探针无法只测这一步），也让"机制是否活着"无从验证。
       `EVOLVE_CFG` 一并导出，便于外部读取当前门槛（探针对拍用）。 */
    EVOLVE_CFG, evolveCheck, rebuildStyleIndex, ambitionOf,
    feeValueOf: (d, avgRating) => feeBaseOf(window.PlayerSystem ? PlayerSystem.overall(d.player) : 70) * ageMult(d.player.age) * yearsMult(d.contract ? d.contract.years : 3) * perfMult(avgRating),
    enrichOffers, onStayWithOffers, startFrozen, isFrozen, weeklyTick, blockPlaying, registerMatch,
    winterTriggers, genWinterOffers, genMidSeasonOffers, windowOpen, applyMidSeason, applyOffer, checkPending,
    resetWindow, evaluateRequest, importanceOf, lockerSupport, evaluatePressure,
    loanEligible, loanAuction, genLoanOffers, applyLoan,
    SQUAD_ROLE_CUT, squadRoleOf, loanRequestGate, promiseSettle, POS_GROUP,
    listingGate, renewalClauseQuote, clauseBaseOf,   // P104-B4：赛季中挂牌门 + 续约条款报价单
    cardHtml, head,
  };
})();
