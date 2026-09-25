/* ============================================================================
   赛季系统 — 联赛赛程/积分榜/国内杯赛/国家队/赛季结算（忠实原版赛制结构）
   ============================================================================ */
(function () {
  const DATA = window.GAME_DATA;
  const LD = () => DATA.leagues;

  function teamById(id) {
    for (const [lid, lg] of Object.entries(LD())) {
      const t = lg.teams.find(t => t.id === id);
      if (t) return Object.assign({}, t, { league: lid });
    }
    return null;
  }
  window.teamById = teamById;
  window.LD = LD; // 供广告系统读取联赛数据

  // ── 德比对（clubId 成对，判定"关键战"用；id 为 data_real.js 装配后的 lid_NN 结构）──
  const DERBY_PAIRS = [
    ["epl_01", "epl_05"], ["epl_01", "epl_14"], ["epl_02", "epl_06"], ["epl_03", "epl_05"], ["epl_04", "epl_06"], // 双红会/默西塞斯德/北雾都/曼市/雾都
    ["laliga_01", "laliga_02"], ["laliga_01", "laliga_03"], ["laliga_02", "laliga_20"],                           // 国家德比/曼德里/加泰
    ["bundesliga_01", "bundesliga_03"],                                                                            // 德国国家德比
    ["seriea_01", "seriea_04"], ["seriea_03", "seriea_10"], ["seriea_06", "seriea_07"],                            // 米岚/都林/永恒城
    ["ligue1_01", "ligue1_02"],                                                                                    // 法国国家德比
    ["csl_01", "csl_02"], ["csl_03", "csl_04"], ["csl_09", "csl_11"],                                              // 魔都/京鲁/琴岛
  ];
  const DERBY_SET = new Set(DERBY_PAIRS.map(p => p.slice().sort().join("|")));

  const SeasonSystem = {
    /** 新赛季：生成赛程 + 杯赛 + 积分榜 */
    initSeason(state, clubId, leagueId) {
      const d = state.data;
      /* ★ P284（方案 A）：新赛季开季 = 幂等守卫复位点。finishSeason 结算完成置
         d._seasonSettled = true 后，只有走到这里才允许下一季再结算——结算卡/
         赛季报告展示期间刷新或重载，Hub.refresh 的触发条件虽仍满足（offseason
         未置 + pending 空），finishSeason 入口守卫会拦截第二次结算。旧档无此
         字段 = undefined = 未结算 = 正常放行，零迁移。 */
      d._seasonSettled = false;
      // 赛季末广告配额重置（转会报价刷新）
      if (d.adUsage) d.adUsage.transferSeason = 0;
      if (window.Transfer) { Transfer.ensure(d); Transfer.resetWindow(d); } // P61 槽位 + P62 窗口旗标重置
      d.clubId = clubId; d.leagueId = leagueId;
      if (window.ClubEvents) { try { ClubEvents.onInitSeason(state, clubId); } catch (e) { console.warn("club init", e); } } // P63 俱乐部线：加盟/回归/阵容注入/新季队列
      // 新赛季重置：日期回到**本联赛赛季起点**（P100-B1：LEAGUE_CALENDAR，欧洲跨年 8 月中／中超 3 月上），士气回归
      d.date = CONFIG.calStart(leagueId, d.season);
      /* ★ P171：赛季末疲劳缓解（−60）随疲劳机制退役删除。 */
      d.morale = Math.max(65, d.morale);
      d.injuryDays = 0;
      const lg = LD()[leagueId];
      let teams = lg.teams.map(t => ({ id: t.id, name: t.name, strength: t.strength }));
      /* P81j 升降级：玩家队不在本联赛名单（降级/升级迁移后 id 仍属原联赛命名空间）→ 顶替最弱队席位。
         保留玩家队名与强度、维持联赛规模（16 队 30 轮）——现实中即"降级队占据中甲一个席位"。 */
      if (window.Division && !teams.some(t => t.id === clubId)) {
        const mine = (typeof teamById === "function") ? teamById(clubId) : null;
        if (mine) teams = teams.slice(0, -1).concat([{ id: mine.id, name: mine.name, strength: mine.strength }]);
      }
      /* ★ P99 批 2：赛程构造已抽为 `SeasonSystem._buildLeagueFixtures`（纯函数、逐位等价）；
         青训路径 `Youth.initYouthSeason` 复用同一实现（避免"两个赛季类型两份赛程代码"）。
         这里用显式 `SeasonSystem.` 调用而非 `this.` —— 不依赖调用方的 this 绑定。 */
      /* ★ P100-B2：REAL_SCHEDULE.datePlan 存在 → 联赛赛程用**真实轮次日期**（day = 轮日期相对
         赛季起点的偏移，揭幕战 = 赛季首日）；否则走抽象轴（每 gap 天一轮）。 */
      /* ★ P100-B3 补赛季门：REAL_SCHEDULE 只覆盖开局季（Q2 拍板"仅 2014-15 真实"），
         之后赛季按真实节奏生成（gap 周赛）——否则 2015+ 每季都复用 2014 日期表 = 跨季残留。
         ★ 注意取值：条件链最后必须是 _raw 本身（若以布尔比较结尾，_dp 会变成 true 而丢掉 dates）。 */
      const _rsSeason = (window.REAL_SCHEDULE && window.REAL_SCHEDULE.meta && window.REAL_SCHEDULE.meta.season) || "2014";
      const _dpRaw = (window.REAL_SCHEDULE && window.REAL_SCHEDULE.leagues && window.REAL_SCHEDULE.leagues[leagueId]) || null;
      let _dp = (_dpRaw && String(d.season) === String(_rsSeason)) ? _dpRaw : null;
      if (_dp) {
        const _st = CONFIG.calStart(leagueId, d.season);
        _dp = Object.assign({}, _dp, { _anchorMs: Date.UTC(_st.year, _st.month - 1, _st.day, 12) });
      }
      const fixtures = SeasonSystem._buildLeagueFixtures(teams, clubId, CONFIG.calOf(leagueId).gap, _dp, leagueId, d.season);

      // 国内杯赛：R16 → QF → SF → F（同联赛 16 强）
      const pool = LD()[leagueId].teams.slice();
      // 无偏 Fisher-Yates 洗牌（与 Lua Season.shuffleForCup 同序：i 从 n 递减到 2，j = R.int(1, i)）
      // 旧实现 sort(() => R.next() - 0.5) 有两个问题：调用次数取决于 JS 引擎的排序算法
      // （两端随机序列必然分叉），且有偏。B 档一致性要求两端同构，故统一为 Fisher-Yates。
      const shuffled = (function (arr) {
        const a = arr.slice();
        for (let i = a.length; i >= 2; i--) {
          const j = R.int(1, i);
          const t = a[i - 1]; a[i - 1] = a[j - 1]; a[j - 1] = t;
        }
        return a;
      })(pool).slice(0, 16);
      const cupRounds = [16, 8, 4, 2];
      let cupTeams = shuffled.map(t => ({ id: t.id, name: t.name, strength: t.strength }));
      let cupDay = 20;
      const cup = { stage: 0, teams: cupTeams, roundNames: { 16: "十六强", 8: "八强", 4: "半决赛", 2: "决赛" }, alive: true, results: [] };
      for (let st = 0; st < 4; st++) {
        // 用户在该阶段的对手（每轮随机抽取）
        if (cup.alive) {
          const others = cupTeams.filter(t => t.id !== clubId);
          const opp = others.length ? R.pick(others) : { id: "x", name: "待定对手", strength: 70 };
          const userIsHome = R.chance(0.5);
          fixtures.push({ type: "cup", stage: st, day: cupDay, match: { home: userIsHome ? teamById(clubId) : opp, away: userIsHome ? opp : teamById(clubId) }, played: false, result: null, cup: true });
        }
        cupDay += 56;
      }

      // ── 洲际赛场（G4/G5）：上季 rank≤4 顶级洲际杯（联赛阶段 8 轮 + 16 强淘汰赛）/ 5-6 二级洲际杯 ──
      d.cc = null; d.scc = null;
      if (d.ccQual === "top") this._genContCup(state, clubId, fixtures, CONFIG.calOf(leagueId).gap);
      else if (d.ccQual === "second") this._genSecondCup(state, clubId, fixtures);
      /* ★ P100-B2：真实日期轴下，杯赛/洲际赛 day 与真实联赛日冲突 → 顺延平移（联赛优先）。
         抽象轴下天然错位（mod gap 设计），此函数只在 datePlan 分支实际起作用。 */
      if (_dp) {
        const _used = new Set(fixtures.filter(x => x.type === "league").map(x => x.day));
        for (const f of fixtures) {
          if (f.type === "league") continue;
          let g = 0;
          while (_used.has(f.day) && g++ < 14) f.day++;
          _used.add(f.day);
        }
      }
      d.fixtures = fixtures;
      d.cup = cup;
      d.matchPlan = {}; // ★ P100-A1（R3 防线）：新赛程新键名，旧勾选整表清空——防跨季残留（d.ccQual 教训同型）
      d.anchorUsed = {}; // ★ P100-B3：名局直灌消费账（每键每季至多注入一次），赛季重置
      /* ★★ P161（2026-09-19 用户拍板）：联赛生态动态化 —— 每季开季对各 AI 队做强度重排。
         此前 d.table 每季从 LD() 静态重拷 ⇒ 强度恒定 ⇒ 强队恒强、连冠漫天（用户抱怨）。
         此刻 d.table 还是**上季最终榜**——先存引用再覆盖，交给 applySeasonDynamics 读榜驱动。
         开局季（oldTable 无场次）不漂移（真实锚定拟合模型接管）。 */
      const _p161OldTable = d.table;
      d.table = teams.map(t => ({ id: t.id, name: t.name, strength: t.strength, p: 0, w: 0, dr: 0, l: 0, gf: 0, ga: 0, pts: 0 }));
      this.applySeasonDynamics(state, _p161OldTable);
      d.fixtures.sort((a, b) => a.day - b.day);
      d.dayIndex = 0;
      d.seasonStats = { apps: 0, goals: 0, assists: 0, ratingSum: 0, motm: 0 };
      /* ★ P97 缺陷修复（「字段没人写」型）：`d.ovrSeasonStart` 被赛季账单读取 ——
         `season_report.js` 用它算 `ovrDelta`，而 `ovrDelta` 有**两处真实用途**：
           ① 账单正文/明细行显示「总评 84（本季 +2）」；
           ② **评级规则**：`sum.ovrDelta >= 3` 时中等战绩可从 C 升到 B。
         但全仓**没有任何地方写它** → `d.ovrSeasonStart != null` 恒 false →
         账单永远显示「本季 +0」，评级也永远少升一档（两处都静默）。
         ★ 写入点必须在**赛季初始化**（这里是本赛季状态唯一的重置时点）——
           若放到赛季末结算里写，delta 恒为 0，等于没修。 */
      d.ovrSeasonStart = (window.PlayerSystem && d.player) ? PlayerSystem.overall(d.player) : null;
    },

    /* ── ★ P99 批 2：联赛赛程构造（自 initSeason 原样抽出，行为必须逐位不变）──
       为什么抽：青训赛季要**复用同一套赛程算法**（否则"两个赛季类型两份赛程代码"，
       任何赛程修复都得改两处 = 经典的双源分叉）。抽出的函数**必须**是纯的：
         · 只依赖入参 (teams, clubId)
         · 不读全局（CONFIG / LD / dossier）、**不消耗 R**、无副作用（不改 d）
       这正是"抽取可证明等价"的前提 —— 证据见 tools/_p99_fixtures_snapshot.js
       的 fixtures JSON 逐位对拍（任务书要求的直接证据）+ soak 三种子指纹。
       ★ teams 的元素必须是"比赛引擎需要的完整队对象"：成年路径只给 3 字段
         （id/name/strength，靠 match.js 的 `|| teamObj` 回落 teamById 取回完整队）；
         **青训路径必须带上 `players`**（青年队不在 LD()，teamById 必然 null）—— 见 ADR-3 约束。
       ★ clubId 决定每轮取哪场作为玩家比赛（`round.find`），找不到时为 undefined ——
         成年与青训都不允许出现"找不到"（联赛必然包含玩家队，见 initYouthSeason 的断言）。 */
    _buildLeagueFixtures(teams, clubId, gap, datePlan, leagueId, season) {
      const n = teams.length;
      // 双循环（简化轮转算法）
      const rounds = [];
      const idx = teams.map((_, i) => i);
      for (let r = 0; r < n - 1; r++) {
        const round = [];
        for (let i = 0; i < n / 2; i++) {
          const a = idx[i], b = idx[n - 1 - i];
          round.push(r % 2 === 0 ? { home: teams[a], away: teams[b] } : { home: teams[b], away: teams[a] });
        }
        rounds.push(round);
        idx.splice(1, 0, idx.pop());
      }
      const secondHalf = rounds.map(rnd => rnd.map(m => ({ home: m.away, away: m.home })));
      const allRounds = rounds.concat(secondHalf);

      // 展开为按日期排列的赛程（轮间隔走 LEAGUE_CALENDAR.gap：P100-B1 真实节奏 = 7 天一周赛；
      //   首战留 3 天训练期。gap 由 initSeason 按联赛传入，未传时回落 8 = 旧行为）
      const step = gap || 8;
      const fixtures = [];
      /* ★ P100-B2：datePlan = 真实轮次日期表（ISO 数组）。day = 轮日期相对赛季起点的偏移
         （揭幕战 = 赛季首日 day 0）。datePlan 缺失或长度不符 → 回落抽象轴。 */
      const dpDates = (datePlan && Array.isArray(datePlan.dates) && datePlan.dates.length === allRounds.length) ? datePlan.dates : null;
      const anchorMs = (datePlan && datePlan._anchorMs != null) ? datePlan._anchorMs : null;
      /* ★ P100-B5：生成式抽象轴 → 逐轮检查真实日历日期是否落**国际比赛日窗口**（INTL_WINDOWS），
         落窗内顺延到窗外（俱乐部让路国家队；顺延联动 dayOffset 保持轮间隔，赛季尾自然拖长——
         结算唯一判据是 fixtures 清空，calEnd 只是休赛期起点换算，无强制断季路径）。
         datePlan 真实日期轴（2014-15）天然避窗，不走此分支。 */
      let avoidWin = null;
      if (!dpDates && leagueId && season && window.INTL_WINDOWS && CONFIG.calStart) {
        const st0 = CONFIG.calStart(leagueId, season);
        const baseMs = Date.UTC(st0.year, st0.month - 1, st0.day, 12);
        avoidWin = function (day) {
          const dt = new Date(baseMs + day * 86400000);
          const arr = window.INTL_WINDOWS[String(dt.getUTCFullYear())];
          if (!arr) return false;
          const v = (dt.getUTCMonth() + 1) * 100 + dt.getUTCDate();
          for (let i = 0; i < arr.length; i++) {
            const w = arr[i];
            if (v >= w.start[0] * 100 + w.start[1] && v <= w.end[0] * 100 + w.end[1]) return true;
          }
          return false;
        };
      }
      let dayOffset = 3;
      allRounds.forEach((round, ri) => {
        const mine = round.find(m => m.home.id === clubId || m.away.id === clubId);
        let day = dayOffset;
        if (dpDates && anchorMs != null) {
          day = Math.round((Date.parse(dpDates[ri] + "T12:00:00Z") - anchorMs) / 86400000);
          if (!isFinite(day) || day < 0) day = dayOffset;
        } else if (avoidWin) {
          let g = 0;
          while (avoidWin(day) && g++ < 20) day++;
          dayOffset = day; // 联动：后续轮从顺延后的位置起算，保持轮间隔且不回撞窗口
        }
        fixtures.push({ type: "league", round: ri + 1, day: day, match: mine, played: false, result: null, date: dpDates ? dpDates[ri] : null });
        dayOffset += step;
      });
      return fixtures;
    },

    cupPoolLeague(leagueId) {
      return leagueId; // 杯赛采用同联赛 16 强
    },

    /* ── 洲际赛场（G4/G5）── 洲际对手池：
       ★ P213（玩家实测「巴塞罗纳 VS 辽沈宁远」离谱对阵）：按玩家所在联赛大洲分层——
       · 欧洲玩家（epl/laliga/bundesliga/seriea/ligue1）：欧冠/欧联平行物，对手池**仅欧五联赛**
         （现实：欧冠无亚洲球队）；
       · 中国玩家（csl/chinaleague）：改打「球俱杯」/「球俱挑战杯」（世俱杯平行物，
         名为用户 2026-09-20 拍板），对手池保持全球混合——世俱杯语义下中超队碰欧洲豪门合理
         （现实参照：2015 恒大世俱杯半决赛 0-3 巴塞罗纳）。
       非（用户所在联赛 strength≥60 的俱乐部）按（强度降序、id 升序）排序——确定性选取，零随机消耗；
       P1-13：顶级杯分层抽样（等距取 35 强中弱皆有）、二级杯独立取 70-80 段 */
    _ccIsEurope(clubId) {
      return ["epl", "laliga", "bundesliga", "seriea", "ligue1"].indexOf(String(clubId || "").split("_")[0]) >= 0;
    },
    ccOpponentPool(clubId) {
      const euOnly = this._ccIsEurope(clubId);
      const pool = [];
      for (const [lid, lg] of Object.entries(LD())) {
        if (euOnly && ["epl", "laliga", "bundesliga", "seriea", "ligue1"].indexOf(lid) < 0) continue; // P213 欧冠平行物不混亚
        for (const t of lg.teams) {
          if (t.id === clubId || t.strength < 60) continue;
          pool.push({ id: t.id, name: t.name, strength: t.strength });
        }
      }
      pool.sort((a, b) => b.strength - a.strength || (a.id < b.id ? -1 : 1));
      return pool;
    },

    /** P1-13：全池等距取 n 支（分层：强中弱皆有，治精英池 89% 出局） */
    ccStratified(pool, n) {
      if (pool.length <= n) return pool.slice();
      const out = [];
      const stride = pool.length / n;
      for (let i = 0; i < n; i++) out.push(pool[Math.min(pool.length - 1, Math.floor(i * stride))]);
      return out;
    },

    /* 幽灵赛程判定：已淘汰的杯赛/洲际赛残余赛程（pendingFixtures/fixtureToday/nextFixture 统一口径） */
    _isGhostFixture(d, f) {
      if (f.type === "cup" && d.cup && d.cup.alive === false) return true;
      if (f.type === "cc_ko" && d.cc && d.cc.alive === false) return true;
      if (f.type === "scc" && d.scc && d.scc.alive === false) return true;
      return false;
    },

    /* ── 顶级洲际杯（G4）：联赛阶段 8 轮（36 队积分表）+ 16 强单场淘汰赛 ──
       他队积分在开季时用与 simulateRound 同构的强度胜率模型一次性预演（每队每轮 1 次 R.next），
       用户积分由实际比赛结果累计；联赛阶段结束按积分排名：前 16 晋级淘汰赛、9-24 落入二级杯
       ★ P213：杯名按玩家大洲（欧洲=洲际冠军杯，中国=球俱杯），cupName 落档 d.cc 供入账/UI 单源
       ★★ P295（用户拍板「比赛/成绩荣誉里也要区分亚冠欧冠」）：中立杯名退役为兼容态 ——
         新档杯名用大陆真实口径：顶级杯 欧洲=欧冠 / 中国=亚冠；二级杯 欧洲=欧联 / 中国=亚冠2。
         旧档已落档的「洲际冠军杯/球俱杯/洲际二级杯/球俱挑战杯」原样展示（奖杯名存档串不改写），
         全部消费点（_isChamp/legacy_hall/trophy_art/share_copy/data_ms4）改为**新旧名并认**。 */
    _genContCup(state, clubId, fixtures, gap) {
      const d = state.data;
      const isEU = this._ccIsEurope(clubId);
      const cupName = isEU ? "欧冠" : "亚冠";
      const me = teamById(clubId) || { id: clubId, name: "我的球队", strength: 70 };
      const table = [{ id: clubId, name: me.name, strength: me.strength, pts: 0 }]
        .concat(this.ccStratified(this.ccOpponentPool(clubId), 35).map(t => ({ id: t.id, name: t.name, strength: t.strength, pts: 0 }))); // P1-13 分层
      for (const row of table) {
        if (row.id === clubId) continue;
        const pWin = 0.15 + (row.strength - 55) * 0.012;
        for (let r = 0; r < 8; r++) {
          const roll = R.next();
          if (roll < pWin) row.pts += 3;
          else if (roll < pWin + 0.25) row.pts += 1;
        }
      }
      // 用户 8 轮对手：不放回抽取，主客各 50%；比赛日 7/15/23/.../63（与联赛日 3+8k、国内杯赛日 20+56k 错开）
      const remaining = table.filter(t => t.id !== clubId).map(t => ({ id: t.id, name: t.name, strength: t.strength }));
      for (let r = 0; r < 8; r++) {
        const idx = remaining.length ? R.int(0, remaining.length - 1) : 0;
        const opp = remaining.splice(idx, 1)[0] || { id: "cc_x", name: "待定对手", strength: 70 };
        const userIsHome = R.chance(0.5);
        fixtures.push({ type: "cc", round: r + 1, day: 7 + (gap || 8) * r, comp: cupName,
          match: userIsHome ? { home: me, away: opp } : { home: opp, away: me },
          played: false, result: null });
      }
      // 淘汰赛框架：对手从预演积分前 16 的他队中不放回确定（用户是否晋级由联赛阶段结果判定）
      const koPool = table.filter(t => t.id !== clubId).sort((a, b) => b.pts - a.pts || (a.id < b.id ? -1 : 1))
        .slice(0, 16).map(t => ({ id: t.id, name: t.name, strength: t.strength }));
      const koDays = [96, 152, 208, 264];
      const koNames = ["十六强", "八强", "半决赛", "决赛"];
      for (let st = 0; st < 4; st++) {
        const idx = koPool.length ? R.int(0, koPool.length - 1) : 0;
        const opp = koPool.splice(idx, 1)[0] || { id: "cc_ko_x", name: "待定对手", strength: 75 };
        const userIsHome = R.chance(0.5);
        fixtures.push({ type: "cc_ko", stage: st, day: koDays[st], comp: cupName + koNames[st], cupKO: true,
          match: userIsHome ? { home: me, away: opp } : { home: opp, away: me },
          played: false, result: null });
      }
      d.cc = { round: 0, table, koStage: 0, alive: true, rank: 0, results: [], koNames, cupName };
    },

    /* ── 二级洲际杯（G5）：16 队单场淘汰赛（上季 rank 5-6 直接获得资格 / 顶级杯联赛阶段 9-24 名落入）──
       比赛日 112/168/224/280（确保晚于顶级杯联赛阶段结束日 63，可承接降落入队）
       ★ P213：杯名按玩家大洲（欧洲=洲际二级杯，中国=球俱挑战杯），cupName 落档 d.scc */
    _genSecondCup(state, clubId, fixtures) {
      const d = state.data;
      const cupName = this._ccIsEurope(clubId) ? "欧联" : "亚冠2"; // P295：欧洲=欧联 / 中国=亚冠2（旧名兼容见 _genContCup 注）
      const me = teamById(clubId) || { id: clubId, name: "我的球队", strength: 70 };
      const pool = this.ccOpponentPool(clubId).filter(t => t.strength >= 70 && t.strength <= 80).slice(0, 16).map(t => ({ id: t.id, name: t.name, strength: t.strength })); // P1-13 二级杯独立池 70-80 段
      const days = [112, 168, 224, 280];
      const names = ["十六强", "八强", "半决赛", "决赛"];
      d.scc = { stage: 0, alive: true, results: [], names, dropped: false, cupName };
      for (let st = 0; st < 4; st++) {
        const idx = pool.length ? R.int(0, pool.length - 1) : 0;
        const opp = pool.splice(idx, 1)[0] || { id: "scc_x", name: "待定对手", strength: 65 };
        const userIsHome = R.chance(0.5);
        fixtures.push({ type: "scc", stage: st, day: days[st], comp: cupName + names[st], cupKO: true,
          match: userIsHome ? { home: me, away: opp } : { home: opp, away: me },
          played: false, result: null });
      }
    },

    /* 二级杯动态创建（顶级杯 9-24 名落入）：对手优先取同届 9-24 名他队，不足从洲际池补齐 */
    _genSecondCupDrop(state) {
      const d = state.data;
      const cupName = d.cc && (d.cc.cupName === "球俱杯" || d.cc.cupName === "亚冠") ? "亚冠2" : (this._ccIsEurope(d.clubId) ? "欧联" : "亚冠2"); // P213 随顶级杯大洲 + P295 新名（旧档球俱杯→亚冠2）
      const me = teamById(d.clubId) || { id: d.clubId, name: "我的球队", strength: 70 };
      const sorted = d.cc.table.slice().sort((a, b) => b.pts - a.pts || (a.id < b.id ? -1 : 1));
      const pool = sorted.slice(8, 24).filter(t => t.id !== d.clubId).map(t => ({ id: t.id, name: t.name, strength: t.strength }));
      for (const t of this.ccOpponentPool(d.clubId)) {
        if (pool.length >= 15) break;
        if (!pool.find(x => x.id === t.id)) pool.push({ id: t.id, name: t.name, strength: t.strength });
      }
      const days = [112, 168, 224, 280];
      const names = ["十六强", "八强", "半决赛", "决赛"];
      d.scc = { stage: 0, alive: true, results: [], names, dropped: true, cupName };
      for (let st = 0; st < 4; st++) {
        const idx = pool.length ? R.int(0, pool.length - 1) : 0;
        const opp = pool.splice(idx, 1)[0] || { id: "scc_x", name: "待定对手", strength: 65 };
        const userIsHome = R.chance(0.5);
        d.fixtures.push({ type: "scc", stage: st, day: days[st], comp: cupName + names[st], cupKO: true,
          match: userIsHome ? { home: me, away: opp } : { home: opp, away: me },
          played: false, result: null });
      }
    },

    /** 有效未赛场次（过滤已淘汰杯赛/洲际赛的幽灵赛程；赛季结束判定/缺席结算统一用这份口径） */
    pendingFixtures(state) {
      const d = state.data;
      if (!d.fixtures) return [];
      return d.fixtures.filter(f => !f.played && !this._isGhostFixture(d, f));
    },

    /** 当天是否有比赛（俱乐部优先，其次国家队；已出局的杯赛/洲际赛自动跳过）
     *  ★ P153 健壮性修复：fixtures 置空/未初始化时不崩（与上方 pendingFixtures 的
     *    `if (!d.fixtures) return []` 同款口径）—— 空表 = 无比赛 = 非比赛日卡，正常渲染。
     *    （sel_runtime 巡检实测：状态往返后 fixtures 可为 null，此前的裸 .find 是
     *     「主页」面板 5 状态全红的根因。） */
    fixtureToday(state) {
      const d = state.data;
      const leagueFx = ((d && d.fixtures) || []).find(f => !f.played && f.day === d.dayIndex && !this._isGhostFixture(d, f));
      if (leagueFx) return leagueFx;
      if (window.INTL) {
        const intl = INTL.onDay(state);
        if (intl && intl.type === "match") return intl.fixture;
      }
      return null;
    },

    nextFixture(state) {
      const d = state.data;
      /* ★ P266：补 P153 同款健壮性口径——fixtures 置空/未初始化时不崩（本文件 fixtureToday
         L363 与 pendingFixtures 均有 `|| []` 防护，唯独此处漏网，合成档/坏档下裸 .find
         抛 TypeError → homeCard 进 P172 兜底卡「界面渲染出错」。空表 = 无下一场 = null。 */
      return ((d && d.fixtures) || []).find(f => !f.played && !this._isGhostFixture(d, f)) || null;
    },

    /** 关键战判定：生涯首秀 / 国家队首秀 / 国家队大赛 / 杯赛淘汰赛 / 德比战 / 争冠对话 → 玩家亲自出战；其余可自动模拟 */
    matchImportance(state, fixture) {
      const d = state.data;
      /* ★★ P99 批 3（A9 / E-5 / 设计稿 §5.4）：青训期**整体短路**到 `Youth.importance`。
         成年口径在青训期至少有**三条**误判关键战的路径，且三条都不报错（逐条打补丁必漏）：
           ① `d.stats.apps === 0` → 青训期恒为真 → 30 轮全判「生涯首秀」→ **全直播**
           ② 争冠对话（`d.table[0].p >= 8`）→ 青训期 `d.table` 是**青年榜**
           ③ 保级大战（`d.table[0].p >= 10`）→ 同理，青年榜的"降级区"也触发
         ★ 德比判定在**这里**算：`DERBY_SET` 是本文件私有的**全库唯一一份德比表**，
           而青年队 id 是 `y + 成年 id` → 先剥前缀再比。若让 `youth.js` 自己再写一份，
           就成了"同一语义两处"（本轮反复出现的失效形态）。
         ★ 短路打在**第一行**：它同时挡掉后面所有 `d.table` 分支（争冠/保级）。 */
      if (window.Youth && Youth.inAcademy(d)) {
        const mm = fixture.match || fixture;
        const derby = DERBY_SET.has([(mm.home && mm.home.id) || "", (mm.away && mm.away.id) || ""]
          .map(id => String(id).replace(/^y/, "")).sort().join("|"));
        return Youth.importance(state, fixture, derby);
      }
      const m = fixture.match || fixture;
      const comp = fixture.comp || (fixture.match && fixture.match.comp) || "";
      const homeId = (m.home && m.home.id) || "";
      const awayId = (m.away && m.away.id) || "";
      const isIntlFx = !fixture.match && (!!comp || String(homeId).indexOf("nat_") === 0);
      // 生涯首秀：职业生涯第一场正式比赛永远亲自打
      /* ★ P99 批 3（设计稿 §5.4 的"第二道防线"）：口径收窄为「**一线队**正式比赛首秀」。
         ★ 诚实标注：在函数头短路存在的前提下，这一行**构造上不可达**（inAcademy 已在上面返回），
           所以它**没有判据覆盖**，价值是"将来有人拆掉短路时的绊线"而不是"被测试保护的行"。
           保留它的理由：设计稿明文建议（"顺手改为 && !Youth.inAcademy(d)"），且成本为一次布尔判断。 */
      if (d.stats.apps === 0 && !(window.Youth && Youth.inAcademy(d))) return { key: true, reason: "生涯首秀" };
      // 洲际赛场（G4/G5）：联赛阶段与淘汰赛全是关键战
      if (fixture.type === "cc" || fixture.type === "cc_ko" || fixture.type === "scc") return { key: true, reason: "洲际赛场" };
      // 国家队：大赛/世预赛 = 关键战；友谊赛除首秀外为普通场
      if (isIntlFx || comp) {
        if (comp.indexOf("友谊赛") >= 0) {
          if (d.intl && d.intl.career && d.intl.career.apps === 0) return { key: true, reason: "国家队首秀" };
          return { key: false, reason: "" };
        }
        return { key: true, reason: "国家队大赛" };
      }
      // 国内杯赛全是淘汰赛（R16→决赛）
      if (fixture.type === "cup") return { key: true, reason: "杯赛淘汰赛" };
      // 德比战
      if (DERBY_SET.has([homeId, awayId].sort().join("|"))) return { key: true, reason: "德比战" };
      // 争冠对话：双方都位列积分榜前三（至少 8 轮后积分才有意义）
      if (d.table && d.table.length && d.table[0].p >= 8) {
        const top3 = d.table.slice().sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga)).slice(0, 3).map(t => t.id);
        if (top3.indexOf(homeId) >= 0 && top3.indexOf(awayId) >= 0) return { key: true, reason: "争冠对话" };
      }
      // 保级大战：一方处于降级区（≥18 队取倒数 3 席，其余取 2 席）且与对手积分差 ≤4（≥10 轮后积分才有意义）
      if (fixture.type === "league" && d.table && d.table.length && d.table[0].p >= 10) {
        const n = d.table.length;
        const relSeats = n >= 18 ? 3 : 2;
        const ptsOf = id => { const row = d.table.find(t => t.id === id); return row ? row.pts : null; };
        const relIds = d.table.slice().sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga)).slice(n - relSeats).map(t => t.id);
        const hp = ptsOf(homeId), ap = ptsOf(awayId);
        if (hp != null && ap != null && (relIds.indexOf(homeId) >= 0 || relIds.indexOf(awayId) >= 0) && Math.abs(hp - ap) <= 4) {
          return { key: true, reason: "保级大战" };
        }
      }
      return { key: false, reason: "" };
    },

    /* ══ ★★ P161 联赛生态动态化（配置单源 CONFIG.LEAGUE_DYNAMICS）══════════
       动机（用户原话）：「球队除了各个联赛的豪门外，其他球队的实力要动态，即使是
       豪门，也应该冠军都有机会竞争，不要盲目出现某个球队拿一堆连冠的情况，除非是
       历史上真实出现了的，比如花都和慕城红星……尽量给更多球队参与感。」
       ── initSeason 每季触发（此刻 d.table 已重建为新赛季空表、oldTable 为上季最终榜）──
       · 玩家队（clubId）不漂移：玩家队的强度=队友班底，跟着玩家成长走；
       · 开局季（oldTable 无场次）不漂移：2014-15 有真实锚定拟合模型；
       · 随机游走：WALK_P 概率 ±1；
       · 冠军税：上季冠军 −(CHAMP_TAX + min(2, 连冠数−1))，白名单（真实王朝）×taxMul；
       · 垫底复兴：末 BOTTOM_N 名 +(1~3)；
       · 均值回归：与真实基线差 ≥ REGRESS_GAP 时向基线拉 1（防永久漂离真实世界观）；
       · 钳位：|strength − 基线| ≤ RANGE（强队不塌方、鱼腩不恒霸）；
       · 连冠账本 d.leagueDynasty = {id, count} 跨季持久（存档内）。 */
    applySeasonDynamics(state, oldTable) {
      const d = state.data;
      const CFG = CONFIG.LEAGUE_DYNAMICS;
      if (!CFG || !CFG.enabled) return;
      if (!oldTable || !oldTable.length || !(oldTable[0].p > 0)) return;
      const lg = LD()[d.leagueId];
      if (!lg) return;
      const baseOf = {};
      for (const t of lg.teams) baseOf[t.id] = t.strength;
      const sorted = oldTable.slice().sort((a, b) => (b.pts - a.pts) || ((b.gf - b.ga) - (a.gf - a.ga)));
      const champ = sorted[0];
      const dyn = d.leagueDynasty = d.leagueDynasty || { id: null, count: 0 };
      if (dyn.id === champ.id) dyn.count += 1;
      else { dyn.id = champ.id; dyn.count = 1; }
      const rankOf = new Map();
      sorted.forEach((row, i) => rankOf.set(row.id, i + 1));
      const n = d.table.length;
      for (const row of d.table) {
        /* ★ P301（玩家反馈「换队后新队从联赛第一变倒数」实锤修复，兄弟拍板方案 A）：
           玩家队不再跳过动态演化。原设计「玩家队不漂移：强度=队友班底跟着玩家成长走」
           的机制从未实现（config.js 注释承诺空悬）——实际效果是玩家队被钉死在静态基线，
           对手却按演化强度攒分 ⇒ 加盟即相对塌方滑向垫底。现与 AI 队同规则演化
           （游走/冠军税/垫底复兴/均值回归/钳位全适用），读数端 match.js clubStrength
           同步改为积分榜行优先，双源分叉就此闭合。 */
        const base = baseOf[row.id];
        if (base == null) continue;                            // 升降级顶替队等无基线行：保持
        let ds = R.chance(CFG.WALK_P) ? (R.chance(0.5) ? 1 : -1) : 0;
        const rank = rankOf.get(row.id) || n;
        const isChamp = row.id === champ.id;
        if (isChamp) {
          const info = teamById(row.id) || {};
          const wl = CFG.DYNASTY[info.name || row.name || ""];
          /* ★ 连冠陡增税：首冠 −CHAMP_TAX，之后每多连一季 ×1.5 陡增（−3 → −4.5 → −6…）——
             2 连后基本必易主；白名单乘 taxMul（慕城红星/花都 0.4 → 王朝连冠可持续，
             恒大 0.75 → 保留魔都浦潮式夺权空间）。 */
          const streak = Math.max(0, dyn.count - 1);
          ds -= (CFG.CHAMP_TAX + streak * CFG.CHAMP_TAX * 1.5) * (wl ? wl.taxMul : 1);
        } else {
          /* ★ 均值回归只对非冠军队生效：冠军税季若同时被回归拉回，税会被吃掉
             （首跑实测：英超雾都蓝狮 4 连冠=税 −2 vs 回归 +1+游走）。 */
          const gap = base - row.strength;
          if (Math.abs(gap) >= CFG.REGRESS_GAP) ds += gap > 0 ? 1 : -1;
        }
        if (rank >= n - CFG.BOTTOM_N + 1) ds += 1 + R.int(0, 2);
        let ns = Math.round(row.strength + ds);
        ns = Math.max(base - CFG.RANGE, Math.min(base + CFG.RANGE, ns));
        row.strength = ns;
      }
    },

    /* ★★ P178（2026-09-20 用户拍板「缺席不能 0:3 判负，要模拟球队真实战绩」）：
       玩家缺席场的**球队模拟**单源。比分 = simulateRound 同源泊松强度模型（主队 HFA +2.5，
       λ = 1.35 ± ΔS×0.06），叠加「核心缺阵」小幅削弱：
         玩家 OVR 超出本队强度的部分 ×0.15（封顶 −4）—— 替补/边缘球员缺阵 ≈ 无损，
         队内头牌缺阵最多让全队 −4 强度点（≈ 半个 HFA）。
       联赛/杯赛/洲际通吃（按主客强度直接泊松，无赛制差异）；R 消耗 = 2 次 poissonSample。 */
    simulateAbsentMatch(state, fixture) {
      const d = state.data;
      const userIsHome = fixture.match.home.id === d.clubId;
      const myRow = d.table.find(t => t.id === d.clubId);
      const oppRow = d.table.find(t => t.id === (userIsHome ? fixture.match.away.id : fixture.match.home.id));
      const oppS = oppRow ? oppRow.strength : 62;
      let myS = myRow ? myRow.strength : 62;
      const myOvr = (window.PlayerSystem && d.player) ? PlayerSystem.overall(d.player) : null;
      if (typeof myOvr === "number" && !isNaN(myOvr) && myRow) {
        const drop = Math.min(4, Math.max(0, myOvr - myRow.strength) * 0.15);
        myS -= drop;
      }
      const dS = (userIsHome ? (myS + 2.5) - oppS : myS - (oppS + 2.5));
      const my = poissonSample(Math.max(0.2, 1.35 + dS * 0.06));
      const opp = poissonSample(Math.max(0.2, 1.35 - dS * 0.06));
      return userIsHome ? { home: my, away: opp } : { home: opp, away: my };
    },

    /** 快速模拟同轮其他比赛并更新积分榜（排除用户队与其本轮对手，避免重复记账） */    simulateRound(state, fixture, opts) {      const d = state.data;
      /* opts.includeAll：世界重建（赛季中转会）用——新队也要有历史场次，跳过集置空
         （20 队偶数可完整配对；不带此参时跳过玩家队+本轮对手，池为 n-2 偶数）。 */
      const skip = new Set((opts && opts.includeAll) ? [] : [d.clubId]);
      if (fixture && fixture.match) {
        if (fixture.match.home) skip.add(fixture.match.home.id);
        if (fixture.match.away) skip.add(fixture.match.away.id);
      }
      // P0-7：配对战模型（原为每队独立掷骰 → ΣW≠ΣL、垫底 43 分）。Fisher-Yates 洗牌两两配对，
      // 主客 HFA +2.5 强度点，泊松比分，保证 ΣW==ΣL、ΣGF==ΣGA；标定：冠军(91)≈87 分、垫底(74)≈22-28 分。
      const pool = d.table.filter(row => !skip.has(row.id));
      for (let i = pool.length - 1; i >= 1; i--) { const j = R.int(0, i); const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
      /* ★ P100-B3：真实比分导入（名局直灌，Q3/C7）。锚定三闸门：
         ① 赛季 = REAL_RESULTS_2014.season（仅开局季真实）
         ② 双方均非玩家生涯效力俱乐部（世界线分叉：参与后分叉、永久不合流）
         ③ 名局键命中且本存档未消费（d.anchorUsed）
         命中 → 强制配对并按名局键的主客朝向直灌真实比分；未命中 → 既有泊松强度模型。
         守恒律由段尾统一记账保证（每场恰好更新 2 行：Σp = 2×场次、ΣGF = ΣGA 不变式）。 */
      const used = new Set();
      const matches = [];
      const _A = window.REAL_RESULTS_2014;
      const anchOn = this._anchorActive(d);
      if (anchOn) {
        const F = _A.famous;
        for (let x = 0; x < pool.length; x++) {
          if (used.has(x)) continue;
          for (let y = x + 1; y < pool.length; y++) {
            if (used.has(y)) continue;
            const k1 = pool[x].id + "|" + pool[y].id, k2 = pool[y].id + "|" + pool[x].id;
            let sc = null, key = null, h = null, a2 = null;
            if (F[k1] && !(d.anchorUsed && d.anchorUsed[k1])) { sc = F[k1]; key = k1; h = pool[x]; a2 = pool[y]; }
            else if (F[k2] && !(d.anchorUsed && d.anchorUsed[k2])) { sc = F[k2]; key = k2; h = pool[y]; a2 = pool[x]; }
            if (sc && !this._isCareerClub(d, h.id) && !this._isCareerClub(d, a2.id)) {
              matches.push({ home: h, away: a2, hg: sc[0], ag: sc[1], key: key });
              used.add(x); used.add(y); break;
            }
          }
        }
      }
      const rest = pool.filter((_, i) => !used.has(i));
      /* ★ P100-B3 配额导向（拟合参数，推导与标定过程见 docs/P100_真实赛程与赛事日历_规格_v1.0.md §5.2：
         20 队期望 ±1.1 分内；λ 轨迹控制 10 种子标定 λ=1.6 → 雾都蓝狮冠军 10/10）：
         用真实积分榜的**赛程调整率** q = rA − (Σr − rA)/(n−1)（扣掉自身排除的对手强度偏差）
         驱动结果概率；**静态率、无反馈回路**（反馈会均值回归压平全联盟——已验证否决）。
         双方均可锚定（非玩家生涯俱乐部 + finalTables 有行）→ 拟合模型；否则泊松强度模型。 */
      const FT = anchOn && _A.finalTables && _A.finalTables[d.leagueId];
      const qOf = FT ? (function () {
        /* q = 赛程调整积分率（一次预算全表并缓存）；静态率——不随已赛进程反馈 */
        const ids = Object.keys(FT.teams);
        const sumAll = ids.reduce((s2, tid) => s2 + FT.teams[tid][1], 0) / FT.games;
        const cache = {};
        return function (row) {
          const t = FT.teams[row.id];
          if (!t) return null;
          if (cache[row.id] === undefined) {
            cache[row.id] = t[1] / FT.games - (sumAll - t[1] / FT.games) / (ids.length - 1);
          }
          return cache[row.id];
        };
      })() : null;
      const gdOf = FT ? (row) => {
        const t = FT.teams[row.id];
        return t ? (t[2] - t[3]) / FT.games : 0;
      } : null;
      for (let i = 0; i + 1 < rest.length; i += 2) {
        const a = rest[i], b = rest[i + 1];
        const homeFirst = R.chance(0.5);
        const home = homeFirst ? a : b, away = homeFirst ? b : a;
        let hg, ag;
        const qH = qOf ? qOf(home) : null, qAw = qOf ? qOf(away) : null;
        if (qH !== null && qAw !== null && !this._isCareerClub(d, home.id) && !this._isCareerClub(d, away.id)) {
          /* 拟合模型：pDraw 随实力差衰减；pWin = (1−pD)·σ(k·Δq + h)。
             ★ 轨迹偏差控制器（λ）：dev = 已得积分 − 真实节奏应得积分；领先真实节奏的队
             临时压低胜率、落后者抬高——只修正「偏差」不修正「水平」（水平层由拟合的静态
             q 决定，反馈在率上会均值回归压平全联盟，已验证否决）。λ 越大方差越小。 */
          const L = (_A.tuning && _A.tuning.lambda) || 1.2;
          const devH = home.pts - FT.teams[home.id][1] * (home.p / FT.games);
          const devAw = away.pts - FT.teams[away.id][1] * (away.p / FT.games);
          const x = (qH - qAw) - L * (devH - devAw) / Math.max(2, FT.games - home.p);
          const pD = Math.min(0.4, 0.34 * (1 - 0.7 * Math.min(1, Math.abs(x) / 1.2)));
          const pWH = (1 - pD) * (1 / (1 + Math.exp(-(1.75 * x + 0.15))));
          const roll = R.next();
          const gdH = gdOf(home), gdAw = gdOf(away);
          const eH = Math.max(0.3, 1.35 + (gdH - gdAw) * 0.45);
          const eAw = Math.max(0.3, 1.35 + (gdAw - gdH) * 0.45);
          if (roll < pWH) {
            hg = Math.min(6, Math.round(eH) + 1); ag = Math.min(hg - 1, Math.round(eAw * 0.75)); if (ag < 0) ag = 0;
          } else if (roll < pWH + pD) {
            hg = ag = Math.min(3, Math.max(0, Math.round((eH + eAw) * 0.4)));
          } else {
            ag = Math.min(6, Math.round(eAw) + 1); hg = Math.min(ag - 1, Math.round(eH * 0.75)); if (hg < 0) hg = 0;
          }
        } else {
          const dS = (home.strength + 2.5) - away.strength;
          hg = poissonSample(Math.max(0.2, 1.35 + dS * 0.06));
          ag = poissonSample(Math.max(0.2, 1.35 - dS * 0.06));
        }
        matches.push({ home: home, away: away, hg: hg, ag: ag, key: null });
      }
      for (const m of matches) {
        m.home.p++; m.away.p++; m.home.gf += m.hg; m.home.ga += m.ag; m.away.gf += m.ag; m.away.ga += m.hg;
        if (m.hg > m.ag) { m.home.w++; m.home.pts += 3; m.away.l++; }
        else if (m.hg < m.ag) { m.away.w++; m.away.pts += 3; m.home.l++; }
        else { m.home.dr++; m.away.dr++; m.home.pts++; m.away.pts++; }
        if (m.key && d.anchorUsed) d.anchorUsed[m.key] = 1;
      }
    },

    /* ★ P100-B3：比分锚定激活判定（赛季门 + 名局库装载） */
    _anchorActive(d) {
      const A = window.REAL_RESULTS_2014;
      return !!(A && String(d.season) === String(A.season) && A.famous);
    },

    /* ★ P100-B3：世界线分叉判定（Q3）——现效力俱乐部或生涯效力过的俱乐部（含已转出）永不锚定。
       pastClubs 存队名字符串（transfer.js/nation_dev.js 口径），防御性过滤非字符串项。 */
    _isCareerClub(d, id) {
      if (id === d.clubId) return true;
      const pc = (d.history && d.history.pastClubs) || null;
      if (!pc || !pc.length) return false;
      const t = (typeof teamById === "function") ? teamById(id) : null;
      if (!t) return false;
      for (let i = 0; i < pc.length; i++) if (typeof pc[i] === "string" && pc[i] === t.name) return true;
      return false;
    },

    /** 应用用户比赛结果到积分榜/杯赛 */
    applyResult(state, fixture, result) {
      const d = state.data;
      fixture.played = true;
      fixture.result = result;
      const mine = d.table.find(t => t.id === d.clubId);
      const oppRow = d.table.find(t => t.id === (fixture.match.home.id === d.clubId ? fixture.match.away.id : fixture.match.home.id));
      if (fixture.type === "league" && mine && oppRow) {
        const [hg, ag] = [result.home, result.away];
        const userIsHome = fixture.match.home.id === d.clubId;
        mine.p++; oppRow.p++;
        mine.gf += userIsHome ? hg : ag; mine.ga += userIsHome ? ag : hg;
        oppRow.gf += userIsHome ? ag : hg; oppRow.ga += userIsHome ? hg : ag;
        const myGoals = userIsHome ? hg : ag, oppGoals = userIsHome ? ag : hg;
        if (myGoals > oppGoals) { mine.w++; mine.pts += 3; oppRow.l++; }
        else if (myGoals < oppGoals) { oppRow.w++; oppRow.pts += 3; mine.l++; }
        else { mine.dr++; oppRow.dr++; mine.pts++; oppRow.pts++; }
      } else if (fixture.type === "cup") {
        // ⚠ 防御：d.cup 由 initSeason 创建，但联赛无杯赛 / 跨季残留 fixture 时会是 null
        if (!d.cup) d.cup = { results: [], stage: 0, alive: true };
        const myGoals = fixture.match.home.id === d.clubId ? result.home : result.away;
        const oppGoals = fixture.match.home.id === d.clubId ? result.away : result.home;
        const won = myGoals > oppGoals || (myGoals === oppGoals && (result.pens ? result.pens.won : R.chance(0.5))); // 有点球结果用点球，否则简化抛硬币
        d.cup.results.push({ stage: fixture.stage, opp: fixture.match.home.id === d.clubId ? fixture.match.away.name : fixture.match.home.name, myGoals, oppGoals, won });
        d.cup.stage++;
        if (!won) d.cup.alive = false;
        else if (fixture.stage === 3) d.cup.alive = "champion";
      } else if (fixture.type === "cc") {
        // 顶级洲际杯联赛阶段（G4）：用户积分入表；第 8 轮结束判定晋级/落入二级杯
        const myGoals = fixture.match.home.id === d.clubId ? result.home : result.away;
        const oppGoals = fixture.match.home.id === d.clubId ? result.away : result.home;
        const row = d.cc.table.find(t => t.id === d.clubId);
        if (row) row.pts += myGoals > oppGoals ? 3 : (myGoals === oppGoals ? 1 : 0);
        d.cc.round++;
        if (d.cc.round >= 8) {
          const sorted = d.cc.table.slice().sort((a, b) => b.pts - a.pts || (a.id < b.id ? -1 : 1));
          d.cc.rank = sorted.findIndex(t => t.id === d.clubId) + 1;
          if (d.cc.rank > 16) {
            d.cc.alive = false;                    // 未进前 16：淘汰赛程变幽灵
            if (d.cc.rank <= 24 && !d.scc) {       // 9-24 名：落入二级杯（动态创建淘汰赛程）
              this._genSecondCupDrop(state);
              d.fixtures.sort((a, b) => a.day - b.day);
            }
          }
        }
      } else if (fixture.type === "cc_ko") {
        // ⚠ 防御：d.cc 仅在上季 rank≤4 取得资格时创建（initSeason 里默认 null），
        //   未取得资格却出现 cc_ko fixture（跨季残留等）会 null 崩溃
        if (!d.cc) d.cc = { round: 0, table: [], koStage: 0, alive: true, rank: 0, results: [] };
        // 顶级洲际杯淘汰赛（G4）：单场决胜，平局有点球用点球，否则简化抛硬币
        const myGoals = fixture.match.home.id === d.clubId ? result.home : result.away;
        const oppGoals = fixture.match.home.id === d.clubId ? result.away : result.home;
        const won = myGoals > oppGoals || (myGoals === oppGoals && (result.pens ? result.pens.won : R.chance(0.5)));
        d.cc.results.push({ stage: fixture.stage, opp: fixture.match.home.id === d.clubId ? fixture.match.away.name : fixture.match.home.name, myGoals, oppGoals, won });
        d.cc.koStage++;
        if (!won) d.cc.alive = false;
        else if (fixture.stage === 3) d.cc.alive = "champion";
      } else if (fixture.type === "scc") {
        // ⚠ 防御：d.scc 仅在 ccQual==="second" 或顶级杯 9-24 名落入时创建（默认 null）
        if (!d.scc) d.scc = { stage: 0, alive: true, results: [], dropped: false };
        // 洲际二级杯淘汰赛（G5）：同国内杯赛机制
        const myGoals = fixture.match.home.id === d.clubId ? result.home : result.away;
        const oppGoals = fixture.match.home.id === d.clubId ? result.away : result.home;
        const won = myGoals > oppGoals || (myGoals === oppGoals && (result.pens ? result.pens.won : R.chance(0.5)));
        d.scc.results.push({ stage: fixture.stage, opp: fixture.match.home.id === d.clubId ? fixture.match.away.name : fixture.match.home.name, myGoals, oppGoals, won });
        d.scc.stage++;
        if (!won) d.scc.alive = false;
        else if (fixture.stage === 3) d.scc.alive = "champion";
      } else if (fixture.type === "intl") {
        fixture.played = true;
      }
    },

    standings(state) {
      return state.data.table.slice().sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf);
    },

    /** 赛季结算：成长 + 荣誉 + 履历 */
    finishSeason(state) {
      const d = state.data;
      /* ★★ P284（方案 A，玩家三截图复现实锤 _p284_settle_repro 15/15）：**持久化幂等守卫**。
         ── 病灶 ── 结算流程横跨「存档已落盘」与「玩家确认」两个阶段：finishSeason 跑完
           （season++/seasonStats 清零/成长/荣誉入账）即 State.save()，而 d.offseason=true
           要等玩家点结算卡「进入休赛期 ▸」才写（原 flow.js se-go 唯一写点）、Flow._inEnd
           防重入是内存态刷新即丢、d.lastSettledSeason 只写不读 ⇒ 结算卡/赛季报告展示期间
           刷新页面/切后台被杀/闪退/云档双设备 → 重载 → Hub.refresh 触发条件
           （!retired && !offseason && pending 空）再次成立 → 第二次 finishSeason 在
           **空 seasonStats + 上季残留积分榜**上重跑 = 空数据成长（17 岁公式值 ≈ +5）+
           荣誉/履历重复 + season/年龄双跳 —— 玩家看到的「按第一赛季成绩又结算一遍，
           数值没给也没数据」。
         ── 修法 ── 结算完成置 `d._seasonSettled = true`（随档持久化），initSeason/
           initYouthSeason（新赛季开季）复位；本入口发现已结算 → 返回**空结果形态**
           （字段与正常返回对齐，消费点 flow.js 的 result.growth.delta / result.myRank /
           result.awards / result.offers / Skills.seasonGain 全部安全）。 */
      if (d._seasonSettled) {
        return { growth: { delta: 0, gains: 0, masteryGain: 0 }, myRank: 0, awards: [], offers: [], avgRating: 0, crownScore: 0, idempotentSkip: true };
      }
      /* ★★ P99 批 3（A9 / 设计稿 §7.4.1）：青训期的赛季收尾**整体分派**到唯一入口
         `Youth.finishYouthSeason`。这一行同时挡住本函数体内的 7 处副作用：
           荣誉段（10 处 awards.push + d.trophies.push）/ StarFavor 荣誉共振 /
           `d.careerLog.push` / `ClubEvents.onSeasonEnd`（R17 一次性标志位 + R19 无条件计数器）/
           `Division.settle` / `d.ccQual` / `d.contract.years--` / `d.stats.seasonsPlayed++`。
         ★ 必须在**函数体第一行**：放在荣誉段之前也不够 —— 后面的 StarFavor 共振与
           `careerLog.push` 会照跑（E-1 的"函数头一处早退"就是这个意思）。
         ★ 为什么是"入口分派"而不是散点 `if`：`finishSeason` 里住着 7 处副作用，
           `ClubEvents` 又是 6 模块链式覆盖（R18）→ 散点打补丁必漏，且**漏了全静默**。 */
      if (window.Youth && Youth.inAcademy(d)) return Youth.finishYouthSeason(state);
      const growth = Growth.seasonEnd(state);
      /* ★ P105-B2：出场时间承诺赛末兑现校验（transfer 单源；返回值丢弃——防 soak 快照假漂移）。
         ★ 此处 d.seasonStats 尚未清零（清零在赛季收尾段），apps = 本季完整出场数。 */
      if (window.Transfer && Transfer.promiseSettle) { try { Transfer.promiseSettle(state, d.seasonStats ? d.seasonStats.apps : 0); } catch (e) { /* 承诺校验失败不阻塞结算 */ } }
      const table = this.standings(state);
      const myRank = table.findIndex(t => t.id === d.clubId) + 1;
      const league = LD()[d.leagueId];
      const season = d.seasonStats;
      const avgRating = season.apps ? (season.ratingSum / season.apps) : 0;
      const awards = [];
      // 冠军
      if (myRank === 1) {
        awards.push({ name: league.name + "冠军", icon: '', season: d.season });
        d.trophies.push({ name: league.name + "冠军", icon: '', season: d.season });
      }
      // 金靴（P1-12）：比较制——NPC 头号射手进球数，玩家须真赢。
      // ★ P138 重标定（对齐引擎现役产出 + 略宽松）：P33 时代的 20-37 建立在旧产出结构上
      //   （P113 属性 v4 / P116 逆转抑制 / P109 助攻改写之后，ST 单季进球实测 p50=2——
      //   P138 探针 108 季），20-37 门槛 = 通道恒关闭（108 季 0 次）。新标定 8-17（中位 11）：
      //   球队赛季 ~40 球 × 头号射手份额 ~25% ≈ 10 球，5-11 球金靴在游戏世界自洽（P138 第二轮：
      //   产出校准后 ST p90=6.7/max=9，第一版 8-17 仍恒死 → 降为 5-11）；主力好季（5-8 球）可竞争。
      const npcBoot = 5 + R.int(0, 4) + (myRank <= 4 ? 2 : 0); // P138 标定（第二轮）：8-17→5-11（中位 7.5，对齐产出校准后的引擎现役产出）
      if (season.goals > npcBoot) { awards.push({ name: "联赛金靴", icon: '', season: d.season }); d.trophies.push({ name: "联赛金靴", icon: '', season: d.season }); }
      // 金冕奖（原版 GoldenCrown）
      // ★ P138 重标定：fame 项硬帽化。旧式 fame/200 无帽——fame 是生涯累计（P138 实测 12 季
      //   p50=16500 → 该项贡献 82 分、占 crownScore 52%），金冕漂成「终身成就奖」（50%/季、
      //   门槛恒真）。真实参照：年度最佳由当季表现主导、声望只拉票不投票 → fame 封顶 10 分。
      //   门槛 105→95、概率 0.55→0.5（P138 第二轮：100 下 108 季仅 2 次=过紧；95 下典型冠军好季
      //   过线）→ 目标 ~10-18%/季（真实梅罗垄断期年度最佳也就是这个量级）。
      const crownScore = avgRating * 10 + season.goals * 2 + season.assists * 1.5 + (myRank === 1 ? 15 : 0) + Math.min(10, d.fame / 1000);
      const wonCrown = crownScore > 95 && R.chance(0.5);
      if (wonCrown) { awards.push({ name: "金冕奖（年度最佳球员）", icon: '', season: d.season }); d.trophies.push({ name: "金冕奖", icon: '', season: d.season }); }
      // 杯赛冠军
      if (d.cup && d.cup.alive === "champion") {
        awards.push({ name: "国内杯赛冠军", icon: '', season: d.season });
        d.trophies.push({ name: "国内杯赛冠军", icon: '', season: d.season });
      }
      // 洲际冠军（G4/G5）★ P213：荣誉名随杯名落档（欧洲=洲际冠军杯/洲际二级杯，中国=球俱杯/球俱挑战杯）
      if (d.cc && d.cc.alive === "champion") {
        const _ccN = d.cc.cupName || "洲际冠军杯";
        awards.push({ name: _ccN + "冠军", icon: '', season: d.season });
        d.trophies.push({ name: _ccN, icon: '', season: d.season });
      }
      if (d.scc && d.scc.alive === "champion") {
        const _sccN = d.scc.cupName || "洲际二级杯";
        awards.push({ name: _sccN + "冠军", icon: '', season: d.season });
        d.trophies.push({ name: _sccN, icon: '', season: d.season });
      }
      // P1-20：更衣室好人——赛季化学反应加成（P113 五档 4~20）
      if (window.TAL && TAL.chemBonus && d.chars) {
        const _chem = TAL.chemBonus(d);
        if (_chem > 0) d.chars.chemistry = Math.min(100, (d.chars.chemistry || 50) + _chem);
      }
      // P81j 升降级结算：顶级联赛末 2 席降级 / 次级联赛前 2 名升级（仅存在同国家二级联赛时生效）
      // 迁移写 d.leagueId，下季 initSeason 读它 → 与转会切联赛同一条通路
      if (window.Division) { try { Division.settle(state, myRank, table); } catch (e) { console.warn("division settle", e); } }
      // 下季洲际资格（G4/G5）：rank≤4 顶级杯联赛阶段 / 5-6 二级杯（随转会携带）
      // 次级联赛（league.level ≥ 2）不产生洲际资格 —— 按本季所在联赛层级判定
      const _curLevel = (league && league.level) || 1;
      d.ccQual = _curLevel === 1 ? (myRank <= 4 ? "top" : (myRank <= 6 ? "second" : null)) : null;
      // MOTM
      if (season.motm >= 5) { awards.push({ name: "赛季最佳球员候选", icon: '', season: d.season }); }
      // 奖项增强（融合第二批，双端同构；顺序固定：助攻王→最佳阵容→最佳新人）
      const npcAssist = 5 + R.int(0, 4); // ★ P138 标定（第二轮）：4-8→5-9（中位 7，对齐引擎现役产出；CM 单季 p50=3/p90=6 → CM 通道活、ST 低频=真实——助攻王本就是中场的奖项）
      /* ★ P197 位置隔离：助攻王不授门将（现实参照：助攻王从不属于门将；P195-A 门禁
         「GK 零助攻王」在日历修正后的随机流下实测门将 1 次登顶——R 抽取保持在条件外，
         随机流结构不变，仅拦截发奖）。 */
      if (d.player && d.player.position !== "GK" && season.assists > npcAssist) {
        awards.push({ name: "联赛助攻王", icon: '', season: d.season });
        d.trophies.push({ name: "联赛助攻王", icon: '', season: d.season });
      }
      // ★ P138 标定（第二轮）：7.5→6.8（引擎评分实测 ST p75=6.6/p90=6.7/max=7.0——7.0/7.5 均
      //   不可达；产出校准后 p90≈6.7-6.9）、apps 20→15。真实参照：赛季最佳阵容 ≈ 联赛前 11 人，
      //   门槛应「表现突出」而非「完美」；×0.6 → ~5-10%/季（生涯 2-4 次=真实主力量级）。
      if (avgRating >= 6.8 && (season.apps || 0) >= 15 && R.chance(0.6)) {
        awards.push({ name: "入选赛季最佳阵容", icon: '', season: d.season });
        d.trophies.push({ name: "赛季最佳阵容", icon: '', season: d.season });
      }
      // ★ P138 修复死通道：旧条件 careerLog.length===0 只在第一个结算季成立，而 14 岁青训开局
      //   的第一个结算季 g+a 恒 <8（青训小将出场/产出极低）→ 108 季 0 次=上线以来从未触发。
      //   改年龄门（真实参照：PFA 最佳新秀 = 21 岁以下、且每季全联赛仅 1 人；青训
      //   FORCE_EXIT_AGE=19 → age≤19 只覆盖毕业首季）。P138 第二轮收紧：第一版 21 岁+g+a≥4
      //   实测 34.3%/季过松（毕业头两季年年拿）→ 19 岁+apps12+g+a≥5+0.25 → ≤1 次/生涯。
      if ((d.player.age || 99) <= 19 && (season.apps || 0) >= 12 && (season.goals + season.assists) >= 5 && R.chance(0.25)) {
        awards.push({ name: "联赛最佳新人", icon: '', season: d.season });
        d.trophies.push({ name: "联赛最佳新人", icon: '', season: d.season });
      }
      /* P133 门将专属荣誉：联赛最佳门将（GK；赛季零封入账见 v2/settlement.js seasonStats.cleanSheets）。
         现实参照：联赛年度最佳门将 ≈ 零封榜头名；apps≥15（主力）+ 零封≥8（强队主力门将量级）+ 0.5 掷骰。 */
      if (d.player && d.player.position === "GK" && (season.apps || 0) >= 15 && (season.cleanSheets || 0) >= 8 && R.chance(0.5)) {
        awards.push({ name: "联赛最佳门将", icon: '', season: d.season });
        d.trophies.push({ name: "联赛最佳门将", icon: '', season: d.season });
      }

      /* P64 荣誉共振（C 途径）：玩家获个人荣誉（金靴/助攻王/最佳阵容/金冕奖）→
         与同联赛池内最高 OVR 球星（无则全池最高）共振 +10，每赛季 1 次（lastHonor 判重） */
      if (window.StarFavor) {
        try {
          StarFavor.ensure(d);
          const honored = awards.some(a => /金靴|助攻王|最佳阵容|金冕奖|最佳门将|金手套/.test(a.name));
          if (honored) {
            const all = StarFavor.poolOf();
            const lgStars = all.filter(s => String(s.clubId || "").indexOf(d.leagueId + "_") === 0);
            const cand = (lgStars.length ? lgStars : all).slice().sort((a, b) => b.ovr - a.ovr)[0];
            if (cand) {
              const rec = StarFavor.recOf(d, cand.pid);
              if (rec.lastHonor !== d.season) {
                rec.lastHonor = d.season;
                d.starFavor[cand.pid] = rec;
                StarFavor.addFavor(state, cand.pid, 10);
                StarFavor.pushNote(d, cand.name + " 在颁奖礼后专门找你合了影 · 羁绊 +10");
              }
            }
          }
        } catch (e) { /* ignore */ }
      }

      d.careerLog.push({
        season: d.season, club: teamById(d.clubId)?.name || d.clubId,
        league: league.name, apps: season.apps, goals: season.goals, assists: season.assists,
        avgRating: Math.round(avgRating * 10) / 10, rank: myRank, awards: awards.map(a => a.name),
      });
      // ★★ M4：**生涯积分当季实时重算**（`P97_潜力与位置体系_设计提案_v0.1.md` §A5.4）
      //   ★ 为什么放在这里：这是"本赛季数据刚入账"的唯一时点 —— 早一步少算本赛季，
      //     晚一步就要等下一次结算（玩家会觉得"解锁慢半拍"）。
      //   ★ `Legacy.sync` 是**幂等重算**（从 careerLog/trophies/intl/prestige 实时推算），
      //     所以不存在"重复结算"风险；失败也不该影响赛季收尾。
      if (window.Legacy) { try { Legacy.sync(d); } catch (e) { /* 积分失败不影响结算 */ } }
      /* ★★ P195 老将衰退（用户拍板规格）：能力值+潜力值双掉，身体/速度掉得更快 ——
         · 30-35 岁：身体/速度 attrs -2/年、pot -1.5/年（整数化：偶岁 -2/奇岁 -1）；
         · 36 岁起：身体/速度 attrs -5/年、pot -4/年；其他大类 attrs -1/年、pot -0.5/年（偶岁 -1）；
         · 下限：pot 45 / attrs 35（防崩到个位数）；能力值掉更快 = 玩家可用经验随时补齐
           （spendOn 上限=已衰退的 pot → 「追赶老去」的年复一年体验，经验新去处）；
         · 校准锚：热血 ST 身体/速度 pot 起点 ~80-86 → 40 岁 ≈ 55-61（目标区间 50-60）；
         · 池内项限定（Potential.idsOf），池外项天然无 pot 不触碰；30 岁内零触发零漂移。 */
      (function decline(state) {
        const dd = state.data, pl = dd.player;
        const age = (pl && pl.age) || 0;
        if (age < 30 || !pl || !pl.pot) return;
        const C = (window.CONFIG && CONFIG.POTENTIAL && CONFIG.POTENTIAL.DECLINE) || null;
        if (!C) return;
        const ids = window.Pool ? Pool.ids(pl.position) : [];
        const phySet = new Set(Pool.membersOf(pl.position, "physicality"));
        const paceSet = new Set(Pool.membersOf(pl.position, "pace"));
        const fast = age >= C.FAST_AGE;
        for (const id of ids) {
          const isBody = phySet.has(id) || paceSet.has(id);
          const potDec = isBody ? (fast ? C.PHY_PACE.POT_FAST : C.PHY_PACE.POT_SLOW) : (fast ? C.OTHER.POT_FAST : 0);
          const attrDec = isBody ? (fast ? C.PHY_PACE.ATTR_FAST : C.PHY_PACE.ATTR_SLOW) : (fast ? C.OTHER.ATTR_FAST : 0);
          /* pot：小数率整数化（偶岁向上取整、奇岁向下 → 年均值精确；0 则跳过） */
          if (potDec > 0) {
            const pd = (age % 2 === 0) ? Math.ceil(potDec) : Math.floor(potDec);
            if (pd > 0) pl.pot[id] = Math.max(C.FLOOR_POT, (pl.pot[id] || 0) - pd);
          }
          if (attrDec > 0 && pl.attrs[id] !== undefined) {
            const ad = (age % 2 === 0) ? Math.ceil(attrDec) : Math.floor(attrDec);
            if (ad > 0) pl.attrs[id] = Math.max(C.FLOOR_ATTR, pl.attrs[id] - ad);
          }
        }
      })(state);
      /* ★★ P113（2026-09-17 用户拍板）：**一线队冠军跨周目累计收口**（体育世家 5 冠解锁）。
         ── 口径 ── 数**本季新增**的成年冠军荣誉。识别规则（**唯一真源 = 本处**，新增冠军类
           荣誉名必须匹配它）：荣誉名以「冠军」结尾 ∪ { 洲际冠军杯, 洲际二级杯 }
           —— 后两者是 `d.trophies` 里的奖杯名（awards 里才叫「洲际冠军杯冠军」），不以「冠军」收尾。
           金靴 / 金冕奖 / 「晋级 XX」/ 青年荣誉（A6 命名纪律本就不含冠军字样）一律不计；
           青年冠军**不算**（inAcademy 早退，天然不进本段）。
         ── 时点 ── 必须在 `d.season++`（下方 7 行）**之前**：`t.season === d.season` 才能数到本季。
         ── 解锁 ── `Meta.addChampions` 返回 { total, unlocked }；达成 5 冠时由 Hub 挂载点
           toast 提示（这里只落账，不弹 UI —— 结算链里弹窗会打断卡片流）。 */
      if (window.Meta && Meta.addChampions) {
        try {
          const _isChamp = (nm) => nm.indexOf("冠军", nm.length - 2) >= 0 || nm === "洲际冠军杯" || nm === "洲际二级杯" || nm === "球俱杯" || nm === "球俱挑战杯" || nm === "欧冠" || nm === "亚冠" || nm === "欧联" || nm === "亚冠2"; // P213 兼容球俱杯系 + P295 兼容欧冠/亚冠系杯名
          const _champs = (d.trophies || []).filter(t => t && t.season === d.season
            && typeof t.name === "string" && _isChamp(t.name)).length;
          if (_champs > 0) Meta.addChampions(_champs, [{ id: "sports", need: 5 }]);
        } catch (e) { /* 冠军计数失败不影响结算 */ }
      }
      // 合同年扣减：赛季结束 -1，到期进入自由身（续约/转会二选一）
      d.contract = d.contract || { years: 1, wage: 3000 };
      d.contract.years = Math.max(0, (d.contract.years || 0) - 1);
      if (window.ClubEvents) { try { ClubEvents.onSeasonEnd(state); } catch (e) { console.warn("club settle", e); } } // P63 冠军/告别/遗憾结局/里程碑
      // 转会报价
      const offers = this.genTransferOffers(state, avgRating, myRank);
      // 升降级/新赛季
      /* ★ P153b（2026-09-19 用户截图实锤）：赛季报告/赛季史在此前**永远显示 0** ——
         本函数 781 行前清零 d.seasonStats，而 SeasonReport.show/recordSeason 在
         finishSeason 之后才消费它。清零前快照本季账本（带 season 标记），
         SeasonReport.build 按赛季号取快照；下季 initSeason 后快照自然失配退位。 */
      d._lastSeasonStats = Object.assign({ season: d.season }, d.seasonStats);
      d._seasonSettled = true; // ★ P284（方案 A）：本季结算完成落账（幂等守卫置位，initSeason 复位）
      d.season++;
      d.seasonStats = { apps: 0, goals: 0, assists: 0, ratingSum: 0, motm: 0 };
      d.stats.seasonsPlayed++;
      return { growth, myRank, awards, offers, avgRating: Math.round(avgRating * 10) / 10, crownScore: Math.round(crownScore) };
    },

    genTransferOffers(state, avgRating, rank) {
      const d = state.data;
      const ovr = PlayerSystem.overall(d.player);
      let offers = [];
      const curLg = LD()[d.leagueId];
      const freeAgent = (d.contract && (d.contract.years || 0)) <= 0; // 合同到期：自由身
      const forever = window.ClubEvents && ClubEvents.foreverOn(d);
      /* ★ P220：一生一队只封**市场报价**，不再吞掉到期续约报价（旧写法 return [] 连续约都不给） */
      if (!forever) {
        // 强队感兴趣的概率
        if (avgRating >= 6.8 || ovr >= 65) {
          const targets = [];
          const curStr = (teamById(d.clubId)?.strength || 60);
          for (const [lid, lg] of Object.entries(LD())) {
            for (const t of lg.teams) {
              if (t.id === d.clubId) continue;
              /* ★ P220（玩家实录「去慕城后再无报价」）：旧条件 strength > 现队+2 使
                 豪门球员的报价池**结构性恒空**（没有几支队比慕城红星强）——合同在身时向上流动
                 没问题，但自由身转会是零转会费交易，任何实力匹配的俱乐部都该能报价。
                 自由身 → 全市场开放（strength ≤ ovr+14）；有合同时在 → 维持向上流动。
                 ★★ P265（用户实录「转会窗长期固定的某两个球队」）：合同期下限 curStr+2
                 再度实锤为「太安静」主源——低 OVR 球员在强队（ovr+14 < curStr+2）池恒 0
                 （探针 60 窗 49 窗空）。放宽为 curStr-6：平级与略弱队也会来求购（现实中
                 中游队挖强队轮换球员很常见），池内容随联赛 98 队摊开，同队重复感骤降。
                 上限 ovr+14 不动（实力决定谁要你）。 */
              if (freeAgent ? (t.strength <= ovr + 14) : (t.strength > curStr - 6 && t.strength <= ovr + 14)) {
                targets.push({ team: t, league: lid });
              }
            }
          }
          /* ★ P144（模拟正确性）：报价数基线改由**能力（ovr）**驱动——成名球星（ovr 80+）
             不可能无人问津；赛季评分只是加成。旧公式纯看 avgRating（6.4-6.7 → floor=0），
             把 ovr 80+ 的球员锁死在弱队 26 季（P142 模拟实证），转会市场名存实亡。 */
          const nByOvr = ovr >= 80 ? 2 : ovr >= 75 ? 1 : 0;
          const nOffers = Math.max(nByOvr, Math.min(3, Math.floor((avgRating - 6.2) * 3) + (rank <= 3 ? 1 : 0))) + (freeAgent ? 1 : 0); // 自由身多一份报价
          // 天赋：转会宠儿 → 报价 +1 份（P113 五档：金档及以上才 +1）
          const offerN = nOffers + ((window.TAL && TAL.transferOfferBonus) ? TAL.transferOfferBonus(d) : 0);
          /* ★ P144 球星引来豪门争抢：ovr≥80 的第一份报价按强度降序偏置（前 3 强里抽）——
             现实口径：成名球星的报价来自盯着他的强队，而非全世界均匀抽奖。
             旧纯随机抽取使豪门报价概率 ~15%，巨星 26 季难进豪门（R2 悖论根源之一）。 */
          const starBias = ovr >= 80;
          if (starBias) targets.sort((a, b) => b.team.strength - a.team.strength);
          for (let i = 0; i < offerN && targets.length; i++) {
            /* ★ P265：第一报价从前 3 强抽 → 50% 前 3 强 + 50% 全池——全库前 3 强（慕城红星/巴塞罗纳/
               曼德里白舰，静态数据）恒定不变，旧写法使巨星每季第一报价 65% 落同三队（探针 11/17），
               「转会窗固定某两队」的直接观感源。稀释后豪门兴趣语义保留、来源不再锁定。 */
            const t = (starBias && i === 0 && R.chance(0.5))
              ? targets.splice(R.int(0, Math.min(2, targets.length - 1)), 1)[0]
              : targets.splice(R.int(0, targets.length - 1), 1)[0];
            // 周薪走 Career.^5 曲线（1200 万封顶）：豪门多付钱，弱队报价天然偏低
            const wage = Career.wageOf(ovr, t.team.strength, R.next());
            // 转会费：基础曲线 ×400，2 亿封顶（巨星转会费随之陡增）；自由身 0 转会费、签字费 ×6 补偿
            const fee = freeAgent ? 0 : Math.min(500000000, Math.round(Career.wageBase(ovr) * 600 * (0.8 + R.next() * 0.5))); // P1-16：封顶 2 亿→5 亿、系数 400→600（高段转会费与身价拉开）
            offers.push({
              clubId: t.team.id, clubName: t.team.name, leagueId: t.league,
              leagueName: LD()[t.league].name,
              wage, fee,
              signingBonus: Math.round(wage * (freeAgent ? 6 : 4) * ((window.TAL && TAL.val) ? 1 + TAL.val(d, "transferDarling") : 1)), // P113 五档：转会宠儿签字费 +10~50%
            });
          }
        }
        // P61 转会窗：报价富化（风格/上场承诺/解约金/降级危机/演化/解约金触发判定）
        if (window.Transfer) offers = Transfer.enrichOffers(state, offers, avgRating, rank);
      }
      /* ★★ P220：合同到期 → 现俱乐部**主动递上续约报价**（列表首位，把「去还是留」显性化）。
         玩家实录诉求：到期一定要有新合同；能力值大涨后俱乐部应给出匹配薪资。
         · 周薪按**当前 OVR** 重算（成长即涨薪），且不低于现薪（挽留不降薪）；
         · 忠诚奖金 = 2 周薪（区别于「留守」兜底的标准续约）；
         · 租借期不生成（合同关系在母队，休赛期自动归队流处理）。 */
      if (freeAgent && !d.loan) {
        const cur = (window.teamById && teamById(d.clubId)) || { id: d.clubId, name: "现俱乐部", strength: 60 };
        const renewWage = Math.max(
          Math.round(Career.wageOf(ovr, cur.strength || 60, R.next())),
          (d.contract && d.contract.wage) || 0
        );
        offers.unshift({
          renew: true, clubId: d.clubId, clubName: cur.name || "现俱乐部", leagueId: d.leagueId,
          leagueName: (curLg && curLg.name) || "", wage: renewWage,
          signingBonus: Math.round(renewWage * 2), fee: 0, years: 2,
        });
      }
      return offers;
    },
  };

  window.SeasonSystem = SeasonSystem;
})();
