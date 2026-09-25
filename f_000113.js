/* eslint-disable */
/**
 * P92 插画图集（sprite）运行时定位层  —— 热点资讯发布包体积合规专用
 * ================================================================
 * 背景：热点资讯发布包硬约束「媒体合计 ≤100MB + 文件数 ≤300」，而项目有 1325 张
 * 事件卡插画（132MB），必须合并成 83 张图集才能过审。
 *
 * 为什么不能在 CSS 里直接做：
 *   插画统一用 background-image 渲染，容器 .ec-art 是 `flex:1 1 0` 的**非正方形**
 *   （宽由卡片决定、高由 flex 拉伸）。若用 `background-size:400% 400%` +
 *   `background-position:x% y%` 的常规图集写法，每格会被拉伸到容器比例，
 *   1:1 的插画会明显变形（原来的 `background-size:cover` 是保持比例裁切）。
 *
 * 两层配合：
 *   ① style(name) —— 渲染层入口（CardHost / EventCards 等调用）。图集可用时直接
 *      产出 sheet 的 URL + 百分比定位 + `--art-tile:s,c,r` 标记，**不发原图请求**
 *      （发布包里原图不存在，发请求就是 404）。
 *   ② fit(el) —— DOM 层按容器实际像素反算「cover 等价」的精确偏移：
 *         格子显示边长 S = max(容器宽, 容器高)      // cover：短边铺满
 *         background-size     = (G*S)px (G*S)px
 *         background-position = ((W-S)/2 - c*S)px ((H-S)/2 - r*S)px
 *      由 MutationObserver + ResizeObserver 驱动，任意宽高比都不变形。
 *
 * 降级：window.SPRITE_MAP 不存在（本地开发、单图版发布包）时本文件整体不启动，
 *       style() 回退单图 URL，一切行为与旧版完全一致。
 * 调试：URL 带 ?nosprite=1 强制走单图，便于对照图集是否变形。
 *
 * loose 图（ec_stadium / ec_trophy）不在索引里，自动保持单图 —— 它们被
 * <img src> 与静态 CSS 背景引用，无法走图集定位。
 */
