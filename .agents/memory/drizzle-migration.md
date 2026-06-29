---
name: Drizzle async-store migration
description: Complete migration of all JSON-blob and bot_kv stores to Drizzle ORM with PostgreSQL; key patterns and invariants.
---

## What was done
All ~15 store modules under `artifacts/discord-bot/src/` now use `@workspace/db/schema` + drizzle-orm instead of JSON files or bot_kv JSONB blobs. `lowo/emojis.ts` is intentionally left file-based (static admin config, not user data).

## Key invariants
- **Every store function is now `async`** — callers must `await` all store calls, including void-returning ones (setX, addX, etc.) for correct sequencing.
- **Sequences** (nextRaidNumber, nextTournamentId, nextTrainingNumber) use `INSERT INTO bot_sequences ON CONFLICT DO UPDATE SET value = value + 1 RETURNING value` — atomic, no race conditions.
- `src/db.ts` — lazy Drizzle instance; only imports schema via `@workspace/db/schema`, does NOT import `lib/db/src/index.ts` (which throws if no DATABASE_URL).
- `src/persistence.ts` — `initPersistence()` creates the pg pool and runs `ensureSchema()` (all 25+ CREATE TABLE IF NOT EXISTS). Called at bot startup before `registerLifecycleEvents()`.
- `src/migrate-json.ts` — one-time migration; called from `lifecycle.ts` `ClientReady` handler after kill-LB refresh; renames JSON files to `.migrated` after import.

## Why
Eliminates the JSON-blob anti-pattern (single-file races, no relational integrity, no concurrent-safe reads). Enables Railway-hosted PostgreSQL as the sole source of truth.

## How to apply
When adding new store modules: write async functions, use drizzle-orm query builder against `db` from `src/db.ts`, add the table to `lib/db/src/schema/index.ts` AND `src/persistence.ts` ensureSchema. All callers must await.
