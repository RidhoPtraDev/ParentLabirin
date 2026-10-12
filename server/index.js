const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');
const qrcode = require('qrcode');
const db = require('./database');
const MAP_POOL = require('./maps');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

// ================================
// PORT & NETWORK Setup
// ================================
const PORT = process.env.PORT || 3000;

// ================================
// NAMESPACES
// ================================
const nsHost   = io.of('/ns-host');
const nsPlayer = io.of('/ns-player');

// ================================
// NETWORK UTILITIES
// ================================
function getLocalIp() {
  const interfaces  = os.networkInterfaces();
  const candidates  = [];
  const virtualRegex = /(virtualbox|vmware|virtual|hyper-v|vethernet)/i;

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const isVirtual = virtualRegex.test(name) || iface.address.startsWith('192.168.56.');
        candidates.push({ name, address: iface.address, isVirtual });
      }
    }
  }

  candidates.sort((a, b) => {
    if (a.isVirtual !== b.isVirtual) return a.isVirtual ? 1 : -1;
    const aWifi = /(wi-fi|wireless|wlan|ethernet)/i.test(a.name);
    const bWifi = /(wi-fi|wireless|wlan|ethernet)/i.test(b.name);
    if (aWifi !== bWifi) return aWifi ? -1 : 1;
    return 0;
  });

  if (candidates.length > 0) {
    const selected = candidates[0].address;
    console.log(`[Parent Labirin] IP lokal terdeteksi untuk QR Code: ${selected}`);
    for (let i = 1; i < candidates.length; i++) {
      console.log(`[Parent Labirin] Kandidat IP lain (diabaikan): ${candidates[i].address} (${candidates[i].name})`);
    }
    return selected;
  }
  return '127.0.0.1';
}

const LOCAL_IP = getLocalIp();
const HOST_URL = `http://${LOCAL_IP}:${PORT}/host`;

let qrCodeBase64 = '';
qrcode.toDataURL(HOST_URL, (err, url) => {
  if (!err) qrCodeBase64 = url;
});

// ================================
// STATIC FILES
// ================================
app.use(express.static(path.join(__dirname, '../public/player')));
app.use('/host', express.static(path.join(__dirname, '../public/host')));

// ================================
// CONSTANTS & GAME STATE
// ================================
const GRID_SIZE     = 10;
const MOVE_COOLDOWN = 200; // ms (200ms server-side and 220ms client-side)

let mazeHorizontalWalls = [];
let mazeVerticalWalls   = [];

let gameState = {
  sessionId:               null,
  active:                  false,
  timer:                   180,
  player:                  { x: 0, y: 0, __prevX: 0, __prevY: 0, lastMoveTimestamp: 0 },
  monsters:                [
    { id: 0, x: 0, y: 9, speed: 0.20, lastMove: 0, lastDir: { x: 0, y: 0 } },
    { id: 1, x: 9, y: 0, speed: 0.20, lastMove: 0, lastDir: { x: 0, y: 0 } },
    { id: 2, x: 9, y: 9, speed: 0.20, lastMove: 0, lastDir: { x: 0, y: 0 } },
    { id: 3, x: 0, y: 5, speed: 0.20, lastMove: 0, lastDir: { x: 0, y: 0 } },
    { id: 4, x: 5, y: 0, speed: 0.20, lastMove: 0, lastDir: { x: 0, y: 0 } },
    { id: 5, x: 5, y: 9, speed: 0.20, lastMove: 0, lastDir: { x: 0, y: 0 } },
    { id: 6, x: 9, y: 5, speed: 0.20, lastMove: 0, lastDir: { x: 0, y: 0 } }
  ],
  doors:                   [],
  clues:                   [],
  result:                  null,
  decorativeDoorPositions: [],
};

// References to clear intervals properly
let monsterIntervalId              = null;
let countdownIntervalId            = null;

// ================================
// MAP POOL VALIDATION
// ================================
function validateMapPool() {
  console.log(`[Parent Labirin] Validating ${MAP_POOL.length} maps in MAP_POOL...`);
  MAP_POOL.forEach((map, idx) => {
    const reachable = checkMapReachability(map.horizontalWalls, map.verticalWalls);
    console.log(`[Parent Labirin] Map ${idx + 1} (${map.name}): ${reachable ? 'VALID (100/100 cells)' : 'INVALID (Isolated area detected!)'}`);
  });
}

