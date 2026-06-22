export interface ProvinceTax {
  label: string;       // e.g. "Alberta"
  taxLabel: string;    // e.g. "GST" | "HST" | "GST+PST" | "GST+QST"
  rate: number;        // combined rate as percent, e.g. 5 / 13 / 14.975
}

/** CRA 2026 combined tax rates for Canadian provinces/territories. */
export const CANADA_TAX_RATES: Record<string, ProvinceTax> = {
  AB: { label: 'Alberta',                       taxLabel: 'GST',     rate: 5 },
  BC: { label: 'British Columbia',              taxLabel: 'GST+PST', rate: 12 },
  MB: { label: 'Manitoba',                      taxLabel: 'GST+PST', rate: 12 },
  NB: { label: 'New Brunswick',                 taxLabel: 'HST',     rate: 15 },
  NL: { label: 'Newfoundland and Labrador',     taxLabel: 'HST',     rate: 15 },
  NS: { label: 'Nova Scotia',                   taxLabel: 'HST',     rate: 14 },
  NT: { label: 'Northwest Territories',         taxLabel: 'GST',     rate: 5 },
  NU: { label: 'Nunavut',                       taxLabel: 'GST',     rate: 5 },
  ON: { label: 'Ontario',                       taxLabel: 'HST',     rate: 13 },
  PE: { label: 'Prince Edward Island',          taxLabel: 'HST',     rate: 15 },
  QC: { label: 'Quebec',                        taxLabel: 'GST+QST', rate: 14.975 },
  SK: { label: 'Saskatchewan',                  taxLabel: 'GST+PST', rate: 11 },
  YT: { label: 'Yukon',                         taxLabel: 'GST',     rate: 5 },
};

export const PROVINCE_OPTIONS = Object.entries(CANADA_TAX_RATES).map(
  ([code, info]) => ({ code, ...info }),
);
