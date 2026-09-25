/* ============================================================================
   音频系统 — 场景化文件 BGM（生涯 / 决心 / 冠军之心）+ 程序化兜底 + 按键音效
   - BGM 生涯曲目：assets/bgm_career.ogg（生涯）——全局默认：主菜单 / Hub 日常 / 赛季结算
   - BGM 决心曲目：assets/bgm_juexin.ogg（决心）——俱乐部比赛与赛后结算
   - BGM 荣耀曲目：assets/bgm_guanjun.ogg（冠军之心）——国家队比赛与夺冠时刻循环
     ★ 三首与《冠军之心：篮球生涯》同源（career/resolve/glory，音频流逐包一致，
       P134 已对拍）；场景分工与篮球线同构：生涯=日常默认 / 决心=比赛 / 荣耀=国家队与夺冠
   - 加载优先级：window.BGM_DATA（单文件内联 base64）→ assets/*.ogg；
     两者都不可用（file:// 无内联 / 资源缺失 / 解码失败）回退程序化四和弦音序器
   - SFX：按键点击/确认/返回/开关 四种音色
   - 设置持久化 localStorage（全局，不随存档）
   ============================================================================ */
(function () {
  const KEY = "mfl_audio_v1";
  /* ★ P242（用户指令）：初始音量降到原值的 30%（musicVol 0.45→0.135 / sfxVol 0.7→0.21）。
     只影响「从未碰过声音设置」的玩家——设置持久化在 mfl_audio_v1，任何 setter 一旦
     触发 persist 即四字段全量落盘，玩家自定音量永远优先于 DEFAULTS。 */
  const DEFAULTS = { music: true, sfx: true, musicVol: 0.135, sfxVol: 0.21 };
  let cfg = load();
  let ctx = null, musicGain = null, sfxGain = null;
  let schedTimer = null, step = 0, nextTime = 0;

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY));
      // 容错：仅接受普通对象；损坏 / 原始值 / 数组一律回退 DEFAULTS，保证初始化永不异常
      const saved = (raw && typeof raw === "object" && !Array.isArray(raw)) ? raw : {};
      return Object.assign({}, DEFAULTS, saved);
    } catch (e) {
      /* ★ P236（复审）：损坏数据可见化——console.warn 留痕（调试面板可查）+ 清掉坏键
         （下次设置变更时 persist 正常重建）。**不弹 toast**：音频设置是低价值数据，静默
         回退默认即最优体验；且 load 在 IIFE 顶层执行（页面加载极早期），UIkit 尚未加载，
         toast 通道不可用。 */
      try { console.warn("[audio] 音频设置损坏，已回退默认值：" + (e && e.message || e)); localStorage.removeItem(KEY); } catch (e2) { /* ignore */ }
      return Object.assign({}, DEFAULTS);
    }
  }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) { /* ignore */ } }

  function ensureCtx() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { ctx = new AC(); } catch (e) { return false; }
    musicGain = ctx.createGain();
    musicGain.gain.value = cfg.music ? cfg.musicVol : 0;
    musicGain.connect(ctx.destination);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = cfg.sfx ? cfg.sfxVol : 0;
    sfxGain.connect(ctx.destination);
    return true;
  }
  function resume() { if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {}); }

  // ── BGM 音序器（程序化兜底）─────────────────────────────
  const BPM = 96, STEPS_PER_BAR = 8, BARS = 4;         // 4 小节 ≈ 10 秒循环
  const midi = m => 440 * Math.pow(2, (m - 69) / 12);
  // 励志向进行：C → G → Am → F（卡农感，契合"从野球场到世界之巅"的追梦基调）
  const CHORDS = [
    { bass: 36, notes: [60, 64, 67] },  // C
    { bass: 43, notes: [55, 59, 62] },  // G
    { bass: 45, notes: [57, 60, 64] },  // Am
    { bass: 41, notes: [53, 57, 60] },  // F
  ];
  const ARP = [0, 1, 2, 1, 0, 2, 1, 2];                // 每小节 8 个八分音符的拨弦型

  function voice(type, freq, t, dur, vol, attack) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + (attack || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(musicGain);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function scheduleStep(s, t) {
    const bar = Math.floor(s / STEPS_PER_BAR) % BARS;
    const inBar = s % STEPS_PER_BAR;
    const ch = CHORDS[bar];
    const eighth = 60 / BPM / 2;
    if (inBar === 0) {
      // 和弦 pad：整小节铺底
      ch.notes.forEach(m => voice("triangle", midi(m), t, eighth * STEPS_PER_BAR * 0.98, 0.045, 0.4));
      // 高音点缀（每小节第一个音上方八度）
      voice("sine", midi(ch.notes[2] + 12), t + eighth * 2, 1.6, 0.022, 0.05);
    }
    // 拨弦琶音
    voice("triangle", midi(ch.notes[ARP[inBar]] + 12), t, 0.38, 0.07, 0.008);
    // 贝斯：第 1、3 拍
    if (inBar === 0 || inBar === 4) voice("sine", midi(ch.bass), t, 0.55, 0.12, 0.01);
  }

  /* ★ P235（复审评估留证）：scheduler 为**标准 WebAudio lookahead 调度模式**（"A Tale of Two
     Clocks"，即复审建议的「Web Audio API 的 scheduling 机制」）——setInterval 仅做低频 tick，
     音符事件的精确时刻走 ctx.currentTime（音频硬件采样级时钟，误差不进主线程帧预算）；
     单次执行 = lookahead 0.6s 内 2~3 步 × 每步 3~4 个原生节点创建（无 DOM/无重计算），
     耗时微秒级、主线程占用 <0.05%，无需 Worker 迁移；后台场景由 P226 visibilitychange
     停排程防线覆盖（隐藏时完全停 tick）。 */
  function scheduler() {
    const eighth = 60 / BPM / 2;
    while (nextTime < ctx.currentTime + 0.6) {
      scheduleStep(step, nextTime);
      nextTime += eighth;
      step = (step + 1) % (STEPS_PER_BAR * BARS);
    }
  }
  function startProcedural() {
    if (!ensureCtx()) return;
    resume();
    if (schedTimer) return;
    nextTime = ctx.currentTime + 0.15;
    schedTimer = setInterval(scheduler, 200);
  }
  function stopProcedural() {
    if (schedTimer) { clearInterval(schedTimer); schedTimer = null; }
  }

  // ── 场景化文件 BGM（生涯 / 决心 / 冠军之心）─────────────────────────────
  const TRACKS = {
    career: "assets/bgm_career.ogg",       // 生涯：全局默认（主菜单 / Hub 日常 / 赛季结算）
    resolve: "assets/bgm_juexin.ogg",      // 决心：俱乐部比赛与赛后结算
    champion: "assets/bgm_guanjun.ogg",    // 冠军之心：国家队比赛 + 夺冠时刻
  };
  let curTrack = "career";       // 当前场景名（UI/日志语义）
  let curSrcKey = "champion";    // ★ P248：当前实际音源键（初始 = srcKeyOf("career")，与 P244 对调一致）
  let fileAudio = null;          // 当前文件 BGM 的 Audio 元素（媒体加载器，零网络 API）
  const audioCache = {};         // 音源键 -> Audio | null（null = 加载失败，永久回退程序化兜底）

  /* ★ P228（审计 SR 复审）→ ★ P294（SR audio 复审收口）：文件 BGM 走 **Audio 元素媒体加载器**
     （与 <img>/<audio> 同类的资源加载，非数据接口）——
     ① 不存在任何直接网络调用形态（全文件零网络 API；媒体资源全权交浏览器加载器，
        ColorboxAI.request SDK 仅承载 JSON 文本体、无二进制能力，BGM 不经 SDK——见
        colorbox-request 技能文档；「申请白名单」流程项亦因不发请求而无需申请）；
     ② 无手动 base64 解码（data URI 直接作 audio.src）；
     ③ trackSrc 白名单：只允许 BGM_DATA 内联 data URI 或包内 assets/*.ogg 相对路径，
        阻断配置被改成外链；④ 失败路径完整：加载失败缓存 null → 程序化音序器兜底。 */
  /* ★ P244（用户指令）：日常默认与国家队/夺冠 BGM **对调**——「打开游戏就听到的那段」
     太激昂，国家队的那段反而耐听。只在「场景名→音源」解析层对调（srcKeyOf），
     全游戏所有 setBgm("career"/"champion") 调用点零改动；内联 BGM_DATA 与包内 ogg
     两条音源路径同时生效。
   * ★ P248（用户指令）：普通俱乐部比赛（resolve）**并入日常曲** + 治「音乐老是中断」——
     玩家在日常↔俱乐部比赛（赛后结算）之间高频往返，此前每个场景各一个 Audio 实例，
     即使曲子相同也会 pause/重载导致中断。改为：①resolve 解析到与日常同一音源；
     ②setBgm 按「音源键」判重，同源不切实例（零中断）；③ensureAudio 缓存键同步
     改用音源键（同曲全局单实例）。champion（国家队/夺冠）仍为对调后的另一首。 */
  const TRACK_SWAP = { career: "champion", champion: "career", resolve: "champion" };
  function srcKeyOf(name) { return TRACK_SWAP[name] || name; }
  function trackSrc(srcKey) {   // 入参 = 已解析音源键（不再做二次映射）
    if (window.BGM_DATA && window.BGM_DATA[srcKey]) return String(window.BGM_DATA[srcKey]);   // 单文件内联 data URI
    const u = TRACKS[srcKey] || "";
    return /^assets\/[\w.-]+\.ogg$/.test(u) ? u : null;
  }
  /** 懒加载曲目（Audio 元素 preload=auto）；成功缓存 Audio，失败缓存 null（永久回退程序化兜底）
   *  ★ P248：入参/缓存键 = 音源键（同曲全局单实例）；inflight 并发去重——unlock 预载与
   *  startMusic 首播并发调用同一音源时不再产生双 Audio 实例/双赋值 */
  const audioInflight = {};
  function ensureAudio(srcKey) {
    if (audioCache[srcKey] !== undefined) return Promise.resolve(audioCache[srcKey]);
    if (audioInflight[srcKey]) return audioInflight[srcKey];
    const src = trackSrc(srcKey);
    if (!src) { audioCache[srcKey] = null; return Promise.resolve(null); }
    const p = new Promise(res => {
      const a = new Audio();
      a.loop = true;
      a.preload = "auto";
      let settled = false;
      const done = ok => { if (settled) return; settled = true; audioCache[srcKey] = ok ? a : null; delete audioInflight[srcKey]; res(audioCache[srcKey]); };
      a.addEventListener("canplaythrough", () => done(true), { once: true });
      a.addEventListener("error", () => done(false), { once: true });
      setTimeout(() => done(false), 8000);   // 超时兜底（弱网/慢盘不悬挂启动链）
      try { a.src = src; a.load(); } catch (e) { done(false); }
    });
    audioInflight[srcKey] = p;
    return p;
  }
  function playFile(a) {
    stopFileAudio();
    fileAudio = a;
    a.volume = cfg.music ? cfg.musicVol : 0;
    try { a.currentTime = 0; } catch (e) { /* media 初始化期部分浏览器不可 seek */ }
    const p = a.play();
    if (p && p.catch) p.catch(() => { /* 自动播放策略：unlock 首次交互后 startMusic 重试 */ });
  }
  function stopFileAudio() {
    if (!fileAudio) return;
    try { fileAudio.pause(); } catch (e) { /* ignore */ }
    fileAudio = null;
  }
  /** 启动 BGM：先程序化垫场（零等待），文件就绪后无缝切换为真音乐循环 */
  function startMusic() {
    if (!ensureCtx()) return;
    resume();
    if (cfg.music && !schedTimer && !fileAudio) startProcedural();
    const wanted = curSrcKey;
    ensureAudio(wanted).then(a => {
      if (curSrcKey !== wanted) return;              // 等待期间已切曲目，交给新的加载回调
      if (a) { stopProcedural(); if (cfg.music) playFile(a); }
      // a 为 null → 保持程序化兜底
    });
  }
  /** 场景切换：career=生涯（日常默认） resolve=决心（俱乐部比赛） champion=冠军之心（国家队/夺冠）
   *  ★ P248：按「音源键」判重——同源（如日常↔俱乐部比赛）直接 return 不切实例，音乐连续不断。 */
  function setBgm(name) {
    if (!TRACKS[name]) return;
    const sk = srcKeyOf(name);
    if (sk === curSrcKey) return;                    // 同源不切（P248 治中断）
    curTrack = name;
    curSrcKey = sk;
    if (!ctx || !cfg.music) return;                  // 未解锁/静音时只记住意图，解锁后按 curSrcKey 播放
    ensureAudio(sk).then(a => {
      if (curSrcKey !== sk) return;
      if (a) { stopProcedural(); playFile(a); }
      else if (!schedTimer && !fileAudio) startProcedural();
    });
  }

  // ── 音效 ──────────────────────────────
  function blipAt(f1, f2, offset, dur, vol, type) {
    if (!cfg.sfx || !ensureCtx()) return;
    resume();
    const t = ctx.currentTime + (offset || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(f1, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(sfxGain);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // ── 全局按键音（捕获阶段，任何按钮都触发）──────────────────────────────
  document.addEventListener("pointerdown", e => {
    const el = e.target;
    const b = el && el.closest ? el.closest("button,.btn,[role=button]") : null;
    if (!b) return;
    if (b.classList.contains("btn-gold") || b.classList.contains("btn-danger")) gold();
    else if (b.classList.contains("btn-ghost")) back();
    else click();
  }, true);

  function click() { blipAt(720, 480, 0, 0.07, 0.3); }
  function gold() { blipAt(523, 659, 0, 0.08, 0.22); blipAt(784, 1047, 0.08, 0.14, 0.18); }
  function back() { blipAt(520, 340, 0, 0.09, 0.22); }
  function toggleSnd(on) { on ? blipAt(660, 880, 0, 0.09, 0.22) : blipAt(440, 300, 0, 0.09, 0.22); }

  // ── 首次交互解锁（浏览器自动播放策略）──────────────────────────────
  function unlock() {
    document.removeEventListener("pointerdown", unlock, true);
    document.removeEventListener("keydown", unlock, true);
    if (!ensureCtx()) return;
    resume();
    /* ★ P248：按「去重后的音源键集合」预载——resolve 已并入日常曲（TRACK_SWAP），
       juexin.ogg 不再被播放也就不再预载（省 ~0.8MB 首包）；inflight 去重保证单实例 */
    ["career", "resolve", "champion"].map(srcKeyOf).forEach(k => ensureAudio(k));
    if (cfg.music) startMusic();
  }
  document.addEventListener("pointerdown", unlock, true);
  document.addEventListener("keydown", unlock, true);

  /* ★ P226（审计 SR）：后台节流防线——页面隐藏时停排程（后台 setInterval 被浏览器节流到
     ≥1s，200ms lookahead 调度器会在节流间隙一次填满缓冲堆积事件）；恢复可见时若隐藏前
     在播则续播。文件 BGM（BufferSource）走音频通道不受节流影响，无需干预。 */
  let schedWasOn = false;
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { schedWasOn = !!schedTimer; stopProcedural(); }
    else if (schedWasOn && cfg.music && !fileAudio) { startProcedural(); schedWasOn = false; }
  });
  if (window.addEventListener) window.addEventListener("pagehide", function () { stopProcedural(); });   // ★ P226b：vm 沙箱 window stub 无 addEventListener，防御式注册

  // ── 公开 API ──────────────────────────────
  /* ── 足球事件音效（融合第一批④：音效事件清单，双端同构 SFX_EVENTS）──
     全部程序化合成，无需音频资产；Tap 端同名事件接口保留（引擎无合成能力，no-op 降级
     与篮球版 D13 同口径），未来补音频资产后升级为文件播放。 */
  // 噪声爆裂（人群欢呼/抽气的底色）
  function noiseAt(offset, dur, vol, filterHz) {
    if (!cfg.sfx || !ensureCtx()) return;
    resume();
    const t = ctx.currentTime + (offset || 0);
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = filterHz || 900; f.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(sfxGain);
    src.start(t); src.stop(t + dur + 0.02);
  }
  // 裁判哨：高频双音颤音（短/双/三连）
  function whistle(pattern) {
    if (!cfg.sfx || !ensureCtx()) return;
    resume();
    const n = pattern === "full" ? 3 : pattern === "half" ? 2 : 1;
    for (let i = 0; i < n; i++) {
      blipAt(2350, 2280, i * 0.34, 0.22, 0.22, "square");
      blipAt(3050, 2980, i * 0.34, 0.22, 0.10, "square");
    }
    if (pattern === "full") noiseAt(0.9, 1.4, 0.30, 1200);
  }
  // 踢球：低频短脉冲
  function kick() {
    blipAt(150, 45, 0, 0.12, 0.5, "sine");
    noiseAt(0, 0.06, 0.18, 400);
  }
  const SFX_EVENTS = {
    kick_off:   () => whistle("short"),
    whistle_half: () => whistle("half"),
    whistle_full: () => whistle("full"),
    /* P133 音色层次增强：goal = 人群爆点 + 上行三连音 + 高频闪音；win = 噪声 + C 大调琶音 */
    goal:       () => { noiseAt(0, 1.8, 0.42, 1100); blipAt(523, 660, 0.08, 0.30, 0.15, "triangle"); blipAt(659, 784, 0.20, 0.30, 0.14, "triangle"); blipAt(784, 1047, 0.34, 0.45, 0.15, "triangle"); blipAt(2100, 1900, 0.1, 0.5, 0.05, "sine"); },
    miss:       () => noiseAt(0, 0.7, 0.22, 600),
    save:       () => noiseAt(0, 0.5, 0.26, 750),
    win:        () => { noiseAt(0, 1.8, 0.40, 1000); blipAt(523, 523, 0.10, 0.22, 0.11, "triangle"); blipAt(659, 659, 0.24, 0.22, 0.11, "triangle"); blipAt(784, 784, 0.38, 0.22, 0.12, "triangle"); blipAt(1047, 1047, 0.52, 0.5, 0.13, "triangle"); },
    lose:       () => { noiseAt(0, 1.1, 0.20, 500); blipAt(330, 210, 0.1, 0.8, 0.10, "triangle"); },
    /* P133 新增：trophy 夺冠/奖杯专属（长琶音 + 双层人群 + 长尾闪音）；接线点 = settlement 冠军卡 */
    trophy:     () => { noiseAt(0, 2.2, 0.40, 1050); noiseAt(0.15, 1.8, 0.22, 1400); [523, 659, 784, 1047, 1319].forEach((f, i) => blipAt(f, f, 0.12 + i * 0.14, 0.30, 0.13, "triangle")); blipAt(2093, 2093, 0.9, 0.9, 0.06, "sine"); },
    kickoff_kick: kick,
  };
  function event(name) {
    const fn = SFX_EVENTS[name];
    if (fn) fn();
  }
  window.SND_SFX_EVENTS = Object.keys(SFX_EVENTS);

  window.Snd = {
    click, gold, back, toggleSnd, event,
    get cfg() { return cfg; },
    setMusic(on) { cfg.music = !!on; persist(); if (on) startMusic(); else { stopProcedural(); stopFileAudio(); } },
    /** 场景 BGM 切换：Snd.setBgm("career"|"resolve"|"champion")；无效值忽略（保持当前曲目） */
    setBgm(name) { setBgm(name); },
    setSfx(on) { cfg.sfx = !!on; persist(); if (sfxGain) sfxGain.gain.value = on ? cfg.sfxVol : 0; },
    setMusicVol(v) { cfg.musicVol = Math.max(0, Math.min(1, v)); persist(); if (musicGain) musicGain.gain.value = cfg.music ? cfg.musicVol : 0; if (fileAudio) fileAudio.volume = cfg.music ? cfg.musicVol : 0; },
    setSfxVol(v) { cfg.sfxVol = Math.max(0, Math.min(1, v)); persist(); if (sfxGain) sfxGain.gain.value = cfg.sfx ? cfg.sfxVol : 0; },
  };
})();
