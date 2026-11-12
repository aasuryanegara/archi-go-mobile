/** Source-level guardrails for ARCHi Go Phase 2. Does not replace browser tests. */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(new URL("../", import.meta.url).pathname);
const checks = [
  ["character registry", "src/game/characters.ts", ["CHARACTERS", 'id: "puff"', 'id: "fox"', 'id: "bot"', 'id: "penguin"']],
  ["character persistence", "src/game/storage.ts", ["selectedCharacter", '"selectedCharacter"']],
  ["GLTF loader and animation mixer", "src/game/player.ts", ["GLTFLoader", "AnimationMixer", "updateExternalAnimation", "modelUrl"]],
  ["selection UI", "src/game/hud.tsx", ["showCharacterSelect", "character-showcase", "onSelectCharacter"]],
  ["selection flow", "src/game/game.ts", ["openCharacterSelect", "selectCharacter", "backFromCharacterSelect", "characterSelectOpen"]],
  ["model asset guide", "public-assets/assets/characters/README.md", ["GLB", "modelUrl", "idle", "run"]],
];

let failures = 0;
for (const [label, file, needles] of checks) {
  const content = await readFile(resolve(root, file), "utf8");
  const missing = needles.filter((needle) => !content.includes(needle));
  if (missing.length) {
    failures++;
    console.error(`FAIL ${label}: missing ${missing.join(", ")}`);
  } else {
    console.log(`PASS ${label}`);
  }
}

if (failures) process.exit(1);
console.log(`PASS all ${checks.length} Phase 2 source checks`);
