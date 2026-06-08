import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie, Legend,
} from 'recharts';
import {
  TrendingUp, Award, Globe, Plus, Trash2, ChevronDown,
  BarChart2, AlertTriangle, Lightbulb, Users, DollarSign,
  Activity, MapPin, Zap, Download,
} from 'lucide-react';
import type {
  AppConfig, FeeRow, MarketRow, EventPortfolioRow,
  BrandName, RegionName, EventPortfolioType, ConfidenceLevel,
} from './types';
import { BRANDS, ALL_REGIONS, EVENT_PORTFOLIO_TYPES, CONFIDENCE_LEVELS, DEFAULT_CONFIDENCE } from './types';
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

// ─── Opportunity & Rollout helpers ────────────────────────────────────────────

type OpportunityLevel = 'High' | 'Medium' | 'Low';
type RolloutWave = 1 | 2 | 3;

const THRESHOLDS = { high: 50_000, medium: 25_000 };

function opportunityLevel(nci: number): OpportunityLevel {
  if (nci >= THRESHOLDS.high) return 'High';
  if (nci >= THRESHOLDS.medium) return 'Medium';
  return 'Low';
}

// Payback = incrementalCost / netImpact (in years), displayed as months or years
function calcPaybackPeriod(netImpact: number, incrementalCost: number, hasFeeConfig: boolean): string {
  if (!hasFeeConfig) return 'Not Evaluated';
  if (incrementalCost <= 0) return 'Immediate';
  if (netImpact <= 0) return 'Needs Validation';
  const paybackYears = incrementalCost / netImpact;
  if (paybackYears < (1 / 12)) return 'Immediate';
  const months = Math.round(paybackYears * 12);
  if (months <= 12) return `${months} Month${months !== 1 ? 's' : ''}`;
  return `${paybackYears.toFixed(1)} Years`;
}

// Wave 1: High NEB + High/Medium confidence
// Wave 2: Medium NEB + High/Medium confidence
// Wave 3: Low NEB OR Low confidence
function rolloutWave(level: OpportunityLevel, confidence: ConfidenceLevel): RolloutWave {
  if (level === 'High' && (confidence === 'High' || confidence === 'Medium')) return 1;
  if (level === 'Medium' && (confidence === 'High' || confidence === 'Medium')) return 2;
  return 3;
}

const OPPORTUNITY_DOT: Record<OpportunityLevel, string> = { High: '🟢', Medium: '🟡', Low: '🔴' };
const OPPORTUNITY_BADGE: Record<OpportunityLevel, string> = {
  High: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  Medium: 'text-amber-700 bg-amber-50 border-amber-200',
  Low: 'text-red-700 bg-red-50 border-red-200',
};

const CONFIDENCE_BADGE: Record<ConfidenceLevel, string> = {
  High: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  Medium: 'text-amber-700 bg-amber-50 border-amber-200',
  Low: 'text-gray-500 bg-gray-50 border-gray-200',
};

const WAVE_BADGE: Record<RolloutWave, string> = {
  1: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  2: 'bg-blue-100 text-blue-800 border-blue-200',
  3: 'bg-gray-100 text-gray-600 border-gray-200',
};

function paybackBadgeCls(p: string): string {
  if (p === 'Immediate') return 'text-emerald-700 bg-emerald-50';
  if (p === 'Needs Validation') return 'text-amber-700 bg-amber-50';
  if (p === 'Not Evaluated') return 'text-gray-400 bg-gray-50';
  return 'text-blue-700 bg-blue-50'; // X Months / X Years
}

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

// ─── Tooltip component (portal-based, clipping-safe) ─────────────────────────

function InfoTooltip({ content }: { content: React.ReactNode }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const show = useCallback(() => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.top, left: r.left + r.width / 2 });
    }
  }, []);
  const hide = useCallback(() => setPos(null), []);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={e => { e.preventDefault(); e.stopPropagation(); pos ? hide() : show(); }}
        className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-gray-200 text-gray-500 text-[9px] font-bold cursor-help hover:bg-blue-500 hover:text-white transition-colors flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1"
        aria-label="More information"
        tabIndex={0}
      >
        i
      </button>
      {pos !== null && createPortal(
        <div
          role="tooltip"
          style={{
            position: 'fixed',
            top: pos.top - 10,
            left: pos.left,
            transform: 'translate(-50%, -100%)',
            zIndex: 99999,
            maxWidth: 320,
            pointerEvents: 'none',
          }}
          className="bg-gray-900 text-white text-[11px] rounded-xl shadow-2xl px-3.5 py-3 leading-relaxed"
        >
          {content}
          <div
            style={{
              position: 'absolute',
              bottom: -4,
              left: '50%',
              transform: 'translateX(-50%) rotate(45deg)',
              width: 8,
              height: 8,
              background: '#111827',
            }}
          />
        </div>,
        document.body,
      )}
    </>
  );
}

// ─── Tooltip content constants ────────────────────────────────────────────────

const TT_NEB = (
  <div className="space-y-1.5 max-w-[280px]">
    <p className="font-semibold text-white text-xs">Estimated Net Economic Benefit</p>
    <p className="text-gray-300">Estimated incremental contribution generated from BNPL adoption and conversion uplift after estimated BNPL processing costs.</p>
    <div className="bg-gray-800 rounded-lg px-2.5 py-2 mt-1 space-y-0.5">
      <p className="text-gray-400 text-[10px] font-semibold uppercase tracking-wide mb-1">Formula</p>
      <p className="text-gray-200">Incremental Revenue × Margin %</p>
      <p className="text-gray-400 text-[10px]">minus</p>
      <p className="text-gray-200">Incremental BNPL Processing Cost</p>
    </div>
    <p className="text-gray-500 text-[10px] italic">Intended for commercial prioritization only. Does not represent actual realized profit.</p>
  </div>
);

const TT_CONFIDENCE = (
  <div className="space-y-1.5 max-w-[280px]">
    <p className="font-semibold text-white text-xs">Confidence Level</p>
    <p className="text-gray-300">Indicates the reliability of the underlying assumptions used within the model.</p>
    <div className="space-y-2 mt-1">
      <div>
        <p className="text-emerald-400 font-semibold text-[10px] uppercase tracking-wide">High</p>
        <p className="text-gray-300 text-[10px]">Actual provider pricing, actual registration volumes, and proven BNPL market adoption available.</p>
      </div>
      <div>
        <p className="text-amber-400 font-semibold text-[10px] uppercase tracking-wide">Medium</p>
        <p className="text-gray-300 text-[10px]">Actual volumes available. Partial market data; adoption or uplift assumptions modeled.</p>
      </div>
      <div>
        <p className="text-red-400 font-semibold text-[10px] uppercase tracking-wide">Low</p>
        <p className="text-gray-300 text-[10px]">Limited market data. Economics rely primarily on modeled assumptions. Requires validation before investment decisions.</p>
      </div>
    </div>
    <p className="text-gray-500 text-[10px] italic">Intended to support rollout prioritization and governance decisions.</p>
  </div>
);