(function () {
  "use strict";
  if (typeof window === "undefined") return;   // node 沙箱（soak/探针）直接跳过

  var RE_COMIC = /assets\/comic\/([a-z0-9_]+)\.webp/i;
  var SEL = ".ec-art,.ch-art,.settle-art";
  var SRC_ATTR = "data-art-src";
  var ALIAS = { international: "flag", awards: "trophy" };   // 同 eventcards.js ART_ALIAS

  function pad3(n) { return ("00" + n).slice(-3); }

  /* ★★ P293（SR-022 二审收口）：sprite_map.js 构建产物完整性机制——立场声明。
     SPRITE_MAP 是**包内静态构建产物**（随发布 zip 分发，不走任何运行时网络通道），
     其完整性由发布包完整性承接（zip 内容不可篡改 = 构建产物不可篡改）。
     运行时**不设校验和**，理由：下游全链 fail-closed，被篡改的 map 最多导致
     「插画缺失」，绝无注入面——
       · M.dir / sheet 串 → safeUrl（SAFE_URL_RE：仅 assets/**.webp 相对路径，
         字符集无 ()'" 冒号空格，url() 结构上不可逃逸）；
       · 格位 s/c/r → tileOf 强制非负有限数字（字符串进不来，pad3 只会拼数字）；
       · grid → gridOf 强制 ≥2 有限数字；
       · 裸名 → bare() 白名单 [a-z0-9_]；
       · style() 出口对最终拼接值再断言一道 isSafeUrl（P288 纵深），异常回空串。
     若未来审计要求校验和，应加在**构建管线**（生成时对 map 做 FNV-1a 落 map 自身
     元数据 + cfg() 校验），不改本运行时 fail-closed 形态。 */
  function cfg() {
    var M = window.SPRITE_MAP;
    if (!M || !M.map || !M.dir || M.disabled) return null;
    if (typeof location !== "undefined" &&
        /[?&]nosprite=1/.test(location.search || "")) return null;
    return M;
  }

  /** 插画名归一化：路径 / 扩展名 / 重复 ec_ 前缀 / 别名 → 裸名 */
  function bare(name) {
    var a = String(name == null ? "" : name).trim()
      .replace(/^.*\//, "")
      .replace(/\.webp$/i, "")
      .replace(/^ec_/, "");
    if (!a) a = "goal";
    /* ★ P226（审计 SR）：插画名白名单——裸名只允许 [a-z0-9_]（ec_ 系列全集），
       不匹配（路径逃逸/引号/括号等注入形态）一律回退默认图，杜绝 url(...) 注入 */
    if (!/^[a-z0-9_]{1,40}$/i.test(a)) a = "goal";
    return ALIAS[a] || a;
  }

  /* ★★ P254（2026-09-21 热点资讯发布安全审计收口）：**最终 URL 兜底校验**（协议/域名/字符三重）。
     审计关注面：style() 用字符串拼 `background-image:url(...)` 后写进元素 style 属性；
     若上游任一环被污染（卡片 art 字段来自外部数据、或构建产物 sprite_map.js 被改），
     理论上可拼出可注入的 url() 值。
     · 现状核查：裸名一侧已有 bare() 白名单（P226），**所有调用点都经由 style() → bare()**；
       但 URL 的另一半 —— `M.dir` 与 sheet 号 —— 来自 sprite_map.js 构建产物，此前未做成品串校验。
     · 本条即审计建议的"在 style() 内部对最终 URL 再做一次协议和域名校验"：
       只允许**相对路径** `assets/<段>(/<段>)*.webp` ⇒ 天然禁掉 scheme（http:/data:/
       javascript:/blob:）、协议相对（//evil）、以及引号/括号/空白/分号（url() 逃逸形态）。
     · 不合规一律回退默认单图 —— 绝不把可疑串送进 CSS（fail-closed）。
     applyFit() 里的 `el.style.backgroundImage` 是同一注入面的第二处，一并走本守卫。 */
  var SAFE_URL_RE = /^assets\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.webp$/;
  /* ★ P298c（审计复核追加）：`../` 目录逃逸立场——段字符类 [A-Za-z0-9_-] **不含点号**，
     任何 `..`（../、深层回溯、a..b、%2e%2e）及反斜杠/百分号在结构上进不了任何一段，
     目录逃逸不可表达；行为级固化见 _p292 门禁 B9d（四形态全拒断言）。 */
  var DEFAULT_URL = "assets/comic/ec_goal.webp";
  function isSafeUrl(u) { return SAFE_URL_RE.test(String(u == null ? "" : u)); }
  /** 成品 URL 守卫：合规原样返回，否则返回 fallback（缺省默认单图）。
      导出给 eventcards.artUrl / CardHost.artStyle 共用，避免第四份口径漂移。 */
  function safeUrl(u, fallback) {
    var s = String(u == null ? "" : u);
    if (SAFE_URL_RE.test(s)) return s;
    return fallback == null ? DEFAULT_URL : String(fallback);
  }
  /** 图集格位数字守卫：s/c/r 必须是非负有限数，否则视为"没有图集条目"（回退单图）。
      旧写法若 sprite_map.js 被篡改成字符串，pad3(it.s) 会把最多 3 个字符原样拼进 URL。 */
  function tileOf(it) {
    if (!it) return null;
    var s = it.s, c = it.c, r = it.r;
    if (typeof s !== "number" || typeof c !== "number" || typeof r !== "number") return null;
    if (!isFinite(s) || !isFinite(c) || !isFinite(r) || s < 0 || c < 0 || r < 0) return null;
    return it;
  }
  /** 图集网格数守卫（旧写法 `M.grid || 4` 在 grid=1 时会除零，非数字则会拼进 CSS） */
  function gridOf(M) {
    var g = M && M.grid;
    return (typeof g === "number" && isFinite(g) && g >= 2) ? g : 4;
  }

  /* ── ① 渲染层入口 ───────────────────────────────────────────── */
  /** 产出插画的 background 样式串（图集模式含 sheet 定位；否则单图） */
  function style(name) {
    var a = bare(name);
    var M = cfg();
    /* a 已过 bare() 白名单 ⇒ 本串天然合规；它同时是图集分支校验失败时的回退目标 */
    var singleUrl = "assets/comic/ec_" + a + ".webp";
    var url = singleUrl;
    var extra = "";
    if (M) {
      var it = tileOf(M.map[a]);
      if (it) {
        var g = gridOf(M);
        /* ★ P254：sheet URL 走成品串守卫（M.dir 来自构建产物，见上方 SAFE_URL_RE 注释） */
        var sheetUrl = safeUrl(M.dir + "sheet_" + pad3(it.s) + ".webp", "");
        if (sheetUrl) {
          url = sheetUrl;
          /* 百分比定位只是「劫持生效前」的过渡态，fit() 会立刻换成像素精确定位 */
          extra = ";background-size:" + (g * 100) + "% " + (g * 100) + "%" +
                  ";background-position:" + (it.c / (g - 1) * 100).toFixed(4) + "% " +
                  (it.r / (g - 1) * 100).toFixed(4) + "%" +
                  ";background-repeat:no-repeat" +
                  ";--art-tile:" + it.s + "," + it.c + "," + it.r;
        }
      }
    }
    /* ★ P288 审计防御纵深（SR-004 url() 注入评估）：上游已全白名单——a 过 bare()
       （[a-z0-9_]）、sheetUrl 过 safeUrl（SAFE_URL_RE 字符集无 ()'"冒号空格，url()
       结构上不可逃逸）。此处对**最终拼接值**再断言一道同口径白名单，异常回空串
       （背景图缺失优于样式注入）。isSafeUrl 对 assets/comic/xxx.webp 与 sheet 串均放行。 */
    if (!isSafeUrl(url)) url = "";
    return "background-image:url(" + url + ")" + extra;
  }

  var ro = (typeof ResizeObserver !== "undefined")
    ? new ResizeObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) scheduleFit(entries[i].target);
      })
    : null;

  /* ★ P234（复审）：读写分离批处理——ResizeObserver/prepare 只入队，统一 flush：
     先读批（同帧连续几何读之间零写入 → 整批只触发一次布局）再写批（写后无读，零强制重排）。
     治「多卡同帧回调交替读写」的 layout thrashing。rAF 缺席环境（老 webview/探针）同步 flush。 */
  var _fitPending = [], _fitRaf = 0;
  function scheduleFit(el) {
    for (var i = 0; i < _fitPending.length; i++) if (_fitPending[i] === el) return;
    _fitPending.push(el);
    if (_fitRaf) return;
    if (typeof requestAnimationFrame === "undefined") { flushFits(); return; }
    _fitRaf = requestAnimationFrame(flushFits);
  }
  function flushFits() {
    _fitRaf = 0;
    var batch = _fitPending;
    _fitPending = [];
    var dims = [];
    for (var i = 0; i < batch.length; i++) {
      dims.push({ el: batch[i], w: batch[i].clientWidth, h: batch[i].clientHeight });
    }
    for (var j = 0; j < dims.length; j++) applyFit(dims[j].el, dims[j].w, dims[j].h);
  }

  /** ② 按容器实际尺寸把目标格以 cover 语义精确铺满（**纯写**；几何尺寸由批处理统一读入） */
  function applyFit(el, W, H) {
    var M = cfg();
    if (!M) return;
    var it = null;
    var tile = el.getAttribute("data-art-tile");
    if (tile) {
      var p = String(tile).split(",");
      it = tileOf({ s: +p[0], c: +p[1], r: +p[2] });   // ★ P254：格位数字守卫（脏值 → 视为无条目）
    } else {
      var src = el.getAttribute(SRC_ATTR);
      if (!src) return;
      var m = RE_COMIC.exec(src);
      if (!m) return;
      /* ★ P240（玩家反馈：事件卡插画发布包内全空白）：反解键必须走 bare() 归一——
         RE_COMIC 从 url("assets/comic/ec_training.webp") 捕获的是「ec_training」，
         而 M.map 的键是裸名「training」，此前直接查表恒 miss → applyFit 静默 return →
         背景保持单图 URL → 发布包内（comic 仅 2 张 loose）404 空白。
         本地双击页 comic 全量存在，单图也能加载 → 缺陷被完全掩盖，仅热点资讯端暴露。
         影响面：所有直发单图 URL 的渲染点（showCard/hub/transfer/nation_dev/
         club_events/chapters/flow）—— 一处修复全量恢复图集接管。 */
      it = M.map[bare(m[1])];
    }
    if (!it) return;                      // loose 图 / 未知键 / 脏格位 → 保持单图
    if (!W || !H) return;                 // 尚未布局，等 ResizeObserver 回调
    var g = gridOf(M);                    // ★ P254：网格数守卫
    /* ★ P254：本处是 url() 注入面的第二处（直接写 el.style.backgroundImage），
       同样走成品串守卫；构建产物被污染时不写可疑 URL，保持已渲染的安全单图。 */
    var sheet = safeUrl(M.dir + "sheet_" + pad3(it.s) + ".webp", "");
    if (!sheet) return;
    var S = Math.max(W, H);               // 每格显示边长（cover：短边铺满）
    el.style.backgroundImage = "url(" + sheet + ")";
    el.style.backgroundSize = (g * S) + "px " + (g * S) + "px";
    el.style.backgroundRepeat = "no-repeat";
    el.style.backgroundPosition =
      ((W - S) / 2 - it.c * S) + "px " + ((H - S) / 2 - it.r * S) + "px";
    el.setAttribute("data-art-sheet", String(it.s));
  }

  /** 首次遇到时记录来源，再定位 */
  function prepare(el) {
    if (el.getAttribute(SRC_ATTR)) return;
    var tile = el.style.getPropertyValue("--art-tile");
    if (tile) {
      el.setAttribute("data-art-tile", tile.trim());
      el.setAttribute(SRC_ATTR, "tile:" + tile.trim());
    } else {
      /* 老写法（硬编码 url(...)）→ 从背景图反解名字 */
      var bi = el.style.backgroundImage || "";
      if (!bi || bi.indexOf("assets/comic/") < 0) return;
      el.setAttribute(SRC_ATTR, bi);
    }
    scheduleFit(el);
    if (ro) ro.observe(el);
  }

  function scan(root) {
    if (!cfg() || !root || root.nodeType !== 1) return;
    if (root.matches && root.matches(SEL)) prepare(root);
    if (root.querySelectorAll) {
      var list = root.querySelectorAll(SEL);
      for (var i = 0; i < list.length; i++) prepare(list[i]);
    }
  }

  function boot() {
    if (typeof document === "undefined" || !document.body) return;
    if (!cfg()) return;                   // 未启用图集 → 什么都不做
    scan(document.body);
    new MutationObserver(function (recs) {
      for (var i = 0; i < recs.length; i++) {
        var added = recs[i].addedNodes;
        for (var j = 0; j < added.length; j++) scan(added[j]);
      }
    }).observe(document.body, { childList: true, subtree: true });
    if (!ro) {
      /* ★ P235（复审）：resize 高频触发防护——rAF 节流（同帧多次 resize 事件只扫描一次；
         本分支本就是无 ResizeObserver 的老环境降级，rAF 也缺席时保持直扫原行为） */
      var _scanRaf = 0;
      window.addEventListener("resize", function () {
        if (_scanRaf) return;
        if (typeof requestAnimationFrame === "undefined") { scan(document.body); return; }
        _scanRaf = requestAnimationFrame(function () {
          _scanRaf = 0;
          scan(document.body);
        });
      });
    }
  }

  /* ── ③ P240 插画图集预缓存 ────────────────────────────────────
     用户诉求：「正式进入游戏前预缓存好所有内容，以免卡顿看不见图片」。
     治两处空白/闪空白：
       a. sheet 未到就弹卡 → 插画短暂空白（首次命中率 100% 的新会话）；
       b. 反解/接管链路任何一环慢半拍时的过渡态裸露。
     策略：主菜单渲染后后台预载全部 sheet（并发 6，浏览器 HTTP 缓存命中时秒回、
     不浪费流量）；endings/redesign 低频大图与 BGM 不预载（按需加载）。
     失败静默——预载只是加速，运行时按需加载仍然兜底。 */
  function sheetUrls() {
    var M = cfg();
    if (!M) return [];
    var seen = {}, out = [];
    for (var k in M.map) {
      if (!Object.prototype.hasOwnProperty.call(M.map, k)) continue;
      var u = M.dir + "sheet_" + pad3(M.map[k].s) + ".webp";
      if (!seen[u]) { seen[u] = 1; out.push(u); }
    }
    var loose = M.loose || [];
    for (var i = 0; i < loose.length; i++) out.push("assets/comic/" + loose[i] + ".webp");
    return out;
  }
  function preloadAll(onProgress) {
    var urls = sheetUrls();
    var total = urls.length, done = 0, failed = 0;
    if (!total) {
      if (onProgress) { try { onProgress(0, 0, true); } catch (e) {} }
      return Promise.resolve({ total: 0, failed: 0 });
    }
    return new Promise(function (resolve) {
      var CONC = 6, idx = 0;
      function step() {
        done++;
        if (onProgress) { try { onProgress(done, total, done >= total); } catch (e) {} }
        if (done >= total) { resolve({ total: total, failed: failed }); return; }
        pump();
      }
      function pump() {
        while (idx < urls.length && idx - done < CONC) {
          var im = new Image();
          im.onload = step;
          im.onerror = function () { failed++; step(); };
          im.src = urls[idx++];
        }
      }
      pump();
    });
  }

  /* 供渲染层与审计/探针使用 */
  window.ArtSprite = {
    style: style,
    enabled: function () { return !!cfg(); },
    bare: bare,
    safeUrl: safeUrl,       // ★ P254：成品 URL 守卫（eventcards/card_host 共用，防口径漂移）
    isSafeUrl: isSafeUrl,   // ★ P254：探测用
    prepare: prepare,   // ★ P234：探针/渲染层可直接触发定位（走批处理）
    sheetUrls: sheetUrls,     // ★ P240：预缓存清单（探针断言用）
    preloadAll: preloadAll,   // ★ P240：全图集预缓存（主菜单阶段调用）
    /** 页面上所有插画元素 → { 图集名: sheet 号 } */
    sheets: function () {
      var out = {}, list = document.querySelectorAll(SEL);
      for (var i = 0; i < list.length; i++) {
        var s = list[i].getAttribute("data-art-sheet");
        if (s == null) continue;
        var m = RE_COMIC.exec(list[i].getAttribute(SRC_ATTR) || "");
        out[m ? m[1] : (list[i].getAttribute(SRC_ATTR) || "?")] = Number(s);
      }
      return out;
    },
    loose: function () { var M = cfg(); return M ? M.loose || [] : []; }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
