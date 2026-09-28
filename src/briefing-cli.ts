import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assertCurrentRun, deliverBriefing, deliveryKey, parseBriefing, readDeliveryHistory, renderBriefing } from './briefing.js';
import { readLatestRun } from './report/notion-reader.js';
import { editTelegram, sendAssistantTelegram, sendTelegram } from './report/telegram.js';

const directory = resolve('.runtime');

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === 'test-assistant') {
    const id = await sendAssistantTelegram('Coupang Instagram Trend · 비서 봇 연결 테스트입니다. 실패 알림 전송 경로 확인용입니다.');
    console.log(`비서 Telegram 테스트 전송 완료 (메시지 ${id})`);
    return;
  }
  if (command === 'test-content') {
    const id = await sendTelegram('Coupang Instagram Trend · 콘텐츠 봇 연결 테스트입니다.');
    console.log(`콘텐츠 Telegram 테스트 전송 완료 (메시지 ${id})`);
    return;
  }
  const token = process.env.NOTION_TOKEN?.trim() ?? '';
  if (command === 'read') {
    const [run, history] = await Promise.all([readLatestRun(token), readDeliveryHistory(directory)]);
    console.log(JSON.stringify({
      run, alreadyHandled: Boolean(run && history.some((record) => record.runId === run.id)),
      history: history.slice(-30),
      pendingDelivery: history.filter((record) => record.status === 'pending')
    }, null, 2));
    return;
  }
  if (command === 'send' || command === 'refresh') {
    const filename = process.argv[3];
    if (!filename) throw new Error('사용법: npm run briefing:send -- .runtime/briefing.json');
    let value: unknown;
    try { value = JSON.parse(await readFile(filename, 'utf8')); }
    catch { throw new Error('실험안 파일을 읽지 못했거나 JSON 형식이 잘못됐습니다.'); }
    const briefing = parseBriefing(value);
    // Notion 자체가 불통일 때도 짧은 수집 오류 알림은 보낼 수 있다.
    const run = briefing.kind === 'collection_issue' || briefing.kind === 'scheduler_failure' ? null : await readLatestRun(token);
    if (command === 'refresh') {
      if (briefing.kind !== 'idea') throw new Error('형식 수정은 이미 전송한 실험안만 가능합니다.');
      assertCurrentRun(briefing, run);
      const history = await readDeliveryHistory(directory);
      const record = [...history].reverse().find((item) => item.status === 'sent' && item.runId === briefing.runId && item.key === deliveryKey(briefing, new Date()));
      if (!record?.messageId) throw new Error('같은 실험안의 전송 기록이 없어 기존 메시지를 수정할 수 없습니다.');
      const id = await editTelegram(record.messageId, renderBriefing(briefing, run), 'HTML');
      console.log(`기존 Telegram 메시지 형식 수정 완료 (메시지 ${id})`);
      return;
    }
    console.log(await deliverBriefing(briefing, run, directory));
    return;
  }
  throw new Error('명령은 read, send, refresh, test-assistant, test-content 중 하나여야 합니다.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : '실험안 처리 실패.');
  process.exitCode = 1;
});
