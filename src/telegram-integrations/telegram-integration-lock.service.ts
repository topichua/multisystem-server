import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { TelegramIntegrationLock } from "../database/entities";

export const TELEGRAM_LISTENER_LOCK_TTL_SECONDS = 60;

export type TelegramLockAcquireResult =
  | { acquired: true; lockVersion: number; tookOverStale: boolean }
  | { acquired: false; ownerInstanceId?: string; expiresAt?: Date };

@Injectable()
export class TelegramIntegrationLockService {
  private readonly log = new Logger(TelegramIntegrationLockService.name);

  constructor(
    @InjectRepository(TelegramIntegrationLock)
    private readonly lockRepo: Repository<TelegramIntegrationLock>,
  ) {}

  async acquire(
    integrationId: number,
    instanceId: string,
  ): Promise<TelegramLockAcquireResult> {
    const existing = await this.lockRepo.findOne({
      where: { integrationId },
    });

    const rows: Array<{ lock_version: string | number }> =
      await this.lockRepo.manager.query(
        `
        INSERT INTO "telegram_integration_locks" (
          "integration_id",
          "locked_by_instance_id",
          "lock_version",
          "locked_at",
          "heartbeat_at",
          "expires_at",
          "created_at",
          "updated_at"
        )
        VALUES (
          $1,
          $2,
          1,
          now(),
          now(),
          now() + ($3::text || ' seconds')::interval,
          now(),
          now()
        )
        ON CONFLICT ("integration_id") DO UPDATE SET
          "locked_by_instance_id" = EXCLUDED."locked_by_instance_id",
          "lock_version" = "telegram_integration_locks"."lock_version" + 1,
          "locked_at" = now(),
          "heartbeat_at" = now(),
          "expires_at" = now() + ($3::text || ' seconds')::interval,
          "updated_at" = now()
        WHERE
          "telegram_integration_locks"."expires_at" < now()
          OR "telegram_integration_locks"."locked_by_instance_id" = EXCLUDED."locked_by_instance_id"
        RETURNING "lock_version"
        `,
        [integrationId, instanceId, String(TELEGRAM_LISTENER_LOCK_TTL_SECONDS)],
      );

    if (rows.length === 0) {
      const current = await this.lockRepo.findOne({
        where: { integrationId },
      });
      this.log.warn(
        `Telegram listener lock failed integration_id=${integrationId}: ` +
          `owned by instance=${current?.lockedByInstanceId ?? "unknown"} ` +
          `expires_at=${current?.expiresAt?.toISOString() ?? "n/a"}`,
      );
      return {
        acquired: false,
        ownerInstanceId: current?.lockedByInstanceId,
        expiresAt: current?.expiresAt,
      };
    }

    const lockVersion = Number(rows[0].lock_version);
    const tookOverStale =
      existing != null &&
      existing.lockedByInstanceId !== instanceId &&
      existing.expiresAt.getTime() <= Date.now();

    if (tookOverStale) {
      this.log.warn(
        `Telegram listener stale lock takeover integration_id=${integrationId}: ` +
          `previous_owner=${existing.lockedByInstanceId} new_owner=${instanceId} lock_version=${lockVersion}`,
      );
    } else {
      this.log.log(
        `Telegram listener lock acquired integration_id=${integrationId} ` +
          `instance=${instanceId} lock_version=${lockVersion}`,
      );
    }

    return { acquired: true, lockVersion, tookOverStale };
  }

  async heartbeat(
    integrationId: number,
    instanceId: string,
    lockVersion: number,
  ): Promise<boolean> {
    const result = await this.lockRepo
      .createQueryBuilder()
      .update(TelegramIntegrationLock)
      .set({
        heartbeatAt: () => "now()",
        expiresAt: () =>
          `now() + interval '${TELEGRAM_LISTENER_LOCK_TTL_SECONDS} seconds'`,
        updatedAt: () => "now()",
      })
      .where('"integration_id" = :integrationId', { integrationId })
      .andWhere('"locked_by_instance_id" = :instanceId', { instanceId })
      .andWhere('"lock_version" = :lockVersion', { lockVersion })
      .execute();

    const ok = (result.affected ?? 0) > 0;
    if (!ok) {
      this.log.warn(
        `Telegram listener heartbeat failed integration_id=${integrationId} ` +
          `instance=${instanceId} lock_version=${lockVersion}`,
      );
    }
    return ok;
  }

  async verifyFence(
    integrationId: number,
    instanceId: string,
    lockVersion: number,
  ): Promise<boolean> {
    const row = await this.lockRepo.findOne({ where: { integrationId } });
    if (!row) {
      return false;
    }
    if (row.lockedByInstanceId !== instanceId) {
      return false;
    }
    if (row.lockVersion !== lockVersion) {
      return false;
    }
    return row.expiresAt.getTime() > Date.now();
  }

  async release(
    integrationId: number,
    instanceId: string,
    lockVersion: number,
  ): Promise<void> {
    await this.lockRepo
      .createQueryBuilder()
      .update(TelegramIntegrationLock)
      .set({
        expiresAt: () => "now()",
        updatedAt: () => "now()",
      })
      .where('"integration_id" = :integrationId', { integrationId })
      .andWhere('"locked_by_instance_id" = :instanceId', { instanceId })
      .andWhere('"lock_version" = :lockVersion', { lockVersion })
      .execute();
  }
}
