import React, { useState, useRef, useEffect } from 'react';
import {
  Calendar,
  MapPin,
  Copy,
  Check,
  Shield,
  Upload,
  FileText,
  X,
  Ticket,
  AlertCircle,
  Clock,
  XCircle,
  Ban,
  ArrowRight,
  ArrowLeft,
  Search,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  Smartphone,
  Monitor,
  Loader2,
  Info,
  RefreshCw
} from 'lucide-react';

// ============================================================================
// DATA CONTRACT — STRICTLY TYPED TO REAL BACKEND FIELDS
// Render nothing outside:
//   event: { id, title, starts_at, location, description (nullable), tiers[] }
//   tier:  { id, name, price_ngn, capacity (integer | null), sold (approved only) }
//   bank:  { bank_name, account_name, account_number, instructions (nullable) }
// The ids are not decorative: they are what let the checkout be written into the
// address bar and reopened on the same step after a refresh.
// ============================================================================

const INITIAL_EVENTS = [
  {
    id: 'evt-demo-rave-2026',
    title: 'Issele-Uku Rave 2026',
    starts_at: '2026-12-25T19:00:00+01:00',
    location: 'Oligbo Palace Ground, Issele-Uku, Delta State',
    description:
      'Our flagship December night out under the stars. Headline DJs, hype men, cold drinks with the Family, and music until dawn.',
    tiers: [
      { id: 'tpr-demo-rave-rp', name: 'Regular Pass', price_ngn: 10000, capacity: null, sold: 142 },
      { id: 'tpr-demo-rave-vip', name: 'VIP Lounge', price_ngn: 35000, capacity: 80, sold: 46 },
      { id: 'tpr-demo-rave-exe', name: 'Executive Table (6 Guests)', price_ngn: 250000, capacity: 12, sold: 9 },
      { id: 'tpr-demo-rave-vvip', name: 'VVIP Cabana (10 Guests)', price_ngn: 600000, capacity: 6, sold: 6 }
    ]
  },
  {
    id: 'evt-demo-gala-2026',
    title: 'Annual End-of-Year Gala',
    starts_at: '2026-12-19T18:00:00+01:00',
    location: 'Grand Ballroom, Press House Avenue, Asaba',
    description:
      'An evening of black-tie dining, live highlife and contemporary sets, awards, and toasts with friends of the Carpenters Family.',
    tiers: [
      { id: 'tpr-demo-gala-single', name: 'Single Guest Seat', price_ngn: 50000, capacity: 120, sold: 98 },
      { id: 'tpr-demo-gala-couple', name: 'Couple Pass', price_ngn: 90000, capacity: 40, sold: 29 },
      { id: 'tpr-demo-gala-patron', name: 'Patron Table (8 Guests)', price_ngn: 750000, capacity: 10, sold: 10 }
    ]
  }
];

// Upcoming / Next Events rendered AFTER current open events (same data contract)
const UPCOMING_EVENTS = [
  {
    title: 'First Sunday Highlife & Grill',
    starts_at: '2027-01-03T16:00:00+01:00',
    location: 'The Courtyard, Summit Road, Asaba',
    description:
      'New Year afternoon highlife, palm wine and open-flame grill with the Carpenters Family and invited guests.',
    tiers: [
      { name: 'Entry Pass', price_ngn: 15000, capacity: null, sold: 0 },
      { name: 'Reserved Gazebo', price_ngn: 120000, capacity: 15, sold: 0 }
    ]
  },
  {
    title: 'Easter Homecoming Night Out',
    starts_at: '2027-03-28T19:00:00+01:00',
    location: 'Grand Pavilion, Okpanam Road, Asaba',
    description: null,
    tiers: [
      { name: 'Regular Pass', price_ngn: 15000, capacity: null, sold: 0 },
      { name: 'VIP Table (6 Guests)', price_ngn: 300000, capacity: 15, sold: 0 }
    ]
  }
];

const CLUB_BANK = {
  bank_name: 'Zenith Bank PLC',
  account_name: 'Carpenters Family Association',
  account_number: '1229485017',
  instructions:
    'Transfer from your own banking app before or immediately after submitting. Always include the exact narration below so the Treasurer can match your transfer.'
};

// Pre-populated orders for Screen 3 (/tickets/order) public lookup
// Explicitly stores no phone number or receipt for public lookup rendering
const INITIAL_ORDERS_DB = [
  {
    reference: 'CF-2026-8492',
    email: 'adaeze.nwosu@gmail.com',
    status: 'pending_review',
    event: 'Issele-Uku Rave 2026',
    tier: 'VIP Lounge',
    quantity: 2,
    total: 70000,
    submitted_at: '2026-11-04T14:25:00+01:00',
    reason: null
  },
  {
    reference: 'CF-2026-7104',
    email: 'chinedu.okonkwo@yahoo.com',
    status: 'confirmed',
    event: 'Annual End-of-Year Gala',
    tier: 'Couple Pass',
    quantity: 1,
    total: 90000,
    submitted_at: '2026-11-02T11:10:00+01:00',
    reason: null
  },
  {
    reference: 'CF-2026-5319',
    email: 'tunde.adebayo@outlook.com',
    status: 'not_approved',
    event: 'Issele-Uku Rave 2026',
    tier: 'VIP Lounge',
    quantity: 1,
    total: 35000,
    submitted_at: '2026-11-01T18:40:00+01:00',
    reason:
      'The transfer screenshot uploaded was for ₦20,000 instead of the ₦35,000 order total, and no matching credit appeared on our statement.'
  },
  {
    reference: 'CF-2026-3091',
    email: 'ngozi.eze@gmail.com',
    status: 'cancelled',
    event: 'First Sunday Highlife & Grill',
    tier: 'Reserved Gazebo',
    quantity: 1,
    total: 120000,
    submitted_at: '2026-10-29T09:15:00+01:00',
    reason:
      "Cancelled at buyer's request prior to transfer verification; no credit was received by the club."
  }
];

// Pinned verbatim error strings required by test suite
const PINNED_ERRORS = {
  rate_limit:
    "You've already got a few orders with this email. Please try again shortly or contact the club.",
  event_closed: 'This event is no longer accepting orders.',
  box_office_busy: 'The box office is busy right now — please try again in a moment.',
  officer_gate:
    'Tickets and transactions still await review. Approve, reject or cancel them before closing this event.'
};

// ============================================================================
// FORMATTING HELPERS (Africa/Lagos en-NG, 12-hour am/pm, ₦ Monospace)
// ============================================================================

function formatNaira(amount) {
  return '₦' + Number(amount).toLocaleString('en-NG');
}

function formatLagosDate(isoString) {
  try {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat('en-NG', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Africa/Lagos'
    }).format(date);
  } catch (e) {
    return isoString;
  }
}

function formatLagosShortDate(isoString) {
  try {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat('en-NG', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Africa/Lagos'
    }).format(date);
  } catch (e) {
    return isoString;
  }
}

function formatLagosTime(isoString) {
  try {
    const date = new Date(isoString);
    const parts = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Africa/Lagos'
    }).formatToParts(date);

    const hour = parts.find((p) => p.type === 'hour')?.value || '';
    const minute = parts.find((p) => p.type === 'minute')?.value || '00';
    const dayPeriod = (parts.find((p) => p.type === 'dayPeriod')?.value || '').toLowerCase();
    return `${hour}:${minute} ${dayPeriod}`;
  } catch (e) {
    return '';
  }
}

function getTierRemaining(tier) {
  if (tier.capacity === null || tier.capacity === undefined) return null;
  return Math.max(0, tier.capacity - tier.sold);
}

