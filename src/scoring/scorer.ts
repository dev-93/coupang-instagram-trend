import { scoring } from '../config/rules.js';
import type { Candidate, ClassifiedTrend, ShoppingSignal } from '../types.js';

const clamp = (value: number) => Math.max(0, Math.min(100, value));

export function scoreTrend(trend: ClassifiedTrend, now: Date): number {
  const traffic = trend.approxTraffic > 0 ? clamp(25 + 15 * Math.log10(trend.approxTraffic / 100)) : 0;
  const ageHours = Math.max(0, (now.getTime() - new Date(trend.publishedAt).getTime()) / 3_600_000);
  const freshness = clamp(35 - ageHours);
  return Math.round(clamp(traffic + freshness));
}

export function scoreShopping(signal: ShoppingSignal): number {
  if (signal.status === 'no_data') return 0;
  if (signal.changePercent === null) return 70;
  return Math.round(clamp(50 + signal.changePercent / 2));
}

export function scoreCandidate(trend: ClassifiedTrend, shopping: ShoppingSignal, now: Date): Candidate {
  const trendScore = scoreTrend(trend, now);
  const shoppingScore = scoreShopping(shopping);
  const productFitScore = trend.productFitScore;
  const contentFitScore = trend.contentFitScore;
  const { weights } = scoring;
  const totalScore = Math.round(
    trendScore * weights.trend + shoppingScore * weights.shopping +
    productFitScore * weights.productFit + contentFitScore * weights.contentFit
  );
  return {
    rank: 0, keyword: trend.keyword, category: trend.category,
    scores: { trendScore, shoppingScore, productFitScore, contentFitScore, totalScore },
    google: {
      approxTraffic: trend.approxTraffic, publishedAt: trend.publishedAt,
      url: trend.url, newsTitles: trend.newsTitles
    },
    shopping
  };
}
