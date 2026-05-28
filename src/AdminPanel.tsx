import { useState, useRef } from 'react';
import {
  Plus, Trash2, Upload, Download, RotateCcw, ChevronDown, ChevronUp, AlertCircle,
} from 'lucide-react';
import type { AppConfig, FeeRow, ScenarioPreset, DefaultModelInputs } from './types';
import { STARTER_CONFIG, EVENT_TYPES, FEE_ABSORPTIONS, uid } from './config';

// ─── Shared mini input styles ─────────────────────────────────────────────────
const tc = 'px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white text-gray-900 w-full';
const tcNum = tc + ' text-right';

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${value ? 'bg-blue-600' : 'bg-gray-300'}`}
    >
      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-[18px]' : 'translate-x-[2px]'}`} />
    </button>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({ title, children, badge }: { title: string; children: React.ReactNode; badge?: string }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-200 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">{title}</span>
          {badge && <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full font-medium">{badge}</span>}
        </div>
        {open ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>
      {open && <div className="p-5">{children}</div>}
    </div>
  );
}

// ─── Fee Table Editor ─────────────────────────────────────────────────────────
function FeeTableEditor({
  rows,
  onChange,
}: {
  rows: FeeRow[];
  onChange: (rows: FeeRow[]) => void;
}) {
  const update = (id: string, field: keyof FeeRow, value: FeeRow[keyof FeeRow]) => {
    onChange(rows.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const addRow = () => {
    onChange([...rows, {
      id: uid(),
      provider: '',
      country: '',
      percentFee: 0,
      fixedFee: 0,
      currency: 'USD',
      intlFeeApplicable: false,
      intlFeePercent: 0,
      active: true,
      notes: '',
    }]);
  };

  const removeRow = (id: string) => onChange(rows.filter(r => r.id !== id));

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500 leading-relaxed">
        These are starter defaults based on the May 2026 Stripe Amendment. Every row is fully editable — add, remove, activate, or deactivate any configuration.
      </p>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-xs min-w-[1000px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Provider', 'Region / Country', 'Fee %', 'Fixed Fee', 'Currency', 'Intl Fee?', 'Intl Fee %', 'Active', 'Source / Notes', ''].map(h => (
                <th key={h} className="px-3 py-2 text-left text-gray-500 font-semibold uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(row => (
              <tr key={row.id} className={`${!row.active ? 'bg-gray-50 opacity-60' : 'bg-white'} hover:bg-blue-50/30 transition-colors`}>
                <td className="px-3 py-2"><input className={tc} value={row.provider} onChange={e => update(row.id, 'provider', e.target.value)} placeholder="e.g. Klarna" /></td>
                <td className="px-3 py-2"><input className={tc} value={row.country} onChange={e => update(row.id, 'country', e.target.value)} placeholder="e.g. United States" /></td>
                <td className="px-3 py-2 w-20"><input className={tcNum} type="number" value={row.percentFee} onChange={e => update(row.id, 'percentFee', parseFloat(e.target.value) || 0)} step={0.01} min={0} /></td>
                <td className="px-3 py-2 w-20"><input className={tcNum} type="number" value={row.fixedFee} onChange={e => update(row.id, 'fixedFee', parseFloat(e.target.value) || 0)} step={0.01} min={0} /></td>
                <td className="px-3 py-2 w-16"><input className={tc} value={row.currency} onChange={e => update(row.id, 'currency', e.target.value)} placeholder="USD" maxLength={3} /></td>
                <td className="px-3 py-2 text-center"><Toggle value={row.intlFeeApplicable} onChange={v => update(row.id, 'intlFeeApplicable', v)} /></td>
                <td className="px-3 py-2 w-20"><input className={tcNum} type="number" value={row.intlFeePercent} onChange={e => update(row.id, 'intlFeePercent', parseFloat(e.target.value) || 0)} step={0.1} min={0} disabled={!row.intlFeeApplicable} /></td>
                <td className="px-3 py-2 text-center"><Toggle value={row.active} onChange={v => update(row.id, 'active', v)} /></td>
                <td className="px-3 py-2"><input className={tc} value={row.notes} onChange={e => update(row.id, 'notes', e.target.value)} placeholder="Source / notes" /></td>
                <td className="px-3 py-2">
                  <button type="button" onClick={() => removeRow(row.id)} className="p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors">
                    <Trash2 size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={addRow}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
      >
        <Plus size={12} /> Add Row
      </button>
    </div>
  );
}

// ─── Scenario Editor ──────────────────────────────────────────────────────────
function ScenarioEditor({
  scenarios,
  onChange,
}: {
  scenarios: ScenarioPreset[];
  onChange: (s: ScenarioPreset[]) => void;
}) {
  const update = (id: string, field: keyof ScenarioPreset, value: ScenarioPreset[keyof ScenarioPreset]) => {
    onChange(scenarios.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const addScenario = () => {
    onChange([...scenarios, {
      id: uid(),
      name: 'New Scenario',
      bnplAdoptionPercent: 10,
      conversionUpliftPercent: 2,
      refundRatePercent: 5,
      active: true,
    }]);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">Active scenarios appear as preset buttons in the calculator. Inactive scenarios are hidden.</p>
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Scenario Name', 'BNPL Adoption %', 'Conversion Uplift %', 'Refund Rate %', 'Active', ''].map(h => (
                <th key={h} className="px-3 py-2 text-left text-gray-500 font-semibold uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {scenarios.map(s => (
              <tr key={s.id} className={!s.active ? 'bg-gray-50 opacity-60' : 'bg-white'}>
                <td className="px-3 py-2"><input className={tc} value={s.name} onChange={e => update(s.id, 'name', e.target.value)} /></td>
                <td className="px-3 py-2 w-32"><input className={tcNum} type="number" value={s.bnplAdoptionPercent} onChange={e => update(s.id, 'bnplAdoptionPercent', parseFloat(e.target.value) || 0)} step={0.5} min={0} max={100} /></td>
                <td className="px-3 py-2 w-32"><input className={tcNum} type="number" value={s.conversionUpliftPercent} onChange={e => update(s.id, 'conversionUpliftPercent', parseFloat(e.target.value) || 0)} step={0.5} min={0} /></td>
                <td className="px-3 py-2 w-28"><input className={tcNum} type="number" value={s.refundRatePercent} onChange={e => update(s.id, 'refundRatePercent', parseFloat(e.target.value) || 0)} step={0.5} min={0} max={100} /></td>
                <td className="px-3 py-2"><Toggle value={s.active} onChange={v => update(s.id, 'active', v)} /></td>
                <td className="px-3 py-2">
                  <button type="button" onClick={() => onChange(scenarios.filter(x => x.id !== s.id))} className="p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors">
                    <Trash2 size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={addScenario}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
      >
        <Plus size={12} /> Add Scenario
      </button>
    </div>
  );
}

// ─── Default Inputs Editor ────────────────────────────────────────────────────
function DefaultsEditor({
  defaults,
  availableProviders,
  availableCountries,
  onChange,
}: {
  defaults: DefaultModelInputs;
  availableProviders: string[];
  availableCountries: string[];
  onChange: (d: DefaultModelInputs) => void;
}) {
  const set = <K extends keyof DefaultModelInputs>(key: K, value: DefaultModelInputs[K]) =>
    onChange({ ...defaults, [key]: value });

  const inputCls = 'w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900';
  const selectCls = inputCls + ' cursor-pointer appearance-none';
  const Label = ({ children }: { children: React.ReactNode }) => (
    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{children}</label>
  );

  return (
    <div className="grid grid-cols-3 gap-4">
      <div>
        <Label>Default Region</Label>
        <select className={selectCls} value={defaults.country} onChange={e => set('country', e.target.value)}>
          {availableCountries.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>
      <div>
        <Label>Default Provider</Label>
        <select className={selectCls} value={defaults.provider} onChange={e => set('provider', e.target.value)}>
          {availableProviders.map(p => <option key={p}>{p}</option>)}
        </select>
      </div>
      <div>
        <Label>Default Event Type</Label>
        <select className={selectCls} value={defaults.eventType} onChange={e => set('eventType', e.target.value)}>
          {EVENT_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
      </div>
      <div>
        <Label>Registration Price ($)</Label>
        <input type="number" className={inputCls} value={defaults.registrationPrice} onChange={e => set('registrationPrice', parseFloat(e.target.value) || 0)} min={0} />
      </div>
      <div>
        <Label>Expected Registrations</Label>
        <input type="number" className={inputCls} value={defaults.expectedRegistrations} onChange={e => set('expectedRegistrations', parseInt(e.target.value) || 0)} min={0} />
      </div>
      <div>
        <Label>Standard Card Fee %</Label>
        <input type="number" className={inputCls} value={defaults.standardCardFeePercent} onChange={e => set('standardCardFeePercent', parseFloat(e.target.value) || 0)} step={0.01} min={0} />
      </div>
      <div>
        <Label>Standard Card Fixed Fee ($)</Label>
        <input type="number" className={inputCls} value={defaults.standardCardFixedFee} onChange={e => set('standardCardFixedFee', parseFloat(e.target.value) || 0)} step={0.01} min={0} />
      </div>
      <div>
        <Label>BNPL Adoption %</Label>
        <input type="number" className={inputCls} value={defaults.bnplAdoptionPercent} onChange={e => set('bnplAdoptionPercent', parseFloat(e.target.value) || 0)} step={0.5} min={0} max={100} />
      </div>
      <div>
        <Label>Conversion Uplift %</Label>
        <input type="number" className={inputCls} value={defaults.conversionUpliftPercent} onChange={e => set('conversionUpliftPercent', parseFloat(e.target.value) || 0)} step={0.5} min={0} />
      </div>
      <div>
        <Label>Contribution Margin %</Label>
        <input type="number" className={inputCls} value={defaults.contributionMarginPercent} onChange={e => set('contributionMarginPercent', parseFloat(e.target.value) || 0)} step={1} min={0} max={100} />
      </div>
      <div>
        <Label>Refund Rate %</Label>
        <input type="number" className={inputCls} value={defaults.refundRatePercent} onChange={e => set('refundRatePercent', parseFloat(e.target.value) || 0)} step={0.5} min={0} max={100} />
      </div>
      <div>
        <Label>Avg Refund Amount %</Label>
        <input type="number" className={inputCls} value={defaults.avgRefundAmountPercent} onChange={e => set('avgRefundAmountPercent', parseFloat(e.target.value) || 0)} step={5} min={0} max={100} />
      </div>
      <div>
        <Label>Fee Absorption Strategy</Label>
        <select className={selectCls} value={defaults.feeAbsorption} onChange={e => set('feeAbsorption', e.target.value as DefaultModelInputs['feeAbsorption'])}>
          {FEE_ABSORPTIONS.map(f => <option key={f}>{f}</option>)}
        </select>
      </div>
      <div>
        <Label>Athlete Surcharge %</Label>
        <input type="number" className={inputCls} value={defaults.athleteSurchargePercent} onChange={e => set('athleteSurchargePercent', parseFloat(e.target.value) || 0)} step={0.1} min={0} />
      </div>
    </div>
  );
}

// ─── Admin Panel ──────────────────────────────────────────────────────────────
interface AdminPanelProps {
  config: AppConfig;
  onChange: (c: AppConfig) => void;
  onClearStorage: () => void;
}

export default function AdminPanel({ config, onChange, onClearStorage }: AdminPanelProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const availableProviders = [...new Set(config.feeTable.filter(r => r.active).map(r => r.provider))].sort();
  const availableCountries = [...new Set(config.feeTable.filter(r => r.active).map(r => r.country))].sort();

  const exportConfig = () => {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bnpl-calculator-config.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importConfig = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError('');
    setImportSuccess(false);
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = JSON.parse(ev.target?.result as string) as AppConfig;
        if (!parsed.feeTable || !parsed.scenarios || !parsed.defaults) throw new Error('Invalid config structure');
        onChange(parsed);
        setImportSuccess(true);
        setTimeout(() => setImportSuccess(false), 3000);
      } catch {
        setImportError('Invalid JSON format. Please export a valid configuration first.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const resetToDefaults = () => {
    if (confirm('Reset all configuration to starter defaults? This cannot be undone.')) {
      onChange(structuredClone(STARTER_CONFIG));
      onClearStorage();
    }
  };

  return (
    <div className="max-w-screen-2xl mx-auto px-6 pb-6">
      {/* Collapse header */}
      <button
        type="button"
        onClick={() => setPanelOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-slate-800 text-white rounded-2xl hover:bg-slate-700 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold tracking-tight">Admin / Assumptions Configuration</span>
          <span className="px-2 py-0.5 text-xs bg-slate-600 text-slate-200 rounded-full">
            {config.feeTable.filter(r => r.active).length} active rates · {config.scenarios.filter(s => s.active).length} scenarios
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">
            {panelOpen ? 'Collapse' : 'Expand to configure rates, scenarios & defaults'}
          </span>
          {panelOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {panelOpen && (
        <div className="mt-3 space-y-3 border border-slate-200 rounded-2xl p-5 bg-slate-50">

          {/* Data Governance Disclaimer */}
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
            <AlertCircle size={15} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 leading-relaxed">
              <strong>Data Governance Notice:</strong> This tool does not rely on hidden hardcoded pricing assumptions.
              Pricing, scenario presets, and default model assumptions are user-configurable and should be validated before use.
              Changes made here are saved to browser local storage and persist across sessions.
            </p>
          </div>

          {/* Import / Export / Reset */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Configuration:</span>
            <button
              type="button"
              onClick={exportConfig}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Download size={12} /> Export Configuration JSON
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Upload size={12} /> Import Configuration JSON
            </button>
            <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={importConfig} />
            <button
              type="button"
              onClick={resetToDefaults}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
            >
              <RotateCcw size={12} /> Reset to Starter Defaults
            </button>
            <button
              type="button"
              onClick={() => { onClearStorage(); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-500 bg-gray-100 border border-gray-200 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Clear Saved Configuration
            </button>
            {importSuccess && <span className="text-xs text-emerald-600 font-semibold">Configuration imported successfully.</span>}
            {importError && <span className="text-xs text-red-600 font-semibold">{importError}</span>}
          </div>

          {/* Provider Fee Table */}
          <Section title="Provider Fee Table" badge={`${config.feeTable.filter(r => r.active).length} active`}>
            <FeeTableEditor
              rows={config.feeTable}
              onChange={feeTable => onChange({ ...config, feeTable })}
            />
          </Section>

          {/* Scenario Presets */}
          <Section title="Scenario Presets" badge={`${config.scenarios.filter(s => s.active).length} active`}>
            <ScenarioEditor
              scenarios={config.scenarios}
              onChange={scenarios => onChange({ ...config, scenarios })}
            />
          </Section>

          {/* Default Model Inputs */}
          <Section title="Default Model Inputs">
            <DefaultsEditor
              defaults={config.defaults}
              availableProviders={availableProviders.length > 0 ? availableProviders : ['Affirm', 'Afterpay', 'Clearpay', 'Klarna']}
              availableCountries={availableCountries.length > 0 ? availableCountries : ['United States']}
              onChange={defaults => onChange({ ...config, defaults })}
            />
          </Section>
        </div>
      )}
    </div>
  );
}
