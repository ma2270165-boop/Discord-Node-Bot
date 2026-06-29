---
name: lib-db must export compiled JS for Docker / Discord-bot must be pre-compiled
description: tsx's symlink source-lookup causes ERR_MODULE_NOT_FOUND in Railway deployments. Fix: compile discord-bot to JS with esbuild at Docker build time, never run tsx at runtime.
---

## Rule
Never run `tsx src/index.ts` as the production start command for `@workspace/discord-bot` in Docker/Railway.
tsx's `resolveTsPaths` follows pnpm workspace symlinks and tries to load `@workspace/db/src/schema/index.ts` at the SYMLINK path (not realpath), which fails in all Node.js 22 ESM resolution paths.

**Why:** Every approach to "fix the symlink" (cp -rL, pnpm deploy, etc.) failed because Railway overrides the Dockerfile CMD with its own start command (`pnpm --filter @workspace/discord-bot run start` from `/app`). The symlink problem is structural — tsx always does a TypeScript source lookup via the symlink path.

**The Definitive Fix (implemented):**
- `artifacts/discord-bot/build.mjs` uses esbuild to compile `src/index.ts` → `dist/index.mjs`
- `@workspace/db` is NOT in esbuild's `external` list — it gets bundled inline (esbuild follows symlinks correctly at build time, reads `lib/db/dist/schema/index.js`)
- `"start"` script changed to `"node dist/index.mjs"` — no tsx at runtime
- Dockerfile runs `pnpm --filter @workspace/discord-bot run build` before starting
- `.dockerignore` has `!lib/db/dist` so `lib/db/dist/schema/index.js` is available to esbuild during Docker build

**How to apply:**
- Always compile the bot to JS in the Dockerfile before starting it
- If adding new workspace packages as deps, do NOT add them to esbuild `external` — let them be bundled inline
- Native packages (sharp, @napi-rs/canvas, *.node) must stay in `external`
- `lib/db/dist` must be committed to git AND excluded from .dockerignore (both are already set up)
