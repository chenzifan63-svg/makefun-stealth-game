// Validate every level: all documents and the exit are reachable from the
// start by flood fill over open floor, and every straight leg between two
// guard waypoints crosses open floor only. Run: node validate-levels.mjs
import { LEVELS, tileAt, tileBlocks, tileCentre } from './game/src/levels.js';

let failures = 0;

function reachable(level, fromCol, fromRow) {
  const seen = new Set([`${fromCol},${fromRow}`]);
  const queue = [[fromCol, fromRow]];
  while (queue.length > 0) {
    const [col, row] = queue.shift();
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const c = col + dc;
      const r = row + dr;
      if (c < 0 || c >= 16 || r < 0 || r >= 9 || seen.has(`${c},${r}`)) continue;
      if (tileBlocks(tileAt(level, c, r))) continue;
      seen.add(`${c},${r}`);
      queue.push([c, r]);
    }
  }
  return seen;
}

function legIsOpen(level, a, b) {
  const pa = tileCentre(a[0], a[1]);
  const pb = tileCentre(b[0], b[1]);
  const dist = Math.hypot(pb.x - pa.x, pb.y - pa.y);
  const steps = Math.max(1, Math.ceil(dist / 8));
  for (let i = 0; i <= steps; i += 1) {
    const x = pa.x + ((pb.x - pa.x) * i) / steps;
    const y = pa.y + ((pb.y - pa.y) * i) / steps;
    if (tileBlocks(tileAt(level, Math.floor(x / 80), Math.floor(y / 80)))) return false;
  }
  return true;
}

LEVELS.forEach((level, index) => {
  let start = null;
  const docs = [];
  const keys = [];
  const coins = [];
  let exit = null;
  level.map.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      if (ch === 'P') start = [c, r];
      if (ch === 'D') docs.push([c, r]);
      if (ch === 'K') keys.push([c, r]);
      if (ch === 'o') coins.push([c, r]);
      if (ch === 'E') exit = [c, r];
    });
  });
  const seen = reachable(level, start[0], start[1]);
  for (const [c, r] of docs) {
    if (!seen.has(`${c},${r}`)) {
      console.log(`level ${index + 1}: document at (${c},${r}) UNREACHABLE`);
      failures += 1;
    }
  }
  for (const [c, r] of keys) {
    if (!seen.has(`${c},${r}`)) {
      console.log(`level ${index + 1}: keycard at (${c},${r}) UNREACHABLE`);
      failures += 1;
    }
  }
  for (const [c, r] of coins) {
    if (!seen.has(`${c},${r}`)) {
      console.log(`level ${index + 1}: coin at (${c},${r}) UNREACHABLE`);
      failures += 1;
    }
  }
  if (!seen.has(`${exit[0]},${exit[1]}`)) {
    console.log(`level ${index + 1}: exit at (${exit[0]},${exit[1]}) UNREACHABLE`);
    failures += 1;
  }
  level.guards.forEach((guard, gi) => {
    guard.waypoints.forEach((wp, wi) => {
      if (tileBlocks(tileAt(level, wp[0], wp[1]))) {
        console.log(`level ${index + 1} guard ${gi}: waypoint ${wi} (${wp}) on a blocking tile`);
        failures += 1;
      }
    });
    for (let wi = 0; wi < guard.waypoints.length; wi += 1) {
      const a = guard.waypoints[wi];
      const b = guard.waypoints[(wi + 1) % guard.waypoints.length];
      if (!legIsOpen(level, a, b)) {
        console.log(`level ${index + 1} guard ${gi}: leg ${JSON.stringify(a)} -> ${JSON.stringify(b)} crosses a wall/crate`);
        failures += 1;
      }
    }
  });
  console.log(`level ${index + 1} (${level.name}): ${docs.length} docs, ${keys.length} keycards, ${coins.length} coins, ${level.guards.length} guards, reachable=${seen.size} tiles`);
});

if (failures > 0) {
  console.log(`VALIDATION FAILED: ${failures} problem(s)`);
  process.exit(1);
}
console.log('LEVELS VALID: all docs + keycards + coins + exit reachable, all patrol legs on open floor');
