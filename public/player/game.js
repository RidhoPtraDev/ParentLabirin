// ================================
// POLYFILLS
// ================================
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
    return this;
  };
}

// ================================
// SOCKET & UI ELEMENTS
// A1: Connect to player-specific namespace — isolated from host data
// Session token: persisted in localStorage so the same device can reclaim
// control after a brief reconnect without being treated as a new spectator.
// ================================
(function() {
  let token = localStorage.getItem('parentLabirinToken');
  if (!token) {
    token = 'plr_' + Math.random().toString(36).slice(2) + '_' + Date.now().toString(36);
    localStorage.setItem('parentLabirinToken', token);
  }
  window._playerSessionToken = token;
})();

let socket = io('/ns-player', { auth: { token: window._playerSessionToken } });

const timerVal = document.getElementById('timer-val');
const phaseVal = document.getElementById('phase-val');
const waitingScreen = document.getElementById('waiting-screen');
const victoryPopup = document.getElementById('victory-popup');
const zonkPopup = document.getElementById('zonk-popup');
const timeoutPopup = document.getElementById('timeout-popup');
const monsterPopup = document.getElementById('monster-popup');

// ================================
// CANVAS SETUP (Responsive for 10x10 Grid)
// ================================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let GRID_SIZE = 10;
const TILE = 56;  // 56px per cell
const WALL_W = 12;  // wall thickness
const CANVAS_PAD = 70;  // padding around outer border for floating exit doors

function resizeCanvas() {
  const size = GRID_SIZE * TILE + WALL_W * 2 + CANVAS_PAD * 2;
  canvas.width = size;
  canvas.height = size;
}
resizeCanvas();

// ================================
// DYNAMIC MAZE WALLS (Received from server)
// ================================
let mazeHorizontalWalls = [];
let mazeVerticalWalls = [];

// ================================
// COLORS (White / Pink Theme)
// ================================
const COLORS = {
  floorBg: '#FFFFFF',
  tileFloor: '#F5F5F7',
  wallFill: '#F5D7E3',
  wallStroke: '#C2185B',
  playerGlow: 'rgba(194, 24, 91, 0.35)',
  monsterGlow: 'rgba(220, 38, 38, 0.35)'
};

// ================================
// ASSET IMAGES
// ================================
const images = {
  player:           new Image(),
  monsterRed:       new Image(),
  monsterPink:      new Image(),
  monsterRed2:      new Image(),      // monster-red2.png
  monsterWhiteHorn: new Image(),      // monster-white-horn.png
  monsterRainbow:   new Image(),      // monster-rainbow-puff.png
  monsterStar:      new Image(),      // monster-star.png
  monsterBlue:      new Image(),      // monster-blue.png
  doorPassage:      new Image(),
  doorExit:         new Image()
};

images.player.src           = 'assets/player.png';
images.monsterRed.src       = 'assets/monster-red.png';
images.monsterPink.src      = 'assets/monster-pink.png';
images.monsterRed2.src      = 'assets/monster-red2.png';
images.monsterWhiteHorn.src = 'assets/monster-white-horn.png';
images.monsterRainbow.src   = 'assets/monster-rainbow-puff.png';
images.monsterStar.src      = 'assets/monster-star.png';
images.monsterBlue.src      = 'assets/monster-blue.png';
images.doorPassage.src      = 'assets/door-style-1.png';
images.doorExit.src         = 'assets/door-style-1.png';

let assetsLoaded  = 0;
const totalAssets = 10;
let allAssetsReady = false;

function onImageLoad() {
  assetsLoaded++;
  if (assetsLoaded >= totalAssets) allAssetsReady = true;
}
images.player.onload           = onImageLoad;
images.monsterRed.onload       = onImageLoad;
images.monsterPink.onload      = onImageLoad;
images.monsterRed2.onload      = onImageLoad;
images.monsterWhiteHorn.onload = onImageLoad;
images.monsterRainbow.onload   = onImageLoad;
images.monsterStar.onload      = onImageLoad;
images.monsterBlue.onload      = onImageLoad;
images.doorPassage.onload      = onImageLoad;
images.doorExit.onload         = onImageLoad;

// ================================
// GAME STATE & SMOOTH ANIMATIONS
// ================================
let gameState = null;
let visualPlayer = null;
let visualMonsters = [];
let doorOpenProgress = {}; // independent animation per door key — value 0=fully closed/solid, 1=fully open/invisible
let playerFacingLeft = false;
let predictedPlayer = null; // client-side prediction target position
let confirmedPlayer = null; // client-side source of truth for movement base
let currentSessionId = null; // track active session for glitch-free new-game transitions

// feedback visual saat input ditolak cooldown
let inputBlockedFlash = 0; // timestamp saat terakhir input ditolak, 0 = tidak aktif
const INPUT_FLASH_DURATION = 220; // ms

