// render.js — draws the whole world on one 2D canvas: a projected
// heightfield for the terrain, a painted sky with sun and clouds, glowing
// target rings, the runway, and the Skyhawk herself in chase view.
// No images, no assets: every pixel is drawn by this file.

import { terrainHeight, terrainColor, terrainNormal, WATER_LEVEL, RUNWAY, ISLAND_STRIP } from './terrain.js';

const FOCAL = 760; // perspective focal length in pixels at 1280 wide

// Pre-seeded clouds so the sky is the same every run.
const CLOUDS = [];
{
  let seed = 1234567;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 42; i++) {
    CLOUDS.push({
      x: (rand() - 0.5) * 9000,
      y: 420 + rand() * 260,
      z: (rand() - 0.5) * 9000 + 800,
      s: 120 + rand() * 260,
      a: 0.5 + rand() * 0.4,
    });
  }
}

function makeCamera(plane, width, height) {
  // Chase camera: behind and above the plane, looking along its heading,
  // rolling a little with the bank so the horizon tilts like the pilot sees.
  const back = 30;
  const up = 8.5;
  const fx = Math.sin(plane.heading);
  const fz = Math.cos(plane.heading);
  const cam = {
    x: plane.x - fx * back,
    y: plane.y + up,
    z: plane.z - fz * back,
    heading: plane.heading,
    pitch: plane.pitch * 0.55,
    roll: plane.bank * 0.45,
    width,
    height,
    cx: width / 2,
    cy: height / 2,
  };
  return cam;
}

// Project a world point into screen space. Returns null behind the camera.
function project(cam, x, y, z) {
  let dx = x - cam.x;
  let dy = y - cam.y;
  let dz = z - cam.z;
  // Yaw: rotate by -heading around Y so the forward direction (+z turned
  // by the heading) becomes +z in camera space.
  const cosH = Math.cos(cam.heading);
  const sinH = Math.sin(cam.heading);
  let rx = dx * cosH - dz * sinH;
  let rz = dx * sinH + dz * cosH;
  let ry = dy;
  // Pitch: rotate around X.
  const cosP = Math.cos(cam.pitch);
  const sinP = Math.sin(cam.pitch);
  const ty = ry * cosP - rz * sinP;
  rz = ry * sinP + rz * cosP;
  ry = ty;
  // Roll: rotate by +roll around Z, so banking right lifts the horizon's
  // right side, the way a pilot sees it.
  const cosR = Math.cos(cam.roll);
  const sinR = Math.sin(cam.roll);
  const qx = rx * cosR - ry * sinR;
  ry = rx * sinR + ry * cosR;
  rx = qx;
  if (rz < 4) return null;
  const scale = (FOCAL * cam.width) / 1280 / rz;
  return {
    x: cam.cx + rx * scale,
    y: cam.cy - ry * scale,
    depth: rz,
    scale,
  };
}

