/* ============================================================================
   season_report.js — 赛季报告页（融合第一批 · 移植自篮球版 UI/SeasonReport.lua）
   结构对齐篮球版：build() 汇总 → 评级/称号/评语 → 分享卡/热点资讯帖文案。
   足球化改造：联赛战绩（冠军/亚冠资格/中游/保级/降级）+ 进球/助攻/场均评分
   + 杯赛 + 国家队（世界杯/亚洲杯/世预赛）+ 金靴/MVP/最佳阵容。
   数据与呈现分离：本文件只产出数据（sum），渲染在 UI 层，禁止把 HTML 塞进文案。

   ★ P153（2026-09-19 用户拍板）三处重构：
     ① 球队解析走 Youth.clubViewOf 唯一出口 —— 青训期 d.clubId 是青年队 id，
        旧代码 teamById 必然 null → 分享图/报告页显示原始 id（如 "y_csl_04"）。
        新增 isYouth / leagueName，青年/成年区分展示；青年联赛无"亚冠"概念 → 文案分档。
     ② 海报 draw() 全矢量重做（PosterArt 场景头图，零 <img>）—— 根治 file:// 下
        toDataURL/toBlob "Tainted canvases" SecurityError（一键发热点资讯报错根因）；
        版式对齐篮球版赛季报告标杆：场景头图 + 黑块大标题 + 评级章 + 数据六格
        + 高光徽章 + 金句 + 品牌条；不同档次配不同场景（金杯庆典/夜场/黄昏/晨训/雨夜）。
     ③ show() 删除「成长空间」面板（用户拍板：无意义信息不进赛季报告）；
        球队行修正 + 青训徽标 + 赛事（联赛名）行。
   ============================================================================ */
