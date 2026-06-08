import type { AppConfig, FeeRow, ScenarioPreset, DefaultModelInputs, ConfigMetadata, MarketRow, EventPortfolioRow, ConfidenceLevel, RegionName } from './types';
import { DEFAULT_CONFIDENCE } from './types';

// Starter fee table — prepopulated from May 2026 Stripe Amendment
// All values are user-editable at runtime
export const STARTER_FEE_TABLE: FeeRow[] = [
  { id: 'f1',  provider: 'Affirm',   country: 'United States',       percentFee: 3.44, fixedFee: 0.30, currency: 'USD', intlFeeApplicable: false, intlFeePercent: 0,    active: true, notes: 'Stripe Amendment May 2026' },
  { id: 'f2',  provider: 'Afterpay', country: 'United States',       percentFee: 3.68, fixedFee: 0.30, currency: 'USD', intlFeeApplicable: false, intlFeePercent: 0,    active: true, notes: 'Stripe Amendment May 2026' },
  { id: 'f3',  provider: 'Clearpay', country: 'United Kingdom',      percentFee: 3.73, fixedFee: 0.30, currency: 'GBP', intlFeeApplicable: false, intlFeePercent: 0,    active: true, notes: 'Stripe Amendment May 2026' },
  { id: 'f4',  provider: 'Afterpay', country: 'Australia',           percentFee: 3.63, fixedFee: 0.30, currency: 'AUD', intlFeeApplicable: false, intlFeePercent: 0,    active: true, notes: 'Stripe Amendment May 2026' },
  { id: 'f5',  provider: 'Afterpay', country: 'Canada',              percentFee: 3.88, fixedFee: 0.30, currency: 'CAD', intlFeeApplicable: false, intlFeePercent: 0,    active: true, notes: 'Stripe Amendment May 2026' },
  { id: 'f6',  provider: 'Afterpay', country: 'New Zealand',         percentFee: 3.63, fixedFee: 0.30, currency: 'NZD', intlFeeApplicable: false, intlFeePercent: 0,    active: true, notes: 'Stripe Amendment May 2026' },
  { id: 'f7',  provider: 'Klarna',   country: 'United States',       percentFee: 3.65, fixedFee: 0.30, currency: 'USD', intlFeeApplicable: true,  intlFeePercent: 1.50, active: true, notes: 'Stripe Amendment May 2026' },
  { id: 'f8',  provider: 'Klarna',   country: 'United Kingdom',      percentFee: 2.75, fixedFee: 0.30, currency: 'GBP', intlFeeApplicable: true,  intlFeePercent: 1.50, active: true, notes: 'Stripe Amendment May 2026' },
  { id: 'f9',  provider: 'Klarna',   country: 'Australia',           percentFee: 3.52, fixedFee: 0.55, currency: 'AUD', intlFeeApplicable: true,  intlFeePercent: 1.50, active: true, notes: 'Stripe Amendment May 2026' },
  { id: 'f10', provider: 'Klarna',   country: 'Canada',              percentFee: 3.65, fixedFee: 0.40, currency: 'CAD', intlFeeApplicable: true,  intlFeePercent: 1.50, active: true, notes: 'Stripe Amendment May 2026' },
  { id: 'f11', provider: 'Klarna',   country: 'New Zealand',         percentFee: 3.52, fixedFee: 0.60, currency: 'NZD', intlFeeApplicable: true,  intlFeePercent: 1.50, active: true, notes: 'Stripe Amendment May 2026' },
  { id: 'f12', provider: 'Klarna',   country: 'EEA Central Europe',  percentFee: 2.15, fixedFee: 0.35, currency: 'EUR', intlFeeApplicable: true,  intlFeePercent: 1.50, active: true, notes: 'Stripe Amendment May 2026' },
  { id: 'f13', provider: 'Klarna',   country: 'EEA Southern Europe', percentFee: 3.15, fixedFee: 0.35, currency: 'EUR', intlFeeApplicable: true,  intlFeePercent: 1.50, active: true, notes: 'Stripe Amendment May 2026' },
  { id: 'f14', provider: 'Klarna',   country: 'EEA Eastern Europe',  percentFee: 2.95, fixedFee: 0.40, currency: 'EUR', intlFeeApplicable: true,  intlFeePercent: 1.50, active: true, notes: 'Stripe Amendment May 2026' },
  { id: 'f15', provider: 'Klarna',   country: 'Switzerland',         percentFee: 2.05, fixedFee: 0.30, currency: 'CHF', intlFeeApplicable: true,  intlFeePercent: 1.50, active: true, notes: 'Stripe Amendment May 2026' },
  // Portfolio region aliases — mapped to nearest EEA rates for demo modeling
  { id: 'f16', provider: 'Klarna',   country: 'Central Europe',      percentFee: 2.15, fixedFee: 0.35, currency: 'EUR', intlFeeApplicable: true,  intlFeePercent: 1.50, active: true, notes: 'Mapped to EEA Central Europe — Stripe Amendment May 2026' },
  { id: 'f17', provider: 'Klarna',   country: 'Northern Europe',     percentFee: 2.15, fixedFee: 0.35, currency: 'EUR', intlFeeApplicable: true,  intlFeePercent: 1.50, active: true, notes: 'Mapped to EEA Central Europe rate — Stripe Amendment May 2026' },
  { id: 'f18', provider: 'Klarna',   country: 'Southern Europe',     percentFee: 3.15, fixedFee: 0.35, currency: 'EUR', intlFeeApplicable: true,  intlFeePercent: 1.50, active: true, notes: 'Mapped to EEA Southern Europe — Stripe Amendment May 2026' },
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

export const STARTER_METADATA: ConfigMetadata = {
  configName: 'Stripe BNPL Amendment',
  version: '1.0',
  owner: '',
  source: 'Executed Stripe Amendment May 2026',
  lastUpdated: new Date().toISOString().slice(0, 10),
  notes: 'Initial BNPL commercial impact model',
};

export const STARTER_CONFIG: AppConfig = {
  feeTable: STARTER_FEE_TABLE,
  scenarios: STARTER_SCENARIOS,
  defaults: STARTER_DEFAULTS,
  metadata: STARTER_METADATA,
};

const STORAGE_KEY = 'bnpl_calc_config_v1';
const INPUTS_KEY = 'bnpl_calc_inputs_v1';

export function loadConfig(): AppConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppConfig;
      if (!parsed.metadata) parsed.metadata = structuredClone(STARTER_METADATA);
      // Backfill any fee rows that exist in STARTER_FEE_TABLE but not in saved config
      // (covers users who saved before f16–f18 Klarna European aliases were added)
      const existingIds = new Set(parsed.feeTable.map(f => f.id));
      const missing = STARTER_FEE_TABLE.filter(f => !existingIds.has(f.id));
      if (missing.length > 0) parsed.feeTable = [...parsed.feeTable, ...missing];
      return parsed;
    }
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

