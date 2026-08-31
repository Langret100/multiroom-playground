import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const index=read('index.html'), lobby=read('js/pages/lobby.js'), reg=read('js/games/registry.js'), room=read('room.html'), roomjs=read('js/pages/room.js'), css=read('css/styles.css');
const games=['stackga','suika','drawanswer','togester','suhaktokki','mathexplorer','backrooms3d','snaketail','soccer','geumchikeo'];
for(const id of games){
  const asset=path.join(root,'assets/images/game_cards',`${id}.webp`);
  if(!fs.existsSync(asset) || fs.statSync(asset).size<3000) throw new Error(`missing card image ${id}`);
  if(!reg.includes(`id:'${id}'`)) throw new Error(`registry ${id}`);
  if(!reg.includes(`game_cards/${id}.webp`)) throw new Error(`card ref ${id}`);
}
if(!index.includes('registry.js?v=20260831-cards6') || !room.includes('registry.js?v=20260831-cards6')) throw new Error('registry cache bust missing');
for(const token of ['gameCardGrid','playerCountChips','roomTitleCount']) if(!index.includes(token)) throw new Error(`index missing ${token}`);
if(index.includes('id="selectedGameSummary"')) throw new Error('empty selectedGameSummary bar returned');
if(index.includes('class="createRoomNote"')) throw new Error('obsolete empty room note returned');
for(const token of ['pointerdown','520','selectGameCard','renderPlayerChips','pickPop','launching']) if(!lobby.includes(token)) throw new Error(`lobby missing ${token}`);
if(!lobby.includes("meta.id === 'soccer'") || !lobby.includes('n%2===0')) throw new Error('soccer even players lost');
if(!lobby.includes("meta.id === 'mathexplorer' ? 1 : 2")) throw new Error('mathexplorer 1p lost');
for(const token of ['briefingControlVisual','briefingGameHero']) if(!room.includes(token)) throw new Error(`room missing ${token}`);
for(const token of ['pcControls','mobileControls','renderControlGuide','controlDeviceCard']) if(!(reg+roomjs+css).includes(token)) throw new Error(`controls missing ${token}`);
if(!css.includes('grid-template-columns:repeat(5') || !css.includes('@media(max-width:430px)')) throw new Error('responsive card grid missing');
console.log('CREATE_ROOM_UI_REGRESSION_OK games=10 longpress=520ms controls=pc+mobile');
