import PgBoss from 'pg-boss';
import { PrismaClient } from '@prisma/client';
import { GoogleGenAI } from "@google/genai";
import { ExtractedDataSchema, ExtractedData } from '../../shared/schema/extractor.zod';
import { ReportSchema } from '../../shared/schema/report.zod';
import { computeBenchmark } from '../../lib/scoring';
import { computeMarketDelta } from '../../lib/delta';
import { nanoid } from 'nanoid';

// ------------------------------------------------
// CONFIG
// ------------------------------------------------
const DATABASE_URL = process.env.DATABASE_URL!;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;

if (!DATABASE_URL || !GEMINI_API_KEY) {
  console.error("Missing env vars: DATABASE_URL or GEMINI_API_KEY");
  process.exit(1);
}

const prisma = new PrismaClient();
const boss = new PgBoss(DATABASE_URL);
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// ------------------------------------------------
// HELPERS
// ------------------------------------------------
async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(v => { clearTimeout(t); resolve(v); })
     .catch(e => { clearTimeout(t); reject(e); });
  });
}

function safeJsonParse(text: string): any | null {
  try { return JSON.parse(text); } catch { return null; }
}

// ------------------------------------------------
// PROMPTS
// ------------------------------------------------

const RESEARCH_PROMPT = `
You are a forensic-grade competitive intelligence analyst.
Collect REAL competitor evidence for a paid audit.
DO NOT summarize. DO NOT give advice.
ONLY extract factual evidence with URLs and snippets.

Find 6–10 DIRECT competitors.

PRIORITY DATA:
1) Service/diagnostic/trip fees
2) Published price ranges
3) Membership/maintenance plans
4) Warranty/guarantee terms
5) Financing offers
6) Premium positioning signals
7) Review signals

OUTPUT FORMAT:

COMPETITOR:
- name:
- primary_url:
- location_served:

EVIDENCE:
- [pricing] url: ... | snippet: "..."
- [trip_fee] url: ... | snippet: "..."
- [membership] url: ... | snippet: "..."
- [warranty] url: ... | snippet: "..."
- [financing] url: ... | snippet: "..."
- [premium] url: ... | snippet: "..."
- [reputation] url: ... | snippet: "..."

NOTES:
- pricing_visibility: public / partial / not_public
- missing_data: list missing areas

Repeat per competitor.
`;

const EXTRACTOR_JSON_SHAPE = `
{
  "competitors": [
    {
      "name": "string",
      "url": "string",
      "services": ["string"],
      "pricing_signals": ["string"],
      "trip_fee": null,
      "membership_offer": null,
      "warranty_offer": null,
      "premium_signals": ["string"],
      "evidence_ids": ["e1"]
    }
  ],
  "evidence": [
    {
      "id": "e1",
      "source_url": "https://example.com",
      "snippet": "raw copied snippet",
      "type": "pricing|service|reputation|guarantee|other"
    }
  ]
}
`;

const EXTRACTOR_PROMPT = `
Convert the research into STRICT JSON.
Match EXACTLY this structure:

${EXTRACTOR_JSON_SHAPE}

Rules:
- Return ONLY JSON.
- Never omit keys.
- Unknown values => null or [].
- evidence.type must be pricing|service|reputation|guarantee|other.
`;

const COMPOSER_PROMPT = `
You are "Profit Leak Attorney".

You are a strategic cross-examiner.

You receive:
- client vitals
- competitor evidence
- benchmark scoring
- structured market delta

Produce a sharp, specific audit.

Rules:
- Reference market contrast.
- Call out pricing gaps directly.
- Call out missing memberships.
- Call out warranty weakness.
- Use structured reasoning.
- No fluff.

Return STRICT JSON:

{
  "quick_verdict": string,
  "market_position": string,
  "top_leaks_ranked": [
    { "title": string, "why_it_matters": string, "market_contrast": string }
  ],
  "scorecard_rows": [
    { "label": string, "score": string, "notes": string }
  ],
  "offer_rebuild": [
    { "title": string, "content": string }
  ],
  "scripts": [
    { "title": string, "script_body": string }
  ],
  "next_7_days": string[],
  "assumptions_ledger": string[]
}

Return ONLY JSON.
`;

// ------------------------------------------------
// WORKER
// ------------------------------------------------

