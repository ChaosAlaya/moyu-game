/* 摸鱼大作战 - 界面渲染（读 Game.state 全量重绘 + 飘字动画） */
(function (g) {
  'use strict';
  var D = g.GameData;
  var Engine = g.GameEngine.Engine;

  var app = null;
  function el() { if (!app) app = document.getElementById('app'); return app; }

  function imgSrc(img) { return 'assets/char/' + img + '.png'; }

  /* ---------- 通用片段 ---------- */
  function topbarHtml(S) {
    var run = S.run;
    var relics = run.relics.map(function (rid) {
      var r = D.relics[rid];
      return '<div class="relic-icon" title="' + r.name + '：' + r.desc + '">' +
        '<img src="' + imgSrc(r.img) + '" alt=""></div>';
    }).join('');
    return '<div class="topbar">' +
      '<span class="floor">' + D.acts[run.act - 1].name + ' · 第 ' + (run.step + 1) + '/' + D.STEPS_PER_ACT + ' 步</span>' +
      '<span class="hp-mini">精力 ' + run.hp + '/' + run.maxHp + '</span>' +
      '<span class="gold">金币 ' + run.gold + '</span>' +
      '<div class="relics">' + relics + '</div>' +
      '<div class="spacer"></div>' +
      '<button onclick="Game.showCodex()">图鉴</button>' +
      '<button onclick="Game.toTitle()">回标题</button>' +
      '</div>';
  }

  // 单张卡牌 HTML。inst: {uid,id,up} 或纯 id 字符串
  function cardHtml(inst, opts) {
    opts = opts || {};
    if (typeof inst === 'string') inst = { id: inst, up: false };
    var def = Engine.cardDef(inst);
    var cost = def.cost;
    if (opts.costFn) cost = opts.costFn(def, cost);
    var cls = 'card ' + def.type + (inst.up ? ' upgraded' : '') + (opts.extraCls || '');
    var typeName = def.type === 'attack' ? '攻击' : def.type === 'skill' ? '技能' : '能力';
    var artHtml = def.art
      ? '<div class="cart"><img class="' + (def.artFit === 'contain' ? 'fit-contain' : 'fit-cover') +
        '" src="' + def.art + '" alt=""></div>'
      : '';
    return '<div class="' + cls + '" ' + (opts.onclick ? 'onclick="' + opts.onclick + '"' : '') + '>' +
      '<div class="cost">' + cost + '</div>' +
      '<div class="ctitle">' + def.name + (inst.up ? '+' : '') + '</div>' +
      artHtml +
      '<div class="ctype">' + typeName + ' · ' + rarityName(def.rarity) + (def.exhaust ? ' · 消耗' : '') + '</div>' +
      '<div class="cdesc">' + def.desc + '</div>' +
      '</div>';
  }

  function rarityName(r) { return r === 'common' ? '普通' : r === 'uncommon' ? '罕见' : '稀有'; }

  /* ---------- 标题 ---------- */
  function renderTitle(S) {
    var sv = S.save;
    return '<div class="screen" id="screen-title">' +
      '<div class="logo">摸鱼大作战</div>' +
      '<div class="subtitle">—— 猛男寨出品 · 摸穿 10 层公司大楼 ——</div>' +
      '<img class="mascot" src="' + imgSrc('xiaoq') + '" alt="摸鱼奎恩">' +
      '<div class="menu">' +
      '<button class="primary" onclick="Game.toChars()">开始摸鱼</button>' +
      '<button class="yellow" onclick="Game.showCodex()">图鉴</button>' +
      '<button onclick="Game.toggleSfx()">音效：' + (g.GameSfx.enabled ? '开' : '关') + '</button>' +
      '</div>' +
      '<div class="stats">最高到达：第 ' + sv.maxFloor + ' 层 · 通关 ' + sv.wins + ' 次 · 累计摸鱼 ' + sv.runs + ' 局</div>' +
      '</div>';
  }

  /* ---------- 角色选择 ---------- */
  function renderChars(S) {
    var cardsHtml = Object.keys(D.characters).map(function (cid) {
      var ch = D.characters[cid];
      var unlocked = !!S.save.unlocks[cid];
      var lockText = ch.unlock > 0 ? '通关第 ' + ch.unlock + ' 层解锁' : '';
      return '<div class="char-card' + (unlocked ? '' : ' locked') + '"' +
        (unlocked ? ' onclick="Game.pickChar(\'' + cid + '\')"' : '') + '>' +
        '<img src="' + imgSrc(ch.img) + '" alt="' + ch.name + '">' +
        '<div class="cname">' + ch.name + '</div>' +
        '<div class="ctitle">' + ch.title + '</div>' +
        '<div class="cdesc">' + (unlocked ? ch.passive : '🔒 ' + lockText) + '</div>' +
        '<div class="chp">精力 ' + ch.maxHp + ' · 初始牌组 10 张</div>' +
        '</div>';
    }).join('');
    return '<div class="screen" id="screen-chars">' +
      '<h2>选择你的摸鱼搭子</h2>' +
      '<div class="char-row">' + cardsHtml + '</div>' +
      '<button onclick="Game.toTitle()">返回</button>' +
      '</div>';
  }

  /* ---------- 地图 ---------- */
  var NODE_ICONS = { monster: '👾', elite: '💀', event: '❓', shop: '🏪', rest: '🍵', boss: '👑' };
  function renderMap(S) {
    var run = S.run;
    var steps = run.map.steps.map(function (opts, i) {
      var nodes = opts.map(function (nd, j) {
        var cls = 'map-node ' + nd.type;
        var onclick = '';
        if (i === run.step) { cls += ' current'; onclick = ' onclick="Game.pickNode(' + j + ')"'; }
        else if (i < run.step) cls += ' past';
        else cls += ' future';
        return '<div class="' + cls + '"' + onclick + '>' +
          (NODE_ICONS[nd.type] || '') + ' ' + D.NODE_NAMES[nd.type] + '</div>';
      }).join('');
      return '<div class="map-step"><div class="step-label">第 ' + (i + 1) + ' 步</div>' + nodes + '</div>';
    }).join('');
    return '<div class="screen" id="screen-map">' + topbarHtml(S) +
      '<div class="map-body">' + steps +
      '<div class="map-hint">选择一个节点前进，打败第 ' + run.act + ' 层的 BOSS！</div>' +
      '</div></div>';
  }

  /* ---------- 战斗 ---------- */
  function intentHtml(S) {
    var c = S.run.combat, e = c.enemy;
    if (e.skipTurns > 0) return '<div class="intent debuff">😴 跳过行动</div>';
    var mv = e.intent;
    if (!mv) return '<div class="intent">…</div>';
    var exact = S.run.relics.indexOf('glasses') >= 0;
    var txt = '';
    if (mv.type === 'attack') {
      var v = mv.value;
      if (exact) {
        v = v + e.strength;
        if (e.weak > 0) v = Math.floor(v * 0.75);
        if (c.playerVuln > 0) v = Math.floor(v * 1.5);
      }
      txt = '⚔ 攻击 ' + v + (mv.times > 1 ? '×' + mv.times : '');
      if (mv.weak) txt += ' +虚弱';
      if (mv.vulnerable) txt += ' +易伤';
    } else if (mv.type === 'block') txt = '🛡 防御 ' + (exact || true ? mv.value : '');
    else if (mv.type === 'debuff') txt = '💢 ' + mv.name;
    else if (mv.type === 'buff') txt = '💪 ' + mv.name + (mv.strength ? '（力量+' + mv.strength + '）' : '');
    else if (mv.type === 'charge') txt = '🔮 蓄力中…';
    else if (mv.type === 'heal') txt = '💚 回复 ' + mv.value;
    return '<div class="intent ' + mv.type + '">' + txt + '</div>';
  }

  function statusBadges(list) {
    return list.filter(function (x) { return x; }).map(function (x) {
      return '<span class="status ' + x.cls + '">' + x.txt + '</span>';
    }).join('');
  }

  function renderCombat(S) {
    var run = S.run, c = run.combat, e = c.enemy;
    var edef = D.enemies[e.id];
    var ch = D.characters[run.charId];
    var cls = edef.boss ? 'boss' : edef.elite ? 'elite' : '';
    var eHpPct = Math.max(0, e.hp / e.maxHp * 100);
    var pHpPct = Math.max(0, run.hp / run.maxHp * 100);

    var eStatus = statusBadges([
      e.strength ? { cls: 'str', txt: '力量+' + e.strength } : null,
      e.weak ? { cls: 'weak', txt: '虚弱 ' + e.weak } : null,
      e.vulnerable ? { cls: 'vuln', txt: '易伤 ' + e.vulnerable } : null
    ]);
    var pStatus = statusBadges([
      c.playerStrength ? { cls: 'str', txt: '力量+' + c.playerStrength } : null,
      c.playerWeak ? { cls: 'weak', txt: '虚弱 ' + c.playerWeak } : null,
      c.playerVuln ? { cls: 'vuln', txt: '易伤 ' + c.playerVuln } : null
    ].concat(c.powers.map(function (p) {
      var names = { scarf_power: '红围巾', leftover_shield: '剩饭护体', realm: '摸鱼境界' };
      return { cls: 'str', txt: (names[p.id] || p.id) + ' ' + p.value };
    })));

    var hasGamepad = run.relics.indexOf('gamepad') >= 0;
    var hand = c.hand.map(function (inst, i) {
      var def = Engine.cardDef(inst);
      var cost = def.cost;
      if (def.type === 'skill' && hasGamepad && !c.flags.gamepadUsed) cost = Math.max(0, cost - 1);
      var playable = cost <= c.energy && !c.over;
      return cardHtml(inst, {
        extraCls: playable ? '' : ' unplayable',
        onclick: playable ? 'Game.playCard(' + i + ')' : ''
      });
    }).join('');

    return '<div class="screen" id="screen-combat">' + topbarHtml(S) +
      '<div class="combat-area">' +
        '<div class="player-zone">' +
          '<img class="player-img" id="player-img" src="' + imgSrc(ch.img) + '" alt="' + ch.name + '">' +
          '<div class="enemy-name">' + ch.name + '</div>' +
          '<div class="hpbar"><div class="fill" style="width:' + pHpPct + '%"></div>' +
            '<div class="txt">' + run.hp + '/' + run.maxHp + '</div></div>' +
          (c.playerBlock > 0 ? '<div class="block-badge">🛡 格挡 ' + c.playerBlock + '</div>' : '') +
          '<div class="status-row">' + pStatus + '</div>' +
          '<div class="energy-orb" title="能量">' + c.energy + '/' + c.maxEnergy + '</div>' +
          '<div class="pile draw">牌堆 ' + c.drawPile.length + '</div>' +
          '<div class="pile discard">弃牌 ' + c.discard.length + '</div>' +
          (c.exhausted.length ? '<div class="pile exhaust">消耗 ' + c.exhausted.length + '</div>' : '') +
          '<button class="endturn primary" onclick="Game.endTurn()">结束回合</button>' +
        '</div>' +
        '<div class="enemy-zone">' +
          intentHtml(S) +
          '<img class="enemy-img ' + cls + ' act' + run.act + '" id="enemy-img" src="' + imgSrc(edef.img) + '" alt="' + e.name + '">' +
          '<div class="enemy-name">' + e.name + '</div>' +
          '<div class="hpbar"><div class="fill" style="width:' + eHpPct + '%"></div>' +
            '<div class="txt">' + e.hp + '/' + e.maxHp + '</div></div>' +
          (e.block > 0 ? '<div class="block-badge">🛡 格挡 ' + e.block + '</div>' : '') +
          '<div class="status-row">' + eStatus + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="hand">' + hand + '</div>' +
      '</div>';
  }

  /* ---------- 奖励 ---------- */
  function renderReward(S) {
    var rw = S.reward;
    var cardsHtml = rw.cards.map(function (cid, i) {
      return cardHtml(cid, { onclick: 'Game.rewardCard(' + i + ')' });
    }).join('');
    return '<div class="screen" id="screen-reward">' + topbarHtml(S) +
      '<div class="center-wrap"><div class="panel">' +
      '<h2>战斗胜利！</h2>' +
      '<div class="reward-gold">💰 获得金币 +' + rw.gold + '</div>' +
      (rw.relic ? '<div class="reward-relic">🏺 获得遗物「' + D.relics[rw.relic].name + '」：' + D.relics[rw.relic].desc + '</div>' : '') +
      '<div style="font-weight:900">选一张牌加入牌组（或跳过）：</div>' +
      '<div class="reward-cards">' + cardsHtml + '</div>' +
      '<button onclick="Game.rewardSkip()">跳过</button>' +
      '</div></div></div>';
  }

  /* ---------- 商店 ---------- */
  function renderShop(S) {
    var shop = S.shop, run = S.run;
    var cardsHtml = shop.cards.map(function (item, i) {
      return '<div class="shop-item' + (item.sold ? ' sold' : '') + '">' +
        cardHtml(item.id) +
        (item.sold ? '<div class="price-tag">已售出</div>'
          : '<button ' + (run.gold < item.price ? 'disabled' : '') +
            ' onclick="Game.shopBuyCard(' + i + ')">💰 ' + item.price + '</button>') +
        '</div>';
    }).join('');
    var relicsHtml = shop.relics.map(function (item, i) {
      var r = D.relics[item.id];
      return '<div class="shop-item shop-relic' + (item.sold ? ' sold' : '') + '">' +
        '<div class="relic-icon"><img src="' + imgSrc(r.img) + '"></div>' +
        '<div class="rname">' + r.name + '</div>' +
        '<div class="rdesc">' + r.desc + '</div>' +
        (item.sold ? '<div class="price-tag">已售出</div>'
          : '<button ' + (run.gold < item.price ? 'disabled' : '') +
            ' onclick="Game.shopBuyRelic(' + i + ')">💰 ' + item.price + '</button>') +
        '</div>';
    }).join('');
    var removeBtn = shop.removeUsed ? '<div class="price-tag">已使用</div>'
      : '<button ' + (run.gold < shop.removePrice ? 'disabled' : '') +
        ' onclick="Game.shopRemoveMode()">' + (shop.removePrice === 0 ? '免费删牌（会员卡）' : '删一张牌 💰 ' + shop.removePrice) + '</button>';
    return '<div class="screen" id="screen-shop">' + topbarHtml(S) +
      '<div class="center-wrap"><div class="panel">' +
      '<h2>🏪 秦国小卖铺</h2>' +
      '<div class="shop-cards-row">' + cardsHtml + '</div>' +
      '<div class="shop-bottom-row">' +
        '<div class="shop-col"><h3>遗物</h3><div class="shop-relics-row">' + relicsHtml + '</div></div>' +
        '<div class="shop-col"><h3>服务</h3><div class="shop-item">' + removeBtn + '</div></div>' +
      '</div>' +
      '<button class="primary" onclick="Game.shopLeave()">离开商店</button>' +
      '</div></div></div>';
  }

  /* ---------- 休息 ---------- */
  function renderRest(S) {
    var amt = Math.floor(S.run.maxHp * 0.3) + (S.run.relics.indexOf('bowl') >= 0 ? 10 : 0);
    return '<div class="screen" id="screen-rest">' + topbarHtml(S) +
      '<div class="center-wrap"><div class="panel">' +
      '<h2>🍵 茶水间</h2>' +
      '<div class="event-text">难得的摸鱼时光。要休息一下，还是研究一下牌技？</div>' +
      '<div class="rest-opts">' +
      '<button class="primary" onclick="Game.restHeal()">泡杯茶（回复 ' + amt + ' 点精力）</button>' +
      '<button class="yellow" onclick="Game.restUpgradeMode()">研究攻略（升级 1 张牌）</button>' +
      '</div></div></div></div>';
  }

  /* ---------- 事件 ---------- */
  function renderEvent(S) {
    var ev = D.events[S.eventId];
    var body;
    if (S.eventResult) {
      body = '<div class="event-result">' + S.eventResult + '</div>' +
        '<button class="primary" onclick="Game.eventContinue()">继续</button>';
    } else {
      body = '<div class="event-opts">' + ev.options.map(function (opt, i) {
        var disabled = opt.gold && S.run.gold < opt.gold ? ' disabled' : '';
        return '<button' + disabled + ' onclick="Game.eventOpt(' + i + ')">' + opt.text + '</button>';
      }).join('') + '</div>';
    }
    return '<div class="screen" id="screen-event">' + topbarHtml(S) +
      '<div class="center-wrap"><div class="panel">' +
      '<h2>' + ev.name + '</h2>' +
      '<img class="event-img" src="' + imgSrc(ev.img) + '">' +
      '<div class="event-text">' + ev.text + '</div>' + body +
      '</div></div></div>';
  }

  /* ---------- 选牌（删牌/升级） ---------- */
  function renderDeckSelect(S) {
    var title = S.selecting === 'shopRemove' ? '选择要移除的牌'
      : S.selecting === 'eventRemove' ? '选择要移除的牌'
      : '选择要升级的牌';
    var list = S.run.deck.filter(function (inst) {
      return S.selecting === 'restUpgrade' ? !inst.up : true;
    });
    var cardsHtml = list.map(function (inst) {
      return cardHtml(inst, { onclick: 'Game.deckSelectPick(' + inst.uid + ')' });
    }).join('') || '<div>没有可选择的牌</div>';
    var cancelBtn = S.selecting === 'shopRemove'
      ? '<button onclick="Game.deckSelectCancel()">取消</button>' : '';
    return '<div class="screen" id="screen-decksel">' + topbarHtml(S) +
      '<div class="center-wrap"><div class="panel">' +
      '<h2>' + title + '</h2>' +
      '<div class="deck-select">' + cardsHtml + '</div>' + cancelBtn +
      '</div></div></div>';
  }

  /* ---------- 结算 ---------- */
  function renderOver(S) {
    var run = S.run;
    var win = run.victory;
    var tips = (S.newUnlocks || []).map(function (cid) {
      return '🎉 解锁角色「' + D.characters[cid].name + '」！';
    });
    return '<div class="screen" id="screen-over">' +
      '<div class="verdict ' + (win ? 'win' : 'lose') + '">' + (win ? '下班成功！' : '被工作击倒了…') + '</div>' +
      '<img class="mascot" style="height:220px" src="' + imgSrc(D.characters[run.charId].img) + '">' +
      '<div class="summary">角色：' + D.characters[run.charId].name +
      '<br>到达：第 ' + run.act + ' 层 · 通关层数：' + run.floorsCleared +
      '<br>剩余金币：' + run.gold + ' · 牌组：' + run.deck.length + ' 张 · 遗物：' + run.relics.length + ' 件</div>' +
      tips.map(function (t) { return '<div class="unlock-tip">' + t + '</div>'; }).join('') +
      '<div style="display:flex;gap:14px">' +
      '<button class="primary" onclick="Game.toChars()">再来一局</button>' +
      '<button class="yellow" onclick="Game.shareResult()">复制战绩</button>' +
      '<button onclick="Game.toTitle()">回标题</button>' +
      '</div><div id="share-fallback"></div></div>';
  }

  /* ---------- 图鉴 ---------- */
  function renderCodex(S) {
    var tab = S.codexTab || 'cards';
    var seen = S.save.codex;
    var body = '';
    if (tab === 'cards') {
      body = Object.keys(D.cards).map(function (cid) {
        if (seen.cards[cid]) return cardHtml(cid);
        return '<div class="card"><div class="ctitle">？？？</div><div class="cdesc">尚未见过</div></div>';
      }).join('');
    } else if (tab === 'relics') {
      body = Object.keys(D.relics).map(function (rid) {
        var r = D.relics[rid], s = seen.relics[rid];
        return '<div class="codex-item' + (s ? '' : ' unseen') + '">' +
          '<img src="' + imgSrc(r.img) + '">' +
          '<div class="nm">' + (s ? r.name : '？？？') + '</div>' +
          '<div>' + (s ? r.desc : '尚未见过') + '</div></div>';
      }).join('');
    } else {
      body = Object.keys(D.enemies).map(function (eid) {
        var e = D.enemies[eid], s = seen.enemies[eid];
        return '<div class="codex-item' + (s ? '' : ' unseen') + '">' +
          '<img src="' + imgSrc(e.img) + '">' +
          '<div class="nm">' + (s ? e.name : '？？？') + '</div>' +
          '<div>' + (s ? ('精力 ' + e.hp + (e.boss ? ' · BOSS' : e.elite ? ' · 精英' : '')) : '尚未见过') + '</div></div>';
      }).join('');
    }
    var back = S.run && !S.run.over && S.screenBeforeCodex
      ? '<button onclick="Game.closeCodex()">返回游戏</button>'
      : '<button onclick="Game.toTitle()">返回</button>';
    return '<div class="screen" id="screen-codex">' +
      '<div class="center-wrap"><div class="panel">' +
      '<h2>📖 摸鱼图鉴</h2>' +
      '<div class="codex-tabs">' +
      '<button class="' + (tab === 'cards' ? 'primary' : '') + '" onclick="Game.codexTab(\'cards\')">卡牌</button>' +
      '<button class="' + (tab === 'relics' ? 'primary' : '') + '" onclick="Game.codexTab(\'relics\')">遗物</button>' +
      '<button class="' + (tab === 'enemies' ? 'primary' : '') + '" onclick="Game.codexTab(\'enemies\')">敌人</button>' +
      '</div>' +
      '<div class="codex-body">' + body + '</div>' + back +
      '</div></div></div>';
  }

  /* ---------- 主渲染 ---------- */
  function render() {
    var S = g.Game.state;
    var html;
    switch (S.screen) {
      case 'title': html = renderTitle(S); break;
      case 'chars': html = renderChars(S); break;
      case 'map': html = renderMap(S); break;
      case 'combat': html = renderCombat(S); break;
      case 'reward': html = renderReward(S); break;
      case 'shop': html = renderShop(S); break;
      case 'rest': html = renderRest(S); break;
      case 'event': html = renderEvent(S); break;
      case 'deckSelect': html = renderDeckSelect(S); break;
      case 'over': html = renderOver(S); break;
      case 'codex': html = renderCodex(S); break;
      default: html = '<div class="screen">未知界面</div>';
    }
    el().innerHTML = html;
  }

  /* ---------- 飘字与受击 ---------- */
  function floater(targetId, text, cls) {
    var t = document.getElementById(targetId);
    var fx = document.getElementById('fx');
    if (!t || !fx) return;
    var r = t.getBoundingClientRect();
    var d = document.createElement('div');
    d.className = 'floater ' + (cls || 'dmg');
    d.textContent = text;
    d.style.left = (r.left + r.width / 2 - 20 + (Math.random() * 40 - 20)) + 'px';
    d.style.top = (r.top + r.height / 3) + 'px';
    fx.appendChild(d);
    setTimeout(function () { d.remove(); }, 1000);
  }

  function shake(targetId) {
    var t = document.getElementById(targetId);
    if (!t) return;
    t.classList.add('hurt');
    setTimeout(function () { t.classList.remove('hurt'); }, 400);
  }

  // 轻提示（复制成功等）
  function toast(msg) {
    var d = document.createElement('div');
    d.className = 'toast';
    d.textContent = msg;
    document.body.appendChild(d);
    setTimeout(function () { d.classList.add('show'); }, 10);
    setTimeout(function () {
      d.classList.remove('show');
      setTimeout(function () { d.remove(); }, 300);
    }, 1800);
  }

  g.GameUI = { render: render, floater: floater, shake: shake, toast: toast };
})(typeof window !== 'undefined' ? window : globalThis);
