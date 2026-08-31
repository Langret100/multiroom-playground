const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync('docs/apps-script/MOA_AI.gs','utf8');
const match=src.match(/function moaLearningTextEligible_\(value\)\{[\s\S]*?\n\}/);assert(match,'learning content eligibility filter missing');
const ctx={};vm.createContext(ctx);vm.runInContext(match[0],ctx);const ok=ctx.moaLearningTextEligible_;
for(const text of ['안녕 오늘 뭐해?','점심 먹었냐 ㅋㅋ','[게임]이라는 단어 얘기하자'])assert.strictEqual(ok(text),true,`normal conversation filtered: ${text}`);
for(const text of ['[사진]','[파일] 숙제.pdf','[[IMG]]https://example.com/a.jpg','[[FILE]]https://example.com/a.pdf 숙제.pdf','[사다리타기]','[체스 게임 시작]','[체스 게임 종료]','[마피아 게임 초대]','[마피아 게임 종료]','[게임 참가 확정]','[게임 나가기 요청]','[밤 결과]','[투표 무효]'])assert.strictEqual(ok(text),false,`non-conversation content learned: ${text}`);
assert(src.includes('if(!moaLearningTextEligible_(rawText))return;'),'learning readers do not apply eligibility filter');
console.log('MOA_LEARNING_CONTENT_FILTER_OK');
