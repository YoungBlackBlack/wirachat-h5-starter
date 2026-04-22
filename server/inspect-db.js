import {
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
    const tables = await getSchemaTables(pool, process.env.MYSQL_DATABASE);
    const [usersCount] = await pool.query("SELECT COUNT(*) AS n FROM users");
    const [eventsCount] = await pool.query(
      "SELECT COUNT(*) AS n FROM analytics_events"
    );

    console.log(
      JSON.stringify(
        {
          database: process.env.MYSQL_DATABASE,
          tables: tables.map((t) => t.tableName),
          counts: {
            users: usersCount[0]?.n || 0,
            analytics_events: eventsCount[0]?.n || 0,
          },
        },
        null,
        2
      )
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Database inspection failed:", error);
  process.exit(1);
});
