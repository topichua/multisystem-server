import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { ProductExportsService } from "./product-exports.service";
import {
  ProductExportFormat,
  ProductExportScope,
} from "./dto/create-product-export.dto";
import type { ProductExport } from "../database/entities/product-export.entity";

describe("ProductExportsService", () => {
  function buildService(overrides?: {
    canViewPurchasePrice?: boolean;
    r2CanUpload?: boolean;
    collectIds?: number[];
    collectError?: Error;
    exportRow?: ProductExport | null;
  }) {
    const exportRepo = {
      create: jest.fn((v) => ({ ...v })),
      save: jest.fn(async (v) => v),
      findOne: jest.fn(async ({ where }: { where: { id?: string; workspaceId?: number } }) => {
        const row = overrides?.exportRow ?? null;
        if (!row) return null;
        if (where.id && row.id !== where.id) return null;
        if (where.workspaceId != null && row.workspaceId !== where.workspaceId) {
          return null;
        }
        return row;
      }),
      find: jest.fn(async (): Promise<ProductExport[]> => []),
      update: jest.fn(async () => ({ affected: 1 })),
      manager: {
        transaction: jest.fn(async (fn: (em: unknown) => Promise<unknown>) => {
          const repo = {
            createQueryBuilder: () => ({
              where: () => ({
                orderBy: () => ({
                  limit: () => ({
                    setLock: () => ({
                      setOnLocked: () => ({
                        getOne: async () => null,
                      }),
                    }),
                  }),
                }),
              }),
            }),
            save: async (r: unknown) => r,
          };
          return fn({ getRepository: () => repo });
        }),
      },
    };

    const variantRepo = {
      createQueryBuilder: jest.fn(() => ({
        innerJoin: () => ({
          where: () => ({
            andWhere: () => ({
              getCount: async () => 0,
            }),
          }),
        }),
      })),
    };

    const products = {
      collectProductIdsForExport: jest.fn(async () => {
        if (overrides?.collectError) throw overrides.collectError;
        return overrides?.collectIds ?? [1, 2];
      }),
      loadProductsForExport: jest.fn(async () => ({
        products: [],
        categoriesById: new Map(),
        fieldDefs: [],
        stockMap: new Map(),
        productImageById: new Map(),
      })),
    };

    const r2 = {
      canUpload: jest.fn(() => overrides?.r2CanUpload ?? true),
      uploadObject: jest.fn(async ({ key }: { key: string }) => ({
        key,
        publicUrl: null,
      })),
      createSignedGetUrl: jest.fn(async () => "https://signed.example/file"),
      deleteObject: jest.fn(async () => undefined),
    };

    const workspaceContext = {
      requireWorkspaceForOwner: jest.fn(async () => ({ id: 4 })),
    };

    const productAuthz = {
      requireExport: jest.fn(async () => {
        if (overrides?.canViewPurchasePrice === undefined) {
          /* ok */
        }
      }),
      canViewPurchasePrice: jest.fn(
        async () => overrides?.canViewPurchasePrice ?? true,
      ),
    };

    // simulate permission denied via spy override later
    const config = {
      get: jest.fn((key: string) => {
        if (key === "PRODUCT_EXPORT_MAX_VARIANTS") return "2";
        if (key === "PRODUCT_EXPORT_RETENTION_DAYS") return "7";
        if (key === "PRODUCT_EXPORT_SIGNED_URL_SECONDS") return "900";
        return undefined;
      }),
    };

    const service = new ProductExportsService(
      exportRepo as never,
      variantRepo as never,
      products as never,
      r2 as never,
      workspaceContext as never,
      productAuthz as never,
      config as never,
    );

    return {
      service,
      exportRepo,
      variantRepo,
      products,
      r2,
      productAuthz,
      workspaceContext,
    };
  }

  it("creates pending export for filtered scope with purchase price flag", async () => {
    const { service, exportRepo, productAuthz } = buildService({
      canViewPurchasePrice: false,
    });
    const res = await service.createForOwner(10, {
      scope: ProductExportScope.filtered,
      format: ProductExportFormat.xlsx,
      filters: { search: "худі" },
      sort: { field: "createdAt", direction: "desc" },
    });
    expect(res.status).toBe("pending");
    expect(res.id).toMatch(/^exp_/);
    expect(exportRepo.save).toHaveBeenCalled();
    const saved = exportRepo.save.mock.calls[0][0];
    expect(saved.workspaceId).toBe(4);
    expect(saved.filters).toMatchObject({ search: "худі" });
    expect(saved.includePurchasePrice).toBe(false);
    expect(productAuthz.requireExport).toHaveBeenCalled();
  });

  it("rejects selected with foreign productIds", async () => {
    const { service } = buildService({
      collectError: new BadRequestException(
        "One or more productIds are invalid or not in your workspace",
      ),
    });
    await expect(
      service.createForOwner(10, {
        scope: ProductExportScope.selected,
        format: ProductExportFormat.csv,
        productIds: [999],
        filters: { search: "ignored" },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("requires productIds when selected", async () => {
    const { service } = buildService();
    await expect(
      service.createForOwner(10, {
        scope: ProductExportScope.selected,
        format: ProductExportFormat.csv,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("isolates status by workspace", async () => {
    const row = {
      id: "exp_other",
      workspaceId: 99,
      status: "completed",
      fileKey: "k",
      fileName: "f.xlsx",
      fileSize: 10,
      createdAt: new Date(),
      completedAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
      errorMessage: null,
    } as ProductExport;
    const { service } = buildService({ exportRow: row });
    // findOne returns null when workspace mismatch via our mock which checks workspaceId
    // our mock returns null when workspace != 99 and we request workspace 4
    await expect(
      service.getStatusForOwner(10, "exp_other"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("returns status completed without download for non-completed", async () => {
    const row = {
      id: "exp_1",
      workspaceId: 4,
      status: "pending",
      fileKey: null,
      fileName: null,
      fileSize: null,
      createdAt: new Date(),
      completedAt: null,
      expiresAt: null,
      errorMessage: null,
    } as ProductExport;
    const { service, r2 } = buildService({ exportRow: row });
    const dto = await service.getStatusForOwner(10, "exp_1");
    expect(dto.status).toBe("pending");
    expect(dto.downloadUrl).toBeUndefined();
    expect(r2.createSignedGetUrl).not.toHaveBeenCalled();
  });

  it("returns failed with safe error message", async () => {
    const row = {
      id: "exp_1",
      workspaceId: 4,
      status: "failed",
      errorMessage: "Не вдалося сформувати файл експорту",
      createdAt: new Date(),
      completedAt: new Date(),
      expiresAt: null,
      fileKey: null,
      fileName: null,
      fileSize: null,
    } as ProductExport;
    const { service } = buildService({ exportRow: row });
    const dto = await service.getStatusForOwner(10, "exp_1");
    expect(dto.status).toBe("failed");
    expect(dto.errorMessage).toBe("Не вдалося сформувати файл експорту");
    expect(dto.downloadUrl).toBeUndefined();
  });

  it("processExportJob is idempotent for completed jobs", async () => {
    const row = {
      id: "exp_done",
      workspaceId: 4,
      status: "completed",
      fileKey: "product-exports/4/exp_done/x.xlsx",
      format: "xlsx",
      scope: "all",
    } as ProductExport;
    const { service, products, r2 } = buildService({ exportRow: row });
    await service.processExportJob(row);
    expect(products.collectProductIdsForExport).not.toHaveBeenCalled();
    expect(r2.uploadObject).not.toHaveBeenCalled();
  });

  it("fails job when variant limit exceeded", async () => {
    const row = {
      id: "exp_big",
      workspaceId: 4,
      status: "processing",
      format: "csv",
      scope: "all",
      filters: null,
      sort: null,
      productIds: null,
      includePurchasePrice: false,
      createdAt: new Date(),
    } as ProductExport;

    const exportRepo = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(async () => ({ ...row })),
      find: jest.fn(),
      update: jest.fn(async () => ({ affected: 1 })),
      manager: { transaction: jest.fn() },
    };
    const variantRepo = {
      createQueryBuilder: jest.fn(() => ({
        innerJoin: () => ({
          where: () => ({
            andWhere: () => ({
              getCount: async () => 5, // > max 2 from config
            }),
          }),
        }),
      })),
    };
    const products = {
      collectProductIdsForExport: jest.fn(async () => [1, 2, 3]),
      loadProductsForExport: jest.fn(),
    };
    const r2 = {
      canUpload: () => true,
      uploadObject: jest.fn(),
      createSignedGetUrl: jest.fn(),
      deleteObject: jest.fn(),
    };
    const service = new ProductExportsService(
      exportRepo as never,
      variantRepo as never,
      products as never,
      r2 as never,
      { requireWorkspaceForOwner: async () => ({ id: 4 }) } as never,
      {
        requireExport: async () => undefined,
        canViewPurchasePrice: async () => false,
      } as never,
      {
        get: (k: string) =>
          k === "PRODUCT_EXPORT_MAX_VARIANTS" ? "2" : undefined,
      } as never,
    );

    await service.processExportJob(row);
    expect(exportRepo.update).toHaveBeenCalledWith(
      "exp_big",
      expect.objectContaining({
        status: "failed",
        errorMessage: expect.stringContaining("забагато варіантів"),
      }),
    );
    expect(r2.uploadObject).not.toHaveBeenCalled();
  });

  it("cleanupExpiredExports deletes R2 and marks expired", async () => {
    const expired = {
      id: "exp_old",
      fileKey: "product-exports/4/exp_old/f.xlsx",
      status: "completed",
      expiresAt: new Date(Date.now() - 1000),
    } as ProductExport;
    const { service, exportRepo, r2 } = buildService();
    exportRepo.find.mockResolvedValueOnce([expired]);
    const n = await service.cleanupExpiredExports();
    expect(n).toBe(1);
    expect(r2.deleteObject).toHaveBeenCalledWith(expired.fileKey);
    expect(exportRepo.update).toHaveBeenCalledWith(
      "exp_old",
      expect.objectContaining({ status: "expired", fileKey: null }),
    );
  });

  it("propagates permission denied on create", async () => {
    const { service, productAuthz } = buildService();
    productAuthz.requireExport.mockRejectedValueOnce(
      new ForbiddenException("Missing permission: products.export"),
    );
    await expect(
      service.createForOwner(10, {
        scope: ProductExportScope.all,
        format: ProductExportFormat.xlsx,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("signed download for completed export", async () => {
    const row = {
      id: "exp_1",
      workspaceId: 4,
      status: "completed",
      fileKey: "product-exports/4/exp_1/f.xlsx",
      fileName: "f.xlsx",
      expiresAt: new Date(Date.now() + 86400000),
    } as ProductExport;
    const { service, r2 } = buildService({ exportRow: row });
    const res = await service.getDownloadForOwner(10, "exp_1");
    expect(res.downloadUrl).toBe("https://signed.example/file");
    expect(r2.createSignedGetUrl).toHaveBeenCalledWith(
      row.fileKey,
      expect.any(Number),
    );
  });
});
