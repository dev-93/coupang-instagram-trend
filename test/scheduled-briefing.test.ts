import assert from 'node:assert/strict';
import test from 'node:test';
import { codexArguments, codexEnvironment, scheduledDecision } from '../src/scheduled-briefing.js';
import type { DeliveryRecord } from '../src/briefing.js';
import type { LatestRun } from '../src/report/notion-reader.js';

const now = new Date('2026-09-27T09:00:00Z'); // 한국시간 18:00
const run: LatestRun = {
  id: '11111111-1111-1111-1111-111111111111', url: 'https://www.notion.so/example',
  generatedAt: '2026-09-27T08:03:00Z', ageHours: 1, fresh: true, status: '후보 있음',
  top3: '밀폐용기', candidateCount: 1, collectionWarnings: [], body: ['TOP 1 밀폐용기']
};
const record: DeliveryRecord = { runId: run.id, kind: 'idea', key: 'idea:테스트', at: '2026-09-27T08:10:00Z', status: 'sent' };

test('18시 전·지난 수집·미래 날짜·빈 후보·기처리·pending을 분석 대상에서 제외한다', () => {
  assert.equal(scheduledDecision(run, [], new Date('2026-09-27T08:59:59Z')).action, 'skip');
  assert.equal(scheduledDecision(null, [], now).action, 'issue');
  assert.equal(scheduledDecision({ ...run, generatedAt: '2026-09-27T04:23:00Z' }, [], now).action, 'issue');
  assert.equal(scheduledDecision({ ...run, generatedAt: '2026-09-26T08:03:00Z' }, [], now).action, 'issue');
  assert.equal(scheduledDecision({ ...run, generatedAt: '2026-09-28T08:03:00Z' }, [], now).action, 'issue');
  assert.equal(scheduledDecision({ ...run, candidateCount: 0 }, [], now).action, 'no_idea');
  assert.equal(scheduledDecision(run, [record], now).action, 'skip');
  assert.equal(scheduledDecision(run, [{ ...record, status: 'pending', runId: null }], now).action, 'skip');
  assert.equal(scheduledDecision(run, [], now).action, 'analyze');
});

test('Notion의 출처 수집 실패는 보류하고 관측 부족이나 상승 없음은 장애로 오인하지 않는다', () => {
  const partial = { ...run, collectionWarnings: ['Naver 조회 실패: HTTP 401'] };
  assert.equal(scheduledDecision(partial, [record], now).action, 'issue');
  assert.equal(scheduledDecision({ ...run, collectionWarnings: ['Google 수집 실패: 연결 시간 초과'] }, [], now).action, 'issue');
  assert.equal(scheduledDecision({ ...run, collectionWarnings: ['데이터 부족', '상승 판정이 없습니다'] }, [], now).action, 'analyze');
  assert.match(scheduledDecision(null, [], now).reason, /Railway/);
});

test('한국시간 자정·다음날 기상에는 지난날 후보를 오늘 실험으로 쓰지 않는다', () => {
  assert.equal(scheduledDecision(run, [], new Date('2026-09-27T15:00:00Z')).action, 'skip');
  assert.equal(scheduledDecision(run, [], new Date('2026-09-28T09:00:00Z')).action, 'issue');
});

test('Codex는 ChatGPT 로그인·읽기 전용·실시간 검색을 쓰고 토큰과 앱 세션 환경을 상속하지 않는다', () => {
  const env = codexEnvironment({ HOME: '/Users/example', PATH: '/usr/bin', OPENAI_API_KEY: 'test-api', CODEX_API_KEY: 'test-codex', TELEGRAM_BOT_TOKEN: 'test-bot', NOTION_TOKEN: 'test-notion', CODEX_THREAD_ID: 'test-session' });
  assert.deepEqual(env, { HOME: '/Users/example', PATH: '/usr/bin' });
  const argumentsList = codexArguments('/project', '/project/.runtime/schema.json');
  assert.ok(argumentsList.includes('forced_login_method="chatgpt"'));
  assert.ok(argumentsList.includes('web_search="live"'));
  assert.ok(argumentsList.includes('read-only'));
  assert.ok(argumentsList.includes('--ignore-user-config'));
  assert.ok(argumentsList.includes('--ephemeral'));
  assert.equal(argumentsList.includes('--dangerously-bypass-approvals-and-sandbox'), false);
});
