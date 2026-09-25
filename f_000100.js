/* ============================================================================
   club_events5.js — 俱乐部专属事件引擎 · 第五期（P81/P81c：中超母队线）
   槽位：gv（羊城红虎）+ shp（魔都浦潮）——P81c 起参数化 CFG 结构，双槽共用派发管道。
   架构：不改 club_events.js / 2 / 3 / 4（前四期槽位不动）——本文件在 club_events4.js
         之后加载，对 window.ClubEvents 再做一层包装派发（前四期槽位优先 → 本引擎接管）。
   母队线特性：玩家可 2014 青训出道（entry=youth，拜师结构）或中途来投（entry=star）。
   槽差异：gv 初始 cc:1 + ccEver:true（2013 亚冠=2014 前固定历史）；
           shp 初始 cc:0 + ccEver:false（海港无洲际冠军基数，am 组做「第一次」armed）。
   停运钩子仅 gv：wj8 派发时 contract.years=0（季末自由身 genTransferOffers 自然生效）
   + ce.gvClosed=true；玩家拒绝报价留队则 2026 起每季 INIT 重申。shp 无停运线。
   armed 门控（玩家数据驱动，P72 铁律）：lg1=lgEver 首冠（正文「第一座」合法）/
   lg2=卫冕 / lg3=杯赛首冠 / lg5=cc 决赛胜 / reg1=卫冕失败→reg1b 次季夺回 /
   reg2=cc 决赛负（互斥）/ reg3=cc 提前出局 / sh3=lgCnt>=3（shp 王朝）/
   gv 专属 wj5=降级区 wj7=重建 rank3 wj8=2025 停运。
   ROSTER windows 模式（windows：[名, [窗口起, 窗口止) 或多段, 起始年龄, 位置, 国籍, OVR]）：
   支持两进两出（埃尔克森托式回归）；武球王 [[0,5],[8,99]] 留洋空窗。
   armed 锚豁免 6 轮间隔闸（L5/踩坑3：赛前叙事不受氛围闸）。
   队名字面量已与 data_real.js 核验：「羊城蓝鲸」「魔都浦潮」「魔都蓝魔」逐字复制。
   数值铁律（P74/P81）：冠军序数由守卫保证；玩家运行时数字不进正文。
   ============================================================================ */
