import { AppRole } from '../constants';

/** Attached to `req.user` after JWT validation. */
export type AuthUser = {
  userId: string;
  email: string;
  role: AppRole;
};
