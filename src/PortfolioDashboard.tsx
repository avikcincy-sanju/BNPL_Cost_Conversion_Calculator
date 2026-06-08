import { useState, useMemo, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie, Legend,
} from 'recharts';
import {
  TrendingUp, Award, Globe, Plus, Trash2, ChevronDown,
  BarChart2, AlertTriangle,
} from 'lucide-react';
import type {
  AppConfig, FeeRow, MarketRow, EventPortfolioRow,
  BrandName, RegionName, EventPortfolioType,
} from './types';
import {
  BRANDS, ALL_REGIONS, EVENT_PORTFOLIO_TYPES,
} from './types';
import {
  loadMarketRows, saveMarketRows, loadEventRows, saveEventRows, uid,
} from './config';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number, type: 'currency' | 'percent' | 'number' = 'currency') => {
  if (type === 'currency') return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
  if (type === 'percent') return n.toFixed(1) + '%';
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
};

const fmtCompact = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return fmt(n);
};

// ─── Calculation engine (mirrors main calc, no hardcoded values) ──────────────

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
) {
  const bnplTxns = registrations * (adoption / 100);
  const bnplVolume = bnplTxns * price;
  const stdCardCost = bnplVolume * (stdCardPct / 100) + bnplTxns * stdCardFixed;

  let bnplProcessingCost = 0;
  if (feeRow) {
    const base = bnplVolume * (feeRow.percentFee / 100) + bnplTxns * feeRow.fixedFee;
    const intl = feeRow.intlFeeApplicable && applyIntlFee ? bnplVolume * (feeRow.intlFeePercent / 100) : 0;
    bnplProcessingCost = base + intl;
  }

  let ironmanCost = bnplProcessingCost;
  if (feeAbsorption === 'Athlete surcharge') {
    const surchargeRev = bnplVolume * (athleteSurcharge / 100);
    ironmanCost = Math.max(0, bnplProcessingCost - surchargeRev);
  } else if (feeAbsorption === 'Shared absorption') {
    ironmanCost = bnplProcessingCost * 0.5;
  }

  const incrementalCost = ironmanCost - stdCardCost;
  const incrementalRegs = registrations * (uplift / 100);
  const incrementalRevenue = incrementalRegs * price;
  const incrementalContribution = incrementalRevenue * (margin / 100);
  const netImpact = incrementalContribution - incrementalCost;

  return { bnplVolume, incrementalCost, netImpact, bnplTxns };
}

// ─── Opportunity level ────────────────────────────────────────────────────────

type OpportunityLevel = 'High' | 'Medium' | 'Low';

function opportunityLevel(nci: number): OpportunityLevel {
  if (nci > 50_000) return 'High';
  if (nci > 10_000) return 'Medium';
  return 'Low';
}

const OPPORTUNITY_DOT: Record<OpportunityLevel, string> = {
  High: '🟢',
  Medium: '🟡',
  Low: '🔴',
};

const OPPORTUNITY_COLOR: Record<OpportunityLevel, string> = {
  High: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  Medium: 'text-amber-700 bg-amber-50 border-amber-200',
  Low: 'text-red-700 bg-red-50 border-red-200',
};

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

// ─── Shared UI primitives ─────────────────────────────────────────────────────

const thCls = 'px-3 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap';
const tdCls = 'px-3 py-2.5 text-xs text-gray-700 whitespace-nowrap';
const inputCls = 'w-full px-2.5 py-1.5 text-xs bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900';
const selectCls = inputCls + ' cursor-pointer appearance-none';

function SummaryCard({
  label, value, sub, icon: Icon, color = 'default',
}: {
  label: string; value: string; sub?: string; icon?: React.ElementType;
  color?: 'green' | 'blue' | 'amber' | 'default';
}) {
  const bg = { green: 'bg-emerald-50 border-emerald-200', blue: 'bg-blue-50 border-blue-200', amber: 'bg-amber-50 border-amber-200', default: 'bg-white border-gray-200' }[color];
  const vc = { green: 'text-emerald-700', blue: 'text-blue-700', amber: 'text-amber-700', default: 'text-gray-900' }[color];
  return (
    <div className={`rounded-xl border p-4 ${bg}`}>
      <div className="flex items-center gap-1.5 mb-1">
        {Icon && <Icon size={13} className={`${vc} flex-shrink-0`} />}
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      </div>
      <p className={`text-xl font-bold ${vc}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function CollapsiblePanel({
  title, subtitle, defaultOpen = true, children,
}: { title: string; subtitle?: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left"
      >
        <div>
          <p className="text-sm font-bold text-gray-900 tracking-tight">{title}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        <ChevronDown size={15} className={`text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="border-t border-gray-100">{children}</div>}
    </div>
  );
}

