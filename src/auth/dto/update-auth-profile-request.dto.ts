import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";

function trimOptionalString(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
}

function pickString(
  obj: Record<string, unknown>,
  camel: string,
  snake: string,
): string | null | undefined {
  const camelVal = obj[camel];
  if (camelVal !== undefined) {
    return typeof camelVal === "string" ? camelVal.trim() : (camelVal as string);
  }
  const snakeVal = obj[snake];
  if (snakeVal !== undefined) {
    return typeof snakeVal === "string" ? snakeVal.trim() : (snakeVal as string);
  }
  return undefined;
}

export class UpdateAuthProfileRequestDto {
  @ApiPropertyOptional({ example: "Alex", description: "Also accepted as `first_name`." })
  @IsOptional()
  @Transform(({ value, obj }) =>
    pickString(obj as Record<string, unknown>, "firstName", "first_name") ??
    trimOptionalString(value),
  )
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  firstName?: string;

  /** Snake_case alias for `firstName` (whitelisted for UI payloads). */
  @IsOptional()
  @Transform(({ value }) => trimOptionalString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  first_name?: string;

  @ApiPropertyOptional({
    nullable: true,
    example: "Smith",
    description: "Also accepted as `last_name`.",
  })
  @IsOptional()
  @Transform(({ value, obj }) => {
    const picked = pickString(
      obj as Record<string, unknown>,
      "lastName",
      "last_name",
    );
    if (picked !== undefined) {
      return picked === "" ? null : picked;
    }
    if (value === null) return null;
    return trimOptionalString(value);
  })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(120)
  lastName?: string | null;

  /** Snake_case alias for `lastName` (whitelisted for UI payloads). */
  @IsOptional()
  @Transform(({ value }) => {
    if (value === null) return null;
    const trimmed = trimOptionalString(value);
    return typeof trimmed === "string" && trimmed.length === 0 ? null : trimmed;
  })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(120)
  last_name?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: "+380501234567",
    description:
      "Mobile phone. Stored on the user profile and returned on GET /auth.",
  })
  @IsOptional()
  @Transform(({ value }) => trimOptionalString(value))
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(32)
  phone?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === null) return null;
    const trimmed = trimOptionalString(value);
    return typeof trimmed === "string" && trimmed.length === 0 ? null : trimmed;
  })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(120)
  country?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === null) return null;
    const trimmed = trimOptionalString(value);
    return typeof trimmed === "string" && trimmed.length === 0 ? null : trimmed;
  })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(120)
  region?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === null) return null;
    const trimmed = trimOptionalString(value);
    return typeof trimmed === "string" && trimmed.length === 0 ? null : trimmed;
  })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(120)
  city?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(({ value, obj }) => {
    const picked = pickString(
      obj as Record<string, unknown>,
      "streetLine1",
      "street_line_1",
    );
    if (picked !== undefined) {
      return picked === "" ? null : picked;
    }
    if (value === null) return null;
    const trimmed = trimOptionalString(value);
    return typeof trimmed === "string" && trimmed.length === 0 ? null : trimmed;
  })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(255)
  streetLine1?: string | null;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === null) return null;
    const trimmed = trimOptionalString(value);
    return typeof trimmed === "string" && trimmed.length === 0 ? null : trimmed;
  })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(255)
  street_line_1?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(({ value, obj }) => {
    const picked = pickString(
      obj as Record<string, unknown>,
      "streetLine2",
      "street_line_2",
    );
    if (picked !== undefined) {
      return picked === "" ? null : picked;
    }
    if (value === null) return null;
    const trimmed = trimOptionalString(value);
    return typeof trimmed === "string" && trimmed.length === 0 ? null : trimmed;
  })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(255)
  streetLine2?: string | null;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === null) return null;
    const trimmed = trimOptionalString(value);
    return typeof trimmed === "string" && trimmed.length === 0 ? null : trimmed;
  })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(255)
  street_line_2?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(({ value, obj }) => {
    const picked = pickString(
      obj as Record<string, unknown>,
      "postalCode",
      "postal_code",
    );
    if (picked !== undefined) {
      return picked === "" ? null : picked;
    }
    if (value === null) return null;
    const trimmed = trimOptionalString(value);
    return typeof trimmed === "string" && trimmed.length === 0 ? null : trimmed;
  })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(40)
  postalCode?: string | null;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === null) return null;
    const trimmed = trimOptionalString(value);
    return typeof trimmed === "string" && trimmed.length === 0 ? null : trimmed;
  })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(40)
  postal_code?: string | null;
}

export function hasAuthProfileUpdateField(
  dto: UpdateAuthProfileRequestDto,
): boolean {
  return (
    dto.firstName !== undefined ||
    dto.first_name !== undefined ||
    dto.lastName !== undefined ||
    dto.last_name !== undefined ||
    dto.phone !== undefined ||
    dto.country !== undefined ||
    dto.region !== undefined ||
    dto.city !== undefined ||
    dto.streetLine1 !== undefined ||
    dto.street_line_1 !== undefined ||
    dto.streetLine2 !== undefined ||
    dto.street_line_2 !== undefined ||
    dto.postalCode !== undefined ||
    dto.postal_code !== undefined
  );
}

export function resolveAuthProfileFirstName(
  dto: UpdateAuthProfileRequestDto,
): string | undefined {
  if (dto.firstName !== undefined) {
    return dto.firstName.trim();
  }
  if (dto.first_name !== undefined) {
    return dto.first_name.trim();
  }
  return undefined;
}

export function resolveAuthProfileLastName(
  dto: UpdateAuthProfileRequestDto,
): string | null | undefined {
  if (dto.lastName !== undefined) {
    return dto.lastName?.trim() ? dto.lastName.trim() : null;
  }
  if (dto.last_name !== undefined) {
    return dto.last_name?.trim() ? dto.last_name.trim() : null;
  }
  return undefined;
}

export function resolveAuthProfileStreetLine1(
  dto: UpdateAuthProfileRequestDto,
): string | null | undefined {
  if (dto.streetLine1 !== undefined) {
    return dto.streetLine1?.trim() ? dto.streetLine1.trim() : null;
  }
  if (dto.street_line_1 !== undefined) {
    return dto.street_line_1?.trim() ? dto.street_line_1.trim() : null;
  }
  return undefined;
}

export function resolveAuthProfileStreetLine2(
  dto: UpdateAuthProfileRequestDto,
): string | null | undefined {
  if (dto.streetLine2 !== undefined) {
    return dto.streetLine2?.trim() ? dto.streetLine2.trim() : null;
  }
  if (dto.street_line_2 !== undefined) {
    return dto.street_line_2?.trim() ? dto.street_line_2.trim() : null;
  }
  return undefined;
}

export function resolveAuthProfilePostalCode(
  dto: UpdateAuthProfileRequestDto,
): string | null | undefined {
  if (dto.postalCode !== undefined) {
    return dto.postalCode?.trim() ? dto.postalCode.trim() : null;
  }
  if (dto.postal_code !== undefined) {
    return dto.postal_code?.trim() ? dto.postal_code.trim() : null;
  }
  return undefined;
}