// Player sprite shake state for wall/door collision feedback
let shakeUntil = 0; // timestamp when shake ends; 0 = no shake active
const SHAKE_DURATION = 280; // ms
const SHAKE_AMPLITUDE = 5;  // pixels

// Game ended state to prevent keys
let isGameEnded = false;

// Whether the server has shut down (prevents reconnect attempts)
let isServerShutdown = false;

// ================================
// DEBUG OVERLAY SYSTEM (Bagian 1)
// ================================
const debugMode = new URLSearchParams(window.location.search).get('debug') === '1';
let lastMoveSentTime = 0;
let lastMoveAckReceivedTime = 0;
let lastMoveLatency = 0;
let lastMoveStatus = 'none'; // 'accepted', 'rejected', 'none'
let lastMoveDetails = '';

// ================================
// BUG #5 — Helper terpadu untuk menentukan sisi pintu keluar
// ================================
function getDoorSide(door) {
  if (door.side) return door.side;
  if (door.y === 0) return 'top';
  if (door.y === GRID_SIZE - 1) return 'bottom';
  if (door.x === 0) return 'left';
  return 'right';
}

// ================================
// COORDINATE HELPERS
// ================================
function gridToPixel(gx, gy) {
  return {
    x: CANVAS_PAD + WALL_W + gx * TILE,
    y: CANVAS_PAD + WALL_W + gy * TILE
  };
}

function cellCenter(gx, gy) {
  const p = gridToPixel(gx, gy);
  return { x: p.x + TILE / 2, y: p.y + TILE / 2 };
}

// ================================
// MAZE DRAWING
// ================================
function drawMaze(state) {
  ctx.fillStyle = COLORS.floorBg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const p = gridToPixel(c, r);
      ctx.fillStyle = COLORS.tileFloor;
      ctx.beginPath();
      ctx.roundRect(p.x + 2, p.y + 2, TILE - 4, TILE - 4, 4);
      ctx.fill();
    }
  }

  // drawInternalDoors(state); — dihapus: door-style-1.png sekarang HANYA
  // dipakai untuk pintu keluar (drawExitDoorsOutside), tidak lagi disebar
  // sebagai dekorasi jalur dalam grid (permintaan: hilangkan clutter visual).
  drawWalls(state);

  if (state) drawExitDoorsOutside(state.doors);
}

// drawClueCells removed — positions are server-secret, never sent to player payload

function drawWalls(state) {
  ctx.fillStyle = COLORS.wallFill;
  ctx.strokeStyle = COLORS.wallStroke;
  ctx.lineWidth = 2;

  if (mazeHorizontalWalls.length > 0) {
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE - 1; c++) {
        if (mazeHorizontalWalls[r][c]) {
          const p = gridToPixel(c + 1, r);
          const x = p.x - WALL_W / 2;
          const y = p.y;
          ctx.beginPath();
          ctx.rect(x, y, WALL_W, TILE);
          ctx.fill();
          ctx.stroke();
        }
      }
    }
  }

  if (mazeVerticalWalls.length > 0) {
    for (let r = 0; r < GRID_SIZE - 1; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (mazeVerticalWalls[r][c]) {
          const p = gridToPixel(c, r + 1);
          const x = p.x;
          const y = p.y - WALL_W / 2;
          ctx.beginPath();
          ctx.rect(x, y, TILE, WALL_W);
          ctx.fill();
          ctx.stroke();
        }
      }
    }
  }

  drawOuterBorderWithGaps(state ? state.doors : []);
}

