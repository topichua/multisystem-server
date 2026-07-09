export const MONOPAY_PROVIDER = "monopay" as const;

export const MONOPAY_DEFAULT_API_BASE_URL = "https://api.monobank.ua";

/** ISO 4217 numeric code for UAH. */
export const MONOPAY_CCY_UAH = 980;

export const MONOPAY_INVOICE_CREATE_PATH = "/api/merchant/invoice/create";

export const MONOPAY_INVOICE_STATUS_PATH = "/api/merchant/invoice/status";

export const MONOPAY_PUBKEY_PATH = "/api/merchant/pubkey";

export type MonopayInvoiceStatus =
  | "created"
  | "processing"
  | "hold"
  | "success"
  | "failure"
  | "reversed"
  | "expired";

export type MonopayCreateInvoiceRequest = {
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

export type MonopayCreateInvoiceResponse = {
  invoiceId: string;
  pageUrl: string;
};

export type MonopayInvoiceWebhookPayload = {
  invoiceId: string;
  status: MonopayInvoiceStatus;
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

export type MonopayPubKeyResponse = {
  key: string;
};
