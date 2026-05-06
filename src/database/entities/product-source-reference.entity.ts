import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { Company } from "./company.entity";
import { ProductSourceReferenceType } from "./product-source-reference-type.enum";
import { Product } from "./product.entity";
import { User } from "./user.entity";

@Entity({ name: "product_source_references" })
@Index("IDX_product_source_references_product_id", ["productId"])
@Index("IDX_product_source_references_source_id", ["sourceId"])
export class ProductSourceReference {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({ name: "company_id", type: "int" })
  companyId: number;

  @ManyToOne(() => Company, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "company_id" })
  company: Company;

  @Column({ name: "product_id", type: "int" })
  productId: number;

  @ManyToOne(() => Product, (p) => p.sourceReferences, { onDelete: "CASCADE" })
  @JoinColumn({ name: "product_id" })
  product: Product;

  @Column({
    name: "source_type",
    type: "enum",
    enum: ProductSourceReferenceType,
    enumName: "product_source_ref_type_enum",
  })
  sourceType: ProductSourceReferenceType;

  @Column({ name: "source_id", type: "varchar", length: 255 })
  sourceId: string;

  @Column({ type: "text", nullable: true })
  permalink: string | null;

  @Column({ type: "text", nullable: true })
  caption: string | null;

  @Column({ name: "created_by_user_id", type: "int" })
  createdByUserId: number;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "created_by_user_id" })
  createdByUser: User;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