const TT_PAYBACK = (
  <div className="space-y-1.5 max-w-[280px]">
    <p className="font-semibold text-white text-xs">Payback Period</p>
    <p className="text-gray-300">Estimates how quickly estimated economic benefit offsets incremental BNPL processing costs.</p>
    <div className="bg-gray-800 rounded-lg px-2.5 py-2 mt-1 space-y-0.5">
      <p className="text-gray-400 text-[10px] font-semibold uppercase tracking-wide mb-1">Formula</p>
      <p className="text-gray-200">Incremental Processing Cost ÷ Est. Net Economic Benefit</p>
    </div>
    <div className="space-y-1 mt-1 text-[10px]">
      <p><span className="text-emerald-400 font-semibold">Immediate</span> — Processing cost is zero or negligible</p>
      <p><span className="text-blue-400 font-semibold">X Months</span> — Estimated payback within the year</p>
      <p><span className="text-blue-400 font-semibold">X Years</span> — Extended payback horizon</p>
      <p><span className="text-amber-400 font-semibold">Needs Validation</span> — Net benefit is zero or negative</p>
    </div>
    <p className="text-gray-500 text-[10px] italic">Used for prioritization only. Does not represent actual cash recovery timing.</p>
  </div>
);

const TT_WAVE = (
  <div className="space-y-1.5 max-w-[280px]">
    <p className="font-semibold text-white text-xs">Wave Classification</p>
    <p className="text-gray-300">Recommended rollout sequence based on estimated economic benefit and confidence levels.</p>
    <div className="space-y-2 mt-1">
      <div>
        <p className="text-emerald-400 font-semibold text-[10px] uppercase tracking-wide">Wave 1 — Priority Rollout</p>
        <p className="text-gray-300 text-[10px]">High opportunity (NEB ≥ $50k) and High/Medium confidence.</p>
      </div>
      <div>
        <p className="text-blue-400 font-semibold text-[10px] uppercase tracking-wide">Wave 2 — Selective Pilot</p>
        <p className="text-gray-300 text-[10px]">Medium opportunity (NEB $25k–$50k) and High/Medium confidence.</p>
      </div>
      <div>
        <p className="text-gray-400 font-semibold text-[10px] uppercase tracking-wide">Wave 3 — Deferred</p>
        <p className="text-gray-300 text-[10px]">Low opportunity (NEB &lt; $25k) or Low confidence.</p>
      </div>
    </div>
    <p className="text-gray-500 text-[10px] italic">Intended to guide deployment sequencing and pilot planning.</p>
  </div>
);

const TT_OPPORTUNITY = (
  <div className="space-y-1.5 max-w-[260px]">
    <p className="font-semibold text-white text-xs">Opportunity Level</p>
    <p className="text-gray-300">Determined by Estimated Net Economic Benefit.</p>
    <div className="space-y-1.5 mt-1">
      <div className="flex items-baseline gap-2">
        <span className="text-emerald-400 font-semibold text-[10px] uppercase tracking-wide whitespace-nowrap">High</span>
        <span className="text-gray-300 text-[10px]">NEB greater than $50K</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-amber-400 font-semibold text-[10px] uppercase tracking-wide whitespace-nowrap">Medium</span>
        <span className="text-gray-300 text-[10px]">NEB $25K–$50K</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-red-400 font-semibold text-[10px] uppercase tracking-wide whitespace-nowrap">Low</span>
        <span className="text-gray-300 text-[10px]">NEB less than $25K</span>
      </div>
    </div>
    <p className="text-gray-500 text-[10px] italic">Used to prioritize rollout opportunities across markets.</p>
  </div>
);

const TT_REC_PROVIDER_MIX = (
  <div className="space-y-1.5 max-w-[260px]">
    <p className="font-semibold text-white text-xs">Recommended Provider Mix</p>
    <p className="text-gray-300">The combination of BNPL providers generating the highest estimated portfolio economic benefit under current assumptions.</p>
    <p className="text-gray-500 text-[10px] italic">Model-driven. Should be validated through commercial and operational review.</p>
  </div>
);

const TT_TOP_PROVIDER = (
  <div className="space-y-1.5 max-w-[260px]">
    <p className="font-semibold text-white text-xs">Top Performing Provider</p>
    <p className="text-gray-300">The BNPL provider generating the highest estimated net economic benefit across evaluated markets.</p>
  </div>
);

const TT_TOP_REGION = (
  <div className="space-y-1.5 max-w-[260px]">
    <p className="font-semibold text-white text-xs">Highest Opportunity Region</p>
    <p className="text-gray-300">The region generating the largest estimated economic benefit under current assumptions.</p>
  </div>
);

const TT_BNPL_VOLUME = (
  <div className="space-y-1.5 max-w-[260px]">
    <p className="font-semibold text-white text-xs">BNPL Volume</p>
    <p className="text-gray-300">Estimated registration value expected to be processed through BNPL based on configured adoption assumptions.</p>
    <div className="bg-gray-800 rounded-lg px-2.5 py-2 mt-1">
      <p className="text-gray-400 text-[10px] font-semibold uppercase tracking-wide mb-1">Formula</p>
      <p className="text-gray-200 text-[10px]">Registrations × Average Ticket Price × BNPL Adoption %</p>
    </div>
  </div>
);

const TT_INCR_COST = (
  <div className="space-y-1.5 max-w-[260px]">
    <p className="font-semibold text-white text-xs">Incremental Processing Cost</p>
    <p className="text-gray-300">Additional provider processing expense associated with BNPL adoption compared to current payment methods.</p>
    <p className="text-gray-500 text-[10px] italic">Positive = BNPL costs more than standard card processing. Negative = BNPL is cheaper.</p>
  </div>
);

const TT_INCR_REVENUE = (
  <div className="space-y-1.5 max-w-[260px]">
    <p className="font-semibold text-white text-xs">Incremental Revenue</p>
    <p className="text-gray-300">Estimated additional registration revenue generated from conversion uplift attributed to BNPL availability.</p>
    <div className="bg-gray-800 rounded-lg px-2.5 py-2 mt-1">
      <p className="text-gray-400 text-[10px] font-semibold uppercase tracking-wide mb-1">Formula</p>
      <p className="text-gray-200 text-[10px]">Gross Revenue × Conversion Uplift %</p>
    </div>
  </div>
);

