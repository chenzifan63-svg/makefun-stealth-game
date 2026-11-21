// Geometry with no drawing in it: circle-vs-tile collision with wall sliding,
// and line-of-sight tests against the walls and crates that block a guard's
// view. Both the courier and the guards move through these helpers.
import { TILE, COLS, ROWS } from './config.js';
import { tileAt, tileBlocks } from './levels.js';

/** True when a circle at (x, y) with radius r touches a blocking tile. */
export function circleHitsWall(x, y, r, level) {
  const col0 = Math.max(0, Math.floor((x - r) / TILE));
  const col1 = Math.min(COLS - 1, Math.floor((x + r) / TILE));
  const row0 = Math.max(0, Math.floor((y - r) / TILE));
  const row1 = Math.min(ROWS - 1, Math.floor((y + r) / TILE));
  for (let row = row0; row <= row1; row += 1) {
    for (let col = col0; col <= col1; col += 1) {
      if (!tileBlocks(tileAt(level, col, row))) continue;
      const nearX = Math.max(col * TILE, Math.min(x, col * TILE + TILE));
      const nearY = Math.max(row * TILE, Math.min(y, row * TILE + TILE));
      const dx = x - nearX;
      const dy = y - nearY;
      if (dx * dx + dy * dy < r * r) return true;
    }
  }
  return false;
}

/**
 * Move a circle by (dx, dy), one axis at a time: a blocked axis stops and
 * the other still slides, so the courier glides along walls instead of
 * sticking to them. Returns the new position.
 */
export function moveCircle(pos, dx, dy, r, level) {
  let x = pos.x;
  let y = pos.y;
  if (dx !== 0 && !circleHitsWall(x + dx, y, r, level)) x += dx;
  if (dy !== 0 && !circleHitsWall(x, y + dy, r, level)) y += dy;
  return { x, y };
}

/** True when no wall or crate stands between two points. */
export function hasLineOfSight(x0, y0, x1, y1, level) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / 8));
  for (let i = 1; i < steps; i += 1) {
    const x = x0 + (dx * i) / steps;
    const y = y0 + (dy * i) / steps;
    if (tileBlocks(tileAt(level, Math.floor(x / TILE), Math.floor(y / TILE)))) return false;
  }
  return true;
}

/** Distance a ray travels from (x, y) along `angle` before it hits a wall. */
export function rayDistance(x, y, angle, maxDist, level) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  for (let d = 8; d <= maxDist; d += 8) {
    if (tileBlocks(tileAt(level, Math.floor((x + dx * d) / TILE), Math.floor((y + dy * d) / TILE)))) return d;
  }
  return maxDist;
}
