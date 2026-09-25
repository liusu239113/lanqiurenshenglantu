/* ============================================================================
   offseason_dev.js — 休赛期「青训投资」养成系统（M3）
   数值见 docs/比赛驱动改造规格_v1.md §5（已锁定 v1）。
   设计分层：**数据层无 DOM 依赖**（可在 node 沙箱里 headless 测试），
   UI 层（show）只负责渲染与按钮回调，双端同构时只重写 UI 层。
   核心规则：
   · 投入即扣款，产出按「休赛期进入时」一年一结（tickSeason，按 season 幂等）
   · 苗子全原创生成（随机姓+名+位置+潜力），禁真人；2 季后可提拔
   · 足球学校分期中断不惩罚、不退款，只暂停建造进度
   ============================================================================ */
(function () {
  const $ = s => document.querySelector(s);
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&#39;" }[c]));
  }
  const fmt = v => (window.Career ? Career.fmtMoney(v) : String(v));

  /* ── 数值表（规格 §5 锁定值，改这里等于改平衡） ── */
  const CFG = {
    INVITE_SMALL: { cost: 500000, fame: 800, chance: 0.30 },
    /* ★ P177：extraLead/pendingLead 退役——原字段加 1、递减、永远无人消费（审计实锤死代码）。
       「苗子率更高」的真实语义由 chance 0.30→0.60 承担（翻倍，实测兑现）。 */
    INVITE_BIG: { cost: 2000000, fame: 2000, chance: 0.60 },
    SCHOOL: { costPerSeason: 1000000, seasons: 3, famePerSeason: 1200, chance: 0.35, pot: [75, 85] },
    CAMP: { cost: 1500000, seasons: 2, chance: 0.45, pot: [78, 88] },
    DONATE: { cost: 300000, fame: 500, morale: 5 },
    /* ★★ P186（用户拍板「投资深度加大，让钱有地方用」）：2 个高阶项目补高位容量——
       职业梯队共建（青训营上位，800w 一次性）与全国青训中心（足校上位，2500w×3 季）。
       产出语义与下位项目同构（建成後每季 roll 苗子），更贵更强；具体动作方法见下方
       investProteam / investCenter 与 tick 处的产出段。 */
    PROTEAM: { cost: 8e6, chance: 0.55, pot: [80, 90] },
    CENTER: { costPerSeason: 25e6, seasons: 3, chance: 0.65, pot: [83, 92] },
    GRADUATE: { fame: 3000, morale: 6 },
    GRAD_SEASONS: 2,   // 苗子满 2 季可提拔
    /* ★★ P97 M4-4.4（国家实力第二出口）：生涯积分折算成**青训苗子池的潜力上限上移**（点）
     *  与既有 `NationDev.boost`（钱买的国足强度，作用于 `intl.js` 的 nationStrength）
     *  是**两条独立出口** —— 一条抬国足，一条抬青训土壤，互不重复计数。
     *  ★ 取整粒度：`Math.round(boost × MAX)`，积分跨百位才动一格，
     *    避免"打一场球苗子就集体变强"这种不可信的因果。
     *  ★★ 取值 3 的依据（`tools/_p97_nation_probe.js` 矩阵实测，n=12000/格）：
     *      · 普通主力（370 分 → shift 1）：学校苗子国脚率 12.4% → **17.4%（1.40×）**，可感知
     *      · 传奇（1705 分 → shift 3）：学校 **28.2%（2.24×）** / 青训营 **49.8%（1.39×）**
     *      · MAX=4 → 青训营 52.7%；MAX=6 → 学校 3.23× / 青训营 59.0% —— 均已**过半**，失衡
     *    选 3 是"传奇档可感知且青训营不过半"的最大值，留有余量。 */
    NATION_BOOST_MAX: 3,
  };

  /** 潜力硬顶（与 `config.POTENTIAL.HARD_CAP` 同源，未加载时本地兜底） */
  const POT_CAP = () => (window.CONFIG && window.CONFIG.POTENTIAL && window.CONFIG.POTENTIAL.HARD_CAP) || 92;

  /** ★ P97 M4-4.4：生涯积分 → 苗子池潜力上移（0 ~ NATION_BOOST_MAX 的整数）
   *  ---------------------------------------------------------------------------
   *  ★ 为什么放在 `makeProspect` 的**结果**上，而不是改传进来的 `potRange`：
   *    ① 下方 `source` 判断依赖 `potRange[1]` 的**原值**（`>=88` 判青训营）——
   *       改参数会把所有苗子的来源标签串掉；
   *    ② `R.int(lo,hi)` 消耗的随机流与 shift **无关** ——
   *       于是 `shift === 0` 时逐位复现旧行为（老档 / 探针基线不受影响）。
   *  ★ 取的是**实时积分**（`Legacy.sync` 带缓存），所以赛季中夺冠能立刻反映到下一批苗子上。 */
  function nationShift(state) {
    try {
      if (!window.Legacy || typeof Legacy.nationBoost !== "function") return 0;
      const d = state && state.data;
      if (!d) return 0;
      const p = (typeof Legacy.sync === "function") ? Legacy.sync(d) : (d.legacyPoints || 0);
      return Math.round(CFG.NATION_BOOST_MAX * (Legacy.nationBoost(p) || 0));
    } catch (e) { return 0; }
  }

  const SURNAMES = ["李", "王", "张", "刘", "陈", "杨", "赵", "黄", "周", "吴", "徐", "孙", "马", "朱", "胡", "林", "郭", "何", "高", "罗"];
  const GIVEN = ["子轩", "浩然", "俊熙", "宇航", "嘉豪", "泽楷", "晨阳", "奕辰", "锦程", "天佑", "博文", "思远", "立诚", "昊然", "沐辰", "星野", "沐阳", "柏舟", "知远", "若飞"];
  const POSITIONS = ["ST", "CF", "LW", "RW", "CAM", "CM", "CDM", "CB", "LB", "RB", "GK"];
  const POS_CN = { ST: "前锋", CF: "中锋", LW: "左边锋", RW: "右边锋", CAM: "前腰", CM: "中场", CDM: "后腰", CB: "中后卫", LB: "左后卫", RB: "右后卫", GK: "门将" };

  const OffseasonDev = {
    CFG,

    /** 存档结构兼容导出：P103 国家队页内嵌青训投资复用（单源，别在 UI 里再抄一份） */
    POS_CN: POS_CN,

    /** 存档结构兜底（旧档可读） */
    CFG: CFG,   // 供休赛期卡片流读取成本（避免两处硬编码漂移）
    ensure(d) {
      d.academy = d.academy || {};
      const a = d.academy;
      a.invite = a.invite || { count: 0, pendingChance: 0 };
      a.school = a.school || { paidSeasons: 0, built: false };
      a.camp = a.camp || { stage: 0, built: false };   // stage: 0未建 1建造中 2已建成
      /* ★ P186 高阶项目：proteam（一次性）与 center（3 季分期）——语义同构 school/camp */
      a.proteam = a.proteam || { built: false };
      a.center = a.center || { paidSeasons: 0, built: false };
      a.prospects = a.prospects || [];
      a.graduates = a.graduates || [];
      a.lastTickSeason = a.lastTickSeason || 0;
      a.invested = a.invested || 0;   // 累计投入额（供国力加成计算，见 nation_dev.js）
      return a;
    },

    isOffseason(d) {
      return !!(d.offseason);
    },

    /** 生成原创苗子（禁真人：随机姓+名+位置+潜力）
     *  ★ P97 M4-4.4：国家实力抬的是**上界**（苗子天花板），不是整体平移
     *     ------------------------------------------------------------------
     *     为什么不能整体平移：国脚门槛（85）**正好落在学校分布 [75,85] 的上界上**，
     *     整体 +4 会让"越线概率"从 12.6% 跳到 **45.2%**（3.6 倍）——
     *     阈值落在分布内部时，平移会引发非线性跳跃。
     *     只抬上界（`[75, 85+shift]`）则尾部线性拉长：+2 → 26.4%（2.0 倍），
     *     且**下界不变** —— 语义上也更准：「实力强 = 能出更好的苗子」，
     *     而不是「连最差的苗子都变好了」。 */
    makeProspect(state, potRange) {
      const R = window.R;
      const shift = nationShift(state);
      const raw = R.int(potRange[0], potRange[1] + shift);   // ← 唯一随机流消耗点（shift=0 时逐位复现旧行为）
      const pot = Math.min(POT_CAP(), raw);
      return {
        id: "ac_" + state.data.season + "_" + Math.floor(R.next() * 100000),
        name: R.pick(SURNAMES) + R.pick(GIVEN),
        position: R.pick(POSITIONS),
        pot,
        natShift: shift,     // ★ 溯源：这名苗子的上限被国家实力抬了多少（0 = 无加成，供 UI / 探针）
        seasons: 0,          // 进入青训后的季数
        source: potRange[1] >= 88 ? "青训营" : "足球学校",   // ★ 依赖 potRange 原值，故不改传参
      };
    },

    /* ── 投资动作（返回 {ok, msg}）──
       ★ P141：四项投资同步抬升国内足球兴趣度/注册球员（NationDev.onAcademyInvest，
       语义=青训基建扩大足球人口；NationDev 缺失时 try-catch 静默，不影响投资本身） */
    _meterHook(state, cost) {
      try { if (window.NationDev) NationDev.onAcademyInvest(state, cost); } catch (e) { /* ignore */ }
    },

    investInvite(state, big) {
      const d = state.data, a = this.ensure(d);
      const cfg = big ? CFG.INVITE_BIG : CFG.INVITE_SMALL;
      if (d.money < cfg.cost) return { ok: false, msg: "资金不足，需要 " + fmt(cfg.cost) };
      d.money -= cfg.cost;
      a.invested = (a.invested || 0) + cfg.cost;
      this._meterHook(state, cfg.cost);
      if (window.Career) Career.addFame(state, cfg.fame);
      a.invite.count++;
      a.invite.pendingChance = Math.max(a.invite.pendingChance, cfg.chance);
      return { ok: true, msg: (big ? "大型" : "小型") + "青少年邀请赛落地，声望 +" + cfg.fame + "，下个休赛期揭晓苗子（兑现率 " + Math.round(cfg.chance * 100) + "%）。" };
    },

    investSchool(state) {
      const d = state.data, a = this.ensure(d);
      if (a.school.built) return { ok: false, msg: "足球学校已建成，无需再投。" };
      if (d.money < CFG.SCHOOL.costPerSeason) return { ok: false, msg: "资金不足，本季需 " + fmt(CFG.SCHOOL.costPerSeason) };
      d.money -= CFG.SCHOOL.costPerSeason;
      a.invested = (a.invested || 0) + CFG.SCHOOL.costPerSeason;
      this._meterHook(state, CFG.SCHOOL.costPerSeason);
      a.school.paidSeasons++;
      if (a.school.paidSeasons >= CFG.SCHOOL.seasons) a.school.built = true;
      return { ok: true, msg: "足球学校第 " + a.school.paidSeasons + " 期投入完成" + (a.school.built ? "，学校落成！" : "。") };
    },

    investCamp(state) {
      const d = state.data, a = this.ensure(d);
      if (a.camp.stage > 0) return { ok: false, msg: "青训营已在新办名单里（建设中/已建成），不用重复投。" };
      if (d.money < CFG.CAMP.cost) return { ok: false, msg: "资金不足，需要 " + fmt(CFG.CAMP.cost) };
      d.money -= CFG.CAMP.cost;
      a.invested = (a.invested || 0) + CFG.CAMP.cost;
      this._meterHook(state, CFG.CAMP.cost);
      a.camp.stage = 1;
      return { ok: true, msg: "青训营动工，下个休赛期落成；此后每季 45% 概率出一名高潜苗子。" };
    },

    /* ★★ P186 高阶项目（用户拍板「深度加大，让钱有地方用」） */
    /** 职业梯队共建（800w 一次性；建成後每季 55% 出 80-90 潜力苗子——青训营上位） */
    investProteam(state) {
      const d = state.data, a = this.ensure(d);
      if (a.proteam.built) return { ok: false, msg: "职业梯队已共建完成。" };
      if (d.money < CFG.PROTEAM.cost) return { ok: false, msg: "资金不足，需要 " + fmt(CFG.PROTEAM.cost) };
      d.money -= CFG.PROTEAM.cost;
      a.invested = (a.invested || 0) + CFG.PROTEAM.cost;
      this._meterHook(state, CFG.PROTEAM.cost);
      a.proteam.built = true;
      return { ok: true, msg: "职业梯队共建签约！下个休赛期起，每季 55% 概率出一名高潜苗子（潜力 80-90）。" };
    },
    /** 全国青训中心（2500w×3 季分期；建成后每季 65% 出 83-92 潜力苗子——足校上位） */
    investCenter(state) {
      const d = state.data, a = this.ensure(d);
      if (a.center.built) return { ok: false, msg: "全国青训中心已落成。" };
      if (d.money < CFG.CENTER.costPerSeason) return { ok: false, msg: "资金不足，本季需 " + fmt(CFG.CENTER.costPerSeason) };
      d.money -= CFG.CENTER.costPerSeason;
      a.invested = (a.invested || 0) + CFG.CENTER.costPerSeason;
      this._meterHook(state, CFG.CENTER.costPerSeason);
      a.center.paidSeasons++;
      if (a.center.paidSeasons >= CFG.CENTER.seasons) a.center.built = true;
      return { ok: true, msg: "青训中心第 " + a.center.paidSeasons + " 期投入完成" + (a.center.built ? "，中心落成！每季 65% 出顶级苗子（潜力 83-92）。" : "。") };
    },

    donate(state) {
      const d = state.data, a = this.ensure(d);
      if (d.money < CFG.DONATE.cost) return { ok: false, msg: "资金不足，需要 " + fmt(CFG.DONATE.cost) };
      d.money -= CFG.DONATE.cost;
      a.invested = (a.invested || 0) + CFG.DONATE.cost;
      this._meterHook(state, CFG.DONATE.cost);
      if (window.Career) Career.addFame(state, CFG.DONATE.fame);
      d.morale = Math.min(100, (d.morale || 60) + CFG.DONATE.morale);
      a.donated = (a.donated || 0) + 1;
      return { ok: true, msg: "球场捐赠完成，声望 +" + CFG.DONATE.fame + "，士气 +" + CFG.DONATE.morale + "。" };
    },

    /** 休赛期进入时结算一次（按 season 幂等） */
    tickSeason(state) {
      const d = state.data, a = this.ensure(d);
      if (a.lastTickSeason === d.season) return { ticked: false };
      a.lastTickSeason = d.season;
      const out = { ticked: true, prospects: 0, fame: 0, campBuilt: false };
      /* ★ P186 订阅加成（NationDev 长期项目）：苗子率 +rate、潜力下限 +potFloor——
         无订阅时 rate=0/potFloor=0 → chance 与 potRange 逐位复现旧行为（零漂移）。 */
      const _sub = (window.NationDev && NationDev.subBonusOf) ? NationDev.subBonusOf(d) : { rate: 0, potFloor: 0 };
      const _pAdj = (pot) => {
        if (!_sub.potFloor) return pot;
        return [pot[0] + _sub.potFloor, Math.max(pot[0] + _sub.potFloor, pot[1] + _sub.potFloor)];
      };
      // 苗子成长
      a.prospects.forEach(p => { p.seasons = (p.seasons || 0) + 1; });
      // 邀请赛苗子兑现（上一休赛期办的赛，本休赛期揭晓）——★ P186 订阅苗子率加成并入
      if (a.invite.pendingChance > 0) {
        if (R.chance(Math.min(0.95, a.invite.pendingChance + _sub.rate))) { a.prospects.push(this.makeProspect(state, _pAdj([75, 85]))); out.prospects++; }
        a.invite.pendingChance = 0;
      }
      // 足球学校：建成后每季产出
      if (a.school.built) {
        if (window.Career) Career.addFame(state, CFG.SCHOOL.famePerSeason);
        out.fame += CFG.SCHOOL.famePerSeason;
        if (R.chance(Math.min(0.95, CFG.SCHOOL.chance + _sub.rate))) { a.prospects.push(this.makeProspect(state, _pAdj(CFG.SCHOOL.pot))); out.prospects++; }
      }
      // 青训营：stage 1 → 2（建成），建成后每季产出
      if (a.camp.stage === 1) { a.camp.stage = 2; a.camp.built = true; out.campBuilt = true; }
      else if (a.camp.built && R.chance(Math.min(0.95, CFG.CAMP.chance + _sub.rate))) { a.prospects.push(this.makeProspect(state, _pAdj(CFG.CAMP.pot))); out.prospects++; }
      /* ★★ P186 高阶项目产出（语义与 school/camp 同构；订阅加成已在头部并入） */
      if (a.proteam.built && R.chance(Math.min(0.95, CFG.PROTEAM.chance + _sub.rate))) { a.prospects.push(this.makeProspect(state, _pAdj(CFG.PROTEAM.pot))); out.prospects++; }
      if (a.center.built && R.chance(Math.min(0.95, CFG.CENTER.chance + _sub.rate))) { a.prospects.push(this.makeProspect(state, _pAdj(CFG.CENTER.pot))); out.prospects++; }
      return out;
    },

    /** 提拔苗子（满 2 季）→ 进入真实国内俱乐部，2~4 季后判定是否国脚级（规格 §4） */
    graduate(state, idx) {
      const d = state.data, a = this.ensure(d);
      const p = a.prospects[idx];
      if (!p) return { ok: false, msg: "没有这名苗子。" };
      if ((p.seasons || 0) < CFG.GRAD_SEASONS) return { ok: false, msg: "还需要 " + (CFG.GRAD_SEASONS - p.seasons) + " 个赛季才能提拔。" };
      a.prospects.splice(idx, 1);
      const origin = (window.teamById && teamById(d.clubId) || {}).name || "";
      let club = { id: null, name: "国内联赛俱乐部" };
      if (window.NationDev) { try { club = NationDev.pickRealClub(state, p.pot); } catch (e) { /* 回落 */ } }
      const devCfg = (window.NationDev && NationDev.CFG) || { DEV_MIN: 2, DEV_MAX: 4 };
      const need = devCfg.DEV_MIN + R.int(0, devCfg.DEV_MAX - devCfg.DEV_MIN);
      a.graduates.push(Object.assign({}, p, {
        season: d.season, originClub: origin,
        gradClubId: club.id, gradClubName: club.name,
        dev: 0, need, status: "dev", finalPot: null, intlSeason: null,
      }));
      if (window.Career) Career.addFame(state, CFG.GRADUATE.fame);
      d.morale = Math.min(100, (d.morale || 60) + CFG.GRADUATE.morale);
      return { ok: true, msg: POS_CN[p.position] + " " + p.name + "（潜力 " + p.pot + "）加盟 " + club.name + "，声望 +" + CFG.GRADUATE.fame + "。" };
    },

    readyToGraduate(d) {
      const a = this.ensure(d);
      return a.prospects.filter(p => (p.seasons || 0) >= CFG.GRAD_SEASONS);
    },

    /* ── UI 层：休赛期养成界面 ── */
    show() {
      if (!window.UIkit || !window.State) return;
      const state = window.State, d = state.data;
      const res = this.tickSeason(state);
      State.save();

      const render = () => {
        const a = this.ensure(d);
        const money = fmt(d.money);
        const schoolTxt = a.school.built ? "已建成（每季产苗 35%）" : ("建设进度 " + a.school.paidSeasons + " / " + CFG.SCHOOL.seasons + " 期");
        const campTxt = a.camp.built ? "已建成（每季产苗 45%）" : (a.camp.stage === 1 ? "建设中（下赛季落成）" : "未新建");
        const row = (label, value) => '<div class="row"><span>' + label + "</span><b>" + value + "</b></div>";
        let html = "<h3 style='text-align:center'>" + ICO("building", 18) + " 青训投资</h3>" +
          '<div style="text-align:center;color:var(--text-dim);font-size:12px;margin-bottom:10px">可用资金 ' + money + (res && res.prospects ? " · 本季新苗子 " + res.prospects + " 人" : "") + "</div>" +
          '<div class="panel alt">' + row("足球学校", schoolTxt) + '<div class="divider"></div>' + row("青训营", campTxt) +
          '<div class="divider"></div>' + row("已办邀请赛", a.invite.count + " 届") + "</div>";

        html += '<div class="panel"><div class="panel-title">投资项目</div>' +
          '<button class="btn btn-ghost btn-block mb-8" id="od-inv-s">办小型青少年邀请赛 · ' + fmt(CFG.INVITE_SMALL.cost) + '（声望+800）</button>' +
          '<button class="btn btn-ghost btn-block mb-8" id="od-inv-b">办大型青少年邀请赛 · ' + fmt(CFG.INVITE_BIG.cost) + '（声望+2000，苗子率更高）</button>' +
          '<button class="btn btn-ghost btn-block mb-8" id="od-school">' + (a.school.built ? "足球学校追加运营 · " : "足球学校本期投入 · ") + fmt(CFG.SCHOOL.costPerSeason) + '</button>' +
          '<button class="btn btn-ghost btn-block mb-8" id="od-camp">新建青训营 · ' + fmt(CFG.CAMP.cost) + '（下季落成，每季 45% 出高潜苗）</button>' +
          '<button class="btn btn-ghost btn-block" id="od-donate">捐赠家乡球场 · ' + fmt(CFG.DONATE.cost) + '（声望+500）</button></div>';

        if (a.prospects.length) {
          html += '<div class="panel"><div class="panel-title">青训苗子（' + a.prospects.length + " 人）</div>";
          a.prospects.forEach((p, i) => {
            const ready = (p.seasons || 0) >= CFG.GRAD_SEASONS;
            html += '<div class="list-item"><div class="li-main"><div class="li-title">' + esc(p.name) + " · " + POS_CN[p.position] + '</div>' +
              '<div class="li-sub">潜力 ' + p.pot + " · " + esc(p.source) + " · 已培养 " + (p.seasons || 0) + " 季" + (ready ? " · <span class='c-gold'>可提拔</span>" : "") + "</div></div>" +
              (ready ? '<button class="btn btn-sm btn-gold" data-grad="' + i + '">提拔</button>' : "") + "</div>";
          });
          html += "</div>";
        }
        if (a.graduates.length) {
          const ST = { dev: "在俱乐部发展", pro: "普通职业球员", intl: "已入选国足" };
          html += '<div class="panel"><div class="panel-title">已提拔（' + a.graduates.length + " 人）</div>" +
            a.graduates.slice(-10).map(g => '<div class="li-sub">' + esc(g.name) + " · " + POS_CN[g.position] + " · 潜力 " + (g.finalPot != null ? g.finalPot : g.pot) +
              " · " + esc(g.gradClubName || "国内联赛") + " · " + (ST[g.status] || "普通职业球员") + "（" + g.season + " 赛季提拔）</div>").join("") +
            (a.graduates.length > 10 ? '<div class="dim12">…共 ' + a.graduates.length + " 人，完整名单见「国足发展」</div>" : "") + "</div>";
        }
        html += '<button class="btn btn-primary btn-block mt-12" id="od-done">结束休赛期安排 ▸</button>';
        UIkit.modal(html, { dismissable: false });

        const bind = id => { const b = $(id); if (b) b.onclick = () => { const r = fnOf(id)(state); UIkit.toast(r.msg, r.ok ? "green" : ""); State.save(); if (r.ok) render(); }; };
        const fnOf = id => ({
          "#od-inv-s": () => this.investInvite(state, false),
          "#od-inv-b": () => this.investInvite(state, true),
          "#od-school": () => this.investSchool(state),
          "#od-camp": () => this.investCamp(state),
          "#od-donate": () => this.donate(state),
        }[id]);
        ["#od-inv-s", "#od-inv-b", "#od-school", "#od-camp", "#od-donate"].forEach(bind);
        document.querySelectorAll("[data-grad]").forEach(b => {
          b.onclick = () => { const r = this.graduate(state, +b.dataset.grad); UIkit.toast(r.msg, r.ok ? "gold" : ""); State.save(); if (r.ok) render(); };
        });
        const done = $("#od-done");
        if (done) done.onclick = () => { UIkit.closeModal(); if (window.Hub) Hub.refresh(null); };
      };
      render();
    },
  };

  window.OffseasonDev = OffseasonDev;
  OffseasonDev.nationShift = nationShift;   // ★ P97 M4-4.4：供 UI / 探针读取"当前档位的青训加成"
})();
