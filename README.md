# Frontlines of Industry

Frontlines of Industry is a playable 2D real-time strategy prototype inspired by the speed of *Tooth and Tail* and the nation-building choices of *Civilization*.

Choose a 1930s–1940s nation, move a field commander directly, capture strategic sectors, build an industrial base, recruit a combined-arms force, and destroy the opposing capital.

## Current prototype

- Four playable historical nations with distinct doctrines
- Commander movement with keyboard controls
- Mouse-issued follow and rally orders
- Thirteen capturable sectors connected by roads
- Six infrastructure types and four military unit classes
- Resource economy using supplies, industry, and fuel
- Autonomous combat, sector capture, commander respawning, and capital victory
- Computer opponent with construction, recruitment, and attack logic
- Deterministic simulation kept separate from Phaser rendering for future online PvP

## Run locally

Requirements: Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open the local address printed by Vite, select a nation, and begin the match.

## Controls

| Input | Action |
| --- | --- |
| `WASD` or arrow keys | Move the commander |
| Right click | Rally the army at the pointer |
| `Space` | Recall the army to follow the commander |
| Left click a friendly sector | Select it for construction |
| `1`–`4` | Recruit infantry, scout, tank, or artillery |
| `Esc` | Pause or resume |

Construction and recruitment can also be controlled from the command dock at the bottom of the screen.

## Scripts

```bash
npm run dev       # start the development server
npm run build     # type-check and create a production build
npm run build:static # create the lightweight repository preview in docs/
npm run test      # run simulation tests
npm run test:run  # run tests once
npm run preview   # preview the production build
```

## Project structure

```text
src/
  core/       deterministic game simulation and balancing data
  scenes/     thin Phaser rendering and input layer
  ui/         DOM menus and HUD
  app/        event bridge between game and UI
tests/        simulation-level automated tests
```

## Roadmap

1. Tune the economy and combat using playtest data.
2. Add sound, animated sprites, additional maps, and more nation-specific units.
3. Add an authoritative match server, lobbies, reconnects, and replay support.
4. Package stable releases as a desktop application.

Historical countries are represented as gameplay abstractions. The prototype avoids political symbols and does not attempt to simulate civilian populations or historical atrocities.
