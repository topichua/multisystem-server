import type { WorkspaceEntitlementsSnapshot } from "./workspace-entitlements.interface";

export type PlanTemplateSeed = {
  slug: string;
  name: string;
  isPublic: boolean;
  sortOrder: number;
  priceMonthly: number;
  priceYearly: number;
  currency: string;
  entitlements: WorkspaceEntitlementsSnapshot;
};

export const DEFAULT_PLAN_TEMPLATES: PlanTemplateSeed[] = [
  {
    slug: "free",
    name: "Free",
    isPublic: true,
    sortOrder: 10,
    priceMonthly: 0,
    priceYearly: 0,
    currency: "UAH",
    entitlements: {
      socialAccountsLimit: 1,
      privateAccountsLimit: 0,
      wishlistEnabled: false,
      advancedInventoryEnabled: false,
      advancedAnalyticsEnabled: false,
      aiCreditsMonthly: 0,
    },
  },
  {
    slug: "starter",
    name: "Starter",
    isPublic: true,
    sortOrder: 20,
    priceMonthly: 2,
    priceYearly: 2,
    currency: "UAH",
    entitlements: {
      socialAccountsLimit: 2,
      privateAccountsLimit: 1,
      wishlistEnabled: true,
      advancedInventoryEnabled: false,
      advancedAnalyticsEnabled: false,
      aiCreditsMonthly: 100,
    },
  },
  {
    slug: "pro",
    name: "Pro",
    isPublic: true,
    sortOrder: 30,
    priceMonthly: 2,
    priceYearly: 2,
    currency: "UAH",
    entitlements: {
      socialAccountsLimit: 5,
      privateAccountsLimit: 3,
      wishlistEnabled: true,
      advancedInventoryEnabled: true,
      advancedAnalyticsEnabled: true,
      aiCreditsMonthly: 1000,
    },
  },
];

export const DEFAULT_FREE_PLAN_SLUG = "free";