const ROADMAP_TOOLTIPS: Record<string, React.ReactNode> = {
  'Stripe Data': (
    <div className="space-y-1 max-w-[240px]">
      <p className="font-semibold text-white text-xs">Stripe Data Integration</p>
      <p className="text-gray-300 text-[10px]">Future integration of actual Stripe transaction data, processing fees, settlement activity, and BNPL performance metrics.</p>
    </div>
  ),
  'Registration Platform Data': (
    <div className="space-y-1 max-w-[240px]">
      <p className="font-semibold text-white text-xs">Registration Platform Data</p>
      <p className="text-gray-300 text-[10px]">Future integration of Njuko, TicketSocket, and registration platform data for actual registrations and adoption tracking.</p>
    </div>
  ),
  'CRM Data': (
    <div className="space-y-1 max-w-[240px]">
      <p className="font-semibold text-white text-xs">CRM Data Integration</p>
      <p className="text-gray-300 text-[10px]">Future integration of athlete segmentation, behavioral analytics, and historical conversion performance.</p>
    </div>
  ),
  'Event-Level Analytics': (
    <div className="space-y-1 max-w-[240px]">
      <p className="font-semibold text-white text-xs">Event-Level Analytics</p>
      <p className="text-gray-300 text-[10px]">Future integration of event-level reporting, adoption analysis, post-event reconciliation, and actual-versus-modeled performance tracking.</p>
    </div>
  ),
};

// ─── Shared UI ────────────────────────────────────────────────────────────────

const thCls = 'px-3 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap';
const tdCls = 'px-3 py-2.5 text-xs text-gray-700 whitespace-nowrap';
const inputCls = 'w-full px-2.5 py-1.5 text-xs bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900';
const selectCls = inputCls + ' cursor-pointer appearance-none';

type CardColor = 'green' | 'blue' | 'amber' | 'red' | 'default';

