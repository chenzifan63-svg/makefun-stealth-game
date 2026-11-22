// The five night-shift levels of Shadow Courier. Each level is a tile map of
// 16 columns by 9 rows (one tile is 80 px, so 1280x720). Tile letters:
//   #  wall — blocks movement and sight
//   C  crate — low cover, blocks movement and sight, hide behind it
//   S  shadow floor — dark patch, guards spot you half as fast there
//   .  open floor
//   P  the courier's start     D  a document to steal
//   K  a keycard — the vault floors need it before the exit opens
//   o  a coin — worth 25 points, a bonus for a risky detour
//   E  the exit door (opens once every document — and keycard — is taken)
// Guards are not letters in the map: their patrol routes are listed per level
// as tile waypoints, so a route can cross open floor in any shape. Every
// waypoint sits on open floor and every straight leg between two waypoints
// crosses open floor only — a guard never clips through a wall or a crate.
// A guard with runner: true is a fast patrol — same eyes, quicker feet.
export const LEVELS = [
  {
    name: 'Night Shift',
    tip: 'Stay out of the yellow cones. Crouch (Shift) in the dark.',
    map: [
      '################',
      '#P....#....D...#',
      '#.....#......o.#',
      '#.C..........C.#',
      '#.....#........#',
      '#..S..#..S.....#',
      '#.....#....C...#',
      '#..D..#...D...E#',
      '################',
    ],
    guards: [
      { waypoints: [[8, 1], [13, 1], [13, 2], [8, 2]], speed: 55 },
      { waypoints: [[12, 5], [12, 7], [9, 7], [7, 7], [7, 5]], speed: 60 },
    ],
  },
  {
    name: 'The Vault Floor',
    tip: 'Three guards now. Crates block their sight — use them.',
    map: [
      '################',
      '#P..C....#..D..#',
      '#......C.#...o.#',
      '#..S....#..C...#',
      '#..#....#......#',
      '#..#..C....S...#',
      '#.....#....#...#',
      '#.D...#..D...#E#',
      '################',
    ],
    guards: [
      { waypoints: [[2, 2], [6, 2]], speed: 68 },
      { waypoints: [[12, 2], [12, 5], [10, 5], [10, 2]], speed: 72 },
      { waypoints: [[2, 6], [5, 6], [5, 7], [2, 7]], speed: 62 },
    ],
  },
  {
    name: 'The Director’s Wing',
    tip: 'The watcher never moves — wait for his cone to turn away.',
    map: [
      '################',
      '#P...#...D.....#',
      '#....#......o..#',
      '#.C..#..C......#',
      '#............o.#',
      '#.S..#...S..C..#',
      '#....#...C.....#',
      '#.D..#....D..E##',
      '################',
    ],
    guards: [
      { waypoints: [[6, 1], [11, 1], [11, 4], [6, 4]], speed: 82 },
      { waypoints: [[13, 2], [13, 6], [10, 6], [10, 2]], speed: 88 },
      { waypoints: [[6, 6], [8, 6], [8, 7], [6, 7]], speed: 78 },
      // The watcher: one waypoint, so he stands and sweeps his cone around.
      { waypoints: [[8, 4]], speed: 0, sweep: true },
    ],
  },
  {
    name: 'The Gold Vault',
    tip: 'The vault needs its keycard — grab it and the coins first.',
    map: [
      '################',
      '#P..C....D....o#',
      '#....#....C..D.#',
      '#.C...#..S...oC#',
      '#....#......#..#',
      '#..S....C...#.D#',
      '#.o..#....o.#..#',
      '#.DK..#......#E#',
      '################',
    ],
    guards: [
      { waypoints: [[1, 2], [4, 2]], speed: 70 },
      { waypoints: [[8, 1], [13, 1]], speed: 75 },
      // A runner: same eyes, quicker feet — his gold ring gives him away.
      { waypoints: [[11, 3], [11, 6]], speed: 115, runner: true },
      { waypoints: [[7, 3], [7, 5]], speed: 65 },
      { waypoints: [[10, 5], [10, 7]], speed: 80 },
    ],
  },
  {
    name: 'The Rooftop Office',
    tip: 'Six guards, one watcher, one keycard. Stay dark, stay patient.',
    map: [
      '################',
      '#P...#...D....o#',
      '#...C#......Co.#',
      '#.C...#...S..D.#',
      '#..............#',
      '#..S.#....CD.#.#',
      '#Co....#....o..#',
      '#.D.K.#...#...E#',
      '################',
    ],
    guards: [
      { waypoints: [[2, 1], [4, 1]], speed: 85 },
      { waypoints: [[8, 2], [11, 2]], speed: 90 },
      // A runner on the open floor: he crosses the room fast.
      { waypoints: [[12, 3], [12, 5]], speed: 120, runner: true },
      { waypoints: [[3, 5], [3, 7], [5, 7]], speed: 70 },
      { waypoints: [[7, 1], [7, 3]], speed: 78 },
      // A second watcher, sweeping the middle of the office.
      { waypoints: [[8, 4]], speed: 0, sweep: true },
    ],
  },
];

/** Tile letter at (col, row); anything outside the map is a wall. */
export function tileAt(level, col, row) {
  if (col < 0 || col >= 16 || row < 0 || row >= 9) return '#';
  return level.map[row][col];
}

/** True when the tile blocks movement and sight. */
export function tileBlocks(tile) {
  return tile === '#' || tile === 'C';
}

/** True when the tile is a shadow patch. */
export function tileIsShadow(tile) {
  return tile === 'S';
}

/** Pixel centre of a tile. */
export function tileCentre(col, row) {
  return { x: col * 80 + 40, y: row * 80 + 40 };
}
