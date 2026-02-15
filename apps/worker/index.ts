import PgBoss from 'pg-boss';
import { PrismaClient } from '@prisma/client';
import { GoogleGenAI } from "@google/genai";
import { ExtractedDataSchema, ExtractedData } from '../../shared/schema/extractor.zod';
import { ReportSchema } from '../../shared/schema/report.zod';
import { computeBenchmark } from '../../lib/scoring';
import { computeStrategicProfile } from '../../lib/strategy';
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

DO NOT summarize.
DO NOT give advice.
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

You are not a marketer.
You are a strategic cross-examiner.

You have:
- Client vitals
- Competitor evidence
- Benchmark scoring
- Strategic profile

Produce a sharp audit.

RULES:
- Compare client vs market directly.
- No generic advice.
- Short decisive sentences.
- Sound like a $25k consultant.

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

  try {
    const caseData = await prisma.case.findUnique({ where: { id: caseId } });
    if (!caseData) throw new Error("Case not found");

    const updateStage = async (stage: string, progress: number) => {
      await prisma.job.update({
        where: { id: jobId },
        data: { stage, progress }
      });
    };

    const vitals = caseData.vitals as any;
    const base = `${caseData.whatTheySell} in ${caseData.location}`;

    await updateStage("Competitor Discovery", 10);

    const res = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `SEARCH QUERY: ${base} pricing membership warranty reviews\n\n${RESEARCH_PROMPT}`,
        config: { tools: [{ googleSearch: {} }] }
      }),
      45000,
      "Research"
    );

    const researchText = res.text || "";

    await updateStage("Evidence Extraction", 40);

    const extractorResult = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: EXTRACTOR_PROMPT + "\n\n" + researchText,
        config: { responseMimeType: "application/json" }
      }),
      45000,
      "Extractor"
    );

    const json = safeJsonParse(extractorResult.text || "");
    const extractedData = json
      ? ExtractedDataSchema.parse(json)
      : { competitors: [], evidence: [] };

    await updateStage("Benchmarking", 70);

    const benchmark = computeBenchmark(vitals, extractedData);
    const delta = benchmark.delta || {};
    const strategicProfile = computeStrategicProfile(delta, vitals, benchmark);

    await updateStage("Report Composition", 85);

    const composerInput = JSON.stringify({
      client: { ...caseData, vitals },
      market_data: extractedData,
      benchmark,
      strategic_profile: strategicProfile
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

    const finalReport = {
      meta: {
        generated_at: new Date().toISOString(),
        confidence: benchmark.confidence
      },
      ...reportContent,
      benchmark_data: benchmark,
      delta,
      strategic_profile: strategicProfile,
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

  } catch (error: any) {
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
}

start().catch(() => process.exit(1));
