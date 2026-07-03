import { ApiProperty } from "@nestjs/swagger";

export class KillTelegramListenersResponseDto {
  @ApiProperty({
    description:
      "Number of live listeners that were closed in this process. " +
      "0 means no listeners were running here (the duplicate, if any, lives elsewhere).",
    example: 1,
  })
  closed: number;
}
