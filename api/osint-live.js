const fs = require('fs');
const path = require('path');

const SPATIAL_GAZETTEER = [
  { node: '嘉義科學園區（台積電預定地）', towns: '太保市、朴子市', lat: 23.4620, lon: 120.2850, keywords: ['嘉義', '太保', '朴子', '嘉科', 'CoWoS'] },
  { node: '竹科新竹園區（含寶山擴建）', towns: '新竹市東區、寶山鄉、竹北市', lat: 24.7818, lon: 121.0055, keywords: ['竹科', '新竹', '寶山', '竹北', '2奈米'] },
  { node: '中科臺中園區', towns: '西屯區、大雅區、沙鹿區', lat: 24.2125, lon: 120.6185, keywords: ['中科', '臺中', '台中', '大雅', '西屯'] },
  { node: '南科臺南園區', towns: '新市區、善化區、安定區', lat: 23.1095, lon: 120.2735, keywords: ['南科', '臺南', '台南', '善化', '新市', '安平'] },
  { node: '南科楠梓園區（台積電高雄廠）', towns: '楠梓區、左營區、橋頭區', lat: 22.7125, lon: 120.3125, keywords: ['楠梓', '高雄廠', '橋頭', '仁武', '高雄'] },
  { node: '桃園航空城', towns: '大園區、蘆竹區、中壢區', lat: 25.0760, lon: 121.2280, keywords: ['桃園', '航空城', '桃園機場', '大園', '空運'] },
  { node: '花蓮港與花東縱谷', towns: '花蓮市、光復鄉、新城鄉', lat: 23.9910, lon: 121.6260, keywords: ['花蓮', '光復', '太魯閣', '蘇花'] }
];

const TOPIC_RULES = [
  { category: '半導體與企業CapEx', ledger: '企業資本支出', color: '#EF4444', words: ['台積電', '半導體', '晶片', '封裝', '擴廠', '投資', 'TSMC', 'AI'] },
  { category: '公共基建與水電能源', ledger: '公共基建支出', color: '#3B82F6', words: ['再生水', '海淡', '電網', '變電所', '能源', '貨運', 'LNG', '天然氣', '高鐵'] },
  { category: '城市擴張與居住成本', ledger: '生活成本外溢', color: '#F59E0B', words: ['房價', '租金', '居住成本', '重劃區', '都計', '社宅', '徵收'] },
  { category: '環境污染與生活品質', ledger: '環境與民生外溢', color: '#10B981', words: ['污染', '空污', '環評', '碳排', '廢水', '生活品質', '地震'] }
];

function parseRssItems(xmlText, sourceType) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xmlText)) !== null && items.length < 10) {
    const block = match[1];
    const titleMatch = block.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/);
    const linkMatch = block.match(/<link>(.*?)<\/link>/);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
    const link = linkMatch ? linkMatch[1].trim() : '';
    if (!title) continue;

    const geo = SPATIAL_GAZETTEER.find(g => g.keywords.some(k => title.includes(k)));
    if (!geo) continue;

    const topic = TOPIC_RULES.find(r => r.words.some(w => title.toLowerCase().includes(w.toLowerCase()))) || TOPIC_RULES[1];
    const jitterLon = geo.lon + ((items.length % 5) - 2) * 0.008;
    const jitterLat = geo.lat + (((items.length + 1) % 5) - 2) * 0.008;

    items.push({
      type: 'Feature',
      properties: {
        title: title.slice(0, 75),
        short_note: `${sourceType === '政府公報' ? '🏛️' : '📰'} ${geo.node.slice(0, 4)}｜${title.slice(0, 20)}...`,
        source_type: sourceType,
        topic_category: topic.category,
        ledger_axis: topic.ledger,
        marker_hex: topic.color,
        target_node: geo.node,
        surrounding_towns: geo.towns,
        capex_or_budget: sourceType === '政府公報' ? '公報政策公告' : '即時新聞追蹤',
        heat_weight: 3.2,
        snippet: title,
        url: link,
        ingested_at: new Date().toISOString().split('T')[0]
      },
      geometry: { type: 'Point', coordinates: [jitterLon, jitterLat] }
    });
  }
  return items;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
  if (req.method === 'OPTIONS') return res.status(200).end();

  let baseFeatures = [];
  try {
    const osintPath = path.join(process.cwd(), 'public', 'data', 'osint-intelligence.geojson');
    if (fs.existsSync(osintPath)) {
      baseFeatures = JSON.parse(fs.readFileSync(osintPath, 'utf-8')).features || [];
    }
  } catch (e) {}

  const liveFeatures = [];
  const feeds = [
    { type: '新聞RSS', url: 'https://news.google.com/rss/search?q=%E5%8F%B0%E7%81%A3+%E5%8D%8A%E5%B0%8E%E9%AB%94+%E7%A7%91%E5%AD%B8%E5%9C%92%E5%8D%80+OR+%E5%86%8D%E7%94%9F%E6%B0%B4+OR+%E6%88%BF%E5%83%B9&hl=zh-TW&gl=TW&ceid=TW:zh-Hant' },
    { type: '政府公報', url: 'https://news.google.com/rss/search?q=site:gazette.nat.gov.tw+%E7%A7%91%E5%AD%B8%E5%9C%92%E5%8D%80+OR+%E9%83%BD%E5%B8%82%E8%A8%88%E7%95%AB+OR+%E7%92%B0%E5%A2%83%E5%BD%B1%E9%9F%BF&hl=zh-TW&gl=TW&ceid=TW:zh-Hant' }
  ];

  await Promise.all(feeds.map(async (feed) => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      const resp = await fetch(feed.url, { signal: controller.signal });
      clearTimeout(timer);
      if (resp.ok) {
        const xml = await resp.text();
        liveFeatures.push(...parseRssItems(xml, feed.type));
      }
    } catch (e) {}
  }));

  const seen = new Set(baseFeatures.map(f => f.properties?.title));
  const merged = [...baseFeatures];
  for (const item of liveFeatures) {
    if (!seen.has(item.properties.title)) {
      seen.add(item.properties.title);
      merged.push(item);
    }
  }

  res.status(200).json({
    type: 'FeatureCollection',
    metadata: {
      total_notes: merged.length,
      pdf_records: baseFeatures.length,
      live_rss_records: merged.length - baseFeatures.length,
      updated_at: new Date().toISOString()
    },
    features: merged
  });
};
