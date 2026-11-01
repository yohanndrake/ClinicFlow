const { Pool, types } = require('pg');

// Make Postgres values easier to use in JavaScript:
types.setTypeParser(20, v => parseInt(v, 10)); // COUNT(*) comes back as text by default
types.setTypeParser(1082, v => v);             // DATE stays 'YYYY-MM-DD' (no time zone shifting)

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Supabase requires an encrypted connection
  max: 10,
});

module.exports = pool;
