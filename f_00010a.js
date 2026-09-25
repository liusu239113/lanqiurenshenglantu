/* ============================================================================
   v2/match.js — V2 统一比赛播放器
   单一定时器 / 单一控制区渲染 / 无 monkey-patch。
   直播增强（半场哨/JR弹幕/进球停顿/倍速）内置为 _live 模式。
   ============================================================================ */
(function () {
  'use strict';
  const SPEEDS = [1, 2, 4];

  /* ── P105-B5 赛前对位侦察（FM Opposition Report 球员侧化）──
     比赛屏 feed 顶部插一条「对位侦察」：对手阵容里与你位置组（POS_GROUP 单源）评分最高的
     球员。属性遮罩=只给档位不给数字（球探报告口径）：≥85 世界级 / ≥80 顶级 / ≥75 强力 /
     ≥70 常规 / 其余 普通。确定性选取（渲染零 R）。GK 玩家对位=对手全队最高分者。
     国队对手（无 clubId 阵容）→ 返回 null 不显示。 */
  function opponentBriefOf(e, d) {
    if (!window.teamById) return null;
    const oppSide = e.userHome ? e.away : e.home;
    if (!oppSide || !oppSide.id || typeof oppSide.id !== "string" || oppSide.id.indexOf("intl_") === 0 || oppSide.id.indexOf("nat_") === 0) return null;
    const oppTeam = teamById(oppSide.id);
    if (!oppTeam || !oppTeam.players || !oppTeam.players.length) return null;
    const isGK = d.player.position === "GK";
    const myGroup = (window.Transfer && Transfer.POS_GROUP) ? Transfer.POS_GROUP(d.player.position) : "ATT";
    /* ★ players 是装配后的对象数组 {name, age, position, nationality, overall, real}
       （data_real_squads.js 源数据虽为元组，装配时已转对象） */
    const pool = isGK ? oppTeam.players : oppTeam.players.filter(pl => (window.Transfer ? Transfer.POS_GROUP(pl.position) : "ATT") === myGroup);
    if (!pool.length) return null;
    let best = pool[0];
    for (const pl of pool) if ((pl.overall || 0) > (best.overall || 0)) best = pl;
    const rating = best.overall || 0;
    const tier = rating >= 85 ? "世界级" : rating >= 80 ? "顶级" : rating >= 75 ? "强力" : rating >= 70 ? "常规" : "普通";
    const hint = rating >= 85 ? "别指望轻易过掉他，多打配合" : rating >= 80 ? "一对一占不到便宜，用节奏找空间"
      : rating >= 75 ? "有对抗强度，别硬碰" : rating >= 70 ? "你能压住他，大胆要球" : "他怕速度，多冲他身后";
    return { name: best.name, pos: best.position, rating, tier, hint };
  }

  const MatchUI = {
    engine: null, timer: null, _applied: false,
    start(fixture) {
      this._applied = false;
      /* ★ P140 重赛回魂状态（配 settlement.js 的国家队败局重赛门）：
         · _retryOk（「接受结果」放行标记）每场 start 必清——重赛重开与新比赛都回到未接受态；
         · _retryCount / _retryBoost 仅在 fixture 变化（新比赛）时重置——
           同一 fixture 重开 = 重赛，次数与加成保留。键含 comp+双方 id，比 day/round 更稳
           （淘汰赛 nextKO 换对手后键自然变化）。 */
      this._retryOk = false;
      const _rm = fixture.match || fixture;
      const _retryKey = (_rm.comp || fixture.comp || "") + "|" + _rm.home.id + "|" + _rm.away.id
        + "|" + (fixture.day != null ? "d" + fixture.day : "r" + (fixture.round || 0));
      if (this._retryFxKey !== _retryKey) { this._retryFxKey = _retryKey; this._retryCount = 0; this._retryBoost = 1; }
      if (this.timer) { this.stopTimer(); this.timer = null; }
      this._hiddenPaused = false;
      const d = State.data;
      if (d.injuryDays > 0) { UIkit.toast("伤病中无法出场（剩 " + d.injuryDays + " 天）"); return; }
      const fxKey = fixture.day != null ? "d" + fixture.day : "r" + (fixture.round || 0);
      if (window.EventCards && this._preCheckedFor !== fxKey) {
        this._preCheckedFor = fxKey;
        if (EventCards.showPre(State, fixture, () => this.start(fixture))) return;
      }
      this.fx = fixture;
      UIkit.show("match");
      /* ★ P306 修复：P301 国队提示条 / P133 教学条都是 appendChild 进**常驻** .m-head 的，
         而 .m-head 无清空逻辑（每场只有 #m-feed 被 innerHTML 重置）→ 每踢一场国赛
         就残留一条「国家队赛事 · 国际友谊赛」，跨场无限堆积（兄弟实测 4 连叠）。
         开赛先摘掉上一场遗留的附加节点（统一打 m-head-xtra 标记），再按需新增。 */
      try {
        const _head0 = document.querySelector(".m-head");
        if (_head0) _head0.querySelectorAll(".m-head-xtra").forEach(n => n.remove());
      } catch (err) { /* 清理失败不阻塞开赛 */ }
      if (window.Snd) Snd.setBgm(/亚洲杯|世预赛|世界杯|友谊赛/.test(fixture.comp || "") ? "champion" : "resolve");
      if (window.Snd) Snd.event("kick_off");
      /* ★ P140：重赛回魂时由重赛门注入 userBoostMult（默认 1 = 无加成） */
      this.engine = new MatchEngine(State, fixture, { userBoostMult: this._retryBoost || 1 });
      const e = this.engine;
      UIkit.$("#m-home").textContent = e.home.name;
      UIkit.$("#m-away").textContent = e.away.name;
      UIkit.$("#m-score").textContent = "0 : 0";
      UIkit.$("#m-minute").textContent = "0'";
      UIkit.$("#m-minbar").style.width = "0%";
      /* ★ P105-B5 对位侦察 feed 条目（确定性选取，渲染零 R；国队对手无阵容则省略） */
      let briefHtml = "";
      try {
        const brief = opponentBriefOf(e, d);
        if (brief) {
          briefHtml = '<div class="feed-item info"><span class="min">—</span><span>对位侦察：你在场上直接对位的是 <b>' + UIkit.esc(brief.name) + "</b>（" + UIkit.esc(brief.pos) + " · " + brief.tier + "）——" + UIkit.esc(brief.hint) + "。</span></div>";
        }
      } catch (err) { /* 情报失败不阻塞开赛 */ }
      UIkit.$("#m-feed").innerHTML = briefHtml + '<div class="feed-item info"><span class="min">—</span><span>' + (e.userStarter
        ? "首发名单公布：" + (d.player.number || 9) + "号 " + UIkit.esc(d.player.name) + " 出任" + ((CONFIG.POSITIONS[d.player.position] || {}).name || d.player.position) + "！"
        : "首发名单没有你的名字——" + (d.player.number || 9) + "号 " + UIkit.esc(d.player.name) + "在替补席待命，可能替补出场。") + "</span></div>";
      this.renderPlayControls();
      /* P133 新手前 3 场提示（一行，挂在比分条下；done/旧档返回空串，随比赛屏销毁） */
      try {
        const _tip = (window.Tutorial && Tutorial.matchTip()) || "";
        if (_tip) {
          const head = document.querySelector(".m-head");
          if (head) { const _t = document.createElement("div"); _t.innerHTML = _tip; head.appendChild(_t.firstChild); head.lastChild.classList.add("m-head-xtra"); }
        }
      } catch (err) { /* 提示失败不阻塞开赛 */ }
      /* ★ P301（兄弟需求「国家队比赛时有个提示，跟篮球版一样」）：国队赛事提示条。
         对齐篮球版 gameloop 国家队直播标题思路（round_name 上屏）；fixture.comp 自带
         「世界杯小组赛 R1」级别标签，直接渲染金框提示。确定性渲染，零 R。 */
      try {
        const _icomp = String(fixture.comp || (fixture.match && fixture.match.comp) || "");
        const _isIntl = fixture.type === "intl" || /国家队|世界杯|亚洲杯|世预赛|东亚杯|奥运会|友谊赛/.test(_icomp);
        if (_isIntl && _icomp) {
          const head = document.querySelector(".m-head");
          if (head) {
            const _n = document.createElement("div");
            _n.innerHTML = '<div style="margin:6px 0 2px;padding:5px 10px;border:1px solid var(--gold);border-radius:8px;font-size:12px;font-weight:800;color:var(--gold);display:inline-block">' + ICO("flag", 14) + " 国家队赛事 · " + UIkit.esc(_icomp) + "</div>";
            head.appendChild(_n.firstChild);
            head.lastChild.classList.add("m-head-xtra"); /* ★ P306：打标记供下场开赛清理 */
          }
        }
      } catch (err) { /* 提示失败不阻塞开赛 */ }
      /* ★★★ P97-M5 修复（P0）：`play()` 从未被调用 —— 而它是**唯一**启动播放定时器
         （`rearm()` → `setInterval(tick)`）的地方。
         漏掉它的后果：比赛屏渲染完就永远停在 0:0，玩家只能点「跳到终场」，
         于是**逐分钟直播 + 三层小游戏（P97-M3-3A/3B/3C/3D）在真实游戏里完全无法触达** ——
         四个冲刺的成果玩家一次都看不到。
         ★ 为什么长期没被发现：`v2_smoke.js` 在比赛屏**优先点 `#m-skip`**（跳到终场），
           从未验证过"比赛能自己跑起来"；直到 M5 补了「三层小游戏实战冒烟」才暴露。
         ★ `play()` 内部：算 `_live`（是否关键场 → 要不要倍速/半场哨）→ 渲染控制区 → `rearm()`。 */
      this.play();
    },
    renderPlayControls() {
      const ctrl = UIkit.$("#m-controls");
      if (!ctrl) return;
      if (this._live) {
        ctrl.innerHTML = '<div class="row"><button class="btn btn-ghost" id="m-speed" style="flex:1">倍速 ×' + SPEEDS[this._speedIdx || 0] + '</button><button class="btn btn-ghost" id="m-skip" style="flex:1">' + ICO("skip", 14) + " 跳到终场</button></div>";
        const sp = UIkit.$("#m-speed");
        if (sp) sp.onclick = UIkit.guard(() => { this._speedIdx = (this._speedIdx + 1) % 3; sp.textContent = "倍速 ×" + SPEEDS[this._speedIdx]; this.rearm(); }, "倍速");
      } else {
        ctrl.innerHTML = '<button class="btn btn-ghost" id="m-skip">' + ICO("skip", 14) + " 跳到终场</button>";
      }
      const sk = UIkit.$("#m-skip");
      if (sk) sk.onclick = UIkit.guard(() => this.skip(), "跳到终场");
    },
    /* ★★★ P99-FLAKY 修复：**唯一的定时器停法** —— 必须 clear **并且** 把字段置空。
       原先 7 处只写 `clearInterval(this.timer)` 而不置空，会留下一个**残留的真值 id**：
       于是所有"是否还在跑"的判断（`rearm` / `pauseForHidden` 的 `if (this.timer)`、
       冒烟的 `!!MatchUI.timer`）集体失真 —— 现场看起来"定时器还在跑"，实际早已停摆。
       实测代价：追 match 屏卡死时被这个假象带偏，绕了很久才定位。
       `isRunning()` 供探针/冒烟用（**别再直接读 `timer` 字段判活**）。 */
    stopTimer() { if (this.timer) { clearInterval(this.timer); this.timer = null; } },
    isRunning() { return !!this.timer; },
    rearm() {
      if (this.timer) this.stopTimer();
      this.timer = setInterval(() => this.tick(), Math.round(700 / SPEEDS[this._speedIdx || 0]));
    },
    play() {
      let live = false;
      try { live = !!(window.HUPU_FLAVOR && SeasonSystem.matchImportance(State, this.fx).key); } catch (err) { live = false; }
      this._live = live;
      this._speedIdx = 0; this._halfDone = false; this._hold = 0;
      this.renderPlayControls();
      this.rearm();
    },
    tick() {
      const e = this.engine;
      if (!e) return;
      if (e.phase === "done") { this.stopTimer(); this.finish(); return; }
      if (this._live && this._hold > 0) { this._hold--; return; }
      const step = e.step();
      if (!step) { this.stopTimer(); this.finish(); return; }
      if (step.keyMoment) { this.stopTimer(); this.showKey(step.keyMoment); return; }
      // ★★ P97-M3B：三层小游戏对局（对手是"活的"，暂停等玩家决策）
      if (step.duelMoment) { this.stopTimer(); this.showDuel(step.duelMoment); return; }
      (step.feedItems || []).forEach(it => this.appendFeed(it));
      if (this._live) this.afterStep();
      this.updateHUD();
      this.scrollBottom();
      if (e.phase === "done") { this.stopTimer(); setTimeout(UIkit.guard(() => this.finish(), "终场"), 900); }
    },
    afterStep() {
      const e = this.engine;
      const feed = UIkit.$("#m-feed");
      const last = feed && feed.lastElementChild;
      const cls = last ? (last.className || "") : "";
      const push = (type, minute, text) => this.appendFeed({ minute, type, text });
      /* P139（用户拍板）：实时比赛界面不再注入热点资讯 JR 评述 —— 展示层三处
         （半场/进球/落后）全删；引擎层的 JR 抽取保留（它消耗比赛 RNG，见 match.js 同日注释）。 */
      if (!this._halfDone && e.minute >= 45) {
        this._halfDone = true;
        if (window.Snd) Snd.event("whistle_half");
        const sc = e.score;
        push("info", 45, "半场结束　【" + sc.home + " : " + sc.away + "】　球员走向通道，看台上的议论比比分更吵。");
        this._hold = 1;
        return;
      }
      if (cls.indexOf("goal") >= 0) {
        if (window.Snd) Snd.event("goal");
        this._hold = 1;
      }
    },
    pauseForHidden() { if (this.timer) { this.stopTimer(); this.timer = null; this._hiddenPaused = true; } },
    simMatch(fixture, opts) { return Settlement.simMatch(this, fixture, opts); },
    resumeIfPaused() {
      if (!this._hiddenPaused) return;
      this._hiddenPaused = false;
      if (this.engine && this.engine.phase !== "done" && UIkit.$("#m-skip")) this.rearm();
    },
    skip() {
      this.stopTimer();
      const e = this.engine;
      if (!e) return;
      this._skipped = true;   // ★ P116：点球大战据此全自动结算（跳过=引擎代打一切，不再弹交互）
      // ★ 跳过 = 全部交给自动决策（机会链的 baseline 结果），不再弹小游戏
      e.interactive = false;
      let guard = 0;
      while (e.phase !== "done" && guard++ < 300) {
        const step = e.step();
        if (step && step.keyMoment) e.resolveKey(0);
        (step && step.feedItems || []).forEach(it => this.appendFeed(it));
      }
      this.updateHUD();
      this.finish();
    },
    /** ★ P97-M3B：三层对弈的呈现（引擎算，界面只收集选择） */
    showDuel(dm) {
      const self = this;
      const e = this.engine;
      if (!window.DuelUI) {
        // 没有 UI 模块时按自动决策走完，绝不卡死比赛
        UIkit.toast("对弈界面未加载，已按自动处理");
        this.rearm();
        return;
      }
      this.appendFeed({ minute: e.minute, type: "keymoment", text: "【" + dm.title + "】" + (dm.sub || "") });
      this.scrollBottom();
      DuelUI.show(dm, e, function (items) {
        (items || []).forEach(function (it) { self.appendFeed({ minute: e.minute, type: it.type, text: it.text }); });
        self.updateHUD();
        self.scrollBottom();
        self.renderPlayControls();   // 若上一处是 keyMoment，控制区可能还停在"比赛继续"
        self.rearm();
      });
    },
    showKey(km) {
      const e = this.engine;
      this.appendFeed({ minute: e.minute, type: "keymoment", text: "" + km.title + " " + km.desc });
      this.scrollBottom();
      const ctrl = UIkit.$("#m-controls");
      ctrl.innerHTML = '<div class="key-choice" style="font-size:13px;color:var(--gold);margin-bottom:4px">做出你的选择：</div>';
      km.choices.forEach((c, i) => {
        const b = document.createElement("button");
        b.className = "btn " + (i === 0 ? "btn-gold" : i === 1 ? "btn-primary" : "btn-ghost");
        b.textContent = c.text;
        b.onclick = UIkit.guard(() => {
          const items = e.resolveKey(i);
          items.forEach(it => this.appendFeed(it));
          this.updateHUD();
          this.scrollBottom();
          /* ★ 用户拍板（2026-09-16）：选完关键抉择**直接继续比赛**——
             不再插一道「比赛继续」二次确认（截图反馈：选完还得再点一次才走，拖节奏）。
             与 showDuel（对弈打完直接 rearm）口径统一。控制区恢复倍速/跳过。 */
          this.renderPlayControls();
          this.rearm();
        }, "关键抉择");
        ctrl.appendChild(b);
      });
    },
    finish() {
      const e = this.engine;
      if (!e) return;
      if (e.phase !== "done") e.finish();
      this.stopTimer();
      const draw = e.result.home === e.result.away;
      if (draw && (e.fx.cupKO || e.isCup)) Settlement.startPenalties(this);
      else Settlement.applyResult(this);
    },
    appendFeed(it) {
      const div = document.createElement("div");
      div.className = "feed-item " + (it.type || "info");
      div.innerHTML = '<span class="min">' + it.minute + "'</span><span>" + it.text + "</span>";
      const feed = UIkit.$("#m-feed");
      if (feed) feed.appendChild(div);
    },
    scrollBottom() {
      const feed = UIkit.$("#m-feed");
      if (feed) feed.scrollTop = feed.scrollHeight;
    },
    updateHUD() {
      const e = this.engine;
      UIkit.$("#m-score").textContent = e.score.home + " : " + e.score.away;
      UIkit.$("#m-minute").textContent = e.minute + "'";
      UIkit.$("#m-minbar").style.width = Math.min(100, e.minute / 90 * 100) + "%";
    },
  };
  window.MatchUI = MatchUI;
  MatchUI.opponentBriefOf = opponentBriefOf;   // P105-B5 导出（探针验证用；纯函数）
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) MatchUI.pauseForHidden();
    else MatchUI.resumeIfPaused();
  });
})();
