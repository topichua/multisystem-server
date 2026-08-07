import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { User } from "./user.entity";
import { VariantCustomFieldType } from "./variant-custom-field-type.enum";
import { Workspace } from "./workspace.entity";
import { WorkspaceVariantCustomFieldOption } from "./workspace-variant-custom-field-option.entity";

@Entity({ name: "workspace_variant_custom_field" })
@Index(
  "UQ_workspace_variant_custom_field_workspace_key",
  ["workspaceId", "key"],
  {
    unique: true,
  },
)
@Index("IDX_workspace_variant_custom_field_workspace_id", ["workspaceId"])
@Index("IDX_workspace_variant_custom_field_created_by_user_id", [
  "createdByUserId",
])
@Index("IDX_workspace_variant_custom_field_updated_by_user_id", [
  "updatedByUserId",
])
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

  /**
   * System / full name (`{group.label}:{field.name}`, e.g. `Взуття:Розмір`).
   * Prefer `displayName` for UI when set.
   */
  @Column({ type: "varchar", length: 128 })
  label: string;

  /**
   * Short UI name without category prefix (e.g. `Розмір`).
   * Falls back to `label` when null.
   */
  @Column({
    name: "display_name",
    type: "varchar",
    length: 128,
    nullable: true,
  })
  displayName: string | null;

  @Column({
    type: "enum",
    enum: VariantCustomFieldType,
    enumName: "variant_custom_field_type_enum",
  })
  type: VariantCustomFieldType;

  @Column({ name: "sort_order", type: "int", default: 0 })
  sortOrder: number;

  /** When set, field is archived and hidden from active catalogs. */
  @Column({ name: "archived_at", type: "timestamptz", nullable: true })
  archivedAt: Date | null;

  @Column({ name: "created_by_user_id", type: "int", nullable: true })
  createdByUserId: number | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "created_by_user_id" })
  createdByUser: User | null;

  @Column({ name: "updated_by_user_id", type: "int", nullable: true })
  updatedByUserId: number | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "updated_by_user_id" })
  updatedByUser: User | null;

  @OneToMany(() => WorkspaceVariantCustomFieldOption, (o) => o.field)
  fieldOptions: WorkspaceVariantCustomFieldOption[];

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
