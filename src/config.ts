/**
 * ⚙️ 全站設定檔 —— 想改嘢，改呢個檔案就夠。
 *
 * 這裡集中了：
 *   1. 車站清單（屯馬綫 / 輕鐵）同附近巴士站
 *   2. 道路清單、路名比對規則、各路的代表性限速
 *   3. 車速分級門檻、資料刷新間隔、Proxy 位址
 *   4. 地區關鍵詞（決定邊啲交通消息算「同你有關」）
 *
 * 改完之後跑 `pnpm check`（型別 + 測試 + build），再 `pnpm build` 出 dist。
 * 注意：Worker 有自己的白名單（worker/src/index.js 的 TML_STATIONS），加站時兩邊都要改。
 */

/* ------------------------------------------------------------------ 基本 */

export const APP = {
  /** 顯示名稱，會出現在標題同 PWA。 */
  name: '香港交通警報中心',
  version: '2.4',
  /** 自訂 Worker 位址；留空就用預設。亦可以用 .env.local 的 VITE_PROXY_BASE 覆蓋。 */
  proxyBase: 'https://hk-traffic-super-proxy.idyl-2014061.workers.dev',
} as const;

/** 各資料源的輪詢間隔（毫秒）。數字越細越即時，但上游負載越高。 */
export const REFRESH_MS = {
  tml: 30_000,
  lrt: 30_000,
  bus: 60_000,
  roads: 60_000,
  traffic: 45_000,
  weather: 120_000,
} as const;

/** 車速分級：實測車速 ÷ 該路限速。 */
export const SPEED_THRESHOLDS = {
  /** ≥ 85% 當暢順 */
  smooth: 0.85,
  /** ≥ 60% 當緩慢；低於就當擠塞 */
  slow: 0.6,
  /** 兩個方向相差超過呢個比例，就標明邊個方向較慢 */
  directionSpread: 0.8,
} as const;

/* ------------------------------------------------------------------ 車站 */

/**
 * 屯馬綫（前西鐵綫）。`lat` / `lon` 用於「最近車站」同 GPS 自動選站。
 * 座標來源：OpenStreetMap 的 MTR 站號（`ref` = TIS / YUL …）stop_position。
 *
 * 加站步驟：
 *   1. 在這裡加一項
 *   2. 在 worker/src/index.js 的 TML_STATIONS Set 加同一個 code
 *   3. 跑 `pnpm check`
 */
export const TML_STATIONS = [
  { code: 'TIS', name: '天水圍', lat: 22.4579, lon: 113.9997 },
  { code: 'LOP', name: '朗屏', lat: 22.4447, lon: 114.0343 },
  { code: 'YUL', name: '元朗', lat: 22.446, lon: 114.0352 },
  { code: 'SIH', name: '兆康', lat: 22.4118, lon: 113.9789 },
  { code: 'TUM', name: '屯門', lat: 22.3947, lon: 113.973 },
] as const;

/**
 * 輕鐵站。`station` 係 MTR 的 station_id（API 用），`name` 係顯示名，
 * `routes` 係要顯示的路線白名單（避免列出該站全部路線），
 * `bus` 係附近九巴站（id 為九巴 16 位站號，meters 為直線距離）。
 *
 * 加站步驟：同上，但 worker 唔需要改（輕鐵走 /mtr?url= 通用端點）。
 */
