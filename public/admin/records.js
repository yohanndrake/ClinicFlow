//admin/records.js - admin records script, search all tickets, details, edit, delete and restore
document.addEventListener('DOMContentLoaded', function () {
  var PAGE_SIZE = 20;

  var userMenu = document.getElementById('userMenu');
  var fromInput = document.getElementById('from');
  var toInput = document.getElementById('to');
  var statusSelect = document.getElementById('status');
  var serviceSelect = document.getElementById('service');
  var searchInput = document.getElementById('search');
  var showDeleted = document.getElementById('showDeleted');
  var rows = document.getElementById('rows');
  var loadMore = document.getElementById('loadMore');

  var timeZone = undefined;
  var page = 1;
  var pages = 1;
  var requestNumber = 0;
  var searchTimer = null;
  var toastTimer = null;
  var current = null;

  var STATUS_NAMES = { waiting: 'Waiting', serving: 'Serving', completed: 'Completed', skipped: 'Skipped', cancelled: 'Cancelled' };

  function formatDay(isoDate) {
    var parts = String(isoDate).slice(0, 10).split('-');
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

  function toast(message, isError) {
    var box = byId('toast');
    box.textContent = message;
    box.className = 'toast' + (isError ? ' is-error' : '');
    box.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { box.hidden = true; }, 4000);
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

  function showAlert(id, message) {
    byId(id).textContent = message;
    byId(id).hidden = false;
  }

  function filterQuery() {
    var query = ['from=' + fromInput.value, 'to=' + toInput.value, 'deleted=' + (showDeleted.checked ? 'include' : 'exclude')];
    if (statusSelect.value) query.push('status=' + encodeURIComponent(statusSelect.value));
    if (serviceSelect.value) query.push('service_id=' + encodeURIComponent(serviceSelect.value));
    if (searchInput.value.trim()) query.push('q=' + encodeURIComponent(searchInput.value.trim()));
    return query.join('&');
  }

  function rangeIsValid() {
    var bad = !fromInput.value || !toInput.value || fromInput.value > toInput.value;
    byId('rangeError').textContent = bad ? 'Pick a start date that is not after the end date.' : '';
    byId('rangeError').hidden = !bad;
    return !bad;
  }

  function drawRow(t) {
    var row = el('tr', t.is_deleted ? 'is-inactive' : '');

    function cell(label, className) {
      var td = el('td', className || '');
      td.dataset.label = label;
      row.appendChild(td);
      return td;
    }

    var link = el('button', 'row-link', t.ticket_label);
    link.type = 'button';
    link.addEventListener('click', function () { openDetails(t); });
    cell('Number', 'name-col').appendChild(link);

    cell('Date').textContent = formatDay(t.queue_date);
    cell('Name').textContent = t.display_name || '—';
    cell('Service').textContent = t.service_name;

    var status = cell('Status');
    if (t.is_deleted) status.appendChild(el('span', 'cf-badge cf-cancelled', 'Deleted'));
    else status.appendChild(el('span', 'cf-badge ' + statusClass(t.status), STATUS_NAMES[t.status] || capitalize(t.status)));

    cell('Wait time').textContent = minutesText(t.wait_minutes);
    cell('Service time').textContent = minutesText(t.service_minutes);

    var actions = el('div', 'row-actions');
    if (t.is_deleted) addButton(actions, 'Restore', 'solid', function () { restoreTicket(t); });
    else addButton(actions, 'Details', '', function () { openDetails(t); });
    cell('Actions', 'actions-col').appendChild(actions);
    return row;
  }

  function loadPage(pageNumber, append) {
    if (!rangeIsValid()) return Promise.resolve();

    var mine = ++requestNumber;
    byId('loading').hidden = false;
    loadMore.disabled = true;

    return send('GET', '/api/admin/tickets?page=' + pageNumber + '&page_size=' + PAGE_SIZE + '&' + filterQuery())
      .then(function (result) {
        if (mine !== requestNumber) return;
        if (result.status !== 200) throw new Error(result.data.error || 'bad status');
        var data = result.data;
        page = data.page;
        pages = data.pages;

        if (!append) rows.textContent = '';
        data.tickets.forEach(function (t) { rows.appendChild(drawRow(t)); });

        var hasRows = rows.children.length > 0;
        byId('table').hidden = !hasRows;
        byId('empty').hidden = hasRows;
        loadMore.hidden = !(hasRows && page < pages);
        byId('pager').hidden = !(hasRows && pages > 1);
        byId('prevButton').disabled = page <= 1;
        byId('nextButton').disabled = page >= pages;
        byId('pageInfo').textContent = 'Page ' + page + ' of ' + pages;
        byId('pageAlert').hidden = true;
      })
      .catch(function (err) {
        if (err.message === 'not logged in' || err.message === 'not allowed' || mine !== requestNumber) return;
        showAlert('pageAlert', err.message === 'bad status' || err.message === 'Failed to fetch'
          ? "Can't reach the server. Check your connection and try again."
          : err.message);
      })
      .then(function () {
        if (mine !== requestNumber) return;
        byId('loading').hidden = true;
        loadMore.disabled = false;
      });
  }

  function reload() {
    return loadPage(1, false);
  }

  [fromInput, toInput, statusSelect, serviceSelect, showDeleted].forEach(function (control) {
    control.addEventListener('change', reload);
  });

  searchInput.addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(reload, 350);
  });
  byId('filters').addEventListener('submit', function (event) { event.preventDefault(); });

  loadMore.addEventListener('click', function () { loadPage(page + 1, true); });
  byId('prevButton').addEventListener('click', function () { loadPage(page - 1, false); });
  byId('nextButton').addEventListener('click', function () { loadPage(page + 1, false); });

  document.querySelectorAll('[data-close]').forEach(function (button) {
    button.addEventListener('click', function () { button.closest('dialog').close(); });
  });

  function fillDetails(d) {
    current = d;
    var body = byId('detailsBody');
    body.textContent = '';
    byId('detailsNumber').textContent = d.ticket_label;
    byId('detailsName').textContent = d.display_name || '';
    byId('detailsService').textContent = d.service_name;

    body.appendChild(group('', [
      ['Status', d.is_deleted ? 'Deleted' : (STATUS_NAMES[d.status] || capitalize(d.status))],
      ['Priority', d.priority ? 'Yes' : '—'],
      ['Note', d.note || '—'],
      ['Staff', d.staff_name || '—']
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

    byId('editForm').hidden = !!d.is_deleted;
    byId('deleteButton').hidden = !!d.is_deleted;
    byId('restoreButton').hidden = !d.is_deleted;

    byId('eStatus').value = d.status;
    byId('eNote').value = d.note || '';
    byId('ePriority').checked = !!d.priority;
    byId('eReason').value = '';
    byId('eName').value = d.walk_in_name || '';
    byId('eNameField').hidden = !d.walk_in_name;
    byId('editAlert').hidden = true;
    byId('eNameError').hidden = true;
    byId('eName').classList.remove('is-error');
  }

  function openDetails(t) {
    current = null;
    byId('detailsNumber').textContent = t.ticket_label;
    byId('detailsName').textContent = t.display_name || '';
    byId('detailsService').textContent = t.service_name || '';
    byId('detailsBody').textContent = '';
    byId('editForm').hidden = true;
    byId('deleteButton').hidden = true;
    byId('restoreButton').hidden = true;
    byId('detailsLoading').hidden = false;
    byId('detailsDialog').showModal();
    loadDetails(t.ticket_id);
  }

  function loadDetails(ticketId) {
    return send('GET', '/api/admin/tickets/' + ticketId).then(function (result) {
      byId('detailsLoading').hidden = true;
      if (result.status !== 200) throw new Error('bad status');
      fillDetails(result.data.ticket);
    }).catch(function (err) {
      if (err.message === 'not logged in' || err.message === 'not allowed') return;
      byId('detailsLoading').hidden = true;
      byId('detailsBody').appendChild(el('p', 'alert alert-error', "Can't load this ticket."));
    });
  }

  byId('editForm').addEventListener('submit', function (event) {
    event.preventDefault();
    if (!current) return;
    byId('editAlert').hidden = true;
    byId('eNameError').hidden = true;
    byId('eName').classList.remove('is-error');

    var body = {
      status: byId('eStatus').value,
      note: byId('eNote').value.trim(),
      priority: byId('ePriority').checked,
      reason: byId('eReason').value.trim()
    };
    if (current.walk_in_name) {
      body.walk_in_name = byId('eName').value.trim();
      if (!body.walk_in_name) {
        byId('eName').classList.add('is-error');
        byId('eNameError').textContent = 'Name cannot be empty.';
        byId('eNameError').hidden = false;
        byId('eName').focus();
        return;
      }
    }

    byId('editSave').disabled = true;
    var ticketId = current.ticket_id;
    send('PATCH', '/api/admin/tickets/' + ticketId, body)
      .then(function (result) {
        if (result.status !== 200) {
          showAlert('editAlert', result.data.error || 'Something went wrong.');
          return;
        }
        toast('Ticket updated');
        return loadDetails(ticketId).then(reload);
      })
      .catch(function (err) {
        if (err.message !== 'not logged in' && err.message !== 'not allowed') showAlert('editAlert', "Can't reach the server.");
      })
      .then(function () { byId('editSave').disabled = false; });
  });

  byId('deleteButton').addEventListener('click', function () {
    if (!current) return;
    byId('deleteText').textContent = 'Delete ' + current.ticket_label + (current.display_name ? ' (' + current.display_name + ')' : '') + '?';
    byId('dReason').value = '';
    byId('dReason').classList.remove('is-error');
    byId('dReasonError').hidden = true;
    byId('deleteAlert').hidden = true;
    byId('deleteDialog').showModal();
    byId('dReason').focus();
  });

  byId('deleteForm').addEventListener('submit', function (event) {
    event.preventDefault();
    if (!current) return;
    var reason = byId('dReason').value.trim();
    if (!reason) {
      byId('dReason').classList.add('is-error');
      byId('dReasonError').textContent = 'Please give a reason.';
      byId('dReasonError').hidden = false;
      byId('dReason').focus();
      return;
    }

    byId('deleteConfirm').disabled = true;
    send('DELETE', '/api/admin/tickets/' + current.ticket_id, { reason: reason })
      .then(function (result) {
        if (result.status !== 200) {
          showAlert('deleteAlert', result.data.error || 'Something went wrong.');
          return;
        }
        byId('deleteDialog').close();
        byId('detailsDialog').close();
        toast('Ticket deleted');
        return reload();
      })
      .catch(function (err) {
        if (err.message !== 'not logged in' && err.message !== 'not allowed') showAlert('deleteAlert', "Can't reach the server.");
      })
      .then(function () { byId('deleteConfirm').disabled = false; });
  });

  function restoreTicket(t) {
    return send('POST', '/api/admin/tickets/' + t.ticket_id + '/restore')
      .then(function (result) {
        if (result.status === 200) toast(t.ticket_label + ' restored');
        else toast(result.data.error || 'Something went wrong.', true);
        return reload();
      })
      .catch(function (err) {
        if (err.message !== 'not logged in' && err.message !== 'not allowed') toast("Can't reach the server.", true);
      });
  }

  byId('restoreButton').addEventListener('click', function () {
    if (!current) return;
    restoreTicket(current).then(function () { byId('detailsDialog').close(); });
  });

  send('GET', '/api/auth/me')
    .then(function (result) {
      var user = result.data.user;
      if (!user) return null;
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

          fromInput.value = daysAgo(6);
          toInput.value = daysAgo(0);
          return send('GET', '/api/admin/services');
        })
        .then(function (result) {
          var services = result.data.services || [];
          if (services.length > 1) {
            services.forEach(function (s) {
              var option = el('option', '', s.service_name);
              option.value = String(s.service_id);
              serviceSelect.appendChild(option);
            });
            byId('serviceFilter').hidden = false;
          }
          return reload();
        });
    })
    .catch(function () { });
});
