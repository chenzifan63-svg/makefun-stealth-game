// Guards: patrol routes, vision cones, the detection meter and the chase.
// A guard walks its waypoints, looks where it walks, and fills its own
// detection from 0 to 1 while the courier stands in its cone in plain sight.
// Full detection raises the alarm: the guard runs at the courier's last
// known position. Lose him for a while and he gives up and goes back.
import { GUARD, STEP } from './config.js';
import { hasLineOfSight } from './physics.js';
import { tileCentre } from './levels.js';

export const STATE_PATROL = 'patrol';
export const STATE_CHASE = 'chase';
export const STATE_RETURN = 'return';

function angleDifference(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Can this guard see the point (x, y) right now? Range, cone angle and a
 * clear line of sight all have to hold. `crouching` and `inShadow` only
 * change how fast detection fills, never whether the guard sees you.
 */
export function guardCanSee(guard, x, y, level) {
  const dx = x - guard.x;
  const dy = y - guard.y;
  const dist = Math.hypot(dx, dy);
  if (dist > GUARD.coneRange) return false;
  if (dist > 1 && Math.abs(angleDifference(Math.atan2(dy, dx), guard.angle)) > GUARD.coneHalfAngle) return false;
  return hasLineOfSight(guard.x, guard.y, x, y, level);
}

export function createGuard(def) {
  const points = def.waypoints.map(([col, row]) => tileCentre(col, row));
  const start = points[0];
  return {
    x: start.x,
    y: start.y,
    angle: points.length > 1 ? Math.atan2(points[1].y - start.y, points[1].x - start.x) : 0,
    speed: def.speed,
    sweep: Boolean(def.sweep),
    // A runner patrols at speed, no different eyes — the gold ring in the
    // renderer is what tells him apart from the walkers.
    runner: Boolean(def.runner),
    sweepPhase: 0,
    waypoints: points,
    wpIndex: points.length > 1 ? 1 : 0,
    wpDir: 1,
    state: STATE_PATROL,
    detection: 0,
    lastSeen: -99,
    lastKnown: { x: start.x, y: start.y },
    moving: false,
  };
}

/**
 * One fixed step for one guard. `player` carries x, y, crouching and
 * inShadow; `now` is the world's clock. Returns true on the exact step the
 * guard's detection fills and the alarm goes up.
 */
export function stepGuard(guard, player, level, now) {
  let alarm = false;
  const sees = guardCanSee(guard, player.x, player.y, level);
  if (sees) {
    const dist = Math.hypot(player.x - guard.x, player.y - guard.y);
    const close = 1 - dist / GUARD.coneRange;
    let rate = GUARD.detectFar + (GUARD.detectClose - GUARD.detectFar) * close;
    if (player.crouching) rate *= GUARD.crouchFactor;
    if (player.inShadow) rate *= GUARD.shadowFactor;
    if (guard.detection < 1) {
      guard.detection = Math.min(1, guard.detection + rate * STEP);
      if (guard.detection >= 1) alarm = true;
    }
    guard.lastSeen = now;
    guard.lastKnown = { x: player.x, y: player.y };
  } else {
    guard.detection = Math.max(0, guard.detection - GUARD.detectDecay * STEP);
  }
  if (alarm) guard.state = STATE_CHASE;

  guard.moving = false;
  if (guard.sweep) {
    // The watcher stands still and sweeps his cone in a slow arc.
    guard.sweepPhase += STEP * 0.7;
    guard.angle = Math.sin(guard.sweepPhase) * 1.1;
    if (guard.state === STATE_CHASE) {
      guard.state = STATE_PATROL;
      guard.detection = 0;
    }
    return alarm;
  }

  let target = null;
  let speed = guard.speed;
  if (guard.state === STATE_CHASE) {
    target = guard.lastKnown;
    speed = guard.speed * GUARD.chaseSpeedFactor;
    if (now - guard.lastSeen > GUARD.chaseMemory) {
      guard.state = STATE_RETURN;
      guard.detection = 0;
    }
  } else if (guard.state === STATE_RETURN) {
    // Walk back to the nearest waypoint, then resume the patrol.
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < guard.waypoints.length; i += 1) {
      const d = Math.hypot(guard.waypoints[i].x - guard.x, guard.waypoints[i].y - guard.y);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    guard.wpIndex = best;
    target = guard.waypoints[best];
    if (bestDist < 6) guard.state = STATE_PATROL;
  } else {
    target = guard.waypoints[guard.wpIndex];
  }

  if (target) {
    const dx = target.x - guard.x;
    const dy = target.y - guard.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 6) {
      // Reached the waypoint: advance, ping-ponging on a two-point route.
      if (guard.waypoints.length === 2) {
        guard.wpIndex = 1 - guard.wpIndex;
      } else {
        guard.wpIndex = (guard.wpIndex + guard.wpDir) % guard.waypoints.length;
        if (guard.wpIndex === 0) guard.wpDir = 1;
      }
    } else {
      const step = Math.min(dist, speed * STEP);
      guard.x += (dx / dist) * step;
      guard.y += (dy / dist) * step;
      guard.angle = Math.atan2(dy, dx);
      guard.moving = true;
    }
  }
  return alarm;
}
