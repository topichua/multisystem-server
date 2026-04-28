import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { ConversationSource } from './conversation-source.enum';
import { ConversationGroup } from './conversation-group.entity';
import { User } from './user.entity';

@Entity('conversations')
@Unique('UQ_conversations_manager_external_id', ['managerId', 'externalId'])
@Index('IDX_conversations_manager_id', ['managerId'])
@Index('IDX_conversations_group_id', ['groupId'])
@Check(`"source" IN (1)`)
export class Conversation {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'external_source_id', type: 'varchar', length: 255 })
  externalSourceId: string;

  @Column({ name: 'external_id', type: 'varchar', length: 255 })
  externalId: string;

  @Column({ name: 'inst_updated_at', type: 'timestamptz' })
  instUpdatedAt: Date;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt: Date | null;

  /** Instagram participant user id (PSID / IGSID); stored as string (can exceed 32-bit int). */
  @Column({ name: 'participant_id', type: 'varchar', length: 255 })
  participantId: string;

  @Column({ name: 'source', type: 'smallint' })
  source: ConversationSource;

  @Column({ name: 'manager_id', type: 'int' })
  managerId: number;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'manager_id' })
  manager: User;

  @Column({ name: 'group_id', type: 'int', nullable: true })
  groupId: number | null;

  @ManyToOne(() => ConversationGroup, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'group_id' })
  group: ConversationGroup | null;
}
