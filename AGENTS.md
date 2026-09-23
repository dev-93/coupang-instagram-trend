# Coupang Instagram Trend

- 가설: 한국 급상승 검색어 중 실제 쇼핑 클릭 관심이 올라가는 주제를 찾으면, 사람이 쿠팡 파트너스용 Instagram 정보 콘텐츠 실험 후보를 더 빨리 고를 수 있다. 전환이나 수익성은 아직 검증되지 않았다.
- 기술: Node.js 22+, TypeScript. `npm install` 후 `.env`에 NAVER API HUB 키와 Notion 토큰을 넣고 `npm run daily`를 실행한다. 실행마다 Notion 실행 기록 DB에 한 행을 추가하며, TOP 3가 있으면 후보 DB에 각각 기록한다. 로컬 Markdown/JSON 보고서와 Notion 원본 JSON 블록은 더 이상 생성하지 않는다.
- 성공 신호: 매일 확인할 만한 주제가 나오고, 직접 작성한 콘텐츠의 저장·클릭·파트너스 전환이 관찰된다. 중단 신호: 여러 실행에서 유효 후보가 거의 없거나 후보가 반복해서 콘텐츠·구매와 연결되지 않는다.
- 점검: `npm run check`, `npm test`, 실제 소스 사용 `npm run daily`. 로컬 API 키는 `.env`, GitHub Actions용 키는 저장소 Secrets에만 두며 로그·커밋에 남기지 않는다. 한국시간 08:00·18:00에 수집을 예약하며, Instagram 자동 게시·자동 링크 생성은 범위 밖이다.

## MVP 원칙

- 유료 AI API를 사용하지 않는다.
- 후보 탐색과 점수화는 데이터 + 규칙 기반으로 처리한다.
- AI가 필요한 해석, Instagram 콘텐츠 작성, CTA 작성은 사람이 ChatGPT에서 수행한다.
- 기능 추가보다 실제 콘텐츠 실험과 전환 데이터 확보를 우선한다.
- 자동화 때문에 첫 게시가 늦어지는 기능은 구현하지 않는다.

## Daily 결과

`npm run daily`의 결과는 사람이 5분 안에 판단할 수 있어야 한다.

각 후보에는 최소한 다음 정보가 있어야 한다.

- 키워드
- Google Trends 신호
- Naver Shopping Insight 신호
- 예상 상품 카테고리
- trend / shopping / product-fit / content-fit 점수
- total score
- TOP 10 및 TOP 3 여부

## 데이터 해석

- Google Trends 급상승 = 구매 의도로 간주하지 않는다.
- Naver Shopping Insight 값은 절대 검색량으로 해석하지 않는다.
- 정치, 사건·사고, 스포츠 결과, 단순 연예 뉴스 등 상품 구매와 연결하기 어려운 주제는 낮은 점수를 준다.
- 건강 관련 주제는 과장된 효능이나 검증되지 않은 의학적 주장을 콘텐츠 아이디어로 만들지 않는다.
- 필터 및 scoring 규칙은 코드에 흩어놓지 말고 쉽게 수정 가능한 설정으로 관리한다.

## 개발 우선순위

현재 우선순위:

1. 실제 데이터 수집 안정성
2. 후보 품질
3. Notion 기록
4. 사람이 TOP 3를 빠르게 판단할 수 있는 결과
5. 실제 Instagram 실험 데이터 축적

현재 만들지 않는 것:

- Instagram 자동 게시
- Instagram 자동 DM
- Coupang Partners 링크 자동 생성
- 유료 AI API 연동
- 복잡한 대시보드
- 필요성이 검증되지 않은 추상화/인프라

새 기능을 추가하기 전에
"이 기능이 내일 콘텐츠 하나를 더 빠르게 실험하게 만드는가?"
를 기준으로 판단한다.
