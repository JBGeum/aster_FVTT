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
const PACKS = ["unison-tables", "talk-tables"];

for (const pack of PACKS) {
  const src = path.join(ROOT, "packs", "_source", pack);
  const dest = path.join(ROOT, "dist", "packs", pack);
  const staging = path.join(ROOT, "dist", ".pack-staging", pack);

  // classic-level은 기존 키를 덮어쓰지 않고 누적하므로 매번 정리.
  await rm(dest, { recursive: true, force: true });

  const files = existsSync(src) ? (await readdir(src)).filter((f) => f.endsWith(".json")) : [];
  if (files.length === 0) {
    console.log(`[build] ${pack}: _source 없음 — 팩 생략 (저작권 보호)`);
    continue;
  }

  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });

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
  console.log(`[build] ${pack}: ${files.length}개 표 → LevelDB`);
}

/**
 * 아이템 시드 pack (C2). 소스는 단일 JSON 배열(`packs/_source/<name>.json`) — RollTable의
 * dir-of-files와 다르다. 각 아이템에 `!items!<id>` 키를 주입해 staging에 풀어 compile한다.
 *
 * 자료(룰북 추출분)는 저작권 보호로 .gitignore 격리 — 소스 파일이 없으면 팩을 만들지 않는다.
 * 빈 LevelDB를 내보내면 배포본이 서버의 살아 있는 compendium을 덮어써 데이터가 날아간다.
 */
const ITEM_PACKS = [
  "items-food",
  "items-equipment",
  "items-bag",
  "items-consumable",
  "items-spell",
  "items-enchant",
];

for (const pack of ITEM_PACKS) {
  // 자료 배치 두 가지 지원: 하위 디렉토리(packs/_source/items/<name>.json) 또는 평면(packs/_source/<name>.json).
  const srcFile = [
    path.join(ROOT, "packs", "_source", "items", `${pack}.json`),
    path.join(ROOT, "packs", "_source", `${pack}.json`),
  ].find((p) => existsSync(p));
  const dest = path.join(ROOT, "dist", "packs", pack);
  const staging = path.join(ROOT, "dist", ".pack-staging", pack);

  await rm(dest, { recursive: true, force: true });

  const items = srcFile ? JSON.parse(await readFile(srcFile, "utf8")) : [];
  if (items.length === 0) {
    console.log(`[build] ${pack}: _source 없음 — 팩 생략 (저작권 보호)`);
    continue;
  }

  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });

  for (const item of items) {
    item._key = `!items!${item._id}`;
    await writeFile(path.join(staging, `${item._id}.json`), JSON.stringify(item));
  }

  await compilePack(staging, dest, { log: true });
  await rm(staging, { recursive: true, force: true });
  console.log(`[build] ${pack}: ${items.length}개 아이템 → LevelDB`);
}

// 공방 효과 문구는 저작권 자료라 저장소에 없을 수 있다. 없으면 빈 파일을 만들어
// system.json의 languages path가 항상 유효하도록 한다(Foundry의 404 경고 방지).
{
  const dest = path.join(ROOT, "dist", "lang", "ko-craft-effect.json");
  if (!existsSync(dest)) {
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, "{}\n");
    console.log("[build] ko-craft-effect: 원본 없음 — 빈 언어 파일 (저작권 보호)");
  }
}
