# Railway 수집 배치

수집만 Railway에서 실행한다. AI 해석과 Telegram 전송은 기존 Mac `launchd`의 매일 18:00 작업을 유지하며 유료 AI API를 연결하지 않는다. 기존 Notion 실행 기록·후보 DB를 그대로 사용한다.

## 운영 설정

- 프로젝트: [coupang-instagram-trend](https://railway.com/project/6054c6a3-14ae-420a-8383-7ea946a06388)
- 환경: `production`
- 서비스: `shopping-trend-collector`
- 소스: `dev-93/coupang-instagram-trend`, `main`

| 설정 | 값 |
| --- | --- |
| Builder | Dockerfile |
| Dockerfile path | `Dockerfile` |
| Start command | `timeout --kill-after=10s 600s npm run daily` |
| Cron schedule | `0 8 * * *` — UTC 08:00, 한국시간 매일 17:00 |
| Restart policy | `NEVER` |
| Region / replicas | Singapore / 1 |
| Public domain / healthcheck / volume | 사용하지 않음 |

수집이 끝나면 프로세스가 종료한다. 최대 10분 후 종료하고, 종료를 무시하면 10초 뒤 강제 종료해 다음날 예약이 겹쳐 생략되지 않도록 한다. 일부 출처 실패에도 Notion에 기록할 수 있으므로 자동 재시작을 하지 않는다. 재실행하면 새 Notion 행이 생긴다.

Railway cron은 UTC 기준이며 분 단위 정시 실행까지 보장하지 않는다. 몇 분 지연될 수 있다. [공식 cron 문서](https://docs.railway.com/cron-jobs)

## 배포와 비밀 변수

루트 `Dockerfile`은 `npm ci`, `npm run check`, `npm test`를 실행한 뒤 개발 패키지를 제거한다. 런타임에 필요한 `tsx`는 production dependency다. `.dockerignore`는 소스·테스트·패키지 설정만 허용하므로 `.env`, `.runtime`, Git 이력은 이미지에 포함되지 않는다.

서비스 Variables에는 `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`, `NOTION_TOKEN`만 등록한다. 기존 키를 Railway에 등록하는 사용자 지시에 따라 설정하며, 값은 코드·문서·로그에 쓰지 않는다. `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `ASSISTANT_TELEGRAM_BOT_TOKEN`, `ASSISTANT_TELEGRAM_CHAT_ID`와 Codex 로그인 정보는 Railway에 등록하지 않는다. 두 Telegram 봇의 설정은 Mac 로컬 `.env`에만 둔다. 보호된 비밀 변수 변경은 서비스 Variables에서 한다.

새 Railway 서비스는 기존 `railway.json` / `railway.toml` 설정을 사용할 수 없다. 이 프로젝트는 연결 도구로 실제 서비스 설정을 적용하고 이 문서에 기록한다. 이 문서를 수정하는 것만으로 예약이 변경되지는 않으므로 시간 변경 시 Railway 서비스 Settings도 변경한다. Infrastructure as Code를 추가로 도입하지 않는다. [공식 설정 전환 문서](https://docs.railway.com/infrastructure-as-code#migrating-from-config-as-code)

GitHub `main`의 수집 코드·설정 변경은 재배포 대상이다. Watch patterns는 `src/index.ts`, `src/collectors/**`, `src/config/**`, `src/filters/**`, `src/scoring/**`, `src/report/notion.ts`, `src/types.ts`, `test/pipeline.test.ts`, `test/notion.test.ts`, `package.json`, `package-lock.json`, `tsconfig.json`, `Dockerfile`, `.dockerignore`다. Mac 해석 코드와 문서만 바꿔도 수집이 다시 실행되는 상황을 피한다. 배포·수동 실행에서도 수집이 실행될 수 있다.

## 확인과 중단

배포 후 Runtime logs에서 Google·Naver 수집 개수, Notion 실행 기록 링크, TOP 3 저장 개수를 확인하고 정상 종료를 확인한다. Notion에 실제 새 행과 후보 관계가 생겼는지도 읽어서 점검한다. Railway에서 성공을 확인한 뒤 GitHub `daily.yml`의 `schedule`을 제거하며 `workflow_dispatch`는 수동 복구용으로 유지한다.

Mac 작업은 GitHub 실행 이력을 읽지 않고 당일 17:00 이후 Notion 기록과 출처 실패 경고를 확인한다. 오늘 기록이 없으면 Railway 실행 로그를 확인하라는 알림을 하루 최대 한 번 보낸다. 데이터 부족·상승 없음은 수집 실패로 취급하지 않는다.

중단할 때는 Railway 서비스 Settings의 Cron Schedule을 해제하고 서비스를 중지한다. Mac 해석·Telegram 예약은 `npm run schedule:remove`로 별도 해제한다. 단순한 코드 오류는 다음날 예약을 삭제하지 않지만 실패한 실행은 결과를 만들지 못할 수 있다. Railway 실행 비용과 Codex 구독 사용량은 각각 적용된다.

## 이전과 검증 기록 · 2026-09-28

기존 GitHub 예약이 2026-09-27 17:00 대신 22:21에 실행되어 Mac의 18:00 해석 시점에 당일 수집을 확인할 수 없었다. 수집을 별도 Railway 프로젝트로 옮겼다. 새 서비스에 수집용 비밀 변수 3개를 등록하고 실제 설정에서 `0 8 * * *`, `NEVER`, Dockerfile, 시작 명령과 Watch patterns를 확인했다. 처음 비밀 변수 없이 시작한 배포는 실패했으며 등록 후 재배포했다.

- 배포: `9ab9e49f-fb29-49f2-8287-e97689159fd7`, 수집 코드 커밋 `e53e032`.
- 실제 cron 수동 실행: 2026-09-28 00:42:57~00:43:07 한국시간, 약 10초. Railway 화면의 `Last run succeeded`와 `COMPLETED`를 확인했다.
- Google 10개 수집, 네이버 감시 키워드 6개 조회, [새 Notion 실행 기록](https://app.notion.com/p/2026-09-28-00-42-3e8eb93112d581f487c6ec86a9c1efd5) 저장을 로그와 Notion 재조회로 확인했다.
- 자정 직후 네이버 키워드 5개가 9/10일, 소불고기가 5/10일 관측이었다. 추이가 완성된 후보와 TOP 3는 0개로 기록했으며 데이터가 없는 날짜를 만들어 채우지 않았다. 수집·인증 오류는 없었다.
- 타입 검사와 테스트 24개가 로컬과 Railway Docker 빌드에서 통과했다. Mac의 18:00 등록을 유지하고 해석 코드가 Notion 기록을 읽도록 변경했다. 유료 AI API와 Railway의 AI 실행 서비스는 추가하지 않았다.
- Railway의 실제 수집·정상 종료 확인 후 GitHub `daily.yml`의 `schedule`을 제거했다. 수동 실행은 유지한다. 첫 17:00 정기 실행과 이후 Mac의 18:00 해석·발송은 다음 예약 시각에 확인한다.
