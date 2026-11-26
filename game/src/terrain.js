// terrain.js — the world under the wings: a seeded heightfield valley with a
// runway, a lake with an island strip, and mountain ridges on every side.
// Everything here is computed from a fixed seed, so the same world shows up
// on every run and every screenshot.

export const WATER_LEVEL = 16;
export const RUNWAY = {
  // Home strip, running north (+z) through the middle of the valley.
  x0: -14, x1: 14, z0: -160, z1: 640, heading: 0, altitude: 48,
};
export const ISLAND_STRIP = {
  // Short grass strip on the lake island, running east-west.
  x0: 1290, x1: 1590, z0: 880, z1: 920, heading: Math.PI / 2, altitude: 46,
};
export const LAKE = { cx: 1440, cz: 900, rx: 560, ry: 430 };

// --- deterministic noise -------------------------------------------------

function hash2(ix, iz) {
  // Integer hash -> [0, 1). Same input, same output, on every machine.
  let h = (ix * 374761393 + iz * 668265263) | 0;
  h = (h ^ (h >> 13)) | 0;
  h = Math.imul(h, 1274126177);
  h = (h ^ (h >> 16)) >>> 0;
  return h / 4294967295;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

function valueNoise(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = smooth(x - ix);
  const fz = smooth(z - iz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

function fbm(x, z) {
  // Three octaves of value noise, roughly -1..1.
  const n1 = valueNoise(x, z) * 2 - 1;
  const n2 = valueNoise(x * 2.13 + 7.7, z * 2.13 + 3.1) * 2 - 1;
  const n3 = valueNoise(x * 4.31 + 13.5, z * 4.31 + 9.4) * 2 - 1;
  return n1 * 0.55 + n2 * 0.3 + n3 * 0.15;
}

// --- height field ----------------------------------------------------------

function ridgeFactor(x, z) {
  // Mountains grow with distance from the valley centre (0, 300).
  const dx = x / 2400;
  const dz = (z - 300) / 2600;
  const d = Math.sqrt(dx * dx + dz * dz);
  return Math.min(1, Math.max(0, (d - 0.3) / 0.55));
}

function lakeMask(x, z) {
  // 1 at the lake centre, fading to 0 outside a generous ellipse, so the
  // ridges never rise out of the lake itself.
  const dx = (x - LAKE.cx) / (LAKE.rx * 1.35);
  const dz = (z - LAKE.cz) / (LAKE.ry * 1.35);
  const d = dx * dx + dz * dz;
  if (d >= 1) return 0;
  return 1 - d;
}

function lakeDepth(x, z) {
  const dx = (x - LAKE.cx) / LAKE.rx;
  const dz = (z - LAKE.cz) / LAKE.ry;
  const d = dx * dx + dz * dz;
  if (d >= 1) return 0;
  return (1 - d) * 34; // bowl that dips below the water line
}

function stripBlend(x, z, strip, feather) {
  // 1 inside a strip, fading to 0 over `feather` metres outside it.
  const dx = Math.max(strip.x0 - x, 0, x - strip.x1);
  const dz = Math.max(strip.z0 - z, 0, z - strip.z1);
  const d = Math.sqrt(dx * dx + dz * dz);
  return Math.max(0, 1 - d / feather);
}

export function terrainHeight(x, z) {
  const ridge = ridgeFactor(x, z) * (1 - lakeMask(x, z));
  // The valley floor sits well above the water line: with the old base the
  // noise dipped under it all over the valley and left ponds everywhere.
  let h = 48 + fbm(x / 380, z / 380) * 22;
  h += ridge * (260 + fbm(x / 800 + 40, z / 800 + 11) * 260);
  // A real canyon: a deep winding channel down the west side, with a river
  // at its floor. The canyon run's gates sit in this cut.
  const river = Math.sin(z / 520 + 1.2) * 260 - 700;
  const riverDist = Math.abs(x - river);
  if (riverDist < 150) {
    const t = 1 - riverDist / 150;
    h -= 70 * t * t;
  }
  // Lake bowl.
  h -= lakeDepth(x, z);
  // Flatten the two strips so a landing reads as a landing.
  const home = stripBlend(x, z, RUNWAY, 90);
  if (home > 0) h = h * (1 - home) + RUNWAY.altitude * home;
  const island = stripBlend(x, z, ISLAND_STRIP, 70);
  if (island > 0) h = h * (1 - island) + ISLAND_STRIP.altitude * island;
  return h;
}

export function terrainNormal(x, z) {
  const e = 6;
  const hx = terrainHeight(x + e, z) - terrainHeight(x - e, z);
  const hz = terrainHeight(x, z + e) - terrainHeight(x, z - e);
  const inv = 1 / Math.sqrt(hx * hx + 4 * e * e + hz * hz);
  return [-hx * inv, 2 * e * inv, -hz * inv];
}

// --- colouring ---------------------------------------------------------------

function shade(base, light) {
  // light: 0..1 diffuse factor. Returns an rgb() string.
  const r = Math.min(255, Math.round(base[0] * (0.55 + 0.45 * light)));
  const g = Math.min(255, Math.round(base[1] * (0.55 + 0.45 * light)));
  const b = Math.min(255, Math.round(base[2] * (0.55 + 0.45 * light)));
  return `rgb(${r},${g},${b})`;
}

// Sun direction (normalised) used for the diffuse term.
const SUN = [0.55, 0.72, -0.42];
const SUN_LEN = Math.hypot(...SUN);
const SUN_N = SUN.map((v) => v / SUN_LEN);

export function terrainColor(x, z, h, normal, sunOverride) {
  const sun = sunOverride ?? SUN_N;
  const light = Math.max(0, normal[0] * sun[0] + normal[1] * sun[1] + normal[2] * sun[2]);
  // Smooth patchiness from low-frequency noise: per-cell hash jitter made
  // the mesh read as a wireframe grid, so it is deliberately smooth here.
  const jitter = fbm(x / 170 + 5, z / 170 + 2) * 0.07;

  // Water first: anything under the water line is the lake.
  if (h < WATER_LEVEL) {
    const depth = Math.min(1, (WATER_LEVEL - h) / 14);
    const deep = [16, 74, 110];
    const shallow = [64, 148, 168];
    const mix = [
      shallow[0] + (deep[0] - shallow[0]) * depth,
      shallow[1] + (deep[1] - shallow[1]) * depth,
      shallow[2] + (deep[2] - shallow[2]) * depth,
    ];
    return shade(mix, 0.65 + 0.35 * light);
  }

  // Runway asphalt + painted markings.
  const home = stripBlend(x, z, RUNWAY, 4);
  const island = stripBlend(x, z, ISLAND_STRIP, 4);
  const onStrip = Math.max(home, island);
  if (onStrip > 0.85) {
    const strip = home > island ? RUNWAY : ISLAND_STRIP;
    // `along` runs down the strip, `across` runs over it, whichever way
    // the strip points.
    const along = strip.heading === 0 ? z : x;
    const across = strip.heading === 0 ? x : z;
    const acrossCentre = strip.heading === 0 ? 0 : (strip.z0 + strip.z1) / 2;
    const end0 = strip.heading === 0 ? strip.z0 : strip.x0;
    const end1 = strip.heading === 0 ? strip.z1 : strip.x1;
    const isCentreline = Math.abs(across - acrossCentre) < 1.4 && Math.floor(along / 26) % 2 === 0;
    const nearEnd = along < end0 + 26 || along > end1 - 26;
    if (isCentreline || nearEnd) return shade([232, 232, 222], 0.9);
    return shade([52, 54, 58], 0.8 + 0.2 * light);
  }

  // Sandy beach ring around the lake.
  const dx = (x - LAKE.cx) / LAKE.rx;
  const dz = (z - LAKE.cz) / LAKE.ry;
  const lakeD = dx * dx + dz * dz;
  if (lakeD < 1.35 && h < 30) return shade([198, 178, 128], 0.75 + 0.25 * light);

  // Snow above the high line, rock on steep slopes, grass below.
  const slope = 1 - normal[1];
  if (h > 190 + fbm(x / 300, z / 300) * 30) {
    return shade([238, 240, 244], 0.7 + 0.3 * light);
  }
  if (slope > 0.24 || h > 130) {
    const rock = [122, 106, 88];
    return shade(rock, 0.6 + 0.4 * light + jitter);
  }
  // Valley grass, patchy by noise so fields read as fields.
  const patch = fbm(x / 260 + 3, z / 260 + 8);
  const grass =
    patch > 0.12
      ? [96, 148, 74]
      : patch < -0.12
        ? [128, 158, 72]
        : [112, 152, 70];
  return shade(grass, 0.7 + 0.3 * light + jitter);
}

export function isOverRunway(x, z) {
  return (
    (x >= RUNWAY.x0 - 4 && x <= RUNWAY.x1 + 4 && z >= RUNWAY.z0 - 4 && z <= RUNWAY.z1 + 4) ||
    (x >= ISLAND_STRIP.x0 - 4 && x <= ISLAND_STRIP.x1 + 4 && z >= ISLAND_STRIP.z0 - 4 && z <= ISLAND_STRIP.z1 + 4)
  );
}
