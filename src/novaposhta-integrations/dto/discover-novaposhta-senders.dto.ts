import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";
import {
  NovaPoshtaCounterpartyDetailsDto,
} from "./novaposhta-integration-details.dto";

export class DiscoverNovaPoshtaSendersRequestDto {
  @ApiProperty({ description: "Nova Poshta API key to query senders and contact persons" })
  @IsString()
  @MinLength(8)
  @MaxLength(512)
  api_key: string;
}

export class DiscoverNovaPoshtaSendersResponseDto {
  @ApiProperty({
    description:
      "Sender counterparties from Nova Poshta API. Pick `contactPersons[].ref` and related departure point when saving integration settings.",
    type: [NovaPoshtaCounterpartyDetailsDto],
  })
  senders: NovaPoshtaCounterpartyDetailsDto[];
}
