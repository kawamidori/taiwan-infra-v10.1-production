#!/usr/bin/env python3
"""
台灣關鍵基礎建設與半導體空間情報管線 (OSINT + 行政院公報 + PDF 半自動化萃取)
- 可直接在 Google Colab 執行（將 PDF 放在工作目錄或 reports_inbox/ 內）
- 亦可透過 GitHub Actions 每日自動排程更新 public/data/osint-intelligence.geojson
"""
import os, glob, json, re
from datetime import datetime
import feedparser
from pypdf import PdfReader

OUT_GEOJSON = 'public/data/osint-intelligence.geojson' if os.path.exists('public/data') else 'osint-intelligence.geojson'
OUT_LEDGER = 'public/data/spillover-ledger.json' if os.path.exists('public/data') else 'spillover-ledger.json'

SPATIAL_GAZETTEER = [
    {'node': '嘉義科學園區（台積電預定地）', 'towns': '嘉義縣太保市、朴子市、水上鄉', 'lat': 23.4620, 'lon': 120.2850, 'keywords': ['嘉義', '太保', '朴子', '嘉科', 'CoWoS']},
    {'node': '竹科新竹園區（含寶山擴建）', 'towns': '新竹市東區、新竹縣寶山鄉、竹北市', 'lat': 24.7818, 'lon': 121.0055, 'keywords': ['竹科', '新竹', '寶山', '竹北', '2奈米', 'Hsinchu']},
    {'node': '中科臺中園區', 'towns': '臺中市西屯區、大雅區、沙鹿區', 'lat': 24.2125, 'lon': 120.6185, 'keywords': ['中科', '臺中', '台中', '大雅', '西屯', 'Taichung']},
    {'node': '南科臺南園區', 'towns': '臺南市新市區、善化區、安定區', 'lat': 23.1095, 'lon': 120.2735, 'keywords': ['南科', '臺南', '台南', '善化', '新市', '安平', 'Tainan']},
    {'node': '南科楠梓園區（台積電高雄廠）', 'towns': '高雄市楠梓區、左營區、橋頭區', 'lat': 22.7125, 'lon': 120.3125, 'keywords': ['楠梓', '高雄廠', '橋頭', '仁武', '高雄', 'Kaohsiung']},
    {'node': '桃園航空城', 'towns': '桃園市大園區、蘆竹區、中壢區', 'lat': 25.0760, 'lon': 121.2280, 'keywords': ['桃園', '航空城', '桃園機場', '大園', '空運', 'Taoyuan']},
    {'node': '高雄港（永安／洲際LNG與商港）', 'towns': '高雄市永安區、鼓山區、前鎮區', 'lat': 22.8150, 'lon': 120.2050, 'keywords': ['永安', '高雄港', 'LNG', '天然氣', 'Yongan']},
    {'node': '花蓮港與花東縱谷', 'towns': '花蓮縣花蓮市、光復鄉、新城鄉', 'lat': 23.9910, 'lon': 121.6260, 'keywords': ['花蓮', '光復', '太魯閣', 'Hualien', 'Guangfu']}
]

TOPIC_RULES = [
    {'category': '半導體與企業CapEx', 'ledger': '企業資本支出', 'color': '#EF4444', 'words': ['台積電', '半導體', '晶片', '封裝', '擴廠', '投資', 'TSMC', 'chip', 'semiconductor']},
    {'category': '公共基建與水電能源', 'ledger': '公共基建支出', 'color': '#3B82F6', 'words': ['再生水', '海淡', '電網', '變電所', '能源', '貨運', 'LNG', '天然氣', '高鐵', 'insurance']},
    {'category': '城市擴張與居住成本', 'ledger': '生活成本外溢', 'color': '#F59E0B', 'words': ['房價', '租金', '居住成本', '重劃區', '都計', '社宅', '徵收', 'tourism']},
    {'category': '環境污染與生活品質', 'ledger': '環境與民生外溢', 'color': '#10B981', 'words': ['污染', '空污', '環評', '碳排', '廢水', '生活品質', '地震', 'water']}
]

