export default {
  async fetch(request) {
    const u = new URL(request.url);
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Cache-Control": "no-store"
    };
    if (request.method === "OPTIONS") return new Response("", { headers: cors });

    const json = (data, status=200) => new Response(JSON.stringify(data), {
      status, headers: { ...cors, "Content-Type": "application/json;charset=utf-8" }
    });

    if (u.pathname === "/") return json({
      ok:true, service:"Hong Kong Traffic Control Center Proxy", version:"ULTIMATE-5",
      endpoints:["/tml?sta=TIS","/lrt?station_id=500&with_special=1","/weather","/trafficnews"]
    });

    let target = "";
    let type = "application/json;charset=utf-8";

    if (u.pathname === "/tml") {
      const sta = (u.searchParams.get("sta") || "").toUpperCase();
      const allowed = ["LOP","TIS","TUM"];
      if (!allowed.includes(sta)) return json({ok:false,error:"Invalid TML station",sta},400);
      target = `https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php?line=TML&sta=${sta}&lang=TC`;
    } else if (u.pathname === "/lrt") {
      const station = u.searchParams.get("station_id") || "";
      if (!/^\d+$/.test(station)) return json({ok:false,error:"Invalid LRT station_id"},400);
      const special = u.searchParams.get("with_special") === "1" ? "&with_special=1" : "";
      target = `https://rt.data.gov.hk/v1/transport/mtr/lrt/getSchedule?station_id=${station}${special}`;
    } else if (u.pathname === "/mtr") {
      target = u.searchParams.get("url") || "";
      const allowed = [
        "https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php",
        "https://rt.data.gov.hk/v1/transport/mtr/lrt/getSchedule"
      ];
      if (!target || !allowed.some(x => target.startsWith(x))) return json({ok:false,error:"Invalid MTR URL"},400);
    } else if (u.pathname === "/weather") {
      target = "https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=rhrread&lang=tc";
    } else if (u.pathname === "/trafficnews") {
      target = "https://www.td.gov.hk/tc/special_news/trafficnews.xml";
      type = "application/xml;charset=utf-8";
    } else {
      return json({ok:false,error:"Not found"},404);
    }

    try {
      const r = await fetch(target, { headers:{"User-Agent":"HKTransportControlCenter/ULTIMATE-5"} });
      const body = await r.text();
      return new Response(body, { status:r.status, headers:{...cors,"Content-Type":type} });
    } catch (e) {
      return json({ok:false,error:String(e)},502);
    }
  }
};
