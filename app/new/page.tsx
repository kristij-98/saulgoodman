'use client';

import React, { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { IntakeSchema, type IntakeData } from '@/shared/schema/extractor.zod';
import { useRouter } from 'next/navigation';
import {
  Plus,
  X,
  ArrowRight,
  ArrowLeft,
  Building2,
  Briefcase,
  DollarSign,
  Target,
  Sparkles,
  Check,
  ChevronRight,
} from 'lucide-react';

// --- Constants & Meta ---
const AVAILABILITY_OPTIONS = ['Same Day', 'Next Day', '2-3 Days', '1 Week+'] as const;

const SERVICE_AREA_OPTIONS = [
  { value: 'local_only', label: 'Local only (near me)' },
  { value: 'within_10_miles', label: 'Within 10 miles / 15 km' },
  { value: 'within_25_miles', label: 'Within 25 miles / 40 km' },
  { value: 'within_50_miles', label: 'Within 50 miles / 80 km' },
  { value: 'multiple_cities', label: 'Multiple cities / regions' },
] as const;

type StepMeta = {
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  fields: (keyof IntakeData)[];
};

const STEP_META: StepMeta[] = [
  {
    title: 'Business Basics',
    subtitle: 'Set your market context so your report is sharp and fair.',
    icon: Building2,
    fields: ['website_url', 'what_they_sell', 'street_address', 'city', 'state_province', 'postal_code'],
  },
  {
    title: 'Services & Volume',
    subtitle: 'A clear volume range helps expose hidden margin.',
    icon: Briefcase,
    fields: ['jobs_min', 'jobs_max', 'availability', 'service_area'],
  },
  {
    title: 'Pricing Snapshot',
    subtitle: 'Simple, honest numbers are enough.',
    icon: DollarSign,
    fields: ['ticket_min', 'ticket_max'],
  },
  {
    title: 'Offer Structure',
    subtitle: 'These levers usually move profit fast.',
    icon: Target,
    fields: [], // validated on submit by schema; this step is mostly optional levers
  },
  {
    title: 'Final Notes',
    subtitle: 'Optional details to tighten recommendations.',
    icon: Sparkles,
    fields: [],
  },
];

const DEFAULT_VALUES: Partial<IntakeData> = {
  website_url: '',
  what_they_sell: '',
  street_address: '',
  city: '',
  state_province: '',
  postal_code: '',

  services: [],

  jobs_min: 10,
  jobs_max: 50,
  availability: 'Same Day',

  ticket_min: 150,
  ticket_max: 500,

  service_area: 'local_only',
  service_area_notes: '',

  trip_fee: '',

  has_packages: false,
  packages: [],

  has_membership: false,
  has_priority: false,

  warranty: '',
  pricing_problem: '',
  known_competitors: '',
};

// --- Shared Components ---
function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-[13px] font-semibold text-zinc-800 mb-2.5 flex items-center gap-2 tracking-tight">
      {children}
      {required && (
        <span className="text-zinc-400 font-medium text-[11px] uppercase tracking-wider bg-zinc-100 px-1.5 py-0.5 rounded-sm">
          Required
        </span>
      )}
    </label>
  );
}