async function runAuditJob(job: any) {
  const { caseId, jobId } = job.data;
  console.log(`[Job ${jobId}] Starting audit for Case ${caseId}`);

  try {
    const caseData = await prisma.case.findUnique({ where: { id: caseId } });
    if (!caseData) throw new Error("Case not found");

    const updateStage = async (stage: string, progress: number) => {
      await prisma.job.update({
        where: { id: jobId },
        data: { stage, progress }
      });
      console.log(`[Job ${jobId}] ${stage} (${progress}%)`);
    };

    const vitals = caseData.vitals as any;
    const base = `${caseData.whatTheySell} in ${caseData.location}`;

    // ------------------------------------------------
    // STAGE 1 — MULTI PASS RESEARCH
    // ------------------------------------------------
    await updateStage("Competitor Discovery", 10);

    const queries = [
      `${base} pricing service call fee`,
      `${base} membership maintenance plan`,
      `${base} warranty guarantee`,
      `${base} reviews rating competitors`
    ];

    const researchChunks: string[] = [];
    const sourceUrls: string[] = [];

    for (let i = 0; i < queries.length; i++) {
      const res = await withTimeout(
        ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: `SEARCH QUERY: ${queries[i]}\n\n${RESEARCH_PROMPT}`,
          config: { tools: [{ googleSearch: {} }] }
        }),
        45000,
        `Research Pass ${i + 1}`
      );

      const txt = res.text || "";
      researchChunks.push(`\n\n=== PASS ${i + 1} ===\n${txt}`);

      const grounding =
        res.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

      const groundingUrls = grounding
        .map((c: any) => c.web?.uri)
        .filter((u: any) => u);

      const urlRegex = /(https?:\/\/[^\s]+)/g;
      const textUrls = txt.match(urlRegex) || [];

      sourceUrls.push(...groundingUrls, ...textUrls);
    }

    const researchText = researchChunks.join("\n");
    const allSourceUrls = Array.from(new Set(sourceUrls));

    // ------------------------------------------------
    // STAGE 2 — EXTRACTION
    // ------------------------------------------------
    await updateStage("Evidence Extraction", 40);

    const extractorInput = `
RAW RESEARCH:
${researchText}

SOURCE URLS:
${allSourceUrls.join("\n")}
`;

    const extractorCall = async (prompt: string) =>
      await withTimeout(
        ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: prompt,
          config: { responseMimeType: "application/json" }
        }),
        45000,
        "Extractor"
      );

    let extractedData: ExtractedData | null = null;

    const attempt1 = await extractorCall(EXTRACTOR_PROMPT + "\n\n" + extractorInput);
    const json1 = safeJsonParse(attempt1.text || "");
    if (json1) {
      try {
        extractedData = ExtractedDataSchema.parse(json1);
      } catch {}
    }

    if (!extractedData) {
      const repairPrompt =
        `Fix output to EXACT schema:\n${EXTRACTOR_JSON_SHAPE}\n\nReturn ONLY JSON.\n\n${extractorInput}`;

      const attempt2 = await extractorCall(repairPrompt);
      const json2 = safeJsonParse(attempt2.text || "");
      if (json2) {
        try {
          extractedData = ExtractedDataSchema.parse(json2);
        } catch {}
      }
    }

    if (!extractedData) {
      extractedData = { competitors: [], evidence: [] };
    }

    // ------------------------------------------------
    // STAGE 3 — BENCHMARK
    // ------------------------------------------------
    await updateStage("Benchmarking", 70);
    const benchmark = computeBenchmark(vitals, extractedData);

    // ------------------------------------------------
    // STAGE 3.5 — DELTA ENGINE
    // ------------------------------------------------
    const delta = computeMarketDelta(vitals, extractedData, benchmark);

    // ------------------------------------------------
    // STAGE 4 — COMPOSER
    // ------------------------------------------------
    await updateStage("Report Composition", 85);

    const composerInput = JSON.stringify({
      client: { ...caseData, vitals },
      market_data: extractedData,
      benchmark,
      delta
    });

    const composerResult = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: COMPOSER_PROMPT + "\n\n" + composerInput,
        config: { responseMimeType: "application/json" }
      }),
      60000,
      "Composer"
    );

    const rawComposer = safeJsonParse(composerResult.text || "") || {};
    const reportContent = ReportSchema.parse(rawComposer);

    // ------------------------------------------------
    // SAVE REPORT
    // ------------------------------------------------
    const finalReport = {
      meta: {
        generated_at: new Date().toISOString(),
        confidence: benchmark.confidence
      },
      ...reportContent,
      benchmark_data: benchmark,
      delta,
      evidence_drawer: extractedData.evidence,
      competitors: extractedData.competitors
    };

    await prisma.report.create({
      data: {
        caseId,
        shareId: nanoid(10),
        content: finalReport as any
      }
    });

    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'completed', progress: 100, finishedAt: new Date() }
    });

    console.log(`[Job ${jobId}] Finished successfully.`);

  } catch (error: any) {
    console.error(`[Job ${jobId}] Failed:`, error);
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        error: error?.message || "Unknown error",
        finishedAt: new Date()
      }
    });
  }
}

async function start() {
  await boss.start();
  await boss.work('audit-job', runAuditJob);
  console.log('Worker started. Waiting for jobs...');
}

start().catch(err => {
  console.error(err);
  process.exit(1);
});
