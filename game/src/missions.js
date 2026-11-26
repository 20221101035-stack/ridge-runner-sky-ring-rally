// missions.js — three sorties over the same valley, each with a different
// goal: a timed ring rally, a low canyon run, and a fuel-critical island hop
// that ends in a landing. Rings and gates are circles the plane flies
// through; crossing the ring's plane inside its radius scores.

import { terrainHeight, RUNWAY, ISLAND_STRIP } from './terrain.js';

export const MISSIONS = [
  {
    id: 'rally',
    name: 'SKY RING RALLY',
    tagline: 'Ten rings over the valley and lake. Beat the clock.',
    timeLimit: 150,
    spawn: { x: 0, y: 90, z: -420, heading: 0, speed: 46, throttle: 0.62 },
    fuelStart: 100,
    ringBonusSeconds: 8,
  },
  {
    id: 'canyon',
    name: 'CANYON RUN',
    tagline: 'Eight low gates down the west canyon. Stay low, stay fast.',
    timeLimit: 120,
    spawn: { x: -760, y: 120, z: -700, heading: 0.35, speed: 52, throttle: 0.7 },
    fuelStart: 100,
    ringBonusSeconds: 6,
  },
  {
    id: 'island',
    name: 'ISLAND HOP',
    tagline: 'Cross the lake and land on the island strip. Mind the fuel.',
    timeLimit: 240,
    spawn: { x: 0, y: 90, z: -420, heading: 0, speed: 46, throttle: 0.62 },
    fuelStart: 55,
    ringBonusSeconds: 0,
  },
];

function ring(x, z, altitude, radius, heading) {
  return {
    x,
    y: terrainHeight(x, z) + altitude,
    z,
    radius,
    // Rings face the direction the course runs, so they read as targets.
    nx: Math.sin(heading),
    nz: Math.cos(heading),
    passed: false,
    flash: 0,
  };
}

export function buildCourse(missionId) {
  if (missionId === 'rally') {
    // A smooth clockwise loop around the valley and the lake: each leg
    // turns less than 90 degrees from the last, so the course flows.
    return [
      ring(0, 120, 70, 30, 0),
      ring(-260, 480, 80, 30, 0.3),
      ring(320, 820, 90, 30, -0.4),
      ring(900, 900, 85, 30, -1.1),
      ring(1440, 900, 75, 30, 0), // over the lake
      ring(1560, 1400, 90, 28, 2.6),
      ring(900, 1620, 95, 28, 2.6),
      ring(300, 1500, 90, 28, 2.9),
      ring(-100, 1100, 80, 30, 2.9),
      ring(0, 700, 70, 32, Math.PI), // home over the runway
    ];
  }
  if (missionId === 'canyon') {
    // Gates follow the winding river canyon west of the valley.
    const gates = [];
    const zs = [-420, -80, 260, 600, 940, 1280, 1620, 1960];
    zs.forEach((z, i) => {
      const x = Math.sin(z / 520 + 1.2) * 260 - 700 + (i % 2 === 0 ? 40 : -40);
      gates.push(ring(x, z, 46, 26, 0));
    });
    return gates;
  }
  // Island hop: two guide rings point the way across the lake.
  return [
    ring(560, 420, 80, 30, -0.9),
    ring(1080, 760, 80, 30, -1.1),
  ];
}

export function createRun(mission) {
  return {
    mission,
    rings: buildCourse(mission.id),
    ringIndex: 0,
    score: 0,
    combo: 0,
    timeLeft: mission.timeLimit,
    lowBonus: 0,
    lowTimer: 0,
    finished: false,
    outcome: null, // 'complete' | 'crashed' | 'time' | 'landed' | 'fuel'
    message: '',
    messageTimer: 0,
    warnTimer: 0,
    elapsed: 0,
  };
}

function ringPlaneDistance(plane, r) {
  // Signed distance of the plane from the ring's plane, along its normal.
  return (plane.x - r.x) * r.nx + (plane.z - r.z) * r.nz;
}

