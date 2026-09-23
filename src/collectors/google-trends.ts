import { XMLParser } from 'fast-xml-parser';
import type { Trend } from '../types.js';

export const GOOGLE_RSS_URL = 'https://trends.google.com/trending/rss?geo=KR';

const parser = new XMLParser({ ignoreAttributes: false, trimValues: true });

export function parseGoogleRss(xml: string): Trend[] {
  const parsed = parser.parse(xml);
  const rawItems = parsed?.rss?.channel?.item;
  if (!rawItems) return [];
  const items = Array.isArray(rawItems) ? rawItems : [rawItems];
  return items.flatMap((item: Record<string, unknown>) => {
    const keyword = String(item.title ?? '').trim();
    const publishedAt = new Date(String(item.pubDate ?? '')).toISOString();
    if (!keyword) return [];
    const trafficText = String(item['ht:approx_traffic'] ?? '0');
    const approxTraffic = Number(trafficText.replace(/[^\d]/g, '')) || 0;
    const rawNews = item['ht:news_item'];
    const newsItems = rawNews ? (Array.isArray(rawNews) ? rawNews : [rawNews]) : [];
    const newsTitles = newsItems.map((news: Record<string, unknown>) => String(news['ht:news_item_title'] ?? '')).filter(Boolean);
    return [{ keyword, approxTraffic, publishedAt, newsTitles, url: GOOGLE_RSS_URL }];
  });
}

export async function collectGoogleTrends(): Promise<Trend[]> {
  const response = await fetch(GOOGLE_RSS_URL, {
    headers: { 'User-Agent': 'coupang-instagram-trend/0.1 (+RSS research)' },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`Google Trends RSS 요청 실패: HTTP ${response.status}`);
  const trends = parseGoogleRss(await response.text());
  if (trends.length === 0) throw new Error('Google Trends RSS에 항목이 없습니다. 응답 형식을 확인하세요.');
  return trends;
}
