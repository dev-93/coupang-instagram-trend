import assert from 'node:assert/strict';
import test from 'node:test';
import { notionReportPayload, notionTop3Payload, saveNotionReport } from '../src/report/notion.js';
import type { Candidate, Report } from '../src/types.js';

const report: Report = {
  date: '2026-09-23', generatedAt: '2026-09-23T09:00:00.000Z', timezone: 'Asia/Seoul',
  sources: { google: 'google-url', naver: 'naver-url' },
  counts: { googleCollected: 10, googleEligible: 0, googleReview: 1, naverQueried: 6, naverWithData: 0, ranked: 0 },
  top3: [], top10: [],
  review: [{ keyword: '미분류', approxTraffic: 500, publishedAt: '2026-09-23T08:00:00.000Z', newsTitles: [], reason: '사람 확인 필요' }],
  excluded: [{ keyword: '뉴스', source: 'Google', reason: '상품 연결 어려움' }], notes: []
};

test('Notion 실행 기록에 한국시간과 미분류 목록을 보관하고 JSON 블록은 만들지 않는다', () => {
  const payload = notionReportPayload(report) as {
    properties: Record<string, any>;
    children: Record<string, any>[];
  };
  assert.equal(payload.properties['실행시각'].date.start, '2026-09-23T18:00:00+09:00');
  assert.equal(payload.properties['상태'].select.name, '후보 없음');
  assert.equal(payload.properties['미분류 수'].number, 1);
  assert.equal(payload.properties['쇼핑 후보'].number, 0);
  assert.match(JSON.stringify(payload.children), /Naver 독립 조회 6개/);
  assert.equal(payload.children.some((child) => child.type === 'code'), false);
  assert.equal(payload.children.some((child) => JSON.stringify(child).includes('미분류')), true);
});

test('Notion 저장은 페이지 생성 API를 사용하고 새 행 URL을 반환한다', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    assert.equal(input, 'https://api.notion.com/v1/pages');
    assert.equal(init?.method, 'POST');
    assert.equal((init?.headers as Record<string, string>)['Notion-Version'], '2025-09-03');
    const payload = JSON.parse(String(init?.body));
    assert.equal(payload.parent.data_source_id, 'b94fbf44-68b3-46f2-aab3-a74b20841ce5');
    return new Response(JSON.stringify({ id: 'run-id', url: 'https://app.notion.com/p/example' }), { status: 200 });
  };
  try {
    assert.deepEqual(await saveNotionReport(report, 'test-token'), {
      runUrl: 'https://app.notion.com/p/example', top3Saved: 0
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('TOP 3 후보는 간결한 컬럼과 상세 근거·메모 공간을 가진 행으로 저장한다', async () => {
  const candidate: Candidate = {
    rank: 1, keyword: '에어프라이어', category: '디지털/가전',
    scores: { trendScore: 75, shoppingScore: 80, productFitScore: 80, contentFitScore: 75, totalScore: 78 },
    google: { approxTraffic: 2000, publishedAt: report.generatedAt, url: 'google-url', newsTitles: [] },
    shopping: {
      keyword: '에어프라이어', categoryCode: '50000003', startDate: '2026-09-13', endDate: '2026-09-22',
      recentAverage: 60, priorAverage: 40, changePercent: 50, dataPoints: 10, status: 'rising'
    }
  };
  const candidatePayload = notionTop3Payload(candidate, report, 'run-id') as { parent: { data_source_id: string }; properties: Record<string, any>; children: Record<string, any>[] };
  assert.equal(candidatePayload.parent.data_source_id, '973e5e8f-76d9-463b-9234-62b45c7cce4c');
  assert.deepEqual(Object.keys(candidatePayload.properties).sort(), ['검토상태', '발견시각', '실행기록', '예상 카테고리', '총점', '키워드'].sort());
  assert.equal(candidatePayload.properties['예상 카테고리'].rich_text[0].text.content, '디지털/가전');
  assert.deepEqual(candidatePayload.properties['실행기록'].relation, [{ id: 'run-id' }]);
  const detail = JSON.stringify(candidatePayload.children);
  assert.match(detail, /TOP 1/);
  assert.match(detail, /Google \+ Naver/);
  assert.match(detail, /변화 \+50%/);
  assert.match(detail, /검토 메모/);

  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_input, init) => {
    calls += 1;
    const payload = JSON.parse(String(init?.body));
    assert.equal(payload.parent.data_source_id, calls === 1 ? 'b94fbf44-68b3-46f2-aab3-a74b20841ce5' : '973e5e8f-76d9-463b-9234-62b45c7cce4c');
    if (calls === 2) assert.deepEqual(payload.properties['실행기록'].relation, [{ id: 'page-1' }]);
    return new Response(JSON.stringify({ id: `page-${calls}`, url: `https://app.notion.com/p/${calls}` }), { status: 200 });
  };
  try {
    assert.deepEqual(await saveNotionReport({ ...report, top3: [candidate], top10: [candidate], counts: { ...report.counts, ranked: 1 } }, 'test-token'), {
      runUrl: 'https://app.notion.com/p/1', top3Saved: 1
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
