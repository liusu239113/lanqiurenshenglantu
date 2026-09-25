/* ============================================================================
   比赛引擎 — 基于球队实力与球员属性的完整比赛模拟
   文字直播 + 关键时刻决策 + 评分/经验/疲劳/伤病结算（忠实还原原版机制）
   ============================================================================ */
(function () {
  const COMM = () => window.GAME_DATA.commentary;
  /* ★★ P296（玩家反馈「比赛没结束，最终比分出来了」）：事件空窗期的填充播报。
     零 R 消耗（分钟取模轮换，与 SUB_TEMPLATES 同一手法）——绝不能在这里掷 R，
     否则比赛 RNG 消耗序漂移（soak/比分锚定/smoke 全部基线连坐）。 */
  const MATCH_LULL = [
    "两队在中场展开拉锯，球权来回易手，都在等一个失误。",
    "看台上的鼓声没有停过——场上的机会却迟迟没有出现。",
    "球在边路来回倒脚，节奏慢了下来。",
    "教练在场边挥手示意压上，球员们还在找空当。",
    "这段时间比赛有点闷，看台上玩起了人浪。",
    "门将开出门球，皮球在中场转了一圈又回到后场。",
  ];

  function pickT(tpl) {
    if (!tpl) return "";
    const arr = Array.isArray(tpl) ? tpl : [tpl];
    let group = R.pick(arr);
    if (Array.isArray(group)) group = R.pick(group);
    return typeof group === "string" ? group : (group.text || group.desc || "");
  }
  function fill(tpl, dict) {
    return tpl.replace(/\{(\w+)\}/g, (_, k) => dict[k] !== undefined ? dict[k] : "");
  }
  function shortName(n) {
    if (!n) return "";
    const i = n.lastIndexOf("·");
    return i >= 0 ? n.slice(i + 1) : n;
  }
  // 进球威胁权重：按位置（真实阵容抽人）
  const ATK_W = { ST: 5, CF: 5, LW: 4, RW: 4, CAM: 3.5, CM: 2, LM: 2, RM: 2, CDM: 1, CB: 0.8, LB: 0.6, RB: 0.6, GK: 0.05 };
  // JR 弹幕（热点资讯风味层；按赛事选择专属池）
  let JR_COMP_KEY = null; // "wcq" | "asiacup" | "worldcup" | null（由 MatchEngine 构造时设置）
  function jrPool(kind) {
    const F = window.HUPU_FLAVOR;
    if (!F) return null;
    if (JR_COMP_KEY && F.tournament && F.tournament[JR_COMP_KEY] && F.tournament[JR_COMP_KEY][kind] && F.tournament[JR_COMP_KEY][kind].length) {
      return F.tournament[JR_COMP_KEY][kind];
    }
    return F[kind] || null;
  }
  function jrFlavor(kind) {
    const pool = jrPool(kind);
    if (!pool || !pool.length) return null;
    return "<svg class='ico' width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M21 12a8 8 0 0 1-8 8H4l2.5-3A8 8 0 1 1 21 12z'/></svg> 热点资讯JR：" + R.pick(pool);
  }
  function squadScorer(teamObj) {
    const team = (typeof teamById === "function" && teamById(teamObj.id)) || teamObj;
    let roster = (team && team.players) || [];
    // 国家队：读国际系统的真实球星阵容缓存
    if (!roster.length && typeof window.nationSquadOf === "function" && String(teamObj.id || "").indexOf("nat_") === 0) {
      roster = window.nationSquadOf(teamObj.name) || [];
    }
    // 国家队/无阵容对手：用真实姓名模式池生成临时阵容（缓存避免重复生成）
    if (!roster.length) {
      if (!teamObj._tmpSquad) {
        const pools = window.REAL_DATA.pools;
        const natKeys = Object.keys(pools);
        const nat = natKeys[Math.floor(R.next() * natKeys.length)];
        const pool = pools[nat];
        const s = teamObj.strength || 70;
        teamObj._tmpSquad = [];
        [["ST", 2], ["LW", 1], ["RW", 1], ["CAM", 1], ["CM", 2], ["CDM", 1], ["CB", 2], ["LB", 1], ["RB", 1], ["GK", 1]].forEach(([pos, n]) => {
          for (let i = 0; i < n; i++) {
            teamObj._tmpSquad.push({ name: pool[Math.floor(R.next() * pool.length)], position: pos, nationality: nat, age: R.int(20, 32), overall: Math.max(45, s - R.int(2, 10)) });
          }
        });
      }
      roster = teamObj._tmpSquad;
    }
    if (!roster.length) return "对方球员";
    return R.weighted(roster, p => ATK_W[p.position] || 1).name;
  }
  /* ★ squadKeeper（2026-09-16 第四批）：取一队的门将名（save 解说的 {gk}）。
     只读 squadScorer 已生成的 _tmpSquad（GK 恒有 1 人）—— **绝不自己生成阵容**
     （那会消耗 R 且可能生成第二套不一致的名单）；没缓存时先触发 squadScorer 建缓存。 */
  function squadKeeper(teamObj) {
    squadScorer(teamObj);
    const team = (typeof teamById === "function" && teamById(teamObj.id)) || teamObj;
    const roster = (team && team.players && team.players.length ? team.players : (teamObj && teamObj._tmpSquad)) || [];
    const gk = roster.find(p => p.position === "GK");
    return gk ? gk.name : "门将";
  }
  /* ★ P109：机会链"队友吃饼"的射手名 —— 换球权加权抽人，但**不能抽中玩家本人**
     （自己助攻自己 = 穿帮）；3 次重抽兜底"队友"（与播报层通用占位一致）。 */
  function mateScorer(teamObj, playerName) {
    for (let i = 0; i < 3; i++) {
      const nm = squadScorer(teamObj);
      if (nm && nm !== playerName) return nm;
    }
    return "队友";
  }

  /* ══════════════════════════════════════════════════════════════════════════
     ★★ P106-B（2026-09-17 用户拍板）：「关键时刻」池瘦身 —— 只留防守，射门类全删
     --------------------------------------------------------------------------
     原池 5 张：one_on_one（单刀）/ penalty（点球）/ free_kick（任意球）/
                final_shot（绝杀）/ last_ditch（最后时刻防守）。
     ★ 为什么删前四张（用户原话：「应该取消的是当前的那些射门事件才对」）：
       它们是「假互动」—— 玩家点一个文字选项，引擎拿 goalP 掷一次骰子决定进没进，
       玩家的判断与操作对结果**零影响**；而真小游戏 Duel（L1 创造 → L3 终结）
       才是能靠选格、读门将习惯真实改变结果的那套。两套并存时，
       玩家 82% 的进球（ST 实测 0.74→0.21）来自这套掷骰卡，duel 反而被架空。
     ★ 为什么不连 last_ditch 一起删：
       ① 它是「影帝（actor）」技能在比赛内的**唯一出口**（见 SKILL_CHOICES），
          删了 actor 直接变死技能；
       ② 它承担外场抢断（tackles）与门将扑救（saves，GK 池三张全防守）的产出，
          duel 侧的 L2 破坏只在「对手威胁机会」上给一次判定，覆盖不到这两个口径；
       ③ 它是纯防守语义，**不属于用户点名的「射门事件」**。
     ★ 删除后的产出缺口由 duel 承担：机会数 λ 上调（DUEL_TABLES.L0.base）+ 保底 1 次
       + 助攻通道 —— 三项见 duel_tables.js / duel.js / patchDuelGoal 处的同批注释。
     ══════════════════════════════════════════════════════════════════════════ */
  const KEY_MOMENTS = [
    {
      id: "last_ditch", minute: "last", team: "user",
      title: "最后时刻的防守！", desc: "对方单刀突进，{p}全速回追！",
      choices: [
        { text: "果断滑铲（有牌风险）", attr: "tackling", successP: 0.72, cardP: 0.3 },
        { text: "卡住身位堵枪眼", attr: "bravery", successP: 0.6, cardP: 0.1 },
        { text: "战术犯规阻止进攻", attr: "strength", successP: 0.85, cardP: 0.6 },
      ],
    },
  ];

  /* ★★ 门将变体（用户反馈 2026-09-16）：`last_ditch` 的三个选项全是**外场**防守动作
     （滑铲 / 护球出底线 / 战术犯规）—— 门将遇单刀用的是扑救 / 抱球 / 出击，文本完全不同。
     ★ 不只是文案错位：外场选项的 attr（tackling / strength）**不在 GK 属性池**
       （GK 池 = goalkeeping / physicality / pace）⇒ getAttr 查不到 → **静默回退 50**
       （「字段名写错 → 静默 0」同型：判定恒走半程均值，门将与后卫无差异）。
     ★ 数值与外场版逐项等价映射（主选项 0.72/0.30 → 门将版扑救含脱手风险改 0/0 纯技术失败；
       退让 0.6/0.1；犯规 0.85/0.6），成功率公式照旧吃 attrVal —— 门将终于吃满自己的属性。
     ★ 消费点（2026-09-16 第二批起）：`buildTimeline` 按位置**换池**（GK 走 GK_KEY_MOMENTS，
       本对象是该池成员）—— 池成员一律克隆（见组装处 `if (isGK) Object.assign({}, k)`）。 */
  const GK_LAST_DITCH = {
    id: "last_ditch", cls: "def", minute: "last", team: "user",
    title: "最后时刻的防守！", desc: "对方单刀突进，{p}弃门出击封堵角度！",
    failText: "{p}被对方一个假动作晃过，皮球滚进空门…",
    cardText: "{p}出击放倒了对方前锋——黄牌加点球，对手主罚命中…",
    choices: [
      { text: "侧身扑救将球抱住", attr: "handling", successP: 0.72, cardP: 0 },
      { text: "双拳将球挡出底线", attr: "reflexes", successP: 0.6, cardP: 0 },
      { text: "果断出击破坏单刀（有牌风险）", attr: "strength", successP: 0.85, cardP: 0.6 },
    ],
  };
  /* ★ 影帝技能的门将第 4 选项变体：原版「卡位倒地博犯规」attr=composure 也不在 GK 池
     （回退 50 同病）—— 换成 GK 池的 gkPositioning（P112 门将站位改名），数值不动。 */
  const GK_SKILL_LAST_DITCH = { skill: "actor", text: "影帝：出击倒地夸张翻滚", attr: "gkPositioning", successP: 0.85, cardP: 0.05 };

  /* ★★ 门将专属关键时刻池（用户反馈 2026-09-16 第二批：「门将位置是没有进球的」）：
     门将**只抽防守时刻** —— 进攻时刻（单刀/点球/任意球/绝杀）的判定分支会给玩家记
     进球/助攻，实测 100 场被分配 111 次、44 球/39 场 —— 这正是「生涯首球」误弹的源头。
     门将的"存在感"改由防守产出承担：扑救（userPerf.saves）+ 开球发动（L1GK 助攻，duel.js）。
     ★ 全部 cls:"def" ⇒ resolveKey 走防守分支（成功=扑救/化解，失败=对方破门），零进球通道。
     ★ 按位置换池是**对位替换**：外场走 KEY_MOMENTS，逐字不动 ⇒ R 消耗序不变（soak 基线守它）。 */
  const GK_PENALTY = {
    id: "gk_penalty", cls: "def", minute: "any", team: "user",
    title: "对方获得点球！", desc: "{p}站在门线上，全场屏住呼吸…",
    failText: "{p}判断错了方向，对手一蹴而就…",
    choices: [
      { text: "预判左侧，侧身扑到底", attr: "reflexes", successP: 0.62, cardP: 0 },
      { text: "稳守中路等他先动", attr: "gkPositioning", successP: 0.5, cardP: 0 },
      { text: "出击施压干扰他的节奏", attr: "command", successP: 0.55, cardP: 0 },
    ],
  };
  const GK_CROSS = {
    id: "gk_cross", cls: "def", minute: "any", team: "user",
    title: "对方开出角球，门前一片混战！", desc: "皮球划着弧线坠向小禁区，{p}必须做出决断…",
    failText: "混战中皮球没被解围干净，对方补射破门…",
    choices: [
      { text: "果断出击双拳击出", attr: "command", successP: 0.66, cardP: 0 },
      { text: "高高跃起把球摘下", attr: "handling", successP: 0.58, cardP: 0 },
      { text: "稳守门线封住近角", attr: "gkPositioning", successP: 0.52, cardP: 0 },
    ],
  };
  /* 门将时刻池：单刀封堵（GK_LAST_DITCH）+ 扑点 + 摘高空球 —— 全防守、零进球通道 */
  const GK_KEY_MOMENTS = [GK_LAST_DITCH, GK_PENALTY, GK_CROSS];

  /* ★★ P168（用户指令「游戏里这样的事件选项，都变成小游戏形式，不保留老旧方式」）：
     上面 4 张关键时刻卡（外场 last_ditch + 门将三张）不再走 showKey 的旧式文字选项，
     统一转为**小游戏对局**：门将 → L3GK 扑救六宫格；外场 → L2 破坏四选一。
     转换在 buildTimeline 里完成（keyQueue 恒空，条目进 duelQueue，side="theirs"）。
     结算语义与原 resolveKey def 分支逐字一致：成功=化解（无比分变化）、失败=**必然丢球**。
     下面是各卡「化解成功」的专属播报（弹窗内的格子级文案由 duel_ui 正常渲染）。 */
  const SPECIAL_OK_TEXT = {
    gk_penalty: "你判断对了方向——点球被你扑了出来！",
    gk_cross: "你高高跃起把球摘下，门前混战化解！",
    last_ditch: "你回追到底，把这次致命进攻干净地化解！",
  };

  // ⚡ 技能点亮选项：习得对应技能（≥1★）后，关键时刻追加的第 4 选项——成功率高于普通选项，随星级再提升
  /* ★ P106-B：射门类三张（one_on_one / penalty / free_kick）已删 ⇒ 挂它们身上的
     技能选项一并移除（留着就是**永不触发的死代码**）。
     ★ 这三个技能**不会因此变死技能** —— 它们在机会链上早有出口（DUEL_TABLES.SKILL_GAIN）：
       skillMoves → l1Win +5.5pp（过人四选一胜率）｜penaltyKick → aim +3.5% · strongBreak +3pp
       ｜freeKick → opportunity +0.030 · typeAim +4%（见 duel_tables.js:186-195）。
     ★ 只留 last_ditch → actor（影帝），它是该技能在比赛内的唯一出口，必须保留。 */
  const SKILL_CHOICES = {
    last_ditch: { skill: "actor",       text: "影帝：卡位倒地博犯规",       attr: "composure",  successP: 0.85, cardP: 0.05 },
    /* ★ P139 清理死键：final_shot→bigStage 曾挂在被 P106-B 删除的 final_shot 时刻上
       （无消费=死键）；bigStage 技能本身在 duel/机会链与 mult/bonus 通路仍活，不受影响。 */
  };

  class MatchEngine {
    /**
     * @param state 全局状态
     * @param fixture {comp, home:{id,name,strength}, away:{...}, isUserHome, cup?}
     * @param opts {userBoostMult} ★ P140 国家队败局广告重赛：用户侧战力倍率
     *   （重赛「回魂」注入，默认 1 = 无加成）。**只**在 buildTimeline 的实力差
     *   走势里消费——不动出场判定（userStarter 仍用原始 strength）、不动点球
     *   对手强度（startPenalties 读 opponentTeam().strength）、不动临时阵容生成。
     */
    constructor(state, fixture, opts) {
      this.s = state;
      this.fx = fixture;
      this.d = state.data;
      const m = fixture.match || fixture;
      // 用户侧判断：俱乐部比赛按 clubId；国家队比赛按 intl_me_ 前缀
      this.userHome = m.home.id === this.d.clubId || (typeof m.home.id === "string" && (m.home.id.indexOf("intl_me_") === 0 || m.home.id === "nat_中国"));
      this.home = m.home; this.away = m.away;
      this.score = { home: 0, away: 0 };
      this.minute = 0;
      this.phase = "ready"; // ready | playing | keymoment | done
      this.feed = [];
      this.stats = { home: { shots: 0, onTarget: 0, poss: 50, corners: 0, fouls: 0 }, away: { shots: 0, onTarget: 0, poss: 50, corners: 0, fouls: 0 } };
      this.userPerf = { goals: 0, assists: 0, shots: 0, tackles: 0, passes: 0, saves: 0, keyEvents: 0, rating: 6.0, played: false, minutes: 0 };
      this.timeline = [];   // 预生成事件流
      this.keyQueue = [];
      this.pendingKey = null;
      this.isCup = !!fixture.cup;
      const _comp = (fixture.comp || (fixture.match && fixture.match.comp) || "");
      JR_COMP_KEY = _comp.indexOf("世界杯") >= 0 ? "worldcup" : _comp.indexOf("亚洲杯") >= 0 ? "asiacup" : _comp.indexOf("世预赛") >= 0 ? "wcq" : null;
      this.pressure = fixture.pressure || (fixture.match && fixture.match.pressure) || 0;
      this.extraTime = false;
      /* ★ P140：重赛回魂战力倍率（须在 buildTimeline 之前落定——buildTimeline 消费） */
      this.userBoostMult = (opts && opts.userBoostMult) || 1;
      this.lineupName = R.pick([this.home.name, this.away.name]) === this.home.name ? "home" : "away";
      // 玩家是否首发：能力达标 → 首发
      /* ★ P115：改用 effectiveOvr（当前位置实战战力 = 总评 − 熟练度折扣 + 疲劳/士气）——
         位置熟练度从此真实影响首发判定与比赛表现；主位满熟练 = 总评不变。 */
      const ovr = PlayerSystem.effectiveOvr(this.d);
      /* ★ P107（2026-09-17）：`14` 提到 CONFIG.MATCH_STARTER_GAP —— 创建页的
         「青训营能力门槛」必须用同一个数（两处各写一份 = 双源，改一处必分叉）。 */
      const _gap = (window.CONFIG && CONFIG.MATCH_STARTER_GAP != null) ? CONFIG.MATCH_STARTER_GAP : 14;
      this.userStarter = ovr >= this.clubStrength(this.userHome ? this.home : this.away) - _gap;
      this.userPerf.played = (this.userStarter || R.chance(0.75)) && !(window.Transfer && Transfer.blockPlaying(this.d)); // P61：雪藏压制出场
      /* ★★ 替补登场分钟前置抽定（用户反馈 2026-09-16 第四批）：原先在 finish() 才抽
         `R.int(15,45)`，而 buildTimeline 排关键时刻时**不知道**玩家何时登场 ——
         实测 12/30 场时刻落在登场之前（极端：4' 罚点球、人 40' 才上场）＝「替补席上踢点球」穿帮。
         ⇒ 抽签挪到 buildTimeline **之前**，时刻排布与登场播报（sub 事件）都以它为准；
         分布不变（同一 R.int(15,45)），finish 的 userMinutes 改读现值（不再重复抽）。 */
      this.userSubOn = this.userStarter ? 0 : (this.userPerf.played ? R.int(15, 45) : 0);
      this.buildTimeline();
    }

    clubStrength(team) {
      /* ★ P301（方案 A 配套）：实力读数优先取动态积分榜行（P161 演化后的当季真实实力）。
         此前玩家场用赛程快照（静态基线）、AI 互刷用演化行 ⇒ 玩家加盟的队被钉死基线。
         积分榜无该队（洲际赛/国家队等跨联赛对手、青训期）回落静态快照。
         开局季动态不漂移（oldTable 无场次 early-return）⇒ 行=基线，逐位等价。 */
      const _tbl = this.d && this.d.table;
      if (_tbl && _tbl.length) {
        const _row = _tbl.find(r => r.id === team.id);
        if (_row && _row.strength != null) return _row.strength;
      }
      return team.strength || 70;
    }

    opponentTeam() { return this.userHome ? this.away : this.home; }
    userTeam() { return this.userHome ? this.home : this.away; }

    /* ★★ P110 登场门单源（用户反馈 2026-09-17：替补未出场却弹小游戏）：
       玩家在该分钟是否在场上。首发恒在；替补 = 已获出场（played）且分钟 ≥ 登场分钟；
       未出场者（played=false）恒假。消费方：机会链过滤（buildTimeline 开头）、
       黄牌事后摘除。判定与原 L413 局部箭头逐字一致，只是提为方法消双源。 */
    userOnPitchAt(min) { return this.userStarter || (!!this.userPerf.played && min >= this.userSubOn); }

    buildTimeline() {
      const comm = COMM();
      /* ★ P140 重赛回魂：用户侧战力倍率只作用于本场的实力差走势（XG 配额）；
         对手侧恒不加成。倍率由 v2/settlement.js 的国家队败局重赛门注入。 */
      const _uBoost = this.userBoostMult || 1;
      const hs = (this.clubStrength(this.home) + 3) * (this.userHome ? _uBoost : 1); // 主场优势
      const as = this.clubStrength(this.away) * (this.userHome ? 1 : _uBoost);
      const diff = (this.userHome ? hs - as : as - hs); // 用户球队优势
      const events = [];
      const pushEvent = (min, type, data) => events.push(Object.assign({ minute: min, type }, data));

      // 进球数期望：基于实力差；实力差钳制 ±8
      const baseXG = 1.35;
      const dClamped = Math.max(-8, Math.min(8, diff));
      /* ★★ P106-B：取消 P0-6 的 userXG 预扣 0.5。
         原注释：「关键决策均 +0.5 球归用户侧，预扣保证净值为 0」——
         这个 -0.5 是**与射门类关键时刻（单刀/点球/任意球/绝杀）配对的**：
         那批卡每场给玩家侧额外约 +0.5 球（实测 ST 0.74 → 删后 0.21），
         预扣 0.5 是为了让"有卡"和"无卡"的球队总进球一致。
         ★ P106-B 已把这批卡整批删除 ⇒ 预扣的对冲对象不复存在，
           留着它 = 玩家所在球队**每场系统性少 0.5 球** —— 实测主胜率 0.45 → 0.61
           （`web_port/tools/test_distribution.js` 判红），玩家队被自己人坑。
         ★ 现在玩家想多进球只能靠**亲手打小游戏**（patchDuelGoal 的 added/removed），
           那是技术收益，不该被预扣。 */
      let userXG = Math.max(0.3, baseXG + dClamped * 0.055);
      let oppXG = Math.max(0.3, baseXG - dClamped * 0.055);
      // 事件卡赛前抉择（_ecSim 消费键，赛后由结算钩子清除）
      const _ecSim = (this.d.flags && this.d.flags._ecSim) || {};
      if (_ecSim.illness === "play") { userXG *= 0.82; oppXG *= 1.08; this._ecIllness = true; }   // 流感带伤首发
      if (_ecSim.press === "fire") { userXG *= 1.05; oppXG *= 0.97; }                             // 发布会放话
      if (_ecSim.rotation === "push") { userXG *= 1.08; }                                         // 密集赛程场场全力
      if (_ecSim.derby === "fire") { userXG *= 1.04; }                                            // 德比动员点火
      const userTeamObj = this.userTeam(), oppTeamObj = this.opponentTeam();
      // ★ 3C：给小游戏一个"这一场是不是关键战"的轻量标记（大场面/领袖之心技能要用）
      //   ★★ 绝不把 MatchEngine 实例挂到存档上：`d._matchCtx = this` 会形成
      //      d → engine → d 的**循环引用**，存档 JSON.stringify 直接崩（soak 阶段实测）。
      //      所以只放三个布尔/数字。
      this.d._matchFlags = {
        cup: !!this.isCup,
        pressure: this.pressure || 0,
        key: false,          // 下面 isInteractiveMatch() 算完再补
      };
      // ★★ P97-M3 机会链：本场玩家跑出的机会与结果（先算，因为 genGoals 要用它占配额）
      //   为什么必须在 genGoals **之前**：机会链的进球要**占用**球队的进球配额 ——
      //   否则球队总进球 = 泊松抽样数 + 机会链产出 → 全联盟场均漂移（M3 门禁 ⑦）。
      //   ★ P97-M3B：改为双向 —— mine（我方机会：L1 创造 → L3 终结）
      //     / theirs（对手威胁：L2 破坏，让防守位球员也有游戏玩）
      // ★★ P97-M3B 关键次序：**先把双方的进球配额抽定，再算机会链**。
      //   为什么：机会链只决定"这 n 个球里谁进"，不改变总进球数 ——
      //   配额先定 → 球队总进球 = nUser + nOpp 恒成立 → 全联盟场均**结构性零漂移**
      //   （放在机会链之后抽会把 RNG 流耦合进去，配对比较会退化成统计噪声）。
      const drawN = (xg) => window.poissonSample ? poissonSample(xg) : (R.chance(xg % 1) ? Math.floor(xg) + 1 : Math.floor(xg));
      const nUserGoals = drawN(userXG), nOppGoals = drawN(oppXG);
      const dm = (window.Duel ? Duel.runMatch(this) : null) || { mine: [], theirs: [] };
      this._duel = dm;
      /* ★★ P110 登场门（用户反馈 2026-09-17：替补未出场却弹小游戏/记个人机会）：
         机会链是**玩家个人**的机会 —— 替补登场前不存在（替补席上没有单刀/破坏），
         未出场者全场合法为空。★ 写法保 R 序：过滤发生在 runMatch **之后**（零 R 消耗，
         随机流与 baseline 逐位一致）；duelQueue（下方）由这两个**已过滤**数组构建 ⇒
         step() 在登场前不可能再弹小游戏。
         ★ 进球配额守恒：_duelGoals 从过滤后的 mine 派生 ⇒ 登场前的机会链进球同步出局，
           缺额由 genGoals 的队友进球补齐 ⇒ 球队总进球恒等于泊松配额 nUser+nOpp
           （全联盟场均结构性零漂移不变，只是"替补期间的个人机会"回归为队友机会）。 */
      const _duelOnPitch = (c) => this.userOnPitchAt(c.minute);
      this._duelMine = (dm.mine || []).filter(_duelOnPitch);
      this._duelTheirs = (dm.theirs || []).filter(_duelOnPitch);
      this._duelGoals = this._duelMine.filter(c => c.goal);
      const DCFG = (window.DUEL_TABLES && window.DUEL_TABLES.MATCH) || {};
      const REG_MUL = (typeof DCFG.REG_MUL === "number") ? DCFG.REG_MUL : 1;
      const METHOD_MAP = DCFG.METHOD_MAP || {};

      const genGoals = (n, teamObj, isUser) => {   // ★ n = 已抽定的进球配额（见上）
        const tal = window.TAL;
        const SK = window.Skills;
        const isCaptain = isUser && this.d.intl && this.d.intl.captain;
        /* ★ P113 五档：射手嗅觉/关键一传改走聚合 API（铜 1.04 → 钻 1.18 / 1.05 → 1.25） */
        let goalBoost = (tal && isUser && tal.goalMult) ? tal.goalMult(this.d) : 1;   // 天赋：射手嗅觉
        let assistBoost = (tal && isUser && tal.assistMult) ? tal.assistMult(this.d) : 1; // 天赋：关键一传
        if (SK && isUser) { // 技能库：弱脚/跑位 → 射门转化；手术刀 → 助攻；领袖之心 → 队长时全队增益
          goalBoost *= SK.mult(this.d, "weakFoot", 0.08) * SK.mult(this.d, "positioning", 0.08);
          assistBoost *= SK.mult(this.d, "throughPass", 0.15);
          if (isCaptain) { goalBoost *= SK.mult(this.d, "leadersHeart", 0.06); assistBoost *= SK.mult(this.d, "leadersHeart", 0.06); }
        }
        // 技能库：进球方式加权（头球/远射/一条龙/吃饼/反击按对应技能星级提升）
        const METHOD_BASE = ["header", "longShot", "solo", "tapIn", "counter"];
        const methodOf = (scored) => {
          if (!(isUser && SK && scored)) return R.weighted(METHOD_BASE, () => 1);
          return R.weighted(METHOD_BASE, m => 1 + SK.bonus(this.d, "header", 1.2) * (m === "header")
            + SK.bonus(this.d, "outsideBoot", 1.2) * (m === "longShot") + SK.bonus(this.d, "freeKick", 0.6) * (m === "longShot")
            + SK.bonus(this.d, "skillMoves", 1.2) * (m === "solo") + SK.bonus(this.d, "positioning", 1.0) * (m === "tapIn")
            + SK.bonus(this.d, "burstPace", 1.2) * (m === "counter"));
        };
        // ★★ P97-M3：机会链产出的玩家进球**先入账并占用 n 的配额**
        //   这样"球队总进球数 n"不变（全联盟场均不漂移），玩家进球 = 机会链 + 降档后的常规概率
        let duelGoals = 0;
        if (isUser && this._duelGoals && this._duelGoals.length) {
          duelGoals = Math.min(this._duelGoals.length, n);
          for (let d = 0; d < duelGoals; d++) {
            const c = this._duelGoals[d];
            /* ★★ P109：机会链的"队友吃饼"球（pass 模式赢下后队友终结）——
               记成**队友进球 + 你助攻**（不再挂玩家名下当进球）；助攻在渲染层入账
               （与"打飞改写"同一时序：patch 发生在该分钟渲染前 → 改写即真实）。
               method 固定 tapIn（吃饼语义）；scorer 取本队名单（squadScorer 与常规队友进球同源）。 */
            if (c.mateFinish) {
              pushEvent(c.minute, "goal", {
                user: true, scorer: mateScorer(teamObj, this.d.player.name), assister: this.d.player.name, method: "tapIn",
                teamName: teamObj.name, userScores: false, userAssists: true,
                fromDuel: true, duelIdx: c.idx, duelMate: true,
              });
              continue;
            }
            // ★ 3B：条目结构从 3A 的 {type} 变为 {prep.type.id} —— 取错会让所有机会链进球都被记成"吃饼"
            const _st = c.shotType || (c.prep && c.prep.type && c.prep.type.id) || c.type;
            const method = METHOD_MAP[_st] || "tapIn";
            (this.userPerf.methods = this.userPerf.methods || []).push(method);
            pushEvent(c.minute, "goal", {
              user: true, scorer: this.d.player.name, assister: null, method,
              teamName: teamObj.name, userScores: true, userAssists: false,
              fromDuel: true, duelType: _st, duelIdx: c.idx,
            });
          }
        }
        // ★ 3C：门将的「开球发动」产出 —— 本场有几次已经"打成"的助攻，
        //   在球队进球上兑现（门将不进球，所以 posP=0 保证他永远不会抢前锋的球）
        let gkAssistLeft = isUser
          ? (this._duelMine || []).filter(c => c.layer === "L1GK" && c.assist).length : 0;
        for (let i = 0; i < n - duelGoals; i++) {
          const min = R.int(1, 90);
          // 玩家参与：位置相关概率
          /* ★★ GK:0 假绿修复（2026-09-16）：`{...GK:0}[pos] || .2` 把 0 当 falsy 吃掉 → 门将
             实际吃 0.2 的进球/助攻概率（实测 100 场仍冒 6 球，是"门将进球"的第三个通道）。
             改为 hasOwnProperty 判定：表内命中用表值（GK=0 真生效），表外才回退 .2（防新位置静默 0）。 */
          const _POS_P = { ST: .42, CF: .4, LW: .34, RW: .34, CAM: .3, CM: .2, LM: .24, RM: .24, CDM: .1, CB: .08, LB: .07, RB: .07, GK: 0 };
          const posP = Object.prototype.hasOwnProperty.call(_POS_P, this.d.player.position) ? _POS_P[this.d.player.position] : .2;
          // P0-2：系数 0.75→0.55 + 能力加权（ovr60 ST ≈0.27 球/场、ovr90 ≈0.68），治场均 1.1 球畸高
          /* ★ P115：effectiveOvr 同步替换 —— 生疏位置进球/助攻概率随之打折（熟练度生效第二消费点）
             ★ P138 产出温和校准：0.45→0.60（荣誉标定配套）。背景：P113/P116/P109 系列重构后
             玩家 ST 单季进球实测 p50=2（P138 探针 108 季），与金靴/金冕等比较制荣誉的门槛
             量级脱节（通道恒关闭）。本系数只影响「玩家 vs 队友」的进球分配——球队进球配额
             n 由泊松抽定在前、总量守恒不变（全联盟场均结构性零漂移），玩家多进=队友少进。
             实测效果：ST 单季 p50 2→2.7 / p90 5→6.7（主力好季 5-9 球），金靴门槛按此标定。
             ★★ P222b：0.60→0.52（生涯模拟实测均衡 85 巅峰场均 1.0 球偏热——与 AIM hi 收紧
             同批，合并 ~-18% 产出，把「满经营巅峰」的场均压回 0.75-0.85 合理带）。 */
          const ovrAdj = 0.55 + PlayerSystem.effectiveOvr(this.d) / 250;
          // ★ P97-M3：再乘 REG_MUL 降档 —— 玩家进球的大头已交给机会链，不降档就是同一粒球算两次
          const userScores = isUser && this.userPerf.played && R.chance(posP * 0.52 * REG_MUL * ovrAdj * goalBoost);
          let userAssists = isUser && this.userPerf.played && !userScores && R.chance(posP * 0.3 * ovrAdj * assistBoost);
          // ★ 3C：门将机会链打成的助攻优先兑现（不用再掷骰 —— 他的 L1 已经掷过了）
          let fromGkKick = false;
          if (!userAssists && !userScores && gkAssistLeft > 0 && isUser && this.userPerf.played) {
            userAssists = true; gkAssistLeft--; fromGkKick = true;
          }
          const method = methodOf(userScores);
          if (isUser && userScores) (this.userPerf.methods = this.userPerf.methods || []).push(method); // 供赛后领悟判定
          // ★★ 3D 续修正：**助攻在数据层入账**（此前只写进事件字段供播报用，从未累计到存档）
          //   → 评分公式 `+ assists × 0.7` 恒为 0、球风契合 `passing: myAssists ≥ 1 → +0.1` 几乎永不触发。
          //   实测漏计 **0.1 次/场**（配对探针 §F）。★ 放在这里而不是 `renderEvent`：
          //   统计量不该挂在渲染路径上（跳场/批量跑测时容易漏），且探针只读 timeline 就能验证。
          if (isUser && userAssists && this.userPerf.played) {
            this.userPerf.assists++;
            this.userPerf.keyEvents += fromGkKick ? 2 : 1;
          }
          pushEvent(min, "goal", {
            user: isUser, scorer: userScores ? this.d.player.name : squadScorer(teamObj),
            assister: userAssists ? this.d.player.name : null,
            method, fromGkKick: fromGkKick,
            teamName: teamObj.name, userScores, userAssists,
          });
        }
        // 技能库：任意球大师 → 小概率直接附加一粒任意球 world 波（epic 技能，5★ 约 10% 场均附加）
        /* ★ 门将排除（2026-09-16）：「门将位置是没有进球的」是用户拍板硬口径，
           这条 add-on 是绕过关键时刻池的**第二个进球通道**（任意球大师技能 ≥1★ 即可能触发）。 */
        if (SK && isUser && this.userPerf.played && this.d.player.position !== "GK") {
          const fkStars = SK.stars(this.d, "freeKick");
          if (fkStars > 0 && R.chance(0.02 * fkStars)) {
            (this.userPerf.methods = this.userPerf.methods || []).push("freeKick");
            pushEvent(R.int(1, 90), "goal", {
              user: true, scorer: this.d.player.name, assister: null, method: "freeKick",
              teamName: userTeamObj.name, userScores: true, userAssists: false,
            });
          }
        }
      };
      genGoals(nUserGoals, userTeamObj, true);
      genGoals(nOppGoals, oppTeamObj, false);

      /* ★★ P168（用户实锤「扑救失败但球队没被进球」）：theirs 威胁机会与对手进球**锚定**。
         根因：nT（威胁机会数）与 nOppGoals（对手进球配额）独立泊松抽样——对手抽中 0 球时
         威胁机会照常生成，玩家扑救/破坏失败也零后果（patchTheirsBreak 无球可抹也无球可丢），
         观感就是「扑救失败却没丢球」。同理外场 L2 输了也不疼。
         修法（配额守恒不破坏）：每条威胁机会绑定一条**就近**且未被占用的对手进球
         （|minute 差|最小，一一对应；对手 0 球时绑不上才丢弃）；
         · 玩家成功 → patchTheirsBreak 优先抹掉**锚定球**（对方少进一球，配额内收益）；
         · 玩家失败 → 不做任何 patch ⇒ 锚定球照常播出 = **必然丢球**（操作有代价）；
         · 锚定球若已播出（minute 早于威胁弹出时刻）＝丢球已发生，失败同样成立；
           成功则兜底改写其他未播出对手进球（patchTheirsBreak 内置）。
         · 默认模拟（互动关闭）路径零变化：broken 恒 false、锚定球照常进。
         纯指针操作零 R 消耗 —— 随机流与 soak 基线的 keys 抽样序完全不变。 */
      const _oppGoalEvs = events.filter(ev => ev.type === "goal" && !ev.user).sort((a, b) => a.minute - b.minute);
      const _thSorted = this._duelTheirs.slice().sort((a, b) => a.minute - b.minute);
      {
        const _used = new Set();
        for (const c of _thSorted) {
          let best = null, bestGap = 1e9;
          for (const g of _oppGoalEvs) {
            if (_used.has(g)) continue;
            const gap = Math.abs(g.minute - c.minute);
            if (gap < bestGap) { bestGap = gap; best = g; }
          }
          if (best) { c.anchorEv = best; _used.add(best); }
        }
        this._duelTheirs = _thSorted.filter(c => c.anchorEv);
      }

      // 其他事件
      for (let min = 1; min <= 90; min++) {
        const r = R.next();
        const userSide = R.chance(0.5);
        if (r < 0.020) pushEvent(min, "shot", { user: userSide, big: R.chance(0.25) });
        else if (r < 0.034) pushEvent(min, "tackle", { user: userSide && this.userPerf.played && R.chance(0.4), sliding: R.chance(0.4) });
        else if (r < 0.040) pushEvent(min, "save", { user: userSide });
        else if (r < 0.046) pushEvent(min, "foul", { user: userSide });
        else if (r < 0.049) pushEvent(min, "card", { user: userSide, yellow: true, userCard: userSide && this.userPerf.played && R.chance(0.12 * (window.Skills ? Skills.mult(this.d, "actor", -0.4) : 1)) }); // 技能：影帝 → 吃牌率 −
        else if (r < 0.0505) pushEvent(min, "card", { user: userSide, yellow: false, userCard: false });
        else if (r < 0.053) pushEvent(min, "woodwork", { user: userSide });
        else if (r < 0.056) pushEvent(min, "info", { user: userSide });
      }
      /* ★ 替补登场分钟门（同一反馈批）：玩家「个人行为」类标记在登场前一律摘除。
         ★ 写法保 R 序：371 行的 userCard 抽签（R.chance）**原位不动**，这里只做
         **事后摘除**（不消耗 R）—— 登场前抽中的牌不记账也不播（替补席上吃黄牌 = 穿帮）。
         ★ P110：判定提为 userOnPitchAt() 方法（机会链过滤同源），此处只是局部别名。 */
      const onPitchAt = (min) => this.userOnPitchAt(min);
      if (!this.userStarter) for (const ev of events) {
        if (ev.userCard && !onPitchAt(ev.minute)) ev.userCard = false;
      }
      /* ★ 替补登场播报：SUB_TEMPLATES 模板全仓一直零消费（写了没人用）——
         登场是玩家可知的重要时刻，按 userSubOn 插一条换人 feed。
         ★ 零 R 消耗：模板按 `minute % length` 定长轮换（不用 R.pick），fill 不消耗 R。 */
      if (!this.userStarter && this.userPerf.played) {
        events.push({ minute: this.userSubOn, type: "sub", user: true });
      }
      events.sort((a, b) => a.minute - b.minute || (a.type === "goal" ? -1 : 1));

      // 玩家关键决策点（每场最多 2 个）
      const userGoalEvts = events.filter(e => e.type === "goal" && e.user);
      /* ★★ 门将专属时刻池（用户反馈 2026-09-16 第二批：「门将位置是没有进球的」）：
         门将**只抽防守时刻** —— 进攻时刻（单刀/点球/任意球/绝杀）的判定分支会给玩家
         记进球/助攻（实测 100 场被分配 111 次、44 球/39 场），是「生涯首球」误弹的源头。
         门将的"存在感"改由防守产出承担：扑救（userPerf.saves）+ 开球发动（L1GK，duel.js）。
         ★ 按位置换池是**对位替换**：外场走 KEY_MOMENTS，逐字不动 ⇒ R 消耗序不变（soak 基线守它）。 */
      const isGK = this.d.player.position === "GK";
      /* ★★ P116（用户拍板「中锋不要每场都出现回防事件」）：攻击组（ST/CF/LW/RW/CAM）
         **不进防守时刻池** —— last_ditch（对方单刀你全速回追→滑铲/堵枪眼）是后卫/后腰
         的职责场景，中锋每场被拉去滑铲是穿帮。攻击组的戏剧时刻由 duel 机会链承担
         （L1 创造机会 / L3 单刀终结——本就是设计主通道）。中场/后卫保留（回追补防
         属职责范围）。nKeys 抽签在过滤之前 ⇒ 未登场/攻击组的 R 消耗差 = 设计内漂移。 */
      const ATT_POS = ["ST", "CF", "LW", "RW", "CAM"];
      const candidates = (isGK ? GK_KEY_MOMENTS : KEY_MOMENTS)
        .filter(k => k.team === "user")
        .filter(() => isGK || ATT_POS.indexOf(this.d.player.position) < 0);
      const nKeys = this.userPerf.played ? Math.min(2, R.int(1, 2)) : 0; // 未出场不安排关键决策
      /* ★★ P168：原 keyQueue（showKey 旧式文字选项）整体退役 —— 4 张卡全部转为
         **小游戏条目**并进 duelQueue（side="theirs"）：门将 → L3GK 扑救六宫格、
         外场 → L2 破坏四选一。条目生成时用自动决策**预演**一次作为 baseline
         （非互动/跳到终场时的结算依据），互动时玩家亲手覆盖。
         ★ 分钟抽签/克隆/登场钳制逻辑逐字保留（R 消耗序不变）。 */
      const specialEntries = [];
      for (let i = 0; i < nKeys && candidates.length; i++) {
        let k = candidates.splice(R.int(0, candidates.length - 1), 1)[0];
        /* ★ 克隆：技能选项追加（下面 concat 第 4 选项）不得写穿共享定义 —— 对 GK 池同样成立。 */
        if (isGK) k = Object.assign({}, k);
        let min;
        const lastEvMinute = events.length ? events[events.length - 1].minute : 90;
        if (k.minute === "last") min = Math.min(R.int(85, 92), lastEvMinute);
        else min = Math.min(userGoalEvts.length ? userGoalEvts[R.int(0, userGoalEvts.length - 1)].minute : R.int(10, 85), lastEvMinute);
        /* ★ 登场分钟钳制（同一反馈批）：替补的关键时刻必须晚于登场（userSubOn ∈ [15,45]
           ⇒ 钳后 "any" ∈ [46,85]、"last" 不受影响 ∈ [85,92]）。R.int 已在上面消耗，
           此处纯 max 钳制不消耗 R —— 这是「替补席上罚点球」穿帮的第二道闸（第一道是 subOn 前置）。 */
        if (!this.userStarter && this.userPerf.played) min = Math.max(min, this.userSubOn + 1);
        const _se = this.makeSpecialKey(k, min, 1000 + i);
        if (_se) specialEntries.push(_se);   // ★ P168 防御：Duel 缺失时 makeSpecialKey 返回 null → 跳过
      }
      /* special 条目并入 theirs 链（dupelQueue 按 _duelTheirs 下标索引 ⇒ 直接 append） */
      for (const se of specialEntries) this._duelTheirs.push(se);
      this.timeline = events;
      this.timeline.sort((a, b) => a.minute - b.minute);
      // ★★ P97-M3B：三层小游戏的待决队列（按分钟与事件流交错）
      //   interactive 为真时 step() 会在这里暂停、把控制权交给玩家的 UI
      this.interactive = this.isInteractiveMatch();
      if (this.d._matchFlags) this.d._matchFlags.key = this.interactive;
      this.duelQueue = this._duelMine.map((c, i) => ({ side: "mine", i: i, minute: c.minute, entry: c, resolved: false }))
        .concat(this._duelTheirs.map((c, i) => ({ side: "theirs", i: i, minute: c.minute, entry: c, resolved: false })))
        .sort((a, b) => a.minute - b.minute);
      this.pendingDuel = null;
      this.duelPatches = [];
      this.suppressComeback();   // P80 M22：逆转抑制（保护玩家爽感）
    }

    /**
     * P80 M22 逆转抑制：领先方不该轻易被翻盘
     * ── 背景：原实现整场一次性泊松抽样总进球、再把每球随机丢到 1-90 分钟，
     *    进球彼此独立 → 3:0 领先被对手抽中 4 球反超是纯随机产物，玩家体感极差。
     * ── 真实依据：领先方会回收阵型、放慢节奏，落后方连扳三球完成反超属小概率事件。
     * ── 规则：
     *    领先 ≥3 球 → 连追平都不许（至少留 1 球领先），绝不被反超
     *    领先 2 球  → 最多被追平，仅 15% 概率允许被反超（留一点戏剧性）
     *    领先 1 球  → 不动（正常足球范畴）
     * ── 处理：从后往前删掉对手的进球，直到玩家重新达到目标分差。
     *    ⚠ 只删「导致落后/追平者」且从最晚的进球开始删，保留早期进球的合理性。
     */
    suppressComeback() {
      const goals = [];
      for (let i = 0; i < this.timeline.length; i++) {
        if (this.timeline[i].type === "goal") goals.push(i);
      }
      if (goals.length < 3) return;

      let u = 0, o = 0, maxLead = 0;
      for (const gi of goals) {
        if (this.timeline[gi].user) u++; else o++;
        if (u - o > maxLead) maxLead = u - o;
      }
      const finalDiff = u - o;
      // 所需最小终局分差：领先 3+ 要赢，领先 2 至少平
      // ⚠ 不可写成 finalDiff >= 0：那会把「被追平」也放过，而 3:0→3:3 正是最伤爽感的情形
      const need = maxLead >= 3 ? 1 : 0;
      if (maxLead < 2 || finalDiff >= need) return;

      // 领先越多越不许翻盘；领先 2 球保留 15% 的逆转可能
      const allowLose = maxLead >= 3 ? false : R.chance(0.15);
      if (allowLose) return;

      // 领先 3+ 至少保留 1 球领先（不许被追平）；领先 2 球至少保住平局
      const minDiff = maxLead >= 3 ? 1 : 0;
      const drop = [];
      let du = u, doo = o;
      for (let k = goals.length - 1; k >= 0 && du - doo < minDiff; k--) {
        const gi = goals[k];
        if (!this.timeline[gi].user) { drop.push(gi); doo--; }
      }
      if (!drop.length) return;
      const dropSet = new Set(drop);
      this.timeline = this.timeline.filter((_, i) => !dropSet.has(i));
    }

    /* ══════════════════════════════════════════════════════════════════
       ★★ P97-M3B · 三层小游戏接线
       ------------------------------------------------------------------
       节奏方案（用户拍板）：设置项三档 —— 全程手动 / 关键场次手动（默认）/ 全模拟，
       外加每场的「跳过比赛」按钮。低强度场次走公式，把交互集中在强强对话。
       ══════════════════════════════════════════════════════════════════ */
    /** 本场是否走手动小游戏 */
    isInteractiveMatch() {
      const d = this.d;
      if (!d || !this.userPerf || !this.userPerf.played) return false;
      if (!window.Duel) return false;
      const st = d.settings || {};
      /* ★★ P106-B（2026-09-17 用户拍板「每一场都要做」）：默认档由 "key" 改为 "all"。
         原默认 "key" 的实测后果：只有生涯首秀 / 洲际赛场 / 杯赛淘汰赛 / 德比 / 争冠保级
         才走手动小游戏 —— 中游球队的年轻球员**一季仅 4~8 场可互动（约 15%）**，
         加上机会数 λ 原为 0.9（每场期望不到 1 次），玩家体感就是"小游戏没实装"。
         ★ 保留三档可选项：all（每场手动·默认）/ key（仅关键场）/ sim（全程快进）。
         ★ 兼容既有 autoSim 开关：显式 autoSim===true 视为 sim。 */
      /* ★ 不读 autoSim 的默认：`core.js:105/277` 的既有默认就是 `autoSim: true`
         （原语义 = "非关键场自动快进"），若把它当 "sim" 会**全程无互动** ——
         与用户拍板的"每一场都要做"正好相反。故默认一律 all；
         只有玩家**显式**选择 matchMode="sim" 才全程快进。 */
      const mode = st.matchMode || "all";
      if (mode === "sim") return false;
      if (mode === "all") return true;
      try { return !!(window.SeasonSystem && SeasonSystem.matchImportance(this.s, this.fx).key); }
      catch (err) { return false; }
    }

    /* ★★ P168：把一张旧式关键时刻卡（k）转成小游戏条目（theirs 链成员）。
       · 门将 → L3GK 扑救六宫格（gkPrepare 冻结）；外场 → L2 破坏四选一（l2Prepare）。
       · 预演：自动决策跑一遍写进 `broken` —— 非互动 / 「跳到终场」时的结算依据；
         互动时玩家亲手选择覆盖（prep 只读，resolve 重掷，与普通 theirs 条目同构）。
       · ★ 技能出口保留（P106-B 铁律「删选项不能让技能变死技能」）：原 last_ditch 的
         影帝(actor) 第 4 选项转为**属性化加成** —— 外场直接抬 skillWin（防守成功率+），
         门将压对方 sbByCell（夸张翻滚干扰 → 对方强破率−）。 */
    makeSpecialKey(k, min, idx) {
      const D = window.Duel;
      /* ★ 防御：Duel 模块未加载（老探针沙箱 / 极端环境）→ 跳过该时刻，
         比赛照常（与 runMatch 无 Duel 时机会链为空的既有口径一致），绝不阻塞开赛。 */
      if (!D || !D.gkPrepare || !D.l2Prepare) return null;
      const gkHere = this.d.player.position === "GK";
      const opp = this.opponentTeam();
      const prep = gkHere ? D.gkPrepare(this.d, opp, {}) : D.l2Prepare(this.d, opp, {});
      const pick = gkHere ? D.gkAuto(prep) : D.l2Auto(prep);
      const r = gkHere ? D.gkResolve(prep, pick, false) : D.l2Resolve(prep, pick, false);
      prep.pickIdx = pick;
      const sc = SKILL_CHOICES[k.id];
      if (sc && window.Skills && Skills.stars(this.d, sc.skill) > 0) {
        const ab = Skills.bonus(this.d, sc.skill, 0.08);
        if (gkHere) prep.sbByCell = (prep.sbByCell || []).map(p2 => Math.max(0, p2 - ab));
        else prep.skillWin = (prep.skillWin || [0, 0, 0, 0]).map(v => v + ab);
      }
      return {
        idx: idx, minute: min, layer: gkHere ? "L3GK" : "L2",
        prep: prep, pick: gkHere ? { L3GK: pick } : { L2: pick },
        special: true, keyDef: k,
        broken: gkHere ? !!r.saved : !!r.broken,   // baseline（非互动结算依据）
      };
    }

    /* ★★ P168：special 条目结算 —— 语义与原 resolveKey def 分支逐字一致：
       成功 = 化解（门将记扑救 / 外场记抢断，无比分变化）；失败 = **必然丢球**（比分+1）。
       返回 feed items（互动时经 duel_ui 透传上屏；非互动并入 step() 的 feedItems）。 */
    resolveSpecialKey(e, r) {
      const k = e.keyDef;
      const p = shortName(this.d.player.name);
      const ok = e.layer === "L3GK" ? !!r.saved : !!r.broken;
      const items = [];
      if (ok) {
        if (this.d.player.position === "GK") this.userPerf.saves++; else this.userPerf.tackles++;
        this.userPerf.keyEvents += 2;
        const okText = k.id === "last_ditch" && this.d.player.position === "GK"
          ? "你弃门出击，把单刀球破坏出危险区！" : (SPECIAL_OK_TEXT[k.id] || (p + "化解了这次致命危机！"));
        items.push({ minute: this.minute, type: "good", text: " " + (r && r.adForce ? "【广告加持】" : "") + okText });
      } else {
        if (this.userHome) this.score.away++; else this.score.home++;
        items.push({ minute: this.minute, type: "bad", text: " " + (k.failText ? fill(k.failText, { p }) : "防守失位，对方抓住机会破门…") + "【" + this.score.home + " : " + this.score.away + "】" });
      }
      this.keyHook = ok ? "goal" : "miss";
      return items;
    }

    /** 打包给 UI 的对局状态（UI 只读，不再自己算）
     *  ★ P151：L3 弹卡标题按机会类型分两类 —— 单刀（breakaway，进球率×2 但更稀有）
     *    显示「单刀机会」；其余（抢点/远射/凌空/头球）显示「射门机会」。 */
    duelMomentOf(k) {
      const e = k.entry, st = e.prep;
      const T = window.DUEL_TABLES || {};
      /* ★ P168：special 条目（旧关键时刻卡）—— 标题/副标题沿用原卡文案（「对方获得点球！」
         「对方开出角球，门前一片混战！」…），格子/选项仍是标准小游戏。 */
      if (e.special) {
        return {
          side: k.side, i: k.i, minute: k.minute, kind: st.kind, st: st,
          title: e.keyDef.title,
          sub: fill(e.keyDef.desc, { p: shortName(this.d.player.name) }),
          oppName: st.oppName || "对手",
          grid: T.L3 ? T.L3.GRID : null,
          special: true,
        };
      }
      const isBa = !!(st.kind === "L3" && st.type && st.type.breakaway);
      return {
        side: k.side, i: k.i, minute: k.minute, kind: st.kind, st: st,
        title: (st.i18n && st.i18n.title) || (st.kind === "L3" ? (isBa ? "单刀机会" : "射门机会") : st.kind === "L1" ? "创造机会" : "破坏机会"),
        sub: (st.i18n && st.i18n.sub) || (st.kind === "L3" ? (isBa ? "已经过掉防线，直面门将——选一个角" : "起脚的机会到了，选一个角") : ""),
        oppName: st.oppName || "对手",
        grid: T.L3 ? T.L3.GRID : null,
      };
    }

    /** ★ 3C：中场模式切换（传球组织 ↔ 持球推进）—— 只换选项集，不重掷随机量 */
    duelMode(side, i, mode) {
      const D = window.Duel;
      const list = side === "mine" ? this._duelMine : this._duelTheirs;
      const e = list && list[i];
      if (!D || !e || !e.prep || !e.prep.hasMode || !D.l1SetMode) return null;
      D.l1SetMode(e.prep, mode);
      return e.prep;
    }

    /**
     * 玩家对某个机会做出一次选择（单步）。
     * ★ P151：force = 「看广告直接成功」（duel_ui 广告完播后传入，透传给各 resolve）。
     * @returns { next, result, patch }  next 非空表示要**接着玩下一层**（L1 赢下后接 L3）
     */
    duelStep(side, i, pickIdx, switchUsed, force) {
      const D = window.Duel;
      const _f = force ? { force: true } : undefined;
      const list = side === "mine" ? this._duelMine : this._duelTheirs;
      const e = list && list[i];
      if (!D || !e) return { next: null, result: null };
      if (side === "theirs") {
        // ★ 3C：门将玩家的防守机会 = 扑救（L3GK），语义与 L2 的 broken 对齐 → 复用 patchTheirsBreak
        if (e.layer === "L3GK") {
          const r = D.gkResolve(e.prep, pickIdx, switchUsed, _f);
          e.pick.L3GK = pickIdx;
          e.broken = !!r.saved;
          /* ★ P168：special（旧关键时刻卡）走专属结算 —— 成功化解 / 失败必然丢球 */
          if (e.special) return { next: null, result: r, patch: null, special: true, items: this.resolveSpecialKey(e, r) };
          return { next: null, result: r, patch: r.saved ? this.patchTheirsBreak(e) : null };
        }
        const r = D.l2Resolve(e.prep, pickIdx, switchUsed, _f);
        e.pick.L2 = pickIdx;
        e.broken = !!r.broken;
        if (e.special) return { next: null, result: r, patch: null, special: true, items: this.resolveSpecialKey(e, r) };
        return { next: null, result: r, patch: r.broken ? this.patchTheirsBreak(e) : null };
      }
      // ★ 3C：门将的开球发动（L1GK）—— 只有一层，成功不接射门，而是算一次助攻机会
      if (e.layer === "L1GK") {
        const r = D.l1Resolve(e.prep, pickIdx, switchUsed, _f);
        e.pick.L1 = pickIdx;
        e.l1 = r;
        const kickP = D.gkKickBonus(this.d, e.prep.options[pickIdx]);
        e.kickP = kickP;
        e.assist = !!(r.win && R.chance(kickP));   // ★ 玩家手动时重掷（覆盖 baseline 预演）
        return { next: null, result: r, patch: null };
      }
      if (e.layer === "L1") {
        const r = D.l1Resolve(e.prep, pickIdx, switchUsed, _f);
        e.pick.L1 = pickIdx;
        e.l1 = r;
        if (!r.win) { e.goal = false; return { next: null, result: r, patch: null }; }
        /* ★★ P109（用户拍板"传球后不可能自己射门"）：传球组织赢下 = 撕开防线送出威胁球，
           终结交给**队友**——不再接玩家自己的 L3 单刀（那是过人/持球推进的专属链）。
           · 队友吃饼 → 球进 + 记你一次助攻（timeline 记 duelMate 球，渲染层入账）；
           · 队友没吃饼 → 错失良机（patchDuelGoal 从 baseline 改写，不凭空造/毁球）。
           ★ 与 baseline（duel.js runMatch 的 pass 分支）同一 mateFinishP —— 零漂移纪律。
           ★ P151：广告强成的传球只保证"传球成功"（r.win），队友是否吃饼照常掷骰。 */
        if (e.prep.hasMode && e.prep.mode === "pass") {
          const pM = D.mateFinishP ? D.mateFinishP(this.d, this.userTeam()) : 0.34;
          e.mateFinish = true;
          e.shotType = null;
          e.goal = R.chance(pM);
          e.assist = e.goal;
          r.mateFinish = true;
          r.mateGoal = e.goal;
          const patch = this.patchDuelGoal(e);
          return { next: null, result: r, patch: patch };
        }
        // ★ 持球推进 / 前锋：过掉人了 → 接玩家自己的终结（原链）
        const st = D.shotPrepare(this.d, this.opponentTeam(), {});
        this._chainedShot = { entry: e, st: st };
        st.i18n = { title: "终结", sub: "过掉他了，现在只有你和门将" };
        return { next: { kind: "L3", st: st }, result: r, patch: null };
      }
      const r = D.shotResolve(e.prep, pickIdx, switchUsed, _f);
      e.pick.L3 = pickIdx;
      e.goal = !!r.goal;
      if (e.prep && e.prep.type) e.shotType = e.prep.type.id;
      const patch = this.patchDuelGoal(e);
      this.deriveAssistFor(e);   // ★ P106-B：没进也别白创造 —— 补射/横传派生助攻
      return { next: null, result: r, patch: patch };
    }

    /** L1 赢下之后的那一脚 ★ P151：force 透传（广告直接进球） */
    duelStepShot(pickIdx, switchUsed, force) {
      const D = window.Duel, c = this._chainedShot;
      if (!D || !c) return { result: null, patch: null };
      const r = D.shotResolve(c.st, pickIdx, switchUsed, force ? { force: true } : undefined);
      c.entry.pick.L3 = pickIdx;
      c.entry.goal = !!r.goal;
      c.entry.shotType = c.st.type.id;
      c.entry.chainedShot = true;
      this._chainedShot = null;
      const patch = this.patchDuelGoal(c.entry);
      this.deriveAssistFor(c.entry);   // ★ P106-B：同 duelStep 的 L3 分支
      return { result: r, patch: patch };
    }

    /** ★ L2 成功破坏 → 从事件流里抹掉一条**还没播出**的对手进球（改写成"被化解的射门"）
     *  ★★ P168：改为**锚定优先** —— 先抹掉本条威胁机会绑定的那粒对手进球（e.anchorEv），
     *  绑定球不在（已播出/已被改写）再按旧逻辑从后往前兜底。锚定语义见 buildTimeline：
     *  成功=对方少进一球（配额内）；失败=锚定球照常播出（**必然丢球**）。
     *  ★ 默认模拟（不手动）时 broken 恒为 false → 对手照常进球 → 全联盟结构性零漂移 */
    patchTheirsBreak(e) {
      const tryBreak = (ev) => {
        if (!ev || ev.type !== "goal" || ev.user) return false;
        if (this.timeline.indexOf(ev) < 0) return false;   // 已播出或已被改写
        ev.type = "shot"; ev.big = true; ev.user = false; ev.savedByUser = true;
        delete ev.scorer; delete ev.assister; delete ev.method;
        this.duelPatches.push({ side: "theirs", action: "broken", at: ev.minute });
        return true;
      };
      if (tryBreak(e.anchorEv)) return "broken";           // ★ P168 锚定球优先
      for (let i = this.timeline.length - 1; i >= 0; i--) {
        if (tryBreak(this.timeline[i])) return "broken";
      }
      return null;   // 对手本场没进球 → 无事可抹（防守机会本来就不该凭空产生收益）
    }

    /** 玩家结果与 baseline 不一致 → 改写事件流里那一条
     *  ★ 口径说明：改写造成的是**玩家操作带来的方差**（打飞 → 队友少进一球；
     *    超常发挥 → 多进一球），不是系统性漂移 —— 默认模拟路径完全等同 baseline。
     *  ★★ P109：mateFinish 条目（pass 模式赢下 → 队友终结）走专属分支——
     *    进球 = "队友进 + 你助攻"（不挂玩家名下），未进 = 改写成错失良机。 */
    patchDuelGoal(e) {
      const ev = this.timeline.find(x => x.type === "goal" && x.fromDuel && x.duelIdx === e.idx);
      if (e.goal && e.mateFinish) {
        if (ev) {
          // baseline 也是这条链的球 → 原位改写成"队友吃饼"（防御：baseline 形状异常也归一）
          ev.userScores = false; ev.userAssists = true; ev.duelMate = true;
          ev.assister = this.d.player.name;
          ev.scorer = mateScorer(this.userTeam(), this.d.player.name);
          ev.method = "tapIn";
          return null;
        }
        const minute = Math.max(1, Math.min(90, e.minute || 45));
        this.timeline.push({
          minute: minute, type: "goal", user: true, scorer: mateScorer(this.userTeam(), this.d.player.name),
          assister: this.d.player.name, method: "tapIn",
          teamName: this.userTeam().name, userScores: false, userAssists: true,
          fromDuel: true, duelIdx: e.idx, duelMate: true,
        });
        this.timeline.sort((a, b) => a.minute - b.minute || (a.type === "goal" ? -1 : 1));
        this.duelPatches.push({ idx: e.idx, action: "added" });
        return "added";
      }
      if (e.goal) {
        if (ev) return null;                       // baseline 也是进 → 无需改
        const minute = Math.max(1, Math.min(90, e.minute || 45));
        this.timeline.push({
          minute: minute, type: "goal", user: true, scorer: this.d.player.name, assister: null,
          method: (e.shotType || "tapIn"), teamName: this.userTeam().name,
          userScores: true, userAssists: false, fromDuel: true, duelIdx: e.idx, duelScored: true,
        });
        this.timeline.sort((a, b) => a.minute - b.minute || (a.type === "goal" ? -1 : 1));
        this.duelPatches.push({ idx: e.idx, action: "added" });
        return "added";
      }
      if (!ev) return null;                        // baseline 本来就没进
      // baseline 进了但玩家打飞 → 改写成"错失良机"（★ 不补回：这就是操作的代价）
      // ★ P109：mate 标记一并清掉（baseline 是"队友吃饼"球时，残留 userAssists/duelMate 会污染 shot 事件）
      ev.type = "shot"; ev.big = true; ev.user = true; ev.userScores = false;
      delete ev.scorer; delete ev.assister; delete ev.method;
      delete ev.userAssists; delete ev.duelMate;
      this.duelPatches.push({ idx: e.idx, action: "removed" });
      return "removed";
    }

    /* ★★ P106-B（2026-09-17）：机会链的「助攻落点」
       ------------------------------------------------------------------
       为什么需要：机会链原本只有"进 / 不进"两个落点，射门类关键时刻删掉后
       玩家助攻 0.36 → 0.06/场（中场 0.29 → 0.03），中场与边路会彻底没存在感。
       ★ 语义：你创造的机会没直接进球，但球没死 —— 横传 / 射门被扑后队友补射入网。
         所以**只有"创造出机会（L1 赢下）却没进球"时才派生**，射门都没创造出来不算。
       ★ 单源：概率来自 `Duel.assistConvertP`（duel.js），与 baseline 同参
         ⇒ 交互与非交互派生率一致，"默认模拟零漂移"的结构不变量守住。
       ★ 幂等：`e.assist` 标记 + 只在 `e.idx` 上派生一次；门将走自己的 L1GK 通道不算。 */
    deriveAssistFor(e) {
      if (!e || e.goal || e.assist) return false;
      if (e.layer === "L1GK") return false;                       // 门将有专属 kickP 通道
      if (e.layer === "L1" && !(e.l1 && e.l1.win)) return false;  // 机会没创造出来
      const p = (window.Duel && Duel.assistConvertP) ? Duel.assistConvertP(this.d, this.userTeam()) : 0.16;
      if (!R.chance(p)) return false;
      /* ★★ 守恒改写（不是凭空造球）：
         优先把一条**尚未播出**的「队友进球」改写成「你的助攻」—— 球队总进球数不变，
         只是归属从"队友"变成"你送的"。找不到可改写的球时**直接放弃这次助攻**。
         ★ 为什么不能新增：P106-B 把互动从"仅关键场（~15%）"放开到"每一场"，
           若每次派生都凭空 +1 球，联赛比分分布会系统性右移 —— 实测主胜率
           0.45 → 0.613、场均 2.41 球，`web_port/tools/test_distribution.js` 直接判红。
           宁可少一次助攻，也不破坏「球队总进球 = 配额」这条结构不变量。
         ★ 可改写对象必须**不是**玩家自己进的（!userScores）**也不是**已算助攻的。
         ★★ P295（玩家反馈「对方进球有可能会有自己助攻的数据」）：还必须限定**本队**
           （x.user）—— timeline 里对手进球的 userScores/userAssists 同为 falsy，
           旧 find 会把「你的助攻」挂到对手的进球上（比分不变、归属穿帮）。
           genGoals 推入时恒写 user:isUser、机会链球恒 user:true ⇒ 该字段全链可靠。 */
      const ev = this.timeline.find(x => x.type === "goal" && x.user && !x.userScores && !x.userAssists);
      if (!ev) return false;
      ev.userAssists = true;
      ev.assister = this.d.player.name;
      if (!ev.scorer) ev.scorer = "队友";
      ev.duelAssist = true;
      ev.duelIdx = e.idx;
      e.assist = true;
      this.userPerf.assists++;
      this.userPerf.keyEvents += 2;
      return true;
    }

    /** 推进到下一事件；返回 {feedItems:[], keyMoment:null|{...}, duelMoment:null|{...}} */
    step() {
      if (this.phase === "done") return null;
      const nextEv = this.timeline[0];
      const nextKey = this.keyQueue.find(k => !k.resolved && (!nextEv || k.minute <= nextEv.minute));
      if (nextKey) {
        nextKey.resolved = true;
        this.pendingKey = nextKey;
        /* ★ P296：max 防回跳——timeline 抽干后填充步会把 minute 推过 key.minute，
           直赋值会把比赛时间拨回去（与 968 行事件分支的 max 口径统一）。 */
        this.minute = Math.max(this.minute, nextKey.minute);
        this.phase = "keymoment";
        const p = (this.d.player.number || 9) + "号" + shortName(this.d.player.name);
        return { keyMoment: { title: nextKey.key.title, desc: fill(nextKey.key.desc, { p }), choices: nextKey.key.choices, keyId: nextKey.key.id } };
      }
      // ★ P97-M3B：机会链对局（与事件流按分钟交错）
      const nextDuel = (this.duelQueue || []).find(k => !k.resolved && (!nextEv || k.minute <= nextEv.minute));
      let extraItems = [];
      if (nextDuel) {
        nextDuel.resolved = true;
        if (this.interactive) {
          this.pendingDuel = nextDuel;
          this.minute = Math.max(this.minute, nextDuel.minute);
          this.phase = "duelmoment";
          return { duelMoment: this.duelMomentOf(nextDuel) };
        }
        // 非交互：直接按 baseline 走（自动决策已算完，不必再做什么）
        // ★ P106-B：助攻派生与手动路径**同源**（同一 e、同一概率函数），保住零漂移
        /* ★ P168：非互动分支两处修正 ——
           ① special 条目（旧关键时刻卡）按预演结果结算（丢球/化解要进 feed 与比分）；
           ② 只有 **mine** 链才做助攻派生 —— 旧代码对 theirs（L2/L3GK 防守条目）也调
              deriveAssistFor，其 goal/assist 字段为 undefined 挡不住守卫，
              防守机会能凭空掷出一次"助攻改写"（存量 bug，顺手收口）。 */
        if (nextDuel.entry.special) {
          this.minute = Math.max(this.minute, nextDuel.minute);
          extraItems = this.resolveSpecialKey(nextDuel.entry, {
            saved: nextDuel.entry.broken, broken: nextDuel.entry.broken,
            pickIdx: nextDuel.entry.prep.pickIdx,
          });
        } else if (nextDuel.side === "mine") {
          this.deriveAssistFor(nextDuel.entry);
        }
      }
      /* ★★ P296（玩家反馈「比赛没结束，最终比分出来了」）：**timeline 抽干 ≠ 比赛结束**。
         旧实现事件一播完 engine 立即 finish —— 末位事件落在 55'~75' 的场次就在那个
         分钟弹"终场哨 + 结算卡"（最终比分提前几十分钟出场）。修：事件播完且
         minute<90 → 按 4~8 分钟步进"走过"剩余时间（纯推进零 R；填充文案按分钟取模
         轮换），≥90 才 finish（renderFullTime 的 JR 抽取随 finish 顺延，R 序不变——
         中间没有任何其他抽取插队）。 */
      if (!nextEv) {
        if (this.minute < 90) {
          this.minute = Math.min(92, this.minute + 4 + (this.minute % 5));
          return { feedItems: [{ minute: this.minute, type: "info", text: MATCH_LULL[this.minute % MATCH_LULL.length] }] };
        }
        const ft = this.renderFullTime();
        this.finish();
        return { feedItems: ft };
      }
      this.timeline.shift();
      this.minute = Math.max(this.minute, nextEv.minute);
      const items = this.renderEvent(nextEv);
      items.push(...extraItems);
      return { feedItems: items };
    }

    renderEvent(ev) {
      const comm = COMM();
      const items = [];
      const homeName = this.home.name, awayName = this.away.name;
      const sideName = ev.user ? this.userTeam().name : this.opponentTeam().name;
      const pn = shortName(this.d.player.name);
      const pnNum = (this.d.player.number || 9) + "号" + pn; // 播报带号码："9号小明"
      const push = (type, min, text, cls) => items.push({ minute: min, type: cls || type, text });
      /* ★★★ P99 批 5 ⑥（J3 收口）：**比赛事件里对 `d.stats.*` 的写入也要按相位门控**。
         本文件此前有 3 处 `d.stats` 写点（`renderEvent` 的 `yellow`/`red` + `resolveKey` 的 `yellow`），
         它们**不在** `Settlement.applyResult` 那个 `if (!youthPhase)` 块里（那 5 个字段 + `wageEarned`）
         ⇒ 青训期会被"由**比赛事件**触发的这一族"绕过去写（批 5 ② 实测到 `yellow`，当时登记为待裁）。
         ★★ **门控对象 = 整族**（`yellow` **与** `red` 一起），不是"这次实测红了的那个" ——
           只修黄色 = 下一场红牌又绕过去；"同一族里挑一个修"正是"修一处 ≠ 修一类"的老形态。
         ★ 表达式**逐字复制** `v2/settlement.js:162`（`!!(window.Youth && Youth.inAcademy(d))`）：
           ① 保留 `window.Youth &&` 守卫 —— **裸调用在装载期就是 TypeError = 白屏**；
           ② 与已门控的 6 个字段**同源**（同一判据、同一写法）⇒ 不存在"第二套相位判断"。
         ★ **只门控"账"，不门控"比赛行为"**：`push(...)`（解说）与 `this.userSentOff`（罚下）
           一律照旧 —— 青训期照样会吃牌、照样被罚下，只是**不计入 `d.stats` 这本职业生涯账**
           （与 `settlement.js` 的"按字段分流"同一原则）。
         ★ 用 `inAcademy`（隔离语义，**不含跳级**）而不是 `isProtected` —— 与那 6 个字段同源；
           跳级者在一线队注册（`phase="jump"`）⇒ 他的 `d.stats` 照写，是设计如此。 */
      const youthPhase = !!(window.Youth && Youth.inAcademy(this.d));

      switch (ev.type) {
        case "goal": {
          const t = ev.user ? (this.userHome ? this.score.home++ : this.score.away++) : (this.userHome ? this.score.away++ : this.score.home++);
          const methodTpl = COMM_GOAL(ev.method);
          let text;
          if (ev.userScores) {
            this.userPerf.goals++;
            this.userPerf.keyEvents += 3;
            text = fill(pickT(methodTpl), { scorer: pnNum, assister: "队友" }) + " 【" + this.score.home + " : " + this.score.away + "】";
          } else {
            /* ★★ P109：机会链"队友吃饼"球 —— 助攻**渲染层入账**（数据层不记，避免与
               genGoals 常规助攻双计；改写发生在该分钟渲染前 → 这里记的就是最终结果）。 */
            if (ev.duelMate && ev.userAssists && this.userPerf.played) {
              this.userPerf.assists++;
              this.userPerf.keyEvents += 2;
            }
            if (ev.duelMate) {
              /* ★ P110 探针实锤修复：esc() 是 v2 模块局部助手，match.js 作用域不存在
                 （浏览器真机渲染吃饼播报同样会 ReferenceError 崩比赛，smoke 场次少没踩中）。
                 同文件惯例 = 名字直接拼（scorer 来自静态 REAL_SQUADS，与 853 行 pnNum 同级信任）。 */
              text = "你的一传撕开了防线——" + (ev.scorer || "队友") + "面对门将冷静推射入网！助攻记在你的名下。"
                + " 【" + this.score.home + " : " + this.score.away + "】";
            } else if (ev.fromGkKick && this.userPerf.played) {
              // ★ 3C：门将开球发动的专属播报（**入账已在数据层 `genGoals` 完成**，此处只管文案）
              text = "你一脚就把球队送了出去——" + fill(pickT(methodTpl), { scorer: ev.scorer, assister: "你" })
                + " 【" + this.score.home + " : " + this.score.away + "】";
            } else {
              text = fill(pickT(methodTpl), { scorer: ev.scorer, assister: ev.assister ? shortName(ev.assister) : R.pick(["队友", "中场核心", "边路快马"]) }) + " 【" + this.score.home + " : " + this.score.away + "】";
            }
          }
          push("goal", ev.minute, "<svg class='ico' width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='9'/><path d='M12 7l4.5 3.3-1.7 5.4H9.2L7.5 10.3z'/><path d='M12 3v4M20.5 9.5l-4 1M18 19l-3.2-3.3M6 19l3.2-3.3M3.5 9.5l4 1'/></svg> " + text);
          /* P139（用户拍板）：JR 评述不再上屏实时比赛 feed —— 但 jrFlavor 的 R.pick 与
             R.chance(0.45) 是比赛 RNG 消耗序的组成部分（条件消耗：pool 非空才走），
             删掉会平移 soak/比分锚定/smoke 全部种子化基线。保留抽取、只删上屏。 */
          const jr = jrFlavor(ev.user ? "jrGoal" : "jrLow");
          if (jr) R.chance(0.45);
          break;
        }
        case "shot": {
          (ev.user ? (this.userHome ? this.stats.home : this.stats.away) : (this.userHome ? this.stats.away : this.stats.home)).shots++;
          // ★ P97-M3B：被玩家亲手化解的对手射门（L2 破坏成功的结果）
          if (ev.savedByUser && this.userPerf.played) {
            /* ★ 门将版（2026-09-16）：同一事件两种身份 —— 外场是"挡出射门"（抢断），
               门将是"扑出射门"（扑救）。文案与计数一起按位置分流，别用一段文案。 */
            if (this.d.player.position === "GK") {
              this.userPerf.saves++;
              this.userPerf.keyEvents += 2;
              push("good", ev.minute, "对方已经起脚了——你飞身把球扑了出去！门线前的瞬间反应。");
            } else {
              this.userPerf.tackles++;
              this.userPerf.keyEvents += 2;
              push("good", ev.minute, "对方已经起脚了，你从侧面把球挡了出去——门将都没来得及反应。");
            }
            break;
          }
          /* ★ onPitch 门放 R.chance **之后**（用户反馈 2026-09-16 第四批）：R 调用次数与
             位置保持原样 ⇒ 随机流零扰动；只是登场前的射门尝试不再记到玩家头上（替补席上
             「你的射门被扑」= 穿帮）。 */
          if (ev.user && this.userPerf.played && R.chance(0.18) && (this.userStarter || ev.minute >= this.userSubOn)) {
            this.userPerf.shots++;
            push(ev.big ? "chance" : "info", ev.minute, fill(pickT(R.pick([COMM().SHOT_MISS_TEMPLATES, COMM().BIG_CHANCE_MISSED_TEMPLATES])), { player: pnNum }));
            const jrm = jrFlavor("jrMiss");
            if (ev.big && jrm && R.chance(0.5)) push("info", ev.minute, jrm);
          } else {
            push("info", ev.minute, fill(pickT(COMM().SHOT_MISS_TEMPLATES), { player: shortName(squadScorer(ev.user ? this.userTeam() : this.opponentTeam())) }));
          }
          break;
        }
        case "sub": {
          /* ★ 替补登场播报（同一反馈批）：模板按分钟定长轮换（零 R 消耗），fill 填号+名字。 */
          const ST = COMM().SUB_TEMPLATES || [];
          const tpl = ST.length ? ST[ev.minute % ST.length] : "第{minute}分钟，{in_}替补登场。";
          push("info", ev.minute, fill(tpl, { minute: String(ev.minute), out: "队友", in_: pnNum }));
          break;
        }
        case "tackle": {
          /* ★ 登场门（同一反馈批）：if/else 两支都恰好吃 1 次 pickT（单次 R.pick）⇒
             走哪支的 R 消耗数相同 ⇒ 随机流零扰动；登场前的抢断不再记玩家账。 */
          if (ev.user && this.userPerf.played && (this.userStarter || ev.minute >= this.userSubOn)) {
            this.userPerf.tackles++;
            this.userPerf.keyEvents += ev.sliding ? 2 : 1;
            push("good", ev.minute, fill(pickT(ev.sliding ? COMM().SLIDING_TACKLE_TEMPLATES : COMM().STANDING_TACKLE_TEMPLATES), { player: pn }));
          } else {
            push("info", ev.minute, fill(pickT(COMM().TACKLE_TEMPLATES), { player: "对方球员" }));
          }
          break;
        }
        /* ★ save/foul 文案真实化（同一反馈批）：原 fill 键名 {player,keeper} 与模板占位符
           {shooter},{gk} **错配** → 替换成空串 →「的进攻打到最后一步，用扑救终结了这次威胁。」
           （缺主语，用户截图1 @46'）。改用真实阵容抽人：射手=进攻方随机球员，门将=防守方 GK。
           ★ squadKeeper 在 squadScorer 之后调 —— _tmpSquad 已被前者生成缓存 ⇒ 无额外 R 消耗。 */
        case "save": {
          const attTeam = ev.user ? this.userTeam() : this.opponentTeam();
          const defTeam = ev.user ? this.opponentTeam() : this.userTeam();
          push("info", ev.minute, fill(pickT(COMM().SHOT_SAVED_TEMPLATES), { shooter: shortName(squadScorer(attTeam)), gk: shortName(squadKeeper(defTeam)) }));
          break;
        }
        case "foul": push("info", ev.minute, fill(pickT(COMM().TACTICAL_FOUL_TEMPLATES), { player: shortName(squadScorer(ev.user ? this.userTeam() : this.opponentTeam())) })); break;
        case "card": {
          if (ev.userCard) {
            this.userPerf.keyEvents -= 1;
            if (ev.yellow) { if (!youthPhase) this.d.stats.yellow++; push("bad", ev.minute, " " + pn + " 犯规被黄牌警告。"); }
            else { if (!youthPhase) this.d.stats.red++; push("bad", ev.minute, " " + pn + " 两黄变一红被罚下！"); this.userSentOff = true; }
          } else {
            push("info", ev.minute, ev.yellow ? " " + sideName + "球员战术犯规领到黄牌。" : " " + sideName + "球员严重犯规被直接红牌罚下！");
          }
          break;
        }
        case "woodwork": push("chance", ev.minute, fill(pickT(COMM().HIT_WOODWORK_TEMPLATES), { player: shortName(squadScorer(ev.user ? this.userTeam() : this.opponentTeam())) })); break;
        default: push("info", ev.minute, pickT(COMM().MATCH_FLOW_TEMPLATES) || "双方在中场展开激烈拼抢。");
      }
      return items;
    }

    /** 关键时刻玩家决策 → 结果 */
    resolveKey(choiceIdx) {
      const km = this.pendingKey;
      if (!km) return [];
      this.pendingKey = null;
      const k = km.key;
      const choice = k.choices[choiceIdx];
      const player = this.d.player;
      const attrVal = this.getAttr(choice.attr);
      const p = shortName(player.name);
      const items = [];
      const cls = k.cls || (k.id === "last_ditch" ? "def" : "att");   // ★ cls 字段优先（门将时刻全显式 def），旧 id 判据兜底
      /* ★ P99 批 5 ⑥：同一族门控（见 `renderEvent` 处的长注释）—— 表达式逐字同形。 */
      const youthPhase = !!(window.Youth && Youth.inAcademy(this.d));
      const SK = window.Skills;
      const capBonus = (this.d.intl && this.d.intl.captain) ? 0.05 : 0;
      // 技能库：点球心跳 → 关键决策抗压（压力惩罚最多缓解 30%，无压力时无感）；跑位/阅读比赛 → 关键决策成功率
      const nerveRelief = SK ? Skills.bonus(this.d, "penaltyNerve", 0.3) : 0;
      const pressureDebuff = 1 - this.pressure * 0.1 * ((this.d.intl && this.d.intl.captain) ? 0.5 : 1) * (1 - nerveRelief);
      if (cls === "att") {
        const keySkill = choice.skillTag || null;
        // ⚡技能选项：成功率 = 基础 × 属性系数 × 技能等级系数(1★=0.8 → 5★=1.0) × 压力修正，钳制 ≤92%——等级和属性都真实起作用，永不保进
        const skillFactor = (keySkill && SK) ? (0.75 + 0.25 * Skills.stars(this.d, keySkill) / CONFIG.SKILL_LIBRARY.MAX_STARS) : 1;
        const skillPrefix = keySkill ? "【技能发动】" : "";
        let goalP = choice.goalP * 0.8 * (0.7 + (attrVal / 100) * 0.65) * skillFactor * pressureDebuff + capBonus * 0.1 + (SK ? Skills.bonus(this.d, "positioning", 0.06) : 0); // P0-2：关键决策进球 ×0.8（与运动战联动标定）
        let assistP = choice.assistP * (0.7 + (attrVal / 100) * 0.65) + (SK ? Skills.bonus(this.d, "throughPass", 0.06) : 0);
        goalP = Math.min(0.92, goalP);
        const roll = R.next();
        if (roll < goalP) {
          if (this.userHome) this.score.home++; else this.score.away++;
          this.userPerf.goals++; this.userPerf.keyEvents += 3;
          if (keySkill) (this.userPerf.skillKeyWins = this.userPerf.skillKeyWins || []).push(keySkill); // 领悟：关键时刻技能闪光
          items.push({ minute: this.minute, type: "keymoment", text: "<svg class='ico' width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path fill='currentColor' stroke='none' d='M13 2L4 14h6l-1 8 9-12h-6z'/></svg> " + skillPrefix + choice.text + " —— 球进了！！" + p + "顶住压力改写比分！【" + this.score.home + " : " + this.score.away + "】" });
        } else if (roll < goalP + assistP) {
          this.userPerf.assists++; this.userPerf.keyEvents += 2;
          items.push({ minute: this.minute, type: "good", text: "<svg class='ico' width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='9'/><circle cx='12' cy='12' r='5'/><circle cx='12' cy='12' r='1.4' fill='currentColor' stroke='none'/></svg> " + p + "送出绝妙一传，队友破门得分！【" + this.score.home + " : " + this.score.away + "】" });
        } else {
          items.push({ minute: this.minute, type: "bad", text: "<svg class='ico' width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M6 6l12 12M18 6L6 18'/></svg> " + choice.text + "未能奏效，" + p + "有些懊恼…【" + this.score.home + " : " + this.score.away + "】" });
        }
      } else {
        const keySkill = choice.skillTag || null;
        // ⚡技能选项：同 att——基础 × 属性 × 技能等级系数，钳制 ≤92%
        const skillFactor = (keySkill && SK) ? (0.75 + 0.25 * Skills.stars(this.d, keySkill) / CONFIG.SKILL_LIBRARY.MAX_STARS) : 1;
        const skillPrefix = keySkill ? "【技能发动】" : "";
        const successP = Math.min(0.92, choice.successP * (0.7 + (attrVal / 100) * 0.6) * skillFactor * (this.pressure ? (1 - this.pressure * 0.05) : 1) + (SK ? Skills.bonus(this.d, "gameReading", 0.06) : 0));
        const roll = R.next();
        if (roll < successP) {
          /* ★ 门将的防守成功 = 扑救（saves），外场 = 抢断（tackles）—— 口径分离（2026-09-16）。
             rating 公式对两者同权重（见 finish()），门将评分不吃亏。 */
          if (this.d.player.position === "GK") this.userPerf.saves++; else this.userPerf.tackles++;
          this.userPerf.keyEvents += 2;
          if (keySkill) (this.userPerf.skillKeyWins = this.userPerf.skillKeyWins || []).push(keySkill);
          items.push({ minute: this.minute, type: "good", text: "<svg class='ico' width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M12 2l8 3v6c0 5.5-3.5 9.5-8 11-4.5-1.5-8-5.5-8-11V5z'/></svg> " + skillPrefix + p + choice.text + "成功！化解了这次致命危机！" });
        } else if (roll < successP + (1 - successP) * (1 - choice.cardP)) {
          if (this.userHome) this.score.away++; else this.score.home++;
          items.push({ minute: this.minute, type: "bad", text: " " + (k.failText ? fill(k.failText, { p }) : "防守失位，对方抓住机会破门…") + "【" + this.score.home + " : " + this.score.away + "】" });
        } else {
          if (!youthPhase) this.d.stats.yellow++;
          if (this.userHome) this.score.away++; else this.score.home++;
          items.push({ minute: this.minute, type: "bad", text: " " + (k.cardText ? fill(k.cardText, { p }) : p + "战术犯规染黄，对方任意球破门…") + "【" + this.score.home + " : " + this.score.away + "】" });
        }
      }
      if (cls === "att" && items.some(i => i.type === "keymoment")) this.keyHook = "goal";
      else if (cls === "def" && items.some(i => i.type === "good")) this.keyHook = "goal";
      else this.keyHook = "miss";
      this.phase = "playing";
      return items;
    }

    getAttr(id) {
      const player = this.d.player;
      if (player.attrs[id] !== undefined) return player.attrs[id];
      const map = { dribbling: "dribbling" };
      return 50;
    }

    renderFullTime() {
      const items = [];
      const res = this.userHome
        ? (this.score.home > this.score.away ? "胜" : this.score.home === this.score.away ? "平" : "负")
        : (this.score.away > this.score.home ? "胜" : this.score.home === this.score.away ? "平" : "负");
      items.push({ minute: 90, type: "goal", text: "<svg class='ico' width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M5 21V4'/><path d='M5 4c4-2 7 2 11 0v9c-4 2-7-2-11 0'/></svg> 全场比赛结束！" + this.home.name + " " + this.score.home + " : " + this.score.away + " " + this.away.name + "，你的球队" + (res === "胜" ? "拿下胜利！" : res === "平" ? "收获平局。" : "遗憾落败。") });
      // 赛后 JR 热议（P139：用户拍板不再上屏实时比赛界面 —— R.pick 是比赛 RNG 消耗序
      //    的组成部分（hook 按 keyHook 条件消耗、定长循环 2 次），保留抽取、只删 items）
      const F = window.HUPU_FLAVOR;
      if (F) {
        const keyPool = jrPool(this.keyHook === "goal" ? "jrKeyGoal" : "jrKeyMiss") || [];
        if (this.keyHook === "goal" && keyPool.length) R.pick(keyPool);
        else if (this.keyHook === "miss" && keyPool.length) R.pick(keyPool);
        const good = this.userPerf.goals >= 1 || this.userPerf.rating >= 7.5;
        const pool = good ? (jrPool("jrPraise") || F.jrPraise) : (jrPool("jrMock") || F.jrMock);
        for (let i = 0; i < 2; i++) {
          if (pool && pool.length) R.pick(pool);
        }
      }
      return items;
    }

    finish() {
      this.phase = "done";
      // ★★ P97-M3B：本场对手模型的记忆**只在这里写一次**
      //   为什么不在 runMatch / resolve 时写：自动决策会预演一遍玩家选择，
      //   若两处都写就变成"一次机会记两次"，对手读心会被自己的预演污染。
      if (window.Duel && window.Duel.remember) {
        const picks = [];
        for (const k of (this.duelQueue || [])) {
          const e = k.entry;
          if (!e || !e.pick) continue;
          if (k.side === "theirs") {
            if (e.pick.L2 != null) picks.push({ layer: "L2", idx: e.pick.L2 });
            else if (e.pick.L3GK != null) picks.push({ layer: "L3GK", idx: e.pick.L3GK });   // ★ 3C
            continue;
          }
          if (e.layer === "L1GK") { if (e.pick.L1 != null) picks.push({ layer: "L1", idx: e.pick.L1 }); continue; }  // ★ 3C
          if (e.layer === "L1" && e.pick.L1 != null) picks.push({ layer: "L1", idx: e.pick.L1 });
          if (e.pick.L3 != null) picks.push({ layer: "L3", idx: e.pick.L3 });
        }
        try { Duel.remember(this.d, picks); } catch (err) { /* 记忆失败不影响比赛结算 */ }
      }
      // ── 评分 ──
      if (this.userPerf.played && !this.userSentOff) {
        let rating = 6.0 + this.userPerf.keyEvents * 0.15 + this.userPerf.goals * 0.9 + this.userPerf.assists * 0.7 + this.userPerf.tackles * 0.12 + (this.userPerf.saves || 0) * 0.12 + this.userPerf.shots * 0.08; // P0-2：每球 1.1→0.9；★ 门将扑救与抢断同权（2026-09-16）
        const res = this.userHome ? this.score.home - this.score.away : this.score.away - this.score.home;
        rating += res > 0 ? 0.4 : res < 0 ? -0.4 : 0;
        rating += R.float(-0.5, 0.5);
        // 天赋：大场面先生（杯赛/高压关键战，五档 +0.15~+0.5）；稳定器 → 评分保底（五档 6.0~6.5）
        if (window.TAL) {
          if (this.isCup || (this.pressure || 0) > 0) {
            if (TAL.bigGameBonus) rating += TAL.bigGameBonus(this.d);
          }
          if (TAL.ratingFloor) {
            const _rf = TAL.ratingFloor(this.d);
            if (_rf > 0) rating = Math.max(_rf, rating);
          }
        }
        // 技能库：阅读比赛 → 评分；大场面先生 → 关键战评分；领袖之心 → 队长评分
        if (window.Skills) {
          rating += Skills.bonus(this.d, "gameReading", 0.12);
          if (this.isCup || (this.pressure || 0) > 0) rating += Skills.bonus(this.d, "bigStage", 0.3);
          if (this.d.intl && this.d.intl.captain) rating += Skills.bonus(this.d, "leadersHeart", 0.1);
        }
        // 出身：校园学霸 → 评分下限 6.1
        if (window.IDENTITY) {
          const floor = IDENTITY.ratingFloor(this.d);
          if (floor) rating = Math.max(floor, rating);
        }
        // 事件卡：流感带伤首发 → 评分惩罚（意志分不白给，但身体是诚实的）
        if (this._ecIllness) rating = Math.max(4.5, rating - 0.4);
        // 球风契合 +0.1：本场的贡献恰好落在球风偏好类别上（射门→进球 / 传球→助攻 / 防守→少失球…）
        if (window.IDENTITY && this.d.playStyle && this.d.playStyle.cats) {
          const myGoals = this.userPerf.goals, myAssists = this.userPerf.assists;
          const conceded = this.userHome ? this.score.away : this.score.home;
          const goalDiff = this.userHome ? this.score.home - this.score.away : this.score.away - this.score.home;
          const fitMap = {
            shooting: myGoals >= 1, passing: myAssists >= 1, dribbling: myGoals + myAssists >= 1,
            defending: conceded <= 1, physicality: goalDiff >= 0,
            goalkeeping: conceded === 0,
          };
          if (this.d.playStyle.cats.some(c => fitMap[c])) rating += 0.1;
        }
        this.userPerf.rating = Math.max(3.5, Math.min(10, Math.round(rating * 10) / 10));
      } else if (this.userSentOff) {
        this.userPerf.rating = 3.5;
      } else {
        this.userPerf.rating = 0; // 未出场
      }
      this.result = {
        home: this.score.home, away: this.score.away,
        userHome: this.userHome,
        userGoals: this.userPerf.goals, userAssists: this.userPerf.assists, userSaves: this.userPerf.saves,
        rating: this.userPerf.rating, played: this.userPerf.played && !this.userSentOff,
        userMinutes: this.userPerf.played ? (this.userStarter ? 90 : this.userSubOn) : 0,   // ★ 登场分钟已在 constructor 抽定（userSubOn 前置批）
        motm: this.userPerf.rating >= 8.8 || (this.userPerf.goals >= 2 && this.userPerf.rating >= 8.3), // P0-2：MOTM 收紧（目标率 8-12%）
      };
      if (window.Transfer) Transfer.registerMatch(this.d, this.result.played); // P61：替补连击计数（冬窗救援触发用）
    }
  }

  function COMM_GOAL(method) {
    const G = window.GAME_DATA.commentary.GOAL_METHOD_TEMPLATES;
    return (G && G[method]) || (G && G.longShot) || "{scorer} 破门得分！";
  }

  window.MatchEngine = MatchEngine;
})();
