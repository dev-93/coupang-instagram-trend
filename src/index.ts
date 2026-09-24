import 'dotenv/config';
import { collectGoogleTrends, GOOGLE_RSS_URL } from './collectors/google-trends.js';
import { collectNaverShopping, NAVER_ENDPOINT } from './collectors/naver-shopping.js';
import { classifyTrend } from './filters/keyword-filter.js';
import { scoreCandidate } from './scoring/scorer.js';
import { keywordKey, mergeCandidatePool } from './scoring/candidate-pool.js';
import { scoring } from './config/rules.js';
import { naverKeywords } from './config/naver-keywords.js';
import { naverCredentials } from './config/env.js';
import { saveNotionReport } from './report/notion.js';
import type { ClassifiedTrend, Report, ShoppingSignal, Trend } from './types.js';

function koreanDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

async function main(): Promise<void> {
  const notionToken = process.env.NOTION_TOKEN?.trim();
  if (!notionToken) throw new Error('NOTION_TOKEN이 없습니다. 프로젝트 .env에 Notion 연동 토큰을 입력하세요.');
  const now = new Date();
  const date = koreanDate(now);
  const credentials = naverCredentials();
  const googleTask = collectGoogleTrends();
  const naverTask: Promise<Map<string, ShoppingSignal>> = naverKeywords.length === 0
    ? Promise.resolve(new Map())
    : !credentials.id || !credentials.secret
      ? Promise.reject(new Error('NAVER API HUB 인증정보가 없습니다. 프로젝트 .env에 Client ID/Secret을 입력하세요.'))
      : collectNaverShopping(naverKeywords, date, credentials);
  const [googleResult, naverResult] = await Promise.allSettled([googleTask, naverTask]);
  const googleError = googleResult.status === 'rejected' ? String(googleResult.reason) : null;
  const naverError = naverResult.status === 'rejected' ? String(naverResult.reason) : null;
  if (googleError && naverError) throw new Error(`Google과 Naver 수집이 모두 실패했습니다. Google: ${googleError}; Naver: ${naverError}`);
  const trends = googleResult.status === 'fulfilled' ? googleResult.value : [];
  const shopping = naverResult.status === 'fulfilled' ? naverResult.value : new Map<string, ShoppingSignal>();
  const queriedNaverKeywords = naverResult.status === 'fulfilled' ? naverKeywords : [];
  const googleCandidates: ClassifiedTrend[] = [];
  const googleReview: Trend[] = [];
  const excluded: Report['excluded'] = [];
  const seen = new Set<string>();
  for (const trend of trends) {
    const key = keywordKey(trend.keyword);
    if (seen.has(key)) continue;
    seen.add(key);
    const result = classifyTrend(trend);
    if (result.value) googleCandidates.push(result.value);
    else if (result.review) googleReview.push(trend);
    else excluded.push({ keyword: trend.keyword, source: 'Google', reason: result.reason ?? '분류 불가' });
  }

  const pool = mergeCandidatePool(googleCandidates, googleReview, queriedNaverKeywords, shopping);
  const review: Report['review'] = googleReview
    .filter((trend) => !pool.promotedReview.has(keywordKey(trend.keyword)))
    .map((trend) => ({
      keyword: trend.keyword, approxTraffic: trend.approxTraffic,
      publishedAt: trend.publishedAt, newsTitles: trend.newsTitles,
      reason: '상품 카테고리 미분류 — 사람 확인 필요'
    }));
  for (const item of pool.naverNoData) {
    excluded.push({ keyword: item.keyword, source: 'Naver', reason: `쇼핑 클릭 추이 데이터 부족 (${item.dataPoints}/${scoring.recentDays + scoring.priorDays}일 관측)` });
  }
  const candidates = pool.inputs.flatMap((input) => {
    const candidate = scoreCandidate(input, now);
    if (candidate.scores.totalScore < scoring.minimumTotalScore) {
      excluded.push({ keyword: input.keyword, source: '점수', reason: `점수 기준 ${scoring.minimumTotalScore}점 미달` });
      return [];
    }
    return [candidate];
  });
  candidates.sort((a, b) => b.scores.totalScore - a.scores.totalScore || (b.scores.shoppingScore ?? -1) - (a.scores.shoppingScore ?? -1));
  const top10 = candidates.slice(0, 10).map((candidate, index) => ({ ...candidate, rank: index + 1 }));
  const notes = [
    'Google 공식 RSS에는 최근 항목 일부만 제공되므로, 후보가 10개 미만일 수 있습니다.',
    '네이버 상품 키워드는 Google RSS와 무관하게 설정 목록에서 조회합니다. 이 API가 상품 키워드를 자동 발견하지는 않습니다.',
    '한쪽 출처만 있는 후보의 빈 점수는 0으로 처리하지 않고, 있는 신호의 가중치로 총점을 재계산했습니다.',
    '카테고리와 적합성 점수는 수정 가능한 키워드 규칙에 따른 가설입니다.'
  ];
  if (googleError) notes.push(`Google 수집 실패: ${googleError}`);
  if (naverError) notes.push(`Naver 조회 실패: ${naverError}`);
  if (pool.naverWithData > 0 && ![...shopping.values()].some((signal) => signal.status === 'rising')) {
    notes.push('이번 실행의 네이버 감시 키워드에는 최근 3일 상승 판정이 없습니다. TOP 3는 상승 상품 확정이 아닙니다.');
  }
  const report: Report = {
    date, generatedAt: now.toISOString(), timezone: 'Asia/Seoul',
    sources: { google: GOOGLE_RSS_URL, naver: NAVER_ENDPOINT },
    counts: {
      googleCollected: trends.length, googleEligible: googleCandidates.length, googleReview: review.length,
      naverQueried: queriedNaverKeywords.length, naverWithData: pool.naverWithData, ranked: top10.length
    },
    top3: top10.slice(0, 3), top10, review, excluded, notes
  };
  const result = await saveNotionReport(report, notionToken);
  console.log(`Google ${trends.length}개(상품 후보 ${googleCandidates.length}개) + Naver 독립 조회 ${queriedNaverKeywords.length}개(추이 확보 ${pool.naverWithData}개) → 최종 ${top10.length}개`);
  console.log(`Notion 실행기록: ${result.runUrl}`);
  console.log(`Notion TOP 3 후보: ${result.top3Saved}개`);
  if (googleError || naverError) {
    console.error(`일부 수집 실패: ${[googleError, naverError].filter(Boolean).join(' · ')}`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
