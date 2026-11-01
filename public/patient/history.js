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
  var PAGE_SIZE = 10;

  var userButton = document.getElementById('userButton');
  var userMenu = document.getElementById('userMenu');
  var pageAlert = document.getElementById('pageAlert');
  var rangeSelect = document.getElementById('range');
  var statusSelect = document.getElementById('status');
  var serviceSelect = document.getElementById('service');
  var rows = document.getElementById('visitRows');
  var loadMore = document.getElementById('loadMore');

  var timeZone = undefined;   // the clinic's time zone, known after the board answers
  var page = 1;               // the page being shown
  var pages = 1;              // how many pages there are with the current filters
  var requestNumber = 0;      // lets us ignore an old answer if the filters changed meanwhile

  /* Theme buttons */
  setTheme(startTheme);
  document.querySelectorAll('[data-theme-set]').forEach(function (button) {
    button.addEventListener('click', function () {
      setTheme(button.dataset.themeSet);
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

  // "Maria Santos" -> "MS"
  function initials(name) {
    var words = String(name).trim().split(/\s+/);
    var letters = words[0].charAt(0) + (words.length > 1 ? words[words.length - 1].charAt(0) : '');
    return letters.toUpperCase();
  }

  // "2026-10-23" -> "Oct 23, 2026"  (already the clinic's day, so no time zone maths)
  function formatDay(isoDate) {
    var parts = String(isoDate).split('-');
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[Number(parts[1]) - 1] + ' ' + Number(parts[2]) + ', ' + parts[0];
  }

  function minutesText(minutes) {
    if (minutes === null || minutes === undefined) return '—';
    return Math.round(minutes) + ' min';
  }

  // The clinic's date, N days ago, as YYYY-MM-DD (used for the date range filter)
  function daysAgo(days) {
    var now = new Date();
    var parts = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric', month: '2-digit', day: '2-digit', timeZone: timeZone
    }).formatToParts(now);
    var map = {};
    parts.forEach(function (p) { map[p.type] = p.value; });
    var day = new Date(Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day)));
    day.setUTCDate(day.getUTCDate() - days);
    return day.toISOString().slice(0, 10);
  }

  function updateClock() {
    var now = new Date();
    document.getElementById('now').textContent =
      now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: timeZone }) +
      ', ' + now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: timeZone });
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
    if (event.key === 'Escape') {
      closeMenu();
      userButton.focus();
    }
  });

  document.getElementById('logoutButton').addEventListener('click', function () {
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

  function loadBell() {
    return getJson('/api/patient/notifications?limit=1').then(function (data) {
      var count = document.getElementById('bellCount');
      count.hidden = data.unread_count === 0;
      count.textContent = data.unread_count > 9 ? '9+' : String(data.unread_count);
      document.getElementById('bell').setAttribute('aria-label',
        data.unread_count ? 'Notifications, ' + data.unread_count + ' unread' : 'Notifications');
    });
  }

  /* ---------- Visit rows ---------- */

  function visitStatus(t) {
    if (t.expired) return { css: 'expired', label: 'Expired' };
    return { css: t.status, label: capitalize(t.status) };
  }

  function cell(label, className) {
    var td = el('td', className || '');
    td.dataset.label = label;
    return td;
  }

  function drawRow(t) {
    var status = visitStatus(t);
    var row = el('tr');

    var date = cell('Date');
    date.textContent = formatDay(t.queue_date);

    // The ticket number opens that visit's details
    var number = cell('Number', 'ticket-col');
    var link = el('button', 'row-link', t.ticket_label);
    link.type = 'button';
    link.addEventListener('click', function () { openDetail(t, status); });
    number.appendChild(link);

    var service = cell('Service');
    service.textContent = t.service_name;

    var statusCell = cell('Status');
    statusCell.appendChild(el('span', 'cf-badge cf-' + status.css, status.label));

    var wait = cell('Wait');
    wait.textContent = minutesText(t.wait_minutes);

    [date, number, service, statusCell, wait].forEach(function (c) { row.appendChild(c); });
    return row;
  }

  /* ---------- Visit detail ---------- */

  // Date and time in the clinic's time zone, or a dash when it never happened
  function dateTimeText(isoTimestamp) {
    if (!isoTimestamp) return '—';
    return new Date(isoTimestamp).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: timeZone
    });
  }

  function openDetail(t, status) {
    document.getElementById('detailTicket').textContent = t.ticket_label + ' · ' + t.service_name;

    var rowsBox = document.getElementById('detailRows');
    rowsBox.textContent = '';
    [
      ['Taken', dateTimeText(t.queued_at)],
      ['Called', dateTimeText(t.called_at)],
      ['Completed', dateTimeText(t.completed_at)],
      ['Status', status.label],
      ['Reason', t.status_reason || '—']
    ].forEach(function (pair) {
      var row = el('div');
      row.appendChild(el('dt', '', pair[0]));
      row.appendChild(el('dd', '', pair[1]));
      rowsBox.appendChild(row);
    });

    document.getElementById('detailDialog').showModal();
  }

  /* ---------- Loading a page of visits ---------- */

  function buildUrl(pageNumber) {
    var query = ['page=' + pageNumber, 'page_size=' + PAGE_SIZE];
    if (rangeSelect.value) query.push('from=' + daysAgo(Number(rangeSelect.value)));
    if (statusSelect.value) query.push('status=' + encodeURIComponent(statusSelect.value));
    if (serviceSelect.value) query.push('service_id=' + encodeURIComponent(serviceSelect.value));
    return '/api/patient/tickets/history?' + query.join('&');
  }

  function filtersInUse() {
    return !!(rangeSelect.value || statusSelect.value || serviceSelect.value);
  }

  // append = true adds to the list ("Load more"), otherwise the list is replaced
  function loadPage(pageNumber, append) {
    var mine = ++requestNumber;
    document.getElementById('loading').hidden = false;
    loadMore.disabled = true;

    return getJson(buildUrl(pageNumber))
      .then(function (data) {
        if (mine !== requestNumber) return; // filters changed while waiting
        page = data.page;
        pages = data.pages;

        if (!append) rows.textContent = '';
        data.tickets.forEach(function (t) { rows.appendChild(drawRow(t)); });

        var hasRows = rows.children.length > 0;
        document.getElementById('visitsTable').hidden = !hasRows;
        document.getElementById('empty').hidden = hasRows;
        loadMore.hidden = !(hasRows && page < pages);
        document.getElementById('pager').hidden = !(hasRows && pages > 1);
        document.getElementById('prevButton').disabled = page <= 1;
        document.getElementById('nextButton').disabled = page >= pages;
        document.getElementById('pageInfo').textContent = 'Page ' + page + ' of ' + pages;

        if (!hasRows) {
          var filtered = filtersInUse();
          document.getElementById('emptyTitle').textContent = filtered ? 'No matching visits' : 'No visits yet';
          document.getElementById('emptyText').textContent = filtered
            ? 'Try a different date range or status.'
            : 'When you take a queue number, your visits will show up here.';
          document.getElementById('emptyAction').hidden = filtered;
        }
        pageAlert.hidden = true;
      })
      .catch(function (err) {
        if (err.message === 'not logged in' || err.message === 'not allowed') return;
        if (mine !== requestNumber) return;
        pageAlert.textContent = "Can't reach the server. Check your connection and try again.";
        pageAlert.hidden = false;
      })
      .then(function () {
        if (mine !== requestNumber) return;
        document.getElementById('loading').hidden = true;
        loadMore.disabled = false;
      });
  }

  // Changing a filter starts again from page 1
  [rangeSelect, statusSelect, serviceSelect].forEach(function (select) {
    select.addEventListener('change', function () { loadPage(1, false); });
  });
  document.getElementById('filters').addEventListener('submit', function (event) { event.preventDefault(); });

  loadMore.addEventListener('click', function () { loadPage(page + 1, true); });
  document.getElementById('prevButton').addEventListener('click', function () { loadPage(page - 1, false); });
  document.getElementById('nextButton').addEventListener('click', function () { loadPage(page + 1, false); });

  /* ---------- Service filter (only when there is more than one service) ---------- */

  function loadServiceFilter() {
    return getJson('/api/patient/services').then(function (data) {
      if (data.services.length < 2) return;
      data.services.forEach(function (s) {
        var option = el('option', '', s.service_name);
        option.value = String(s.service_id);
        serviceSelect.appendChild(option);
      });
      document.getElementById('serviceFilter').hidden = false;
    });
  }

  /* ---------- Start ---------- */

  getJson('/api/auth/me')
    .then(function (data) {
      var user = data.user;
      if (user.mustChangePassword) {
        window.location.replace('/force-password/force-password.html');
        return null;
      }
      if (user.role === 'staff') { window.location.replace('/staff/console.html'); return null; }
      if (user.role === 'admin') { window.location.replace('/admin/dashboard.html'); return null; }

      document.getElementById('headerName').textContent = user.name;
      document.getElementById('headerInitials').textContent = initials(user.name);

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
          return Promise.all([loadPage(1, false), loadServiceFilter(), loadBell()]);
        });
    })
    .catch(function () { /* redirects are already happening or the page still shows an error */ });
});
