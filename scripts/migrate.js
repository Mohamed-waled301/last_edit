import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { getDbConfig } from '../api/db.js';

async function migrate() {
  const config = getDbConfig();
  console.log('Connecting to Hostinger MySQL at:', config.host);

  const connection = await mysql.createConnection({
    ...config,
    multipleStatements: true,
  });

  console.log('Connected successfully!');

  // 1. Run Schema
  console.log('Executing schema.sql...');
  const schemaSql = fs.readFileSync(path.resolve('schema.sql'), 'utf8');
  await connection.query(schemaSql);
  console.log('Schema created successfully!');

  // 2. Run Seed
  console.log('Executing seed.sql...');
  const seedSql = fs.readFileSync(path.resolve('seed.sql'), 'utf8');
  await connection.query(seedSql);
  console.log('Clean seed executed successfully!');

  // 3. Verify Tables
  const [tables] = await connection.query('SHOW TABLES');
  console.log(`Verification: Database now has ${tables.length} tables:`);
  console.log(tables.map((t) => Object.values(t)[0]));

  await connection.end();
  console.log('All migrations completed cleanly!');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