export function updateRun(run, plane, dt, events) {
  if (run.finished) return;
  run.elapsed += dt;
  run.timeLeft -= dt;
  if (run.messageTimer > 0) run.messageTimer -= dt;

  // Low flying in the canyon run trickles bonus points.
  if (run.mission.id === 'canyon' && !plane.crashed) {
    const agl = plane.y - terrainHeight(plane.x, plane.z);
    if (agl < 55 && plane.speed > 45) {
      run.lowTimer += dt;
      if (run.lowTimer >= 1) {
        run.lowTimer -= 1;
        run.lowBonus += 5;
        run.score += 5;
      }
    } else {
      run.lowTimer = 0;
    }
  }

  // Ring crossing: sign change on the plane + inside the circle.
  const r = run.rings[run.ringIndex];
  if (r && !plane.crashed && !plane.landed) {
    const before = ringPlaneDistance(plane, r);
    // The plane moves this frame; check the crossing with the next step.
    const nx = plane.x + Math.sin(plane.heading) * plane.speed * dt;
    const nz = plane.z + Math.cos(plane.heading) * plane.speed * dt;
    const after = (nx - r.x) * r.nx + (nz - r.z) * r.nz;
    if ((before <= 0 && after > 0) || (before >= 0 && after < 0)) {
      const dx = plane.x - r.x;
      const dy = plane.y - r.y;
      const dz = plane.z - r.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < r.radius) {
        r.passed = true;
        r.flash = 1;
        run.combo += 1;
        const points = 100 + (run.combo - 1) * 25;
        run.score += points;
        run.timeLeft += run.mission.ringBonusSeconds;
        // A ring tops the tanks a little: the rally is long, and fuel is
        // the decision the pilot is always making.
        plane.fuel = Math.min(100, plane.fuel + 10);
        run.message = `RING ${run.ringIndex + 1}/${run.rings.length}  +${points}`;
        run.messageTimer = 1.6;
        run.ringIndex += 1;
        events.onRing?.(points);
        if (run.ringIndex >= run.rings.length) {
          if (run.mission.id === 'island') {
            run.message = 'ON COURSE — NOW LAND ON THE ISLAND STRIP';
            run.messageTimer = 3;
          } else {
            finishRun(run, 'complete', events);
          }
        }
      }
    }
  }

  // Landing ends the island hop.
  if (plane.landed) {
    const stripBonus = plane.landedStrip === 'island' ? 500 : 150;
    run.score += stripBonus;
    finishRun(run, 'landed', events, stripBonus);
    return;
  }

  if (plane.crashed) {
    finishRun(run, 'crashed', events);
    return;
  }

  if (plane.fuel <= 0 && run.mission.id === 'island' && !plane.landed) {
    run.message = 'FUEL EMPTY — GLIDE TO THE ISLAND';
    run.messageTimer = 2;
  }

  if (run.timeLeft <= 0) {
    run.timeLeft = 0;
    finishRun(run, 'time', events);
  }
}

function finishRun(run, outcome, events, stripBonus = 0) {
  run.finished = true;
  run.outcome = outcome;
  if (outcome === 'complete') {
    const timeBonus = Math.round(run.timeLeft) * 10;
    run.score += timeBonus;
    run.message = `COURSE COMPLETE!  TIME BONUS +${timeBonus}`;
    events.onComplete?.();
  } else if (outcome === 'landed') {
    run.message =
      planeStripText(run, stripBonus) || `LANDED!  +${stripBonus}`;
    events.onComplete?.();
  } else if (outcome === 'crashed') {
    run.message = 'CRASHED — THE SKYHAWK IS DOWN';
    events.onCrash?.();
  } else if (outcome === 'time') {
    run.message = "TIME'S UP — THE RINGS WAIT FOR NO ONE";
    events.onCrash?.();
  }
  run.messageTimer = 999;
}

function planeStripText(run, stripBonus) {
  return `LANDED ON THE ISLAND STRIP!  +${stripBonus}`;
}

export function nextRing(run) {
  return run.rings[run.ringIndex] ?? null;
}

export function distanceToNextRing(run, plane) {
  const r = nextRing(run);
  if (!r) return 0;
  return Math.hypot(r.x - plane.x, r.y - plane.y, r.z - plane.z);
}

export function homeStrip() {
  return RUNWAY;
}

export function islandStrip() {
  return ISLAND_STRIP;
}
