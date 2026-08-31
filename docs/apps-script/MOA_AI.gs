/* ============================================================
   MOA_AI.gs - public learning + search backend

   Hard ownership boundary
   - Browser/local cache owns every user-specific memory and style profile.
   - Apps Script stores reusable aggregate policy evidence plus privacy-scrubbed
     short dialogue examples that are safe for common learning.
   - moa_sync returns public policy/expression weights and eligible common examples.
   - moa_commit accepts policy_feedback and privacy-scrubbed dialogue_example events.
   - moa_search performs transient external lookup; chat history is not stored.

   No per-user MOA profile or personal memory is created/read/written here.
   ============================================================ */
var MOA_POLICY_SHEET = "모아_대화정책";
var MOA_EXPRESSION_SHEET = "모아_표현가중치";
var MOA_EXAMPLE_SHEET = "모아_대화예시";
var MOA_LANGUAGE_SHEET = "모아_언어패턴";
var MOA_LANGUAGE_REBUILD_SHEET = "모아_언어패턴_재학습";
var MOA_LANGUAGE_DELTA_SHEET = "모아_언어변경";
var MOA_LANGUAGE_DELTA_FLOOR_PROPERTY = "MOA_LANGUAGE_DELTA_FLOOR_V1";
var MOA_LANGUAGE_DELTA_MAX_ROWS = 5000;
var MOA_CHAT_LEARN_STATE_PROPERTY = "MOA_CHAT_LEARN_STATE_V1";
var MOA_CHAT_LEARN_STATE_SHARD_PREFIX = "MOA_CHAT_LEARN_STATE_V2_";
var MOA_CHAT_LEARN_STATE_SHARDS = 32;
var MOA_LANGUAGE_PUBLISH_PROPERTY = "MOA_LANGUAGE_PUBLISHING_V1";
var MOA_PUBLIC_CACHE_CHUNK_CHARS = 24000;
var MOA_PUBLIC_CACHE_MAX_PARTS = 40;
var MOA_ACTIVITY_PROPERTY = "MOA_ACTIVITY_SERIAL";
var MOA_SYNC_VERSION_PROPERTY = "MOA_SYNC_VERSION";
var MOA_CORE_SYNC_VERSION_PROPERTY = "MOA_CORE_SYNC_VERSION_V1";
var MOA_ANON_SALT_PROPERTY = "MOA_ANON_SALT_V1";
var MOA_ANON_SALT_CACHE = "";
var MOA_MAINTENANCE_ACTIVITY_STEP = 800;
var MOA_LEARNING_LEASE_PROPERTY = "MOA_LEARNING_LEASE_V1";

