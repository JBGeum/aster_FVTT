import { compilePack } from "@foundryvtt/foundryvtt-cli";
import { fileURLToPath } from "node:url";
import { rm, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
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

/**
 * 아이템 시드 pack (C2). 소스는 단일 JSON 배열(`packs/_source/<name>.json`) — RollTable의
 * dir-of-files와 다르다. 각 아이템에 `!items!<id>` 키를 주입해 staging에 풀어 compile한다.
 *
 * 자료(룰북 추출분)는 저작권 보호로 .gitignore 격리 — 소스 파일이 없으면 *빈 compendium*으로
 * 빌드(경로는 항상 존재). GitHub clone 사용자는 빈 pack, 로컬 자료 보유자는 콘텐츠 노출.
 */
const ITEM_PACKS = ["items-food", "items-equipment", "items-bag", "items-consumable"];

for (const pack of ITEM_PACKS) {
  // 자료 배치 두 가지 지원: 하위 디렉토리(packs/_source/items/<name>.json) 또는 평면(packs/_source/<name>.json).
  const srcFile = [
    path.join(ROOT, "packs", "_source", "items", `${pack}.json`),
    path.join(ROOT, "packs", "_source", `${pack}.json`),
  ].find((p) => existsSync(p));
  const dest = path.join(ROOT, "dist", "packs", pack);
  const staging = path.join(ROOT, "dist", ".pack-staging", pack);

  await rm(dest, { recursive: true, force: true });
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });

  let count = 0;
  if (srcFile) {
    const items = JSON.parse(await readFile(srcFile, "utf8"));
    for (const item of items) {
      item._key = `!items!${item._id}`;
      await writeFile(path.join(staging, `${item._id}.json`), JSON.stringify(item));
      count++;
    }
  }

  // 소스가 비어도 빈 LevelDB를 생성해 manifest path가 항상 유효하도록 한다.
  await compilePack(staging, dest, { log: true });
  await rm(staging, { recursive: true, force: true });
  console.log(
    count > 0
      ? `[build] ${pack}: ${count}개 아이템 → LevelDB`
      : `[build] ${pack}: _source 없음 — 빈 compendium (저작권 보호)`,
  );
}
