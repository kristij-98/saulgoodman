// app/r/[shareId]/page.tsx
import React from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

import {
  LucideAlertTriangle,
  LucideCheck,
  LucideExternalLink,
  LucideSearch,
  LucideFileText,
  LucideTrendingDown,
  LucideAlertOctagon,
} from "lucide-react";

type ReportAny = any;

// -------------------- Helpers --------------------

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

// Format: $1,200
function money(n: number | null): string {
  if (n === null) return "—";
  return `$${Math.round(n).toLocaleString()}`;
}

// Format: $1.2k (compact)
function moneyCompact(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
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

function normalizeEvidenceType(t: string) {
  const x = (t || "").toLowerCase();
  if (x === "pricing") return "Pricing";
  if (x === "service") return "Service";
  if (x === "reputation") return "Reviews";
  if (x === "guarantee") return "Warranty";
  if (x === "warranty") return "Warranty";
  if (x === "membership") return "Membership";
  return t ? t : "Evidence";
}

function pickTopActions(report: ReportAny): string[] {
  const next = safeArray<string>(report?.next_7_days).filter(Boolean);
  if (next.length) return next;

  const offers = safeArray(report?.offer_rebuild)
    .map((o: any) => safeString(o?.title).trim())
    .filter(Boolean);

  if (offers.length) return offers.map((t) => `Add: ${t}`);

  return [
    "Set a standard trip/dispatch fee (and waive it for members).",
    "Add a membership plan so you get recurring money each month.",
    "Put simple pricing ranges on your website (so people trust you faster).",
  ];
}

function getLeakNumbers(data: ReportAny) {
  // Supports multiple shapes so UI won’t break as you evolve scoring.
  const leakSources = [
    data?.benchmark_data?.leaks,
    data?.benchmark_data?.delta?.leaks,
    data?.delta?.leaks,
    data?.benchmark_data?.leak_estimate,
    data?.delta?.leak_estimate,
    data?.benchmark_data?.upside, // sometimes devs put numbers here; won’t crash
  ].filter(Boolean);

  function pick(keys: string[]) {
    for (const obj of leakSources) {
      for (const k of keys) {
        const n = num((obj as any)?.[k]);
        if (n !== null) return n;
      }
    }
    return null;
  }

  const perMonthLow = pick(["per_month_low", "monthly_low", "month_low"]);
  const perMonthHigh = pick(["per_month_high", "monthly_high", "month_high"]);
  const perYearLow = pick(["per_year_low", "yearly_low", "year_low"]);
  const perYearHigh = pick(["per_year_high", "yearly_high", "year_high"]);

  const finalPerMonthLow = perMonthLow ?? perMonthHigh;
  const finalPerMonthHigh = perMonthHigh ?? perMonthLow;

  const finalPerYearLow = perYearLow ?? (finalPerMonthLow !== null ? finalPerMonthLow * 12 : null);
  const finalPerYearHigh = perYearHigh ?? (finalPerMonthHigh !== null ? finalPerMonthHigh * 12 : null);

  return {
    perMonthLow,
    perMonthHigh,
    perYearLow,
    perYearHigh,
    finalPerMonthLow,
    finalPerMonthHigh,
    finalPerYearLow,
    finalPerYearHigh,
  };
}

// Attempt to display competitor name for evidence entries
function inferEvidenceCompetitorName(e: any, competitors: any[]) {
  // If your backend ever adds competitor, use it
  const direct = safeString(e?.competitor, "");
  if (direct) return direct;

  const url = safeString(e?.source_url, "");
  const host = shortHost(url);
  if (!host) return "Competitor";

  // Match host against competitor url host
  const match = competitors.find((c: any) => {
    const cu = safeString(c?.url, "");
    if (!cu) return false;
    return shortHost(cu) && host.includes(shortHost(cu));
  });

  return safeString(match?.name, host);
}

// -------------------- Components --------------------

function ConfidenceBadge({ level }: { level: string }) {
  const c = (level || "").toUpperCase();
  let colors = "bg-zinc-100 text-zinc-600 ring-zinc-200";
  let label = "Low Confidence";

  if (c === "HIGH") {
    colors = "bg-emerald-50 text-emerald-700 ring-emerald-200/50";
    label = "High Confidence";
  } else if (c === "MED") {
    colors = "bg-amber-50 text-amber-700 ring-amber-200/50";
    label = "Medium Confidence";
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium tracking-wide ring-1 ring-inset ${colors}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        <span
          className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
            c === "HIGH" ? "bg-emerald-500 animate-pulse" : "bg-current"
          }`}
        ></span>
        <span
          className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
            c === "HIGH" ? "bg-emerald-600" : "bg-current"
          }`}
        ></span>
      </span>
      {label}
    </span>
  );
}

