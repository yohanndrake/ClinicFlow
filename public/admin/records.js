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
  var fromInput = document.getElementById('from');
  var toInput = document.getElementById('to');
  var statusSelect = document.getElementById('status');
  var serviceSelect = document.getElementById('service');
  var searchInput = document.getElementById('search');
  var showDeleted = document.getElementById('showDeleted');
  var rows = document.getElementById('rows');
  var loadMore = document.getElementById('loadMore');

  var timeZone = undefined;   // the clinic's time zone, known after the board answers
  var page = 1;               // the page being shown
  var pages = 1;              // how many pages there are with the current filters
  var requestNumber = 0;      // lets us ignore an old answer if the filters changed meanwhile
  var searchTimer = null;
  var toastTimer = null;
  var current = null;         // the ticket open in the details drawer

  var STATUS_NAMES = { waiting: 'Waiting', serving: 'Serving', completed: 'Completed', skipped: 'Skipped', cancelled: 'Cancelled' };

  function byId(id) {
    return document.getElementById(id);
  }

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

  // "Clinic Admin" -> "CA"
  function initials(name) {
    var words = String(name).trim().split(/\s+/);
    var letters = words[0].charAt(0) + (words.length > 1 ? words[words.length - 1].charAt(0) : '');
    return letters.toUpperCase();
  }

  // "2026-10-23" -> "Fri, Oct 23, 2026"  (already the clinic's day, so no time zone maths)
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

  function toast(message, isError) {
    var box = byId('toast');
    box.textContent = message;
    box.className = 'toast' + (isError ? ' is-error' : '');
    box.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { box.hidden = true; }, 4000);
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

  // Sends a request and resolves to { status, data }. A logged-out person goes to the login page.
  function send(method, url, body) {
    var options = { method: method, cache: 'no-store' };
    if (body !== undefined) {
      options.headers = { 'Content-Type': 'application/json' };
      options.body = JSON.stringify(body);
    }
    return fetch(url, options).then(function (res) {
      if (res.status === 401) {
        window.location.replace('/login/login.html');
        throw new Error('not logged in');
      }
      if (res.status === 403) {
        window.location.replace('/error/error.html?code=403');
        throw new Error('not allowed');
      }
      return res.json().catch(function () { return {}; }).then(function (json) {
        return { status: res.status, data: json };
      });
    });
  }

  function showAlert(id, message) {
    byId(id).textContent = message;
    byId(id).hidden = false;
  }

  /* ---------- Filters ---------- */

  // The part of the address that says which records we want (also used by Export CSV)
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
    byId('exportLink').classList.toggle('is-disabled', bad);
    return !bad;
  }

  function updateExportLink() {
    byId('exportLink').href = '/api/admin/tickets/export?' + filterQuery();
  }

  /* ---------- Rows ---------- */

  function addButton(box, label, className, onClick) {
    var button = el('button', 'link-button' + (className ? ' ' + className : ''), label);
    button.type = 'button';
    button.addEventListener('click', onClick);
    box.appendChild(button);
  }

  function drawRow(t) {
    var row = el('tr', t.is_deleted ? 'is-inactive' : '');

    function cell(label, className) {
      var td = el('td', className || '');
      td.dataset.label = label;
      row.appendChild(td);
      return td;
    }

    // The ticket number opens the details drawer
    var link = el('button', 'row-link', t.ticket_label);
    link.type = 'button';
    link.addEventListener('click', function () { openDetails(t); });
    cell('Number', 'name-col').appendChild(link);

    cell('Date').textContent = formatDay(t.queue_date);
    cell('Name').textContent = t.display_name || '—';
    cell('Service').textContent = t.service_name;

    var status = cell('Status');
    if (t.is_deleted) status.appendChild(el('span', 'cf-badge cf-inactive', 'Deleted'));
    else status.appendChild(el('span', 'cf-badge cf-' + t.status, STATUS_NAMES[t.status] || capitalize(t.status)));

    cell('Wait time').textContent = minutesText(t.wait_minutes);
    cell('Service time').textContent = minutesText(t.service_minutes);

    var actions = el('div', 'row-actions');
    if (t.is_deleted) addButton(actions, 'Restore', 'solid', function () { restoreTicket(t); });
    else addButton(actions, 'Details', '', function () { openDetails(t); });
    cell('Actions', 'actions-col').appendChild(actions);
    return row;
  }

  /* ---------- Loading a page of records ---------- */

  // append = true adds to the list ("Load more"), otherwise the list is replaced
  function loadPage(pageNumber, append) {
    updateExportLink();
    if (!rangeIsValid()) return Promise.resolve();

    var mine = ++requestNumber;
    byId('loading').hidden = false;
    loadMore.disabled = true;

    return send('GET', '/api/admin/tickets?page=' + pageNumber + '&page_size=' + PAGE_SIZE + '&' + filterQuery())
      .then(function (result) {
        if (mine !== requestNumber) return; // filters changed while waiting
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

  // Search waits until typing pauses, so the server is not asked after every letter
  searchInput.addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(reload, 350);
  });
  byId('filters').addEventListener('submit', function (event) { event.preventDefault(); });

  byId('exportLink').addEventListener('click', function (event) {
    if (!rangeIsValid()) event.preventDefault();
  });

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

    // The edit form is for tickets that are not deleted; deleted ones can only be restored
    byId('editForm').hidden = !!d.is_deleted;
    byId('deleteButton').hidden = !!d.is_deleted;
    byId('restoreButton').hidden = !d.is_deleted;

    byId('eStatus').value = d.status;
    byId('eNote').value = d.note || '';
    byId('ePriority').checked = !!d.priority;
    byId('eReason').value = '';
    byId('eName').value = d.walk_in_name || '';
    byId('eNameField').hidden = !d.walk_in_name; // only walk-ins have an editable name
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

  // Save changes to status / note / priority / walk-in name
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

  /* ---------- Delete and restore ---------- */

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

  /* ---------- Start ---------- */

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
        .catch(function () { /* dates just use this device's time zone */ })
        .then(function () {
          updateClock();
          setInterval(updateClock, 30 * 1000);

          // Start with the last 7 days (today and the six before)
          fromInput.value = daysAgo(6);
          toInput.value = daysAgo(0);
          return send('GET', '/api/admin/services');
        })
        .then(function (result) {
          var services = result.data.services || [];
          // A service filter only appears when there is more than one service
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
    .catch(function () { /* redirects are already happening */ });
});
