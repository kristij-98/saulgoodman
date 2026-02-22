'use client';

import React, { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { IntakeSchema, type IntakeData } from '@/shared/schema/extractor.zod';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, X } from 'lucide-react';

type StepMeta = {
  title: string;
  subtitle: string;
  fields: (keyof IntakeData)[];
};

const AVAILABILITY_OPTIONS = ['Same Day', 'Next Day', '2-3 Days', '1 Week+'] as const;

const SERVICE_AREA_OPTIONS = [
  { value: 'local_only', label: 'Local only (near me)' },
  { value: 'within_10_miles', label: 'Within 10 miles / 15 km' },
  { value: 'within_25_miles', label: 'Within 25 miles / 40 km' },
  { value: 'within_50_miles', label: 'Within 50 miles / 80 km' },
  { value: 'multiple_cities', label: 'Multiple cities / regions' },
] as const;

const STEP_META: StepMeta[] = [
  {
    title: 'Business basics',
    subtitle: 'Set your market context so your report is sharp and fair.',
    fields: ['website_url', 'what_they_sell', 'street_address', 'city', 'state_province', 'postal_code'],
  },
  {
    title: 'Services & volume',
    subtitle: 'A clear volume range helps expose hidden margin.',
    fields: ['jobs_min', 'jobs_max', 'availability', 'service_area'],
  },
  {
    title: 'Pricing snapshot',
    subtitle: 'Simple, honest numbers are enough.',
    fields: ['ticket_min', 'ticket_max'],
  },
  {
    title: 'Offer structure',
    subtitle: 'These levers usually move profit fast.',
    fields: ['has_packages'],
  },
  {
    title: 'Final notes',
    subtitle: 'Optional details to tighten recommendations.',
    fields: [],
  },
];

const DEFAULT_VALUES: IntakeData = {
  website_url: '',
  what_they_sell: '',

  street_address: '',
  city: '',
  state_province: '',
  postal_code: '',

  jobs_min: 10,
  jobs_max: 50,

  availability: 'Same Day',

  ticket_min: 150,
  ticket_max: 500,

  service_area: 'local_only',
  service_area_notes: '',

  services: [],

  public_pricing: 'some',
  consult_fee_enabled: false,
  consult_fee_amount: undefined,

  packages_status: 'not_sure',
  addons_status: 'not_sure',
  membership_status: 'not_sure',
  warranty_status: 'not_sure',

  trip_fee: '',
  warranty: '',

  has_membership: false,
  has_priority: false,
  has_packages: false,

  packages: [],

  pricing_problem: '',
  known_competitors: '',
};

