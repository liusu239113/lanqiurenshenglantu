/* ============================================================================
   v2/duel_ui.js — P97-M3B · 三层对弈小游戏的界面
   ---------------------------------------------------------------------------
   三层共用**视觉基底**（用户 D10：引擎各自独立实现，规格同一份）：
     ① 公开档案条  对手可公开的信息（弱侧 / 反应评级 / 风格）—— 全是真的
     ② 提示条      ★ 概率语言，禁断言（"八成压在这儿" 而不是 "他会防边路"）
     ③ 选项区      L1/L2 = 四张卡；L3 = 3 列 × 2 行的球门
     ④ 「变招」    再要一档情报，代价是这一下的执行质量 ×0.92（每局一次）
     ⑤ 结算       分档文案（含克制 / 惯用侧 / 强破 / 脱手 的独立叙述）

   ★ 本文件**只负责呈现与收集选择**，一切概率都由 Duel（引擎）算 ——
     界面绝不自己算概率，否则又会掉进"文档一套、代码一套"的双源坑。
   ============================================================================ */
(function () {
  'use strict';
  const esc = function (s) { return UIkit.esc(s); };
  const T = function () { return window.DUEL_TABLES || {}; };
  const D = function () { return window.Duel; };
  const ico = function (k, s) { return (typeof window.ICO === "function") ? ICO(k, s) : ""; };

  /* ══════════════ 文案池 ══════════════ */
  const L1_STRIKER = {
    left:   { win: "你往左一趟就抹了过去——他的重心还在右边。", lose: "你往左走，他早半步卡在了那条线上。" },
    right:  { win: "右侧那条通道被你撕开了，他没跟上。",       lose: "他偏偏就在那一侧等着你。" },
    nutmeg: { win: "球从他两腿之间钻过去——看台先愣了一秒才炸开。", lose: "你想穿裆，他把腿收得干干净净。" },
    chip:   { win: "球轻轻挑过他头顶，你从旁边绕过去接住。",   lose: "挑高了半寸，他回头把球顶走。" },
  };
  const L1_MID = {
    through: { win: "一脚直塞从两名中卫之间漏了过去，队友心领神会插上了。", lose: "直塞路线上早就有人等着。" },
    overTop: { win: "过顶球刚好落在防线身后，队友卸下来就是单刀。",           lose: "球吊得深了，门将出来把它抱走了。" },
    switch:  { win: "一脚大范围转移，弱侧的队友完全拿住了空当。",             lose: "横传慢了半拍，被中场截下了。" },
    wall:    { win: "撞墙配合打穿了一小片空间，接球的队友直面防线。",         lose: "墙没做成，球被顶了回来。" },
  };
  const L1_GK = {
    long:  { win: "一脚开到前场，第一点被自己人拿住了。", lose: "开球被顶回来，反倒给了对手一次快攻。" },
    short: { win: "短传稳稳出球，从后场开始推。",         lose: "短传被压上来的人抢断。" },
    wing:  { win: "球找到边路，边锋拿球就往前冲。",       lose: "起球落点不好，被中卫顶出。" },
    throw: { win: "手抛球发动快攻，对手还没回位。",       lose: "手抛球被他读到了落点。" },
  };
  const L2_RES = {
    press: { win: "你上抢的时机拿捏得刚好，球被你捅走了。", lose: "你一上抢，他一步就把你趟过去了。" },
    body:  { win: "你贴身挤住他，他连转身都做不到。",       lose: "你贴上去，他用身体把你架开。" },
    slide: { win: "一记干净的铲球把球留下来——慢镜头都挑不出毛病。", lose: "你下脚早了半拍，扑了个空。" },
    drop:  { win: "你退着封住线路，他把球带进了死胡同。",   lose: "你退得太深，他从容起脚。" },
    rush:  { win: "你果断冲出去，把球抢在对方前锋之前。",   lose: "你出了门却晚了一步，他把球挑过你。" },
    wall:  { win: "你封住近角，他把球打在了你身上。",       lose: "他打远角，你封的这一侧空了。" },
    claim: { win: "高球你双拳击出，禁区里一片混乱但球权是你的。", lose: "你被干扰了，没能把球摘干净。" },
    stay:  { win: "你守住门线不动，他的射门正撞在你怀里。", lose: "你没出来，他从容推了个远角。" },
  };
  const L3_CELL = {
    LT: { goal: "球擦着横梁下沿钻进去——死角。",   saved: "他横身飞出去，指尖把球托出横梁。", off: "打高了，球飞上看台。" },
    CT: { goal: "球从他手边钻进网窝。",             saved: "他几乎没动，正面把球挡了出来。",   off: "顶在横梁上——哐的一声。" },
    RT: { goal: "球贴着立柱内侧弹进网内。",         saved: "他反手一拍，把球拨了出去。",       off: "打飞了，球越过了看台第一排。" },
    LB: { goal: "球贴着草皮钻进远角。",             saved: "他倒地把球按在身下。",             off: "角度太刁，球擦着立柱出了底线。" },
    CB: { goal: "一脚低平球从他两腿之间滚进网内。", saved: "他蹲下把球抱住了。",               off: "软绵绵的，被他一抱就住。" },
    RB: { goal: "球从近角钻了进去，他慢了半拍。",   saved: "他下地很快，把球挡出底线。",       off: "太想打死角，球偏出了边线。" },
  };
  const COL_CN = ["左边", "中间", "右边"];
  const ROW_CN = ["上排", "下排"];

  let ctx = null;   // 当前对局上下文

  /* ══════════════ 小工具 ══════════════ */
  function maxIdx(arr) { let m = 0; for (let i = 1; i < arr.length; i++) if (arr[i] > arr[m]) m = i; return m; }
  function grid() { return (T().L3 || {}).GRID || []; }
  /** ★ 3C：六宫格系（射门 L3 / 扑救 L3GK）共用同一套渲染与提示 ——
   *  两者只是"谁在选"反过来，界面结构一模一样（规格同源）。 */
  function isGrid(st) { return !!st && (st.kind === "L3" || st.kind === "L3GK"); }
  function poolOf(id) {
    return L1_STRIKER[id] || L1_MID[id] || L1_GK[id] || L2_RES[id] || L3_CELL[id] || L1_STRIKER.left;
  }
  function ratingWord(v, lo, hi) { return v <= lo ? "偏慢" : (v >= hi ? "极快" : "一般"); }
  /** ★ P109：各层"选项成功率"（引擎同源表，UI 只渲染不自算）
   *  口径 = 玩家后验期望（与自动决策同式，但用 post 不用上帝视角 T）：
   *  L1/L2 → 4 选项胜率；L3 射门 → 六格期望进球率；L3GK → 六格期望救出率。 */
  function ratesOf(st) {
    const Dg = D(); if (!Dg) return null;
    try {
      if (st.kind === "L1") return Dg.l1WinTable ? Dg.l1WinTable(st) : null;
      if (st.kind === "L2") return Dg.l2BreakTable ? Dg.l2BreakTable(st) : null;
      if (st.kind === "L3GK") return Dg.gkSaveTable ? Dg.gkSaveTable(st) : null;
      if (isGrid(st)) {
        /* ★ P175（用户红线「概率不要虚标」）：六格显示切真实口径表 ——
           点球大战走 penaltyTable（0.74 基准单段模型，旧 evalCell 显示虚低 31pp）；
           运动战射门走 shotTable（T 分布 + 打正率乘玩家格，旧 evalCell 偏低 4~6pp）。
           旧 evalCell 保留给 auto 决策（不偷看信念口径，零漂移）。 */
        if (st.penalty && Dg.penaltyTable) return Dg.penaltyTable(st);
        if (Dg.shotTable) return Dg.shotTable(st);
        const G = grid();
        return G.map(function (c, i) { return Dg.evalCell(i, st.post, st.R, st.spill, st.sbAvg, st.aimBase); });
      }
    } catch (e) { return null; }
    return null;
  }
  function pctTxt(v) { return Math.max(1, Math.min(99, Math.round(v * 100))) + "%"; }
  /** ★ 3C：守门侧用到的三个小工具（纯展示，不算概率） */
  function av(o, id) { const v = o && o[id]; return (typeof v === "number" && !isNaN(v)) ? v : 50; }
  function footWord(v) { return v >= 78 ? "很硬" : v <= 62 ? "偏软" : "一般"; }
  function readWord(k) { return k >= 0.38 ? "会盯着你的老习惯" : k <= 0.16 ? "基本凭本能" : "偶尔会瞄一眼"; }
  function shooterHabitCn(st) {
    const T2 = st.T || [], G = grid();
    if (!G.length || T2.length < G.length) return "看不出偏好";
    return "偏爱 " + G[maxIdx(T2)].cn;
  }

  /* ══════════════ 技能可见化（P102 · 用户反馈「0★ 技能比赛中却能用」）══════════════
     ★ 结论先行：对弈里的突破/远射/头球/穿裆是**基础技术**，人人可做、0★ 不设门 ——
       技能星级是对这些动作的**成功率加成**（duel_tables.SKILL_GAIN，13 项钩子）。
       此前加成完全隐形 → 玩家以为"没学就能用 = 技能没用/穿帮"。
     ★ 本行把**已学且在本层真实生效**的技能亮出来（星标），让加成可见：
       · 只列 ≥1★ 的（0★ 不占视野）
       · 只列与当前层/当前机会类型真实挂钩的（口径 = duel_tables.SKILL_GAIN + duel.js 钩子）
       · 大场面只在关键战生效、领袖之心只在佩戴袖标时生效 —— 条件不满足就不亮（不骗人） */
  function stageOnUi(st) {
    const f = st && st.d && st.d._matchFlags;
    return !!f && !!(f.cup || f.key || (f.pressure || 0) > 0);
  }
  function isCaptainUi(st) { return !!(st && st.d && st.d.intl && st.d.intl.captain); }
  function skStars(id) {
    try { return (window.Skills && window.State) ? (window.Skills.stars(window.State.data, id) || 0) : 0; } catch (e) { return 0; }
  }
  function skName(id) {
    const L = (window.CONFIG && CONFIG.SKILL_LIBRARY && CONFIG.SKILL_LIBRARY.SKILLS) || [];
    const s = L.find(x => x.id === id);
    return s ? s.name : id;
  }
  /** 本层真实生效、且玩家已学（≥1★）的技能 id 列表
   *  ★ P168：special 条目（旧关键时刻卡转小游戏）—— 影帝(actor) 原第 4 选项已转为
   *    本层加成（外场抬 skillWin / 门将压对方强破率），学了的玩家照常亮标。 */
  function activeSkillIds(st) {
    const own = id => skStars(id) > 0;
    const ids = [];
    if (ctx && ctx.special && own("actor")) ids.push("actor");
    if (st.kind === "L1" || st.kind === "L1GK") {
      if (own("skillMoves")) ids.push("skillMoves");
      const hasCenter = (st.options || []).some(o => o.tag === "center");
      if (own("throughPass") && hasCenter) ids.push("throughPass");
      const hasSide = (st.options || []).some(o => !!o.side);
      if (own("weakFoot") && hasSide) ids.push("weakFoot");
    } else if (st.kind === "L2") {
      if (own("gameReading")) ids.push("gameReading");
    } else if (st.kind === "L3") {
      if (own("gameReading")) ids.push("gameReading");
      if (own("penaltyNerve")) ids.push("penaltyNerve");
      if (own("weakFoot")) ids.push("weakFoot");
      if (own("penaltyKick")) ids.push("penaltyKick");
      const tid = st.type && st.type.id;
      if (tid === "header" && own("header")) ids.push("header");
      if (tid === "long" && own("outsideBoot")) ids.push("outsideBoot");
      if (tid === "long" && own("freeKick")) ids.push("freeKick");
    } else if (st.kind === "L3GK") {
      if (own("gameReading")) ids.push("gameReading");
    }
    if (stageOnUi(st) && own("bigStage") && (st.kind === "L1" || st.kind === "L2" || st.kind === "L3" || st.kind === "L1GK")) ids.push("bigStage");
    if (isCaptainUi(st) && own("leadersHeart") && st.kind !== "L3GK") ids.push("leadersHeart");
    return ids;
  }
  function skillChipsHtml(st) {
    const ids = activeSkillIds(st);
    if (!ids.length) return "";
    const stars = id => { const n = skStars(id); let s = ""; for (let i = 0; i < n; i++) s += "★"; return s; };
    return '<div class="duel-skills">' + ids.map(id =>
      '<span class="duel-chip" style="border-color:var(--gold)">' + esc(skName(id)) + " <span style='color:var(--gold)'>" + stars(id) + "</span></span>"
    ).join("") + "</div>";
  }

  /* ══════════════ 公开档案（全真信息，人人可见）══════════════ */
  function profileChips(st) {
    const chips = [];
    if (st.kind === "L3GK") {
      // ★ 3C：守门侧 —— 公开的是**射手**的档案（我在读他，而不是他读我）
      chips.push("射手习惯：<b>" + esc(shooterHabitCn(st)) + "</b>");
      chips.push("他的脚头：<b>" + footWord(av(st.shooter, "strength")) + "</b>");
      chips.push("他会不会读你：<b>" + readWord(st.K) + "</b>");
    } else if (isGrid(st)) {
      const k = st.K, r = st.R;
      const style = (k >= 0.38 && r < 0.30) ? "预判型" : (r >= 0.34 && k < 0.34) ? "反应型" : "均衡型";
      chips.push("门将风格：<b>" + style + "</b>");
      chips.push("反应评级：<b>" + ratingWord(r, 0.14, 0.40) + "</b>");
    } else if (st.kind === "L1") {
      const ws = st.weakSide;
      chips.push("他的弱侧：<b>" + (ws === "left" ? "偏左" : ws === "right" ? "偏右" : "看不出明显偏好") + "</b>");
      chips.push("回追速度：<b>" + ratingWord(st.R, 0.14, 0.42) + "</b>");
      chips.push("这场的防守重心：<b>" + esc(st.defOptions[maxIdx(st.T)].cn) + "</b>");
    } else {
      chips.push("他的护球习惯：<b>" + esc(st.atkOptions[maxIdx(st.T)].cn) + "</b>");
      chips.push("他的动作节奏：<b>" + ratingWord(st.R, 0.14, 0.42) + "</b>");
    }
    return chips.map(function (c) { return '<span class="duel-chip">' + c + "</span>"; }).join("");
  }

  /* ══════════════ 提示条（★ 概率语言，绝不断言）══════════════ */
  function hintOf(st) {
    const HT = T().HINT_TEXT || {};
    const lvl = st.lvl;
    const LAY = (HT.LAYER || {})[st.layer] || { obj: "他", on: "偏" };
    if (lvl === undefined || lvl === null || lvl <= 0) {
      return { text: esc((HT.BLIND || {})[st.layer] || "看不出名堂。"), none: true, cells: [] };
    }
    const CERT = HT.CERT || ["", "", "", "", ""];
    /* ★ P175：cert 按 lvl 直取（原 lvl+1 是错位——lvl3 的「八成」实测落格只有 ~40%）；
       词表已在 HINT_TEXT.CERT 按蒙特卡洛实测重标定（六成/最可能/七成）。
       LAYER[layer].cert 可分层覆盖（L3/L3GK 的行提示落格 ~74-87%，与 L1 的 ~56-64% 不同带）。 */
    const cert = ((LAY.cert || CERT)[Math.min((LAY.cert || CERT).length - 1, lvl)]) || "";
    const opener = esc((HT.OPENER || {})[lvl] || "");
    if (isGrid(st)) {
      // ★ 3C/3D：候选格与后验同口径（HINT_MODE="true" 时指向本局真实意图格）
      const H6 = D().hintCells6Mode || D().hintCells6;
      const hc = H6(lvl, st.T, st.aiIntentIdx), G = grid();
      let body;
      if (hc.kind === "one") body = LAY.obj + cert + LAY.on + "「" + esc(G[hc.cells[0]].cn) + "」";
      else if (hc.kind === "col") body = LAY.obj + cert + LAY.on + "「" + COL_CN[hc.col] + "」这一列";
      else if (hc.kind === "row") body = LAY.obj + cert + LAY.on + "「" + ROW_CN[hc.row] + "」这一档";
      else body = LAY.obj + "这时候" + LAY.on + "「" + COL_CN[hc.col] + "」的时候少——那一列他顾得不多";
      return { text: opener + esc(body) + "。", none: false, cells: hc.cells };
    }
    const hc = D().hintCells4(lvl, st.T), opts = st.options;
    let body;
    if (hc.kind === "one") body = LAY.obj + cert + LAY.on + "「" + esc(opts[hc.cells[0]].cn) + "」";
    else if (hc.kind === "two") body = LAY.obj + cert + LAY.on + "「" + esc(opts[hc.cells[0]].cn) + "」或「" + esc(opts[hc.cells[1]].cn) + "」";
    else body = LAY.obj + "这时候不至于" + LAY.on + "「" + esc(opts[hc.excluded].cn) + "」";
    return { text: opener + esc(body) + "。", none: false, cells: hc.cells };
  }

  /* ══════════════ 广告直成（P151 · 用户拍板「所有小游戏都加一个广告」）══════════════
     每张对弈卡面（L1 创造 / L2 破坏 / L3 射门·单刀 / L3GK 扑救）都带一个广告选项：
     看完激励视频 → 引擎以 force 通道直接判成功（进球/防守成功/扑救成功/传球成功）。
     ★ 选格交给你：先点广告拿到「直成」资格，再点任意格子正常结算（force 透传）——
       保留"选哪一格"的参与感；系统不替玩家选格。
     ★ 点球大战（showPenalty 分支）不提供广告直成 —— 点球结果不进时间线，
       每轮都弹卡、直成=大战必胜，过于超模（登记：如需开放再拍板）。
     ★ 埋点：BMC005 ad_entry（placement=duel_force），完播发奖由 ads.js BMC006 记账。 */
  function adBtnText(st) {
    if (st.kind === "L3GK") return "看广告 · 这一球直接扑出";
    if (st.kind === "L2") return "看广告 · 这次防守直接成功";
    if (st.kind === "L3") return "看广告 · 这一脚直接进";
    if (st.layer === "L1GK") return "看广告 · 这次开球直接发动成功";
    return (st.mode === "pass") ? "看广告 · 这次传球直接到位" : "看广告 · 直接过掉他";
  }
  function adBtnHtml() {
    return '<div class="duel-ad"><button class="duel-ad-btn" id="duel-ad">' + esc(adBtnText(ctx.st)) +
      '</button><span class="duel-ad-note">看完广告，接下来你选的那一格必定成功</span></div>';
  }
  /** 广告直成资格：ctx.adReady = true 后，commit 一律带 force（本次对局一次性） */
  function bindAdBtn(root) {
    const el = root.querySelector("#duel-ad");
    if (!el) return;
    el.onclick = UIkit.guard(function () {
      if (ctx.adReady) return;
      if (window.Track) { try { Track.click("BMC005", "T1", "duel_force"); } catch (e) { } }
      el.classList.add("busy");
      Ads.show("duel_force", function () {
        if (!ctx) return;
        ctx.adReady = true;
        try { UIkit.toast({ html: ICO("check"), text: " 直成已就绪——选一格，必定成功" }, "gold"); } catch (e) { }
        const root2 = UIkit.$("#v2-modal-root");
        if (root2) {
          const b2 = root2.querySelector("#duel-ad");
          if (b2) { b2.classList.add("ready"); b2.textContent = "广告奖励已就绪 · 选一格必成"; }
        }
      }, function () {
        /* 失败（拒播/超时/环境不可用）：ads.js 已 toast；按钮复位可重试 */
        const root2 = UIkit.$("#v2-modal-root");
        if (root2) { const b2 = root2.querySelector("#duel-ad"); if (b2) b2.classList.remove("busy"); }
      });
    }, "广告直成");
  }

  /* ══════════════ 渲染 ══════════════ */
  function render() {
    const st = ctx.st, ht = hintOf(st);
    let h = "";
    h += '<div class="duel-head"><span class="duel-title">' + esc(ctx.title) + "</span>" +
         '<span class="duel-min">' + ctx.minute + "'</span></div>";
    h += '<div class="duel-sub">' + esc(ctx.sub || "") + "</div>";
    h += '<div class="duel-profile">' + profileChips(st) + "</div>";
    h += skillChipsHtml(st);
    h += '<div class="duel-hint' + (ht.none ? " none" : "") + '">' +
         (ht.none ? "" : '<span class="lv">线索</span>') + "<span>" + ht.text + "</span></div>";
    // ★ 3C：中场模式切换 —— 只换"用哪套能力去对抗"，不改对手的重心
    if (st.kind === "L1" && st.hasMode) {
      h += '<div class="duel-modes">' +
        '<button class="duel-mode' + (st.mode !== "carry" ? " on" : "") + '" data-mode="pass">传球组织</button>' +
        '<button class="duel-mode' + (st.mode === "carry" ? " on" : "") + '" data-mode="carry">持球推进</button>' +
        "</div>";
    }
    const rates = ratesOf(st);
    if (isGrid(st)) {
      const G = grid();
      h += '<div class="duel-goal"><div class="duel-grid">';
      for (let i = 0; i < G.length; i++) {
        h += '<div class="duel-cell' + ((!ht.none && ht.cells.indexOf(i) >= 0) ? " hinted" : "") +
             '" data-pick="' + i + '"><span class="hintdot"></span><span class="cn">' + esc(G[i].cn) + "</span>" +
             (rates ? '<span class="pct" style="font-size:10.5px;opacity:.72">' + pctTxt(rates[i]) + "</span>" : "") + "</div>";
      }
      h += "</div></div>";
      /* ★ P115（用户问「右上角有点的是什么意思」）：圆点 = 线索指向的格子。
         此前 gold 圆点无任何图例 → 玩家不知道它是「线索命中标记」。
         图例只在有线索时出现，与线索条同一口径（概率语言，绝不断言）。 */
      if (!ht.none) {
        h += '<div class="dim12" style="margin-top:5px;font-size:11.5px">格子右上角的 <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--gold);vertical-align:middle"></span> 圆点 = 上面这条线索指向的位置 —— 是他的<b>习惯倾向</b>，不是他这一下的必然选择。</div>';
      }
    } else {
      h += '<div class="duel-opts">';
      for (let i = 0; i < st.options.length; i++) {
        h += '<div class="duel-opt' + ((!ht.none && ht.cells.indexOf(i) >= 0) ? " on" : "") +
             '" data-pick="' + i + '"><span class="nm">' + esc(st.options[i].cn) + "</span>" +
             (rates ? '<span style="font-size:11px;opacity:.72;margin-top:2px">成功率 ' + pctTxt(rates[i]) + "</span>" : "") + "</div>";
      }
      h += "</div>";
    }
    h += '<div id="duel-result"></div>';
    h += '<div class="duel-note">' + esc(noteOf(st)) + "</div>";
    /* ★ P151：广告直成入口（点球 ctx.penalty 不加 —— 见 bindAdBtn 上方注释） */
    if (!ctx.penalty) h += adBtnHtml();
    return h;
  }
  function noteOf(st) {
    if (st.penalty) return "点球一次出脚定生死，命中率比运动战高得多；门将还会瞄着你的选择补一下。";
    if (st.kind === "L3GK") return "提示说的是他的出手习惯，不是他这一下要打哪——他还会瞄着你常扑的方向改一下。看过提示再改选，出手会打折扣（约 8%）。";
    if (isGrid(st)) return "提示说的是他的习惯与倾向，不是他这一下要做的事——他还会朝你的选择补一下。看过提示再改选，出手会打折扣（约 8%）。";
    if (st.kind === "L1") return (st.mode === "carry"
      ? "他会读你的老习惯——你总用同一招，他会提前站好位置。看过提示再改选，成功率也会打折扣（约 8%）。"
      : "他会读你的老习惯——总用同一种方式，他会提前站好位置。看过提示再改选，成功率也会打折扣（约 8%）。");
    return "他也在读你——你连着用同一招，他会先做出反应。看过提示再改选，成功率也会打折扣（约 8%）。";
  }

  function renderResult(r) {
    const st = ctx.st;
    let cls = "", big = "", body = "";
    if (st.kind === "L3GK") {
      // ★ 3C：守门侧（判断顺序与 L3 相反：saved 是好事）
      const id = grid()[r.pickIdx].id, P = L3_CELL[id] || L3_CELL.CT;
      if (r.off) { cls = "good"; big = "他打飞了"; body = "他这一脚压得太狠，球从门框外侧飞了出去——你几乎没动。"; }
      else if (r.saved) {
        cls = "good"; big = "扑出来了！";
        body = r.strong ? "他打的就是你这一侧，可你顶住了——球被你从门线上挡了出去。"
          : r.spilled ? "球打在你手上弹了出去，第二落点被队友清掉了。" : P.saved;
      } else {
        cls = "bad"; big = "球进了";
        body = r.strong ? "你扑对了方向，可他这一脚力量太大——球硬是从你手边钻了进去。"
          : r.spilled ? "球打在你手里却没吃住，滚过了门线。" : P.goal;
      }
    } else if (isGrid(st)) {
      const id = grid()[r.pickIdx].id, P = L3_CELL[id] || L3_CELL.CT;
      if (r.off) { cls = "bad"; big = "打飞了"; body = P.off; }
      else if (r.saved) { cls = "bad"; big = "被扑出"; body = P.saved; }
      else {
        cls = "good"; big = "进了！";
        body = r.strong ? "他扑对了方向，可你这脚力量太大——球硬是从他手边撞进网窝。"
          : r.spilled ? "他指尖碰到了球，却没吃住，球滚了进去。" : P.goal;
      }
    } else if (st.kind === "L1") {
      const P = poolOf(st.options[r.pickIdx].id);
      if (r.win) {
        /* ★ P109：传球模式的赢面 = 威胁球送出，落点在队友脚下（不再是你自己单刀） */
        if (r.mateFinish) {
          cls = "good"; big = "传穿了！"; body = P.win +
            (r.mateGoal ? " 队友心领神会，一脚终结——助攻到手！"
                        : " 可惜队友这一下没把握住，机会浪费了。");
        } else { cls = "good"; big = "过掉了！"; body = P.win; }
      } else { cls = "bad"; big = "机会没了"; body = P.lose; }
      /* ★★ P113-c（2026-09-17 用户拍板）：克制/惯用侧的**解释性后缀全部删除** ——
         「你选的方式正好克住他这一下。但他还是过了你」是自相矛盾的表述
         （counter 是概率加成，不是必然结果——赢了配"克住"还算自洽，
          输了配"克住"就是穿帮；统一删掉，结算只留主叙述）。
         r.counter / r.weakBonus 仍由引擎产出并驱动概率，只删 UI 叙述，不动数值。 */
    } else {
      const P = poolOf(st.options[r.pickIdx].id);
      if (r.broken) { cls = "good"; big = "球权拿回来了"; body = P.win; } else { cls = "bad"; big = "没能拦住"; body = P.lose; }
    }
    return '<div class="duel-res ' + cls + '"><span class="big">' + big + "</span>" + esc(body) + "</div>";
  }

  /* ══════════════ P168 · 结算动效（美漫风 · 纯 CSS 零图片，file:// 安全）══════════════
     射门（L3）/ 扑救（L3GK）：球飞向目标格 + 门将飞身扑向选定格 + 速度线 + 结果词硬标签；
     传球（L1 pass / 门将开球）：球弧线出脚 + 落点圈；过人（L1 carry/前锋）：冲刺+防守剪影；
     防守（L2）：滑铲断球。坐标全按六宫格/选项实时换算，一次性 CSS 动画播完定格。 */
  function animHtml(r) {
    const st = ctx && ctx.st;
    if (!st) return "";
    const G = grid();
    let inner = "", word = "", wcls = "";
    if (st.kind === "L3" || st.kind === "L3GK") {
      const gkSide = st.kind === "L3GK";               // 我守门（门在左）？射门（门在右）
      const goalIn = gkSide ? !!r.conceded : !!r.goal;
      const off = !!r.off;
      const cellC = (col, row, isLeft) => {
        const x0 = isLeft ? 5 : 62;
        return { x: x0 + 33 * (col + 0.5) / 3, y: row === 0 ? 22 : 50 };
      };
      const isLeftGoal = gkSide;
      const ballCell = G[gkSide ? r.shooterIdx : r.pickIdx] || G[0] || { col: 1, row: 0 };
      const bc = cellC(ballCell.col, ballCell.row, isLeftGoal);
      const bx = isLeftGoal ? 90 : 6;
      let tx = bc.x, ty = bc.y, high = false;
      if (off) { high = true; tx = isLeftGoal ? 24 : 78; }
      else if (!goalIn) { tx = isLeftGoal ? 40 : 60; ty = bc.y + 8; }   // 被扑出 → 球停在门前
      const myCell = G[r.pickIdx] || G[0] || { col: 1, row: 0 };
      const kx = cellC(myCell.col, myCell.row, isLeftGoal).x;
      /* 扑身方向：守左门向左扑是逆时针（-55°），守右门镜像；中路不转 */
      const rot = myCell.col === 0 ? (isLeftGoal ? -55 : 55) : myCell.col === 2 ? (isLeftGoal ? 55 : -55) : 0;
      inner = '<div class="da-goal ' + (isLeftGoal ? "l" : "r") + '"></div>' +
        '<div class="da-lines"><i></i><i></i><i></i></div>' +
        '<div class="da-keeper' + (gkSide ? " mine" : "") + (off ? "" : " dive") + '" style="left:' + (isLeftGoal ? 21.5 : 78.5) + '%;--kx:' + kx + '%;--krot:' + rot + 'deg"></div>' +
        '<div class="da-ball ' + (high ? "flyHigh" : "fly") + '" style="--bx:' + bx + '%;--tx:' + tx + '%;--ty:' + ty + 'px"></div>';
      word = off ? (gkSide ? "他打飞了!" : "打飞了!") : goalIn ? (gkSide ? "球进了…" : "GOAL!!") : (gkSide ? "扑出!" : "被扑出");
      wcls = off ? (gkSide ? "good" : "bad") : goalIn ? (gkSide ? "bad" : "good") : (gkSide ? "good" : "bad");
    } else if (st.kind === "L1") {
      const isGkKick = st.d && st.d.player && st.d.player.position === "GK";
      const passMode = isGkKick || (st.hasMode && st.mode === "pass");
      const ok = !!r.win;
      if (passMode) {
        inner = '<div class="da-lines"><i></i><i></i><i></i></div>' +
          '<div class="da-ball fly" style="--bx:8%;--tx:74%;--ty:26px"></div>' +
          '<div class="da-spot" style="--tx:78%"></div>';
        word = ok ? (r.mateGoal ? "助攻到手!" : "传到位!") : "被拦截";
      } else {
        inner = '<div class="da-lines"><i></i><i></i><i></i></div>' +
          '<div class="da-keeper" style="left:64%"></div>' +
          '<div class="da-ball fly" style="--bx:12%;--tx:' + (ok ? 82 : 50) + '%;--ty:58px"></div>';
        word = ok ? "过掉了!" : "被卡住";
      }
      wcls = ok ? "good" : "bad";
    } else {
      const ok = !!r.broken;
      inner = '<div class="da-lines"><i></i><i></i><i></i></div>' +
        '<div class="da-slidertwo' + (ok ? " go" : "") + '" style="--sx:' + (ok ? 66 : 46) + '%"></div>' +
        '<div class="da-ball fly" style="--bx:58%;--tx:' + (ok ? 14 : 88) + '%;--ty:' + (ok ? 40 : 54) + 'px"></div>';
      word = ok ? "断下!" : "被过掉";
      wcls = ok ? "good" : "bad";
    }
    return '<div class="duel-anim ' + wcls + '">' + inner + '<span class="da-word ' + wcls + '">' + word + "</span></div>";
  }

  function resultFeed(r) {
    const st = ctx.st;
    if (st.kind === "L3GK") {
      const id = grid()[r.pickIdx].id, P = L3_CELL[id] || L3_CELL.CT;
      if (r.off) return { text: "他这一脚打飞了——门框外侧，你几乎没动。", cls: "good" };
      if (r.saved) return { text: r.strong ? "他打的就是你这一侧，你把球挡了出去。" : P.saved, cls: "good" };
      return { text: r.strong ? "他力量太大，你扑对了方向也没顶住。" : P.goal, cls: "bad" };
    }
    if (isGrid(st)) {
      const id = grid()[r.pickIdx].id, P = L3_CELL[id] || L3_CELL.CT;
      if (r.off) return { text: P.off, cls: "bad" };
      if (r.saved) return { text: P.saved, cls: "bad" };
      return { text: r.strong ? "他扑对了方向，可这脚力量太大，球硬撞进网窝。" : P.goal, cls: "goal" };
    }
    const P = poolOf(st.options[r.pickIdx].id);
    if (st.kind === "L1") {
      if (r.win && r.mateFinish) {
        return r.mateGoal
          ? { text: "你的威胁球变成了助攻——队友一蹴而就！", cls: "goal" }
          : { text: "传球到位，可惜队友没能把球送进门。", cls: "bad" };
      }
      return r.win ? { text: P.win, cls: "good" } : { text: P.lose, cls: "bad" };
    }
    return r.broken ? { text: P.win, cls: "good" } : { text: P.lose, cls: "bad" };
  }

  /* ══════════════ 交互 ══════════════ */
  function mountAndBind() {
    const root = UIkit.modal(render(), { dismissable: false });
    root.querySelectorAll("[data-pick]").forEach(function (el) {
      el.onclick = UIkit.guard(function () { commit(parseInt(el.dataset.pick, 10)); }, "对弈选择");
    });
    bindAdBtn(root);
    // ★ 3C：中场模式切换（传球组织 / 持球推进）—— 切换后成功率表随选项集一起重算
    root.querySelectorAll("[data-mode]").forEach(function (el) {
      el.onclick = UIkit.guard(function () {
        const mode = el.dataset.mode;
        if (!ctx.st || mode === ctx.st.mode) return;
        if (ctx.engine && ctx.engine.duelMode) ctx.engine.duelMode(ctx.side, ctx.i, mode);
        else if (D() && D().l1SetMode) D().l1SetMode(ctx.st, mode);
        mountAndBind();
      }, "切换打法");
    });
  }

  function commit(pick, force) {
    const engine = ctx.engine;
    /* ★ P151：广告直成资格一次性消费（看完广告后的下一次选择必定成功） */
    if (ctx.adReady) { force = true; ctx.adReady = false; }
    ctx.st.pickIdx = pick;
    /* ★★ P116 点球大战分支（用户拍板「射门左中右删除，直接用六格小游戏」）：
       点球不入比赛时间线 ⇒ 不走 engine.duelStep，直接 Duel.penaltyResolve（罚点球
       属性考察 + 命中率高于运动战），结果原样回传 settlement 点球计数器。 */
    if (ctx.penalty) {
      const r = (window.Duel && Duel.penaltyResolve)
        ? Duel.penaltyResolve(ctx.st, pick, false)
        : { goal: false, saved: false, off: true, pickIdx: pick, penalty: true };
      const root0 = UIkit.$("#v2-modal-root");
      const box0 = root0 && root0.querySelector("#duel-result");
      if (box0) box0.innerHTML = renderResult(r) +
        '<div style="margin-top:10px"><button class="btn btn-primary" id="duel-go">回到点球大战 ▸</button></div>';
      root0.querySelectorAll("[data-pick]").forEach(function (el) {
        const on = parseInt(el.dataset.pick, 10) === pick;
        el.style.opacity = on ? "1" : ".4";
        el.style.pointerEvents = "none";
        if (on) el.classList.add("on");
      });
      const go0 = UIkit.$("#duel-go");
      if (go0) go0.onclick = function () {
        UIkit.closeModal();
        const cb0 = ctx.done; ctx = null;
        if (typeof cb0 === "function") cb0(r);
      };
      return;
    }
    /* ★ P109：「让队友喊一声」（变招换情报）已按用户要求移除 —— 引擎的 switchUsed
       通道保留（探针/未来机制可用），UI 恒传 false。 */
    const out = ctx.chained ? engine.duelStepShot(pick, false, force) : engine.duelStep(ctx.side, ctx.i, pick, false, force);
    /* ★★★ P99-FLAKY 修复（真 P0）：这条守卫原来**关掉弹层却不调回调** ——
       而 `MatchUI` 的定时器在打开对弈前就已经 `stopTimer()` 了，
       唯一能重新起表的地方就是 `showDuel` 传进来的这个回调（`match.js:158-164` 里 `rearm()`）。
       → 一旦走到这条守卫，**比赛永久停住**：弹层关了、feed 不再增长、
         控制区只剩「跳到终场」，玩家点什么都没反应（实测现场：`t=false` + feed 冻结 + 只剩 #m-skip）。
       ★ 修法遵循「无路可走就响亮失败，别静默」：**先把回调补上**（让比赛能继续），
         同时给玩家一句可见提示，绝不留下"引擎还在等一个永远不会来的回调"的死状态。 */
    if (!out || !out.result) {
      const cb = ctx.done; ctx = null;
      UIkit.closeModal();
      try { if (UIkit.toast) UIkit.toast("对弈结果异常，已按自动处理继续比赛", ""); } catch (e) { }
      if (typeof cb === "function") cb([]);
      return;
    }
    // ★ L1 赢下 → 立刻接 L3（同一个弹窗换内容，不打断节奏）——仅 carry/前锋链（P109：pass 赢下到队友脚下，不接这条）
    if (out.next) {
      ctx.st = out.next.st;
      ctx.title = "终结";
      ctx.sub = "过掉他了——现在只有你和门将。";
      ctx.chained = true;
      mountAndBind();
      return;
    }
    const root = UIkit.$("#v2-modal-root");
    const box = root && root.querySelector("#duel-result");
    /* ★ P109：「让队友喊一声」按钮移除后，结算区的容器改由 #duel-result 直接承载
       （渲染期不再输出 #duel-acts 空壳）。 */
    if (box) {
      /* ★ P168：美漫风结算动效插在结果文字上方（射门/扑救/传球/防守各一套） */
      box.innerHTML = animHtml(out.result) + renderResult(out.result) +
        '<div style="margin-top:10px"><button class="btn btn-primary" id="duel-go">比赛继续</button></div>';
    }
    root.querySelectorAll("[data-pick]").forEach(function (el) {
      const on = parseInt(el.dataset.pick, 10) === pick;
      el.style.opacity = on ? "1" : ".4";
      el.style.pointerEvents = "none";
      if (on) el.classList.add("on");
    });
    /* ★ P168：special 条目（旧关键时刻卡转小游戏）的 feed 由引擎 resolveSpecialKey 产出
       （含「必然丢球」比分后缀 / 化解播报），原样透传；普通条目沿用弹窗内文案。 */
    let feedItems;
    if (out.special && out.items) {
      feedItems = out.items;
    } else {
      const f = resultFeed(out.result);
      feedItems = f ? [{ minute: 0, type: f.cls, text: esc(f.text) }] : [];
    }
    const go = UIkit.$("#duel-go");
    if (go) {
      go.onclick = function () {
        UIkit.closeModal();
        const cb = ctx.done; ctx = null;
        cb(feedItems);
      };
    }
  }

  window.DuelUI = {
    /** @param moment MatchEngine.duelMomentOf() 的产物
     *  @param engine MatchEngine（提供 duelStep / duelStepShot）
     *  @param done   (feedItems) => void */
    show: function (moment, engine, done) {
      if (!D() || !moment || !moment.st) { done([]); return; }
      ctx = {
        st: moment.st, title: moment.title, sub: moment.sub, minute: moment.minute,
        side: moment.side, i: moment.i, engine: engine, done: done,
        chained: false,   // ★ P109：boost/boostLeft 字段随「喊一声」机制一并移除
        special: !!moment.special,   // ★ P168：旧关键时刻卡转小游戏（结算走引擎 specialItems）
      };
      ctx.st.pickIdx = null;
      mountAndBind();
    },
    /** ★★ P116 点球大战主罚（六格）：独立入口 —— 不走引擎 duelStep（点球结果
       不进比赛时间线/比分），选择结算回传 onDone(result)，由 settlement 点球
       计数器消费。minute 传 "PK"（角标显示 PK'）。 */
    showPenalty: function (st, done) {
      if (!D() || !st) { if (typeof done === "function") done({ goal: false, saved: false, off: true, pickIdx: -1, penalty: true }); return; }
      ctx = {
        st: st, title: (st.i18n && st.i18n.title) || "点球大战",
        sub: (st.i18n && st.i18n.sub) || "你主罚——选一个角度",
        minute: "PK", engine: null, done: done, chained: false, penalty: true,
      };
      ctx.st.pickIdx = null;
      mountAndBind();
    },
  };
})();