function drawSky(ctx, cam, time) {
  const w = cam.width;
  const h = cam.height;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  const horizonY = cam.cy - Math.tan(cam.pitch) * FOCAL * (w / 1280) * 0.4;
  grad.addColorStop(0, '#2f6fb4');
  grad.addColorStop(0.45, '#7fb2dd');
  grad.addColorStop(0.62, '#cfe4f2');
  grad.addColorStop(0.75, '#e8d9b0');
  grad.addColorStop(1, '#8a6f4d');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Sun, low in the west, with a soft halo.
  const sun = project(cam, cam.x - 2600, 560, cam.z + 3400);
  if (sun) {
    const halo = ctx.createRadialGradient(sun.x, sun.y, 4, sun.x, sun.y, 130);
    halo.addColorStop(0, 'rgba(255, 244, 200, 0.95)');
    halo.addColorStop(0.25, 'rgba(255, 226, 150, 0.55)');
    halo.addColorStop(1, 'rgba(255, 226, 150, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(sun.x - 140, sun.y - 140, 280, 280);
    ctx.fillStyle = '#fff7d6';
    ctx.beginPath();
    ctx.arc(sun.x, sun.y, 26, 0, Math.PI * 2);
    ctx.fill();
  }

  // Clouds drift slowly with time, projected like everything else.
  ctx.fillStyle = '#ffffff';
  for (const c of CLOUDS) {
    const drift = ((time * 2.2) % 9000) - 4500;
    const p = project(cam, c.x + drift * 0.4, c.y, c.z);
    if (!p || p.x < -300 || p.x > w + 300 || p.y < -120 || p.y > h * 0.72) continue;
    const s = c.s * p.scale * 0.9;
    if (s < 4) continue;
    ctx.globalAlpha = c.a * Math.min(1, s / 60);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, s, s * 0.34, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x - s * 0.55, p.y + s * 0.08, s * 0.6, s * 0.26, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x + s * 0.55, p.y + s * 0.06, s * 0.62, s * 0.27, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawTerrain(ctx, cam, plane) {
  const CELL = 72;
  const COLS = 44;
  const ROWS = 42;
  const fx = Math.sin(cam.heading);
  const fz = Math.cos(cam.heading);
  const rx = Math.cos(cam.heading);
  const rz = -Math.sin(cam.heading);

  // Grid origin: snapped to the cell so the mesh never swims as we fly.
  const originX = Math.floor((plane.x - fx * 180) / CELL) * CELL;
  const originZ = Math.floor((plane.z - fz * 180) / CELL) * CELL;

  // Sample heights and normals once per vertex.
  const heights = [];
  const normals = [];
  for (let row = 0; row <= ROWS; row++) {
    heights.push([]);
    normals.push([]);
    for (let col = 0; col <= COLS; col++) {
      const wx = originX + (col - COLS / 2) * CELL * rx + row * CELL * fx;
      const wz = originZ + (col - COLS / 2) * CELL * rz + row * CELL * fz;
      heights[row][col] = terrainHeight(wx, wz);
      normals[row][col] = terrainNormal(wx, wz);
    }
  }

  // Painter's order: far rows first. Skip quads fully behind the camera.
  for (let row = ROWS; row >= 1; row--) {
    for (let col = 0; col < COLS; col++) {
      const wx0 = originX + (col - COLS / 2) * CELL * rx + (row - 1) * CELL * fx;
      const wz0 = originZ + (col - COLS / 2) * CELL * rz + (row - 1) * CELL * fz;
      const wx1 = wx0 + CELL * rx;
      const wz1 = wz0 + CELL * rz;
      const wx2 = wx0 + CELL * fx;
      const wz2 = wz0 + CELL * fz;
      const wx3 = wx2 + CELL * rx;
      const wz3 = wz2 + CELL * rz;
      const p0 = project(cam, wx0, heights[row - 1][col], wz0);
      const p1 = project(cam, wx1, heights[row - 1][col + 1], wz1);
      const p2 = project(cam, wx2, heights[row][col], wz2);
      const p3 = project(cam, wx3, heights[row][col + 1], wz3);
      if (!p0 || !p1 || !p2 || !p3) continue;
      const cx = (wx0 + wx3) / 2;
      const cz = (wz0 + wz3) / 2;
      const ch = (heights[row - 1][col] + heights[row][col + 1]) / 2;
      // One normal per quad, averaged over its four corners: a single
      // corner's normal made every quad edge read as a seam.
      const n00 = normals[row - 1][col];
      const n10 = normals[row - 1][col + 1];
      const n01 = normals[row][col];
      const n11 = normals[row][col + 1];
      const cn = [
        (n00[0] + n10[0] + n01[0] + n11[0]) / 4,
        (n00[1] + n10[1] + n01[1] + n11[1]) / 4,
        (n00[2] + n10[2] + n01[2] + n11[2]) / 4,
      ];
      ctx.fillStyle = terrainColor(cx, cz, ch, cn);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.closePath();
      ctx.fill();
      // Stroke with the same colour: two anti-aliased quads sharing an edge
      // otherwise leave a hairline crack of sky between them.
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}

function quad(ctx, cam, corners, fill) {
  const pts = corners.map(([x, y, z]) => project(cam, x, y, z));
  if (pts.some((p) => !p)) return;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fill();
}

// A runway is only 28 m wide, narrower than a terrain cell, so the mesh
// can never paint it: draw each strip as its own projected quads, with
// threshold bars and a dashed centreline, a hair above the flattened ground.
function drawStrip(ctx, cam, strip) {
  const y = strip.altitude + 0.4;
  const northSouth = strip.heading === 0;
  const long0 = northSouth ? strip.z0 : strip.x0;
  const long1 = northSouth ? strip.z1 : strip.x1;
  const across0 = northSouth ? strip.x0 : strip.z0;
  const across1 = northSouth ? strip.x1 : strip.z1;
  const at = (along, across) =>
    northSouth ? [across, y, along] : [along, y, across];
  quad(ctx, cam, [at(long0, across0), at(long0, across1), at(long1, across1), at(long1, across0)], '#43464b');
  // Threshold bars at both ends.
  quad(ctx, cam, [at(long0, across0), at(long0, across1), at(long0 + 20, across1), at(long0 + 20, across0)], '#e8e8de');
  quad(ctx, cam, [at(long1 - 20, across0), at(long1 - 20, across1), at(long1, across1), at(long1, across0)], '#e8e8de');
  // Dashed centreline.
  const mid = (across0 + across1) / 2;
  for (let a = long0 + 34; a < long1 - 34; a += 52) {
    quad(ctx, cam, [at(a, mid - 1.4), at(a, mid + 1.4), at(a + 26, mid + 1.4), at(a + 26, mid - 1.4)], '#e8e8de');
  }
}

function drawStrips(ctx, cam) {
  drawStrip(ctx, cam, RUNWAY);
  drawStrip(ctx, cam, ISLAND_STRIP);
}

function drawRing(ctx, cam, r, time, isNext) {
  const centre = project(cam, r.x, r.y, r.z);
  // A ring at or behind the camera plane would project as a giant
  // distorted ellipse; skip it until the pilot has it ahead again.
  if (!centre || centre.depth < 40) return;
  // The ring faces the pilot: build its circle in the plane facing the
  // camera's forward direction.
  const N = 26;
  const pts = [];
  const up = [0, 1, 0];
  const side = [r.nz, 0, -r.nx]; // horizontal, perpendicular to the normal
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const px = r.x + side[0] * Math.cos(a) * r.radius + up[0] * Math.sin(a) * r.radius;
    const py = r.y + side[1] * Math.cos(a) * r.radius + up[1] * Math.sin(a) * r.radius;
    const pz = r.z + side[2] * Math.cos(a) * r.radius + up[2] * Math.sin(a) * r.radius;
    const p = project(cam, px, py, pz);
    if (p) pts.push(p);
  }
  if (pts.length < 8) return;
  const pulse = isNext ? 0.75 + 0.25 * Math.sin(time * 5) : 0.5;
  const colour = r.passed ? '#8dff9e' : isNext ? '#ffd94d' : '#5ec8ff';
  ctx.save();
  ctx.shadowColor = colour;
  ctx.shadowBlur = 18 * pulse + 6;
  ctx.strokeStyle = colour;
  ctx.lineWidth = Math.max(2, centre.scale * 1.6);
  ctx.globalAlpha = 0.65 + 0.35 * pulse;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
  if (isNext) {
    // A floating chevron above the next ring so it is findable at range.
    const top = project(cam, r.x, r.y + r.radius + 26, r.z);
    if (top) {
      ctx.save();
      ctx.fillStyle = '#ffd94d';
      ctx.globalAlpha = 0.9;
      const s = Math.max(6, centre.scale * 7);
      const bob = Math.sin(time * 4) * 4;
      ctx.beginPath();
      ctx.moveTo(top.x, top.y + bob + s);
      ctx.lineTo(top.x - s * 0.7, top.y + bob);
      ctx.lineTo(top.x + s * 0.7, top.y + bob);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
}

function drawPlaneShadow(ctx, cam, plane) {
  const ground = terrainHeight(plane.x, plane.z);
  if (plane.y - ground > 260) return;
  const p = project(cam, plane.x, ground + 1, plane.z);
  if (!p) return;
  const s = Math.max(3, 900 / Math.max(40, plane.y - ground));
  ctx.save();
  ctx.fillStyle = 'rgba(20, 26, 20, 0.35)';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, s * 1.6, s * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPlane(ctx, cam, plane, time) {
  const w = cam.width;
  const h = cam.height;
  const cx = w / 2;
  const cy = h * 0.66;
  const s = w / 1280; // scale with window size
  const bank = plane.bank;
  const pitchLift = -plane.pitch * 46;

  ctx.save();
  ctx.translate(cx, cy + pitchLift);
  ctx.rotate(bank * 0.9);
  ctx.scale(s, s);

  // Propeller blur disc + two blades, spinning with the throttle.
  const propAngle = time * (18 + plane.throttle * 46);
  ctx.save();
  ctx.translate(0, -6);
  ctx.fillStyle = 'rgba(200, 210, 220, 0.16)';
  ctx.beginPath();
  ctx.arc(0, 0, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(propAngle);
  ctx.fillStyle = 'rgba(40, 44, 50, 0.75)';
  ctx.fillRect(-3, -34, 6, 68);
  ctx.rotate(Math.PI / 2);
  ctx.fillRect(-3, -34, 6, 68);
  ctx.restore();

  // Wings: broad, slightly swept, sun-yellow with navy tips.
  ctx.fillStyle = '#f2b705';
  ctx.beginPath();
  ctx.moveTo(-14, 2);
  ctx.lineTo(-118, 16);
  ctx.lineTo(-122, 26);
  ctx.lineTo(-12, 14);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(14, 2);
  ctx.lineTo(118, 16);
  ctx.lineTo(122, 26);
  ctx.lineTo(12, 14);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#1d3557';
  ctx.fillRect(-122, 16, 16, 10);
  ctx.fillRect(106, 16, 16, 10);

  // Tailplane and fin.
  ctx.fillStyle = '#e4572e';
  ctx.beginPath();
  ctx.moveTo(-8, 34);
  ctx.lineTo(-46, 52);
  ctx.lineTo(-44, 60);
  ctx.lineTo(-6, 44);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(8, 34);
  ctx.lineTo(46, 52);
  ctx.lineTo(44, 60);
  ctx.lineTo(6, 44);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, 30);
  ctx.lineTo(-4, 62);
  ctx.lineTo(6, 62);
  ctx.lineTo(8, 30);
  ctx.closePath();
  ctx.fill();

  // Fuselage: cream body, red cheatline, glass canopy.
  ctx.fillStyle = '#f6f1e3';
  ctx.beginPath();
  ctx.moveTo(0, -34);
  ctx.quadraticCurveTo(13, -18, 13, 8);
  ctx.quadraticCurveTo(13, 34, 5, 52);
  ctx.lineTo(-5, 52);
  ctx.quadraticCurveTo(-13, 34, -13, 8);
  ctx.quadraticCurveTo(-13, -18, 0, -34);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#e4572e';
  ctx.fillRect(-13, 6, 26, 5);
  ctx.fillStyle = '#9fc6e8';
  ctx.beginPath();
  ctx.ellipse(0, -14, 8.5, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.beginPath();
  ctx.ellipse(-3, -18, 2.5, 6, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // Nose + spinner.
  ctx.fillStyle = '#1d3557';
  ctx.beginPath();
  ctx.moveTo(-7, -30);
  ctx.quadraticCurveTo(0, -38, 7, -30);
  ctx.quadraticCurveTo(0, -24, -7, -30);
  ctx.closePath();
  ctx.fill();

  // Navigation lights: red port, green starboard, blinking white tail.
  const blink = Math.sin(time * 6) > 0;
  ctx.fillStyle = '#ff2e2e';
  ctx.beginPath();
  ctx.arc(-120, 21, 3.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2eff5e';
  ctx.beginPath();
  ctx.arc(120, 21, 3.4, 0, Math.PI * 2);
  ctx.fill();
  if (blink) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 58, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function renderWorld(ctx, plane, run, time, width, height, showPlane = true) {
  const cam = makeCamera(plane, width, height);
  drawSky(ctx, cam, time);
  drawTerrain(ctx, cam, plane);
  drawStrips(ctx, cam);
  drawPlaneShadow(ctx, cam, plane);
  // Rings: far ones first so near ones draw over them.
  const sorted = [...run.rings].sort((a, b) => {
    const da = Math.hypot(a.x - plane.x, a.z - plane.z);
    const db = Math.hypot(b.x - plane.x, b.z - plane.z);
    return db - da;
  });
  sorted.forEach((r, i) => {
    const isNext = run.rings[run.ringIndex] === r;
    drawRing(ctx, cam, r, time, isNext);
  });
  if (showPlane) drawPlane(ctx, cam, plane, time);
  return cam;
}

export { project, makeCamera };