function checkMapReachability(hWalls, vWalls) {
  const visited = new Set();
  const queue   = [{ x: 0, y: 0 }];
  visited.add('0,0');

  while (queue.length > 0) {
    const curr = queue.shift();
    const dirs  = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];

    for (const dir of dirs) {
      const nx  = curr.x + dir.x;
      const ny  = curr.y + dir.y;
      const key = `${nx},${ny}`;

      if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE && !visited.has(key)) {
        if (!isBlockedByWallSpecific(curr.x, curr.y, nx, ny, hWalls, vWalls)) {
          visited.add(key);
          queue.push({ x: nx, y: ny });
        }
      }
    }
  }
  return visited.size === GRID_SIZE * GRID_SIZE;
}

// Wall check for PLAYER movement: allows stepping onto exit door positions
function isBlockedByWall(x1, y1, x2, y2) {
  if (gameState && gameState.doors) {
    const isExitTop    = (y2 === -1        && x1 === x2 && gameState.doors.some(d => d.x === x1 && d.y === 0             && d.side === 'top'));
    const isExitBottom = (y2 === GRID_SIZE && x1 === x2 && gameState.doors.some(d => d.x === x1 && d.y === GRID_SIZE - 1 && d.side === 'bottom'));
    const isExitLeft   = (x2 === -1        && y1 === y2 && gameState.doors.some(d => d.x === 0             && d.y === y1 && d.side === 'left'));
    const isExitRight  = (x2 === GRID_SIZE && y1 === y2 && gameState.doors.some(d => d.x === GRID_SIZE - 1 && d.y === y1 && d.side === 'right'));
    if (isExitTop || isExitBottom || isExitLeft || isExitRight) return false;
  }
  return isBlockedByWallSpecific(x1, y1, x2, y2, mazeHorizontalWalls, mazeVerticalWalls);
}

// Wall check for MONSTER movement: monsters can NEVER leave the grid bounds
// (prevents monsters from entering exit door positions and getting stuck)
function isBlockedByWallForMonster(x1, y1, x2, y2) {
  // Hard boundary: monster can never move outside the 10×10 grid
  if (x2 < 0 || x2 >= GRID_SIZE || y2 < 0 || y2 >= GRID_SIZE) return true;
  return isBlockedByWallSpecific(x1, y1, x2, y2, mazeHorizontalWalls, mazeVerticalWalls);
}

function isBlockedByWallSpecific(x1, y1, x2, y2, hWalls, vWalls) {
  if (x2 < 0 || x2 >= GRID_SIZE || y2 < 0 || y2 >= GRID_SIZE) return true;

  if (x1 === x2) {
    const minY = Math.min(y1, y2);
    if (minY < 0 || minY >= GRID_SIZE - 1) return true;
    return vWalls[minY][x1];
  } else if (y1 === y2) {
    const minX = Math.min(x1, x2);
    if (minX < 0 || minX >= GRID_SIZE - 1) return true;
    return hWalls[y1][minX];
  }
  return true;
}

// ================================
// EXIT DOOR & DECORATIVE DOOR
// ================================
function generateExitDoors() {
  const sides     = ['top', 'bottom', 'left', 'right'];
  const allocated = [];

  sides.forEach(side => {
    let slot = pickRandomEdgeSlot(side);
    while (allocated.some(s => s.x === slot.x && s.y === slot.y)) {
      slot = pickRandomEdgeSlot(side);
    }
    allocated.push(slot);
  });

  const remainingSide = sides[Math.floor(Math.random() * sides.length)];
  let lastSlot = pickRandomEdgeSlot(remainingSide);
  while (allocated.some(s => s.x === lastSlot.x && s.y === lastSlot.y)) {
    lastSlot = pickRandomEdgeSlot(remainingSide);
  }
  allocated.push(lastSlot);

  const labels       = ['A', 'B', 'C', 'D', 'E'];
  const doorStatuses = ['lolos', 'lolos', 'zonk', 'zonk', 'zonk'].sort(() => Math.random() - 0.5);

  return allocated.map((slot, idx) => ({
    label:  labels[idx],
    x:      slot.x,
    y:      slot.y,
    side:   slot.side,
    isExit: true,
    status: doorStatuses[idx]
  }));
}

function pickRandomEdgeSlot(side) {
  const coord = Math.floor(Math.random() * GRID_SIZE);
  if (side === 'top')    return { x: coord, y: 0,             side };
  if (side === 'bottom') return { x: coord, y: GRID_SIZE - 1, side };
  if (side === 'left')   return { x: 0,     y: coord,         side };
  return { x: GRID_SIZE - 1, y: coord, side };
}

