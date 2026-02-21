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
    subtitle: 'This sets your market context so the benchmark is accurate.',
    fields: ['website_url', 'city', 'state_region', 'postal_code', 'what_they_sell', 'service_area'],
  },
  {
    title: 'Services & volume',
    subtitle: 'This helps estimate what you’re leaving on the table.',
    fields: ['jobs_min', 'jobs_max', 'availability'],
  },
  {
    title: 'Pricing snapshot',
    subtitle: 'Don’t overthink it. A realistic range is enough.',
    fields: [
      'ticket_min',
      'ticket_max',
      'main_service_min',
      'main_service_max',
      'consult_fee_enabled',
      'public_pricing',
      'consult_fee_amount',
    ],
  },
  {
    title: 'Offer structure',
    subtitle: 'These levers increase profit without more leads.',
    fields: ['packages_status', 'addons_status', 'membership_status', 'warranty_status'],
  },
  {
    title: 'Confirm & run',
    subtitle: 'You’ll get a clear report with priorities and next steps.',
    fields: [],
  },
];

const SERVICE_AREA_OPTIONS = [
  { value: 'local_only', label: 'Local only (near me)' },
  { value: 'within_10_miles', label: 'Within 10 miles / 15 km' },
  { value: 'within_25_miles', label: 'Within 25 miles / 40 km' },
  { value: 'within_50_miles', label: 'Within 50 miles / 80 km' },
  { value: 'multiple_cities', label: 'Multiple cities / regions' },
] as const;

const AVAILABILITY_OPTIONS = ['Same day', 'Next day', '2–3 days', '1 week+'] as const;
import { Loader2 } from 'lucide-react';

const SURVEY_STEPS: { title: string; description: string; fields: (keyof IntakeData)[] }[] = [
  {
    title: 'Step 1 · Business Basics',
    description: 'Critical fields required to run a reliable local benchmark.',
    fields: ['website_url', 'what_they_sell', 'city', 'state_province'],
  },
  {
    title: 'Step 2 · Services & Volume',
    description: 'Service context helps us frame better competitor comparisons.',
    fields: ['jobs_min', 'jobs_max', 'availability'],
  },
  {
    title: 'Step 3 · Pricing Snapshot',
    description: 'Ticket range is critical for revenue leak estimation.',
    fields: ['ticket_min', 'ticket_max'],
  },
  {
    title: 'Step 4 · Offer Structure',
    description: 'Optional details that improve strategic recommendations.',
    fields: ['trip_fee', 'has_membership', 'has_priority', 'has_packages'],
  },
  {
    title: 'Step 5 · Proof Inputs',
    description: 'Competitor names are optional, but useful when available.',
    fields: ['pricing_list_contact', 'known_competitors'],
  },
];

