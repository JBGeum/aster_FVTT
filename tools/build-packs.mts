import { compilePack } from "@foundryvtt/foundryvtt-cli";
import { fileURLToPath } from "node:url";
import { rm, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Compile JSON pack sources (packs/_source/<pack>) into LevelDB packs under dist/packs.
 *
 * Runs after `vite build` (which empties dist/), so packs are written into the final dist
 * tree that `link:foundry` symlinks into Foundry. Add a new entry to PACKS for another pack.
 *
 * Source files are authored without `_key` (clean, readable). foundryvtt-cli requires each
 * document — including embedded results — to carry a LevelDB `_key`, so we inject them here
 * from Foundry's key convention (`!<collection>!<id>`, `!<collection>.<embedded>!<id>.<eid>`)
 * into a staging copy before compiling.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Pack source dir name → output dir name (must match the `path` in system.json). */
const PACKS = ["unison-tables"];

for (const pack of PACKS) {
  const src = path.join(ROOT, "packs", "_source", pack);
  const dest = path.join(ROOT, "dist", "packs", pack);
  const staging = path.join(ROOT, "dist", ".pack-staging", pack);

  // classic-level은 기존 키를 덮어쓰지 않고 누적하므로 매번 정리.
  await rm(dest, { recursive: true, force: true });
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });

  const files = (await readdir(src)).filter((f) => f.endsWith(".json"));
  for (const file of files) {
    const doc = JSON.parse(await readFile(path.join(src, file), "utf8"));
    doc._key = `!tables!${doc._id}`;
    for (const result of doc.results ?? []) {
      result._key = `!tables.results!${doc._id}.${result._id}`;
    }
    await writeFile(path.join(staging, file), JSON.stringify(doc));
  }

  await compilePack(staging, dest, { log: true });
  await rm(staging, { recursive: true, force: true });
}