def classify_text(text, source_type, title, url=''):
    geo = next((g for g in SPATIAL_GAZETTEER if any(k.lower() in text.lower() for k in g['keywords'])), None)
    if not geo:
        return None
    topic = next((r for r in TOPIC_RULES if any(w.lower() in text.lower() for w in r['words'])), TOPIC_RULES[1])
    money = re.search(r'(\d+(?:\.\d+)?)\s*(兆|億|billion|million)', text, re.I)
    budget_label = money.group(0) if money else ('公報政策公告' if source_type == '政府公報' else '空間情報追蹤')
    return {
        "type": "Feature",
        "properties": {
            "title": title[:80],
            "short_note": f"[{topic['ledger']}] {title[:24]}",
            "source_type": source_type,
            "topic_category": topic['category'],
            "ledger_axis": topic['ledger'],
            "marker_hex": topic['color'],
            "target_node": geo['node'],
            "surrounding_towns": geo['towns'],
            "capex_or_budget": budget_label,
            "heat_weight": 3.8 if source_type == 'PDF實驗報告' else 3.0,
            "snippet": text[:160].replace('\n', ' ') + '...',
            "url": url,
            "ingested_at": datetime.now().strftime('%Y-%m-%d')
        },
        "geometry": {"type": "Point", "coordinates": [geo['lon'], geo['lat']]}
    }

def run_pipeline():
    features = []
    if os.path.exists(OUT_GEOJSON):
        with open(OUT_GEOJSON, 'r', encoding='utf-8') as f:
            features = json.load(f).get('features', [])
    seen = {feat['properties'].get('title') for feat in features}

    # 1. 抓取國內外新聞與行政院公報 RSS
    rss_sources = [
        ('新聞RSS', 'https://news.google.com/rss/search?q=台灣+半導體+科學園區+OR+再生水+OR+房價&hl=zh-TW&gl=TW&ceid=TW:zh-Hant'),
        ('政府公報', 'https://news.google.com/rss/search?q=site:gazette.nat.gov.tw+科學園區+OR+都市計畫+OR+環境影響&hl=zh-TW&gl=TW&ceid=TW:zh-Hant')
    ]
    for src_type, url in rss_sources:
        try:
            feed = feedparser.parse(url)
            for entry in feed.entries[:20]:
                t = entry.get('title', '').strip()
                if not t or t in seen:
                    continue
                feat = classify_text(f"{t} {entry.get('summary', '')}", src_type, t, entry.get('link', ''))
                if feat:
                    seen.add(t)
                    features.append(feat)
        except Exception as e:
            print(f"RSS 略過 ({src_type}): {e}")

    # 2. 半自動化 PDF 實驗管線（掃描 reports_inbox/*.pdf 與根目錄 *.pdf）
    pdf_paths = sorted(set(glob.glob('reports_inbox/*.pdf') + glob.glob('*.pdf')))
    for pdf_path in pdf_paths:
        try:
            reader = PdfReader(pdf_path)
            for p_idx, page in enumerate(reader.pages[:25], 1):
                txt = page.extract_text() or ''
                title = f"{os.path.basename(pdf_path)} (P.{p_idx})"
                if title in seen or len(txt.strip()) < 40:
                    continue
                feat = classify_text(txt, 'PDF實驗報告', title, pdf_path)
                if feat:
                    seen.add(title)
                    features.append(feat)
        except Exception as e:
            print(f"PDF 解析略過 ({pdf_path}): {e}")

    # 3. 寫回 GeoJSON 與三維帳本彙總
    with open(OUT_GEOJSON, 'w', encoding='utf-8') as f:
        json.dump({"type": "FeatureCollection", "features": features}, f, ensure_ascii=False, indent=2)

    ledger = {}
    for feat in features:
        p = feat['properties']
        key = f"{p['target_node']} ({p['surrounding_towns']})"
        ledger.setdefault(key, {'企業資本支出': 0, '公共基建支出': 0, '生活成本外溢': 0, '環境與民生外溢': 0})
        ledger[key][p['ledger_axis']] = ledger[key].get(p['ledger_axis'], 0) + 1

    with open(OUT_LEDGER, 'w', encoding='utf-8') as f:
        json.dump(ledger, f, ensure_ascii=False, indent=2)

    print(f"✅ 管線執行完成！共輸出 {len(features)} 筆情報至 {OUT_GEOJSON}")

if __name__ == '__main__':
    run_pipeline()
