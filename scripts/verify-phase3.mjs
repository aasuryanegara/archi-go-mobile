/** Source-level guardrails for the Phase 3 React UX migration. */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const root=resolve(new URL('../',import.meta.url).pathname)
const checks=[
 ['React-owned HUD root','src/game/hud.tsx',['createRoot','function HudView','root.render','root.unmount']],
 ['React menu and leaderboard','src/game/hud.tsx',['GLOBAL LEADERBOARD','YOUR PROGRESS','UPGRADE YOUR HOP','leaderboard(']],
 ['character selection screen','src/game/hud.tsx',['character-showcase','CHARACTERS.map','onSelectCharacter']],
 ['pause and results screens','src/game/hud.tsx',['Game ','FINAL SCORE','PLAY AGAIN']],
 ['settings panels','src/game/hud.tsx',['settings-tabs','Dynamic shadows','Game audio','control-list']],
 ['settings callbacks wired to game','src/game/game.ts',['toggleSettings','toggleShadows','onToggleShadows','onSettings']],
 ['responsive visual system','src/index.css',['@media(max-width:850px)','@media(max-width:600px)','prefers-reduced-motion']],
]
let failures=0
for(const [label,file,needles] of checks){const content=await readFile(resolve(root,file),'utf8');const missing=needles.filter(x=>!content.includes(x));if(missing.length){failures++;console.error(`FAIL ${label}: ${missing.join(', ')}`)}else console.log(`PASS ${label}`)}
if(failures)process.exit(1)
console.log(`PASS all ${checks.length} Phase 3 source checks`)
