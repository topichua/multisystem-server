import { ApiProperty } from "@nestjs/swagger";
import { NovaPoshtaCounterpartyDetailsDto } from "./novaposhta-integration-details.dto";
import { NovaPoshtaCredentialsQueryDto } from "./novaposhta-credentials-query.dto";

export class DiscoverNovaPoshtaSendersRequestDto extends NovaPoshtaCredentialsQueryDto {}

export class DiscoverNovaPoshtaSendersResponseDto {
  @ApiProperty({
    description:
      "Sender counterparties from Nova Poshta API. Pick `contactPersons[].ref` and related departure point when saving integration settings.",
    type: [NovaPoshtaCounterpartyDetailsDto],
  })
  senders: NovaPoshtaCounterpartyDetailsDto[];
}
