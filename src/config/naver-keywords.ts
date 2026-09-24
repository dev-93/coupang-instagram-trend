import type { ShoppingKeyword } from '../types.js';

// NAVER 쇼핑인사이트는 키워드를 발견하지 않고, 여기에 적은 상품 키워드의 클릭 추이를 조회한다.
// 실제 촬영하거나 소개할 만한 상품을 확인한 뒤 이 목록을 편집한다. Google RSS와 무관하게 조회한다.
export const naverKeywords: ShoppingKeyword[] = [
  { keyword: '양념 소불고기', category: '식품', categoryCode: '50000006', productFitScore: 85, contentFitScore: 85 },
  { keyword: '한우 국거리', category: '식품', categoryCode: '50000006', productFitScore: 85, contentFitScore: 80 },
  { keyword: '샤인머스캣', category: '식품', categoryCode: '50000006', productFitScore: 85, contentFitScore: 80 },
  { keyword: '밀폐용기', category: '생활/건강', categoryCode: '50000008', productFitScore: 85, contentFitScore: 80 },
  { keyword: '선크림', category: '화장품/미용', categoryCode: '50000002', productFitScore: 85, contentFitScore: 85 },
  { keyword: '에어프라이어', category: '디지털/가전', categoryCode: '50000003', productFitScore: 80, contentFitScore: 75 }
];
