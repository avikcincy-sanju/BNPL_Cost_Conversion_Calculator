import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie
} from 'recharts';
import {
  Info, Download, ChevronDown, TrendingUp, TrendingDown, Minus, Ban, Lightbulb,
  ShieldCheck, AlertTriangle, ShieldAlert,
} from 'lucide-react';

import type { AppConfig, CalcInputs, FeeRow } from './types';
import {
  loadConfig, saveConfig, loadInputsFromStorage, saveInputsToStorage, clearAllStorage,
  EVENT_TYPES, FEE_ABSORPTIONS,
} from './config';
import AdminPanel from './AdminPanel';
import ComparisonViews from './ComparisonViews';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number, type: 'currency' | 'percent' | 'number' = 'currency') => {
  if (type === 'currency') return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
  if (type === 'percent') return n.toFixed(2) + '%';
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
};

const fmtPrecise = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

// ─── Tooltip ─────────────────────────────────────────────────────────────────

function Tip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-flex ml-1" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <Info size={13} className="text-gray-400 cursor-help mt-0.5" />
      {show && (
        <span className="absolute z-50 left-5 top-0 w-64 bg-gray-900 text-white text-xs rounded-lg p-2.5 shadow-xl leading-relaxed">
          {text}
        </span>
      )}
    </span>
  );
}

// ─── Input wrappers ───────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{children}</label>;
}

function InputGroup({ label, tip, children }: { label: string; tip?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}{tip && <Tip text={tip} />}</Label>
      {children}
    </div>
  );
}

const inputCls = "w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-gray-900";
const selectCls = inputCls + " cursor-pointer appearance-none pr-8";
const inputDisabledCls = "w-full px-3 py-2 text-sm bg-gray-100 border border-gray-200 rounded-lg text-gray-400 cursor-not-allowed";

// ─── Metric Card ─────────────────────────────────────────────────────────────

type CardColor = 'green' | 'red' | 'blue' | 'orange' | 'default';

interface FormulaDetail {
  formula: string;
  inputs: string;
  result: string;
}

