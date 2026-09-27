import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { deliverBriefing, parseBriefing, readDeliveryHistory } from './briefing.js';
import { readLatestRun } from './report/notion-reader.js';
import { sendTelegram } from './report/telegram.js';

const directory = resolve('.runtime');

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === 'test') {
    const id = await sendTelegram('연결 테스트\n앞으로 콘텐츠 실험안은 [쿠팡]으로 시작합니다.\n새 실험안이 없으면 알림을 생략합니다. 현재 예약 등록 전 연결 점검입니다.');
    console.log(`Telegram 테스트 전송 완료 (메시지 ${id})`);
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
  if (command === 'send') {
    const filename = process.argv[3];
    if (!filename) throw new Error('사용법: npm run briefing:send -- .runtime/briefing.json');
    let value: unknown;
    try { value = JSON.parse(await readFile(filename, 'utf8')); }
    catch { throw new Error('실험안 파일을 읽지 못했거나 JSON 형식이 잘못됐습니다.'); }
    const briefing = parseBriefing(value);
    // Notion 자체가 불통일 때도 짧은 수집 오류 알림은 보낼 수 있다.
    const run = briefing.kind === 'collection_issue' ? null : await readLatestRun(token);
    console.log(await deliverBriefing(briefing, run, directory));
    return;
  }
  throw new Error('명령은 read, send, test 중 하나여야 합니다.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : '실험안 처리 실패.');
  process.exitCode = 1;
});