function drawOuterBorderWithGaps(doors) {
  ctx.fillStyle = COLORS.wallFill;
  ctx.strokeStyle = COLORS.wallStroke;
  ctx.lineWidth = 2;

  const totalSize = GRID_SIZE * TILE + WALL_W * 2;
  const ox = CANVAS_PAD;
  const oy = CANVAS_PAD;

  const exitGaps = { top: [], bottom: [], left: [], right: [] };
  doors.forEach(d => {
    const side = getDoorSide(d);
    exitGaps[side].push(side === 'top' || side === 'bottom' ? d.x : d.y);
  });

  for (let c = 0; c < GRID_SIZE; c++) {
    if (!exitGaps.top.includes(c)) {
      const p = gridToPixel(c, 0);
      const x0 = c === 0 ? ox : p.x;
      const x1 = c === GRID_SIZE - 1 ? ox + totalSize : p.x + TILE;
      ctx.beginPath();
      ctx.rect(x0, oy, x1 - x0, WALL_W);
      ctx.fill(); ctx.stroke();
    }
  }

  for (let c = 0; c < GRID_SIZE; c++) {
    if (!exitGaps.bottom.includes(c)) {
      const p = gridToPixel(c, GRID_SIZE - 1);
      const x0 = c === 0 ? ox : p.x;
      const x1 = c === GRID_SIZE - 1 ? ox + totalSize : p.x + TILE;
      ctx.beginPath();
      ctx.rect(x0, oy + totalSize - WALL_W, x1 - x0, WALL_W);
      ctx.fill(); ctx.stroke();
    }
  }

  for (let r = 0; r < GRID_SIZE; r++) {
    if (!exitGaps.left.includes(r)) {
      const p = gridToPixel(0, r);
      const y0 = r === 0 ? oy : p.y;
      const y1 = r === GRID_SIZE - 1 ? oy + totalSize : p.y + TILE;
      ctx.beginPath();
      ctx.rect(ox, y0, WALL_W, y1 - y0);
      ctx.fill(); ctx.stroke();
    }
  }

  for (let r = 0; r < GRID_SIZE; r++) {
    if (!exitGaps.right.includes(r)) {
      const p = gridToPixel(GRID_SIZE - 1, r);
      const y0 = r === 0 ? oy : p.y;
      const y1 = r === GRID_SIZE - 1 ? oy + totalSize : p.y + TILE;
      ctx.beginPath();
      ctx.rect(ox + totalSize - WALL_W, y0, WALL_W, y1 - y0);
      ctx.fill(); ctx.stroke();
    }
  }
}

// Door visual glow threshold — doors only show the red glow when they are
// visually solid (alpha >= DOOR_BLOCK_THRESHOLD). Collision decisions use
// the authoritative d.blocked flag directly (see isDecorativeDoorBlockedClient).
const DOOR_BLOCK_THRESHOLD = 0.45; // alpha >= this means door is visually present

function drawInternalDoors(state) {
  if (!state || !allAssetsReady || !state.decorativeDoorPositions) return;

  state.decorativeDoorPositions.forEach(door => {
    const key = `${door.x1},${door.y1}-${door.x2},${door.y2}`;

    // Cosmetic approach animation: door opens (progress = 1) if player or monster is on either side.
    const isPlayerNear = state.player && (
      (state.player.x === door.x1 && state.player.y === door.y1) ||
      (state.player.x === door.x2 && state.player.y === door.y2)
    );
    const isMonsterNear = state.monsters && state.monsters.some(m =>
      (m.x === door.x1 && m.y === door.y1) ||
      (m.x === door.x2 && m.y === door.y2)
    );
    const targetProgress = (isPlayerNear || isMonsterNear) ? 1 : 0;

    if (doorOpenProgress[key] === undefined) {
      doorOpenProgress[key] = targetProgress;
    }

    // Lerp open/close smoothly
    doorOpenProgress[key] = lerp(doorOpenProgress[key], targetProgress, 0.35);

    const progress = doorOpenProgress[key];
    const alpha = 1 - progress; // 1 = fully visible, 0 = invisible (open)

    if (alpha > 0.02) {
      ctx.save();
      ctx.globalAlpha = alpha;

      const p = (door.type === 'H')
        ? gridToPixel(door.x2, door.y1)
        : gridToPixel(door.x1, door.y2);

      const cx = (door.type === 'H') ? p.x : p.x + TILE / 2;
      const cy = (door.type === 'H') ? p.y + TILE / 2 : p.y;

      if (door.type === 'H') {
        const dw = WALL_W * 1.6;
        const dh = TILE * 0.8;
        ctx.drawImage(images.doorPassage, cx - dw / 2, cy - dh / 2, dw, dh);
      } else {
        const dw = WALL_W * 1.6;
        const dh = TILE * 0.8;
        ctx.translate(cx, cy);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(images.doorPassage, -dw / 2, -dh / 2, dw, dh);
      }

      ctx.restore();
    }
  });
}

function drawExitDoorsOutside(doors) {
  if (!doors || !allAssetsReady) return;

  const totalSize = GRID_SIZE * TILE + WALL_W * 2;
  const ox = CANVAS_PAD;
  const oy = CANVAS_PAD;

  doors.forEach(door => {
    const side = getDoorSide(door);

    const cellPx = gridToPixel(door.x, door.y);
    const cellCx = cellPx.x + TILE / 2;
    const cellCy = cellPx.y + TILE / 2;

    const dw = TILE * 0.75;
    const dh = TILE * 0.75;

    let dx, dy;

    if (side === 'top') {
      dx = cellCx;
      dy = oy - dh / 2 - 6;
    } else if (side === 'bottom') {
      dx = cellCx;
      dy = oy + totalSize + dh / 2 + 6;
    } else if (side === 'left') {
      dx = ox - dw / 2 - 6;
      dy = cellCy;
    } else {
      dx = ox + totalSize + dw / 2 + 6;
      dy = cellCy;
    }

    ctx.save();
    ctx.shadowColor = '#C2185B';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 4;

    ctx.fillStyle = '#F8BBD0';
    ctx.strokeStyle = '#C2185B';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(dx - dw / 2 - 4, dy - dh / 2 - 4, dw + 8, dh + 8, 12);
    ctx.fill();
    ctx.stroke();

    ctx.drawImage(images.doorExit, dx - dw / 2, dy - dh / 2, dw, dh);

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 15px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#880E4F';
    ctx.lineWidth = 3;
    ctx.strokeText(door.label, dx, dy);
    ctx.fillText(door.label, dx, dy);

    ctx.restore();
  });
}