// ─── Portfolio defaults ───────────────────────────────────────────────────────

const PORTFOLIO_MARKETS_KEY = 'bnpl_portfolio_markets_v1';
const PORTFOLIO_EVENTS_KEY  = 'bnpl_portfolio_events_v1';

export const STARTER_MARKET_ROWS: MarketRow[] = [
  { id: 'm1', brand: 'IRONMAN',       region: 'United States',   provider: 'Affirm',   registrations: 10000, avgEntryFee: 900,  bnplAdoptionPercent: 12, conversionUpliftPercent: 3, contributionMarginPercent: 60, standardCardFeePercent: 2.70, standardCardFixedFee: 0.30, feeAbsorption: 'IRONMAN absorbs BNPL cost', athleteSurchargePercent: 1.5, applyIntlFee: true,  confidence: 'High'   },
  { id: 'm2', brand: 'IRONMAN',       region: 'United Kingdom',  provider: 'Clearpay', registrations: 5000,  avgEntryFee: 700,  bnplAdoptionPercent: 10, conversionUpliftPercent: 3, contributionMarginPercent: 60, standardCardFeePercent: 2.70, standardCardFixedFee: 0.30, feeAbsorption: 'IRONMAN absorbs BNPL cost', athleteSurchargePercent: 1.5, applyIntlFee: true,  confidence: 'Medium' },
  { id: 'm3', brand: 'IRONMAN',       region: 'Australia',       provider: 'Afterpay', registrations: 4000,  avgEntryFee: 800,  bnplAdoptionPercent: 15, conversionUpliftPercent: 4, contributionMarginPercent: 60, standardCardFeePercent: 2.70, standardCardFixedFee: 0.30, feeAbsorption: 'IRONMAN absorbs BNPL cost', athleteSurchargePercent: 1.5, applyIntlFee: true,  confidence: 'Medium' },
  { id: 'm4', brand: 'IRONMAN',       region: 'Canada',          provider: 'Afterpay', registrations: 3000,  avgEntryFee: 750,  bnplAdoptionPercent: 10, conversionUpliftPercent: 2, contributionMarginPercent: 60, standardCardFeePercent: 2.70, standardCardFixedFee: 0.30, feeAbsorption: 'IRONMAN absorbs BNPL cost', athleteSurchargePercent: 1.5, applyIntlFee: true,  confidence: 'Medium' },
  { id: 'm5', brand: 'UTMB',          region: 'Central Europe',  provider: 'Klarna',   registrations: 8000,  avgEntryFee: 300,  bnplAdoptionPercent: 8,  conversionUpliftPercent: 2, contributionMarginPercent: 55, standardCardFeePercent: 2.70, standardCardFixedFee: 0.30, feeAbsorption: 'IRONMAN absorbs BNPL cost', athleteSurchargePercent: 1.5, applyIntlFee: true,  confidence: 'Low'    },
  { id: 'm6', brand: 'UTMB',          region: 'Northern Europe', provider: 'Klarna',   registrations: 6000,  avgEntryFee: 350,  bnplAdoptionPercent: 10, conversionUpliftPercent: 3, contributionMarginPercent: 55, standardCardFeePercent: 2.70, standardCardFixedFee: 0.30, feeAbsorption: 'IRONMAN absorbs BNPL cost', athleteSurchargePercent: 1.5, applyIntlFee: true,  confidence: 'Low'    },
  { id: 'm7', brand: "Rock 'n' Roll", region: 'United States',   provider: 'Affirm',   registrations: 15000, avgEntryFee: 150,  bnplAdoptionPercent: 8,  conversionUpliftPercent: 2, contributionMarginPercent: 50, standardCardFeePercent: 2.70, standardCardFixedFee: 0.30, feeAbsorption: 'IRONMAN absorbs BNPL cost', athleteSurchargePercent: 1.5, applyIntlFee: true,  confidence: 'High'   },
  { id: 'm8', brand: "Rock 'n' Roll", region: 'Canada',          provider: 'Afterpay', registrations: 5000,  avgEntryFee: 130,  bnplAdoptionPercent: 7,  conversionUpliftPercent: 2, contributionMarginPercent: 50, standardCardFeePercent: 2.70, standardCardFixedFee: 0.30, feeAbsorption: 'IRONMAN absorbs BNPL cost', athleteSurchargePercent: 1.5, applyIntlFee: true,  confidence: 'Medium' },
];

