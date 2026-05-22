import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  Min,
} from "class-validator";

export class SetOrderStatusesOrderDto {
  @ApiProperty({
    type: [Number],
    description:
      "All workspace status ids in desired display order (index 0 = first). Must include every status exactly once.",
    example: [1, 3, 2, 4],
  })
  @IsArray()
  @ArrayMinSize(1)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids: number[];
}