function moaCurrentActivitySerial_(){return Number(PropertiesService.getScriptProperties().getProperty(MOA_ACTIVITY_PROPERTY)||0);}
function moaActivityTick_(){var p=PropertiesService.getScriptProperties(),n=moaCurrentActivitySerial_()+1;p.setProperty(MOA_ACTIVITY_PROPERTY,String(n));return n;}
function moaAcquireLearningLease_(owner,ttlMs){
  var scriptLock=null,locked=false,props=PropertiesService.getScriptProperties(),now=Date.now(),ttl=Math.max(10000,Math.min(300000,Number(ttlMs||60000)));
  try{if(typeof LockService!=="undefined"&&LockService.getScriptLock){scriptLock=LockService.getScriptLock();locked=scriptLock.tryLock(1200);if(!locked)return "";}}
  catch(e){scriptLock=null;locked=false;}
  try{var current={};try{current=JSON.parse(props.getProperty(MOA_LEARNING_LEASE_PROPERTY)||"{}")||{};}catch(e2){}if(Number(current.until||0)>now&&current.token)return "";
    var token="ml"+now+"-"+Math.random().toString(36).slice(2,10);props.setProperty(MOA_LEARNING_LEASE_PROPERTY,JSON.stringify({token:token,owner:String(owner||"moa"),until:now+ttl}));return token;
  }finally{try{if(scriptLock&&locked)scriptLock.releaseLock();}catch(e3){}}
}
function moaReleaseLearningLease_(token){if(!token)return;var scriptLock=null,locked=false;try{if(typeof LockService!=="undefined"&&LockService.getScriptLock){scriptLock=LockService.getScriptLock();locked=scriptLock.tryLock(1200);if(!locked)return;}}catch(e){scriptLock=null;locked=false;}
  try{var props=PropertiesService.getScriptProperties(),current={};try{current=JSON.parse(props.getProperty(MOA_LEARNING_LEASE_PROPERTY)||"{}")||{};}catch(e2){}if(String(current.token||"")===String(token))props.deleteProperty?props.deleteProperty(MOA_LEARNING_LEASE_PROPERTY):props.setProperty(MOA_LEARNING_LEASE_PROPERTY,"");}
  finally{try{if(scriptLock&&locked)scriptLock.releaseLock();}catch(e3){}}
}
function moaCurrentSyncVersion_(){return Number(PropertiesService.getScriptProperties().getProperty(MOA_SYNC_VERSION_PROPERTY)||1);}
function moaBumpSyncVersion_(){var p=PropertiesService.getScriptProperties(),n=moaCurrentSyncVersion_()+1;p.setProperty(MOA_SYNC_VERSION_PROPERTY,String(n));return n;}
function moaCurrentCoreSyncVersion_(){return Number(PropertiesService.getScriptProperties().getProperty(MOA_CORE_SYNC_VERSION_PROPERTY)||0);}
function moaMarkCoreSyncVersion_(v){var n=Math.max(0,Number(v||0));PropertiesService.getScriptProperties().setProperty(MOA_CORE_SYNC_VERSION_PROPERTY,String(n));return n;}
function moaAnonSalt_(){
  if(MOA_ANON_SALT_CACHE)return MOA_ANON_SALT_CACHE;
  var p=PropertiesService.getScriptProperties(),s=String(p.getProperty(MOA_ANON_SALT_PROPERTY)||"");if(s){MOA_ANON_SALT_CACHE=s;return s;}
  var lock=null,locked=false;
  try{if(typeof LockService!=="undefined"&&LockService.getScriptLock){lock=LockService.getScriptLock();locked=lock.tryLock(3000);if(!locked){s=String(p.getProperty(MOA_ANON_SALT_PROPERTY)||"");if(!s)throw new Error("MOA_SALT_INIT_BUSY");MOA_ANON_SALT_CACHE=s;return s;}}}catch(e){if(String(e&&e.message||e)==="MOA_SALT_INIT_BUSY")throw e;lock=null;locked=false;}
  try{s=String(p.getProperty(MOA_ANON_SALT_PROPERTY)||"");if(!s){try{s=Utilities.getUuid?Utilities.getUuid():"";}catch(e2){}if(!s)s=String(Date.now())+"-"+Math.random().toString(36).slice(2);p.setProperty(MOA_ANON_SALT_PROPERTY,s);}MOA_ANON_SALT_CACHE=s;return s;}
  finally{try{if(lock&&locked)lock.releaseLock();}catch(e3){}}
}
function moaAnonActorHash_(raw){var value=String(raw||"");if(!value)return "anon";var salt=moaAnonSalt_();try{if(Utilities.computeHmacSha256Signature){var b=Utilities.computeHmacSha256Signature(value,salt);return Utilities.base64EncodeWebSafe(b).replace(/[^A-Za-z0-9]/g,"").slice(0,16);}}catch(e){}return moaDigestShort_(salt+"|"+value,16);}
function moaEnsureSheet_(name,headers){var ss=SpreadsheetApp.getActiveSpreadsheet(),s=ss.getSheetByName(name);if(!s)s=ss.insertSheet(name);if(s.getLastRow()===0&&headers&&headers.length)s.getRange(1,1,1,headers.length).setValues([headers]);return s;}
function moaNormalize_(text){var s=String(text||"");try{s=s.normalize("NFC")}catch(e){}return s.replace(/\s+/g," ").trim().toLowerCase();}
function moaCompact_(text){return moaNormalize_(text).replace(/[\s~!！?？.,。·…'"“”‘’]/g,"");}

function moaFetchJson_(url){
  try{
    var res=UrlFetchApp.fetch(url,{muteHttpExceptions:true,followRedirects:true,headers:{"Accept":"application/json","User-Agent":"MOARU-Moa/1.0"}});
    if(res.getResponseCode()<200||res.getResponseCode()>=300)return null;
    return JSON.parse(res.getContentText());
  }catch(e){return null;}
}
function moaFetchText_(url){
  try{
    var res=UrlFetchApp.fetch(url,{muteHttpExceptions:true,followRedirects:true,headers:{"Accept":"text/html,application/xhtml+xml","User-Agent":"Mozilla/5.0 MOARU-Moa/1.0"}});
    if(res.getResponseCode()<200||res.getResponseCode()>=300)return "";
    return String(res.getContentText()||"");
  }catch(e){return "";}
}
function moaDecodeHtml_(text){
  return String(text||"")
    .replace(/<[^>]+>/g," ")
    .replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'")
    .replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&nbsp;/g," ")
    .replace(/&#(\d+);/g,function(_,n){try{return String.fromCharCode(Number(n))}catch(e){return ""}})
    .replace(/\s+/g," ").trim();
}
function moaWeatherIcon_(code){
  var c=Number(code);if(c===0)return "☀️";if(c<=3)return "⛅";if(c===45||c===48)return "🌫️";if(c>=51&&c<=67)return "🌧️";if(c>=71&&c<=77)return "🌨️";if(c>=80&&c<=82)return "🌦️";if(c>=85&&c<=86)return "🌨️";if(c>=95)return "⛈️";return "🌤️";
}
function moaWikiSearch_(query){
  var url="https://ko.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch="+encodeURIComponent(query)+"&gsrlimit=3&prop=extracts|info&exintro=1&explaintext=1&inprop=url&format=json&origin=*";
  var data=moaFetchJson_(url), pages=data&&data.query&&data.query.pages?data.query.pages:null;if(!pages)return [];
  var rows=[];Object.keys(pages).forEach(function(k){var v=pages[k]||{};if(v.title&&v.extract)rows.push({title:v.title,snippet:moaTrimAnswer_(v.extract,260),url:v.fullurl||("https://ko.wikipedia.org/wiki/"+encodeURIComponent(String(v.title).replace(/ /g,"_")))})});
  rows.sort(function(a,b){return a.title===query?-1:b.title===query?1:0});return rows.slice(0,3);
}
function moaDuckHtmlSearch_(query){
  var html=moaFetchText_("https://html.duckduckgo.com/html/?q="+encodeURIComponent(query));if(!html)return [];
  var rows=[], re=/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]{0,1600}?(?:class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>)?/gi, m;
  while((m=re.exec(html))&&rows.length<3){
    var url=moaDecodeHtml_(m[1]), title=moaDecodeHtml_(m[2]), snippet=moaDecodeHtml_(m[3]||"");
    var uddg=url.match(/[?&]uddg=([^&]+)/);if(uddg){try{url=decodeURIComponent(uddg[1])}catch(e){}}
    if(title&&/^https?:\/\//i.test(url))rows.push({title:title,snippet:moaTrimAnswer_(snippet,180),url:url});
  }
  return rows;
}


function moaSearchContext_(data){
  var rows=[];try{rows=JSON.parse(String(data&&data.context_json||"[]"))||[]}catch(e){rows=[]}
  return Array.isArray(rows)?rows.slice(-10):[];
}
function moaContextAnchor_(data){
  var rows=moaSearchContext_(data);
  for(var i=rows.length-1;i>=0;i--){
    var row=rows[i]||{};if(String(row.role||"")!=="user")continue;
    var t=String(row.text||"").trim();if(!t)continue;
    var c=moaCompact_(t);
    if(/^(그거|그게|그건|그걸|걔|그사람|거기|왜|어떻게|뭐야|누구야|알려줘|더알려줘|자세히알려줘|찾아줘|검색해줘)$/.test(c))continue;
    return t.replace(/[?？]+$/g,"").slice(0,120);
  }
  return "";
}
function moaCleanKnowledgeQuery_(query,text){
  var q=String(query||text||"").trim().replace(/[?？]+$/g,"");
  q=q.replace(/^(오늘|지금|현재)\s+/g,"");
  q=q.replace(/(?:좀\s*)?(?:검색해줘|검색해|찾아줘|찾아봐|알아봐줘|알아봐|확인해줘|설명해줘|알려줘|정리해줘|더\s*자세히\s*알려줘|자세히\s*알려줘)$/g,"").trim();
  q=q.replace(/\s*(?:누구야|누구인지|뭐야|무엇이야|무슨뜻이야|뜻이야|어디야|언제야|왜그래|왜야)$/g,"").trim();
  q=q.replace(/(\S{2,})(?:은|는|이|가)$/,"$1").trim();
  return q;
}
function moaWikiExact_(query){
  var q=String(query||"").trim();if(!q)return [];
  var url="https://ko.wikipedia.org/w/api.php?action=query&titles="+encodeURIComponent(q)+"&prop=extracts|info&exintro=1&explaintext=1&inprop=url&redirects=1&format=json&origin=*";
  var data=moaFetchJson_(url),pages=data&&data.query&&data.query.pages?data.query.pages:null;if(!pages)return [];
  var rows=[];Object.keys(pages).forEach(function(k){var v=pages[k]||{};if(Number(k)<0||!v.title||!v.extract)return;rows.push({title:v.title,snippet:moaTrimAnswer_(v.extract,420),url:v.fullurl||("https://ko.wikipedia.org/wiki/"+encodeURIComponent(String(v.title).replace(/ /g,"_"))),exact:true})});
  return rows;
}

function moaWikiSummary_(query){
  var q=String(query||"").trim();if(!q)return null;
  try{
    var url="https://ko.wikipedia.org/api/rest_v1/page/summary/"+encodeURIComponent(q.replace(/ /g,"_"));
    var data=moaFetchJson_(url);if(!data||data.type==="https://mediawiki.org/wiki/HyperSwitch/errors/not_found"||!data.extract)return null;
    var pageUrl=data.content_urls&&data.content_urls.desktop&&data.content_urls.desktop.page||"";
    var thumb=data.thumbnail&&data.thumbnail.source||data.originalimage&&data.originalimage.source||"";
    return {title:String(data.title||q),snippet:moaTrimAnswer_(data.extract,520),url:pageUrl,exact:true,thumbnail:thumb};
  }catch(e){return null;}
}
function moaImageKnowledge_(text,query){
  var raw=String(text||""),q=moaCleanKnowledgeQuery_(query,raw);
  var imageIntent=/(생김새|생긴\s*모습|어떻게\s*생겼|모습\s*(?:보여|알려)|사진\s*(?:보여|찾)|이미지\s*(?:보여|찾|검색)|얼굴\s*(?:보여|사진)|사진$|이미지$)/.test(raw);
  if(!imageIntent||!q)return null;
  var row=moaWikiSummary_(q);
  if(!row){
    var exact=moaWikiExact_(q);if(exact.length)row=exact[0];
  }
  if(!row){
    var searched=moaWikiSearch_(q);if(searched.length)row=searched[0];
  }
  var google="https://www.google.com/search?safe=active&tbm=isch&q="+encodeURIComponent(q);
  if(row&&row.thumbnail){
    return {reply:q+" 모습은 이쪽이야. 아래 이미지를 눌러 크게 볼 수 있어.",source:"image-answer",kind:"image",image_url:row.thumbnail,image_search_url:google,source_url:row.url||""};
  }
  return {reply:q+" 사진을 바로 찾을 수 있게 이미지 검색을 열어둘게.",source:"image-search",kind:"image",image_search_url:google};
}
function moaResultQuality_(row,query,index){
  var title=moaNormalize_(row&&row.title||""),snippet=moaNormalize_(row&&row.snippet||""),q=moaNormalize_(query),words=moaSearchWords_(query),score=Math.max(0,30-index*3);
  if(title===q)score+=55;else if(title.indexOf(q)>=0||q.indexOf(title)>=0)score+=28;
  words.forEach(function(w){if(title.indexOf(w)>=0)score+=10;if(snippet.indexOf(w)>=0)score+=5});
  if(row&&row.exact)score+=18;
  if(/동음이의어|목록|분류:|위키미디어/.test(title+" "+snippet))score-=35;
  if(!snippet||snippet.length<24)score-=18;
  return score;
}
function moaRankResults_(rows,query){
  var seen={},out=[];(rows||[]).forEach(function(row,i){if(!row||!row.snippet)return;var key=String(row.url||row.title||"").toLowerCase();if(key&&seen[key])return;if(key)seen[key]=1;out.push({row:row,score:moaResultQuality_(row,query,i)})});
  out.sort(function(a,b){return b.score-a.score});return out.map(function(v){v.row._quality=v.score;return v.row});
}
function moaFactualAnswer_(query,results){
  var ranked=moaRankResults_(results,query);if(!ranked.length||Number(ranked[0]._quality||0)<24)return "";
  var first=ranked[0],parts=moaSentenceParts_(first.snippet).filter(function(v){return !/^(이 문서는|동음이의어|분류:)/.test(moaNormalize_(v))});
  if(!parts.length)return moaTrimAnswer_(first.snippet,420);
  var best=parts.map(function(v,i){return {text:v,score:moaSentenceScore_(v,query,i)}}).sort(function(a,b){return b.score-a.score}).slice(0,2).map(function(v){return moaTrimAnswer_(v.text,240)});
  return moaTrimAnswer_(best.join(" "),460);
}
function moaQueryLooksGeneric_(q){return /^(이거|그거|그게|그건|그걸|그사람|걔|거기|왜|어떻게|뭐야|누구야|알려줘|더알려줘|자세히알려줘)?$/.test(moaCompact_(q));}

function moaTrimAnswer_(text,max){
  var s=String(text||"").replace(/\s+/g," ").trim(), n=Number(max||420);if(s.length<=n)return s;return s.slice(0,n-1).replace(/\s+\S*$/g,"")+"…";
}
function moaWeatherCodeText_(code){
  var c=Number(code);if(c===0)return "맑음";if(c<=3)return "구름 조금";if(c===45||c===48)return "안개";if(c>=51&&c<=67)return "비";if(c>=71&&c<=77)return "눈";if(c>=80&&c<=82)return "소나기";if(c>=85&&c<=86)return "눈 소나기";if(c>=95)return "뇌우";return "날씨 변화";
}

function moaKnownPlace_(place){
  var q=String(place||"").trim().replace(/특별시$|광역시$|특별자치시$|특별자치도$|도$/g,"");
  var map={
    "서울":{name:"서울",admin1:"서울특별시",latitude:37.5665,longitude:126.9780,timezone:"Asia/Seoul"},
    "부산":{name:"부산",admin1:"부산광역시",latitude:35.1796,longitude:129.0756,timezone:"Asia/Seoul"},
    "대구":{name:"대구",admin1:"대구광역시",latitude:35.8714,longitude:128.6014,timezone:"Asia/Seoul"},
    "인천":{name:"인천",admin1:"인천광역시",latitude:37.4563,longitude:126.7052,timezone:"Asia/Seoul"},
    "광주":{name:"광주",admin1:"광주광역시",latitude:35.1595,longitude:126.8526,timezone:"Asia/Seoul"},
    "대전":{name:"대전",admin1:"대전광역시",latitude:36.3504,longitude:127.3845,timezone:"Asia/Seoul"},
    "울산":{name:"울산",admin1:"울산광역시",latitude:35.5384,longitude:129.3114,timezone:"Asia/Seoul"},
    "세종":{name:"세종",admin1:"세종특별자치시",latitude:36.4800,longitude:127.2890,timezone:"Asia/Seoul"},
    "제주":{name:"제주",admin1:"제주특별자치도",latitude:33.4996,longitude:126.5312,timezone:"Asia/Seoul"},
    "제주시":{name:"제주",admin1:"제주특별자치도",latitude:33.4996,longitude:126.5312,timezone:"Asia/Seoul"},
    "군산":{name:"군산",admin1:"전북특별자치도",latitude:35.9677,longitude:126.7366,timezone:"Asia/Seoul"},
    "군산시":{name:"군산",admin1:"전북특별자치도",latitude:35.9677,longitude:126.7366,timezone:"Asia/Seoul"}
  };
  return map[q]||null;
}

function moaWeatherSearch_(text){
  var raw=String(text||"");if(!/(날씨|기온|몇\s*도)/.test(raw))return null;
  var normalized=raw.replace(/^(오늘|지금|내일)\s+/,"");
  var m=normalized.match(/(.{1,40}?)(?:\s*(?:의|은|는))?\s*(?:오늘|지금|내일)?\s*(?:날씨|기온|몇\s*도)/);if(!m)return {reply:"어느 지역 날씨를 볼까? 예: 서울 오늘 날씨 알려줘",source:"open-meteo",kind:"weather"};
  var place=String(m[1]||"").replace(/^(오늘|지금|내일)\s*/,"").replace(/\s*(오늘|지금|내일)$/,"").trim();if(!place||place.length>40)return null;
  var loc=moaGeoPlace_(place);if(!loc)return {reply:place+" 위치를 정확히 못 찾았어. 지역 이름을 조금 더 구체적으로 말해줘.",source:"open-meteo",kind:"weather"};
  var forecast=moaFetchJson_("https://api.open-meteo.com/v1/forecast?latitude="+encodeURIComponent(loc.latitude)+"&longitude="+encodeURIComponent(loc.longitude)+"&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=2");
  if(!forecast||!forecast.current)return null;
  var cur=forecast.current,d=forecast.daily||{}, name=[loc.name,loc.admin1].filter(Boolean).join(" "), tomorrow=/내일/.test(text), idx=tomorrow?1:0;
  if(tomorrow&&d.time&&d.time[idx]){
    var tmax=Math.round(Number(d.temperature_2m_max[idx])),tmin=Math.round(Number(d.temperature_2m_min[idx])),rain=Math.round(Number(d.precipitation_probability_max[idx]||0));
    return {reply:"📍 "+name+" · 내일\n🌡️ "+tmin+"° ~ "+tmax+"°\n☔ 강수확률 최대 "+rain+"%\n\n외출 전에는 한 번 더 확인해줘. 예보는 바뀔 수 있어.",source:"open-meteo",kind:"weather"};
  }
  var max0=Math.round(Number((d.temperature_2m_max||[])[0])),min0=Math.round(Number((d.temperature_2m_min||[])[0])),rain0=Math.round(Number((d.precipitation_probability_max||[])[0]||0));
  return {reply:"📍 "+name+" · 현재\n"+moaWeatherIcon_(cur.weather_code)+" "+moaWeatherCodeText_(cur.weather_code)+"  "+Math.round(Number(cur.temperature_2m))+"°\n🌡️ 체감 "+Math.round(Number(cur.apparent_temperature))+"° · 오늘 "+min0+"° ~ "+max0+"°\n☔ 강수확률 최대 "+rain0+"%\n💨 바람 "+Math.round(Number(cur.wind_speed_10m||0))+" km/h",source:"open-meteo",kind:"weather"};
}

function moaGeoPlace_(place){
  var q=String(place||"").trim();if(!q)return null;
  var known=moaKnownPlace_(q);if(known)return known;
  var compact=q.replace(/\s+/g,"").replace(/(?:특별시|광역시|특별자치시|특별자치도)$/g,"");
  known=moaKnownPlace_(compact);if(known)return known;
  if(/시$/.test(compact)){known=moaKnownPlace_(compact.slice(0,-1));if(known)return known;}
  var variants=[q];
  if(!/(시|군|구|도)$/.test(q))variants.push(q+"시");
  if(/시$/.test(q))variants.push(q.slice(0,-1));
  var loc=null;
  for(var i=0;i<variants.length&&!loc;i++){
    var geo=moaFetchJson_("https://geocoding-api.open-meteo.com/v1/search?name="+encodeURIComponent(variants[i])+"&count=5&language=ko&format=json");
    var rows=geo&&geo.results||[];
    if(rows.length){
      rows.sort(function(a,b){var ak=String(a.country_code||"")==="KR"?1:0,bk=String(b.country_code||"")==="KR"?1:0;return bk-ak});
      loc=rows[0]||null;
    }
  }
  if(loc)return loc;
  var aliases={"서울":"Seoul","부산":"Busan","대구":"Daegu","인천":"Incheon","광주":"Gwangju","대전":"Daejeon","울산":"Ulsan","세종":"Sejong","제주":"Jeju","군산":"Gunsan","수원":"Suwon","전주":"Jeonju","청주":"Cheongju","천안":"Cheonan","포항":"Pohang","창원":"Changwon","춘천":"Chuncheon","강릉":"Gangneung","목포":"Mokpo","여수":"Yeosu"};
  var fallback=aliases[compact.replace(/시$/,"")];if(!fallback)return null;
  var geo2=moaFetchJson_("https://geocoding-api.open-meteo.com/v1/search?name="+encodeURIComponent(fallback)+"&count=3&language=ko&format=json");
  var rows2=geo2&&geo2.results||[];return rows2.filter(function(v){return String(v.country_code||"")==="KR"})[0]||rows2[0]||null;
}
function moaAirQualitySearch_(text){
  var raw=String(text||"");if(!/(미세먼지|초미세먼지|공기질|대기질|pm\s*2\.5|pm\s*10)/i.test(raw))return null;
  var m=raw.match(/(.{1,40}?)(?:\s*(?:의|은|는))?\s*(?:오늘|지금)?\s*(?:미세먼지|초미세먼지|공기질|대기질|pm\s*2\.5|pm\s*10)/i);
  var place=m?String(m[1]||"").replace(/^(오늘|지금)\s*/,"").trim():"";
  if(!place)return {reply:"어느 지역 공기질을 볼까? 예: 서울 미세먼지 알려줘",source:"open-meteo-air",kind:"air-quality"};
  var loc=moaGeoPlace_(place);if(!loc)return {reply:place+" 위치를 정확히 못 찾았어. 지역 이름을 조금 더 구체적으로 말해줘.",source:"open-meteo-air",kind:"air-quality"};
  var data=moaFetchJson_("https://air-quality-api.open-meteo.com/v1/air-quality?latitude="+encodeURIComponent(loc.latitude)+"&longitude="+encodeURIComponent(loc.longitude)+"&current=pm10,pm2_5,us_aqi&timezone=auto");
  if(!data||!data.current)return null;
  var cur=data.current,name=[loc.name,loc.admin1].filter(Boolean).join(" "),aqi=Number(cur.us_aqi),grade=aqi<=50?"좋음":aqi<=100?"보통":aqi<=150?"민감한 사람은 주의":aqi<=200?"나쁨":"매우 나쁨";
  return {reply:name+" 현재 공기질은 "+grade+" 정도야. PM2.5 "+Math.round(Number(cur.pm2_5||0))+"㎍/㎥, PM10 "+Math.round(Number(cur.pm10||0))+"㎍/㎥, AQI "+Math.round(aqi||0)+" 정도야.",source:"open-meteo-air",kind:"air-quality"};
}
function moaCityTimeSearch_(text){
  var raw=String(text||"");if(!/(현지\s*시간|지금\s*몇\s*시|현재\s*시간)/.test(raw))return null;
  var m=raw.match(/(.{1,40}?)(?:\s*(?:은|는|의))?\s*(?:지금\s*몇\s*시|현지\s*시간|현재\s*시간)/);if(!m)return null;
  var place=String(m[1]||"").trim();if(!place)return null;
  var loc=moaGeoPlace_(place);if(!loc||!loc.timezone)return {reply:place+" 시간대를 정확히 못 찾았어. 도시 이름을 조금 더 구체적으로 말해줘.",source:"open-meteo-geocoding",kind:"city-time"};
  var when=Utilities.formatDate(new Date(),loc.timezone,"yyyy년 M월 d일 HH:mm"),name=[loc.name,loc.country].filter(Boolean).join(" ");
  return {reply:name+" 현지 시간은 "+when+"이야.",source:"open-meteo-geocoding",kind:"city-time"};
}
function moaSearchShortcut_(text,query){
  var raw=String(text||""),q=String(query||"").trim();if(!q)return null;
  function strip(pattern){return q.replace(pattern,"").trim()||String(raw).replace(pattern,"").trim();}
  if(/유튜브|youtube|영상\s*검색/i.test(raw)){
    var y=strip(/(?:유튜브|youtube|에서|영상|검색|찾아줘|찾아봐|찾아)/gi);if(!y)y=q;
    return {reply:"유튜브에서 바로 찾아볼 수 있어:\nhttps://www.youtube.com/results?search_query="+encodeURIComponent(y),source:"youtube-search",kind:"youtube"};
  }
  if(/지도|길찾|위치\s*찾/i.test(raw)){
    var mapq=strip(/(?:네이버|구글|지도|에서|길찾기|길찾|위치|검색|찾아줘|찾아봐|찾아)/gi);if(!mapq)mapq=q;
    return {reply:"지도에서 찾아볼게.\n네이버 지도: https://map.naver.com/p/search/"+encodeURIComponent(mapq)+"\nGoogle 지도: https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(mapq),source:"map-search",kind:"map"};
  }
  if(/이미지\s*검색|사진\s*검색|사진\s*찾|이미지\s*찾/.test(raw)){
    var iq=strip(/(?:이미지|사진|검색|찾아줘|찾아봐|찾아)/g);if(!iq)iq=q;
    return {reply:"이미지 검색으로 바로 볼 수 있어:\nhttps://www.google.com/search?safe=active&tbm=isch&q="+encodeURIComponent(iq),source:"image-search",kind:"image"};
  }
  if(/네이버.*검색|네이버에서/.test(raw)){
    var nq=strip(/(?:네이버|에서|검색|찾아줘|찾아봐|찾아)/g);if(!nq)nq=q;
    return {reply:"네이버 검색 결과 바로가기:\nhttps://search.naver.com/search.naver?query="+encodeURIComponent(nq),source:"naver-search",kind:"web"};
  }
  if(/구글.*검색|구글에서/.test(raw)){
    var gq=strip(/(?:구글|google|에서|검색|찾아줘|찾아봐|찾아)/gi);if(!gq)gq=q;
    return {reply:"Google 안전검색 결과 바로가기:\nhttps://www.google.com/search?safe=active&q="+encodeURIComponent(gq),source:"google-search",kind:"web"};
  }
  return null;
}

function moaCurrencyCode_(word){
  var w=String(word||"").toLowerCase();var map={"달러":"USD","미국달러":"USD","usd":"USD","원":"KRW","원화":"KRW","krw":"KRW","엔":"JPY","엔화":"JPY","jpy":"JPY","유로":"EUR","eur":"EUR","위안":"CNY","위안화":"CNY","cny":"CNY","파운드":"GBP","gbp":"GBP"};return map[w]||"";
}
function moaCurrencySearch_(text){
  var s=String(text||"").replace(/,/g,"");if(!/(환율|달러|원화|엔화|유로|위안|파운드|USD|KRW|JPY|EUR|CNY|GBP)/i.test(s))return null;
  var m=s.match(/(\d+(?:\.\d+)?)\s*(미국달러|달러|원화|원|엔화|엔|유로|위안화|위안|파운드|USD|KRW|JPY|EUR|CNY|GBP)\s*(?:를|을|이|가)?\s*(?:(미국달러|달러|원화|원|엔화|엔|유로|위안화|위안|파운드|USD|KRW|JPY|EUR|CNY|GBP)(?:로|으로|면|이면)?)?/i);
  var amount=m?Number(m[1]):1, from=m?moaCurrencyCode_(m[2]):"USD", to=m&&m[3]?moaCurrencyCode_(m[3]):(from==="KRW"?"USD":"KRW");if(!from||!to||from===to)return null;
  var data=moaFetchJson_("https://api.frankfurter.app/latest?amount="+encodeURIComponent(amount)+"&from="+from+"&to="+to);var value=data&&data.rates&&data.rates[to];if(value==null)return null;
  var rounded=Math.round(Number(value)*100)/100;return {reply:amount.toLocaleString("ko-KR")+" "+from+"는 현재 기준 약 "+rounded.toLocaleString("ko-KR")+" "+to+"야. 환율은 계속 바뀔 수 있어.",source:"frankfurter",kind:"currency"};
}
function moaNewsSearch_(text,query){
  if(!/(뉴스|소식|최신|최근|업데이트)/.test(String(text||"")))return null;
  try{
    var url="https://news.google.com/rss/search?q="+encodeURIComponent(query)+"&hl=ko&gl=KR&ceid=KR:ko";
    var res=UrlFetchApp.fetch(url,{muteHttpExceptions:true,followRedirects:true,headers:{"User-Agent":"MOARU-Moa/1.0"}});if(res.getResponseCode()<200||res.getResponseCode()>=300)return null;
    var root=XmlService.parse(res.getContentText()).getRootElement(), channel=root.getChild("channel"), items=channel?channel.getChildren("item").slice(0,3):[];if(!items.length)return null;
    var lines=items.map(function(item,i){var title=item.getChildText("title")||"", link=item.getChildText("link")||"";return (i+1)+". "+moaTrimAnswer_(title,120)+(link?"\n"+link:"");});
    return {reply:"최근 관련 소식은 이쪽이야:\n"+lines.join("\n\n"),source:"google-news",kind:"news"};
  }catch(e){return null;}
}
function moaSentenceParts_(text){
  var s=String(text||"").replace(/\s+/g," ").trim();if(!s)return [];
  var parts=s.match(/[^.!?。！？]+[.!?。！？]?/g)||[s];
  return parts.map(function(v){return v.trim()}).filter(function(v){return v.length>=18});
}
function moaSearchWords_(text){
  return moaNormalize_(text).replace(/[^0-9a-z가-힣 ]/gi," ").split(/\s+/).filter(function(v){return v.length>=2&&!["알려줘","설명해줘","찾아줘","검색해줘","뭐야","누구야","무엇","어디","언제"].includes(v)});
}
function moaSentenceScore_(sentence,query,index){
  var s=moaNormalize_(sentence), words=moaSearchWords_(query), score=Math.max(0,18-index*2);
  words.forEach(function(w){if(s.indexOf(w)>=0)score+=8});
  if(sentence.length>=45&&sentence.length<=190)score+=6;
  if(/^(이 문서는|동음이의어|분류:|위키)/.test(s))score-=30;
  return score;
}
function moaSynthesizeSearch_(query,results){
  var candidates=[],seen={};
  (results||[]).forEach(function(row,ri){
    moaSentenceParts_(row.snippet).forEach(function(sentence,si){
      var key=moaNormalize_(sentence).replace(/[^0-9a-z가-힣]/gi,"").slice(0,90);if(!key||seen[key])return;seen[key]=1;
      candidates.push({text:sentence,score:moaSentenceScore_(sentence,query,ri*3+si),source:ri});
    });
  });
  candidates.sort(function(a,b){return b.score-a.score});
  var chosen=[],usedSources={};
  candidates.forEach(function(v){
    if(chosen.length>=3)return;
    var tooSimilar=chosen.some(function(x){
      var a=moaSearchWords_(x.text),b=moaSearchWords_(v.text),same=a.filter(function(w){return b.indexOf(w)>=0}).length;
      return same>=Math.min(4,Math.max(2,Math.floor(Math.min(a.length,b.length)*.65)));
    });
    if(!tooSimilar){chosen.push(v);usedSources[v.source]=1;}
  });
  if(!chosen.length)return "";
  var answer=chosen.map(function(v){return moaTrimAnswer_(v.text,240)}).join(" ");
  return moaTrimAnswer_(answer,620);
}
function moaGeneralSearch_(query,text){
  var raw=String(text||""),q=moaCleanKnowledgeQuery_(query,raw);if(!q)return null;
  var lookup=q;
  if(/추천|골라|뭐가\s*좋/.test(raw)&&!/추천/.test(lookup))lookup=q+" 추천";
  else if(/비교|차이|장단점/.test(raw)&&!/(비교|차이)/.test(lookup))lookup=q+" 비교 차이";
  else if(/최신|최근|요즘/.test(raw)&&!/(최신|최근)/.test(lookup))lookup=q+" 최신";
  var cache=CacheService.getScriptCache(),key="moa.search.v4."+Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,lookup+"|"+raw.slice(0,80))).slice(0,28),hit=cache.get(key);if(hit){try{return JSON.parse(hit)}catch(e){}}
  var factual=/누구|뭐야|무엇|뜻|정의|어떤\s*(?:사람|것|캐릭터|동물|곳)|설명/.test(raw)&&!/(최신|최근|뉴스|추천|비교|차이|장단점|검색)/.test(raw);
  var results=[];
  if(factual){
    var summaryRow=moaWikiSummary_(q);if(summaryRow)results.push(summaryRow);
    moaWikiExact_(q).forEach(function(v){results.push(v)});
  }
  if(/추천|골라|비교|차이|장단점/.test(raw))moaDuckHtmlSearch_(lookup).forEach(function(v){if(results.length<5)results.push(v)});
  moaWikiSearch_(lookup).forEach(function(v){if(results.length<5)results.push(v)});
  if(results.length<4){
    var ddgJson=moaFetchJson_("https://api.duckduckgo.com/?q="+encodeURIComponent(lookup)+"&format=json&no_html=1&no_redirect=1&skip_disambig=1");
    if(ddgJson&&(ddgJson.Answer||ddgJson.AbstractText))results.push({title:ddgJson.Heading||q,snippet:moaTrimAnswer_(ddgJson.Answer||ddgJson.AbstractText,420),url:ddgJson.AbstractURL||""});
  }
  if(results.length<4)moaDuckHtmlSearch_(lookup).forEach(function(v){if(results.length<5)results.push(v)});
  results=moaRankResults_(results,lookup);
  var out,summary=factual?moaFactualAnswer_(q,results):moaSynthesizeSearch_(lookup,results);
  if(results.length&&summary){
    var refs=factual?[]:results.filter(function(v){return v.url&&v.snippet&&Number(v._quality||0)>=18}).slice(0,2).map(function(v){return "• "+moaTrimAnswer_(v.title,70)+"\n"+v.url});
    out={reply:summary+(refs.length?"\n\n참고한 공개 자료\n"+refs.join("\n"):""),source:factual?"knowledge-answer":(results[0].url&&/wikipedia\.org/.test(results[0].url)?"wikipedia-answer":"web-answer"),kind:"answer"};
  }else if(results.length&&Number(results[0]._quality||0)>=18){
    var first=results[0];out={reply:moaTrimAnswer_(first.snippet,420)+(factual?"":"\n\n참고 자료\n"+first.url),source:factual?"knowledge-answer":"web-answer",kind:"answer"};
  }else{
    out={reply:q+"에 대한 설명을 바로 가져오지 못했어. 다른 공개 자료로 한 번 더 찾거나, 이름을 조금 더 붙여주면 바로 이어서 확인할게.",source:"web-answer",kind:"answer"};
  }
  cache.put(key,JSON.stringify(out),600);return out;
}
function moaSearchAssist_(data){
  var text=String(data.text||"").trim(),query=String(data.query||text).trim();if(!query)return jsonResponse_({ok:false,error:"MOA_SEARCH_QUERY_REQUIRED"});
  var cleaned=moaCleanKnowledgeQuery_(query,text);
  if((!cleaned||moaQueryLooksGeneric_(cleaned))&&data){var anchor=moaContextAnchor_(data);if(anchor)query=anchor+" "+query;}
  var image=moaImageKnowledge_(text||query,query);if(image)return jsonResponse_({ok:true,reply:image.reply,source:image.source,kind:image.kind,image_url:image.image_url||"",image_search_url:image.image_search_url||"",source_url:image.source_url||""});
  var shortcut=moaSearchShortcut_(text||query,query);if(shortcut)return jsonResponse_({ok:true,reply:shortcut.reply,source:shortcut.source,kind:shortcut.kind,image_url:shortcut.image_url||"",image_search_url:shortcut.image_search_url||"",source_url:shortcut.source_url||""});
  var air=moaAirQualitySearch_(text||query);if(air)return jsonResponse_({ok:true,reply:air.reply,source:air.source,kind:air.kind});
  var cityTime=moaCityTimeSearch_(text||query);if(cityTime)return jsonResponse_({ok:true,reply:cityTime.reply,source:cityTime.source,kind:cityTime.kind});
  var weather=moaWeatherSearch_(text||query);if(weather)return jsonResponse_({ok:true,reply:weather.reply,source:weather.source,kind:weather.kind});
  var currency=moaCurrencySearch_(text||query);if(currency)return jsonResponse_({ok:true,reply:currency.reply,source:currency.source,kind:currency.kind});
  var news=moaNewsSearch_(text||query,query);if(news)return jsonResponse_({ok:true,reply:news.reply,source:news.source,kind:news.kind});
  var general=moaGeneralSearch_(query,text);return jsonResponse_({ok:true,reply:general.reply,source:general.source,kind:general.kind});
}


function moaLegacyUserHash_(userId){return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(userId||""))).slice(0,18);}
function moaUserHash_(userId){return "u2"+moaAnonActorHash_("feedback:"+String(userId||""));}
function moaHashList_(v){return String(v||"").split(",").map(function(x){return x.trim()}).filter(Boolean);}
function moaAppendUniqueHash_(v,h){var a=moaHashList_(v);if(!h||a.indexOf(h)>=0)return {value:a.join(","),added:false,saturated:false};if(a.length>=120)return {value:a.join(","),added:false,saturated:true};a.push(h);return {value:a.join(","),added:true,saturated:false};}
function moaAppendUserHash_(v,userId){
  var a=moaHashList_(v),fresh=moaUserHash_(userId),legacy=moaLegacyUserHash_(userId),at=a.indexOf(fresh),old=a.indexOf(legacy);
  if(at>=0)return {value:a.join(","),added:false,migrated:false,saturated:false};
  if(old>=0){a[old]=fresh;return {value:a.join(","),added:false,migrated:true,saturated:false};}
  // Once the bounded uniqueness set is full, keep it stable instead of evicting
  // old actors. Eviction would let the same returning actor be counted again.
  if(a.length>=120)return {value:a.join(","),added:false,migrated:false,saturated:true};
  a.push(fresh);return {value:a.join(","),added:true,migrated:false,saturated:false};
}
function moaEvidenceHashWithUserHash_(userHash,event){var raw=[String(userHash||""),String(event&&event.evidenceKey||""),String(event&&event.type||""),String(event&&event.strategy||"")].join("|");return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,raw)).slice(0,18);}
function moaEvidenceHash_(uid,event){return moaEvidenceHashWithUserHash_(moaUserHash_(uid),event);}
function moaAppendEvidenceHash_(v,uid,event){
  var a=moaHashList_(v),fresh=moaEvidenceHash_(uid,event),legacy=moaEvidenceHashWithUserHash_(moaLegacyUserHash_(uid),event),at=a.indexOf(fresh),old=a.indexOf(legacy);
  if(at>=0)return {value:a.join(","),added:false,migrated:false,saturated:false};
  if(old>=0){a[old]=fresh;return {value:a.join(","),added:false,migrated:true,saturated:false};}
  if(a.length>=120)return {value:a.join(","),added:false,migrated:false,saturated:true};
  a.push(fresh);return {value:a.join(","),added:true,migrated:false,saturated:false};
}
function moaEvidenceWeight_(event){return moaClamp_(Math.abs(moaNum_(event&&event.weight,1)),.10,1);}
function moaPolicyLearningTier_(posUsers,negUsers,posScore,negScore,evidenceCount){
  posUsers=Number(posUsers||0);negUsers=Number(negUsers||0);posScore=Number(posScore||0);negScore=Number(negScore||0);evidenceCount=Number(evidenceCount||0);
  if(posUsers>=3&&posUsers>=negUsers+2&&posScore>=2.6&&posScore>=negScore+1.5)return "confirmed";
  if(posUsers>=2&&posUsers>negUsers&&posScore>=2.0&&posScore>=negScore+1.2)return "growing";
  if(posUsers>=1&&evidenceCount>=5&&posScore>=2.3&&negScore<=.35&&posScore>=negScore+2.0)return "solo";
  return "observing";
}
function moaJson_(value,fallback){try{return JSON.parse(String(value||""))}catch(e){return fallback;}}
function moaNum_(v,d){v=Number(v);return isFinite(v)?v:d;}
function moaClamp_(v,a,b){return Math.max(a,Math.min(b,moaNum_(v,a)));}

