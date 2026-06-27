import { ApiProperty } from "@nestjs/swagger";

export class NovaPoshtaSettlementSearchItemDto {
  @ApiProperty()
  ref: string;

  @ApiProperty({ example: "м. Хмельницький, Хмельницька обл." })
  description: string;

  @ApiProperty({ example: "місто" })
  settlementType: string;

  @ApiProperty({ example: "Хмельницька" })
  area: string;

  @ApiProperty({ example: "Хмельницький" })
  region: string;

  @ApiProperty({
    nullable: true,
    description:
      "City reference for warehouse search (`cityRef` in GET /nova-poshta/warehouses/search).",
  })
  cityRef: string | null;
}

export class NovaPoshtaWarehouseSearchItemDto {
  @ApiProperty()
  ref: string;

  @ApiProperty({ example: "Відділення №3: вул. Сіцінського, 11" })
  description: string;

  @ApiProperty({ nullable: true, example: "3" })
  number: string | null;

  @ApiProperty({ example: "Branch" })
  category: string;

  @ApiProperty({ enum: ["warehouse", "postomat"] })
  type: "warehouse" | "postomat";

  @ApiProperty({ example: "вул. Сіцінського, 11" })
  address: string;

  @ApiProperty({ nullable: true, example: 30 })
  maxWeightAllowed: number | null;
}

export class NovaPoshtaStreetSearchItemDto {
  @ApiProperty()
  ref: string;

  @ApiProperty({ example: "вул. Степана Бандери" })
  description: string;

  @ApiProperty({ example: "вул." })
  streetType: string;
}