function isLolosDoorReachable(playerX, playerY, doors, hWalls, vWalls, blockedDoorsList = []) {
  const lolosDoors = doors.filter(d => d.status === 'lolos');
  if (lolosDoors.length === 0) return false;

  const visited    = new Set();
  const queue      = [{ x: playerX, y: playerY }];
  visited.add(`${playerX},${playerY}`);

  const blockedSet = new Set(blockedDoorsList.map(b => `${b.x1},${b.y1}-${b.x2},${b.y2}`));

  while (queue.length > 0) {
    const curr = queue.shift();

    if (lolosDoors.some(d => d.x === curr.x && d.y === curr.y)) {
      return true;
    }

    const dirs = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];
    for (const dir of dirs) {
      const nx  = curr.x + dir.x;
      const ny  = curr.y + dir.y;
      const key = `${nx},${ny}`;

      if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE && !visited.has(key)) {
        if (!isBlockedByWallSpecific(curr.x, curr.y, nx, ny, hWalls, vWalls)) {
          const pKey1 = `${curr.x},${curr.y}-${nx},${ny}`;
          const pKey2 = `${nx},${ny}-${curr.x},${curr.y}`;
          if (!blockedSet.has(pKey1) && !blockedSet.has(pKey2)) {
            visited.add(key);
            queue.push({ x: nx, y: ny });
          }
        }
      }
    }
  }
  return false;
}

function selectDecorativeDoors(hWalls, vWalls) {
  // Divide the 10x10 grid into a 4x3 zone grid (4 cols x 3 rows = 12 zones).
  // We pick 1 door per zone → guaranteed 12 doors spread evenly across the entire maze.
  // Zone boundaries: cols split at [0,2,5,7,10), rows split at [0,3,6,10)
  const COL_SPLITS = [0, 2, 5, 7, 10]; // 4 column zones
  const ROW_SPLITS = [0, 3, 6, 10];    // 3 row zones
  const zones = [];
  for (let zr = 0; zr < ROW_SPLITS.length - 1; zr++) {
    for (let zc = 0; zc < COL_SPLITS.length - 1; zc++) {
      zones.push({ rMin: ROW_SPLITS[zr], rMax: ROW_SPLITS[zr + 1], cMin: COL_SPLITS[zc], cMax: COL_SPLITS[zc + 1], candidates: [] });
    }
  }

  // Collect horizontal-passage candidates (moving left↔right through wall boundary at col c/c+1)
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE - 1; c++) {
      if (!isBlockedByWallSpecific(c, r, c + 1, r, hWalls, vWalls)) {
        // This passage sits between col c and c+1, belongs to zone of col c
        const zone = zones.find(z => r >= z.rMin && r < z.rMax && c >= z.cMin && c < z.cMax);
        if (zone) zone.candidates.push({ type: 'H', x1: c, y1: r, x2: c + 1, y2: r });
      }
    }
  }

  // Collect vertical-passage candidates (moving up↔down through wall boundary at row r/r+1)
  for (let r = 0; r < GRID_SIZE - 1; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (!isBlockedByWallSpecific(c, r, c, r + 1, hWalls, vWalls)) {
        const zone = zones.find(z => r >= z.rMin && r < z.rMax && c >= z.cMin && c < z.cMax);
        if (zone) zone.candidates.push({ type: 'V', x1: c, y1: r, x2: c, y2: r + 1 });
      }
    }
  }

  // Pick 3 doors per zone (36 doors total) — shuffle within zone so picks are random
  const selected = [];
  zones.forEach(zone => {
    const shuffled = zone.candidates.sort(() => Math.random() - 0.5);
    selected.push(...shuffled.slice(0, 3)); // up to 3 per zone
  });

  // 50% blocked / 50% open at session start — balanced and navigable
  const closedCount = Math.round(selected.length * 0.5);
  const shuffledForRatio = [...selected].sort(() => Math.random() - 0.5);
  const now = Date.now();
  return shuffledForRatio.map((d, idx) => ({
    ...d,
    blocked: idx < closedCount,
    lastToggleTime: now // stamp so client grace-period starts correctly from session start
  }));
}

function toggleDecorativeDoors() {
  if (!gameState.active || gameState.decorativeDoorPositions.length === 0) return;

  const doors = gameState.decorativeDoorPositions.map(d => ({ ...d }));
  // Keep same 50% ratio as initialization — balanced, navigable, consistent
  const closedCount = Math.round(doors.length * 0.5);

  // Shuffle and assign new states maintaining 50% closed / 50% open ratio
  const shuffled = [...doors].sort(() => Math.random() - 0.5);
  const now = Date.now();
  const nextDoors = shuffled.map((d, idx) => {
    const newBlocked = idx < closedCount;
    return {
      ...d,
      blocked: newBlocked,
      // Stamp toggle time ONLY when state actually changes (blocked→unblocked or unblocked→blocked)
      lastToggleTime: (newBlocked !== d.blocked) ? now : (d.lastToggleTime || 0)
    };
  });

  const blockedList = nextDoors.filter(d => d.blocked);

  if (isLolosDoorReachable(gameState.player.x, gameState.player.y, gameState.doors, mazeHorizontalWalls, mazeVerticalWalls, blockedList)) {
    gameState.decorativeDoorPositions = nextDoors;
    console.log(`[Parent Labirin] Decorative doors reshuffled (50/50 ratio). ${blockedList.length} blocked, ${nextDoors.length - blockedList.length} open.`);
  } else {
    console.log('[Parent Labirin] Reshuffle rollbacked to prevent trapping the player.');
  }
}

