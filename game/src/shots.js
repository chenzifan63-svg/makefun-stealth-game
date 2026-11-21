// The screenshot scenes behind ?shot=start|play|sneak|win. Each one plays
// the real rules forward from a fresh world, steered by a pathfinding
// autopilot: A* over the tile grid to the nearest document (then the exit),
// with a heavy cost on tiles a guard's cone covers right now, so the route
// bends around the cones instead of through them. When the next tile on the
// route is lit, the courier waits in cover for the cone to pass — and dashes
// through if it waits too long, since a brief sighting only fills part of
// the detection meter. A chasing guard makes the courier flee to the nearest
// unwatched tile instead. The same seed always gives the same frame.
import { COLS, FIELD, PLAYER, ROWS, STEP, TILE } from './config.js';
import { EVENT_CAUGHT, EVENT_LEVEL, EVENT_WIN } from './world.js';
import { STATE_CHASE, guardCanSee } from './guards.js';
import { circleHitsWall } from './physics.js';
import { tileAt, tileBlocks, tileCentre, tileIsShadow } from './levels.js';
import { SCREEN_LEVEL, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 24;
const WIN_LIMIT_SECONDS = 300;
/** Replan the route at most this often; cones move, so a stale route lies. */
const REPLAN_STEPS = 30;
/** How long to wait for a lit tile to clear before dashing through. */
const MAX_WAIT_STEPS = 240;
const DIRECTIONS = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1], [0, 0],
];

/** True when any guard stands within `dist` px of (x, y): close enough to catch. */
function tooClose(state, x, y, dist = 90) {
  for (const guard of state.guards) {
    if (Math.hypot(guard.x - x, guard.y - y) < dist) return true;
  }
  return false;
}

/** Would standing at (x, y) be inside any guard's cone right now? */
function pointIsWatched(state, x, y) {
  for (const guard of state.guards) {
    if (guardCanSee(guard, x, y, state.level)) return true;
  }
  return false;
}

function tileOf(x, y) {
  return { col: Math.floor(x / TILE), row: Math.floor(y / TILE) };
}

function tileWalkable(level, col, row) {
  return !tileBlocks(tileAt(level, col, row));
}

/**
 * A* from the courier's tile to the target's tile, four-way, over open
 * floor. A tile under a cone costs far more than a dark one, so the route
 * bends around the guards' sight instead of crossing it; shadow tiles cost
 * slightly less, so the route prefers the dark. Returns tile centres from
 * the courier outward, or null when no route exists.
 */
function findPath(state, from, to) {
  const level = state.level;
  const start = tileOf(from.x, from.y);
  const goal = tileOf(to.x, to.y);
  if (start.col === goal.col && start.row === goal.row) return [tileCentre(goal.col, goal.row)];
  const key = (col, row) => row * COLS + col;
  const open = [{ col: start.col, row: start.row, g: 0, f: 0, parent: null }];
  const best = new Map([[key(start.col, start.row), 0]]);
  const closed = new Set();
  const heuristic = (col, row) => Math.abs(col - goal.col) + Math.abs(row - goal.row);
  while (open.length > 0) {
    let bestIndex = 0;
    for (let i = 1; i < open.length; i += 1) {
      if (open[i].f < open[bestIndex].f) bestIndex = i;
    }
    const node = open.splice(bestIndex, 1)[0];
    const nodeKey = key(node.col, node.row);
    if (closed.has(nodeKey)) continue;
    closed.add(nodeKey);
    if (node.col === goal.col && node.row === goal.row) {
      const path = [];
      let current = node;
      while (current) {
        path.push(tileCentre(current.col, current.row));
        current = current.parent;
      }
      return path.reverse();
    }
    for (const [dCol, dRow] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const col = node.col + dCol;
      const row = node.row + dRow;
      if (col < 0 || col >= COLS || row < 0 || row >= ROWS) continue;
      if (!tileWalkable(level, col, row)) continue;
      const centre = tileCentre(col, row);
      let cost = 1;
      if (pointIsWatched(state, centre.x, centre.y)) cost += 12;
      if (tooClose(state, centre.x, centre.y)) cost += 12;
      if (tileIsShadow(tileAt(level, col, row))) cost -= 0.3;
      const g = node.g + cost;
      const k = key(col, row);
      if (best.has(k) && best.get(k) <= g) continue;
      best.set(k, g);
      open.push({ col, row, g, f: g + heuristic(col, row), parent: node });
    }
  }
  return null;
}

