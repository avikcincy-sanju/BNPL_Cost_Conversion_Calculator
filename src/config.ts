import type { AppConfig, FeeRow, ScenarioPreset, DefaultModelInputs } from './types';

// Starter fee table — prepopulated from May 2026 Stripe Amendment
// All values are user-editable at runtime
export const STARTER_FEE_TABLE: FeeRow[] = [
  { id: 'f1',  provider: 'Affirm',   country: 'United States',      percentFee: 3.44, fixedFee: 0.30, currency: 'USD', intlFeeApplicable: false, intlFeePercent: 0,    active: true, notes: 'Stripe Amendment May 2026' },
  { id: 'f2',  provider: 'Afterpay', country: 'United States',      percentFee: 3.68, fixedFee: 0.30, currency: 'USD', intlFeeApplicable: false, intlFeePercent: 0,    active: true, notes: 'Stripe Amendment May 2026' },
  { id: 'f3',  provider: 'Clearpay', country: 'United Kingdom',     percentFee: 3.73, fixedFee: 0.30, currency: 'GBP', intlFeeApplicable: false, intlFeePercent: 0,    active: true, notes: 'Stripe Amendment May 2026' },
  { id: 'f4',  provider: 'Afterpay', country: 'Australia',          percentFee: 3.63, fixedFee: 0.30, currency: 'AUD', intlFeeApplicable: false, intlFeePercent: 0,    active: true, notes: 'Stripe Amendment May 2026' },
  { id: 'f5',  provider: 'Afterpay', country: 'Canada',             percentFee: 3.88, fixedFee: 0.30, currency: 'CAD', intlFeeApplicable: false, intlFeePercent: 0,    active: true, notes: 'Stripe Amendment May 2026' },
  { id: 'f6',  provider: 'Afterpay', country: 'New Zealand',        percentFee: 3.63, fixedFee: 0.30, currency: 'NZD', intlFeeApplicable: false, intlFeePercent: 0,    active: true, notes: 'Stripe Amendment May 2026' },
  { id: 'f7',  provider: 'Klarna',   country: 'United States',      percentFee: 3.65, fixedFee: 0.30, currency: 'USD', intlFeeApplicable: true,  intlFeePercent: 1.50, active: true, notes: 'Stripe Amendment May 2026' },
  { id: 'f8',  provider: 'Klarna',   country: 'United Kingdom',     percentFee: 2.75, fixedFee: 0.30, currency: 'GBP', intlFeeApplicable: true,  intlFeePercent: 1.50, active: true, notes: 'Stripe Amendment May 2026' },
  { id: 'f9',  provider: 'Klarna',   country: 'Australia',          percentFee: 3.52, fixedFee: 0.55, currency: 'AUD', intlFeeApplicable: true,  intlFeePercent: 1.50, active: true, notes: 'Stripe Amendment May 2026' },
  { id: 'f10', provider: 'Klarna',   country: 'Canada',             percentFee: 3.65, fixedFee: 0.40, currency: 'CAD', intlFeeApplicable: true,  intlFeePercent: 1.50, active: true, notes: 'Stripe Amendment May 2026' },
  { id: 'f11', provider: 'Klarna',   country: 'New Zealand',        percentFee: 3.52, fixedFee: 0.60, currency: 'NZD', intlFeeApplicable: true,  intlFeePercent: 1.50, active: true, notes: 'Stripe Amendment May 2026' },
  { id: 'f12', provider: 'Klarna',   country: 'EEA Central Europe', percentFee: 2.15, fixedFee: 0.35, currency: 'EUR', intlFeeApplicable: true,  intlFeePercent: 1.50, active: true, notes: 'Stripe Amendment May 2026' },
  { id: 'f13', provider: 'Klarna',   country: 'EEA Southern Europe',percentFee: 3.15, fixedFee: 0.35, currency: 'EUR', intlFeeApplicable: true,  intlFeePercent: 1.50, active: true, notes: 'Stripe Amendment May 2026' },
  { id: 'f14', provider: 'Klarna',   country: 'EEA Eastern Europe', percentFee: 2.95, fixedFee: 0.40, currency: 'EUR', intlFeeApplicable: true,  intlFeePercent: 1.50, active: true, notes: 'Stripe Amendment May 2026' },
  { id: 'f15', provider: 'Klarna',   country: 'Switzerland',        percentFee: 2.05, fixedFee: 0.30, currency: 'CHF', intlFeeApplicable: true,  intlFeePercent: 1.50, active: true, notes: 'Stripe Amendment May 2026' },
];

export const STARTER_SCENARIOS: ScenarioPreset[] = [
  { id: 's1', name: 'Conservative', bnplAdoptionPercent: 5,  conversionUpliftPercent: 1, refundRatePercent: 5, active: true },
  { id: 's2', name: 'Moderate',     bnplAdoptionPercent: 12, conversionUpliftPercent: 3, refundRatePercent: 5, active: true },
  { id: 's3', name: 'Aggressive',   bnplAdoptionPercent: 20, conversionUpliftPercent: 5, refundRatePercent: 7, active: true },
];

export const STARTER_DEFAULTS: DefaultModelInputs = {
  country: 'United States',
  provider: 'Affirm',
  eventType: 'IRONMAN Full Distance',
  registrationPrice: 900,
  expectedRegistrations: 10000,
  standardCardFeePercent: 2.70,
  standardCardFixedFee: 0.30,
  bnplAdoptionPercent: 12,
  conversionUpliftPercent: 3,
  contributionMarginPercent: 60,
  refundRatePercent: 5,
  avgRefundAmountPercent: 100,
  feeAbsorption: 'IRONMAN absorbs BNPL cost',
  athleteSurchargePercent: 1.5,
};

export const STARTER_CONFIG: AppConfig = {
  feeTable: STARTER_FEE_TABLE,
  scenarios: STARTER_SCENARIOS,
  defaults: STARTER_DEFAULTS,
};

const STORAGE_KEY = 'bnpl_calc_config_v1';
const INPUTS_KEY = 'bnpl_calc_inputs_v1';

export function loadConfig(): AppConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as AppConfig;
  } catch { /* ignore */ }
  return structuredClone(STARTER_CONFIG);
}

export function saveConfig(config: AppConfig) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)); } catch { /* ignore */ }
}

export function loadInputsFromStorage<T>(fallback: T): T {
  try {
    const raw = localStorage.getItem(INPUTS_KEY);
    if (raw) return JSON.parse(raw) as T;
  } catch { /* ignore */ }
  return fallback;
}

export function saveInputsToStorage<T>(inputs: T) {
  try { localStorage.setItem(INPUTS_KEY, JSON.stringify(inputs)); } catch { /* ignore */ }
}

export function clearAllStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(INPUTS_KEY);
  } catch { /* ignore */ }
}

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export const EVENT_TYPES = ['IRONMAN Full Distance', 'IRONMAN 70.3', "Rock 'n' Roll Marathon", 'Other'] as const;
export const FEE_ABSORPTIONS = ['IRONMAN absorbs BNPL cost', 'Athlete surcharge', 'Shared absorption'] as const;
