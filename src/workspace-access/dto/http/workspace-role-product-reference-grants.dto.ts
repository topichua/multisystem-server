import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsPositive,
  ValidateNested,
} from "class-validator";
import { INTEGRATION_TYPES } from "../../../integrations/integration-type";

export class WorkspaceRoleProductReferenceGrantItemDto {
  @ApiProperty({ enum: INTEGRATION_TYPES })
  integrationType!: string;

  @ApiProperty()
  integrationId!: number;

  @ApiProperty({ example: "My Instagram Page" })
  integrationName!: string;

  @ApiProperty({
    description: "Whether this role may manage product references on the channel.",
  })
  canManage!: boolean;
}

export class WorkspaceRoleProductReferenceGrantsResponseDto {
  @ApiProperty()
  roleId!: number;

  @ApiProperty({ type: [WorkspaceRoleProductReferenceGrantItemDto] })
  grants!: WorkspaceRoleProductReferenceGrantItemDto[];
}

export class WorkspaceRoleProductReferenceGrantInputDto {
  @ApiProperty({ enum: INTEGRATION_TYPES })
  @IsIn([...INTEGRATION_TYPES])
  integrationType!: string;

  @ApiProperty()
  @IsInt()
  @IsPositive()
  integrationId!: number;

  @ApiProperty({ example: true })
  @IsBoolean()
  canManage!: boolean;
}

export class ReplaceWorkspaceRoleProductReferenceGrantsRequestDto {
  @ApiProperty({ type: [WorkspaceRoleProductReferenceGrantInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkspaceRoleProductReferenceGrantInputDto)
  @ArrayUnique(
    (item: WorkspaceRoleProductReferenceGrantInputDto) =>
      `${item.integrationType}:${item.integrationId}`,
  )
  grants!: WorkspaceRoleProductReferenceGrantInputDto[];
}
