import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { User } from "./user.entity";
import { Workspace } from "./workspace.entity";

/** Staged image uploaded to CDN before a product exists. */
@Entity({ name: "upload_media" })
@Index("IDX_upload_media_workspace_id", ["workspaceId"])
export class UploadMedia {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({ name: "workspace_id", type: "int" })
  workspaceId: number;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspace_id" })
  workspace: Workspace;

  @Column({ name: "cdn_url", type: "text" })
  cdnUrl: string;

  @Column({
    name: "cloudflare_image_id",
    type: "varchar",
    length: 255,
    nullable: true,
  })
  cloudflareImageId: string | null;

  @Column({ name: "created_by_user_id", type: "int" })
  createdByUserId: number;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "created_by_user_id" })
  createdByUser: User;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
