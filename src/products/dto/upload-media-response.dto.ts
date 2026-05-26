import { ApiProperty } from "@nestjs/swagger";

export class UploadMediaResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty({ description: "Cloudflare Images delivery URL" })
  cdnUrl: string;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt: string;
}