function moaPolicySheet_(){return moaEnsureSheet_(MOA_POLICY_SHEET,["policy_key","strategy","positive_users","negative_users","positive_hashes","negative_hashes","updated_at","last_activity_serial","state","positive_score","negative_score","evidence_hashes","evidence_count","learning_tier"]);}
function moaExpressionSheet_(){return moaEnsureSheet_(MOA_EXPRESSION_SHEET,["expression_key","positive_users","negative_users","positive_hashes","negative_hashes","updated_at","last_activity_serial","state","positive_score","negative_score","evidence_hashes","evidence_count","learning_tier"]);}
function moaEnsureHeaders_(sh,headers){
  if(sh.getMaxColumns()<headers.length)sh.insertColumnsAfter(sh.getMaxColumns(),headers.length-sh.getMaxColumns());
  var lastRow=Math.max(1,Number(sh.getLastRow?sh.getLastRow():1)),lastCol=Math.max(headers.length,Number(sh.getLastColumn?sh.getLastColumn():headers.length)),current=sh.getRange(1,1,1,lastCol).getValues()[0];
  var exact=true;for(var i=0;i<headers.length;i++)if(String(current[i]||"")!==headers[i]){exact=false;break;}if(exact)return sh;
  var nonempty=[],pos={},duplicate=false;for(var c=0;c<current.length;c++){var h=String(current[c]||"").trim();if(!h)continue;nonempty.push(h);if(pos[h]!=null)duplicate=true;else pos[h]=c;}
  if(lastRow<=1||!nonempty.length){sh.getRange(1,1,1,headers.length).setValues([headers.slice()]);return sh;}
  var expected={};headers.forEach(function(h){expected[h]=1;});var recognized=headers.filter(function(h){return pos[h]!=null;}).length,unexpected=nonempty.filter(function(h){return !expected[h];});
  // 기존 스키마의 뒤쪽 새 열이 비어 있거나, 모든 필수 헤더가 단순히 순서만 바뀐 경우만 자동 복구합니다.
  // 일부 헤더가 사라진 채 낯선 이름으로 바뀐 시트는 데이터를 잘못된 의미로 재라벨링하지 않고 명시적으로 중단합니다.
  if(duplicate||(unexpected.length&&recognized<headers.length))throw new Error("MOA_SCHEMA_MISMATCH:"+String(sh.getName?sh.getName():"sheet"));
  var extras=unexpected,ordered=headers.concat(extras),need=ordered.length;if(sh.getMaxColumns()<need)sh.insertColumnsAfter(sh.getMaxColumns(),need-sh.getMaxColumns());
  var rows=lastRow>1?sh.getRange(2,1,lastRow-1,lastCol).getValues():[],mapped=rows.map(function(r){return headers.map(function(h){return pos[h]!=null?r[pos[h]]:"";}).concat(extras.map(function(h){return r[pos[h]];}));});
  sh.getRange(1,1,lastRow,Math.max(lastCol,need)).clearContent();sh.getRange(1,1,1,need).setValues([ordered]);if(mapped.length)sh.getRange(2,1,mapped.length,need).setValues(mapped);return sh;
}
function moaEnsurePolicyWidth_(){return moaEnsureHeaders_(moaPolicySheet_(),["policy_key","strategy","positive_users","negative_users","positive_hashes","negative_hashes","updated_at","last_activity_serial","state","positive_score","negative_score","evidence_hashes","evidence_count","learning_tier"]);}
function moaEnsureExpressionWidth_(){return moaEnsureHeaders_(moaExpressionSheet_(),["expression_key","positive_users","negative_users","positive_hashes","negative_hashes","updated_at","last_activity_serial","state","positive_score","negative_score","evidence_hashes","evidence_count","learning_tier"]);}

