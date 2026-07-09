export type AnalyticsKpiValue = {
  value: number;
  changePercent: number;
};

export type AnalyticsCurrencyKpiValue = AnalyticsKpiValue & {
  currency: string;
};

export type AnalyticsOverviewKpiResult = {
  revenue: AnalyticsCurrencyKpiValue;
  orders: AnalyticsKpiValue;
  averageOrderValue: AnalyticsCurrencyKpiValue;
  newClients: AnalyticsKpiValue;
};
