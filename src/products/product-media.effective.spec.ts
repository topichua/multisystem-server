import { resolveEffectiveMediaOrder } from "./product-media.effective";

describe("resolveEffectiveMediaOrder", () => {
  const p1 = { id: 1, sortOrder: 0 };
  const p2 = { id: 2, sortOrder: 1 };
  const v1 = { id: 10, sortOrder: 0 };

  it("uses variant media when non-empty", () => {
    expect(resolveEffectiveMediaOrder([v1], [p1, p2])).toEqual([v1]);
  });

  it("falls back to product media when variant list is empty", () => {
    expect(resolveEffectiveMediaOrder([], [p2, p1])).toEqual([p1, p2]);
  });

  it("sorts by sortOrder then id", () => {
    const a = { id: 5, sortOrder: 1 };
    const b = { id: 3, sortOrder: 1 };
    expect(resolveEffectiveMediaOrder([], [a, b])).toEqual([b, a]);
  });
});
