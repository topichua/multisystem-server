import { ApiProperty } from "@nestjs/swagger";

export class NovaPoshtaContactPersonDto {
  @ApiProperty({ example: "00000000-0000-0000-0000-000000000000" })
  ref: string;

  @ApiProperty({ example: "Залуга Андрій Петрович" })
  description: string;

  @ApiProperty({ example: "380681141315" })
  phone: string;

  @ApiProperty({ nullable: true, example: null })
  email: string | null;

  @ApiProperty({ nullable: true })
  firstName: string | null;

  @ApiProperty({ nullable: true })
  lastName: string | null;

  @ApiProperty({ nullable: true })
  middleName: string | null;
}

export class NovaPoshtaDeparturePointDto {
  @ApiProperty({ example: "00000000-0000-0000-0000-000000000000" })
  ref: string;

  @ApiProperty({ example: "Хмельницький" })
  city: string;

  @ApiProperty({
    example: "Відділення №1: вул. Трудова, 5/4 (за заправкою Укрнафта)",
  })
  warehouse: string;

  @ApiProperty({ nullable: true })
  cityRef: string | null;
}

export class NovaPoshtaCounterpartyDetailsDto {
  @ApiProperty({ example: "00000000-0000-0000-0000-000000000000" })
  ref: string;

  @ApiProperty({
    description: "Counterparty label as shown in Nova Poshta UI.",
    example: "Приватна особа",
  })
  counterparty: string;

  @ApiProperty({ nullable: true, example: "PrivatePerson" })
  counterpartyType: string | null;

  @ApiProperty()
  description: string;

  @ApiProperty({ nullable: true })
  firstName: string | null;

  @ApiProperty({ nullable: true })
  lastName: string | null;

  @ApiProperty({ nullable: true })
  middleName: string | null;

  @ApiProperty({ type: [NovaPoshtaContactPersonDto] })
  contactPersons: NovaPoshtaContactPersonDto[];

  @ApiProperty({
    type: [NovaPoshtaDeparturePointDto],
    description: "Sender departure cities and warehouse branches.",
  })
  departurePoints: NovaPoshtaDeparturePointDto[];
}

export class NovaPoshtaAccountInfoDto {
  @ApiProperty({ type: [NovaPoshtaCounterpartyDetailsDto] })
  senders: NovaPoshtaCounterpartyDetailsDto[];

  @ApiProperty({ type: [NovaPoshtaCounterpartyDetailsDto] })
  recipients: NovaPoshtaCounterpartyDetailsDto[];
}

export class NovaPoshtaIntegrationDetailsResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  workspaceId: number;

  @ApiProperty()
  ownerId: number;

  @ApiProperty()
  name: string;

  @ApiProperty({
    description: "Masked API key preview; full key is never returned.",
    example: "****a1b2",
  })
  apiKeyMasked: string;

  @ApiProperty()
  connectedAt: string;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;

  @ApiProperty({
    description:
      "Live sender/recipient data fetched from Nova Poshta API (counterparty, phone, contact person, city, warehouse).",
    type: NovaPoshtaAccountInfoDto,
  })
  novaposhta: NovaPoshtaAccountInfoDto;
}