function Field({
  label,
  required,
  error,
  children,
  className = '',
}: {
  label: React.ReactNode;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1 ${className}`}>
      <Label required={required}>{label}</Label>
      {children}
      {error && (
        <p className="text-xs font-medium text-red-500 animate-in fade-in slide-in-from-top-1 mt-2 flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded-full bg-red-100 flex items-center justify-center">
            <X className="w-2.5 h-2.5 text-red-600" />
          </span>
          {error}
        </p>
      )}
    </div>
  );
}

function SelectableCard({
  title,
  description,
  selected,
  onClick,
}: {
  title: string;
  description?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative p-5 rounded-xl cursor-pointer transition-all duration-200 group flex items-start gap-4 text-left w-full ${
        selected
          ? 'ring-2 ring-zinc-900 bg-zinc-50 border-transparent shadow-sm'
          : 'ring-1 ring-zinc-200 bg-white hover:ring-zinc-300 hover:bg-zinc-50'
      }`}
    >
      <span
        className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
          selected ? 'border-zinc-900 bg-zinc-900 scale-110' : 'border-zinc-300 bg-white group-hover:border-zinc-400'
        }`}
      >
        {selected && <Check className="w-3 h-3 text-white stroke-[3]" />}
      </span>
      <span>
        <span
          className={`block text-[15px] font-semibold tracking-tight ${
            selected ? 'text-zinc-900' : 'text-zinc-700 group-hover:text-zinc-900'
          }`}
        >
          {title}
        </span>
        {description ? <span className="block text-sm text-zinc-500 mt-1.5 leading-relaxed">{description}</span> : null}
      </span>
    </button>
  );
}

export default function NewAuditPage() {
  const router = useRouter();

  const [step, setStep] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [topError, setTopError] = useState<string>('');
  const [serviceDraft, setServiceDraft] = useState<string>('');

  const current = STEP_META[step];
  const progress = useMemo(() => ((step + 1) / STEP_META.length) * 100, [step]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    trigger,
    clearErrors,
    formState: { errors },
  } = useForm<IntakeData>({
    resolver: zodResolver(IntakeSchema),
    defaultValues: DEFAULT_VALUES,
    mode: 'onChange',
  });

  // Typed watches (strict TS)
  const services = (watch('services') ?? []) as Array<{ name: string; price?: string }>;
  const packages = (watch('packages') ?? []) as Array<{ name: string; price?: string; includes?: string[] }>;
  const hasPackages = Boolean(watch('has_packages'));
  const serviceArea = watch('service_area');

  // --- Standard Input Styles ---
  const inputBase =
    "w-full rounded-xl border border-zinc-200 bg-white px-4 py-3.5 text-[15px] text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-4 focus:ring-zinc-900/5 hover:border-zinc-300 transition-all shadow-sm";
  const errorBase =
    "border-red-300 focus:border-red-500 focus:ring-red-500/10 hover:border-red-400 bg-red-50/20";

  // Helpers: set + clear error
  const setField = <K extends keyof IntakeData>(key: K, value: IntakeData[K]) => {
    setValue(key, value, { shouldDirty: true, shouldTouch: true });
    clearErrors(key);
  };

  // --- Dynamic Array Handlers ---
  const addService = () => {
    const clean = serviceDraft.trim();
    if (!clean) return;
    setValue('services', [...services, { name: clean }], { shouldDirty: true, shouldTouch: true });
    setServiceDraft('');
  };

  const removeService = (index: number) => {
    setValue(
      'services',
      services.filter((_svc: { name: string; price?: string }, i: number) => i !== index),
      { shouldDirty: true, shouldTouch: true }
    );
  };

  const addPackage = () => {
    setValue('packages', [...packages, { name: '', price: '', includes: [] }], { shouldDirty: true, shouldTouch: true });
  };

  const removePackage = (index: number) => {
    setValue(
      'packages',
      packages.filter((_pkg: { name: string; price?: string; includes?: string[] }, i: number) => i !== index),
      { shouldDirty: true, shouldTouch: true }
    );
  };

  const updatePackage = (index: number, key: 'name' | 'price' | 'includes', value: string) => {
    const next = [...packages];
    if (!next[index]) return;

    if (key === 'includes') {
      next[index] = {
        ...next[index],
        includes: value.split('\n').map((x) => x.trim()).filter(Boolean),
      };
    } else {
      next[index] = { ...next[index], [key]: value };
    }

    setValue('packages', next, { shouldDirty: true, shouldTouch: true });
  };

  // --- Step validation ---
  const validateStep = async () => {
    setTopError('');

    const fields = [...current.fields];

    // When multiple cities, notes must be present
    if (step === 1 && serviceArea === 'multiple_cities') {
      fields.push('service_area_notes');
    }

    if (!fields.length) return true;

    const valid = await trigger(fields as any);
    return valid;
  };

  const goNext = async () => {
    const ok = await validateStep();
    if (!ok) return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setStep((s) => Math.min(s + 1, STEP_META.length - 1));
  };

  const goBack = () => {
    setTopError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setStep((s) => Math.max(s - 1, 0));
  };

  // --- Real submit (no mock) ---
  const onSubmit = async (form: IntakeData) => {
    setTopError('');
    setIsSubmitting(true);

    try {
      const caseRes = await fetch('/api/cases', {
        method: 'POST',
        body: JSON.stringify(form),
      });

      if (!caseRes.ok) throw new Error('Failed to create case');
      const caseJson = await caseRes.json();

      const runRes = await fetch(`/api/cases/${caseJson.id}/run`, {
        method: 'POST',
      });

      if (!runRes.ok) throw new Error('Failed to start run');
      const runJson = await runRes.json();

      router.push(`/status/${runJson.jobId}`);
    } catch (_e) {
      setTopError('Something went wrong. Please try again.');
      setIsSubmitting(false);
    }
  };

  // --- Submitting screen (Gemini style) ---
  if (isSubmitting) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/10 blur-[100px] rounded-full pointer-events-none" />
        <div className="w-full max-w-md rounded-[2rem] border border-zinc-200/80 bg-white/80 backdrop-blur-2xl p-12 text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)] animate-in zoom-in-95 duration-500 relative z-10">
          <div className="relative w-20 h-20 mx-auto mb-10">
            <div className="absolute inset-0 rounded-full border-4 border-zinc-100"></div>
            <div className="absolute inset-0 rounded-full border-4 border-zinc-900 border-t-transparent animate-spin"></div>
            <Sparkles className="absolute inset-0 m-auto w-6 h-6 text-zinc-900" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 mb-3">Compiling Your Report</h1>
          <p className="text-zinc-500 mb-8 leading-relaxed text-[15px]">
            Pulling competitor proof and calculating where you’re leaking margin…
          </p>
          <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
            <div className="h-full bg-zinc-900 w-2/3 animate-pulse rounded-full" />
          </div>
          <p className="mt-6 text-[12px] font-bold text-zinc-400 uppercase tracking-widest">Typical time: ~5 minutes</p>
        </div>
      </div>
    );
  }

  const Icon = current.icon;

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-zinc-900 selection:bg-zinc-900 selection:text-white font-sans relative">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 right-0 h-[500px] bg-gradient-to-b from-zinc-200/40 to-transparent pointer-events-none" />

      {/* Top Navigation / Progress */}
      <div className="sticky top-0 z-50 bg-[#FAFAFA]/80 backdrop-blur-xl border-b border-zinc-200/80">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-zinc-900 flex items-center justify-center shadow-md">
              <Target className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold tracking-tight text-[15px] hidden sm:block">ProfitAudit</span>
          </div>

          <div className="flex-1 max-w-sm mx-auto px-4">
            <div className="flex items-center gap-2 w-full">
              {STEP_META.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                    i <= step ? 'bg-zinc-900' : 'bg-zinc-200'
                  } ${i === step ? 'opacity-100' : 'opacity-35'}`}
                />
              ))}
            </div>
            <div className="text-center mt-2 flex items-center justify-center gap-2">
              <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">
                Step {step + 1} of {STEP_META.length}
              </span>
            </div>
          </div>

          <div className="text-[13px] font-semibold text-zinc-500 flex items-center gap-1.5">
            <Building2 className="w-4 h-4" />
            <span className="hidden sm:block">Setup</span>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-12 md:pt-16 pb-32 relative z-10">
        {/* Header */}
        <div className="mb-10 animate-in fade-in slide-in-from-bottom-4 duration-500 text-center sm:text-left flex flex-col sm:items-start items-center">
          <div className="inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-full bg-white border border-zinc-200 shadow-sm text-[12px] font-bold text-zinc-600 mb-6 tracking-wide">
            <Icon className="w-3.5 h-3.5 text-zinc-900" />
            {current.title}
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight mb-4 text-zinc-900">{current.title}</h1>
          <p className="text-lg text-zinc-500 max-w-xl">{current.subtitle}</p>
        </div>

        {/* Form Card */}
        <div className="relative">
          <div className="absolute -inset-1 bg-gradient-to-b from-zinc-200/50 to-transparent rounded-[2.5rem] blur-md opacity-50 pointer-events-none" />
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="relative rounded-[2rem] border border-zinc-200/80 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100"
          >
            <div className="p-6 sm:p-12 space-y-10">
              {/* --- STEP 1: Basics --- */}
              {step === 0 && (
                <div className="space-y-8 animate-in fade-in duration-300">
                  <div className="grid sm:grid-cols-2 gap-8">
                    <Field label="Business website" required error={errors.website_url?.message}>
                      <input
                        {...register('website_url')}
                        className={`${inputBase} ${errors.website_url ? errorBase : ''}`}
                        placeholder="https://example.com"
                      />
                    </Field>

                    <Field label="What do you sell most?" required error={errors.what_they_sell?.message}>
                      <input
                        {...register('what_they_sell')}
                        className={`${inputBase} ${errors.what_they_sell ? errorBase : ''}`}
                        placeholder="Your main service or offer"
                      />
                    </Field>
                  </div>

                  <div className="h-px w-full bg-zinc-100" />

                  <Field label="Street address" required error={errors.street_address?.message}>
                    <input
                      {...register('street_address')}
                      className={`${inputBase} ${errors.street_address ? errorBase : ''}`}
                      placeholder="123 Main St, Suite 200"
                    />
                  </Field>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
                    <Field label="City" required error={errors.city?.message} className="col-span-2 sm:col-span-1">
                      <input
                        {...register('city')}
                        className={`${inputBase} ${errors.city ? errorBase : ''}`}
                        placeholder="City"
                      />
                    </Field>

                    <Field label="State" required error={errors.state_province?.message}>
                      <input
                        {...register('state_province')}
                        className={`${inputBase} ${errors.state_province ? errorBase : ''}`}
                        placeholder="State / Province"
                      />
                    </Field>

                    <Field label="ZIP / Postal code" required error={errors.postal_code?.message}>
                      <input
                        {...register('postal_code')}
                        className={`${inputBase} ${errors.postal_code ? errorBase : ''}`}
                        placeholder="ZIP / Postal"
                      />
                    </Field>
                  </div>
                </div>
              )}

              {/* --- STEP 2: Volume & Services --- */}
              {step === 1 && (
                <div className="space-y-10 animate-in fade-in duration-300">
                  <div className="space-y-4">
                    <Label>
                      Main services you offer <span className="text-zinc-400 font-medium ml-1 normal-case">(Optional)</span>
                    </Label>

                    <div className="flex gap-3 relative">
                      <input
                        value={serviceDraft}
                        onChange={(e) => setServiceDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addService();
                          }
                        }}
                        className={`${inputBase} pr-16`}
                        placeholder="Add a service and press +"
                      />
                      <button
                        type="button"
                        onClick={addService}
                        className="absolute right-2.5 top-2.5 bottom-2.5 aspect-square bg-zinc-900 text-white rounded-lg flex items-center justify-center hover:bg-zinc-800 transition-colors shadow-sm"
                        aria-label="Add service"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    </div>

                    {services.length > 0 && (
                      <div className="flex flex-wrap gap-2.5 pt-2 animate-in fade-in">
                        {services.map((svc, idx) => (
                          <span
                            key={`${svc.name}-${idx}`}
                            className="inline-flex items-center gap-1.5 rounded-full bg-white border border-zinc-200 shadow-sm px-4 py-1.5 text-[14px] font-semibold text-zinc-700 transition-all hover:bg-zinc-50 hover:border-zinc-300 group"
                          >
                            {svc.name}
                            <button
                              type="button"
                              onClick={() => removeService(idx)}
                              className="opacity-40 group-hover:opacity-100 group-hover:text-red-500 transition-colors ml-1"
                              aria-label="Remove service"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="h-px w-full bg-zinc-100" />

                  <div className="grid sm:grid-cols-2 gap-8">
                    <Field
                      label="Monthly jobs / visits"
                      required
                      error={errors.jobs_min?.message || errors.jobs_max?.message}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="number"
                          {...register('jobs_min', { valueAsNumber: true })}
                          className={`${inputBase} ${errors.jobs_min ? errorBase : ''}`}
                          placeholder="Min"
                        />
                        <span className="text-zinc-400 font-medium text-sm">to</span>
                        <input
                          type="number"
                          {...register('jobs_max', { valueAsNumber: true })}
                          className={`${inputBase} ${errors.jobs_max ? errorBase : ''}`}
                          placeholder="Max"
                        />
                      </div>
                    </Field>

                    <Field label="Typical availability" required error={errors.availability?.message}>
                      <select
                        {...register('availability')}
                        className={`${inputBase} appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%24%2024%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M6%209L12%2015L18%209%22%20stroke%3D%22%230F172A%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-[length:1.25rem_1.25rem] bg-[right_1rem_center] bg-no-repeat pr-10`}
                      >
                        {AVAILABILITY_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  <Field label="Service area" required error={(errors as any).service_area?.message}>
                    <div className="grid sm:grid-cols-2 gap-4">
                      {SERVICE_AREA_OPTIONS.map((o) => (
                        <SelectableCard
                          key={o.value}
                          title={o.label}
                          selected={serviceArea === (o.value as any)}
                          onClick={() => setField('service_area', o.value as any)}
                        />
                      ))}
                    </div>
                  </Field>

                  {serviceArea === 'multiple_cities' && (
                    <Field
                      label="List the cities / regions you serve"
                      required
                      error={(errors as any).service_area_notes?.message}
                      className="animate-in slide-in-from-top-4 fade-in"
                    >
                      <textarea
                        {...register('service_area_notes')}
                        className={`${inputBase} min-h-[100px] resize-none ${(errors as any).service_area_notes ? errorBase : ''}`}
                        placeholder="City, State • City, State • Region"
                      />
                    </Field>
                  )}
                </div>
              )}

              {/* --- STEP 3: Pricing --- */}
              {step === 2 && (
                <div className="space-y-10 animate-in fade-in duration-300">
                  <Field
                    label="Average customer total (per job / visit)"
                    required
                    error={errors.ticket_min?.message || errors.ticket_max?.message}
                  >
                    <div className="flex items-center gap-4">
                      <div className="relative w-full">
                        <span className="absolute left-4 top-3.5 text-zinc-400 font-semibold">$</span>
                        <input
                          type="number"
                          {...register('ticket_min', { valueAsNumber: true })}
                          className={`${inputBase} pl-9 font-medium ${errors.ticket_min ? errorBase : ''}`}
                          placeholder="Min"
                        />
                      </div>
                      <span className="text-zinc-400 font-medium text-sm">to</span>
                      <div className="relative w-full">
                        <span className="absolute left-4 top-3.5 text-zinc-400 font-semibold">$</span>
                        <input
                          type="number"
                          {...register('ticket_max', { valueAsNumber: true })}
                          className={`${inputBase} pl-9 font-medium ${errors.ticket_max ? errorBase : ''}`}
                          placeholder="Max"
                        />
                      </div>
                    </div>
                    <p className="text-[13px] text-zinc-500 mt-3 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-zinc-400" />
                      Estimate if you aren’t sure. We look for patterns, not perfection.
                    </p>
                  </Field>

                  <div className="h-px w-full bg-zinc-100" />

                  <Field label="Diagnostic / Trip fee (optional)" error={errors.trip_fee?.message}>
                    <div className="relative max-w-sm">
                      <span className="absolute left-4 top-3.5 text-zinc-400 font-semibold">$</span>
                      <input
                        type="number"
                        {...register('trip_fee')}
                        className={`${inputBase} pl-9 font-medium`}
                        placeholder="Leave blank if none"
                      />
                    </div>
                  </Field>
                </div>
              )}

              {/* --- STEP 4: Offers & Packages --- */}
              {step === 3 && (
                <div className="space-y-10 animate-in fade-in duration-300">
                  <Field label="Do you bundle services into packages?" required>
                    <div className="grid sm:grid-cols-2 gap-4 mt-2">
                      <SelectableCard
                        title="Yes, we have packages"
                        description="Bundles customers can choose from"
                        selected={hasPackages === true}
                        onClick={() => setField('has_packages', true as any)}
                      />
                      <SelectableCard
                        title="No, services are separate"
                        description="Customers pay per service / per job"
                        selected={hasPackages === false}
                        onClick={() => setField('has_packages', false as any)}
                      />
                    </div>
                  </Field>

                  {hasPackages && (
                    <div className="space-y-6 pt-6 border-t border-zinc-100 animate-in fade-in slide-in-from-top-4">
                      <div className="flex items-center justify-between">
                        <Label>Your Packages</Label>
                        <button
                          type="button"
                          onClick={addPackage}
                          className="text-[13px] font-bold text-zinc-900 bg-white border border-zinc-200 px-3.5 py-1.5 rounded-lg hover:bg-zinc-50 hover:border-zinc-300 flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
                        >
                          <Plus className="w-4 h-4" /> Add Package
                        </button>
                      </div>

                      {packages.length === 0 ? (
                        <div className="text-center p-12 border-2 border-dashed border-zinc-200 rounded-2xl bg-zinc-50/50">
                          <div className="w-12 h-12 bg-white rounded-xl shadow-sm border border-zinc-100 flex items-center justify-center mx-auto mb-4">
                            <Target className="w-6 h-6 text-zinc-400" />
                          </div>
                          <h4 className="text-[15px] font-semibold text-zinc-900 mb-1">No packages added</h4>
                          <p className="text-zinc-500 text-[14px]">Add one if you want more precise recommendations.</p>
                        </div>
                      ) : (
                        <div className="space-y-5">
                          {packages.map((pkg, idx) => (
                            <div key={idx} className="relative rounded-[1.5rem] border border-zinc-200 bg-zinc-50/30 p-6 shadow-sm group">
                              <button
                                type="button"
                                onClick={() => removePackage(idx)}
                                className="absolute right-5 top-5 p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                aria-label="Remove package"
                              >
                                <X className="w-4 h-4" />
                              </button>

                              <div className="grid sm:grid-cols-3 gap-5 mb-5 pr-10">
                                <div className="sm:col-span-2">
                                  <input
                                    className={inputBase}
                                    placeholder="Package name"
                                    value={pkg.name ?? ''}
                                    onChange={(e) => updatePackage(idx, 'name', e.target.value)}
                                  />
                                </div>
                                <div>
                                  <input
                                    className={inputBase}
                                    placeholder="Price (optional)"
                                    value={pkg.price ?? ''}
                                    onChange={(e) => updatePackage(idx, 'price', e.target.value)}
                                  />
                                </div>
                              </div>

                              <textarea
                                className={`${inputBase} min-h-[100px] resize-none`}
                                placeholder="What’s included? (one per line)"
                                value={(pkg.includes ?? []).join('\n')}
                                onChange={(e) => updatePackage(idx, 'includes', e.target.value)}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="h-px w-full bg-zinc-100" />

                  <div className="grid sm:grid-cols-2 gap-4">
                    <SelectableCard
                      title="We offer memberships"
                      description="Recurring revenue option"
                      selected={Boolean(watch('has_membership'))}
                      onClick={() => setField('has_membership', (!Boolean(watch('has_membership'))) as any)}
                    />
                    <SelectableCard
                      title="We offer priority service"
                      description="After-hours / expedited option"
                      selected={Boolean(watch('has_priority'))}
                      onClick={() => setField('has_priority', (!Boolean(watch('has_priority'))) as any)}
                    />
                  </div>

                  <Field label="Warranty / guarantee (optional)" error={errors.warranty?.message}>
                    <textarea
                      {...register('warranty')}
                      className={`${inputBase} min-h-[100px] resize-none leading-relaxed`}
                      placeholder="Short description"
                    />
                  </Field>
                </div>
              )}

              {/* --- STEP 5: Final Notes --- */}
              {step === 4 && (
                <div className="space-y-10 animate-in fade-in duration-300">
                  <Field label="What’s your biggest pricing problem right now? (optional)" error={(errors as any).pricing_problem?.message}>
                    <textarea
                      {...register('pricing_problem')}
                      className={`${inputBase} min-h-[140px] resize-none leading-relaxed`}
                      placeholder="Short and honest. This helps the audit prioritize."
                    />
                  </Field>

                  <Field label="Known competitors (optional)" error={errors.known_competitors?.message}>
                    <textarea
                      {...register('known_competitors')}
                      className={`${inputBase} min-h-[120px] resize-none leading-relaxed`}
                      placeholder="Names or websites (optional)"
                    />
                  </Field>

                  <div className="p-8 bg-zinc-900 text-white rounded-[2rem] flex sm:flex-row flex-col items-start gap-6 shadow-2xl relative overflow-hidden group cursor-default">
                    <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity duration-700 pointer-events-none">
                      <Sparkles className="w-32 h-32" />
                    </div>
                    <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center flex-shrink-0 backdrop-blur-md border border-white/10">
                      <Target className="w-6 h-6 text-white" />
                    </div>
                    <div className="relative z-10">
                      <h4 className="font-extrabold text-xl mb-2 tracking-tight">Ready for your Audit?</h4>
                      <p className="text-zinc-400 text-[15px] leading-relaxed mb-5 max-w-md">
                        We’ll compare your offer against local competitors and show what to fix first.
                      </p>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <p className="text-[12px] font-bold text-zinc-300 uppercase tracking-widest">Processing time: ~5 minutes</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {topError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
                  {topError}
                </div>
              ) : null}
            </div>

            {/* Floating Action Footer (inside form so submit works) */}
            <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/80 backdrop-blur-2xl border-t border-zinc-200/80 p-4 sm:p-6 flex justify-center transform-gpu">
              <div className="w-full max-w-3xl flex items-center justify-between px-2 sm:px-4">
                <button
                  type="button"
                  onClick={goBack}
                  className={`flex items-center gap-2 px-6 py-3.5 rounded-full text-[14px] font-bold transition-all active:scale-95 ${
                    step === 0
                      ? 'opacity-0 pointer-events-none'
                      : 'bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 shadow-sm'
                  }`}
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>

                {step < STEP_META.length - 1 ? (
                  <button
                    type="button"
                    onClick={goNext}
                    className="flex items-center gap-2 px-8 py-3.5 rounded-full bg-zinc-900 text-white text-[14px] font-bold shadow-xl shadow-zinc-900/20 hover:bg-zinc-800 hover:-translate-y-0.5 transition-all active:scale-[0.98]"
                  >
                    Next Step <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="flex items-center gap-2 px-8 py-3.5 rounded-full bg-indigo-600 text-white text-[14px] font-bold shadow-xl shadow-indigo-600/20 hover:bg-indigo-700 hover:shadow-2xl hover:shadow-indigo-600/30 hover:-translate-y-0.5 transition-all active:scale-[0.98]"
                  >
                    Generate Report <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