function isSmallDeadEnd(x, y, hWalls, vWalls) {
  const dirs = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];
  let validPathCount = 0;
  dirs.forEach(dir => {
    const nx = x + dir.x;
    const ny = y + dir.y;
    if (!isBlockedByWallSpecific(x, y, nx, ny, hWalls, vWalls)) {
      validPathCount++;
    }
  });
  return validPathCount <= 1;
}

// ================================
// SESSION START & CLEAR LOOPS
// ================================
function clearSessionIntervals() {
  if (monsterIntervalId) {
    clearInterval(monsterIntervalId);
    monsterIntervalId = null;
  }
  if (countdownIntervalId) {
    clearInterval(countdownIntervalId);
    countdownIntervalId = null;
  }
}

function startNewSession() {
  // Clear any existing loops/intervals before starting a new session to prevent memory leaks
  clearSessionIntervals();

  // If there is an active session, broadcast a clean game:ended signal to both host and
  // player BEFORE overwriting state. This gives the host dashboard a proper "old game ended"
  // transition instead of an abrupt state replacement that causes the UI to glitch.
  if (gameState.active && gameState.sessionId) {
    try {
      const abortSession = db.prepare('UPDATE sessions SET ended_at = ?, result = ? WHERE id = ?');
      abortSession.run(new Date().toISOString(), 'aborted_by_host', gameState.sessionId);
      console.log(`[Parent Labirin] Sesi sebelumnya (${gameState.sessionId}) ditutup dengan result 'aborted_by_host'.`);
    } catch (err) {
      console.error('[Parent Labirin] Error menutup sesi lama di SQLite:', err);
    }
    // Emit game:ended for old session so host dashboard gets a clean transition
    nsHost.emit('game:ended', {
      sessionId: gameState.sessionId,
      result: 'aborted_by_host',
      timer: gameState.timer,
      reason: 'Host memulai sesi baru.'
    });
    nsPlayer.emit('game:ended', {
      sessionId: gameState.sessionId,
      result: 'aborted_by_host',
      timer: gameState.timer,
      reason: 'Host memulai sesi baru.'
    });
  } else if (gameState.sessionId) {
    // Session was already inactive but record needs update
    try {
      const abortSession = db.prepare('UPDATE sessions SET ended_at = ?, result = ? WHERE id = ?');
      abortSession.run(new Date().toISOString(), 'aborted_by_host', gameState.sessionId);
      console.log(`[Parent Labirin] Sesi sebelumnya (${gameState.sessionId}) ditutup dengan result 'aborted_by_host'.`);
    } catch (err) {
      console.error('[Parent Labirin] Error menutup sesi lama di SQLite:', err);
    }
  }

  const sessionId = 'session_' + Date.now();

  const mapIndex    = Math.floor(Math.random() * MAP_POOL.length);
  const selectedMap = MAP_POOL[mapIndex];
  console.log(`[Parent Labirin] Selected ${selectedMap.name} from MAP_POOL`);

  mazeHorizontalWalls = selectedMap.horizontalWalls.map(row => [...row]);
  mazeVerticalWalls   = selectedMap.verticalWalls.map(row => [...row]);

  let newDoors = generateExitDoors();
  let attempts = 0;
  while (!isLolosDoorReachable(0, 0, newDoors, mazeHorizontalWalls, mazeVerticalWalls) && attempts < 10) {
    newDoors = generateExitDoors();
    attempts++;
  }
  gameState.doors = newDoors;

  let px = Math.floor(Math.random() * GRID_SIZE);
  let py = Math.floor(Math.random() * GRID_SIZE);
  const isExitGate = (x, y) => gameState.doors.some(d => d.x === x && d.y === y);

  while (isExitGate(px, py)) {
    px = Math.floor(Math.random() * GRID_SIZE);
    py = Math.floor(Math.random() * GRID_SIZE);
  }

  // Pick decorative door positions and verify reachability from the player spawn coordinates
  let decoDoors = selectDecorativeDoors(mazeHorizontalWalls, mazeVerticalWalls);
  let decoAttempts = 0;
  while (decoAttempts < 10) {
    const blockedList = decoDoors.filter(d => d.blocked);
    // Fast-path: if no doors are blocked, path is guaranteed reachable
    if (blockedList.length === 0 || isLolosDoorReachable(px, py, newDoors, mazeHorizontalWalls, mazeVerticalWalls, blockedList)) {
      break;
    }
    decoDoors = selectDecorativeDoors(mazeHorizontalWalls, mazeVerticalWalls);
    decoAttempts++;
  }
  gameState.decorativeDoorPositions = decoDoors;

  const NUM_MONSTERS = 7;
  gameState.monsters = [];
  const now = Date.now();

  for (let i = 0; i < NUM_MONSTERS; i++) {
    let mx, my;
    let spawnAttempts = 0;
    // Try strict minimum distance (3) first; fall back to 2 after 80 attempts
    // (7 monsters on 10x10 grid — more pressure, need earlier relaxation)
    let minDist = 3;
    do {
      mx = Math.floor(Math.random() * GRID_SIZE);
      my = Math.floor(Math.random() * GRID_SIZE);
      spawnAttempts++;
      if (spawnAttempts === 80) minDist = 2;
    } while (
      (
        Math.abs(mx - px) + Math.abs(my - py) < minDist ||
        isExitGate(mx, my) ||
        isSmallDeadEnd(mx, my, mazeHorizontalWalls, mazeVerticalWalls) ||
        gameState.monsters.some(m => m.x === mx && m.y === my)
      ) && spawnAttempts < 150
    );

    gameState.monsters.push({
      id: i,
      x: mx,
      y: my,
      speed: 0.20,
      lastMove: now,
      lastDir: { x: 0, y: 0 }
    });
  }

  const loloDoors = gameState.doors.filter(d => d.status === 'lolos').map(d => d.label).join(', ');
  const zonkDoors = gameState.doors.filter(d => d.status === 'zonk').map(d => d.label).join(', ');

  // Pick clue positions dynamically — avoid exit door cells, player spawn, and each other
  const occupiedClue = new Set([
    `${px},${py}`,
    ...gameState.monsters.map(m => `${m.x},${m.y}`),
    ...gameState.doors.map(d => `${d.x},${d.y}`)
  ]);

  function pickClueCell() {
    let cx, cy;
    let attempts = 0;
    do {
      cx = Math.floor(Math.random() * GRID_SIZE);
      cy = Math.floor(Math.random() * GRID_SIZE);
      attempts++;
    } while (occupiedClue.has(`${cx},${cy}`) && attempts < 50);
    occupiedClue.add(`${cx},${cy}`);
    return { col: cx, row: cy };
  }

  const clue1Pos = pickClueCell();
  const clue2Pos = pickClueCell();

  gameState.clues = [
    { row: clue1Pos.row, col: clue1Pos.col, description: `Pintu bertipe LOLOS ada diantara: ${loloDoors}` },
    { row: clue2Pos.row, col: clue2Pos.col, description: `Pintu bertipe ZONK ada diantara: ${zonkDoors}` }
  ];

  gameState.sessionId = sessionId;
  gameState.active    = true;
  gameState.timer     = 180;
  gameState.player    = { x: px, y: py, __prevX: px, __prevY: py, lastMoveTimestamp: 0 };
  gameState.result    = null;

  try {
    const insertSession = db.prepare('INSERT INTO sessions (id, started_at, ended_at, result) VALUES (?, ?, ?, ?)');
    insertSession.run(sessionId, new Date().toISOString(), null, null);

    const insertDoor = db.prepare('INSERT INTO doors_config (session_id, door_label, status) VALUES (?, ?, ?)');
    gameState.doors.forEach(d => insertDoor.run(sessionId, d.label, d.status));

    const insertClue = db.prepare('INSERT INTO clues (session_id, row, col, description) VALUES (?, ?, ?, ?)');
    gameState.clues.forEach(c => insertClue.run(sessionId, c.row, c.col, c.description));
  } catch (err) {
    console.error('[Parent Labirin] Error logging to SQLite:', err);
  }

  // Restart intervals for the game loop cleanly
  setupSessionIntervals();

  broadcastState();
}

