import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, Min, ValidateIf } from "class-validator";

export class SetOrderManualPaymentMethodDto {
  @ApiProperty({
    description:
      "Transfer method for this order (copy to client). Pass null for cash.",
    nullable: true,
  })
  @ValidateIf((_, value) => value != null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  manualPaymentMethodId!: number | null;
}
