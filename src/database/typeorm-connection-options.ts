import { DataSourceOptions } from 'typeorm';
import { CreateUsersTable1744200000001 } from './migrations/1744200000001-CreateUsersTable';
import { User } from '../users/entities/user.entity';

export type DatabaseEnv = {
  DATABASE_URL?: string;
  DB_HOST?: string;
  DB_PORT?: string;
  DB_USERNAME?: string;
  DB_PASSWORD?: string;
  DB_NAME?: string;
  DB_LOGGING?: string;
  /** `true` / `false` to force SSL on or off; omit for auto (e.g. SSL on Vercel). */
  DB_SSL?: string;
};

function sslOptions(env: DatabaseEnv):
  | undefined
  | false
  | { rejectUnauthorized: boolean } {
  if (env.DB_SSL === 'false') return false;
  if (env.DB_SSL === 'true') return { rejectUnauthorized: false };
  const url = env.DATABASE_URL?.trim();
  if (!url) return undefined;
  if (process.env.VERCEL === '1') {
    return { rejectUnauthorized: false };
  }
  if (
    url.includes('neon.tech') ||
    url.includes('supabase.co') ||
    /[?&]sslmode=require/i.test(url)
  ) {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

function baseOptions(env: DatabaseEnv) {
  const logging = env.DB_LOGGING === 'true';
  const url = env.DATABASE_URL?.trim();
  const ssl = sslOptions(env);
  if (url) {
    return {
      type: 'postgres' as const,
      url,
      entities: [User],
      synchronize: false,
      logging,
      ...(ssl ? { ssl } : {}),
    };
  }
  return {
    type: 'postgres' as const,
    host: env.DB_HOST ?? 'localhost',
    port: parseInt(env.DB_PORT ?? '5432', 10),
    username: env.DB_USERNAME ?? 'postgres',
    password: env.DB_PASSWORD ?? 'postgres',
    database: env.DB_NAME ?? 'multisystem',
    entities: [User],
    synchronize: false,
    logging,
    ...(ssl ? { ssl } : {}),
  };
}

/** Options for Nest `TypeOrmModule` (no migrations). */
export function getTypeOrmModuleOptions(env: DatabaseEnv) {
  return baseOptions(env);
}

/** Full `DataSource` options including migrations (CLI). */
export function getDataSourceOptions(env: DatabaseEnv): DataSourceOptions {
  return {
    ...baseOptions(env),
    migrations: [CreateUsersTable1744200000001],
  };
}
