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
import { ProductMoveToWorkspaceId1744200000042 } from "./migrations/1744200000042-ProductMoveToWorkspaceId";
import { ProductMediaDropCompanyId1744200000043 } from "./migrations/1744200000043-ProductMediaDropCompanyId";
import { UploadMedia1744200000044 } from "./migrations/1744200000044-UploadMedia";
import { WorkspaceVariantCustomFields1744200000045 } from "./migrations/1744200000045-WorkspaceVariantCustomFields";
import { ProductMediaUploadMediaId1744200000046 } from "./migrations/1744200000046-ProductMediaUploadMediaId";
import { ProductVariantDropColorSize1744200000047 } from "./migrations/1744200000047-ProductVariantDropColorSize";
import { ProductVariantCustomFieldValues1744200000048 } from "./migrations/1744200000048-ProductVariantCustomFieldValues";
import { ProductDropSourceIdReferenceGroupId1744200000049 } from "./migrations/1744200000049-ProductDropSourceIdReferenceGroupId";
import { ProductDropMainImageUrl1744200000050 } from "./migrations/1744200000050-ProductDropMainImageUrl";
import { ProductVariantDropImageUrl1744200000051 } from "./migrations/1744200000051-ProductVariantDropImageUrl";
import { ProductMediaMainMediaDropUserIds1744200000052 } from "./migrations/1744200000052-ProductMediaMainMediaDropUserIds";
import { ProductMediaDropMainMedia1744200000053 } from "./migrations/1744200000053-ProductMediaDropMainMedia";
import { VariantCustomFieldOptions1744200000054 } from "./migrations/1744200000054-VariantCustomFieldOptions";
import { VariantCustomFieldOptionDropNormalizedValue1744200000055 } from "./migrations/1744200000055-VariantCustomFieldOptionDropNormalizedValue";
import { WorkspaceVariantCustomFieldDropOptionsJsonb1744200000056 } from "./migrations/1744200000056-WorkspaceVariantCustomFieldDropOptionsJsonb";
import { ProductVariantCustomFieldValueSortOrder1744200000057 } from "./migrations/1744200000057-ProductVariantCustomFieldValueSortOrder";
import { OrderEventUserId1744200000058 } from "./migrations/1744200000058-OrderEventUserId";
import { WorkspaceTemplates1744200000059 } from "./migrations/1744200000059-WorkspaceTemplates";
import { ProductSourceReferenceExternalIdVariantId1744200000060 } from "./migrations/1744200000060-ProductSourceReferenceExternalIdVariantId";
import { ProductInstagramReferences1744200000061 } from "./migrations/1744200000061-ProductInstagramReferences";
import { ProductInstagramReferenceAccountId1744200000062 } from "./migrations/1744200000062-ProductInstagramReferenceAccountId";
import { WorkspaceRolePermissionOptions1744200000063 } from "./migrations/1744200000063-WorkspaceRolePermissionOptions";
import { WorkspaceRolePermissionOptionLists1744200000064 } from "./migrations/1744200000064-WorkspaceRolePermissionOptionLists";
import { WorkspaceRoleIntegrationGrants1744200000065 } from "./migrations/1744200000065-WorkspaceRoleIntegrationGrants";
import { WorkspaceRoleIntegrationGrantPermissions1744200000066 } from "./migrations/1744200000066-WorkspaceRoleIntegrationGrantPermissions";
import { WorkspaceRoleIntegrationGrantAssignResponsibility1744200000067 } from "./migrations/1744200000067-WorkspaceRoleIntegrationGrantAssignResponsibility";
import { WorkspaceMemberCanBeAssignedToChat1744200000068 } from "./migrations/1744200000068-WorkspaceMemberCanBeAssignedToChat";
import { UserAvatarSrcWorkspaceMemberColor1744200000069 } from "./migrations/1744200000069-UserAvatarSrcWorkspaceMemberColor";
import { WorkspaceMemberUpdatedAt1744200000070 } from "./migrations/1744200000070-WorkspaceMemberUpdatedAt";
import { ConversationResponsibleMember1744200000071 } from "./migrations/1744200000071-ConversationResponsibleMember";
import { ProductSuggestions1744200000072 } from "./migrations/1744200000072-ProductSuggestions";
import { WebhookEvents1744200000073 } from "./migrations/1744200000073-WebhookEvents";
import { WorkspaceRoleDescriptionColor1744200000074 } from "./migrations/1744200000074-WorkspaceRoleDescriptionColor";
import { UserAvatarCloudflareImageId1744200000075 } from "./migrations/1744200000075-UserAvatarCloudflareImageId";
import { NovaPoshtaIntegrations1744200000076 } from "./migrations/1744200000076-NovaPoshtaIntegrations";
import { NovaPoshtaIntegrationSenderSettings1744200000078 } from "./migrations/1744200000078-NovaPoshtaIntegrationSenderSettings";
import { OrderDeliveryInfoAddressToStreetFields1744200000079 } from "./migrations/1744200000079-OrderDeliveryInfoAddressToStreetFields";
import { ProductShippingFields1744200000080 } from "./migrations/1744200000080-ProductShippingFields";
import { OrderDeliveryInfoProviderId1744200000081 } from "./migrations/1744200000081-OrderDeliveryInfoProviderId";
import { ConversationWorkspaceId1744200000082 } from "./migrations/1744200000082-ConversationWorkspaceId";
import { UserPhone1744200000083 } from "./migrations/1744200000083-UserPhone";
import { RegistrationTokens1744200000084 } from "./migrations/1744200000084-RegistrationTokens";
import { InventoryManagement1744200000085 } from "./migrations/1744200000085-InventoryManagement";
import { WorkspaceInventoryMode1744200000086 } from "./migrations/1744200000086-WorkspaceInventoryMode";
import { InventoryReservations1744200000087 } from "./migrations/1744200000087-InventoryReservations";
import { TelegramUsers1744200000077 } from "./migrations/1744200000077-TelegramUsers";
import {
  Client,
  InstagramIntegration,
  Conversation,
  ConversationGroup,
  ConversationMessage,
  InstagramUser,
  TelegramUser,
  Order,
  OrderDeliveryInfo,
  OrderEvent,
  OrderItem,
  OrderStatus,
  Product,
  ProductCategory,
  ProductMedia,
  ProductInstagramReference,
  ProductSuggestion,
  ProductVariant,
  ProductVariantCustomFieldValue,
  UploadMedia,
  WorkspaceVariantCustomField,
  WorkspaceVariantCustomFieldOption,
  TelegramIntegration,
  User,
  Workspace,
  WorkspaceInvitation,
  WorkspaceMember,
  WorkspaceRole,
  WorkspaceRoleIntegrationGrant,
  WebhookEvent,
  NovaPoshtaIntegration,
  RegistrationToken,
} from "./entities";
import { WorkspaceTemplate } from "../workspace-templates/workspace-template.entity";

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
  WorkspaceRoleIntegrationGrant,
  WorkspaceMember,
  WorkspaceInvitation,
  InstagramIntegration,
  TelegramIntegration,
  NovaPoshtaIntegration,
  InstagramUser,
  TelegramUser,
  Client,
  ConversationGroup,
  Conversation,
  ConversationMessage,
  ProductCategory,
  Product,
  ProductVariant,
  ProductVariantCustomFieldValue,
  ProductMedia,
  ProductInstagramReference,
  ProductSuggestion,
  UploadMedia,
  WorkspaceVariantCustomField,
  WorkspaceVariantCustomFieldOption,
  WorkspaceTemplate,
  OrderStatus,
  Order,
  OrderItem,
  OrderDeliveryInfo,
  OrderEvent,
  WebhookEvent,
  RegistrationToken,
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
      ProductMoveToWorkspaceId1744200000042,
      ProductMediaDropCompanyId1744200000043,
      UploadMedia1744200000044,
      WorkspaceVariantCustomFields1744200000045,
      ProductMediaUploadMediaId1744200000046,
      ProductVariantDropColorSize1744200000047,
      ProductVariantCustomFieldValues1744200000048,
      ProductDropSourceIdReferenceGroupId1744200000049,
      ProductDropMainImageUrl1744200000050,
      ProductVariantDropImageUrl1744200000051,
      ProductMediaMainMediaDropUserIds1744200000052,
      ProductMediaDropMainMedia1744200000053,
      VariantCustomFieldOptions1744200000054,
      VariantCustomFieldOptionDropNormalizedValue1744200000055,
      WorkspaceVariantCustomFieldDropOptionsJsonb1744200000056,
      ProductVariantCustomFieldValueSortOrder1744200000057,
      OrderEventUserId1744200000058,
      WorkspaceTemplates1744200000059,
      ProductSourceReferenceExternalIdVariantId1744200000060,
      ProductInstagramReferences1744200000061,
      ProductInstagramReferenceAccountId1744200000062,
      WorkspaceRolePermissionOptions1744200000063,
      WorkspaceRolePermissionOptionLists1744200000064,
      WorkspaceRoleIntegrationGrants1744200000065,
      WorkspaceRoleIntegrationGrantPermissions1744200000066,
      WorkspaceRoleIntegrationGrantAssignResponsibility1744200000067,
      WorkspaceMemberCanBeAssignedToChat1744200000068,
      UserAvatarSrcWorkspaceMemberColor1744200000069,
      WorkspaceMemberUpdatedAt1744200000070,
      ConversationResponsibleMember1744200000071,
      ProductSuggestions1744200000072,
      WebhookEvents1744200000073,
      WorkspaceRoleDescriptionColor1744200000074,
      UserAvatarCloudflareImageId1744200000075,
      NovaPoshtaIntegrations1744200000076,
      TelegramUsers1744200000077,
      NovaPoshtaIntegrationSenderSettings1744200000078,
      OrderDeliveryInfoAddressToStreetFields1744200000079,
      ProductShippingFields1744200000080,
      OrderDeliveryInfoProviderId1744200000081,
      ConversationWorkspaceId1744200000082,
      UserPhone1744200000083,
      RegistrationTokens1744200000084,
      InventoryManagement1744200000085,
      WorkspaceInventoryMode1744200000086,
      InventoryReservations1744200000087,
    ],
  };
}
