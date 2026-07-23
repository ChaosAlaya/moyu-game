/* 摸鱼大作战 - 界面渲染（读 Game.state 全量重绘 + 飘字动画） */
(function (g) {
  'use strict';
  var D = g.GameData;
  var Engine = g.GameEngine.Engine;

  var app = null;
  function el() { if (!app) app = document.getElementById('app'); return app; }

  function imgSrc(img) { return 'assets/char/' + img + '.png'; } // 旧立绘（备用）
  // v2 美术（约定路径，无需数据字段）
  function enemyArt(id, phase2) { return 'assets/v2/enemy/' + id + (phase2 ? '_p2' : '') + '.jpg'; }
  function relicArt(id) { return 'assets/v2/relic/' + id + '.jpg'; }
  function eventArt(id) { return 'assets/v2/event/' + id + '.jpg'; }
  function bannerArt(act) { return 'assets/v2/banner/act' + act + '.jpg'; }
  function iconSrc(name) { return 'assets/v2/icon/' + name + '.png'; }
  function ico(name) { return '<img class="ico" src="' + iconSrc(name) + '" alt="">'; }

  /* ---------- 通用片段 ---------- */
  // 已装备圣物判定（与引擎 hasRelic 口径一致；旧内存档无 equippedRelics 时回退为全部拥有）
  function runHasRelic(run, id) {
    var eq = run.equippedRelics || run.relics;
    return eq.indexOf(id) >= 0;
  }

  function topbarHtml(S) {
    var run = S.run;
    var equipped = run.equippedRelics || run.relics;
    var relics = equipped.map(function (rid) {
      var r = D.relics[rid];
      return '<div class="relic-icon"><img src="' + relicArt(rid) + '" alt="">' +
        '<span class="tip"><b>' + r.name + '</b>' + r.desc + '</span></div>';
    }).join('');
    return '<div class="topbar">' +
      '<span class="floor">' + D.acts[run.act - 1].name + ' · 第 ' + (run.step + 1) + '/' + D.STEPS_PER_ACT + ' 步</span>' +
      '<span class="hp-mini">精力 ' + run.hp + '/' + run.maxHp + '</span>' +
      '<span class="gold">' + ico('gold') + ' ' + run.gold + '</span>' +
      '<div class="relics" onclick="Game.showRelics()" title="点击管理圣物装备">' + relics +
        '<span class="relic-count">' + equipped.length + '/' + g.GameEngine.MAX_EQUIPPED_RELICS + '</span></div>' +
      '<div class="spacer"></div>' +
      '<button onclick="Game.showDeck(\'deck\')">牌组 ' + run.deck.length + '</button>' +
      '<button onclick="Game.showCodex()">图鉴</button>' +
      '<button onclick="Game.toTitle()">回标题</button>' +
      '</div>';
  }

  // 单张卡牌 HTML。inst: {uid,id,up} 或纯 id 字符串
  // 结构按《卡牌组件详细规范》：费用水晶/类型色标题条/插画窗/类型行/效果文本/升级+角标
  var TYPE_META = {
    attack: { name: '攻击卡', icon: 'intent_attack' },
    skill: { name: '技能卡', icon: 'buff' },
    power: { name: '能力卡', icon: 'block' }
  };
  function cardHtml(inst, opts) {
    opts = opts || {};
    if (typeof inst === 'string') inst = { id: inst, up: false };
    var def = Engine.cardDef(inst);
    var cost = def.cost;
    if (opts.costFn) cost = opts.costFn(def, cost);
    var cls = 'card ' + def.type + (inst.up ? ' upgraded' : '') + (opts.extraCls || '');
    var meta = TYPE_META[def.type] || TYPE_META.attack;
    var artHtml = def.art
      ? '<div class="cart"><img class="' + (def.artFit === 'contain' ? 'fit-contain' : 'fit-cover') +
        '" src="' + def.art + '" alt=""></div>'
      : '';
    return '<div class="' + cls + '" ' + (opts.extraAttr || '') + (opts.onclick ? 'onclick="' + opts.onclick + '"' : '') + '>' +
      '<div class="cost">' + cost + '</div>' +
      '<div class="ctitle">' + def.name + '</div>' +
      artHtml +
      '<div class="ctype">' + ico(meta.icon) + '<span>' + meta.name + '</span>' +
        '<em>' + rarityName(def.rarity) + (def.exhaust ? ' · 消耗' : '') + '</em></div>' +
      '<div class="cdesc">' + def.desc + '</div>' +
      (inst.up ? '<div class="upbadge">+</div>' : '') +
      (opts.extraHtml || '') +
      '</div>';
  }

  function rarityName(r) { return r === 'common' ? '普通' : r === 'uncommon' ? '罕见' : '稀有'; }

  /* ---------- 标题（横版主视觉 + 右侧竖排按钮） ---------- */
  function renderTitle(S) {
    var sv = S.save;
    return '<div class="screen title-bg2" id="screen-title">' +
      '<div class="title-menu2">' +
      '<button class="tbtn primary" onclick="Game.toChars()">▶ 开始摸鱼</button>' +
      '<button class="tbtn" onclick="Game.showCodex()">📖 图鉴</button>' +
      '<button class="tbtn" onclick="Game.toHistory()">🏆 战绩</button>' +
      '<button class="tbtn" onclick="Game.toSave()">💾 存档</button>' +
      '<button class="tbtn" onclick="Game.toggleSfx()">🔊 音效：' + (g.GameSfx.enabled ? '开' : '关') + '</button>' +
      '</div>' +
      '<div class="stats">最高到达：第 ' + sv.maxFloor + ' 层 · 通关 ' + sv.wins + ' 次 · 累计摸鱼 ' + sv.runs + ' 局</div>' +
      '</div>';
  }

  /* ---------- 战绩簿 ---------- */
  function renderHistory(S) {
    var list = (S.save.history || []).map(function (h) {
      var d = new Date(h.t);
      var date = (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
        ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
      var chName = D.characters[h.char] ? D.characters[h.char].name : h.char;
      var result = h.victory
        ? '<span class="h-win">通关 10 层！</span>'
        : '倒在第 ' + h.act + ' 层' + (h.killer ? '（' + h.killer + '）' : '');
      return '<div class="h-row">' +
        '<span class="h-date">' + date + '</span>' +
        '<span class="h-char">' + chName + '</span>' +
        '<span class="h-result">' + result + '</span>' +
        '<span class="h-detail">牌组 ' + h.deck + ' · 圣物 ' + h.relics + '</span>' +
        '</div>';
    }).join('') || '<div class="event-text"><img class="empty-deco" src="assets/cardart/bubble_sockdog.png" alt=""><br>还没有战绩，去摸一局吧！</div>';
    return '<div class="screen dark-page" id="screen-history">' +
      '<div class="center-wrap"><div class="panel">' +
      '<h2>📜 摸鱼战绩簿</h2>' +
      '<div class="h-list">' + list + '</div>' +
      '<button onclick="Game.toTitle()">返回</button>' +
      '</div></div></div>';
  }

  /* ---------- 存档导入/导出 ---------- */
  function renderSave(S) {
    return '<div class="screen dark-page" id="screen-save">' +
      '<div class="center-wrap"><div class="panel">' +
      '<h2>💾 存档</h2>' +
      '<img class="empty-deco" src="assets/cardart/bubble_speeddog.png" alt="">' +
      '<div class="event-text">导出存档码可转移到其他设备；导入他人存档码会覆盖当前进度。</div>' +
      '<h3>导出存档码</h3>' +
      '<textarea id="save-export" readonly>' + (S.saveCode || '') + '</textarea>' +
      '<button class="yellow" onclick="Game.copySaveCode()">复制存档码</button>' +
      '<h3>导入存档码</h3>' +
      '<textarea id="save-import" placeholder="粘贴存档码…"></textarea>' +
      '<button class="primary" onclick="Game.importSave()">导入</button>' +
      '<button onclick="Game.toTitle()">返回</button>' +
      '</div></div></div>';
  }

  /* ---------- 角色选择 ---------- */
  function renderChars(S) {
    var cardsHtml = Object.keys(D.characters).map(function (cid) {
      var ch = D.characters[cid];
      var unlocked = !!S.save.unlocks[cid];
      var lockText = ch.unlock > 0 ? '通关第 ' + ch.unlock + ' 层解锁' : '';
      return '<div class="char-card' + (unlocked ? '' : ' locked') + '"' +
        (unlocked ? ' onclick="Game.pickChar(\'' + cid + '\')"' : '') + '>' +
        '<img class="char-avatar" src="' + (ch.avatar || imgSrc(ch.img)) + '" alt="' + ch.name + '">' +
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

  /* ---------- 地图（横向步骤卡片流 redesign） ---------- */
  function nodeArt(nd) {
    if (nd.enemyId) return enemyArt(nd.enemyId);
    if (nd.type === 'shop') return eventArt('shop_event');
    if (nd.type === 'rest') return 'assets/cardart/chicken_soup.png';
    return null; // 事件：大红问号
  }

  function renderMap(S) {
    var run = S.run;
    // 电梯刻度尺：logo 条 + 10F→1F + 沙发狗
    var floors = '<div class="lift-logo">摸鱼<br>大作战</div>';
    for (var f = D.TOTAL_ACTS; f >= 1; f--) {
      var fc = 'lift-btn';
      if (f === run.act) fc += ' current';
      else if (f < run.act) fc += ' cleared';
      else fc += ' todo';
      floors += '<div class="' + fc + '">' + f + 'F' +
        (f < run.act ? ' ✓' : f > run.act ? ' 🔒' : '') + '</div>';
    }
    floors += '<img class="lift-dog" src="assets/v2/ui/sofa_dog.png" alt="">';
    // 横向步骤卡片流
    var cols = run.map.steps.map(function (opts, i) {
      var cards = opts.map(function (nd, j) {
        var state, onclick = '';
        if (i < run.step) state = (run.path && run.path[i] === j) ? 'done' : 'locked';
        else if (i === run.step) { state = (S.selectedNode === j) ? 'sel' : 'open'; onclick = ' onclick="Game.selectNode(' + j + ')"'; }
        else state = 'locked';
        var art = nodeArt(nd);
        var inner = art ? '<img class="nart" src="' + art + '" alt="">'
          : '<div class="nart nq">?</div>';
        var badge = state === 'done' ? '<div class="nbadge okb">✓</div>'
          : state === 'locked' ? '<div class="nbadge lockb">🔒</div>' : '';
        var label = nd.type === 'boss' ? 'BOSS' : D.NODE_NAMES[nd.type];
        return '<div class="ncard t-' + nd.type + ' ' + state + '"' + onclick + '>' + badge + inner +
          '<div class="nlabel">' + label + '</div></div>';
      }).join('');
      return '<div class="step-col">' +
        '<div class="step-tag' + (i === run.map.steps.length - 1 ? ' boss' : '') + '">' +
          (i === run.map.steps.length - 1 ? 'BOSS' : '第' + (i + 1) + '步') + '</div>' +
        cards + '</div>';
    }).join('');
    // 底部进度圆点
    var dots = run.map.steps.map(function (_, i) {
      return '<div class="fdot' + (i < run.step ? ' done' : i === run.step ? ' cur' : '') + '"></div>';
    }).join('');
    var canGo = S.selectedNode != null;
    return '<div class="screen map-v2" id="screen-map" style="background-image:url(' + bannerArt(run.act) + ')">' +
      topbarHtml(S) +
      '<div class="map-v2-body">' +
        '<div class="lift">' + floors + '</div>' +
        '<div class="map-flow">' + cols + '</div>' +
      '</div>' +
      '<div class="map-bottom">' +
        '<div class="fdots">' + dots + '</div>' +
        '<button class="primary go-btn" ' + (canGo ? '' : 'disabled') + ' onclick="Game.confirmNode()">前进 ⚡</button>' +
      '</div>' +
      '</div>';
  }

  // 渲染后绘制节点连接线（相对 #map-steps 容器坐标）
  function drawMapLinks() {
    var svg = document.getElementById('map-links');
    var box = document.getElementById('map-steps');
    if (!svg || !box) return;
    var S = g.Game.state, run = S.run;
    var base = box.getBoundingClientRect();
    svg.setAttribute('width', box.scrollWidth);
    svg.setAttribute('height', box.scrollHeight);
    var html = '';
    function center(id) {
      var t = document.getElementById(id);
      if (!t) return null;
      var r = t.getBoundingClientRect();
      return [r.left - base.left + r.width / 2, r.top - base.top + r.height / 2];
    }
    for (var s = 0; s < run.map.steps.length - 1; s++) {
      var cur = run.map.steps[s], nxt = run.map.steps[s + 1];
      for (var j = 0; j < cur.length; j++) {
        var a = center('node-' + s + '-' + j);
        if (!a) continue;
        for (var k = 0; k < nxt.length; k++) {
          var b = center('node-' + (s + 1) + '-' + k);
          if (!b) continue;
          var active = run.path && run.path[s] === j && run.path[s + 1] === k;
          html += '<line x1="' + a[0] + '" y1="' + a[1] + '" x2="' + b[0] + '" y2="' + b[1] +
            '" class="' + (active ? 'link active' : 'link') + '"/>';
        }
      }
    }
    svg.innerHTML = html;
  }

  /* ---------- 战斗 ---------- */
  // 从招式数据自动生成中文效果描述（不写死）
  function moveDesc(mv) {
    var parts = [];
    if (mv.type === 'attack') {
      parts.push('造成 ' + mv.value + ' 点伤害' + (mv.times > 1 ? ' ×' + mv.times : ''));
      if (mv.weak) parts.push('给你 ' + mv.weak + ' 回合虚弱');
      if (mv.vulnerable) parts.push('给你 ' + mv.vulnerable + ' 回合易伤');
      if (mv.strength) parts.push('自身力量 +' + mv.strength);
    } else if (mv.type === 'block') parts.push('获得 ' + mv.value + ' 点格挡');
    else if (mv.type === 'debuff') {
      if (mv.weak) parts.push('给你 ' + mv.weak + ' 回合虚弱');
      if (mv.vulnerable) parts.push('给你 ' + mv.vulnerable + ' 回合易伤');
    }
    else if (mv.type === 'buff') parts.push(mv.strength ? '自身力量 +' + mv.strength : '强化自身');
    else if (mv.type === 'charge') parts.push('蓄力中，下回合大额伤害');
    else if (mv.type === 'heal') parts.push('回复 ' + mv.value + ' 点精力');
    return parts.join('，');
  }

  function intentHtml(S) {
    var c = S.run.combat, e = c.enemy;
    if (e.skipTurns > 0) {
      return '<div class="intent debuff" title="摸鱼禁止生效中">' + ico('debuff') +
        ' 被禁止摸鱼：跳过下一次行动</div>';
    }
    var mv = e.intent;
    if (!mv) return '<div class="intent">…</div>';
    var ic = 'buff';
    if (mv.type === 'attack') ic = 'intent_attack';
    else if (mv.type === 'block') ic = 'defend';
    else if (mv.type === 'debuff') ic = 'debuff';
    else if (mv.type === 'charge') ic = 'charge';
    else if (mv.type === 'heal') ic = 'heal';
    var text = mv.name + '：' + moveDesc(mv);
    // 肯尼的镜片：tooltip 里给精确结算数值
    var tip = text;
    if (runHasRelic(S.run, 'glasses') && mv.type === 'attack') {
      var v = mv.value + e.strength + (e.dmgBonus || 0);
      if (e.weak > 0) v = Math.floor(v * 0.75);
      if (c.playerVuln > 0) v = Math.floor(v * 1.5);
      tip += '（精确：每段 ' + v + ' 点）';
    }
    return '<div class="intent ' + mv.type + '" title="' + tip + '">' + ico(ic) + ' ' + text + '</div>';
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
    // 老板等带阶段的 BOSS：阶段 2 换图
    var eArt = enemyArt(e.id, edef.phases && e.phase > 0);

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

    var hasGamepad = runHasRelic(run, 'gamepad');
    var hand = c.hand.map(function (inst, i) {
      var def = Engine.cardDef(inst);
      var cost = def.cost;
      if (def.type === 'skill' && hasGamepad && !c.flags.gamepadUsed) cost = Math.max(0, cost - 1);
      var playable = cost <= c.energy && !c.over;
      // 抽牌入场动画（仅在 endTurn 后的那次渲染开启）
      var dealAttr = S.dealAnim
        ? ' style="animation-delay:' + (i * 45) + 'ms"'
        : '';
      // RUA!：伤害随打出的攻击牌数成长，卡面角标显示当前实际伤害（含力量/圣物加成）
      var extraHtml = '';
      for (var ei = 0; ei < def.effects.length; ei++) {
        var ef = def.effects[ei];
        if (ef.op === 'special' && ef.kind === 'rua') {
          var ruaDmg = ef.base + ef.per * c.attacksPlayed + c.playerStrength +
            (runHasRelic(run, 'keyboard_rel') ? 1 : 0) +
            (runHasRelic(run, 'sword_tassel') && (edef.elite || edef.boss) ? 2 : 0);
          extraHtml = '<div class="dmg-badge">' + ico('intent_attack') + ruaDmg + '</div>';
        }
      }
      return cardHtml(inst, {
        extraCls: (playable ? '' : ' unplayable') + (S.dealAnim ? ' deal-in' : ''),
        onclick: playable ? 'Game.playCard(' + i + ')' : '',
        extraAttr: dealAttr,
        extraHtml: extraHtml
      });
    }).join('');

    return '<div class="screen combat-bg" id="screen-combat" style="background-image:url(' + bannerArt(run.act) + ')">' + topbarHtml(S) +
      '<div class="intent-legend">意图：' +
        ico('intent_attack') + '攻击 ' + ico('defend') + '防御 ' + ico('debuff') + '减益 ' +
        ico('charge') + '蓄力 ' + ico('heal') + '回血 ' + ico('buff') + '强化</div>' +
      '<div class="combat-area">' +
        '<div class="player-zone">' +
          '<div class="pstat">' +
            '<div class="pname">' + ch.name + '</div>' +
            '<div class="hpbar"><div class="fill" style="width:' + pHpPct + '%"></div>' +
              '<div class="txt">' + run.hp + '/' + run.maxHp + '</div></div>' +
            '<div class="block-badge">' + ico('block') + ' 格挡 ' + c.playerBlock + '</div>' +
            '<div class="status-row">' + pStatus + '</div>' +
            '<div class="energy-orb" title="能量">' + ico('energy') + '<span>' + c.energy + '/' + c.maxEnergy + '</span></div>' +
          '</div>' +
          '<div class="pstage">' +
            '<img class="player-img full" id="player-img" src="' + imgSrc(ch.img) + '" alt="' + ch.name + '">' +
            '<div class="stage-ellipse"></div>' +
          '</div>' +
          '<div class="pile draw" onclick="Game.showDeck(\'draw\')" title="查看抽牌堆"><img class="cardback" src="assets/v2/ui/cardback.jpg" alt="">牌堆 ' + c.drawPile.length + '</div>' +
          '<div class="pile discard" onclick="Game.showDeck(\'discard\')" title="查看弃牌堆">弃牌 ' + c.discard.length + '</div>' +
          (c.exhausted.length ? '<div class="pile exhaust">消耗 ' + c.exhausted.length + '</div>' : '') +
        '</div>' +
        '<div class="enemy-zone">' +
          intentHtml(S) +
          '<img class="enemy-img v2 ' + cls + '" id="enemy-img" src="' + eArt + '" alt="' + e.name + '">' +
          '<div class="enemy-name">' + e.name + '</div>' +
          '<div class="hpbar"><div class="fill" style="width:' + eHpPct + '%"></div>' +
            '<div class="txt">' + e.hp + '/' + e.maxHp + '</div></div>' +
          (e.block > 0 ? '<div class="block-badge">' + ico('block') + ' 格挡 ' + e.block + '</div>' : '') +
          '<div class="status-row">' + eStatus + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="hand' + (S.animating ? ' anim-lock' : '') + '">' + hand +
        '<button class="endturn primary' + (S.animating ? ' anim-lock' : '') + '" onclick="Game.endTurn()">结束回合</button></div>' +
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
      '<div class="reward-gold">' + ico('gold') + ' +' + rw.gold + ' 金币</div>' +
      (rw.relic ? '<div class="reward-relic">🏺 获得圣物「' + D.relics[rw.relic].name + '」：' + D.relics[rw.relic].desc +
        (runHasRelic(S.run, rw.relic) ? '' : '<br><em>装备栏已满，已放入背包——点击顶栏圣物图标调整装备</em>') + '</div>' : '') +
      '<div style="font-weight:900">选一张牌加入牌组（或跳过）：</div>' +
      '<div class="reward-cards">' + cardsHtml + '</div>' +
      '<button onclick="Game.rewardSkip()">跳过</button>' +
      '</div></div></div>';
  }

  /* ---------- 商店（店面 redesign） ---------- */
  function renderShop(S) {
    var shop = S.shop, run = S.run;
    // 卡牌货架：价签贴在右上角
    var cardsHtml = shop.cards.map(function (item, i) {
      var inner = item.sold
        ? '<div class="sold-stamp">已售出</div>'
        : '<button class="price-tag-btn' + (run.gold < item.price ? ' cant' : '') + '"' +
          (run.gold < item.price ? ' disabled' : '') +
          ' onclick="Game.shopBuyCard(' + i + ')">' + ico('gold') + ' ' + item.price + '</button>';
      return '<div class="shop-item ware' + (item.sold ? ' sold' : '') + '">' +
        cardHtml(item.id) + inner + '</div>';
    }).join('');
    // 圣物货架
    var relicsHtml = shop.relics.map(function (item, i) {
      var r = D.relics[item.id];
      var inner = item.sold
        ? '<div class="sold-stamp">已售出</div>'
        : '<button class="price-tag-btn' + (run.gold < item.price ? ' cant' : '') + '"' +
          (run.gold < item.price ? ' disabled' : '') +
          ' onclick="Game.shopBuyRelic(' + i + ')">' + ico('gold') + ' ' + item.price + '</button>';
      return '<div class="shop-item ware shop-relic' + (item.sold ? ' sold' : '') + '">' +
        '<div class="relic-icon big"><img src="' + relicArt(item.id) + '"></div>' +
        '<div class="rname">' + r.name + '</div>' +
        '<div class="rdesc">' + r.desc + '</div>' + inner + '</div>';
    }).join('');
    // 服务台：付费删牌
    var removeBtn = shop.removeUsed
      ? '<div class="sold-stamp static">已使用</div>'
      : '<button class="price-tag-btn static' + (run.gold < shop.removePrice ? ' cant' : '') + '"' +
        (run.gold < shop.removePrice ? ' disabled' : '') +
        ' onclick="Game.shopRemoveMode()">' +
        (shop.removePrice === 0 ? '免费删牌（会员卡）' : '删一张牌 ' + ico('gold') + ' ' + shop.removePrice) + '</button>';
    return '<div class="screen" id="screen-shop">' + topbarHtml(S) +
      '<div class="center-wrap"><div class="panel shop-panel-v2">' +
      '<div class="shop-front"><img src="' + eventArt('shop_event') + '" alt="秦国小卖铺">' +
        '<div class="shop-sign">秦国小卖铺</div></div>' +
      '<div class="shop-greet">「香香鸡，香喷喷的香香鸡！客官看看再走吧～」</div>' +
      '<div class="shop-section"><div class="shop-sec-title">— 卡牌货架 —</div>' +
        '<div class="shop-cards-row">' + cardsHtml + '</div></div>' +
      '<div class="shop-section"><div class="shop-sec-title">— 圣物货架 —</div>' +
        '<div class="shop-relics-row">' + relicsHtml + '</div></div>' +
      '<div class="shop-section"><div class="shop-sec-title">— 服务台 —</div>' +
        '<div class="shop-service">' + removeBtn + '</div></div>' +
      '<button class="primary" onclick="Game.shopLeave()">离开商店</button>' +
      '</div></div></div>';
  }

  /* ---------- 事件（左右双栏 redesign） ---------- */
  function renderEvent(S) {
    var ev = D.events[S.eventId];
    var body;
    if (S.eventResult) {
      body = '<div class="event-result">' + S.eventResult + '</div>' +
        '<button class="primary ev-opt" onclick="Game.eventContinue()">继续</button>';
    } else {
      body = ev.options.map(function (opt, i) {
        var disabled = opt.gold && S.run.gold < opt.gold ? ' disabled' : '';
        return '<button class="ev-opt"' + disabled + ' onclick="Game.eventOpt(' + i + ')">' + opt.text + '</button>';
      }).join('');
    }
    return '<div class="screen" id="screen-event">' + topbarHtml(S) +
      '<div class="center-wrap"><div class="panel ev-panel">' +
      '<h2>' + ev.name + '</h2>' +
      '<div class="ev-cols">' +
        '<img class="ev-art" src="' + eventArt(S.eventId) + '">' +
        '<div class="ev-right">' +
          '<div class="event-text">' + ev.text + '</div>' + body +
        '</div>' +
      '</div>' +
      '</div></div></div>';
  }

  /* ---------- 休息（左右双栏） ---------- */
  function renderRest(S) {
    var amt = Math.floor(S.run.maxHp * 0.3) + (runHasRelic(S.run, 'bowl') ? 10 : 0);
    return '<div class="screen" id="screen-rest">' + topbarHtml(S) +
      '<div class="center-wrap"><div class="panel ev-panel">' +
      '<h2>🍵 茶水间</h2>' +
      '<div class="ev-cols">' +
        '<img class="ev-art" src="assets/cardart/chicken_soup.png">' +
        '<div class="ev-right">' +
          '<div class="event-text">难得的摸鱼时光。要休息一下，还是研究一下牌技？</div>' +
          '<button class="ev-opt primary" onclick="Game.restHeal()">泡杯茶（回复 ' + amt + ' 点精力）</button>' +
          '<button class="ev-opt yellow" onclick="Game.restUpgradeMode()">研究攻略（升级 1 张牌）</button>' +
        '</div>' +
      '</div>' +
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
      '<img class="over-img" src="assets/v2/ui/' + (win ? 'over_win' : 'over_lose') + '.jpg">' +
      '<div class="summary">角色：' + D.characters[run.charId].name +
      '<br>到达：第 ' + run.act + ' 层 · 通关层数：' + run.floorsCleared +
      '<br>剩余金币：' + run.gold + ' · 牌组：' + run.deck.length + ' 张 · 圣物：' + run.relics.length + ' 件</div>' +
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
        // 未见过的牌显示獭罗牌卡背（闲置素材归位）
        return '<div class="card unseen-card"><img src="assets/cardart/tarot_4.png" alt=""></div>';
      }).join('');
    } else if (tab === 'relics') {
      body = Object.keys(D.relics).map(function (rid) {
        var r = D.relics[rid], s = seen.relics[rid];
        return '<div class="codex-item' + (s ? '' : ' unseen') + '">' +
          '<img src="' + relicArt(rid) + '">' +
          '<div class="nm">' + (s ? r.name : '？？？') + '</div>' +
          '<div>' + (s ? r.desc : '尚未见过') + '</div></div>';
      }).join('');
    } else {
      body = Object.keys(D.enemies).map(function (eid) {
        var e = D.enemies[eid], s = seen.enemies[eid];
        return '<div class="codex-item' + (s ? '' : ' unseen') + '">' +
          '<img src="' + enemyArt(eid) + '">' +
          '<div class="nm">' + (s ? e.name : '？？？') + '</div>' +
          '<div>' + (s ? ('精力 ' + e.hp + (e.boss ? ' · BOSS' : e.elite ? ' · 精英' : '')) : '尚未见过') + '</div></div>';
      }).join('');
    }
    var back = S.run && !S.run.over && S.screenBeforeCodex
      ? '<button onclick="Game.closeCodex()">返回游戏</button>'
      : '<button onclick="Game.toTitle()">返回</button>';
    return '<div class="screen dark-page" id="screen-codex">' +
      '<div class="center-wrap"><div class="panel">' +
      '<h2>📖 摸鱼图鉴</h2>' +
      '<div class="codex-tabs">' +
      '<button class="' + (tab === 'cards' ? 'primary' : '') + '" onclick="Game.codexTab(\'cards\')">卡牌</button>' +
      '<button class="' + (tab === 'relics' ? 'primary' : '') + '" onclick="Game.codexTab(\'relics\')">圣物</button>' +
      '<button class="' + (tab === 'enemies' ? 'primary' : '') + '" onclick="Game.codexTab(\'enemies\')">敌人</button>' +
      '</div>' +
      '<div class="codex-body">' + body + '</div>' +
      '<div class="codex-tip">⭐ 小贴士：合理搭配卡牌，才能在职场中立于不败之地！</div>' + back +
      '</div></div></div>';
  }

  /* ---------- 牌组/牌堆/弃牌查看弹层 ---------- */
  function deckViewHtml(S) {
    var body = '';
    if (S.deckView === 'deck') {
      var byType = { attack: [], skill: [], power: [] };
      S.run.deck.forEach(function (inst) { byType[Engine.cardDef(inst).type].push(inst); });
      body = '<h2>当前牌组（' + S.run.deck.length + ' 张）</h2>';
      ['attack', 'skill', 'power'].forEach(function (t) {
        if (!byType[t].length) return;
        body += '<div class="dv-group"><h3>' + TYPE_META[t].name + ' × ' + byType[t].length + '</h3>' +
          '<div class="deck-select">' + byType[t].map(function (i) { return cardHtml(i); }).join('') + '</div></div>';
      });
    } else {
      var isDraw = S.deckView === 'draw';
      var pile = (S.run.combat ? (isDraw ? S.run.combat.drawPile : S.run.combat.discard) : []) || [];
      body = '<h2>' + (isDraw ? '抽牌堆（' + pile.length + ' 张，顺序已打乱）' : '弃牌堆（' + pile.length + ' 张）') + '</h2>';
      var list = pile.slice();
      if (isDraw) {
        // 显示前做确定性乱序，避免剧透抽牌顺序
        list.sort(function (a, b) { return ((a.uid * 9301 + 49297) % 233) - ((b.uid * 9301 + 49297) % 233); });
      }
      body += '<div class="deck-select">' +
        (list.length ? list.map(function (i) { return cardHtml(i); }).join('') : '<div class="event-text">空空如也</div>') +
        '</div>';
    }
    return '<div class="dv-backdrop" onclick="Game.closeDeck()">' +
      '<div class="dv-panel" onclick="event.stopPropagation()">' + body +
      '<button onclick="Game.closeDeck()">关闭</button></div></div>';
  }

  /* ---------- 圣物装备弹层（最多同时装备 4 件，只有装备的生效） ---------- */
  function relicViewHtml(S) {
    var run = S.run;
    var equipped = run.equippedRelics || [];
    var inCombat = S.screen === 'combat';
    function row(rid, isEq) {
      var r = D.relics[rid];
      return '<div class="relic-row' + (isEq ? ' equipped' : '') + '"' +
        (inCombat ? '' : ' onclick="Game.toggleRelic(\'' + rid + '\')"') + '>' +
        '<div class="relic-icon big"><img src="' + relicArt(rid) + '" alt=""></div>' +
        '<div class="relic-info"><b>' + r.name + '</b><span>' + r.desc + '</span></div>' +
        '<div class="relic-state">' + (isEq ? '已装备 ✓' : '背包') + '</div></div>';
    }
    var eqRows = run.relics.filter(function (r) { return equipped.indexOf(r) >= 0; })
      .map(function (r) { return row(r, true); }).join('');
    var bagRows = run.relics.filter(function (r) { return equipped.indexOf(r) < 0; })
      .map(function (r) { return row(r, false); }).join('');
    var body = '<h2>圣物装备（' + equipped.length + '/' + g.GameEngine.MAX_EQUIPPED_RELICS + '）</h2>' +
      (inCombat
        ? '<div class="event-text">战斗中无法调整装备</div>'
        : '<div class="event-text">点击圣物装备 / 卸下，最多同时装备 ' + g.GameEngine.MAX_EQUIPPED_RELICS + ' 件，只有装备的圣物生效。</div>') +
      (run.relics.length ? eqRows + bagRows : '<div class="event-text">还没有圣物，去精英和商店碰碰运气吧</div>');
    return '<div class="dv-backdrop" onclick="Game.closeRelics()">' +
      '<div class="dv-panel" onclick="event.stopPropagation()">' + body +
      '<button onclick="Game.closeRelics()">关闭</button></div></div>';
  }

  /* ---------- 主渲染 ---------- */
  var lastScreen = null;
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
      case 'history': html = renderHistory(S); break;
      case 'save': html = renderSave(S); break;
      default: html = '<div class="screen">未知界面</div>';
    }
    el().innerHTML = html + (S.deckView ? deckViewHtml(S) : '') + (S.relicView ? relicViewHtml(S) : '');
    // 界面切换时统一清理动画临时元素，防止飘字跨屏残留（同屏重绘保留进行中的动画）
    if (S.screen !== lastScreen) {
      var fx = document.getElementById('fx');
      if (fx) fx.innerHTML = '';
      lastScreen = S.screen;
    }
    // 通关结算：循环礼花；其他界面停止
    if (S.screen === 'over' && S.run && S.run.victory) startCelebrate();
    else stopCelebrate();
  }

  /* ---------- 打击感 FX 系统 ---------- */
  // 飘字：层叠时自动错位避免重叠
  var floatStreak = 0, floatLast = 0;
  function spawnFloatText(x, y, text, cls) {
    var fx = document.getElementById('fx');
    if (!fx) return;
    var now = Date.now();
    floatStreak = (now - floatLast < 450) ? floatStreak + 1 : 0;
    floatLast = now;
    var d = document.createElement('div');
    d.className = 'floater ' + (cls || 'dmg');
    d.textContent = text;
    d.style.left = (x - 20 + (Math.random() * 30 - 15)) + 'px';
    d.style.top = (y - floatStreak * 18) + 'px';
    fx.appendChild(d);
    setTimeout(function () { d.remove(); }, 1100);
  }

  function targetPos(targetId) {
    var t = document.getElementById(targetId);
    if (!t) return null;
    var r = t.getBoundingClientRect();
    // 取目标头顶上方空白区，避免数字与立绘图案撞色
    return { x: r.left + r.width / 2, y: r.top - 6, rect: r };
  }

  function floater(targetId, text, cls) {
    var p = targetPos(targetId);
    if (p) spawnFloatText(p.x, p.y, text, cls);
  }

  // 卡牌克隆体从 fromRect 飞向目标元素（出发时放大 1.3 倍），到达后回调
  function cardFly(fromRect, targetId, duration, onArrive) {
    var fx = document.getElementById('fx');
    var t = document.getElementById(targetId);
    if (!fx || !t) { if (onArrive) onArrive(); return; }
    var tr = t.getBoundingClientRect();
    var c = document.createElement('div');
    c.className = 'fx-fly';
    c.style.left = fromRect.left + 'px';
    c.style.top = fromRect.top + 'px';
    c.style.width = fromRect.width + 'px';
    c.style.height = fromRect.height + 'px';
    c.style.transform = 'scale(1.3)';
    fx.appendChild(c);
    // 强制 reflow 后启动 transition
    void c.offsetWidth;
    c.style.transform = 'translate(' + (tr.left + tr.width / 2 - fromRect.left - fromRect.width / 2) + 'px,' +
      (tr.top + tr.height / 2 - fromRect.top - fromRect.height / 2) + 'px) scale(.35)';
    c.style.opacity = '0.9';
    setTimeout(function () {
      c.remove();
      if (onArrive) onArrive();
    }, duration || 260);
  }

  // 命中星环闪光（纯 CSS）
  function impactFlash(targetId) {
    var fx = document.getElementById('fx');
    var t = document.getElementById(targetId);
    if (!fx || !t) return;
    var r = t.getBoundingClientRect();
    var d = document.createElement('div');
    d.className = 'fx-impact';
    d.style.left = (r.left + r.width / 2) + 'px';
    d.style.top = (r.top + r.height / 2) + 'px';
    fx.appendChild(d);
    setTimeout(function () { d.remove(); }, 420);
  }

  // 攻击命中小幅全屏震屏
  function miniShake() {
    var app = document.getElementById('app');
    if (!app) return;
    app.classList.remove('minishake');
    void app.offsetWidth;
    app.classList.add('minishake');
    setTimeout(function () { app.classList.remove('minishake'); }, 180);
  }

  // 命中：抖动 + 闪白（单次短脉冲）
  function hitFlash(targetId) {
    var t = document.getElementById(targetId);
    if (!t) return;
    t.classList.remove('hurt', 'flashwhite');
    void t.offsetWidth;
    t.classList.add('hurt', 'flashwhite');
    setTimeout(function () { t.classList.remove('hurt', 'flashwhite'); }, 420);
  }

  // 敌人前冲
  function lunge(targetId) {
    var t = document.getElementById(targetId);
    if (!t) return;
    t.classList.remove('lunge');
    void t.offsetWidth;
    t.classList.add('lunge');
    setTimeout(function () { t.classList.remove('lunge'); }, 380);
  }

  // 屏幕边缘红闪（玩家受创，红屏边框图）
  function edgeFlash() {
    var fx = document.getElementById('fx');
    if (!fx) return;
    var d = document.createElement('img');
    d.className = 'fx-edge';
    d.src = FX_DIR + 'rededge.png';
    fx.appendChild(d);
    setTimeout(function () { d.remove(); }, 500);
  }

  // 全屏震动
  function appShake() {
    var app = document.getElementById('app');
    if (!app) return;
    app.classList.remove('appshake');
    void app.offsetWidth;
    app.classList.add('appshake');
    setTimeout(function () { app.classList.remove('appshake'); }, 450);
  }

  /* ---------- 特效序列帧（v2/fx） ---------- */
  var FX_DIR = 'assets/v2/fx/';
  var FX_SEQS = { hit: 4, crit: 5, combo: 3, death: 4, block: 2, heal: 3, rare: 4, celebrate: 3 };
  function frameList(seq) {
    var list = [];
    for (var i = 1; i <= FX_SEQS[seq]; i++) {
      if (seq === 'block' && i === 2) continue; // block_02 弃用（素材有乱入小人）
      list.push(FX_DIR + seq + '_' + i + '.png');
    }
    return list;
  }
  function preloadFx() {
    function load(src, retry) {
      var im = new Image();
      im.onerror = function () { if (!retry) load(src + (src.indexOf('?') < 0 ? '?r=1' : ''), true); };
      im.src = src;
    }
    for (var k in FX_SEQS) frameList(k).forEach(function (s) { load(s); });
    ['shockwave.png', 'rededge.png', 'bosscut_noword.jpg'].forEach(function (f) {
      load(FX_DIR + f);
    });
  }

  // 通用序列帧播放器：在指定坐标播完后自动移除
  function playFxAt(x, y, seq, opts) {
    opts = opts || {};
    var fx = document.getElementById('fx');
    if (!fx) return;
    var frames = frameList(seq);
    if (!frames.length) return;
    var size = opts.size || 260;
    var d = document.createElement('img');
    d.className = 'fx-seq';
    d.onerror = function () { clearInterval(timer); d.remove(); }; // 坏帧容错
    d.style.width = size + 'px';
    d.style.left = (x - size / 2) + 'px';
    d.style.top = (y - size / 2) + 'px';
    d.src = frames[0];
    fx.appendChild(d);
    var fps = opts.fps || 13, loops = opts.loops || 1;
    var total = frames.length * loops, idx = 0;
    var timer = setInterval(function () {
      idx++;
      if (idx >= total) {
        clearInterval(timer); d.remove();
        if (opts.onDone) opts.onDone();
        return;
      }
      d.src = frames[idx % frames.length];
    }, 1000 / fps);
  }
  function playFxFrames(targetId, seq, opts) {
    var p = targetPos(targetId);
    if (!p) return;
    playFxAt(p.x, p.rect.top + p.rect.height / 2, seq, opts);
  }

  // 冲击波环（命中震屏中心扩散）
  function shockRing(targetId) {
    var fx = document.getElementById('fx');
    var t = document.getElementById(targetId);
    if (!fx || !t) return;
    var r = t.getBoundingClientRect();
    var d = document.createElement('img');
    d.className = 'fx-shock';
    d.src = FX_DIR + 'shockwave.png';
    d.style.left = (r.left + r.width / 2 - 90) + 'px';
    d.style.top = (r.top + r.height / 2 - 90) + 'px';
    fx.appendChild(d);
    setTimeout(function () { d.remove(); }, 450);
  }

  // 通关礼花（结算界面循环，切屏自动停止）
  var celebrateTimer = null;
  function startCelebrate() {
    stopCelebrate();
    var fx = document.getElementById('fx');
    if (!fx) return;
    var d = document.createElement('img');
    d.className = 'fx-celebrate';
    var frames = frameList('celebrate');
    d.src = frames[0];
    fx.appendChild(d);
    var idx = 0;
    celebrateTimer = setInterval(function () {
      idx = (idx + 1) % frames.length;
      d.src = frames[idx];
    }, 180);
  }
  function stopCelebrate() {
    if (celebrateTimer) { clearInterval(celebrateTimer); celebrateTimer = null; }
    var old = document.querySelector('.fx-celebrate');
    if (old) old.remove();
  }

  // BOSS 阶段过场全屏图
  function bossCut() {
    var fx = document.getElementById('fx');
    if (!fx) return;
    var d = document.createElement('img');
    d.className = 'fx-bosscut';
    d.src = FX_DIR + 'bosscut_noword.jpg';
    fx.appendChild(d);
    setTimeout(function () { d.remove(); }, 900);
  }

  // 阶段名大字弹出
  function bigText(text) {
    var fx = document.getElementById('fx');
    if (!fx) return;
    var d = document.createElement('div');
    d.className = 'fx-big';
    d.textContent = text;
    fx.appendChild(d);
    setTimeout(function () { d.remove(); }, 1600);
  }

  // 敌人死亡消散
  function deathAnim(targetId) {
    var t = document.getElementById(targetId);
    if (t) t.classList.add('dying');
  }

  // 稀有牌金边闪光（直接作用于手牌元素）
  function goldFlash(el) {
    if (!el) return;
    el.classList.add('goldflash');
    setTimeout(function () { el.classList.remove('goldflash'); }, 700);
  }

  // 旧接口保留（受击抖动）
  function shake(targetId) { hitFlash(targetId); }

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

  g.GameUI = {
    render: render, floater: floater, shake: shake, toast: toast,
    spawnFloatText: spawnFloatText, targetPos: targetPos, cardFly: cardFly,
    hitFlash: hitFlash, lunge: lunge, edgeFlash: edgeFlash, appShake: appShake,
    bigText: bigText, deathAnim: deathAnim, goldFlash: goldFlash,
    impactFlash: impactFlash, miniShake: miniShake,
    preloadFx: preloadFx, playFxAt: playFxAt, playFxFrames: playFxFrames,
    shockRing: shockRing, bossCut: bossCut
  };
})(typeof window !== 'undefined' ? window : globalThis);