function setupSessionIntervals() {
  monsterIntervalId = setInterval(() => {
    if (gameState.active) {
      moveMonsters();
    }
  }, 100);

  countdownIntervalId = setInterval(() => {
    if (gameState.active) {
      gameState.timer -= 1;

      if (gameState.timer <= 0) {
        endGame('lose_timeout');
        return;
      }

      broadcastState();
    }
  }, 1000);
}

// ================================
// MONSTER PATHFINDING
// ================================
function getDetectionRadius() {
  const time = gameState.timer;
  if (time > 60) return 2;
  if (time > 30) return 4;
  return 6;
}

function findShortestPath(start, target) {
  const queue   = [[start]];
  const visited = new Set([`${start.x},${start.y}`]);

  while (queue.length > 0) {
    const path = queue.shift();
    const curr = path[path.length - 1];

    if (curr.x === target.x && curr.y === target.y) {
      return path;
    }

    const dirs = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];

    for (const dir of dirs) {
      const nextX = curr.x + dir.x;
      const nextY = curr.y + dir.y;
      const key   = `${nextX},${nextY}`;

      // Use monster-specific wall check: monsters cannot enter exit door positions
      if (!isBlockedByWallForMonster(curr.x, curr.y, nextX, nextY) && !visited.has(key)) {
        visited.add(key);
        queue.push([...path, { x: nextX, y: nextY }]);
      }
    }
  }
  return null;
}

