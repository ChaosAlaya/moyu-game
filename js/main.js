/* 摸鱼大作战 - 入口装配：单一状态对象 + 动作 + localStorage 持久化 */
(function (g) {
  'use strict';
  var D = g.GameData;
  var Engine = g.GameEngine.Engine;
  var UI = g.GameUI;
  var Sfx = g.GameSfx;

  var SAVE_KEY = 'moyu_save_v1';

  function defaultSave() {
    return {
      saveVer: g.GameEngine.SAVE_VERSION,
      unlocks: { xiaoq: true, shengfan: false, jihuang: false, shuanglaoya: false },
      maxFloor: 0, wins: 0, runs: 0,
      codex: { cards: {}, relics: {}, enemies: {} },
      history: [],
      stats: g.GameEngine.defaultStats() // 统计（成就系统铺路）
    };
  }

  function loadSave() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        // 版本迁移（无版本号旧档视为 v1）；JSON 损坏/结构非法 → null → 回退默认存档
        var sv = g.GameEngine.migrateSave(JSON.parse(raw));
        if (!sv) return defaultSave();
        var d = defaultSave();
        // 合并缺省字段，防止旧存档缺键
        for (var k in d) if (!(k in sv)) sv[k] = d[k];
        for (var k2 in d.codex) if (!(k2 in sv.codex)) sv.codex[k2] = {};
        for (var k3 in d.unlocks) if (!(k3 in sv.unlocks)) sv.unlocks[k3] = d.unlocks[k3];
        sv.stats = g.GameEngine.normalizeStats(sv.stats); // stats 子字段自愈
        return sv;
      }
    } catch (e) { /* file:// 或隐私模式下忽略（JSON 损坏也走这里回退默认） */ }
    return defaultSave();
  }

  function persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(Game.state.save)); } catch (e) {}
  }

  var Game = {
    state: {
      screen: 'title',
      save: loadSave(),
      engine: null, run: null,
      node: null, reward: null, shop: null,
      eventId: null, eventResult: null,
      selecting: null, screenBeforeCodex: null, codexTab: 'cards',
      newUnlocks: [],
      animating: false,       // 战斗动画编排期间锁输入
      runSave: null,          // 未完成对局快照（标题【继续游戏】按钮）
      showRushConfirm: false, // Rush 继承确认弹层
      playerPose: 'stage',    // 当前玩家立绘姿势（stage/attack/hit/low）
      touch: (typeof matchMedia !== 'undefined') && matchMedia('(hover: none)').matches,
      cardConfirm: null       // 移动端：待确认出牌的手牌下标
    }
  };

  var S = Game.state;

  /* ---------- 对局实时存档（节点级快照，防误关丢进度） ---------- */
  // 粒度：每完成一个节点（战斗领奖/商店离开/事件结束/休息结束）持久化一次；
  // 战斗中误关 = 该节点未完成，回到上一快照（节点开始前）。独立 key，与元数据存档分离。
  var RUN_SAVE_KEY = 'moyu_run_save';
  function runSnapshot() {
    var r = S.run;
    return {
      v: 1,
      charId: r.charId, act: r.act, step: r.step,
      hp: r.hp, maxHp: r.maxHp, gold: r.gold,
      deck: r.deck.map(function (c) { return { uid: c.uid, id: c.id, up: c.up, costMod: c.costMod || 0 }; }),
      relics: r.relics.slice(),
      equippedRelics: (r.equippedRelics || []).slice(),
      seenEvents: (r.seenEvents || []).slice(),
      seen: JSON.parse(JSON.stringify(r.seen)),
      map: r.map, lastNodeType: r.lastNodeType || null,
      floorsCleared: r.floorsCleared, path: (r.path || []).slice(),
      uidCounter: r.uidCounter
    };
  }
  function runPersist() {
    if (!S.run || S.run.over || (S.run.rush && S.run.rush.active)) return;
    var snap = runSnapshot();
    try { localStorage.setItem(RUN_SAVE_KEY, JSON.stringify(snap)); } catch (e) { /* 写失败静默容错 */ }
    S.runSave = snap;
  }
  function runLoadSave() {
    var raw = null;
    try { raw = localStorage.getItem(RUN_SAVE_KEY); } catch (e) { return null; }
    if (!raw) return null;
    var snap = null;
    try { snap = JSON.parse(raw); } catch (e) { snap = null; }
    // JSON 损坏或结构非法：静默清除，标题不再显示【继续游戏】
    if (!g.GameEngine.validRunSnapshot(snap)) {
      try { localStorage.removeItem(RUN_SAVE_KEY); } catch (e2) {}
      return null;
    }
    return snap;
  }
  function runClearSave() {
    try { localStorage.removeItem(RUN_SAVE_KEY); } catch (e) {}
    S.runSave = null;
  }
  // 标题【继续游戏】：恢复到对应层地图界面
  Game.continueRun = function () {
    var snap = runLoadSave();
    if (!snap || !snap.charId || !snap.deck || !snap.map || !D.characters[snap.charId]) {
      runClearSave();
      UI.toast('没有可继续的对局');
      return;
    }
    try {
      S.engine = new Engine();
      S.engine.newRun(snap.charId); // 建完整 state 骨架后用快照覆盖持久化字段
      var st = S.engine.state;
      ['act', 'step', 'hp', 'maxHp', 'gold', 'deck', 'relics', 'equippedRelics',
        'seenEvents', 'seen', 'map', 'lastNodeType', 'floorsCleared', 'uidCounter'].forEach(function (k) {
        if (snap[k] !== undefined) st[k] = snap[k];
      });
      st.path = snap.path || [];
      st.combat = null; // 战斗中误关：该节点重新挑战
      S.run = st;
      S.animating = false;
      S.playerPose = 'stage';
      S.runSave = snap;
      syncSave();
      S.screen = 'map';
      render();
    } catch (e) {
      console.warn('run 存档恢复失败', e);
      runClearSave();
      UI.toast('对局存档损坏，已清除');
    }
  };


  function render() {
    // 低血姿势常驻（仅在 stage/low 两态间自动切换，不打断 attack/hit 演出）
    if (S.run && (S.playerPose === 'stage' || S.playerPose === 'low' || !S.playerPose)) {
      S.playerPose = (S.run.hp < S.run.maxHp * 0.3) ? 'low' : 'stage';
    }
    UI.render();
  }

  /* ---------- 角色姿势管理（阵亡 > hit 瞬间 > attack 出牌 > low 常驻 > stage） ---------- */
  function basePose() {
    return (S.run && S.run.hp < S.run.maxHp * 0.3) ? 'low' : 'stage';
  }
  function setPlayerPose(pose) {
    S.playerPose = pose;
    var el = document.getElementById('player-img');
    if (el && S.run) el.src = 'assets/v2/char-stage/' + S.run.charId + '-' + pose + '.png';
  }
  // 姿势演出：播 pose 一段时间（ms）后回到基准姿势；阵亡时不恢复
  function playPose(pose, ms) {
    setPlayerPose(pose);
    setTimeout(function () {
      if (S.run && S.run.hp > 0) setPlayerPose(basePose());
    }, ms);
  }

  // 将 run 进度合并进存档
  function syncSave() {
    if (!S.run) return;
    var seen = S.run.seen;
    ['cards', 'relics', 'enemies'].forEach(function (k) {
      for (var id in seen[k]) S.save.codex[k][id] = true;
    });
    var reached = Math.max(S.run.act, S.run.floorsCleared);
    if (reached > S.save.maxFloor) S.save.maxFloor = reached;
    // 解锁（按角色数据的通关层数要求）
    for (var cid in D.characters) {
      var need = D.characters[cid].unlock;
      if (need > 0 && S.run.floorsCleared >= need && !S.save.unlocks[cid]) {
        S.save.unlocks[cid] = true;
        if (S.newUnlocks.indexOf(cid) < 0) S.newUnlocks.push(cid);
      }
    }
    persist();
  }

  /* ---------- 导航 ---------- */
  Game.toTitle = function () { S.screen = 'title'; render(); };
  Game.toChars = function () { S.screen = 'chars'; render(); };

  Game.pickChar = function (cid) {
    if (!S.save.unlocks[cid]) return;
    runClearSave(); // 开始新游戏：清除旧 run 存档
    S.engine = new Engine();
    S.engine.newRun(cid);
    S.run = S.engine.state;
    S.newUnlocks = [];
    S.animating = false; // 新开一局时复位动画锁，防死锁带入新 run
    S.playerPose = 'stage';
    S.save.runs++;
    persist();
    syncSave(); // 初始牌组进图鉴
    S.screen = 'map';
    render();
  };

  Game.selectNode = function (idx) {
    S.selectedNode = idx;
    render();
  };
  Game.confirmNode = function () {
    if (S.selectedNode == null) return;
    var idx = S.selectedNode;
    S.selectedNode = null;
    Game.pickNode(idx);
  };

  Game.pickNode = function (idx) {
    var node = S.engine.enterNode(idx);
    S.node = node;
    // 记录走过的路径（地图连线高亮用）
    if (!S.run.path) S.run.path = [];
    S.run.path[S.run.step] = idx;
    if (node.type === 'monster' || node.type === 'elite' || node.type === 'boss') {
      S.engine.startCombat(node.enemyId);
      S.screen = 'combat';
    } else if (node.type === 'shop') {
      S.shop = node.shop;
      S.screen = 'shop';
    } else if (node.type === 'rest') {
      S.screen = 'rest';
    } else if (node.type === 'event') {
      S.eventId = node.eventId;
      S.eventResult = null;
      S.screen = 'event';
    }
    render();
    // 仪式感：BOSS 开场亮出名字大字卡
    if (node.type === 'boss' && S.run.combat && S.run.combat.enemy) {
      UI.bigText(S.run.combat.enemy.name);
    }
  };

  /* ---------- 战斗 ---------- */
  function afterCombat(extraMs) {
    if (!S.run.combat.over) return;
    var extra = extraMs || 0;
    var isRush = !!(S.run.rush && S.run.rush.active);
    if (S.run.combat.won) {
      Sfx.play('win');
      setTimeout(function () {
        // 玩家可能已在延迟期间回了标题，避免突然弹出奖励屏
        if (S.screen !== 'combat') return;
        if (isRush) { Game.rushAfterWin(); return; }
        S.reward = S.engine.genReward();
        S.engine.takeReward(S.reward);
        syncSave();
        S.screen = 'reward';
        render();
      }, 600 + extra);
    } else {
      Sfx.play('lose');
      setTimeout(function () {
        if (S.screen !== 'combat') return; // 同上：已离开战斗则不弹结算
        if (isRush) {
          S.engine.rushFightLost();
          S.screen = 'rushFail';
          render();
          return;
        }
        gameOver();
      }, 800 + extra);
    }
  }

  /* ---------- 1vN：切换集火目标 ---------- */
  Game.pickTarget = function (i) {
    if (S.engine.pickTarget(i)) render();
  };

  /* ---------- 移动端点按选中→确认出牌 ---------- */
  Game.tapCard = function (i) {
    if (!S.touch) { Game.playCard(i); return; } // 桌面保留单击即出
    if (S.cardConfirm === i) { S.cardConfirm = null; render(); return; }
    S.cardConfirm = i;
    render();
  };
  Game.confirmPlay = function () {
    if (S.cardConfirm == null) return;
    var i = S.cardConfirm;
    S.cardConfirm = null;
    Game.playCard(i);
  };
  Game.cancelCard = function () { S.cardConfirm = null; render(); };

  /* ---------- 敌人死亡演出 ---------- */
  // BOSS：倒地立绘 →「下班！」大字 → 定格特写（推镜+打光+「下班成功！」）→ 本体消散（强总/资本加专属金爆）
  // 小怪/精英：本体消散（放大闪白 → 缩小旋转 + 中性粒子）；12% 击飞彩蛋保留
  // 已撤下 Lovart 自由发挥的角色碎裂序列帧（小机器人/石头人那两组），不再引用
  // 当前集火目标的元素 id（1vN 时按 target）
  function eImg() {
    var c = S.run.combat;
    return (c && c.multi) ? 'enemy-img-' + c.target : 'enemy-img';
  }
  function enemyDeathAnim(edef, e, killDmg) {
    // 终结重击（≥30）：不论 BOSS 小怪，直接打飞出屏幕（替代一切常规击败演出）
    if ((killDmg || 0) >= 30) {
      UI.appShake();
      UI.playFxFrames(eImg(), 'knockaway', { size: 460, fps: 10, holdLast: 1300 });
      UI.bigText((edef.boss || (S.run.combat && S.run.combat.rushBoss)) ? '击飞下班！' : '击飞！');
      var kf = document.getElementById(eImg());
      if (kf) kf.classList.add('knockfly-far');
      return;
    }
    if (edef.boss || (S.run.combat && S.run.combat.rushBoss && !S.run.combat.multi)) {
      var img = document.getElementById(eImg());
      // rush BOSS 用 rush 倒地立绘；主游戏 BOSS 用 boss_down
      var downSrc = (S.run.combat && S.run.combat.rushBoss)
        ? 'assets/v2/rush/down_' + S.run.combat.rushBoss.id + '.jpg'
        : 'assets/v2/enemy/boss_down_' + S.run.act +
          (e.id === 'boss3' ? (e.phase > 0 ? '_p2' : '_p1') : '') + '.jpg';
      if (img) img.src = downSrc;
      UI.bossDeathScene();
      UI.bigText('下班！');
      UI.playFxFrames(eImg(), 'stars', { size: 280, fps: 7, loops: 3 });
      // 1.5s 后倒地立绘定格特写（约 1.9s），定格结束再本体消散
      setTimeout(function () {
        UI.bossCloseup(downSrc, eImg(), function () {
          UI.deathAnim(eImg());
          UI.playFxFrames(eImg(), 'stars', { size: 320, fps: 8, loops: 2 });
          if (e.id === 'boss3' || (S.run.combat && S.run.combat.rushBoss && S.run.combat.rushBoss.id === 'capital')) {
            UI.playFxFrames(eImg(), 'qiangDeath', { size: 460, fps: 8 });
            UI.goldenFlash();
          }
        });
      }, 1500);
      return;
    }
    // 本体消散：冲击波环 + 闪白 + dying（放大1.15闪白→缩小旋转）+ 中性星星粒子
    UI.shockRing(eImg());
    UI.hitFlash(eImg());
    if (!edef.elite && Math.random() < 0.12) {
      // 击飞彩蛋：飞更高+旋转（中性速度线，保留）
      UI.playFxFrames(eImg(), 'knockaway', { size: 420, fps: 10, holdLast: 1300 });
      var km = document.getElementById(eImg());
      if (km) km.classList.add('knockfly');
      return;
    }
    UI.deathAnim(eImg());
    UI.playFxFrames(eImg(), 'stars', { size: edef.elite ? 320 : 260, fps: 8, loops: 2 });
  }

  // 敌方行动分级演出时间线（docs/摸鱼大作战-敌方攻击打击感美术需求.docx）：
  // 普通：短前冲+红屏边+红字；重击（单段≥15或多段总伤≥20）：冲撞+90ms停顿+爆裂+击退+大震屏；
  // 大招（每N回合招式）：0.5s危险预警 → 更快冲撞+140ms停顿+全屏红闪+「砰！」
  // 1vN 按行动归属逐个董事排队播放；多段命中排队不叠加拉长。endTurn 与强总打断反击共用。
  function playEnemyActionShow(c, r, baseMs) {
    function eElId(id) {
      if (!c.multi) return 'enemy-img';
      for (var ei = 0; ei < c.enemies.length; ei++) if (c.enemies[ei].id === id) return 'enemy-img-' + ei;
      return eImg();
    }
    function impactFx(h, absorbed, tier) {
      var p = UI.targetPos('player-img');
      if (h <= 0 && absorbed > 0) {
        // 完全格挡：盾光罩 + 蓝字，不红屏不震屏
        UI.playFxFrames('player-img', 'block', { size: 260, fps: 12 });
        if (p) UI.spawnFloatText(p.x, p.y, '格挡 ' + absorbed, 'block');
        Sfx.play('block');
        return;
      }
      var heavy = tier !== 'normal';
      playPose('hit', 400); // 受击姿势
      UI.hitFlash('player-img');
      UI.edgeFlash();
      if (heavy) setTimeout(function () { UI.edgeFlash(); }, 120); // 重击红屏边框加强
      UI.shockRing('player-img');
      if (heavy) { UI.knockback('player-img'); UI.bigShake(); }
      else if (h >= 15) UI.appShake(); else UI.miniShake();
      var seq = h >= 15 ? 'crit' : (r.hits.length > 1 ? 'combo' : 'hit');
      UI.playFxFrames('player-img', heavy ? 'crit' : seq,
        { size: heavy ? 380 : (h >= 15 ? 340 : (r.hits.length > 1 ? 210 : 280)), fps: 13 });
      if (p) UI.spawnFloatText(p.x, p.y, '-' + h, (heavy || h >= 15) ? 'dmg big' : 'dmg');
      if (absorbed > 0 && p) UI.spawnFloatText(p.x, p.y - 30, '格挡 ' + absorbed, 'block');
      if (tier === 'ult') UI.powBurst('player-img'); // 漫画拟声词「砰！」（有素材用图，无则 CSS）
      Sfx.play('hit');
    }
    var acts = (r.actions || []).map(function (a) {
      var hits = r.hits.slice(a.hs, a.he);
      var maxH = Math.max.apply(null, hits.concat([0]));
      var totH = hits.reduce(function (s2, x) { return s2 + x; }, 0);
      return {
        elId: eElId(a.id),
        tier: a.special ? 'ult' : (maxH >= 15 || totH >= 20 ? 'heavy' : 'normal'),
        hits: hits, absorbed: r.absorbed.slice(a.hs, a.he)
      };
    });
    if (r.scarf) setTimeout(function () {
      UI.playFxFrames('player-img', 'block', { size: 260, fps: 12 });
      UI.floater('player-img', '红围巾挡下了攻击！', 'block');
    }, baseMs);
    var tl = baseMs; // 时间线游标：各实体/各段命中顺序排队
    acts.forEach(function (a) {
      if (a.tier === 'normal') {
        setTimeout(function () { UI.lunge(a.elId); }, tl);
        tl += 220;
        a.hits.forEach(function (h, i) {
          setTimeout(function () { impactFx(h, a.absorbed[i] || 0, 'normal'); }, tl + i * 200);
        });
        tl += Math.max(0, a.hits.length - 1) * 200 + (a.hits.length ? 200 : 0);
      } else if (a.tier === 'heavy') {
        // 冲撞 200ms → 90ms 停顿 → 爆裂命中（全程 ≤0.9s）
        setTimeout(function () { UI.chargeLunge(a.elId, { stopMs: 90 }); }, tl);
        setTimeout(function () { UI.hitStop(90); }, tl + 200);
        var imp = tl + 290;
        a.hits.forEach(function (h, i) {
          setTimeout(function () { impactFx(h, a.absorbed[i] || 0, 'heavy'); }, imp + i * 180);
        });
        tl = imp + Math.max(0, a.hits.length - 1) * 180 + 450;
      } else {
        // 大招：0.5s 危险预警 → 冲撞 140ms → 140ms 停顿+全屏红闪 → 爆裂命中（全程 ≤1.5s）
        setTimeout(function () { UI.dangerWarn(a.elId, 500); }, tl);
        tl += 500;
        setTimeout(function () { UI.chargeLunge(a.elId, { fast: true, stopMs: 140 }); UI.redFlash(); }, tl);
        setTimeout(function () { UI.hitStop(140); }, tl + 140);
        var imp2 = tl + 280;
        a.hits.forEach(function (h, i) {
          setTimeout(function () { impactFx(h, a.absorbed[i] || 0, 'ult'); }, imp2 + i * 180);
        });
        tl = imp2 + Math.max(0, a.hits.length - 1) * 180 + 500;
      }
    });
    // 剩饭护体反弹：敌人头顶飘字
    if (r.reflected > 0) setTimeout(function () {
      UI.hitFlash(eImg());
      UI.floater(eImg(), '反弹 -' + r.reflected, 'dmg');
    }, baseMs + 220);
    // Rush 机制反馈飘字：偷牌 / 绩效考核
    if (r.stolenCardName) setTimeout(function () {
      UI.floater('player-img', '被偷走「' + r.stolenCardName + '」！', 'dmg');
    }, baseMs + 100);
    if (r.reviewSelf) setTimeout(function () {
      UI.floater(eImg(), '考核达标！自伤 -' + r.reviewSelf, 'heal');
    }, baseMs + 100);
    if (r.skipped) UI.floater(eImg(), '跳过了行动！', 'text');
    if (r.enemyBlock > 0) UI.floater(eImg(), '+' + r.enemyBlock + ' 格挡', 'block');
    return tl;
  }

  Game.playCard = function (i) {
    var c = S.run.combat;
    if (!c || c.over || S.animating) return; // 动画编排期间锁输入
    // 出牌前抓取手牌元素（飞行起点 / 稀有金边）
    var cardEl = document.querySelectorAll('.hand .card')[i];
    var fromRect = cardEl ? cardEl.getBoundingClientRect() : null;
    var inst = c.hand[i];
    var def0 = inst ? Engine.cardDef(inst) : null;
    var r = S.engine.playCard(i);
    if (!r.ok) { if (r.error) UI.toast(r.error); return; } // 能量/预算不足等反馈
    S.cardConfirm = null;
    S.animating = true; // 手牌已 splice，动画结束前禁止再点牌/结束回合
    Sfx.play('card');
    // 稀有牌：金边闪光 + rare 金边框序列（盖出牌位置），闪光后再重绘
    var preMs = 0;
    if (def0 && def0.rarity === 'rare' && cardEl) {
      UI.goldFlash(cardEl);
      var fr = fromRect;
      UI.playFxAt(fr.left + fr.width / 2, fr.top + fr.height / 2, 'rare', { size: 150, fps: 16, loops: 2 });
      preMs = 550;
    }
    setTimeout(function () {
      // 攻击牌：角色切 attack 姿势 + 冲刺，克隆体从角色手部飞出
      var flyMs = 0;
      if (def0 && def0.type === 'attack' && r.hits.length) {
        flyMs = 260;
        playPose('attack', 400);
        var pel = document.getElementById('player-img');
        if (pel) {
          pel.classList.add('plunge');
          setTimeout(function () { pel.classList.remove('plunge'); }, 260);
          var pr = pel.getBoundingClientRect();
          // 手部位置：立绘右侧中部
          var handRect = { left: pr.left + pr.width * 0.72, top: pr.top + pr.height * 0.42, width: 44, height: 58 };
          UI.cardFly(handRect, eImg(), 260, null);
        }
      }
      render();
      // 命中帧三档：<15 普通（hit/combo+小震）、≥15 重击（crit+全屏震）、≥30 超重击（大crit+双冲击波+特大数字）
      r.hits.forEach(function (h, idx) {
        setTimeout(function () {
          UI.hitFlash(eImg());
          UI.impactFlash(eImg());
          UI.shockRing(eImg());
          var super30 = h >= 30, big15 = h >= 15;
          if (big15) { UI.appShake(); if (super30) setTimeout(function () { UI.shockRing(eImg()); }, 90); }
          else UI.miniShake();
          var seq = big15 ? 'crit' : (r.hits.length > 1 ? 'combo' : 'hit');
          UI.playFxFrames(eImg(), seq, { size: super30 ? 460 : big15 ? 360 : (r.hits.length > 1 ? 220 : 300), fps: 13 });
          var p = UI.targetPos(eImg());
          if (p) UI.spawnFloatText(p.x, p.y, '-' + h, super30 ? 'dmg super' : big15 ? 'dmg big' : 'dmg');
          Sfx.play('hit');
        }, flyMs + idx * 180);
      });
      var midMs = flyMs + Math.max(0, r.hits.length - 1) * 180;
      // 格挡：蓝字 + 盾脉冲 + 盾序列帧
      if (r.blockGained > 0) {
        setTimeout(function () {
          UI.floater('player-img', '+' + r.blockGained + ' 格挡', 'block');
          UI.playFxFrames('player-img', 'block', { size: 260, fps: 12 });
          var p = document.getElementById('player-img');
          if (p) { p.classList.add('blockpulse'); setTimeout(function () { p.classList.remove('blockpulse'); }, 500); }
          Sfx.play('block');
        }, Math.floor(midMs / 2));
      }
      // 回血：绿字上飘 + 绿光序列帧
      if (r.healGained > 0) {
        setTimeout(function () {
          UI.floater('player-img', '+' + r.healGained, 'heal');
          UI.playFxFrames('player-img', 'heal', { size: 200, fps: 12 });
          Sfx.play('heal');
        }, Math.floor(midMs / 2));
      }
      // 自伤
      if (r.dmgToPlayer > 0) {
        setTimeout(function () {
          UI.floater('player-img', '-' + r.dmgToPlayer, 'dmg');
          UI.hitFlash('player-img');
        }, Math.floor(midMs / 2));
      }
      // 挥金如土：金币消耗飘字
      if (r.goldLost > 0) {
        setTimeout(function () { UI.floater('player-img', '-' + r.goldLost + ' 金币', 'text'); }, Math.floor(midMs / 2));
      }
      if (c.easterEgg) {
        var egg = c.easterEgg;
        c.easterEgg = null;
        setTimeout(function () { UI.floater(eImg(), egg, 'text'); }, flyMs);
      }
      // 临时通知：打断敌人意图飘字
      if (r.interrupted) {
        setTimeout(function () { UI.floater(eImg(), '「' + r.interrupted + '」被打断！', 'text'); }, flyMs);
      }
      var endMs = midMs + (r.hits.length ? 180 : 0);
      // 摸鱼强总 50% 打断：变身过场（二阶段立绘+全屏过场图+「都给我加班」+金爆）→ 立即反击一轮
      // 演出编排：打断-变身-反击连续播放，动画锁覆盖全程（endMs 顺延）
      if (r.interrupt) {
        var itBase = endMs + 150;
        setTimeout(function () {
          UI.bossCut();
          UI.bigText('都给我加班！');
          UI.goldenFlash();
          UI.appShake();
          Sfx.play('hit');
          render(); // 重绘：二阶段立绘 + 打断后的新回合手牌
        }, itBase);
        endMs = playEnemyActionShow(c, r.interrupt, itBase + 1400);
      }
      var deathExtra = 0;
      if (c.over) {
        var edefE = c.enemy._def;
        // 胜利：演出时长 小怪≥1.2s / 精英≥1.6s / BOSS≥4.4s（含定格特写）；玩家阵亡同样留白
        deathExtra = c.won ? ((edefE.boss || c.rushBoss) ? 4400 : edefE.elite ? 1600 : 1200) : 700;
        if (c.won) setTimeout(function () { enemyDeathAnim(edefE, c.enemy, r.hits[r.hits.length - 1] || 0); }, endMs);
      }
      // 玩家阵亡（自伤牌）：暴击爆裂 + 全屏震动 + 红闪 + 立绘消散
      if (c.over && !c.won) setTimeout(function () {
        UI.playFxFrames('player-img', 'crit', { size: 380, fps: 11 });
        UI.appShake();
        UI.edgeFlash();
        UI.deathAnim('player-img');
      }, endMs);
      // 动画编排（含死亡演出）播完后解锁；战斗已结束时不重绘（保留死亡演出 DOM），由 afterCombat 切屏
      setTimeout(function () { S.animating = false; if (S.screen === 'combat' && !c.over) render(); }, endMs + deathExtra);
      afterCombat(endMs + deathExtra);
    }, preMs);
  };

  Game.endTurn = function () {
    var c = S.run.combat;
    if (!c || c.over || S.animating) return; // 动画编排期间锁输入
    var edef = c.enemy._def;
    var phaseBefore = c.enemy.phase;
    var r = S.engine.endTurn();
    S.cardConfirm = null;
    S.animating = true; // 敌人行动动画期间禁止出牌/重复结束回合
    Sfx.play('draw');
    S.dealAnim = true;           // 新手牌入场动画
    render();
    S.dealAnim = false;
    // 敌人行动 → 玩家受击分级演出（普通/重击/大招，1vN 按归属排队；与强总打断反击共用时间线）
    var endMs = playEnemyActionShow(c, r, 0);
    // BOSS 阶段切换：全屏震动 + 红闪 + 阶段名大字
    var phaseChanged = edef.phases && c.enemy.phase !== phaseBefore;
    if (phaseChanged) {
      var ph = edef.phases[c.enemy.phase];
      setTimeout(function () {
        UI.bossCut();
        UI.appShake();
        UI.edgeFlash();
        UI.bigText(ph.phaseName || '第二阶段');
        Sfx.play('hit');
      }, endMs + 150);
      endMs += 900;
    }
    var deathExtra = 0;
    if (c.over) {
      deathExtra = c.won ? (edef.boss ? 4400 : edef.elite ? 1600 : 1200) : 700;
      if (c.won) setTimeout(function () { enemyDeathAnim(edef, c.enemy, r.reflected || 0); }, endMs);
    }
    // 玩家阵亡：暴击爆裂 + 全屏震动 + 红闪 + 立绘消散
    if (c.over && !c.won) setTimeout(function () {
      UI.playFxFrames('player-img', 'crit', { size: 380, fps: 11 });
      UI.appShake();
      UI.edgeFlash();
      UI.deathAnim('player-img');
    }, endMs);
    // 敌人行动（含 BOSS 阶段切换与死亡演出）播完后解锁；战斗已结束时不重绘（保留死亡演出 DOM）
    setTimeout(function () { S.animating = false; if (S.screen === 'combat' && !c.over) render(); }, endMs + deathExtra);
    afterCombat(endMs + deathExtra);
  };

  /* ---------- 奖励 ---------- */
  function finishNode() {
    S.engine.advance();
    syncSave();
    if (S.run.over) { gameOver(); return; } // 完结（胜/负）由 gameOver 清除 run 存档
    runPersist(); // 节点完成：对局实时存档
    S.screen = 'map';
    render();
  }

  Game.rewardCard = function (i) {
    S.engine.takeRewardCard(S.reward, i);
    syncSave();
    if (S.run.rush && S.run.rush.active) { Game.rushTakeCard(i); return; }
    finishNode();
  };
  Game.rewardSkip = function () {
    if (S.run.rush && S.run.rush.active) { Game.rushSkipReward(); return; }
    finishNode();
  };

  /* ---------- 商店 ---------- */
  Game.shopBuyCard = function (i) {
    if (S.engine.shopBuyCard(S.shop, i)) { syncSave(); render(); }
  };
  Game.shopBuyRelic = function (i) {
    if (S.engine.shopBuyRelic(S.shop, i)) { syncSave(); render(); }
  };
  Game.shopRemoveMode = function () {
    S.selecting = 'shopRemove';
    S.screen = 'deckSelect';
    render();
  };
  Game.shopCopyMode = function () {
    S.selecting = 'shopCopy';
    S.screen = 'deckSelect';
    render();
  };
  Game.shopLeave = function () { finishNode(); };

  /* ---------- 休息 ---------- */
  Game.restHeal = function () { S.engine.restHeal(); finishNode(); };
  Game.restUpgradeMode = function () {
    // 没有可升级的牌时不进入选牌界面（防空列表死路；入口按钮已禁用，此处为兜底）
    if (!S.run.deck.some(function (c) { return !c.up; })) { UI.toast('没有可升级的牌'); return; }
    S.selecting = 'restUpgrade';
    S.screen = 'deckSelect';
    render();
  };

  /* ---------- 事件 ---------- */
  Game.eventOpt = function (i) {
    var res = S.engine.applyEvent(S.eventId, i);
    if (res.needChoice === 'remove') {
      S.selecting = 'eventRemove';
      S.screen = 'deckSelect';
    } else {
      S.eventResult = res.text;
    }
    syncSave();
    render();
  };
  Game.eventContinue = function () { finishNode(); };

  /* ---------- 选牌（删牌/升级/复制） ---------- */
  Game.deckSelectPick = function (uid) {
    if (S.selecting === 'shopRemove') {
      S.engine.shopRemoveCard(S.shop, uid);
      S.selecting = null;
      S.screen = 'shop';
    } else if (S.selecting === 'shopCopy') {
      S.engine.shopCopyCard(S.shop, uid);
      S.selecting = null;
      S.screen = 'shop';
    } else if (S.selecting === 'restUpgrade') {
      S.engine.restUpgrade(uid);
      S.selecting = null;
      finishNode();
      return;
    } else if (S.selecting === 'eventRemove') {
      S.engine.removeCardByUid(uid);
      S.selecting = null;
      S.eventResult = '移除了 1 张牌，一身轻松。';
      S.screen = 'event';
    }
    syncSave();
    render();
  };
  Game.deckSelectCancel = function () {
    if (S.selecting === 'shopRemove' || S.selecting === 'shopCopy') { S.selecting = null; S.screen = 'shop'; }
    else if (S.selecting === 'eventRemove') { S.selecting = null; S.screen = 'event'; }
    else if (S.selecting === 'restUpgrade') { S.selecting = null; S.screen = 'rest'; }
    render();
  };

  /* ---------- 结算 ---------- */
  function gameOver() {
    runClearSave(); // run 完结（胜/负）：清除对局实时存档
    if (S.run.victory) {
      S.save.wins++;
      // 记录通关构筑快照（Boss Rush 入口用）
      S.save.lastWinBuild = {
        charId: S.run.charId,
        deck: S.run.deck.map(function (c) { return { uid: c.uid, id: c.id, up: c.up, costMod: c.costMod || 0 }; }),
        relics: S.run.relics.slice(),
        equippedRelics: (S.run.equippedRelics || S.run.relics).slice(),
        gold: S.run.gold,
        hp: S.run.hp,
        maxHp: S.run.maxHp
      };
    }
    g.GameEngine.accumulateStats(S.save, S.run); // 统计累计（成就系统铺路）
    g.GameEngine.pushHistory(S.save, S.run); // 战绩簿
    syncSave();
    if (S.run.victory) { startCutscene(); return; } // 通关：强总→总部过场演出，再接 Rush
    S.screen = 'over';
    render();
  }

  /* ---------- 通关过渡演出（强总倒地 → 电梯上顶层 → 董事会大门 → Rush） ---------- */
  // 5 镜头约 8.4s，全程可点击跳过；结束/跳过都直接进 Rush 连胜界面
  var cutsceneTimers = [];
  function csTimeout(fn, ms) { cutsceneTimers.push(setTimeout(fn, ms)); }
  function clearCutsceneTimers() {
    cutsceneTimers.forEach(clearTimeout);
    cutsceneTimers = [];
  }
  function csStep(step, ms, sfx) {
    csTimeout(function () {
      if (S.screen !== 'cutscene') return;
      S.cutsceneStep = step;
      if (sfx) Sfx.play(sfx);
      render();
    }, ms);
  }
  Game.startCutscene = startCutscene; // 暴露给 e2e/调试
  function startCutscene() {
    clearCutsceneTimers();
    S.cutsceneStep = 0; // 镜头0：暗下
    S.screen = 'cutscene';
    render();
    csStep(1, 900, 'hit');   // 镜头1：电梯间门合 + 楼层滚动
    csStep(2, 3400, 'draw'); // 镜头2：电梯门开，抵达顶层
    csStep(3, 4800);         // 镜头3：董事会大门 + 门缝金光
    csStep(4, 6200, 'win');  // 镜头4：推门，白光 + 主角剪影升起
    csStep(5, 7600);         // 镜头5：白光全屏
    csTimeout(endCutscene, 8400);
    // 楼层数字 1F→顶层 高速滚动（叠加在镜头1的电梯指示器上）
    var floors = ['1F', '3F', '5F', '7F', '10F', '顶层'];
    floors.forEach(function (f, i) {
      csTimeout(function () {
        if (S.screen !== 'cutscene' || S.cutsceneStep !== 1) return; // 仅镜头1滚动，避免覆盖镜头2的「顶层」
        var fn = document.getElementById('floor-num');
        if (fn) fn.textContent = f;
        if (i > 0) UI.miniShake(); // 上行轻震
      }, 1200 + i * 400);
    });
  }
  Game.skipCutscene = function () {
    if (S.screen !== 'cutscene') return;
    endCutscene();
  };
  function endCutscene() {
    clearCutsceneTimers();
    S.cutsceneStep = 0;
    rushClearSave(); // 新通关：清掉旧 Rush 进度存档，防止污染本次构筑继承
    // 兜底：任何异常都不能卡在白屏，先直进 Rush 大厅，再退而回标题
    try {
      Game.enterRush();
    } catch (e) {
      console.warn('过场结束进入 Rush 异常，兜底直进大厅', e);
      try {
        S.engine = S.engine || new Engine();
        S.engine.rushStart(sanitizeBuild(S.save.lastWinBuild));
        S.run = S.engine.state;
        S.screen = 'rush';
        render();
      } catch (e2) {
        console.warn('兜底失败，回标题', e2);
        S.screen = 'title';
        render();
      }
    }
  }

  /* ---------- Boss Rush：总部连续作战 ---------- */
  var RUSH_SAVE_KEY = 'moyu_rush_save';

  function rushPersist() {
    if (!S.run || !S.run.rush) return;
    try {
      localStorage.setItem(RUSH_SAVE_KEY, JSON.stringify({
        fight: S.run.rush.fight,
        build: {
          charId: S.run.charId,
          deck: S.run.deck.map(function (c) { return { uid: c.uid, id: c.id, up: c.up, costMod: c.costMod || 0 }; }),
          relics: S.run.relics.slice(),
          equippedRelics: S.run.equippedRelics.slice(),
          gold: S.run.gold,
          hp: S.run.hp,
          maxHp: S.run.maxHp
        },
        entry: S.run.rush.entry
      }));
    } catch (e) {}
  }
  function rushLoadSave() {
    try {
      var raw = localStorage.getItem(RUSH_SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function rushClearSave() {
    try { localStorage.removeItem(RUSH_SAVE_KEY); } catch (e) {}
  }

  // 构筑快照健壮化：补齐旧存档缺失字段（装备系统前的 lastWinBuild 无 equippedRelics 等）
  function sanitizeBuild(b) {
    b = b || {};
    var charId = D.characters[b.charId] ? b.charId : 'xiaoq';
    var base = D.characters[charId];
    var deck = (Array.isArray(b.deck) && b.deck.length ? b.deck : base.deck).map(function (c, i) {
      return typeof c === 'string'
        ? { uid: i + 1, id: c, up: false, costMod: 0 }
        : { uid: c.uid == null ? i + 1 : c.uid, id: c.id, up: !!c.up, costMod: c.costMod || 0 };
    });
    var relics = Array.isArray(b.relics) ? b.relics.slice() : [];
    var eq = (Array.isArray(b.equippedRelics) && b.equippedRelics.length)
      ? b.equippedRelics.slice() : relics.slice(0, 4);
    return {
      charId: charId, deck: deck, relics: relics, equippedRelics: eq,
      gold: b.gold | 0,
      hp: (b.hp > 0 ? b.hp : base.maxHp),
      maxHp: (b.maxHp > 0 ? b.maxHp : base.maxHp)
    };
  }

  // 进入 Rush（有存档续打，否则用通关构筑新开；lastWinBuild 需先过继承确认）
  Game.enterRush = function (skipConfirm) {
    if (!S.engine) S.engine = new Engine(); // 标题页直接进入时引擎尚未创建
    var saved = rushLoadSave();
    if (saved && saved.build) {
      try {
        S.engine.rushStart(sanitizeBuild(saved.build));
        S.run = S.engine.state; // rushStart 会重建 run，先同步引用再恢复进度
        S.run.rush.fight = saved.fight || 1;
        if (saved.entry) S.run.rush.entry = saved.entry;
        S.screen = 'rush';
        render();
      } catch (e) {
        console.warn('Rush 进度存档损坏，已清除', e);
        rushClearSave();
        UI.toast('Rush 存档损坏，已重置');
      }
      return;
    }
    if (!S.save.lastWinBuild) {
      // 有通关记录但没有构筑快照（旧版存档）：明确告知，不用调试卡组冒充
      if (S.save.wins > 0) { UI.toast('需要再通关一次记录构筑，才能挑战总部！'); return; }
      // 调试入口（从未通关）：默认卡组体验，不写存档
      try {
        var dbgChar = 'xiaoq';
        var base = D.characters[dbgChar];
        var uid = 1;
        S.engine.rushStart({
          charId: dbgChar,
          deck: base.deck.map(function (id) { return { uid: uid++, id: id, up: false }; }),
          relics: ['doll', 'gamepad'],
          equippedRelics: ['doll', 'gamepad'],
          gold: 99,
          hp: base.maxHp,
          maxHp: base.maxHp
        });
        S.run = S.engine.state;
        S.screen = 'rush';
        render();
        UI.toast('调试入口：使用默认构筑进入总部');
      } catch (e) { console.warn('enterRush 调试入口失败', e); }
      return;
    }
    // 继承确认：展示通关构筑摘要（角色/牌数/圣物数/金币/精力），确认后才真正进入
    if (!skipConfirm) {
      if (S.screen === 'cutscene') S.screen = 'title'; // 过场结束：确认框叠在标题上，避免白屏
      S.showRushConfirm = true;
      render();
      return;
    }
    try {
      S.engine.rushStart(sanitizeBuild(S.save.lastWinBuild));
      S.run = S.engine.state;
      S.screen = 'rush';
      render();
    } catch (e) {
      console.warn('enterRush 失败', e);
      UI.toast('进入总部失败，请重试');
      S.screen = 'title';
      render();
    }
  };
  Game.rushConfirmGo = function () { S.showRushConfirm = false; Game.enterRush(true); };
  Game.rushConfirmBack = function () { S.showRushConfirm = false; S.screen = 'title'; render(); };

  // 开始当前场战斗
  Game.rushFight = function () {
    if (!S.run || !S.run.rush) return;
    S.engine.rushStartFight();
    S.screen = 'combat';
    render();
    // 仪式感：每场 BOSS 开场大字卡；资本化身登场全屏金色脉冲
    var rb = S.run.combat && S.run.combat.rushBoss;
    if (rb) {
      UI.bigText(rb.name);
      if (rb.id === 'capital') UI.goldenFlash();
    }
  };

  // Rush 战斗胜利后的奖励（三选一并回复 20%，已出牌组状态基础上）
  Game.rushAfterWin = function () {
    var st = S.run;
    S.engine.rushFightWon(); // 回复 20%
    S.reward = S.engine.genReward();
    S.engine.takeReward(S.reward);
    rushPersist();
    S.screen = 'reward';
    render();
  };

  // 拿完奖励推进：整备点 or 下一场 or 通关
  function rushNext() {
    var won = S.engine.rushAdvance();
    if (won) {
      // Rush 通关
      S.save.godTitle = true;
      g.GameEngine.pushHistory(S.save, {
        charId: S.run.charId, act: 10, victory: true,
        combat: { enemy: { name: '资本化身（总部连续作战）' } },
        deck: S.run.deck, relics: S.run.relics
      });
      syncSave();
      rushClearSave();
      S.screen = 'rushWin';
      render();
      return;
    }
    rushPersist();
    if (S.engine.rushNeedRest()) {
      S.screen = 'rushRest';
    } else {
      S.screen = 'rush';
    }
    render();
  }

  // Rush 奖励三选一 / 跳过（复用现有 reward 界面，但走 rushNext）
  Game.rushTakeCard = function (i) {
    S.engine.takeRewardCard(S.reward, i);
    syncSave();
    rushNext();
  };
  Game.rushSkipReward = function () { rushNext(); };

  // 整备点三选一
  Game.rushRest = function (choice) {
    S.engine.rushRest(choice);
    rushPersist();
    S.screen = 'rush';
    render();
  };

  // Rush 失败：从第 1 场重来（牌组回到进入时状态）
  Game.rushRetry = function () {
    S.engine.rushRestart();
    rushPersist();
    S.screen = 'rush';
    render();
  };

  // 中途退出：自动存档回标题
  Game.rushQuit = function () {
    rushPersist();
    S.screen = 'title';
    render();
  };

  /* ---------- 新手指南 ---------- */
  Game.openGuide = function () { S.showGuide = true; S.guidePage = 0; render(); };
  Game.closeGuide = function () { S.showGuide = false; render(); };
  Game.guideNext = function () {
    if ((S.guidePage || 0) < 4) { S.guidePage = (S.guidePage || 0) + 1; render(); }
  };
  Game.guidePrev = function () {
    if ((S.guidePage || 0) > 0) { S.guidePage = (S.guidePage || 0) - 1; render(); }
  };

  /* ---------- 图鉴 ---------- */
  Game.showCodex = function () {
    if (S.screen !== 'codex') S.screenBeforeCodex = S.screen;
    S.screen = 'codex';
    render();
  };
  Game.closeCodex = function () {
    S.screen = S.screenBeforeCodex || 'title';
    S.screenBeforeCodex = null;
    render();
  };
  Game.codexTab = function (t) { S.codexTab = t; render(); };

  /* ---------- 音效开关 ---------- */
  Game.toggleSfx = function () {
    Sfx.toggle();
    render();
  };

  /* ---------- 分享战绩 ---------- */
  Game.shareResult = function () {
    if (!S.run) return;
    var chName = D.characters[S.run.charId].name;
    var text;
    if (S.run.victory) {
      text = '我在《摸鱼大作战》用' + chName + '摸穿了 10 层公司大楼！老板被我 RUA 飞了！你能摸穿 10 层吗？';
    } else {
      var killer = (S.run.combat && S.run.combat.enemy) ? S.run.combat.enemy.name : '工作';
      text = '我在《摸鱼大作战》用' + chName + '摸到了第 ' + S.run.act + ' 层，倒在了 ' +
        killer + ' 手下！你能摸穿 10 层吗？';
    }
    function fallback() {
      // 降级：插入文本框并全选，提示手动复制
      var box = document.getElementById('share-fallback');
      if (!box) return;
      box.innerHTML = '';
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.readOnly = true;
      box.appendChild(ta);
      ta.focus();
      ta.select();
      UI.toast('自动复制失败，请手动复制（已全选）');
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          UI.toast('战绩已复制到剪贴板！');
        }, fallback);
      } else {
        fallback();
      }
    } catch (e) { fallback(); }
  };

  /* ---------- 战绩簿 ---------- */
  Game.toHistory = function () { S.screen = 'history'; render(); };

  /* ---------- 存档码导入/导出 ---------- */
  Game.showDeck = function (mode) { S.deckView = mode; render(); };
  Game.closeDeck = function () { S.deckView = null; render(); };

  /* ---------- 圣物装备（最多 4 件，战斗中不可调整） ---------- */
  Game.showRelics = function () { if (S.run) { S.relicView = true; render(); } };
  Game.closeRelics = function () { S.relicView = null; render(); };
  Game.toggleRelic = function (rid) {
    if (!S.run || S.screen === 'combat' || S.animating) return;
    if (S.run.equippedRelics.indexOf(rid) >= 0) S.engine.unequipRelic(rid);
    else if (!S.engine.equipRelic(rid)) { UI.toast('最多同时装备 4 件圣物'); return; }
    render();
  };

  Game.toSave = function () {
    // 打包本游戏所有 localStorage key
    var data = { save: S.save };
    try { data.sfx = localStorage.getItem('moyu_sfx') || 'on'; } catch (e) { data.sfx = 'on'; }
    S.saveCode = g.GameEngine.saveCodec.encode(data);
    S.screen = 'save';
    render();
  };
  Game.copySaveCode = function () {
    var ta = document.getElementById('save-export');
    if (!ta) return;
    function fallback() { ta.focus(); ta.select(); UI.toast('自动复制失败，请手动复制（已全选）'); }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(ta.value).then(function () {
          UI.toast('存档码已复制！');
        }, fallback);
      } else fallback();
    } catch (e) { fallback(); }
  };
  Game.importSave = function () {
    var ta = document.getElementById('save-import');
    if (!ta) return;
    var data = g.GameEngine.saveCodec.decode(ta.value);
    if (!data || !data.save.unlocks || !data.save.codex) {
      UI.toast('存档码无效，请检查后重试');
      return;
    }
    // v1 旧码在这里迁移到当前版本；迁移失败 = 存档本体结构非法
    var sv = g.GameEngine.migrateSave(data.save);
    if (!sv) {
      UI.toast('存档码无效，请检查后重试');
      return;
    }
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(sv)); // 缺省字段由 loadSave 合并补齐
      if (data.sfx) localStorage.setItem('moyu_sfx', data.sfx);
    } catch (e) {
      UI.toast('写入失败：' + e.message);
      return;
    }
    S.save = loadSave();
    UI.toast('导入成功！');
    S.screen = 'title';
    render();
  };

  /* ---------- 调试钩子（无害，供自动化截图/测试） ---------- */
  Game.debug = {
    ensureRun: function () {
      if (!S.run) Game.pickChar('xiaoq');
    },
    combat: function (enemyId) {
      this.ensureRun();
      S.engine.startCombat(enemyId || 'group_at');
      S.screen = 'combat';
      render();
    },
    reward: function () {
      this.ensureRun();
      S.run.lastNodeType = 'elite';
      S.reward = S.engine.genReward();
      S.engine.takeReward(S.reward);
      S.screen = 'reward';
      render();
    },
    shop: function () {
      this.ensureRun();
      S.shop = S.engine._genShop();
      S.screen = 'shop';
      render();
    },
    map: function () {
      this.ensureRun();
      S.screen = 'map';
      render();
    },
    setEnemyHp: function (n) {
      if (S.run && S.run.combat) S.run.combat.enemy.hp = n;
      render();
    }
  };

  g.Game = Game;
  // 启动
  if (typeof document !== 'undefined') {
    S.runSave = runLoadSave(); // 未完成对局（标题显示继续游戏按钮）
    // 全局按钮点击音（首次交互时即触发 AudioContext 创建/恢复，符合自动播放策略）
    document.addEventListener('click', function (e) {
      if (e.target && e.target.closest && e.target.closest('button')) Sfx.play('click');
    });
    UI.preloadFx(); // 预加载特效帧，避免首闪
    render();
  }
})(typeof window !== 'undefined' ? window : globalThis);
