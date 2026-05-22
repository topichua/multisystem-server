import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { OrderStatusCategory } from "../../database/entities/order-status-category.enum";

export class OrderStatusResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  workspaceId: number;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: OrderStatusCategory })
  category: OrderStatusCategory;

  @ApiPropertyOptional({ nullable: true })
  color: string | null;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty({
    description: "Default status for new orders (at most one per workspace).",
  })
  isDefault: boolean;

  @ApiProperty({
    description: "Seeded system status; category cannot be changed via API.",
  })
  isSystem: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