function moveMonsters() {
  if (!gameState.active) return;

  const radius    = getDetectionRadius();
  const playerPos = gameState.player;
  const now       = Date.now();

  gameState.monsters.forEach(monster => {
    const bfsPath   = findShortestPath(monster, playerPos);
    const pathDist  = bfsPath ? bfsPath.length - 1 : Infinity;
    const isChasing = pathDist <= radius;

    monster.speed = isChasing ? 0.25 : 0.20;
    const moveCooldown = isChasing ? 800 : 1000;

    if (now - monster.lastMove < moveCooldown) return;

    const dirs = [
      { x: 0, y: -1 },
      { x: 0, y: 1  },
      { x: -1, y: 0 },
      { x: 1,  y: 0 }
    ];

    const validDirs = dirs.filter(d => {
      const nx = monster.x + d.x;
      const ny = monster.y + d.y;
      // Monsters must stay within grid — use monster-specific wall check
      return !isBlockedByWallForMonster(monster.x, monster.y, nx, ny);
    });

    if (validDirs.length === 0) return;

    const reverseDir = { x: -monster.lastDir.x, y: -monster.lastDir.y };
    let allowedDirs  = isChasing
      ? validDirs
      : validDirs.filter(d => !(d.x === reverseDir.x && d.y === reverseDir.y));

    if (allowedDirs.length === 0) {
      allowedDirs = validDirs;
    }

    let chosenDir = null;

    if (isChasing && bfsPath && bfsPath.length > 1) {
      const nextCell = bfsPath[1];
      const chaseDir = { x: nextCell.x - monster.x, y: nextCell.y - monster.y };

      if (allowedDirs.some(d => d.x === chaseDir.x && d.y === chaseDir.y)) {
        chosenDir = chaseDir;
      } else {
        chosenDir = allowedDirs[Math.floor(Math.random() * allowedDirs.length)];
      }
    } else {
      chosenDir = allowedDirs[Math.floor(Math.random() * allowedDirs.length)];
    }

    if (chosenDir) {
      const prevMonsterX = monster.x;
      const prevMonsterY = monster.y;

      monster.x       += chosenDir.x;
      monster.y       += chosenDir.y;
      monster.lastDir  = chosenDir;
      monster.lastMove = now;

      // Cek tabrakan langsung (monster mendarat di posisi player)
      const landedOnPlayer = (monster.x === playerPos.x && monster.y === playerPos.y);

      // Cek "saling bertukar tempat" (monster & player saling melewati diagonal/lurus)
      const swappedWithPlayer = (
        monster.x === playerPos.__prevX && monster.y === playerPos.__prevY &&
        prevMonsterX === playerPos.x && prevMonsterY === playerPos.y
      );

      if (landedOnPlayer || swappedWithPlayer) {
        endGame('lose_monster');
      }
    } else if (monster.x === playerPos.x && monster.y === playerPos.y) {
      endGame('lose_monster');
    }
  });

  broadcastState();
}

// ================================
// GAME END & DISCONNECT HANDLING
// ================================
function endGame(result, isAborted = false) {
  if (!gameState.active) return;
  gameState.active = false;
  gameState.result = result;

  // 1. Stop all interval countdowns, monster loops, and shift intervals
  clearSessionIntervals();

  // 2. Save result to SQLite
  try {
    const updateSession = db.prepare('UPDATE sessions SET ended_at = ?, result = ? WHERE id = ?');
    updateSession.run(new Date().toISOString(), result, gameState.sessionId);
  } catch (err) {
    console.error('[Parent Labirin] Error updating SQLite session:', err);
  }

  // 3. Prepare payload & emit game:ended to both player and host namespaces
  const endPayload = {
    sessionId: gameState.sessionId,
    result: result,
    timer: gameState.timer,
    reason: result === 'win' ? 'Pemain berhasil keluar lewat pintu lolos!' :
            result === 'lose_zonk' ? 'Pemain masuk ke pintu zonk!' :
            result === 'lose_monster' ? 'Pemain ditangkap oleh monster!' :
            result === 'lose_timeout' ? 'Waktu habis sebelum pemain lolos!' :
            result === 'aborted_by_host' ? 'Permainan dihentikan paksa oleh Host.' : 'Koneksi terputus.'
  };

  nsPlayer.emit('game:ended', endPayload);
  nsHost.emit('game:ended', endPayload);

  // Broadcast the final inactive state to finalize client rendering
  broadcastState();

}

