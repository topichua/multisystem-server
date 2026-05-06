import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class InstagramMediaChildDto {
  @ApiPropertyOptional({ description: "Child media id (carousel item)." })
  id?: string;

  @ApiPropertyOptional({ enum: ["IMAGE", "VIDEO", "CAROUSEL_ALBUM"] })
  media_type?: string;

  @ApiPropertyOptional({ description: "Direct media URL when available." })
  media_url?: string;

  @ApiPropertyOptional()
  thumbnail_url?: string;
}

export class InstagramMediaItemDto {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional()
  caption?: string;

  @ApiPropertyOptional({ enum: ["IMAGE", "VIDEO", "CAROUSEL_ALBUM"] })
  media_type?: string;

  @ApiPropertyOptional()
  media_url?: string;

  @ApiPropertyOptional()
  permalink?: string;

  @ApiPropertyOptional()
  thumbnail_url?: string;

  @ApiPropertyOptional({ description: "ISO 8601 from Graph" })
  timestamp?: string;

  @ApiPropertyOptional({ type: () => [InstagramMediaChildDto] })
  children?: InstagramMediaChildDto[];
}

export class InstagramMediaListResponseDto {
  @ApiProperty({ type: () => [InstagramMediaItemDto] })
  data: InstagramMediaItemDto[];
}
