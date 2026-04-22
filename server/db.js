import { readdir, readFile } from "fs/promises";
import mysql from "mysql2/promise";

const mysqlRequiredEnvKeys = [
  "MYSQL_HOST",
  "MYSQL_PORT",
  "MYSQL_USER",
  "MYSQL_PASSWORD",
  "MYSQL_DATABASE",
];

const schemaDirectoryUrl = new URL("../sql/", import.meta.url);

async function getTableColumns(pool, tableName, databaseName) {
  const [rows] = await pool.query(
    `SELECT column_name AS columnName
     FROM information_schema.columns
     WHERE table_schema = ? AND table_name = ?`,
    [databaseName, tableName]
  );

  return new Set(rows.map((row) => row.columnName));
}

// 业务项目按需使用:
//   await ensureColumn(pool, db, "posts", "new_col", "INT NOT NULL DEFAULT 0 AFTER xxx");
// 保留导出,便于业务代码做增量迁移,而不需要改动 starter 骨架。
export async function ensureColumn(pool, databaseName, tableName, columnName, definitionSql) {
  const columns = await getTableColumns(pool, tableName, databaseName);
  if (columns.has(columnName)) {
    return;
  }
  await pool.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definitionSql}`);
}

export async function ensureIndex(pool, databaseName, tableName, indexName, alterClause) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.statistics
     WHERE table_schema = ? AND table_name = ? AND index_name = ?
     LIMIT 1`,
    [databaseName, tableName, indexName]
  );
  if (rows.length > 0) {
    return;
  }
  await pool.query(`ALTER TABLE ${tableName} ${alterClause}`);
}

export function getMysqlMissingEnvKeys(env = process.env) {
  return mysqlRequiredEnvKeys.filter((key) => !env[key]);
}

export function isMysqlConfigured(env = process.env) {
  return getMysqlMissingEnvKeys(env).length === 0;
}

export function createMysqlPool(env = process.env) {
  if (!isMysqlConfigured(env)) {
    return null;
  }

  return mysql.createPool({
    host: env.MYSQL_HOST,
    port: Number(env.MYSQL_PORT),
    user: env.MYSQL_USER,
    password: env.MYSQL_PASSWORD,
    database: env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    multipleStatements: true,
  });
}

// starter 只负责把 sql/ 目录里的 *.sql 按文件名顺序跑一遍。
// 业务项目里如果要做增量迁移(加字段/加索引),在自己的 data-service.js 里
// 用上面导出的 ensureColumn / ensureIndex 自行补。不要把业务迁移写死在 starter。
export async function bootstrapDatabase(pool) {
  const filenames = (await readdir(schemaDirectoryUrl))
    .filter((filename) => filename.endsWith(".sql"))
    .sort((left, right) => left.localeCompare(right));

  for (const filename of filenames) {
    const schemaSql = await readFile(new URL(filename, schemaDirectoryUrl), "utf8");
    await pool.query(schemaSql);
  }
}

export async function getSchemaTables(pool, databaseName) {
  const [rows] = await pool.query(
    `SELECT table_name AS tableName
     FROM information_schema.tables
     WHERE table_schema = ?
     ORDER BY table_name ASC`,
    [databaseName]
  );

  return rows;
}
