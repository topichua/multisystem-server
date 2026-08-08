export type AnalyticsClientsScope = "period" | "lifetime";

export type AnalyticsClientsKpiMetric = {
  value: number;
  changePercent: number | null;
  scope: AnalyticsClientsScope;
};

export type AnalyticsClientsCurrencyMetric = AnalyticsClientsKpiMetric & {
  currency: string;
};

export type AnalyticsClientsKpiResult = {
  activeClients: AnalyticsClientsKpiMetric;
  newClients: AnalyticsClientsKpiMetric;
  /** Share of active period clients with lifetime order count ≥ 2 (0–100). */
  repeatPurchaseRate: AnalyticsClientsKpiMetric;
  averageCustomerValue: AnalyticsClientsCurrencyMetric;
  ordersPerClient: AnalyticsClientsKpiMetric;
  /** Median days between 1st and 2nd purchase; null if not enough data. */
  timeToRepurchaseDays: AnalyticsClientsKpiMetric;
};

export type AnalyticsNewVsRepeatSegment = {
  key: "new" | "repeat";
  clients: number;
  revenue: number;
  revenuePercent: number;
};

export type AnalyticsNewVsRepeatResult = {
  currency: string;
  totalRevenue: number;
  segments: AnalyticsNewVsRepeatSegment[];
};

export type AnalyticsRepeatFunnelStep = {
  key: "orders_1_plus" | "orders_2_plus" | "orders_3_plus" | "orders_4_plus";
  minOrders: number;
  clients: number;
  percent: number;
};

export type AnalyticsRepeatFunnelResult = {
  steps: AnalyticsRepeatFunnelStep[];
};

export type AnalyticsReturnTimingBucket = {
  key: "d0_7" | "d8_30" | "d31_60" | "d61_90" | "d90_plus";
  clients: number;
  percent: number;
};

export type AnalyticsReturnTimingResult = {
  buckets: AnalyticsReturnTimingBucket[];
};

export type AnalyticsWinBackBucket = {
  key: "d25_45" | "d46_90" | "d90_plus";
  clients: number;
};

export type AnalyticsWinBackResult = {
  buckets: AnalyticsWinBackBucket[];
  totalClients: number;
};

export type AnalyticsTopValuableClient = {
  clientId: number;
  name: string;
  avatar: string | null;
  /** Lifetime order count. */
  orders: number;
  periodRevenue: number;
  lastPurchaseAt: string | null;
  lifetimeValue: number;
  periodGrossProfit: number | null;
};

export type AnalyticsTopValuableClientsResult = {
  currency: string;
  customers: AnalyticsTopValuableClient[];
};

export type AnalyticsAcquisitionSource = {
  source: string;
  name: string;
  clients: number;
  percent: number;
};

export type AnalyticsAcquisitionSourcesResult = {
  totalNewClients: number;
  sources: AnalyticsAcquisitionSource[];
};

export type AnalyticsOneTimeBuyersResult = {
  clients: number;
  /** Share of customers with ≥1 lifetime order (0–100). */
  percentOfBase: number;
};
