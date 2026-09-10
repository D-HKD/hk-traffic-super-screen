self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));
self.addEventListener("push",e=>{
  let d={title:"香港交通警報中心",body:"有新的交通消息",url:"./"};
  try{d={...d,...e.data.json()}}catch(_){}
  e.waitUntil(self.registration.showNotification(d.title,{body:d.body,icon:"icon-192.png",badge:"icon-192.png",tag:d.tag||"hk-traffic",renotify:false,data:{url:d.url||"./"}}));
});
self.addEventListener("notificationclick",e=>{e.notification.close();e.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(cs=>{for(const c of cs){if("focus"in c)return c.focus()}if(clients.openWindow)return clients.openWindow(e.notification.data?.url||"./")}))});
