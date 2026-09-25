/* ============================================================================
   gameloop.js — 比赛驱动阶段机（M1 骨架，对标《冠军之心：篮球生涯》gameloop.js）
   一次点击 = 一步。阶段流转：
     waiting_advance →（快进/普通场自动完赛）→ showing_hook（关键场交给展示层：
     赛前卡 → 直播 → 结算 → 赛后卡）→ 回 waiting_advance
   设计约定（继承篮球版踩坑）：
   - 展示层通过 present 注入点解耦（UI 注册真实实现，headless 测试注册桩；
     模块缺失时兜底，防引擎/UI 互等死锁）
   - decide() 为纯路由决策，供 UI 与测试复用；M2 直播压缩只换 present.openMatch
   - phase 在比赛流程期间阻断常规推进（防重入）
   ============================================================================ */
(function () {
  const PHASES = {
    WAITING: "waiting_advance",      // 等待点击推进
    SHOWING_HOOK: "showing_hook",    // 关键场流程进行中（阻断推进）
  };

  const GameLoop = {
    PHASES,
    phase: PHASES.WAITING,

    /* 展示层注入点：ui.js 加载后注册真实实现 */
    present: {
      openMatch: null,   // (fixture) 关键场/亲自出战：赛前卡→直播→结算→赛后卡 全流程
      showDigest: null,  // (rows, ev) 批量自动完赛战报
      refresh: null,     // (ev) 回主界面（含事件弹窗/赛季结算路由）
      offseason: null,   // () 休赛期：青训投资养成界面（M5 叙事流）
      retire: null,      // () 强制退役结算
    },

    /** 比赛流程结束回调（由 ui.js 结算弹窗关闭后调用）：解锁推进 */
    onMatchFlowDone() {
      this.phase = PHASES.WAITING;
    },

    /* ── P100-A1：逐场勾选表（d.matchPlan）────────────────────────────
       Q6 拍板「默认全手动」：玩家在赛事日历上勾选哪场跳过、哪场亲自踢。
       键含 s<season> 防跨季残留；赛季切换时 initSeason 整表清空（R3）。 */
    matchPlanKey(state, fx) {
      const d = state.data;
      const fm = fx.match || fx;
      const h = (fm.home && fm.home.id) || "?";
      const a = (fm.away && fm.away.id) || "?";
      return "s" + d.season + "_d" + fx.day + "_" + (fx.type || "?") + "_" + h + "_" + a;
    },

    /** 路由决策（纯函数）：下一步该做什么 */
    decide(state) {
      const d = state.data;
      if (d.retired || (window.Career && Career.forcedRetirement(state))) return { action: "retire" };
      const fx = SeasonSystem.fixtureToday(state);
      if (!fx && d.offseason) return { action: "offseason" }; // M5：休赛期无比赛日 → 青训投资养成界面
      if (fx) {
        if (d.injuryDays > 0) return { action: "fastforward", fixture: fx }; // 养伤日：缺席判负由结算链处理
        const imp = SeasonSystem.matchImportance(state, fx);
        // M4 独立路径标记：国家队赛事（世预赛/亚洲杯/世界杯/友谊赛）走 intl 通道
        const isIntlFx = !!(fx.comp || (fx.match && fx.match.home && String(fx.match.home.id || "").indexOf("nat_") === 0));
        const path = isIntlFx ? "intl" : "club";
        /* ★ P100-A1（Q6 默认全手动）：勾选表优先——玩家勾了「跳过」→ 静默完赛；
           未勾 → 一律停下进比赛屏（比赛屏内可再点「跳到终场」= 从当前比分继续模拟）。
           旧自动判定链（关键场强制直播 / 连续关键战降级 STREAK_LIMIT）按规格 §7.5 作废退役；
           matchImportance 仅保留为日历与卡片的「焦点战」标记（imp.key），不再影响路由。 */
        const planned = d.matchPlan && d.matchPlan[GameLoop.matchPlanKey(state, fx)];
        if (planned === "sim") return { action: "match-sim", fixture: fx, imp, path, planned: true };
        if (planned === "live") return { action: "match-live", fixture: fx, imp, path };
        /* ★★ P168（2026-09-19 用户拍板「进入比赛前，都要有选项界面」）：
           未勾选的比赛**不再直接开打**——返回 match-card 停下，由展示层回主页渲染
           赛前选择卡（vs 对手卡：「进入比赛」/「跳过本场」），玩家确认后才走
           live（写 matchPlan[key]="live" 后 advance → match-live 直播）或 sim（写
           "sim" → match-sim 静默完赛）。
           ★ 旧 autoOn 默认勾选器（keySimUnlocked+autoSim 静默完赛非焦点普通场）退役：
             它让连推/快进途中到达的普通场**完全无感地打完**、关键场**直接弹直播屏**
             —— 只有「比赛日当天恰好打开主页」才见得到赛前卡，这就是用户反馈的
             "有些时候直接进入比赛，有些时候又出现选择界面"。
           ★ keySimUnlocked/autoSim 字段保留（旧档兼容），运行时不再消费。 */
        return { action: "match-card", fixture: fx, imp, path };
      }
      return { action: "fastforward" };
    },

    /** 一步推进：快进直到需要玩家介入（关键场/事件/赛季结算/退役），途中普通场自动完赛 */
    advance() {
      if (this.phase !== PHASES.WAITING) return; // 播放/弹窗期间阻断（防重入）
      const P = this.present;
      if (!P || !P.refresh) { this._fallbackAdvance(); return; } // 展示层未注册：兜底旧路径
      const d = State.data;
      const digest = [];
      const silentCtxs = [];    // P56：静默场次的事件卡上下文（供里程碑/回响/主线逐场判定）
      let pendingDaily = null;  // P56：非比赛日抽到的日常卡（循环结束后呈现）
      let ev = null, guard = 0;
      while (guard++ < 400) {
        const dec = this.decide(State);
        if (dec.action === "retire") { P.retire && P.retire(); return; }
        if (dec.action === "offseason") { if (P.offseason) { P.offseason(); return; } break; } // 无注入点则跳出走 refresh
        if (dec.action === "match-card") {
          /* ★ P168：未勾选的比赛停下回主页——主页比赛日自然渲染赛前选择卡，
             玩家「进入比赛」（写 live → advance → match-live 直播）或
             「跳过本场」（写 sim → advance → match-sim 静默完赛）后再继续。
             途中已积攒的战报/事件仍按原出口链呈现（showDigest → 主页）。 */
          break;
        }
        if (dec.action === "match-live") {
          // 交给展示层（赛前卡→直播→结算→赛后卡），完成后 onMatchFlowDone 解锁
          this.phase = PHASES.SHOWING_HOOK;
          P.openMatch(dec.fixture);
          return;
        }
        if (dec.action === "match-sim") {
          if (!window.MatchUI) { // 展示层缺失兜底：按关键场路径交给 openMatch，防「不开演=死循环」
            this.phase = PHASES.SHOWING_HOOK;
            P.openMatch(dec.fixture);
            return;
          }
          const row = MatchUI.simMatch(dec.fixture, { silent: true });
          if (row && row.retryPending) {
            /* ★ P140b（拍板 2026-09-19「没亲自打也要回魂」）：静默跳过的国家队正式比赛
               败局也要弹重赛卡。confirm 是异步 Promise，批量同步循环等不了 → 在此停循环
               （同 match-live「停下交还展示层」语法），由 Settlement.silentRetryFlow
               接管弹卡与重赛（MatchUI 存在 ⇒ Settlement 同包必存在）；结束后把本场
               战报接回 digest 并按原出口收尾。 */
            this.phase = PHASES.SHOWING_HOOK;
            const self = this;
            Settlement.silentRetryFlow(dec.fixture, function (srow) {
              if (srow) { digest.push(srow); if (srow.ecCtx) silentCtxs.push(srow.ecCtx); }
              try { State.save(); } catch (e2) { /* 存档失败不阻断 */ }
              self.phase = PHASES.WAITING;
              if (digest.length || pendingDaily) P.showDigest(digest, ev, { silentCtxs: silentCtxs, dailyCard: pendingDaily });
              else P.refresh(ev);
            });
            return;
          }
          if (row) {
            digest.push(row);
            if (row.ecCtx) silentCtxs.push(row.ecCtx);   // P56：普通场也要能出事件卡
          }
          if (!SeasonSystem.pendingFixtures(State).length) break; // 赛季踢完 → refresh 触发赛季结算
          continue;
        }
        // fastforward（含养伤日 / 休赛期 / 非比赛日）
        if (d.injuryDays <= 0) Training.dailyTrain(State);
        ev = Career.advanceDay(State);
        /* ★ P100-B3：养伤日的比赛必须立即按缺席结算（P178 起由队友真实模拟比分 + 同轮他队入榜）。
           此前 processMissedFixtures 只有 hub 渲染路径一个调用点 → 推进循环里
           错过的比赛被静默丢弃（day < dayIndex 后 fixtureToday 永不复得）→
           赛季轮次蒸发、积分守恒律破裂。dec.fixture 仅在「养伤日 + 今天有比赛」时非空。 */
        if (dec.fixture) {
          const mEv = Career.processMissedFixtures(State);
          if (mEv && !ev) ev = mEv;
        }
        if (ev) break;            // 公告 / 生活事件：卡片呈现
        // P56：非比赛日也出事件卡（补「没比赛就没剧情」的空档）。
        // 仅赛季内抽；休赛期由消费体系（NationDev 卡片流）接管，赛季结束/退役日不抽。
        if (window.EventCards && !d.offseason && !d.retired && !Career.forcedRetirement(State)) {
          const dc = EventCards.rollDaily(State);
          if (dc) { pendingDaily = dc; break; }
        }
        if (!d.offseason && !SeasonSystem.pendingFixtures(State).length) break; // 赛季结束
        if (d.offseason && CONFIG.calGE(d.date, CONFIG.calStart(d.leagueId, d.season))) break; // 新赛季（防御性兜底，P100-B1 日历口径；★ P197 去掉 +1——finishSeason 已自增 d.season，+1 在真实年份轴下多拖一年）
      }
      State.save();
      /* P56：把「战报卡 → 静默场事件卡 → 日常卡 → 生活事件」串成一条链交给展示层。
         rows 为空但有待呈现的日常卡时同样走 showDigest（展示层负责跳过空战报卡）。 */
      if (digest.length || pendingDaily) {
        P.showDigest(digest, ev, { silentCtxs: silentCtxs, dailyCard: pendingDaily });
      } else {
        P.refresh(ev);
      }
    },

    /* ── P100-A1：快进 N 天（Q6「连续度过多少天」）────────────────────
       与 advance() 同构，但带天数预算：非比赛日 / 已勾选跳过的比赛各计 1 天；
       途中遇到未勾选的比赛（match-live）立即停下交给玩家；
       公告/生活事件/日常卡/赛季结束等出口与 advance() 完全一致。 */
    advanceDays(days) {
      if (this.phase !== PHASES.WAITING) return;
      const P = this.present;
      if (!P || !P.refresh) { this._fallbackAdvance(); return; }
      const d = State.data;
      const digest = [];
      const silentCtxs = [];
      let pendingDaily = null;
      let ev = null, guard = 0, left = Math.max(0, days | 0);
      while (guard++ < 1200 && left > 0) {
        const dec = this.decide(State);
        if (dec.action === "retire") { P.retire && P.retire(); return; }
        if (dec.action === "offseason") { if (P.offseason) { P.offseason(); return; } break; }
        if (dec.action === "match-card") {
          /* ★★ P170（2026-09-19 用户拍板）：**快进 N 天的语义 = 期间比赛全部自动模拟**
             「我选择了快进 30 天，那么相应的期间的比赛，就应该被跳过、生成模拟的结果」
             —— 途中遇到未勾选的比赛不再停下（P169 的 break 语义只适用于「推进」
             主按钮 / 「快进到下一场比赛」），这里自动写 sim 让下一轮 decide 走
             match-sim 静默完赛：战报进 digest（结束后出汇总弹窗）、left 由 match-sim
             分支扣减；国家队败局回魂（retryPending）分支照常能停。 */
          d.matchPlan[GameLoop.matchPlanKey(State, dec.fixture)] = "sim";
          State.save();
          continue;
        }
        if (dec.action === "match-live") { // 未勾选的比赛：停下，交还玩家
          this.phase = PHASES.SHOWING_HOOK;
          P.openMatch(dec.fixture);
          return;
        }
        if (dec.action === "match-sim") {
          if (!window.MatchUI) {
            this.phase = PHASES.SHOWING_HOOK;
            P.openMatch(dec.fixture);
            return;
          }
          const row = MatchUI.simMatch(dec.fixture, { silent: true });
          if (row && row.retryPending) {
            /* ★ P140b：同 advance() —— 静默跳过的国家队正式比赛败局停下弹回魂卡。
               注意 left 不递减：本场尚未结算，玩家决策后重按快进重新计入。 */
            this.phase = PHASES.SHOWING_HOOK;
            const self = this;
            Settlement.silentRetryFlow(dec.fixture, function (srow) {
              if (srow) { digest.push(srow); if (srow.ecCtx) silentCtxs.push(srow.ecCtx); }
              try { State.save(); } catch (e2) { /* 存档失败不阻断 */ }
              self.phase = PHASES.WAITING;
              if (digest.length || pendingDaily) P.showDigest(digest, ev, { silentCtxs: silentCtxs, dailyCard: pendingDaily });
              else P.refresh(ev);
            });
            return;
          }
          if (row) {
            digest.push(row);
            if (row.ecCtx) silentCtxs.push(row.ecCtx);
          }
          left--; // 比赛日也是度过的一天
          if (!SeasonSystem.pendingFixtures(State).length) break;
          continue;
        }
        // fastforward（非比赛日 / 养伤日）
        if (d.injuryDays <= 0) Training.dailyTrain(State);
        ev = Career.advanceDay(State);
        /* ★ P100-B3：同 advance() —— 养伤日比赛立即缺席结算，防静默丢轮 */
        if (dec.fixture) {
          const mEv = Career.processMissedFixtures(State);
          if (mEv && !ev) ev = mEv;
        }
        left--;
        if (ev) break;
        if (window.EventCards && !d.offseason && !d.retired && !Career.forcedRetirement(State)) {
          const dc = EventCards.rollDaily(State);
          if (dc) { pendingDaily = dc; break; }
        }
        if (!d.offseason && !SeasonSystem.pendingFixtures(State).length) break;
        if (d.offseason && CONFIG.calGE(d.date, CONFIG.calStart(d.leagueId, d.season))) break; // 新赛季（防御性兜底，P100-B1；★ P197 去掉 +1，口径同 career.js）
      }
      State.save();
      if (digest.length || pendingDaily) {
        P.showDigest(digest, ev, { silentCtxs: silentCtxs, dailyCard: pendingDaily });
      } else {
        P.refresh(ev);
      }
    },

    /* ── P101：快进到下一场比赛（非比赛日按钮「快进到下一场比赛」）──────────
       语义与 advance() 一致：逐日推进，直到下一场**未勾选「跳过」**的比赛停下
       （比赛日卡交给玩家）；途中的公告 / 日常卡（GAP_DAYS=24，拦截极少）/
       赛季结算 / 休赛期照常停下——均为必须过目的强制交互。
       独立命名 = 语义自文档化：UI 按钮直接映射到此；未来若要调整快进路上的
       停靠规则（如「日常卡延后到赛后」），只动这里，不牵连「推进」主按钮。 */
    advanceToMatch() {
      this.advance();
    },

    /** 兜底（gameloop 加载但展示层未注册）—— ★ 必须**响亮失败**，不能静默空转
     *  --------------------------------------------------------------------------
     *  ★ P97 修正：这里原本调 `Hub.advanceToNextMatchLegacy()` —— 而**该函数从不存在**
     *    （全仓只有这一处引用）。于是"兜底"本身是一个静默空操作：
     *    引擎既不推进、也不报错，玩家看到的就是「点继续没反应」，且控制台一片干净。
     *  ★ 为什么不能改成 `Hub.advance()`：`Hub.advance()` → `GameLoop.advance()` →
     *    `present.refresh` 仍缺失 → 又进本函数 → **无限递归**。
     *  ★ 所以正确做法是"承认无路可走并说出来"：留一条可诊断的错误。 */
    _fallbackAdvance() {
      console.error("[GameLoop] 展示层未注册（present.refresh 缺失）—— 无法推进。检查 v2/flow.js 是否已注入 present。");
      if (window.UIkit && UIkit.errToast) UIkit.errToast("界面层未就绪，请刷新页面重试");
    },
  };

  window.GameLoop = GameLoop;
})();
