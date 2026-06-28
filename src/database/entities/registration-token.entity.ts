import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("registration_tokens")
@Index("IDX_registration_tokens_email", ["email"])
@Index("UQ_registration_tokens_token_hash", ["tokenHash"], { unique: true })
export class RegistrationToken {
  @PrimaryGeneratedColumn("uuid", { name: "id" })
  id: string;

  @Column({ name: "token_hash", type: "varchar", length: 64 })
  tokenHash: string;

  @Column({ name: "email", type: "varchar", length: 255 })
  email: string;

  @Column({ name: "company_name", type: "varchar", length: 255 })
  companyName: string;

  @Column({ name: "first_name", type: "varchar", length: 120 })
  firstName: string;

  @Column({ name: "last_name", type: "varchar", length: 120 })
  lastName: string;

  @Column({ name: "password_hash", type: "text" })
  passwordHash: string;

  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt: Date;

  @Column({ name: "used_at", type: "timestamptz", nullable: true })
  usedAt: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
