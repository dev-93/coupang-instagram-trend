import 'dotenv/config';
import { collectNaverShopping } from './collectors/naver-shopping.js';
import { naverCredentials } from './config/env.js';
import type { ClassifiedTrend } from './types.js';

const { id, secret } = naverCredentials();
if (!id || !secret) {
  console.error('NAVER API HUB 인증정보가 없습니다. .env에 NAVER_CLIENT_ID와 NAVER_CLIENT_SECRET을 입력하세요.');
  process.exitCode = 1;
} else {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const sample: ClassifiedTrend = {
    keyword: '에어프라이어', category: '디지털/가전', categoryCode: '50000003',
    productFitScore: 80, contentFitScore: 75,
    approxTraffic: 0, publishedAt: new Date().toISOString(), newsTitles: [], url: ''
  };
  collectNaverShopping([sample], date, { id, secret })
    .then((signals) => console.log(JSON.stringify(signals.get(sample.keyword), null, 2)))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
