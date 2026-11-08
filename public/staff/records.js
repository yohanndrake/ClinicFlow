//staff/records.js - staff records script, read only search of past tickets with filters, paging and details
document.addEventListener('DOMContentLoaded', function () {
  var PAGE_SIZE = 20;

  var userMenu = document.getElementById('userMenu');
  var rangeSelect = document.getElementById('range');
  var statusSelect = document.getElementById('status');
  var serviceSelect = document.getElementById('service');
  var searchInput = document.getElementById('search');
  var rows = document.getElementById('recordRows');
  var loadMore = document.getElementById('loadMore');

  var timeZone = undefined;
  var page = 1;
  var pages = 1;
  var requestNumber = 0;
  var searchTimer = null;

  var STATUS_NAMES = { waiting: 'Waiting', serving: 'Serving', completed: 'Completed', skipped: 'Skipped', cancelled: 'Cancelled' };

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

  function cell(label) {
    var td = el('td');
    td.dataset.label = label;
    return td;
  }

  function drawRow(t) {
    var row = el('tr');

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

  function loadPage(pageNumber, append) {
    var mine = ++requestNumber;
    byId('loading').hidden = false;
    loadMore.disabled = true;

    return getJson(buildUrl(pageNumber))
      .then(function (data) {
        if (mine !== requestNumber) return;
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

  searchInput.addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { loadPage(1, false); }, 350);
  });
  byId('filters').addEventListener('submit', function (event) { event.preventDefault(); });

  loadMore.addEventListener('click', function () { loadPage(page + 1, true); });
  byId('prevButton').addEventListener('click', function () { loadPage(page - 1, false); });
  byId('nextButton').addEventListener('click', function () { loadPage(page + 1, false); });

  document.querySelectorAll('[data-close]').forEach(function (button) {
    button.addEventListener('click', function () { button.closest('dialog').close(); });
  });

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
        .catch(function () { })
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
    .catch(function () { });
});