// ================================
// BROADCAST (namespace-isolated, A1)
// ================================
function broadcastState() {
  const playerPayload = {
    sessionId:               gameState.sessionId,
    active:                  gameState.active,
    timer:                   gameState.timer,
    gridSize:                GRID_SIZE,
    player:                  { x: gameState.player.x, y: gameState.player.y },
    monsters:                gameState.monsters.map(m => ({ id: m.id, x: m.x, y: m.y })),
    doors:                   gameState.doors.map(d => ({ label: d.label, x: d.x, y: d.y, side: d.side })),
    // cluePositions intentionally omitted — positions are secret; only revealed via player:clueFound on step
    mazeHorizontalWalls,
    mazeVerticalWalls,
    result:                  gameState.result,
    detectionRadius:         getDetectionRadius(),
    decorativeDoorPositions: gameState.decorativeDoorPositions.map(d => ({
      x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2, type: d.type, blocked: d.blocked,
      lastToggleTime: d.lastToggleTime || 0  // sent to client for grace-period matching
    }))
  };

  const hostPayload = {
    sessionId:               gameState.sessionId,
    active:                  gameState.active,
    timer:                   gameState.timer,
    gridSize:                GRID_SIZE,
    player:                  { x: gameState.player.x, y: gameState.player.y },
    monsters:                gameState.monsters.map(m => ({ id: m.id, x: m.x, y: m.y })),
    doors:                   gameState.doors,
    clues:                   gameState.clues,
    result:                  gameState.result,
    mazeHorizontalWalls,
    mazeVerticalWalls,
    decorativeDoorPositions: gameState.decorativeDoorPositions,
    qrCode:                  qrCodeBase64
  };

  nsPlayer.emit('playerState', playerPayload);
  nsHost.emit('hostState', hostPayload);
}

// ================================
// HOST NAMESPACE — authorized events (A2)
// ================================
nsHost.on('connection', (socket) => {
  console.log(`[Parent Labirin] Host connected: ${socket.id}`);
  broadcastState();

  socket.on('startNewGame', (callback) => {
    console.log(`[Parent Labirin] Host triggered startNewGame`);
    try {
      startNewSession();
      if (typeof callback === 'function') callback({ ok: true });
    } catch (err) {
      console.error('[Parent Labirin] Error saat startNewSession:', err);
      if (typeof callback === 'function') callback({ ok: false, error: err.message });
    }
  });

  // Host manually aborts/ends session forcedly
  socket.on('forceEndGame', (callback) => {
    if (gameState.active) {
      console.log(`[Parent Labirin] Host forced session end.`);
      try {
        endGame('aborted_by_host');
        if (typeof callback === 'function') callback({ ok: true });
      } catch (err) {
        console.error('[Parent Labirin] Error saat forceEndGame:', err);
        if (typeof callback === 'function') callback({ ok: false, error: err.message });
      }
    } else {
      if (typeof callback === 'function') callback({ ok: false, error: 'Tidak ada sesi permainan aktif yang bisa dihentikan.' });
    }
  });

  // Host triggers graceful server shutdown
  socket.on('server:shutdown', () => {
    console.log(`[Parent Labirin] Sinyal shutdown diterima dari Host Dashboard.`);
    gracefulShutdown('Host Action');
  });

  socket.on('disconnect', () => {
    console.log(`[Parent Labirin] Host disconnected: ${socket.id}`);
  });
});

