import { useState, useMemo, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie, Legend,
} from 'recharts';
import {
  TrendingUp, Award, Globe, Plus, Trash2, ChevronDown,
  BarChart2, AlertTriangle, Lightbulb, Users, DollarSign,
  Activity, MapPin, Zap,
} from 'lucide-react';
import type {
  AppConfig, FeeRow, MarketRow, EventPortfolioRow,
  BrandName, RegionName, EventPortfolioType,
} from './types';
import { BRANDS, ALL_REGIONS, EVENT_PORTFOLIO_TYPES } from './types';
import { loadMarketRows, saveMarketRows, loadEventRows, saveEventRows, uid } from './config';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number, type: 'currency' | 'percent' | 'number' = 'currency') => {
  if (type === 'currency') return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
  if (type === 'percent') return n.toFixed(1) + '%';
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
};

const fmtCompact = (n: number) => {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}k`;
  return fmt(n);
};

const fmtFull = (n: number) => fmt(n, 'currency');

// ─── Calculation engine (mirrors main calc — no hardcoded values) ─────────────

interface CalcResult {
  bnplVolume: number;
  bnplProcessingCost: number;
  incrementalCost: number;
  netImpact: number;
  grossRevenue: number;
  bnplTxns: number;
}

function calcRowImpact(
  registrations: number,
  price: number,
  adoption: number,
  uplift: number,
  margin: number,
  stdCardPct: number,
  stdCardFixed: number,
  feeRow: FeeRow | null,
  applyIntlFee: boolean,
  feeAbsorption: string,
  athleteSurcharge: number,
): CalcResult {
  const bnplTxns = registrations * (adoption / 100);
  const bnplVolume = bnplTxns * price;
  const grossRevenue = registrations * price;
  const stdCardCost = bnplVolume * (stdCardPct / 100) + bnplTxns * stdCardFixed;

  let bnplProcessingCost = 0;
  if (feeRow) {
    const base = bnplVolume * (feeRow.percentFee / 100) + bnplTxns * feeRow.fixedFee;
    const intl = feeRow.intlFeeApplicable && applyIntlFee ? bnplVolume * (feeRow.intlFeePercent / 100) : 0;
    bnplProcessingCost = base + intl;
  }

  let ironmanCost = bnplProcessingCost;
  if (feeAbsorption === 'Athlete surcharge') {
    ironmanCost = Math.max(0, bnplProcessingCost - bnplVolume * (athleteSurcharge / 100));
  } else if (feeAbsorption === 'Shared absorption') {
    ironmanCost = bnplProcessingCost * 0.5;
  }

  const incrementalCost = ironmanCost - stdCardCost;
  const incrementalContribution = registrations * (uplift / 100) * price * (margin / 100);
  const netImpact = incrementalContribution - incrementalCost;

  return { bnplVolume, bnplProcessingCost, incrementalCost, netImpact, grossRevenue, bnplTxns };
}

function resolveMarketFeeRow(m: MarketRow, feeTable: FeeRow[]): FeeRow | null {
  return feeTable.find(f =>
    f.active &&
    f.provider.toLowerCase() === m.provider.toLowerCase() &&
    f.country.toLowerCase() === m.region.toLowerCase()
  ) ?? null;
}

function calcMarket(m: MarketRow, feeTable: FeeRow[]): CalcResult {
  return calcRowImpact(
    m.registrations, m.avgEntryFee, m.bnplAdoptionPercent,
    m.conversionUpliftPercent, m.contributionMarginPercent,
    m.standardCardFeePercent, m.standardCardFixedFee,
    resolveMarketFeeRow(m, feeTable),
    m.applyIntlFee, m.feeAbsorption, m.athleteSurchargePercent,
  );
}

// ─── Opportunity level ────────────────────────────────────────────────────────

type OpportunityLevel = 'High' | 'Medium' | 'Low';

const THRESHOLDS = { high: 50_000, medium: 25_000 };

function opportunityLevel(nci: number): OpportunityLevel {
  if (nci >= THRESHOLDS.high) return 'High';
  if (nci >= THRESHOLDS.medium) return 'Medium';
  return 'Low';
}

const OPPORTUNITY_DOT: Record<OpportunityLevel, string> = { High: '🟢', Medium: '🟡', Low: '🔴' };
const OPPORTUNITY_BADGE: Record<OpportunityLevel, string> = {
  High: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  Medium: 'text-amber-700 bg-amber-50 border-amber-200',
  Low: 'text-red-700 bg-red-50 border-red-200',
};

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

// ─── Shared UI ────────────────────────────────────────────────────────────────

const thCls = 'px-3 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap';
const tdCls = 'px-3 py-2.5 text-xs text-gray-700 whitespace-nowrap';
const inputCls = 'w-full px-2.5 py-1.5 text-xs bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900';
const selectCls = inputCls + ' cursor-pointer appearance-none';

type CardColor = 'green' | 'blue' | 'amber' | 'red' | 'default';

function KpiCard({
  label, value, sub, icon: Icon, color = 'default',
}: { label: string; value: string; sub?: string; icon?: React.ElementType; color?: CardColor }) {
  const bg: Record<CardColor, string> = {
    green: 'bg-emerald-50 border-emerald-200',
    blue: 'bg-blue-50 border-blue-200',
    amber: 'bg-amber-50 border-amber-200',
    red: 'bg-red-50 border-red-200',
    default: 'bg-white border-gray-200',
  };
  const vc: Record<CardColor, string> = {
    green: 'text-emerald-700',
    blue: 'text-blue-700',
    amber: 'text-amber-700',
    red: 'text-red-700',
    default: 'text-gray-900',
  };
  return (
    <div className={`rounded-xl border p-4 ${bg[color]}`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        {Icon && <Icon size={12} className={`${vc[color]} flex-shrink-0`} />}
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide leading-tight">{label}</p>
      </div>
      <p className={`text-lg font-bold leading-tight ${vc[color]}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{sub}</p>}
    </div>
  );
}

