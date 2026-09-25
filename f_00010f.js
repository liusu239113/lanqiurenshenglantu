/* ============================================================================
   v2/hub.js — 生涯主界面：HUD + 今日节点 + 「继续」驱动 GameLoop + 更多二级菜单
   ============================================================================ */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => UIkit.esc(s);

  function posAvatar(position) {
    return '<span class="pos-avatar">' + UIkit.esc(position) + "</span>";
  }

  /* 底栏页面标题（P51：以覆盖层弹出） */
  /* ★ P103：底栏重构（用户拍板）——荣誉并入简况分页；排名并入新「俱乐部」页；
     新增「国家队」页（概况 / 国足发展 / 青训投资）。五格 = 属性/俱乐部/日历/国家队/简况 */
  const SHEET_TITLE = { attr: "属性", club: "俱乐部", sched: "赛事日历", nation: "国家队", life: "简况" };

  const Hub = {
    tab: null,   // 当前底栏页签；null = 主页卡片主舞台

    enter() {
      UIkit.show("hub");
      if (window.Theme) Theme.syncFromState(State);
      this.installCardHost();
      this.refresh(null);
      this.bindHudButtons();
      if (window.Transfer && window.CardHost) Transfer.checkPending(State); // P61：演化播报等待展示卡
      if (window.ClubEvents) { try { ClubEvents.consumePending(State); } catch (e) { console.warn("club pending", e); } } // P63 俱乐部线待展示队列
    },

    /* 顶栏 1:1 对齐篮球生涯：OVR 徽章数字 + 姓名 + 档案行（S季 · 年龄 · 位置 · 俱乐部），
       日期/伤病/休赛期降为中心提示行（对应篮球 gs-stageinfo），右上角四宫格按钮 */
    header() {
      const d = State.data;
      const ovrN = $("#hud-ovr-n");
      if (ovrN) ovrN.textContent = PlayerSystem.overall(d.player, { morale: d.morale });
      const pn = $("#hud-pname");
      if (pn) pn.textContent = d.player.name;
      const meta = $("#hud-pmeta");
      if (meta) {
        const pos = ((window.CONFIG && CONFIG.POSITIONS[d.player.position]) || {}).name || d.player.position;
        /* ★ P107（2026-09-17）：年份 → 赛季序号的换算收敛到 CONFIG.seasonIndexOf
           （单一真相源）。此前这里手写 `(d.season - START) + 1`，
           而 eventcards 的 minSeason 门直接比年份 —— 两处口径不一致（631 处门恒真）。 */
        const sN = (window.CONFIG && CONFIG.seasonIndexOf) ? CONFIG.seasonIndexOf(d.season)
          : (d.season || (window.CONFIG ? CONFIG.SEASON_START_YEAR : 0)) - (window.CONFIG ? CONFIG.SEASON_START_YEAR : 0) + 1;
        /* ★ P108：队名走 Youth.clubViewOf 唯一出口 —— 青训期 teamById(d.clubId) 必然 null，
           此前顶栏会显示"?"（用户截图：没有俱乐部）。 */
        const cv = (window.Youth && Youth.clubViewOf) ? Youth.clubViewOf(d) : ((window.teamById && teamById(d.clubId)) ? { name: teamById(d.clubId).name } : null);
        const club = cv || { name: "?" };
        const sLabel = (window.CONFIG && CONFIG.seasonLabel) ? CONFIG.seasonLabel(d.leagueId, d.season) : d.season;
        /* ★ P159（用户截图反馈）：顶栏只显示年份看不到月份 —— 档案行补月份。
           ★ 格式「2010.3」而非「2010年3月」：.gs-pmeta 是单行 ellipsis（实测「年X月」
           4 字符会把行尾俱乐部名挤成"中…"），「.X」只 +2 字符保完整一行；
           跨年联赛（「2010-11」）同样适用（「2010-11.3」）。月份与中心提示行同源 d.date。 */
        const _m = (d.date && d.date.month) || null;
        const yLabel = _m ? sLabel + "." + _m : sLabel;
        const txt = "S" + sN + " · " + yLabel + " · " + d.player.age + "岁 · " + pos + " · " + club.name;
        meta.textContent = txt;
        /* ★ P159：窄屏（~420px）下 .gs-pmeta 容器原本就装不下整行（存量截断，
           实测 sw 222 vs cw 171）。两档降级：①hud-meta-tight 降字号 10px；
           ②仍截断则分隔符去空格「·」。宽屏（用户设备 ~600px）两档都不触发、零影响。 */
        if (meta.scrollWidth > meta.clientWidth + 1) {
          meta.classList.add("hud-meta-tight");
          meta.textContent = txt.replace(/ · /g, "·");
        } else meta.classList.remove("hud-meta-tight");
      }
      const stage = $("#hud-stage");
      if (stage) {
        stage.innerHTML = "";
        const s1 = document.createElement("span");
        s1.textContent = "─ " + d.date.month + "月" + d.date.day + "日 ─ ";
        stage.appendChild(s1);
        if ((d.injuryDays || 0) > 0) {
          /* ★★ P160（2026-09-19 用户拍板）：伤病恒定标志 + 顶栏快捷痊愈。
             「在界面恒定一个受伤的标志，边上有一个看广告恢复的选项」——顶栏在全部
             页签常驻（属性/俱乐部/日历/国家队/简况）= 恒定性；中心提示行是它唯一的
             空位（右侧四钮已被占用、meta 行窄屏已紧）。设计：绷带红徽章（状态可读）
             + 金框「看视频 立即痊愈」快捷钮（行动可用），广告契约与简况·免费福利
             完全同源（Ads.show("heal") / consume / dailyLeft 日配额）；今日次数用完
             只留徽章不给按钮（不骗点击）。痊愈成功后重渲顶栏 + 当前页签。 */
          const bd = document.createElement("b");
          bd.className = "hud-injury-badge";
          bd.innerHTML = ICO("bandage") + "<i>伤病 " + d.injuryDays + " 天</i>";
          stage.appendChild(bd);
          try { if (window.Ads) Ads.rollDay(State); } catch (e) { /* ignore */ }
          if (window.Ads && !d.retired && Ads.dailyLeft(State, "heal") > 0) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "hud-heal-btn";
            btn.innerHTML = ICO("play") + "看视频 立即痊愈";
            btn.onclick = () => {
              if (window.Track) Track.click("BMC005", "T1", "ad_heal");
              Ads.show("heal", () => {
                Ads.consume(State, "heal");
                const days = State.data.injuryDays;
                State.data.injuryDays = 0;
                State.save();
                UIkit.toast({ html: ICO("check"), text: " 伤病痊愈！免去了 " + days + " 天休战" }, "green");
                this.header();
                /* 只重渲当前页签（不打断用户所在页）：主页无 sheet 时不重渲 */
                const body = $("#hub-sheet-body");
                const map = { attr: "attrPage", club: "clubPage", sched: "schedPage", nation: "nationPage", life: "lifePage" };
                const fn = this.tab && map[this.tab];
                if (body && fn && typeof this[fn] === "function") { try { this[fn](body); } catch (e) { /* ignore */ } }
              });
            };
            stage.appendChild(btn);
          }
        } else if (d.offseason) {
          const b = document.createElement("b");
          b.textContent = "休赛期";
          stage.appendChild(b);
        }
      }
      const nb = $("#news-badge");
      if (nb) {
        const u = d.newsUnread || 0;
        nb.textContent = u > 9 ? "9+" : u;
        nb.classList.toggle("hidden", !u);
      }
    },

    /**
     * 回主页 / 处理待呈现事件。
     * @param event 待呈现的生活事件（可选）
     * @param after 收口回调（可选）：P56 卡片链用它把「章节检查」挂到最后一步。
     *              赛季结束 / 退役分支不回调（那两条路径自带结算卡，章节检查由下一场兜住）。
     */
    refresh(event, after) {
      const d = State.data;
      const missedEv = Career.processMissedFixtures(State);
      State.save();
      if (missedEv) event = event || missedEv;
      if (!d.retired && Career.forcedRetirement(State)) {
        if (event) d._stashedEvent = event;
        Flow.retire(true);
        return;
      }
      this.header();
      const stashed = d._stashedEvent;
      if (stashed) {
        d._stashedEvent = null; State.save();
        this.showEventModal(stashed, () => { this.refresh(null); after && after(); });
        return;
      }
      if (event) { this.showEventModal(event, () => { this.renderHome(); after && after(); }); return; }
      // 赛季结束？（休赛期中旧赛程必然全部已踢；pendingFixtures 空即触发，语义对齐 v1 refresh）
      if (!d.retired && !d.offseason && !(SeasonSystem.pendingFixtures(State) || []).length) {
        /* ★ P172 防御：seasonEnd 异常不再白屏——坏档/边界数据下 finishSeason 可能抛错，
           兜底回落主页（玩家可继续推进/反馈），错误进控制台可见。 */
        try {
          Flow.seasonEnd();
        } catch (err) {
          console.error("seasonEnd", err);
          this.renderHome();
        }
        return;
      }
      this.renderHome();
      after && after();
    },

    /* ── 主页 = 卡片主舞台（一屏一张卡；属性/排名等数据已退到下方五格） ── */
    renderHome() {
      /* P133：新手引导（首个生涯一次性 3 步；d.tutorial.done 判定保证只弹一次，旧档视为已完成） */
      if (window.Tutorial) { try { Tutorial.maybeStart(); } catch (e) { /* 引导失败绝不阻塞游戏 */ } }
      /* P55：首夺世界杯冠军后播报一次「梦幻之夏」解锁 */
      if (window.Theme && Theme.checkUnlockNotice) {
        const notice = Theme.checkUnlockNotice(State);
        if (notice) UIkit.toast(notice, "gold");
      }
      this.tab = null;
      this._hostCard = false;
      const sheet = $("#hub-sheet");
      if (sheet) sheet.classList.remove("open");
      const m = $("#hub-main");
      /* ★ P172 防御（玩家实测白屏）：homeCard 抛错时不再留空白主舞台——
         兜底卡给出「重试」入口，错误进控制台；存档本身不受影响。 */
      let card;
      try {
        card = this.homeCard();
      } catch (err) {
        console.error("homeCard 渲染失败", err);
        card = {
          act: "advance",
          html: '<div class="ec-card card-spread">' +
            (window.EventCards && EventCards.cardHeadHtml ? EventCards.cardHeadHtml("界面提示") : '<div class="ec-cardhead"><span class="ec-tag">界面提示</span></div>') +
            '<div class="ec-art" style="background-image:url(assets/comic/ec_stadium.webp)"></div>' +
            '<div class="ec-title">界面渲染出错</div>' +
            '<div class="ec-body">内容渲染失败，但你的存档是安全的。点下方按钮重试；若反复出现，请退出重进或截图反馈。</div>' +
            '<div class="ec-opts"><button class="btn btn-primary ec-opt" id="hc-go">重试 ▸</button></div></div>',
        };
      }
      m.innerHTML = card.html;
      this.renderDock();
      this.bindHomeCard(card);
      m.scrollTop = 0;
    },

    /** 决定主页当前该显示哪张卡 */
    homeCard() {
      const d = State.data;
    const wrap = (k, artName, title, body, opts) =>
      '<div class="ec-card card-spread">' +
      (window.EventCards && EventCards.cardHeadHtml ? EventCards.cardHeadHtml(k) : '<div class="ec-cardhead"><span class="ec-tag">' + esc(k) + "</span></div>") +
      /* ★ P293（SR-022 收口）：artName 补 P226 同口径白名单（此前裸拼），不合规回默认图 */
      '<div class="ec-art" style="background-image:url(assets/comic/' + (/^[a-z0-9_]{1,40}$/i.test(artName) ? artName : "ec_goal") + '.webp)"></div>' +
        '<div class="ec-title">' + title + "</div>" +
        '<div class="ec-body">' + body + "</div>" +
        '<div class="ec-opts">' + opts + "</div></div>";

      if (d.retired) {
        return { act: "retired", html: wrap("生涯 · 终章", "ec_stadium", "生涯已结束",
          "你已经踢完了最后一场比赛。", '<button class="btn btn-ghost ec-opt" id="hc-go">查看生涯荣誉 ▸</button>') };
      }

      /* ★★ P267（用户反馈「国家队比赛没有文字直播和射门小游戏」根因）：
         休赛期中的**比赛日**必须优先渲染比赛日卡，不能被 NationDev 休赛期卡遮挡。
         · 背景：亚洲杯正赛（1 月）、世预赛部分窗口（11 月）、部分友谊赛窗口都落在
           中超休赛期（11 月上 ~ 次年 3 月上）内。旧版休赛期卡无条件接管主页 →
           「结束休赛期」停在比赛日后 refresh 又渲染回休赛期卡（死循环）→
           比赛永远进不了赛前卡 → 等 7 天宽限被 INTL.autoSettleOverdue 静默结算
           —— 玩家视角正是「国家队比赛没有直播、没有小游戏，只出结果」。
         · 修法：offseason 且 todayFx 存在时走比赛日卡（act="advance"）；
           打完比赛结算后日期仍在休赛期 → 主页自然回到 NationDev 卡，衔接不变。 */
      const _offFx = (window.SeasonSystem && SeasonSystem.fixtureToday(State)) || null;
      if (d.offseason && window.NationDev && NationDev.homeCardHtml && !_offFx) {
        return { act: "offseason", html: NationDev.homeCardHtml(State) };
      }

      const todayFx = _offFx;
      if (todayFx) {
        const fm = todayFx.match || todayFx;
        const isMyHome = fm.home.id === d.clubId || fm.home.id === "nat_中国";
        const opp = isMyHome ? fm.away : fm.home;
        const comp = todayFx.type === "cup" ? "国内杯赛"
          : (todayFx.type === "cc" || todayFx.type === "cc_ko" || todayFx.type === "scc") ? (todayFx.comp || "洲际赛场")
          : todayFx.match ? (todayFx.type === "intl" ? (todayFx.comp || "国家队比赛") : "联赛第" + todayFx.round + "轮")
          : (todayFx.comp || "国家队比赛");   /* ★ P280：国家队比赛日卡直用真实赛事名（世界杯决赛/世预赛/亚洲杯）——旧版恒显「国家队比赛」，大赛存在感为零（玩家实测） */
        const isBigIntl = todayFx.type === "intl" && /世界杯|亚洲杯|世预赛|附加赛/.test(todayFx.comp || "");
        const imp = SeasonSystem.matchImportance(State, todayFx);
        /* ★ P100-A1（Q6 默认全手动）：勾选表优先——勾了「跳过」显示跳过完赛；
           ★★ P168（用户拍板「进入比赛前都要有选项界面」）：本卡 = **唯一的赛前选择界面**。
           · 未勾选 → 主按钮「进入比赛 ▸」（点击写 matchPlan[key]="live" 确认后开打），
             次按钮「跳过本场 ▸」（写 sim 静默完赛）——**每场比赛必经此卡**；
           · 已勾 sim → 主按钮「跳过完赛 ▸」+ 次按钮「亲自出战 ▸」（改写 live）；
           · 已确认 live（点过进入比赛但未打完，如中途退出）→ 同未勾选形态；
           · 旧 autoReady「自动完赛 ▸」默认（keySimUnlocked+autoSim 默认勾选器）随
             gameloop decide 的 autoOn 一并退役——运行时不再读这两个字段。 */
        const planned = !!(window.GameLoop && d.matchPlan && d.matchPlan[GameLoop.matchPlanKey(State, todayFx)] === "sim");
        let body = (isMyHome ? "主场" : "客场") + "　·　对手实力 " + opp.strength +
          (isBigIntl ? '<br><b style="color:var(--gold)">' + esc(todayFx.comp) + " · 国家队正式比赛</b>" : "") +
          (imp.key ? "<br><b style='color:var(--gold)'>" + esc(imp.reason) + "</b>" : "<br>普通场") +
          (planned ? "<br><span class='dim12'>已在赛程中勾选「跳过本场」（可点下方亲自出战反悔）</span>" : "");
        let label = "进入比赛 ▸";
        if (d.injuryDays > 0) {
          body += "<br>" + (d.injuryType ? "诊断：" + esc(d.injuryType) + "。" : "") + "带伤推进将自动养伤，缺席场次由队友出战（战绩按阵容真实模拟）。";
          label = "带伤推进 ▸";
        } else if (planned) label = "跳过完赛 ▸";
        else if (imp.key) label = "开赛 ▸";
        let opts = '<button class="btn btn-primary ec-opt" id="hc-go">' + label + "</button>";
        /* ★ P100-A1 修订（selrt 实测暴露）：焦点战同样给「跳过本场」—— Q6 默认全手动 =
           玩家对**所有**场次都有选择权（跳过 = 从当前比分继续模拟，与场次重要性无关）。
           ★ P168：所有未勾 sim 的场次次按钮恒为「跳过本场 ▸」（赛前二选一，与 decide 的
             match-card/live/sim 三态一一对应）；勾了 sim 的场次给「亲自出战 ▸」反悔。 */
        if (d.injuryDays <= 0 && planned) {
          opts += '<button class="btn btn-ghost ec-opt" id="hc-live">亲自出战 ▸</button>';
        } else if (d.injuryDays <= 0) {
          opts += '<button class="btn btn-ghost ec-opt" id="hc-skip">跳过本场 ▸</button>';
        }
        return {
          act: "advance",
          fx: todayFx,   // ★ P168：比赛日卡带赛程引用 → bindHomeCard 的「进入比赛」写 live 确认
          html: wrap("比赛日 · " + comp, "ec_stadium", "vs " + esc(opp.name), body, opts),
        };
      }

      /* 非比赛日 */
      const nf = SeasonSystem.nextFixture(State);
      let body = "日程推进中。";
      if (nf) {
        const nm = nf.match || nf;
        const opp = nm.home.id === d.clubId ? nm.away : nm.home;
        body = "下一场：<b>vs " + esc(opp.name) + "</b>　·　" + (nf.day - d.dayIndex) +
          " 天后<br>非比赛日自动训练——每次 +" + ((window.Training && Training.dailyExpPreview) ? Training.dailyExpPreview(State) : CONFIG.DAILY_TRAINING.exp) + " 经验入池，在「属性 → 成长」页手动加点。";
      }
      /* P100-B4：转会窗开放期 → 非比赛日给「冬窗/夏窗转会」入口 */
      const canWinter = window.Transfer && Transfer.windowOpen && Transfer.windowOpen(d);
      const winterBtn = canWinter
        ? '<button class="btn btn-ghost ec-opt" id="hc-winter">转会窗开放 · 立即操作 ▸</button>'
        : "";
      return {
        act: "advance",
        html: wrap("日程 · 非比赛日", "ec_stadium", "训练日常", body,
          '<button class="btn btn-primary ec-opt" id="hc-go">推进 ▸</button>' +
          (winterBtn ? '<div style="margin-top:8px">' + winterBtn + "</div>" : "") +
          '<div class="row" style="gap:8px;margin-top:8px">' +
          '<button class="btn btn-ghost ec-opt" id="hc-nxmatch" style="flex:1.4">快进到下一场比赛</button>' +
          '<button class="btn btn-ghost ec-opt" id="hc-fw30" style="flex:1">快进 30 天</button></div>' +
          '<div class="dim12" style="margin-top:6px">「推进」和「快进到下一场比赛」会停在比赛日的赛前卡等你选择；「快进 30 天」期间的比赛自动模拟完赛，结束后给汇总战报。底栏「赛程」可打开赛事日历逐场勾选跳过。</div>'),
      };
    },

    bindHomeCard(card) {
      const self = this;
      if (card.act === "offseason") {
        if (window.NationDev && NationDev.bindHomeCard) NationDev.bindHomeCard(State, () => self.renderHome());
        return;
      }
      const go = $("#hc-go");
      if (!go) return;
      go.onclick = UIkit.guard(() => {
        if (card.act === "retired") { self._lifeTab = "honor"; self.openTab("life"); return; }
        /* ★ P168：比赛日主按钮 = 在赛前卡上确认——未勾选时「进入比赛/开赛/带伤推进」
           写 matchPlan[key]="live" 后推进，decide 读到 planned==="live" → match-live 开打。
           ★★ P250（玩家反馈「勾了跳过到比赛日还开打」根因）：勾了 sim 的场次主按钮
           文案是「跳过完赛 ▸」（L247），但本 handler 此前**无条件写 "live"**——玩家
           点「跳过完赛」却被改写 live 直接开打（文案与行为相反）。现按 planned 分流：
           已勾 sim → 维持 sim（跳过完赛，match-sim 静默）；未勾 → 写 live（开打）。
           非比赛日卡（无 fx）直接推进。 */
        if (card.fx && window.GameLoop) {
          const d = State.data;
          d.matchPlan = d.matchPlan || {};
          const k = GameLoop.matchPlanKey(State, card.fx);
          d.matchPlan[k] = d.matchPlan[k] === "sim" ? "sim" : "live";
          State.save();
        }
        self.advance();
      }, "卡片行动");
      /* P100-A1：比赛日次按钮——「跳过本场」= 写勾选表后推进；「亲自出战」= 改写 live 确认开打 */
      const skip = $("#hc-skip");
      if (skip) skip.onclick = UIkit.guard(() => {
        const d = State.data;
        const fx = SeasonSystem.fixtureToday(State);
        if (fx && window.GameLoop) {
          d.matchPlan[GameLoop.matchPlanKey(State, fx)] = "sim";
          State.save();
        }
        self.advance();
      }, "跳过本场");
      const live = $("#hc-live");
      if (live) live.onclick = UIkit.guard(() => {
        const d = State.data;
        const fx = SeasonSystem.fixtureToday(State);
        if (fx && window.GameLoop) {
          /* ★ P168：原语义是 delete（撤销勾选后回推进）——现在未勾选会停在赛前卡，
             直接改写 "live" 才是"亲自出战"的完整语义（一步确认开打，不再多绕一跳）。 */
          d.matchPlan[GameLoop.matchPlanKey(State, fx)] = "live";
          State.save();
        }
        self.advance();
      }, "亲自出战");
      /* P100-B4：赛季中转会窗入口（欧洲冬窗 1 月 / 中超夏窗 6-7 月） */
      const wc = $("#hc-winter");
      if (wc) wc.onclick = UIkit.guard(() => {
        if (window.NationDev && NationDev.openWinterCard) NationDev.openWinterCard(State, () => self.renderHome());
      }, "转会窗");
      /* P100-A1：非比赛日快进档位——途中未勾选的比赛停下。
         ★ P101（用户拍板）：「快进 7 天」退役 → 「快进到下一场比赛」：
         玩家要的是任务导向导航（直达下一场未勾选比赛），不是拍脑袋的天数。
         途中公告/日常卡（≥24 天间隔，拦截极少）照常停下，均为强制交互。 */
      const fw = n => () => {
        if (window.GameLoop) GameLoop.advanceDays(n);
        else UIkit.errToast("阶段机缺失");
      };
      const nx = $("#hc-nxmatch");
      if (nx) nx.onclick = UIkit.guard(() => {
        if (window.GameLoop) GameLoop.advanceToMatch();
        else UIkit.errToast("阶段机缺失");
      }, "快进到下一场比赛");
      const f30 = $("#hc-fw30");
      if (f30) f30.onclick = UIkit.guard(fw(30), "快进 30 天");
    },

    /* 底栏五格（属性 / 俱乐部 / 赛程 / 国家队 / 简况）——推进由主页卡片承担，底栏不再放「继续」
       ★ P103：荣誉→简况分页；排名→俱乐部分页；国家队页取代荣誉格 */
    renderDock() {
      const nav = $("#hub-dock");
      nav.innerHTML = "";
      const TABS = [
        ["attr", "属性", "dumbbell"],
        ["club", "俱乐部", "shirt"],
        ["sched", "日历", "calendar"],
        ["nation", "国家队", "flag"],
        ["life", "简况", "city"],
      ];
      TABS.forEach(t => {
        const b = document.createElement("button");
        b.className = "dock-tab" + (this.tab === t[0] ? " on" : "");
        b.innerHTML = '<span class="dock-ico">' + ICO(t[2], 18) + "</span><span class='dock-lb'>" + t[1] + "</span>";
        b.onclick = UIkit.guard(() => this.openTab(this.tab === t[0] ? null : t[0]), t[1]);
        nav.appendChild(b);
      });
    },

    /**
     * P51：底栏是「查看入口」而非「页面切换」——页面以覆盖层弹出，主页卡片原地保留。
     * kind 为 null 或与当前页相同 → 收起覆盖层，回到那张卡继续推进时间。
     */
    openTab(kind) {
      if (!kind || kind === this.tab) { this.closeSheet(); return; }
      this.tab = kind;
      const sheet = $("#hub-sheet");
      const dock = $("#hub-dock");
      // 覆盖内容区但露出底栏：点其它格可直接换页，点同一格收起
      if (sheet && dock) sheet.style.bottom = dock.offsetHeight + "px";
      const t = $("#sheet-title");
      if (t) t.textContent = SHEET_TITLE[kind] || "";
      if (sheet) sheet.classList.add("open");
      this.renderSheet();
      this.renderDock();
    },

    /** 重渲染当前覆盖层页面（页面内操作后刷新用） */
    renderSheet() {
      const body = $("#hub-sheet-body");
      if (!this.tab || !body) return;
      if (this.tab === "attr") this.attrPage(body);
      else if (this.tab === "club") this.clubPage(body);
      else if (this.tab === "sched") this.schedPage(body);
      else if (this.tab === "nation") this.nationPage(body);
      else if (this.tab === "life") this.lifePage(body);
      body.scrollTop = 0;
    },

    /** 收起覆盖层 → 回到主页卡片（卡片从未被替换，状态完好，可继续推进） */
    closeSheet() {
      this.tab = null;
      const sheet = $("#hub-sheet");
      if (sheet) sheet.classList.remove("open");
      this.renderDock();
      // 页内可能改过数据（加点 / 广告福利 / 置业）：普通主页卡刷新一次；
      // 若是未处理完的内嵌卡（事件卡/章回卡），原样保留避免状态丢失
      if (!this._hostCard) this.renderHome();
    },

    advance() {
      if (window.GameLoop) { GameLoop.advance(); return; }
      UIkit.errToast("阶段机缺失");
    },

    /** 休赛期快进（★★ P197 重做：一次点到底）
     *  用户拍板：休赛期 = 联赛一直未开始的阶段，「结束休赛期」就该一次跳到新赛季开打，
     *  而不是每遇一条公告/生活卡就弹回休赛期卡反复点 4-5 次（旧版一遇事件即 break）。
     *  新版语义：沿途事件**收集不中断**——纯播报类效果在生成时已结算（rollLifeEvent/晚到队列
     *  内部 applyEffects），选择类卡照常在卡上交互；落点后按原顺序补呈，最后 refresh 收口。
     *  只有真实比赛日（新赛季首战 / 休赛期中的国家队比赛日）才停下交给玩家亲自出战。 */
    skipOffseason() {
      const d = State.data;
      if (!d.offseason) { this.refresh(null); return; }          // 防御：不在休赛期（按钮不可达，双保险）
      let guard = 0;
      const evs = [];
      while (guard++ < 400) {
        if (d.retired || Career.forcedRetirement(State)) { Flow.retire(true); return; }
        const fx = SeasonSystem.fixtureToday(State);
        if (fx) break;                                             // 比赛日：交给玩家亲自出战
        if (d.injuryDays <= 0) Training.dailyTrain(State);          // 休赛期每日自动训练（与推进一致）
        const ev = Career.advanceDay(State);
        if (ev) evs.push(ev);                                      // ★ P197：收集不中断（含「新赛季集结」卡）
        if (!d.offseason) break;                                   // 新赛季开始
      }
      State.save();
      const self = this;
      const step = i => {
        if (i >= evs.length) { self.refresh(null); return; }
        self.showEventModal(evs[i], () => step(i + 1));
      };
      step(0);
    },

    /**
     * GameLoop 批量推进收口 —— P56 起同时是「卡片链」入口。
     * 顺序：战报卡 → 静默场事件卡 → 日常卡 → （refresh 内的）生活事件 → 章节检查。
     * rows 为空（本次只有日常卡）时自动跳过战报卡。
     */
    showDigest(rows, ev, extra) {
      const opts = extra || {};
      const self = this;
      const steps = [];
      if (rows && rows.length) steps.push(done => self.digestCard(rows, done));
      if (opts.silentCtxs && opts.silentCtxs.length && window.EventCards) {
        steps.push(done => EventCards.afterSilentBatch(State, opts.silentCtxs, done));
      }
      if (opts.dailyCard && window.EventCards) {
        steps.push(done => EventCards.showDaily(State, opts.dailyCard, done));
      }
      const finish = () => {
        UIkit.show("hub");
        // 章节检查挂在 refresh 的完成回调上：若 refresh 开了生活事件卡，
        // 必须等它关闭后再判章节，否则会把生活事件卡直接覆盖掉
        self.refresh(ev || null, () => { if (window.Chapters) Chapters.check(); });
      };
      let i = 0;
      const next = () => {
        if (i >= steps.length) { finish(); return; }
        const fn = steps[i++];
        try { fn(next); } catch (err) { console.warn("card chain", err); next(); }
      };
      next();
    },

    /** 自动完赛战报卡（P52/P53：漫画卡形态；★P170 增强：平负/球队进失球/场均评分/扑救） */
    digestCard(rows, onDone) {
      const dash = 'border-bottom:1px dashed var(--divider)';
      const wins = rows.filter(x => x.res === "胜").length;
      const draws = rows.filter(x => x.res === "平").length;
      const losses = rows.filter(x => x.res === "负").length;
      const goals = rows.reduce((a, x) => a + (x.goals || 0), 0);
      const assists = rows.reduce((a, x) => a + (x.assists || 0), 0);
      const saves = rows.reduce((a, x) => a + (x.saves || 0), 0);
      /* ★ P170：球队进失球（我方视角）+ 个人场均评分（仅出场场次） */
      const teamGf = rows.reduce((a, x) => a + ((x.myHome !== undefined) ? (x.myHome ? x.home : x.away) : 0), 0);
      const teamGa = rows.reduce((a, x) => a + ((x.myHome !== undefined) ? (x.myHome ? x.away : x.home) : 0), 0);
      const rated = rows.filter(x => x.played && typeof x.rating === "number");
      const avgRating = rated.length ? (rated.reduce((a, x) => a + x.rating, 0) / rated.length) : 0;
      /* ★ P214（玩家反馈「0:4 胜」歧义）：战报行改足球计分法——主队名 前、比分（主:客）、客队名 后。
         新 row 自带 homeName/awayName（settlement 单源）；旧形态 row 用 myHome+oppName+我方队名推导。 */
      const _myClub = (window.teamById && State.data.clubId && teamById(State.data.clubId)) || null;
      const myTeamName = (_myClub && _myClub.name) || "我的球队";
      const rowsHtml = rows.map(x => {
        const hn = x.homeName || (x.myHome ? myTeamName : (x.oppName || "对手"));
        const an = x.awayName || (x.myHome ? (x.oppName || "对手") : myTeamName);
        return '<div style="font-size:13px;line-height:2.05;' + dash + '">' +
        x.compLabel + "　<b>" + esc(hn) + " " + x.home + " : " + x.away + " " + esc(an) + "</b>" +
        (x.pens ? "（点球 " + x.pens.my + ":" + x.pens.opp + (x.pens.won ? " 胜" : " 负") + "）" : "") +
        "　" + x.res +
        (x.played ? "　评分 <b style='color:var(--gold)'>" + x.rating + "</b>" +
          (x.goals || x.assists ? "　" + x.goals + "球" + x.assists + "助" : "") + (x.motm ? " MVP" : "") : "　未出场") +
        (x.injured ? "　<span style='color:var(--danger)'>伤病休战 " + x.injured + " 天</span>" : "") +
        "</div>";
      }).join("");
      const statLine =
        "共 <b>" + rows.length + "</b> 场　·　" +
        "<span style='color:var(--ok)'>" + wins + " 胜</span>　" + draws + " 平　" +
        "<span style='color:var(--danger)'>" + losses + " 负</span>" +
        "　·　球队进球 <b>" + teamGf + "</b> / 失球 <b>" + teamGa + "</b>";
      const mineLine = "个人：进球 <b>" + goals + "</b>　助攻 <b>" + assists + "</b>" +
        (rated.length ? "　场均评分 <b style='color:var(--gold)'>" + avgRating.toFixed(1) + "</b>" : "") +
        (saves > 0 ? "　扑救 <b>" + saves + "</b>" : "");
      const html = (window.CardHost && CardHost.card ? CardHost.card({
        kicker: "战报 · 自动完赛",
        art: "ec_stadium",
        title: "自动完赛战报",
        body: statLine + "<br><span class='dim12' style='font-size:12px'>" + mineLine + "</span>",
        extra: '<div class="panel alt" style="margin-top:0">' + rowsHtml + "</div>",
        opts: '<button class="btn btn-primary ec-opt" id="dg-ok">继续 ▸</button>',
      }) : "<h3>自动完赛战报</h3>" + statLine + "<br>" + mineLine + rowsHtml + '<button class="btn btn-primary mt-12" id="dg-ok">继续 ▸</button>');
      CardHost.show(html, { dismissable: false });
      UIkit.$("#dg-ok").onclick = UIkit.guard(() => { CardHost.close(); onDone && onDone(); }, "战报继续");
    },

    /** 生活事件（a/b 选择或纯文本）——契约对齐旧壳：choices[].text + effects/hidden/delayed */
    showEventModal(ev, done) {
      /* P53：生活事件由弹窗改为内嵌漫画卡（用户指出「不要有弹窗版本的事件」）。
         按事件文案自动路由插画（CardHost.artOf），选择后同样给回应态。 */
      const title = ev.title || "生活事件";
      const kicker = "生活 · " + (ev.cat || (ev.scandal ? "风波" : "场外"));
      const art = (window.CardHost && CardHost.artOf) ? CardHost.artOf(title + " " + (ev.text || "")) : "ec_city";
      const artEl = '<div class="ec-art" style="' + CardHost.artStyle(art) + '"></div>';
      const head = CardHost.headTags(kicker);
      let html = '<div class="ec-card' + (ev.choices && ev.choices.length ? "" : " card-spread") + '">' + head + artEl +
        '<div class="ec-title">' + esc(title) + "</div>" +
        '<div class="ec-body">' + (ev.text || "") + "</div>";
      if (ev.choices && ev.choices.length) {
        html += '<div class="ec-opts">' + ev.choices.map((c, i) =>
          '<button class="btn btn-ghost ec-opt" data-i="' + i + '">' + esc(c.text) + "</button>").join("") + "</div>" +
          '<div class="ec-hint">做出选择后才能继续</div>';
      } else {
        html += '<button class="btn btn-primary mt-8" id="ev-ok">知道了 ▸</button>';
      }
      html += "</div>";
      const root = CardHost.show(html, { dismissable: false });
      const finish = note => { if (note) UIkit.toast(note, ""); };
      if (ev.choices && ev.choices.length) {
        const self = this;
        root.querySelectorAll(".ec-opt[data-i]").forEach(btn => {
          btn.onclick = UIkit.guard(() => {
            /* ★ P295（玩家反馈「选中一个选项后其他选项要置灰示意已选择」）：点击瞬间
               全组禁用+置灰（防双击双结算竞态），已选项高亮——回应态渲染前不回弹。 */
            root.querySelectorAll(".ec-opt").forEach(b2 => {
              b2.disabled = true;
              if (b2 !== btn) b2.classList.add("ec-opt-dim");
              else b2.classList.add("ec-opt-picked");
            });
            const c = ev.choices[+btn.dataset.i];
            /* ★ P259：防御归一 c.effects || c.fx —— 正约口径是 effects（Career.applyEffects），
               fx: 是 EventCards 引擎 options[] 的键名；历史上 career.js 邀约卡曾混用 fx: 导致
               选卡静默不结算（代言双确认 bug 根因）。这里兜底兼容两种键名，防未来数据再混用。 */
            const notes = Career.applyEffects(State, c.effects || c.fx || {});
            if (c.hidden) Career.applyEffects(State, c.hidden);
            if (c.delayed) {
              State.data.delayedQueue = State.data.delayedQueue || [];
              State.data.delayedQueue.push({ dueDay: State.data.dayIndex + (c.delayed.days || 7), message: c.delayed.message, effects: c.delayed.effects || {} });
            }
            State.save();
            /* 回应态：保留插画与头部，卡片不塌陷 */
            const chips = notes.length
              ? '<div class="ec-fx">' + notes.map(n => '<span class="fx-chip ' + (n.indexOf("-") >= 0 ? "neg" : "") + '">' + esc(n) + "</span>").join("") + "</div>"
              : "";
            root.querySelector(".ec-card").innerHTML =
              head + artEl +
              '<div class="ec-title" style="font-size:18px">' + esc(title) + " · 你的选择</div>" +
              '<div class="ec-response"><b>' + esc(c.text) + "</b>" +
              (c.response ? "<br>" + c.response : "") + "</div>" + chips +
              '<div style="flex:1"></div>' +
              '<button class="btn btn-primary" id="ev-go">继续 ▸</button>';
            finish(notes.length ? notes.join("，") : null);
            UIkit.$("#ev-go").onclick = UIkit.guard(() => { CardHost.close(); done && done(); }, "事件继续");
          }, "事件选择");
        });
      } else {
        UIkit.$("#ev-ok").onclick = UIkit.guard(() => { CardHost.close(); done && done(); }, "事件确认");
      }
    },

    /** P48：国家队赛程 + 世界杯概览（世界杯块与 v1 共用 INTL.wcSummaryHtml）
     *  ★ P219：改用 Calendar.intlFixturesOf 单源展平——补上原实现漏掉的**国际友谊赛**
     *  （friendlyFixtures 此前不进「国家队赛程」面板），并按历法日期统一排序。 */
    intlSchedHtml() {
      const rows = (window.Calendar && Calendar.intlFixturesOf ? Calendar.intlFixturesOf(State) : []).slice()
        .sort((a, b) => ((a.y || 0) - (b.y || 0)) || (a.m - b.m) || (a.dd - b.dd));
      let html = "";
      if (rows.length) {
        html += '<div class="panel"><div class="panel-title">国家队赛程（' + rows.length + "）</div>" +
          rows.slice(0, 10).map(r => '<div class="list-item"><div><div class="li-title">' + esc(r.comp) + " vs " + esc(r.opp || "?") +
            (r.meHome ? "（主）" : "（客）") +
            '</div><div class="dim12">' + (r.y ? r.y + "-" : "") + r.m + "-" + r.dd + "</div></div></div>").join("") + "</div>";
      } else {
        html += '<div class="panel"><div class="panel-title">国家队赛程</div><div class="dim12">当前没有国家队比赛窗口。</div></div>';
      }
      if (window.INTL && INTL.wcSummaryHtml) html += INTL.wcSummaryHtml();
      return html;
    },

    openOffseason() {
      UIkit.show("hub");
      const d = State.data;
      /* 休赛期首次进入：先出一张原有休赛期叙事卡（不消耗安排次数）；
         之后主页直接显示「休赛期日程卡」，由 NationDev 的卡片流调度四个环节 */
      const plan = window.NationDev ? NationDev.ensurePlan(d) : null;
      if (plan && !plan.narration) {
        plan.narration = true;
        State.save();
        if (window.EventCards && EventCards.onOffseason) {
          EventCards.onOffseason(State, {}, () => this.refresh(null));
          return;
        }
      }
      this.refresh(null);
    },

    /**
     * P50：注入内嵌卡片渲染器 —— 漫画事件卡 / 章回卡 / 休赛期环节卡
     * 统一渲染在主页卡片区（与篮球生涯一致），不再用弹窗遮住界面
     */
    installCardHost() {
      if (!window.CardHost || CardHost._v2Installed) return;
      CardHost._v2Installed = true;
      const self = this;
      CardHost.setInline({
        show(html) {
          /* ★★★ P99-FLAKY 修复（真 P0）：原实现**无条件**切回主页 ——
             连"比赛正在进行"时也切。后果是一条完整的死锁链：
               ① `show(hub)` 把 `screen-match` 加 `.hidden`
               ② 但比赛引擎**还在后台跑**（没人叫停 `MatchUI`）
               ③ `tick()` 随后的 `step.keyMoment` / `step.duelMoment` 会把
                  关键抉择/对弈渲染进 `#m-controls`
               ④ 而 `#m-controls` 在已隐藏的 match 屏里 → `getClientRects()` 全为 0
               ⑤ **玩家既看不到、也点不到** → 比赛永远等不到选择 → 卡死
             实测铁证：`show(match)`（main.js:60 / match.js:24）之后 **仅 56ms**
             就被 `hub.js:444` 的 `show(hub)` 顶掉；随后 `#m-controls` 里 4 个关键抉择
             选项的 `rects` 全为 0，`MatchUI.play()` 一调就能救回来（因为引擎本来是好的）。
             ★ 修法：**比赛进行中不切屏**。卡片照旧渲染进 `#hub-main`（不影响比赛），
               比赛结束后照常走「结算 → hub」，届时卡片自然可见。
             ★ 代价（已知、可见）：比赛途中触发的卡会被"延后看见"。这里显式打 warn 留痕，
               便于日后确认"卡是否被丢掉"——不静默。 */
          const inMatch = !!(window.MatchUI && MatchUI.isRunning && MatchUI.isRunning());
          if (inMatch) {
            try { if (window.console && console.warn) console.warn("[CardHost] 比赛进行中，卡片不切屏（延后到赛后可见）"); } catch (e) { }
          } else if (window.UIkit && UIkit.show) {
            UIkit.show("hub");
          }
          self._hostCard = true;                    // 标记：主页当前是「卡」，别被覆盖层收尾刷掉
          self.tab = null;
          const sheet = $("#hub-sheet");
          if (sheet) sheet.classList.remove("open");
          self.renderDock();
          const m = $("#hub-main");
          m.innerHTML = html;
          m.scrollTop = 0;
          return m;
        },
        close() {
          self.renderHome();                        // 内部会清 _hostCard
        },
      });
    },

    /** 设置入口（原「更多」二级菜单已取消——导航由底栏五格承担；热议/配色为右上角按钮） */
    bindHudButtons() {
      const xb = $("#btn-exit");
      if (xb && !xb._bound) {
        xb._bound = true;
        xb.onclick = UIkit.guard(() => { State.save(true); UIkit.toast("已存档，返回主界面"); Menu.render(); }, "返回主界面");
      }
      const sb = $("#btn-settings");
      if (sb && !sb._bound) {
        sb._bound = true;
        sb.onclick = UIkit.guard(() => this.settingsPanel(), "设置");
      }
      /* 热点资讯热议：右上角按钮 → 帖子流（自 v1 btn-news 移植） */
      const nb = $("#btn-news");
      if (nb && !nb._bound) {
        nb._bound = true;
        nb.onclick = UIkit.guard(() => NewsUI.open(), "热点资讯热议");
      }
      /* P126 转会申请：右上角按钮 → 转会面板（原配色入口退役——主题全局锁定琥珀金）。
         管道复用 P104-B4：listingGate 门 + evaluateRequest/evaluatePressure（交互耗 R，渲染零 R） */
      const tb = $("#btn-transfer");
      if (tb && !tb._bound) {
        tb._bound = true;
        tb.onclick = UIkit.guard(() => this.transferRequestPanel(), "转会申请");
      }
      /* P51：覆盖层两个关闭口（头部 ✕ / 底部「收起继续推进」） */
      const self = this;
      ["#sheet-close", "#sheet-foot-close"].forEach(sel => {
        const b = $(sel);
        if (b && !b._bound) { b._bound = true; b.onclick = UIkit.guard(() => self.closeSheet(), "收起页面"); }
      });
      if (!this._sheetResizeBound) {
        this._sheetResizeBound = true;
        window.addEventListener("resize", () => {
          const sheet = $("#hub-sheet"), dock = $("#hub-dock");
          if (sheet && dock && sheet.classList.contains("open")) sheet.style.bottom = dock.offsetHeight + "px";
        });
      }
    },

    /* ── 页签通用 ── */
    finishPage(m, html) {
      /* ★ 2026-09-16（用户反馈）：页内 rerender（升级技能/切类目/广告回调）整页 DOM 重建
         后原来直接 scrollTop=0 → 视图跳顶。改为保存并恢复；页签切换路径由
         renderSheet() 末尾的 scrollTop=0 归零（在 finishPage 之后执行，归零语义不变）。 */
      const keep = m.scrollTop;
      m.innerHTML = html;
      this.renderDock();
      m.scrollTop = keep;
    },
    pageHead(title) {
      return '<div class="page-head">' + esc(title) + "</div>";
    },

    /* ── P129 注释按钮：长说明收纳到行内「?」，点击模态看全文 ──
       key 固定（同一说明复用同 key）→ HINTS 注册表不随重渲染膨胀；
       inline=true 用于行内/按钮旁（margin 收窄）。 */
    HINTS: {},
    hintBtn(key, title, body, inline) {
      this.HINTS[key] = { title, body };
      return '<button class="hint-btn' + (inline ? " on-inline" : "") + '" data-hint="' + key + '" title="查看说明">?</button>';
    },
    bindHints(root) {
      const self = this;
      (root || document).querySelectorAll("[data-hint]").forEach(b => {
        if (b._hintBound) return;
        b._hintBound = true;
        b.onclick = UIkit.guard(() => {
          const h = self.HINTS[b.dataset.hint];
          if (!h) return;
          UIkit.modal("<h3>" + UIkit.esc(h.title) + "</h3><div style='font-size:13px;line-height:1.9'>" + h.body + "</div><button class='btn btn-ghost btn-block mt-12' id='hint-cls'>知道了</button>");
          const c = $("#hint-cls");
          if (c) c.onclick = () => UIkit.closeModal();
        }, "查看说明");
      });
    },

    /* ── 属性（自 v1 trainTab 移植；P102 重构：sheet 内分页切换） ──
       ★ 用户反馈 2026-09-16：原单页从球员卡一路铺到属性详情，拉得太长。
       现改为**页内分页**（成长 / 性格 / 技能 / 球探），球员卡+天赋恒在页顶。
       状态存 this._attrTab（默认成长）；分页切换只重渲染 sheet 体。 */
    /* ★ P115：页签重构 —— 「球探」改名「位置」（展示全部位置熟练度，原只显示现位置）；
       新增真「球探」页签（俱乐部竞争 + 国家队竞争力的真实数据报告）。 */
    /* ★ P153：新增「体能」页签 —— 疲劳度系统有真实作用链（实战状态打折 / 高疲劳抬伤病
       风险与伤停天数 / 每日恢复与赛后累积），从简况福利区迁入独立的下属页面管理。 */
    ATTR_TABS: [["grow", "成长"], ["trainer", "训练师"], ["char", "性格"], ["skill", "技能"], ["pos", "位置"], ["scout", "球探"]],
    attrPage(m) {
      const d = State.data;
      const tt = d.traits || {};
      const tab = this.ATTR_TABS.some(t => t[0] === this._attrTab) ? this._attrTab : "grow";
      /* ★ P114：等级徽章（Skills.levelOf 单源；升级由生涯累计经验驱动，每级 +2 属性点 +1 技能点） */
      const _lv = (window.Skills && Skills.levelOf) ? Skills.levelOf(d) : 1;
      let html = this.pageHead("属性") +
        '<div class="panel player-card"><div class="row" style="gap:10px">' + posAvatar(d.player.position) +
        '<div><div class="row" style="gap:8px"><span class="ovr-big">' + PlayerSystem.overall(d.player, { morale: d.morale }) + "</span>" +
        '<span class="pos-badge">' + esc(d.player.position) + "</span>" +
        '<span class="pos-badge gold" title="等级：由生涯累计经验驱动，每升 1 级 +2 属性点 +1 技能点">Lv.' + _lv + "</span></div>" +
        '<div style="font-size:17px;font-weight:800">' + esc(d.player.name) + ' <span class="pos-badge gold">' + (d.player.number || 9) + " 号</span></div>" +
        '<div class="dim12">' + esc(d.player.nationality || "") + " · " + d.player.age + "岁 · " + esc(((window.Youth && Youth.clubViewOf && Youth.clubViewOf(d)) || { name: "?" }).name) + "</div></div></div>" +
        '<div class="stat-row"><span>士气 <b>' + Math.round(d.morale || 0) + "</b></span>" +
        '<span>存款 <b>' + Career.fmtMoney(d.money) + "</b></span>" +
        ((d.injuryDays || 0) > 0 ? '<span class="bad">伤病 <b>' + d.injuryDays + " 天</b></span>" : "") +
        "</div>" +
        /* ★ P114/P125：升级进度条（下一级还差多少经验）——奖励说明另起一行，不再挤在 30px 数值格里 */
        '<div class="bar-row mt-8"><span class="b-label">升级进度</span><div class="b-track"><div class="b-fill" style="width:' + Math.min(100, Math.round(((d.expTotal || 0) % (CONFIG.LEVEL ? CONFIG.LEVEL.EXP_PER_LEVEL : 80000)) / (CONFIG.LEVEL ? CONFIG.LEVEL.EXP_PER_LEVEL : 80000) * 100)) + '%;background:#f5c542"></div></div>' +
        '<span class="b-val" style="width:auto;font-size:11px;white-space:nowrap">还差 ' + Math.ceil(CONFIG.LEVEL ? CONFIG.LEVEL.EXP_PER_LEVEL - ((d.expTotal || 0) % CONFIG.LEVEL.EXP_PER_LEVEL) : 0) + " 经验</span></div>" +
        '<div class="dim12" style="margin-top:3px">升级奖励：<b>属性点 +2</b>（入经验池，下方手动加点）· <b>技能点 +1</b></div></div>' +
        (window.TAL && d.talents && d.talents.length
          ? '<div class="talent-row">' + d.talents.map(id => {
            const t = TAL.byId[id]; if (!t) return "";
            /* ★ P113 五档：档位读 d.talentTiers（tierOf 单源；旧档缺省 = 铜档），
               desc 走 descOf 按档渲染数值 —— 固定文案 t.desc 已不存在于新 POOL。 */
            const tier = TAL.TIER[TAL.tierOf(d, id)] || TAL.TIER.bronze;
            /* ★ P168：档位徽章实底白字（与选天赋卡同口径——五档明度一眼可分）
               ★ P295（玩家反馈「点了不知道天赋效果」）：徽章可点 → 弹天赋详情
               （当前档效果 + 下一档预览）。手机端没有 hover，title 属性形同虚设。 */
            return '<span class="talent-chip" data-taltap="' + id + '" title="' + esc(TAL.descOf(id, TAL.tierOf(d, id))) + '" style="background:' + tier.solid + ';border-color:' + tier.solid + ';color:#fff;font-weight:800">' + esc(t.name) + " · " + tier.name + "</span>";
          }).join("") + "</div>"
          : "") +
        /* 分页按钮条（页内切换；样式与既有类目切换同源） */
        '<div class="row" style="gap:6px;flex-wrap:wrap;margin:0 0 10px">' +
        this.ATTR_TABS.map(t => '<button class="btn btn-sm ' + (t[0] === tab ? "btn-primary" : "btn-ghost") + '" data-attrtab="' + t[0] + '">' + t[1] + "</button>").join("") +
        "</div>";

      /* ★★ P139 修复（P118 同族坑三犯）：grow 分支原用独立 `if`，trainer 起的 else-if 链
         在 tab=grow 时落进 `else` 兜底 → **成长页恒拼上球探报告**（与球探页签重复）。
         全链统一 else-if + scout 显式判断（不再靠兜底，防未来加新页签又串页）。 */
      if (tab === "grow") html += this._attrTabGrow(d);
      else if (tab === "trainer") html += this._attrTabTrainer(d);   // ★ P171：体能页签随疲劳机制退役
      else if (tab === "char") html += this._attrTabChar(d);
      else if (tab === "skill") html += this._attrTabSkill(d, tt);
      else if (tab === "pos") html += this._attrTabPos(d);
      else if (tab === "scout") html += this._attrTabScout(d);

      this.finishPage(m, html);

      const self = this;
      /* 分页切换：重渲染并归顶（页签语义 = 换一页，不保留旧页滚动） */
      self.bindHints(m);
      /* ★ P295：天赋徽章点击 → 详情弹窗（当前档效果 + 下一档预览；纯只读零 R）。
         与 #13 设置页「天赋图鉴」共用 _talentModalHtml 渲染单源。 */
      m.querySelectorAll("[data-taltap]").forEach(b => {
        b.onclick = UIkit.guard(() => {
          UIkit.modal("<h3>天赋 · " + esc(TAL.byId[b.dataset.taltap].name) + "</h3>" +
            self._talentModalHtml(State.data, b.dataset.taltap) +
            '<div class="row" style="gap:8px"><button class="btn btn-primary" id="tal-ok">知道了</button></div>');
          const ok = UIkit.$("#tal-ok");
          if (ok) ok.onclick = () => UIkit.closeModal();
        }, "天赋详情");
      });
      m.querySelectorAll("[data-attrtab]").forEach(b => {
        b.onclick = () => {
          self._attrTab = b.dataset.attrtab;
          self.attrPage($("#hub-sheet-body"));
          const body = $("#hub-sheet-body");
          if (body) body.scrollTop = 0;
        };
      });
      if (tab === "grow") {
        const rerender = () => self.attrPage($("#hub-sheet-body"));
        /* ★ P111：FM 三分类组页签（技术/精神/身体）；状态存 _attrGrp（旧 _attrCat 天然废弃回落首组） */
        m.querySelectorAll("[data-attrgrp]").forEach(b => { b.onclick = () => { self._attrGrp = b.dataset.attrgrp; rerender(); }; });
        m.querySelectorAll("[data-attrcat]").forEach(b => { b.onclick = () => { self._attrCat = b.dataset.attrcat; rerender(); }; });
        /* ★★ P109 手动加点（Training.spendOn 确定性、零 R）：+1 → 经验池扣费 → 该属性 +1（潜力上限内） */
        m.querySelectorAll("[data-spend]").forEach(b => {
          b.onclick = UIkit.guard(() => {
            const r = Training.spendOn(State, b.dataset.spend);
            UIkit.toast(r.msg, r.ok ? "gold" : "danger");
            if (r.ok) { State.save(); rerender(); }
          }, "手动加点");
        });
        /* ★★ P120：广告潜力突破 —— 单项磨到帽后看广告，该项潜力上限 +STEP
           （★ P121 每季全池 3 次；P266 起 STEP=5；Potential.adBreak 内置到帽+配额双重校验，Ads.show 成功回调才发放）。
           ★★ P189：经验突破按钮（data-expbreak）—— 花大量经验 +5 上限阶价买断（P263），
             与广告突破并列；绑定段见下方 data-expbreak（紧随本段）。 */
        m.querySelectorAll("[data-adbreak]").forEach(b => {
          b.onclick = UIkit.guard(() => {
            if (!window.Ads) { UIkit.toast("广告能力暂不可用", "red"); return; }
            if ((window.Potential && Potential.breakLeft) && Potential.breakLeft(State.data) <= 0) {
              UIkit.toast("本季突破次数已用完（每季 " + ((CONFIG.POTENTIAL && CONFIG.POTENTIAL.AD_BREAK && CONFIG.POTENTIAL.AD_BREAK.PER_SEASON) || 3) + " 次）", "red");
              return;
            }
            Ads.show("adBreak", () => {
              const r = (window.Potential && Potential.adBreak) ? Potential.adBreak(State.data, b.dataset.adbreak) : { ok: false, why: "模块缺失" };
              if (!r.ok) { UIkit.toast(r.why || "无法突破", "red"); rerender(); return; }
              State.save();
              UIkit.toast({ html: ICO("play"), text: " 潜力突破！上限 " + r.from + " → " + r.to + "，继续磨！" }, "gold");
              rerender();
            });
          }, "潜力突破");
        });
        /* ★★ P189：经验突破 —— 单项磨到帽后花大量经验把上限 +1（不限次 · 价格递增）。
           Potential.expBreak 内置到帽+总帽+余额三重校验；expBreakCost 与 UI 展示同源。 */
        m.querySelectorAll("[data-expbreak]").forEach(b => {
          b.onclick = UIkit.guard(() => {
            const r = (window.Potential && Potential.expBreak) ? Potential.expBreak(State.data, b.dataset.expbreak) : { ok: false, why: "模块缺失" };
            UIkit.toast(r.ok ? { html: ICO("up"), text: " 经验突破！上限 " + r.from + " → " + r.to + "（花 " + r.cost + " 经验）" } : (r.why || "无法突破"), r.ok ? "gold" : "red");
            if (r.ok) { State.save(); rerender(); }
          }, "经验突破");
        });
        /* ★★ P114：广告「+5 属性点」（★ P259 每季 20 次）—— expPool += 5×EXP_PER_ABILITY（等值 5 个
           基准属性点的成长货币；90+ 后成本倍率让实际可点数缩水，属设计内经济曲线）。 */
        const adAttr = m.querySelector("#ad-attr");
        if (adAttr) adAttr.onclick = UIkit.guard(() => {
          if (!window.Ads) { UIkit.toast("广告能力暂不可用", "red"); return; }
          if (Ads.attrLeft(State) <= 0) { UIkit.toast("本赛季属性点广告次数已用完（每季 " + Ads.ATTR_PER_SEASON + " 次）", "red"); return; }
          Ads.show("attrPoints", () => {
            Ads.consumeAttr(State);
            const d2 = State.data;
            d2.expPool = (d2.expPool || 0) + 5 * (CONFIG.EXP_PER_ABILITY || 10000);
            State.save();
            UIkit.toast({ html: ICO("play"), text: " 广告奖励到账，属性点 +5（已入经验池）！" }, "gold");
            rerender();
          });
        }, "广告属性点");
        /* ★ P153：训练经验 ×1.5 广告（从简况福利区迁移；expBoost/expBoostSeason 写入端口径
           与「本次生涯有效」语义完全不变——P97 缺陷修复的教训已固化在下方注释）。 */
        const adExp = m.querySelector("#ad-expboost");
        if (adExp) adExp.onclick = UIkit.guard(() => {
          if (!window.Ads) { UIkit.toast("广告能力暂不可用", "red"); return; }
          if (window.Track) { try { Track.click("BMC005", "T3", "ad_expboost"); } catch (e) { } }
          Ads.show("expboost", () => {
            Ads.consume(State, "expboost");
            /* ★ P97 缺陷修复（「字段没人写」型）：expBoost 与 expBoostSeason 必须**成对写**，
               读取端 systems.js dailyTrain 读 expBoostSeason === season（本次生涯有效语义下
               每季刷新仍是它的守恒写法——漏写任一 = 广告白看）。 */
            State.data.expBoost = true;
            State.data.expBoostSeason = State.data.season;
            State.save();
            UIkit.toast({ html: ICO("check"), text: " 训练经验 ×1.5 已激活（本次生涯有效）" }, "gold");
            rerender();
          });
        }, "训练经验加成");
        /* ★ P115 位置训练切换（setFocus 零 R）：只保留位置加练；类别/均衡选项已删，
           旧档残留的 { kind:"cat" } 重点由 Training.focusOf 归一化继续生效但 UI 不再提供。 */
        m.querySelectorAll("[data-tfpos]").forEach(b => {
          b.onclick = UIkit.guard(() => {
            const r = Training.setFocus(State, { kind: "pos", pos: b.dataset.tfpos });
            UIkit.toast(r.msg, r.ok ? "gold" : "danger"); if (r.ok) State.save();
            rerender();
          }, "设置位置训练");
        });
        /* ★ P272 熟练度经验投入：check→扣 expPool→gainMastery（position.js 单一入口） */
        m.querySelectorAll("[data-posinvest]").forEach(b => {
          b.onclick = UIkit.guard(() => {
            const r = Position.investMastery(State, b.dataset.posinvest);
            UIkit.toast(r.msg, r.ok ? "gold" : "danger");
            if (r.ok) { State.save(); rerender(); }
          }, "投入经验练位置");
        });
      }
      /* ★ P171：体能页签（_attrTabFatigue + 看广告清除疲劳）随疲劳机制整体退役 ——
         广告点位 ad_fatigue（BMC005 台账）同步下线；痊愈广告（heal）不受影响。 */
      if (tab === "pos") {
        /* ★★ P97-M2 球员申请改位 —— 三条变更通道里唯一由玩家主动发起的一条
           （另外两条：教练指派 = 事件卡；危机改位 = 剧情强制）★ P115 随页签迁到「位置」 */
        m.querySelectorAll("[data-applypos]").forEach(b => {
          b.onclick = UIkit.guard(() => {
            const to = b.dataset.applypos;
            const nm = (CONFIG.POSITIONS[to] || {}).name || to;
            UIkit.modal("<h3>申请改打" + UIkit.esc(nm) + "？</h3>" +
              '<div style="font-size:13.5px;line-height:1.9;margin-bottom:12px">教练会重新评估你的定位。' +
              '<b style="color:var(--gold)">新位置要从头适应</b> —— 开始几场你会踢得别扭，' +
              '但踢顺之后，你在那儿的上限比现在<em>高</em>。</div>' +
              '<div class="row" style="gap:8px"><button class="btn btn-primary" id="pos-ok">就这么定</button>' +
              '<button class="btn btn-ghost" id="pos-no">再想想</button></div>');
            const okb = $("#pos-ok"), nob = $("#pos-no");
            if (nob) nob.onclick = () => UIkit.closeModal();
            if (okb) okb.onclick = UIkit.guard(() => {
              const r = Position.switchTo(State, to, "球员主动申请改位", { via: "apply" });
              if (!r.ok) { UIkit.toast(UIkit.esc(r.msg || "暂时不行"), ""); return; }
              State.save();
              UIkit.closeModal();
              UIkit.toast("你改打了" + nm + "，一切从头适应。", "gold");
              self.attrPage($("#hub-sheet-body"));
            }, "改位置");
          }, "申请改位");
        });
        /* ★ P272 不可达位置按钮：点击透明化展示具体差距（出场进度/适配差），不再让玩家猜 */
        m.querySelectorAll("[data-applydeny]").forEach(b => {
          b.onclick = UIkit.guard(() => {
            const to = b.dataset.applydeny;
            const chk = Position.canSwitch(State.data, to, "apply");
            UIkit.toast(((CONFIG.POSITIONS[to] || {}).name || to) + "：" + (chk.msg || "暂不可申请"), "");
          }, "改位门槛说明");
        });
      }
      if (tab === "skill") {
        const rerender = () => self.attrPage($("#hub-sheet-body"));
        m.querySelectorAll("[data-skillcat]").forEach(b => { b.onclick = () => { self._skillCat = b.dataset.skillcat; rerender(); }; });
        const adSp = $("#ad-sp");
        if (adSp) adSp.onclick = () => {
          if (window.Ads && Ads.spQuotaLeft && Ads.spQuotaLeft(State) <= 0) { UIkit.toast("本赛季技能点广告次数已用完（每季 " + Ads.SP_PER_SEASON + " 次）", "red"); return; }
          Ads.show("sp", () => {
            if (window.Ads && Ads.consumeSpQuota) Ads.consumeSpQuota(State);
            Skills.consumeSpAd(State.data);
            State.save();
            UIkit.toast({ html: ICO("play"), text: " 广告奖励到账，技能点 +3！" }, "gold");
            rerender();
          });
        };
        m.querySelectorAll("[data-skill]").forEach(b => {
          b.onclick = () => {
            const sk = Skills.def(b.dataset.skill);
            const res = Skills.spend(State, b.dataset.skill);
            if (!res.ok) { UIkit.toast("「" + sk.name + "」：" + (res.reason || "无法投入"), "red"); return; }
            UIkit.toast({ html: ICO("star"), text: " 「" + sk.name + "」提升至 " + res.stars + " 星！" }, "gold");
            State.save(); rerender();
          };
        });
      }
      if (tab === "trainer") {
        /* ★★ P120 训练师：升档（确认扣签约费）/ 解约（退 50%）/ 广告体验卡 */
        const rerender = () => self.attrPage($("#hub-sheet-body"));
        const adTrial = $("#ad-trial");
        if (adTrial) adTrial.onclick = () => {
          if (!window.Ads) { UIkit.toast("广告能力暂不可用", "red"); return; }
          Ads.show("trainerTrial", () => {
            const r = Trainers.grantTrial(State);
            State.save();
            UIkit.toast({ html: ICO("play"), text: " " + r.msg }, "gold");
            rerender();
          });
        };
        m.querySelectorAll("[data-thire]").forEach(b => {
          b.onclick = UIkit.guard(() => {
            const key = b.dataset.thire;
            const def = CONFIG.TRAINERS.CATS[key];
            const cur = (State.data.trainers || {})[key] || 0;
            const money = State.data.money || 0;
            if (!def) return;
            /* ★★ P156（用户拍板）：「聘请」改为**自选档位**——五档列表（可跳档/降档），
               不再只能依次 +1。当前档标「现任」禁点；降档退旧档签约费一半（引擎 hire 内置）。 */
            let rows = "";
            for (let i = 1; i < CONFIG.TRAINERS.TIERS.length; i++) {
              const t = CONFIG.TRAINERS.TIERS[i];
              const isCur = i === cur;
              const afford = money >= t.fee;
              rows += '<button class="btn btn-ghost btn-block mt-6" data-ttier="' + i + '"' +
                (isCur || !afford ? " disabled" : "") +
                ' style="text-align:left;display:flex;justify-content:space-between;align-items:center;' +
                (isCur ? "border-color:var(--gold);color:var(--gold);" : !afford ? "opacity:.5;" : "") + '">' +
                '<span><b>' + t.name + '</b>　<span style="font-size:11.5px;opacity:.75">被动成本 ÷' + (1 + t.gain).toFixed(2) + ' · 周薪 ' + t.wage + '</span></span>' +
                '<span style="flex-shrink:0;font-size:12px">' + (isCur ? "现任" : "签约费 " + t.fee) + "</span></button>";
            }
            UIkit.modal('<h3>聘请' + UIkit.esc(def.name) + ' · 选档位</h3>' +
              '<div style="font-size:12.5px;line-height:1.8;margin-bottom:10px">效果：' + UIkit.esc(def.desc) + '（被动成本 ÷(1+档位效果)，只加速日常训练的随机成长）。' +
              '存款 <b style="color:var(--gold)">' + Career.fmtMoney(money) + '</b>；降档退旧档签约费一半，升档不退。</div>' + rows +
              '<div style="margin-top:10px"><button class="btn btn-ghost btn-block" id="th-no">再想想</button></div>');
            const nob = $("#th-no");
            if (nob) nob.onclick = () => UIkit.closeModal();
            /* ★ P156：modal 渲染在 #v2-modal-root 弹层——绑定必须走**全局**查询
               （m=页面容器，querySelectorAll 找不到弹层里的按钮 → 点击无响应）。 */
            UIkit.$2("[data-ttier]").forEach(sel => {
              sel.onclick = UIkit.guard(() => {
                const r = Trainers.hire(State, key, parseInt(sel.dataset.ttier, 10));
                UIkit.closeModal();
                UIkit.toast(r.msg, r.ok ? "gold" : "red");
                if (r.ok) { State.save(); rerender(); }
              }, "换签训练师");
            });
          }, "聘请训练师");
        });
        m.querySelectorAll("[data-tfire]").forEach(b => {
          b.onclick = UIkit.guard(() => {
            const r = Trainers.fire(State, b.dataset.tfire);
            UIkit.toast(r.msg, r.ok ? "gold" : "red");
            if (r.ok) State.save();
            rerender();
          }, "解约训练师");
        });
      }
    },

    /* ── ★ P295：天赋详情/图鉴渲染单源 ──
       · _talentModalHtml(d, id)：单个天赋详情（当前档效果 + 下一档预览）——属性页徽章点击用；
       · _talentDexHtml(d)：全部天赋图鉴（已拥有的高亮 + 全池 26 条五档说明）——设置页入口用。
       纯只读零 R；descOf 是数值文案唯一出口（不手写效果数字）。 */
    _talentModalHtml(d, id) {
      const t = TAL.byId[id];
      if (!t) return "";
      const cur = TAL.tierOf(d, id);
      const nx = TAL.TIER_ORDER[TAL.TIER_ORDER.indexOf(cur) + 1];
      const curTier = TAL.TIER[cur];
      let html = '<div class="panel alt" style="margin-bottom:10px"><div class="row"><span>档位</span><b style="color:' + curTier.solid + '">' + curTier.name + "档</b></div><div class='divider'></div>" +
        '<div style="font-size:13px;line-height:1.8"><b>当前效果</b>：' + esc(TAL.descOf(id, cur)) + "</div></div>";
      if (nx) {
        html += '<div class="panel"><div class="row"><span>下一档</span><b style="color:' + TAL.TIER[nx].solid + '">' + TAL.TIER[nx].name + "档</b></div><div class='divider'></div>" +
          '<div style="font-size:13px;line-height:1.8">升档后：' + esc(TAL.descOf(id, nx)) + "<br><span class='dim12' style='font-size:11px'>升档来源：赛季结算页看广告（每季 1 次）。</span></div></div>";
      } else {
        html += "<div class='dim12' style='font-size:12px'>已达钻石满档。</div>";
      }
      return html;
    },
    _talentDexHtml(d) {
      const owned = {};
      (d.talents || []).forEach(id => { owned[id] = true; });
      const CATS = { attr: "属性加成", pot: "潜力", grow: "成长速度", skill: "技术产出", body: "体质", life: "场外", decline: "衰退" };
      let html = '<div class="dim12" style="font-size:12px;margin-bottom:8px">开档六选三抽到的天赋伴随整个生涯；赛季结算页可看广告升档（铜→银→金→铂金→钻石）。金色 = 你当前拥有的天赋。</div>';
      for (const cat of Object.keys(CATS)) {
        const rows = TAL.POOL.filter(t => t.cat === cat);
        if (!rows.length) continue;
        html += '<div class="panel"><div class="panel-title">' + CATS[cat] + "</div>";
        for (const t of rows) {
          const has = !!owned[t.id];
          const cur = has ? TAL.tierOf(d, t.id) : null;
          const tierName = has ? TAL.TIER[cur].name + "档" : "未拥有";
          const desc = has ? TAL.descOf(t.id, cur) : "开档抽卡有机会获得（五档效果递增）";
          html += '<div class="list-item li-tight" style="' + (has ? "border-left:3px solid var(--gold);" : "opacity:.62;") + '">' +
            '<div class="li-main"><div class="li-title">' + esc(t.name) + "　" + (has ? '<span style="color:var(--gold);font-size:11px">' + tierName + "</span>" : '<span class="dim12" style="font-size:11px">' + tierName + "</span>") + "</div>" +
            '<div class="li-sub">' + esc(desc) + "</div></div></div>";
        }
        html += "</div>";
      }
      return html;
    },

    /* ── 分页①成长：日常训练说明 + 经验池 + 属性详情（潜力上限） ──
       ★ P125 文案与机制对齐：经验只入池不自动加点，全部手动分配；同类短板约束说明。 */
    _attrTabGrow(d) {
      const expPct = Math.min(100, Math.round((d.expPool || 0) / CONFIG.EXP_PER_ABILITY * 100));
      let html = '<div class="panel"><div class="panel-title">日常训练' + this.hintBtn("hint-daily", "日常训练 · 详细规则",
        "非比赛日推进日期时自动训练：每次 <b>+" + ((window.Training && Training.dailyExpPreview) ? Training.dailyExpPreview(State) : CONFIG.DAILY_TRAINING.exp) + " 经验</b>入池（天赋、设施、住房舒适度、广告有加成）；另有小概率训练受伤（伤病日与比赛日不训练）。" +
        "<b>经验只入池，绝不自动加点</b>——在下方属性列表点「+1」手动花掉，攒着不花也不会浪费。经验池满 1 格 = " + CONFIG.EXP_PER_ABILITY + " 经验（够加 1 点基准价）。") + '</div>' +
        '<div style="font-size:13px;line-height:1.8">非比赛日自动训练：每次 <b>+' + ((window.Training && Training.dailyExpPreview) ? Training.dailyExpPreview(State) : CONFIG.DAILY_TRAINING.exp) + " 经验</b>入池，攒着不花不浪费——在下方属性列表手动加点。</div>" +
        '<div class="bar-row mt-10"><span class="b-label">经验池</span><div class="b-track"><div class="b-fill" style="width:' + expPct + '%"></div></div><span class="b-val">' + Math.floor((d.expPool || 0) / 1000) / 10 + "k</span></div>" +
        '<div class="dim12" style="margin-top:4px">满 1 格 = ' + CONFIG.EXP_PER_ABILITY + " 经验；属性越高每点越贵（80+ ×2 / 90+ ×4 / 96+ ×8）。</div></div>";

      /* ★★ P115 位置训练（原「训练重点」按用户拍板重构）：
         类别侧重（意识/传球…×2.5 转化率）与「均衡」选项删除 —— 手动加点制下经验池由玩家
         全权分配，类别转化率侧重已无意义；只保留**位置加练**（季末该位置熟练度 +1）。
         候选 = 同池全部位置（不止适配度前 3）—— 多位置适应 = 多位置出场与队内竞争筹码。 */
      if (window.Training && window.Pool) {
        const tf = Training.focusOf(d);
        const curPos = tf && tf.kind === "pos" ? tf.pos : null;
        const curPoolKey = Pool.catsOf(d.player.position).join(",");
        const posCands = Object.keys(CONFIG.POSITIONS).filter(pos =>
          pos !== d.player.position &&
          ((window.Pool ? Pool.catsOf(pos).join(",") : "") === curPoolKey));
        const tfDesc = curPos
          ? "教练组正在帮你<b>加练" + ((CONFIG.POSITIONS[curPos] || {}).name || curPos) + "（当前熟练度 " + Math.round(Position.masteryOf(d, curPos)) + "）</b>——每季末该位置熟练度 +1，正式比赛踢这个位置涨得更快。"
          : "未选加练位置。<b>选一个位置加练</b>：季末熟练度 +1，熟练度养起来才能改打新位置、参与该位置的队内竞争。";
        html += '<div class="panel"><div class="panel-title">位置训练' + this.hintBtn("hint-pos-train", "位置训练 · 熟练度规则",
          "熟练度影响生疏位置的实战战力：0 熟练实战 OVR −7.5，练满归零。" +
          "<br><b>熟练度来源</b>：每季正式比赛在该位置出场（首发 +3 / 替补 +1.5）+ 位置加练（季末 +1）+ <b>投入经验</b>（每 " + ((window.CONFIG && CONFIG.POSITION_DYNAMICS && CONFIG.POSITION_DYNAMICS.INVEST_EXP) || 4000) + " 经验 +" + ((window.CONFIG && CONFIG.POSITION_DYNAMICS && CONFIG.POSITION_DYNAMICS.INVEST_STEP) || 2) + " 熟练，点各位置旁的「投入」按钮）。随时可换加练目标。") + '</div>' +
          '<div style="font-size:13px;line-height:1.8">' + tfDesc + "</div>" +
          '<div class="row" style="gap:6px;flex-wrap:wrap;margin-bottom:6px;margin-top:8px">' +
          posCands.map(pos => '<span class="row" style="gap:4px;display:inline-flex;align-items:center">' +
            '<button class="btn btn-sm ' + (pos === curPos ? "btn-primary" : "btn-ghost") + '" data-tfpos="' + pos + '">' +
            ((CONFIG.POSITIONS[pos] || {}).name || pos) + ' <span class="dim12">熟练 ' + Math.round(Position.masteryOf(d, pos)) + "</span></button>" +
            '<button class="btn btn-sm btn-ghost" data-posinvest="' + pos + '" title="投入经验提升熟练度">投入 ▸' + (((window.CONFIG && CONFIG.POSITION_DYNAMICS && CONFIG.POSITION_DYNAMICS.INVEST_EXP) || 4000) >= 1000 ? (((window.CONFIG && CONFIG.POSITION_DYNAMICS && CONFIG.POSITION_DYNAMICS.INVEST_EXP) || 4000) / 1000) + "k" : ((window.CONFIG && CONFIG.POSITION_DYNAMICS && CONFIG.POSITION_DYNAMICS.INVEST_EXP) || 4000)) + "</button>" +
            "</span>").join("") +
          "</div>" +
          '<div class="dim12">熟练度影响生疏位置实战战力；比赛出场与加练都能涨——细则见右上角 <b>?</b>。</div></div>';
      }

      /* ★★ P111 属性详情（FM 式三分类，用户 2026-09-17）：技术 / 精神 / 身体。
         attrId 体系一字不动，只按 CONFIG.ATTR_GROUPS 重新分组展示（组内按原类别分小节）；
         空节（门将没有意识类 / 外场没有门将类）自动隐藏。
         每项属性标注：★核心（本位置专属玩法属性，加点半价）+「影响」哪些小游戏选项
         （Duel.optionsOfAttr 运行时反查 duel_tables，零双源）。 */
      const _groups = (window.CONFIG && CONFIG.ATTR_GROUPS || []).filter(g => g.cats.some(cat => {
        const poolCats = window.Pool ? Pool.catsOf(d.player.position) : null;
        return !poolCats || poolCats.indexOf(cat) >= 0;
      }));
      const gActive = _groups.some(g => g.id === this._attrGrp) ? this._attrGrp : (_groups[0] || {}).id;
      const gDef = _groups.find(g => g.id === gActive) || _groups[0];
      html += '<div class="panel"><div class="panel-title">属性详情</div>' +
        '<div class="row" style="gap:6px;flex-wrap:wrap;margin-bottom:8px">' + _groups.map(g => {
          return '<button class="btn btn-sm ' + (g.id === gActive ? "btn-primary" : "btn-ghost") + '" data-attrgrp="' + g.id + '">' + g.name + "</button>";
        }).join("") + "</div>";
      // ★ P97-M1：显示「当前值 / 潜力上限」—— 进度条按上限缩放，一眼看出"离顶还有多远"
      //   （提案 D4：卡面仍禁数字，精确信息只进「训练重点界面」与「赛季成长账单」——本面板即其一）
      const eff = window.Potential ? Potential.effMap(d) : null;
      const pu = window.Potential ? Potential.potUnlockOf(d) : 0;
      const su = window.Potential ? Potential.starTotal(d.player) : 0;   // ★ P97-M4 L3：生涯传承累计
      /* ★★ P109/P111 手动加点：经验池 = 可自由支配的成长货币。
         单点成本 = EXP_PER_ABILITY × 软上限系数 × 出身/球风折扣 × **位置核心杠杆**（P111），
         硬上限 = 潜力上限（effMap，含积分解锁与传承）。到顶 / 经验不足的项按钮置灰。 */
      const spendable = (window.Training && window.Potential) ? true : false;
      const poolCatsNow = window.Pool ? Pool.catsOf(d.player.position) : null;
      const coreSet = (window.CONFIG && CONFIG.POSITION_CORE && CONFIG.POSITION_CORE[d.player.position]) || [];
      /* ★ P115 文案随面板更名：旧「训练重点」措辞清零（位置训练/位置页承接） */
      const costOf = (v, attrId) => {
        const cm = (window.Training && Training._costMult) ? Training._costMult(v) : 1;
        const disc = (window.IDENTITY && window.Training && IDENTITY.catBonus && Training._catCostDiscount)
          ? (Training._catCostDiscount({ data: d }, catIdOfAttr(attrId)) || 1) : 1;
        const pm = (window.Training && Training._posCostMult) ? Training._posCostMult({ data: d }, attrId) : 1;
        const om = (window.Training && Training._originCostMult) ? Training._originCostMult({ data: d }) : 1;   // ★ P120 出身成本系数（与实扣单源）
        const agem = (window.Potential && Potential.ageCostMult) ? Potential.ageCostMult(d) : 1;               // ★ P196 年龄三档系数（与实扣单源）
        return Math.round(CONFIG.EXP_PER_ABILITY * cm * disc * pm * om * agem);   // ★ P215：训练师改自动成长通道，手动加点恢复原价
      };
      /* 属性 id → 原类别（出身折扣按类别计，P111 组内仍需原 cat） */
      function catIdOfAttr(attrId) {
        for (const c of (poolCatsNow || [])) {
          if ((CONFIG.ATTRIBUTES[c] || []).some(a => a[0] === attrId)) return c;
        }
        return null;
      }
      const optOf = (window.Duel && Duel.optionsOfAttr) ? Duel.optionsOfAttr : null;
      /* ★ P125 同类短板约束的展示口径：每类先算「同类最低值」（池内成员，缺项按 30），
         单项 v+1 − min > ATTR_GAP_LIMIT 的项按钮置灰 + 提示先补短板（与 spendOn 拒绝逻辑同源）。 */
      const GAP = (CONFIG.ATTR_GAP_LIMIT !== undefined) ? CONFIG.ATTR_GAP_LIMIT : 15;
      for (const cat of (gDef ? gDef.cats : [])) {
        if (poolCatsNow && poolCatsNow.indexOf(cat) < 0) continue;      // 池外类（门将/外场隔离）
        const list = CONFIG.ATTRIBUTES[cat] || [];
        if (!list.length) continue;
        const secCol = (CONFIG.CATEGORIES[cat] || {}).color || (gDef && gDef.color) || "#888";
        html += '<div style="font-size:12px;font-weight:700;color:' + secCol + ';margin:10px 0 4px;letter-spacing:1px">' + (CONFIG.CATEGORIES[cat] || {}).name + "</div>";
        const ms = window.Pool ? Pool.membersOf(d.player.position, cat) : list.map(a => a[0]);
        let catMin = Infinity;
        for (const mid of ms) {
          const mv = d.player.attrs[mid] !== undefined ? d.player.attrs[mid] : 30;
          if (mv < catMin) catMin = mv;
        }
        for (const [id, name] of list) {
          const v = d.player.attrs[id] !== undefined ? d.player.attrs[id] : 50;
          const cap = (eff && eff[id] !== undefined) ? eff[id] : 99;
          const w = Math.max(2, Math.min(100, Math.round(v / Math.max(1, cap) * 100)));
          const atCap = v >= cap;
          const star = ((d.player.starUnlock || {})[id]) || 0;              // 该项吃到的传承点数
          const isCore = coreSet.indexOf(id) >= 0;
          const affects = optOf ? optOf(id) : [];
          const cost = costOf(v, id);
          const gapBlocked = catMin !== Infinity && v + 1 - catMin > GAP;
          const canSpend = spendable && !atCap && !gapBlocked && (d.expPool || 0) >= cost;
          html += '<div class="bar-row"><span class="b-label">' + (isCore ? '<span style="color:var(--gold)" title="本位置核心属性：加点半价">★</span>' : "") + name + '</span>' +
            '<div class="b-track"><div class="b-fill" style="width:' + w + "%;background:" + (atCap ? "#ffb020" : secCol) + '"></div></div>' +
            '<span class="b-val">' + v + '<span style="opacity:.5;font-size:11px">/' + cap + "</span>"
            + (star > 0 ? '<span style="color:var(--gold);font-size:10px;margin-left:3px">传承+' + star + "</span>" : "")
            + "</span>" +
            (spendable
              ? (atCap
                ? (cap >= ((CONFIG.POTENTIAL && CONFIG.POTENTIAL.AD_BREAK && CONFIG.POTENTIAL.AD_BREAK.CAP) || 100)
                  ? '<span style="font-size:11px;color:var(--gold);flex-shrink:0;margin-left:8px">MAX</span>'
                  : (function () {
                      const bl = (window.Potential && Potential.breakLeft) ? Potential.breakLeft(d) : 0;
                      const can = bl > 0;
                      /* ★ P189：经验突破价（与实扣单源 expBreakCost；出身系数已含） */
                      const ebCost = (window.Potential && Potential.expBreakCost) ? Potential.expBreakCost(d, id) : 80000;
                      const ebCan = (d.expPool || 0) >= ebCost;
                      /* ★ P266：广告突破步长改 +5——文案不再写死「+10」，读 AD_BREAK.STEP 动态拼接（与 potential.effPot 实扣同源） */
                      const abStep = (CONFIG.POTENTIAL && CONFIG.POTENTIAL.AD_BREAK && CONFIG.POTENTIAL.AD_BREAK.STEP) || 5;
                      return '<button class="btn btn-sm btn-gold" data-adbreak="' + id + '"' + (can ? "" : " disabled") + ' style="margin-left:8px;height:26px;padding:0 8px;font-size:12px"' +
                        ' title="看广告：该项潜力上限 +' + abStep + '（现上限 ' + cap + '，突破总上限 100；每季 3 次）">' + (window.ICO ? ICO("play") : "▶") + (can ? " 突破+" + abStep + "（季余 " + bl + "）" : " 本季突破已用完") + "</button>" +
                        '<button class="btn btn-sm ' + (ebCan ? "btn-ghost" : "btn-ghost") + '" data-expbreak="' + id + '"' + (ebCan ? "" : " disabled") + ' style="margin-left:4px;height:26px;padding:0 10px;font-size:12px"' +
                        ' title="花经验 ' + ebCost + '：该项潜力上限 +5（不限次，每 5 点一阶、价格阶阶跳涨；总上限 100）">经验突破+5（' + Math.round(ebCost / 10000) + "万）</button>";
                    })())
                : (gapBlocked
                  ? '<span style="flex-shrink:0;margin-left:8px;font-size:11px;font-weight:700;color:var(--gold)" title="同类短板约束：先补同类最低项，再练专长">先补短板</span>'
                  : '<button class="btn btn-sm ' + (canSpend ? "btn-gold" : "btn-ghost") + '" data-spend="' + id + '"' +
                    (canSpend ? "" : " disabled") + ' style="margin-left:8px;height:26px;min-width:46px;padding:0 10px;font-size:12px"' +
                    ' title="消耗经验 ' + cost + ' 使该项 +1' + (isCore ? "" : "（非本位置核心 ×" + (CONFIG.POSITION_CORE_MULT || 1.6) + "）") + '">+1</button>'))
              : "") +
            "</div>" +
            (affects.length ? '<div class="dim12" style="margin:-2px 0 4px 76px;font-size:11px">影响：' + affects.map(a => esc(a)).join("、") + "</div>" : "");
        }
      }
      if (spendable) {
        const attrLeft = (window.Ads && Ads.attrLeft) ? Ads.attrLeft(State) : 0;
        html += '<div class="dim12" style="margin-top:6px;display:flex;align-items:flex-start;gap:4px"><span style="flex:1">手动加点：点「+1」花经验池（<b style="color:var(--gold)">★核心半价</b> · 同类守恒单项 ≤ 同类最低 +' + GAP + " 点）</span>" + this.hintBtn("hint-spend", "手动加点 · 详细规则",
          "<b>价格</b>：点「+1」把经验池花在指定属性上，单点成本 = 基准价 × 软上限系数（80+ ×2 / 90+ ×4 / 96+ ×8）× 出身/球风折扣 × 位置杠杆（<b style=\"color:var(--gold)\">★ = 本位置核心属性，加点半价</b>，非核心 ×" + (CONFIG.POSITION_CORE_MULT || 1.6) + "）× 年龄档（28 岁前 ×1.0 / 28-35 岁 ×1.6 / 36 岁起 ×3.0——年纪越大，身体学习能力越差，每一点成长都更贵）。" +
          "<br><b>同类守恒</b>：单项加到超过<b>同类最低项 +" + GAP + "</b> 后锁定——先补短板再练专长，防止一条属性甩开同类太多的畸形加点。想跨位置改造？位置训练或申请改位更划算。" +
          "<br><b>潜力突破</b>：练到潜力上限后可点「突破+" + ((CONFIG.POTENTIAL && CONFIG.POTENTIAL.AD_BREAK && CONFIG.POTENTIAL.AD_BREAK.STEP) || 5) + "」看广告再抬上限（每季 " + ((CONFIG.POTENTIAL && CONFIG.POTENTIAL.AD_BREAK && CONFIG.POTENTIAL.AD_BREAK.PER_SEASON) || 3) + " 次，总上限 100）；" +
          "次次到帽也可以选<b style=\"color:var(--gold)\">「经验突破+5」</b>——花大把经验一次抬 5 点上限（不限次；每 5 点一阶、价格阶阶跳涨，越高阶越贵），经验多得花不完时的正经去处。" +
          "<br><b>设施加成</b>：俱乐部/青训营强度影响经验收益——简陋 ×0.9 / 标准 ×1.0 / 职业 ×1.1 / 顶级 ×1.2。") + '</div>' +
          '<button class="btn btn-ghost btn-block mt-8" id="ad-attr" style="border-color:var(--gold);color:var(--gold)"' + (attrLeft <= 0 ? " disabled" : "") + '>' + (window.ICO ? ICO("play") : "▶") + " 看广告 · 属性点 +5（入经验池）· 本季剩 " + attrLeft + "/" + ((window.Ads && Ads.ATTR_PER_SEASON) || 30) + "</button>";
      }
      if (pu > 0) html += '<div class="dim12" style="margin-top:6px">生涯积分解锁潜力 <b>+' + pu + '</b>（已计入上方上限）</div>';
      /* ★★ P97-M4 · L3：球星传承的落点 —— 与"积分解锁（全体）"并列，让玩家看清两条轴的差别：
         积分抬**所有**项的顶，传承只抬**你短板的那一项**，且总量封顶（生涯累计 +12）。 */
      if (su > 0) html += '<div class="dim12" style="margin-top:4px">球星传承 <b>+' + su + '</b>'
        + '（生涯累计，已计入上方上限；跟不同出身的球星合练，补的是不同类别）</div>';
      /* ★ P153：训练经验 ×1.5 广告从简况福利区迁入成长页（语义=训练效率，跟成长同页；
         本次生涯有效口径不变，读取端 systems.js dailyTrain 不动）。 */
      if (!d.expBoost) {
        html += '<button class="btn btn-ghost btn-block mt-10" id="ad-expboost">' + (window.ICO ? ICO("play") : "▶") + " 看广告 · 训练经验 ×1.5（本次生涯有效）</button>";
      } else {
        html += '<div class="dim12 c-gold" style="margin-top:8px">训练经验 ×1.5 已激活（本次生涯有效）</div>';
      }
      html += "</div>";
      return html;
    },

    /* ★ P171：体能页签（_attrTabFatigue）随疲劳机制整体退役 —— 方法体删除，页签与
       广告点位（ad_fatigue/BMC005）一并下线；住房舒适度的玩法出口改走训练经验加成。 */

    /* ── 分页②性格：性格三维 + 关系与声望（P102 新增可见层） ── */
    _attrTabChar(d) {
      let html = "";
      if (window.Personality && Personality.KEYS) {
        html += '<div class="panel"><div class="panel-title">性格</div>' +
          '<div style="font-size:13px;line-height:1.8">生活事件中的选择塑造性格（±60 点升/降 1 级，正向 5 级封顶、放纵可跌至 -3 级），性格等级直接影响训练与比赛状态。<b style="color:var(--danger)">注意：放纵、懒散类的选择会倒退进度</b>——进度条回落是性格在变化，不是显示错误。</div>';
        for (const pk of Personality.KEYS) {
          const lv = Personality.level(d, pk.id);
          const xp = Personality.xp(d, pk.id);
          const pct = Math.round(Math.abs(xp) % 60 / 60 * 100);
          const lvColor = lv > 0 ? "var(--success)" : lv < 0 ? "var(--danger)" : "var(--text-dim)";
          html += '<div class="list-item"><div class="li-main"><div class="li-title">' + ICO(pk.icon) + " " + pk.name +
            ' <span style="font-weight:800;color:' + lvColor + '">Lv' + lv + "</span></div>" +
            '<div class="li-sub">' + pk.effect + (lv < 0 ? " · <b style='color:var(--danger)'>性格缺陷正在反噬</b>" : "") + "</div>" +
            (Math.abs(lv) < 5
              ? '<div class="bar-row" style="margin-top:4px"><span class="b-label" style="width:64px;font-size:11px">' + (xp < 0 ? "恶化" : "成长") + '</span><div class="b-track"><div class="b-fill" style="width:' + pct + '%;background:' + (xp < 0 ? "var(--danger)" : "var(--success)") + '"></div></div><span class="b-val" style="font-size:11px">' + Math.abs(xp) % 60 + "/60</span></div>"
              : '<div class="li-sub" style="color:var(--gold)">本维度已到顶</div>') +
            "</div></div>";
        }
        html += "</div>";
      }
      /* ★★ P102 关系与声望：事件卡与生活事件一直在改的 7 项隐藏属性（教练信任/自信/
         媒体关系/球迷好感/化学反应/商业价值/伤病风险）首次可见。
         ★ 语义标注诚实原则：只给"已在代码里生效"的项标影响说明
           （injury_risk→赛后伤病概率、chemistry→赛季更衣室人才），其余注明"积累中"。 */
      if (window.EventCards && EventCards.charsOf) {
        const chars = EventCards.charsOf(d);
        /* ★ P301（玩家反馈「商业价值和伤病风险不知道如何加减，没有提示」）：七项全部给来源说明。
           口径按真实写点归纳（eventcards fx：data_cc、league 系列、mainline 系列、offseason2 等）
           ——诚实原则不宣传不存在的机制。
           ★ P307 修复：原注释里「league 星杠 mainline 星杠 offseason2」（即 league＋星杠＋mainline…）
           的星杠序列把块注释提前终结，
           后半段变成活代码 → 点属性·性格页签必炸 ReferenceError: mainline is not defined
           （语法恰好可解析故 CI 不红；块注释禁星杠铁律再+1，全库清扫见 _p307 注释雷扫描）。 */
        const NOTE = {
          coach_trust: "影响教练对你的态度——训练加练、为出场据理力争等选择会改变",
          confidence: "比赛表现出色、得到夸奖会提升；连败、被公开批评会下降",
          injury_risk: "越高越容易在比赛中受伤——带伤出战、流感硬撑、玩命防守等选择会增加，静养轮休会回落",
          chemistry: "更衣室化学反应（人才产出相关）——帮队友出头、团队活动会提升，抢功/内讧会下降",
          media_relation: "接受采访、发布会得体、参与宣传片会提升；罢采、炮轰媒体会下降",
          fan_love: "进球、公益、亲民互动会提升；罢赛、争议言论会下降",
          commercial_value: "接代言、商业活动、高光表现会提升；负面新闻会下降——它影响品牌方的开价档位",
        };
        html += '<div class="panel"><div class="panel-title">关系与声望</div>' +
          '<div style="font-size:13px;line-height:1.8">事件与选择会持续改变这些评价（0-100，起始 50）——它们决定你在更衣室、媒体和教练组眼中的样子。<b>每一项怎么加减看各行小字说明。</b></div>';
        for (const c of chars) {
          const v = c.value;
          const col = v >= 70 ? "var(--success)" : v <= 30 ? "var(--danger)" : "var(--text-dim)";
          html += '<div class="bar-row"><span class="b-label">' + esc(c.name) + '</span>' +
            '<div class="b-track"><div class="b-fill" style="width:' + Math.max(2, v) + "%;background:" + col + '"></div></div>' +
            '<span class="b-val">' + v + "</span></div>" +
            (NOTE[c.id] ? '<div class="dim12" style="margin:-2px 0 6px;font-size:11px">' + NOTE[c.id] + "</div>" : "");
        }
        html += '<div class="dim12" style="margin-top:2px;font-size:11px">教练信任 = 生活事件与事件卡共用的同一份评价。</div></div>';
      }
      return html;
    },

    /* ── 分页②训练师（★★ P120）：五类 × 三档，花钱买被动成长效率 ──
       效果只作用日常训练的随机加点（被动路径）；手动加点是自己练，不吃训练师。
       私人雇员转会不清零；周薪随发薪日扣款，养不起自动离队。 */
    _attrTabTrainer(d) {
      const CFG = CONFIG.TRAINERS;
      if (!(CFG && window.Trainers)) return "";
      Trainers.ensure(d);
      const trialOn = Trainers.trialActive(d);
      let html = '<div class="panel"><div class="panel-title">训练师团队' + this.hintBtn("hint-trainer", "训练师团队 · 详细规则",
        "训练师<b>每周自动帮你练</b>对应类别的属性——进度攒满 1 点就 +1（优先补同类短板）。属性越高练得越慢（与手动加点同一套经济曲线）。" +
        "<br><b style=\"color:var(--gold)\">潜力开发</b>：档位越高，可把属性练到<b>潜力帽之上</b>越多——传说级团队 +8（这就是巅峰 OVR 的钥匙；90+ 仍要靠广告/经验突破）。" +
        "<br><b>手动加点不受影响</b>：经验池加点照旧原价，训练师的自动成长是<b style=\"color:var(--gold)\">额外白给的</b>。" +
        "<br><b>经济</b>：签约费一次性付清（= 1 周周薪），周薪每周结算——<b style=\"color:var(--danger)\">存款不够周薪，团队会集体离队</b>。转会不清零，退役解散。" +
        "<br><b>换签</b>：点「聘请」自选任意档位（可跳档）；降档退还旧档签约费一半，升档不退。解约后已有训练成果保留。") + '</div>' +
        '<div style="font-size:13px;line-height:1.8">训练师<b>每周自动提升对应类别的属性</b>（进度攒满 1 点自动 +1，优先补短板）——<b style="color:var(--danger)">效果跟着时间走，雇一周只吃一周</b>；点「聘请」<b>自选合适的档位</b>（可跳档/降档），签约费一次付清 + 周薪周结，<b style="color:var(--danger)">养不起集体离队</b>。</div>' +
        '<div class="dim12" style="margin-top:6px">五档梯队（全五类周薪合计）：兼职 1,500 → 职业 4,000 → 国家级 10,000 → 世界级 25,000 → 传说级 60,000。</div>';
      /* ★ P153（用户拍板）：广告体验从「7 天」改为「免费体验世界级训练师 1 个赛季」
         （trialActive 赛季口径——本赛季内有效，进入新赛季自动失效）。 */
      if (trialOn) {
        html += '<div class="row" style="align-items:center;justify-content:space-between;margin-top:8px;padding:8px 10px;border:1px solid var(--gold);border-radius:8px">' +
          '<span style="font-size:13px;color:var(--gold)">' + ICO("play") + " 世界级训练师团队体验中 · <b>本赛季内</b>有效</span></div>";
      } else {
        html += '<button class="btn btn-ghost btn-block mt-8" id="ad-trial" style="border-color:var(--gold);color:var(--gold)">' + ICO("play") + " 看广告 · 免费体验世界级训练师团队 1 个赛季</button>";
      }
      html += "</div>";
      const money = d.money || 0;
      for (const key of Object.keys(CFG.CATS)) {
        const def = CFG.CATS[key];
        const cur = Trainers.tierOf(d, key);
        const next = CFG.TIERS[(d.trainers[key] || 0) + 1] || null;
        const isMax = !next;
        /* ★ P215：自动成长进度展示——攒满 1 点自动 +1（优先补短板） */
        const prog = (d.trainerProg && d.trainerProg[key]) || 0;
        const rate = (cur.gain || 0) * 0.10;
        const progLine = (cur.id > 0 && rate > 0)
          ? '<div class="dim12" style="font-size:11px;margin-top:2px">每周自动练 +' + rate.toFixed(2) + " 点进度 · 当前 " + (Math.floor(prog * 100)) + "%（攒满 1 点自动 +1）" +
            (prog > 0 ? " · 已攒 " + prog.toFixed(2) : "") + "</div>"
          : "";
        html += '<div class="list-item"><div class="li-main"><div class="li-title">' + ICO(def.icon) + " " + def.name +
          ' <span style="font-size:12px;font-weight:700;color:' + (cur.id > 0 ? "var(--gold)" : "var(--text-dim)") + '">' + cur.name + "</span>" +
          (cur.id > 0 ? ' <span style="font-size:11px;color:var(--text-dim)">每周自动成长 · 周薪 ' + (cur.wage || 0) + "</span>" : "") + "</div>" +
          '<div class="li-sub">' + def.desc + "</div>" + progLine + "</div>" +
          '<div style="flex-shrink:0;display:flex;gap:6px">' +
          '<button class="btn btn-sm ' + (cur.id > 0 ? "btn-ghost" : "btn-primary") + '" data-thire="' + key + '">聘请 ▸</button>' +
          ((d.trainers[key] || 0) > 0 ? '<button class="btn btn-sm btn-ghost" data-tfire="' + key + '">解约</button>' : "") +
          "</div></div>";
      }
      const TOP = CFG.TIERS[CFG.TIERS.length - 1] || {};
      html += '<div class="dim12" style="margin-top:6px">满配' + (TOP.name || "传说级") + '五件套 = 全类别每周自动成长（低段约 20 周攒 1 点/类，属性越高越慢），周薪合计 ' + ((TOP.wage || 0) * Object.keys(CFG.CATS).length) + "/周 —— 巨星待遇级的幕后团队。</div>";
      return html;
    },

    /* ── 分页③技能：技能库 v2（★★ P114 三分类：赛事按位置 10 个 / 身体 10 / 经营 10；
         成本递增：升到下一星的花费 = COST[当前星级]；广告 +3 不限次）── */
    _attrTabSkill(d, tt) {
      const LIB = CONFIG.SKILL_LIBRARY;
      if (!(LIB && window.Skills)) return "";
      Skills.ensure(d);
      const sp = Skills.sp(d);
      const sCats = Object.keys(LIB.CATS);
      const sActive = sCats.indexOf(this._skillCat) >= 0 ? this._skillCat : sCats[0];
      /* 赛事技能按位置取（MATCH_SKILLS_BY_POS 单源）；身体/经营全量 */
      const pos = d.player.position;
      const posMatch = (LIB.MATCH_SKILLS_BY_POS && LIB.MATCH_SKILLS_BY_POS[pos]) || [];
      const listOf = (cat) => cat === "match"
        ? posMatch.map(id => LIB.SKILLS.find(s => s.id === id)).filter(Boolean)
        : LIB.SKILLS.filter(s => s.cat === cat);
      const lv = (window.Skills && Skills.levelOf) ? Skills.levelOf(d) : 1;
      const spLeft = (window.Ads && Ads.spQuotaLeft) ? Ads.spQuotaLeft(State) : 0;
      let html = '<div class="panel"><div class="panel-title">技能库</div>' +
        '<div class="row" style="align-items:center;justify-content:space-between;margin-bottom:6px">' +
        '<span style="font-size:15px;font-weight:800;color:var(--gold)">技能点 <b style="font-size:20px">' + sp + "</b></span>" +
        '<button class="btn btn-sm btn-gold" id="ad-sp"' + (spLeft <= 0 ? " disabled" : "") + '>' + ICO("play") + " 看广告 +3 技能点 · 本季剩 " + spLeft + "/" + ((window.Ads && Ads.SP_PER_SEASON) || 5) + "</button>" +
        "</div>" +
        '<div style="font-size:13px;line-height:1.8">技能升星<b>成本递增</b>：0★ 花 1 点、1★ 花 2、2★ 花 3、3★ 花 4、4★ 花 5（满星共 15 点）——星级越高效果越强，代价也越大。</div>' +
        '<div class="dim12" style="font-size:12px;margin-top:4px">技能点来源：<b style="color:var(--gold)">① 赛季结算</b>（出场 / 评分 / 高光 / 冠军，单季至多 6 点）　<b style="color:var(--gold)">② 人物升级</b>（每升 1 级 +1，升级由生涯累计经验驱动）　<b style="color:var(--gold)">③ 看广告</b>（每次 +3，每季 ' + ((window.Ads && Ads.SP_PER_SEASON) || 5) + ' 次）。当前 Lv.' + lv + "。</div>" +
        '<div class="row" style="gap:6px;flex-wrap:wrap;margin:8px 0 2px">' + sCats.map(cat => {
          const cd = LIB.CATS[cat];
          const list = listOf(cat);
          const owned = list.filter(s => (tt[s.id] || 0) > 0).length;
          return '<button class="btn btn-sm ' + (cat === sActive ? "btn-primary" : "btn-ghost") + '" data-skillcat="' + cat + '">' + ICO(cd.icon) + " " + cd.name + " " + owned + "/" + list.length + "</button>";
        }).join("") + "</div>" +
        (sActive === "match" ? '<div class="dim12" style="margin:2px 0 4px">赛事技能随你的位置而变（当前：' + ((CONFIG.POSITIONS[pos] || {}).name || pos) + " 的 10 项，与位置关键属性强相关）；改位置后技能库会跟着换。</div>" : "");
      for (const sk of listOf(sActive)) {
        const stars = tt[sk.id] || 0;
        const cost = Skills.nextCost(d, sk.id);
        let starStr = "";
        for (let i = 0; i < LIB.MAX_STARS; i++) starStr += i < stars ? "★" : "☆";
        /* ★ P119：技能不再分稀有度 —— 技能名统一主题色，去掉『普通/进阶/稀有/传奇』标签；
           技能间的取舍只看分类、升星成本（递增）与效果本身。 */
        html += '<div class="list-item"><div class="li-main"><div class="li-title">' + ICO(sk.icon) + " <span style='color:var(--text)'>" + sk.name + "</span>" +
          ' <span style="color:var(--gold);letter-spacing:2px">' + starStr + "</span></div>" +
          '<div class="li-sub">' + sk.desc + " · " + sk.effect + (stars >= LIB.MAX_STARS ? " · <b style='color:var(--gold)'>已满星</b>" : "") + "</div></div>" +
          (stars >= LIB.MAX_STARS
            ? '<span style="font-size:11px;color:var(--gold);flex-shrink:0">★ MAX</span>'
            : '<button class="btn btn-sm ' + (sp >= cost ? "btn-primary" : "btn-ghost") + '" data-skill="' + sk.id + '" ' + (sp < cost ? "disabled" : "") + '>升星 · ' + cost + " 点</button>") + "</div>";
      }
      html += "</div>";
      return html;
    },

    /* ── 分页④位置（★ P115 改名自「球探」）：全位置熟练度 / 适配 / 实战战力 + 申请改位 ──
       原版只展示现位置与 top5 适配 —— 用户要求「能看到其他位置的熟练度」⇒ 全池位置逐行列出。 */
    _attrTabPos(d) {
      if (!window.Position) return "";
      Position.ensure(d);   // 幂等：补齐 posMastery / originPosition（旧档兼容）
      const rank = Position.ranking(d);
      if (!rank.length) return "";
      const cur = d.player.position;
      const full = (window.CONFIG && CONFIG.POSITION_DYNAMICS && CONFIG.POSITION_DYNAMICS.MASTERY_FULL) || 50;
      const maxPen = Math.round((full) * ((window.CONFIG && CONFIG.POSITION_DYNAMICS && CONFIG.POSITION_DYNAMICS.PENALTY_K) || 0.15) * 10) / 10;
      let html = '<div class="panel"><div class="panel-title">位置全景 · 熟练度与实战战力</div>' +
        '<div class="dim12" style="margin-bottom:8px">实战战力 = 该位置适配度 − 熟练度折扣（0 熟练最多 −' + maxPen + '，练满归零）。' +
        '<b>比赛引擎、首发判定都按实战战力计算</b>——多位置都能踢，就多一路出场与竞争筹码。</div>';
      for (const r of rank) {
        const isCur = r.pos === cur;
        const m = Math.max(0, Math.min(100, Math.round(r.mastery)));
        html += '<div class="row" style="padding:4px 0;gap:8px' + (isCur ? ";font-weight:700" : "") + '">' +
          '<span style="width:74px;flex-shrink:0">' + esc(r.name) + (isCur ? ' <span class="pos-badge gold">现</span>' : "") + "</span>" +
          '<div class="b-track" style="flex:1"><div class="b-fill" style="width:' + m + '%;background:' + (m >= full ? "#4dd0e1" : "#f0b429") + '"></div></div>' +
          '<span class="dim12" style="width:132px;text-align:right;flex-shrink:0;font-variant-numeric:tabular-nums">熟练 ' + m + " · 适配 <b style='color:var(--text)'>" + r.fit + "</b> · 实战 <b style='color:var(--text)'>" + r.eff + "</b></span></div>";
      }
      /* ★★ P222（用户拍板「不同位置的 ovr 根据核心属性有不同显示」）：
         OVR 本就按位置权重加权（overallAt 单源），本块把「这个位置的 OVR 由什么撑起来的」画出来——
         七大类贡献点数条（类别权重 × 类内均值 = 绝对 OVR 点数）+ 核心属性值域 chips。
         实测（_p222_align.js E3）：同一窄科 build 跨位置 OVR 跨度 24 点（ST 72 → CB 57 → GK 48）。 */
      const _CAT_CN = { passing: "传球", dribbling: "带球", defending: "防守", shooting: "终结", awareness: "精神", physicality: "身体", pace: "速度", goalkeeping: "守门" };
      const _attrName = {};
      for (const cat of Object.keys(CONFIG.ATTRIBUTE_INNER || {})) for (const pair of CONFIG.ATTRIBUTE_INNER[cat]) _attrName[pair[0]] = pair[1];
      const _w = CONFIG.POSITION_WEIGHTS[cur] || {};
      const _profKey = PlayerSystem.buildProfile(d.player, cur);
      const _contrib = [];
      for (const cat of Object.keys(_w)) {
        const spec = cat === "physicality" ? ((CONFIG.BUILD_PROFILES || {})[_profKey] || []) : ((CONFIG.ATTRIBUTE_INNER || {})[cat] || []);
        const _inner = {};
        for (const pair of spec) _inner[pair[0]] = pair[1];
        const list = (window.Pool && Pool.membersOf(cur, cat)) || [];
        let s = 0, ws = 0, plain = 0;
        for (const id of list) {
          const v = d.player.attrs[id] !== undefined ? d.player.attrs[id] : 30;
          plain += v;
          const k = _inner[id];
          if (k) { s += v * k; ws += k; }
        }
        const catAvg = ws ? s / ws : (list.length ? plain / list.length : 0);
        _contrib.push({ cat: cat, name: _CAT_CN[cat] || cat, pts: catAvg * _w[cat], pct: Math.round(_w[cat] * 100), avg: Math.round(catAvg) });
      }
      _contrib.sort((a, b) => b.pts - a.pts);
      const _maxPts = _contrib.length ? Math.max.apply(null, _contrib.map(c => c.pts)) : 1;
      const _posName = ((CONFIG.POSITIONS || {})[cur] || {}).name || cur;
      const _coreSorted = (CONFIG.POSITION_CORE[cur] || []).slice().sort((a, b) => (d.player.attrs[b] || 0) - (d.player.attrs[a] || 0));
      html += '<div class="panel"><div class="panel-title">' + esc(_posName) + " · OVR " + PlayerSystem.overallAt(d.player, cur) + " 构成</div>" +
        '<div class="dim12" style="margin-bottom:8px">总评按<b>位置权重</b>加权——同一份属性换位置，OVR 不同（下面「位置全景」的适配列就是逐位置的 OVR）。这里拆给你看：这个位置上每类属性各贡献了多少 OVR 点。</div>' +
        _contrib.map(c => '<div class="bar-row"><span class="b-label" style="width:70px">' + esc(c.name) + " " + c.pct + "%</span>" +
          '<div class="b-track"><div class="b-fill" style="width:' + Math.max(4, Math.round(c.pts / (_maxPts || 1) * 100)) + '%;background:#f0b429"></div></div>' +
          '<span class="b-val" style="width:auto;font-size:11px;white-space:nowrap">+' + c.pts.toFixed(1) + " 点 · 类均 " + c.avg + "</span></div>").join("") +
        '<div class="dim12" style="margin:10px 0 4px">核心属性（手动加点 ×1.0 价；非核心 ×1.6 价）——金框 = 已练到 85+：</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px">' +
        _coreSorted.map(id => {
          const v = d.player.attrs[id] || 30;
          const hot = v >= 85;
          return '<span style="font-size:11px;border:1.5px solid ' + (hot ? "var(--gold)" : "var(--line)") + ';border-radius:99px;padding:2px 8px;color:' + (hot ? "var(--gold)" : "var(--text-dim)") + ';font-weight:700">' + esc(_attrName[id] || id) + " " + v + "</span>";
        }).join("") +
        "</div></div>";
      /* 申请改位（★ P272 重构：全位置按钮透明化——此前 APPLY_GAP=0+出场15 双门槛下
         canApply 恒空、按钮永不出、best===cur 时连原因都不显示，玩家以为功能缺失。
         现在：可达=主按钮；不可达=幽灵按钮+点击 toast 具体差距（出场进度/适配差），
         青训线门槛单独降档（position.js canSwitch）。 */
      const applyRows = rank.filter(r => r.pos !== cur);
      const canApply = applyRows.filter(r => Position.canSwitch(d, r.pos, "apply").ok);
      if (applyRows.length) {
        html += '<div class="dim12" style="margin-top:12px;margin-bottom:4px"><b>申请改打其他位置</b>——改过去从零适应（实战先掉一截），踢出场次练熟就回本：</div>';
        html += '<div class="row" style="gap:6px;flex-wrap:wrap">' +
          applyRows.map(r => {
            const chk = Position.canSwitch(d, r.pos, "apply");
            return chk.ok
              ? '<button class="btn btn-sm btn-primary" data-applypos="' + r.pos + '">申请改打' + r.name + '</button>'
              : '<button class="btn btn-sm btn-ghost" data-applydeny="' + r.pos + '">' + r.name + ' <span class="dim12">未达标</span></button>';
          }).join("") + '</div>';
        if (!canApply.length) {
          html += '<div class="dim12" style="margin-top:4px">点灰色按钮可看还差什么（出场进度 / 适配差距）。</div>';
        }
      }
      html += '<div class="dim12" style="margin-top:6px">熟练度来源：该位置正式出场（每季首发 +3 / 替补 +1.5）+「成长」页位置训练加练（+1/季）+ <b>投入经验</b>（成长页，每 ' + ((window.CONFIG && CONFIG.POSITION_DYNAMICS && CONFIG.POSITION_DYNAMICS.INVEST_EXP) || 4000) + " 经验 +" + ((window.CONFIG && CONFIG.POSITION_DYNAMICS && CONFIG.POSITION_DYNAMICS.INVEST_STEP) || 2) + " 熟练）；危机改位会折半。</div>";
      html += "</div>";
      return html;
    },

    /* ── 分页⑤球探（★ P115 新增）：真实数据的球探报告 —— 俱乐部队内竞争 + 国家队竞争力 ──
       铁律：全部结论由真实名单/真实引擎判据推导（不出空话），数字只在报告内呈现。 */
    _attrTabScout(d) {
      let html = "";
      const myOvr = (window.PlayerSystem && PlayerSystem.effectiveOvr) ? PlayerSystem.effectiveOvr(d) : PlayerSystem.overall(d.player);
      const myFitOvr = PlayerSystem.overall(d.player);
      /* ── ① 俱乐部 / 梯队竞争 ── */
      const cv = (window.Youth && Youth.clubViewOf) ? Youth.clubViewOf(d) : null;
      const players = (cv && cv.players) || [];
      html += '<div class="panel"><div class="panel-title">球探报告 · ' + esc(cv ? cv.name : "俱乐部") + "队内竞争</div>";
      if (!players.length || !window.Pool) {
        html += '<div class="dim12">暂无可评估的名单数据。</div>';
      } else {
        const list = players.map(p => Array.isArray(p)
          ? { name: p[0], pos: p[2], age: p[1], ovr: p[4] }
          : { name: p.name, pos: p.position, age: p.age, ovr: p.overall })
          .filter(p => p.name !== d.player.name);
        const me = { name: d.player.name, pos: d.player.position, age: d.player.age, ovr: myOvr, me: true };
        const all = list.concat([me]);
        /* ★★ P127（2026-09-18 用户反馈）：判定口径改为「同位置出场顺位 × 当前阵型同位置名额」——
           旧版「全队第 15 位」是跨位置 OVR 排名（跟中卫比人数），对出场毫无意义。
           N = 当前阵型该位置的槽位数（Tactics.lineupOf 单源：球队阵型确定性 = 队伍+赛季）；
           顺位 k：k ≤ N 首发 · k ≤ N+1 轮换边缘（第一替补）· 其余替补；N=0 = 阵型无此槽位。 */
        const samePos = all.filter(p => p.pos === me.pos).sort((a, b) => (b.ovr || 0) - (a.ovr || 0));
        const myPosRank = samePos.findIndex(p => p.me) + 1;
        let N = 0;
        try {
          const lineup = (window.Tactics && Tactics.lineupOf) ? Tactics.lineupOf(cv, d.season) : null;
          if (lineup && lineup.form && Array.isArray(lineup.form.slots)) {
            N = lineup.form.slots.filter(pos => pos === me.pos).length;
          }
        } catch (e) { /* 阵型不可得时 N=0 → 走「无槽位」提示，不阻塞报告 */ }
        const posName = (CONFIG.POSITIONS[me.pos] || {}).name || me.pos;
        /* 顺位行（真实排序） */
        html += '<div class="dim12" style="margin:4px 0">「' + esc(posName) + "」位置出场顺位（按实战战力）——当前阵型有 <b>" + N + "</b> 个该位置出场名额：</div>";
        samePos.slice(0, 5).forEach((p, i) => {
          html += '<div class="row" style="padding:2px 0' + (p.me ? ";font-weight:700" : "") + '"><span>' +
            (i + 1) + ". " + esc(p.name) + (p.me ? ' <span class="pos-badge gold">你</span>' : "") +
            ' <span class="dim12">' + (p.age || "?") + " 岁</span></span>" +
            "<b style=\"font-variant-numeric:tabular-nums\">" + Math.round(p.ovr) + "</b></div>";
        });
        if (samePos.length > 5) html += '<div class="dim12">…共 ' + samePos.length + " 人竞争该位置。</div>";
        /* 结论（同位置口径：顺位 × 阵型名额） */
        let verdict;
        if (!N) {
          verdict = "<b style='color:var(--danger)'>当前阵型里没有「" + esc(posName) + "」槽位</b>——这套战术打不出你的位置。要么在「位置」页申请改打阵型内位置，要么等教练变阵。";
        } else if (myPosRank <= N) {
          verdict = "<b style='color:var(--success)'>已在首发之列</b>（同位置顺位第 " + myPosRank + " · 阵型 " + N + " 个「" + esc(posName) + "」名额）——保持出勤与状态，警惕身后人的追赶。";
        } else if (myPosRank <= N + 1) {
          const last = samePos[N - 1];
          const gp = last ? Math.max(0, Math.ceil((last.ovr || 0) - (me.ovr || 0))) : 0;
          verdict = "<b style='color:var(--gold)'>轮换边缘</b>（同位置顺位第 " + myPosRank + " · 阵型 " + N + " 个名额，距末位首发「" + esc(last ? last.name : "?") + "」OVR " + Math.round(last ? last.ovr : 0) + " 还差 " + gp + " 点）——多拿替补出场攒熟练度，或等轮换与伤病机会。";
        } else {
          verdict = "<b style='color:var(--danger)'>暂处替补</b>（同位置顺位第 " + myPosRank + " · 阵型仅 " + N + " 个名额，身前 " + (myPosRank - 1) + " 人排着）——考虑在「位置」页申请改打适配度更高的位置，或用表现吸引更低级别球队报价。";
        }
        html += '<div class="divider"></div><div style="font-size:13px;line-height:1.8">' + verdict + "</div>" +
          (myFitOvr !== myOvr ? '<div class="dim12" style="margin-top:4px">总评 ' + myFitOvr + " → 现位置实战 " + myOvr + "（含熟练度折扣与状态）。</div>" : "");
      }
      html += "</div>";
      /* ── ② 国家队竞争力（成年队判据只读复用；青训期/未成年给出梯队路径） ── */
      if (window.INTL && INTL.tryCallup) {
        html += '<div class="panel"><div class="panel-title">球探报告 · 国家队</div>';
        const res = INTL.tryCallup(State, "中国", "friendly");   // 纯评估：不写任何档内状态
        const sq = (window.nationSquadOf ? nationSquadOf("中国") : []) || [];
        const samePos = sq.filter(p => p.position === d.player.position).sort((a, b) => b.overall - a.overall);
        const ahead = samePos.filter(p => p.overall > myOvr).length;
        if (res.called) {
          html += '<div style="font-size:13px;line-height:1.8"><b style="color:var(--success)">已够格国家队</b>（友谊赛档评估：' + (res.role === "starter" ? "主力候选" : "替补候选") + "）——同位置排在你前面的现役国脚 " + ahead + " 人，你的出场顺位约第 " + (ahead + 1) + " 位。</div>";
        } else {
          html += '<div style="font-size:13px;line-height:1.8"><b>成年国家队</b>：暂未够格 —— ' + esc(res.reason || "评估中") + "。</div>";
        }
        if (samePos.length) {
          html += '<div class="dim12" style="margin:6px 0 2px">你身前的同位置现役国脚：</div>';
          samePos.filter(p => p.overall > myOvr).slice(0, 3).forEach(p => {
            html += '<div class="row" style="padding:2px 0"><span>' + esc(p.name) + ' <span class="dim12">' + (p.age || "?") + " 岁 · " + esc(p.position) + "</span></span><b style=\"font-variant-numeric:tabular-nums\">" + p.overall + "</b></div>";
          });
          if (!samePos.some(p => p.overall > myOvr)) html += '<div class="dim12">同位置暂无人压你一头。</div>';
        }
        /* 梯队（国少/国青）状态 —— P115-E 提供单源 */
        if (INTL.youthStatusOf) {
          const ys = INTL.youthStatusOf(State);
          if (ys) {
            html += '<div class="divider"></div><div class="dim12" style="margin-bottom:4px">梯队阶梯（16 岁起）：</div>';
            for (const t of ys.tiers) {
              html += '<div class="row" style="padding:2px 0"><span><b>' + esc(t.name) + "</b>" +
                ' <span class="dim12">' + t.ageWindow + " 岁 · 考察线 OVR " + t.line + (t.active ? " · 你在此年龄段" : "") + "</span></span>" +
                "<b style=\"font-variant-numeric:tabular-nums\">" + (t.career ? "出场 " + t.career.apps + " · 进球 " + t.career.goals : "尚未入选") + "</b></div>";
            }
            html += '<div class="dim12">' + esc(ys.note) + "</div>";
          }
        }
        html += "</div>";
      }
      return html;
    },

    /* ── 俱乐部（P103 · FM 式）：阵容（能力/定位/身份）+ 联赛积分榜 ──
       身份口径（FM 习惯）：全队按能力排序，前 11 = 主力，12-16 = 轮换，其余 = 替补；
       青训期不在职业联赛 → 阵容区显示青年队提示。 */
    CLUB_TABS: [["squad", "阵容"], ["table", "积分榜"], ["contract", "合同"], ["loan", "租借"]],

    /* FM 式阵容分组渲染（俱乐部页 / 国家队页共用单源）：
       入参 players = [{name,pos,age,nat,ovr}]；身份 = 全队能力排序 前11主力 / 12-16轮换 / 其余替补 */
    _squadPanelsHtml(players, meName) {
      const CATS = [
        ["门将", ["GK"]],
        ["后卫", ["CB", "LB", "RB"]],
        ["中场", ["CDM", "CM", "CAM", "LM", "RM"]],
        ["锋线", ["ST", "CF", "LW", "RW"]],
      ];
      const CAT_CN = { GK: "门将", CB: "中卫", LB: "左后卫", RB: "右后卫", CDM: "后腰", CM: "中场", CAM: "前腰", LM: "左中场", RM: "右中场", ST: "前锋", CF: "中锋", LW: "左边锋", RW: "右边锋" };
      /* ★ P301（玩家反馈「国家队名单变成 7 个人」显示层根因之一）：真实注入数据存在
         白名单外的位置码（如 club_events4 的 "AM"）——旧实现整行静默丢弃 = 名单凭空少人。
         修复：未归类位置统一落「其他」面板展示，绝不再丢行。 */
      const _known = new Set([].concat(...CATS.map(c => c[1])));
      const others = players.filter(p => !_known.has(p.pos));
      const rank = players.slice().sort((a, b) => (b.ovr || 0) - (a.ovr || 0));
      /* ★ P104-B3：档位数字单源化——transfer.js SQUAD_ROLE_CUT（租借门/挂牌门同口径） */
      const CUT = (window.Transfer && Transfer.SQUAD_ROLE_CUT) || { starter: 11, rotation: 16 };
      const roleOf = i => (i < CUT.starter ? { t: "主力", c: "var(--gold)" } : i < CUT.rotation ? { t: "轮换", c: "var(--success)" } : { t: "替补", c: "var(--text-dim)" });
      let out = "";
      for (const [cat, posList] of CATS) {
        const rows = players.filter(p => posList.indexOf(p.pos) >= 0).sort((a, b) => (b.ovr || 0) - (a.ovr || 0));
        if (!rows.length) continue;
        out += '<div class="panel"><div class="panel-title">' + cat + "（" + rows.length + "）</div>";
        for (const p of rows) {
          const i = rank.findIndex(r => r.name === p.name && r.pos === p.pos);
          const role = roleOf(Math.max(0, i));
          const me = p.name === meName;
          out += '<div class="list-item li-tight' + (me ? " win" : "") + '">' +
            '<span class="pos-badge" style="width:34px;text-align:center;flex-shrink:0">' + esc(p.pos) + "</span>" +
            '<div class="li-main" style="font-size:13px"><div class="li-title">' + esc(p.name) +
            (me ? ' <span class="pos-badge gold">你</span>' : "") +
            ' <span class="dim12">' + (CAT_CN[p.pos] || p.pos) + " · " + (p.age || "?") + "岁 · " + esc(p.nat || "") + "</span></div></div>" +
            '<span style="font-size:11px;color:' + role.c + ';flex-shrink:0">' + role.t + "</span>" +
            '<b style="width:26px;text-align:right;flex-shrink:0;font-variant-numeric:tabular-nums">' + (p.ovr || 0) + "</b></div>";
        }
        out += "</div>";
      }
      /* ★ P301：白名单外位置码兜底面板（见上注） */
      if (others.length) {
        const rows = others.slice().sort((a, b) => (b.ovr || 0) - (a.ovr || 0));
        out += '<div class="panel"><div class="panel-title">其他（' + rows.length + "）</div>";
        for (const p of rows) {
          const i = rank.findIndex(r => r.name === p.name && r.pos === p.pos);
          const role = roleOf(Math.max(0, i));
          const me = p.name === meName;
          out += '<div class="list-item li-tight' + (me ? " win" : "") + '">' +
            '<span class="pos-badge" style="width:34px;text-align:center;flex-shrink:0">' + esc(p.pos) + "</span>" +
            '<div class="li-main" style="font-size:13px"><div class="li-title">' + esc(p.name) +
            (me ? ' <span class="pos-badge gold">你</span>' : "") +
            ' <span class="dim12">' + (CAT_CN[p.pos] || p.pos) + " · " + (p.age || "?") + "岁 · " + esc(p.nat || "") + "</span></div></div>" +
            '<span style="font-size:11px;color:' + role.c + ';flex-shrink:0">' + role.t + "</span>" +
            '<b style="width:26px;text-align:right;flex-shrink:0;font-variant-numeric:tabular-nums">' + (p.ovr || 0) + "</b></div>";
        }
        out += "</div>";
      }
      out += '<div class="dim12" style="margin-top:4px">身份按全队能力排序划分：前 11 人主力，12-16 轮换，其余替补。能力随赛季与年龄演化。</div>';
      return out;
    },

    clubPage(m) {
      const d = State.data;
      const tab = this.CLUB_TABS.some(t => t[0] === this._clubTab) ? this._clubTab : "squad";
      let html = this.pageHead("俱乐部") +
        '<div class="row" style="gap:6px;flex-wrap:wrap;margin:0 0 10px">' +
        this.CLUB_TABS.map(t => '<button class="btn btn-sm ' + (t[0] === tab ? "btn-primary" : "btn-ghost") + '" data-clubtab="' + t[0] + '">' + t[1] + "</button>").join("") +
        "</div>";
      /* ★ P108：当前俱乐部统一走 Youth.clubViewOf —— 青训期取青年表，职业期取成年表。
         此前这里写 `teamById(d.clubId) || null`，青训期必然 null ⇒ 头卡退化成
         「未效力俱乐部 + ?」且阵容空白（用户 2026-09-17 截图）。 */
      const cv = (window.Youth && Youth.clubViewOf) ? Youth.clubViewOf(d)
        : ((window.teamById && teamById(d.clubId)) ? { team: teamById(d.clubId), name: teamById(d.clubId).name, leagueName: "", youth: false } : null);
      const isYouthClub = !!(cv && cv.youth);

      if (tab === "squad") {
        /* 球队头卡：队名 / 联赛 / 实力 / 当前联赛排名 */
        const tbl = (d.table || []).slice().sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga));
        const myPos = tbl.findIndex(t => t.id === d.clubId) + 1;
        const lgName = (cv && cv.leagueName) || "";
        html += '<div class="panel player-card"><div class="row" style="gap:10px">' +
          '<span class="pos-avatar" style="font-size:15px">' + esc((cv ? cv.name : "?").slice(0, 2)) + "</span>" +
          '<div><div style="font-size:17px;font-weight:800">' + esc(cv ? cv.name : "未效力俱乐部") + "</div>" +
          '<div class="dim12">' + esc(lgName) +
          (myPos > 0 ? " · 联赛第 <b style='color:var(--gold)'>" + myPos + "</b> 位" : "") +
          (cv ? " · 全队实力 " + Math.round(cv.strength || 0) : "") + "</div></div></div></div>";

        const players = (cv && cv.players) || [];
        /* ★★ P117 球队战术面板：阵型（真实历史注脚）+ 球场图 + 槽位占位。
           与转会适配同一单源（Tactics）——面板上的「空缺」就是转会窗的优先补强位。 */
        if (window.Tactics && cv && players.length) {
          /* ★★ P274（用户反馈「战术图里不出现玩家名字，哪怕 OVR 很高」）：把玩家本人
             注入阵容副本再生成战术图——此前 lineupOf 只吃 NPC 名单，玩家从不进首发图。
             只注入渲染副本：不改档内数据、不影响转会 fitAssess 的「现任」口径（双方
             竞技判定仍以纯 NPC 名单为准）；未挤进首发时在图下说明现任，给出成长指向。 */
          const squadPlus = players.slice();
          /* ★ 注入对象键名用 position（Tactics.normPlayers 消费 p.position；与下方
             _squadPanelsHtml 的 p.pos 消费是两条渲染线，键名口径不同——门禁 A1 实证） */
          if (window.PlayerSystem && !squadPlus.some(p => (Array.isArray(p) ? p[0] : p.name) === d.player.name)) {
            squadPlus.push({ name: d.player.name, position: d.player.position, age: d.player.age, nat: d.player.nationality, overall: PlayerSystem.overall(d.player) });
          }
          const lineup = Tactics.lineupOfDisplay ? Tactics.lineupOfDisplay(Object.assign({}, cv, { players: squadPlus }), d.season) : Tactics.lineupOf(Object.assign({}, cv, { players: squadPlus }), d.season);   /* ★ P301：展示用补位版，空槽兜底 */
          const inXI = lineup.slots.some(s => s.player && s.player.name === d.player.name);
          html += '<div class="panel"><div class="panel-title">球队战术 · ' + esc(lineup.form.name) + "</div>" +
            '<div class="dim12" style="margin-bottom:8px">' + esc(lineup.form.era) + "</div>" +
            Tactics.pitchSvg(lineup, { me: d.player.name }) +
            (inXI
              ? ""
              : '<div class="dim12" style="margin-top:6px">首发 11 人暂无你的位置——现任者 OVR 更高。提升总评与位置熟练度，把你的位置从图上抢回来。</div>') +
            '<div class="dim12" style="margin-top:6px">圆圈内数字 = 现任者 OVR；绿色（你）= 你本人；灰色「空」= 阵容缺口（转会窗优先补强位）；「客串」= 现任者踢的不是注册位置。</div></div>';
        }
        if (!players.length) {
          html += '<div class="panel"><div class="panel-title">' + (isYouthClub ? "青年队阵容" : "一线队阵容") + "</div><div class=\"dim12\">" +
            (isYouthClub ? "所属梯队的名单还没生成——重开一档即可恢复。" : "这支球队暂时没有可展示的名单。") + "</div></div>";
        } else {
          /* ★ P108 修复（同族第二处，成年侧同样中招）：队员在运行时是**对象**
             （{name,age,position,nationality,overall,real}，实测 epl 队 players[0]）——
             此前这里按**元组下标** p[0]/p[2]/p[1]/p[3]/p[4] 取值 ⇒ 名字/位置/年龄全变 undefined
             （成年阵容页同样显示空名；只因青训期阵容为空，用户先看到了青训那一面）。
             ⇒ 按对象取值；**保留元组分支**兜底（数据源注释仍是元组格式，防有人按注释写数据）。 */
          const list = players.map(p => Array.isArray(p)
            ? { name: p[0], pos: p[2], age: p[1], nat: p[3], ovr: p[4] }
            : { name: p.name, pos: p.position, age: p.age, nat: p.nationality, ovr: p.overall });
          /* ★★ P116（用户拍板「我是俱乐部中锋却不在名单里」）：球员本人**必须**出现在
             自家阵容页 —— 此前只渲染 team.players（生成名单），玩家条目从未入册。
             渲染期注入（不改档内数据）；排序/身份档与 NPC 同一套，OVR = 实时总评。 */
          if (window.PlayerSystem && !list.some(p => p.name === d.player.name)) {
            list.push({ name: d.player.name, pos: d.player.position, age: d.player.age, nat: d.player.nationality, ovr: PlayerSystem.overall(d.player) });
          }
          const title = isYouthClub
            ? '<div class="panel"><div class="panel-title">青年队阵容</div><div class="dim12">这是你所在的 ' + esc(cv.name) +
              " 梯队名单——先在这里抢下位置，一线队的大门才会打开。</div></div>"
            : "";
          html += title + this._squadPanelsHtml(list, d.player.name);
        }
      } else if (tab === "contract") {
        /* ── P104-B2 合同分页（D1~D8 已拍板）：合同卡 / 经纪人 / 主动续约 1+1 轮 ──
           奖金与佣金全部公式即时算（career.js 合同域单源），本页零硬编码数值。 */
        const youthPhase = d.phase === "academy";
        if (youthPhase) {
          html += '<div class="panel"><div class="panel-title">学徒合同</div>' +
            '<div class="dim12">青训期签的是学徒合同——没有谈判桌。升入一线队那天，经纪人会替你争第一份职业合同。</div></div>';
        } else {
          const c = d.contract || { years: 0, wage: 0 };
          const feeRate = Career.agentFeeRateOf(c.wage);
          const pr = (d.transfer && d.transfer.promise && d.transfer.promise.clubId === d.clubId) ? d.transfer.promise : null;
          const offers = (d.offers || []).slice().sort((a, b) => (b.fee || 0) - (a.fee || 0));
          const intel = offers.slice(0, 2).map(o => '<div class="list-item li-tight"><div class="li-main" style="font-size:13px">' +
            esc(o.clubName || "一家俱乐部") + '<span class="dim12"> · 愿出 ' + Career.fmtMoney(o.fee || 0) + " · 周薪 " + Career.fmtMoney(o.wage || 0) + "</span></div></div>").join("");
          html += '<div class="panel"><div class="panel-title">当前合同</div>' +
            '<div class="row"><span>周薪</span><b style="color:var(--gold)">' + Career.fmtMoney(c.wage || 0) + "</b></div><div class='divider'></div>" +
            /* ★ P220：到期显性化——「0 年」让玩家以为还能踢，实际已是自由身 */
            '<div class="row"><span>剩余年限</span><b>' + ((c.years || 0) <= 0
              ? '<span style="color:var(--gold)">已到期（自由身）</span>'
              : (c.years) + " 年") + "</b></div>" +
            ((c.years || 0) <= 0 ? '<div class="dim12" style="margin-top:4px">休赛期转会窗会同时备好<b style="color:var(--gold)">现俱乐部续约报价</b>与市场报价——去留都在「转会与合同」里决定。</div>' : "<div class='divider'></div>") +
            '<div class="row"><span>出场 / 进球奖金</span><b>' + Career.fmtMoney(Career.appearanceBonusOf(c.wage)) + " / " + Career.fmtMoney(Career.goalBonusOf(c.wage)) + "</b></div><div class='divider'></div>" +
            '<div class="row"><span>助攻奖金</span><b>' + Career.fmtMoney(Career.assistBonusOf(c.wage)) + "</b></div><div class='divider'></div>" +
            (c.releaseClause
              ? '<div class="row"><span>解约金条款</span><b>' + Career.fmtMoney(c.releaseClause.fee) + "</b></div>"
              : '<div class="row"><span>解约金条款</span><span class="dim12">无</span></div>') +
            /* ★ P105-B2 出场时间承诺（签约时俱乐部给的口径，赛末校验兑现） */
            (pr
              ? '<div class="row"><span>俱乐部承诺</span><b>' + (pr.role === "starter" ? "常备主力" : "重要轮换") +
                (pr.met === true ? ' <span style="color:var(--success)">✓ 已兑现</span>'
                 : pr.met === false ? ' <span style="color:var(--danger)">✗ 未兑现</span>'
                 : ' <span class="dim12">（本季待验）</span>') + "</b></div>"
              : "") +
            "</div>";
          html += '<div class="panel"><div class="panel-title">经纪人 · 老狐（佣金 ' + Math.round(feeRate * 100) + "%）</div>" +
            '<div class="row"><span>生涯总收入</span><b>' + Career.fmtMoney(d.stats.wageEarned || 0) + "</b></div><div class='divider'></div>" +
            '<div class="row"><span>其中奖金</span><b>' + Career.fmtMoney(d.stats.bonusEarned || 0) + "</b></div><div class='divider'></div>" +
            '<div class="row"><span>累计已付佣金</span><b>' + Career.fmtMoney(d.stats.agentFeesPaid || 0) + "</b></div>" +
            (intel ? '<div class="divider"></div><div class="dim12" style="margin-bottom:4px">老狐的风声——有人在打听你：</div>' + intel : '<div class="divider"></div><div class="dim12">眼下风平浪静，没有球队打听你。</div>') +
            "</div>";
          html += '<div class="panel"><div class="panel-title">续约谈判</div>' +
            ((c.years || 0) <= 2
              ? '<button class="btn btn-primary btn-block" id="ct-renew">让老狐去谈续约</button>' +
                '<div class="dim12" style="margin-top:6px">俱乐部报一次价：你可以接受、拒绝，或还价一次——还价之后，没有第三轮。</div>'
              : '<div class="dim12">合同还剩 ' + (c.years || 0) + " 年，俱乐部不着急。剩 2 年以内才上得了谈判桌。</div>") +
            "</div>";
          /* ── P104-B4 转会申请区块（规格 §3.2：请求挂牌走既有 evaluateRequest 管道；
             D6 冷却 = 单旗标 t.requested 每季重置，与休赛期卡同口径互斥防刷。渲染零 R） ── */
          const lg = (window.Transfer && Transfer.listingGate) ? Transfer.listingGate(State) : { ok: false, why: "转会系统暂不可用。" };
          const t4 = d.transfer || {};
          html += '<div class="panel"><div class="panel-title">转会申请' + this.hintBtn("hint-transfer", "转会申请 · 机制说明",
            "递交申请 = 公开要求离队，收不回。俱乐部按自身性质回应：" +
            "<br>· <b>放人</b>：挂牌，下一个转会窗（或休赛期转会卡）送来报价；" +
            "<br>· <b>驳回</b>：金主型/豪门型常见——之后可发起一次<b>联合队友施压</b>（看人缘与队长身份）；" +
            "<br>· <b style=\"color:var(--danger)\">雪藏</b>：跟豪门闹翻可能被内部停赛——无法出场、士气每周下滑，只能低头续约归队或硬扛到窗。" +
            "<br>合同最后一年俱乐部没有强留筹码，会直接放人。每季只能递交一次。") + '</div>';
          if (t4.listed) {
            html += '<div class="dim12">你已在转会市场被挂牌——休赛期的转会卡上会送来报价。走得体面一点。</div>';
          } else if (t4.frozen) {
            html += '<div class="dim12">你正被俱乐部雪藏（第 ' + t4.frozen.weeks + ' 周）。接受报价是唯一的出路，或者向管理层低头。</div>';
          } else if (t4.clauseTriggered) {
            html += '<div class="dim12">解约金条款已生效——决定权在条款，不在申请。</div>';
          } else if (t4.requested && t4.reqRefused && !t4.pressureUsed) {
            html += '<div class="dim12">申请被驳回了。老狐说还有最后一张牌：拉上更衣室的人，联名逼宫——<b>只有一次机会</b>，看人缘，也看俱乐部的强硬程度。</div>' +
              '<button class="btn btn-primary btn-block" id="ct-pressure" style="margin-top:8px">联合队友施压</button>';
          } else if (t4.requested) {
            html += '<div class="dim12">转会申请已递交，俱乐部还在掂量。本赛季没有第二次申请的机会。</div>';
          } else if (lg.ok) {
            html += '<button class="btn btn-ghost btn-block" id="ct-listreq">递交转会申请</button>' +
              '<div class="dim12" style="margin-top:6px">公开要求离队：球迷会烧你的球衣，俱乐部可能放人，也可能撕破脸把你雪藏——本赛季只能递交一次。</div>';
          } else {
            html += '<div class="dim12">' + esc(lg.why) + '</div>';
          }
          html += "</div>";
        }
      } else if (tab === "loan") {
        /* ── P104-B3 租借分页（数据层 applyLoan 全套已有，本页纯接线；渲染零 R） ──
           租期语义零新机制：赛季中申请 = 短租到本赛季结束；休赛期申请 = 租满下一季；
           归队点都是既有季末 backLoan（career.js 单源）。 */
        if (d.loan) {
          /* ★ P301：租期凭证展示（endSeason 由 applyLoan/applyMidSeason 落盘）；
             旧档无 endSeason 保留旧文案口径。 */
          const _loanEndTxt = d.loan.endSeason != null
            ? "外租 1 季（<b>S" + d.loan.endSeason + "</b> 赛季期满），期满自动回归母队。租借期间的每一场球，母队都看在眼里。"
            : "租期到" + (d.offseason ? "下赛季结束" : "本赛季结束") + "，期满自动回归母队。租借期间的每一场球，母队都看在眼里。";
          html += '<div class="panel"><div class="panel-title">外租进行中</div>' +
            '<div class="row"><span>母队</span><b>' + esc(d.loan.fromClubName || "母队") + "</b></div><div class='divider'></div>" +
            '<div class="row"><span>租借俱乐部</span><b style="color:var(--gold)">' + esc(d.loan.clubName || "?") + "</b></div>" +
            '<div class="dim12" style="margin-top:8px">' + _loanEndTxt + "</div></div>";
        } else if (d.phase === "academy") {
          html += '<div class="panel"><div class="panel-title">租借</div><div class="dim12">青训学徒不涉及外租——先签下职业合同。</div></div>';
        } else {
          const gate = (window.Transfer && Transfer.loanRequestGate) ? Transfer.loanRequestGate(State) : { ok: false, why: "转会系统暂不可用。" };
          const sq = (window.Transfer && Transfer.squadRoleOf) ? Transfer.squadRoleOf(State) : { rank: -1, role: "none", total: 0 };
          const ROLE_CN = { starter: "主力", rotation: "轮换", bench: "替补", none: "—" };
          const trust = (d.chars && d.chars.coach_trust != null) ? d.chars.coach_trust : 50;
          html += '<div class="panel"><div class="panel-title">外租练级 · 俱乐部放人条件</div>' +
            '<div class="row"><span>教练信任 ≥ 60</span><b style="color:' + (trust >= 60 ? "var(--success)" : "var(--danger)") + '">' + Math.round(trust) + "</b></div><div class='divider'></div>" +
            '<div class="row"><span>队内身份（非主力）</span><b style="color:' + (sq.role !== "starter" ? "var(--success)" : "var(--danger)") + '">' + (sq.rank >= 0 ? ROLE_CN[sq.role] + "（第 " + (sq.rank + 1) + " 人）" : "—") + "</b></div><div class='divider'></div>" +
            '<div class="row"><span>上场时间</span><b style="color:' + (gate.ok ? "var(--success)" : "var(--danger)") + '">' + (gate.ok ? "打不上比赛" : "踢得上球") + "</b></div>" +
            (gate.ok
              ? '<button class="btn btn-primary btn-block" id="loan-ask" style="margin-top:10px">让老狐去问外租下家</button>' +
                '<div class="dim12" style="margin-top:6px">现在申请 = 租到本赛季结束；休赛期申请 = 租满下一季。期满自动归队，母队合同不变。</div>'
              : '<div class="dim12" style="margin-top:8px">' + esc(gate.why) + "</div>") +
            "</div>";
        }
      } else {
        /* 积分榜（原排名页主体并入） */
        const tbl2 = (d.table || []).slice().sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga));
        if (tbl2.length) {
          const n = tbl2.length;
          html += '<div class="panel"><div class="panel-title">联赛积分榜</div>' +
            tbl2.map((t, i) => {
              const mine = t.id === d.clubId;
              const col = i < 4 ? "var(--success)" : (i >= n - 3 ? "var(--danger)" : "var(--text-dim)");
              /* ★ P118：胜/平/负列（用户拍板）。数据层本就全链路真实记录——
                 玩家场 season.js applyResult、他队轮次 simulateRound、缺席轮
                 career.js 同构补记（w/dr/l 与 p/pts 同源累加），此处纯渲染补齐。 */
              return '<div class="list-item' + (mine ? " win" : "") + ' li-tight"><span style="width:22px;color:' + col + ';font-weight:800">' + (i + 1) + "</span>" +
                '<div class="li-main" style="font-size:13px' + (mine ? ";font-weight:800;color:var(--gold)" : "") + '">' + esc(t.name) + "</div>" +
                '<div class="li-right muted-12" style="font-variant-numeric:tabular-nums">' + (t.p || 0) + "场 " +
                (t.w || 0) + "胜 " + (t.dr || 0) + "平 " + (t.l || 0) + "负 · " + (t.pts || 0) + "分</div></div>";
            }).join("") +
            '<div class="dim12" style="margin-top:6px">胜/平/负 = 本季真实赛果逐场累计（含缺席轮判负）。绿字 = 欧战区，红字 = 降级区（示意口径）。</div></div>';
        } else {
          html += '<div class="panel"><div class="panel-title">联赛积分榜</div><div class="dim12">本赛季积分榜尚未生成。</div></div>';
        }
      }

      this.finishPage(m, html);
      const self = this;
      self.bindHints(m);
      m.querySelectorAll("[data-clubtab]").forEach(b => {
        b.onclick = () => { self._clubTab = b.dataset.clubtab; self.clubPage($("#hub-sheet-body")); };
      });
      /* ── P104-B3 外租询问绑定：genLoanOffers 只在点击时调用（用户交互耗 R，渲染零 R） ── */
      if (tab === "loan") {
        const rerenderLoan = () => self.clubPage($("#hub-sheet-body"));
        const ask = $("#loan-ask");
        if (ask) ask.onclick = UIkit.guard(() => {
          const offers = Transfer.genLoanOffers(State, 3);
          if (!offers.length) { UIkit.toast("老狐问了一圈——眼下没有合适的下家。用训练打动教练，窗再开时机会更多。", ""); return; }
          let body = '<div style="font-size:13.5px;line-height:1.9;margin-bottom:10px">老狐拎着文件夹回来了——<b>' + offers.length + "</b> 家俱乐部愿意租你：</div>" +
            offers.map((o, i) => '<div class="list-item"><div class="li-main"><div class="li-title">' + esc(o.clubName) + '</div><div class="li-sub">' + esc(o.leagueName || "") + " · " + (o.playingTime === "starter" ? "能踢上主力" : "轮换阵容") + '</div></div><button class="btn btn-sm btn-primary" data-loanpick="' + i + '">走这家</button></div>').join("") +
            '<button class="btn btn-ghost btn-block" id="loan-no" style="margin-top:8px">再练练再说</button>';
          UIkit.modal("<h3>外租报价</h3>" + body);
          /* ★ modal 渲染在 body 层（不在 sheet 内）——绑定必须 document 级，m.querySelectorAll 摸不到（实测抓过） */
          document.querySelectorAll("[data-loanpick]").forEach(pb => {
            pb.onclick = UIkit.guard(() => {
              const o = offers[+pb.dataset.loanpick];
              const from = Transfer.applyLoan(State, o);
              UIkit.closeModal();
              State.save();
              UIkit.toast("租借加盟 " + UIkit.esc(o.clubName) + "——" + (d.offseason ? "租满一整季，赛季结束回 " : "租到本赛季结束，届时回 ") + UIkit.esc(from), "gold");
              rerenderLoan();
            }, "租借加盟");
          });
          const no = $("#loan-no");
          if (no) no.onclick = () => UIkit.closeModal();
        }, "询问外租");
      }
      /* ── P104-B2/B4 续约谈判绑定（1+1 轮；还价应允为确定性判定，零 R 调用；
         B4：签约步出条款三选一——不带 / 高薪+天价 / 低薪+低解约，D7 门槛由 renewalClauseQuote 判定） ── */
      if (tab === "contract" && d.phase !== "academy") {
        const rerender = () => self.clubPage($("#hub-sheet-body"));
        const rb = $("#ct-renew");
        if (rb) rb.onclick = UIkit.guard(() => {
          const q = Career.renewalQuote(d);
          /* B4 签约仪式：所有条款数字由 renewalClauseQuote 单源给出（零 R），UI 零算术。
             不选条款 = 标准合同（B2 旧路径语义连续：重建 contract 对象自然无解约金）。 */
          const signWith = (wage) => {
            const cq = (window.Transfer && Transfer.renewalClauseQuote) ? Transfer.renewalClauseQuote(State, q) : { eligible: false };
            const optsHtml = cq && cq.eligible
              ? '<button class="btn btn-ghost btn-block ec-opt" data-cm2="0">不带条款：周薪 ' + Career.fmtMoney(wage) + " × 3 年</button>" +
                '<button class="btn btn-ghost btn-block ec-opt" data-cm2="1">天价解约金：周薪 ' + Career.fmtMoney(wage) + " · 解约金 " + Career.fmtMoney(cq.high.fee) + "（俱乐部拿钱表诚意）</button>" +
                '<button class="btn btn-ghost btn-block ec-opt" data-cm2="2">跳板条款：周薪 ' + Career.fmtMoney(cq.low.wage) + " · 解约金 " + Career.fmtMoney(cq.low.fee) + "（让渡一成薪，买真离队自由）</button>"
              : '<button class="btn btn-ghost btn-block ec-opt" data-cm2="0">签字：周薪 ' + Career.fmtMoney(wage) + " × 3 年" +
                (cq && cq.why === "elite" ? "（豪门惯例：合同不含解约金条款）" : "") + "</button>";
            UIkit.modal("<h3>最后一页纸</h3>" +
              '<div style="font-size:13.5px;line-height:1.8;margin-bottom:10px">老狐把笔递过来：「条款自己挑，签完别哭。」' +
              (d.contract && d.contract.releaseClause ? '<br><span class="dim12">现合同的解约金条款将随新合同重新谈——不选就没有。</span>' : "") + "</div>" +
              optsHtml + '<button class="btn btn-ghost btn-block" id="ct-sgn-back" style="margin-top:6px">◂ 回到报价</button>');
            document.querySelectorAll("[data-cm2]").forEach(cb => {
              cb.onclick = UIkit.guard(() => {
                /* ★ P295：同族置灰——签下哪份前，其他条款先禁用（防双击双签竞态） */
                document.querySelectorAll("[data-cm2]").forEach(c2 => { c2.disabled = true; if (c2 !== cb) c2.classList.add("ec-opt-dim"); });
                const mode = +cb.dataset.cm2;
                const r = Career.renewalAccept(State, wage, mode === 0 ? 0 : mode === 1 ? cq.high.fee : cq.low.fee);
                State.save(); UIkit.closeModal();
                UIkit.toast(r.msg, "gold"); rerender();
              }, "签下新约");
            });
            const sb = $("#ct-sgn-back");
            if (sb) sb.onclick = () => UIkit.closeModal();
          };
          UIkit.modal("<h3>经纪人老狐的电话</h3>" +
            '<div style="font-size:13.5px;line-height:1.9;margin-bottom:12px">「俱乐部开口了：<b style="color:var(--gold)">周薪 ' + Career.fmtMoney(q.nw) + " × 3 年</b>。兄弟，这数拿出手不丢人。」</div>" +
            '<div class="row" style="gap:8px"><button class="btn btn-primary" id="ct-acc">接受</button>' +
            '<button class="btn btn-ghost" id="ct-cnt">还价</button>' +
            '<button class="btn btn-ghost" id="ct-ref">不谈了</button></div>');
          const a = $("#ct-acc"), ct = $("#ct-cnt"), rf = $("#ct-ref");
          if (a) a.onclick = UIkit.guard(() => {
            UIkit.closeModal();
            signWith(q.nw);
          }, "接受续约");
          if (rf) rf.onclick = () => { UIkit.closeModal(); UIkit.toast("谈判结束。合同还握在你手里。", ""); };
          if (ct) ct.onclick = UIkit.guard(() => {
            const c2 = Career.renewalCounter(q);
            if (c2.ok) {
              UIkit.closeModal();
              UIkit.modal("<h3>俱乐部咬咬牙……答应了</h3>" +
                '<div style="font-size:13.5px;line-height:1.9;margin-bottom:12px">「加到 <b style="color:var(--gold)">周薪 ' + Career.fmtMoney(c2.nw2) + " × 3 年</b>，最后报价。」老狐的声音都劈叉了，「签不签？」</div>" +
                '<div class="row" style="gap:8px"><button class="btn btn-primary" id="ct-acc2">签</button>' +
                '<button class="btn btn-ghost" id="ct-cls2">再想想</button></div>');
              const a2 = $("#ct-acc2"), cl2 = $("#ct-cls2");
              if (a2) a2.onclick = UIkit.guard(() => {
                UIkit.closeModal();
                signWith(c2.nw2);
              }, "接受还价");
              if (cl2) cl2.onclick = () => UIkit.closeModal();
            } else {
              UIkit.closeModal();
              /* D3 拍板：仅剩 1 年时谈判崩盘才伤信任（−3） */
              const lastYear = d.contract && (d.contract.years || 0) <= 1;
              if (lastYear) {
                d.chars = d.chars || {};
                d.chars.coach_trust = Math.max(0, (d.chars.coach_trust == null ? 50 : d.chars.coach_trust) - 3);
                State.save();
              }
              UIkit.modal("<h3>俱乐部摔了电话</h3>" +
                '<div style="font-size:13.5px;line-height:1.9;margin-bottom:12px">「就这价，爱签不签。」谈判终止。' +
                (lastYear ? '<br><b style="color:var(--danger)">合同只剩一年还这么闹，教练对你的信任受到了影响。</b>' : "") + "</div>" +
                '<div class="row" style="gap:8px"><button class="btn btn-ghost" id="ct-cls3">知道了</button></div>');
              const cl3 = $("#ct-cls3");
              if (cl3) cl3.onclick = () => { UIkit.closeModal(); rerender(); };
            }
          }, "还价");
        });
        /* ── P104-B4 转会申请 / 联合施压绑定：evaluateRequest/evaluatePressure 均用户交互耗 R；
           freeze 分支沿用休赛期卡消费模式（startFrozen + 冻结卡）。modal 在 body 层——document 级绑定。 ── */
        const lr = $("#ct-listreq");
        if (lr) lr.onclick = UIkit.guard(() => {
          UIkit.modal("<h3>递交转会申请</h3>" +
            '<div style="font-size:13.5px;line-height:1.9;margin-bottom:12px">老狐最后确认一次：「递上去就收不回了。球迷、更衣室、主席办公室——全都会知道。想清楚。」</div>' +
            '<div class="row" style="gap:8px"><button class="btn btn-primary" id="ct-lr-go">递交</button>' +
            '<button class="btn btn-ghost" id="ct-lr-no">算了</button></div>');
          const go = $("#ct-lr-go"), no = $("#ct-lr-no");
          if (no) no.onclick = () => UIkit.closeModal();
          if (go) go.onclick = UIkit.guard(() => {
            const r = Transfer.evaluateRequest(State);
            State.save(); UIkit.closeModal();
            if (r.outcome === "freeze") {
              Transfer.startFrozen(State, "递交转会申请撕破脸");
              UIkit.modal("<h3>翻脸了</h3>" +
                '<div style="font-size:13.5px;line-height:1.9;margin-bottom:12px">' + UIkit.esc(r.clubName || "俱乐部") + " 把申请拍在桌上，直接把你从名单里划掉了——<b style='color:var(--danger)'>雪藏。</b>看台上的骂声一浪高过一浪。</div>" +
                '<div class="row" style="gap:8px"><button class="btn btn-ghost" id="ct-lrz">认了</button></div>');
              const z = $("#ct-lrz");
              if (z) z.onclick = () => { UIkit.closeModal(); rerender(); };
            } else {
              UIkit.modal("<h3>" + UIkit.esc(r.title || "俱乐部回复") + "</h3>" +
                '<div style="font-size:13.5px;line-height:1.9;margin-bottom:12px">' + (r.body || "") + "</div>" +
                '<div class="row" style="gap:8px"><button class="btn btn-ghost" id="ct-lr2">知道了</button></div>');
              const b2 = $("#ct-lr2");
              if (b2) b2.onclick = () => { UIkit.closeModal(); rerender(); };
            }
          }, "递交申请");
        });
        const pr = $("#ct-pressure");
        if (pr) pr.onclick = UIkit.guard(() => {
          const r = Transfer.evaluatePressure(State);
          State.save();
          if (r.outcome === "freeze") {
            Transfer.startFrozen(State, "联名逼宫触怒管理层");
            UIkit.modal("<h3>玩火自焚</h3>" +
              '<div style="font-size:13.5px;line-height:1.9;margin-bottom:12px">联名信送到主席办公室的第二天，你就被叫进了办公室——<b style="color:var(--danger)">雪藏。</b>牵头的人，永远第一个被处理。</div>' +
              '<div class="row" style="gap:8px"><button class="btn btn-ghost" id="ct-pz">认了</button></div>');
            const z = $("#ct-pz");
            if (z) z.onclick = () => { UIkit.closeModal(); rerender(); };
          } else if (r.outcome === "listed") {
            UIkit.modal("<h3>俱乐部让步了</h3>" +
              '<div style="font-size:13.5px;line-height:1.9;margin-bottom:12px">更衣室集体站在了你这边。' + UIkit.esc(r.clubName || "俱乐部") + " 不想更衣室爆炸——「挂牌吧，为你的下一站要个好价钱。」休赛期的报价会送来。</div>" +
              '<div class="row" style="gap:8px"><button class="btn btn-ghost" id="ct-p2">知道了</button></div>');
            const b2 = $("#ct-p2");
            if (b2) b2.onclick = () => { UIkit.closeModal(); rerender(); };
          } else {
            UIkit.modal("<h3>僵局</h3>" +
              '<div style="font-size:13.5px;line-height:1.9;margin-bottom:12px">联名信石沉大海。' + UIkit.esc(r.clubName || "俱乐部") + " 硌得很：不放，不谈，也不撕破脸。你还得穿着这身训练服去训练基地。</div>" +
              '<div class="row" style="gap:8px"><button class="btn btn-ghost" id="ct-p3">知道了</button></div>');
            const b3 = $("#ct-p3");
            if (b3) b3.onclick = () => { UIkit.closeModal(); rerender(); };
          }
        }, "联合施压");
      }
    },

    /* ── 赛程 ── */
    /* ── 赛程 = 赛事日历（P100-A1：月历 / 全季列表双视图 + 逐场勾选跳过 + 快进档位） ── */
    schedPage(m) {
      const d = State.data;
      if (this._calView === undefined) this._calView = "month";
      if (!this._calYM && window.Calendar) this._calYM = Calendar.curMonthOf(State) || { y: d.season, m: 2 };
      const view = this._calView;
      const ym = this._calYM;
      const plannedCount = Object.keys(d.matchPlan || {}).length;

      let html = this.pageHead("赛事日历");
      /* 视图切换 + 快进档位 */
      html += '<div class="row" style="gap:8px;margin-bottom:8px">' +
        '<button class="btn btn-sm ' + (view === "month" ? "btn-primary" : "btn-ghost") + '" id="cal-v-month" style="flex:1">月历</button>' +
        '<button class="btn btn-sm ' + (view === "list" ? "btn-primary" : "btn-ghost") + '" id="cal-v-list" style="flex:1">全季赛程</button></div>';
      html += '<div class="row" style="gap:8px;margin-bottom:10px">' +
        '<button class="btn btn-sm btn-ghost" id="cal-fw7" style="flex:1">▸ 快进 7 天</button>' +
        '<button class="btn btn-sm btn-ghost" id="cal-fw30" style="flex:1">▸ 快进 30 天</button>' +
        '<button class="btn btn-sm btn-ghost" id="cal-fwnext" style="flex:1">▸ 下一场比赛</button></div>';
      html += '<div class="dim12" style="margin-bottom:8px">「下一场比赛」会停在赛前卡等你选；「快进 7/30 天」期间的比赛自动模拟完赛，结束后给汇总战报。点比赛切片可勾选 / 取消「跳过本场」' +
        (plannedCount ? "。已勾跳过 <b>" + plannedCount + "</b> 场" : "") + '。</div>';

      if (view === "month") {
        if (ym) {
          html += '<div class="panel"><div class="panel-title">' +
            '<button class="btn btn-sm btn-ghost" id="cal-prev" style="width:auto;padding:0 10px">◂</button> ' +
            ym.y + " 年 " + ym.m + " 月 " +
            '<button class="btn btn-sm btn-ghost" id="cal-next" style="width:auto;padding:0 10px">▸</button>' +
            '<button class="btn btn-sm btn-ghost" id="cal-today" style="width:auto;padding:0 10px;float:right">回到今天</button></div>' +
            Calendar.monthHtml(State, ym.y, ym.m) + "</div>";
        }
        html += '<div class="panel" style="margin-top:8px"><div class="panel-title">国际比赛日</div>' + this.intlSchedHtml() + "</div>";
      } else {
        html += '<div class="panel"><div class="panel-title">全季赛程（按日期）</div>' + Calendar.listHtml(State) + "</div>" +
          '<div class="panel" style="margin-top:8px"><div class="panel-title">国际比赛日</div>' + this.intlSchedHtml() + "</div>";
      }
      this.finishPage(m, html);

      const self = this;
      const rerender = () => self.schedPage($("#hub-sheet-body"));
      /* 勾选切换（委托给日历模块） */
      Calendar.bindChips(m, rerender);
      /* 视图切换 */
      const vm = $("#cal-v-month"), vl = $("#cal-v-list");
      if (vm) vm.onclick = UIkit.guard(() => { this._calView = "month"; rerender(); }, "月历");
      if (vl) vl.onclick = UIkit.guard(() => { this._calView = "list"; rerender(); }, "全季赛程");
      /* 快进档位：先收起覆盖层（推进链会接管主舞台），再交 GameLoop
         ★★ P291（Tap 玩家实锤「玩着玩着没比赛、重登又有比赛」_p291_fw_loop 复现）：
         休赛期里 GameLoop.advanceDays/advance 的语义 = decide 命中 offseason → 交棒
         休赛期卡，**日期永不前进**——玩家停在日历页反复快进 = 整月空日历 + 时间冻结 +
         零引导（重登才看到休赛期卡）。改为：offseason 时快进/下一场比赛不再进 GameLoop，
         直接收起日历、送玩家到休赛期入口卡并明说原因（结束休赛期 = 唯一开新赛季的门）。 */
      const offRedirect = (what) => {
        this.closeSheet();
        try { UIkit.toast("现在是休赛期（" + what + "）：请在下方卡片点「结束休赛期」开启新赛季", "gold"); } catch (e) { /* ignore */ }
        this.openOffseason();
      };
      const fw = n => UIkit.guard(() => {
        if (State.data.offseason) { offRedirect("快进"); return; }
        this.closeSheet(); GameLoop.advanceDays(n);
      }, "快进");
      const b7 = $("#cal-fw7"), b30 = $("#cal-fw30"), bn = $("#cal-fwnext");
      if (b7) b7.onclick = fw(7);
      if (b30) b30.onclick = fw(30);
      if (bn) bn.onclick = UIkit.guard(() => {
        if (State.data.offseason) { offRedirect("暂无比赛"); return; }
        this.closeSheet(); GameLoop.advance();
      }, "下一场比赛");
      /* 翻月 */
      const prev = $("#cal-prev"), next = $("#cal-next"), today = $("#cal-today");
      if (prev) prev.onclick = UIkit.guard(() => { let { y, m: mm } = this._calYM; mm--; if (mm < 1) { mm = 12; y--; } this._calYM = { y, m: mm }; rerender(); }, "上一月");
      if (next) next.onclick = UIkit.guard(() => { let { y, m: mm } = this._calYM; mm++; if (mm > 12) { mm = 1; y++; } this._calYM = { y, m: mm }; rerender(); }, "下一月");
      if (today) today.onclick = UIkit.guard(() => { this._calYM = Calendar.curMonthOf(State) || this._calYM; rerender(); }, "回到今天");
    },

    /* ── 国家队（P103 · FM 式）──
       概况：国脚生涯 / 当前征召状态 / 国足强度与国力加成 / 国家队阵容 / 国际比赛日
       国足发展：原「休赛期投资安排」的 NationDev 三线（理财 / 形象 / 国力加成）常驻内嵌
       青训投资：原「休赛期青训养成」的 OffseasonDev 投资动作常驻内嵌
       ★ 用户拍板：投资只是花钱，不受行动力 / 时间窗限制 —— 赛季中随时可投；
         数据层动作（investXxx / graduate）本来就是纯记账函数，无休赛期门；
         产出结算（苗子成长 / 理财到期）仍按赛季幂等 tick，节奏不变。 */
    NATION_TABS: [["overview", "概况"], ["develop", "国足发展"], ["academy", "青训投资"]],
    /** ★ P109：国家队名单基准 OVR = 当前 23 人（含国力加成直提升）的平均 overall，一位小数 */
    natSquadAvg() {
      if (!window.nationSquadOf) return null;
      const sq = nationSquadOf("中国") || [];
      if (!sq.length) return null;
      let s = 0; for (const p of sq) s += (p.overall || 0);
      return s / sq.length;
    },
    nationPage(m) {
      const d = State.data;
      const tab = this.NATION_TABS.some(t => t[0] === this._nationTab) ? this._nationTab : "overview";
      let html = this.pageHead("国家队") +
        '<div class="row" style="gap:6px;flex-wrap:wrap;margin:0 0 10px">' +
        this.NATION_TABS.map(t => '<button class="btn btn-sm ' + (t[0] === tab ? "btn-primary" : "btn-ghost") + '" data-nattab="' + t[0] + '">' + t[1] + "</button>").join("") +
        "</div>";
      /* ★ P103 探针修复：三个分支都提前 return，分页按钮绑定必须三分支共用
         （原版只在 overview 尾部绑 → develop/academy 页点分页无响应） */
      const self = this;
      const finishTabs = () => {
        self.finishPage(m, html);
        m.querySelectorAll("[data-nattab]").forEach(b => {
          b.onclick = () => { self._nationTab = b.dataset.nattab; self.nationPage($("#hub-sheet-body")); };
        });
      };

      if (tab === "overview") {
        const intl = d.intl || {};
        const career = intl.career || {};
        /* 当前征召状态：任意届次 squad.called → 在名单；友谊赛未打 → 在名单；
           青训期/未成年 → 不征召；否则落选提示 */
        let callup = null;
        const eds = intl.editions || {};
        for (const k of Object.keys(eds)) {
          const sq = eds[k] && eds[k].squad;
          if (sq && sq.called && !callup) callup = { role: sq.role, comp: k.indexOf("WCQ") === 0 ? "世预赛" : k };
        }
        const frPend = (intl.friendlyFixtures || []).find(f => !f.played);
        if (frPend && !callup) callup = { role: "squad", comp: "国际友谊赛" };
        let stLine, stColor;
        /* ★ P115/P300：年龄阶梯分流——<16 零国字号事件；16 岁起成年队门全开（青训期同样放行），
           国少/国青窗口与成年队并行为真实多通道；级别互斥=更高级别优先（成年队出场后梯队窗口关闭）。 */
        if (d.player.age < 16) {
          stLine = "未满 16 岁，不参加任何国字号考察——先在青年联赛练级，16 岁起走国少队（U17）阶梯。"; stColor = "var(--text-dim)";
        } else if (callup) {
          stLine = "在国家队名单中（" + esc(callup.comp) + (callup.role === "starter" ? " · 预计主力" : " · 替补席") + "）。"; stColor = "var(--success)";
        } else if (d.player.age <= 17) {
          stLine = "国少队（U17）考察年龄段 + 成年队门已开（16 岁准入）——10 月梯队评估，友谊赛窗口敲成年队大门。"; stColor = "var(--gold)";
        } else if (d.player.age <= 20) {
          stLine = "国青队（U20）考察年龄段 + 成年队窗口双通道——11 月梯队评估，友谊赛窗口敲成年队大门。"; stColor = "var(--text-dim)";
        } else {
          stLine = "尚未入选——友谊赛窗口是敲门砖：攒评分、攒名气，门槛会随赛事层级抬高。"; stColor = "var(--text-dim)";
        }
        const nd = window.NationDev ? NationDev.status(State) : null;
        const squadAvg = this.natSquadAvg();
        const yth = intl.youthCareer || {};
        html += '<div class="panel"><div class="panel-title">我的国脚生涯</div>' +
          '<div class="stat-row"><span>出场 <b>' + (career.apps || 0) + "</b></span><span>进球 <b>" + (career.goals || 0) + "</b></span><span>助攻 <b>" + (career.assists || 0) + "</b></span></div>" +
          (((yth.u17 && yth.u17.apps) || (yth.u20 && yth.u20.apps)) ? '<div class="stat-row"><span>国少(U17) <b>' + ((yth.u17 && yth.u17.apps) || 0) + " 场 " + ((yth.u17 && yth.u17.goals) || 0) + " 球</b></span>" +
            "<span>国青(U20) <b>" + ((yth.u20 && yth.u20.apps) || 0) + " 场 " + ((yth.u20 && yth.u20.goals) || 0) + " 球</b></span></div>" : "") +
          '<div class="divider"></div><div style="font-size:13px;color:' + stColor + '">' + stLine + "</div>" +
          (nd ? '<div class="divider"></div>' +
            (squadAvg != null ? '<div class="row"><span>名单基准 OVR</span><b>' + squadAvg.toFixed(1) + "</b>" +
              (nd.squadBonus > 0 ? ' <span style="color:var(--gold);font-size:12px">（国力投资直提升 +' + nd.squadBonus.toFixed(1) + "）</span>" : "") + "</div><div class=\"divider\"></div>" : "") +
            '<div class="row"><span>国足强度</span><b>' + nd.strength + '</b></div><div class="divider"></div>' +
            '<div class="row"><span>国力加成</span><b style="color:var(--gold)">+' + nd.boost.toFixed(2) + "</b></div>" +
            '<div class="dim12" style="margin-top:4px">投资会<b>立即抬升名单基准 OVR</b>（1:1 折算，即投即涨），并同步计入比赛强度——去「国足发展」投一笔，回来看名单就知道效果。</div>' : "") +
          "</div>";
        /* ★ P141 中国足球 · 国家指标（兴趣度 / 注册球员 / 世界排名） */
        if (nd && nd.meters) {
          const m = nd.meters;
          const iv = Math.max(0, Math.min(100, m.interest || 0));
          const tierTxt = iv <= 30 ? "冷清" : iv <= 55 ? "回温" : iv <= 75 ? "火热" : "全民狂热";
          const ms = (m.milestones || []);
          const lastMs = ms.length ? ms[ms.length - 1] : null;
          html += '<div class="panel"><div class="panel-title">中国足球 · 国家指标</div>' +
            '<div class="row"><span>国内足球兴趣度</span><b>' + iv.toFixed(0) + " / 100 · " + tierTxt + "</b></div>" +
            '<div class="stat-bar"><div class="stat-fill" style="width:' + iv + '%;background:var(--accent)"></div></div>' +
            '<div class="row" style="margin-top:6px"><span>注册球员</span><b>' + (m.regPlayers || 0).toFixed(1) + ' 万人</b></div>' +
            (nd.rank != null ? '<div class="divider"></div>' +
              '<div class="row"><span>世界排名（FIFA）</span><b style="color:var(--gold)">第 ' + nd.rank + " 位</b><span class=\"dim12\">共 " + nd.rankTotal + " 队 · " + nd.fifaPts + " 分</span></div>" +
              (nd.rankAsia ? '<div class="row"><span>亚洲排名</span><b>第 ' + nd.rankAsia + " 位</b></div>" : "") : "") +
            (lastMs ? '<div class="divider"></div><div class="dim12">最近战绩突破：' + esc(lastMs.label) + "（" + lastMs.season + " 赛季）</div>" : "") +
            '<div class="dim12" style="margin-top:4px">投资青训、捐建球场、国家队战绩突破都会抬升兴趣度与注册球员，并反馈到国家队实力（当前指标加成 <b style="color:var(--gold)">+' + (nd.meterBonus || 0).toFixed(2) + "</b>）；世界排名按真实 FIFA 积分规则随每一场国家队比赛结果变动。</div>" +
            "</div>";
        }
        /* ★★ P295：国家队荣誉榜（历届大赛成绩 + 赛会射手榜）——开档以来每届世界杯/
           亚洲杯/东亚杯/奥运会的冠军、中国队成绩逐届入档；射手榜为各届赛事累计。 */
        {
          const HONOR_NAME = { worldcup: "世界杯", asiacup: "亚洲杯", eaff: "东亚杯", olympic: "奥运会" };
          const honors = (intl.honors || []).slice(0, 12);
          const shooters = intl.shooters || {};
          const boardOf = (comp) => (shooters[comp] || []).slice().sort((a, b) => b.goals - a.goals).slice(0, 5);
          const meTop = (() => {   // 玩家在赛会射手榜的最好名次（跨赛事）
            let best = null;
            for (const comp of Object.keys(shooters)) {
              const b = shooters[comp].slice().sort((x, y) => y.goals - x.goals);
              const idx = b.findIndex(r => r.me);
              if (idx >= 0 && (best == null || idx < best.idx)) best = { comp, idx, goals: b[idx].goals };
            }
            return best;
          })();
          html += '<div class="panel"><div class="panel-title">国家队荣誉榜</div>';
          html += honors.length
            ? honors.map(h => '<div class="list-item li-tight"><div class="li-main"><div class="li-title">' + h.year + " " + (HONOR_NAME[h.type] || h.type) + '</div><div class="li-sub">冠军 ' + esc(h.champion) + " · 亚军 " + esc(h.runnerUp) + '</div></div><span style="font-size:12px;color:' + (h.china === "冠军" ? "var(--gold)" : "var(--text-dim)") + ';flex-shrink:0">中国 ' + esc(h.china) + "</span></div>").join("")
            : '<div class="dim12">开档后的大赛成绩会逐届入档——去踢世界杯、亚洲杯、东亚杯和奥运会，把成绩写进荣誉榜。</div>';
          /* 赛会射手榜（玩家上榜的赛事优先展示） */
          const boards = ["世界杯", "亚洲杯", "东亚杯", "奥运会"].filter(c => (shooters[c] || []).length);
          if (boards.length) {
            html += '<div class="divider"></div><div class="dim12" style="margin:6px 0 2px">赛会射手榜（生涯累计）</div>';
            for (const comp of boards.slice(0, 2)) {
              const rows = boardOf(comp);
              html += '<div class="dim12" style="font-size:11px;margin-top:4px">' + esc(comp) + "</div>" +
                rows.map((r, i) => '<div class="list-item li-tight"><span style="width:20px;color:' + (r.me ? "var(--gold)" : "var(--text-dim)") + ';font-weight:800">' + (i + 1) + '</span><div class="li-main" style="font-size:13px' + (r.me ? ";font-weight:800;color:var(--gold)" : "") + '">' + esc(r.name) + ' <span class="dim12" style="font-size:10px">' + esc(r.team || "") + '</span></div><b style="flex-shrink:0">' + r.goals + " 球</b></div>").join("");
            }
          }
          if (meTop) html += '<div class="dim12" style="margin-top:6px">你在「' + esc(meTop.comp) + '」射手榜排第 ' + (meTop.idx + 1) + "（" + meTop.goals + " 球）。</div>";
          html += "</div>";
        }
        /* 国家队阵容（与俱乐部页同一渲染器；国家队名单恒存在） */
        if (window.nationSquadOf) {
          const sq = nationSquadOf("中国") || [];
          if (sq.length) {
            /* ★★ P117 国家队战术面板（与俱乐部页同一单源） */
            if (window.Tactics) {
              /* ★★ P274：在名单中（征召/友谊赛 pending）时把玩家本人注入战术图副本
                 ——口径与下方 P116 名单注入一致：未征召不凭空进 23 人名单与首发图。 */
              const inSquad0 = !!(callup || frPend);
              const sqPlus = sq.slice();
              if (inSquad0 && window.PlayerSystem && !sqPlus.some(p => p.name === d.player.name)) {
                sqPlus.push({ name: d.player.name, position: d.player.position, age: d.player.age, nat: d.player.nationality, overall: PlayerSystem.overall(d.player) });
              }
              const nl = Tactics.lineupOfDisplay ? Tactics.lineupOfDisplay({ id: "nat_中国", name: "中国", players: sqPlus }, d.season) : Tactics.lineupOf({ id: "nat_中国", name: "中国", players: sqPlus }, d.season);   /* ★ P301：展示用补位版，空槽兜底 */
              const inXI = nl.slots.some(s => s.player && s.player.name === d.player.name);
              html += '<div class="panel"><div class="panel-title">国家队战术 · ' + esc(nl.form.name) + "</div>" +
                '<div class="dim12" style="margin-bottom:8px">' + esc(nl.form.era) + "</div>" +
                Tactics.pitchSvg(nl, { me: d.player.name }) +
                (inXI
                  ? ""
                  : (inSquad0
                    ? '<div class="dim12" style="margin-top:6px">你已在国家队名单中，但首发 11 人暂无你的位置——提升总评与位置熟练度，把你的位置从图上抢回来。</div>'
                    : '<div class="dim12" style="margin-top:6px">尚未获得征召——战术图只展示名单内球员。在俱乐部持续出场，国家队的大门会打开。</div>')) +
                '<div class="dim12" style="margin-top:6px">教练组的战术蓝图——你的位置熟练度决定你能不能挤进这套体系（见「属性 · 球探」页）；绿色（你）= 你本人。</div></div>';
            }
            /* ★ P116 同族修复：在名单中（任一届次征召/友谊赛 pending）才把玩家注入名单——
               未征召时 he's not in the squad，不能凭空进 23 人名单（与俱乐部口径不同）。 */
            const inSquad = !!(callup || frPend);
            const sqList = sq.map(p => ({ name: p.name, pos: p.position, age: p.age, nat: p.nationality, ovr: p.overall }));
            if (inSquad && window.PlayerSystem && !sqList.some(p => p.name === d.player.name)) {
              sqList.push({ name: d.player.name, pos: d.player.position, age: d.player.age, nat: d.player.nationality, ovr: PlayerSystem.overall(d.player) });
            }
            html += '<div class="panel"><div class="panel-title">中国国家队 · ' + sqList.length + " 人名单</div>" +
              this._squadPanelsHtml(sqList, d.player.name) +
              "</div>";
          }
        }
        html += this.intlSchedHtml();
      } else if (tab === "develop") {
        /* 国足发展 · NationDev 三线内嵌（与休赛期 NationDev.show 同一数据层） */
        const self = this;
        const rerender = () => self.nationPage($("#hub-sheet-body"));
        /* ★ P211：进入国足发展页即结算到期理财（tickSeason 按 season 幂等；
           原 tick 挂在死代码 entryCard 上 → 持仓「还剩 0 季」挂 7 季无人结算（玩家实录）。 */
        try { if (NationDev.settleDue) NationDev.settleDue(State); } catch (eSD) { /* 结算失败不阻断渲染 */ }
        /* ★ P301（玩家反馈「新建青训营一直没建成」实锤修复）：青训营落成/苗子成长/
           邀请赛兑现结算（OffseasonDev.tickSeason 按 season 幂等）。原先唯一触发点在
           休赛期「青训投资」UI——玩家不点进去就永不结算（P211 理财死代码同族病灶）。
           刻意只挂 UI 层：soak headless 不渲染 → 零随机消耗、零指纹漂移。 */
        try {
          if (window.OffseasonDev && OffseasonDev.tickSeason) {
            const _odt = OffseasonDev.tickSeason(State);
            if (_odt && _odt.ticked && (_odt.campBuilt || _odt.prospects || _odt.fame)) {
              UIkit.toast("青训动态：" + (_odt.campBuilt ? "青训营落成！" : "") +
                (_odt.prospects ? " 新苗子 " + _odt.prospects + " 人" : "") +
                (_odt.fame ? " 声望 +" + _odt.fame : ""), "gold");
            }
          }
        } catch (eODT) { /* 青训结算失败不阻断渲染 */ }
        const act = (fn, label) => UIkit.guard(() => {
          const r = fn();
          UIkit.toast(r.msg, r.ok ? "green" : "");
          State.save();
          if (r.ok) rerender();
        }, label);
        const st = NationDev.status(State);
        const n = NationDev.ensure(d);
        const pct = Math.max(0, Math.min(100, (st.boost / NationDev.CFG.BOOST_MAX) * 100));
        const squadAvgDev = this.natSquadAvg();
        html += '<div class="panel hl"><div class="panel-title">国力加成</div>' +
          '<div class="row"><span>当前加成</span><b style="color:var(--gold)">+' + st.boost.toFixed(2) + "</b></div>" +
          '<div class="stat-bar"><div class="stat-fill" style="width:' + pct + '%;background:var(--accent)"></div></div>' +
          (squadAvgDev != null ? '<div class="row" style="margin-top:6px"><span>国家队名单基准 OVR</span><b>' + squadAvgDev.toFixed(1) + "</b>" +
            (st.squadBonus > 0 ? '<span style="color:var(--gold);font-size:12px">投资直提升 +' + st.squadBonus.toFixed(1) + "</span>" : "") + "</div>" : "") +
          '<div class="dim12" style="margin-top:6px">每一笔投入都按 1:1 <b>立即抬升名单基准 OVR</b>（上表名单同步变强），并计入比赛强度。' +
          "累计有效投入 " + Career.fmtMoney(st.e) +
          (st.intlN ? "　·　国脚输送 " + st.intlN + " 人 +" + st.rosterBoost.toFixed(2) : "") +
          (st.next ? "　·　下一档 +" + st.next.boost + " 还需 " + Career.fmtMoney(st.next.needMoney) : "　·　已接近上限") + "</div>" +
          '<div class="divider"></div><div class="row"><span>可用资金</span><b style="color:var(--gold)">' + Career.fmtMoney(d.money) + "</b></div></div>";

        /* 线 1：投资理财 */
        html += '<div class="panel"><div class="panel-title">投资理财 · 个人资产</div>' +
          '<div class="dim12" style="margin-bottom:8px">锁定 3 季，到期结算；期望为负，赎回只返本金 50%。<b>理财不能致富，只是为了换个方式把钱花掉。</b></div>';
        NationDev.CFG_FIN.forEach(f => {
          html += '<button class="btn btn-ghost btn-block mb-8" data-ndfin="' + f.id + '" style="height:auto;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:2px;text-align:left;padding:10px 14px;line-height:1.5;white-space:normal">' +
            '<span style="font-size:13.5px;font-weight:700">' + esc(f.name) + " · 起投 " + Career.fmtMoney(f.min) + "</span>" +
            '<span style="font-size:11.5px;font-weight:400;color:var(--dim)">' + esc(f.desc) + "　波动 ±" + Math.round(f.vol * 100) + "%　锁定 " + f.lock + " 季</span></button>";
        });
        if (n.finance.holdings.length) {
          html += '<div class="divider"></div>';
          n.finance.holdings.forEach((h, i) => {
            html += '<div class="list-item"><div class="li-main"><div class="li-title">' + esc(h.name) + " · " + Career.fmtMoney(h.amount) +
              '</div><div class="li-sub">第 ' + h.dueSeason + " 赛季到期（还剩 " + Math.max(0, h.dueSeason - d.season) + " 季）</div></div>" +
              '<button class="btn btn-sm btn-ghost" data-ndredeem="' + i + '">赎回</button></div>';
          });
        }
        html += "</div>";

        /* 线 3：提升足球形象（每项目每季一次） */
        html += '<div class="panel"><div class="panel-title">提升足球形象 · 国内 / 国外</div>' +
          '<div class="dim12" style="margin-bottom:8px">每个项目每个赛季可投入一次，投入直接计入国力加成。</div>';
        NationDev.CFG_IMAGE.forEach(it => {
          const s2 = n.image.items[it.id] || { count: 0 };
          const used = s2.lastSeason === d.season;
          html += '<button class="btn btn-ghost btn-block mb-8" data-ndimg="' + it.id + '"' + (used ? " disabled" : "") + ' style="height:auto;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:2px;text-align:left;padding:10px 14px;line-height:1.5;white-space:normal">' +
            '<span style="font-size:13.5px;font-weight:700">' + esc(it.name) + " · " + Career.fmtMoney(it.cost) + "</span>" +
            '<span style="font-size:11.5px;font-weight:400;color:var(--dim)">' + esc(it.desc) + "　已投 " + s2.count + " 次" + (used ? "　本季已投" : "") + "</span></button>";
        });
        html += "</div>";

        html += '<div class="panel"><div class="panel-title">投资理财账目</div>' +
          '<div class="stat-row"><span>累计本金 ' + Career.fmtMoney(n.finance.principal) + "</span><span>累计回收 " + Career.fmtMoney(n.finance.payout) +
          "</span><span>已结算 " + n.finance.settled + " 笔</span></div></div>";

        finishTabs();
        m.querySelectorAll("[data-ndfin]").forEach(b => { b.onclick = act(() => NationDev.investFinance(State, b.dataset.ndfin), "买入"); });
        m.querySelectorAll("[data-ndredeem]").forEach(b => { b.onclick = act(() => NationDev.redeemFinance(State, +b.dataset.ndredeem), "赎回"); });
        m.querySelectorAll("[data-ndimg]").forEach(b => { b.onclick = act(() => NationDev.investImage(State, b.dataset.ndimg), "形象投入"); });
        return;
      } else {
        /* 青训投资 · OffseasonDev 内嵌（与休赛期青训界面同一数据层） */
        const rerender = () => self.nationPage($("#hub-sheet-body"));
        const act = (fn, label) => UIkit.guard(() => {
          const r = fn();
          UIkit.toast(r.msg, r.ok ? "green" : "");
          State.save();
          if (r.ok) rerender();
        }, label);
        const a = OffseasonDev.ensure(d);
        const C = OffseasonDev.CFG;
        const fmtM = v => Career.fmtMoney(v);
        const schoolTxt = a.school.built ? "已建成（每季产苗 35%）" : "建设进度 " + a.school.paidSeasons + " / " + C.SCHOOL.seasons + " 期";
        const campTxt = a.camp.built ? "已建成（每季产苗 45%）" : (a.camp.stage === 1 ? "建设中（下赛季落成）" : "未新建");
        /* ★ P186 高阶项目状态行 */
        const proteamTxt = a.proteam.built ? "已共建（每季产苗 55%）" : "未共建";
        const centerTxt = a.center.built ? "已落成（每季产苗 65%）" : "建设进度 " + (a.center.paidSeasons || 0) + " / " + C.CENTER.seasons + " 期";
        html += '<div class="panel hl"><div class="panel-title">青训家底</div>' +
          '<div class="row"><span>可用资金</span><b style="color:var(--gold)">' + fmtM(d.money) + "</b></div><div class='divider'></div>" +
          '<div class="row"><span>足球学校</span><b>' + schoolTxt + "</b></div><div class='divider'></div>" +
          '<div class="row"><span>青训营</span><b>' + campTxt + "</b></div><div class='divider'></div>" +
          '<div class="row"><span>职业梯队</span><b>' + proteamTxt + "</b></div><div class='divider'></div>" +
          '<div class="row"><span>青训中心</span><b>' + centerTxt + "</b></div><div class='divider'></div>" +
          '<div class="row"><span>已办邀请赛</span><b>' + a.invite.count + " 届</b></div>" +
          '<div class="dim12" style="margin-top:6px">投资不限时间——赛季中也能为青训投钱；苗子成长与邀请赛兑现仍按赛季更替结算。</div></div>';

        html += '<div class="panel"><div class="panel-title">投资项目</div>' +
          '<button class="btn btn-ghost btn-block mb-8" data-od="s">办小型青少年邀请赛 · ' + fmtM(C.INVITE_SMALL.cost) + "（声望+800）</button>" +
          '<button class="btn btn-ghost btn-block mb-8" data-od="b">办大型青少年邀请赛 · ' + fmtM(C.INVITE_BIG.cost) + "（声望+2000，苗子率更高）</button>" +
          '<button class="btn btn-ghost btn-block mb-8" data-od="school">' + (a.school.built ? "足球学校追加运营 · " : "足球学校本期投入 · ") + fmtM(C.SCHOOL.costPerSeason) + "</button>" +
          '<button class="btn btn-ghost btn-block mb-8" data-od="camp">新建青训营 · ' + fmtM(C.CAMP.cost) + "（下季落成，每季 45% 出高潜苗）</button>" +
          '<button class="btn btn-ghost btn-block mb-8" data-od="donate">捐赠家乡球场 · ' + fmtM(C.DONATE.cost) + "（声望+500）</button>" +
          /* ★ P186 高阶项目（钱有地方用：职业梯队共建 / 全国青训中心） */
          '<button class="btn btn-ghost btn-block mb-8" data-od="proteam">' + (a.proteam.built ? "职业梯队已共建 ✓" : "职业梯队共建 · " + fmtM(C.PROTEAM.cost) + "（每季 55% 出 80-90 潜苗）") + "</button>" +
          '<button class="btn btn-ghost btn-block mb-8" data-od="center">' + (a.center.built ? "青训中心已落成 ✓" : "青训中心本期投入 · " + fmtM(C.CENTER.costPerSeason) + "（3 期，每季 65% 出 83-92 潜苗）") + "</button>" +
          '<button class="btn btn-ghost btn-block" data-od="donate">捐赠家乡球场 · ' + fmtM(C.DONATE.cost) + "（声望+500）</button></div>";

        if (a.prospects.length) {
          html += '<div class="panel"><div class="panel-title">青训苗子（' + a.prospects.length + " 人）</div>";
          a.prospects.forEach((p, i) => {
            const ready = (p.seasons || 0) >= C.GRAD_SEASONS;
            html += '<div class="list-item"><div class="li-main"><div class="li-title">' + esc(p.name) + " · " + esc(OffseasonDev.POS_CN ? OffseasonDev.POS_CN[p.position] || p.position : p.position) + '</div>' +
              '<div class="li-sub">潜力 ' + p.pot + " · " + esc(p.source) + " · 已培养 " + (p.seasons || 0) + " 季" + (ready ? " · <span class='c-gold'>可提拔</span>" : "") + "</div></div>" +
              (ready ? '<button class="btn btn-sm btn-gold" data-odgrad="' + i + '">提拔</button>' : "") + "</div>";
          });
          html += "</div>";
        }
        if (a.graduates.length) {
          const ST = { dev: "在俱乐部发展", pro: "普通职业球员", intl: "已入选国足" };
          html += '<div class="panel"><div class="panel-title">已提拔（' + a.graduates.length + " 人）</div>" +
            a.graduates.slice(-10).map(g => '<div class="li-sub">' + esc(g.name) + " · " + esc((OffseasonDev.POS_CN && OffseasonDev.POS_CN[g.position]) || g.position) + " · 潜力 " + (g.finalPot != null ? g.finalPot : g.pot) +
              " · " + esc(g.gradClubName || "国内联赛") + " · " + (ST[g.status] || "普通职业球员") + "（" + g.season + " 赛季提拔）</div>").join("") + "</div>";
        }

        finishTabs();
        const OD = OffseasonDev;
          m.querySelectorAll("[data-od]").forEach(b => {
          b.onclick = act(() => ({
            s: () => OD.investInvite(State, false),
            b: () => OD.investInvite(State, true),
            school: () => OD.investSchool(State),
            camp: () => OD.investCamp(State),
            donate: () => OD.donate(State),
            /* ★ P186 高阶项目 */
            proteam: () => OD.investProteam(State),
            center: () => OD.investCenter(State),
          }[b.dataset.od]()), "青训投资");
        });
        m.querySelectorAll("[data-odgrad]").forEach(b => {
          b.onclick = act(() => OD.graduate(State, +b.dataset.odgrad), "提拔苗子");
        });
        return;
      }

      finishTabs();
    },

    /* ── 简况（P103 两页签 → P128 六页签：概况 / 赛季 / 财富 / 代言 / 置业 / 荣誉）──
       ★ P128（用户拍板 Q1）：荣誉/排行保留；赛季页 = seasonStats 首次 UI 化（赛季中随时看本季成绩）；
         置业页 = 救活 housingLevels/carLevels 死代码（P97「配置齐全 ≠ 机制生效」同族，纯接线零新机制）；
         财富/代言两页签 P128b/c 开放（先占位，文案不承诺机制细节）。
       ★ P102 精神延续：临时效果 / 长期分红 / 球星羁绊集中展示不变（概况页）。
       ★ P118 纪律：六分支全部共用 finishTabs——任何分支提前 return 前必须已绑页签（同族坑 2 犯禁三犯）。 */
    LIFE_TABS: [["life", "概况"], ["season", "赛季"], ["finance", "财富"], ["commerce", "代言"], ["assets", "置业"], ["honor", "荣誉"]],
    lifePage(m) {
      const d = State.data;
      const tab = this.LIFE_TABS.some(t => t[0] === this._lifeTab) ? this._lifeTab : "life";
      let html = this.pageHead("简况") +
        '<div class="row" style="gap:6px;flex-wrap:wrap;margin:0 0 10px">' +
        this.LIFE_TABS.map(t => '<button class="btn btn-sm ' + (t[0] === tab ? "btn-primary" : "btn-ghost") + '" data-lifetab="' + t[0] + '">' + t[1] + "</button>").join("") +
        "</div>";
      const self = this;
      const finishTabs = () => {
        self.finishPage(m, html);
        m.querySelectorAll("[data-lifetab]").forEach(b => {
          b.onclick = () => { self._lifeTab = b.dataset.lifetab; self.lifePage($("#hub-sheet-body")); };
        });
      };

      /* ── P128 赛季页：本季数据 / 联赛杯赛形势 / 本季荣誉 / 上季回顾（全读现有字段，渲染零 R）──
         ★ 数值铁律红线（Q3 拍板）：不做金靴/助攻王「冲击进度」——比较制 NPC 阈值是隐藏信息。 */
      if (tab === "season") {
        const ss = d.seasonStats || {};
        const apps = ss.apps || 0;
        const avgR = apps ? Math.round((ss.ratingSum / apps) * 10) / 10 : 0;
        const isGK = d.player && d.player.position === "GK";
        html += '<div class="panel"><div class="panel-title">本季数据</div>' +
          (d.offseason ? '<div class="dim12" style="margin-bottom:6px">休赛期——本季账本已结清，完整成绩见下方「上季回顾」。</div>' : "") +
          '<div class="row"><span>出场</span><b>' + apps + "</b></div><div class='divider'></div>" +
          (isGK
            ? '<div class="row"><span>扑救</span><b>' + (ss.saves || 0) + "</b></div><div class='divider'></div>"
            : '<div class="row"><span>进球 / 助攻</span><b>' + (ss.goals || 0) + " / " + (ss.assists || 0) + "</b></div><div class='divider'></div>") +
          '<div class="row"><span>场均评分</span><b>' + (apps ? avgR.toFixed(1) : "—") + "</b></div><div class='divider'></div>" +
          '<div class="row"><span>全场最佳</span><b>' + (ss.motm || 0) + "</b></div>" +
          "</div>";
        /* 联赛与杯赛形势（与俱乐部页同口径：d.table 按 pts+净胜球排序；渲染零 R） */
        const tbl = (d.table || []).slice().sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga));
        const myIdx = tbl.findIndex(t => t.id === d.clubId);
        const fx = d.fixtures || [];
        const played = fx.filter(f => f.played).length;
        const cupName = (cup, stages) => {
          if (!cup) return "—";
          if (cup.alive === "champion") return '<b style="color:var(--gold)">已夺冠</b>';
          if (cup.alive === false) {
            const nm = (stages && cup.roundNames && stages[cup.stage]) ? cup.roundNames[stages[cup.stage]] : "";
            return '<span style="color:var(--danger)">' + (nm ? "止步" + nm : "已出局") + "</span>";
          }
          return cup.alive ? "进行中" : "—";
        };
        html += '<div class="panel"><div class="panel-title">联赛与杯赛形势</div>' +
          '<div class="row"><span>联赛排名</span><b>' + (myIdx >= 0 ? "第 " + (myIdx + 1) + " 名 / 共 " + tbl.length + " 队" : "—") + "</b></div><div class='divider'></div>" +
          '<div class="row"><span>赛程进度</span><b>' + (total => total ? played + " / " + total + " 场" : "—")(fx.length) + "</b></div><div class='divider'></div>" +
          '<div class="row"><span>国内杯赛</span><b>' + cupName(d.cup, [16, 8, 4, 2]) + "</b></div><div class='divider'></div>" +
          (d.cc ? '<div class="row"><span>' + (d.cc.cupName || "洲际冠军杯") + "</span><b>" + cupName(d.cc, null) + "</b></div><div class='divider'></div>" : "") +
          (d.scc ? '<div class="row"><span>' + (d.scc.cupName || "洲际二级杯") + "</span><b>" + cupName(d.scc, null) + "</b></div>" : "") +
          "</div>";
        /* 本季荣誉（季中国际大赛入账即可见） */
        const seasonTrophies = (d.trophies || []).filter(t => t && t.season === d.season);
        html += '<div class="panel"><div class="panel-title">本季荣誉（' + seasonTrophies.length + "）</div>" +
          (seasonTrophies.length
            ? seasonTrophies.map(t => '<div class="list-item li-tight"><b>' + esc(t.name) + "</b></div>").join("")
            : '<div class="dim12">本赛季还没有奖杯入账——赛季结算与大赛决赛是主要的入账时点。</div>') +
          "</div>";
        /* 上季回顾 */
        const log = d.careerLog || [];
        const last = log[log.length - 1];
        html += '<div class="panel"><div class="panel-title">上季回顾</div>' +
          (last
            ? '<div class="row"><span>效力球队</span><b>' + esc(last.club || "—") + "（" + esc(last.league || "—") + "）</b></div><div class='divider'></div>" +
              '<div class="row"><span>出场 / 进球 / 助攻</span><b>' + (last.apps || 0) + " / " + (last.goals || 0) + " / " + (last.assists || 0) + "</b></div><div class='divider'></div>" +
              '<div class="row"><span>场均评分 / 联赛排名</span><b>' + (last.avgRating != null ? last.avgRating : "—") + " / " + (last.rank ? "第 " + last.rank + " 名" : "—") + "</b></div>" +
              ((last.awards && last.awards.length)
                ? "<div class='divider'></div><div class='dim12'>季末奖项：" + esc(last.awards.join("、")) + "</div>"
                : "")
            : '<div class="dim12">职业生涯的第一季还在脚下——踢完它，这里会留下第一行履历。</div>') +
          "</div>";
        finishTabs();
        return;
      }

      /* ── P128c 财富页签（定期/基金/实业 v3/流水；后端单源 js/finance.js；渲染零 R）── */
      if (tab === "finance") {
        const Fin = window.Finance;
        if (!Fin) {
          html += '<div class="panel"><div class="panel-title">理财通</div><div class="dim12">财富系统加载中，请刷新页面。</div></div>';
          finishTabs();
          return;
        }
        const F = Fin.ensure(d);
        const bizDefOf = t => Fin.bizDef(t);
        /* 财务概览 */
        const bizM = Fin.bizMonthly(d);
        const depSum = F.deposits.reduce((a, x) => a + x.amount, 0);
        const fundSum = ((window.CONFIG && CONFIG.FINANCE.FUNDS) || []).reduce((a, def) => { const s = F.funds[def.id]; return a + (s && s.shares > 0 ? Math.round(s.shares * s.nav) : 0); }, 0);
        html += '<div class="panel"><div class="panel-title">财务概览</div>' +
          '<div class="row"><span>存款（活期）</span><b>' + Career.fmtMoney(d.money) + "</b></div><div class='divider'></div>" +
          '<div class="row"><span>定期在途</span><b>' + Career.fmtMoney(depSum) + "（" + F.deposits.length + " 笔）</b></div><div class='divider'></div>" +
          '<div class="row"><span>基金市值</span><b>' + Career.fmtMoney(fundSum) + "</b></div><div class='divider'></div>" +
          '<div class="row"><span>产业月分红</span><b style="color:var(--gold)">' + Career.fmtMoney(bizM) + " / 月</b></div>" +
          '<div class="dim12" style="margin-top:6px">月结每 30 天一次：定期到期回本息 · 基金按净值波动 · 产业分红入账。</div></div>';
        /* ★ P201 彩票中奖（广告点位）：完播中头奖入活期，3 次/季（配额单源 Ads.lotteryLeft） */
        const lotLeft = (window.Ads && Ads.lotteryLeft) ? Ads.lotteryLeft(State) : 0;
        const lotPrize = (window.CONFIG && CONFIG.FINANCE.LOTTERY_PRIZE) || 5000000;
        html += '<div class="panel"><div class="panel-title">彩票站 · 幸运一击</div>' +
          '<div class="row"><span>头奖奖金</span><b style="color:var(--gold)">' + Career.fmtMoney(lotPrize) + "</b></div><div class='divider'></div>" +
          '<div class="row"><span>本季剩余机会</span><b>' + lotLeft + " / " + ((window.Ads && Ads.LOTTERY_PER_SEASON) || 3) + "</b></div>" +
          '<div style="margin-top:10px"><button class="btn btn-primary" id="ad-lottery"' + (lotLeft <= 0 ? " disabled" : "") + ">" +
          (lotLeft > 0 ? "看视频 · 领取头奖" : "本季手气已用完") + "</button></div>" +
          '<div class="dim12" style="margin-top:6px">完整观看视频即中头奖，奖金直接入活期账户；每赛季刷新 3 次机会。</div></div>';
        /* 定期存款 */
        html += '<div class="panel"><div class="panel-title">定期存款（起存 ' + Career.fmtMoney((window.CONFIG && CONFIG.FINANCE.DEPOSIT_MIN) || 50000) + "）</div>";
        html += ((window.CONFIG && CONFIG.FINANCE.DEPOSITS) || []).map((dep, i) =>
          '<div class="list-item li-tight"><div class="li-main"><div class="li-title">' + esc(dep.name) + '</div>' +
          '<div class="li-sub">' + dep.months + " 个月 · 年化 " + (dep.rate * 100).toFixed(1) + '%（到期一次性本息）</div></div>' +
          '<button class="btn btn-sm btn-primary" data-depbuy="' + i + '">存入</button></div>').join("");
        if (F.deposits.length) {
          html += "<div class='divider'></div>" + F.deposits.map((dep, i) => {
            const left = Math.max(0, dep.matureDay - (d.dayIndex || 0));
            return '<div class="list-item li-tight"><div class="li-main"><div class="li-title">' + esc(dep.name || "定期") + ' · ' + Career.fmtMoney(dep.amount) + '</div>' +
              '<div class="li-sub">年化 ' + ((dep.rate || 0) * 100).toFixed(1) + "% · 剩 " + left + " 天到期（本息 " + Career.fmtMoney(Math.round(dep.amount * (1 + dep.rate))) + "）</div></div>" +
              '<button class="btn btn-sm btn-ghost" data-depwit="' + i + '">提前支取</button></div>';
          }).join("") + '<div class="dim12" style="margin-top:4px">提前支取只退本金、放弃全部利息。</div>';
        }
        html += "</div>";
        /* 基金 */
        html += '<div class="panel"><div class="panel-title">基金（月度净值 · 有涨有跌）</div>' +
          ((window.CONFIG && CONFIG.FINANCE.FUNDS) || []).map(def => {
            const s = F.funds[def.id] || { nav: 1, shares: 0, invested: 0 };
            const mv = Math.round(s.shares * s.nav);
            const pnl = mv - Math.round(s.invested);
            return '<div class="list-item li-tight"><div class="li-main"><div class="li-title">' + esc(def.name) + '</div>' +
              '<div class="li-sub">净值 ' + s.nav.toFixed(3) + (s.shares > 0 ? " · 持有市值 " + Career.fmtMoney(mv) + "（盈亏 " + (pnl >= 0 ? "+" : "") + Career.fmtMoney(pnl) + "）" : " · 月波动 " + (def.lo * 100).toFixed(0) + "%～" + (def.hi * 100).toFixed(0) + "%") + '</div></div>' +
              '<div class="li-right" style="display:flex;gap:6px"><button class="btn btn-sm btn-primary" data-fbuy="' + def.id + '">买入</button>' +
              (s.shares > 0 ? '<button class="btn btn-sm btn-ghost" data-fsell="' + def.id + '">清仓</button>' : "") + "</div></div>";
          }).join("") +
          '<div class="dim12" style="margin-top:4px">净值每月随行情波动（红涨绿跌）；长期期望为正但高波动档大起大落——别把养老钱全押成长型。</div></div>';
        /* 实业投资（v3 多座 + 爬坡 + 档价递增） */
        html += '<div class="panel"><div class="panel-title">实业投资（多座经营 · 缓慢回本）</div>' +
          '<div class="dim12" style="margin-bottom:6px">开业首月只有成熟分红的 15%，约 7-8 个月走向正轨；同类第 6 座起每 5 座涨价一档——**分红不变、越买越贵**，量力而行。</div>' +
          ((window.CONFIG && CONFIG.FINANCE.BIZ) || []).map(def => {
            const n = Fin.bizCountOf(d, def.id);
            const built = F.biz.filter(b => b.type === def.id);
            const legacyN = built.filter(b => b.legacy).length;
            const frozen = Fin.legacyFrozen(d);
            const matureN = built.filter(b => b.curMonthly >= b.matureMonthly).length;
            const monthNow = built.reduce((a, b) => a + (b.curMonthly || 0), 0);
            const nextP = Fin.bizPriceAt(d, def.id, n);
            const legacyTag = legacyN ? ' <span style="color:var(--gold)">· 继承产业 ×' + legacyN + (frozen ? "（托管中，签约后交割）" : "（已交割）") + "</span>" : "";
            return '<div class="list-item li-tight"><div class="li-main"><div class="li-title">' + esc(def.name) + " ×" + n + legacyTag + '</div>' +
              '<div class="li-sub">当前月分红 ' + Career.fmtMoney(monthNow) + "（成熟 " + matureN + "/" + n + "） · 成功率 " + Math.round(def.success * 100) + "% · 下一座 " + Career.fmtMoney(nextP) + '</div></div>' +
              '<button class="btn btn-sm btn-primary" data-bizbuy="' + def.id + '"' + (d.money < nextP ? " disabled" : "") + '>购置</button></div>';
          }).join("") +
          '<div class="dim12" style="margin-top:6px">每座独立爬坡；选址有失败率（失败返还部分本金）。退役时产业按投入五折清算。</div></div>';
        /* 收支流水 */
        const logs = F.log.slice().reverse().slice(0, 10);
        html += '<div class="panel"><div class="panel-title">收支流水（最近 ' + logs.length + " 条）</div>" +
          (logs.length
            ? logs.map(e => '<div class="list-item li-tight"><div class="li-main"><div class="li-title">' + esc(e.note || e.cat) + '</div><div class="li-sub">' + esc(e.cat) + " · 第 " + (e.day || 0) + " 天</div></div>" +
                '<b style="color:' + (e.amt >= 0 ? "var(--success)" : "var(--danger)") + ';flex-shrink:0">' + (e.amt >= 0 ? "+" : "") + Career.fmtMoney(e.amt) + "</b></div>").join("")
            : '<div class="dim12">还没有流水记录。</div>') + "</div>";
        finishTabs();
        /* ── 绑定（购买确认全部 UIkit.modal + guard；rerender 页内） ── */
        const rerenderFn = () => self.lifePage($("#hub-sheet-body"));
        const askAmount = (title, hint, onOk) => {
          /* ★ P295（玩家反馈「输入金额的框被界面 UI 遮挡，没考虑输入法占半个屏幕」）：
             ① focus 时给弹层根加 v2-kb（CSS：卡片顶对齐+限高），输入框 scrollIntoView；
             ② 金额大字镜像 #fa-amt-view 实时跟随输入——输入框即使被键盘盖住，金额始终可见；
             ③ inputmode=numeric 拉数字键盘。 */
          UIkit.modal("<h3>" + title + "</h3>" +
            '<div style="font-size:13px;line-height:1.8;margin-bottom:10px">' + hint + "</div>" +
            '<div class="row" style="gap:8px;margin-bottom:8px"><input id="fa-amt" type="number" inputmode="numeric" class="num-input" style="flex:1;padding:8px" placeholder="输入金额" min="1">' +
            '<button class="btn btn-sm btn-ghost" id="fa-max">全存</button></div>' +
            '<div style="font-size:20px;font-weight:900;color:var(--gold);margin-bottom:12px;min-height:26px" id="fa-amt-view">已输入：¥0</div>' +
            '<div class="row" style="gap:8px"><button class="btn btn-primary" id="fa-ok">确认</button>' +
            '<button class="btn btn-ghost" id="fa-no">再想想</button></div>');
          const inp = $("#fa-amt");
          const mx = $("#fa-max");
          const view = $("#fa-amt-view");
          const root = $("#v2-modal-root");
          const syncView = () => {
            const v = inp ? Math.floor(Number(inp.value) || 0) : 0;
            if (view) view.textContent = "已输入：¥" + v.toLocaleString();
          };
          if (inp) {
            inp.oninput = syncView;
            inp.onfocus = () => {
              if (root) root.classList.add("v2-kb");
              setTimeout(() => { try { inp.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e) { /* 老内核无 smooth */ } }, 250);
            };
            inp.onblur = () => { if (root) root.classList.remove("v2-kb"); };
          }
          if (mx) mx.onclick = () => { if (inp) { inp.value = Math.max(0, Math.floor(State.data.money)); syncView(); } };
          const nob = $("#fa-no");
          if (nob) nob.onclick = () => { if (root) root.classList.remove("v2-kb"); UIkit.closeModal(); };
          const okb = $("#fa-ok");
          if (okb) okb.onclick = UIkit.guard(() => {
            const v = inp ? Math.floor(Number(inp.value) || 0) : 0;
            if (root) root.classList.remove("v2-kb");
            UIkit.closeModal();
            onOk(v);
          }, title);
        };
        m.querySelectorAll("[data-depbuy]").forEach(b => {
          b.onclick = UIkit.guard(() => {
            const i = +b.dataset.depbuy;
            const def = (window.CONFIG && CONFIG.FINANCE.DEPOSITS[i]) || null;
            if (!def) return;
            askAmount("存入" + def.name, def.months + " 个月 · 年化 " + (def.rate * 100).toFixed(1) + "%（到期一次性本息；提前支取放弃利息）。起存 " + Career.fmtMoney((window.CONFIG && CONFIG.FINANCE.DEPOSIT_MIN) || 50000) + "。",
              v => { const r = Fin.buyDeposit(State, i, v); UIkit.toast(r.msg, r.ok ? "gold" : "red"); if (r.ok) { State.save(); rerenderFn(); } });
          }, "存定期");
        });
        m.querySelectorAll("[data-depwit]").forEach(b => {
          b.onclick = UIkit.guard(() => {
            const i = +b.dataset.depwit;
            const dp = F.deposits[i];
            if (!dp) return;
            UIkit.modal("<h3>提前支取" + UIkit.esc(dp.name || "定期") + "？</h3>" +
              '<div style="font-size:13.5px;line-height:1.9;margin-bottom:12px">只退本金 <b style="color:var(--gold)">' + Career.fmtMoney(dp.amount) + "</b>，<b style=\"color:var(--danger)\">全部利息放弃</b>。</div>" +
              '<div class="row" style="gap:8px"><button class="btn btn-primary" id="dw-ok">支取</button>' +
              '<button class="btn btn-ghost" id="dw-no">再想想</button></div>');
            const nob2 = $("#dw-no");
            if (nob2) nob2.onclick = () => UIkit.closeModal();
            const ok2 = $("#dw-ok");
            if (ok2) ok2.onclick = UIkit.guard(() => { const r = Fin.withdrawDeposit(State, i); UIkit.closeModal(); UIkit.toast(r.msg, r.ok ? "gold" : "red"); if (r.ok) { State.save(); rerenderFn(); } }, "提前支取");
          }, "提前支取");
        });
        m.querySelectorAll("[data-fbuy]").forEach(b => {
          b.onclick = UIkit.guard(() => {
            const id = b.dataset.fbuy;
            const def = Fin.fundDef(id);
            if (!def) return;
            askAmount("买入" + def.name, "按当前净值成交；净值每月波动（" + (def.lo * 100).toFixed(0) + "%～" + (def.hi * 100).toFixed(0) + "%），随时可清仓。",
              v => { const r = Fin.buyFund(State, id, v); UIkit.toast(r.msg, r.ok ? "gold" : "red"); if (r.ok) { State.save(); rerenderFn(); } });
          }, "买基金");
        });
        m.querySelectorAll("[data-fsell]").forEach(b => {
          b.onclick = UIkit.guard(() => {
            const id = b.dataset.fsell;
            const def = Fin.fundDef(id);
            UIkit.modal("<h3>清仓" + UIkit.esc((def && def.name) || "基金") + "？</h3>" +
              '<div style="font-size:13.5px;line-height:1.9;margin-bottom:12px">按当前净值全部卖出，回款入活期。</div>' +
              '<div class="row" style="gap:8px"><button class="btn btn-primary" id="fs-ok">清仓</button>' +
              '<button class="btn btn-ghost" id="fs-no">再想想</button></div>');
            const nob2 = $("#fs-no");
            if (nob2) nob2.onclick = () => UIkit.closeModal();
            const ok2 = $("#fs-ok");
            if (ok2) ok2.onclick = UIkit.guard(() => { const r = Fin.sellAllFund(State, id); UIkit.closeModal(); UIkit.toast(r.msg, r.ok ? (r.pnl >= 0 ? "gold" : "") : "red"); if (r.ok) { State.save(); rerenderFn(); } }, "清仓基金");
          }, "清仓基金");
        });
        m.querySelectorAll("[data-bizbuy]").forEach(b => {
          b.onclick = UIkit.guard(() => {
            const type = b.dataset.bizbuy;
            const def = bizDefOf(type);
            if (!def) return;
            UIkit.modal("<h3>购置" + UIkit.esc(def.name) + "</h3>" +
              '<div style="font-size:13px;line-height:1.8;margin-bottom:8px">成功率 ' + Math.round(def.success * 100) + "%（失败返还 " + Math.round((def.failBack || 0) * 100) + "% 本金）· 成熟月分红 " + Career.fmtMoney(def.mature) + " · 首月仅 " + Math.round(def.mature * def.rampStart) + "。</div>" +
              '<div class="row" style="gap:8px;margin-bottom:8px"><input id="bz-n" type="number" inputmode="numeric" class="num-input" style="flex:1;padding:8px" value="1" min="1" max="9999">' +
              '<span class="dim12" id="bz-sum" style="flex-shrink:0"></span></div>' +
              '<div class="dim12" style="margin-bottom:10px">第 6 座起每 5 座涨价一档（跨档分段计价，上方为合计）。</div>' +
              '<div class="row" style="gap:8px"><button class="btn btn-primary" id="bz-ok">签字</button>' +
              '<button class="btn btn-ghost" id="bz-no">再想想</button></div>');
            const nInp = $("#bz-n");
            const sumEl = $("#bz-sum");
            const upd = () => { if (nInp && sumEl) sumEl.textContent = "合计 " + Career.fmtMoney(Fin.bizBundlePrice(d, type, Math.max(1, Math.floor(Number(nInp.value) || 1)))); };
            if (nInp) nInp.addEventListener("input", upd);
            upd();
            const nob2 = $("#bz-no");
            if (nob2) nob2.onclick = () => UIkit.closeModal();
            const ok2 = $("#bz-ok");
            if (ok2) ok2.onclick = UIkit.guard(() => {
              const n = Math.max(1, Math.floor(Number(nInp ? nInp.value : 1) || 1));
              UIkit.closeModal();
              const r = Fin.buyBiz(State, type, n);
              UIkit.toast(r.msg, r.ok ? "gold" : "red");
              if (r.ok) { State.save(); rerenderFn(); }
            }, "购置产业");
          }, "购置产业");
        });
        /* ★ P201 彩票中奖：真实完播才发奖（Ads 内部守门）；配额消费单源 Ads.consumeLottery */
        const lotBtn = $("#ad-lottery");
        if (lotBtn) lotBtn.onclick = () => {
          if (window.Track) Track.click("BMC005", "T1", "ad_lottery");
          Ads.show("lottery", () => {
            Ads.consumeLottery(State);
            const prize = (window.CONFIG && CONFIG.FINANCE.LOTTERY_PRIZE) || 5000000;
            d.money = (d.money || 0) + prize;
            Fin.log(d, "中奖", prize, "彩票站头奖（完整观看视频）");
            UIkit.toast({ html: ICO("check"), text: " 中大奖了！" + Career.fmtMoney(prize) + " 已入活期账户" }, "gold");
            State.save();
            rerenderFn();
          });
        };
        return;
      }

      /* ── P128b 代言页签（死代码接线 + 四档品牌；渲染零 R，账本单源 applyEffects）── */
      if (tab === "commerce") {
        const c = d.commerce || {};
        const o = c.active;
        html += '<div class="panel"><div class="panel-title">商业代言</div>';
        if (o) {
          const left = Math.max(0, (o.expireDay || 0) - (d.dayIndex || 0));
          html += '<div class="list-item"><div class="li-main"><div class="li-title" style="color:var(--gold);font-weight:800">' + esc(o.brand) + ' · ' + esc(o.tierName || "") + '</div>' +
            '<div class="li-sub">' + esc(o.desc || "") + '</div></div></div>' +
            '<div class="row"><span>报酬</span><b style="color:var(--gold)">' + Career.fmtMoney(o.pay || 0) + "</b></div><div class='divider'></div>" +
            '<div class="row"><span>剩余有效期</span><b>' + left + " 天</b></div>" +
            '<div class="row" style="gap:8px;margin-top:12px"><button class="btn btn-primary" id="cm-acc">接下代言</button>' +
            '<button class="btn btn-ghost" id="cm-dec">婉拒 · 30 天冷却</button></div>' +
            '<div class="dim12" style="margin-top:6px">接单涨钱涨粉——名气越大，下一单开价越高。</div>';
        } else {
          const cool = Math.max(0, (c.cooldownUntil || 0) - (d.dayIndex || 0));
          html += '<div class="dim12" style="line-height:1.9">' + (cool > 0
            ? "刚处理完一单，经纪人在攒新的门路——<b>" + cool + "</b> 天后才会再带来邀约。"
            : "眼下没有待处理的邀约。名气越大、粉丝越多，品牌方开价越狠——邀约会自动上门。") + "</div>";
        }
        const histAll = c.history || [];
        const earned = histAll.reduce((a, h) => a + (h.pay || 0), 0);
        html += "<div class='divider'></div>" +
          '<div class="row"><span>本季额度</span><b>' + (c.seasonCount || 0) + " / 5 单</b></div><div class='divider'></div>" +
          '<div class="row"><span>生涯代言</span><b>' + (c.completed || 0) + " 单 · " + Career.fmtMoney(earned) + "</b></div>" +
          '<div class="dim12" style="margin-top:6px">邀约每日有机会上门（每季至多 5 单）；接受或婉拒后经纪人休息 30 天，邀约 14 天无人处理自动作废。</div></div>';
        const hist = histAll.slice().reverse().slice(0, 8);
        /* ★ P301（兄弟拍板）：本季已签代言支持主动解约（ Career.cancelCommerce 单点；
           二次确认 + 30 天冷却 + 报酬不退）。往季代言已随赛季自然结束，不给按钮。 */
        html += '<div class="panel"><div class="panel-title">代言履历</div>' +
          (hist.length
            ? hist.map(h => '<div class="list-item li-tight"><div class="li-main"><div class="li-title">' + esc(h.brand || "—") + "</div>" +
                '<div class="li-sub">' + Career.fmtMoney(h.pay || 0) + " · S" + (h.season || "—") + (h.season === d.season ? " · 本季有效" : "") + "</div></div>" +
                (h.season === d.season ? '<button class="btn btn-sm btn-ghost" data-cmcancel="' + esc(h.brand || "") + '">解约</button>' : "") + "</div>").join("")
            : '<div class="dim12">还没有代言记录——名气到位，邀约自然上门。</div>') +
          (hist.some(h => h.season === d.season) ? '<div class="dim12" style="margin-top:4px">解约无赔偿、已入账报酬不退，解约后 30 天内不会有新邀约。</div>' : "") +
          "</div>";
        finishTabs();
        const rerenderCm = () => self.lifePage($("#hub-sheet-body"));
        m.querySelectorAll("[data-cmcancel]").forEach(b => {
          b.onclick = UIkit.guard(() => {
            const brand = b.dataset.cmcancel;
            UIkit.confirm({
              title: "解约「" + brand + "」？",
              body: "解约立即生效且无赔偿：已入账的报酬不退，解约后 30 天内经纪人不接新邀约。确定解约吗？",
              okText: "解约", cancelText: "再想想", danger: true,
            }).then(ok => {
              if (!ok) return;
              const r = (window.Career && Career.cancelCommerce) ? Career.cancelCommerce(State, brand) : { ok: false, msg: "代言系统暂不可用。" };
              UIkit.toast(r.msg, r.ok ? "gold" : "");
              if (r.ok) { State.save(); rerenderCm(); }
            });
          }, "解约代言");
        });
        const accBtn = $("#cm-acc");
        if (accBtn) accBtn.onclick = UIkit.guard(() => {
          const o2 = d.commerce.active;
          if (!o2) return;
          const notes = Career.applyEffects(State, { money: o2.pay || 0, fans: Math.round((o2.pay || 0) * 0.3), commerceAccept: true });
          State.save();
          UIkit.toast(notes.length ? notes.join("，") : "代言达成", "gold");
          rerenderCm();
        }, "接受代言");
        const decBtn = $("#cm-dec");
        if (decBtn) decBtn.onclick = UIkit.guard(() => {
          Career.applyEffects(State, { commerceDecline: true });
          State.save();
          UIkit.toast("婉拒代言 · 30 天冷却", "");
          rerenderCm();
        }, "婉拒代言");
        return;
      }

      /* ── P128 置业页：房产 4 档 + 座驾 5 档（数据单源 Career.housingLevels/carLevels，纯接线）──
         ★ 购买走 UIkit.modal 二次确认（训练师模式 1:1）；渲染零 R；只升不降不可卖出。
         ★ 展示口径：只写住房舒适度/座驾排面与「传奇指数更高」定性文案——
           Q9 的疲劳恢复/名气乘数在 P128b 落地前不得宣传（不展示不存在的效果）。 */
      if (tab === "assets") {
        const HL = Career.housingLevels;
        const CL = Career.carLevels;
        const hLv = (d.housing && d.housing.level) || 0;
        const hCur = HL[hLv] || HL[0];
        const cLv = (d.car && d.car.level) || 0;
        const cCur = CL[cLv] || CL[0];
        const ladder = (levels, cur, tag, extra) => levels.map(L => {
          const owned = L.level <= cur;
          const isNext = L.level === cur + 1;
          let line = '<div class="list-item li-tight"><div class="li-main"><div class="li-title"' + (L.level === cur ? ' style="color:var(--gold);font-weight:800"' : "") + ">" + esc(L.name) +
            (L.level === cur ? " · 当前" : "") + "</div>" +
            '<div class="li-sub">' + extra(L) + "</div></div>";
          if (owned) line += '<span class="dim12" style="flex-shrink:0">' + (L.level === cur ? "已持有" : "已超越") + "</span>";
          else if (isNext) line += '<button class="btn btn-sm btn-primary" data-' + tag + 'buy="' + L.level + '"' + (d.money < L.cost ? " disabled" : "") + ">购置 · " + Career.fmtMoney(L.cost) + "</button>";
          else line += '<span class="dim12" style="flex-shrink:0">' + Career.fmtMoney(L.cost) + "</span>";
          return line + "</div>";
        }).join("");
        /* ★ P185（用户拍板「车房一次买到位」）：每档面板标题行加「一步到位」按钮——
           买到存款能支撑的最高档（跳过买不起的档），确认框列总价与目标档。 */
        const hMax = Career.housingMaxInfo(d), cMax = Career.carMaxInfo(d);
        const maxBtn = (tag, info, labelFn) => {
          if (info.to <= info.from) return "";
          return '<button class="btn btn-sm btn-ghost" id="' + tag + '-max">一步到位 ▸ ' + Career.fmtMoney(info.spent) + "</button>";
        };
        html += '<div class="panel"><div class="panel-title">房产 · ' + esc(hCur.name) + "（" + hLv + "/" + (HL.length - 1) + " 档）　" + maxBtn("h", hMax) + "</div>" +
          '<div class="dim12" style="margin-bottom:4px">住得更舒坦，状态更好——<b>每日训练经验随舒适度提升</b>（舒适度 2/3/4 档 = 训练经验 ×1.05/×1.10/×1.15），退役传奇指数也更高。一次性付清，不影响周薪；只升不降。</div>' +
          ladder(HL, hLv, "h", L => "舒适度 " + L.comfort + " · 每日训练经验 ×" + (1 + (L.comfort - 1) * 0.05).toFixed(2) + " · 传奇指数更高") + "</div>";
        html += '<div class="panel"><div class="panel-title">座驾 · ' + esc(cCur.name) + "（" + cLv + "/" + (CL.length - 1) + " 档）　" + maxBtn("c", cMax) + "</div>" +
          '<div class="dim12" style="margin-bottom:4px">场外排面也是名人的一部分——<b>名气获取随座驾档位提升</b>，退役传奇指数更高。一次性付清；只升不降。</div>' +
          ladder(CL, cLv, "c", L => "排面 " + L.style + (L.style > 0 ? " · 名气获取 +" + (L.style * 3) + "%" : "") + " · 传奇指数更高") + "</div>";
        finishTabs();
        const rerender = () => self.lifePage($("#hub-sheet-body"));
        const buyFlow = (tag, levels, curGet, doBuy, done) => {
          m.querySelectorAll("[data-" + tag + "buy]").forEach(b => {
            b.onclick = UIkit.guard(() => {
              const cur = curGet();
              const next = levels[cur + 1];
              if (!next) return;
              UIkit.modal('<h3>购入' + UIkit.esc(next.name) + "？</h3>" +
                '<div style="font-size:13.5px;line-height:1.9;margin-bottom:12px">一次性付清 <b style="color:var(--gold)">' + Career.fmtMoney(next.cost) + "</b>，不影响周薪。" +
                (tag === "h" ? "舒适度升至 <b>" + next.comfort + "</b>。" : "排面升至 <b>" + next.style + "</b>。") +
                '退役时传奇指数更高。</div>' +
                '<div class="row" style="gap:8px"><button class="btn btn-primary" id="' + tag + '-ok">签字</button>' +
                '<button class="btn btn-ghost" id="' + tag + '-no">再想想</button></div>');
              const okb = $("#" + tag + "-ok"), nob = $("#" + tag + "-no");
              if (nob) nob.onclick = () => UIkit.closeModal();
              if (okb) okb.onclick = UIkit.guard(() => {
                const ok = doBuy();
                UIkit.closeModal();
                if (ok) { State.save(); done(next); }
                else UIkit.toast("存款不足，购置失败", "red");
                rerender();
              }, "购置");
            }, "购置");
          });
        };
        buyFlow("h", HL, () => (State.data.housing && State.data.housing.level) || 0, () => Career.upgradeHousing(State),
          nx => UIkit.toast({ html: ICO("house"), text: " 搬进了" + nx.name + "！" }, "gold"));
        buyFlow("c", CL, () => (State.data.car && State.data.car.level) || 0, () => Career.upgradeCar(State),
          nx => UIkit.toast({ html: ICO("thunder"), text: " 提了" + nx.name + "！" }, "gold"));
        /* ★ P185：一步到位绑定（确认框列「从 X 档 → Y 档 · 总价」；跳过买不起的档的说明） */
        const bindMax = (tag, info, doMax, done) => {
          const b = $("#" + tag + "-max");
          if (!b) return;
          b.onclick = UIkit.guard(() => {
            const levels = tag === "h" ? HL : CL;
            const cur = (tag === "h" ? (d.housing && d.housing.level) : (d.car && d.car.level)) || 0;
            const fresh = tag === "h" ? Career.housingMaxInfo(d) : Career.carMaxInfo(d);   // 点开时重算（存款可能已变）
            if (fresh.to <= fresh.from) { UIkit.toast("存款不够再升任何一档", "red"); return; }
            UIkit.modal("<h3>一步到位？</h3>" +
              '<div style="font-size:13.5px;line-height:1.9;margin-bottom:12px">从 <b>' + esc(levels[fresh.from].name) + "</b> 直升 <b style='color:var(--gold)'>" + esc(levels[fresh.to].name) + "</b>，一次性付清 <b style='color:var(--gold)'>" + Career.fmtMoney(fresh.spent) + "</b>。" +
              (fresh.to < levels.length - 1 ? "（更高档位暂超出存款，先到这）" : "") + "</div>" +
              '<div class="row" style="gap:8px"><button class="btn btn-primary" id="' + tag + '-maxok">签字</button>' +
              '<button class="btn btn-ghost" id="' + tag + '-maxno">再想想</button></div>');
            const okb = $("#" + tag + "-maxok"), nob = $("#" + tag + "-maxno");
            if (nob) nob.onclick = () => UIkit.closeModal();
            if (okb) okb.onclick = UIkit.guard(() => {
              const r = doMax();
              UIkit.closeModal();
              if (r && r.ok) { State.save(); done(r); }
              else UIkit.toast((r && r.msg) || "购置失败", "red");
              rerender();
            }, "一步到位");
          }, "一步到位");
        };
        bindMax("h", hMax, () => Career.upgradeHousingMax(State),
          r => UIkit.toast({ html: ICO("house"), text: " 直升" + r.name + "！" }, "gold"));
        bindMax("c", cMax, () => Career.upgradeCarMax(State),
          r => UIkit.toast({ html: ICO("thunder"), text: " 直提" + r.name + "！" }, "gold"));
        return;
      }

      if (tab === "honor") {
        /* 荣誉分页：生涯数据 + 荣誉陈列室 + 传奇排行榜（原荣誉页 / 排名页内容单源迁入） */
        const s = d.stats || {};
        const trophies = d.trophies || [];
        const sN = (window.CONFIG && CONFIG.seasonIndexOf) ? CONFIG.seasonIndexOf(d.season) : null;
        /* ★ P128（Q10 拍板）：顶部加现役季号行；已完赛 X 季（X>0 才显示） */
        const seasonLine = (sN ? "现役第 " + sN + " 季" : "") + ((s.seasonsPlayed || 0) > 0 ? (sN ? " · " : "") + "已完赛 " + s.seasonsPlayed + " 季" : "");
        html += '<div class="panel"><div class="panel-title">生涯数据</div>' +
          (seasonLine ? '<div class="dim12" style="margin-bottom:6px">' + seasonLine + "</div>" : "") +
          '<div class="row"><span>出场</span><b>' + (s.apps || 0) + "</b></div><div class='divider'></div>" +
          ((d.player && d.player.position === "GK")
            ? '<div class="row"><span>扑救</span><b>' + (s.saves || 0) + "</b></div><div class='divider'></div>"
            : '<div class="row"><span>进球 / 助攻</span><b>' + (s.goals || 0) + " / " + (s.assists || 0) + "</b></div><div class='divider'></div>") +
          '<div class="row"><span>零封 / MVP</span><b>' + (s.cleanSheets || 0) + " / " + (s.motm || 0) + "</b></div>" +
          "</div>" +
          /* ★ P202 生涯履历（P223 口径正名：每次生涯同一开始年份，是「第 N 次生涯」，
             非家族世系/代际传承）：第 N 次生涯 + 上次生涯继承包摘要，让「多周目成长」在档案里可见。 */
          (d.metaLegacy ? '<div class="panel"><div class="panel-title">生涯履历 · 第 ' + ((d.metaLegacy.gen || 0) + 1) + " 次生涯</div>" +
            '<div class="row"><span>上次生涯继承</span><b style="color:var(--gold)">能力点 +' + (d.metaLegacy.attr || 0) +
            " · 技能点 +" + (d.metaLegacy.sp || 0) +
            (d.metaLegacy.biz ? " · 继承产业 " + d.metaLegacy.biz + " 座" : "") + "</b></div>" +
            '<div class="dim12" style="margin-top:4px">建档时已自动入账——上一段生涯的积累，会带进这一段。</div></div>' : "") +
          '<div class="panel" id="honor-panel"><div class="panel-title">荣誉陈列室（' + trophies.length + "）</div>" +
          /* P132：每项荣誉前置专属奖杯图标（TrophyArt 单源，按荣誉名判形状+分色）
             ★ P212（玩家反馈「拉的老长」）：按奖项名**聚合**——同一奖项一个区域，
             年份升序并排在下方（· 分隔，可自然换行），多次获得标 ×N。
             分组顺序 = 该奖项最早获得年（时间线不乱）；标题计数仍为荣誉总条数。 */
          (trophies.length ? (function () {
            const groups = new Map();
            trophies.forEach(function (t) {
              const nm = String(t.name || "其他荣誉");
              if (!groups.has(nm)) groups.set(nm, { name: nm, years: [] });
              groups.get(nm).years.push(t.season || "");
            });
            const yearOf = ys => { const v = ys.map(Number).find(x => !isNaN(x) && x > 0); return v == null ? 99999 : v; };
            const order = Array.from(groups.values()).sort((a, b) => yearOf(a.years) - yearOf(b.years));
            return order.map(function (g) {
              const art = (window.TrophyArt ? TrophyArt.svg(g.name, 30) : "");
              return '<div class="list-item">' + art +
                '<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;padding:2px 0">' +
                "<b>" + esc(g.name) + (g.years.length > 1 ? ' <span class="dim12" style="font-weight:400">×' + g.years.length + "</span>" : "") + "</b>" +
                '<span class="dim12" style="line-height:1.6">' + g.years.filter(Boolean).join(" · ") + "</span></div></div>";
            }).join("");
          })() : '<div class="dim12">还没有奖杯——赛季还在前面。</div>') +
          "</div>" +
          '<button class="btn btn-ghost btn-block" id="lf-lb">' + ICO("cup", 15) + " 传奇排行榜 · 历代生涯成就殿堂</button>";
        finishTabs();
        /* P133 埋点 BMC011：荣誉陈列室曝光（会话内同元素只报一次） */
        if (window.Track) Track.expose(document.getElementById("honor-panel"), "BMC011", "T1", "honor_panel_exposure", { trophies: trophies.length });
        const lb = $("#lf-lb");
        if (lb) lb.onclick = () => {
          if (window.LBLocal) LBLocal.show(State, () => this.lifePage($("#hub-sheet-body")));
          else UIkit.toast("排行榜暂不可用", "red");
        };
        return;
      }

      /* ── 概况（默认页签，P128 强化：财务概览 / 生活方式 / 声望 三面板）── */
      const monthly = (d.incomeStreams || []).reduce((a, s2) => a + (s2.monthly || 0), 0) + (window.Finance ? (function () { try { return Finance.bizMonthly(d); } catch (e) { return 0; } })() : 0);
      const commerceShown = d.commerce && ((d.commerce.seasonCount || 0) > 0 || (d.commerce.completed || 0) > 0);
      /* ★ P280（玩家反馈「合适位置加个身价标签，简况就很合适」）：转会市场同源估值
         feeValueOf = 总评 × 年龄 × 合同年限 × 近期状态（transfer.js FEE_PTS 曲线单源）；
         状态评分取本季场均，赛季初无出场回落上季场均，再无则中性 6.5。 */
      const _ssV = d.seasonStats || {};
      const _lastLogV = (d.careerLog && d.careerLog.length) ? d.careerLog[d.careerLog.length - 1] : null;
      const _valRating = _ssV.apps ? (_ssV.ratingSum / _ssV.apps)
        : (_lastLogV && _lastLogV.avgRating != null ? _lastLogV.avgRating : 6.5);
      const _mv = (window.Transfer && Transfer.feeValueOf) ? Math.round(Transfer.feeValueOf(d, _valRating)) : 0;
      html +=
        '<div class="panel"><div class="panel-title">财务概览</div>' +
        '<div class="row"><span>存款</span><b>' + Career.fmtMoney(d.money) + "</b></div><div class='divider'></div>" +
        '<div class="row"><span>周薪</span><b style="color:var(--gold)">' + Career.fmtMoney(Career.weeklyWageOf(d)) + "</b></div><div class='divider'></div>" +
        '<div class="row"><span>身价</span><b style="color:var(--gold)">' + Career.fmtMoney(_mv) + "</b></div>" +
        (_mv > 0 ? '<div class="dim12" style="margin-top:4px">转会市场同源估值：总评 × 年龄 × 合同年限 × 近期状态（' + (_ssV.apps ? "本季场均 " + _valRating.toFixed(1) : "近季/中性 6.5") + "）。</div>" : "") +
        (monthly > 0 ? "<div class='divider'></div>" + '<div class="row"><span>每月被动收入</span><b style="color:var(--gold)">' + Career.fmtMoney(monthly) + '</b></div><div class="dim12" style="margin-top:4px">每 30 天自动入账，明细见「持续收入」。</div>' : "") +
        "</div>";
      html +=
        '<div class="panel"><div class="panel-title">生活方式</div>' +
        '<div class="row"><span>住房</span><b>' + esc((d.housing && d.housing.name) || "—") + "</b></div><div class='divider'></div>" +
        '<div class="row"><span>座驾</span><b>' + esc(Career.carOf(d).name) + "</b></div>" +
        (d.insured ? "<div class='divider'></div>" + '<div class="row"><span>伤病保险</span><b style="color:var(--success)">已生效</b></div>' : "") +
        "</div>";
      html +=
        '<div class="panel"><div class="panel-title">声望</div>' +
        '<div class="row"><span>名气</span><b>' + Career.fmtMoney(d.fame) + "</b></div><div class='divider'></div>" +
        '<div class="row"><span>粉丝</span><b>' + Career.fmtMoney(d.fans) + "</b></div>" +
        (commerceShown ? "<div class='divider'></div>" + '<div class="row"><span>本季代言</span><b>' + (d.commerce.seasonCount || 0) + " / 5 次</b></div>" : "") +
        "</div>";
      /* 临时效果（营养计划 / 作息规律 / 赌球传闻…——每天真实生效，此前 invisible） */
      const temps = d.tempEffects || [];
      if (temps.length) {
        html += '<div class="panel"><div class="panel-title">进行中的效果</div>' +
          temps.map(t => '<div class="list-item li-tight"><div class="li-main"><div class="li-title">' + esc(t.name || "未知效果") + "</div>" +
            '<div class="li-sub">' + esc(t.desc || "") + "</div></div>" +
            '<span class="dim12" style="flex-shrink:0">剩 ' + (t.leftDays || 0) + " 天</span></div>").join("") + "</div>";
      }
      /* 长期分红（每月自动入账，此前 invisible） */
      const streams = d.incomeStreams || [];
      if (streams.length) {
        html += '<div class="panel"><div class="panel-title">持续收入</div>' +
          '<div class="dim12" style="margin-bottom:4px">每月自动入账合计 <b style="color:var(--gold)">' + Career.fmtMoney(monthly) + '</b>（每 30 天结算一次）</div>' +
          streams.map(s => '<div class="row"><span>' + esc(s.name || "分红") + '</span><b>' + Career.fmtMoney(s.monthly || 0) + "/月 · 余 " + (s.remainingMonths || 0) + ' 个月</b></div><div class="divider"></div>').join("") + "</div>";
      }
      /* 球星羁绊（合练/邀约积累，此前只有事件文案提及） */
      if (window.StarFavor && d.starFavor) {
        try {
          const favs = Object.keys(d.starFavor)
            .map(pid => { const st = StarFavor.starById(pid); return st ? { name: st.name, v: StarFavor.favorOf(d, pid) } : null; })
            .filter(f => f && f.v > 0)
            .sort((a, b) => b.v - a.v);
          if (favs.length) {
            html += '<div class="panel"><div class="panel-title">球星羁绊</div>' +
              favs.slice(0, 6).map(f => '<div class="row"><span>' + esc(f.name) + '</span><b style="color:var(--gold)">' + esc(StarFavor.tierOf(f.v)) + " · " + f.v + "</b></div>").join("") + "</div>";
          }
        } catch (e) { /* StarFavor 未就绪时静默跳过 */ }
      }
      /* P126：外观配色选择已退役——主题全局锁定琥珀金（用户拍板），不再提供玩家入口 */
      /* ★ P153b：生涯去向 —— 玩家主动退役入口（用户拍板：随时可退役）。
         流程 = 危险确认 → Flow.retire(false)（非 forced：不触发「被偷走的天才」结局）
         → 既有退役链（告别章回 → Career.retire 结算 → 终章卡：结局评级/海报/热点资讯分享/陈列室）。 */
      html += '<div class="panel"><div class="panel-title">生涯去向</div>' +
        '<div class="dim12" style="margin-bottom:8px">' + (window.Youth && Youth.inAcademy(d)
          ? "当前处于青训期。挂靴会立即结束学徒生涯——退役不可逆：按当前年龄 / 荣誉 / 履历结算生涯终章（结局评级 · 传奇指数），并生成热点资讯分享图与文案。"
          : "随时可以挂靴。退役不可逆：按当前年龄 / 荣誉 / 履历立即结算生涯终章（结局评级 · 传奇指数），并生成热点资讯分享图与文案——想好了再点。") + "</div>" +
        '<button class="btn btn-danger btn-block" id="lf-retire">宣布退役 · 结束球员生涯</button></div>';
      html += this.adWelfareHtml();
      finishTabs();
      const _retireBtn = $("#lf-retire");
      if (_retireBtn) _retireBtn.onclick = () => {
        UIkit.confirm({
          title: "确认退役？",
          body: "退役立即生效且不可逆。\n\n将按当前年龄、荣誉与生涯履历结算终章：结局评级 · 传奇指数 · 终章海报 · 热点资讯分享文案，随后收入传奇陈列室并回到主界面。\n\n确定要挂靴吗？",
          okText: "挂靴退役", cancelText: "再踢踢", danger: true,
        }).then(ok => {
          if (!ok) return;
          try { if (window.Track) Track.click("BMC005", "T1", "retire_confirm"); } catch (e) { /* 埋点不阻塞 */ }
          try { self.closeSheet(); } catch (e) { /* sheet 关闭失败不阻塞 */ }
          Flow.retire(false);
        });
      };
      this.bindAdWelfare();
    },

    /* ── 广告福利（激励视频，全自愿；两壳 UI 同源）
       ★★ P153 重组：①「清除全部疲劳」迁入 属性 · 体能 页签（疲劳有真实作用链，收归一处管理）；
       ②「训练经验 ×1.5」迁入 属性 · 成长 页签（训练效率语义同页）；③「解锁只打关键比赛」**删除**
       —— matchMode 三档已可随时手动调整（match.js isInteractiveMatch 读 settings.matchMode，
       从不读 keySimUnlocked），广告解锁早已无意义（keySimUnlocked 字段保留兼容旧档显示）。
       本面板保留：立即痊愈（伤病时）/ 代言邀约刷新（P145）。 ── */
    adWelfareHtml() {
      const d = State.data;
      const P = ICO("play");
      Ads.rollDay(State);
      const healLeft = Ads.dailyLeft(State, "heal");
      let btn = "";
      if (d.injuryDays > 0 && healLeft > 0) {
        btn += '<button class="btn btn-sm btn-gold btn-block mb-8" id="ad-heal">' + P + " 看视频 立即痊愈（免去 " + d.injuryDays + " 天伤停，今日剩 " + healLeft + " 次）</button>";
      }
      /* ★ P145 代言邀约刷新（A 档）：无进行中代言 + fame 达最低档 + 季配额剩余时可见。
         genCommercialOffer 的档位随 fame 走——广告拉单与自然邀约同池同价。 */
      if (window.Career && Career.genCommercialOffer && d.commerce && !d.commerce.active
        && (d.fame || 0) >= ((window.CONFIG && CONFIG.COMMERCE_TIERS && CONFIG.COMMERCE_TIERS[0].min) || 150)
        && Ads.endorseLeft(State) > 0) {
        btn += '<button class="btn btn-sm btn-gold btn-block mb-8" id="ad-endorse">' + P + " 看视频 获得一份代言邀约（本季剩 " + Ads.endorseLeft(State) + " 次）</button>";
      }
      let html = "";
      if (btn) {
        html += '<div class="panel"><div class="panel-title">免费福利 · 看视频领取</div>' + btn + "</div>";
      }
      /* ★ P168：旧「比赛节奏」面板（keySimUnlocked+autoSim 默认勾选器开关）整块退役——
         路由层不再消费这两个字段（未勾选比赛一律停下出赛前卡），开关已成无功能死 UI。
         keySimUnlocked/autoSim 字段本身保留（旧档兼容、不迁移不删除）。 */
      return html;
    },

    bindAdWelfare() {
      const self = this;
      const after = () => { State.save(); self.lifePage($("#hub-sheet-body")); };
      const heal = $("#ad-heal");
      if (heal) heal.onclick = () => { if (window.Track) Track.click("BMC005", "T1", "ad_heal"); Ads.show("heal", () => {
        Ads.consume(State, "heal");
        const days = State.data.injuryDays;
        State.data.injuryDays = 0;
        UIkit.toast({ html: ICO("check"), text: " 伤病痊愈！免去了 " + days + " 天休战" }, "green");
        after();
      }); };
      /* ★ P145 代言邀约刷新（A1）：看广告立即生成一份邀约（绕过 8% 日 roll 与冷却）。
         账本单源不动——接受走 settleCommerce、婉拒走 declineCommerce（与自然邀约卡完全同源）。 */
      const en = $("#ad-endorse");
      if (en) en.onclick = () => {
        if (window.Track) Track.click("BMC005", "T1", "ad_endorse_refresh");
        Ads.show("endorse_refresh", () => {
          Ads.consumeEndorse(State);
          const offer = Career.genCommercialOffer(State);
          if (!offer) { UIkit.toast({ html: ICO("check"), text: " 品牌方暂时没有合适的合作提案，次数已退还" }, ""); Ads.consumeEndorse(State); State.data.adUsage.endorseSeason = Math.max(0, (State.data.adUsage.endorseSeason || 0) - 1); after(); return; }
          State.data.commerce.active = offer;
          UIkit.confirm({
            title: "代言邀约 · " + offer.brand,
            body: offer.desc + "（档位：" + offer.tierName + " · 报酬 " + Career.fmtMoney(offer.pay) + "）",
            okText: "接下代言（入账 " + Career.fmtMoney(offer.pay) + "）",
            cancelText: "婉拒（30 天冷却）",
          }).then((yes) => {
            if (yes) {
              State.data.money = (State.data.money || 0) + offer.pay;
              State.data.fans = (State.data.fans || 0) + Math.round(offer.pay * 0.3);
              const _done = Career.settleCommerce(State);
              UIkit.toast({ html: ICO("check"), text: " 代言达成" + (_done && _done.brand ? "：" + _done.brand : "") }, "gold");
            } else {
              Career.declineCommerce(State);
              UIkit.toast({ html: ICO("check"), text: " 婉拒代言 · 30 天冷却" }, "");
            }
            after();
          });
        });
      };
      /* ★ P168：tg-autosim 开关随「比赛节奏」面板退役（路由层不再消费 autoSim） */
    },

    /* ── P126 转会申请面板（HUD 右上角入口）──
       状态机与俱乐部页「转会申请」区块同源：listed / frozen / clauseTriggered /
       requested+reqRefused(施压) / 可申请(listingGate 门)。
       递交走既有 evaluateRequest 管道——放人 = 挂牌 = 下一个转会窗报价（休赛期转会卡/窗内市场）；
       豪门撕破脸 = startFrozen 雪藏（内部停赛：无法出场、士气每周下滑、续约归队或硬扛到窗）。
       渲染零 R；evaluateRequest/evaluatePressure 均用户交互耗 R（与俱乐部页同纪律）。 */
    transferRequestPanel() {
      const d = State.data;
      const t = d.transfer || {};
      const tw = window.teamById ? teamById(d.clubId) : null;
      const clubName = tw ? tw.name : "俱乐部";
      const st = (window.Transfer && Transfer.styleOf) ? Transfer.styleOf(d.clubId) : "regular";
      const stL = (window.Transfer && Transfer.styleLabel) ? Transfer.styleLabel(st) : "";
      const winOpen = (window.Transfer && Transfer.windowOpen) ? Transfer.windowOpen(d) : false;
      let body = '<div style="font-size:13px;line-height:1.9;margin-bottom:10px">现效力：<b>' + UIkit.esc(clubName) + "</b>" +
        (stL ? "（" + UIkit.esc(stL) + "）" : "") + " · 转会窗：<b>" + (winOpen ? "开放中" : "关闭") + "</b></div>";
      let opt = "";
      if (t.listed) {
        body += '<div class="dim12" style="line-height:1.9">你已在转会市场被挂牌——<b>下一个转会窗（或休赛期转会卡）会送来报价</b>，报价质量看你的表现与合同年数。走得体面一点。</div>';
      } else if (t.frozen) {
        body += '<div class="dim12" style="line-height:1.9"><b style="color:var(--danger)">你正被俱乐部雪藏（第 ' + t.frozen.weeks + ' 周）</b>——' + UIkit.esc(t.frozen.reason || "与俱乐部决裂") + "。雪藏期间无法出场，士气每周下滑；低头认错续约归队，或硬扛到转会窗接受报价离队。</div>";
      } else if (t.clauseTriggered) {
        body += '<div class="dim12" style="line-height:1.9">解约金条款已生效——决定权在条款，不在申请。坐等买家付钱。</div>';
      } else if (t.requested && t.reqRefused && !t.pressureUsed) {
        body += '<div class="dim12" style="line-height:1.9">申请被驳回了。老狐说还有最后一张牌：<b>拉上更衣室联名施压</b>——只有一次机会，看人缘，也看俱乐部的强硬程度。</div>';
        opt = '<button class="btn btn-primary btn-block" id="tr-pressure" style="margin-bottom:8px">联合队友施压</button>';
      } else if (t.requested) {
        body += '<div class="dim12" style="line-height:1.9">转会申请已递交，俱乐部还在掂量。本赛季没有第二次申请的机会。</div>';
      } else {
        const gate = (window.Transfer && Transfer.listingGate) ? Transfer.listingGate(State) : { ok: false, why: "转会系统暂不可用。" };
        if (gate.ok) {
          body += '<div class="dim12" style="line-height:1.9">公开要求离队：俱乐部可能体面放人（挂牌，<b>下一个转会窗迎来报价</b>），也可能直接驳回；跟豪门闹翻甚至会被<b style="color:var(--danger)">雪藏</b>——队内停赛，打不了比赛。本赛季只能递交一次。</div>';
          opt = '<button class="btn btn-primary btn-block" id="tr-req" style="margin-bottom:8px">递交转会申请</button>';
        } else {
          body += '<div class="dim12" style="line-height:1.9">' + UIkit.esc(gate.why) + "</div>";
        }
      }
      UIkit.modal("<h3>转会申请</h3>" + body + opt +
        '<button class="btn btn-ghost btn-block" id="tr-close">关闭</button>');
      const cl = $("#tr-close");
      if (cl) cl.onclick = () => UIkit.closeModal();
      const rq = $("#tr-req");
      if (rq) rq.onclick = UIkit.guard(() => {
        UIkit.modal("<h3>递交转会申请</h3>" +
          '<div style="font-size:13.5px;line-height:1.9;margin-bottom:12px">老狐最后确认一次：「递上去就收不回了。球迷、更衣室、主席办公室——全都会知道。想清楚。」</div>' +
          '<div class="row" style="gap:8px"><button class="btn btn-primary" id="tr-go">递交</button>' +
          '<button class="btn btn-ghost" id="tr-no">算了</button></div>');
        const no = $("#tr-no");
        if (no) no.onclick = () => UIkit.closeModal();
        const go = $("#tr-go");
        if (go) go.onclick = UIkit.guard(() => {
          const r = Transfer.evaluateRequest(State);
          State.save(); UIkit.closeModal(); UIkit.closeModal();
          if (r.outcome === "freeze") {
            Transfer.startFrozen(State, "递交转会申请撕破脸");   // 雪藏卡自带「认错归队/硬扛到底」分支
          } else {
            UIkit.modal("<h3>" + UIkit.esc(r.title || "俱乐部回复") + "</h3>" +
              '<div style="font-size:13.5px;line-height:1.9;margin-bottom:12px">' + (r.body || "") + "</div>" +
              '<div class="row" style="gap:8px"><button class="btn btn-ghost" id="tr-r2">知道了</button></div>');
            const b2 = $("#tr-r2");
            if (b2) b2.onclick = () => UIkit.closeModal();
          }
        }, "递交申请");
      }, "转会申请-确认");
      const pr = $("#tr-pressure");
      if (pr) pr.onclick = UIkit.guard(() => {
        const r = Transfer.evaluatePressure(State);
        State.save(); UIkit.closeModal();
        if (r.outcome === "freeze") {
          Transfer.startFrozen(State, "联名逼宫触怒管理层");
        } else if (r.outcome === "listed") {
          UIkit.modal("<h3>俱乐部让步了</h3>" +
            '<div style="font-size:13.5px;line-height:1.9;margin-bottom:12px">更衣室集体站在了你这边。' + UIkit.esc(r.clubName || "俱乐部") + "不想更衣室爆炸——「挂牌吧，为你的下一站要个好价钱。」下一个转会窗的报价会送来。</div>" +
            '<div class="row" style="gap:8px"><button class="btn btn-ghost" id="tr-p2">知道了</button></div>');
          const b2 = $("#tr-p2");
          if (b2) b2.onclick = () => UIkit.closeModal();
        } else {
          UIkit.modal("<h3>僵局</h3>" +
            '<div style="font-size:13.5px;line-height:1.9;margin-bottom:12px">联名信石沉大海。' + UIkit.esc(r.clubName || "俱乐部") + "硌得很：不放，不谈，也不撕破脸。你还得穿着这身训练服去训练基地。</div>" +
            '<div class="row" style="gap:8px"><button class="btn btn-ghost" id="tr-p3">知道了</button></div>');
          const b3 = $("#tr-p3");
          if (b3) b3.onclick = () => UIkit.closeModal();
        }
      }, "联合施压");
    },

    settingsPanel() {
      /* ★★★ P97-M5 修复：这里原本找的是 `Snd.setBgmVol` / `Snd.setVol` ——
         而 `audio.js` 导出的是 **`setMusicVol` / `setSfxVol`**。名字对不上 →
         `hasVol` 恒为 `false` → **设置面板里连"BGM 音量"这一行都不渲染**；
         而 `setMusic` / `setSfx` 这两个开关**压根没有 UI 入口** → 玩家**关不掉音乐**。
         （「定义了但没人调」同型坑第 5 次；由 `tools/_p97_unwired_scan.js` 扫出。） */
      /* ★ 用全名 `Snd.xxx` 而非别名：`tools/_p97_unwired_scan.js` 是纯静态扫描，
         认不出别名 —— 用全名既让扫描器看得见，也让"谁在调音频"一目了然。 */
      const C = (window.Snd && Snd.cfg) || {};
      const hasMusic = !!(window.Snd && Snd.setMusic), hasMusicVol = !!(window.Snd && Snd.setMusicVol);
      const hasSfx = !!(window.Snd && Snd.setSfx), hasSfxVol = !!(window.Snd && Snd.setSfxVol);
      const swRow = (id, label, on) => '<div class="row" style="margin-bottom:10px"><span>' + label +
        '</span><button class="btn btn-sm ' + (on ? "btn-primary" : "btn-ghost") + '" id="' + id +
        '" style="min-width:72px">' + (on ? "开" : "关") + "</button></div>";
      const volRow = (id, label, val) => '<div class="row" style="margin-bottom:10px"><span>' + label +
        '</span><input id="' + id + '" type="range" min="0" max="100" value="' +
        Math.round((typeof val === "number" ? val : 0.6) * 100) + '" style="flex:1"></div>';
      let audioBlock = "";
      if (hasMusic || hasSfx) {
        audioBlock = '<div class="panel-title" style="margin:2px 0 8px">声音</div>';
        if (hasMusic) audioBlock += swRow("st-music", "音乐", C.music !== false);
        if (hasMusicVol) audioBlock += volRow("st-musicvol", "音乐音量", C.musicVol);
        if (hasSfx) audioBlock += swRow("st-sfx", "音效", C.sfx !== false);
        if (hasSfxVol) audioBlock += volRow("st-sfxvol", "音效音量", C.sfxVol);
        audioBlock += '<div class="dim12" style="margin:0 0 14px">声音设置立即生效，独立保存，不随存档。</div>';
      }
      /* ★ P251（用户指令）：「游戏说明」从主菜单迁入设置面板（下属按钮）
         ★ P295（用户指令）：新增「天赋图鉴」——全池 26 条天赋 × 五档效果说明随时可查
           （已拥有的天赋金色高亮并显示当前档效果；未拥有的显示获取途径）。 */
      UIkit.modal("<h3>设置</h3>" + audioBlock +
        '<div class="panel-title" style="margin:2px 0 8px">游戏说明</div>' +
        '<button class="btn btn-ghost btn-block" id="st-help">玩法说明（核心玩法与规则一览）</button>' +
        '<button class="btn btn-ghost btn-block mt-8" id="st-taldex">天赋图鉴（全天赋效果一览）</button>' +
        '<div class="panel-title" style="margin:10px 0 8px">存档</div>' +
        /* ★ P267：存档说明按平台组句——无 Platform（旧 vm 探针环境）恒回退原文案（P241 T1b 断言兼容）；
           热点资讯有云 = 原语义；TapTap 有 TDS 云 = 同构说明；无云 = 诚实"本机双备份"不虚报。 */
        '<div class="dim12" style="margin:0 0 12px">' + ((window.Platform && Platform.storageAvailable)
          ? (Platform.storageAvailable()
            ? ('存档自动双写「本机 + 云端」：' + (Platform.kind() === 'hupu' ? '登录热点资讯时' : '云端开通后') + '跨设备自动续玩，本机数据异常时自动从云端恢复，无需手动备份。')
            : '存档自动保存于本机（双备份防损）：本机数据异常时自动从备份恢复，无需手动备份。')
          : '存档自动双写「本机 + 云端」：登录热点资讯时跨设备自动续玩，本机数据异常时自动从云端恢复，无需手动备份。') + '</div>' +
        /* ★ P280（玩家反馈「加一个手动存档按钮」）：立即存档 = 强制本机+云全量写（forceCloud
           忽略全部节流），并如实回报落点；平时游戏已自动存档（每场比赛/心跳/退出），此键给安心感。 */
        '<button class="btn btn-primary btn-block" id="st-savenow">立即存档（本机 + 云端）</button>' +
        /* ★ P302 [Tap]：兑换码入口（永久免广告）——platform_web_ext 只进 Tap 包，
           热点资讯/网页无 MFLRedeem → 按钮物理不渲染，存档轨逐位不动。 */
        ((window.MFLRedeem && MFLRedeem.available && MFLRedeem.available())
          ? '<button class="btn btn-ghost btn-block mt-8" id="st-redeem">兑换码 · 永久免广告</button>' : '') +
        /* ★ P286：从云端恢复——丢档逃生门（本地全灭/救援态时玩家可手动以云端档覆盖本局） */
        '<button class="btn btn-ghost btn-block mt-8" id="st-cloudrestore">从云端恢复存档（覆盖本机）</button>' +
        /* ★ P301 [Tap]：云端冲突出口——新档撞上云端旧档（_cloudRescue 拒推态）时给玩家
           明确的第二出口（放弃旧档继续本局），否则新档永远不上云。仅 TapTap 容器渲染。 */
        ((window.TapCloudStore && TapCloudStore.available && TapCloudStore.available() && window.State && State._cloudRescue)
          ? '<button class="btn btn-ghost btn-block mt-8" id="st-cloudkeepnew">放弃云端旧档，继续本局（本局恢复上云）</button>' : '') +
        '<div class="dim12" style="margin:6px 0 12px" id="st-cloudstate"></div>' +
        '<button class="btn btn-ghost btn-block" id="st-reset">清空存档 · 重新开始</button>' +
        '<div class="dim12" style="margin-top:6px">只清空当前存档；跨周目累积（生涯积分、已解锁出身）会保留。</div>' +
        '<button class="btn btn-primary btn-block mt-12" id="st-close">关闭</button>');
      /* 开关：就地改按钮文字与样式，不重渲染整个面板（避免丢掉 range 的拖动状态） */
      const bindSw = (id, get, set) => {
        const b = UIkit.$("#" + id);
        if (!b) return;
        b.onclick = UIkit.guard(() => {
          const next = !get();
          set(next);
          b.textContent = next ? "开" : "关";
          b.className = "btn btn-sm " + (next ? "btn-primary" : "btn-ghost");
        }, "声音开关");
      };
      bindSw("st-music", () => C.music !== false, on => Snd.setMusic(on));
      bindSw("st-sfx", () => C.sfx !== false, on => Snd.setSfx(on));
      const mv = UIkit.$("#st-musicvol");
      if (mv && hasMusicVol) mv.oninput = () => Snd.setMusicVol(+mv.value / 100);
      const sv = UIkit.$("#st-sfxvol");
      if (sv && hasSfxVol) sv.oninput = () => Snd.setSfxVol(+sv.value / 100);
      /* ★ P241：导出/导入存档码绑定随功能退役一并移除（含其 DOM，杜绝死按钮） */
      /* ★ P251：「游戏说明」下属按钮——打开玩法说明（与主菜单共用 Menu.showHelp） */
      const helpBtn = UIkit.$("#st-help");
      if (helpBtn) helpBtn.onclick = UIkit.guard(() => {
        if (window.Menu && Menu.showHelp) Menu.showHelp();
        else UIkit.toast("说明暂不可用", "red");
      }, "游戏说明");
      /* ★ P295：「天赋图鉴」下属按钮——全池 26 条天赋效果一览（已拥有高亮+当前档效果） */
      const taldexBtn = UIkit.$("#st-taldex");
      if (taldexBtn) taldexBtn.onclick = UIkit.guard(() => {
        const dd = (window.State && State.data) || null;
        UIkit.modal("<h3>天赋图鉴</h3>" + this._talentDexHtml(dd || {}) +
          '<div class="row" style="gap:8px"><button class="btn btn-primary" id="taldex-ok">关闭</button></div>');
        const ok2 = UIkit.$("#taldex-ok");
        if (ok2) ok2.onclick = () => UIkit.closeModal();
      }, "天赋图鉴");
      /* ★ P280：手动立即存档（forceCloud=true 忽略节流全量写）+ 落点如实回报。
         云落点判定：Tap 渠道 TapCloudStore.available()；热点资讯渠道 Platform.storageAvailable()；
         本机降级态（_idbMode）如实标注。 */
      const saveNowBtn = UIkit.$("#st-savenow");
      if (saveNowBtn) saveNowBtn.onclick = UIkit.guard(() => {
        /* ★ P289 云-only（热点资讯包）：唯一持久层是云端，落点措辞如实标注 */
        let where = "本机";
        try { if (window.State && State.cloudOnlyMode && State.cloudOnlyMode()) where = "云端"; } catch (e) { /* ignore */ }
        if (where === "本机") {
          try { if (window.TapCloudStore && TapCloudStore.available()) where = "本机 + TapTap 云存档"; } catch (e) { /* ignore */ }
          if (where === "本机" && window.Platform && Platform.storageAvailable && Platform.storageAvailable()) where = "本机 + 云端";
        }
        if (State._idbMode) where = "本机备用通道 + " + (where.indexOf("云端") >= 0 ? "云端" : "云端");
        /* ★★ P298-G [Tap]：等推云终态再报——此前 State.save(true) 一发出就 toast「已手动
           存档」，云推实际失败（限频/网络/闸未开）玩家无从知晓（TapTap 差评「专门手动
           保存了还是丢」的观测盲区）。Tap 轨 save 返回推云 Promise；热点资讯云-only 保持
           原即时回报（TapCloudStore 恒不可用 → 走 else 分支，行为逐位不变）。 */
        const tapJob = (window.TapCloudStore && TapCloudStore.available && TapCloudStore.available() && window.State && typeof State.save === "function")
          ? State.save(true) : null;
        const doneToast = (cloudOk) => {
          const isTap = window.TapCloudStore && TapCloudStore.available && TapCloudStore.available();
          if (isTap && !cloudOk) UIkit.toast("已存档本机；云端暂未同步，稍后自动重试", "red");
          else UIkit.toast("已手动存档（" + where + (isTap ? "，云端已同步" : "") + "）", "gold");
          const cs = UIkit.$("#st-cloudstate");
          if (cs) cs.textContent = "上次手动存档：" + new Date().toLocaleTimeString() + " · " + where
            + (isTap ? (cloudOk ? " · 云端已同步" : " · 云端待重试") : "");
        };
        if (tapJob && typeof tapJob.then === "function") tapJob.then(doneToast, () => doneToast(false));
        else {
          try { State.save(true); } catch (e) { /* save 内部已兜底 */ }
          doneToast(false);
        }
      }, "手动存档");
      /* ★ P301 [Tap]：冲突出口——放弃云端旧档（清救援态/未知态，本局进度恢复上云） */
      const keepNewBtn = UIkit.$("#st-cloudkeepnew");
      if (keepNewBtn) keepNewBtn.onclick = UIkit.guard(() => {
        UIkit.confirm({
          title: "放弃云端旧档？",
          body: "云端那份旧存档将被本局进度覆盖，且无法恢复。",
          okText: "放弃旧档", cancelText: "取消", danger: true,
        }).then(yes => {
          if (!yes) return;
          try { State._cloudRescue = null; State._tapPullUnknown = false; State._tapPushVerified = true; } catch (e) { /* ignore */ }
          try { State.save(true); } catch (e2) { /* ignore */ }
          UIkit.toast("已放弃云端旧档，本局进度恢复上云", "gold");
        });
      }, "放弃云端旧档");
      /* ★ P302 [Tap]：兑换码 UI——永久免广告（一码一人，服务端一码一用）。
         兑换需联网一次；激活后本机永久生效且随存档云端走（换机自动恢复）。 */
      const redeemBtn = UIkit.$("#st-redeem");
      if (redeemBtn) redeemBtn.onclick = UIkit.guard(() => {
        const active = window.MFLRedeem && MFLRedeem.active && MFLRedeem.active();
        const tail = (active && window.MFLRedeem.cardTail) ? (MFLRedeem.cardTail() || "") : "";
        UIkit.modal("<h3>兑换码 · 永久免广告</h3>" +
          '<div style="font-size:13px;line-height:1.9;margin:8px 0">' +
          (active
            ? "永久免广告已生效（尾号 " + tail + "）——所有广告点位自动免看直领，次数限制照常。"
            : "输入 16 位兑换码（MFL-XXXX-XXXX-XXXX）。兑换需联网一次；激活后本机永久免广告，随存档云端走（换机恢复存档即自动恢复）。") +
          "</div>" +
          (active ? "" : '<input id="rd-input" style="width:100%;box-sizing:border-box;padding:9px 10px;font-size:15px;letter-spacing:1px;border:1.5px solid #c9d4cc;border-radius:8px" placeholder="MFL-XXXX-XXXX-XXXX" maxlength="19" autocomplete="off">') +
          '<button class="btn btn-primary btn-block mt-12" id="rd-go">' + (active ? "知道了" : "兑换") + "</button>");
        const go = UIkit.$("#rd-go");
        if (go) go.onclick = UIkit.guard(() => {
          if (active) { UIkit.closeModal(); return; }
          const inp = UIkit.$("#rd-input");
          const v = (inp && inp.value) ? inp.value : "";
          if (!v.trim()) { UIkit.toast("请先输入兑换码", "red"); return; }
          go.textContent = "兑换中…";
          go.disabled = true;
          MFLRedeem.redeem(v).then((r) => {
            go.textContent = "兑换";
            go.disabled = false;
            if (r && r.ok) {
              UIkit.closeModal();
              UIkit.toast("兑换成功！永久免广告已生效（尾号 " + (r.codeTail || "") + "）", "gold");
            } else {
              const M = {
                FORMAT: "兑换码格式有误，请核对后重试",
                NETWORK: "网络不可用，兑换需要联网一次",
                NOT_FOUND: "兑换码不存在，请核对后重试",
                USED: "该兑换码已被使用",
                RATE: "操作过于频繁，请稍后再试",
                SERVER_ERR: "服务繁忙，请稍后再试",
                OFFLINE_UNAVAILABLE: "当前环境无法联网兑换",
              };
              UIkit.toast(M[r && r.err] || "兑换失败，请稍后再试", "red");
            }
          });
        }, "兑换码");
      }, "打开兑换码");

      /* ★ P286：从云端恢复（逃生门）——拉云德 → 有效档过完整档校验 → 确认后覆盖
         本地主槽+BAK+清救援态 → reload 重载。与 pullCloud 的「取新者」不同，此键
         语义=「云端为准」，玩家在救援态/怀疑本地损坏时的最后手段。 */
      const cloudRestoreBtn = UIkit.$("#st-cloudrestore");
      if (cloudRestoreBtn) cloudRestoreBtn.onclick = UIkit.guard(() => {
        const self2 = window.State;
        if (!self2 || (!window.CloudStore && !window.TapCloudStore) || (!CloudStore.available() && !TapCloudStore.available())) {
          UIkit.toast("当前环境没有可用的云端存档", "red"); return;
        }
        UIkit.confirm({
          title: "从云端恢复？",
          body: "将用云端存档覆盖本机当前进度（以云端为准）。继续？",
          okText: "恢复",
          danger: true
        }).then(ok => {
          if (!ok) return;
          Promise.resolve(self2._cloudRawLoad()).then(raw => {
            /* ★ P291 非执行路径：raw 只做 JSON.parse 结构还原+完整档判据，通过后 reload
               由 pullCloud 链接管——不进入任何 HTML/脚本形态消费。 */
            let cloud = null;
            try { cloud = raw ? JSON.parse(raw) : null; } catch (e) { cloud = null; }
            if (!(cloud && cloud.meta && cloud.meta.dataset === "real-v1" && cloud.player && cloud.clubId)) {
              UIkit.toast("云端没有可用的有效存档", "red"); return;
            }
            /* ★ P289 云-only：不落本地——清缓存后 reload，boot pullCloud 自动以云为准 */
            if (self2.cloudOnlyMode && self2.cloudOnlyMode()) {
              self2._cloudCache = null;
              self2._cloudRescue = null;
              UIkit.toast("已从云端恢复，正在重载…", "gold");
              setTimeout(() => location.reload(), 600);
              return;
            }
            try {
              localStorage.setItem("mfl_web_save_v2_s0", raw);
              localStorage.setItem("mfl_web_save_v2_bak", raw);
            } catch (e) { /* localStorage 满：写内存旁路兜底 */
              self2._idbBootRaw = raw;
            }
            self2._cloudRescue = null;
            UIkit.toast("已从云端恢复，正在重载…", "gold");
            setTimeout(() => location.reload(), 600);
          }).catch(() => UIkit.toast("云端拉取失败，请检查网络后重试", "red"));
        });
      }, "从云端恢复");
      /* ★ P280：云同步状态可见化（诊断 iOS 丢档第一手信息——玩家截图设置页即可回报）
         ★ P286b：补「云端最近同步成功时刻」（CloudStore.lastOkAt，_put 成功即更新）——
         「已连接」≠「真的写上去了」；玩家反馈丢档时这一行直接分辨「从没上过云」vs「同步正常」。 */
      const cloudStateEl = UIkit.$("#st-cloudstate");
      if (cloudStateEl) {
        let cs = "云端不可用（进度仅存本机）";
        try { if (window.TapCloudStore && TapCloudStore.available()) cs = "TapTap 云存档：已连接（自动上传）"; } catch (e) { /* ignore */ }
        if (cs.indexOf("不可用") >= 0 && window.Platform && Platform.storageAvailable && Platform.storageAvailable()) cs = "云端同步：已连接（自动上传）";
        let lastSync = "";
        try {
          /* ★ P290：Tap 原生云通道优先用 TapCloudStore.lastOkAt（push 成功即更新）；
             失败连跑时下方追加「重试中」提示——此前 Tap 推失败完全无观测面。 */
          const tapOk = (window.TapCloudStore && TapCloudStore.available && TapCloudStore.available() && typeof TapCloudStore.lastOkAt === "function") ? (TapCloudStore.lastOkAt() || 0) : 0;
          const okAt = tapOk || ((window.CloudStore && CloudStore.lastOkAt) || 0);
          if (okAt) lastSync = " · 云端最近同步 " + Math.max(1, Math.round((Date.now() - okAt) / 60000)) + " 分钟前";
          else if (cs.indexOf("不可用") < 0) lastSync = " · 云端最近同步：暂无成功记录";
        } catch (e) { /* ignore */ }
        /* ★ P290：Tap 云连败可见化（failStreak>0 = 当前云侧落后，玩家截图即可回报） */
        try {
          if (window.TapCloudStore && TapCloudStore.available && TapCloudStore.available() && typeof TapCloudStore.failStreak === "function" && TapCloudStore.failStreak() > 0) {
            lastSync += " · 云端同步重试中（已失败 " + TapCloudStore.failStreak() + " 次）";
          }
        } catch (e) { /* ignore */ }
        /* ★★ P298-F [Tap]：本地层存在性诊断——容器清 WebView 存储是 Tap 丢档第一触发源，
           玩家截图这一行即可分辨「本地被清但云端有（可救）」vs「本地云端都空（需排查
           云推失败）」。本地键同步读；IDB 镜像异步检测后就地追加（不阻塞面板渲染）。 */
        try {
          if (window.TapCloudStore && TapCloudStore.available && TapCloudStore.available()) {
            let hasMain = false, hasBak = false;
            try { hasMain = !!localStorage.getItem("mfl_web_save_v2_s0"); } catch (e) { /* ignore */ }
            try { hasBak = !!localStorage.getItem("mfl_web_save_v2_bak"); } catch (e) { /* ignore */ }
            lastSync += " · 本地键" + (hasMain ? "有" : "无") + "/备份" + (hasBak ? "有" : "无");
            if (typeof indexedDB !== "undefined" && window.State && typeof State.idbMirrorPeek === "function") {
              State.idbMirrorPeek(function (raw) {
                try {
                  const el = UIkit.$("#st-cloudstate");
                  if (el) el.textContent = el.textContent + " · 镜像" + (raw ? "有" : "无");
                } catch (e) { /* ignore */ }
              });
            }
          }
        } catch (e) { /* ignore */ }
        cloudStateEl.textContent = cs + lastSync + (State && State.data && State.data.meta ? " · 档案时间 " + new Date(State.data.meta.saved || Date.now()).toLocaleString() : "");
      }
      /* P133：原生 confirm → UIkit.confirm（WebView 兼容 + 样式统一；danger 红档） */
      UIkit.$("#st-reset").onclick = UIkit.guard(() => {
        UIkit.confirm({
          title: "清空存档？",
          body: "确定清空存档并重新开始？此操作不可恢复。\n\n（跨周目累积会保留）",
          okText: "清空并重开",
          danger: true
        }).then(ok => {
          if (!ok) return;
          try {
            Object.keys(localStorage).filter(k => k.indexOf("mfl_web_save_v2") === 0).forEach(k => localStorage.removeItem(k));
          } catch (err) { /* ignore */ }
          /* ★ P289 云-only（热点资讯包）：本地清完必须连云一起清——否则下次 boot pullCloud
             会把云档原样搬回来，玩家以为清空失败。云键清空=空串覆写（无删除 API）。 */
          try {
            if (window.State && State.cloudOnlyMode && State.cloudOnlyMode()) {
              State._cloudCache = null;
              if (window.CloudStore && typeof CloudStore.wipe === "function") CloudStore.wipe();
            }
          } catch (err2) { /* ignore */ }
          location.reload();
        });
      }, "清空存档");
      UIkit.$("#st-close").onclick = UIkit.guard(() => UIkit.closeModal(), "关闭设置");
    },
  };
  window.Hub = Hub;

  /* ══════════ 热点资讯热议帖子流（自 v1 NewsUI 无损移植；右上角按钮进入） ══════════ */
  const NewsUI = {
    openId: null,
    open() {
      if (!State.data) { UIkit.toast("先开始职业生涯后，这里才会有热议"); return; }
      this.openId = null;
      UIkit.show("news");
      const bk = $("#news-back");
      if (bk && !bk._bound) {
        bk._bound = true;
        bk.onclick = () => {
          if (this.openId !== null) { this.openId = null; this.render(); }
          else { UIkit.show("hub"); Hub.header(); }
        };
      }
      this.render();
    },
    render() {
      const d = State.data;
      News.ensure(State);
      const box = $("#news-main");
      if (!box) return;
      if (this.openId !== null) {
        const n = d.news.find(x => x.id === this.openId);
        if (!n) { this.openId = null; this.render(); return; }
        $("#news-title-bar").textContent = "帖子详情";
        box.innerHTML = '<div class="panel"><div class="n-tag">' + n.tag + '</div><div class="n-title" style="font-size:15px">' + n.title + "</div>" +
          '<div class="n-meta mt-8"><span>' + n.dateStr + '</span><span class="heat-flame">' + n.heat + " 热度</span><span>" + n.replies.length + " 回复</span></div></div>" +
          '<div class="panel"><div class="panel-title">全部回复 · 按热评排序</div>' +
          n.replies.map(r => '<div class="reply"><div class="r-avatar">' + r.user.slice(0, 1) + '</div><div style="flex:1;min-width:0"><div class="r-user">' + r.user + " · " + r.floor + '楼</div><div class="r-text">' + r.text + '</div><div class="r-likes">赞 ' + r.likes + "</div></div></div>").join("") +
          '<div style="text-align:center;color:var(--dim);font-size:11px;padding:8px 0">—— 已加载全部回复 ——</div></div>';
        return;
      }
      $("#news-title-bar").textContent = "热点资讯热议";
      News.markAllRead(State); State.save(); Hub.header();
      if (!d.news.length) {
        box.innerHTML = '<div class="panel" style="text-align:center;color:var(--dim);font-size:13px;padding:24px 0">暂无热议，去踢出点动静来吧。</div>';
        return;
      }
      box.innerHTML = d.news.map(n =>
        '<div class="news-item" data-nid="' + n.id + '"><div><span class="n-tag">' + n.tag + '</span><span class="n-title">' + n.title + (n.read ? "" : ' <span class="n-new">新</span>') + "</span></div>" +
        '<div class="n-meta"><span>' + n.dateStr + '</span><span class="heat-flame">' + n.heat + " 热度</span><span>" + n.replies.length + " 回复</span></div></div>").join("");
      box.querySelectorAll(".news-item").forEach(el => {
        el.onclick = () => { this.openId = +el.dataset.nid; this.render(); };
      });
    },
  };
  window.NewsUI = NewsUI;
})();
