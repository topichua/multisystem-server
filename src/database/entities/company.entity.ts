import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('company')
@Index('IDX_company_owner_id', ['ownerId'])
export class Company {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'name', type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'page_id', type: 'varchar', length: 255 })
  pageId: string;

  @Column({ name: 'business_account_id', type: 'text' })
  businessAccountId: string;

  @Column({ name: 'access_token', type: 'text' })
  accessToken: string;

  @Column({ name: 'instagram_account_id', type: 'varchar', length: 255, nullable: true })
  instagramAccountId: string | null;

  @Column({ name: 'owner_id', type: 'int' })
  ownerId: number;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
