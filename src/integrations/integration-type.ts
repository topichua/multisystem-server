export const INTEGRATION_TYPES = ["instagram", "telegram", "novaposhta"] as const;
export type IntegrationType = (typeof INTEGRATION_TYPES)[number];
