/* ============================================================================
   分享海报系统 — canvas 合成 750×1200 生涯终章海报 + 一键分享热点资讯
   链路：canvas 合成 → ColorboxAI.oss.uploadFile 直传 → request.bbs.openPostEditor 带图发帖
   降级：非热点资讯容器（file:// 测试/普通浏览器）→ 弹层展示海报长按保存 + 文案一键复制

   ★ P153（2026-09-19）：三张海报头图全部改为 PosterArt 矢量场景（零 <img>）。
     根因：旧头图 <img> 加载 assets/*.webp 画进 canvas → file://（双击即玩页）下
     canvas 被污染 → toDataURL/toBlob 抛 "Tainted canvases may not be exported"
     → 一键发热点资讯整链报错。矢量绘制从根源消灭污染，且不同档次/结局配不同场景。
     明细行球队解析统一走 Youth.clubViewOf（青训期青年队 id 不再显示原始 id）。
   ============================================================================ */
window.SharePoster = (function () {

  const W = 750, H = 1200;
  /* P153c：海报统一亮色杂志风（美漫亮色场景 + 白卡粗框）——不再跟 Theme.poster() 暗色。
     色板单源 = season_report.js 的 window.POSTER_LIGHT；此处兜底防加载顺序。 */
  const FALLBACK = { bg: "#f7f1e3", card: "#ffffff", accent: "#c8971f", txt: "#241f16", dim: "#6f6754", chipBg: "#f2e8cf", line: "#d9cdae" };
  function pal() {
    if (window.POSTER_LIGHT) return window.POSTER_LIGHT;
    let p = null;
    try { p = (window.Theme && Theme.poster) ? Theme.poster() : null; } catch (e) { p = null; }
    return p || FALLBACK;
  }

  /* ── 发帖路由（对照篮球版官方 openPostEditor 契约：值一律字符串）──
     2026-09-19 更新（用户拍板）：路由迁至「足球话题区」topicId=184，话题标签
     「冠军之心：足球生涯」已在热点资讯后台建成 tagId=156975 —— 四值齐全。
     ★ P163 单源化：真值在 config.js 的 window.SHARE_ROUTE（与 season_report.js
       兜底裸调共用），此处字面量仅作 config 未载的兜底。 */
  const RT = (window.SHARE_ROUTE || {});
  const TOPIC_ID = RT.topicId || "184";
  const TOPIC_NAME = RT.topicName || "足球话题区";
  const TAG_ID = RT.tagId || "156975";
  const TAG_NAME = RT.tagName || "冠军之心：足球生涯";

  const rr = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
  const wrap = (ctx, text, x, y, maxW, lh) => {
    const chars = String(text).split("");
    let line = "", yy = y;
    for (const ch of chars) {
      if (ctx.measureText(line + ch).width > maxW) { ctx.fillText(line, x, yy); line = ch; yy += lh; }
      else line += ch;
    }
    if (line) ctx.fillText(line, x, yy);
    return yy;
  };

  /** ★ P199 美漫体育感头图增强：黑块标题两侧的月桂枝（金弧+叶 tick）+ 右侧速度线斜杠 */
  function drawLaurel(ctx, P, opts) {
    const o = opts || {};
    const acc = o.acc || P.accent;
    const cx = W / 2, cy = o.cy || 88, R0 = 150;
    ctx.save();
    ctx.strokeStyle = acc; ctx.lineWidth = 2.5;
    [-1, 1].forEach(side => {
      ctx.beginPath();
      ctx.arc(cx, cy + 40, R0, Math.PI * (side > 0 ? 1.18 : 1.32), Math.PI * (side > 0 ? 1.38 : 1.52), side > 0);
      ctx.stroke();
      /* 叶 tick：沿弧线的短斜线 */
      const segs = 5;
      for (let i = 0; i < segs; i++) {
        const t = (side > 0 ? 1.20 : 1.33) + i * 0.035;
        const x = cx + R0 * Math.cos(Math.PI * t) * (1), y = cy + 40 + R0 * Math.sin(Math.PI * t);
        ctx.beginPath(); ctx.lineWidth = 2;
        ctx.moveTo(x - 6 * side, y - 8); ctx.lineTo(x + 6 * side, y + 2);
        ctx.stroke();
      }
    });
    /* 速度线斜杠（右上角，体育海报速度感） */
    ctx.lineWidth = 5;
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = "rgba(255,255,255," + (0.14 - i * 0.03) + ")";
      ctx.beginPath();
      ctx.moveTo(W - 150 + i * 34, HEAD_SPEED_Y0); ctx.lineTo(W - 70 + i * 34, HEAD_SPEED_Y0 + 130);
      ctx.stroke();
    }
    ctx.restore();
  }
  const HEAD_SPEED_Y0 = 120;

  /** P153 共用头图：PosterArt 场景 + 左上金框条 + 黑块大标题（终章/夺冠/国家队/比赛战报共用） */
  function drawSceneHeader(ctx, sceneKey, P, opts) {
    const o = opts || {};
    const HEAD_H = 470;
    if (window.PosterArt) {
      window.PosterArt.draw(ctx, 0, 0, W, HEAD_H, sceneKey, { accent: P.accent, seed: o.seed, balls: o.balls });
    } else { // PosterArt 缺载兜底：纯色头图，分享链路绝不因缺文件中断
      ctx.fillStyle = P.card; ctx.fillRect(0, 0, W, HEAD_H);
    }
    drawLaurel(ctx, P, o);                                     // ★ P199 月桂 + 速度线（荣誉感/美漫感）
    ctx.fillStyle = "rgba(10,10,10,0.72)";
    const tagText = o.tag || "冠军之心：足球生涯";
    ctx.font = "800 20px 'PingFang SC','Microsoft YaHei',sans-serif";
    const tagW = Math.ceil(ctx.measureText(tagText).width) + 40;
    rr(ctx, 24, 24, tagW, 44, 8); ctx.fill();
    ctx.strokeStyle = o.acc || P.accent; ctx.lineWidth = 2; rr(ctx, 24, 24, tagW, 44, 8); ctx.stroke();
    ctx.fillStyle = o.acc || P.accent;
    ctx.textAlign = "left";
    ctx.fillText(tagText, 42, 52);
    ctx.fillStyle = "#0c0c0c";
    ctx.fillRect(0, HEAD_H - 96, W, 96);
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 56px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.fillText(o.title || "", 24, HEAD_H - 30);
  }

  /** P153 明细行卡（label 左 / value 右；亮色版：白卡+暖灰分隔） */
  function drawRows(ctx, y, rows, P) {
    ctx.fillStyle = P.card; rr(ctx, 20, y, W - 40, 24 + rows.length * 40, 10); ctx.fill();
    ctx.strokeStyle = "rgba(42,37,28,0.6)"; ctx.lineWidth = 2; rr(ctx, 20, y, W - 40, 24 + rows.length * 40, 10); ctx.stroke();
    rows.forEach((r, i) => {
      ctx.textAlign = "left";
      ctx.fillStyle = P.dim; ctx.font = "400 21px 'PingFang SC','Microsoft YaHei',sans-serif";
      ctx.fillText(r[0], 40, y + 36 + i * 40);
      ctx.textAlign = "right";
      ctx.fillStyle = "#3a3428"; ctx.font = "600 21px 'PingFang SC','Microsoft YaHei',sans-serif";
      ctx.fillText(r[1], W - 40, y + 36 + i * 40);
    });
    return y + 24 + rows.length * 40 + 20;
  }
  /** P153 荣誉徽章墙（同名折叠 ×N，最多 8 个；亮色版：浅金底+深金描边+金字） */
  function drawTrophyChips(ctx, y, trophies, P, opts) {
    const o = opts || {};
    const count = {};
    (trophies || []).forEach(t => { if (!o.only || o.only.indexOf(t.name) >= 0) count[t.name] = (count[t.name] || 0) + 1; });
    const chips = Object.keys(count).slice(0, 8).map(n => count[n] > 1 ? n + "×" + count[n] : n);
    const totalKinds = Object.keys(count).length;
    if (!o.only && totalKinds > 8 && trophies.length) chips.push("等 " + trophies.length + " 项荣誉");
    if (!chips.length) return y;
    ctx.textAlign = "left";
    let cx = 20, cy = y;
    chips.forEach(name => {
      ctx.font = "700 20px 'PingFang SC','Microsoft YaHei',sans-serif";
      const w = Math.ceil(ctx.measureText(name).width) + 32;
      if (cx + w > W - 20) { cx = 20; cy += 48; }
      ctx.fillStyle = P.chipBg; rr(ctx, cx, cy, w, 38, 19); ctx.fill();
      ctx.strokeStyle = o.stroke || P.accent; ctx.lineWidth = 2; rr(ctx, cx, cy, w, 38, 19); ctx.stroke();
      ctx.fillStyle = o.stroke || P.accent;
      ctx.fillText(name, cx + 16, cy + 26);
      cx += w + 12;
    });
    return cy + 62;
  }
  /** ★ P199 三分区荣誉墙（终章海报专用）：俱乐部荣誉（金）/国家队征程（红）/青春纪念（青）
      —— 按真实奖杯名自动归区（动态联赛名「XX联赛冠军」「晋级20XX世界杯」兼容），
      每区斜纹题签 + 计数徽标，空区自动跳过。返回新的 y。 */
  function drawHonorWall(ctx, y, trophies, youthTrophies, P, opts) {
    const o = opts || {};
    const isIntl = n => /世界杯|亚洲杯|晋级/.test(n);
    const isYouth = n => /^青年/.test(n);
    const groups = [
      { title: "俱乐部荣誉", acc: P.accent, list: [] },
      { title: "国家队征程", acc: "#b8452e", list: [] },
      { title: "青春纪念", acc: "#3f8f6b", list: [] },
    ];
    (trophies || []).forEach(t => { if (!t || !t.name) return; groups[isIntl(t.name) ? 1 : 0].list.push(t.name); });
    (youthTrophies || []).forEach(t => { if (!t || !t.name) return; groups[2].list.push(t.name); });
    let cy = y;
    ctx.textAlign = "left";
    for (const g of groups) {
      if (!g.list.length) continue;
      /* 区题签：斜纹底块 */
      const tw = Math.ceil(ctx.measureText(g.title).width) + 36;
      ctx.save();
      ctx.beginPath(); rr(ctx, 20, cy, tw, 34, 6); ctx.clip();
      ctx.fillStyle = g.acc; ctx.fillRect(20, cy, tw, 34);
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      for (let sx = 20 - 34; sx < 20 + tw + 34; sx += 14) {
        ctx.beginPath(); ctx.moveTo(sx, cy + 34); ctx.lineTo(sx + 12, cy); ctx.lineTo(sx + 18, cy); ctx.lineTo(sx + 6, cy + 34); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      ctx.fillStyle = "#ffffff"; ctx.font = "800 19px 'PingFang SC','Microsoft YaHei',sans-serif";
      ctx.fillText(g.title + " · " + g.list.length, 36, cy + 24);
      cy += 44;
      /* 该区 chips（同名折叠 ×N，最多 8 个/区） */
      const count = {};
      g.list.forEach(n => { count[n] = (count[n] || 0) + 1; });
      const chips = Object.keys(count).slice(0, 8).map(n => count[n] > 1 ? n + "×" + count[n] : n);
      let cx = 20;
      chips.forEach(name => {
        ctx.font = "700 20px 'PingFang SC','Microsoft YaHei',sans-serif";
        const w = Math.ceil(ctx.measureText(name).width) + 32;
        if (cx + w > W - 20) { cx = 20; cy += 48; }
        ctx.fillStyle = P.chipBg; rr(ctx, cx, cy, w, 38, 19); ctx.fill();
        ctx.strokeStyle = g.acc; ctx.lineWidth = 2; rr(ctx, cx, cy, w, 38, 19); ctx.stroke();
        ctx.fillStyle = g.acc;
        ctx.fillText(name, cx + 16, cy + 26);
        cx += w + 12;
      });
      cy += 52;
    }
    return cy;
  }

  /** P153 尾部：分隔线 + 传奇指数 + footer（legacy 非有限值兜底 0，绝不显示 NaN） */
  function drawLegacyFooter(ctx, y, legacy, P, acc) {
    let v = Number(legacy);
    if (!isFinite(v)) v = 0;
    ctx.strokeStyle = P.line; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(20, y); ctx.lineTo(W - 20, y); ctx.stroke();
    ctx.fillStyle = P.dim; ctx.font = "500 20px 'PingFang SC','Microsoft YaHei',sans-serif"; ctx.textAlign = "left";
    ctx.fillText("传奇指数", 20, y + 42);
    ctx.fillStyle = acc || P.accent; ctx.font = "900 40px 'PingFang SC','Microsoft YaHei',sans-serif"; ctx.textAlign = "right";
    ctx.fillText(String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ","), W - 20, y + 48);
    ctx.fillStyle = "#8a8272"; ctx.font = "400 19px 'PingFang SC','Microsoft YaHei',sans-serif"; ctx.textAlign = "center";
    ctx.fillText("热点资讯 · 足球话题区 | 一起来踢球", W / 2, H - 26);
    ctx.textAlign = "left";
  }

  /* ───────────────────────── ★ P282 赛季分享奖励（热点资讯发布端，2026-09-22）─────────────────────────
     规则（兄弟拍板）：每个赛季前 3 次成功分享到热点资讯论坛 → 每次奖励 存款 +50 万 + 经验 +1000。
     · 判定口径 = postToBbs 唤起发帖器成功（openPostEditor code 200）——热点资讯官方契约只回执「已唤起」，
       玩家在原生编辑器确认发布；降级弹层「一键发热点资讯」重试走同链路，同样计次。
     · 渠道自然隔离：TapTap 小游戏 / 纯浏览器无热点资讯桥（bridgeReady=false）→ 永不触发、零副作用。
     · 计数器 d.shareBonus = { season, used } 随档持久化；跨赛季惰性重置（读取时发现 season 不匹配即清零）。
     · 入账纪律：钱走 d.money + Finance.log 流水（同 career.js 事件口径）；经验走 Training.deposit 唯一入口
       （expTotal/expPool 同步联动，禁直加；★注意 deposit 在 Training 对象上、非 Skills）；发奖即 State.save() 落盘防丢。 */
  const SHARE_BONUS = { money: 500000, exp: 1000, times: 3 };

  /** P282 奖励计数器（惰性跨季重置；返回 d 或 null——无进行中档时不出奖） */
  function shareBonusData() {
    const st = window.State;
    if (!st || !st.data || !st.data.player) return null;
    const d = st.data;
    if (!d.shareBonus || d.shareBonus.season !== d.season) {
      d.shareBonus = { season: d.season || 0, used: 0 };
    }
    return d;
  }

  /** 本赛季剩余可领次数（分享入口提示用；无档返回 0） */
  function shareBonusLeft() {
    const d = shareBonusData();
    return d ? Math.max(0, SHARE_BONUS.times - d.shareBonus.used) : 0;
  }

  /** 发放一次分享奖励（postToBbs code 200 时调用）。返回 { used, left, money, exp } 或 null（不可发/已领满）。 */
  function grantShareBonus() {
    const d = shareBonusData();
    if (!d || d.shareBonus.used >= SHARE_BONUS.times) return null;
    d.shareBonus.used++;
    d.money = (d.money || 0) + SHARE_BONUS.money;
    try { if (window.Finance && Finance.log) Finance.log(d, "分享", SHARE_BONUS.money, "热点资讯分享奖励（本赛季 " + d.shareBonus.used + "/" + SHARE_BONUS.times + "）"); } catch (e) { /* 流水失败不影响发奖 */ }
    try { if (window.Training && Training.deposit) Training.deposit(window.State, SHARE_BONUS.exp); } catch (e) { /* 经验入池失败不影响钱 */ }
    try { if (window.Track && Track.click) Track.click("BMC028", "T1", "share_reward_" + d.shareBonus.used); } catch (e) { }
    try { if (window.State && State.save) State.save(); } catch (e) { /* 落盘失败由既有自动存档兜底 */ }
    return { used: d.shareBonus.used, left: SHARE_BONUS.times - d.shareBonus.used, money: SHARE_BONUS.money, exp: SHARE_BONUS.exp };
  }

  /* ───────────────────────── 管道层（S1，2026-09-18）─────────────────────────
     openEditorOpts：统一拼发帖路由（topicId/topicName/tagId/tagName，全字符串）
     postToBbs：能力检测 → toBlob → OSS 直传 → openPostEditor → code 200 判定
     showFallback：浏览器降级三件套（长按保存 / 只读可选文案 / 一键发热点资讯重试） */

  function bridgeReady() {
    return !!(window.ColorboxAI && window.ColorboxAI.oss && window.ColorboxAI.oss.uploadFile &&
      window.ColorboxAI.request && window.ColorboxAI.request.bbs && window.ColorboxAI.request.bbs.openPostEditor);
  }

  function openEditorOpts(copy, imageUrl) {
    const o = { title: copy.title, content: copy.body, imageUrl: imageUrl };
    o.topicId = TOPIC_ID;
    o.topicName = TOPIC_NAME;
    if (TAG_ID) { o.tagId = TAG_ID; o.tagName = TAG_NAME; }
    return o;
  }

  function toBlobP(canvas) {
    return new Promise((resolve, reject) => {
      if (!canvas || typeof canvas.toBlob !== "function") { reject(new Error("Canvas 导出不可用")); return; }
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error("Canvas 导出失败"))), "image/png");
    });
  }

  /** App 内直发：OSS 上传分享图 + 唤起发帖器。resolve(true)=已唤起；
      resolve(false)=桥接不可用；reject=上传或唤起失败。 */
  function postToBbs(canvas, filename, copy) {
    if (!bridgeReady()) return Promise.resolve(false);
    UIkit.toast("正在合成分享图…");
    return toBlobP(canvas).then(blob => {
      if (!blob) throw new Error("海报合成失败");
      const file = (typeof File === "function") ? new File([blob], filename, { type: "image/png" }) : blob;
      return window.ColorboxAI.oss.uploadFile({ file: file, filename: filename });
    }).then(res => {
      if (!res || !res.downloadUrl) throw new Error("上传失败");
      /* P133 埋点 BMC008：发帖链路（openPostEditor 唤起前） */
      try { if (window.Track) Track.click("BMC008", "T1", "post_editor_open"); } catch (e) { }
      return window.ColorboxAI.request.bbs.openPostEditor(openEditorOpts(copy, res.downloadUrl));
    }).then(rsp => {
      if (rsp && rsp.code === 200) {
        /* ★ P282 赛季分享奖励：成功唤起发帖器 = 有效分享（每季前 3 次发奖；领完静默） */
        const rw = grantShareBonus();
        UIkit.toast("已唤起热点资讯发帖器，确认即可发布" +
          (rw ? "　分享奖励到账：存款 +" + (rw.money / 10000) + " 万 · 经验 +" + rw.exp + "（本赛季 " + rw.used + "/" + SHARE_BONUS.times + "）" : ""), "gold");
        return true;
      }
      throw new Error((rsp && rsp.message) || "唤起发帖失败");
    });
  }

  /** 浏览器降级弹层（供 share / season_report 复用）：
      图片浮层（长按保存，SR-005 不程序化下载）+ 只读可选文案（SR-006 不写剪贴板）
      + 「一键发热点资讯」重试按钮（App 内点击直发；纯浏览器 toast 引导手动发帖）。
      ★ P153：toDataURL 包 try-catch —— 任何环境下不因导出失败阻塞文案兜底。 */
  function showFallback(canvas, filename, copy, title) {
    let dataUrl = "";
    try { dataUrl = canvas.toDataURL("image/png"); } catch (e) { dataUrl = ""; }
    const uid = "sp" + Math.floor(Math.random() * 1e6);
    const imgHtml = dataUrl
      ? '<img src="' + dataUrl + '" style="width:100%;max-width:320px;border-radius:12px;display:block;margin:0 auto" alt="' + UIkit.esc(title || "分享图") + '（海报内容摘要见文字版）">'
        + '<p style="text-align:center;color:var(--text-dim);font-size:12px;margin:10px 0">长按（或右键）图片保存到相册</p>'
      : '<p style="text-align:center;color:var(--text-dim);font-size:12px;margin:10px 0">（当前环境无法导出图片，可复制文字发帖）</p>';
    const html = "<h3>" + UIkit.esc(title || "分享图已生成") + "</h3>" + imgHtml +
      '<div class="panel alt"><div id="' + uid + '-text" title="长按或点击全选后手动复制" style="font-size:13px;line-height:1.8;white-space:pre-wrap;color:var(--text-gray);user-select:text;-webkit-user-select:text;cursor:text">' +
      UIkit.esc(copy.title + "\n\n" + copy.body) + "</div>" +
      '<button class="btn btn-sm btn-gold btn-block" id="' + uid + '-pick" style="margin-top:10px">全选文案</button>' +
      '<button class="btn btn-gold btn-block" id="' + uid + '-retry" style="margin-top:10px;font-weight:900">一键发热点资讯 · 带图带文直发论坛</button></div>';
    UIkit.modal(html);
    const pick = document.getElementById(uid + "-pick");
    const textBox = document.getElementById(uid + "-text");
    if (pick && textBox) pick.onclick = () => {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(textBox);
      sel.removeAllRanges(); sel.addRange(range);
      UIkit.toast("已全选文案，长按选区选择「复制」", "gold");
    };
    const retry = document.getElementById(uid + "-retry");
    if (retry) retry.onclick = function () {
      retry.disabled = true;
      retry.textContent = "正在上传分享图…";
      postToBbs(canvas, filename, copy).then(ok => {
        if (ok) { retry.textContent = "已唤起发帖器，去确认发布吧"; return; }
        retry.disabled = false;
        retry.textContent = "一键发热点资讯 · 带图带文直发论坛";
        UIkit.toast("当前环境不支持直发——长按图片保存后，到热点资讯 App 发帖并粘贴文案即可", "red");
      }).catch(err => {
        retry.disabled = false;
        retry.textContent = "一键发热点资讯 · 带图带文直发论坛";
        UIkit.toast("分享失败：" + err.message, "red");
      });
    };
  }

  /** 统一走管道：App 内直发，失败/降级 → showFallback（篮球版 shareCanvas 同构） */
  function shareCanvas(canvas, filename, copy, title) {
    return postToBbs(canvas, filename, copy).then(ok => {
      if (ok) return true;
      showFallback(canvas, filename, copy, title);
      return false;
    }).catch(err => {
      UIkit.toast((err && err.message) || "分享失败，可长按图片保存", "red");
      showFallback(canvas, filename, copy, title);
      return false;
    });
  }

  /** ── 生涯终章海报（P153 矢量重做）──
      场景按结局 id 映射（PosterArt.ENDING_SCENE），无 id 按 tierRank 兜底；
      黑块标题 = 结局名（对齐篮球版「名人堂传奇」式终章卡）。 */
  function endingSceneOf(e, ret) {
    const PA = window.PosterArt;
    if (!PA) return "stadiumNight";
    if (e && e.id && PA.ENDING_SCENE[e.id]) return PA.ENDING_SCENE[e.id];
    const rk = (ret && ret.tierRank) || 0;
    return rk >= 3 ? "celebration" : rk === 2 ? "stadiumNight" : "duskStadium";
  }

  function build(state, ret, cb) { // P0-9：接收回调
    const P = pal();
    const BG = P.bg, CARD = P.card, GOLD = P.accent, TXT = P.txt, DIM = P.dim;
    const d = state.data;
    const e = ret.ending || ret.tier;
    const s = ret.stats || {};
    const PA = window.PosterArt;
    const seed = (d.season || 0) * 97 + ((d.player && d.player.age) || 0) * 13 + String(e && e.name || "").length;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    /* ★ P237（复审）：Canvas 海报可访问性——role=img + aria-label 海报摘要（屏幕阅读器可朗读；
       canvas 本身不进 DOM（toBlob/toDataURL 导出后由弹层 img 呈现），此语义防未来 DOM 挂载路径缺失） */
    cv.setAttribute("role", "img");
    cv.setAttribute("aria-label", "生涯终章海报：" + ((d.player && d.player.name) || "球员") + "的足球生涯——" + ((e && e.name) || "生涯终章") + "，出场 " + (s.apps || 0) + " 场");
    const ctx = cv.getContext("2d");
    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = "alphabetic";

    // ① 头图：矢量场景 + 黑块结局名
    drawSceneHeader(ctx, endingSceneOf(e, ret), P, {
      tag: "冠军之心：足球生涯 · 生涯终章",
      title: (e && e.name) || "生涯终章",
      seed,
    });

    let y = 522;
    // ② 一句话
    ctx.textAlign = "center";
    ctx.fillStyle = "#4a4436"; ctx.font = "500 24px 'PingFang SC','Microsoft YaHei',sans-serif";
    y = wrap(ctx, ((e && (e.line || e.desc)) || "") + "。", W / 2, y, W - 120, 34) + 44;
    ctx.textAlign = "left";

    // ③ 数据四格（门将口径；ratingSum 缺失防御 || 0，绝不显示 NaN；白卡粗框美漫格）
    const ratingCell = s.apps ? (Math.round((s.ratingSum || 0) / s.apps * 10) / 10).toFixed(1) : "0.0";
    const cells = (d.player && d.player.position === "GK") ? [
      ["出场", s.apps || 0], ["扑救", s.saves || 0], ["零封", s.cleanSheets || 0],
      ["场均评分", ratingCell],
    ] : [
      ["出场", s.apps || 0], ["进球", s.goals || 0], ["助攻", s.assists || 0],
      ["场均评分", ratingCell],
    ];
    const cw = (W - 40 - 30) / 4;
    cells.forEach((c, i) => {
      const x = 20 + i * (cw + 10);
      ctx.fillStyle = CARD; rr(ctx, x, y, cw, 88, 10); ctx.fill();
      ctx.strokeStyle = "rgba(42,37,28,0.8)"; ctx.lineWidth = 2.5; rr(ctx, x, y, cw, 88, 10); ctx.stroke();
      ctx.fillStyle = DIM; ctx.font = "400 19px 'PingFang SC','Microsoft YaHei',sans-serif"; ctx.textAlign = "center";
      ctx.fillText(c[0], x + cw / 2, y + 32);
      ctx.fillStyle = TXT; ctx.font = "600 30px 'PingFang SC','Microsoft YaHei',sans-serif";
      ctx.fillText(String(c[1]), x + cw / 2, y + 70);
    });
    ctx.textAlign = "left";
    y += 112;

    // ④ 明细行（球队解析走 clubViewOf —— 青训/成年统一出口）
    const intl = (d.intl && d.intl.career) || { apps: 0, goals: 0 };
    const clubs = 1 + ((d.history && d.history.pastClubs) || []).length;
    const lastView = (window.Youth && Youth.clubViewOf) ? Youth.clubViewOf(d)
      : ((window.teamById && teamById(d.clubId)) ? { name: teamById(d.clubId).name } : null);
    const lastTeam = (lastView && lastView.name) || "无所属";
    const rows = [
      ["国家队", (intl.apps || 0) + " 场 · " + (intl.goals || 0) + " 球" + (d.intl && d.intl.captain ? " · 队长袖标" : "")],
      ["效力球队", clubs + " 家 · 最后身披 " + lastTeam + " 球衣"],
      ["退役年龄", (d.player.age || "?") + " 岁 · " + ((d.date && d.date.year) || "") + " 赛季"],
      ["生涯收入", (window.Career ? Career.fmtMoney(ret.wageEarned || 0) : "0") + " 工资 · " + (ret.car || "地铁 + 共享单车")],
    ];
    y = drawRows(ctx, y, rows, P);

    // ⑤ 荣誉墙（★ P199 三分区：俱乐部/国家队/青春——含青年荣誉容器 d.youth.trophies）
    y = drawHonorWall(ctx, y, d.trophies || [], (d.youth && d.youth.trophies) || [], P, {});

    // ⑥ 传奇指数 + footer
    drawLegacyFooter(ctx, y, ret.legacy, P, GOLD);
    if (cb) cb(cv); // P153：全同步，直接回调
    return cv;
  }

  /** 夺冠速报海报（P2 → P153 矢量重做）：洲际杯/国内杯赛/亚洲杯/世界杯夺冠即时分享 */
  function buildChampion(state, ret, cb) {
    const P = pal();
    const BG = P.bg, CARD = P.card, GOLD = P.accent, TXT = P.txt, DIM = P.dim;
    const d = state.data;
    const c = ret.__champion || {};
    const PA = window.PosterArt;
    const seed = (d.season || 0) * 53 + (c.userGoals || 0) * 7 + 1001;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    /* ★ P237（复审）：Canvas 海报可访问性（同 buildRetire 口径） */
    cv.setAttribute("role", "img");
    cv.setAttribute("aria-label", "夺冠速报海报：" + (c.compLabel || "冠军") + "夺冠——决赛比分 " + (c.scoreLine || "—") + (c.motm ? "，全场最佳" : ""));
    const ctx = cv.getContext("2d");
    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = "alphabetic";

    // ① 头图：庆典场景（金杯+彩带）+ 黑块冠军名
    drawSceneHeader(ctx, PA ? PA.sceneOf(PA.CHAMP_SCENE, "champion") : "celebration", P, {
      tag: "冠军之心：足球生涯 · 夺冠速报",
      title: c.compLabel || "冠军",
      seed,
    });

    let y = 512;
    // ② 我们夺冠了 + 球队
    ctx.textAlign = "center";
    ctx.fillStyle = TXT; ctx.font = "900 36px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.fillText("我 们 夺 冠 了", W / 2, y);
    y += 56;
    // ③ 决赛信息卡
    const lastView = (window.Youth && Youth.clubViewOf) ? Youth.clubViewOf(d)
      : ((window.teamById && teamById(d.clubId)) ? { name: teamById(d.clubId).name } : null);
    const rows = [
      ["决赛比分", c.scoreLine || "—"],
      ["决赛对手", c.oppName || "—"],
      ["我的表现", (c.userGoals || 0) + " 球" + (c.rating != null ? " · 评分 " + c.rating : "") + (c.motm ? " · 全场最佳" : "")],
      ["夺冠赛季", ((d.date && d.date.year) || "") + " 赛季 · " + ((lastView && lastView.name) || "")],
    ];
    ctx.textAlign = "left";
    y = drawRows(ctx, y, rows, P);
    // ④ 荣誉墙（含本冠）
    y = drawTrophyChips(ctx, y, d.trophies || [], P, {});
    // ⑤ 传奇指数 + footer
    const legacyNow = (window.Career && Career.legacyOf) ? Career.legacyOf(state) : 0;
    drawLegacyFooter(ctx, y, legacyNow, P, GOLD);
    if (cb) cb(cv);
    return cv;
  }

  /* ───────────────────────── 国家队名次分级海报（S3 → P153 矢量重做）─────────────────────────
     所有名次均可转发（拍板同规则）；accent 分级：冠军金 / 亚军银 / 四强铜 / 八强·小组出局灰。
     场景分级：冠军庆典 / 亚军夜场 / 四强·八强黄昏 / 小组出局雨夜。数据全取真实结算状态。 */
  const INTL_THEME = {
    champion:    { line: "从小组赛到决赛，每一场都写在战报里。这个夏天，属于整支球队。" },
    "runner-up": { line: "差一步就是最高处。银牌的重量，只有拼到最后一秒的人知道。" },
    semifinal:   { line: "倒在决赛门外，但世界已经记住了我们的名字。" },
    quarterfinal:{ line: "淘汰赛的学费交得不亏——四年后，带着它回来。" },
    group_out:   { line: "小组赛的苦涩刻骨铭心——四年后，带着它回来。" },
  };
  const INTL_ACCENT = {
    champion: null,               // 跟随主题金
    "runner-up": "#8a98b8",
    semifinal: "#c08850",
    quarterfinal: "#98a088",
    group_out: "#98a088",
  };
  const INTL_STAMP = { champion: "冠军", "runner-up": "亚军", semifinal: "四强", quarterfinal: "八强", group_out: "出局" };

  function buildIntl(state, ret, cb) {
    const P = pal();
    const BG = P.bg, CARD = P.card, GOLD = P.accent, TXT = P.txt, DIM = P.dim;
    const d = state.data;
    const c = ret.__intl || {};
    const m = ret.__match || {};
    const comp = c.comp || "世界杯";
    const result = c.result || "champion";
    const theme = INTL_THEME[result] || INTL_THEME.champion;
    const ACC = INTL_ACCENT[result] || GOLD;
    const PA = window.PosterArt;
    const label = result === "quarterfinal" ? (c.stageLabel || "止步八强")
      : result === "runner-up" ? (comp + "亚军")
      : result === "semifinal" ? (comp + "四强")
      : result === "group_out" ? (comp + "小组出局")
      : (comp + "冠军");
    const wins = c.wins || 0, games = c.games || 0;
    const seed = (d.season || 0) * 71 + games * 11 + result.length;

    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    /* ★ P237（复审）：Canvas 海报可访问性（同 buildRetire 口径） */
    cv.setAttribute("role", "img");
    cv.setAttribute("aria-label", "国家队征程海报：" + label + "——" + games + " 场比赛取得 " + wins + " 胜");
    const ctx = cv.getContext("2d");
    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = "alphabetic";

    // ① 头图：名次分级场景 + 黑块名次 + 名次章
    drawSceneHeader(ctx, PA ? PA.sceneOf(PA.CHAMP_SCENE, result) : "stadiumNight", P, {
      tag: "冠军之心：足球生涯 · 国家队征程",
      title: label,
      acc: ACC,
      seed,
    });
    // 名次章（骑缝右侧，ACC 底）
    ctx.save();
    ctx.translate(622, 448);
    ctx.rotate(-0.18);
    ctx.fillStyle = ACC;
    ctx.beginPath(); ctx.arc(0, 0, 66, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 5; ctx.stroke();
    ctx.fillStyle = "#141008";
    ctx.textAlign = "center";
    ctx.font = "900 34px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.fillText(INTL_STAMP[result] || "征战", 0, 10);
    ctx.restore();
    ctx.textAlign = "left";

    let y = 528;
    // ② 一句评语 + 球员
    ctx.textAlign = "center";
    ctx.fillStyle = TXT; ctx.font = "900 32px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.fillText(((d.player && d.player.name) || "无名球员") + " · 中国队", W / 2, y);
    y += 50;
    ctx.fillStyle = "#4a4436"; ctx.font = "500 24px 'PingFang SC','Microsoft YaHei',sans-serif";
    y = wrap(ctx, theme.line, W / 2, y, W - 120, 34) + 36;
    ctx.textAlign = "left";

    // ③ 明细卡
    const career = (d.intl && d.intl.career) || { apps: 0, goals: 0 };
    const rows = [
      ["本届战绩", games ? wins + " 胜 " + (games - wins) + " 负（共 " + games + " 场）" : "—"],
      ["最后一战", m.scoreLine ? m.scoreLine + " vs " + (m.oppName || "对手") : "—"],
      ["我的表现", m.played === false ? "本届未能登场" : (m.userGoals || 0) + " 球" + (m.rating != null ? " · 评分 " + m.rating : "") + (m.motm ? " · 全场最佳" : "")],
      ["国家队生涯", (career.apps || 0) + " 场 · " + (career.goals || 0) + " 球" + (d.intl && d.intl.captain ? " · 队长袖标" : "")],
    ];
    y = drawRows(ctx, y, rows, P);

    // ④ 国家队荣誉墙（同名折叠，ACC 描边）
    const nat = ["世界杯冠军", "世界杯金靴", "世界杯MVP", "亚洲杯冠军"];
    y = drawTrophyChips(ctx, y, d.trophies || [], P, { only: nat, stroke: ACC });

    // ⑤ 传奇指数 + footer
    const legacyNow = (window.Career && Career.legacyOf) ? Career.legacyOf(state) : 0;
    drawLegacyFooter(ctx, y, legacyNow, P, ACC);
    if (cb) cb(cv);
    return cv;
  }

  /** 国家队名次文案（JR 体，随名次分级） */
  function intlCopy(state, ret) {
    const d = state.data;
    const c = ret.__intl || {};
    const m = ret.__match || {};
    const comp = c.comp || "世界杯";
    const result = c.result || "champion";
    const year = (d.date && d.date.year) || "";
    const label = result === "champion" ? (comp + "冠军")
      : result === "runner-up" ? (comp + "亚军")
      : result === "semifinal" ? (comp + "四强")
      : result === "quarterfinal" ? (comp + (c.stageLabel || "止步八强"))
      : (comp + "小组出局");
    const line = (INTL_THEME[result] || INTL_THEME.champion).line;
    const wins = c.wins || 0, games = c.games || 0;
    const title = result === "champion"
      ? label + "！" + year + " " + comp + "，这一夜属于中国足球"
      : label + "！我们让世界记住了中国足球";
    const body =
      "兄弟们，" + year + " 年 " + comp + "打完了，最终成绩：" + label + "。\n" +
      (games ? "本届 " + wins + " 胜 " + (games - wins) + " 负" + (m.played !== false ? "，我贡献 " + (m.userGoals || 0) + " 球" + (m.motm ? "，拿过一次全场最佳" : "") : "") + "。" : "") + "\n\n" +
      line + "\n\n" +
      "各位 JR 会给这届国家队打几分？\n" +
      "#冠军之心足球生涯 #" + comp + (result === "champion" ? "冠军" : "征程");
    return { title: title, body: body };
  }

  /* ───────────────── ★ P261 比赛战报海报（每场赛后卡「分享战报」）─────────────────
     里程碑单源 matchMilestoneOf：五元>四喜>帽子>梅开二度 > 制胜一击 > 首秀 > 处子球 > 零封。
     里程碑场 = 专属头图（goalRain 进球如雨场景，balls=进球数）+ 骑缝章 + 专属文学句；
     普通场按赛果配场景（胜=球场之光 / 平=黄昏 / 负=雨战）。数据全取结算卡真实数字。 */

  /** 里程碑定义表（探针直测；lines 多变体由 seed 取） */
  const MATCH_MS = [
    { min: 5, key: "five", name: "独中五元", stamp: "五子登科", title: "独中五元！", lines: [
      "五次把球送进同一座网窝——今晚的皮球认路，球门为我敞开了五次。",
      "五子登科。踢了这么多年球，第一次看见自己的名字和「纪录」写在同一行。",
    ] },
    { min: 4, key: "four", name: "大四喜", stamp: "大四喜", title: "大四喜！", lines: [
      "第四次听见网窝的声响时，整座球场安静了一秒——然后比任何时候都吵。",
      "大四喜这种事，一辈子有一次就够吹一辈子——今晚它来了。",
    ] },
    { min: 3, key: "hattrick", name: "帽子戏法", stamp: "帽子戏法", title: "帽子戏法！", lines: [
      "一顶帽子扣在对方的球门上。三次触球、三次入网，皮球今晚认路。",
      "第三个球进完，我已经想不起前两个怎么踢的了——身体先于脑子庆祝。",
    ] },
    { min: 2, key: "brace", name: "梅开二度", stamp: "梅开二度", title: "梅开二度！", lines: [
      "进球这种事，来的时候总是一双一双的——梅开二度，今晚属于我。",
      "两球入账。下半场那脚推射入网的瞬间，我就知道今晚跑不掉了。",
    ] },
  ];
  const MATCH_MS_SPECIAL = {
    lastMinute: { key: "lastMinute", name: "制胜一击", stamp: "制胜一击", title: "制胜一击！", lines: [
      "决定比赛的那一下，全世界都慢了下来——只有我和那扇门是快的。",
      "决胜球入网的那一秒，看台的声浪像潮水一样从背后把我推了个趔趄。",
    ] },
    debut: { key: "debut", name: "职业生涯首秀", stamp: "生涯首秀", title: "职业生涯首秀", lines: [
      "第一场正式比赛的哨声，比青训营的任何一天都响——草皮的味道都不一样。",
      "职业生涯首秀打完。从今天起，我是一个真正的职业球员了。",
    ] },
    firstGoal: { key: "firstGoal", name: "生涯处子球", stamp: "处子球", title: "生涯处子球", lines: [
      "为了这一脚，我练了无数个傍晚。网窝响起的瞬间，全都值了。",
      "生涯处子球。这个球我会记一辈子——它是所有故事的第一个句号。",
    ] },
    cleanSheet: { key: "cleanSheet", name: "零封对手", stamp: "零封", title: "零封之战", lines: [
      "门将的快乐很简单——九十分钟，一球不丢。",
      "零封。手指撞上门柱的闷响，今晚听起来像勋章。",
    ] },
  };

  /** 里程碑检测（单源；入参 p = 结算卡真实数字，零叙述零捏造） */
  function matchMilestoneOf(p) {
    if (!p || !p.played) return null;
    const g = p.goals || 0;
    for (const m of MATCH_MS) if (g >= m.min) return m;
    if (p.keyHook === "goal" && p.res === "胜" && g >= 1) return MATCH_MS_SPECIAL.lastMinute;
    if ((p.careerAppsAfter | 0) === 1) return MATCH_MS_SPECIAL.debut;
    if (g >= 1 && (p.careerGoalsAfter | 0) === g) return MATCH_MS_SPECIAL.firstGoal;
    if (p.isGK && p.conceded === 0) return MATCH_MS_SPECIAL.cleanSheet;
    return null;
  }

  /** 比赛战报海报（P261）：复用亮色杂志风 + 月桂头图 + 黑块标题 + 明细白卡 */
  function buildMatch(state, ret, cb) {
    const P = pal();
    const d = state.data;
    const p = ret.__matchCard || {};
    const ms = matchMilestoneOf(p);
    const PA = window.PosterArt;
    const resKey = p.res === "胜" ? "win" : p.res === "平" ? "draw" : "lose";
    const sceneKey = PA ? PA.sceneOf(PA.MATCH_SCENE, ms ? ms.key : resKey) : resKey;
    const seed = (d.season || 0) * 31 + (p.goals || 0) * 17 + (p.home || 0) * 7 + String(p.compLabel || "").length;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    cv.setAttribute("role", "img");
    cv.setAttribute("aria-label", "比赛战报海报：" + (p.compLabel || "比赛") + "，" +
      (p.homeName || "主队") + " " + (p.home || 0) + " : " + (p.away || 0) + " " + (p.awayName || "客队") +
      (ms ? "——" + ms.name : ""));
    const ctx = cv.getContext("2d");
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = "alphabetic";

    // ① 头图：里程碑 → goalRain（balls=进球数）/ 普通场按赛果；黑块标题 = 里程碑名或赛果
    const resTitle = p.res === "胜" ? "拿下这场胜利" : p.res === "平" ? "各取一分" : "憾负一战";
    drawSceneHeader(ctx, sceneKey, P, {
      tag: "冠军之心：足球生涯 · 比赛战报",
      title: (ms && ms.title) || resTitle,
      seed, balls: p.goals || undefined,
    });
    // 里程碑骑缝章（金色圆章，字号随字数收缩）
    if (ms) {
      ctx.save();
      ctx.translate(618, 446);
      ctx.rotate(-0.18);
      ctx.fillStyle = P.accent;
      ctx.beginPath(); ctx.arc(0, 0, 68, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 5; ctx.stroke();
      ctx.fillStyle = "#141008";
      ctx.textAlign = "center";
      const n = ms.stamp.length;
      ctx.font = "900 " + (n <= 2 ? 34 : n === 3 ? 28 : 22) + "px 'PingFang SC','Microsoft YaHei',sans-serif";
      ctx.fillText(ms.stamp, 0, 10);
      ctx.restore();
      ctx.textAlign = "left";
    }

    let y = 516;
    // ② 大比分卡（主前客后，P214 口径；队名过长自动缩字号）
    ctx.fillStyle = P.card; rr(ctx, 20, y, W - 40, 128, 12); ctx.fill();
    ctx.strokeStyle = "rgba(42,37,28,0.8)"; ctx.lineWidth = 2.5; rr(ctx, 20, y, W - 40, 128, 12); ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillStyle = P.dim; ctx.font = "500 21px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.fillText(String(p.compLabel || "比赛战报") + ((d.date && d.date.year) ? " · " + d.date.year + " 赛季" : ""), W / 2, y + 34);
    let scoreText = (p.homeName || "主队") + " " + (p.home != null ? p.home : 0) + " : " + (p.away != null ? p.away : 0) + " " + (p.awayName || "客队");
    let fs = 34;
    ctx.font = "900 " + fs + "px 'PingFang SC','Microsoft YaHei',sans-serif";
    while (fs > 20 && ctx.measureText(scoreText).width > W - 100) { fs -= 2; ctx.font = "900 " + fs + "px 'PingFang SC','Microsoft YaHei',sans-serif"; }
    ctx.fillStyle = P.txt;
    ctx.fillText(scoreText, W / 2, y + 84);
    if (p.pens) {
      ctx.fillStyle = P.dim; ctx.font = "500 20px 'PingFang SC','Microsoft YaHei',sans-serif";
      ctx.fillText("点球大战 " + p.pens.my + " : " + p.pens.opp + (p.pens.won ? "　胜" : "　负"), W / 2, y + 114);
    }
    ctx.textAlign = "left";
    y += 152;

    // ③ 明细行（对手 / 我的表现 / 门将扑救口径）
    const isGK = p.isGK;
    let perf = "替补席待命";
    if (p.played) {
      perf = "评分 " + (p.rating != null ? p.rating : "—") +
        (isGK ? " · " + (p.saves || 0) + " 次扑救" : " · " + (p.goals || 0) + " 球 " + (p.assists || 0) + " 助攻") +
        (p.motm ? " · 全场最佳" : "");
    }
    const rows = [["对手", p.oppName || "—"], ["我的表现", perf]];
    if (ms) rows.push(["本场里程碑", ms.name]);
    y = drawRows(ctx, y, rows, P);

    // ④ 里程碑文学句（居中金句；普通场省略）
    if (ms) {
      const line = ms.lines[seed % ms.lines.length];
      ctx.textAlign = "center";
      ctx.fillStyle = "#8a6a10"; ctx.font = "500 23px 'PingFang SC','Microsoft YaHei',sans-serif";
      const yy = wrap(ctx, line, W / 2, y + 26, W - 110, 34);
      ctx.textAlign = "left";
      y = yy + 22;
    }

    // ⑤ 传奇指数 + footer
    const legacyNow = (window.Career && Career.legacyOf) ? Career.legacyOf(state) : 0;
    drawLegacyFooter(ctx, y, legacyNow, P, P.accent);
    if (cb) cb(cv);
    return cv;
  }

  /** 战报文案兜底（ShareCopy.match 缺载时用；主引擎在 share_copy.js，多版本池） */
  function matchCopyFallback(state, ret) {
    const d = state.data;
    const p = ret.__matchCard || {};
    const ms = matchMilestoneOf(p);
    const scoreLine = (p.homeName || "主队") + " " + (p.home != null ? p.home : 0) + " : " + (p.away != null ? p.away : 0) + " " + (p.awayName || "客队");
    const title = (ms ? ms.title : p.res === "胜" ? "拿下比赛！" : p.res === "平" ? "一分也硬气" : "虽败不馁") + " " + (p.compLabel || "战报") + "请查收";
    const perf = p.played
      ? ((p.isGK ? (p.saves || 0) + " 次扑救" : (p.goals || 0) + " 球 " + (p.assists || 0) + " 助攻") + "，评分 " + (p.rating != null ? p.rating : "—") + (p.motm ? "，全场最佳" : ""))
      : "替补席看完全场";
    const body =
      "兄弟们，" + (p.compLabel || "这场球") + "打完了：" + scoreLine + (p.pens ? "（点球 " + p.pens.my + ":" + p.pens.opp + (p.pens.won ? " 胜" : " 负") + "）" : "") + "。\n" +
      "我的表现：" + perf + "。\n" +
      (ms ? "\n【" + ms.name + "】" + ms.lines[(d.season || 0) % ms.lines.length] + "\n" : "") +
      "\n这表现大家给几分？评论区开聊。\n" +
      "#冠军之心足球生涯 #" + (p.compLabel || "比赛战报");
    return { title: title, body: body };
  }

  /** 分享入口：热点资讯容器内 OSS 直传 + 唤起发帖；外部环境降级展示 */
  function share(state, ret, mode) {
    /* P133 埋点 BMC007：分享入口（mode 区分终章/夺冠/国家队） */
    try { if (window.Track) Track.click("BMC007", "T1", "share_" + (mode || "ending")); } catch (e) { }
    const d = state.data;
    /* ── P261 比赛战报（每场赛后卡）：里程碑差异化海报 + JR 体文案 ── */
    if (mode === "match") {
      const copy = (window.ShareCopy && ShareCopy.match) ? ShareCopy.match(state, ret) : matchCopyFallback(state, ret);
      buildMatch(state, ret, canvas => {
        shareCanvas(canvas, "mfl_match_report.png", copy, "比赛战报分享图");
      });
      return;
    }
    /* ── 国家队名次分级（S3）：世界杯/亚洲杯收官结算卡「分享国家队征程」 ──
       ★ P199：文案改走 ShareCopy 引擎（多版本随机抽取 · 零捏造数字 · 荣誉文学织入） */
    if (mode === "intl") {
      const copyI = (window.ShareCopy && ShareCopy.intl) ? ShareCopy.intl(state, ret) : intlCopy(state, ret);
      buildIntl(state, ret, canvas => {
        shareCanvas(canvas, "mfl_intl_result.png", copyI, "国家队征程分享图");
      });
      return;
    }
    if (mode === "champion") {
      const copy = (window.ShareCopy && ShareCopy.champion) ? ShareCopy.champion(state, ret)
        : (function () { const c = ret.__champion || {}; return { title: (c.compLabel || "冠军") + "！我们在决赛捧杯", body: (c.scoreLine || "") + " 战胜 " + (c.oppName || "对手") + "，" + (c.compLabel || "冠军") + "到手！我的表现：" + (c.userGoals || 0) + " 球" + (c.motm ? " + 全场最佳" : "") + "。冠军之心：足球生涯，一起来踢球！" }; })();
      buildChampion(state, ret, canvas => {
        shareCanvas(canvas, "mfl_champion.png", copy, "夺冠速报海报");
      });
      return;
    }
    const e = ret.ending || ret.tier;
    /* ★ P199：终章文案 = ShareCopy.ending（多版本池）；ENDINGS_DATA.shareCopy 保留为引擎缺载兜底 */
    const copy = (window.ShareCopy && ShareCopy.ending) ? ShareCopy.ending(state, ret)
      : ((window.ENDINGS_DATA && ENDINGS_DATA.shareCopy(d, e)) || { title: e.name, body: e.desc });
    build(state, ret, canvas => {
      shareCanvas(canvas, "mfl_career_end.png", copy, "生涯终章海报");
    });
  }

  return { build, share, postToBbs, showFallback, shareCanvas, buildChampion, buildIntl, intlCopy, posterPal: pal,
    buildMatch, matchMilestoneOf, matchCopyFallback,
    /* ★ P282 赛季分享奖励（探针/门禁直测面） */
    SHARE_BONUS: SHARE_BONUS, shareBonusData: shareBonusData, shareBonusLeft: shareBonusLeft, grantShareBonus: grantShareBonus,
    /* ★ P283c 战报卡「有奖」态：热点资讯桥能力判断（TapTap/纯浏览器 false → 有奖标记与引导句渠道自然隔离） */
    canPostToBbs: bridgeReady,
    TOPIC_ID: TOPIC_ID, TOPIC_NAME: TOPIC_NAME, TAG_ID: TAG_ID, TAG_NAME: TAG_NAME };
})();
