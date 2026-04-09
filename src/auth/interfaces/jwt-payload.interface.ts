import { AppRole } from '../constants';

export interface JwtPayload {
  sub: string;
  email: string;
  role: AppRole;
}
