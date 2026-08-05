import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateWorkspaceExportResponseDto {
  @ApiProperty({ example: "exp_abc123" })
  exportId: string;

  @ApiProperty({
    enum: ["pending", "processing", "completed", "failed", "expired"],
    example: "processing",
  })
  status: string;
}

export class WorkspaceExportStatusResponseDto {
  @ApiProperty()
  exportId: string;

  @ApiProperty({
    enum: ["pending", "processing", "completed", "failed", "expired"],
  })
  status: string;

  @ApiProperty({
    description: "Job progress 0–100.",
    minimum: 0,
    maximum: 100,
  })
  progress: number;

  @ApiPropertyOptional({
    nullable: true,
    description: "Temporary signed download URL when status=completed.",
  })
  downloadUrl?: string | null;

  @ApiPropertyOptional({ nullable: true })
  fileName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  fileSize?: number | null;

  @ApiPropertyOptional({ nullable: true })
  errorMessage?: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiPropertyOptional({ nullable: true })
  completedAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  expiresAt?: Date | null;
}
