import type { CandidateInput, ClassifiedTrend, ShoppingKeyword, ShoppingSignal, Trend } from '../types.js';

export function keywordKey(keyword: string): string {
  return keyword.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g, '');
}

// 두 수집 결과를 모두 얻은 뒤 같은 키워드만 합친다. 어느 수집기도 다른 수집기의 후보를 입력받지 않는다.
export function mergeCandidatePool(
  googleCandidates: ClassifiedTrend[],
  googleReview: Trend[],
  naverKeywords: ShoppingKeyword[],
  shopping: Map<string, ShoppingSignal>
): { inputs: CandidateInput[]; naverWithData: number; naverNoData: { keyword: string; dataPoints: number }[]; promotedReview: Set<string> } {
  const inputs = new Map<string, CandidateInput>();
  const reviewByKeyword = new Map(googleReview.map((trend) => [keywordKey(trend.keyword), trend]));
  const promotedReview = new Set<string>();
  const naverNoData: { keyword: string; dataPoints: number }[] = [];
  let naverWithData = 0;

  for (const trend of googleCandidates) {
    inputs.set(keywordKey(trend.keyword), {
      keyword: trend.keyword, category: trend.category, categoryCode: trend.categoryCode,
      productFitScore: trend.productFitScore, contentFitScore: trend.contentFitScore,
      google: trend, shopping: null
    });
  }

  for (const seed of naverKeywords) {
    const signal = shopping.get(seed.keyword);
    if (!signal || signal.status === 'no_data') {
      naverNoData.push({ keyword: seed.keyword, dataPoints: signal?.dataPoints ?? 0 });
      continue;
    }
    naverWithData += 1;
    const key = keywordKey(seed.keyword);
    const existing = inputs.get(key);
    if (existing) {
      existing.category = seed.category;
      existing.categoryCode = seed.categoryCode;
      existing.productFitScore = seed.productFitScore;
      existing.contentFitScore = seed.contentFitScore;
      existing.shopping = signal;
      continue;
    }
    const reviewedTrend = reviewByKeyword.get(key) ?? null;
    if (reviewedTrend) promotedReview.add(key);
    inputs.set(key, { ...seed, google: reviewedTrend, shopping: signal });
  }

  return { inputs: [...inputs.values()], naverWithData, naverNoData, promotedReview };
}
