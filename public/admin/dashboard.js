/* ---------- Light / dark theme ---------- */
// This part runs straight away (the script is in the <head>) so the page never flashes the wrong theme.

function savedTheme() {
  try {
    return localStorage.getItem('cf-theme');
  } catch (err) {
    return null; // storage can be blocked in private mode
  }
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem('cf-theme', theme);
  } catch (err) {
    // not saving is fine, the theme still changes for this visit
  }
  document.querySelectorAll('[data-theme-set]').forEach(function (button) {
    button.setAttribute('aria-pressed', String(button.dataset.themeSet === theme));
  });
}

// First visit: follow the device setting.
var startTheme = savedTheme() ||
  (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
document.documentElement.setAttribute('data-theme', startTheme);


/* ---------- Everything else waits until the page is ready ---------- */

document.addEventListener('DOMContentLoaded', function () {
  var REFRESH_SECONDS = 15;

  var userButton = document.getElementById('userButton');
  var userMenu = document.getElementById('userMenu');

  var timeZone = undefined;   // the clinic's time zone, known after the board answers
  var range = 'today';        // 'today', '7' or '30'
  var data = null;            // the latest dashboard answer
  var ticketsChart = null;
  var waitChart = null;

  function byId(id) {
    return document.getElementById(id);
  }

  /* Theme buttons (the charts are redrawn so their colors follow the theme) */
  setTheme(startTheme);
  document.querySelectorAll('[data-theme-set]').forEach(function (button) {
    button.addEventListener('click', function () {
      setTheme(button.dataset.themeSet);
      if (data) drawCharts();
    });
  });

  /* ---------- Small helpers ---------- */

  // el('p', 'note', 'Hello') -> <p class="note">Hello</p>   (text goes in with textContent, never as HTML)
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function capitalize(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  // "Clinic Admin" -> "CA"
  function initials(name) {
    var words = String(name).trim().split(/\s+/);
    var letters = words[0].charAt(0) + (words.length > 1 ? words[words.length - 1].charAt(0) : '');
    return letters.toUpperCase();
  }

  // "08:00:00" -> "8:00 AM"
  function formatTime(value) {
    var parts = String(value).split(':');
    var hour = Number(parts[0]);
    return (hour % 12 || 12) + ':' + parts[1] + ' ' + (hour >= 12 ? 'PM' : 'AM');
  }

  // "2026-10-23" -> "Oct 23"
  function shortDay(isoDate) {
    var parts = String(isoDate).split('-');
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[Number(parts[1]) - 1] + ' ' + Number(parts[2]);
  }

  function minutesText(minutes) {
    return minutes === null || minutes === undefined ? '—' : Math.round(minutes) + ' min';
  }

  function updateClock() {
    byId('clock').textContent = new Date().toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZone: timeZone
    });
  }

  function cssColor(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  /* ---------- User menu ---------- */

  function closeMenu() {
    userMenu.hidden = true;
    userButton.setAttribute('aria-expanded', 'false');
  }

  userButton.addEventListener('click', function (event) {
    event.stopPropagation();
    var open = userMenu.hidden;
    userMenu.hidden = !open;
    userButton.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', function (event) {
    if (!userMenu.contains(event.target)) closeMenu();
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeMenu();
  });

  byId('logoutButton').addEventListener('click', function () {
    fetch('/api/auth/logout', { method: 'POST' })
      .catch(function () { /* leave the page either way */ })
      .then(function () { window.location.href = '/login/login.html'; });
  });

  /* ---------- Talking to the server ---------- */

  // Gets JSON. Logged-out people go to the login page, people without access to the error page.
  function getJson(url) {
    return fetch(url, { cache: 'no-store' }).then(function (res) {
      if (res.status === 401) {
        window.location.replace('/login/login.html');
        throw new Error('not logged in');
      }
      if (res.status === 403) {
        window.location.replace('/error/error.html?code=403');
        throw new Error('not allowed');
      }
      if (!res.ok) throw new Error('bad status');
      return res.json();
    });
  }

  /* ---------- Numbers and live overview ---------- */

  function fact(label, value, className) {
    var box = el('div', 'fact' + (className ? ' ' + className : ''));
    box.appendChild(el('dt', '', label));
    box.appendChild(el('dd', '', value));
    return box;
  }

  function drawStats() {
    var t = data.totals;
    byId('statTotal').textContent = t.total;
    byId('statWaiting').textContent = t.waiting;
    byId('statCompleted').textContent = t.completed;
    byId('statLost').textContent = t.skipped + t.cancelled;
    byId('statWait').textContent = minutesText(t.avg_wait_minutes);
  }

  function drawLive() {
    var list = byId('liveList');
    list.textContent = '';
    data.services.forEach(function (s) {
      var card = el('article', 'cf-card live');
      var head = el('div', 'live-head');
      head.appendChild(el('h3', '', s.service_name));
      head.appendChild(el('span', 'cf-badge cf-' + s.queue_status, capitalize(s.queue_status)));
      card.appendChild(head);

      var facts = el('dl', 'facts');
      facts.appendChild(fact('Now serving', s.now_serving || '–', 'big'));
      facts.appendChild(fact('Queue', s.waiting ? s.waiting + ' waiting' : 'No one waiting'));
      facts.appendChild(fact('Hours', formatTime(s.open_time) + ' - ' + formatTime(s.close_time), 'wide'));
      card.appendChild(facts);
      if (s.queue_status === 'paused' && s.status_note) card.appendChild(el('p', 'muted', 'Paused: ' + s.status_note));
      list.appendChild(card);
    });
    if (!data.services.length) list.appendChild(el('p', 'muted', 'No active services.'));
  }

  /* ---------- Charts ---------- */

  function drawCharts() {
    var labels = data.daily.map(function (d) { return shortDay(d.date); });
    var patients = data.daily.map(function (d) { return d.patients; });
    // Days with nobody called have no average: leave a gap in the line instead of a fake zero
    var waits = data.daily.map(function (d) { return d.avg_wait_minutes; });

    var text = cssColor('--cf-text-muted');
    var grid = cssColor('--cf-border');
    var bar = cssColor('--cf-accent-strong');
    var line = cssColor('--cf-waiting-fg') || bar;

    var rangeText = data.daily.length + ' days';
    document.querySelectorAll('.chart-range').forEach(function (n) { n.textContent = rangeText; });

    function options(title) {
      return {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: text, maxRotation: 0, autoSkip: true }, grid: { display: false }, border: { color: grid } },
          y: { beginAtZero: true, title: { display: true, text: title, color: text }, ticks: { color: text, precision: 0 }, grid: { color: grid }, border: { display: false } }
        }
      };
    }

    if (ticketsChart) ticketsChart.destroy();
    ticketsChart = new Chart(byId('ticketsChart'), {
      type: 'bar',
      data: { labels: labels, datasets: [{ label: 'Patients', data: patients, backgroundColor: bar, borderRadius: 4, maxBarThickness: 28 }] },
      options: options('Patients')
    });

    if (waitChart) waitChart.destroy();
    var waitOptions = options('Minutes');
    waitOptions.scales.y.ticks.precision = 1;
    waitChart = new Chart(byId('waitChart'), {
      type: 'line',
      data: { labels: labels, datasets: [{ label: 'Average wait (min)', data: waits, borderColor: line, backgroundColor: line, borderWidth: 2, pointRadius: 4, pointBackgroundColor: line, spanGaps: false, tension: 0 }] },
      options: waitOptions
    });

    // The same numbers as a table, for screen readers and anyone who prefers it
    var rows = byId('tableRows');
    rows.textContent = '';
    data.daily.forEach(function (d) {
      var tr = el('tr');
      tr.appendChild(el('td', '', shortDay(d.date)));
      tr.appendChild(el('td', '', String(d.patients)));
      tr.appendChild(el('td', '', minutesText(d.avg_wait_minutes)));
      rows.appendChild(tr);
    });
  }

  /* ---------- Loading ---------- */

  function load() {
    return getJson('/api/admin/dashboard?range=' + range)
      .then(function (answer) {
        data = answer;
        byId('loading').hidden = true;
        byId('content').hidden = false;
        byId('pageAlert').hidden = true;
        drawStats();
        drawLive();
        if (window.Chart) drawCharts();
        else {
          byId('pageAlert').textContent = 'The charts could not load (no internet connection to the chart library). The numbers above are still correct.';
          byId('pageAlert').hidden = false;
        }
      })
      .catch(function (err) {
        if (err.message === 'not logged in' || err.message === 'not allowed') return;
        byId('loading').hidden = true;
        byId('pageAlert').textContent = "Can't reach the server. Trying again...";
        byId('pageAlert').hidden = false;
      });
  }

  document.querySelectorAll('[data-range]').forEach(function (button) {
    button.addEventListener('click', function () {
      range = button.dataset.range;
      document.querySelectorAll('[data-range]').forEach(function (other) {
        other.setAttribute('aria-pressed', String(other === button));
      });
      load();
    });
  });

  /* ---------- Start ---------- */

  getJson('/api/auth/me')
    .then(function (result) {
      var user = result.user;
      if (user.mustChangePassword) {
        window.location.replace('/force-password/force-password.html');
        return null;
      }
      if (user.role === 'patient') { window.location.replace('/patient/home.html'); return null; }
      if (user.role === 'staff') { window.location.replace('/staff/console.html'); return null; }

      byId('headerName').textContent = user.name;
      byId('headerInitials').textContent = initials(user.name);

      return fetch('/api/public/board')
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (board) {
          if (board) {
            timeZone = board.time_zone;
          }
        })
        .catch(function () { /* the clock just uses this device's time zone */ })
        .then(function () {
          updateClock();
          setInterval(updateClock, 30 * 1000);
          return load();
        })
        .then(function () {
          setInterval(load, REFRESH_SECONDS * 1000);
        });
    })
    .catch(function () { /* redirects are already happening */ });
});
