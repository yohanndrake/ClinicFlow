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
  var PAGE_SIZE = 20;

  var userButton = document.getElementById('userButton');
  var userMenu = document.getElementById('userMenu');
  var rangeSelect = document.getElementById('range');
  var statusSelect = document.getElementById('status');
  var serviceSelect = document.getElementById('service');
  var searchInput = document.getElementById('search');
  var rows = document.getElementById('recordRows');
  var loadMore = document.getElementById('loadMore');

  var timeZone = undefined;   // the clinic's time zone, known after the board answers
  var page = 1;               // the page being shown
  var pages = 1;              // how many pages there are with the current filters
  var requestNumber = 0;      // lets us ignore an old answer if the filters changed meanwhile
  var searchTimer = null;

  var STATUS_NAMES = { waiting: 'Waiting', serving: 'Serving', completed: 'Completed', skipped: 'Skipped', cancelled: 'Cancelled' };

  /* Theme buttons */
  setTheme(startTheme);
  document.querySelectorAll('[data-theme-set]').forEach(function (button) {
    button.addEventListener('click', function () {
      setTheme(button.dataset.themeSet);
    });
  });

  /* ---------- Small helpers ---------- */

  function byId(id) {
    return document.getElementById(id);
  }

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

  // "Nina Ramos" -> "NR"
  function initials(name) {
    var words = String(name).trim().split(/\s+/);
    var letters = words[0].charAt(0) + (words.length > 1 ? words[words.length - 1].charAt(0) : '');
    return letters.toUpperCase();
  }

  // "2026-10-23" -> "Fri, Oct 23, 2026"  (already the clinic's day, so no time zone maths)
  function formatDay(isoDate) {
    var parts = String(isoDate).split('-');
    var day = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
    return day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  }

  function dateTimeText(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: timeZone
    });
  }

  function minutesText(minutes) {
    if (minutes === null || minutes === undefined) return '—';
    return Math.round(minutes) + ' min';
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

  /* ---------- Rows ---------- */

  function cell(label) {
    var td = el('td');
    td.dataset.label = label;
    return td;
  }

  function drawRow(t) {
    var row = el('tr');

    // The ticket number opens the details drawer
    var number = cell('Number');
    var link = el('button', 'row-link', t.ticket_label);
    link.type = 'button';
    link.addEventListener('click', function () { openDetails(t); });
    number.appendChild(link);

    var date = cell('Date');
    date.textContent = formatDay(t.queue_date);

    var name = cell('Name');
    name.textContent = t.display_name || '—';

    var status = cell('Status');
    status.appendChild(el('span', 'cf-badge cf-' + t.status, STATUS_NAMES[t.status] || capitalize(t.status)));

    var wait = cell('Wait time');
    wait.textContent = minutesText(t.wait_minutes);
    var service = cell('Service time');
    service.textContent = minutesText(t.service_minutes);

    [number, date, name, status, wait, service].forEach(function (c) { row.appendChild(c); });
    return row;
  }

  /* ---------- Loading a page of records ---------- */

  function buildUrl(pageNumber) {
    var query = [
      'page=' + pageNumber,
      'page_size=' + PAGE_SIZE,
      'from=' + daysAgo(Number(rangeSelect.value)),
      'to=' + daysAgo(0)
    ];
    if (statusSelect.value) query.push('status=' + encodeURIComponent(statusSelect.value));
    if (serviceSelect.value) query.push('service_id=' + encodeURIComponent(serviceSelect.value));
    if (searchInput.value.trim()) query.push('q=' + encodeURIComponent(searchInput.value.trim()));
    return '/api/staff/records?' + query.join('&');
  }

  // append = true adds to the list ("Load more"), otherwise the list is replaced
  function loadPage(pageNumber, append) {
    var mine = ++requestNumber;
    byId('loading').hidden = false;
    loadMore.disabled = true;

    return getJson(buildUrl(pageNumber))
      .then(function (data) {
        if (mine !== requestNumber) return; // filters changed while waiting
        page = data.page;
        pages = data.pages;

        if (!append) rows.textContent = '';
        data.tickets.forEach(function (t) { rows.appendChild(drawRow(t)); });

        var hasRows = rows.children.length > 0;
        byId('recordsTable').hidden = !hasRows;
        byId('empty').hidden = hasRows;
        loadMore.hidden = !(hasRows && page < pages);
        byId('pager').hidden = !(hasRows && pages > 1);
        byId('prevButton').disabled = page <= 1;
        byId('nextButton').disabled = page >= pages;
        byId('pageInfo').textContent = 'Page ' + page + ' of ' + pages;
        byId('pageAlert').hidden = true;
      })
      .catch(function (err) {
        if (err.message === 'not logged in' || err.message === 'not allowed') return;
        if (mine !== requestNumber) return;
        byId('pageAlert').textContent = err.message === 'bad status'
          ? "Can't reach the server. Check your connection and try again."
          : err.message;
        byId('pageAlert').hidden = false;
      })
      .then(function () {
        if (mine !== requestNumber) return;
        byId('loading').hidden = true;
        loadMore.disabled = false;
      });
  }

  [rangeSelect, statusSelect, serviceSelect].forEach(function (select) {
    select.addEventListener('change', function () { loadPage(1, false); });
  });

  // Search waits until typing pauses, so the server is not asked after every letter
  searchInput.addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { loadPage(1, false); }, 350);
  });
  byId('filters').addEventListener('submit', function (event) { event.preventDefault(); });

  loadMore.addEventListener('click', function () { loadPage(page + 1, true); });
  byId('prevButton').addEventListener('click', function () { loadPage(page - 1, false); });
  byId('nextButton').addEventListener('click', function () { loadPage(page + 1, false); });

  /* ---------- Ticket details drawer ---------- */

  document.querySelectorAll('[data-close]').forEach(function (button) {
    button.addEventListener('click', function () { button.closest('dialog').close(); });
  });

  function group(title, pairs) {
    var box = el('div', 'detail-group');
    if (title) box.appendChild(el('h3', '', title));
    var list = el('dl', 'detail-rows');
    pairs.forEach(function (pair) {
      var row = el('div');
      row.appendChild(el('dt', '', pair[0]));
      row.appendChild(el('dd', '', pair[1]));
      list.appendChild(row);
    });
    box.appendChild(list);
    return box;
  }

  function openDetails(t) {
    byId('detailsNumber').textContent = t.ticket_label;
    byId('detailsName').textContent = t.display_name || '';
    byId('detailsService').textContent = t.service_name || '';
    byId('detailsBody').textContent = '';
    byId('detailsLoading').hidden = false;
    byId('detailsDialog').showModal();

    getJson('/api/staff/tickets/' + t.ticket_id).then(function (result) {
      byId('detailsLoading').hidden = true;
      var d = result.ticket;
      var body = byId('detailsBody');
      byId('detailsName').textContent = d.display_name || '';
      byId('detailsService').textContent = d.service_name;

      body.appendChild(group('', [
        ['Status', STATUS_NAMES[d.status] || capitalize(d.status)],
        ['Priority', d.priority ? 'Yes' : '—'],
        ['Note', d.note || '—']
      ]));
      body.appendChild(group('Timestamps', [
        ['Taken', dateTimeText(d.queued_at)],
        ['Called', dateTimeText(d.called_at)],
        ['Completed', dateTimeText(d.completed_at)]
      ]));
      body.appendChild(group('Durations', [
        ['Wait time', minutesText(d.wait_minutes)],
        ['Service time', minutesText(d.service_minutes)]
      ]));
      body.appendChild(group('Status history', d.history.map(function (h) {
        var who = h.by_name ? ' · ' + h.by_name : '';
        var why = h.reason ? ' (' + h.reason + ')' : '';
        return [capitalize(h.action) + why, dateTimeText(h.changed_at) + who];
      })));
    }).catch(function (err) {
      if (err.message === 'not logged in' || err.message === 'not allowed') return;
      byId('detailsLoading').hidden = true;
      byId('detailsBody').appendChild(el('p', 'alert alert-error', "Can't load this ticket."));
    });
  }

  /* ---------- Start ---------- */

  getJson('/api/auth/me')
    .then(function (result) {
      var user = result.user;
      if (user.mustChangePassword) {
        window.location.replace('/force-password/force-password.html');
        return null;
      }
      if (user.role === 'patient') { window.location.replace('/patient/home.html'); return null; }
      if (user.role === 'admin') { window.location.replace('/admin/dashboard.html'); return null; }

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
          return getJson('/api/staff/services');
        })
        .then(function (result) {
          var services = result.services;
          byId('servicesLine').textContent = services.map(function (s) {
            return s.service_name + (s.counter_label ? ' · ' + s.counter_label : '');
          }).join('  |  ');

          // A service filter only appears when staff handle more than one service
          if (services.length > 1) {
            services.forEach(function (s) {
              var option = el('option', '', s.service_name);
              option.value = String(s.service_id);
              serviceSelect.appendChild(option);
            });
            byId('serviceFilter').hidden = false;
          }
          return loadPage(1, false);
        });
    })
    .catch(function () { /* redirects are already happening */ });
});
