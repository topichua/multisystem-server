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
import { VariantCustomFieldType } from "./variant-custom-field-type.enum";
import { Workspace } from "./workspace.entity";

@Entity({ name: "workspace_variant_custom_field" })
@Index("UQ_workspace_variant_custom_field_workspace_key", ["workspaceId", "key"], {
  unique: true,
})
@Index("IDX_workspace_variant_custom_field_workspace_id", ["workspaceId"])
export class WorkspaceVariantCustomField {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({ name: "workspace_id", type: "int" })
  workspaceId: number;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspace_id" })
  workspace: Workspace;

  /** Stable identifier within the workspace (e.g. `color`, `size`). */
  @Column({ type: "varchar", length: 64 })
  key: string;

  @Column({ type: "varchar", length: 128 })
  label: string;

  @Column({
    type: "enum",
    enum: VariantCustomFieldType,
    enumName: "variant_custom_field_type_enum",
  })
  type: VariantCustomFieldType;

  /** Allowed values when `type` is `options`. */
  @Column({ type: "jsonb", nullable: true })
  options: string[] | null;

  @Column({ name: "sort_order", type: "int", default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
