// main.ts — the entry program for "Ridge Runner — Sky Ring Rally"
// (best-flight-game-20261126-0057). Node 22, standard library only.
//
// It hands the game in: it copies this repository's game/ and screenshots/
// beside this file into the output directory and writes dossier.json there
// with the vendored make.fun library, so the gate can check the entry and
// the judge can read it.
//
// Locally:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// In the grader the output directory is /output (MAKEFUN_OUTPUT_DIR unset).

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });
cpSync(join(here, 'game'), join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}

// The same caps the gate scores against: the dossier text budget, at most
// four screenshots of at most 256 KiB each, and game/ kept inside its file
// count, byte total and path-length limits (the whole of /output shares the
// platform's 1,000-entry, 64 MiB cap with these).
writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
