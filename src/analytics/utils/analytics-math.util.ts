export function roundAnalyticsMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateChangePercent(
  current: number,
  previous: number,
): number {
  if (previous === 0) {
    return current === 0 ? 0 : 100;
  }
  return roundAnalyticsMoney(((current - previous) / previous) * 100);
}
