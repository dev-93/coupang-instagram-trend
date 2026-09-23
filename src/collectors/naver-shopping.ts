import type { ClassifiedTrend, ShoppingSignal } from '../types.js';
import { scoring } from '../config/rules.js';

export const NAVER_ENDPOINT = 'https://naverapihub.apigw.ntruss.com/shopping/v1/category/keywords';

type NaverResult = {
  title: string;
  keyword: string[];
  data: { period: string; ratio: number }[];
};

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function shoppingWindow(reportDate: string): { startDate: string; endDate: string } {
  return {
    startDate: shiftDate(reportDate, -(scoring.recentDays + scoring.priorDays)),
    endDate: shiftDate(reportDate, -1)
  };
}

export function summarizeShopping(
  keyword: string,
  categoryCode: string,
  startDate: string,
  endDate: string,
  data: NaverResult['data']
): ShoppingSignal {
  const values = new Map(data.map((point) => [point.period, point.ratio]));
  const days = scoring.recentDays + scoring.priorDays;
  const series = Array.from({ length: days }, (_, index) => values.get(shiftDate(startDate, index)));
  const complete = series.every((value) => typeof value === 'number' && Number.isFinite(value));
  if (!complete) {
    return { keyword, categoryCode, startDate, endDate, recentAverage: 0, priorAverage: 0, changePercent: null, dataPoints: data.length, status: 'no_data' };
  }

  const numeric = series as number[];
  const priorAverage = numeric.slice(0, scoring.priorDays).reduce((a, b) => a + b, 0) / scoring.priorDays;
  const recentAverage = numeric.slice(scoring.priorDays).reduce((a, b) => a + b, 0) / scoring.recentDays;
  const changePercent = priorAverage > 0 ? Math.round((recentAverage / priorAverage - 1) * 100) : null;
  const status = recentAverage === 0 && priorAverage === 0 ? 'no_data'
    : priorAverage === 0 ? 'rising'
    : changePercent! >= 10 ? 'rising'
    : changePercent! <= -10 ? 'falling' : 'flat';
  return {
    keyword, categoryCode, startDate, endDate,
    recentAverage: Math.round(recentAverage * 100) / 100,
    priorAverage: Math.round(priorAverage * 100) / 100,
    changePercent, dataPoints: data.length, status
  };
}

export async function collectNaverShopping(
  trends: ClassifiedTrend[],
  reportDate: string,
  credentials: { id: string; secret: string }
): Promise<Map<string, ShoppingSignal>> {
  const { startDate, endDate } = shoppingWindow(reportDate);
  const byCategory = new Map<string, ClassifiedTrend[]>();
  for (const trend of trends) {
    const existing = byCategory.get(trend.categoryCode) ?? [];
    existing.push(trend);
    byCategory.set(trend.categoryCode, existing);
  }

  const signals = new Map<string, ShoppingSignal>();
  for (const [categoryCode, categoryTrends] of byCategory) {
    for (let offset = 0; offset < categoryTrends.length; offset += 5) {
      const batch = categoryTrends.slice(offset, offset + 5);
      const response = await fetch(NAVER_ENDPOINT, {
        method: 'POST',
        headers: {
          'X-NCP-APIGW-API-KEY-ID': credentials.id,
          'X-NCP-APIGW-API-KEY': credentials.secret,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          startDate, endDate, timeUnit: 'date', category: categoryCode,
          keyword: batch.map((trend) => ({ name: trend.keyword, param: [trend.keyword] }))
        }),
        signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) {
        throw new Error(`NAVER API HUB 요청 실패: HTTP ${response.status}. API HUB 키와 쇼핑인사이트 권한을 확인하세요.`);
      }
      const body = await response.json() as { results?: NaverResult[] };
      if (!Array.isArray(body.results)) throw new Error('NAVER API HUB 응답에 results 배열이 없습니다.');
      for (const trend of batch) {
        const result = body.results.find((entry) => entry.title === trend.keyword);
        const data = Array.isArray(result?.data) ? result.data : [];
        signals.set(trend.keyword, summarizeShopping(trend.keyword, categoryCode, startDate, endDate, data));
      }
    }
  }
  return signals;
}
