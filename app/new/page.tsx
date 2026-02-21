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
  { label: 'Local only (near me)', value: 'local_only' },
  { label: 'Within 10 miles / 15 km', value: 'within_10_miles' },
  { label: 'Within 25 miles / 40 km', value: 'within_25_miles' },
  { label: 'Within 50 miles / 80 km', value: 'within_50_miles' },
  { label: 'Multiple cities / regions', value: 'multiple_cities' },
] as const;

const STEPS: StepMeta[] = [
  {
    title: 'Business basics',
    subtitle: 'Set your market context so the benchmark is accurate.',
    fields: ['website_url', 'what_they_sell', 'business_address', 'city', 'state_province', 'postal_code'],
  },
  {
    title: 'Services & volume',
    subtitle: 'Estimate your volume to reveal hidden profit gaps.',
    fields: ['jobs_min', 'jobs_max', 'availability', 'service_area', 'service_area_notes'],
  },
  {
    title: 'Pricing snapshot',
    subtitle: 'A practical range is enough to find missed margin.',
    fields: ['ticket_min', 'ticket_max', 'public_pricing', 'consult_fee_enabled', 'consult_fee_amount'],
  },
  {
    title: 'Offer structure',
    subtitle: 'Simple offer levers can raise profit without more leads.',
    fields: ['packages_status', 'addons_status', 'membership_status', 'warranty_status'],
  },
  {
    title: 'Final details',
    subtitle: 'Add optional context before we generate your report.',
    fields: [],
  },
];

const DEFAULT_INTAKE_VALUES: Partial<IntakeData> = {
  website_url: '',
  what_they_sell: '',
  business_address: '',
  city: '',
  state_province: '',
  postal_code: '',

  jobs_min: 10,
  jobs_max: 50,
  ticket_min: 150,
  ticket_max: 500,

  availability: 'Same Day',
  service_area: 'local_only',
  service_area_notes: '',

  services: [],
  consult_fee_enabled: false,
  consult_fee_amount: undefined,
  public_pricing: 'some',

  packages_status: 'not_sure',
  packages: [],
  addons_status: 'not_sure',
  addons_notes: '',
  membership_status: 'not_sure',
  membership_price: '',
  membership_notes: '',
  warranty_status: 'not_sure',
  warranty_notes: '',

  has_packages: false,
  has_membership: false,
  has_priority: false,
  trip_fee: '',
  pricing_problem: '',
  known_competitors: '',
};

