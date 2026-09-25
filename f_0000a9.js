/* ============================================================================
   poster_art.js — 分享海报矢量场景美术系统（P153c 美漫亮色版，2026-09-19）
   ----------------------------------------------------------------------------
   为什么存在（★根因修复）：
     旧海报头图用 <img> 加载 assets/comic|endings/*.webp 画进 canvas。
     file://（双击即玩页）下图片跨源 → canvas 被污染（tainted）→
     toDataURL / toBlob 抛 SecurityError（"Tainted canvases may not be exported"）
     → 一键发热点资讯整条链路报错。本文件用**纯矢量绘制**替代所有海报头图：
     零 <img>、零外部资源 → canvas 永不污染，且任何环境行为一致。

   ★ P153c（用户拍板「太暗沉，要符合游戏美漫风格」）：
     参照 assets/comic/ec_trophy|ec_stadium.webp 的美漫插画提取风格基线——
       亮蓝天+白云 / 鲜绿草皮 / 白色看台+多彩观众点 / 亮金主体+橙影 /
       多彩纸屑（红黄蓝绿）/ 平涂色块几乎无纯黑 / 戏剧聚光。
     六场景全部重调：夜不死黑（蓝金傍晚）、雨不灰暗（青蓝雨日）、告别暖金化。
     海报版式同步改亮色杂志风（见 season_report.js / share.js 的 POSTER_LIGHT）。

   全部绘制确定性（带种子伪随机）→ 同一存档海报可重现，与截图对拍安全。

   出口：PosterArt.draw(ctx, x, y, w, h, sceneKey, opts)
         PosterArt.sceneOf(table, key)  场景映射查表
         PosterArt.SEASON_SCENE / CHAMP_SCENE / ENDING_SCENE
   ============================================================================ */
