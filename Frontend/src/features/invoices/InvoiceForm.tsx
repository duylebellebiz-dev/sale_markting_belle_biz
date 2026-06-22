import { useEffect, useRef, useState } from 'react';
import api from '../../lib/api';
import { invoicesApi } from './invoicesApi';
import { businessesApi } from '../businesses/businessesApi';
import type { CreateInvoicePayload, UpdateInvoicePayload, Invoice } from './invoicesApi';

interface Customer {
  _id: string;
  customerName: string;
  shopName?: string;
  phoneNumber?: string;
  email?: string;
}

interface LineItemRow {
  id: string; // local React key
  description: string;
  serviceTerm: string;
  quantity: string;
  rate: string;
}

interface Props {
  initial?: Invoice | null;
  onSubmit: (payload: CreateInvoicePayload | UpdateInvoicePayload) => Promise<void>;
  onClose: () => void;
}

const INPUT = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';
const INPUT_SM = 'rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 w-full';
const BTN_PRIMARY = 'px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors';
const BTN_SECONDARY = 'px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors';
const LABEL = 'text-xs font-medium text-gray-600 uppercase tracking-wide';

function uid() {
  return Math.random().toString(36).slice(2);
}

function r2(n: number) {
  return Math.round(n * 100) / 100;
}

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toDateInput(iso?: string) {
  return iso ? iso.slice(0, 10) : '';
}

function customerLabel(c: Customer) {
  return c.shopName ? `${c.customerName} - ${c.shopName}` : c.customerName;
}

function matchesSearch(c: Customer, q: string) {
  const lower = q.toLowerCase();
  return (
    c.customerName.toLowerCase().includes(lower) ||
    (c.shopName ?? '').toLowerCase().includes(lower) ||
    (c.phoneNumber ?? '').includes(q)
  );
}

function blankRow(): LineItemRow {
  return { id: uid(), description: '', serviceTerm: '', quantity: '1', rate: '' };
}

function computeLive(
  rows: LineItemRow[],
  discount: number,
  shipping: number,
  adjustment: number,
  taxRate: number,
) {
  const itemAmounts = rows.map((r) => r2((parseFloat(r.quantity) || 0) * (parseFloat(r.rate) || 0)));
  const subTotal = r2(itemAmounts.reduce((s, a) => s + a, 0));
  const discountAmt = r2(subTotal * discount / 100);
  const afterDiscount = r2(subTotal - discountAmt);
  const taxableBase = r2(afterDiscount + shipping + adjustment);
  const taxAmount = r2(taxableBase * taxRate / 100);
  const total = r2(taxableBase + taxAmount);
  return { itemAmounts, subTotal, discountAmt, taxAmount, total };
}

