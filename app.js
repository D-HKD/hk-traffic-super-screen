const PROXY="https://hk-traffic-super-proxy.idyl-2014061.workers.dev";
const MTR="https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php";
const LRT="https://rt.data.gov.hk/v1/transport/mtr/lrt/getSchedule";
const WEATHER="/weather";
const TRAFFIC="/trafficnews";

const tmlStations=["LOP","TIS","TUM"];
const lrtGroups=[
  {station:500, name:"天榮", routes:["705","706","751","751P"]},
  {station:295, name:"屯門站", routes:["507","610","614","614P","615","615P"], dest:["屯門碼頭","Tuen Mun Ferry Pier"]},
  {station:240, name:"兆禧", routes:["507","614","614P"], dest:["屯門","Tuen Mun"]}
];
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
function clock(){const d=new Date();$("clock").textContent=d.toLocaleTimeString("zh-HK",{hour12:false});$("date").textContent=d.toLocaleDateString("zh-HK",{year:"numeric",month:"long",day:"numeric",weekday:"short"});}
setInterval(clock,1000);clock();
function mins(v){
  if(v==null||v==="-"||v==="")return null;
  if(typeof v==="number")return v;
  const s=String(v).trim();
  if(/^\d+$/.test(s))return Number(s);
  const m=s.match(/(\d+)\s*(?:min|mins|minutes|分鐘)/i);if(m)return Number(m[1]);
  const t=s.match(/^(\d{1,2}):(\d{2})$/);if(t){const d=new Date(),x=new Date(d);x.setHours(+t[1],+t[2],0,0);let n=Math.round((x-d)/60000);if(n<0)n+=1440;return n;}
  return null;
}
function eta(n){return n==null?["--",""]:n<=1?["即將",""]: [String(n),"分鐘"];}
async function proxy(path,params={}){
  const u=new URL(PROXY+path);Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,v));
  const r=await fetch(u,{cache:"no-store"});if(!r.ok)throw new Error("HTTP "+r.status);return r;
}
async function mtr(sta){
  const u=new URL(MTR);u.searchParams.set("line","TML");u.searchParams.set("sta",sta);u.searchParams.set("lang","TC");
  return (await proxy("/mtr",{url:u.toString()})).json();
}
async function lrt(station){
  const u=new URL(LRT);u.searchParams.set("station_id",station);u.searchParams.set("lang","tc");
  return (await proxy("/mtr",{url:u.toString()})).json();
}

function renderTML(sta,j){
  const root=$(`${sta}-eta`);if(!root)return;
  const d=j?.data?.[`TML-${sta}`]||{};let rows=[];
  for(const dir of ["UP","DOWN"]){
    for(const x of (Array.isArray(d[dir])?d[dir]:[])){
      const n=mins(x.ttnt??x.time);if(n==null)continue;
      const dest=x.dest||"";
      const label=/WKS|Wu Kai Sha|烏溪沙/i.test(dest)?"往烏溪沙":/TUM|Tuen Mun|屯門/i.test(dest)?"往屯門":dest;
      rows.push({n,label});
    }
  }
  rows.sort((a,b)=>a.n-b.n);
  const seen=new Set();rows=rows.filter(r=>{const k=r.label+"|"+r.n;if(seen.has(k))return false;seen.add(k);return true}).slice(0,3);
  root.innerHTML=rows.length?rows.map(r=>{const [a,b]=eta(r.n);return `<div class="eta-line"><div><b>${esc(r.label)}</b><small>Tuen Ma Line</small></div><strong>${esc(a)}<small>${esc(b)}</small></strong></div>`}).join(""):'<div class="muted">暫無實時班次</div>';
}

function renderLRT(group,j){
  const rows=[];
  const platforms=Array.isArray(j?.platform_list)?j.platform_list:[];
  for(const p of platforms){
    const routes=Array.isArray(p.route_list)?p.route_list:[];
    for(const r of routes){
      const route=String(r.route_no||"").trim();
      if(!group.routes.includes(route))continue;
      const dest=String(r.dest_ch||r.dest_en||"");
      if(group.dest&&!group.dest.some(x=>dest.toLowerCase().includes(x.toLowerCase())))continue;
      const n=mins(r.time_ch)||mins(r.time_en);
      if(n==null)continue;
      rows.push({route,dest,n,plat:p.platform_id});
    }
  }
  rows.sort((a,b)=>a.n-b.n);
  const unique=[];const seen=new Set();
  for(const r of rows){const k=r.route+"|"+r.dest+"|"+r.n;if(!seen.has(k)){seen.add(k);unique.push(r)}}
  return unique.slice(0,3);
}
async function loadRail(){
  try{
    const results=await Promise.all(tmlStations.map(s=>mtr(s).then(j=>[s,j])));
    results.forEach(([s,j])=>renderTML(s,j));
    const lrt=await Promise.all(lrtGroups.map(g=>lrt(g.station).then(j=>[g,j])));
    let allLrt=[];
    lrt.forEach(([g,j])=>{const rs=renderLRT(g,j);rs.forEach(r=>allLrt.push({...r,station:g.name}))});
    allLrt.sort((a,b)=>a.n-b.n);
    $("LRT-eta").innerHTML=allLrt.length?allLrt.slice(0,7).map(r=>{const [a,b]=eta(r.n);return `<div class="lrt-row"><span class="route-chip">${esc(r.route)}</span><div><b>${esc(r.station)} → ${esc(r.dest)}</b><small>月台 ${esc(r.plat??"--")}</small></div><strong>${esc(a)}<small>${esc(b)}</small></strong></div>`}).join(""):'<div class="muted">暫無輕鐵實時資料</div>';
    $("rail-update").textContent=new Date().toLocaleTimeString("zh-HK",{hour12:false});
    $("tml-status").textContent="正常服務";$("lrt-status").textContent=allLrt.length?"正常服務":"資料重試";
    $("map-train-1").style.animationPlayState="running";$("map-train-2").style.animationPlayState="running";$("map-lrt-train").style.animationPlayState="running";
    $("last-update").textContent=new Date().toLocaleTimeString("zh-HK",{hour12:false});
  }catch(e){
    console.error(e);$("tml-status").textContent="連線重試";$("lrt-status").textContent="連線重試";
  }
}

