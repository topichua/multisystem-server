export const MONOBANK_DEFAULT_API_BASE_URL = "https://api.monobank.ua";

export const MONOBANK_INVOICE_CREATE_PATH = "/api/merchant/invoice/create";
export const MONOBANK_INVOICE_STATUS_PATH = "/api/merchant/invoice/status";
export const MONOBANK_INVOICE_REMOVE_PATH = "/api/merchant/invoice/remove";
export const MONOBANK_PUBKEY_PATH = "/api/merchant/pubkey";

/** ISO 4217 numeric code for UAH. */
export const MONOBANK_CCY_UAH = 980;

export type MonobankInvoiceStatus =
  | "created"
  | "processing"
  | "hold"
  | "success"
  | "failure"
  | "reversed"
  | "expired";

export type MonobankCreateInvoiceRequest = {
  amount: number;
  ccy: number;
  merchantPaymInfo?: {
    reference: string;
    destination: string;
    comment?: string;
  };
  redirectUrl: string;
  webHookUrl: string;
  validity?: number;
  paymentType?: "debit";
};

export type MonobankCreateInvoiceResponse = {
  invoiceId: string;
  pageUrl: string;
};

export type MonobankInvoicePayload = {
  invoiceId: string;
  status: MonobankInvoiceStatus;
  failureReason?: string;
  errCode?: string;
  amount: number;
  ccy: number;
  finalAmount?: number;
  createdDate?: string;
  modifiedDate?: string;
  reference?: string;
  destination?: string;
};

export type MonobankPubKeyResponse = {
  key: string;
};
