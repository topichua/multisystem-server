/**
 * Domain row shapes aligned with `src/database/entities` (TypeORM tables).
 * Canonical mappings and relations live in that folder only.
 */
export { ConversationSource } from './database/entities/conversation-source.enum';
import type { ConversationSource } from './database/entities/conversation-source.enum';

/** Matches `company` + `Company` entity (also has page tokens for integrations). */
export type Company = {
  id: number;
  name: string;
  pageId: string;
  userAccessToken: string | null;
  accessToken: string | null;
  instagramAccountId: string | null;
  facebookPageName?: string | null;
  tokenConnectedAt?: Date | null;
  tokenStatus?: string | null;
  createdAt: Date;
  ownerId: number;
};

export type Source = {
  id: number;
  name: string;
  companyId: number;
  token: string;
};

export type Conversation = {
  id: number;
  externalSourceId: string;
  externalId: string;
  instUpdatedAt: Date;
  readAt: Date | null;
  participantId: string;
  source: ConversationSource;
  managerId: number;
  groupId?: number | null;
};

export type InstagramUser = {
  id: string;
  name: string;
  username: string;
  profilePic: string;
  syncedAt: Date | null;
  lastSeen: Date | null;
};

export type Client = {
  id: number;
  firstName: string;
  lastName: string;
  createdAt: Date;
  phone: string;
  deliveryInfo: string;
  instagramUserId: string;
};

export type ConversationMessage = {
  externalId: string;
  conversationId: number;
  message: string;
  instagramJson: string;
  createdAt: Date;
  editedAt: Date | null;
  readAt: Date | null;
  systemUpdatedAt: Date;
  senderId: string;
  receiverId: string;
  repliedToExternalId: string | null;
};

/** `sort_order` column — SQL `order` is reserved. */
export type ConversationGroup = {
  id: number;
  companyId: number;
  name: string;
  sortOrder: number;
};
