import { DataSourceOptions } from "typeorm";
import { InitialSchema1744200000001 } from "./migrations/1744200000001-InitialSchema";
import { ConversationParticipantString1744200000002 } from "./migrations/1744200000002-ConversationParticipantString";
import { ConversationMessageEditedAt1744200000003 } from "./migrations/1744200000003-ConversationMessageEditedAt";
import { InstagramUserScopedId1744200000004 } from "./migrations/1744200000004-InstagramUserScopedId";
import { InstagramUserScopedIdPK1744200000005 } from "./migrations/1744200000005-InstagramUserScopedIdPK";
import { InstagramUserIdColumnNames1744200000006 } from "./migrations/1744200000006-InstagramUserIdColumnNames";
import { ConversationMessageReplyToId1744200000007 } from "./migrations/1744200000007-ConversationMessageReplyToId";
import { CompanyInstagramAccountId1744200000008 } from "./migrations/1744200000008-CompanyInstagramAccountId";
import { CompanyBusinessAccountIdRename1744200000009 } from "./migrations/1744200000009-CompanyBusinessAccountIdRename";
import { ConversationMessageReadAt1744200000010 } from "./migrations/1744200000010-ConversationMessageReadAt";
import { ConversationMessageReplyParentExternalId1744200000011 } from "./migrations/1744200000011-ConversationMessageReplyParentExternalId";
import { ConversationMessageExternalIdPK1744200000012 } from "./migrations/1744200000012-ConversationMessageExternalIdPK";
import { CompanyFacebookOAuthFields1744200000013 } from "./migrations/1744200000013-CompanyFacebookOAuthFields";
import { CompanyDropFacebookUserAccessToken1744200000014 } from "./migrations/1744200000014-CompanyDropFacebookUserAccessToken";
import { CompanyDropBusinessAccountId1744200000015 } from "./migrations/1744200000015-CompanyDropBusinessAccountId";
import { CompanyAccessTokenRenameLongToken1744200000016 } from "./migrations/1744200000016-CompanyAccessTokenRenameLongToken";
import { CompanyLongTokenRenameAccessToken1744200000017 } from "./migrations/1744200000017-CompanyLongTokenRenameAccessToken";
import { CompanyUserAccessTokenSplit1744200000018 } from "./migrations/1744200000018-CompanyUserAccessTokenSplit";
import { ConversationGroupDescriptionColorCreated1744200000019 } from "./migrations/1744200000019-ConversationGroupDescriptionColorCreated";
import { DropSourcesTable1744200000020 } from "./migrations/1744200000020-DropSourcesTable";
import { CompanyTableRenameToIntegration1744200000021 } from "./migrations/1744200000021-CompanyTableRenameToIntegration";
import { WorkspaceIntegrationGroupsClients1744200000022 } from "./migrations/1744200000022-WorkspaceIntegrationGroupsClients";
import { ClientsInstagramUserIdNullable1744200000023 } from "./migrations/1744200000023-ClientsInstagramUserIdNullable";
import { ProductCategories1744200000024 } from "./migrations/1744200000024-ProductCategories";
import { ProductCategoriesIntegerIds1744200000025 } from "./migrations/1744200000025-ProductCategoriesIntegerIds";
import { ProductCategoriesCreatedBySoftDelete1744200000026 } from "./migrations/1744200000026-ProductCategoriesCreatedBySoftDelete";
import { ProductCatalog1744200000027 } from "./migrations/1744200000027-ProductCatalog";
import { DropProductsCategoriesPivot1744200000028 } from "./migrations/1744200000028-DropProductsCategoriesPivot";
import { ProductMediaVariantId1744200000029 } from "./migrations/1744200000029-ProductMediaVariantId";
import { WorkspaceDefaultCurrency1744200000030 } from "./migrations/1744200000030-WorkspaceDefaultCurrency";
import { ProductVariantStatus1744200000031 } from "./migrations/1744200000031-ProductVariantStatus";
import { OrdersModule1744200000032 } from "./migrations/1744200000032-OrdersModule";
import { OrderStatusIsSystemAndDeliveryCategory1744200000034 } from "./migrations/1744200000034-OrderStatusIsSystemAndDeliveryCategory";
import { ProductType1744200000035 } from "./migrations/1744200000035-ProductType";
import { IntegrationRenameToInstagramIntegration1744200000036 } from "./migrations/1744200000036-IntegrationRenameToInstagramIntegration";
import { TelegramIntegrations1744200000037 } from "./migrations/1744200000037-TelegramIntegrations";
import { ConversationSourceTelegram1744200000038 } from "./migrations/1744200000038-ConversationSourceTelegram";
import { WorkspaceRolesAndMembers1744200000039 } from "./migrations/1744200000039-WorkspaceRolesAndMembers";
import { WorkspaceMemberIntegrationScopes1744200000040 } from "./migrations/1744200000040-WorkspaceMemberIntegrationScopes";
import {
  Client,
  Company,
  Conversation,
  ConversationGroup,
  ConversationMessage,
  InstagramUser,
  Order,
  OrderDeliveryInfo,
  OrderEvent,
  OrderItem,
  OrderStatus,
  Product,
  ProductCategory,
  ProductMedia,
  ProductSourceReference,
  ProductVariant,
  TelegramIntegration,
  User,
  Workspace,
  WorkspaceInvitation,
  WorkspaceMember,
  WorkspaceRole,
} from "./entities";