// ================================
// SPRITE DRAWING
// ================================
function drawSprites(state) {
  if (!state || !allAssetsReady) return;

  const now = Date.now();

  // ── Border flash when input blocked by cooldown
  if (inputBlockedFlash > 0 && now - inputBlockedFlash < INPUT_FLASH_DURATION) {
    const flashProgress = (now - inputBlockedFlash) / INPUT_FLASH_DURATION;
    const flashAlpha = 0.60 * (1 - flashProgress); // stronger than before
    ctx.save();
    ctx.save();
    ctx.globalAlpha = flashAlpha;
    ctx.strokeStyle = '#DC2626';
    ctx.lineWidth = 10;
    ctx.beginPath();
    const totalSize = GRID_SIZE * TILE + WALL_W * 2;
    ctx.roundRect(CANVAS_PAD, CANVAS_PAD, totalSize, totalSize, 4);
    ctx.stroke();
    ctx.restore();
  } else if (inputBlockedFlash > 0 && now - inputBlockedFlash >= INPUT_FLASH_DURATION) {
    inputBlockedFlash = 0;
  }

  if (visualPlayer) {
    const pad = TILE * 0.12;
    const sz = TILE - pad * 2;

    // ── Shake offset for wall collision feedback
    let shakeOffsetX = 0;
    let shakeOffsetY = 0;
    if (shakeUntil > 0 && now < shakeUntil) {
      const t = (shakeUntil - now) / SHAKE_DURATION;
      shakeOffsetX = Math.sin(now * 0.08) * SHAKE_AMPLITUDE * t;
      shakeOffsetY = Math.cos(now * 0.11) * SHAKE_AMPLITUDE * 0.5 * t;
    } else if (shakeUntil > 0 && now >= shakeUntil) {
      shakeUntil = 0;
    }

    ctx.save();
    ctx.shadowColor = COLORS.playerGlow;
    ctx.shadowBlur = 14;

    if (playerFacingLeft) {
      // FIX: pivot flip tepat di titik tengah sprite (visualPlayer.x), bukan
      // di titik sembarang + padding — sebelumnya ini menggeser sprite
      // sejauh ~(sz + 2*pad) piksel ke kanan dari posisi logika sebenarnya
      // setiap kali menghadap kiri, membuat karakter terlihat "berpindah
      // posisi" hanya karena ganti arah.
      ctx.translate(visualPlayer.x + shakeOffsetX, visualPlayer.y - sz / 2 + shakeOffsetY);
      ctx.scale(-1, 1);
      ctx.drawImage(images.player, -sz / 2, 0, sz, sz);
    } else {
      ctx.drawImage(images.player, visualPlayer.x - sz / 2 + shakeOffsetX, visualPlayer.y - sz / 2 + shakeOffsetY, sz, sz);
    }
    ctx.restore();
  }

  state.monsters.forEach((mon, idx) => {
    if (!visualMonsters[idx]) return;

    const pad = TILE * 0.12;
    const sz  = TILE - pad * 2;

    // Monster image assignment by index (7 monsters total):
    // 0=red, 1=pink, 2=red2, 3=white-horn, 4=rainbow-puff, 5=star, 6=blue
    const monsterImages = [
      images.monsterRed,
      images.monsterPink,
      images.monsterRed2,
      images.monsterWhiteHorn,
      images.monsterRainbow,
      images.monsterStar,
      images.monsterBlue
    ];
    const img = monsterImages[idx % monsterImages.length];

    const pos = visualMonsters[idx];

    ctx.save();
    ctx.shadowColor = COLORS.monsterGlow;
    ctx.shadowBlur  = 14;
    ctx.drawImage(img, pos.x - sz / 2, pos.y - sz / 2, sz, sz);
    ctx.restore();
  });

  if (isGameEnded) {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    const totalSize = GRID_SIZE * TILE + WALL_W * 2;
    ctx.fillRect(CANVAS_PAD, CANVAS_PAD, totalSize, totalSize);
    ctx.restore();
  }
}

// ================================
// SMOOTH ANIMATION
// ================================
function lerp(a, b, t) {
  return a + (b - a) * t;
}

