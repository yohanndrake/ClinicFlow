//server.js - starts the whole backend

//requires the tools needed from node_modules
//express-session remembers who is logged in
//pool is the database connection
//expireTickets for expiring old tickets
const path = require("path");
const express = require("express");
const session = require("express-session");
const pool = require("./db");
const { expireTickets } = require("./jobs");

//creates the app
const app = express();

//app reads the json
app.use(express.json());

//login memory, the server stores the logged in user to req.session
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax", maxAge: 1000 * 60 * 60 * 8 },
  }),
);

//connects the public folder to the server
app.use(express.static(path.join(__dirname, "..", "public")));

//checks if connection to the database is working
app.get("/api/health", async (req, res, next) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

//uses routes fodler to access the fronend and backend routes
app.use("/api/public", require("./routes/public"));
app.use("/api/auth", require("./routes/auth"));
app.use("/api/patient", require("./routes/patient"));
app.use("/api/staff", require("./routes/staff"));
app.use("/api/admin", require("./routes/admin"));

//if no routes found, return error 404
app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

//if other addresses are not found, it will return an error 404
app.use((req, res) => {
  res.status(404);
  if (req.accepts("html")) {
    res.sendFile(path.join(__dirname, "..", "public", "error", "error.html"));
  } else {
    res.type("text").send("Not found");
  }
});

//catche any errors
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

//starts the server in port 3000
const port = process.env.PORT || 3000;
app.listen(port, () =>
  console.log(`ClinicFlow running at http://localhost:${port}`),
);

//expires old tickets every 60 seconds and logs them
async function runExpiry() {
  try {
    const n = await expireTickets();
    if (n) console.log(`Expired ${n} ticket(s)`);
  } catch (err) {
    console.error("Expiry task failed:", err.message);
  }
}

//keeps runExpiry up and updates every 60s
runExpiry();
setInterval(runExpiry, 60 * 1000);