export default function NewAuditPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [serviceDraft, setServiceDraft] = useState('');
  const [step, setStep] = useState(0);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    trigger,
    formState: { errors },
  } = useForm<IntakeData>({
    resolver: zodResolver(IntakeSchema),
    defaultValues: {
      city: '',
      state_region: '',
      postal_code: '',
      street_address: '',
      website_url: '',
      what_they_sell: '',
      service_area: 'local_only',
      service_area_notes: '',
      services: [],
      jobs_min: 40,
      jobs_max: 120,
      availability: 'Next day',
      ticket_min: 150,
      ticket_max: 500,
      main_service_min: 500,
      main_service_max: 2500,
      consult_fee_enabled: false,
      consult_fee_amount: undefined,
      public_pricing: 'some',
      packages_status: 'not_sure',
      packages_notes: '',
      addons_status: 'not_sure',
      addons_notes: '',
      membership_status: 'not_sure',
      membership_price: '',
      membership_notes: '',
      warranty_status: 'not_sure',
      warranty_notes: '',
      pricing_problem: '',
    },
  });

  const current = STEPS[step];
  const progressLabel = `Step ${step + 1} of 5`;

  const serviceArea = watch('service_area');
  const consultFeeEnabled = watch('consult_fee_enabled');
  const packagesStatus = watch('packages_status');
  const addonsStatus = watch('addons_status');
  const membershipStatus = watch('membership_status');
  const warrantyStatus = watch('warranty_status');
  const services = watch('services') || [];

  const summary = useMemo(() => {
    const values = watch();
    return {
      website: values.website_url || '—',
      location: `${values.city || '—'}, ${values.state_region || '—'} ${values.postal_code || '—'}`,
      serviceArea:
        SERVICE_AREA_OPTIONS.find((o) => o.value === values.service_area)?.label || '—',
      whatTheySell: values.what_they_sell || '—',
      jobsRange: `${values.jobs_min ?? '—'} to ${values.jobs_max ?? '—'}`,
      bookingSpeed: values.availability || '—',
      avgTicketRange: `${values.ticket_min ?? '—'} to ${values.ticket_max ?? '—'}`,
      mainRange: `${values.main_service_min ?? '—'} to ${values.main_service_max ?? '—'}`,
      consultFee:
        values.consult_fee_enabled
          ? values.consult_fee_amount != null
            ? String(values.consult_fee_amount)
            : 'Yes'
          : 'No',
      publicPricing: values.public_pricing || '—',
      offerLevers: {
        packages: values.packages_status,
        addons: values.addons_status,
        membership: values.membership_status,
        warranty: values.warranty_status,
      },
    };
  }, [watch]);

  const nextStep = async () => {
    if (!current.fields.length) {
      setStep((s) => Math.min(s + 1, 4));
      return;
    }

    const valid = await trigger(current.fields);
    if (!valid) return;

    if (step === 2 && consultFeeEnabled) {
      const consultValid = await trigger('consult_fee_amount');
      if (!consultValid) return;
    }

    if (step === 0 && serviceArea === 'multiple_cities') {
      const areaValid = await trigger('service_area_notes');
      if (!areaValid) return;
    }

    setStep((s) => Math.min(s + 1, 4));
  };

  const backStep = () => setStep((s) => Math.max(s - 1, 0));

  const addService = () => {
    const clean = serviceDraft.trim();
    if (!clean) return;
    setValue('services', [...services, clean], { shouldDirty: true });
    setServiceDraft('');
  };

  const removeService = (index: number) => {
    setValue(
      'services',
      services.filter((_, i) => i !== index),
      { shouldDirty: true }
    );
  };
      availability: 'Same Day',
      jobs_min: 10,
      jobs_max: 50,
      ticket_min: 150,
      ticket_max: 500,
      has_membership: false,
      has_priority: false,
      has_packages: false,
    },
  });

  const stepMeta = SURVEY_STEPS[step];
  const progress = useMemo(() => Math.round(((step + 1) / SURVEY_STEPS.length) * 100), [step]);

  const goNext = async () => {
    const valid = await trigger(stepMeta.fields);
    if (!valid) return;
    setStep((s) => Math.min(s + 1, SURVEY_STEPS.length - 1));
  };

  const goBack = () => setStep((s) => Math.max(s - 1, 0));

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

      const runRes = await fetch(`/api/cases/${caseJson.id}/run`, { method: 'POST' });
      const runRes = await fetch(`/api/cases/${caseJson.id}/run`, {
        method: 'POST',
      });
      if (!runRes.ok) throw new Error('Failed to start audit');
      const runJson = await runRes.json();

      router.push(`/status/${runJson.jobId}`);
    } catch (e) {
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
          <p className="text-sm text-zinc-500">We’ll show the biggest profit gaps and what to fix first.</p>
        </div>
  return (
    <div className="max-w-3xl mx-auto py-10 px-4 space-y-8">
      <div className="space-y-3 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Profit Audit Survey</h1>
        <p className="text-sm text-zinc-600">A guided intake to build your competitive pricing audit.</p>
      </div>

      <div className="rounded-xl border bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>{stepMeta.title}</span>
          <span>{step + 1}/{SURVEY_STEPS.length}</span>
        </div>
        <div className="h-2 w-full rounded-full bg-zinc-100 overflow-hidden">
          <div className="h-full bg-slate-900 transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-sm text-zinc-600">{stepMeta.description}</p>
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
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {step === 0 && (
          <div className="rounded-xl border bg-white p-6 shadow-sm space-y-5">
            <FieldLabel title="Website URL" critical />
            <input {...register('website_url')} className="input" placeholder="https://example.com" />
            {errors.website_url && <Err msg={errors.website_url.message} />}

            <FieldLabel title="What are your main services?" critical />
            <input {...register('what_they_sell')} className="input" placeholder="e.g. HVAC, Plumbing, Dental" />
            {errors.what_they_sell && <Err msg={errors.what_they_sell.message} />}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <FieldLabel title="City" critical />
                <input {...register('city')} className="input" placeholder="Austin" />
                {errors.city && <Err msg={errors.city.message} />}
              </div>
              <div>
                <FieldLabel title="State/Province" critical />
                <input {...register('state_province')} className="input" placeholder="TX" />
                {errors.state_province && <Err msg={errors.state_province.message} />}
              </div>
            </div>

            <div>
              <FieldLabel title="How long have you been in business?" />
              <input {...register('years_in_business')} className="input" placeholder="e.g. 7 years" />
            </div>
            <h2 className="pt-2 text-xl font-semibold text-zinc-900">{current.title}</h2>
            <p className="text-sm text-zinc-600">{current.subtitle}</p>
          </div>
        )}

          <div className="px-6 md:px-8 py-6 space-y-6 pb-28">
            {step === 0 && (
              <>
                <Field label="Business website" required helper="So your report matches what customers see online." error={errors.website_url?.message}>
                  <input {...register('website_url')} className="input" placeholder="https://yourbusiness.com" />
                </Field>

                <div className="space-y-3">
                  <Label>Business location <span className="text-zinc-500">(Required)</span></Label>
                  <p className="text-xs text-zinc-500">Your market changes by area. This keeps the benchmark fair.</p>
                  <Field label="Street address (optional)" helper="Optional, but improves location accuracy.">
                    <input {...register('street_address')} className="input" placeholder="Street address (optional)" />
                  </Field>
                  <div className="grid md:grid-cols-2 gap-4">
                    <Field label="City" required error={errors.city?.message}>
                      <input {...register('city')} className="input" placeholder="City" />
                    </Field>
                    <Field label="State / Region" required error={errors.state_region?.message}>
                      <input {...register('state_region')} className="input" placeholder="State / Region" />
                    </Field>
                  </div>
                  <Field label="ZIP / Postal code" required error={errors.postal_code?.message}>
                    <input {...register('postal_code')} className="input" placeholder="ZIP / Postal code" />
                  </Field>
                </div>

                <Field
                  label="What do you sell most?"
                  required
                  helper="Keep it simple. One line is enough."
                  error={errors.what_they_sell?.message}
                >
                  <input {...register('what_they_sell')} className="input" placeholder="Your main service or offer" />
                </Field>

                <Field
                  label="Where do you serve customers?"
                  required
                  helper="Keeps the comparison fair and relevant."
                  error={errors.service_area?.message}
                >
                  <Segmented
                    value={serviceArea}
                    onChange={(v) => setValue('service_area', v as IntakeData['service_area'], { shouldValidate: true })}
                    options={SERVICE_AREA_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                  />
                </Field>

                {serviceArea === 'multiple_cities' && (
                  <Field
                    label="List the cities / regions you serve"
                    required
                    error={errors.service_area_notes?.message}
                  >
                    <textarea
                      {...register('service_area_notes')}
                      className="input min-h-24"
                      placeholder="City, State • City, State • Region"
                    />
                  </Field>
                )}
              </>
            )}

            {step === 1 && (
              <>
                <div className="space-y-2">
                  <Label>List your main services (optional)</Label>
                  <p className="text-xs text-zinc-500">If you want cleaner recommendations, list your top services.</p>
                  <div className="flex gap-2">
                    <input
                      value={serviceDraft}
                      onChange={(e) => setServiceDraft(e.target.value)}
                      className="input"
                      placeholder="Add a service"
                    />
                    <button type="button" onClick={addService} className="px-3 rounded-md border text-sm font-medium">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  {!!services.length && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {services.map((svc, idx) => (
                        <span key={`${svc}-${idx}`} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1 text-xs">
                          {svc}
                          <button type="button" onClick={() => removeService(idx)}>
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
                  helper="Estimates are fine. We just need the range."
                  error={errors.jobs_min?.message || errors.jobs_max?.message}
                >
                  <div className="grid grid-cols-2 gap-3">
                    <input type="number" {...register('jobs_min', { valueAsNumber: true })} className="input" placeholder="Min (e.g., 40)" />
                    <input type="number" {...register('jobs_max', { valueAsNumber: true })} className="input" placeholder="Max (e.g., 120)" />
                  </div>
                </Field>

                <Field
                  label="How fast can customers usually get booked?"
                  required
                  helper="Speed changes what customers will pay."
                  error={errors.availability?.message}
                >
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
                <Field
                  label="Average customer total (per job / visit)"
                  required
                  helper="What you typically collect per customer."
                  error={errors.ticket_min?.message || errors.ticket_max?.message}
                >
                  <div className="grid grid-cols-2 gap-3">
                    <input type="number" {...register('ticket_min', { valueAsNumber: true })} className="input" placeholder="Min (e.g., 150)" />
                    <input type="number" {...register('ticket_max', { valueAsNumber: true })} className="input" placeholder="Max (e.g., 500)" />
                  </div>
                </Field>

                <Field
                  label="Price range for your main service"
                  required
                  helper="Used to spot underpricing and missed upgrades."
                  error={errors.main_service_min?.message || errors.main_service_max?.message}
                >
                  <div className="grid grid-cols-2 gap-3">
                    <input type="number" {...register('main_service_min', { valueAsNumber: true })} className="input" placeholder="Min (e.g., 500)" />
                    <input type="number" {...register('main_service_max', { valueAsNumber: true })} className="input" placeholder="Max (e.g., 2,500)" />
                  </div>
                </Field>

                <Field
                  label="Do you charge a consult / assessment fee?"
                  required
                  helper="Helps set expectations and filter low-intent leads."
                  error={errors.consult_fee_enabled?.message || errors.consult_fee_amount?.message}
                >
                  <Segmented
                    value={consultFeeEnabled ? 'yes' : 'no'}
                    onChange={(v) => {
                      const enabled = v === 'yes';
                      setValue('consult_fee_enabled', enabled, { shouldValidate: true });
                      if (!enabled) setValue('consult_fee_amount', undefined, { shouldValidate: true });
                    }}
                    options={[
                      { label: 'Yes', value: 'yes' },
                      { label: 'No', value: 'no' },
                    ]}
                  />
                </Field>

                {consultFeeEnabled && (
                  <Field label="Consult / assessment fee" required error={errors.consult_fee_amount?.message}>
                    <input
                      type="number"
                      {...register('consult_fee_amount', { valueAsNumber: true })}
                      className="input"
                      placeholder="e.g., 150"
                    />
                  </Field>
                )}

                <Field
                  label="Do you show prices on your website?"
                  required
                  helper="This affects trust and conversions."
                  error={errors.public_pricing?.message}
                >
                  <Segmented
                    value={watch('public_pricing')}
                    onChange={(v) => setValue('public_pricing', v as IntakeData['public_pricing'], { shouldValidate: true })}
                    options={[
                      { label: 'Yes', value: 'yes' },
                      { label: 'Some', value: 'some' },
                      { label: 'No', value: 'no' },
                    ]}
                  />
                </Field>
              </>
            )}

            {step === 3 && (
              <>
                <Field
                  label="Do you offer packages or bundles?"
                  required
                  helper="Packages often raise profit per customer."
                  error={errors.packages_status?.message}
                >
                  <Segmented
                    value={packagesStatus}
                    onChange={(v) => setValue('packages_status', v as IntakeData['packages_status'], { shouldValidate: true })}
                    options={statusOptions()}
                  />
                </Field>
                {packagesStatus === 'yes' && (
                  <Field label="List your packages (optional)">
                    <textarea {...register('packages_notes')} className="input min-h-24" placeholder="Package name + what’s included" />
                  </Field>
                )}

                <Field
                  label="Do you offer add-ons or upgrades?"
                  required
                  helper="Add-ons are often high-margin."
                  error={errors.addons_status?.message}
                >
                  <Segmented
                    value={addonsStatus}
                    onChange={(v) => setValue('addons_status', v as IntakeData['addons_status'], { shouldValidate: true })}
                    options={statusOptions()}
                  />
                </Field>
                {addonsStatus === 'yes' && (
                  <Field label="List your add-ons (optional)">
                    <textarea {...register('addons_notes')} className="input min-h-24" placeholder="Add-on name + price (if you want)" />
                  </Field>
                )}

                <Field
                  label="Do you have a membership / subscription?"
                  required
                  helper="Recurring revenue stabilizes your month."
                  error={errors.membership_status?.message}
                >
                  <Segmented
                    value={membershipStatus}
                    onChange={(v) => setValue('membership_status', v as IntakeData['membership_status'], { shouldValidate: true })}
                    options={statusOptions()}
                  />
                </Field>
                {membershipStatus === 'yes' && (
                  <div className="grid gap-4">
                    <Field label="Membership price">
                      <input {...register('membership_price')} className="input" placeholder="e.g., 49/mo" />
                    </Field>
                    <Field label="What’s included? (optional)">
                      <textarea {...register('membership_notes')} className="input min-h-20" placeholder="What members get" />
                    </Field>
                  </div>
                )}

                <Field
                  label="Do you offer a guarantee / warranty?"
                  required
                  helper="A clear promise supports premium pricing."
                  error={errors.warranty_status?.message}
                >
                  <Segmented
                    value={warrantyStatus}
                    onChange={(v) => setValue('warranty_status', v as IntakeData['warranty_status'], { shouldValidate: true })}
                    options={statusOptions()}
                  />
                </Field>
                {warrantyStatus === 'yes' && (
                  <Field label="Describe it (optional)">
                    <textarea {...register('warranty_notes')} className="input min-h-20" placeholder="Short description" />
                  </Field>
                )}

                <Field
                  label="What’s the biggest pricing problem right now? (optional)"
                  helper="This helps tailor your recommendations."
                >
                  <textarea {...register('pricing_problem')} className="input min-h-24" placeholder="Example: Busy, but margins feel thin." />
                </Field>
              </>
            )}

            {step === 4 && (
              <div className="space-y-4">
                <ReviewCard title="Market setup" rows={[
                  ['Website', summary.website],
                  ['City/State/ZIP', summary.location],
                  ['Service area', summary.serviceArea],
                ]} />
                <ReviewCard title="What you sell most" rows={[[ 'Main offer', summary.whatTheySell ]]} />
                <ReviewCard title="Volume" rows={[
                  ['Jobs/month range', summary.jobsRange],
                  ['Booking speed', summary.bookingSpeed],
                ]} />
                <ReviewCard title="Pricing" rows={[
                  ['Avg ticket range', summary.avgTicketRange],
                  ['Main service price range', summary.mainRange],
                  ['Consult fee', summary.consultFee],
                  ['Public pricing', summary.publicPricing],
                ]} />
                <ReviewCard title="Offer levers" rows={[
                  ['Packages', prettyStatus(summary.offerLevers.packages)],
                  ['Add-ons', prettyStatus(summary.offerLevers.addons)],
                  ['Membership', prettyStatus(summary.offerLevers.membership)],
                  ['Guarantee', prettyStatus(summary.offerLevers.warranty)],
                ]} />
              </div>
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

function statusOptions() {
  return [
    { label: 'Yes', value: 'yes' },
    { label: 'No', value: 'no' },
    { label: 'Not sure', value: 'not_sure' },
  ];
}
        {step === 1 && (
          <div className="rounded-xl border bg-white p-6 shadow-sm space-y-5">
            <div>
              <FieldLabel title="What are your main services? (details)" />
              <textarea {...register('main_services')} className="input min-h-24" placeholder={'• Furnace tune-up\n• AC replacement\n• Emergency repair'} />
            </div>

            <div>
              <FieldLabel title="Roughly how many jobs do you do per month?" critical />
              <div className="flex gap-2 items-center">
                <input type="number" {...register('jobs_min', { valueAsNumber: true })} className="input" placeholder="Min" />
                <span className="text-zinc-500">to</span>
                <input type="number" {...register('jobs_max', { valueAsNumber: true })} className="input" placeholder="Max" />
              </div>
              {(errors.jobs_min || errors.jobs_max) && <Err msg={errors.jobs_min?.message || errors.jobs_max?.message} />}
            </div>

            <div>
              <FieldLabel title="Current Availability" critical />
              <select {...register('availability')} className="input">
                <option>Same Day</option>
                <option>Next Day</option>
                <option>2-3 Days</option>
                <option>1 Week+</option>
              </select>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="rounded-xl border bg-white p-6 shadow-sm space-y-5">
            <div>
              <FieldLabel title="When was the last time you adjusted your pricing?" />
              <input {...register('last_pricing_update')} className="input" placeholder="e.g. 9 months ago" />
            </div>

            <div>
              <FieldLabel title="What do you currently charge for your main service?" />
              <input {...register('main_service_price')} className="input" placeholder="e.g. $189 service call" />
            </div>

            <div>
              <FieldLabel title="Avg Ticket ($)" critical />
              <div className="flex gap-2 items-center">
                <input type="number" {...register('ticket_min', { valueAsNumber: true })} className="input" placeholder="Min" />
                <span className="text-zinc-500">to</span>
                <input type="number" {...register('ticket_max', { valueAsNumber: true })} className="input" placeholder="Max" />
              </div>
              {(errors.ticket_min || errors.ticket_max) && <Err msg={errors.ticket_min?.message || errors.ticket_max?.message} />}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="rounded-xl border bg-white p-6 shadow-sm space-y-5">
            <div className="space-y-3">
              <FieldLabel title="Do you offer any packages or bundles?" />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" {...register('has_packages')} className="h-4 w-4" /> Yes
              </label>
            </div>

            <div className="space-y-3">
              <FieldLabel title="Diagnostic / Trip Fee" />
              <input {...register('trip_fee')} className="input" placeholder="e.g. $89" />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <label className="flex items-center gap-2 text-sm rounded-lg border p-3">
                <input type="checkbox" {...register('has_membership')} className="h-4 w-4" /> We offer a membership
              </label>
              <label className="flex items-center gap-2 text-sm rounded-lg border p-3">
                <input type="checkbox" {...register('has_priority')} className="h-4 w-4" /> We offer priority/after-hours service
              </label>
            </div>

            <div>
              <FieldLabel title="What's your biggest frustration with pricing?" />
              <textarea {...register('pricing_frustration')} className="input min-h-24" placeholder="Describe what's hardest right now..." />
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="rounded-xl border bg-white p-6 shadow-sm space-y-5">
            <div>
              <FieldLabel title="Can you share your current service menu/pricing list contact?" />
              <input {...register('pricing_list_contact')} className="input" placeholder="Email, URL, or best contact person" />
            </div>

            <div>
              <FieldLabel title="Any competitors we should inspect?" optional />
              <textarea
                {...register('known_competitors')}
                className="input min-h-28"
                placeholder={'Optional: one per line\n• Competitor 1\n• Competitor 2'}
              />
              <p className="text-xs text-zinc-500 mt-2">Optional — we can still run the audit without this.</p>
            </div>
          </div>
        )}

function prettyStatus(v?: string) {
  if (v === 'yes') return 'Yes';
  if (v === 'no') return 'No';
  return 'Not sure';
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
  helper,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  helper?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label} {required && <span className="text-zinc-500">(Required)</span>}
      </Label>
      {children}
      {helper && <p className="text-xs text-zinc-500">{helper}</p>}
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
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={goBack}
            disabled={step === 0 || isSubmitting}
            className="h-11 px-5 rounded-lg border text-sm font-medium disabled:opacity-40"
          >
            Back
          </button>

          {step < SURVEY_STEPS.length - 1 ? (
            <button
              type="button"
              onClick={goNext}
              className="h-11 px-5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"
            >
              Next step
            </button>
          ) : (
            <button
              disabled={isSubmitting}
              type="submit"
              className="h-11 px-6 bg-slate-900 text-white font-medium rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Starting Audit...
                </>
              ) : (
                'Run Audit'
              )}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function FieldLabel({ title, critical, optional }: { title: string; critical?: boolean; optional?: boolean }) {
  return (
    <label className="text-sm font-medium text-zinc-900 mb-1 block">
      {title}{' '}
      {critical && <span className="text-[11px] font-semibold text-rose-600">(Critical)</span>}
      {optional && <span className="text-[11px] font-semibold text-zinc-500">(Optional)</span>}
    </label>
  );
}

function Err({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <span className="text-xs text-red-500">{msg}</span>;
}