const STATIONS=[
  ["屯門",22.3919,113.9767],["元朗公園",22.4446,114.0180],["流浮山",22.4678,113.9840],
  ["石崗",22.4350,114.0770],["大埔",22.4509,114.1656],["沙田",22.4029,114.2100],
  ["荃灣城門谷",22.3754,114.1160],["荃灣可觀",22.3940,114.0980],["青衣",22.3448,114.1055],
  ["深水埗",22.3300,114.1620],["九龍城",22.3282,114.1885],["觀塘",22.3115,114.2250],
  ["西貢",22.3820,114.2700],["將軍澳",22.3150,114.2630],["柴灣",22.2640,114.2360],
  ["筲箕灣",22.2780,114.2260],["香港天文台",22.3020,114.1740]
];
function dist(a,b,c,d){const R=6371,p=Math.PI/180,x=Math.sin((c-a)*p/2)**2+Math.cos(a*p)*Math.cos(c*p)*Math.sin((d-b)*p/2)**2;return 2*R*Math.asin(Math.sqrt(x));}
function nearest(lat,lon){return STATIONS.map(s=>({name:s[0],lat:s[1],lon:s[2],km:dist(lat,lon,s[1],s[2])})).sort((a,b)=>a.km-b.km)[0];}
window.gpsStation=null;
function locate(){
  if(!navigator.geolocation){$("gps-place").textContent="瀏覽器不支援 GPS";return;}
  $("gps-place").textContent="正在定位…";$("header-gps").textContent="定位中";
  navigator.geolocation.getCurrentPosition(pos=>{
    const {latitude:lat,longitude:lon}=pos.coords;const s=nearest(lat,lon);window.gpsStation=s;
    $("gps-place").textContent=`${s.name}觀測站附近`;
    $("gps-coords").textContent=`座標：${lat.toFixed(5)}, ${lon.toFixed(5)} · 距觀測站 ${s.km.toFixed(1)} km`;
    $("gps-pill").textContent="已連接";$("header-gps").textContent="已連接";$("system-dot").style.background="#17f59a";
    $("gps-pulse").style.left=(Math.max(8,Math.min(84,25+(lon-113.95)*150)))+"%";
    $("gps-pulse").style.top=(Math.max(12,Math.min(78,64-(lat-22.30)*230)))+"%";
    $("gps-status").textContent="GPS 已定位";
    loadWeather();
  },err=>{$("gps-pill").textContent="未授權";$("header-gps").textContent="待命";$("gps-place").textContent="未取得位置";});
}
$("gps-btn").addEventListener("click",locate);$("gps-side").addEventListener("click",locate);

