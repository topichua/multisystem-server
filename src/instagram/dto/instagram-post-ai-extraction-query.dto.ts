import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, Min } from "class-validator";

export class InstagramPostAiExtractionQueryDto {
  @ApiProperty({
    description:
      "`instagram_integration.id` from GET /api/instagram/integrations. " +
      "Required when you have multiple connected Instagram accounts.",
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  integrationId: number;
}
