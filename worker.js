export default {
  async fetch(request) {
    const u = new URL(request.url);
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Cache-Control": "no-store"
    };
    if (request.method === "OPTIONS") return new Response("", {headers:cors});

    if (u.pathname === "/") {
      return new Response(JSON.stringify({ok:true,service:"Hong Kong Transport Super Screen Proxy"}), {
        headers:{...cors,"Content-Type":"application/json;charset=utf-8"}
      });
    }

    let target = null;
    let contentType = "application/json;charset=utf-8";

    if (u.pathname === "/mtr") {
      target = u.searchParams.get("url");
      const allowed = [
        "https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php",
        "https://rt.data.gov.hk/v1/transport/mtr/lrt/getSchedule"
      ];
      if (!target || !allowed.some(x => target.startsWith(x))) {
        return new Response(JSON.stringify({ok:false,error:"Invalid MTR URL"}), {status:400,headers:{...cors,"Content-Type":contentType}});
      }
    } else if (u.pathname === "/weather") {
      target = "https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=rhrread&lang=tc";
    } else if (u.pathname === "/trafficnews") {
      target = "https://www.td.gov.hk/tc/special_news/trafficnews.xml";
      contentType = "application/xml;charset=utf-8";
    } else {
      return new Response(JSON.stringify({ok:false,error:"Not found"}), {status:404,headers:{...cors,"Content-Type":contentType}});
    }

    try {
      const r = await fetch(target, {headers: {"User-Agent":"HKTrafficSuperScreen/1.0"}});
      const body = await r.text();
      return new Response(body, {status:r.status,headers:{...cors,"Content-Type":contentType}});
    } catch(e) {
      return new Response(JSON.stringify({ok:false,error:String(e)}), {status:502,headers:{...cors,"Content-Type":"application/json;charset=utf-8"}});
    }
  }
};