export type DatabaseEnv = {
  DATABASE_URL?: string;
  DB_HOST?: string;
  DB_PORT?: string;
  DB_USERNAME?: string;
  DB_PASSWORD?: string;
  DB_NAME?: string;
  DB_LOGGING?: string;
  DB_SSL?: string;
  NODE_ENV?: string;
};

function resolvePostgresSsl(
  env: DatabaseEnv,
  url?: string,
  host?: string,
): false | { rejectUnauthorized: boolean } {
  const flag = env.DB_SSL?.trim().toLowerCase();
  if (flag === "false" || flag === "0" || flag === "off") {
    return false;
  }
  if (flag === "true" || flag === "1" || flag === "on") {
    return { rejectUnauthorized: false };
  }
  if (env.NODE_ENV === "production") {
    return { rejectUnauthorized: false };
  }
  if (url) {
    try {
      const parsed = new URL(url);
      const sslmode = parsed.searchParams.get("sslmode")?.toLowerCase();
      if (sslmode === "require" || sslmode === "verify-full") {
        return { rejectUnauthorized: false };
      }
      if (parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
        return { rejectUnauthorized: false };
      }
    } catch {
      /* not a URL */
    }
  }
  const h = host?.trim();
  if (h && h !== "localhost" && h !== "127.0.0.1") {
    return { rejectUnauthorized: false };
  }
  return false;
}

const entities = [
  User,
  Workspace,
  WorkspaceRole,
  WorkspaceMember,
  WorkspaceInvitation,
  Company,
  TelegramIntegration,
  InstagramUser,
  Client,
  ConversationGroup,
  Conversation,
  ConversationMessage,
  ProductCategory,
  Product,
  ProductVariant,
  ProductMedia,
  ProductSourceReference,
  OrderStatus,
  Order,
  OrderItem,
  OrderDeliveryInfo,
  OrderEvent,
];

function baseOptions(env: DatabaseEnv) {
  const logging = env.DB_LOGGING === "true";
  const url = env.DATABASE_URL?.trim();
  if (url) {
    const ssl = resolvePostgresSsl(env, url);
    return {
      type: "postgres" as const,
      url,
      ...(ssl ? { ssl } : {}),
      entities,
      synchronize: false,
      logging,
    };
  }
  const host = env.DB_HOST ?? "localhost";
  const ssl = resolvePostgresSsl(env, undefined, host);
  return {
    type: "postgres" as const,
    host,
    port: parseInt(env.DB_PORT ?? "5432", 10),
    username: env.DB_USERNAME ?? "postgres",
    password: env.DB_PASSWORD ?? "postgres",
    database: env.DB_NAME ?? "multisystem",
    ...(ssl ? { ssl } : {}),
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
      CompanyFacebookOAuthFields1744200000013,
      CompanyDropFacebookUserAccessToken1744200000014,
      CompanyDropBusinessAccountId1744200000015,
      CompanyAccessTokenRenameLongToken1744200000016,
      CompanyLongTokenRenameAccessToken1744200000017,
      CompanyUserAccessTokenSplit1744200000018,
      ConversationGroupDescriptionColorCreated1744200000019,
      DropSourcesTable1744200000020,
      CompanyTableRenameToIntegration1744200000021,
      WorkspaceIntegrationGroupsClients1744200000022,
      ClientsInstagramUserIdNullable1744200000023,
      ProductCategories1744200000024,
      ProductCategoriesIntegerIds1744200000025,
      ProductCategoriesCreatedBySoftDelete1744200000026,
      ProductCatalog1744200000027,
      DropProductsCategoriesPivot1744200000028,
      ProductMediaVariantId1744200000029,
      WorkspaceDefaultCurrency1744200000030,
      ProductVariantStatus1744200000031,
      OrdersModule1744200000032,
      OrderStatusIsSystemAndDeliveryCategory1744200000034,
      ProductType1744200000035,
      IntegrationRenameToInstagramIntegration1744200000036,
      TelegramIntegrations1744200000037,
      ConversationSourceTelegram1744200000038,
      WorkspaceRolesAndMembers1744200000039,
      WorkspaceMemberIntegrationScopes1744200000040,
    ],
  };
}
