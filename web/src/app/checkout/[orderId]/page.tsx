'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';
import Link from 'next/link';
import CheckoutForm from '@/components/CheckoutForm';

interface OrderData {
  id: string;
  amount?: number | null;
  tax?: number | null;
  taxRate?: number;
  currency?: string;
  product: { name: string; price: number; description?: string; image?: string };
  payment?: { id: string; amount: number; currency: string; status: string; paymentMethod?: string | null; createdAt: string };
}

interface ShippingAddress {
  fullName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
}

const EMPTY_ADDRESS: ShippingAddress = { fullName: '', addressLine1: '', addressLine2: '', city: '', state: '', postalCode: '', country: 'US', phone: '' };

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'];
const CA_PROVINCES = ['AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT'];

function CheckoutContent({ params }: { params: Promise<{ orderId: string }> }) {
  const { data: session, status: authStatus } = useSession();
  const searchParams = useSearchParams();
  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1); // 1=account, 2=shipping, 3=payment
  const [guestMode, setGuestMode] = useState(false);
  const [guestEmail, setGuestEmail] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestEmailError, setGuestEmailError] = useState('');
  const [paypalMessage, setPaypalMessage] = useState<string | null>(null);
  const [address, setAddress] = useState<ShippingAddress>({ ...EMPTY_ADDRESS });
  const [addressErrors, setAddressErrors] = useState<Partial<ShippingAddress>>({});
  const [savedAddress, setSavedAddress] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{
    isValid: boolean;
    warnings: string[];
    suggestion?: { addressLine1: string; addressLine2?: string; city: string; state: string; postalCode: string };
  } | null>(null);

  // Shipping rates fetched after address is confirmed.
  type ShippingRate = { serviceCode: string; serviceName: string; totalCharge: number; currency: string; estimatedDays?: number };
  const [rates, setRates] = useState<ShippingRate[]>([]);
  const [selectedRate, setSelectedRate] = useState<ShippingRate | null>(null);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [ratesError, setRatesError] = useState<string | null>(null);
  const [ratesCarrier, setRatesCarrier] = useState<string>('UPS');
  // Server-driven flag: when true the customer is NOT charged shipping
  // (AWULA K eats it). Defaults to true on initial render so the UI never
  // briefly shows a charge that's about to disappear.
  const [absorbShipping, setAbsorbShipping] = useState<boolean>(true);
  // Extra the customer pays on an international order while AWULA K absorbs the
  // domestic-equivalent (cheapest intl rate − domestic Ground Advantage).
  const [internationalSurcharge, setInternationalSurcharge] = useState<number>(0);

  const isSignedIn = authStatus === 'authenticated' && session?.user;

  useEffect(() => {
    (async () => {
      const { orderId } = await params;
      try {
        const r = await fetch(`/api/orders/${orderId}`);
        if (r.ok) setOrder(await r.json());
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [params]);

  useEffect(() => {
    if (isSignedIn && step === 1) {
      setGuestName(session?.user?.name || '');
      setStep(2);
    }
  }, [isSignedIn, step, session]);

  useEffect(() => {
    const provider = searchParams.get('provider');
    const status = searchParams.get('status');
    if (provider === 'paypal') { setStep(3); if (!isSignedIn) setGuestMode(true); setSavedAddress(true); }
    setPaypalMessage(provider === 'paypal' && status === 'cancelled' ? 'PayPal checkout was cancelled. You can try again.' : null);
  }, [isSignedIn, searchParams]);

  const validateEmail = () => {
    if (!guestEmail.trim()) { setGuestEmailError('Email is required'); return false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) { setGuestEmailError('Enter a valid email'); return false; }
    setGuestEmailError(''); return true;
  };

  const handleGuestContinue = () => { if (validateEmail()) { setAddress(a => ({ ...a, fullName: a.fullName || guestName })); setStep(2); } };

  const validateAddress = () => {
    const e: Partial<ShippingAddress> = {};
    if (!address.fullName.trim()) e.fullName = 'Required';
    if (!address.addressLine1.trim()) e.addressLine1 = 'Required';
    if (!address.city.trim()) e.city = 'Required';
    if (!address.state) e.state = address.country === 'CA' ? 'Select a province' : 'Select a state';
    if (!address.postalCode.trim()) e.postalCode = 'Required';
    else if (address.country === 'CA') {
      if (!/^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/.test(address.postalCode.trim())) e.postalCode = 'Invalid postal code';
    } else {
      if (!/^\d{5}(-\d{4})?$/.test(address.postalCode)) e.postalCode = 'Invalid ZIP';
    }
    setAddressErrors(e); return Object.keys(e).length === 0;
  };

  const handleVerifyAddress = async () => {
    if (!validateAddress()) return;
    // Canadian addresses can't be verified with USPS — just mark valid.
    if (address.country === 'CA') {
      setVerifyResult({ isValid: true, warnings: [] });
      return;
    }
    setVerifying(true);
    setVerifyResult(null);
    try {
      const res = await fetch('/api/shipping/validate-address', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: address.fullName,
          addressLine1: address.addressLine1,
          addressLine2: address.addressLine2 || undefined,
          city: address.city,
          state: address.state,
          postalCode: address.postalCode,
          country: 'US',
          phone: address.phone || undefined,
        }),
      });
      const data = await res.json();
      const std = data.standardized as undefined | { addressLine1: string; addressLine2?: string; city: string; state: string; postalCode: string };
      // Only surface a "use suggested" prompt when USPS actually changed something
      // beyond casing, so we don't pester the user with cosmetic diffs.
      const normalized = (s: string) => (s || '').trim().toUpperCase();
      const changed = std && (
        normalized(std.addressLine1) !== normalized(address.addressLine1) ||
        normalized(std.city) !== normalized(address.city) ||
        normalized(std.state) !== normalized(address.state) ||
        normalized(std.postalCode) !== normalized(address.postalCode)
      );
      setVerifyResult({
        isValid: Boolean(data.isValid),
        warnings: Array.isArray(data.warnings) ? data.warnings : [],
        suggestion: changed ? std : undefined,
      });
    } catch {
      setVerifyResult({ isValid: false, warnings: ['Verification temporarily unavailable'] });
    } finally {
      setVerifying(false);
    }
  };

  const applySuggestion = () => {
    const s = verifyResult?.suggestion;
    if (!s) return;
    setAddress((a) => ({
      ...a,
      addressLine1: s.addressLine1,
      addressLine2: s.addressLine2 ?? a.addressLine2,
      city: s.city,
      state: s.state,
      postalCode: s.postalCode,
    }));
    setVerifyResult({ isValid: true, warnings: [], suggestion: undefined });
  };

  const fetchRates = async () => {
    setRatesLoading(true);
    setRatesError(null);
    try {
      const res = await fetch('/api/shipping/rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientName: address.fullName,
          addressLine1: address.addressLine1,
          addressLine2: address.addressLine2 || undefined,
          city: address.city,
          state: address.state,
          postalCode: address.postalCode,
          country: address.country,
          // Defaults match auto-shipping DEFAULT_PACKAGE — a typical apparel parcel.
          weight: 2,
          length: 16,
          width: 12,
          height: 4,
        }),
      });
      const data = await res.json();
      if (typeof data.absorbShipping === 'boolean') setAbsorbShipping(data.absorbShipping);
      setInternationalSurcharge(typeof data.internationalSurcharge === 'number' ? data.internationalSurcharge : 0);
      if (!res.ok || !Array.isArray(data.rates) || data.rates.length === 0) {
        setRatesError(data.error || 'No shipping rates available for this address');
        setRates([]);
        setSelectedRate(null);
      } else {
        setRates(data.rates as ShippingRate[]);
        setRatesCarrier(data.carrier || 'UPS');
        // Default to cheapest (the API sorts ascending already).
        const cheapest = data.rates[0] as ShippingRate;
        setSelectedRate(cheapest);
        if (order) {
          // Persist the chosen rate so the server-side payment record has it too.
          fetch(`/api/orders/${order.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              shippingCost: cheapest.totalCharge,
              shippingService: cheapest.serviceCode,
              shippingCarrier: data.carrier || 'UPS',
            }),
          }).catch((e) => console.error('Failed to save shipping rate:', e));
        }
      }
    } catch (e) {
      setRatesError(e instanceof Error ? e.message : 'Failed to fetch shipping rates');
    } finally {
      setRatesLoading(false);
    }
  };

  const selectRate = (rate: ShippingRate) => {
    setSelectedRate(rate);
    if (order) {
      fetch(`/api/orders/${order.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingCost: rate.totalCharge,
          shippingService: rate.serviceCode,
          shippingCarrier: ratesCarrier,
        }),
      }).catch((e) => console.error('Failed to update shipping rate:', e));
    }
  };

  const handleAddressContinue = async () => {
    if (!validateAddress()) return;
    setSavedAddress(true);
    // Save shipping address to order
    if (order) {
      try {
        await fetch(`/api/orders/${order.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shippingName: address.fullName,
            shippingAddress: address.addressLine1,
            shippingAddress2: address.addressLine2,
            shippingCity: address.city,
            shippingState: address.state,
            shippingZip: address.postalCode,
            shippingCountry: address.country,
            shippingPhone: address.phone,
          }),
        });
      } catch (e) { console.error('Failed to save address:', e); }
    }
    setStep(3);
    // Fetch rates now that we know the destination address.
    fetchRates();
  };

  if (authStatus === 'loading' || loading) return <div className="min-h-screen flex items-center justify-center bg-[#FAF7F2]"><div className="loading-spinner mx-auto" /></div>;
  if (!order) return <div className="min-h-screen flex items-center justify-center bg-[#FAF7F2]"><p className="text-sm text-[#8B7569]">Order not found</p></div>;

  const pStatus = order.payment?.status || 'pending';
  const paid = pStatus === 'succeeded';
  const quotedShipping = selectedRate?.totalCharge ?? 0;
  // What the customer actually pays for shipping:
  //  - absorbing: domestic is free ($0); international pays the surcharge
  //    (cheapest intl rate − domestic Ground Advantage), AWULA K eats the rest.
  //  - not absorbing: customer pays the full quoted rate.
  const customerShipping = absorbShipping ? internationalSurcharge : quotedShipping;
  const checkoutLockedTotal = !paid && pStatus === 'pending' && order.amount != null && order.tax != null;
  const subtotal = checkoutLockedTotal
    ? Math.max((order.amount || 0) - (order.tax || 0) - customerShipping, 0)
    : (order.amount ?? order.product.price);
  const taxRate = Math.max(0, Math.min(100, order.taxRate || 0));
  const estimatedTax = (order.tax != null && order.tax >= 0)
    ? Math.max(0, order.tax)
    : Math.round(subtotal * taxRate) / 100;
  // After payment, payment.amount IS the final total. Before payment, sum.
  const amt = paid
    ? (order.payment?.amount ?? subtotal)
    : (checkoutLockedTotal ? (order.amount || (subtotal + customerShipping + estimatedTax)) : (subtotal + customerShipping + estimatedTax));
  // Customer can pay as soon as address is saved — rates and the absorb flag
  // are advisory, not blocking.
  const canPay = (isSignedIn || (guestMode && guestEmail)) && savedAddress;

  const inp = 'w-full text-sm border rounded-lg px-3 py-2.5 bg-white text-[#1B2A5B] transition-colors focus:ring-1 focus:ring-[#1B2A5B]';
  const lbl = 'block text-xs font-semibold uppercase tracking-wider text-[#8B7569] mb-1.5';
  const err = 'text-xs text-[#C41E3A] mt-0.5';

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      {/* Header */}
      <header className="border-b border-[rgba(27,42,91,0.08)] bg-white">
        <div className="max-w-[960px] mx-auto px-6 flex items-center justify-between h-14">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-sm font-medium tracking-[0.15em] uppercase text-[#1B2A5B]">AWULA K</Link>
            <span className="text-xs text-[#8B7569]">/</span>
            <span className="text-sm text-[#1B2A5B]">Checkout</span>
          </div>
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-[#22C55E]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
            <span className="text-xs text-[#8B7569]">Secure checkout</span>
          </div>
        </div>
      </header>

      {/* Steps */}
      <div className="bg-white border-b border-[rgba(27,42,91,0.08)]">
        <div className="max-w-[960px] mx-auto px-6 py-3 flex items-center justify-center gap-2">
          {['Account', 'Shipping', 'Payment'].map((label, i) => {
            const n = i + 1; const active = step === n; const done = step > n || paid;
            return (
              <div key={label} className="flex items-center gap-2">
                {i > 0 && <div className={`w-8 h-px ${done ? 'bg-[#22C55E]' : 'bg-[#E5E7EB]'}`} />}
                <div className="flex items-center gap-1.5">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${done ? 'bg-[#22C55E] text-white' : active ? 'bg-[#1B2A5B] text-white' : 'bg-[#E5E7EB] text-[#8B7569]'}`}>{done ? '✓' : n}</span>
                  <span className={`text-xs font-medium ${active ? 'text-[#1B2A5B]' : 'text-[#8B7569]'}`}>{label}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <main className="max-w-[960px] mx-auto px-6 py-8">
        <div className="grid lg:grid-cols-[1fr_340px] gap-8">
          {/* Left — Steps */}
          <div className="space-y-4">

            {/* STEP 1: Account */}
            {step === 1 && !isSignedIn && (
              <div className="animate-fade-in space-y-4">
                {!guestMode ? (
                  <>
                    <div className="bg-white rounded-xl p-6 border-2 border-[#1B2A5B]">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-base font-semibold text-[#1B2A5B]">Sign in to your account</h3>
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-[#1B2A5B] text-white px-2 py-0.5 rounded">Recommended</span>
                      </div>
                      <p className="text-sm text-[#8B7569] mb-4">Track orders, save addresses, and get personalized recommendations.</p>
                      <div className="flex gap-3">
                        <button onClick={() => signIn(undefined, { callbackUrl: typeof window !== 'undefined' ? window.location.pathname : '/' })} className="flex-1 py-2.5 rounded-lg bg-[#1B2A5B] text-white text-sm font-semibold hover:bg-[#2D4A8C] transition-colors">Sign In</button>
                        <Link href="/auth/signup" className="flex-1 py-2.5 rounded-lg border border-[#1B2A5B] text-[#1B2A5B] text-sm font-semibold text-center hover:bg-[#FAF7F2] transition-colors">Create Account</Link>
                      </div>
                    </div>
                    <div className="flex items-center gap-4"><div className="flex-1 h-px bg-[#E5E7EB]" /><span className="text-xs text-[#8B7569]">or</span><div className="flex-1 h-px bg-[#E5E7EB]" /></div>
                    <button onClick={() => setGuestMode(true)} className="w-full bg-white rounded-xl p-5 border border-[#E5E7EB] text-left hover:border-[#8B7569] transition-colors">
                      <h3 className="text-base font-semibold text-[#1B2A5B]">Continue as Guest</h3>
                      <p className="text-sm text-[#8B7569] mt-0.5">No account needed. We&apos;ll email your receipt.</p>
                    </button>
                  </>
                ) : (
                  <div className="bg-white rounded-xl p-6 border border-[#E5E7EB]">
                    <h3 className="text-base font-semibold text-[#1B2A5B] mb-3">Guest Information</h3>
                    <div className="space-y-3">
                      <div><label className={lbl}>Email <span className="text-[#C41E3A]">*</span></label><input type="email" value={guestEmail} onChange={e => { setGuestEmail(e.target.value); setGuestEmailError(''); }} placeholder="your@email.com" className={`${inp} ${guestEmailError ? 'border-[#C41E3A]' : 'border-[#D1D5DB]'}`} />{guestEmailError && <p className={err}>{guestEmailError}</p>}</div>
                      <div><label className={lbl}>Full Name</label><input value={guestName} onChange={e => setGuestName(e.target.value)} placeholder="Your full name" className={`${inp} border-[#D1D5DB]`} /></div>
                      <button onClick={handleGuestContinue} className="w-full py-2.5 rounded-lg bg-[#1B2A5B] text-white text-sm font-semibold hover:bg-[#2D4A8C] transition-colors">Continue to Shipping</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STEP 2: Shipping */}
            {step === 2 && (
              <div className="animate-fade-in space-y-4">
                <div className="bg-white rounded-xl p-4 border border-[#E5E7EB] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-[#22C55E] text-white flex items-center justify-center text-xs font-bold">✓</span>
                    <div><p className="text-xs text-[#8B7569]">Account</p><p className="text-sm font-medium text-[#1B2A5B]">{isSignedIn ? session?.user?.email : guestEmail}</p></div>
                  </div>
                  {!isSignedIn && <button onClick={() => setStep(1)} className="text-xs text-[#C41E3A] hover:underline">Change</button>}
                </div>
                <div className="bg-white rounded-xl p-6 border border-[#E5E7EB]">
                  <h3 className="text-base font-semibold text-[#1B2A5B] mb-4">Shipping Address</h3>
                  <div className="space-y-3">
                    <div><label className={lbl}>Full Name <span className="text-[#C41E3A]">*</span></label><input value={address.fullName} onChange={e => setAddress({...address, fullName: e.target.value})} placeholder="First and last name" className={`${inp} ${addressErrors.fullName ? 'border-[#C41E3A]' : 'border-[#D1D5DB]'}`} />{addressErrors.fullName && <p className={err}>{addressErrors.fullName}</p>}</div>
                    <div><label className={lbl}>Country <span className="text-[#C41E3A]">*</span></label><select value={address.country} onChange={e => setAddress({...address, country: e.target.value, state: '', postalCode: ''})} className={`${inp} border-[#D1D5DB]`}><option value="US">United States</option><option value="CA">Canada</option></select></div>
                    <div><label className={lbl}>Address Line 1 <span className="text-[#C41E3A]">*</span></label><input value={address.addressLine1} onChange={e => setAddress({...address, addressLine1: e.target.value})} placeholder="Street address, P.O. box" className={`${inp} ${addressErrors.addressLine1 ? 'border-[#C41E3A]' : 'border-[#D1D5DB]'}`} />{addressErrors.addressLine1 && <p className={err}>{addressErrors.addressLine1}</p>}</div>
                    <div><label className={lbl}>Address Line 2</label><input value={address.addressLine2} onChange={e => setAddress({...address, addressLine2: e.target.value})} placeholder="Apt, suite, unit (optional)" className={`${inp} border-[#D1D5DB]`} /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className={lbl}>City <span className="text-[#C41E3A]">*</span></label><input value={address.city} onChange={e => setAddress({...address, city: e.target.value})} className={`${inp} ${addressErrors.city ? 'border-[#C41E3A]' : 'border-[#D1D5DB]'}`} />{addressErrors.city && <p className={err}>{addressErrors.city}</p>}</div>
                      <div><label className={lbl}>{address.country === 'CA' ? 'Province' : 'State'} <span className="text-[#C41E3A]">*</span></label><select value={address.state} onChange={e => setAddress({...address, state: e.target.value})} className={`${inp} ${addressErrors.state ? 'border-[#C41E3A]' : 'border-[#D1D5DB]'}`}><option value="">Select...</option>{(address.country === 'CA' ? CA_PROVINCES : US_STATES).map(s => <option key={s} value={s}>{s}</option>)}</select>{addressErrors.state && <p className={err}>{addressErrors.state}</p>}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className={lbl}>{address.country === 'CA' ? 'Postal Code' : 'ZIP Code'} <span className="text-[#C41E3A]">*</span></label><input value={address.postalCode} onChange={e => setAddress({...address, postalCode: e.target.value})} placeholder={address.country === 'CA' ? 'A1A 1A1' : '12345'} className={`${inp} ${addressErrors.postalCode ? 'border-[#C41E3A]' : 'border-[#D1D5DB]'}`} />{addressErrors.postalCode && <p className={err}>{addressErrors.postalCode}</p>}</div>
                      <div><label className={lbl}>Phone</label><input value={address.phone} onChange={e => setAddress({...address, phone: e.target.value})} placeholder="(optional)" className={`${inp} border-[#D1D5DB]`} /></div>
                    </div>
                    {verifyResult && (
                      <div className={`rounded-lg p-3 text-sm ${verifyResult.isValid && !verifyResult.suggestion ? 'bg-[#ECFDF5] text-[#065F46] border border-[#A7F3D0]' : 'bg-[#FFFBEB] text-[#92400E] border border-[#FDE68A]'}`}>
                        {verifyResult.suggestion ? (
                          <>
                            <p className="font-semibold mb-1">USPS suggests a correction:</p>
                            <p className="font-mono text-xs leading-relaxed mb-2">
                              {verifyResult.suggestion.addressLine1}
                              {verifyResult.suggestion.addressLine2 ? ` ${verifyResult.suggestion.addressLine2}` : ''}<br />
                              {verifyResult.suggestion.city}, {verifyResult.suggestion.state} {verifyResult.suggestion.postalCode}
                            </p>
                            <div className="flex gap-2">
                              <button type="button" onClick={applySuggestion} className="px-3 py-1.5 rounded bg-[#1B2A5B] text-white text-xs font-semibold">Use suggested</button>
                              <button type="button" onClick={() => setVerifyResult(null)} className="px-3 py-1.5 rounded border border-[#FDE68A] text-xs font-semibold">Keep as entered</button>
                            </div>
                          </>
                        ) : verifyResult.isValid ? (
                          <p>Address verified with USPS.</p>
                        ) : (
                          <p>{verifyResult.warnings[0] || 'Could not verify this address. You can still continue.'}</p>
                        )}
                      </div>
                    )}
                    <div className={`grid gap-3 mt-2 ${address.country !== 'CA' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                      {address.country !== 'CA' && <button onClick={handleVerifyAddress} disabled={verifying} className="py-3 rounded-lg border border-[#1B2A5B] text-[#1B2A5B] text-sm font-semibold hover:bg-[#FAF7F2] transition-colors disabled:opacity-50">{verifying ? 'Verifying…' : 'Verify with USPS'}</button>}
                      <button onClick={handleAddressContinue} className="py-3 rounded-lg bg-[#1B2A5B] text-white text-sm font-semibold hover:bg-[#2D4A8C] transition-colors">Continue to Payment</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: Payment */}
            {step === 3 && (
              <div className="animate-fade-in space-y-4">
                <div className="bg-white rounded-xl p-4 border border-[#E5E7EB] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-[#22C55E] text-white flex items-center justify-center text-xs font-bold">✓</span>
                    <div><p className="text-xs text-[#8B7569]">Account</p><p className="text-sm font-medium text-[#1B2A5B]">{isSignedIn ? session?.user?.email : guestEmail}</p></div>
                  </div>
                </div>
                <div className="bg-white rounded-xl p-4 border border-[#E5E7EB] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-[#22C55E] text-white flex items-center justify-center text-xs font-bold">✓</span>
                    <div><p className="text-xs text-[#8B7569]">Ship to</p><p className="text-sm font-medium text-[#1B2A5B]">{address.fullName}{address.addressLine1 ? `, ${address.addressLine1}` : ''}{address.city ? `, ${address.city}` : ''} {address.state} {address.postalCode}</p></div>
                  </div>
                  <button onClick={() => setStep(2)} className="text-xs text-[#C41E3A] hover:underline">Change</button>
                </div>

                {/* Shipping method — picker only shown when customer pays for shipping. */}
                {!paid && absorbShipping && (
                  <div className="bg-[#ECFDF5] border border-[#A7F3D0] text-[#065F46] text-sm rounded-xl px-4 py-3">
                    <span className="font-semibold">Free shipping</span> — we cover the carrier cost for you.
                  </div>
                )}
                {!paid && !absorbShipping && (
                  <div className="bg-white rounded-xl p-5 border border-[#E5E7EB]">
                    <h3 className="text-sm font-semibold text-[#1B2A5B] mb-3">Shipping Method</h3>
                    {ratesLoading && <p className="text-sm text-[#8B7569]">Calculating shipping…</p>}
                    {!ratesLoading && ratesError && (
                      <div className="bg-[#FFFBEB] border border-[#FDE68A] text-[#92400E] text-xs rounded-lg p-3">
                        Couldn&apos;t fetch live rates: {ratesError}. You can still continue — we&apos;ll contact you about shipping.
                      </div>
                    )}
                    {!ratesLoading && !ratesError && rates.length > 0 && (
                      <div className="space-y-2">
                        {rates.map((r) => (
                          <label
                            key={r.serviceCode}
                            className={`flex items-center justify-between px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${selectedRate?.serviceCode === r.serviceCode ? 'border-[#1B2A5B] bg-[#1B2A5B]/5' : 'border-[#E5E7EB] hover:bg-[#FAF7F2]'}`}
                          >
                            <div className="flex items-center gap-3">
                              <input
                                type="radio"
                                name="shippingRate"
                                value={r.serviceCode}
                                checked={selectedRate?.serviceCode === r.serviceCode}
                                onChange={() => selectRate(r)}
                                className="accent-[#1B2A5B]"
                              />
                              <div>
                                <p className="text-sm font-medium text-[#1B2A5B]">{r.serviceName}</p>
                                {r.estimatedDays && <p className="text-xs text-[#8B7569]">{r.estimatedDays} business day{r.estimatedDays > 1 ? 's' : ''}</p>}
                              </div>
                            </div>
                            <span className="text-sm font-semibold text-[#1B2A5B]">${r.totalCharge.toFixed(2)}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {paid ? (
                  <div className="bg-white rounded-xl p-6 border-2 border-[#22C55E]">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="w-10 h-10 rounded-full bg-[#22C55E] text-white flex items-center justify-center text-lg">✓</span>
                      <div><h3 className="text-lg font-semibold text-[#1B2A5B]">Order Confirmed</h3><p className="text-sm text-[#8B7569]">Payment received. Your order is being processed.</p></div>
                    </div>
                    <div className="flex gap-3 mt-4">
                      <Link href="/collections" className="flex-1 py-2.5 rounded-lg border border-[#1B2A5B] text-[#1B2A5B] text-sm font-semibold text-center">Continue Shopping</Link>
                      {isSignedIn ? <Link href="/orders" className="flex-1 py-2.5 rounded-lg bg-[#1B2A5B] text-white text-sm font-semibold text-center">View Orders</Link> : <Link href="/auth/signup" className="flex-1 py-2.5 rounded-lg bg-[#1B2A5B] text-white text-sm font-semibold text-center">Create Account</Link>}
                    </div>
                  </div>
                ) : (
                  <>
                    {paypalMessage && <div className="bg-[#FFF9F4] border border-[rgba(139,117,105,0.24)] rounded-lg p-4"><p className="text-sm text-[#8B7569]">{paypalMessage}</p></div>}
                    <div className="bg-white rounded-xl p-6 border border-[#E5E7EB]">
                      <h3 className="text-base font-semibold text-[#1B2A5B] mb-4">Payment Method</h3>
                      {canPay ? (
                        <CheckoutForm
                          orderId={order.id}
                          amount={amt}
                          productName={order.product.name}
                          guestEmail={!isSignedIn ? guestEmail : undefined}
                          guestName={!isSignedIn ? guestName : undefined}
                          initialProvider={searchParams.get('provider') === 'paypal' ? 'paypal' : undefined}
                          onSuccess={() => window.location.reload()}
                        />
                      ) : (
                        <p className="text-sm text-[#8B7569]">Complete the steps above to proceed.</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Right — Order Summary */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
              <div className="p-5 border-b border-[#F0EBE3]">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-[#1B2A5B]">Order Summary</h3>
              </div>
              <div className="p-5 space-y-4">
                <div className="flex gap-3">
                  {order.product.image ? (
                    <div
                      className="w-16 h-20 rounded-md bg-[#F0EBE3] bg-cover bg-center flex-shrink-0"
                      style={{ backgroundImage: `url(${order.product.image})` }}
                      role="img"
                      aria-label={order.product.name}
                    />
                  ) : (
                    <div className="w-16 h-20 rounded-md bg-[#F0EBE3] flex items-center justify-center flex-shrink-0 text-[#1B2A5B] text-lg font-semibold">
                      {order.product.name?.[0]?.toUpperCase() ?? '?'}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#1B2A5B] leading-snug">{order.product.name}</p>
                    <p className="text-xs text-[#8B7569] mt-1">Qty: 1</p>
                  </div>
                  <span className="text-sm font-semibold text-[#1B2A5B]">${subtotal.toFixed(2)}</span>
                </div>
                <div className="pt-3 border-t border-[#F0EBE3] space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-[#8B7569]">Subtotal</span><span className="text-[#1B2A5B]">${subtotal.toFixed(2)}</span></div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[#8B7569]">Shipping{!absorbShipping && selectedRate ? ` — ${selectedRate.serviceName}` : ''}</span>
                    <span className={absorbShipping && internationalSurcharge === 0 && (selectedRate || !ratesError) ? 'text-[#22C55E] font-medium' : 'text-[#1B2A5B]'}>{
                      paid
                        ? '—'
                        : ratesLoading
                          ? 'Calculating…'
                          : absorbShipping
                            ? (internationalSurcharge > 0 ? `$${internationalSurcharge.toFixed(2)}` : 'Free')
                            : selectedRate
                              ? `$${quotedShipping.toFixed(2)}`
                              : ratesError
                                ? 'TBD'
                                : 'Enter address to calculate'
                    }</span>
                  </div>
                  {!paid && absorbShipping && internationalSurcharge > 0 && (
                    <p className="text-xs text-[#8B7569] -mt-1">International shipping surcharge (domestic shipping is on us).</p>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-[#8B7569]">Tax{taxRate > 0 ? ` (${taxRate}%)` : ''}</span>
                    {paid ? (
                      <span className="text-[#1B2A5B]">${estimatedTax.toFixed(2)}</span>
                    ) : taxRate > 0 ? (
                      <span className="text-[#1B2A5B]">${estimatedTax.toFixed(2)}</span>
                    ) : (
                      <span className="text-[#8B7569]">$0.00</span>
                    )}
                  </div>
                </div>
                <div className="pt-3 border-t border-[#1B2A5B]/10 flex justify-between">
                  <span className="text-base font-semibold text-[#1B2A5B]">Total</span>
                  <span className="text-lg font-bold text-[#1B2A5B]">${amt.toFixed(2)}</span>
                </div>
              </div>
              <div className="bg-[#FAF7F2] p-4 space-y-2">
                {[{ icon: '🔒', text: 'SSL encrypted checkout' }, { icon: '🚚', text: 'Real-time carrier shipping rates' }, { icon: '↩️', text: '14-day return policy' }].map(b => (
                  <div key={b.text} className="flex items-center gap-2"><span className="text-xs">{b.icon}</span><span className="text-xs text-[#8B7569]">{b.text}</span></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function PaymentPage({ params }: { params: Promise<{ orderId: string }> }) {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[#FAF7F2]"><div className="loading-spinner mx-auto" /></div>}>
      <CheckoutContent params={params} />
    </Suspense>
  );
}
