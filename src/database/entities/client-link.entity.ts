import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";
import { Client } from "./client.entity";
import { ClientLinkProvider } from "./client-link-provider.enum";
import { Workspace } from "./workspace.entity";

@Entity("client_links")
@Unique("UQ_client_links_client_provider_external", [
  "clientId",
  "provider",
  "externalId",
])
@Unique("UQ_client_links_workspace_provider_external", [
  "workspaceId",
  "provider",
  "externalId",
])
@Index("IDX_client_links_client_id", ["clientId"])
@Index("IDX_client_links_workspace_provider_external", [
  "workspaceId",
  "provider",
  "externalId",
])
export class ClientLink {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({ name: "client_id", type: "int" })
  clientId: number;

  @Column({ name: "workspace_id", type: "int" })
  workspaceId: number;

  @Column({
    name: "provider",
    type: "enum",
    enum: ClientLinkProvider,
    enumName: "client_links_provider_enum",
  })
  provider: ClientLinkProvider;

  @Column({ name: "external_id", type: "varchar", length: 255 })
  externalId: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @ManyToOne(() => Client, (client) => client.links, { onDelete: "CASCADE" })
  @JoinColumn({ name: "client_id" })
  client: Client;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspace_id" })
  workspace: Workspace;
}
