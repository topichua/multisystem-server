export type AnalyticsChartPoint = {
  label: string;
  dateFrom: string;
  dateTo: string;
  value: number;
};

export type AnalyticsRevenueChartResult = {
  points: AnalyticsChartPoint[];
};
