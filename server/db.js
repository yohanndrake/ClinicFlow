//db.js makes the connection to the database which the whole backend uses

//loads pg package for connecting to PostgreSQL database
const { Pool, types } = require("pg");

//change how PostgreSQL values arrive in js
types.setTypeParser(20, (v) => parseInt(v, 10));
types.setTypeParser(1082, (v) => v);

//creates the connection pool to Supabase, with up to 10 open connections.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
});

//share the pool with the other files.
module.exports = pool;
