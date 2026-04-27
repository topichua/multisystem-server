import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AccountLabelDto {
  @ApiProperty()
  key: string;

  @ApiProperty()
  label: string;

  @ApiProperty()
  color: string;
}

export class AccountOrderDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiPropertyOptional()
  thumbnailUrl?: string | null;

  @ApiPropertyOptional()
  amount?: string | null;

  @ApiPropertyOptional()
  status?: string | null;
}

export class AccountResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  displayName: string;

  @ApiProperty()
  username: string;

  @ApiPropertyOptional({ nullable: true })
  avatarUrl: string | null;

  @ApiProperty()
  instagramProfileUrl: string;

  @ApiPropertyOptional({ nullable: true })
  notes: string | null;

  @ApiProperty({ type: () => [AccountLabelDto] })
  labels: AccountLabelDto[];

  @ApiProperty({ type: () => [AccountOrderDto] })
  orders: AccountOrderDto[];

  @ApiPropertyOptional({ nullable: true })
  pageName: string | null;
}
