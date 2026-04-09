export type ChangePersonalInfoInput = {
  firstName?: string;
  lastName?: string | null;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  streetLine1?: string | null;
  streetLine2?: string | null;
  postalCode?: string | null;
  metadata?: Record<string, unknown>;
  /** Normalized and stored as mobile_phone_hash (SHA-256); never stored raw. */
  mobilePhonePlain?: string | null;
};
