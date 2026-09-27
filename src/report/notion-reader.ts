import { NOTION_DATA_SOURCE_ID, NOTION_VERSION } from './notion.js';

type Text = { plain_text?: string; text?: { content?: string } };
type Page = {
  id: string; url: string;
  properties: Record<string, {
    date?: { start?: string } | null;
    select?: { name?: string } | null;
    rich_text?: Text[];
    number?: number | null;
  }>;
};

export interface LatestRun {
  id: string;
  url: string;
  generatedAt: string;
  ageHours: number;
  fresh: boolean;
  status: string;
  top3: string;
  candidateCount: number;
  collectionWarnings: string[];
  body: string[];
}

export function isFreshRun(iso: string, now = new Date()): boolean {
  const age = now.getTime() - Date.parse(iso);
  return Number.isFinite(age) && age >= -5 * 60_000 && age <= 26 * 3_600_000;
}

function plainText(parts?: Text[]): string {
  return (parts ?? []).map((part) => part.plain_text ?? part.text?.content ?? '').join('');
}

async function request(path: string, token: string, body?: unknown): Promise<any> {
  if (!token.trim()) throw new Error('NOTION_TOKEN이 없습니다.');
  let response: Response;
  try {
    response = await fetch(`https://api.notion.com/v1/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(20000)
    });
  } catch {
    throw new Error('Notion 조회 연결 실패 또는 시간 초과.');
  }
  if (!response.ok) throw new Error(`Notion 조회 실패: HTTP ${response.status}.`);
  try { return await response.json(); }
  catch { throw new Error('Notion 조회 응답이 JSON이 아닙니다.'); }
}

export async function readLatestRun(token: string, now = new Date()): Promise<LatestRun | null> {
  const result = await request(`data_sources/${NOTION_DATA_SOURCE_ID}/query`, token, {
    filter: { property: '실행시각', date: { is_not_empty: true } },
    sorts: [{ property: '실행시각', direction: 'descending' }], page_size: 1
  });
  if (!Array.isArray(result.results)) throw new Error('Notion 조회 응답에 results 배열이 없습니다.');
  const page = result.results[0] as Page | undefined;
  if (!page) return null;
  const generatedAt = page.properties?.['실행시각']?.date?.start;
  if (!page.id || !page.url || !generatedAt || !Number.isFinite(Date.parse(generatedAt))) {
    throw new Error('최신 Notion 실행 기록에 ID·URL·실행시각이 없습니다.');
  }
  const body: string[] = [];
  let cursor: string | null = null;
  for (let batch = 0; batch < 5; batch += 1) {
    const query = new URLSearchParams({ page_size: '100', ...(cursor ? { start_cursor: cursor } : {}) });
    const blocks = await request(`blocks/${page.id}/children?${query}`, token);
    if (!Array.isArray(blocks.results)) throw new Error('Notion 본문 조회 응답에 results 배열이 없습니다.');
    for (const block of blocks.results) {
      const text = plainText(block[block.type]?.rich_text);
      if (text) body.push(text);
    }
    if (!blocks.has_more) break;
    if (!blocks.next_cursor || blocks.next_cursor === cursor || batch === 4) throw new Error('Notion 본문을 끝까지 읽지 못했습니다.');
    cursor = blocks.next_cursor;
  }
  return {
    id: page.id, url: page.url, generatedAt,
    ageHours: Math.round((now.getTime() - Date.parse(generatedAt)) / 36_000) / 100,
    fresh: isFreshRun(generatedAt, now),
    status: page.properties['상태']?.select?.name ?? '확인 불가',
    top3: plainText(page.properties['TOP 3']?.rich_text),
    candidateCount: page.properties['최종 후보']?.number ?? 0,
    collectionWarnings: body.filter((line) => /수집 실패|조회 실패|데이터 부족|일별 클릭 지표 미완성|모두 0|상승 판정이 없습니다/.test(line)),
    body
  };
}