function getTierAvailabilityLabel(tier) {
  const remaining = getTierRemaining(tier);
  if (remaining === null) return 'Unlimited';
  if (remaining <= 0) return 'Sold out';
  return `${remaining} remaining`;
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

// ============================================================================
// MAIN APPLICATION COMPONENT
// ============================================================================

export default function App() {
  // Navigation state: 'storefront' (/tickets) | 'submitted' | 'lookup' (/tickets/order)
  const [screen, setScreen] = useState('storefront');

  // Checkout step inside an expanded event card: 1 = Choose Your Tickets, 2 = Payment & Receipt
  const [checkoutStep, setCheckoutStep] = useState(1);

  // Prototype inspection controls (for reviewing empty/error states & mobile frame)
  const [storefrontMode, setStorefrontMode] = useState('open'); // 'open' | 'empty' | 'unavailable'
  const [simulatedErrorKey, setSimulatedErrorKey] = useState('none'); // 'none' | 'rate_limit' | 'event_closed' | 'box_office_busy' | 'officer_gate'
  const [viewportMode, setViewportMode] = useState('desktop'); // 'desktop' | 'mobile'
  const [protoBarOpen, setProtoBarOpen] = useState(true);

  // Storefront accordion state: only one event expanded at a time (index or null)
  const [expandedEventIndex, setExpandedEventIndex] = useState(0);

  // Selected tier index per event
  const [selectedTierByEvent, setSelectedTierByEvent] = useState({
    0: 1, // Default to VIP Lounge on Issele-Uku Rave 2026
    1: 0
  });

  // Guest checkout form fields
  const [quantity, setQuantity] = useState(2);
  const [buyerName, setBuyerName] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [receiptFile, setReceiptFile] = useState(null); // { name, size, type }

  // Field-level touch & error state
  const [touched, setTouched] = useState({
    name: false,
    email: false,
    phone: false,
    file: false
  });
  const [fileError, setFileError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Copy button states
  const [copiedAccount, setCopiedAccount] = useState(false);
  const [copiedNarration, setCopiedNarration] = useState(false);
  const [copiedOrderRef, setCopiedOrderRef] = useState(false);

  // Orders list & most recently submitted order for Screen 2
  const [ordersDb, setOrdersDb] = useState(INITIAL_ORDERS_DB);
  const [lastSubmittedOrder, setLastSubmittedOrder] = useState({
    reference: 'CF-2026-8492',
    email: 'adaeze.nwosu@gmail.com',
    buyerName: 'Adaeze Nwosu',
    event: 'Issele-Uku Rave 2026',
    tier: 'VIP Lounge',
    quantity: 2,
    total: 70000,
    submitted_at: '2026-11-04T14:25:00+01:00'
  });

  // Screen 3 (/tickets/order) lookup state
  const [lookupRef, setLookupRef] = useState('CF-2026-8492');
  const [lookupEmail, setLookupEmail] = useState('adaeze.nwosu@gmail.com');
  const [lookupTouched, setLookupTouched] = useState(false);
  const [lookupResult, setLookupResult] = useState(INITIAL_ORDERS_DB[0]); // order object | 'not_found' | null

  const fileInputRef = useRef(null);

  // Validation helpers
  const trimmedName = buyerName.trim();
  const trimmedEmail = buyerEmail.trim();
  const trimmedPhone = buyerPhone.trim();

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
  const isPhoneValid =
    trimmedPhone.replace(/\D/g, '').length >= 10 &&
    trimmedPhone.replace(/\D/g, '').length <= 15;

  const nameError =
    touched.name && !trimmedName ? 'Enter the full name of the guest or buyer.' : '';
  const emailError =
    touched.email && !trimmedEmail
      ? 'Enter an email address where we can send your confirmation.'
      : touched.email && !isEmailValid
      ? 'Enter a valid email address (for example, name@example.com).'
      : '';
  const phoneError =
    touched.phone && !trimmedPhone
      ? 'Enter an active Nigerian or international phone number.'
      : touched.phone && !isPhoneValid
      ? 'Enter a valid 10 to 15 digit phone number.'
      : '';

  // Step 1 missing requirements for "Continue to checkout"
  const step1MissingFields = [];
  if (!trimmedName) step1MissingFields.push('your name');
  if (!trimmedEmail || !isEmailValid) step1MissingFields.push('a valid email address');
  if (!trimmedPhone || !isPhoneValid) step1MissingFields.push('your phone number');

  const isStep1Valid = step1MissingFields.length === 0;

  // Step 2 validation for "Submit Order"
  const canSubmitOrder = isStep1Valid && Boolean(receiptFile) && !fileError && !isSubmitting;

  // The till opens as a modal overlay, one event at a time.
  const checkoutOpen = expandedEventIndex !== null;
  const CHECKOUT_DRAFT_KEY = 'cf-box-office-draft';
  const CHECKOUT_PARAMS = ['event', 'tier', 'qty', 'step'];
  const [restoredDraft, setRestoredDraft] = useState(false);

  const closeCheckout = () => {
    setExpandedEventIndex(null);
    setCheckoutStep(1);
  };

  // A buyer who refreshes mid-checkout lands back on the same step. Their position
  // lives in the address bar; what they typed lives in sessionStorage, never in the
  // URL. The receipt itself cannot come back — see the notice in step 2.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    try {
      const draft = JSON.parse(window.sessionStorage.getItem(CHECKOUT_DRAFT_KEY) || '{}');
      if (typeof draft.name === 'string') setBuyerName(draft.name);
      if (typeof draft.email === 'string') setBuyerEmail(draft.email);
      if (typeof draft.phone === 'string') setBuyerPhone(draft.phone);
    } catch {
      // A corrupt or unavailable draft is simply ignored.
    }

    const eventId = params.get('event');
    if (eventId) {
      const idx = INITIAL_EVENTS.findIndex((ev) => ev.id === eventId);
      if (idx !== -1) {
        const tiers = INITIAL_EVENTS[idx].tiers;
        const tierIdx = Math.max(
          0,
          tiers.findIndex((t) => t.id === params.get('tier')),
        );
        const remaining = getTierRemaining(tiers[tierIdx]);
        const maxQty =
          remaining === null ? 10 : Math.max(1, Math.min(10, remaining));
        const wanted = Number.parseInt(params.get('qty') || '1', 10);
        setExpandedEventIndex(idx);
        setSelectedTierByEvent((prev) => ({ ...prev, [idx]: tierIdx }));
        setQuantity(
          Math.min(Math.max(Number.isFinite(wanted) ? wanted : 1, 1), maxQty),
        );
        if (params.get('step') === '2') {
          setCheckoutStep(2);
          setRestoredDraft(true);
        }
      }
    }

    const ref = params.get('ref');
    if (ref) {
      setLookupRef(ref);
      setScreen('lookup');
    }
  }, []);

  // Keep the address bar in step with the checkout, and clear it once the buyer is out.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const event = checkoutOpen ? INITIAL_EVENTS[expandedEventIndex] : null;
    if (event && screen === 'storefront') {
      const tier = event.tiers[selectedTierByEvent[expandedEventIndex] ?? 0];
      params.set('event', event.id);
      if (tier) params.set('tier', tier.id);
      params.set('qty', String(quantity));
      params.set('step', String(checkoutStep));
    } else {
      CHECKOUT_PARAMS.forEach((key) => params.delete(key));
    }
    const query = params.toString();
    window.history.replaceState(
      window.history.state,
      '',
      query ? `${window.location.pathname}?${query}` : window.location.pathname,
    );
  }, [screen, checkoutOpen, expandedEventIndex, checkoutStep, selectedTierByEvent, quantity]);

  // Mirror what the buyer types, so a refresh costs them nothing but the receipt.
  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        CHECKOUT_DRAFT_KEY,
        JSON.stringify({ name: buyerName, email: buyerEmail, phone: buyerPhone }),
      );
    } catch {
      // Private mode or a full quota — the URL still holds their place.
    }
  }, [buyerName, buyerEmail, buyerPhone]);

  useEffect(() => {
    if (!checkoutOpen || screen !== 'storefront') return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') closeCheckout();
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [checkoutOpen, screen]);

  // Open or close the checkout overlay for one event
  const handleToggleEventCard = (idx) => {
    if (expandedEventIndex === idx) {
      setExpandedEventIndex(null);
    } else {
      setExpandedEventIndex(idx);
      setCheckoutStep(1);
      const event = INITIAL_EVENTS[idx];
      const currentTierIdx = selectedTierByEvent[idx] ?? 0;
      const tier = event.tiers[currentTierIdx];
      const rem = getTierRemaining(tier);
      if (rem !== null && rem > 0 && quantity > rem) {
        setQuantity(rem);
      } else if (quantity < 1) {
        setQuantity(1);
      }
    }
  };

  // Select a tier inside the expanded card
  const handleSelectTier = (eventIdx, tierIdx) => {
    const tier = INITIAL_EVENTS[eventIdx].tiers[tierIdx];
    const remaining = getTierRemaining(tier);
    if (remaining !== null && remaining <= 0) return; // Sold out is disabled

    setSelectedTierByEvent((prev) => ({ ...prev, [eventIdx]: tierIdx }));
    if (remaining !== null && quantity > remaining) {
      setQuantity(remaining);
    }
  };

  // File upload handler (validates pdf/jpg/jpeg/png and <= 4 MB)
  const validateAndSetFile = (fileObj) => {
    setTouched((prev) => ({ ...prev, file: true }));
    if (!fileObj) return;
    setRestoredDraft(false);

    const allowedExtensions = ['pdf', 'jpg', 'jpeg', 'png'];
    const ext = (fileObj.name.split('.').pop() || '').toLowerCase();
    const maxBytes = 4 * 1024 * 1024; // 4 MB

    if (!allowedExtensions.includes(ext)) {
      setReceiptFile(null);
      setFileError('Upload a PDF, JPG, JPEG, or PNG receipt only.');
      return;
    }

    if (fileObj.size > maxBytes) {
      setReceiptFile(null);
      setFileError(
        `File is too large (${formatFileSize(fileObj.size)}). Maximum allowed size is 4 MB.`
      );
      return;
    }

    setFileError('');
    setReceiptFile({
      name: fileObj.name,
      size: fileObj.size,
      type: fileObj.type || `application/${ext}`
    });
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
  };

  // Copy utility
  const copyText = (text, setter) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  // Step 1 -> Step 2 handler ("Continue to checkout")
  const handlePlaceOrderStep1 = (e) => {
    e.preventDefault();
    setTouched((prev) => ({ ...prev, name: true, email: true, phone: true }));
    if (!isStep1Valid) return;
    setCheckoutStep(2);
  };

  // Step 2 -> Step 3 handler ("Submit Order")
  const handleSubmitOrder = (e, activeEvent, activeTier) => {
    e.preventDefault();
    setTouched({ name: true, email: true, phone: true, file: true });

    if (!canSubmitOrder) return;

    // If a simulated error is active, keep on storefront and show the banner
    if (simulatedErrorKey !== 'none') {
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      const randomDigits = Math.floor(1000 + Math.random() * 9000);
      const newRef = `CF-2026-${randomDigits}`;
      const orderTotal = activeTier.price_ngn * quantity;
      const nowIso = new Date().toISOString();

      const createdOrder = {
        reference: newRef,
        email: trimmedEmail.toLowerCase(),
        buyerName: trimmedName,
        status: 'pending_review',
        event: activeEvent.title,
        tier: activeTier.name,
        quantity,
        total: orderTotal,
        submitted_at: nowIso,
        reason: null
      };

      setOrdersDb((prev) => [createdOrder, ...prev]);
      setLastSubmittedOrder(createdOrder);
      setLookupRef(newRef);
      setLookupEmail(trimmedEmail);
      setLookupResult(createdOrder);
      setIsSubmitting(false);
      setExpandedEventIndex(null);
      setCheckoutStep(1);
      setScreen('submitted');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 800);
  };

  // WhatsApp Support Redirect Handler
  const handleWhatsAppSupport = () => {
    const whatsappUrl =
      'https://wa.me/2348030000000?text=' +
      encodeURIComponent(
        'Hello Carpenters Family Social Club, I need support with my ticket order.'
      );
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  // Screen 3 Lookup form submit
  const handleLookupSubmit = (e) => {
    e.preventDefault();
    setLookupTouched(true);
    const cleanRef = lookupRef.trim().toUpperCase();
    const cleanEmail = lookupEmail.trim().toLowerCase();

    if (!cleanRef || !cleanEmail) {
      setLookupResult('not_found');
      return;
    }

    // Both reference AND email must match; otherwise return identical 'not_found'
    const match = ordersDb.find(
      (o) =>
        o.reference.toUpperCase() === cleanRef && o.email.toLowerCase() === cleanEmail
    );

    setLookupResult(match || 'not_found');
  };

  // Quick preset loader for Screen 3 lookup
  const loadSampleLookup = (sampleOrder) => {
    if (!sampleOrder) {
      setLookupRef('CF-2026-0000');
      setLookupEmail('unmatched.guest@example.com');
      setLookupTouched(true);
      setLookupResult('not_found');
      return;
    }
    setLookupRef(sampleOrder.reference);
    setLookupEmail(sampleOrder.email);
    setLookupTouched(true);
    setLookupResult(sampleOrder);
  };

  return (
    <div className="min-h-screen bg-warm-canvas text-body font-sans antialiased selection:bg-ochre selection:text-deep-forest">
      {/* ===================================================================
          DESIGN TOKENS & TYPOGRAPHY (@theme + Semantic Token Classes)
      ==================================================================== */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,700;1,9..144,500&family=JetBrains+Mono:wght@400;500;600;700&display=swap');

        :root {
          --color-forest: #174C37;
          --color-forest-hover: #103D2B;
          --color-deep-forest: #0C3325;
          --color-warm-canvas: #FAF6F0;
          --color-linen: #E5DDD3;
          --color-espresso: #3D291F;
          --color-body: #5C4638;
          --color-muted: #7A685D;
          --color-ochre: #D6A23A;
          --color-terracotta: #BA3C2A;
        }

        .font-serif {
          font-family: 'Fraunces', Georgia, Cambria, "Times New Roman", Times, serif;
        }
        .font-sans {
          font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
        }
        .font-mono {
          font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        }

        /* Semantic Palette Classes matching Landing Page tokens */
        .bg-forest { background-color: var(--color-forest); }
        .bg-forest-hover:hover { background-color: var(--color-forest-hover); }
        .bg-forest-subtle { background-color: rgba(23, 76, 55, 0.05); }
        .bg-forest-tint { background-color: rgba(23, 76, 55, 0.04); }
        .bg-forest-chip { background-color: rgba(23, 76, 55, 0.10); }
        .bg-deep-forest { background-color: var(--color-deep-forest); }
        .bg-warm-canvas { background-color: var(--color-warm-canvas); }
        .bg-linen { background-color: var(--color-linen); }
        .bg-ochre { background-color: var(--color-ochre); }
        .bg-ochre-chip { background-color: rgba(214, 162, 58, 0.16); }
        .bg-terracotta { background-color: var(--color-terracotta); }
        .bg-terracotta-chip { background-color: rgba(186, 60, 42, 0.10); }
        .bg-muted-chip { background-color: rgba(122, 104, 93, 0.14); }

        .text-forest { color: var(--color-forest); }
        .text-deep-forest { color: var(--color-deep-forest); }
        .text-warm-canvas { color: var(--color-warm-canvas); }
        .text-espresso { color: var(--color-espresso); }
        .text-body { color: var(--color-body); }
        .text-muted { color: var(--color-muted); }
        .text-ochre { color: var(--color-ochre); }
        .text-terracotta { color: var(--color-terracotta); }

        .border-linen { border-color: var(--color-linen); }
        .border-forest { border-color: var(--color-forest); }
        .border-forest-subtle { border-color: rgba(23, 76, 55, 0.28); }
        .border-ochre { border-color: var(--color-ochre); }
        .border-ochre-subtle { border-color: rgba(214, 162, 58, 0.45); }
        .border-terracotta { border-color: var(--color-terracotta); }
        .border-terracotta-subtle { border-color: rgba(186, 60, 42, 0.35); }
        .border-muted-subtle { border-color: rgba(122, 104, 93, 0.35); }

        .ring-forest-selected {
          box-shadow: 0 0 0 2px rgba(23, 76, 55, 0.20);
        }

        /* Dark band subtle forest overlay ( only allowed gradient ) */
        .opening-band-surface {
          background-color: var(--color-deep-forest);
          background-image: linear-gradient(135deg, rgba(23, 76, 55, 0.45) 0%, rgba(12, 51, 37, 0.95) 100%);
        }

        /* Mandatory 3px ochre focus-visible outline on all interactive elements */
        button:focus-visible,
        a:focus-visible,
        input:focus-visible,
        select:focus-visible,
        [tabindex]:focus-visible {
          outline: 3px solid var(--color-ochre) !important;
          outline-offset: 2px !important;
        }

        /* Honour prefers-reduced-motion by removing all transitions */
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
            scroll-behavior: auto !important;
          }
        }
      `}</style>

      {/* ===================================================================
          PROTOTYPE CONTROL BAR (FOR SWITCHING SCREENS, STATES & VIEWPORTS)
      ==================================================================== */}
      <div className="bg-deep-forest text-warm-canvas border-b border-linen/20 text-xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-ochre shrink-0" strokeWidth={2} />
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ochre">
              Box Office Interactive Prototype
            </span>
          </div>

          {/* Screen Switcher Pills */}
          <div className="flex flex-wrap items-center gap-1.5" role="navigation" aria-label="Prototype screens">
            <button
              type="button"
              onClick={() => {
                setScreen('storefront');
                setStorefrontMode('open');
                if (expandedEventIndex === null) setExpandedEventIndex(0);
                setCheckoutStep(1);
              }}
              className={`min-h-[36px] px-3 py-1 rounded-full font-medium transition-colors duration-150 ${
                screen === 'storefront' && checkoutStep === 1
                  ? 'bg-ochre text-deep-forest font-semibold'
                  : 'bg-white/10 text-warm-canvas hover:bg-white/15'
              }`}
            >
              Step 1: Choose Tickets
            </button>
            <button
              type="button"
              onClick={() => {
                setScreen('storefront');
                setStorefrontMode('open');
                if (expandedEventIndex === null) setExpandedEventIndex(0);
                if (!trimmedName) setBuyerName('Adaeze Nwosu');
                if (!trimmedEmail) setBuyerEmail('adaeze.nwosu@gmail.com');
                if (!trimmedPhone) setBuyerPhone('08034567890');
                setCheckoutStep(2);
              }}
              className={`min-h-[36px] px-3 py-1 rounded-full font-medium transition-colors duration-150 ${
                screen === 'storefront' && checkoutStep === 2
                  ? 'bg-ochre text-deep-forest font-semibold'
                  : 'bg-white/10 text-warm-canvas hover:bg-white/15'
              }`}
            >
              Step 2: Payment &amp; Receipt
            </button>
            <button
              type="button"
              onClick={() => setScreen('submitted')}
              className={`min-h-[36px] px-3 py-1 rounded-full font-medium transition-colors duration-150 ${
                screen === 'submitted'
                  ? 'bg-ochre text-deep-forest font-semibold'
                  : 'bg-white/10 text-warm-canvas hover:bg-white/15'
              }`}
            >
              Step 3: Order Submitted
            </button>
            <button
              type="button"
              onClick={() => setScreen('lookup')}
              className={`min-h-[36px] px-3 py-1 rounded-full font-medium transition-colors duration-150 ${
                screen === 'lookup'
                  ? 'bg-ochre text-deep-forest font-semibold'
                  : 'bg-white/10 text-warm-canvas hover:bg-white/15'
              }`}
            >
              /tickets/order (Lookup)
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Viewport preview toggle */}
            <div className="hidden md:flex items-center bg-white/10 rounded-full p-0.5">
              <button
                type="button"
                onClick={() => setViewportMode('desktop')}
                className={`px-2.5 py-1 rounded-full flex items-center gap-1 text-[11px] font-medium ${
                  viewportMode === 'desktop' ? 'bg-warm-canvas text-espresso font-semibold' : 'text-warm-canvas'
                }`}
                title="Full Responsive Desktop View"
              >
                <Monitor className="w-3.5 h-3.5 text-ochre" strokeWidth={2} />
                Desktop
              </button>
              <button
                type="button"
                onClick={() => setViewportMode('mobile')}
                className={`px-2.5 py-1 rounded-full flex items-center gap-1 text-[11px] font-medium ${
                  viewportMode === 'mobile' ? 'bg-warm-canvas text-espresso font-semibold' : 'text-warm-canvas'
                }`}
                title="375px Mobile Viewport Frame"
              >
                <Smartphone className="w-3.5 h-3.5 text-ochre" strokeWidth={2} />
                Mobile 375px
              </button>
            </div>

            <button
              type="button"
              onClick={() => setProtoBarOpen(!protoBarOpen)}
              className="min-h-[36px] px-2.5 py-1 rounded-lg bg-white/10 text-warm-canvas hover:bg-white/15 flex items-center gap-1 text-[11px] uppercase tracking-[0.12em] font-semibold"
              aria-expanded={protoBarOpen}
            >
              States
              {protoBarOpen ? (
                <ChevronUp className="w-3.5 h-3.5 text-ochre" strokeWidth={2} />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-ochre" strokeWidth={2} />
              )}
            </button>
          </div>
        </div>

        {/* Collapsible Secondary State Controls */}
        {protoBarOpen && (
          <div className="border-t border-white/10 bg-[#09271C]">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-4 text-[11px]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="uppercase tracking-[0.14em] text-ochre font-semibold">
                  /tickets Feed State:
                </span>
                {[
                  { id: 'open', label: 'Selling (Current + Upcoming)' },
                  { id: 'empty', label: 'Quiet (No Open Events)' },
                  { id: 'unavailable', label: 'Unavailable (Failure)' }
                ].map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => {
                      setScreen('storefront');
                      setStorefrontMode(st.id);
                    }}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                      storefrontMode === st.id && screen === 'storefront'
                        ? 'bg-forest text-white border border-ochre'
                        : 'bg-white/5 text-warm-canvas/80 hover:bg-white/10'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="uppercase tracking-[0.14em] text-ochre font-semibold">
                  Pinned Error Copy:
                </span>
                {[
                  { id: 'none', label: 'None' },
                  { id: 'rate_limit', label: 'Email Rate Limit' },
                  { id: 'event_closed', label: 'Event Closed' },
                  { id: 'box_office_busy', label: 'Box Office Busy' },
                  { id: 'officer_gate', label: 'Officer Unreviewed Gate' }
                ].map((err) => (
                  <button
                    key={err.id}
                    type="button"
                    onClick={() => setSimulatedErrorKey(err.id)}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                      simulatedErrorKey === err.id
                        ? 'bg-terracotta text-white font-semibold'
                        : 'bg-white/5 text-warm-canvas/80 hover:bg-white/10'
                    }`}
                  >
                    {err.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===================================================================
          VIEWPORT CONTAINER (FULL DESKTOP OR 375PX MOBILE PREVIEW FRAME)
      ==================================================================== */}
      <div
        className={
          viewportMode === 'mobile'
            ? 'max-w-[390px] mx-auto my-6 border-[6px] border-[#3D291F] rounded-[32px] overflow-hidden shadow-sm bg-warm-canvas'
            : 'w-full'
        }
      >
        {/* =================================================================
            STICKY CLUB HEADER ON WARM CANVAS (NO NAV BAR, NO SEARCH, NO BLUR)
        ================================================================== */}
        <header className="sticky top-0 z-30 bg-warm-canvas border-b border-linen">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-[76px] flex items-center justify-between gap-4">
            {/* Left: Club Mark + Wordmark */}
            <button
              type="button"
              onClick={() => {
                setScreen('storefront');
                setStorefrontMode('open');
              }}
              className="flex items-center gap-3 text-left min-h-[44px] rounded-lg pr-2 group"
            >
              <span className="w-10 h-10 rounded-full bg-forest border-2 border-ochre grid place-items-center shrink-0">
                <span className="font-serif font-bold text-lg text-ochre leading-none">
                  C
                </span>
              </span>
              <span className="block">
                <span className="block font-serif font-bold text-espresso text-base sm:text-lg tracking-tight leading-tight">
                  CARPENTERS FAMILY
                </span>
                <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-ochre mt-0.5">
                  SOCIAL CLUB · ASABA
                </span>
              </span>
            </button>

            {/* Right: Single Outlined Pill Link "Member Portal" (+ Status link) */}
            <div className="flex items-center gap-2 sm:gap-3">
              {screen !== 'lookup' ? (
                <button
                  type="button"
                  onClick={() => setScreen('lookup')}
                  className="min-h-[44px] px-3 py-2 rounded-full text-xs sm:text-sm font-medium text-forest hover:underline underline-offset-4 hidden sm:inline-flex items-center gap-1.5"
                >
                  Check ticket status
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setScreen('storefront')}
                  className="min-h-[44px] px-3 py-2 rounded-full text-xs sm:text-sm font-medium text-forest hover:underline underline-offset-4 hidden sm:inline-flex items-center gap-1.5"
                >
                  Back to box office
                </button>
              )}

              <a
                href="#member-portal"
                onClick={(e) => {
                  e.preventDefault();
                }}
                className="min-h-[44px] px-4 py-2 rounded-full bg-white border border-linen text-forest text-xs sm:text-sm font-semibold hover:border-forest transition-colors duration-150 inline-flex items-center justify-center"
              >
                Member Portal
              </a>
            </div>
          </div>
        </header>

        {/* =================================================================
            PINNED ERROR STRING BANNER (WHEN TOGGLED IN PROTOTYPE BAR)
        ================================================================== */}
        {simulatedErrorKey !== 'none' && (
          <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6">
            <div
              role="alert"
              className="rounded-2xl bg-white border border-terracotta p-4 sm:p-5 shadow-xs flex items-start justify-between gap-4"
            >
              <div className="flex items-start gap-3">
                <AlertCircle
                  className="w-5 h-5 text-terracotta shrink-0 mt-0.5"
                  strokeWidth={2}
                />
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-terracotta">
                    {simulatedErrorKey === 'officer_gate'
                      ? 'Officer Event Closure Gate Notice'
                      : 'Box Office Notice'}
                  </p>
                  <p className="mt-1 text-sm sm:text-base font-medium text-espresso">
                    {PINNED_ERRORS[simulatedErrorKey]}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSimulatedErrorKey('none')}
                className="min-h-[44px] min-w-[44px] rounded-lg border border-linen bg-warm-canvas text-espresso grid place-items-center shrink-0"
                aria-label="Dismiss notice"
              >
                <X className="w-4 h-4 text-forest" strokeWidth={2} />
              </button>
            </div>
          </div>
        )}

        {/* =================================================================
            MAIN VIEW ROUTER
        ================================================================== */}
        <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
          {/* ===============================================================
              SCREEN 1 — BOX OFFICE STOREFRONT (/tickets)
          ================================================================ */}
          {screen === 'storefront' && (
            <div>
              {/* HERO BANNER WITH STAGE & LARGE GATHERING IMAGE */}
              <section
                aria-label="Box office hero banner"
                className="relative rounded-2xl overflow-hidden border border-linen text-warm-canvas shadow-xs min-h-[260px] sm:min-h-[300px] flex items-center"
              >
                <img
                  src="https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1600&q=85"
                  alt="Stage lights and large crowd gathering at a Carpenters Family night out"
                  className="absolute inset-0 w-full h-full object-cover object-center"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0C3325]/90 via-[#0C3325]/75 to-[#174C37]/65" />

                <div className="relative z-10 w-full p-6 sm:p-10 md:p-12">
                  <div className="max-w-2xl">
                    <span className="inline-flex items-center px-3 py-1 rounded-full bg-white/10 border border-white/15 text-ochre text-[11px] font-semibold uppercase tracking-[0.14em]">
                      BOX OFFICE · CARPENTERS FAMILY
                    </span>
                    <h1 className="mt-3.5 font-serif font-bold text-3xl sm:text-5xl text-warm-canvas tracking-tight leading-[1.08]">
                      Experience The Vibe. See Events Below.
                    </h1>
                    <p className="mt-3 text-sm sm:text-base text-warm-canvas/90 leading-relaxed max-w-xl">
                      Official tickets to Carpenters Family raves, galas, and flagship nights out. Pick your event, transfer directly, and upload your receipt for officer verification.
                    </p>
                  </div>
                </div>
              </section>

              {/* Quick link to check existing order */}
              <div className="mt-4 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                  Current Events On Sale
                </span>
                <button
                  type="button"
                  onClick={() => setScreen('lookup')}
                  className="min-h-[44px] px-3 py-1.5 rounded-lg text-xs font-semibold text-forest hover:bg-forest-subtle inline-flex items-center gap-1.5 transition-colors"
                >
                  <Search className="w-4 h-4 text-forest" strokeWidth={2} />
                  Already submitted an order? Check your ticket status
                  <ArrowRight className="w-4 h-4 text-forest" strokeWidth={2} />
                </button>
              </div>

              {/* -------------------------------------------------------------
                  STATE A: SELLING — CURRENT EVENTS FIRST, THEN UPCOMING / NEXT
              -------------------------------------------------------------- */}
              {storefrontMode === 'open' && (
                <>
                  <section aria-label="Current events on sale" className="mt-2 space-y-6">
                  {INITIAL_EVENTS.map((event, eventIdx) => {
                    const isExpanded = expandedEventIndex === eventIdx;
                    const selectedTierIdx = selectedTierByEvent[eventIdx] ?? 0;
                    const activeTier = event.tiers[selectedTierIdx] || event.tiers[0];
                    const activeTierRemaining = getTierRemaining(activeTier);
                    const maxSelectablePasses =
                      activeTierRemaining === null
                        ? 10
                        : Math.max(1, Math.min(10, activeTierRemaining));
                    const lineTotal = activeTier.price_ngn * quantity;
                    const narrationText = `TICKET - ${event.title} - ${
                      trimmedName || 'YOUR NAME'
                    }`;

                    return (
                      <article
                        key={event.title}
                        className="bg-white rounded-2xl border border-linen p-5 sm:p-8 shadow-xs transition-colors duration-200"
                      >
                        {/* COLLAPSED / TOP SUMMARY ROW */}
                        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
                          <div className="space-y-3 flex-1">
                            <h2 className="font-serif font-bold text-2xl sm:text-3xl text-espresso tracking-tight">
                              {event.title}
                            </h2>

                            {/* Date + Time row & Location row */}
                            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-y-2 gap-x-6 text-sm text-body">
                              <div className="inline-flex items-center gap-2">
                                <Calendar
                                  className="w-4 h-4 text-forest shrink-0"
                                  strokeWidth={2}
                                />
                                <span>
                                  {formatLagosDate(event.starts_at)} ·{' '}
                                  <span className="font-medium text-espresso">
                                    {formatLagosTime(event.starts_at)}
                                  </span>
                                </span>
                              </div>

                              <div className="inline-flex items-center gap-2">
                                <MapPin
                                  className="w-4 h-4 text-ochre shrink-0"
                                  strokeWidth={2}
                                />
                                <span>{event.location}</span>
                              </div>
                            </div>

                            {/* Optional Description clamped to 2 lines */}
                            {event.description && (
                              <p className="text-sm sm:text-base text-body line-clamp-2 max-w-3xl leading-relaxed">
                                {event.description}
                              </p>
                            )}

                            {/* Tier Chips with Monospace Prices */}
                            <div className="pt-1 flex flex-wrap items-center gap-2">
                              {event.tiers.map((t) => {
                                const rem = getTierRemaining(t);
                                const isSoldOut = rem !== null && rem <= 0;
                                return (
                                  <span
                                    key={t.name}
                                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs border border-linen ${
                                      isSoldOut
                                        ? 'bg-warm-canvas text-muted opacity-60'
                                        : 'bg-warm-canvas text-espresso'
                                    }`}
                                  >
                                    <span className="font-medium">{t.name}</span>
                                    <span className="text-muted">·</span>
                                    <span className="font-mono font-semibold text-forest">
                                      {formatNaira(t.price_ngn)}
                                    </span>
                                    {isSoldOut && (
                                      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                                        (Sold out)
                                      </span>
                                    )}
                                  </span>
                                );
                              })}
                            </div>
                          </div>

                          {/* Solid Forest Button "Buy tickets" — opens the overlay */}
                          <div className="shrink-0 flex items-center">
                            <button
                              type="button"
                              aria-haspopup="dialog"
                              aria-expanded={isExpanded}
                              aria-controls={`event-checkout-${eventIdx}`}
                              onClick={() => handleToggleEventCard(eventIdx)}
                              className={`min-h-[44px] px-5 py-2.5 rounded-lg font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors duration-150 w-full sm:w-auto ${
                                isExpanded
                                  ? 'bg-white border border-linen text-forest hover:bg-warm-canvas'
                                  : 'bg-forest bg-forest-hover text-white'
                              }`}
                            >
                              <span>{isExpanded ? 'Close' : 'Buy tickets'}</span>
                              {isExpanded ? (
                                <X className="w-4 h-4 text-forest" strokeWidth={2} />
                              ) : (
                                <ArrowRight className="w-4 h-4 text-ochre" strokeWidth={2} />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* 3-STEP PURCHASING WORKFLOW — MODAL OVERLAY */}
                        {isExpanded && (
                          <div
                            role="presentation"
                            className="fixed inset-0 z-[60] flex items-stretch justify-center sm:items-center sm:p-6"
                          >
                            {/* Backdrop — click to dismiss */}
                            <div
                              aria-hidden="true"
                              onClick={closeCheckout}
                              className="absolute inset-0 bg-espresso/60"
                            />

                            <div
                              id={`event-checkout-${eventIdx}`}
                              role="dialog"
                              aria-modal="true"
                              aria-labelledby={`checkout-heading-${eventIdx}`}
                              className="relative z-10 flex h-full w-full flex-col overflow-hidden bg-white border-linen shadow-xl sm:h-auto sm:max-h-[92vh] sm:w-full sm:max-w-5xl sm:rounded-2xl sm:border"
                            >
                              {/* Dialog header — sticky above the scrolling body */}
                              <header className="flex shrink-0 items-center justify-between gap-4 border-b border-linen bg-white px-5 py-4 sm:px-6">
                                <div className="min-w-0">
                                  <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-ochre">
                                    Box office
                                  </span>
                                  <h3
                                    id={`checkout-heading-${eventIdx}`}
                                    className="truncate font-serif text-lg font-bold tracking-tight text-espresso sm:text-xl"
                                  >
                                    {event.title}
                                  </h3>
                                </div>
                                <button
                                  type="button"
                                  onClick={closeCheckout}
                                  className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg border border-linen bg-white px-3.5 py-2 text-xs font-semibold text-forest transition-colors hover:bg-warm-canvas sm:text-sm"
                                >
                                  <X className="w-4 h-4" strokeWidth={2} />
                                  <span>Close</span>
                                </button>
                              </header>

                              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5 sm:p-6">
                            {/* VISUAL 3-STEP INDICATOR BAR */}
                            <nav
                              aria-label="Ticket purchase steps"
                              className="p-3 sm:p-4 rounded-xl bg-warm-canvas border border-linen"
                            >
                              <ol className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-4">
                                <li
                                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-xs font-semibold ${
                                    checkoutStep === 1
                                      ? 'bg-white border-forest text-espresso ring-forest-selected'
                                      : 'bg-forest-subtle border-forest-subtle text-forest'
                                  }`}
                                >
                                  <span
                                    className={`w-6 h-6 rounded-full font-mono text-xs font-bold grid place-items-center shrink-0 ${
                                      checkoutStep === 1
                                        ? 'bg-forest text-white'
                                        : 'bg-forest text-white'
                                    }`}
                                  >
                                    {checkoutStep > 1 ? (
                                      <Check className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
                                    ) : (
                                      '1'
                                    )}
                                  </span>
                                  <span>Step 1: Choose Your Tickets</span>
                                </li>

                                <li
                                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-xs font-semibold ${
                                    checkoutStep === 2
                                      ? 'bg-white border-forest text-espresso ring-forest-selected'
                                      : 'bg-warm-canvas border-linen text-muted'
                                  }`}
                                >
                                  <span
                                    className={`w-6 h-6 rounded-full font-mono text-xs font-bold grid place-items-center shrink-0 ${
                                      checkoutStep === 2
                                        ? 'bg-forest text-white'
                                        : 'bg-white border border-linen text-muted'
                                    }`}
                                  >
                                    2
                                  </span>
                                  <span>Step 2: Payment &amp; Receipt</span>
                                </li>

                                <li className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-linen bg-warm-canvas text-muted text-xs font-semibold">
                                  <span className="w-6 h-6 rounded-full bg-white border border-linen text-muted font-mono text-xs font-bold grid place-items-center shrink-0">
                                    3
                                  </span>
                                  <span>Step 3: Order Submitted</span>
                                </li>
                              </ol>
                            </nav>

                            {/* ===============================================
                                STEP 1: CHOOSE YOUR TICKETS (NO PAYMENT DETAILS HERE)
                            ================================================ */}
                            {checkoutStep === 1 && (
                              <form
                                onSubmit={handlePlaceOrderStep1}
                                noValidate
                                className="space-y-6"
                              >
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                  <div>
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-forest-chip text-forest text-[11px] font-semibold uppercase tracking-[0.14em]">
                                      Step 1 of 3
                                    </span>
                                    <h3 className="mt-1.5 font-serif font-bold text-xl sm:text-2xl text-espresso">
                                      Choose Your Tickets
                                    </h3>
                                    <p className="mt-0.5 text-xs sm:text-sm text-body">
                                      Select your ticket tier, number of tickets, and enter the guest details for this order.
                                    </p>
                                  </div>

                                  {/* Quick-Fill Sample Guest Helper */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setBuyerName('Adaeze Nwosu');
                                      setBuyerEmail('adaeze.nwosu@gmail.com');
                                      setBuyerPhone('08034567890');
                                    }}
                                    className="self-start sm:self-center min-h-[36px] px-3 py-1.5 rounded-lg bg-warm-canvas border border-linen text-xs font-semibold text-forest hover:border-forest transition-colors"
                                  >
                                    Fill sample guest info
                                  </button>
                                </div>

                                {/* 1. Ticket Tier Tiles (Radio-like, one selected) */}
                                <div>
                                  <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted mb-2">
                                    Select ticket tier
                                  </span>
                                  <div
                                    role="radiogroup"
                                    aria-label={`Ticket tiers for ${event.title}`}
                                    className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                                  >
                                    {event.tiers.map((tier, tIdx) => {
                                      const rem = getTierRemaining(tier);
                                      const isSoldOut = rem !== null && rem <= 0;
                                      const isSelected = selectedTierIdx === tIdx && !isSoldOut;
                                      const availLabel = getTierAvailabilityLabel(tier);

                                      return (
                                        <button
                                          key={tier.name}
                                          type="button"
                                          role="radio"
                                          aria-checked={isSelected}
                                          disabled={isSoldOut}
                                          onClick={() => handleSelectTier(eventIdx, tIdx)}
                                          className={`min-h-[88px] p-4 rounded-xl border text-left flex flex-col justify-between transition-colors duration-150 ${
                                            isSoldOut
                                              ? 'border-linen bg-warm-canvas opacity-50 cursor-not-allowed'
                                              : isSelected
                                              ? 'border-forest bg-forest-subtle ring-forest-selected'
                                              : 'border-linen bg-white hover:border-forest'
                                          }`}
                                        >
                                          <div className="flex items-start justify-between gap-2 w-full">
                                            <span className="font-semibold text-sm text-espresso">
                                              {tier.name}
                                            </span>
                                            <span
                                              className={`w-4 h-4 rounded-full border grid place-items-center shrink-0 mt-0.5 ${
                                                isSelected
                                                  ? 'border-forest bg-forest'
                                                  : 'border-linen bg-white'
                                              }`}
                                            >
                                              {isSelected && (
                                                <span className="w-1.5 h-1.5 rounded-full bg-white" />
                                              )}
                                            </span>
                                          </div>

                                          <div className="mt-3 flex items-baseline justify-between gap-2 w-full">
                                            <span className="font-mono font-bold text-base text-forest">
                                              {formatNaira(tier.price_ngn)}
                                            </span>
                                            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                                              {availLabel}
                                            </span>
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>

                                {/* 2. Number of Tickets + Guest / Buyer Name + Email + Phone */}
                                <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                                  <div className="sm:col-span-4">
                                    <label
                                      htmlFor={`passes-count-${eventIdx}`}
                                      className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted mb-1.5"
                                    >
                                      Number of tickets
                                    </label>
                                    <select
                                      id={`passes-count-${eventIdx}`}
                                      value={quantity}
                                      onChange={(e) => setQuantity(Number(e.target.value))}
                                      className="w-full min-h-[44px] px-3.5 py-2.5 rounded-lg border border-linen bg-white text-espresso font-medium text-sm"
                                    >
                                      {Array.from(
                                        { length: maxSelectablePasses },
                                        (_, i) => i + 1
                                      ).map((num) => (
                                        <option key={num} value={num}>
                                          {num} {num === 1 ? 'ticket' : 'tickets'}
                                        </option>
                                      ))}
                                    </select>
                                  </div>

                                  <div className="sm:col-span-8">
                                    <label
                                      htmlFor={`buyer-name-${eventIdx}`}
                                      className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted mb-1.5"
                                    >
                                      Guest / buyer name
                                    </label>
                                    <input
                                      id={`buyer-name-${eventIdx}`}
                                      type="text"
                                      value={buyerName}
                                      onChange={(e) => setBuyerName(e.target.value)}
                                      onBlur={() =>
                                        setTouched((prev) => ({ ...prev, name: true }))
                                      }
                                      placeholder="e.g. Adaeze Nwosu"
                                      aria-invalid={Boolean(nameError)}
                                      aria-describedby={
                                        nameError ? `name-err-${eventIdx}` : undefined
                                      }
                                      className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-lg border bg-white text-espresso text-sm placeholder:text-muted/60 ${
                                        nameError ? 'border-terracotta' : 'border-linen'
                                      }`}
                                    />
                                    {nameError && (
                                      <p
                                        id={`name-err-${eventIdx}`}
                                        className="mt-1.5 text-xs font-medium text-terracotta"
                                      >
                                        {nameError}
                                      </p>
                                    )}
                                  </div>

                                  <div className="sm:col-span-6">
                                    <label
                                      htmlFor={`buyer-email-${eventIdx}`}
                                      className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted mb-1.5"
                                    >
                                      Email address
                                    </label>
                                    <input
                                      id={`buyer-email-${eventIdx}`}
                                      type="email"
                                      value={buyerEmail}
                                      onChange={(e) => setBuyerEmail(e.target.value)}
                                      onBlur={() =>
                                        setTouched((prev) => ({ ...prev, email: true }))
                                      }
                                      placeholder="you@example.com"
                                      aria-invalid={Boolean(emailError)}
                                      aria-describedby={
                                        emailError ? `email-err-${eventIdx}` : undefined
                                      }
                                      className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-lg border bg-white text-espresso text-sm placeholder:text-muted/60 ${
                                        emailError ? 'border-terracotta' : 'border-linen'
                                      }`}
                                    />
                                    {emailError && (
                                      <p
                                        id={`email-err-${eventIdx}`}
                                        className="mt-1.5 text-xs font-medium text-terracotta"
                                      >
                                        {emailError}
                                      </p>
                                    )}
                                  </div>

                                  <div className="sm:col-span-6">
                                    <label
                                      htmlFor={`buyer-phone-${eventIdx}`}
                                      className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted mb-1.5"
                                    >
                                      Phone number
                                    </label>
                                    <input
                                      id={`buyer-phone-${eventIdx}`}
                                      type="tel"
                                      value={buyerPhone}
                                      onChange={(e) => setBuyerPhone(e.target.value)}
                                      onBlur={() =>
                                        setTouched((prev) => ({ ...prev, phone: true }))
                                      }
                                      placeholder="0803 000 0000"
                                      aria-invalid={Boolean(phoneError)}
                                      aria-describedby={
                                        phoneError ? `phone-err-${eventIdx}` : undefined
                                      }
                                      className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-lg border bg-white text-espresso text-sm placeholder:text-muted/60 ${
                                        phoneError ? 'border-terracotta' : 'border-linen'
                                      }`}
                                    />
                                    {phoneError && (
                                      <p
                                        id={`phone-err-${eventIdx}`}
                                        className="mt-1.5 text-xs font-medium text-terracotta"
                                      >
                                        {phoneError}
                                      </p>
                                    )}
                                  </div>
                                </div>

                                {/* 4. Selection Summary Bar + "Continue to checkout" Primary Button */}
                                <div className="p-4 sm:p-5 rounded-xl bg-warm-canvas border border-linen flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                  <div>
                                    <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                                      Selection summary
                                    </span>
                                    <p className="mt-1 text-sm sm:text-base font-semibold text-espresso">
                                      {quantity} × {activeTier.name} —{' '}
                                      <span className="font-mono font-bold text-lg sm:text-xl text-forest">
                                        {formatNaira(lineTotal)}
                                      </span>
                                    </p>
                                    {step1MissingFields.length > 0 && (
                                      <p
                                        aria-live="polite"
                                        className="mt-1 text-xs text-muted"
                                      >
                                        To continue to checkout, please enter:{' '}
                                        <span className="font-medium text-espresso">
                                          {step1MissingFields.join(', ')}
                                        </span>
                                        .
                                      </p>
                                    )}
                                  </div>

                                  <button
                                    type="submit"
                                    className="min-h-[48px] px-6 py-3 rounded-lg bg-forest bg-forest-hover text-white font-semibold text-sm inline-flex items-center justify-center gap-2 shrink-0 transition-colors duration-150"
                                  >
                                    <span>Continue to checkout</span>
                                    <ArrowRight className="w-4 h-4 text-ochre" strokeWidth={2} />
                                  </button>
                                </div>
                              </form>
                            )}

                            {/* ===============================================
                                STEP 2: PAYMENT & RECEIPT UPLOAD
                            ================================================ */}
                            {checkoutStep === 2 && (
                              <form
                                onSubmit={(e) => handleSubmitOrder(e, event, activeTier)}
                                noValidate
                                className="space-y-6"
                              >
                                {/* Top Back Bar */}
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <button
                                    type="button"
                                    onClick={() => setCheckoutStep(1)}
                                    className="min-h-[44px] px-3.5 py-2 rounded-lg bg-white border border-linen text-forest text-xs sm:text-sm font-semibold hover:border-forest inline-flex items-center gap-2 transition-colors"
                                  >
                                    <ArrowLeft className="w-4 h-4 text-forest" strokeWidth={2} />
                                    <span>Back to Choose Your Tickets</span>
                                  </button>

                                  <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-forest-chip text-forest text-[11px] font-semibold uppercase tracking-[0.14em]">
                                    Step 2 of 3 · Payment &amp; Receipt
                                  </span>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                                  {/* Left Column: Order Summary + Bank Transfer Instructions */}
                                  <div className="lg:col-span-6 space-y-5">
                                    {/* Order Summary Panel */}
                                    <div className="bg-warm-canvas rounded-xl border border-linen p-5 sm:p-6 space-y-4">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                                          Order summary
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => setCheckoutStep(1)}
                                          className="text-xs font-semibold text-forest hover:underline"
                                        >
                                          Edit details
                                        </button>
                                      </div>

                                      <div>
                                        <p className="font-serif font-bold text-lg text-espresso">
                                          {event.title}
                                        </p>
                                        <p className="mt-1 text-sm font-medium text-espresso">
                                          {quantity} × {activeTier.name} —{' '}
                                          <span className="font-mono text-forest font-semibold">
                                            {formatNaira(lineTotal)}
                                          </span>
                                        </p>
                                      </div>

                                      <dl className="pt-3 border-t border-linen grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                                        <div>
                                          <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                                            Buyer
                                          </dt>
                                          <dd className="mt-0.5 font-medium text-espresso truncate">
                                            {trimmedName}
                                          </dd>
                                        </div>
                                        <div>
                                          <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                                            Email
                                          </dt>
                                          <dd className="mt-0.5 font-medium text-espresso truncate">
                                            {trimmedEmail}
                                          </dd>
                                        </div>
                                        <div>
                                          <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                                            Phone
                                          </dt>
                                          <dd className="mt-0.5 font-mono font-medium text-espresso">
                                            {trimmedPhone}
                                          </dd>
                                        </div>
                                      </dl>

                                      <div className="pt-3 border-t border-linen flex items-baseline justify-between gap-2">
                                        <span className="text-sm font-semibold text-espresso">
                                          Total to transfer
                                        </span>
                                        <span className="font-mono font-bold text-2xl sm:text-3xl text-forest">
                                          {formatNaira(lineTotal)}
                                        </span>
                                      </div>
                                    </div>

                                    {/* Payment Steps Block */}
                                    <div className="bg-warm-canvas rounded-xl border border-linen p-5 sm:p-6 space-y-4">
                                      <div>
                                        <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-ochre">
                                          Payment Step A
                                        </span>
                                        <h4 className="mt-1 font-serif font-bold text-lg text-espresso">
                                          Transfer the exact total from your banking app
                                        </h4>
                                      </div>

                                      <p className="text-sm font-semibold text-espresso">
                                        {CLUB_BANK.bank_name} · {CLUB_BANK.account_name}
                                      </p>

                                      <div className="p-3 rounded-lg bg-white border border-linen flex items-center justify-between gap-2">
                                        <span className="font-mono font-bold text-lg sm:text-xl text-forest tracking-wider">
                                          {CLUB_BANK.account_number}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            copyText(
                                              CLUB_BANK.account_number,
                                              setCopiedAccount
                                            )
                                          }
                                          className="min-h-[44px] px-3 py-1.5 rounded-lg bg-warm-canvas border border-linen text-forest text-xs font-semibold hover:border-forest inline-flex items-center gap-1.5 shrink-0"
                                        >
                                          {copiedAccount ? (
                                            <>
                                              <Check
                                                className="w-4 h-4 text-forest"
                                                strokeWidth={2}
                                              />
                                              <span>Copied</span>
                                            </>
                                          ) : (
                                            <>
                                              <Copy
                                                className="w-4 h-4 text-forest"
                                                strokeWidth={2}
                                              />
                                              <span>Copy account number</span>
                                            </>
                                          )}
                                        </button>
                                      </div>

                                      {CLUB_BANK.instructions && (
                                        <p className="text-xs text-body leading-relaxed">
                                          {CLUB_BANK.instructions}
                                        </p>
                                      )}

                                      {/* Transfer Narration Code Chip */}
                                      <div>
                                        <div className="flex items-center justify-between gap-2 mb-1">
                                          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                                            Transfer narration
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              copyText(narrationText, setCopiedNarration)
                                            }
                                            className="text-xs font-semibold text-forest hover:underline inline-flex items-center gap-1"
                                          >
                                            {copiedNarration ? (
                                              <>
                                                <Check
                                                  className="w-3.5 h-3.5 text-forest"
                                                  strokeWidth={2}
                                                />
                                                <span>Copied</span>
                                              </>
                                            ) : (
                                              <>
                                                <Copy
                                                  className="w-3.5 h-3.5 text-forest"
                                                  strokeWidth={2}
                                                />
                                                <span>Copy</span>
                                              </>
                                            )}
                                          </button>
                                        </div>

                                        <div className="px-3 py-2.5 rounded-lg bg-white border border-linen font-mono text-xs sm:text-sm text-espresso break-all">
                                          {narrationText}
                                        </div>
                                      </div>

                                      {/* Shield Icon Note */}
                                      <div className="p-3 rounded-lg bg-white border border-linen flex items-start gap-2.5">
                                        <Shield
                                          className="w-4 h-4 text-ochre shrink-0 mt-0.5"
                                          strokeWidth={2}
                                        />
                                        <p className="text-xs text-body leading-relaxed">
                                          Use this exact transfer narration so the committee can match your payment against the bank statement.
                                        </p>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Right Column: Upload Receipt Block + "Submit Order" Button */}
                                  <div className="lg:col-span-6 space-y-5">
                                    <div className="bg-white rounded-xl border border-linen p-5 sm:p-6 space-y-5">
                                      <div>
                                        <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-ochre">
                                          Payment Step B
                                        </span>
                                        <h4 className="mt-1 font-serif font-bold text-lg text-espresso">
                                          Upload your transfer receipt
                                        </h4>
                                        <p className="mt-1 text-xs sm:text-sm text-body">
                                          Attach the transfer screenshot or PDF receipt from your banking app so our officer can verify and confirm your order.
                                        </p>
                                      </div>

                                      {restoredDraft && !receiptFile && (
                                        <div className="flex items-start gap-2 p-3 rounded-xl bg-warm-canvas border border-ochre/40">
                                          <RefreshCw className="w-4 h-4 text-forest shrink-0 mt-0.5" />
                                          <p className="text-[11px] sm:text-xs text-body leading-relaxed">
                                            <span className="font-bold text-espresso">
                                              Your details came back.
                                            </span>{' '}
                                            The event, tier, quantity and the step you
                                            stopped on are restored from the address bar,
                                            and your name, email and phone are restored
                                            from this browser tab. A file can live in
                                            neither place, so attach your transfer
                                            receipt again before submitting.
                                          </p>
                                        </div>
                                      )}

                                      <div>
                                        <label
                                          htmlFor={`receipt-upload-${eventIdx}`}
                                          className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted mb-2"
                                        >
                                          Proof of payment (PDF, JPG, PNG · 4 MB max)
                                        </label>

                                        <input
                                          ref={fileInputRef}
                                          id={`receipt-upload-${eventIdx}`}
                                          type="file"
                                          accept=".pdf,.jpg,.jpeg,.png"
                                          onChange={handleFileChange}
                                          className="sr-only"
                                        />

                                        {!receiptFile ? (
                                          <div
                                            role="button"
                                            tabIndex={0}
                                            onDragOver={(e) => e.preventDefault()}
                                            onDrop={handleDrop}
                                            onClick={() => fileInputRef.current?.click()}
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                fileInputRef.current?.click();
                                              }
                                            }}
                                            aria-describedby={`file-hint-${eventIdx}`}
                                            className={`min-h-[132px] p-6 rounded-xl border-2 border-dashed bg-warm-canvas flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
                                              fileError || (touched.file && !receiptFile)
                                                ? 'border-terracotta'
                                                : 'border-linen hover:border-forest'
                                            }`}
                                          >
                                            <Upload
                                              className="w-6 h-6 text-forest mb-2"
                                              strokeWidth={2}
                                            />
                                            <span className="text-sm font-semibold text-espresso">
                                              Choose transfer receipt or drag it here
                                            </span>
                                            <span
                                              id={`file-hint-${eventIdx}`}
                                              className="mt-1 text-xs text-muted"
                                            >
                                              Screenshot or PDF from your banking app (up to 4 MB)
                                            </span>
                                          </div>
                                        ) : (
                                          <div
                                            aria-live="polite"
                                            className="p-4 rounded-xl border border-forest bg-forest-subtle flex items-center justify-between gap-3"
                                          >
                                            <div className="flex items-center gap-3 min-w-0">
                                              <FileText
                                                className="w-5 h-5 text-forest shrink-0"
                                                strokeWidth={2}
                                              />
                                              <div className="min-w-0">
                                                <p className="text-sm font-semibold text-espresso truncate">
                                                  {receiptFile.name}
                                                </p>
                                                <p className="text-xs font-mono text-muted">
                                                  {formatFileSize(receiptFile.size)} · Ready to submit
                                                </p>
                                              </div>
                                            </div>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setReceiptFile(null);
                                                setFileError('');
                                                if (fileInputRef.current) {
                                                  fileInputRef.current.value = '';
                                                }
                                              }}
                                              className="min-h-[44px] px-3 py-1.5 rounded-lg bg-white border border-linen text-terracotta text-xs font-semibold hover:border-terracotta inline-flex items-center gap-1.5 shrink-0"
                                            >
                                              <X className="w-4 h-4 text-terracotta" strokeWidth={2} />
                                              Remove receipt
                                            </button>
                                          </div>
                                        )}

                                        {fileError && (
                                          <p className="mt-1.5 text-xs font-medium text-terracotta">
                                            {fileError}
                                          </p>
                                        )}

                                        {/* Prototype Quick-Fill Receipt Buttons */}
                                        <div className="mt-3 flex flex-wrap items-center gap-2">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              validateAndSetFile({
                                                name: 'zenith-transfer-receipt.pdf',
                                                size: 393216,
                                                type: 'application/pdf'
                                              });
                                            }}
                                            className="min-h-[36px] px-3 py-1 rounded-md bg-warm-canvas border border-linen text-xs font-medium text-forest hover:border-forest transition-colors"
                                          >
                                            Attach sample receipt (384 KB)
                                          </button>

                                          <button
                                            type="button"
                                            onClick={() => {
                                              validateAndSetFile({
                                                name: 'high-res-bank-photo.png',
                                                size: 5452595,
                                                type: 'image/png'
                                              });
                                            }}
                                            className="min-h-[36px] px-3 py-1 rounded-md bg-warm-canvas border border-linen text-xs font-medium text-muted hover:text-espresso transition-colors"
                                          >
                                            Test &gt;4 MB error state
                                          </button>
                                        </div>
                                      </div>

                                      {/* Primary Action: "Submit Order" */}
                                      <div className="pt-3 border-t border-linen">
                                        <button
                                          type="submit"
                                          disabled={!canSubmitOrder}
                                          className={`w-full min-h-[48px] px-5 py-3 rounded-lg font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors duration-150 ${
                                            canSubmitOrder
                                              ? 'bg-forest bg-forest-hover text-white cursor-pointer'
                                              : 'bg-linen text-muted cursor-not-allowed'
                                          }`}
                                        >
                                          {isSubmitting ? (
                                            <>
                                              <Loader2
                                                className="w-4 h-4 text-white animate-spin"
                                                strokeWidth={2}
                                              />
                                              <span>Submitting…</span>
                                            </>
                                          ) : (
                                            <span>Submit Order</span>
                                          )}
                                        </button>

                                        {(!receiptFile || fileError) && !isSubmitting && (
                                          <p
                                            aria-live="polite"
                                            className="mt-2 text-xs text-muted leading-relaxed"
                                          >
                                            Upload your transfer receipt (PDF, JPG, or PNG) to submit your order.
                                          </p>
                                        )}

                                        <p className="mt-3 text-xs text-body leading-relaxed">
                                          Submitting an order logs your request for review. Your seats are not held until an officer verifies your transfer.
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </form>
                            )}
                              </div>
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                  </section>

                  {/* UPCOMING / NEXT EVENTS SECTION (RENDERED AFTER CURRENT EVENTS) */}
                  <section
                    aria-label="Upcoming events"
                    className="mt-12 pt-8 border-t border-linen space-y-5"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
                      <div>
                        <span className="inline-flex items-center px-3 py-1 rounded-full bg-forest-chip text-forest text-[11px] font-semibold uppercase tracking-[0.14em]">
                          COMING UP NEXT
                        </span>
                        <h2 className="mt-2 font-serif font-bold text-2xl sm:text-3xl text-espresso tracking-tight">
                          Upcoming Nights Out
                        </h2>
                      </div>
                      <p className="text-xs sm:text-sm text-muted">
                        Scheduled on the Family calendar · Box office opens closer to each date
                      </p>
                    </div>

                    <div className="space-y-4">
                      {UPCOMING_EVENTS.map((upEvent) => (
                        <article
                          key={upEvent.title}
                          className="bg-white rounded-2xl border border-linen p-5 sm:p-7 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-6"
                        >
                          <div className="space-y-2.5 flex-1">
                            <div className="flex flex-wrap items-center gap-2.5">
                              <h3 className="font-serif font-bold text-xl sm:text-2xl text-espresso tracking-tight">
                                {upEvent.title}
                              </h3>
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-ochre-chip border border-ochre-subtle text-espresso text-[11px] font-semibold uppercase tracking-[0.14em]">
                                <Clock className="w-3.5 h-3.5 text-ochre" strokeWidth={2} />
                                Next Event
                              </span>
                            </div>

                            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-y-1.5 gap-x-6 text-sm text-body">
                              <div className="inline-flex items-center gap-2">
                                <Calendar
                                  className="w-4 h-4 text-forest shrink-0"
                                  strokeWidth={2}
                                />
                                <span>
                                  {formatLagosDate(upEvent.starts_at)} ·{' '}
                                  <span className="font-medium text-espresso">
                                    {formatLagosTime(upEvent.starts_at)}
                                  </span>
                                </span>
                              </div>

                              <div className="inline-flex items-center gap-2">
                                <MapPin
                                  className="w-4 h-4 text-ochre shrink-0"
                                  strokeWidth={2}
                                />
                                <span>{upEvent.location}</span>
                              </div>
                            </div>

                            {upEvent.description && (
                              <p className="text-sm text-body line-clamp-2 max-w-3xl leading-relaxed">
                                {upEvent.description}
                              </p>
                            )}

                            <div className="pt-1 flex flex-wrap items-center gap-2">
                              {upEvent.tiers.map((t) => (
                                <span
                                  key={t.name}
                                  className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs border border-linen bg-warm-canvas text-espresso"
                                >
                                  <span className="font-medium">{t.name}</span>
                                  <span className="text-muted">·</span>
                                  <span className="font-mono font-semibold text-forest">
                                    {formatNaira(t.price_ngn)}
                                  </span>
                                </span>
                              ))}
                            </div>
                          </div>

                          <div className="shrink-0 flex items-center">
                            <span className="min-h-[44px] px-4 py-2.5 rounded-lg bg-warm-canvas border border-linen text-muted text-xs font-semibold uppercase tracking-[0.14em] inline-flex items-center justify-center">
                              Tickets Opening Soon
                            </span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                </>
              )}

              {/* -------------------------------------------------------------
                  STATE B: NO OPEN EVENTS ("The box office is quiet")
              -------------------------------------------------------------- */}
              {storefrontMode === 'empty' && (
                <section aria-label="No open events" className="mt-8">
                  <div className="max-w-lg mx-auto bg-white rounded-2xl border border-linen p-8 sm:p-10 text-center shadow-xs">
                    <div className="w-12 h-12 rounded-full bg-forest-chip border border-linen mx-auto grid place-items-center">
                      <Ticket className="w-5 h-5 text-forest" strokeWidth={2} />
                    </div>
                    <h2 className="mt-4 font-serif font-bold text-2xl text-espresso">
                      The box office is quiet
                    </h2>
                    <p className="mt-2 text-sm sm:text-base text-body leading-relaxed">
                      Nothing is currently selling right now. We open the box office ahead of our flagship raves, galas, and public nights out in Asaba.
                    </p>
                    <div className="mt-6">
                      <a
                        href="#landing-page"
                        onClick={(e) => {
                          e.preventDefault();
                          setStorefrontMode('open');
                        }}
                        className="min-h-[44px] px-5 py-2.5 rounded-lg bg-white border border-linen text-forest text-sm font-semibold hover:border-forest inline-flex items-center justify-center gap-2 transition-colors"
                      >
                        <ArrowLeft className="w-4 h-4 text-forest" strokeWidth={2} />
                        <span>Back to the club landing page</span>
                      </a>
                    </div>
                  </div>
                </section>
              )}

              {/* -------------------------------------------------------------
                  STATE C: FAILURE STATE ("Box office temporarily unavailable")
              -------------------------------------------------------------- */}
              {storefrontMode === 'unavailable' && (
                <section aria-label="Box office unavailable" className="mt-8">
                  <div className="max-w-lg mx-auto bg-white rounded-2xl border border-linen p-8 sm:p-10 text-center shadow-xs">
                    <div className="w-12 h-12 rounded-full bg-terracotta-chip border border-terracotta-subtle mx-auto grid place-items-center">
                      <AlertCircle
                        className="w-5 h-5 text-terracotta"
                        strokeWidth={2}
                      />
                    </div>
                    <h2 className="mt-4 font-serif font-bold text-2xl text-espresso">
                      Box office temporarily unavailable — please try again
                    </h2>
                    <p className="mt-2 text-sm sm:text-base text-body leading-relaxed">
                      We couldn&apos;t load the current event list right now. If you&apos;ve already submitted an order, you can still check its status.
                    </p>
                    <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={() => setStorefrontMode('open')}
                        className="min-h-[44px] px-5 py-2.5 rounded-lg bg-forest bg-forest-hover text-white text-sm font-semibold inline-flex items-center justify-center"
                      >
                        Retry loading events
                      </button>
                      <button
                        type="button"
                        onClick={() => setScreen('lookup')}
                        className="min-h-[44px] px-5 py-2.5 rounded-lg bg-white border border-linen text-forest text-sm font-semibold hover:border-forest inline-flex items-center justify-center"
                      >
                        Check ticket status
                      </button>
                    </div>
                  </div>
                </section>
              )}
            </div>
          )}

          {/* ===============================================================
              SCREEN 2 (STEP 3 OF WORKFLOW) — ORDER SUBMITTED
          ================================================================ */}
          {screen === 'submitted' && (
            <section aria-label="Order submitted for review" className="py-2">
              <div className="max-w-2xl mx-auto rounded-2xl bg-forest-tint border border-forest-subtle p-6 sm:p-10 shadow-xs">
                {/* 3-Step Indicator Bar showing Step 3 Reached */}
                <nav
                  aria-label="Ticket purchase steps"
                  className="mb-6 p-3 rounded-xl bg-warm-canvas border border-linen"
                >
                  <ol className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <li className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-forest-subtle border border-forest-subtle text-forest text-xs font-semibold">
                      <span className="w-5 h-5 rounded-full bg-forest text-white grid place-items-center shrink-0">
                        <Check className="w-3 h-3 text-white" strokeWidth={2.5} />
                      </span>
                      <span>1. Choose Your Tickets</span>
                    </li>
                    <li className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-forest-subtle border border-forest-subtle text-forest text-xs font-semibold">
                      <span className="w-5 h-5 rounded-full bg-forest text-white grid place-items-center shrink-0">
                        <Check className="w-3 h-3 text-white" strokeWidth={2.5} />
                      </span>
                      <span>2. Payment &amp; Receipt</span>
                    </li>
                    <li className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-forest text-espresso text-xs font-semibold ring-forest-selected">
                      <span className="w-5 h-5 rounded-full bg-forest text-white font-mono text-[11px] font-bold grid place-items-center shrink-0">
                        3
                      </span>
                      <span>3. Order Submitted</span>
                    </li>
                  </ol>
                </nav>

                {/* Eyebrow Chip */}
                <span className="inline-flex items-center px-3 py-1 rounded-full bg-forest-chip text-forest text-[11px] font-semibold uppercase tracking-[0.14em]">
                  ORDER SUBMITTED
                </span>

                {/* Headline */}
                <h1 className="mt-3 font-serif font-bold text-3xl sm:text-4xl text-espresso tracking-tight">
                  We&apos;ve logged your order
                </h1>
                <p className="mt-2 text-sm sm:text-base text-body leading-relaxed">
                  Your order is now <strong className="font-semibold text-espresso">pending review</strong> by the Carpenters Family committee.
                </p>

                {/* Order Reference in Large Monospace with Copy Button */}
                <div className="mt-6 p-4 sm:p-5 rounded-xl bg-warm-canvas border border-linen flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                      Order reference
                    </span>
                    <span className="mt-1 block font-mono font-bold text-2xl sm:text-3xl text-forest tracking-wider">
                      {lastSubmittedOrder.reference}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      copyText(lastSubmittedOrder.reference, setCopiedOrderRef)
                    }
                    className="min-h-[44px] px-4 py-2 rounded-lg bg-white border border-linen text-forest text-xs sm:text-sm font-semibold hover:border-forest inline-flex items-center justify-center gap-2 shrink-0"
                  >
                    {copiedOrderRef ? (
                      <>
                        <Check className="w-4 h-4 text-forest" strokeWidth={2} />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 text-forest" strokeWidth={2} />
                        <span>Copy reference</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Four Facts: Event, Tier, Quantity, Total */}
                <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-xl bg-white border border-linen col-span-2 sm:col-span-1">
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                      Event
                    </dt>
                    <dd className="mt-1 text-sm font-semibold text-espresso">
                      {lastSubmittedOrder.event}
                    </dd>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white border border-linen">
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                      Tier
                    </dt>
                    <dd className="mt-1 text-sm font-semibold text-espresso">
                      {lastSubmittedOrder.tier}
                    </dd>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white border border-linen">
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                      Quantity
                    </dt>
                    <dd className="mt-1 text-sm font-semibold text-espresso">
                      {lastSubmittedOrder.quantity}{' '}
                      {lastSubmittedOrder.quantity === 1 ? 'ticket' : 'tickets'}
                    </dd>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white border border-linen col-span-2 sm:col-span-1">
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                      Total
                    </dt>
                    <dd className="mt-1 font-mono font-bold text-base text-forest">
                      {formatNaira(lastSubmittedOrder.total)}
                    </dd>
                  </div>
                </dl>

                {/* Three Numbered "What happens next" Steps */}
                <div className="mt-8 pt-6 border-t border-linen">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                    What happens next
                  </h2>

                  <ol className="mt-4 space-y-4">
                    <li className="flex items-start gap-3.5">
                      <span className="w-7 h-7 rounded-full bg-forest text-white font-mono text-xs font-bold grid place-items-center shrink-0 mt-0.5">
                        1
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-espresso">
                          Transfer the exact amount using the narration
                        </p>
                        <p className="mt-0.5 text-sm text-body leading-relaxed">
                          If you haven&apos;t already completed the transfer, make sure your transfer of{' '}
                          <span className="font-mono font-semibold text-forest">
                            {formatNaira(lastSubmittedOrder.total)}
                          </span>{' '}
                          to <span className="font-semibold">{CLUB_BANK.bank_name}</span> (
                          <span className="font-mono">{CLUB_BANK.account_number}</span>) carries the narration{' '}
                          <span className="font-mono text-xs bg-warm-canvas border border-linen px-1.5 py-0.5 rounded text-espresso">
                            TICKET - {lastSubmittedOrder.event} - {lastSubmittedOrder.buyerName}
                          </span>
                          .
                        </p>
                      </div>
                    </li>

                    <li className="flex items-start gap-3.5">
                      <span className="w-7 h-7 rounded-full bg-forest text-white font-mono text-xs font-bold grid place-items-center shrink-0 mt-0.5">
                        2
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-espresso">
                          An officer checks it against the bank statement
                        </p>
                        <p className="mt-0.5 text-sm text-body leading-relaxed">
                          A club officer checks your uploaded receipt against our actual bank statement to verify and approve your tickets.
                        </p>
                      </div>
                    </li>

                    <li className="flex items-start gap-3.5">
                      <span className="w-7 h-7 rounded-full bg-forest text-white font-mono text-xs font-bold grid place-items-center shrink-0 mt-0.5">
                        3
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-espresso">
                          You&apos;ll get an email in a few minutes
                        </p>
                        <p className="mt-0.5 text-sm text-body leading-relaxed">
                          Once an officer reviews and confirms your order, we&apos;ll send an update to{' '}
                          <span className="font-medium text-espresso">
                            {lastSubmittedOrder.email}
                          </span>{' '}
                          — usually within a few minutes.
                        </p>
                      </div>
                    </li>
                  </ol>
                </div>

                {/* Two Plain Honest Notes (Core Mental Model — Prominent, Not Footnotes) */}
                <div className="mt-8 space-y-3">
                  <div className="p-4 rounded-xl bg-warm-canvas border border-ochre-subtle flex items-start gap-3">
                    <Clock
                      className="w-5 h-5 text-ochre shrink-0 mt-0.5"
                      strokeWidth={2}
                    />
                    <p className="text-sm text-espresso leading-relaxed">
                      <strong className="font-semibold">
                        This order does not hold your seats until an officer confirms it — someone else could take the last ticket meanwhile.
                      </strong>
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-white border border-linen flex items-start gap-3">
                    <Info
                      className="w-5 h-5 text-forest shrink-0 mt-0.5"
                      strokeWidth={2}
                    />
                    <p className="text-sm text-body leading-relaxed">
                      <strong className="font-semibold text-espresso">
                        Keep your order reference ({lastSubmittedOrder.reference}) safe so you can check your status anytime.
                      </strong>{' '}
                      You&apos;ll need both this reference and your email address on the status lookup page.
                    </p>
                  </div>
                </div>

                {/* Primary & Secondary Navigation Buttons */}
                <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setLookupRef(lastSubmittedOrder.reference);
                      setLookupEmail(lastSubmittedOrder.email);
                      const found = ordersDb.find(
                        (o) =>
                          o.reference.toUpperCase() ===
                          lastSubmittedOrder.reference.toUpperCase()
                      );
                      setLookupResult(found || lastSubmittedOrder);
                      setScreen('lookup');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="min-h-[48px] px-6 py-3 rounded-lg bg-forest bg-forest-hover text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
                  >
                    <span>Check your ticket status</span>
                    <ArrowRight className="w-4 h-4 text-ochre" strokeWidth={2} />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCheckoutStep(1);
                      setReceiptFile(null);
                      setScreen('storefront');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="min-h-[48px] px-6 py-3 rounded-lg bg-white border border-linen text-forest text-sm font-semibold hover:border-forest inline-flex items-center justify-center gap-2 transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4 text-forest" strokeWidth={2} />
                    <span>Back to the box office</span>
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* ===============================================================
              SCREEN 3 — PUBLIC TICKET STATUS LOOKUP (/tickets/order)
          ================================================================ */}
          {screen === 'lookup' && (
            <section aria-label="Ticket status lookup" className="py-2 space-y-6">
              <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-linen p-6 sm:p-8 shadow-xs">
                <span className="inline-flex items-center px-3 py-1 rounded-full bg-forest-chip text-forest text-[11px] font-semibold uppercase tracking-[0.14em]">
                  ORDER LOOKUP
                </span>
                <h1 className="mt-3 font-serif font-bold text-3xl text-espresso tracking-tight">
                  Check your ticket status
                </h1>
                <p className="mt-1.5 text-sm sm:text-base text-body leading-relaxed">
                  Enter your order reference and the email address you used when submitting your order.
                </p>

                {/* Prototype Quick-Fill Presets for All 5 Buyer-Facing Vocabulary States */}
                <div className="mt-5 p-3.5 rounded-xl bg-warm-canvas border border-linen">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted mb-2">
                    Test status outcomes (click to load):
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => loadSampleLookup(INITIAL_ORDERS_DB[0])}
                      className="min-h-[36px] px-3 py-1 rounded-lg bg-white border border-linen text-xs font-semibold text-espresso hover:border-forest"
                    >
                      Pending review (CF-2026-8492)
                    </button>
                    <button
                      type="button"
                      onClick={() => loadSampleLookup(INITIAL_ORDERS_DB[1])}
                      className="min-h-[36px] px-3 py-1 rounded-lg bg-white border border-linen text-xs font-semibold text-forest hover:border-forest"
                    >
                      Confirmed (CF-2026-7104)
                    </button>
                    <button
                      type="button"
                      onClick={() => loadSampleLookup(INITIAL_ORDERS_DB[2])}
                      className="min-h-[36px] px-3 py-1 rounded-lg bg-white border border-linen text-xs font-semibold text-terracotta hover:border-terracotta"
                    >
                      Not approved (CF-2026-5319)
                    </button>
                    <button
                      type="button"
                      onClick={() => loadSampleLookup(INITIAL_ORDERS_DB[3])}
                      className="min-h-[36px] px-3 py-1 rounded-lg bg-white border border-linen text-xs font-semibold text-muted hover:border-forest"
                    >
                      Cancelled (CF-2026-3091)
                    </button>
                    <button
                      type="button"
                      onClick={() => loadSampleLookup(null)}
                      className="min-h-[36px] px-3 py-1 rounded-lg bg-white border border-linen text-xs font-medium text-body hover:border-forest"
                    >
                      No orders found
                    </button>
                  </div>
                </div>

                {/* Short Form: Order Reference + Email Address */}
                <form
                  onSubmit={handleLookupSubmit}
                  noValidate
                  className="mt-6 grid grid-cols-1 sm:grid-cols-12 gap-4 items-end"
                >
                  <div className="sm:col-span-5">
                    <label
                      htmlFor="lookup-ref"
                      className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted mb-1.5"
                    >
                      Order reference
                    </label>
                    <input
                      id="lookup-ref"
                      type="text"
                      value={lookupRef}
                      onChange={(e) => setLookupRef(e.target.value)}
                      placeholder="CF-2026-8492"
                      className="w-full min-h-[44px] px-3.5 py-2.5 rounded-lg border border-linen bg-white font-mono text-sm text-espresso uppercase placeholder:normal-case placeholder:text-muted/60"
                    />
                  </div>

                  <div className="sm:col-span-5">
                    <label
                      htmlFor="lookup-email"
                      className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted mb-1.5"
                    >
                      Email address
                    </label>
                    <input
                      id="lookup-email"
                      type="email"
                      value={lookupEmail}
                      onChange={(e) => setLookupEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full min-h-[44px] px-3.5 py-2.5 rounded-lg border border-linen bg-white text-sm text-espresso placeholder:text-muted/60"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <button
                      type="submit"
                      className="w-full min-h-[44px] px-4 py-2.5 rounded-lg bg-forest bg-forest-hover text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <span>Look up</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* -------------------------------------------------------------
                  RESULT CARD: MATCHED ORDER
                  Shows: status pill, event, tier, quantity, total, reference,
                  date submitted, and (when rejected or cancelled) reason.
                  Explicitly NEVER shows uploaded receipt or phone number.
              -------------------------------------------------------------- */}
              {lookupResult && lookupResult !== 'not_found' && (
                <div
                  aria-live="polite"
                  className="max-w-2xl mx-auto bg-white rounded-2xl border border-linen p-6 sm:p-8 shadow-xs space-y-6"
                >
                  {/* Status Vocabulary Pill + Status Headline */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-linen">
                    <div>
                      {lookupResult.status === 'pending_review' && (
                        <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-ochre-chip border border-ochre-subtle text-espresso text-xs font-semibold">
                          <Clock className="w-4 h-4 text-ochre" strokeWidth={2} />
                          <span>Pending review</span>
                        </span>
                      )}

                      {lookupResult.status === 'confirmed' && (
                        <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-forest-chip border border-forest-subtle text-forest text-xs font-semibold">
                          <Check className="w-4 h-4 text-forest" strokeWidth={2} />
                          <span>Confirmed</span>
                        </span>
                      )}

                      {lookupResult.status === 'not_approved' && (
                        <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-terracotta-chip border border-terracotta-subtle text-terracotta text-xs font-semibold">
                          <XCircle
                            className="w-4 h-4 text-terracotta"
                            strokeWidth={2}
                          />
                          <span>Not approved</span>
                        </span>
                      )}

                      {lookupResult.status === 'cancelled' && (
                        <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-muted-chip border border-muted-subtle text-body text-xs font-semibold">
                          <Ban className="w-4 h-4 text-muted" strokeWidth={2} />
                          <span>Cancelled</span>
                        </span>
                      )}

                      {/* Status Explanation Copy */}
                      <p className="mt-3 text-base font-semibold text-espresso">
                        {lookupResult.status === 'pending_review' &&
                          'An officer has not checked this yet. Your seats are not held.'}
                        {lookupResult.status === 'confirmed' &&
                          'Approved. Bring the reference on your phone.'}
                        {lookupResult.status === 'not_approved' &&
                          'We could not approve this order.'}
                        {lookupResult.status === 'cancelled' &&
                          'This order has been cancelled — no money is owed back to you.'}
                      </p>
                    </div>

                    <div className="sm:text-right shrink-0">
                      <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                        Reference
                      </span>
                      <span className="mt-0.5 block font-mono font-bold text-lg text-forest">
                        {lookupResult.reference}
                      </span>
                    </div>
                  </div>

                  {/* Officer Reason Block (Only when Not approved or Cancelled) */}
                  {(lookupResult.status === 'not_approved' ||
                    lookupResult.status === 'cancelled') && (
                    <div
                      className={`p-4 rounded-xl border ${
                        lookupResult.status === 'not_approved'
                          ? 'bg-terracotta-chip border-terracotta-subtle'
                          : 'bg-warm-canvas border-linen'
                      }`}
                    >
                      <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-espresso">
                        Officer&apos;s note
                      </span>
                      <p className="mt-1 text-sm text-espresso leading-relaxed">
                        {lookupResult.reason}
                      </p>
                      <p className="mt-2 text-xs font-medium text-body">
                        {lookupResult.status === 'not_approved' ? (
                          <>
                            If you need help resolving this transfer, please{' '}
                            <a
                              href="mailto:secretariat@carpentersfamily.com.ng"
                              className="text-forest font-semibold underline underline-offset-2"
                            >
                              contact the club
                            </a>{' '}
                            with your order reference.
                          </>
                        ) : (
                          'Because no verified funds were retained for this order, no money is owed back to you.'
                        )}
                      </p>
                    </div>
                  )}

                  {/* Strictly Contracted Result Fields: Event, Tier, Quantity, Total, Reference, Date Submitted */}
                  <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-4 rounded-xl bg-warm-canvas border border-linen">
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                        Event
                      </dt>
                      <dd className="mt-1 font-serif font-bold text-base text-espresso">
                        {lookupResult.event}
                      </dd>
                    </div>

                    <div className="p-4 rounded-xl bg-warm-canvas border border-linen">
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                        Tier &amp; Quantity
                      </dt>
                      <dd className="mt-1 text-sm font-semibold text-espresso">
                        {lookupResult.quantity} × {lookupResult.tier}
                      </dd>
                    </div>

                    <div className="p-4 rounded-xl bg-warm-canvas border border-linen">
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                        Total
                      </dt>
                      <dd className="mt-1 font-mono font-bold text-lg text-forest">
                        {formatNaira(lookupResult.total)}
                      </dd>
                    </div>

                    <div className="p-4 rounded-xl bg-warm-canvas border border-linen sm:col-span-2">
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                        Date submitted
                      </dt>
                      <dd className="mt-1 text-sm text-espresso">
                        {formatLagosDate(lookupResult.submitted_at)} ·{' '}
                        <span className="font-medium">
                          {formatLagosTime(lookupResult.submitted_at)}
                        </span>
                      </dd>
                    </div>

                    <div className="p-4 rounded-xl bg-warm-canvas border border-linen">
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                        Order reference
                      </dt>
                      <dd className="mt-1 font-mono font-semibold text-sm text-espresso">
                        {lookupResult.reference}
                      </dd>
                    </div>
                  </dl>
                </div>
              )}

              {/* -------------------------------------------------------------
                  RESULT CARD: NO ORDERS FOUND FOR THAT REFERENCE
                  Never reveals whether reference or email failed; gives helpful steps
              -------------------------------------------------------------- */}
              {lookupTouched && lookupResult === 'not_found' && (
                <div
                  aria-live="polite"
                  className="max-w-2xl mx-auto bg-white rounded-2xl border border-linen p-6 sm:p-8 shadow-xs"
                >
                  <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-full bg-warm-canvas border border-linen grid place-items-center shrink-0">
                      <Search className="w-5 h-5 text-forest" strokeWidth={2} />
                    </div>
                    <div>
                      <h2 className="font-serif font-bold text-xl text-espresso">
                        No orders found for that reference
                      </h2>
                      <p className="mt-1.5 text-sm text-body leading-relaxed">
                        We couldn&apos;t find an order matching both that reference and email address. Here is what to check:
                      </p>
                      <ul className="mt-3 space-y-2 text-sm text-body">
                        <li className="flex items-start gap-2">
                          <span className="text-ochre font-bold">·</span>
                          <span>
                            Check the reference in your confirmation email (it starts with{' '}
                            <span className="font-mono text-xs bg-warm-canvas border border-linen px-1.5 py-0.5 rounded text-espresso">
                              CF-
                            </span>
                            ) and make sure you typed the exact email address used when ordering.
                          </span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-ochre font-bold">·</span>
                          <span>
                            If you still need a hand,{' '}
                            <a
                              href="mailto:secretariat@carpentersfamily.com.ng"
                              className="text-forest font-semibold underline underline-offset-2"
                            >
                              contact the club
                            </a>{' '}
                            and our Secretariat will look it up for you.
                          </span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}
        </main>

        {/* =================================================================
            DEEP-FOREST FOOTER MATCHING LANDING PAGE
        ================================================================== */}
        <footer className="mt-16 bg-deep-forest text-warm-canvas border-t border-linen">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-full bg-forest border border-ochre grid place-items-center shrink-0">
                <span className="font-serif font-bold text-base text-ochre">C</span>
              </span>
              <div>
                <p className="font-serif font-bold text-base text-warm-canvas">
                  Carpenters Family Social Club
                </p>
                <p className="text-xs text-warm-canvas/75">
                  Asaba, Delta State, Nigeria ·{' '}
                  <em className="font-serif text-ochre">One Family, Endless Vibes.</em>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-warm-canvas/85">
              <button
                type="button"
                onClick={() => setScreen('storefront')}
                className="min-h-[44px] px-2 hover:text-ochre transition-colors"
              >
                Box Office (/tickets)
              </button>
              <button
                type="button"
                onClick={() => setScreen('lookup')}
                className="min-h-[44px] px-2 hover:text-ochre transition-colors"
              >
                Order Lookup (/tickets/order)
              </button>
              <a
                href="mailto:secretariat@carpentersfamily.com.ng"
                className="min-h-[44px] px-2 inline-flex items-center hover:text-ochre transition-colors"
              >
                Contact Secretariat
              </a>
            </div>
          </div>
        </footer>

        {/* =================================================================
            FLOATING WHATSAPP CONTACT SUPPORT BUTTON (FIXED BOTTOM-RIGHT)
        ================================================================== */}
        <button
          type="button"
          onClick={handleWhatsAppSupport}
          aria-label="Contact support on WhatsApp"
          className="fixed bottom-5 right-5 z-50 min-h-[48px] px-4 py-2.5 rounded-full bg-forest bg-forest-hover text-white border border-ochre shadow-sm hover:-translate-y-0.5 transition-all duration-150 inline-flex items-center gap-2.5"
        >
          <span className="w-7 h-7 rounded-full bg-[#25D366] text-deep-forest grid place-items-center shrink-0">
            <svg
              viewBox="0 0 24 24"
              className="w-4 h-4 fill-current"
              aria-hidden="true"
            >
              <path d="M19.05 4.91A9.816 9.816 0 0 0 12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01Zm-7.01 15.24c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.264 8.264 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.82 2.42a8.183 8.183 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.23 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.87.85-.87 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.23-.17-.48-.29Z" />
            </svg>
          </span>
          <span className="text-xs sm:text-sm font-semibold tracking-wide">
            Contact Support
          </span>
        </button>
      </div>
    </div>
  );
}