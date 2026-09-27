import { chmod, mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { LatestRun } from './report/notion-reader.js';
import { escapeTelegramHtml as html, sendTelegram, TelegramSendError, telegramText } from './report/telegram.js';

interface Envelope { kind: 'idea' | 'no_idea' | 'collection_issue'; runId: string | null }
export interface Idea extends Envelope {
  kind: 'idea'; runId: string;
  ideaKey: string; keyword: string; audience: string; problem: string; existingAlternative: string;
  evidence: { fact: string; url: string }[];
  hypothesis: string; hook: string; shots: string[];
  productConnection: string; purchaseReason: string; cta: string; checks: string[]; measurement: string;
}
interface NoIdea extends Envelope { kind: 'no_idea'; runId: string; reason: string }
interface CollectionIssue extends Envelope { kind: 'collection_issue'; reason: string }
export type Briefing = Idea | NoIdea | CollectionIssue;

export interface DeliveryRecord {
  runId: string | null; kind: Briefing['kind']; key: string; at: string;
  status: 'pending' | 'sent' | 'skipped';
  keyword?: string; problem?: string; hook?: string; reason?: string; messageId?: number;
}
interface State { version: 1; records: DeliveryRecord[] }

function requiredText(value: unknown, field: string, limit = 240): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > limit) throw new Error(`${field}는 비어 있지 않은 ${limit}자 이내 문자열이어야 합니다.`);
  return value.trim();
}

function textList(value: unknown, field: string, minimum: number, maximum: number): string[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) throw new Error(`${field}는 ${minimum}~${maximum}개 항목이어야 합니다.`);
  return value.map((item) => requiredText(item, field));
}

export function parseBriefing(value: unknown): Briefing {
  if (!value || typeof value !== 'object') throw new Error('실험안 JSON 객체가 필요합니다.');
  const input = value as Record<string, unknown>;
  const kind = input.kind;
  if (kind !== 'idea' && kind !== 'no_idea' && kind !== 'collection_issue') throw new Error('kind가 올바르지 않습니다.');
  const runId = input.runId === null && kind === 'collection_issue' ? null : requiredText(input.runId, 'runId', 36);
  if (runId !== null && !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(runId)) throw new Error('runId는 Notion 실행 기록의 UUID여야 합니다.');
  if (kind !== 'idea') return { kind, runId, reason: requiredText(input.reason, 'reason') } as NoIdea | CollectionIssue;
  if (!Array.isArray(input.evidence) || input.evidence.length < 2 || input.evidence.length > 3) throw new Error('직접 확인한 evidence 출처가 2~3개 필요합니다.');
  const evidence = input.evidence.map((item) => {
    if (!item || typeof item !== 'object') throw new Error('evidence 형식이 올바르지 않습니다.');
    const url = requiredText(item.url, 'evidence.url', 500);
    let parsed: URL;
    try { parsed = new URL(url); } catch { throw new Error('evidence.url이 올바르지 않습니다.'); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('출처는 인증정보가 없는 HTTPS URL이어야 합니다.');
    return { fact: requiredText(item.fact, 'evidence.fact'), url };
  });
  if (new Set(evidence.map((item) => item.url)).size < 2) throw new Error('서로 다른 출처 URL이 필요합니다.');
  return {
    kind, runId: runId!, evidence,
    ideaKey: requiredText(input.ideaKey, 'ideaKey', 120), keyword: requiredText(input.keyword, 'keyword', 80),
    audience: requiredText(input.audience, 'audience'), problem: requiredText(input.problem, 'problem'),
    existingAlternative: requiredText(input.existingAlternative, 'existingAlternative'),
    hypothesis: requiredText(input.hypothesis, 'hypothesis'), hook: requiredText(input.hook, 'hook'),
    shots: textList(input.shots, 'shots', 2, 4),
    productConnection: requiredText(input.productConnection, 'productConnection'),
    purchaseReason: requiredText(input.purchaseReason, 'purchaseReason'), cta: requiredText(input.cta, 'cta'),
    checks: textList(input.checks, 'checks', 1, 3), measurement: requiredText(input.measurement, 'measurement')
  };
}

export function renderBriefing(briefing: Briefing, run: LatestRun | null): string {
  if (briefing.kind === 'no_idea') throw new Error('실험안 없음은 Telegram에 보내지 않습니다.');
  if (briefing.kind === 'collection_issue') return telegramText(`[쿠팡] <b>수집 확인 필요</b>\n\n${html(briefing.reason)}${run ? `\n\n<a href="${html(run.url)}">실행 기록 보기</a>` : ''}`);
  if (!run) throw new Error('실험안에는 실행 기록이 필요합니다.');
  const lines = [
    `[쿠팡] <b>${html(briefing.keyword)} · 콘텐츠 실험</b>`,
    `<i>볼 사람: ${html(briefing.audience)}</i>`,
    '', '💡 <b>이번에 볼 가설</b>', html(briefing.hypothesis),
    '', '🎬 <b>영상 구성</b>', `<b>첫 2초</b>  “${html(briefing.hook)}”`,
    ...briefing.shots.map((shot, i) => `${i + 1}. ${html(shot)}`),
    '', '🛒 <b>상품 연결</b>', html(briefing.productConnection),
    `<b>구매 이유(가설)</b>  ${html(briefing.purchaseReason)}`,
    '', '💬 <b>마무리 문구</b>', html(briefing.cta),
    '', '✅ <b>게시 전 확인</b>', ...briefing.checks.map((check) => `• ${html(check)}`),
    '', '📊 <b>확인할 반응</b>', html(briefing.measurement),
    '', '<blockquote expandable><b>🔎 근거·검토 메모 — 펼쳐보기</b>',
    `<b>불편</b>  ${html(briefing.problem)}`,
    `<b>현재 대안</b>  ${html(briefing.existingAlternative)}`,
    ...briefing.evidence.map((item, i) => `\n<a href="${html(item.url)}">출처 ${i + 1}</a>  ${html(item.fact)}`),
    '</blockquote>',
    '', '<i>반응·구매는 아직 검증 전인 실험입니다.</i>',
    ...(run.collectionWarnings.some((line) => /수집 실패|조회 실패/.test(line)) ? ['⚠️ 일부 출처 미수집 · 실행 기록 확인 필요'] : []),
    `<a href="${html(run.url)}">수집 기록 보기</a> · ${new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(run.generatedAt))}`
  ];
  return telegramText(lines.join('\n'));
}

export function assertCurrentRun(briefing: Briefing, run: LatestRun | null): void {
  if (briefing.kind === 'collection_issue') return;
  if (!run || briefing.runId !== run.id) throw new Error('실험안의 runId가 최신 실행 기록과 다릅니다. 다시 읽고 검토하세요.');
  if (!run.fresh) throw new Error('최신 실행 기록이 26시간보다 오래됐거나 실행시각이 잘못됐습니다.');
  if (briefing.kind === 'idea') {
    if (run.candidateCount === 0) throw new Error('최신 실행에 상품 후보가 없어 실험안을 전송하지 않습니다.');
    const normalized = (text: string) => text.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g, '');
    if (!run.body.some((line) => /^TOP \d/.test(line) && normalized(line).includes(normalized(briefing.keyword)))) {
      throw new Error('실험안 키워드가 최신 실행의 TOP 후보 본문에 없습니다.');
    }
  }
}

