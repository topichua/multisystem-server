export const INTEGRATION_TYPES = [
  "instagram",
  "telegram",
  "novaposhta",
] as const;
export type IntegrationType = (typeof INTEGRATION_TYPES)[number];

/** Integrations that support product reference grants. */
export const PRODUCT_REFERENCE_INTEGRATION_TYPES = [
  "instagram",
  "telegram",
] as const;
export type ProductReferenceIntegrationType =
  (typeof PRODUCT_REFERENCE_INTEGRATION_TYPES)[number];
