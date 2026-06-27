import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from "@nestjs/common";
import type {
  NovaPoshtaAccountInfo,
  NovaPoshtaAddressRecord,
  NovaPoshtaContactPerson,
  NovaPoshtaContactPersonRecord,
  NovaPoshtaCounterpartyDetails,
  NovaPoshtaCounterpartyRecord,
  NovaPoshtaDeparturePoint,
  NovaPoshtaSettlementRecord,
  NovaPoshtaSettlementSearchResult,
  NovaPoshtaStreetSearchResult,
  NovaPoshtaSearchSettlementsAddressRecord,
  NovaPoshtaSearchSettlementsDataItem,
  NovaPoshtaSearchStreetsDataItem,
  NovaPoshtaSearchStreetsAddressRecord,
  NovaPoshtaWarehouseRecord,
  NovaPoshtaWarehouseSearchRecord,
  NovaPoshtaWarehouseSearchResult,
  NovaPoshtaWarehouseSearchType,
  NovaPoshtaConnectSenderRefs,
} from "./novaposhta-api.types";
import { NovaPoshtaResponseCache } from "./novaposhta-response-cache";

const NOVA_POSHTA_API_URL = "https://api.novaposhta.ua/v2.0/json/";
const SETTLEMENTS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const WAREHOUSES_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const STREETS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const SETTLEMENT_TYPE_LABELS: Record<string, string> = {
  "м.": "місто",
  "с.": "село",
  "смт.": "смт",
  "смт": "смт",
};

type NovaPoshtaApiResponse<T = unknown> = {
  success?: boolean;
  data?: T;
  errors?: Array<{ message?: string }>;
  warnings?: unknown[];
  info?: unknown[];
};

@Injectable()
export class NovaPoshtaApiService {
  private readonly settlementsCache =
    new NovaPoshtaResponseCache<NovaPoshtaSettlementSearchResult[]>(
      SETTLEMENTS_CACHE_TTL_MS,
    );
  private readonly warehousesCache =
    new NovaPoshtaResponseCache<NovaPoshtaWarehouseSearchResult[]>(
      WAREHOUSES_CACHE_TTL_MS,
    );
  private readonly streetsCache =
    new NovaPoshtaResponseCache<NovaPoshtaStreetSearchResult[]>(
      STREETS_CACHE_TTL_MS,
    );

  async getAccountInfo(apiKey: string): Promise<NovaPoshtaAccountInfo> {
    const [senders, recipients] = await Promise.all([
      this.getCounterparties(apiKey, "Sender"),
      this.getCounterparties(apiKey, "Recipient"),
    ]);

    const [enrichedSenders, enrichedRecipients] = await Promise.all([
      this.enrichCounterparties(apiKey, senders, "Sender"),
      this.enrichCounterparties(apiKey, recipients, "Recipient"),
    ]);

    return { senders: enrichedSenders, recipients: enrichedRecipients };
  }

  async validateConnectRequest(
    apiKey: string,
    settings: NovaPoshtaConnectSenderRefs,
  ): Promise<void> {
    try {
      await this.getAccountInfo(apiKey);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw new BadRequestException("Invalid Nova Poshta API key");
      }
      throw error;
    }

    const cityRef = this.normalizeRef(settings.sender_city_ref);
    const warehouseRef = this.normalizeRef(settings.sender_warehouse_ref);

    if (settings.sender_type === "warehouse" && !warehouseRef) {
      throw new BadRequestException(
        "sender_warehouse_ref is required when sender_type is warehouse",
      );
    }

    if (cityRef && !(await this.isValidLocationRef(apiKey, cityRef))) {
      throw new BadRequestException(
        "sender_city_ref is not a valid Nova Poshta settlement or city reference",
      );
    }

    if (!warehouseRef) {
      return;
    }

    const warehouse = await this.getWarehouseByRef(apiKey, warehouseRef);
    if (!warehouse) {
      throw new BadRequestException(
        "sender_warehouse_ref is not a valid Nova Poshta warehouse reference",
      );
    }

