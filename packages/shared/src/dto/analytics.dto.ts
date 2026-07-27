export interface AnalyticsOverviewDto {
  timeRange?: string;
}

export interface AnalyticsTimelineDto {
  timeRange?: string;
}

export interface AnalyticsSummary {
  totalRequests: number;
  uniqueVisitors: number;
  sessions: number;
  bandwidth: string; // e.g., "4.2 GB"
  errors: number;
  healthScore: number; // e.g., 98
}

export interface TrafficDataPoint {
  timestamp: string;
  requests: number;
  visitors: number;
}

export interface DistributionItem {
  name: string;
  value: number;
  percentage: number;
}

export interface AnalyticsDashboardDto {
  summary: AnalyticsSummary;
  trafficTimeline: TrafficDataPoint[];
  topBrowsers: DistributionItem[];
  topOs: DistributionItem[];
  topCountries: DistributionItem[];
}
