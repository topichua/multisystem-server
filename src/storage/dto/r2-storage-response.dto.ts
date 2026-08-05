import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class R2ConfigStatusResponseDto {
  @ApiProperty({
    description: "True when all required R2 environment variables are set.",
  })
  configured: boolean;

  @ApiProperty()
  accountIdPresent: boolean;

  @ApiProperty()
  accessKeyPresent: boolean;

  @ApiProperty()
  secretKeyPresent: boolean;

  @ApiPropertyOptional({ nullable: true })
  bucketName: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      "Public base URL (CF_R2_PUBLIC_URL) used to build object links.",
  })
  publicBaseUrl: string | null;
}

export class R2UploadTestResponseDto {
  @ApiProperty({ description: "Object key inside the R2 bucket." })
  key: string;

  @ApiPropertyOptional({
    nullable: true,
    description:
      "Public URL when CF_R2_PUBLIC_URL is set; null for private-only buckets.",
  })
  publicUrl: string | null;

  @ApiProperty()
  contentType: string;

  @ApiProperty()
  sizeBytes: number;

  @ApiProperty()
  originalName: string;
}

export class R2PingResponseDto {
  @ApiProperty()
  ok: boolean;

  @ApiProperty()
  key: string;

  @ApiPropertyOptional({
    nullable: true,
    description:
      "Public URL when CF_R2_PUBLIC_URL is set; null for private-only buckets.",
  })
  publicUrl: string | null;

  @ApiProperty({
    description: "ISO timestamp written into the ping object.",
  })
  pingAt: string;
}
