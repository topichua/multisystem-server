import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('instagram_users')
@Index('IDX_instagram_users_username', ['username'])
export class InstagramUser {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'name', type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'username', type: 'varchar', length: 255 })
  username: string;

  @Column({ name: 'profile_pic', type: 'text' })
  profilePic: string;

  @Column({ name: 'synced_at', type: 'timestamptz', nullable: true })
  syncedAt: Date | null;

  @Column({ name: 'last_seen', type: 'timestamptz', nullable: true })
  lastSeen: Date | null;
}
