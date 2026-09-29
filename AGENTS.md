# Coupang Instagram Trend

- 가설: Google 급상승 검색어와 독립적으로 감시하는 네이버 쇼핑 키워드를 함께 보면, 사람이 쿠팡 파트너스용 Instagram 콘텐츠 실험 후보를 더 빨리 고를 수 있다. 전환이나 수익성은 아직 검증되지 않았다.
- 기술: Node.js 22+, TypeScript. `npm install` 후 `.env`에 NAVER API HUB 키와 Notion 토큰을 넣고 `npm run daily`를 실행한다. 실행마다 Notion 실행 기록 DB에 한 행을 추가하며, TOP 3가 있으면 후보 DB에 각각 기록한다. 로컬 Markdown/JSON 보고서와 Notion 원본 JSON 블록은 더 이상 생성하지 않는다.
- 성공 신호: 매일 확인할 만한 주제가 나오고, 직접 작성한 콘텐츠의 저장·클릭·파트너스 전환이 관찰된다. 중단 신호: 여러 실행에서 유효 후보가 거의 없거나 후보가 반복해서 콘텐츠·구매와 연결되지 않는다.
- 점검: `npm run check`, `npm test`, 실제 소스 사용 `npm run daily`. 로컬 API 키는 `.env`, Railway 수집용 키는 서비스 Variables, 수동 GitHub 실행용 키는 저장소 Secrets에만 두며 로그·커밋에 남기지 않는다. 수집은 Railway에서 한국시간 매일 17:00에 한 번, Codex 콘텐츠 해석·Telegram은 Mac에서 매일 18:00이다. 배포·운영 설정은 `docs/railway.md`에 기록한다. Instagram 자동 게시·자동 링크 생성은 범위 밖이다.

## MVP 원칙

- 유료 AI API를 사용하지 않는다.
- 후보 탐색과 점수화는 데이터 + 규칙 기반으로 처리한다.
- AI가 필요한 해석, Instagram 콘텐츠 초안, CTA 초안은 Codex/ChatGPT에서 수행한다. Mac launchd 예약이 ChatGPT로 로그인한 Codex CLI를 실행하며 `docs/content-briefing.md`를 따라 최신 Notion 기록과 웹 근거로 0~1개 실험안을 만든다. 기존 전송 코드가 결과를 검증해 Telegram에 전달한다. 유료 AI API는 연결하지 않는다.
- 기능 추가보다 실제 콘텐츠 실험과 전환 데이터 확보를 우선한다.
- 자동화 때문에 첫 게시가 늦어지는 기능은 구현하지 않는다.

## Daily 결과

`npm run daily`의 결과는 사람이 5분 안에 판단할 수 있어야 한다.

각 후보에는 최소한 다음 정보가 있어야 한다.

- 키워드
- Google Trends 신호 또는 미수집 표시
- Naver Shopping Insight 신호 또는 미수집 표시
- 예상 상품 카테고리
- trend / shopping / product-fit / content-fit 점수
- total score
- TOP 10 및 TOP 3 여부

## 데이터 해석

- Google Trends 급상승 = 구매 의도로 간주하지 않는다.
- Naver Shopping Insight 값은 절대 검색량으로 해석하지 않는다.
- 정치, 사건·사고, 스포츠 결과, 단순 연예 뉴스 등 상품 구매와 연결하기 어려운 주제는 낮은 점수를 준다.
- 건강 관련 주제는 과장된 효능이나 검증되지 않은 의학적 주장을 콘텐츠 아이디어로 만들지 않는다.
- 네이버 상품 키워드는 Google 결과에서 만들지 않는다. `src/config/naver-keywords.ts`의 감시 목록을 별도로 조회하고, 수집이 끝난 뒤에만 같은 키워드를 합친다. 감시 목록 자체를 인기 상품 발견 결과로 표현하지 않는다.
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

## 콘텐츠 실험안 전달

- 기존 Notion 수집·후보 DB를 유지하며 실험안용 새 DB를 만들지 않는다.
- `npm run briefing:read`로 최신 기록을 읽고, 검토한 JSON을 `npm run briefing:send -- .runtime/briefing.json`으로 처리한다. 비서 봇 연결 점검은 `npm run telegram:test`, 콘텐츠 봇 연결 점검은 `npm run telegram:test:content`다.
- 콘텐츠 실험안은 로컬 `.env`의 `TELEGRAM_BOT_TOKEN`으로 보내고, 수집 실패·예약 실패 알림은 `ASSISTANT_TELEGRAM_BOT_TOKEN`으로 비서 봇에 보낸다. 두 봇 모두 `ASSISTANT_TELEGRAM_CHAT_ID`가 비어 있으면 `TELEGRAM_CHAT_ID` 수신처를 사용한다. 토큰은 Mac 로컬 `.env`에만 둔다. 메시지는 항상 `[쿠팡]`으로 시작한다. `.runtime/`는 Git에서 제외한 처리·전송 이력이며 비밀값을 넣지 않는다.
- 점수나 키워드만으로 영상 반응·구매를 예상하지 않는다. 실제 불편 근거, 찍을 장면, 연결 상품의 필요, 미확인 사항을 구분한다. 근거가 부족하면 추천하지 않고 가설 또는 보류로 표시한다.
- 추천 상품을 보유하거나 직접 사용한다고 가정하지 않는다. 보유가 확인되지 않은 상품의 실물 시연·사용 후기·성능 테스트를 제안하지 말고, 촬영자가 이미 가진 일반 소품으로 문제 상황을 보여준다. 상품 설명은 확인한 판매 정보와 선택 기준으로 제한한다. 제품 실물이 없으면 성립하지 않는 아이디어는 보류한다.
- 동일 실행과 최근 7일의 동일 실험은 다시 보내지 않는다. 새 실험이 없으면 Telegram을 보내지 않는다. 수집 장애와 예약 브리핑 실행 실패는 각각 하루 최대 한 번 알린다. Telegram 전송 결과가 불확실하거나 앞선 전송이 pending이면 중복 방지를 위해 실패 알림을 재시도하지 않고 로컬 상태에 기록한다.
- Mac 예약은 `npm run schedule:install`로 등록하고 `npm run schedule:status`로 확인한다. Mac 로그인·전원·인터넷과 Codex CLI의 ChatGPT 로그인이 필요하며 Codex 앱 실행은 필요하지 않다. 잠자기 중 지난 예약은 깨어날 때 실행되며 당일 기록만 처리한다. Railway 수집 일정과 별개이며 등록 여부를 확인하지 않고 자동화가 켜졌다고 말하지 않는다. 해석 전에 당일 17:00 이후 Notion 기록과 출처 실패 경고를 확인한다. GitHub 수동 실행 이력은 예약 수집의 상태로 사용하지 않는다.

새 기능을 추가하기 전에
"이 기능이 내일 콘텐츠 하나를 더 빠르게 실험하게 만드는가?"
를 기준으로 판단한다.
