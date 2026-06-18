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