export const LRT_GROUPS = [
  {
    station: '001',
    name: '屯門碼頭',
    area: '屯門',
    routes: ['507', '610', '614', '614P', '615', '615P'],
    lat: 22.3725605,
    lon: 113.9664784,
    bus: [
      { id: '722B3DD3D7BCFA21', name: '屯門碼頭(兆禧苑) (TM633)', meters: 64 },
      { id: 'E3E171AEDE35ACDF', name: '屯門碼頭總站 (TM882a)', meters: 25 },
    ],
  },
  {
    station: '010',
    name: '美樂',
    area: '屯門',
    routes: ['610', '615', '615P'],
    lat: 22.375073,
    lon: 113.9611989,
    bus: [
      { id: 'B651E2A39CD4CC05', name: '蝴蝶灣 (TM670)', meters: 213 },
      { id: '0221966C1116C4EC', name: '蝴蝶灣 (TM437)', meters: 256 },
    ],
  },
  {
    station: '015',
    name: '蝴蝶',
    area: '屯門',
    routes: ['610', '615', '615P'],
    lat: 22.378144,
    lon: 113.9617393,
    bus: [
      { id: 'F734736F35F459DC', name: '蝴蝶站 (TM672)', meters: 9 },
      { id: '78644FF7E8B7BBA0', name: '兆山苑柳景閣 (TM436)', meters: 28 },
    ],
  },
  {
    station: '020',
    name: '輕鐵車廠',
    area: '屯門',
    routes: ['610', '615', '615P'],
    lat: 22.381827,
    lon: 113.9633725,
    bus: [
      { id: '3FAE59A79C8BCC93', name: '新屯門中心 (TM673)', meters: 4 },
      { id: '83A02749D0CB2EE8', name: '新屯門中心 (TM434)', meters: 50 },
    ],
  },
  {
    station: '030',
    name: '龍門',
    area: '屯門',
    routes: ['610', '615', '615P'],
    lat: 22.3852664,
    lon: 113.9650361,
    bus: [
      { id: 'A1D3216AF158C117', name: '龍門站 (TM676)', meters: 40 },
      { id: 'C6D5DEF91CB7B581', name: '龍門站 (TM677)', meters: 25 },
    ],
  },
  {
    station: '040',
    name: '青山村',
    area: '屯門',
    routes: ['610', '615', '615P'],
    lat: 22.3906423,
    lon: 113.9671443,
    bus: [
      { id: '854E787D0F56BF91', name: '聖彼得堂 (TM593)', meters: 175 },
      { id: '1F5BF0C69F30C752', name: '青雲站 (TM590)', meters: 340 },
    ],
  },
  {
    station: '050',
    name: '青雲',
    area: '屯門',
    routes: ['610', '615', '615P'],
    lat: 22.3943554,
    lon: 113.9674614,
    bus: [
      { id: '1F5BF0C69F30C752', name: '青雲站 (TM590)', meters: 87 },
      { id: '854E787D0F56BF91', name: '聖彼得堂 (TM593)', meters: 254 },
    ],
  },
  {
    station: '060',
    name: '建安',
    area: '屯門',
    routes: ['505'],
    lat: 22.3951744,
    lon: 113.9689004,
    bus: [
      { id: '1F5BF0C69F30C752', name: '青雲站 (TM590)', meters: 204 },
      { id: '9E1FC92F86D2F4E3', name: '鳴琴站 (TM186)', meters: 222 },
    ],
  },
  {
    station: '070',
    name: '河田',
    area: '屯門',
    routes: ['507', '751'],
    lat: 22.3971066,
    lon: 113.9730527,
    bus: [
      { id: '79D68EE7C6CBAB9D', name: '屯門站總站 (TM954)', meters: 237 },
      { id: 'D74B67D55C63895F', name: '屯門站總站 (TM953)', meters: 240 },
    ],
  },
  {
    station: '075',
    name: '蔡意橋',
    area: '屯門',
    routes: ['507', '751'],
    lat: 22.4000751,
    lon: 113.9743456,
    bus: [
      { id: 'BC301D7E7F063331', name: '新墟街市 (TM132)', meters: 262 },
      { id: 'EB64718829DFC071', name: '台山小學 (TM472)', meters: 293 },
    ],
  },
  {
    station: '080',
    name: '澤豐',
    area: '屯門',
    routes: ['610', '751'],
    lat: 22.4035304,
    lon: 113.9758783,
    bus: [
      { id: 'CBE54DB551C24A02', name: '紅橋 (TM133)', meters: 179 },
      { id: 'D9B82EE66AFF2975', name: '紅橋 (TM134)', meters: 170 },
    ],
  },
  {
    station: '090',
    name: '屯門醫院',
    area: '屯門',
    routes: ['610', '751'],
    lat: 22.4078234,
    lon: 113.9771509,
    bus: [
      { id: '0FB4AEA370913FD2', name: '屯門醫院(鳳地站) (TM248)', meters: 176 },
      { id: 'F224A907BD68406A', name: '兆康苑兆賢閣 (TM530)', meters: 268 },
    ],
  },
  {
    station: '100',
    name: '兆康',
    area: '屯門',
    routes: ['505', '610', '614', '614P', '615', '615P', '751'],
    lat: 22.4120102,
    lon: 113.9782711,
    bus: [
      { id: '12CF2025741EF844', name: '麒麟圍 (TM485)', meters: 233 },
      { id: '50DC968C90CE7CF4', name: '兆康站(南) (TM910)', meters: 184 },
    ],
  },
  {
    station: '110',
    name: '麒麟',
    area: '屯門',
    routes: ['505', '615P'],
    lat: 22.4107151,
    lon: 113.9764566,
    bus: [
      { id: '12CF2025741EF844', name: '麒麟圍 (TM485)', meters: 3 },
      { id: 'F224A907BD68406A', name: '兆康苑兆賢閣 (TM530)', meters: 61 },
    ],
  },
  {
    station: '120',
    name: '青松',
    area: '屯門',
    routes: ['505', '615', '615P'],
    lat: 22.4073257,
    lon: 113.972571,
    bus: [
      { id: 'EDF4C2EAFDBD4693', name: '大興警署 (TM550)', meters: 212 },
      { id: '629D4E7DD9EF1AC6', name: '大興體育館 (TM554)', meters: 355 },
    ],
  },
  {
    station: '130',
    name: '建生',
    area: '屯門',
    routes: ['505', '615', '615P'],
    lat: 22.4067647,
    lon: 113.9691969,
    bus: [
      { id: 'ECE3F3BE270C27E2', name: '寶怡花園 (TM478)', meters: 182 },
      { id: 'EDF4C2EAFDBD4693', name: '大興警署 (TM550)', meters: 187 },
    ],
  },
  {
    station: '140',
    name: '田景',
    area: '屯門',
    routes: ['505', '507', '615', '615P'],
    lat: 22.4077765,
    lon: 113.9663998,
    bus: [
      { id: '840532B7C95DF870', name: '兆邦苑 (TM382)', meters: 83 },
      { id: '594A765BE3A43C73', name: '寶田轉車站 - 盈豐園 (TM580)', meters: 91 },
    ],
  },
  {
    station: '150',
    name: '良景',
    area: '屯門',
    routes: ['505', '507', '615', '615P'],
    lat: 22.4066682,
    lon: 113.9635777,
    bus: [
      { id: '542CC0EC83BAEA01', name: '新圍苑 (TM380)', meters: 156 },
      { id: 'BA72A994EEF9FABE', name: '新圍苑 (TM381)', meters: 160 },
    ],
  },
  {
    station: '160',
    name: '新圍',
    area: '屯門',
    routes: ['505', '507', '615', '615P'],
    lat: 22.4052485,
    lon: 113.9644776,
    bus: [
      { id: '1F6BFDF34BABCE6A', name: '田景邨田裕樓 (TM540)', meters: 35 },
      { id: '542CC0EC83BAEA01', name: '新圍苑 (TM380)', meters: 37 },
    ],
  },
  {
    station: '170',
    name: '石排',
    area: '屯門',
    routes: ['505', '610', '615', '615P'],
    lat: 22.401419,
    lon: 113.9677604,
    bus: [
      { id: '6AE148CA74FC4D53', name: '大興街 (TM572)', meters: 91 },
      { id: 'C192BEF2264E0CC6', name: '石排站 (TM188)', meters: 56 },
    ],
  },
  {
    station: '180',
    name: '山景',
    area: '屯門',
    routes: ['505'],
    lat: 22.3984818,
    lon: 113.9666501,
    bus: [
      { id: '6AE148CA74FC4D53', name: '大興街 (TM572)', meters: 307 },
      { id: 'B3CCA98CC6CE7C8C', name: '鳴琴站 (TM585)', meters: 177 },
    ],
  },
  {
    station: '190',
    name: '山景',
    area: '屯門',
    routes: ['505'],
    lat: 22.3966939,
    lon: 113.9660529,
    bus: [
      { id: 'F4D9335688592803', name: '鳴琴站 (TM185)', meters: 135 },
      { id: 'B3CCA98CC6CE7C8C', name: '鳴琴站 (TM585)', meters: 160 },
    ],
  },
  {
    station: '200',
    name: '鳴琴',
    area: '屯門',
    routes: ['505', '610', '615', '615P'],
    lat: 22.3971502,
    lon: 113.9672954,
    bus: [
      { id: 'B3CCA98CC6CE7C8C', name: '鳴琴站 (TM585)', meters: 25 },
      { id: 'F4D9335688592803', name: '鳴琴站 (TM185)', meters: 56 },
    ],
  },
  {
    station: '212',
    name: '大興',
    area: '屯門',
    routes: ['507', '610'],
    lat: 22.4045507,
    lon: 113.9700954,
    bus: [
      { id: 'F7BE579A89615965', name: '建生邨樂生樓 (TM561)', meters: 142 },
      { id: '78B537644BD4FE00', name: '建生邨樂生樓 (TM376)', meters: 113 },
    ],
  },
  {
    station: '220',
    name: '大興',
    area: '屯門',
    routes: ['507', '610'],
    lat: 22.4027459,
    lon: 113.9719901,
    bus: [
      { id: 'EB64718829DFC071', name: '台山小學 (TM472)', meters: 167 },
      { id: '92A8D40E66E76F6B', name: '大興體育館 (TM476)', meters: 97 },
    ],
  },
  {
    station: '230',
    name: '銀圍',
    area: '屯門',
    routes: ['507', '610'],
    lat: 22.4025158,
    lon: 113.9746126,
    bus: [
      { id: 'CBE54DB551C24A02', name: '紅橋 (TM133)', meters: 262 },
      { id: 'D9B82EE66AFF2975', name: '紅橋 (TM134)', meters: 264 },
    ],
  },
  {
    station: '240',
    name: '兆禧',
    area: '屯門',
    routes: ['507', '614', '614P'],
    lat: 22.3752391,
    lon: 113.9668753,
    bus: [
      { id: '216AEF6F6541ECF1', name: '湖景邨湖畔樓 (TM646)', meters: 143 },
      { id: '4B6D9BB197225DBE', name: '湖景邨湖畔樓 (TM645)', meters: 143 },
    ],
  },
  {
    station: '250',
    name: '海皇路',
    area: '屯門',
    routes: ['507', '614', '614P'],
    lat: 22.3812061,
    lon: 113.9703786,
    bus: [
      { id: 'F69B2B317BEB37A3', name: '御海灣 (TM682)', meters: 100 },
      { id: '320704B87EF998D4', name: '御海灣 (TM423)', meters: 29 },
    ],
  },
  {
    station: '260',
    name: '豐景園',
    area: '屯門',
    routes: ['507', '614', '614P'],
    lat: 22.3833066,
    lon: 113.973042,
    bus: [
      { id: '64312A5DFF11636C', name: '豐景園 (TM156)', meters: 81 },
      { id: 'CB2A65E69B2B71BE', name: '翠寧花園 (TM157)', meters: 157 },
    ],
  },
  {
    station: '265',
    name: '兆麟',
    area: '屯門',
    routes: ['505', '507', '614', '614P'],
    lat: 22.3845824,
    lon: 113.9750384,
    bus: [
      { id: 'CB2A65E69B2B71BE', name: '翠寧花園 (TM157)', meters: 98 },
      { id: '07B714029E91FD81', name: '兆麟苑 (TM614)', meters: 51 },
    ],
  },
  {
    station: '270',
    name: '安定',
    area: '屯門',
    routes: ['505', '507', '614', '614P', '751'],
    lat: 22.3876044,
    lon: 113.9751,
    bus: [
      { id: '59081A58EA5BC728', name: '友愛邨 (TM162)', meters: 26 },
      { id: '4D02E857ADDE8AAF', name: '友愛邨 (TM163)', meters: 31 },
    ],
  },
  {
    station: '275',
    name: '友愛',
    area: '屯門',
    routes: ['751'],
    lat: 22.3866677,
    lon: 113.9735606,
    bus: [
      { id: '59081A58EA5BC728', name: '友愛邨 (TM162)', meters: 206 },
      { id: '4D02E857ADDE8AAF', name: '友愛邨 (TM163)', meters: 209 },
    ],
  },
  {
    station: '280',
    name: '市中心',
    area: '屯門',
    routes: ['505', '507', '614', '614P', '751'],
    lat: 22.3913803,
    lon: 113.974973,
    bus: [
      { id: 'C1BF4509359B0895', name: '屯門市中心總站 (TM976)', meters: 62 },
      { id: '5D14B75687F60509', name: '屯門公園 (TM167)', meters: 84 },
    ],
  },
  {
    station: '295',
    name: '屯門',
    area: '屯門',
    routes: ['505', '507', '751'],
    lat: 22.3938221,
    lon: 113.973107,
    bus: [
      { id: '79D68EE7C6CBAB9D', name: '屯門站總站 (TM954)', meters: 156 },
      { id: 'D74B67D55C63895F', name: '屯門站總站 (TM953)', meters: 132 },
    ],
  },
  {
    station: '300',
    name: '杯渡',
    area: '屯門',
    routes: ['614', '614P'],
    lat: 22.3946674,
    lon: 113.9767232,
    bus: [
      { id: 'F269ACD809D1B43E', name: '何福堂書院 (TM297)', meters: 175 },
      { id: '8121695666A4D9CE', name: '屯門屯仁街 (TM718)', meters: 65 },
    ],
  },
  {
    station: '310',
    name: '何福堂',
    area: '屯門',
    routes: ['614', '614P'],
    lat: 22.397437,
    lon: 113.9774708,
    bus: [
      { id: '642F7D358D36F715', name: '新圍仔 (TM296)', meters: 7 },
      { id: 'F269ACD809D1B43E', name: '何福堂書院 (TM297)', meters: 169 },
    ],
  },
  {
    station: '320',
    name: '新墟',
    area: '屯門',
    routes: ['614', '614P'],
    lat: 22.4002799,
    lon: 113.978045,
    bus: [
      { id: 'BC301D7E7F063331', name: '新墟街市 (TM132)', meters: 222 },
      { id: '6D9EB45795E40B40', name: '庇護工場 (TM244)', meters: 187 },
    ],
  },
  {
    station: '330',
    name: '景峰',
    area: '屯門',
    routes: ['614', '614P'],
    lat: 22.4031239,
    lon: 113.9795382,
    bus: [
      { id: '02824AAFC038FA20', name: '景峰花園 (TM246)', meters: 41 },
      { id: 'FA553D19AD960A9B', name: '景峰花園 (TM294)', meters: 24 },
    ],
  },
  {
    station: '340',
    name: '鳳地',
    area: '屯門',
    routes: ['614', '614P'],
    lat: 22.4067811,
    lon: 113.9788053,
    bus: [
      { id: '0FB4AEA370913FD2', name: '屯門醫院(鳳地站) (TM248)', meters: 31 },
      { id: '876057D899CE09C9', name: '彩暉花園 (TM293)', meters: 227 },
    ],
  },
  {
    station: '350',
    name: '藍地',
    area: '屯門',
    routes: ['610', '614', '615', '751'],
    lat: 22.4186987,
    lon: 113.981894,
    bus: [
      { id: '46D1A9FD1F84CA5C', name: '藍地站 (TM284)', meters: 58 },
      { id: '7FE552E3792C9047', name: '藍地站 (TM340)', meters: 60 },
    ],
  },
  {
    station: '360',
    name: '泥圍',
    area: '屯門',
    routes: ['610', '614', '615', '751'],
    lat: 22.4238581,
    lon: 113.9866093,
    bus: [
      { id: 'A1541789F09C89BA', name: '泥圍 (TM277)', meters: 49 },
      { id: '468DB19F9ECA7507', name: '泥圍站 (TM344)', meters: 58 },
    ],
  },
  {
    station: '370',
    name: '鍾屋村',
    area: '屯門',
    routes: ['610', '614', '615', '751'],
    lat: 22.4296975,
    lon: 113.9922331,
    bus: [
      { id: 'F1A6B3410C090751', name: '鍾屋村站 (TM348)', meters: 9 },
      { id: '92A09EC9B712A1ED', name: '鍾屋村站 (TM273)', meters: 47 },
    ],
  },
  {
    station: '380',
    name: '洪水橋',
    area: '天水圍',
    routes: ['610', '614', '615', '751'],
    lat: 22.4336604,
    lon: 113.9974787,
    bus: [
      { id: '0BFC5F7FC4A2D431', name: '洪水橋站 (YL350)', meters: 40 },
      { id: '8FA8E142E834CB7C', name: '洪水橋站 (YL270)', meters: 42 },
    ],
  },
  {
    station: '390',
    name: '塘坊村',
    area: '天水圍',
    routes: ['610', '614', '615', '761P'],
    lat: 22.4402476,
    lon: 114.0074215,
    bus: [
      { id: 'B88640E0CA83F12C', name: '塘坊村站 (YL354)', meters: 76 },
      { id: '147D513A708AA741', name: '灰沙圍 (YL353)', meters: 261 },
    ],
  },
  {
    station: '400',
    name: '屏山',
    area: '天水圍',
    routes: ['610', '614', '615', '761P'],
    lat: 22.44288,
    lon: 114.012039,
    bus: [
      { id: 'A8482B15AD6E89A3', name: '屏山 (YL355)', meters: 14 },
      { id: 'A1A1B10F5CE291AC', name: '朗天苑朗松閣 (YL263)', meters: 244 },
    ],
  },
  {
    station: '425',
    name: '坑尾村',
    area: '天水圍',
    routes: ['751', '761P'],
    lat: 22.4451439,
    lon: 114.0056157,
    bus: [
      { id: '71C5FC4FF2FDE0CA', name: '天水圍站 (YL614)', meters: 317 },
      { id: 'EF0567DCF0D20204', name: '天水圍站 (YL613)', meters: 320 },
    ],
  },
  {
    station: '430',
    name: '天水圍',
    area: '天水圍',
    routes: ['705', '706', '751'],
    lat: 22.4493998,
    lon: 114.0060435,
    bus: [
      { id: 'A264A7BA921EEE6E', name: '聚星樓 (TN201)', meters: 58 },
      { id: 'C20316E552E64387', name: '天祐苑 (TN593)', meters: 124 },
    ],
  },
  {
    station: '435',
    name: '天慈',
    area: '天水圍',
    routes: ['705', '706', '751'],
    lat: 22.4527805,
    lon: 114.006033,
    bus: [
      { id: '1D202282C0A82F12', name: '天耀邨耀豐樓 (TN230)', meters: 32 },
      { id: '021872C0E263AC46', name: '天慈邨 (TN604)', meters: 39 },
    ],
  },
  {
    station: '445',
    name: '天耀',
    area: '天水圍',
    routes: ['705', '706', '761P'],
    lat: 22.4503875,
    lon: 114.0027686,
    bus: [
      { id: 'ABE1BADF8D43CB24', name: '天盛苑 (TN206)', meters: 100 },
      { id: 'CB853E4BCBB13F30', name: '天耀邨耀民樓 (TN582)', meters: 91 },
    ],
  },
  {
    station: '448',
    name: '樂湖',
    area: '天水圍',
    routes: ['705', '706', '761P'],
    lat: 22.453036,
    lon: 114.0011415,
    bus: [
      { id: '6A90A40248059768', name: '賞湖居 (TN210)', meters: 108 },
      { id: '7898B605E39613A8', name: '天耀邨耀盛樓 (TN571)', meters: 132 },
    ],
  },
  {
    station: '450',
    name: '天湖',
    area: '天水圍',
    routes: ['705', '706', '751'],
    lat: 22.4549666,
    lon: 114.0057041,
    bus: [
      { id: '021872C0E263AC46', name: '天慈邨 (TN604)', meters: 215 },
      { id: '1D202282C0A82F12', name: '天耀邨耀豐樓 (TN230)', meters: 215 },
    ],
  },
  {
    station: '455',
    name: '銀座',
    area: '天水圍',
    routes: ['705', '706', '751'],
    lat: 22.4575312,
    lon: 114.0049838,
    bus: [
      { id: 'D813C93D9AD1C45B', name: '景湖居 (TN240)', meters: 137 },
      { id: 'A4607B71730E8F46', name: '景湖居 (TN602)', meters: 69 },
    ],
  },
  {
    station: '460',
    name: '天瑞',
    area: '天水圍',
    routes: ['705', '706', '761P'],
    lat: 22.4559333,
    lon: 113.9993735,
    bus: [
      { id: 'FBBF4EB577663A13', name: '天瑞邨 (TN223)', meters: 111 },
      { id: '080EF1BEA737A5D3', name: '天瑞邨 (TN508)', meters: 55 },
    ],
  },
  {
    station: '468',
    name: '頌富',
    area: '天水圍',
    routes: ['705', '706', '751', '761P'],
    lat: 22.4620072,
    lon: 113.9969877,
    bus: [
      { id: 'A00D00FC2F4F8400', name: '天頌苑 (TN504)', meters: 101 },
      { id: '67D80F37744E1277', name: '天頌苑 (TN505)', meters: 142 },
    ],
  },
  {
    station: '480',
    name: '天富',
    area: '天水圍',
    routes: ['705', '706', '751', '761P'],
    lat: 22.4645618,
    lon: 113.9976633,
    bus: [
      { id: '8D56DB404D264D5A', name: '天富苑欣富閣 (TN503)', meters: 27 },
      { id: '73FE2D32F218DA9C', name: '天恩邨 (TN226)', meters: 57 },
    ],
  },
  {
    station: '490',
    name: '翠湖',
    area: '天水圍',
    routes: ['751'],
    lat: 22.4596928,
    lon: 113.9996008,
    bus: [
      { id: 'B10F5697E4DA810B', name: '天頌苑頌棋閣 (TN271)', meters: 246 },
      { id: '5498C13EB8685C46', name: '天華邨 (TN224)', meters: 265 },
    ],
  },
  {
    station: '500',
    name: '天榮',
    area: '天水圍',
    routes: ['705', '706', '751'],
    lat: 22.4596764,
    lon: 114.0023185,
    bus: [
      { id: 'AA92A3F2775F4F69', name: '天水圍市中心 (TN945)', meters: 168 },
      { id: '0AE307AC4840B867', name: '天水圍市中心 (TN940)', meters: 168 },
    ],
  },
  {
    station: '510',
    name: '天悅',
    area: '天水圍',
    routes: ['705', '706'],
    lat: 22.4627134,
    lon: 114.0016156,
    bus: [
      { id: '308112BE50081258', name: '香港青年協會李兆基書院 (TN533)', meters: 260 },
      { id: 'FE801C732EC6EA42', name: '天晴邨晴彩樓 (TN552)', meters: 113 },
    ],
  },
  {
    station: '520',
    name: '天秀',
    area: '天水圍',
    routes: ['705', '706'],
    lat: 22.4655398,
    lon: 114.0029634,
    bus: [
      { id: '6D4E7B9D5F9584E7', name: '天晴邨晴雲樓 (TN252)', meters: 228 },
      { id: 'A6C169DA579FC45B', name: '慧景軒 (TN530)', meters: 212 },
    ],
  },
  {
    station: '530',
    name: '濕地公園',
    area: '天水圍',
    routes: ['705', '706'],
    lat: 22.4695484,
    lon: 114.0025345,
    bus: [
      { id: '42AEF6365E78DA56', name: '香港濕地公園 (TN402)', meters: 5 },
      { id: '4C86E1F44AE9C25B', name: '香港濕地公園 (TN300)', meters: 43 },
    ],
  },
  {
    station: '540',
    name: '天恒',
    area: '天水圍',
    routes: ['705', '706'],
    lat: 22.4697292,
    lon: 114.0007557,
    bus: [
      { id: '8753A8442C2FFF53', name: '天逸邨逸潭樓 (TN501)', meters: 187 },
      { id: '42AEF6365E78DA56', name: '香港濕地公園 (TN402)', meters: 189 },
    ],
  },
  {
    station: '550',
    name: '天逸',
    area: '天水圍',
    routes: ['705', '706', '751', '761P'],
    lat: 22.4668889,
    lon: 113.9990556,
    bus: [
      { id: 'A264255E81F51111', name: '天澤邨 (TN229)', meters: 138 },
      { id: '8753A8442C2FFF53', name: '天逸邨逸潭樓 (TN501)', meters: 183 },
    ],
  },
  {
    station: '560',
    name: '水邊圍',
    area: '元朗',
    routes: ['610', '614', '615', '761P'],
    lat: 22.4444798,
    lon: 114.0202344,
    bus: [
      { id: 'A010FE2C473103A8', name: '水邊村 (YL259)', meters: 115 },
      { id: '70FEB409760C77EE', name: '元朗公園 (YL261)', meters: 146 },
    ],
  },
  {
    station: '570',
    name: '豐年路',
    area: '元朗',
    routes: ['610', '614', '615', '761P'],
    lat: 22.4445292,
    lon: 114.0238504,
    bus: [
      { id: '6E85D42922E5A10C', name: '元朗廣場 (YL360)', meters: 22 },
      { id: '1B0FD9C27F5FE0BE', name: '元朗警署 (YL258)', meters: 14 },
    ],
  },
  {
    station: '580',
    name: '康樂路',
    area: '元朗',
    routes: ['610', '614', '615', '761P'],
    lat: 22.4445043,
    lon: 114.0269401,
    bus: [
      { id: 'D9CE618F99BAC2B6', name: '元朗康樂路 (YL254)', meters: 88 },
      { id: '43E5D3A445382F82', name: '元朗大棠路 (YL252)', meters: 133 },
    ],
  },
  {
    station: '590',
    name: '大棠路',
    area: '元朗',
    routes: ['610', '614', '615', '761P'],
    lat: 22.4444678,
    lon: 114.0295529,
    bus: [
      { id: 'D54B0CA58FE5559D', name: '元朗同樂街 (YL372)', meters: 120 },
      { id: '445B2A02DB891CA9', name: '元朗谷亭街 (YL375)', meters: 92 },
    ],
  },
  {
    station: '600',
    name: '元朗',
    area: '元朗',
    routes: ['610', '614', '615', '761P'],
    lat: 22.4456518,
    lon: 114.0346405,
    bus: [
      { id: '0C943B7308FF4DCC', name: '形點 II (YL390)', meters: 131 },
      { id: '723EF8D7809D3ADB', name: '形點 II (YL392)', meters: 122 },
    ],
  },
  {
    station: '920',
    name: '三聖',
    area: '屯門',
    routes: ['505'],
    lat: 22.3825172,
    lon: 113.9766734,
    bus: [
      { id: 'C90375A74B02D2E8', name: '三聖邨 (TM304)', meters: 236 },
      { id: '2659CEA57836F600', name: '恒福花園 (TM420)', meters: 43 },
    ],
  },
] as const;