(function () {
  if (!window.ClubEvents) return;   // 必须在 club_events4.js 之后加载
  const CE4 = window.ClubEvents;

  const CARDS = () => (window.CLUB_EVENT_CARDS && window.CLUB_EVENT_CARDS.byId) || {};
  const card = id => CARDS()[id] || null;
  const safe = (fn, fb) => { try { const r = fn(); return r === undefined ? fb : r; } catch (e) { return fb; } };

  function teamInLD(name) {
    if (!window.LD) return null;
    for (const [, lg] of Object.entries(window.LD())) {
      const x = lg.teams.find(x => x.name === name);
      if (x) return x;
    }
    return null;
  }
  const clubIdOf = name => { const t = teamInLD(name); return t ? t.id : null; };

  /* ── 槽位配置（P81c 参数化）── */
  const GV_ROSTER = [
    ["郑队", [0, 10], 34, "CM", "中国", 72],
    ["张莫斯", [0, 8], 25, "RB", "中国", 72],
    ["圣曾诚", [0, 5], 27, "GK", "中国", 72],
    ["郜林铭", [0, 6], 28, "ST", "中国", 70],
    ["冯潇洲", [0, 5], 29, "CB", "中国", 70],
    ["金英铭", [0, 4], 24, "CB", "韩国", 71],
    ["埃尔克森托", [[0, 2], [5, 7]], 25, "ST", "巴西", 76],
    ["迪亚曼迪", [0, 2], 31, "CAM", "意大利", 73],
    ["保利尼奥尔", [1, 8], 27, "CM", "巴西", 80],
    ["高拉特", [1, 6], 24, "CAM", "巴西", 78],
    ["阿兰尼", [1, 4], 26, "ST", "巴西", 74],
    ["杰克逊德·马丁内斯", [2, 4], 29, "ST", "哥伦比亚", 78],
    ["塔利斯卡", [4, 7], 24, "CAM", "巴西", 79],
    ["朴志洙", [5, 7], 25, "CB", "韩国", 74],
    ["蒋光太", [5, 8], 21, "CB", "中国", 72],
  ];
  const SHP_ROSTER = [
    ["武球王", [[0, 5], [8, 99]], 23, "ST", "中国", 70],
    ["颜骏曦", [0, 99], 23, "GK", "中国", 70],
    ["蔡慧诚", [0, 12], 25, "CDM", "中国", 68],
    ["王燊皓", [0, 12], 25, "RB", "中国", 67],
    ["海森诺", [0, 2], 32, "ST", "瑞典", 74],
    ["孔卡", [1, 3], 31, "CAM", "阿根廷", 75],
    ["埃尔克森托", [2, 5], 27, "ST", "巴西", 76],
    ["胡尔克", [2, 7], 29, "ST", "巴西", 80],
    ["奥斯坎", [3, 11], 25, "CAM", "巴西", 82],
    ["艾哈迈多夫", [3, 7], 29, "CM", "乌兹别克斯坦", 74],
    ["穆伊", [6, 9], 29, "CM", "澳大利亚", 76],
    ["古斯塔沃托", [8, 99], 27, "CDM", "巴西", 75],
    ["巴尔加塞", [9, 99], 28, "LW", "秘鲁", 77],
  ];

  /* ── 恒大槽守卫 ── */
  const gvAlive = {
    zh: d => d.season <= 2023,                                   // 郑队 2023-06 退役
    pl: d => d.season >= 2015 && d.season <= 2021,               // 保利尼奥尔
    ek: d => (d.season >= 2014 && d.season <= 2015) || (d.season >= 2019 && d.season <= 2021),
    gao: d => d.season >= 2014 && d.season <= 2019,              // 郜林铭
    feng: d => d.season >= 2014 && d.season <= 2018,             // 冯潇洲
    zhang: d => d.season >= 2014 && d.season <= 2021,            // 张莫斯
  };
  /* ── 海港槽守卫 ── */
  const shpAlive = {
    wl: d => (d.season >= 2014 && d.season <= 2018) || d.season >= 2022,   // 武球王留洋 2019-2021
    os: d => d.season >= 2017 && d.season <= 2024,                          // 奥斯坎
    hh: d => d.season >= 2016 && d.season <= 2021,                          // 胡尔克
    yjl: () => true,                                                        // 颜骏曦恒真
  };

  /* ── bja 阵容窗口表（P81d 帝都御林军，tn=season-2014）── */
  const BJA_ROSTER = [
    ["张稀泽", [0, 99], 23, "CAM", "中国", 71],
    ["德扬诺", [0, 1], 32, "ST", "黑山", 75],
    ["巴塔兰", [0, 2], 30, "CAM", "阿根廷", 73],
    ["马季基", [0, 1], 34, "CDM", "克罗地亚", 69],
    ["杨智轩", [0, 4], 31, "GK", "中国", 71],
    ["邵佳博", [0, 1], 35, "CAM", "中国", 69],
    ["徐云隆", [0, 2], 35, "CB", "中国", 70],
    ["奥古斯托", [2, 7], 27, "CAM", "巴西", 78],
    ["伊尔马兹托", [2, 3], 30, "ST", "土耳其", 76],
    ["索里亚纳", [3, 4], 31, "ST", "西班牙", 74],
    ["比埃拉", [4, 9], 28, "CAM", "西班牙", 77],
    ["巴坎布", [4, 8], 27, "ST", "刚果", 78],
    ["张玉宁", [5, 99], 22, "ST", "中国", 72],
    ["池忠诚", [4, 99], 30, "CDM", "中国", 71],
    ["王刚", [5, 99], 30, "RB", "中国", 70],
    ["李可", [5, 99], 26, "CDM", "中国", 70],
    ["侯森轩", [0, 99], 29, "GK", "中国", 68],
    ["于大铭", [1, 99], 27, "CB", "中国", 72],
  ];
  const bjaAlive = {
    zx: () => true,
    dy: d => d.season <= 2015,
    sj: d => d.season <= 2015,
    mjq: d => d.season <= 2015,
    xy: d => d.season <= 2016,
    yz: d => d.season <= 2017,
    og: d => d.season >= 2016 && d.season <= 2020,
    bl: d => d.season >= 2018 && d.season <= 2022,
    bkb: d => d.season >= 2018 && d.season <= 2021,
    zk: d => d.season >= 2019,
    dbb: d => d.season >= 2015,
  };
  const TAN_ROSTER = [
    ["王大林", [0, 99], 25, "GK", "中国", 72],
    ["蒿俊恒", [0, 7], 27, "CM", "中国", 70],
    ["王永林", [0, 3], 27, "CAM", "中国", 70],
    ["蒙蒂略托", [0, 2], 30, "CAM", "阿根廷", 74],
    ["阿洛伊西奥德", [0, 2], 26, "ST", "巴西", 74],
    ["郑铮骁", [0, 99], 25, "LB", "中国", 69],
    ["刘彬林", [0, 99], 21, "RW", "中国", 68],
    ["吴兴洲", [0, 99], 21, "LW", "中国", 68],
    ["王彤楷", [0, 99], 21, "RB", "中国", 67],
    ["塔尔德利斯", [2, 6], 30, "ST", "巴西", 76],
    ["佩莱尼", [2, 6], 29, "ST", "意大利", 77],
    ["西塞斯", [2, 5], 28, "ST", "塞内加尔", 74],
    ["吉尔", [2, 5], 29, "CB", "巴西", 76],
    ["莫伊塞斯", [4, 9], 30, "CM", "巴西", 74],
    ["费莱宁", [5, 10], 31, "CAM", "比利时", 78],
    ["德尔加多", [5, 99], 22, "CM", "中国", 68],
    ["克雷桑", [8, 99], 25, "ST", "巴西", 75],
  ];
  const tanAlive = {
    dl: () => true,
    hm: d => d.season <= 2021,
    fl: d => d.season >= 2019 && d.season <= 2023,
  };
  const SHS_ROSTER = [
    ["莫雷纳", [0, 8], 28, "CAM", "哥伦比亚", 75],
    ["曹赟轩", [0, 10], 25, "LW", "中国", 69],
    ["耿晓锋", [0, 2], 27, "GK", "中国", 68],
    ["高迪楷", [0, 2], 27, "ST", "中国", 67],
    ["徐亮曦", [0, 2], 32, "CM", "中国", 67],
    ["秦升", [2, 7], 29, "CDM", "中国", 70],
    ["登巴帕", [1, 4], 29, "ST", "塞内加尔", 78],
    ["瓜林德", [2, 6], 30, "CM", "哥伦比亚", 75],
    ["马丁斯", [2, 5], 32, "ST", "尼日利亚", 76],
    ["野兽", [3, 4], 33, "ST", "阿根廷", 80],
    ["李帅曦", [2, 7], 34, "GK", "中国", 70],
    ["圣曾诚", [6, 99], 33, "GK", "中国", 74],
    ["冯潇洲", [6, 8], 35, "CB", "中国", 73],
    ["于汉皓", [7, 99], 33, "LW", "中国", 72],
    ["吴曦曦", [7, 99], 32, "CM", "中国", 75],
    ["朱辰杰", [4, 99], 18, "CB", "中国", 68],
    ["蒋圣龙", [6, 99], 20, "CB", "中国", 68],
  ];
  const shsAlive = {
    mr: () => true,
    cd: () => true,
  };
  const JSU_ROSTER = [
    ["吴曦曦", [0, 8], 25, "CM", "中国", 69],
    ["孙可林", [0, 2], 25, "RW", "中国", 71],
    ["任航林", [0, 3], 25, "LB", "中国", 68],
    ["耶夫蒂基", [0, 2], 30, "ST", "塞尔维亚", 73],
    ["埃雷尔森斯", [0, 2], 29, "CB", "巴西", 71],
    ["吉翔恒", [0, 8], 24, "RB", "中国", 68],
    ["周云洲", [0, 8], 24, "CB", "中国", 67],
    ["特谢拉", [2, 7], 25, "ST", "巴西", 80],
    ["拉米雷塞", [2, 5], 28, "CM", "巴西", 78],
    ["若", [2, 3], 28, "ST", "巴西", 75],
    ["顾超曦", [2, 7], 26, "GK", "中国", 70],
    ["李昂洲", [2, 8], 22, "CB", "中国", 69],
    ["谢鹏骁", [3, 7], 23, "CAM", "中国", 70],
    ["高天意", [4, 8], 20, "CM", "中国", 68],
    ["张岩", [4, 8], 21, "GK", "中国", 67],
  ];
  const jsuAlive = {
    wx: () => true,
    zy: () => true,
  };
  const LNO_ROSTER = [
    ["肇俊泽", [0, 3], 35, "CM", "中国", 66],
    ["查曼加德", [0, 3], 29, "ST", "赞比亚", 71],
    ["张鹭楷", [0, 2], 27, "GK", "中国", 69],
    ["杨善骏", [0, 2], 27, "CB", "中国", 67],
    ["胡延翔", [0, 4], 21, "RW", "中国", 64],
    ["金泰延", [0, 2], 25, "CM", "中国", 66],
    ["丁海峰", [0, 2], 24, "LB", "中国", 65],
    ["乌贾尔", [2, 4], 26, "ST", "尼日利亚", 72],
    ["穆伦加", [2, 4], 27, "ST", "民主刚果", 70],
    ["王皓烨", [0, 6], 21, "CM", "中国", 63],
  ];
  const lnoAlive = {
    zj: () => true,
    cl: () => true,
  };
  const CFG = {
    gv: {
      name: "羊城红虎", slot: "gv", roster: GV_ROSTER, alive: gvAlive,
      cc0: 1, ccEver0: true, st1: "gv_st1", closedFlag: "gvClosed", closedYear: 2025,
      aftermathIds: ["gv_after_flag", "gv_after_youth"],
      relegationArmed: true, prefix: "gv",
      /* 荣誉卡历史命名映射（P81 恒大用 gl*，P81c 起统一 lg*） */
      honorMap: { lg1: "gv_gl1", lg2: "gv_gl2", lg3: "gv_gl3", lg5: "gv_gl5" },
      INIT: { gv_zh6: 2020, gv_jy5: 2021, gv_wj1: 2021, gv_wj3: 2022, gv_zh8: 2022, gv_wj4: 2022, gv_db3: 2023, gv_sh1: 2024, gv_sh3: 2024, gv_wj8: 2025 },
      SETTLE: { gv_ek6: y => y === 2021, gv_zh7: y => y === 2021, gv_zh9: y => y === 2023 },
      AMBIENT: [
        "gv_st2", "gv_st3", "gv_zh3", "gv_pl3", "gv_ek1", "gv_dl1", "gv_dl4", "gv_dl6",
        "gv_ct1", "gv_ct2", "gv_ct3", "gv_ct4", "gv_ct5",
        "gv_fn1", "gv_fn2", "gv_fn3", "gv_fn4", "gv_fn5", "gv_dl3", "gv_sh2", "gv_sh4",
      ],
      GUARDS: {
        gv_st2: (d, ce) => d.season === ce.joinSeason,
        gv_st3: (d, ce) => d.season === ce.joinSeason,
        gv_zh3: d => gvAlive.zh(d),
        gv_pl3: d => gvAlive.pl(d),
        gv_ek1: d => gvAlive.ek(d),
        gv_dl1: d => gvAlive.gao(d),
        gv_dl4: d => gvAlive.zhang(d),
        gv_dl6: d => gvAlive.feng(d),
        gv_ct1: () => true, gv_ct2: () => true, gv_ct3: () => true, gv_ct4: () => true, gv_ct5: () => true,
        gv_fn1: d => gvAlive.gao(d),
        gv_fn2: d => gvAlive.feng(d) || d.season <= 2021,
        gv_fn3: () => true, gv_fn4: () => true, gv_fn5: () => true,
        gv_dl3: (d, ce) => d.season >= 2021 && seen(ce, "gv_dl2"),
        gv_sh2: () => true,
        gv_sh4: (d, ce) => !!ce.gvClosed && seen(ce, "gv_wj8"),
      },
      armedSilent(d, ce, round) {
        const y = d.season, tn = tenure(d, ce);
        if (tn === 3 && round >= 2 && !seen(ce, "gv_y1")) { mark(ce, "gv_y1"); return "gv_y1"; }
        if (tn === 6 && round >= 2 && !seen(ce, "gv_y2")) { mark(ce, "gv_y2"); return "gv_y2"; }
        if (tn === 10 && round >= 2 && !seen(ce, "gv_y3")) { mark(ce, "gv_y3"); return "gv_y3"; }
        if (tn === 13 && round >= 2 && !seen(ce, "gv_y4")) { mark(ce, "gv_y4"); return "gv_y4"; }
        if (y === 2014 && round >= 15 && !seen(ce, "gv_tc1")) { mark(ce, "gv_tc1"); return "gv_tc1"; }        // 银狐卸任 11 月
        if (y === 2015 && round >= 5 && !seen(ce, "gv_tc2")) { mark(ce, "gv_tc2"); return "gv_tc2"; }         // 卡帅一期 2 月
        if (y === 2015 && round >= 18 && !seen(ce, "gv_tc3")) { mark(ce, "gv_tc3"); return "gv_tc3"; }        // 斯科拉里 6 月
        if (y === 2015 && round >= 18 && seen(ce, "gv_tc3") && !seen(ce, "gv_pl1")) { mark(ce, "gv_pl1"); return "gv_pl1"; } // 保利尼奥尔 6 月到
        if (y === 2017 && round >= 18 && !seen(ce, "gv_pl4")) { mark(ce, "gv_pl4"); return "gv_pl4"; }        // 违约金 8 月
        if (y === 2017 && round >= 22 && seen(ce, "gv_pl4") && !seen(ce, "gv_pl5")) { mark(ce, "gv_pl5"); return "gv_pl5"; } // 送机
        if (y === 2017 && round >= 25 && !seen(ce, "gv_tc4")) { mark(ce, "gv_tc4"); return "gv_tc4"; }        // 二进宫 11 月
        if (y === 2018 && round >= 14 && !seen(ce, "gv_pl6")) { mark(ce, "gv_pl6"); return "gv_pl6"; }        // 回归 7 月
        if (y === 2019 && round >= 10 && !seen(ce, "gv_ek3")) { mark(ce, "gv_ek3"); return "gv_ek3"; }        // 归化回归 7 月
        if (y === 2019 && round >= 18 && seen(ce, "gv_ek3") && !seen(ce, "gv_ek5")) { mark(ce, "gv_ek5"); return "gv_ek5"; } // 国歌
        if (y === 2021 && round >= 4 && d.season >= 2021 && !seen(ce, "gv_wj2")) { mark(ce, "gv_wj2"); return "gv_wj2"; }  // 一月离潮
        if (y === 2021 && round >= 14 && !seen(ce, "gv_pl8")) { mark(ce, "gv_pl8"); return "gv_pl8"; }        // 保利尼奥尔解约 7 月
        if (y === 2021 && round >= 15 && !seen(ce, "gv_tc5")) { mark(ce, "gv_tc5"); return "gv_tc5"; }        // 卡帅离任 9 月
        return null;
      },
      pickPre(d, ce, opp, comp, isCc, isFinal) {
        /* 队名字面量已与 data_real.js 逐字核验（P81 unicode 核验流程） */
        if (opp === "羊城蓝鲸" && !seen(ce, "gv_db1")) { mark(ce, "gv_db1"); return card("gv_db1"); }
        if (opp === "羊城蓝鲸" && seen(ce, "gv_db1") && !seen(ce, "gv_db2")) { mark(ce, "gv_db2"); return card("gv_db2"); }
        if (opp === "魔都浦潮" && d.season >= 2019 && gvAlive.ek(d) && !seen(ce, "gv_ek4")) { mark(ce, "gv_ek4"); return card("gv_ek4"); }   // 「新名字」梗=2019 归化后且在队
        if (isCc && isFinal && gvAlive.zh(d) && !seen(ce, "gv_gl4")) { mark(ce, "gv_gl4"); return card("gv_gl4"); } // 决赛前夜（优先于重逢）
        if (isCc && d.season >= 2022 && !seen(ce, "gv_pl9")) { mark(ce, "gv_pl9"); return card("gv_pl9"); }   // 保利尼奥尔重逢（armed 洲际）
        return null;
      },
      onSeasonEndExtra: null,   // 降级 armed 走 relegationArmed 通用分支
      closedHook(state, d, ce) {
        if (ce.gvClosed || d.season >= 2025) {
          ce.gvClosed = true;
          if (d.contract) d.contract.years = 0;          // 季末 genTransferOffers 自由身多一份报价
          ce.sh4Armed = true;
          if (!seen(ce, "gv_wj8")) queue(ce, "gv_wj8");  // 停运讣告强制卡（2025 赛季初恒触发）
          else if (!seen(ce, "gv_sh4")) queue(ce, "gv_sh4"); // 留队兜底：终章
        }
      },
      afterCloseSilent: null,
    },

    shp: {
      name: "魔都浦潮", slot: "shp", roster: SHP_ROSTER, alive: shpAlive,
      cc0: 0, ccEver0: false, st1: "shp_st1", closedFlag: null,
      relegationArmed: false, prefix: "shp",
      INIT: { shp_gb2: 2016, shp_jy2: 2020, shp_yz1: 2020, shp_jy3: 2021, shp_ct4: 2023, shp_yz2: 2023, shp_jy4: 2023, shp_wl8: 2024, shp_sh1: 2024, shp_yz3: 2024, shp_wl9: 2025, shp_yz4: 2025, shp_sh2: 2025 },
      SETTLE: { shp_os6: y => y === 2024 },
      AMBIENT: [
        "shp_st2", "shp_st3", "shp_st4", "shp_gb1", "shp_gb3", "shp_gb4", "shp_gb6",
        "shp_wl1", "shp_wl2", "shp_wl7", "shp_os2", "shp_os3", "shp_hh2",
        "shp_db3", "shp_db4", "shp_ct1", "shp_ct2", "shp_ct3",
        "shp_fn1", "shp_fn2", "shp_fn3", "shp_fn4", "shp_fn5",
      ],
      GUARDS: {
        shp_st2: (d, ce) => d.season === ce.joinSeason,
        shp_st3: (d, ce) => d.season === ce.joinSeason,
        shp_st4: (d, ce) => d.season === ce.joinSeason,
        shp_gb1: () => true, shp_gb3: () => true, shp_gb4: () => true, shp_gb6: () => true,
        shp_wl1: d => shpAlive.wl(d),
        shp_wl2: d => shpAlive.wl(d) && d.season >= 2017,
        shp_wl7: d => shpAlive.wl(d) && d.season >= 2023,
        shp_os2: d => shpAlive.os(d),
        shp_os3: d => shpAlive.os(d) && d.season >= 2021,
        shp_hh2: d => shpAlive.hh(d),
        shp_db3: d => d.season <= 2017,
        shp_db4: d => d.season >= 2021,
        shp_ct1: () => true, shp_ct2: () => true, shp_ct3: () => true,
        shp_fn1: () => true,
        shp_fn2: d => shpAlive.wl(d),
        shp_fn3: () => true, shp_fn4: d => shpAlive.yjl(d), shp_fn5: () => true,
      },
      armedSilent(d, ce, round) {
        const y = d.season, tn = tenure(d, ce);
        if (tn === 3 && round >= 2 && !seen(ce, "shp_y1")) { mark(ce, "shp_y1"); return "shp_y1"; }
        if (tn === 6 && round >= 2 && !seen(ce, "shp_y2")) { mark(ce, "shp_y2"); return "shp_y2"; }
        if (tn === 10 && round >= 2 && !seen(ce, "shp_y3")) { mark(ce, "shp_y3"); return "shp_y3"; }
        if (tn === 13 && round >= 2 && !seen(ce, "shp_y4")) { mark(ce, "shp_y4"); return "shp_y4"; }
        if (y === 2015 && round >= 4 && !seen(ce, "shp_tc1")) { mark(ce, "shp_tc1"); return "shp_tc1"; }       // 埃里克森斯 1 月
        if (y === 2016 && round >= 4 && !seen(ce, "shp_es1")) { mark(ce, "shp_es1"); return "shp_es1"; }       // 艾克森来 1 月
        if (y === 2016 && round >= 10 && !seen(ce, "shp_jy1")) { mark(ce, "shp_jy1"); return "shp_jy1"; }      // 标王年代
        if (y === 2016 && round >= 14 && !seen(ce, "shp_hh1")) { mark(ce, "shp_hh1"); return "shp_hh1"; }      // 胡尔克 7 月
        if (y === 2017 && round >= 4 && !seen(ce, "shp_os1")) { mark(ce, "shp_os1"); return "shp_os1"; }       // 奥斯坎 1 月
        if (y === 2017 && round >= 10 && !seen(ce, "shp_tc2")) { mark(ce, "shp_tc2"); return "shp_tc2"; }      // 博阿斯
        if (y === 2018 && round >= 4 && !seen(ce, "shp_tc3")) { mark(ce, "shp_tc3"); return "shp_tc3"; }       // 佩雷兰
        if (y === 2019 && round >= 4 && !seen(ce, "shp_wl4")) { mark(ce, "shp_wl4"); return "shp_wl4"; }       // 送别 1 月
        if (y === 2019 && round >= 14 && !seen(ce, "shp_es2")) { mark(ce, "shp_es2"); return "shp_es2"; }      // 艾克森走 7 月
        if (y === 2019 && round >= 20 && !seen(ce, "shp_wl5")) { mark(ce, "shp_wl5"); return "shp_wl5"; }      // 远方
        if (y === 2021 && round >= 4 && !seen(ce, "shp_tc4")) { mark(ce, "shp_tc4"); return "shp_tc4"; }       // 莱科 1 月
        if (y === 2021 && round >= 8 && !seen(ce, "shp_os4")) { mark(ce, "shp_os4"); return "shp_os4"; }       // 留守夏窗
        if (y === 2021 && round >= 14 && !seen(ce, "shp_hh3")) { mark(ce, "shp_hh3"); return "shp_hh3"; }      // 胡尔克走 7 月
        if (y === 2022 && round >= 20 && !seen(ce, "shp_wl6")) { mark(ce, "shp_wl6"); return "shp_wl6"; }      // 回家 8 月
        if (y === 2023 && round >= 4 && !seen(ce, "shp_tc5")) { mark(ce, "shp_tc5"); return "shp_tc5"; }       // 哈维厄
        if (y === 2024 && round >= 10 && !seen(ce, "shp_os5")) { mark(ce, "shp_os5"); return "shp_os5"; }      // 告别季预告
        return null;
      },
      pickPre(d, ce, opp, comp, isCc, isFinal) {
        /* 「魔都蓝魔」已与 data_real.js 码点核验（上 U+4E0A 海 U+6D77 绿 U+7EFF 地 U+5730 申 U+7533 花 U+82B1） */
        if (opp === "魔都蓝魔" && !seen(ce, "shp_db1")) { mark(ce, "shp_db1"); return card("shp_db1"); }
        if (opp === "魔都蓝魔" && seen(ce, "shp_db1") && !seen(ce, "shp_db2")) { mark(ce, "shp_db2"); return card("shp_db2"); }
        if (isCc && d.season >= 2016 && !seen(ce, "shp_am1")) { mark(ce, "shp_am1"); return card("shp_am1"); }                      // 洲际首夜
        if (isCc && !isFinal && d.season >= 2017 && seen(ce, "shp_am1") && !seen(ce, "shp_am2")) { mark(ce, "shp_am2"); return card("shp_am2"); } // 淘汰之夜
        if (isCc && isFinal && (shpAlive.wl(d) || shpAlive.os(d)) && !seen(ce, "shp_lg4")) { mark(ce, "shp_lg4"); return card("shp_lg4"); } // 决赛前夜
        return null;
      },
      onSeasonEndExtra(state, d, ce, myRank, table, lgChamp) {
        if (lgChamp && ce.lgCnt >= 3 && !seen(ce, "shp_sh3")) queue(ce, "shp_sh3");   // 王朝（守卫保证序数）
      },
      closedHook: null,
      afterCloseSilent: null,
    },

    bja: {
      name: "帝都御林军", slot: "bja", roster: BJA_ROSTER, alive: bjaAlive,
      cc0: 0, ccEver0: false, st1: "bja_st1", closedFlag: null,
      relegationArmed: false, prefix: "bja",
      INIT: { bja_jy4: 2021, bja_db4: 2021, bja_ct6: 2023, bja_zx7: 2023, bja_sh1: 2024, bja_zx8: 2025, bja_sh2: 2025 },
      SETTLE: { bja_gb2: y => y === 2015, bja_gb4: y => y === 2016 },
      AMBIENT: [
        "bja_st2", "bja_st3", "bja_st4", "bja_zx1", "bja_zx4", "bja_gb1", "bja_gb3",
        "bja_og2", "bja_bl2", "bja_bl3", "bja_bkb2", "bja_bkb3", "bja_zy3",
        "bja_jy1", "bja_jy3",
        "bja_ct1", "bja_ct2", "bja_ct3", "bja_ct4",
        "bja_fn1", "bja_fn3", "bja_fn4", "bja_fn5",
      ],
      GUARDS: {
        bja_st2: (d, ce) => d.season === ce.joinSeason,
        bja_st3: (d, ce) => d.season === ce.joinSeason,
        bja_st4: (d, ce) => d.season === ce.joinSeason,
        bja_zx1: () => true,
        bja_zx4: d => d.season >= 2016,
        bja_gb1: d => bjaAlive.sj(d),
        bja_gb3: d => bjaAlive.xy(d),
        bja_og2: d => bjaAlive.og(d),
        bja_bl2: d => bjaAlive.bl(d),
        bja_bl3: d => bjaAlive.bl(d) && d.season >= 2019,
        bja_bkb2: d => bjaAlive.bkb(d),
        bja_bkb3: d => bjaAlive.bkb(d) && d.season >= 2019,
        bja_zy3: d => bjaAlive.zk(d) && d.season >= 2023,
        bja_jy1: () => true,
        bja_jy3: d => d.season >= 2018,
        bja_ct1: () => true, bja_ct2: () => true, bja_ct3: () => true, bja_ct4: () => true,
        bja_fn1: () => true,
        bja_fn3: () => true,
        bja_fn4: d => bjaAlive.mjq(d),
        bja_fn5: () => true,
      },
      armedSilent(d, ce, round) {
        const y = d.season, tn = tenure(d, ce);
        if (tn === 3 && round >= 2 && !seen(ce, "bja_y1")) { mark(ce, "bja_y1"); return "bja_y1"; }
        if (tn === 6 && round >= 2 && !seen(ce, "bja_y2")) { mark(ce, "bja_y2"); return "bja_y2"; }
        if (tn === 10 && round >= 2 && !seen(ce, "bja_y3")) { mark(ce, "bja_y3"); return "bja_y3"; }
        if (tn === 13 && round >= 2 && !seen(ce, "bja_y4")) { mark(ce, "bja_y4"); return "bja_y4"; }
        if (y === 2014 && round >= 3 && !seen(ce, "bja_tc1")) { mark(ce, "bja_tc1"); return "bja_tc1"; }    // 曼萨诺 2 月
        if (y === 2014 && round >= 28 && !seen(ce, "bja_zx2")) { mark(ce, "bja_zx2"); return "bja_zx2"; }   // 留洋决定 12 月
        if (y === 2015 && round >= 19 && !seen(ce, "bja_zx3")) { mark(ce, "bja_zx3"); return "bja_zx3"; }   // 归来 7 月
        if (y === 2016 && round >= 4 && !seen(ce, "bja_og1")) { mark(ce, "bja_og1"); return "bja_og1"; }    // 大奥 1 月
        if (y === 2016 && round >= 12 && !seen(ce, "bja_tc2")) { mark(ce, "bja_tc2"); return "bja_tc2"; }   // 扎切罗尼下课 6 月
        if (y === 2017 && round >= 13 && !seen(ce, "bja_tc3")) { mark(ce, "bja_tc3"); return "bja_tc3"; }   // 施密特 6 月
        if (y === 2017 && round >= 18 && !seen(ce, "bja_jy2")) { mark(ce, "bja_jy2"); return "bja_jy2"; }   // 调节费文件 7 月
        if (y === 2018 && round >= 3 && !seen(ce, "bja_bkb1")) { mark(ce, "bja_bkb1"); return "bja_bkb1"; } // 巴坎布 1 月
        if (y === 2018 && round >= 5 && !seen(ce, "bja_bl1")) { mark(ce, "bja_bl1"); return "bja_bl1"; }    // 比埃拉 2 月
        if (y === 2018 && round >= 12 && !seen(ce, "bja_og3")) { mark(ce, "bja_og3"); return "bja_og3"; }   // 双核初成
        if (y === 2018 && round >= 14 && !seen(ce, "bja_zx5")) { mark(ce, "bja_zx5"); return "bja_zx5"; }   // 助攻本
        if (y === 2018 && round >= 16 && !seen(ce, "bja_gb5")) { mark(ce, "bja_gb5"); return "bja_gb5"; }   // 老门将
        if (y === 2018 && round >= 26 && !seen(ce, "bja_db3")) { mark(ce, "bja_db3"); return "bja_db3"; }   // 京城德比首季
        if (y === 2019 && round >= 4 && !seen(ce, "bja_zy1")) { mark(ce, "bja_zy1"); return "bja_zy1"; }    // 张玉宁 2 月
        if (y === 2019 && round >= 10 && !seen(ce, "bja_og4")) { mark(ce, "bja_og4"); return "bja_og4"; }   // 引擎
        if (y === 2019 && round >= 15 && !seen(ce, "bja_zx6")) { mark(ce, "bja_zx6"); return "bja_zx6"; }   // 半程
        if (y === 2019 && round >= 18 && !seen(ce, "bja_fn2")) { mark(ce, "bja_fn2"); return "bja_fn2"; }   // 大宝改行
        if (y === 2019 && round >= 20 && !seen(ce, "bja_tc4")) { mark(ce, "bja_tc4"); return "bja_tc4"; }   // 施密特下课 7 月
        if (y === 2020 && round >= 4 && !seen(ce, "bja_jy5")) { mark(ce, "bja_jy5"); return "bja_jy5"; }    // 限薪令
        if (y === 2020 && round >= 8 && !seen(ce, "bja_og5")) { mark(ce, "bja_og5"); return "bja_og5"; }    // 疫情季
        if (y === 2020 && round >= 10 && !seen(ce, "bja_ct5")) { mark(ce, "bja_ct5"); return "bja_ct5"; }   // 空场漂泊
        if (y === 2021 && round >= 6 && !seen(ce, "bja_og6")) { mark(ce, "bja_og6"); return "bja_og6"; }    // 大奥解约 3 月
        if (y === 2021 && round >= 14 && !seen(ce, "bja_zy2")) { mark(ce, "bja_zy2"); return "bja_zy2"; }   // 哑铃房
        if (y === 2021 && round >= 16 && !seen(ce, "bja_tc5")) { mark(ce, "bja_tc5"); return "bja_tc5"; }   // 教鞭
        if (y === 2021 && round >= 24 && !seen(ce, "bja_bkb4")) { mark(ce, "bja_bkb4"); return "bja_bkb4"; }// 快乐尾声
        if (y === 2022 && round >= 14 && !seen(ce, "bja_bl4")) { mark(ce, "bja_bl4"); return "bja_bl4"; }   // 比埃拉 8 月
        if (y === 2023 && round >= 16 && !seen(ce, "bja_tc6")) { mark(ce, "bja_tc6"); return "bja_tc6"; }   // 重建者 6 月
        return null;
      },
      pickPre(d, ce, opp, comp, isCc, isFinal) {
        /* 「魔都蓝魔」已与 data_real.js 码点核验（上 U+4E0A 海 U+6D77 绿 U+7EFF 地 U+5730 申 U+7533 花 U+82B1） */
        if (opp === "魔都蓝魔" && !seen(ce, "bja_db1")) { mark(ce, "bja_db1"); return card("bja_db1"); }
        if (opp === "魔都蓝魔" && seen(ce, "bja_db1") && !seen(ce, "bja_db2")) { mark(ce, "bja_db2"); return card("bja_db2"); }
        if (isCc && d.season >= 2015 && !seen(ce, "bja_am1")) { mark(ce, "bja_am1"); return card("bja_am1"); }                      // 亚冠首夜
        if (isCc && !isFinal && d.season >= 2016 && seen(ce, "bja_am1") && !seen(ce, "bja_am2")) { mark(ce, "bja_am2"); return card("bja_am2"); } // 淘汰赛算术
        if (isCc && isFinal && (bjaAlive.zx(d) || bjaAlive.og(d)) && !seen(ce, "bja_lg4")) { mark(ce, "bja_lg4"); return card("bja_lg4"); }       // 决赛前夜
        return null;
      },
      onSeasonEndExtra(state, d, ce, myRank, table, lgChamp) {
        if (d.season === 2019 && !lgChamp && !seen(ce, "bja_reg4")) queue(ce, "bja_reg4");   // 2019 亚军之夜（争冠惜败，夺冠年不触发）
        if (lgChamp && (ce.lgCnt || 0) >= 3 && !seen(ce, "bja_sh3")) queue(ce, "bja_sh3");   // 王朝（守卫保证序数）
      },
      closedHook: null,
      afterCloseSilent: null,
    },
    tan: {
      name: "齐鲁橙狮", slot: "tan", roster: TAN_ROSTER, alive: tanAlive,
      cc0: 0, ccEver0: false, st1: "tan_st1", closedFlag: null,
      relegationArmed: false, prefix: "tan",
      INIT: { tan_dl1: 2014, tan_jy3: 2021, tan_sh1: 2024, tan_sh2: 2025, tan_sh3: 2025 },
      SETTLE: { tan_gj2: y => y === 2019, tan_pl3: y => y === 2020, tan_fl7: y => y === 2024 },
      AMBIENT: [
        "tan_st2", "tan_st3", "tan_st4", "tan_st5",
        "tan_dl2", "tan_dl3", "tan_dl5", "tan_dl6", "tan_dl7", "tan_dl8", "tan_dl9",
        "tan_fl2", "tan_fl3", "tan_fl4", "tan_fl5",
        "tan_hm1", "tan_hm2", "tan_hm3", "tan_hm4",
        "tan_jy1", "tan_jy4",
        "tan_ct1", "tan_ct2", "tan_ct3", "tan_ct4", "tan_ct5",
        "tan_fn1", "tan_fn2", "tan_fn3", "tan_fn4", "tan_fn5",
      ],
      GUARDS: {
        tan_st2: (d, ce) => d.season === ce.joinSeason,
        tan_st3: (d, ce) => d.season === ce.joinSeason,
        tan_st4: (d, ce) => d.season === ce.joinSeason,
        tan_st5: (d, ce) => d.season === ce.joinSeason,
        tan_dl2: d => d.season >= 2014 && d.season <= 2016,
        tan_dl3: d => d.season >= 2015 && d.season <= 2019,
        tan_dl5: d => d.season >= 2017 && d.season <= 2021,
        tan_dl6: d => d.season >= 2020 && d.season <= 2023,
        tan_dl7: d => d.season >= 2022,
        tan_dl8: d => d.season >= 2016 && d.season <= 2020,
        tan_dl9: d => d.season >= 2024,
        tan_fl2: d => d.season >= 2019 && d.season <= 2021,
        tan_fl3: d => d.season >= 2019 && d.season <= 2022,
        tan_fl4: d => d.season >= 2021 && d.season <= 2023,
        tan_fl5: d => d.season >= 2022 && d.season <= 2023,
        tan_hm1: d => d.season <= 2016,
        tan_hm2: d => d.season >= 2015 && d.season <= 2018,
        tan_hm3: d => d.season >= 2018 && d.season <= 2020,
        tan_hm4: d => d.season >= 2019 && d.season <= 2020,
        tan_jy1: d => d.season >= 2016 && d.season <= 2019,
        tan_jy4: d => d.season >= 2023,
        tan_ct1: () => true,
        tan_ct2: () => true,
        tan_ct3: () => true,
        tan_ct4: d => d.season >= 2018 && d.season <= 2022,
        tan_ct5: d => d.season >= 2019,
        tan_fn1: (d, ce) => seen(ce, "tan_pl1") && d.season >= 2017 && d.season <= 2019,
        tan_fn2: d => d.season <= 2017,
        tan_fn3: d => d.season >= 2016 && d.season <= 2020,
        tan_fn4: d => d.season >= 2021,
        tan_fn5: () => true,
      },
      armedSilent(d, ce, round) {
        const y = d.season, tn = tenure(d, ce);
        if (tn === 3 && round >= 2 && !seen(ce, "tan_y1")) { mark(ce, "tan_y1"); return "tan_y1"; }
        if (tn === 6 && round >= 2 && !seen(ce, "tan_y2")) { mark(ce, "tan_y2"); return "tan_y2"; }
        if (tn === 10 && round >= 2 && !seen(ce, "tan_y3")) { mark(ce, "tan_y3"); return "tan_y3"; }
        if (tn === 13 && round >= 2 && !seen(ce, "tan_y4")) { mark(ce, "tan_y4"); return "tan_y4"; }
        if (y === 2014 && round >= 3 && !seen(ce, "tan_tc1")) { mark(ce, "tan_tc1"); return "tan_tc1"; }    // 库卡 2 月
        if (y === 2016 && round >= 2 && !seen(ce, "tan_tc2")) { mark(ce, "tan_tc2"); return "tan_tc2"; }    // 曼诺冬窗
        if (y === 2016 && round >= 6 && !seen(ce, "tan_gj1")) { mark(ce, "tan_gj1"); return "tan_gj1"; }    // 吉尔 2 月
        if (y === 2016 && round >= 12 && !seen(ce, "tan_tc3")) { mark(ce, "tan_tc3"); return "tan_tc3"; }   // 马加特 6 月
        if (y === 2016 && round >= 16 && !seen(ce, "tan_pl1")) { mark(ce, "tan_pl1"); return "tan_pl1"; }   // 佩莱尼 7 月
        if (y === 2018 && round >= 2 && !seen(ce, "tan_tc4")) { mark(ce, "tan_tc4"); return "tan_tc4"; }    // 李霄鹏揭幕
        if (y === 2018 && round >= 28 && !seen(ce, "tan_dl4")) { mark(ce, "tan_dl4"); return "tan_dl4"; }   // 最佳门将 11 月
        if (y === 2019 && round >= 4 && !seen(ce, "tan_fl1")) { mark(ce, "tan_fl1"); return "tan_fl1"; }    // 费莱宁 2 月
        if (y === 2020 && round >= 8 && !seen(ce, "tan_jy2")) { mark(ce, "tan_jy2"); return "tan_jy2"; }    // 限薪令
        if (y === 2020 && round >= 14 && !seen(ce, "tan_tc5")) { mark(ce, "tan_tc5"); return "tan_tc5"; }   // 郝伟 10 月
        if (y === 2021 && round >= 14 && !seen(ce, "tan_hm5")) { mark(ce, "tan_hm5"); return "tan_hm5"; }   // 蒿俊恒 8 月
        if (y === 2023 && round >= 10 && !seen(ce, "tan_tc6")) { mark(ce, "tan_tc6"); return "tan_tc6"; }   // 崔康熙 5 月
        if (y === 2023 && round >= 26 && !seen(ce, "tan_fl6")) { mark(ce, "tan_fl6"); return "tan_fl6"; }   // 费莱宁收官季
        return null;
      },
      pickPre(d, ce, opp, comp, isCc, isFinal) {
        /* 对手名已与 data_real.js 码点核验（北 U+5317 京 U+4EAC 国 U+56FD 安 U+5B89 / 申 U+7533 花 U+82B1） */
        if (opp === "帝都御林军" && !seen(ce, "tan_db1")) { mark(ce, "tan_db1"); return card("tan_db1"); }
        if (opp === "帝都御林军" && seen(ce, "tan_db1") && !seen(ce, "tan_db2")) { mark(ce, "tan_db2"); return card("tan_db2"); }
        if (opp === "魔都蓝魔" && !seen(ce, "tan_db3")) { mark(ce, "tan_db3"); return card("tan_db3"); } // 大雷旧主
        if (isCc && d.season >= 2015 && !seen(ce, "tan_am1")) { mark(ce, "tan_am1"); return card("tan_am1"); }              // 洲际首夜
        if (isCc && d.season >= 2016 && comp.indexOf("淘汰") >= 0 && !seen(ce, "tan_am2")) { mark(ce, "tan_am2"); return card("tan_am2"); } // 淘汰赛之夜
        return null;
      },
      onSeasonEndExtra(state, d, ce, myRank, table, lgChamp, prevChamp) {
        const cupChamp = !!(d.cup && d.cup.alive === "champion");
        if (cupChamp) ce.cupCnt = (ce.cupCnt || 0) + 1;
        if (cupChamp && (ce.cupCnt || 0) >= 2 && !seen(ce, "tan_lg4")) queue(ce, "tan_lg4");          // 杯赛再夺（cupCnt>=2 区分首冠）
        if (lgChamp && cupChamp && !seen(ce, "tan_lg5")) queue(ce, "tan_lg5");                        // 双冠
        if (myRank === 2 && !seen(ce, "tan_reg4") && !(prevChamp && !lgChamp)) queue(ce, "tan_reg4"); // 亚军之夜（丢冠之夜同年让位，跨年不挡）
      },
    },
    shs: {
      name: "魔都蓝魔", slot: "shs", roster: SHS_ROSTER, alive: shsAlive,
      cc0: 0, ccEver0: false, st1: "shs_st1", closedFlag: null,
      relegationArmed: false, prefix: "shs",
      INIT: { shs_jy4: 2021, shs_sh1: 2024, shs_sh2: 2025, shs_sh3: 2025 },
      SETTLE: { shs_mr7: y => y === 2021, shs_cd7: y => y === 2023 },
      AMBIENT: [
        "shs_st2", "shs_st3", "shs_st4", "shs_st5",
        "shs_mr1", "shs_mr3", "shs_mr4", "shs_mr5",
        "shs_cd1", "shs_cd2", "shs_cd4", "shs_cd5",
        "shs_jy2",
        "shs_ct1", "shs_ct2", "shs_ct3", "shs_ct4", "shs_ct5",
        "shs_fn1", "shs_fn2", "shs_fn3", "shs_fn4", "shs_fn5",
      ],
      GUARDS: {
        shs_st2: (d, ce) => d.season === ce.joinSeason,
        shs_st3: (d, ce) => d.season === ce.joinSeason,
        shs_st4: (d, ce) => d.season === ce.joinSeason,
        shs_st5: (d, ce) => d.season === ce.joinSeason,
        shs_mr1: d => d.season <= 2015,
        shs_mr3: d => d.season >= 2016 && d.season <= 2017,
        shs_mr4: d => d.season === 2018,
        shs_mr5: d => d.season === 2020,
        shs_mr8: (d, ce) => seen(ce, "shs_mr7") && d.season >= 2022,
        shs_cd1: d => d.season <= 2016,
        shs_cd2: d => d.season >= 2015 && d.season <= 2017,
        shs_cd4: d => d.season >= 2017 && d.season <= 2019,
        shs_cd5: d => d.season >= 2020 && d.season <= 2022,
        shs_jy2: d => d.season >= 2016 && d.season <= 2018,
        shs_ct1: () => true,
        shs_ct2: () => true,
        shs_ct3: () => true,
        shs_ct4: () => true,
        shs_ct5: () => true,
        shs_fn1: (d, ce) => seen(ce, "shs_mr1") && d.season <= 2017,
        shs_fn2: d => d.season <= 2018,
        shs_fn3: d => d.season >= 2016 && d.season <= 2018,
        shs_fn4: d => d.season >= 2020,
        shs_fn5: () => true,
      },
      armedSilent(d, ce, round) {
        const y = d.season, tn = tenure(d, ce);
        if (tn === 3 && round >= 2 && !seen(ce, "shs_y1")) { mark(ce, "shs_y1"); return "shs_y1"; }
        if (tn === 6 && round >= 2 && !seen(ce, "shs_y2")) { mark(ce, "shs_y2"); return "shs_y2"; }
        if (tn === 10 && round >= 2 && !seen(ce, "shs_y3")) { mark(ce, "shs_y3"); return "shs_y3"; }
        if (tn === 13 && round >= 2 && !seen(ce, "shs_y4")) { mark(ce, "shs_y4"); return "shs_y4"; }
        if (y === 2014 && round >= 3 && !seen(ce, "shs_tc1")) { mark(ce, "shs_tc1"); return "shs_tc1"; }    // 巴蒂斯塔炖汤论
        if (y === 2015 && round >= 16 && !seen(ce, "shs_dd1")) { mark(ce, "shs_dd1"); return "shs_dd1"; }   // 登巴帕 7 月
        if (y === 2016 && round >= 2 && !seen(ce, "shs_tc2")) { mark(ce, "shs_tc2"); return "shs_tc2"; }    // 曼萨诺格子图
        if (y === 2016 && round >= 8 && !seen(ce, "shs_mr2")) { mark(ce, "shs_mr2"); return "shs_mr2"; }    // 十号接袖标
        if (y === 2016 && round >= 18 && !seen(ce, "shs_dd2")) { mark(ce, "shs_dd2"); return "shs_dd2"; }   // 德比之夜（克制白描）
        if (y === 2016 && round >= 22 && !seen(ce, "shs_cd3")) { mark(ce, "shs_cd3"); return "shs_cd3"; }   // 下放风波
        if (y === 2017 && round >= 4 && !seen(ce, "shs_jy1")) { mark(ce, "shs_jy1"); return "shs_jy1"; }    // 野兽 1 月
        if (y === 2017 && round >= 6 && seen(ce, "shs_dd1") && !seen(ce, "shs_dd3")) { mark(ce, "shs_dd3"); return "shs_dd3"; } // 登巴帕回归
        if (y === 2017 && round >= 20 && !seen(ce, "shs_tc3")) { mark(ce, "shs_tc3"); return "shs_tc3"; }   // 吴金贵救火 9 月
        if (y === 2019 && round >= 14 && !seen(ce, "shs_tc4")) { mark(ce, "shs_tc4"); return "shs_tc4"; }   // 崔康熙 7 月
        if (y === 2020 && round >= 8 && !seen(ce, "shs_jy3")) { mark(ce, "shs_jy3"); return "shs_jy3"; }    // 限薪令
        if (y === 2020 && round >= 10 && !seen(ce, "shs_xc1")) { mark(ce, "shs_xc1"); return "shs_xc1"; }   // 北方老友南下
        if (y === 2021 && round >= 20 && !seen(ce, "shs_mr6")) { mark(ce, "shs_mr6"); return "shs_mr6"; }   // 十号告别前夜
        if (y === 2022 && round >= 2 && !seen(ce, "shs_tc5")) { mark(ce, "shs_tc5"); return "shs_tc5"; }    // 吴金贵二进宫
        if (y === 2024 && round >= 2 && !seen(ce, "shs_tc6")) { mark(ce, "shs_tc6"); return "shs_tc6"; }    // 斯卢茨基
        return null;
      },
      pickPre(d, ce, opp, comp, isCc, isFinal) {
        /* 德比双名已与 data_real.js 码点核验（上 U+4E0A 港 U+6E2F / 海 U+6D77 港 U+6E2F） */
        if (opp === "魔都浦潮" && !seen(ce, "shs_db1")) { mark(ce, "shs_db1"); return card("shs_db1"); }
        if (opp === "魔都浦潮" && seen(ce, "shs_db1") && !seen(ce, "shs_db2")) { mark(ce, "shs_db2"); return card("shs_db2"); }
        if (opp === "魔都浦潮" && !seen(ce, "shs_db3")) { mark(ce, "shs_db3"); return card("shs_db3"); } // 中性名后新名德比
        if (isCc && d.season >= 2018 && !seen(ce, "shs_am1")) { mark(ce, "shs_am1"); return card("shs_am1"); }              // 洲际首夜
        if (isCc && d.season >= 2018 && comp.indexOf("淘汰") >= 0 && !seen(ce, "shs_am2")) { mark(ce, "shs_am2"); return card("shs_am2"); } // 淘汰赛之夜
        return null;
      },
      onSeasonEndExtra(state, d, ce, myRank, table, lgChamp, prevChamp) {
        const cupChamp = !!(d.cup && d.cup.alive === "champion");
        if (cupChamp) ce.cupCnt = (ce.cupCnt || 0) + 1;
        if (cupChamp && (ce.cupCnt || 0) >= 2 && !seen(ce, "shs_lg4")) queue(ce, "shs_lg4");          // 杯赛再夺
        if (cupChamp && (ce.cupCnt || 0) >= 3 && !seen(ce, "shs_lg6")) queue(ce, "shs_lg6");          // 杯赛三度（熟悉的剧本）
        if (myRank === 2 && !seen(ce, "shs_reg4") && !(prevChamp && !lgChamp)) queue(ce, "shs_reg4"); // 亚军之夜（同年让位 reg1）
        if (myRank >= 13 && myRank <= table.length && !seen(ce, "shs_reg5")) queue(ce, "shs_reg5");   // 泥潭里的夏天（下半区）
      },
    },
    jsu: {
      name: "江左蓝翼", slot: "jsu", roster: JSU_ROSTER, alive: jsuAlive,
      cc0: 0, ccEver0: false, st1: "jsu_st1", closedFlag: "jsuClosed", closedYear: 2021,
      aftermathIds: ["jsu_after_flag", "jsu_after_youth"],
      relegationArmed: false, prefix: "jsu",
      INIT: { jsu_jy4: 2021, jsu_sh1: 2023, jsu_sh2: 2024 },
      SETTLE: { jsu_wx6: y => y === 2021, jsu_zy3: y => y === 2021 },
      AMBIENT: [
        "jsu_st2", "jsu_st3", "jsu_st4", "jsu_st5",
        "jsu_wx1", "jsu_wx3", "jsu_wx4", "jsu_wx7", "jsu_wx8",
        "jsu_tx2", "jsu_tx3", "jsu_tx4", "jsu_tx6",
        "jsu_zy1", "jsu_zy2", "jsu_zy4",
        "jsu_js1", "jsu_js2",
        "jsu_jy1", "jsu_jy2", "jsu_jy5",
        "jsu_ct1", "jsu_ct2", "jsu_ct3", "jsu_ct4", "jsu_ct5",
        "jsu_fn1", "jsu_fn2", "jsu_fn3", "jsu_fn4", "jsu_fn5",
        "jsu_xj1",
      ],
      GUARDS: {
        jsu_st2: (d, ce) => d.season === ce.joinSeason,
        jsu_st3: (d, ce) => d.season === ce.joinSeason,
        jsu_st4: (d, ce) => d.season === ce.joinSeason,
        jsu_st5: (d, ce) => d.season === ce.joinSeason,
        jsu_wx1: d => d.season <= 2015,
        jsu_wx3: d => d.season >= 2018 && d.season <= 2020,
        jsu_wx4: (d, ce) => seen(ce, "jsu_lg1"),
        jsu_wx7: (d, ce) => seen(ce, "jsu_wx6") && d.season >= 2022,
        jsu_wx8: d => d.season >= 2023,
        jsu_tx2: d => d.season >= 2016 && d.season <= 2017,
        jsu_tx3: d => d.season === 2017,
        jsu_tx4: (d, ce) => seen(ce, "jsu_lg1"),
        jsu_tx6: d => d.season >= 2022,
        jsu_zy1: d => d.season <= 2016,
        jsu_zy2: (d, ce) => seen(ce, "jsu_lg1"),
        jsu_zy4: (d, ce) => seen(ce, "jsu_zy3") && d.season >= 2022,
        jsu_js1: d => d.season <= 2017,
        jsu_js2: (d, ce) => seen(ce, "jsu_lg1"),
        jsu_jy1: d => d.season >= 2016 && d.season <= 2018,
        jsu_jy2: d => d.season >= 2016 && d.season <= 2019,
        jsu_jy5: d => d.season >= 2020,
        jsu_ct1: () => true,
        jsu_ct2: () => true,
        jsu_ct3: () => true,
        jsu_ct4: () => true,
        jsu_ct5: () => true,
        jsu_fn1: d => d.season >= 2016 && d.season <= 2019,
        jsu_fn2: d => d.season <= 2018,
        jsu_fn3: d => d.season >= 2016 && d.season <= 2020,
        jsu_fn4: d => d.season >= 2019,
        jsu_fn5: () => true,
        jsu_xj1: d => d.season >= 2020,
      },
      armedSilent(d, ce, round) {
        const y = d.season, tn = tenure(d, ce);
        if (tn === 3 && round >= 2 && !seen(ce, "jsu_y1")) { mark(ce, "jsu_y1"); return "jsu_y1"; }
        if (tn === 6 && round >= 2 && !seen(ce, "jsu_y2")) { mark(ce, "jsu_y2"); return "jsu_y2"; }
        if (tn === 10 && round >= 2 && !seen(ce, "jsu_y3")) { mark(ce, "jsu_y3"); return "jsu_y3"; }
        if (tn === 13 && round >= 2 && !seen(ce, "jsu_y4")) { mark(ce, "jsu_y4"); return "jsu_y4"; }
        if (y === 2014 && round >= 3 && !seen(ce, "jsu_tc1")) { mark(ce, "jsu_tc1"); return "jsu_tc1"; }     // 跑起来
        if (y === 2015 && round >= 18 && !seen(ce, "jsu_tc2")) { mark(ce, "jsu_tc2"); return "jsu_tc2"; }    // 杯赛冠军教头
        if (y === 2016 && round >= 4 && !seen(ce, "jsu_tx1")) { mark(ce, "jsu_tx1"); return "jsu_tx1"; }     // 标王 2 月
        if (y === 2016 && round >= 8 && !seen(ce, "jsu_wx2")) { mark(ce, "jsu_wx2"); return "jsu_wx2"; }     // 袖标
        if (y === 2016 && round >= 12 && !seen(ce, "jsu_tc3")) { mark(ce, "jsu_tc3"); return "jsu_tc3"; }    // 韩国教头 6 月
        if (y === 2017 && round >= 14 && !seen(ce, "jsu_tc4")) { mark(ce, "jsu_tc4"); return "jsu_tc4"; }    // 意大利名帅
        if (y === 2018 && round >= 20 && !seen(ce, "jsu_tc5")) { mark(ce, "jsu_tc5"); return "jsu_tc5"; }    // 奥拉罗尤
        if (y === 2020 && round >= 8 && !seen(ce, "jsu_jy3")) { mark(ce, "jsu_jy3"); return "jsu_jy3"; }     // 限薪令
        if (y === 2021 && round >= 2 && !seen(ce, "jsu_tc6")) { mark(ce, "jsu_tc6"); return "jsu_tc6"; }     // 用冠军标准上完课
        if (y === 2021 && round >= 2 && seen(ce, "jsu_tc6") && !seen(ce, "jsu_xj2")) { mark(ce, "jsu_xj2"); return "jsu_xj2"; } // 队群消息
        if (y === 2021 && round >= 6 && !seen(ce, "jsu_tx5")) { mark(ce, "jsu_tx5"); return "jsu_tx5"; }     // 特谢拉离队
        if (y === 2021 && round >= 6 && seen(ce, "jsu_tx5") && !seen(ce, "jsu_xj4")) { mark(ce, "jsu_xj4"); return "jsu_xj4"; } // 球迷集结
        if (y === 2021 && round >= 10 && !seen(ce, "jsu_js3")) { mark(ce, "jsu_js3"); return "jsu_js3"; }    // 吉翔恒北上
        if (y === 2021 && round >= 12 && !seen(ce, "jsu_xj5")) { mark(ce, "jsu_xj5"); return "jsu_xj5"; }    // 各自天涯
        return null;
      },
      pickPre(d, ce, opp, comp, isCc, isFinal) {
        if (isCc && d.season >= 2016 && !seen(ce, "jsu_am1")) { mark(ce, "jsu_am1"); return card("jsu_am1"); }              // 洲际首夜
        if (isCc && d.season >= 2017 && comp.indexOf("淘汰") >= 0 && !seen(ce, "jsu_am2")) { mark(ce, "jsu_am2"); return card("jsu_am2"); } // 淘汰赛之夜
        return null;
      },
      onSeasonEndExtra(state, d, ce, myRank, table, lgChamp, prevChamp) {
        const cupChamp = !!(d.cup && d.cup.alive === "champion");
        if (cupChamp) ce.cupCnt = (ce.cupCnt || 0) + 1;
        if (cupChamp && (ce.cupCnt || 0) >= 2 && !seen(ce, "jsu_lg4")) queue(ce, "jsu_lg4");          // 杯赛再夺
        if (myRank === 2 && !seen(ce, "jsu_reg4") && !(prevChamp && !lgChamp)) queue(ce, "jsu_reg4"); // 亚军之夜（同年让位 reg1）
        if (myRank >= 12 && myRank <= table.length && d.season >= 2016 && !seen(ce, "jsu_reg5")) queue(ce, "jsu_reg5"); // 下半区的日子
      },
      closedHook(state, d, ce) {
        if (ce.jsuClosed || d.season >= 2021) {
          ce.jsuClosed = true;
          if (d.contract) d.contract.years = 0;          // 季末 genTransferOffers 自由身多一份报价
          ce.sh4Armed = true;                            // 复用停运静默豁免字段（终章卡可触发）
          ce.sh3Armed = true;
          if (!seen(ce, "jsu_xj3")) queue(ce, "jsu_xj3");      // 停运讣告强制卡（2021 季初恒触发）
          else if (!seen(ce, "jsu_sh3")) queue(ce, "jsu_sh3"); // 留队兜底：终章
        }
      },
      afterCloseSilent: null,
    },
    lno: {
      name: "辽沈虎师", slot: "lno", roster: LNO_ROSTER, alive: lnoAlive,
      cc0: 0, ccEver0: false, st1: "lno_st1", closedFlag: "lnoClosed", closedYear: 2020,
      aftermathIds: ["lno_after_tifo", "lno_after_street"],
      relegationArmed: false, prefix: "lno",
      INIT: { lno_sh1: 2023, lno_sh2: 2024 },
      SETTLE: { lno_zj4: y => y === 2016 },
      AMBIENT: [
        "lno_st2", "lno_st3", "lno_st4", "lno_st5",
        "lno_zj1", "lno_zj2", "lno_zj5", "lno_zj6", "lno_zj7", "lno_zj8", "lno_zj9",
        "lno_cl1", "lno_cl2", "lno_cl4", "lno_cl5",
        "lno_zl1", "lno_zl3", "lno_zl4",
        "lno_ys1", "lno_ys3",
        "lno_jy1", "lno_jy2", "lno_jy3", "lno_jy5",
        "lno_ct1", "lno_ct2", "lno_ct3", "lno_ct4", "lno_ct5", "lno_ct6",
        "lno_fn1", "lno_fn2", "lno_fn3", "lno_fn4", "lno_fn5",
        "lno_xj1", "lno_xj2",
      ],
      GUARDS: {
        lno_st2: (d, ce) => d.season === ce.joinSeason,
        lno_st3: (d, ce) => d.season === ce.joinSeason,
        lno_st4: (d, ce) => d.season === ce.joinSeason,
        lno_st5: (d, ce) => d.season === ce.joinSeason,
        lno_zj1: d => d.season <= 2015,
        lno_zj2: d => d.season >= 2014 && d.season <= 2016,
        lno_zj5: (d, ce) => seen(ce, "lno_zj4") && d.season >= 2017 && d.season <= 2019,
        lno_zj6: d => d.season >= 2019 && d.season <= 2020,
        lno_zj7: (d, ce) => seen(ce, "lno_xj3"),
        lno_zj8: (d, ce) => seen(ce, "lno_xj3") && d.season >= 2021,
        lno_zj9: (d, ce) => seen(ce, "lno_xj3") && d.season >= 2022,
        lno_cl1: d => d.season <= 2015,
        lno_cl2: d => d.season >= 2014 && d.season <= 2016,
        lno_cl4: (d, ce) => seen(ce, "lno_cl3") && d.season >= 2017 && d.season <= 2020,
        lno_cl5: (d, ce) => seen(ce, "lno_xj3") && d.season >= 2021,
        lno_zl1: d => d.season <= 2015,
        lno_zl3: d => d.season >= 2017 && d.season <= 2020,
        lno_zl4: (d, ce) => seen(ce, "lno_zl2") && d.season >= 2017 && d.season <= 2019,
        lno_ys1: d => d.season <= 2015,
        lno_ys3: d => d.season >= 2017 && d.season <= 2019,
        lno_jy1: d => d.season >= 2014 && d.season <= 2016,
        lno_jy2: d => d.season >= 2015 && d.season <= 2017,
        lno_jy3: d => d.season >= 2019 && d.season <= 2020,
        lno_jy5: d => d.season >= 2020,
        lno_ct1: () => true,
        lno_ct2: () => true,
        lno_ct3: () => true,
        lno_ct4: () => true,
        lno_ct5: () => true,
        lno_ct6: () => true,
        lno_fn1: d => d.season <= 2016,
        lno_fn2: d => d.season <= 2016,
        lno_fn3: d => d.season <= 2017,
        lno_fn4: d => d.season >= 2018,
        lno_fn5: () => true,
        lno_xj1: d => d.season >= 2019 && d.season <= 2020,
        lno_xj2: d => d.season === 2020,
      },
      armedSilent(d, ce, round) {
        const y = d.season, tn = tenure(d, ce);
        if (tn === 3 && round >= 2 && !seen(ce, "lno_y1")) { mark(ce, "lno_y1"); return "lno_y1"; }
        if (tn === 6 && round >= 2 && !seen(ce, "lno_y2")) { mark(ce, "lno_y2"); return "lno_y2"; }
        if (tn === 10 && round >= 2 && !seen(ce, "lno_y3")) { mark(ce, "lno_y3"); return "lno_y3"; }
        if (tn === 13 && round >= 2 && !seen(ce, "lno_y4")) { mark(ce, "lno_y4"); return "lno_y4"; }
        if (y === 2014 && round >= 3 && !seen(ce, "lno_tc1")) { mark(ce, "lno_tc1"); return "lno_tc1"; }    // 先活下来
        if (y === 2016 && round >= 2 && !seen(ce, "lno_tc2")) { mark(ce, "lno_tc2"); return "lno_tc2"; }     // 防反定位球
        if (y === 2016 && round >= 8 && !seen(ce, "lno_zl2")) { mark(ce, "lno_zl2"); return "lno_zl2"; }     // 张鹭楷被卖
        if (y === 2016 && round >= 14 && !seen(ce, "lno_ys2")) { mark(ce, "lno_ys2"); return "lno_ys2"; }    // 杨善骏被卖
        if (y === 2016 && round >= 20 && !seen(ce, "lno_zj3")) { mark(ce, "lno_zj3"); return "lno_zj3"; }    // 最后一圈
        if (y === 2016 && round >= 24 && !seen(ce, "lno_cl3")) { mark(ce, "lno_cl3"); return "lno_cl3"; }    // 老查离队
        if (y === 2017 && round >= 16 && !seen(ce, "lno_tc3")) { mark(ce, "lno_tc3"); return "lno_tc3"; }    // 录像室
        if (y === 2018 && round >= 6 && !seen(ce, "lno_tc4")) { mark(ce, "lno_tc4"); return "lno_tc4"; }     // 中甲 立住
        if (y === 2019 && round >= 8 && !seen(ce, "lno_tc5")) { mark(ce, "lno_tc5"); return "lno_tc5"; }     // 活着
        if (y === 2020 && round >= 2 && !seen(ce, "lno_tc6")) { mark(ce, "lno_tc6"); return "lno_tc6"; }     // 先训练
        if (y === 2020 && round >= 2 && seen(ce, "lno_tc6") && !seen(ce, "lno_jy4")) { mark(ce, "lno_jy4"); return "lno_jy4"; } // 走廊等消息
        if (y === 2020 && round >= 8 && !seen(ce, "lno_xj4")) { mark(ce, "lno_xj4"); return "lno_xj4"; }     // 横幅签名
        if (y === 2020 && round >= 12 && !seen(ce, "lno_xj5")) { mark(ce, "lno_xj5"); return "lno_xj5"; }    // 最后合影
        return null;
      },
      pickPre(d, ce, opp, comp, isCc, isFinal) {
        if (isCc && d.season >= 2015 && !seen(ce, "lno_am1")) { mark(ce, "lno_am1"); return card("lno_am1"); }              // 洲际首夜
        if (isCc && d.season >= 2016 && comp.indexOf("淘汰") >= 0 && !seen(ce, "lno_am2")) { mark(ce, "lno_am2"); return card("lno_am2"); } // 淘汰赛之夜
        return null;
      },
      onSeasonEndExtra(state, d, ce, myRank, table, lgChamp, prevChamp) {
        const cupChamp = !!(d.cup && d.cup.alive === "champion");
        if (cupChamp) ce.cupCnt = (ce.cupCnt || 0) + 1;
        if (cupChamp && (ce.cupCnt || 0) >= 2 && !seen(ce, "lno_lg4")) queue(ce, "lno_lg4");          // 杯赛再夺
        if (myRank === 2 && !seen(ce, "lno_reg4") && !(prevChamp && !lgChamp)) queue(ce, "lno_reg4"); // 亚军之夜（同年让位 reg1）
        if (myRank >= 13 && myRank <= table.length && !seen(ce, "lno_reg5")) queue(ce, "lno_reg5");   // 保级之夜（降级区边缘）
      },
      closedHook(state, d, ce) {
        if (ce.lnoClosed || d.season >= 2020) {
          ce.lnoClosed = true;
          if (d.contract) d.contract.years = 0;          // 季末自由身多一份报价
          ce.sh4Armed = true;                            // 停运静默豁免字段（复用）
          ce.sh3Armed = true;
          if (!seen(ce, "lno_xj3")) queue(ce, "lno_xj3");      // 解散讣告强制卡（2020 季初恒触发）
          else if (!seen(ce, "lno_sh3")) queue(ce, "lno_sh3"); // 留队兜底：终章
        }
      },
      afterCloseSilent: null,
    },
  };

  /* ── 存档槽位（通用）── */
  function ensureOf(d, slot) {
    const cfg = CFG[slot];
    d.clubEvents = d.clubEvents || {};
    d.clubEvents[slot] = d.clubEvents[slot] || {
      joinSeason: null, entry: null, midJoin: false, prevClubs: [],
      seen: {}, pending: [], lowStreak: 0, lastClubRound: -99,
      clubGoals: 0, clubApps: 0, lastRank: 0, lastChamp: false, firstTitle: false,
      lgEver: false, ccEver: cfg.ccEver0, cupEver: false, lastCcChamp: false,
      cc: cfg.cc0, ccStreak: 0, lgCnt: 0,
      relegated: false, gvClosed: false, sh4Armed: false, aftermathDone: false,
      farewellDone: false, forever: false,
    };
    return d.clubEvents[slot];
  }
  const seen = (ce, id) => !!ce.seen[id];
  const mark = (ce, id) => { ce.seen[id] = true; };
  function queue(ce, id) { if (!seen(ce, id)) { ce.pending.push(id); mark(ce, id); } }
  function tenure(d, ce) { return ce.joinSeason == null ? 0 : (d.season - ce.joinSeason); }

  /* ── 槽判定 ── */
  function slotOf(d) {
    if (!d || d.clubId == null) return null;
    for (const key of Object.keys(CFG)) {
      const t = teamInLD(CFG[key].name);
      if (t && d.clubId === t.id) return key;
    }
    return null;
  }

  /* ── P81k 停运是历史事件：玩家不在队也要结算（只置位，不动合同、不发讣告卡） ── */
  function closedSweep(state) {
    const d = state.data;
    if (!d || d.retired) return;
    for (const key of Object.keys(CFG)) {
      const cfg = CFG[key];
      if (!cfg.closedFlag || !cfg.closedYear) continue;
      const t = teamInLD(cfg.name);
      if (t && d.clubId === t.id) continue;              // 在队 → 正常 closedHook（含合同作废与强制讣告）
      const ce = ensureOf(d, key);
      if (ce[cfg.closedFlag]) continue;
      if (d.season >= cfg.closedYear) {
        ce[cfg.closedFlag] = true;
        ce.sh4Armed = true;
        ce.sh3Armed = true;
      }
    }
  }

  /* ── P81k 停运后余韵槽：曾停运 + 玩家已离队 + 余韵卡未出完 → 该槽继续出「后继球队」卡 ── */
  function aftermathSlot(d) {
    if (!d || d.retired) return null;
    for (const key of Object.keys(CFG)) {
      const cfg = CFG[key];
      if (!cfg.closedFlag || !cfg.aftermathIds || !cfg.aftermathIds.length) continue;
      const t = teamInLD(cfg.name);
      if (t && d.clubId === t.id) continue;              // 仍在队 → 留队路线由终章卡处理
      const ce = (d.clubEvents || {})[key];
      if (!ce || !ce[cfg.closedFlag] || ce.aftermathDone) continue;
      return key;
    }
    return null;
  }
  const cfgOf = slot => CFG[slot];

  /* ── 阵容重建（windows 模式，通用）── */
  const _baseCache = {};
  function baseOf(cfg) {
    if (!_baseCache[cfg.slot]) {
      _baseCache[cfg.slot] = [];
      const lg = (window.REAL_DATA && window.REAL_DATA.leagues && window.REAL_DATA.leagues.csl) || null;
      if (lg) for (const t of lg.teams) if (t[0] === cfg.name) _baseCache[cfg.slot] = (t[2] || []).slice();
    }
    return _baseCache[cfg.slot];
  }
  function rebuildSquad(d, cfg) {
    const t = teamInLD(cfg.name);
    if (!t) return;
    const tn = d.season - 2014;
    let arr = baseOf(cfg).slice();
    for (const r of cfg.roster) {
      const [name, wins, age0, pos, nat, ovr] = r;
      const ws = Array.isArray(wins[0]) ? wins : [wins];
      const inWindow = ws.some(w => tn >= w[0] && tn < w[1]);
      if (inWindow && !arr.some(p => p[0] === name)) {
        const w0 = ws.find(w => tn >= w[0] && tn < w[1]);
        arr = arr.concat([[name, Math.min(35, age0 + Math.max(0, tn - w0[0])), pos, nat, ovr]]);
      }
    }
    arr = arr.filter(p => {
      const r = cfg.roster.find(r2 => r2[0] === p[0]);
      if (!r) return true;                       // base 球员不在窗口表 → 始终保留
      const ws = Array.isArray(r[1][0]) ? r[1] : [r[1]];
      return ws.some(w => tn >= w[0] && tn < w[1]);
    });
    t.players = arr;
  }

  /* ── onResult 精确 armed（通用：lg5/reg2/reg3 按槽前缀）── */
  /* 荣誉卡 id 解析：gv 槽历史命名为 gl*（honorMap 映射），shp 槽统一 lg* */
  const lid = (cfg, n) => (cfg.honorMap && cfg.honorMap[n]) || (cfg.prefix + "_" + n);
  function armedOnResult(d, ce, cfg, ctx) {
    const comp = String(ctx.comp || ""), res = ctx.res;
    const isCc = comp.indexOf("洲际") >= 0, isFinal = comp.indexOf("决赛") >= 0;
    if (isCc && isFinal && res === "win" && !seen(ce, lid(cfg, "lg5"))) { queue(ce, lid(cfg, "lg5")); ce.cc += 1; ce.ccStreak = (ce.ccStreak || 0) + 1; }
    if (isCc && isFinal && res === "lose" && !seen(ce, cfg.prefix + "_reg2")) queue(ce, cfg.prefix + "_reg2");   // 与 lg5 互斥（win/lose）
    if (isCc && !isFinal && res === "lose" && !seen(ce, cfg.prefix + "_reg3")) queue(ce, cfg.prefix + "_reg3");  // 淘汰赛出局（决赛前）
  }

  /* ── 派发实现（通用，按 cfg 分流）── */
  function onInitSeasonMine(state, clubId) {
    const d = state.data;
    const slot = slotOf(d); if (!slot) return;
    const cfg = cfgOf(slot);
    const ce = ensureOf(d, slot);
    if (ce.joinSeason == null) {
      ce.joinSeason = d.season;   /* 批5⑨：原「行内第二个语句」（entry 字面量死值）已删 —— 写后即废（:926 两行后即覆盖、全仓零读取）。★ 只删第二个语句、保留本语句；**禁止整行删**（整行删 ⇒ :926→:925，撞坏锚点区间）。 */
      ce.midJoin = d.season > 2014;
      ce.entry = (window.Youth ? Youth.entryOf(d) : ((d.player && d.player.age < 24) ? "youth" : "star"));   // L8 身份档（对齐 club_events3）
    }
    rebuildSquad(d, cfg);
    ce.lastClubRound = -99;                          // P70b 口径：跨季重置轮次窗
    /* INIT 绝对年锚 */
    for (const id of Object.keys(cfg.INIT)) if (d.season === cfg.INIT[id] && !seen(ce, id)) queue(ce, id);
    /* 停运钩子（仅 gv） */
    if (cfg.closedHook) safe(() => cfg.closedHook(state, d, ce), null);
  }
  function onSeasonEndMine(state) {
    const d = state.data;
    const slot = slotOf(d); if (!slot) return;
    const cfg = cfgOf(slot);
    const ce = ensureOf(d, slot);
    const ss = d.seasonStats || {};
    ce.clubGoals += (ss.goals || 0); ce.clubApps += (ss.apps || 0);
    const table = (window.SeasonSystem ? SeasonSystem.standings(state) : []) || [];
    const myRank = table.findIndex(x => x.id === d.clubId) + 1 || ce.lastRank || 99;
    ce.lastRank = myRank;
    const cupChamp = !!(d.cup && d.cup.alive === "champion");
    const ccChamp = !!(d.cc && d.cc.alive === "champion");
    const lgChamp = myRank === 1;
    const p = cfg.prefix;
    /* SETTLE 绝对年锚 */
    for (const id of Object.keys(cfg.SETTLE)) if (!seen(ce, id) && cfg.SETTLE[id](d.season)) queue(ce, id);
    /* 荣誉 armed（守卫保证序数，正文无序数） */
    if (lgChamp) {
      if (!ce.lgEver) { ce.lgEver = true; ce.firstTitle = true; queue(ce, lid(cfg, "lg1")); if (cfg.alive.wl && cfg.alive.wl(d)) queue(ce, p + "_wl3"); } // 首冠（shp 联动 wl3；gv 的 wl3 不存在由 card() 兜底过滤）
      else if (ce.lastChamp && !seen(ce, lid(cfg, "lg2"))) queue(ce, lid(cfg, "lg2"));                        // 卫冕
      else if (seen(ce, p + "_reg1") && !seen(ce, p + "_reg1b")) queue(ce, p + "_reg1b");           // 丢冠次季夺回
    } else if (ce.lastChamp && !seen(ce, p + "_reg1")) {
      queue(ce, p + "_reg1");                                                                     // 卫冕失败=丢冠之夜
    }
    if (lgChamp) { ce.lgEver = true; ce.lgCnt = (ce.lgCnt || 0) + 1; }
    if (cupChamp && !ce.cupEver) { ce.cupEver = true; queue(ce, lid(cfg, "lg3")); }                    // 杯赛首冠
    if (ccChamp) { ce.cc += 1; ce.ccStreak = (ce.ccStreak || 0) + 1; }                            // armed lg5 在 onResult 已入队
    const prevChamp = ce.lastChamp;
    ce.lastChamp = lgChamp;
    /* 槽位附加 armed（shp sh3 王朝） */
    if (cfg.onSeasonEndExtra) safe(() => cfg.onSeasonEndExtra(state, d, ce, myRank, table, lgChamp, prevChamp), null);
    /* 降级 armed（仅 gv）：末两席 → wj5 降级区（与 Division.RELEG 同口径）；
       降级后身处次级联赛（中甲）→ wj7 差的那一小步（升级线前一名）/ wj6 中甲的一年 */
    if (cfg.relegationArmed && myRank >= table.length - 1 && table.length > 0 && !seen(ce, "gv_wj5")) { queue(ce, "gv_wj5"); ce.relegated = true; }
    const inLowerDiv = !!(cfg.relegationArmed && ce.relegated && window.Division && Division.level(d) === 2);
    if (inLowerDiv && myRank === 3 && !seen(ce, "gv_wj7")) queue(ce, "gv_wj7");
    if (inLowerDiv && !seen(ce, "gv_wj6")) queue(ce, "gv_wj6");
  }
  function pickSilentMine(state, ctxs) {
    const d = state.data;
    const norm = slotOf(d);
    const after = norm ? null : aftermathSlot(d);      // 玩家不在任何槽队伍时，停运余韵槽接棒
    const slot = norm || after;
    if (!slot) return null;
    const cfg = cfgOf(slot);
    const ce = ensureOf(d, slot);
    if (cfg.closedFlag && ce[cfg.closedFlag] && !ce.sh4Armed && !after) return null; // 停运后静默（终章/余韵除外）
    const ctx = (ctxs && ctxs.length) ? ctxs[ctxs.length - 1] : {};
    const round = ctx.round || 0;
    /* armed 锚豁免 6 轮间隔闸（L5/踩坑3：赛前叙事不受氛围闸，真实月序锚链不可被节流吞卡） */
    const armed = safe(() => cfg.armedSilent(d, ce, round), null);
    if (armed) { ce.lastClubRound = round; return card(armed); }
    const gap = round - ce.lastClubRound;
    if (gap < 6) return null;
    /* 停运余韵：后继球队彩蛋卡（每槽 aftermathIds 逐张出，出完置 aftermathDone 静默） */
    if (after) {
      const rem = cfg.aftermathIds.filter(id => !seen(ce, id));
      if (!rem.length) { ce.aftermathDone = true; return null; }
      mark(ce, rem[0]);
      ce.lastClubRound = round;
      return card(rem[0]);
    }
    for (const id of cfg.AMBIENT) {
      if (seen(ce, id)) continue;
      const g = cfg.GUARDS[id];
      if (g && !safe(() => g(d, ce), false)) continue;
      mark(ce, id);                                  // P81k 修复：氛围卡必须标记（对齐 CE1 markS 口径），否则同一张反复出
      ce.lastClubRound = round;
      return card(id);
    }
    return null;
  }
  function noteSilentMine(state, ctxs) {
    const d = state.data;
    const slot = slotOf(d); if (!slot) return;
    const ce = ensureOf(d, slot);
    const last = (ctxs && ctxs.length) ? ctxs[ctxs.length - 1] : null;
    if (last && last.rating != null) ce.lowStreak = last.rating < 6.0 ? (ce.lowStreak + 1) : 0;
  }
  function pickPreMine(state, fixture) {
    const d = state.data;
    const slot = slotOf(d); if (!slot) return null;
    const cfg = cfgOf(slot);
    const ce = ensureOf(d, slot);
    const opp = String(fixture && fixture.oppName || "");
    const comp = String(fixture && fixture.comp || "");
    const isCc = comp.indexOf("洲际") >= 0, isFinal = comp.indexOf("决赛") >= 0;
    return safe(() => cfg.pickPre(d, ce, opp, comp, isCc, isFinal), null);
  }
  function onResultMine(state, ctx, onDone) {
    const d = state.data;
    const slot = slotOf(d); if (!slot) return false;
    const cfg = cfgOf(slot);
    const ce = ensureOf(d, slot);
    safe(() => armedOnResult(d, ce, cfg, ctx), null);
    return false;
  }
  function consumePendingMine(state) {
    const d = state.data;
    const slot = slotOf(d); if (!slot) return false;
    const cfg = cfgOf(slot);
    const ce = ensureOf(d, slot);
    if (ce.pending && ce.pending.length) {
      const id = ce.pending.shift();
      if (!card(id)) return consumePendingMine(state);
      showC(state, id, {}, () => { if (window.State) State.save(); });
      return true;
    }
    /* 开局首卡延迟检查：出场 3 场后派 st1（双口径 bodyStar 由 showC 处理） */
    if (!seen(ce, cfg.st1) && ((d.seasonStats && d.seasonStats.apps) || 0) >= 3) {
      mark(ce, cfg.st1);
      showC(state, cfg.st1, {}, () => { if (window.State) State.save(); });
      return true;
    }
    return false;
  }
  function showC(state, id, ctx, onDone) {
    const c = card(id);
    if (!c) { onDone && onDone(); return false; }
    const d0 = state.data;
    const slot = slotOf(d0);
    const ce = slot ? ensureOf(d0, slot) : {};
    if (!ce.seen) ce.seen = {};
    if (!ce.seen[id]) mark(ce, id);
    const cc = Object.assign({}, c);
    if (cc.bodyStar && ce.entry === "star") cc.body = cc.bodyStar;
    if (cc.options) cc.options = cc.options.map(o => ({ text: o.text, response: o.response, fx: o.fx, badge: o.badge }));
    try {
      window.EventCards._showCard(state, cc, { ctx: Object.assign({ d: d0 }, ctx) }, () => {
        const self = cc.options && cc.options.find(o => o.badge);
        if (self && self.badge) {
          const dd = state.data;
          dd.trophies = dd.trophies || [];
          dd.trophies.push({ name: self.badge, icon: "", season: dd.season });
          if (window.State) State.save();
        }
        onDone && onDone();
      });
      return true;
    } catch (e) { onDone && onDone(); return false; }
  }

  /* ── 对外派发（前四期槽位优先，本引擎接管 gv/shp）── */
  const mine = {
    onInitSeason: onInitSeasonMine, onSeasonEnd: onSeasonEndMine, pickSilent: pickSilentMine,
    noteSilent: noteSilentMine, pickPre: pickPreMine, onResult: onResultMine,
    consumePending: consumePendingMine,
  };
  window.ClubEvents = {
    ensure: d => { const slot = slotOf(d); return slot ? ensureOf(d, slot) : CE4.ensure(d); },
    onInitSeason: (state, clubId) => { safe(() => CE4.onInitSeason(state, clubId)); safe(() => mine.onInitSeason(state, clubId)); safe(() => closedSweep(state)); },
    onSeasonEnd: state => { safe(() => CE4.onSeasonEnd(state)); safe(() => mine.onSeasonEnd(state)); safe(() => closedSweep(state)); },
    pickSilent: (state, ctxs) => { const c = safe(() => CE4.pickSilent(state, ctxs), null); if (c) return c; return safe(() => mine.pickSilent(state, ctxs), null); },
    noteSilent: (state, ctxs) => { safe(() => CE4.noteSilent(state, ctxs)); safe(() => mine.noteSilent(state, ctxs)); },
    pickPre: (state, fixture) => { const c = safe(() => CE4.pickPre(state, fixture), null); if (c) return c; return safe(() => mine.pickPre(state, fixture), null); },
    onResult: (state, ctx, onDone) => { let h = safe(() => CE4.onResult(state, ctx, onDone), false); if (h) return true; return !!safe(() => mine.onResult(state, ctx, onDone), false); },
    consumePending: state => {
      const slot = state && state.data ? slotOf(state.data) : null;
      if (slot) return !!safe(() => mine.consumePending(state), false);
      return !!safe(() => CE4.consumePending(state), false);
    },
    foreverOn: d => !!safe(() => CE4.foreverOn(d), false),
    canForever: d => !!safe(() => CE4.canForever(d), false),
    showForever: (state, rerender) => !!safe(() => CE4.showForever(state, rerender), false),
    retentionOverride: (state, done) => !!safe(() => CE4.retentionOverride(state, done), false),
    onFrozen: state => { safe(() => CE4.onFrozen(state)); },
    onLeave: (state, from) => { safe(() => CE4.onLeave(state, from)); },
    /* ★ P97：逐层转发 `foreverLabel`（见 club_events2.js 的同名注释） */
    foreverLabel: CE4.foreverLabel,
    atDor: CE4.atDor, reusAlive: CE4.reusAlive,
    /* P81k 停运余韵调试口 */
    _closed: {
      sweep: state => safe(() => closedSweep(state), null),
      slotOfAftermath: d => safe(() => aftermathSlot(d), null),
      aftermathIds: key => (CFG[key] && CFG[key].aftermathIds) || [],
    },
    /* P81/P81c 调试口 */
    _gv: {
      slotOf, ensureOf, card, armedOnResult,
      rebuildSquad, armedSilent: (d, ce, round) => safe(() => CFG.gv.armedSilent(d, ce, round), null),
      GUARDS: CFG.gv.GUARDS, ROSTER: GV_ROSTER,
    },
    _shp: {
      slotOf, ensureOf, card, armedOnResult,
      rebuildSquad, armedSilent: (d, ce, round) => safe(() => CFG.shp.armedSilent(d, ce, round), null),
      GUARDS: CFG.shp.GUARDS, ROSTER: SHP_ROSTER,
    },
    _bja: {
      slotOf, ensureOf, card, armedOnResult,
      rebuildSquad, armedSilent: (d, ce, round) => safe(() => CFG.bja.armedSilent(d, ce, round), null),
      GUARDS: CFG.bja.GUARDS, ROSTER: BJA_ROSTER,
    },
    _tan: {
      slotOf, ensureOf, card, armedOnResult,
      rebuildSquad, armedSilent: (d, ce, round) => safe(() => CFG.tan.armedSilent(d, ce, round), null),
      GUARDS: CFG.tan.GUARDS, ROSTER: TAN_ROSTER,
    },
    _shs: {
      slotOf, ensureOf, card, armedOnResult,
      rebuildSquad, armedSilent: (d, ce, round) => safe(() => CFG.shs.armedSilent(d, ce, round), null),
      GUARDS: CFG.shs.GUARDS, ROSTER: SHS_ROSTER,
    },
    _jsu: {
      slotOf, ensureOf, card, armedOnResult,
      rebuildSquad, armedSilent: (d, ce, round) => safe(() => CFG.jsu.armedSilent(d, ce, round), null),
      GUARDS: CFG.jsu.GUARDS, ROSTER: JSU_ROSTER,
    },
    _lno: {
      slotOf, ensureOf, card, armedOnResult,
      rebuildSquad, armedSilent: (d, ce, round) => safe(() => CFG.lno.armedSilent(d, ce, round), null),
      GUARDS: CFG.lno.GUARDS, ROSTER: LNO_ROSTER,
    },
  };
})();
