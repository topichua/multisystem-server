import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { User } from "./user.entity";

@Entity("workspace")
@Index("IDX_workspace_owner_id", ["ownerId"])
export class Workspace {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({ name: "name", type: "varchar", length: 255 })
  name: string;

  /**
   * Default ISO-style currency code for this workspace (e.g. UAH, USD).
   * Used when creating products without an explicit `currency`.
   */
  @Column({
    name: "default_currency",
    type: "varchar",
    length: 8,
    default: "UAH",
  })
  defaultCurrency: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @Column({ name: "owner_id", type: "int" })
  ownerId: number;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: "owner_id" })
  owner: User;
}
