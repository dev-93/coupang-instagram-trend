import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { assertCurrentRun, deliverBriefing, parseBriefing, readDeliveryHistory, renderBriefing, type Idea } from '../src/briefing.js';
import { isFreshRun, readLatestRun, type LatestRun } from '../src/report/notion-reader.js';
import { sendTelegram, TelegramSendError, telegramText } from '../src/report/telegram.js';

const run: LatestRun = {
  id: '11111111-1111-1111-1111-111111111111', url: 'https://www.notion.so/example',
  generatedAt: '2026-09-27T00:00:00Z', ageHours: 1, fresh: true, status: '후보 있음',
  top3: '밀폐용기', candidateCount: 1, collectionWarnings: [], body: ['TOP 1 ⭐ · 밀폐용기 · 65점 · Naver']
};
const idea: Idea = {
  kind: 'idea', runId: run.id, ideaKey: '밀폐용기|뚜껑 홈 청소|비교', keyword: '밀폐용기',
  audience: '밀폐용기를 자주 씻는 사람', problem: '뚜껑 홈 세척이 번거롭다', existingAlternative: '일반 수세미로 닦는다',
  evidence: [{ fact: '테스트용 사실 A', url: 'https://example.com/a' }, { fact: '테스트용 사실 B', url: 'https://example.org/b' }],
  hypothesis: '홈 청소 시연을 끝까지 볼 수 있다', hook: '여기는 어떻게 닦으세요?', shots: ['씻기 전', '방법 비교'],
  productConnection: '홈에 맞는 세척솔', purchaseReason: '기존 수세미로 닿기 어려운 부분을 닦으려는 수요',
  cta: '사용한 도구는 프로필에서 확인', checks: ['소재에 맞는지 직접 확인'], measurement: '저장과 프로필 링크 클릭 확인'
};

async function telegramFixture(work: () => Promise<void>): Promise<void> {
  const previous = { token: process.env.TELEGRAM_BOT_TOKEN, chat: process.env.TELEGRAM_CHAT_ID, fetch: globalThis.fetch };
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  process.env.TELEGRAM_CHAT_ID = 'test-chat';
  try { await work(); }
  finally {
    globalThis.fetch = previous.fetch;
    if (previous.token === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = previous.token;
    if (previous.chat === undefined) delete process.env.TELEGRAM_CHAT_ID;
    else process.env.TELEGRAM_CHAT_ID = previous.chat;
  }
}

test('Telegram 접두사·길이를 제한하고 Markdown 기호를 그대로 전송한다', async () => {
  assert.equal(telegramText(' 테스트 '), '[쿠팡] 테스트');
  assert.equal(telegramText('[쿠팡] 테스트'), '[쿠팡] 테스트');
  assert.throws(() => telegramText(''), /비어/);
  assert.throws(() => telegramText('가'.repeat(3900)), /너무 깁니다/);
  await telegramFixture(async () => {
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.text, '[쿠팡] _<테스트> & [링크]');
      assert.equal(body.parse_mode, undefined);
      return new Response(JSON.stringify({ ok: true, result: { message_id: 100 } }));
    };
    assert.equal(await sendTelegram('_<테스트> & [링크]'), 100);
    globalThis.fetch = async () => { throw new Error('https://api.telegram.org/bottest-token/sendMessage'); };
    await assert.rejects(sendTelegram('테스트'), (error: unknown) => {
      assert.ok(error instanceof TelegramSendError);
      assert.equal(error.deliveryUncertain, true);
      assert.equal(error.message.includes('test-token'), false);
      return true;
    });
  });
});

test('오래된 기록·다른 실행·후보 없는 실행·출처 부족의 실험안을 차단한다', () => {
  const now = new Date('2026-09-27T02:00:00Z');
  assert.equal(isFreshRun('2026-09-26T00:00:00Z', now), true);
  assert.equal(isFreshRun('2026-09-25T23:59:00Z', now), false);
  assert.equal(isFreshRun('2026-09-27T03:00:00Z', now), false);
  assert.equal(isFreshRun('invalid', now), false);
  assert.throws(() => assertCurrentRun(idea, { ...run, fresh: false }), /26시간/);
  assert.throws(() => assertCurrentRun(idea, { ...run, id: 'different' }), /최신 실행/);
  assert.throws(() => assertCurrentRun(idea, { ...run, candidateCount: 0 }), /상품 후보/);
  assert.throws(() => assertCurrentRun({ ...idea, keyword: '임의 상품' }, run), /TOP 후보/);
  assert.throws(() => parseBriefing({ ...idea, evidence: [] }), /출처/);
  assert.match(renderBriefing(parseBriefing(idea), run), /^\[쿠팡\]/);
});

