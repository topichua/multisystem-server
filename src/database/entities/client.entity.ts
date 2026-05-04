import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { InstagramUser } from './instagram-user.entity';
import { Workspace } from './workspace.entity';

@Entity('clients')
@Index('IDX_clients_instagram_user_id', ['instagramUserId'])
@Index('IDX_clients_workspace_id', ['workspaceId'])
export class Client {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'first_name', type: 'varchar', length: 120 })
  firstName: string;

  @Column({ name: 'last_name', type: 'varchar', length: 120 })
  lastName: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'phone', type: 'varchar', length: 64 })
  phone: string;

  @Column({ name: 'delivery_info', type: 'text' })
  deliveryInfo: string;

  @Column({ name: 'instagram_user_id', type: 'varchar', length: 255, nullable: true })
  instagramUserId: string | null;

  @Column({ name: 'workspace_id', type: 'int' })
  workspaceId: number;

  @ManyToOne(() => InstagramUser, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'instagram_user_id', referencedColumnName: 'id' })
  instagramUser: InstagramUser | null;

  @ManyToOne(() => Workspace, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'workspace_id' })
  workspace: Workspace;
}
