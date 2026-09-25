/* ============================================================================
   platform_web_ext.js — Web/TapTap 平台扩展（P267）
   ─────────────────────────────────────────────────────────────────────────
   ★★★ 本文件只进 TapTap WebGL 发布包（打包脚本注入 <script> 引用）；
        热点资讯发布包物理不含本文件 —— 热点资讯审计口径（P255：只许 ColorboxAI.request
        通道、禁裸 fetch/XHR）由"发布包内无此代码"达成，而非运行时分支。

   ── 职责 ──
     1. 云 KV shim（window.__MFL_CLOUD_KV__）：与热点资讯 ColorboxAI.storage 同形
        （setValue({k:v})→Promise<{ok}>；getValue(k)→Promise<string|null>），
        底座 = TDS 数据存储 REST（LeanCloud 兼容协议）。core.js CloudStore 的
        150KB 分片 / 索引提交点（commit-flip）语义**原样复用**，此处不重复实现。
     2. 排行榜供应商（window.MFLTDS）：fetchBoard / submit / me，
        行 schema 与 leaderboard.js 的渲染字段（snake_case）对齐。
     3. 设备身份：本地生成 UUID（localStorage 持久），云键与榜记录都以它隔离。
        ★ 语义诚实：设备码身份 = 换设备/清数据后云端找不回（TapTap 版 MVP 口径，
          UI 文案已按此措辞）；将来接 TapTap 登录后可平滑换发身份键。

   ── 网络出口声明（本文件是 TapTap/Web 包内唯一允许的网络代码）──
     只访问 window.TAPTAP_CONFIG.tds.apiBase 指定的 TDS 数据存储域名
     （用户在 TapTap 开发者中心拿到的专属 API 域名）+ 无其他任何主机。
     传输：XMLHttpRequest（TapTap 内嵌浏览器环境，无 Colorbox SDK 可用）。

   ── TDS/LeanCloud REST 速记 ──
     查询  GET  {base}/1.1/classes/{cls}?where={..}&order=-{f}&limit=50&count=1
     新建  POST {base}/1.1/classes/{cls}
     更新  PUT  {base}/1.1/classes/{cls}/{objectId}
     头    X-LC-Id: appId / X-LC-Key: appKey / Content-Type: application/json
   ============================================================================ */
