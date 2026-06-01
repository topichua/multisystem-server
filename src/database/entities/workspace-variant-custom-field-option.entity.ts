import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { WorkspaceVariantCustomField } from "./workspace-variant-custom-field.entity";

/** Case-insensitive uniqueness per field: `UQ_wvcf_option_field_label_ci` in migrations. */
@Entity({ name: "workspace_variant_custom_field_option" })
@Index("IDX_wvcf_option_field_id", ["fieldId"])
export class WorkspaceVariantCustomFieldOption {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({ name: "field_id", type: "int" })
  fieldId: number;

  @ManyToOne(() => WorkspaceVariantCustomField, (f) => f.fieldOptions, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "field_id" })
  field: WorkspaceVariantCustomField;

  @Column({ type: "varchar", length: 128 })
  label: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
