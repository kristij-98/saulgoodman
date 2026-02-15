// app/r/[shareId]/page.tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

type ReportAny = any;

function safeArray<T = any>(v: any): T[] {
  return Array.isArray(v) ? v : [];
}

function safeString(v: any, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function num(v: any): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const x = Number(v.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(x) ? x : null;
  }
  return null;
}

function money(n: number | null): string {
  if (n === null) return "—";
  return `$${Math.round(n).toLocaleString()}`;
}

function moneyRange(lo: number | null, hi: number | null): string {
  if (lo === null && hi === null) return "—";
  if (lo !== null && hi === null) return `${money(lo)}`;
  if (lo === null && hi !== null) return `${money(hi)}`;
  return `${money(lo)}–${money(hi)}`;
}

function badge(conf: string) {
  const c = (conf || "").toUpperCase();
  if (c === "HIGH") return { text: "HIGH", cls: "bg-emerald-100 text-emerald-900 border-emerald-200" };
  if (c === "MED") return { text: "MEDIUM", cls: "bg-amber-100 text-amber-900 border-amber-200" };
  return { text: "LOW", cls: "bg-rose-100 text-rose-900 border-rose-200" };
}

function evidenceTypeLabel(t: string) {
  const x = (t || "").toLowerCase();
  if (x === "pricing") return "Pricing";
  if (x === "service") return "Service";
  if (x === "reputation") return "Reputation";
  if (x === "guarantee") return "Guarantee";
  return "Other";
}

