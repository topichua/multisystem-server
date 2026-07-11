import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { ManualPaymentMethodType } from "../../database/entities/manual-payment-method-type.enum";

export class CreateManualPaymentMethodDto {
  @ApiProperty({ example: "ФОП Романів О. В." })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: ManualPaymentMethodType })
  @IsEnum(ManualPaymentMethodType)
  type!: ManualPaymentMethodType;

  @ApiProperty({
    description: "IBAN or card number (spaces allowed, normalized on save)",
    example: "UA003052990000026006040052063",
  })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  value!: string;
}

export class UpdateManualPaymentMethodDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ enum: ManualPaymentMethodType })
  @IsOptional()
  @IsEnum(ManualPaymentMethodType)
  type?: ManualPaymentMethodType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  value?: string;
}

export class ManualPaymentMethodResponseDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  workspaceId!: number;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: ManualPaymentMethodType })
  type!: ManualPaymentMethodType;

  @ApiProperty({ description: "Normalized stored value" })
  value!: string;

  @ApiProperty({ description: "Formatted value for display/copy" })
  displayValue!: string;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class ManualPaymentMethodsListResponseDto {
  @ApiProperty()
  workspaceId!: number;

  @ApiProperty({ type: [ManualPaymentMethodResponseDto] })
  items!: ManualPaymentMethodResponseDto[];
}
