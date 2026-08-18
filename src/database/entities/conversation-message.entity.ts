import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import { Conversation } from "./conversation.entity";
import { ConversationMessageType } from "./conversation-message-type.enum";

@Entity("conversation_messages")
@Index("IDX_conversation_messages_conversation_id", ["conversationId"])
@Index("IDX_conversation_messages_workspace_conversation", [
  "workspaceId",
  "conversationId",
])
@Index("IDX_conversation_messages_replied_to_external_id", [
  "repliedToExternalId",
])
export class ConversationMessage {
  /**
   * Instagram / Graph message id (`mid`).
   */
  @PrimaryColumn({ name: "external_id", type: "varchar", length: 255 })
  externalId: string;

  @Column({ name: "workspace_id", type: "int" })
  workspaceId: number;

  @Column({ name: "conversation_id", type: "int" })
  conversationId: number;

  @ManyToOne(() => Conversation, { onDelete: "CASCADE" })
  @JoinColumn([
    { name: "workspace_id", referencedColumnName: "workspaceId" },
    { name: "conversation_id", referencedColumnName: "id" },
  ])
  conversation: Conversation;

  @Column({ name: "message", type: "text" })
  message: string;

  @Column({ name: "instagram_json", type: "text" })
  instagramJson: string;

  @Column({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  /**
   * When the message was last edited on Instagram (e.g. from a `message_edit` webhook
   * or when we learn of an edit). Null if never edited in our data.
   */
  @Column({ name: "edited_at", type: "timestamptz", nullable: true })
  editedAt: Date | null;

  /**
   * When this message was read in this system (e.g. fetched by messaging UI).
   */
  @Column({ name: "read_at", type: "timestamptz", nullable: true })
  readAt: Date | null;

  @Column({ name: "deleted_at", type: "timestamptz", nullable: true })
  deletedAt: Date | null;

  @Column({
    name: "type",
    type: "enum",
    enum: ConversationMessageType,
    enumName: "conversation_message_type_enum",
    default: ConversationMessageType.text,
  })
  messageType: ConversationMessageType;

  /**
   * Serialized reactions payload (e.g. `[{ reaction, at, from }]`).
   */
  @Column({ name: "reactions_json", type: "text", nullable: true })
  reactionsJson: string | null;

  /**
   * Serialized attachments payload (R2 URLs, keys, mime types, etc.).
   */
  @Column({ name: "attachment_json", type: "text", nullable: true })
  attachmentJson: string | null;

  /**
   * Instagram media id when the message shares a post/reel (webhook `ig_post_media_id`, etc.).
   */
  @Column({
    name: "social_media_id",
    type: "varchar",
    length: 255,
    nullable: true,
  })
  socialMediaId: string | null;

  /**
   * Instagram comment id when this row is a comment (`type = instagram_comment`).
   */
  @Column({
    name: "comment_id",
    type: "varchar",
    length: 255,
    nullable: true,
  })
  commentId: string | null;

  /**
   * Last time this application wrote/updated the row in the database.
   */
  @UpdateDateColumn({ name: "system_updated_at", type: "timestamptz" })
  systemUpdatedAt: Date;

  @Column({ name: "sender_id", type: "varchar", length: 255 })
  senderId: string;

  @Column({ name: "receiver_id", type: "varchar", length: 255 })
  receiverId: string;

  /**
   * Parent message id (`mid` / Graph message id) when this message is a reply.
   */
  @Column({
    name: "replied_to_external_id",
    type: "varchar",
    length: 255,
    nullable: true,
  })
  repliedToExternalId: string | null;
}
