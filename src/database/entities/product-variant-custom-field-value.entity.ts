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

  @Column({ type: "varchar", length: 128 })
  value: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
