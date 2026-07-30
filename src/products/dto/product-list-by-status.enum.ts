/**
 * Coarse status filter for product / variant list endpoints.
 * Prefer this over exact `status` when the UI only needs active vs archived buckets.
 */
export enum ProductListByStatus {
  all = "all",
  onlyActive = "onlyActive",
  onlyArchived = "onlyArchived",
}