function moaPublicPolicy_(){
  var sh=moaEnsurePolicyWidth_(),last=sh.getLastRow(),out={};if(last<=1)return out;
  sh.getRange(2,1,last-1,14).getValues().forEach(function(r){
    var key=String(r[0]||""),strategy=String(r[1]||""),pos=Number(r[2]||0),neg=Number(r[3]||0),state=String(r[8]||"active"),posScore=Number(r[9]||pos||0),negScore=Number(r[10]||neg||0),evidenceCount=Number(r[12]||0);
    if(!key||!strategy||state==="dormant")return;
    var tier=moaPolicyLearningTier_(pos,neg,posScore,negScore,evidenceCount);if(tier==="observing")return;
    if(!out[key])out[key]={};out[key][strategy]={positive:pos,negative:neg,positiveScore:posScore,negativeScore:negScore,evidenceCount:evidenceCount,tier:tier};
  });return out;
}
function moaPublicExpressionWeights_(){
  var sh=moaEnsureExpressionWidth_(),last=sh.getLastRow(),out={};if(last<=1)return out;
  sh.getRange(2,1,last-1,13).getValues().forEach(function(r){
    var key=String(r[0]||""),pos=Number(r[1]||0),neg=Number(r[2]||0),state=String(r[7]||"active"),posScore=Number(r[8]||pos||0),negScore=Number(r[9]||neg||0),evidenceCount=Number(r[11]||0);
    if(!key||state==="dormant")return;
    var tier=moaPolicyLearningTier_(pos,neg,posScore,negScore,evidenceCount);if(tier==="observing")return;
    out[key]={positive:pos,negative:neg,positiveScore:posScore,negativeScore:negScore,evidenceCount:evidenceCount,tier:tier};
  });return out;
}
function moaExampleSheet_(){return moaEnsureSheet_(MOA_EXAMPLE_SHEET,["example_key","trigger","reply","act","affect","strategy","positive_users","negative_users","positive_hashes","negative_hashes","updated_at","last_activity_serial","state","positive_score","negative_score","evidence_hashes","evidence_count","learning_tier"]);}
function moaEnsureExampleWidth_(){return moaEnsureHeaders_(moaExampleSheet_(),["example_key","trigger","reply","act","affect","strategy","positive_users","negative_users","positive_hashes","negative_hashes","updated_at","last_activity_serial","state","positive_score","negative_score","evidence_hashes","evidence_count","learning_tier"]);}
function moaPublicDialogueText_(text,maxLen){
  var s=String(text||"").replace(/\s+/g," ").trim();if(s.length<2||s.length>Number(maxLen||120))return "";
  // Defense in depth: common learning must not retain direct identifiers, account data,
  // school/location details, health/sexual content, or other sensitive personal facts.
  if(/https?:\/\/|www\.|@[A-Za-z0-9_.-]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/i.test(s))return "";
  if(/(?:01[016789])[- .]?\d{3,4}[- .]?\d{4}|\d{2,4}[- ]\d{3,4}[- ]\d{4}/.test(s))return "";
  if(/(?:비밀번호|패스워드|주민(?:등록)?번호|계좌번호|카드번호|전화번호|휴대폰번호|집주소|주소는|사는곳|사는 곳|내이름|내 이름|이름은|학교이름|학교 이름|반번호|학번|생년월일|생일은)/i.test(s))return "";
  if(/^(?:나는|난|제가|저는)\s*.{1,24}(?:이야|야|예요|입니다)[.!?]?$/i.test(s))return "";
  if(/[가-힣A-Za-z0-9]{2,20}(?:초등학교|중학교|고등학교|학교)\b/.test(s))return "";
  if(/(?:우리집|우리 집|집은|사는 동네|사는동네|사는 지역|사는지역)\s*(?:은|는|이|가)?\s*[^,.!?]{1,30}/.test(s))return "";
  if(/(?:진단|병원|처방|복용|약먹|약 먹|자해|죽고싶|죽고 싶|성관계|성적관계|성적 관계)/i.test(s))return "";
  if(/(?:\b\d{5,}\b|[가-힣]+(?:로|길)\s*\d{1,4}(?:-\d{1,4})?)/.test(s))return "";
  // Exact numbers are rarely useful for conversational style and can become identifiers.
  s=s.replace(/\d+/g,"#");
  return s.slice(0,Number(maxLen||120));
}
function moaDialogueExampleKey_(trigger,reply,strategy){
  var raw=[moaNormalize_(trigger),moaNormalize_(reply),String(strategy||"")].join("|"),bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,raw);
  return "x"+Utilities.base64EncodeWebSafe(bytes).replace(/[^A-Za-z0-9]/g,"").slice(0,20);
}
function moaPublicExamples_(){
  var sh=moaEnsureExampleWidth_(),last=sh.getLastRow(),out=[];if(last<=1)return out;
  sh.getRange(2,1,last-1,18).getValues().forEach(function(r){
    var key=String(r[0]||""),trigger=String(r[1]||""),reply=String(r[2]||""),act=String(r[3]||""),affect=String(r[4]||"neutral"),strategy=String(r[5]||"direct"),pos=Number(r[6]||0),neg=Number(r[7]||0),state=String(r[12]||"active"),posScore=Number(r[13]||pos||0),negScore=Number(r[14]||neg||0),evidenceCount=Number(r[16]||0);
    if(!key||!trigger||!reply||state==="dormant"||moaLearnedRowHasUrl_(trigger)||moaLearnedRowHasUrl_(reply))return;
    var tier=moaPolicyLearningTier_(pos,neg,posScore,negScore,evidenceCount);if(tier==="observing")return;
    var confidence=moaClamp_((posScore+1)/(posScore+negScore+2),.05,.97);
    out.push({id:key,trigger:trigger,reply:reply,act:act,affect:affect,strategy:strategy,confidence:confidence,tier:tier,evidenceCount:evidenceCount});
  });
  out.sort(function(a,b){var tr={confirmed:3,growing:2,solo:1};return (tr[b.tier]||0)-(tr[a.tier]||0)||Number(b.evidenceCount||0)-Number(a.evidenceCount||0);});
  var triggerCounts={},strategyCounts={},diverse=[];
  for(var i=0;i<out.length&&diverse.length<220;i++){
    var item=out[i],tk=moaNormalize_(item.trigger).slice(0,80),sk=String(item.strategy||"direct");
    if(Number(triggerCounts[tk]||0)>=3||Number(strategyCounts[sk]||0)>=80)continue;
    triggerCounts[tk]=Number(triggerCounts[tk]||0)+1;strategyCounts[sk]=Number(strategyCounts[sk]||0)+1;diverse.push(item);
  }
  return diverse;
}
function moaStoreDialogueEvents_(uid,events){
  var sh=moaEnsureExampleWidth_(),last=sh.getLastRow(),rows=last>1?sh.getRange(2,1,last-1,18).getValues():[],originalCount=rows.length,index={},dirty={},publicChanged=false;
  rows.forEach(function(r,i){index[String(r[0]||"")]=i;});
  var knownNames=moaRegisteredNicknames_(),now=new Date(),activity=moaCurrentActivitySerial_();
  (events||[]).forEach(function(ev){
    if(!ev||ev.type!=="dialogue_example"||["positive","negative"].indexOf(String(ev.signal||""))<0)return;
    var trigger=moaPublicDialogueText_(moaAnonymizeChatText_(ev.trigger,knownNames),90),reply=moaPublicDialogueText_(moaAnonymizeChatText_(ev.reply,knownNames),140);if(!trigger||!reply)return;
    var act=String(ev.act||"statement").slice(0,28),affect=String(ev.affect||"neutral").slice(0,20),strategy=String(ev.strategy||"direct").slice(0,30),key=moaDialogueExampleKey_(trigger,reply,strategy),i=index[key],r;
    if(i==null){i=rows.length;index[key]=i;r=[key,trigger,reply,act,affect,strategy,0,0,"","",now,activity,"active",0,0,"",0,"observing"];rows.push(r);}else r=rows[i];while(r.length<18)r.push("");
    var signal=String(ev.signal||""),beforeTier=moaPolicyLearningTier_(r[6],r[7],Number(r[13]||r[6]||0),Number(r[14]||r[7]||0),Number(r[16]||0));
    var col=signal==="positive"?8:9,res=moaAppendUserHash_(String(r[col]||""),uid);if(res.added){r[col]=res.value;r[signal==="positive"?6:7]=Number(r[signal==="positive"?6:7]||0)+1;}
    var er=moaAppendEvidenceHash_(String(r[15]||""),uid,{evidenceKey:String(ev.evidenceKey||"")+"|"+key,type:"dialogue_example",strategy:strategy}),changed=!!(res.added||res.migrated||er.migrated);
    if(er.added){var w=moaEvidenceWeight_(ev);r[15]=er.value;r[16]=Number(r[16]||0)+1;if(signal==="positive")r[13]=Number(r[13]||0)+w;else r[14]=Number(r[14]||0)+w;changed=true;}
    var tier=moaPolicyLearningTier_(r[6],r[7],r[13],r[14],r[16]);if(String(r[17]||"")!==tier){r[17]=tier;changed=true;}
    if(!changed)return;if(beforeTier!==tier||tier!=="observing")publicChanged=true;r[10]=now;r[11]=activity;r[12]="active";dirty[i]=true;
  });
  Object.keys(dirty).map(Number).filter(function(i){return i<originalCount}).forEach(function(i){sh.getRange(i+2,1,1,18).setValues([rows[i]]);});
  var appended=rows.slice(originalCount);if(appended.length)sh.getRange(originalCount+2,1,appended.length,18).setValues(appended);
  return publicChanged;
}


/* ============================================================
   Human chat language learning (ADMIN BATCH ONLY)
   - 평상시 채팅 저장 경로에서는 호출하지 않습니다.
   - 관리자가 학습 버튼을 눌렀을 때만 '소통' / '대화방' 원본을 읽습니다.
   - user_id / nickname / 개인 식별 정보는 학습 시트에 저장하지 않습니다.
   - 사람들의 대화를 사실 지식으로 확정하지 않고, 언어/반응 패턴으로만 사용합니다.
   ============================================================ */