(function () {
  'use strict';

  /* ── 配置读取（三样齐全才启用；缺失时全部 API 走不可用降级）── */
  function cfg() {
    try {
      const c = window.TAPTAP_CONFIG || {};
      const t = c.tds || {};
      if (t.apiBase && t.appId && t.appKey) {
        return {
          base: String(t.apiBase).replace(/\/+$/, ""),
          appId: t.appId, appKey: t.appKey,
          clsKV: (c.classes && c.classes.kv) || "MFLKV",
          clsBoard: (c.classes && c.classes.board) || "MFLBoard",
        };
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  /* ── XHR（本文件唯一传输原语；恒 JSON；永不抛，失败 resolve {status:0}）── */
  function xhr(method, url, body) {
    return new Promise((resolve) => {
      let x = null;
      try { x = new XMLHttpRequest(); } catch (e) { resolve({ status: 0, data: null }); return; }
      const c = cfg();
      try {
        x.open(method, url, true);
        x.timeout = 20000;
        x.setRequestHeader("X-LC-Id", c.appId);
        x.setRequestHeader("X-LC-Key", c.appKey);
        x.setRequestHeader("Content-Type", "application/json;charset=utf-8");
      } catch (e) { resolve({ status: 0, data: null }); return; }
      x.onload = function () {
        let d = null;
        try { d = JSON.parse(x.responseText); } catch (e) { /* 非 JSON = 上层按失败处理 */ }
        resolve({ status: x.status, data: d });
      };
      x.onerror = function () { resolve({ status: 0, data: null }); };
      x.ontimeout = function () { resolve({ status: 0, data: null }); };
      try { x.send(body ? JSON.stringify(body) : null); }
      catch (e) { resolve({ status: 0, data: null }); }
    });
  }

  function enc(s) { return encodeURIComponent(s); }

  /* ★ P302：兑换网关专用 XHR（不带 TDS/LC 头——cfg() 未配置时 xhr() 不可用；
     恒 JSON；永不抛，失败 resolve {status:0}。仅消费 TAPTAP_CONFIG.redeemUrl 白名单 URL） */
  function xhrPlain(method, url, body) {
    return new Promise((resolve) => {
      let x = null;
      try { x = new XMLHttpRequest(); } catch (e) { resolve({ status: 0, data: null }); return; }
      try {
        x.open(method, url, true);
        x.timeout = 20000;
        x.setRequestHeader("Content-Type", "application/json;charset=utf-8");
      } catch (e) { resolve({ status: 0, data: null }); return; }
      x.onload = function () {
        let d = null;
        try { d = JSON.parse(x.responseText); } catch (e) { /* 非 JSON = 上层按失败处理 */ }
        resolve({ status: x.status, data: d });
      };
      x.onerror = function () { resolve({ status: 0, data: null }); };
      x.ontimeout = function () { resolve({ status: 0, data: null }); };
      try { x.send(body ? JSON.stringify(body) : null); }
      catch (e) { resolve({ status: 0, data: null }); }
    });
  }

  /* ── 设备身份（localStorage 持久 UUID）── */
  const DEV_KEY = "mfl_taptap_device_id";
  function deviceId() {
    try {
      let id = localStorage.getItem(DEV_KEY);
      if (!id) {
        id = genUuid();
        try { localStorage.setItem(DEV_KEY, id); } catch (e) { /* 只读环境：会话内仍可用 */ }
      }
      return id;
    } catch (e) { return "ephemeral-" + genUuid(); }
  }
  function genUuid() {
    try {
      const b = new Uint8Array(16);
      (window.crypto || window.msCrypto).getRandomValues(b);
      b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
      const h = Array.prototype.map.call(b, function (n) { return ("0" + n.toString(16)).slice(-2); }).join("");
      return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
    } catch (e) {
      return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (ch) {
        const r = Math.random() * 16 | 0;
        return (ch === "x" ? r : (r & 0x3 | 0x8)).toString(16);
      });
    }
  }

  /* ══════════ 云 KV（TDS 底座；与热点资讯 storage 同形）══════════
     objectId 会话内缓存：首写 GET(缺)→POST，后续 PUT 单跳。 */
  const _oid = {};   /* key -> objectId */
  const CloudKV = {

    _find(cls, key) {
      const c = cfg(); if (!c) return Promise.resolve(null);
      return xhr("GET", c.base + "/1.1/classes/" + cls + "?where=" + enc('{"key":' + JSON.stringify(key) + "}") + "&limit=1")
        .then(function (r) {
          if (r.status !== 200 || !r.data || !Array.isArray(r.data.results) || !r.data.results.length) return null;
          const rec = r.data.results[0];
          if (rec && rec.objectId) { _oid[key] = rec.objectId; return rec; }
          return null;
        });
    },

    _write(key, val) {
      const self = this;
      const c = cfg(); if (!c) return Promise.resolve({ ok: false });
      const body = { data: String(val == null ? "" : val), savedAt: Date.now() };
      const oid = _oid[key];
      const put = oid
        ? xhr("PUT", c.base + "/1.1/classes/" + c.clsKV + "/" + enc(oid), body)
        : self._find(c.clsKV, key).then(function (rec) {
            if (rec && rec.objectId) return xhr("PUT", c.base + "/1.1/classes/" + c.clsKV + "/" + enc(rec.objectId), body);
            const nb = Object.assign({ key: key }, body);
            return xhr("POST", c.base + "/1.1/classes/" + c.clsKV, nb);
          });
      return put.then(function (r) {
        if ((r.status === 200 || r.status === 201) && r.data && r.data.objectId) _oid[key] = r.data.objectId;
        return { ok: !!(r.status === 200 || r.status === 201) };
      }).catch(function () { return { ok: false }; });
    },

    /** 与热点资讯 setValue 同形：多键对象 → Promise<{ok}>（任一键失败 = ok:false） */
    setValue(obj) {
      const self = this;
      const keys = Object.keys(obj || {});
      if (!keys.length) return Promise.resolve({ ok: false });
      let p = Promise.resolve(true);
      let ok = true;
      keys.forEach(function (k) {
        p = p.then(function () {
          return self._write(k, obj[k]).then(function (r) { if (!r.ok) ok = false; });
        });
      });
      return p.then(function () { return { ok: ok }; });
    },

    /** 与热点资讯 getValue 同形：单键 → Promise<string|null> */
    getValue(key) {
      const c = cfg(); if (!c) return Promise.resolve(null);
      return this._find(c.clsKV, key).then(function (rec) {
        if (!rec) return null;
        const v = rec.data;
        return (typeof v === "string" && v.length) ? v : null;
      }).catch(function () { return null; });
    },
  };

  /* ══════════ 排行榜（TDS 底座）══════════
     一设备一记录（MFLBoard.deviceId）；三榜各自"只升不降"；展示字段取最近一次退役快照。
     score 口径（TDS 榜自成体系，与热点资讯服务端重算分互不混用）：
       score = 世界冠军×1000 + 联赛冠军×300 + 杯赛×150 + 金靴×80 + 金冕/MVP×60
             + peakOVR×5 + 生涯进球×2 + 生涯出场 + 生涯季数×15                       */
  const BOARD_FIELD = { score: "score", goals: "careerGoals", careers: "careersCount" };

  function scoreOf(r) {
    return (r.major_titles || 0) * 1000 + (r.league_titles || 0) * 300 + (r.cup_titles || 0) * 150
      + (r.golden_boots || 0) * 80 + (r.season_mvps || 0) * 60
      + (r.peak_ovr || 0) * 5 + (r.career_goals || 0) * 2 + (r.career_apps || 0) + (r.total_seasons || 0) * 15;
  }

  /* TDS 记录字段 ↔ leaderboard 渲染 schema（snake_case）互转 */
  const S2R = {
    player_name: "playerName", position: "position", style: "style",
    careers_count: "careersCount", total_seasons: "totalSeasons", career_apps: "careerApps",
    career_goals: "careerGoals", career_assists: "careerAssists",
    best_season_rating: "bestSeasonRating", peak_ovr: "peakOvr",
    league_titles: "leagueTitles", cup_titles: "cupTitles", major_titles: "majorTitles",
    golden_boots: "goldenBoots", season_mvps: "seasonMvps",
  };
  function snapToRecord(snap) {
    const rec = {};
    for (const k in S2R) rec[S2R[k]] = Number(snap[k]) === Number(snap[k]) ? Number(snap[k]) : 0;
    rec.playerName = String(snap.player_name || "无名球员").slice(0, 24);
    rec.style = String(snap.style || "");
    rec.position = String(snap.position || "");
    rec.score = scoreOf(snap);
    return rec;
  }
  function recordToRow(rec) {
    const row = { nickname: rec.nickname || "", avatar: "" };
    for (const k in S2R) row[k] = rec[S2R[k]] != null ? rec[S2R[k]] : 0;
    row.player_name = rec.playerName || "无名球员";
    row.honors_score = rec.score != null ? rec.score : 0;
    return row;
  }

  const MFLTDS = {

    /** 拉榜：{rows:[渲染 schema], mode:'cloud'}；失败由调用方落 demo 兜底（rows:null） */
    fetchBoard(board) {
      const c = cfg(); if (!c) return Promise.resolve({ rows: null, mode: "demo" });
      const f = BOARD_FIELD[board] || "score";
      return xhr("GET", c.base + "/1.1/classes/" + c.clsBoard + "?order=-" + f + "&limit=50")
        .then(function (r) {
          if (r.status !== 200 || !r.data || !Array.isArray(r.data.results)) return { rows: null, mode: "demo" };
          const seen = {};
          const rows = [];
          r.data.results.forEach(function (rec) {
            if (rec.deviceId) { if (seen[rec.deviceId]) return; seen[rec.deviceId] = 1; }   /* 同设备竞态重复记录去重 */
            rows.push(recordToRow(rec));
          });
          return { rows: rows, mode: "cloud" };
        }).catch(function () { return { rows: null, mode: "demo" }; });
    },

    /** 退役同步：三榜各自只升不降；展示字段取本快照。resolve({improved, ok}) */
    submit(snap) {
      const c = cfg(); if (!c || !snap) return Promise.resolve({ ok: false, improved: false });
      const rec = snapToRecord(snap);
      const dev = deviceId();
      return xhr("GET", c.base + "/1.1/classes/" + c.clsBoard + "?where=" + enc('{"deviceId":' + JSON.stringify(dev) + "}") + "&limit=1")
        .then(function (r) {
          if (r.status !== 200 || !r.data) return { ok: false, improved: false };
          const existing = (r.data.results && r.data.results[0]) || null;
          let improved = false;
          if (!existing) {
            rec.deviceId = dev;
            rec.nickname = "";
            rec.updatedAt = Date.now();
            return xhr("POST", c.base + "/1.1/classes/" + c.clsBoard, rec)
              .then(function (pr) { return { ok: pr.status === 201, improved: pr.status === 201 }; });
          }
          /* 三榜指标：只升不降，任一升高 = improved（上榜判定依据） */
          ["careersCount", "careerGoals", "score"].forEach(function (f) {
            const nv = rec[f] || 0, ov = existing[f] || 0;
            if (nv > ov) { improved = true; existing[f] = nv; } else { rec[f] = ov; }
          });
          /* 荣誉柜字段：同样只升不降（奖杯是累计成就，不随较差的新生涯回退）；
             姓名/位置/球风/季数/出场 = 展示字段，取最近一次退役快照。 */
          ["leagueTitles", "cupTitles", "majorTitles", "goldenBoots", "seasonMvps", "peakOvr"].forEach(function (f) {
            const nv = rec[f] || 0, ov = existing[f] || 0;
            if (nv > ov) existing[f] = nv; else rec[f] = ov;
          });
          const body = Object.assign({}, rec, { updatedAt: Date.now() });
          return xhr("PUT", c.base + "/1.1/classes/" + c.clsBoard + "/" + enc(existing.objectId), body)
            .then(function (pr) { return { ok: pr.status === 200, improved: improved }; });
        }).catch(function () { return { ok: false, improved: false }; });
    },

    /** 我的排名：{ranked:true, rank, total} | null（未上榜/失败） */
    me(board) {
      const c = cfg(); if (!c) return Promise.resolve(null);
      const f = BOARD_FIELD[board] || "score";
      const dev = deviceId();
      return xhr("GET", c.base + "/1.1/classes/" + c.clsBoard + "?where=" + enc('{"deviceId":' + JSON.stringify(dev) + "}") + "&limit=1")
        .then(function (r) {
          const mine = (r.status === 200 && r.data && r.data.results && r.data.results[0]) || null;
          if (!mine) return null;
          const myVal = mine[f] || 0;
          const w = encodeURIComponent('{"' + f + '":{"$gt":' + myVal + "}}");
          const wAll = encodeURIComponent("{}");
          return Promise.all([
            xhr("GET", c.base + "/1.1/classes/" + c.clsBoard + "?where=" + w + "&count=1&limit=0"),
            xhr("GET", c.base + "/1.1/classes/" + c.clsBoard + "?where=" + wAll + "&count=1&limit=0"),
          ]).then(function (rs) {
            const better = (rs[0].status === 200 && rs[0].data && rs[0].data.count) || 0;
            const total = (rs[1].status === 200 && rs[1].data && rs[1].data.count) || 1;
            return { ranked: true, rank: better + 1, total: total };
          });
        }).catch(function () { return null; });
    },
  };

  /* ══════════ 兑换码（P302 [Tap]：永久免广告 · 一码一人）══════════
     服务端 = CloudBase HTTP 网关 /api/redeem（wba_redeem_code 云函数 MFL 分支，
     独立表 mfl_redeem_codes；一码一用 + uid 绑定 + 限频全部服务端权威执行）。
     ★ 网络出口声明（承接本文件头部唯一网络代码口径）：本模块只访问下方
     TAPTAP_CONFIG.redeemUrl（完整 URL 前缀白名单，正则锚定 *.app.tcloudbase.com/api/redeem），
     不访问任何其他主机。兑换需联网一次；激活后离线永久生效（本机 LS 持久 +
     uid/卡随存档云端走，换机恢复存档后 check 自动恢复）。 */
  /* ★ 网关 URL 来自 TAPTAP_CONFIG.redeemUrl（渠道配置槽，本文件零主机字面量——
     S5 审计口径：出口=运行时配置；此处仅按正则锚定形态合法性）。 */
  function redeemUrl() {
    try {
      const u = (window.TAPTAP_CONFIG || {}).redeemUrl;
      return (typeof u === "string" && /^https:\/\/[a-z0-9.-]+\.app\.tcloudbase\.com\/api\/redeem$/.test(u)) ? u : "";
    } catch (e) { return ""; }
  }
  const REDEEM_HOST_OK = !!redeemUrl();
  const REDEEM_CHARSET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";   /* 31 chars, no 0/O/1/I/L */
  const REDEEM_CARD_KEY = "mfl_redeem_card";
  const REDEEM_UID_KEY = "mfl_taptap_redeem_uid";

  /* CRC8（poly 0x07）与云函数 / gen_codes_mfl.py 三端同构（客户端预检乱输入） */
  function redeemCrc8(str) {
    let crc = 0;
    for (let i = 0; i < str.length; i++) {
      crc ^= str.charCodeAt(i) & 0xff;
      for (let b = 0; b < 8; b++) crc = (crc & 0x80) ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
    }
    return crc;
  }
  /** 归一化 + CRC 预检：MFL + 12 位（展示 MFL-XXXX-XXXX-XXXX）→ 无连字符串或 null */
  function redeemNormalize(raw) {
    if (typeof raw !== "string") return null;
    const s = String(raw).toUpperCase().replace(/[\s-]/g, "");
    if (!/^MFL[0-9A-Z]{12}$/.test(s)) return null;
    for (const ch of s) {
      if (!"MFL".includes(ch) && !REDEEM_CHARSET.includes(ch)) return null;
    }
    if (s.charAt(14) !== REDEEM_CHARSET.charAt(redeemCrc8(s.slice(0, 14)) % REDEEM_CHARSET.length)) return null;
    return s;
  }
  function redeemReadCard() {
    try {
      const raw = localStorage.getItem(REDEEM_CARD_KEY);
      if (!raw) return null;
      const p = JSON.parse(raw);
      return (p && p.permanent && p.codeTail) ? p : null;
    } catch (e) { return null; }
  }
  function redeemWriteCard(card) {
    try { localStorage.setItem(REDEEM_CARD_KEY, JSON.stringify(card)); } catch (e) { /* 只读环境忽略 */ }
  }
  /** 兑换绑定主键：存档 meta.redeemUid（随云存档走，换机恢复）→ 本机持久 uid → 现生成 */
  function redeemUid() {
    try {
      if (window.State && State.data && State.data.meta && State.data.meta.redeemUid) {
        return String(State.data.meta.redeemUid).slice(0, 64);
      }
    } catch (e) { /* ignore */ }
    try {
      let id = localStorage.getItem(REDEEM_UID_KEY);
      if (!id) {
        id = "u" + genUuid().replace(/-/g, "").slice(0, 17);
        try { localStorage.setItem(REDEEM_UID_KEY, id); } catch (e2) { /* 会话内仍可用 */ }
      }
      return id;
    } catch (e) { return "u" + genUuid().replace(/-/g, "").slice(0, 17); }
  }
  /** 激活落盘：本机 LS + 随存档云端走（meta.redeemUid / meta.redeemCard） */
  function redeemActivate(card, uid) {
    redeemWriteCard(card);
    try {
      if (window.State && State.data && State.data.meta) {
        State.data.meta.redeemUid = uid;
        State.data.meta.redeemCard = { codeTail: card.codeTail, activatedAt: card.activatedAt };
        if (State.data.player && State.data.clubId && State.isNew === false && typeof State.save === "function") State.save(true);
      }
    } catch (e) { /* ignore */ }
  }

  const MFLRedeem = {
    available() { return REDEEM_HOST_OK; },
    /** 广告闸消费点：永久免广卡是否生效（免看直领；各点位次数限制仍在调用方） */
    active() {
      const c = redeemReadCard();
      if (c && c.permanent) return true;
      try {
        if (window.State && State.data && State.data.meta && State.data.meta.redeemCard) return true;
      } catch (e) { /* ignore */ }
      return false;
    },
    cardTail() {
      const c = redeemReadCard();
      if (c) return c.codeTail || "";
      try {
        const m = window.State && State.data && State.data.meta && State.data.meta.redeemCard;
        return (m && m.codeTail) || "";
      } catch (e) { return ""; }
    },
    /** 兑换：resolve({ok, err?, permanent?, codeTail?})；err 与篮球 ERR_MSG 语义对齐 */
    redeem(rawCode) {
      const code = redeemNormalize(rawCode);
      if (!code) return Promise.resolve({ ok: false, err: "FORMAT" });
      if (!REDEEM_HOST_OK) return Promise.resolve({ ok: false, err: "OFFLINE_UNAVAILABLE" });
      const uid = redeemUid();
      return xhrPlain("POST", redeemUrl(), { action: "redeem", code: code, uid: uid }).then(function (r) {
        const resp = r.data;
        if (r.status === 200 && resp && resp.ok && resp.permanent) {
          const card = { permanent: true, codeTail: resp.codeTail || code.slice(-4), activatedAt: Date.now() };
          redeemActivate(card, uid);
          return { ok: true, permanent: true, codeTail: card.codeTail };
        }
        return { ok: false, err: (resp && resp.err) || (r.status === 0 ? "NETWORK" : "SERVER_ERR") };
      }).catch(function () { return { ok: false, err: "NETWORK" }; });
    },
    /** 换机/重装恢复：check(uid) → 服务端有永久卡则本地激活。resolve(bool) */
    checkRemote() {
      if (!REDEEM_HOST_OK) return Promise.resolve(false);
      if (MFLRedeem.active()) return Promise.resolve(true);
      const uid = redeemUid();
      return xhrPlain("POST", redeemUrl(), { action: "check", uid: uid }).then(function (r) {
        const resp = r.data;
        if (r.status === 200 && resp && resp.ok && resp.card && resp.card.permanent) {
          redeemActivate({ permanent: true, codeTail: resp.card.codeTail, activatedAt: Date.now() }, uid);
          return true;
        }
        return false;
      }).catch(function () { return false; });
    },
  };
  window.MFLRedeem = MFLRedeem;

  /* ── 注册（platform.js 以这些全局为开关，命名勿改）── */
  window.__MFL_PLATFORM_EXT__ = true;
  window.__MFL_CLOUD_KV__ = CloudKV;
  window.MFLTDS = MFLTDS;
})();
