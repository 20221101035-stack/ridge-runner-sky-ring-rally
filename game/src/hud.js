// hud.js — the glass over the world: compass tape, speed and altitude,
// the attitude ball, fuel and throttle, score and timer, plus the menu and
// end screens. Instruments are drawn lit, as if the panel is switched on.

import { headingDegrees, compassPoint } from './physics.js';
import { distanceToNextRing, nextRing } from './missions.js';
import { terrainHeight } from './terrain.js';

const PANEL = 'rgba(8, 18, 28, 0.72)';
const PANEL_EDGE = 'rgba(140, 200, 240, 0.5)';
const CYAN = '#7fd8ff';
const AMBER = '#ffd94d';
const GREEN = '#8dff9e';
const RED = '#ff5a5a';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = PANEL;
  roundRect(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = PANEL_EDGE;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function gauge(ctx, x, y, r, value, min, max, label, unit, accent) {
  // A round dial with a needle, a digital readout and a label.
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(6, 14, 22, 0.85)';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  // Tick marks.
  ctx.strokeStyle = 'rgba(220, 235, 245, 0.7)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
    const x1 = Math.cos(a) * (r - 6);
    const y1 = Math.sin(a) * (r - 6);
    const x2 = Math.cos(a) * (r - 13);
    const y2 = Math.sin(a) * (r - 13);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  const frac = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const na = Math.PI * 0.75 + frac * Math.PI * 1.5;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(na) * (r - 16), Math.sin(na) * (r - 16));
  ctx.stroke();
  ctx.fillStyle = '#eaf6ff';
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.round(r * 0.42)}px ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(Math.round(value)), 0, r * 0.34);
  ctx.fillStyle = 'rgba(200, 225, 240, 0.85)';
  ctx.font = `bold ${Math.round(r * 0.22)}px ui-monospace, monospace`;
  ctx.fillText(label, 0, -r * 0.52);
  ctx.font = `${Math.round(r * 0.18)}px ui-monospace, monospace`;
  ctx.fillText(unit, 0, r * 0.62);
  ctx.restore();
}

