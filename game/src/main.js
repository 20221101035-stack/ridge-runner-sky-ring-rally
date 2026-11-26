// main.js — boots Ridge Runner: the loop, the states (menu, flying, paused,
// over), the mission picker, and the deterministic `?shot=` poses the
// screenshots are taken from. No build step, no network: just a canvas.

import { createPlane, resetPlane, updatePlane } from './physics.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { MISSIONS, createRun, updateRun } from './missions.js';
import { buildCourse } from './missions.js';
import { renderWorld } from './render.js';
import { drawHud, drawMenu, drawEndScreen, drawPaused } from './hud.js';
import { terrainHeight } from './terrain.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');

const params = new URLSearchParams(location.search);
const shotMode = params.get('shot'); // cover | ring | canyon | menu | null
const selfTest = params.get('selftest') === '1';

const input = createInput(canvas);
const audio = createAudio();
const plane = createPlane();

let state = 'menu'; // menu | flying | paused | over
let missionIndex = 0;
let run = createRun(MISSIONS[0]);
let best = 0;
try {
  best = Number(localStorage.getItem('ridge-runner-best') ?? 0) || 0;
} catch {
  best = 0;
}
let time = 0;
let lastStamp = 0;
let frames = 0;
let errors = [];

// Menu cards: the HUD draws them and main.js answers the clicks.
drawMenu.cards = MISSIONS.map((mission) => ({
  mission,
  rings: buildCourse(mission.id).length,
  hover: false,
  x: 0,
  y: 0,
  w: 0,
  h: 0,
}));

window.addEventListener('error', (event) => {
  errors.push(String(event.message ?? event.error));
});

function saveBest() {
  if (run.score > best) {
    best = run.score;
    try {
      localStorage.setItem('ridge-runner-best', String(best));
    } catch {
      // Private mode or file:// — the score just does not persist.
    }
  }
}

function startMission(index) {
  missionIndex = index;
  const mission = MISSIONS[index];
  run = createRun(mission);
  resetPlane(plane, mission.spawn);
  plane.fuel = mission.fuelStart;
  state = 'flying';
  audio.unlock();
  statusEl.textContent = `${mission.name}: fly through the rings.`;
}

function endRun() {
  state = 'over';
  saveBest();
  statusEl.textContent = `${run.message} Score ${run.score}.`;
}

function restart() {
  startMission(missionIndex);
}

function togglePause() {
  if (state === 'flying') state = 'paused';
  else if (state === 'paused') state = 'flying';
}

input.onKey = (code) => {
  if (code === 'KeyM') {
    audio.toggleMute();
    return;
  }
  if (code === 'KeyP') {
    togglePause();
    return;
  }
  if (code === 'KeyR') {
    if (state !== 'menu') restart();
    return;
  }
  if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3') {
    startMission(Number(code.slice(-1)) - 1);
    return;
  }
  if (code === 'Enter' || code === 'Space') {
    if (state === 'menu') startMission(missionIndex);
    else if (state === 'over') restart();
  }
};

input.onClick = (x, y) => {
  audio.unlock();
  if (state === 'menu') {
    for (let i = 0; i < drawMenu.cards.length; i++) {
      const c = drawMenu.cards[i];
      if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) {
        startMission(i);
        return;
      }
    }
  }
};

canvas.addEventListener('pointermove', (event) => {
  if (state !== 'menu') return;
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  drawMenu.cards.forEach((c) => {
    c.hover = x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h;
  });
});

