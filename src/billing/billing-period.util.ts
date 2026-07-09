import { BillingCycle } from "../database/entities/billing-cycle.enum";

export function billingPeriodBounds(
  cycle: BillingCycle,
  ref: Date = new Date(),
): { periodStart: Date; periodEnd: Date } {
  return billingPeriodFrom(cycle, startOfUtcMonth(ref));
}

export function billingPeriodFrom(
  cycle: BillingCycle,
  periodStart: Date,
): { periodStart: Date; periodEnd: Date } {
  const start = new Date(periodStart);
  const end = new Date(start);
  if (cycle === BillingCycle.yearly) {
    end.setUTCFullYear(end.getUTCFullYear() + 1);
  } else {
    end.setUTCMonth(end.getUTCMonth() + 1);
  }
  return { periodStart: start, periodEnd: end };
}

function startOfUtcMonth(ref: Date): Date {
  return new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1));
}

export function nextCreditsResetAt(ref: Date = new Date()): Date {
  const reset = new Date(
    Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 1),
  );
  return reset;
}
