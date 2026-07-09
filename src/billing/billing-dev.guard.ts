import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class BillingDevGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(_context: ExecutionContext): boolean {
    const nodeEnv = this.config.get<string>("NODE_ENV") ?? "development";
    const explicitlyEnabled =
      this.config.get<string>("ENABLE_DEV_BILLING_SIMULATOR") === "true";
    if (nodeEnv !== "production" || explicitlyEnabled) {
      return true;
    }
    throw new NotFoundException();
  }
}
