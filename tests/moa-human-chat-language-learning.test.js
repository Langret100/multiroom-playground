const fs=require('fs'),vm=require('vm'),crypto=require('crypto');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const engine=fs.readFileSync('js/ai/moa-communication-engine.js','utf8');
const gs=fs.readFileSync('docs/apps-script/MOA_AI.gs','utf8');
const auth=fs.readFileSync('js/adapters/auth-api.js','utf8');
const admin=fs.readFileSync('js/features/admin.js','utf8');
const code=fs.readFileSync('docs/apps-script/Code.gs','utf8');
const html=fs.readFileSync('index.html','utf8');
for(const token of ['MOA_LANGUAGE_SHEET','모아_언어패턴','moaAdminLearnChats_','moaAdminLearningStatus_','moaLearningSources_','moaAnonymizeChatText_','moaChatTokens_','moaPublicHumanPatterns_','moaDedupeLanguagePatterns_','moaPublicHumanPatternDelta_','sync_version','patternDelta'])ok(gs.includes(token),'missing GS human-chat learning '+token);
for(const token of ['moa_admin_learning_status','moa_admin_learn_chats'])ok(code.includes(token),'missing Code route '+token);
for(const token of ['adminMoaLearningStatus','adminMoaLearnChats','cleanup'])ok(auth.includes(token),'missing AuthApi admin learning '+token);
for(const token of ['모아 대화 학습','새 대화 학습','전체 재학습','중복 정리','cleanup:first'])ok(admin.includes(token),'missing admin learning UI '+token);
ok(html.includes('moa-communication-engine.js?v=50')&&html.includes('auth-api.js?v=64.5.40')&&html.includes('admin.js?v=64.5.38'),'cache versions not bumped');

// Execute pure Apps Script language/privacy helpers with a small mock.
const gsCtx={console,Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,x)=>Array.from(crypto.createHash('sha256').update(String(x)).digest()),base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url')}};
vm.createContext(gsCtx);vm.runInContext(gs,gsCtx);
const scrub=gsCtx.moaAnonymizeChatText_;
ok(scrub('민수야 오늘 치킨 먹었는데 존맛',['민수']).includes('[사람]'),'nickname was not anonymized');
ok(!/01012345678/.test(scrub('내 번호 01012345678로 연락해',[])),'phone survived privacy scrub');
ok(!/test@example.com/.test(scrub('메일은 test@example.com 이야',[])),'email survived privacy scrub');
ok(!/한빛초등학교/.test(scrub('나 한빛초등학교 다녀',[])),'school survived privacy scrub');
ok(!/김민수/.test(scrub('내 친구 김민수가 오늘 왔어',[])),'friend real-name cue survived privacy scrub');
ok(!/6학년 2반 13번/.test(scrub('나는 6학년 2반 13번이야',[])),'class identifier survived privacy scrub');
const toks=gsCtx.moaChatTokens_('너 사과 좋아해?');
ok(toks.includes('사과')&&toks.includes('좋아하다'),'morph normalization failed: '+JSON.stringify(toks));
ok(gsCtx.moaChatIntent_('너 사과 좋아해?',toks)==='ask:preference','preference intent missing');

