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

  /**
   * Long-lived Facebook **user** token from OAuth (`fb_exchange_token` flow).
   */
  @Column({ name: 'user_access_token', type: 'text', nullable: true })
  userAccessToken: string | null;

  /**
   * **Page** access token from Graph `me/accounts` (`access_token` on the Page object).
   * Used for Page-scoped Graph calls; also mirrored to `sources.token` on OAuth.
   */
  @Column({ name: 'access_token', type: 'text', nullable: true })
  accessToken: string | null;

  @Column({ name: 'instagram_account_id', type: 'varchar', length: 255, nullable: true })
  instagramAccountId: string | null;

  @Column({ name: 'facebook_page_name', type: 'varchar', length: 255, nullable: true })
  facebookPageName: string | null;

  @Column({ name: 'token_connected_at', type: 'timestamptz', nullable: true })
  tokenConnectedAt: Date | null;

  @Column({ name: 'token_status', type: 'varchar', length: 32, nullable: true })
  tokenStatus: string | null;

  @Column({ name: 'owner_id', type: 'int' })
  ownerId: number;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