// Graceful Shutdown Logic
let isShuttingDown = false;
function gracefulShutdown(source) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n[Parent Labirin] Memulai proses graceful shutdown (${source})...`);

  // Safety fallback timeout: Force exit after 5 seconds if hanging
  const safetyTimeout = setTimeout(() => {
    console.error('[Parent Labirin] Graceful shutdown timeout! Memaksa exit proses...');
    process.exit(1);
  }, 5000);
  safetyTimeout.unref();

  // a. Broadcast server:shuttingDown to all connected sockets on namespaces
  console.log('[Parent Labirin] Mengumumkan shutdown ke semua client...');
  nsPlayer.emit('server:shuttingDown');
  nsHost.emit('server:shuttingDown');

  // b. Disconnect all active sockets
  const playerSockets = Array.from(nsPlayer.sockets.values());
  const hostSockets = Array.from(nsHost.sockets.values());
  const totalSockets = playerSockets.length + hostSockets.length;
  console.log(`[Parent Labirin] Menutup ${totalSockets} koneksi socket aktif...`);

  playerSockets.forEach(s => s.disconnect(true));
  hostSockets.forEach(s => s.disconnect(true));

  // c. Clear all game intervals
  clearSessionIntervals();
  console.log('[Parent Labirin] Semua game interval/loop dihentikan.');

  // d. Close Socket.IO server
  io.close(() => {
    console.log('[Parent Labirin] Socket.IO server ditutup.');
  });

  // e. Close database connection
  try {
    db.close();
    console.log('[Parent Labirin] Koneksi database ditutup.');
  } catch (err) {
    console.error('[Parent Labirin] Gagal menutup database:', err);
  }

  // f. Close HTTP Server and wait for callback
  server.close((err) => {
    clearTimeout(safetyTimeout);
    if (err) {
      console.error('[Parent Labirin] Gagal menutup HTTP server:', err);
      process.exit(1);
    } else {
      console.log('[Parent Labirin] HTTP server ditutup, port dilepas.');
      console.log('[Parent Labirin] Proses server dihentikan sepenuhnya.');
      process.exit(0);
    }
  });
}

// Handle termination signals
process.on('SIGINT', () => gracefulShutdown('SIGINT / Ctrl+C'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// ================================
// PLAYER NAMESPACE — game events
// ================================
nsPlayer.on('connection', (socket) => {
  console.log(`[Parent Labirin] Player connected: ${socket.id}`);
  broadcastState();

  socket.on('movePlayer', (direction) => {
    if (!gameState.active) {
      socket.emit('moveRejected', { reason: 'game_inactive', serverPos: { x: gameState.player.x, y: gameState.player.y } });
      return;
    }

    const now = Date.now();
    if (now - gameState.player.lastMoveTimestamp < MOVE_COOLDOWN) {
      socket.emit('moveRejected', { reason: 'cooldown', serverPos: { x: gameState.player.x, y: gameState.player.y } });
      return;
    }
    gameState.player.lastMoveTimestamp = now;

    if (!['W', 'A', 'S', 'D'].includes(direction)) return;

    let nx = gameState.player.x;
    let ny = gameState.player.y;

    if (direction === 'W') ny -= 1;
    if (direction === 'S') ny += 1;
    if (direction === 'A') nx -= 1;
    if (direction === 'D') nx += 1;

    if (!isBlockedByWall(gameState.player.x, gameState.player.y, nx, ny)) {
      gameState.player.__prevX = gameState.player.x;
      gameState.player.__prevY = gameState.player.y;
      gameState.player.x = nx;
      gameState.player.y = ny;
      console.log(`[Parent Labirin] Player moved to (${nx}, ${ny})`);

      socket.emit('moveAccepted', { x: nx, y: ny });

      // Check if player stepped on an exit door
      const targetExit = gameState.doors.find(d => {
        if (d.side === 'top'    && d.x === nx && ny === -1)         return true;
        if (d.side === 'bottom' && d.x === nx && ny === GRID_SIZE)  return true;
        if (d.side === 'left'   && nx === -1   && d.y === ny)       return true;
        if (d.side === 'right'  && nx === GRID_SIZE && d.y === ny)  return true;
        return false;
      });

      // Check monster collision after moving
      gameState.monsters.forEach(m => {
        if (m.x === gameState.player.x && m.y === gameState.player.y) {
          endGame('lose_monster');
        }
      });

      if (targetExit && gameState.active) {
        if (targetExit.status === 'lolos') {
          endGame('win');
        } else {
          endGame('lose_zonk');
        }
      }

      broadcastState();
    } else {
      // Wall collision — tell client to snap back
      socket.emit('moveRejected', { reason: 'wall', serverPos: { x: gameState.player.x, y: gameState.player.y } });
    }
  });

  socket.on('disconnect', (reason) => {
    console.log(`[Parent Labirin] Player disconnected: ${socket.id} (Reason: ${reason})`);
    // No grace period, no abort — player can reconnect and continue instantly
  });
});

// ================================
// STARTUP
// ================================
validateMapPool();

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[Parent Labirin] ERROR: Port ${PORT} sudah dipakai proses lain.`);
    console.error(`[Parent Labirin] Set environment variable PORT ke nilai lain lalu coba lagi.`);
    console.error(`[Parent Labirin] Contoh: PORT=4000 npm run dev\n`);
    process.exit(1);
  } else {
    console.error(`[Parent Labirin] Server error:`, err);
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`[Parent Labirin] Server berjalan di port ${PORT}`);
  console.log(`[Parent Labirin] Dashboard Host dapat diakses di: ${HOST_URL}`);
});
