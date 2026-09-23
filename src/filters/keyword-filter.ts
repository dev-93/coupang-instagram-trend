import { categories, excludedContext } from '../config/rules.js';
import type { ClassifiedTrend, Trend } from '../types.js';

export function classifyTrend(trend: Trend): { value?: ClassifiedTrend; reason?: string; review?: boolean } {
  const context = [trend.keyword, ...trend.newsTitles].join(' ');
  const excluded = excludedContext.find((entry) => entry.pattern.test(context));
  if (excluded) return { reason: `${excluded.label} 문맥` };

  const category = categories.find((entry) => entry.pattern.test(trend.keyword));
  if (!category) return { reason: '상품 카테고리 미분류 — 사람 확인 필요', review: true };

  return {
    value: {
      ...trend,
      category: category.name,
      categoryCode: category.code,
      productFitScore: category.productFitScore,
      contentFitScore: category.contentFitScore
    }
  };
}