/* ------------------------------------------------------------------ 道路 */

/**
 * 主要道路。
 *   `patterns` 用於比對運輸署交通消息（只比對消息內文，唔代表車速）
 *   `limit` 係該路的代表性限速（km/h），用於「實測 ÷ 限速」分級
 *
 * 限速來源：運輸署「道路網絡（第二代）－ 車速限制」KML，用探測器座標做最近路段
 * 空間匹配後取眾數（括號內為分佈）。一條路可能有多段不同限速，這裡只取代表值，
 * UI 會顯示所用限速，所以誤差係睇得見的。
 */
export const ROADS = [
  {
    id: 'tuenmun',
    name: '屯門公路',
    patterns: [/屯門公路/, /Tuen Mun Road/i],
    limit: 70, // 75 個探測器：70 ×52、80 ×23
  },
  {
    id: 'yuenlong',
    name: '元朗公路',
    patterns: [/元朗公路/, /Yuen Long Highway/i],
    limit: 80, // 36 個：80 ×33、70 ×2、100 ×1
  },
  {
    id: 'castle',
    name: '青山公路',
    patterns: [/青山公路/, /Castle Peak Road/i],
    limit: 70, // 28 個：70 ×16、80 ×12
  },
  {
    id: 'tailam',
    name: '大欖隧道',
    patterns: [/大欖隧道/, /Tai Lam Tunnel/i],
    limit: 80, // 只有 2 個探測器：80 / 70 各一
  },
] as const;

/* ------------------------------------------------------------------ 地區 */

/** 決定「與屯元天有關」的關鍵詞。 */
export const DISTRICT_KEYWORDS = [
  '屯門',
  '元朗',
  '天水圍',
  '朗屏',
  '兆康',
  '洪水橋',
  '青山公路',
  '大欖',
] as const;

/** 「現已解封」之類的好消息：唔彈窗、唔推送。 */
export const REOPENED_PATTERNS = [/已解封/, /解封/, /恢復通車/, /重開/, /現已開放/, /re-?opened/i, /cleared/i] as const;
