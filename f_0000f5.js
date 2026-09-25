/* ============================================================================
   star_favor.js — 球星好感度与休赛期邀请（P64）
   设计稿：docs/球星好感度与休赛期邀请设计稿_v1.md；卡文：docs/球星好感度卡文审议稿_v1.md
   职责：
     · 候选池：GAME_DATA 各队真实球星（real && overall≥85，静态装配，一次缓存）
     · 好感 0-100 四档：陌生(<30) / 熟络(≥30) / 挚友(≥60) / 至交(≥90)；只增不减；
       存档字段 d.starFavor[pid] = {v, met, lastInvite}，转会/换队保留
     · 对位高光（A 途径）：俱乐部赛（非国家队）对手含池内球星，且评分≥8.0 或
       进球≥1 或 助攻≥1 → +6~9（进球+助攻≥2 或评分≥9.0 → +10~12），注脚排队
     · 日常卡动态选星：好感>0 的池内球星（A0 规则），供 fx.favorPid="dyn" 解析
     · 休赛期邀请：每届 1 次（占决策由 nation_dev 计）、同星每年 1 次；
       观赛（≥30；陌生档 40% 婉拒）/ 合练（≥30）/ 指点青训（≥60）
     · 国际声望 d.prestige：0-100 初始 50，只涨不降，独立于 FIFA 积分（铁律）
       G1 邀请档位上限：<60→OVR≤85；60~79→≤88；≥80→不限
       G2 苗子出口加成：由 nation_dev.pickRealClub 读取 prestige 扩池
   铁律：纯逻辑层无 DOM；Web/Lua 同构（数值只改 CFG）；全显式概率
   ============================================================================ */
