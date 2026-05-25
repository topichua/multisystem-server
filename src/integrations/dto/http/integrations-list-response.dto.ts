import { ApiProperty } from "@nestjs/swagger";
import { IntegrationListItemDto } from "./integration-list-item.dto";

export class IntegrationsListResponseDto {
  @ApiProperty({ description: "Workspace these integrations belong to" })
  workspaceId: number;

  @ApiProperty({ type: [IntegrationListItemDto] })
  items: IntegrationListItemDto[];
}
