type PrismaLike = Record<string, any>;

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaLike;
};

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
export const prismaAvailable = Boolean(PrismaClient);

export const prisma: PrismaLike =
  globalForPrisma.prisma ??
  (PrismaClient
    ? new PrismaClient({
        log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
      })
    : createMissingClientProxy());

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
