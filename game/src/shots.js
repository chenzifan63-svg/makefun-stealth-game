// The screenshot scenes behind ?shot=start|play|sneak|win. Each one plays
// the real rules forward from a fresh world, steered by a simple autopilot:
// head for the nearest document (then the exit), and step around any guard
// cone that would spot the courier — waiting in cover when there is no safe
// step. The same seed always gives the same frame.
import { FIELD, PLAYER, STEP } from './config.js';
import { EVENT_CAUGHT, EVENT_LEVEL, EVENT_WIN } from './world.js';
import { guardCanSee } from './guards.js';
import { circleHitsWall } from './physics.js';
import { SCREEN_LEVEL, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 24;
const WIN_LIMIT_SECONDS = 300;
const DIRECTIONS = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1], [0, 0],
];

/** Would standing at (x, y) be inside any guard's cone right now? */
function pointIsWatched(state, x, y) {
  for (const guard of state.guards) {
    if (guardCanSee(guard, x, y, state.level)) return true;
  }
  return false;
}

/** The autopilot's next move: toward the target, never into a lit cone. */
function autopilot(state, target) {
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
  if (name === 'sneak') {
    // Ten seconds of real sneaking, then freeze the tense moment: the
    // courier crouched behind the central wall while a guard's cone sweeps
    // the corridor just past him, detection half full.
    for (let i = 0; i < 10 / STEP; i += 1) {
      const events = world.step(STEP, autopilot(state, nearestTarget(state)), crouchNow(state), false);
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
    const events = world.step(STEP, autopilot(state, nearestTarget(state)), crouchNow(state), false);
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
