//db.js makes the connection to the database which the whole backend uses

//loads pg package for connecting to PostgreSQL database, and fs to read the certificate file
const fs = require("fs");
const { Pool, types } = require("pg");

//change how PostgreSQL values arrive in js
types.setTypeParser(20, (v) => parseInt(v, 10));
types.setTypeParser(1082, (v) => v);

//the connection is always encrypted. When DATABASE_CA_FILE points to Supabase's certificate file,
//the server's identity is checked too, so nobody in between can pretend to be the database
let ssl = { rejectUnauthorized: false };
if (process.env.DATABASE_CA_FILE) {
  ssl = {
    ca: fs.readFileSync(process.env.DATABASE_CA_FILE, "utf8"),
    rejectUnauthorized: true,
  };
} else {
  console.warn(
    "DATABASE_CA_FILE is not set: the database certificate is not checked",
  );
}

//creates the connection pool to Supabase, with up to 10 open connections.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl,
  max: 10,
});

//share the pool with the other files.
module.exports = pool;
