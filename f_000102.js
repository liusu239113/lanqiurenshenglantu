/* ============================================================================
   youth.js — P99 青训体系：相位状态机 / 青训赛季生成（批 2）
   ----------------------------------------------------------------------------
   依据：ADR-4（状态机）+ 台账 A9/B2/C1/C3/C6/C9/C12 + 设计稿 §3.3 / §5.2 / §5.3.1 / §7.8

   本文件是青训体系的**唯一逻辑/状态文件**（数据在 youth_data.js）。三条硬约束：

   ① **`d.phase` 的业务改写只允许出现在本文件**（台账 J12）。
      相位三值 `"academy" | "jump" | "senior"` 是唯一真源，**只由 6 条转移改写**：
        入营签约 (空)→academy ｜ 天才跳级 (空)→jump ｜ 提拔 academy|jump→senior
        17 岁强制出口 academy|jump→senior ｜ ensure 兜底 (空|脏值)→senior ｜ 退役 不变更
      ★ `"senior"` 是**吸收态**：任何路径都不许从 senior 回退（回退会让"曾在青训营"
        变成"现在在青训营"→ 履历被二次隔离、结算走错分支，且**不报错**）。
      ★ 白名单例外（Team-lead 批 0 裁定）：`core.js` 的存档模板与 load() 兜底允许写
        字面量 `"senior"` —— 那是缺省初始化，不是相位转移，且必须先于任何 isProtected 读取。

   ② **禁止重写 `window.ClubEvents`**（R18：6 模块链式覆盖，整条链只靠 index.html
      的书写顺序维系）。本文件与 ClubEvents 无任何耦合 —— 若将来确需挂钩，
      新建 `club_events7.js` 追加在链尾，不在这里动。

   ③ **青训期取"自己的队/联赛"只走 `Youth.teamById()` / `Youth.leagueOf()`**，
      禁止经 `teamById()` / `LD()`：青年队不在 `LD()` 里 → 两处静默兜底会给
      强度 70（season.js:166）/ 60（career.js:137）→ 比分、评分、积分榜一起偏且不报错。

   批次边界：批 2 = 五访问器 + teamById/leagueOf + 转移入口 + initYouthSeason。
   批 3 = `Youth.importance`（关键战短路目标）+ `Youth.finishYouthSeason`（结算唯一入口）
        + `Youth.isBlank` 具名化（队裁追加）+ `Youth.leave(d, reason)` 单枚举（队裁追加）。
   批 4 = 出口语义**改为派生**（删 `promoted`/`exited` 两键 → `Youth.wasPromoted`/`hasExited`，队裁冲突 A）
        + `exitType` 值域**单点派生自 `LEAVE_REASONS`**（队裁冲突 B）
        + **R7-21：`leave` 内还原 `d.clubId` 为成年队 id**（d.clubId 不变量）。
   ============================================================================ */
