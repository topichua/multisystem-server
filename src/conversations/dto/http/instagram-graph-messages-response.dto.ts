import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  InstagramMessageActorDto,
  InstagramMessagesPagingDto,
} from "./instagram-messages-response.dto";

export class InstagramGraphMessageDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ description: "ISO 8601 from Graph" })
  created_time: string;

  @ApiPropertyOptional({ type: () => InstagramMessageActorDto })
  from?: InstagramMessageActorDto;

  @ApiPropertyOptional({ type: "object", additionalProperties: true })
  to?: { data?: InstagramMessageActorDto[] };

  @ApiPropertyOptional()
  message?: string;

  @ApiPropertyOptional({
    type: "object",
    additionalProperties: true,
    description: "Graph attachments payload.",
  })
  attachments?: { data?: Array<Record<string, unknown>> };

  @ApiPropertyOptional({
    type: "object",
    additionalProperties: true,
    description: "Graph shares payload.",
  })
  shares?: { data?: Array<Record<string, unknown>> };
}

export class InstagramGraphMessagesResponseDto {
  @ApiProperty({ type: () => [InstagramGraphMessageDto] })
  data: InstagramGraphMessageDto[];

  @ApiPropertyOptional({ type: () => InstagramMessagesPagingDto })
  paging?: InstagramMessagesPagingDto;
}