export default function NewAuditPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [serviceDraft, setServiceDraft] = useState('');

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    trigger,
    formState: { errors },
  } = useForm<IntakeData>({
    resolver: zodResolver(IntakeSchema),
    defaultValues: DEFAULT_VALUES,
    mode: 'onChange',
  });

  const services = watch('services') || [];
  const hasPackages = !!watch('has_packages');
  const packages = watch('packages') || [];
  const serviceArea = watch('service_area');

  const progress = useMemo(() => ((step + 1) / STEP_META.length) * 100, [step]);
  const current = STEP_META[step];

  const addService = () => {
    const clean = serviceDraft.trim();
    if (!clean) return;
    setValue('services', [...services, { name: clean }], { shouldDirty: true });
    setServiceDraft('');
  };

  const removeService = (index: number) => {
    setValue(
      'services',
      services.filter((_, i) => i !== index),
      { shouldDirty: true }
    );
  };

  const addPackage = () => {
    setValue('packages', [...packages, { name: '', price: '', includes: [] }], { shouldDirty: true });
  };

  const removePackage = (index: number) => {
    setValue(
      'packages',
      packages.filter((_, i) => i !== index),
      { shouldDirty: true }
    );
  };

  const updatePackageField = (index: number, key: 'name' | 'price', value: string) => {
    const next = [...packages];
    next[index] = { ...next[index], [key]: value };
    setValue('packages', next, { shouldDirty: true });
  };

  const updatePackageIncludes = (index: number, value: string) => {
    const next = [...packages];
    const includes = value
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean);
    next[index] = { ...next[index], includes };
    setValue('packages', next, { shouldDirty: true });
  };

  const goNext = async () => {
    const fields = [...current.fields];

    // If they selected multiple cities, notes become required (schema enforces too)
    if (step === 1 && serviceArea === 'multiple_cities') {
      fields.push('service_area_notes' as any);
    }

    const valid = fields.length ? await trigger(fields as any) : true;
    if (!valid) return;

    setStep((s) => Math.min(s + 1, STEP_META.length - 1));
  };

  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const onSubmit = async (data: IntakeData) => {
    setError('');
    setIsSubmitting(true);

    try {
      const caseRes = await fetch('/api/cases', {
        method: 'POST',
        body: JSON.stringify(data),
      });

      if (!caseRes.ok) throw new Error('Failed to create case');
      const caseJson = await caseRes.json();

      const runRes = await fetch(`/api/cases/${caseJson.id}/run`, {
        method: 'POST',
      });

      if (!runRes.ok) throw new Error('Failed to start run');
      const runJson = await runRes.json();

      router.push(`/status/${runJson.jobId}`);
    } catch {
      setError('Something went wrong. Please try again.');
      setIsSubmitting(false);
    }
  };

  if (isSubmitting) {
    return (
      <div className="min-h-screen px-4 py-16 flex items-center justify-center">
        <div className="w-full max-w-2xl rounded-2xl border bg-white p-10 text-center shadow-sm space-y-3">
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-zinc-700" />
          <h1 className="text-2xl font-semibold">Building your report…</h1>
          <p className="text-zinc-600">This usually takes 5–7 minutes.</p>
          <p className="text-sm text-zinc-500">Clear priorities. Real proof points. Next moves you can run this week.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-10 md:py-14 flex justify-center">
      <div className="w-full max-w-3xl">
        <div className="text-center mb-8 space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Profit Audit Survey</h1>
          <p className="text-zinc-600">Answer a few quick questions. Get a clear plan to stop profit leaks.</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="rounded-2xl border bg-white shadow-sm overflow-hidden">
          <div className="px-6 md:px-8 py-6 border-b bg-zinc-50/60 space-y-2">
            <div className="text-sm font-medium text-zinc-800">Step {step + 1} of 5</div>
            <div className="text-xs text-zinc-500">Quick + honest answers = a sharper report.</div>
            <div className="h-1.5 w-full bg-zinc-200 rounded-full overflow-hidden">
              <div className="h-full bg-zinc-900 transition-all" style={{ width: `${progress}%` }} />
            </div>
            <h2 className="pt-2 text-xl font-semibold text-zinc-900">{current.title}</h2>
            <p className="text-sm text-zinc-600">{current.subtitle}</p>
          </div>

          <div className="px-6 md:px-8 py-6 space-y-6 pb-28">
            {step === 0 && (
              <>
                <Field label="Business website" required error={errors.website_url?.message}>
                  <input {...register('website_url')} className="input" placeholder="https://example.com" />
                </Field>

                <Field label="What do you sell most?" required error={errors.what_they_sell?.message}>
                  <input {...register('what_they_sell')} className="input" placeholder="Your main service or offer" />
                </Field>

                <Field label="Street address" required error={errors.street_address?.message}>
                  <input {...register('street_address')} className="input" placeholder="123 Main St, Suite 200" />
                </Field>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="City" required error={errors.city?.message}>
                    <input {...register('city')} className="input" placeholder="City" />
                  </Field>

                  <Field label="State" required error={errors.state_province?.message}>
                    <input {...register('state_province')} className="input" placeholder="State" />
                  </Field>
                </div>

                <Field label="ZIP / Postal code" required error={errors.postal_code?.message}>
                  <input {...register('postal_code')} className="input" placeholder="ZIP / Postal code" />
                </Field>
              </>
            )}

            {step === 1 && (
              <>
                <div className="space-y-2">
                  <Label>Main services (optional)</Label>
                  <div className="flex gap-2">
                    <input
                      value={serviceDraft}
                      onChange={(e) => setServiceDraft(e.target.value)}
                      className="input"
                      placeholder="e.g. Plumbing, Dental, Landscaping"
                    />
                    <button type="button" onClick={addService} className="px-3 rounded-md border text-sm font-medium">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  {!!services.length && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {services.map((svc, idx) => (
                        <span
                          key={`${svc.name}-${idx}`}
                          className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1 text-xs"
                        >
                          {svc.name}
                          <button type="button" onClick={() => removeService(idx)} aria-label="Remove service">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <Field
                  label="Roughly how many jobs / appointments do you do per month?"
                  required
                  error={errors.jobs_min?.message || errors.jobs_max?.message}
                >
                  <div className="grid grid-cols-2 gap-3">
                    <input type="number" {...register('jobs_min', { valueAsNumber: true })} className="input" placeholder="Min" />
                    <input type="number" {...register('jobs_max', { valueAsNumber: true })} className="input" placeholder="Max" />
                  </div>
                </Field>

                <Field label="How fast can customers usually get booked?" required error={errors.availability?.message}>
                  <select {...register('availability')} className="input">
                    {AVAILABILITY_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Where do you serve customers?" required error={(errors as any).service_area?.message}>
                  <select {...register('service_area')} className="input">
                    {SERVICE_AREA_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>

                {serviceArea === 'multiple_cities' && (
                  <Field label="List the cities / regions you serve" required error={(errors as any).service_area_notes?.message}>
                    <textarea
                      {...register('service_area_notes')}
                      className="input min-h-24"
                      placeholder="City, State • City, State • Region"
                    />
                  </Field>
                )}
              </>
            )}

            {step === 2 && (
              <>
                <Field
                  label="Average customer total (per job / visit)"
                  required
                  error={errors.ticket_min?.message || errors.ticket_max?.message}
                >
                  <div className="grid grid-cols-2 gap-3">
                    <input type="number" {...register('ticket_min', { valueAsNumber: true })} className="input" placeholder="Min" />
                    <input type="number" {...register('ticket_max', { valueAsNumber: true })} className="input" placeholder="Max" />
                  </div>
                </Field>

                <Field label="Diagnostic / Trip fee (optional)" error={errors.trip_fee?.message}>
                  <input {...register('trip_fee')} className="input" placeholder="Optional amount" />
                </Field>
              </>
            )}

            {step === 3 && (
              <>
                <Field label="Do you offer packages or bundles?" required error={errors.has_packages?.message}>
                  <label className="flex items-center gap-2 text-sm rounded-lg border p-3">
                    <input type="checkbox" {...register('has_packages')} className="h-4 w-4" />
                    Yes, we offer packages/bundles
                  </label>
                </Field>

                {hasPackages && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Packages</Label>
                      <button type="button" onClick={addPackage} className="px-3 py-1 rounded-md border text-sm">
                        Add package
                      </button>
                    </div>

                    {packages.map((pkg, idx) => (
                      <div key={idx} className="rounded-lg border p-3 space-y-2">
                        <input
                          className="input"
                          placeholder="Package name"
                          value={pkg.name || ''}
                          onChange={(e) => updatePackageField(idx, 'name', e.target.value)}
                        />
                        <input
                          className="input"
                          placeholder="Price (optional)"
                          value={pkg.price || ''}
                          onChange={(e) => updatePackageField(idx, 'price', e.target.value)}
                        />
                        <textarea
                          className="input min-h-20"
                          placeholder="Includes (optional, one per line)"
                          value={(pkg.includes || []).join('\n')}
                          onChange={(e) => updatePackageIncludes(idx, e.target.value)}
                        />
                        <button type="button" onClick={() => removePackage(idx)} className="btn-secondary">
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid md:grid-cols-2 gap-4">
                  <label className="flex items-center gap-2 text-sm rounded-lg border p-3">
                    <input type="checkbox" {...register('has_membership')} className="h-4 w-4" />
                    We offer a membership
                  </label>
                  <label className="flex items-center gap-2 text-sm rounded-lg border p-3">
                    <input type="checkbox" {...register('has_priority')} className="h-4 w-4" />
                    We offer priority service
                  </label>
                </div>

                <Field label="Warranty / guarantee (optional)" error={errors.warranty?.message}>
                  <textarea {...register('warranty')} className="input min-h-24" placeholder="Short description" />
                </Field>
              </>
            )}

            {step === 4 && (
              <>
                <Field label="What’s the biggest pricing problem right now? (optional)" error={(errors as any).pricing_problem?.message}>
                  <textarea
                    {...register('pricing_problem')}
                    className="input min-h-24"
                    placeholder="Example: Busy, but margins feel thin."
                  />
                </Field>

                <Field label="Known competitors (optional)" error={errors.known_competitors?.message}>
                  <textarea {...register('known_competitors')} className="input min-h-24" placeholder="Names or links (optional)" />
                </Field>
              </>
            )}

            {error && <p className="text-sm text-rose-600">{error}</p>}
          </div>

          <div className="sticky bottom-0 border-t bg-white px-6 md:px-8 py-4 flex items-center justify-between">
            <button type="button" onClick={goBack} disabled={step === 0} className="btn-secondary disabled:opacity-40">
              Back
            </button>

            {step < STEP_META.length - 1 ? (
              <button type="button" onClick={goNext} className="btn-primary">
                Next step
              </button>
            ) : (
              <div className="text-right">
                <button type="submit" className="btn-primary">
                  Generate my report →
                </button>
                <p className="text-xs text-zinc-500 mt-2">This usually takes 5–7 minutes.</p>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-sm font-medium text-zinc-900">{children}</label>;
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label} {required && <span className="text-zinc-500">(Required)</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}
