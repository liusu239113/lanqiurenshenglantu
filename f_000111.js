/* ============================================================================
   v2/legacy_hall.js — 传奇陈列室（S4，2026-09-18 对照篮球版 LegacyHall v3）
   十席之墙：生涯退役时玩家决定是否收藏（空位存入 / 覆盖已有席位）；
   localStorage 独立键 mfl_legacy_hall_v1 —— 清档不清陈列室。
   荣誉分：足球化口径（世界杯×400 / 立像×300 / 亚洲杯×200 / 洲际杯×150 /
   联赛冠军×100 / 杯赛×60 / 金冕×50 / 金靴×40 …），本文件为唯一真值源。
   详情页三标签：荣誉殿堂 / 荣誉奖杯柜(SVG 金杯·标注年份) / 生涯年鉴(逐季评级)。
   二次分享：shareState 反向快照 → SharePoster.share 终章海报（老档可再晒）。
   ============================================================================ */
(function () {
  'use strict';

  const KEY = 'mfl_legacy_hall_v1';
  const MAX = 10;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const LH = {};
  let lastSave = null;   // 本次生涯最近存档席位：{ slot } 或 null（退役页消费）

  /* ── 配色：跟随主题（与分享海报同源；变量缺失时兜底暗金） ── */
  function pal() {
    /* P124：页面固定「绿茵殿堂」亮色 UI，与主菜单统一；分享海报仍走 Theme.poster（脱钩） */
    return { bg: '#f2f5ee', card: '#ffffff', accent: '#2e8a45', txt: '#1a241c', dim: '#67776a', chipBg: '#e8f0e4' };
  }

  /* ── 存储 ── */
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { v: 1, slots: new Array(MAX).fill(null) };
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.slots)) {
        while (data.slots.length < MAX) data.slots.push(null);
        return data;
      }
      return { v: 1, slots: new Array(MAX).fill(null) };
    } catch (e) { return { v: 1, slots: new Array(MAX).fill(null) }; }
  }
  function persist(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); return true; }
    catch (e) { console.warn('[LegacyHall] 存储失败', e); return false; }
  }

  LH.slots = function () { return load().slots.slice(); };
  LH.count = function () { return load().slots.filter(Boolean).length; };
  LH.list = function () { return load().slots.filter(Boolean).sort((a, b) => (b.score || 0) - (a.score || 0)); };
  LH.lastSave = function () { return lastSave; };

  /* ── 荣誉分（足球化口径；trophies 为 [{name, season}]） ── */
  const SCORE_RULES = [
    [/^世界杯冠军$/, 400], [/^世界杯金靴$/, 80], [/^世界杯MVP$/, 80],
    [/^世界杯金手套$/, 80],        // P133：门将专属，与金靴/MVP 同级（现实对标雅辛奖）
    [/^亚洲杯冠军$/, 200], [/^亚洲杯MVP$/, 50], [/^亚洲杯金靴$/, 40],
    [/^洲际冠军杯$/, 150], [/^洲际二级杯$/, 80],
    [/^球俱杯$/, 150], [/^球俱挑战杯$/, 80],   // P213：中国玩家的世俱杯平行物（与洲际冠军杯/洲际二级杯同分）
    [/^欧冠$/, 150], [/^欧联$/, 80], [/^亚冠$/, 150], [/^亚冠2$/, 80],   // P295：大陆真实口径新杯名（与 P213 中立名同分）
    [/^国内杯赛冠军$/, 60],        // ★ 必须在 冠军$ 通配之前（探针 _p123 抓过顺序 bug）
    [/冠军$/, 100],                // 联赛冠军（“XX联赛冠军”）
    [/^金冕奖$/, 50], [/^联赛金靴$/, 40], [/^联赛助攻王$/, 25],
    [/^联赛最佳门将$/, 25],        // P133：门将专属，与助攻王同级
    [/^赛季最佳阵容$/, 20], [/^联赛最佳新人$/, 15],
    [/^一生一队$/, 30], [/^晋级\d+世界杯$/, 20],
    [/\d+世界杯参赛$/, 10],        // P133：参赛荣誉补分（低于晋级 20，倒挂修正）
  ];
  LH.scoreOf = function (trophies, statue) {
    const t = trophies || [];
    let score = statue ? 300 : 0;
    t.forEach(x => {
      const name = String((x && x.name) || '');
      for (const [re, pts] of SCORE_RULES) {
        if (re.test(name)) { score += pts; break; }
      }
    });
    return score;
  };
  /** 冠军类奖杯（奖杯柜展示，按分量级分色） */
  function champClass(name) {
    if (/^世界杯冠军$/.test(name)) return 'wc';
    if (/^亚洲杯冠军$/.test(name)) return 'ac';
    if (/^洲际冠军杯$/.test(name) || /^球俱杯$/.test(name) || /^欧冠$/.test(name) || /^亚冠$/.test(name)) return 'cc';   // P213 球俱杯 / P295 欧冠亚冠 同色级
    if (/^国内杯赛冠军$/.test(name)) return 'cup';
    if (/冠军$/.test(name)) return 'league';
    return null;
  }

  /* ── 构造入馆条目（退役结算 ret = Career.retire 返回值） ── */
  LH.buildEntry = function (state, ret) {
    if (!state || !state.data || !ret) return null;
    const d = state.data;
    const p = d.player || {};
    const s = ret.stats || {};
    const e = ret.ending || ret.tier || { name: '职业球员', line: '平凡而真实的足球人生', desc: '', art: 'assets/redesign/evt_retirement.webp' };
    const trophies = (d.trophies || []).map(t => ({ name: t.name, season: t.season }));
    const isGK = p.position === 'GK';
    // 冠军年（奖杯柜标注）
    const champYears = [];
    (d.trophies || []).forEach(t => { const cls = champClass(String(t.name || '')); if (cls) champYears.push({ name: t.name, season: t.season, cls: cls }); });
    // 逐季档案（season_report.recordSeason 每季写入；旧档可能为空 → 年鉴降级提示）
    const log = (d.seasonHistory || []).map(r => ({
      s: r.season, team: r.team || '', rank: r.rank || 0, res: r.resultText || '',
      apps: r.apps || 0, goals: r.goals || 0, assists: r.assists || 0, saves: r.saves || 0,
      rating: r.rating || 0, motm: r.motm || 0, ovr: r.ovr || 0,
      grade: r.grade || '', title: r.title || '',
    }));
    return {
      id: 'lh_' + Date.now() + '_' + Math.floor(Math.random() * 1e6),
      at: (function () { const t = new Date(); return t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2) + '-' + ('0' + t.getDate()).slice(-2); })(),
      name: p.name || '无名传奇',
      pos: p.position || '',
      number: p.number || p.jersey || '',
      age: p.age || 0,
      team: (window.teamById && teamById(d.clubId) || {}).name || '',
      seasons: d.season || 0,
      apps: s.apps || 0, goals: s.goals || 0, assists: s.assists || 0, saves: s.saves || 0,
      cleanSheets: s.cleanSheets || 0,
      rating: s.apps ? Math.round(s.ratingSum / s.apps * 10) / 10 : 0,
      motm: s.motm || 0,
      peakOvr: (window.PlayerSystem && p) ? PlayerSystem.overall(p) : 0,
      legacy: ret.legacy || 0,
      score: LH.scoreOf(d.trophies, ret.statue),
      statue: !!ret.statue,
      captain: !!(d.intl && d.intl.captain),
      endingName: e.name || '生涯谢幕',
      endingLine: e.line || '',
      endingDesc: e.desc || '',
      endingArt: e.art || 'assets/redesign/evt_retirement.webp',
      trophies: trophies,
      champYears: champYears,
      log: log,
      isGK: isGK,
      wageEarned: ret.wageEarned || 0,
      car: ret.car || '',
      home: ret.home || '',
      /* 二次分享最小快照：SharePoster.build 消费的最小 state.data + ret */
      shareState: {
        player: { name: p.name || '', position: p.position || '', number: p.number || p.jersey || '', age: p.age || 0 },
        clubId: d.clubId || '',
        date: { year: (d.date && d.date.year) || d.season || '' },
        trophies: trophies.map(t => ({ name: t.name })),
        history: { pastClubs: new Array(Math.max(0, ((d.history && d.history.pastClubs) || []).length)).fill(1) },
        intl: { career: (d.intl && d.intl.career) || { apps: 0, goals: 0 }, captain: !!(d.intl && d.intl.captain) },
      },
      shareRet: {
        ending: { name: e.name || '生涯谢幕', line: e.line || '', desc: e.desc || '', art: e.art || 'assets/redesign/evt_retirement.webp' },
        stats: { apps: s.apps || 0, goals: s.goals || 0, assists: s.assists || 0, saves: s.saves || 0, cleanSheets: s.cleanSheets || 0, ratingSum: s.ratingSum || 0 },
        legacy: ret.legacy || 0,
        wageEarned: ret.wageEarned || 0,
        car: ret.car || '',
      },
    };
  };

  /** 存入指定席位（1-based）：空位=存入，占据=覆盖 */
  LH.saveAt = function (slot, entry) {
    const idx = Number(slot) - 1;
    if (!(idx >= 0 && idx < MAX) || !entry) return false;
    const data = load();
    data.slots[idx] = entry;
    lastSave = { slot: idx + 1 };
    return persist(data);
  };
  LH.remove = function (id) {
    const data = load();
    const idx = data.slots.findIndex(e => e && e.id === id);
    if (idx < 0) return false;
    data.slots[idx] = null;
    return persist(data);
  };

  /* ── 二次分享：entry → SharePoster（终章海报） ── */
  LH.shareEntry = function (e) {
    try {
      if (!(window.SharePoster && SharePoster.share)) { UIkit.toast('分享暂不可用', 'red'); return; }
      SharePoster.share({ data: JSON.parse(JSON.stringify(e.shareState)) }, JSON.parse(JSON.stringify(e.shareRet)));
    } catch (err) { console.warn('[LegacyHall] share fail', err); UIkit.toast('分享失败：' + (err.message || err), 'red'); }
  };

  /* ══════════ UI 工具 ══════════ */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtN = n => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const ICO = window.ICO || function () { return ''; };
  let _ovl = null;      // 陈列室主页 overlay
  let _ovl2 = null;     // 详情页 overlay

  function openOverlay(z) {
    const o = document.createElement('div');
    o.style.cssText = 'position:fixed;inset:0;z-index:' + z + ';overflow-y:auto;-webkit-overflow-scrolling:touch;'
      + 'background:linear-gradient(180deg,#f2f5ee,#e3ecdd);padding:1px 0 max(18px, env(safe-area-inset-bottom));';
    document.body.appendChild(o);
    return o;
  }
  function closeOverlay(o) { if (o && o.parentNode) o.parentNode.removeChild(o); }

  const GRADE_COLOR = { SSS: '#ffd75e', SS: '#e8c15a', S: '#7fd4a2', A: '#9fc4d8', B: '#8a937f', C: '#6f7568' };
  function gradeChip(g) {
    if (!g) return '';
    const c = GRADE_COLOR[g] || '#8a937f';
    return '<span style="font-weight:900;font-size:12px;color:' + c + ';border:1.5px solid ' + c + ';border-radius:6px;padding:2px 8px;flex-shrink:0">' + esc(g) + '</span>';
  }

  /* ══════════ 主页：十席之墙 ══════════ */
  LH.show = function (onClose) {
    if (_ovl) closeOverlay(_ovl);
    const P = pal();
    const slots = LH.slots();
    const occ = slots.filter(Boolean);
    _ovl = openOverlay(1200);

    let html = '<div style="max-width:560px;margin:0 auto;padding:20px 16px 8px">';
    // 页头
    html += '<div style="display:flex;align-items:flex-start;gap:10px">'
      + '<button id="lh-back" style="background:#ffffff;border:2px solid rgba(26,36,28,.8);color:#1a241c;border-radius:10px;padding:6px 12px;font-size:13px;font-weight:800;cursor:pointer;box-shadow:2.5px 2.5px 0 rgba(26,36,28,.8)">← 返回</button>'
      + '<div style="flex:1">'
      + '<div style="font-size:10px;letter-spacing:5px;color:#a5721a;font-weight:800">LEGACY HALL</div>'
      + '<div style="font-size:25px;font-weight:900;font-style:italic;color:#1a241c;text-shadow:2px 2px 0 rgba(99,201,122,.45);margin-top:2px">' + ICO('crown', 20, '') + ' 传奇陈列室</div>'
      + '<div style="font-size:11px;color:' + P.dim + ';margin-top:3px">十席之墙 · ' + occ.length + '/10 席已收藏 · 清档不清陈列室</div>'
      + '</div></div>';
    // 镇馆汇总条
    if (occ.length) {
      const sumWC = occ.reduce((a, e) => a + (e.trophies || []).filter(t => t.name === '世界杯冠军').length, 0);
      const sumLG = occ.reduce((a, e) => a + (e.champYears || []).filter(c => c.cls === 'league').length, 0);
      const sumBoot = occ.reduce((a, e) => a + (e.trophies || []).filter(t => /金靴/.test(t.name)).length, 0);
      const best = occ.reduce((a, e) => Math.max(a, e.score || 0), 0);
      html += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:14px 0 4px;padding:10px 14px;'
        + 'background:linear-gradient(135deg,rgba(240,207,126,.28),rgba(240,207,126,.1));border:1.5px solid rgba(139,98,26,.5);border-radius:12px">'
        + '<span style="font-size:12px;color:' + P.txt + '">' + ICO('globe', 13, '') + ' 世界杯×' + sumWC + '</span>'
        + '<span style="color:' + P.dim + '">·</span>'
        + '<span style="font-size:12px;color:' + P.txt + '">' + ICO('cup', 13, '') + ' 联赛冠军×' + sumLG + '</span>'
        + '<span style="color:' + P.dim + '">·</span>'
        + '<span style="font-size:12px;color:' + P.txt + '">' + ICO('boot', 13, '') + ' 金靴×' + sumBoot + '</span>'
        + '<span style="color:' + P.dim + '">·</span>'
        + '<span style="font-size:12px;font-weight:900;color:#8a6216">最高荣誉分 ' + fmtN(best) + '</span></div>';
    }
    // 十席墙
    let topIdx = -1, best = -1;
    slots.forEach((e, i) => { if (e && (e.score || 0) > best) { best = e.score || 0; topIdx = i; } });
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px">';
    slots.forEach((e, i) => {
      if (!e) {
        html += '<div style="border:1.5px dashed rgba(26,36,28,.4);border-radius:14px;min-height:150px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;color:' + P.dim + '">'
          + '<div style="font-size:11px;font-weight:800;letter-spacing:2px;opacity:.7">' + ('0' + (i + 1)).slice(-2) + '</div>'
          + '<div style="opacity:.6">' + ICO('star', 18, '') + '</div>'
          + '<div style="font-size:12px;font-weight:700">空席位</div>'
          + '<div style="font-size:10px;opacity:.7">等待下一段传奇</div></div>';
        return;
      }
      const isTop = i === topIdx;
      const borderColor = isTop ? 'rgba(139,98,26,.7)' : 'rgba(26,36,28,.7)';
      html += '<button data-lhslot="' + i + '" style="text-align:left;position:relative;border:1.5px solid ' + borderColor + ';'
        + (isTop ? 'box-shadow:0 0 14px rgba(232,193,90,.45),2.5px 2.5px 0 rgba(139,98,26,.6);' : 'box-shadow:2.5px 2.5px 0 rgba(26,36,28,.55);')
        + 'border-radius:14px;overflow:hidden;background:#ffffff;cursor:pointer;padding:0;color:inherit">'
        + '<div style="position:relative;height:92px;background:#dfe7d8">'
        + '<img src="' + esc(e.endingArt) + '" alt="" style="width:100%;height:100%;object-fit:cover;object-position:center 20%;display:block" onerror="this.style.display=\'none\'">'
        + '<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(13,19,15,.05),rgba(13,19,15,.82))"></div>'
        + '<div style="position:absolute;top:8px;left:10px;font-size:11px;font-weight:900;color:' + (isTop ? '#f4d888' : 'rgba(255,255,255,.85)') + ';text-shadow:0 1px 2px rgba(0,0,0,.5)">' + ('0' + (i + 1)).slice(-2) + '</div>'
        + (isTop ? '<div style="position:absolute;top:8px;right:10px;font-size:9px;font-weight:900;color:#3a2600;background:linear-gradient(135deg,#f4d888,#ddb14e);border-radius:6px;padding:2px 6px;box-shadow:0 1px 3px rgba(0,0,0,.4)">镇馆之宝</div>' : '')
        + '<div style="position:absolute;left:10px;bottom:6px;right:10px;display:flex;align-items:center;gap:6px">'
        + '<div style="font-size:14px;font-weight:900;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.8);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(e.name) + '</div>'
        + '<span style="font-size:9px;font-weight:800;color:#fff;background:#2e8a45;border-radius:5px;padding:1px 5px;flex-shrink:0;text-shadow:0 1px 1px rgba(0,0,0,.3)">' + esc(e.endingName) + '</span>'
        + '</div></div>'
        + '<div style="padding:8px 10px 10px">'
        + '<div style="font-size:10px;color:' + P.dim + '">' + esc(e.pos) + (e.number !== '' ? ' · #' + esc(e.number) : '') + ' · ' + (e.seasons || 0) + ' 赛季 · ' + (e.age || '?') + ' 岁退役</div>'
        + '<div style="display:flex;gap:0;margin-top:7px;border:1px solid rgba(26,36,28,.3);border-radius:8px;overflow:hidden">'
        + [['出场', e.apps], ['进球', e.goals], ['冠军', (e.champYears || []).length], ['荣誉分', e.score]].map(function (c) {
          return '<div style="flex:1;text-align:center;padding:5px 2px;' + (c[0] === '荣誉分' ? 'background:rgba(240,207,126,.3)' : '') + '">'
            + '<div style="font-size:13px;font-weight:900;color:' + (c[0] === '荣誉分' ? '#8a6216' : P.txt) + '">' + fmtN(c[1]) + '</div>'
            + '<div style="font-size:9px;color:' + P.dim + '">' + c[0] + '</div></div>';
        }).join('')
        + '</div></div></button>';
    });
    html += '</div>';
    if (!occ.length) {
      html += '<div style="text-align:center;padding:18px 0 6px;color:' + P.dim + ';font-size:12px">陈列室还没有收藏——生涯退役的结算页可以选择收入陈列室。</div>';
    }
    html += '<div style="text-align:center;font-size:10px;color:' + P.dim + ';margin-top:14px;opacity:.8">'
      + '荣誉分 = 世界杯冠军×400 · 亚洲杯×200 · 洲际杯×150 · 联赛冠军×100 · 杯赛×60 · 金冕×50 · 金靴×40 · 立像×300 …</div>';
    html += '</div>';

    _ovl.innerHTML = html;
    _ovl.querySelector('#lh-back').onclick = UIkit.guard(function () { closeOverlay(_ovl); _ovl = null; if (onClose) onClose(); }, '关闭陈列室');
    _ovl.querySelectorAll('[data-lhslot]').forEach(function (b) {
      b.onclick = UIkit.guard(function () { LH.showDetail(Number(b.getAttribute('data-lhslot'))); }, '打开陈列室详情');
    });
  };

  /* ══════════ 奖杯 SVG（金杯，冠类分色） ══════════ */
  const CUP_GEM = { wc: ['#ffd75e', '#b8860b'], ac: ['#7fd4a2', '#1e6b45'], cc: ['#cfd8e3', '#5a6b7d'], league: ['#e8c15a', '#8a6a10'], cup: ['#e0a58e', '#8a4b2e'] };
  function cupSVG(idx, cls) {
    const gem = CUP_GEM[cls] || CUP_GEM.league;
    const band = 'lhcg' + idx, gl = 'lhgg' + idx;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 120 126');
    svg.setAttribute('width', '86');
    svg.setAttribute('height', '90');
    svg.setAttribute('aria-hidden', 'true');
    const defs = document.createElementNS(SVG_NS, 'defs');
    const lg = document.createElementNS(SVG_NS, 'linearGradient');
    lg.setAttribute('id', band); lg.setAttribute('x1', '0'); lg.setAttribute('y1', '0'); lg.setAttribute('x2', '1'); lg.setAttribute('y2', '1');
    [['0', '#f7e6a8'], ['.45', gem[0]], ['.8', gem[1]], ['1', '#f2cf6b']].forEach(function (oc) {
      const st = document.createElementNS(SVG_NS, 'stop');
      st.setAttribute('offset', oc[0]); st.setAttribute('stop-color', oc[1]); lg.appendChild(st);
    });
    const rg = document.createElementNS(SVG_NS, 'radialGradient');
    rg.setAttribute('id', gl); rg.setAttribute('cx', '.35'); rg.setAttribute('cy', '.3'); rg.setAttribute('r', '.95');
    [['0', '#ffffff'], ['.45', gem[0]], ['1', gem[1]]].forEach(function (oc) {
      const st = document.createElementNS(SVG_NS, 'stop');
      st.setAttribute('offset', oc[0]); st.setAttribute('stop-color', oc[1]); rg.appendChild(st);
    });
    defs.appendChild(lg); defs.appendChild(rg); svg.appendChild(defs);
    const mk = function (tag, attrs) { const el = document.createElementNS(SVG_NS, tag); Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); }); return el; };
    // 杯身 + 杯耳 + 底座（足球奖杯形）
    svg.appendChild(mk('path', { d: 'M38 18h44v26a22 22 0 0 1-44 0z', fill: 'url(#' + band + ')', stroke: gem[1], 'stroke-width': '2' }));
    svg.appendChild(mk('path', { d: 'M38 22h-12a10 10 0 0 0 10 14M82 22h12a10 10 0 0 1-10 14', fill: 'none', stroke: 'url(#' + band + ')', 'stroke-width': '6' }));
    svg.appendChild(mk('rect', { x: '54', y: '64', width: '12', height: '12', fill: 'url(#' + band + ')' }));
    svg.appendChild(mk('rect', { x: '40', y: '76', width: '40', height: '10', rx: '3', fill: 'url(#' + band + ')', stroke: gem[1], 'stroke-width': '1.5' }));
    svg.appendChild(mk('rect', { x: '34', y: '86', width: '52', height: '12', rx: '3', fill: 'url(#' + band + ')', stroke: gem[1], 'stroke-width': '1.5' }));
    // 宝石 + 高光
    svg.appendChild(mk('polygon', { points: '60,26 70,36 60,46 50,36', fill: 'url(#' + gl + ')', stroke: gem[1], 'stroke-width': '1.6' }));
    svg.appendChild(mk('path', { d: 'M44 24l2 6 6 2-6 2-2 6-2-6-6-2 6-2z', fill: '#ffffff', opacity: '.55' }));
    return svg;
  }

  /* ══════════ 详情页（三标签） ══════════ */
  LH.showDetail = function (i) {
    const e = LH.slots()[i];
    if (!e) return;
    if (_ovl2) closeOverlay(_ovl2);
    const P = pal();
    _ovl2 = openOverlay(1300);

    const isGK = e.isGK;
    let html = '<div style="max-width:560px;margin:0 auto;padding:20px 16px 8px">';
    // hero
    html += '<div style="position:relative;border-radius:16px;overflow:hidden;border:2px solid rgba(26,36,28,.8);box-shadow:3px 3px 0 rgba(26,36,28,.6);height:200px;background:#dfe7d8">'
      + '<img src="' + esc(e.endingArt) + '" alt="" style="width:100%;height:100%;object-fit:cover;display:block" onerror="this.style.display=\'none\'">'
      + '<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(13,19,15,.08) 40%,rgba(13,19,15,.88))"></div>'
      + '<div style="position:absolute;left:14px;bottom:12px;right:14px">'
      + '<div style="font-size:10px;letter-spacing:4px;color:#f4d888;text-shadow:0 1px 2px rgba(0,0,0,.6)">CAREER COMPLETE · ' + esc(e.at) + '</div>'
      + '<div style="font-size:22px;font-weight:900;color:#fff;text-shadow:0 1px 4px rgba(0,0,0,.85)">' + esc(e.name) + (e.number !== '' ? ' #' + esc(e.number) : '') + '</div>'
      + '</div>'
      + '<span style="position:absolute;top:12px;right:12px;font-size:10px;font-weight:900;color:#fff;background:#2e8a45;border-radius:7px;padding:3px 8px;box-shadow:0 1px 4px rgba(0,0,0,.4)">' + esc(e.endingName) + '</span>'
      + '</div>';
    // 副标 + 墓志铭
    html += '<div style="font-size:11px;color:' + P.dim + ';margin-top:10px">第 ' + (i + 1) + ' 席 · ' + esc(e.pos) + ' · ' + (e.age || '?') + ' 岁退役 · 效力 ' + esc(e.team || '自由身')
      + (e.captain ? ' · 国家队队长' : '') + '</div>';
    if (e.endingLine) html += '<div style="font-style:italic;color:' + P.txt + ';font-size:13px;line-height:1.7;margin-top:8px;opacity:.92">「' + esc(e.endingLine) + '」</div>';
    // 12 格数据
    const cells = isGK
      ? [['赛季', e.seasons], ['出场', e.apps], ['扑救', e.saves], ['零封', e.cleanSheets], ['场均评分', e.rating], ['巅峰OVR', e.peakOvr],
         ['世界杯', (e.trophies || []).filter(function (t) { return t.name === '世界杯冠军'; }).length], ['洲际杯', (e.champYears || []).filter(function (c) { return c.cls === 'cc'; }).length], ['联赛冠军', (e.champYears || []).filter(function (c) { return c.cls === 'league'; }).length],
         ['最佳', e.motm], ['传奇指数', e.legacy], ['荣誉分', e.score]]
      : [['赛季', e.seasons], ['出场', e.apps], ['进球', e.goals], ['助攻', e.assists], ['场均评分', e.rating], ['巅峰OVR', e.peakOvr],
         ['世界杯', (e.trophies || []).filter(function (t) { return t.name === '世界杯冠军'; }).length], ['洲际杯', (e.champYears || []).filter(function (c) { return c.cls === 'cc'; }).length], ['联赛冠军', (e.champYears || []).filter(function (c) { return c.cls === 'league'; }).length],
         ['最佳', e.motm], ['传奇指数', e.legacy], ['荣誉分', e.score]];
    html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:12px">'
      + cells.map(function (c) {
        const gold = c[0] === '荣誉分' || c[0] === '世界杯';
        return '<div style="background:#ffffff;border:1.5px solid rgba(26,36,28,.45);border-radius:10px;padding:8px 4px;text-align:center">'
          + '<div style="font-size:14px;font-weight:900;color:' + (gold ? '#8a6216' : P.txt) + '">' + fmtN(c[1]) + '</div>'
          + '<div style="font-size:9px;color:' + P.dim + ';margin-top:1px">' + c[0] + '</div></div>';
      }).join('')
      + '</div>';
    // 三标签
    const tabs = [
      { key: 'honors', label: '荣誉殿堂', n: (e.trophies || []).length },
      { key: 'cups', label: '奖杯柜', n: (e.champYears || []).length },
      { key: 'timeline', label: '生涯年鉴', n: (e.log || []).length },
    ];
    html += '<div id="lh-tabs" style="display:flex;gap:7px;margin-top:14px">'
      + tabs.map(function (t, ti) {
        const on = ti === 0;
        return '<div data-lhtab="' + t.key + '" style="flex:1;text-align:center;padding:8px 0;font-size:12px;font-weight:800;border-radius:9px;cursor:pointer;'
          + (on ? 'background:linear-gradient(135deg,#4db563,#2e8a45);color:#fff;box-shadow:2px 2px 0 rgba(26,36,28,.5);' : 'background:#ffffff;color:#1a241c;border:1.5px solid rgba(26,36,28,.55);') + '">'
          + t.label + (t.n ? ' (' + t.n + ')' : '') + '</div>';
      }).join('')
      + '</div><div id="lh-tab-body" style="margin-top:10px"></div>';
    // 底部按钮
    html += '<div style="display:flex;flex-direction:column;gap:9px;margin-top:16px">'
      + '<button id="lh-share" style="background:linear-gradient(135deg,#f4d888,#ddb14e);color:#3a2600;border:2px solid rgba(26,36,28,.8);box-shadow:3px 3px 0 rgba(26,36,28,.8);border-radius:12px;padding:13px;font-size:14px;font-weight:900;cursor:pointer">' + ICO('send', 15, '') + ' 分享这段生涯 · 带图直发热点资讯</button>'
      + '<button id="lh-remove" style="background:#ffffff;border:1.5px solid rgba(26,36,28,.45);color:#4a5a4c;border-radius:11px;padding:11px;font-size:13px;font-weight:700;cursor:pointer">移出陈列室</button>'
      + '<button id="lh-close2" style="background:#ffffff;border:2px solid rgba(26,36,28,.8);color:#1a241c;border-radius:11px;padding:11px;font-size:13px;font-weight:800;cursor:pointer;box-shadow:2.5px 2.5px 0 rgba(26,36,28,.8)">关闭</button>'
      + '</div></div>';
    _ovl2.innerHTML = html;

    // 标签渲染
    const bodyEl = _ovl2.querySelector('#lh-tab-body');
    function renderTab(key) {
      if (key === 'honors') {
        let h = '';
        if (e.statue) h += '<div style="display:flex;gap:9px;align-items:center;background:linear-gradient(135deg,rgba(240,207,126,.3),transparent);border:1px solid rgba(139,98,26,.45);border-radius:11px;padding:10px 12px;margin-bottom:8px">'
          + '<span style="display:inline-flex;color:#8a6216">' + (window.TrophyArt ? TrophyArt.svg('家乡立像', 24) : ICO('star', 17, '')) + '</span><div><div style="font-size:13px;font-weight:900;color:#8a6216">家乡立像</div>'
          + '<div style="font-size:10px;color:' + P.dim + '">从野球场到世界之巅，铜像下孩子们模仿你的每个动作</div></div></div>';
        if (e.captain) h += '<div style="display:flex;gap:9px;align-items:center;background:#ffffff;border:1.5px solid rgba(26,36,28,.45);border-radius:11px;padding:10px 12px;margin-bottom:8px">'
          + '<span style="color:' + P.accent + '">' + ICO('shield', 16, '') + '</span><div><div style="font-size:13px;font-weight:800;color:' + P.txt + '">国家队队长袖标</div>'
          + '<div style="font-size:10px;color:' + P.dim + '">关键时刻压力减半 · 点球成功率提升</div></div></div>';
        const tl = e.trophies || [];
        if (tl.length) {
          h += '<div style="font-size:10px;letter-spacing:3px;color:' + P.dim + ';margin:8px 0 6px">生涯荣誉清单</div>';
          h += tl.map(function (t) {
            const cls = champClass(t.name);
            const gold = cls || /金靴|金冕|MVP|最佳/.test(t.name);
            /* P132：专属奖杯图标（TrophyArt 单源；TrophyArt 缺席时回落旧 ICO 兜底） */
            const art = window.TrophyArt
              ? '<span style="display:inline-flex;vertical-align:-7px;margin-right:5px">' + TrophyArt.svg(t.name, 22) + '</span>'
              : (cls ? ICO('cup', 13, '') + ' ' : ICO('medal', 13, '') + ' ');
            return '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 2px;border-bottom:1px solid rgba(26,36,28,.16)">'
              + '<div style="font-size:12.5px;font-weight:' + (cls ? '900' : '600') + ';color:' + (cls ? '#8a6216' : P.txt) + '">'
              + art + esc(t.name) + '</div>'
              + '<div style="font-size:10px;color:' + P.dim + '">' + (t.season ? esc(t.season) + ' 赛季' : '') + '</div></div>';
          }).join('');
        } else {
          h += '<div style="text-align:center;padding:16px 0;color:' + P.dim + ';font-size:12px">无冠生涯——但足球记得每一种热爱。</div>';
        }
        bodyEl.innerHTML = h;
      } else if (key === 'cups') {
        const cy = e.champYears || [];
        if (!cy.length) {
          bodyEl.innerHTML = '<div style="text-align:center;padding:22px 0;color:' + P.dim + '">'
            + '<div style="opacity:.5">' + cupSVG(99, 'league').outerHTML + '</div>'
            + '<div style="font-size:12px;font-weight:800;margin-top:8px">荣誉柜里还没有奖杯</div>'
            + '<div style="font-size:10px;margin-top:4px">伟大的生涯不止一种形状——资料室里的每一页剪报，都算数。</div></div>';
          return;
        }
        bodyEl.innerHTML = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:9px">'
          + cy.map(function (c, ci) {
            return '<div style="background:#ffffff;border:1.5px solid rgba(26,36,28,.45);border-radius:12px;padding:10px 6px;text-align:center">'
              + '<div>' + cupSVG(ci, c.cls).outerHTML + '</div>'
              + '<div style="font-size:11.5px;font-weight:900;color:' + P.txt + ';margin-top:5px">' + (c.season ? esc(c.season) + ' 赛季' : '—') + '</div>'
              + '<div style="font-size:9px;color:' + P.dim + ';margin-top:2px">' + esc(c.name) + '</div></div>';
          }).join('')
          + '</div>';
      } else {
        const log = e.log || [];
        if (!log.length) {
          bodyEl.innerHTML = '<div style="text-align:center;padding:20px 0;color:' + P.dim + ';font-size:12px">这本年鉴还是空白的——本席位收藏于生涯年鉴上线之前。</div>';
          return;
        }
        bodyEl.innerHTML = log.map(function (r) {
          const champ = /冠军/.test(r.res || '');
          return '<div style="display:flex;gap:10px;padding:9px 0;border-bottom:1px solid rgba(26,36,28,.14)">'
            + '<div style="width:30px;flex-shrink:0;text-align:center">'
            + '<div style="width:26px;height:26px;border-radius:50%;margin:0 auto;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;'
            + (champ ? 'background:#e8c15a;color:#3a2600;border:1.5px solid rgba(26,36,28,.55);' : 'border:1.5px solid rgba(26,36,28,.4);color:' + P.dim + ';') + '">'
            + (champ ? ICO('cup', 12, '') : String(r.s).slice(-2)) + '</div></div>'
            + '<div style="flex:1;min-width:0">'
            + '<div style="display:flex;align-items:center;gap:7px">'
            + '<span style="font-size:11px;color:' + P.dim + '">S' + esc(r.s) + ' · ' + esc(r.team) + '</span>'
            + gradeChip(r.grade) + '</div>'
            + '<div style="font-size:11px;color:' + P.txt + ';margin-top:3px">'
            + (r.isGKR ? '' : '')
            + 'OVR ' + esc(r.ovr) + ' · ' + (e.isGK ? '扑救 ' + esc(r.saves) : esc(r.goals) + '球 ' + esc(r.assists) + '助') + ' · 场均 ' + esc(r.rating)
            + (r.motm ? ' · 最佳×' + esc(r.motm) : '') + '</div>'
            + '<div style="font-size:11px;color:' + (champ ? '#8a6216' : P.dim) + ';font-weight:' + (champ ? '900' : '400') + ';margin-top:2px">' + esc(r.res) + (r.rank ? '（第 ' + esc(r.rank) + ' 名）' : '') + '</div>'
            + '</div></div>';
        }).join('');
      }
    }
    _ovl2.querySelectorAll('[data-lhtab]').forEach(function (t) {
      t.onclick = UIkit.guard(function () {
        const key = t.getAttribute('data-lhtab');
        _ovl2.querySelectorAll('[data-lhtab]').forEach(function (x) {
          const on = x.getAttribute('data-lhtab') === key;
          x.style.background = on ? 'linear-gradient(135deg,#4db563,#2e8a45)' : '#ffffff';
          x.style.color = on ? '#fff' : '#1a241c';
          x.style.border = on ? 'none' : '1.5px solid rgba(26,36,28,.55)';
        });
        renderTab(key);
      }, '切换陈列室标签');
    });
    renderTab('honors');

    _ovl2.querySelector('#lh-share').onclick = UIkit.guard(function () { LH.shareEntry(e); }, '分享陈列室生涯');
    _ovl2.querySelector('#lh-remove').onclick = UIkit.guard(function () {
      UIkit.modal('<h3>移出陈列室</h3><p style="font-size:13px;line-height:1.8">确定将「' + esc(e.name) + '」移出第 ' + (i + 1) + ' 席吗？此席位将变为空白。</p>'
        + '<button class="btn btn-primary btn-block" id="lh-rm-ok">确定移出</button><button class="btn btn-ghost btn-block mt-10" id="lh-rm-no">取消</button>');
      UIkit.$('#lh-rm-ok').onclick = UIkit.guard(function () {
        LH.remove(e.id); UIkit.closeModal(); UIkit.toast('已移出陈列室'); closeOverlay(_ovl2); _ovl2 = null; LH.show();
      }, '移出陈列室确认');
      UIkit.$('#lh-rm-no').onclick = UIkit.guard(function () { UIkit.closeModal(); }, '取消移出');
    }, '移出陈列室');
    _ovl2.querySelector('#lh-close2').onclick = UIkit.guard(function () { closeOverlay(_ovl2); _ovl2 = null; }, '关闭详情');
  };

  /* ══════════ 席位选择器（退役页「收入陈列室」时打开） ══════════ */
  LH.showSlotPicker = function (entry, onSaved) {
    if (!entry) return;
    if (_ovl2) closeOverlay(_ovl2);
    const P = pal();
    const slots = LH.slots();
    const o = openOverlay(1400);
    let html = '<div style="max-width:560px;margin:0 auto;padding:24px 16px 10px">'
      + '<div style="font-size:10px;letter-spacing:5px;color:' + P.dim + '">LEGACY HALL</div>'
      + '<div style="font-size:22px;font-weight:900;color:' + P.accent + ';margin-top:3px">' + ICO('crown', 18, '') + ' 收入传奇陈列室</div>'
      + '<div style="font-size:11.5px;color:' + P.dim + ';margin-top:6px">「' + esc(entry.name) + '」· ' + esc(entry.endingName) + ' · 荣誉分 ' + fmtN(entry.score)
      + ' —— 选择一个席位：空位存入，已有席位覆盖。</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:14px">';
    slots.forEach(function (s, i) {
      const occ = !!s;
      html += '<button data-lhpick="' + i + '" style="text-align:left;border:1.5px solid ' + (occ ? 'rgba(139,98,26,.6)' : 'rgba(26,36,28,.4)') + ';'
        + (occ ? 'background:linear-gradient(135deg,rgba(232,193,90,.1),transparent);' : 'background:none;')
        + 'border-radius:12px;padding:11px 12px;cursor:pointer;color:inherit">'
        + '<div style="font-size:10px;font-weight:900;color:' + P.dim + '">' + ('0' + (i + 1)).slice(-2) + ' 号席</div>'
        + (occ
          ? '<div style="font-size:13px;font-weight:900;color:' + P.txt + ';margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(s.name) + '</div>'
          + '<div style="font-size:10px;color:' + P.dim + ';margin-top:2px">' + esc(s.endingName) + ' · 荣誉分 ' + fmtN(s.score) + '</div>'
          + '<div style="font-size:9.5px;color:#d08080;margin-top:4px">点击覆盖此席</div>'
          : '<div style="font-size:13px;font-weight:800;color:' + P.dim + ';margin-top:3px">空席位</div>'
          + '<div style="font-size:10px;color:' + P.accent + ';margin-top:4px">点击存入</div>')
        + '</button>';
    });
    html += '</div><button id="lh-pick-cancel" style="width:100%;margin-top:14px;background:#ffffff;border:1.5px solid rgba(26,36,28,.45);color:#4a5a4c;border-radius:11px;padding:11px;font-size:13px;font-weight:700;cursor:pointer">先不收藏</button></div>';
    o.innerHTML = html;
    o.querySelectorAll('[data-lhpick]').forEach(function (b) {
      b.onclick = UIkit.guard(function () {
        const idx = Number(b.getAttribute('data-lhpick'));
        const occupied = slots[idx];
        const doSave = function () {
          if (LH.saveAt(idx + 1, entry)) {
            UIkit.toast('已收入传奇陈列室 · 第 ' + (idx + 1) + ' 席', 'gold');
            closeOverlay(o);
            if (onSaved) onSaved(idx + 1);
          } else {
            UIkit.toast('收藏失败（存储空间不足？）', 'red');
            /* ★ P274：失败必须「钉在面板上」——此前失败 toast 曾被本 overlay 压住
               （toast z 70 < overlay 1400，v2.css 已全局修层），玩家零反馈 = 「点击没反应」。
               现在双保险：toast（已可见）+ picker 内常驻错误条。 */
            let bar = o.querySelector('#lh-pick-err');
            if (!bar) {
              bar = document.createElement('div');
              bar.id = 'lh-pick-err';
              const anchor = o.querySelector('#lh-pick-cancel');
              if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(bar, anchor);
              else o.appendChild(bar);
            }
            bar.style.cssText = 'margin-top:12px;background:#fdecec;border:1.5px solid #c0564f;color:#8a2f28;'
              + 'border-radius:10px;padding:10px 12px;font-size:12.5px;font-weight:700;line-height:1.7';
            bar.textContent = '⚠ 收藏失败：本机存储写入不可用（空间不足或系统限制）。请清理手机空间后重启游戏再试；重试前请勿关闭页面。';
          }
        };
        if (occupied) {
          UIkit.modal('<h3>覆盖席位</h3><p style="font-size:13px;line-height:1.8">第 ' + (idx + 1) + ' 席已有「' + esc(occupied.name) + '」（' + esc(occupied.endingName) + '）。<br>确定用「' + esc(entry.name) + '」覆盖吗？被覆盖的生涯将无法恢复。</p>'
            + '<button class="btn btn-primary btn-block" id="lh-cv-ok">确定覆盖</button><button class="btn btn-ghost btn-block mt-10" id="lh-cv-no">取消</button>');
          UIkit.$('#lh-cv-ok').onclick = UIkit.guard(function () { UIkit.closeModal(); doSave(); }, '覆盖席位确认');
          UIkit.$('#lh-cv-no').onclick = UIkit.guard(function () { UIkit.closeModal(); }, '取消覆盖');
        } else doSave();
      }, '选择陈列室席位');
    });
    o.querySelector('#lh-pick-cancel').onclick = UIkit.guard(function () { closeOverlay(o); }, '取消收藏');
  };

  window.LegacyHall = LH;
})();
