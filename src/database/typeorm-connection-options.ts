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
};

function baseOptions(env: DatabaseEnv) {
  const logging = env.DB_LOGGING === 'true';
  const url = env.DATABASE_URL?.trim();
  if (url) {
    return {
      type: 'postgres' as const,
      url,
      entities: [User],
      synchronize: false,
      logging,
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
