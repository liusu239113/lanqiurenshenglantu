/* ============================================================================
   v2/settlement.js — 结算与点球（自旧壳 ui.js MatchUI 无损移植；逻辑逐行保留）
   操作对象 M = MatchUI（需提供 engine/_applied/appendFeed/updateHUD/_scrollBottom）。
   与旧壳差异：仅 DOM 归属换 v2；数据与随机流 100% 同构（对拍链不受影响）。
   ============================================================================ */
(function () {
  'use strict';
  const S = {};

  /* ── S3 国家队名次卡（2026-09-18 对照篮球版）：定局时把 KO 出局轮次归一五档
     （champion / runner-up / semifinal / quarterfinal / group_out），
     战绩取本届 results（小组+KO 全场次）。手动物理场次才有结算卡 → 只有玩家
     亲历的收官战出现分享按钮；silent 自动完赛定局不打扰。 ── */
  function intlRankOf(stageLabel) {
    const s = String(stageLabel || "");
    if (s.indexOf("决赛") >= 0) return "runner-up";
    if (s.indexOf("半决赛") >= 0) return "semifinal";
    return "quarterfinal";          // 十六强/八强/32强 同灰档，卡片保留原文案
  }
  /* ★ P153b：国家队周期定局落账（赛季报告「国家队」条目的唯一数据源）。
     旧 season_report 读 d.intl.lastTour —— 全仓无写入点 = 死通道（条目从未显示过）。
     此处与各定局分支同点落账（带赛季号，报告按本季匹配展示）。 */
  function markIntlTour(state, type, result, stageLabel) {
    try {
      state.data.intl.lastTour = { type: type, comp: type === "worldcup" ? "世界杯" : "亚洲杯",
        result: result, stageLabel: stageLabel || "", season: state.data.season, accepted: true };
    } catch (e) { /* 落账失败不影响结算 */ }
  }
  function intlTourStats(state, which) {
    try {
      const node = which === "worldcup" ? state.data.intl.worldCup : state.data.intl.asiaCup;
      const rs = (node && node.results) || [];
      return { wins: rs.filter(r => (r.myGoals | 0) > (r.oppGoals | 0)).length, games: rs.length };
    } catch (e) { return { wins: 0, games: 0 }; }
  }


  /* ══ P140 国家队败局广告重赛「回魂」（2026-09-19 用户拍板，参照篮球线「一场梦」）═══
     国家队比赛输了之后，每场可看广告重赛 3 次，每次重赛国家队战力 +12%（仅本场生效）。
     · 挂点：S.applyResult 入口（full 直播 + silent 静默两路都拦）——此时账目未入、
       结果未落，重赛 = 同 fixture 整场重打（新引擎），旧结果整体作废，**零账目污染**
       （d.stats / d.intl.career / fame / 疲劳 / 伤病全部只在最终接受的那次结算里入账）。
     · 触发：国家队正式赛事（世预赛/亚洲杯/世界杯/附加赛）+ 我方败
       （常规时间负，或淘汰赛点球负；纯平局不弹）。
       ★ P140b 拍板 ②：友谊赛不弹（只留正式比赛——语义与「正式比赛才有重赛价值」对齐）。
     · 静默跳过的比赛（玩家勾「跳过本场」/自动模拟）：★ P140b 拍板 ③「没亲自打也要回魂」——
       同样拦截，但 confirm 是异步 Promise，不能在 gameloop 批量同步循环里弹：
       静默门只打 _retryPending 标记返回 {retryPending:true}，gameloop 在标记处 break
       （同 match-live「停下交还展示层」语法）并调用 S.silentRetryFlow 接管弹卡与重赛。
     · 次数：per-match 内存态（full=M._retryCount 由 v2/match.js 按 fixture 键重置；
       silent=silentRetryFlow 闭包内 count，随弹卡链存活）——未接受结果前玩家中途退出
       = 本场未结算，重进可重打（自洽，无需持久化）。
     · boost 只影响本场 XG 走势（match.js buildTimeline 的实力差），±8 钳制内有效；
       出场判定 / 点球对手强度 / 阵容生成均不加成。每次重赛固定 +12%（不叠乘，与 full 一致）。 */
  const INTL_RETRY = { LIMIT: 3, BOOST: 1.12 };

  /** 国家队赛事判定（applyResult 的 isIntlFx 与重赛门共用单源——修一处=修一类）
   *  ★ P295：补东亚杯/奥运会（P295 新增国家队赛事——漏了会被当俱乐部比赛写进
   *    seasonStats/careerLog，跨年联赛的 7 月窗口还会把上季 load 污染掉） */
  function isIntlComp(comp) {
    comp = String(comp || "");
    return comp.indexOf("亚洲杯") >= 0 || comp.indexOf("世预赛") >= 0 || comp.indexOf("世界杯") >= 0
      || comp.indexOf("友谊赛") >= 0 || comp.indexOf("附加赛") >= 0
      || comp.indexOf("东亚杯") >= 0 || comp.indexOf("奥运会") >= 0;
  }

  /** ★ P140b 重赛资格 = 国家队「正式比赛」（友谊赛出局——2026-09-19 拍板 ②） */
  function isOfficialComp(comp) {
    return isIntlComp(comp) && String(comp || "").indexOf("友谊赛") < 0;
  }

  /** 本场是否「国家队败局」：常规时间负，或淘汰赛点球负（平局点球败也算输——被淘汰了） */
  function intlLost(M) {
    const e = M.engine;
    if (!e || !e.fx || !isIntlComp(e.fx.comp)) return false;
    const r = e.result;
    if (!r) return false;
    const my = e.userHome ? r.home : r.away;
    const op = e.userHome ? r.away : r.home;
    if (my > op) return false;
    if (my < op) return true;
    return !!(r.pens && r.pens.my < r.pens.opp);
  }

  /** 抉择卡弹层（full 直播门与静默回魂流程共用单源——修一处=修一类）。
      onAdComplete=广告完播；onFail=广告失败/中断（重弹卡由调用方决定形态，次数未消耗）；
      onAccept=玩家选「接受结果」。 */
  function intlRetryDialog(M, left, onAdComplete, onFail, onAccept) {
    const e = M.engine;
    const my = e.userHome ? e.result.home : e.result.away;
    const op = e.userHome ? e.result.away : e.result.home;
    const pct = Math.round((INTL_RETRY.BOOST - 1) * 100);
    UIkit.confirm({
      title: "不甘心？再来一次",
      body: "终场 " + my + " : " + op + "——这场失利像一根刺。\n\n看一段广告，全队「回魂」重打本场：\n· 国家队战力 +" + pct + "%（仅本场生效）\n· 本场原结果作废，重新开赛\n· 本场还剩 " + left + " 次重赛机会",
      okText: "看广告：全队回魂 +" + pct + "% 重打本场",
      cancelText: "接受结果，继续前进",
    }).then(function (yes) {
      if (yes) {
        try { if (window.Track) Track.click("BMC005", "T1", "ad_entry", { placement: "intl_retry" }); } catch (err) { /* 埋点失败不阻断 */ }
        Ads.show("intl_retry", onAdComplete, onFail);   // onFail：重弹（Ads 内部已 toast 原因）
      } else onAccept();
    });
  }

  /** 重赛门：返回 true = 已拦截（本帧不结算，等玩家抉择）；false = 放行结算。
      mode="full"（直播）：就地弹卡——看广告 → _retryCount++ / _retryBoost 注入 →
      MatchUI.start(M.fx) 重开直播；接受结果 → _retryOk=true 重入 applyResult。
      mode="silent"（静默跳过）：★ P140b 拍板 ③「没亲自打也要回魂」——只打 _retryPending
      标记并返回 true（绝不在此弹卡：gameloop 批量同步循环等不了异步 confirm），
      由 gameloop break 后调 S.silentRetryFlow 接管。
      广告失败/中断（onFail）→ 重新弹卡（次数未消耗），绝不把玩家僵在终场屏。 */
  S.intlRetryGate = function (M, mode) {
    if (M._retryOk) return false;
    const e = M.engine;
    if (!e || !e.fx || !isOfficialComp(e.fx.comp)) return false;   // ★ P140b：友谊赛不回魂
    if (!intlLost(M)) return false;
    if ((M._retryCount || 0) >= INTL_RETRY.LIMIT) return false;
    if (mode === "silent") { M._retryPending = true; return true; }
    intlRetryDialog(M, INTL_RETRY.LIMIT - (M._retryCount || 0), function () {
      M._retryCount = (M._retryCount || 0) + 1;
      M._retryBoost = INTL_RETRY.BOOST;
      M._retryOk = false;
      MatchUI.start(M.fx);        // 同 fixture 重开直播：赛前卡有 fxKey 缓存不会重弹
    }, function () {
      S.intlRetryGate(M, "full");  // 广告失败/中断：重弹抉择卡
    }, function () {
      M._retryOk = true;
      S.applyResult(M, "full");      // 接受结果 → 重入结算主体
    });
    return true;
  };

  /** ★ P140b 静默回魂流程（2026-09-19 拍板 ③）：跳过的国家队正式比赛败局由此接管。
      gameloop 批量循环在 retryPending 标记处 break 后调用本流程（此时已不在同步循环内，
      弹异步 confirm 安全）。每次尝试 = 全新静默模拟（count>0 时带 BOOST 倍率，不叠乘）；
      败局且还有次数 → 弹卡：看广告 → count+1 重跑；接受结果 → 按已跑出的结果直接结算
      （不重跑引擎，M._retryOk 放行）。次数用尽/赢了/平局/友谊赛 → 照常结算返回战报行。
      onDone(row)：row 为最终结算的战报行（可能为 null 的场景与静默结算一致），由展示层收尾。 */
  S.silentRetryFlow = function (fixture, onDone) {
    const attempt = function (count) {
      const M = MatchUI;                       // 与 MatchUI.simMatch 包装层同一 M（字段/方法口径一致）
      M._applied = false;
      M._retryOk = false;
      M._retryPending = false;
      M._retryCount = count;
      const res = Settlement.simMatch(M, fixture, { silent: true, userBoostMult: count > 0 ? INTL_RETRY.BOOST : 1 });
      if (res && res.retryPending) {
        const repop = function () {
          intlRetryDialog(M, INTL_RETRY.LIMIT - count,
            function () { attempt(count + 1); },   // 广告完播 → 重跑静默模拟（带加成）
            repop,                                  // 广告失败/中断 → 重弹（次数未消耗）
            function () {                           // 接受结果 → 直接结算已跑出的结果
              M._retryOk = true;
              if (onDone) onDone(S.applyResult(M, "silent"));
            });
        };
        repop();
      } else {
        if (onDone) onDone(res);                    // 赢/平/次数用尽 → 正常结算的战报行
      }
    };
    attempt(0);
  };
  S.isOfficialComp = isOfficialComp;   // 探针/外部判定用（P140b 单源导出）


  /* ── 点球大战（淘汰赛平局）：★★ P116 重构（用户拍板三连）──
     ①「跳到终场」= 引擎代打一切 ⇒ 点球大战也自动结算，绝不弹交互；
     ② 未登场的球员不是主罚者 ⇒ 替补席上选射门方向 = 穿帮，直接自动；
     ③ 主罚用**六格 L3 点球小游戏**（DuelUI.showPenalty + Duel.penaltyResolve：
        命中率高于运动战 + 考察罚点球属性），旧「射门方向：左/中/右」三选一删除；
     ④ 登场且未跳过：你只在**随机一轮**主罚（球员是一个人，不是全队）——
        队友轮次自动模拟。 */
  S.startPenalties = function (M) {
    const e = M.engine;
    const d = State.data;
    const cap = d.intl && d.intl.captain ? 0.05 : 0;
    const pressure = e.pressure || 0.3;
    M.pens = { round: 1, my: 0, opp: 0, myShots: [], oppShots: [], done: false };
    const played = !!(e.userPerf && e.userPerf.played);
    M.pensState = {
      cap, pressure,
      oppSkill: 0.62 + Math.min(0.15, (e.opponentTeam().strength - 60) * 0.004),
      auto: !!M._skipped || !played,          // ①②：跳过 / 未登场 ⇒ 全自动
      myKickRound: played ? R.int(1, 5) : 0,  // ④：你的主罚轮（0 = 不主罚）
    };
    if (M.pensState.auto) {
      M.appendFeed({ minute: e.minute, type: "keymoment", text: !played
        ? "点球大战！5 轮互射决胜负——你在替补席上看完了整场，命运交给场上的队友。"
        : "点球大战！5 轮互射决胜负——快进模式，每一罚由引擎代打。" });
    } else {
      M.appendFeed({ minute: e.minute, type: "keymoment", text: "点球大战！5 轮互射决胜负——你第 " + M.pensState.myKickRound + " 轮出场主罚。" });
    }
    S.renderPenRound(M);
  };

  /** 一轮自动互射（我方主罚 + 对方主罚）：跳过/未登场/队友轮共用 */
  S.autoRound = function (M) {
    const ps = M.pens, st = M.pensState;
    if (ps.done) return;
    const e = M.engine;
    const pMe = Math.min(0.92, 0.75 + (st.cap || 0) + (window.Skills ? Skills.bonus(State.data, "penaltyKick", 0.12) : 0));
    if (R.chance(pMe)) { ps.my++; ps.myShots.push(1); M.appendFeed({ minute: e.minute, type: "good", text: "我方主罚——稳稳命中。（" + ps.my + " : " + ps.opp + "）" }); }
    else { ps.myShots.push(0); M.appendFeed({ minute: e.minute, type: "bad", text: "我方主罚——被对方门将扑出！（" + ps.my + " : " + ps.opp + "）" }); }
    if (R.chance(st.oppSkill)) { ps.opp++; ps.oppShots.push(1); M.appendFeed({ minute: e.minute, type: "info", text: "对方球员主罚——命中。（" + ps.my + " : " + ps.opp + "）" }); }
    else { ps.oppShots.push(0); M.appendFeed({ minute: e.minute, type: "good", text: "我方门将飞身扑出！全队沸腾！（" + ps.my + " : " + ps.opp + "）" }); }
    M.scrollBottom();
    M.updateHUD();
    ps.round++;
    setTimeout(UIkit.guard(() => S.renderPenRound(M), "点球轮"), 700);
  };

  /** 你的主罚轮：六格点球小游戏（Duel.shotPrepare {penalty:true} + DuelUI.showPenalty） */
  S.penMyKick = function (M) {
    const ps = M.pens, st = M.pensState;
    if (ps.done) return;
    const e = M.engine;
    const finishRound = function (r) {
      if (r.goal) { ps.my++; ps.myShots.push(1); M.appendFeed({ minute: e.minute, type: "good", text: "你主罚的点球——稳稳命中！（" + ps.my + " : " + ps.opp + "）" }); }
      else if (r.off) { ps.myShots.push(0); M.appendFeed({ minute: e.minute, type: "bad", text: "你的点球打飞了！看台一片叹息。（" + ps.my + " : " + ps.opp + "）" }); }
      else { ps.myShots.push(0); M.appendFeed({ minute: e.minute, type: "bad", text: "你的点球被对方门将神勇扑出！（" + ps.my + " : " + ps.opp + "）" }); }
      if (R.chance(st.oppSkill)) { ps.opp++; ps.oppShots.push(1); M.appendFeed({ minute: e.minute, type: "info", text: "对方球员主罚——命中。（" + ps.my + " : " + ps.opp + "）" }); }
      else { ps.oppShots.push(0); M.appendFeed({ minute: e.minute, type: "good", text: "我方门将飞身扑出！（" + ps.my + " : " + ps.opp + "）" }); }
      M.scrollBottom();
      M.updateHUD();
      ps.round++;
      setTimeout(UIkit.guard(() => S.renderPenRound(M), "点球轮"), 600);
    };
    if (window.Duel && window.DuelUI && Duel.shotPrepare) {
      const stPen = Duel.shotPrepare(State.data, e.opponentTeam(), { penalty: true });
      DuelUI.showPenalty(stPen, finishRound);
    } else {
      // 兜底：六格 UI 不可用 → 按概率自动（绝不卡死点球大战）
      UIkit.toast("对弈界面未加载，本罚已按自动处理");
      finishRound({ goal: R.chance(Math.min(0.92, 0.75 + (st.cap || 0))), off: false, saved: false });
    }
  };

  S.renderPenRound = function (M) {
    const ps = M.pens, st = M.pensState;
    if (ps.done) return;
    const ctrl = UIkit.$("#m-controls");
    const decide = (a, b, ra, rb) => a > b + rb || b > a + ra;
    const finished = ps.round > 5 ||
      (ps.myShots.length >= 5 && ps.oppShots.length >= 5) ||
      decide(ps.my, ps.opp, 5 - ps.myShots.length, 5 - ps.oppShots.length) ||
      decide(ps.opp, ps.my, 5 - ps.oppShots.length, 5 - ps.myShots.length);
    if (finished) {
      if (ctrl) ctrl.innerHTML = ""; // 防止结算延迟窗口内再点射门导致重复结算
      const won = ps.my > ps.opp || (ps.my === ps.opp && R.chance(0.5));
      ps.done = true; ps.won = won;
      /* ★ P136：直播路径的玩家主罚真值——myShots[myKickRound-1]（未轮到/跳过轮次不足 → notaken） */
      const userPen = !st.myKickRound ? null
        : (ps.myShots.length >= st.myKickRound ? (ps.myShots[st.myKickRound - 1] ? "scored" : "missed") : "notaken");
      M.engine.result.pens = { my: ps.my, opp: ps.opp, won, userPen };
      M.appendFeed({ minute: M.engine.minute, type: won ? "good" : "bad", text: (won ? "点球大战 " + ps.my + " : " + ps.opp + "——我们赢了！！" : "点球大战 " + ps.my + " : " + ps.opp + "——憾负。") });
      const PF = window.HUPU_FLAVOR;
      if (PF && PF.jrPkWin) {
        const pkPool = won ? PF.jrPkWin : PF.jrPkLose;
        /* P139：JR 评述不再上屏实时比赛界面 —— R.pick 消耗保留（RNG 序稳定），只删上屏 */
        if (pkPool && pkPool.length) R.pick(pkPool);
      }
      M.scrollBottom();
      setTimeout(UIkit.guard(() => S.applyResult(M), "点球结算"), 900);
      return;
    }
    if (st.auto) { S.autoRound(M); return; }
    if (ps.round === st.myKickRound) {
      /* 你的主罚轮：站上点球点 → 六格小游戏 */
      ctrl.innerHTML = '<div style="font-size:13px;color:var(--gold);margin-bottom:6px">' + ICO("ball") + ' 点球大战 第 ' + ps.round + " 轮 —— 比分 " + ps.my + " : " + ps.opp + "</div>" +
        '<div class="dim12" style="margin-bottom:8px">这一轮由你主罚。放球、退后、深呼吸。</div>';
      const b = document.createElement("button");
      b.className = "btn btn-gold";
      b.textContent = "站上点球点 ▸";
      b.onclick = UIkit.guard(() => S.penMyKick(M), "点球主罚");
      ctrl.appendChild(b);
      return;
    }
    /* 队友轮：自动互射（球员是一个人，不是全队——不再替队友选角度） */
    S.autoRound(M);
  };

  /** 纯概率点球互射（快速模拟/静默路径：无 UI feed，直接掷完整场） */
  S.simPens = function (e) {
    const d = State.data;
    const cap = (d.intl && d.intl.captain) ? 0.05 : 0;
    const oppSkill = 0.62 + Math.min(0.15, (e.opponentTeam().strength - 60) * 0.004);
    const pMe = Math.min(0.92, 0.75 + cap + (window.Skills ? Skills.bonus(d, "penaltyKick", 0.12) : 0));
    /* ★ P136：静默路径补玩家主罚真值——与直播路径同口径（played → myKickRound=R.int(1,5)，
       myShots 逐轮记录）。result.pens.userPen ∈ scored/missed/notaken/null。 */
    const playedSilent = !!(e.userPerf && e.userPerf.played);
    const myRound = playedSilent ? R.int(1, 5) : 0;
    const myShots = [];
    let my = 0, opp = 0;
    for (let i = 1; i <= 5; i++) {
      const scored = R.chance(pMe);
      if (scored) my++;
      myShots.push(scored ? 1 : 0);
      if (R.chance(oppSkill)) opp++;
      const rem = 5 - i;
      if (my > opp + rem || opp > my + rem) break;
    }
    let sd = 0;
    while (my === opp && sd++ < 10) { if (R.chance(pMe)) my++; if (R.chance(oppSkill)) opp++; }
    if (my === opp) my++;
    const userPen = !myRound ? null : (myShots.length >= myRound ? (myShots[myRound - 1] ? "scored" : "missed") : "notaken");
    return { my, opp, won: my > opp, userPen };
  };

  /* ── 事件卡上下文组装（P56 抽出：直播与静默两条路径共用，避免两套实现漂移） ── */
  S.ecCtxOf = function (e, r, res, compLabel, oppName, isIntlFx) {
    const d = State.data;
    const ctx = {
      res, margin: Math.abs(r.home - r.away), userGoals: r.userGoals || 0, userAssists: r.userAssists || 0,
      rating: r.played ? r.rating : 0, motm: !!r.motm,
      isCup: e.fx.type === "cup", isIntl: !!isIntlFx,
      round: (window.EventCards && EventCards.roundOf) ? EventCards.roundOf(e.fx, d) : (e.fx.round || d.dayIndex || 0),
      score: (function () { const _m = e.fx.match || {}; const _h = (_m.home && _m.home.name) || "主队"; const _a = (_m.away && _m.away.name) || "客队"; return _h + " " + r.home + " : " + r.away + " " + _a; })(),   // ★ P214：事件卡比分快照带主客名（ecCtxOf 独立作用域，自行取名）
      oppName, comp: compLabel,
      teamName: (window.teamById && teamById(d.clubId) || { name: "" }).name,
      injured: (r.injured || 0) > 0,
      /* 2026-09-16（用户反馈：首球/首发类文案说谎）：「生涯第一次首发」类卡的真值门
         需要"本场是否首发"。真值源 = MatchEngine.userStarter（match.js 赛前判定），
         直播与静默两条路径都经此处组装 ⇒ 单一接线点，不另起第二套判定。 */
      userStarter: !!e.userStarter,
      /* ★ P116：「没有的比赛就不要凭空捏造」——赛后卡的 played 真值门真值源
         （eventcards.pass 的 when.played / assistsMin 消费本字段）。 */
      played: !!r.played,
      /* ★ P136：点球主罚真值（ pensWon 只保球队胜负，不够「你罚进/你罚丢」类断言）。
         userPen ∈ 'scored'|'missed'|'notaken'|null(null=未登场/无点球)——两条路径同口径。 */
      userPen: (r.pens && r.pens.userPen) || null,
      /* ★ P136（事件审计 A/B 组）：复出族真值注入。此前 d.flags.justReturned /
         d.flags.lastInjDays（career.js:503 / injuries.js:33 落账）从未进 ctx ——
         when.justReturned 恒 false ⇒ data_injury/data_final 整个复出康复族
         （inj_back_* / rehab3_* / return3_*）为**静默死卡**；when.heavyReturn 的
         ctx.lastInjDays>=30 同因恒 false；{lastInjDays} 占位符渲染字面量。
         ★ justReturned 采取**消费即清**：复出后第一场结算时注入 true 并清除旗标，
         之后场次恢复 false——「复出首战」语义由单点保证。 */
      justReturned: !!(d.flags && d.flags.justReturned),
      lastInjDays: (d.flags && d.flags.lastInjDays) || 0,
      /* ★ P136：零封真值（本方失球=0，仅计算常规时间——点球大战不计）。 */
      cleanSheet: (e.userHome ? r.away : r.home) === 0,
    };
    try { ctx.isDerby = e.fx.type === "league" && SeasonSystem.matchImportance(State, e.fx).reason === "德比战"; } catch (err) { /* ignore */ }
    try {
      const tl = e.timeline || [];
      const htGoals = tl.filter(g => g.type === "goal" && g.minute <= 45);
      const htU = htGoals.filter(g => g.user).length, htO = htGoals.length - htU;
      const userDownHT = e.userHome ? (htO - htU) : (htU - htO);
      const isCupFx = e.fx.type === "cup", cupStageFx = (e.fx.stage != null) ? e.fx.stage : null;
      ctx.eng = {
        htDown3: userDownHT >= 3,
        lastMinGoal: tl.some(g => g.type === "goal" && g.minute >= 85),
        sentOff: e.userSentOff === true,
        pensWon: r.pens ? (r.pens.won ? "win" : "lose") : null,
      };
      ctx.cupStage = isCupFx ? cupStageFx : null;
      ctx.cupFinal = isCupFx && cupStageFx === 3;
      const isCcKo = e.fx.type === "cc_ko", isScc = e.fx.type === "scc";
      ctx.ccStage = isCcKo ? e.fx.stage : null;
      ctx.ccFinal = isCcKo && e.fx.stage === 3;
      ctx.sccStage = isScc ? e.fx.stage : null;
      ctx.sccFinal = isScc && e.fx.stage === 3;
      ctx.ccLeague = e.fx.type === "cc" ? (e.fx.round || 0) : null;
      Object.assign(ctx, EventCards.intlFlagsOf(e.fx.comp, e.fx.stage, e.fx.cupKO));
    } catch (err) { /* ignore */ }
    /* ★ P136：复出旗标**消费即清**（单点接线）：true 只在复出后第一场结算注入 ctx，
       本场结算完成后即清除——之后场次恢复 false，「复出首战」语义由此保证。 */
    if (ctx.justReturned && d.flags) { d.flags.justReturned = false; try { State.save(); } catch (err2) { /* ignore */ } }
    return ctx;
  };

  /* ── 快速模拟（普通场）：跑完整场引擎 → 关键时刻自动决策 → 平局自动点球 → 统一结算 ── */
  S.simMatch = function (M, fixture, opts) {
    const d = State.data;
    if (d.injuryDays > 0) return null;
    /* ★ P140/P140b：重赛回魂时由重赛门/静默流程注入 userBoostMult（缺省 1 = 无加成） */
    const e = new MatchEngine(State, fixture, { userBoostMult: (opts && opts.userBoostMult) || 1 });
    /* ★ P106-B：快速模拟 = **非交互**（默认档已改为 "all"，不显式关就会在这里
       暂停等一个永远不会来的玩家输入；虽然不会死循环（duel 已标记 resolved，
       结果等同 baseline），但语义必须明确：本函数跑的是 baseline）。 */
    e.interactive = false;
    let guard = 0;
    while (e.phase !== "done" && guard++ < 500) {
      const step = e.step();
      if (step && step.keyMoment) e.resolveKey(R.int(0, step.keyMoment.choices.length - 1));
    }
    if (e.phase !== "done") e.finish();
    if (e.result.home === e.result.away && (e.fx.cupKO || e.isCup)) {
      /* ★ P116： dice 逻辑抽出为 S.simPens（与 autoRound 同参——修一处=修一类） */
      e.result.pens = S.simPens(e);
    }
    M.engine = e;
    M._applied = false;
    return S.applyResult(M, opts && opts.silent ? "silent" : "compact");
  };

  /* ── 结算主体（自旧壳 MatchUI.applyResult 逐行移植；M7 章回旗标保留） ── */
  S.applyResult = function (M, mode) {
    mode = mode || "full";
    /* ★ P140 国家队败局广告重赛门（full 直播 + silent 静默两路；P140b 拍板：只留正式比赛、
       静默跳过的比赛也要回魂）。顺序在 _applied 之前：弹卡等待期间本场尚未结算，
       重入时由 _retryOk 放行；静默路返回 {retryPending:true} 标记交 gameloop 接管。 */
    if ((mode === "full" || mode === "silent") && S.intlRetryGate && S.intlRetryGate(M, mode)) {
      return mode === "silent" ? { retryPending: true } : undefined;
    }
    if (M._applied) return mode === "silent" ? null : undefined;
    M._applied = true;
    const e = M.engine, d = State.data, r = e.result;
    const isIntlFx = e.fx.comp && isIntlComp(e.fx.comp);
    /* ★ P171 天赋「板凳奇兵」：替补出场的评分加成（原「好底子」疲劳天赋换轨）。
       落点在全部入账（stats/seasonStats/经验/显示）**之前** —— 三条链吃到同一份加成（单源）。 */
    /* ★ P171 天赋「板凳奇兵」：替补出场的评分加成（原「好底子」疲劳天赋换轨）。
       「热身大师」技能同点位加成（替补玩法双通道：天赋大额 / 技能小额）。
       落点在全部入账（stats/seasonStats/经验/显示）**之前** —— 三条链吃到同一份加成（单源）。 */
    if (r.played && !e.userStarter) {
      const warm = (window.Skills && Skills.bonus) ? Skills.bonus(d, "warmUp", 0.3) : 0;
      const bench = (window.TAL && TAL.benchBoost) ? (TAL.benchBoost(d) || 0) : 0;
      if (warm + bench > 0) r.rating = Math.round((r.rating + warm + bench) * 10) / 10;
    }
    /* ★ P171（疲劳退役安置）：「坚韧」技能新出口 = 伤愈复出首战评分 +（justReturned 旗标单源）。 */
    if (r.played && d.flags && d.flags.justReturned && window.Skills && Skills.bonus) {
      const ten = Skills.bonus(d, "tenacity", 0.4);
      if (ten > 0) r.rating = Math.round((r.rating + ten) * 10) / 10;
    }
    if (r.played) {
      /* ★★ P99 批 3（C8 / §7.4.1 ⑦）：**按字段分流**（R27：逐字段处理）。
         青训期：`d.stats.*`（**职业生涯**正式比赛账）**一个字段都不写** → 判据 J3「`d.stats`
         全量逐位不变」（`JSON.stringify` 逐位相等，构造上不可能漏字段）；
         `d.seasonStats.*`（**竞技负荷**）**照写** → 它是 `Growth.seasonEnd` 的
         participation/perf 输入，不写则青训期成长**恒为 0**（= 青训营差异整个消失，比"少算"更糟）。
         ★ 为什么必须拆开写：原实现是"一行两写"（`d.stats.apps++; if (!isIntlFx) d.seasonStats.apps++;`），
           而两个容器的分流条件**不同**（一个看相位、一个看 isIntlFx）→ 一行两写**表达不了**这件事。
         ★ `youthPhase` 只在本 `if (r.played)` 块内使用（下面 3 处 `d.stats` 写入共用它）。 */
      const youthPhase = !!(window.Youth && Youth.inAcademy(d));
      if (!youthPhase) {
        d.stats.apps++;
        d.stats.goals += r.userGoals;
        d.stats.assists += r.userAssists;
        d.stats.saves = (d.stats.saves || 0) + (r.userSaves || 0);   // ★ 门将扑救账（2026-09-16；|| 0 防旧存档无键）
        d.stats.ratingSum += r.rating;
        if (r.motm) d.stats.motm++;
      }
      if (!isIntlFx) {
        d.seasonStats.apps++;
        d.seasonStats.goals += r.userGoals;
        d.seasonStats.assists += r.userAssists;
        d.seasonStats.saves = (d.seasonStats.saves || 0) + (r.userSaves || 0);   // ★ 门将扑救（赛季负荷，平行入账）
        d.seasonStats.ratingSum += r.rating;
      }
      if (r.motm) d.seasonStats.motm++;   // ★ 逐字段搬运：原实现的 motm **不看 isIntlFx**（保持原语义）
      /* ★ 相位门（2026-09-16，复用上方 youthPhase）：青训期帽子戏法不落"职业章回"
         埋点 —— 不门控则升入一线队后会弹出职业期从未发生的"帽子戏法"章回
         （_ch* 埋点族同批排查，青训期可达的两处之一）。 */
      if (!youthPhase && r.userGoals >= 3) d._chHattrick = true;
      if (isIntlFx && e.fx.comp.indexOf("世界杯") >= 0 && r.userGoals >= 1) d._chWcGoal = true;
      if (!youthPhase && !isIntlFx && r.userGoals > 0) {   // ★ 相位门（2026-09-16）：青训期不落德比旗标
        const myHome2 = e.fx.match.home.id === d.clubId;
        const myG2 = myHome2 ? r.home : r.away, opG2 = myHome2 ? r.away : r.home;
        if (myG2 > opG2) {
          const imp2 = SeasonSystem.matchImportance(State, e.fx);
          if (imp2.key && imp2.reason === "德比战") d._chDerbyWin = true;
        }
      }
      if (isIntlFx) { d.intl = d.intl || {}; d.intl.career = d.intl.career || { apps: 0, goals: 0, assists: 0 }; d.intl.career.apps++; d.intl.career.goals += r.userGoals; d.intl.career.assists += r.userAssists; }
      /* ★ P99 批 3（J3 全量逐位）：`d.stats.wageEarned` 也属"职业生涯账" → 一并分流。
         学徒合同不走一线队出场费/进球奖金（`d.youth.contractYears` 与 `d.contract` 是两套东西，§7.4）。 */
      if (!youthPhase && !isIntlFx && d.contract && d.contract.wage > 0) {
        /* ★ P104-B1：助攻奖金入账（与出场/进球同款公式即时算）；bonusEarned = 奖金小计分键
           （wageEarned 语义保持「生涯总收入」继续累加，旧档零迁移）。 */
        const ab = Career.appearanceBonusOf(d.contract.wage), gb = Career.goalBonusOf(d.contract.wage) * (r.userGoals || 0);
        const asb = Career.assistBonusOf(d.contract.wage) * (r.userAssists || 0);
        if (ab + gb + asb > 0) {
          d.money += ab + gb + asb;
          d.stats.wageEarned = (d.stats.wageEarned || 0) + ab + gb + asb;
          d.stats.bonusEarned = (d.stats.bonusEarned || 0) + ab + gb + asb;
          try { if (window.Finance) Finance.log(d, "奖金", ab + gb + asb, "出场/进球/助攻奖金"); } catch (e) { /* 流水失败不阻断结算 */ }
        }
      }
      if (isIntlFx && r.played && window.INTL) {
        const comp = e.fx.comp.indexOf("世界杯") >= 0 ? "世界杯" : e.fx.comp.indexOf("亚洲杯") >= 0 ? "亚洲杯" : null;
        if (comp) {
          d.intl[comp === "世界杯" ? "wcStats" : "asiaCupStats"] = d.intl[comp === "世界杯" ? "wcStats" : "asiaCupStats"] || { goals: 0, ratingSum: 0, apps: 0 };
          const stt = d.intl[comp === "世界杯" ? "wcStats" : "asiaCupStats"];
          stt.apps++; stt.goals += r.userGoals; stt.ratingSum += r.rating;
        }
      }
      if (isIntlFx && window.INTL && INTL.checkCaptain(State) && !d.intl.captainAnnounced) {
        d.intl.captainAnnounced = true;
        r.captainNamed = true;
        try { News.onEvent(State, "captain", { player: d.player.name }); } catch (err) { /* ignore */ }
      }
      const concededGoals = e.userHome ? r.away : r.home;
      if (concededGoals === 0 && !youthPhase) {
        d.stats.cleanSheets = (d.stats.cleanSheets || 0) + 1;   // ★ P99 批 3：青训期不写 d.stats（J3 全量）
        /* P133 赛季级零封入账（GK 联赛最佳门将的判定数据；|| 0 防旧档无键） */
        d.seasonStats.cleanSheets = (d.seasonStats.cleanSheets || 0) + 1;
      }
      /* ★ P171：赛后疲劳累积（MATCH_FATIGUE_*）随疲劳机制退役删除。 */
      const win = e.userHome ? r.home > r.away : r.away > r.home;
      const draw = r.home === r.away;
      let exp = Math.round(CONFIG.MATCH_EXP_PER_LEVEL * (r.rating / 6.5) * (win ? 1 : draw ? 0.85 : CONFIG.LOSS_EXP_MULT));
      Training.applyMatchExp(State, exp);
      Career.addFame(State, r.userGoals * 80 + r.userAssists * 50 + (r.motm ? 120 : 20) + (win ? 40 : 0));
      const charsInjMult = (d.chars && d.chars.injury_risk != null) ? (0.5 + d.chars.injury_risk / 100) : 1;
      /* ★ P171：伤病概率的疲劳因子删除（INJURY_FATIGUE_*），保留基础值 + 年龄因子 + 各乘数。 */
      const injP = (CONFIG.INJURY_BASE_CHANCE + Math.max(0, d.player.age - CONFIG.INJURY_AGE_THRESHOLD) * CONFIG.INJURY_AGE_BONUS) * (window.TAL ? TAL.injuryMult(d) : 1) * (window.Skills ? Skills.mult(d, "durability", -0.3) : 1) * charsInjMult;
      const injRoll = R.chance(injP);   // 无条件消耗 R（P179：配额拦截不扰动随机流结构）
      /* ★ P179 赛季配额：每季伤病 ≤2 次（不管大小伤，Injuries 单源计数，与训练伤同池）。 */
      if (injRoll && (!window.Injuries || Injuries.quotaLeft(d) > 0)) {
        const injDiscount = (window.IDENTITY && IDENTITY.injuryDiscount) ? IDENTITY.injuryDiscount(d) : 0;
        const days = Math.max(1, Math.round(R.int(CONFIG.INJURY_DAYS_MIN, CONFIG.INJURY_DAYS_MAX) * (window.TAL ? TAL.healMult(d) : 1)) - injDiscount);
        d.injuryDays = Math.max(d.injuryDays, days);
        if (window.Injuries) { Injuries.apply(State, days); Injuries.markInjured(d); }
        r.injured = days;
      }
      if (r.played) {
        const keyMatch = !!(e.isCup || (e.pressure || 0) > 0);
        let hl = (r.userGoals >= 2 || r.userAssists >= 2 || r.rating >= 8.0 || (r.motm && keyMatch)) ? 1 : 0;
        hl += ((e.userPerf && e.userPerf.skillKeyWins) || []).length;
        if (hl) d._seasonHighlights = (d._seasonHighlights || 0) + hl;
      }
      r.exp = exp;
      const _sim = d.flags && d.flags._ecSim;
      if (_sim) {
        /* ★ P171：_ecSim 的 illness/rotation 疲劳惩罚随疲劳机制退役（旗标清理保留）。 */
        d.flags._ecSim = null;
      }
    }
    /* ★ P101 连续登场状态跟踪（2026-09-16）：事件卡 when.minConsec* 门的唯一真值源。
       每场模拟比赛结算后必经此处（含未登场的板凳场）；非首发（替补登场或未登场）
       计 bench，首发计 starts；连续场进球计 goals（进球断 streak 由 else 分支保证）。
       国家队窗口不更新（俱乐部语境口径）。纯记账不耗 R；旧存档无键 → || 0 防御。 */
    if (!isIntlFx) {
      if (e.userStarter) { d.consecStarts = (d.consecStarts || 0) + 1; d.consecBench = 0; }
      else { d.consecBench = (d.consecBench || 0) + 1; d.consecStarts = 0; }
      d.consecGoals = (r.played && r.userGoals > 0) ? (d.consecGoals || 0) + 1 : 0;
      /* 出场无进球连击：进球出场清零，无进球出场累加，板凳/缺阵场冻结（荒按出场记账）。 */
      d.consecNoGoal = r.played ? ((r.userGoals > 0) ? 0 : (d.consecNoGoal || 0) + 1) : (d.consecNoGoal || 0);
    }
    let intlNote = "";
    let intlFinal = null;   // S3：国家队赛事定局（名次+本届战绩），结算卡出「分享国家队征程」按钮
    let statueEvent = null;
    if (isIntlFx) {
      INTL.applyResult(State, e.fx, r);
      INTL.checkCaptain(State);
      const isWC = e.fx.comp.indexOf("世界杯") >= 0;
      if (isWC && e.fx.cupKO) {
        const ko = INTL.advanceWcKO(State, e.fx, r, r.pens);
        if (ko.champion) {
          intlNote = "我们夺冠了！中国队站上了世界之巅！！";
          INTL.settleWorldCup(State);
          markIntlTour(State, "worldcup", "champion", "冠军");
          statueEvent = "世界冠军！你的家乡决定为你树立一座雕像——从野球场到世界之巅，这条路你走了整整十五年。传奇指数 +3000。";
        } else if (ko.out) {
          const tour = intlTourStats(State, "worldcup");
          intlNote = "世界杯征程止步" + ko.stage + "。虽败犹荣——我们让世界记住了中国足球。"; INTL.settleWorldCup(State);
          intlFinal = { type: "worldcup", comp: "世界杯", result: intlRankOf(ko.stage), stageLabel: ko.stage, wins: tour.wins, games: tour.games };
          markIntlTour(State, "worldcup", intlFinal.result, ko.stage);
        }
        else intlNote = "晋级" + ko.next + "！下一个对手：" + ko.opp + "（压力等级：高）";
      } else if (isWC && e.fx.stage === "wc-group" && State.data.intl.worldCup && State.data.intl.worldCup.groupResult) {
        const g = State.data.intl.worldCup.groupResult;
        if (g.qualified) {
          intlNote = g.viaThird ? "小组第 " + g.rank + " 名，凭净胜球优势惊险晋级 32 强淘汰赛！" : "小组第 " + g.rank + " 出线，晋级 32 强淘汰赛！";
          const nk = State.data.intl.worldCup.nextKO;
          if (nk) intlNote += " 32 强对手：" + (nk.fixture.match.home.id === "nat_中国" ? nk.fixture.match.away.name : nk.fixture.match.home.name);
        } else {
          const tour = intlTourStats(State, "worldcup");
          intlNote = "小组赛第 " + g.rank + "，无缘 32 强。世界杯首秀止步小组赛，但我们会回来。";
          INTL.settleWorldCup(State);
          intlFinal = { type: "worldcup", comp: "世界杯", result: "group_out", stageLabel: "小组赛", wins: tour.wins, games: tour.games };
          markIntlTour(State, "worldcup", "group_out", "小组赛");
        }
      } else if (e.fx.cupKO && e.fx.comp.indexOf("亚洲杯") >= 0) {
        /* ★ P96 修复：原为 `else if (e.fx.cupKO)` —— 会把「世预赛跨洲附加赛」误判为亚洲杯 KO
           （世界杯系已由上面的 isWC 分支处理），当年无亚洲杯时 INTL.advanceKO 里
           d.intl.asiaCup 为 null 直接崩。收紧到「亚洲杯」后，它落到下面的世预赛分支 →
           INTL.settlePlayoff，走正确路径。 */
        const ko = INTL.advanceKO(State, e.fx, r, r.pens);
        if (ko.champion) { intlNote = "冠军！我们捧起了亚洲杯！"; INTL.settleAsiaCup(State); markIntlTour(State, "asiacup", "champion", "冠军"); }
        else if (ko.out) {
          const tour = intlTourStats(State, "asiacup");
          intlNote = "淘汰赛止步" + ko.stage + "。"; INTL.settleAsiaCup(State);
          intlFinal = { type: "asiacup", comp: "亚洲杯", result: intlRankOf(ko.stage), stageLabel: ko.stage, wins: tour.wins, games: tour.games };
          markIntlTour(State, "asiacup", intlFinal.result, ko.stage);
        }
        else intlNote = "晋级" + ko.next + "！下一个对手：" + ko.opp;
      } else if (e.fx.comp.indexOf("亚洲杯小组赛") >= 0) {
        const all = State.data.intl.asiaCup.fixtures.every(f => f.played);
        if (all) {
          const g = INTL.onGroupComplete(State);
          if (g.qualified) intlNote = "小组赛第 " + g.myRank + " 出线！十六强对手：" + g.opp;
          else {
            const tour = intlTourStats(State, "asiacup");
            intlNote = "小组赛第 " + g.myRank + "，无缘十六强。"; INTL.settleAsiaCup(State);
            intlFinal = { type: "asiacup", comp: "亚洲杯", result: "group_out", stageLabel: "小组赛", wins: tour.wins, games: tour.games };
            markIntlTour(State, "asiacup", "group_out", "小组赛");
          }
        }
      } else if (e.fx.comp.indexOf("友谊赛") >= 0) {
        const c = d.intl.career;
        if (c.apps === 1) intlNote = "国家队首秀达成！" + (r.userGoals > 0 ? "首秀即破门——这个夜晚会被写进解说词里。" : "穿上国家队的球衣，这一刻等了太多年。");
        else if (r.userGoals > 0 && !d.intl.firstIntlGoal) { d.intl.firstIntlGoal = true; intlNote = "国家队处子球！看台上的球迷开始高唱你的名字。"; }
        else intlNote = "友谊赛 " + (e.userHome ? r.home + ":" + r.away : r.away + ":" + r.home) + "，教练组在场边记着笔记。";
      } else if (e.fx.comp.indexOf("世预赛") >= 0) {
        const wy = (State.data.intl.wcq && State.data.intl.wcq.worldCupYear) || 2030;
        const all = State.data.intl.wcq.fixtures.filter(f => f.stage === "r36").every(f => f.played);
        const r18All = State.data.intl.wcq.fixtures.filter(f => f.stage === "r18").length > 0 &&
          State.data.intl.wcq.fixtures.filter(f => f.stage === "r18").every(f => f.played);
        const poAll = State.data.intl.wcq.fixtures.filter(f => f.stage === "playoff").length > 0 &&
          State.data.intl.wcq.fixtures.filter(f => f.stage === "playoff").every(f => f.played);
        if (State.data.intl.wcq.stage === "r36" && all) {
          const s36 = INTL.settleWcq36(State);
          if (s36.qualified) { intlNote = "36 强赛以第 " + s36.rank + " 出线，晋级 18 强赛！" + wy + " 世界杯梦继续。"; Career.addFame(State, 3000); }
          else if (s36.playoff) intlNote = "36 强赛第 " + s36.rank + "，进入第四阶段附加赛——最后的机会。";
          else intlNote = "36 强赛第 " + s36.rank + "，冲击世界杯失败。";
        } else if (State.data.intl.wcq.stage === "r18" && r18All) {
          const s18 = INTL.settleR18(State);
          if (s18.qualified) { intlNote = "18 强赛第 " + s18.rank + "，中国队直通 " + wy + " 世界杯！全网沸腾！"; }
          else if (s18.playoff) intlNote = "18 强赛第 " + s18.rank + "，进入第四阶段附加赛——生死一线。";
          else intlNote = "18 强赛第 " + s18.rank + "，世界杯梦碎。下一个四年，再来。";
        } else if (State.data.intl.wcq.stage === "playoff" && poAll) {
          const sp = INTL.settlePlayoff(State);
          if (sp.qualified) { intlNote = "附加赛总比分 " + sp.myGoals + ":" + sp.oppGoals + "，中国队打进 " + wy + " 世界杯！！"; }
          else intlNote = "附加赛总比分 " + sp.myGoals + ":" + sp.oppGoals + "，遗憾告负，无缘跨洲附加赛。";
        }
      }
    } else {
      SeasonSystem.applyResult(State, e.fx, r);
      if (e.fx.type === "league") SeasonSystem.simulateRound(State, e.fx);
    }
    Career.advanceDay(State);
    State.save();
    try {
      News.onMatch(State, e.fx, r, e.userPerf);
      if (intlNote) {
        const iv = { player: d.player.name, comp: e.fx.comp || "" };
        if (intlNote.indexOf("出线") >= 0) News.onEvent(State, e.fx.comp.indexOf("世预赛") >= 0 ? "wcq_qualify" : "intl_qualify", iv);
        else if (intlNote.indexOf("冠军") >= 0) News.onEvent(State, "intl_champion", iv);
        else if (intlNote.indexOf("无缘") >= 0 || intlNote.indexOf("止步") >= 0) News.onEvent(State, "intl_out", iv);
      }
    } catch (err) { console.warn("news hook", err); }
    const res = e.userHome ? (r.home > r.away ? "胜" : r.home === r.away ? "平" : "负") : (r.away > r.home ? "胜" : r.home === r.away ? "平" : "负");
    const compLabel = isIntlFx ? (e.fx.comp || "国家队比赛") : e.fx.type === "cup" ? "国内杯赛" : (e.fx.type === "cc" || e.fx.type === "cc_ko" || e.fx.type === "scc") ? (e.fx.comp || "洲际赛场") : "联赛第" + e.fx.round + "轮";
    const oppObj = e.opponentTeam();
    const oppName = oppObj ? oppObj.name : "对手";
    /* ★ P214（玩家反馈「跳过战报比分主客歧义」）：主客队名单源——足球计分法主前客后，
       战报行/结算卡统一输出「主队 主:客 客队」；row 带出 homeName/awayName 供汇总卡同源渲染。 */
    const _m = e.fx.match || {};
    const homeName = (_m.home && _m.home.name) || "主队";
    const awayName = (_m.away && _m.away.name) || "客队";
    /* ★ P261：战报分享 payload（结算卡真实数字单源；compact/full 两路共用；
       里程碑判定在 SharePoster.matchMilestoneOf——纯函数，此处探针式预判只为按钮文案染色） */
    const matchShare = {
      compLabel: compLabel, homeName: homeName, awayName: awayName,
      home: r.home, away: r.away, res: res, oppName: oppName,
      played: !!r.played, rating: r.played ? r.rating : null,
      goals: r.userGoals || 0, assists: r.userAssists || 0, motm: !!r.motm,
      pens: r.pens || null, saves: r.userSaves || 0,
      conceded: e.userHome ? (r.away || 0) : (r.home || 0),
      isGK: !!(d.player && d.player.position === "GK"), isIntl: !!isIntlFx,
      keyHook: e.keyHook || "",
      careerGoalsAfter: d.stats.goals || 0, careerAppsAfter: d.stats.apps || 0,
    };
    const shareMs = (r.played && window.SharePoster && SharePoster.matchMilestoneOf) ? SharePoster.matchMilestoneOf(matchShare) : null;
    if (mode === "silent") {
      /* P56：静默场次也回传事件卡上下文 —— 普通场自动完赛同样要能触发里程碑/回响/主线/普通池 */
      return { compLabel, oppName, home: r.home, away: r.away, res, rating: r.rating, goals: r.userGoals, assists: r.userAssists, motm: r.motm, injured: r.injured || 0, pens: r.pens || null, played: r.played,
        myHome: !!e.userHome, saves: r.userSaves || 0,   // ★ P170：汇总卡算「球队进失球 / 门将扑救」用
        homeName: homeName, awayName: awayName,          // ★ P214：主客队名（战报行「主 前 比分 客 后」）
        ecCtx: S.ecCtxOf(e, r, res, compLabel, oppName, isIntlFx) };
    }
    const wonMatch = e.userHome ? r.home > r.away : r.away > r.home;
    const wonCupFinal = !isIntlFx && e.fx.type === "cup" && e.fx.stage === 3 && (wonMatch || (r.pens && r.pens.won));
    const wonCcFinal = !isIntlFx && (e.fx.type === "cc_ko" || e.fx.type === "scc") && e.fx.stage === 3 && (wonMatch || (r.pens && r.pens.won));
    const titleWon = (intlNote && intlNote.indexOf("冠军") >= 0) || wonCupFinal || wonCcFinal;
    if (window.Snd) Snd.setBgm(titleWon ? "champion" : "resolve");
    if (mode === "compact") {
      if (window.Snd) Snd.event(res === "胜" ? "win" : res === "平" ? "whistle_full" : "lose");
      /* P53：自动完赛结果卡化为内嵌漫画卡 */
      const cpArt = res === "胜" ? "ec_goal" : (res === "平" ? "ec_stadium" : "ec_tear");
      let chtml = '<div class="ec-card card-spread">' +
        CardHost.headTags("战报 · 自动完赛") +
        '<div class="ec-art" style="' + CardHost.artStyle(cpArt) + '"></div>' +
        /* ★ P214：比分主前客后带双队名（足球计分法），消除「0:4 胜」式歧义 */
        '<div class="ec-title">' + (res === "胜" ? "胜利" : res === "平" ? "平局" : "落败") + "　" + homeName + " " + r.home + " : " + r.away + " " + awayName + "</div>" +
        '<div class="ec-body">' + compLabel + (r.pens ? "（点球 " + r.pens.my + ":" + r.pens.opp + (r.pens.won ? " 胜" : " 负") + "）" : "") + "<br>" +
        (r.played
          ? "你的评分 <b style='color:var(--gold)'>" + r.rating + "</b>" + (r.userGoals || r.userAssists ? "　" + r.userGoals + "球 " + r.userAssists + "助" : "") + (r.motm ? "　MVP" : "") + (r.injured ? "　<span style='color:var(--danger)'>伤停 " + r.injured + " 天</span>" : "")
          : "本场未获得出场机会") +
        (intlNote ? "<br><b style='color:var(--gold)'>" + intlNote + "</b>" : "") +
        /* ★ P105-B4 赛后媒体头条（球员侧比赛日体验）；★ P217：国际赛传 isIntl——{team}=中国队、头条池分流 */
        "<br><span style='color:var(--text-dim)'>媒体头条：</span>" + headlineOf(r, res, oppName, isIntlFx) + "</div>";
      /* 热点资讯热议已全部收进右上角热议按钮（帖子流），结算卡不再内嵌评论区 */
      /* ★ P261：每场战报分享按钮（里程碑场金色高亮 + 里程碑名；未出场无可分享表现则不出现）
         ★ P283c：热点资讯端且本季奖励未领满 → 按钮「（有奖）」+ 下方一句话引导（青训/成年通用；
         领完或非热点资讯端回归普通文案，渠道隔离同 P282 bridgeReady 口径） */
      if (r.played) {
        const _bonusOn = !!(window.SharePoster && SharePoster.canPostToBbs && SharePoster.shareBonusLeft && SharePoster.canPostToBbs() && SharePoster.shareBonusLeft() > 0);
        const _btnTxt = (shareMs ? "分享「" + shareMs.name + "」战报" : "分享战报") + " · 发热点资讯" + (_bonusOn ? "（有奖）" : "");
        chtml += '<button class="btn ' + (shareMs ? "btn-gold" : "btn-ghost") + ' btn-block mt-10" id="mr-share-match">' + _btnTxt + "</button>";
        if (_bonusOn) {
          const _SB = SharePoster.SHARE_BONUS;
          chtml += '<div style="font-size:12px;color:var(--gold);margin-top:6px;text-align:center">分享成功有奖励：本季剩 ' + SharePoster.shareBonusLeft() + ' 次，每次 ' + (_SB.money / 10000) + ' 万资金 +' + _SB.exp + ' 经验</div>';
        }
      }
      chtml += '<button class="btn btn-primary ec-opt" id="mr-ok">继续 ▸</button></div>';
      CardHost.show(chtml, { dismissable: false });
      UIkit.$("#mr-ok").onclick = UIkit.guard(() => {
        /* P133 埋点 BMC003：首场比赛完赛（一次性，d.tutorial.firstMatchDone 判重） */
        try {
          const _d = State.data;
          if (_d) {
            if (!_d.tutorial || typeof _d.tutorial !== "object") _d.tutorial = { done: false, step: 0, firstMatchDone: false };
            if (!_d.tutorial.firstMatchDone) {
              _d.tutorial.firstMatchDone = true;
              if (window.Track) Track.click("BMC003", "T1", "first_match_done");
            }
          }
        } catch (e) { /* 埋点失败不影响结算 */ }
        if (window.Snd) Snd.setBgm("career"); CardHost.close(); UIkit.show("hub"); Hub.refresh(null);
      }, "完赛返回");
      /* ★ P261：战报分享 → SharePoster "match" 模式（海报+文案里程碑差异化） */
      const _msBtn = UIkit.$("#mr-share-match");
      if (_msBtn) _msBtn.onclick = UIkit.guard(function () {
        try {
          if (window.SharePoster && SharePoster.share) SharePoster.share(State, { __matchCard: matchShare }, "match");
          else UIkit.toast("分享暂不可用", "red");
        } catch (err) { console.warn("share", err); UIkit.toast("分享功能异常：" + err.message, "red"); }
      }, "分享战报");
      return;
    }
    const starN = r.rating >= 9 ? 5 : r.rating >= 8 ? 4 : r.rating >= 7 ? 3 : r.rating >= 6 ? 2 : 1;
    let stars = ""; for (let i = 0; i < 5; i++) stars += i < starN ? "★" : "☆";
    let artKey = "";
    const prevGoals = d.stats.goals - r.userGoals;
    if (r.played && d.stats.apps === 1) artKey = "debut";
    else if (intlNote && (intlNote.indexOf("冠军") >= 0 || intlNote.indexOf("夺冠") >= 0 || intlNote.indexOf("捧杯") >= 0)) artKey = "championship";
    else if (r.played && r.userGoals >= 1 && res === "胜" && e.keyHook === "goal") artKey = "lastminute";
    else if (e.fx.cupKO) artKey = "knockout";
    else if (r.userGoals > 0 && Math.floor(prevGoals / 50) < Math.floor(d.stats.goals / 50)) artKey = "milestone";
    else if (r.motm) artKey = "awards";
    else if (isIntlFx) artKey = "international";
    const ART = { debut: "ec_tunnel.webp", championship: "ec_trophy.webp", lastminute: "ec_goal_line.webp", knockout: "ec_penalty.webp", milestone: "ec_tribute.webp", awards: "ec_captain.webp", international: "ec_flag.webp" };
    /* P53：完整结算卡化为内嵌漫画卡（原为弹窗，与「不留弹窗版事件」冲突） */
    const settleArt = (artKey && ART[artKey]) ? ART[artKey]
      : (res === "胜" ? "ec_goal" : res === "负" ? "ec_tear" : "ec_stadium");
    let html = '<div class="ec-card card-spread">' +
      CardHost.headTags("战报 · " + compLabel) +
      '<div class="ec-art" style="' + CardHost.artStyle(settleArt) + '"></div>' +
      '<div class="ec-title">' + (res === "胜" ? "比赛胜利" : res === "平" ? "战平对手" : "遗憾落败") + "</div>" +
      /* ★ P214：大比分行主前客后带双队名 */
      '<div class="ec-body"><span style="font-size:21px;font-weight:900;letter-spacing:1px">' + homeName + " " + r.home + " : " + r.away + " " + awayName + "</span>　<span style='color:var(--gold)'>" + stars + "</span><br>" +
      "你的评分 <b style='color:var(--gold)'>" + (r.played ? r.rating : "未出场") + "</b>" +
      (!isIntlFx && r.played && d.contract && d.contract.wage > 0 ?
        "<br>本场奖金：出场 " + Career.fmtMoney(Career.appearanceBonusOf(d.contract.wage)) + (r.userGoals ? " + 进球 " + Career.fmtMoney(Career.goalBonusOf(d.contract.wage) * r.userGoals) : "") + (r.userAssists ? " + 助攻 " + Career.fmtMoney(Career.assistBonusOf(d.contract.wage) * r.userAssists) : "") : "") +
      /* ★ P105-B4 赛后媒体头条（球员侧比赛日体验）；★ P217：国际赛传 isIntl */
      "<br><span style='color:var(--text-dim)'>媒体头条：</span>" + headlineOf(r, res, oppName, isIntlFx) + "</div>";
    if (intlNote) html += '<div class="panel hl"><div class="panel-title">国家队战报</div><p style="font-size:13px;line-height:1.9">' + intlNote + "</p></div>";
    if (r.captainNamed) html += '<div class="panel hl"><div class="panel-title">队长袖标</div><p style="font-size:13px;line-height:1.9">主教练正式任命你为国家队队长——从今天起，这面旗帜由你来扛。（关键时刻压力减半，点球成功率提升）</p></div>';
    if (statueEvent) html += "<div class='panel hl'><p style='font-size:13px;line-height:1.9'>" + statueEvent + "</p></div>";
    if (r.played) {
      /* 热点资讯热议已全部收进右上角热议按钮（帖子流），结算卡不再内嵌评论区 */
      html += '<div class="panel alt">' +
        /* ★ 门将口径（2026-09-16 用户拍板）：进球/助攻对门将无意义 → 扑救 + 本场零封。
           ★ 零封判定内联重算（concededGoals 在 `if (r.played)` 内层块，弹窗拿不到）。 */
        ((d.player && d.player.position === "GK")
          ? '<div class="row"><span>扑救' + ((e.userHome ? r.away : r.home) === 0 ? " · 零封" : "") + '</span><b>' + (r.userSaves || 0) + " 次</b></div>"
          : '<div class="row"><span>进球 / 助攻</span><b>' + r.userGoals + " / " + r.userAssists + "</b></div>") +
        "<div class='divider'></div>" +
        '<div class="row"><span>比赛经验</span><b style="color:var(--accent-dark)">+' + r.exp + "</b></div>" +
        (r.motm ? '<div class="divider"></div><div class="row"><span>本场最佳</span><b style="color:var(--gold)">MVP</b></div>' : "") +
        (r.injured ? '<div class="divider"></div><div class="row"><span>伤病</span><b style="color:var(--danger)">休战 ' + r.injured + " 天</b></div>" : "") +
        "</div>";
    } else {
      html += '<div style="text-align:center;font-size:12px;color:var(--text-dim)">本场未能获得出场机会，继续努力训练吧。</div>';
    }
    /* P93：捧杯场次补「夺冠速报」分享（旧壳 mr-share-champ 同款）
       S3（2026-09-18）：国家队非冠军名次（亚军/四强/八强·十六强/小组出局）
       同样出「分享国家队征程」——所有名次均可转发（对照篮球版拍板规则） */
    if (titleWon) html += '<button class="btn btn-gold btn-block mt-10" id="mr-share-champ">分享夺冠速报 · 晒出这座奖杯</button>';
    else if (intlFinal) html += '<button class="btn btn-gold btn-block mt-10" id="mr-share-intl">分享国家队征程 · '
      + (intlFinal.result === "runner-up" ? intlFinal.comp + "亚军"
        : intlFinal.result === "semifinal" ? intlFinal.comp + "四强"
        : intlFinal.result === "group_out" ? intlFinal.comp + "小组赛"
        : intlFinal.stageLabel || intlFinal.comp) + '</button>';
    /* P133：捧杯专属音效（trophy 长琶音；一次性，随卡片弹出） */
    if (titleWon && window.Snd) { try { Snd.event("trophy"); } catch (e) { } }
    /* ★ P261：每场战报分享按钮——夺冠/国家队征程按钮在场上时让位金色（描边风格防混淆）
       ★ P283c：热点资讯端且本季奖励未领满 → 按钮「（有奖）」+ 下方一句话引导（青训/成年通用） */
    if (r.played) {
      const _msGold = !!shareMs && !titleWon && !intlFinal;
      const _bonusOn = !!(window.SharePoster && SharePoster.canPostToBbs && SharePoster.shareBonusLeft && SharePoster.canPostToBbs() && SharePoster.shareBonusLeft() > 0);
      const _btnTxt = (shareMs ? "分享「" + shareMs.name + "」战报" : "分享战报") + " · 发热点资讯" + (_bonusOn ? "（有奖）" : "");
      html += '<button class="btn ' + (_msGold ? "btn-gold" : "btn-ghost") + ' btn-block mt-10" id="mr-share-match">' + _btnTxt + "</button>";
      if (_bonusOn) {
        const _SB = SharePoster.SHARE_BONUS;
        html += '<div style="font-size:12px;color:var(--gold);margin-top:6px;text-align:center">分享成功有奖励：本季剩 ' + SharePoster.shareBonusLeft() + ' 次，每次 ' + (_SB.money / 10000) + ' 万资金 +' + _SB.exp + ' 经验</div>';
      }
    }
    html += '<button class="btn btn-primary ec-opt" id="mr-ok">返回俱乐部 ▸</button></div>';
    CardHost.show(html, { dismissable: false });
    const champShare = UIkit.$("#mr-share-champ");
    if (champShare) champShare.onclick = UIkit.guard(function () {
      try {
        const champ = { compLabel: compLabel, scoreLine: homeName + " " + r.home + " : " + r.away + " " + awayName, oppName: oppName,
          userGoals: r.userGoals || 0, rating: r.played ? r.rating : null, motm: !!r.motm };
        if (window.SharePoster && SharePoster.share) SharePoster.share(State, { __champion: champ }, "champion");
        else UIkit.toast("分享暂不可用", "red");
      } catch (err) { console.warn("share", err); UIkit.toast("分享功能异常：" + err.message, "red"); }
    }, "分享夺冠速报");
    /* S3：国家队名次分级分享 → SharePoster "intl" 模式（海报 accent 随名次分级） */
    const intlShareBtn = UIkit.$("#mr-share-intl");
    if (intlShareBtn) intlShareBtn.onclick = UIkit.guard(function () {
      try {
          if (window.SharePoster && SharePoster.share) {
            SharePoster.share(State, { __intl: intlFinal,
              __match: { scoreLine: homeName + " " + r.home + " : " + r.away + " " + awayName, oppName: oppName,
                userGoals: r.userGoals || 0, rating: r.played ? r.rating : null, motm: !!r.motm, played: r.played } }, "intl");
          }
        else UIkit.toast("分享暂不可用", "red");
      } catch (err) { console.warn("share", err); UIkit.toast("分享功能异常：" + err.message, "red"); }
    }, "分享国家队征程");
    /* ★ P261：战报分享 → SharePoster "match" 模式 */
    const _msBtn2 = UIkit.$("#mr-share-match");
    if (_msBtn2) _msBtn2.onclick = UIkit.guard(function () {
      try {
        if (window.SharePoster && SharePoster.share) SharePoster.share(State, { __matchCard: matchShare }, "match");
        else UIkit.toast("分享暂不可用", "red");
      } catch (err) { console.warn("share", err); UIkit.toast("分享功能异常：" + err.message, "red"); }
    }, "分享战报");
    UIkit.$("#mr-ok").onclick = UIkit.guard(() => {
      /* P133 埋点 BMC004：赛季结算返回（custom.season = 已完成季号） */
      try { if (window.Track && State.data) Track.click("BMC004", "T1", "season_end", { season: State.data.season || 0 }); } catch (e) { }
      CardHost.close();
      const ecCtx = S.ecCtxOf(e, r, res, compLabel, oppName, isIntlFx);
      EventCards.afterResult(State, ecCtx, UIkit.guard(() => {
        if (window.Snd) Snd.setBgm("career");
        UIkit.show("hub");
        Hub.refresh(null);
        if (window.GameLoop) GameLoop.onMatchFlowDone();
        if (window.Chapters) Chapters.check();
      }, "赛后卡收口"));
    }, "结算确认");
  };

  /* ── P105-B4：赛后媒体头条（球员侧比赛日体验）──
     每场正式比赛结算时按表现生成一条头条，轻展示在结算卡上（零交互成本，不弹新卡）。
     媒体名一律泛称（体育周报/绿茵直击等，脱敏三级：禁真实媒体名）；模板变量
     {team}{opp}{goals}{assists}{rating}。档位：未出场/巨献(motm或8.0+)/出色(7.0+或进球)/
     平淡(6.0+)/迷失(输球且<6.0)。R.pick 在比赛结算路径内（行为事件，耗 R 合法）。
     ★ P217（玩家实测：国家队友谊赛头条写「慕城红星的三分」）：①签名加 isIntl——
       国际赛 {team}=「中国队」（原恒填俱乐部名）；②「三分」为联赛积分专用语 →
       great 池该条国际赛不投递，另补国际赛专用条目（INTL_EXTRA）。 */
  const HEADLINES = {
    none: [
      "本场焦点不属于替补席——训练场才是你的比赛。",
      "《看台视角》：这90分钟与你无关，下一站再看。",
    ],
    monster: [
      "《{team}之夜的答案》——{goals}球、评分{rating}，{opp}的防线被一个人拆解。",
      "《全场最佳无争议》：评分{rating}，{opp}主帅赛后只提了一个名字。",
      "《这就是身价》：{goals}球定音，{opp}带走的只有失球的记忆。",
    ],
    great: [
      "《稳定输出》：评分{rating}的夜晚，{opp}拿你毫无办法。",
      "《数据不说谎》：{goals}球{assists}助攻，你的名字又进了最佳阵容讨论。",
      "《赢球的注脚》——这场胜利里，你那块够硬。",   // ★ P217：原「{team}的三分里」联赛专用语 → 通用化
    ],
    ok: [
      "《平淡但及格》：评分{rating}，{opp}没记住你，你也没给机会。",
      "《走过场的一夜》——评分{rating}，新闻稿里你只是一个名字。",
    ],
    bad: [
      "《迷失之夜》——评分{rating}，{opp}的胜利衬出了你的沉默。",
      "《谁该背锅？》评分{rating}，评论区吵翻了天，你关掉了手机。",
    ],
  };
  const HEADLINES_INTL = {
    great: [
      "《国旗之下》：{goals}球{assists}助攻，你把最好的状态留给了国家队。",
      "《国家队的答案》——评分{rating}，{opp}的防线记住了这个夜晚。",
    ],
    monster: [
      "《属于中国球迷的夜晚》——{goals}球、评分{rating}，{opp}被一个人扔回了更衣室。",
    ],
  };
  /* ★ P217：俱乐部专属条目（国际赛不投递）——「三分」=联赛积分语境 */
  const HEADLINES_CLUB = {
    great: [
      "《赢球的注脚》——{team}的三分里，你那块够硬。",
    ],
  };
  function headlineOf(r, res, oppName, isIntl) {
    const d = State.data;
    const opp = oppName || "对手";
    const team = isIntl ? "中国队" : ((window.teamById && teamById(d.clubId) || { name: "球队" }).name);   // ★ P217：国际赛语境 {team}=国家队
    const fill = t => String(t)
      .replace(/\{team\}/g, team).replace(/\{opp\}/g, opp)
      .replace(/\{goals\}/g, String(r.userGoals || 0))
      .replace(/\{assists\}/g, String(r.userAssists || 0))
      .replace(/\{rating\}/g, String(r.rating || 0));
    if (!r.played) return fill(R.pick(HEADLINES.none));
    let tpl;
    if (r.motm || r.rating >= 8) tpl = R.pick(isIntl ? HEADLINES.monster.concat(HEADLINES_INTL.monster || []) : HEADLINES.monster);
    else if (r.rating >= 7 || (r.userGoals || 0) >= 1) tpl = R.pick(isIntl ? HEADLINES.great.concat(HEADLINES_INTL.great || []) : HEADLINES.great.concat(HEADLINES_CLUB.great || []));
    else if (r.rating >= 6) tpl = R.pick(HEADLINES.ok);
    else if (res === "负") tpl = R.pick(HEADLINES.bad);
    else tpl = R.pick(HEADLINES.ok);
    return fill(tpl);
  }

  window.Settlement = S;
  S.headlineOf = headlineOf;   // P105-B4 导出（探针验证用；纯函数无副作用）
})();
