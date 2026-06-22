import { useState } from 'react';
import {
  getThisMonth, getLastMonth, getThisQuarter, getThisYear, getLastYear, getAllTime, getMonthYear,
  formatRangeLabel,
  type DateRange,
} from './periodUtils';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const PRESETS = [
  { label: 'This Month',    fn: getThisMonth,    id: 'thisMonth'   },
  { label: 'Last Month',    fn: getLastMonth,    id: 'lastMonth'   },
  { label: 'This Quarter',  fn: getThisQuarter,  id: 'thisQuarter' },
  { label: 'This Year',     fn: getThisYear,     id: 'thisYear'    },
  { label: 'Last Year',     fn: getLastYear,     id: 'lastYear'    },
  { label: 'All Time',      fn: getAllTime,       id: 'allTime'     },
] as const;

interface Props {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

export default function PeriodSelector({ value, onChange }: Props) {
  const now = new Date();
  const [showCustom, setShowCustom] = useState(value.preset === 'custom');
  const [customFrom, setCustomFrom] = useState(value.preset === 'custom' ? value.from : '');
  const [customTo,   setCustomTo]   = useState(value.preset === 'custom' ? value.to   : '');
  const [myYear,     setMyYear]     = useState(now.getFullYear());
  const [myMonth,    setMyMonth]    = useState(now.getMonth());

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  function applyMonthYear(year: number, month: number) {
    setMyYear(year);
    setMyMonth(month);
    setShowCustom(false);
    onChange(getMonthYear(year, month));
  }

  function applyCustom() {
    if (!customFrom || !customTo) return;
    const f = new Date(customFrom + 'T00:00:00');
    const t = new Date(customTo   + 'T00:00:00');
    onChange({
      from: customFrom,
      to:   customTo,
      preset: 'custom',
      label: `${f.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${t.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`,
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-4 py-3 space-y-2.5">
      {/* Preset pills */}
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map(({ label, fn, id }) => {
          const active = value.preset === id;
          return (
            <button
              key={id}
              onClick={() => { setShowCustom(false); onChange(fn()); }}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                active
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400 hover:text-indigo-600'
              }`}
            >
              {label}
            </button>
          );
        })}
        <button
          onClick={() => setShowCustom((s) => !s)}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
            value.preset === 'custom' || showCustom
              ? 'bg-indigo-600 text-white border-indigo-600'
              : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400 hover:text-indigo-600'
          }`}
        >
          Custom
        </button>
      </div>

      {/* Month-year picker */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-500">Month:</span>
        <select
          value={myMonth}
          onChange={(e) => applyMonthYear(myYear, parseInt(e.target.value))}
          className="text-xs rounded-lg border border-gray-300 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {MONTH_NAMES.map((m, i) => <option key={m} value={i}>{m}</option>)}
        </select>
        <select
          value={myYear}
          onChange={(e) => applyMonthYear(parseInt(e.target.value), myMonth)}
          className="text-xs rounded-lg border border-gray-300 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>

        {/* Custom date inputs */}
        {showCustom && (
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            <span className="text-xs text-gray-400">|</span>
            <span className="text-xs text-gray-500">From:</span>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="text-xs rounded-lg border border-gray-300 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <span className="text-xs text-gray-500">To:</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="text-xs rounded-lg border border-gray-300 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <button
              onClick={applyCustom}
              disabled={!customFrom || !customTo}
              className="px-3 py-1 rounded-lg text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Apply
            </button>
          </div>
        )}
      </div>

      {/* Showing label */}
      <p className="text-xs text-gray-400">
        Showing: <span className="font-semibold text-gray-700">{formatRangeLabel(value)}</span>
      </p>
    </div>
  );
}
