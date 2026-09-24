# 쿠팡 파트너스 × Instagram 쇼핑 주제 탐지기

한국 Google Trends 급상승 RSS와 NAVER API HUB 쇼핑인사이트를 **서로 독립적으로 조회**합니다. Google은 급상승 검색어 중 상품 관련 키워드를 찾고, 네이버는 별도로 관리하는 상품 키워드의 쇼핑 클릭 추이를 확인합니다. 조회 후 같은 키워드만 합쳐 점수화합니다. 실행 개요와 TOP 10은 [Notion 실행 기록 DB](https://app.notion.com/p/862d974cfc5e4237bf8b912526205faf)에 저장하고, 우선 확인할 TOP 3는 [별도 후보 DB](https://app.notion.com/p/c8b5882a0efe465580822bc19cfc7d38)에 키워드별 행으로 저장합니다. 후보가 부족하면 실제 개수만 표시합니다. 새 Markdown/JSON 파일은 생성하지 않습니다.

콘텐츠 작성·상품 선택·파트너스 링크 생성·Instagram 게시는 사람이 합니다. AI API는 사용하지 않습니다.

## 준비

Node.js 22 이상이 필요합니다.

```bash
npm install
```

`.env`가 아직 없을 때만 `cp .env.example .env`로 만듭니다. 이미 네이버 키가 들어 있다면 파일을 덮어쓰지 말고 `NOTION_TOKEN` 한 줄을 추가하세요.

네이버 클라우드 플랫폼의 **NAVER API HUB**에서 쇼핑인사이트를 사용할 Application을 등록하고 Client ID/Secret을 `.env`에 입력합니다. Notion 내부 연동 토큰도 같은 파일의 `NOTION_TOKEN`에 입력하고, [실행 기록 DB](https://app.notion.com/p/862d974cfc5e4237bf8b912526205faf)를 해당 연동에 공유합니다. 쿠팡 파트너스 계정과는 별도입니다. 기존 `developers.naver.com` 키는 API HUB에서 사용할 수 없습니다. [네이버 API HUB 등록 방법](https://api.ncloud-docs.com/docs/naver-api-hub-overview), [키워드별 트렌드 API](https://api.ncloud-docs.com/docs/naver-api-hub-shopping-insight-keywords), [이관 안내](https://developers.naver.com/notice/article/32530).

```dotenv
NAVER_CLIENT_ID=발급한_ID
NAVER_CLIENT_SECRET=발급한_SECRET
NOTION_TOKEN=Notion_연동_토큰
```

`.env`는 Git에서 제외됩니다. 키를 채팅이나 이슈에 붙여 넣지 마세요. 이 프로젝트는 다른 프로젝트의 `.env`를 자동으로 읽지 않습니다.

`problem-radar`와 같은 NAVER 환경변수 이름 및 API HUB 인증 헤더를 사용합니다. 이전에 안내한 `NAVER_API_HUB_CLIENT_ID`/`NAVER_API_HUB_CLIENT_SECRET`도 호환을 위해 인식합니다.

네이버는 [`src/config/naver-keywords.ts`](src/config/naver-keywords.ts)의 상품 키워드를 Google 결과와 무관하게 매번 조회합니다. 처음에는 `양념 소불고기`, `한우 국거리` 등 6개를 예시 겸 감시 목록으로 넣었습니다. 실제 촬영하거나 소개할 상품에 맞춰 **키워드·카테고리 코드·적합성 점수**를 이 파일에서 수정하세요. 이 목록은 자동 발견한 유행 상품이 아닙니다. 네이버 키워드별 트렌드 API는 조회할 키워드와 쇼핑 카테고리 코드를 요청에 반드시 넣어야 합니다.

`npm run verify:naver`에서 HTTP 401이 나오면 [API HUB Application 관리](https://guide.ncloud-docs.com/docs/apihub-application)의 API 목록에서 **Data Lab → 쇼핑 인사이트**가 선택됐는지 확인하세요. 검색 API가 200이어도 쇼핑인사이트 권한은 별도입니다. 기존 Application을 수정하거나 쇼핑인사이트를 선택한 새 Application의 키를 이 프로젝트 `.env`에 넣으면 됩니다.

## 실행

```bash
npm run daily   # 한 번 실행
npm run dev     # 개발 중 파일 변경 시 재실행
npm run verify:naver # 키워드 1개로 네이버 인증·응답 확인
npm run check   # TypeScript 검사
npm test        # RSS 파싱·필터·쇼핑 추이 계산 점검
```

날짜와 실행시각은 한국시간 기준입니다. `npm run daily`를 실행할 때마다 실행 기록 DB에 새 행이 추가됩니다. 오전과 오후 실행을 각각 보존하며, 이전 행을 덮어쓰지 않습니다. 행의 `쇼핑 후보` 수는 네이버 감시 목록 중 유효한 추이를 받은 키워드 수입니다. 본문에는 Google 수집·상품 후보·미분류와 네이버 독립 조회·추이 확보 건수를 따로 표시합니다. **미분류 수**는 Google 키워드가 상품 카테고리 규칙과 매칭되지 않아 사람이 상품 연결 가능성을 살펴볼 항목의 수입니다. TOP 3가 있으면 후보 DB에 각 1행을 추가합니다. 후보의 `실행기록`과 실행 기록의 `우선 확인 후보`는 양방향 Notion 관계 속성이므로 어느 쪽에서도 연결된 행을 열 수 있습니다. 원본 JSON 코드 블록은 저장하지 않습니다. Notion 저장에 실패하면 명령이 오류로 종료하며, 로컬 보고서로 대체하지 않습니다. `output/`의 기존 파일은 이전 버전 실행 기록이며 새 파일은 생성하지 않습니다.

Notion DB는 이미 생성되어 있으며 매 실행마다 재생성하지 않습니다. DB 스키마와 행은 Notion에 보관하고, 코드의 [`src/report/notion.ts`](src/report/notion.ts)는 두 데이터 소스 ID와 사용하는 속성명·타입을 정의합니다. Notion에서 속성을 바꾸면 이 파일과 테스트도 함께 변경해야 합니다. 첫 실행 전에 연동에 **실행 기록 DB와 후보 DB 모두** 공유되어 있어야 합니다.

TOP 3 후보 DB의 표 컬럼은 `키워드`, `발견시각`, `예상 카테고리`, `총점`, `검토상태`, `실행기록`만 사용합니다. `예상 카테고리`는 규칙이 제안한 가설이며 확정 상품 분류가 아닙니다. 실행 내 TOP 1~3 순위와 네이버 쇼핑 클릭 상대지표의 최근 3일/이전 7일 비교는 후보 페이지 본문에 남깁니다. 사람이 쓰는 검토 메모도 페이지 본문의 `검토 메모` 섹션에 적습니다. 숫자 변화율은 판매량·절대 클릭 수 증가율이 아닙니다.

## 하루 두 번 자동 실행

공개 GitHub 저장소의 [Actions 워크플로](.github/workflows/daily.yml)가 한국시간 **08:00과 18:00**에 `npm run daily`를 실행합니다. Mac이 꺼져 있어도 실행됩니다. Actions 화면의 **Run workflow**로 수동 실행도 가능합니다. 워크플로는 `npm ci`, 타입 검사, 테스트를 통과한 뒤 Notion에 기록합니다.

GitHub 저장소의 **Settings → Secrets and variables → Actions → Repository secrets**에 `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`, `NOTION_TOKEN`을 각각 등록해야 합니다. 로컬 `.env`는 GitHub에 자동 전달되지 않으며 Git에서 제외됩니다. 비밀값을 코드·워크플로·커밋·이슈에 넣지 마세요. GitHub에서 예약 실행이 지연되거나 드물게 누락될 수 있으므로 Actions 실행 이력과 Notion 기록을 확인하세요. [GitHub 공식 일정 문서](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)에 따르면 **공개 저장소는 60일간 활동이 없으면 예약 실행이 자동 비활성화**될 수 있습니다. 이 경우 Actions에서 워크플로를 다시 활성화해야 합니다.

## 데이터와 점수의 의미

- Google: [Trending Now 한국 RSS](https://trends.google.com/trending/rss?geo=KR)의 최근 항목과 `approx_traffic` 표시값을 사용합니다. RSS는 전체 급상승 목록이 아니며 현재 응답은 소수의 최근 항목만 포함합니다. 관심이 높아도 제품과 무관한 뉴스가 많을 수 있습니다.
- 네이버: API HUB `POST /shopping/v1/category/keywords`에 별도 상품 감시 목록을 보냅니다. Google 결과가 0개여도 조회합니다. 같은 쇼핑 분야에서 최대 5개 키워드를 한 번에 요청합니다. 조회 종료일은 어제, 기간은 최근 10일입니다. 최근 3일의 평균을 앞선 7일 평균과 비교합니다. 값은 조회 구간 내 최대 클릭을 100으로 정규화한 **상대 비율**입니다. 절대 검색량·판매량이나 서로 다른 요청의 규모 비교에 사용하면 안 됩니다.
- 결합: Google 상품 후보와 네이버에서 추이를 확보한 감시 키워드를 합칩니다. 공백·대소문자를 정규화한 이름이 같을 때만 두 신호를 한 후보에 붙입니다. 한쪽에만 있는 후보도 남깁니다. 네이버 감시 목록과 정확히 일치한 Google 미분류 항목은 해당 상품 카테고리로 옮깁니다.
- 분류: Google에는 `src/config/rules.ts`의 카테고리 키워드와 제외 문맥 규칙을 적용합니다. 매칭되지 않은 주제는 **미분류 · 사람 확인**에 남깁니다. 낯선 키워드 하나마다 규칙을 추가할 필요는 없으며, 같은 유효 패턴이 반복될 때만 넓은 규칙을 추가합니다. 휴리스틱이므로 오탐과 누락을 검토해야 합니다.
- 점수: `src/config/rules.ts`에서 가중치, 기간, 최저 점수를 바꿀 수 있습니다. `trendScore`는 RSS 표시 트래픽과 신선도, `shoppingScore`는 같은 키워드의 기간 내 상대값 변화, 나머지 두 점수는 카테고리별 가설값입니다. 없는 출처의 점수는 `미수집`으로 표시하고, 있는 점수의 가중치만 재정규화해 0~100 총점을 계산합니다. 출처 수가 다른 후보의 총점은 같은 근거량을 뜻하지 않으므로 상세 신호를 함께 확인하세요. 네이버 일별 데이터가 빠지거나 전부 0인 감시 키워드는 네이버 후보에서 제외하되 Google 후보가 있으면 유지합니다.

Google 후보가 없어도 네이버 감시 목록은 조회합니다. 두 수집은 동시에 실행하며, 한쪽이 실패하면 다른 쪽의 결과와 실패 이유를 Notion에 기록하고 명령은 오류 코드로 끝납니다. 둘 다 실패하면 보고서를 만들지 않습니다. 검증되지 않은 점수를 넣거나 10개를 채우기 위해 데이터를 만들어내지 않습니다.

## 매일의 사용

1. `npm run daily` 실행 후 [TOP 3 후보 DB](https://app.notion.com/p/c8b5882a0efe465580822bc19cfc7d38)를 확인합니다. 비어 있으면 실행 기록의 **미분류 · 사람 확인**을 살핍니다.
2. 각 키워드의 실제 관심 이유, 쿠팡 상품 연결의 자연스러움, Instagram 정보성 콘텐츠 가치와 광고 표기 필요성을 사람이 검토합니다.
3. Notion 행 본문의 TOP 10을 ChatGPT에 가져가 “오늘 TOP 10 중 무엇을 콘텐츠로 만들지 분석해줘”라고 요청합니다.
4. 게시 후 저장·링크 클릭·파트너스 전환을 기록해 규칙이 쓸모 있는지 판단합니다.

Google RSS는 뉴스 편향이 있으므로 상품 감시 목록은 실제 Instagram 실험에 맞춰 조정해야 합니다. 감시 목록의 항목은 매번 조회되는 고정 입력이며, 총점이 높아도 실제 상승세가 아닐 수 있습니다. 후보의 최근·이전 쇼핑 클릭 추이와 변화율을 확인한 뒤 콘텐츠를 고르세요. Instagram 자동 게시는 범위 밖입니다.