(function () {
  // ── 文案表（足球版，热点资讯味；仅引用真实数据） ──
  const RESULT_TEXT = {
    champion: "联赛冠军",
    ucl: "亚冠资格",
    mid: "联赛中游",
    survival: "保级成功",
    relegated: "惨遭降级",
  };
  /* P153：青年联赛口径 —— 没有"亚冠资格"概念 */
  const RESULT_TEXT_YOUTH = {
    champion: "青年联赛冠军",
    ucl: "争冠集团",
    mid: "联赛中游",
    survival: "保级成功",
    relegated: "惨遭降级",
  };
  const TITLES = {
    SSS: "世界之巅", SS: "冠军核心", S: "顶级射手",
    A: "中坚力量", B: "值得期待", C: "沉淀之年",
  };
  const QUOTES = {
    SSS: [
      "{team}提前夺冠那晚，整座城市的酒吧都在喊你的名字。金靴和奖杯一起搬回家，明年卫冕？",
      "联赛冠军 + 金靴双收官。赛季初说你水的人，现在都在删帖。",
    ],
    SS: [
      "{team}捧杯那夜，更衣室里香槟灌了满头。这枚奖牌，是你一整个赛季跑出来的。",
      "联赛冠军到手。别的明天再谈，今晚先醉一场。",
    ],
    S: [
      "{goals} 球 {assists} 助的数据摆在这儿，没人敢说你不够格。差的那一步，明年补上。",
      "个人数据没输，球队差了点意思。夏天加练，明年再来。",
    ],
    A: [
      "赛季收官那天看台空了一半。把不甘心留到夏天，加练见。",
      "出局那天更衣室很安静。足球就是这样，明年球场见真章。",
    ],
    B: [
      "球队起起伏伏，你的 {goals} 球是真的。基石已就位，就差队友开窍。",
      "摆烂是管理层的选择，涨球是你自己的收获。下赛季见。",
    ],
    C: [
      "这赛季就当交学费了。夏训别缺席，下赛季再来。",
      "低谷谁都有，别在低谷刷手机。练吧，兄弟。",
    ],
  };
  const INTL_CUP = { worldcup: "世界杯", asiacup: "亚洲杯", wcq: "世预赛" };
  const INTL_RES = {
    champion: "夺冠", runner_up: "亚军", "runner-up": "亚军", semifinal: "打进四强",
    quarterfinal: "止步八强", group_out: "小组出局", out: "提前出局",
  };

  const f1 = (x) => (Math.round((x || 0) * 10) / 10).toFixed(1);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&#39;", "'": "&#39;" }[c]));

  /* ★★ P295（玩家反馈「积分页中游、总结页写冠军」「联赛第四显示冠军且没有欧冠」）：
     d.table 是**注册序**数组（initSeason 按 teams.map 原序落表），不是积分序！
     旧 resolveResult/build 直接 `table.indexOf(mine)+1` = 拿数组下标当名次 ——
     球队恰好排在表前部就会被判成"冠军/欧冠区"，与积分榜页（排序后）永远对不上。
     修：名次唯一真源 = SeasonSystem.standings（pts→净胜球→进球 排序，与结算卡/积分榜同源）；
     旧档/探针环境无 SeasonSystem 时回落同式本地排序（逐位同式，不发明第三种排序）。 */
  function rankOf(state, d) {
    const table = d.table || [];
    if (!table.length) return { rank: 0, mine: null };
    let sorted;
    if (window.SeasonSystem && SeasonSystem.standings) {
      try { sorted = SeasonSystem.standings(state); } catch (e) { sorted = null; }
    }
    if (!sorted) {
      sorted = table.slice().sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf);
    }
    const mine = sorted.find((r) => r.id === d.clubId) || table.find((r) => r.id === d.clubId) || null;
    return { rank: mine ? sorted.indexOf(mine) + 1 : 0, mine };
  }
  /** 洲际资格口径：欧洲跨年季（crossYear）= 欧冠资格；中超/中甲 = 亚冠资格。
      ★ P295（玩家反馈「欧冠名额显示成亚冠」）：旧 RESULT_TEXT.ucl 写死"亚冠资格"，
      五大联赛玩家整个生涯都看到亚冠。CONFIG.calOf 是联赛日历唯一真源（P285 同引用）。 */
  function uclLabelOf(d) {
    try {
      const c = (window.CONFIG && CONFIG.calOf) ? CONFIG.calOf(d.leagueId) : null;
      return (c && c.crossYear) ? "欧冠资格" : "亚冠资格";
    } catch (e) { return "亚冠资格"; }
  }

  /** 联赛结果归类：按积分榜名次（P295：排序名次，不再用注册序下标） */
  function resolveResult(state, d) {
    const table = d.table || [];
    if (!table.length) return "mid";
    const { rank } = rankOf(state, d);
    const n = table.length || 16;
    if (!rank) return "mid";
    if (rank === 1) return "champion";
    if (rank <= 3) return "ucl";             // 欧冠/亚冠资格区（前三，文案按联赛口径）
    if (rank <= n - 3) return "mid";
    return rank > n - 2 ? "relegated" : "survival";
  }

  /** P153：效力球队统一视图 —— 青训期走青年表（Youth.clubViewOf 唯一出口），
      成年期走成年表；任何一边都解析失败 → null（调用方占位，不编兜底队名） */
  function clubViewOf(d) {
    if (window.Youth && Youth.clubViewOf) {
      const v = Youth.clubViewOf(d);
      if (v) return v;
    }
    const t = (window.teamById && teamById(d.clubId)) || null;
    if (!t) return null;
    const L = (window.LD && window.LD()[t.league]) || null;
    return { team: t, name: t.name, leagueName: (L && L.name) || "", youth: false };
  }

  /** 汇总：所有字段仅来自真实存档数据 */
  function build(state, seasonOverride) {
    const d = state.data;
    /* ★ P153b（用户截图实锤修复）：finishSeason 在报告展示前清零 d.seasonStats（ season.js /
       youth.js 双路），报告/赛季史曾永远显示 0。清零前已快照到 d._lastSeasonStats（带 season
       标记）—— 报告赛季号与快照匹配则吃快照；赛季中或旧档无快照走实时 seasonStats。 */
    const repSeason = seasonOverride || d.season;
    const _snap = d._lastSeasonStats;
    const ss = (_snap && _snap.season === repSeason) ? _snap : (d.seasonStats || {});
    const gp = Math.max(1, ss.apps || 0);
    const _rk = rankOf(state, d);
    const mine = _rk.mine;
    const view = clubViewOf(d);
    const team = (view && view.name) || "";
    const leagueName = (view && view.leagueName) || "";
    const isYouth = !!(view && view.youth);
    /* ★ P295：resolveResult 改双参（state,d）——旧签名 (d) 的调用方全在本文件内（已同步）；
       导出签名保持兼容：只传一个参数时按 (null, d) 处理（rankOf 对 null state 回落本地排序）。 */
    const result = resolveResult(state, d);
    const RT = Object.assign({}, isYouth ? RESULT_TEXT_YOUTH : RESULT_TEXT);
    if (result === "ucl" && !isYouth) RT.ucl = uclLabelOf(d);   // 欧冠/亚冠按联赛日历（青年无洲际概念）

    // 奖项：本季荣誉（金靴/MVP/最佳阵容/杯赛）—— 从 d.awards / d.seasonAwards 兜底取
    const awards = [];
    (d.lastSeasonAwards || d.seasonAwards || d.awards || []).forEach((a) => {
      if (awards.length < 6) awards.push({ name: a.name || a, key: a.key || "" });
    });

    // 国家队：本季国际大赛记录（★ P153b 接通真实数据源 —— settlement.js markIntlTour
    //   在大赛定局/夺冠时落账 d.intl.lastTour（带赛季号）；此前该通道全仓无写入点=死数据，
    //   条目从未显示过。按报告赛季号匹配，只显示本季的周期记录。）
    let intl = null;
    const it = d.intl || {};
    const rec = it.lastTour || it.tourRecord || null;
    if (rec && rec.type && rec.season === repSeason) {
      intl = {
        type: rec.type,
        result: rec.result || "out",
        accepted: rec.accepted !== false,
      };
    }

    const sum = {
      season: seasonOverride || d.season,
      name: (d.player && d.player.name) || "",
      number: (d.player && (d.player.number || d.player.jersey)) || "",
      team,
      isYouth,
      leagueName,
      result,
      resultText: RT[result] || "赛季结束",
      rank: mine ? _rk.rank : 0,
      pts: mine ? mine.pts : 0,
      wins: mine ? mine.w : 0, draws: mine ? (mine.dr != null ? mine.dr : (mine.d || 0)) : 0, losses: mine ? mine.l : 0,
      apps: ss.apps || 0,
      goals: ss.goals || 0,
      assists: ss.assists || 0, saves: ss.saves || 0,
      rating: gp > 0 ? (ss.ratingSum || 0) / gp : 0,
      motm: ss.motm || 0,
      ovr: (window.PlayerSystem && PlayerSystem.overall(d.player)) || 0,
      ovrDelta: d.ovrSeasonStart != null
        ? ((window.PlayerSystem ? PlayerSystem.overall(d.player) : 0) - d.ovrSeasonStart) : 0,
      hl: d._seasonHighlights || 0,
      awards,
      intl,
    };

    // 评级：规则表（禁公式黑箱）
    const isMvp = awards.some((a) => (a.key || "").indexOf("mvp") >= 0 || (a.name || "").indexOf("MVP") >= 0);
    const isBoot = awards.some((a) => (a.name || "").indexOf("金靴") >= 0);
    if (sum.result === "champion") sum.grade = (isMvp || isBoot) ? "SSS" : "SS";
    else if (sum.result === "ucl") sum.grade = (isMvp || isBoot || sum.goals >= 15) ? "S" : "A";
    else if (sum.result === "mid") sum.grade = (sum.goals >= 10 || sum.ovrDelta >= 3) ? "B" : "C";
    else sum.grade = (sum.goals >= 12 || sum.ovrDelta >= 3) ? "B" : "C";
    sum.title = TITLES[sum.grade] || "赛季收官";

    // 评语：按赛季奇偶轮换模板
    const pool = QUOTES[sum.grade] || QUOTES.C;
    let quote = pool[(d.season || 1) % pool.length];
    quote = quote.replace(/\{team\}/g, team)
      .replace(/\{goals\}/g, String(sum.goals))
      .replace(/\{assists\}/g, String(sum.assists))
      .replace(/\{rating\}/g, f1(sum.rating));
    if (sum.intl) {
      const cup = INTL_CUP[sum.intl.type] || "国际大赛";
      const res = INTL_RES[sum.intl.result] || "走了一遭";
      quote += sum.intl.accepted
        ? (" 夏天你还顺手踢了" + cup + "，" + res + "。")
        : (" 夏天婉拒了" + cup + "征召，队伍" + res + "。");
    }
    sum.quote = quote;
    return sum;
  }

  /** 热点资讯分享帖：标题 + 正文（篮球版 buildPost 同构） */
  function buildPost(state, seasonOverride) {
    const s = build(state, seasonOverride);
    const youthTag = s.isYouth ? "（青年队）" : "";
    const title = "【" + s.season + "赛季总结】" + s.name + "：" + s.goals + "球" + s.assists
      + "助，带队" + s.resultText + youthTag;
    const lines = [
      "球队：" + s.team + youthTag + (s.leagueName ? " · " + s.leagueName : "")
        + "（联赛第 " + s.rank + " 名，" + s.wins + "胜" + s.draws + "平" + s.losses + "负）",
      "数据：" + s.apps + "场 " + s.goals + "球 " + s.assists + "助，场均评分 " + f1(s.rating) + "，全场最佳 " + s.motm + " 次",
      "能力：总评 " + s.ovr,
      "评级：" + s.grade + " · " + s.title,
    ];
    if (s.awards.length) lines.push("荣誉：" + s.awards.map((a) => a.name).join("、"));
    lines.push("", s.quote);
    lines.push("——来自《冠军之心：足球生涯》");
    return { title, text: lines.join("\n"), sum: s };
  }

  /* ─────────────────────────────────────────────────────────────────────────
     赛季报告海报（P153c 美漫亮色版）
     ★ 版式=亮色杂志风（对齐篮球版参考图）：米白纸底 + 白卡粗描边数据格 + 黑块标题
       + 金评级章 + 高光徽章 + 金句；头图=PosterArt 美漫场景（亮蓝天/鲜绿草皮/多彩纸带）。
     ★ 不再使用 Theme.poster() 暗色（用户拍板「太暗沉，要符合游戏美漫风」）。
     零 <img>、零异步 → canvas 永不污染，cb 同步触发。
     ───────────────────────────────────────────────────────────────────────── */
  const HOT_AWARD = /金靴|MVP|最佳阵容/;

  /* 亮色海报色板（单源：share.js 消费 window.POSTER_LIGHT） */
  const POSTER_LIGHT = {
    bg: "#f7f1e3",      // 米白纸底
    card: "#ffffff",    // 白卡
    accent: "#c8971f",  // 深金（亮底可读）
    txt: "#241f16",     // 深炭正文
    dim: "#6f6754",     // 暖灰次级
    chipBg: "#f2e8cf",  // 浅金 chip 底
    line: "#d9cdae",    // 分隔线
  };
  window.POSTER_LIGHT = POSTER_LIGHT;

  function rr2(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function wrap2(ctx, text, x, y, maxW, lh) {
    const chars = String(text).split("");
    let line = "", yy = y;
    for (const ch of chars) {
      if (ctx.measureText(line + ch).width > maxW) { ctx.fillText(line, x, yy); line = ch; yy += lh; }
      else line += ch;
    }
    if (line) ctx.fillText(line, x, yy);
    return yy;
  }

  /** 头图区统一绘制：场景 + SEASON 条 + 黑块大标题 + 评级章（season/champion/intl 共用） */
  function drawHeaderScene(ctx, W, sceneKey, P, opts) {
    const o = opts || {};
    const HEAD_H = 470;
    window.PosterArt.draw(ctx, 0, 0, W, HEAD_H, sceneKey, { accent: P.accent, seed: o.seed });
    // 左上：金框黑底 SEASON 条（宽度随文本自适应，超长联赛名不溢出）
    ctx.fillStyle = "rgba(10,10,10,0.72)";
    ctx.font = "800 21px 'PingFang SC','Microsoft YaHei',sans-serif";
    const seasonLabel = o.seasonLabel || "SEASON";
    const slW = Math.min(W - 48, Math.ceil(ctx.measureText(seasonLabel).width) + 38);
    rr2(ctx, 24, 24, slW, 44, 8); ctx.fill();
    ctx.strokeStyle = P.accent; ctx.lineWidth = 2; rr2(ctx, 24, 24, slW, 44, 8); ctx.stroke();
    ctx.fillStyle = P.accent;
    ctx.textAlign = "left";
    ctx.fillText(seasonLabel, 42, 53);
    // 黑块大标题（压头图底部）
    ctx.fillStyle = "#0c0c0c";
    ctx.fillRect(0, HEAD_H - 96, W, 96);
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 58px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.fillText(o.title || "赛季报告", 24, HEAD_H - 30);
    // 评级章（骑缝在头图/正文交界右侧，旋转金圆）
    if (o.grade) {
      ctx.save();
      ctx.translate(622, HEAD_H - 22);
      ctx.rotate(-0.18);
      ctx.fillStyle = P.accent;
      ctx.beginPath(); ctx.arc(0, 0, 76, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 5; ctx.stroke();
      ctx.fillStyle = "#141008";
      ctx.textAlign = "center";
      ctx.font = "900 " + (o.grade.length >= 3 ? 40 : 52) + "px 'PingFang SC','Microsoft YaHei',sans-serif";
      ctx.fillText(o.grade, 0, o.grade.length >= 3 ? 0 : 8);
      ctx.font = "700 18px 'PingFang SC','Microsoft YaHei',sans-serif";
      ctx.fillText(o.gradeTitle || "", 0, o.grade.length >= 3 ? 34 : 40);
      ctx.restore();
      ctx.textAlign = "left";
    }
  }

  /** 高光徽章墙：hot（金底黑字）/普通（浅金底深字）—— 亮色版 */
  function drawChips(ctx, W, y, chips, P) {
    let cx = 24, cy = y;
    chips.slice(0, 9).forEach((c) => {
      ctx.font = "700 20px 'PingFang SC','Microsoft YaHei',sans-serif";
      const w = Math.ceil(ctx.measureText(c.text).width) + 34;
      if (cx + w > W - 24) { cx = 24; cy += 50; }
      if (c.hot) {
        ctx.fillStyle = P.accent; rr2(ctx, cx, cy, w, 40, 20); ctx.fill();
        ctx.strokeStyle = "#241f16"; ctx.lineWidth = 2; rr2(ctx, cx, cy, w, 40, 20); ctx.stroke();
        ctx.fillStyle = "#241f16";
      } else {
        ctx.fillStyle = P.chipBg; rr2(ctx, cx, cy, w, 40, 20); ctx.fill();
        ctx.strokeStyle = "rgba(42,37,28,0.55)"; ctx.lineWidth = 2; rr2(ctx, cx, cy, w, 40, 20); ctx.stroke();
        ctx.fillStyle = P.txt;
      }
      ctx.fillText(c.text, cx + 17, cy + 27);
      cx += w + 12;
    });
    return cy + 58;
  }

  function draw(state, seasonOverride, cb) {
    const s = build(state, seasonOverride);
    const P = POSTER_LIGHT; // P153c：亮色杂志风（不再跟 Theme.poster 暗色）
    const W = 750, H = 1200;
    const BG = P.bg, CARD = P.card, ACC = P.accent, TXT = P.txt, DIM = P.dim, CHIP_BG = P.chipBg;
    const d = state.data;
    const isGK = !!(d.player && d.player.position === "GK");
    const PA = window.PosterArt;
    const sceneKey = PA ? PA.sceneOf(PA.SEASON_SCENE, s.grade) : "stadiumNight";
    const seed = (s.season || 0) * 131 + (s.goals || 0) * 17 + (s.name || "").length;

    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    /* ★ P237（复审）：Canvas 海报可访问性（同 share.js 三张海报口径） */
    cv.setAttribute("role", "img");
    cv.setAttribute("aria-label", "赛季报告海报：" + (s.name || "球员") + " · SEASON " + (s.season || "?") + " · 评级 " + (s.grade || "?"));
    const ctx = cv.getContext("2d");
    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = "alphabetic";

    // ① 头图：矢量场景 + 黑块标题 + 评级章
    drawHeaderScene(ctx, W, sceneKey, P, {
      seed,
      grade: s.grade,
      gradeTitle: s.title,
      title: "赛季报告",
      seasonLabel: "SEASON " + s.season + (s.leagueName ? " · " + s.leagueName : ""),
    });

    // ② 球员行 + 球队·联赛（+青训徽章）+ 战绩子行
    let y = 552;
    ctx.textAlign = "left";
    ctx.fillStyle = TXT;
    ctx.font = "900 42px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.fillText(s.name + (s.number !== "" ? " #" + s.number : ""), 24, y);
    y += 48;
    ctx.fillStyle = ACC;
    ctx.font = "800 27px 'PingFang SC','Microsoft YaHei',sans-serif";
    const teamLine = (s.team || "自由球员") + (s.leagueName ? " · " + s.leagueName : "");
    ctx.fillText(teamLine, 24, y);
    if (s.isYouth) { // 青训徽章（金滨金字小圆角块）
      const tag = "青年队";
      const tw = Math.ceil(ctx.measureText(tag).width) + 22;
      const bx = 24 + ctx.measureText(teamLine).width + 14;
      ctx.strokeStyle = ACC; ctx.lineWidth = 1.8;
      rr2(ctx, bx, y - 24, tw, 32, 16); ctx.stroke();
      ctx.fillStyle = ACC;
      ctx.font = "700 19px 'PingFang SC','Microsoft YaHei',sans-serif";
      ctx.fillText(tag, bx + 11, y - 2);
      ctx.font = "800 27px 'PingFang SC','Microsoft YaHei',sans-serif";
    }
    y += 40;
    ctx.fillStyle = DIM;
    ctx.font = "400 21px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.fillText(s.wins + "胜 " + s.draws + "平 " + s.losses + "负 · 联赛第 " + (s.rank || "—") + " 名 · 出场 " + s.apps + " 次", 24, y);
    y += 30;

    // ③ 数据六格（2 行 × 3 列；白卡粗描边美漫框；门将口径：扑救/零封）
    const cells = isGK ? [
      [f1(s.rating), "场均评分"], [String(s.saves || 0), "扑救"], [String(ss_clean(d)), "零封"],
      [String(s.apps || 0), "出场"], [String(s.motm || 0), "全场最佳"], [String(s.ovr), "总评"],
    ] : [
      [f1(s.rating), "场均评分"], [String(s.goals || 0), "进球"], [String(s.assists || 0), "助攻"],
      [String(s.apps || 0), "出场"], [String(s.motm || 0), "全场最佳"], [String(s.ovr), "总评"],
    ];
    y += 6;
    const gw = W - 48, cw = (gw - 2 * 12) / 3, chh = 118;
    for (let row = 0; row < 2; row++) {
      const gy = y + row * (chh + 14);
      ctx.fillStyle = CARD; rr2(ctx, 24, gy, gw, chh, 12); ctx.fill();
      ctx.strokeStyle = "rgba(42,37,28,0.8)"; ctx.lineWidth = 2.5; rr2(ctx, 24, gy, gw, chh, 12); ctx.stroke();
      cells.slice(row * 3, row * 3 + 3).forEach(([v, k], i) => {
        const cx = 24 + i * (cw + 12);
        if (i > 0) { ctx.strokeStyle = P.line; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx, gy + 14); ctx.lineTo(cx, gy + chh - 14); ctx.stroke(); }
        ctx.textAlign = "center";
        ctx.fillStyle = (row === 0 && i === 0) ? ACC : TXT;
        ctx.font = "700 " + (row === 0 && i === 0 ? 40 : 36) + "px 'PingFang SC','Microsoft YaHei',sans-serif";
        ctx.fillText(v, cx + cw / 2, gy + 62, cw - 16);
        ctx.fillStyle = DIM;
        ctx.font = "400 18px 'PingFang SC','Microsoft YaHei',sans-serif";
        ctx.fillText(k, cx + cw / 2, gy + 96);
      });
    }
    ctx.textAlign = "left";
    y += 2 * (chh + 14) + 26;

    // ④ 高光时刻：联赛冠军 + 奖项 + 全场最佳
    const chips = [];
    if (s.result === "champion") chips.push({ text: s.resultText, hot: true });
    s.awards.forEach((a) => chips.push({ text: a.name, hot: HOT_AWARD.test(a.name) }));
    if (s.motm > 0) chips.push({ text: "全场最佳 " + s.motm + " 次", hot: false });
    if (chips.length) {
      ctx.fillStyle = DIM;
      ctx.font = "500 20px 'PingFang SC','Microsoft YaHei',sans-serif";
      ctx.fillText("高光时刻", 24, y + 8);
      y = drawChips(ctx, W, y + 20, chips, P) + 6;
    }

    // ⑤ 国家队条目（本季有记录才出现；参赛/婉拒都显示，对照篮球版）
    if (s.intl) {
      const cup = INTL_CUP[s.intl.type] || "国际大赛";
      const res = INTL_RES[s.intl.result] || "走了一遭";
      const line = s.intl.accepted
        ? "国家队：" + cup + res
        : "国家队：婉拒" + cup + "征召";
      ctx.fillStyle = CARD; rr2(ctx, 24, y, gw, 62, 10); ctx.fill();
      ctx.fillStyle = ACC; ctx.fillRect(24, y, 10, 62);
      ctx.fillStyle = TXT;
      ctx.font = "700 24px 'PingFang SC','Microsoft YaHei',sans-serif";
      ctx.fillText(line, 52, y + 40);
      y += 62 + 20;
    }

    // ⑥ 金句（最多 3 行，超出截断——绝不压到品牌条）+ 品牌条
    ctx.strokeStyle = P.line; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(24, y); ctx.lineTo(W - 24, y); ctx.stroke();
    ctx.fillStyle = "#5a5240"; ctx.font = "italic 500 23px 'PingFang SC','Microsoft YaHei',sans-serif";
    {
      const quoteText = "“" + s.quote + "”";
      const lineH = 34;
      /* ★ P301（玩家反馈「分享图文字重叠」实锤修复）：旧式 top = max(y+46, H-96-3*lineH)
         在徽章多、内容区 y 已超过 H-96-lineH 时，金句被压到品牌条/footer 上直接重叠
         （7 枚高光徽章 3 行即触发）。改为：先按「品牌条顶界」算可用行数，
         不足 1 行整段跳过；有空间才绘制，top 夹在 [y+46, 可容 1 行] 区间内。 */
      const brandTop = H - 96;
      const minTop = y + 46;
      const fitLines = Math.floor((brandTop - minTop) / lineH);
      if (fitLines >= 1) {
        const top = Math.max(minTop, brandTop - lineH * 3);
        const avail = brandTop - top;
        const maxLines = Math.max(1, Math.min(3, Math.floor(avail / lineH)));
        const chars = quoteText.split("");
        let line = "", yy = top, lines = 0;
        for (const ch of chars) {
          if (ctx.measureText(line + ch).width > W - 48) {
            if (++lines >= maxLines) { ctx.fillText(line.slice(0, -1) + "…", 24, yy); break; }
            ctx.fillText(line, 24, yy); line = ch; yy += lineH;
          } else line += ch;
        }
        if (lines < maxLines && line) ctx.fillText(line, 24, yy);
      }
    }
    ctx.fillStyle = ACC; ctx.font = "900 26px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.fillText("冠军之心", 24, H - 58);
    const brandW = ctx.measureText("冠军之心").width;
    ctx.fillStyle = DIM; ctx.font = "600 15px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.fillText("MY FOOTBALL LIFE", 24 + brandW + 14, H - 58);
    ctx.fillStyle = DIM; ctx.font = "600 15px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("SEASON " + s.season + " REPORT · " + s.grade, W - 24, H - 58);
    ctx.textAlign = "center";
    ctx.fillStyle = "#8a8272"; ctx.font = "400 19px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.fillText("热点资讯 · 足球话题区 | 一起来踢球", W / 2, H - 26);
    ctx.textAlign = "left";

    if (cb) cb(cv); // 全同步绘制，直接回调
    return cv;
  }
  /** 零封数（GK 六格用）：seasonStats.cleanSheets，缺省 0 */
  function ss_clean(d) { return (d.seasonStats && d.seasonStats.cleanSheets) || 0; }

  /* ── 分享（S2 重构）：走 SharePoster 统一管道（带图 + 发帖路由 + 降级重试）；
     SharePoster 未加载时保留纯文字兜底 ── */
  function share(state, seasonOverride) {
    const post = buildPost(state, seasonOverride);
    const SP = window.SharePoster;
    if (SP && SP.postToBbs && SP.shareCanvas) {
      draw(state, seasonOverride, (canvas) => {
        SP.shareCanvas(canvas, "mfl_season_report.png", { title: post.title, body: post.text }, "赛季报告分享图");
      });
      return;
    }
    const inApp = !!(window.ColorboxAI && window.ColorboxAI.request && window.ColorboxAI.request.bbs
      && window.ColorboxAI.request.bbs.openPostEditor);
    if (inApp) {
      /* ★ P163 串线修复：兜底裸调必须带足球路由（此前不带 topicId 会落 App 默认板块，
         有串进篮球话题区的风险）。真值单源 config.js 的 SHARE_ROUTE；
         openEditorOpts 同构（topicId 必带，tagId 存在才带）。 */
      const rt = window.SHARE_ROUTE || {};
      const opts = { title: post.title, content: post.text };
      if (rt.topicId) { opts.topicId = String(rt.topicId); opts.topicName = String(rt.topicName || ""); }
      if (rt.tagId) { opts.tagId = String(rt.tagId); opts.tagName = String(rt.tagName || ""); }
      window.ColorboxAI.request.bbs.openPostEditor(opts)
        .then((rsp) => {
          if (rsp && rsp.code === 200) UIkit.toast("已唤起热点资讯发帖，去发布吧！", "gold");
          else UIkit.toast((rsp && rsp.message) || "唤起发帖失败", "red");
        })
        .catch((err) => UIkit.toast("分享失败：" + err.message, "red"));
      return;
    }
    UIkit.modal("<h3 style='text-align:center'>赛季总结（可复制）</h3>"
      + "<div class='panel'><div class='panel-title'>" + esc(post.title) + "</div>"
      + "<div style='white-space:pre-wrap;font-size:13px;line-height:1.7'>" + esc(post.text) + "</div></div>"
      + "<button class='btn btn-ghost btn-block' id='sr-close'>关闭</button>");
    const c = document.querySelector("#sr-close");
    if (c) c.onclick = () => UIkit.closeModal();
  }

  /* ── 渲染：赛季报告页（篮球版 cardView 同构，足球化字段） ──
     ★ P153：删除「成长空间」面板（用户拍板）；球队行修正 + 青训徽标 + 赛事行 */
  function show(state, onDone, seasonOverride) {
    const s = build(state, seasonOverride);
    const row = (k, v) => "<div class='row'><span style='color:var(--text-dim)'>" + k
      + "</span><b>" + v + "</b></div>";
    const youthTag = s.isYouth ? " <span style='color:var(--gold);font-size:11px;border:1px solid var(--gold);border-radius:9px;padding:1px 8px'>青年队</span>" : "";
    let html = "<h3 style='text-align:center'>" + s.season + " 赛季报告</h3>"
      + "<div style='text-align:center;margin-bottom:10px'>"
      + "<div style='display:inline-block;border:2px solid var(--gold);border-radius:10px;padding:6px 18px'>"
      + "<span style='font-size:22px;font-weight:900;color:var(--gold)'>" + s.grade + "</span> "
      + "<span style='font-size:13px;color:var(--text)'>" + s.title + "</span></div></div>"
      + "<div class='panel alt'>"
      + row("球队", esc(s.team || "—") + youthTag) + "<div class='divider'></div>"
      + (s.leagueName ? row("赛事", esc(s.leagueName)) + "<div class='divider'></div>" : "")
      + row("联赛名次", "第 " + s.rank + " 名 · " + s.resultText) + "<div class='divider'></div>"
      + row("战绩", s.wins + "胜 " + s.draws + "平 " + s.losses + "负 · " + s.pts + " 分")
      + "</div>"
      + "<div class='panel'>"
      + row("出场", s.apps + " 场") + "<div class='divider'></div>"
      + ((state.data.player && state.data.player.position === "GK")
          ? row("扑救", (s.saves || 0) + " 次") + "<div class='divider'></div>"
          : row("进球 / 助攻", s.goals + " 球 " + s.assists + " 助") + "<div class='divider'></div>")
      + row("场均评分", f1(s.rating)) + "<div class='divider'></div>"
      + row("全场最佳", s.motm + " 次") + "<div class='divider'></div>"
      + row("总评", s.ovr)
      + "</div>";
    if (s.awards.length) {
      html += "<div class='panel'><div class='panel-title'>本季荣誉</div><div style='font-size:13px'>"
        + s.awards.map((a) => esc(a.name)).join(" · ") + "</div></div>";
    }
    html += "<div class='panel'><div style='font-size:13px;line-height:1.75'>"
      + esc(s.quote) + "</div></div>"
      + "<button class='btn btn-gold btn-block' id='sr-share'>" + ICO("megaphone", 15) + " 一键发热点资讯 · 晒出赛季报告</button>"
      + "<button class='btn btn-primary btn-block mt-10' id='sr-done'>继续 ▸</button>";
    UIkit.modal(html, { dismissable: false });
    /* P133 埋点 BMC010：赛季结算卡曝光（modal-card 单例元素；会话内同元素只报一次） */
    try {
      const _card = document.querySelector("#v2-modal-root .v2-modal-card");
      if (window.Track) Track.expose(_card, "BMC010", "T1", "season_report_exposure", { season: (state.data && state.data.season) || 0 });
    } catch (e) { /* 埋点失败不影响结算 */ }
    const sh = document.querySelector("#sr-share");
    if (sh) sh.onclick = () => share(state, seasonOverride);
    const dn = document.querySelector("#sr-done");
    if (dn) dn.onclick = () => { UIkit.closeModal(); if (onDone) onDone(); };
  }

  /* ── 生涯赛季史（排行榜本地数据源，双端同构）──
     recordSeason：结算时把本季 sum 存入 d.seasonHistory（每季一条，幂等）。
     history：读出（按赛季倒序）。GRADE_ORDER 用于求最佳评级。 */
  const GRADE_ORDER = ["SSS", "SS", "S", "A", "B", "C"];
  function recordSeason(state, seasonOverride) {
    const d = state.data;
    d.seasonHistory = d.seasonHistory || [];
    const key = seasonOverride || d.season;
    const exists = d.seasonHistory.some((r) => r.season === key);
    if (exists) return d.seasonHistory;
    const s = build(state, seasonOverride);
    d.seasonHistory.push({
      season: s.season, team: s.team, rank: s.rank, resultText: s.resultText,
      apps: s.apps, goals: s.goals, assists: s.assists, saves: s.saves || 0,
      rating: Math.round(s.rating * 10) / 10, motm: s.motm,
      ovr: s.ovr, grade: s.grade, title: s.title,
    });
    return d.seasonHistory;
  }
  function history(state) {
    const h = (state.data.seasonHistory || []).slice();
    h.sort((a, b) => b.season - a.season);
    return h;
  }
  function careerSummary(state) {
    const h = history(state);
    const sum = { seasons: h.length, apps: 0, goals: 0, assists: 0, saves: 0, best: "" };
    let bestIdx = GRADE_ORDER.length;
    h.forEach((r) => {
      sum.apps += r.apps || 0; sum.goals += r.goals || 0; sum.assists += r.assists || 0; sum.saves += r.saves || 0;
      const gi = GRADE_ORDER.indexOf(r.grade);
      if (gi >= 0 && gi < bestIdx) { bestIdx = gi; sum.best = r.grade; }
    });
    return sum;
  }

  window.SeasonReport = { build, buildPost, resolveResult, clubViewOf, draw, share, show,
    recordSeason, history, careerSummary, RESULT_TEXT, RESULT_TEXT_YOUTH, TITLES, GRADE_ORDER };
})();
