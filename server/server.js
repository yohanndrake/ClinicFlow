const path = require('path');
const express = require('express');
const session = require('express-session');
const pool = require('./db');
const { expireTickets } = require('./jobs');

const app = express();

app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 8 },
}));

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/api/health', async (req, res, next) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.use('/api/public', require('./routes/public'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/patient', require('./routes/patient'));
app.use('/api/staff', require('./routes/staff'));
app.use('/api/admin', require('./routes/admin'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Any other address that matches nothing: show the 404 page to browsers, plain text to everything else.
app.use((req, res) => {
  res.status(404);
  if (req.accepts('html')) {
    res.sendFile(path.join(__dirname, '..', 'public', 'error', 'error.html'));
  } else {
    res.type('text').send('Not found');
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`ClinicFlow running at http://localhost:${port}`));

// Background task, once a minute: expire no-shows and tickets left after closing time.
async function runExpiry() {
  try {
    const n = await expireTickets();
    if (n) console.log(`Expired ${n} ticket(s)`);
  } catch (err) {
    console.error('Expiry task failed:', err.message);
  }
}
runExpiry();
setInterval(runExpiry, 60 * 1000);
