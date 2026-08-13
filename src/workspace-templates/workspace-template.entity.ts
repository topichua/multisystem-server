import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { User, Workspace } from "../database/entities";
import { WorkspaceTemplateType } from "./workspace-template-type.enum";

@Entity("workspace_templates")
@Index("IDX_workspace_templates_workspace_id", ["workspaceId"])
@Index("IDX_workspace_templates_workspace_type", ["workspaceId", "type"])
export class WorkspaceTemplate {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({ name: "workspace_id", type: "int" })
  workspaceId: number;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspace_id" })
  workspace: Workspace;

  @Column({
    name: "type",
    type: "enum",
    enum: WorkspaceTemplateType,
    enumName: "workspace_template_type_enum",
    default: WorkspaceTemplateType.chat,
  })
  type: WorkspaceTemplateType;

  @Column({ name: "name", type: "varchar", length: 255 })
  name: string;

  @Column({ name: "template", type: "text" })
  template: string;

  @Column({ name: "created_by", type: "int" })
  createdById: number;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "created_by" })
  createdBy: User;

  @Column({ name: "updated_by", type: "int", nullable: true })
  updatedById: number | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "updated_by" })
  updatedBy: User | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
