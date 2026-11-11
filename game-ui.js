/* =========================================================
   羊了个羊 · 界面与交互
   依赖 game-core.js（window.SheepCore）
   ========================================================= */
(function () {
  'use strict';

  const Core = window.SheepCore;
  if (!Core) {
    document.body.innerHTML = '<div class="noscript">游戏核心未能加载，请刷新页面再试。</div>';
    return;
  }

  const SAVE_KEY = 'sheep-a-sheep-save-v3';
  const MAX_LEVEL = Core.LEVELS.length;
  const TOTAL_LEVELS = Core.LEVELS.length;
  const boardWidth = Core.BOARD_WIDTH;

  const refs = {};
  const state = {
    session: null,
    levelId: 1,
    playing: false,
    overlayMode: null,
    justAddedId: null,
    soundOn: true,
    save: null,
    resultTimer: null,
    boardAnimTimer: null,
    toastTimer: null,
    lastBlockedToast: 0,
    focusBeforeOverlay: null,
    isFirstOpen: true
  };

  const timer = {
    elapsed: 0,
    startedAt: null,
    intervalId: null
  };

  const blockMessages = [
    '这张牌被上面的牌压着呢',
    '先清掉上面那层，再拿这张',
    '它还在牌堆下面，别急',
    '从最上面一层开始拿吧'
  ];

  let audioCtx = null;

  const toolLabels = {
    undo: '撤回上一步',
    move: '移出三张牌',
    shuffle: '重新洗牌'
  };

  /* ------------------------------------------------------------------ */
  /* 存档                                                                */
  /* ------------------------------------------------------------------ */
  function getDefaultSave() {
    return {
      version: 1,
      sound: true,
      lastLevel: 1,
      best: {}
    };
  }

  function loadSave() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return getDefaultSave();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return getDefaultSave();
      return {
        version: 1,
        sound: typeof parsed.sound === 'boolean' ? parsed.sound : true,
        lastLevel: clamp(Number(parsed.lastLevel) || 1, 1, MAX_LEVEL),
        best: parsed.best && typeof parsed.best === 'object' ? parsed.best : {}
      };
    } catch (error) {
      return getDefaultSave();
    }
  }

  function persistSave() {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(state.save));
    } catch (error) {
      // 本地文件直接打开时，某些浏览器会禁用 localStorage；不影响游戏。
    }
  }

  /* ------------------------------------------------------------------ */
  /* 工具函数                                                            */
  /* ------------------------------------------------------------------ */
  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function formatTime(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const restMinutes = minutes % 60;
      return `${String(hours).padStart(2, '0')}:${String(restMinutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function timerNow() {
    return performance.now();
  }

  function getElapsedMs() {
    if (timer.startedAt === null) return timer.elapsed;
    return timer.elapsed + (timerNow() - timer.startedAt);
  }

  function resetTimer() {
    pauseTimer();
    timer.elapsed = 0;
    renderTimer();
  }

  function startTimer() {
    if (timer.startedAt !== null) return;
    timer.startedAt = timerNow();
    if (timer.intervalId === null) {
      timer.intervalId = window.setInterval(renderTimer, 500);
    }
    renderTimer();
  }

  function pauseTimer() {
    if (timer.startedAt !== null) {
      timer.elapsed += timerNow() - timer.startedAt;
      timer.startedAt = null;
    }
    if (timer.intervalId !== null) {
      window.clearInterval(timer.intervalId);
      timer.intervalId = null;
    }
    renderTimer();
  }

  function renderTimer() {
    if (!refs.timerText) return;
    refs.timerText.textContent = formatTime(getElapsedMs());
  }

  function setSoundUI() {
    if (!refs.soundBtn) return;
    document.body.classList.toggle('sound-off', !state.soundOn);
    refs.soundBtn.setAttribute('aria-pressed', String(state.soundOn));
    refs.soundBtn.setAttribute('aria-label', state.soundOn ? '关闭音效' : '开启音效');
    refs.soundBtn.title = state.soundOn ? '关闭音效' : '开启音效';
  }

  function announce(message) {
    if (!refs.srStatus) return;
    refs.srStatus.textContent = '';
    window.setTimeout(() => {
      refs.srStatus.textContent = message;
    }, 30);
  }

  /* ------------------------------------------------------------------ */
  /* 音效                                                                */
  /* ------------------------------------------------------------------ */
  function getAudioContext() {
    if (!state.soundOn) return null;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    try {
      if (!audioCtx) audioCtx = new AudioContextClass();
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
      return audioCtx;
    } catch (error) {
      return null;
    }
  }

  function tone(frequency, duration, options) {
    const ctx = getAudioContext();
    if (!ctx) return;
    const opts = options || {};
    const startAt = ctx.currentTime + (opts.delay || 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(frequency, startAt);
    if (opts.slideTo) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, opts.slideTo), startAt + duration);
    }
    const volume = typeof opts.volume === 'number' ? opts.volume : 0.035;
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.linearRampToValueAtTime(volume, startAt + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startAt);
    osc.stop(startAt + duration + 0.03);
  }

  function sfx(name) {
    if (!state.soundOn) return;
    switch (name) {
      case 'tap':
        tone(392, 0.07, { type: 'triangle', volume: 0.028 });
        tone(587, 0.06, { type: 'sine', volume: 0.016, delay: 0.025 });
        break;
      case 'blocked':
        tone(148, 0.09, { type: 'square', volume: 0.018, slideTo: 105 });
        break;
      case 'match':
        tone(523.25, 0.15, { type: 'triangle', volume: 0.033 });
        tone(659.25, 0.16, { type: 'triangle', volume: 0.031, delay: 0.07 });
        tone(783.99, 0.22, { type: 'triangle', volume: 0.028, delay: 0.14 });
        tone(1046.5, 0.18, { type: 'sine', volume: 0.018, delay: 0.2 });
        break;
      case 'undo':
        tone(440, 0.11, { type: 'sine', volume: 0.025, slideTo: 294 });
        break;
      case 'shuffle':
        tone(330, 0.08, { type: 'triangle', volume: 0.02 });
        tone(440, 0.08, { type: 'triangle', volume: 0.022, delay: 0.06 });
        tone(554, 0.09, { type: 'triangle', volume: 0.023, delay: 0.12 });
        tone(659, 0.12, { type: 'sine', volume: 0.022, delay: 0.18 });
        break;
      case 'tool':
        tone(440, 0.09, { type: 'triangle', volume: 0.026 });
        tone(660, 0.12, { type: 'sine', volume: 0.02, delay: 0.055 });
        break;
      case 'start':
        tone(392, 0.14, { type: 'triangle', volume: 0.028 });
        tone(523.25, 0.15, { type: 'triangle', volume: 0.03, delay: 0.08 });
        tone(659.25, 0.26, { type: 'triangle', volume: 0.028, delay: 0.16 });
        break;
      case 'pause':
        tone(392, 0.1, { type: 'sine', volume: 0.02, slideTo: 330 });
        break;
      case 'win': {
        const melody = [523.25, 659.25, 783.99, 1046.5, 1318.5];
        melody.forEach((frequency, index) => {
          tone(frequency, 0.3, {
            type: 'triangle',
            volume: index === melody.length - 1 ? 0.026 : 0.032,
            delay: index * 0.105
          });
        });
        tone(1046.5, 0.55, { type: 'sine', volume: 0.018, delay: 0.56 });
        break;
      }
      case 'lose':
        tone(311, 0.18, { type: 'triangle', volume: 0.028 });
        tone(247, 0.2, { type: 'triangle', volume: 0.026, delay: 0.13 });
        tone(196, 0.3, { type: 'sine', volume: 0.023, delay: 0.27 });
        break;
      case 'click':
        tone(523, 0.05, { type: 'sine', volume: 0.018 });
        break;
      default:
        break;
    }
  }

  /* ------------------------------------------------------------------ */
  /* 初始渲染                                                            */
  /* ------------------------------------------------------------------ */
  function init() {
    cacheRefs();
    state.save = loadSave();
    state.soundOn = state.save.sound !== false;
    state.levelId = clamp(Number(state.save.lastLevel) || 1, 1, MAX_LEVEL);
    setSoundUI();

    bindEvents();

    prepareLevel(state.levelId, {
      entrance: true,
      keepOverlay: true,
      preview: true
    });

    openStartOverlay();
    updateBoardScale();
  }

  function cacheRefs() {
    refs.page = document.querySelector('.page');
    refs.board = document.getElementById('board');
    refs.tray = document.getElementById('tray');
    refs.trayPanel = document.getElementById('trayPanel');
    refs.benchWrap = document.getElementById('benchWrap');
    refs.bench = document.getElementById('bench');
    refs.slotCount = document.getElementById('slotCount');
    refs.levelNumber = document.getElementById('levelNumber');
    refs.levelName = document.getElementById('levelName');
    refs.footerLevel = document.getElementById('footerLevel');
    refs.remainingCount = document.getElementById('remainingCount');
    refs.timerText = document.getElementById('timerText');
    refs.soundBtn = document.getElementById('soundBtn');
    refs.pauseBtn = document.getElementById('pauseBtn');
    refs.overlay = document.getElementById('overlay');
    refs.modal = document.getElementById('modal');
    refs.confettiLayer = document.getElementById('confettiLayer');
    refs.toast = document.getElementById('toast');
    refs.fxLayer = document.getElementById('fxLayer');
    refs.srStatus = document.getElementById('srStatus');
    refs.gameCard = document.getElementById('gameCard');
    refs.toolButtons = Array.from(document.querySelectorAll('[data-tool]'));
    refs.trayHint = document.querySelector('.tray-panel__hint');
    refs.themeMeta = document.querySelector('meta[name="theme-color"]');
  }

  function freshVariant() {
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      const buffer = new Uint32Array(1);
      window.crypto.getRandomValues(buffer);
      return buffer[0] >>> 0;
    }
    return (Math.floor(Math.random() * 0xFFFFFFFF) >>> 0);
  }

  function prepareLevel(levelId, options) {
    const opts = Object.assign({ entrance: false, keepOverlay: true, preview: false }, options || {});
    const level = Core.getLevel(levelId);
    const hasVariant = Object.prototype.hasOwnProperty.call(opts, 'variant') && Number.isFinite(Number(opts.variant));
    const variant = hasVariant ? (Number(opts.variant) >>> 0) : freshVariant();
    state.levelId = level.id;
    state.session = new Core.GameSession(level.id, { variant });
    state.justAddedId = null;
    state.playing = false;
    window.clearTimeout(state.resultTimer);
    state.resultTimer = null;
    pauseTimer();
    resetTimer();

    document.body.dataset.theme = 'meadow';
    document.title = `第 ${level.id} 关 · ${level.name} · 羊了个羊`;
    if (refs.themeMeta) {
      refs.themeMeta.setAttribute('content', '#dff3c7');
    }

    refs.levelNumber.textContent = String(level.id);
    refs.levelName.textContent = level.name;
    refs.footerLevel.textContent = String(level.id);
    refs.remainingCount.textContent = String(state.session.remainingCount());
    refs.gameCard.dataset.level = String(level.id);
    refs.gameCard.dataset.variant = String(variant);

    rebuildBoard({ entrance: opts.entrance });
    renderTray();
    updateTools();

    if (!opts.preview) {
      state.save.lastLevel = level.id;
      persistSave();
    }
  }

  function updateBoardScale() {
    if (!refs.board) return;
    const width = refs.board.clientWidth;
    if (width > 0) {
      refs.board.style.setProperty('--tile-size', `${width / boardWidth}px`);
    }
  }

  function rebuildBoard(options) {
    const opts = Object.assign({ entrance: false, shuffle: false }, options || {});
    window.clearTimeout(state.boardAnimTimer);
    refs.board.innerHTML = '';
    refs.board.classList.remove('is-dealing', 'is-shuffle-in', 'is-cleared');

    const tiles = state.session.tiles
      .filter((tile) => tile.status === 'board')
      .sort((a, b) => (a.layer - b.layer) || (a.index - b.index));

    const fragment = document.createDocumentFragment();
    tiles.forEach((tile, index) => {
      fragment.appendChild(createTileElement(tile, index));
    });
    refs.board.appendChild(fragment);

    if (opts.entrance) {
      refs.board.classList.add('is-dealing');
      state.boardAnimTimer = window.setTimeout(() => {
        refs.board.classList.remove('is-dealing');
      }, 1000);
    } else if (opts.shuffle) {
      refs.board.classList.add('is-shuffle-in');
      state.boardAnimTimer = window.setTimeout(() => {
        refs.board.classList.remove('is-shuffle-in');
      }, 760);
    }

    window.requestAnimationFrame(updateBoardScale);
  }

  function createTileElement(tile, index) {
    const type = Core.TILE_TYPES[tile.type];
    const button = document.createElement('button');
    button.type = 'button';
    const hiddenSideCard = !!tile.sideStack && tile.blocked;
    button.className = `tile ${tile.blocked ? 'is-blocked' : 'is-open'}${hiddenSideCard ? ' is-stack-hidden' : ''}`;
    button.dataset.id = tile.id;
    button.style.left = `${(tile.x / Core.BOARD_WIDTH) * 100}%`;
    button.style.top = `${(tile.y / Core.BOARD_HEIGHT) * 100}%`;
    if (tile.pileId !== null && tile.stackDepth !== null) {
      const pileId = typeof tile.pileId === 'number' ? tile.pileId : 0;
      button.style.zIndex = String((12 - tile.stackDepth) * 100 + pileId * 2 + (tile.index % 2));
    } else {
      button.style.zIndex = String((tile.layer + 1) * 1000 + (tile.index % 100));
    }
    button.style.setProperty('--angle', `${tile.angle || 0}deg`);
    button.style.setProperty('--tint', type.tint);
    button.style.setProperty('--rim', type.rim);
    button.style.setProperty('--depth', String(tile.layer));
    const layerCount = state.session.level.mound ? state.session.level.mound.layers.length : 1;
    const depthFromTop = Math.min(4, Math.max(0, layerCount - 1 - tile.layer));
    button.style.setProperty('--layer-veil', tile.sideStack ? '0' : (depthFromTop * 0.018).toFixed(3));
    button.style.setProperty('--enter-delay', `${Math.min(560, tile.layer * 34 + (index % 12) * 7)}ms`);
    button.tabIndex = tile.blocked ? -1 : 0;
    const label = hiddenSideCard
      ? '侧边叠着的一沓暗牌，暂时不能拿'
      : tile.blocked
        ? `${type.name}，被上面的牌压着，暂时不能拿`
        : `${type.name}，可以拿取`;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-disabled', tile.blocked ? 'true' : 'false');
    button.title = hiddenSideCard ? '侧边暗牌' : type.name;

    button.innerHTML = `
      <span class="tile__card">
        <span class="tile__icon" aria-hidden="true">${type.icon}</span>
        <span class="tile__shine" aria-hidden="true"></span>
        <span class="tile__veil" aria-hidden="true"></span>
      </span>
    `;
    return button;
  }

  function syncBoardDom(skipElement) {
    const session = state.session;
    if (!session) return;
    const nodes = refs.board.querySelectorAll('.tile');
    nodes.forEach((node) => {
      if (skipElement && node === skipElement) return;
      const tile = session.getTile(node.dataset.id);
      if (!tile || tile.status !== 'board') {
        if (!node.classList.contains('is-taken')) {
          node.classList.add('is-taken');
          window.setTimeout(() => node.remove(), 260);
        }
        return;
      }
      const open = !tile.blocked;
      const wasOpen = node.classList.contains('is-open');
      const hiddenSideCard = !!tile.sideStack && !open;
      node.classList.toggle('is-open', open);
      node.classList.toggle('is-blocked', !open);
      node.classList.toggle('is-stack-hidden', hiddenSideCard);
      node.tabIndex = open ? 0 : -1;
      node.setAttribute('aria-disabled', open ? 'false' : 'true');
      node.setAttribute('aria-label', hiddenSideCard
        ? '侧边叠着的一沓暗牌，暂时不能拿'
        : open
          ? `${Core.TILE_TYPES[tile.type].name}，可以拿取`
          : `${Core.TILE_TYPES[tile.type].name}，被上面的牌压着，暂时不能拿`);
      node.title = hiddenSideCard ? '侧边暗牌' : Core.TILE_TYPES[tile.type].name;
      if (open && !wasOpen) {
        node.classList.remove('is-revealed');
        void node.offsetWidth;
        node.classList.add('is-revealed');
        window.setTimeout(() => node.classList.remove('is-revealed'), 720);
      }
    });
  }

  function renderTray() {
    const session = state.session;
    if (!session) return;
    const tray = session.tray;
    const fragment = document.createDocumentFragment();
    const justAdded = state.justAddedId;

    for (let index = 0; index < session.traySize; index += 1) {
      const slot = document.createElement('div');
      slot.className = 'slot';
      const id = tray[index];
      if (id) {
        const tile = session.getTile(id);
        const type = Core.TILE_TYPES[tile.type];
        slot.classList.add('is-filled');
        slot.setAttribute('role', 'img');
        slot.setAttribute('aria-label', `第 ${index + 1} 格：${type.name}`);
        if (id === justAdded) slot.classList.add('is-new');
        slot.innerHTML = `
          <span class="slot__tile" style="--tint:${type.tint};--rim:${type.rim}">
            <span class="slot__icon" aria-hidden="true">${type.icon}</span>
          </span>
        `;
      } else {
        slot.setAttribute('aria-hidden', 'true');
      }
      fragment.appendChild(slot);
    }
    refs.tray.innerHTML = '';
    refs.tray.appendChild(fragment);
    refs.tray.setAttribute('aria-label', tray.length ? `卡槽内有 ${tray.length} 张牌` : '卡槽内没有牌');
    refs.slotCount.innerHTML = `<b>${tray.length}</b><i>/ ${session.traySize}</i>`;

    refs.trayPanel.classList.toggle('is-danger', tray.length >= 6 && session.state === 'playing');
    refs.trayPanel.classList.toggle('is-full', tray.length >= session.traySize);
    if (refs.trayHint) {
      refs.trayHint.textContent = tray.length >= 6 ? '再放一张就满啦！' : '凑齐三张就消除';
    }

    state.justAddedId = null;
    renderBench();
  }

  function renderBench() {
    const session = state.session;
    const bench = session.bench;
    if (!bench.length) {
      refs.benchWrap.hidden = true;
      refs.bench.innerHTML = '';
      return;
    }

    refs.benchWrap.hidden = false;
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < session.benchSize; index += 1) {
      const id = bench[index];
      if (!id) {
        const empty = document.createElement('span');
        empty.className = 'bench-slot';
        empty.setAttribute('aria-hidden', 'true');
        fragment.appendChild(empty);
        continue;
      }
      const tile = session.getTile(id);
      const type = Core.TILE_TYPES[tile.type];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'bench-slot is-filled';
      button.dataset.benchId = id;
      button.setAttribute('aria-label', `${type.name}，点击放回卡槽`);
      button.style.setProperty('--tint', type.tint);
      button.style.setProperty('--rim', type.rim);
      button.innerHTML = `
        <span class="slot__tile">
          <span class="slot__icon" aria-hidden="true">${type.icon}</span>
        </span>
      `;
      fragment.appendChild(button);
    }
    refs.bench.innerHTML = '';
    refs.bench.appendChild(fragment);
  }

  function updateTools() {
    const session = state.session;
    if (!session) return;
    const active = isInteractive();
    const toolState = session.getToolState();

    refs.toolButtons.forEach((button) => {
      const tool = button.dataset.tool;
      const remaining = session.tools[tool];
      const countEl = button.querySelector(`[data-count="${tool}"]`);
      if (countEl) countEl.textContent = String(remaining);

      let disabled = !active || remaining <= 0;
      if (tool === 'undo') disabled = disabled || !toolState.canUndo;
      if (tool === 'move') disabled = disabled || !toolState.canMove || session.tray.length < 3;
      if (tool === 'shuffle') disabled = disabled || !toolState.canShuffle;
      button.disabled = disabled;

      const suffix = remaining > 0 ? `，剩余 ${remaining} 次` : '，次数已用完';
      button.setAttribute('aria-label', `${toolLabels[tool]}${suffix}`);
      button.title = `${toolLabels[tool]}${suffix}`;
    });
  }

  function updateLevelInfo() {
    if (!state.session) return;
    refs.remainingCount.textContent = String(state.session.remainingCount());
  }

  function isInteractive() {
    return !!state.session
      && state.playing
      && refs.overlay.hidden
      && state.session.state === 'playing';
  }

  /* ------------------------------------------------------------------ */
  /* 事件绑定                                                            */
  /* ------------------------------------------------------------------ */
  function bindEvents() {
    refs.soundBtn.addEventListener('click', toggleSound);
    refs.pauseBtn.addEventListener('click', () => {
      if (isInteractive()) openPauseOverlay();
    });
    refs.board.addEventListener('click', onBoardClick);
    refs.bench.addEventListener('click', onBenchClick);

    refs.toolButtons.forEach((button) => {
      button.addEventListener('click', () => useTool(button.dataset.tool));
    });

    refs.modal.addEventListener('click', onModalAction);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('resize', updateBoardScale, { passive: true });

    if (window.ResizeObserver) {
      const observer = new ResizeObserver(() => updateBoardScale());
      observer.observe(refs.board);
    }
  }

  function toggleSound() {
    state.soundOn = !state.soundOn;
    state.save.sound = state.soundOn;
    persistSave();
    setSoundUI();
    if (state.soundOn) {
      getAudioContext();
      sfx('click');
      showToast('音效已开启');
    } else {
      showToast('音效已关闭');
    }
  }

  function onBoardClick(event) {
    const button = event.target.closest('.tile');
    if (!button) return;
    handleTileClick(button);
  }

  function handleTileClick(button) {
    if (!isInteractive()) return;
    const tile = state.session.getTile(button.dataset.id);
    if (!tile) return;
    const result = state.session.clickTile(button.dataset.id);

    if (!result.ok) {
      if (result.reason === 'blocked') {
        button.classList.remove('is-nope');
        void button.offsetWidth;
        button.classList.add('is-nope');
        window.setTimeout(() => button.classList.remove('is-nope'), 380);
        if (sfx) sfx('blocked');
        maybeShowBlockedToast();
      }
      return;
    }

    const type = Core.TILE_TYPES[result.tile.type];
    button.classList.add('is-taken');
    button.setAttribute('tabindex', '-1');
    button.setAttribute('aria-hidden', 'true');
    window.setTimeout(() => button.remove(), 260);

    const buttonRect = button.getBoundingClientRect();
    burstAt(buttonRect.left + buttonRect.width / 2, buttonRect.top + buttonRect.height / 2, {
      count: result.matched ? 0 : 3,
      palette: ['#f6d36f', '#dff0b1', '#fff8de'],
      spread: 24,
      sizeRange: [4, 7]
    });

    if (result.matched) {
      state.justAddedId = null;
      handleMatchEffect(type);
      sfx('match');
      announce(`三张${type.name}消除了，还剩 ${state.session.remainingCount()} 张牌`);
    } else {
      state.justAddedId = result.tile.id;
      sfx('tap');
      announce(`${type.name}放进了卡槽，还剩 ${state.session.remainingCount()} 张牌`);
    }

    syncBoardDom(button);
    renderTray();
    updateLevelInfo();
    updateTools();

    if (result.state === 'won') {
      handleWin();
    } else if (result.state === 'lost') {
      handleLose();
    }
  }

  function maybeShowBlockedToast() {
    const now = Date.now();
    if (now - state.lastBlockedToast < 1200) return;
    state.lastBlockedToast = now;
    const message = blockMessages[Math.floor(Math.random() * blockMessages.length)];
    showToast(message, 'warm');
    announce(message);
  }

  function onBenchClick(event) {
    const button = event.target.closest('[data-bench-id]');
    if (!button || !isInteractive()) return;
    const id = button.dataset.benchId;
    const result = state.session.returnBench(id);
    if (!result.ok) {
      if (result.reason === 'full') {
        showToast('卡槽已经满了，先凑三张消掉吧', 'warm');
      }
      return;
    }

    sfx('tap');
    state.justAddedId = null;
    renderTray();
    updateTools();
    updateLevelInfo();

    if (result.matched) {
      const type = Core.TILE_TYPES[result.tile.type];
      handleMatchEffect(type);
      sfx('match');
    }

    if (result.state === 'won') {
      handleWin();
    } else if (result.state === 'lost') {
      handleLose();
    }
  }

  function useTool(tool) {
    if (!isInteractive()) return;
    const session = state.session;
    if (tool === 'undo') {
      const result = session.undo();
      if (!result.ok) {
        if (result.reason === 'no-move') showToast('还没有可以撤回的步骤');
        else if (result.reason === 'no-tool') showToast('撤回次数已经用完了');
        return;
      }
      state.justAddedId = null;
      sfx('undo');
      rebuildBoard({ entrance: false });
      renderTray();
      updateLevelInfo();
      updateTools();
      showToast('已撤回上一步');
      announce('已撤回上一步');
      return;
    }

    if (tool === 'shuffle') {
      const result = session.useShuffle();
      if (!result.ok) {
        if (result.reason === 'no-tool') showToast('洗牌次数已经用完了');
        else if (result.reason === 'too-few') showToast('已经没有可以洗的牌啦');
        return;
      }
      state.justAddedId = null;
      sfx('shuffle');
      rebuildBoard({ entrance: false, shuffle: true });
      renderTray();
      updateTools();
      const rect = refs.board.getBoundingClientRect();
      burstAt(rect.left + rect.width / 2, rect.top + rect.height / 2, {
        count: 14,
        palette: ['#ffe08a', '#f8efd0', '#cbe8a8'],
        spread: 180,
        sizeRange: [4, 9]
      });
      showToast('牧场重新洗牌啦');
      announce('剩余牌面已经重新打乱');
      return;
    }

    if (tool === 'move') {
      if (session.tray.length < 3) {
        showToast('卡槽里至少要放三张牌才能移出');
        return;
      }
      const result = session.useMove();
      if (!result.ok) {
        if (result.reason === 'no-tool') showToast('移出次数已经用完了');
        else if (result.reason === 'empty') showToast('卡槽里还没有牌');
        return;
      }
      state.justAddedId = null;
      sfx('tool');
      renderTray();
      updateTools();
      updateLevelInfo();
      const rect = refs.trayPanel.getBoundingClientRect();
      burstAt(rect.left + rect.width / 2, rect.top + rect.height / 2, {
        count: 8,
        palette: ['#ffe4a0', '#fff7db', '#cbe9b2'],
        spread: 80,
        sizeRange: [4, 8]
      });
      showToast('已把三张牌移到暂存区');
      announce('已移出三张牌到暂存区，点击暂存的牌可以放回卡槽');
    }
  }

  function handleMatchEffect(type) {
    const trayRect = refs.trayPanel.getBoundingClientRect();
    const x = trayRect.left + trayRect.width / 2;
    const y = trayRect.top + trayRect.height * 0.5;
    burstAt(x, y, {
      count: 13,
      palette: ['#ffe38f', '#f6bc54', '#f5f1cf', type.tint],
      spread: 100,
      sizeRange: [5, 10]
    });
    spawnMatchCallout(type.icon, x, y);
    refs.trayPanel.classList.remove('is-match-flash');
    void refs.trayPanel.offsetWidth;
    refs.trayPanel.classList.add('is-match-flash');
    window.setTimeout(() => refs.trayPanel.classList.remove('is-match-flash'), 420);
  }

  /* ------------------------------------------------------------------ */
  /* 结束 / 胜利 / 失败                                                  */
  /* ------------------------------------------------------------------ */
  function handleWin() {
    state.playing = false;
    pauseTimer();
    updateTools();
    window.clearTimeout(state.resultTimer);

    const level = state.session.level;
    const timeMs = getElapsedMs();
    const stars = calculateStars();
    saveBest(level.id, stars, timeMs, state.session.score);

    refs.board.classList.add('is-cleared');
    sfx('win');
    announce('恭喜，牧场清空啦！');

    state.resultTimer = window.setTimeout(() => {
      showResultOverlay('win', { stars, timeMs });
    }, 640);
  }

  function handleLose() {
    state.playing = false;
    pauseTimer();
    updateTools();
    window.clearTimeout(state.resultTimer);
    sfx('lose');
    announce('卡槽满了，本局结束');

    state.resultTimer = window.setTimeout(() => {
      showResultOverlay('lose', {});
    }, 480);
  }

  function calculateStars() {
    const session = state.session;
    let used = 0;
    ['undo', 'move', 'shuffle'].forEach((key) => {
      used += Math.max(0, session.toolsInitial[key] - session.tools[key]);
    });
    if (used === 0) return 3;
    if (used === 1) return 2;
    return 1;
  }

  function saveBest(levelId, stars, timeMs, score) {
    const key = String(levelId);
    const previous = state.save.best[key] && typeof state.save.best[key] === 'object'
      ? state.save.best[key]
      : { stars: 0, time: null, score: 0 };
    const seconds = Math.max(1, Math.round(timeMs / 1000));
    state.save.best[key] = {
      stars: Math.max(Number(previous.stars) || 0, stars),
      time: previous.time == null ? seconds : Math.min(Number(previous.time) || seconds, seconds),
      score: Math.max(Number(previous.score) || 0, score)
    };
    state.save.lastLevel = levelId;
    persistSave();
  }

  function getUsedTools() {
    const session = state.session;
    return ['undo', 'move', 'shuffle'].reduce((total, key) => {
      return total + Math.max(0, session.toolsInitial[key] - session.tools[key]);
    }, 0);
  }

  /* ------------------------------------------------------------------ */
  /* 弹层                                                                */
  /* ------------------------------------------------------------------ */
  function openStartOverlay(options) {
    const opts = options || {};
    state.playing = false;
    state.overlayMode = 'start';
    pauseTimer();
    updateTools();

    const level = state.session.level;
    const cards = Core.LEVELS.map((item) => {
      const best = state.save.best[String(item.id)] || null;
      const stars = best && Number(best.stars) ? Number(best.stars) : 0;
      const cardCount = item.cardCount
        || (item.mound
          ? item.mound.layers.reduce((sum, layer) => {
            const layerCount = layer.cells ? layer.cells.length : layer.cols * layer.rows;
            return sum + layerCount;
          }, 0) + (item.sideStacks || []).reduce((sum, stack) => sum + stack.count, 0)
          : item.piles
            ? item.piles.heights.reduce((sum, height) => sum + height, 0)
            : 0);
      const starMarkup = stars > 0
        ? `<span class="mini-stars" aria-label="最佳 ${stars} 星">${'★'.repeat(stars)}${'☆'.repeat(Math.max(0, 3 - stars))}</span>`
        : '<span class="mini-stars mini-stars--empty">未挑战</span>';
      return `
        <button
          class="level-option ${item.id === level.id ? 'is-selected' : ''}"
          type="button"
          data-action="select-level"
          data-level="${item.id}"
          aria-pressed="${item.id === level.id ? 'true' : 'false'}"
          aria-label="第 ${item.id} 关 ${item.name}，${item.subtitle}${stars ? `，最佳 ${stars} 星` : ''}">
          <span class="level-option__top">
            <span class="level-option__num">LEVEL 0${item.id}</span>
            <span class="level-option__badge">${item.badge}</span>
          </span>
          <strong class="level-option__name">${item.name}</strong>
          <span class="level-option__meta">
            <span>${cardCount} 张</span>
            ${starMarkup}
          </span>
        </button>
      `;
    }).join('');

    const html = `
      <div class="modal__inner">
        <div class="modal-hero">
          <div class="mascot-plaque">
            <svg viewBox="0 0 140 130" aria-hidden="true"><use href="#sheep-mascot"></use></svg>
          </div>
          <span class="eyebrow"><span class="eyebrow__dot"></span>今日份的牧场</span>
          <h2 class="modal-title"><span class="title-leaf">✿</span> 羊了个羊</h2>
          <p class="modal-subtitle">点击没有被压住的牌，三张相同就能消除。<br>必须把压在上面的牌全部清掉，后面的牌才能拿。</p>
        </div>

        <div class="rules-grid" aria-label="玩法说明">
          <div class="rule">
            <span class="rule__icon" aria-hidden="true">👆</span>
            <strong>拿牌</strong>
            <small>完全没被压住</small>
          </div>
          <div class="rule">
            <span class="rule__icon" aria-hidden="true">🧺</span>
            <strong>凑三张</strong>
            <small>相同图案消除</small>
          </div>
          <div class="rule">
            <span class="rule__icon" aria-hidden="true">🌿</span>
            <strong>清空牧场</strong>
            <small>七格不能塞满</small>
          </div>
        </div>

        <div class="level-picker">
          <div class="level-picker__head">
            <span class="level-picker__label">选择关卡</span>
            <span class="level-picker__note">每局随机发牌 · 全部关卡自由挑战</span>
          </div>
          <div class="level-list">${cards}</div>
        </div>

        <div class="modal-actions">
          <button class="btn btn--primary" type="button" data-action="start">
            开始第 ${level.id} 关 · ${level.name}
            <span class="primary-arrow" aria-hidden="true"><svg viewBox="0 0 24 24"><use href="#icon-arrow"></use></svg></span>
          </button>
        </div>
        <p class="modal-footnote">完全露出才能拿 · 凑齐三张自动消除 · 卡槽 <b>7</b> 格</p>
      </div>
    `;

    showOverlay(html, 'start', '开始游戏', opts.focusSelector || '[data-action="start"]');
  }

  function openPauseOverlay() {
    if (!state.session || state.session.state !== 'playing') return;
    state.playing = false;
    pauseTimer();
    updateTools();
    sfx('pause');

    const level = state.session.level;
    const time = formatTime(getElapsedMs());
    const html = `
      <div class="modal__inner">
        <div class="result-hero">
          <div class="result-mascot">
            <svg viewBox="0 0 140 130" aria-hidden="true"><use href="#sheep-mascot"></use></svg>
          </div>
          <span class="result-badge">休息一下</span>
          <h2 class="result-title">小羊在吃草</h2>
          <p class="result-subtitle">计时暂停啦，伸个懒腰再回来。<br>牧场的牌会乖乖等你。</p>
        </div>
        <div class="pause-stats">
          <div class="pause-stat">
            <span>当前关卡</span>
            <strong>第 ${level.id} 关</strong>
          </div>
          <div class="pause-stat">
            <span>剩余牌</span>
            <strong>${state.session.remainingCount()}</strong>
          </div>
          <div class="pause-stat">
            <span>已用时</span>
            <strong>${time}</strong>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn--primary" type="button" data-action="resume">
            继续游戏
            <span class="primary-arrow" aria-hidden="true"><svg viewBox="0 0 24 24"><use href="#icon-arrow"></use></svg></span>
          </button>
          <div class="btn-row">
            <button class="btn btn--ghost btn--small" type="button" data-action="retry">重新开始</button>
            <button class="btn btn--ghost btn--small" type="button" data-action="home">选择关卡</button>
          </div>
        </div>
        <div class="pause-rules">
          <svg viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-leaf"></use></svg>
          <span>必须把压在上面的牌全部清掉，后面的牌才能拿。</span>
        </div>
      </div>
    `;

    showOverlay(html, 'pause', '游戏已暂停', '[data-action="resume"]');
  }

  function showResultOverlay(type, data) {
    if (!state.session) return;
    state.playing = false;
    pauseTimer();
    updateTools();
    state.overlayMode = type;

    const win = type === 'win';
    const level = state.session.level;
    const isFinal = level.id === MAX_LEVEL;
    const stars = win ? clamp(Number(data.stars) || 1, 1, 3) : 0;
    const timeMs = win ? data.timeMs : getElapsedMs();
    const score = state.session.score;
    const remaining = state.session.remainingCount();
    const toolState = state.session.getToolState();
    const canUndoRescue = !win && toolState.canUndo;
    const canMoveRescue = !win && state.session.tools.move > 0 && state.session.tray.length >= 3;

    const starMarkup = [0, 1, 2].map((index) => {
      const filled = index < stars;
      return `<span class="result-star ${filled ? '' : 'is-empty'}" aria-hidden="true">★</span>`;
    }).join('');

    const rescueMarkup = (!win && (canUndoRescue || canMoveRescue)) ? `
      <div class="rescue-card">
        <div class="rescue-card__head">别急，还有办法救一下</div>
        <div class="rescue-actions">
          ${canUndoRescue ? `<button class="btn btn--gold btn--small" type="button" data-action="rescue-undo">撤回一步</button>` : ''}
          ${canMoveRescue ? `<button class="btn btn--gold btn--small" type="button" data-action="rescue-move">移出三张</button>` : ''}
        </div>
      </div>
    ` : '';

    let title = '';
    let subtitle = '';
    let badge = '';
    let primaryAction = '';
    let primaryLabel = '';
    let secondaryActions = '';

    if (win) {
      badge = isFinal ? '全部通关' : '通关成功';
      title = isFinal ? '你就是羊王！' : '牧场清空啦！';
      subtitle = isFinal
        ? '三百多张牌都没能难住你。这片牧场，以后就归你管啦。'
        : level.id === 1
          ? '热身完毕，下一片牧场已经开门了。'
          : '轻轻松松，连月光都为你亮了一点。';
      if (!isFinal) {
        primaryAction = 'next';
        primaryLabel = `进入第 ${level.id + 1} 关`;
        secondaryActions = `
          <div class="btn-row">
            <button class="btn btn--ghost btn--small" type="button" data-action="retry">再玩一次</button>
            <button class="btn btn--ghost btn--small" type="button" data-action="home">选择关卡</button>
          </div>
        `;
      } else {
        primaryAction = 'home';
        primaryLabel = '回到牧场选关';
        secondaryActions = `
          <button class="btn btn--ghost btn--small" type="button" data-action="retry">再挑战一次</button>
        `;
      }
    } else {
      badge = '差一点点';
      title = '卡槽塞满啦';
      subtitle = '先别急，看看还能不能救一下小羊。<br>下一局记得先消牌，再拿新牌。';
      primaryAction = 'retry';
      primaryLabel = '重新挑战';
      secondaryActions = `
        <button class="btn btn--ghost btn--small" type="button" data-action="home">选择关卡</button>
      `;
    }

    const html = `
      <div class="modal__inner">
        <div class="result-hero">
          <div class="result-mascot" style="${win ? '' : 'transform: rotate(3deg);'}">
            <svg viewBox="0 0 140 130" aria-hidden="true"><use href="#sheep-mascot"></use></svg>
          </div>
          <span class="result-badge">${badge}</span>
          <h2 class="result-title">${title}</h2>
          ${win ? `<div class="result-stars" aria-label="本关获得 ${stars} 星">${starMarkup}</div>` : ''}
          <p class="result-subtitle">${subtitle}</p>
        </div>

        <div class="result-stats" aria-label="本局数据">
          <div class="result-stat"><span>用时</span><strong>${formatTime(timeMs)}</strong></div>
          <div class="result-stat"><span>步数</span><strong>${state.session.moves}</strong></div>
          <div class="result-stat"><span>得分</span><strong>${score}</strong></div>
        </div>

        ${!win ? `<div class="result-stats" aria-label="剩余牌数" style="grid-template-columns:1fr;margin-top:-7px;">
          <div class="result-stat"><span>牧场还剩</span><strong>${remaining} 张</strong></div>
        </div>` : ''}

        ${rescueMarkup}

        <div class="modal-actions">
          <button class="btn btn--primary" type="button" data-action="${primaryAction}">
            ${primaryLabel}
            <span class="primary-arrow" aria-hidden="true"><svg viewBox="0 0 24 24"><use href="#icon-arrow"></use></svg></span>
          </button>
          ${secondaryActions}
        </div>
        <p class="modal-footnote">${win ? `本关已用道具 <b>${getUsedTools()}</b> 次` : '提示：先把卡槽里成对的牌凑成三张，再拿新牌。'}</p>
      </div>
    `;

    showOverlay(html, win ? 'win' : 'lose', win ? '通关成功' : '游戏结束', '[data-action="' + primaryAction + '"]');

    if (win) {
      window.setTimeout(() => launchConfetti(56), 120);
    }
  }

  function showOverlay(html, mode, label, focusSelector) {
    state.overlayMode = mode;
    state.focusBeforeOverlay = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    refs.confettiLayer.innerHTML = '';
    refs.modal.innerHTML = html;
    refs.modal.setAttribute('aria-label', label || '游戏面板');
    refs.modal.scrollTop = 0;
    refs.overlay.hidden = false;
    refs.page.inert = true;
    document.body.classList.add('overlay-open');
    updateTools();

    window.setTimeout(() => {
      const target = (focusSelector && refs.modal.querySelector(focusSelector))
        || refs.modal.querySelector('.btn--primary')
        || refs.modal.querySelector('button');
      if (target) target.focus({ preventScroll: true });
    }, 80);
  }

  function closeOverlay(options) {
    const opts = Object.assign({ restoreFocus: false }, options || {});
    refs.overlay.hidden = true;
    refs.confettiLayer.innerHTML = '';
    refs.modal.innerHTML = '';
    refs.modal.removeAttribute('aria-label');
    refs.page.inert = false;
    document.body.classList.remove('overlay-open');
    state.overlayMode = null;
    if (opts.restoreFocus) {
      if (state.focusBeforeOverlay && document.contains(state.focusBeforeOverlay)) {
        state.focusBeforeOverlay.focus({ preventScroll: true });
      } else if (refs.pauseBtn) {
        refs.pauseBtn.focus({ preventScroll: true });
      }
    }
  }

  function onModalAction(event) {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    sfx('click');

    switch (action) {
      case 'start':
        beginFromStartOverlay();
        break;
      case 'select-level':
        selectStartLevel(Number(button.dataset.level));
        break;
      case 'resume':
        resumeGame();
        break;
      case 'retry':
        retryLevel();
        break;
      case 'next':
        goToNextLevel();
        break;
      case 'home':
        goHome();
        break;
      case 'rescue-undo':
        rescueWith('undo');
        break;
      case 'rescue-move':
        rescueWith('move');
        break;
      default:
        break;
    }
  }

  function beginFromStartOverlay() {
    closeOverlay({ restoreFocus: true });
    state.playing = true;
    resetTimer();
    startTimer();
    state.save.lastLevel = state.levelId;
    persistSave();
    updateTools();
    sfx('start');
    showToast('先从最上面一层开始吧', 'warm');
    focusBoard();
    announce(`第 ${state.levelId} 关开始，共 ${state.session.tiles.length} 张牌`);
  }

  function selectStartLevel(levelId) {
    if (state.overlayMode !== 'start') return;
    if (!levelId || levelId === state.levelId) {
      openStartOverlay({ focusSelector: `[data-level="${state.levelId}"]` });
      return;
    }
    state.save.lastLevel = levelId;
    persistSave();
    prepareLevel(levelId, {
      entrance: true,
      keepOverlay: true,
      preview: true
    });
    openStartOverlay({ focusSelector: `[data-level="${levelId}"]` });
    announce(`已选择第 ${levelId} 关`);
  }

  function resumeGame() {
    if (!state.session || state.session.state !== 'playing') return;
    closeOverlay({ restoreFocus: true });
    state.playing = true;
    startTimer();
    updateTools();
    sfx('click');
    focusBoard();
  }

  function retryLevel() {
    const levelId = state.levelId;
    closeOverlay();
    prepareLevel(levelId, { entrance: true });
    state.playing = true;
    resetTimer();
    startTimer();
    updateTools();
    sfx('start');
    showToast('新的一局，加油！', 'warm');
    focusBoard();
  }

  function goToNextLevel() {
    const nextId = Math.min(MAX_LEVEL, state.levelId + 1);
    closeOverlay();
    prepareLevel(nextId, { entrance: true });
    state.playing = true;
    resetTimer();
    startTimer();
    updateTools();
    sfx('start');
    showToast(`第 ${nextId} 关 · ${state.session.level.name}`, 'warm');
    focusBoard();
  }

  function goHome() {
    closeOverlay();
    const levelId = state.levelId;
    prepareLevel(levelId, { entrance: true, preview: true });
    openStartOverlay();
  }

  function rescueWith(tool) {
    if (!state.session || state.session.state !== 'lost') return;
    let result;
    if (tool === 'undo') {
      result = state.session.undo();
      if (!result.ok) {
        showToast('现在已经没有办法撤回啦');
        return;
      }
      sfx('undo');
      closeOverlay();
      state.playing = true;
      startTimer();
      rebuildBoard({ entrance: false });
      renderTray();
      updateLevelInfo();
      updateTools();
      showToast('已经撤回上一步，继续加油！', 'warm');
      announce('撤回成功，游戏继续');
      focusBoard();
    } else {
      result = state.session.useMove();
      if (!result.ok) {
        showToast('现在已经没有办法移出啦');
        return;
      }
      sfx('tool');
      closeOverlay();
      state.playing = true;
      startTimer();
      renderTray();
      updateLevelInfo();
      updateTools();
      const rect = refs.trayPanel.getBoundingClientRect();
      burstAt(rect.left + rect.width / 2, rect.top + rect.height / 2, {
        count: 8,
        palette: ['#ffe4a0', '#fff7db', '#cbe9b2'],
        spread: 80,
        sizeRange: [4, 8]
      });
      showToast('已移出三张牌，点击暂存区的牌可以放回', 'warm');
      announce('移出三张牌成功，游戏继续');
      focusBoard();
    }
  }

  function focusBoard() {
    window.setTimeout(() => {
      const firstOpen = refs.board.querySelector('.tile.is-open');
      if (firstOpen) {
        firstOpen.focus({ preventScroll: true });
      } else {
        refs.board.tabIndex = -1;
        refs.board.focus({ preventScroll: true });
      }
    }, 120);
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      if (state.overlayMode === 'pause') {
        event.preventDefault();
        resumeGame();
        return;
      }
      if (!refs.overlay.hidden) return;
      if (isInteractive()) {
        event.preventDefault();
        openPauseOverlay();
      }
      return;
    }

    if (event.key !== 'Tab' || refs.overlay.hidden) return;
    const focusables = Array.from(refs.modal.querySelectorAll(
      'button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'
    )).filter((element) => element.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function onVisibilityChange() {
    if (document.hidden && state.playing && refs.overlay.hidden && state.session && state.session.state === 'playing') {
      openPauseOverlay();
    }
  }

  /* ------------------------------------------------------------------ */
  /* 视觉特效                                                            */
  /* ------------------------------------------------------------------ */
  function burstAt(x, y, options) {
    const opts = Object.assign({ count: 6, palette: ['#ffe38f'], spread: 40, sizeRange: [4, 8] }, options || {});
    if (opts.count <= 0) return;

    const ring = document.createElement('span');
    ring.className = 'fx-burst';
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    ring.style.setProperty('--particle-color', opts.palette[0]);
    refs.fxLayer.appendChild(ring);
    window.setTimeout(() => ring.remove(), 560);

    const shapes = ['✦', '●', '◆', '✿'];
    for (let i = 0; i < opts.count; i += 1) {
      const angle = (Math.PI * 2 * i) / opts.count + Math.random() * 0.55;
      const distance = opts.spread * (0.45 + Math.random() * 0.8);
      const size = opts.sizeRange[0] + Math.random() * (opts.sizeRange[1] - opts.sizeRange[0]);
      const particle = document.createElement('span');
      particle.className = 'fx-particle';
      particle.textContent = shapes[Math.floor(Math.random() * shapes.length)];
      particle.style.left = `${x}px`;
      particle.style.top = `${y}px`;
      particle.style.setProperty('--particle-x', `${Math.cos(angle) * distance}px`);
      particle.style.setProperty('--particle-y', `${Math.sin(angle) * distance}px`);
      particle.style.setProperty('--particle-color', opts.palette[Math.floor(Math.random() * opts.palette.length)]);
      particle.style.setProperty('--particle-size', `${size}px`);
      particle.style.setProperty('--particle-rotate', `${-120 + Math.random() * 240}deg`);
      particle.style.setProperty('--particle-duration', `${520 + Math.random() * 320}ms`);
      particle.style.setProperty('--particle-delay', `${Math.random() * 55}ms`);
      refs.fxLayer.appendChild(particle);
      window.setTimeout(() => particle.remove(), 1000);
    }
  }

  function spawnMatchCallout(icon, x, y) {
    const el = document.createElement('div');
    el.className = 'match-callout';
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.innerHTML = `<span>${icon}</span>三张消除 <b>+100</b>`;
    refs.fxLayer.appendChild(el);
    window.setTimeout(() => el.remove(), 900);
  }

  function launchConfetti(count) {
    if (!refs.confettiLayer) return;
    const colors = ['#f3c95c', '#f0a85e', '#94bd6e', '#f28b8e', '#d7b2ec', '#fff1b8'];
    for (let i = 0; i < count; i += 1) {
      const piece = document.createElement('span');
      piece.className = 'confetti';
      piece.style.left = `${Math.random() * 100}vw`;
      piece.style.setProperty('--confetti-w', `${5 + Math.random() * 7}px`);
      piece.style.setProperty('--confetti-h', `${8 + Math.random() * 10}px`);
      piece.style.setProperty('--confetti-color', colors[Math.floor(Math.random() * colors.length)]);
      piece.style.setProperty('--confetti-duration', `${1900 + Math.random() * 1700}ms`);
      piece.style.setProperty('--confetti-delay', `${Math.random() * 700}ms`);
      piece.style.setProperty('--confetti-drift', `${-110 + Math.random() * 220}px`);
      piece.style.setProperty('--confetti-rotate', `${420 + Math.random() * 900}deg`);
      if (Math.random() > 0.6) piece.style.borderRadius = '50%';
      refs.confettiLayer.appendChild(piece);
      window.setTimeout(() => piece.remove(), 4300);
    }
  }

  function showToast(message, tone) {
    window.clearTimeout(state.toastTimer);
    refs.toast.textContent = message;
    refs.toast.classList.toggle('toast--warm', tone === 'warm');
    refs.toast.classList.remove('is-visible');
    void refs.toast.offsetWidth;
    refs.toast.classList.add('is-visible');
    state.toastTimer = window.setTimeout(() => {
      refs.toast.classList.remove('is-visible');
    }, 1800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
