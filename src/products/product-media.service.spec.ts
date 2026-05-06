import { BadRequestException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Product, ProductMedia, ProductVariant } from "../database/entities";
import { ProductMediaType } from "../database/entities/product-media-type.enum";
import { ProductMediaService } from "./product-media.service";

describe("ProductMediaService", () => {
  let service: ProductMediaService;

  const productExist = jest.fn();
  const variantFindOne = jest.fn();
  const mediaFind = jest.fn();

  beforeEach(async () => {
    productExist.mockReset();
    variantFindOne.mockReset();
    mediaFind.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductMediaService,
        {
          provide: getRepositoryToken(Product),
          useValue: { exist: productExist },
        },
        {
          provide: getRepositoryToken(ProductVariant),
          useValue: { findOne: variantFindOne },
        },
        {
          provide: getRepositoryToken(ProductMedia),
          useValue: {
            create: jest.fn((x) => x),
            save: jest.fn(async (x) => ({ ...x, id: 99 })),
            find: mediaFind,
            manager: { transaction: jest.fn() },
          },
        },
      ],
    }).compile();

    service = module.get(ProductMediaService);
  });

  it("addMedia rejects variant that does not belong to product", async () => {
    productExist.mockResolvedValue(true);
    variantFindOne.mockResolvedValue(null);

    await expect(
      service.addMedia(1, 10, {
        productId: 5,
        variantId: 42,
        url: "https://cdn.example/a.jpg",
        type: ProductMediaType.image,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("getEffectiveMedia returns product rows when variant has no media", async () => {
    productExist.mockResolvedValue(true);
    variantFindOne.mockResolvedValue({
      id: 2,
      productId: 5,
      companyId: 1,
    });
    const productRow = {
      id: 1,
      productId: 5,
      variantId: null,
      url: "p.jpg",
      type: ProductMediaType.image,
      sourceUrl: null,
      sortOrder: 0,
      companyId: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as ProductMedia;
    mediaFind
      .mockResolvedValueOnce([productRow])
      .mockResolvedValueOnce([]);

    const out = await service.getEffectiveMedia(1, 5, 2);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(1);
  });

  it("getEffectiveMedia prefers variant media when present", async () => {
    productExist.mockResolvedValue(true);
    variantFindOne.mockResolvedValue({
      id: 2,
      productId: 5,
      companyId: 1,
    });
    const productRow = {
      id: 1,
      variantId: null,
      sortOrder: 0,
    } as ProductMedia;
    const variantRow = {
      id: 10,
      variantId: 2,
      sortOrder: 0,
    } as ProductMedia;
    mediaFind
      .mockResolvedValueOnce([productRow])
      .mockResolvedValueOnce([variantRow]);

    const out = await service.getEffectiveMedia(1, 5, 2);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(10);
  });
});
