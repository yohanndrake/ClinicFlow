//patient/history.js - visit history script, filters by date, status and service, paging and ticket details
document.addEventListener('DOMContentLoaded', function () {
  var PAGE_SIZE = 10;

  var pageAlert = document.getElementById('pageAlert');
  var rangeSelect = document.getElementById('range');
  var statusSelect = document.getElementById('status');
  var serviceSelect = document.getElementById('service');
  var rows = document.getElementById('visitRows');
  var loadMore = document.getElementById('loadMore');

  var timeZone = undefined;
  var page = 1;
  var pages = 1;
  var requestNumber = 0;

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

  function loadPage(pageNumber, append) {
    var mine = ++requestNumber;
    document.getElementById('loading').hidden = false;
    loadMore.disabled = true;

    return getJson(buildUrl(pageNumber))
      .then(function (data) {
        if (mine !== requestNumber) return;
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

  [rangeSelect, statusSelect, serviceSelect].forEach(function (select) {
    select.addEventListener('change', function () { loadPage(1, false); });
  });
  document.getElementById('filters').addEventListener('submit', function (event) { event.preventDefault(); });

  loadMore.addEventListener('click', function () { loadPage(page + 1, true); });
  document.getElementById('prevButton').addEventListener('click', function () { loadPage(page - 1, false); });
  document.getElementById('nextButton').addEventListener('click', function () { loadPage(page + 1, false); });

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
        .catch(function () { })
        .then(function () {
          updateClock();

          setInterval(updateClock, 30 * 1000);

          return Promise.all([loadPage(1, false), loadServiceFilter(), loadBell()]);
        });
    })
    .catch(function () { });
});
