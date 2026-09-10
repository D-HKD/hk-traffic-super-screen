const PROXY="https://hk-traffic-super-proxy.idyl-2014061.workers.dev";
const MTR="https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php";
const LRT="https://rt.data.gov.hk/v1/transport/mtr/lrt/getSchedule";
const WEATHER="/weather";
const TRAFFIC="/trafficnews";

const tmlStations=["LOP","TIS","TUM"];
const lrtGroups=[
  {id:"LRT500",station:500,routes:["705","706","751","751P"]},
  {id:"LRT295",station:295,routes:["507","610","614","614P","615","615P"],dest:["屯門碼頭","Tuen Mun Ferry Pier"]},
  {id:"LRT240",station:240,routes:["507","614","614P"],dest:["屯門","Tuen Mun"]}
];

const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
function now(){return new Date().toLocaleTimeString("zh-HK",{hour12:false});}
function mins(v){
  if(v==null)return null;
  if(typeof v==="number")return v;
  const s=String(v).trim();
  if(/^\d+$/.test(s))return Number(s);
  const m=s.match(/(\d+)\s*(?:min|mins|minutes|分鐘)/i); if(m)return Number(m[1]);
  const t=s.match(/^(\d{1,2}):(\d{2})$/);
  if(t){const d=new Date(),x=new Date(d);x.setHours(+t[1],+t[2],0,0);let n=Math.round((x-d)/60000);if(n<0)n+=1440;return n;}
  const dt=Date.parse(s); if(!Number.isNaN(dt))return Math.max(0,Math.round((dt-Date.now())/60000));
  return null;
}
function etaText(n){if(n==null)return ["--",""];if(n<=1)return ["即將","到達"];return [String(n),"分鐘"];}

async function proxyJson(path, params={}){
  const u=new URL(PROXY+path);
  Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,v));
  const r=await fetch(u,{cache:"no-store"}); if(!r.ok)throw new Error("HTTP "+r.status); return r.json();
}
async function mtr(station){
  const u=new URL(MTR);u.searchParams.set("line","TML");u.searchParams.set("sta",station);u.searchParams.set("lang","TC");
  return proxyJson("/mtr",{url:u.toString()});
}
async function lrt(station){
  const u=new URL(LRT);u.searchParams.set("station_id",station);u.searchParams.set("lang","tc");
  return proxyJson("/mtr",{url:u.toString()});
}

function renderTML(station,j){
  const root=$(station); if(!root)return;
  const data=j?.data?.["TML-"+station]||{};
  let rows=[];
  for(const key of ["UP","DOWN"]){
    for(const x of (Array.isArray(data[key])?data[key]:[])){
      const n=mins(x.ttnt ?? x.time ?? x.eta);
      if(n==null)continue;
      const d=x.dest||x.destination||"";
      const toWKS=/烏溪沙|WKS|Wu Kai Sha/i.test(d);
      const toTUM=/屯門|TUM|Tuen Mun/i.test(d);
      const label=toWKS?"→ 往烏溪沙":toTUM?"← 往屯門":("→ "+d);
      rows.push({n,label,raw:d,seq:x.seq});
    }
  }
  const seen=new Set(); rows=rows.sort((a,b)=>a.n-b.n).filter(r=>{const k=r.label+"|"+r.n;if(seen.has(k))return false;seen.add(k);return true}).slice(0,4);
  if(!rows.length){root.innerHTML='<div class="empty">暫時沒有班次資料</div>';return;}
  root.innerHTML=rows.map(r=>{const [a,b]=etaText(r.n);return `<div class="eta-row"><div><div class="eta-dest">${esc(r.label)}</div><div class="eta-sub">${esc(r.raw)}</div></div><div class="eta-time">${esc(a)} <small>${esc(b)}</small></div></div>`}).join("");
}

function renderLRT(group,j){
  const root=$(group.id);if(!root)return;
  const all=Array.isArray(j?.platform_list)?j.platform_list:[];
  let rows=[];
  for(const p of all){
    const route=String(p.route_no||p.route||"");
    if(!group.routes.includes(route))continue;
    const d=p.dest_ch||p.destination_ch||p.dest||p.destination||"";
    if(group.dest && !group.dest.some(x=>String(d).toLowerCase().includes(x.toLowerCase())))continue;
    const trains=Array.isArray(p.train_list)?p.train_list:[p];
    for(const x of trains){
      const n=mins(x.time||x.ttnt||x.eta||x.arrival_time);
      if(n==null)continue;
      rows.push({n,route,dest:d});
    }
  }
  rows.sort((a,b)=>a.n-b.n);
  if(!rows.length){root.innerHTML='<div class="empty">暫時沒有班次資料</div>';return;}
  root.innerHTML=rows.slice(0,2).map(r=>{const [a,b]=etaText(r.n);return `<div class="eta-row"><div><div class="eta-dest">🚊 ${esc(r.route)}　${esc(r.dest)}</div><div class="eta-sub">輕鐵實時</div></div><div class="eta-time">${esc(a)} <small>${esc(b)}</small></div></div>`}).join("");
}

