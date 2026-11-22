// The game's rules and state, with no drawing and no browser in it: the
// courier, the guards, the documents, the exit, lives, score and time.
// step() advances one fixed step and returns what happened as bit flags, so
// the caller can react without the world knowing about screens or sound.
import { FIELD, LIVES, PLAYER, POINTS } from './config.js';
import { LEVELS, tileAt, tileCentre, tileIsShadow } from './levels.js';
import { moveCircle } from './physics.js';
import { createGuard, stepGuard, STATE_CHASE } from './guards.js';

export const EVENT_DOC = 1;
export const EVENT_ALARM = 2;
export const EVENT_CAUGHT = 4;
export const EVENT_LEVEL = 8;
export const EVENT_WIN = 16;
export const EVENT_SPOTTED = 32;

function findTiles(level, letter) {
  const found = [];
  level.map.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      if (ch === letter) found.push(tileCentre(c, r));
    });
  });
  return found;
}

export function createWorld(random) {
  const state = {
    levelIndex: 0,
    level: LEVELS[0],
    player: { x: 0, y: 0, angle: 0, crouching: false, moving: false, inShadow: false },
    guards: [],
    documents: [],
    // Vault floors add two pickups: keycards the exit needs, and coins
    // worth a detour. A level with no keycard opens its exit on documents
    // alone, exactly as before.
    keycards: [],
    coins: [],
    exit: { x: 0, y: 0, open: false },
    score: 0,
    lives: LIVES,
    time: 0,
    docsTaken: 0,
    docsTotal: 0,
    keysTaken: 0,
    keysTotal: 0,
    coinsTaken: 0,
    detection: 0,
    alarm: false,
    ghost: true,
    caughtFlash: 0,
  };

  function loadLevel(index) {
    const level = LEVELS[index];
    state.levelIndex = index;
    state.level = level;
    const start = findTiles(level, 'P')[0];
    state.player.x = start.x;
    state.player.y = start.y;
    state.player.angle = 0;
    state.player.crouching = false;
    state.guards = level.guards.map((def) => createGuard(def));
    state.documents = findTiles(level, 'D').map((p) => ({ x: p.x, y: p.y, taken: false }));
    state.keycards = findTiles(level, 'K').map((p) => ({ x: p.x, y: p.y, taken: false }));
    state.coins = findTiles(level, 'o').map((p) => ({ x: p.x, y: p.y, taken: false }));
    const exit = findTiles(level, 'E')[0];
    state.exit = { x: exit.x, y: exit.y, open: false };
    state.docsTaken = 0;
    state.docsTotal = state.documents.length;
    state.keysTaken = 0;
    state.keysTotal = state.keycards.length;
    state.coinsTaken = 0;
    state.detection = 0;
    state.alarm = false;
    state.time = 0;
    state.caughtFlash = 0;
  }

  function reset() {
    state.score = 0;
    state.lives = LIVES;
    state.ghost = true;
    loadLevel(0);
  }

  function restartLevel() {
    const keepScore = state.score;
    const keepLives = state.lives;
    loadLevel(state.levelIndex);
    state.score = keepScore;
    state.lives = keepLives;
  }

  /**
   * One fixed step. `move` is a -1..1 x/y direction (keyboard or a
   * click-to-move target); `crouch` holds Shift. With `harmless` set (the
   * title screen's backdrop) the guards patrol but nobody is caught.
   */
  function step(dt, move, crouch, harmless) {
    let events = 0;
    state.time += dt;
    if (state.caughtFlash > 0) state.caughtFlash = Math.max(0, state.caughtFlash - dt);

    const player = state.player;
    const speed = crouch ? PLAYER.crouchSpeed : PLAYER.walkSpeed;
    const len = Math.hypot(move.x, move.y);
    player.crouching = crouch;
    player.moving = len > 0.01;
    if (player.moving) {
      const nx = (move.x / (len || 1)) * speed * dt;
      const ny = (move.y / (len || 1)) * speed * dt;
      const next = moveCircle(player, nx, ny, PLAYER.radius, state.level);
      player.x = next.x;
      player.y = next.y;
      player.angle = Math.atan2(move.y, move.x);
    }
    player.x = Math.min(FIELD.width - PLAYER.radius, Math.max(PLAYER.radius, player.x));
    player.y = Math.min(FIELD.height - PLAYER.radius, Math.max(PLAYER.radius, player.y));
    const tile = tileAt(state.level, Math.floor(player.x / 80), Math.floor(player.y / 80));
    player.inShadow = tileIsShadow(tile);

    let spotted = false;
    for (const guard of state.guards) {
      if (stepGuard(guard, player, state.level, state.time)) {
        events |= EVENT_ALARM;
        state.alarm = true;
        state.ghost = false;
      }
      if (guard.detection > 0.35) spotted = true;
      if (guard.state === STATE_CHASE) state.alarm = true;
    }
    if (spotted) events |= EVENT_SPOTTED;
    state.detection = state.guards.reduce((m, g) => Math.max(m, g.detection), 0);
    if (state.guards.every((g) => g.state !== STATE_CHASE)) state.alarm = false;

    if (!harmless) {
      for (const doc of state.documents) {
        if (!doc.taken && Math.hypot(doc.x - player.x, doc.y - player.y) < 32) {
          doc.taken = true;
          state.docsTaken += 1;
          state.score += POINTS.document;
          events |= EVENT_DOC;
        }
      }
      for (const key of state.keycards) {
        if (!key.taken && Math.hypot(key.x - player.x, key.y - player.y) < 32) {
          key.taken = true;
          state.keysTaken += 1;
          state.score += POINTS.keycard;
          events |= EVENT_DOC;
        }
      }
      for (const coin of state.coins) {
        if (!coin.taken && Math.hypot(coin.x - player.x, coin.y - player.y) < 28) {
          coin.taken = true;
          state.coinsTaken += 1;
          state.score += POINTS.coin;
          events |= EVENT_DOC;
        }
      }
      // The exit opens only when everything is taken: documents on every
      // floor, plus the keycard on the vault floors that have one.
      state.exit.open = state.docsTaken === state.docsTotal && state.keysTaken === state.keysTotal;
      if (state.exit.open && Math.hypot(state.exit.x - player.x, state.exit.y - player.y) < 36) {
        state.score += POINTS.level + Math.max(0, 120 - Math.floor(state.time));
        if (state.ghost) state.score += POINTS.ghost;
        if (state.levelIndex + 1 >= LEVELS.length) {
          events |= EVENT_WIN;
        } else {
          events |= EVENT_LEVEL;
        }
        return events;
      }
      for (const guard of state.guards) {
        if (Math.hypot(guard.x - player.x, guard.y - player.y) < PLAYER.catchRadius + 12) {
          state.lives -= 1;
          state.caughtFlash = 1;
          events |= EVENT_CAUGHT;
          return events;
        }
      }
    }
    return events;
  }

  reset();
  return {
    state,
    reset,
    loadLevel,
    restartLevel,
    step,
    levelCount: LEVELS.length,
  };
}