/**
 * The nearest tile the courier can stand on that no cone covers right now,
 * at least `minGuardDist` px from every guard. Breadth-first, so the
 * nearest such tile wins — and the search stops there: a farther "nicer"
 * tile is no help when a guard is closing in.
 */
function nearestSafeTile(state, minGuardDist = 90) {
  const level = state.level;
  const start = tileOf(state.player.x, state.player.y);
  const seen = new Set([start.row * COLS + start.col]);
  const queue = [{ col: start.col, row: start.row }];
  while (queue.length > 0) {
    const tile = queue.shift();
    const centre = tileCentre(tile.col, tile.row);
    const nearGuard = state.guards.some(
      (guard) => Math.hypot(guard.x - centre.x, guard.y - centre.y) < minGuardDist,
    );
    if (!nearGuard && !pointIsWatched(state, centre.x, centre.y)) return centre;
    for (const [dCol, dRow] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const col = tile.col + dCol;
      const row = tile.row + dRow;
      const k = row * COLS + col;
      if (col < 0 || col >= COLS || row < 0 || row >= ROWS || seen.has(k)) continue;
      if (!tileWalkable(level, col, row)) continue;
      seen.add(k);
      queue.push({ col, row });
    }
  }
  return null;
}

/** The old greedy step: toward the target, never into a lit cone. Only a fallback. */
function greedyStep(state, target) {
  const player = state.player;
  let best = { x: 0, y: 0 };
  let bestScore = -Infinity;
  for (const [dx, dy] of DIRECTIONS) {
    const len = Math.hypot(dx, dy) || 1;
    const nx = player.x + (dx / len) * 44;
    const ny = player.y + (dy / len) * 44;
    if (nx < 20 || nx > FIELD.width - 20 || ny < 20 || ny > FIELD.height - 20) continue;
    if (circleHitsWall(nx, ny, PLAYER.radius, state.level)) continue;
    const dist = Math.hypot(target.x - nx, target.y - ny);
    let score = -dist;
    if (pointIsWatched(state, nx, ny)) score -= 500;
    if (dx === 0 && dy === 0) score -= 15;
    if (score > bestScore) {
      bestScore = score;
      best = { x: dx / len, y: dy / len };
    }
  }
  return best;
}

function nearestTarget(state) {
  const player = state.player;
  let best = null;
  let bestDist = Infinity;
  for (const doc of state.documents) {
    if (doc.taken) continue;
    const d = Math.hypot(doc.x - player.x, doc.y - player.y);
    if (d < bestDist) { bestDist = d; best = doc; }
  }
  if (best) return best;
  return state.exit;
}

function crouchNow(state) {
  for (const guard of state.guards) {
    if (Math.hypot(guard.x - state.player.x, guard.y - state.player.y) < 300) return true;
  }
  return false;
}

