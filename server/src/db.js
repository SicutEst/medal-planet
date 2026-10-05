import pg from 'pg';
import memPool, { seedDatabase } from './db-memory.js';

const useMemory = process.env.USE_MEMORY_DB === 'true';

let pool;

if (useMemory) {
  pool = memPool;
  seedDatabase();
} else {
  const { Pool } = pg;
  pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'medal_planet',
    user: process.env.DB_USER || 'medal',
    password: process.env.DB_PASSWORD || 'medal123',
  });
}

export default pool;