async function loadRail(){
  try{
    const t=await Promise.all(tmlStations.map(s=>mtr(s).then(j=>[s,j])));
    t.forEach(([s,j])=>renderTML(s,j));
    const l=await Promise.all(lrtGroups.map(g=>lrt(g.station).then(j=>[g,j])));
    l.forEach(([g,j])=>renderLRT(g,j));
    $("rail-update").textContent=now();
    $("last-update").textContent=now();
    const sample=t.find(x=>x[1]?.data);
    $("tml-summary").textContent=sample?"實時班次正常":"資料更新中";
    lastRail="屯馬綫目前正常運作";
    $("focus-rail").textContent="🟢 正常";
  }catch(e){
    console.error(e);
    $("tml-summary").textContent="連線重試中";
    $("focus-rail").textContent="⚠️ 重試中";
  }
}

function wxIcon(i){const n=Number(i);if([50,51,52,53,54,55,56,57].includes(n))return "☁️";if([60,61,62,63,64,65,66,67,68,70,71,72,73,74,75,76,77].includes(n))return "🌧️";if([80,81,82].includes(n))return "⛈️";return "🌤️";}
async function loadWeather(){
  try{
    const j=await proxyJson(WEATHER);
    const r=j.weather||j;
    const temp=r.temperature?.data?.[0]?.value ?? r.temperature?.data?.[0]?.value;
    const hum=r.humidity?.data?.[0]?.value;
    const wind=r.wind?.data?.[0]?.value;
    const desc=r.icon?wxIcon(r.icon):"🌤️";
    lastWeather.temp=temp;
    lastWeather.text=r.rainfall?.description || "香港目前天氣";
    lastWeather.humidity=hum;
    $("weather-icon").textContent=desc;
    $("temp").textContent=(temp??"--")+"°";
    $("weather-text").textContent=r.rainfall?.description || "香港目前天氣";
    $("humidity").textContent=(hum??"--")+"%";
    $("wind").textContent=wind??"--";
    $("focus-weather").textContent=(temp!=null?temp+"°C ":"")+"🌤️";
  }catch(e){console.error(e);$("weather-text").textContent="天氣資料暫時未能取得";$("focus-weather").textContent="暫時離線";}
}

function parseTraffic(xml){
  const doc=new DOMParser().parseFromString(xml,"text/xml");
  return [...doc.querySelectorAll("message")].map(m=>({
    title:m.querySelector("INCIDENT_HEADING_CN")?.textContent?.trim()||"交通消息",
    detail:m.querySelector("CONTENT_CN")?.textContent?.trim()||"",
    loc:m.querySelector("LOCATION_CN")?.textContent?.trim()||"",
    district:m.querySelector("DISTRICT_CN")?.textContent?.trim()||"",
    time:m.querySelector("ANNOUNCEMENT_DATE")?.textContent?.trim()||""
  })).filter(x=>x.detail);
}
async function loadTraffic(){
  try{
    const r=await fetch(PROXY+TRAFFIC,{cache:"no-store"});if(!r.ok)throw new Error("HTTP "+r.status);
    const xml=await r.text(), items=parseTraffic(xml);
    const focus=items.filter(x=>/屯門|元朗|天水圍|朗屏|青山|屯門公路|元朗公路|大欖|荃灣路/i.test(x.title+" "+x.detail+" "+x.loc+" "+x.district));
    const list=(focus.length?focus:items).slice(0,7);
    $("traffic-news").innerHTML=list.length?list.map(x=>`<div class="news-item"><div class="news-top"><div class="news-title"><span class="tag">交通</span>${esc(x.title)}</div><div class="news-time">${esc((x.time||"").replace("T"," "))}</div></div><div class="news-body">${esc(x.loc?x.loc+"：":"")}${esc(x.detail)}</div></div>`).join(""):'<div class="loading">目前沒有可顯示的交通消息</div>';
    const has=focus.length>0;
    lastTraffic.has=has;
    lastTraffic.detail=has ? (focus[0].detail || "屯門／元朗有交通消息") : "";
    $("traffic-status").textContent=has?"🟠 有交通消息":"🟢 大致正常";
    $("traffic-detail").textContent=has?`屯門／元朗相關消息 ${focus.length} 項，建議出行前留意`:"目前未發現屯門／元朗相關特別交通消息";
    $("focus-road").textContent=has?"🟠 有消息":"🟢 大致正常";
    $("traffic-update").textContent=now();
    $("ticker-text").textContent=has?focus[0].detail:"目前未發現屯門／元朗相關特別交通消息";
  }catch(e){
    console.error(e);$("traffic-status").textContent="⚠️ 暫時離線";$("traffic-detail").textContent="交通消息連線重試中";$("focus-road").textContent="重試中";
  }
}

function tick(){ $("clock").textContent=now(); }
setInterval(tick,1000);tick();
loadRail();loadWeather();loadTraffic();
setInterval(loadRail,10000);
setInterval(loadWeather,60000);
setInterval(loadTraffic,60000);

