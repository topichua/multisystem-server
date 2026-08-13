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
import { InventoryMode } from "./inventory-mode.enum";
import { WorkspaceLanguage } from "./workspace-language.enum";

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

  @Column({
    name: "inventory_mode",
    type: "enum",
    enum: InventoryMode,
    enumName: "workspace_inventory_mode_enum",
    default: InventoryMode.simple,
  })
  inventoryMode: InventoryMode;

  /** UI / content language for this workspace. */
  @Column({
    name: "language",
    type: "enum",
    enum: WorkspaceLanguage,
    enumName: "workspace_language_enum",
    default: WorkspaceLanguage.ua,
  })
  language: WorkspaceLanguage;

  /** Whether client wishlist is enabled for this workspace. */
  @Column({ name: "wishlist_enabled", type: "boolean", default: false })
  wishlistEnabled: boolean;

  /** IANA timezone for work schedule / deferred messaging. */
  @Column({
    name: "timezone",
    type: "varchar",
    length: 64,
    default: "Europe/Kyiv",
  })
  timezone: string;

  /**
   * Business hours for automatic messages/reminders.
   * Shape: `{ dayStart, dayEnd, workDays, differentHoursPerDay, dayHours }`.
   */
  @Column({
    name: "work_schedule",
    type: "jsonb",
    default: () =>
      `'{"dayStart":"09:00","dayEnd":"19:00","workDays":["mon","tue","wed","thu","fri"],"differentHoursPerDay":false,"dayHours":{}}'`,
  })
  workSchedule: {
    dayStart: string;
    dayEnd: string;
    workDays: string[];
    differentHoursPerDay: boolean;
    dayHours: Record<string, { start: string; end: string }>;
  };

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @Column({ name: "owner_id", type: "int" })
  ownerId: number;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: "owner_id" })
  owner: User;
}
