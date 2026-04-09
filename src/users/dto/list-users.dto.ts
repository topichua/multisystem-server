export type ListUsersQuery = {
  /** 1-based page index. Default 1. */
  page?: number;
  /** Page size. Default 20, max 100. */
  limit?: number;
};
