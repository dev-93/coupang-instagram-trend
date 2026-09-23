import type { Candidate, Report } from '../types.js';

// 쿠팡 파트너스 × 인스타 트렌드 실험 페이지 아래의 실행 기록 DB
export const NOTION_DATA_SOURCE_ID = 'b94fbf44-68b3-46f2-aab3-a74b20841ce5';
export const NOTION_TOP3_DATA_SOURCE_ID = '973e5e8f-76d9-463b-9234-62b45c7cce4c';
const NOTION_API = 'https://api.notion.com/v1/pages';
const NOTION_VERSION = '2025-09-03';

type RichText = { type: 'text'; text: { content: string } };
type Block = Record<string, unknown>;

function richText(value: string): RichText[] {
  const characters = Array.from(value);
  const parts: RichText[] = [];
  for (let index = 0; index < characters.length; index += 1800) {
    parts.push({ type: 'text', text: { content: characters.slice(index, index + 1800).join('') } });
  }
  return parts.length ? parts : [{ type: 'text', text: { content: '' } }];
}

function block(type: 'paragraph' | 'heading_2' | 'heading_3' | 'bulleted_list_item', value: string): Block {
  return { object: 'block', type, [type]: { rich_text: richText(value) } };
}

function koreanDateTime(iso: string): { title: string; notionDate: string } {
  const value = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'medium'
  }).format(new Date(iso));
  return { title: `${value.slice(0, 16)} 쇼핑 트렌드`, notionDate: `${value.replace(' ', 'T')}+09:00` };
}

function candidateBlocks(candidate: Candidate): Block[] {
  const signal = candidate.shopping;
  const change = signal.changePercent === null ? '기준 기간 평균 0' : `${signal.changePercent > 0 ? '+' : ''}${signal.changePercent}%`;
  return [
    block('heading_3', `TOP ${candidate.rank}${candidate.rank <= 3 ? ' ⭐' : ''} · ${candidate.keyword} · ${candidate.scores.totalScore}점`),
    block('bulleted_list_item', `Google: 표시 트래픽 ${candidate.google.approxTraffic.toLocaleString('ko-KR')}+ · ${candidate.google.publishedAt}`),
    block('bulleted_list_item', `Naver 쇼핑: 최근 3일 ${signal.recentAverage}, 이전 7일 ${signal.priorAverage} · ${change} (정규화 상대값)`),
    block('bulleted_list_item', `카테고리: ${candidate.category} · 점수: 트렌드 ${candidate.scores.trendScore}, 쇼핑 ${candidate.scores.shoppingScore}, 상품 ${candidate.scores.productFitScore}, 콘텐츠 ${candidate.scores.contentFitScore}`),
    block('paragraph', '사람이 확인할 것: 왜 지금 관심받는가? 실제 쿠팡 상품과 자연스럽게 연결되는가? Instagram에서 어떤 유용한 정보로 풀 것인가?')
  ];
}

