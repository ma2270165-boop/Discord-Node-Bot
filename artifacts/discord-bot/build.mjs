import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { build as esbuild } from "esbuild";
import { rm } from "node:fs/promises";

globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));

async function buildAll() {
  const distDir = path.resolve(artifactDir, "dist");
  await rm(distDir, { recursive: true, force: true });

  await esbuild({
    entryPoints: [path.resolve(artifactDir, "src/index.ts")],
    platform: "node",
    bundle: true,
    format: "esm",
    outdir: distDir,
    outExtension: { ".js": ".mjs" },
    logLevel: "info",
    sourcemap: "linked",
    // @workspace/db is intentionally NOT listed here — esbuild follows the
    // pnpm symlink and bundles it inline, eliminating all runtime workspace
    // resolution issues (the tsx symlink ERR_MODULE_NOT_FOUND bug).
    external: [
      "*.node",
      "sharp",
      "@napi-rs/canvas",
      "@napi-rs/*",
      "bufferutil",
      "utf-8-validate",
      "pg-native",
      "better-sqlite3",
      "sqlite3",
      "bcrypt",
      "argon2",
      "fsevents",
      "re2",
      "farmhash",
      "xxhash-addon",
      "ssh2",
      "cpu-features",
      "dtrace-provider",
      "isolated-vm",
      "lightningcss",
      "oracledb",
      "mongodb-client-encryption",
      "canvas",
      "piscina",
      "snappy",
      "classic-level",
      "leveldown",
      "rocksdb",
      "hiredis",
      "kerberos",
      "realm",
      "zeromq",
      "usb",
      "serialport",
      "ref-napi",
      "ffi-napi",
    ],
    banner: {
      js: `import { createRequire as __crReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';
globalThis.require = __crReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
`,
    },
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
