# ARCHi Go 🎮

ARCHi Go is a browser-based 3D platformer built with React, Three.js, TypeScript, and a custom fixed-timestep game loop, with selectable characters and a responsive arcade-style interface.

## Requirements

- Node.js 22.x
- npm
- A MySQL-compatible database only if persistent online leaderboard scores are wanted

## Local development

```bash
npm ci
npm run dev
```

The Vite development server runs at `http://localhost:3000`. The Hono API is mounted by the Vite development middleware.

## Build and verification

```bash
npm run check
npm run build
npm run verify:characters
npm run verify:phase3
npm run verify:vercel
```

The Vite build is emitted to `public/`, which Vercel serves as static assets. The Vercel build does not bundle or start a persistent Node server. For optional standalone Node testing only, run `npm run build:local` and then `npm start`.

To run that standalone server locally:

```bash
npm run build:local
npm start
```

Set `DATABASE_URL` in `.env` only if you want persistent leaderboard scores.

## Vercel deployment

This archive is configured as a single Vercel project: Vite builds the browser game into `public/`, while the root `index.ts` exports the Hono API application for Vercel Functions.

1. Open [Vercel Drop](https://vercel.com/drop).
2. Drag this ZIP onto the page. The archive has `package.json`, `index.html`, `index.ts`, and `vercel.json` at its root.
3. Choose your Vercel team and a project name, then select **Deploy**.
4. The included configuration selects the Hono framework and runs `npm run build`. Do not set a separate Output Directory.
5. No environment variable is required to load and play the game.

`DATABASE_URL` is optional. Add a MySQL-compatible connection string only if you want persistent global leaderboard scores. Without it, the game itself remains playable and the leaderboard reports offline. The API health route `/api/trpc/ping` does not require a database.

The project pins Node.js 22.x for consistent builds. `.npmrc` uses the official npm registry. The package-level `allowScripts` policy approves only the pinned esbuild install scripts required by the build toolchain.

## Controls

| Input | Action |
|---|---|
| W A S D / arrows | Move |
| Space | Jump |
| Mouse drag | Orbit camera |
| Esc / P | Pause |
| M | Mute |
| Touch | Left side = movement; right side = camera |

## Existing gameplay systems

- Seeded procedural floating-island course generation.
- Custom AABB platforming physics with fixed-timestep updates.
- Jump buffering, coyote time, double-jump power-up, and moving-platform carry.
- Collectibles, enemies, upgrades, score, and leaderboard.
- Web Audio synthesized sound effects and adaptive music.
- Instanced meshes, pooled particles, and automatic quality degradation.

## Architecture notes

- `src/game/` contains the browser game engine and current gameplay implementation.
- `src/pages/` contains the React page shell.
- `server/app.ts` defines the Hono API application without starting a persistent server.
- `server/boot.ts` is the Vite development middleware entrypoint.
- `server/local.ts` is only for optional standalone Node hosting.
- Root `index.ts` is the Vercel Hono entrypoint.
- `db/` contains Drizzle schema and database configuration.

The original `puffhop.*` browser storage keys are migrated lazily to `archigo.*` so existing local progress and mute preferences are retained after the rebrand.


## Character system (Phase 2)

ARCHi Go includes four selectable built-in characters: Puff, Flick (fox), Byte
(robot), and Pip (penguin). Selection is saved in browser storage and restored
on the next visit. Character appearance is independent of the shared movement
controller and AABB collision dimensions.

Optional custom GLB/GLTF character models are supported by the player loader.
See `public-assets/assets/characters/README.md` for model requirements and
clip naming conventions. Add a `modelUrl` such as
`/assets/characters/fox.glb` to the matching entry in
`src/game/characters.ts`. If a model is missing or fails to load, the built-in
procedural model remains as a fallback.

Run `npm run verify:characters` for source-level checks of the character
registry, selection flow, persistence, and GLTF animation integration. Full TypeScript, production build, and browser verification require installing dependencies. The included source-level checks do not claim that those runtime checks have passed.
