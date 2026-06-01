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

import { ProductVariant } from "./product-variant.entity";
import { WorkspaceVariantCustomField } from "./workspace-variant-custom-field.entity";
import { WorkspaceVariantCustomFieldOption } from "./workspace-variant-custom-field-option.entity";

@Entity({ name: "product_variant_custom_field_value" })
@Index("UQ_product_variant_custom_field_value_variant_field", ["variantId", "fieldId"], {
  unique: true,
})
@Index("IDX_product_variant_custom_field_value_variant_id", ["variantId"])
@Index("IDX_product_variant_custom_field_value_field_value", ["fieldId", "value"])
export class ProductVariantCustomFieldValue {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({ name: "variant_id", type: "int" })
  variantId: number;

  @ManyToOne(() => ProductVariant, (v) => v.customFieldValues, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "variant_id" })
  variant: ProductVariant;

  @Column({ name: "field_id", type: "int" })
  fieldId: number;

  @ManyToOne(() => WorkspaceVariantCustomField, { onDelete: "CASCADE" })
  @JoinColumn({ name: "field_id" })
  field: WorkspaceVariantCustomField;

  /** Denormalized display value for search and API responses. */
  @Column({ type: "varchar", length: 128 })
  value: string;

  @Column({ name: "option_id", type: "int", nullable: true })
  optionId: number | null;

  @ManyToOne(() => WorkspaceVariantCustomFieldOption, {
    onDelete: "RESTRICT",
    nullable: true,
  })
  @JoinColumn({ name: "option_id" })
  option: WorkspaceVariantCustomFieldOption | null;

  @Column({ name: "text_value", type: "varchar", length: 512, nullable: true })
  textValue: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