function CollapsiblePanel({
  title, subtitle, defaultOpen = true, badge, children,
}: { title: string; subtitle?: string; defaultOpen?: boolean; badge?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-gray-900 tracking-tight">{title}</p>
              {badge && <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-700 rounded-full">{badge}</span>}
            </div>
            {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        <ChevronDown size={15} className={`text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="border-t border-gray-100">{children}</div>}
    </div>
  );
}

// ─── Global filter bar ────────────────────────────────────────────────────────

const ALL_PROVIDERS_SENTINEL = 'All Providers';

function FilterBar({
  selectedBrand, onBrand,
  selectedRegions, onRegions,
  selectedProvider, onProvider,
  allProviders,
  marketCount, eventCount,
}: {
  selectedBrand: BrandName;
  onBrand: (b: BrandName) => void;
  selectedRegions: RegionName[];
  onRegions: (r: RegionName[]) => void;
  selectedProvider: string;
  onProvider: (p: string) => void;
  allProviders: string[];
  marketCount: number;
  eventCount: number;
}) {
  const [regionOpen, setRegionOpen] = useState(false);
  const allRegionsSelected = selectedRegions.length === ALL_REGIONS.length;

  const toggleRegion = (r: RegionName) =>
    onRegions(selectedRegions.includes(r) ? selectedRegions.filter(x => x !== r) : [...selectedRegions, r]);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 px-5 py-4">
      <div className="flex flex-wrap items-center gap-5">
        {/* Brand */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Brand</span>
          <div className="flex gap-1.5 flex-wrap">
            {BRANDS.map(b => (
              <button
                key={b}
                type="button"
                onClick={() => onBrand(b)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                  selectedBrand === b ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        </div>

        <div className="w-px h-6 bg-gray-200 hidden sm:block" />

        {/* Region */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Region</span>
          <div className="relative">
            <button
              type="button"
              onClick={() => setRegionOpen(o => !o)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold bg-white border border-gray-200 rounded-lg hover:border-blue-400 transition-colors text-gray-700 min-w-[160px] justify-between"
            >
              <span>{allRegionsSelected ? 'All Regions' : selectedRegions.length === 0 ? 'None' : `${selectedRegions.length} Selected`}</span>
              <ChevronDown size={11} className={`text-gray-400 transition-transform flex-shrink-0 ${regionOpen ? 'rotate-180' : ''}`} />
            </button>
            {regionOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setRegionOpen(false)} />
                <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-xl py-1 min-w-[210px]">
                  <button
                    type="button"
                    onClick={() => onRegions(allRegionsSelected ? [] : [...ALL_REGIONS])}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-50 font-semibold text-gray-700"
                  >
                    <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${allRegionsSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                      {allRegionsSelected && <span className="text-white text-[10px]">✓</span>}
                    </span>
                    All Regions
                  </button>
                  <div className="border-t border-gray-100 mt-1 pt-1">
                    {ALL_REGIONS.map(r => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => toggleRegion(r)}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50 text-gray-700"
                      >
                        <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${selectedRegions.includes(r) ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                          {selectedRegions.includes(r) && <span className="text-white text-[10px]">✓</span>}
                        </span>
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="w-px h-6 bg-gray-200 hidden sm:block" />

        {/* Provider */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Provider</span>
          <div className="relative">
            <select
              className="px-3 py-1.5 text-xs font-semibold bg-white border border-gray-200 rounded-lg hover:border-blue-400 transition-colors text-gray-700 cursor-pointer appearance-none pr-7 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={selectedProvider}
              onChange={e => onProvider(e.target.value)}
            >
              <option value={ALL_PROVIDERS_SENTINEL}>All Providers</option>
              {allProviders.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        </div>

        <div className="ml-auto text-xs text-gray-400 font-medium whitespace-nowrap">
          {marketCount} market{marketCount !== 1 ? 's' : ''} · {eventCount} event row{eventCount !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  );
}

// ─── Executive Insights Panel ─────────────────────────────────────────────────

interface PortfolioAgg {
  totalRegistrations: number;
  totalGrossRevenue: number;
  totalBnplVolume: number;
  totalBnplProcessingCost: number;
  totalIncrementalCost: number;
  totalNetImpact: number;
  regionNciMap: Map<string, number>;
  providerNciMap: Map<string, number>;
  providerAdoptionMap: Map<string, { sum: number; count: number }>;
  regionAdoptionMap: Map<string, { sum: number; count: number }>;
}

function InsightsPanel({ agg, filteredMarkets }: { agg: PortfolioAgg; filteredMarkets: MarketRow[] }) {
  const insights = useMemo(() => {
    if (filteredMarkets.length === 0) return [];
    const result: string[] = [];

    // 1. Top region share of NCI
    let topRegion = ''; let topRegionNci = -Infinity;
    agg.regionNciMap.forEach((v, k) => { if (v > topRegionNci) { topRegionNci = v; topRegion = k; } });
    if (topRegion && agg.totalNetImpact !== 0) {
      const share = Math.abs(topRegionNci / agg.totalNetImpact * 100);
      result.push(`${topRegion} currently represents ${share.toFixed(0)}% of total estimated portfolio net commercial impact under current assumptions.`);
    }

    // 2. Best provider
    let topProvider = ''; let topProviderNci = -Infinity;
    agg.providerNciMap.forEach((v, k) => { if (v > topProviderNci) { topProviderNci = v; topProvider = k; } });
    if (topProvider) {
      result.push(`${topProvider} generates the highest estimated portfolio net commercial impact (${fmtCompact(topProviderNci)}) under current assumptions.`);
    }

    // 3. Highest adoption region
    let topAdoptionRegion = ''; let topAdoption = 0;
    agg.regionAdoptionMap.forEach((v, k) => {
      const avg = v.sum / v.count;
      if (avg > topAdoption) { topAdoption = avg; topAdoptionRegion = k; }
    });
    if (topAdoptionRegion) {
      result.push(`${topAdoptionRegion} has the highest expected average BNPL adoption rate at ${topAdoption.toFixed(1)}% across configured markets.`);
    }

    // 4. Provider fee comment (lowest NCI provider if negative)
    let lowestProvider = ''; let lowestNci = Infinity;
    agg.providerNciMap.forEach((v, k) => { if (v < lowestNci && k !== topProvider) { lowestNci = v; lowestProvider = k; } });
    if (lowestProvider && lowestNci < 0) {
      result.push(`${lowestProvider} shows lower estimated portfolio return (${fmtCompact(lowestNci)}) — consider reviewing fee structure or adoption assumptions for markets using this provider.`);
    }

    // 5. Total BNPL volume note
    if (agg.totalBnplVolume > 0) {
      result.push(`Total estimated BNPL volume across the filtered portfolio is ${fmtCompact(agg.totalBnplVolume)}, representing ${fmt(agg.totalBnplVolume / agg.totalGrossRevenue * 100, 'percent')} of total gross registration revenue.`);
    }

    return result.slice(0, 5);
  }, [agg, filteredMarkets]);

  if (insights.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-3">
        <Lightbulb size={14} className="text-amber-500 flex-shrink-0" />
        <p className="text-sm font-bold text-gray-900 tracking-tight">Executive Insights</p>
        <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-bold ml-1">Auto-generated</span>
      </div>
      <ul className="space-y-2.5">
        {insights.map((insight, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
            <p className="text-xs text-gray-700 leading-relaxed">{insight}</p>
          </li>
        ))}
      </ul>
      <p className="text-[10px] text-gray-400 mt-3 italic">Insights are automatically generated from configured market data. All values are estimates based on user-defined assumptions.</p>
    </div>
  );
}

// ─── Market Comparison Table ──────────────────────────────────────────────────

function MarketTable({
  rows, feeTable, onUpdate, onAdd, onRemove,
}: {
  rows: MarketRow[];
  feeTable: FeeRow[];
  onUpdate: (id: string, field: keyof MarketRow, value: unknown) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  const providers = useMemo(() => [...new Set(feeTable.filter(f => f.active).map(f => f.provider))].sort(), [feeTable]);

  const totals = useMemo(() => {
    return rows.reduce((acc, row) => {
      const r = calcMarket(row, feeTable);
      return {
        registrations: acc.registrations + row.registrations,
        bnplVolume: acc.bnplVolume + r.bnplVolume,
        bnplProcessingCost: acc.bnplProcessingCost + r.bnplProcessingCost,
        incrementalCost: acc.incrementalCost + r.incrementalCost,
        netImpact: acc.netImpact + r.netImpact,
      };
    }, { registrations: 0, bnplVolume: 0, bnplProcessingCost: 0, incrementalCost: 0, netImpact: 0 });
  }, [rows, feeTable]);

  const hasMissingRate = rows.some(row => !resolveMarketFeeRow(row, feeTable));

  return (
    <div className="p-5 space-y-3">
      {hasMissingRate && (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertTriangle size={12} className="flex-shrink-0" />
          Some rows are missing a fee configuration for their provider/region combination. Net Impact for those rows shows $0. Add rates in Admin Configuration.
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Brand', 'Region', 'Provider', 'Registrations', 'Avg Entry Fee', 'BNPL Adoption %', 'Uplift %', 'Margin %', 'BNPL Volume', 'BNPL Processing Cost', 'Incr. Processing Cost', 'Net Commercial Impact', ''].map(h => (
                <th key={h} className={thCls}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={13} className="px-4 py-6 text-center text-xs text-gray-400">
                  No market rows match the current filter. Adjust filters or add a market row below.
                </td>
              </tr>
            ) : rows.map(row => {
              const feeRow = resolveMarketFeeRow(row, feeTable);
              const { bnplVolume, bnplProcessingCost, incrementalCost, netImpact } = calcMarket(row, feeTable);
              const nciColor = netImpact > 500 ? 'text-emerald-700 font-semibold' : netImpact < -500 ? 'text-red-600 font-semibold' : 'text-amber-700 font-semibold';
              return (
                <tr key={row.id} className="bg-white hover:bg-gray-50">
                  <td className={tdCls}>
                    <select className={selectCls} value={row.brand} onChange={e => onUpdate(row.id, 'brand', e.target.value as BrandName)}>
                      {BRANDS.filter(b => b !== 'All Brands').map(b => <option key={b}>{b}</option>)}
                    </select>
                  </td>
                  <td className={tdCls}>
                    <select className={selectCls} value={row.region} onChange={e => onUpdate(row.id, 'region', e.target.value as RegionName)}>
                      {ALL_REGIONS.map(r => <option key={r}>{r}</option>)}
                    </select>
                  </td>
                  <td className={tdCls}>
                    <select className={selectCls} value={row.provider} onChange={e => onUpdate(row.id, 'provider', e.target.value)}>
                      {providers.map(p => <option key={p}>{p}</option>)}
                      {!providers.includes(row.provider) && <option>{row.provider}</option>}
                    </select>
                  </td>
                  <td className={tdCls}>
                    <input type="number" className={inputCls} value={row.registrations} min={0} step={100}
                      onChange={e => onUpdate(row.id, 'registrations', parseInt(e.target.value) || 0)} />
                  </td>
                  <td className={tdCls}>
                    <input type="number" className={inputCls} value={row.avgEntryFee} min={0} step={10}
                      onChange={e => onUpdate(row.id, 'avgEntryFee', parseFloat(e.target.value) || 0)} />
                  </td>
                  <td className={tdCls}>
                    <input type="number" className={inputCls} value={row.bnplAdoptionPercent} min={0} max={100} step={0.5}
                      onChange={e => onUpdate(row.id, 'bnplAdoptionPercent', parseFloat(e.target.value) || 0)} />
                  </td>
                  <td className={tdCls}>
                    <input type="number" className={inputCls} value={row.conversionUpliftPercent} min={0} step={0.5}
                      onChange={e => onUpdate(row.id, 'conversionUpliftPercent', parseFloat(e.target.value) || 0)} />
                  </td>
                  <td className={tdCls}>
                    <input type="number" className={inputCls} value={row.contributionMarginPercent} min={0} max={100} step={1}
                      onChange={e => onUpdate(row.id, 'contributionMarginPercent', parseFloat(e.target.value) || 0)} />
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-600 font-mono whitespace-nowrap">
                    {feeRow ? fmtCompact(bnplVolume) : <span className="text-gray-300 italic text-[10px]">Not yet evaluated</span>}
                  </td>
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                    {feeRow ? <span className="text-amber-700 font-semibold">{fmtCompact(bnplProcessingCost)}</span> : <span className="text-gray-300 italic text-[10px]">Not yet evaluated</span>}
                  </td>
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                    {feeRow
                      ? <span className={incrementalCost > 0 ? 'text-red-600 font-semibold' : 'text-emerald-700 font-semibold'}>{incrementalCost >= 0 ? '+' : ''}{fmtCompact(incrementalCost)}</span>
                      : <span className="text-gray-300 italic text-[10px]">Not yet evaluated</span>
                    }
                  </td>
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                    {feeRow
                      ? <span className={nciColor}>{netImpact >= 0 ? '+' : ''}{fmtCompact(netImpact)}</span>
                      : <span className="text-gray-300 italic text-[10px]">Not yet evaluated</span>
                    }
                  </td>
                  <td className="px-2 py-2">
                    <button type="button" onClick={() => onRemove(row.id)} className="p-1 text-gray-300 hover:text-red-500 transition-colors rounded" title="Delete row">
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="bg-gray-50 border-t-2 border-gray-200">
              <tr>
                <td colSpan={3} className="px-3 py-2.5 text-xs font-bold text-gray-700">Portfolio Totals</td>
                <td className="px-3 py-2.5 text-xs font-bold text-gray-800">{fmt(totals.registrations, 'number')}</td>
                <td colSpan={4} />
                <td className="px-3 py-2.5 text-xs font-bold text-gray-800">{fmtCompact(totals.bnplVolume)}</td>
                <td className="px-3 py-2.5 text-xs font-bold text-amber-700">{fmtCompact(totals.bnplProcessingCost)}</td>
                <td className={`px-3 py-2.5 text-xs font-bold ${totals.incrementalCost > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                  {totals.incrementalCost >= 0 ? '+' : ''}{fmtCompact(totals.incrementalCost)}
                </td>
                <td className={`px-3 py-2.5 text-xs font-bold ${totals.netImpact > 0 ? 'text-emerald-700' : totals.netImpact < 0 ? 'text-red-700' : 'text-gray-700'}`}>
                  {totals.netImpact >= 0 ? '+' : ''}{fmtCompact(totals.netImpact)}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <button type="button" onClick={onAdd} className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors">
        <Plus size={13} /> Add Market
      </button>
    </div>
  );
}

// ─── Event Portfolio Table ────────────────────────────────────────────────────

function EventTable({
  rows, feeTable, onUpdate, onAdd, onRemove,
}: {
  rows: EventPortfolioRow[];
  feeTable: FeeRow[];
  onUpdate: (id: string, field: keyof EventPortfolioRow, value: unknown) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  const totals = useMemo(() => rows.reduce((acc, row) => {
    const feeRow = feeTable.find(f => f.active && f.country.toLowerCase() === row.region.toLowerCase()) ?? null;
    const { bnplVolume, netImpact } = calcRowImpact(
      row.registrations, row.avgTicketPrice, row.bnplAdoptionPercent,
      row.conversionUpliftPercent, row.contributionMarginPercent,
      row.standardCardFeePercent, row.standardCardFixedFee,
      feeRow, row.applyIntlFee, row.feeAbsorption, row.athleteSurchargePercent,
    );
    const incrRevenue = row.registrations * (row.conversionUpliftPercent / 100) * row.avgTicketPrice;
    return {
      registrations: acc.registrations + row.registrations,
      bnplVolume: acc.bnplVolume + bnplVolume,
      incrRevenue: acc.incrRevenue + incrRevenue,
      netImpact: acc.netImpact + netImpact,
    };
  }, { registrations: 0, bnplVolume: 0, incrRevenue: 0, netImpact: 0 }), [rows, feeTable]);

  return (
    <div className="p-5 space-y-3">
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Event Type', 'Region', 'Registrations', 'Avg Ticket Price', 'BNPL Adoption %', 'Uplift %', 'Margin %', 'BNPL Volume', 'Incremental Revenue', 'Net Commercial Impact', ''].map(h => (
                <th key={h} className={thCls}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-6 text-center text-xs text-gray-400">
                  No event rows match the current filter.
                </td>
              </tr>
            ) : rows.map(row => {
              const feeRow = feeTable.find(f => f.active && f.country.toLowerCase() === row.region.toLowerCase()) ?? null;
              const { bnplVolume, netImpact } = calcRowImpact(
                row.registrations, row.avgTicketPrice, row.bnplAdoptionPercent,
                row.conversionUpliftPercent, row.contributionMarginPercent,
                row.standardCardFeePercent, row.standardCardFixedFee,
                feeRow, row.applyIntlFee, row.feeAbsorption, row.athleteSurchargePercent,
              );
              const incrRevenue = row.registrations * (row.conversionUpliftPercent / 100) * row.avgTicketPrice;
              const nciColor = netImpact > 500 ? 'text-emerald-700 font-semibold' : netImpact < -500 ? 'text-red-600 font-semibold' : 'text-amber-700 font-semibold';
              return (
                <tr key={row.id} className="bg-white hover:bg-gray-50">
                  <td className={tdCls}>
                    <select className={selectCls} value={row.eventType} onChange={e => onUpdate(row.id, 'eventType', e.target.value as EventPortfolioType)}>
                      {EVENT_PORTFOLIO_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </td>
                  <td className={tdCls}>
                    <select className={selectCls} value={row.region} onChange={e => onUpdate(row.id, 'region', e.target.value as RegionName)}>
                      {ALL_REGIONS.map(r => <option key={r}>{r}</option>)}
                    </select>
                  </td>
                  <td className={tdCls}>
                    <input type="number" className={inputCls} value={row.registrations} min={0} step={100}
                      onChange={e => onUpdate(row.id, 'registrations', parseInt(e.target.value) || 0)} />
                  </td>
                  <td className={tdCls}>
                    <input type="number" className={inputCls} value={row.avgTicketPrice} min={0} step={10}
                      onChange={e => onUpdate(row.id, 'avgTicketPrice', parseFloat(e.target.value) || 0)} />
                  </td>
                  <td className={tdCls}>
                    <input type="number" className={inputCls} value={row.bnplAdoptionPercent} min={0} max={100} step={0.5}
                      onChange={e => onUpdate(row.id, 'bnplAdoptionPercent', parseFloat(e.target.value) || 0)} />
                  </td>
                  <td className={tdCls}>
                    <input type="number" className={inputCls} value={row.conversionUpliftPercent} min={0} step={0.5}
                      onChange={e => onUpdate(row.id, 'conversionUpliftPercent', parseFloat(e.target.value) || 0)} />
                  </td>
                  <td className={tdCls}>
                    <input type="number" className={inputCls} value={row.contributionMarginPercent} min={0} max={100} step={1}
                      onChange={e => onUpdate(row.id, 'contributionMarginPercent', parseFloat(e.target.value) || 0)} />
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-600 font-mono whitespace-nowrap">
                    {feeRow ? fmtCompact(bnplVolume) : <span className="text-gray-300 italic text-[10px]">Not yet evaluated</span>}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-emerald-700 font-semibold whitespace-nowrap">{fmtCompact(incrRevenue)}</td>
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                    {feeRow
                      ? <span className={nciColor}>{netImpact >= 0 ? '+' : ''}{fmtCompact(netImpact)}</span>
                      : <span className="text-gray-300 italic text-[10px]">Not yet evaluated</span>
                    }
                  </td>
                  <td className="px-2 py-2">
                    <button type="button" onClick={() => onRemove(row.id)} className="p-1 text-gray-300 hover:text-red-500 transition-colors rounded" title="Delete row">
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="bg-gray-50 border-t-2 border-gray-200">
              <tr>
                <td colSpan={2} className="px-3 py-2.5 text-xs font-bold text-gray-700">Portfolio Totals</td>
                <td className="px-3 py-2.5 text-xs font-bold text-gray-800">{fmt(totals.registrations, 'number')}</td>
                <td colSpan={4} />
                <td className="px-3 py-2.5 text-xs font-bold text-gray-800">{fmtCompact(totals.bnplVolume)}</td>
                <td className="px-3 py-2.5 text-xs font-bold text-emerald-700">{fmtCompact(totals.incrRevenue)}</td>
                <td className={`px-3 py-2.5 text-xs font-bold ${totals.netImpact > 0 ? 'text-emerald-700' : totals.netImpact < 0 ? 'text-red-700' : 'text-gray-700'}`}>
                  {totals.netImpact >= 0 ? '+' : ''}{fmtCompact(totals.netImpact)}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <button type="button" onClick={onAdd} className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors">
        <Plus size={13} /> Add Event Row
      </button>
    </div>
  );
}

// ─── Provider Comparison Dashboard ───────────────────────────────────────────

function ProviderDashboard({ marketRows, feeTable }: { marketRows: MarketRow[]; feeTable: FeeRow[] }) {
  const providers = useMemo(() => [...new Set(feeTable.filter(f => f.active).map(f => f.provider))].sort(), [feeTable]);

  const stats = useMemo(() => {
    return providers.map(provider => {
      const relevant = marketRows.filter(m => m.provider === provider);
      const feeRows = feeTable.filter(f => f.active && f.provider === provider);
      const avgFeePct = feeRows.length > 0 ? feeRows.reduce((s, f) => s + f.percentFee, 0) / feeRows.length : 0;

      if (relevant.length === 0) {
        return {
          provider,
          regions: feeRows.map(f => f.country).join(', ') || '—',
          avgFeePct,
          avgAdoption: 0,
          totalBnplVolume: 0,
          totalBnplCost: 0,
          totalIncrCost: 0,
          totalNetImpact: 0,
          marketCount: 0,
          recommendation: 'Not yet evaluated',
          hasData: false,
        };
      }

      let totalBnplVolume = 0, totalBnplCost = 0, totalIncrCost = 0, totalNetImpact = 0;
      relevant.forEach(m => {
        const r = calcMarket(m, feeTable);
        totalBnplVolume += r.bnplVolume;
        totalBnplCost += r.bnplProcessingCost;
        totalIncrCost += r.incrementalCost;
        totalNetImpact += r.netImpact;
      });

      const avgAdoption = relevant.reduce((s, m) => s + m.bnplAdoptionPercent, 0) / relevant.length;
      const rec = totalNetImpact >= THRESHOLDS.high ? 'Recommended' : totalNetImpact >= THRESHOLDS.medium ? 'Favorable' : totalNetImpact > 0 ? 'Neutral' : 'Review Required';

      return {
        provider,
        regions: [...new Set(relevant.map(m => m.region))].join(', '),
        avgFeePct, avgAdoption,
        totalBnplVolume, totalBnplCost, totalIncrCost, totalNetImpact,
        marketCount: relevant.length,
        recommendation: rec,
        hasData: true,
      };
    }).sort((a, b) => b.totalNetImpact - a.totalNetImpact);
  }, [providers, marketRows, feeTable]);

  const best = stats.find(s => s.hasData);

  return (
    <div className="p-5 space-y-4">
      {best && (
        <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          <Award size={16} className="text-emerald-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-gray-800 leading-relaxed">
            Based on current assumptions, <strong className="text-emerald-700">{best.provider}</strong> generates the highest estimated portfolio net commercial impact
            {' '}(<strong className="text-emerald-700">{fmtCompact(best.totalNetImpact)}</strong>) across {best.marketCount} configured market{best.marketCount !== 1 ? 's' : ''}.
          </p>
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Provider', 'Regions Enabled', 'Avg Fee %', 'Avg Adoption', 'Total BNPL Volume', 'Total BNPL Cost', 'Total Incr. Cost', 'Net Commercial Impact', 'Recommendation'].map(h => (
                <th key={h} className={thCls}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {stats.map((p, i) => {
              const nciColor = p.totalNetImpact >= THRESHOLDS.medium ? 'text-emerald-700 font-semibold' : p.totalNetImpact < 0 ? 'text-red-600 font-semibold' : 'text-amber-700 font-semibold';
              const recBadge = p.recommendation === 'Recommended' ? 'bg-emerald-100 text-emerald-700' : p.recommendation === 'Favorable' ? 'bg-blue-100 text-blue-700' : p.recommendation === 'Neutral' ? 'bg-amber-100 text-amber-700' : p.recommendation === 'Not yet evaluated' ? 'bg-gray-100 text-gray-500' : 'bg-red-100 text-red-600';
              return (
                <tr key={p.provider} className={i === 0 && p.hasData ? 'bg-emerald-50' : 'bg-white hover:bg-gray-50'}>
                  <td className="px-3 py-2.5 text-xs font-semibold text-gray-800 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      {i === 0 && p.hasData && <Award size={11} className="text-emerald-600" />}
                      {p.provider}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-500 max-w-[180px] truncate">{p.regions || '—'}</td>
                  <td className={tdCls}>{p.avgFeePct.toFixed(2)}%</td>
                  <td className={tdCls}>{p.hasData ? `${p.avgAdoption.toFixed(1)}%` : <span className="text-gray-300 italic">—</span>}</td>
                  <td className={tdCls}>{p.hasData ? fmtCompact(p.totalBnplVolume) : <span className="text-gray-300 italic text-[10px]">Not yet evaluated</span>}</td>
                  <td className={tdCls}>{p.hasData ? <span className="text-amber-700 font-semibold">{fmtCompact(p.totalBnplCost)}</span> : <span className="text-gray-300 italic text-[10px]">Not yet evaluated</span>}</td>
                  <td className={tdCls}>{p.hasData ? <span className={p.totalIncrCost > 0 ? 'text-red-600 font-semibold' : 'text-emerald-700 font-semibold'}>{p.totalIncrCost >= 0 ? '+' : ''}{fmtCompact(p.totalIncrCost)}</span> : <span className="text-gray-300 italic text-[10px]">Not yet evaluated</span>}</td>
                  <td className={tdCls}>{p.hasData ? <span className={nciColor}>{p.totalNetImpact >= 0 ? '+' : ''}{fmtCompact(p.totalNetImpact)}</span> : <span className="text-gray-300 italic text-[10px]">Not yet evaluated</span>}</td>
                  <td className="px-3 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${recBadge}`}>{p.recommendation}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Rollout Opportunity Matrix ───────────────────────────────────────────────

function RolloutMatrix({ marketRows, feeTable }: { marketRows: MarketRow[]; feeTable: FeeRow[] }) {
  const regionStats = useMemo(() => {
    const configured = ALL_REGIONS.filter(region => marketRows.some(m => m.region === region));
    return configured.map(region => {
      const rows = marketRows.filter(m => m.region === region);
      let totalNci = 0, totalBnplVolume = 0;
      rows.forEach(m => {
        const r = calcMarket(m, feeTable);
        totalNci += r.netImpact;
        totalBnplVolume += r.bnplVolume;
      });

      const bestProvider = rows.length > 0
        ? (() => {
            const pMap = new Map<string, number>();
            rows.forEach(m => { pMap.set(m.provider, (pMap.get(m.provider) ?? 0) + calcMarket(m, feeTable).netImpact); });
            let best = rows[0].provider, bestV = -Infinity;
            pMap.forEach((v, k) => { if (v > bestV) { bestV = v; best = k; } });
            return best;
          })()
        : '—';

      const level = opportunityLevel(totalNci);
      const rec =
        level === 'High' ? 'Priority rollout — strong net commercial opportunity' :
        level === 'Medium' ? 'Selective rollout — validate assumptions with a pilot event' :
        'Deferred rollout — monitor market conditions and provider availability';

      return { region, level, bestProvider, markets: rows.length, totalBnplVolume, totalNci, recommendation: rec };
    }).sort((a, b) => b.totalNci - a.totalNci);
  }, [marketRows, feeTable]);

  if (regionStats.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-gray-400">
        No configured market data. Add market rows above to populate the rollout matrix.
      </div>
    );
  }

  return (
    <div className="p-5">
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Region', 'Recommended Provider', 'Opportunity Level', 'Markets', 'Est. BNPL Volume', 'Est. Net Commercial Impact', 'Recommendation'].map(h => (
                <th key={h} className={thCls}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {regionStats.map(r => (
              <tr key={r.region} className="bg-white hover:bg-gray-50">
                <td className="px-3 py-2.5 text-xs font-semibold text-gray-800 whitespace-nowrap">{r.region}</td>
                <td className="px-3 py-2.5 text-xs text-gray-700 whitespace-nowrap">{r.bestProvider}</td>
                <td className="px-3 py-2.5">
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${OPPORTUNITY_BADGE[r.level]}`}>
                    {OPPORTUNITY_DOT[r.level]} {r.level}
                  </span>
                </td>
                <td className={tdCls}>{r.markets}</td>
                <td className="px-3 py-2.5 text-xs text-gray-600 font-mono whitespace-nowrap">{fmtCompact(r.totalBnplVolume)}</td>
                <td className={`px-3 py-2.5 text-xs font-semibold whitespace-nowrap ${r.totalNci >= THRESHOLDS.medium ? 'text-emerald-700' : r.totalNci < 0 ? 'text-red-600' : 'text-amber-700'}`}>
                  {r.totalNci >= 0 ? '+' : ''}{fmtCompact(r.totalNci)}
                </td>
                <td className="px-3 py-2.5 text-xs text-gray-500 max-w-xs">{r.recommendation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-gray-400 mt-2">
        Only regions with configured market data are shown. High: Net Impact ≥ $50k · Medium: $25k–$50k · Low: Below $25k.
      </p>
    </div>
  );
}

// ─── Portfolio Charts (5 charts) ─────────────────────────────────────────────

function PortfolioCharts({
  filteredMarkets, filteredEvents, feeTable,
}: { filteredMarkets: MarketRow[]; filteredEvents: EventPortfolioRow[]; feeTable: FeeRow[] }) {

  const regionImpactData = useMemo(() => {
    const map = new Map<string, number>();
    filteredMarkets.forEach(m => { map.set(m.region, (map.get(m.region) ?? 0) + calcMarket(m, feeTable).netImpact); });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filteredMarkets, feeTable]);

  const providerData = useMemo(() => {
    const map = new Map<string, number>();
    filteredMarkets.forEach(m => { map.set(m.provider, (map.get(m.provider) ?? 0) + calcMarket(m, feeTable).netImpact); });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filteredMarkets, feeTable]);

  const adoptionData = useMemo(() => {
    const map = new Map<string, { sum: number; count: number }>();
    filteredMarkets.forEach(m => {
      const prev = map.get(m.region) ?? { sum: 0, count: 0 };
      map.set(m.region, { sum: prev.sum + m.bnplAdoptionPercent, count: prev.count + 1 });
    });
    return Array.from(map.entries()).map(([name, v]) => ({ name, value: v.sum / v.count })).sort((a, b) => b.value - a.value);
  }, [filteredMarkets]);

  const portfolioDistData = useMemo(() => {
    const map = new Map<string, number>();
    filteredEvents.forEach(e => { map.set(e.eventType, (map.get(e.eventType) ?? 0) + e.registrations * e.avgTicketPrice); });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [filteredEvents]);

  // E. Top 10 rollout opportunities (market rows ranked by NCI)
  const top10Data = useMemo(() => {
    return filteredMarkets
      .map(m => ({ name: `${m.region} · ${m.provider}`, value: calcMarket(m, feeTable).netImpact }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [filteredMarkets, feeTable]);

  const noData = filteredMarkets.length === 0 && filteredEvents.length === 0;

  if (noData) {
    return (
      <div className="p-10 text-center text-sm text-gray-400">
        No data matches the current filter. Adjust brand, region, or provider selection.
      </div>
    );
  }

  const ChartEmpty = () => <p className="text-xs text-gray-400 py-12 text-center">No data for current filter</p>;

  return (
    <div className="p-5 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {/* A: Net Impact by Region */}
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">A. Net Commercial Impact by Region</p>
          {regionImpactData.length === 0 ? <ChartEmpty /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={regionImpactData} barCategoryGap="35%" layout="vertical" margin={{ left: 90, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 9, fill: '#9ca3af' }} tickLine={false} axisLine={false} tickFormatter={v => fmtCompact(v as number)} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: '#6b7280' }} tickLine={false} axisLine={false} width={90} />
                <Tooltip formatter={(v: unknown) => [fmtFull(v as number), 'Net Impact']} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {regionImpactData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* B: Provider Comparison */}
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">B. Provider Comparison — Net Impact</p>
          {providerData.length === 0 ? <ChartEmpty /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={providerData} barCategoryGap="40%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} tickLine={false} axisLine={false} tickFormatter={v => fmtCompact(v as number)} />
                <Tooltip formatter={(v: unknown) => [fmtFull(v as number), 'Net Impact']} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {providerData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* C: Adoption by Region */}
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">C. Average BNPL Adoption by Region</p>
          {adoptionData.length === 0 ? <ChartEmpty /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={adoptionData} barCategoryGap="35%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} tickLine={false} axisLine={false} tickFormatter={v => `${(v as number).toFixed(0)}%`} />
                <Tooltip formatter={(v: unknown) => [`${(v as number).toFixed(1)}%`, 'Avg Adoption']} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {adoptionData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* D: Portfolio Distribution */}
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">D. Portfolio Distribution by Event Type</p>
          {portfolioDistData.length === 0 ? <ChartEmpty /> : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={portfolioDistData} cx="45%" cy="50%" outerRadius={80} dataKey="value" strokeWidth={0}>
                  {portfolioDistData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Legend iconType="circle" iconSize={8} formatter={(v: string) => <span style={{ fontSize: 10, color: '#6b7280' }}>{v}</span>} />
                <Tooltip formatter={(v: unknown) => [fmtCompact(v as number), 'Gross Volume']} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* E: Top 10 Rollout Opportunities — full width */}
      <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">E. Top 10 Rollout Opportunities — Net Commercial Impact</p>
        {top10Data.length === 0 ? <ChartEmpty /> : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={top10Data} barCategoryGap="30%" layout="vertical" margin={{ left: 160, right: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 9, fill: '#9ca3af' }} tickLine={false} axisLine={false} tickFormatter={v => fmtCompact(v as number)} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: '#6b7280' }} tickLine={false} axisLine={false} width={160} />
              <Tooltip formatter={(v: unknown) => [fmtFull(v as number), 'Net Impact']} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {top10Data.map((_, i) => <Cell key={i} fill={i === 0 ? '#10b981' : CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

// ─── Main Portfolio Dashboard ─────────────────────────────────────────────────

interface PortfolioDashboardProps {
  config: AppConfig;
}

export default function PortfolioDashboard({ config }: PortfolioDashboardProps) {
  const [marketRows, setMarketRows] = useState<MarketRow[]>(() => loadMarketRows());
  const [eventRows, setEventRows] = useState<EventPortfolioRow[]>(() => loadEventRows());
  const [selectedBrand, setSelectedBrand] = useState<BrandName>('All Brands');
  const [selectedRegions, setSelectedRegions] = useState<RegionName[]>([...ALL_REGIONS]);
  const [selectedProvider, setSelectedProvider] = useState<string>(ALL_PROVIDERS_SENTINEL);

  useEffect(() => { saveMarketRows(marketRows); }, [marketRows]);
  useEffect(() => { saveEventRows(eventRows); }, [eventRows]);

  const feeTable = config.feeTable;
  const allProviders = useMemo(() => [...new Set(feeTable.filter(f => f.active).map(f => f.provider))].sort(), [feeTable]);

  // ── Filtered views ──
  const filteredMarkets = useMemo(() => marketRows.filter(m =>
    (selectedBrand === 'All Brands' || m.brand === selectedBrand) &&
    selectedRegions.includes(m.region) &&
    (selectedProvider === ALL_PROVIDERS_SENTINEL || m.provider === selectedProvider)
  ), [marketRows, selectedBrand, selectedRegions, selectedProvider]);

  const filteredEvents = useMemo(() => eventRows.filter(e =>
    selectedRegions.includes(e.region)
  ), [eventRows, selectedRegions]);

  // ── Portfolio aggregation engine ──
  const agg = useMemo<PortfolioAgg>(() => {
    const regionNciMap = new Map<string, number>();
    const providerNciMap = new Map<string, number>();
    const providerAdoptionMap = new Map<string, { sum: number; count: number }>();
    const regionAdoptionMap = new Map<string, { sum: number; count: number }>();

    let totalRegistrations = 0, totalGrossRevenue = 0, totalBnplVolume = 0;
    let totalBnplProcessingCost = 0, totalIncrementalCost = 0, totalNetImpact = 0;

    filteredMarkets.forEach(m => {
      const r = calcMarket(m, feeTable);
      totalRegistrations += m.registrations;
      totalGrossRevenue += r.grossRevenue;
      totalBnplVolume += r.bnplVolume;
      totalBnplProcessingCost += r.bnplProcessingCost;
      totalIncrementalCost += r.incrementalCost;
      totalNetImpact += r.netImpact;

      regionNciMap.set(m.region, (regionNciMap.get(m.region) ?? 0) + r.netImpact);
      providerNciMap.set(m.provider, (providerNciMap.get(m.provider) ?? 0) + r.netImpact);

      const pa = providerAdoptionMap.get(m.provider) ?? { sum: 0, count: 0 };
      providerAdoptionMap.set(m.provider, { sum: pa.sum + m.bnplAdoptionPercent, count: pa.count + 1 });

      const ra = regionAdoptionMap.get(m.region) ?? { sum: 0, count: 0 };
      regionAdoptionMap.set(m.region, { sum: ra.sum + m.bnplAdoptionPercent, count: ra.count + 1 });
    });

    return {
      totalRegistrations, totalGrossRevenue, totalBnplVolume,
      totalBnplProcessingCost, totalIncrementalCost, totalNetImpact,
      regionNciMap, providerNciMap, providerAdoptionMap, regionAdoptionMap,
    };
  }, [filteredMarkets, feeTable]);

  // ── KPI derivations ──
  const topRegion = useMemo(() => {
    let best = '—', bestVal = -Infinity;
    agg.regionNciMap.forEach((v, k) => { if (v > bestVal) { bestVal = v; best = k; } });
    return { name: best, value: bestVal };
  }, [agg]);

  const topProvider = useMemo(() => {
    let best = '—', bestVal = -Infinity;
    agg.providerNciMap.forEach((v, k) => { if (v > bestVal) { bestVal = v; best = k; } });
    return { name: best, value: bestVal };
  }, [agg]);

  const highAdoptionRegion = useMemo(() => {
    let best = '—', bestAvg = 0;
    agg.regionAdoptionMap.forEach((v, k) => { const avg = v.sum / v.count; if (avg > bestAvg) { bestAvg = avg; best = k; } });
    return { name: best, avg: bestAvg };
  }, [agg]);

  const recProviderMix = useMemo(() => {
    const sorted = Array.from(agg.providerNciMap.entries()).sort((a, b) => b[1] - a[1]);
    return sorted.length > 0 ? sorted.slice(0, 2).map(([p]) => p).join(' + ') : '—';
  }, [agg]);

  // ── CRUD ──
  const updateMarket = (id: string, field: keyof MarketRow, value: unknown) =>
    setMarketRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));

  const addMarket = () => setMarketRows(prev => [...prev, {
    id: uid(), brand: 'IRONMAN', region: 'United States',
    provider: allProviders[0] ?? 'Affirm',
    registrations: 5000, avgEntryFee: 500,
    bnplAdoptionPercent: 10, conversionUpliftPercent: 3, contributionMarginPercent: 60,
    standardCardFeePercent: 2.70, standardCardFixedFee: 0.30,
    feeAbsorption: 'IRONMAN absorbs BNPL cost', athleteSurchargePercent: 1.5, applyIntlFee: true,
  }]);

  const removeMarket = (id: string) => setMarketRows(prev => prev.filter(r => r.id !== id));

  const updateEvent = (id: string, field: keyof EventPortfolioRow, value: unknown) =>
    setEventRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));

  const addEvent = () => setEventRows(prev => [...prev, {
    id: uid(), eventType: 'IRONMAN Full Distance', region: 'United States',
    registrations: 2000, avgTicketPrice: 900,
    bnplAdoptionPercent: 12, conversionUpliftPercent: 3, contributionMarginPercent: 60,
    standardCardFeePercent: 2.70, standardCardFixedFee: 0.30,
    feeAbsorption: 'IRONMAN absorbs BNPL cost', athleteSurchargePercent: 1.5, applyIntlFee: true,
  }]);

  const removeEvent = (id: string) => setEventRows(prev => prev.filter(r => r.id !== id));

  const hasData = filteredMarkets.length > 0;

  return (
    <div className="max-w-screen-2xl mx-auto px-6 py-6 space-y-5">

      {/* ── Global Filter Bar ── */}
      <FilterBar
        selectedBrand={selectedBrand} onBrand={setSelectedBrand}
        selectedRegions={selectedRegions} onRegions={setSelectedRegions}
        selectedProvider={selectedProvider} onProvider={setSelectedProvider}
        allProviders={allProviders}
        marketCount={filteredMarkets.length}
        eventCount={filteredEvents.length}
      />

      {/* ── Executive KPI Summary ── */}
      <div>
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2.5">Executive Summary — Portfolio KPIs</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiCard
            label="Total Markets Evaluated"
            value={hasData ? fmt(filteredMarkets.length, 'number') : '—'}
            sub={hasData ? `across ${[...new Set(filteredMarkets.map(m => m.region))].length} region${[...new Set(filteredMarkets.map(m => m.region))].length !== 1 ? 's' : ''}` : 'Configure market rows'}
            icon={MapPin}
            color="blue"
          />
          <KpiCard
            label="Total Registrations"
            value={hasData ? fmt(agg.totalRegistrations, 'number') : '—'}
            sub={hasData ? `${fmtCompact(agg.totalGrossRevenue)} gross revenue` : undefined}
            icon={Users}
            color="default"
          />
          <KpiCard
            label="Total BNPL Volume"
            value={hasData ? fmtCompact(agg.totalBnplVolume) : '—'}
            sub={hasData ? `${fmt(agg.totalBnplVolume / Math.max(agg.totalGrossRevenue, 1) * 100, 'percent')} of gross revenue` : undefined}
            icon={Activity}
            color="blue"
          />
          <KpiCard
            label="Total Incr. Processing Cost"
            value={hasData ? (agg.totalIncrementalCost >= 0 ? '+' : '') + fmtCompact(agg.totalIncrementalCost) : '—'}
            sub={hasData ? `BNPL processing cost: ${fmtCompact(agg.totalBnplProcessingCost)}` : undefined}
            icon={DollarSign}
            color={hasData && agg.totalIncrementalCost > 0 ? 'red' : 'default'}
          />
          <KpiCard
            label="Total Net Commercial Impact"
            value={hasData ? (agg.totalNetImpact >= 0 ? '+' : '') + fmtCompact(agg.totalNetImpact) : '—'}
            sub={hasData ? 'Portfolio total (filtered)' : 'Configure market rows'}
            icon={TrendingUp}
            color={hasData ? (agg.totalNetImpact > 0 ? 'green' : agg.totalNetImpact < 0 ? 'red' : 'default') : 'default'}
          />
          <KpiCard
            label="Highest Opportunity Region"
            value={hasData ? topRegion.name : '—'}
            sub={hasData && topRegion.value > -Infinity ? fmtCompact(topRegion.value) + ' net impact' : undefined}
            icon={Globe}
            color="green"
          />
          <KpiCard
            label="Top Performing Provider"
            value={hasData ? topProvider.name : '—'}
            sub={hasData && topProvider.value > -Infinity ? fmtCompact(topProvider.value) + ' net impact' : undefined}
            icon={Award}
            color="green"
          />
          <KpiCard
            label="Highest Adoption Region"
            value={hasData ? highAdoptionRegion.name : '—'}
            sub={hasData ? `${highAdoptionRegion.avg.toFixed(1)}% avg adoption` : undefined}
            icon={BarChart2}
            color="amber"
          />
          <KpiCard
            label="Recommended Provider Mix"
            value={hasData ? recProviderMix : '—'}
            sub={hasData ? 'By highest net impact' : undefined}
            icon={Zap}
            color="default"
          />
          <KpiCard
            label="Total Gross Registration Revenue"
            value={hasData ? fmtCompact(agg.totalGrossRevenue) : '—'}
            sub={hasData ? `${fmt(filteredMarkets.length, 'number')} market${filteredMarkets.length !== 1 ? 's' : ''} included` : undefined}
            icon={DollarSign}
            color="default"
          />
        </div>
      </div>

      {/* ── Executive Insights ── */}
      {hasData && <InsightsPanel agg={agg} filteredMarkets={filteredMarkets} />}

      {/* ── Charts ── */}
      <CollapsiblePanel
        title="Portfolio Charts"
        subtitle="5 dynamic charts: net impact by region, provider comparison, adoption, event distribution, and top rollout opportunities"
        badge="5 Charts"
        defaultOpen={true}
      >
        <PortfolioCharts filteredMarkets={filteredMarkets} filteredEvents={filteredEvents} feeTable={feeTable} />
      </CollapsiblePanel>

      {/* ── Market Comparison ── */}
      <CollapsiblePanel
        title="Market Comparison"
        subtitle="Editable BNPL economics across brands, regions, and providers — includes portfolio totals row"
        badge={`${filteredMarkets.length} rows`}
        defaultOpen={true}
      >
        <MarketTable
          rows={filteredMarkets}
          feeTable={feeTable}
          onUpdate={updateMarket}
          onAdd={addMarket}
          onRemove={removeMarket}
        />
      </CollapsiblePanel>

      {/* ── Event Portfolio ── */}
      <CollapsiblePanel
        title="Event Portfolio View"
        subtitle="BNPL opportunity by event category and region — includes portfolio totals row"
        badge={`${filteredEvents.length} rows`}
        defaultOpen={true}
      >
        <EventTable
          rows={filteredEvents}
          feeTable={feeTable}
          onUpdate={updateEvent}
          onAdd={addEvent}
          onRemove={removeEvent}
        />
      </CollapsiblePanel>

      {/* ── Provider Dashboard ── */}
      <CollapsiblePanel
        title="Provider Comparison Dashboard"
        subtitle="Aggregated net impact, volume, and executive recommendations by provider"
        defaultOpen={true}
      >
        <ProviderDashboard marketRows={filteredMarkets} feeTable={feeTable} />
      </CollapsiblePanel>

      {/* ── Rollout Matrix ── */}
      <CollapsiblePanel
        title="Rollout Opportunity Matrix"
        subtitle="Executive rollout priority by region — only configured regions shown"
        defaultOpen={true}
      >
        <RolloutMatrix marketRows={filteredMarkets} feeTable={feeTable} />
      </CollapsiblePanel>

      {/* ── Future Integration Framework ── */}
      <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Zap size={13} className="text-gray-400" />
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Future Integration Roadmap</p>
          <span className="text-[10px] px-2 py-0.5 bg-gray-200 text-gray-500 rounded-full font-semibold">Informational</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Stripe Data', desc: 'Real-time fee data, actual BNPL transaction volumes, and processing cost reconciliation against configured assumptions.' },
            { label: 'Registration Platform Data', desc: 'Live registration counts, event-level volumes, and BNPL payment method selection rates from the registration platform.' },
            { label: 'CRM Data', desc: 'Athlete segment data, historical BNPL adoption rates, and cohort-level conversion performance over time.' },
            { label: 'Event-Level Analytics', desc: 'Per-event BNPL economics, real-time adoption tracking, post-event reconciliation, and actual vs. modeled comparisons.' },
          ].map(item => (
            <div key={item.label} className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-semibold text-gray-700">{item.label}</p>
                <span className="inline-block text-[9px] px-1.5 py-0.5 bg-gray-200 text-gray-500 rounded-full font-bold">Future Integration</span>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
