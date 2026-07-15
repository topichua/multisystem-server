import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import {
  NovaPoshtaCodCommissionPayer,
  NovaPoshtaDeliveryType,
  NovaPoshtaPayerType,
  NovaPoshtaPaymentMethod,
  NovaPoshtaSenderType,
} from "../../database/entities";

function pickDeliveryType(
  obj: Record<string, unknown>,
): NovaPoshtaDeliveryType | null | undefined {
  if (obj.delivery_type !== undefined) {
    return obj.delivery_type as NovaPoshtaDeliveryType | null;
  }
  if (obj.deliveryType !== undefined) {
    return obj.deliveryType as NovaPoshtaDeliveryType | null;
  }
  return undefined;
}
import {
  NovaPoshtaEstimatedDeliveryPriceDto,
  NovaPoshtaEstimatedDeliveryPriceResponseDto,
} from "./novaposhta-estimated-delivery-price.dto";

function pickDefaultDeliveryDescription(
  obj: Record<string, unknown>,
): string | null | undefined {
  if (obj.default_delivery_description !== undefined) {
    return obj.default_delivery_description as string | null;
  }
  if (obj.defaultDeliveryDescription !== undefined) {
    return obj.defaultDeliveryDescription as string | null;
  }
  return undefined;
}

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
    enum: NovaPoshtaDeliveryType,
    nullable: true,
    description:
      "Shipment type (Тип відправлення) → Nova Poshta `CargoType`. " +
      "`cargo` = Посилка (default). Also accepted as `deliveryType`.",
    example: NovaPoshtaDeliveryType.CARGO,
  })
  @IsOptional()
  @Transform(({ obj }) => pickDeliveryType(obj as Record<string, unknown>))
  @ValidateIf((_, v) => v != null)
  @IsEnum(NovaPoshtaDeliveryType)
  delivery_type?: NovaPoshtaDeliveryType | null;

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

  @ApiPropertyOptional({
    nullable: true,
    description:
      "Default cargo description for waybill create (Description). Also accepted as `defaultDeliveryDescription`.",
  })
  @IsOptional()
  @Transform(({ obj }) =>
    pickDefaultDeliveryDescription(obj as Record<string, unknown>),
  )
  @IsString()
  @MaxLength(512)
  default_delivery_description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  defaultDeliveryDescription?: string | null;

  @ApiPropertyOptional({
    type: NovaPoshtaEstimatedDeliveryPriceDto,
    description:
      "Declared parcel value (оціночна ціна). Also accepted as `estimatedDeliveryPrice`.",
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => NovaPoshtaEstimatedDeliveryPriceDto)
  estimated_delivery_price?: NovaPoshtaEstimatedDeliveryPriceDto | null;

  @ApiPropertyOptional({
    type: NovaPoshtaEstimatedDeliveryPriceDto,
    description: "CamelCase alias for `estimated_delivery_price`.",
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => NovaPoshtaEstimatedDeliveryPriceDto)
  estimatedDeliveryPrice?: NovaPoshtaEstimatedDeliveryPriceDto | null;
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

  @ApiPropertyOptional({
    enum: NovaPoshtaDeliveryType,
    nullable: true,
    description: "Shipment type (Тип відправлення) → Nova Poshta `CargoType`.",
  })
  delivery_type: NovaPoshtaDeliveryType | null;

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

  @ApiPropertyOptional({
    nullable: true,
    description: "Default cargo description for waybill create.",
  })
  default_delivery_description: string | null;

  @ApiPropertyOptional({
    type: NovaPoshtaEstimatedDeliveryPriceResponseDto,
    description: "Declared parcel value (оціночна ціна посилки).",
  })
  estimated_delivery_price: NovaPoshtaEstimatedDeliveryPriceResponseDto;
}
