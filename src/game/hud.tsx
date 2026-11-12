import { createRoot, type Root } from 'react-dom/client'
import { useState } from 'react'
import { UPGRADES, type UpgradeId } from './config'
import type { LeaderboardEntry } from './backend'
import { CHARACTERS } from './characters'

export interface HudCallbacks {
  onPlay(): void; onResume(): void; onRestart(): void; onQuit(): void
  onBuy(id: UpgradeId): void; onSubmit(name: string): void; onMute(): void
  onCharacters(): void; onSelectCharacter(id: string): void; onBackToTitle(): void
  onSettings(): void; onToggleShadows(): void
}
export interface RunHudState { time:number; candies:number; gems:number; hearts:number; score:number; sugarT:number; feather:boolean; shieldT:number; invulnT:number }
export interface EndScreenData {
  title:string; victory:boolean; score:number; candies:number; gems:number; timeBonus:number; bank:number; best:number
  newBest:boolean; name:string; submitted:boolean; leaderboard:LeaderboardEntry[]|null; leaderboardError:boolean
}
type TitleData = { bank:number; upgrades:Record<UpgradeId,number>; best:number; name:string; leaderboard:LeaderboardEntry[]|null; leaderboardError:boolean }
type Screen = 'title'|'characters'|'pause'|'end'|'settings'|'hidden'
type ViewProps = {
  callbacks:HudCallbacks; screen:Screen; title?:TitleData; selectedId:string; end?:EndScreenData
  run:RunHudState; muted:boolean; shadows:boolean; toast:string
}
const fmtTime=(t:number)=>{const s=Math.max(0,Math.ceil(t));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`}

function HudView(p:ViewProps) {
  const [name,setName]=useState(p.end?.name||'')
  const [tab,setTab]=useState<'graphics'|'audio'|'controls'>('graphics')
  const c=p.callbacks, d=p.title, e=p.end, r=p.run
  const leaderboard=(rows:LeaderboardEntry[]|null,error:boolean,limit=8)=> error ? <div className="leader-empty">Leaderboard offline</div> : !rows ? <div className="leader-empty">Loading scores…</div> : rows.length===0 ? <div className="leader-empty">No scores yet. Be the first!</div> : rows.slice(0,limit).map((x,i)=><div className={`leader-row ${i===0?'leader-first':''}`} key={`${x.name}-${x.score}-${i}`}><span>{String(i+1).padStart(2,'0')}</span><b>{x.name}</b><strong>{x.score.toLocaleString()}</strong></div>)
  return <>
    {p.screen==='hidden' && <>
      <div className="game-hud">
        <div className={`hud-time ${r.time<=20?'critical':''}`}><small>TIME</small><strong>{fmtTime(r.time)}</strong></div>
        <div className="hud-stat"><span>🍬</span><div><small>CANDIES</small><b>{r.candies}</b></div></div>
        <div className="hud-stat"><span>💎</span><div><small>GEMS</small><b>{r.gems}</b></div></div>
        <div className="hud-stat"><span>♥</span><div><small>HEALTH</small><b>{'♥'.repeat(r.hearts)}<i>{'♡'.repeat(Math.max(0,3-r.hearts))}</i></b></div></div>
        <div className="hud-stat hud-score"><span>✦</span><div><small>SCORE</small><b>{r.score.toLocaleString()}</b></div></div>
        <button className="hud-icon-btn" onClick={c.onMute} aria-label={p.muted?'Unmute':'Mute'}>{p.muted?'♫̸':'♫'}</button>
        <button className="hud-icon-btn" onClick={c.onSettings} aria-label="Settings">⚙</button>
      </div>
      {(r.sugarT>0||r.feather||r.shieldT>0)&&<div className="power-strip">{r.sugarT>0&&<span>⚡ BOOST {r.sugarT.toFixed(0)}s</span>}{r.feather&&<span>🪶 DOUBLE JUMP</span>}{r.shieldT>0&&<span>🛡 SHIELD {r.shieldT.toFixed(0)}s</span>}</div>}
    </>}
    {p.toast && <div className="game-toast">{p.toast}</div>}
    {p.screen!=='hidden' && <div className="screen-backdrop">
      {p.screen==='title'&&d&&<main className="menu-layout">
        <div className="menu-topline"><span className="brand-mark">A</span><span>ARCH<span>i</span> GO</span><span className="version-label">ARCADE PLATFORMER</span></div>
        <section className="hero-panel">
          <div className="hero-copy"><div className="eyebrow"><span className="live-dot"/> THE ISLANDS ARE WAITING</div><h1>ARCH<span>i</span><br/>GO<span className="title-period">.</span></h1><p className="hero-subtitle">Leap into a world of wonder.</p><p className="hero-description">Explore floating candy isles, collect rare gems, dodge grumps, and find the golden portal.</p>
            <div className="hero-actions"><button className="primary-action" onClick={c.onPlay}><span>▶</span> START GAME</button><button className="secondary-action" onClick={c.onCharacters}>CHANGE CHARACTER <span>↗</span></button></div>
            <div className="hero-footnote desktop-hint">WASD / ARROWS TO MOVE <i>·</i> SPACE TO JUMP <i>·</i> ESC TO PAUSE</div><div className="hero-footnote touch-hint">LEFT THUMB TO MOVE <i>·</i> JUMP BUTTON <i>·</i> DRAG RIGHT TO LOOK</div>
          </div>
          <div className="hero-art"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="hero-spark spark-a">✦</div><div className="hero-spark spark-b">✧</div><div className="hero-character">{CHARACTERS.find(x=>x.id===p.selectedId)?.icon||'☁️'}</div><div className="hero-platform platform-back"/><div className="hero-platform platform-front"/><div className="hero-caption">YOUR NEXT ADVENTURE<br/><b>STARTS HERE.</b></div></div>
        </section>
        <section className="dashboard-grid">
          <article className="dash-card progress-card"><div className="card-heading"><span>YOUR PROGRESS</span><span className="card-icon">↗</span></div><div className="progress-stats"><div><small>PERSONAL BEST</small><strong>{d.best.toLocaleString()}</strong></div><div><small>CANDY BANK</small><strong>{d.bank.toLocaleString()} <em>🍬</em></strong></div></div><div className="progress-rule"><span/></div><div className="progress-foot">Keep hopping. Your next record is waiting.</div></article>
          <article className="dash-card leaderboard-card"><div className="card-heading"><span>GLOBAL LEADERBOARD</span><span className="card-icon">⌁</span></div><div className="leader-list">{leaderboard(d.leaderboard,d.leaderboardError,5)}</div></article>
          <article className="dash-card upgrade-card"><div className="card-heading"><span>UPGRADE YOUR HOP</span><span className="card-icon">✧</span></div><div className="upgrade-list">{(Object.keys(UPGRADES) as UpgradeId[]).map(id=>{const u=UPGRADES[id],tier=d.upgrades[id],max=tier>=u.max,cost=max?null:u.costs[tier];return <div className="upgrade-item" key={id}><div><b>{u.name}</b><small>{u.desc}</small><span className="upgrade-level">{'◆'.repeat(tier)}{'◇'.repeat(u.max-tier)}</span></div><button disabled={max||(cost!==null&&cost>d.bank)} onClick={()=>c.onBuy(id)}>{max?'MAX':`🍬 ${cost}`}</button></div>})}</div></article>
        </section><footer className="menu-footer"><span>© ARCHi GO</span><span>BUILT FOR THE CURIOUS <b>✦</b></span><button onClick={c.onSettings}>SETTINGS ⚙</button></footer>
      </main>}
      {p.screen==='characters'&&<section className="dialog-panel character-panel"><div className="dialog-kicker">PLAYER CONFIGURATION</div><h2>Choose your <span>character.</span></h2><p className="dialog-description">Every hopper shares the same abilities. Choose the style that feels like you.</p><div className="character-showcase">{CHARACTERS.map(ch=><button key={ch.id} className={`character-option ${ch.id===p.selectedId?'active':''}`} onClick={()=>c.onSelectCharacter(ch.id)}><span className="character-portrait">{ch.icon}</span><b>{ch.name}</b><small>{ch.description}</small><em>{ch.id===p.selectedId?'✓ SELECTED':'SELECT'}</em></button>)}</div><button className="text-action" onClick={c.onBackToTitle}>← BACK TO MAIN MENU</button></section>}
      {p.screen==='pause'&&<section className="dialog-panel compact-dialog"><div className="dialog-kicker">TAKE A BREATHER</div><h2>Game <span>paused.</span></h2><p className="dialog-description">Your adventure is right where you left it.</p><button className="primary-action full-action" onClick={c.onResume}>▶ RESUME GAME</button><button className="secondary-action full-action" onClick={c.onRestart}>↻ RESTART RUN</button><button className="text-action" onClick={c.onQuit}>QUIT TO MAIN MENU</button></section>}
      {p.screen==='end'&&e&&<section className="dialog-panel end-panel"><div className="dialog-kicker">{e.victory?'PORTAL REACHED':'RUN COMPLETE'}</div><h2>{e.victory?'Island conquered.':'Nice try, hopper.'}</h2><p className="dialog-description">{e.victory?'You made it through the islands. What a run!':'Every great hopper gets back up.'}</p><div className="result-score"><small>FINAL SCORE</small><strong>{e.score.toLocaleString()}</strong>{e.newBest&&<em>✦ NEW PERSONAL BEST ✦</em>}</div><div className="result-breakdown"><span>🍬 Candies <b>{e.candies}</b></span><span>💎 Gems <b>{e.gems}</b></span><span>TIME BONUS <b>{e.timeBonus}</b></span><span>BANK TOTAL <b>{e.bank}</b></span></div><div className="leader-list result-leader">{e.submitted||e.leaderboardError?leaderboard(e.leaderboard,e.leaderboardError,5):<div className="score-submit"><input value={name} maxLength={14} onChange={ev=>setName(ev.target.value)} onKeyDown={ev=>{if(ev.key==='Enter'&&name.trim())c.onSubmit(name.trim())}} placeholder="Enter your name"/><button onClick={()=>name.trim()&&c.onSubmit(name.trim())}>SAVE SCORE</button></div>}</div><button className="primary-action full-action" onClick={c.onRestart}>↻ PLAY AGAIN</button><button className="text-action" onClick={c.onQuit}>BACK TO MAIN MENU</button></section>}
      {p.screen==='settings'&&<section className="dialog-panel settings-panel"><div className="dialog-kicker">PREFERENCES</div><h2>Game <span>settings.</span></h2><div className="settings-tabs">{(['graphics','audio','controls'] as const).map(t=><button className={tab===t?'selected':''} onClick={()=>setTab(t)} key={t}>{t.toUpperCase()}</button>)}</div>{tab==='graphics'&&<div className="settings-content"><div className="setting-row"><div><b>Dynamic shadows</b><small>Shadows can be disabled to improve performance.</small></div><button className="setting-toggle" onClick={c.onToggleShadows}>{p.shadows?'ON':'OFF'}</button></div><div className="setting-row"><div><b>Display mode</b><small>Responsive full-screen canvas.</small></div><span className="setting-value">AUTO</span></div></div>}{tab==='audio'&&<div className="settings-content"><div className="setting-row"><div><b>Game audio</b><small>Music and sound effects.</small></div><button className="setting-toggle" onClick={c.onMute}>{p.muted?'OFF':'ON'}</button></div></div>}{tab==='controls'&&<div className="settings-content control-list"><div><b>Move</b><span>W A S D / Arrow keys</span></div><div><b>Jump</b><span>Space</span></div><div><b>Pause</b><span>Esc / P</span></div><div><b>Mute</b><span>M</span></div><div><b>Camera</b><span>Drag mouse / right side of screen</span></div><div><b>Touch</b><span>Left stick · JUMP button</span></div></div>}<button className="primary-action full-action" onClick={c.onSettings}>DONE</button></section>}
    </div>}
  </>
}

export class Hud {
  private root:Root; private cb:HudCallbacks; private screen:Screen='title'; private title?:TitleData; private end?:EndScreenData
  private selectedId='puff'; private run:RunHudState={time:0,candies:0,gems:0,hearts:3,score:0,sugarT:0,feather:false,shieldT:0,invulnT:0}
  private muted=false; private shadows=true; private toastText=''; private toastTimer=0
  private lastRun=''
  isSettings(){return this.screen==='settings'}
  constructor(root:HTMLElement,cb:HudCallbacks){this.root=createRoot(root);this.cb=cb;this.paint()}
  private paint(){this.root.render(<HudView callbacks={this.cb} screen={this.screen} title={this.title} selectedId={this.selectedId} end={this.end} run={this.run} muted={this.muted} shadows={this.shadows} toast={this.toastText}/>)}
  setMute(v:boolean){this.muted=v;this.paint()}
  setShadows(v:boolean){this.shadows=v;this.paint()}
  update(s:RunHudState){const key=[Math.ceil(s.time),s.candies,s.gems,s.hearts,s.score,Math.ceil(s.sugarT),s.feather,Math.ceil(s.shieldT)].join('|');if(key===this.lastRun)return;this.lastRun=key;this.run={...s};this.paint()}
  toast(text:string,ms=1600){this.toastText=text;this.paint();window.clearTimeout(this.toastTimer);this.toastTimer=window.setTimeout(()=>{this.toastText='';this.paint()},ms)}
  hideScreen(){this.screen='hidden';this.paint()}
  showTitle(d:TitleData){this.screen='title';this.title=d;this.end=undefined;this.paint()}
  showCharacterSelect(id:string){this.screen='characters';this.selectedId=id;this.paint()}
  showPause(){this.screen='pause';this.paint()}
  showSettings(){this.screen='settings';this.paint()}
  showEnd(d:EndScreenData){this.screen='end';this.end=d;this.paint()}
  showPlayingHud(){this.screen='hidden';this.lastRun='';this.paint()}
  dispose(){window.clearTimeout(this.toastTimer);this.root.unmount()}
}
