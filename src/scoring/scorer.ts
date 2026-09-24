import { scoring } from '../config/rules.js';
import type { Candidate, CandidateInput, ShoppingSignal, Trend } from '../types.js';

const clamp = (value: number) => Math.max(0, Math.min(100, value));

export function scoreTrend(trend: Trend, now: Date): number {
  const traffic = trend.approxTraffic > 0 ? clamp(25 + 15 * Math.log10(trend.approxTraffic / 100)) : 0;
  const ageHours = Math.max(0, (now.getTime() - new Date(trend.publishedAt).getTime()) / 3_600_000);
  const freshness = clamp(35 - ageHours);
  return Math.round(clamp(traffic + freshness));
}

export function scoreShopping(signal: ShoppingSignal): number | null {
  if (signal.status === 'no_data') return null;
  if (signal.changePercent === null) return 70;
  return Math.round(clamp(50 + signal.changePercent / 2));
}

export function scoreCandidate(input: CandidateInput, now: Date): Candidate {
  const trendScore = input.google ? scoreTrend(input.google, now) : null;
  const shoppingScore = input.shopping ? scoreShopping(input.shopping) : null;
  const productFitScore = input.productFitScore;
  const contentFitScore = input.contentFitScore;
  const { weights } = scoring;
  const availableWeight = (trendScore === null ? 0 : weights.trend) +
    (shoppingScore === null ? 0 : weights.shopping) + weights.productFit + weights.contentFit;
  const totalScore = Math.round((
    (trendScore ?? 0) * weights.trend + (shoppingScore ?? 0) * weights.shopping +
    productFitScore * weights.productFit + contentFitScore * weights.contentFit
  ) / availableWeight);
  return {
    rank: 0, keyword: input.keyword, category: input.category,
    scores: { trendScore, shoppingScore, productFitScore, contentFitScore, totalScore },
    google: input.google ? {
      approxTraffic: input.google.approxTraffic, publishedAt: input.google.publishedAt,
      url: input.google.url, newsTitles: input.google.newsTitles
    } : null,
    shopping: input.shopping
  };
}
