import assert from 'node:assert/strict';
import test from 'node:test';
import { parseGoogleRss } from '../src/collectors/google-trends.js';
import { collectNaverShopping, NAVER_ENDPOINT, shoppingWindow, summarizeShopping } from '../src/collectors/naver-shopping.js';
import { classifyTrend } from '../src/filters/keyword-filter.js';
import { mergeCandidatePool } from '../src/scoring/candidate-pool.js';
import { scoreCandidate, scoreShopping } from '../src/scoring/scorer.js';
import { naverCredentials } from '../src/config/env.js';
import type { ClassifiedTrend, ShoppingKeyword, ShoppingSignal, Trend } from '../src/types.js';

test('Google RSS의 키워드, 표시 트래픽, 뉴스 문맥을 읽는다', () => {
  const xml = `<?xml version="1.0"?><rss><channel><item>
    <title>에어프라이어</title><ht:approx_traffic>2,000+</ht:approx_traffic>
    <pubDate>Tue, 22 Sep 2026 23:50:00 -0700</pubDate>
    <ht:news_item><ht:news_item_title>주방 가전 인기</ht:news_item_title></ht:news_item>
  </item></channel></rss>`;
  assert.deepEqual(parseGoogleRss(xml).map(({ keyword, approxTraffic, newsTitles }) => ({ keyword, approxTraffic, newsTitles })), [
    { keyword: '에어프라이어', approxTraffic: 2000, newsTitles: ['주방 가전 인기'] }
  ]);
});

test('제품 키워드라도 일회성 뉴스 문맥이면 제외한다', () => {
  const trend: Trend = {
    keyword: '삼성 냉장고 업데이트', approxTraffic: 500,
    publishedAt: '2026-09-23T06:00:00.000Z', newsTitles: [], url: 'example'
  };
  assert.match(classifyTrend(trend).reason ?? '', /뉴스/);
  assert.equal(classifyTrend({ ...trend, keyword: '에어프라이어' }).value?.category, '디지털/가전');
  assert.equal(classifyTrend({ ...trend, keyword: '낯선주제' }).review, true);
});

test('쇼핑 점수는 같은 기간의 상대 비율에서 최근 3일과 이전 7일을 비교한다', () => {
  const { startDate, endDate } = shoppingWindow('2026-09-23');
  assert.equal(startDate, '2026-09-13');
  assert.equal(endDate, '2026-09-22');
  const data = Array.from({ length: 10 }, (_, index) => ({
    period: `2026-09-${String(13 + index).padStart(2, '0')}`,
    ratio: index < 7 ? 30 : 60
  }));
  const signal = summarizeShopping('에어프라이어', '50000003', startDate, endDate, data);
  assert.equal(signal.changePercent, 100);
  assert.equal(signal.status, 'rising');
  assert.equal(scoreShopping(signal), 100);
  assert.equal(summarizeShopping('에어프라이어', '50000003', startDate, endDate, data.slice(1)).status, 'no_data');
});