function koreanDay(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function deliveryKey(briefing: Briefing, now: Date): string {
  return briefing.kind === 'idea' ? `idea:${briefing.ideaKey.normalize('NFKC').toLowerCase().replace(/\s+/g, '')}`
    : briefing.kind === 'collection_issue' ? `issue:${koreanDay(now)}` : `skip:${briefing.runId}`;
}

export function duplicateReason(records: DeliveryRecord[], briefing: Briefing, now: Date): string | null {
  if (briefing.runId && records.some((record) => record.runId === briefing.runId)) return '이미 처리한 실행 기록';
  const key = deliveryKey(briefing, now);
  if (records.some((record) => record.key === key && now.getTime() - Date.parse(record.at) < 7 * 86_400_000)) return '최근 7일 안에 처리한 같은 실험안 또는 오늘의 수집 알림';
  return null;
}

export async function readDeliveryHistory(directory: string): Promise<DeliveryRecord[]> {
  let raw: string;
  try { raw = await readFile(join(directory, 'briefing-state.json'), 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw new Error('전송 기록을 읽지 못했습니다.');
  }
  let state: State;
  try { state = JSON.parse(raw) as State; } catch { throw new Error('전송 기록이 손상됐습니다. 초기화하지 말고 확인하세요.'); }
  if (state.version !== 1 || !Array.isArray(state.records) || state.records.some((record) =>
    !record || typeof record.key !== 'string' || !Number.isFinite(Date.parse(record.at)) || !['pending', 'sent', 'skipped'].includes(record.status)
  )) throw new Error('전송 기록 형식이 올바르지 않습니다.');
  return state.records;
}

async function saveHistory(directory: string, records: DeliveryRecord[]): Promise<void> {
  const temporary = join(directory, 'briefing-state.tmp');
  await writeFile(temporary, JSON.stringify({ version: 1, records: records.slice(-90) }, null, 2), { mode: 0o600 });
  await rename(temporary, join(directory, 'briefing-state.json'));
}

export async function deliverBriefing(briefing: Briefing, run: LatestRun | null, directory: string, now = new Date()): Promise<string> {
  assertCurrentRun(briefing, run);
  // 길이 오류·형식 오류는 전송 이력을 만들기 전에 검사한다.
  const text = briefing.kind === 'no_idea' ? null : renderBriefing(briefing, run);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const lockPath = join(directory, 'briefing.lock');
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); }
  catch { throw new Error('다른 전송이 진행 중이거나 이전 전송 잠금이 남아 있습니다. 중복 방지를 위해 중단합니다.'); }
  try {
    const records = await readDeliveryHistory(directory);
    const duplicate = duplicateReason(records, briefing, now);
    if (duplicate) {
      // 새 수집에서 지난 실험이 반복돼도 다음 예약에서 또 조사하지 않는다.
      if (briefing.runId && !records.some((record) => record.runId === briefing.runId)) {
        records.push({ runId: briefing.runId, kind: briefing.kind, key: deliveryKey(briefing, now), at: now.toISOString(), status: 'skipped', reason: duplicate });
        await saveHistory(directory, records);
      }
      return `전송 생략: ${duplicate}`;
    }
    const record: DeliveryRecord = {
      runId: briefing.runId, kind: briefing.kind, key: deliveryKey(briefing, now), at: now.toISOString(),
      status: text === null ? 'skipped' : 'pending',
      ...(briefing.kind === 'idea' ? { keyword: briefing.keyword, problem: briefing.problem, hook: briefing.hook } : { reason: briefing.reason })
    };
    records.push(record);
    await saveHistory(directory, records);
    if (text === null) return '새 실험안 없음: 로컬 처리 기록만 남겼습니다. Telegram 전송 없음.';
    try {
      record.messageId = await sendTelegram(text, 'HTML');
    } catch (error) {
      if (!(error instanceof TelegramSendError) || !error.deliveryUncertain) {
        records.pop();
        await saveHistory(directory, records);
      }
      throw error;
    }
    record.status = 'sent';
    await saveHistory(directory, records);
    return `Telegram 전송 완료 (메시지 ${record.messageId})`;
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
}
