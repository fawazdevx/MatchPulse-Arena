type PrismaLike = Record<string, any>;

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaLike;
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

function loadPrismaClient() {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    return runtimeRequire("@prisma/client").PrismaClient as new (options?: Record<string, unknown>) => PrismaLike;
  } catch {
    return null;
  }
}

function createMissingClientProxy(): PrismaLike {
  return new Proxy(
    {},
    {
      get() {
        throw new Error(
          "Prisma Client is not generated. Run `npm run db:generate` after installing dependencies, then restart the dev server."
        );
      }
    }
  );
}

const PrismaClient = loadPrismaClient();
const databaseUrl = runtimeDatabaseUrl();
export const prismaAvailable = Boolean(PrismaClient);

export const prisma: PrismaLike =
  globalForPrisma.prisma ??
  (PrismaClient
    ? new PrismaClient({
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
      })
    : createMissingClientProxy());

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
