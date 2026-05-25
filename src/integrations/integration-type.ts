export const INTEGRATION_TYPES = ["instagram", "telegram"] as const;
export type IntegrationType = (typeof INTEGRATION_TYPES)[number];
