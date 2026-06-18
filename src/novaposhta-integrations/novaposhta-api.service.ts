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
  NovaPoshtaWarehouseRecord,
} from "./novaposhta-api.types";

const NOVA_POSHTA_API_URL = "https://api.novaposhta.ua/v2.0/json/";

type NovaPoshtaApiResponse<T = unknown> = {
  success?: boolean;
  data?: T;
  errors?: Array<{ message?: string }>;
  warnings?: unknown[];
  info?: unknown[];
};

@Injectable()
export class NovaPoshtaApiService {
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