function MetricCard({ label, value, sub, color = 'default', tip, formula }: {
  label: string; value: string; sub?: string; color?: CardColor; tip?: string; formula?: FormulaDetail;
}) {
  const [showFormula, setShowFormula] = useState(false);
  const colors: Record<CardColor, string> = { green: 'bg-emerald-50 border-emerald-200', red: 'bg-red-50 border-red-200', blue: 'bg-blue-50 border-blue-200', orange: 'bg-amber-50 border-amber-200', default: 'bg-white border-gray-200' };
  const valueColors: Record<CardColor, string> = { green: 'text-emerald-700', red: 'text-red-700', blue: 'text-blue-700', orange: 'text-amber-700', default: 'text-gray-900' };
  return (
    <div className={`rounded-xl border p-4 ${colors[color]} relative`}>
      <div className="flex items-start justify-between gap-1">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide leading-tight">{label}</p>
        <div className="flex items-center gap-1 flex-shrink-0">
          {formula && (
            <span
              className="relative inline-flex ml-0.5 cursor-pointer"
              onMouseEnter={() => setShowFormula(true)}
              onMouseLeave={() => setShowFormula(false)}
            >
              <Info size={13} className="text-gray-400 hover:text-blue-500 transition-colors mt-0.5" />
              {showFormula && (
                <span className="absolute z-50 right-0 top-5 w-72 bg-gray-900 text-white text-xs rounded-lg p-3 shadow-xl leading-relaxed space-y-1.5">
                  <div>
                    <span className="text-gray-400 uppercase tracking-wide text-[10px] font-semibold">Formula</span>
                    <div className="font-mono text-blue-300 mt-0.5">{formula.formula}</div>
                  </div>
                  <div>
                    <span className="text-gray-400 uppercase tracking-wide text-[10px] font-semibold">Inputs Used</span>
                    <div className="text-gray-200 mt-0.5">{formula.inputs}</div>
                  </div>
                  <div>
                    <span className="text-gray-400 uppercase tracking-wide text-[10px] font-semibold">Result</span>
                    <div className="text-emerald-300 font-semibold mt-0.5">{formula.result}</div>
                  </div>
                </span>
              )}
            </span>
          )}
          {tip && !formula && <Tip text={tip} />}
        </div>
      </div>
      <p className={`text-xl font-bold mt-1.5 ${valueColors[color]}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Calculation Engine ───────────────────────────────────────────────────────
// All fee values come from the selected FeeRow — nothing is hardcoded here.

function calcResults(inputs: CalcInputs, feeRow: FeeRow | null) {
  const {
    registrationPrice, expectedRegistrations,
    standardCardFeePercent, standardCardFixedFee,
    bnplAdoptionPercent, conversionUpliftPercent,
    refundRatePercent, avgRefundAmountPercent,
    contributionMarginPercent, feeAbsorption, athleteSurchargePercent,
    applyIntlFee,
  } = inputs;

  const grossRevenue = registrationPrice * expectedRegistrations;
  const bnplTransactions = expectedRegistrations * (bnplAdoptionPercent / 100);
  const bnplVolume = bnplTransactions * registrationPrice;

  const stdCardCostOnBnpl =
    bnplVolume * (standardCardFeePercent / 100) + bnplTransactions * standardCardFixedFee;

  let bnplBaseCost = 0;
  let intlFeeAmount = 0;
  let bnplProcessingCost = 0;

  if (feeRow) {
    bnplBaseCost = bnplVolume * (feeRow.percentFee / 100) + bnplTransactions * feeRow.fixedFee;
    intlFeeAmount = (feeRow.intlFeeApplicable && applyIntlFee)
      ? bnplVolume * (feeRow.intlFeePercent / 100)
      : 0;
    bnplProcessingCost = bnplBaseCost + intlFeeAmount;
  }

  let ironmanCost = bnplProcessingCost;
  let athleteCostPerTxn = 0;
  let athleteTotalCost = 0;

  if (feeAbsorption === 'Athlete surcharge') {
    const surchargeRevenue = bnplVolume * (athleteSurchargePercent / 100);
    ironmanCost = Math.max(0, bnplProcessingCost - surchargeRevenue);
    athleteCostPerTxn = registrationPrice * (athleteSurchargePercent / 100);
    athleteTotalCost = surchargeRevenue;
  } else if (feeAbsorption === 'Shared absorption') {
    ironmanCost = bnplProcessingCost * 0.5;
    athleteCostPerTxn = bnplTransactions > 0 ? (bnplProcessingCost * 0.5) / bnplTransactions : 0;
    athleteTotalCost = bnplProcessingCost * 0.5;
  }

  const incrementalProcessingCost = ironmanCost - stdCardCostOnBnpl;
  const incrementalRegistrations = expectedRegistrations * (conversionUpliftPercent / 100);
  const incrementalRevenue = incrementalRegistrations * registrationPrice;
  const incrementalContribution = incrementalRevenue * (contributionMarginPercent / 100);
  const refundExposure = bnplVolume * (refundRatePercent / 100) * (avgRefundAmountPercent / 100);
  const netCommercialImpact = incrementalContribution - incrementalProcessingCost;
  const breakEvenConversionUplift = grossRevenue > 0
    ? (incrementalProcessingCost / (grossRevenue * (contributionMarginPercent / 100))) * 100
    : 0;

  return {
    grossRevenue, bnplTransactions, bnplVolume,
    stdCardCostOnBnpl, bnplBaseCost, intlFeeAmount,
    bnplProcessingCost, ironmanCost,
    incrementalProcessingCost, incrementalRegistrations,
    incrementalRevenue, incrementalContribution,
    athleteCostPerTxn, athleteTotalCost,
    refundExposure, netCommercialImpact, breakEvenConversionUplift,
  };
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [config, setConfig] = useState<AppConfig>(() => loadConfig());

  // Build inputs from config defaults, then restore from storage
  const buildInputsFromDefaults = (cfg: AppConfig): CalcInputs => {
    const d = cfg.defaults;
    return {
      country: d.country,
      provider: d.provider,
      eventType: d.eventType,
      registrationPrice: d.registrationPrice,
      expectedRegistrations: d.expectedRegistrations,
      standardCardFeePercent: d.standardCardFeePercent,
      standardCardFixedFee: d.standardCardFixedFee,
      bnplAdoptionPercent: d.bnplAdoptionPercent,
      conversionUpliftPercent: d.conversionUpliftPercent,
      refundRatePercent: d.refundRatePercent,
      avgRefundAmountPercent: d.avgRefundAmountPercent,
      contributionMarginPercent: d.contributionMarginPercent,
      feeAbsorption: d.feeAbsorption,
      athleteSurchargePercent: d.athleteSurchargePercent,
      applyIntlFee: true,
    };
  };

  const [inputs, setInputs] = useState<CalcInputs>(() =>
    loadInputsFromStorage(buildInputsFromDefaults(loadConfig()))
  );

  // Persist config & inputs on every change
  useEffect(() => { saveConfig(config); }, [config]);
  useEffect(() => { saveInputsToStorage(inputs); }, [inputs]);

  const handleConfigChange = (newConfig: AppConfig) => {
    setConfig(newConfig);
    saveConfig(newConfig);
  };

  const handleClearStorage = () => {
    clearAllStorage();
    const fresh = loadConfig(); // returns starter since storage is cleared
    setConfig(fresh);
    setInputs(buildInputsFromDefaults(fresh));
  };

  const set = useCallback(<K extends keyof CalcInputs>(key: K, value: CalcInputs[K]) => {
    setInputs(prev => ({ ...prev, [key]: value }));
  }, []);

  // Derived lists from active fee table
  const activeRows = useMemo(() => config.feeTable.filter(r => r.active), [config.feeTable]);
  const availableProviders = useMemo(() => [...new Set(activeRows.map(r => r.provider))].sort(), [activeRows]);
  const availableCountries = useMemo(() => [...new Set(activeRows.map(r => r.country))].sort(), [activeRows]);
  const activeScenarios = useMemo(() => config.scenarios.filter(s => s.active), [config.scenarios]);

  // Selected fee row — derived from active table, no hardcoding
  const feeRow: FeeRow | null = useMemo(() =>
    activeRows.find(r =>
      r.provider.toLowerCase() === inputs.provider.toLowerCase() &&
      r.country.toLowerCase() === inputs.country.toLowerCase()
    ) ?? null,
    [activeRows, inputs.provider, inputs.country]
  );

  const rateUnavailable = feeRow === null;

  const results = useMemo(() => calcResults(inputs, feeRow), [inputs, feeRow]);

  const isSurcharge = inputs.feeAbsorption === 'Athlete surcharge';
  const isShared = inputs.feeAbsorption === 'Shared absorption';
  const netColor = results.netCommercialImpact > 500 ? 'green' : results.netCommercialImpact < -500 ? 'red' : 'orange';

  // Sensitivity
  const adoptionRows = [5, 10, 15, 20];
  const upliftCols = [1, 2, 3, 5];
  const sensitivityData = useMemo(() =>
    adoptionRows.map(adoption =>
      upliftCols.map(uplift => {
        const r = calcResults({ ...inputs, bnplAdoptionPercent: adoption, conversionUpliftPercent: uplift }, feeRow);
        return r.netCommercialImpact;
      })
    ), [inputs, feeRow]);

  // Charts
  const costCompareData = [
    { name: 'Std Card', value: results.stdCardCostOnBnpl, fill: '#3b82f6' },
    { name: 'BNPL Gross', value: results.bnplProcessingCost, fill: '#f59e0b' },
    { name: 'IRONMAN Net', value: results.ironmanCost, fill: '#ef4444' },
  ];
  const impactData = [
    { name: 'Incr. Contribution', value: results.incrementalContribution, fill: '#10b981' },
    { name: 'Incr. Cost', value: Math.max(0, results.incrementalProcessingCost), fill: '#ef4444' },
  ];
  const donutData = [
    { name: 'BNPL', value: inputs.bnplAdoptionPercent },
    { name: 'Other', value: Math.max(0, 100 - inputs.bnplAdoptionPercent) },
  ];

  // Recommendation
  const { netCommercialImpact, breakEvenConversionUplift } = results;
  let recText = '';
  let recColor = '';
  let RecIcon = Minus;

  if (rateUnavailable) {
    recText = 'No active fee configuration exists for this provider/region. Please add or activate a rate in Admin Configuration.';
    recColor = 'bg-red-50 border-red-300 text-red-800';
    RecIcon = Ban;
  } else if (netCommercialImpact > 500 && breakEvenConversionUplift < inputs.conversionUpliftPercent) {
    recText = 'Under the current user-configured assumptions, BNPL appears directionally favorable from a commercial perspective. The modeled conversion uplift more than offsets the estimated incremental processing cost.';
    recColor = 'bg-emerald-50 border-emerald-300 text-emerald-800';
    RecIcon = TrendingUp;
  } else if (Math.abs(netCommercialImpact) <= 500) {
    recText = 'Under the current user-configured assumptions, BNPL appears directionally neutral from a commercial perspective. This may be suitable for a controlled pilot where adoption and conversion data can be independently measured.';
    recColor = 'bg-amber-50 border-amber-300 text-amber-800';
    RecIcon = Minus;
  } else {
    recText = 'Under the current user-configured assumptions, BNPL does not appear directionally favorable unless modeled conversion uplift or athlete adoption exceeds current estimates.';
    recColor = 'bg-red-50 border-red-300 text-red-800';
    RecIcon = TrendingDown;
  }

  const eventRec: Record<string, string> = {
    'IRONMAN Full Distance': 'BNPL economics generally improve as registration value increases because financing convenience offsets incremental processing costs more effectively.',
    'IRONMAN 70.3': 'Moderate to strong directional fit — price point still benefits from installment financing availability.',
    "Rock 'n' Roll Marathon": 'Selective fit — evaluate based on specific event price point, target demographic, and competitive context.',
    'Other': 'Evaluate on a case-by-case basis using event price, audience profile, and competitive landscape.',
  };

  // ─── Model Confidence ────────────────────────────────────────────────────────
  const missingCount = [
    inputs.bnplAdoptionPercent === 0,
    inputs.conversionUpliftPercent === 0,
    inputs.contributionMarginPercent === 0,
    rateUnavailable,
  ].filter(Boolean).length;

  const confidence: 'High' | 'Medium' | 'Low' =
    missingCount === 0 ? 'High' : missingCount === 1 ? 'Medium' : 'Low';

  const confidenceConfig = {
    High:   { color: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: ShieldCheck,   dot: 'bg-emerald-500' },
    Medium: { color: 'text-amber-700 bg-amber-50 border-amber-200',       icon: AlertTriangle, dot: 'bg-amber-500'   },
    Low:    { color: 'text-red-700 bg-red-50 border-red-200',             icon: ShieldAlert,   dot: 'bg-red-500'     },
  };

  // ─── Opportunity Score ────────────────────────────────────────────────────────
  // 0-100 composite based on net impact, break-even, adoption, and margin
  const opportunityScore = useMemo(() => {
    if (rateUnavailable) return 0;
    // NCI component: cap at ±$200k, map to 0-40 pts
    const nciScore = Math.min(40, Math.max(0, (results.netCommercialImpact / 200000) * 40));
    // Break-even component: lower is better; 0-30 pts
    const beuScore = breakEvenConversionUplift <= 0 ? 30
      : breakEvenConversionUplift > inputs.conversionUpliftPercent ? 0
      : Math.min(30, (1 - breakEvenConversionUplift / inputs.conversionUpliftPercent) * 30);
    // Adoption component: 0-15 pts
    const adoptionScore = Math.min(15, (inputs.bnplAdoptionPercent / 25) * 15);
    // Margin component: 0-15 pts
    const marginScore = Math.min(15, (inputs.contributionMarginPercent / 80) * 15);
    return Math.round(nciScore + beuScore + adoptionScore + marginScore);
  }, [results, inputs, rateUnavailable, breakEvenConversionUplift]);

  const scoreLabel =
    opportunityScore >= 80 ? 'Strong Opportunity' :
    opportunityScore >= 60 ? 'Moderate Opportunity' :
    opportunityScore >= 40 ? 'Neutral' : 'Validate Further';

  const scoreColor =
    opportunityScore >= 80 ? 'text-emerald-700 bg-emerald-50 border-emerald-200' :
    opportunityScore >= 60 ? 'text-blue-700 bg-blue-50 border-blue-200' :
    opportunityScore >= 40 ? 'text-amber-700 bg-amber-50 border-amber-200' :
                             'text-red-700 bg-red-50 border-red-200';

  const absorptionLabel: Record<string, string> = {
    'IRONMAN absorbs BNPL cost': 'IRONMAN bears 100% of BNPL fee',
    'Athlete surcharge': `Athlete pays ${inputs.athleteSurchargePercent}% surcharge on BNPL transactions`,
    'Shared absorption': 'IRONMAN and athlete each bear 50% of BNPL fee',
  };

  const usedScenario = useMemo(() =>
    activeScenarios.find(s =>
      s.bnplAdoptionPercent === inputs.bnplAdoptionPercent &&
      s.conversionUpliftPercent === inputs.conversionUpliftPercent &&
      s.refundRatePercent === inputs.refundRatePercent
    ), [activeScenarios, inputs.bnplAdoptionPercent, inputs.conversionUpliftPercent, inputs.refundRatePercent]);

  // Export CSV
  const exportCsv = () => {
    const rows: (string | number)[][] = [
      ['BNPL Cost & Conversion Calculator — Export'],
      ['Generated', new Date().toISOString()],
      [''],
      ['CONFIGURATION METADATA'],
      ['Configuration Name', config.metadata.configName],
      ['Version', config.metadata.version],
      ...(config.metadata.owner ? [['Owner', config.metadata.owner]] : []),
      ['Source', config.metadata.source],
      ['Last Updated', config.metadata.lastUpdated],
      ['Notes', config.metadata.notes],
      [''],
      ['INPUTS'],
      ['Country / Region', inputs.country],
      ['Provider', inputs.provider],
      ['Event Type', inputs.eventType],
      ['Scenario Preset Used', usedScenario?.name ?? 'Custom'],
      ['Registration Price', inputs.registrationPrice],
      ['Expected Registrations', inputs.expectedRegistrations],
      ['BNPL Adoption %', inputs.bnplAdoptionPercent],
      ['Conversion Uplift %', inputs.conversionUpliftPercent],
      ['Contribution Margin %', inputs.contributionMarginPercent],
      ['Fee Absorption Strategy', inputs.feeAbsorption],
      ...(isSurcharge ? [['Athlete Surcharge %', inputs.athleteSurchargePercent]] : []),
      ['Refund Rate %', inputs.refundRatePercent],
      ['Avg Refund Amount %', inputs.avgRefundAmountPercent],
      [''],
      ['SELECTED FEE CONFIGURATION'],
      ['Provider', feeRow?.provider ?? 'N/A'],
      ['Region', feeRow?.country ?? 'N/A'],
      ['Percentage Fee %', feeRow?.percentFee ?? 'N/A'],
      ['Fixed Fee', feeRow?.fixedFee ?? 'N/A'],
      ['Currency', feeRow?.currency ?? 'N/A'],
      ['Intl Fee Applicable', feeRow?.intlFeeApplicable ? 'Yes' : 'No'],
      ['Intl Fee Applied', inputs.applyIntlFee && feeRow?.intlFeeApplicable ? 'Yes' : 'No'],
      ['Intl Fee %', feeRow?.intlFeePercent ?? 'N/A'],
      ['Source / Notes', feeRow?.notes ?? 'N/A'],
      [''],
      ['OUTPUTS'],
      ['Gross Revenue', results.grossRevenue],
      ['BNPL Volume', results.bnplVolume],
      ['Standard Card Cost on BNPL Volume', results.stdCardCostOnBnpl],
      ['BNPL Base Processing Cost', results.bnplBaseCost],
      ['International Payment Methods Fee', results.intlFeeAmount],
      ['BNPL Processing Cost (Gross)', results.bnplProcessingCost],
      ['Estimated BNPL Processing Cost to IRONMAN', results.ironmanCost],
      ['Incremental Processing Cost', results.incrementalProcessingCost],
      ['Incremental Revenue from Uplift', results.incrementalRevenue],
      [`Incremental Contribution (${inputs.contributionMarginPercent}% margin)`, results.incrementalContribution],
      ['Refund Exposure', results.refundExposure],
      ['Net Commercial Impact', results.netCommercialImpact],
      ['Break-even Conversion Uplift %', results.breakEvenConversionUplift],
      [''],
      ['MODEL CONFIDENCE & SCORE'],
      ['Model Confidence', confidence],
      ['Commercial Opportunity Score', `${opportunityScore} / 100 — ${scoreLabel}`],
      [''],
      ['MODEL SCOPE'],
      ['Included', 'Provider processing fees; BNPL adoption assumptions; Conversion uplift assumptions; Contribution margin assumptions; Refund exposure estimates; Scenario comparisons; Provider comparisons; Break-even analysis'],
      ['Not Included', 'Chargeback losses; Fraud losses; Treasury settlement timing impacts; FX spread impacts; Operational support costs; Tax implications'],
      [''],
      ['Note', 'Rates and assumptions are based on user-configured inputs and should be validated before production use.'],
      [''],
      ['Prepared using the BNPL Commercial Impact Model. All pricing, assumptions, and scenarios are user-configurable and should be independently validated prior to operational or financial decision-making.'],
    ];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bnpl-scenario-${inputs.provider.toLowerCase()}-${inputs.country.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Available markets for the selected provider (for the error message)
  const availableMarketsForProvider = useMemo(() =>
    activeRows.filter(r => r.provider.toLowerCase() === inputs.provider.toLowerCase()).map(r => r.country),
    [activeRows, inputs.provider]
  );

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-screen-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900 tracking-tight">BNPL Commercial Impact Model</h1>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-xs font-semibold text-gray-700">
                {config.metadata.configName} v{config.metadata.version}
              </span>
              <span className="text-gray-300">·</span>
              <span className="text-xs text-gray-500">Last Updated: {config.metadata.lastUpdated}</span>
              {config.metadata.owner && (
                <>
                  <span className="text-gray-300">·</span>
                  <span className="text-xs text-gray-500">{config.metadata.owner}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={exportCsv}
              className="flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-all"
            >
              <Download size={13} />
              Export CSV
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-screen-2xl mx-auto px-6 py-6 flex gap-6">

        {/* ── Left Panel ── */}
        <div className="w-80 flex-shrink-0 space-y-4">

          {/* Scenario Presets — dynamic from config */}
          {activeScenarios.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Scenario Presets</p>
              <div className="flex flex-wrap gap-2">
                {activeScenarios.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setInputs(prev => ({
                      ...prev,
                      bnplAdoptionPercent: s.bnplAdoptionPercent,
                      conversionUpliftPercent: s.conversionUpliftPercent,
                      refundRatePercent: s.refundRatePercent,
                    }))}
                    className="py-2 px-3 text-xs font-semibold rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 text-gray-600 transition-all"
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Event Configuration */}
          <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Event Configuration</p>

            <InputGroup label="Country / Region">
              <div className="relative">
                <select
                  className={selectCls}
                  value={inputs.country}
                  onChange={e => set('country', e.target.value)}
                >
                  {availableCountries.map(c => <option key={c}>{c}</option>)}
                  {/* Show current value even if not in active list */}
                  {!availableCountries.includes(inputs.country) && (
                    <option value={inputs.country}>{inputs.country}</option>
                  )}
                </select>
                <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </InputGroup>

            <InputGroup label="Provider">
              <div className="relative">
                <select
                  className={selectCls}
                  value={inputs.provider}
                  onChange={e => set('provider', e.target.value)}
                >
                  {availableProviders.map(p => <option key={p}>{p}</option>)}
                  {!availableProviders.includes(inputs.provider) && (
                    <option value={inputs.provider}>{inputs.provider}</option>
                  )}
                </select>
                <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </InputGroup>

            <InputGroup label="Event Type">
              <div className="relative">
                <select className={selectCls} value={inputs.eventType} onChange={e => set('eventType', e.target.value)}>
                  {EVENT_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
                <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </InputGroup>
          </div>

          {/* Financial Inputs */}
          <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Financial Inputs</p>

            <InputGroup label="Registration Price ($)" tip="Price per registration in USD">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input type="number" className={inputCls + ' pl-6'} value={inputs.registrationPrice}
                  onChange={e => set('registrationPrice', parseFloat(e.target.value) || 0)} min={0} step={1} />
              </div>
            </InputGroup>

            <InputGroup label="Expected Registrations" tip="Total registrations for this event">
              <input type="number" className={inputCls} value={inputs.expectedRegistrations}
                onChange={e => set('expectedRegistrations', parseInt(e.target.value) || 0)} min={0} step={100} />
            </InputGroup>

            <InputGroup label="Standard Card Fee %" tip="Your contracted card processing rate (e.g., Stripe)">
              <div className="relative">
                <input type="number" className={inputCls + ' pr-6'} value={inputs.standardCardFeePercent}
                  onChange={e => set('standardCardFeePercent', parseFloat(e.target.value) || 0)} min={0} step={0.01} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
              </div>
            </InputGroup>

            <InputGroup label="Standard Card Fixed Fee ($)" tip="Fixed per-transaction fee on card payments">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input type="number" className={inputCls + ' pl-6'} value={inputs.standardCardFixedFee}
                  onChange={e => set('standardCardFixedFee', parseFloat(e.target.value) || 0)} min={0} step={0.01} />
              </div>
            </InputGroup>

            <InputGroup label="Contribution Margin %" tip="% of revenue that flows to contribution after variable costs.">
              <div className="relative">
                <input type="number" className={inputCls + ' pr-6'} value={inputs.contributionMarginPercent}
                  onChange={e => set('contributionMarginPercent', parseFloat(e.target.value) || 0)} min={0} max={100} step={1} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
              </div>
            </InputGroup>
          </div>

          {/* Fee Absorption */}
          <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Fee Absorption Strategy</p>

            <InputGroup label="Absorption Model" tip="How incremental BNPL cost is split between IRONMAN and athletes.">
              <div className="relative">
                <select className={selectCls} value={inputs.feeAbsorption} onChange={e => set('feeAbsorption', e.target.value as CalcInputs['feeAbsorption'])}>
                  {FEE_ABSORPTIONS.map(f => <option key={f}>{f}</option>)}
                </select>
                <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </InputGroup>

            {isSurcharge ? (
              <InputGroup label="Athlete Surcharge %" tip="% added to registration price for BNPL athletes. Offsets processing cost.">
                <div className="relative">
                  <input type="number" className={inputCls + ' pr-6'} value={inputs.athleteSurchargePercent}
                    onChange={e => set('athleteSurchargePercent', parseFloat(e.target.value) || 0)} min={0} step={0.1} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
                </div>
              </InputGroup>
            ) : (
              <div>
                <Label>Athlete Surcharge %<Tip text="Only applicable when 'Athlete surcharge' is selected." /></Label>
                <input type="text" className={inputDisabledCls} value="—" disabled />
              </div>
            )}

            <div className={`rounded-lg p-3 text-xs leading-relaxed ${
              isSurcharge ? 'bg-blue-50 text-blue-700 border border-blue-200' :
              isShared ? 'bg-amber-50 text-amber-700 border border-amber-200' :
              'bg-gray-50 text-gray-600 border border-gray-200'
            }`}>
              {absorptionLabel[inputs.feeAbsorption]}
              {isSurcharge && results.athleteCostPerTxn > 0 && (
                <div className="mt-1 font-semibold">Est. athlete surcharge: {fmtPrecise(results.athleteCostPerTxn)} per registration</div>
              )}
              {isShared && results.athleteCostPerTxn > 0 && (
                <div className="mt-1 font-semibold">Est. athlete share: {fmtPrecise(results.athleteCostPerTxn)} per transaction</div>
              )}
            </div>
          </div>

          {/* Adoption & Uplift */}
          <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Adoption & Uplift Assumptions</p>

            <InputGroup label="Expected BNPL Adoption %" tip="% of total registrations expected to use BNPL">
              <div className="relative">
                <input type="number" className={inputCls + ' pr-6'} value={inputs.bnplAdoptionPercent}
                  onChange={e => set('bnplAdoptionPercent', parseFloat(e.target.value) || 0)} min={0} max={100} step={0.5} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
              </div>
            </InputGroup>

            <InputGroup label="Expected Conversion Uplift %" tip="Additional registrations due to BNPL availability">
              <div className="relative">
                <input type="number" className={inputCls + ' pr-6'} value={inputs.conversionUpliftPercent}
                  onChange={e => set('conversionUpliftPercent', parseFloat(e.target.value) || 0)} min={0} step={0.5} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
              </div>
            </InputGroup>

            <InputGroup label="Refund Rate %" tip="% of BNPL transactions expected to be refunded">
              <div className="relative">
                <input type="number" className={inputCls + ' pr-6'} value={inputs.refundRatePercent}
                  onChange={e => set('refundRatePercent', parseFloat(e.target.value) || 0)} min={0} max={100} step={0.5} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
              </div>
            </InputGroup>

            <InputGroup label="Average Refund Amount %" tip="% of original registration amount refunded on average">
              <div className="relative">
                <input type="number" className={inputCls + ' pr-6'} value={inputs.avgRefundAmountPercent}
                  onChange={e => set('avgRefundAmountPercent', parseFloat(e.target.value) || 0)} min={0} max={100} step={5} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
              </div>
            </InputGroup>
          </div>

          {/* Selected BNPL Rate Configuration */}
          <div className={`rounded-2xl border p-4 ${rateUnavailable ? 'bg-red-50 border-red-300' : 'bg-blue-50 border-blue-200'}`}>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2 text-gray-500">Selected BNPL Rate Configuration</p>
            {rateUnavailable ? (
              <div className="flex items-start gap-2">
                <Ban size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-red-700 font-medium leading-relaxed">
                  No active fee configuration for <strong>{inputs.provider}</strong> in <strong>{inputs.country}</strong>.
                  Add or activate a rate in Admin Configuration.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <p className="text-lg font-bold text-blue-800">{feeRow!.percentFee}% + {fmtPrecise(feeRow!.fixedFee)}</p>
                <p className="text-xs text-blue-600">Per transaction · {feeRow!.currency}</p>
                <div className="text-xs text-blue-700 space-y-0.5 mt-2">
                  <div className="flex justify-between">
                    <span className="opacity-70">Provider</span>
                    <span className="font-medium">{feeRow!.provider}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="opacity-70">Region</span>
                    <span className="font-medium">{feeRow!.country}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="opacity-70">Intl Fee Applicable</span>
                    <span className="font-medium">{feeRow!.intlFeeApplicable ? `Yes (${feeRow!.intlFeePercent}%)` : 'No'}</span>
                  </div>
                  {feeRow!.notes && (
                    <div className="flex justify-between">
                      <span className="opacity-70">Source</span>
                      <span className="font-medium text-right max-w-[60%]">{feeRow!.notes}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Intl Fee Toggle */}
            {!rateUnavailable && (
              <div className="mt-3 pt-3 border-t border-blue-200">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-600 font-medium">
                      Apply {feeRow!.intlFeeApplicable ? `${feeRow!.intlFeePercent}%` : '0%'} Intl. Payment Methods Fee
                    </span>
                    <Tip text={
                      feeRow!.intlFeeApplicable
                        ? `This provider/region combination has an international payment methods fee of ${feeRow!.intlFeePercent}% configured. Toggle to include or exclude it. Disabled by default for Affirm/Afterpay/Clearpay based on current amendment interpretation.`
                        : 'Disabled by default for Affirm/Afterpay/Clearpay based on current amendment interpretation.'
                    } />
                  </div>
                  <button
                    onClick={() => feeRow!.intlFeeApplicable && set('applyIntlFee', !inputs.applyIntlFee)}
                    disabled={!feeRow!.intlFeeApplicable}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${
                      !feeRow!.intlFeeApplicable
                        ? 'bg-gray-200 cursor-not-allowed'
                        : inputs.applyIntlFee ? 'bg-blue-600' : 'bg-gray-300 cursor-pointer'
                    }`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                      feeRow!.intlFeeApplicable && inputs.applyIntlFee ? 'translate-x-[18px]' : 'translate-x-[2px]'
                    }`} />
                  </button>
                </div>
                {!feeRow!.intlFeeApplicable && (
                  <p className="text-xs text-gray-400 mt-1">Not applicable for this provider/region</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Right Panel ── */}
        <div className="flex-1 min-w-0 space-y-5">

          {/* Provider Availability Banner */}
          {rateUnavailable && (
            <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-5 flex items-start gap-3">
              <Ban size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-red-800">No Active Rate Configuration for This Market</p>
                <p className="text-sm text-red-700 mt-1">
                  <strong>{inputs.provider}</strong> does not have an active fee configuration for <strong>{inputs.country}</strong>.
                  Calculations are disabled. Add or activate a rate in Admin / Assumptions Configuration.
                </p>
                {availableMarketsForProvider.length > 0 && (
                  <p className="text-xs text-red-500 mt-2 font-medium">
                    Active markets for {inputs.provider}: {availableMarketsForProvider.join(', ')}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Model Confidence + Opportunity Score row */}
          {!rateUnavailable && (() => {
            const ConfIcon = confidenceConfig[confidence].icon;
            return (
              <div className="grid grid-cols-2 gap-3">
                <div className={`rounded-xl border p-4 ${confidenceConfig[confidence].color}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <ConfIcon size={13} className="flex-shrink-0" />
                    <p className="text-xs font-semibold uppercase tracking-wide">Model Confidence</p>
                  </div>
                  <p className="text-xl font-bold">{confidence}</p>
                  <p className="text-xs mt-0.5 opacity-70">
                    {confidence === 'High' ? 'All key assumptions provided and provider active'
                      : confidence === 'Medium' ? 'One assumption missing or zero — review inputs'
                      : 'Multiple assumptions missing — outputs are directional only'}
                  </p>
                </div>
                <div className={`rounded-xl border p-4 ${scoreColor}`}>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-1">Commercial Opportunity Score</p>
                  <div className="flex items-end gap-2">
                    <p className="text-xl font-bold">{opportunityScore}<span className="text-sm font-semibold opacity-60"> / 100</span></p>
                  </div>
                  <p className="text-xs mt-0.5 font-semibold">{scoreLabel}</p>
                  <p className="text-[10px] mt-0.5 opacity-60">Based on net impact, break-even, adoption & margin</p>
                </div>
              </div>
            );
          })()}

          {/* Recommendation */}
          {!rateUnavailable && (
            <div className={`rounded-2xl border p-5 ${recColor}`}>
              <div className="flex items-start gap-3">
                <RecIcon size={18} className="flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold mb-1">Commercial Assessment</p>
                  <p className="text-sm leading-relaxed">{recText}</p>
                  <p className="text-xs mt-2 opacity-80 font-medium">{eventRec[inputs.eventType]}</p>
                  <p className="text-xs mt-1.5 opacity-55 italic">
                    Directional model based on user-configured pricing and estimated athlete behavior. All outputs are modeled estimates only.
                  </p>

                  {/* Executive Insights — 5 always-present structured insights */}
                  <div className="mt-4 pt-3 border-t border-current/20">
                    <div className="flex items-center gap-1.5 mb-2.5">
                      <Lightbulb size={13} className="opacity-70" />
                      <span className="text-xs font-bold uppercase tracking-wide opacity-70">Executive Insights</span>
                    </div>
                    <ul className="space-y-2">
                      {/* A. Break-even insight */}
                      <li className="flex items-start gap-2 text-xs leading-relaxed opacity-90">
                        <span className="text-current opacity-50 flex-shrink-0 font-bold mt-0.5">✓</span>
                        {breakEvenConversionUplift < 0.5
                          ? `Break-even conversion uplift is only ${fmt(breakEvenConversionUplift, 'percent')}, suggesting a minimal improvement in athlete conversion is sufficient to offset estimated incremental BNPL costs.`
                          : breakEvenConversionUplift < inputs.conversionUpliftPercent
                            ? `Break-even conversion uplift is ${fmt(breakEvenConversionUplift, 'percent')}, which is below the modeled ${inputs.conversionUpliftPercent}% assumption — the model sits on the directionally favorable side of neutral.`
                            : `Break-even conversion uplift is ${fmt(breakEvenConversionUplift, 'percent')}, which exceeds the modeled ${inputs.conversionUpliftPercent}% assumption — actual conversion performance would need to exceed current estimates for positive net impact.`}
                      </li>
                      {/* B. Cost insight */}
                      <li className="flex items-start gap-2 text-xs leading-relaxed opacity-90">
                        <span className="text-current opacity-50 flex-shrink-0 font-bold mt-0.5">✓</span>
                        {results.grossRevenue > 0
                          ? `Estimated incremental processing cost (${fmt(results.incrementalProcessingCost)}) represents ${((results.incrementalProcessingCost / results.grossRevenue) * 100).toFixed(2)}% of gross registration revenue under current assumptions.`
                          : `Incremental processing cost is estimated at ${fmt(results.incrementalProcessingCost)} under current assumptions.`}
                      </li>
                      {/* C. Revenue/Uplift insight */}
                      <li className="flex items-start gap-2 text-xs leading-relaxed opacity-90">
                        <span className="text-current opacity-50 flex-shrink-0 font-bold mt-0.5">✓</span>
                        {results.incrementalContribution > results.incrementalProcessingCost
                          ? `Modeled conversion uplift generates an estimated ${fmt(results.incrementalContribution)} in incremental contribution — significantly exceeding the estimated incremental processing expense of ${fmt(results.incrementalProcessingCost)}.`
                          : `Modeled conversion uplift generates an estimated ${fmt(results.incrementalContribution)} in incremental contribution, which does not fully offset the estimated incremental processing expense of ${fmt(results.incrementalProcessingCost)} under current assumptions.`}
                      </li>
                      {/* D. Refund exposure insight */}
                      <li className="flex items-start gap-2 text-xs leading-relaxed opacity-90">
                        <span className="text-current opacity-50 flex-shrink-0 font-bold mt-0.5">✓</span>
                        {results.refundExposure > 0
                          ? `Estimated refund exposure is ${fmt(results.refundExposure)} based on a ${inputs.refundRatePercent}% refund rate and ${inputs.avgRefundAmountPercent}% average refund amount — operational refund handling processes should be validated prior to launch.`
                          : `No refund exposure is modeled under current assumptions. Validate refund rate assumptions before launch.`}
                      </li>
                      {/* E. Provider competitiveness insight */}
                      <li className="flex items-start gap-2 text-xs leading-relaxed opacity-90">
                        <span className="text-current opacity-50 flex-shrink-0 font-bold mt-0.5">✓</span>
                        {feeRow
                          ? `${feeRow.provider} is the currently selected provider for ${feeRow.country} at ${feeRow.percentFee}% + ${fmtPrecise(feeRow.fixedFee)} per transaction${feeRow.intlFeeApplicable ? ` with a ${feeRow.intlFeePercent}% international payment methods fee applicable` : ''}. Use the Provider Comparison section to evaluate alternatives in this market.`
                          : `No active provider is configured for the selected market. Add a fee configuration in Admin / Assumptions Configuration to enable provider comparisons.`}
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Revenue & Volume */}
          <div className={rateUnavailable ? 'opacity-40 pointer-events-none select-none' : ''}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Revenue & Volume</p>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              <MetricCard
                label="Gross Registration Revenue"
                value={fmt(results.grossRevenue)}
                sub={`${fmt(inputs.expectedRegistrations, 'number')} registrations`}
                formula={{
                  formula: 'Price × Registrations',
                  inputs: `${fmt(inputs.registrationPrice)} × ${fmt(inputs.expectedRegistrations, 'number')}`,
                  result: fmt(results.grossRevenue),
                }}
              />
              <MetricCard
                label="Estimated BNPL Volume"
                value={fmt(results.bnplVolume)}
                sub={`${fmt(results.bnplTransactions, 'number')} transactions`}
                color="blue"
                formula={{
                  formula: 'Registrations × Adoption% × Price',
                  inputs: `${fmt(inputs.expectedRegistrations, 'number')} × ${inputs.bnplAdoptionPercent}% × ${fmt(inputs.registrationPrice)}`,
                  result: fmt(results.bnplVolume),
                }}
              />
              <MetricCard
                label="Incremental Registrations"
                value={fmt(results.incrementalRegistrations, 'number')}
                sub={`+${inputs.conversionUpliftPercent}% uplift`}
                color="green"
                formula={{
                  formula: 'Registrations × Conversion Uplift%',
                  inputs: `${fmt(inputs.expectedRegistrations, 'number')} × ${inputs.conversionUpliftPercent}%`,
                  result: `${fmt(results.incrementalRegistrations, 'number')} registrations`,
                }}
              />
              <MetricCard
                label="Incremental Revenue from Uplift"
                value={fmt(results.incrementalRevenue)}
                color="green"
                formula={{
                  formula: 'Incremental Registrations × Price',
                  inputs: `${fmt(results.incrementalRegistrations, 'number')} × ${fmt(inputs.registrationPrice)}`,
                  result: fmt(results.incrementalRevenue),
                }}
              />
            </div>
          </div>

          {/* Cost Analysis */}
          <div className={rateUnavailable ? 'opacity-40 pointer-events-none select-none' : ''}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Cost Analysis</p>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              <MetricCard
                label="Standard Card Cost on BNPL Volume"
                value={fmt(results.stdCardCostOnBnpl)}
                formula={{
                  formula: '(BNPL Volume × Card%) + (BNPL Txns × Card Fixed)',
                  inputs: `(${fmt(results.bnplVolume)} × ${inputs.standardCardFeePercent}%) + (${fmt(results.bnplTransactions, 'number')} × ${fmtPrecise(inputs.standardCardFixedFee)})`,
                  result: fmt(results.stdCardCostOnBnpl),
                }}
              />
              <MetricCard
                label="BNPL Base Processing Cost"
                value={fmt(results.bnplBaseCost)}
                color="orange"
                sub={feeRow ? `${feeRow.percentFee}% + ${fmtPrecise(feeRow.fixedFee)} per txn` : ''}
                formula={{
                  formula: '(BNPL Volume × BNPL%) + (BNPL Txns × BNPL Fixed)',
                  inputs: feeRow
                    ? `(${fmt(results.bnplVolume)} × ${feeRow.percentFee}%) + (${fmt(results.bnplTransactions, 'number')} × ${fmtPrecise(feeRow.fixedFee)})`
                    : 'No active rate configured',
                  result: fmt(results.bnplBaseCost),
                }}
              />
              <MetricCard
                label="International Payment Methods Fee"
                value={fmt(results.intlFeeAmount)}
                color={results.intlFeeAmount > 0 ? 'orange' : 'default'}
                sub={
                  feeRow?.intlFeeApplicable
                    ? inputs.applyIntlFee ? `${feeRow.intlFeePercent}% applied` : 'Applicable but toggled off'
                    : 'Not applicable for this provider/region'
                }
                formula={{
                  formula: feeRow?.intlFeeApplicable && inputs.applyIntlFee
                    ? 'BNPL Volume × Intl Fee%'
                    : 'Not applied (fee not applicable or toggled off)',
                  inputs: feeRow?.intlFeeApplicable && inputs.applyIntlFee
                    ? `${fmt(results.bnplVolume)} × ${feeRow!.intlFeePercent}%`
                    : 'N/A',
                  result: fmt(results.intlFeeAmount),
                }}
              />
              <MetricCard
                label="Estimated Refund Exposure"
                value={fmt(results.refundExposure)}
                color="orange"
                formula={{
                  formula: 'BNPL Volume × Refund Rate% × Avg Refund%',
                  inputs: `${fmt(results.bnplVolume)} × ${inputs.refundRatePercent}% × ${inputs.avgRefundAmountPercent}%`,
                  result: fmt(results.refundExposure),
                }}
              />
            </div>
          </div>

          {/* BNPL Processing & Absorption */}
          <div className={rateUnavailable ? 'opacity-40 pointer-events-none select-none' : ''}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Processing Cost & Absorption</p>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              <MetricCard
                label="BNPL Processing Cost (Gross)"
                value={fmt(results.bnplProcessingCost)}
                color="orange"
                sub="Base + International fee"
                formula={{
                  formula: 'BNPL Base Cost + International Fee',
                  inputs: `${fmt(results.bnplBaseCost)} + ${fmt(results.intlFeeAmount)}`,
                  result: fmt(results.bnplProcessingCost),
                }}
              />
              <MetricCard
                label="Estimated BNPL Processing Cost to IRONMAN"
                value={fmt(results.ironmanCost)}
                color={isShared || isSurcharge ? 'blue' : 'orange'}
                sub={absorptionLabel[inputs.feeAbsorption]}
                formula={{
                  formula: isSurcharge
                    ? 'max(0, BNPL Gross Cost − Surcharge Revenue)'
                    : isShared
                      ? 'BNPL Gross Cost × 50%'
                      : 'BNPL Gross Cost (IRONMAN absorbs 100%)',
                  inputs: isSurcharge
                    ? `max(0, ${fmt(results.bnplProcessingCost)} − ${fmt(results.athleteTotalCost)})`
                    : isShared
                      ? `${fmt(results.bnplProcessingCost)} × 50%`
                      : fmt(results.bnplProcessingCost),
                  result: fmt(results.ironmanCost),
                }}
              />
              <MetricCard
                label="Incremental Processing Cost"
                value={results.incrementalProcessingCost >= 0 ? `+${fmt(results.incrementalProcessingCost)}` : fmt(results.incrementalProcessingCost)}
                color={results.incrementalProcessingCost > 0 ? 'red' : 'green'}
                sub="IRONMAN net cost vs. standard card baseline"
                formula={{
                  formula: 'IRONMAN BNPL Cost − Standard Card Cost on BNPL Volume',
                  inputs: `${fmt(results.ironmanCost)} − ${fmt(results.stdCardCostOnBnpl)}`,
                  result: fmt(results.incrementalProcessingCost),
                }}
              />
            </div>
          </div>

          {/* Contribution & Net Impact */}
          <div className={rateUnavailable ? 'opacity-40 pointer-events-none select-none' : ''}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Contribution & Net Impact</p>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              <MetricCard
                label={`Incremental Contribution (${inputs.contributionMarginPercent}% margin)`}
                value={fmt(results.incrementalContribution)}
                color="green"
                sub={`${inputs.contributionMarginPercent}% of incremental revenue`}
                formula={{
                  formula: 'Incremental Revenue × Contribution Margin%',
                  inputs: `${fmt(results.incrementalRevenue)} × ${inputs.contributionMarginPercent}%`,
                  result: fmt(results.incrementalContribution),
                }}
              />
              <MetricCard
                label="Estimated Net Commercial Impact"
                value={results.netCommercialImpact >= 0 ? `+${fmt(results.netCommercialImpact)}` : fmt(results.netCommercialImpact)}
                color={netColor}
                sub="Incremental Contribution − Incremental Processing Cost"
                formula={{
                  formula: 'Incremental Contribution − Incremental Processing Cost',
                  inputs: `${fmt(results.incrementalContribution)} − ${fmt(results.incrementalProcessingCost)}`,
                  result: fmt(results.netCommercialImpact),
                }}
              />
              <MetricCard
                label="Break-even Conversion Uplift"
                value={fmt(results.breakEvenConversionUplift, 'percent')}
                color={results.breakEvenConversionUplift < inputs.conversionUpliftPercent ? 'green' : 'red'}
                sub={`You entered ${inputs.conversionUpliftPercent}% uplift`}
                formula={{
                  formula: '(Incr. Processing Cost ÷ (Gross Revenue × Margin%)) × 100',
                  inputs: `(${fmt(results.incrementalProcessingCost)} ÷ (${fmt(results.grossRevenue)} × ${inputs.contributionMarginPercent}%)) × 100`,
                  result: fmt(results.breakEvenConversionUplift, 'percent'),
                }}
              />
              <div />
            </div>
          </div>

          {/* Athlete Surcharge / Shared Callout */}
          {(isSurcharge || isShared) && !rateUnavailable && (
            <div className={`rounded-2xl border p-4 flex items-start gap-3 ${isSurcharge ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'}`}>
              <Info size={16} className={`flex-shrink-0 mt-0.5 ${isSurcharge ? 'text-blue-500' : 'text-amber-500'}`} />
              <div>
                <p className={`text-sm font-semibold ${isSurcharge ? 'text-blue-800' : 'text-amber-800'}`}>
                  {isSurcharge ? 'Athlete Surcharge Summary' : 'Shared Absorption Summary'}
                </p>
                <div className={`mt-2 grid grid-cols-3 gap-4 text-xs ${isSurcharge ? 'text-blue-700' : 'text-amber-700'}`}>
                  <div>
                    <p className="font-semibold uppercase tracking-wide opacity-70 mb-0.5">Per Transaction</p>
                    <p className="text-base font-bold">{fmtPrecise(results.athleteCostPerTxn)}</p>
                    <p className="opacity-70">passed to athlete</p>
                  </div>
                  <div>
                    <p className="font-semibold uppercase tracking-wide opacity-70 mb-0.5">Total Athlete Cost</p>
                    <p className="text-base font-bold">{fmt(results.athleteTotalCost)}</p>
                    <p className="opacity-70">across BNPL volume</p>
                  </div>
                  <div>
                    <p className="font-semibold uppercase tracking-wide opacity-70 mb-0.5">Estimated BNPL Processing Cost to IRONMAN</p>
                    <p className="text-base font-bold">{fmt(results.ironmanCost)}</p>
                    <p className="opacity-70">after offset</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Charts */}
          <div className={`grid grid-cols-3 gap-4 ${rateUnavailable ? 'opacity-40 pointer-events-none select-none' : ''}`}>
            <div className="col-span-1 bg-white rounded-2xl border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Cost Comparison</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={costCompareData} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} tickLine={false} axisLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {costCompareData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="col-span-1 bg-white rounded-2xl border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Contribution vs Cost</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={impactData} barCategoryGap="35%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} tickLine={false} axisLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {impactData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="col-span-1 bg-white rounded-2xl border border-gray-200 p-4 flex flex-col items-center justify-center">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 self-start">BNPL Adoption</p>
              <div className="relative flex items-center justify-center">
                <ResponsiveContainer width={150} height={150}>
                  <PieChart>
                    <Pie data={donutData} cx="50%" cy="50%" innerRadius={45} outerRadius={65} dataKey="value" strokeWidth={0}>
                      <Cell fill="#3b82f6" />
                      <Cell fill="#f3f4f6" />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute text-center">
                  <p className="text-2xl font-bold text-gray-900">{inputs.bnplAdoptionPercent}%</p>
                  <p className="text-xs text-gray-400">Adoption</p>
                </div>
              </div>
              <p className="text-xs text-gray-500 text-center">{fmt(results.bnplTransactions, 'number')} transactions</p>
            </div>
          </div>

          {/* Sensitivity Table */}
          <div className={`bg-white rounded-2xl border border-gray-200 p-5 ${rateUnavailable ? 'opacity-40 pointer-events-none select-none' : ''}`}>
            <div className="flex items-center gap-2 mb-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sensitivity Analysis — Net Commercial Impact</p>
              <Tip text="Net impact (using contribution margin) at different BNPL adoption and conversion uplift combinations." />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-left text-gray-400 font-semibold pb-2 pr-4">Adoption \ Uplift</th>
                    {upliftCols.map(u => (
                      <th key={u} className={`text-center pb-2 px-3 font-semibold ${u === inputs.conversionUpliftPercent ? 'text-blue-600' : 'text-gray-400'}`}>
                        {u}% Uplift{u === inputs.conversionUpliftPercent ? ' *' : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {adoptionRows.map((adoption, ri) => (
                    <tr key={adoption} className={adoption === inputs.bnplAdoptionPercent ? 'bg-blue-50' : ''}>
                      <td className={`py-2 pr-4 font-semibold ${adoption === inputs.bnplAdoptionPercent ? 'text-blue-600' : 'text-gray-500'}`}>
                        {adoption}% Adoption{adoption === inputs.bnplAdoptionPercent ? ' *' : ''}
                      </td>
                      {upliftCols.map((_, ci) => {
                        const val = sensitivityData[ri][ci];
                        const positive = val >= 0;
                        return (
                          <td key={ci} className={`text-center py-2 px-3 font-semibold ${positive ? 'text-emerald-700' : 'text-red-600'}`}>
                            {positive ? '+' : ''}{fmt(val)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-gray-400 mt-2">* Current inputs highlighted. Net impact uses contribution margin ({inputs.contributionMarginPercent}%).</p>
            </div>
          </div>

          {/* Comparison Views */}
          <ComparisonViews
            inputs={inputs}
            feeRow={feeRow}
            activeScenarios={activeScenarios}
            activeRows={activeRows}
            config={config}
          />

          {/* Assumptions */}
          <div className="bg-gray-50 rounded-2xl border border-gray-200 p-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Model Assumptions & Limitations</p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
              {[
                'This model estimates directional commercial impact only and is not a financial guarantee.',
                'BNPL adoption and conversion uplift rates are assumptions and should be validated through pilot data.',
                `Net impact uses contribution margin (${inputs.contributionMarginPercent}%) to adjust incremental revenue. Adjust this to reflect actual economics.`,
                'All pricing values come from the user-configurable fee table — no rates are hardcoded in the calculation engine.',
                'Athlete surcharge recovery is estimated; actual surcharge design may vary by platform and jurisdiction.',
                'Net impact does not include operational costs, fraud exposure, or chargeback differences.',
                'Incremental contribution assumes all uplift registrations are BNPL-attributable — actual attribution will vary.',
                'Sensitivity analysis holds all other inputs constant. Real-world results will differ.',
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="w-1 h-1 rounded-full bg-gray-400 mt-2 flex-shrink-0" />
                  <p className="text-xs text-gray-500 leading-relaxed">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Admin Panel */}
      <AdminPanel
        config={config}
        onChange={handleConfigChange}
        onClearStorage={handleClearStorage}
      />
    </div>
  );
}