const PLAYER_LERP = 0.55;
const MONSTER_LERP = 0.22;
const ARRIVAL_EPSILON = 3;
const SNAP_DISTANCE = TILE * 1.5;

function updateVisualPositions(state) {
  if (!state) return;

  const targetX = predictedPlayer ? predictedPlayer.x : state.player.x;
  const targetY = predictedPlayer ? predictedPlayer.y : state.player.y;
  const target = cellCenter(targetX, targetY);

  if (!visualPlayer) {
    visualPlayer = { x: target.x, y: target.y };
  } else {
    if (target.x < visualPlayer.x) playerFacingLeft = true;
    if (target.x > visualPlayer.x) playerFacingLeft = false;

    const distX = target.x - visualPlayer.x;
    const distY = target.y - visualPlayer.y;
    const dist = Math.sqrt(distX * distX + distY * distY);

    if (dist > SNAP_DISTANCE) {
      visualPlayer.x = target.x;
      visualPlayer.y = target.y;
    } else {
      visualPlayer.x = lerp(visualPlayer.x, target.x, PLAYER_LERP);
      visualPlayer.y = lerp(visualPlayer.y, target.y, PLAYER_LERP);
    }
  }

  state.monsters.forEach((mon, idx) => {
    const mt = cellCenter(mon.x, mon.y);
    if (!visualMonsters[idx]) {
      visualMonsters[idx] = { x: mt.x, y: mt.y };
    } else {
      visualMonsters[idx].x = lerp(visualMonsters[idx].x, mt.x, MONSTER_LERP);
      visualMonsters[idx].y = lerp(visualMonsters[idx].y, mt.y, MONSTER_LERP);
    }
  });
}

function playerHasVisuallyArrived(state) {
  if (!state || !visualPlayer) return true;
  const targetX = predictedPlayer ? predictedPlayer.x : state.player.x;
  const targetY = predictedPlayer ? predictedPlayer.y : state.player.y;
  const target = cellCenter(targetX, targetY);
  const dx = target.x - visualPlayer.x;
  const dy = target.y - visualPlayer.y;
  return Math.sqrt(dx * dx + dy * dy) <= ARRIVAL_EPSILON;
}

// ================================
// MAIN RENDER LOOP
// ================================
let pendingResult = null;
let pendingResultSince = 0;
const PENDING_RESULT_MAX_WAIT = 350;

function render() {
  requestAnimationFrame(render);

  drawMaze(gameState);
  if (gameState) {
    updateVisualPositions(gameState);
    drawSprites(gameState);
  }

  if (pendingResult) {
    const arrived = playerHasVisuallyArrived(lastActiveState);
    const waitedTooLong = (Date.now() - pendingResultSince) > PENDING_RESULT_MAX_WAIT;
    if (arrived || waitedTooLong) {
      showPopup(pendingResult);
      pendingResult = null;
    }
  }

  // Draw debug overlay if active
  if (debugMode) drawDebugOverlay();
}

function drawDebugOverlay() {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.strokeStyle = '#00FF00';
  ctx.lineWidth = 2;
  
  const width = 310;
  const height = 190;
  const x = 10;
  const y = 10;
  
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 8);
  ctx.fill();
  ctx.stroke();
  
  ctx.fillStyle = '#00FF00';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'left';
  
  let drawY = y + 20;
  ctx.fillText('=== DEBUG OVERLAY (Parent Labirin) ===', x + 10, drawY);
  
  ctx.fillStyle = '#FFFFFF';
  drawY += 20;
  ctx.fillText(`Confirmed Player : x: ${confirmedPlayer ? confirmedPlayer.x : '-'}, y: ${confirmedPlayer ? confirmedPlayer.y : '-'}`, x + 10, drawY);
  
  drawY += 15;
  ctx.fillText(`Predicted Player : x: ${predictedPlayer ? predictedPlayer.x : '-'}, y: ${predictedPlayer ? predictedPlayer.y : '-'}`, x + 10, drawY);
  
  drawY += 15;
  ctx.fillText(`Server Player    : x: ${gameState && gameState.player ? gameState.player.x : '-'}, y: ${gameState && gameState.player ? gameState.player.y : '-'}`, x + 10, drawY);
  
  drawY += 20;
  ctx.fillText(`Last Event Status: ${lastMoveStatus.toUpperCase()}`, x + 10, drawY);
  
  drawY += 15;
  ctx.fillText(`Last Latency     : ${lastMoveLatency} ms`, x + 10, drawY);
  
  drawY += 15;
  ctx.fillText(`Last Msg Info    : ${lastMoveDetails || '-'}`, x + 10, drawY);

  // Show decorative door count (all purely cosmetic now)
  drawY += 20;
  const decoDoorCount = (gameState && gameState.decorativeDoorPositions) ? gameState.decorativeDoorPositions.length : 0;
  ctx.fillText(`Deco Doors       : ${decoDoorCount} (purely cosmetic)`, x + 10, drawY);
  
  ctx.restore();
}

