/* ============================================================================
   玩家 / 训练 / 成长系统 — 忠实还原原版 PlayerSystem + TrainingSystem + GrowthSystem
   ============================================================================ */
(function () {
  const DATA = window.GAME_DATA;

  // ── 球员系统 ──
  const PlayerSystem = {
    /* ★ P113：初始能力按出身分档（config.INITIAL_ABILITY_BY_ORIGIN 单一真相源）。
       · originId 对应数组 = 等权抽取（R.pick，R 消耗 1 次 —— 与旧 R.weighted 同为 1 次）；
       · 键缺失 / null / 未知出身 ⇒ 回落旧 INITIAL_ABILITY_DIST 加权表（失败安全 = 老行为）；
       · 标定目标见 config.js 注释：genius OVR≈48-54（五大青训轮换~争首发）、
         sports ≈43-47（五大替补带）、hotblood ≈38-42（本土主力）。 */
    rollInitialAbility(originId) {
      const byOrigin = CONFIG.INITIAL_ABILITY_BY_ORIGIN || {};
      const arr = originId ? byOrigin[originId] : null;
      if (Array.isArray(arr) && arr.length) return R.pick(arr);
      return R.weighted(CONFIG.INITIAL_ABILITY_DIST, it => it.p).ability;
    },
    create(name, position, nationality, abilityOverride, number, potBase) {
      const init = abilityOverride || this.rollInitialAbility();
      const p = {
        name, position, nationality,
        number: (typeof number === "number" && number >= 1 && number <= 30) ? number : 9,
        age: CONFIG.INITIAL_AGE,
        traits: { weakFoot: 1, skillMoves: 1 },
        hidden: { physicalTalent: R.int(30, 100), mental: R.int(30, 100), growth: R.pick(["ordinary", "ordinary", "excellent", "special"]) },
        attrs: {}, // 细项属性
        // ★ P97 M2 位置动态化：位置可写 + 适应性熟练度 + 变更史
        originPosition: position,                       // 开档位置（叙事"你本来是打这个的"）
        posMastery: { [position]: (CONFIG.POSITION_DYNAMICS && CONFIG.POSITION_DYNAMICS.MASTERY_START) || 50 },
        posHistory: [],                                 // [{season, from, to, reason}]
      };
      // ★ P97 M2：attrs 只含**该位置的池内项**（门将无进攻属性 / 外场无守门属性）
      const w = CONFIG.POSITION_WEIGHTS[position] || {};
      const cats = window.Pool ? Pool.catsOf(position) : Object.keys(CONFIG.ATTRIBUTES);
      for (const cat of cats) {
        /* ★★ P157（用户拍板「不同位置要有不同的初始属性分配」）：位置倾向从「主面板 +2」
           升级为**再分配制** —— 主面板（权重 ≥ 0.2）+6，副面板（< 0.2）−3。
           · 前锋开局就是射门/速度突出、中卫开局就是防守/身体突出（位置个性可感）；
           · OVR 净效应 ≈ +1.3（主面板权重和 ×6 − 副面板和 ×3 的加权差），
             叠加在 P157 抬高的 ability 基值上，标定口径见 config 注释；
           · 潜力钳制（下方 attrs>pot 保护）照旧兜底。 */
        const wCat = w[cat] || 0;
        const bump = wCat >= 0.2 ? 6 : -3;
        for (const id of (window.Pool ? Pool.membersOf(position, cat) : (CONFIG.ATTRIBUTES[cat] || []).map(a => a[0]))) p.attrs[id] = init + bump;
      }
      // ★★ P97 M1：生成潜力上限表（位置无关的种子 + 位置只决定偏置方向）
      //   该位置池上的潜力均值**精确等于**出身基准（85 / 80 / 76）
      if (window.Potential) {
        const P_ = Potential.CFG();
        const base = (typeof potBase === "number") ? potBase : ((P_.BASE || {}).hotblood || 76);
        p.pot = Potential.generate(position, base);
        p.starUnlock = {};
        p._potBase = base;
        p._potVer = 1;
        // ★ 初始属性不得高于潜力（39 起步 vs 65+ 潜力，正常不会触发，纯保护）
        for (const id of Object.keys(p.attrs)) if (p.pot[id] !== undefined && p.attrs[id] > p.pot[id]) p.pot[id] = p.attrs[id];
      }
      return p;
    },
    // ★ 权重表规范化：兼容两种书写形态 —— {id: w} 或 [[id, w], ...]
    //   为什么必须兼容：config.js 用**数组形态**（与 ATTRIBUTES 同风格、顺序可读、和值一眼可见），
    //   若实现只认对象形态，`inner[id]` 会全部取到 undefined → **静默退回等权**且不报错。
    //   ★ 2026-09-13 由对拍脚本 `tools/_p97_overall_parity.js` 抓到过这处静默失效 —— 该脚本已进 CI。
    _toWeightMap(spec) {
      const out = {};
      if (!spec) return null;
      if (Array.isArray(spec)) {
        for (const it of spec) {
          if (Array.isArray(it)) out[it[0]] = it[1];
          else if (it && typeof it === "object") Object.assign(out, it);
        }
      } else if (typeof spec === "object") {
        for (const k of Object.keys(spec)) out[k] = spec[k];
      }
      return Object.keys(out).length ? out : null;
    },
    // ★★ P97 M0.5：球风 → 身体档案（physicality 3 项用哪一份权重）
    //   球风（playStyle.id）优先；无球风时退回位置默认档案。
    //   ★ P97 M2：新增可选 pos —— 用于「按目标位置算总评」（fit(pos) 场景）；不传时行为与 M0.5 完全一致。
    buildProfile(player, pos) {
      const byStyle = CONFIG.BUILD_BY_STYLE || {};
      const byPos = CONFIG.BUILD_BY_POS || {};
      const st = player && player.playStyle && player.playStyle.id;
      if (st && byStyle[st]) return byStyle[st];
      return byPos[pos || (player && player.position) || ""] || "engine";
    },
    // 取某一类的「细项权重表」：身体类走档案，其余走 ATTRIBUTE_INNER；都没有则返回 null（退回等权）
    _innerOf(cat, player, pos) {
      const spec = cat === "physicality"
        ? (CONFIG.BUILD_PROFILES || {})[this.buildProfile(player, pos)]
        : (CONFIG.ATTRIBUTE_INNER || {})[cat];
      return this._toWeightMap(spec);
    },
    // 总评 = 面板加权（含疲劳/士气修正）
    // ★ P97 M0.5：类别内由「等权均值」升级为「按细项档案加权」——细项权重从此真正影响总评
    //   （Γ 方案的两层一致性即建立在此：类别权重 × 类别内档案 = 该项在总评里的真实份额）
    // ★★ P97 M2：拆出 `overallAt(player, pos)` —— **公式一字未改，只换输入池**：
    //   · 循环从「全部 8 类」改为「权重表里的类」（权重表的键 = 该位置的池）
    //   · 门将 / 外场共用同一套公式 → 满足用户「都共用一套总评」
    //   · 池外类不参与 → 也就不会因 attrs 缺项算出 NaN（分池后池外项根本不存在）
    overallAt(player, pos, opts = {}) {
      const w = CONFIG.POSITION_WEIGHTS[pos] || {};
      const av = (id) => (player.attrs[id] !== undefined ? player.attrs[id] : 30);   // 缺项兜底：30 = 属性值域下限
      const catAvg = {};
      for (const cat of Object.keys(w)) {
        /* ★ P114：membersOf 返回 **id 字符串数组**（非二元组）—— 消费循环必须用 for-of id，
           旧式 `const [id] of list` 会把字符串解构成单字符（attrs['v']）→ 全 30。 */
        const list = (window.Pool ? Pool.membersOf(pos, cat) : (CONFIG.ATTRIBUTES[cat] || []).map(a => a[0]));
        if (!list.length) continue;
        const inner = this._innerOf(cat, player, pos);
        if (inner) {
          let s = 0, ws = 0;
          for (const id of list) {
            const k = inner[id];
            if (k) { s += av(id) * k; ws += k; }
          }
          catAvg[cat] = ws ? s / ws : list.reduce((a, id) => a + av(id), 0) / list.length;
        } else {
          catAvg[cat] = list.reduce((s, id) => s + av(id), 0) / list.length;
        }
      }
      let sum = 0, wsum = 0;
      for (const [cat, wt] of Object.entries(w)) { sum += (catAvg[cat] || 30) * wt; wsum += wt; }
      let ovr = sum / (wsum || 1);
      /* ★ P171：overallAt 的疲劳修正随疲劳机制退役删除（opts.fatigue 兼容签名保留不消费）。 */
      if (opts.morale !== undefined) ovr += (opts.morale - 60) * 0.02;
      return Math.round(ovr);
    },
    /** 当前位置的总评（★ 原签名不变 → 12+ 处调用点零改动） */
    overall(player, opts = {}) { return this.overallAt(player, player.position, opts); },
    /** ★★ P115：比赛用「位置感知实战战力」= 当前位置实际战力（含熟练度折扣）+ 疲劳/士气调整。
     *  此前比赛引擎读 overall()（纯总评）—— 位置熟练度（Position.masteryOf/penaltyOf）零消费，
     *  「改打生疏位置会变弱」从未生效。现在：
     *    · 主位（熟练度 ≥ MASTERY_FULL）= 总评，零折扣；
     *    · 改打/危机换到生疏位置 = fit(该位置) − 熟练度折扣（0 熟练 −7.5）。
     *  门将跨池（effectiveAt 返回 null）或 Position 缺失 → 回落 overall()，失败安全。 */
    effectiveOvr(d, opts = {}) {
      const p = d && d.player;
      if (!p) return 0;
      /* ★ P171：疲劳因子随疲劳机制退役删除 —— 实战战力 = 位置熟练度修正 + 士气微调。
         opts.fatigue 兼容签名保留（旧调用点传了也不消费）。 */
      const o = { morale: (opts.morale !== undefined) ? opts.morale : d.morale };
      if (window.Position && Position.effectiveAt) {
        const eff = Position.effectiveAt(d, p.position);
        if (eff !== null) {
          let v = eff;
          if (o.morale !== undefined) v += (o.morale - 60) * 0.02;
          return Math.round(v);
        }
      }
      return this.overall(p, o);
    },
    catAverage(player, cat) {
      const list = CONFIG.ATTRIBUTES[cat] || [];
      if (!list.length) return 30;
      return Math.round(list.reduce((s, [id]) => s + (player.attrs[id] !== undefined ? player.attrs[id] : 30), 0) / list.length);
    },
  };

  // ── 训练系统 ──
  const Training = {
    // 天赋系数：开档 hidden.growth 掷骰贯穿生涯——天资影响经验获取效率（±10%）
    _talentMult(state) {
      const g = state.data.player.hidden && state.data.player.hidden.growth;
      return { ordinary: 0.9, excellent: 1.0, special: 1.1 }[g] || 1.0;
    },
    /* ── ★ P120 青训营/俱乐部强度 → 经验收益分档（训练+比赛同乘；不占个人 ×2.5 封顶）──
       青训期读青年队强度、成年读一线队强度（Youth.clubViewOf 统一视图单源）；
       失业/无队/模块缺失 → 回落 1.0（失败安全 = 老行为）。 */
    _facilityMult(d) {
      const T = (window.CONFIG && CONFIG.FACILITY_EXP) || null;
      if (!T || !T.length) return 1;
      let strength = null;
      if (window.Youth && Youth.clubViewOf) {
        const cv = Youth.clubViewOf(d);
        if (cv && typeof cv.strength === "number") strength = cv.strength;
      }
      if (strength == null && window.teamById) {
        const t = teamById(d.clubId);
        if (t && typeof t.strength === "number") strength = t.strength;
      }
      if (strength == null) return 1;
      for (const row of T) if (strength < row.max) return row.mult;
      return 1;
    },
    /** ★★ P295（玩家反馈「经验收益一直显示 2300，实际远比这个高」）：
       每日训练经验的**展示口径单源** —— 与 dailyTrain 的入账公式逐位同式（零 R 消耗、
       纯读存档）。UI（hub 三处说明文案）一律走这里，不再裸显 CONFIG.DAILY_TRAINING.exp。 */
    dailyExpPreview(state) {
      const cfg = CONFIG.DAILY_TRAINING;
      const tal = window.TAL;
      const talExp = tal ? tal.expMult(state.data, "train") : 1;
      const perMult = window.Personality ? Personality.mult(state.data, "physicalTalent", 0.2) : 1;
      const boost = (state.data.expBoost || state.data.expBoostSeason === state.data.season) ? 1.5 : 1;
      const det = state.data.player && state.data.player.attrs ? state.data.player.attrs.determination : null;
      const detMult = (typeof det === "number") ? Math.max(0.94, Math.min(1.09, 1 + (det - 60) * 0.003)) : 1;
      const expMultAll = Math.min(2.5, boost * this._talentMult(state) * talExp * perMult * detMult);
      const _age = (state.data.player && state.data.player.age) || 25;
      const ageDecay = Math.max(0.7, 1 - Math.max(0, _age - 30) * 0.03);
      const comfort = (window.Career && Career.housingLevels && state.data.housing)
        ? ((Career.housingLevels[state.data.housing.level || 0] || Career.housingLevels[0]).comfort || 1) : 1;
      const comfortMult = 1 + (comfort - 1) * 0.05;
      const staBonus = (window.Skills && Skills.bonus) ? Skills.bonus(state.data, "stamina", 0.15) : 0;
      return Math.round(cfg.exp * expMultAll * ageDecay * comfortMult * (1 + staBonus) * this._facilityMult(state.data));
    },
    dailyTrain(state) {
      /* ★ P295：经验段抽到 dailyExpPreview（同式同源），本函数只保留伤病/入账链。
         公式逐位不变（原 189-218 行整段搬移）——soak 的 R 消耗序零影响（经验段本就零 R）。 */
      const expGain = this.dailyExpPreview(state);
      const tal = window.TAL;
      const res = { exp: expGain, injured: 0 };
      /* ★ P260：删除训练经验直加入池（本行早于 P125 存在，deposit 单入口化时漏删）——
         双倍入账实锤：expTotal 只记一份、expPool 记两份（UI 每日提示 +2600，池实 +5200），
         玩家可支配成长资源 ×2 = 「成长太快」实锤根因（P260 推演探针 _p260_growth_sim 复现：
         260 天入账 ≈ 6000/日 > 乘数链理论上限 ≈3100/日）。
         现统一走下方 deposit：入池 + 入 expTotal（等级）各一份。 */
      // ★ P171：训练疲劳（fatigueChance/fatiguePenalty）随疲劳机制退役删除 —— 训练只出经验与伤病。
      // 训练伤病（★ P179 双轨重设计，用户拍板「每赛季伤病 ≤2 次不分大小 + 月以上大伤约 5 季一次」）：
      // · 轻伤轨：6.5% → **0.5%**/次训练（期望 1.2 次/季）—— 首版保留 6.5% 时配额 15~30 天即被
      //   轻伤顶满，大伤轨整季被挤出（实测 100 季仅 1-3 次）；下调后配额有空间，硬上限仍是保险；
      // · 大伤轨：**节奏器**——距上次重伤 ≥5 季后，每次训练 2% 判定补位触发（期望 4.8/季 →
      //   冷却满后 91% 当季触发）→ 实际节奏 ≈ 每 5~6 季一次，不与轻伤竞争概率带。
      const riskMult = (typeof Career !== "undefined" && Career.injuryRiskMultiplier) ? Career.injuryRiskMultiplier(state) : 1;
      const discGuard = window.Personality ? Personality.mult(state.data, "discipline", 0.15) : 1; // 自律 5★ 伤病率 ÷1.15，负等级更易伤
      /* ★ P171（疲劳退役安置）：「铁人」技能新出口 = 训练伤病率 −（5★ ÷1.25）。
         ★ P185：「抗伤体质」技能并入**训练伤**通道（此前只挂赛后伤——用户实测
           「伤病率属性加满还月 2 伤」的根因之一：两条通道乘数不同源）。 */
      const imGuard = (window.Skills && Skills.mult) ? Math.max(0.5, Skills.mult(state.data, "ironMan", -0.25) * Math.max(0.4, Skills.mult(state.data, "durability", -0.30) || 1)) : 1;
      /* ★ P185：**体质属性**（naturalFitness）→ 伤病率乘数——70 体=1.0 基准，
         90 体=×0.90（-10%）、50 体=×1.10（+10%）；clamp [0.85, 1.20]。
         「肌肉强度与自我保护」的属性侧落点：玩家把体质练满，伤病率真实下降。 */
      const _fit = state.data.player && state.data.player.attrs ? state.data.player.attrs.naturalFitness : null;
      const fitGuard = (typeof _fit === "number") ? Math.max(0.85, Math.min(1.20, 1 - (_fit - 70) * 0.005)) : 1;
      const roll = R.next() / (riskMult * (tal ? tal.injuryMult(state.data) : 1) * discGuard * imGuard * fitGuard); // 乘数语义统一：<1 = 更不易受伤
      const injDiscount = (window.IDENTITY && IDENTITY.injuryDiscount) ? IDENTITY.injuryDiscount(state.data) : 0; // 出身：体校青训 每次伤病 -1 天
      const _fl = state.data.flags = state.data.flags || {};
      const sinceHeavy = state.data.season - (_fl.lastHeavyInjSeason != null ? _fl.lastHeavyInjSeason : -99);
      if (roll < 0.005) {
        res.injured = Math.max(1, Math.round(R.int(2, 6) * (tal ? tal.healMult(state.data) : 1)) - injDiscount);
      } else if (sinceHeavy >= 5 && R.next() < 0.02) {
        // 大伤节奏器（第二抽仅在冷却满后发生，前 5 季零 R 消耗；R 消耗结构 = 2 次/日不变）
        // ★ P185：节奏器吃乘数链——第二抽落在 [0, 0.02×_hvMul) 才真触发（体质好/抗伤高
        //   → 概率按比例下降 → 大伤间隔自然拉长至 6~8 季）；未命中 = 无伤（res.injured 保持 0）。
        const _hvMul = (tal ? tal.injuryMult(state.data) : 1) * discGuard * imGuard * fitGuard;
        if (R.next() < 0.02 * _hvMul) {
          res.injured = Math.max(14, Math.round(R.int(14, 30) * (tal ? tal.healMult(state.data) : 1)) - injDiscount);
          _fl.lastHeavyInjSeason = state.data.season;   // 重锚：从触发季起算
        }
      }
      /* ★ P179 赛季配额：每季伤病 ≤2 次（不管大小伤，Injuries 单源计数）。配额尽 → 本次训练照常、不受伤。 */
      if (res.injured && window.Injuries && Injuries.quotaLeft(state.data) <= 0) res.injured = 0;
      else if (res.injured && window.Injuries) Injuries.markInjured(state.data);
      if (res.injured) state.data.injuryDays = Math.max(state.data.injuryDays, res.injured);
      /* ★★ P125（2026-09-18 用户拍板）：经验池 = 纯手动加点货币 —— 训练经验只入池，
         不再自动随机转化为属性点。成长方向 100% 交给玩家（spendOn）。 */
      this.deposit(state, expGain);
      res.gains = [];
      return res;
    },
    /* ── ★★ P125：经验入池单入口（训练/比赛/事件/广告等所有供给路线统一走这里）──
       · expTotal 结算（等级的单一依据）与 expPool 入账在同一函数，杜绝「只加池子不涨等级」的漏接；
       · 零属性消耗、零 R —— 玩家不手动加点，经验就安静地攒着，绝不浪费。 */
    deposit(state, exp) {
      if (exp > 0) {
        state.data.expTotal = (state.data.expTotal || 0) + exp;
        if (window.Skills && Skills.grantLevelUps) {
          const up = Skills.grantLevelUps(state.data);
          if (up > 0) state.data._levelUps = (state.data._levelUps || 0) + up;   // hub 提示用
        }
      }
      state.data.expPool = (state.data.expPool || 0) + exp;
      return { gains: [], left: state.data.expPool };
    },
    traitTrain(state, subjectId) { return Skills.spend(state, subjectId); }, // 兼容旧调用（特技练习 → SP 投入）
    /** 技能库效果乘数：1 + (stars/5) × effect（effect<0 为减益，如伤病率） */
    skillMult(d, id, effect) { return Skills.mult(d, id, effect); },
    // 软上限成本：属性越高每点越贵 —— ★ P259 六段梯度（前期快 / 后期慢 / 平滑等比 ~×1.65）
    // 动机：蒙特卡洛验证经验堆积可线性堆满 99 → 全广告生涯 40/40 封顶无差异；软上限让顶层成长自然放缓
    // ★★ P259（用户反馈「投入经验值很快就成长，缺乏曲线」）：旧曲线 30→79 恒 ×1，
    //   50 点跨度零梯度 = 「缺乏曲线」主因。新曲线设计口径：
    //   · 30-59 ×0.6 —— 前期更便宜（旧 ×1 的六折）：开档起飞更快（用户口径「前期成长快」）
    //   · 60-69 ×1.0 / 70-79 ×1.6 —— 中段 70 起提前抬头（旧 80+ 才开始贵）
    //   · 80-89 ×2.6 / 90-95 ×4.5 / 96+ ×8 —— 顶级化显著放缓（旧 2/4/8）
    //   · 30→95 总成本 94 万 → 97 万（+3%），总量几乎持平，分布整体后移；
    //     相邻段比值 1.67/1.60/1.63/1.73/1.78 —— 近似等比 ×1.65，无断崖。
    //   · 出身 ORIGIN_HARD_CAP（genius 95 / sports 86 / hotblood 81）不受影响：
    //     热血档封顶 81 落在 ×2.6 段，末段天然更贵 = 出身差距由曲线自然放大。
    _costMult(v) { return v < 60 ? 0.6 : v < 70 ? 1 : v < 80 ? 1.6 : v < 90 ? 2.6 : v < 96 ? 4.5 : 8; },
    /** 出身+球风：加成类别的经验效率提升（+15%/来源），等价于成本打折；无加成返回 1 */
    _catCostDiscount(state, cat) {
      const b = window.IDENTITY ? IDENTITY.catBonus(state.data, cat) : 0;
      return b > 0 ? 1 / (1 + b) : 1;
    },
    /* ── P111 位置核心价格杠杆（用户：不同位置有不同的技能可以加点）──
       核心属性（CONFIG.POSITION_CORE[pos]）+1 平价；非核心 ×POSITION_CORE_MULT（1.6）。
       ★ 为什么用价格而不是禁止：改位系统（P97-M2）是合法成长路径，
         CB 想练射门是"改造位置"，杠杆让方向感与自由度并存。
       读写零 R（hub 的成本展示与实扣共用本函数 = 单源）。 */
    _posCostMult(state, attrId) {
      const M = window.CONFIG && CONFIG.POSITION_CORE_MULT;
      if (!M || M === 1) return 1;
      const core = window.CONFIG && CONFIG.POSITION_CORE && CONFIG.POSITION_CORE[state.data.player.position];
      return (core && core.indexOf(attrId) >= 0) ? 1 : M;
    },
    /* ── ★ P120 出身成本系数（1.0/1.12/1.25）──
       「从经验获取量入手拉开出身差」的成本端实现：数学上等价「热血经验获取 ×0.8」，
       但单点生效 → 训练/比赛/广告注入/等级奖励全部供给路线自动覆盖（广告能加速但压不平）。
       旧档/缺 origin 回落 1.0。与 hub 成本展示共用（单源）。 */
    _originCostMult(state) {
      const M = window.CONFIG && CONFIG.POTENTIAL && CONFIG.POTENTIAL.ORIGIN_COST_MULT;
      if (!M) return 1;
      const d = state.data;
      const oid = (d && ((d.origin && d.origin.id) || d.originId)) || "";
      return M[oid] || 1;
    },
    /* ── P105-B1 训练重点（FM individual focus 球员侧化） ──
       d.trainFocus = null（均衡）| { kind:"cat", cat } | { kind:"pos", pos }
       类别侧重：该类经验抽中权重 ×2.5（与出身/球风加成同语义，同类不叠加——applyExp 按
       候选独立判权，|| 语义天然不叠加）。位置侧重：季末该位置熟练度 +GAIN_TRAIN（消费
       P97 M2 预留的 config 参数，此前零消费方）。读写全零 R（UI 渲染纪律）。 */
    focusOf(d) {
      const f = d && d.trainFocus;
      if (!f || typeof f !== "object") return null;
      const pl = d.player;
      if (!pl) return null;
      if (f.kind === "cat" && (CONFIG.ATTRIBUTES[f.cat] || {}).length) return { kind: "cat", cat: f.cat };
      if (f.kind === "pos" && CONFIG.POSITIONS[f.pos]) return { kind: "pos", pos: f.pos };
      return null;
    },
    setFocus(state, focus) {
      const d = state.data, pl = d.player;
      if (!pl) return { ok: false, msg: "无球员" };
      if (!focus) { d.trainFocus = null; return { ok: true, msg: "恢复均衡训练" }; }
      if (focus.kind === "cat") {
        const poolCats = window.Pool ? Pool.catsOf(pl.position) : Object.keys(CONFIG.ATTRIBUTES);
        if (poolCats.indexOf(focus.cat) < 0) return { ok: false, msg: "当前位置练不了这个类别" };
        d.trainFocus = { kind: "cat", cat: focus.cat };
        return { ok: true, msg: "训练重点：专攻" + (CONFIG.CATEGORIES[focus.cat] || {}).name };
      }
      if (focus.kind === "pos") {
        if (focus.pos === pl.position) return { ok: false, msg: "这已经是你现在的位置" };
        // 门将隔离（P97 M2 结构规则）：canCross = 池键相等（field/gk），跨界侧重重定
        if (window.Pool && !Pool.canCross(pl.position, focus.pos)) return { ok: false, msg: "位置池不同，练不成" };
        d.trainFocus = { kind: "pos", pos: focus.pos };
        return { ok: true, msg: "训练重点：加练" + ((CONFIG.POSITIONS[focus.pos] || {}).name || focus.pos) };
      }
      return { ok: false, msg: "无效的训练重点" };
    },
    /* ★★ P125 退役：加权随机加点路径已下线（经验池改为纯手动加点，见 deposit/spendOn）。
       函数保留仅供旧探针/兼容调用，游戏主链路不再触达。 */
    applyExp(state, exp, perPoint, weightedRandom) {
      const player = state.data.player;
      const gains = [];
      let pool = exp;
      /* ★★ P114：生涯累计经验入账（等级的单一依据）。训练/比赛经验都走本函数，
         等级提升奖励（expPool 直发）不经过这里 → 无正反馈循环。 */
      if (exp > 0) {
        state.data.expTotal = (state.data.expTotal || 0) + exp;
        if (window.Skills && Skills.grantLevelUps) {
          const up = Skills.grantLevelUps(state.data);
          if (up > 0) state.data._levelUps = (state.data._levelUps || 0) + up;   // hub 提示用
        }
      }
      // ★ P105-B1：训练重点类别的候选抽中权重 ×2.5（与出身/球风同语义）
      const focusCat = (state.data.trainFocus && state.data.trainFocus.kind === "cat") ? state.data.trainFocus.cat : null;
      // ★★ P97 M1 硬墙：候选池从「< 99」改为「< effPot(该属性)」
      //   effPot 只依赖 pot/potUnlock/starUnlock（不依赖 attrs）→ 循环外算一次即可
      const eff = window.Potential ? Potential.effMap(state.data) : null;
      // ★★ P97 M2：候选池只取**该位置的池** —— 门将的点数 100% 落在门将池，
      //   外场项也不再被门将项分走 → P96 遗留的「门将 15.2% 点数浪费」由此归零
      const poolCats = window.Pool ? Pool.catsOf(player.position) : Object.keys(CONFIG.ATTRIBUTES);
      for (let guard = 0; guard < 999; guard++) {
        const candidates = [];
        for (const cat of poolCats) {
          for (const id of (window.Pool ? Pool.membersOf(player.position, cat) : (CONFIG.ATTRIBUTES[cat] || []).map(a => a[0]))) {
            const cap = (eff && eff[id] !== undefined) ? eff[id] : 99;
            if (player.attrs[id] < cap) candidates.push({ id, name: id, cat });
          }
        }
        if (!candidates.length) {
          // ★ 防御（正常不可达）：池内项在 attrs 里**根本不存在**（如跨池改位的极端情况）
          //   → 按 30 补齐后重试，避免"经验无处可去"直接进入撞顶结算
          let missing = 0;
          for (const cat of poolCats) {
            for (const id of (window.Pool ? Pool.membersOf(player.position, cat) : (CONFIG.ATTRIBUTES[cat] || []).map(a => a[0]))) {
              if (player.attrs[id] === undefined) { player.attrs[id] = 30; missing++; }
            }
          }
          if (missing) continue;
          // ★★ 全池撞顶：经验无处可去 → 折价 70% 转 SP（否则训练退化成废操作）
          if (window.Potential) Potential.depositSpill(state.data, pool, state.data.season);
          pool = 0;
          break;
        }
        // 出身/球风加成类别、P105-B1 训练重点类别：抽中权重 ×2.5（同类不叠加——按候选独立判权）
        let c;
        if (weightedRandom && window.IDENTITY) {
          const weighted = [];
          for (const cand of candidates) {
            const w = (IDENTITY.catBonus(state.data, cand.cat) > 0 || cand.cat === focusCat) ? 2.5 : 1;
            for (let k = 0; k < w; k++) weighted.push(cand);
          }
          c = weighted[R.int(0, weighted.length - 1)];
        } else {
          c = weightedRandom ? R.pick(candidates) : candidates[gains.length % candidates.length];
        }
        const cost = perPoint * this._costMult(player.attrs[c.id]) * this._catCostDiscount(state, c.cat) * this._originCostMult(state); // ★ P215：训练师改「每周自动成长」通道，不再打折手动路径
        if (pool < cost) break;
        pool -= cost;
        player.attrs[c.id] = Math.min(99, player.attrs[c.id] + 1);
        gains.push(c);
      }
      return { gains, left: pool };
    },
    applyMatchExp(state, exp) {
      const tal = window.TAL;
      const talExp = tal ? tal.expMult(state.data, "match") : 1;
      /* ★ P171（疲劳退役安置）：「第二口气」技能的新出口 = 比赛经验加成（5★ +10%）。 */
      const swBonus = (window.Skills && Skills.bonus) ? Skills.bonus(state.data, "secondWind", 0.10) : 0;
      const gain = Math.round(exp * this._talentMult(state) * talExp * (1 + swBonus) * this._facilityMult(state.data)); // ★ P120：设施档次系数同乘
      /* ★ P125：比赛经验同样只入池（原「一次性随机消耗、余额丢弃」退役），由玩家手动加点 */
      this.deposit(state, gain);
      return [];
    },
    /* ── ★★ P109（2026-09-17 用户拍板）：手动加点「能力值加点」──
       需求：随着等级（经验）提升，玩家要能**自己决定**把成长点在哪里，但不得超过潜力上限。
       设计（零漂移 + 经济守恒）：
       · 经验池就是可自由支配的成长货币——玩家可在属性页**预支**经验池，指定某一项 +1；
       · 单点成本与自动转化**同一套公式**（EXP_PER_ABILITY × _costMult × 出身/球风折扣）
         ⇒ 手动不会比自动便宜，80+/90+ 的软上限门槛原样生效；
       · 硬上限 = Potential.effMap（潜力上限，含积分解锁与传承加成）——到顶即拒；
       · 没花掉的经验仍走原自动随机转化（每日训练）——本函数**零 R 消耗**（确定性），
         玩家不用它 ⇒ 全链行为与旧版逐位一致（soak 基线不受此函数影响）。 */
    spendOn(state, attrId) {
      const d = state.data, player = d.player;
      if (!player) return { ok: false, msg: "无球员" };
      // 只允许当前位置池内的属性（门将池/外场池隔离，与 applyExp 候选口径一致）
      const poolCats = window.Pool ? Pool.catsOf(player.position) : Object.keys(CONFIG.ATTRIBUTES);
      let cat = null, name = null;
      for (const c of poolCats) {
        for (const [id, nm] of (CONFIG.ATTRIBUTES[c] || [])) {
          if (id === attrId) { cat = c; name = nm; break; }
        }
        if (cat) break;
      }
      if (!cat) return { ok: false, msg: "当前位置练不了这一项" };
      if (player.attrs[attrId] === undefined) player.attrs[attrId] = 30;   // 防御：缺项按 30 补齐（与 applyExp 同口径）
      const cur = player.attrs[attrId];
      /* ★★ P125 同类短板约束（2026-09-18 用户拍板）：单项 − 同类最低项 > ATTR_GAP_LIMIT(15) → 拒绝。
         专长不能建立在真空里——先把同类短板补上来，防止一条属性甩开同类太多的畸形加点。
         同类口径 = 当前位置池内该项所属类别的全部成员（与 applyExp/hub 展示同池同源）；
         缺项按 30 补齐口径参与比较（与上方防御一致）；排除自身，否则「最低项是自己」时约束失效。 */
      const GAP = (CONFIG.ATTR_GAP_LIMIT !== undefined) ? CONFIG.ATTR_GAP_LIMIT : 15;
      const members = window.Pool ? Pool.membersOf(player.position, cat) : (CONFIG.ATTRIBUTES[cat] || []).map(a => a[0]);
      let minV = Infinity, minName = "";
      for (const mid of members) {
        if (mid === attrId) continue;
        const mv = player.attrs[mid] !== undefined ? player.attrs[mid] : 30;
        if (mv < minV) {
          minV = mv;
          minName = ((CONFIG.ATTRIBUTES[cat] || []).find(a => a[0] === mid) || [mid, mid])[1];
        }
      }
      if (minV !== Infinity && cur + 1 - minV > GAP) {
        return { ok: false, msg: "「" + name + "」将比同类最低的「" + minName + "」高出 " + (cur + 1 - minV) + " 点——同类短板过低，先补短板再练专长" };
      }
      const eff = window.Potential ? Potential.effMap(d) : null;
      const cap = (eff && eff[attrId] !== undefined) ? eff[attrId] : 99;
      if (cur >= cap) return { ok: false, msg: "「" + name + "」已到潜力上限 " + cap + "，加不动了（到帽可看广告潜力突破）" };
      /* ★ P111：成本叠加位置杠杆（核心平价 / 非核心 ×1.6），与 hub 展示同源；★ P120 叠出身成本系数
         ★ P196：叠年龄三档系数（28 岁前 ×1.0 / 28-35 ×1.6 / 36+ ×3.0，ageCostMult 单源）——
           老将维系的每一分成长更贵，经验从「抬帽」转向「维系」，与 P195 衰退构成闭环。
         ★ P215：训练师不再打折手动加点（原 P205 通道移除）——训练师效果改走 weeklyGrowth
           「每周自动成长」，与手动加点解耦：雇一天辞一天套利结构性消失。 */
      const cost = Math.round(CONFIG.EXP_PER_ABILITY * this._costMult(cur) * this._catCostDiscount(state, cat) * this._posCostMult(state, attrId) * this._originCostMult(state)
        * ((window.Potential && Potential.ageCostMult) ? Potential.ageCostMult(d) : 1));
      if ((d.expPool || 0) < cost) {
        return { ok: false, msg: "经验不足：需要 " + cost + "，当前经验池 " + (d.expPool || 0) };
      }
      d.expPool -= cost;
      player.attrs[attrId] = cur + 1;
      const pm = this._posCostMult(state, attrId);
      return { ok: true, msg: "「" + name + "」+1（" + (cur + 1) + " / " + cap + "），消耗经验 " + cost + (pm > 1 ? "（非本位置核心，价格 ×" + pm + "）" : ""), spent: cost };
    },
  };

  // ── 技能库（SP 投入制）：技能点唯一成长源——赛季结算兑付 + 开档初始 + 特训指导广告 ──
  const Skills = {
    ensure(d) {
      if (!d.traits) d.traits = {};
      if (!d.traits.traitExp) d.traits.traitExp = {}; // 旧档遗留字段，保留防炸
      if (d.skillPoints === undefined) d.skillPoints = CONFIG.SKILL_LIBRARY.SP.START; // 旧档迁移：一次性补发初始点
      if (d._seasonHighlights === undefined) d._seasonHighlights = 0;
      /* ★ P114：等级字段兜底（expTotal 由 applyExp 累加；level = 已领奖等级，缺省 1） */
      if (d.expTotal === undefined) d.expTotal = 0;
      if (d.level === undefined) d.level = 1;
    },
    def(id) { return CONFIG.SKILL_LIBRARY.SKILLS.find(s => s.id === id) || null; },
    stars(d, id) { return (d.traits && d.traits[id]) || 0; },   // ★ P171：traits 缺省防御（dailyTrain 新消费点在旧探针沙箱里踩到）
    sp(d) { this.ensure(d); return d.skillPoints || 0; },
    /** 星级效果乘数：1 + (stars/5) × effect。effect>0 增益、<0 减益（如伤病率 -0.3 → 5★ 伤病率×0.7） */
    mult(d, id, effect) {
      if (!this.def(id)) return 1;
      return 1 + (this.stars(d, id) / CONFIG.SKILL_LIBRARY.MAX_STARS) * effect;
    },
    /** 星级线性加成（绝对值）：(stars/5) × effect */
    bonus(d, id, effect) {
      if (!this.def(id)) return 0;
      return (this.stars(d, id) / CONFIG.SKILL_LIBRARY.MAX_STARS) * effect;
    },
    /** 投入技能点 = 该技能 +1★（★ P174 成本递增：升到下一星的花费 = 当前星级+1，
        0→1 花 1 / 1→2 花 2 / 2→3 花 3 / 3→4 花 4 / 4→5 花 5；满星总 15 点） */
    spend(state, id) {
      const def = this.def(id);
      if (!def) return { ok: false, reason: "未知技能" };
      this.ensure(state.data);
      const st = state.data.traits;
      const cur = st[id] || 0;
      if (cur >= CONFIG.SKILL_LIBRARY.MAX_STARS) return { ok: false, reason: "已满星" };
      const cost = (CONFIG.SKILL_LIBRARY.COST || [1, 2, 3, 4, 5])[cur] || 1;
      if ((state.data.skillPoints || 0) < cost) return { ok: false, reason: "技能点不足（需 " + cost + "）" };
      state.data.skillPoints -= cost;
      st[id] = cur + 1;
      return { ok: true, stars: st[id], cost: cost };
    },
    /** ★ P114：升到下一星的花费（hub 渲染按钮用，与 spend 同源）；★ P174：fallback 数组同步星级+1 */
    nextCost(d, id) {
      const cur = (d.traits && d.traits[id]) || 0;
      return (CONFIG.SKILL_LIBRARY.COST || [1, 2, 3, 4, 5])[cur] || 1;
    },
    grant(d, n) { this.ensure(d); d.skillPoints = (d.skillPoints || 0) + n; },
    /** 每赛季「特训指导」看视频剩余次数（★ P114：不限次 —— 原 AD_PER_SEASON 2 次上限退役） */
    spAdLeft(d) {
      this.ensure(d);
      return 999;
    },
    consumeSpAd(d) {
      this.ensure(d);
      this.grant(d, CONFIG.SKILL_LIBRARY.SP.AD_GAIN);
    },
    /* ══ ★★ P114 等级系统 ══
       · 等级由生涯累计经验（d.expTotal）驱动：Lv = 1 + floor(expTotal / EXP_PER_LEVEL)；
       · 每升 1 级：+2 属性点（expPool += 2×EXP_PER_ABILITY）+1 技能点，跨级一次性补发；
       · d.level = 已领取奖励的等级（单调），applyExp 入账时调用 grantLevelUps。 */
    levelOf(d) {
      const L = CONFIG.LEVEL || { EXP_PER_LEVEL: 80000, MAX: 40 };
      return Math.min(L.MAX || 40, 1 + Math.floor((d.expTotal || 0) / (L.EXP_PER_LEVEL || 80000)));
    },
    grantLevelUps(d) {
      const L = CONFIG.LEVEL || {};
      const lv = this.levelOf(d);
      const got = (d.level != null) ? d.level : 1;
      if (lv <= got) return 0;
      const n = lv - got;
      d.level = lv;
      // +属性点（发经验池，不记 expTotal —— 防正反馈循环）
      d.expPool = (d.expPool || 0) + n * (L.UP_ATTR_POINTS || 2) * (CONFIG.EXP_PER_ABILITY || 10000);
      // +技能点
      d.skillPoints = (d.skillPoints || 0) + n * (L.UP_SKILL_POINTS || 1);
      return n;
    },
    /** 赛季结算：表现 → 技能点（普通 2-4 点 / 巅峰最多 8 点；全满 90 点 → 生涯必然取舍） */
    seasonGain(result, d) {
      const cfg = CONFIG.SKILL_LIBRARY.SP.SEASON;
      const log = (d.careerLog && d.careerLog[d.careerLog.length - 1]) || {};
      let sp = cfg.base;
      if ((log.apps || 0) >= 20) sp += cfg.apps20;
      if ((result.avgRating || 0) >= 7.0) sp += cfg.rating7;
      if ((result.avgRating || 0) >= 7.5) sp += cfg.rating75;
      if ((d._seasonHighlights || 0) >= 5) sp += cfg.highlights5;
      if (result.myRank === 1 || (result.awards || []).some(a => a.name.indexOf("杯赛冠军") >= 0)) sp += cfg.leagueCup;
      if ((result.awards || []).some(a => /金靴|金冕|最佳球员/.test(a.name))) sp += cfg.award;
      if (cfg.cap != null) sp = Math.min(sp, cfg.cap); // P1-11 单季上限
      return sp;
    },
  };

  // ── 性格系统（隐藏天赋）：生活事件的选择经验 → 三维度等级 → 真实数值效果 ──
  const Personality = {
    KEYS: [
      { id: "discipline",      name: "自律",     icon: "check",     effect: "训练伤病率 −3%/级" },   // ★ P218：原「每日疲劳恢复」随疲劳机制退役删除
      { id: "professionalism", name: "职业素养", icon: "clipboard", effect: "士气基线 +1/级" },
      { id: "physicalTalent",  name: "身体天赋", icon: "dumbbell",  effect: "训练经验 +4%/级" },
    ],
    def(id) { return this.KEYS.find(k => k.id === id) || null; },
    xp(d, id) { return (d.hidden && d.hidden.xp && d.hidden.xp[id]) || 0; },
    /** 等级：±60 点升/降 1 级，正向最高 5 级、负向最多 -3 级 */
    level(d, id) {
      const xp = this.xp(d, id);
      const raw = Math.floor(Math.abs(xp) / 60) * (xp < 0 ? -1 : 1);
      return Math.max(-3, Math.min(5, raw));
    },
    /** 等级效果乘数：1 + (level/5) × effect（负等级自然反噬） */
    mult(d, id, effect) { return 1 + (this.level(d, id) / 5) * effect; },
    /** 等级效果加成（绝对值）：(level/5) × effect */
    bonus(d, id, effect) { return (this.level(d, id) / 5) * effect; },
  };

  // ── 成长/衰退系统 ──
  const Growth = {
    seasonEnd(state) {
      const player = state.data.player;
      const age = player.age;
      const mult = CONFIG.YOUTH_MULTIPLIERS[age] || (age < 27 ? 1.0 : age < 30 ? 0.5 : age < 33 ? -0.5 : -1.2);
      const caps = (CONFIG.POTENTIAL && CONFIG.POTENTIAL.CAPS) || { ordinary: 4, excellent: 6, special: 8 }; // ★ 已提配置层（原为函数体内字面量）；`||` 兜底 = 缺键时逐位等价历史行为
      const cap = (caps[player.hidden.growth] || 4) + ((window.TAL && TAL.growthCapBonus) ? TAL.growthCapBonus(state.data) : 0); // P113 五档：天资异禀 capBonus（1~4）
      const season = state.data.seasonStats;
      const participation = Math.min(1, season.apps / 30);
      const perf = season.ratingSum > 0 ? (season.ratingSum / season.apps) / 6.8 : 0; // ~1.0 at 6.8
      let delta = Math.round(mult * cap * Math.max(participation, age <= 22 ? 0.5 : 0.35) * (0.8 + perf * 0.5));
      // 年龄衰退期强制衰退（天赋：大器晚成 → 负成长按档减免 20~80%，31+ 仍至少 -1）
      if (age >= 31) delta = Math.min(delta, -1);
      if (delta < 0 && window.TAL && TAL.declineCut) {
        const _cut = TAL.declineCut(state.data);
        if (_cut > 0) delta = Math.ceil(delta * (1 - _cut));
      }
      const gains = [];
      const poolCats = window.Pool ? Pool.catsOf(player.position) : Object.keys(CONFIG.ATTRIBUTES);
      if (delta > 0) {
        const w = CONFIG.POSITION_WEIGHTS[player.position] || {};
        // ★ P97 M2：改为**按权重降序**遍历（原实现遍历 ATTRIBUTES 声明顺序、只用 cats 做 includes 过滤，
        //   实际上没做到"主面板先涨"）—— 现在权重最高的类先分配，总评增长更贴合位置意图。
        const cats = Object.keys(w).sort((a, b) => w[b] - w[a]);
        const eff = window.Potential ? Potential.effMap(state.data) : null;
        for (const cat of cats) {
          for (const id of (window.Pool ? Pool.membersOf(player.position, cat) : (CONFIG.ATTRIBUTES[cat] || []).map(a => a[0]))) {
            if (gains.length >= delta) break;
            const cap = (eff && eff[id] !== undefined) ? eff[id] : 95;
            if (player.attrs[id] !== undefined && player.attrs[id] < cap) { player.attrs[id]++; gains.push(id); }
          }
          if (gains.length >= delta) break;
        }
      } else if (delta < 0) {
        /* ★★ P120（用户拍板）：衰退定向 —— 年龄衰退只掉 速度(pace)+身体(physicality)，
           其他五类（终结/带球/传球/防守/精神）30 岁后永不掉点（技术流老将不掉技术）。
           落点集中后总量收敛：每季最多扣 3 总点（原实现全池均扣 -2~-8，集中两类会掉飞车），
           31+ 仍至少 -1（上方 Math.min(delta,-1) 保证）。GK 池同享（gk+身体+速度 三类中两类扣）。 */
        let n = Math.max(1, Math.min(3, -delta));
        const decayCats = poolCats.filter(c => c === "pace" || c === "physicality");
        for (const cat of decayCats) {
          for (const id of (window.Pool ? Pool.membersOf(player.position, cat) : (CONFIG.ATTRIBUTES[cat] || []).map(a => a[0]))) {
            if (n <= 0) break;
            if ((player.attrs[id] || 0) > 40) { player.attrs[id]--; n--; }
          }
        }
      }
      player.age++;
      /* ★ P105-B1：训练重点=位置 → 季末熟练度 +GAIN_TRAIN（消费 P97 M2 预留参数，此前零消费方） */
      let masteryGain = 0;
      const tf = (state.data.trainFocus && state.data.trainFocus.kind === "pos") ? state.data.trainFocus.pos : null;
      if (tf && window.Position && Position.gainMastery) {
        const g1 = ((CONFIG.POSITION_DYNAMICS || {}).GAIN_TRAIN);
        masteryGain = Position.gainMastery(state.data, tf, typeof g1 === "number" ? g1 : 1);
      }
      return { delta, gains: gains.length, masteryGain };
    },
  };

  // ── ★★ P120 训练师系统：花钱买「被动成长效率」（五类 × 三档；只作用 applyExp 被动路径）──
  const Trainers = {
    /* ★★ P215 重设计（玩家实测逃课：开局攒钱雇传说级 → 当天加满点 → 当天解雇，折扣即时生效零成本套利）：
       训练师效果从「加点折扣」改为「**每周自动提升对应类别能力值**」——效果与时间绑定，
       时间不可压缩 ⇒ 雇一天只能吃一天的成长，逃课结构性消失；「后期突破慢」也由持续自动成长缓解。
       · 通道：每周发薪点（career.js 周薪处）调 weeklyGrowth —— 按各类 gain 累积进度，
         进度攒满 1 点 → 该类别当前位置池内**值最低**的未满属性 +1（确定性选择，零 R 消耗）；
       · 速率：进度/周 = gain × 0.10 ÷ _costMult(目标当前值) —— 80+/90+ 自然放缓（与手动加点经济同构）；
         传说级低段 ≈ 20 周 1 点/类，满配五类一季 ≈ +10 点（补充量级，不取代踢球攒经验主线）；
       · 进度存 d.trainerProg[cat]（解雇保留——练出的肌肉记忆是自己的；换档延续——同类团队无缝衔接）；
       · 手动加点 spendOn **不再吃训练师折扣**（恢复原价）——两条成长线解耦。 */
    MATUR_RATE: 0.10,
    ensure(d) {
      if (!d.trainers) d.trainers = {};            // { body: 0-5, ... } 档位
      if (!d.trainerProg) d.trainerProg = {};      // { attack: 0.35, ... } 各类别自动成长进度（P215）
      /* ★★ P127 五档化旧档迁移（一次性）：旧三档 基础(.15)/精英(.30)/世界级(.50) →
         新五档按 gain 就近原则 职业级(.15)/国家级(.25)/传说级(.50)。
         d.trainersV 记录迁移版本；新档（本版起）直接写 trainersV=2 跳过。 */
      if (!d.trainersV) {
        const had = Object.keys(d.trainers).some(k => d.trainers[k] > 0);
        if (had) {
          const MAP = { 1: 2, 2: 3, 3: 5 };   // 旧索引 1/2/3 → 新索引 2/3/5
          for (const k of Object.keys(d.trainers)) {
            const m = MAP[d.trainers[k]];
            if (m) d.trainers[k] = m;
          }
        }
        d.trainersV = 2;
      }
      if (d.trainerTrialUntil === undefined) d.trainerTrialUntil = 0;  // 广告体验卡到期 dayIndex
    },
    tierOf(d, key) {
      this.ensure(d);
      const t = (CONFIG.TRAINERS && CONFIG.TRAINERS.TIERS) || [];
      return t[d.trainers[key]] || t[0];
    },
    /** 类别有效 gain（体验卡生效期间全类别至少世界级）。
     *  ★ P215：语义从「加点折扣」改为「每周自动成长速率」；消费点 = weeklyGrowth 单源。 */
    gainOf(d, cat) {
      this.ensure(d);
      const CFG = CONFIG.TRAINERS;
      if (!CFG) return 0;
      const trialOn = (d.trainerTrialSeason || -1) === (d.season || 0) || (d.trainerTrialUntil || 0) > (d.dayIndex || 0);   // ★ P153：赛季口径 + 旧档兼容
      let gain = 0;
      if (trialOn) {
        gain = Math.max(gain, (CFG.TIERS[CFG.TRIAL_TIER || 4] || {}).gain || 0);   // ★ P127：体验档=世界级（配置索引，五档化）
      } else {
        for (const key of Object.keys(CFG.CATS)) {
          if ((CFG.CATS[key].cats || []).indexOf(cat) >= 0) gain = Math.max(gain, this.tierOf(d, key).gain || 0);
        }
      }
      return gain;
    },
    /** 每周自动成长（career.js 发薪点调用；欠薪离队周不成长——调用方保证）。
     *  确定性（零 R 消耗）：目标 = 类别当前位置池内、未到上限、值最低的属性（id 升序破并列）。
     *  抬最低项天然满足同类短板约束（GAP），永不造成畸形加点。
     *  ★★ P222c：上限 = effPot + CAP_BONUS[档位]（传说级 +8 =「潜力开发」）——
     *  帽上段速率 ×HEADROOM_RATE_MULT；帽下速率与历史标定零扰动。 */
    weeklyGrowth(state) {
      const d = state.data, CFG = CONFIG.TRAINERS;
      if (!CFG || !d.player) return { grown: [] };
      const grown = [];
      for (const key of Object.keys(CFG.CATS)) {
        const gain = this.gainOf(d, CFG.CATS[key].cats[0]);
        if (gain <= 0) continue;
        const progKey = key;
        d.trainerProg[progKey] = (d.trainerProg[progKey] || 0);
        // 覆盖的属性 id 列表（当前位置池 ∩ 类别成员）
        const members = [];
        for (const cat2 of (CFG.CATS[key].cats || [])) {
          const list = window.Pool ? Pool.membersOf(d.player.position, cat2) : (CONFIG.ATTRIBUTES[cat2] || []).map(a => a[0]);
          for (const id of list) if (members.indexOf(id) < 0) members.push(id);
        }
        if (!members.length) continue;
        const eff = window.Potential ? Potential.effMap(d) : null;
        /* ★★ P222c 训练师潜力开发：ceiling = effPot + CAP_BONUS[档位]（传说级 +8）。
           目标两段式：①类内存在**已到 effPot** 的属性 → 优先开发它们（帽上段，速率×HEADROOM_RATE_MULT）
           ——否则手动加点总把属性压在帽下，「补短板」档永远够不到帽上分支（生涯模拟实锤的死代码形态）；
           ②无帽满属性 → 值最低的未满属性（补短板，帽下速率与历史标定零扰动）。 */
        const capBonus = ((CFG.CAP_BONUS || [])[(d.trainers[key] || 0)]) || 0;
        let tgt = null, tgtV = Infinity, tgtCap = Infinity, tgtEff = Infinity, isHr = false;
        for (const id of members) {
          const capE = (eff && eff[id] !== undefined) ? eff[id] : 99;
          const cap2 = Math.min(100, capE + capBonus);
          const v = (d.player.attrs[id] !== undefined) ? d.player.attrs[id] : 30;
          if (v >= cap2) continue;
          const capped = v >= capE;
          if (tgt === null) { tgt = id; tgtV = v; tgtCap = cap2; tgtEff = capE; isHr = capped; continue; }
          if (capped && !isHr) { tgt = id; tgtV = v; tgtCap = cap2; tgtEff = capE; isHr = true; continue; }   // 帽满优先
          if (capped === isHr && (v < tgtV || (v === tgtV && id < tgt))) { tgt = id; tgtV = v; tgtCap = cap2; tgtEff = capE; }
        }
        if (!tgt) continue;   // 类别全到帽——进度保留（未来潜力突破后继续）
        // 进度累积：速率 ÷ 软上限成本（目标属性越高攒得越慢，与手动加点经济同构）；
        // 帽上段（开发 effPot 之上的余量）×HEADROOM_RATE_MULT —— 潜力帽之上的开发是训练师的核心价值
        const _headroom = isHr ? ((CFG.HEADROOM_RATE_MULT || 1)) : 1;
        d.trainerProg[progKey] += gain * this.MATUR_RATE * _headroom / Training._costMult(tgtV);
        if (d.trainerProg[progKey] >= 1) {
          d.trainerProg[progKey] -= 1;
          d.player.attrs[tgt] = Math.min(tgtCap, tgtV + 1);
          grown.push({ cat: key, attr: tgt, name: ((CONFIG.ATTRIBUTES[CFG.CATS[key].cats[0]] || []).find(a => a[0] === tgt) || [tgt, tgt])[1], to: d.player.attrs[tgt] });
        }
      }
      return { grown };
    },
    /** 签约（★★ P156 改版：自选档位——支持跳档/降档，不再只能依次 +1）。
     *  @param tierIdx 目标档位（1~5）；与当前档相同 = 不动。
     *  语义：换签任意更高/更低档 → 扣新档签约费；**降档另退旧档签约费一半**（鼓励换人但不鼓励反复横跳）；升档不退旧费。
     *  周薪随档位走（weeklyCost 每周发薪自动按新档扣）。进度不重置——同类团队无缝衔接。 */
    hire(state, key, tierIdx) {
      const d = state.data, CFG = CONFIG.TRAINERS;
      this.ensure(d);
      const def = CFG.CATS[key];
      if (!def) return { ok: false, msg: "未知训练师" };
      const cur = d.trainers[key] || 0;
      const dst = Math.max(1, Math.min(CFG.TIERS.length - 1, tierIdx | 0));
      if (dst === cur) return { ok: false, msg: "已经是" + CFG.TIERS[cur].name + "了" };
      const next = CFG.TIERS[dst];
      let refund = 0;
      if (dst < cur) refund = Math.round(((CFG.TIERS[cur] || {}).fee || 0) * 0.5);   // 降档退一半
      const net = next.fee - refund;
      if ((d.money || 0) < net) return { ok: false, msg: "签约费不足：需要 " + next.fee + (refund ? "（退旧档一半抵 " + refund + "）" : "") + "，现有 " + (d.money || 0) };
      d.money -= net;
      d.trainers[key] = dst;
      return { ok: true, msg: "签下" + next.name + def.name + "（签约费 " + next.fee + (refund ? "，旧档退还 " + refund : "") + " · 周薪 " + next.wage + "）——" + def.name + "每周自动帮你练「" + (def.cats || []).join("/") + "」" };
    },
    /** 解约：退 50% 当前档签约费。成长进度保留（练出的成果是自己的）。 */
    fire(state, key) {
      const d = state.data, CFG = CONFIG.TRAINERS;
      this.ensure(d);
      const cur = d.trainers[key] || 0;
      if (cur <= 0) return { ok: false, msg: "本来就没请" };
      const refund = Math.round(((CFG.TIERS[cur] || {}).fee || 0) * 0.5);
      d.money += refund;
      d.trainers[key] = 0;
      return { ok: true, msg: "解约成功，退还签约费一半（" + refund + "）。已有的训练成果保留。" };
    },
    /** 周薪总开支（career.js 每周发薪点调用；**养不起自动离队**）。@returns 扣款额 */
    weeklyCost(d) {
      this.ensure(d);
      const CFG = CONFIG.TRAINERS;
      let sum = 0;
      for (const key of Object.keys(CFG.CATS)) sum += (this.tierOf(d, key).wage || 0);
      if (sum <= 0) return 0;
      if ((d.money || 0) >= sum) { d.money -= sum; return sum; }
      // 养不起：全员离队（诚实经济——世界级训练师不是欠薪也肯干的）
      for (const key of Object.keys(CFG.CATS)) d.trainers[key] = 0;
      return -1;   // 负值 = 发生了"离队"事件（调用方提示）
    },
    /** 广告体验卡（★ P153 改版）：世界级五件套效果 = **免费体验 1 个赛季**（用户拍板，
     *  原「7 天」按 dayIndex 计改按 season 计——本赛季内有效，finishSeason 进入新赛季自动失效）。
     *  字段：d.trainerTrialSeason = 生效赛季；旧字段 trainerTrialUntil（dayIndex 口径）
     *  保留只读 —— 旧档体验未到期的继续生效到自然到期（trialActive 双口径兼容）。 */
    grantTrial(state) {
      const d = state.data;
      this.ensure(d);
      d.trainerTrialSeason = d.season || 0;
      return { ok: true, msg: "世界级训练师团队入驻！免费体验至本赛季结束。" };
    },
    /** 体验是否生效（★ P153 单源）：本赛季口径优先；旧档的 dayIndex 到期卡兼容。 */
    trialActive(d) {
      this.ensure(d);
      if ((d.trainerTrialSeason || -1) === (d.season || 0)) return true;
      return (d.trainerTrialUntil || 0) > (d.dayIndex || 0);
    },
    trialLeftDays(d) {
      /* ★ P153：旧口径保留（season/soak 兼容）——体验中返回 1，否则 0。 */
      return this.trialActive(d) ? 1 : 0;
    },
  };

  window.PlayerSystem = PlayerSystem;
  window.Training = Training;
  window.Skills = Skills;
  window.Personality = Personality;
  window.Growth = Growth;
  window.Trainers = Trainers;
})();
