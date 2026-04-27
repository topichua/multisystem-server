import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Company } from './company.entity';

@Entity('conversation_groups')
@Index('IDX_conversation_groups_company_id', ['companyId'])
export class ConversationGroup {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'name', type: 'varchar', length: 255 })
  name: string;

  /** Display order within the company (SQL `order` is reserved). */
  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;
}