export default function InvoiceForm({ initial, onSubmit, onClose }: Props) {
  //  Customer combobox 
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [customerId, setCustomerId] = useState(() => {
    if (!initial) return '';
    return typeof initial.customerId === 'object' ? initial.customerId.id : initial.customerId;
  });
  const [selectedLabel, setSelectedLabel] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  //  Invoice header 
  const [invoiceNumber, setInvoiceNumber] = useState(initial?.invoiceNumber ?? '');
  const [invoiceDate, setInvoiceDate] = useState(toDateInput(initial?.invoiceDate));
  const [dueDate, setDueDate] = useState(toDateInput(initial?.dueDate));
  const [terms, setTerms] = useState(initial?.terms ?? '');

  //  Line items 
  const [rows, setRows] = useState<LineItemRow[]>(() => {
    if (initial?.lineItems?.length) {
      return initial.lineItems.map((li) => ({
        id: uid(),
        description: li.description,
        serviceTerm: li.serviceTerm ?? '',
        quantity: String(li.quantity),
        rate: String(li.rate),
      }));
    }
    return [blankRow()];
  });

  //  Pricing scalars 
  const [discount, setDiscount] = useState(String(initial?.discount ?? 0));
  const [shipping, setShipping] = useState(String(initial?.shippingCharges ?? 0));
  const [adjustment, setAdjustment] = useState(String(initial?.adjustment ?? 0));
  const [taxRate, setTaxRate] = useState(String(initial?.taxRate ?? ''));

  //  Notes 
  const [customerNote, setCustomerNote] = useState(initial?.customerNote ?? '');
  const [termsConditions, setTermsConditions] = useState(initial?.termsConditions ?? '');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  //  Load customers + defaults 
  useEffect(() => {
    api
      .get<Customer[]>('/customers')
      .then((r) => {
        setCustomers(r.data);
        if (initial) {
          const cid = typeof initial.customerId === 'object' ? initial.customerId.id : initial.customerId;
          const found = r.data.find((c) => c.id === cid);
          if (found) setSelectedLabel(customerLabel(found));
        }
      })
      .catch(() => setCustomers([]))
      .finally(() => setCustomersLoading(false));

    // Pre-fill defaults from branding for new invoices
    if (!initial) {
      businessesApi.getBranding().then((b) => {
        if (b.defaultTaxRate != null) setTaxRate(String(b.defaultTaxRate));
        if (b.defaultCustomerNote) setCustomerNote(b.defaultCustomerNote);
        if (b.defaultTerms) setTermsConditions(b.defaultTerms);
      }).catch(() => null);

      invoicesApi.nextNumber().then((n) => {
        setInvoiceNumber(n as unknown as string);
      }).catch(() => null);
    }
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  //  Live totals 
  const d = parseFloat(discount) || 0;
  const s = parseFloat(shipping) || 0;
  const adj = parseFloat(adjustment) || 0;
  const tr = parseFloat(taxRate) || 0;
  const { itemAmounts, subTotal, discountAmt, taxAmount, total } = computeLive(rows, d, s, adj, tr);

  //  Customer combobox handlers 
  const filtered = search ? customers.filter((c) => matchesSearch(c, search)) : customers;

  function selectCustomer(c: Customer) {
    setCustomerId(c.id);
    setSelectedLabel(customerLabel(c));
    setSearch('');
    setDropdownOpen(false);
  }

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSearch(e.target.value);
    setCustomerId('');
    setSelectedLabel('');
    setDropdownOpen(true);
  }

  //  Line item handlers 
  function updateRow(id: string, field: keyof LineItemRow, value: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, blankRow()]);
  }

  function removeRow(id: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  }

  //  Submit 
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!initial && !customerId) { setError('Please select a customer.'); return; }
    if (!invoiceNumber.trim()) { setError('Invoice number is required.'); return; }

    for (const row of rows) {
      if (!row.description.trim()) { setError('Each line item must have a description.'); return; }
      const qty = parseFloat(row.quantity);
      const rate = parseFloat(row.rate);
      if (isNaN(qty) || qty < 0) { setError('Line item quantity must be a valid non-negative number.'); return; }
      if (isNaN(rate) || rate < 0) { setError('Line item rate must be a valid non-negative number.'); return; }
    }

    const lineItems = rows.map((r) => ({
      description: r.description.trim(),
      serviceTerm: r.serviceTerm.trim() || undefined,
      quantity: parseFloat(r.quantity) || 0,
      rate: parseFloat(r.rate) || 0,
    }));

    const payload: CreateInvoicePayload = {
      customerId,
      invoiceNumber: invoiceNumber.trim(),
      invoiceDate: invoiceDate || undefined,
      dueDate: dueDate || undefined,
      terms: terms.trim() || undefined,
      lineItems,
      discount: d || undefined,
      shippingCharges: s || undefined,
      adjustment: adj || undefined,
      taxRate: tr || undefined,
      customerNote: customerNote.trim() || undefined,
      termsConditions: termsConditions.trim() || undefined,
    };

    setSubmitting(true);
    try {
      await onSubmit(payload);
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })
        ?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Something went wrong.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[94vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">
            {initial ? 'Edit Invoice' : 'New Invoice'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-6 overflow-y-auto flex-1">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          {/*  Customer  */}
          <div className="flex flex-col gap-1">
            <label className={LABEL}>Customer *</label>
            {customersLoading ? (
              <p className="text-sm text-gray-400">Loading customers...</p>
            ) : initial ? (
              <div className={`${INPUT} bg-gray-50 text-gray-700`}>{selectedLabel || '-'}</div>
            ) : (
              <div className="relative" ref={dropdownRef}>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={customerId ? selectedLabel : search}
                  onChange={handleSearchChange}
                  onFocus={() => setDropdownOpen(true)}
                  placeholder="Search by name, shop, phone..."
                  className={INPUT}
                  autoComplete="off"
                />
                {customerId && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerId(''); setSelectedLabel(''); setSearch('');
                      searchInputRef.current?.focus(); setDropdownOpen(true);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none"
                  >&times;</button>
                )}
                {dropdownOpen && !customerId && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                    {filtered.length === 0 ? (
                      <p className="px-3 py-2 text-sm text-gray-400">No customers found</p>
                    ) : (
                      filtered.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onMouseDown={() => selectCustomer(c)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 hover:text-indigo-700"
                        >
                          <span className="font-medium">{c.customerName}</span>
                          {c.shopName && <span className="text-gray-500"> - {c.shopName}</span>}
                          {c.phoneNumber && <span className="text-gray-400 ml-2 text-xs">{c.phoneNumber}</span>}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/*  Invoice header row  */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label className={LABEL}>Invoice # *</label>
              <input
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                className={INPUT}
                placeholder="INV-001"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={LABEL}>Invoice Date</label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className={INPUT}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={LABEL}>Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={INPUT}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className={LABEL}>Terms</label>
            <input
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              className={INPUT}
              placeholder="e.g. Due on Receipt, Net 30"
              maxLength={200}
            />
          </div>

          {/*  Line Items  */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className={LABEL}>Line Items</label>
              <button
                type="button"
                onClick={addRow}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                + Add Line
              </button>
            </div>

            <div className="rounded-xl border border-gray-200 overflow-hidden">
              {/* Column headers */}
              <div className="grid grid-cols-[1fr_120px_80px_80px_70px_32px] gap-1 bg-gray-50 px-2 py-1.5 text-xs font-medium text-gray-500 uppercase tracking-wide border-b border-gray-200">
                <span>Description</span>
                <span>Service Term</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Rate</span>
                <span className="text-right">Amount</span>
                <span />
              </div>

              {rows.map((row, idx) => (
                <div
                  key={row.id}
                  className="grid grid-cols-[1fr_120px_80px_80px_70px_32px] gap-1 items-center px-2 py-1.5 border-b border-gray-100 last:border-0"
                >
                  <input
                    value={row.description}
                    onChange={(e) => updateRow(row.id, 'description', e.target.value)}
                    placeholder="Item description"
                    maxLength={500}
                    className={INPUT_SM}
                  />
                  <input
                    value={row.serviceTerm}
                    onChange={(e) => updateRow(row.id, 'serviceTerm', e.target.value)}
                    placeholder="e.g. 1 year"
                    maxLength={200}
                    className={INPUT_SM}
                  />
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={row.quantity}
                    onChange={(e) => updateRow(row.id, 'quantity', e.target.value)}
                    className={`${INPUT_SM} text-right`}
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.rate}
                    onChange={(e) => updateRow(row.id, 'rate', e.target.value)}
                    placeholder="0.00"
                    className={`${INPUT_SM} text-right`}
                  />
                  <span className="text-right text-sm font-medium text-gray-700 pr-1">
                    {fmt(itemAmounts[idx] ?? 0)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    disabled={rows.length === 1}
                    className="text-gray-300 hover:text-red-500 disabled:opacity-20 transition-colors text-lg leading-none text-center"
                    title="Remove line"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/*  Pricing scalars + live totals  */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Left: scalar inputs */}
            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <label className={LABEL}>Discount (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  className={`${INPUT} max-w-[120px]`}
                  placeholder="0"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={LABEL}>Shipping Charges</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={shipping}
                  onChange={(e) => setShipping(e.target.value)}
                  className={`${INPUT} max-w-[120px]`}
                  placeholder="0.00"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={LABEL}>Adjustment</label>
                <input
                  type="number"
                  step="0.01"
                  value={adjustment}
                  onChange={(e) => setAdjustment(e.target.value)}
                  className={`${INPUT} max-w-[120px]`}
                  placeholder="0.00"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={LABEL}>Tax Rate (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                  className={`${INPUT} max-w-[120px]`}
                  placeholder="0"
                />
              </div>
            </div>

            {/* Right: live totals */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-2 self-start">
              <Row label="Sub Total" value={fmt(subTotal)} />
              {d > 0 && <Row label={`Discount (${d}%)`} value={`-${fmt(discountAmt)}`} muted />}
              {s !== 0 && <Row label="Shipping" value={fmt(s)} muted />}
              {adj !== 0 && <Row label="Adjustment" value={adj >= 0 ? fmt(adj) : `-${fmt(Math.abs(adj))}`} muted />}
              {tr > 0 && <Row label={`Tax (${tr}%)`} value={fmt(taxAmount)} muted />}
              <div className="border-t border-gray-300 pt-2 mt-1">
                <Row label="Total" value={fmt(total)} bold />
              </div>
            </div>
          </div>

          {/*  Notes  */}
          <div className="flex flex-col gap-1">
            <label className={LABEL}>Customer Note</label>
            <textarea
              value={customerNote}
              onChange={(e) => setCustomerNote(e.target.value)}
              rows={3}
              maxLength={2000}
              className={`${INPUT} resize-none`}
              placeholder="Thank you for your business!"
            />
            <p className="text-xs text-gray-400 text-right">{customerNote.length}/2000</p>
          </div>

          <div className="flex flex-col gap-1">
            <label className={LABEL}>Terms & Conditions</label>
            <textarea
              value={termsConditions}
              onChange={(e) => setTermsConditions(e.target.value)}
              rows={4}
              maxLength={5000}
              className={`${INPUT} resize-none`}
              placeholder="Payment is due within 30 days..."
            />
            <p className="text-xs text-gray-400 text-right">{termsConditions.length}/5000</p>
          </div>
        </form>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 shrink-0">
          <button onClick={onClose} type="button" className={BTN_SECONDARY}>Cancel</button>
          <button onClick={handleSubmit as unknown as React.MouseEventHandler} disabled={submitting} className={BTN_PRIMARY}>
            {submitting ? 'Saving...' : initial ? 'Save Changes' : 'Create Invoice'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold, muted }: { label: string; value: string; bold?: boolean; muted?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className={muted ? 'text-gray-500' : bold ? 'font-semibold text-gray-900' : 'text-gray-700'}>{label}</span>
      <span className={bold ? 'font-bold text-gray-900' : muted ? 'text-gray-500' : 'text-gray-800'}>{value}</span>
    </div>
  );
}
