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
      unlocks: { xiaoq: true, shengfan: false, jihuang: false, shuanglaoya: false },
      maxFloor: 0, wins: 0, runs: 0,
      codex: { cards: {}, relics: {}, enemies: {} },
      history: []
    };
  }

  function loadSave() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        var sv = JSON.parse(raw);
        var d = defaultSave();
        // 合并缺省字段，防止旧存档缺键
        for (var k in d) if (!(k in sv)) sv[k] = d[k];
        for (var k2 in d.codex) if (!(k2 in sv.codex)) sv.codex[k2] = {};
        for (var k3 in d.unlocks) if (!(k3 in sv.unlocks)) sv.unlocks[k3] = d.unlocks[k3];
        return sv;
      }
    } catch (e) { /* file:// 或隐私模式下忽略 */ }
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
      playerPose: 'stage',    // 当前玩家立绘姿势（stage/attack/hit/low）
      touch: (typeof matchMedia !== 'undefined') && matchMedia('(hover: none)').matches,
      cardConfirm: null       // 移动端：待确认出牌的手牌下标
    }
  };

  var S = Game.state;

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
  };

  /* ---------- 战斗 ---------- */
  function afterCombat(extraMs) {
    if (!S.run.combat.over) return;
    var extra = extraMs || 0;
    if (S.run.combat.won) {
      Sfx.play('win');
      setTimeout(function () {
        // 玩家可能已在延迟期间回了标题，避免突然弹出奖励屏
        if (S.screen !== 'combat') return;
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
        gameOver();
      }, 800 + extra);
    }
  }

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

  Game.playCard = function (i) {
    var c = S.run.combat;
    if (!c || c.over || S.animating) return; // 动画编排期间锁输入
    // 出牌前抓取手牌元素（飞行起点 / 稀有金边）
    var cardEl = document.querySelectorAll('.hand .card')[i];
    var fromRect = cardEl ? cardEl.getBoundingClientRect() : null;
    var inst = c.hand[i];
    var def0 = inst ? Engine.cardDef(inst) : null;
    var r = S.engine.playCard(i);
    if (!r.ok) return;
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
          UI.cardFly(handRect, 'enemy-img', 260, null);
        }
      }
      render();
      // 命中帧：敌人抖动+闪白+星环+冲击波，序列帧增强（大伤 crit / 多段 combo / 普通 hit）
      r.hits.forEach(function (h, idx) {
        setTimeout(function () {
          UI.hitFlash('enemy-img');
          UI.impactFlash('enemy-img');
          UI.shockRing('enemy-img');
          UI.miniShake();
          var seq = h >= 15 ? 'crit' : (r.hits.length > 1 ? 'combo' : 'hit');
          UI.playFxFrames('enemy-img', seq, { size: h >= 15 ? 360 : r.hits.length > 1 ? 220 : 300, fps: 13 });
          var p = UI.targetPos('enemy-img');
          if (p) UI.spawnFloatText(p.x, p.y, '-' + h, h >= 15 ? 'dmg big' : 'dmg');
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
      if (c.easterEgg) {
        var egg = c.easterEgg;
        c.easterEgg = null;
        setTimeout(function () { UI.floater('enemy-img', egg, 'text'); }, flyMs);
      }
      var endMs = midMs + (r.hits.length ? 180 : 0);
      if (c.over && c.won) setTimeout(function () {
        UI.deathAnim('enemy-img');
        UI.playFxFrames('enemy-img', 'death', { size: 380, fps: 11 });
      }, endMs);
      // 玩家阵亡（自伤牌）：暴击爆裂 + 全屏震动 + 红闪 + 立绘消散
      if (c.over && !c.won) setTimeout(function () {
        UI.playFxFrames('player-img', 'crit', { size: 380, fps: 11 });
        UI.appShake();
        UI.edgeFlash();
        UI.deathAnim('player-img');
      }, endMs);
      // 动画编排的最后一段结束后解锁（战斗已结束时 c.over 会自然拦截输入）
      setTimeout(function () { S.animating = false; if (S.screen === 'combat') render(); }, endMs);
      afterCombat(endMs);
    }, preMs);
  };

  Game.endTurn = function () {
    var c = S.run.combat;
    if (!c || c.over || S.animating) return; // 动画编排期间锁输入
    var edef = D.enemies[c.enemy.id];
    var phaseBefore = c.enemy.phase;
    var r = S.engine.endTurn();
    S.cardConfirm = null;
    S.animating = true; // 敌人行动动画期间禁止出牌/重复结束回合
    Sfx.play('draw');
    S.dealAnim = true;           // 新手牌入场动画
    render();
    S.dealAnim = false;
    // 敌人前冲 → 玩家受击帧（序列帧+冲击波+震屏+红闪，按节奏连发；格挡吸收有盾光表现）
    if (r.attacked) UI.lunge('enemy-img');
    var startMs = r.attacked ? 220 : 0;
    if (r.scarf) setTimeout(function () {
      UI.playFxFrames('player-img', 'block', { size: 260, fps: 12 });
      UI.floater('player-img', '红围巾挡下了攻击！', 'block');
    }, startMs);
    r.hits.forEach(function (h, idx) {
      setTimeout(function () {
        var absorbed = (r.absorbed && r.absorbed[idx]) || 0;
        var p = UI.targetPos('player-img');
        if (h <= 0 && absorbed > 0) {
          // 完全格挡：盾光罩 + 蓝字，不红屏不震屏
          UI.playFxFrames('player-img', 'block', { size: 260, fps: 12 });
          if (p) UI.spawnFloatText(p.x, p.y, '格挡 ' + absorbed, 'block');
          Sfx.play('block');
          return;
        }
        var big = h >= 15;
        playPose('hit', 400); // 受击姿势
        UI.hitFlash('player-img');
        UI.edgeFlash();
        UI.shockRing('player-img');
        if (big) UI.appShake(); else UI.miniShake();
        var seq = big ? 'crit' : (r.hits.length > 1 ? 'combo' : 'hit');
        UI.playFxFrames('player-img', seq, { size: big ? 340 : (r.hits.length > 1 ? 210 : 280), fps: 13 });
        if (p) UI.spawnFloatText(p.x, p.y, '-' + h, big ? 'dmg big' : 'dmg');
        if (absorbed > 0 && p) UI.spawnFloatText(p.x, p.y - 30, '格挡 ' + absorbed, 'block');
        Sfx.play('hit');
      }, startMs + idx * 200);
    });
    // 剩饭护体反弹：敌人头顶飘字
    if (r.reflected > 0) setTimeout(function () {
      UI.hitFlash('enemy-img');
      UI.floater('enemy-img', '反弹 -' + r.reflected, 'dmg');
    }, startMs);
    if (r.skipped) UI.floater('enemy-img', '跳过了行动！', 'text');
    if (r.enemyBlock > 0) UI.floater('enemy-img', '+' + r.enemyBlock + ' 格挡', 'block');
    var endMs = startMs + Math.max(0, r.hits.length - 1) * 200 + (r.hits.length ? 200 : 0);
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
    if (c.over && c.won) setTimeout(function () {
      UI.deathAnim('enemy-img');
      UI.playFxFrames('enemy-img', 'death', { size: 380, fps: 11 });
    }, endMs);
    // 玩家阵亡：暴击爆裂 + 全屏震动 + 红闪 + 立绘消散
    if (c.over && !c.won) setTimeout(function () {
      UI.playFxFrames('player-img', 'crit', { size: 380, fps: 11 });
      UI.appShake();
      UI.edgeFlash();
      UI.deathAnim('player-img');
    }, endMs);
    // 敌人行动（含 BOSS 阶段切换）播完后解锁
    setTimeout(function () { S.animating = false; if (S.screen === 'combat') render(); }, endMs);
    afterCombat(endMs);
  };

  /* ---------- 奖励 ---------- */
  function finishNode() {
    S.engine.advance();
    syncSave();
    if (S.run.over) { gameOver(); return; }
    S.screen = 'map';
    render();
  }

  Game.rewardCard = function (i) {
    S.engine.takeRewardCard(S.reward, i);
    syncSave();
    finishNode();
  };
  Game.rewardSkip = function () { finishNode(); };

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
  Game.shopLeave = function () { finishNode(); };

  /* ---------- 休息 ---------- */
  Game.restHeal = function () { S.engine.restHeal(); finishNode(); };
  Game.restUpgradeMode = function () {
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

  /* ---------- 选牌（删牌/升级） ---------- */
  Game.deckSelectPick = function (uid) {
    if (S.selecting === 'shopRemove') {
      S.engine.shopRemoveCard(S.shop, uid);
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
    if (S.selecting === 'shopRemove') { S.selecting = null; S.screen = 'shop'; }
    else if (S.selecting === 'eventRemove') { S.selecting = null; S.screen = 'event'; }
    render();
  };

  /* ---------- 结算 ---------- */
  function gameOver() {
    if (S.run.victory) S.save.wins++;
    g.GameEngine.pushHistory(S.save, S.run); // 战绩簿
    syncSave();
    S.screen = 'over';
    render();
  }

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
    if (!data || !data.save || typeof data.save !== 'object' ||
        !data.save.unlocks || !data.save.codex) {
      UI.toast('存档码无效，请检查后重试');
      return;
    }
    try {
      // 合并缺省字段后写入
      var d = defaultSave();
      var sv = data.save;
      for (var k in d) if (!(k in sv)) sv[k] = d[k];
      for (var k2 in d.codex) if (!(k2 in sv.codex)) sv.codex[k2] = {};
      localStorage.setItem(SAVE_KEY, JSON.stringify(sv));
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
    // 全局按钮点击音（首次交互时即触发 AudioContext 创建/恢复，符合自动播放策略）
    document.addEventListener('click', function (e) {
      if (e.target && e.target.closest && e.target.closest('button')) Sfx.play('click');
    });
    UI.preloadFx(); // 预加载特效帧，避免首闪
    render();
  }
})(typeof window !== 'undefined' ? window : globalThis);