    if (cityRef && !this.warehouseMatchesLocationRef(warehouse, cityRef)) {
      throw new BadRequestException(
        "sender_warehouse_ref does not belong to sender_city_ref",
      );
    }
  }

  private normalizeRef(value?: string | null): string | null {
    const trimmed = value?.trim();
    return trimmed || null;
  }

  private async isValidLocationRef(
    apiKey: string,
    ref: string,
  ): Promise<boolean> {
    const settlement = await this.requestAllowEmptyFailure<
      NovaPoshtaSettlementRecord[]
    >(apiKey, {
      modelName: "Address",
      calledMethod: "getSettlements",
      methodProperties: { Ref: ref, Limit: "1" },
    });
    if (settlement && settlement.length > 0) {
      return true;
    }

    const warehousesBySettlement = await this.requestAllowEmptyFailure<
      NovaPoshtaWarehouseSearchRecord[]
    >(apiKey, {
      modelName: "Address",
      calledMethod: "getWarehouses",
      methodProperties: { SettlementRef: ref, Limit: "1" },
    });
    if (warehousesBySettlement && warehousesBySettlement.length > 0) {
      return true;
    }

    const warehousesByCity = await this.requestAllowEmptyFailure<
      NovaPoshtaWarehouseSearchRecord[]
    >(apiKey, {
      modelName: "Address",
      calledMethod: "getWarehouses",
      methodProperties: { CityRef: ref, Limit: "1" },
    });
    return (warehousesByCity?.length ?? 0) > 0;
  }

  private async getWarehouseByRef(
    apiKey: string,
    ref: string,
  ): Promise<NovaPoshtaWarehouseSearchRecord | null> {
    const payload = await this.requestAllowEmptyFailure<
      NovaPoshtaWarehouseSearchRecord[]
    >(apiKey, {
      modelName: "Address",
      calledMethod: "getWarehouses",
      methodProperties: { Ref: ref, Limit: "1" },
    });
    return payload?.[0] ?? null;
  }

  private warehouseMatchesLocationRef(
    warehouse: NovaPoshtaWarehouseSearchRecord,
    locationRef: string,
  ): boolean {
    return (
      warehouse.SettlementRef?.trim() === locationRef ||
      warehouse.CityRef?.trim() === locationRef
    );
  }

  async searchSettlements(
    apiKey: string,
    query: string,
  ): Promise<NovaPoshtaSettlementSearchResult[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return [];
    }

    const cacheKey = normalizedQuery.toLowerCase();
    const cached = this.settlementsCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const payload = await this.request<NovaPoshtaSearchSettlementsDataItem[]>(
      apiKey,
      {
        modelName: "Address",
        calledMethod: "searchSettlements",
        methodProperties: {
          CityName: normalizedQuery,
          Limit: "20",
        },
      },
    );

    const results = this.normalizeSettlementsSearchResult(payload);
    this.settlementsCache.set(cacheKey, results);
    return results;
  }

  async searchWarehouses(
    apiKey: string,
    cityRef: string,
    query?: string,
    type: NovaPoshtaWarehouseSearchType = "all",
  ): Promise<NovaPoshtaWarehouseSearchResult[]> {
    const normalizedCityRef = cityRef.trim();
    const normalizedQuery = query?.trim() ?? "";

    const cacheKey = [
      normalizedCityRef,
      normalizedQuery.toLowerCase(),
      type,
    ].join(":");
    const cached = this.warehousesCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const methodProperties: Record<string, string> = {
      Limit: "50",
    };
    if (normalizedQuery) {
      methodProperties.FindByString = normalizedQuery;
    }

    const payload = await this.fetchWarehousesByLocationRef(
      apiKey,
      normalizedCityRef,
      methodProperties,
    );

    const results = this.normalizeWarehousesSearchResult(
      Array.isArray(payload) ? payload : [],
      type,
    );
    this.warehousesCache.set(cacheKey, results);
    return results;
  }

  private async fetchWarehousesByLocationRef(
    apiKey: string,
    locationRef: string,
    methodProperties: Record<string, string>,
  ): Promise<NovaPoshtaWarehouseSearchRecord[]> {
    const bySettlement = await this.requestAllowEmptyFailure<
      NovaPoshtaWarehouseSearchRecord[]
    >(apiKey, {
      modelName: "Address",
      calledMethod: "getWarehouses",
      methodProperties: {
        ...methodProperties,
        SettlementRef: locationRef,
      },
    });
    if (bySettlement != null && bySettlement.length > 0) {
      return bySettlement;
    }

    const byCity = await this.requestAllowEmptyFailure<
      NovaPoshtaWarehouseSearchRecord[]
    >(apiKey, {
      modelName: "Address",
      calledMethod: "getWarehouses",
      methodProperties: {
        ...methodProperties,
        CityRef: locationRef,
      },
    });
    if (byCity != null) {
      return byCity;
    }

    throw new BadRequestException(
      "Nova Poshta API error: City or settlement not found",
    );
  }

  private async requestAllowEmptyFailure<T>(
    apiKey: string,
    params: {
      modelName: string;
      calledMethod: string;
      methodProperties?: Record<string, unknown>;
    },
  ): Promise<T | null> {
    let response: Response;
    try {
      response = await fetch(NOVA_POSHTA_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey,
          modelName: params.modelName,
          calledMethod: params.calledMethod,
          methodProperties: params.methodProperties ?? {},
        }),
      });
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      throw new BadGatewayException(`Nova Poshta API request failed: ${err}`);
    }

    let body: NovaPoshtaApiResponse<T> = {};
    try {
      body = (await response.json()) as NovaPoshtaApiResponse<T>;
    } catch {
      throw new BadGatewayException("Nova Poshta API returned invalid JSON");
    }

    if (!response.ok || body.success !== true) {
      return null;
    }

    return (body.data ?? []) as T;
  }

  async searchStreets(
    apiKey: string,
    settlementRef: string,
    query: string,
  ): Promise<NovaPoshtaStreetSearchResult[]> {
    const normalizedSettlementRef = settlementRef.trim();
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return [];
    }

    const cacheKey = `${normalizedSettlementRef}:${normalizedQuery.toLowerCase()}`;
    const cached = this.streetsCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const payload = await this.request<NovaPoshtaSearchStreetsDataItem[]>(
      apiKey,
      {
        modelName: "Address",
        calledMethod: "searchSettlementStreets",
        methodProperties: {
          SettlementRef: normalizedSettlementRef,
          StreetName: normalizedQuery,
          Limit: "20",
        },
      },
    );

    const results = this.normalizeStreetsSearchResult(payload);
    this.streetsCache.set(cacheKey, results);
    return results;
  }

  private normalizeSettlementsSearchResult(
    data: NovaPoshtaSearchSettlementsDataItem[],
  ): NovaPoshtaSettlementSearchResult[] {
    const results: NovaPoshtaSettlementSearchResult[] = [];
    const seen = new Set<string>();

    for (const item of data) {
      for (const row of item.Addresses ?? []) {
        const mapped = this.mapSettlementSearchRow(row);
        if (!mapped || seen.has(mapped.ref)) {
          continue;
        }
        seen.add(mapped.ref);
        results.push(mapped);
      }
    }

    return results;
  }

  private mapSettlementSearchRow(
    row: NovaPoshtaSearchSettlementsAddressRecord,
  ): NovaPoshtaSettlementSearchResult | null {
    const ref = row.Ref?.trim();
    if (!ref || ref === "00000000-0000-0000-0000-000000000000") {
      return null;
    }

    const settlementTypeCode = row.SettlementTypeCode?.trim() ?? "";
    const mainDescription = row.MainDescription?.trim() ?? "";
    const area = row.Area?.trim() ?? "";
    const region = row.Region?.trim() ?? "";
    const deliveryCity = row.DeliveryCity?.trim() || null;

    return {
      ref,
      description: this.formatSettlementDescription(
        settlementTypeCode,
        mainDescription,
        area,
        region,
      ),
      settlementType:
        SETTLEMENT_TYPE_LABELS[settlementTypeCode.toLowerCase()] ??
        (settlementTypeCode.replace(/\.$/, "") || "населений пункт"),
      area,
      region,
      cityRef:
        deliveryCity && deliveryCity !== "00000000-0000-0000-0000-000000000000"
          ? deliveryCity
          : null,
    };
  }

  private formatSettlementDescription(
    settlementTypeCode: string,
    mainDescription: string,
    area: string,
    region: string,
  ): string {
    const title = [settlementTypeCode, mainDescription]
      .filter(Boolean)
      .join(" ")
      .trim();
    const locationSuffix =
      area && area !== "обл"
        ? `${area}${/обл/i.test(area) ? "" : " обл."}`
        : region;
    return locationSuffix ? `${title}, ${locationSuffix}` : title;
  }

  private normalizeWarehousesSearchResult(
    rows: NovaPoshtaWarehouseSearchRecord[],
    type: NovaPoshtaWarehouseSearchType,
  ): NovaPoshtaWarehouseSearchResult[] {
    return rows
      .map((row) => this.mapWarehouseSearchRow(row))
      .filter((row): row is NovaPoshtaWarehouseSearchResult => row != null)
      .filter((row) => this.matchesWarehouseTypeFilter(row.type, type));
  }

  private mapWarehouseSearchRow(
    row: NovaPoshtaWarehouseSearchRecord,
  ): NovaPoshtaWarehouseSearchResult | null {
    const ref = row.Ref?.trim();
    if (!ref) {
      return null;
    }

    const maxWeightRaw = row.TotalMaxWeightAllowed?.trim();
    const maxWeightAllowed =
      maxWeightRaw && maxWeightRaw !== "0"
        ? Number.parseFloat(maxWeightRaw)
        : null;

    return {
      ref,
      description: row.Description?.trim() ?? "",
      number: row.Number?.trim() || null,
      category: row.CategoryOfWarehouse?.trim() ?? "",
      type: this.resolveWarehouseType(row),
      address: row.ShortAddress?.trim() ?? "",
      maxWeightAllowed:
        maxWeightAllowed != null && Number.isFinite(maxWeightAllowed)
          ? maxWeightAllowed
          : null,
    };
  }

  private resolveWarehouseType(
    row: NovaPoshtaWarehouseSearchRecord,
  ): "warehouse" | "postomat" {
    const category = (row.CategoryOfWarehouse ?? "").toLowerCase();
    const description = (row.Description ?? "").toLowerCase();

    if (
      category.includes("postomat") ||
      category.includes("postmachine") ||
      description.includes("поштомат")
    ) {
      return "postomat";
    }

    return "warehouse";
  }

  private matchesWarehouseTypeFilter(
    warehouseType: "warehouse" | "postomat",
    filter: NovaPoshtaWarehouseSearchType,
  ): boolean {
    if (filter === "all") {
      return true;
    }
    return warehouseType === filter;
  }

  private normalizeStreetsSearchResult(
    data: NovaPoshtaSearchStreetsDataItem[],
  ): NovaPoshtaStreetSearchResult[] {
    const results: NovaPoshtaStreetSearchResult[] = [];
    const seen = new Set<string>();

    for (const item of data) {
      for (const row of item.Addresses ?? []) {
        const mapped = this.mapStreetSearchRow(row);
        if (!mapped || seen.has(mapped.ref)) {
          continue;
        }
        seen.add(mapped.ref);
        results.push(mapped);
      }
    }

    return results;
  }

  private mapStreetSearchRow(
    row: NovaPoshtaSearchStreetsAddressRecord,
  ): NovaPoshtaStreetSearchResult | null {
    const ref = row.SettlementStreetRef?.trim();
    if (!ref) {
      return null;
    }

    const streetType = row.StreetsTypeDescription?.trim() ?? "";
    const present = row.Present?.trim();
    const streetName = row.SettlementStreetDescription?.trim() ?? "";
    const description =
      present ||
      [streetType, streetName].filter(Boolean).join(" ").trim() ||
      streetName;

    return {
      ref,
      description,
      streetType,
    };
  }

  private async enrichCounterparties(
    apiKey: string,
    counterparties: NovaPoshtaCounterpartyRecord[],
    counterpartyProperty: "Sender" | "Recipient",
  ): Promise<NovaPoshtaCounterpartyDetails[]> {
    return Promise.all(
      counterparties.map((row) =>
        this.enrichCounterparty(apiKey, row, counterpartyProperty),
      ),
    );
  }

  private async enrichCounterparty(
    apiKey: string,
    row: NovaPoshtaCounterpartyRecord,
    counterpartyProperty: "Sender" | "Recipient",
  ): Promise<NovaPoshtaCounterpartyDetails> {
    const ref = row.Ref ?? "";
    const [contactPersons, departurePoints] = await Promise.all([
      ref
        ? this.getCounterpartyContactPersons(apiKey, ref)
        : Promise.resolve([]),
      ref
        ? this.getDeparturePoints(apiKey, ref, counterpartyProperty, row.City)
        : Promise.resolve([]),
    ]);

    return {
      ref,
      counterparty: this.formatCounterpartyLabel(row),
      counterpartyType: row.CounterpartyType ?? null,
      description: row.Description ?? "",
      firstName: row.FirstName ?? null,
      lastName: row.LastName ?? null,
      middleName: row.MiddleName ?? null,
      contactPersons,
      departurePoints,
    };
  }

  private async getDeparturePoints(
    apiKey: string,
    counterpartyRef: string,
    counterpartyProperty: "Sender" | "Recipient",
    cityRef?: string,
  ): Promise<NovaPoshtaDeparturePoint[]> {
    const addresses = await this.getCounterpartyAddresses(
      apiKey,
      counterpartyRef,
      counterpartyProperty,
    );
    const fallbackCity = cityRef
      ? await this.resolveSettlementName(apiKey, cityRef)
      : null;

    return Promise.all(
      addresses.map(async (address) => {
        const addressRef = address.Ref ?? "";
        const warehouse = addressRef
          ? await this.resolveWarehouse(apiKey, addressRef)
          : null;

        return {
          ref: addressRef,
          city: warehouse?.CityDescription ?? fallbackCity ?? "",
          warehouse:
            warehouse?.Description ?? address.Description ?? "",
          cityRef: warehouse?.CityRef ?? cityRef ?? null,
        };
      }),
    );
  }

  private async getCounterparties(
    apiKey: string,
    counterpartyProperty: "Sender" | "Recipient",
  ): Promise<NovaPoshtaCounterpartyRecord[]> {
    const payload = await this.request<NovaPoshtaCounterpartyRecord[]>(apiKey, {
      modelName: "Counterparty",
      calledMethod: "getCounterparties",
      methodProperties: { CounterpartyProperty: counterpartyProperty },
    });
    return Array.isArray(payload) ? payload : [];
  }

  private async getCounterpartyContactPersons(
    apiKey: string,
    counterpartyRef: string,
  ): Promise<NovaPoshtaContactPerson[]> {
    const payload = await this.request<NovaPoshtaContactPersonRecord[]>(
      apiKey,
      {
        modelName: "Counterparty",
        calledMethod: "getCounterpartyContactPersons",
        methodProperties: { Ref: counterpartyRef, Page: "1" },
      },
    );

    return (Array.isArray(payload) ? payload : []).map((row) => ({
      ref: row.Ref ?? "",
      description: row.Description ?? "",
      phone: row.Phones ?? "",
      email: row.Email && row.Email !== "null" ? row.Email : null,
      firstName: row.FirstName ?? null,
      lastName: row.LastName ?? null,
      middleName: row.MiddleName ?? null,
    }));
  }

  private async getCounterpartyAddresses(
    apiKey: string,
    counterpartyRef: string,
    counterpartyProperty: "Sender" | "Recipient",
  ): Promise<NovaPoshtaAddressRecord[]> {
    const payload = await this.request<NovaPoshtaAddressRecord[]>(apiKey, {
      modelName: "Counterparty",
      calledMethod: "getCounterpartyAddresses",
      methodProperties: {
        Ref: counterpartyRef,
        CounterpartyProperty: counterpartyProperty,
      },
    });
    return Array.isArray(payload) ? payload : [];
  }

  private async resolveWarehouse(
    apiKey: string,
    warehouseRef: string,
  ): Promise<NovaPoshtaWarehouseRecord | null> {
    try {
      const payload = await this.request<NovaPoshtaWarehouseRecord[]>(apiKey, {
        modelName: "Address",
        calledMethod: "getWarehouses",
        methodProperties: { Ref: warehouseRef, Limit: "1" },
      });
      return Array.isArray(payload) && payload.length > 0 ? payload[0] : null;
    } catch {
      return null;
    }
  }

  private async resolveSettlementName(
    apiKey: string,
    settlementRef: string,
  ): Promise<string | null> {
    try {
      const payload = await this.request<NovaPoshtaSettlementRecord[]>(
        apiKey,
        {
          modelName: "Address",
          calledMethod: "getSettlements",
          methodProperties: { Ref: settlementRef, Limit: "1" },
        },
      );
      return Array.isArray(payload) && payload.length > 0
        ? (payload[0].Description ?? null)
        : null;
    } catch {
      return null;
    }
  }

  private formatCounterpartyLabel(row: NovaPoshtaCounterpartyRecord): string {
    if (row.CounterpartyType === "PrivatePerson") {
      return "Приватна особа";
    }
    if (row.OwnershipFormDescription) {
      return row.OwnershipFormDescription;
    }
    return row.Description ?? "";
  }

  private async request<T>(
    apiKey: string,
    params: {
      modelName: string;
      calledMethod: string;
      methodProperties?: Record<string, unknown>;
    },
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(NOVA_POSHTA_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey,
          modelName: params.modelName,
          calledMethod: params.calledMethod,
          methodProperties: params.methodProperties ?? {},
        }),
      });
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      throw new BadGatewayException(`Nova Poshta API request failed: ${err}`);
    }

    let body: NovaPoshtaApiResponse<T> = {};
    try {
      body = (await response.json()) as NovaPoshtaApiResponse<T>;
    } catch {
      throw new BadGatewayException("Nova Poshta API returned invalid JSON");
    }

    if (!response.ok || body.success !== true) {
      const message =
        body.errors
          ?.map((item) => item.message)
          .filter(Boolean)
          .join("; ") || `HTTP ${response.status}`;
      throw new BadRequestException(`Nova Poshta API error: ${message}`);
    }

    return (body.data ?? []) as T;
  }
}