(function () {
  'use strict';

  /* ── 数值表（改这里等于改平衡；与设计稿 §2/§3/§4 逐项对应） ── */
  const CFG = {
    POOL_MIN_OVR: 85,          // 候选池门槛（实测 data_real 全量 49 人 / 16 队）
    GLOW_RATING: 8.0,          // 对位高光：评分阈值
    GLOW_HOT_RATING: 9.0,      // 高光段：评分阈值
    GLOW_LOW: [6, 9],          // 普通段好感区间（含端点）
    GLOW_HIGH: [10, 12],       // 高光段好感区间
    TIER_TRAIN: 30,            // 熟络：合练/观赛门槛
    TIER_COACH: 60,            // 挚友：指点青训门槛
    DECLINE_CHANCE: 0.40,      // 陌生档观赛婉拒概率
    INTERACT_FAVOR: [8, 15],   // 休赛期互动好感区间
    COACH_P: [0.60, 0.25],     // 指点：pot+1 / +2 / 无效（累计阈值，余 15%）
    COACH_POT_CAP: 85,         // 与 INTL_POT 对齐：潜力封顶 85
    TRAIN_EXP: 12000,          // 合练经验（EXP_PER_ABILITY=10000，约 1.2 点属性）
    TRAIN_TALENT_P: 0.15,      // 合练领悟特质概率
    PRESTIGE_INIT: 50,         // 国际声望初始
    G1: [85, 88, 99],          // 声望 <60 / 60~79 / ≥80 的可邀 OVR 上限
    WATCH_FAVOR: 8,            // 观赛登记好感
    WATCH_FAME: 400,           // 观赛到场名气（国内热度）
    ATTEND_PRESTIGE: 4,        // 到场声望基础
    WIN_PRESTIGE: 3,           // 胜场追加
    DRAW_PRESTIGE: 1,          // 平场追加
    PRAISE_CHANCE: 0.30,       // 胜场称赞事件概率
    PRAISE_FAVOR: 10,          // 称赞事件好感
    PRAISE_PRESTIGE: 3,        // 称赞事件声望
    PRAISE_FAME: 1200,         // 称赞事件名气（大额热度）
    COACH_PRESTIGE: 2,         // 指点青训传播声望
    G2_SLICE: 6,               // G2：尖子池基础宽度（pot≥80 → 中超前 N）
    G2_DIRECT: [0, 0.15, 0.25],// G2：直落豪门概率（声望 <70 / 70~79 / ≥80）
    G2_KEEP: 2,                // G2：直落豪门时的池宽（前 2 强）
    /* ── ★★ P97 M4 · L3 传承（球星传承）──
     * 方向由**球星的出身**决定，落点是你在该类别的**短板**（见 `Potential.inherit`）。
     * ★ 确定性触发、不掷骰 —— 三个理由：
     *   ① 零额外随机流消耗 → 既有探针 / soak / 冒烟的随机基线不受影响；
     *   ② P97 的核心动机就是"让成长可控"，传承的方向与幅度都可预期，玩家才能规划；
     *   ③ 稀缺性由 `POTENTIAL.STAR_TOTAL_CAP`（生涯累计 +12）+「同星每年只能邀 1 次」共同保证。 */
    INHERIT: { ATK: "shooting", MF: "passing", DF: "defending", GK: "goalkeeping" },
    INHERIT_ADD: [1, 2],       // [普通, 挚友]：好感 ≥ `TIER_COACH`(60) 时传得更深
  };

  /* ── 随机器（与全游戏一致走 core.js 的 R；node 沙箱兜底） ── */
  const RNG = (typeof R !== "undefined") ? R : {
    next: () => Math.random(),
    int: (a, b) => a + Math.floor(Math.random() * (b - a + 1)),
    chance: p => Math.random() < p,
  };

  /* ── 候选池（GAME_DATA 静态 → 会话级缓存一次） ── */
  let _pool = null, _byClub = null, _byPid = null;
  function poolOf() {
    if (_pool) return _pool;
    _pool = []; _byClub = {}; _byPid = {};
    const leagues = (window.GAME_DATA && window.GAME_DATA.leagues) || {};
    for (const lid of Object.keys(leagues)) {
      const lg = leagues[lid];
      for (const t of (lg.teams || [])) {
        for (const p of (t.players || [])) {
          if (!p.real || (p.overall || 0) < CFG.POOL_MIN_OVR) continue;
          const s = { pid: t.id + "|" + p.name, name: p.name, clubId: t.id, clubName: t.name,
            league: lg.short || lg.name, pos: p.position, nat: p.nationality, age: p.age, ovr: p.overall };
          _pool.push(s); _byPid[s.pid] = s;
          (_byClub[t.name] = _byClub[t.name] || []).push(s);
        }
      }
    }
    return _pool;
  }
  function starById(pid) { poolOf(); return _byPid[pid] || null; }
  function starsOfClubName(name) { poolOf(); return _byClub[name] || []; }

  /* ── 存档字段 ── */
  function ensure(d) {
    d.starFavor = d.starFavor || {};
    if (typeof d.prestige !== "number") d.prestige = CFG.PRESTIGE_INIT;
    if (!Array.isArray(d._favNotes)) d._favNotes = [];
    return d;
  }
  function recOf(d, pid) { ensure(d); return d.starFavor[pid] || { v: 0, met: false, lastInvite: 0 }; }

  /* ── 档位 ── */
  function tierOf(v) { return v >= 90 ? "至交" : v >= 60 ? "挚友" : v >= 30 ? "熟络" : "陌生"; }
  function favorOf(d, pid) { return recOf(d, pid).v || 0; }

  /* ── 好感入账（唯一写入口；转会保留=不因 clubId 变化清理） ── */
  function addFavor(state, pid, amt) {
    const d = state.data; ensure(d);
    if (!amt) return recOf(d, pid).v || 0;
    const rec = recOf(d, pid);
    const before = rec.v || 0;
    rec.v = Math.max(0, Math.min(100, before + amt));
    d.starFavor[pid] = rec;
    return rec.v;
  }

  /* ── 注脚队列（赛后卡/静默批卡/日常卡渲染时消费，上限 2 条） ── */
  function pushNote(d, text) {
    ensure(d);
    d._favNotes.push(String(text));
    while (d._favNotes.length > 2) d._favNotes.shift();
  }
  function takeFavNotes(d) { ensure(d); return d._favNotes.splice(0, d._favNotes.length); }

  /* ── 对位高光（A 途径）：只看俱乐部赛；国家队无俱乐部对手 ── */
  function glowCheck(state, ctx) {
    if (!ctx || ctx.isIntl) return null;
    const rating = ctx.rating || 0, g = ctx.userGoals || 0, a = ctx.userAssists || 0;
    if (!(rating >= CFG.GLOW_RATING || g >= 1 || a >= 1)) return null;
    const stars = starsOfClubName(ctx.oppName || "");
    if (!stars.length) return null;
    const star = stars.slice().sort((x, y) => y.ovr - x.ovr)[0];
    const hot = (g + a >= 2) || rating >= CFG.GLOW_HOT_RATING;
    const range = hot ? CFG.GLOW_HIGH : CFG.GLOW_LOW;
    return { star, amt: RNG.int(range[0], range[1]), hot };
  }
  function applyGlow(state, ctx) {
    const hit = glowCheck(state, ctx);
    if (!hit) return null;
    const d = state.data;
    const rec = recOf(d, hit.star.pid);
    const firstMet = !rec.met;
    rec.met = true;
    addFavor(state, hit.star.pid, hit.amt);
    if (!d._favGlowFirst) { d._favGlowFirst = true; d._favGlowFirstPid = hit.star.pid; } // B2 保底 flag
    pushNote(d, "赛后与 " + hit.star.name + " 交换球衣，相谈甚欢 · 羁绊 +" + hit.amt);
    return { star: hit.star, amt: hit.amt, firstMet };
  }

  /* ── 日常卡动态选星（A0 规则：好感>0 的池内球星，取最高） ── */
  function resolveTarget(state, pidOrDyn) {
    const d = state.data; ensure(d);
    if (pidOrDyn && pidOrDyn !== "dyn") return starById(pidOrDyn);
    let best = null;
    for (const s of poolOf()) {
      const v = favorOf(d, s.pid);
      if (v > 0 && (!best || v > best.v)) best = { star: s, v };
    }
    return best ? best.star : null;
  }
  function hasSocialStar(d) { return !!resolveTarget({ data: d }, "dyn"); }

  /* ── 国际声望 ── */
  function prestigeAdd(state, n) {
    const d = state.data; ensure(d);
    d.prestige = Math.max(0, Math.min(100, d.prestige + n));
    return d.prestige;
  }
  function g1MaxOvr(d) {
    ensure(d);
    const p = d.prestige;
    return p >= 80 ? CFG.G1[2] : p >= 60 ? CFG.G1[1] : CFG.G1[0];
  }

  /* ── 休赛期邀请 ── */
  function inviteEligible(state, star) {
    const d = state.data; ensure(d);
    const p = d.offseasonPlan || {};
    if (p.inviteUsed) return { ok: false, reason: "本届休赛期已发出过邀请" };
    const rec = recOf(d, star.pid);
    if (rec.lastInvite === d.season) return { ok: false, reason: "该球星今年已受邀" };
    if (star.ovr > g1MaxOvr(d)) return { ok: false, reason: "国际声望不足（现 " + d.prestige + "）" };
    return { ok: true };
  }
  /** 互动选项表（按好感档位亮灰；指点另需后备池有在训苗子） */
  function inviteActions(state, star) {
    const d = state.data; ensure(d);
    const v = favorOf(d, star.pid);
    const prospects = ((d.academy && d.academy.prospects) || []).filter(g => g.status === "dev");
    return [
      { kind: "watch", name: "邀请观赛", ok: true, sub: "下一个国际比赛日友谊赛到场" },
      { kind: "train", name: "邀请合练", ok: v >= CFG.TIER_TRAIN, sub: v >= CFG.TIER_TRAIN ? "大额经验 · 概率领悟特质" : "需 羁绊 ≥30（现 " + v + "）" },
      { kind: "coach", name: "指点青训", ok: v >= CFG.TIER_COACH && prospects.length > 0,
        sub: v < CFG.TIER_COACH ? "需 羁绊 ≥60（现 " + v + "）" : (prospects.length ? "苗子潜力 60%/25% 概率上探" : "后备池没有在训苗子") },
    ];
  }
  /** 执行邀请（nation_dev 已先扣决策并置 offseasonPlan.inviteUsed）。
      效果统一打包进结果卡 fx（经 EventCards.applyFx 结算并显示 chips）；
      doInvite 只做：判定 / 婉拒掷骰 / inviteWatch 置位 / 苗子潜力 / 声望 / 天赋。 */
  /* ══════════════════════════════════════════════════════════════════
     ★★ P97 M4 · L3 传承：合练 → "衣钵相传"
     ------------------------------------------------------------------
     ★ 为什么接在合练而不是新开一个入口：合练卡片本来就在说
       「把短板练到发烫」「他把防守他的心得一条条拆给你」——
       语义已经在那里了，这里只是**补上缺失的那半个机制**
       （`effPot` 一直在读 `starUnlock`，却从来没人写过它）。
     ★ 方向 = 球星的出身（前锋教终结 / 中场教组织 / 后卫教防守 / 门将教守门），
       落点 = 你在该类别的**短板项**。于是"跟谁合练"本身就成了策略选择。
     ══════════════════════════════════════════════════════════════════ */
  function tryInherit(d, star) {
    if (!window.Potential || typeof Potential.inherit !== "function") return null;
    const grp = ((window.CONFIG.POSITIONS || {})[star.pos] || {}).group;
    const cat = CFG.INHERIT[grp];
    if (!cat) return null;
    // ★ 用邀请**前**的好感判定深度（本次好感由结果卡的 fx 才加上，此刻还没涨）
    const deep = favorOf(d, star.pid) >= CFG.TIER_COACH;
    const r = Potential.inherit(d, cat, deep ? CFG.INHERIT_ADD[1] : CFG.INHERIT_ADD[0]);
    return r.ok ? r : null;
  }

  function doInvite(state, star, kind, youth) {
    const d = state.data; ensure(d);
    /* P64 修复：此处不能再查 offseasonPlan.inviteUsed —— fire() 先扣决策并置位
       inviteUsed、再调本函数，全量 inviteEligible 会「自己拦自己」，导致决策被吞、
       无结果卡（smoke 实测复现）。入口层的 inviteUsed 拦截在 nation_dev
       （入口按钮禁用 + openInviteCard 986 行 toast），这里只复核两个硬条件。 */
    const rec = recOf(d, star.pid);
    if (rec.lastInvite === d.season) return { ok: false, msg: "该球星今年已受邀" };
    if (star.ovr > g1MaxOvr(d)) return { ok: false, msg: "国际声望不足（现 " + d.prestige + "）" };
    rec.lastInvite = d.season;
    d.starFavor[star.pid] = rec;
    const favAmt = RNG.int(CFG.INTERACT_FAVOR[0], CFG.INTERACT_FAVOR[1]);
    if (kind === "watch") {
      if (favorOf(d, star.pid) < CFG.TIER_TRAIN && RNG.chance(CFG.DECLINE_CHANCE)) {
        return { ok: true, kind: "decline", star, favor: 0, card: {
          id: "sf_decline", cat: "生涯", art: "ec_phone", starPid: star.pid,
          title: "档期不巧",
          body: "经纪人的回复很客气：" + star.name + " 今年夏天行程排满了，「他很意外会收到来自中国的邀请，让我一定转达歉意。」你把手机放下，窗外的训练场晒得发白。",
          options: [{ text: "没关系，来日方长", response: "陌生不是拒绝的理由，只是时间没到。你把这份名单收好——好感还在，门没关。", fx: null }],
        } };
      }
      d.inviteWatch = { pid: star.pid, season: d.season };
      return { ok: true, kind: "watch", star, favor: CFG.WATCH_FAVOR, card: {
        id: "sf_watch", cat: "生涯", art: "ec_flag", starPid: star.pid,
        title: "看台上的约定",
        body: star.name + " 答得很痛快：「友谊赛？把日程发我。」他说想看看中国球迷什么样——「听说你们的助威声，隔着转播都能把人掀翻。」",
        options: [{ text: "一言为定", response: "日历上，下一个国际比赛日被圈了出来。看台上会多一位特殊的观众，你的每一脚触球，都多了双见过大场面的眼睛。",
          fx: { favor: CFG.WATCH_FAVOR, favorPid: star.pid, fame: CFG.WATCH_FAME } }],
      } };
    }
    if (kind === "train") {
      let talent = null;
      if (RNG.chance(CFG.TRAIN_TALENT_P) && window.TAL) talent = grantTalent(d);
      const inh = tryInherit(d, star);        // ★ P97 M4 · L3 传承（确定性，不消耗随机流）
      const card = {
        id: "sf_train", cat: "生涯", art: "ec_duet", starPid: star.pid,
        title: "一天的队友",
        body: "合练约在基地最茂盛的那块草皮。上午是分组对抗，" + star.name + " 把你当成真正的队友——该喊就喊，该提醒就提醒；下午一对一加练，他把防守他的心得一条条拆给你，包括他自己最怕的那一种。"
          + (inh ? "临走前他把你留下多说了二十分钟，就着你刚才那一下，把「" + inh.attrCn + "」的门道拆成三步——他说这是他自己当年最晚才想通的东西。" : ""),
        options: [{ text: "把短板练到发烫", response: "这一天你的经验条肉眼可见地涨。"
          + (talent ? "他随口一句点拨让你突然开窍——领悟了新习惯「" + talent.name + "」。" : "")
          + (inh ? "那三步你记在了本子上。回程的车上你忽然明白：有些东西，是别人替你走了弯路才换来的——「" + inh.attrCn + "」的天花板，被他悄悄抬高了一截。" : ""),
          fx: { exp: CFG.TRAIN_EXP, favor: favAmt, favorPid: star.pid } }],
      };
      return { ok: true, kind: "train", star, favor: favAmt, exp: CFG.TRAIN_EXP, talent, inherit: inh, card };
    }
    if (kind === "coach") {
      let delta = 0;
      const roll = RNG.next();
      if (roll < CFG.COACH_P[0]) delta = 1;
      else if (roll < CFG.COACH_P[0] + CFG.COACH_P[1]) delta = 2;
      const out = { ok: true, kind: "coach", star, delta, favor: favAmt };
      let bodyTail = "结束时他跟你说：「这几个孩子，脚下有东西。」";
      if (youth) {
        if (delta > 0) {
          youth.pot = Math.min(CFG.COACH_POT_CAP, (youth.pot || 0) + delta);
          youth.need = Math.max(1, (youth.need || 2) - 1); // 「当季经验+15%」的系统内等价：培养周期缩 1 季
          out.youth = youth;
          bodyTail = delta >= 2
            ? "他单独把 " + youth.name + " 留下来加了二十分钟——潜力上探了两格。"
            : "他的指点落在了实处——" + youth.name + " 的潜力上探了一格。";
        } else {
          bodyTail = "孩子们很兴奋，收获各有参差——成长这种事，急不来。";
        }
      }
      prestigeAdd(state, CFG.COACH_PRESTIGE);
      out.card = {
        id: "sf_coach", cat: "生涯", art: "ec_coach", starPid: star.pid,
        title: "大师课",
        body: star.name + " 来青训基地那天，小球员们提前一小时就到了。他没讲大道理，就带着孩子们颠球、抢圈，谁摔了就把人拉起来再上。" + bodyTail,
        options: [{ text: "他们会记住这一天", response: "基地的墙上后来多了一张合影。没有装裱，就用一枚图钉钉着——像在提醒所有人：路是通的。",
          fx: { favor: favAmt, favorPid: star.pid } }],
      };
      return out;
    }
    return { ok: false, msg: "未知互动类型" };
  }
  /** 合练领悟：加权抽 1 个未持有天赋（普60/稀30/顶10，与 roll6 权重一致） */
  function grantTalent(d) {
    const owned = (d.talents = d.talents || []);
    const pool = (window.TAL && TAL.POOL ? TAL.POOL : []).filter(t => owned.indexOf(t.id) < 0);
    if (!pool.length) return null;
    const W = { normal: 1, rare: 1 / 3, top: 0.25 };
    const weights = pool.map(t => W[t.tier] || 1);
    let roll = RNG.next() * weights.reduce((a, b) => a + b, 0), idx = 0;
    for (; idx < pool.length - 1; idx++) { roll -= weights[idx]; if (roll <= 0) break; }
    const t = pool[idx];
    owned.push(t.id);
    return t;
  }

  /* ── 友谊赛观赛结算（EventCards.afterResult / afterSilentBatch 调用） ──
     返回 { praiseCard } 时由调用方优先展示；否则注脚排队 */
  function consumeWatchOnResult(state, ctx) {
    const d = state.data;
    if (!d.inviteWatch || !ctx) return null;
    const comp = String(ctx.comp || "");
    const isFriendly = ctx.intlComp === "friendly" || comp.indexOf("友谊赛") >= 0;
    if (!isFriendly) return null;
    const w = d.inviteWatch;
    d.inviteWatch = null;
    const star = starById(w.pid) || { pid: w.pid, name: "这位球星" };
    ensure(d);
    const bonus = ctx.res === "胜" ? CFG.WIN_PRESTIGE : ctx.res === "平" ? CFG.DRAW_PRESTIGE : 0;
    prestigeAdd(state, CFG.ATTEND_PRESTIGE + bonus);
    addFavor(state, star.pid, CFG.WATCH_FAVOR);
    if (window.Career) { try { Career.addFame(state, CFG.WATCH_FAME); } catch (e) { /* ignore */ } }
    if (ctx.res === "胜" && RNG.chance(CFG.PRAISE_CHANCE)) {
      prestigeAdd(state, CFG.PRAISE_PRESTIGE);
      addFavor(state, star.pid, CFG.PRAISE_FAVOR);
      return { praiseCard: {
        id: "sf_praise", cat: "生涯", art: "ec_praise", starPid: w.pid,
        title: "来自看台的评价",
        body: "终场哨响，" + star.name + " 从看台下来，混进了混合采访区。面对镜头他没有客气：「他们踢得很有秩序。中国足球需要的只是时间和耐心——而耐心，恰恰是最稀缺的东西。」这段采访在国内刷了屏。",
        fx: { fame: CFG.PRAISE_FAME, favor: CFG.PRAISE_FAVOR, favorPid: star.pid },
      } };
    }
    pushNote(d, ctx.res === "负"
      ? star.name + " 仍看完了全场，离场时在你身后停了半秒。"
      : star.name + " 在看台上为你起立鼓掌。");
    return { consumed: true };
  }

  /* ── G2：苗子出口加成（nation_dev.pickRealClub 调用） ──
     pot≥80 的尖子池宽度 6 → 6+6（随声望），并给直落豪门概率 */
  function g2Elite(state, baseN) {
    const d = state.data; ensure(d);
    const bonus = d.prestige >= 80 ? 6 : d.prestige >= 70 ? 4 : d.prestige >= 60 ? 2 : 0;
    const n = baseN + bonus;
    const direct = d.prestige >= 80 ? CFG.G2_DIRECT[2] : d.prestige >= 70 ? CFG.G2_DIRECT[1] : CFG.G2_DIRECT[0];
    return { n, direct, keep: CFG.G2_KEEP };
  }

  window.StarFavor = {
    CFG, ensure, poolOf, starById, starsOfClubName,
    tierOf, favorOf, addFavor, recOf,
    pushNote, takeFavNotes,
    glowCheck, applyGlow, resolveTarget, hasSocialStar,
    prestigeAdd, g1MaxOvr, inviteEligible, inviteActions, doInvite, grantTalent,
    consumeWatchOnResult, g2Elite, tryInherit,   // ★ P97 M4 · L3 传承
  };
})();