// ================================
// SOCKET EVENTS
// ================================
let lastActiveState = null;

socket.on('playerState', (state) => {
  if (state.gridSize && state.gridSize !== GRID_SIZE) {
    GRID_SIZE = state.gridSize;
    resizeCanvas();
  }

  if (state.mazeHorizontalWalls) mazeHorizontalWalls = state.mazeHorizontalWalls;
  if (state.mazeVerticalWalls)   mazeVerticalWalls   = state.mazeVerticalWalls;

  // ── Detect new session: if sessionId changed, reset all visual state immediately
  // so previous session's door progress / player positions don't bleed into the new game.
  if (state.active && state.sessionId && state.sessionId !== currentSessionId) {
    currentSessionId = state.sessionId;
    doorOpenProgress = {};      // Clear per-door lerp state for the new maze layout
    visualPlayer = null;    // Force snap to new spawn position on next frame
    visualMonsters = [];
    predictedPlayer = null;
    confirmedPlayer = null;
    pendingMoves = [];      // Clear prediction queue
    pendingResult = null;
    pendingResultSince = 0;
    inputBlockedFlash = 0;
    shakeUntil = 0;
    isGameEnded = false;

    // Automatically hide any active popups and show game canvas when a new game starts
    victoryPopup.classList.remove('active');
    zonkPopup.classList.remove('active');
    monsterPopup.classList.remove('active');
    timeoutPopup.classList.remove('active');
    waitingScreen.classList.remove('active');

    console.log(`[Parent Labirin] Sesi baru terdeteksi: ${state.sessionId} — semua state visual direset.`);
  }

  if (!state.active) {
    predictedPlayer = null;
    if (state.player) lastActiveState = { ...(lastActiveState || state), ...state };

    if (state.result) {
      if (pendingResult !== state.result) {
        pendingResult = state.result;
        pendingResultSince = Date.now();
      }
    } else {
      waitingScreen.classList.add('active');
    }
    return;
  }

  waitingScreen.classList.remove('active');

  const mins = Math.floor(state.timer / 60);
  const secs = state.timer % 60;
  timerVal.textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

  const rad = state.detectionRadius;
  phaseVal.textContent =
    rad === 2 ? 'Awal (2 Grid)' :
    rad === 4 ? 'Tengah (4 Grid)' :
                'Bahaya (6 Grid)';

  gameState = state;
  lastActiveState = state;

  // Keep confirmedPlayer and predictedPlayer in sync with server state updates
  if (!confirmedPlayer) {
    confirmedPlayer = { x: state.player.x, y: state.player.y };
  }
  
  if (!predictedPlayer) {
    predictedPlayer = { x: state.player.x, y: state.player.y };
  } else {
    const now = Date.now();
    // Reconcile prediction with server: snap immediately if we haven't moved within the client-side cooldown window
    if (now - lastMoveTime >= MOVE_COOLDOWN) {
      predictedPlayer.x = state.player.x;
      predictedPlayer.y = state.player.y;
      confirmedPlayer.x = state.player.x;
      confirmedPlayer.y = state.player.y;
      pendingMoves = []; // clear prediction queue when idle
    }
  }
});

// spectatorOnly event is no longer sent by server (controller lock removed)

// A1/A3: Handle game:ended event from server
socket.on('game:ended', (data) => {
  console.log(`[Parent Labirin] Game ended. Result: ${data.result}. Reason: ${data.reason}`);
  isGameEnded = true; // stops keyboard input

  // Directly show popup without waiting LERP just in case
  showPopup(data.result);

  // NOTE: socket.disconnect() is NOT called here.
  // socket.io auto-reconnect must remain active so the player receives the next
  // playerState immediately when the host starts a new game — no page refresh needed.
});

// Auto-reconnect: when socket reconnects (after server-side force-disconnect
// at game end), immediately request fresh state and reset for new game.
socket.on('connect', () => {
  console.log('[Parent Labirin] Socket (re)connected.');
  // If we were in a finished game state, reset UI so we can play again
  // when the host starts a new session.
  if (isGameEnded && !isServerShutdown) {
    console.log('[Parent Labirin] Was in ended state — hiding popups and showing waiting screen.');
    victoryPopup.classList.remove('active');
    zonkPopup.classList.remove('active');
    monsterPopup.classList.remove('active');
    timeoutPopup.classList.remove('active');
    waitingScreen.classList.add('active');
    isGameEnded = false;
    confirmedPlayer = null;
    predictedPlayer = null;
    pendingMoves = [];
  }
});

