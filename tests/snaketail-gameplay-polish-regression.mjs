import fs from 'node:fs';
const html=fs.readFileSync(new URL('../games/snaketail/index.html',import.meta.url),'utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(html.includes('const snakeSprite = new Image()'),'snake sprite loader missing');
ok(html.includes('Snake.png') && html.includes('EatSound_CC0_by_EugeneLoza.ogg') && html.includes('DieSound_CC0_by_EugeneLoza.ogg'),'CC0 asset refs missing');
ok(html.includes('spawnParticles(') && html.includes("spawnParticles(me.x,me.y,350,26,'die')") && html.includes('updateDrawParticles'),'snake VFX missing');
ok(html.includes('drawImage(snakeSprite') && html.includes('createRadialGradient'),'sprite/fallback render missing');
ok(html.includes('bodyStart=Math.min') && html.includes('bodyEnd=Math.max'),'short-snake collision window missing');
ok(!html.includes('for (let i=12; i<body.length; i+=2)'),'old collision skip still present');
ok(html.includes("bg.addColorStop(0,'#071126')") && html.includes("bg.addColorStop(1,'#10152d')"),'arena polish missing');
console.log('SNAKETAIL_GAMEPLAY_POLISH_REGRESSION_OK');