export const STARTER_EVENT_ROWS: EventPortfolioRow[] = [
  { id: 'e1', eventType: 'IRONMAN Full Distance', region: 'United States',  registrations: 2500,  avgTicketPrice: 900,  bnplAdoptionPercent: 15, conversionUpliftPercent: 4, contributionMarginPercent: 60, standardCardFeePercent: 2.70, standardCardFixedFee: 0.30, feeAbsorption: 'IRONMAN absorbs BNPL cost', athleteSurchargePercent: 1.5, applyIntlFee: true,  confidence: 'High'   },
  { id: 'e2', eventType: 'IRONMAN Full Distance', region: 'Australia',      registrations: 1500,  avgTicketPrice: 850,  bnplAdoptionPercent: 15, conversionUpliftPercent: 4, contributionMarginPercent: 60, standardCardFeePercent: 2.70, standardCardFixedFee: 0.30, feeAbsorption: 'IRONMAN absorbs BNPL cost', athleteSurchargePercent: 1.5, applyIntlFee: true,  confidence: 'Medium' },
  { id: 'e3', eventType: 'IRONMAN 70.3',          region: 'United States',  registrations: 4000,  avgTicketPrice: 450,  bnplAdoptionPercent: 12, conversionUpliftPercent: 3, contributionMarginPercent: 60, standardCardFeePercent: 2.70, standardCardFixedFee: 0.30, feeAbsorption: 'IRONMAN absorbs BNPL cost', athleteSurchargePercent: 1.5, applyIntlFee: true,  confidence: 'High'   },
  { id: 'e4', eventType: 'IRONMAN 70.3',          region: 'United Kingdom', registrations: 2500,  avgTicketPrice: 400,  bnplAdoptionPercent: 10, conversionUpliftPercent: 3, contributionMarginPercent: 60, standardCardFeePercent: 2.70, standardCardFixedFee: 0.30, feeAbsorption: 'IRONMAN absorbs BNPL cost', athleteSurchargePercent: 1.5, applyIntlFee: true,  confidence: 'Medium' },
  { id: 'e5', eventType: 'UTMB',                  region: 'Central Europe', registrations: 8000,  avgTicketPrice: 300,  bnplAdoptionPercent: 8,  conversionUpliftPercent: 2, contributionMarginPercent: 55, standardCardFeePercent: 2.70, standardCardFixedFee: 0.30, feeAbsorption: 'IRONMAN absorbs BNPL cost', athleteSurchargePercent: 1.5, applyIntlFee: true,  confidence: 'Low'    },
  { id: 'e6', eventType: "Rock 'n' Roll",         region: 'United States',  registrations: 12000, avgTicketPrice: 150,  bnplAdoptionPercent: 7,  conversionUpliftPercent: 2, contributionMarginPercent: 50, standardCardFeePercent: 2.70, standardCardFixedFee: 0.30, feeAbsorption: 'IRONMAN absorbs BNPL cost', athleteSurchargePercent: 1.5, applyIntlFee: true,  confidence: 'High'   },
  { id: 'e7', eventType: "Rock 'n' Roll",         region: 'Canada',         registrations: 5000,  avgTicketPrice: 130,  bnplAdoptionPercent: 6,  conversionUpliftPercent: 2, contributionMarginPercent: 50, standardCardFeePercent: 2.70, standardCardFixedFee: 0.30, feeAbsorption: 'IRONMAN absorbs BNPL cost', athleteSurchargePercent: 1.5, applyIntlFee: true,  confidence: 'Medium' },
];

