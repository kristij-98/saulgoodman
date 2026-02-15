import PgBoss from 'pg-boss';

// Use a singleton pattern for the queue in Next.js dev environment to avoid connection limits
let boss: PgBoss | null = null;

export async function getQueue() {
  if (boss) return boss;
  
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing");
  
  boss = new PgBoss(process.env.DATABASE_URL);
  
  // We only start the client to send jobs, not to work them in the Next.js process
  await boss.start(); 
  return boss;
}