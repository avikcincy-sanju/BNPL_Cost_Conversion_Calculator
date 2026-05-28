export type FeeAbsorption = 'IRONMAN absorbs BNPL cost' | 'Athlete surcharge' | 'Shared absorption';

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
