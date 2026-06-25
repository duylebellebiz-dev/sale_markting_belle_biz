import { useEffect, useRef, useState } from 'react';
import AppShell from '../components/AppShell';
import { businessesApi } from '../features/businesses/businessesApi';
import type { BusinessBranding, UpdateBrandingPayload } from '../features/businesses/businessesApi';

// VITE_API_URL is the NestJS base (e.g. http://localhost:3000) — same origin serves /uploads
const BACKEND = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000';

const INPUT =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';
const LABEL = 'text-xs font-medium text-gray-600 uppercase tracking-wide';
const SECTION = 'bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className={LABEL}>{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function BrandingPage() {
  const [branding, setBranding] = useState<BusinessBranding | null>(null);
  const [loadErr, setLoadErr]   = useState<string | null>(null);

  // Form state — mirrors BusinessBranding fields
  const [businessName,        setBusinessName]        = useState('');
  const [addressLine,         setAddressLine]         = useState('');
  const [country,             setCountry]             = useState('');
  const [phone,               setPhone]               = useState('');
  const [website,             setWebsite]             = useState('');
  const [gstNumber,           setGstNumber]           = useState('');
  const [pstNumber,           setPstNumber]           = useState('');
  const [defaultTaxRate,      setDefaultTaxRate]      = useState('');
  const [defaultCustomerNote, setDefaultCustomerNote] = useState('');
  const [defaultTerms,        setDefaultTerms]        = useState('');
  const [currentInvoiceNumber, setCurrentInvoiceNumber] = useState('');

  const [saving,   setSaving]   = useState(false);
  const [saveMsg,  setSaveMsg]  = useState<string | null>(null);
  const [saveErr,  setSaveErr]  = useState<string | null>(null);

  // Logo upload state
  const [logoPreview,    setLogoPreview]    = useState<string | null>(null);
  const [logoFile,       setLogoFile]       = useState<File | null>(null);
  const [logoErr,        setLogoErr]        = useState<string | null>(null);
  const [uploading,      setUploading]      = useState(false);
  const [logoSaved,      setLogoSaved]      = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load
  useEffect(() => {
    businessesApi
      .getBranding()
      .then((b) => {
        setBranding(b);
        setBusinessName(b.businessName ?? '');
        setAddressLine(b.addressLine ?? '');
        setCountry(b.country ?? '');
        setPhone(b.phone ?? '');
        setWebsite(b.website ?? '');
        setGstNumber(b.gstNumber ?? '');
        setPstNumber(b.pstNumber ?? '');
        setDefaultTaxRate(b.defaultTaxRate != null ? String(b.defaultTaxRate) : '');
        setDefaultCustomerNote(b.defaultCustomerNote ?? '');
        setDefaultTerms(b.defaultTerms ?? '');
        setCurrentInvoiceNumber(b.currentInvoiceNumber ?? '');
      })
      .catch(() => setLoadErr('Failed to load branding settings. Please refresh.'));
  }, []);

  // ── Logo handling ────────────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoErr(null);
    setLogoSaved(false);

    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setLogoErr('Only PNG or JPG files are accepted.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setLogoErr('File must be under 2 MB.');
      return;
    }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  async function handleLogoUpload() {
    if (!logoFile) return;
    setLogoErr(null);
    setUploading(true);
    try {
      const updated = await businessesApi.uploadLogo(logoFile);
      setBranding(updated);
      setLogoFile(null);
      setLogoPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setLogoSaved(true);
      setTimeout(() => setLogoSaved(false), 4000);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })
        ?.response?.data?.message;
      setLogoErr(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Upload failed. Please try again.'));
    } finally {
      setUploading(false);
    }
  }

  function handleLogoCancel() {
    setLogoFile(null);
    setLogoPreview(null);
    setLogoErr(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // ── Save company info ────────────────────────────────────────────────────────

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveErr(null);
    setSaveMsg(null);

    const taxRate = parseFloat(defaultTaxRate);
    if (defaultTaxRate && (isNaN(taxRate) || taxRate < 0 || taxRate > 100)) {
      setSaveErr('Tax rate must be a number between 0 and 100.');
      return;
    }

    const payload: UpdateBrandingPayload = {
      businessName:        businessName.trim()        || undefined,
      addressLine:         addressLine.trim()         || undefined,
      country:             country.trim()             || undefined,
      phone:               phone.trim()               || undefined,
      website:             website.trim()             || undefined,
      gstNumber:           gstNumber.trim()           || undefined,
      pstNumber:           pstNumber.trim()           || undefined,
      defaultTaxRate:      defaultTaxRate ? taxRate : 0,
      defaultCustomerNote: defaultCustomerNote.trim() || undefined,
      defaultTerms:        defaultTerms.trim()        || undefined,
      currentInvoiceNumber: currentInvoiceNumber.trim() || undefined,
    };

    setSaving(true);
    try {
      const updated = await businessesApi.updateBranding(payload);
      setBranding((b) => b ? { ...b, ...updated } : updated);
      setSaveMsg('Settings saved.');
      setTimeout(() => setSaveMsg(null), 4000);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })
        ?.response?.data?.message;
      setSaveErr(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Failed to save. Please try again.'));
    } finally {
      setSaving(false);
    }
  }

  const currentLogoSrc =
    logoPreview ??
    (branding?.logoUrl ? `${BACKEND}${branding.logoUrl}` : null);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <AppShell title="Branding">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Branding & Company Info</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            This information appears on invoices and PDFs sent to customers.
          </p>
        </div>

        {/* Load error */}
        {loadErr && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {loadErr}
          </div>
        )}

        {/* ── Logo ── */}
        <section className={SECTION}>
          <h3 className="text-base font-semibold text-gray-800">Company Logo</h3>

          <div className="flex items-start gap-6">
            {/* Preview */}
            <div className="shrink-0 w-24 h-24 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center overflow-hidden">
              {currentLogoSrc ? (
                <img
                  src={currentLogoSrc}
                  alt="Company logo"
                  className="w-full h-full object-contain p-1"
                />
              ) : (
                <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 21h18M3.75 3h16.5A.75.75 0 0121 3.75v16.5a.75.75 0 01-.75.75H3.75A.75.75 0 013 20.25V3.75A.75.75 0 013.75 3z" />
                </svg>
              )}
            </div>

            {/* Controls */}
            <div className="flex-1 space-y-2">
              <p className="text-sm text-gray-600">
                PNG or JPG, maximum 2 MB. Recommended: at least 300 × 100 px on a transparent or white background.
              </p>

              {!logoFile ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  {branding?.logoUrl ? 'Replace Logo' : 'Upload Logo'}
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleLogoUpload}
                    disabled={uploading}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    {uploading ? 'Uploading…' : 'Save Logo'}
                  </button>
                  <button
                    type="button"
                    onClick={handleLogoCancel}
                    className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <span className="text-xs text-gray-500 truncate max-w-[160px]">{logoFile.name}</span>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={handleFileChange}
              />

              {logoErr && <p className="text-xs text-red-600">{logoErr}</p>}
              {logoSaved && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  Logo saved successfully.
                </p>
              )}
            </div>
          </div>
        </section>

        {/* ── Company info form ── */}
        <form onSubmit={handleSave} className="space-y-6">

          {/* Company Info */}
          <section className={SECTION}>
            <h3 className="text-base font-semibold text-gray-800">Company Information</h3>

            <Field label="Business Name *">
              <input
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className={INPUT}
                placeholder="Acme Nail Studio"
              />
            </Field>

            <Field label="Address" hint="Full address printed on invoices, e.g. 3355 153 Ave Edmonton Alberta T5Y 4E1">
              <input
                value={addressLine}
                onChange={(e) => setAddressLine(e.target.value)}
                className={INPUT}
                placeholder="3355 153 Ave, Edmonton, Alberta T5Y 4E1"
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Country">
                <input
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className={INPUT}
                  placeholder="Canada"
                />
              </Field>
              <Field label="Phone">
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={INPUT}
                  placeholder="+1 780-555-0000"
                />
              </Field>
            </div>

            <Field label="Website">
              <input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className={INPUT}
                placeholder="https://acmestudio.ca"
              />
            </Field>
          </section>

          {/* Tax & Registration */}
          <section className={SECTION}>
            <h3 className="text-base font-semibold text-gray-800">Tax & Registration Numbers</h3>

            <div className="grid grid-cols-2 gap-4">
              <Field label="GST Number" hint="e.g. GST No. 723967477RT0001">
                <input
                  value={gstNumber}
                  onChange={(e) => setGstNumber(e.target.value)}
                  className={INPUT}
                  placeholder="GST No. 000000000RT0001"
                />
              </Field>
              <Field label="PST Number" hint="e.g. PST-1502-2461">
                <input
                  value={pstNumber}
                  onChange={(e) => setPstNumber(e.target.value)}
                  className={INPUT}
                  placeholder="PST-0000-0000"
                />
              </Field>
            </div>

            <Field label="Default Tax Rate (%)" hint="Applied automatically to new invoices. Enter 5 for GST 5%.">
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={defaultTaxRate}
                onChange={(e) => setDefaultTaxRate(e.target.value)}
                className={`${INPUT} max-w-[160px]`}
                placeholder="5"
              />
            </Field>
          </section>

          {/* Invoice Defaults */}
          <section className={SECTION}>
            <h3 className="text-base font-semibold text-gray-800">Invoice Defaults</h3>
            <p className="text-xs text-gray-500 -mt-2">
              Pre-fill the customer note and terms on every new invoice. The user can still edit them per invoice.
            </p>

            <Field
              label="Current Invoice Number"
              hint="Enter your latest existing invoice number once, for example HR0002345. The next invoice will auto-generate as HR0002346."
            >
              <input
                value={currentInvoiceNumber}
                onChange={(e) => setCurrentInvoiceNumber(e.target.value)}
                className={`${INPUT} max-w-sm`}
                placeholder="HR0002345"
              />
            </Field>

            <Field label="Default Customer Note">
              <textarea
                value={defaultCustomerNote}
                onChange={(e) => setDefaultCustomerNote(e.target.value)}
                rows={3}
                maxLength={2000}
                className={`${INPUT} resize-none`}
                placeholder="Thank you for partnering with us. We appreciate your business!"
              />
              <p className="text-xs text-gray-400 text-right">{defaultCustomerNote.length}/2000</p>
            </Field>

            <Field label="Default Terms & Conditions">
              <textarea
                value={defaultTerms}
                onChange={(e) => setDefaultTerms(e.target.value)}
                rows={5}
                maxLength={5000}
                className={`${INPUT} resize-none`}
                placeholder="Payment is due within 30 days of invoice date. Late payments may be subject to a 2% monthly interest charge…"
              />
              <p className="text-xs text-gray-400 text-right">{defaultTerms.length}/5000</p>
            </Field>
          </section>

          {/* Save row */}
          <div className="flex items-center justify-between gap-4 py-2">
            <div className="text-sm">
              {saveMsg && (
                <span className="flex items-center gap-1.5 text-green-600 font-medium">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  {saveMsg}
                </span>
              )}
              {saveErr && (
                <span className="text-red-600">{saveErr}</span>
              )}
            </div>
            <button
              type="submit"
              disabled={saving || !branding}
              className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
