import fs from 'node:fs';
const s=fs.readFileSync(new URL('../games/bloomshot/game.js', import.meta.url),'utf8');
if(!s.includes("command.kind!=='move'")) throw new Error('jump is still locally predicted');
if(s.includes("['move','jump'].includes(command.kind)")) throw new Error('old jump prediction remains');
if(!s.includes("if(kind==='move'){send('bs_input',{input:c});return;}")) throw new Error('move fast-path missing');
console.log('bloomshot jump rewind regression: ok');
