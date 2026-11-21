// Shadow Courier — every tuning number and colour in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to
// fit the window, so no rule below depends on the screen size.
export const FIELD = { width: 1280, height: 720 };
export const TILE = 80;
export const COLS = 16;
export const ROWS = 9;

/** The simulation's fixed step, in seconds: 60 updates a second. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 14,
  walkSpeed: 165,
  crouchSpeed: 88,
  /** How close a guard must be to catch the courier. */
  catchRadius: 28,
};

export const GUARD = {
  /** Half-angle of a vision cone, in radians. */
  coneHalfAngle: 0.62,
  coneRange: 250,
  /** Detection fills 0..1; these are the fill rates per second. */
  detectClose: 1.7,
  detectFar: 0.8,
  detectDecay: 0.55,
  crouchFactor: 0.45,
  shadowFactor: 0.5,
  chaseSpeedFactor: 1.55,
  /** Seconds a guard keeps chasing after losing sight. */
  chaseMemory: 2.5,
};

export const LIVES = 3;
export const POINTS = { document: 100, level: 250, ghost: 150 };

export const PALETTE = {
  backdrop: '#0b0e14',
  floor: '#232936',
  floorAlt: '#202634',
  floorEdge: '#2e3547',
  shadowFloor: '#161b28',
  wall: '#3d465c',
  wallTop: '#4a5468',
  crate: '#6b5433',
  crateTop: '#8a6d42',
  crateEdge: '#4a3a22',
  player: '#ffc857',
  playerCrouch: '#e8a93d',
  guard: '#e5534b',
  guardChase: '#ff2e2e',
  cone: 'rgba(255, 214, 90, 0.28)',
  coneAlert: 'rgba(255, 60, 50, 0.38)',
  coneEdge: 'rgba(255, 214, 90, 0.55)',
  document: '#7ef0c1',
  exit: '#58d68d',
  exitGlow: 'rgba(88, 214, 141, 0.25)',
  text: '#eef1f5',
  muted: '#9aa3b5',
  gold: '#f2c94c',
  panel: '#171c28',
  panelEdge: '#2c3446',
  danger: '#ff5a4e',
  safe: '#58d68d',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'shadow-courier.best';