// Handle server shutting down announcement
socket.on('server:shuttingDown', () => {
  isGameEnded = true;
  isServerShutdown = true;

  // Hide all other overlays first
  victoryPopup.classList.remove('active');
  zonkPopup.classList.remove('active');
  monsterPopup.classList.remove('active');
  waitingScreen.classList.remove('active');

  // Show timeout popup with server shutdown message
  timeoutPopup.querySelector('h2').textContent = 'Server Nonaktif';
  timeoutPopup.querySelector('p').textContent = 'Sesi dihentikan oleh Host (Server dimatikan).';
  timeoutPopup.classList.add('active');
  socket.disconnect();
});

// A2: Handle move confirmation from server
socket.on('moveAccepted', (data) => {
  if (data) {
    confirmedPlayer = { x: data.x, y: data.y };

    // Remove the acknowledged move from our local prediction queue
    const idx = pendingMoves.findIndex(m => m.x === data.x && m.y === data.y);
    if (idx !== -1) {
      pendingMoves = pendingMoves.slice(idx + 1);
    } else {
      pendingMoves = [];
    }

    // Reapply remaining predicted moves from the confirmed authorative base
    if (pendingMoves.length > 0) {
      predictedPlayer = { x: pendingMoves[pendingMoves.length - 1].x, y: pendingMoves[pendingMoves.length - 1].y };
    } else {
      predictedPlayer = { x: data.x, y: data.y };
    }

    lastMoveAckReceivedTime = Date.now();
    lastMoveLatency = lastMoveAckReceivedTime - lastMoveSentTime;
    lastMoveStatus = 'accepted';
    lastMoveDetails = `Success to (${data.x}, ${data.y})`;
    if (debugMode) {
      console.log(`[Parent Labirin] moveAccepted: Latency = ${lastMoveLatency}ms, Pos = (${data.x}, ${data.y})`);
    }
  }
});

// A2: Handle move rejection from server — snap predicted position back to authoritative state
socket.on('moveRejected', (data) => {
  if (data && data.serverPos) {
    confirmedPlayer = { x: data.serverPos.x, y: data.serverPos.y };
    predictedPlayer = { x: data.serverPos.x, y: data.serverPos.y };
    pendingMoves = []; // discard prediction queue on reject
    lastMoveAckReceivedTime = Date.now();
    lastMoveLatency = lastMoveAckReceivedTime - lastMoveSentTime;
    lastMoveStatus = 'rejected';
    lastMoveDetails = `Rejected: ${data.reason}`;
    // Trigger shake + border flash for user-visible feedback
    inputBlockedFlash = Date.now();
    shakeUntil = Date.now() + SHAKE_DURATION;
    if (debugMode) {
      console.log(`[Parent Labirin] moveRejected: Reason = ${data.reason}, Latency = ${lastMoveLatency}ms, snapped to (${data.serverPos.x}, ${data.serverPos.y})`);
    }
  }
});

// ================================
// CLIENT-SIDE PREDICTION QUEUE
// ================================
let pendingMoves = []; // array of { x, y }

// ================================
// COLLISION & WALL CHECKS FOR CLIENT-SIDE PREDICTION
// ================================
function isBlockedByWallClient(x1, y1, x2, y2) {
  // Allow stepping outside onto the exit doors
  if (gameState && gameState.doors) {
    const isExitTop = (y2 === -1 && x1 === x2 && gameState.doors.some(d => d.x === x1 && d.y === 0 && getDoorSide(d) === 'top'));
    const isExitBottom = (y2 === GRID_SIZE && x1 === x2 && gameState.doors.some(d => d.x === x1 && d.y === GRID_SIZE - 1 && getDoorSide(d) === 'bottom'));
    const isExitLeft = (x2 === -1 && y1 === y2 && gameState.doors.some(d => d.x === 0 && d.y === y1 && getDoorSide(d) === 'left'));
    const isExitRight = (x2 === GRID_SIZE && y1 === y2 && gameState.doors.some(d => d.x === GRID_SIZE - 1 && d.y === y1 && getDoorSide(d) === 'right'));
    
    if (isExitTop || isExitBottom || isExitLeft || isExitRight) {
      return false; // Allowed!
    }
  }

  if (x2 < 0 || x2 >= GRID_SIZE || y2 < 0 || y2 >= GRID_SIZE) return true;

  if (x1 === x2) {
    const minY = Math.min(y1, y2);
    if (minY < 0 || minY >= GRID_SIZE - 1) return true;
    return mazeVerticalWalls[minY] ? mazeVerticalWalls[minY][x1] : true;
  } else if (y1 === y2) {
    const minX = Math.min(x1, x2);
    if (minX < 0 || minX >= GRID_SIZE - 1) return true;
    return mazeHorizontalWalls[y1] ? mazeHorizontalWalls[y1][minX] : true;
  }
  return true;
}

function isDecorativeDoorBlockedClient(x1, y1, x2, y2) {
  // Door blocking mechanic has been removed. All doors are purely cosmetic/dekoratif.
  return false;
}

