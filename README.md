# Profit Leak Attorney

A production-grade competitive intelligence tool powered by Gemini.

## Local Development

1. **Environment Setup**:
   Create `.env` file:
   ```bash
   DATABASE_URL="postgresql://user:password@localhost:5432/profit_leak?schema=public"
   GEMINI_API_KEY="your_google_genai_key"
   ```

2. **Install & DB**:
   ```bash
   npm install
   npx prisma generate
   npx prisma db push
   ```

3. **Run Web App**:
   ```bash
   npm run dev
   ```

4. **Run Worker** (in separate terminal):
   ```bash
   npm run worker
   ```

## Railway Deployment

1. **Create Project**: New Project -> Provision PostgreSQL.
2. **Env Vars**: Set `DATABASE_URL` (from Postgres plugin) and `GEMINI_API_KEY` (from Google AI Studio).
3. **Deploy Web Service**:
   - Connect GitHub Repo.
   - Root Directory: `/`
   - Start Command: `npm run start`
   - Build Command: `npx prisma generate && npm run build`
4. **Deploy Worker Service**:
   - Add a second service from the *same* repo.
   - Root Directory: `/`
   - Start Command: `npm run worker`
   - Watch Paths: `apps/worker/**`

## Architecture

- **Web**: Next.js App Router (Intake, Status, Report).
- **Worker**: Node.js process using `pg-boss` (Postgres-backed queue) to handle long-running Gemini tasks.
- **AI**: Uses Google Gemini 3 (Preview) for Grounding (Search), Extraction (JSON), and Composition.
