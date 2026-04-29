import { DataSourceOptions } from 'typeorm';
import { InitialSchema1744200000001 } from './migrations/1744200000001-InitialSchema';
import { ConversationParticipantString1744200000002 } from './migrations/1744200000002-ConversationParticipantString';
import { ConversationMessageEditedAt1744200000003 } from './migrations/1744200000003-ConversationMessageEditedAt';
import { InstagramUserScopedId1744200000004 } from './migrations/1744200000004-InstagramUserScopedId';
import { InstagramUserScopedIdPK1744200000005 } from './migrations/1744200000005-InstagramUserScopedIdPK';
import { InstagramUserIdColumnNames1744200000006 } from './migrations/1744200000006-InstagramUserIdColumnNames';
import { ConversationMessageReplyToId1744200000007 } from './migrations/1744200000007-ConversationMessageReplyToId';
import { CompanyInstagramAccountId1744200000008 } from './migrations/1744200000008-CompanyInstagramAccountId';
import { CompanyBusinessAccountIdRename1744200000009 } from './migrations/1744200000009-CompanyBusinessAccountIdRename';
import { ConversationMessageReadAt1744200000010 } from './migrations/1744200000010-ConversationMessageReadAt';
import { ConversationMessageReplyParentExternalId1744200000011 } from './migrations/1744200000011-ConversationMessageReplyParentExternalId';
import { ConversationMessageExternalIdPK1744200000012 } from './migrations/1744200000012-ConversationMessageExternalIdPK';
import {
  Client,
  Company,
  Conversation,
  ConversationGroup,
  ConversationMessage,
  InstagramUser,
  Source,
  User,
} from './entities';

export type DatabaseEnv = {
  DATABASE_URL?: string;
  DB_HOST?: string;
  DB_PORT?: string;
  DB_USERNAME?: string;
  DB_PASSWORD?: string;
  DB_NAME?: string;
  DB_LOGGING?: string;
};

const entities = [
  User,
  Company,
  Source,
  InstagramUser,
  Client,
  ConversationGroup,
  Conversation,
  ConversationMessage,
];

function baseOptions(env: DatabaseEnv) {
  const logging = env.DB_LOGGING === 'true';
  const url = env.DATABASE_URL?.trim();
  if (url) {
    return {
      type: 'postgres' as const,
      url,
      entities,
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
    entities,
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
    migrations: [
      InitialSchema1744200000001,
      ConversationParticipantString1744200000002,
      ConversationMessageEditedAt1744200000003,
      InstagramUserScopedId1744200000004,
      InstagramUserScopedIdPK1744200000005,
      InstagramUserIdColumnNames1744200000006,
      ConversationMessageReplyToId1744200000007,
      CompanyInstagramAccountId1744200000008,
      CompanyBusinessAccountIdRename1744200000009,
      ConversationMessageReadAt1744200000010,
      ConversationMessageReplyParentExternalId1744200000011,
      ConversationMessageExternalIdPK1744200000012,
    ],
  };
}
