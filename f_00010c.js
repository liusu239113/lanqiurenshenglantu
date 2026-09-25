/* ============================================================================
   v2/create.js — 开档：单屏采访 + 天赋六选三 + 三选一签约
   数据契约与旧壳一致（origin fx / playStyle / talents / genInitialOffers）。
   ============================================================================ */
(function () {
  'use strict';
  function guestPlayerName() {
    try { if (window.REAL_DATA && REAL_DATA.genChineseName) return REAL_DATA.genChineseName(); } catch (err) { /* ignore */ }
    return "林小野";
  }

  const Create = {
    /* ★ 姓名可输入模式（2026-09-17 用户需求）：surname = 玩家输入的姓（恒 1 个汉字，
       空串 = 尚未定、确认前随机补）；given = 随机名（玩家不可手输）。
       `name` 变为**派生值**（surname+given），只在 composeName() 里重组 ——
       下游（finishInterview / confirm / reveal）读 name 的代码全部不用动。 */
    name: "", surname: "", given: "", position: "ST", originId: null, styleId: null, number: 9, nationality: "中国",
    offer: [], freeRerolls: 3, picked: new Set(), talentPicked: null, allSix: false,

    open() {
      this.name = ""; this.surname = ""; this.given = ""; this.position = "ST"; this.originId = null; this.styleId = null;
      this.number = 9; this.offer = []; this.freeRerolls = 3; this.picked = new Set(); this.talentPicked = null; this.allSix = false;
      UIkit.show("create");
      try { if (window.REAL_DATA && REAL_DATA.genChineseName) this.name = REAL_DATA.genChineseName(); } catch (err) { /* ignore */ }
      if (!this.name) this.name = guestPlayerName();
      /* ★ 姓可输入模式：初始全名拆成 姓 + 名（姓池 CHN_SURNAMES 全为单字，首字即姓；
         fallback「林小野」同为单字姓）。玩家随后可改姓，名始终随机。 */
      this.surname = this.name.charAt(0) || "林";
      this.given = this.name.slice(1) || "小野";
      this.render();
    },

    render() {
      const form = UIkit.$("#create-form");
      const POS = CONFIG.POSITIONS;
      const posKeys = ["ST", "CAM", "CM", "CDM", "CB", "GK"];
      const origins = (window.IDENTITY && IDENTITY.origins) || {};
      const styles = (window.IDENTITY && (IDENTITY.styles[(CONFIG.POSITIONS[this.position] || { group: "ATK" }).group] || [])) || [];
      /* ★★ P129a 传承横幅（T7 爽感钩子②）：gen≥2 且有传承记录时，创建页顶部即时可见。
         数据源 = META 层（建档前即可读）；注入发生在 confirm（建档时），本横幅只展示不注入。 */
      let legacyBanner = "";
      try {
        if (window.Meta && Meta.cycle && Meta.cycle() >= 2 && Meta.lastLegacy) {
          const ll = Meta.lastLegacy();
          if (ll && (ll.attr > 0 || ll.sp > 0)) {
            legacyBanner = '<div class="panel hl" style="margin-bottom:12px"><div class="panel-title">第 ' + Meta.cycle() + ' 次生涯 · 继承加成</div>' +
              '<div style="font-size:13px;line-height:1.9">上一次生涯（' + UIkit.esc(ll.tierName || "无名之辈") + '）留下：<b class="c-gold">能力点 +' + ll.attr + '</b> · <b class="c-gold">技能点 +' + ll.sp + "</b>" +
              (ll.biz && ll.biz.length ? " · 产业 <b>" + ll.biz.length + "</b> 座（已继承交割；签约职业合同后起租，收益随身价逐步解冻）" : "") + "。</div>" +
              '<div class="dim12" style="margin-top:4px">点数与产业建档后自动入账——花不花、花在哪，由你决定。</div></div>';
          }
        }
      } catch (err) { /* META 未就绪时静默跳过（首代/沙箱） */ }
      /* ★ 姓名行（可输入模式）：姓 = 输入框（限 1 个汉字，可清空=随机）；名 = 只读随机。
         ★ 输入框**不设 maxlength** —— 拼音输入法组合期间字母会计入长度，maxlength=1
           会把组合提前截断（PC Chrome 实测行为）；限长改由 JS 清洗保证（见下方绑定）。 */
      let html = legacyBanner +
        '<div class="row" style="margin-bottom:10px"><span style="font-weight:800">姓名</span>' +
        '<input id="cr-surname" class="num-input" type="text" placeholder="姓" autocomplete="off" ' +
        'style="width:52px;padding:6px 2px;margin-left:2px" value="' + UIkit.esc(this.surname) + '">' +
        '<b id="cr-given" style="font-size:16px;margin-left:2px">' + UIkit.esc(this.given) + '</b>' +
        '<button class="btn btn-sm btn-ghost" id="cr-dice" style="margin-left:auto">换一个</button></div>' +
        '<div class="dim12" style="margin:-4px 0 10px;font-size:11.5px">「姓」可输入 1 个汉字（留空则随机）；名只随机 —— 点「换一个」重抽。</div>' +
        '<div class="row" style="margin-bottom:10px"><span style="font-weight:800">位置</span><span class="chiprow">' +
        posKeys.map(p => '<button class="chip' + (p === this.position ? " sel" : "") + '" data-pos="' + p + '">' + ((POS[p] || {}).name || p) + "</button>").join("") + "</span></div>" +
        '<div style="margin-bottom:10px"><div style="font-weight:800;margin-bottom:6px">出身 · 你是怎么练过来的？</div><div class="cardgrid">' +
        Object.keys(origins).map(oid => {
          const o = origins[oid];
          /* ★★ P97 M4-4.5：`locked` 必须同时看**是否已跨档解锁** —— 此前只看数据里的
             `adUnlock` 标记，于是"看完广告解锁了、卡面却还挂着锁"（解锁状态与视觉不一致）。
             现在与点击拦截用同一判定（`_geniusUnlocked` 会话内 + `Meta.hasOrigin` 跨档）。 */
          const everUnlocked = this._geniusUnlocked
            || !!(window.Meta && Meta.hasOrigin && Meta.hasOrigin(oid));
          /* ★★ P113：三档三种解锁形态 ——
             · genius：广告解锁（adUnlock，P97 既有）；
             · sports：生涯累计 5 次一线队冠军（champUnlock，跨周目 Meta.champions）；
               达标即**自动落锁**（unlockOrigin 幂等）——玩家不需要手动点；
             · hotblood：永远开放。 */
          let locked = false, lockText = "";
          if (o.adUnlock && !everUnlocked) { locked = true; lockText = "看广告解锁"; }
          else if (o.champUnlock && !everUnlocked && window.Meta && Meta.champions) {
            const got = Meta.champions() || 0;
            if (got >= o.champUnlock) {
              locked = false;
              try { if (window.Meta && Meta.unlockOrigin) Meta.unlockOrigin(oid); } catch (err) { /* ignore */ }
            } else { locked = true; lockText = o.champUnlockText + "（" + got + " / " + o.champUnlock + "）"; }
          }
          // ★ P97-M1 D4：出身卡**直接展示平均潜力数字** —— 让"选哪个出身"成为一个真实决策（不是埋起来）
          const potLine = (typeof o.pot === "number")
            ? '<div style="font-weight:800;color:var(--accent);font-size:13px;margin:3px 0">平均潜力 ' + o.pot + '</div>' : "";
          return '<div class="pick-card' + (this.originId === oid ? " sel" : "") + (locked ? " locked" : "") + '" data-origin="' + oid + '">' +
            '<b>' + (locked ? (window.ICO ? ICO("lock", 13) + " " : "") : "") + o.name + "</b>" + potLine +
            (locked ? '<div class="dim12" style="color:var(--gold)">' + lockText + "</div>" : "") +
            '<div class="dim12">' + (o.desc || "") + "</div></div>";
        }).join("") + "</div></div>" +
        '<div style="margin-bottom:10px"><div style="font-weight:800;margin-bottom:6px">球风 <span class="dim12" style="font-weight:400">· 必选（训练效率 +15% 与评分加成跟着它走）</span></div><div class="chiprow">' +
        styles.map(st => '<button class="chip' + (this.styleId === st.id ? " sel" : "") + '" data-style="' + st.id + '">' + st.name + "</button>").join("") + "</div></div>" +
        '<div class="row"><span style="font-weight:800">球衣号</span><input id="cr-number" type="number" min="1" max="30" step="1" inputmode="numeric" value="' + this.number + '" class="num-input">' +
        '<button class="btn btn-sm btn-ghost" id="cr-numdice">随机</button></div>' +
        '<div class="dim12" style="margin:-4px 0 10px;font-size:11.5px">球衣号限 <b>1 – 30</b> —— 超出范围会退回 9 号。</div>' +
        '<button class="btn btn-primary btn-block mt-12" id="cr-next">完成采访 · 进入体测 ▸</button>';
      form.innerHTML = html;

      /* ★ 姓输入绑定（可输入模式核心）：
         · 组合期间（composing）不清洗 —— 打拼音的中间态（w/wa/wan…）不去动 value，
           否则会打断输入法组合；
         · compositionend / 普通 input 时清洗：提取全部汉字取第一个，非汉字一律丢弃
           ⇒ 「限 1 个汉字」由这里保证（粘贴多字也只留首字）。 */
      const sInp = UIkit.$("#cr-surname");
      let composing = false;
      const syncSurname = () => {
        const m = sInp.value.match(/[\u4e00-\u9fa5]/g);
        const ch = m ? m[0] : "";
        /* ★★★ P258（2026-09-21 用户安全需求）：玩家手输的姓也要过屏蔽名单 ——
           池过滤只覆盖"随机出来的姓"，覆盖不到"输入的姓"。判定函数是 data_real.js 的
           唯一真源（`_nameBlocked`），此处只调用、不复制名单。
           ── 拒绝形态 ── 输入框清空 + 提示 + 姓落回安全值/待随机：
              · 不清空输入框的话，玩家会看到"我明明输了字，游戏里却没有"的静默错位；
              · 姓落空 ⇒ 确认前由 composeName() 随机补（恒为安全名），即"拒绝 = 退回随机"。 */
        const RD = window.REAL_DATA || {};
        if (ch && RD.isNameBlocked && RD.isNameBlocked(ch, "")) {
          sInp.value = "";
          UIkit.toast("这个姓不能用作球员名，请换一个", "red");
          this.surname = "";
          return;
        }
        if (sInp.value !== ch) sInp.value = ch;
        this.surname = ch;
      };
      if (sInp) {
        sInp.addEventListener("compositionstart", () => { composing = true; });
        sInp.addEventListener("compositionend", () => { composing = false; syncSurname(); });
        sInp.addEventListener("input", () => { if (!composing) syncSurname(); });
      }
      const dice = UIkit.$("#cr-dice");
      dice.onclick = UIkit.guard(() => {
        const RD = window.REAL_DATA || {};
        /* ★ 「换一个」只随机**名**；若玩家清空了姓，连姓一起随机补上
           （否则要到确认时才补，玩家当场看不见自己抽到了什么姓）。
           ★★ P258：genGivenName 可能返回**空串**（= 当前这个姓下取不出安全名，
              见 data_real.js 的兜底注释）⇒ 这时连姓一起换成随机安全姓 + 安全名，
              否则玩家会看到"名没了"的空态。 */
        this.given = RD.genGivenName ? RD.genGivenName(undefined, this.surname) : "小野";
        if (!this.surname || !this.given) {
          this.surname = RD.randomSurname ? RD.randomSurname() : "林";
          if (!this.given) this.given = RD.genGivenName ? RD.genGivenName(undefined, this.surname) : "小野";
        }
        if (sInp) sInp.value = this.surname;
        UIkit.$("#cr-given").textContent = this.given;
      }, "换名");
      form.querySelectorAll("[data-pos]").forEach(c => { c.onclick = UIkit.guard(() => { this.position = c.dataset.pos; this.styleId = null; this.render(); }, "选位置"); });
      form.querySelectorAll("[data-origin]").forEach(c => {
        c.onclick = UIkit.guard(() => {
          const oid = c.dataset.origin;
          const o = origins[oid] || {};
          // ★ P97-M1：广告档 id 由 family 改为 genius（足球天才）
          // ★★ P97 M4-4.5：解锁状态改为**跨档持久化**（`Meta.unlockedOriginIds`）。
          //   此前 `_geniusUnlocked` 只是本实例的内存变量 —— 玩家看完广告解锁，
          //   一刷新页面 / 重开档就丢了，等于白看。现在走 META 独立键，永久保留。
          // ★★ P113：sports（体育世家）锁 = 生涯累计 5 冠（Meta.champions），点击提示进度。
          const unlocked = this._geniusUnlocked
            || !!(window.Meta && Meta.hasOrigin && Meta.hasOrigin(oid));
          if (o.adUnlock && !unlocked) {
            if (window.Ads) Ads.show("originFamily", () => {
              this._geniusUnlocked = true;
              try { if (window.Meta && Meta.unlockOrigin) Meta.unlockOrigin("genius"); } catch (err) { /* ignore */ }
              UIkit.toast("隐藏出身「足球天才」已解锁！", "gold");
              this.render();
            });
            else UIkit.toast("看视频后解锁", "");
            return;
          }
          if (o.champUnlock && !unlocked && window.Meta && Meta.champions) {
            const got = Meta.champions() || 0;
            UIkit.toast("体育世家需要生涯累计 " + o.champUnlock + " 次一线队冠军（当前 " + got + "）——每段生涯的冠军都会累积下去", "");
            return;
          }
          this.originId = oid; this.render();
        }, "选出身");
      });
      form.querySelectorAll("[data-style]").forEach(c => { c.onclick = UIkit.guard(() => { this.styleId = c.dataset.style; this.render(); }, "选球风"); });
      const num = UIkit.$("#cr-number");
      /* ★★★ P258（2026-09-21 用户安全需求）：球衣号**严格限定 1–30**。
         ── 旧实现的缺陷 ── `this.number = (v>=1&&v<=30) ? v : 9` 只保证了"越界回落到 9"，
            而 `this.number` 恒为数字 ⇒ 输入框里**显示的还是玩家敲的 `99`**，
            落档却是 9：屏幕与存档不一致（玩家看到的号 ≠ 实际球衣号）。
            更糟的是 `type=number` 允许 `1e3` / `3.5` / `-7` 这类输入。
         ── 新口径 ── 输入按步清洗并**回写输入框**（所见即所得）：
            · 剥掉所有非数字字符（1e3 → 13、3.5 → 35、-7 → 7）；
            · 去前导零（007 → 7）；
            · 取前两位（最多两位数 = 可表达的最大号 30）；
            · 若结果不在 1..30 ⇒ 输入框置空 + 号回落 9（与旧回退值同口径，不凭空发明数字）；
            · 空输入 = 尚未定 ⇒ 框留空、号回落 9（离开输入框时 blur 会补回 9，不留歧义）。 */
      const NUM_MIN = 1, NUM_MAX = 30;
      const sanitizeNumber = (raw, writeBack) => {
        let d = String(raw == null ? "" : raw).replace(/[^\d]/g, "");
        d = d.replace(/^0+/, "").slice(0, 2);
        let v = d ? parseInt(d, 10) : NaN;
        if (!(v >= NUM_MIN && v <= NUM_MAX)) {
          if (writeBack) num.value = "";
          this.number = 9;
          return;
        }
        if (writeBack) num.value = String(v);
        this.number = v;
      };
      num.oninput = () => sanitizeNumber(num.value, true);
      /* blur 是"把语义收干净"的那一次：空输入 → 补默认 9 并回写（不让框停在空态） */
      num.onblur = () => { sanitizeNumber(num.value, true); num.value = String(this.number); };
      UIkit.$("#cr-numdice").onclick = UIkit.guard(() => { this.number = 1 + R.int(0, 29); this.render(); }, "随机号码");
      UIkit.$("#cr-next").onclick = UIkit.guard(() => this.finishInterview(), "完成采访");
    },

    styleGroupOf(pos) { return (CONFIG.POSITIONS[pos] || { group: "ATK" }).group; },

    /* ★ 姓名可输入模式的**唯一收口**：姓空 ⇒ 随机补；name 一律由 姓+名 重组。
       幂等（surname/given 已有值就不再随机），finishInterview 与 confirm 各调一次，
       保证体测报告页与最终存档的姓名永远完整（2-3 字）。
       ★ 全部走 Math.random（经 REAL_DATA），不碰 R 流 —— soak 基线不受影响。 */
    composeName() {
      const RD = window.REAL_DATA || {};
      if (!this.surname) this.surname = RD.randomSurname ? RD.randomSurname() : "林";
      /* ★★★ P258 收口点（第二道）：姓可能是拼写清洗**之后**才落到这里的
         （如程序化赋值 / 未来新增入口），所以随机名到这一步再判一次整串 ——
         命中 ⇒ 名换成安全名（姓是玩家自己的，不擅自动它）。
         ★★ genGivenName 返回空串 = 这个姓下取不出安全名（姓本身命中名单，
            如「习」）⇒ 此时**连姓一起**退回安全名（只换名不够：名池有限，
            任何名与它拼起来都可能命中组合表）。 */
      this.given = RD.genGivenName ? RD.genGivenName(undefined, this.surname) : "小野";
      if (!this.given || (RD.isNameBlocked && RD.isNameBlocked(this.surname, this.given))) {
        /* ① 名取不出来（空串）或整串命中 ⇒ 连姓一起退回安全名。
           ——为什么不能只换名：名池有限，若姓本身命中名单（如「习」），
             任何名与它拼起来都可能命中组合表（实测「习」+「小野」）。 */
        const safe = RD.SAFE_NAME || { surname: "林", given: "小野" };
        this.surname = safe.surname; this.given = safe.given;
        /* ② 输入框同步（composeName 可能在 render 之后才被调用，所见即所得） */
        const sInpNow = UIkit.$("#cr-surname");
        if (sInpNow) sInpNow.value = this.surname;
      }
      this.name = this.surname + this.given;
      return this.name;
    },

    finishInterview() {
      if (!this.originId) { UIkit.toast("先选一个出身", ""); return; }
      /* ★ P113（2026-09-17 用户拍板）：球风**必选** —— 未选不得进体测。
         （球风不是装饰：catBonus +15% 训练效率与评分加成全链读它；切位置时 styleId 已重置为 null，
          所以这里的挡板在"选了位置但没选球风"与"换了位置没重选"两种情形都会生效。） */
      if (!this.styleId) { UIkit.toast("先选一个球风 —— 它决定你的训练方向", ""); return; }
      this.composeName();
      this.step = 5;
      /* ★ P113：初始能力按出身分档（genius 47-53 / sports 42-46 / hotblood 37-41）。
         verdict 文案按三段值域扩展 —— 每档出身看到的体测报告要与「能去哪档青训营」匹配。 */
      const ability = PlayerSystem.rollInitialAbility(this.originId);
      const verdict = {
        53: "球探的报告只有一行字，后面跟着三个感叹号。",
        52: "「五大联赛的梯队应该马上给他打电话。」报告的最后一行写着。",
        51: "试训邀请已经塞满了经纪人老狐的传真机。",
        50: "「这个年纪有这种球感，我从业三十年只见过两次。」",
        49: "体测师反复校准了三次仪器——数字没有错。",
        48: "「轮换阵容？他在哪都是。」青年队教练在报告上签了名。",
        47: "看台上的球探们交换了一个眼神，齐齐在笔记本上落笔。",
        46: "体测报告的封面被标了金滨：重点考察对象。",
        45: "「身体条件是世家给的天赋，剩下的看他自己。」",
        44: "青训总监把你的名字圈了两圈：「下赛季梯队见。」",
        43: "「够得着职业的门框了——伸伸手。」",
        42: "评估栏写着：底子扎实，节奏感是练出来的。",
        41: "球探的报告上只有四个字：立即签约。",
        40: "看台上已经有人开始打听你的名字。",
        39: "球探合上笔记本：\"璞玉。值得赌一把。\"",
        38: "评估栏写着：粗糙，但那双眼睛在发光。",
        37: "这是体测的最低档。但隔壁场地那些 45 分的孩子，眼中没有你这种对胜利的饥渴。",
      };
      const form = UIkit.$("#create-form");
      form.innerHTML = '<div class="panel"><div class="panel-title">赛后体测报告</div>' +
        '<div class="row"><b style="font-size:16px">' + UIkit.esc(this.name) + " · " + ((CONFIG.POSITIONS[this.position] || {}).name || this.position) + '</b><span class="ovr-big" style="font-size:34px;margin-left:auto">' + ability + "</span></div>" +
        '<p style="font-size:13px;line-height:2;color:var(--text-gray)">' + (verdict[ability] || "") + "</p></div>" +
        '<div class="panel" id="cr-talent"></div>' +
        '<button class="btn btn-primary btn-block mt-12" id="cr-story">开始生涯 ▸</button>';
      this.offer = window.TAL ? TAL.roll6(this.position) : [];
      if (window.TAL && this.offer.length) {
        this.renderTalentDraft(UIkit.$("#cr-talent"), ability);
        UIkit.$("#cr-story").onclick = UIkit.guard(() => {
          /* ★ P113：普通 = 选 3；看完「全带走」广告后可选 3~6 个 */
          if (this.picked.size < 3) { UIkit.toast("先从 6 个天赋中选定 3 个"); return; }
          if (!this.allSix && this.picked.size !== 3) { UIkit.toast("普通模式只能选 3 个（看广告可 6 个全拿）"); return; }
          this.talentPicked = [...this.picked];
          if (window.Track) Track.click("BMC002", "T1", "create_confirm_talent");
          this.confirm(ability);
        }, "确认天赋");
      } else {
        UIkit.$("#cr-story").onclick = UIkit.guard(() => {
          if (window.Track) Track.click("BMC002", "T1", "create_confirm");
          this.confirm(ability);
        }, "开始生涯");
      }
    },

    renderTalentDraft(box, ability) {
      const T = TAL.TIER;
      /* ★ P113：offer 结构升级为 [{ id, tier }] —— 档位跟卡走 */
      let cards = "";
      for (const c of this.offer) {
        const t = TAL.byId[c.id], tier = T[c.tier];
        const sel = this.picked.has(c.id);
        /* ★ P168（用户反馈「金银铜标志颜色接近」）：天赋卡加档位描边色（选中时让位
           --accent 选中框）+ 档位徽章改**实底白字**——五档明度一眼可分，不再靠淡色相。 */
        cards += '<div class="pick-card' + (sel ? " sel" : "") + '" data-tid="' + c.id + '"' + (sel ? "" : ' style="border-color:' + tier.card + '"') + ">" +
          '<b style="color:' + (sel ? "var(--gold)" : "var(--text)") + '">' + (sel ? "✓ " : "") + t.name + '</b><span class="tier-chip" style="background:' + tier.solid + ';border-color:' + tier.solid + ';color:#fff;font-weight:800">' + tier.name + "</span>" +
          "<div class='dim12'>" + TAL.descOf(c.id, c.tier) + "</div></div>";
      }
      const maxN = this.allSix ? 6 : 3;
      box.innerHTML = '<div class="panel-title">天赋觉醒 · 六选' + maxN + "</div>" +
        '<div class="dim12" style="margin-bottom:8px">选定 <b style="color:var(--gold)">' + maxN + '</b> 项天赋，伴随整个职业生涯。</div>' +
        '<div class="cardgrid">' + cards + "</div>" +
        '<div class="dim12" style="margin-top:8px">已选定 <b style="color:var(--gold)">' + this.picked.size + " / " + maxN + "</b></div>" +
        '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">' +
        '<button class="btn btn-sm btn-ghost" id="td-free"' + (this.freeRerolls <= 0 ? " disabled" : "") + ">免费刷新 · 剩 " + this.freeRerolls + "</button>" +
        '<button class="btn btn-sm btn-ghost" id="td-ad-reroll" style="border-color:var(--gold);color:var(--gold)">广告刷新 · 保底 2 钻</button>' +
        '<button class="btn btn-sm btn-ghost" id="td-ad-all" style="border-color:var(--gold);color:var(--gold)">广告 · 6 个全拿</button>' +
        "</div>";
      box.querySelectorAll(".pick-card[data-tid]").forEach(c => {
        c.onclick = UIkit.guard(() => {
          const id = c.dataset.tid;
          if (this.picked.has(id)) this.picked.delete(id);
          else if (this.picked.size < maxN) this.picked.add(id);
          else UIkit.toast(this.allSix ? "最多选 6 个" : "最多选 3 个——看广告可 6 个全拿", "");
          this.renderTalentDraft(box, ability);
        }, "选天赋");
      });
      const fr = UIkit.$("#td-free");
      if (fr) fr.onclick = UIkit.guard(() => {
        if (this.freeRerolls <= 0) return;
        this.freeRerolls--;
        this.picked.clear();
        this.offer = TAL.roll6(this.position);
        this.renderTalentDraft(box, ability);
      }, "刷新天赋");
      /* ★★ P113 广告位①：广告刷新 —— 保底 2 个钻石档天赋（不限次；本地预览直发奖） */
      const ar = UIkit.$("#td-ad-reroll");
      if (ar) ar.onclick = UIkit.guard(() => {
        if (window.Ads) Ads.show("talentReroll", () => {
          this.picked.clear();
          this.offer = TAL.roll6(this.position, { guaranteeDiamond: 2 });
          UIkit.toast("天赋已刷新 · 保底 2 个钻石档！", "gold");
          this.renderTalentDraft(box, ability);
        });
        else UIkit.toast("广告能力暂不可用", "red");
      }, "广告刷新天赋");
      /* ★★ P113 广告位②：广告全带走 —— 六选三升级为六选六（不限次；解锁后仍可自由勾选 3~6 个） */
      const aa = UIkit.$("#td-ad-all");
      if (aa) aa.onclick = UIkit.guard(() => {
        if (window.Ads) Ads.show("talentAll", () => {
          this.allSix = true;
          this.picked = new Set(this.offer.map(c => c.id));   // 6 个全选（可再取消勾选）
          UIkit.toast("已解锁 6 个天赋全拿！", "gold");
          this.renderTalentDraft(box, ability);
        });
        else UIkit.toast("广告能力暂不可用", "red");
      }, "广告全拿六天赋");
    },

    confirm(ability) {
      this.composeName();   // ★ 姓可输入模式：确认前最后一次收口（补姓 + 重组全名）
      if (!this.name) this.name = guestPlayerName();
      const data = State.newCareer();
      const origin = (window.IDENTITY && this.originId) ? IDENTITY.origins[this.originId] : null;
      // ★ P97-M1：把出身的**平均潜力**传进建档，作为潜力表均值锁死的目标（P113 起 90 / 85 / 80）
      const potBase = (origin && typeof origin.pot === "number") ? origin.pot : 80;
      data.player = PlayerSystem.create(this.name, this.position, this.nationality, ability, this.number, potBase);
      if (window.TAL) {
        /* ★ P113：offer = [{id, tier}]；天赋 id 进 d.talents、档位进 d.talentTiers（hook 读档取值）。
           兜底分支：未选满 → 按档位 rank 降序取前 3。 */
        const _offer = this.offer || [];
        const _rank = (tier) => (TAL.TIER[tier] || TAL.TIER.bronze).rank;
        const _pick = (this.talentPicked && this.talentPicked.length)
          ? _offer.filter(c => this.talentPicked.indexOf(c.id) >= 0)
          : _offer.slice().sort((a, b) => _rank(b.tier) - _rank(a.tier)).slice(0, 3);
        data.talents = _pick.map(c => c.id);
        data.talentTiers = {};
        for (const c of _pick) data.talentTiers[c.id] = c.tier;
        /* ★ P113：开局生效类天赋（属性 +N / 全属性 / 潜力 +N）—— 在 attrs/pot 生成后一次性应用 */
        TAL.applyOnCreate(data, data.player, window.Potential);
      }
      const style = (window.IDENTITY && this.styleId) ? (IDENTITY.styles[this.styleGroupOf(this.position)] || []).find(s => s.id === this.styleId) : null;
      if (origin) {
        data.origin = { id: origin.id, name: origin.name, fx: origin.fx };
        data.originId = origin.id;   /* ★ P120：平铺一份出身 id —— potential.js effPot / systems.js 出身成本系数读它（读有写，字段写入端门禁） */
        const fx = origin.fx || {};
        if (fx.fameStart) { data.fame += fx.fameStart; data.fans += fx.fameStart * 2; }
        if (fx.skillMovesStart) data.traits.skillMoves = fx.skillMovesStart;
        if (fx.dribblingPlus && CONFIG.ATTRIBUTES.dribbling) {
          // ★ P97 M2：必须判「池内」—— 门将没有盘带类，直接 + 会写出 NaN
          for (const [id] of CONFIG.ATTRIBUTES.dribbling) {
            if (data.player.attrs[id] === undefined) continue;
            data.player.attrs[id] = Math.min(99, data.player.attrs[id] + fx.dribblingPlus);
          }
        }
      }
      if (style) {
        data.playStyle = { id: style.id, name: style.name, cats: style.cats.slice() };
        /* ★★ P157（用户拍板「不同球员风格要有不同的初始属性分配」）：球风不只是训练方向——
           开档就把倾向类别的池内属性 +3（如「站桩中锋」的射门/身体、「清道夫」的防守/传球）。
           · 必须判「池内」（同 dribblingPlus 的老坑：门将没有进攻类，直接 + 会写出 NaN）；
           · OVR 净效应 ≈ +1~2（两类 × 类别权重和），叠加在位置倾向之上 —— 开档即有个性。 */
        for (const cat of (style.cats || [])) {
          const list = (window.Pool && Pool.membersOf) ? Pool.membersOf(data.player.position, cat) : [];
          for (const id of list) {
            if (data.player.attrs[id] === undefined) continue;
            data.player.attrs[id] = Math.min(99, data.player.attrs[id] + 3);
          }
        }
      }
      /* ★★ P129a 跨周目继承注入（用户拍板 T1-T8；P223 口径正名：是「第 N 次生涯」的继承，
         非代际传承）：上一次生涯退役结算算出的继承包在此一次性入账
         —— expPool（×EXP_PER_ABILITY）+ skillPoints。
         · 单源 = Meta.applyLegacyTo（meta.js），刻意不写 expTotal（防等级奖励复利）；
         · data.metaLegacy 落档供后续展示（档案页「第 N 次生涯」）；
         · 产业继承（biz）P129b 启用。 */
      try {
        const _lg = (window.Meta && Meta.applyLegacyTo) ? Meta.applyLegacyTo(data) : null;
        if (_lg) data.metaLegacy = _lg;
      } catch (err) { console.warn("meta legacy apply", err); /* 传承失败不阻断建档 */ }
      this.pendingOffers = this.genInitialOffers(ability);
      this.showSigning();
    },

    genInitialOffers(ability) {
      const pool = [];
      const LG = window.D ? D() : (window.LD ? LD() : { leagues: {} });
      const leagues = LG.leagues || LG;
      for (const lid of ["csl", "chinaleague"]) {
        const lg = leagues[lid];
        if (!lg) continue;
        for (const t of lg.teams) pool.push({ t, lid });
      }
      pool.sort((a, b) => (b.t.strength || 60) - (a.t.strength || 60));
      const third = Math.max(1, Math.floor(pool.length / 3));
      const bands = [pool.slice(0, third), pool.slice(third, third * 2), pool.slice(third * 2)];
      const offers = [];
      for (const band of bands) {
        if (!band.length) continue;
        const { t, lid } = band[R.int(0, band.length - 1)];
        const wage = Career.wageOf(ability, t.strength || 60, R.next());
        offers.push({ club: t, lid, lg: leagues[lid], wage });
      }
      return offers;
    },

    /* ══════════════════════════════════════════════════════════════════════════════
       ★★★ P99 批 4c ②：**青训三路入口**（建档流程内三选一；team-lead Q1 裁定）
       ------------------------------------------------------------------------------
       设计依据：§4.1（流程把"青训营邀约"插在天赋之后）/ §4.2（三路 = A 本土 / B 五大 /
                 C 天才跳级；★"三路"是玩家分类，"六档"才是参数载体）/ §4.6（C 档）/
                 §3.3.1（空白态 `Youth.isBlank`）。

       ★★ 本批只做**接线**（team-lead 原话："先 ①②（入口与出口，让『可达』成立）"）：
          目标是让青训期**可达**，且下面**四者一致**：
              `d.phase` / `d.youth.academyId` / 青年队 id / 青年联赛 id。
       ★★ 以下三件**不在本批**（各有归属，别在这里补半截 —— 补半截 = 静默的假实现）：
            · §4.3 **邀约分分档器**（`A = 2×(ability−37) + 出身分 + 天赋分 + 位置稀有分`）
              —— 需要 A15 标定值 ⇒ 后续批次；
            · §4.5 **「试训冲更高一档」**（一次性风险决策 + `trialFailed` 的 5 轮代价）
              —— 同上，且它要改 `MISS_ROUNDS` 的出场判定；
            · §4.4 **三档数字可视化**（训练条件 / 出头难度 / 出道平台 三星制）—— UX 口径。
         ⇒ 故本批三条路由**由玩家显式选择**、母队从**设计稿给定的池**里抽，
           而不是"由邀约分授予"。
           ★★ **登记（不在工程侧裁决）**：这会让 §4.3 明确要防的支配策略
             （"所有人都选豪门"）**在本批仍然存在**。它是**已知的临时状态**，不是遗漏；
             A15 回填后由分档器接管。此刻**不能**用"工程侧自己发明一条邀约线"来堵它 ——
             那会把"待标定的设计参数"偷偷变成实现事实（A15 的整个意义就是防这个）。

       ★★★ 池的门槛数字（74 / 86）**抄自设计稿 §4.2 的表格**，不是工程侧发明的阈值：
             · 本土青训 A1 = `csl` ≥ **74**（原文举例：恒大 78 / 国安 76 / 齐鲁橙狮 74）
             · 五大青训 B1 = 五大联赛 ≥ **86**（原文举例：曼德里白舰/巴塞罗纳 91 / 慕城红星 92 / 棉都蓝月 88 / 雾都蓝狮 89）
             · 天才跳级 C  = 「同 B1/A1 池」（§4.2 表原文）
       为什么**没**落进 `CONFIG`（与 A15 纪律一致）：
         · 它们不是标定值，是**结构性门槛**（来自设计表格的定性分档）；
         · 更要紧的是：`CONFIG.YOUTH.ACADEMY` 目前在 `config.js` 里**根本不存在**（A15 待标定），
           而 `Career._forceYouthExit` 会**看它的存在性**来决定"要不要报『三支尚未实装』"。
           工程侧若为放这两个数字而先造一个 `CONFIG.YOUTH.ACADEMY` 空壳，那条警告会
           **假装消失** —— "配置存在"被误当成"功能存在"，比缺配置更坏。
         ⇒ 数字留在这里 + 出处逐条写清；A15 回填时**连同 §4.6 的建议一起**搬进 CONFIG。
       ══════════════════════════════════════════════════════════════════════════════ */
    YOUTH_ROUTES: [
      {
        key: "A1", label: "本土青训营", tier: "A1", jumpEntry: false,
        leagues: ["csl"], line: 74,
        blurb: "中超强队的青训梯队 · 中国青年联赛 · 出头快，平台在本土",
      },
      {
        key: "B1", label: "五大青训营", tier: "B1", jumpEntry: false,
        leagues: ["epl", "laliga", "bundesliga", "seriea", "ligue1"], line: 86,
        blurb: "五大联赛豪门梯队 · 该国青年联赛 · 训练条件好，但抢位置的人多",
      },
      {
        key: "C", label: "天才跳级", tier: "C", jumpEntry: true,
        /* ★ 池 = A1 ∪ B1（§4.2 表"同 B1/A1 池"逐字取）—— P113 起由 `poolFrom` **真正实现**。
           ★★ P113（2026-09-17）修**玩家可达缺陷**：旧实现 `leagues 全量 + line: null` =
             csl+五大 **112 支队全量池**，而青年表只给各联赛**前 16 强**派生
             （youth_data.js TEAMS_PER_LEAGUE，五大第 17 名以后没有青年队）⇒
             genYouthOffer 抽中无青年队的弱队 ⇒ revealYouth 报「名册异常：找不到这支母队的
             青年队」⇒ 签约 modal 卡死、玩家只能刷新（缺口 16/112 ≈ 14% —— 每次选跳级
             约 1/7 概率踩中）。smoke A[C] 在 P112 R 序漂移后首次踩中（fixed seed 抽中缺口队）。
             修法 = 回归 §4.2 已裁决口径：C 池 = A1∪B1 的池（这些队全部有青年队映射 ——
             A1/B1 路入营本身就在用它们）。门槛 `youthGateOf`、抽签 `genYouthOffer`、
             门槛线 `youthLineOf` 三者仍共走 `youthPoolOf`（P107"同一个池"纪律不破）。
           ★★★ 登记（**不裁决**，沿用 P99）：§4.6 的**建议**写"跳级只在 `A1` 与 `B2` 两档
             提供"，而 §4.2 的**表**写"C = 同 B1/A1 池" —— 两处对不上（`B1` vs `B2`）。
             本批取 §4.2 的表（"三路并行"的正文口径）；若哪天真按 §4.6 收窄，
             **只改 poolFrom 即可**（门槛/抽签/门槛线自动同源跟随），
             而改之前它正是 R3 反向测试（跳级签豪门 + 三年零出场不许永久卡死）的入口。 */
        poolFrom: ["A1", "B1"],
        blurb: "直接签一线队学徒合同 · 出场要拼真实 OVR · 极稀有",
      },
    ],

    /** 路由的**母队候选池**（成年队对象，**data 顺序** —— 排序与抽签由调用方负责）。
     *  ★★ P107：抽签（genYouthOffer）与门槛计算（youthLineOf）必须看**同一个池** ——
     *     各写一份筛选 ⇒ 门槛按 A 池算、实抽在 B 池，门槛与体验脱节（双源）。
     *  ★ 本函数**零 R 消耗**（纯读 LD()/D()）—— 渲染三条路由卡时不消耗随机流是刻意设计。 */
    youthPoolOf(route) {
      /* ★★ P113：`poolFrom` 路由 = 引用其他路由池的**并集**。
         单源不破：门槛（youthGateOf）与抽签（genYouthOffer）仍共走本函数
         （P107"抽签与门槛必须看同一个池"纪律对 C 路同样成立）。 */
      if (route.poolFrom && route.poolFrom.length) {
        const merged = [];
        for (const key of route.poolFrom) {
          const src = this.YOUTH_ROUTES.filter(function (x) { return x.key === key; })[0];
          if (src) merged.push(...this.youthPoolOf(src));
        }
        return merged;
      }
      const LG = window.D ? D() : (window.LD ? LD() : { leagues: {} });
      const leagues = LG.leagues || LG;
      const pool = [];
      for (const lid of route.leagues) {
        const lg = leagues[lid];
        if (!lg || !lg.teams) continue;
        for (const t of lg.teams) {
          if (route.line !== null && !(typeof t.strength === "number" && t.strength >= route.line)) continue;
          /* ★★ P295（Tap 玩家反馈「青训营名单异常：找不到这只母队的青年队」）：
             本池此前只按强度线过滤，**没查青年队映射** —— youth_data.js 每联赛只派生
             前 16 强（TEAMS_PER_LEAGUE=16），五大 17-20 名里强度 ≥ 档位线的队照样进池；
             genYouthOffer 抽中即 youthFullPoolOf 不认、academyOf 命中 0 → 显式报错。
             （youthFullPoolOf 一直有这层过滤，两池口径漂移是根因。）
             ★ 纯读零 R 消耗；youthLineOf（门槛线）随之改用"有映射的队"计算 ——
             语义修正为设计稿口径「该路由池内最低**青年队**强度」。 */
          if (window.Youth && Youth.academyOf && !Youth.academyOf(t.id)) continue;
          pool.push({ t: t, lid: lid });
        }
      }
      return pool;
    },

    /* ★★ P113-c（2026-09-17 用户拍板）：**广告指定的全联赛池**。
       ── 用户反馈 ── 「看广告后可以选择的青训营太少了，德甲只有慕城红星、法甲只有花都」
         —— showClubPicker 原来复用 youthPoolOf（档位强度线过滤：A1≥74 / B1≥86），
         把广告指定范围压到了寥寥几支豪门。
       ── 新口径 ── 广告指定 = 该路由 leagues 的**全部有青年队的球队**。
         青年表的派生边界（youth_data.js TEAMS_PER_LEAGUE=16）就是"全联赛青训营"的
         真实范围：中超全量 16 队、五大各取前 16 强（德甲 16 支 / 法甲 16 支…都可选），
         第 17 名以后的成年队没有青年队映射（Youth.academyOf 命中 0），列出来也入不了营。
       ── 与 youthPoolOf 的关系 ── fullPool ⊇ pool（≥档位线的队必在前 16 强内）；
         邀约三带（showYouthInvites）与门槛线（youthLineOf）**仍走** youthPoolOf ——
         档位感是邀约系统的设计语义，广告指定是玩家花广告买来的更大自由度，两者不混。
       ★ 本函数**零 R 消耗**（纯读 + Youth.academyOf 形状匹配）。 */
    youthFullPoolOf(route) {
      const leaguesOf = (r) => (r.poolFrom && r.poolFrom.length)
        ? r.poolFrom.map(k => this.YOUTH_ROUTES.filter(x => x.key === k)[0]).filter(Boolean)
        : [r];
      const LG = window.D ? D() : (window.LD ? LD() : { leagues: {} });
      const leagues = LG.leagues || LG;
      const pool = [];
      const seen = new Set();
      for (const r of leaguesOf(route)) {
        for (const lid of r.leagues) {
          const lg = leagues[lid];
          if (!lg || !lg.teams) continue;
          for (const t of lg.teams) {
            if (seen.has(t.id)) continue;
            seen.add(t.id);
            /* 只收**有青年队映射**的队（= 青年表派生的每联赛前 16 强）——
               没映射的队选了会在 revealYouth 报「名册异常」，不列出来（宁缺毋滥）。 */
            if (!(window.Youth && Youth.academyOf && Youth.academyOf(t.id))) continue;
            pool.push({ t: t, lid: lid });
          }
        }
      }
      return pool;
    },

    /** 青年队**派生强度**：与 `youth_data.js` 的派生公式**逐位同式**
     *  （参数已上收到 CONFIG.YOUTH，见 config.js 的 STRENGTH_OFFSET / STRENGTH_FLOOR 注释）。
     *  ★ 两处公式不同步 = 门槛算出一个**不存在的**梯队强度 ⇒ 玩家看到"够得着"却永远踢不上。 */
    youthStrengthOf(adultStrength) {
      const Y = (window.CONFIG && CONFIG.YOUTH) || {};
      const off = (Y.STRENGTH_OFFSET != null) ? Y.STRENGTH_OFFSET : -20;
      const fl = (Y.STRENGTH_FLOOR != null) ? Y.STRENGTH_FLOOR : 30;
      const base = (typeof adultStrength === "number") ? adultStrength : 60;  // 强度缺失口径同 genInitialOffers 的 `|| 60`
      return Math.max(fl, base + off);
    },

    /* ══════════════════════════════════════════════════════════════════════════════
       ★★★ P107（2026-09-17 用户拍板）：**青训营入营能力门槛**
       ------------------------------------------------------------------------------
       用户反馈（实测截图）：14 岁 / OVR 38 的玩家点了「五大青训营」（池内最弱梯队
       首发线 52），进去后整季「未出场」，媒体头条写"训练场才是你的比赛"。
       这种档位**不该是可以选的**。
       ── 口径 ──
         `line` = 该路由池内**最低**青年队强度 − CONFIG.MATCH_STARTER_GAP
                  （引擎的首发判定就是 `ovr >= 球队强度 - GAP`，match.js 赛前判定 —— 同一个数）
         `gap`  = line − ovr
         `verdict`：gap ≤ 0          ⇒ "ok"     能争首发
                    0 < gap ≤ GRACE  ⇒ "bench"  可选，但大概率从替补打起（标注）
                    gap > GRACE      ⇒ "locked" 置灰不可选（写明差距）
       ★ 取"池内最低强度"而非"抽中的那支"：卡渲染阶段**不许消耗 R**
         （抽母队发生在点击之后，R 消耗序被 soak 基线看守）⇒ 只能用不耗 R 的确定性下界。
         最低强度 = 该档最宽容的判定，不会误锁。
       ★ 为什么需要 GRACE：纯首发线会把**全部**玩家关在门外（本土档线 40、玩家值域 38–42）。
         标定见 CONFIG.YOUTH.GATE。数值可用 tools/_p107_lifecycle_audit.js 的 R2 复算。
       ══════════════════════════════════════════════════════════════════════════════ */
    youthLineOf(route) {
      const pool = this.youthPoolOf(route);
      if (!pool.length) return null;
      let mn = Infinity;
      for (const x of pool) { const s = this.youthStrengthOf(x.t.strength); if (s < mn) mn = s; }
      const gap = (window.CONFIG && CONFIG.MATCH_STARTER_GAP != null) ? CONFIG.MATCH_STARTER_GAP : 14;
      return mn - gap;
    },

    youthGateOf(route, ovr) {
      const line = this.youthLineOf(route);
      if (line == null) return null;
      const G = ((window.CONFIG && CONFIG.YOUTH && CONFIG.YOUTH.GATE) || {}).GRACE;
      const grace = (G != null) ? G : 10;
      const gap = line - ovr;
      return { line: line, ovr: ovr, gap: gap, grace: grace,
        verdict: gap <= 0 ? "ok" : (gap <= grace ? "bench" : "locked") };
    },

    /** 从「设计稿给定的池」里为某条青训路由抽一支**母队**（成年队）。
     *  返回 null = 池空 / 数据缺失 —— 调用方**必须显式报错**，不许静默降级
     *  （静默降级成"职业签约"会让玩家以为入了营，而 `d.phase` 其实没动）。
     *  ★ 只回**成年队**对象与 id；青年队 id / 青年联赛 id 由 `Youth.academyOf` 反查
     *    （该函数是"成年→青年"命名映射的唯一入口，理由见 youth.js 的注释）。
     *  ★ 抽签与 `genInitialOffers` 同手法（排序后 `R.int`），**但池按"档位门槛"筛**，
     *    不是按实力三等分 —— 两个函数不要互相"统一"，它们的池语义不同。
     *  ★★ P107：池构造已抽到 `youthPoolOf`（与门槛计算共用）；本函数的排序键、
     *     `R.int` 调用位置与次数**逐位未变** —— soak 基线守它。 */
    genYouthOffer(routeKey) {
      const r = this.YOUTH_ROUTES.filter(function (x) { return x.key === routeKey; })[0];
      if (!r) return null;
      const pool = this.youthPoolOf(r);
      if (!pool.length) return null;
      pool.sort(function (a, b) { return (b.t.strength || 60) - (a.t.strength || 60) || (a.t.id < b.t.id ? -1 : 1); });
      const pick = pool[R.int(0, pool.length - 1)];
      return { route: r, club: pick.t, lid: pick.lid, adultId: pick.t.id };
    },

    showSigning() {
      /* ★★★ 年龄门（2026-09-16 用户拍板）：开局 = 14 岁青训起步 ⇒ 创建页**只给青训营路**，
         「职业一线队报价」与 C 路「天才跳级」都不再渲染。
         ── 根因（用户实测截图）── 14 岁玩家点了并列的 C 路卡（文案「青训营 · 天才跳级」/
         按钮「正式入营 · 开启青训之路」）⇒ `Youth.jump` ⇒ **在一线队注册**（P99 设计如此）⇒
         打意甲一线队赛程 ⇒ `d.stats.apps=1` ⇒ 「首秀之夜」章回弹出 —— 玩家以为进了青训营，
         实际 14 岁就踢上了一线队。职业报价卡同理（14 岁签职业合同不成立）。
         ── 边界 ──
           · `genInitialOffers` 的调用点（184 行）**不动**：R 消耗序逐位不变（soak 基线守它），
             14 岁下 pendingOffers 照常生成、只是不渲染；
           · C 路在 16+ 面板保留（A15 邀约分标定后由分档器接管，代码不删）；
           · 滤除后路由为空的兜底：恢复全量路由，玩家必须有路可走。 */
      const _d = State.data;
      const isKid = !!(_d && _d.player && _d.player.age < 16);   // 16 岁起才有职业合同资格
      /* ★★ P107：青训营门槛要用玩家的**真实 OVR** —— 真值源 = PlayerSystem.overall
         （与顶栏 hud-ovr、match.js 的首发判定同源；不自己算属性权重）。 */
      const _ovr = (_d && _d.player && window.PlayerSystem) ? PlayerSystem.overall(_d.player) : 0;
      const offers = this.pendingOffers || [];
      if (!isKid && !offers.length) { const o = this.genInitialOffers(40)[0]; this.pendingOffers = [o]; this.reveal(0); return; }
      const coachQuotes = [
        "\"签了它，然后在我面前赢得一件主力球衣。\"",
        "\"我要的不是一个天才，是一个不怕从零开始的人。\"",
        "\"一线队的门没锁——就看你敢不敢推开。\"",
        "\"青训教练说你像块海绵。来我这儿，我教你吸什么。\"",
      ];
      let cards = "";
      if (!isKid) offers.forEach((o, i) => {
        cards += '<div class="pick-card" data-offer="' + i + '"><b>' + o.club.name + '</b>' +
          '<div class="dim12">' + o.lg.name + " · 周薪 " + Career.fmtMoney(o.wage) + " · 俱乐部实力 " + (o.club.strength || 60) + "</div>" +
          '<div class="dim12" style="font-style:italic">' + coachQuotes[i % coachQuotes.length] + "</div></div>";
      });
      /* ★★★ P99 批 4c ②：青训三路卡（**与三份职业报价并列**）。
         ★ 为什么是"并列"而不是"替换"：§4.1 的正稿是"整套替换为青训营分档器"，
           但那要 §4.3 的邀约分（A15 待标定）⇒ 本批若照字面替换，等于用一条
           **未标定的**规则去决定所有新档的起点（把待标定参数偷变成现实）。
         ⇒ 本批：两条路都摆出来，**由玩家选**；"哪一屏 / 什么顺序 / 文案"是 UX 口径（已登记）。
         ★ 三条路由卡的渲染**不消耗 R**（抽母队发生在点击之后）——
           这一点是刻意的：职业签约路径的 R 消耗序必须逐位不变（soak 基线守它）。
         ★★ 2026-09-16 修订：14 岁创建页滤除 C 路（jumpEntry）—— 见函数头年龄门注释。
         ★★★ P107（2026-09-17）：**加能力门槛** —— 每条路由标出「首发线 / 你的 OVR / 差距」，
           够不着（gap > GRACE）的**置灰不可选**。理由见 Create.youthGateOf 的函数头注释。 */
      let youthCards = "";
      const routes = this.YOUTH_ROUTES.filter(r => !isKid || !r.jumpEntry);
      (routes.length ? routes : this.YOUTH_ROUTES).forEach((r) => {
        const g = this.youthGateOf(r, _ovr);
        const locked = !!(g && g.verdict === "locked");
        /* ★ P176：三档门槛徽章改 promise-badge 实底白字（原 tier-chip 淡字白卡隐形——
           「能争首发」用 --mint #e8f6ea 当文字色，与 P168「承诺主力」同款病灶）。
           底色与青训邀约页的承诺三态同口径：能争首发=深绿 / 大概率替补=金 / 够不着=红。 */
        const chip = !g ? "" :
          (g.verdict === "ok"
            ? '<span class="promise-badge" style="background:var(--accent-dark)">能争首发</span>'
            : g.verdict === "bench"
              ? '<span class="promise-badge" style="background:var(--gold)">大概率替补</span>'
              : '<span class="promise-badge" style="background:var(--danger)">够不着</span>');
        const lineTxt = g ? " · 首发线 " + g.line + "（你 " + g.ovr + "）" : "";
        const note = !g ? "" :
          (g.verdict === "ok"
            ? '<div class="dim12" style="margin-top:5px">以你现在的能力，入营就能争首发。</div>'
            : g.verdict === "bench"
              ? '<div class="dim12" style="margin-top:5px">够得着，但要从替补打起 —— 出场要靠训练抢回来。</div>'
              : '<div class="dim12" style="margin-top:5px;color:var(--danger)">这一档最弱的一支梯队，首发线也在 '
                + g.line + '，你目前 ' + g.ovr + '（差 ' + g.gap + ' 点）。去了大概率整季踢不上球 ——'
                + '先在本土打出身价，再往上走更实际。</div>');
        youthCards += '<div class="pick-card' + (locked ? " locked" : "") + '" data-youth="' + r.key + '"'
          + (locked ? ' data-locked="1"' : "") + ">" +
          '<b>青训营 · ' + r.label + chip + "</b>" +
          '<div class="dim12">' + r.blurb + lineTxt + "</div>" + note + "</div>";
      });
      const modalTitle = isKid ? "<h3>青训营的门开了</h3>" : "<h3>三份报价，一个决定</h3>";
      const lead = isKid
        ? '<div style="font-size:13.5px;line-height:1.9;margin-bottom:12px">' + UIkit.esc(this.name) + "，球探们当晚就在看台上。先签一份<b style='color:var(--gold)'>学徒合同</b>——一线队的门，要用梯队表现自己去推开。</div>"
        : '<div style="font-size:13.5px;line-height:1.9;margin-bottom:12px">' + UIkit.esc(this.name) + "，决赛夜的采访播出之后，三家俱乐部的电话同时打了进来。<b style='color:var(--gold)'>选个对的，不只是选个贵的。</b></div>";
      const altLine = isKid ? "" : '<div class="dim12" style="margin:12px 0 6px">或者 —— 不急着进一线队，先从青训营开始：</div>';
      UIkit.modal(modalTitle +
        lead +
        '<div class="cardgrid">' + cards + "</div>" +
        altLine +
        '<div class="cardgrid">' + youthCards + "</div>", { dismissable: false });
      document.querySelectorAll("[data-offer]").forEach(c => {
        c.onclick = UIkit.guard(() => { UIkit.closeModal(); this.reveal(+c.dataset.offer); }, "选报价");
      });
      document.querySelectorAll("[data-youth]").forEach(c => {
        /* ★★ P107：置灰卡（能力够不着）不给"入营"入口 —— 点击只解释差距。
           为什么不隐藏：玩家该**看见**目标（首发线 52 / 你现在 38），
           这是"分档教育"而不是"欺骗性摆放"（与 §4.4 三档数字可视化同精神）。 */
        if (c.dataset.locked === "1") {
          c.onclick = UIkit.guard(() => {
            const r = this.YOUTH_ROUTES.filter(x => x.key === c.dataset.youth)[0];
            const g = r ? this.youthGateOf(r, _ovr) : null;
            UIkit.toast(g
              ? ("够不着这一档：首发线 " + g.line + "，你 " + g.ovr + "（差 " + g.gap + " 点）")
              : "该档位暂不可选", "red");
          }, "青训营不可选");
          return;
        }
        c.onclick = UIkit.guard(() => { UIkit.closeModal(); this.showYouthInvites(c.dataset.youth); }, "选青训营");
      });
    },

    /* ══════════════════════════════════════════════════════════════════════════════
       ★★★ P113（2026-09-17 用户拍板）：**青训三份邀约 + FM 式评价 + 广告指定球队**
       ------------------------------------------------------------------------------
       ── 流程 ── 选定路由（本土 A1 / 五大 B1）后**不再直接抽一支队入营**，而是先收到
         **三份符合档位的邀约**：每份 = 母队 + 出场承诺 + 学徒周薪 + FM 式评价与期许；
         玩家选一份加入；或看广告「指定同档位任一球队」（中超直选队；五大先选联赛再选队）。
       ── 三份的抽法 ── 池按强度降序**三等分**，每带各抽 1（与 genInitialOffers 同手法）
         ⇒ 强 / 中 / 弱各一支，玩家面对真实的档内选择。
       ── 出场承诺（CONFIG 单源数字）──
           主力 = OVR ≥ 青年队强度 − MATCH_STARTER_GAP(14)
           轮换 = OVR ≥ 上述线 − MATCH_ROTATION_GAP(4)
           替补 = 其余（文案「替补竞争」）
       ── FM 式评价（与薪资强关联；判据 = 出身潜力均值 player._potBase，含 ceiling 天赋上抬）──
           pot ≥ 88 超级新星（薪资 ×1.3）｜ pot ≥ 82 未来之星（×1.15）｜ 其余 年轻球员（×1.0）
       ── 薪资 ── 学徒周薪 = max(FLOOR, wageOf(ovr, 强度, 0.5) × RATE × TIER_K[档位] × 评价系数)
           ★ 随机位固定 0.5（确定性）：同一支球队对同一玩家永远同一份报价 ——
             「评价 ↔ 薪资」是可读的合同条款，不是掷骰结果。
       ── R 消耗纪律 ── 邀约 modal 渲染零消耗；三带抽队发生在**点击路由卡之后**
         （与 genYouthOffer 同时机，soak 基线守的"渲染不耗 R"不变）。
       ══════════════════════════════════════════════════════════════════════════════ */
    youthWageQuote(route, club, ovr) {
      const Y = (window.CONFIG && CONFIG.YOUTH && CONFIG.YOUTH.WAGE_BASE) || { RATE: 0.35, FLOOR: 500, TIER_K: {} };
      const K = Y.TIER_K[route.tier] != null ? Y.TIER_K[route.tier] : 0.25;
      const pot = (State.data && State.data.player && State.data.player._potBase) || 80;
      const grade = pot >= 88 ? { key: "superstar", name: "超级新星", mult: 1.3 }
        : pot >= 82 ? { key: "star", name: "未来之星", mult: 1.15 }
        : { key: "youth", name: "年轻球员", mult: 1.0 };
      const wage = Math.max(Y.FLOOR || 500,
        Math.round(Career.wageOf(ovr, club.strength || 60, 0.5) * (Y.RATE != null ? Y.RATE : 0.35) * K * grade.mult));
      return { wage, grade };
    },

    youthPromiseOf(route, club, ovr) {
      const yStr = this.youthStrengthOf(club.strength);
      const gap = (window.CONFIG && CONFIG.MATCH_STARTER_GAP != null) ? CONFIG.MATCH_STARTER_GAP : 14;
      const rot = (window.CONFIG && CONFIG.MATCH_ROTATION_GAP != null) ? CONFIG.MATCH_ROTATION_GAP : 4;
      const starter = yStr - gap, rotation = starter - rot;
      if (ovr >= starter) return { key: "starter", name: "承诺主力", note: "以你现在的能力入营即争首发——教练组把你当梯队核心培养。", line: starter };
      if (ovr >= rotation) return { key: "rotation", name: "承诺轮换", note: "梯队轮换名单里有你的位置，表现好随时顶上去。", line: rotation };
      return { key: "bench", name: "替补竞争", note: "要从替补打起——出场时间得靠训练自己抢回来。", line: rotation };
    },

    showYouthInvites(routeKey) {
      const r = this.YOUTH_ROUTES.filter(x => x.key === routeKey)[0];
      if (!r) return;
      const _d = State.data;
      const ovr = (_d && _d.player && window.PlayerSystem) ? PlayerSystem.overall(_d.player) : 0;
      const pool = this.youthPoolOf(r);
      if (!pool.length) { UIkit.toast("该档位暂时没有可选的球队", "red"); return; }
      /* 三带各抽 1（R 消耗 3 次 —— 点击后，安全）；带空则复用相邻带 */
      pool.sort((a, b) => (b.t.strength || 60) - (a.t.strength || 60) || (a.t.id < b.t.id ? -1 : 1));
      const third = Math.max(1, Math.ceil(pool.length / 3));
      const bands = [pool.slice(0, third), pool.slice(third, third * 2), pool.slice(third * 2)].filter(b => b.length);
      const invites = [];
      for (let i = 0; i < 3; i++) {
        const band = bands[Math.min(i, bands.length - 1)];
        invites.push(band[R.int(0, band.length - 1)]);
      }
      const GRADE_NOTE = {
        superstar: "球探主管在报告上写：这是一个值得为他重建青训营的孩子。",
        star: "梯队教练组一致认为：给他两个赛季，他能站上一线队名单。",
        youth: "一份标准的学徒合同——能不能留下，看你自己。",
      };
      /* ★ 联赛名读取与 youthPoolOf 同款兜底（D() 是包装对象 {leagues}，LD() 是映射本身） */
      const _LG = window.D ? D() : (window.LD ? LD() : { leagues: {} });
      const _leagues = _LG.leagues || _LG;
      let cards = "";
      invites.forEach((p, i) => {
        const q = this.youthWageQuote(r, p.t, ovr);
        const pr = this.youthPromiseOf(r, p.t, ovr);
        /* ★ P168（用户反馈「承诺主力几个字看不清，颜色和边框都很淡」）：
           出场承诺从淡色文字升级为**实底徽章**——旧 starter 用 var(--mint)（#e8f6ea 浅绿）
           当文字色，白卡上几乎隐形。徽章实底 + 白字 + 硬阴影，三档色相明度全拉开
           （主力=深绿 / 轮换=金 / 替补=警示红）。 */
        const prBadge = pr.key === "starter"
          ? '<span class="promise-badge" style="background:var(--accent-dark)">承诺主力</span>'
          : pr.key === "rotation"
            ? '<span class="promise-badge" style="background:var(--gold)">承诺轮换</span>'
            : '<span class="promise-badge" style="background:var(--danger)">替补竞争</span>';
        const lgName = (_leagues[p.lid] || {}).name || p.lid;
        cards += '<div class="pick-card" data-yinvite="' + i + '">' +
          '<b>' + p.t.name + '</b>' +
          '<span class="tier-chip" style="color:var(--gold);border-color:var(--line)">' + q.grade.name + "</span>" +
          '<div class="dim12">' + lgName + " · 青年梯队强度 " + this.youthStrengthOf(p.t.strength) + "</div>" +
          '<div class="dim12" style="margin:4px 0">' + prBadge + " · 学徒周薪 <b style='color:var(--gold)'>" + Career.fmtMoney(q.wage) + "</b></div>" +
          '<div class="dim12" style="font-style:italic">' + GRADE_NOTE[q.grade.key] + "</div>" +
          '<div class="dim12">' + pr.note + "</div></div>";
      });
      UIkit.modal("<h3>三份青训邀约 · " + r.label + "</h3>" +
        '<div style="font-size:13px;line-height:1.9;margin-bottom:12px"> scout 网络连夜送来了三份<b style="color:var(--gold)">学徒合同</b>。评价越高、平台越大，位置竞争也越狠——选一份，或者指定你想去的地方。</div>' +
        '<div class="cardgrid">' + cards + "</div>" +
        '<button class="btn btn-ghost btn-block mt-12" id="y-ad-pick" style="border-color:var(--gold);color:var(--gold)">看广告 · 指定加入任一联赛球队青训营</button>',
        { dismissable: false });
      document.querySelectorAll("[data-yinvite]").forEach(c => {
        c.onclick = UIkit.guard(() => { UIkit.closeModal(); this.revealYouth(routeKey, invites[+c.dataset.yinvite]); }, "接受邀约");
      });
      const adBtn = UIkit.$("#y-ad-pick");
      if (adBtn) adBtn.onclick = UIkit.guard(() => {
        /* ★★ P113-c：广告指定范围 = **全联赛**（该路由 leagues 内全部有青年队的球队），
           不再是档位线过滤后的几支豪门——邀约三带仍走档位池（pool），两条通道语义分开。 */
        const fullPool = this.youthFullPoolOf(r);
        if (!fullPool.length) { UIkit.toast("该联赛暂无可指定的青训营", "red"); return; }
        if (window.Ads) Ads.show("youthPickClub", () => this.showClubPicker(routeKey, fullPool));
        else UIkit.toast("广告能力暂不可用", "red");
      }, "广告指定青训球队");
    },

    /** ★ P113-c：广告指定球队选择器（本土 = 直接列队；五大 = 先选联赛再选队）。
     *  池 = youthFullPoolOf（该联赛全部有青年队映射的球队——每联赛前 16 强）。 */
    showClubPicker(routeKey, pool) {
      const r = this.YOUTH_ROUTES.filter(x => x.key === routeKey)[0];
      if (!r) return;
      /* 多联赛判定：按路由实际联赛数（A1=中超 1 个；B1=五大 5 个；C=并集 6 个），
         不再只认 B1 —— C 路跳级的指定器同样是两级选择。 */
      const multi = r.leagues.length > 1;
      const renderList = (lid) => {
        const teams = pool.filter(p => p.lid === lid).sort((a, b) => (b.t.strength || 60) - (a.t.strength || 60));
        const _LG = window.D ? D() : (window.LD ? LD() : { leagues: {} });
        const _leagues = _LG.leagues || _LG;
        const lgName = (_leagues[lid] || {}).name || lid;
        let html = "<h3>选择青训营 · " + lgName + "</h3>" +
          '<div style="font-size:12.5px;line-height:1.8;margin-bottom:10px">以下为该联赛<b style="color:var(--gold)">全部青训营</b>（' + teams.length + " 支），点选即入营。</div>" +
          '<div class="chiprow" style="margin-bottom:10px">' +
          (multi ? r.leagues.map(l => '<button class="chip' + (l === lid ? " sel" : "") + '" data-lgchip="' + l + '">' + ((_leagues[l] || {}).short || l) + "</button>").join("") : "") +
          "</div>" +
          '<div class="cardgrid">' + teams.map((p, i) =>
            '<div class="pick-card" data-pickclub="' + p.t.id + '" data-picklid="' + p.lid + '"><b>' + p.t.name + "</b>" +
            '<div class="dim12">梯队强度 ' + this.youthStrengthOf(p.t.strength) + " · 母队一线队强度 " + (p.t.strength || 60) + "</div></div>").join("") + "</div>" +
          '<button class="btn btn-ghost btn-block mt-10" id="pc-back">返回邀约</button>';
        UIkit.modal(html, { dismissable: false });
        document.querySelectorAll("[data-pickclub]").forEach(c => {
          c.onclick = UIkit.guard(() => {
            const pick = pool.filter(p => p.t.id === c.dataset.pickclub && p.lid === c.dataset.picklid)[0];
            UIkit.closeModal();
            if (pick) this.revealYouth(routeKey, pick);
          }, "指定入营球队");
        });
        document.querySelectorAll("[data-lgchip]").forEach(c => {
          c.onclick = UIkit.guard(() => renderList(c.dataset.lgchip), "切联赛");
        });
        UIkit.$("#pc-back").onclick = UIkit.guard(() => { UIkit.closeModal(); this.showYouthInvites(routeKey); }, "返回邀约");
      };
      renderList(r.leagues[0]);
    },

    reveal(i) {
      const o = this.pendingOffers[i];
      const data = State.data;
      data.contract = { years: 2, wage: o.wage };
      data.clubId = o.club.id; data.leagueId = o.lid;
      /* ★★ P154b 丢档防线：此处**不再提前落盘**——揭示页显示前 State.data 是
         「player+clubId 有、fixtures 未生成」的半档，落盘 = 覆盖槽 0 里玩家正在
         进行的旧档（玩家在揭示页退出就丢档）。落盘点 = 正式签约回调（beginSeason
         之后，fixtures 已齐、isNew 置 false），此前全程由 save 守卫 + pagehide
         守卫挡住任何半档进槽 0 / 上云。 */
      UIkit.show("reveal");
      UIkit.$("#reveal-club").textContent = o.club.name;
      UIkit.$("#reveal-league").textContent = o.lg.name + " · " + data.season + " 赛季";
      UIkit.$("#reveal-card").innerHTML =
        '<div class="row"><span>球员</span><b>' + UIkit.esc(this.name) + " · " + ((CONFIG.POSITIONS[this.position] || {}).name || this.position) + " · " + (data.player.number || 9) + " 号</b></div>" +
        '<div class="row"><span>周薪</span><b>' + Career.fmtMoney(o.wage) + "</b></div>" +
        '<div class="row"><span>合同年限</span><b>2 年</b></div>';
      const btn = UIkit.$("#reveal-sign");
      btn.textContent = "正式签约 · 开启职业生涯 ▸";
      btn.onclick = UIkit.guard(() => {
        /* ★★★ P99 批 4c ①：改走**唯一路由** `Career.beginSeason`（不再直调 initSeason）。
           ★ 为什么必须改：青训期从"建档/休赛期"回到赛季时，必须走 `Youth.initYouthSeason`；
             直调 `SeasonSystem.initSeason` 会给青训球员一份**成年**赛程 ——
             而它**不报错**（队、联赛、积分榜都"看起来对"），属静默错档。
           ★ 对职业路径**逐位等价**：空白态 `d.phase === "senior"` ⇒ `beginSeason` 内两处
             相位判定都为假 ⇒ 直接落 `SeasonSystem.initSeason(state, clubId, leagueId)`，
             参数与顺序逐字相同（soak 基线可证）。 */
        Career.beginSeason(State, o.club.id, o.lid);
        State.isNew = false; State.save();
        if (window.Chapters) Chapters.check();
        Hub.enter();
      }, "正式签约");
    },

    /* ══════════════════════════════════════════════════════════════════════════════
       ★★★ P99 批 4c ②：**青训入营的落地点**（`reveal` 的青训对偶）
       ------------------------------------------------------------------------------
       与 `reveal(i)`（职业签约）**刻意分成两个函数**，不合并成一个带分支的函数：
         · 两者的**合同语义不同**（学徒合同**不进** `d.contract`，§7.4 两套合同）；
         · 两者的**初始化目标不同**（青年赛程 vs 成年赛程）；
         · 两者的**赛季写入点不同**（`d.clubId` 的写点归属见下）。
       合并会让"读代码的人以为只有一份逻辑"，而这正是本项目"一个符号两个含义"的高发处。
       共用的部分（`#reveal-*` 这套 DOM 容器）复用 —— 那是**容器复用、函数不复用**，
       与 §5.3.1 对 `initSeason` / `initYouthSeason` 的口径一致。
       ══════════════════════════════════════════════════════════════════════════════ */
    revealYouth(routeKey, pick) {
      /* ★★ P107 纵深防御（2026-09-17）：能力门槛在 UI 层已挡一次，这里**再挡一次** ——
         两个入口（卡片点击 / 未来的重入路径）共用同一条判定，
         避免"绕过 UI 就能违规入营"（与 §4.3 登记在案的"支配策略"同族）。
         ★ 本判定**零 R 消耗**（纯读 LD() 与玩家属性）⇒ 通过时 R 序列逐位不变。 */
      const _route = this.YOUTH_ROUTES.filter(function (x) { return x.key === routeKey; })[0];
      if (_route && State.data && State.data.player && window.PlayerSystem) {
        const _g = this.youthGateOf(_route, PlayerSystem.overall(State.data.player));
        if (_g && _g.verdict === "locked") {
          UIkit.toast("这一档暂时够不着：首发线 " + _g.line + "，你 " + _g.ovr + "（差 " + _g.gap + " 点）", "red");
          console.warn("Create.revealYouth：能力门槛拒绝入营（route=" + routeKey
            + " ovr=" + _g.ovr + " line=" + _g.line + " gap=" + _g.gap + "）");
          return;
        }
      }
      /* ★★ P113：入营队支持**指定**（三份邀约 / 广告指定）——pick = { t, lid } 必须在该
         路由可入营的池内（防脏数据 / 越档指定：校验失败 = 显式报错，不静默换队）。
         ★ P113-c：校验面 = **全联赛池**（youthFullPoolOf = 各联赛全部有青年队映射的队，
         ⊇ 档位池 youthPoolOf）——广告指定已放宽到全联赛，校验跟着放宽；
         「pick 有青年队映射」这一层由 fullPool 的构造保证，revealYouth 下游 academyOf 不会再炸。 */
      let o = null;
      if (pick && pick.t) {
        const ok = this.youthFullPoolOf(_route).some(p => p.t.id === pick.t.id && p.lid === pick.lid)
          || this.youthPoolOf(_route).some(p => p.t.id === pick.t.id && p.lid === pick.lid);
        if (!ok) {
          UIkit.toast("指定球队不在该路由可入营的范围内", "red");
          console.warn("Create.revealYouth：指定队 " + pick.t.id + "（lid=" + pick.lid + "）不在 route=" + routeKey + " 池内");
          return;
        }
        o = { route: _route, club: pick.t, lid: pick.lid, adultId: pick.t.id };
      } else {
        o = this.genYouthOffer(routeKey);
      }
      if (!o) {
        /* ★ 池空 ⇒ **显式报错**，不静默降级（降级成职业签约会让玩家以为入了营，而相位没动） */
        UIkit.toast("青训营名册异常：该档位找不到符合条件的母队", "");
        console.warn("Create.revealYouth：" + routeKey + " 池为空 —— 检查 LD()/D() 的 leagues 与设计稿 §4.2 的门槛（A1≥74 / B1≥86）");
        return;
      }
      const ac = window.Youth ? Youth.academyOf(o.adultId) : null;
      if (!ac) {
        UIkit.toast("青训营名册异常：找不到这支母队的青年队", "");
        console.warn("Create.revealYouth：Youth.academyOf(" + o.adultId + ") 返回 null —— 青年表里没有唯一对应的队"
          + "（youth_data.js 派生失败，或命名形状有歧义）。★ 不猜 id、不静默兜底。");
        return;
      }
      const data = State.data;
      /* ★ 转移入口：`Youth.enter`（A/B 路）或 `Youth.jump`（C 路）。
         `academyId` = **母队成年队 id**（§3.3：`d.youth.academyId` 就是它）——
         这直接决定 17 岁出口时 `Youth.leave` 把 `d.clubId` 还原成谁（R7-21）。 */
      const opts = { tier: o.route.tier, academyId: o.adultId, entrySeason: data.season, contractYears: 2 };
      const ok = o.route.jumpEntry
        ? (window.Youth && Youth.jump(data, opts))
        : (window.Youth && Youth.enter(data, opts));
      if (!ok) {
        /* ★ `enter`/`jump` 的拒绝是"相位非空白态"（它们内部只 warn 不抛，见 youth.js 的设计）——
           这里把它变成**玩家可见的失败**，否则会静默退化成"点了没反应"。
           ★★ 报文里**不写相位字面量**（J12 / 探针 G1 静扫会抓）：用 `route.key` 与布尔
             就足以定位是哪条路由。第一版写的是 `(o.route.jump ? "jump" : "enter")`，
             被 G1 当场判为"相位字面量泄漏到 youth.js 之外"—— 判据是对的。 */
        UIkit.toast("入营失败：这个档位已经不是空白态", "");
        console.warn("Create.revealYouth：入营转移被拒绝"
          + "（route=" + o.route.key + " 跳级=" + !!o.route.jumpEntry
          + " phase=" + String(data.phase) + " isBlank=" + (window.Youth && Youth.isBlank(data)) + "）");
        return;
      }
      /* ★★ P154b 丢档防线：此处**不再提前落盘**——同 reveal(i)（青训稳态 clubId 此刻
         还没写、写点归 initYouthSeason，半档更不该进槽 0）。落盘点 = 正式入营回调，
         此前全程由 save 守卫 + pagehide 守卫挡住半档进槽 0 / 上云。 */
      UIkit.show("reveal");
      UIkit.$("#reveal-club").textContent = o.club.name + " · " + o.route.label;
      UIkit.$("#reveal-league").textContent = ac.youthLeagueName + " · " + data.season + " 赛季";
      UIkit.$("#reveal-card").innerHTML =
        '<div class="row"><span>球员</span><b>' + UIkit.esc(this.name) + " · " + ((CONFIG.POSITIONS[this.position] || {}).name || this.position) + " · " + (data.player.number || 9) + " 号</b></div>" +
        '<div class="row"><span>档位</span><b>' + o.route.label + "（" + o.route.tier + "）</b></div>" +
        '<div class="row"><span>母队</span><b>' + o.club.name + "</b></div>" +
        (window.PlayerSystem
          ? (function () {
            const _ovr = PlayerSystem.overall(data.player);
            const _g = _route ? _route : null;
            const _pr = _g ? Create.youthPromiseOf(_g, o.club, _ovr) : null;
            const _gr = Create.youthWageQuote(_g, o.club, _ovr).grade;
            const _pc = (_pr && _pr.key === "starter") ? "var(--mint)" : (_pr && _pr.key === "rotation") ? "var(--gold)" : "var(--danger)";
            return '<div class="row"><span>评价</span><b>' + _gr.name + " · <span style=\"color:" + _pc + "\">" + (_pr ? _pr.name : "") + "</span></b></div>";
          })()
          : "") +
        '<div class="row"><span>合同</span><b>学徒合同 · 2 年</b></div>';
      const btn = UIkit.$("#reveal-sign");
      btn.textContent = "正式入营 · 开启青训之路 ▸";
      btn.onclick = UIkit.guard(() => {
        /* ★★ 学徒合同**不进** `d.contract`（§7.4 两套合同）—— 青训期费率走
           `Career.youthWageOf`，与这里无关。把存档模板的 `{years:2,wage:3000}` 清掉，
           因为它**是假的**（谁也没给这个 16 岁球员一份成年合同），而且
           17 岁出口后 `weeklyWageOf` 会把它当"真实周薪"发出去 = **凭空造钱**。
           ★ 取 `{years:0, wage:0}`（= **尚未有成年合同**）而不是删掉 `contract` 键：
             全仓多处读 `d.contract.years`（`transfer.js:540` 外租门 / `season.js:580`
             自由身判定），`0` 在这些门上**语义已定义**（自由身）；删键会让它们拿到
             `undefined` 再各自 `|| 0` 兜 —— 那正是"同一状态两处"的温床。
           ★ 登记（**待 §6.5 出口四支 A15 回填**）：出口那一刻应写入真实职业合同；
             在那之前 `weeklyWageOf` 取 0 —— 这是**失败安全方向**（不凭空造钱），
             与 `Career.youthWageOf` 缺配置返回 0 同一口径。soak 的 ① 判据会打印这个值。 */
        data.contract = { years: 0, wage: 0 };
        /* ★ 唯一路由（同 `reveal`）。★ 这里**不写** `data.clubId` / `data.leagueId`：
           青训稳态的写点**归 `Youth.initYouthSeason` 独占** ——
           `tools/_p99_youth_probe.js` 的 ② 静态判据把全仓 `d.clubId` 赋值点锁为
           "恰 4 处"（多一处立刻红），而青训那一处本来就属于 `initYouthSeason`。 */
        /* ★★★ P99 批 4c ② 修正：三路里**只有两条**走青年队 id。
           ── 事实 ──
             · academy（本土/五大青训营）：球员在**青年队**注册 ⇒ `clubId` = 青年队 id、
               `leagueId` = 青年联赛 id（`Youth.initYouthSeason` 建青年赛程）。
             · jump（天才跳级）：球员**在一线队**注册 ⇒ 必须传**成年** id
               （`o.adultId` + `o.lid`），`beginSeason` 才会走 `SeasonSystem.initSeason` 建一线队赛程。
           ── 这里原来写的是什么（真缺陷，已实测）──
             原写法 `Career.beginSeason(State, ac.youthId, ac.youthLeagueId)` **无条件**用青年 id。
             对 jump 相位 ⇒ `beginSeason` 判 `isProtected=true / inAcademy=false` ⇒ 走
             `SeasonSystem.initSeason(state, 青年id, 青年联赛id)` ⇒ `season.js` 在**成年**数据里
             找那个联赛 ⇒ `TypeError: Cannot read properties of undefined (reading 'teams')`
             ⇒ 签约按钮抛错 ⇒ `Hub.enter()` 不执行 ⇒ 玩家看到的是**「点了没反应」**。
           ── 为什么探针没抓到（方法论，比缺陷本身重要）──
             `_p99_youth_probe.js` 的 G4 真值表里，jump 那一格**我自己**传的就是成年 id
             （`out.jump = [Career.beginSeason(State, adult, aLg), …]`）⇒ 它测到了**被调方正确**，
             却完全没测到**调用方传错**。⇒ **接线类缺陷必须穿过调用方测**：
             真浏览器冒烟 `tools/_p99_youth_smoke.js` 的 A[C] 一格抓到的就是它。
             （这也是"逐位等价"类判据的固有盲区：它保证参数**怎么用**，不保证参数**是什么**。） */
        const initClubId = o.route.jumpEntry ? o.adultId : ac.youthId;
        const initLeagueId = o.route.jumpEntry ? o.lid : ac.youthLeagueId;
        Career.beginSeason(State, initClubId, initLeagueId);
        State.isNew = false; State.save();
        if (window.Chapters) Chapters.check();
        Hub.enter();
      }, "正式入营");
    },
  };
  window.Create = Create;
})();
