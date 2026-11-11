//server.js - starts the whole backend

//requires the tools needed from node_modules
//express-session remembers who is logged in
//pool is the database connection
//expireTickets for expiring old tickets
//DatabaseStore keeps the login sessions in the database
const path = require("path");
const express = require("express");
const session = require("express-session");
const pool = require("./db");
const { expireTickets } = require("./jobs");
const DatabaseStore = require("./sessionStore");

//creates the app
const app = express();

//trust the https proxy in front of the app on hosts like Render, so secure cookies work.
//only when there really is one (Render sets RENDER by itself, other hosts set TRUST_PROXY=1):
//without a proxy, anyone could fake their IP address with a header and dodge the login lock
if (process.env.RENDER || process.env.TRUST_PROXY === "1") {
  app.set("trust proxy", 1);
}

//security headers on every response:
//- the pages cannot be shown inside a frame on another site (stops clickjacking)
//- the browser must not guess file types
//- pages may only load their own files, plus Chart.js from cdnjs and the Google font
const CONTENT_POLICY = [
  "default-src 'self'",
  "script-src 'self' https://cdnjs.cloudflare.com",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");
app.use((req, res, next) => {
  res.set("X-Frame-Options", "DENY");
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Referrer-Policy", "same-origin");
  res.set("Content-Security-Policy", CONTENT_POLICY);
  next();
});

//app reads the json
app.use(express.json());

//connects the public folder to the server. It comes before the login memory, so plain files
//(pages, css, js) are sent without looking up the session in the database
app.use(express.static(path.join(__dirname, "..", "public")));

//login memory, the server stores the logged in user to req.session.
//the sessions are kept in the database, so a restart does not log everyone out
const sessionStore = new DatabaseStore();
app.use(
  session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    //secure "auto": the cookie is https-only when the site is on https, and still works on http locally
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: "auto",
      maxAge: 1000 * 60 * 60 * 8,
    },
  }),
);

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
  //a request body that is not valid JSON is the sender's mistake, so answer 400 instead of 500
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid request body" });
  }
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

//starts the server in port 3000
const port = process.env.PORT || 3000;
app.listen(port, () =>
  console.log(`ClinicFlow running at http://localhost:${port}`),
);

//expires old tickets every 60 seconds and logs them, then clears login sessions that have run out
async function runExpiry() {
  try {
    const n = await expireTickets();
    if (n) console.log(`Expired ${n} ticket(s)`);
  } catch (err) {
    console.error("Expiry task failed:", err.message);
  }
  try {
    await sessionStore.clearExpired();
  } catch (err) {
    console.error("Session clean-up failed:", err.message);
  }
}

//keeps runExpiry up and updates every 60s
runExpiry();
setInterval(runExpiry, 60 * 1000);
