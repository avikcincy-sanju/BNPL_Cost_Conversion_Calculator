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