test('최신 실행을 날짜로 정렬하고 본문 페이지를 끝까지 읽는다', async () => {
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls += 1;
    if (calls === 1) {
      const query = JSON.parse(String(init?.body));
      assert.deepEqual(query.sorts, [{ property: '실행시각', direction: 'descending' }]);
      assert.equal(query.filter.date.is_not_empty, true);
      return new Response(JSON.stringify({ results: [{ id: run.id, url: run.url, properties: {
        '실행시각': { date: { start: run.generatedAt } }, '최종 후보': { number: 1 }
      } }] }));
    }
    if (calls === 3) assert.match(String(url), /start_cursor=next/);
    return new Response(JSON.stringify({
      results: [{ type: 'paragraph', paragraph: { rich_text: [{ plain_text: calls === 2 ? 'TOP 1 밀폐용기' : 'Naver 조회 실패: HTTP 401' }] } }],
      has_more: calls === 2, next_cursor: calls === 2 ? 'next' : null
    }));
  };
  try {
    const latest = await readLatestRun('test-notion-token', new Date('2026-09-27T01:00:00Z'));
    assert.equal(latest?.fresh, true);
    assert.equal(latest?.ageHours, 1);
    assert.equal(latest?.body.length, 2);
    assert.deepEqual(latest?.collectionWarnings, ['Naver 조회 실패: HTTP 401']);
    assert.equal(calls, 3);
  } finally { globalThis.fetch = previous; }
});

test('같은 실행과 같은 실험은 재전송하지 않고, 실험안 없음은 조용히 처리한다', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'coupang-briefing-test-'));
  try {
    await telegramFixture(async () => {
      let calls = 0;
      globalThis.fetch = async () => { calls += 1; return new Response(JSON.stringify({ ok: true, result: { message_id: 101 } })); };
      const now = new Date('2026-09-27T01:00:00Z');
      assert.match(await deliverBriefing(idea, run, directory, now), /전송 완료/);
      assert.match(await deliverBriefing(idea, run, directory, now), /전송 생략/);
      const nextRun = { ...run, id: '22222222-2222-2222-2222-222222222222' };
      assert.match(await deliverBriefing({ ...idea, runId: nextRun.id }, nextRun, directory, now), /전송 생략/);
      const emptyRun = { ...run, id: '33333333-3333-3333-3333-333333333333', candidateCount: 0 };
      assert.match(await deliverBriefing({ kind: 'no_idea', runId: emptyRun.id, reason: '새 근거 없음' }, emptyRun, directory, now), /전송 없음/);
      assert.equal(calls, 1);
      const history = await readDeliveryHistory(directory);
      assert.deepEqual(history.map((record) => record.status), ['sent', 'skipped', 'skipped']);
      assert.equal(history[1].runId, nextRun.id);
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('전송 확인 불가이면 pending을 보존해 중복을 막는다', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'coupang-briefing-test-'));
  try {
    await telegramFixture(async () => {
      let calls = 0;
      globalThis.fetch = async () => { calls += 1; throw new Error('timeout'); };
      const now = new Date('2026-09-27T01:00:00Z');
      await assert.rejects(deliverBriefing(idea, run, directory, now), /자동 재전송하지 않습니다/);
      assert.equal((await readDeliveryHistory(directory))[0]?.status, 'pending');
      assert.match(await deliverBriefing(idea, run, directory, now), /전송 생략/);
      assert.equal(calls, 1);
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('확실한 Telegram 거절은 성공으로 기록하지 않고 수정 후 다시 보낼 수 있다', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'coupang-briefing-test-'));
  try {
    await telegramFixture(async () => {
      globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, description: 'untrusted error', error_code: 400 }), { status: 400 });
      const now = new Date('2026-09-27T01:00:00Z');
      await assert.rejects(deliverBriefing(idea, run, directory, now), /채팅 ID/);
      assert.deepEqual(await readDeliveryHistory(directory), []);
      globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, result: { message_id: 102 } }));
      assert.match(await deliverBriefing(idea, run, directory, now), /전송 완료/);
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
