/**
 * Searchable customer picker - debounced input -> GET /customers/search -> dropdown.
 * Replaces a plain <select> for screens with many customers.
 */
import { useEffect, useRef, useState } from 'react';
import { customersApi } from './customersApi';

export interface PickedCustomer {
  _id: string;
  customerName: string;
  shopName?: string;
  email?: string;
  isClosed: boolean;
}

interface Props {
  value: PickedCustomer | null;
  onChange: (c: PickedCustomer | null) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}

const INPUT =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

export default function CustomerSearchPicker({
  value,
  onChange,
  placeholder = 'Search by name, shop, or email...',
  disabled = false,
  autoFocus = false,
}: Props) {
  const [query, setQuery]           = useState('');
  const [results, setResults]       = useState<PickedCustomer[]>([]);
  const [open, setOpen]             = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLInputElement>(null);
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-focus when mounted
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!open) return;

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(false);
      try {
        const data = await customersApi.search(query, 20);
        setResults(data);
      } catch {
        setError(true);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 280);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, open]);

  function openPicker() {
    if (disabled) return;
    setOpen(true);
    setQuery('');
    setResults([]);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function pick(c: PickedCustomer) {
    onChange(c);
    setOpen(false);
    setQuery('');
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange(null);
    setOpen(false);
  }

  // Closed state: show selected customer chip or trigger button
  if (!open) {
    return (
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={openPicker}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openPicker(); }}
        className={[
          INPUT,
          'cursor-pointer flex items-center justify-between gap-2',
          disabled ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'hover:border-indigo-400',
          value ? '' : 'text-gray-400',
        ].join(' ')}
      >
        {value ? (
          <>
            <span className="flex-1 min-w-0">
              <span className="font-medium text-gray-900">{value.customerName}</span>
              {value.shopName && (
                <span className="text-gray-500"> - {value.shopName}</span>
              )}
            </span>
            {!disabled && (
              <button
                type="button"
                onClick={clear}
                className="shrink-0 text-gray-400 hover:text-red-500 transition-colors leading-none"
                title="Clear"
              >
                x
              </button>
            )}
          </>
        ) : (
          <span>{placeholder}</span>
        )}
      </div>
    );
  }

  // Open state: search input + dropdown
  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className={`${INPUT} pr-8`}
          autoComplete="off"
          onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
        />
        {loading ? (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
            <span className="block w-4 h-4 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none"
          >
            x
          </button>
        )}
      </div>

      {/* Dropdown */}
      <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-56 overflow-y-auto">
        {error && (
          <p className="px-3 py-2 text-xs text-red-600">Search failed - check your connection.</p>
        )}

        {!error && !loading && results.length === 0 && (
          <p className="px-3 py-3 text-sm text-gray-400 text-center">
            {query.trim() ? 'No customers found.' : 'Start typing to search...'}
          </p>
        )}

        {results.map((c) => (
          <button
            key={c.id}
            type="button"
            onMouseDown={(e) => e.preventDefault()} // prevent blur before click
            onClick={() => pick(c)}
            className="w-full text-left px-3 py-2.5 hover:bg-indigo-50 transition-colors border-b border-gray-100 last:border-0"
          >
            <p className="text-sm font-medium text-gray-900 leading-snug">
              {c.customerName}
              {c.isClosed && (
                <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-green-600 bg-green-50 rounded px-1 py-0.5">
                  Closed
                </span>
              )}
            </p>
            {(c.shopName || c.email) && (
              <p className="text-xs text-gray-400 leading-snug">
                {[c.shopName, c.email].filter(Boolean).join(' - ')}
              </p>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
