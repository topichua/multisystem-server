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
import type { IntegrationType } from "../../integrations/integration-type";
import { User } from "./user.entity";
import { WorkspaceRole } from "./workspace-role.entity";
import { Workspace } from "./workspace.entity";

@Entity("workspace_role_product_reference_grants")
@Unique("UQ_workspace_role_product_reference_grants", [
  "roleId",
  "integrationType",
  "integrationId",
])
@Index("IDX_workspace_role_product_reference_grants_role_id", ["roleId"])
@Index("IDX_workspace_role_product_reference_grants_workspace_id", [
  "workspaceId",
])
@Index("IDX_workspace_role_product_reference_grants_integration", [
  "integrationType",
  "integrationId",
])
export class WorkspaceRoleProductReferenceGrant {
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
  integrationType: IntegrationType;

  @Column({ name: "integration_id", type: "int" })
  integrationId: number;

  @Column({ name: "can_manage", type: "boolean", default: true })
  canManage: boolean;

  @Column({ name: "granted_by_user_id", type: "int", nullable: true })
  grantedByUserId: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "granted_by_user_id" })
  grantedBy: User | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