export function notionReportPayload(report: Report, dataSourceId = NOTION_DATA_SOURCE_ID): Record<string, unknown> {
  const { title, notionDate } = koreanDateTime(report.generatedAt);
  const top3 = report.top3.map((candidate) => `${candidate.rank}. ${candidate.keyword} (${candidate.scores.totalScore}점)`).join(' · ') || '없음';
  const children: Block[] = [
    block('heading_2', '우선 확인 TOP 3'),
    block('paragraph', top3),
    block('paragraph', `Google 수집 ${report.counts.collected}개 · 미분류 ${report.counts.review}개 · 쇼핑 후보 ${report.counts.eligible}개 · 최종 후보 ${report.counts.ranked}개`),
    block('paragraph', '네이버 쇼핑 클릭 지표는 조회 구간의 정규화 상대값입니다. 절대 검색량·판매량이 아닙니다.'),
    ...report.notes.map((note) => block('bulleted_list_item', note)),
    block('heading_2', 'TOP 10')
  ];
  if (report.top10.length === 0) children.push(block('paragraph', '선정 가능한 후보가 없습니다. 점수나 키워드를 임의로 채우지 않았습니다.'));
  else children.push(...report.top10.flatMap(candidateBlocks));
  children.push(block('heading_2', '미분류 · 사람 확인'));
  if (report.review.length === 0) children.push(block('paragraph', '없음'));
  else children.push(...report.review.map((item) => block(
    'bulleted_list_item',
    `${item.keyword} · Google 표시 트래픽 ${item.approxTraffic.toLocaleString('ko-KR')}+ · ${item.reason}${item.newsTitles[0] ? ` · 관련 뉴스: ${item.newsTitles[0]}` : ''}`
  )));
  children.push(block('heading_2', '제외된 키워드'));
  if (report.excluded.length === 0) children.push(block('paragraph', '없음'));
  else children.push(...report.excluded.map((item) => block('bulleted_list_item', `${item.keyword}: ${item.reason}`)));
  if (children.length > 100) throw new Error('Notion 페이지 블록 100개 제한을 초과했습니다. 후보 수 또는 제외 목록을 줄이세요.');
  return {
    parent: { type: 'data_source_id', data_source_id: dataSourceId },
    properties: {
      '실행': { title: richText(title) },
      '실행시각': { date: { start: notionDate } },
      '상태': { select: { name: report.top10.length ? '후보 있음' : '후보 없음' } },
      'Google 수집': { number: report.counts.collected },
      '미분류 수': { number: report.counts.review },
      '쇼핑 후보': { number: report.counts.eligible },
      '최종 후보': { number: report.counts.ranked },
      'TOP 3': { rich_text: richText(top3) }
    },
    children
  };
}

export function notionTop3Payload(candidate: Candidate, report: Report, runPageId: string): Record<string, unknown> {
  const { notionDate } = koreanDateTime(report.generatedAt);
  const properties: Record<string, unknown> = {
    '키워드': { title: richText(candidate.keyword) },
    '발견시각': { date: { start: notionDate } },
    '순위': { number: candidate.rank },
    '총점': { number: candidate.scores.totalScore },
    '카테고리': { rich_text: richText(candidate.category) },
    '검토상태': { select: { name: '미검토' } },
    '실행기록': { relation: [{ id: runPageId }] }
  };
  if (candidate.shopping.changePercent !== null) {
    properties['쇼핑 변화율'] = { number: candidate.shopping.changePercent };
  }
  return {
    parent: { type: 'data_source_id', data_source_id: NOTION_TOP3_DATA_SOURCE_ID },
    properties,
    children: candidateBlocks(candidate)
  };
}

async function createPage(payload: Record<string, unknown>, token: string): Promise<{ id: string; url: string }> {
  if (!token.trim()) throw new Error('NOTION_TOKEN이 없습니다. 프로젝트 .env에 Notion 연동 토큰을 입력하세요.');
  const response = await fetch(NOTION_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) {
    let code = '';
    try {
      const body = await response.json() as { code?: string };
      code = body.code ? ` (${body.code})` : '';
    } catch { /* 오류 응답이 JSON이 아닐 수 있음 */ }
    throw new Error(`Notion 저장 실패: HTTP ${response.status}${code}. 토큰과 DB 연결 권한을 확인하세요.`);
  }
  const body = await response.json() as { id?: string; url?: string };
  if (!body.id || !body.url) throw new Error('Notion은 성공을 반환했지만 새 페이지 ID 또는 URL이 없습니다.');
  return { id: body.id, url: body.url };
}

export async function saveNotionReport(report: Report, token: string): Promise<{ runUrl: string; top3Saved: number }> {
  const runPage = await createPage(notionReportPayload(report), token);
  let top3Saved = 0;
  for (const candidate of report.top3) {
    try {
      await createPage(notionTop3Payload(candidate, report, runPage.id), token);
      top3Saved += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`실행 기록은 저장됐지만 TOP 3 후보 ${top3Saved}/${report.top3.length}개만 저장됐습니다. 실행 기록: ${runPage.url}. ${message}`);
    }
  }
  return { runUrl: runPage.url, top3Saved };
}