// --- deterministic screenshot poses ---------------------------------------
// `?shot=cover` etc. freezes the world in a good-looking moment so a
// headless screenshot is the same render every time. These poses are only
// for the maker's screenshots; normal play never sees them.
function applyShotPose() {
  if (!shotMode) return false;
  if (shotMode === 'menu') {
    state = 'menu';
    plane.x = 0;
    plane.y = 130;
    plane.z = -200;
    plane.heading = 0.15;
    plane.pitch = -0.04;
    plane.bank = 0.12;
    plane.speed = 46;
    plane.throttle = 0.62;
    time = 4.2;
    return true;
  }
  if (shotMode === 'cover') {
    startMission(0);
    // Take-off view down the home runway: the first ring dead ahead over
    // the valley, snowy ridges on the horizon.
    plane.x = 0;
    plane.y = 90;
    plane.z = -420;
    plane.heading = 0;
    plane.pitch = 0.02;
    plane.bank = 0.08;
    plane.speed = 46;
    plane.throttle = 0.62;
    run.score = 0;
    run.ringIndex = 0;
    run.timeLeft = 150;
    time = 6.8;
    return true;
  }
  if (shotMode === 'ring') {
    startMission(0);
    // Closing on the lake ring from above the island: the strip reads as a
    // runway on the island below, the ring dead ahead over the water.
    plane.x = 1250;
    plane.y = 135;
    plane.z = 680;
    plane.heading = 0.61;
    plane.pitch = 0.02;
    plane.bank = 0.3;
    plane.speed = 64;
    plane.throttle = 0.9;
    run.score = 550;
    run.ringIndex = 4;
    run.rings.forEach((r, i) => {
      r.passed = i < 4;
    });
    run.timeLeft = 110;
    time = 9.4;
    return true;
  }
  if (shotMode === 'canyon') {
    startMission(1);
    // Low in the canyon cut, the next gate dead ahead, walls close.
    plane.x = -560;
    plane.y = 42;
    plane.z = 470;
    plane.heading = 0.03;
    plane.pitch = 0.02;
    plane.bank = -0.25;
    plane.speed = 66;
    plane.throttle = 0.92;
    run.score = 480;
    run.ringIndex = 3;
    run.rings.forEach((r, i) => {
      r.passed = i < 3;
    });
    run.timeLeft = 74;
    run.lowBonus = 60;
    time = 12.6;
    return true;
  }
  return false;
}

const frozenShot = applyShotPose();

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w, h };
}

function frame(stamp) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (stamp - lastStamp) / 1000 || 0.016);
  lastStamp = stamp;
  const { w, h } = resize();
  frames += 1;

  if (!frozenShot) time += dt;

  if (state === 'flying' && !frozenShot) {
    input.throttleDelta = input.consumeWheel();
    updatePlane(plane, input, dt);
    updateRun(
      run,
      plane,
      dt,
      {
        onRing: () => audio.ring(),
        onCrash: () => audio.crash(),
        onComplete: () => audio.fanfare(),
      },
    );
    audio.update(plane.throttle, plane.speed, true);
    if (run.finished) endRun();
  } else if (state === 'flying') {
    // A screenshot pose holds still: the world is posed, not played.
    audio.update(0, 0, false);
  } else if (state === 'menu') {
    // The menu flies itself: a slow scenic drift over the valley. The
    // heading is a function of time, so a screenshot pose holds still.
    plane.heading = 0.15 + Math.sin(time * 0.05) * 0.05;
    plane.x = Math.sin(time * 0.05) * 120;
    plane.z = -200 + Math.cos(time * 0.05) * 120;
    plane.y = 130 + Math.sin(time * 0.3) * 6;
    plane.bank = 0.12;
    audio.update(0.4, 46, false);
  } else {
    audio.update(0, 0, false);
  }

  renderWorld(ctx, plane, run, time, w, h, state !== 'menu');
  if (state === 'menu') {
    drawMenu(ctx, w, h, time, best);
  } else if (state === 'over') {
    drawEndScreen(ctx, w, h, run, best);
  } else if (state === 'paused') {
    drawHud(ctx, plane, run, w, h, time);
    drawPaused(ctx, w, h);
  } else {
    drawHud(ctx, plane, run, w, h, time);
  }

  if (selfTest && frames === 90) {
    // Lets a headless run prove the game looped without errors.
    window.__flightTest = {
      frames,
      state,
      errors,
      score: run.score,
      plane: { x: Math.round(plane.x), y: Math.round(plane.y), z: Math.round(plane.z) },
      terrainUnder: Math.round(terrainHeight(plane.x, plane.z)),
    };
    document.title = `SELFTEST frames=${frames} state=${state} errors=${errors.length}`;
  }
}

requestAnimationFrame(frame);

// A read-only handle for play-testing and debugging from the console.
window.__ridgeRunner = {
  plane,
  get run() {
    return run;
  },
  get state() {
    return state;
  },
  get best() {
    return best;
  },
};
