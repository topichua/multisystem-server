import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import { User } from "./user.entity";
import { Workspace } from "./workspace.entity";

/** Nova Poshta API key per workspace. */
@Entity("novaposhta_integrations")
@Unique("UQ_novaposhta_integrations_workspace_id", ["workspaceId"])
@Index("IDX_novaposhta_integrations_workspace_id", ["workspaceId"])
@Index("IDX_novaposhta_integrations_owner_id", ["ownerId"])
export class NovaPoshtaIntegration {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({ name: "workspace_id", type: "int" })
  workspaceId: number;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspace_id" })
  workspace: Workspace;

  @Column({ name: "owner_id", type: "int" })
  ownerId: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "owner_id" })
  owner: User;

  @Column({ name: "name", type: "varchar", length: 255, default: "Nova Poshta" })
  name: string;

  @Column({ name: "api_key", type: "text" })
  apiKey: string;

  @Column({ name: "connected_at", type: "timestamptz" })
  connectedAt: Date;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