function moaLanguageHeaders_(){return ["pattern_key","trigger","reply","intent","affect","strategy","trigger_tokens","categories","occurrences","source_hashes","evidence_hashes","updated_at","state","learning_tier","reply_tokens","sync_version"];}
function moaLanguageSheet_(){return moaEnsureSheet_(MOA_LANGUAGE_SHEET,moaLanguageHeaders_());}
function moaEnsureLanguageWidth_(){return moaEnsureHeaders_(moaLanguageSheet_(),moaLanguageHeaders_());}
function moaLanguageRebuildSheet_(){var sh=moaEnsureSheet_(MOA_LANGUAGE_REBUILD_SHEET,moaLanguageHeaders_());try{if(!sh.isSheetHidden())sh.hideSheet();}catch(e){}return sh;}
function moaEnsureLanguageRebuildWidth_(){return moaEnsureHeaders_(moaLanguageRebuildSheet_(),moaLanguageHeaders_());}
function moaDigestShort_(text,len){var b=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(text||""));return Utilities.base64EncodeWebSafe(b).replace(/[^A-Za-z0-9]/g,"").slice(0,Number(len||18));}
function moaEscapeRe_(s){return String(s||"").replace(/[.*+?^${}()|[\]\\]/g,"\\$&");}
function moaNicknameMeta_(names){
  if(!Array.isArray(names)||!names.length)return {root:{},set:{}};
  try{if(names.__moaNicknameMeta)return names.__moaNicknameMeta;}catch(e){}
  var root={},set={};(names||[]).forEach(function(raw){var name=String(raw||"").trim();if(name.length<2||set[name])return;set[name]=1;var node=root;for(var i=0;i<name.length;i++){var ch=name.charAt(i);if(!node[ch])node[ch]={};node=node[ch];}node.$=1;});
  var meta={root:root,set:set};try{Object.defineProperty(names,"__moaNicknameMeta",{value:meta,enumerable:false,configurable:true});}catch(e2){}
  return meta;
}
function moaContainsLearnableUrl_(text){
  var s=String(text||"");if(!s)return false;
  // Human/public dialogue learning ignores the whole message when it contains an Internet link.
  // Cover normal schemes, www links, and bare domains such as coupang.com/product/... .
  return /(?:https?:\/\/|www\.)\S+/i.test(s)||/(?:^|[\s(<\[{])(?:[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?\.)+(?:com|net|org|io|ai|app|dev|gg|tv|me|info|biz|xyz|site|online|store|shop|co\.kr|or\.kr|go\.kr|ne\.kr|ac\.kr|kr)(?=[:\/?#\s)>\]}]|$)/i.test(s);
}
function moaLearnedRowHasUrl_(value){var s=String(value||"");return moaContainsLearnableUrl_(s)||/\[링크\]/.test(s);}
function moaScrubKnownNicknames_(text,names){
  var s=String(text||"");if(!s||!Array.isArray(names)||!names.length)return s;
  var root=moaNicknameMeta_(names).root,out="",i=0;
  // Trie scan is O(message length + matching prefixes), so even thousands of known
  // nicknames do not cause a full directory scan for every learned sentence.
  while(i<s.length){var node=root,best=-1,j=i;while(j<s.length&&node[s.charAt(j)]){node=node[s.charAt(j)];j++;if(node.$)best=j;}if(best>i){out+="[사람]";i=best;}else{out+=s.charAt(i);i++;}}
  return out;
}
function moaAnonymizeChatText_(text,names){
  var s=String(text||"").replace(/\s+/g," ").trim();if(s.length<1||s.length>500)return "";
  if(/^\[\[(?:IMG|FILE)\]\]/i.test(s)||moaContainsLearnableUrl_(s))return "";
  // This runs only in admin/background learning, never on the live chat send path.
  // Every known nickname remains eligible for removal; first-character buckets only
  // skip names that cannot possibly occur in the current sentence.
  s=moaScrubKnownNicknames_(s,names);
  // 직접 식별자/계정/연락처/URL
  s=s.replace(/https?:\/\/\S+|www\.\S+/ig,"[링크]");
  s=s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,"[이메일]");
  s=s.replace(/(?:01[016789])[- .]?\d{3,4}[- .]?\d{4}/g,"[전화번호]");
  s=s.replace(/\b\d{2,4}[- ]\d{3,4}[- ]\d{4}\b/g,"[번호]");
  s=s.replace(/(?:주민(?:등록)?번호|계좌번호|카드번호|비밀번호|패스워드|인증번호)\s*[:=은는]?\s*[A-Za-z0-9*# -]{4,40}/ig,"$1 [개인정보]");
  s=s.replace(/[가-힣A-Za-z0-9]{2,24}(?:초등학교|중학교|고등학교)/g,"[학교]");
  s=s.replace(/(?:우리\s*집|집주소|주소|사는\s*(?:곳|동네|지역))\s*(?:은|는|이|가|:)?\s*[^,.!?]{2,45}/g,"[거주정보]");
  s=s.replace(/[가-힣]{2,12}(?:로|길)\s*\d{1,4}(?:-\d{1,4})?(?:번지)?/g,"[주소]");
  s=s.replace(/(?:서울(?:특별시)?|부산(?:광역시)?|대구(?:광역시)?|인천(?:광역시)?|광주(?:광역시)?|대전(?:광역시)?|울산(?:광역시)?|세종(?:특별자치시)?|경기(?:도)?|강원(?:특별자치도)?|충북|충남|전북|전남|경북|경남|제주(?:특별자치도)?)(?:\s+[가-힣]{1,12}(?:시|군|구|읍|면|동)){1,4}(?:\s+\d{1,4}(?:-\d{1,4})?)?/g,"[주소]");
  s=s.replace(/(?:카톡|카카오톡|인스타(?:그램)?|텔레그램|디스코드|라인)\s*(?:아이디|id|계정|닉)?\s*[:=은는]?\s*@?[A-Za-z0-9._-]{3,40}/ig,"[계정정보]");
  s=s.replace(/@[A-Za-z0-9._-]{3,40}/g,"[계정정보]");
  s=s.replace(/(?:내\s*이름|제\s*이름|이름은|이름이)\s*[:=은는이가]?\s*[가-힣A-Za-z]{2,20}/g,"이름은 [사람]");
  s=s.replace(/(?:내\s*친구|우리\s*반\s*친구|친구\s*이름|선생님\s*이름|엄마\s*이름|아빠\s*이름)\s*(?:은|는|이|가|:)?\s*[가-힣A-Za-z]{2,20}/g,"$1 [사람]");
  s=s.replace(/(?:학번|반번호)\s*[:=은는]?\s*[0-9-]{1,20}/g,"$1 [개인정보]");
  s=s.replace(/(?:\d{1,2}학년)\s*(?:\d{1,2}반)(?:\s*\d{1,2}번)?/g,"[학급정보]");
  s=s.replace(/(?:생년월일|생일은)\s*[:=은는]?\s*\d{2,4}[./-]\d{1,2}[./-]\d{1,2}/g,"$1 [개인정보]");
  // 민감한 개인 사실은 공통 언어 예시로 승격하지 않습니다.
  if(/(?:진단받|처방받|복용중|병원에서\s*진단|내\s*병|내\s*질환|성관계|성적\s*관계|자해|죽고\s*싶)/i.test(s))return "";
  s=s.replace(/\s+/g," ").trim();
  if(!s||/^\[(?:개인정보|전화번호|번호|주소|거주정보|이메일|링크|계정정보)\]$/.test(s))return "";
  return s.slice(0,180);
}
function moaMorphLemma_(token){
  var t=String(token||"").toLowerCase().replace(/[^0-9a-z가-힣ㅋㅎㅜㅠ]/gi,"");if(!t)return "";
  var direct={"좋아해":"좋아하다","좋아함":"좋아하다","좋아한다":"좋아하다","좋아하는":"좋아하다","좋음":"좋아하다","싫어해":"싫어하다","싫어함":"싫어하다","싫다":"싫어하다","먹었어":"먹다","먹었다":"먹다","먹음":"먹다","먹고":"먹다","마셨어":"마시다","마셨다":"마시다","피곤해":"피곤하다","피곤함":"피곤하다","지쳤어":"지치다","졸려":"졸리다","재밌어":"재미있다","재밌다":"재미있다","맛있어":"맛있다","맛있다":"맛있다","웃겨":"웃기다","웃김":"웃기다","끝났어":"끝나다","끝남":"끝나다","왔어":"오다","감":"가다","갔어":"가다","이겼어":"이기다","졌어":"지다","고마워":"고맙다"};
  if(direct[t])return direct[t];
  t=t.replace(/(?:에게|한테|에서|으로|이랑|랑|하고|부터|까지|보다|처럼|은|는|이|가|을|를|에|도|만|의)$/g,"");
  if(t.length>=3)t=t.replace(/(?:했어|했음|했다|하는중|하는|하고|했지)$/g,"하다").replace(/(?:였어|이었어|였음|이었음)$/g,"이다");
  return t;
}
function moaChatTokens_(text){
  var stop={"나는":1,"난":1,"내가":1,"너":1,"넌":1,"니가":1,"오늘":1,"진짜":1,"그냥":1,"근데":1,"그래서":1,"그리고":1,"이거":1,"그거":1,"저거":1,"뭐":1,"왜":1,"어떻게":1,"좀":1,"너무":1,"완전":1};
  var raw=String(text||"").replace(/\[[^\]]+\]/g," ").replace(/[^0-9A-Za-z가-힣ㅋㅎㅜㅠ ]/g," ").split(/\s+/),out=[],seen={};
  raw.forEach(function(x){var t=moaMorphLemma_(x);if(!t||t.length<2||stop[t]||seen[t])return;seen[t]=1;out.push(t);});return out.slice(0,12);
}
function moaChatCategories_(tokens,text){
  var s=" "+(tokens||[]).join(" ")+" "+String(text||"").toLowerCase(),out=[];
  var defs={fruit:/사과|복숭아|딸기|포도|수박|참외|바나나|귤|오렌지|과일/,food:/치킨|피자|떡볶이|라면|김밥|햄버거|밥|급식|과자|빵|간식|메뉴|음식|배고프|먹다|먹을|먹고|마시다|맛있다/,school:/학교|학원|수업|숙제|시험|공부|선생|급식/,game:/게임|플레이|랭크|승리|패배|이기다|지다|캐릭터/,friend:/친구|친구들|반친구|짝꿍/,travel:/버스|지하철|택시|기차|정류장|역|집가|귀가|오다|가다/,emotion:/피곤하다|지치다|졸리다|기쁘|속상|짜증|화나|신나|재미있다|웃기다/,preference:/좋아하다|싫어하다|취향|선호/};
  Object.keys(defs).forEach(function(k){if(defs[k].test(s))out.push(k);});return out.slice(0,6);
}
function moaChatIntent_(text,tokens){
  var s=String(text||""),c=moaCompact_(s),joined=(tokens||[]).join(" ");
  if(/좋아하다|싫어하다|취향|선호/.test(joined)&&(/[?？]$/.test(s)||/(좋아해|싫어해|뭐좋아|어때)/.test(c)))return "ask:preference";
  if(/[?？]$/.test(s)||/^(왜|어떻게|어디|언제|누구|뭐|무슨|몇|얼마)/.test(c))return "ask:question";
  if(/좋아하다|싫어하다|취향|선호/.test(joined))return "inform:preference";
  if(/피곤하다|지치다|졸리다|속상|짜증|화나|신나/.test(joined))return "inform:emotion";
  if(/ㅋㅋ|ㅎㅎ|하하/.test(s)&&s.length<30)return "social:laughter";
  if(/^(응|ㅇㅇ|맞아|그치|그래|오케이)/.test(c))return "social:ack";
  return "inform:statement";
}
function moaChatAffect_(text,tokens){var s=String(text||"")+" "+(tokens||[]).join(" ");if(/좋아하다|맛있다|재미있다|신나|기쁘|이기다|성공|ㅋㅋ|ㅎㅎ/.test(s))return "positive";if(/싫어하다|피곤하다|지치다|속상|짜증|화나|실패|지다|힘들/.test(s))return "negative";return "neutral";}
function moaChatStrategy_(reply){var s=String(reply||"");if(/힘들|피곤|속상|괜찮|아쉽|위로|그랬겠다|했겠/.test(s))return "empathy";if(/ㅋㅋ|ㅎㅎ|웃기|농담/.test(s))return "ack";if(/[?？]$/.test(s))return "engage";return "direct";}
function moaLanguageTier_(occ,sourceCount){occ=Number(occ||0);sourceCount=Number(sourceCount||0);if(occ>=5&&sourceCount>=2)return "confirmed";if(occ>=2)return "growing";return "solo";}
function moaLanguagePatternKey_(trigger,reply,intent){return "h"+moaDigestShort_([moaNormalize_(trigger),moaNormalize_(reply),intent].join("|"),20);}
function moaAppendHashBounded_(cell,h,max){var a=moaHashList_(cell),added=false;if(h&&a.indexOf(h)<0){a.push(h);added=true;}if(a.length>Number(max||80))a=a.slice(a.length-Number(max||80));return {value:a.join(","),added:added};}
function moaMergeHashCells_(a,b,max){var out=[],seen={};moaHashList_(a).concat(moaHashList_(b)).forEach(function(v){if(!v||seen[v])return;seen[v]=1;out.push(v);});if(out.length>Number(max||100))out=out.slice(out.length-Number(max||100));return out.join(",");}
function moaLanguageSemanticKeyFromRow_(r){return [String(r[3]||""),String(r[6]||""),String(r[14]||""),String(r[5]||"direct")].join("\u001f");}
function moaLanguageSemanticKey_(tt,rt,intent,strategy){return [String(intent||""),(tt||[]).join("|"),(rt||[]).join("|"),String(strategy||"direct")].join("\u001f");}
function moaDedupeLanguagePatterns_(syncVersion,targetSheet){
  var sh=targetSheet||moaEnsureLanguageWidth_(),last=sh.getLastRow();if(last<=2)return {removed:0,changed:false};
  var rows=sh.getRange(2,1,last-1,16).getValues(),keep=[],index={},removed=0,changed=false,now=new Date();
  rows.forEach(function(r){while(r.length<16)r.push("");if(!r[0])return;var sig=moaLanguageSemanticKeyFromRow_(r),at=index[sig];if(at==null){index[sig]=keep.length;keep.push(r);return;}
    var dst=keep[at],dstOcc=Number(dst[8]||0),srcOcc=Number(r[8]||0),dstEv=moaHashList_(dst[10]),srcEv=moaHashList_(r[10]),evSeen={},evOverlap=0;
    dstEv.forEach(function(v){evSeen[v]=1;});srcEv.forEach(function(v){if(evSeen[v])evOverlap++;});
    dst[9]=moaMergeHashCells_(dst[9],r[9],40);dst[10]=moaMergeHashCells_(dst[10],r[10],100);
    dst[8]=Math.max(dstOcc,srcOcc,dstOcc+srcOcc-evOverlap,moaHashList_(dst[10]).length);dst[11]=now;dst[12]="active";dst[13]=moaLanguageTier_(dst[8],moaHashList_(dst[9]).length);dst[15]=Number(syncVersion||moaCurrentSyncVersion_()+1);
    var rank={confirmed:3,growing:2,solo:1};if((rank[String(r[13]||"")]||0)>(rank[String(dst[13]||"")]||0)||srcOcc>dstOcc){dst[1]=r[1]||dst[1];dst[2]=r[2]||dst[2];}
    removed++;changed=true;
  });
  if(changed){sh.getRange(2,1,Math.max(1,last-1),16).clearContent();if(keep.length)sh.getRange(2,1,keep.length,16).setValues(keep);}
  return {removed:removed,changed:changed};
}
function moaStoreHumanChatPairs_(pairs,syncVersion,targetSheet){
  if(!pairs||!pairs.length)return {patterns:0,newPatterns:0,duplicates:0,changed:false,changedPublic:[]};
  var sh=targetSheet||moaEnsureLanguageWidth_(),last=sh.getLastRow(),rows=last>1?sh.getRange(2,1,last-1,16).getValues():[],originalCount=rows.length,index={},semanticIndex={},dirty={},newPatterns=0,duplicates=0,changed=false,now=new Date(),sv=Number(syncVersion||moaCurrentSyncVersion_()+1);
  rows.forEach(function(r,i){while(r.length<16)r.push("");index[String(r[0]||"")]=i;semanticIndex[moaLanguageSemanticKeyFromRow_(r)]=i;});
  pairs.forEach(function(pair){
    var trigger=String(pair.trigger||"").trim(),reply=String(pair.reply||"").trim();if(!trigger||!reply)return;
    var tt=moaChatTokens_(trigger),rt=moaChatTokens_(reply),intent=moaChatIntent_(trigger,tt),affect=moaChatAffect_(trigger,tt),strategy=moaChatStrategy_(reply),cats=moaChatCategories_(tt,trigger),key=moaLanguagePatternKey_(trigger,reply,intent),semanticKey=moaLanguageSemanticKey_(tt,rt,intent,strategy),i=index[key],r;
    if(i==null&&semanticIndex[semanticKey]!=null)i=semanticIndex[semanticKey];
    if(i==null){i=rows.length;index[key]=i;semanticIndex[semanticKey]=i;r=[key,trigger,reply,intent,affect,strategy,tt.join("|"),cats.join("|"),0,"","",now,"active","solo",rt.join("|"),sv];rows.push(r);newPatterns++;}else r=rows[i];while(r.length<16)r.push("");
    var ev=moaAppendHashBounded_(r[10],String(pair.evidenceHash||""),100);if(!ev.added){duplicates++;return;}r[10]=ev.value;r[8]=Number(r[8]||0)+1;
    var src=moaAppendHashBounded_(r[9],String(pair.sourceHash||""),40);r[9]=src.value;var sourceCount=moaHashList_(r[9]).length;r[13]=moaLanguageTier_(r[8],sourceCount);r[11]=now;r[12]="active";r[15]=sv;dirty[i]=1;changed=true;
  });
  Object.keys(dirty).map(Number).filter(function(i){return i<originalCount;}).forEach(function(i){sh.getRange(i+2,1,1,16).setValues([rows[i]]);});
  var appended=rows.slice(originalCount);if(appended.length)sh.getRange(originalCount+2,1,appended.length,16).setValues(appended);
  var changedPublic=[];Object.keys(dirty).map(Number).forEach(function(i){var p=moaLanguagePublicRow_(rows[i]);if(p)changedPublic.push(p);});
  return {patterns:pairs.length,newPatterns:newPatterns,duplicates:duplicates,changed:changed,changedPublic:changedPublic};
}

function moaNaturalizeLearnedText_(text){
  return String(text||"")
    .replace(/\[사람\](?:이|가)/g,"누군가가").replace(/\[사람\](?:은|는)/g,"누군가는")
    .replace(/\[사람\](?:을|를)/g,"누군가를").replace(/\[사람\](?:에게|한테)/g,"누군가에게")
    .replace(/\[사람\](?:아|야)/g,"친구야").replace(/\[사람\]/g,"누군가")
    .replace(/\[학교\]/g,"학교").replace(/\[학급정보\]/g,"반 정보")
    .replace(/\[(?:링크|이메일|전화번호|번호|주소|거주정보|계정정보|개인정보)\]/g,"")
    .replace(/\s+/g," ").trim();
}
function moaLanguagePublicRow_(r){
  var occ=Number(r[8]||0),sources=moaHashList_(r[9]).length,tier=String(r[13]||moaLanguageTier_(occ,sources));
  if(String(r[12]||"active")==="dormant"||!r[0]||!r[1]||!r[2]||moaLearnedRowHasUrl_(r[1])||moaLearnedRowHasUrl_(r[2]))return null;
  var trigger=moaNaturalizeLearnedText_(r[1]),reply=moaNaturalizeLearnedText_(r[2]);if(!trigger||!reply)return null;
  // Keep scrubbed human dialogue usable from the first observation.
  // Tier changes weight only; it is not a hard publication gate.
  var confidence=tier==="confirmed"?.86:tier==="growing"?.72:.60;
  return {id:String(r[0]),trigger:trigger,reply:reply,act:String(r[3]||"inform:statement"),affect:String(r[4]||"neutral"),strategy:String(r[5]||"direct"),confidence:confidence,tier:tier,evidenceCount:occ,semantic:{tokens:String(r[6]||"").split("|").filter(Boolean),categories:String(r[7]||"").split("|").filter(Boolean),intent:String(r[3]||"")},humanChat:true};
}
function moaPublicHumanPatterns_(){
  var sh=moaEnsureLanguageWidth_(),last=sh.getLastRow(),out=[];if(last<=1)return out;
  sh.getRange(2,1,last-1,16).getValues().forEach(function(r){var p=moaLanguagePublicRow_(r);if(p)out.push(p);});
  out.sort(function(a,b){var tr={confirmed:3,growing:2,solo:1};return (tr[b.tier]||0)-(tr[a.tier]||0)||b.evidenceCount-a.evidenceCount;});
  return out.slice(0,900);
}
function moaLanguageDeltaSheet_(){
  var sh=moaEnsureSheet_(MOA_LANGUAGE_DELTA_SHEET,["sync_version","pattern_id","payload_json","updated_at"]);try{if(!sh.isSheetHidden())sh.hideSheet();}catch(e){}return sh;
}
function moaLanguageDeltaFloor_(){return Number(PropertiesService.getScriptProperties().getProperty(MOA_LANGUAGE_DELTA_FLOOR_PROPERTY)||0);}
function moaSetLanguageDeltaFloor_(v){var p=PropertiesService.getScriptProperties(),n=Math.max(moaLanguageDeltaFloor_(),Number(v||0));p.setProperty(MOA_LANGUAGE_DELTA_FLOOR_PROPERTY,String(n));return n;}
function moaRecordLanguageDelta_(version,changedPatterns){
  version=Number(version||0);if(version<=0)return 0;
  var payloads=[],seen={};
  if(Array.isArray(changedPatterns)){changedPatterns.forEach(function(p){if(!p||!p.id||seen[p.id])return;seen[p.id]=1;payloads.push([version,p.id,JSON.stringify(p),new Date()]);});}
  else {var lang=moaEnsureLanguageWidth_(),last=lang.getLastRow();if(last>1)lang.getRange(2,1,last-1,16).getValues().forEach(function(r){if(Number(r[15]||0)!==version)return;var p=moaLanguagePublicRow_(r);if(!p||seen[p.id])return;seen[p.id]=1;payloads.push([version,p.id,JSON.stringify(p),new Date()]);});}
  var delta=moaLanguageDeltaSheet_();if(delta.getLastRow()<=1&&moaLanguageDeltaFloor_()===0)moaSetLanguageDeltaFloor_(Math.max(0,version-1));
  if(payloads.length)delta.getRange(delta.getLastRow()+1,1,payloads.length,4).setValues(payloads);
  var dataRows=Math.max(0,delta.getLastRow()-1),maxRows=Math.max(500,Number(MOA_LANGUAGE_DELTA_MAX_ROWS||5000));
  if(dataRows>maxRows){var remove=dataRows-maxRows,removed=delta.getRange(2,1,remove,1).getValues(),floor=moaLanguageDeltaFloor_();removed.forEach(function(r){floor=Math.max(floor,Number(r[0]||0));});delta.deleteRows(2,remove);moaSetLanguageDeltaFloor_(floor);}
  return payloads.length;
}
function moaPublicHumanPatternDelta_(knownVersion){
  var known=Number(knownVersion||0),floor=moaLanguageDeltaFloor_();if(known<floor)return {complete:false,patterns:[]};
  var sh=moaLanguageDeltaSheet_(),last=sh.getLastRow(),latest={};if(last<=1)return {complete:true,patterns:[]};
  var count=Math.min(Math.max(0,last-1),Math.max(500,Number(MOA_LANGUAGE_DELTA_MAX_ROWS||5000))),start=last-count+1;
  sh.getRange(start,1,count,3).getValues().forEach(function(r){if(Number(r[0]||0)<=known)return;var p=null;try{p=JSON.parse(String(r[2]||""));}catch(e){}if(!p||!p.id)return;latest[p.id]=p;});
  var out=Object.keys(latest).map(function(id){return latest[id];});
  // Do not advance the client to the newest version after silently truncating a huge delta.
  // A large backlog is safer and usually smaller as one fresh ranked public snapshot.
  if(out.length>1200)return {complete:false,patterns:[]};
  out.sort(function(a,b){var tr={confirmed:3,growing:2,solo:1};return (tr[b.tier]||0)-(tr[a.tier]||0)||Number(b.evidenceCount||0)-Number(a.evidenceCount||0);});
  return {complete:true,patterns:out};
}
function moaChatStateShard_(key){var h=0,s=String(key||"");for(var i=0;i<s.length;i++)h=((h<<5)-h+s.charCodeAt(i))|0;return Math.abs(h)%Math.max(1,Number(MOA_CHAT_LEARN_STATE_SHARDS||8));}
function moaChatLearnState_(){
  var props=PropertiesService.getScriptProperties(),out={},found=false,count=Math.max(1,Number(MOA_CHAT_LEARN_STATE_SHARDS||32)),all=null;
  try{if(props.getProperties)all=props.getProperties()||null;}catch(e0){all=null;}
  for(var i=0;i<count;i++){var key=MOA_CHAT_LEARN_STATE_SHARD_PREFIX+i,raw=String(all&&Object.prototype.hasOwnProperty.call(all,key)?all[key]:props.getProperty(key)||"");if(!raw)continue;found=true;try{var part=JSON.parse(raw)||{};Object.keys(part).forEach(function(k){out[k]=part[k];});}catch(e){}}
  if(!found){try{var legacyRaw=all&&Object.prototype.hasOwnProperty.call(all,MOA_CHAT_LEARN_STATE_PROPERTY)?all[MOA_CHAT_LEARN_STATE_PROPERTY]:props.getProperty(MOA_CHAT_LEARN_STATE_PROPERTY);var legacy=JSON.parse(legacyRaw||"{}")||{};Object.keys(legacy).forEach(function(k){out[k]=legacy[k];});}catch(e2){}}
  return out;
}
function moaSaveChatLearnState_(state){
  var props=PropertiesService.getScriptProperties(),shards=[],count=Math.max(1,Number(MOA_CHAT_LEARN_STATE_SHARDS||8)),payload={};for(var i=0;i<count;i++)shards.push({});
  Object.keys(state||{}).forEach(function(k){var idx=String(k).indexOf("__")===0?0:moaChatStateShard_(k);shards[idx][k]=state[k];});
  // ScriptProperties writes are remote service calls. Persist every shard in one
  // setProperties() operation instead of up to 32 set/delete calls per learning batch.
  // Empty shard values are harmless and keep the key set bounded/stable.
  for(var j=0;j<count;j++)payload[MOA_CHAT_LEARN_STATE_SHARD_PREFIX+j]=Object.keys(shards[j]).length?JSON.stringify(shards[j]):"";
  payload[MOA_CHAT_LEARN_STATE_PROPERTY]="";
  if(props.setProperties)props.setProperties(payload,false);else Object.keys(payload).forEach(function(k){props.setProperty(k,payload[k]);});
}
function moaChatSourceHash_(sheetId,room){return moaDigestShort_(String(sheetId)+"|"+String(room||"global"),16);}
function moaPairEvidenceHash_(sheetId,room,rowA,rowB,a,b,tsA,tsB){return moaDigestShort_([sheetId,room,rowA,rowB,Number(tsA||0),Number(tsB||0),moaNormalize_(a),moaNormalize_(b)].join("|"),20);}
function moaPairSourceHash_(sheetId,room,a,b){
  var at=moaChatTokens_(a&&a.text),bt=moaChatTokens_(b&&b.text),intent=moaChatIntent_(a&&a.text,at),strategy=moaChatStrategy_(b&&b.text),semantic=moaLanguageSemanticKey_(at,bt,intent,strategy);
  var left=moaAnonActorHash_(String((a&&a.user)||(a&&a.nick)||"anon-a")),right=moaAnonActorHash_(String((b&&b.user)||(b&&b.nick)||"anon-b"));
  return moaDigestShort_([sheetId,room,semantic,left,right].join("|"),16);
}
function moaLearningTextEligible_(value){
  var t=String(value||"").trim();if(!t)return false;
  // Attachments are transport/UI events, not human conversational language.
  if(/^\[\[(?:IMG|FILE)\]\]/i.test(t)||/^\[(?:사진|파일)\](?:\s|$)/.test(t))return false;
  // Current game packets are excluded from Sheet backup on the client, but older
  // backups may still contain their display labels. Keep those out of relearning too.
  if(/^\[(?:사다리타기(?:\s+초대)?|체스(?:\s+게임)?(?:\s+(?:초대|시작|종료))?|마피아(?:\s+게임)?(?:\s+(?:초대|시작|종료|인원\s+변경))?|게임\s+(?:초대(?:\s+종료)?|참가(?:\s+(?:확정|취소))?|정원(?:\s+마감)?|나가기(?:\s+요청)?|종료)|밤\s+결과|투표(?:\s+무효)?|마피아\s+준비)\](?:\s|$)/.test(t))return false;
  return true;
}
function moaReadGlobalLearnBatch_(sh,start,limit,names){
  var last=sh.getLastRow(),out={messages:[],next:start,done:true,privateSkipped:0,scanned:0};if(last<2)return out;start=Math.max(2,Number(start||2));if(start>last){out.next=last+1;return out;}
  var begin=Math.max(2,start-1),count=Math.min(last-begin+1,Number(limit||260)+1),vals=sh.getRange(begin,1,count,4).getValues(),baseNames=Array.isArray(names)?names:[],baseSet=moaNicknameMeta_(baseNames).set,extraNames=[],extraSeen={};
  vals.forEach(function(r){var n=String(r[1]||"").trim();if(n.length>=2&&!baseSet[n]&&!extraSeen[n]){extraSeen[n]=1;extraNames.push(n);}});var localNames=extraNames.length?baseNames.concat(extraNames):baseNames;out.scanned=count;
  vals.forEach(function(r,idx){var row=begin+idx,rawText=String(r[3]||"");if(!moaLearningTextEligible_(rawText))return;var clean=moaAnonymizeChatText_(rawText,localNames);if(!clean){if(rawText.trim())out.privateSkipped++;return;}out.messages.push({row:row,user:String(r[0]||""),nick:String(r[1]||""),text:clean,ts:r[2] instanceof Date?r[2].getTime():Number(r[2]||0)});});
  out.next=Math.min(last+1,begin+count);out.done=out.next>last;return out;
}
function moaRoomLastRow_(sh,col){
  try{if(sh&&sh.getMaxRows&&typeof SpreadsheetApp!=="undefined"&&SpreadsheetApp.Direction&&SpreadsheetApp.Direction.UP){var cell=sh.getRange(sh.getMaxRows(),col).getNextDataCell(SpreadsheetApp.Direction.UP),row=Number(cell.getRow()||6);try{if(row>6&&cell.getValue&&!String(cell.getValue()||"").trim())row--;}catch(e0){}return Math.max(6,row);}}catch(e){}
  var last=Math.max(6,Number(sh&&sh.getLastRow?sh.getLastRow():6));if(last<=6)return 6;
  // 테스트/구형 런타임 fallback: 뒤에서 작은 덩어리로만 확인해 다른 긴 방의 빈 행을 전부 스캔하지 않습니다.
  for(var end=last;end>=7;end-=400){var begin=Math.max(7,end-399),count=end-begin+1,vals=sh.getRange(begin,col,count,1).getValues();for(var i=vals.length-1;i>=0;i--)if(String(vals[i][0]||"").trim())return begin+i;}
  return 6;
}
function moaSourceLastRow_(src){return src&&src.type==="room"?moaRoomLastRow_(src.sheet,src.col):Math.max(1,Number(src&&src.sheet&&src.sheet.getLastRow?src.sheet.getLastRow():1));}
function moaReadRoomLearnBatch_(sh,col,start,limit,names,lastRow){
  var last=Math.max(6,Number(lastRow||moaRoomLastRow_(sh,col))),out={messages:[],next:start,done:true,privateSkipped:0,scanned:0};start=Math.max(7,Number(start||7));if(start>last){out.next=last+1;return out;}
  var begin=Math.max(7,start-1),count=Math.min(last-begin+1,Number(limit||260)+1),vals=sh.getRange(begin,col,count,1).getValues(),parsed=[],baseNames=Array.isArray(names)?names:[],baseSet=moaNicknameMeta_(baseNames).set,extraNames=[],extraSeen={};out.scanned=count;
  vals.forEach(function(r,idx){var raw=String(r[0]||"").trim();if(!raw){parsed.push(null);return;}try{var o=JSON.parse(raw),n=String(o.nickname||"").trim();if(n.length>=2&&!baseSet[n]&&!extraSeen[n]){extraSeen[n]=1;extraNames.push(n);}parsed.push({row:begin+idx,o:o});}catch(e){parsed.push(null);}});var localNames=extraNames.length?baseNames.concat(extraNames):baseNames;
  parsed.forEach(function(item){if(!item)return;var o=item.o,rawText=String(o.text||o.message||"");if(!moaLearningTextEligible_(rawText))return;var clean=moaAnonymizeChatText_(rawText,localNames);if(!clean){out.privateSkipped++;return;}out.messages.push({row:item.row,user:String(o.user_id||""),nick:String(o.nickname||""),text:clean,ts:Number(o.ts||0)});});
  out.next=Math.min(last+1,begin+count);out.done=out.next>last;return out;
}
function moaSameChatSpeaker_(a,b){if(a.user&&b.user)return a.user===b.user;if(a.nick&&b.nick)return a.nick===b.nick;return false;}
function moaPairsFromMessages_(messages,sheetId,room){
  var turns=[];(messages||[]).forEach(function(m){if(!m||!m.text)return;var prev=turns.length?turns[turns.length-1]:null,row=Number(m.row||0),ts=Number(m.ts||0),canJoin=prev&&row===Number(prev.endRow)+1&&moaSameChatSpeaker_(prev,m)&&prev.parts<3&&(!prev.ts||!ts||Math.abs(ts-prev.ts)<=120000);
    if(canJoin){prev.text=(prev.text+" "+m.text).replace(/\s+/g," ").trim().slice(0,300);prev.endRow=row;prev.ts=ts||prev.ts;prev.parts++;return;}
    turns.push({row:row,endRow:row,user:String(m.user||""),nick:String(m.nick||""),text:String(m.text||""),ts:ts,parts:1});
  });
  var out=[];for(var i=1;i<turns.length;i++){var a=turns[i-1],b=turns[i];if(!a.text||!b.text)continue;if(Number(b.row)!==Number(a.endRow)+1)continue;if(moaSameChatSpeaker_(a,b))continue;if(a.ts&&b.ts&&(b.ts<a.ts||b.ts-a.ts>10*60*1000))continue;out.push({trigger:a.text,reply:b.text,sourceHash:moaPairSourceHash_(sheetId,room,a,b),evidenceHash:moaPairEvidenceHash_(sheetId,room,a.row,b.endRow,a.text,b.text,a.ts,b.ts)});}return out;
}
function moaLearningSources_(){
  var ss=SpreadsheetApp.getActiveSpreadsheet(),sources=[],global=ss.getSheetByName("소통"),rooms=ss.getSheetByName("대화방");
  if(global)sources.push({type:"global",sheet:global,key:"g:"+global.getSheetId(),room:"global",col:4});
  if(rooms){var lastCol=rooms.getLastColumn();if(lastCol>=2){var meta=rooms.getRange(1,2,3,lastCol-1).getValues(),ids=meta[0]||[],titles=meta[1]||[],members=meta[2]||[];for(var i=0;i<ids.length;i++){var id=String(ids[i]||"").trim();if(!id)continue;sources.push({type:"room",sheet:rooms,key:"r:"+rooms.getSheetId()+":"+moaDigestShort_(id,10),room:id,title:String(titles[i]||""),memberRaw:String(members[i]||""),col:i+2});}}}
  return sources;
}
function moaRegisteredNicknames_(){
  var cache=null,key="moa.registered.nicknames.v2";try{cache=CacheService.getScriptCache();var hit=moaCacheGetLargeJson_(cache,key);if(Array.isArray(hit))return hit;}catch(e){}
  var out=[],seen={};try{var ss=SpreadsheetApp.getActiveSpreadsheet(),sh=ss.getSheetByName("로그인"),last=sh?sh.getLastRow():0;if(last>1){sh.getRange(2,4,last-1,1).getValues().forEach(function(r){var n=String(r[0]||"").trim();if(n.length>=2&&!seen[n]){seen[n]=1;out.push(n);}});}}catch(e2){}
  // Do not truncate the privacy directory. Learning runs in admin/background paths only,
  // and the cache helper shards large payloads so large user directories stay cacheable.
  try{if(cache)moaCachePutLargeJson_(cache,key,out,600);}catch(e3){}return out;
}
function moaKnownChatNames_(sources){var names={};
  // Prioritize names directly connected to the currently scanned chat sources, then
  // fill from the registered-user directory. This keeps active-room privacy intact
  // even if a very large installation eventually hits the defensive directory cap.
  (sources||[]).forEach(function(src){if(src.type==="global"&&src.sheet.getLastRow()>1){var last=src.sheet.getLastRow(),vals=src.sheet.getRange(Math.max(2,last-499),2,Math.min(500,last-1),1).getValues();vals.forEach(function(r){var n=String(r[0]||"").trim();if(n.length>=2)names[n]=1;});}if(src.type==="room"){String(src.memberRaw||"").replace(/^public\|/,"").split(",").forEach(function(n){n=String(n||"").trim();if(n.length>=2)names[n]=1;});}});
  moaRegisteredNicknames_().forEach(function(n){if(String(n||"").trim().length>=2)names[String(n).trim()]=1;});
  return Object.keys(names).sort(function(a,b){return b.length-a.length;}); }
function moaPruneChatLearnState_(state,sources){var active={};(sources||[]).forEach(function(src){active[String(src.key||"")]=1;});var removed=0;Object.keys(state||{}).forEach(function(k){if(!/^[gr]:/.test(k)||active[k])return;delete state[k];removed++;});return removed;}
function moaCommitRebuiltLanguage_(stage,targetVersion){
  var sv=Number(targetVersion||moaCurrentSyncVersion_()+1);moaSetLanguagePublishing_(true,90000);
  try{
    var dedupe=moaDedupeLanguagePatterns_(sv,stage),last=stage.getLastRow(),rows=last>1?stage.getRange(2,1,last-1,16).getValues():[];
    rows.forEach(function(r){while(r.length<16)r.push("");r[15]=sv;});
    var main=moaEnsureLanguageWidth_(),old=Math.max(0,main.getLastRow()-1);
    if(rows.length)main.getRange(2,1,rows.length,16).setValues(rows);
    if(old>rows.length)main.getRange(rows.length+2,1,old-rows.length,16).clearContent();
    var delta=moaLanguageDeltaSheet_(),dlast=delta.getLastRow();if(dlast>1)delta.deleteRows(2,dlast-1);
    moaSetLanguageDeltaFloor_(sv);var bumped=moaBumpSyncVersion_();
    var slast=stage.getLastRow();if(slast>1)stage.getRange(2,1,slast-1,16).clearContent();
    return {patterns:rows.length,deduped:dedupe.removed||0,version:bumped};
  }finally{moaSetLanguagePublishing_(false);}
}
function moaDeleteLearnedRowsMatching_(sh,width,predicate){
  if(!sh)return 0;var last=sh.getLastRow();if(last<=1)return 0;var rows=sh.getRange(2,1,last-1,width).getValues(),bad=[];
  rows.forEach(function(r,i){if(predicate(r))bad.push(i+2);});if(!bad.length)return 0;
  // Delete contiguous blocks from bottom so row indexes remain stable and large cleanups stay cheap.
  var end=bad[bad.length-1],start=end;for(var i=bad.length-2;i>=-1;i--){var row=i>=0?bad[i]:-1;if(row===start-1){start=row;continue;}sh.deleteRows(start,end-start+1);if(i>=0){end=row;start=row;}}return bad.length;
}
function moaPurgeUrlLearnedData_(){
  var removedLanguage=0,removedRebuild=0,removedExamples=0;
  var language=moaEnsureLanguageWidth_();removedLanguage=moaDeleteLearnedRowsMatching_(language,16,function(r){return moaLearnedRowHasUrl_(r[1])||moaLearnedRowHasUrl_(r[2]);});
  var rebuild=moaEnsureLanguageRebuildWidth_();removedRebuild=moaDeleteLearnedRowsMatching_(rebuild,16,function(r){return moaLearnedRowHasUrl_(r[1])||moaLearnedRowHasUrl_(r[2]);});
  var examples=moaEnsureExampleWidth_();removedExamples=moaDeleteLearnedRowsMatching_(examples,18,function(r){return moaLearnedRowHasUrl_(r[1])||moaLearnedRowHasUrl_(r[2]);});
  var total=removedLanguage+removedRebuild+removedExamples;if(total){
    var next=moaCurrentSyncVersion_()+1;moaSetLanguageDeltaFloor_(next);var delta=moaLanguageDeltaSheet_(),dlast=delta.getLastRow();if(dlast>1)delta.deleteRows(2,dlast-1);var bumped=moaBumpSyncVersion_();if(removedExamples)moaMarkCoreSyncVersion_(bumped);
  }
  return {removed:total,language:removedLanguage,rebuild:removedRebuild,examples:removedExamples};
}
function moaAdminLearningStatus_(data){
  var auth=requireAdminToken_(String(data.user_id||""),String(data.admin_token||""));if(!auth.ok)return jsonResponse_(auth);
  var sources=moaLearningSources_(),state=moaChatLearnState_(),pruned=moaPruneChatLearnState_(state,sources),pending=0,total=0,bounded=sources.length>80;
  if(pruned)moaSaveChatLearnState_(state);
  if(!bounded)sources.forEach(function(src){var last=moaSourceLastRow_(src),first=src.type==="global"?2:7,start=Number(state[src.key]||first);if(start>last+1)start=first;total+=Math.max(0,last-first+1);pending+=Math.max(0,last-start+1);});
  else {var globalSrc=sources.filter(function(src){return src.type==="global";})[0];if(globalSrc){var last=moaSourceLastRow_(globalSrc),first=2,start=Number(state[globalSrc.key]||first);if(start>last+1)start=first;total=Math.max(0,last-first+1);pending=Math.max(0,last-start+1);}}
  var lang=moaEnsureLanguageWidth_();return jsonResponse_({ok:true,sources:sources.length,pending:bounded?null:pending,known_global_pending:bounded?pending:null,total_messages:bounded?null:total,status_bounded:bounded,learned_patterns:Math.max(0,lang.getLastRow()-1),last_run:Number(state.__lastRun||0),rebuilding:state.__rebuild===true,pruned_state:pruned});
}
function moaAdminLearnChats_(data){
  var auth=requireAdminToken_(String(data.user_id||""),String(data.admin_token||""));if(!auth.ok)return jsonResponse_(auth);
  var lease=moaAcquireLearningLease_("admin-chat-learning",240000);if(!lease)return jsonResponse_({ok:false,error:"다른 모아 학습 작업이 진행 중입니다. 잠시 후 다시 실행해 주세요."});
  try{
  var reset=String(data.reset||"")==="1",cleanup=String(data.cleanup||"")==="1",batch=Math.max(80,Math.min(350,Number(data.batch_limit||260))),state=reset?{}:moaChatLearnState_(),sources=moaLearningSources_(),names=moaKnownChatNames_(sources),processed=0,pairs=[],privateSkipped=0,sourceDone=0,dedupe={removed:0,changed:false},urlPurge={removed:0,language:0,rebuild:0,examples:0},resetPerformed=false,prunedState=0;
  if(!reset)prunedState=moaPruneChatLearnState_(state,sources);
  if(reset){var stage0=moaEnsureLanguageRebuildWidth_(),stageLast=stage0.getLastRow();if(stageLast>1)stage0.getRange(2,1,stageLast-1,16).clearContent();state={__rebuild:true,__sourceCursor:0};resetPerformed=true;}
  var rebuilding=state.__rebuild===true;if(cleanup)urlPurge=moaPurgeUrlLearnedData_();
  var targetVersion=moaCurrentSyncVersion_()+1,targetSheet=rebuilding?moaEnsureLanguageRebuildWidth_():moaEnsureLanguageWidth_();
  if(cleanup&&!rebuilding){dedupe=moaDedupeLanguagePatterns_(targetVersion,targetSheet);if(dedupe.changed)moaSetLanguageDeltaFloor_(targetVersion);}
  var sourceCursor=sources.length?Math.max(0,Number(state.__sourceCursor||0))%sources.length:0,lastSourceIndex=sourceCursor-1,visited=0,anyIncomplete=false;
  for(var step=0;step<sources.length&&processed<batch;step++){
    var si=(sourceCursor+step)%sources.length,src=sources[si],first=src.type==="global"?2:7,lastNow=moaSourceLastRow_(src),start=Number(state[src.key]||first);lastSourceIndex=si;visited++;if(start>lastNow+1){start=first;state[src.key]=first;}var remaining=Math.max(20,batch-processed),read=src.type==="global"?moaReadGlobalLearnBatch_(src.sheet,start,remaining,names):moaReadRoomLearnBatch_(src.sheet,src.col,start,remaining,names,lastNow);
    privateSkipped+=read.privateSkipped;processed+=Math.max(0,Number(read.scanned||0)-(start>first?1:0));pairs=pairs.concat(moaPairsFromMessages_(read.messages,src.sheet.getSheetId(),src.room));state[src.key]=read.next;if(read.done)sourceDone++;else anyIncomplete=true;
  }
  if(sources.length)state.__sourceCursor=(lastSourceIndex+1)%sources.length;
  var stored=moaStoreHumanChatPairs_(pairs,targetVersion,targetSheet),hasMore=anyIncomplete||visited<sources.length;
  var rebuildCommitted=false,rebuildPatterns=0;
  if(rebuilding&&!hasMore){var committed=moaCommitRebuiltLanguage_(targetSheet,targetVersion);rebuildCommitted=true;rebuildPatterns=committed.patterns;dedupe.removed+=committed.deduped||0;delete state.__rebuild;}
  state.__lastRun=Date.now();moaSaveChatLearnState_(state);
  if(!rebuilding){var changedPublic=(stored.changedPublic||[]).slice();if(dedupe.changed){var lsh=moaEnsureLanguageWidth_(),llast=lsh.getLastRow();if(llast>1)lsh.getRange(2,1,llast-1,16).getValues().forEach(function(r){if(Number(r[15]||0)!==targetVersion)return;var p=moaLanguagePublicRow_(r);if(p)changedPublic.push(p);});}if(changedPublic.length||dedupe.changed){moaRecordLanguageDelta_(targetVersion,changedPublic);moaBumpSyncVersion_();}}
  return jsonResponse_({ok:true,processed:processed,pairs:pairs.length,new_patterns:stored.newPatterns,duplicates:stored.duplicates,deduped_patterns:dedupe.removed,url_patterns_removed:Number(urlPurge.removed||0),private_skipped:privateSkipped,has_more:hasMore,sources:sources.length,reset_performed:resetPerformed,rebuilding:rebuilding&&hasMore,rebuild_committed:rebuildCommitted,rebuild_patterns:rebuildPatterns,pruned_state:prunedState,version:moaCurrentSyncVersion_()});
  }finally{moaReleaseLearningLease_(lease);}
}

/** 소통 시트 자동정리 직전, 아직 관리자 학습을 거치지 못한 최근 대화를 먼저 공통 언어패턴으로 보존합니다.
 * 사용자 요청 경로가 아니라 시간기반 정리 트리거에서만 실행되므로 일반 채팅 응답을 기다리게 하지 않습니다.
 * 너무 큰 미학습 백로그는 삭제하지 않고 보존하여 다음 관리자 학습에서 처리합니다.
 */
function moaLearnGlobalBeforeCleanup_(sh){
  if(!sh)return {ok:true,processed:0,pairs:0};
  var lease=moaAcquireLearningLease_("global-cleanup",240000);if(!lease)return {ok:false,preserve:true,error:"MOA_GLOBAL_CLEANUP_LEARNING_BUSY"};
  try{
    var first=2,last=sh.getLastRow();if(last<first)return {ok:true,processed:0,pairs:0};
    var key="g:"+sh.getSheetId(),state=moaChatLearnState_();if(state.__rebuild===true)return {ok:false,preserve:true,error:"MOA_REBUILD_IN_PROGRESS"};var start=Number(state[key]||first);if(start>last+1)start=first;
    var pending=Math.max(0,last-start+1);if(pending<=0)return {ok:true,processed:0,pairs:0};
    // Cleanup is a maintenance path shared with the rest of Apps Script. Never spend a
    // multi-thousand-row execution here: preserve the source sheet and advance in bounded
    // chunks so chat/shop/task requests keep their own execution budget.
    var batchNow=Math.min(pending,1000),names=moaKnownChatNames_([{type:"global",sheet:sh,key:key,room:"global",col:4}]);
    var read=moaReadGlobalLearnBatch_(sh,start,batchNow+2,names),pairs=moaPairsFromMessages_(read.messages,sh.getSheetId(),"global"),targetVersion=moaCurrentSyncVersion_()+1;
    var stored=moaStoreHumanChatPairs_(pairs,targetVersion);state[key]=read.next;state.__lastRun=Date.now();moaSaveChatLearnState_(state);
    if((stored.changedPublic||[]).length){moaRecordLanguageDelta_(targetVersion,stored.changedPublic||[]);moaBumpSyncVersion_();}
    var complete=read.done===true;
    return {ok:complete,preserve:!complete,error:complete?"":"MOA_GLOBAL_CLEANUP_LEARNING_CONTINUES",processed:Math.min(pending,batchNow),pending:Math.max(0,last-Number(read.next||start)+1),pairs:pairs.length,newPatterns:stored.newPatterns||0,duplicates:stored.duplicates||0,privateSkipped:read.privateSkipped||0};
  }finally{moaReleaseLearningLease_(lease);}
}

function moaLanguagePublishing_(){try{var raw=JSON.parse(PropertiesService.getScriptProperties().getProperty(MOA_LANGUAGE_PUBLISH_PROPERTY)||"{}")||{};return Number(raw.until||0)>Date.now();}catch(e){return false;}}
function moaSetLanguagePublishing_(on,ttlMs){var p=PropertiesService.getScriptProperties();if(on){p.setProperty(MOA_LANGUAGE_PUBLISH_PROPERTY,JSON.stringify({until:Date.now()+Math.max(10000,Math.min(120000,Number(ttlMs||60000)))}));}else if(p.deleteProperty)p.deleteProperty(MOA_LANGUAGE_PUBLISH_PROPERTY);else p.setProperty(MOA_LANGUAGE_PUBLISH_PROPERTY,"");}
function moaCacheGetLargeJson_(cache,key){
  try{var manifest=JSON.parse(cache.get(key+".m")||"{}");var n=Math.max(0,Math.min(Number(MOA_PUBLIC_CACHE_MAX_PARTS||40),Number(manifest.parts||0)));if(!n)return null;var keys=[],joined="";for(var i=0;i<n;i++)keys.push(key+".p"+i);var got=cache.getAll?cache.getAll(keys):null;for(var j=0;j<n;j++){var part=got?got[keys[j]]:cache.get(keys[j]);if(typeof part!=="string")return null;joined+=part;}return JSON.parse(joined);}catch(e){return null;}
}
function moaCachePutLargeJson_(cache,key,value,ttl){
  try{var raw=JSON.stringify(value),size=Math.max(8000,Number(MOA_PUBLIC_CACHE_CHUNK_CHARS||24000)),parts=[];for(var i=0;i<raw.length;i+=size)parts.push(raw.slice(i,i+size));if(parts.length>Number(MOA_PUBLIC_CACHE_MAX_PARTS||40))return false;for(var j=0;j<parts.length;j++)cache.put(key+".p"+j,parts[j],ttl);cache.put(key+".m",JSON.stringify({parts:parts.length}),ttl);return true;}catch(e){return false;}
}
function moaPublicSnapshot_(){
  var version=moaCurrentSyncVersion_(),key="moa-public-learning-"+version,cache=CacheService.getScriptCache(),hit=moaCacheGetLargeJson_(cache,key);
  if(hit)return hit;
  var basePatterns=moaPublicExamples_(),humanPatterns=moaPublicHumanPatterns_(),seen={},patterns=[];
  basePatterns.concat(humanPatterns).forEach(function(p){if(!p||!p.id||seen[p.id])return;seen[p.id]=1;patterns.push(p);});
  var snapshot={policy:moaPublicPolicy_(),expressionWeights:moaPublicExpressionWeights_(),patterns:patterns.slice(0,1400)};
  moaCachePutLargeJson_(cache,key,snapshot,300)
  return snapshot;
}
function moaSync_(data){
  if(moaLanguagePublishing_())return jsonResponse_({ok:false,error:"MOA_SYNC_PUBLISHING"});
  var known=Number(data.known_version||0),knownCore=Number(data.known_core_version||0),supportsDelta=/(?:^|,)delta-v1(?:,|$)/.test(String(data.client_caps||"")),version=moaCurrentSyncVersion_(),coreVersion=moaCurrentCoreSyncVersion_(),out={ok:true,version:version,coreVersion:coreVersion};
  if(known===version&&knownCore>=coreVersion)return jsonResponse_(out);
  if(known<=0||(!supportsDelta&&known!==version)){
    // First sync and pre-delta clients receive a complete snapshot. This keeps an
    // already-open old tab from advancing its version while silently ignoring patternDelta.
    var pub=moaPublicSnapshot_();out.policy=pub.policy;out.expressionWeights=pub.expressionWeights;out.patterns=pub.patterns;if(moaLanguageDeltaFloor_()===0)moaSetLanguageDeltaFloor_(version);return jsonResponse_(out);
  }
  // Policy/expression/example tables are independent of human-chat language deltas.
  // Only reread them if that component actually changed.
  var base=[],seen={};if(knownCore<coreVersion){out.policy=moaPublicPolicy_();out.expressionWeights=moaPublicExpressionWeights_();base=moaPublicExamples_();}
  var deltaState=moaPublicHumanPatternDelta_(known);
  if(deltaState.complete===false){var full=moaPublicSnapshot_();out.policy=full.policy;out.expressionWeights=full.expressionWeights;out.patterns=full.patterns;out.reset=true;return jsonResponse_(out);}
  out.patternDelta=[];base.forEach(function(p){if(!p||!p.id||seen[p.id])return;seen[p.id]=1;out.patternDelta.push(p);});
  (deltaState.patterns||[]).forEach(function(p){if(!p||!p.id||seen[p.id])return;seen[p.id]=1;out.patternDelta.push(p);});
  out.incremental=true;return jsonResponse_(out);
}

function moaStorePolicyEvents_(uid,events){
  var sh=moaEnsurePolicyWidth_(),last=sh.getLastRow(),rows=last>1?sh.getRange(2,1,last-1,14).getValues():[],originalCount=rows.length,index={},dirty={},changed=false,publicChanged=false;
  rows.forEach(function(r,i){index[String(r[0])+"\u001f"+String(r[1])]=i;});
  var now=new Date(),activity=moaCurrentActivitySerial_();
  events.forEach(function(ev){
    if(!ev||ev.type!=="policy_feedback")return;var key=String(ev.policyKey||"").slice(0,100),strategy=String(ev.strategy||"").slice(0,30),signal=String(ev.signal||"");if(!key||!strategy||["positive","negative"].indexOf(signal)<0)return;
    var k=key+"\u001f"+strategy,i=index[k],r;if(i==null){i=rows.length;index[k]=i;r=[key,strategy,0,0,"","",now,activity,"active",0,0,"",0,"observing"];rows.push(r);}else r=rows[i];while(r.length<14)r.push("");
    var beforeTier=moaPolicyLearningTier_(r[2],r[3],Number(r[9]||r[2]||0),Number(r[10]||r[3]||0),Number(r[12]||0));
    var col=signal==="positive"?4:5,res=moaAppendUserHash_(String(r[col]||""),uid);if(res.added){r[col]=res.value;r[signal==="positive"?2:3]=Number(r[signal==="positive"?2:3]||0)+1;}
    var er=moaAppendEvidenceHash_(String(r[11]||""),uid,ev),localChanged=!!(res.added||res.migrated||er.migrated);
    if(er.added){var w=moaEvidenceWeight_(ev);r[11]=er.value;r[12]=Number(r[12]||0)+1;if(signal==="positive")r[9]=Number(r[9]||0)+w;else r[10]=Number(r[10]||0)+w;localChanged=true;}
    var tier=moaPolicyLearningTier_(r[2],r[3],r[9],r[10],r[12]);if(String(r[13]||"")!==tier){r[13]=tier;localChanged=true;}
    if(localChanged&&(beforeTier!=="observing"||tier!=="observing"))publicChanged=true;
    if(!localChanged)return;r[6]=now;r[7]=activity;r[8]="active";dirty[i]=true;changed=true;
  });
  Object.keys(dirty).map(Number).filter(function(i){return i<originalCount}).forEach(function(i){sh.getRange(i+2,1,1,14).setValues([rows[i]]);});
  var appended=rows.slice(originalCount);if(appended.length)sh.getRange(originalCount+2,1,appended.length,14).setValues(appended);
  return publicChanged;
}
function moaStoreExpressionEvents_(uid,events){
  var sh=moaEnsureExpressionWidth_(),last=sh.getLastRow(),rows=last>1?sh.getRange(2,1,last-1,13).getValues():[],originalCount=rows.length,index={},dirty={},publicChanged=false;
  rows.forEach(function(r,i){index[String(r[0])]=i;});
  var now=new Date(),activity=moaCurrentActivitySerial_();
  function applyKey(key,ev){
    key=String(key||"").slice(0,40);if(!/^e[a-z0-9]+$/.test(key)&&!/^f:[a-z0-9-]+$/.test(key))return;
    var i=index[key],r;if(i==null){i=rows.length;index[key]=i;r=[key,0,0,"","",now,activity,"active",0,0,"",0,"observing"];rows.push(r);}else r=rows[i];while(r.length<13)r.push("");
    var signal=String(ev.signal||""),beforeTier=moaPolicyLearningTier_(r[1],r[2],Number(r[8]||r[1]||0),Number(r[9]||r[2]||0),Number(r[11]||0));
    var col=signal==="positive"?3:4,res=moaAppendUserHash_(String(r[col]||""),uid);if(res.added){r[col]=res.value;r[signal==="positive"?1:2]=Number(r[signal==="positive"?1:2]||0)+1;}
    var er=moaAppendEvidenceHash_(String(r[10]||""),uid,{evidenceKey:String(ev.evidenceKey||"")+"|"+key,type:"expression_feedback",strategy:key}),changed=!!(res.added||res.migrated||er.migrated);
    if(er.added){var w=moaEvidenceWeight_(ev);r[10]=er.value;r[11]=Number(r[11]||0)+1;if(signal==="positive")r[8]=Number(r[8]||0)+w;else r[9]=Number(r[9]||0)+w;changed=true;}
    var tier=moaPolicyLearningTier_(r[1],r[2],r[8],r[9],r[11]);if(String(r[12]||"")!==tier){r[12]=tier;changed=true;}
    if(!changed)return;if(beforeTier!=="observing"||tier!=="observing")publicChanged=true;r[5]=now;r[6]=activity;r[7]="active";dirty[i]=true;
  }
  (events||[]).forEach(function(ev){if(!ev||ev.type!=="policy_feedback"||["positive","negative"].indexOf(String(ev.signal||""))<0)return;applyKey(ev.expressionKey,ev);var features=Array.isArray(ev.featureKeys)?ev.featureKeys:[];features.slice(0,4).forEach(function(k){applyKey(k,ev);});});
  Object.keys(dirty).map(Number).filter(function(i){return i<originalCount}).forEach(function(i){sh.getRange(i+2,1,1,13).setValues([rows[i]]);});
  var appended=rows.slice(originalCount);if(appended.length)sh.getRange(originalCount+2,1,appended.length,13).setValues(appended);
  return publicChanged;
}

function moaCommit_(data){
  var uid=String(data.user_id||"").trim();if(!uid)return jsonResponse_({ok:false,error:"MOA_COMMIT_USER_REQUIRED"});
  var events=moaJson_(data.events_json,[]);if(!Array.isArray(events))events=[];
  events=events.filter(function(ev){return ev&&(ev.type==="policy_feedback"||ev.type==="dialogue_example");}).slice(0,30);
  var lease=moaAcquireLearningLease_("commit",30000);if(!lease)return jsonResponse_({ok:false,error:"MOA_COMMIT_BUSY"});
  try{
    moaActivityTick_();
    var policyEvents=events.filter(function(ev){return ev&&ev.type==="policy_feedback";}),dialogueEvents=events.filter(function(ev){return ev&&ev.type==="dialogue_example";});
    // Avoid opening/scanning unrelated common-learning sheets for event types that are
    // not present in this batch. This is especially important for proactive feedback,
    // which normally contains policy events but no dialogue examples.
    var changedPublic=policyEvents.length?moaStorePolicyEvents_(uid,policyEvents):false;
    var changedExpressions=policyEvents.length?moaStoreExpressionEvents_(uid,policyEvents):false;
    var changedExamples=dialogueEvents.length?moaStoreDialogueEvents_(uid,dialogueEvents):false;
    if(changedPublic||changedExpressions||changedExamples){var coreV=moaBumpSyncVersion_();moaMarkCoreSyncVersion_(coreV);}
    return jsonResponse_({ok:true,stored:events.length,version:moaCurrentSyncVersion_(),coreVersion:moaCurrentCoreSyncVersion_()});
  }finally{moaReleaseLearningLease_(lease);}
}

function moaRemoveLegacyPersonalDataSheets_(){
  var ss=SpreadsheetApp.getActiveSpreadsheet(),removed=[];
  ["모아_개인기억","모아_사용자성향","모아_표현학습"].forEach(function(name){var sh=ss.getSheetByName(name);if(sh){ss.deleteSheet(sh);removed.push(name);}});
  return {ok:true,removed:removed};
}

function moaMaintainLearningSheet_(sh,width,posCol,negCol,lastActCol,stateCol,posScoreCol,negScoreCol,evidenceCol,tierCol,activity,out){
  var last=sh.getLastRow();if(last<=1)return false;var rows=sh.getRange(2,1,last-1,width).getValues(),del=[],changed=false;
  for(var i=rows.length-1;i>=0;i--){
    var r=rows[i],pos=Number(r[posCol]||0),neg=Number(r[negCol]||0),lastAct=Number(r[lastActCol]||0),state=String(r[stateCol]||"active");
    if(!lastAct){sh.getRange(i+2,lastActCol+1).setValue(activity);continue;}
    var tier=moaPolicyLearningTier_(pos,neg,Number(r[posScoreCol]||pos||0),Number(r[negScoreCol]||neg||0),Number(r[evidenceCol]||0));
    if(String(r[tierCol]||"")!==tier){sh.getRange(i+2,tierCol+1).setValue(tier);changed=true;}
    if(activity-lastAct<MOA_MAINTENANCE_ACTIVITY_STEP||tier!=="observing")continue;
    if(state==="dormant"){del.push(i+2);out.deleted++;changed=true;}else{sh.getRange(i+2,stateCol+1).setValue("dormant");out.dormant++;changed=true;}
  }
  del.forEach(function(row){sh.deleteRow(row);});return changed;
}
function moaRunLearningMaintenance_(){
  var lease=moaAcquireLearningLease_("maintenance",240000);if(!lease)return {ok:false,error:"MOA_MAINTENANCE_BUSY",dormant:0,deleted:0};
  try{var activity=moaCurrentActivitySerial_(),out={ok:true,dormant:0,deleted:0,urlRemoved:0},changed=false,urlPurge=moaPurgeUrlLearnedData_();out.urlRemoved=Number(urlPurge.removed||0);changed=out.urlRemoved>0;
    changed=moaMaintainLearningSheet_(moaEnsurePolicyWidth_(),14,2,3,7,8,9,10,12,13,activity,out)||changed;
    changed=moaMaintainLearningSheet_(moaEnsureExpressionWidth_(),13,1,2,6,7,8,9,11,12,activity,out)||changed;
    changed=moaMaintainLearningSheet_(moaEnsureExampleWidth_(),18,6,7,11,12,13,14,16,17,activity,out)||changed;
    if(changed){var targetVersion=moaCurrentSyncVersion_()+1;moaSetLanguageDeltaFloor_(targetVersion);var coreV=moaBumpSyncVersion_();moaMarkCoreSyncVersion_(coreV);}return out;
  }finally{moaReleaseLearningLease_(lease);}
}
function moaInstallMaintenanceTrigger_(){moaRemoveMaintenanceTrigger_();ScriptApp.newTrigger("moaRunLearningMaintenance_").timeBased().everyWeeks(1).create();}
function moaRemoveMaintenanceTrigger_(){ScriptApp.getProjectTriggers().forEach(function(t){if(t.getHandlerFunction()==="moaRunLearningMaintenance_")ScriptApp.deleteTrigger(t)});}

/** 더 이상 사용하지 않는 모아 AI 개인/레거시 시트를 필요할 때 한 번 정리합니다.
 * 현재 공용학습 시트인 모아_대화정책 / 모아_표현가중치는 절대 삭제하지 않습니다.
 */
function moaCleanupLegacySheets(){
  var ss=SpreadsheetApp.getActiveSpreadsheet(),removed=[];
  ["모아_개인기억","모아_사용자성향","모아_표현학습","모아_학습후보","모아_반응학습","모아_주제학습"].forEach(function(n){
    var sh=ss.getSheetByName(n);if(sh){ss.deleteSheet(sh);removed.push(n);}
  });
  return {ok:true,removed:removed,preserved:[MOA_POLICY_SHEET,MOA_EXPRESSION_SHEET,MOA_EXAMPLE_SHEET,MOA_LANGUAGE_SHEET,MOA_LANGUAGE_REBUILD_SHEET,MOA_LANGUAGE_DELTA_SHEET]};
}
