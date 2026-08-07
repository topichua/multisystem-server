import { ProductFieldFilterMode } from "../dto/product-field-filter.dto";
import { ParseProductFieldFiltersPipe } from "./parse-product-field-filters.pipe";

describe("ParseProductFieldFiltersPipe", () => {
  const pipe = new ParseProductFieldFiltersPipe();

  it("parses field:id=all into fieldFilters", () => {
    const out = pipe.transform({
      sort: "created_desc",
      page: "1",
      pageSize: "10",
      "field:36": "all",
    }) as Record<string, unknown>;

    expect(out["field:36"]).toBeUndefined();
    expect(out.fieldFilters).toEqual([
      { fieldId: 36, mode: ProductFieldFilterMode.all },
    ]);
    expect(out.sort).toBe("created_desc");
    expect(out.page).toBe("1");
  });

  it("parses option ids", () => {
    const out = pipe.transform({
      "field:12": "3,7",
    }) as Record<string, unknown>;

    expect(out.fieldFilters).toEqual([
      {
        fieldId: 12,
        mode: ProductFieldFilterMode.in,
        values: ["3", "7"],
      },
    ]);
  });

  it("leaves non-query values unchanged", () => {
    expect(pipe.transform("id")).toBe("id");
    expect(pipe.transform(null)).toBeNull();
  });
});
