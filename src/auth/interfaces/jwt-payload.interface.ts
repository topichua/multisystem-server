import { AppRole } from "../constants";

export interface JwtPayload {
  sub: string;
  email: string;
  role: AppRole;
  /** Active workspace selected for this session (optional). */
  workspaceId?: number;
}
