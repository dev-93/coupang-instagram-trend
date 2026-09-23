export interface Trend {
  keyword: string;
  approxTraffic: number;
  publishedAt: string;
  newsTitles: string[];
  url: string;
}

export interface ClassifiedTrend extends Trend {
  category: string;
  categoryCode: string;
  productFitScore: number;
  contentFitScore: number;
}

export interface ShoppingSignal {
  keyword: string;
  categoryCode: string;
  startDate: string;
  endDate: string;
  recentAverage: number;
  priorAverage: number;
  changePercent: number | null;
  dataPoints: number;
  status: 'rising' | 'flat' | 'falling' | 'no_data';
}

export interface Candidate {
  rank: number;
  keyword: string;
  category: string;
  scores: {
    trendScore: number;
    shoppingScore: number;
    productFitScore: number;
    contentFitScore: number;
    totalScore: number;
  };
  google: Pick<Trend, 'approxTraffic' | 'publishedAt' | 'url' | 'newsTitles'>;
  shopping: ShoppingSignal;
}

export interface Report {
  date: string;
  generatedAt: string;
  timezone: 'Asia/Seoul';
  sources: { google: string; naver: string };
  counts: { collected: number; review: number; eligible: number; ranked: number };
  top3: Candidate[];
  top10: Candidate[];
  excluded: { keyword: string; reason: string }[];
  review: { keyword: string; approxTraffic: number; publishedAt: string; newsTitles: string[]; reason: string }[];
  notes: string[];
}
