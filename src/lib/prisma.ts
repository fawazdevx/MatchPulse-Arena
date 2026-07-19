import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function runtimeDatabaseUrl() {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) return undefined;

  try {
    const url = new URL(rawUrl);
    const isSupabaseTransactionPooler = url.hostname.endsWith(".pooler.supabase.com") && url.port === "6543";
    if (!isSupabaseTransactionPooler) return rawUrl;

    if (!url.searchParams.has("pgbouncer")) url.searchParams.set("pgbouncer", "true");
    if (!url.searchParams.has("connection_limit")) url.searchParams.set("connection_limit", "1");
    return url.toString();
  } catch {
    return rawUrl;
  }
}

const databaseUrl = runtimeDatabaseUrl();
export const prismaAvailable = true;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    ...(databaseUrl
      ? {
          datasources: {
            db: {
              url: databaseUrl
            }
          }
        }
      : {})
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
