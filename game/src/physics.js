// physics.js — a small arcade flight model: throttle sets speed, pitch sets
// climb, bank sets turn. Slow flight stalls, the ground is unforgiving, and
// a gentle touchdown on a strip counts as a landing.

import { terrainHeight, isOverRunway } from './terrain.js';

export const PLANE = {
  minSpeed: 24, // m/s — below this the wing stops flying
  cruiseSpeed: 62, // m/s at full throttle, level
  maxPitch: 0.62, // radians, about 35 degrees
  maxBank: 1.05, // radians, about 60 degrees
  groundClearance: 2.2, // metres of skid below the fuselage
};

export function createPlane() {
  return {
    x: 0,
    y: 78,
    z: -420,
    heading: 0, // 0 = north (+z), grows clockwise
    pitch: 0,
    bank: 0,
    speed: 46,
    throttle: 0.62,
    fuel: 100,
    verticalSpeed: 0,
    crashed: false,
    landed: false,
    landedStrip: null,
  };
}

export function resetPlane(plane, spawn) {
  plane.x = spawn.x;
  plane.y = spawn.y;
  plane.z = spawn.z;
  plane.heading = spawn.heading;
  plane.pitch = 0;
  plane.bank = 0;
  plane.speed = spawn.speed ?? 46;
  plane.throttle = spawn.throttle ?? 0.62;
  plane.fuel = 100;
  plane.verticalSpeed = 0;
  plane.crashed = false;
  plane.landed = false;
  plane.landedStrip = null;
}

export function updatePlane(plane, input, dt) {
  if (plane.crashed || plane.landed) return;

  // Throttle: Shift / mouse wheel up, Ctrl / wheel down, 0..1.
  plane.throttle += input.throttleDelta * dt * 0.9;
  if (input.throttleUp) plane.throttle += dt * 0.55;
  if (input.throttleDown) plane.throttle -= dt * 0.55;
  plane.throttle = Math.max(0, Math.min(1, plane.throttle));

  // Fuel burns with throttle; empty tanks mean a glide.
  const burn = plane.throttle > 0 ? (0.25 + plane.throttle * 0.55) * dt : 0;
  plane.fuel = Math.max(0, plane.fuel - burn);
  const effectiveThrottle = plane.fuel > 0 ? plane.throttle : 0;

  // Pitch and bank ease toward the pilot's input.
  const targetPitch = input.pitch * PLANE.maxPitch;
  const targetBank = input.roll * PLANE.maxBank;
  plane.pitch += (targetPitch - plane.pitch) * Math.min(1, dt * 3.2);
  plane.bank += (targetBank - plane.bank) * Math.min(1, dt * 3.6);

  // Speed chases the throttle, slower when climbing, faster diving.
  const targetSpeed = PLANE.minSpeed + effectiveThrottle * (PLANE.cruiseSpeed - PLANE.minSpeed);
  const climbPenalty = Math.sin(plane.pitch) * 26;
  plane.speed += (targetSpeed - climbPenalty - plane.speed) * Math.min(1, dt * 0.55);
  if (input.brake) plane.speed = Math.max(PLANE.minSpeed * 1.15, plane.speed - dt * 34);

  // A stalled wing sinks and answers the stick weakly.
  const stalled = plane.speed < 33;
  const pitchAuthority = stalled ? 0.35 : 1;

  // Turn rate comes from the bank, like a real aeroplane, tightened a
  // little for an arcade feel: slow flight turns tighter than fast flight,
  // so throttle discipline matters in the turns.
  const turnRate = (9.81 * Math.tan(plane.bank)) / Math.max(plane.speed, 20) * 1.6;
  plane.heading += turnRate * dt;

  const forwardX = Math.sin(plane.heading);
  const forwardZ = Math.cos(plane.heading);
  plane.x += forwardX * plane.speed * dt;
  plane.z += forwardZ * plane.speed * dt;

  let climb = Math.sin(plane.pitch) * plane.speed * pitchAuthority;
  if (stalled) climb -= (33 - plane.speed) * 0.55;
  plane.verticalSpeed = climb;
  plane.y += climb * dt;

  // Stay inside the valley bowl; the ridges turn the plane back.
  const r = Math.hypot(plane.x, plane.z - 300);
  if (r > 3600) {
    const push = (r - 3600) / 200;
    plane.heading += push * dt * (plane.x * forwardZ - (plane.z - 300) * forwardX > 0 ? 1 : -1) * 0.4;
  }
  if (plane.y > 620) {
    plane.y = 620;
    plane.pitch = Math.min(plane.pitch, 0);
  }

  // The ground.
  const ground = terrainHeight(plane.x, plane.z);
  if (plane.y <= ground + PLANE.groundClearance) {
    const gentle =
      isOverRunway(plane.x, plane.z) &&
      Math.abs(plane.verticalSpeed) < 4.5 &&
      plane.speed < 52 &&
      Math.abs(plane.bank) < 0.25 &&
      Math.abs(plane.pitch) < 0.2;
    if (gentle) {
      plane.landed = true;
      plane.landedStrip = plane.x > 1000 ? 'island' : 'home';
      plane.y = ground + PLANE.groundClearance;
    } else {
      plane.crashed = true;
      plane.y = ground + PLANE.groundClearance;
    }
  }
}

export function headingDegrees(plane) {
  let deg = (plane.heading * 180) / Math.PI;
  deg = ((deg % 360) + 360) % 360;
  return deg;
}

export function compassPoint(deg) {
  const points = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return points[Math.round(deg / 22.5) % 16];
}
