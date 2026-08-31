const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const ok=(value,message)=>{if(!value)throw new Error(message)};

const taskService=read('js/tasks/task-service.js'),admin=read('js/features/admin.js'),realtime=read('js/adapters/realtime.js');
const wallet=read('js/economy/coin-wallet.js'),server=read('docs/apps-script/coin-shopping-extension.gs'),code=read('docs/apps-script/Code.gs'),html=read('index.html');
ok(taskService.includes('refreshVersion')&&taskService.includes('version === refreshVersion ? publish(rows)'), 'older task responses can overwrite a newer submission');
ok(taskService.includes('pendingAssignments')&&taskService.includes('requestId')&&server.includes('MOARU_TASK_ASSIGN_REQUEST_PREFIX'), 'task assignment retries can create duplicate tasks');
ok(admin.includes('reloadQueued=true')&&admin.includes('mode="submitted"')&&admin.includes('value===mode?"active"'), 'automatic task refresh can be lost or reset the selected review tab');
ok(!admin.includes('if(type.value==="TASK")setTimeout(()=>render(host),200)'), 'assigning a task still redraws the entire administrator window');
ok(realtime.includes('/wakeup`),"value"')&&realtime.includes('/wakeup`]={ts:')&&!realtime.includes('signals/${commandSignalRoom(target)}/${crypto.randomUUID()}'), 'Firebase wake-up records still grow without a bound');
ok(wallet.includes('syncConnectedBadges(next)')&&wallet.includes('querySelectorAll?.(".coin-wallet-badge")'), 'authoritative coin changes do not update visible wallet badges');
ok(server.includes('function moaruRewardCoinMap_()')&&server.includes('const users = moaruSpreadsheetRetry_')&&server.includes('function moaruCoinChangeGuarded_')&&server.includes('afterCoin === expectedCoin'), 'coin sheet read retry or guarded single-write recovery is incomplete');
ok(server.includes('userId = requireKnownMoaruUserCached_(p.user_id)')&&server.includes('targets.map(String).filter(function (id, index, list)')&&!server.includes('return targets.map(String).filter'), 'command polling still scans the login/coin ledger for every user');
ok(code.includes('const errorCode = /^[A-Z][A-Z0-9_]{2,80}$/.test(message)'), 'known Apps Script error codes are hidden behind generic exception text');
for(const ref of ['js/core/user-directory.js?v=64.5.9','js/adapters/auth-api.js?v=64.5.40','js/adapters/realtime.js?v=64.5.47','js/economy/coin-wallet.js?v=64.5.10','js/shopping/store-service.js?v=64.5.25','js/tasks/task-service.js?v=64.5.26','js/tasks/task-window.js?v=64.5.10','js/features/shopping.js?v=64.5.42','js/features/admin.js?v=64.5.38','js/app.js?v=64.5.46'])ok(html.includes(ref),`stale audited asset version: ${ref}`);

class CE extends Event{constructor(type,options={}){super(type);this.detail=options.detail}}
const events=new EventTarget(),state={user:{user_id:'student',nickname:'학생'},tasks:{}},deferred=[];
const context={console,EventTarget,Event,CustomEvent:CE,setInterval:()=>1,clearInterval(){},setTimeout,clearTimeout,queueMicrotask,window:null};context.window=context;
context.MiniTalk={Tasks:{},Store:{get:key=>state[key],set:(key,value)=>{state[key]=value;events.dispatchEvent(new CE(`state:${key}`,{detail:value}))}},Events:{on:(type,listener)=>{const handler=event=>listener(event.detail);events.addEventListener(type,handler)},emit:(type,detail)=>events.dispatchEvent(new CE(type,{detail}))},AuthApi:{userTaskList:()=>new Promise(resolve=>deferred.push(resolve))},AdminSession:{requireToken:()=>''},Realtime:{},Tools:{Notifications:{}}};
vm.createContext(context);vm.runInContext(taskService,context,{filename:'task-service.js'});
(async()=>{
  const service=context.MiniTalk.Tasks.TaskService,older=service.refresh(true),newer=service.refresh(true);
  deferred[1]([{id:'t1',userId:'student',status:'submitted',answer:'최신 답안',updatedAt:2}]);await newer;
  deferred[0]([{id:'t1',userId:'student',status:'open',answer:'',updatedAt:1}]);await older;
  ok(state.tasks.t1?.status==='submitted'&&state.tasks.t1?.answer==='최신 답안','late task response replaced the latest submitted state');
  console.log('FULL_FLOW_AUDIT_OK');
})().catch(error=>{console.error(error);process.exitCode=1});
