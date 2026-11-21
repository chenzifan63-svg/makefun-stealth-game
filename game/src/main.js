// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between six screens: title,
// play, paused, level clear, caught and the clean getaway.
// Clicking the floor sets a walk target; the courier steers toward it, so
// the game plays with keyboard and mouse alike.
//
// ?seed=N fixes the patrol pattern. ?shot=start|play|sneak|win (with
// &seed=N) stages that scene instead of running the loop, paints it twice
// and sets window.__shotReady for a screenshot.
import { BEST_KEY, LIVES, STEP } from './config.js';
import { createRandom } from './random.js';
import { EVENT_ALARM, EVENT_CAUGHT, EVENT_DOC, EVENT_LEVEL, EVENT_WIN, createWorld } from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, createInput } from './input.js';
import { createSound } from './sound.js';
import { SCREEN_LEVEL, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN, createRenderer } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;

window.addEventListener('error', (event) => {
  window.__shotError = String(event.message || event.error || 'error');
});

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const sound = createSound();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best then lasts one visit.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let walkTarget = null;
  let stepTimer = 0;

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    walkTarget = null;
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Steal every document, then reach the exit unseen.');
  }

  function endRun(win) {
    screen = win ? SCREEN_WIN : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(win ? `Clean getaway. Score ${world.state.score}.` : `Caught. Score ${world.state.score}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    const click = input.takeClick();
    if (click) {
      sound.unlock();
      sound.click();
      if (screen === SCREEN_PLAY) {
        const field = renderer.toField(click.x, click.y);
        walkTarget = field;
      }
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN)) {
      startGame();
    } else if (actions & ACTION_CONFIRM && screen === SCREEN_LEVEL) {
      world.loadLevel(world.state.levelIndex + 1);
      walkTarget = null;
      screen = SCREEN_PLAY;
      announce(`Floor ${world.state.levelIndex + 1}. ${world.state.level.name}.`);
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function moveFromInput() {
    const keys = input.direction();
    if (keys.x !== 0 || keys.y !== 0) {
      walkTarget = null;
      return keys;
    }
    if (walkTarget) {
      const dx = walkTarget.x - world.state.player.x;
      const dy = walkTarget.y - world.state.player.y;
      if (Math.hypot(dx, dy) < 8) {
        walkTarget = null;
        return { x: 0, y: 0 };
      }
      return { x: dx, y: dy };
    }
    return { x: 0, y: 0 };
  }

  function nearestGuard() {
    let bestGuard = null;
    let bestDist = Infinity;
    for (const guard of world.state.guards) {
      const d = Math.hypot(guard.x - world.state.player.x, guard.y - world.state.player.y);
      if (d < bestDist) { bestDist = d; bestGuard = guard; }
    }
    return { guard: bestGuard, dist: bestDist };
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { x: 0, y: 0 }, false, true);
      return;
    }
    const events = world.step(STEP, moveFromInput(), input.crouching(), false);
    if (events & EVENT_DOC) sound.pickup();
    if (events & EVENT_ALARM) {
      sound.alarm();
      announce('Spotted! Break line of sight!');
    }
    if (events & EVENT_CAUGHT) {
      sound.caught();
      if (world.state.lives <= 0) {
        endRun(false);
      } else {
        world.restartLevel();
        walkTarget = null;
        announce(`Caught! ${world.state.lives} ${world.state.lives === 1 ? 'life' : 'lives'} left — the floor resets.`);
      }
    } else if (events & EVENT_LEVEL) {
      sound.levelClear();
      screen = SCREEN_LEVEL;
      announce(`${world.state.level.name} cleared.`);
    } else if (events & EVENT_WIN) {
      sound.win();
      endRun(true);
    }
    // Footsteps: the nearer a guard walks, the louder and clearer he is.
    const player = world.state.player;
    if (player.moving) {
      stepTimer -= STEP;
      if (stepTimer <= 0) {
        stepTimer = player.crouching ? 0.55 : 0.38;
        const { guard, dist } = nearestGuard();
        if (guard && guard.moving && dist < 420) {
          sound.footstep((guard.x - player.x) / 420, Math.max(0.02, 0.14 * (1 - dist / 420)));
        }
      }
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best);
  }

  // Leaving the tab pauses a running game rather than letting guards walk unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Shadow Courier. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