function attitudeBall(ctx, x, y, r, pitch, bank, time) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.rotate(-bank);
  const pitchPx = (pitch / 0.62) * r * 0.7;
  // Sky half and ground half, sliding with pitch.
  ctx.fillStyle = '#4a90c4';
  ctx.fillRect(-r, -r + pitchPx, r * 2, r);
  ctx.fillStyle = '#7a5a34';
  ctx.fillRect(-r, pitchPx, r * 2, r);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-r, pitchPx);
  ctx.lineTo(r, pitchPx);
  ctx.stroke();
  for (let i = 1; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(-r * 0.4, pitchPx - i * r * 0.3);
    ctx.lineTo(r * 0.4, pitchPx - i * r * 0.3);
    ctx.moveTo(-r * 0.4, pitchPx + i * r * 0.3);
    ctx.lineTo(r * 0.4, pitchPx + i * r * 0.3);
    ctx.stroke();
  }
  ctx.restore();
  // Fixed aircraft symbol over the ball.
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = '#ffd94d';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-r * 0.55, 0);
  ctx.lineTo(-r * 0.15, 0);
  ctx.moveTo(r * 0.15, 0);
  ctx.lineTo(r * 0.55, 0);
  ctx.moveTo(0, -3);
  ctx.lineTo(0, 3);
  ctx.stroke();
  ctx.strokeStyle = AMBER;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function compassTape(ctx, width, headingDeg) {
  const cx = width / 2;
  const y = 26;
  panel(ctx, cx - 210, 8, 420, 40);
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, cx - 210, 8, 420, 40, 10);
  ctx.clip();
  ctx.fillStyle = '#eaf6ff';
  ctx.font = 'bold 15px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let d = -120; d <= 120; d += 15) {
    const deg = Math.round(((headingDeg + d) % 360 + 360) % 360);
    const px = cx + d * 1.5;
    const major = deg % 45 === 0;
    ctx.strokeStyle = major ? '#ffffff' : 'rgba(220,235,245,0.5)';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(px, y + 8);
    ctx.lineTo(px, y + (major ? 18 : 13));
    ctx.stroke();
    if (major) {
      const label = deg % 90 === 0 ? compassPoint(deg) : String(deg).padStart(3, '0');
      ctx.fillText(label, px, y - 6);
    }
  }
  ctx.restore();
  // Centre caret + digital heading.
  ctx.fillStyle = AMBER;
  ctx.beginPath();
  ctx.moveTo(cx - 7, 8);
  ctx.lineTo(cx + 7, 8);
  ctx.lineTo(cx, 20);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${String(Math.round(headingDeg)).padStart(3, '0')}° ${compassPoint(headingDeg)}`, cx, 42);
}

function bar(ctx, x, y, w, h, frac, colour, label) {
  ctx.fillStyle = 'rgba(6, 14, 22, 0.85)';
  roundRect(ctx, x, y, w, h, 5);
  ctx.fill();
  ctx.fillStyle = colour;
  const inner = Math.max(0, Math.min(1, frac)) * (w - 4);
  if (inner > 2) {
    roundRect(ctx, x + 2, y + 2, inner, h - 4, 4);
    ctx.fill();
  }
  ctx.fillStyle = '#eaf6ff';
  ctx.font = 'bold 12px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + 8, y + h / 2 + 0.5);
}

export function drawHud(ctx, plane, run, width, height, time) {
  const knots = Math.round(plane.speed * 1.944);
  const feet = Math.round(plane.y * 3.281);
  const headingDeg = headingDegrees(plane);

  compassTape(ctx, width, headingDeg);

  // Top-left: score, rings, timer.
  panel(ctx, 12, 8, 250, 96);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 15px ui-monospace, monospace';
  ctx.fillText(`SCORE  ${run.score}`, 26, 32);
  const ring = nextRing(run);
  ctx.fillStyle = CYAN;
  ctx.font = '13px ui-monospace, monospace';
  ctx.fillText(
    ring ? `RING ${run.ringIndex + 1}/${run.rings.length}   ${Math.round(distanceToNextRing(run, plane))} m` : 'ALL RINGS DONE',
    26, 56,
  );
  const timeColour = run.timeLeft < 20 ? RED : '#ffffff';
  ctx.fillStyle = timeColour;
  ctx.font = 'bold 17px ui-monospace, monospace';
  const mm = Math.floor(run.timeLeft / 60);
  const ss = Math.floor(run.timeLeft % 60).toString().padStart(2, '0');
  ctx.fillText(`TIME  ${mm}:${ss}`, 26, 84);
  if (run.combo > 1) {
    ctx.fillStyle = AMBER;
    ctx.font = 'bold 13px ui-monospace, monospace';
    ctx.fillText(`COMBO x${run.combo}`, 26, 100 - 4);
  }

  // Top-right: fuel and throttle.
  panel(ctx, width - 262, 8, 250, 96);
  const fuelColour = plane.fuel < 20 ? RED : plane.fuel < 45 ? AMBER : GREEN;
  bar(ctx, width - 248, 22, 222, 20, plane.fuel / 100, fuelColour, `FUEL ${Math.round(plane.fuel)}%`);
  bar(ctx, width - 248, 52, 222, 20, plane.throttle, CYAN, `THROTTLE ${Math.round(plane.throttle * 100)}%`);
  ctx.fillStyle = 'rgba(200, 225, 240, 0.85)';
  ctx.font = '12px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText('SHIFT/CTRL or wheel: throttle', width - 248, 88);

  // Bottom instrument strip.
  const stripY = height - 118;
  panel(ctx, 12, stripY, 330, 106);
  gauge(ctx, 62, stripY + 53, 40, knots, 0, 160, 'SPEED', 'KT', CYAN);
  gauge(ctx, 158, stripY + 53, 40, feet, 0, 2000, 'ALT', 'FT', GREEN);
  attitudeBall(ctx, 258, stripY + 53, 40, plane.pitch, plane.bank, time);

  // Vertical speed + ground clearance, bottom-right.
  panel(ctx, width - 262, stripY, 250, 106);
  const vs = Math.round(plane.verticalSpeed * 3.281 * 60);
  const agl = Math.max(0, Math.round((plane.y - terrainHeight(plane.x, plane.z)) * 3.281));
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 15px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`V/S  ${vs >= 0 ? '+' : ''}${vs} FT/MIN`, width - 248, stripY + 32);
  ctx.fillText(`AGL  ${agl} FT`, width - 248, stripY + 60);
  const warn = plane.fuel < 15 && plane.fuel > 0;
  ctx.fillStyle = warn ? RED : 'rgba(200, 225, 240, 0.85)';
  ctx.font = '13px ui-monospace, monospace';
  ctx.fillText(warn ? 'LOW FUEL — FIND A STRIP' : 'ARROWS / WASD / mouse to fly', width - 248, stripY + 88);

  // Centre message (ring scored, warnings).
  if (run.message && run.messageTimer > 0) {
    const alpha = Math.min(1, run.messageTimer);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 8;
    ctx.fillText(run.message, width / 2, height * 0.3);
    ctx.restore();
  }

  // Stall / pull-up warnings.
  const aglNow = plane.y - terrainHeight(plane.x, plane.z);
  if (plane.speed < 33 && !run.finished) {
    ctx.save();
    ctx.fillStyle = Math.sin(time * 8) > 0 ? RED : '#ffffff';
    ctx.font = 'bold 22px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('STALL — NOSE DOWN, ADD THROTTLE', width / 2, height * 0.38);
    ctx.restore();
  }
  if (aglNow < 45 && plane.verticalSpeed < -4 && !run.finished) {
    ctx.save();
    ctx.fillStyle = Math.sin(time * 8) > 0 ? RED : '#ffffff';
    ctx.font = 'bold 22px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PULL UP!', width / 2, height * 0.38);
    ctx.restore();
  }
}

export function drawMenu(ctx, width, height, time, best) {
  // Dim the world a touch, then the title card.
  ctx.fillStyle = 'rgba(6, 16, 26, 0.45)';
  ctx.fillRect(0, 0, width, height);
  const cx = width / 2;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#ffd94d';
  ctx.font = 'bold 64px ui-monospace, monospace';
  ctx.fillText('RIDGE RUNNER', cx, height * 0.2);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px ui-monospace, monospace';
  ctx.fillText('— SKY RING RALLY —', cx, height * 0.2 + 40);
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(230, 242, 250, 0.95)';
  ctx.font = '16px ui-monospace, monospace';
  ctx.fillText('Fly the Skyhawk through the glowing rings, over the valley, the canyon and the lake.', cx, height * 0.2 + 78);
  ctx.fillText('Pick a sortie below, or press 1 / 2 / 3. Landings count. Fuel counts. Rings pay.', cx, height * 0.2 + 102);
  ctx.restore();

  // Mission cards. Positions are stored on the function for click handling.
  const cards = drawMenu.cards;
  ctx.save();
  cards.forEach((card, i) => {
    const y = height * 0.42 + i * 92;
    const hover = card.hover ? 1 : 0;
    ctx.fillStyle = hover ? 'rgba(20, 44, 66, 0.92)' : 'rgba(10, 26, 40, 0.85)';
    roundRect(ctx, cx - 330, y, 660, 78, 12);
    ctx.fill();
    ctx.strokeStyle = i === 0 ? AMBER : PANEL_EDGE;
    ctx.lineWidth = i === 0 ? 2 : 1;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.font = 'bold 19px ui-monospace, monospace';
    ctx.fillText(`${i + 1} · ${card.mission.name}`, cx - 308, y + 32);
    ctx.fillStyle = 'rgba(210, 230, 242, 0.9)';
    ctx.font = '14px ui-monospace, monospace';
    ctx.fillText(card.mission.tagline, cx - 308, y + 56);
    ctx.fillStyle = CYAN;
    ctx.textAlign = 'right';
    ctx.font = 'bold 14px ui-monospace, monospace';
    ctx.fillText(`${card.mission.timeLimit}s · ${card.rings} rings`, cx + 308, y + 32);
    card.x = cx - 330;
    card.y = y;
    card.w = 660;
    card.h = 78;
  });
  ctx.restore();

  ctx.save();
  ctx.fillStyle = 'rgba(220, 236, 246, 0.9)';
  ctx.font = '14px ui-monospace, monospace';
  ctx.textAlign = 'center';
  const cy = height * 0.42 + 3 * 92 + 26;
  ctx.fillText('ARROWS / WASD — pitch & bank      SHIFT / CTRL or wheel — throttle      SPACE — airbrake', cx, cy);
  ctx.fillText('Mouse steers too — move it to bank and pitch.  R — restart   P — pause   M — sound', cx, cy + 22);
  if (best > 0) {
    ctx.fillStyle = AMBER;
    ctx.font = 'bold 15px ui-monospace, monospace';
    ctx.fillText(`BEST SCORE SO FAR: ${best}`, cx, cy + 52);
  }
  ctx.restore();
}
drawMenu.cards = [];

export function drawEndScreen(ctx, width, height, run, best) {
  ctx.fillStyle = 'rgba(6, 16, 26, 0.55)';
  ctx.fillRect(0, 0, width, height);
  const cx = width / 2;
  const cy = height * 0.42;
  ctx.save();
  ctx.textAlign = 'center';
  const titles = {
    complete: 'COURSE COMPLETE!',
    landed: 'TOUCHDOWN!',
    crashed: 'CRASHED',
    time: "TIME'S UP",
  };
  ctx.fillStyle = run.outcome === 'crashed' || run.outcome === 'time' ? RED : GREEN;
  ctx.font = 'bold 52px ui-monospace, monospace';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 10;
  ctx.fillText(titles[run.outcome] ?? 'SORTIE OVER', cx, cy);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px ui-monospace, monospace';
  ctx.fillText(`SCORE  ${run.score}`, cx, cy + 52);
  ctx.fillStyle = 'rgba(220, 236, 246, 0.95)';
  ctx.font = '16px ui-monospace, monospace';
  ctx.fillText(
    `Rings ${run.ringIndex}/${run.rings.length}   ·   ${run.mission.name}   ·   Best ${Math.max(best, run.score)}`,
    cx, cy + 86,
  );
  ctx.fillText('Press R to fly again, or 1 / 2 / 3 to pick another sortie.', cx, cy + 118);
  ctx.restore();
}

export function drawPaused(ctx, width, height) {
  ctx.fillStyle = 'rgba(6, 16, 26, 0.55)';
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 44px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('PAUSED', width / 2, height / 2);
  ctx.font = '16px ui-monospace, monospace';
  ctx.fillText('Press P to keep flying', width / 2, height / 2 + 36);
  ctx.restore();
}