function KpiCard({
  label, value, sub, icon: Icon, color = 'default', tooltip,
}: { label: string; value: string; sub?: string; icon?: React.ElementType; color?: CardColor; tooltip?: React.ReactNode }) {
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
        {tooltip && <InfoTooltip content={tooltip} />}
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

// ─── Portfolio Aggregation ────────────────────────────────────────────────────

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

// ─── Executive Insights Panel ─────────────────────────────────────────────────

function InsightsPanel({ agg, filteredMarkets, feeTable }: { agg: PortfolioAgg; filteredMarkets: MarketRow[]; feeTable: FeeRow[] }) {
  const insights = useMemo(() => {
    if (filteredMarkets.length === 0) return [];
    const result: string[] = [];

    // 1. Top region share of NEB
    let topRegion = ''; let topRegionNci = -Infinity;
    agg.regionNciMap.forEach((v, k) => { if (v > topRegionNci) { topRegionNci = v; topRegion = k; } });
    if (topRegion && agg.totalNetImpact !== 0) {
      const share = Math.abs(topRegionNci / agg.totalNetImpact * 100);
      result.push(`${topRegion} represents ${share.toFixed(0)}% of total portfolio Estimated Net Economic Benefit under current assumptions, making it the single largest contributor to portfolio value.`);
    }

    // 2. Best provider
    let topProvider = ''; let topProviderNci = -Infinity;
    agg.providerNciMap.forEach((v, k) => { if (v > topProviderNci) { topProviderNci = v; topProvider = k; } });
    if (topProvider) {
      result.push(`${topProvider} is the highest-performing provider across the filtered portfolio, generating ${fmtCompact(topProviderNci)} in Estimated Net Economic Benefit under current assumptions.`);
    }

    // 3. Wave 1 count
    const wave1Markets = filteredMarkets.filter(m => {
      if (!resolveMarketFeeRow(m, feeTable)) return false;
      return rolloutWave(opportunityLevel(calcMarket(m, feeTable).netImpact), m.confidence ?? 'Low') === 1;
    });
    if (wave1Markets.length > 0) {
      const wave1Regions = [...new Set(wave1Markets.map(m => m.region))];
      result.push(`${wave1Markets.length} market${wave1Markets.length !== 1 ? 's' : ''} across ${wave1Regions.length} region${wave1Regions.length !== 1 ? 's' : ''} qualify for Wave 1 priority rollout — these markets combine High economic opportunity with sufficient confidence to support near-term deployment decisions.`);
    }

    // 4. Confidence distribution
    const lowConf = filteredMarkets.filter(m => m.confidence === 'Low').length;
    const highConf = filteredMarkets.filter(m => m.confidence === 'High').length;
    if (lowConf > 0) {
      const pct = Math.round(lowConf / filteredMarkets.length * 100);
      result.push(`${pct}% of evaluated markets currently rely on low-confidence assumptions and should be validated before investment decisions are finalized.`);
    } else if (highConf === filteredMarkets.length) {
      result.push(`All ${filteredMarkets.length} markets in the filtered view carry High confidence, providing a strong evidential basis for executive decision-making.`);
    } else {
      result.push(`The portfolio spans a mix of confidence levels. High-confidence markets are suitable for immediate decision-making; Medium-confidence markets warrant pilot validation before full deployment.`);
    }

    // 5. Total BNPL volume note
    if (agg.totalBnplVolume > 0) {
      result.push(`Total estimated BNPL volume across the filtered portfolio is ${fmtCompact(agg.totalBnplVolume)}, representing ${fmt(agg.totalBnplVolume / agg.totalGrossRevenue * 100, 'percent')} of gross registration revenue — indicating the scale of payment optionality available to athletes.`);
    }

    return result.slice(0, 5);
  }, [agg, filteredMarkets, feeTable]);

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

  const evaluatedRows = useMemo(() => rows.filter(r => resolveMarketFeeRow(r, feeTable) !== null), [rows, feeTable]);

  const totals = useMemo(() => {
    return evaluatedRows.reduce((acc, row) => {
      const r = calcMarket(row, feeTable);
      return {
        registrations: acc.registrations + row.registrations,
        bnplVolume: acc.bnplVolume + r.bnplVolume,
        bnplProcessingCost: acc.bnplProcessingCost + r.bnplProcessingCost,
        incrementalCost: acc.incrementalCost + r.incrementalCost,
        netImpact: acc.netImpact + r.netImpact,
      };
    }, { registrations: 0, bnplVolume: 0, bnplProcessingCost: 0, incrementalCost: 0, netImpact: 0 });
  }, [evaluatedRows, feeTable]);

  const hasMissingRate = rows.some(row => !resolveMarketFeeRow(row, feeTable));
  const missingCount = rows.length - evaluatedRows.length;

  // Validation: find rows with out-of-range inputs
  const invalidRows = useMemo(() => new Set(rows.filter(r =>
    r.registrations < 0 || r.avgEntryFee < 0 ||
    r.bnplAdoptionPercent < 0 || r.bnplAdoptionPercent > 100 ||
    r.conversionUpliftPercent < 0 ||
    r.contributionMarginPercent < 0 || r.contributionMarginPercent > 100
  ).map(r => r.id)), [rows]);

  return (
    <div className="p-5 space-y-3">
      {hasMissingRate && (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertTriangle size={12} className="flex-shrink-0" />
          {missingCount} row{missingCount !== 1 ? 's are' : ' is'} missing a fee configuration. Those rows show "Not yet evaluated" and are excluded from totals and charts. Add rates in Admin Configuration.
        </div>
      )}
      {invalidRows.size > 0 && (
        <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
          <span><strong>{invalidRows.size} row{invalidRows.size !== 1 ? 's have' : ' has'} out-of-range inputs</strong> (highlighted in red). Check that adoption and margin percentages are between 0–100%, and that registrations, entry fees, and uplift are non-negative.</span>
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Brand', 'Region', 'Provider'].map(h => <th key={h} className={thCls}>{h}</th>)}
              <th className={thCls}><span className="flex items-center gap-1">Confidence <InfoTooltip content={TT_CONFIDENCE} /></span></th>
              {['Registrations', 'Avg Entry Fee', 'BNPL Adoption %', 'Uplift %', 'Margin %'].map(h => <th key={h} className={thCls}>{h}</th>)}
              <th className={thCls}><span className="flex items-center gap-1">BNPL Volume <InfoTooltip content={TT_BNPL_VOLUME} /></span></th>
              <th className={thCls}>BNPL Processing Cost</th>
              <th className={thCls}><span className="flex items-center gap-1">Incr. Processing Cost <InfoTooltip content={TT_INCR_COST} /></span></th>
              <th className={thCls}><span className="flex items-center gap-1">Est. Net Economic Benefit <InfoTooltip content={TT_NEB} /></span></th>
              <th className={thCls}></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={14} className="px-4 py-6 text-center text-xs text-gray-400">
                  No market rows match the current filter. Adjust filters or add a market row below.
                </td>
              </tr>
            ) : rows.map(row => {
              const isInvalid = invalidRows.has(row.id);
              const feeRow = resolveMarketFeeRow(row, feeTable);
              const { bnplVolume, bnplProcessingCost, incrementalCost, netImpact } = calcMarket(row, feeTable);
              const nciColor = netImpact > 500 ? 'text-emerald-700 font-semibold' : netImpact < -500 ? 'text-red-600 font-semibold' : 'text-amber-700 font-semibold';
              return (
                <tr key={row.id} className={`${isInvalid ? 'bg-red-50 border-l-2 border-l-red-400' : 'bg-white hover:bg-gray-50'}`}>
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
                  <td className="px-3 py-2.5">
                    <select
                      className={`${selectCls} w-auto`}
                      value={row.confidence ?? 'Low'}
                      onChange={e => onUpdate(row.id, 'confidence', e.target.value as ConfidenceLevel)}
                    >
                      {CONFIDENCE_LEVELS.map(c => <option key={c}>{c}</option>)}
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
          {evaluatedRows.length > 0 && (
            <tfoot className="bg-gray-50 border-t-2 border-gray-200">
              <tr>
                <td colSpan={4} className="px-3 py-2.5 text-xs font-bold text-gray-700">
                  Portfolio Totals
                  {hasMissingRate && <span className="ml-1.5 text-[10px] font-normal text-amber-600">(evaluated rows only)</span>}
                </td>
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
  const evaluatedRows = useMemo(() => rows.filter(row => {
    const feeRow = feeTable.find(f => f.active && f.country.toLowerCase() === row.region.toLowerCase()) ?? null;
    return feeRow !== null;
  }), [rows, feeTable]);

  const totals = useMemo(() => evaluatedRows.reduce((acc, row) => {
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
  }, { registrations: 0, bnplVolume: 0, incrRevenue: 0, netImpact: 0 }), [evaluatedRows, feeTable]);

  const hasMissingRate = rows.length > evaluatedRows.length;

  const invalidEventRows = useMemo(() => new Set(rows.filter(r =>
    r.registrations < 0 || r.avgTicketPrice < 0 ||
    r.bnplAdoptionPercent < 0 || r.bnplAdoptionPercent > 100 ||
    r.conversionUpliftPercent < 0 ||
    r.contributionMarginPercent < 0 || r.contributionMarginPercent > 100
  ).map(r => r.id)), [rows]);

  return (
    <div className="p-5 space-y-3">
      {hasMissingRate && (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertTriangle size={12} className="flex-shrink-0" />
          {rows.length - evaluatedRows.length} row{rows.length - evaluatedRows.length !== 1 ? 's are' : ' is'} missing fee configuration and excluded from totals.
        </div>
      )}
      {invalidEventRows.size > 0 && (
        <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
          <span><strong>{invalidEventRows.size} row{invalidEventRows.size !== 1 ? 's have' : ' has'} out-of-range inputs</strong> (highlighted in red). Check that adoption and margin percentages are between 0–100%, and that registrations, ticket price, and uplift are non-negative.</span>
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Event Type', 'Region'].map(h => <th key={h} className={thCls}>{h}</th>)}
              <th className={thCls}><span className="flex items-center gap-1">Confidence <InfoTooltip content={TT_CONFIDENCE} /></span></th>
              {['Registrations', 'Avg Ticket Price', 'BNPL Adoption %', 'Uplift %', 'Margin %'].map(h => <th key={h} className={thCls}>{h}</th>)}
              <th className={thCls}><span className="flex items-center gap-1">BNPL Volume <InfoTooltip content={TT_BNPL_VOLUME} /></span></th>
              <th className={thCls}><span className="flex items-center gap-1">Incremental Revenue <InfoTooltip content={TT_INCR_REVENUE} /></span></th>
              <th className={thCls}><span className="flex items-center gap-1">Est. Net Economic Benefit <InfoTooltip content={TT_NEB} /></span></th>
              <th className={thCls}></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-4 py-6 text-center text-xs text-gray-400">
                  No event rows match the current filter.
                </td>
              </tr>
            ) : rows.map(row => {
              const isInvalid = invalidEventRows.has(row.id);
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
                <tr key={row.id} className={`${isInvalid ? 'bg-red-50 border-l-2 border-l-red-400' : 'bg-white hover:bg-gray-50'}`}>
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
                  <td className="px-3 py-2.5">
                    <select
                      className={`${selectCls} w-auto`}
                      value={row.confidence ?? 'Low'}
                      onChange={e => onUpdate(row.id, 'confidence', e.target.value as ConfidenceLevel)}
                    >
                      {CONFIDENCE_LEVELS.map(c => <option key={c}>{c}</option>)}
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
          {evaluatedRows.length > 0 && (
            <tfoot className="bg-gray-50 border-t-2 border-gray-200">
              <tr>
                <td colSpan={3} className="px-3 py-2.5 text-xs font-bold text-gray-700">
                  Portfolio Totals
                  {hasMissingRate && <span className="ml-1.5 text-[10px] font-normal text-amber-600">(evaluated rows only)</span>}
                </td>
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

  // Best provider per region
  const bestByRegion = useMemo(() => {
    const regionMap = new Map<string, Map<string, number>>();
    marketRows.forEach(m => {
      const feeRow = resolveMarketFeeRow(m, feeTable);
      if (!feeRow) return;
      if (!regionMap.has(m.region)) regionMap.set(m.region, new Map());
      const pMap = regionMap.get(m.region)!;
      pMap.set(m.provider, (pMap.get(m.provider) ?? 0) + calcMarket(m, feeTable).netImpact);
    });
    const result: { region: string; provider: string; neb: number }[] = [];
    regionMap.forEach((pMap, region) => {
      let best = '', bestNeb = -Infinity;
      pMap.forEach((neb, p) => { if (neb > bestNeb) { bestNeb = neb; best = p; } });
      if (best) result.push({ region, provider: best, neb: bestNeb });
    });
    return result.sort((a, b) => b.neb - a.neb);
  }, [marketRows, feeTable]);

  // Best provider per brand
  const bestByBrand = useMemo(() => {
    const brandMap = new Map<string, Map<string, number>>();
    marketRows.forEach(m => {
      const feeRow = resolveMarketFeeRow(m, feeTable);
      if (!feeRow) return;
      if (!brandMap.has(m.brand)) brandMap.set(m.brand, new Map());
      const pMap = brandMap.get(m.brand)!;
      pMap.set(m.provider, (pMap.get(m.provider) ?? 0) + calcMarket(m, feeTable).netImpact);
    });
    const result: { brand: string; provider: string; neb: number }[] = [];
    brandMap.forEach((pMap, brand) => {
      let best = '', bestNeb = -Infinity;
      pMap.forEach((neb, p) => { if (neb > bestNeb) { bestNeb = neb; best = p; } });
      if (best) result.push({ brand, provider: best, neb: bestNeb });
    });
    return result.sort((a, b) => b.neb - a.neb);
  }, [marketRows, feeTable]);

  const best = stats.find(s => s.hasData);

  return (
    <div className="p-5 space-y-4">
      {best && (
        <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          <Award size={16} className="text-emerald-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-gray-800 leading-relaxed">
            Based on current assumptions, <strong className="text-emerald-700">{best.provider}</strong> generates the highest Estimated Net Economic Benefit
            {' '}(<strong className="text-emerald-700">{fmtCompact(best.totalNetImpact)}</strong>) across {best.marketCount} configured market{best.marketCount !== 1 ? 's' : ''}.
          </p>
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Provider', 'Regions Enabled', 'Avg Fee %', 'Avg Adoption'].map(h => <th key={h} className={thCls}>{h}</th>)}
              <th className={thCls}><span className="flex items-center gap-1">Total BNPL Volume <InfoTooltip content={TT_BNPL_VOLUME} /></span></th>
              <th className={thCls}>Total BNPL Cost</th>
              <th className={thCls}><span className="flex items-center gap-1">Total Incr. Cost <InfoTooltip content={TT_INCR_COST} /></span></th>
              <th className={thCls}><span className="flex items-center gap-1">Est. Net Economic Benefit <InfoTooltip content={TT_NEB} /></span></th>
              <th className={thCls}>Recommendation</th>
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

      {/* Best provider by region + by brand */}
      {(bestByRegion.length > 0 || bestByBrand.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* By Region */}
          {bestByRegion.length > 0 && (
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                <Globe size={12} className="text-blue-500 flex-shrink-0" />
                <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Best Provider by Region</p>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className={thCls}>Region</th>
                    <th className={thCls}>Recommended Provider</th>
                    <th className={thCls}><span className="flex items-center gap-1">Est. NEB <InfoTooltip content={TT_NEB} /></span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {bestByRegion.map((r, i) => (
                    <tr key={r.region} className={i === 0 ? 'bg-emerald-50' : 'bg-white hover:bg-gray-50'}>
                      <td className="px-3 py-2 text-xs text-gray-700 font-medium whitespace-nowrap">{r.region}</td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {i === 0 && <Award size={10} className="text-emerald-600" />}
                          <span className={`font-semibold ${i === 0 ? 'text-emerald-700' : 'text-gray-700'}`}>{r.provider}</span>
                        </div>
                      </td>
                      <td className={`px-3 py-2 text-xs font-semibold whitespace-nowrap ${r.neb >= THRESHOLDS.medium ? 'text-emerald-700' : r.neb < 0 ? 'text-red-600' : 'text-amber-700'}`}>
                        {r.neb >= 0 ? '+' : ''}{fmtCompact(r.neb)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* By Brand */}
          {bestByBrand.length > 0 && (
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                <Award size={12} className="text-amber-500 flex-shrink-0" />
                <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Best Provider by Brand</p>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className={thCls}>Brand</th>
                    <th className={thCls}>Recommended Provider</th>
                    <th className={thCls}><span className="flex items-center gap-1">Est. NEB <InfoTooltip content={TT_NEB} /></span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {bestByBrand.map((b, i) => (
                    <tr key={b.brand} className={i === 0 ? 'bg-emerald-50' : 'bg-white hover:bg-gray-50'}>
                      <td className="px-3 py-2 text-xs text-gray-700 font-medium whitespace-nowrap">{b.brand}</td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {i === 0 && <Award size={10} className="text-emerald-600" />}
                          <span className={`font-semibold ${i === 0 ? 'text-emerald-700' : 'text-gray-700'}`}>{b.provider}</span>
                        </div>
                      </td>
                      <td className={`px-3 py-2 text-xs font-semibold whitespace-nowrap ${b.neb >= THRESHOLDS.medium ? 'text-emerald-700' : b.neb < 0 ? 'text-red-600' : 'text-amber-700'}`}>
                        {b.neb >= 0 ? '+' : ''}{fmtCompact(b.neb)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Rollout Opportunity Matrix ───────────────────────────────────────────────

function RolloutMatrix({ marketRows, feeTable }: { marketRows: MarketRow[]; feeTable: FeeRow[] }) {
  const regionStats = useMemo(() => {
    const configured = ALL_REGIONS.filter(region => marketRows.some(m => m.region === region));
    return configured.map(region => {
      const rows = marketRows.filter(m => m.region === region);
      let totalNci = 0, totalBnplVolume = 0, totalIncrCost = 0;
      let hasFeeConfig = false;

      rows.forEach(m => {
        const feeRow = resolveMarketFeeRow(m, feeTable);
        if (feeRow) {
          hasFeeConfig = true;
          const r = calcMarket(m, feeTable);
          totalNci += r.netImpact;
          totalBnplVolume += r.bnplVolume;
          totalIncrCost += r.incrementalCost;
        }
      });

      const bestProvider = rows.length > 0
        ? (() => {
            const pMap = new Map<string, number>();
            rows.forEach(m => {
              const feeRow = resolveMarketFeeRow(m, feeTable);
              if (feeRow) pMap.set(m.provider, (pMap.get(m.provider) ?? 0) + calcMarket(m, feeTable).netImpact);
            });
            if (pMap.size === 0) return rows[0].provider;
            let best = rows[0].provider, bestV = -Infinity;
            pMap.forEach((v, k) => { if (v > bestV) { bestV = v; best = k; } });
            return best;
          })()
        : '—';

      // Dominant confidence: pick the most common, or lowest if tie
      const confCounts = { High: 0, Medium: 0, Low: 0 };
      rows.forEach(m => { confCounts[m.confidence ?? 'Low']++; });
      const dominantConf: ConfidenceLevel =
        confCounts.High >= confCounts.Medium && confCounts.High >= confCounts.Low ? 'High' :
        confCounts.Medium >= confCounts.Low ? 'Medium' : 'Low';

      const level = opportunityLevel(totalNci);
      const wave = rolloutWave(level, dominantConf);
      const payback = calcPaybackPeriod(totalNci, totalIncrCost, hasFeeConfig);

      const rec =
        wave === 1 ? 'Priority rollout — strong net economic opportunity' :
        wave === 2 ? 'Selective rollout — validate assumptions with a pilot event' :
        'Deferred rollout — improve confidence through market validation before investment';

      return { region, level, bestProvider, markets: rows.length, totalBnplVolume, totalNci, recommendation: rec, dominantConf, wave, payback, hasFeeConfig };
    }).sort((a, b) => b.totalNci - a.totalNci);
  }, [marketRows, feeTable]);

  if (regionStats.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-gray-400">
        No configured market data. Add market rows above to populate the rollout matrix.
      </div>
    );
  }

  // Group into waves for the wave summary
  const wave1 = regionStats.filter(r => r.wave === 1);
  const wave2 = regionStats.filter(r => r.wave === 2);
  const wave3 = regionStats.filter(r => r.wave === 3);

  return (
    <div className="p-5 space-y-5">
      {/* Wave summary */}
      <div className="grid grid-cols-3 gap-3">
        {([
          { wave: 1, label: 'Wave 1 — Priority Rollout', desc: 'NEB ≥ $50k + High/Medium confidence', items: wave1, cls: 'bg-emerald-50 border-emerald-200' },
          { wave: 2, label: 'Wave 2 — Selective Pilot', desc: 'NEB $25k–$50k + High/Medium confidence', items: wave2, cls: 'bg-blue-50 border-blue-200' },
          { wave: 3, label: 'Wave 3 — Deferred', desc: 'NEB < $25k or Low confidence', items: wave3, cls: 'bg-gray-50 border-gray-200' },
        ] as const).map(({ wave, label, desc, items, cls }) => (
          <div key={wave} className={`rounded-xl border p-3 ${cls}`}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${WAVE_BADGE[wave as RolloutWave]}`}>Wave {wave}</span>
                <InfoTooltip content={TT_WAVE} />
              </div>
              <span className="text-sm font-bold text-gray-800">{items.length} region{items.length !== 1 ? 's' : ''}</span>
            </div>
            <p className="text-[11px] font-semibold text-gray-700 mt-1">{label}</p>
            <p className="text-[10px] text-gray-500 mt-0.5">{desc}</p>
            {items.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {items.map(r => (
                  <span key={r.region} className="text-[10px] px-1.5 py-0.5 bg-white border border-gray-200 rounded text-gray-600 font-medium">{r.region}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Detailed table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className={thCls}>Region</th>
              <th className={thCls}>Rec. Provider</th>
              <th className={thCls}><span className="flex items-center gap-1">Opportunity <InfoTooltip content={TT_OPPORTUNITY} /></span></th>
              <th className={thCls}><span className="flex items-center gap-1">Confidence <InfoTooltip content={TT_CONFIDENCE} /></span></th>
              <th className={thCls}><span className="flex items-center gap-1">Wave <InfoTooltip content={TT_WAVE} /></span></th>
              <th className={thCls}><span className="flex items-center gap-1">Payback Period <InfoTooltip content={TT_PAYBACK} /></span></th>
              <th className={thCls}>Markets</th>
              <th className={thCls}><span className="flex items-center gap-1">Est. BNPL Volume <InfoTooltip content={TT_BNPL_VOLUME} /></span></th>
              <th className={thCls}><span className="flex items-center gap-1">Est. Net Economic Benefit <InfoTooltip content={TT_NEB} /></span></th>
              <th className={thCls}>Recommendation</th>
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
                <td className="px-3 py-2.5">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${CONFIDENCE_BADGE[r.dominantConf]}`}>
                    {r.dominantConf}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border ${WAVE_BADGE[r.wave]}`}>
                    Wave {r.wave}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${paybackBadgeCls(r.payback)}`}>
                    {r.payback}
                  </span>
                </td>
                <td className={tdCls}>{r.markets}</td>
                <td className="px-3 py-2.5 text-xs text-gray-600 font-mono whitespace-nowrap">
                  {r.hasFeeConfig ? fmtCompact(r.totalBnplVolume) : <span className="text-gray-300 italic text-[10px]">Not yet evaluated</span>}
                </td>
                <td className={`px-3 py-2.5 text-xs font-semibold whitespace-nowrap ${r.hasFeeConfig ? (r.totalNci >= THRESHOLDS.medium ? 'text-emerald-700' : r.totalNci < 0 ? 'text-red-600' : 'text-amber-700') : 'text-gray-300'}`}>
                  {r.hasFeeConfig ? `${r.totalNci >= 0 ? '+' : ''}${fmtCompact(r.totalNci)}` : <span className="italic text-[10px]">Not yet evaluated</span>}
                </td>
                <td className="px-3 py-2.5 text-xs text-gray-500 max-w-xs">{r.recommendation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-gray-400">
        Only regions with configured market data are shown. High: NEB ≥ $50k · Medium: $25k–$50k · Low: Below $25k · Wave classification: Wave 1 = High + High/Medium confidence; Wave 2 = Medium + High/Medium confidence; Wave 3 = Low NEB or Low confidence.
      </p>
    </div>
  );
}

// ─── Portfolio Charts ─────────────────────────────────────────────────────────

function PortfolioCharts({
  filteredMarkets, filteredEvents, feeTable,
}: { filteredMarkets: MarketRow[]; filteredEvents: EventPortfolioRow[]; feeTable: FeeRow[] }) {

  // Only evaluated rows feed charts
  const evaluatedMarkets = useMemo(() => filteredMarkets.filter(m => resolveMarketFeeRow(m, feeTable) !== null), [filteredMarkets, feeTable]);

  const regionImpactData = useMemo(() => {
    const map = new Map<string, number>();
    evaluatedMarkets.forEach(m => { map.set(m.region, (map.get(m.region) ?? 0) + calcMarket(m, feeTable).netImpact); });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [evaluatedMarkets, feeTable]);

  const providerData = useMemo(() => {
    const map = new Map<string, number>();
    evaluatedMarkets.forEach(m => { map.set(m.provider, (map.get(m.provider) ?? 0) + calcMarket(m, feeTable).netImpact); });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [evaluatedMarkets, feeTable]);

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

  const top10Data = useMemo(() => {
    return evaluatedMarkets
      .map(m => ({ name: `${m.region} · ${m.provider}`, value: calcMarket(m, feeTable).netImpact }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [evaluatedMarkets, feeTable]);

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
        {/* A: Est. Net Economic Benefit by Region */}
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">A. Est. Net Economic Benefit by Region <InfoTooltip content={TT_NEB} /></p>
          {regionImpactData.length === 0 ? <ChartEmpty /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={regionImpactData} barCategoryGap="35%" layout="vertical" margin={{ left: 90, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 9, fill: '#9ca3af' }} tickLine={false} axisLine={false} tickFormatter={v => fmtCompact(v as number)} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: '#6b7280' }} tickLine={false} axisLine={false} width={90} />
                <Tooltip formatter={(v: unknown) => [fmtFull(v as number), 'Net Economic Benefit']} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {regionImpactData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* B: Provider Comparison — Est. Net Economic Benefit */}
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">B. Provider Comparison — Est. Net Economic Benefit <InfoTooltip content={TT_NEB} /></p>
          {providerData.length === 0 ? <ChartEmpty /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={providerData} barCategoryGap="40%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} tickLine={false} axisLine={false} tickFormatter={v => fmtCompact(v as number)} />
                <Tooltip formatter={(v: unknown) => [fmtFull(v as number), 'Net Economic Benefit']} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {providerData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* C: Average BNPL Adoption by Region */}
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
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">E. Top 10 Rollout Opportunities — Est. Net Economic Benefit <InfoTooltip content={TT_NEB} /></p>
        {top10Data.length === 0 ? <ChartEmpty /> : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={top10Data} barCategoryGap="30%" layout="vertical" margin={{ left: 160, right: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 9, fill: '#9ca3af' }} tickLine={false} axisLine={false} tickFormatter={v => fmtCompact(v as number)} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: '#6b7280' }} tickLine={false} axisLine={false} width={160} />
              <Tooltip formatter={(v: unknown) => [fmtFull(v as number), 'Net Economic Benefit']} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
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

// ─── CSV Export ───────────────────────────────────────────────────────────────

function exportPortfolioCsv(marketRows: MarketRow[], eventRows: EventPortfolioRow[], feeTable: FeeRow[]) {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const dateTimeStr = `${dateStr} ${now.toTimeString().slice(0, 5)}`;

  const rows: string[][] = [
    ['IRONMAN BNPL Portfolio Opportunity Dashboard'],
    ['Generated On', dateTimeStr],
    [''],
    ['MARKET COMPARISON'],
    ['Brand', 'Region', 'Provider', 'Confidence', 'Registrations', 'Avg Entry Fee', 'BNPL Adoption %', 'Conversion Uplift %', 'Margin %', 'BNPL Volume', 'BNPL Processing Cost', 'Incr. Processing Cost', 'Est. Net Economic Benefit', 'Opportunity Level', 'Payback Period', 'Rollout Wave'],
  ];

  marketRows.forEach(m => {
    const feeRow = resolveMarketFeeRow(m, feeTable);
    const { bnplVolume, bnplProcessingCost, incrementalCost, netImpact } = calcMarket(m, feeTable);
    const level = feeRow ? opportunityLevel(netImpact) : null;
    const payback = feeRow ? calcPaybackPeriod(netImpact, incrementalCost, true) : 'Not Yet Evaluated';
    const wave = level ? rolloutWave(level, m.confidence ?? 'Low') : '—';
    rows.push([
      m.brand, m.region, m.provider, m.confidence ?? 'Low',
      String(m.registrations),
      `$${m.avgEntryFee}`,
      `${m.bnplAdoptionPercent}%`,
      `${m.conversionUpliftPercent}%`,
      `${m.contributionMarginPercent}%`,
      feeRow ? fmtFull(bnplVolume) : 'Not Yet Evaluated',
      feeRow ? fmtFull(bnplProcessingCost) : 'Not Yet Evaluated',
      feeRow ? fmtFull(incrementalCost) : 'Not Yet Evaluated',
      feeRow ? fmtFull(netImpact) : 'Not Yet Evaluated',
      level ?? 'Not Yet Evaluated',
      payback,
      feeRow ? `Wave ${wave}` : 'Not Yet Evaluated',
    ]);
  });

  rows.push(['']);
  rows.push(['EVENT PORTFOLIO']);
  rows.push(['Event Type', 'Region', 'Confidence', 'Registrations', 'Avg Ticket Price', 'BNPL Adoption %', 'Conversion Uplift %', 'Margin %', 'BNPL Volume', 'Incremental Revenue', 'Est. Net Economic Benefit']);

  eventRows.forEach(e => {
    const feeRow = feeTable.find(f => f.active && f.country.toLowerCase() === e.region.toLowerCase()) ?? null;
    const { bnplVolume, netImpact } = calcRowImpact(
      e.registrations, e.avgTicketPrice, e.bnplAdoptionPercent,
      e.conversionUpliftPercent, e.contributionMarginPercent,
      e.standardCardFeePercent, e.standardCardFixedFee,
      feeRow, e.applyIntlFee, e.feeAbsorption, e.athleteSurchargePercent,
    );
    const incrRevenue = e.registrations * (e.conversionUpliftPercent / 100) * e.avgTicketPrice;
    rows.push([
      e.eventType, e.region, e.confidence ?? 'Low',
      String(e.registrations),
      `$${e.avgTicketPrice}`,
      `${e.bnplAdoptionPercent}%`,
      `${e.conversionUpliftPercent}%`,
      `${e.contributionMarginPercent}%`,
      feeRow ? fmtFull(bnplVolume) : 'Not Yet Evaluated',
      fmtFull(incrRevenue),
      feeRow ? fmtFull(netImpact) : 'Not Yet Evaluated',
    ]);
  });

  rows.push(
    [''],
    ['MODEL LIMITATIONS'],
    ['This portfolio export is intended for directional executive decision support only. All values are estimates based on user-defined assumptions.'],
    ['Confidence levels reflect user-assigned data quality indicators. Low confidence rows should be independently validated before operational decisions are made.'],
  );

  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `BNPL_Portfolio_Dashboard_${dateStr}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Main Portfolio Dashboard ─────────────────────────────────────────────────

interface PortfolioDashboardProps {
  config: AppConfig;
  onExportCsv?: () => void;
}

export default function PortfolioDashboard({ config, onExportCsv }: PortfolioDashboardProps) {
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

  // ── Portfolio aggregation (evaluated rows only) ──
  const agg = useMemo<PortfolioAgg>(() => {
    const regionNciMap = new Map<string, number>();
    const providerNciMap = new Map<string, number>();
    const providerAdoptionMap = new Map<string, { sum: number; count: number }>();
    const regionAdoptionMap = new Map<string, { sum: number; count: number }>();

    let totalRegistrations = 0, totalGrossRevenue = 0, totalBnplVolume = 0;
    let totalBnplProcessingCost = 0, totalIncrementalCost = 0, totalNetImpact = 0;

    filteredMarkets.forEach(m => {
      const feeRow = resolveMarketFeeRow(m, feeTable);
      if (!feeRow) return;
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
    confidence: DEFAULT_CONFIDENCE['United States'],
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
    confidence: DEFAULT_CONFIDENCE['United States'],
  }]);

  const removeEvent = (id: string) => setEventRows(prev => prev.filter(r => r.id !== id));

  // Expose CSV export function to parent via callback
  const handleExportCsv = useCallback(() => {
    exportPortfolioCsv(filteredMarkets, filteredEvents, feeTable);
  }, [filteredMarkets, filteredEvents, feeTable]);

  useEffect(() => {
    if (onExportCsv) {
      // Store ref so parent can trigger the export
    }
  }, [onExportCsv]);

  // Make export accessible externally by exposing it through a custom event
  useEffect(() => {
    const handler = () => handleExportCsv();
    window.addEventListener('portfolio-export-csv', handler);
    return () => window.removeEventListener('portfolio-export-csv', handler);
  }, [handleExportCsv]);

  const hasData = filteredMarkets.length > 0;
  const evaluatedCount = filteredMarkets.filter(m => resolveMarketFeeRow(m, feeTable) !== null).length;

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
            sub={hasData ? `${evaluatedCount} with fee config · ${[...new Set(filteredMarkets.map(m => m.region))].length} region${[...new Set(filteredMarkets.map(m => m.region))].length !== 1 ? 's' : ''}` : 'Configure market rows'}
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
            value={hasData && agg.totalBnplVolume > 0 ? fmtCompact(agg.totalBnplVolume) : '—'}
            sub={hasData && agg.totalBnplVolume > 0 ? `${fmt(agg.totalBnplVolume / Math.max(agg.totalGrossRevenue, 1) * 100, 'percent')} of gross revenue` : undefined}
            icon={Activity}
            color="blue"
            tooltip={TT_BNPL_VOLUME}
          />
          <KpiCard
            label="Total Incr. Processing Cost"
            value={hasData && agg.totalBnplVolume > 0 ? (agg.totalIncrementalCost >= 0 ? '+' : '') + fmtCompact(agg.totalIncrementalCost) : '—'}
            sub={hasData && agg.totalBnplVolume > 0 ? `BNPL processing cost: ${fmtCompact(agg.totalBnplProcessingCost)}` : undefined}
            icon={DollarSign}
            color={hasData && agg.totalIncrementalCost > 0 ? 'red' : 'default'}
            tooltip={TT_INCR_COST}
          />
          <KpiCard
            label="Est. Net Economic Benefit"
            value={hasData && agg.totalBnplVolume > 0 ? (agg.totalNetImpact >= 0 ? '+' : '') + fmtCompact(agg.totalNetImpact) : '—'}
            sub={hasData && agg.totalBnplVolume > 0 ? 'Portfolio total (evaluated rows)' : 'Configure market rows'}
            icon={TrendingUp}
            color={hasData && agg.totalBnplVolume > 0 ? (agg.totalNetImpact > 0 ? 'green' : agg.totalNetImpact < 0 ? 'red' : 'default') : 'default'}
            tooltip={TT_NEB}
          />
          <KpiCard
            label="Highest Opportunity Region"
            value={hasData ? topRegion.name : '—'}
            sub={hasData && topRegion.value > -Infinity ? fmtCompact(topRegion.value) + ' net benefit' : undefined}
            icon={Globe}
            color="green"
            tooltip={TT_TOP_REGION}
          />
          <KpiCard
            label="Top Performing Provider"
            value={hasData ? topProvider.name : '—'}
            sub={hasData && topProvider.value > -Infinity ? fmtCompact(topProvider.value) + ' net benefit' : undefined}
            icon={Award}
            color="green"
            tooltip={TT_TOP_PROVIDER}
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
            sub={hasData ? 'By highest net benefit' : undefined}
            icon={Zap}
            color="default"
            tooltip={TT_REC_PROVIDER_MIX}
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
      {hasData && <InsightsPanel agg={agg} filteredMarkets={filteredMarkets} feeTable={feeTable} />}

      {/* ── Charts ── */}
      <CollapsiblePanel
        title="Portfolio Charts"
        subtitle="5 dynamic charts: net economic benefit by region, provider comparison, adoption, event distribution, and top rollout opportunities"
        badge="5 Charts"
        defaultOpen={true}
      >
        <PortfolioCharts filteredMarkets={filteredMarkets} filteredEvents={filteredEvents} feeTable={feeTable} />
      </CollapsiblePanel>

      {/* ── Market Comparison ── */}
      <CollapsiblePanel
        title="Market Comparison"
        subtitle="Editable BNPL economics across brands, regions, and providers — includes confidence, payback period, and portfolio totals row"
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
        subtitle="BNPL opportunity by event category and region — includes confidence and portfolio totals row"
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
        subtitle="Aggregated net economic benefit, volume, and executive recommendations by provider"
        defaultOpen={true}
      >
        <ProviderDashboard marketRows={filteredMarkets} feeTable={feeTable} />
      </CollapsiblePanel>

      {/* ── Rollout Matrix ── */}
      <CollapsiblePanel
        title="Rollout Opportunity Matrix"
        subtitle="Executive rollout priority by region — Wave classification, Confidence badges, Payback Period, and only configured regions shown"
        defaultOpen={true}
      >
        <RolloutMatrix marketRows={filteredMarkets} feeTable={feeTable} />
      </CollapsiblePanel>


      {/* ── Export button (inline, bottom of dashboard) ── */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => exportPortfolioCsv(filteredMarkets, filteredEvents, feeTable)}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-all"
        >
          <Download size={13} />
          Export Portfolio CSV
        </button>
      </div>
    </div>
  );
}