function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h3 className="text-lg font-bold text-zinc-900">{title}</h3>
        {subtitle && <p className="text-sm text-zinc-500 max-w-2xl">{subtitle}</p>}
      </div>
      {action && <div className="mt-2 sm:mt-0">{action}</div>}
    </div>
  );
}

function Card({
  children,
  className = "",
  noPad = false,
}: {
  children: React.ReactNode;
  className?: string;
  noPad?: boolean;
}) {
  return (
    <div className={`overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm ${className}`}>
      <div className={noPad ? "" : "p-5 md:p-6"}>{children}</div>
    </div>
  );
}

function ImpactBadge({ value }: { value: string }) {
  return (
    <span className="inline-flex items-center rounded-md bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-100">
      -{value}/mo
    </span>
  );
}

// -------------------- Page --------------------

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

  const topLeaks = safeArray(data?.top_leaks_ranked);
  const offers = safeArray(data?.offer_rebuild);
  const competitors = safeArray(data?.competitors);
  const evidence = safeArray(data?.evidence_drawer);

  const marketPosition = safeString(data?.market_position, "");

  const leakNums = getLeakNumbers(data);

  const nextActionsAll = pickTopActions(data).filter(Boolean);
  const doFirst = nextActionsAll.slice(0, 3);
  const competitorCount = competitors.length;

  // Email button: mailto (no backend needed, no client JS needed)
  const emailSubject = encodeURIComponent("My ProfitAudit Action Plan");
  const emailBody = encodeURIComponent(
    `Here is the 72-hour plan:\n\n${doFirst.map((x, i) => `${i + 1}. ${x}`).join("\n")}\n\nReport link: ${shareId}`
  );
  const mailtoHref = `mailto:?subject=${emailSubject}&body=${emailBody}`;

  // Better default copy if missing
  const websiteUrl = safeString(reportRow.case?.websiteUrl, "your website");
  const location = safeString(reportRow.case?.location, "");

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900">
      {/* Navbar */}
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/90 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-900 text-white font-bold tracking-tighter">
                PA.
              </div>
              <div className="hidden sm:block">
                <h1 className="text-sm font-bold text-zinc-900">ProfitAudit</h1>
                <p className="text-[11px] text-zinc-500 -mt-0.5">High-end offer + pricing audit</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden sm:block">
                <ConfidenceBadge level={confidence} />
              </div>
              <div className="text-xs text-zinc-400">
                Case: {shortHost(websiteUrl)} {location ? `• ${location}` : ""}
              </div>

              <Link
                href="/new"
                className="ml-2 inline-flex items-center justify-center rounded-lg bg-zinc-900 px-3 py-2 text-xs font-bold text-white hover:bg-zinc-800"
              >
                Run Another Audit
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {/* HERO */}
        <div className="mb-14 text-center max-w-4xl mx-auto">
          <div className="inline-block rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700 ring-1 ring-inset ring-rose-100 mb-6 tracking-wide">
            AUDIT COMPLETE FOR {shortHost(websiteUrl).toUpperCase()}
          </div>

          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-zinc-900 leading-tight">
            You are leaking{" "}
            <span className="bg-yellow-200 px-2">
              {moneyRange(leakNums.finalPerYearLow, leakNums.finalPerYearHigh)}
            </span>{" "}
            every single year.
          </h1>

          <p className="mt-6 text-xl text-zinc-600 max-w-2xl mx-auto leading-relaxed">
            This is profit slipping away because your pricing and offer look weaker than what customers see from your
            local competitors.
          </p>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* LEFT */}
          <div className="lg:col-span-8 space-y-12">
            {/* Leak Summary */}
            <section>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card className="bg-gradient-to-br from-red-700 to-rose-900 text-white border-red-800 flex flex-col justify-between shadow-2xl shadow-rose-900/20 relative overflow-hidden ring-1 ring-inset ring-white/10">
                  <div className="absolute top-0 right-0 -mt-8 -mr-8 h-32 w-32 rounded-full bg-white/10 blur-3xl"></div>

                  <div>
                    <div className="flex items-center gap-2 text-rose-100 mb-3">
                      <div className="rounded-full bg-white/20 p-1.5">
                        <LucideAlertOctagon className="w-4 h-4 text-white" />
                      </div>
                      <span className="text-xs font-bold uppercase tracking-widest">Total Annual Leak</span>
                    </div>
                    <div className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white leading-none shadow-sm">
                      {moneyRange(leakNums.finalPerYearLow, leakNums.finalPerYearHigh)}
                    </div>
                  </div>

                  <div className="mt-10 relative z-10">
                    <div className="flex justify-between items-end text-xs font-medium text-rose-100 mb-2">
                      <span>Pricing + Offer Efficiency</span>
                      <span className="text-white font-bold">GAP EXISTS</span>
                    </div>

                    <div className="relative h-4 w-full bg-black/30 rounded-full overflow-hidden backdrop-blur-sm ring-1 ring-white/10">
                      <div className="absolute left-0 top-0 h-full bg-white/80 w-[85%] rounded-l-full"></div>
                      <div className="absolute right-0 top-0 h-full bg-red-600 w-[15%] rounded-r-full"></div>
                    </div>

                    <p className="mt-3 text-sm font-medium text-rose-50 leading-snug flex items-start gap-2 opacity-90">
                      <LucideTrendingDown className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>Your competitors are capturing this money. You are not.</span>
                    </p>
                  </div>
                </Card>

                <div className="grid grid-cols-1 gap-4">
                  <Card>
                    <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1">Monthly Cash Impact</div>
                    <div className="text-2xl font-bold text-zinc-900">
                      {moneyRange(leakNums.finalPerMonthLow, leakNums.finalPerMonthHigh)}
                      <span className="text-sm font-medium text-zinc-400 ml-1">/mo</span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">Money you should be keeping each month.</p>
                  </Card>

                  <Card>
                    <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1">Market Perception</div>
                    <div className="text-xl font-bold text-zinc-900">{marketPosition || "Unknown"}</div>
                    <p className="text-xs text-zinc-500 mt-1">
                      If you look “cheap”, you get price-shopped. If you look “safe”, you get chosen.
                    </p>
                  </Card>
                </div>
              </div>
            </section>

            {/* Top Leaks */}
            <section>
              <SectionHeader
                title="Where is the money going?"
                subtitle="We found these 3 holes. Fix #1 first."
              />

              <div className="space-y-6">
                {topLeaks.length > 0 ? (
                  topLeaks.slice(0, 3).map((leak: any, idx: number) => {
                    const w = [0.45, 0.35, 0.2][idx] || 0.1;
                    const impactVal =
                      leakNums.finalPerMonthLow !== null ? Math.round(leakNums.finalPerMonthLow * w) : null;

                    return (
                      <div
                        key={idx}
                        className="group relative overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition hover:shadow-md hover:border-zinc-300"
                      >
                        <div className="flex items-center gap-4 bg-zinc-50/50 p-6 border-b border-zinc-100">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white border border-zinc-200 text-lg font-bold text-zinc-900 shadow-sm">
                            #{idx + 1}
                          </div>
                          <div>
                            <h4 className="text-lg font-bold text-zinc-900">
                              {safeString(leak?.title, "Untitled Issue")}
                            </h4>
                            <div className="flex sm:hidden mt-2">
                              <ImpactBadge value={moneyCompact(impactVal)} />
                            </div>
                          </div>
                          <div className="ml-auto hidden sm:block">
                            <ImpactBadge value={moneyCompact(impactVal)} />
                          </div>
                        </div>

                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                          <div>
                            <p className="flex items-center gap-2 text-xs font-bold uppercase text-rose-600 mb-2">
                              <LucideAlertTriangle className="w-3 h-3" /> The Problem
                            </p>
                            <p className="text-sm text-zinc-800 leading-relaxed font-medium">
                              {safeString(leak?.why_it_matters)}
                            </p>
                          </div>
                          <div>
                            <p className="flex items-center gap-2 text-xs font-bold uppercase text-emerald-600 mb-2">
                              <LucideCheck className="w-3 h-3" /> What Competitors Do
                            </p>
                            <p className="text-sm text-zinc-600 leading-relaxed">
                              {safeString(leak?.market_contrast)}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-6 text-center text-sm text-zinc-500 border border-dashed border-zinc-300 rounded-xl">
                    No leaks generated for this run.
                  </div>
                )}
              </div>
            </section>

            {/* Competitor Matrix */}
            <section>
              <SectionHeader
                title="The Competitor Landscape"
                subtitle="This is what customers see and compare you to."
              />

              <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-zinc-50/80 text-xs uppercase font-semibold text-zinc-500">
                      <tr>
                        <th className="px-6 py-4">Business</th>
                        <th className="px-6 py-4">Trip Fee</th>
                        <th className="px-6 py-4">Membership</th>
                        <th className="px-6 py-4">Warranty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {competitors.slice(0, 8).map((c: any, i: number) => (
                        <tr key={i} className="hover:bg-zinc-50/50 transition">
                          <td className="px-6 py-4 font-medium text-zinc-900">
                            {c?.url ? (
                              <a
                                href={c.url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1 hover:text-blue-600"
                              >
                                {safeString(c?.name, "Unknown")}{" "}
                                <LucideExternalLink className="w-3 h-3 text-zinc-400" />
                              </a>
                            ) : (
                              safeString(c?.name, "Unknown")
                            )}
                          </td>
                          <td className="px-6 py-4 text-zinc-600 font-medium">
                            {safeString(c?.trip_fee, "—")}
                          </td>
                          <td className="px-6 py-4 text-zinc-600">
                            {safeString(c?.membership_offer, "—")}
                          </td>
                          <td className="px-6 py-4 text-zinc-600">
                            {safeString(c?.warranty_offer, "—")}
                          </td>
                        </tr>
                      ))}
                      {!competitors.length ? (
                        <tr>
                          <td className="px-6 py-6 text-sm text-zinc-500" colSpan={4}>
                            No competitors extracted for this run.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* Evidence Locker */}
            <section>
              <SectionHeader
                title="Verified Source Data"
                subtitle={`We didn’t guess. We pulled ${evidence.length} proof snippets from competitor websites to build this report.`}
              />

              <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
                <div className="bg-zinc-50 px-6 py-3 border-b border-zinc-200 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase text-zinc-500">
                    <LucideSearch className="w-3 h-3" /> Evidence Log
                  </div>
                  <div className="text-xs text-zinc-400">Pulled on {new Date().toLocaleDateString()}</div>
                </div>

                <div className="divide-y divide-zinc-100">
                  {evidence.length > 0 ? (
                    evidence.map((e: any, i: number) => {
                      const label = normalizeEvidenceType(safeString(e?.type, ""));
                      const competitorName = inferEvidenceCompetitorName(e, competitors);
                      const src = safeString(e?.source_url, "");

                      return (
                        <div
                          key={i}
                          className="p-5 hover:bg-zinc-50/50 transition flex flex-col sm:flex-row gap-4 sm:items-start"
                        >
                          <div className="shrink-0">
                            <span className="inline-flex items-center rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-600 ring-1 ring-inset ring-zinc-500/10 w-24 justify-center">
                              {label}
                            </span>
                          </div>

                          <div className="grow">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-bold text-zinc-900">{competitorName}</span>
                              <span className="text-xs text-zinc-400">•</span>
                              {src ? (
                                <a
                                  href={src}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                                >
                                  Verify Source <LucideExternalLink className="w-2.5 h-2.5" />
                                </a>
                              ) : (
                                <span className="text-xs text-zinc-400">No source URL</span>
                              )}
                            </div>

                            <p className="text-sm text-zinc-600 font-mono bg-zinc-50 p-2 rounded border border-zinc-100 mt-2">
                              “{safeString(e?.snippet, "—")}”
                            </p>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-8 text-center text-sm text-zinc-500">No raw evidence logs available.</div>
                  )}
                </div>
              </div>
            </section>
          </div>

          {/* RIGHT (Sticky Plan) */}
          <div className="lg:col-span-4">
            <div className="sticky top-24 space-y-6">
              <div className="rounded-xl bg-blue-900 p-6 text-white shadow-xl ring-1 ring-blue-900">
                <div className="mb-4 flex items-center gap-3 border-b border-white/10 pb-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white font-bold">
                    <LucideFileText className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold tracking-wide text-lg">Your Plan</h3>
                    <p className="text-xs text-blue-200">72-Hour Turnaround</p>
                  </div>
                </div>

                <p className="mb-6 text-sm text-blue-100 leading-relaxed">
                  Stop the bleeding first. Do these 3 things now to recover{" "}
                  <span className="font-bold text-white border-b border-white/30">
                    ~{moneyCompact(leakNums.finalPerMonthLow)}/mo
                  </span>
                  .
                </p>

                <ul className="space-y-4">
                  {doFirst.length > 0 ? (
                    doFirst.map((action: string, i: number) => (
                      <li key={i} className="flex gap-3 items-start">
                        <div className="mt-0.5 shrink-0 text-blue-300">
                          <div className="h-5 w-5 rounded-full border border-blue-400 flex items-center justify-center">
                            <span className="text-[10px] font-bold">{i + 1}</span>
                          </div>
                        </div>
                        <span className="text-sm font-medium leading-relaxed text-white">{action}</span>
                      </li>
                    ))
                  ) : (
                    <li className="text-sm text-blue-200">No urgent actions generated.</li>
                  )}
                </ul>

                <div className="mt-8">
                  <a
                    href={mailtoHref}
                    className="block w-full rounded-lg bg-white py-3 text-center text-sm font-bold text-blue-900 hover:bg-blue-50 transition shadow-sm"
                  >
                    Send This Plan To My Email
                  </a>
                  <div className="mt-2 text-[11px] text-blue-200">
                    (Opens your email app. No login needed.)
                  </div>
                </div>
              </div>

              <Card className="bg-white">
                <h4 className="font-bold text-zinc-900 text-sm flex items-center gap-2 mb-2">Why trust this?</h4>
                <p className="text-xs leading-relaxed text-zinc-500">
                  We pulled proof from {competitorCount} direct competitors in your area. This report is built from what
                  they show publicly (fees, plans, warranties). It’s not “AI guessing.”
                </p>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
