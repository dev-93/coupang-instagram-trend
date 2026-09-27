import assert from 'node:assert/strict';
import test from 'node:test';
import { codexArguments, codexEnvironment, scheduledDecision, type WorkflowStatus } from '../src/scheduled-briefing.js';
import type { DeliveryRecord } from '../src/briefing.js';
import type { LatestRun } from '../src/report/notion-reader.js';

const now = new Date('2026-09-27T09:00:00Z'); // 한국시간 18:00
const run: LatestRun = {
  id: '11111111-1111-1111-1111-111111111111', url: 'https://www.notion.so/example',
  generatedAt: '2026-09-27T08:03:00Z', ageHours: 1, fresh: true, status: '후보 있음',
  top3: '밀폐용기', candidateCount: 1, collectionWarnings: [], body: ['TOP 1 밀폐용기']
};
const workflow: WorkflowStatus = { available: true, runs: [] };
const record: DeliveryRecord = { runId: run.id, kind: 'idea', key: 'idea:테스트', at: '2026-09-27T08:10:00Z', status: 'sent' };

test('18시 전·지난 수집·미래 날짜·빈 후보·기처리·pending을 분석 대상에서 제외한다', () => {
  assert.equal(scheduledDecision(run, [], workflow, new Date('2026-09-27T08:59:59Z')).action, 'skip');
  assert.equal(scheduledDecision(null, [], workflow, now).action, 'issue');
  assert.equal(scheduledDecision({ ...run, generatedAt: '2026-09-27T04:23:00Z' }, [], workflow, now).action, 'issue');
  assert.equal(scheduledDecision({ ...run, generatedAt: '2026-09-26T08:03:00Z' }, [], workflow, now).action, 'issue');
  assert.equal(scheduledDecision({ ...run, generatedAt: '2026-09-28T08:03:00Z' }, [], workflow, now).action, 'issue');
  assert.equal(scheduledDecision({ ...run, candidateCount: 0 }, [], workflow, now).action, 'no_idea');
  assert.equal(scheduledDecision(run, [record], workflow, now).action, 'skip');
  assert.equal(scheduledDecision(run, [{ ...record, status: 'pending', runId: null }], workflow, now).action, 'skip');
  assert.equal(scheduledDecision(run, [], workflow, now).action, 'analyze');
});

test('수집 진행 중과 실패를 구분하고 지난 실패는 새 수집을 가리지 않는다', () => {
  const item = { createdAt: '2026-09-27T08:05:00Z', url: 'https://github.com/example/run', status: 'completed', conclusion: 'failure' };
  assert.equal(scheduledDecision(run, [record], { available: true, runs: [item] }, now).action, 'issue');
  const running = { ...item, status: 'in_progress', conclusion: null };
  assert.match(scheduledDecision(null, [], { available: true, runs: [running] }, now).reason, /진행 중/);
  assert.equal(scheduledDecision(run, [], { available: true, runs: [{ ...item, createdAt: '2026-09-27T08:00:00Z' }] }, now).action, 'analyze');
  assert.equal(scheduledDecision(run, [], { available: false, runs: [] }, now).action, 'analyze');
});

test('한국시간 자정·다음날 기상에는 지난날 후보를 오늘 실험으로 쓰지 않는다', () => {
  assert.equal(scheduledDecision(run, [], workflow, new Date('2026-09-27T15:00:00Z')).action, 'skip');
  assert.equal(scheduledDecision(run, [], workflow, new Date('2026-09-28T09:00:00Z')).action, 'issue');
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
