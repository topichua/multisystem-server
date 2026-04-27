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

@Entity('clients')
@Index('IDX_clients_instagram_user_id', ['instagramUserId'])
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

  @Column({ name: 'instagram_user_id', type: 'int' })
  instagramUserId: number;

  @ManyToOne(() => InstagramUser, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'instagram_user_id' })
  instagramUser: InstagramUser;
}
