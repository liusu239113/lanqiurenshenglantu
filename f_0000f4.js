/* ============================================================
   ui/leaderboard.js — 传奇排行榜（热点资讯云排行，2026-09-02）
   三榜：生涯积分 / 生涯进球 / 完成生涯数；一人一条最佳（puid 只升不降）。
   数据源：window.ACTIVITY_API_BASE + ACTIVITY_ENV_ID（config.js 注入）；
   2026-09-18 S4 整改 + 精美化（对照篮球版）：
   ① 请求链路对齐篮球 2026-09-04 审计口径 —— cloud.auth 取 token →
      标准 SDK window.ColorboxAI.request 带鉴权 → 匿名只读 → 演示兜底；
      移除 cloud.request 变体与裸 fetch 降级（SDK 自带限流/熔断/429 处理）。
   ② show() 重写为全屏陈列页（原弹层 UI 从未被任何入口调用过，
      主菜单此前挂的是本地榜 LBLocal —— 本次接通 + 精美化）。
   ============================================================ */
(function () {
  'use strict';

  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const fmt = n => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  const LFB = window.LFB = window.LFB || {};
  LFB._user = null;          // {nickname, avatar}（同步时刷新）
  LFB._activeBoard = 'score';
  let _ovl = null;           // 全屏 overlay（可反复开关）

  /* ★ P288 审计加固（SR-005 评估）：apiBase 是运行时全局（config.js 构建期注入的
     腾讯云开发云函数网关，请求统一走 ColorboxAI.request；token 只经 ColorboxAI.cloud.auth
     平台登录态换取）。此处加运行时闸：①必须 https + CloudBase 网关 host 形态——
     全局被篡改/污染时拒用（cloudReady=false → 示例兜底），防 Bearer 外泄到外域；
     ②网关 host 必须含 ACTIVITY_ENV_ID（config 两键换环境必须同步改的单一真源约束）。 */
  const API_HOST_RE = /^https:\/\/[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)*\.app\.tcloudbase\.com\/?$/i;
  const apiBase = () => {
    const b = String(window.ACTIVITY_API_BASE || "");
    /* envId 必须紧跟协议头（slice(8) 跳过协议段）——config 两键换环境必须同步改的单一真源约束 */
    return (API_HOST_RE.test(b) && envId() && b.slice(8).indexOf(envId()) === 0) ? b : "";
  };
  const envId = () => window.ACTIVITY_ENV_ID || '';

  /* ---------- 云可用性 + token（对齐篮球整改口径） ---------- */
  /* ★ P267：供应商分发——热点资讯路径语义不变（boardProvider 已内含 ColorboxAI.request
     判定）；TapTap/Web 走 platform_web_ext.js 的 TDS 供应商；无底座 = false。 */
  LFB.cloudReady = function () {
    if (window.Platform && Platform.boardProvider) {
      const p = Platform.boardProvider();
      if (p === 'hupu') return !!(apiBase() && envId());
      if (p === 'tds') return true;
      return false;
    }
    return !!(window.ColorboxAI && typeof window.ColorboxAI.request === 'function' && apiBase() && envId());
  };
  LFB._cloudToken = function () {
    if (!(window.ColorboxAI && window.ColorboxAI.cloud
      && typeof window.ColorboxAI.cloud.auth === 'function' && envId())) {
      return Promise.resolve(null);
    }
    return window.ColorboxAI.cloud.auth({ envId: envId() })
      .then(a => (a && a.code === 200 && a.data && a.data.accessToken) ? a.data.accessToken : null)
      .catch(() => null);
  };

  /* ---------- 示例数据（云不可达时的看板兜底，标注「示例数据」） ---------- */
  const DEMO = [
    { rank: 1, player_name: '金州之翼', nickname: '热点资讯老哥_23', position: 'ST', style: '禁区之王', careers_count: 6, total_seasons: 18, career_goals: 512, honors_score: 2480, major_titles: 1, league_titles: 6 },
    { rank: 2, player_name: '红港球场之子', nickname: '红军永不眠', position: 'CAM', style: '组织核心', careers_count: 4, total_seasons: 16, career_goals: 388, honors_score: 1930, major_titles: 0, league_titles: 4 },
    { rank: 3, player_name: '白舰大球场的白', nickname: '美凌格老张', position: 'LW', style: '边路爆点', careers_count: 3, total_seasons: 15, career_goals: 341, honors_score: 1710, major_titles: 1, league_titles: 3 },
    { rank: 4, player_name: '蓝黑大球场之夜', nickname: '内拉祖里', position: 'ST', style: '全能前锋', careers_count: 3, total_seasons: 14, career_goals: 296, honors_score: 1490, major_titles: 0, league_titles: 3 },
    { rank: 5, player_name: '黄蜂巢球场', nickname: '黄黑之墙', position: 'CB', style: '防守支柱', careers_count: 2, total_seasons: 12, career_goals: 84, honors_score: 1180, major_titles: 0, league_titles: 2 },
    { rank: 6, player_name: '火枪手球场', nickname: 'COYG', position: 'CM', style: '中场节拍器', careers_count: 2, total_seasons: 10, career_goals: 121, honors_score: 860, major_titles: 0, league_titles: 1 },
  ];

  /* ---------- 数据获取：token 带鉴权 → 匿名只读 → 演示兜底 ----------
     mode: 'cloud'（容器内带鉴权全功能）| 'readonly'（匿名只读，上榜需容器登录态）| 'demo'（后端不可达）
     ★ P159 榜位校验：服务端在 board 未实现时会**回退默认榜**（实测 fb 线 score/goals/careers
       一律回显 "board":"pts" = 篮球得分榜）。回显 board ≠ 请求 board ⇒ 该榜云端未上线，
       数据无效 → 走 demo 兜底，**绝不能把别的榜的数据渲染给玩家**（跨运动串榜污染）。 */
  /* ★ P296：Tap 端官方榜直读（原生桥 loadLeaderboardScores，基础库 1.8.0+，无需 TDS 配置）。
     生涯积分榜=官方真实数据渲染进游戏内榜（demo 态消除）；好友榜集合仍走直达条官方 UI。
     Score{rank,score,user{name,avatar}} → 游戏 row schema 映射（无富字段，位置/季数留空）。 */
  LFB.tapBoard = function (nat, collection) {
    return new Promise(function (resolve) {
      try {
        nat.mgr.loadLeaderboardScores({
          leaderboardId: nat.id,
          maxSize: 50,
          collection: collection || 'public',
          callback: {
            onSuccess: function (res) {
              try {
                const arr = (res && res.scores) || [];
                const rows = arr.map(function (s) {
                  return {
                    rank: s.rank || 0,
                    player_name: (s.user && s.user.name) || 'TapTap 玩家',
                    nickname: 'TapTap',
                    avatar: (s.user && s.user.avatar && (s.user.avatar.smallUrl || s.user.avatar.mediumUrl || s.user.avatar.url)) || '',
                    honors_score: s.score || 0,
                  };
                });
                resolve({ rows: rows, mode: 'cloud' });
              } catch (eM) { resolve(null); }
            },
            onFailure: function () { resolve(null); },
          },
        });
      } catch (e) { resolve(null); }
    });
  };

  LFB.fetchBoard = async function (board) {
    /* ★ P296：Tap 原生榜分支（优先于 TDS REST——Tap 包 taptap_config.js 的 TDS 槽为空，
       cfg() 恒 null → 原 tds 链恒 demo，即玩家所报「未联网未上线」的根因）。 */
    const _nat = LFB.tapNative();
    if (_nat && typeof _nat.mgr.loadLeaderboardScores === 'function') {
      if (board === 'score') {
        const bd = await LFB.tapBoard(_nat, 'public');
        if (bd) return bd;
      }
      return { rows: DEMO, mode: 'demo' };
    }
    /* ★ P267：TDS 供应商（TapTap/Web 包）——行 schema 已在 ext 对齐渲染字段；
       自有榜类无跨运动串榜风险，故不需要热点资讯路径的 board 回显探测；
       失败统一落本文件持有的 DEMO 示例兜底（mode:'demo'）。 */
    if (window.Platform && Platform.boardProvider && Platform.boardProvider() === 'tds'
      && window.MFLTDS && typeof window.MFLTDS.fetchBoard === 'function') {
      const bd = await window.MFLTDS.fetchBoard(board);
      if (!bd || bd.mode === 'demo' || !Array.isArray(bd.rows)) return { rows: DEMO, mode: 'demo' };
      return bd;
    }
    const url = apiBase() + '/api/leaderboard/list?sport=fb&board=' + board + '&offset=0&limit=50';
    const boardMatches = body => !!(body && body.code === 200 && body.data && Array.isArray(body.data.rows) && body.data.board === board);
    if (LFB.cloudReady()) {
      // ① 容器内：cloud.auth 取 Bearer → 标准 SDK 带鉴权
      try {
        const token = await LFB._cloudToken();
        if (token) {
          const res = await window.ColorboxAI.request({ url, method: 'GET', headers: { Authorization: 'Bearer ' + token } });
          const body = res && res.data;
          if (res && res.statusCode === 200 && boardMatches(body)) {
            return { rows: body.data.rows, mode: 'cloud' };
          }
        }
      } catch (e) { /* 容器内鉴权/网络异常 → 匿名只读再试 */ }
      // ② 标准 SDK 匿名只读（纯 Web 由 SDK 内部回退，仍享限流熔断保护）
      try {
        const res = await window.ColorboxAI.request({ url, method: 'GET' });
        const body = res && res.data;
        if (res && res.statusCode === 200 && boardMatches(body)) {
          return { rows: body.data.rows, mode: 'readonly' };
        }
      } catch (e) { /* 网络异常走演示兜底 */ }
    }
    return { rows: DEMO, mode: 'demo' };
  };

  /* ---------- 登录态（昵称/头像） ---------- */
  LFB._fetchUser = function () {
    /* ★ P267：TDS/无底座环境无登录昵称（榜内 @游客；热点资讯路径不变） */
    if (window.Platform && Platform.boardProvider && Platform.boardProvider() !== 'hupu') {
      return Promise.resolve({});
    }
    const auth = window.ColorboxAI && window.ColorboxAI.auth;
    if (auth && typeof auth.getUserInfo === 'function') {
      return Promise.resolve(auth.getUserInfo()).then(r => {
        if (r && r.code === 200 && r.data && r.data.nickname) {
          return { nickname: String(r.data.nickname).slice(0, 12), avatar: r.data.avatar || r.data.userHeadUrl || '' };
        }
        return {};
      }).catch(() => ({}));
    }
    return Promise.resolve({});
  };

  /* ---------- 生涯快照（退役时组装；积分为服务端重算，客户端只报事实） ---------- */
  LFB.buildSnapshot = function (d) {
    const t = d.trophies || [];
    const cnt = re => t.filter(x => re.test(x.name)).length;
    return {
      sport: 'fb',
      nickname: (LFB._user && LFB._user.nickname) || (d.player && d.player.name) || '',
      avatar: (LFB._user && LFB._user.avatar) || '',
      player_name: (d.player && d.player.name) || '无名球员',
      position: (d.player && d.player.position) || '',
      style: (d.playStyle && d.playStyle.name) || '',
      careers_count: d.careersCompleted || 0,
      total_seasons: (d.stats && d.stats.seasonsPlayed) || 0,
      career_apps: (d.stats && d.stats.apps) || 0,
      career_goals: (d.stats && d.stats.goals) || 0,
      career_assists: (d.stats && d.stats.assists) || 0,
      best_season_rating: d.bestSeasonRating || 0,
      peak_ovr: (window.PlayerSystem && d.player) ? PlayerSystem.overall(d.player) : 0,
      league_titles: cnt(/冠军/) - cnt(/杯赛冠军|亚洲杯冠军|世界杯冠军|世界冠军/),
      cup_titles: cnt(/杯赛冠军/),
      major_titles: cnt(/亚洲杯冠军|世界杯冠军|世界冠军/),
      golden_boots: cnt(/金靴/),
      season_mvps: cnt(/金冕|最佳球员|MVP/),
      ending_title: '',
      game_version: '20260918',
    };
  };

  /* ---------- 退役静默同步（失败不打扰退役结算） ----------
     ★ P159：上报前先探测 fb 榜是否已在云端上线（list 回显 board 必须 === 'score'）。
       服务端 fb 榜未上线时 list 会回退默认榜（实测回显 "board":"pts"）——此时**不上报**，
       防足球快照被服务端回退语义错并进篮球默认榜（跨运动污染）。服务端上线 fb 榜后
       此探测自动通过，上报恢复，无需改码。 */
  LFB.syncCareer = function (d) {
    try {
      if (!LFB.cloudReady() || !d || !d.player) return Promise.resolve(false);
      /* ★ P267：TDS 供应商路径——快照直投自有榜类（三榜各自只升不降在 ext 内实现），
         无跨榜污染风险，不需要热点资讯路径的 fb 榜上线探测；失败静默下次再试。 */
      if (window.Platform && Platform.boardProvider && Platform.boardProvider() === 'tds'
        && window.MFLTDS && typeof window.MFLTDS.submit === 'function') {
        const snap = LFB.buildSnapshot(d);
        return window.MFLTDS.submit(snap).then(res => {
          if (res && res.improved) UIkit.toast('生涯成绩已同步至传奇排行榜', 'gold');
          return !!(res && res.ok);
        }).catch(() => false);
      }
      return LFB.fetchBoard('score').then(bd => {
        if (!bd || bd.mode === 'demo') return null;
        return LFB._fetchUser().then(u => {
          if (u.nickname) LFB._user = u;
          const snap = LFB.buildSnapshot(d);
          return LFB._cloudToken().then(token => {
            if (!token) return null;
            return window.ColorboxAI.request({
              url: apiBase() + '/api/leaderboard/submit', method: 'POST',
              headers: { Authorization: 'Bearer ' + token },
              data: snap,
            });
          });
        });
      }).then(res => {
        const body = res && res.data;
        if (res && res.statusCode === 200 && body && body.code === 200 && body.data && body.data.improved) {
          UIkit.toast('生涯成绩已同步至传奇排行榜', 'gold');
        }
      }).catch(() => { /* 静默：下次结算再试 */ });
    } catch (e) { return Promise.resolve(false); }
  };

  /* ---------- 榜单元数据 ---------- */
  const BOARD_META = [
    { key: 'score',   name: '生涯积分', desc: '荣誉+数据+年限综合（服务端重算，防篡改）', val: r => fmt(r.honors_score), unit: '生涯积分' },
    { key: 'goals',   name: '进球榜',   desc: '单生涯总进球',                             val: r => fmt(r.career_goals), unit: '生涯进球' },
    { key: 'careers', name: '传奇之路', desc: '完成的生涯数（退役次数）',                 val: r => fmt(r.careers_count), unit: '完成生涯' },
  ];

  /* ---------- 行卡（暗色精美版：名次徽章金银铜 + 头像渐变兜底 + 冠×N 徽章） ---------- */
  const AVA_BG = ['#e8c15a,#c89b3c', '#9fc4d8,#5a8fae', '#e0a58e,#b0705a', '#7fd4a2,#4d8a68', '#b8a7e8,#7a68a8', '#8a937f,#5f665a'];
  function rowHTML(r, idx) {
    const P = { accent: '#2e8a45', txt: '#1a241c', dim: '#67776a', card: '#ffffff' };
    const rankBg = idx === 0 ? '#e8c15a' : idx === 1 ? '#cfd8e3' : idx === 2 ? '#e0a58e' : 'transparent';
    const rankFg = idx < 3 ? '#241a02' : P.dim;
    const rankBorder = idx < 3 ? '1.5px solid rgba(26,36,28,.55)' : '1.5px solid rgba(26,36,28,.4)';
    /* ★ P226/P232（审计 SR）：头像域名白名单——只放行热点资讯系批准域（hupu.com / hoopchina.com.cn /
       hupucdn.com 后缀），其余一律走渐变字母兜底，阻断外部资源注入。
       ★ P232（复审）：onerror 内联字符串拼接移除——img 带 data-fb-g（渐变索引，纯数字）/
       data-fb-c（首字母 charCode，纯数字），加载失败由 _ovl 捕获委托 createElement+textContent
       构建兜底块——**零 HTML 字符串进事件处理器属性**，注入面清零。 */
    const _avaHost = (/^https:\/\/([^/?#]+)/.exec(r.avatar || '') || ['', ''])[1].toLowerCase();
    /* ★ P296：白名单增补 tapimg.com（TapTap 官方榜头像 CDN 域——原生榜 rows 自带头像，
       域不在白名单则永远走渐变字母兜底，榜上无脸不真实）。 */
    const safeAvatar = /(^|\.)(hupu\.com|hoopchina\.com\.cn|hupucdn\.com|tapimg\.com)$/.test(_avaHost) ? esc(r.avatar) : '';
    const gIdx = idx % AVA_BG.length;
    const g = AVA_BG[gIdx];
    const fbCode = String(r.player_name || '?').charCodeAt(0) || 63;   // 首字母 charCode（纯数字，零转义问题）
    const avatar = safeAvatar
      ? '<img src="' + safeAvatar + '" alt="" data-fb-g="' + gIdx + '" data-fb-c="' + fbCode + '" style="width:36px;height:36px;border-radius:10px;object-fit:cover;flex-shrink:0">'
      : '<div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(160deg,' + g + ');flex-shrink:0;display:flex;align-items:center;justify-content:center;color:rgba(13,19,15,.75);font-weight:900;font-size:14px">' + esc(String(r.player_name || '?').slice(0, 1)) + '</div>';
    const meta = BOARD_META.find(b => b.key === (LFB._activeBoard || 'score'));
    const rawVal = meta.val(r);
    const valText = (rawVal && rawVal !== 'undefined' && rawVal !== 'null') ? rawVal : '—';
    const trophies = (r.league_titles || 0) + (r.cup_titles || 0) + (r.major_titles || 0);
    const champBadge = trophies
      ? '<div style="font-size:9.5px;font-weight:900;background:rgba(201,150,46,.13);border:1px solid rgba(139,98,26,.5);color:#8a6216;border-radius:6px;padding:2px 6px;flex-shrink:0">冠×' + trophies + '</div>' : '';
    const wcBadge = (r.major_titles || 0)
      ? '<b style="color:#8a6216;font-size:9.5px">世界冠军</b> · ' : '';
    return '<div style="display:flex;align-items:center;gap:10px;background:'
      + (idx === 0 ? 'linear-gradient(135deg,#fdf6e0,#ffffff)' : '#ffffff') + ';'
      + 'border:' + (idx === 0 ? '2px solid rgba(139,98,26,.7)' : '1.5px solid rgba(26,36,28,.7)') + ';border-radius:13px;padding:10px 12px;'
      + 'box-shadow:' + (idx === 0 ? '2.5px 2.5px 0 rgba(139,98,26,.6);' : '2.5px 2.5px 0 rgba(26,36,28,.5);') + '">'
      + '<div style="width:28px;height:28px;border-radius:8px;background:' + rankBg + ';border:' + rankBorder + ';color:' + rankFg + ';font-weight:900;font-size:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0">' + (idx + 1) + '</div>'
      + avatar
      + '<div style="flex:1;min-width:0">'
      + '<div style="font-weight:900;font-size:13px;color:' + P.txt + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(r.player_name)
      + ' <span style="font-weight:600;font-size:10px;color:' + P.dim + '">@' + esc(r.nickname || '游客') + '</span></div>'
      + '<div style="font-size:10px;color:' + P.dim + ';margin-top:2px">' + wcBadge + esc(r.position || '') + (r.style ? ' · ' + esc(r.style) : '')
      + ' · ' + (r.total_seasons || 0) + ' 季 · ' + (r.career_apps || 0) + ' 场</div>'
      + '</div>'
      + champBadge
      + '<div style="text-align:right;min-width:62px;flex-shrink:0">'
      + '<div style="font-size:16px;font-weight:900;color:' + (idx === 0 ? '#b07d1e' : P.txt) + ';line-height:1.2">' + valText + '</div>'
      + '<div style="font-size:9px;color:' + P.dim + '">' + (valText === '—' ? '&nbsp;' : meta.unit) + '</div>'
      + '</div></div>';
  }

  /* ---------- ★ P274b TapTap 原生排行榜（官方 UI，总榜+好友榜切换） ----------
     tap.getLeaderboardManager 基础库 1.8.0+；leaderboardId 由 taptap_config.js 配置槽
     给出（后台创建排行榜后填入）。空 id / 非 tap 环境 = false，退回游戏内榜单。 */
  LFB.tapNative = function () {
    try {
      const t = window.tap;
      if (!t || typeof t.getLeaderboardManager !== "function") return null;
      const id = (window.TAPTAP_CONFIG && TAPTAP_CONFIG.leaderboardId) || "";
      if (!id) return null;
      const mgr = t.getLeaderboardManager();
      return (mgr && mgr.submitScores && mgr.openLeaderboard) ? { mgr: mgr, id: id } : null;
    } catch (e) { return null; }
  };
  /* 生涯积分提交（整数；官方榜 newBest 语义只升不降；失败静默——无积分惩罚面） */
  LFB.submitTap = function (score) {
    const nat = LFB.tapNative();
    if (!nat) return false;
    const sc = Math.max(0, Math.round(Number(score) || 0));
    try {
      nat.mgr.submitScores({
        scores: [{ leaderboardId: nat.id, score: sc }],
        callback: {
          onSuccess: function () { /* 最佳分已留档 */ },
          onFailure: function () { /* 500001/500002 等后台配置问题，静默 */ },
        },
      });
      return true;
    } catch (e) { return false; }
  };

  /* ---------- 全屏排行榜页（对照篮球版：页头 + 三榜 tab + 我的生涯条 + 口径脚注） ---------- */
  LFB.show = async function (onClose) {
    /* ★ P276（兄弟拍板）：默认永远游戏内原始榜单 UI；只有 taptap_config.nativeBoardUI
       === true 显式开启才切官方排行榜页。打开失败 → 静默回落游戏内榜单。
       ★ P285：Tap 端游戏内榜为 demo 态（TDS 云榜仅热点资讯端承载）——不强行切官方 UI，
       改为在游戏内榜单页顶部渲染「官方排行榜」直达条（见下方 _ovl 骨架注入）。 */
    const nat = (window.TAPTAP_CONFIG && TAPTAP_CONFIG.nativeBoardUI === true) ? LFB.tapNative() : null;
    if (nat) {
      try {
        nat.mgr.openLeaderboard({
          leaderboardId: nat.id,
          collection: "public",
          callback: { onSuccess: function () { }, onFailure: function () { } },
        });
        if (onClose) onClose();
        return;
      } catch (e) { /* 回落 */ }
    }
    if (_ovl) { _ovl.parentNode && _ovl.parentNode.removeChild(_ovl); _ovl = null; }
    LFB._activeBoard = LFB._activeBoard || 'score';
    const P = { accent: '#2e8a45', txt: '#1a241c', dim: '#67776a', card: '#ffffff' };
    _ovl = document.createElement('div');
    _ovl.style.cssText = 'position:fixed;inset:0;z-index:1200;overflow-y:auto;-webkit-overflow-scrolling:touch;'
      + 'background:linear-gradient(180deg,#f2f5ee,#e3ecdd);padding:1px 0 max(18px, env(safe-area-inset-bottom));';
    document.body.appendChild(_ovl);
    /* ★ P232（复审）：img 加载失败统一委托（error 不冒泡，捕获阶段可截）——
       兜底块 createElement + textContent 构建（首字母走 data-fb-c charCode），零 HTML 拼接 */
    _ovl.addEventListener('error', function (ev) {
      const img = ev.target;
      if (!img || img.tagName !== 'IMG' || img.dataset.fbC === undefined) return;
      const d = document.createElement('div');
      d.style.cssText = 'width:36px;height:36px;border-radius:10px;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:rgba(13,19,15,.75);font-weight:900;font-size:14px;background:linear-gradient(160deg,'
        + (AVA_BG[Math.abs(+img.dataset.fbG || 0) % AVA_BG.length] || AVA_BG[0]) + ')';
      d.textContent = String.fromCharCode(+img.dataset.fbC || 63);
      img.replaceWith(d);
    }, true);
    const ICO = window.ICO || function () { return ''; };
    /* ★ P285：tap 环境且原生榜可用 → 游戏内榜单页顶部渲染「官方排行榜」直达条
       （真实数据在官方榜：总榜+好友榜；游戏内云榜 Tap 端暂未承载）。 */
    const _tapNat = LFB.tapNative();
    const tapBar = _tapNat
      ? '<div data-lfnative="1" style="display:flex;align-items:center;gap:10px;background:#ffffff;border:1.5px solid rgba(26,36,28,.55);border-radius:12px;padding:11px 13px;margin-bottom:10px;box-shadow:2.5px 2.5px 0 rgba(26,36,28,.35);cursor:pointer">'
        + '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:900;color:' + P.txt + '">TapTap 官方排行榜 ▸</div>'
        + '<div style="font-size:10.5px;color:' + P.dim + ';margin-top:2px">真实生涯积分总榜 · 支持好友榜切换（退役后自动上传）</div></div>'
        + '<div style="font-size:11px;font-weight:900;color:' + P.accent + '">查看</div></div>'
      : '';
    _ovl.innerHTML = '<div style="max-width:560px;margin:0 auto;padding:20px 16px 30px">'
      + tapBar
      + '<div id="lfb-body" style="min-height:240px"><p style="text-align:center;color:' + P.dim + ';font-size:13px;padding:60px 0">加载中…</p></div>'
      + '</div>';
    if (_tapNat) {
      _ovl.addEventListener('click', function (ev) {
        const bar = ev.target && ev.target.closest ? ev.target.closest('[data-lfnative]') : null;
        if (!bar) return;
        try {
          _tapNat.mgr.openLeaderboard({
            leaderboardId: _tapNat.id,
            collection: 'public',
            callback: { onSuccess: function () { }, onFailure: function () { } },
          });
        } catch (e) { /* 原生面板打开失败静默 */ }
      });
    }
    _ovl.insertAdjacentHTML('beforeend', '');
    // 关闭按钮挂页头（render 后重挂，用事件委托）
    _ovl.addEventListener('click', function (ev) {
      if (ev.target && ev.target.id === 'lfb-close') {
        _ovl.parentNode && _ovl.parentNode.removeChild(_ovl); _ovl = null;
        if (onClose) onClose();
      }
    });

    const render = (data, mode, myRow) => {
      const MODE_TIP = {
        cloud: '',
        readonly: ' · <b style="color:#a5721a">浏览器只读模式</b>（上榜需在热点资讯 App 内游玩）',
        demo: window.tap
          ? ' · <b style="color:#a5721a">TapTap 端云端榜暂未上线 · 真实榜单见上方「TapTap 官方排行榜」</b>'
          : ' · <b style="color:#a5721a">示例数据（云端该榜暂未上线）</b>',
      };
      /* ★ P296：Tap 原生真实榜模式（tapReal）——官方榜只承载生涯积分一维，
       tabs 收敛为单榜（诚实呈现，不渲染点了没数据的空 tab）。 */
    const tapReal = !!(window.tap && LFB.tapNative() && typeof LFB.tapNative().mgr.loadLeaderboardScores === 'function');
    const _BM = tapReal ? BOARD_META.filter(b => b.key === 'score') : BOARD_META;
    const tabs = '<div style="display:flex;gap:7px;margin-top:12px">' + _BM.map(b =>
        '<div data-lfboard="' + b.key + '" style="flex:1;text-align:center;padding:9px 0;font-size:12.5px;font-weight:800;border-radius:10px;cursor:pointer;'
        + (b.key === LFB._activeBoard
          ? 'background:linear-gradient(135deg,#4db563,#2e8a45);color:#fff;box-shadow:2px 2px 0 rgba(26,36,28,.5);'
          : 'background:#ffffff;color:#1a241c;border:1.5px solid rgba(26,36,28,.6);')
        + '">' + b.name + '</div>').join('') + '</div>';
      const mine = myRow && myRow.ranked
        ? '<div style="display:flex;align-items:center;gap:10px;background:linear-gradient(135deg,rgba(240,207,126,.3),rgba(240,207,126,.12));border:1.5px solid rgba(139,98,26,.5);border-radius:12px;padding:11px 13px;margin-top:12px">'
          + '<span style="font-size:10px;letter-spacing:2px;color:' + P.accent + ';font-weight:900;flex-shrink:0">我的排名</span>'
          + '<span style="font-size:13px;font-weight:900;color:' + P.accent + '">第 ' + myRow.rank + ' 位</span>'
          + '<span style="font-size:11px;color:' + P.dim + '">/ ' + myRow.total + ' 人</span></div>'
        : (mode === 'cloud' ? '<div style="text-align:center;font-size:11px;color:' + P.dim + ';margin-top:12px">完成生涯退役后即可上榜</div>' : '');
      const rows = data.length
        ? data.map((r, i) => rowHTML(r, i)).join('')
        : '<div style="text-align:center;padding:36px 0;color:' + P.dim + '">'
          + '<div style="opacity:.55">' + ICO('cup', 30, '') + '</div>'
          + '<div style="font-weight:900;font-size:13px;color:' + P.txt + ';margin-top:8px">虚位以待</div>'
          + '<div style="font-size:10.5px;margin-top:4px">第一位上传生涯的玩家将永远留在这里</div></div>';
      // 我的生涯条（当前存档进行中）
      let mineBar = '';
      try {
        const save = window.State && State.peek ? State.peek(0) : null;
        if (save && save.player && !save.retired) {
          const d0 = save.data || save;
          mineBar = '<div style="display:flex;align-items:center;gap:10px;background:#ffffff;border:1.5px solid rgba(26,36,28,.55);border-radius:12px;padding:10px 13px;margin-top:10px;box-shadow:2.5px 2.5px 0 rgba(26,36,28,.35)">'
            + '<span style="font-size:10px;letter-spacing:2px;color:' + P.accent + ';font-weight:900;flex-shrink:0">我的生涯</span>'
            + '<div style="flex:1;min-width:0;font-size:12px;color:' + P.txt + '">'
            + esc((d0.player && d0.player.name) || '') + ' <span style="opacity:.6;font-size:10px">第' + esc((d0.date && d0.date.year) || d0.season || '?') + ' 季'
            + (window.PlayerSystem && d0.player ? ' · OVR ' + PlayerSystem.overall(d0.player) : '') + '</span></div>'
            + '<div style="font-size:9px;color:' + P.dim + ';max-width:130px;text-align:right">退役结算后正式上榜</div></div>';
        }
      } catch (e) { /* 无存档时不显示 */ }
      const body = _ovl.querySelector('#lfb-body');
      if (!body) return;
      body.innerHTML = ''
        + '<div style="display:flex;align-items:flex-start;gap:10px">'
        + '<button id="lfb-close" style="background:#ffffff;border:2px solid rgba(26,36,28,.8);color:#1a241c;border-radius:10px;padding:6px 12px;font-size:13px;font-weight:800;cursor:pointer;box-shadow:2.5px 2.5px 0 rgba(26,36,28,.8)">← 返回</button>'
        + '<div style="flex:1">'
        + '<div style="font-size:10px;letter-spacing:5px;color:#a5721a;font-weight:800">HALL OF LEGENDS</div>'
        + '<div style="font-size:25px;font-weight:900;font-style:italic;color:#1a241c;text-shadow:2px 2px 0 rgba(99,201,122,.45);margin-top:2px">' + ICO('crown', 20, '') + ' 传奇排行榜</div>'
        + '<div style="font-size:11px;color:' + P.dim + ';margin-top:3px">全服玩家生涯成就 · 退役结算自动登记'
        + ((window.Platform && Platform.boardProvider && Platform.boardProvider() === 'hupu') ? ' · 热点资讯昵称署名' : '')
        + '</div>'
        + '</div></div>'
        + tabs
        + '<div style="font-size:10px;color:' + P.dim + ';margin-top:9px">' + BOARD_META.find(b => b.key === LFB._activeBoard).desc + (MODE_TIP[mode] || '') + '</div>'
        + '<div style="display:flex;flex-direction:column;gap:8px;margin-top:10px">' + rows + '</div>'
        + mine + mineBar
        + '<div style="font-size:9.5px;color:' + P.dim + ';text-align:center;margin-top:14px;padding-top:10px;border-top:1px dashed rgba(26,36,28,.3);line-height:1.8">'
        + '每赛季结算与退役时自动同步 · 积分由服务端按成就重算<br>生涯积分含 联赛冠军 / 杯赛 / 洲际杯 / 世界杯 / 金靴 / 金冕 等成就加权</div>';

      body.querySelectorAll('[data-lfboard]').forEach(b => {
        b.onclick = UIkit.guard(async () => {
          LFB._activeBoard = b.getAttribute('data-lfboard');
          const bd = await LFB.fetchBoard(LFB._activeBoard);
          let my = null;
          if (LFB.cloudReady() && bd.mode === 'cloud') {
            try {
              /* ★ P267：TDS 供应商 → MFLTDS.me（设备码身份）；热点资讯原路径原样保留 */
              if (window.Platform && Platform.boardProvider && Platform.boardProvider() === 'tds'
                && window.MFLTDS && typeof window.MFLTDS.me === 'function') {
                my = await window.MFLTDS.me(LFB._activeBoard);
              } else {
                const token = await LFB._cloudToken();
                if (token) {
                  const res = await window.ColorboxAI.request({
                    url: apiBase() + '/api/leaderboard/me?sport=fb&board=' + LFB._activeBoard,
                    headers: { Authorization: 'Bearer ' + token },
                  });
                  const bb = res && res.data;
                  if (res && res.statusCode === 200 && bb && bb.code === 200 && bb.data) my = bb.data;
                }
              }
            } catch (e) { /* 忽略 */ }
          }
          render(bd.rows, bd.mode, my);
        }, '切换排行榜榜');
      });
    };

    const first = await LFB.fetchBoard(LFB._activeBoard);
    if (!_ovl || !_ovl.parentNode) return;   // 已被关闭
    render(first.rows, first.mode, null);
  };
})();
