import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";
import { User } from "./user.entity";
import { WorkspaceRole } from "./workspace-role.entity";
import { Workspace } from "./workspace.entity";

/** Which integration table `integration_id` refers to. */
export type WorkspaceRoleIntegrationGrantType = "instagram" | "telegram";

@Entity("workspace_role_integration_grants")
@Unique("UQ_workspace_role_integration_grants", [
  "roleId",
  "integrationType",
  "integrationId",
])
@Index("IDX_workspace_role_integration_grants_role_id", ["roleId"])
@Index("IDX_workspace_role_integration_grants_workspace_id", ["workspaceId"])
@Index("IDX_workspace_role_integration_grants_integration", [
  "integrationType",
  "integrationId",
])
export class WorkspaceRoleIntegrationGrant {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({ name: "workspace_id", type: "int" })
  workspaceId: number;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspace_id" })
  workspace: Workspace;

  @Column({ name: "role_id", type: "int" })
  roleId: number;

  @ManyToOne(() => WorkspaceRole, { onDelete: "CASCADE" })
  @JoinColumn({ name: "role_id" })
  role: WorkspaceRole;

  @Column({ name: "integration_type", type: "varchar", length: 32 })
  integrationType: WorkspaceRoleIntegrationGrantType;

  @Column({ name: "integration_id", type: "int" })
  integrationId: number;

  @Column({ name: "conversations_read_scope", type: "varchar", length: 8 })
  conversationsReadScope: "all" | "mine";

  @Column({ name: "conversations_write_scope", type: "varchar", length: 8 })
  conversationsWriteScope: "all" | "mine";

  @Column({ name: "instagram_comments_read", type: "boolean" })
  instagramCommentsRead: boolean;

  @Column({ name: "instagram_comments_write", type: "boolean" })
  instagramCommentsWrite: boolean;

  @Column({ name: "conversations_assign_responsibility", type: "boolean" })
  conversationsAssignResponsibility: boolean;

  @Column({ name: "granted_by_user_id", type: "int", nullable: true })
  grantedByUserId: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "granted_by_user_id" })
  grantedBy: User | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
