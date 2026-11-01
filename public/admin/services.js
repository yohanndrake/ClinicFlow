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
  var searchInput = document.getElementById('search');

  var timeZone = undefined;   // the clinic's time zone, known after the board answers
  var services = [];          // the latest list
  var staffList = [];         // active staff accounts, for the "Assigned staff" picker
  var editing = null;         // the service being edited, or null when adding
  var toastTimer = null;
  var searchTimer = null;

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
    toastTimer = setTimeout(function () { box.hidden = true; }, 4500);
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

  /* ---------- Dialog helpers ---------- */

  function openDialog(id) {
    var dialog = byId(id);
    dialog.querySelectorAll('.alert, .cf-error').forEach(function (node) { node.hidden = true; });
    dialog.querySelectorAll('.is-error').forEach(function (node) { node.classList.remove('is-error'); });
    dialog.showModal();
  }

  document.querySelectorAll('[data-close]').forEach(function (button) {
    button.addEventListener('click', function () { button.closest('dialog').close(); });
  });

  function fieldError(inputId, message) {
    var input = byId(inputId);
    input.classList.add('is-error');
    var box = byId(inputId + 'Error');
    box.textContent = message;
    box.hidden = false;
    return input;
  }

  /* ---------- The list ---------- */

  function addButton(box, label, className, onClick) {
    var button = el('button', 'link-button' + (className ? ' ' + className : ''), label);
    button.type = 'button';
    button.addEventListener('click', onClick);
    box.appendChild(button);
  }

  function drawRow(s) {
    var row = el('tr', s.is_active ? '' : 'is-inactive');

    function cell(label, text, className) {
      var td = el('td', className || '', text);
      td.dataset.label = label;
      row.appendChild(td);
      return td;
    }

    cell('Service', s.service_name, 'name-col');
    cell('Prefix', s.prefix);
    cell('Avg service time', s.avg_service_minutes + ' min');
    cell('Hours', formatTime(s.open_time) + ' - ' + formatTime(s.close_time));
    cell('Daily limit', s.daily_limit === null ? '—' : String(s.daily_limit));
    var status = cell('Status', '');
    status.appendChild(el('span', 'cf-badge ' + (s.is_active ? 'cf-active' : 'cf-inactive'), s.is_active ? 'Active' : 'Inactive'));
    cell('Staff count', String(s.staff_count));

    var actionsCell = el('td', 'actions-col');
    var actions = el('div', 'row-actions');
    addButton(actions, 'Edit', '', function () { openForm(s); });
    if (s.is_active) addButton(actions, 'Deactivate', 'danger', function () { openConfirm(s); });
    else addButton(actions, 'Activate', 'solid', function () { activate(s); });
    actionsCell.appendChild(actions);
    row.appendChild(actionsCell);
    return row;
  }

  function drawList() {
    var rows = byId('rows');
    rows.textContent = '';
    services.forEach(function (s) { rows.appendChild(drawRow(s)); });
    byId('table').hidden = services.length === 0;
    byId('empty').hidden = services.length > 0;
  }

  function load() {
    var q = searchInput.value.trim();
    return send('GET', '/api/admin/services' + (q ? '?q=' + encodeURIComponent(q) : ''))
      .then(function (result) {
        if (result.status !== 200) throw new Error(result.data.error || 'bad status');
        services = result.data.services;
        byId('loading').hidden = true;
        byId('pageAlert').hidden = true;
        drawList();
      })
      .catch(function (err) {
        if (err.message === 'not logged in' || err.message === 'not allowed') return;
        byId('loading').hidden = true;
        byId('pageAlert').textContent = "Can't load services. Check your connection and try again.";
        byId('pageAlert').hidden = false;
      });
  }

  // Search waits until typing pauses
  searchInput.addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(load, 300);
  });
  byId('toolbar').addEventListener('submit', function (event) { event.preventDefault(); });

  /* ---------- Add / edit form ---------- */

  // One row per staff account: a tick box and the counter name
  function drawPicker(service) {
    var picker = byId('staffPicker');
    picker.textContent = '';
    if (!staffList.length) {
      picker.appendChild(el('p', 'muted', 'No active staff accounts yet. Add staff on the Users page.'));
      return;
    }
    staffList.forEach(function (staff) {
      var assigned = service && service.staff.filter(function (a) { return a.staff_id === staff.id; })[0];
      var row = el('div', 'picker-row');

      var label = el('label', 'check-row');
      var box = el('input');
      box.type = 'checkbox';
      box.dataset.staffId = String(staff.id);
      box.checked = !!assigned;
      label.appendChild(box);
      label.appendChild(document.createTextNode(' ' + staff.full_name));
      row.appendChild(label);

      var counter = el('input', 'cf-input');
      counter.type = 'text';
      counter.maxLength = 30;
      counter.placeholder = 'Counter, e.g. Room 1';
      counter.value = assigned ? assigned.counter_label : '';
      counter.setAttribute('aria-label', 'Counter for ' + staff.full_name);
      counter.dataset.counterFor = String(staff.id);
      row.appendChild(counter);

      picker.appendChild(row);
    });
  }

  function openForm(service) {
    editing = service || null;
    byId('serviceTitle').textContent = service ? 'Edit Service' : 'Add Service';
    byId('fName').value = service ? service.service_name : '';
    byId('fPrefix').value = service ? service.prefix : '';
    byId('fDescription').value = service && service.description ? service.description : '';
    byId('fMinutes').value = service ? service.avg_service_minutes : 10;
    byId('fLimit').value = service && service.daily_limit !== null ? service.daily_limit : '';
    byId('fOpen').value = service ? String(service.open_time).slice(0, 5) : '08:00';
    byId('fClose').value = service ? String(service.close_time).slice(0, 5) : '17:00';
    byId('fActive').checked = service ? service.is_active : true;
    drawPicker(service);
    openDialog('serviceDialog');
    byId('fName').focus();
  }

  byId('addService').addEventListener('click', function () { openForm(null); });

  byId('serviceForm').addEventListener('submit', function (event) {
    event.preventDefault();
    openDialogReset();

    var name = byId('fName').value.trim();
    var prefix = byId('fPrefix').value.trim().toUpperCase();
    var minutes = Number(byId('fMinutes').value);
    var limit = byId('fLimit').value.trim();
    var open = byId('fOpen').value;
    var close = byId('fClose').value;
    var firstBad = null;

    function bad(inputId, message) {
      var input = fieldError(inputId, message);
      if (!firstBad) firstBad = input;
    }

    // The same rules the server checks, so people see the problem before sending
    if (!name) bad('fName', 'Name is required.');
    if (!/^[A-Z]{1,3}$/.test(prefix)) bad('fPrefix', 'Use 1 to 3 letters.');
    if (!Number.isInteger(minutes) || minutes < 1) bad('fMinutes', 'Enter a whole number of 1 or more.');
    if (limit !== '' && (!/^\d+$/.test(limit) || Number(limit) < 1)) bad('fLimit', 'Leave empty or enter a whole number of 1 or more.');
    if (!open) bad('fOpen', 'Enter an opening time.');
    if (!close) bad('fClose', 'Enter a closing time.');
    if (open && close && open >= close) bad('fClose', 'Closing time must be after opening time.');
    if (firstBad) {
      firstBad.focus();
      return;
    }

    // Ticked staff, with their counter names
    var staff = [];
    byId('staffPicker').querySelectorAll('input[type="checkbox"]').forEach(function (box) {
      if (!box.checked) return;
      var counter = byId('staffPicker').querySelector('[data-counter-for="' + box.dataset.staffId + '"]');
      staff.push({ staff_id: Number(box.dataset.staffId), counter_label: counter.value.trim() });
    });

    var body = {
      service_name: name, prefix: prefix, description: byId('fDescription').value.trim(),
      avg_service_minutes: minutes, daily_limit: limit === '' ? null : Number(limit),
      open_time: open, close_time: close, is_active: byId('fActive').checked, staff: staff
    };

    byId('saveButton').disabled = true;
    var request = editing
      ? send('PATCH', '/api/admin/services/' + editing.service_id, body)
      : send('POST', '/api/admin/services', body);

    request
      .then(function (result) {
        if (result.status === 200 || result.status === 201) {
          byId('serviceDialog').close();
          toast(editing ? 'Service updated' : 'Service added');
          return load();
        }
        var message = result.data.error || 'Something went wrong.';
        if (result.status === 409) fieldError('fPrefix', message);
        else showFormAlert(message);
      })
      .catch(function (err) { if (err.message !== 'not logged in') showFormAlert("Can't reach the server."); })
      .then(function () { byId('saveButton').disabled = false; });
  });

  function openDialogReset() {
    byId('serviceDialog').querySelectorAll('.alert, .cf-error').forEach(function (node) { node.hidden = true; });
    byId('serviceDialog').querySelectorAll('.is-error').forEach(function (node) { node.classList.remove('is-error'); });
  }

  function showFormAlert(message) {
    byId('formAlert').textContent = message;
    byId('formAlert').hidden = false;
  }

  /* ---------- Deactivate / activate ---------- */

  var confirmTarget = null;

  function openConfirm(service) {
    confirmTarget = service;
    byId('confirmText').textContent = 'Deactivate ' + service.service_name + '?';
    openDialog('confirmDialog');
  }

  byId('confirmForm').addEventListener('submit', function (event) {
    event.preventDefault();
    if (!confirmTarget) return;
    byId('confirmButton').disabled = true;
    send('DELETE', '/api/admin/services/' + confirmTarget.service_id)
      .then(function (result) {
        if (result.status === 200) {
          byId('confirmDialog').close();
          toast('Service deactivated');
          return load();
        }
        byId('confirmAlert').textContent = result.data.error || 'Something went wrong.';
        byId('confirmAlert').hidden = false;
      })
      .catch(function (err) {
        if (err.message === 'not logged in') return;
        byId('confirmAlert').textContent = "Can't reach the server.";
        byId('confirmAlert').hidden = false;
      })
      .then(function () { byId('confirmButton').disabled = false; });
  });

  function activate(service) {
    send('PATCH', '/api/admin/services/' + service.service_id, { is_active: true })
      .then(function (result) {
        if (result.status === 200) toast(service.service_name + ' activated');
        else toast(result.data.error || 'Something went wrong.', true);
        return load();
      })
      .catch(function (err) { if (err.message !== 'not logged in') toast("Can't reach the server.", true); });
  }

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
        .catch(function () { /* the clock just uses this device's time zone */ })
        .then(function () {
          updateClock();
          setInterval(updateClock, 30 * 1000);
          return send('GET', '/api/admin/users?role=staff&status=active');
        })
        .then(function (result) {
          staffList = result.data.users || [];
          return load();
        });
    })
    .catch(function () { /* redirects are already happening */ });
});
