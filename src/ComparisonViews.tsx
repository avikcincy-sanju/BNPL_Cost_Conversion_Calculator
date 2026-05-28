import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, Award, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { AppConfig, CalcInputs, FeeRow, ScenarioPreset } from './types';

// ─── Shared helpers (duplicated from App to keep this file self-contained) ────

const fmt = (n: number, type: 'currency' | 'percent' | 'number' = 'currency') => {
  if (type === 'currency') return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
  if (type === 'percent') return n.toFixed(2) + '%';
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
};

const fmtPrecise = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

// ─── Calculation engine (mirrors App.tsx — no hardcoded values) ───────────────

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
  const stdCardCostOnBnpl = bnplVolume * (standardCardFeePercent / 100) + bnplTransactions * standardCardFixedFee;

  let bnplProcessingCost = 0;
  if (feeRow) {
    const base = bnplVolume * (feeRow.percentFee / 100) + bnplTransactions * feeRow.fixedFee;
    const intl = feeRow.intlFeeApplicable && applyIntlFee ? bnplVolume * (feeRow.intlFeePercent / 100) : 0;
    bnplProcessingCost = base + intl;
  }

  let ironmanCost = bnplProcessingCost;
  if (feeAbsorption === 'Athlete surcharge') {
    const surchargeRevenue = bnplVolume * (athleteSurchargePercent / 100);
    ironmanCost = Math.max(0, bnplProcessingCost - surchargeRevenue);
  } else if (feeAbsorption === 'Shared absorption') {
    ironmanCost = bnplProcessingCost * 0.5;
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

  return { incrementalProcessingCost, incrementalContribution, refundExposure, netCommercialImpact, breakEvenConversionUplift, bnplProcessingCost };
}

// ─── Collapsible wrapper ──────────────────────────────────────────────────────

function CollapsibleSection({
  title,
  subtitle,
  defaultOpen = true,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="text-left">
          <p className="text-sm font-bold text-gray-900 tracking-tight">{title}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {open ? <ChevronUp size={15} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={15} className="text-gray-400 flex-shrink-0" />}
      </button>
      {open && <div className="border-t border-gray-100">{children}</div>}
    </div>
  );
}

// ─── Impact pill ──────────────────────────────────────────────────────────────

function ImpactCell({ value, isBest }: { value: number; isBest?: boolean }) {
  const positive = value >= 0;
  return (
    <span className={`inline-flex items-center gap-1 font-semibold ${
      isBest ? 'text-emerald-700' : positive ? 'text-emerald-600' : 'text-red-600'
    }`}>
      {isBest && <Award size={11} className="flex-shrink-0" />}
      {positive ? '+' : ''}{fmt(value)}
    </span>
  );
}

// ─── 1. Scenario Comparison ───────────────────────────────────────────────────

interface ScenarioComparisonProps {
  inputs: CalcInputs;
  feeRow: FeeRow | null;
  activeScenarios: ScenarioPreset[];
}

