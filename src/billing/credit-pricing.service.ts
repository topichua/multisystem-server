import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { BillingCreditPricing } from "../database/entities/billing-credit-pricing.entity";
import type { CreditPricingResponseDto } from "./dto/credit-pricing-response.dto";
import type { UpdateCreditPricingRequestDto } from "./dto/update-credit-pricing-request.dto";

@Injectable()
export class CreditPricingService {
  constructor(
    @InjectRepository(BillingCreditPricing)
    private readonly pricingRepo: Repository<BillingCreditPricing>,
  ) {}

  async getPublicPricing(): Promise<CreditPricingResponseDto> {
    const row = await this.requirePricingRow();
    return this.toDto(row);
  }

  async requireActivePricing(): Promise<BillingCreditPricing> {
    const row = await this.requirePricingRow();
    if (!row.isActive) {
      throw new BadRequestException("Credit purchases are currently disabled");
    }
    if (row.pricePerCredit <= 0) {
      throw new BadRequestException("Credit price is not configured");
    }
    return row;
  }

  async updatePricing(
    dto: UpdateCreditPricingRequestDto,
  ): Promise<CreditPricingResponseDto> {
    const row = await this.requirePricingRow();
    if (dto.pricePerCredit !== undefined) {
      row.pricePerCredit = dto.pricePerCredit;
    }
    if (dto.currency !== undefined) {
      row.currency = dto.currency.trim().toUpperCase() || "UAH";
    }
    if (dto.minPurchaseCredits !== undefined) {
      row.minPurchaseCredits = dto.minPurchaseCredits;
    }
    if (dto.maxPurchaseCredits !== undefined) {
      row.maxPurchaseCredits = dto.maxPurchaseCredits;
    }
    if (dto.isActive !== undefined) {
      row.isActive = dto.isActive;
    }
    if (
      row.maxPurchaseCredits != null &&
      row.maxPurchaseCredits < row.minPurchaseCredits
    ) {
      throw new BadRequestException(
        "maxPurchaseCredits cannot be less than minPurchaseCredits",
      );
    }
    await this.pricingRepo.save(row);
    return this.toDto(row);
  }

  calculatePurchaseAmount(
    pricing: BillingCreditPricing,
    creditsAmount: number,
  ): number {
    const amount = creditsAmount * pricing.pricePerCredit;
    return Math.round(amount * 100) / 100;
  }

  validatePurchaseAmount(
    pricing: BillingCreditPricing,
    creditsAmount: number,
  ): void {
    if (creditsAmount < pricing.minPurchaseCredits) {
      throw new BadRequestException(
        `Minimum credit purchase is ${pricing.minPurchaseCredits}`,
      );
    }
    if (
      pricing.maxPurchaseCredits != null &&
      creditsAmount > pricing.maxPurchaseCredits
    ) {
      throw new BadRequestException(
        `Maximum credit purchase is ${pricing.maxPurchaseCredits}`,
      );
    }
  }

  private async requirePricingRow(): Promise<BillingCreditPricing> {
    const row = await this.pricingRepo.findOne({
      where: {},
      order: { id: "ASC" },
    });
    if (!row) {
      throw new NotFoundException("Credit pricing is not configured");
    }
    return row;
  }

  private toDto(row: BillingCreditPricing): CreditPricingResponseDto {
    return {
      pricePerCredit: row.pricePerCredit,
      currency: row.currency,
      minPurchaseCredits: row.minPurchaseCredits,
      maxPurchaseCredits: row.maxPurchaseCredits,
      isActive: row.isActive,
    };
  }
}
