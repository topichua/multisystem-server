/**
 * Product list sort modes (admin catalog UI).
 * Query: `GET /products?sort=...`
 */
export enum ProductListSort {
  /** Newest first — `created_at` DESC */
  created_desc = "created_desc",
  /** Oldest first — `created_at` ASC */
  created_asc = "created_asc",
  /** Name A–Z */
  name_asc = "name_asc",
  /** Name Z–A */
  name_desc = "name_desc",
  /** Price low → high */
  price_asc = "price_asc",
  /** Price high → low */
  price_desc = "price_desc",
}
