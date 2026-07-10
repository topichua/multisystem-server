import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

const moneyTransformer = {
  to: (v: number | null) => v,
  from: (v: string | null) => (v == null ? null : Number(v)),
};

@Entity({ name: "billing_credit_pricing" })
export class BillingCreditPricing {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({
    name: "price_per_credit",
    type: "decimal",
    precision: 14,
    scale: 4,
    transformer: moneyTransformer,
  })
  pricePerCredit: number;

  @Column({ type: "varchar", length: 8, default: "UAH" })
  currency: string;

  @Column({ name: "min_purchase_credits", type: "int", default: 1 })
  minPurchaseCredits: number;

  @Column({ name: "max_purchase_credits", type: "int", nullable: true })
  maxPurchaseCredits: number | null;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive: boolean;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