(function () {
  "use strict";

  const YL = () => (window.GAME_DATA && window.GAME_DATA.youthLeagues) || [];
  const Youth = {};

  /* ══ 容器兜底：`d.youth` 单命名空间（A4/C6 终局口径）══
     一处 ensure 建全部 12 个字段 —— 平铺（d.youthTrophies/d.youthLog）已被否决，
     理由：J2「容器比对」会因路径不存在而恒绿（设计稿 §3.2）。
     ★★ 批 4（Team-lead 裁定 冲突 A）：**不再建 `promoted` / `exited` 两个键** ——
        v0.1k 终稿把这两个标志**改成派生**（`Youth.wasPromoted` / `Youth.hasExited`），
        键本身**根本不应存在**，故 ensure **既不建也不读**。
        判据 J19④ = **全仓不存在这两键的读或写**（对合规实现自动通过）。
        历史：批 3 曾在此建 `promoted=false` / `exited=false` 初值，
        与"赋值只允许出现在 `leave` 内"的机检口径**互斥**（即冲突 A，已裁定）。 */
  Youth.ensure = function (d) {
    if (!d) return d;
    if (!d.youth) d.youth = {};
    const y = d.youth;
    if (y.tier === undefined) y.tier = null;              // A3/A2/A1/B2/B1/C 六档（"C"=跳级）
    if (y.academyId === undefined) y.academyId = null;    // 母队 clubId
    if (y.entrySeason === undefined) y.entrySeason = null; // 入营赛季（真实年份）
    if (y.seasons === undefined) y.seasons = 0;           // 已在营季数
    if (y.trialFailed === undefined) y.trialFailed = false;
    if (!Array.isArray(y.cohort)) y.cohort = [];          // 同期竞争者 5 人
    if (y.squadRank === undefined) y.squadRank = 0;
    if (!Array.isArray(y.log)) y.log = [];                // ★ 青训履历（不是 d.careerLog）
    if (!Array.isArray(y.trophies)) y.trophies = [];      // ★ 青年荣誉（不是 d.trophies）
    if (y.promoteScore === undefined) y.promoteScore = null;
    /* ★★ `exitType` 的**值域不在这里自写**（冲突 B）—— 唯一真源是 `LEAVE_REASONS`（见文件上方）。
       本行只做"键存在性"兜底（默认 `null` = 尚未出口），**不列举值域**。
       注意：`ensure` **不建** `promoted` / `exited`（冲突 A 已裁定，见本节标题注释）。 */
    if (y.exitType === undefined) y.exitType = null;
    if (y.contractYears === undefined) y.contractYears = 2;
    /* 相位兜底：**不信任存档里的脏值**。这一行同时是"旧档迁移"的全部实现。
       敢让缺省 = "senior"：`undefined !== "academy"` → 判据全落非青训 → 逐字节等价今日行为。 */
    if (d.phase !== "academy" && d.phase !== "jump") d.phase = "senior";
    return d;
  };

  /* ══ 两个相位判据（唯一允许读相位的入口；别处一律调函数，不写字面量比较）══ */
  Youth.inAcademy = function (d) { return !!d && d.phase === "academy"; };   // 隔离语义
  Youth.isProtected = function (d) { return !!d && d.phase !== "senior"; };  // 保护语义（跳级态在列）

  /* ══ 出口原因值域 + 两个**派生**出口语义判据（批 4；Team-lead 裁定 冲突 A/B）══
     放在这里（早于 `isBlank` / `leave`）而不是就近声明：`isBlank` 与 `leave` **都**要读它们，
     定义必须早于使用 —— 否则一旦有人在模块初始化期调到 `isBlank`，就是 TDZ 报错
     （且那种报错只在特定加载路径出现，属最难查的一类）。

     ★★ `LEAVE_REASONS` 是 `exitType` 值域的**唯一真源**（冲突 B）：
       注释 / 断言 / 机检**全部读它**，**任何地方不得再自写一遍枚举**。
       历史缺陷：`ensure` 的原注释写 "stay / loan / drop / fallback / jump" ——
       既漏 `promoted`、又多了根本不存在的 `jump`（`jump` 是**相位**，不是出口原因），
       与 `LEAVE_REASONS` 两边不一致 → 任何"按注释理解值域"的读者/断言都会读到错误集合。已删。 */
  const LEAVE_REASONS = { promoted: 1, stay: 1, loan: 1, drop: 1, fallback: 1 };
  /* "未获提拔出口"的集合 = 值域里**除 `promoted` 之外**的部分，由 LEAVE_REASONS **单点派生**
     （派生而非手写：手写会在值域增删时静默漂移 → 与上面"单点真源"是同一条纪律） */
  const EXIT_SET = Object.keys(LEAVE_REASONS)
    .filter(k => k !== "promoted")
    .reduce((m, k) => { m[k] = 1; return m; }, {});

  /* ★ 为什么是**派生**而不是两个布尔键（冲突 A 终局）：
     两个键会有"能否同时为真 / 都为假"的**第三态**，且必须在别处（`ensure`）维护初值 ——
     而机检口径写的是"赋值只允许出现在 `leave` 内"，`ensure` 建初值会立刻被扫出来（互斥）。
     派生后 `exitType` 是**唯一状态**，两个判据是它的**纯函数**，第三态不存在、无初值可维护。 */
  Youth.wasPromoted = function (d) { return !!(d && d.youth && d.youth.exitType === "promoted"); };
  /** ★★ 必须是**集合隶属**，**不能**写 `exitType != null` ——
      后者会把 `promoted` 也算成"已出口"，**R1/R2 反向测试的语义直接翻反**
      （R-j：反向测试的"构造生效"被破坏 → 观测不可归因）。 */
  Youth.hasExited = function (d) { return !!(d && d.youth && EXIT_SET[d.youth.exitType] === 1); };

  /* ══ 身份档（cosmetic，≠ 相位）══
     token = "trainee"（C12 终局裁定）：与相位值字面互不包含，避免"误把身份档当相位用"
     还能拼出合法相位字面量。`age < 24` 推导分支一字不动。 */
  Youth.entryOf = function (d) {
    /* ★★★ P99 批 4c ③：**空值硬化**（这是"单源化"必须先做的前置，不是顺手改）。
       本函数此前直接读 `d.player.age` —— 而**被它取代的 14 处调用点写的是
       `(d.player && d.player.age < 24)`（带 `d.player` 守卫）**。
       ⇒ 若先把 14 处换成 `Youth.entryOf(d)` 而**不**补守卫，就是**用一次重构引入了
         14 个新的崩溃点**（`d.player` 缺失时由"返回 star"变成 TypeError），
         且崩溃发生在**卡片渲染**里 → 表现为"点开卡就白屏"。
       ⇒ 守卫后的取值刻意与旧调用点**逐位一致**（`d.player` 缺失 → `"star"`）。
       ★ 14 处调用点的旧式内联推导已全部删除，但**降级臂仍留在调用点上**：
           `(window.Youth ? Youth.entryOf(d) : ((d.player && d.player.age < 24) ? "youth" : "star"))`
         —— 因为 `window.Youth` 可能尚未装载，裸调用会 TypeError（渲染期白屏）。
       ⇒ 单源化判据**不是**"全仓 `age < 24` 出现次数 === 1"（照字面写会假红：降级臂里
         必须留着这个式子），而是（探针 G5，5 条一起成立）：
           ① 权威推导唯一 = 本函数这一处（全仓其它处**剥注释后仍带 `window.Youth ?` 守卫**）；
           ② 14 处降级臂**形状逐字相同**（"都调了 entryOf"不构成单源化）；
           ③ 全仓无**裸** `Youth.entryOf(` 调用（形状判据对无 `age < 24` 的行完全瞎，须单独堵）。 */
    if (!d) return "star";
    return Youth.inAcademy(d) ? "trainee"
      : (d.player && d.player.age < 24 ? "youth" : "star");
  };
  /* ★ 唯一允许消费 entryOf 输出的地方：返回**变体字段名**（不是 token），默认档 "body"。
     6 处 showC 用 `cc[Youth.bodyVariantOf(d)] || cc.body` → 调用点零字面量比较（R23 结构性消除）。 */
  const BODY_BY_ENTRY = { trainee: "bodyAcademy", youth: "body", star: "bodyStar" };
  Youth.bodyVariantOf = function (d) { return BODY_BY_ENTRY[Youth.entryOf(d)] || "body"; };

  /* ══ 青年队/联赛查找（数据源 = youth_data.js 的 GAME_DATA.youthLeagues）══ */
  /** 返回**完整**青年队对象（含 players）—— players 是交给 initYouthSeason 的输出契约 */
  Youth.teamById = function (id) {
    if (!id) return null;
    for (const lg of YL()) {
      const t = lg.teams.find(t => t.id === id);
      if (t) return Object.assign({}, t, { league: lg.id, youth: true });
    }
    return null;
  };
  /** 玩家所在青年联赛（按 d.clubId 反查）—— 窄口径：找不到返回 null，不做国家/成年联赛兜底
      （兜底会让"id 写错"退化成"联赛悄悄换成另一个"） */
  Youth.leagueOf = function (d) {
    const id = d && d.clubId;
    if (!id) return null;
    return YL().find(lg => lg.teams.some(t => t.id === id)) || null;
  };

  /* ══════════════════════════════════════════════════════════════════════════════
     ★★★ P108 新增：**当前效力俱乐部的统一视图**（青训期/职业期同一个出口）
     ------------------------------------------------------------------------------
     为什么必须新增它（真实缺陷，用户 2026-09-17 截图）：
       全仓有三处写 `teamById(d.clubId)` 当作"我现在效力的队"——
       hub.js:47（球员卡副标题）/ hub.js:627（属性页）/ hub.js:982（俱乐部页头卡）。
       但**青训期 `d.clubId` 是青年队 id**（`Youth.initYouthSeason` 写的），
       成年表 `LD()` 里根本没有它 ⇒ `teamById` 必然 null ⇒ 三处一起退化成
       "队名 = ?/未效力俱乐部 + 阵容空白"——正是用户看到的"没有俱乐部、没有队友"。
     ★ 本文件 21-22 行早就写了这条禁令（"青训期取自己的队/联赛只走 Youth.teamById()/leagueOf()，
       禁止经 teamById()/LD()"），但那只是一句注释：**没有出口就没有约束**。
       本次把它做成**唯一出口**，三处调用点全部改走这里 ⇒ 相位分支从此只有一份。

     返回契约（形状与成年 team 一致，调用方零分支）：
       { team, name, leagueId, leagueName, strength, players, youth }
       任何一边都查不到 ⇒ 返回 null（调用方自行显示占位，不在这里编兜底值）。
     ══════════════════════════════════════════════════════════════════════════════ */
  Youth.clubViewOf = function (d) {
    if (!d) return null;
    const inYouth = Youth.inAcademy(d);
    if (inYouth) {
      /* 青年期：队/联赛都必须来自**青年表**（不回落成年表 —— 回落会让 id 写错静默变成"另一支队"） */
      const t = Youth.teamById(d.clubId);
      if (!t) return null;
      const lg = Youth.leagueOf(d);
      return {
        team: t, name: t.name, leagueId: t.league || (lg && lg.id) || null,
        leagueName: (lg && lg.name) || "", strength: t.strength, players: t.players || [], youth: true,
      };
    }
    const t = (window.teamById && teamById(d.clubId)) || null;
    if (!t) return null;
    const L = (window.LD && LD()[t.league]) || null;
    return {
      team: t, name: t.name, leagueId: t.league || null,
      leagueName: (L && L.name) || "", strength: t.strength, players: t.players || [], youth: false,
    };
  };

  /* ══════════════════════════════════════════════════════════════════════════════
     ★★★ P99 批 4c ②：成年队 → 青年队 的**唯一**对照入口
     ------------------------------------------------------------------------------
     为什么需要它：入营发生在建档期（`v2/create.js`，Q1 裁定）—— 那里手里只有**成年**队
     对象（报价池来自 `LD()` / `D()`），而 `Youth.initYouthSeason` 要求传**青年**队 id。

     ★★ 为什么**不能**在建档处直接写 `"y" + adultId`：
        那条前缀规则住在 `youth_data.js` 的派生里（`yid = "y" + t.id`）。
        在消费侧再写一遍 = **同一命名规则两处**（本项目已复发四次的失效形态）；
        数据侧一旦改前缀，`create.js` 会**静默**建出一个谁都查不到的 id —— 而下游
        （队徽 / 强度 / 排名）全是`|| 兜底`，不报错。
     ⇒ 本函数的手段：**形状匹配 + 恰好唯一**，**绝不猜 id**：
          · 命中 0 个 ⇒ 返回 null（数据里根本没有这支青年队）；
          · 命中 ≥2 个 ⇒ 返回 null（形状有歧义 = 命名规则变了）。
        两种情形都返回 null，由调用方**显式报错**（`Create.revealYouth` 就是这么做的）——
        宁可"入营失败、玩家看得见"，也不要"入营成功、id 是编的"。
     ★ 刻意**不写** `"y" + adultClubId` 正向拼接：那等于把命名规则抄了一份到消费侧。
       本函数只问"青年表里有没有哪支队的 id **恰好多一个字符且尾段等于**成年 id"。
     ══════════════════════════════════════════════════════════════════════════════ */
  Youth.academyOf = function (adultClubId) {
    if (!adultClubId || typeof adultClubId !== "string") return null;
    const hits = [];
    for (const lg of YL()) {
      for (const t of (lg.teams || [])) {
        if (typeof t.id === "string" && t.id.length === adultClubId.length + 1
          && t.id.slice(1) === adultClubId) hits.push({ lg: lg, t: t });
      }
    }
    if (hits.length !== 1) return null;
    return {
      youthId: hits[0].t.id,
      youthTeamName: hits[0].t.name,
      youthLeagueId: hits[0].lg.id,
      youthLeagueName: hits[0].lg.name,
    };
  };

  /* ══ 相位转移（6 条转移的写点；`d.phase =` 只在本文件出现，J12）══
     ★★ 入营合法性必须在 `ensure()` **之前**判断 —— 这是一个真实踩过的坑：
        `ensure()` 会把"未设置"归一化成 `"senior"`（那正是旧档兼容的实现），
        若先 ensure 再看相位，就会把"新档空白态"误判成"已是职业球员"→
        **吸收态守卫把自己的入口锁死，新档永远无法入营**（E3 断言当场抓到）。
     语义区分（两者都要）：`undefined|null` = 空白态（新档，可入营）；
        `"senior"` = 真·职业档/旧档（拒绝）。旧档经 core.js load() 兜底即得 "senior"。
     ★ 拒绝方式：**不写、不抛**，只 console.warn —— 抛错会把"静默错"换成"比赛中崩溃"
       （见台账 C13 对判据⑤的裁定：对玩家更糟）。 */
  /* ★★ "空白态"的完整口径（★ 批 3 已由主理人裁定采纳，并**收成单一具名函数**）：
       设计稿状态机写「入营签约：（空）→ academy」，但 `core.js:newCareer` 的存档模板
       **给每个新档都写了 `phase: "senior"`**（批 0 落地）→ 若把 `"senior"` 一律当吸收态，
       **新档永远进不了青训营**（E3 断言抓到的真缺口，不是假红）。
       故"（空）"实现为：相位未设置（undefined/null）**∪** 生涯尚未开始
       （`stats.seasonsPlayed === 0` ∧ `careerLog` 为空 ∧ 未退役 ∧ 未提拔/未出口）。
       —— 后者正是"模板写了 senior 但生涯还没开始"的那个状态，语义上就是空白态。
       ★★ 两条结构约束（主理人批 2 裁决）：
         ① **单一具名函数**：`enter` / `jump` 都必须调它，**不许两处各写一遍 4 个条件**
            （两处判据会各自漂移 —— 与 R26"一个条件不足以表达意图时取并集，不要在不同
             调用点各写一半"同族）。
         ② **必须单调**：生涯一旦开始（seasonsPlayed>0 / careerLog 非空 / 已提拔|已出口 /
            已退役）→ 空白态**永久为假**，任何路径不得再回到真。
            （这是 §8.1 R5「相位不可逆」的上游前提；与 J20「单调锚点」同族：只能单向翻转。）
       ★ 批 4：第 4 个条件改走**派生判据** `Youth.wasPromoted` / `hasExited` ——
         不再直读 `d.youth.promoted` / `d.youth.exited`（那两键已不存在，冲突 A）。 */
  Youth.isBlank = function (d) {
    if (!d) return false;
    if (d.phase === undefined || d.phase === null) return true;
    if (d.phase === "senior") {
      const started = (d.stats && d.stats.seasonsPlayed > 0)
        || (Array.isArray(d.careerLog) && d.careerLog.length > 0)
        || d.retired === true
        || Youth.wasPromoted(d) || Youth.hasExited(d);
      return !started;
    }
    return false;   // 已是 academy / jump → 重复入营非法
  };
  function refuse(d, what) {
    console.warn("Youth." + what + "：相位已是 " + String(d.phase) + "（非空白态 / 吸收态），忽略本次转移");
    return false;
  }
  /** 入营签约：(空)→"academy"。opts: { tier, academyId, entrySeason, contractYears } */
  Youth.enter = function (d, opts) {
    if (!Youth.isBlank(d)) return refuse(d, "enter");
    Youth.ensure(d);
    d.phase = "academy";
    applyEntry(d, opts);
    return true;
  };
  /** 天才跳级签约：(空)→"jump"。赛程仍是一线队赛程（不走青训赛程），但受 17 岁出口约束。 */
  Youth.jump = function (d, opts) {
    if (!Youth.isBlank(d)) return refuse(d, "jump");
    Youth.ensure(d);
    d.phase = "jump";
    applyEntry(d, Object.assign({ tier: "C" }, opts || {}));
    return true;
  };
  function applyEntry(d, opts) {
    const o = opts || {};
    const y = d.youth;
    if (o.tier !== undefined) y.tier = o.tier;
    if (o.academyId !== undefined) y.academyId = o.academyId;
    if (o.entrySeason !== undefined) y.entrySeason = o.entrySeason;
    if (o.contractYears !== undefined) y.contractYears = o.contractYears;
  }
  /* ★★ 出口原因的**单一枚举**（设计稿 v0.1j §3.3.1 定稿；★ 批 4 已**上移到文件上方**
     「出口原因值域 + 两个派生出口语义判据」一节 —— 因为 `isBlank` 也要读它，
     **定义必须早于使用**。此处保留指针，防止"读到这里发现常量不在"的困惑。） */
  /** 提拔 / 17 岁出口共用出口：academy|jump → "senior"。`reason` ∈ LEAVE_REASONS。
      ★ 判据必须是 `isProtected` 语义的近亲（academy|jump 皆可出），不是 inAcademy —— 跳级态同样受出口约束。
      ★★ R7-21（Team-lead 批 4 裁定）：**出口当季必须把 `d.clubId` 还原成成年队 id**。
      目标不变量 =「**任何时刻 `d.clubId` 都必须是消费者能解析的成年队 id**」
      （不得是青年队 id、不得为空）。为什么必须补、不能让下游兜底 ——
      消费者清单里"安全"与"会静默兜底"两半方向相反（`Career.retire` / `legacy.js` 零引用 ✓；
      但 `v2/hub.js:41` 队徽兜 `{name:"?"}`、`season_report.js:77` 把**裸 id 渲进 UI**、
      `v2/flow.js:57` 续约周薪取 `.strength` 兜 **60**、14 处排名 `findIndex` 落到 **99**）
      ⇒ **能补齐就不要让读者兜底**（与"能消灭就不要断言"同族）。
      取值（Team-lead 裁定）：`promoted`/`stay`/`loan` → `academyId`；
      `drop`/`fallback` → 该 reason 的落点队；**当季无落点 → `academyId` 兜底**，
      由下季转会系统修正。 */
  Youth.leave = function (d, reason) {
    Youth.ensure(d);
    if (!Youth.isProtected(d)) return refuse(d, "leave");
    if (!LEAVE_REASONS[reason]) {
      /* 非法枚举：**不写、不抛**，只 warn —— 与 refuse 同一口径（抛错会把"静默错"换成"比赛中崩溃"）。
         ★ 本守卫同时是判据「**写入值 ⊆ LEAVE_REASONS**」的**唯一**保证点
           （`exitType` 只有下面一处赋值，且必过此门）。 */
      console.warn("Youth.leave：reason 必须是 " + Object.keys(LEAVE_REASONS).join("/") + " 之一，收到 " + String(reason) + "，忽略本次转移");
      return false;
    }
    d.phase = "senior";
    /* ★ P101-3（2026-09-16 用户拍板）：出口 = 转职业那一刻 ⇒ 「第一份职业合同」落定。
       主线 ch3（ml_ch3_first_contract）的 cond.proContract 与 pass() 的 when.proContract
       都读这个旗标 —— 「第一份合同」卡从此绑定签约动作，不再绑出场数
       （旧 cond=appsCareer:10 会让 14 岁跳级学徒在一线队踢 10 场后弹出，穿帮）。
       ★ 旧档兼容：spine/pass 判据里 `phase==="senior"` 恒视为已签（senior 必经出口
         或创建页职业开局），无需回填脚本。 */
    d.flags = d.flags || {};
    d.flags.firstProContract = true;
    /* ★ `exitType` 的**唯一**写点（`promoted` 也写它 —— v0.1k 终稿）。
       原写法是 `promoted` 走独立布尔键、其余走 `exitType` = **一个语义两个载体**
       （正是 J12⑤⑥ 那个"一个符号两个含义"族）→ 已改为单一状态，两个判据派生自它。 */
    d.youth.exitType = reason;
    /* ── R7-21：还原成年队 id（取值规则见函数上方注释）── */
    const y = d.youth;
    const want = (reason === "drop" || reason === "fallback")
      ? ((d.nextClub && d.nextClub.clubId) || y.academyId)
      : y.academyId;
    /* ★★★ P99 批 5 ⑧：**落点形态守卫**（R7-21 不变量的上游闸门）。
       ── 今天为什么"看起来没事"──
         唯一调用方 `Career._forceYouthExit`（17 岁强制出口）**不写 `d.nextClub`**，
         且青训期 `Youth.finishYouthSeason` 返回 `offers: []` ⇒ **`nextClub` 这一支当前不可达**
         （`RU-o` 可达性为假：它是"接上了但从不命中"，不是"没接上"）。
         于是 `want` 恒等于 `y.academyId` —— 而它**恰好是正确的落点** ⇒ 谁也不会发现那一支是死的。
       ── 为什么仍然必须守 ──
         设计稿 §6.5 的「出口三支（母队留用 / 外租 / 转投低级别）」一旦落地（A15 回填后）
         就会往 `d.nextClub` 写值。若那时写进一个**青年队 id**（很容易：青训期的
         `d.clubId` 本来就是青年 id），本函数会把 `d.clubId` **主动还原成青年 id**
         ⇒ 直接违反 R7-21 的「任何时刻 `d.clubId` 都必须是**消费者能解析的成年队 id**」，
         而**下游全是静默兜底**（`v2/hub.js` 队徽「?」/ `v2/flow.js` 续约 strength 60 /
         14 处排名落 99）⇒ 不报错、不红判据。
       ★ 判法 = **问青年表自己的解析器**（`Youth.teamById`）：命中 ⇒ 这个落点是青年 id。
         **不在本文件第二遍写「`"y"` 前缀」规则** —— 那会是第二份命名空间规则
         （本项目反复出现的那类"同一语义两处"）。
       ★ 处置与"落点为空"**同一口径**：**不写坏值** + warn + 把问题暴露给判据。
       ★ 界的可见性（`RU-i`）：本守卫只判「落点**是不是青年 id**」，
         「落点**在成年表里能不能解析**」由 `d.clubId` 的消费者判据（探针用真实 `teamById`）
         承担 —— 两件事不同界，**不在这里合并成一句**（合并会让"青年 id"与"拼错的 id"不可分）。 */
    const isYouthDest = (want != null) && !!Youth.teamById(want);
    if (isYouthDest) {
      console.warn("Youth.leave：落点 " + String(want) + " 是**青年队 id**（Youth.teamById 命中）"
        + " → **拒绝写入**，改用 academyId=" + String(y.academyId));
      console.warn("  ★ 依据 R7-21：`d.clubId` 任何时刻都必须是**成年队 id**；写青年 id 会让下游静默兜底"
        + "（hub 队徽「?」/ flow 续约 strength 60 / 排名 99）。来源 = `d.nextClub` 或 `academyId`。");
    }
    let dest = isYouthDest ? y.academyId : want;
    /* ★★ P191（实机终局测试实锤）：dest **二次校验** —— academyId 本身残留青年 id 时
       （入营路径漏写成年母队：非 create.js 正规入口的建档、或旧档字段缺失），
       上面的守卫"改用 academyId"会把青年 id 照写进 clubId ⇒ 成年 initSeason 生成
       **无 match 结构的空壳赛程**（34 场查不到队）→ MatchEngine `m.home.id` 打比赛必崩
       （与 P188 的 leagueId 残留同族的第二断点；P188 只修了 leagueId）。
       自愈 = 命名规则反推：青年队 id = "y"+成年 id（youth_data.js:95 派生铁则），
       剥前缀后成年表能解析才写。 */
    if (dest != null && Youth.teamById(dest)) {
      const _ad = (typeof dest === "string" && dest.charAt(0) === "y") ? dest.slice(1) : null;
      const _ok = _ad && window.teamById && window.teamById(_ad);
      if (_ok) {
        console.warn("Youth.leave：落点 " + String(dest) + " 仍是青年 id → 按 y 前缀派生规则自愈 → " + _ad);
        dest = _ad;
      }
    }
    if (dest != null) {
      d.clubId = dest;
    } else {
      /* ★★ P191：无落点（academyId 缺失/坏值，正规建档不触发）→ 不写 null 但也**不静默
         保留青年 id**——按 y 前缀派生规则自愈（当前 clubId 本身就是青年队 id），
         剥不出成年队才保留原值暴露给判据。原"保持原值"会让成年期残留青年 clubId →
         空壳赛程 → 打比赛必崩（实机矩阵 6/6 复现）。 */
      const _cur = d.clubId;
      const _yt = Youth.teamById(_cur);                      // 确认当前确实在青年队
      const _ad = (_yt && typeof _cur === "string" && _cur.charAt(0) === "y") ? _cur.slice(1) : null;
      const _ok = _ad && window.teamById && window.teamById(_ad);
      if (_ok) {
        d.clubId = _ad;
        console.warn("Youth.leave：无落点队（academyId 缺失）→ 按 y 前缀派生规则自愈 clubId=" + _cur + " → " + _ad);
      } else {
        console.warn("Youth.leave：无落点队（nextClub / academyId 皆空）→ d.clubId 保持 "
          + String(d.clubId) + "（违反『d.clubId 必为可解析成年队 id』不变量，请检查入营是否传了 academyId）");
      }
    }
    /* ★★ P188（玩家实测「过了整个赛季推不动」）：**leagueId 还原落地**——了结上方
       P99 批 4c 的"待裁"登记。旧态：出口后 `d.leagueId` 残留**青年联赛 id** → 休赛期
       结束 `advanceDay:610 → beginSeason` 走成年初始化 → `SeasonSystem.initSeason`
       在成年数据里查青年联赛 id → `undefined.teams` **TypeError** → 被 Hub.refresh 的
       try-catch 吞掉 → 玩家**无限"日程推进中"**（推一天循环、无比赛、无休赛期）。
       还原口径与 clubId 同源：落点队 → 成年联赛（`Career._leagueIdOfClub` 单源反查；
       青年 id 会被它自然排除——青年联赛不在 `LD()` 成年数据里）。 */
    const destLg = (dest != null && window.Career && Career._leagueIdOfClub) ? Career._leagueIdOfClub(dest) : null;
    if (destLg) {
      d.leagueId = destLg;
    } else if (dest != null) {
      /* 落点队存在但反查失败（数据异常）→ 不写坏值，保留原值并暴露（与 clubId 无落点同口径）；
         beginSeason 的 P188 防御层会再兜一层，玩家不会被卡死。 */
      console.warn("Youth.leave：落点 " + String(dest) + " 反查不到成年联赛 → d.leagueId 保持 "
        + String(d.leagueId) + "（由 beginSeason 防御层兜底）");
    }
    return true;
  };

  /* ══ 青训赛季生成（容器复用、函数不复用：见设计稿 §5.3.1）══
     与 initSeason 的差异（每一处差异都有理由，不是"忘了抄"）：
       · 不调 `ClubEvents.onInitSeason`  → A9：青训期必须早退（入队线/队列会一次性置位 R17）
       · 不用 `LD()` 取联赛，改用 `Youth.leagueOf(d)`
       · 不用 `season.js:44` 那个只取 3 字段的 map → **保留 players**（C9/ADR-3 约束 4）
       · 不产生洲际资格（d.cc/d.scc = null）→ A5
     与 initSeason 相同的部分（重置语义必须一致）：日期回季初 / 疲劳−60 / 士气≥65 / 伤病清零 /
     广告配额重置 / 转会窗口重置，以及 d.table / d.dayIndex / d.seasonStats / d.ovrSeasonStart。 */
  Youth.initYouthSeason = function (state, youthClubId, youthLeagueId) {
    const d = state.data;
    Youth.ensure(d);
    /* ★ P284（方案 A）：新赛季开季 = 幂等守卫复位点（与 SeasonSystem.initSeason 同款；
       finishYouthSeason 结算完成置 true，这里复位——青训线重复结算同此防线）。 */
    d._seasonSettled = false;

    if (d.adUsage) d.adUsage.transferSeason = 0;
    if (window.Transfer) { Transfer.ensure(d); Transfer.resetWindow(d); }
    d.clubId = youthClubId;
    d.leagueId = youthLeagueId;
    /* P100-B1：青训赛季挂**母队联赛**的真实日历（C6 拍板：随母队联赛）。
       ★ 青训联赛 id（youthLeagueId，:343 已写入 d.leagueId）不在 LEAGUE_CALENDAR →
         calOf 会回落 default —— 那不是「随母队」。母队联赛 = academyId 反查
         （teamById 返回带 league 字段；母队是成年队，必在 LD()）。 */
    const _mom = (d.youth.academyId && window.teamById) ? teamById(d.youth.academyId) : null;
    d.date = CONFIG.calStart(_mom && _mom.league, d.season);
    /* ★ P171：赛季末疲劳缓解（−60）随疲劳机制退役删除。 */
    d.morale = Math.max(65, d.morale);
    d.injuryDays = 0;

    const ylg = Youth.leagueOf(d);
    if (!ylg) {
      throw new Error("Youth.initYouthSeason：查不到青年联赛（d.clubId=" + d.clubId + "）—— 青年队 id 必须是 y+成年 id 形式且在 GAME_DATA.youthLeagues 中存在");
    }

    /* ★ 队伍来源只走青年表；**显式带上 players**（青年队不在 LD()，match.js 的
       `teamById(...) || teamObj` 必然走 teamObj 这条唯一路径 → players 为空就会
       转 _tmpSquad（1+22 次 R.next）→ 双端 R 消耗序与 soak 指纹当场破功）。 */
    const teams = ylg.teams.map(t => ({ id: t.id, name: t.name, strength: t.strength, players: t.players }));

    // 联赛赛程：复用成年同一实现（批 2 抽取的 _buildLeagueFixtures，逐位等价已证）
    const fixtures = SeasonSystem._buildLeagueFixtures(teams, youthClubId, CONFIG.calOf(_mom && _mom.league).gap, null, _mom && _mom.league, d.season);

    /* 青年杯：复用既有 `"cup"` type（★ 禁止新造 type —— 新 type 在 applyResult 的
       if-链里会被**静默消费后丢弃**，既不卡死也不报错，见 R2）。结构与成年杯一致：
       16 强 → 8 强 → 半决赛 → 决赛，无偏 Fisher-Yates 洗牌（与 Lua 同序）。 */
    const shuffled = (function (arr) {
      const a = arr.slice();
      for (let i = a.length; i >= 2; i--) {
        const j = R.int(1, i);
        const t = a[i - 1]; a[i - 1] = a[j - 1]; a[j - 1] = t;
      }
      return a;
    })(ylg.teams).slice(0, 16);
    /* ★ 青年杯的队伍副本同样**必须带 players**（与联赛同一条理由：取不回 teamById） */
    const cupTeams = shuffled.map(t => ({ id: t.id, name: t.name, strength: t.strength, players: t.players }));
    const cup = { stage: 0, teams: cupTeams, roundNames: { 16: "十六强", 8: "八强", 4: "半决赛", 2: "决赛" }, alive: true, results: [] };
    let cupDay = 20;
    for (let st = 0; st < 4; st++) {
      if (cup.alive) {
        const others = cupTeams.filter(t => t.id !== youthClubId);
        const opp = others.length ? R.pick(others) : { id: "x", name: "待定对手", strength: 70, players: [] };
        const userIsHome = R.chance(0.5);
        const me = Youth.teamById(youthClubId);   // ★ 不用 teamById()（对青年 id 必然 null → 兜底 70）
        fixtures.push({ type: "cup", stage: st, day: cupDay, match: { home: userIsHome ? me : opp, away: userIsHome ? opp : me }, played: false, result: null, cup: true });
      }
      cupDay += 56;
    }

    d.cc = null; d.scc = null;   // A5：青训期不产生洲际资格（Division.settle / ccQual 也不参与）
    d.fixtures = fixtures;
    d.cup = cup;
    d.table = teams.map(t => ({ id: t.id, name: t.name, strength: t.strength, p: 0, w: 0, dr: 0, l: 0, gf: 0, ga: 0, pts: 0 }));
    d.fixtures.sort((a, b) => a.day - b.day);
    d.dayIndex = 0;
    d.seasonStats = { apps: 0, goals: 0, assists: 0, ratingSum: 0, motm: 0 };
    d.ovrSeasonStart = (window.PlayerSystem && d.player) ? PlayerSystem.overall(d.player) : null;

    /* ★★ 不变式断言（任务书要求 + 积分守恒律 ⑤a 的前置）：
       `_buildLeagueFixtures` 用 `round.find(m => m.home.id === clubId || ...)` 取玩家比赛；
       玩家队不在联赛里时 match 会是 undefined（静默生成空赛程，且后面 ⑤a 会被误导）→
       这里把它变成**显式失败**。 */
    if (!d.table.some(t => t.id === d.clubId)) {
      throw new Error("Youth.initYouthSeason：玩家队 " + d.clubId + " 不在青年联赛积分榜里（守恒律 ⑤a 前置不成立）");
    }
    return d;
  };

  /* ══ 青训期关键战路由（§5.4）—— `SeasonSystem.matchImportance` 的**整体短路目标** ══
     为什么要整体短路、而不是在成年口径上打补丁：成年口径至少有**三条**路径在青训期会误判关键战，
     且三条**都不报错**（逐条打补丁必漏，与 R18"链上每加一个模块就多一处漏点"同族）：
       ① `d.stats.apps === 0`（season.js 首秀分支）→ 青训期**恒为真** → 30 轮全判「生涯首秀」→ 全直播
       ② 争冠对话（`d.table[0].p >= 8`）→ 青训期 `d.table` 是**青年榜** → 青年榜前 3 的对话被判关键战
       ③ 保级大战（`d.table[0].p >= 10`）→ 同理，青年榜的"降级区"也会触发
     ★ 文案**刻意与成年不同名**（"青年德比" ≠ "德比战"）：`v2/settlement.js:166` 与
       `eventcards.js:294` 都在按 `reason === "德比战"` 做**精确比较**（章回旗标 / 抽卡上下文）
       → 青训期不该被这两处命中，所以这里**不能**沿用成年的 reason 字面量。
     ★ 德比判定由调用方（season.js）传入：`DERBY_SET` 住在 season.js，`Youth` 里再写一份
       就是"同一语义两处"（青年队 id 是 `y+成年id`，必须剥前缀才比得上那张表）。 */
  const LIVE_PRIORITY = { "提拔考察战": 5, "出口前最后一战": 4, "青年杯淘汰赛": 3, "青年德比": 2, "青训营首秀": 1 };
  const LIVE_MAX = () => (window.CONFIG && CONFIG.YOUTH && CONFIG.YOUTH.LIVE_MAX) || 6;
  Youth.importance = function (state, fixture, isDerby) {
    const d = state.data;
    const f = fixture || {};
    let cat = "";
    // ① 青训营首秀：**青年生涯**第一场正式比赛（≠ 成年口径的 `d.stats.apps === 0`，那在青训期恒真）
    if (((d.seasonStats && d.seasonStats.apps) || 0) === 0 && (!d.youth || !d.youth.log.length)) cat = "青训营首秀";
    // ② 青年杯淘汰赛：复用既有 type "cup"（★ 禁新造 type —— 新 type 在 applyResult 的 if-链里被静默丢弃，R2）
    else if (f.type === "cup") cat = "青年杯淘汰赛";
    else if (f.type === "league") {
      const lg = (d.fixtures || []).filter(x => x.type === "league").slice().sort((a, b) => a.day - b.day);
      const second = lg[lg.length - 2], last = lg[lg.length - 1];
      // ③ 提拔考察战：季末倒数第 2 轮（一线队教练在看台）
      if (second && second.day === f.day) cat = "提拔考察战";
      // ④ 出口前最后一战：16 岁起的季末最后一轮（出口决定前的最后一战）
      else if (last && last.day === f.day && d.player && d.player.age >= 16) cat = "出口前最后一战";
    }
    if (!cat && isDerby) cat = "青年德比";   // ⑤ 青年德比（母队德比对，每季 ≤2 场）
    if (!cat) return { key: false, reason: "" };
    /* 直播额度：由"已打完且已标记为直播"的场次数**派生**（不存计数器 ——
       存计数器就多一个需要重置的字段，而"已打完 + 已标记"本身可随时重算）；
       超上限时**只保留最高优先级**（提拔考察战），其余按 出口前最后一战 > 杯赛 > 德比 > 首秀 降级。
       ★ 标记写在 fixture 对象上（不写 d.youth.*，不污染存档 schema 的 14 键）。 */
    const used = (d.fixtures || []).filter(x => x.played && x._youthLive).length;
    if (used >= LIVE_MAX() && LIVE_PRIORITY[cat] < 5) return { key: false, reason: "" };
    if (fixture) fixture._youthLive = true;
    return { key: true, reason: cat };
  };

  /* ══ 青训赛季结算 —— **唯一入口**（A9）══
     `SeasonSystem.finishSeason` 函数体第一行的入口分派把它接住：
       `if (Youth.inAcademy(d)) return Youth.finishYouthSeason(state);`
     ★ 为什么必须是"入口分派"而不是散点 if：`finishSeason` 里住着 E-1~E-7 **七处**副作用
       （荣誉段 / StarFavor 共振 / careerLog / ClubEvents.onSeasonEnd / Division.settle /
         ccQual / contract.years-- / seasonsPlayed++），而 `ClubEvents` 又是 6 模块链式覆盖（R18）
       → 散点打补丁必漏，且**漏了全静默**。

     本函数只做四件事（设计稿 §7.4.1 一句话口径）：
       ① 青年荣誉评选 → `d.youth.trophies`（**绝不写 `d.trophies`**，A4 容器隔离 → J2⑤）
       ② `Growth.seasonEnd`（吃 `d.seasonStats` —— 这正是"青训期 seasonStats 照写"的原因）
       ③ 履历 → `d.youth.log`（**绝不写 `d.careerLog`** → J1）
       ④ `d.seasonStats` 重置 + `d.season++`

     以下副作用**一律不执行**（逐条都有判据；别在这里加回来）：
       · `d.stats.*` 5 个字段（apps/goals/assists/ratingSum/motm）→ J3「`d.stats` 全量逐位不变」
         （★ 真正的写入点在 `v2/settlement.js` 的结算块，那里才是 `d.stats.apps++` 的唯一现场）
       · `ClubEvents.onSeasonEnd` → R17/R19（链首 `clubGoals/clubApps` **无条件**累加 + 一次性标志位）→ J11
       · `Division.settle` → A5（用青年榜排名判升降级 → 14 岁降级到中甲）→ J6
       · `d.ccQual` / `d.contract.years--` / `d.stats.seasonsPlayed++` → J5/J6
       · `StarFavor` 荣誉共振（其闸门是 `/金靴|助攻王|最佳阵容|金冕奖/` 正则）
       · `genTransferOffers`（转会报价）
     逐字段处理（R27）：上面每一条都是**具名**字段/调用，不是"整体复制成年实现再删几行"
       —— 整体式写法（`v2/settlement.js:154-158` 那种"一行两写"）表达不了"按字段分流"。
     ★ 提拔判定与 17 岁强制出口**不在本批**（批 4：career.js 路由 + `PROMOTE_LINE` 待标定 A15）。 */
  Youth.finishYouthSeason = function (state) {
    const d = state.data;
    Youth.ensure(d);
    const growth = Growth.seasonEnd(state);                     // ② 吃 d.seasonStats（不是 d.stats）
    const table = SeasonSystem.standings(state);
    const myRank = table.findIndex(t => t.id === d.clubId) + 1;
    const season = d.seasonStats || { apps: 0, goals: 0, assists: 0, ratingSum: 0, motm: 0 };
    const avgRating = season.apps ? (season.ratingSum / season.apps) : 0;
    const ylg = Youth.leagueOf(d);
    const H = (window.CONFIG && CONFIG.YOUTH && CONFIG.YOUTH.HONOR) || {};
    const honors = [];
    /** ★ 荣誉**只**进 `d.youth.trophies`（A4）—— 这里若手滑写 `d.trophies`，
        J2⑤（`d.trophies.length === 0`）会红，且 `Legacy.classify`/`career.js:373` 的通路全部被污染。
        ★★ 命名清单见下方：**不得**含「冠军 / 登顶 / 问鼎 / 夺魁」族用词（A6）。 */
    const give = (name) => { honors.push(name); d.youth.trophies.push({ name: name, icon: "", season: d.season, youth: true }); };
    const firstYouthSeason = d.youth.log.length === 0;

    /* 七项青年荣誉（★ 命名与设计稿 §5.3 逐字一致；A6：**不得**含「冠军/登顶/问鼎/夺魁」族用词）
       ★ 全部为**阈值式、零 R 消耗**：荣誉由数据算出来，不掷骰 —— 保证探针可在同 seed 下逐位复现。
       ★ NPC 线的数值一律走 `CONFIG.YOUTH.HONOR` 单一真相源（A15：标定值先跑探针再反解，不写在逻辑里）。 */
    const avgStr = (ylg && ylg.teams && ylg.teams.length)
      ? ylg.teams.reduce((s, t) => s + (t.strength || 0), 0) / ylg.teams.length : 45;
    const bootLine = Math.round((H.BOOT_BASE || 8) + avgStr * (H.BOOT_SLOPE || 0.10));
    const assistLine = Math.round((H.ASSIST_BASE || 5) + avgStr * (H.ASSIST_SLOPE || 0.08));
    const starScore = avgRating * 10 + (season.goals || 0) * 2 + (season.assists || 0) * 1.5;

    if (myRank === 1) give("青年联赛优胜");                                  // 青年联赛 myRank === 1
    if (d.cup && d.cup.alive === "champion") give("青年杯优胜");              // 青年杯夺冠
    if ((season.goals || 0) > bootLine) give("青年联赛射手王");               // 射手王（NPC 线按青年联赛强度派生）
    if ((season.assists || 0) > assistLine) give("青年联赛助攻榜首");          // 助攻榜首（同上）
    if (starScore > (H.STAR_LINE || 100)) give("青年联赛年度之星");            // 公式同造成年、参数独立
    if (avgRating >= (H.SQUAD_RATING || 7.3) && (season.apps || 0) >= (H.SQUAD_APPS || 20)) give("青年联赛年度阵容");
    if (firstYouthSeason && (season.goals || 0) + (season.assists || 0) >= (H.ROOKIE_GA || 6)) give("青年联赛新人王");

    // ③ 履历 → `d.youth.log`（结构镜像 careerLog，但**容器不同**；`Legacy.detail` 的 youthApps 读它的 .apps）
    d.youth.log.push({
      season: d.season, club: (Youth.teamById(d.clubId) || {}).name || d.clubId,
      league: (ylg || {}).name || d.leagueId, apps: season.apps, goals: season.goals, assists: season.assists,
      avgRating: Math.round(avgRating * 10) / 10, rank: myRank, awards: honors.slice(),
    });
    // 学徒合同：只递减 `d.youth.contractYears`，**不碰** `d.contract.years`（两套合同，§7.4）
    d.youth.contractYears = Math.max(0, (d.youth.contractYears || 0) - 1);
    d.youth.seasons = (d.youth.seasons || 0) + 1;

    /* ══════════════════════════════════════════════════════════════════════════════
       ★★★ P113（2026-09-17 用户拍板）：**青训生命周期邀约** —— 只产出数据，不改相位。
       ------------------------------------------------------------------------------
       ── 口径（消费点 = v2/flow.js 的青训结算卡）──
         ① age ≥ PROMOTE.MIN_AGE(16) 且 OVR ≥ 母队成年强度 − LINE_GAP(16)
            ⇒ `type:"promotion"` —— 一线队征召（接受 = nextClub 指回母队 + leave("promoted")）；
         ② age ≥ 16 但未达线 ⇒ `type:"buyOffers"` —— 低级别球队求购 ≤ BUY_MAX(2) 支
            （接受 = nextClub + leave("drop")，走既有「转投低级别」通道）；
         ③ age ≥ FORCE_EXIT_AGE(19) 且仍未达线 ⇒ `type:"graduate"` —— 强制毕业，
            三份低级别报价（GRAD_OFFERS）必选其一（或回母队报道，由 _forceYouthExit 兜底兜住）。
       ── 确定性纪律 ── 本函数荣誉段**零 R 消耗**（§5.3 注释），邀约段延续：
         求购池按强度排序后**等距抽样**（不掷骰）—— 同 seed 逐位复现不破。
       ── 薪资口径 ── 职业合同报价 = `Career.wageOf(ovr, 强度, 0.5)`（随机位固定 0.5），
         下限 3000/周（中甲职业底薪，与学徒 FLOOR 500 拉开档次）。
       ══════════════════════════════════════════════════════════════════════════════ */
    let lifecycle = null;
    if (d.player && window.PlayerSystem && !d.retired) {
      const ovr = PlayerSystem.overall(d.player);
      const age = d.player.age;
      const PM = (window.CONFIG && CONFIG.YOUTH && CONFIG.YOUTH.PROMOTE) || {};
      const minAge = PM.MIN_AGE != null ? PM.MIN_AGE : 16;
      const lineGap = PM.LINE_GAP != null ? PM.LINE_GAP : 16;
      const forceAge = (window.CONFIG && CONFIG.YOUTH.FORCE_EXIT_AGE != null) ? CONFIG.YOUTH.FORCE_EXIT_AGE : 19;
      /* ★★ P296（玩家实测「转会棉都红魔后征召把人拽回雾都蓝狮」）：提拔线与征召对象必须跟
         **当前**效力青年队的母队走 —— academyId 只是**入营时**的初始记录（转会/未来换营
         通道都可能让它过期）。青年队 id 铁则 = "y"+成年 id（youth_data.js:95）⇒ 剥前缀即
         当前母队；解析失败（id 非法/表缺）回落 academyId —— 与旧行为逐位一致。 */
      const _curMotherId = (typeof d.clubId === "string" && d.clubId.charAt(0) === "y" && window.teamById && teamById(d.clubId.slice(1)))
        ? d.clubId.slice(1) : d.youth.academyId;
      const mom = (_curMotherId && window.teamById) ? teamById(_curMotherId) : null;
      const momStr = (mom && mom.strength) || 60;
      const promoteLine = momStr - lineGap;
      /* 低级别求购池：强度 ≤ OVR + SLACK（保证去了能进轮换，不复制 P107 的"够不着还让去"）
         且低于母队强度（"往上够不着、往下有球踢"） */
      const buyPool = [];
      if (window.LD) {
        for (const _lid of Object.keys(LD())) {
          const _lg = LD()[_lid];
          if (!_lg || !Array.isArray(_lg.teams)) continue;
          for (const t of _lg.teams) {
            if (t.id === _curMotherId) continue;   // ★ P296：排除的是当前母队（原写死 academyId）
            const s = t.strength || 60;
            if (s <= ovr + (PM.BUY_STRENGTH_SLACK != null ? PM.BUY_STRENGTH_SLACK : 6) && s < momStr) {
              buyPool.push({ t: t, lid: _lid });
            }
          }
        }
      }
      buyPool.sort((a, b) => (b.t.strength || 60) - (a.t.strength || 60) || (a.t.id < b.t.id ? -1 : 1));
      const quoteWage = (t) => (window.Career && Career.wageOf)
        ? Math.max(3000, Math.round(Career.wageOf(ovr, t.strength || 60, 0.5))) : 3000;
      const toOffer = (p) => ({ clubId: p.t.id, clubName: p.t.name, leagueId: p.lid, leagueName: (LD()[p.lid] || {}).name || p.lid, wage: quoteWage(p.t) });
      /* 等距抽样：排序池上取第 0 / step / 2step … 支（覆盖强中弱，零 R） */
      const spread = (arr, n) => {
        const out = [];
        if (!arr.length) return out;
        const step = Math.max(1, Math.floor(arr.length / n));
        for (let i = 0; i < arr.length && out.length < n; i += step) out.push(arr[i]);
        return out;
      };
      if (age >= forceAge && ovr < promoteLine) {
        lifecycle = {
          type: "graduate", promoteLine: promoteLine, ovr: ovr,
          gradOffers: spread(buyPool, PM.GRAD_OFFERS != null ? PM.GRAD_OFFERS : 3).map(toOffer),
        };
      } else if (age >= minAge && ovr >= promoteLine) {
        lifecycle = {
          type: "promotion", promoteLine: promoteLine, ovr: ovr,
          promotion: {
            clubId: _curMotherId, clubName: mom ? mom.name : String(_curMotherId),   // ★ P296：征召对象 = 当前母队
            leagueId: mom ? mom.league : null, leagueName: (mom && mom.league && window.LD && LD()[mom.league]) ? LD()[mom.league].name : "",
            wage: quoteWage(mom || { strength: momStr }),
          },
        };
      } else if (age >= minAge && buyPool.length) {
        lifecycle = {
          type: "buyOffers", promoteLine: promoteLine, ovr: ovr,
          buyOffers: spread(buyPool, PM.BUY_MAX != null ? PM.BUY_MAX : 2).map(toOffer),
        };
      }
    }

    /* B3：`Legacy.sync` 青训期**照常调用** —— 它写的是 `本周目 + Meta.points()`（历史周目累积），
       不调则第 2 周目开局面板显示陈旧值（玩家以为上周目白打）。
       ★ 幂等；失败已有 try/catch 兜底（与 season.js:531 同口径）。 */
    if (window.Legacy) { try { Legacy.sync(d); } catch (e) { /* 积分失败不影响结算 */ } }

    // ④ 重置 + 赛季推进（★ `d.stats.seasonsPlayed` **不动** → J5）
    /* ★ P153b：同 season.js —— 清零前快照本季账本（赛季报告/赛季史防 0 数据，成年侧同款） */
    d._lastSeasonStats = Object.assign({ season: d.season }, d.seasonStats || {});
    d._seasonSettled = true; // ★ P284（方案 A）：本季结算完成落账（幂等守卫置位，initYouthSeason 复位）
    d.season++;
    d.seasonStats = { apps: 0, goals: 0, assists: 0, ratingSum: 0, motm: 0 };
    return {
      growth: growth, myRank: myRank,
      /* ★ P113：青训生命周期邀约（promotion / buyOffers / graduate；消费点 = v2/flow.js 结算卡。
         相位**不在这里改** —— 接受邀约由 UI 写 nextClub + Youth.leave（唯一转移写点仍在 youth.js）。 */
      lifecycle: lifecycle,
      /* ★★★ 返回值的 `awards` **恒为空数组**（J2④）—— 这一条**不是**形式统一，是必须：
         成年侧 `result.awards` 有**三个落点**，每一个都会把青训荣誉带进职业体系：
           ④a `v2/flow.js:17` → `Skills.seasonGain(result, d)`（SP 结算，按其正则/名次分支）
           ④b `v2/flow.js:22` → `d._lastSeasonResult.awards`（**落盘**）
           ④c `v2/flow.js:26` → `d.lastSeasonAwards`（**落盘**，被 `season_report.js:82` 读 → 赛季报告 UI）
         → ★ 只看 ④a 不够：**青训荣誉会从赛季报告这条支路溜回来**。
         青训荣誉的**唯一出口**是 `d.youth.trophies` + `d.youth.log[].awards`（批 5 的 UI 读它）。 */
      awards: [], offers: [], avgRating: Math.round(avgRating * 10) / 10, crownScore: 0, youth: true,
    };
  };

  window.Youth = Youth;
})();
