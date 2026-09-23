// 실험용 휴리스틱. 키워드와 뉴스 제목의 문맥을 함께 보되, 모르는 주제는 보수적으로 제외한다.
export const excludedContext: { label: string; pattern: RegExp }[] = [
  { label: '정치', pattern: /대통령|국회|의원|정당|선거|탄핵|장관|정치|총리/ },
  { label: '스포츠 경기', pattern: /야구|축구|농구|배구|경기|리그|스코어|득점|홈런|감독|선수|라이온즈|타이거즈|베어스|이글스/ },
  { label: '사건·사고', pattern: /사망|살인|사고|화재|폭행|체포|재판|구속|피해|실종/ },
  { label: '연예 뉴스', pattern: /배우|가수|드라마|영화|아이돌|방송|연예|결혼설|열애/ },
  { label: '일회성 뉴스', pattern: /업데이트|발표|논란|속보|기자회견|주가|증시/ }
];

export const categories = [
  { name: '식품', code: '50000006', pattern: /음식|식품|식재료|과일|채소|고기|육류|생선|김치|반찬|라면|커피|차|간식|빵|쌀|단백질|다이어트|식단|요리|레시피|추석|명절/, productFitScore: 85, contentFitScore: 85 },
  { name: '생활/건강', code: '50000008', pattern: /생활|청소|세제|수납|욕실|세탁|영양제|건강|비타민|마스크|가습기|선풍기|난방|핫팩|텀블러|주방|냄비|프라이팬|칼|식기/, productFitScore: 85, contentFitScore: 80 },
  { name: '화장품/미용', code: '50000002', pattern: /뷰티|화장품|메이크업|선크림|선스틱|스킨케어|피부|립스틱|향수|헤어|샴푸|로션/, productFitScore: 85, contentFitScore: 85 },
  { name: '디지털/가전', code: '50000003', pattern: /냉장고|에어컨|에어프라이어|청소기|전자레인지|노트북|태블릿|이어폰|스마트폰|갤럭시|아이폰|충전기|모니터/, productFitScore: 80, contentFitScore: 75 },
  { name: '패션의류', code: '50000000', pattern: /옷|의류|패션|코트|재킷|원피스|셔츠|바지|니트|패딩/, productFitScore: 80, contentFitScore: 75 },
  { name: '스포츠/레저', code: '50000007', pattern: /운동화|러닝화|등산화|캠핑|등산|요가|필라테스|헬스|자전거/, productFitScore: 80, contentFitScore: 80 }
] as const;

export const scoring = {
  weights: { trend: 0.25, shopping: 0.35, productFit: 0.25, contentFit: 0.15 },
  // 최근 3일과 이전 7일 비교. 마지막 날의 집계 지연을 피하기 위해 어제까지만 사용.
  recentDays: 3,
  priorDays: 7,
  minimumTotalScore: 45
} as const;
