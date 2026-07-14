import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";
import {
  NovaPoshtaCodCommissionPayer,
  NovaPoshtaPayerType,
  NovaPoshtaPaymentMethod,
  NovaPoshtaSenderType,
} from "../../database/entities";
import { NovaPoshtaOrderStatusMappingDto } from "./novaposhta-order-status-mapping.dto";
import { NovaPoshtaOrderStatusMappingResponseDto } from "./novaposhta-order-status-mapping.dto";

export class NovaPoshtaSenderSettingsDto extends NovaPoshtaOrderStatusMappingDto {
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

  @ApiPropertyOptional({
    description:
      "Settlement `ref` from settlement search, or legacy delivery `cityRef` / `DeliveryCity` from discover/warehouse data.",
  })
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

  @ApiPropertyOptional({
    enum: NovaPoshtaPaymentMethod,
    description:
      "Nova Poshta `PaymentMethod`. Use `cash` without a carrier contract; `non_cash` requires an NP contract and EDRPOU (sender pays only).",
  })
  @IsOptional()
  @IsEnum(NovaPoshtaPaymentMethod)
  payment_method?: NovaPoshtaPaymentMethod | null;

  @ApiPropertyOptional({
    enum: NovaPoshtaPayerType,
    description:
      "Who pays delivery: `sender`, `recipient`, or `third_person`. When `recipient`, payment is always cash at the branch.",
  })
  @IsOptional()
  @IsEnum(NovaPoshtaPayerType)
  payer_type?: NovaPoshtaPayerType | null;

  @ApiPropertyOptional({
    enum: NovaPoshtaCodCommissionPayer,
    description:
      "Платник комісії післяплати: `recipient` (Отримувач) or `sender` (Відправник). " +
      "Used when creating a COD waybill (`isCashOnDelivery`). Defaults to `recipient` when omitted.",
  })
  @IsOptional()
  @IsEnum(NovaPoshtaCodCommissionPayer)
  cod_commission_payer?: NovaPoshtaCodCommissionPayer | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "Default parcel weight in kg (Вага). Used when creating a waybill if set.",
    minimum: 0.1,
  })
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  default_weight_kg?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "Default parcel width in cm (Ширина).",
    minimum: 0.1,
  })
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  default_width_cm?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "Default parcel height in cm (Висота).",
    minimum: 0.1,
  })
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  default_height_cm?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "Default parcel length in cm (Довжина).",
    minimum: 0.1,
  })
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  default_length_cm?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      "Призначення платежу — sent as Nova Poshta `AdditionalInformation` on waybill create.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  payment_purpose?: string | null;
}

export class NovaPoshtaSenderSettingsResponseDto extends NovaPoshtaOrderStatusMappingResponseDto {
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

  @ApiPropertyOptional({
    enum: NovaPoshtaCodCommissionPayer,
    nullable: true,
    description: "Платник комісії післяплати: Отримувач (`recipient`) або Відправник (`sender`).",
  })
  cod_commission_payer: NovaPoshtaCodCommissionPayer | null;

  @ApiPropertyOptional({ nullable: true, description: "Default weight (Вага), kg." })
  default_weight_kg: number | null;

  @ApiPropertyOptional({ nullable: true, description: "Default width (Ширина), cm." })
  default_width_cm: number | null;

  @ApiPropertyOptional({ nullable: true, description: "Default height (Висота), cm." })
  default_height_cm: number | null;

  @ApiPropertyOptional({ nullable: true, description: "Default length (Довжина), cm." })
  default_length_cm: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "Призначення платежу.",
  })
  payment_purpose: string | null;
}
