const fs = require('fs');
const path = require('path');

function readGeoJson(filename) {
  try {
    const filePath = path.join(process.cwd(), 'public', 'data', filename);
    if (!fs.existsSync(filePath)) return { type: 'FeatureCollection', features: [] };
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    return { type: 'FeatureCollection', features: [] };
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const solar = readGeoJson('official-solar-power.geojson');
  const wind = readGeoJson('official-wind-power.geojson');
  const geo = readGeoJson('official-geothermal-power.geojson');
  const subs = readGeoJson('official-power-substations.geojson');
  const lines = readGeoJson('official-power-lines.geojson');
  const ports = readGeoJson('official-ports.geojson');
  const thsr = readGeoJson('official-thsr-complete.geojson');
  const rail = readGeoJson('official-rail.geojson');
  const highways = readGeoJson('official-highways.geojson');
  const offshoreAirports = readGeoJson('official-airports-offshore.geojson');

  const sumMw = (fc) =>
    fc.features.reduce((acc, f) => acc + (Number(f.properties?.capacity_mw) || 0), 0);

  const solarMw = Number(sumMw(solar).toFixed(2));
  const windMw = Number(sumMw(wind).toFixed(2));
  const geoMw = Number(sumMw(geo).toFixed(2));

  const commercialPorts = ports.features.filter(f => f.properties?.category === 'commercial_port').length;
  const industrialPorts = ports.features.filter(f => f.properties?.category === 'industrial_port').length;
  const ehvSubs = subs.features.filter(f => f.properties?.voltage_tier === '345kV').length;

  // 本島國際航空貨運樞紐與空海聯運走廊（補齊離島航空站之外的本島關鍵貨運節點）
  const mainIslandAirCorridors = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          id: 'AIR_TPE',
          name: '桃園國際機場與航空城貨運園區',
          category: 'air_cargo_hub',
          cargo: '半導體晶圓、High-NA EUV 設備、AI 伺服器（2025 輸美 860 億美元）',
          status: '全台最大航空貨運樞紐（高負載運作）'
        },
        geometry: { type: 'Point', coordinates: [121.2328, 25.0777] }
      },
      {
        type: 'Feature',
        properties: {
          id: 'AIR_TSA',
          name: '臺北松山機場（商務與冷鏈快遞樞紐）',
          category: 'air_cargo_hub',
          cargo: '精密儀器、生鮮冷鏈與區域商務航線',
          status: '正常營運'
        },
        geometry: { type: 'Point', coordinates: [121.5519, 25.0697] }
      },
      {
        type: 'Feature',
        properties: {
          id: 'AIR_RMQ',
          name: '臺中清泉崗機場（中部精密機械與中科空運門戶）',
          category: 'air_cargo_hub',
          cargo: '精密機械零組件、光學與半導體耗材',
          status: '正常營運'
        },
        geometry: { type: 'Point', coordinates: [120.6206, 24.2647] }
      },
      {
        type: 'Feature',
        properties: {
          id: 'AIR_KHH',
          name: '高雄小港國際機場（南部 S 廊帶空運門戶）',
          category: 'air_cargo_hub',
          cargo: '南科晶圓、封測材料、高階農產冷鏈',
          status: '正常營運'
        },
        geometry: { type: 'Point', coordinates: [120.3499, 22.5771] }
      },
      {
        type: 'Feature',
        properties: {
          id: 'CORRIDOR_HSP_TPE',
          name: '竹科－桃園航空城半導體空運走廊',
          category: 'air_freight_line',
          cargo: '先進製程晶圓與 AI 伺服器空運幹線',
          status: '高優先級物流走廊'
        },
        geometry: { type: 'LineString', coordinates: [[121.0055, 24.7818], [121.2328, 25.0777]] }
      },
      {
        type: 'Feature',
        properties: {
          id: 'CORRIDOR_STSP_KHH',
          name: '嘉科／南科－高雄港與小港機場雙港聯運走廊',
          category: 'maritime_freight_line',
          cargo: 'CoWoS 先進封裝機台、出口貨櫃與特用化學品',
          status: '尖峰負荷'
        },
        geometry: { type: 'LineString', coordinates: [[120.2850, 23.4620], [120.2735, 23.1095], [120.3499, 22.5771], [120.2865, 22.6175]] }
      },
      {
        type: 'Feature',
        properties: {
          id: 'CORRIDOR_WEST_SEA',
          name: '西海岸商港與 LNG 能源海運幹線（基隆－臺北－臺中－安平－高雄）',
          category: 'maritime_freight_line',
          cargo: '重件設備、貨櫃航線與 LNG 天然氣補給生命線',
          status: '監控海事兵險與 LNG 11 天存量'
        },
        geometry: {
          type: 'LineString',
          coordinates: [
            [121.7557, 25.1490],
            [121.3916, 25.1536],
            [120.5108, 24.2713],
            [120.1668, 22.9709],
            [120.2664, 22.6163]
          ]
        }
      }
    ]
  };

  res.status(200).json({
    status: 'ok',
    system: 'taiwan-infra-v10.1-intelligence',
    updated_at: new Date().toISOString(),
    metrics: {
      transport: {
        thsr_length_km: 352.2,
        thsr_stations: 12,
        tra_segments: rail.features.length,
        highway_segments: highways.features.length,
        commercial_ports: commercialPorts,
        industrial_ports: industrialPorts,
        total_ports: ports.features.length,
        offshore_airports: offshoreAirports.features.length,
        main_island_air_hubs: 4
      },
      power_and_energy: {
        substations_total: subs.features.length,
        ehv_345kv_substations: ehvSubs,
        transmission_lines_total: lines.features.length,
        solar_sites: solar.features.length,
        solar_capacity_mw: solarMw,
        wind_sites: wind.features.length,
        wind_capacity_mw: windMw,
        geothermal_sites: geo.features.length,
        geothermal_capacity_mw: geoMw,
        total_renewable_mw: Number((solarMw + windMw + geoMw).toFixed(2))
      }
    },
    air_and_maritime_corridors: mainIslandAirCorridors
  });
};
