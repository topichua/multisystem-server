import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import {
  NovaPoshtaPayerType,
  NovaPoshtaPaymentMethod,
  NovaPoshtaSenderType,
} from "../../database/entities";

export class NovaPoshtaSenderSettingsDto {
  @ApiPropertyOptional({ example: "ФОП Залуга А.П." })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  sender_name?: string | null;

  @ApiPropertyOptional({ example: "380681141315" })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sender_phone?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  sender_city_ref?: string | null;

  @ApiPropertyOptional({ example: "Хмельницький" })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  sender_city_name?: string | null;

  @ApiPropertyOptional({ enum: NovaPoshtaSenderType })
  @IsOptional()
  @IsEnum(NovaPoshtaSenderType)
  sender_type?: NovaPoshtaSenderType | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  sender_warehouse_ref?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  sender_warehouse_name?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  sender_street_ref?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  sender_street_name?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sender_building?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sender_flat?: string | null;

  @ApiPropertyOptional({ description: "Nova Poshta Counterparty Ref" })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  sender_ref?: string | null;

  @ApiPropertyOptional({ description: "Nova Poshta ContactPerson Ref" })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  sender_contact_ref?: string | null;

  @ApiPropertyOptional({ enum: NovaPoshtaPaymentMethod })
  @IsOptional()
  @IsEnum(NovaPoshtaPaymentMethod)
  payment_method?: NovaPoshtaPaymentMethod | null;

  @ApiPropertyOptional({ enum: NovaPoshtaPayerType })
  @IsOptional()
  @IsEnum(NovaPoshtaPayerType)
  payer_type?: NovaPoshtaPayerType | null;
}

export class NovaPoshtaSenderSettingsResponseDto {
  @ApiPropertyOptional({ nullable: true })
  sender_name: string | null;

  @ApiPropertyOptional({ nullable: true })
  sender_phone: string | null;

  @ApiPropertyOptional({ nullable: true })
  sender_city_ref: string | null;

  @ApiPropertyOptional({ nullable: true })
  sender_city_name: string | null;

  @ApiPropertyOptional({ enum: NovaPoshtaSenderType, nullable: true })
  sender_type: NovaPoshtaSenderType | null;

  @ApiPropertyOptional({ nullable: true })
  sender_warehouse_ref: string | null;

  @ApiPropertyOptional({ nullable: true })
  sender_warehouse_name: string | null;

  @ApiPropertyOptional({ nullable: true })
  sender_street_ref: string | null;

  @ApiPropertyOptional({ nullable: true })
  sender_street_name: string | null;

  @ApiPropertyOptional({ nullable: true })
  sender_building: string | null;

  @ApiPropertyOptional({ nullable: true })
  sender_flat: string | null;

  @ApiPropertyOptional({ nullable: true })
  sender_ref: string | null;

  @ApiPropertyOptional({ nullable: true })
  sender_contact_ref: string | null;

  @ApiPropertyOptional({ enum: NovaPoshtaPaymentMethod, nullable: true })
  payment_method: NovaPoshtaPaymentMethod | null;

  @ApiPropertyOptional({ enum: NovaPoshtaPayerType, nullable: true })
  payer_type: NovaPoshtaPayerType | null;
}
