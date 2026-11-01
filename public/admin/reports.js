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
  var userButton = document.getElementById('userButton');
  var userMenu = document.getElementById('userMenu');
  var rangeSelect = document.getElementById('range');
  var serviceSelect = document.getElementById('service');

  var timeZone = undefined;   // the clinic's time zone, known after the board answers
  var report = null;          // the latest report
  var charts = {};            // Chart.js objects, so they can be destroyed before redrawing
  var requestNumber = 0;      // ignore old answers if the filters changed meanwhile

  function byId(id) {
    return document.getElementById(id);
  }

  /* Theme buttons (the charts are redrawn so their colors follow the theme) */
  setTheme(startTheme);
  document.querySelectorAll('[data-theme-set]').forEach(function (button) {
    button.addEventListener('click', function () {
      setTheme(button.dataset.themeSet);
      if (report) drawCharts();
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

  // "Clinic Admin" -> "CA"
  function initials(name) {
    var words = String(name).trim().split(/\s+/);
    var letters = words[0].charAt(0) + (words.length > 1 ? words[words.length - 1].charAt(0) : '');
    return letters.toUpperCase();
  }

  // "2026-10-23" -> "Oct 23"
  function shortDay(isoDate) {
    var parts = String(isoDate).split('-');
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[Number(parts[1]) - 1] + ' ' + Number(parts[2]);
  }

  // 13 -> "1 PM"
  function hourText(hour) {
    return (hour % 12 || 12) + (hour >= 12 ? ' PM' : ' AM');
  }

  function minutesText(minutes) {
    return minutes === null || minutes === undefined ? '—' : Math.round(minutes) + ' min';
  }

  // The clinic's date, N days ago, as YYYY-MM-DD
  function daysAgo(days) {
    var parts = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric', month: '2-digit', day: '2-digit', timeZone: timeZone
    }).formatToParts(new Date());
    var map = {};
    parts.forEach(function (p) { map[p.type] = p.value; });
    var day = new Date(Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day)));
    day.setUTCDate(day.getUTCDate() - days);
    return day.toISOString().slice(0, 10);
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
      return res.json().catch(function () { return {}; }).then(function (json) {
        if (!res.ok) throw new Error(json.error || 'bad status');
        return json;
      });
    });
  }

  /* ---------- Filters and the export link ---------- */

  function filterQuery() {
    var query = 'from=' + daysAgo(Number(rangeSelect.value)) + '&to=' + daysAgo(0);
    if (serviceSelect.value) query += '&service_id=' + encodeURIComponent(serviceSelect.value);
    return query;
  }

  // The CSV is a normal download from the server (the login cookie goes along)
  function updateExportLink() {
    byId('exportLink').href = '/api/admin/reports/export?' + filterQuery();
  }

  /* ---------- Drawing ---------- */

  function drawStats() {
    var s = report.status_breakdown;
    byId('statTotal').textContent = report.total_patients;
    byId('statCompleted').textContent = s.completed;
    byId('statLost').textContent = s.skipped + s.cancelled;
    byId('statWait').textContent = minutesText(report.avg_wait_minutes);
    byId('statService').textContent = minutesText(report.avg_service_minutes);
  }

  function drawTables() {
    var rows = byId('serviceRows');
    rows.textContent = '';
    report.by_service.forEach(function (s) {
      var tr = el('tr');
      [s.service_name, s.total, s.completed, s.skipped, s.cancelled, minutesText(s.avg_wait_minutes)].forEach(function (v) {
        tr.appendChild(el('td', '', String(v)));
      });
      rows.appendChild(tr);
    });

    var daily = byId('tableRows');
    daily.textContent = '';
    report.daily.forEach(function (d) {
      var tr = el('tr');
      tr.appendChild(el('td', '', shortDay(d.date)));
      tr.appendChild(el('td', '', String(d.patients)));
      tr.appendChild(el('td', '', minutesText(d.avg_wait_minutes)));
      daily.appendChild(tr);
    });
  }

  function drawCharts() {
    var text = cssColor('--cf-text-muted');
    var grid = cssColor('--cf-border');
    var surface = cssColor('--cf-surface');
    var bar = cssColor('--cf-accent-strong');
    var line = cssColor('--cf-waiting-fg') || bar;

    function axes(yTitle, integer) {
      return {
        x: { ticks: { color: text, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 }, grid: { display: false }, border: { color: grid } },
        y: { beginAtZero: true, title: { display: true, text: yTitle, color: text }, ticks: { color: text, precision: integer ? 0 : 1 }, grid: { color: grid }, border: { display: false } }
      };
    }
    function base(yTitle, integer) {
      return { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false } }, scales: axes(yTitle, integer) };
    }
    function make(key, canvasId, config) {
      if (charts[key]) charts[key].destroy();
      charts[key] = new Chart(byId(canvasId), config);
    }

    var labels = report.daily.map(function (d) { return shortDay(d.date); });

    make('tickets', 'ticketsChart', {
      type: 'bar',
      data: { labels: labels, datasets: [{ label: 'Patients', data: report.daily.map(function (d) { return d.patients; }), backgroundColor: bar, borderRadius: 4, maxBarThickness: 28 }] },
      options: base('Patients', true)
    });

    make('wait', 'waitChart', {
      type: 'line',
      data: { labels: labels, datasets: [{ label: 'Average wait (min)', data: report.daily.map(function (d) { return d.avg_wait_minutes; }), borderColor: line, backgroundColor: line, borderWidth: 2, pointRadius: report.daily.length > 31 ? 0 : 4, spanGaps: false, tension: 0 }] },
      options: base('Minutes', false)
    });

    // Peak hours: only the hours people actually joined in, plus a little around them
    var hours = report.peak_hours;
    var used = hours.filter(function (h) { return h.patients > 0; });
    var first = used.length ? Math.max(0, used[0].hour - 1) : 6;
    var last = used.length ? Math.min(23, used[used.length - 1].hour + 1) : 18;
    var shownHours = hours.filter(function (h) { return h.hour >= first && h.hour <= last; });
    make('peak', 'peakChart', {
      type: 'bar',
      data: { labels: shownHours.map(function (h) { return hourText(h.hour); }), datasets: [{ label: 'Patients', data: shownHours.map(function (h) { return h.patients; }), backgroundColor: bar, borderRadius: 4, maxBarThickness: 28 }] },
      options: base('Patients', true)
    });

    // Status breakdown: the same status colors used everywhere else in the app
    var statuses = [
      ['Completed', report.status_breakdown.completed, '--cf-completed-fg'],
      ['Waiting', report.status_breakdown.waiting, '--cf-waiting-fg'],
      ['Serving', report.status_breakdown.serving, '--cf-serving-bg'],
      ['Skipped', report.status_breakdown.skipped, '--cf-skipped-fg'],
      ['Cancelled', report.status_breakdown.cancelled, '--cf-cancelled-fg']
    ].filter(function (s) { return s[1] > 0; });
    var colors = statuses.map(function (s) { return cssColor(s[2]); });

    make('status', 'statusChart', {
      type: 'doughnut',
      data: { labels: statuses.map(function (s) { return s[0]; }), datasets: [{ data: statuses.map(function (s) { return s[1]; }), backgroundColor: colors, borderColor: surface, borderWidth: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, animation: false, cutout: '62%', plugins: { legend: { display: false } } }
    });

    // The legend is plain HTML so the numbers are readable without hovering
    var legend = byId('statusLegend');
    legend.textContent = '';
    statuses.forEach(function (s, i) {
      var item = el('li');
      var swatch = el('span', 'swatch');
      swatch.style.background = colors[i];
      item.appendChild(swatch);
      item.appendChild(el('span', '', s[0] + ': ' + s[1]));
      legend.appendChild(item);
    });
  }

  /* ---------- Loading ---------- */

  function load() {
    var mine = ++requestNumber;
    byId('loading').hidden = false;
    updateExportLink();

    return getJson('/api/admin/reports?' + filterQuery())
      .then(function (answer) {
        if (mine !== requestNumber) return;
        report = answer;
        byId('pageAlert').hidden = true;
        byId('loading').hidden = true;

        var empty = report.total_patients === 0;
        byId('noData').hidden = !empty;
        byId('content').hidden = empty;
        if (empty) return;

        drawStats();
        drawTables();
        if (window.Chart) {
          drawCharts();
        } else {
          byId('pageAlert').textContent = 'The charts could not load (no connection to the chart library). The numbers and tables are still correct.';
          byId('pageAlert').hidden = false;
        }
      })
      .catch(function (err) {
        if (err.message === 'not logged in' || err.message === 'not allowed' || mine !== requestNumber) return;
        byId('loading').hidden = true;
        byId('pageAlert').textContent = err.message === 'bad status'
          ? "Can't reach the server. Check your connection and try again." : err.message;
        byId('pageAlert').hidden = false;
      });
  }

  [rangeSelect, serviceSelect].forEach(function (select) {
    select.addEventListener('change', load);
  });
  byId('toolbar').addEventListener('submit', function (event) { event.preventDefault(); });

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
        .catch(function () { /* dates just use this device's time zone */ })
        .then(function () {
          updateClock();
          setInterval(updateClock, 30 * 1000);
          return getJson('/api/admin/services');
        })
        .then(function (result) {
          // A service filter only appears when there is more than one service
          if (result.services.length > 1) {
            result.services.forEach(function (s) {
              var option = el('option', '', s.service_name);
              option.value = String(s.service_id);
              serviceSelect.appendChild(option);
            });
            byId('serviceFilter').hidden = false;
          }
          return load();
        });
    })
    .catch(function () { /* redirects are already happening */ });
});
