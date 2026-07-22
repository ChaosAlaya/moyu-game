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
      codex: { cards: {}, relics: {}, enemies: {} }
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
      newUnlocks: []
    }
  };

  var S = Game.state;

  function render() { UI.render(); }

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
    S.save.runs++;
    persist();
    syncSave(); // 初始牌组进图鉴
    S.screen = 'map';
    render();
  };

  Game.pickNode = function (idx) {
    var node = S.engine.enterNode(idx);
    S.node = node;
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
  function afterCombat() {
    if (!S.run.combat.over) return;
    if (S.run.combat.won) {
      Sfx.play('win');
      setTimeout(function () {
        S.reward = S.engine.genReward();
        S.engine.takeReward(S.reward);
        syncSave();
        S.screen = 'reward';
        render();
      }, 600);
    } else {
      Sfx.play('lose');
      setTimeout(function () { gameOver(); }, 800);
    }
  }

  Game.playCard = function (i) {
    var c = S.run.combat;
    if (!c || c.over) return;
    var r = S.engine.playCard(i);
    if (!r.ok) return;
    Sfx.play('card');
    render();
    if (r.dmgToEnemy > 0) { UI.floater('enemy-img', '-' + r.dmgToEnemy, 'dmg'); UI.shake('enemy-img'); Sfx.play('hit'); }
    if (r.blockGained > 0) { UI.floater('player-img', '+' + r.blockGained + ' 格挡', 'block'); Sfx.play('block'); }
    if (r.dmgToPlayer > 0) { UI.floater('player-img', '-' + r.dmgToPlayer, 'dmg'); UI.shake('player-img'); }
    if (r.card.effects.some(function (ef) { return ef.op === 'heal'; })) Sfx.play('heal');
    if (c.easterEgg) {
      UI.floater('enemy-img', c.easterEgg, 'text');
      c.easterEgg = null;
    }
    afterCombat();
  };

  Game.endTurn = function () {
    var c = S.run.combat;
    if (!c || c.over) return;
    var r = S.engine.endTurn();
    Sfx.play('draw');
    render();
    if (r.dmgToPlayer > 0) { UI.floater('player-img', '-' + r.dmgToPlayer, 'dmg'); UI.shake('player-img'); Sfx.play('hit'); }
    if (r.skipped) UI.floater('enemy-img', '跳过了行动！', 'text');
    if (r.enemyBlock > 0) UI.floater('enemy-img', '+' + r.enemyBlock + ' 格挡', 'block');
    afterCombat();
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
    render();
  }
})(typeof window !== 'undefined' ? window : globalThis);