export default function NewAuditPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [serviceDraft, setServiceDraft] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const {
    register,
    handleSubmit,
    trigger,
    watch,
    setValue,
    formState: { errors },
  } = useForm<IntakeData>({
    resolver: zodResolver(IntakeSchema),
    defaultValues: DEFAULT_INTAKE_VALUES,
  });

  const currentStep = STEPS[step];
  const services = watch('services') || [];
  const serviceArea = watch('service_area');
  const consultFeeEnabled = watch('consult_fee_enabled');
  const packagesStatus = watch('packages_status');
  const packages = watch('packages') || [];
  const addonsStatus = watch('addons_status');
  const membershipStatus = watch('membership_status');
  const warrantyStatus = watch('warranty_status');

  const summary = useMemo(() => {
    const v = watch();
    return {
      website: v.website_url || '—',
      offer: v.what_they_sell || '—',
      location: `${v.business_address || '—'} · ${v.city || '—'}, ${v.state_province || '—'} ${v.postal_code || '—'}`,
      volume: `${v.jobs_min ?? '—'} to ${v.jobs_max ?? '—'} / month`,
      speed: v.availability || '—',
      pricing: `${v.ticket_min ?? '—'} to ${v.ticket_max ?? '—'}`,
      packages: v.packages_status || 'not_sure',
    };
  }, [watch]);

  const goNext = async () => {
    const fields = [...currentStep.fields];

    if (step === 1 && serviceArea !== 'multiple_cities') {
      const idx = fields.indexOf('service_area_notes');
      if (idx >= 0) fields.splice(idx, 1);
    }

    if (step === 2 && !consultFeeEnabled) {
      const idx = fields.indexOf('consult_fee_amount');
      if (idx >= 0) fields.splice(idx, 1);
    }

    if (fields.length > 0) {
      const valid = await trigger(fields as any);
      if (!valid) return;
    }

    setStep((s) => Math.min(s + 1, 4));
  };

  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const addService = () => {
    const value = serviceDraft.trim();
    if (!value) return;
    setValue('services', [...services, { name: value }], { shouldDirty: true });
    setServiceDraft('');
  };

  const removeService = (index: number) => {
    setValue('services', services.filter((_, i) => i !== index), { shouldDirty: true });
  };

  const addPackage = () => {
    setValue('packages', [...packages, { name: '' }], { shouldDirty: true });
  };

  const updatePackage = (index: number, key: 'name' | 'price', value: string) => {
    const next = [...packages];
    next[index] = { ...next[index], [key]: value };
    setValue('packages', next, { shouldDirty: true });
  };

  const removePackage = (index: number) => {
    setValue('packages', packages.filter((_, i) => i !== index), { shouldDirty: true });
  };

  const onSubmit = async (data: IntakeData) => {
    setIsSubmitting(true);
    setError('');

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
      if (!runRes.ok) throw new Error('Failed to start audit');
      const runJson = await runRes.json();

      router.push(`/status/${runJson.jobId}`);
    } catch {
      setIsSubmitting(false);
      setError('Something went wrong. Please try again.');
    }
  };

  if (isSubmitting) {
    return (
      <div className="min-h-screen px-4 py-16 flex items-center justify-center">
        <div className="w-full max-w-2xl rounded-2xl border bg-white p-10 text-center shadow-sm space-y-3">
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-zinc-700" />
          <h1 className="text-2xl font-semibold">Building your report…</h1>
          <p className="text-zinc-600">This usually takes 5–7 minutes.</p>
          <p className="text-sm text-zinc-500">We’ll benchmark you against local competitors and pull proof points.</p>
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
              <div className="h-full bg-zinc-900" style={{ width: `${((step + 1) / 5) * 100}%` }} />
            </div>
            <h2 className="pt-2 text-xl font-semibold text-zinc-900">{currentStep.title}</h2>
            <p className="text-sm text-zinc-600">{currentStep.subtitle}</p>
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

                <Field label="Business address" required error={errors.business_address?.message}>
                  <input {...register('business_address')} className="input" placeholder="123 Main St, Suite 200" />
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
                  <Label>List your main services (optional)</Label>
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
                        <span key={`${svc.name}-${idx}`} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1 text-xs">
                          {svc.name}
                          <button type="button" onClick={() => removeService(idx)}>
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <Field label="Roughly how many jobs / appointments do you do per month?" required error={errors.jobs_min?.message || errors.jobs_max?.message}>
                  <div className="grid grid-cols-2 gap-3">
                    <input type="number" {...register('jobs_min', { valueAsNumber: true })} className="input" placeholder="Min" />
                    <input type="number" {...register('jobs_max', { valueAsNumber: true })} className="input" placeholder="Max" />
                  </div>
                </Field>

                <Field label="How fast can customers usually get booked?" required error={errors.availability?.message}>
                  <select {...register('availability')} className="input">
                    {AVAILABILITY_OPTIONS.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Service area" error={errors.service_area?.message}>
                  <Segmented
                    value={serviceArea}
                    onChange={(v) => setValue('service_area', v as IntakeData['service_area'], { shouldValidate: true })}
                    options={SERVICE_AREA_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
                  />
                </Field>

                {serviceArea === 'multiple_cities' && (
                  <Field label="List the cities / regions you serve" required error={errors.service_area_notes?.message}>
                    <textarea {...register('service_area_notes')} className="input min-h-24" placeholder="City, State • City, State • Region" />
                  </Field>
                )}
              </>
            )}

            {step === 2 && (
              <>
                <Field label="Average customer total (per job / visit)" required error={errors.ticket_min?.message || errors.ticket_max?.message}>
                  <div className="grid grid-cols-2 gap-3">
                    <input type="number" {...register('ticket_min', { valueAsNumber: true })} className="input" placeholder="Min" />
                    <input type="number" {...register('ticket_max', { valueAsNumber: true })} className="input" placeholder="Max" />
                  </div>
                </Field>

                <Field label="Do you show prices on your website?" error={errors.public_pricing?.message}>
                  <Segmented
                    value={watch('public_pricing')}
                    onChange={(v) => setValue('public_pricing', v as IntakeData['public_pricing'], { shouldValidate: true })}
                    options={[{ label: 'Yes', value: 'yes' }, { label: 'Some', value: 'some' }, { label: 'No', value: 'no' }]}
                  />
                </Field>

                <Field label="Do you charge a consult / assessment fee?" error={errors.consult_fee_amount?.message}>
                  <Segmented
                    value={consultFeeEnabled ? 'yes' : 'no'}
                    onChange={(v) => {
                      const enabled = v === 'yes';
                      setValue('consult_fee_enabled', enabled, { shouldValidate: true });
                      if (!enabled) setValue('consult_fee_amount', undefined, { shouldValidate: true });
                    }}
                    options={[{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }]}
                  />
                </Field>

                {consultFeeEnabled && (
                  <Field label="Consult / assessment fee" required error={errors.consult_fee_amount?.message}>
                    <input type="number" {...register('consult_fee_amount', { valueAsNumber: true })} className="input" placeholder="Amount" />
                  </Field>
                )}
              </>
            )}

            {step === 3 && (
              <>
                <Field label="Do you offer packages or bundles?" required error={errors.packages_status?.message}>
                  <Segmented
                    value={watch('packages_status')}
                    onChange={(v) => {
                      setValue('packages_status', v as IntakeData['packages_status'], { shouldValidate: true });
                      setValue('has_packages', v === 'yes', { shouldValidate: true });
                      if (v !== 'yes') setValue('packages', [], { shouldValidate: true });
                    }}
                    options={[{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }, { label: 'Not sure', value: 'not_sure' }]}
                  />
                </Field>

                {packagesStatus === 'yes' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Packages</Label>
                      <button type="button" onClick={addPackage} className="px-3 py-1 rounded-md border text-sm">
                        Add package
                      </button>
                    </div>

                    {packages.map((pkg, idx) => (
                      <div key={idx} className="grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
                        <input
                          className="input"
                          placeholder="Package name"
                          value={pkg.name || ''}
                          onChange={(e) => updatePackage(idx, 'name', e.target.value)}
                        />
                        <input
                          className="input"
                          placeholder="Price (optional)"
                          value={pkg.price || ''}
                          onChange={(e) => updatePackage(idx, 'price', e.target.value)}
                        />
                        <button type="button" onClick={() => removePackage(idx)} className="btn-secondary">
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <Field label="Do you offer add-ons or upgrades?" required error={errors.addons_status?.message}>
                  <Segmented
                    value={watch('addons_status')}
                    onChange={(v) => setValue('addons_status', v as IntakeData['addons_status'], { shouldValidate: true })}
                    options={[{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }, { label: 'Not sure', value: 'not_sure' }]}
                  />
                </Field>

                {addonsStatus === 'yes' && (
                  <Field label="Add-ons notes (optional)">
                    <textarea {...register('addons_notes')} className="input min-h-24" placeholder="Add-on name + price (optional)" />
                  </Field>
                )}

                <Field label="Do you have a membership / subscription?" required error={errors.membership_status?.message}>
                  <Segmented
                    value={watch('membership_status')}
                    onChange={(v) => setValue('membership_status', v as IntakeData['membership_status'], { shouldValidate: true })}
                    options={[{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }, { label: 'Not sure', value: 'not_sure' }]}
                  />
                </Field>

                {membershipStatus === 'yes' && (
                  <>
                    <Field label="Membership price (optional)">
                      <input {...register('membership_price')} className="input" placeholder="Monthly amount" />
                    </Field>
                    <Field label="Membership notes (optional)">
                      <textarea {...register('membership_notes')} className="input min-h-24" placeholder="What members get" />
                    </Field>
                  </>
                )}

                <Field label="Do you offer a guarantee / warranty?" required error={errors.warranty_status?.message}>
                  <Segmented
                    value={watch('warranty_status')}
                    onChange={(v) => setValue('warranty_status', v as IntakeData['warranty_status'], { shouldValidate: true })}
                    options={[{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }, { label: 'Not sure', value: 'not_sure' }]}
                  />
                </Field>

                {warrantyStatus === 'yes' && (
                  <Field label="Warranty notes (optional)">
                    <textarea {...register('warranty_notes')} className="input min-h-24" placeholder="Short description" />
                  </Field>
                )}
              </>
            )}

            {step === 4 && (
              <>
                <ReviewCard
                  title="Review"
                  rows={[
                    ['Website', summary.website],
                    ['Main offer', summary.offer],
                    ['Location', summary.location],
                    ['Jobs/month', summary.volume],
                    ['Booking speed', summary.speed],
                    ['Ticket range', summary.pricing],
                    ['Packages', summary.packages],
                  ]}
                />

                <Field label="Biggest pricing problem (optional)">
                  <textarea {...register('pricing_problem')} className="input min-h-24" placeholder="Tell us what feels hardest right now" />
                </Field>

                <Field label="Known competitors (optional)">
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

            {step < 4 ? (
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

function Segmented({
  value,
  onChange,
  options,
}: {
  value?: string;
  onChange: (next: string) => void;
  options: { label: string; value: string }[];
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-md border px-3 py-2 text-sm text-left transition-colors ${
            value === opt.value ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-300 hover:border-zinc-400'
          }`}
        >
          {opt.label}
        </button>
      ))}
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

function ReviewCard({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="rounded-xl border p-4">
      <h3 className="text-sm font-semibold mb-3">{title}</h3>
      <div className="space-y-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-4 text-sm">
            <span className="text-zinc-500">{label}</span>
            <span className="text-zinc-900 font-medium text-right">{value || '—'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
