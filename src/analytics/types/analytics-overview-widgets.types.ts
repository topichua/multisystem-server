export type AnalyticsSalesChannelItem = {
  name: string;
  orders: number;
  percent: number;
};

export type AnalyticsSalesChannelsResult = {
  totalOrders: number;
  channels: AnalyticsSalesChannelItem[];
};

export type AnalyticsOrdersByStatusItem = {
  statusId: number;
  name: string;
  color: string | null;
  count: number;
  percent: number;
};

export type AnalyticsOrdersByStatusResult = {
  statuses: AnalyticsOrdersByStatusItem[];
};

export type AnalyticsTopProductItem = {
  productId: number;
  variantId: number;
  name: string;
  image: string | null;
  revenue: number;
  soldQuantity: number;
};

export type AnalyticsTopProductsResult = {
  products: AnalyticsTopProductItem[];
};

export type AnalyticsTopCustomerItem = {
  clientId: number;
  name: string;
  avatar: string | null;
  orders: number;
  spent: number;
};

export type AnalyticsTopCustomersResult = {
  customers: AnalyticsTopCustomerItem[];
};
