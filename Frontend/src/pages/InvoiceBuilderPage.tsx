/**
 * Full-page invoice builder - CLAUDE.md S12.2
 * Routes:  /invoices/new        - create
 *          /invoices/:id/edit   - edit existing
 *
 * Each line item can be:
 *   (1) picked from the company Services catalogue -> auto-fills description + rate, keeps serviceId
 *   (2) typed manually -> no serviceId
 * Both modes keep quantity, optional service term, and live-computed amount.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { invoicesApi } from '../features/invoices/invoicesApi';
import { businessesApi } from '../features/businesses/businessesApi';
import SendInvoiceEmailModal from '../features/invoices/SendInvoiceEmailModal';
import { usePermission } from '../features/staff/usePermission';
import type { CreateInvoicePayload, Invoice } from '../features/invoices/invoicesApi';
import type { BusinessBranding } from '../features/businesses/businessesApi';
import api from '../lib/api';
import { CANADA_TAX_RATES, PROVINCE_OPTIONS } from '../lib/canadaTaxRates';

//  Types 

interface CustomerOption {
  _id: string;
  customerName: string;
  shopName?: string;
  phoneNumber?: string;
  email?: string;
}

interface ServiceOption {
  _id: string;
  name: string;
  price: number;
  isActive: boolean;
}

interface LineRow {
  id: string;
  // linked service (optional)
  serviceId: string;       // '' when manual
  serviceName: string;     // display label for the badge
  // editable fields (may be overridden after auto-fill)
  description: string;
  serviceTerm: string;
  quantity: string;
  rate: string;
}

//  Helpers 

function uid() { return Math.random().toString(36).slice(2); }
function r2(n: number) { return Math.round(n * 100) / 100; }
function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function toDateInput(iso?: string | null) {
  if (!iso) return '';
  return new Date(iso).toISOString().slice(0, 10);
}
function today() { return new Date().toISOString().slice(0, 10); }

function blankRow(): LineRow {
  return { id: uid(), serviceId: '', serviceName: '', description: '', serviceTerm: '', quantity: '1', rate: '' };
}

function rowFromService(svc: ServiceOption): LineRow {
  return {
    id: uid(),
    serviceId: svc.id,
    serviceName: svc.name,
    description: svc.name,
    serviceTerm: '',
    quantity: '1',
    rate: String(svc.price),
  };
}

function computeLive(rows: LineRow[], disc: number, ship: number, adj: number, tax: number) {
  const amounts = rows.map(r => r2((parseFloat(r.quantity) || 0) * (parseFloat(r.rate) || 0)));
  const subTotal = r2(amounts.reduce((s, a) => s + a, 0));
  const discAmt  = r2(subTotal * disc / 100);
  const taxable  = r2(subTotal - discAmt + ship + adj);
  const taxAmt   = r2(taxable * tax / 100);
  const total    = r2(taxable + taxAmt);
  return { amounts, subTotal, discAmt, taxAmt, total };
}

function extractMsg(err: unknown) {
  const m = (err as { response?: { data?: { message?: string | string[] } } })
    ?.response?.data?.message;
  return Array.isArray(m) ? m.join(', ') : (m ?? 'Something went wrong.');
}

function cLabel(c: CustomerOption) {
  return c.shopName ? `${c.customerName} - ${c.shopName}` : c.customerName;
}
function matchC(c: CustomerOption, q: string) {
  const l = q.toLowerCase();
  return (
    c.customerName.toLowerCase().includes(l) ||
    (c.shopName ?? '').toLowerCase().includes(l) ||
    (c.phoneNumber ?? '').includes(q) ||
    (c.email ?? '').toLowerCase().includes(l)
  );
}
function matchS(s: ServiceOption, q: string) {
  return s.name.toLowerCase().includes(q.toLowerCase());
}

//  Tailwind shorthands 

const INPUT    = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white';
const INPUT_SM = 'w-full rounded border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white';
const LABEL    = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1';
const FIELD    = 'flex flex-col gap-1';

const BACKEND = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000';

//  Page 

export default function InvoiceBuilderPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const canExportPdf = usePermission('exportInvoicePdf');
  const canCreate    = usePermission('createInvoice');

  //  Bootstrap data 
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [services,  setServices]  = useState<ServiceOption[]>([]);
  const [branding,  setBranding]  = useState<BusinessBranding | null>(null);
  const [loading,   setLoading]   = useState(!!id);
  const [bootErr,   setBootErr]   = useState<string | null>(null);

  //  Customer combobox 
  const [customerId,       setCustomerId]       = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);
  const [custSearch,       setCustSearch]       = useState('');
  const [custDdOpen,       setCustDdOpen]       = useState(false);
  const custDdRef  = useRef<HTMLDivElement>(null);
  const custInpRef = useRef<HTMLInputElement>(null);

  //  Header fields 
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate,   setInvoiceDate]   = useState(today());
  const [dueDate,       setDueDate]       = useState('');
  const [terms,         setTerms]         = useState('');

  //  Line items 
  const [rows, setRows] = useState<LineRow[]>([blankRow()]);

  //  Pricing 
  const [discount, setDiscount] = useState('0');
  const [shipping, setShipping] = useState('0');
  const [adjField, setAdjField] = useState('0');
  const [taxRate,  setTaxRate]  = useState('');
  const [province, setProvince] = useState('');
  const [taxLabel, setTaxLabel] = useState('');

  //  Notes 
  const [customerNote,    setCustomerNote]    = useState('');
  const [termsConditions, setTermsConditions] = useState('');

  //  Save state 
  const [savedId,   setSavedId]   = useState<string | null>(id ?? null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [saving,        setSaving]        = useState(false);
  const [pdfing,        setPdfing]        = useState(false);
  const [sendInvoice,   setSendInvoice]   = useState<import('./invoicesApi').Invoice | null>(null);

  //  Live totals 
  const disc = parseFloat(discount) || 0;
  const ship = parseFloat(shipping) || 0;
  const adj  = parseFloat(adjField) || 0;
  const tax  = parseFloat(taxRate)  || 0;
  const { amounts, subTotal, discAmt, taxAmt, total } = computeLive(rows, disc, ship, adj, tax);
  const balanceDue = r2(total);

  //  Bootstrap 
  useEffect(() => {
    const p1 = api.get<CustomerOption[]>('/customers')
      .then(r => setCustomers(r.data)).catch(() => null);

    const p2 = api.get<ServiceOption[]>('/services')
      .then(r => setServices(r.data.filter((s: ServiceOption) => s.isActive))).catch(() => null);

    const p3 = businessesApi.getBranding().then(b => {
      setBranding(b);
      setCustomerNote(b.defaultCustomerNote ?? '');
      setTermsConditions(b.defaultTerms ?? '');
      // Apply default province from business branding
      const prov = b.province ?? '';
      setProvince(prov);
      if (prov && CANADA_TAX_RATES[prov]) {
        const info = CANADA_TAX_RATES[prov];
        setTaxRate(String(info.rate));
        setTaxLabel(info.taxLabel);
      } else {
        setTaxRate(b.defaultTaxRate != null ? String(b.defaultTaxRate) : '0');
        setTaxLabel('');
      }
    }).catch(() => null);

    const p4 = !id
      ? invoicesApi.nextNumber().then(n => setInvoiceNumber(n as unknown as string)).catch(() => null)
      : Promise.resolve();

    const p5 = id
      ? invoicesApi.get(id).then(populateFromInvoice).catch(e => setBootErr(extractMsg(e)))
      : Promise.resolve();

    Promise.all([p1, p2, p3, p4, p5]).finally(() => setLoading(false));
  }, [id]);

  function populateFromInvoice(inv: Invoice) {
    const cid = typeof inv.customerId === 'object' ? inv.customerId.id : inv.customerId;
    setCustomerId(cid);
    setInvoiceNumber(inv.invoiceNumber);
    setInvoiceDate(toDateInput(inv.invoiceDate));
    setDueDate(toDateInput(inv.dueDate));
    setTerms(inv.terms ?? '');
    setRows(
      inv.lineItems?.length
        ? inv.lineItems.map(li => ({
            id:          uid(),
            serviceId:   li.serviceId ?? '',
            serviceName: '',    // resolved after services load (see effect below)
            description: li.description,
            serviceTerm: li.serviceTerm ?? '',
            quantity:    String(li.quantity),
            rate:        String(li.rate),
          }))
        : [blankRow()],
    );
    setDiscount(String(inv.discount ?? 0));
    setShipping(String(inv.shippingCharges ?? 0));
    setAdjField(String(inv.adjustment ?? 0));
    setTaxRate(String(inv.taxRate ?? 0));
    setProvince(inv.province ?? '');
    setTaxLabel(inv.taxLabel ?? '');
    setCustomerNote(inv.customerNote ?? '');
    setTermsConditions(inv.termsConditions ?? '');
    setSavedId(inv.id);
  }

  // Resolve serviceName labels once services list arrives
  useEffect(() => {
    if (!services.length) return;
    setRows(prev => prev.map(r => {
      if (!r.serviceId || r.serviceName) return r;
      const svc = services.find(s => s.id === r.serviceId);
      return svc ? { ...r, serviceName: svc.name } : r;
    }));
  }, [services]);

  // Resolve customer label after customer list arrives (edit mode)
  useEffect(() => {
    if (customerId && customers.length) {
      const found = customers.find(c => c.id === customerId);
      if (found) setSelectedCustomer(found);
    }
  }, [customerId, customers]);

  // Close customer dropdown on outside click
  useEffect(() => {
    function h(e: MouseEvent) {
      if (custDdRef.current && !custDdRef.current.contains(e.target as Node)) setCustDdOpen(false);
    }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  //  Customer picker 
  const filteredC = custSearch ? customers.filter(c => matchC(c, custSearch)) : customers;

  function selectCustomer(c: CustomerOption) {
    setCustomerId(c.id); setSelectedCustomer(c); setCustSearch(''); setCustDdOpen(false);
  }
  function clearCustomer() {
    setCustomerId(''); setSelectedCustomer(null); setCustSearch('');
    custInpRef.current?.focus(); setCustDdOpen(true);
  }

  //  Line-item mutations 

  function updateRow(rowId: string, patch: Partial<Omit<LineRow, 'id'>>) {
    setRows(prev => prev.map(r => r.id === rowId ? { ...r, ...patch } : r));
  }

  /** Pick a service from the catalogue for a row. */
  function applyService(rowId: string, svc: ServiceOption) {
    setRows(prev => prev.map(r =>
      r.id === rowId
        ? { ...r, serviceId: svc.id, serviceName: svc.name, description: svc.name, rate: String(svc.price) }
        : r,
    ));
  }

  /** Detach the linked service (keep text editable). */
  function detachService(rowId: string) {
    setRows(prev => prev.map(r =>
      r.id === rowId ? { ...r, serviceId: '', serviceName: '' } : r,
    ));
  }

  function addRow() { setRows(prev => [...prev, blankRow()]); }
  function addServiceRow(svc: ServiceOption) { setRows(prev => [...prev, rowFromService(svc)]); }
  function removeRow(rowId: string) {
    setRows(prev => prev.length > 1 ? prev.filter(r => r.id !== rowId) : prev);
  }

  //  Payload 

  function buildPayload(): CreateInvoicePayload | null {
    if (!customerId)          { setActionErr('Please select a customer.');               return null; }
    if (!invoiceNumber.trim()){ setActionErr('Invoice number is required.');             return null; }
    for (const r of rows) {
      if (!r.description.trim()) { setActionErr('Each line item needs a description.'); return null; }
    }
    setActionErr(null);
    return {
      customerId,
      invoiceNumber: invoiceNumber.trim(),
      invoiceDate:   invoiceDate || undefined,
      dueDate:       dueDate || undefined,
      terms:         terms.trim() || undefined,
      lineItems: rows.map(r => ({
        serviceId:   r.serviceId || undefined,
        description: r.description.trim(),
        serviceTerm: r.serviceTerm.trim() || undefined,
        quantity:    parseFloat(r.quantity) || 0,
        rate:        parseFloat(r.rate)     || 0,
      })),
      discount:        disc || undefined,
      shippingCharges: ship || undefined,
      adjustment:      adj  || undefined,
      taxRate:         tax  || undefined,
      province:        province || undefined,
      taxLabel:        taxLabel || undefined,
      customerNote:    customerNote.trim()    || undefined,
      termsConditions: termsConditions.trim() || undefined,
    };
  }

  //  Actions 

  const flash = useCallback((msg: string) => {
    setActionMsg(msg); setTimeout(() => setActionMsg(null), 4000);
  }, []);

  async function ensureSaved(): Promise<string | null> {
    const payload = buildPayload();
    if (!payload) return null;
    if (savedId) {
      const { customerId: _c, ...upd } = payload;
      await invoicesApi.update(savedId, upd);
      return savedId;
    }
    const inv = await invoicesApi.create(payload);
    setSavedId(inv.id);
    window.history.replaceState({}, '', `/invoices/${inv.id}/edit`);
    return inv.id;
  }

  async function handleSaveDraft() {
    setSaving(true); setActionErr(null);
    try { await ensureSaved(); flash('Draft saved.'); }
    catch (e) { setActionErr(extractMsg(e)); }
    finally { setSaving(false); }
  }

  async function handleDownloadPdf() {
    setPdfing(true); setActionErr(null);
    try {
      const invId = await ensureSaved();
      if (invId) await invoicesApi.downloadPdf(invId, invoiceNumber);
    }
    catch (e) { setActionErr(extractMsg(e)); }
    finally { setPdfing(false); }
  }

  async function handleOpenSendModal() {
    setActionErr(null);
    // Save first so the PDF reflects current state
    setSaving(true);
    let invId: string | null = null;
    try { invId = await ensureSaved(); }
    catch (e) { setActionErr(extractMsg(e)); setSaving(false); return; }
    setSaving(false);
    if (!invId) return;
    // Load the saved invoice so the modal has accurate billTo + lineItems
    try {
      const saved = await invoicesApi.get(invId);
      setSendInvoice(saved);
    } catch (e) { setActionErr(extractMsg(e)); }
  }

  //  Loading / error screens 

  if (loading) {
    return (
      <AppShell title="Invoice Builder">
        <div className="flex items-center justify-center py-32">
          <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      </AppShell>
    );
  }
  if (bootErr) {
    return (
      <AppShell title="Invoice Builder">
        <div className="max-w-xl mx-auto mt-20 rounded-xl bg-red-50 border border-red-200 p-6 text-center">
          <p className="text-red-700 font-medium">{bootErr}</p>
          <button onClick={() => navigate('/invoices')} className="mt-4 text-sm text-indigo-600 underline">
            Back to Invoices
          </button>
        </div>
      </AppShell>
    );
  }

  const isEditing = !!id;
  const logoSrc   = branding?.logoUrl ? `${BACKEND}${branding.logoUrl}` : null;

  return (
    <AppShell title={isEditing ? 'Edit Invoice' : 'New Invoice'}>

      {/*  Sticky action bar  */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate('/invoices')}
            className="shrink-0 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Invoices
          </button>
          <span className="text-gray-300">/</span>
          <h1 className="text-base font-semibold text-gray-900 truncate">
            {isEditing ? `Edit ${invoiceNumber || 'Invoice'}` : 'New Invoice'}
          </h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canCreate && (
            <button onClick={handleSaveDraft} disabled={saving}
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors">
              {saving ? 'Saving...' : 'Save Draft'}
            </button>
          )}
          {canExportPdf && (
            <button onClick={handleDownloadPdf} disabled={pdfing}
              className="px-4 py-2 rounded-lg border border-indigo-300 text-indigo-700 text-sm font-medium hover:bg-indigo-50 disabled:opacity-50 transition-colors">
              {pdfing ? 'Generating...' : 'Download PDF'}
            </button>
          )}
          {canCreate && (
            <button onClick={handleOpenSendModal} disabled={saving || !!sendInvoice}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {saving ? 'Saving...' : 'Save & Email'}
            </button>
          )}
        </div>
      </div>

      {/*  Alerts  */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 mt-4 space-y-2">
        {actionErr && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex justify-between items-center">
            {actionErr}
            <button onClick={() => setActionErr(null)} className="ml-4 text-red-400 hover:text-red-600"></button>
          </div>
        )}
        {actionMsg && (
          <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
            {actionMsg}
          </div>
        )}
      </div>

      {/*  Invoice card  */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-20">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">

          {/*  S1 Header: branding + INVOICE label  */}
          <div className="p-8 flex items-start justify-between gap-6">
            <div className="flex items-start gap-4 min-w-0">
              {logoSrc ? (
                <img src={logoSrc} alt="logo" className="h-14 w-auto object-contain shrink-0" />
              ) : (
                <div className="h-14 w-14 rounded-lg bg-indigo-50 border-2 border-dashed border-indigo-200 flex items-center justify-center shrink-0 text-indigo-300 text-xs text-center">
                  Logo
                </div>
              )}
              <div className="min-w-0">
                <p className="font-bold text-gray-900 text-base leading-tight truncate">
                  {branding?.businessName || 'Your Business'}
                </p>
                {branding?.addressLine && (
                  <p className="text-xs text-gray-500 mt-0.5">{branding.addressLine}</p>
                )}
                {(branding?.phone || branding?.website) && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {[branding.phone, branding.website].filter(Boolean).join('  |  ')}
                  </p>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <h1 className="text-4xl font-black tracking-tight text-indigo-600">INVOICE</h1>
              <p className="text-xs text-gray-400 mt-2 uppercase tracking-wide">Balance Due</p>
              <p className="text-3xl font-bold text-gray-900">${fmt(balanceDue)}</p>
            </div>
          </div>

          <div className="border-t border-gray-100" />

          {/*  S2 Bill-To + Invoice meta  */}
          <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">

            {/* Bill To */}
            <div>
              <p className={LABEL}>Bill To</p>
              {isEditing ? (
                <div className="space-y-1">
                  <p className="font-semibold text-gray-900 text-sm">
                    {selectedCustomer ? cLabel(selectedCustomer) : '-'}
                  </p>
                  {selectedCustomer?.email     && <p className="text-xs text-gray-500">{selectedCustomer.email}</p>}
                  {selectedCustomer?.phoneNumber && <p className="text-xs text-gray-500">{selectedCustomer.phoneNumber}</p>}
                </div>
              ) : (
                <div className="relative" ref={custDdRef}>
                  <input
                    ref={custInpRef}
                    type="text"
                    value={selectedCustomer ? cLabel(selectedCustomer) : custSearch}
                    onChange={e => { setCustSearch(e.target.value); setCustomerId(''); setSelectedCustomer(null); setCustDdOpen(true); }}
                    onFocus={() => setCustDdOpen(true)}
                    placeholder="Search customer..."
                    className={INPUT}
                    autoComplete="off"
                  />
                  {selectedCustomer && (
                    <button type="button" onClick={clearCustomer}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xl">x</button>
                  )}
                  {custDdOpen && !selectedCustomer && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                      {filteredC.length === 0
                        ? <p className="px-3 py-2 text-sm text-gray-400">No customers found</p>
                        : filteredC.map(c => (
                          <button key={c.id} type="button" onMouseDown={() => selectCustomer(c)}
                            className="w-full text-left px-3 py-2.5 text-sm hover:bg-indigo-50 border-b border-gray-50 last:border-0">
                            <span className="font-medium text-gray-900">{c.customerName}</span>
                            {c.shopName && <span className="text-gray-500"> - {c.shopName}</span>}
                            {c.email     && <span className="ml-2 text-xs text-gray-400">{c.email}</span>}
                          </button>
                        ))}
                    </div>
                  )}
                  {selectedCustomer && (
                    <div className="mt-2 space-y-0.5">
                      {selectedCustomer.email     && <p className="text-xs text-gray-500">{selectedCustomer.email}</p>}
                      {selectedCustomer.phoneNumber && <p className="text-xs text-gray-500">{selectedCustomer.phoneNumber}</p>}
                      {!selectedCustomer.email && (
                        <p className="text-xs text-amber-600 flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                          </svg>
                          No email - Save &amp; Email won't work
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Invoice meta */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className={FIELD}>
                  <label className={LABEL}>Invoice #</label>
                  <input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)}
                    className={INPUT} placeholder="INV-001" maxLength={50} />
                </div>
                <div className={FIELD}>
                  <label className={LABEL}>Invoice Date</label>
                  <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className={INPUT} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className={FIELD}>
                  <label className={LABEL}>Due Date</label>
                  <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={INPUT} />
                </div>
                <div className={FIELD}>
                  <label className={LABEL}>Terms</label>
                  <input value={terms} onChange={e => setTerms(e.target.value)}
                    className={INPUT} placeholder="Due on Receipt" maxLength={200} />
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100" />

          {/*  S3 Line Items  */}
          <div className="p-8">
            <LineItemsSection
              rows={rows}
              services={services}
              amounts={amounts}
              onUpdateRow={updateRow}
              onApplyService={applyService}
              onDetachService={detachService}
              onAddRow={addRow}
              onAddServiceRow={addServiceRow}
              onRemoveRow={removeRow}
            />
          </div>

          <div className="border-t border-gray-100" />

          {/*  S4 Pricing adjustments + Live totals  */}
          <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <p className={LABEL}>Pricing Adjustments</p>

              {/* Province / Tax selector */}
              <div className={FIELD}>
                <label className={LABEL}>Province / Territory (Canadian Tax)</label>
                <select
                  value={province}
                  onChange={e => {
                    const code = e.target.value;
                    setProvince(code);
                    if (code && CANADA_TAX_RATES[code]) {
                      const info = CANADA_TAX_RATES[code];
                      setTaxRate(String(info.rate));
                      setTaxLabel(info.taxLabel);
                    } else {
                      setTaxLabel('');
                    }
                  }}
                  className={INPUT}
                >
                  <option value="">- Select province (or enter rate manually) -</option>
                  {PROVINCE_OPTIONS.map(p => (
                    <option key={p.code} value={p.code}>
                      {p.label} ({p.taxLabel} {p.rate}%)
                    </option>
                  ))}
                </select>
                <p className="text-xs text-amber-600 mt-0.5">
                  Verify the applicable rate for your place of supply - rates may vary by transaction type.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className={FIELD}>
                  <label className={LABEL}>Discount (%)</label>
                  <input type="number" min="0" max="100" step="0.01"
                    value={discount} onChange={e => setDiscount(e.target.value)} className={INPUT} placeholder="0" />
                </div>
                <div className={FIELD}>
                  <label className={LABEL}>
                    {taxLabel ? `${taxLabel} Rate (%)` : 'Tax Rate (%)'}
                  </label>
                  <input type="number" min="0" max="100" step="0.001"
                    value={taxRate} onChange={e => setTaxRate(e.target.value)} className={INPUT} placeholder="0" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className={FIELD}>
                  <label className={LABEL}>Shipping ($)</label>
                  <input type="number" min="0" step="0.01"
                    value={shipping} onChange={e => setShipping(e.target.value)} className={INPUT} placeholder="0.00" />
                </div>
                <div className={FIELD}>
                  <label className={LABEL}>Adjustment ($)</label>
                  <input type="number" step="0.01"
                    value={adjField} onChange={e => setAdjField(e.target.value)} className={INPUT} placeholder="0.00" />
                </div>
              </div>
            </div>

            <div>
              <p className={LABEL}>Totals</p>
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <TotalRow label="Sub Total"             value={`$${fmt(subTotal)}`} />
                {disc > 0 && <TotalRow label={`Discount (${disc}%)`} value={`-$${fmt(discAmt)}`} muted />}
                {ship > 0 && <TotalRow label="Shipping"              value={`$${fmt(ship)}`} muted />}
                {adj !== 0 && <TotalRow label="Adjustment"
                  value={adj > 0 ? `+$${fmt(adj)}` : `-$${fmt(Math.abs(adj))}`} muted />}
                {tax > 0 && <TotalRow label={`${taxLabel || 'Tax'} (${tax}%)`} value={`$${fmt(taxAmt)}`} muted />}
                <TotalRow label="Total" value={`$${fmt(total)}`} bold />
                <div className="flex items-center justify-between bg-indigo-600 px-4 py-3">
                  <span className="text-sm font-bold text-white">Balance Due</span>
                  <span className="text-xl font-black text-white">${fmt(balanceDue)}</span>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">* Live preview. Final amounts computed by server on save.</p>
            </div>
          </div>

          <div className="border-t border-gray-100" />

          {/*  S5 Notes  */}
          <div className="p-8 space-y-5">
            <div className={FIELD}>
              <label className={LABEL}>Customer Note</label>
              <textarea value={customerNote} onChange={e => setCustomerNote(e.target.value)}
                rows={3} maxLength={2000} className={`${INPUT} resize-none`}
                placeholder="Thank you for your business!" />
              <span className="text-xs text-gray-400 text-right">{customerNote.length}/2000</span>
            </div>
            <div className={FIELD}>
              <label className={LABEL}>Terms &amp; Conditions</label>
              <textarea value={termsConditions} onChange={e => setTermsConditions(e.target.value)}
                rows={4} maxLength={5000} className={`${INPUT} resize-none`}
                placeholder="Payment is due within 30 days..." />
              <span className="text-xs text-gray-400 text-right">{termsConditions.length}/5000</span>
            </div>
            {(branding?.gstNumber || branding?.pstNumber) && (
              <p className="text-xs text-gray-400">
                {[branding.gstNumber, branding.pstNumber].filter(Boolean).join('    ')}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Send email modal */}
      {sendInvoice && (
        <SendInvoiceEmailModal
          invoice={sendInvoice}
          onClose={() => setSendInvoice(null)}
          onSent={() => { flash('Invoice emailed successfully.'); navigate('/invoices'); }}
        />
      )}
    </AppShell>
  );
}

//  LineItemsSection 

interface LineItemsSectionProps {
  rows: LineRow[];
  services: ServiceOption[];
  amounts: number[];
  onUpdateRow: (id: string, patch: Partial<Omit<LineRow, 'id'>>) => void;
  onApplyService: (id: string, svc: ServiceOption) => void;
  onDetachService: (id: string) => void;
  onAddRow: () => void;
  onAddServiceRow: (svc: ServiceOption) => void;
  onRemoveRow: (id: string) => void;
}

function LineItemsSection({
  rows, services, amounts,
  onUpdateRow, onApplyService, onDetachService,
  onAddRow, onAddServiceRow, onRemoveRow,
}: LineItemsSectionProps) {
  const [svcSearch, setSvcSearch] = useState('');
  const [svcDdOpen, setSvcDdOpen] = useState(false);
  const svcDdRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function h(e: MouseEvent) {
      if (svcDdRef.current && !svcDdRef.current.contains(e.target as Node)) setSvcDdOpen(false);
    }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const filteredS = svcSearch ? services.filter(s => matchS(s, svcSearch)) : services;

  return (
    <div>
      {/* Header bar */}
      <div className="flex items-center justify-between mb-3 gap-3">
        <p className={LABEL + ' mb-0'}>Line Items</p>

        <div className="flex items-center gap-2">
          {/* Service quick-add dropdown */}
          {services.length > 0 && (
            <div className="relative" ref={svcDdRef}>
              <button type="button"
                onClick={() => setSvcDdOpen(o => !o)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 text-indigo-700 text-xs font-medium hover:bg-indigo-50 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Add from Services
              </button>
              {svcDdOpen && (
                <div className="absolute right-0 z-20 mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
                  <div className="p-2 border-b border-gray-100">
                    <input
                      autoFocus
                      value={svcSearch}
                      onChange={e => setSvcSearch(e.target.value)}
                      placeholder="Search services..."
                      className="w-full px-2 py-1.5 text-sm rounded border border-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    />
                  </div>
                  <div className="max-h-56 overflow-y-auto">
                    {filteredS.length === 0
                      ? <p className="px-3 py-3 text-sm text-gray-400 text-center">No services found</p>
                      : filteredS.map(svc => (
                        <button key={svc.id} type="button"
                          onMouseDown={() => { onAddServiceRow(svc); setSvcDdOpen(false); setSvcSearch(''); }}
                          className="w-full text-left px-3 py-2.5 hover:bg-indigo-50 border-b border-gray-50 last:border-0 transition-colors">
                          <span className="text-sm font-medium text-gray-900">{svc.name}</span>
                          <span className="ml-2 text-xs text-indigo-600 font-semibold">${fmt(svc.price)}</span>
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <button type="button" onClick={onAddRow}
            className="text-xs font-medium text-gray-500 hover:text-gray-800 transition-colors">
            + Add Blank Row
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="grid bg-indigo-600 text-white text-xs font-semibold uppercase tracking-wide
                        grid-cols-[28px_1fr_70px_90px_80px_32px] gap-1 px-3 py-2.5">
          <span>#</span>
          <span>Description / Service Term</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Rate ($)</span>
          <span className="text-right">Amount</span>
          <span />
        </div>

        {/* Rows */}
        {rows.map((row, idx) => (
          <LineItemRow
            key={row.id}
            row={row}
            idx={idx}
            amount={amounts[idx] ?? 0}
            services={services}
            canRemove={rows.length > 1}
            onUpdate={(patch) => onUpdateRow(row.id, patch)}
            onApplyService={(svc) => onApplyService(row.id, svc)}
            onDetachService={() => onDetachService(row.id)}
            onRemove={() => onRemoveRow(row.id)}
          />
        ))}
      </div>
    </div>
  );
}

//  LineItemRow 

interface LineItemRowProps {
  row: LineRow;
  idx: number;
  amount: number;
  services: ServiceOption[];
  canRemove: boolean;
  onUpdate: (patch: Partial<Omit<LineRow, 'id'>>) => void;
  onApplyService: (svc: ServiceOption) => void;
  onDetachService: () => void;
  onRemove: () => void;
}

function LineItemRow({
  row, idx, amount, services, canRemove,
  onUpdate, onApplyService, onDetachService, onRemove,
}: LineItemRowProps) {
  const [svcOpen,   setSvcOpen]   = useState(false);
  const [svcSearch, setSvcSearch] = useState('');
  const svcRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function h(e: MouseEvent) {
      if (svcRef.current && !svcRef.current.contains(e.target as Node)) setSvcOpen(false);
    }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const filteredS = svcSearch ? services.filter(s => matchS(s, svcSearch)) : services;

  return (
    <div className={`grid grid-cols-[28px_1fr_70px_90px_80px_32px] gap-1 items-start
                     px-3 py-2.5 border-b border-gray-100 last:border-0
                     ${idx % 2 === 1 ? 'bg-gray-50' : 'bg-white'}`}>

      {/* # */}
      <span className="text-xs text-gray-400 pt-2.5 text-center">{idx + 1}</span>

      {/* Description col - contains service badge, description input, term input, and inline service picker */}
      <div className="flex flex-col gap-1.5 relative" ref={svcRef}>

        {/* Service badge (when a service is linked) */}
        {row.serviceId && (
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-medium">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 2.25 0 0 0 0-4.5H6v4.5Zm0 0h2.25a2.25 2.25 0 0 1 0 4.5H6v-4.5Zm0-4.5v4.5" />
              </svg>
              {row.serviceName}
            </span>
            <button type="button" onClick={onDetachService}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors"
              title="Unlink service (keep text)">
              unlink
            </button>
          </div>
        )}

        {/* Description input - with inline service-picker trigger when no service linked */}
        <div className="flex items-center gap-1">
          <input
            value={row.description}
            onChange={e => onUpdate({ description: e.target.value })}
            placeholder={row.serviceId ? 'Description (editable)' : 'Item or service description'}
            maxLength={500}
            className={INPUT_SM + ' flex-1'}
          />
          {/* Per-row service picker toggle (only when no service linked and services exist) */}
          {!row.serviceId && services.length > 0 && (
            <button type="button"
              onClick={() => { setSvcOpen(o => !o); setSvcSearch(''); }}
              className="shrink-0 px-2 py-1.5 rounded border border-indigo-200 text-indigo-600 text-xs hover:bg-indigo-50 transition-colors whitespace-nowrap"
              title="Pick from Services catalogue">
              Pick service
            </button>
          )}
        </div>

        {/* Inline service dropdown for this row */}
        {svcOpen && !row.serviceId && (
          <div className="absolute top-full left-0 z-30 mt-0.5 w-72 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
            <div className="p-2 border-b border-gray-100">
              <input
                autoFocus
                value={svcSearch}
                onChange={e => setSvcSearch(e.target.value)}
                placeholder="Search services..."
                className="w-full px-2 py-1.5 text-sm rounded border border-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </div>
            <div className="max-h-48 overflow-y-auto">
              {filteredS.length === 0
                ? <p className="px-3 py-3 text-sm text-gray-400 text-center">No services found</p>
                : filteredS.map(svc => (
                  <button key={svc.id} type="button"
                    onMouseDown={() => { onApplyService(svc); setSvcOpen(false); setSvcSearch(''); }}
                    className="w-full text-left px-3 py-2.5 hover:bg-indigo-50 border-b border-gray-50 last:border-0 transition-colors">
                    <span className="text-sm font-medium text-gray-900">{svc.name}</span>
                    <span className="ml-2 text-xs text-indigo-600 font-semibold">${fmt(svc.price)}</span>
                  </button>
                ))}
            </div>
          </div>
        )}

        {/* Service term */}
        <input
          value={row.serviceTerm}
          onChange={e => onUpdate({ serviceTerm: e.target.value })}
          placeholder="Service term, e.g. June 15, 2026 - June 14, 2027"
          maxLength={200}
          className={`${INPUT_SM} text-xs text-gray-400 italic`}
        />
      </div>

      {/* Qty */}
      <input type="number" min="0" step="any"
        value={row.quantity}
        onChange={e => onUpdate({ quantity: e.target.value })}
        className={`${INPUT_SM} text-right`}
      />

      {/* Rate */}
      <input type="number" min="0" step="0.01"
        value={row.rate}
        onChange={e => onUpdate({ rate: e.target.value })}
        placeholder="0.00"
        className={`${INPUT_SM} text-right`}
      />

      {/* Amount */}
      <span className="text-sm font-semibold text-gray-800 text-right pt-2 pr-1">
        {fmt(amount)}
      </span>

      {/* Remove */}
      <button type="button" onClick={onRemove} disabled={!canRemove}
        className="text-gray-300 hover:text-red-500 disabled:opacity-20 transition-colors text-xl leading-none pt-1.5 text-center">
        x
      </button>
    </div>
  );
}

//  TotalRow 

function TotalRow({ label, value, bold, muted }: {
  label: string; value: string; bold?: boolean; muted?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between px-4 py-2.5 border-b border-gray-100 last:border-0
                     ${bold ? 'bg-gray-50' : ''}`}>
      <span className={`text-sm ${muted ? 'text-gray-400' : bold ? 'font-semibold text-gray-800' : 'text-gray-600'}`}>
        {label}
      </span>
      <span className={`text-sm ${bold ? 'font-bold text-gray-900' : muted ? 'text-gray-400' : 'text-gray-700'}`}>
        {value}
      </span>
    </div>
  );
}
