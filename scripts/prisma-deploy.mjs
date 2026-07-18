import { spawnSync } from "node:child_process";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

function migrationDatabaseUrl(rawUrl) {
  if (!rawUrl) return undefined;

  try {
    const url = new URL(rawUrl);
    if (url.hostname.endsWith(".pooler.supabase.com") && url.port === "6543") {
      url.port = "5432";
      url.searchParams.delete("pgbouncer");
      url.searchParams.delete("connection_limit");
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

const databaseUrl = migrationDatabaseUrl(process.env.DATABASE_URL);
if (!databaseUrl) {
  console.error("DATABASE_URL must be set before deploying migrations.");
  process.exit(1);
}

const result = spawnSync("prisma", ["migrate", "deploy"], {
  env: {
    ...process.env,
    DATABASE_URL: databaseUrl
  },
  stdio: "inherit"
});

if (result.error) {
  console.error(`Could not start Prisma: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
