'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { IntakeSchema, type IntakeData } from '@/shared/schema/extractor.zod';
import { useRouter } from 'next/navigation';
import { Loader2, ChevronDown, ChevronUp } from 'lucide-react';

export default function NewAuditPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPro, setShowPro] = useState(false);
  const [error, setError] = useState('');

  const { register, handleSubmit, formState: { errors } } = useForm<IntakeData>({
    resolver: zodResolver(IntakeSchema),
    defaultValues: {
      availability: "Same Day",
      jobs_min: 10,
      jobs_max: 50,
      ticket_min: 150,
      ticket_max: 500
    }
  });

  const onSubmit = async (data: IntakeData) => {
    setIsSubmitting(true);
    setError('');
    try {
      // 1. Create Case
      const caseRes = await fetch('/api/cases', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (!caseRes.ok) throw new Error('Failed to create case');
      const caseJson = await caseRes.json();
      
      // 2. Trigger Run
      const runRes = await fetch(`/api/cases/${caseJson.id}/run`, {
        method: 'POST'
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
    <div className="max-w-2xl mx-auto space-y-8 py-10">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">New Profit Audit</h1>
        <p className="text-muted-foreground">We'll benchmark your business against 6-10 local competitors.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid gap-4 bg-white p-6 rounded-lg border shadow-sm">
          <h2 className="font-semibold text-lg">Business Vitals</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Website URL</label>
              <input {...register('website_url')} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background" placeholder="https://example.com" />
              {errors.website_url && <span className="text-xs text-red-500">{errors.website_url.message}</span>}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">What do you sell?</label>
              <input {...register('what_they_sell')} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="e.g. Plumbing, HVAC, Dental" />
              {errors.what_they_sell && <span className="text-xs text-red-500">{errors.what_they_sell.message}</span>}
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">City</label>
              <input {...register('city')} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Austin" />
              {errors.city && <span className="text-xs text-red-500">{errors.city.message}</span>}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">State/Province</label>
              <input {...register('state_province')} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="TX" />
              {errors.state_province && <span className="text-xs text-red-500">{errors.state_province.message}</span>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Avg Jobs / Month</label>
              <div className="flex gap-2 items-center">
                <input type="number" {...register('jobs_min', {valueAsNumber: true})} className="flex h-10 w-full rounded-md border px-3 text-sm" placeholder="Min" />
                <span>-</span>
                <input type="number" {...register('jobs_max', {valueAsNumber: true})} className="flex h-10 w-full rounded-md border px-3 text-sm" placeholder="Max" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Avg Ticket ($)</label>
              <div className="flex gap-2 items-center">
                <input type="number" {...register('ticket_min', {valueAsNumber: true})} className="flex h-10 w-full rounded-md border px-3 text-sm" placeholder="Min" />
                <span>-</span>
                <input type="number" {...register('ticket_max', {valueAsNumber: true})} className="flex h-10 w-full rounded-md border px-3 text-sm" placeholder="Max" />
              </div>
            </div>
          </div>
          
           <div className="space-y-2">
              <label className="text-sm font-medium">Current Availability</label>
              <select {...register('availability')} className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm">
                <option>Same Day</option>
                <option>Next Day</option>
                <option>2-3 Days</option>
                <option>1 Week+</option>
              </select>
            </div>
        </div>

        {/* Pro Inputs Accordion */}
        <div className="border rounded-lg bg-white overflow-hidden">
          <button 
            type="button"
            onClick={() => setShowPro(!showPro)}
            className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 transition-colors text-sm font-medium"
          >
            <span>Pro Inputs (Optional)</span>
            {showPro ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          
          {showPro && (
            <div className="p-6 grid gap-4 border-t">
               <div className="space-y-2">
                  <label className="text-sm font-medium">Diagnostic / Trip Fee ($)</label>
                  <input {...register('trip_fee')} className="flex h-10 w-full rounded-md border px-3 text-sm" placeholder="e.g. 89" />
               </div>
               <div className="flex items-center gap-2">
                  <input type="checkbox" {...register('has_membership')} className="h-4 w-4 rounded border-gray-300" />
                  <label className="text-sm">We offer a membership/club</label>
               </div>
               <div className="flex items-center gap-2">
                  <input type="checkbox" {...register('has_priority')} className="h-4 w-4 rounded border-gray-300" />
                  <label className="text-sm">We offer priority / after-hours service</label>
               </div>
            </div>
          )}
        </div>

        {error && <div className="p-3 text-sm text-red-600 bg-red-50 rounded">{error}</div>}

        <button 
          disabled={isSubmitting}
          type="submit" 
          className="w-full h-12 bg-slate-900 text-white font-medium rounded-lg hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Starting Audit...
            </>
          ) : (
            'Run Audit'
          )}
        </button>
      </form>
    </div>
  );
}