// Honest allocation: split total leak range across top leaks (weighted 45/35/20).
function allocateLeakImpact(perMonthLow: number | null, perMonthHigh: number | null, idx: number) {
  const weights = [0.45, 0.35, 0.20];
  const w = weights[idx] ?? 0.2;
  const lo = perMonthLow === null ? null : perMonthLow * w;
  const hi = perMonthHigh === null ? null : perMonthHigh * w;
  return { lo, hi, w };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

// For “urgency meter” visuals (no charts needed)
function leakSeverity(perMonthHigh: number | null): { label: string; tone: "low" | "med" | "high"; pct: number } {
  if (perMonthHigh === null) return { label: "Unknown", tone: "med", pct: 55 };
  // Tune these thresholds per niche later
  if (perMonthHigh < 750) return { label: "Manageable", tone: "low", pct: 35 };
  if (perMonthHigh < 2500) return { label: "Serious", tone: "med", pct: 65 };
  return { label: "Critical", tone: "high", pct: 88 };
}

function toneStyles(tone: "low" | "med" | "high") {
  if (tone === "low")
    return {
      chip: "bg-emerald-100 text-emerald-900 border-emerald-200",
      bar: "bg-emerald-500",
      ring: "ring-emerald-200",
      panel: "from-emerald-50 via-white to-white",
    };
  if (tone === "med")
    return {
      chip: "bg-amber-100 text-amber-900 border-amber-200",
      bar: "bg-amber-500",
      ring: "ring-amber-200",
      panel: "from-amber-50 via-white to-white",
    };
  return {
    chip: "bg-rose-100 text-rose-900 border-rose-200",
    bar: "bg-rose-500",
    ring: "ring-rose-200",
    panel: "from-rose-50 via-white to-white",
  };
}

function pickTopActions(report: ReportAny): string[] {
  const next = safeArray<string>(report?.next_7_days).filter(Boolean);
  if (next.length) return next.slice(0, 5);

  const offers = safeArray(report?.offer_rebuild)
    .map((o: any) => safeString(o?.title).trim())
    .filter(Boolean);
  if (offers.length) return offers.slice(0, 5).map((t) => `Launch: ${t}`);

  return [
    "Set a standard dispatch / trip fee (and waive it for members).",
    "Add a simple membership plan to lock recurring revenue.",
    "Publish a clear pricing corridor so buyers trust you faster.",
  ];
}

export default async function ReportPage({ params }: { params: { shareId: string } }) {
  const shareId = params.shareId;

  const reportRow = await prisma.report.findUnique({
    where: { shareId },
    include: { case: true },
  });

  if (!reportRow) return notFound();

  const data = (reportRow.content ?? {}) as ReportAny;

  const meta = data?.meta ?? {};
  const confidence = safeString(meta?.confidence, "LOW") as "HIGH" | "MED" | "LOW";
  const confBadge = badge(confidence);

  const quickVerdict = safeString(data?.quick_verdict, "");
  const marketPosition = safeString(data?.market_position, "");

  const topLeaks = safeArray(data?.top_leaks_ranked);
  const offers = safeArray(data?.offer_rebuild);

  const competitors = safeArray(data?.competitors);
  const evidence = safeArray(data?.evidence_drawer);

  const actions = pickTopActions(data);
  const do72 = actions.slice(0, 3);

  // Robust leak lookup
  const leakCandidates = [
    data?.benchmark_data?.leaks,
    data?.benchmark_data?.delta?.leaks,
    data?.delta?.leaks,
    data?.benchmark_data?.leak_estimate,
    data?.delta?.leak_estimate,
  ].filter(Boolean);

  function pickLeakNumber(keys: string[]): number | null {
    for (const obj of leakCandidates) {
      for (const k of keys) {
        const v = (obj as any)?.[k];
        const n = num(v);
        if (n !== null) return n;
      }
    }
    return null;
  }

  const perMonthLow = pickLeakNumber(["per_month_low", "monthly_low", "month_low", "leak_month_low"]);
  const perMonthHigh = pickLeakNumber(["per_month_high", "monthly_high", "month_high", "leak_month_high"]);
  const perYearLow = pickLeakNumber(["per_year_low", "yearly_low", "year_low", "leak_year_low"]);
  const perYearHigh = pickLeakNumber(["per_year_high", "yearly_high", "year_high", "leak_year_high"]);

  const perMonthFallback = perMonthLow ?? perMonthHigh;
  const finalPerMonthLow = perMonthLow ?? perMonthFallback;
  const finalPerMonthHigh = perMonthHigh ?? perMonthFallback;

  const perYearFallback = perYearLow ?? perYearHigh;
  const finalPerYearLow =
    perYearLow ?? perYearFallback ?? (finalPerMonthLow !== null ? finalPerMonthLow * 12 : null);

  const finalPerYearHigh =
    perYearHigh ?? perYearFallback ?? (finalPerMonthHigh !== null ? finalPerMonthHigh * 12 : null);

  const perWeekLow = finalPerMonthLow === null ? null : finalPerMonthLow / 4;
  const perWeekHigh = finalPerMonthHigh === null ? null : finalPerMonthHigh / 4;

  const perDayLow = finalPerMonthLow === null ? null : finalPerMonthLow / 30;
  const perDayHigh = finalPerMonthHigh === null ? null : finalPerMonthHigh / 30;

  // Severity visuals
  const sev = leakSeverity(finalPerMonthHigh);
  const tone = toneStyles(sev.tone);
  const pct = clamp(sev.pct, 8, 96);

  // Trust line
  const proofLine = `Built from ${competitors.length || "—"} competitors and ${evidence.length || "—"} proof snippets.`;

  // Diagnosis line (simple business language)
  const diagnosisLine =
    marketPosition
      ? `Right now you’re positioned as: ${marketPosition}. That typically forces you to win on price and caps your ticket.`
      : `This market has levers (fees, memberships, warranties) that increase profit per customer.`;

  // Competitor snapshot rows
  const competitorRows = competitors.slice(0, 10).map((c: any) => {
    const name = safeString(c?.name, "Unknown");
    const url = safeString(c?.url, "");
    const tripFee = c?.trip_fee ?? null;
    const membership = c?.membership_offer ?? null;
    const warranty = c?.warranty_offer ?? null;
    return { name, url, tripFee, membership, warranty };
  });

  // “Worth it” framing: what they can recapture (conservative)
  const recaptureLow = finalPerMonthLow === null ? null : finalPerMonthLow * 0.35;
  const recaptureHigh = finalPerMonthHigh === null ? null : finalPerMonthHigh * 0.6;

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <div className="border-b bg-white">
        <div className="mx-auto max-w-6xl px-6 py-6 flex items-start justify-between gap-6">
          <div>
            <div className="text-xs text-zinc-500">Profit Leak Attorney (Beta)</div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">Audit Report</h1>
            <div className="mt-1 text-sm text-zinc-600">
              For <span className="font-medium text-zinc-800">{reportRow.case.websiteUrl}</span>
              <span className="mx-2 text-zinc-300">•</span>
              {reportRow.case.location}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className={`px-3 py-2 rounded-lg border text-sm font-semibold ${confBadge.cls}`}>
              Confidence: {confBadge.text}
            </div>
            <Link
              href="/new"
              className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              Run Another Audit
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-8 space-y-8">
        {/* HERO — MONEY ALERT */}
        <div className={`rounded-3xl border bg-gradient-to-br ${tone.panel} p-6 md:p-8 ring-1 ${tone.ring}`}>
          <div className="grid gap-6 lg:grid-cols-12">
            {/* Left: the punch */}
            <div className="lg:col-span-8">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1 text-xs font-semibold text-zinc-800">
                  <span className="inline-block h-2 w-2 rounded-full bg-zinc-900" />
                  Executive Summary
                </span>
                <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${tone.chip}`}>
                  Severity: {sev.label}
                </span>
                <span className="text-xs text-zinc-500">{proofLine}</span>
              </div>

              <div className="mt-5">
                <div className="text-sm font-semibold text-zinc-700">Your profit leak estimate</div>

                <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2">
                  <div className="text-4xl md:text-5xl font-semibold tracking-tight text-zinc-950">
                    {moneyRange(finalPerMonthLow, finalPerMonthHigh)}
                    <span className="ml-2 text-base md:text-lg font-semibold text-zinc-600">/ month</span>
                  </div>

                  <div className="rounded-2xl border bg-white/70 px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Yearly bleed</div>
                    <div className="mt-1 text-lg font-semibold text-zinc-950">
                      {moneyRange(finalPerYearLow, finalPerYearHigh)}
                    </div>
                  </div>
                </div>

                {/* urgency meter */}
                <div className="mt-5">
                  <div className="flex items-center justify-between text-xs text-zinc-600">
                    <span className="font-semibold">Leak urgency meter</span>
                    <span>Fixing this is a pricing + offer structure change — not “more marketing”.</span>
                  </div>
                  <div className="mt-2 h-3 w-full rounded-full bg-white/70 border overflow-hidden">
                    <div className={`h-full ${tone.bar}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-2 text-sm text-zinc-800">
                    Every day you wait costs about{" "}
                    <span className="font-semibold">{moneyRange(perDayLow, perDayHigh)}</span>.
                    <span className="text-zinc-600"> (Your competitors are not standing still.)</span>
                  </div>
                </div>

                {/* simple meaning */}
                <div className="mt-6 grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border bg-white p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">What this means</div>
                    <div className="mt-2 text-sm leading-relaxed text-zinc-800">{diagnosisLine}</div>
                  </div>

                  <div className="rounded-2xl border bg-white p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Cost of delay</div>
                    <div className="mt-2 text-sm text-zinc-800">
                      Each week costs ~{" "}
                      <span className="font-semibold">{moneyRange(perWeekLow, perWeekHigh)}</span>.
                    </div>
                    <div className="mt-2 text-xs text-zinc-500">
                      This is an estimate from your leak range. Use it for prioritization, not accounting.
                    </div>
                  </div>

                  <div className="rounded-2xl border bg-white p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">You can recapture</div>
                    <div className="mt-2 text-sm text-zinc-800">
                      A realistic first step is{" "}
                      <span className="font-semibold">{moneyRange(recaptureLow, recaptureHigh)}</span>
                      <span className="text-zinc-600"> / month</span>
                    </div>
                    <div className="mt-2 text-xs text-zinc-500">
                      Conservative estimate based on the highest-leverage market levers below.
                    </div>
                  </div>
                </div>
              </div>

              {/* Verdict (short + punchy) */}
              {quickVerdict ? (
                <div className="mt-6 rounded-2xl border bg-white p-5">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Verdict</div>
                  <div className="mt-2 text-sm leading-relaxed text-zinc-900">{quickVerdict}</div>
                </div>
              ) : null}
            </div>

            {/* Right: 72h action card (black) */}
            <div className="lg:col-span-4">
              <div className="rounded-3xl bg-zinc-950 p-6 text-white shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-300">
                  Do this in the next 72 hours
                </div>
                <div className="mt-2 text-lg font-semibold">Fast wins first (highest leverage)</div>

                <ol className="mt-4 space-y-3 list-decimal pl-5 text-sm text-zinc-100">
                  {do72.map((x, i) => (
                    <li key={i} className="leading-relaxed">{x}</li>
                  ))}
                </ol>

                <div className="mt-5 rounded-2xl bg-white/10 p-4">
                  <div className="text-xs font-semibold text-zinc-200">One-move rule</div>
                  <div className="mt-1 text-sm text-zinc-100">
                    If you only do ONE thing this week: implement #1.
                    It changes what customers expect to pay.
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between text-xs text-zinc-400">
                  <span>Confidence: {confBadge.text}</span>
                  <span>Evidence-backed</span>
                </div>
              </div>

              {/* Micro trust cue */}
              <div className="mt-4 rounded-2xl border bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Why you can trust this</div>
                <div className="mt-2 text-sm text-zinc-800">
                  We cite competitor proof snippets (pricing, fees, memberships, warranties) so this doesn’t rely on opinion.
                </div>
                <div className="mt-2 text-xs text-zinc-500">
                  Open the Proof Locker below if you want to verify.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* TOP LEAKS — make them feel like “priority cases” */}
        <div className="rounded-3xl border bg-white p-6 md:p-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Priority breakdown</div>
              <h2 className="mt-2 text-xl md:text-2xl font-semibold tracking-tight text-zinc-900">
                Where your profit is bleeding (ranked)
              </h2>
              <div className="mt-2 text-sm text-zinc-600">
                These are the 3 highest-leverage gaps vs competitors in your area. Fix them in order.
              </div>
            </div>
          </div>

          {topLeaks.length ? (
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {topLeaks.slice(0, 3).map((l: any, idx: number) => {
                const impact = allocateLeakImpact(finalPerMonthLow, finalPerMonthHigh, idx);
                const chipTone =
                  idx === 0
                    ? "bg-zinc-900 text-white border-zinc-900"
                    : idx === 1
                    ? "bg-zinc-100 text-zinc-900 border-zinc-200"
                    : "bg-white text-zinc-900 border-zinc-200";

                return (
                  <div key={idx} className="rounded-2xl border bg-zinc-50 p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${chipTone}`}>
                        Leak #{idx + 1}
                      </div>
                      <div className="rounded-full border bg-white px-3 py-1 text-xs font-semibold text-zinc-900">
                        Est. impact: {moneyRange(impact.lo, impact.hi)}/mo
                      </div>
                    </div>

                    <div className="mt-3 text-lg font-semibold text-zinc-900">
                      {safeString(l?.title, "Untitled leak")}
                    </div>

                    <div className="mt-3 text-sm text-zinc-700">
                      <span className="font-semibold">Why it matters:</span>{" "}
                      {safeString(l?.why_it_matters, "—")}
                    </div>

                    <div className="mt-3 text-sm text-zinc-700">
                      <span className="font-semibold">Proof from market:</span>{" "}
                      {safeString(l?.market_contrast, "—")}
                    </div>

                    <div className="mt-4 text-xs text-zinc-500">
                      Allocation estimate: {Math.round(impact.w * 100)}% of leak range for prioritization.
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-4 text-sm text-zinc-600">No “top leaks” were generated for this run.</div>
          )}
        </div>

        {/* OFFER REBUILD — framed as “plug the holes” */}
        <div className="rounded-3xl border bg-white p-6 md:p-8">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Offer rebuild</div>
          <h2 className="mt-2 text-xl md:text-2xl font-semibold tracking-tight text-zinc-900">
            What to add to your offer (to stop the leak)
          </h2>
          <div className="mt-2 text-sm text-zinc-600">
            These are the simplest “market levers” that competitors use to justify higher prices and repeat business.
          </div>

          {offers.length ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {offers.slice(0, 4).map((o: any, i: number) => (
                <div key={i} className="rounded-2xl border bg-zinc-50 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-base font-semibold text-zinc-900">{safeString(o?.title, "Untitled")}</div>
                    <span className="rounded-full border bg-white px-3 py-1 text-xs font-semibold text-zinc-900">
                      Plug #{i + 1}
                    </span>
                  </div>
                  <div className="mt-3 text-sm leading-relaxed text-zinc-700">{safeString(o?.content, "")}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 text-sm text-zinc-600">No offer rebuild items were generated.</div>
          )}
        </div>

        {/* COMPETITOR SNAPSHOT — keep but make more readable */}
        <div className="rounded-3xl border bg-white p-6 md:p-8">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Competitor snapshot</div>
          <h2 className="mt-2 text-xl md:text-2xl font-semibold tracking-tight text-zinc-900">
            What competitors offer (simple view)
          </h2>
          <div className="mt-2 text-sm text-zinc-600">
            This is the quick comparison. The raw proof is in the Proof Locker below.
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border">
            <div className="grid grid-cols-12 bg-zinc-100 px-4 py-3 text-xs font-semibold text-zinc-600">
              <div className="col-span-4">Competitor</div>
              <div className="col-span-2">Trip fee</div>
              <div className="col-span-3">Membership</div>
              <div className="col-span-3">Warranty</div>
            </div>

            {competitorRows.length ? (
              competitorRows.map((r, i) => (
                <div key={i} className="grid grid-cols-12 px-4 py-3 text-sm border-t bg-white">
                  <div className="col-span-4">
                    <div className="font-semibold text-zinc-900">{r.name}</div>
                    {r.url ? (
                      <a className="text-xs text-zinc-500 hover:underline" href={r.url} target="_blank" rel="noreferrer">
                        {r.url.replace(/^https?:\/\//, "")}
                      </a>
                    ) : null}
                  </div>
                  <div className="col-span-2 text-zinc-800">{r.tripFee ? safeString(r.tripFee) : "—"}</div>
                  <div className="col-span-3 text-zinc-800">{r.membership ? safeString(r.membership) : "—"}</div>
                  <div className="col-span-3 text-zinc-800">{r.warranty ? safeString(r.warranty) : "—"}</div>
                </div>
              ))
            ) : (
              <div className="px-4 py-4 text-sm text-zinc-600">No competitors were extracted for this run.</div>
            )}
          </div>
        </div>

        {/* PROOF LOCKER — keep “optional”, but make it feel like “evidence file” */}
        <div className="rounded-3xl border bg-white p-6 md:p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Proof locker</div>
              <h2 className="mt-2 text-xl md:text-2xl font-semibold tracking-tight text-zinc-900">
                Evidence (optional — open if you want to verify)
              </h2>
              <div className="mt-2 text-sm text-zinc-600">
                We pulled this directly from competitor sites. You can forward it to a partner or manager.
              </div>
            </div>
            <div className="hidden md:flex items-center gap-2">
              <span className="rounded-full border bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-900">
                Snippets: {evidence.length}
              </span>
              <span className="rounded-full border bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-900">
                Competitors: {competitors.length}
              </span>
            </div>
          </div>

          <details className="mt-6 rounded-2xl border bg-zinc-50 p-5">
            <summary className="cursor-pointer text-sm font-semibold text-zinc-900">
              Open proof locker ({evidence.length})
            </summary>

            <div className="mt-4 space-y-2">
              {evidence.length ? (
                evidence.map((e: any, idx: number) => (
                  <details key={idx} className="rounded-xl border bg-white p-4">
                    <summary className="cursor-pointer flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-zinc-500">
                          {evidenceTypeLabel(safeString(e?.type))} •{" "}
                          <span className="font-normal">
                            {safeString(e?.source_url, "").replace(/^https?:\/\//, "").slice(0, 70)}
                            {safeString(e?.source_url, "").length > 70 ? "…" : ""}
                          </span>
                        </div>
                        <div className="mt-1 text-sm text-zinc-900 truncate">
                          {safeString(e?.snippet, "—").replace(/\s+/g, " ").slice(0, 140)}
                          {safeString(e?.snippet, "").length > 140 ? "…" : ""}
                        </div>
                      </div>
                      <span className="text-xs text-zinc-500">Expand</span>
                    </summary>

                    <div className="mt-3 text-sm leading-relaxed text-zinc-800 whitespace-pre-wrap">
                      {safeString(e?.snippet, "—")}
                    </div>

                    {e?.source_url ? (
                      <a
                        href={safeString(e?.source_url)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-block text-sm font-semibold text-zinc-900 hover:underline"
                      >
                        Open source →
                      </a>
                    ) : null}
                  </details>
                ))
              ) : (
                <div className="text-sm text-zinc-600">No evidence was extracted for this run.</div>
              )}
            </div>
          </details>
        </div>

        {/* NEXT 7 DAYS — becomes the “execution card” */}
        <div className="rounded-3xl border bg-zinc-950 p-6 md:p-8 text-white">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-300">Next 7 days plan</div>
              <h2 className="mt-2 text-xl md:text-2xl font-semibold tracking-tight">
                Make the leak stop
              </h2>
              <div className="mt-2 text-sm text-zinc-300">
                Execute in order. Don’t overthink it — fix the market levers first.
              </div>
            </div>

            <div className="rounded-2xl bg-white/10 px-4 py-3">
              <div className="text-xs font-semibold text-zinc-200">Estimated weekly bleed</div>
              <div className="mt-1 text-lg font-semibold text-white">{moneyRange(perWeekLow, perWeekHigh)}</div>
            </div>
          </div>

          <ol className="mt-6 space-y-3 list-decimal pl-5 text-sm text-zinc-100">
            {safeArray<string>(data?.next_7_days).slice(0, 7).map((x, i) => (
              <li key={i} className="leading-relaxed">{x}</li>
            ))}
          </ol>

          {!safeArray<string>(data?.next_7_days).length ? (
            <div className="mt-3 text-sm text-zinc-300">No plan was generated for this run.</div>
          ) : null}

          <div className="mt-6 text-xs text-zinc-400">
            This plan is derived from competitor pricing/offer patterns and your current positioning.
          </div>
        </div>
      </div>
    </div>
  );
}
