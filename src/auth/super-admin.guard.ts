import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ROLE_SUPER_ADMIN } from './constants';
import type { AuthUser } from './types/auth-user.type';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (req.user?.role !== ROLE_SUPER_ADMIN) {
      throw new ForbiddenException();
    }
    return true;
  }
}
