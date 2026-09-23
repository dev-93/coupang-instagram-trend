import 'dotenv/config';
import { collectGoogleTrends, GOOGLE_RSS_URL } from './collectors/google-trends.js';
import { collectNaverShopping, NAVER_ENDPOINT } from './collectors/naver-shopping.js';
import { classifyTrend } from './filters/keyword-filter.js';
import { scoreCandidate } from './scoring/scorer.js';
import { scoring } from './config/rules.js';
import { naverCredentials } from './config/env.js';
import { saveNotionReport } from './report/notion.js';
import type { ClassifiedTrend, Report } from './types.js';

function koreanDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

async function main(): Promise<void> {
  const notionToken = process.env.NOTION_TOKEN?.trim();
  if (!notionToken) throw new Error('NOTION_TOKEN이 없습니다. 프로젝트 .env에 Notion 연동 토큰을 입력하세요.');
  const now = new Date();
  const date = koreanDate(now);
  const trends = await collectGoogleTrends();
  const eligible: ClassifiedTrend[] = [];
  const excluded: Report['excluded'] = [];
  const review: Report['review'] = [];
  const seen = new Set<string>();
  for (const trend of trends) {
    if (seen.has(trend.keyword)) continue;
    seen.add(trend.keyword);
    const result = classifyTrend(trend);
    if (result.value) eligible.push(result.value);
    else if (result.review) review.push({
      keyword: trend.keyword, approxTraffic: trend.approxTraffic,
      publishedAt: trend.publishedAt, newsTitles: trend.newsTitles,
      reason: result.reason ?? '사람 확인 필요'
    });
    else excluded.push({ keyword: trend.keyword, reason: result.reason ?? '분류 불가' });
  }

  const credentials = naverCredentials();
  if (eligible.length && (!credentials.id || !credentials.secret)) {
    throw new Error('쇼핑 후보가 있지만 NAVER API HUB 인증정보가 없습니다. 프로젝트 .env에 Client ID/Secret을 입력하세요.');
  }
  const shopping = eligible.length ? await collectNaverShopping(eligible, date, credentials) : new Map();
  const candidates = eligible.flatMap((trend) => {
    const signal = shopping.get(trend.keyword);
    if (!signal) return [];
    if (signal.status === 'no_data') {
      excluded.push({ keyword: trend.keyword, reason: '네이버 쇼핑 클릭 추이 데이터 부족' });
      return [];
    }
    const candidate = scoreCandidate(trend, signal, now);
    if (candidate.scores.totalScore < scoring.minimumTotalScore) {
      excluded.push({ keyword: trend.keyword, reason: `점수 기준 ${scoring.minimumTotalScore}점 미달` });
      return [];
    }
    return [candidate];
  });
  candidates.sort((a, b) => b.scores.totalScore - a.scores.totalScore || b.scores.shoppingScore - a.scores.shoppingScore);
  const top10 = candidates.slice(0, 10).map((candidate, index) => ({ ...candidate, rank: index + 1 }));
  const notes = [
    'Google 공식 RSS에는 최근 항목 일부만 제공되므로, 후보가 10개 미만일 수 있습니다.',
    '카테고리와 적합성 점수는 수정 가능한 키워드 규칙에 따른 가설입니다.'
  ];
  if (eligible.length === 0) notes.push('상품 카테고리가 매칭된 키워드가 없어 NAVER API HUB를 호출하지 않았습니다. 미분류 항목은 사람 확인 목록에 남겼습니다.');
  const report: Report = {
    date, generatedAt: now.toISOString(), timezone: 'Asia/Seoul',
    sources: { google: GOOGLE_RSS_URL, naver: NAVER_ENDPOINT },
    counts: { collected: trends.length, review: review.length, eligible: eligible.length, ranked: top10.length },
    top3: top10.slice(0, 3), top10, review, excluded, notes
  };
  const result = await saveNotionReport(report, notionToken);
  console.log(`Google ${trends.length}개 → 사람 확인 ${review.length}개 → 쇼핑 후보 ${eligible.length}개 → 최종 ${top10.length}개`);
  console.log(`Notion 실행기록: ${result.runUrl}`);
  console.log(`Notion TOP 3 후보: ${result.top3Saved}개`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
