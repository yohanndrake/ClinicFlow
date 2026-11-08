//admin/dashboard.js - dashboard script, stat tiles, live services and charts of patients and average wait, refreshes every 15 seconds
document.addEventListener('DOMContentLoaded', function () {
  var REFRESH_SECONDS = 15;

  var userMenu = document.getElementById('userMenu');

  var timeZone = undefined;
  var range = 'today';
  var data = null;
  var ticketsChart = null;
  var waitChart = null;

  function minutesText(minutes) {
    return minutes === null || minutes === undefined ? '—' : Math.round(minutes) + ' min';
  }

  function updateClock() {
    byId('clock').textContent = new Date().toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZone: timeZone
    });
  }

  document.addEventListener('click', function (event) {
    if (!userMenu.contains(event.target)) closeMenu();
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeMenu();
  });

  byId('logoutButton').addEventListener('click', function () {
    fetch('/api/auth/logout', { method: 'POST' })
      .catch(function () { })
      .then(function () { window.location.href = '/login/login.html'; });
  });

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

  function drawCharts() {
    var labels = data.daily.map(function (d) { return shortDay(d.date); });
    var patients = data.daily.map(function (d) { return d.patients; });
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
        .catch(function () { })
        .then(function () {
          updateClock();

          setInterval(updateClock, 30 * 1000);
          return load();
        })
        .then(function () {
          setInterval(load, REFRESH_SECONDS * 1000);
        });
    })
    .catch(function () { });
});
