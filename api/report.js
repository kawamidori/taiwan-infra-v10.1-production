const fs = require('fs');
const path = require('path');

function readJson(filename) {
  try {
    const p = path.join(process.cwd(), 'public', 'data', filename);
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : null;
  } catch (e) {
    return null;
  }
}

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const osint = readJson('osint-intelligence.geojson') || { features: [] };
  const solar = readJson('official-solar-power.geojson') || { features: [] };
  const wind = readJson('official-wind-power.geojson') || { features: [] };
  const geo = readJson('official-geothermal-power.geojson') || { features: [] };
  const subs = readJson('official-power-substations.geojson') || { features: [] };
  const lines = readJson('official-power-lines.geojson') || { features: [] };
  const ports = readJson('official-ports.geojson') || { features: [] };

  const features = osint.features || [];
  const ledgerCounts = { '企業資本支出': 0, '公共基建支出': 0, '生活成本外溢': 0, '環境與民生外溢': 0 };
  features.forEach(f => {
    const axis = f.properties?.ledger_axis || '公共基建支出';
    ledgerCounts[axis] = (ledgerCounts[axis] || 0) + 1;
  });

  const sumMw = (fc) => fc.features.reduce((a, f) => a + (Number(f.properties?.capacity_mw) || 0), 0).toFixed(2);
  const today = new Date().toISOString().split('T')[0];

  const reportLines = [
    `# 台灣關鍵基礎建設、電力海空運與半導體空間情報分析報告（v10.1）`,
    `產出日期：${today} ｜ 納入智庫與多源情報：${features.length} 筆`,
    ``,
    `## 一、 全臺關鍵基建與電力交通實測盤點`,
    `- **高壓電網與變電設施**：全臺共納入 ${subs.features.length} 座變電所（含 345kV 超高壓變電所）與 ${lines.features.length} 段輸電幹線。`,
    `- **再生能源裝置容量**：太陽光電 ${solar.features.length} 站（${sumMw(solar)} MW）、風力發電 ${wind.features.length} 站（${sumMw(wind)} MW）、地熱發電 ${geo.features.length} 站（${sumMw(geo)} MW）。`,
    `- **海空運與軌道動脈**：台灣高鐵 352.2 km（12 站）、全臺 ${ports.features.length} 座商港／工業港／漁港，以及桃園航空城與離島航空站網絡。`,
    ``,
    `## 二、 三維外溢帳本事件分布`,
    `- **企業資本支出（CapEx）**：${ledgerCounts['企業資本支出']} 筆`,
    `- **公共基建支出（水電／海空運／LNG）**：${ledgerCounts['公共基建支出']} 筆`,
    `- **城市擴張與生活成本外溢**：${ledgerCounts['生活成本外溢']} 筆`,
    `- **環境污染與居住品質外溢**：${ledgerCounts['環境與民生外溢']} 筆`,
    ``,
    `## 三、 空間節點與智庫／公報情報對位明細`,
    `| 空間節點 | 周邊影響城鎮 | 帳本維度 | 情報標題與空間分析 |`,
    `| :--- | :--- | :--- | :--- |`,
    ...features.map(f => {
      const p = f.properties || {};
      return `| ${p.target_node || '全臺'} | ${p.surrounding_towns || '-'} | ${p.ledger_axis || '-'} | **${p.title || '無標題'}**：${p.snippet || ''} |`;
    })
  ];

  const markdownContent = reportLines.join('\n');
  if (req.query.format === 'json') {
    return res.status(200).json({ generated_at: today, ledger_summary: ledgerCounts, markdown: markdownContent });
  }

  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="Taiwan_Spatial_Report_${today}.md"`);
  return res.status(200).send(markdownContent);
};