window.PosterArt = (function () {
  "use strict";

  /* ── 带种子伪随机（mulberry32）：彩带/雨丝/灯点位置确定可重现 ── */
  function rng(seed) {
    let a = (seed | 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const hashStr = (s) => {
    let h = 2166136261;
    const str = String(s || "");
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };

  /* ── 美漫画板（从 ec_trophy/ec_stadium 提取的高饱和色） ── */
  const C = {
    skyTop: "#3f9ed8", skyMid: "#7cc4e8", skyLow: "#c8ecf8",          // 亮蓝天
    cloud: "#ffffff", cloudShade: "#dceef8",
    grassA: "#4fa83c", grassB: "#429931", grassLine: "#eef7e2",       // 鲜绿草皮
    stand: "#f4efe2", standShade: "#ddd4c0", standEdge: "#3a3428",    // 白看台
    crowd: ["#e84a3a", "#ffd84a", "#3a8ce8", "#4ab84a", "#f08ab0", "#f08a2a"], // 多彩观众
    goldHi: "#fff4b0", gold: "#ffd23e", goldShade: "#e8a020", goldDeep: "#b87818", // 亮金
    ink: "#2a251c",                                                    // 深炭描边
    confetti: ["#e84a3a", "#ffd84a", "#3a8ce8", "#4ab84a", "#ffffff", "#f08ab0"],
    duskTop: "#ffb84a", duskMid: "#ff8a5a", duskLow: "#c8587a",       // 暖橙黄昏
    rainTop: "#5a86b0", rainMid: "#7aa4c8", rainLow: "#a4c4dc",       // 青蓝雨日
    warmBg: "#f8e8c0", warmMid: "#f0d096",                            // 暖金室内
  };

  /* ── 通用小件 ── */
  function vGrad(ctx, x0, y0, x1, y1, stops) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    stops.forEach(s => g.addColorStop(s[0], s[1]));
    return g;
  }
  /** 白云朵（美漫平涂：一组白椭圆 + 底部浅蓝阴影） */
  function drawCloud(ctx, cx, cy, s) {
    ctx.fillStyle = C.cloud;
    ctx.beginPath();
    ctx.ellipse(cx - s * 0.5, cy, s * 0.42, s * 0.24, 0, 0, Math.PI * 2);
    ctx.ellipse(cx, cy - s * 0.16, s * 0.55, s * 0.34, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + s * 0.5, cy, s * 0.44, s * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.cloudShade;
    ctx.beginPath(); ctx.ellipse(cx, cy + s * 0.16, s * 0.62, s * 0.12, 0, 0, Math.PI * 2); ctx.fill();
  }
  /** 白看台（美漫宽扁弧带：顶部轻拱 + 结构横线 + 观众点阵网格）——参照 ec_stadium 看台 */
  function drawStand(ctx, x, y, w, h, rand, lamps) {
    const arch = h * 0.16;
    // 主体：矩形带 + 顶部轻弧
    ctx.fillStyle = C.stand;
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + arch);
    ctx.quadraticCurveTo(x + w / 2, y - arch * 0.6, x + w, y + arch);
    ctx.lineTo(x + w, y + h);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = C.standEdge; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y + arch);
    ctx.quadraticCurveTo(x + w / 2, y - arch * 0.6, x + w, y + arch);
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x + w, y + h); ctx.stroke();
    // 结构横线（三层看台）
    ctx.strokeStyle = C.standShade; ctx.lineWidth = 2;
    for (let k = 1; k <= 3; k++) {
      const yy = y + arch + (h - arch) * (k / 4);
      ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke();
    }
    // 观众点阵：带状网格 + 抖动（整齐又有生气）
    const rows = Math.max(2, Math.round((h - arch) / 16));
    const cols = Math.max(8, Math.round(w / 26));
    for (let r0 = 0; r0 < rows; r0++) {
      for (let c0 = 0; c0 < cols; c0++) {
        if (rand() < 0.35) continue; // 留空隙
        const px = x + (w / cols) * (c0 + 0.5) + (rand() - 0.5) * 8;
        const py = y + arch + (h - arch) * ((r0 + 0.6) / (rows + 0.4)) + (rand() - 0.5) * 4;
        ctx.fillStyle = C.crowd[(rand() * C.crowd.length) | 0];
        ctx.globalAlpha = 0.8;
        ctx.beginPath(); ctx.arc(px, py, 2.4, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
  /** 草皮：鲜绿透视条纹 + 白线 */
  function drawPitch(ctx, x, y, w, h) {
    ctx.fillStyle = C.grassA; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = C.grassB;
    let ty = y, band = 12;
    while (ty < y + h) {
      const bh = Math.min(band, y + h - ty);
      if (Math.round((ty - y) / 12) % 2 === 0) ctx.fillRect(x, ty, w, bh);
      ty += bh; band *= 1.16;
    }
    ctx.strokeStyle = C.grassLine; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, y + h * 0.42); ctx.lineTo(x + w, y + h * 0.42); ctx.stroke();
  }
  /** 底部渐变遮罩（亮色版：深炭半透明，压住场景保黑块可读，不用纯黑） */
  function drawBottomFade(ctx, x, y, w, h) {
    ctx.fillStyle = vGrad(ctx, 0, y, 0, y + h, [[0, "rgba(42,37,28,0)"], [0.55, "rgba(42,37,28,0.35)"], [1, "rgba(42,37,28,0.82)"]]);
    ctx.fillRect(x, y, w, h);
  }
  /** 聚光灯束：亮白金光 */
  function drawBeam(ctx, sx, sy, tx1, tx2, by, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#fff8dc";
    ctx.beginPath();
    ctx.moveTo(sx - 9, sy); ctx.lineTo(sx + 9, sy);
    ctx.lineTo(tx2, by); ctx.lineTo(tx1, by);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  /** 多彩纸带雨（美漫关键：红黄蓝绿白粉） */
  function drawConfetti(ctx, x, y, w, h, n, colors, seed) {
    const rand = rng(seed);
    for (let i = 0; i < n; i++) {
      const cx = x + w * rand();
      const cy = y + h * rand();
      const rw = 5 + rand() * 9, rh = 9 + rand() * 13;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rand() * Math.PI * 2);
      ctx.globalAlpha = 0.55 + rand() * 0.45;
      ctx.fillStyle = colors[(rand() * colors.length) | 0];
      ctx.fillRect(-rw / 2, -rh / 2, rw, rh);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
  /** 亮金奖杯（亮黄主体+橙影+高光+描边+放射光芒，平涂卡通感） */
  function drawTrophy(ctx, cx, cy, s) {
    ctx.save();
    ctx.translate(cx, cy);
    const halo = ctx.createRadialGradient(0, s * 0.3, 0, 0, s * 0.3, s * 2.1);
    halo.addColorStop(0, "rgba(255,224,110,0.5)");
    halo.addColorStop(1, "rgba(255,224,110,0)");
    ctx.fillStyle = halo;
    ctx.fillRect(-s * 2.4, -s * 1.2, s * 4.8, s * 3.6);
    // 放射光芒线（美漫高光符号，参照 ec_trophy 杯顶放射线）
    ctx.strokeStyle = C.goldHi; ctx.lineWidth = s * 0.07;
    for (let k = 0; k < 7; k++) {
      const ang = -Math.PI / 2 + (k - 3) * 0.32;
      ctx.beginPath();
      ctx.moveTo(Math.cos(ang) * s * 0.85, -s * 0.55 + Math.sin(ang) * s * 0.5);
      ctx.lineTo(Math.cos(ang) * s * 1.18, -s * 0.55 + Math.sin(ang) * s * 0.72);
      ctx.stroke();
    }
    const bodyG = ctx.createLinearGradient(-s, -s, s, s);
    bodyG.addColorStop(0, C.goldHi);
    bodyG.addColorStop(0.55, C.gold);
    bodyG.addColorStop(1, C.goldShade);
    ctx.fillStyle = bodyG;
    ctx.strokeStyle = C.goldDeep; ctx.lineWidth = s * 0.055;
    ctx.beginPath();
    ctx.moveTo(-s * 0.62, -s * 0.55);
    ctx.bezierCurveTo(-s * 0.78, s * 0.15, -s * 0.30, s * 0.55, -s * 0.22, s * 0.78);
    ctx.lineTo(s * 0.22, s * 0.78);
    ctx.bezierCurveTo(s * 0.30, s * 0.55, s * 0.78, s * 0.15, s * 0.62, -s * 0.55);
    ctx.quadraticCurveTo(0, -s * 0.30, -s * 0.62, -s * 0.55);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // 双耳
    ctx.strokeStyle = C.gold; ctx.lineWidth = s * 0.15;
    ctx.beginPath(); ctx.arc(-s * 0.72, -s * 0.18, s * 0.30, Math.PI * 0.35, Math.PI * 1.55); ctx.stroke();
    ctx.beginPath(); ctx.arc(s * 0.72, -s * 0.18, s * 0.30, -Math.PI * 0.55, Math.PI * 0.65); ctx.stroke();
    // 杯口
    ctx.fillStyle = C.goldHi;
    ctx.beginPath(); ctx.ellipse(0, -s * 0.52, s * 0.60, s * 0.13, 0, 0, Math.PI * 2); ctx.fill();
    // 高光
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.ellipse(-s * 0.24, s * 0.02, s * 0.09, s * 0.32, -0.25, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    // 颈 + 底座
    ctx.fillStyle = C.goldShade;
    ctx.fillRect(-s * 0.16, s * 0.78, s * 0.32, s * 0.16);
    ctx.fillStyle = C.gold;
    ctx.strokeStyle = C.goldDeep; ctx.lineWidth = s * 0.05;
    ctx.fillRect(-s * 0.46, s * 0.94, s * 0.92, s * 0.14); ctx.strokeRect(-s * 0.46, s * 0.94, s * 0.92, s * 0.14);
    ctx.fillRect(-s * 0.58, s * 1.08, s * 1.16, s * 0.16); ctx.strokeRect(-s * 0.58, s * 1.08, s * 1.16, s * 0.16);
    ctx.restore();
  }
  /** 泛光灯塔（白塔+亮光晕） */
  function drawLightTower(ctx, x, y, hgt, glow) {
    ctx.strokeStyle = C.standEdge; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - hgt); ctx.stroke();
    ctx.fillStyle = C.stand;
    ctx.strokeStyle = C.standEdge; ctx.lineWidth = 2.5;
    ctx.fillRect(x - 27, y - hgt - 19, 54, 19); ctx.strokeRect(x - 27, y - hgt - 19, 54, 19);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = "#fff8d0";
      ctx.beginPath(); ctx.arc(x - 19 + i * 13, y - hgt - 9, 3.6, 0, Math.PI * 2); ctx.fill();
    }
    const g = ctx.createRadialGradient(x, y - hgt - 9, 0, x, y - hgt - 9, 62);
    g.addColorStop(0, "rgba(255,246,190," + glow + ")");
    g.addColorStop(1, "rgba(255,246,190,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y - hgt - 9, 62, 0, Math.PI * 2); ctx.fill();
  }
  /** 球门架 */
  function drawGoal(ctx, cx, groundY, w, hgt) {
    const x0 = cx - w / 2;
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 6; ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x0, groundY); ctx.lineTo(x0, groundY - hgt);
    ctx.lineTo(x0 + w, groundY - hgt);
    ctx.lineTo(x0 + w, groundY);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.45)"; ctx.lineWidth = 1.5;
    for (let i = 1; i < 8; i++) {
      const gx = x0 + (w / 8) * i;
      ctx.beginPath(); ctx.moveTo(gx, groundY); ctx.lineTo(gx, groundY - hgt); ctx.stroke();
    }
    for (let j = 1; j < 5; j++) {
      const gy = groundY - (hgt / 5) * j;
      ctx.beginPath(); ctx.moveTo(x0, gy); ctx.lineTo(x0 + w, gy); ctx.stroke();
    }
    ctx.lineCap = "butt";
  }
  /** 足球（白球+深炭五角） */
  function drawBall(ctx, cx, cy, r) {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = C.ink; ctx.lineWidth = r * 0.16;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = C.ink;
    ctx.beginPath();
    for (let k = 0; k < 5; k++) {
      const ang = -Math.PI / 2 + k * (Math.PI * 2 / 5);
      const px = cx + Math.cos(ang) * r * 0.42, py = cy + Math.sin(ang) * r * 0.42;
      if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill();
  }

  /* ═══════════════ 六个美漫场景（(ctx, w, h, o) 纯绘制）═══════════════ */

  /** 庆典·美漫版：亮蓝天+白云+白看台多彩观众+亮金杯+多彩纸带+鲜绿草皮 */
  function scCelebration(ctx, w, h, o) {
    ctx.fillStyle = vGrad(ctx, 0, 0, 0, h, [[0, C.skyTop], [0.55, C.skyMid], [1, C.skyLow]]);
    ctx.fillRect(0, 0, w, h);
    drawCloud(ctx, w * 0.14, h * 0.14, w * 0.09);
    drawCloud(ctx, w * 0.88, h * 0.11, w * 0.10);
    drawCloud(ctx, w * 0.74, h * 0.20, w * 0.06);
    drawStand(ctx, -w * 0.04, h * 0.32, w * 1.08, h * 0.36, rng(o.seed), 34);
    drawLightTower(ctx, w * 0.07, h * 0.44, h * 0.20, 0.35);
    drawLightTower(ctx, w * 0.93, h * 0.44, h * 0.20, 0.35);
    drawBeam(ctx, w * 0.10, -8, w * 0.18, w * 0.48, h * 0.80, 0.14);
    drawBeam(ctx, w * 0.90, -8, w * 0.52, w * 0.82, h * 0.80, 0.14);
    drawTrophy(ctx, w / 2, h * 0.24, w * 0.115);
    drawConfetti(ctx, 0, 0, w, h * 0.84, 96, C.confetti, o.seed + 13);
    drawPitch(ctx, 0, h * 0.68, w, h * 0.32);
    drawBottomFade(ctx, 0, h * 0.44, w, h * 0.56);
  }

  /** 球场之光：蓝金傍晚天+白云+白看台+双灯塔+中圈草皮 */
  function scStadiumNight(ctx, w, h, o) {
    ctx.fillStyle = vGrad(ctx, 0, 0, 0, h, [[0, "#2f7ec0"], [0.5, "#68b0dc"], [0.82, "#ffd9a0"], [1, "#c8ecf8"]]);
    ctx.fillRect(0, 0, w, h);
    drawCloud(ctx, w * 0.22, h * 0.14, w * 0.10);
    drawCloud(ctx, w * 0.80, h * 0.18, w * 0.08);
    drawStand(ctx, -w * 0.04, h * 0.28, w * 1.08, h * 0.34, rng(o.seed), 30);
    drawLightTower(ctx, w * 0.16, h * 0.40, h * 0.26, 0.4);
    drawLightTower(ctx, w * 0.84, h * 0.40, h * 0.26, 0.4);
    drawBeam(ctx, w * 0.16, h * 0.16, w * 0.30, w * 0.62, h * 0.88, 0.12);
    drawBeam(ctx, w * 0.84, h * 0.16, w * 0.38, w * 0.70, h * 0.88, 0.12);
    drawPitch(ctx, 0, h * 0.62, w, h * 0.38);
    ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(w / 2, h * 0.99, w * 0.30, h * 0.13, 0, Math.PI, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w * 0.06, h * 0.89); ctx.lineTo(w * 0.94, h * 0.89); ctx.stroke();
    drawBall(ctx, w * 0.5, h * 0.955, w * 0.028);
    drawBottomFade(ctx, 0, h * 0.42, w, h * 0.58);
  }

  /** 黄昏决战·美漫版：暖橙天+白云+看台（暖调）+金色斜阳+染金草皮 */
  function scDuskStadium(ctx, w, h, o) {
    ctx.fillStyle = vGrad(ctx, 0, 0, 0, h, [[0, C.duskTop], [0.45, C.duskMid], [0.78, C.duskLow], [1, "#8a4a6a"]]);
    ctx.fillRect(0, 0, w, h);
    drawCloud(ctx, w * 0.26, h * 0.16, w * 0.11);
    drawCloud(ctx, w * 0.72, h * 0.10, w * 0.08);
    const sy = h * 0.36;
    const sun = ctx.createRadialGradient(w * 0.70, sy, 0, w * 0.70, sy, w * 0.26);
    sun.addColorStop(0, "rgba(255,236,160,0.95)");
    sun.addColorStop(0.4, "rgba(255,196,110,0.55)");
    sun.addColorStop(1, "rgba(255,196,110,0)");
    ctx.fillStyle = sun;
    ctx.beginPath(); ctx.arc(w * 0.70, sy, w * 0.26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff0b8";
    ctx.beginPath(); ctx.arc(w * 0.70, sy, w * 0.06, 0, Math.PI * 2); ctx.fill();
    drawStand(ctx, -w * 0.04, h * 0.44, w * 1.08, h * 0.30, rng(o.seed), 18);
    drawPitch(ctx, 0, h * 0.76, w, h * 0.24);
    ctx.fillStyle = "rgba(255,190,90,0.20)";
    ctx.fillRect(0, h * 0.76, w, h * 0.24);
    drawBottomFade(ctx, 0, h * 0.44, w, h * 0.56);
  }

  /** 晨光训练场：亮蓝天+白云+球门+锥筒+足球 */
  function scTrainingGround(ctx, w, h, o) {
    ctx.fillStyle = vGrad(ctx, 0, 0, 0, h, [[0, C.skyMid], [0.5, C.skyLow], [1, "#f6f0d8"]]);
    ctx.fillRect(0, 0, w, h);
    const sun = ctx.createRadialGradient(w * 0.24, h * 0.18, 0, w * 0.24, h * 0.18, w * 0.20);
    sun.addColorStop(0, "rgba(255,246,200,0.9)");
    sun.addColorStop(1, "rgba(255,246,200,0)");
    ctx.fillStyle = sun;
    ctx.beginPath(); ctx.arc(w * 0.24, h * 0.18, w * 0.20, 0, Math.PI * 2); ctx.fill();
    drawCloud(ctx, w * 0.62, h * 0.13, w * 0.09);
    drawCloud(ctx, w * 0.86, h * 0.20, w * 0.06);
    // 队友剪影（美漫色块小人：头+身+腿，训练氛围）
    [[w * 0.12, '#2f6ab0'], [w * 0.20, '#b03a2f'], [w * 0.30, '#2f8a4a']].forEach(function (p2) {
      var px = p2[0], py = h * 0.66;
      ctx.fillStyle = '#3a3428';
      ctx.beginPath(); ctx.arc(px, py - 26, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = p2[1];
      ctx.fillRect(px - 8, py - 19, 16, 22);
      ctx.fillStyle = '#2a251c';
      ctx.fillRect(px - 7, py + 3, 5, 12); ctx.fillRect(px + 2, py + 3, 5, 12);
    });
    ctx.strokeStyle = "rgba(58,52,40,0.45)"; ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      const px = (w / 12) * i;
      ctx.beginPath(); ctx.moveTo(px, h * 0.40); ctx.lineTo(px, h * 0.52); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(0, h * 0.40); ctx.lineTo(w, h * 0.40); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, h * 0.52); ctx.lineTo(w, h * 0.52); ctx.stroke();
    drawGoal(ctx, w * 0.70, h * 0.72, w * 0.30, h * 0.20);
    ctx.fillStyle = "#f07a30";
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
    [[w * 0.22, h * 0.74], [w * 0.30, h * 0.77], [w * 0.40, h * 0.755]].forEach(p => {
      ctx.beginPath();
      ctx.moveTo(p[0], p[1] - 17); ctx.lineTo(p[0] - 12, p[1]); ctx.lineTo(p[0] + 12, p[1]);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    });
    drawBall(ctx, w * 0.52, h * 0.80, w * 0.022);
    drawPitch(ctx, 0, h * 0.62, w, h * 0.38);
    ctx.fillStyle = "rgba(42,80,42,0.28)";
    ctx.beginPath();
    ctx.moveTo(w * 0.52, h * 0.80); ctx.lineTo(w * 0.28, h * 0.87); ctx.lineTo(w * 0.33, h * 0.89);
    ctx.closePath(); ctx.fill();
    drawBottomFade(ctx, 0, h * 0.44, w, h * 0.56);
  }

  /** 青蓝雨战·美漫版：亮蓝灰天（不死黑）+白云+雨丝+白看台+鲜绿湿草反光 */
  function scRainNight(ctx, w, h, o) {
    ctx.fillStyle = vGrad(ctx, 0, 0, 0, h, [[0, C.rainTop], [0.55, C.rainMid], [1, C.rainLow]]);
    ctx.fillRect(0, 0, w, h);
    drawCloud(ctx, w * 0.20, h * 0.13, w * 0.12);
    drawCloud(ctx, w * 0.74, h * 0.17, w * 0.10);
    drawStand(ctx, -w * 0.04, h * 0.28, w * 1.08, h * 0.30, rng(o.seed), 14);
    drawLightTower(ctx, w * 0.80, h * 0.42, h * 0.24, 0.3);
    const rand = rng(o.seed + 21);
    ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 1.6;
    for (let i = 0; i < 110; i++) {
      const rx = w * rand(), ry = h * rand();
      const len = 14 + rand() * 20;
      ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx - len * 0.26, ry + len); ctx.stroke();
    }
    drawPitch(ctx, 0, h * 0.58, w, h * 0.42);
    ctx.fillStyle = "rgba(220,240,255,0.28)";
    for (let i = 0; i < 5; i++) ctx.fillRect(w * 0.06 * i + w * 0.08, h * 0.63 + i * 15, w * 0.5, 3.5);
    drawBottomFade(ctx, 0, h * 0.42, w, h * 0.58);
  }

  /** 荣誉告别·美漫版：暖金荣誉厅+聚光+亮金 10 号球衣+白看台+纸带 */
  function scFarewell(ctx, w, h, o) {
    ctx.fillStyle = vGrad(ctx, 0, 0, 0, h, [[0, C.warmBg], [0.55, C.warmMid], [1, "#e0b878"]]);
    ctx.fillRect(0, 0, w, h);
    drawStand(ctx, -w * 0.12, h * 0.52, w * 0.64, h * 0.30, rng(o.seed), 26);
    drawStand(ctx, w * 0.48, h * 0.52, w * 0.64, h * 0.30, rng(o.seed + 9), 26);
    drawBeam(ctx, w * 0.5, -8, w * 0.24, w * 0.76, h * 0.90, 0.20);
    const jw = w * 0.17, jh = jw * 1.05, jx = w / 2 - jw / 2, jy = h * 0.16;
    ctx.strokeStyle = "rgba(58,52,40,0.6)"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(w / 2, jy - h * 0.12); ctx.lineTo(w / 2, jy); ctx.stroke();
    ctx.fillStyle = C.gold;
    ctx.strokeStyle = C.goldDeep; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(jx + jw * 0.18, jy);
    ctx.lineTo(jx + jw * 0.32, jy - jh * 0.10); ctx.lineTo(jx + jw * 0.68, jy - jh * 0.10);
    ctx.lineTo(jx + jw * 0.82, jy);
    ctx.lineTo(jx + jw * 0.96, jy + jh * 0.16); ctx.lineTo(jx + jw * 0.78, jy + jh * 0.30);
    ctx.lineTo(jx + jw * 0.78, jy + jh);
    ctx.lineTo(jx + jw * 0.22, jy + jh);
    ctx.lineTo(jx + jw * 0.22, jy + jh * 0.30); ctx.lineTo(jx + jw * 0.04, jy + jh * 0.16);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.ink;
    ctx.font = "900 " + Math.round(jh * 0.42) + "px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("10", w / 2, jy + jh * 0.62);
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255,224,120,0.35)";
    ctx.beginPath(); ctx.ellipse(w / 2, h * 0.90, w * 0.30, h * 0.05, 0, 0, Math.PI * 2); ctx.fill();
    drawConfetti(ctx, 0, 0, w, h * 0.5, 34, C.confetti, o.seed + 31);
    drawBottomFade(ctx, 0, h * 0.46, w, h * 0.54);
  }

  /** ★ P261 进球如雨·美漫版（比赛战报里程碑专用）：傍晚球场 + 大球门网窝 + N 颗球
      （balls = 本场进球数，2-5；≥3 加彩带）+ 每颗球拖速度线（「网窝被反复砸响」的视觉） */
  function scGoalRain(ctx, w, h, o) {
    const n = Math.max(2, Math.min(5, o.balls || 3));
    ctx.fillStyle = vGrad(ctx, 0, 0, 0, h, [[0, "#2c6ea8"], [0.5, "#5ea6d6"], [0.8, "#ffd9a0"], [1, "#c8ecf8"]]);
    ctx.fillRect(0, 0, w, h);
    drawCloud(ctx, w * 0.16, h * 0.12, w * 0.08);
    drawCloud(ctx, w * 0.84, h * 0.10, w * 0.09);
    drawStand(ctx, -w * 0.04, h * 0.26, w * 1.08, h * 0.32, rng(o.seed), 26);
    drawLightTower(ctx, w * 0.10, h * 0.40, h * 0.22, 0.35);
    drawLightTower(ctx, w * 0.90, h * 0.40, h * 0.22, 0.35);
    drawBeam(ctx, w * 0.10, h * 0.14, w * 0.26, w * 0.60, h * 0.86, 0.12);
    drawBeam(ctx, w * 0.90, h * 0.14, w * 0.40, w * 0.72, h * 0.86, 0.12);
    drawPitch(ctx, 0, h * 0.64, w, h * 0.36);
    /* 大球门（右中偏置）：框 + 网格由 drawGoal 内建 */
    const gx = w * 0.58, gw = w * 0.46, gh = h * 0.26, gY = h * 0.80;
    drawGoal(ctx, gx, gY, gw, gh);
    /* N 颗球：网窝内散布 + 飞行轨迹速度线（确定性 rng，不碰游戏 R 流） */
    const rand = rng((o.seed || 0) + 77);
    const slots = [
      [-0.28, -0.34], [0.05, -0.52], [0.32, -0.30], [-0.10, -0.68], [0.20, -0.80],
    ]; /* 相对球门中心的偏移（×gw, ×gh） */
    for (let i = 0; i < n; i++) {
      const s = slots[i % slots.length];
      const bx = gx + s[0] * gw, by = gY + s[1] * gh;
      const r = w * (0.026 + rand() * 0.008);
      /* 速度线（从左上飞入网窝的方向感） */
      ctx.strokeStyle = "rgba(255,255,255,0.75)"; ctx.lineWidth = 3; ctx.lineCap = "round";
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.moveTo(bx - r * (2.2 + k * 0.9), by - r * (1.4 + k * 0.6));
        ctx.lineTo(bx - r * (3.4 + k * 1.1), by - r * (2.0 + k * 0.8));
        ctx.stroke();
      }
      ctx.lineCap = "butt";
      drawBall(ctx, bx, by, r);
    }
    /* 点球点 + 禁区弧一笔（草皮元素呼应直播感） */
    ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(w * 0.30, h * 0.965, w * 0.20, h * 0.09, 0, Math.PI, Math.PI * 2); ctx.stroke();
    if (n >= 3) drawConfetti(ctx, 0, 0, w, h * 0.72, 64, C.confetti, (o.seed || 0) + 29);
    drawBottomFade(ctx, 0, h * 0.42, w, h * 0.58);
  }

  const SCENES = {
    celebration: scCelebration, stadiumNight: scStadiumNight, duskStadium: scDuskStadium,
    trainingGround: scTrainingGround, rainNight: scRainNight, farewell: scFarewell,
    goalRain: scGoalRain,
  };

  /* ── 档次 → 场景映射表（单源，海报模块共用） ── */
  const SEASON_SCENE = {           // 赛季报告：按评级
    SSS: "celebration", SS: "celebration", S: "stadiumNight",
    A: "duskStadium", B: "trainingGround", C: "rainNight",
  };
  const CHAMP_SCENE = {            // 夺冠速报/国家队：按名次
    champion: "celebration", "runner-up": "stadiumNight",
    semifinal: "duskStadium", quarterfinal: "duskStadium", group_out: "rainNight",
  };
  const MATCH_SCENE = {            // 比赛战报（P261）：按里程碑/赛果；goalRain 的 balls 由调用方经 opts 传入
    goalRain: "goalRain", lastMinute: "stadiumNight",
    debut: "trainingGround", firstGoal: "trainingGround", cleanSheet: "duskStadium",
    win: "stadiumNight", draw: "duskStadium", lose: "rainNight",
  };
  const ENDING_SCENE = {           // 生涯终章：按结局 id（data_endings.js）
    king: "celebration", hero: "celebration", asia: "celebration", onecity: "farewell",
    goals: "stadiumNight", gk: "stadiumNight", injured: "rainNight", veteran: "duskStadium",
    legend: "celebration", star: "stadiumNight", known: "duskStadium", pro: "duskStadium",
  };

  /** 顶级入口：在 ctx 上于 (x,y,w,h) 矩形内绘制场景。opts: {accent, seed, youth}
   *  ★ P161：优先使用 POSTER_ART_IMG 的 AI 厚涂美漫头图（data URL 内联，
   *    画进 canvas 不触发跨源污染——file:// 下 toDataURL/toBlob 依然安全）；
   *    图未就绪/缺图时回退矢量场景（永不阻断分享）。底部统一叠渐晕保黑块可读。 */
  const IMG_CACHE = {};
  function warmup() {
    const src = (typeof window !== "undefined" && window.POSTER_ART_IMG) || {};
    Object.keys(src).forEach(k => {
      if (IMG_CACHE[k]) return;
      try {
        const im = new Image();
        im.onload = () => { IMG_CACHE[k] = im; };
        im.onerror = () => { /* data URL 坏图 → 永久走矢量兜底 */ };
        im.src = src[k];
      } catch (e) { /* ignore */ }
    });
  }
  function draw(ctx, x, y, w, h, sceneKey, opts) {
    opts = opts || {};
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.translate(x, y);
    const im = IMG_CACHE[sceneKey];
    if (im && im.complete && im.naturalWidth > 0) {
      // AI 厚涂美漫头图（data URL 同源安全）
      try { ctx.drawImage(im, 0, 0, w, h); }
      catch (e) { try { SCENES[sceneKey](ctx, w, h, { accent: opts.accent, seed: opts.seed || hashStr(sceneKey), balls: opts.balls }); } catch (e2) { ctx.fillStyle = C.skyLow; ctx.fillRect(0, 0, w, h); } }
    } else {
      const fn = SCENES[sceneKey] || scStadiumNight;
      try { fn(ctx, w, h, { accent: opts.accent, seed: opts.seed || hashStr(sceneKey), youth: !!opts.youth, balls: opts.balls }); }
      catch (e) { ctx.fillStyle = C.skyLow; ctx.fillRect(0, 0, w, h); }
    }
    // 底部渐晕：黑块标题压图可读（图/矢量共用）
    const fh = h * 0.52;
    const fg = ctx.createLinearGradient(0, h - fh, 0, h);
    fg.addColorStop(0, "rgba(42,37,28,0)");
    fg.addColorStop(0.5, "rgba(42,37,28,0.30)");
    fg.addColorStop(1, "rgba(42,37,28,0.78)");
    ctx.fillStyle = fg;
    ctx.fillRect(0, h - fh, w, fh);
    ctx.restore();
  }

  // 启动即预热：data URL 解码毫秒级，海报触发时必就绪
  if (typeof window !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", warmup);
    else warmup();
  }

  return {
    draw, warmup, sceneOf: (table, key) => table[key] || table._default || "stadiumNight",
    SEASON_SCENE, CHAMP_SCENE, MATCH_SCENE, ENDING_SCENE,
  };
})();
