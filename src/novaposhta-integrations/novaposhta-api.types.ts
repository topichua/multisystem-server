export type NovaPoshtaCounterpartyRecord = {
  Ref?: string;
  Description?: string;
  City?: string;
  FirstName?: string;
  LastName?: string;
  MiddleName?: string;
  OwnershipFormDescription?: string;
  CounterpartyType?: string;
};

export type NovaPoshtaContactPersonRecord = {
  Ref?: string;
  Description?: string;
  Phones?: string;
  Email?: string;
  FirstName?: string;
  LastName?: string;
  MiddleName?: string;
};

export type NovaPoshtaAddressRecord = {
  Ref?: string;
  Description?: string;
};

export type NovaPoshtaWarehouseRecord = {
  Ref?: string;
  Description?: string;
  CityRef?: string;
  CityDescription?: string;
};

export type NovaPoshtaSettlementRecord = {
  Ref?: string;
  Description?: string;
};

export type NovaPoshtaContactPerson = {
  ref: string;
  description: string;
  phone: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
};

export type NovaPoshtaDeparturePoint = {
  ref: string;
  city: string;
  warehouse: string;
  cityRef: string | null;
};

export type NovaPoshtaCounterpartyDetails = {
  ref: string;
  counterparty: string;
  counterpartyType: string | null;
  description: string;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  contactPersons: NovaPoshtaContactPerson[];
  departurePoints: NovaPoshtaDeparturePoint[];
};

export type NovaPoshtaAccountInfo = {
  senders: NovaPoshtaCounterpartyDetails[];
  recipients: NovaPoshtaCounterpartyDetails[];
};

export type NovaPoshtaSearchSettlementsAddressRecord = {
  Ref?: string;
  MainDescription?: string;
  Area?: string;
  Region?: string;
  SettlementTypeCode?: string;
  DeliveryCity?: string;
};

export type NovaPoshtaSearchSettlementsDataItem = {
  Addresses?: NovaPoshtaSearchSettlementsAddressRecord[];
};

export type NovaPoshtaSearchStreetsAddressRecord = {
  SettlementStreetRef?: string;
  SettlementStreetDescription?: string;
  Present?: string;
  StreetsTypeDescription?: string;
};

export type NovaPoshtaSearchStreetsDataItem = {
  Addresses?: NovaPoshtaSearchStreetsAddressRecord[];
};

export type NovaPoshtaWarehouseSearchRecord = {
  Ref?: string;
  Description?: string;
  Number?: string;
  CategoryOfWarehouse?: string;
  ShortAddress?: string;
  TotalMaxWeightAllowed?: string;
  TypeOfWarehouse?: string;
  SettlementRef?: string;
  CityRef?: string;
};

export type NovaPoshtaConnectSenderRefs = {
  sender_city_ref?: string | null;
  sender_warehouse_ref?: string | null;
  sender_type?: string | null;
};

export type NovaPoshtaSettlementSearchResult = {
  ref: string;
  description: string;
  settlementType: string;
  area: string;
  region: string;
  cityRef: string | null;
};

export type NovaPoshtaWarehouseSearchResult = {
  ref: string;
  description: string;
  number: string | null;
  category: string;
  type: "warehouse" | "postomat";
  address: string;
  maxWeightAllowed: number | null;
};

export type NovaPoshtaStreetSearchResult = {
  ref: string;
  description: string;
  streetType: string;
};

export type NovaPoshtaWarehouseSearchType = "all" | "warehouse" | "postomat";