export function loadMarketRows(): MarketRow[] {
  try {
    const raw = localStorage.getItem(PORTFOLIO_MARKETS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as MarketRow[];
      // Backfill confidence for rows saved before this field was added
      return parsed.map(r => r.confidence ? r : { ...r, confidence: (DEFAULT_CONFIDENCE[r.region as RegionName] ?? 'Low') as ConfidenceLevel });
    }
  } catch { /* ignore */ }
  return structuredClone(STARTER_MARKET_ROWS);
}

export function saveMarketRows(rows: MarketRow[]) {
  try { localStorage.setItem(PORTFOLIO_MARKETS_KEY, JSON.stringify(rows)); } catch { /* ignore */ }
}

export function loadEventRows(): EventPortfolioRow[] {
  try {
    const raw = localStorage.getItem(PORTFOLIO_EVENTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as EventPortfolioRow[];
      // Backfill confidence for rows saved before this field was added
      return parsed.map(r => r.confidence ? r : { ...r, confidence: (DEFAULT_CONFIDENCE[r.region as RegionName] ?? 'Low') as ConfidenceLevel });
    }
  } catch { /* ignore */ }
  return structuredClone(STARTER_EVENT_ROWS);
}

export function saveEventRows(rows: EventPortfolioRow[]) {
  try { localStorage.setItem(PORTFOLIO_EVENTS_KEY, JSON.stringify(rows)); } catch { /* ignore */ }
}
