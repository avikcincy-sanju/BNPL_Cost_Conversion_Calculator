export type FeeAbsorption = 'IRONMAN absorbs BNPL cost' | 'Athlete surcharge' | 'Shared absorption';

// ─── Portfolio Dashboard Types ────────────────────────────────────────────────

export type BrandName = 'IRONMAN' | 'UTMB' | "Rock 'n' Roll" | 'All Brands';

export const BRANDS: BrandName[] = ['IRONMAN', 'UTMB', "Rock 'n' Roll", 'All Brands'];

export type RegionName =
  | 'United States'
  | 'Canada'
  | 'United Kingdom'
  | 'Australia'
  | 'New Zealand'
  | 'Northern Europe'
  | 'Southern Europe'
  | 'Central Europe';

export const ALL_REGIONS: RegionName[] = [
  'United States', 'Canada', 'United Kingdom', 'Australia',
  'New Zealand', 'Northern Europe', 'Southern Europe', 'Central Europe',
];

// Maps portfolio RegionName → fee-table country string(s) for lookup fallback
export const REGION_FEE_ALIASES: Record<string, string[]> = {
  'Central Europe':  ['EEA Central Europe', 'central europe'],
  'Northern Europe': ['EEA Northern Europe', 'northern europe'],
  'Southern Europe': ['EEA Southern Europe', 'southern europe'],
};

export type ConfidenceLevel = 'High' | 'Medium' | 'Low';

export const CONFIDENCE_LEVELS: ConfidenceLevel[] = ['High', 'Medium', 'Low'];

export const DEFAULT_CONFIDENCE: Record<RegionName, ConfidenceLevel> = {
  'United States':   'High',
  'Australia':       'Medium',
  'United Kingdom':  'Medium',
  'Canada':          'Medium',
  'Northern Europe': 'Low',
  'Central Europe':  'Low',
  'Southern Europe': 'Low',
  'New Zealand':     'Low',
};

export const EVENT_PORTFOLIO_TYPES = [
  'IRONMAN Full Distance',
  'IRONMAN 70.3',
  'UTMB',
  "Rock 'n' Roll",
] as const;
export type EventPortfolioType = (typeof EVENT_PORTFOLIO_TYPES)[number];

export interface MarketRow {
  id: string;
  brand: BrandName;
  region: RegionName;
  provider: string;
  registrations: number;
  avgEntryFee: number;
  bnplAdoptionPercent: number;
  conversionUpliftPercent: number;
  contributionMarginPercent: number;
  standardCardFeePercent: number;
  standardCardFixedFee: number;
  feeAbsorption: FeeAbsorption;
  athleteSurchargePercent: number;
  applyIntlFee: boolean;
  confidence: ConfidenceLevel;
}

export interface EventPortfolioRow {
  id: string;
  eventType: EventPortfolioType;
  region: RegionName;
  registrations: number;
  avgTicketPrice: number;
  bnplAdoptionPercent: number;
  conversionUpliftPercent: number;
  contributionMarginPercent: number;
  standardCardFeePercent: number;
  standardCardFixedFee: number;
  feeAbsorption: FeeAbsorption;
  athleteSurchargePercent: number;
  applyIntlFee: boolean;
  confidence: ConfidenceLevel;
}

export interface ConfigMetadata {
  configName: string;
  version: string;
  owner: string;
  source: string;
  lastUpdated: string;
  notes: string;
}

export interface FeeRow {
  id: string;
  provider: string;
  country: string;
  percentFee: number;
  fixedFee: number;
  currency: string;
  intlFeeApplicable: boolean;
  intlFeePercent: number;
  active: boolean;
  notes: string;
}

export interface ScenarioPreset {
  id: string;
  name: string;
  bnplAdoptionPercent: number;
  conversionUpliftPercent: number;
  refundRatePercent: number;
  active: boolean;
}

export interface DefaultModelInputs {
  country: string;
  provider: string;
  eventType: string;
  registrationPrice: number;
  expectedRegistrations: number;
  standardCardFeePercent: number;
  standardCardFixedFee: number;
  bnplAdoptionPercent: number;
  conversionUpliftPercent: number;
  contributionMarginPercent: number;
  refundRatePercent: number;
  avgRefundAmountPercent: number;
  feeAbsorption: FeeAbsorption;
  athleteSurchargePercent: number;
}

export interface AppConfig {
  feeTable: FeeRow[];
  scenarios: ScenarioPreset[];
  defaults: DefaultModelInputs;
  metadata: ConfigMetadata;
}

export interface CalcInputs {
  country: string;
  provider: string;
  eventType: string;
  registrationPrice: number;
  expectedRegistrations: number;
  standardCardFeePercent: number;
  standardCardFixedFee: number;
  bnplAdoptionPercent: number;
  conversionUpliftPercent: number;
  refundRatePercent: number;
  avgRefundAmountPercent: number;
  contributionMarginPercent: number;
  feeAbsorption: FeeAbsorption;
  athleteSurchargePercent: number;
  applyIntlFee: boolean;
}
