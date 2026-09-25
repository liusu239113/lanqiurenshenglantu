/* ============================================================================
   v2/flow.js — 赛季结算 / 退役 / 主菜单
   赛季结算自旧壳 SeasonEnd.show 无损移植核心链（finishSeason→SP→转会→休赛期）。
   ============================================================================ */
(function () {
  'use strict';
  const esc = s => UIkit.esc(s);

  const Flow = {
    /** 赛季结算链：报告 → 结算弹窗（荣誉/SP/转会报价/续约）→ 休赛期
     *  幂等：_inEnd 流程内防重入（触发条件 pendingFixtures 空，语义见 Hub.refresh）
     *  ★★ P172 修复（玩家实测：第一赛季报告卡出现后无限"日程推进中"）：
     *    旧写法报告卡回调 `() => Flow.seasonEnd()` 被**本函数自己置的 _inEnd 挡死**
     *    （31 行 return 时 _inEnd 仍 true）⇒ 结算卡永不出现 ⇒ `d.offseason` 永远不置
     *    true ⇒ `advanceDay` 的休赛期结束分支（career.js:576）永不触发 ⇒ 新赛季赛程
     *    永不生成 ⇒ 玩家无限"日程推进中"。且**不可**用"复位 _inEnd 后重入"修——
     *    finishSeason 无幂等守卫，重入 = 成长/荣誉/履历双重结算。
     *    ⇒ 拆为两段：报告卡回调直接进 `_seasonEndAfterReport`（_inEnd 保持 true，
     *      finishSeason 只跑一次；结算卡 se-go 处照常复位）。 */
    seasonEnd() {
      const d = State.data;
      /* ★★ P291 死链自愈（不变量版，堵「finishSeason 中途抛错 → 重登才自愈」）：
         _inEnd=true 且 offseason=false 的**合法**窗口只存在于本函数 35→48 行的同步段
         （P284-B 在任何卡片展示前已置 offseason=true，且该段无 await 不可重入观测）
         ⇒ 运行时观察到该组合必为死链（finishSeason 抛错后 _inEnd 粘死、settled 未知、
         pending=0、时间照走但永不结算不开新赛季 = 玩家「玩着玩着没比赛、重登又有比赛」
         的第二形态），当场清场让本次调用正常走结算/自愈。 */
      if (this._inEnd && !d.offseason) this._inEnd = false;
      if (this._inEnd) return;
      /* ★★ P284（三重防线最外层）：结算卡/报告展示期间刷新重载后，Hub.refresh 仍会
         走到本入口（offseason/pending 触发条件无「本季已结算」判据）——本季已结算
         （d._seasonSettled=true，finishSeason 落账）时直接返回，连空结算卡都不弹。
         ★★ P285b（Tap 玩家实测「时间一直过、没比赛、年龄/合同冻结」400 天空转复现
         _p285b_stall_scan S1）：settled=true 与 offseason=false 并存 = 结算已完成却
         永远卡在赛季态（任意历史入口漏置 offseason——如开季终极兜底只推日期不清
         settled、异常残留）→ 本守卫此前直接 return = 死锁。改为**自愈**：补置
         offseason 放行休赛期（绝不重结算），玩家推进到季初正常开新赛季。 */
      if (d._seasonSettled) {
        /* ★ P290（青训「结束后无后续比赛」检修加固）：settled=true 即结算已落账，
           本分支必然拦截重入 ⇒ 残留的 _inEnd 已无保护意义，清掉——堵「上一季结算卡链
           中途异常 → _inEnd 粘死 → 本季 refresh 触发 seasonEnd 恒空转（无比赛、无
           休赛期，推日期循环）」的残留形态（_inEnd 是内存态，重启自愈、会话内必现）。 */
        this._inEnd = false;
        if (!d.offseason) { d.offseason = true; State.save(); }
        return;
      }
      this._inEnd = true;
      let result;
      try {
        result = SeasonSystem.finishSeason(State);
      } catch (errFS) {
        /* ★ P291：finishSeason 抛错不再粘死 _inEnd——复位后由下一次 refresh 重试结算
           （不强制补置 offseason：结算未完成，弃结算=吞成长/SP）；BMC033 首次给出
           真实抛点观测面。 */
        this._inEnd = false;
        try { console.error("[flow] finishSeason 抛错（_inEnd 已复位，下个 refresh 重试结算）", errFS); } catch (e) { /* ignore */ }
        try { if (window.Track && Track.click) Track.click("BMC033", "SETTLE", "finish_season_throw:" + String((errFS && errFS.message) || errFS).slice(0, 80)); } catch (e) { /* ignore */ }
        throw errFS;
      }
      const spGain = Skills.seasonGain(result, d);
      Skills.grant(d, spGain);
      d._lastSpGain = { sp: spGain, hl: d._seasonHighlights || 0 };
      d._seasonHighlights = 0;
      d.bestSeasonRating = Math.max(d.bestSeasonRating || 0, result.avgRating || 0);
      try { d._lastSeasonResult = JSON.parse(JSON.stringify(result)); } catch (err) { d._lastSeasonResult = null; }
      d.lastSettledSeason = d.season;
      /* ★★ P284（方案 B）：offseason 提前置位——原唯一写点在 se-go（玩家点「进入
         休赛期」），结算卡/报告展示期间档内恒 false + pending 空 = Hub.refresh
         重触发窗口（重复结算根因）。提前到落盘处后，展示期间任何刷新/重载都不再
         满足触发条件；se-go 只剩推进日期+关卡职责。 */
      d.offseason = true;
      State.save();
      if (window.SeasonReport) {
        d.lastSeasonAwards = result.awards.map(a => a.name);
        try { SeasonReport.recordSeason(State, d.season - 1); State.save(); } catch (err) { /* ignore */ }
        if (d._seasonReportShown !== d.season) {
          d._seasonReportShown = d.season;
          State.save();
          /* ★ P290：报告卡回调同加自愈网（回调触发点 = 玩家点「继续」，异常时
             _inEnd 已置 true 且永不复位 ⇒ 会话内永久无结算无比赛）。 */
          SeasonReport.show(State, () => {
            try { this._seasonEndAfterReport(result); } catch (errR) { this._settleChainRecover(errR); }
          }, d.season - 1);
          return;
        }
      }
      try { this._seasonEndAfterReport(result); } catch (errD) { this._settleChainRecover(errD); }
    },

    /** ★★ P290 青训「结束后无后续比赛」检修 · 结算卡链自愈网（数据层六场景实证全绿
     *  后的唯一残留缺口）：seasonEnd 在 `_inEnd=true` 之后、se-go 复位 `_inEnd=false`
     *  之前的任何一步抛错（SeasonReport 渲染 / CardHost / 生命周期邀约面板 / UIkit
     *  绑定——Tap WebView 环境差异面），会让 _inEnd 粘死：本会话内 pending=0 且
     *  offseason=false，refresh 每次 entry 即 return ⇒ 玩家推日期永远无比赛（重启
     *  才自愈——与玩家反馈形态吻合）。本网把异常形态收敛为「可恢复的休赛期」：
     *  数据已落账（finishSeason 先于卡片链），补置 offseason + 回 Hub 即无损续玩。
     *  注意：绝不能在这里补跑 finishSeason（幂等守卫会拦，但语义上也不允许）。 */
    _settleChainRecover(err) {
      try { console.error("[flow] 结算卡链异常（已自愈为休赛期收口）", err); } catch (e) { /* ignore */ }
      this._inEnd = false;
      try {
        const d = State.data;
        if (d && !d.offseason) { d.offseason = true; State.save(); }
        if (window.UIkit && UIkit.show) UIkit.show("hub");
        if (window.Hub && Hub.enter) Hub.enter();
        try { if (window.UIkit) UIkit.toast("赛季结算已完成，已进入休赛期", "gold"); } catch (eT) { /* ignore */ }
      } catch (eH) { /* 兜底失败交由下次 refresh（settled 守卫已会自愈） */ }
    },

    /** ★ P172：赛季结算后半段（报告卡之后）——结算卡 / 生命周期邀约 / 休赛期入口。
     *  由 seasonEnd 直接调用或报告卡回调调用；_inEnd 在 se-go（进入休赛期）复位。 */
    _seasonEndAfterReport(result) {
      const d = State.data;
      /* P134 场景分工：夺冠时刻=champion；非冠的赛季结算=生涯时刻（career，原误用比赛曲 resolve）
         ★ P284（方案 C）：青训线不走「联赛冠军」口径——青年荣誉按 A6 命名纪律是
           「青年联赛优胜」，冠军曲/冠军播报只属于成年线。 */
      if (window.Snd) Snd.setBgm((!result.youth && result.myRank === 1) || result.awards.some(a => a.name.indexOf("冠军") >= 0) ? "champion" : "career");
      try {
        const vars = { player: d.player.name, team: ((window.teamById && teamById(d.clubId)) || { name: "俱乐部" }).name, season: (d.season - 1) };
        if (!result.youth && result.myRank === 1) News.onEvent(State, "league_champion", vars); // ★ P284：青训不发联赛冠军播报（「奖杯陈列室+1」文案对青训虚假——青年荣誉不进 d.trophies）
        if (result.awards.some(a => a.name.indexOf("金靴") >= 0)) News.onEvent(State, "goldenboot", vars);
      } catch (err) { /* ignore */ }
      /* P53：赛季结束由弹窗改为内嵌漫画卡（不留弹窗版事件） */
      const rankArt = result.myRank === 1 ? "ec_trophy" : (result.myRank > 0 && result.myRank <= 4 ? "ec_derby" : "ec_stadium");
      let html = '<div class="ec-card card-spread">' +
        CardHost.headTags("赛季 · " + (d.season - 1) + " 落幕") +
        '<div class="ec-art" style="' + CardHost.artStyle(rankArt) + '"></div>' +
        '<div class="ec-title">' + (result.myRank > 0 ? "联赛第 " + result.myRank + " 名" : "赛季结束")
          /* ★ P295（玩家反馈「19-20 赛季第二名与内容对不上」的标签半边）：finishSeason 已
             d.season++，此处标签必须取 d.season-1（与上方 headTags 同一赛季口径）——
             旧写法把"下一季"的年份标到刚结束的赛季上（跨年季显示成 20-21）。 */
          + ((window.CONFIG && CONFIG.seasonLabel) ? " · " + CONFIG.seasonLabel(d.leagueId, d.season - 1) : "") + "</div>" +
        '<div class="ec-body">场均评分 <b>' + result.avgRating + "</b>　·　成长 <b>" + (result.growth.delta >= 0 ? "+" : "") + result.growth.delta + " 点</b>" +
        (result.myRank === 1 ? '<br><b style="color:var(--gold)">' + (result.youth ? "青年联赛优胜" : "联赛冠军") + "</b>" : "") +
        /* ★ P105-B2：出场承诺兑现结算（met 在 Transfer.promiseSettle 已落档；只读存档展示） */
        (function () {
          const p = d.transfer && d.transfer.promise;
          if (!p || p.met === null || p.clubId !== d.clubId) return "";
          return p.met
            ? '<br><span style="color:var(--success)">俱乐部兑现了「' + (p.role === "starter" ? "常备主力" : "重要轮换") + '」的承诺。</span>'
            : '<br><b style="color:var(--danger)">俱乐部没有兑现「' + (p.role === "starter" ? "常备主力" : "重要轮换") + '」的承诺——信任与情绪受到了伤害。</b>';
        })() + "</div>";
      if (result.awards.length) {
        html += '<div class="panel"><div class="panel-title">赛季荣誉</div>' + result.awards.map(a => '<div class="list-item"><b>' + esc(a.name) + "</b></div>").join("") + "</div>";
      }
      /* ═══ P113：青训生命周期邀约（消费 Youth.finishYouthSeason 产出的 lifecycle）═══
         接受动作统一 = 写 d.nextClub + Youth.leave（相位转移唯一写点仍在 youth.js）+ 职业合同落档。
         promotion（达线征召）/ buyOffers（未达线求购）可婉拒（留营再练一年）；
         graduate（19 岁强制毕业）必选其一（三份报价或回母队），未选择前「进入休赛期」禁用
         —— _forceYouthExit 兜底保证即使 UI 层漏选也不卡死。 */
      let gradPending = false;
      /* ★★ P198 修复（群友实测重大 bug「接受征召：accept is not defined」）：accept 原先
         定义在下方 if 块**内部**（块级 const），而 _bindOffer 在块外闭包引用它 → 点击
         「接受征召·升入一线队 / 求购 / 毕业」任一按钮必抛 ReferenceError，青训球员永远
         升不上一线队。提升到函数作用域； Youth.leave 相位转移语义不变。 */
      const accept = (reason, offer, wage) => {
        d.nextClub = { clubId: offer.clubId, leagueId: offer.leagueId, clubName: offer.clubName };
        if (window.Youth.leave(d, reason)) {
          d.contract = { years: 2, wage: wage };
          /* ★ P220：青训出口落转会记录（via=academy → 传奇排行榜标注「青训提拔入队」） */
          d.history = d.history || {};
          d.history.transfers = d.history.transfers || [];
          d.history.transfers.push({ season: d.season, to: offer.clubName || offer.clubId, fee: 0, free: true, via: "academy" });
          UIkit.toast("已与 " + offer.clubName + " 签下第一份职业合同", "gold");
          State.save();
          return true;
        }
        return false;
      };
      if (result.youth && result.lifecycle && !d.retired && window.Youth) {
        const lc = result.lifecycle;
        if (lc.type === "promotion" && lc.promotion) {
          const p = lc.promotion;
          html += '<div class="panel hl"><div class="panel-title">一线队的门开了 · 征召</div>' +
            '<p style="font-size:13px;line-height:1.9">' + esc(p.clubName) + " 一线队向你发出征召（提拔线 " + lc.promoteLine + " · 你 " + lc.ovr + "）。" +
            "第一份职业合同：周薪 <b style='color:var(--gold)'>" + Career.fmtMoney(p.wage) + "</b> · 2 年。</p>" +
            '<button class="btn btn-primary btn-block" id="lc-promo">接受征召 · 升入一线队 ▸</button>' +
            '<button class="btn btn-ghost btn-block mt-8" id="lc-stay">再留青训营一年</button></div>';
        } else if (lc.type === "buyOffers" && lc.buyOffers.length) {
          html += '<div class="panel"><div class="panel-title">低级别球队的求购</div>' +
            '<p style="font-size:13px;line-height:1.9">母队一线队提拔线是 <b>' + lc.promoteLine + "</b>（你 " + lc.ovr + "），但下面这些球队愿意现在就给你职业合同——去有球踢的地方，还是继续等母队的门开？</p>" +
            lc.buyOffers.map((o, i) => '<button class="btn btn-ghost btn-block mt-8" id="lc-buy' + i + '" style="text-align:left">接受 ' + esc(o.clubName) + "（" + esc(o.leagueName) + " · 周薪 " + Career.fmtMoney(o.wage) + "）</button>").join("") +
            '<button class="btn btn-ghost btn-block mt-8" id="lc-stay">婉拒，留在青训营</button></div>';
        } else if (lc.type === "graduate") {
          gradPending = true;
          html += '<div class="panel hl"><div class="panel-title">青训营毕业通知书</div>' +
            '<p style="font-size:13px;line-height:1.9">你已年满 19 岁，青训营按规定必须放人（提拔线 ' + lc.promoteLine + " · 你 " + lc.ovr + "）。手上有 " + lc.gradOffers.length + " 份职业报价——<b>必须选一份</b>，或者回母队一线队报到。</p>" +
            lc.gradOffers.map((o, i) => '<button class="btn btn-primary btn-block mt-8" id="lc-grad' + i + '">签约 ' + esc(o.clubName) + "（" + esc(o.leagueName) + " · 周薪 " + Career.fmtMoney(o.wage) + "）</button>").join("") +
            '<button class="btn btn-ghost btn-block mt-8" id="lc-back">回母队一线队报到</button></div>';
        }
        /* 选择区按钮绑定（在 se-go 之前完成 DOM 注入 —— html 拼接后统一挂） */
      }
      const spInfo = d._lastSpGain || { sp: 0, hl: 0 };
      html += '<div class="panel hl"><div class="panel-title">技能点结算</div>' +
        '<p style="font-size:13px;line-height:1.9">本季高光 <b>' + spInfo.hl + "</b> 次 → 技能点 <b style='color:var(--gold)'>+" + spInfo.sp + "</b>（现有 <b style='color:var(--gold)'>" + Skills.sp(d) + "</b> 点）。技能点投入技能库，想好你的流派。</p></div>";
      /* ═══ P180（用户拍板，对齐篮球线）：赛季结算看广告升级天赋（每季 1 次）═══
         档位链 bronze→silver→gold→platinum→diamond，升一档 = 该天赋数值按 TIER 下一档生效；
         广告成功后内联展开天赋选择（不动结算卡本体 —— _seasonEndAfterReport 重入有 News 副作用）。 */
      const _talentAd = (function () {
        if (!window.Ads || !window.TAL || Ads.talentLeft(State) <= 0) return null;
        const up = (d.talents || []).filter(id => {
          const ti = TAL.TIER_ORDER.indexOf(TAL.tierOf(d, id));
          return ti >= 0 && ti < TAL.TIER_ORDER.length - 1;
        });
        return up.length ? up : null;
      })();
      if (_talentAd) {
        html += '<div class="panel"><div class="panel-title">天赋精进 · 看视频</div>' +
          '<p style="font-size:13px;line-height:1.9">看一次视频，为你的天赋指定 <b>档位 +1</b>（每季 1 次，数值按新档生效）。</p>' +
          '<button class="btn btn-gold btn-block" id="se-talent">' + (window.ICO ? ICO("play") + " " : "") + "看视频 · 升级天赋 ▸</button>" +
          '<div id="se-talent-list" style="display:none;margin-top:8px"></div></div>';
      }
      const cYears = (d.contract && d.contract.years) || 0;
      const expired = cYears <= 0;
      const renewWage = expired ? Career.wageOf(PlayerSystem.overall(d.player), ((window.teamById && teamById(d.clubId)) || { strength: 60 }).strength, R.next()) : 0;
      /* P49：报价不再在赛季末弹窗，改存入存档 → 休赛期「转会与合同」卡里决定去留 */
      d.seasonEndOffers = (result.offers || []).map(o => ({
        clubId: o.clubId, clubName: o.clubName, leagueId: o.leagueId, leagueName: o.leagueName,
        wage: o.wage, signingBonus: o.signingBonus, fee: o.fee || 0,
        style: o.style, playingTime: o.playingTime, ambition: o.ambition, releaseClause: o.releaseClause, // P61 转会窗富化字段
        /* ★ P117 战术适配：承诺位置/出场时间（球队地位）/球队战术/客串标记 */
        slotPos: o.slotPos, slotPosName: o.slotPosName, promise: o.promise, promiseKey: o.promiseKey,
        tactic: o.tactic, tacticEra: o.tacticEra, cross: o.cross,
      }));
      d.seasonEndMeta = { expired, renewWage, myRank: result.myRank, avgRating: result.avgRating };
      html += '<div class="panel"><div class="panel-title">转会窗</div><div class="dim12">' +
        ((result.offers || []).length ? "收到 <b>" + result.offers.length + " 份报价</b>——进入休赛期后可在「转会与合同」里决定去留。" : "本赛季没有俱乐部递上报价。") +
        (expired ? "<br><b style='color:var(--gold)'>合同已到期</b>：在休赛期选择留守即与现俱乐部续约 2 年。" : "") +
        "</div></div>";
      html += '<button class="btn btn-primary" id="se-go">进入休赛期 ▸</button></div>';
      CardHost.show(html, { dismissable: false });
      const self = this;
      /* ── P113：生命周期选择区绑定（graduate 必选 → 未选前置灰 se-go）── */
      const _lc = result.youth ? result.lifecycle : null;
      const _bindOffer = (id, reason, offer, wage) => {
        const b = UIkit.$("#" + id);
        if (b) b.onclick = UIkit.guard(() => {
          if (accept(reason, offer, wage)) { const go = UIkit.$("#se-go"); if (go) { go.disabled = false; go.textContent = "进入休赛期 ▸"; } }
        }, "接受青训邀约");
      };
      if (_lc && _lc.type === "promotion" && _lc.promotion) {
        _bindOffer("lc-promo", "promoted", _lc.promotion, _lc.promotion.wage);
        const stay = UIkit.$("#lc-stay");
        if (stay) stay.onclick = UIkit.guard(() => UIkit.toast("你选择再留青训营一年——明年再来敲一线队的门", ""), "留队");
      } else if (_lc && _lc.type === "buyOffers" && _lc.buyOffers.length) {
        _lc.buyOffers.forEach((o, i) => _bindOffer("lc-buy" + i, "drop", o, o.wage));
        const stay = UIkit.$("#lc-stay");
        if (stay) stay.onclick = UIkit.guard(() => UIkit.toast("你婉拒了求购——留在青训营继续练", ""), "留队");
      } else if (_lc && _lc.type === "graduate") {
        _lc.gradOffers.forEach((o, i) => _bindOffer("lc-grad" + i, "drop", o, o.wage));
        /* ★ P296：「母队」跟当前效力青年队走（剥 "y" 前缀），不读入营时的 academyId
           —— 与 youth.js finishYouthSeason 的 _curMotherId 同口径（提拔/求购/毕业三支一致）。 */
        const _momId = (typeof d.clubId === "string" && d.clubId.charAt(0) === "y" && window.teamById && teamById(d.clubId.slice(1)))
          ? d.clubId.slice(1) : d.youth.academyId;
        const momOffer = { clubId: _momId, leagueId: (window.teamById && teamById(_momId) || {}).league || _momId, clubName: (window.teamById && teamById(_momId) || { name: "母队" }).name };
        const momWage = (window.Career && Career.wageOf) ? Math.max(3000, Math.round(Career.wageOf(_lc.ovr, (window.teamById && teamById(_momId) || { strength: 60 }).strength, 0.5))) : 3000;
        _bindOffer("lc-back", "fallback", momOffer, momWage);
        const go0 = UIkit.$("#se-go");
        if (go0) { go0.disabled = true; go0.textContent = "先决定你的去向 ▸"; }
      }
      let endDone = false;
      /* ── P180：天赋升级广告（内联展开选择；成功才消耗配额）── */
      const talentBtn = UIkit.$("#se-talent");
      if (talentBtn && _talentAd) {
        talentBtn.onclick = UIkit.guard(function () {
          Ads.show("talent_up", function () {
            Ads.consumeTalent(State);
            const listEl = UIkit.$("#se-talent-list");
            if (!listEl) return;
            talentBtn.style.display = "none";
            listEl.style.display = "block";
            listEl.innerHTML = '<div class="dim12" style="margin-bottom:6px">选择要精进的天赋（升一档）：</div>' +
              _talentAd.map(function (id) {
                const t = TAL.byId[id];
                const cur = TAL.tierOf(d, id);
                const nx = TAL.TIER_ORDER[TAL.TIER_ORDER.indexOf(cur) + 1];
                /* ★ P295（玩家反馈「广告提升的时候不知道优先选择哪个」）：按钮内联
                   当前效果 + 升档后效果（descOf 单源），选之前看得见每一档差多少。 */
                return '<button class="btn btn-ghost btn-block mt-8" data-talup="' + id + '" style="text-align:left">' +
                  "<b>" + esc(t.name) + "</b>　" + TAL.TIER[cur].name + " → <b style='color:var(--gold)'>" + TAL.TIER[nx].name + "</b>" +
                  '<div style="font-size:12px;line-height:1.6;margin-top:2px;color:var(--text-dim)">现在：' + esc(TAL.descOf(id, cur)) + "<br>升后：<b style='color:var(--gold)'>" + esc(TAL.descOf(id, nx)) + "</b></div></button>";
              }).join("");
            listEl.querySelectorAll("[data-talup]").forEach(function (b) {
              b.onclick = UIkit.guard(function () {
                const id = b.dataset.talup;
                if (!TAL.tierUp(d, id)) { UIkit.toast("该天赋已满档", "red"); return; }
                const t = TAL.byId[id];
                listEl.innerHTML = '<p style="font-size:13px;line-height:1.9;color:var(--success)">「' + esc(t.name) + "」已精进至 <b style='color:var(--gold)'>" + TAL.TIER[TAL.tierOf(d, id)].name + " 档</b>——下赛季以此档生效。</p>";
                State.save();
                UIkit.toast("天赋精进成功", "gold");
              }, "天赋升档");
            });
          });
        }, "天赋升级广告");
      }
      /* ★ P290：se-go 元素 null 守卫——卡片渲染链异常时 UIkit.$ 返回 null，
         裸 `.onclick=` 会把渲染异常升级成结算链粘死（上方法自愈网的触发源之一）。 */
      const _goBtn = UIkit.$("#se-go");
      if (_goBtn) _goBtn.onclick = UIkit.guard(function () {
        if (endDone) return;
        endDone = true;
        /* ★ P284（方案 B）：d.offseason = true 已提前到结算落盘处（本函数开头），
           此处不再重复置位——本按钮只剩「推进日期到休赛期首日 + 关卡收口」。 */
        /* ★ P100-B1：休赛期起点 = 本联赛赛季末日 + 1 天（欧洲 5 月下旬 / 中超 11 月上）。
           旧硬编码 {year: season-1, month:12, day:16} 是旧抽象轴（2~12 月单年）的跨年 hack。 */
        d.date = CONFIG.calNextDay(CONFIG.calEnd(d.leagueId, d.season));
        State.save();
        if (window.Snd) Snd.setBgm("career"); // P134 进入休赛期=回日常（原误用比赛曲 resolve）
        self._inEnd = false;
        if (window.EventCards) EventCards.afterSeasonEnd(State, { rank: result.myRank }, function () { UIkit.show("hub"); Hub.enter(); });
        else { UIkit.show("hub"); Hub.enter(); }
      }, "进入休赛期");
    },

    /** 退役：告别战章回卡先行 → 传奇指数结算卡 */
    retire(forced) {
      const d = State.data;
      if (window.Chapters && (!d.chapters || !d.chapters.farewell)) {
        Chapters.farewell();
        const ok = UIkit.$("#ch-ok");
        if (ok) {
          const orig = ok.onclick;
          ok.onclick = UIkit.guard(function () { orig.call(ok); Flow.retire(forced); }, "告别战继续");
          return;
        }
      }
      /* P93：退役结算改用共享的 Career.retire —— 与旧壳同源，
         恢复 8 种特殊结局（data_endings.js）与结局插画 */
      let ret = null;
      try { ret = (window.Career && Career.retire) ? Career.retire(State, !!forced) : null; }
      catch (err) { console.warn("retire", err); ret = null; }
      if (!d.retired) d.retired = true;
      if (!d._retireCounted) { d._retireCounted = true; d.careersCompleted = (d.careersCompleted || 0) + 1; }
      if (window.News) { try { News.onEvent(State, "retire", { player: d.player.name }); } catch (err) { /* ignore */ } }
      const legacy = ret ? ret.legacy : ((window.Career && Career.legacyOf) ? Career.legacyOf(State) : 0);
      /* ★★ P97 M4-4.5：跨档累积 —— 退役是**唯一**把本周目成果并入 META 的时点。
         ★ 位置很关键：必须在 `Career.retire` **之后**（会算出结局）、结局卡渲染 **之前**，
           此刻 `d` 的生涯数据仍完整，`Legacy.points(d)` 才算得准。
         ★ 失败静默：退役是**不可逆**的核心路径，不能被存档层拖垮。 */
      let metaInfo = null;
      if (window.Meta && window.Legacy && Meta.retire) {
        /* ★ P129a：透传 tierRank/tierName —— 传承包成色系数 μ 的唯一来源
           （tierRank 与 tier 同在 Career.retire 内判定，单源）。
           ★ P128c/P129b：bizCount + biz 座明细随行 —— 建筑继承的实持依据
           （快照在 Meta.retire 内按 BIZ_CAP 截断，flow 只递原料）。 */
        const _bizSnap = (d.finance && Array.isArray(d.finance.biz))
          ? d.finance.biz.map(b => ({ type: b.type, invested: b.invested, matureMonthly: b.matureMonthly, curMonthly: b.curMonthly }))
          : [];
        try { metaInfo = Meta.retire(Legacy.points(d), { season: d.season, legacy: legacy, tierRank: ret ? (ret.tierRank || 0) : 0, tierName: (ret && ret.tier && ret.tier.name) || "", bizCount: _bizSnap.length, biz: _bizSnap }); }
        catch (err) { console.warn("meta.retire", err); metaInfo = null; }
      }
      const metaUnlock = (window.Potential && Potential.unlockOf) ? Potential.unlockOf(metaInfo ? metaInfo.total : 0) : 0;
      /* 结局：特殊结局按优先级命中，否则落回底轨 4 档 */
      const e = (ret && (ret.ending || ret.tier)) ||
        { id: "pro", name: "职业球员", desc: "平凡而真实的足球人生，你曾为梦想全力以赴。" };
      const trophies = d.trophies || [];
      /* P53：退役结算同样卡化 */
      const trophyN = trophies.length;
      /* 结局插画：endings/redesign 是 loose 图（不走图集），comic 图才过 ArtSprite */
      const endArt = e.art || (trophyN ? "assets/comic/ec_tribute.webp" : "assets/comic/ec_tear.webp");
      /* ★ P293（SR-022 收口）：非 comic 分支此前裸拼 endArt——统一走 ArtSprite.safeUrl
         成品串守卫（SAFE_URL_RE 放行 assets/**.webp 含 endings/redesign），不合规回默认图
         （fail-closed）；ArtSprite 缺席时保留旧 comic 前缀分支（本地开发形态）。 */
      const endStyle = (window.ArtSprite && window.ArtSprite.safeUrl)
        ? "background-image:url(" + ArtSprite.safeUrl(endArt, "assets/comic/ec_tear.webp") + ")"
        : (/^assets\/comic\//.test(endArt) ? CardHost.artStyle(endArt) : "background-image:url(" + endArt + ")");
      let html = '<div class="ec-card card-spread">' +
        CardHost.headTags("生涯 · 终章") +
        '<div class="ec-art" style="' + endStyle + '"></div>' +
        '<div class="ec-title">' + esc(e.name) + "</div>" +
        '<div class="ec-body">' + esc(d.player.name) + "　·　传奇指数 <b style=\"color:var(--gold)\">" + Math.round(legacy) + "</b><br>" +
        (d.stats.apps || 0) + " 场　·　" + (d.stats.goals || 0) + " 球　·　" + (d.stats.assists || 0) + " 助攻</div>" +
        '<div class="panel hl"><div class="panel-title">结局 · ' + esc(e.name) + "</div>" +
        '<p style="font-size:13px;line-height:1.9">' + esc(e.desc) + "</p></div>" +
        (trophyN ? '<div class="panel"><div class="panel-title">荣誉（' + trophyN + "）</div>" + trophies.map(t => '<div class="list-item"><b>' + esc(t.name) + "</b><span class='dim12'>" + (t.season || "") + "</span></div>").join("") + "</div>" : "") +
        /* ★★ P128c 退役清算（R2 拍板）：产业清算纳入结算卡 + 评价结语（规模三档，运行时填数）。 */
        (ret && ret.bizLegacy && ret.bizLegacy.count > 0 ? (function () {
          const bl = ret.bizLegacy;
          const epitaph = bl.count >= 10
            ? "你的商业版图比奖杯柜还满——退役那天，当地报纸称你为「最会踢球的企业家」。"
            : bl.count >= 4
              ? "球员之外，你也是个生意人——产业的名声和你的球鞋一样响。"
              : "几间小店经营得有模有样——球员之外，你也开始有了自己的营生。";
          return '<div class="panel"><div class="panel-title">名下产业（退役清算）</div>' +
            '<div class="row"><span>产业</span><b>' + bl.count + " 座</b></div><div class='divider'></div>" +
            '<div class="row"><span>累计投入</span><b>' + Career.fmtMoney(bl.invested) + "</b></div><div class='divider'></div>" +
            '<div class="row"><span>清算回收（五折）</span><b style="color:var(--gold)">' + Career.fmtMoney(bl.liquid) + "</b></div>" +
            /* ★ P202：清算只是叙事估价，产业本体经快照继承到下一次生涯——此前只写"清算"让玩家误以为产业没了 */
            (metaInfo && metaInfo.legacy && metaInfo.legacy.biz && metaInfo.legacy.biz.length
              ? '<div class="dim12" style="margin-top:6px">其中 <b style="color:var(--gold)">' + metaInfo.legacy.biz.length + " 座</b>不参与清算，将继承到下一次生涯（起步月分红 ×0.5，签约职业合同后交割）。</div>"
              : "") +
            '<div class="dim12" style="margin-top:6px">' + esc(epitaph) + "</div></div>";
        })() : "") +
        /* ★★ P97 M4-4.5：把"这一段人生留下了什么"讲清楚 —— 跨档成长是 P97 的长期轴，
           玩家得在这里看见它，否则"多周目"就只是一个看不见的数字。 */
        (metaInfo ? '<div class="panel hl"><div class="panel-title">跨周目累积</div>' +
          '<div class="row"><span>本周目生涯积分</span><b class="c-gold">+' + metaInfo.add + "</b></div>" +
          '<div class="row"><span>累计积分</span><b class="c-gold">' + metaInfo.total +
          '<span style="opacity:.55;font-size:11px"> · 第 ' + metaInfo.cycle + " 周目开启</span></b></div>" +
          /* ★ P129a 传承预览（T7 爽感钩子①：距上限差多少 → 重玩闭环）。
             数字全部来自 metaInfo.legacy 运行时计算，不写死。 */
          (metaInfo.legacy ? '<div class="row"><span>继承到下一段生涯</span><b class="c-gold">能力点 +' + metaInfo.legacy.attr +
            " · 技能点 +" + metaInfo.legacy.sp +
            /* ★ P202：继承产业座数随行展示（此前产业继承只在建档横幅出现，结算卡看不见=继承价值不可感） */
            (metaInfo.legacy.biz && metaInfo.legacy.biz.length ? " · 继承产业 " + metaInfo.legacy.biz.length + " 座" : "") + "</b></div>" +
            '<div class="dim12" style="margin-top:6px">（本次生涯上限：能力点 ' + metaInfo.legacy.capAttr + " / 技能点 " + metaInfo.legacy.capSp +
            "——把这段生涯踢得更好，下一段起跑线更高）</div>" : "") +
          '<div class="dim12" style="margin-top:6px">下一周目开局即解锁潜力 <b class="c-gold">+' + metaUnlock +
          "</b>　——　你打过的每一段生涯，都会留在下一段里。</div></div>" : "");
      html += '<button class="btn btn-gold btn-block" id="ret-share">分享到热点资讯 · 晒出生涯终章</button>';
      html += '<button class="btn btn-primary btn-block mt-10" id="ret-hall">' + (window.LegacyHall && LegacyHall.lastSave && LegacyHall.lastSave() ? "调整陈列室席位" : "收入传奇陈列室") + '</button>';
      html += '<button class="btn btn-primary btn-block mt-10" id="ret-ok">回到主界面 ▸</button></div>';
      CardHost.show(html, { dismissable: false });
      /* S4：退役静默上报云排行榜（失败不打扰退役结算） */
      try { if (window.LFB && LFB.syncCareer) LFB.syncCareer(d); } catch (eSync) { /* 静默 */ }
      UIkit.$("#ret-share").onclick = UIkit.guard(function () {
        try {
          /* SharePoster 自带降级：非热点资讯容器 → 展示海报长按保存 + 可选中文案
             （不调用剪贴板 API，符合 SR-006 审计口径） */
          if (window.SharePoster && SharePoster.share) SharePoster.share(State, ret || { ending: e, legacy: legacy, stats: d.stats });
          else UIkit.toast("分享暂不可用", "red");
        } catch (err) { console.warn("share", err); UIkit.toast("分享功能异常：" + err.message, "red"); }
      }, "分享生涯终章");
      /* S4：收入传奇陈列室（十席之墙；空位存入 / 覆盖已有席位） */
      UIkit.$("#ret-hall").onclick = UIkit.guard(function () {
        try {
          if (!(window.LegacyHall && LegacyHall.buildEntry)) { UIkit.toast("陈列室暂不可用", "red"); return; }
          const entry = LegacyHall.buildEntry(State, ret || { ending: e, legacy: legacy, stats: d.stats });
          if (!entry) { UIkit.toast("收藏数据构建失败", "red"); return; }
          LegacyHall.showSlotPicker(entry, function (slot) {
            const btn = UIkit.$("#ret-hall");
            if (btn) {
              const tip = document.createElement("div");
              tip.className = "panel";
              tip.style.cssText = "text-align:center;margin-top:10px;color:var(--gold);font-weight:800;font-size:13px";
              tip.textContent = "已收入传奇陈列室 · 第 " + slot + " 席";
              btn.parentNode.replaceChild(tip, btn);
            }
          });
        } catch (err) { console.warn("hall", err); UIkit.toast("陈列室功能异常：" + err.message, "red"); }
      }, "收入传奇陈列室");
      UIkit.$("#ret-ok").onclick = UIkit.guard(() => { CardHost.close(); State.save(); Menu.render(); }, "退役返回");
    },
  };
  window.Flow = Flow;

  /* ── 主菜单 ── */
  /* 菜单图标（stroke 风格 24×24 currentColor，自绘不依赖 icons.js 名单） */
  const MI = {
    ball:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8.4l3.4 2.5-1.3 4H9.9l-1.3-4z" fill="currentColor" stroke="none"/><path d="M12 3v5.4M20.3 9.6l-4.9 1.3M17.6 18.3l-3.7-3.4M6.4 18.3l3.7-3.4M3.7 9.6l4.9 1.3"/></svg>',
    play:   '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.2v13.6c0 .8.9 1.3 1.6.9l10.6-6.8c.6-.4.6-1.4 0-1.8L9.6 4.3c-.7-.4-1.6.1-1.6.9z"/></svg>',
    plus:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="8.6"/><path d="M12 8.4v7.2M8.4 12h7.2"/></svg>',
    book:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15.5H6.5A2.5 2.5 0 0 0 4 21z"/><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20"/></svg>',
    cup:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4h8v5.2a4 4 0 0 1-8 0z"/><path d="M8 5.2H4.4a3.6 3.6 0 0 0 3.8 3.6M16 5.2h3.6a3.6 3.6 0 0 1-3.8 3.6"/><path d="M12 13.2v3M9 20.2h6M10 16.2h4l.7 4H9.3z"/></svg>',
    star:   '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.8l2.8 5.8 6.4.9-4.6 4.4 1.1 6.3-5.7-3-5.7 3 1.1-6.3L2.8 9.5l6.4-.9z"/></svg>',
    gear:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3.1"/><path d="M12 2.8v2.7M12 18.5v2.7M2.8 12h2.7M18.5 12h2.7M5.4 5.4l1.9 1.9M16.7 16.7l1.9 1.9M18.6 5.4l-1.9 1.9M7.3 16.7l-1.9 1.9"/></svg>',
  };
  const Menu = {
    render() {
      UIkit.show("menu");
      const btns = UIkit.$("#menu-buttons");
      btns.innerHTML = "";
      let mi = 0;
      const mk = (title, sub, primary, fn, icon) => {
        const b = document.createElement("button");
        b.className = "menu-btn" + (primary ? " primary" : "");
        b.style.animationDelay = (mi++ * 55) + "ms";
        b.innerHTML = '<span class="mb-ico">' + (MI[icon] || MI.ball) + "</span>"
          + '<span class="mtw"><span class="mt">' + title + '</span><span class="md">' + sub + "</span></span>"
          + '<span class="mb-arrow">›</span>';
        /* P133 埋点 BMC001：主菜单各按钮点击（title 作 label；先上报再执行） */
        b.onclick = UIkit.guard(function () {
          if (window.Track) Track.click("BMC001", "T" + mi, title);
          return fn.apply(this, arguments);
        }, title);
        btns.appendChild(b);
        return b;
      };
      const save = State.peek ? State.peek(0) : null;
      /* ★ P301 [Tap]：新档入口共用闸——云端存档校验未完成/失败时的防覆盖 UI。
         仅 TapTap 容器生效（TapCloudStore 不可用的热点资讯/网页零变化）。 */
      const tapNewCareerGate = (then) => {
        try {
          if (window.TapCloudStore && TapCloudStore.available && TapCloudStore.available()) {
            if (State._tapPullSettled === false) {
              UIkit.toast("正在校验云端存档，请稍候几秒…", "gold");
              return;
            }
            if (State._tapPullUnknown === true) {
              UIkit.confirm({
                title: "云端存档校验失败",
                body: "本次启动未能确认云端是否已有存档。若您之前玩过此游戏并有存档，开新档可能导致旧存档无法找回。仍要开新档吗？",
                okText: "仍要开新档", cancelText: "取消", danger: true,
              }).then(yes => { if (yes) then(); });
              return;
            }
          }
        } catch (e) { /* 判定异常不挡正常路径 */ }
        then();
      };
      if (!save) {
        mk("开始游戏", "从野球场开始，书写你的传奇", true, () => { tapNewCareerGate(() => { State.slot = 0; Create.open(); }); }, "ball");
      } else {
        mk("重返游戏", "继续未完的征途", true, () => { Menu.loadSaveWithProgress(); }, "play");
        mk("新开一局", "放弃当前存档，从头再来", "", () => {
          /* ★ P153 存档方案：新游戏不读取存档；但已有存档时必须确认覆盖。
             覆盖生效于新档首次 save()（本地槽 0 + 云端一并被新档取代），无法恢复。
             ★ P301 [Tap]：先过云端校验闸，再走覆盖确认。 */
          tapNewCareerGate(() => {
          UIkit.confirm({
            title: "开始新游戏？",
            body: "当前游戏有存档，开新档将覆盖它（本地与云端），且无法恢复。",
            okText: "覆盖并开始",
            cancelText: "取消",
            danger: true,
          }).then(yes => {
            if (!yes) return;
            State.slot = 0;
            Create.open();
          });
          });   /* ★ P301 [Tap] tapNewCareerGate 闭合 */
        }, "plus");
      }
      /* ★ P251（用户指令）：「游戏说明」从主菜单移入设置面板（下属按钮）——
         主菜单只留核心动作；说明内容抽为 Menu.showHelp() 供设置面板复用。 */
      mk("传奇排行榜", "全服玩家生涯成就殿堂", "", () => {
        try {
          if (window.LFB && LFB.show) LFB.show(() => Menu.render());
          else if (window.LBLocal) LBLocal.show(State, () => Menu.render());
          else UIkit.toast("排行榜暂不可用", "red");
        } catch (err) { UIkit.toast("排行榜暂不可用", "red"); }
      }, "cup");
      mk("生涯陈列室", "十席之墙 · 收藏你的每一段传奇", "", () => {
        try {
          if (window.LegacyHall && LegacyHall.show) LegacyHall.show(() => Menu.render());
          else UIkit.toast("陈列室暂不可用", "red");
        } catch (err) { UIkit.toast("陈列室暂不可用", "red"); }
      }, "star");
      mk("设置", "音量 · 存档 · 游戏说明", "", () => Hub.settingsPanel(), "gear");
      UIkit.show("menu");
    },

    /** ★ P251：玩法说明（原主菜单「游戏说明」迁入）——主菜单与设置面板共用入口 */
    showHelp() {
      UIkit.modal("<h3>玩法说明</h3><div style='font-size:13px;line-height:2'>" +
        "<p><b>训练</b>：非比赛日自动训练，属性随比赛与事件成长。</p>" +
        "<p><b>比赛</b>：「继续」一键驱动——普通场自动完赛，关键战（首秀/德比/杯赛淘汰赛/国家队）全场直播。</p>" +
        "<p><b>生活</b>：商业代言、置业升级，经营场外人生。</p>" +
        "<p><b>荣誉</b>：联赛冠军、金靴、世界杯，最终书写传奇退役。</p></div>" +
        '<button class="btn btn-primary mt-12" id="gd-ok">知道了</button>');
      UIkit.$("#gd-ok").onclick = UIkit.guard(() => UIkit.closeModal(), "关闭说明");
    },

    /** ★ P154 载入存档进度条（对齐篮球线体验）：复用启动加载屏（screen-loading 的
     *  boot-bar/boot-tip），进度分步推进掩护「读档 → 迁移 → 建界面」同步链，
     *  100% 时执行真正的读档（与旧「重返游戏」行为逐字节等价，只多了进度掩护）。
     *  读档失败/损坏：toast + 回主菜单（loading 屏由 Menu.render 切走）。 */
    loadSaveWithProgress() {
      const fill = document.querySelector("#boot-fill");
      const tip = document.querySelector("#boot-tip");
      UIkit.show("loading");
      if (fill) fill.style.width = "0%";
      const tips = ["正在读取存档…", "正在恢复生涯数据…", "正在铺开绿茵世界…", "马上回来…"];
      let pct = 0, ti = 0;
      const iv = setInterval(() => {
        pct = Math.min(100, pct + 14 + Math.random() * 18);
        if (fill) fill.style.width = pct + "%";
        if (tip) tip.textContent = tips[Math.min(ti++, tips.length - 1)];
        if (pct < 100) return;
        clearInterval(iv);
        try {
          /* ★ P154b 丢档防线⑥：主槽读不出（损坏/半档/脏数据）→ 先试双备份键 BAK
             （上一次成功 save 的快照）救档，救回再进。
             ★ P241 双重复核兜底：本地两副本都无效 → 拉云德复核恢复（换设备/清缓存/
             本地全损场景）；云也没有才报错回主菜单。pullCloud 内部对恢复结果
             双写主槽+BAK，且此时未进会话（State.data 为空），防线④不拦截。
             ★★ P274 丢档防线⑦：以上全走 State.recoverFromIdb 前置——主档+BAK
             双失效时先异步查 IndexedDB 镜像回灌（本地健康=快路径直通，行为与
             旧版逐位一致；无 IDB 能力同样直通）。 */
          const restoreChain = () => {
            let ok = State.load(0);
            if (!(ok && ok.player)) ok = State.restoreFromBackup ? State.restoreFromBackup() : null;
            const needCloud = !(ok && ok.player);
            if (needCloud && State.pullCloud) {
              const tip = document.querySelector("#boot-tip");
              if (tip) tip.textContent = "正在从云端恢复存档…";
              State.pullCloud().then(r => {
                if (r === "cloud-restored") {
                  const back = State.load(0);
                  if (back && back.player) {
                    State.isNew = false;
                    try { UIkit.toast("已从云端恢复存档", "gold"); } catch (e) { /* ignore */ }
                    /* ★ P280 iOS 丢档诊断埋点：云恢复成功=本机存储丢失/易失的直接证据 */
                    try { if (window.Track && Track.click) Track.click("BMC027", "SAVE", "boot_cloud_restored"); } catch (e) { /* ignore */ }
                    if (back.retired) { Flow.retire(true); } else { Hub.enter(); }
                    return;
                  }
                }
                /* 防线④拦截（本会话早先进过生涯、内存档仍在）→ 直接回会话，不报错 */
                if (r === "session-active" && State.data && State.data.player && State.isNew === false) {
                  Hub.enter();
                  return;
                }
                UIkit.toast("存档无法读取", "red");
                Menu.render();
              }).catch(() => {
                UIkit.toast("存档无法读取", "red");
                Menu.render();
              });
              return;
            }
            if (ok && ok.player) {
              State.isNew = false;
              /* ★ P280 iOS 丢档诊断埋点：本地恢复成功时上报档龄（玩家报「退出丢档」时，
                 后台看 boot_local_ok 的 saved_age 分布即可分辨「真丢档」与「云恢复」）。 */
              try { if (window.Track && Track.click) Track.click("BMC027", "SAVE", "boot_local_ok:age_h=" + Math.round((Date.now() - ((ok.meta && ok.meta.saved) || 0)) / 3600000)); } catch (e) { /* ignore */ }
              if (ok.retired) { Flow.retire(true); }
              else Hub.enter();
            } else {
              /* ★ P280：本地+云全链恢复失败（真丢档现场）——埋点留证
                 ★★ P286b（登录玩家 iOS+跨设备「单纯丢档」）：升级为**通道级细节**埋点——
                 主槽/BAK/旧槽的原始串长与 dataset、IDB 内存旁路有无、云返回值，
                 一次上报定位「本地被清 vs 云没档 vs 云拉失败 vs 档坏被弃」。 */
              (function () {
                let det = "";
                try {
                  const ks = ["mfl_web_save_v2_s0", "mfl_web_save_v2_bak", "mfl_web_save_v2_s1", "mfl_web_save_v2_s2"];
                  const tags = ["m", "b", "s1", "s2"];
                  for (let i = 0; i < ks.length; i++) {
                    let raw = null, ds = "";
                    try { raw = localStorage.getItem(ks[i]); } catch (e) { raw = "ERR"; }
                    if (raw && raw !== "ERR") { try { const pp = JSON.parse(raw); ds = (pp.meta && pp.meta.dataset) || "?"; } catch (e2) { ds = "bad"; } }
                    det += tags[i] + "=" + (raw == null ? "0" : raw === "ERR" ? "err" : raw.length + (ds ? ":" + ds : "")) + "/";
                  }
                  det += "idb=" + (State._idbBootRaw ? 1 : 0);
                } catch (e) { det = "probe-err"; }
                try { if (window.Track && Track.click) Track.click("BMC030", "SAVE", "boot_all_fail:" + det); } catch (e) { /* ignore */ }
              })();
              try { if (window.Track && Track.click) Track.click("BMC027", "SAVE", "boot_all_fail"); } catch (e) { /* ignore */ }
              UIkit.toast("存档无法读取", "red");
              Menu.render();
            }
          };
          if (State.recoverFromIdb) {
            State.recoverFromIdb().then(() => restoreChain()).catch(() => restoreChain());
          } else restoreChain();
        } catch (err) {
          console.error("[V2:loadSave]", err);
          UIkit.errToast("载入存档出错：" + err.message + "（已写入控制台）");
          Menu.render();
        }
      }, 110);
    },
  };
  window.Menu = Menu;
})();