// ===== 語音報告：男／女聲 + 自然語速 =====
let voiceEnabled=false, voiceTimer=null;
let lastWeather={temp:null,text:"",humidity:null};
let lastTraffic={has:false,detail:""};
let lastRail="屯馬綫目前正常運作";
let availableVoices=[];

function refreshVoices(){
  if(!("speechSynthesis" in window)) return;
  availableVoices=speechSynthesis.getVoices()||[];
  const select=$("voice-gender"); if(!select)return;
  const current=select.value;
  select.innerHTML='<option value="female">👩 女聲</option><option value="male">👨 男聲</option><option value="auto">🤖 自動最佳中文聲線</option>';
  select.value=current||"female";
}
function chineseVoices(){
  return availableVoices.filter(v=>/^(zh-HK|yue|zh-TW|zh-CN|zh)/i.test(v.lang)||/Cantonese|Chinese|Yue|粵|廣東|國語|中文/i.test(v.name));
}
function chooseVoice(gender){
  const vs=chineseVoices();
  if(!vs.length)return null;
  if(gender==="auto")return vs.find(v=>/zh-HK|yue/i.test(v.lang))||vs[0];
  const femaleWords=/female|woman|girl|siri|mei|ting|sin|xiaoxiao|婷婷|曉曉|小雅|女/i;
  const maleWords=/male|man|boy|yunxi|yunyang|liang|男/i;
  const re=gender==="female"?femaleWords:maleWords;
  return vs.find(v=>re.test(v.name)) || vs.find(v=>/zh-HK|yue/i.test(v.lang)) || vs[0];
}
function speakReport(){
  if(!("speechSynthesis" in window)){ $("voice-state").textContent="裝置不支援"; return; }
  const temp=lastWeather.temp!=null?`目前氣溫 ${lastWeather.temp} 度。`:"";
  const weather=lastWeather.text?`天氣${lastWeather.text}。`:"";
  const traffic=lastTraffic.has?`交通方面，${lastTraffic.detail}。`:"交通方面，目前未發現屯門及元朗有特別交通消息。";
  const text=`香港交通即時報告。${temp}${weather}${traffic}${lastRail}。請留意最新交通情況。`;
  $("voice-preview").textContent=text;
  $("voice-state").textContent="播報中";
  speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(text);
  u.lang="zh-HK";
  u.rate=0.82;
  u.pitch=$("voice-gender").value==="male"?0.88:0.98;
  u.volume=1;
  const voice=chooseVoice($("voice-gender").value);
  if(voice){u.voice=voice;u.lang=voice.lang;}
  u.onend=()=>{$("voice-state").textContent="已啟動";};
  speechSynthesis.speak(u);
}
function startVoice(){
  if(!("speechSynthesis" in window)){alert("你的瀏覽器不支援語音播放。");return;}
  voiceEnabled=true;speakReport();
  if(voiceTimer)clearInterval(voiceTimer);
  const m=Number($("voice-interval").value||10);
  voiceTimer=setInterval(()=>{if(voiceEnabled)speakReport();},m*60000);
  $("voice-state").textContent="已啟動";
}
function stopVoice(){
  voiceEnabled=false;if(voiceTimer)clearInterval(voiceTimer);voiceTimer=null;
  if("speechSynthesis" in window)speechSynthesis.cancel();
  $("voice-state").textContent="已停止";
}
$("voice-start").addEventListener("click",startVoice);
$("voice-stop").addEventListener("click",stopVoice);
$("voice-now").addEventListener("click",speakReport);
if("speechSynthesis" in window){
  refreshVoices();
  speechSynthesis.onvoiceschanged=refreshVoices;
}

// ===== 道路狀況摘要 =====
function roadLevel(text){
  const s=String(text||"");
  if(/封閉|嚴重|非常擠塞|大塞|事故|交通意外/i.test(s))return ["🔴","嚴重／有事故"];
  if(/繁忙|擠塞|車多|交通受阻|慢駛/i.test(s))return ["🟠","繁忙／慢駛"];
  return ["🟢","大致正常"];
}
function updateRoadCards(items){
  const groups=[
    ["road-tuenmun",/屯門公路|屯門區/],
    ["road-yuenlong",/元朗公路|元朗區|天水圍|朗屏/],
    ["road-castlepeak",/青山公路/],
    ["road-taiflam",/大欖隧道|大欖/]
  ];
  groups.forEach(([id,re])=>{
    const hit=items.find(x=>re.test(x.title+" "+x.detail+" "+x.loc+" "+x.district));
    const [icon,label]=roadLevel(hit?hit.title+" "+hit.detail:"");
    $(id).textContent=hit?`${icon} ${label}`:"🟢 暫無特別消息";
  });
}
const oldLoadTraffic=loadTraffic;
loadTraffic=async function(){
  await oldLoadTraffic();
  // 由現有交通列表重新掃描道路提示；若抓取失敗則保留原狀態
  try{
    const r=await fetch(PROXY+TRAFFIC,{cache:"no-store"}); if(!r.ok)return;
    const xml=await r.text(); const items=parseTraffic(xml); updateRoadCards(items);
  }catch(e){}
};
