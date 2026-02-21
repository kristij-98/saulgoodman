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

const STEPS: StepMeta[] = [
  {
    title: 'Business basics',
    subtitle: 'Set your market context so the benchmark is accurate.',
    fields: ['website_url', 'what_they_sell', 'business_address', 'city', 'state_province', 'postal_code'],
  },
  {
    title: 'Services & volume',
    subtitle: 'Estimate your volume to reveal hidden profit gaps.',
    fields: ['jobs_min', 'jobs_max', 'availability'],
  },
  {
    title: 'Pricing snapshot',
    subtitle: 'A practical range is enough to find missed margin.',
    fields: ['ticket_min', 'ticket_max'],
  },
  {
    title: 'Offer structure',
    subtitle: 'Simple offer levers can raise profit without more leads.',
    fields: ['has_packages'],
  },
  {
    title: 'Final details',
    subtitle: 'Add optional context before we generate your report.',
    fields: [],
  },
];

const AVAILABILITY_OPTIONS = ['Same Day', 'Next Day', '2-3 Days', '1 Week+'] as const;

const DEFAULT_INTAKE_VALUES: Partial<IntakeData> = {
  website_url: '',
  business_address: '',
  city: '',
  state_province: '',
  postal_code: '',
  what_they_sell: '',
  services: [],
  jobs_min: 10,
  jobs_max: 50,
  availability: 'Same Day',
  ticket_min: 150,
  ticket_max: 500,
  has_membership: false,
  has_priority: false,
  has_packages: false,
  packages: [],
  trip_fee: '',
  known_competitors: '',
  pricing_problem: '',
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
    defaultValues: DEFAULT_INTAKE_VALUES,
  });

  const current = STEPS[step];
  const progressLabel = `Step ${step + 1} of 5`;

  const services = watch('services') || [];
  const hasPackages = watch('has_packages');
  const packageRows = watch('packages') || [];

  const summary = useMemo(() => {
    const values = watch();
    return {
      website: values.website_url || '—',
      location: values.business_address || '—',
      sell: values.what_they_sell || '—',
      jobs: `${values.jobs_min ?? '—'} to ${values.jobs_max ?? '—'}`,
      availability: values.availability || '—',
      ticket: `${values.ticket_min ?? '—'} to ${values.ticket_max ?? '—'}`,
      packages: values.has_packages ? 'Yes' : 'No',
    };
  }, [watch]);

  const nextStep = async () => {
    if (!current.fields.length) {
      setStep((s) => Math.min(s + 1, 4));
      return;
    }

    const valid = await trigger(current.fields as any);
    if (!valid) return;
    setStep((s) => Math.min(s + 1, 4));
  };

  const backStep = () => setStep((s) => Math.max(s - 1, 0));

  const addService = () => {
    const clean = serviceDraft.trim();
    if (!clean) return;
    setValue('services', [...services, { name: clean }], { shouldDirty: true });
    setServiceDraft('');
  };

  const removeService = (index: number) => {
    setValue('services', services.filter((_, i) => i !== index), { shouldDirty: true });
  };

  const addPackage = () => {
    setValue('packages', [...packageRows, { name: '' }], { shouldDirty: true });
  };

  const updatePackage = (index: number, key: 'name' | 'price', value: string) => {
    const next = [...packageRows];
    next[index] = { ...next[index], [key]: value };
    setValue('packages', next, { shouldDirty: true });
  };

  const removePackage = (index: number) => {
    setValue('packages', packageRows.filter((_, i) => i !== index), { shouldDirty: true });
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
            <div className="text-sm font-medium text-zinc-800">{progressLabel}</div>
            <div className="text-xs text-zinc-500">Quick + honest answers = a sharper report.</div>
            <div className="h-1.5 w-full bg-zinc-200 rounded-full overflow-hidden">
              <div className="h-full bg-zinc-900" style={{ width: `${((step + 1) / 5) * 100}%` }} />
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
              </>
            )}

            {step === 3 && (
              <>
                <Field label="Do you offer packages or bundles?" required error={errors.has_packages?.message}>
                  <Segmented
                    value={hasPackages ? 'yes' : 'no'}
                    onChange={(v) => {
                      const enabled = v === 'yes';
                      setValue('has_packages', enabled, { shouldValidate: true });
                      if (!enabled) setValue('packages', [], { shouldValidate: true });
                    }}
                    options={[
                      { label: 'Yes', value: 'yes' },
                      { label: 'No', value: 'no' },
                    ]}
                  />
                </Field>

                {hasPackages && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Packages</Label>
                      <button type="button" onClick={addPackage} className="px-3 py-1 rounded-md border text-sm">
                        Add package
                      </button>
                    </div>

                    {packageRows.map((pkg, idx) => (
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

                <Field label="Diagnostic / Trip fee (optional)">
                  <input {...register('trip_fee')} className="input" placeholder="Optional amount" />
                </Field>

                <div className="grid md:grid-cols-2 gap-4">
                  <label className="flex items-center gap-2 text-sm rounded-lg border p-3">
                    <input type="checkbox" {...register('has_membership')} className="h-4 w-4" /> We offer a membership
                  </label>
                  <label className="flex items-center gap-2 text-sm rounded-lg border p-3">
                    <input type="checkbox" {...register('has_priority')} className="h-4 w-4" /> We offer priority service
                  </label>
                </div>
              </>
            )}

            {step === 4 && (
              <>
                <ReviewCard
                  title="Review"
                  rows={[
                    ['Website', summary.website],
                    ['Address', summary.location],
                    ['Main offer', summary.sell],
                    ['Jobs/month', summary.jobs],
                    ['Booking speed', summary.availability],
                    ['Ticket range', summary.ticket],
                    ['Packages', summary.packages],
                  ]}
                />

                <Field label="Known competitors (optional)">
                  <textarea
                    {...register('known_competitors')}
                    className="input min-h-24"
                    placeholder="Names or links (optional)"
                  />
                </Field>

                <Field label="Pricing notes (optional)">
                  <textarea
                    {...register('pricing_problem')}
                    className="input min-h-24"
                    placeholder="Anything else we should consider"
                  />
                </Field>
              </>
            )}

            {error && <p className="text-sm text-rose-600">{error}</p>}
          </div>

          <div className="sticky bottom-0 border-t bg-white px-6 md:px-8 py-4 flex items-center justify-between">
            <button type="button" onClick={backStep} disabled={step === 0} className="btn-secondary disabled:opacity-40">
              Back
            </button>

            {step < 4 ? (
              <button type="button" onClick={nextStep} className="btn-primary">
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

function Segmented({ value, onChange, options }: { value?: string; onChange: (next: string) => void; options: { label: string; value: string }[] }) {
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

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
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
