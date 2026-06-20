import { ApiProperty } from "@nestjs/swagger";

export class ReplyInstagramCommentResponseDto {
  @ApiProperty({
    description: "Created reply comment id from Meta Graph.",
  })
  id: string;
}