function directionTo(player, point) {
  const dx = point.x - player.x;
  const dy = point.y - player.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

/** One pilot: it keeps its route and its patience between steps. */
function createPilot() {
  let path = null;
  let pathTarget = null;
  let stepsSincePlan = 0;
  let waitSteps = 0;

  function plan(state, target) {
    path = findPath(state, state.player, target);
    pathTarget = { x: target.x, y: target.y };
    stepsSincePlan = 0;
    waitSteps = 0;
  }

  function step(state) {
    const player = state.player;
    const chasing = state.guards.some((guard) => guard.state === STATE_CHASE);

    if (chasing) {
      // Run, do not crouch: break line of sight on the nearest dark tile,
      // well clear of every chasing guard — fleeing from one guard into
      // another is how the courier gets caught.
      const safe = nearestSafeTile(state, 160);
      if (safe && Math.hypot(safe.x - player.x, safe.y - player.y) > 20) {
        return { move: directionTo(player, safe), crouch: false };
      }
      let nearestChaser = null;
      let nearestDist = Infinity;
      for (const guard of state.guards) {
        if (guard.state !== STATE_CHASE) continue;
        const d = Math.hypot(guard.x - player.x, guard.y - player.y);
        if (d < nearestDist) { nearestDist = d; nearestChaser = guard; }
      }
      if (nearestChaser) {
        return { move: directionTo(nearestChaser, player), crouch: false };
      }
      return { move: { x: 0, y: 0 }, crouch: false };
    }

    const target = nearestTarget(state);
    stepsSincePlan += 1;
    if (!path || !pathTarget || Math.hypot(pathTarget.x - target.x, pathTarget.y - target.y) > 1
      || path.length === 0 || stepsSincePlan > REPLAN_STEPS) {
      plan(state, target);
    }
    if (!path) return { move: greedyStep(state, target), crouch: crouchNow(state) };

    for (let attempt = 0; attempt < 2; attempt += 1) {
      while (path.length > 0 && Math.hypot(path[0].x - player.x, path[0].y - player.y) < 18) {
        path.shift();
      }
      if (path.length === 0) return { move: { x: 0, y: 0 }, crouch: false };
      const next = path[0];
      const watched = pointIsWatched(state, next.x, next.y);
      const close = tooClose(state, next.x, next.y);
      if (!watched && !close) {
        waitSteps = 0;
        // Seen right now: run at full speed out of the cone instead of
        // crouching through it — a crouched courier barely outruns a guard.
        const seen = pointIsWatched(state, player.x, player.y);
        return { move: directionTo(player, next), crouch: seen ? false : crouchNow(state) };
      }
      // Exposed where we stand: pull back to the nearest dark tile first.
      if (pointIsWatched(state, player.x, player.y) || tooClose(state, player.x, player.y)) {
        const safe = nearestSafeTile(state);
        if (safe && Math.hypot(safe.x - player.x, safe.y - player.y) > 20) {
          return { move: directionTo(player, safe), crouch: crouchNow(state) };
        }
      }
      if (close) {
        // Never dash into a guard's body: wait in cover, replanning now and
        // then so the route bends around where the guard actually is.
        waitSteps += 1;
        if (waitSteps >= MAX_WAIT_STEPS) {
          plan(state, target);
          waitSteps = 0;
          continue;
        }
        return { move: { x: 0, y: 0 }, crouch: true };
      }
      // Cone only: wait a while, then dash through while detection is low.
      // A brief sighting only fills part of the meter, and it drains in the dark.
      waitSteps += 1;
      if (waitSteps < MAX_WAIT_STEPS && state.detection < 0.6) {
        return { move: { x: 0, y: 0 }, crouch: true };
      }
      waitSteps = 0;
      return { move: directionTo(player, next), crouch: false };
    }
    return { move: { x: 0, y: 0 }, crouch: true };
  }

  return { step };
}

/**
 * Set `world` to the named scene (start, play, sneak or win; any other name
 * is start) and return the screen to draw over it and the best score.
 */
export function stageShot(name, world) {
  const state = world.state;
  if (name !== 'play' && name !== 'sneak' && name !== 'win') {
    world.reset();
    for (let i = 0; i < START_SECONDS / STEP; i += 1) world.step(STEP, { x: 0, y: 0 }, false, true);
    return { screen: SCREEN_TITLE, best: 0 };
  }

  world.reset();
  const pilot = createPilot();
  if (name === 'sneak') {
    // Ten seconds of real sneaking, then freeze the tense moment: the
    // courier crouched behind the central wall while a guard's cone sweeps
    // the corridor just past him, detection half full.
    for (let i = 0; i < 10 / STEP; i += 1) {
      const move = pilot.step(state);
      const events = world.step(STEP, move.move, move.crouch, false);
      if (events & EVENT_CAUGHT) break;
    }
    state.player.x = 360;
    state.player.y = 280;
    state.player.crouching = true;
    state.player.angle = Math.PI;
    const guard = state.guards[0];
    guard.x = 640;
    guard.y = 120;
    guard.angle = 2.62;
    guard.detection = 0.45;
    state.detection = 0.45;
    return { screen: SCREEN_PLAY, best: state.score };
  }

  const limit = name === 'win' ? WIN_LIMIT_SECONDS : PLAY_SECONDS;
  let finished = 0;
  for (let i = 0; i < limit / STEP; i += 1) {
    const move = pilot.step(state);
    const events = world.step(STEP, move.move, move.crouch, false);
    if (events & EVENT_CAUGHT) break;
    if (events & (EVENT_LEVEL | EVENT_WIN)) { finished = events; break; }
  }
  if (name === 'win' && !finished) {
    // The pilot ran out of time: stage the getaway itself — every document
    // taken, the courier at the open exit — and let the panel tell it.
    for (const doc of state.documents) doc.taken = true;
    state.docsTaken = state.documents.length;
    state.exit.open = true;
    state.player.x = state.exit.x;
    state.player.y = state.exit.y;
    state.time = 95;
    state.score += 350;
  }
  if (name === 'win') return { screen: SCREEN_LEVEL, best: state.score };
  return { screen: SCREEN_PLAY, best: state.score };
}
