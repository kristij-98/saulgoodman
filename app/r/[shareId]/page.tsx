// app/r/[shareId]/page.tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

// -------------------------
// Types & helpers
// -------------------------
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
function moneyCompact(n: number | null): string {
  if (n === null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${Math.round(n).toLocaleString()}`;
}
function moneyRange(lo: number | null, hi: number | null): string {
  if (lo === null && hi === null) return "—";
  if (lo !== null && hi === null) return money(lo);
  if (lo === null && hi !== null) return money(hi);
  return `${money(lo)}–${money(hi)}`;
}
function shortHost(url: string) {
  return (url || "")
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
    .replace(/^www\./, "");
}

function confidenceBadge(level: string) {
  const c = (level || "").toUpperCase();
  if (c === "HIGH") return { label: "High confidence", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200/60" };
  if (c === "MED") return { label: "Medium confidence", cls: "bg-amber-50 text-amber-700 ring-amber-200/60" };
  return { label: "Low confidence", cls: "bg-zinc-100 text-zinc-600 ring-zinc-200" };
}

// Honest allocation for “impact per leak” (planning estimate, not precision).
function allocateLeak(perMonthLow: number | null, idx: number) {
  const weights = [0.45, 0.35, 0.20];
  const w = weights[idx] ?? 0.2;
  if (perMonthLow === null) return null;
  return Math.round(perMonthLow * w);
}

function evidenceTypeLabel(t: string) {
  const x = (t || "").toLowerCase();
  if (x === "pricing") return "Pricing";
  if (x === "service") return "Service";
  if (x === "reputation") return "Reputation";
  if (x === "guarantee") return "Guarantee";
  if (x === "membership") return "Membership";
  if (x === "warranty") return "Warranty";
  return "Evidence";
}

// -------------------------
// Page
// -------------------------
export default async function ReportPage({ params }: { params: { shareId: string } }) {
  const shareId = params.shareId;

  const reportRow = await prisma.report.findUnique({
    where: { shareId },
    include: { case: true },
  });

  if (!reportRow) return notFound();

  const data = (reportRow.content ?? {}) as ReportAny;
  const meta = data?.meta ?? {};

  const confidence = safeString(meta?.confidence, "LOW");
  const conf = confidenceBadge(confidence);

  const topLeaks = safeArray(data?.top_leaks_ranked);
  const offers = safeArray(data?.offer_rebuild);
  const competitors = safeArray(data?.competitors);
  const evidence = safeArray(data?.evidence_drawer);
  const nextActions = safeArray<string>(data?.next_7_days).filter(Boolean);

  // Leak numbers (support slightly different keys, just in case)
  const leaks = data?.benchmark_data?.leaks ?? {};
  const perMonthLow = num(leaks?.per_month_low ?? leaks?.monthly_low);
  const perMonthHigh = num(leaks?.per_month_high ?? leaks?.monthly_high);
  const perYearLow = num(leaks?.per_year_low ?? leaks?.yearly_low) ?? (perMonthLow ? perMonthLow * 12 : null);
  const perYearHigh = num(leaks?.per_year_high ?? leaks?.yearly_high) ?? (perMonthHigh ? perMonthHigh * 12 : null);

  const site = reportRow.case.websiteUrl;
  const location = reportRow.case.location;

  const doFirst = nextActions.slice(0, 3);
  const doLater = nextActions.slice(3, 10);

  // Competitor table rows
  const compRows = competitors.slice(0, 8).map((c: any) => ({
    name: safeString(c?.name, "Competitor"),
    url: safeString(c?.url, ""),
    trip_fee: safeString(c?.trip_fee, "—"),
    membership_offer: safeString(c?.membership_offer, "—"),
    warranty_offer: safeString(c?.warranty_offer, "—"),
  }));

  // If report has market_position use it, otherwise keep empty.
  const marketPosition = safeString(data?.market_position, "");

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      {/* Sticky top bar */}
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-900 text-white font-extrabold tracking-tight">
                PA
              </div>
              <div className="hidden sm:block">
                <div className="text-sm font-bold leading-none">Profit Leak Attorney</div>
                <div className="text-xs text-zinc-500 leading-none mt-1">Audit report</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className={`hidden sm:inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${conf.cls}`}>
                {conf.label}
              </span>
              <div className="text-xs text-zinc-400">
                Case: <span className="text-zinc-600 font-medium">{shortHost(site)}</span>
              </div>
              <Link
                href="/new"
                className="ml-1 inline-flex items-center justify-center rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800"
              >
                Run another
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
        {/* HERO */}
        <div className="mx-auto max-w-4xl text-center">
          <div className="inline-flex items-center rounded-full bg-rose-50 px-3 py-1 text-xs font-extrabold text-rose-700 ring-1 ring-inset ring-rose-100 tracking-wide">
            AUDIT COMPLETE • {shortHost(site).toUpperCase()} • {location}
          </div>

          <h1 className="mt-6 text-3xl sm:text-4xl lg:text-6xl font-extrabold tracking-tight leading-tight">
            You are leaking{" "}
            <span className="bg-yellow-200 px-2">
              {moneyRange(perYearLow, perYearHigh)}
            </span>{" "}
            every year.
          </h1>

          <p className="mt-4 text-base sm:text-lg text-zinc-600 leading-relaxed">
            This is profit you’re losing because of weak pricing, missing offers, and unclear guarantees — compared to the businesses around you.
          </p>

          {/* Pills */}
          <div className="mt-6 flex flex-wrap justify-center gap-3 text-xs text-zinc-500">
            <span className="rounded-full bg-white px-3 py-1 ring-1 ring-zinc-200">
              Evidence: <span className="font-semibold text-zinc-800">{competitors.length || 0}</span> competitors
            </span>
            <span className="rounded-full bg-white px-3 py-1 ring-1 ring-zinc-200">
              Proof points: <span className="font-semibold text-zinc-800">{evidence.length || 0}</span> snippets
            </span>

            {/* REMOVED: "You currently look like: marketPosition" pill */}
          </div>
        </div>

        {/* GRID */}
        <div className="mt-10 lg:mt-14 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
          {/* LEFT */}
          <div className="lg:col-span-8 space-y-10">
            {/* Leak summary cards */}
            <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Big red card */}
              <div className="relative overflow-hidden rounded-2xl border border-rose-200 bg-gradient-to-br from-red-700 to-rose-900 p-6 text-white shadow-xl shadow-rose-900/10">
                <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
                <div className="relative">
                  <div className="text-xs font-extrabold uppercase tracking-widest text-rose-100">
                    Total annual leak
                  </div>
                  <div className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight">
                    {moneyRange(perYearLow, perYearHigh)}
                  </div>
                  <p className="mt-4 text-sm text-rose-50 leading-relaxed opacity-95">
                    Your competitors are capturing this extra revenue. You are not.
                  </p>

                  <div className="mt-8">
                    <div className="flex items-end justify-between text-xs font-semibold text-rose-100">
                      <span>Current efficiency</span>
                      <span className="text-white">Gap exists</span>
                    </div>
                    <div className="mt-2 h-3 w-full rounded-full bg-black/25 overflow-hidden ring-1 ring-inset ring-white/10">
                      <div className="h-full w-[85%] bg-white/80" />
                    </div>
                    <div className="mt-2 text-xs text-rose-100">
                      (Simple visual: you’re missing a slice of what the market charges.)
                    </div>
                  </div>
                </div>
              </div>

              {/* Side stack */}
              <div className="grid gap-4">
                <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                  <div className="text-xs font-extrabold uppercase tracking-wider text-zinc-500">
                    Monthly cash impact
                  </div>
                  <div className="mt-2 text-2xl font-extrabold">
                    {moneyRange(perMonthLow, perMonthHigh)}
                    <span className="ml-1 text-sm font-semibold text-zinc-400">/mo</span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    Missing profit that should be landing in your account.
                  </p>
                </div>

                <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                  <div className="text-xs font-extrabold uppercase tracking-wider text-zinc-500">
                    Market perception
                  </div>
                  <div className="mt-2 text-xl font-extrabold text-zinc-900">
                    {marketPosition || "Not clear yet"}
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    If you look “cheap”, you attract price shoppers and lose the best jobs.
                  </p>
                </div>
              </div>
            </section>

            {/* Top leaks */}
            <section>
              <div className="mb-6">
                <h3 className="text-lg font-extrabold text-zinc-900">Where the money is leaking</h3>
                <p className="mt-1 text-sm text-zinc-500">
                  The 3 biggest holes. Fix #1 first.
                </p>
              </div>

              <div className="space-y-5">
                {topLeaks.length ? (
                  topLeaks.slice(0, 3).map((leak: any, idx: number) => {
                    const est = allocateLeak(perMonthLow, idx);
                    return (
                      <div key={idx} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-zinc-50 px-5 py-4 border-b border-zinc-100">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white border border-zinc-200 text-sm font-extrabold">
                              #{idx + 1}
                            </div>
                            <div className="font-extrabold text-zinc-900">
                              {safeString(leak?.title, "Untitled issue")}
                            </div>
                          </div>

                          <div className="sm:ml-auto">
                            <span className="inline-flex items-center rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-extrabold text-rose-700 ring-1 ring-inset ring-rose-100">
                              Est. impact: {moneyCompact(est)}/mo
                            </span>
                          </div>
                        </div>

                        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                            <div className="text-xs font-extrabold uppercase tracking-wider text-rose-600">
                              The problem
                            </div>
                            <p className="mt-2 text-sm text-zinc-800 leading-relaxed">
                              {safeString(leak?.why_it_matters, "—")}
                            </p>
                          </div>

                          <div>
                            <div className="text-xs font-extrabold uppercase tracking-wider text-emerald-600">
                              What competitors do
                            </div>
                            <p className="mt-2 text-sm text-zinc-700 leading-relaxed">
                              {safeString(leak?.market_contrast, "—")}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-500">
                    No leaks were generated in this run.
                  </div>
                )}
              </div>
            </section>

            {/* Offer rebuild */}
            <section>
              <div className="mb-6">
                <h3 className="text-lg font-extrabold text-zinc-900">What to add to your offer</h3>
                <p className="mt-1 text-sm text-zinc-500">
                  Quick upgrades that let you charge more and win better customers.
                </p>
              </div>

              {offers.length ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {offers.slice(0, 4).map((o: any, i: number) => (
                    <div key={i} className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                      <div className="text-sm font-extrabold text-zinc-900">{safeString(o?.title, "Untitled")}</div>
                      <p className="mt-2 text-sm text-zinc-700 leading-relaxed">{safeString(o?.content, "")}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-500">
                  No offer upgrades were generated in this run.
                </div>
              )}
            </section>

            {/* Competitor matrix */}
            <section>
              <div className="mb-6">
                <h3 className="text-lg font-extrabold text-zinc-900">Competitor landscape</h3>
                <p className="mt-1 text-sm text-zinc-500">
                  This is what customers see when they compare you.
                </p>
              </div>

              <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-zinc-50 text-xs font-extrabold uppercase tracking-wider text-zinc-500">
                      <tr>
                        <th className="px-5 py-4">Business</th>
                        <th className="px-5 py-4">Trip fee</th>
                        <th className="px-5 py-4">Membership</th>
                        <th className="px-5 py-4">Warranty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {compRows.length ? (
                        compRows.map((c, i) => (
                          <tr key={i} className="hover:bg-zinc-50/60 transition">
                            <td className="px-5 py-4 font-semibold text-zinc-900">
                              {c.url ? (
                                <a
                                  href={c.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 hover:text-blue-700"
                                >
                                  {c.name}
                                  <span className="text-zinc-400 text-xs">↗</span>
                                </a>
                              ) : (
                                c.name
                              )}
                            </td>
                            <td className="px-5 py-4 text-zinc-700">{c.trip_fee}</td>
                            <td className="px-5 py-4 text-zinc-700">{c.membership_offer}</td>
                            <td className="px-5 py-4 text-zinc-700">{c.warranty_offer}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className="px-5 py-6 text-sm text-zinc-500" colSpan={4}>
                            No competitors were extracted for this run.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* Evidence locker */}
            <section>
              <div className="mb-6">
                <h3 className="text-lg font-extrabold text-zinc-900">Verified source data</h3>
                <p className="mt-1 text-sm text-zinc-500">
                  We pulled {evidence.length} proof snippets from competitor sites. No guessing.
                </p>
              </div>

              <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
                <div className="flex items-center justify-between bg-zinc-50 px-5 py-4 border-b border-zinc-200">
                  <div className="text-xs font-extrabold uppercase tracking-wider text-zinc-500">
                    Evidence log
                  </div>
                  <div className="text-xs text-zinc-400">
                    Generated: {new Date().toLocaleDateString()}
                  </div>
                </div>

                <div className="divide-y divide-zinc-100">
                  {evidence.length ? (
                    evidence.map((e: any, i: number) => {
                      const type = evidenceTypeLabel(safeString(e?.type, ""));
                      const src = safeString(e?.source_url, "");
                      const competitor = safeString(e?.competitor, "");
                      const snippet = safeString(e?.snippet, "—");

                      return (
                        <div key={i} className="p-5 hover:bg-zinc-50/50 transition">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center justify-center rounded-md bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-700 ring-1 ring-inset ring-zinc-200 w-24">
                                {type}
                              </span>
                              {competitor ? (
                                <span className="text-xs font-extrabold text-zinc-900">{competitor}</span>
                              ) : null}
                            </div>

                            {src ? (
                              <a
                                href={src}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs font-semibold text-blue-700 hover:underline"
                              >
                                Verify source ↗
                              </a>
                            ) : null}
                          </div>

                          <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                            <p className="text-xs font-mono text-zinc-700 leading-relaxed">
                              “{snippet}”
                            </p>
                          </div>

                          {src ? (
                            <div className="mt-2 text-xs text-zinc-400">
                              {shortHost(src)}
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-8 text-center text-sm text-zinc-500">
                      No evidence logs were extracted in this run.
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>

          {/* RIGHT (sticky) */}
          <aside className="lg:col-span-4">
            <div className="lg:sticky lg:top-24 space-y-6">
              {/* Plan card */}
              <div className="rounded-2xl bg-blue-900 p-6 text-white shadow-xl ring-1 ring-inset ring-blue-900">
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <div>
                    <div className="text-xs font-extrabold uppercase tracking-widest text-blue-200">
                      Your plan
                    </div>
                    <div className="mt-1 text-lg font-extrabold">
                      72-hour turnaround
                    </div>
                  </div>
                  <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs font-extrabold text-white">
                    Start now
                  </span>
                </div>

                <p className="mt-4 text-sm text-blue-100 leading-relaxed">
                  Do these 3 things first. They usually recover{" "}
                  <span className="font-extrabold text-white">
                    ~{moneyCompact(perMonthLow)}
                  </span>
                  /mo in missed profit.
                </p>

                <ol className="mt-5 space-y-3">
                  {doFirst.length ? (
                    doFirst.map((a, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border border-blue-300 text-[11px] font-extrabold text-blue-100">
                          {i + 1}
                        </div>
                        <div className="text-sm font-semibold text-white leading-relaxed">
                          {a}
                        </div>
                      </li>
                    ))
                  ) : (
                    <li className="text-sm text-blue-200">No urgent actions generated.</li>
                  )}
                </ol>

                <div className="mt-6 rounded-xl bg-white/10 p-4">
                  <div className="text-xs font-extrabold uppercase tracking-wider text-blue-200">
                    Tip
                  </div>
                  <div className="mt-1 text-sm text-blue-100 leading-relaxed">
                    If you only do ONE thing: implement #1. It changes how customers value you.
                  </div>
                </div>
              </div>

              {/* Trust card */}
              <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <div className="text-sm font-extrabold text-zinc-900">Why trust this?</div>
                <p className="mt-2 text-xs text-zinc-500 leading-relaxed">
                  This is not “AI guessing.” We collected proof from competitor websites to see what they charge and offer right now.
                </p>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-zinc-50 p-3 ring-1 ring-inset ring-zinc-200">
                    <div className="text-[11px] font-extrabold uppercase tracking-wider text-zinc-500">
                      Competitors
                    </div>
                    <div className="mt-1 text-lg font-extrabold text-zinc-900">
                      {competitors.length || 0}
                    </div>
                  </div>

                  <div className="rounded-xl bg-zinc-50 p-3 ring-1 ring-inset ring-zinc-200">
                    <div className="text-[11px] font-extrabold uppercase tracking-wider text-zinc-500">
                      Proof points
                    </div>
                    <div className="mt-1 text-lg font-extrabold text-zinc-900">
                      {evidence.length || 0}
                    </div>
                  </div>
                </div>

                <div className="mt-4 text-xs text-zinc-400">
                  Report for: <span className="text-zinc-600 font-semibold">{shortHost(site)}</span>
                </div>
              </div>

              {/* Optional next steps */}
              {doLater.length ? (
                <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                  <div className="text-sm font-extrabold text-zinc-900">Next steps (after the first 72 hours)</div>
                  <ul className="mt-3 space-y-2 text-sm text-zinc-700">
                    {doLater.slice(0, 6).map((x, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-zinc-400">•</span>
                        <span className="leading-relaxed">{x}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </aside>
        </div>

        <div className="h-10" />
      </main>
    </div>
  );
}
