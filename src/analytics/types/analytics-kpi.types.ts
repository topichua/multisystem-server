export type AnalyticsKpiValue = {
  value: number;
  changePercent: number;
};

export type AnalyticsCurrencyKpiValue = AnalyticsKpiValue & {
  currency: string;
};

export type AnalyticsOverviewKpiResult = {
  revenue: AnalyticsCurrencyKpiValue;
  /** Sale − cost across order items (валовий прибуток). */
  grossProfit: AnalyticsCurrencyKpiValue;
  orders: AnalyticsKpiValue;
  averageOrderValue: AnalyticsCurrencyKpiValue;
  newClients: AnalyticsKpiValue;
};