// ─── Region multi-select ──────────────────────────────────────────────────────

function RegionSelector({
  selected, onChange,
}: { selected: RegionName[]; onChange: (v: RegionName[]) => void }) {
  const [open, setOpen] = useState(false);
  const allSelected = selected.length === ALL_REGIONS.length;

  const toggle = (r: RegionName) => {
    if (selected.includes(r)) {
      onChange(selected.filter(x => x !== r));
    } else {
      onChange([...selected, r]);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-white border border-gray-200 rounded-lg hover:border-blue-400 transition-colors text-gray-700 min-w-[180px] justify-between"
      >
        <span>{allSelected ? 'All Regions' : selected.length === 0 ? 'Select Regions' : `${selected.length} Region${selected.length > 1 ? 's' : ''}`}</span>
        <ChevronDown size={12} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-xl py-1 min-w-[220px]">
            <button
              type="button"
              onClick={() => { onChange(allSelected ? [] : [...ALL_REGIONS]); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-50 font-semibold text-gray-700"
            >
              <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${allSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                {allSelected && <span className="text-white text-[10px]">✓</span>}
              </span>
              All Regions
            </button>
            <div className="border-t border-gray-100 mt-1 pt-1">
              {ALL_REGIONS.map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => toggle(r)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50 text-gray-700"
                >
                  <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${selected.includes(r) ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                    {selected.includes(r) && <span className="text-white text-[10px]">✓</span>}
                  </span>
                  {r}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Market Comparison Table (editable) ──────────────────────────────────────

function MarketTable({
  rows, feeTable, onUpdate, onAdd, onRemove,
}: {
  rows: MarketRow[];
  feeTable: FeeRow[];
  onUpdate: (id: string, field: keyof MarketRow, value: unknown) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="p-5 space-y-3">
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Brand', 'Region', 'Provider', 'Registrations', 'Avg Entry Fee', 'BNPL Adoption %', 'Uplift %', 'Margin %', 'BNPL Volume', 'Incr. Cost', 'Net Impact', ''].map(h => (
                <th key={h} className={thCls}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(row => {
              const feeRow = feeTable.find(f =>
                f.active &&
                f.provider.toLowerCase() === row.provider.toLowerCase() &&
                f.country.toLowerCase() === row.region.toLowerCase()
              ) ?? null;
              const { bnplVolume, incrementalCost, netImpact } = calcRowImpact(
                row.registrations, row.avgEntryFee, row.bnplAdoptionPercent,
                row.conversionUpliftPercent, row.contributionMarginPercent,
                row.standardCardFeePercent, row.standardCardFixedFee,
                feeRow, row.applyIntlFee, row.feeAbsorption, row.athleteSurchargePercent,
              );
              const nciColor = netImpact > 500 ? 'text-emerald-700 font-semibold' : netImpact < -500 ? 'text-red-600 font-semibold' : 'text-amber-700 font-semibold';
              const providers = [...new Set(feeTable.filter(f => f.active).map(f => f.provider))].sort();
              return (
                <tr key={row.id} className="bg-white hover:bg-gray-50">
                  <td className={tdCls}>
                    <div className="relative">
                      <select className={selectCls} value={row.brand} onChange={e => onUpdate(row.id, 'brand', e.target.value as BrandName)}>
                        {BRANDS.filter(b => b !== 'All Brands').map(b => <option key={b}>{b}</option>)}
                      </select>
                    </div>
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
                  <td className={tdCls + ' font-mono text-gray-600'}>{fmtCompact(bnplVolume)}</td>
                  <td className={tdCls + (incrementalCost > 0 ? ' text-red-600' : ' text-emerald-700')}>
                    {incrementalCost >= 0 ? '+' : ''}{fmtCompact(incrementalCost)}
                  </td>
                  <td className={tdCls}>
                    <span className={nciColor}>{netImpact >= 0 ? '+' : ''}{fmtCompact(netImpact)}</span>
                    {!feeRow && <span className="ml-1 text-[10px] text-red-400 font-semibold">No rate</span>}
                  </td>
                  <td className="px-2 py-2">
                    <button type="button" onClick={() => onRemove(row.id)} className="p-1 text-gray-300 hover:text-red-500 transition-colors rounded">
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
      >
        <Plus size={13} /> Add Market
      </button>
    </div>
  );
}

// ─── Event Portfolio Table (editable) ────────────────────────────────────────

function EventTable({
  rows, feeTable, onUpdate, onAdd, onRemove,
}: {
  rows: EventPortfolioRow[];
  feeTable: FeeRow[];
  onUpdate: (id: string, field: keyof EventPortfolioRow, value: unknown) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="p-5 space-y-3">
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Event Type', 'Region', 'Registrations', 'Avg Ticket Price', 'BNPL Adoption %', 'Uplift %', 'Margin %', 'BNPL Volume', 'Incr. Revenue', 'Net Impact', ''].map(h => (
                <th key={h} className={thCls}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(row => {
              const feeRow = feeTable.find(f =>
                f.active &&
                f.country.toLowerCase() === row.region.toLowerCase()
              ) ?? null;
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
                  <td className={tdCls + ' font-mono text-gray-600'}>{fmtCompact(bnplVolume)}</td>
                  <td className="px-3 py-2.5 text-xs text-emerald-700 font-semibold">{fmtCompact(incrRevenue)}</td>
                  <td className={tdCls}>
                    <span className={nciColor}>{netImpact >= 0 ? '+' : ''}{fmtCompact(netImpact)}</span>
                  </td>
                  <td className="px-2 py-2">
                    <button type="button" onClick={() => onRemove(row.id)} className="p-1 text-gray-300 hover:text-red-500 transition-colors rounded">
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
      >
        <Plus size={13} /> Add Event Row
      </button>
    </div>
  );
}

// ─── Provider Dashboard (derived from fee table + market rows) ────────────────

function ProviderDashboard({
  marketRows, feeTable,
}: { marketRows: MarketRow[]; feeTable: FeeRow[] }) {
  const providers = useMemo(() => [...new Set(feeTable.filter(f => f.active).map(f => f.provider))].sort(), [feeTable]);

  const providerStats = useMemo(() => {
    return providers.map(provider => {
      const relevantRows = marketRows.filter(m => m.provider === provider);
      if (relevantRows.length === 0) {
        // Show with no data
        const feeRows = feeTable.filter(f => f.active && f.provider === provider);
        return {
          provider,
          regions: feeRows.map(f => f.country).join(', ') || '—',
          avgFeePct: feeRows.length > 0 ? feeRows.reduce((s, f) => s + f.percentFee, 0) / feeRows.length : 0,
          estAdoption: 0,
          incrCost: 0,
          netImpact: 0,
          marketCount: 0,
          recommendation: 'No market data' as string,
        };
      }
      const totalNetImpact = relevantRows.reduce((sum, m) => {
        const fr = feeTable.find(f => f.active && f.provider === m.provider && f.country.toLowerCase() === m.region.toLowerCase()) ?? null;
        const { netImpact } = calcRowImpact(m.registrations, m.avgEntryFee, m.bnplAdoptionPercent, m.conversionUpliftPercent, m.contributionMarginPercent, m.standardCardFeePercent, m.standardCardFixedFee, fr, m.applyIntlFee, m.feeAbsorption, m.athleteSurchargePercent);
        return sum + netImpact;
      }, 0);
      const totalCost = relevantRows.reduce((sum, m) => {
        const fr = feeTable.find(f => f.active && f.provider === m.provider && f.country.toLowerCase() === m.region.toLowerCase()) ?? null;
        const { incrementalCost } = calcRowImpact(m.registrations, m.avgEntryFee, m.bnplAdoptionPercent, m.conversionUpliftPercent, m.contributionMarginPercent, m.standardCardFeePercent, m.standardCardFixedFee, fr, m.applyIntlFee, m.feeAbsorption, m.athleteSurchargePercent);
        return sum + incrementalCost;
      }, 0);
      const avgAdoption = relevantRows.reduce((s, m) => s + m.bnplAdoptionPercent, 0) / relevantRows.length;
      const feeRows = feeTable.filter(f => f.active && f.provider === provider);
      const avgFeePct = feeRows.length > 0 ? feeRows.reduce((s, f) => s + f.percentFee, 0) / feeRows.length : 0;
      const rec = totalNetImpact > 50_000 ? 'Recommended' : totalNetImpact > 10_000 ? 'Favorable' : totalNetImpact > 0 ? 'Neutral' : 'Review Required';
      return {
        provider, regions: feeRows.map(f => f.country).join(', '),
        avgFeePct, estAdoption: avgAdoption, incrCost: totalCost, netImpact: totalNetImpact,
        marketCount: relevantRows.length, recommendation: rec,
      };
    }).sort((a, b) => b.netImpact - a.netImpact);
  }, [providers, marketRows, feeTable]);

  const bestProvider = providerStats.length > 0 ? providerStats[0] : null;

  return (
    <div className="p-5 space-y-4">
      {bestProvider && (
        <div className="flex items-start gap-2 text-xs bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5">
          <Award size={13} className="text-emerald-600 flex-shrink-0 mt-0.5" />
          <span>
            <strong className="text-gray-800">Best performing provider across portfolio:</strong>{' '}
            <strong className="text-emerald-700">{bestProvider.provider}</strong>{' '}—{' '}
            Net Impact of <strong className="text-emerald-700">{fmtCompact(bestProvider.netImpact)}</strong> across {bestProvider.marketCount} configured market{bestProvider.marketCount !== 1 ? 's' : ''}.
          </span>
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Provider', 'Regions', 'Avg Fee %', 'Est. Adoption', 'Incr. Cost', 'Net Impact', 'Recommendation'].map(h => (
                <th key={h} className={thCls}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {providerStats.map((p, i) => {
              const nciColor = p.netImpact > 10_000 ? 'text-emerald-700 font-semibold' : p.netImpact < 0 ? 'text-red-600 font-semibold' : 'text-amber-700 font-semibold';
              const recColor = p.recommendation === 'Recommended' ? 'bg-emerald-100 text-emerald-700' : p.recommendation === 'Favorable' ? 'bg-blue-100 text-blue-700' : p.recommendation === 'Neutral' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600';
              return (
                <tr key={p.provider} className={i === 0 ? 'bg-emerald-50' : 'bg-white hover:bg-gray-50'}>
                  <td className="px-3 py-2.5 text-xs font-semibold text-gray-800 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      {i === 0 && <Award size={12} className="text-emerald-600" />}
                      {p.provider}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-500 max-w-[200px] truncate">{p.regions || '—'}</td>
                  <td className={tdCls}>{p.avgFeePct.toFixed(2)}%</td>
                  <td className={tdCls}>{p.estAdoption.toFixed(1)}%</td>
                  <td className={tdCls + (p.incrCost > 0 ? ' text-red-600' : ' text-emerald-700')}>
                    {p.incrCost >= 0 ? '+' : ''}{fmtCompact(p.incrCost)}
                  </td>
                  <td className={tdCls}><span className={nciColor}>{p.netImpact >= 0 ? '+' : ''}{fmtCompact(p.netImpact)}</span></td>
                  <td className="px-3 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${recColor}`}>{p.recommendation}</span>
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
    return ALL_REGIONS.map(region => {
      const rows = marketRows.filter(m => m.region === region);
      if (rows.length === 0) return { region, nci: 0, level: 'Low' as OpportunityLevel, markets: 0, recommendation: 'No data — configure market rows to evaluate' };
      const totalNci = rows.reduce((sum, m) => {
        const fr = feeTable.find(f => f.active && f.provider === m.provider && f.country.toLowerCase() === m.region.toLowerCase()) ?? null;
        const { netImpact } = calcRowImpact(m.registrations, m.avgEntryFee, m.bnplAdoptionPercent, m.conversionUpliftPercent, m.contributionMarginPercent, m.standardCardFeePercent, m.standardCardFixedFee, fr, m.applyIntlFee, m.feeAbsorption, m.athleteSurchargePercent);
        return sum + netImpact;
      }, 0);
      const level = opportunityLevel(totalNci);
      const rec =
        level === 'High' ? 'Priority rollout — strong net commercial opportunity' :
        level === 'Medium' ? 'Selective rollout — validate assumptions with pilot' :
        'Deferred rollout — monitor market conditions';
      return { region, nci: totalNci, level, markets: rows.length, recommendation: rec };
    }).sort((a, b) => b.nci - a.nci);
  }, [marketRows, feeTable]);

  return (
    <div className="p-5">
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Region', 'Opportunity Level', 'Est. Net Impact', 'Markets', 'Recommendation'].map(h => (
                <th key={h} className={thCls}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {regionStats.map(r => (
              <tr key={r.region} className="bg-white hover:bg-gray-50">
                <td className="px-3 py-2.5 text-xs font-semibold text-gray-800 whitespace-nowrap">{r.region}</td>
                <td className="px-3 py-2.5">
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${OPPORTUNITY_COLOR[r.level]}`}>
                    {OPPORTUNITY_DOT[r.level]} {r.level}
                  </span>
                </td>
                <td className={`px-3 py-2.5 text-xs font-semibold ${r.nci > 10_000 ? 'text-emerald-700' : r.nci < 0 ? 'text-red-600' : 'text-amber-700'}`}>
                  {r.nci >= 0 ? '+' : ''}{fmtCompact(r.nci)}
                </td>
                <td className={tdCls}>{r.markets}</td>
                <td className={tdCls + ' text-gray-500 max-w-xs'}>{r.recommendation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Charts section ───────────────────────────────────────────────────────────

function PortfolioCharts({
  filteredMarkets, filteredEvents, feeTable,
}: {
  filteredMarkets: MarketRow[];
  filteredEvents: EventPortfolioRow[];
  feeTable: FeeRow[];
}) {
  // A. Net Impact by Region
  const regionImpactData = useMemo(() => {
    const map = new Map<string, number>();
    filteredMarkets.forEach(m => {
      const fr = feeTable.find(f => f.active && f.provider === m.provider && f.country.toLowerCase() === m.region.toLowerCase()) ?? null;
      const { netImpact } = calcRowImpact(m.registrations, m.avgEntryFee, m.bnplAdoptionPercent, m.conversionUpliftPercent, m.contributionMarginPercent, m.standardCardFeePercent, m.standardCardFixedFee, fr, m.applyIntlFee, m.feeAbsorption, m.athleteSurchargePercent);
      map.set(m.region, (map.get(m.region) ?? 0) + netImpact);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filteredMarkets, feeTable]);

  // B. Provider Comparison
  const providerData = useMemo(() => {
    const map = new Map<string, number>();
    filteredMarkets.forEach(m => {
      const fr = feeTable.find(f => f.active && f.provider === m.provider && f.country.toLowerCase() === m.region.toLowerCase()) ?? null;
      const { netImpact } = calcRowImpact(m.registrations, m.avgEntryFee, m.bnplAdoptionPercent, m.conversionUpliftPercent, m.contributionMarginPercent, m.standardCardFeePercent, m.standardCardFixedFee, fr, m.applyIntlFee, m.feeAbsorption, m.athleteSurchargePercent);
      map.set(m.provider, (map.get(m.provider) ?? 0) + netImpact);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filteredMarkets, feeTable]);

  // C. Adoption Potential by Region
  const adoptionData = useMemo(() => {
    const map = new Map<string, { sum: number; count: number }>();
    filteredMarkets.forEach(m => {
      const prev = map.get(m.region) ?? { sum: 0, count: 0 };
      map.set(m.region, { sum: prev.sum + m.bnplAdoptionPercent, count: prev.count + 1 });
    });
    return Array.from(map.entries()).map(([name, v]) => ({ name, value: v.sum / v.count })).sort((a, b) => b.value - a.value);
  }, [filteredMarkets]);

  // D. Portfolio Distribution (by event type from events table)
  const portfolioDistData = useMemo(() => {
    const map = new Map<string, number>();
    filteredEvents.forEach(e => {
      map.set(e.eventType, (map.get(e.eventType) ?? 0) + (e.registrations * e.avgTicketPrice));
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [filteredEvents]);

  if (filteredMarkets.length === 0 && filteredEvents.length === 0) {
    return (
      <div className="p-10 text-center text-sm text-gray-400">
        No data matches the current filter. Adjust brand or region selection.
      </div>
    );
  }

  return (
    <div className="p-5 grid grid-cols-2 gap-4">
      {/* A */}
      <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Net Commercial Impact by Region</p>
        {regionImpactData.length === 0 ? <p className="text-xs text-gray-400 py-4 text-center">No data</p> : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={regionImpactData} barCategoryGap="35%" layout="vertical" margin={{ left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 9, fill: '#9ca3af' }} tickLine={false} axisLine={false} tickFormatter={v => fmtCompact(v)} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: '#6b7280' }} tickLine={false} axisLine={false} width={80} />
              <Tooltip formatter={(v: unknown) => [fmtCompact(v as number), 'Net Impact']} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {regionImpactData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      {/* B */}
      <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Provider Comparison — Net Impact</p>
        {providerData.length === 0 ? <p className="text-xs text-gray-400 py-4 text-center">No data</p> : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={providerData} barCategoryGap="35%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} tickLine={false} axisLine={false} tickFormatter={v => fmtCompact(v)} />
              <Tooltip formatter={(v: unknown) => [fmtCompact(v as number), 'Net Impact']} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {providerData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      {/* C */}
      <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Avg BNPL Adoption Potential by Region</p>
        {adoptionData.length === 0 ? <p className="text-xs text-gray-400 py-4 text-center">No data</p> : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={adoptionData} barCategoryGap="35%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} tickLine={false} axisLine={false} tickFormatter={v => `${v.toFixed(0)}%`} />
              <Tooltip formatter={(v: unknown) => [`${(v as number).toFixed(1)}%`, 'Avg Adoption']} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {adoptionData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      {/* D */}
      <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Portfolio Distribution by Event Type (Gross Volume)</p>
        {portfolioDistData.length === 0 ? <p className="text-xs text-gray-400 py-4 text-center">No data</p> : (
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={portfolioDistData} cx="45%" cy="50%" outerRadius={75} dataKey="value" strokeWidth={0}>
                {portfolioDistData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Legend iconType="circle" iconSize={8} formatter={(v: string) => <span style={{ fontSize: 10, color: '#6b7280' }}>{v}</span>} />
              <Tooltip formatter={(v: unknown) => [fmtCompact(v as number), 'Gross Volume']} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
            </PieChart>
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

  useEffect(() => { saveMarketRows(marketRows); }, [marketRows]);
  useEffect(() => { saveEventRows(eventRows); }, [eventRows]);

  const feeTable = config.feeTable;
  const activeProviders = useMemo(() => [...new Set(feeTable.filter(f => f.active).map(f => f.provider))].sort(), [feeTable]);

  // Filtered views
  const filteredMarkets = useMemo(() => marketRows.filter(m =>
    (selectedBrand === 'All Brands' || m.brand === selectedBrand) &&
    selectedRegions.includes(m.region)
  ), [marketRows, selectedBrand, selectedRegions]);

  const filteredEvents = useMemo(() => eventRows.filter(e =>
    selectedRegions.includes(e.region)
  ), [eventRows, selectedRegions]);

  // Executive summary derivations
  const regionNciMap = useMemo(() => {
    const map = new Map<string, number>();
    filteredMarkets.forEach(m => {
      const fr = feeTable.find(f => f.active && f.provider === m.provider && f.country.toLowerCase() === m.region.toLowerCase()) ?? null;
      const { netImpact } = calcRowImpact(m.registrations, m.avgEntryFee, m.bnplAdoptionPercent, m.conversionUpliftPercent, m.contributionMarginPercent, m.standardCardFeePercent, m.standardCardFixedFee, fr, m.applyIntlFee, m.feeAbsorption, m.athleteSurchargePercent);
      map.set(m.region, (map.get(m.region) ?? 0) + netImpact);
    });
    return map;
  }, [filteredMarkets, feeTable]);

  const providerNciMap = useMemo(() => {
    const map = new Map<string, number>();
    filteredMarkets.forEach(m => {
      const fr = feeTable.find(f => f.active && f.provider === m.provider && f.country.toLowerCase() === m.region.toLowerCase()) ?? null;
      const { netImpact } = calcRowImpact(m.registrations, m.avgEntryFee, m.bnplAdoptionPercent, m.conversionUpliftPercent, m.contributionMarginPercent, m.standardCardFeePercent, m.standardCardFixedFee, fr, m.applyIntlFee, m.feeAbsorption, m.athleteSurchargePercent);
      map.set(m.provider, (map.get(m.provider) ?? 0) + netImpact);
    });
    return map;
  }, [filteredMarkets, feeTable]);

  const totalNetImpact = useMemo(() => Array.from(regionNciMap.values()).reduce((a, b) => a + b, 0), [regionNciMap]);

  const topRegion = useMemo(() => {
    let best = '—'; let bestVal = -Infinity;
    regionNciMap.forEach((v, k) => { if (v > bestVal) { bestVal = v; best = k; } });
    return { name: best, value: bestVal };
  }, [regionNciMap]);

  const topProvider = useMemo(() => {
    let best = '—'; let bestVal = -Infinity;
    providerNciMap.forEach((v, k) => { if (v > bestVal) { bestVal = v; best = k; } });
    return { name: best, value: bestVal };
  }, [providerNciMap]);

  const highAdoptionRegions = useMemo(() => {
    const map = new Map<string, { sum: number; count: number }>();
    filteredMarkets.forEach(m => {
      const prev = map.get(m.region) ?? { sum: 0, count: 0 };
      map.set(m.region, { sum: prev.sum + m.bnplAdoptionPercent, count: prev.count + 1 });
    });
    return Array.from(map.entries()).map(([region, v]) => ({ region, avg: v.sum / v.count })).sort((a, b) => b.avg - a.avg);
  }, [filteredMarkets]);

  const rolloutPriority = useMemo(() =>
    Array.from(regionNciMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([r]) => r),
    [regionNciMap]
  );

  // CRUD handlers - market rows
  const updateMarket = (id: string, field: keyof MarketRow, value: unknown) => {
    setMarketRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };
  const addMarket = () => {
    setMarketRows(prev => [...prev, {
      id: uid(), brand: 'IRONMAN', region: 'United States',
      provider: activeProviders[0] ?? 'Affirm',
      registrations: 5000, avgEntryFee: 500,
      bnplAdoptionPercent: 10, conversionUpliftPercent: 3, contributionMarginPercent: 60,
      standardCardFeePercent: 2.70, standardCardFixedFee: 0.30,
      feeAbsorption: 'IRONMAN absorbs BNPL cost', athleteSurchargePercent: 1.5, applyIntlFee: true,
    }]);
  };
  const removeMarket = (id: string) => setMarketRows(prev => prev.filter(r => r.id !== id));

  // CRUD handlers - event rows
  const updateEvent = (id: string, field: keyof EventPortfolioRow, value: unknown) => {
    setEventRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };
  const addEvent = () => {
    setEventRows(prev => [...prev, {
      id: uid(), eventType: 'IRONMAN Full Distance', region: 'United States',
      registrations: 2000, avgTicketPrice: 900,
      bnplAdoptionPercent: 12, conversionUpliftPercent: 3, contributionMarginPercent: 60,
      standardCardFeePercent: 2.70, standardCardFixedFee: 0.30,
      feeAbsorption: 'IRONMAN absorbs BNPL cost', athleteSurchargePercent: 1.5, applyIntlFee: true,
    }]);
  };
  const removeEvent = (id: string) => setEventRows(prev => prev.filter(r => r.id !== id));

  return (
    <div className="max-w-screen-2xl mx-auto px-6 py-6 space-y-5">

      {/* ── Filter Bar ── */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Brand</span>
          <div className="flex gap-1.5">
            {BRANDS.map(b => (
              <button
                key={b}
                type="button"
                onClick={() => setSelectedBrand(b)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                  selectedBrand === b
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Region</span>
          <RegionSelector selected={selectedRegions} onChange={setSelectedRegions} />
        </div>
        <div className="ml-auto text-xs text-gray-400 font-medium">
          {filteredMarkets.length} market{filteredMarkets.length !== 1 ? 's' : ''} · {filteredEvents.length} event row{filteredEvents.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* ── Executive Summary Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <SummaryCard
          label="Top Performing Region"
          value={topRegion.name}
          sub={topRegion.value > -Infinity && filteredMarkets.length > 0 ? fmtCompact(topRegion.value) + ' net impact' : 'No data'}
          icon={Globe}
          color="blue"
        />
        <SummaryCard
          label="Top Performing Provider"
          value={topProvider.name}
          sub={topProvider.value > -Infinity && filteredMarkets.length > 0 ? fmtCompact(topProvider.value) + ' net impact' : 'No data'}
          icon={Award}
          color="green"
        />
        <SummaryCard
          label="Highest Net Commercial Impact"
          value={filteredMarkets.length > 0 ? fmtCompact(totalNetImpact) : '—'}
          sub="Portfolio total (filtered)"
          icon={TrendingUp}
          color={totalNetImpact > 0 ? 'green' : 'default'}
        />
        <SummaryCard
          label="Highest Adoption Potential"
          value={highAdoptionRegions[0] ? highAdoptionRegions[0].region : '—'}
          sub={highAdoptionRegions[0] ? `${highAdoptionRegions[0].avg.toFixed(1)}% avg adoption` : 'No data'}
          icon={BarChart2}
          color="amber"
        />
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp size={13} className="text-gray-500 flex-shrink-0" />
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Priority Rollout Markets</p>
          </div>
          {rolloutPriority.length === 0 ? (
            <p className="text-xs text-gray-400 mt-1">No data</p>
          ) : (
            <ol className="space-y-0.5 mt-1">
              {rolloutPriority.map((r, i) => (
                <li key={r} className="text-xs font-semibold text-gray-800">
                  <span className="text-gray-400 font-normal mr-1">{i + 1}.</span>{r}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {/* ── Charts ── */}
      <CollapsiblePanel
        title="Portfolio Charts"
        subtitle="Net impact, provider comparison, adoption potential, and portfolio distribution — updates dynamically with filters"
        defaultOpen={true}
      >
        <PortfolioCharts filteredMarkets={filteredMarkets} filteredEvents={filteredEvents} feeTable={feeTable} />
      </CollapsiblePanel>

      {/* ── Market Comparison Table ── */}
      <CollapsiblePanel
        title="Market Comparison"
        subtitle="Compare BNPL economics across brands, regions, and providers — all rows are editable"
        defaultOpen={true}
      >
        <MarketTable
          rows={filteredMarkets}
          feeTable={feeTable}
          onUpdate={updateMarket}
          onAdd={addMarket}
          onRemove={removeMarket}
        />
        {filteredMarkets.length === 0 && (
          <div className="flex items-center gap-2 px-5 pb-5 text-xs text-amber-700">
            <AlertTriangle size={13} />
            No market rows match the current filter. Adjust brand/region or add a new row.
          </div>
        )}
      </CollapsiblePanel>

      {/* ── Event Portfolio Table ── */}
      <CollapsiblePanel
        title="Event Portfolio View"
        subtitle="BNPL opportunity by event category and region"
        defaultOpen={true}
      >
        <EventTable
          rows={filteredEvents}
          feeTable={feeTable}
          onUpdate={updateEvent}
          onAdd={addEvent}
          onRemove={removeEvent}
        />
        {filteredEvents.length === 0 && (
          <div className="flex items-center gap-2 px-5 pb-5 text-xs text-amber-700">
            <AlertTriangle size={13} />
            No event rows match the current filter.
          </div>
        )}
      </CollapsiblePanel>

      {/* ── Provider Dashboard ── */}
      <CollapsiblePanel
        title="Provider Comparison Dashboard"
        subtitle="Aggregated net impact and recommendations by BNPL provider — sourced from Admin Configuration"
        defaultOpen={true}
      >
        <ProviderDashboard marketRows={filteredMarkets} feeTable={feeTable} />
      </CollapsiblePanel>

      {/* ── Rollout Matrix ── */}
      <CollapsiblePanel
        title="Rollout Opportunity Matrix"
        subtitle="Executive rollout priority ranking by region — derived from configured market data"
        defaultOpen={true}
      >
        <RolloutMatrix marketRows={marketRows} feeTable={feeTable} />
      </CollapsiblePanel>

      {/* ── Future Integration Note ── */}
      <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-5">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Future Integration Framework</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Stripe Data', desc: 'Real-time fee data, actual transaction volumes, and processing cost reconciliation' },
            { label: 'Registration Platform', desc: 'Live registration counts, event-level volumes, and BNPL payment method selection rates' },
            { label: 'CRM Integration', desc: 'Athlete segment data, historical adoption rates, and cohort-level conversion performance' },
            { label: 'Event-Level Data', desc: 'Per-event economics, real-time BNPL adoption tracking, and post-event reconciliation' },
          ].map(item => (
            <div key={item.label} className="space-y-1">
              <p className="text-xs font-semibold text-gray-700">{item.label}</p>
              <p className="text-xs text-gray-400 leading-relaxed">{item.desc}</p>
              <span className="inline-block text-[10px] px-2 py-0.5 bg-gray-200 text-gray-500 rounded-full font-semibold">Framework Ready</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
