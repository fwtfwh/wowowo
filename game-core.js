/*!
 * 羊了个羊 · 游戏核心
 * 纯逻辑，不依赖 DOM。浏览器与 Node 均可使用。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SheepCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const BOARD_WIDTH = 8;
  const BOARD_HEIGHT = 6.4;
  const TRAY_CAPACITY = 7;
  const BENCH_CAPACITY = 3;

  const TILE_TYPES = [
    { key: 'carrot',    icon: '🥕', name: '胡萝卜', tint: '#f28b47', rim: '#d96b2b' },
    { key: 'corn',      icon: '🌽', name: '玉米',   tint: '#f4c744', rim: '#c99a20' },
    { key: 'mushroom',  icon: '🍄', name: '蘑菇',   tint: '#ed7d72', rim: '#be4b43' },
    { key: 'clover',    icon: '🍀', name: '三叶草', tint: '#70bd71', rim: '#3d8b49' },
    { key: 'strawberry',icon: '🍓', name: '草莓',   tint: '#f47a86', rim: '#c84d5f' },
    { key: 'sunflower', icon: '🌻', name: '向日葵', tint: '#f2b84b', rim: '#c88a22' },
    { key: 'grape',     icon: '🍇', name: '葡萄',   tint: '#aa86dc', rim: '#7653aa' },
    { key: 'star',      icon: '⭐', name: '星星',   tint: '#f6ce58', rim: '#c59b25' },
    { key: 'sheep',     icon: '🐑', name: '小羊',   tint: '#a9c7d8', rim: '#7198ac' },
    { key: 'egg',       icon: '🥚', name: '鸡蛋',   tint: '#e8cf9a', rim: '#b69a5f' },
    { key: 'bell',      icon: '🔔', name: '铃铛',   tint: '#e4b653', rim: '#b08428' },
    { key: 'acorn',     icon: '🌰', name: '橡果',   tint: '#c69a69', rim: '#90633a' },
    { key: 'potato',    icon: '🥔', name: '土豆',   tint: '#d3ad70', rim: '#a37b44' },
    { key: 'pumpkin',   icon: '🎃', name: '南瓜',   tint: '#f39a49', rim: '#c56a24' },
    { key: 'cherry',    icon: '🍒', name: '樱桃',   tint: '#e2636e', rim: '#b13e4a' },
    { key: 'pear',      icon: '🍐', name: '梨',     tint: '#c8d96b', rim: '#93ad3f' },
    { key: 'chili',     icon: '🌶️', name: '辣椒',   tint: '#e35c4b', rim: '#b13a30' },
    { key: 'milk',      icon: '🥛', name: '牛奶',   tint: '#e8edf1', rim: '#adbcc6' },
    { key: 'honey',     icon: '🍯', name: '蜂蜜',   tint: '#e7b44e', rim: '#b78324' },
    { key: 'chicken',   icon: '🐔', name: '小鸡',   tint: '#f0c269', rim: '#be8a3f' },
    { key: 'bee',       icon: '🐝', name: '蜜蜂',   tint: '#e8c84c', rim: '#b39325' },
    { key: 'basket',    icon: '🧺', name: '篮子',   tint: '#d1a061', rim: '#a4783c' }
  ];

  /*
   * 最难关：348 张牌。
   * 中央 324 张按 2→25 张逐层递增（俯视时最上面最大），
   * 所以从最上面往下看是“倒金字塔”，越往里层牌越少。
   */
  const DEEP_PYRAMID_COUNTS = Array.from({ length: 24 }, (_, index) => index + 2);
  const DEEP_PYRAMID_CELLS = (() => {
    const cells = [];
    for (let row = 0; row < 5; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        cells.push({
          col,
          row,
          distance: Math.abs(col - 2) + Math.abs(row - 2) + Math.abs(col - 2) * 0.02 + Math.abs(row - 2) * 0.03
        });
      }
    }
    return cells.sort((a, b) => a.distance - b.distance || a.row - b.row || a.col - b.col);
  })();
  const DEEP_PYRAMID_LAYERS = DEEP_PYRAMID_COUNTS.map((count, index) => {
    const isTop = index === DEEP_PYRAMID_COUNTS.length - 1;
    return {
      cols: 5,
      rows: 5,
      gapX: 1,
      gapY: 1,
      offsetX: isTop ? 0 : [0.5, 0, -0.5, 0][index % 4],
      offsetY: isTop ? 0 : [0, 0.5, 0, -0.5][index % 4],
      staggerX: 0,
      cells: DEEP_PYRAMID_CELLS.slice(0, count)
    };
  });

  const LEVELS = [
    {
      id: 1,
      name: '青草试炼',
      subtitle: '从最外面的一圈开始清理',
      badge: '热身',
      difficulty: 1,
      cardCount: 48,
      theme: 'meadow',
      typeCount: 12,
      seed: 20261108,
      order: 'flow',
      traySize: TRAY_CAPACITY,
      tools: { undo: 1, shuffle: 1, move: 1 },
      randomLayout: {
        baseCols: 6,
        baseRows: 4,
        countsTopDown: [3, 6, 15, 24]
      },
      mound: {
        layers: [
          { cols: 6, rows: 4, gapX: 1, gapY: 1, offsetX: 0, offsetY: 0, staggerX: 0 },
          { cols: 5, rows: 3, gapX: 1, gapY: 1, offsetX: 0, offsetY: 0, staggerX: 0 },
          { cols: 3, rows: 2, gapX: 1, gapY: 1, offsetX: 0, offsetY: 0, staggerX: 0 },
          { cols: 3, rows: 1, gapX: 1, gapY: 1, offsetX: 0, offsetY: 0, staggerX: 0 }
        ]
      }
    },
    {
      id: 2,
      name: '月光牧场',
      subtitle: '中间的牌，要一圈圈拆开',
      badge: '进阶',
      difficulty: 2,
      cardCount: 72,
      theme: 'sunset',
      typeCount: 16,
      seed: 20261109,
      order: 'flow',
      traySize: TRAY_CAPACITY,
      tools: { undo: 1, shuffle: 1, move: 1 },
      randomLayout: {
        baseCols: 7,
        baseRows: 4,
        countsTopDown: [3, 8, 15, 18, 28]
      },
      mound: {
        layers: [
          { cols: 7, rows: 4, gapX: 1, gapY: 1, offsetX: 0, offsetY: 0, staggerX: 0 },
          { cols: 6, rows: 3, gapX: 1, gapY: 1, offsetX: 0, offsetY: 0, staggerX: 0 },
          { cols: 5, rows: 3, gapX: 1, gapY: 1, offsetX: 0, offsetY: 0, staggerX: 0 },
          { cols: 4, rows: 2, gapX: 1, gapY: 1, offsetX: 0, offsetY: 0, staggerX: 0 },
          { cols: 3, rows: 1, gapX: 1, gapY: 1, offsetX: 0, offsetY: 0, staggerX: 0 }
        ]
      }
    },
    {
      id: 3,
      name: '羊王争霸',
      subtitle: '三百四十八张牌叠成的终极牧场',
      badge: '终局',
      difficulty: 3,
      cardCount: 348,
      theme: 'starry',
      typeCount: 22,
      seed: 20261110,
      order: 'flow',
      traySize: TRAY_CAPACITY,
      tools: { undo: 1, shuffle: 1, move: 1 },
      randomLayout: {
        baseCols: 5,
        baseRows: 5,
        layerCount: 24,
        total: 324,
        topRange: [16, 23],
        holesFromNext: true
      },
      mound: {
        layers: DEEP_PYRAMID_LAYERS
      },
      sideStacks: [
        { side: 'left', x: 0, faceY: 2.95, count: 12, offsetY: 0.075, layerBase: 30 },
        { side: 'right', x: 7, faceY: 2.95, count: 12, offsetY: 0.075, layerBase: 44 }
      ]
    }
  ];

  /* ------------------------------------------------------------------ */
  /* 随机数：固定种子，确保重开可复现，也方便自动测试。                  */
  /* ------------------------------------------------------------------ */
  function hashSeed(input) {
    let h = 2166136261 >>> 0;
    const str = String(input);
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function random() {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(list, random) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  function sample(list, n, random) {
    return shuffle(list, random).slice(0, n);
  }

  function roundCoord(value) {
    return Math.round(value * 1000) / 1000;
  }

  /* ------------------------------------------------------------------ */
  /* 几何与遮挡                                                          */
  /* ------------------------------------------------------------------ */
  function overlapRatio(a, b) {
    const overlapW = Math.min(a.x + 1, b.x + 1) - Math.max(a.x, b.x);
    const overlapH = Math.min(a.y + 1, b.y + 1) - Math.max(a.y, b.y);
    if (overlapW <= 0 || overlapH <= 0) return 0;
    return overlapW * overlapH;
  }

  const BLOCK_THRESHOLD = 0.0001;

  function tileBlocks(higher, lower) {
    if (!higher || !lower || higher.layer <= lower.layer) return false;
    return overlapRatio(higher, lower) > BLOCK_THRESHOLD;
  }

  function buildPositions(level) {
    const raw = [];

    if (level.mound) {
      level.mound.layers.forEach((spec, layer) => {
        const gapX = spec.gapX || 1.03;
        const gapY = spec.gapY || 1.02;
        const contentW = (spec.cols - 1) * gapX + 1;
        const contentH = (spec.rows - 1) * gapY + 1;
        const startX = (BOARD_WIDTH - contentW) / 2 + (spec.offsetX || 0);
        const startY = (BOARD_HEIGHT - contentH) / 2 + (spec.offsetY || 0);

        for (let row = 0; row < spec.rows; row += 1) {
          const rowShift = spec.staggerX ? ((row % 2) * spec.staggerX) : 0;
          for (let col = 0; col < spec.cols; col += 1) {
            if (spec.cells && !spec.cells.some((cell) => cell.col === col && cell.row === row)) {
              continue;
            }
            raw.push({
              x: startX + col * gapX + rowShift,
              y: startY + row * gapY,
              layer,
              angle: 0
            });
          }
        }
      });

      // 最难一关左右两侧的暗牌堆：只有最上面一张会翻面，其余卡面不可见。
      if (level.sideStacks) {
        level.sideStacks.forEach((stack) => {
          for (let depth = 0; depth < stack.count; depth += 1) {
            raw.push({
              x: stack.x,
              y: stack.faceY - depth * stack.offsetY,
              layer: stack.layerBase + (stack.count - 1 - depth),
              angle: 0,
              sideStack: stack.side,
              sideDepth: depth
            });
          }
        });
      }
    } else if (level.piles) {
      const layout = level.piles;
      layout.heights.forEach((height, pileIndex) => {
        const col = pileIndex % layout.cols;
        const row = Math.floor(pileIndex / layout.cols);
        const rowShift = layout.rowStagger ? ((row % 2) * layout.rowStagger) : 0;
        const wobbleX = Math.sin(pileIndex * 2.15) * 0.038;
        const wobbleY = Math.cos(pileIndex * 1.77) * 0.035;
        const topX = layout.startX + col * layout.gapX + rowShift + wobbleX;
        const topY = layout.startY + row * layout.gapY + wobbleY;
        const dirX = ((pileIndex * 5) % 3) - 1;
        const baseAngle = (((pileIndex * 37) % 11) - 5) * 0.16;

        for (let stackIndex = 0; stackIndex < height; stackIndex += 1) {
          const back = height - 1 - stackIndex;
          raw.push({
            x: topX - dirX * (layout.shiftX || 0) * back,
            y: topY - (layout.shiftY || 0) * back,
            layer: stackIndex,
            angle: roundCoord(baseAngle + (back % 2 === 0 ? 0.16 : -0.12) * (back > 0 ? 1 : 0.35)),
            pileId: pileIndex,
            stackDepth: back
          });
        }
      });
    } else {
      // 兼容旧的层叠式关卡配置。
      level.layers.forEach((spec, layer) => {
        for (let row = 0; row < spec.rows; row += 1) {
          const rowShift = spec.stagger ? ((row % 2) * spec.stagger) : 0;
          for (let col = 0; col < spec.cols; col += 1) {
            raw.push({
              x: spec.startX + col * spec.gapX + rowShift,
              y: spec.startY + row * spec.gapY,
              layer,
              angle: 0
            });
          }
        }
      });
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    raw.forEach((p) => {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x + 1);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y + 1);
    });

    const shiftX = (BOARD_WIDTH - (maxX - minX)) / 2 - minX;
    const shiftY = (BOARD_HEIGHT - (maxY - minY)) / 2 - minY;

    return raw.map((p, index) => ({
      id: `t${index}`,
      x: roundCoord(p.x + shiftX),
      y: roundCoord(p.y + shiftY),
      layer: p.layer,
      angle: p.angle || 0,
      pileId: typeof p.pileId === 'number' ? p.pileId : null,
      stackDepth: typeof p.stackDepth === 'number' ? p.stackDepth : null,
      sideStack: p.sideStack || null,
      sideDepth: typeof p.sideDepth === 'number' ? p.sideDepth : null,
      index
    }));
  }

  function computeAvailableIds(tiles, remainingIds) {
    const active = tiles.filter((t) => remainingIds.has(t.id));
    return active.filter((lower) => {
      return !active.some((higher) => tileBlocks(higher, lower));
    }).map((t) => t.id);
  }

  function buildBlockers(tiles) {
    const blockers = new Map();
    tiles.forEach((tile) => {
      blockers.set(tile.id, []);
    });
    for (let i = 0; i < tiles.length; i += 1) {
      for (let j = 0; j < tiles.length; j += 1) {
        if (i === j) continue;
        if (tiles[i].layer > tiles[j].layer && tileBlocks(tiles[i], tiles[j])) {
          blockers.get(tiles[j].id).push(tiles[i].id);
        }
      }
    }
    return blockers;
  }

  /* ------------------------------------------------------------------ */
  /* 生成可通关的牌序                                                    */
  /* 先得到一条合法拿牌顺序，再把每 3 张指定为同一种图案。               */
  /* 按这条顺序操作时，卡槽中最多只会同时出现 3 张牌，因此必定可解。     */
  /* ------------------------------------------------------------------ */
  function makeOrder(tiles, level, random) {
    const byLayer = new Map();
    tiles.forEach((tile) => {
      if (!byLayer.has(tile.layer)) byLayer.set(tile.layer, []);
      byLayer.get(tile.layer).push(tile.id);
    });

    if (level.order === 'layers') {
      const order = [];
      const layers = Array.from(byLayer.keys()).sort((a, b) => b - a);
      layers.forEach((layer) => {
        order.push(...shuffle(byLayer.get(layer), random));
      });
      return order;
    }

    const remaining = new Set(tiles.map((tile) => tile.id));
    const order = [];
    let available = computeAvailableIds(tiles, remaining);

    // 开局先保证有一组「三张都露在外面」的牌，避免开局完全无从下手。
    if (available.length >= 3) {
      const starter = sample(available, 3, random);
      starter.forEach((id) => {
        remaining.delete(id);
        order.push(id);
      });
      available = computeAvailableIds(tiles, remaining);
    }

    while (remaining.size > 0) {
      if (available.length === 0) {
        // 理论上不会发生，保底按层清理。
        const fallback = Array.from(remaining).sort((a, b) => {
          const ta = tiles.find((t) => t.id === a);
          const tb = tiles.find((t) => t.id === b);
          return tb.layer - ta.layer;
        });
        order.push(...fallback);
        break;
      }

      // 优先在上层里挑选，偶尔从露出的下层边缘拿一张，让牌型更自然。
      let pool = available;
      if (random() < 0.62) {
        const maxLayer = Math.max(...available.map((id) => tiles.find((t) => t.id === id).layer));
        const upper = available.filter((id) => tiles.find((t) => t.id === id).layer === maxLayer);
        if (upper.length > 0) pool = upper;
      }
      const pick = pool[Math.floor(random() * pool.length)];
      remaining.delete(pick);
      order.push(pick);
      available = computeAvailableIds(tiles, remaining);
    }

    return order;
  }

  function assignTypes(tiles, order, typeCount, random) {
    const tileMap = new Map(tiles.map((tile) => [tile.id, tile]));
    const groups = [];
    for (let i = 0; i < order.length; i += 3) {
      groups.push(order.slice(i, i + 3));
    }

    const pool = Array.from({ length: typeCount }, (_, i) => i);
    const typeSequence = [];
    while (typeSequence.length < groups.length) {
      typeSequence.push(...shuffle(pool, random));
    }

    groups.forEach((group, groupIndex) => {
      const type = typeSequence[groupIndex];
      group.forEach((id) => {
        tileMap.get(id).type = type;
      });
    });
  }

  function randomInt(random, min, max) {
    return min + Math.floor(random() * (max - min + 1));
  }

  function cellKey(cell) {
    return `${cell.col}:${cell.row}`;
  }

  /*
   * 每局重新生成一次牌堆。
   * 所有牌都落在同一张基础网格上，层与层只沿一个轴错开半张，
   * 因此任意上下两层之间只会出现「完整重合」或「压住一半」。
   */
  function buildRandomMound(level, random) {
    const config = level.randomLayout;
    if (!config) return null;

    const baseCols = config.baseCols;
    const baseRows = config.baseRows;
    const totalCells = baseCols * baseRows;
    const allCells = [];
    for (let row = 0; row < baseRows; row += 1) {
      for (let col = 0; col < baseCols; col += 1) {
        allCells.push({ col, row });
      }
    }

    let counts;
    if (config.countsTopDown) {
      counts = config.countsTopDown.slice();
    } else {
      const topCount = randomInt(random, config.topRange[0], config.topRange[1]);
      const remaining = config.total - topCount;
      const lowerLayerCount = config.layerCount - 1;
      const base = Math.floor(remaining / lowerLayerCount);
      const remainder = remaining - base * lowerLayerCount;
      counts = [topCount];
      for (let i = 0; i < lowerLayerCount; i += 1) {
        counts.push(base + (i < remainder ? 1 : 0));
      }
    }

    const expectedTotal = config.total || counts.reduce((sum, count) => sum + count, 0);
    const realTotal = counts.reduce((sum, count) => sum + count, 0);
    if (realTotal !== expectedTotal) {
      throw new Error(`random layout total mismatch: ${realTotal} !== ${expectedTotal}`);
    }

    const cellsTopDown = new Array(counts.length);
    for (let i = 1; i < counts.length; i += 1) {
      cellsTopDown[i] = sample(allCells, counts[i], random);
    }

    if (config.holesFromNext && counts[0] < totalCells) {
      const holeCount = totalCells - counts[0];
      const below = cellsTopDown[1] || allCells;
      const holes = sample(below, Math.min(holeCount, below.length), random);
      const holeKeys = new Set(holes.map(cellKey));
      let extraPool = allCells.filter((cell) => !holeKeys.has(cellKey(cell)));
      while (holes.length < holeCount) {
        const index = Math.floor(random() * extraPool.length);
        const cell = extraPool[index];
        holes.push(cell);
        holeKeys.add(cellKey(cell));
        extraPool = extraPool.filter((candidate) => cellKey(candidate) !== cellKey(cell));
      }
      cellsTopDown[0] = allCells.filter((cell) => !holeKeys.has(cellKey(cell)));
    } else {
      cellsTopDown[0] = sample(allCells, counts[0], random);
    }

    const axis = random() < 0.5 ? 'x' : 'y';
    const offsets = [-0.5, 0, 0.5];
    const layersTopDown = counts.map((count, index) => {
      const offset = offsets[Math.floor(random() * offsets.length)];
      return {
        cols: baseCols,
        rows: baseRows,
        gapX: 1,
        gapY: 1,
        offsetX: axis === 'x' ? offset : 0,
        offsetY: axis === 'y' ? offset : 0,
        staggerX: 0,
        cells: cellsTopDown[index]
      };
    });

    return {
      layers: layersTopDown.reverse(),
      sideStacks: level.sideStacks || null,
      axis,
      topCount: counts[0]
    };
  }

  function buildBoard(level, variant) {
    const seedString = `${level.seed}:${variant || 0}`;
    const random = mulberry32(hashSeed(seedString));
    const tiles = buildPositions(level);
    const order = makeOrder(tiles, level, random);
    assignTypes(tiles, order, level.typeCount, random);

    const blockers = buildBlockers(tiles);
    return { tiles, order, blockers, seedString };
  }

  /* ------------------------------------------------------------------ */
  /* 游戏会话                                                            */
  /* ------------------------------------------------------------------ */
  class GameSession {
    constructor(levelId, options) {
      const opts = options || {};
      const level = getLevel(levelId);
      this.level = level;
      this.traySize = level.traySize || TRAY_CAPACITY;
      this.benchSize = BENCH_CAPACITY;
      this.tools = Object.assign({ undo: 1, shuffle: 1, move: 1 }, level.tools);
      this.toolsInitial = Object.assign({}, this.tools);
      this.state = 'playing';
      this.score = 0;
      this.moves = 0;
      this.matches = 0;
      this.lastSnapshot = null;
      this.tray = [];
      this.bench = [];
      this.lastEvent = null;
      this.variant = opts.variant || 0;

      const board = buildBoard(level, this.variant);
      this.tiles = board.tiles;
      this.solution = board.order;
      this.blockers = board.blockers;
      this.seedString = board.seedString;
      this.tileMap = new Map(this.tiles.map((tile) => [tile.id, tile]));
      this.tiles.forEach((tile) => {
        tile.status = 'board';
      });
      this._refreshBlocked();
      this.assignTrayIds = null;
    }

    getType(typeId) {
      return TILE_TYPES[typeId] || TILE_TYPES[0];
    }

    getTile(id) {
      return this.tileMap.get(id) || null;
    }

    _refreshBlocked() {
      this.tiles.forEach((tile) => {
        if (tile.status !== 'board') {
          tile.blocked = false;
          return;
        }
        tile.blocked = this.blockers.get(tile.id).some((id) => {
          const other = this.tileMap.get(id);
          return other && other.status === 'board';
        });
      });
    }

    boardTiles() {
      return this.tiles.filter((tile) => tile.status === 'board');
    }

    trayTiles() {
      return this.tray.map((id) => this.tileMap.get(id)).filter(Boolean);
    }

    benchTiles() {
      return this.bench.map((id) => this.tileMap.get(id)).filter(Boolean);
    }

    remainingCount() {
      return this.tiles.filter((tile) => tile.status === 'board').length;
    }

    availableTiles() {
      return this.boardTiles().filter((tile) => !tile.blocked);
    }

    canInteract() {
      return this.state !== 'won';
    }

    _capture() {
      if (this.tools.undo <= 0) return;
      this.lastSnapshot = {
        statuses: this.tiles.map((tile) => [tile.id, tile.status]),
        types: this.tiles.map((tile) => [tile.id, tile.type]),
        tray: this.tray.slice(),
        bench: this.bench.slice(),
        score: this.score,
        moves: this.moves,
        matches: this.matches
      };
    }

    _restore(snapshot) {
      const statuses = new Map(snapshot.statuses);
      const types = new Map(snapshot.types);
      this.tiles.forEach((tile) => {
        tile.status = statuses.get(tile.id) || 'board';
        tile.type = types.has(tile.id) ? types.get(tile.id) : tile.type;
      });
      this.tray = snapshot.tray.slice();
      this.bench = snapshot.bench.slice();
      this.score = snapshot.score;
      this.moves = snapshot.moves;
      this.matches = snapshot.matches;
      this.state = 'playing';
      this._refreshBlocked();
    }

    _resolveTray() {
      const clearSet = [];
      const counts = new Map();
      this.tray.forEach((id) => {
        const tile = this.tileMap.get(id);
        if (!tile) return;
        counts.set(tile.type, (counts.get(tile.type) || 0) + 1);
      });

      const matchedType = Array.from(counts.keys()).find((type) => counts.get(type) >= 3);
      if (matchedType === undefined) return false;

      let removed = 0;
      const keep = [];
      this.tray.forEach((id) => {
        const tile = this.tileMap.get(id);
        if (tile && tile.type === matchedType && removed < 3) {
          tile.status = 'cleared';
          clearSet.push(id);
          removed += 1;
        } else {
          keep.push(id);
        }
      });
      this.tray = keep;
      this.matches += 1;
      this.score += 100;
      this.lastMatch = clearSet;
      this._refreshBlocked();

      // 极端情况下可能一次凑出两组，继续结算。
      if (this._hasTriple()) this._resolveTray();
      return true;
    }

    _hasTriple() {
      const counts = new Map();
      for (const id of this.tray) {
        const tile = this.tileMap.get(id);
        if (!tile) continue;
        counts.set(tile.type, (counts.get(tile.type) || 0) + 1);
        if (counts.get(tile.type) >= 3) return true;
      }
      return false;
    }

    _checkEnd() {
      if (this.state === 'won' || this.state === 'lost') return;
      const boardLeft = this.remainingCount();
      if (boardLeft === 0 && this.tray.length === 0 && this.bench.length === 0) {
        this.state = 'won';
        this.score += Math.max(0, 300 - this.moves * 2);
        return;
      }
      if (this.tray.length >= this.traySize) {
        this.state = 'lost';
      }
    }

    clickTile(id) {
      if (this.state === 'won') return { ok: false, reason: 'finished' };
      if (this.state === 'lost') return { ok: false, reason: 'lost' };
      const tile = this.tileMap.get(id);
      if (!tile || tile.status !== 'board') return { ok: false, reason: 'missing' };
      if (tile.blocked) {
        const blockers = this.blockers.get(id).filter((bid) => {
          const other = this.tileMap.get(bid);
          return other && other.status === 'board';
        });
        return { ok: false, reason: 'blocked', blockers };
      }
      if (this.tray.length >= this.traySize) return { ok: false, reason: 'full' };

      this._capture();
      tile.status = 'tray';
      this.tray.push(id);
      this.moves += 1;
      this._refreshBlocked();
      this.lastMatch = [];

      const matched = this._resolveTray();
      this._checkEnd();

      const event = {
        ok: true,
        tile,
        tray: this.tray.slice(),
        bench: this.bench.slice(),
        matched,
        matchedIds: matched ? this.lastMatch.slice() : [],
        score: this.score,
        state: this.state
      };
      this.lastEvent = event;
      return event;
    }

    undo() {
      if (this.tools.undo <= 0) return { ok: false, reason: 'no-tool' };
      if (!this.lastSnapshot) return { ok: false, reason: 'no-move' };
      if (this.state === 'won') return { ok: false, reason: 'won' };
      const wasLost = this.state === 'lost';
      this.tools.undo -= 1;
      this._restore(this.lastSnapshot);
      this.lastSnapshot = null;
      this.lastMatch = [];
      return { ok: true, restored: true, wasLost, state: this.state };
    }

    useMove() {
      if (this.tools.move <= 0) return { ok: false, reason: 'no-tool' };
      if (this.tray.length === 0) return { ok: false, reason: 'empty' };
      if (this.state === 'won') return { ok: false, reason: 'won' };
      this._capture();
      const wasLost = this.state === 'lost';
      const moving = this.tray.splice(Math.max(0, this.tray.length - 3), Math.min(3, this.tray.length));
      moving.forEach((id) => {
        const tile = this.tileMap.get(id);
        if (tile) tile.status = 'bench';
      });
      this.bench.push(...moving);
      this.tools.move -= 1;
      this.state = 'playing';
      this._refreshBlocked();
      this._checkEnd();
      return {
        ok: true,
        wasLost,
        moved: moving.map((id) => this.tileMap.get(id)),
        tray: this.tray.slice(),
        bench: this.bench.slice(),
        state: this.state
      };
    }

    returnBench(id) {
      if (this.state === 'won' || this.state === 'lost') return { ok: false, reason: 'finished' };
      const index = this.bench.indexOf(id);
      if (index < 0) return { ok: false, reason: 'missing' };
      if (this.tray.length >= this.traySize) return { ok: false, reason: 'full' };
      this._capture();
      this.bench.splice(index, 1);
      const tile = this.tileMap.get(id);
      if (!tile) return { ok: false, reason: 'missing' };
      tile.status = 'tray';
      this.tray.push(id);
      this.moves += 1;
      this._refreshBlocked();
      const matched = this._resolveTray();
      this._checkEnd();
      return {
        ok: true,
        tile,
        matched,
        matchedIds: matched ? this.lastMatch.slice() : [],
        tray: this.tray.slice(),
        bench: this.bench.slice(),
        state: this.state
      };
    }

    useShuffle() {
      if (this.tools.shuffle <= 0) return { ok: false, reason: 'no-tool' };
      if (this.state === 'won') return { ok: false, reason: 'won' };
      const boardTiles = this.boardTiles();
      if (boardTiles.length < 2) return { ok: false, reason: 'too-few' };
      this._capture();
      const wasLost = this.state === 'lost';
      const types = shuffle(boardTiles.map((tile) => tile.type), Math.random);
      boardTiles.forEach((tile, index) => {
        tile.type = types[index];
      });
      this.tools.shuffle -= 1;
      if (this.state === 'lost') this.state = 'playing';
      this._refreshBlocked();
      return { ok: true, wasLost, state: this.state, count: boardTiles.length };
    }

    getToolState() {
      return {
        undo: this.tools.undo,
        shuffle: this.tools.shuffle,
        move: this.tools.move,
        canUndo: this.tools.undo > 0 && !!this.lastSnapshot && this.state !== 'won',
        canMove: this.tools.move > 0 && this.tray.length > 0 && this.state !== 'won',
        canShuffle: this.tools.shuffle > 0 && this.remainingCount() >= 2 && this.state !== 'won'
      };
    }

    restart(variant) {
      return new GameSession(this.level.id, { variant: typeof variant === 'number' ? variant : this.variant });
    }
  }

  function getLevel(levelId) {
    return LEVELS.find((level) => level.id === Number(levelId)) || LEVELS[0];
  }

  function makeSession(levelId, variant) {
    return new GameSession(levelId, { variant: variant || 0 });
  }

  /**
   * 自动验证一关：按照生成时记录的解序操作，应完整通关。
   * 返回 { won, steps, error }，供测试使用。
   */
  function verifyLevel(levelId, variant) {
    const session = makeSession(levelId, variant);
    for (let i = 0; i < session.solution.length; i += 1) {
      const id = session.solution[i];
      const result = session.clickTile(id);
      if (!result.ok) {
        return { won: false, steps: i, error: result, session };
      }
      if (session.state === 'lost') {
        return { won: false, steps: i, error: { reason: 'lost' }, session };
      }
    }
    return {
      won: session.state === 'won' && session.remainingCount() === 0,
      steps: session.solution.length,
      state: session.state,
      tray: session.tray.slice(),
      score: session.score,
      session
    };
  }

  return {
    BOARD_WIDTH,
    BOARD_HEIGHT,
    TRAY_CAPACITY,
    BENCH_CAPACITY,
    BLOCK_THRESHOLD,
    TILE_TYPES,
    LEVELS,
    GameSession,
    getLevel,
    makeSession,
    verifyLevel,
    buildBoard,
    buildPositions,
    buildBlockers,
    overlapRatio,
    mulberry32,
    hashSeed
  };
});
