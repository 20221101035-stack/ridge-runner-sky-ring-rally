# ridge-runner-sky-ring-rally

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/20221101035-stack/ridge-runner-sky-ring-rally/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/20221101035-stack/ridge-runner-sky-ring-rally/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

**Ridge Runner — Sky Ring Rally**: an original chase-view 3D flight game, hand-written in Canvas 2D (no libraries, no external assets, no network requests). Fly the "Skyhawk" prop plane over a seeded heightfield valley — runway, lake and island strip, winding river canyon, snowy ridges — through rings and gates across three sorties: Sky Ring Rally (10 timed rings), Canyon Run (8 low gates), and Island Hop (land on the island strip with tight fuel).

Arcade flight model: throttle sets speed, pitch climbs and dives, banking turns (slower turns tighter), stall below 33 m/s, terrain collision crashes, gentle touchdown lands. Synthesized WebAudio engine hum, wind, ring chimes and fanfare — no audio files. HUD with compass tape, heading, score, rings, time, fuel and throttle bars, lit airspeed/altitude dials, attitude ball, V/S and AGL, plus stall, pull-up and low-fuel warnings.

## Controls

- Arrows / WASD — pitch and bank
- Shift / Ctrl or mouse wheel — throttle
- Space — airbrake
- Mouse — steer by position
- 1 / 2 / 3 — pick a sortie, R — restart, P — pause, M — mute

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

`main.ts` (Node 22, standard library only) hands the game in: it copies `game/` and `screenshots/` to `/output` and writes `/output/dossier.json` with the vendored make.fun library:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=5pkj596k&utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>