function wxIcon(code){const n=Number(code);if(n>=50&&n<=57)return"☁️";if(n>=60&&n<=77)return"🌧️";if(n>=80&&n<=82)return"⛈️";return"☀️";}
async function loadWeather(){
  try{
    const j=await (await proxy(WEATHER)).json(), r=j.weather||j;
    const station=window.gpsStation?.name||"屯門";
    const temps=Array.isArray(r.temperature?.data)?r.temperature.data:[];const hums=Array.isArray(r.humidity?.data)?r.humidity.data:[];
    const tr=temps.find(x=>String(x.place).includes(station))||temps[0];const hr=hums.find(x=>String(x.place).includes(station))||hums[0];
    const temp=tr?.value,hum=hr?.value,icon=wxIcon(r.icon);
    $("weather-icon").textContent=icon;$("weather-icon-large").textContent=icon;$("header-temp").textContent=(temp??"--")+"°C";$("big-temp").textContent=(temp??"--")+"°C";$("weather-card-temp").textContent=(temp??"--")+"°";
    $("header-weather").textContent=`${station}附近`;$("big-weather").textContent=`${station}附近天氣`;$("weather-station").textContent=station;$("weather-card-place").textContent=station;$("weather-card-station").textContent=station;
    $("header-humidity").textContent=(hum??"--")+"%";$("big-humidity").textContent=(hum??"--")+"%";$("weather-card-hum").textContent=(hum??"--")+"%";
    $("weather-card-text").textContent=`${station}附近實時觀測`;
    $("weather-status").textContent="正常";$("last-update").textContent=new Date().toLocaleTimeString("zh-HK",{hour12:false});
    window.lastWeather={station,temp,hum,text:`${station}附近目前氣溫 ${temp??"--"} 度，濕度 ${hum??"--"}%`};
  }catch(e){console.error(e);$("weather-status").textContent="連線重試";}
}
function parseTraffic(xml){
  const doc=new DOMParser().parseFromString(xml,"text/xml");
  return [...doc.querySelectorAll("message")].map(m=>({title:m.querySelector("INCIDENT_HEADING_CN")?.textContent?.trim()||"交通消息",detail:m.querySelector("CONTENT_CN")?.textContent?.trim()||"",loc:m.querySelector("LOCATION_CN")?.textContent?.trim()||"",time:m.querySelector("ANNOUNCEMENT_DATE")?.textContent?.trim()||""})).filter(x=>x.detail);
}
async function loadTraffic(){
  try{
    const xml=await (await proxy(TRAFFIC)).text(),items=parseTraffic(xml),focus=items.filter(x=>/屯門|元朗|天水圍|朗屏|青山|屯門公路|元朗公路|大欖/i.test(x.title+" "+x.detail+" "+x.loc));
    const list=(focus.length?focus:items).slice(0,4);
    $("alert-list").innerHTML=list.length?list.map(x=>`<div class="alert-item"><div><b>${esc(x.title)}</b> <span class="alert-time">${esc(x.time)}</span></div><p>${esc(x.loc?x.loc+"：":"")}${esc(x.detail).slice(0,125)}</p></div>`).join(""):'<div class="muted">目前沒有交通消息</div>';
    $("road-status").textContent=focus.length?"有交通消息":"大致暢順";$("bus-status").textContent=focus.length?"請留意改道":"正常";
    $("alert-time").textContent=new Date().toLocaleTimeString("zh-HK",{hour12:false});
    window.lastTraffic=focus.length?focus[0].detail:"目前未發現屯門及元朗特別交通消息";
  }catch(e){console.error(e);$("road-status").textContent="連線重試";}
}

// Voice
let voiceTimer=null,voiceOn=false,voices=[];
function refreshVoices(){if("speechSynthesis"in window)voices=speechSynthesis.getVoices()||[];}
if("speechSynthesis"in window){refreshVoices();speechSynthesis.onvoiceschanged=refreshVoices;}
function chooseVoice(g){
  const zh=voices.filter(v=>/zh-HK|yue|zh-TW|zh-CN|^zh/i.test(v.lang)||/Cantonese|Chinese|Yue|粵|廣東|中文|國語/i.test(v.name));
  if(!zh.length)return null;
  const female=/female|woman|siri|mei|ting|sin|xiaoxiao|婷婷|曉曉|小雅|女/i, male=/male|man|yunxi|yunyang|liang|男/i;
  return g==="auto"?zh.find(v=>/zh-HK|yue/i.test(v.lang))||zh[0]:zh.find(v=>(g==="female"?female:male).test(v.name))||zh.find(v=>/zh-HK|yue/i.test(v.lang))||zh[0];
}
function speak(){
  if(!("speechSynthesis"in window))return;
  const w=window.lastWeather||{station:"香港",temp:"--",hum:"--",text:"天氣資料未更新"},t=window.lastTraffic||"目前未發現特別交通消息";
  const text=`香港交通控制中心即時報告。${w.station}附近目前氣溫 ${w.temp} 度，濕度 ${w.hum}%。交通方面，${t}。屯馬綫及輕鐵正在更新實時班次。`;
  speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang="zh-HK";u.rate=.84;u.pitch=$("voice-gender").value==="male"?.88:.98;const v=chooseVoice($("voice-gender").value);if(v){u.voice=v;u.lang=v.lang}speechSynthesis.speak(u);
}
function startVoice(){voiceOn=true;speak();if(voiceTimer)clearInterval(voiceTimer);voiceTimer=setInterval(()=>voiceOn&&speak(),Number($("voice-interval").value)*60000)}
function stopVoice(){voiceOn=false;if(voiceTimer)clearInterval(voiceTimer);voiceTimer=null;if("speechSynthesis"in window)speechSynthesis.cancel()}
$("voice-start").addEventListener("click",startVoice);$("voice-now").addEventListener("click",speak);$("voice-stop").addEventListener("click",stopVoice);

function full(){if(!document.fullscreenElement)document.documentElement.requestFullscreen?.();else document.exitFullscreen?.()}
$("full-btn").addEventListener("click",full);$("fullscreen-btn").addEventListener("click",full);
$("night-btn").addEventListener("click",()=>document.body.classList.toggle("night"));
$("weather-refresh").addEventListener("click",loadWeather);

locate();
loadRail();loadWeather();loadTraffic();
setInterval(loadRail,10000);setInterval(loadWeather,60000);setInterval(loadTraffic,60000);