// Client: 1000 public human-chat patterns should be usable without scanning all 1000 every turn.
const store={},user={user_id:'semantic-user',isGuest:false};
let syncPayload={ok:true,version:901,policy:{},expressionWeights:{},patterns:[]};
const fillers=[];
for(let i=0;i<995;i++)fillers.push({id:'h-fill-'+i,trigger:`주제${i} 이야기`,reply:`주제${i} 반응`,act:'inform:statement',affect:'neutral',strategy:'direct',confidence:.7,tier:'growing',evidenceCount:2,semantic:{tokens:[`주제${i}`],categories:['misc'],intent:'inform:statement'},humanChat:true});
const useful=[
 {id:'h-apple',trigger:'너 사과 좋아해?',reply:'나는 사과보다 복숭아가 더 좋음 ㅋㅋ',act:'ask:preference',affect:'positive',strategy:'direct',confidence:.9,tier:'confirmed',evidenceCount:8,semantic:{tokens:['사과','좋아하다'],categories:['fruit','food','preference'],intent:'ask:preference'},humanChat:true},
 {id:'h-tired',trigger:'오늘 개피곤함',reply:'나도 오늘 완전 녹초임',act:'inform:emotion',affect:'negative',strategy:'empathy',confidence:.85,tier:'confirmed',evidenceCount:6,semantic:{tokens:['피곤하다'],categories:['emotion'],intent:'inform:emotion'},humanChat:true},
 {id:'h-bus',trigger:'버스 왜 이렇게 안 와',reply:'이럴 때 기다리는 시간이 제일 길게 느껴짐 ㅋㅋ',act:'ask:question',affect:'negative',strategy:'empathy',confidence:.8,tier:'growing',evidenceCount:3,semantic:{tokens:['버스','오다'],categories:['travel'],intent:'ask:question'},humanChat:true},
 {id:'h-game',trigger:'게임 이겼어',reply:'오 그건 좀 짜릿했겠다 ㅋㅋ',act:'inform:statement',affect:'positive',strategy:'ack',confidence:.82,tier:'growing',evidenceCount:4,semantic:{tokens:['게임','이기다'],categories:['game'],intent:'inform:statement'},humanChat:true},
 {id:'h-food',trigger:'치킨 먹었어',reply:'치킨은 실패하기 어렵지 ㅋㅋ',act:'inform:statement',affect:'positive',strategy:'ack',confidence:.82,tier:'growing',evidenceCount:4,semantic:{tokens:['치킨','먹다'],categories:['food'],intent:'inform:statement'},humanChat:true}
];
syncPayload.patterns=[...useful,...fillers];
const fakeMath=Object.create(Math);let seed=17;fakeMath.random=()=>((seed=seed*1103515245+12345>>>0)/4294967296);
const ctx={console,Date,Math:fakeMath,setTimeout:()=>1,clearTimeout:()=>{},MiniTalk:{AI:{},Store:{get:k=>k==='user'?user:undefined},Persistence:{get:(k,d)=>k in store?store[k]:d,set:(k,v)=>store[k]=JSON.parse(JSON.stringify(v)),remove:k=>delete store[k]},AuthApi:{moaSync:async()=>syncPayload,moaSearch:async()=>({}),moaCommit:async()=>({ok:true})}}};
vm.createContext(ctx);vm.runInContext(engine,ctx);const E=ctx.MiniTalk.AI.MoaCommunicationEngine;
(async()=>{
 await E.sync(true);
 const apple=await E.reply('너 딸기 좋아해?');
 ok(/딸기|복숭아|과일|좋/.test(apple.reply),'semantic preference pattern did not generalize: '+apple.reply);
 const tired=await E.reply('오늘 진짜 피곤해');
 ok(!/조금 더 말해줘|한마디만 더/.test(tired.reply),'tired semantic response fell back: '+tired.reply);
 // 700 diverse turns = >500 requested; record synchronous+async reply wall time.
 const prompts=['너 포도 좋아해?','오늘 너무 피곤해','버스 왜 안 와?','게임 이겼어','피자 먹었어','학교 끝남','친구 만나고 왔어','숙제 끝냈어','ㅋㅋ','오늘 좀 짜증나'];
 const t0=process.hrtime.bigint();
 for(let i=0;i<700;i++)await E.reply(prompts[i%prompts.length]);
 const ms=Number(process.hrtime.bigint()-t0)/1e6;
 ok(ms<4500,'700-turn semantic learning performance regression: '+ms.toFixed(1)+'ms');
 console.log('MOA_HUMAN_CHAT_LANGUAGE_LEARNING_OK',JSON.stringify({patterns:syncPayload.patterns.length,turns:700,ms:Number(ms.toFixed(1)),sample:apple.reply}));
})().catch(e=>{console.error(e);process.exit(1)});