test('네이버 API HUB에 공식 경로·인증 헤더·키워드 배열을 전송한다', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls += 1;
    assert.equal(input, NAVER_ENDPOINT);
    assert.equal(init?.method, 'POST');
    assert.equal((init?.headers as Record<string, string>)['X-NCP-APIGW-API-KEY-ID'], 'test-id');
    assert.equal((init?.headers as Record<string, string>)['X-NCP-APIGW-API-KEY'], 'test-secret');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.category, '50000003');
    assert.equal(body.keyword.length, 2);
    assert.deepEqual(body.keyword[0], { name: '에어프라이어', param: ['에어프라이어'] });
    return new Response(JSON.stringify({ results: body.keyword.map((item: { name: string }) => ({
      title: item.name, keyword: [item.name], data: []
    })) }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const base: ShoppingKeyword = {
      keyword: '에어프라이어', category: '디지털/가전', categoryCode: '50000003',
      productFitScore: 80, contentFitScore: 75
    };
    const signals = await collectNaverShopping([base, { ...base, keyword: '냉장고' }], '2026-09-23', { id: 'test-id', secret: 'test-secret' });
    assert.equal(calls, 1);
    assert.equal(signals.size, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Google 후보가 없어도 네이버 독립 키워드가 후보가 된다', () => {
  const seed: ShoppingKeyword = {
    keyword: '양념 소불고기', category: '식품', categoryCode: '50000006',
    productFitScore: 85, contentFitScore: 85
  };
  const signal: ShoppingSignal = {
    keyword: seed.keyword, categoryCode: seed.categoryCode,
    startDate: '2026-09-14', endDate: '2026-09-23',
    recentAverage: 60, priorAverage: 40, changePercent: 50, dataPoints: 10, status: 'rising'
  };
  const pool = mergeCandidatePool([], [], [seed], new Map([[seed.keyword, signal]]));
  assert.equal(pool.inputs.length, 1);
  assert.equal(pool.naverWithData, 1);
  const candidate = scoreCandidate(pool.inputs[0], new Date('2026-09-24T06:00:00Z'));
  assert.equal(candidate.google, null);
  assert.equal(candidate.scores.trendScore, null);
  assert.notEqual(candidate.scores.shoppingScore, null);
  assert.equal(candidate.keyword, seed.keyword);
});

test('두 출처에서 같은 키워드가 나오면 한 후보에 신호를 합친다', () => {
  const trend: ClassifiedTrend = {
    keyword: '에어프라이어', category: '디지털/가전', categoryCode: '50000003',
    productFitScore: 80, contentFitScore: 75,
    approxTraffic: 2000, publishedAt: '2026-09-24T04:00:00Z', newsTitles: [], url: 'google-url'
  };
  const seed: ShoppingKeyword = {
    keyword: '에어프라이어', category: trend.category, categoryCode: trend.categoryCode,
    productFitScore: trend.productFitScore, contentFitScore: trend.contentFitScore
  };
  const signal: ShoppingSignal = {
    keyword: seed.keyword, categoryCode: seed.categoryCode,
    startDate: '2026-09-14', endDate: '2026-09-23',
    recentAverage: 50, priorAverage: 50, changePercent: 0, dataPoints: 10, status: 'flat'
  };
  const pool = mergeCandidatePool([trend], [], [seed], new Map([[seed.keyword, signal]]));
  assert.equal(pool.inputs.length, 1);
  const candidate = scoreCandidate(pool.inputs[0], new Date('2026-09-24T06:00:00Z'));
  assert.notEqual(candidate.google, null);
  assert.notEqual(candidate.shopping, null);
  assert.notEqual(candidate.scores.trendScore, null);
  assert.notEqual(candidate.scores.shoppingScore, null);
});

test('네이버 추이 날짜가 부족해도 Google 후보는 유지된다', () => {
  const trend: ClassifiedTrend = {
    keyword: '에어프라이어', category: '디지털/가전', categoryCode: '50000003',
    productFitScore: 80, contentFitScore: 75,
    approxTraffic: 2000, publishedAt: '2026-09-24T04:00:00Z', newsTitles: [], url: 'google-url'
  };
  const seed: ShoppingKeyword = {
    keyword: trend.keyword, category: trend.category, categoryCode: trend.categoryCode,
    productFitScore: trend.productFitScore, contentFitScore: trend.contentFitScore
  };
  const signal: ShoppingSignal = {
    keyword: seed.keyword, categoryCode: seed.categoryCode,
    startDate: '2026-09-14', endDate: '2026-09-23',
    recentAverage: 0, priorAverage: 0, changePercent: null, dataPoints: 8, status: 'no_data'
  };
  const pool = mergeCandidatePool([trend], [], [seed], new Map([[seed.keyword, signal]]));
  assert.deepEqual(pool.naverNoData, [{ keyword: seed.keyword, dataPoints: 8 }]);
  assert.equal(pool.inputs.length, 1);
  const candidate = scoreCandidate(pool.inputs[0], new Date('2026-09-24T06:00:00Z'));
  assert.notEqual(candidate.google, null);
  assert.equal(candidate.shopping, null);
  assert.equal(candidate.scores.shoppingScore, null);
});

test('problem-radar의 NAVER 환경변수 이름과 기존 안내 이름을 인식한다', () => {
  const previous = {
    id: process.env.NAVER_CLIENT_ID, secret: process.env.NAVER_CLIENT_SECRET,
    hubId: process.env.NAVER_API_HUB_CLIENT_ID, hubSecret: process.env.NAVER_API_HUB_CLIENT_SECRET
  };
  try {
    process.env.NAVER_CLIENT_ID = 'existing-id';
    process.env.NAVER_CLIENT_SECRET = 'existing-secret';
    assert.deepEqual(naverCredentials(), { id: 'existing-id', secret: 'existing-secret' });
    process.env.NAVER_CLIENT_ID = '';
    process.env.NAVER_CLIENT_SECRET = '';
    process.env.NAVER_API_HUB_CLIENT_ID = 'hub-id';
    process.env.NAVER_API_HUB_CLIENT_SECRET = 'hub-secret';
    assert.deepEqual(naverCredentials(), { id: 'hub-id', secret: 'hub-secret' });
  } finally {
    for (const [name, value] of [
      ['NAVER_CLIENT_ID', previous.id], ['NAVER_CLIENT_SECRET', previous.secret],
      ['NAVER_API_HUB_CLIENT_ID', previous.hubId], ['NAVER_API_HUB_CLIENT_SECRET', previous.hubSecret]
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
