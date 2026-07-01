import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from "typeorm";
import { ClientLink } from "./client-link.entity";
import { Workspace } from "./workspace.entity";

@Entity("clients")
@Index("IDX_clients_workspace_id", ["workspaceId"])
export class Client {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({ name: "first_name", type: "varchar", length: 120 })
  firstName: string;

  @Column({ name: "last_name", type: "varchar", length: 120 })
  lastName: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @Column({ name: "phone", type: "varchar", length: 64 })
  phone: string;

  @Column({ name: "workspace_id", type: "int" })
  workspaceId: number;

  @ManyToOne(() => Workspace, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "workspace_id" })
  workspace: Workspace;

  @OneToMany(() => ClientLink, (link) => link.client)
  links: ClientLink[];
}
