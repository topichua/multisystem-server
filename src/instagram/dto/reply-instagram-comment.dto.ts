import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from "class-validator";

export class ReplyInstagramCommentQueryDto {
  @ApiPropertyOptional({
    description:
      "`instagram_integration.id` from GET /api/instagram/integrations. " +
      "When omitted, uses the latest connected integration for your workspace.",
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  integrationId?: number;
}

export class ReplyInstagramCommentRequestDto {
  @ApiProperty({
    description: "Reply text sent to Meta Graph `POST /{ig-comment-id}/replies`.",
    maxLength: 2200,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(2200)
  message: string;
}
