import {
  bootstrapDatabase,
  createMysqlPool,
  getMysqlMissingEnvKeys,
  getSchemaTables,
  isMysqlConfigured,
} from "./db.js";
import { loadAppEnv } from "./env.js";

loadAppEnv();

async function main() {
  if (!isMysqlConfigured(process.env)) {
    console.error("MySQL environment variables are incomplete.");
    console.error(`Missing: ${getMysqlMissingEnvKeys(process.env).join(", ")}`);
    process.exit(1);
  }

  const pool = createMysqlPool(process.env);

  try {
    await bootstrapDatabase(pool);
    const tables = await getSchemaTables(pool, process.env.MYSQL_DATABASE);
    console.log(`Database schema is ready. Total tables: ${tables.length}`);
    console.log(tables.map((table) => table.tableName).join(", "));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Database bootstrap failed:", error);
  process.exit(1);
});