// ================================
// KEYBOARD CONTROLS (WASD)
// ================================
let lastMoveTime = 0;
const MOVE_COOLDOWN = 220; // 220ms client-side, server uses 200ms

window.addEventListener('keydown', (e) => {
  if (isGameEnded) return; // Prevent movement when game is ended

  const now = Date.now();
  const key = e.key.toUpperCase();

  if (!['W', 'A', 'S', 'D'].includes(key)) return;
  e.preventDefault();

  if (now - lastMoveTime < MOVE_COOLDOWN) {
    // Client-side cooldown block: flash + shake for consistent feedback
    inputBlockedFlash = now;
    shakeUntil = now + SHAKE_DURATION;
    return;
  }

  // Initialize confirmedPlayer and predictedPlayer if not already done
  if (gameState && gameState.player) {
    if (!confirmedPlayer) {
      confirmedPlayer = { x: gameState.player.x, y: gameState.player.y };
    }
    if (!predictedPlayer) {
      predictedPlayer = { x: gameState.player.x, y: gameState.player.y };
    }
  }

  const basePos = predictedPlayer || confirmedPlayer;

  if (basePos) {
    let nx = basePos.x;
    let ny = basePos.y;

    if (key === 'W') ny -= 1;
    if (key === 'S') ny += 1;
    if (key === 'A') nx -= 1;
    if (key === 'D') nx += 1;

    // Check collision locally starting from the predicted/safe position
    if (!isBlockedByWallClient(basePos.x, basePos.y, nx, ny) &&
        !isDecorativeDoorBlockedClient(basePos.x, basePos.y, nx, ny)) {
      predictedPlayer = { x: nx, y: ny }; // update target prediction for immediate animation
      pendingMoves.push({ x: nx, y: ny });
      lastMoveSentTime = Date.now();
      socket.emit('movePlayer', key);
      lastMoveTime = now;
      if (debugMode) {
        console.log(`[Parent Labirin] movePlayer sent: direction = ${key}, basePos = (${basePos.x}, ${basePos.y}), nx = ${nx}, ny = ${ny}`);
      }
    } else {
      // Local wall/door hit — show feedback immediately
      inputBlockedFlash = now;
      shakeUntil = now + SHAKE_DURATION;
      if (debugMode) {
        console.log(`[Parent Labirin] Input blocked locally: wall/door collision at (${nx}, ${ny})`);
      }
    }
  }
});

// ================================
// POPUPS
// ================================
function showPopup(result) {
  victoryPopup.classList.remove('active');
  zonkPopup.classList.remove('active');
  timeoutPopup.classList.remove('active');
  monsterPopup.classList.remove('active');
  waitingScreen.classList.remove('active');

  if (result === 'win') {
    victoryPopup.classList.add('active');
  } else if (result === 'lose_zonk') {
    zonkPopup.classList.add('active');
  } else if (result === 'lose_timeout') {
    // Restore default texts before showing
    timeoutPopup.querySelector('h2').textContent = 'Waktu habis!';
    timeoutPopup.querySelector('p').textContent = 'Anda gagal melarikan diri sebelum waktu habis.';
    timeoutPopup.classList.add('active');
  } else if (result === 'lose_monster') {
    monsterPopup.classList.add('active');
  } else if (result === 'aborted_by_host') {
    timeoutPopup.querySelector('h2').textContent = 'Permainan Dihentikan';
    timeoutPopup.querySelector('p').textContent = 'Host telah menghentikan permainan secara paksa.';
    timeoutPopup.classList.add('active');
  }
}

function dismissPopup() {
  // Don't allow dismiss if server is shut down (socket cannot reconnect)
  if (isServerShutdown) return;

  victoryPopup.classList.remove('active');
  zonkPopup.classList.remove('active');
  monsterPopup.classList.remove('active');
  waitingScreen.classList.add('active');

  // Always restore timeout popup defaults before hiding
  timeoutPopup.querySelector('h2').textContent = 'Waktu habis!';
  timeoutPopup.querySelector('p').textContent = 'Anda gagal melarikan diri sebelum waktu habis.';
  timeoutPopup.classList.remove('active');

  gameState = null;
  visualPlayer = null;
  visualMonsters = [];
  predictedPlayer = null;
  confirmedPlayer = null;
  doorOpenProgress = {};
  pendingResult = null;
  pendingResultSince = 0;
  lastActiveState = null;

  inputBlockedFlash = 0;
  shakeUntil = 0;
  isGameEnded = false;

  // Attempt to reconnect if disconnected (only if server is still up)
  if (socket && socket.disconnected) {
    console.log('[Parent Labirin] Reconnecting socket for a new session...');
    socket.connect();
  }
}

// ================================
// START
// ================================
render();
