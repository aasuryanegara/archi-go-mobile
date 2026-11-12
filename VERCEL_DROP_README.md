# Deploy ARCHi Go with Vercel Drop

1. Visit https://vercel.com/drop and sign in.
2. Drag `ARCHi_Go_Vercel_Deploy.zip` into the drop area.
3. Select your Vercel team and project name.
4. Click **Deploy** and wait for the build to finish.

The ZIP is structured with the app files at its root (not inside an extra `app/` folder).

## Included deployment configuration

- Framework: `hono`
- Build command: `npm run build`
- Vite output: `public/` (served by Vercel's CDN)
- API entrypoint: root `index.ts` exporting `server/app.ts` as one Hono function
- Backend source lives in `server/`, not Vercel’s reserved root `api/` directory, preventing each backend source file from being deployed as a separate Function
- Runtime: Node.js 22.x
- npm registry: `https://registry.npmjs.org/`
- No environment variables required for the game to load and play.

`DATABASE_URL` is optional and only enables persistent global leaderboard scores. If it is not configured, gameplay remains available and the leaderboard displays as offline.

## Important Vercel Drop behavior

Each Vercel Drop creates a new project. To keep one project URL and receive automatic updates later, connect the deployed project to the GitHub repository after the initial drop.

## Hobby plan function limit

The backend source was moved from the root `api/` directory to `server/`. Vercel therefore sees the root Hono entrypoint as the application function instead of treating each TypeScript source file as a separate API Function. This is intended to keep the deployment within the Hobby plan limit of 12 Serverless Functions.

## Validation boundary

The archive includes source-level deployment checks. A complete `npm ci`, TypeScript check, Vite production build, browser test, and live Vercel deployment could not be executed in the packaging environment because npm registry DNS requests timed out. Do not interpret the source checks as a successful live build.