export function ScenarioComparison({ inputs, feeRow, activeScenarios }: ScenarioComparisonProps) {
  const rows = useMemo(() => {
    return activeScenarios.map(s => {
      const modInputs: CalcInputs = {
        ...inputs,
        bnplAdoptionPercent: s.bnplAdoptionPercent,
        conversionUpliftPercent: s.conversionUpliftPercent,
        refundRatePercent: s.refundRatePercent,
      };
      const r = calcResults(modInputs, feeRow);
      return { scenario: s, ...r };
    });
  }, [inputs, feeRow, activeScenarios]);

  const bestIdx = useMemo(() => {
    if (rows.length === 0) return -1;
    let max = -Infinity;
    let idx = 0;
    rows.forEach((r, i) => { if (r.netCommercialImpact > max) { max = r.netCommercialImpact; idx = i; } });
    return idx;
  }, [rows]);

  if (activeScenarios.length === 0) {
    return (
      <div className="px-5 py-6 text-center text-sm text-gray-400">
        No active scenario presets. Add scenarios in Admin / Assumptions Configuration.
      </div>
    );
  }

  const cols = [
    { label: 'Scenario', key: 'name' },
    { label: 'Adoption %', key: 'adoption' },
    { label: 'Uplift %', key: 'uplift' },
    { label: 'Refund %', key: 'refund' },
    { label: 'Incr. Processing Cost', key: 'ipc' },
    { label: 'Incr. Contribution', key: 'ic' },
    { label: 'Net Commercial Impact', key: 'nci' },
    { label: 'Break-even Uplift', key: 'beu' },
    { label: 'Refund Exposure', key: 're' },
  ];

  return (
    <div className="p-5 space-y-4">
      {feeRow === null && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          No active fee configuration for the selected provider/region. Scenario outputs will show $0 — select a valid combination to compare scenarios meaningfully.
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {cols.map(c => (
                <th key={c.key} className="px-4 py-2.5 text-left text-gray-500 font-semibold uppercase tracking-wide whitespace-nowrap">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row, i) => {
              const isBest = i === bestIdx;
              return (
                <tr key={row.scenario.id} className={isBest ? 'bg-emerald-50' : 'bg-white hover:bg-gray-50'}>
                  <td className="px-4 py-3 font-semibold text-gray-800 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      {isBest && <Award size={12} className="text-emerald-600 flex-shrink-0" />}
                      {row.scenario.name}
                      {isBest && <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-700 rounded-full">Best</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{row.scenario.bnplAdoptionPercent}%</td>
                  <td className="px-4 py-3 text-gray-700">{row.scenario.conversionUpliftPercent}%</td>
                  <td className="px-4 py-3 text-gray-700">{row.scenario.refundRatePercent}%</td>
                  <td className="px-4 py-3">
                    <span className={row.incrementalProcessingCost > 0 ? 'text-red-600 font-semibold' : 'text-emerald-600 font-semibold'}>
                      {row.incrementalProcessingCost >= 0 ? '+' : ''}{fmt(row.incrementalProcessingCost)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-emerald-700 font-semibold">{fmt(row.incrementalContribution)}</td>
                  <td className="px-4 py-3"><ImpactCell value={row.netCommercialImpact} isBest={isBest} /></td>
                  <td className="px-4 py-3 text-gray-700">{fmt(row.breakEvenConversionUplift, 'percent')}</td>
                  <td className="px-4 py-3 text-amber-700">{fmt(row.refundExposure)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {bestIdx >= 0 && (
        <p className="text-xs text-gray-500 flex items-center gap-1.5">
          <Award size={12} className="text-emerald-600" />
          <span>
            <strong className="text-gray-700">Best scenario under current assumptions:</strong>{' '}
            {rows[bestIdx].scenario.name} — Net Commercial Impact of{' '}
            <strong className="text-emerald-700">{fmt(rows[bestIdx].netCommercialImpact)}</strong>
          </span>
        </p>
      )}
    </div>
  );
}

// ─── 2. Provider Comparison ───────────────────────────────────────────────────

interface ProviderComparisonProps {
  inputs: CalcInputs;
  activeRows: FeeRow[];
}

export function ProviderComparison({ inputs, activeRows }: ProviderComparisonProps) {
  const regionRows = useMemo(
    () => activeRows.filter(r => r.country.toLowerCase() === inputs.country.toLowerCase()),
    [activeRows, inputs.country]
  );

  const rows = useMemo(() => {
    return regionRows.map(row => {
      const r = calcResults({ ...inputs, provider: row.provider }, row);
      return { feeRow: row, ...r };
    }).sort((a, b) => b.netCommercialImpact - a.netCommercialImpact);
  }, [regionRows, inputs]);

  const bestIdx = rows.length > 0 ? 0 : -1; // already sorted desc by NCI

  if (regionRows.length === 0) {
    return (
      <div className="px-5 py-6 text-center text-sm text-gray-400">
        No active fee configurations for <strong>{inputs.country}</strong>. Add provider rates for this region in Admin / Assumptions Configuration.
      </div>
    );
  }

  return (
    <div className="p-5 space-y-4">
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {[
                'Provider', 'Fee %', 'Fixed Fee', 'Currency',
                'Intl Fee?', 'Intl Fee %',
                'BNPL Processing Cost', 'Incr. Processing Cost', 'Net Commercial Impact',
              ].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-gray-500 font-semibold uppercase tracking-wide whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row, i) => {
              const isBest = i === bestIdx;
              const nci = row.netCommercialImpact;
              const NciIcon = nci > 500 ? TrendingUp : nci < -500 ? TrendingDown : Minus;
              const nciColor = nci > 500 ? 'text-emerald-600' : nci < -500 ? 'text-red-600' : 'text-amber-600';
              return (
                <tr key={row.feeRow.id} className={isBest ? 'bg-emerald-50' : 'bg-white hover:bg-gray-50'}>
                  <td className="px-4 py-3 font-semibold text-gray-800 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      {isBest && <Award size={12} className="text-emerald-600 flex-shrink-0" />}
                      {row.feeRow.provider}
                      {isBest && <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-700 rounded-full">Recommended</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-700 font-mono">{row.feeRow.percentFee}%</td>
                  <td className="px-4 py-3 text-gray-700 font-mono">{fmtPrecise(row.feeRow.fixedFee)}</td>
                  <td className="px-4 py-3 text-gray-600">{row.feeRow.currency}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                      row.feeRow.intlFeeApplicable ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {row.feeRow.intlFeeApplicable ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{row.feeRow.intlFeeApplicable ? `${row.feeRow.intlFeePercent}%` : '—'}</td>
                  <td className="px-4 py-3 text-amber-700 font-semibold">{fmt(row.bnplProcessingCost)}</td>
                  <td className="px-4 py-3">
                    <span className={row.incrementalProcessingCost > 0 ? 'text-red-600 font-semibold' : 'text-emerald-600 font-semibold'}>
                      {row.incrementalProcessingCost >= 0 ? '+' : ''}{fmt(row.incrementalProcessingCost)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`flex items-center gap-1 font-bold ${nciColor}`}>
                      <NciIcon size={11} />
                      {nci >= 0 ? '+' : ''}{fmt(nci)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {bestIdx >= 0 && (
        <div className="flex items-center gap-2 text-xs bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5">
          <Award size={13} className="text-emerald-600 flex-shrink-0" />
          <span>
            <strong className="text-gray-800">Recommended provider under current assumptions:</strong>{' '}
            <strong className="text-emerald-700">{rows[bestIdx].feeRow.provider}</strong>
            {' '}—{' '}Net Commercial Impact of{' '}
            <strong className="text-emerald-700">{fmt(rows[bestIdx].netCommercialImpact)}</strong>
            {' '}at {rows[bestIdx].feeRow.percentFee}% + {fmtPrecise(rows[bestIdx].feeRow.fixedFee)} per transaction.
          </span>
        </div>
      )}
      <p className="text-xs text-gray-400">
        Sorted by highest Net Commercial Impact. All providers use current adoption, uplift, margin, and standard card assumptions. Intl fee applied where applicable and toggled on.
      </p>
    </div>
  );
}

// ─── 3. Event Economics Matrix ────────────────────────────────────────────────

const PRICE_ROWS = [250, 500, 750, 900, 1200, 1500];
const ADOPTION_COLS = [5, 10, 15, 20, 25];

interface EventEconomicsMatrixProps {
  inputs: CalcInputs;
  feeRow: FeeRow | null;
}

export function EventEconomicsMatrix({ inputs, feeRow }: EventEconomicsMatrixProps) {
  const matrixData = useMemo(() => {
    return PRICE_ROWS.map(price =>
      ADOPTION_COLS.map(adoption => {
        const r = calcResults({ ...inputs, registrationPrice: price, bnplAdoptionPercent: adoption }, feeRow);
        return r.netCommercialImpact;
      })
    );
  }, [inputs, feeRow]);

  // Compute global min/max for relative coloring
  const allValues = matrixData.flat();
  const maxVal = Math.max(...allValues);
  const minVal = Math.min(...allValues);
  const range = maxVal - minVal || 1;

  const cellColor = (val: number): string => {
    if (val > 500) return 'bg-emerald-100 text-emerald-800';
    if (val > 0) return 'bg-emerald-50 text-emerald-700';
    if (val > -500) return 'bg-amber-50 text-amber-700';
    return 'bg-red-50 text-red-700';
  };

  const isCurrentCell = (price: number, adoption: number) =>
    price === inputs.registrationPrice && adoption === inputs.bnplAdoptionPercent;

  return (
    <div className="p-5 space-y-4">
      {feeRow === null && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          No active fee configuration for the selected provider/region. Matrix outputs will show $0.
        </div>
      )}
      <p className="text-xs text-gray-500 leading-relaxed">
        Net Commercial Impact across registration price points and BNPL adoption rates.
        Uses current provider fee configuration, conversion uplift ({inputs.conversionUpliftPercent}%), contribution margin ({inputs.contributionMarginPercent}%), and standard card rate ({inputs.standardCardFeePercent}%).
        Current inputs are highlighted with a blue border.
      </p>
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-2.5 text-left text-gray-500 font-semibold uppercase tracking-wide whitespace-nowrap">
                Price \ Adoption
              </th>
              {ADOPTION_COLS.map(a => (
                <th
                  key={a}
                  className={`px-4 py-2.5 text-center font-semibold uppercase tracking-wide whitespace-nowrap ${
                    a === inputs.bnplAdoptionPercent ? 'text-blue-600' : 'text-gray-500'
                  }`}
                >
                  {a}% Adoption{a === inputs.bnplAdoptionPercent ? ' ★' : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {PRICE_ROWS.map((price, ri) => (
              <tr key={price}>
                <td className={`px-4 py-2.5 font-semibold whitespace-nowrap ${
                  price === inputs.registrationPrice ? 'text-blue-600' : 'text-gray-600'
                }`}>
                  {fmt(price)}{price === inputs.registrationPrice ? ' ★' : ''}
                </td>
                {ADOPTION_COLS.map((adoption, ci) => {
                  const val = matrixData[ri][ci];
                  const isCurrent = isCurrentCell(price, adoption);
                  // Intensity overlay: map value to 0-1 for positive, separate for negative
                  const normalizedIntensity = (val - minVal) / range;
                  return (
                    <td
                      key={ci}
                      className={`px-4 py-2.5 text-center font-semibold ${cellColor(val)} ${
                        isCurrent ? 'ring-2 ring-blue-400 ring-inset' : ''
                      }`}
                      title={`Price: ${fmt(price)}, Adoption: ${adoption}%, Net Impact: ${fmt(val)}`}
                      style={{ opacity: 0.65 + normalizedIntensity * 0.35 }}
                    >
                      {val >= 0 ? '+' : ''}{fmt(val)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-200" /> Positive (&gt; $500)</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-50 border border-emerald-100" /> Marginally positive</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-50 border border-amber-100" /> Marginally negative</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-50 border border-red-100" /> Negative (&lt; -$500)</span>
        <span className="flex items-center gap-1.5"><span className="inline-block px-1 ring-2 ring-blue-400 ring-inset rounded text-[10px]">★</span> Current inputs</span>
      </div>
    </div>
  );
}

// ─── Composed export ──────────────────────────────────────────────────────────

interface ComparisonViewsProps {
  inputs: CalcInputs;
  feeRow: FeeRow | null;
  activeScenarios: ScenarioPreset[];
  activeRows: FeeRow[];
  config: AppConfig;
}

export default function ComparisonViews({
  inputs,
  feeRow,
  activeScenarios,
  activeRows,
}: ComparisonViewsProps) {
  return (
    <div className="space-y-4">
      <CollapsibleSection
        title="Scenario Comparison"
        subtitle="Side-by-side comparison of all active scenario presets using current provider, fee configuration, and financial assumptions"
        defaultOpen={true}
      >
        <ScenarioComparison inputs={inputs} feeRow={feeRow} activeScenarios={activeScenarios} />
      </CollapsibleSection>

      <CollapsibleSection
        title="Provider Comparison"
        subtitle={`All active providers available for ${inputs.country} — sorted by highest Net Commercial Impact`}
        defaultOpen={true}
      >
        <ProviderComparison inputs={inputs} activeRows={activeRows} />
      </CollapsibleSection>

      <CollapsibleSection
        title="Event Price vs BNPL Adoption Matrix"
        subtitle="Net Commercial Impact across registration price points and BNPL adoption rates — using current provider and assumptions"
        defaultOpen={false}
      >
        <EventEconomicsMatrix inputs={inputs} feeRow={feeRow} />
      </CollapsibleSection>
    </div>
  );
}
