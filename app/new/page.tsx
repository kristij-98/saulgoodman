'use client';

import React, { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { IntakeSchema, type IntakeData } from '@/shared/schema/extractor.zod';
import { useRouter } from 'next/navigation';
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(0);

  const {
    register,
    handleSubmit,
    trigger,
    formState: { errors },
  } = useForm<IntakeData>({
    resolver: zodResolver(IntakeSchema),
    defaultValues: {
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
          </div>
        )}

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

        {error && <div className="p-3 text-sm text-red-600 bg-red-50 rounded">{error}</div>}

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
