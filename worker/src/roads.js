/**
 * 運輸署「策略性／主要道路」車速數據（純函式，可獨立測試）。
 *
 * 來源：
 *   raw  : https://resource.data.one.gov.hk/td/traffic-detectors/rawSpeedVol-all.xml   （每 30 秒）
 *   info : https://static.data.gov.hk/td/traffic-data-strategic-major-roads/info/traffic_speed_volume_occ_info.csv
 *
 * 為什麼要自己 parse：feed 只有 detector_id 同車速，路名同方向在 CSV 的 Road_TC 欄，
 * 而 Road_TC 其實是「屯門公路近麗城花園一期停車場 - 東行」這種位置描述。
 * 所以用前綴比對路名、用結尾的「－東行／西行」取出方向，再分別聚合。
 */

export const ROAD_DEFS = [
  { id: 'tuenmun', name: '屯門公路', test: (location) => location.startsWith('屯門公路') },
  { id: 'yuenlong', name: '元朗公路', test: (location) => location.startsWith('元朗公路') },
  { id: 'castle', name: '青山公路', test: (location) => location.startsWith('青山公路') },
  { id: 'tailam', name: '大欖隧道', test: (location) => location.includes('大欖隧道') },
];

const DIRECTION_PATTERN = /[-–]\s*(東行|西行|南行|北行)\s*(?:\(\d+\))?\s*$/;

export function parseDirection(location) {
  const match = DIRECTION_PATTERN.exec(location.trim());
  return match ? match[1] : '';
}

/**
 * CSV：AID_ID_Number,District,Road_EN,Road_TC,Road_SC,Easting,Northing,Latitude,Longitude,Direction,Rotation
 * 以逗號硬切會怕路名含逗號，所以由右邊倒數第 6 個欄位之前都當成名字的一部分。
 */
export function parseDetectorInfoCsv(csv) {
  const map = new Map();
  const lines = csv.split(/\r?\n/);
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) continue;
    const parts = line.split(',');
    if (parts.length < 11) continue;
    const id = parts[0].trim();
    const extra = parts.length - 11;
    const location = parts.slice(3, 4 + extra).join(',').trim();
    if (!id || !location) continue;
    map.set(id, { location, direction: parseDirection(location) });
  }
  return map;
}

/** raw XML → Map<detectorId, number[]>（只取 valid=Y 的車道車速） */
export function parseRawSpeedXml(xml) {
  const speeds = new Map();
  const periodMatch = /<period_to>([^<]+)<\/period_to>/.exec(xml);
  const period = periodMatch ? periodMatch[1].trim() : null;

  const blocks = xml.split('<detector>');
  for (let i = 1; i < blocks.length; i += 1) {
    const block = blocks[i];
    const idMatch = /<detector_id>([^<]+)<\/detector_id>/.exec(block);
    if (!idMatch) continue;
    const id = idMatch[1].trim();

    const values = [];
    for (const lane of block.split('<lane>').slice(1)) {
      const speed = /<speed>([^<]*)<\/speed>/.exec(lane);
      const valid = /<valid>([^<]*)<\/valid>/.exec(lane);
      if (!speed || !valid || valid[1].trim() !== 'Y') continue;
      const value = Number(speed[1]);
      if (Number.isFinite(value) && value > 0) values.push(value);
    }

    if (values.length > 0) {
      const existing = speeds.get(id);
      if (existing) existing.push(...values);
      else speeds.set(id, values);
    }
  }

  return { period, speeds };
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * 每條路：先計每個探測器的車道平均，再平均所有探測器。
 * 同時按方向（東行／西行／南行／北行）分組，避免兩個方向互相抵銷。
 */
export function aggregateSpeeds(defs, detectorLocations, detectorSpeeds) {
  const out = {};

  for (const def of defs) {
    const overall = [];
    const byDirection = new Map();

    for (const [id, info] of detectorLocations) {
      if (!def.test(info.location)) continue;
      const values = detectorSpeeds.get(id);
      if (!values || values.length === 0) continue;

      const mean = average(values);
      overall.push(mean);

      const key = info.direction || '未標方向';
      const bucket = byDirection.get(key);
      if (bucket) bucket.push(mean);
      else byDirection.set(key, [mean]);
    }

    if (overall.length === 0) {
      out[def.id] = { name: def.name, kmh: null, detectors: 0, dirs: [] };
      continue;
    }

    const dirs = [...byDirection.entries()]
      .map(([dir, values]) => ({
        dir,
        kmh: Math.round(average(values) * 10) / 10,
        detectors: values.length,
      }))
      .sort((a, b) => a.kmh - b.kmh);

    out[def.id] = {
      name: def.name,
      kmh: Math.round(average(overall) * 10) / 10,
      detectors: overall.length,
      dirs,
    };
  }

  return out;
}
