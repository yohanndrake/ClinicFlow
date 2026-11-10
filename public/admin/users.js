//admin/users.js - users script, add, edit, deactivate, activate and reset passwords of accounts
document.addEventListener('DOMContentLoaded', function () {
  var userMenu = document.getElementById('userMenu');
  var searchInput = document.getElementById('search');
  var statusSelect = document.getElementById('status');

  var timeZone = undefined;
  var role = 'staff';
  var users = [];
  var me = null;
  var target = null;
  var toastTimer = null;
  var searchTimer = null;
  var requestNumber = 0;

  var ROLE_WORDS = { staff: 'Staff', patient: 'Patient', admin: 'Admin' };

  function dayText(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: timeZone });
  }

  function formatDay(isoDate) {
    if (!isoDate) return '—';
    var parts = String(isoDate).split('-');
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[Number(parts[1]) - 1] + ' ' + Number(parts[2]) + ', ' + parts[0];
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

  document.querySelectorAll('[data-close]').forEach(function (button) {
    button.addEventListener('click', function () { button.closest('dialog').close(); });
  });

  function showAlert(id, message) {
    byId(id).textContent = message;
    byId(id).hidden = false;
  }

  function addButton(box, label, className, onClick, disabled) {
    var button = el('button', 'link-button' + (className ? ' ' + className : ''), label);
    button.type = 'button';
    button.disabled = !!disabled;
    button.addEventListener('click', onClick);
    box.appendChild(button);
  }

  function detailText(u) {
    if (role === 'staff') {
      if (!u.assignments.length) return 'Not assigned';
      return u.assignments.map(function (a) { return a.service_name + (a.counter_label ? ' · ' + a.counter_label : ''); }).join(', ');
    }
    if (role === 'patient') {
      return u.visits + (u.visits === 1 ? ' visit' : ' visits') + (u.last_visit ? ' · last ' + formatDay(u.last_visit) : '');
    }
    return '—';
  }

  function drawRow(u) {
    var inactive = u.status === 'inactive';
    var row = el('tr', inactive ? 'is-inactive' : '');

    function cell(label, text, className) {
      var td = el('td', className || '', text);
      td.dataset.label = label;
      row.appendChild(td);
      return td;
    }

    cell('Name', u.full_name, 'name-col');
    cell('Email', u.email);
    cell('Contact', u.contact_number || '—');
    var status = cell('Status', '');
    status.appendChild(el('span', 'cf-badge ' + (inactive ? 'cf-skipped' : 'cf-open'), capitalize(u.status)));
    cell(role === 'patient' ? 'Visits' : 'Assigned service', detailText(u));
    cell('Created', dayText(u.created_at));

    var actionsCell = el('td', 'actions-col');
    var actions = el('div', 'row-actions');
    if (role === 'patient') addButton(actions, 'Details', '', function () { openPatient(u); });
    else addButton(actions, 'Edit', '', function () { openForm(u); });

    var isSelf = role === 'admin' && me && u.id === me.id;
    if (inactive) addButton(actions, 'Activate', 'solid', function () { setStatus(u, 'active'); });
    else addButton(actions, 'Deactivate', 'danger', function () { openConfirm(u); }, isSelf);
    addButton(actions, 'Reset Password', '', function () { openReset(u); });
    actionsCell.appendChild(actions);
    row.appendChild(actionsCell);
    return row;
  }

  function drawList() {
    var rows = byId('rows');
    rows.textContent = '';
    users.forEach(function (u) { rows.appendChild(drawRow(u)); });
    byId('table').hidden = users.length === 0;
    byId('empty').hidden = users.length > 0;
    byId('detailHeading').textContent = role === 'patient' ? 'Visits' : 'Assigned service';
  }

  function load() {
    var mine = ++requestNumber;
    var query = ['role=' + role];
    if (searchInput.value.trim()) query.push('q=' + encodeURIComponent(searchInput.value.trim()));
    if (statusSelect.value) query.push('status=' + statusSelect.value);

    return send('GET', '/api/admin/users?' + query.join('&'))
      .then(function (result) {
        if (mine !== requestNumber) return;
        if (result.status !== 200) throw new Error(result.data.error || 'bad status');
        users = result.data.users;
        byId('loading').hidden = true;
        byId('pageAlert').hidden = true;
        drawList();
      })
      .catch(function (err) {
        if (err.message === 'not logged in' || err.message === 'not allowed' || mine !== requestNumber) return;
        byId('loading').hidden = true;
        showAlert('pageAlert', "Can't load users. Check your connection and try again.");
      });
  }

  document.querySelectorAll('[data-role]').forEach(function (button) {
    button.addEventListener('click', function () {
      role = button.dataset.role;
      document.querySelectorAll('[data-role]').forEach(function (other) {
        other.setAttribute('aria-pressed', String(other === button));
      });
      byId('addUser').hidden = role === 'patient';
      byId('addUser').textContent = 'Add ' + ROLE_WORDS[role];
      load();
    });
  });

  statusSelect.addEventListener('change', load);
  searchInput.addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(load, 300);
  });
  byId('toolbar').addEventListener('submit', function (event) { event.preventDefault(); });

  function openForm(user) {
    target = user || null;
    byId('userTitle').textContent = (user ? 'Edit ' : 'Add ') + ROLE_WORDS[role];
    byId('uName').value = user ? user.full_name : '';
    byId('uEmail').value = user ? user.email : '';
    byId('uContact').value = user && user.contact_number ? user.contact_number : '';
    byId('uPassword').value = '';
    byId('uStatus').value = user ? user.status : 'active';
    byId('uService').value = '';
    byId('uCounter').value = '';

    byId('passwordField').hidden = !!user;
    byId('statusField').hidden = !user;
    byId('staffFields').hidden = role !== 'staff';
    openDialog('userDialog');
    byId('uName').focus();
  }

  byId('addUser').addEventListener('click', function () { openForm(null); });

  byId('userForm').addEventListener('submit', function (event) {
    event.preventDefault();
    byId('userDialog').querySelectorAll('.alert, .cf-error').forEach(function (node) { node.hidden = true; });
    byId('userDialog').querySelectorAll('.is-error').forEach(function (node) { node.classList.remove('is-error'); });

    var name = byId('uName').value.trim();
    var email = byId('uEmail').value.trim();
    var contact = byId('uContact').value.trim();
    var password = byId('uPassword').value;
    var firstBad = null;

    function bad(id, message) {
      var input = fieldError(id, message);
      if (!firstBad) firstBad = input;
    }

    if (!name) bad('uName', 'Name is required.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) bad('uEmail', 'Enter a valid email address.');
    if (contact && !/^[0-9\s+()-]+$/.test(contact)) bad('uContact', 'Use digits, spaces, + - ( ) only.');
    if (!target && password && (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password))) {
      bad('uPassword', 'Use at least 8 characters with a letter and a number.');
    }
    if (firstBad) {
      firstBad.focus();
      return;
    }

    var body = { full_name: name, email: email, contact_number: contact };
    if (role === 'staff' && byId('uService').value) {
      body.service_id = Number(byId('uService').value);
      body.counter_label = byId('uCounter').value.trim();
    }

    var request;
    if (target) {
      body.status = byId('uStatus').value;
      request = send('PATCH', '/api/admin/users/' + role + '/' + target.id, body);
    } else {
      body.role = role;
      if (password) body.password = password;
      request = send('POST', '/api/admin/users', body);
    }

    byId('userSave').disabled = true;
    request
      .then(function (result) {
        if (result.status === 200 || result.status === 201) {
          byId('userDialog').close();
          if (result.status === 201) showSecret(name, result.data.temporary_password);
          else toast('Account updated');
          return load();
        }
        var message = result.data.error || 'Something went wrong.';
        if (result.status === 409) {
          var input = fieldError('uEmail', message);
          input.focus();
        } else {
          showAlert('userAlert', message);
        }
      })
      .catch(function (err) { if (err.message !== 'not logged in') showAlert('userAlert', "Can't reach the server."); })
      .then(function () { byId('userSave').disabled = false; });
  });

  function openConfirm(user) {
    target = user;
    byId('confirmTitle').textContent = 'Deactivate ' + role;
    byId('confirmText').textContent = 'Deactivate ' + user.full_name + '?';
    byId('confirmHint').textContent = 'Confirm to change this account from Active to Inactive. They will not be able to log in.';
    openDialog('confirmDialog');
  }

  byId('confirmForm').addEventListener('submit', function (event) {
    event.preventDefault();
    if (!target) return;
    byId('confirmButton').disabled = true;
    var who = target.full_name;
    send('PATCH', '/api/admin/users/' + role + '/' + target.id, { status: 'inactive' })
      .then(function (result) {
        if (result.status === 200) {
          byId('confirmDialog').close();
          toast(who + ' deactivated');
          return load();
        }
        showAlert('confirmAlert', result.data.error || 'Something went wrong.');
      })
      .catch(function (err) { if (err.message !== 'not logged in') showAlert('confirmAlert', "Can't reach the server."); })
      .then(function () { byId('confirmButton').disabled = false; });
  });

  function setStatus(user, status) {
    send('PATCH', '/api/admin/users/' + role + '/' + user.id, { status: status })
      .then(function (result) {
        if (result.status === 200) toast(user.full_name + ' activated');
        else toast(result.data.error || 'Something went wrong.', true);
        return load();
      })
      .catch(function (err) { if (err.message !== 'not logged in') toast("Can't reach the server.", true); });
  }

  function showSecret(name, password) {
    byId('secretWho').textContent = name;
    byId('secretValue').textContent = password;
    byId('copySecret').textContent = 'Copy';
    byId('secretDialog').showModal();
  }

  byId('copySecret').addEventListener('click', function () {
    var value = byId('secretValue').textContent;
    var done = function () { byId('copySecret').textContent = 'Copied'; };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(done).catch(function () { });
    }
  });

  function openReset(user) {
    target = user;
    byId('resetText').textContent = 'Reset the password for ' + user.full_name + '?';
    openDialog('resetDialog');
  }

  byId('resetForm').addEventListener('submit', function (event) {
    event.preventDefault();
    if (!target) return;
    byId('resetButton').disabled = true;
    var who = target.full_name;
    send('POST', '/api/admin/users/' + role + '/' + target.id + '/reset-password')
      .then(function (result) {
        if (result.status === 200) {
          byId('resetDialog').close();
          showSecret(who, result.data.temporary_password);
          return;
        }
        showAlert('resetAlert', result.data.error || 'Something went wrong.');
      })
      .catch(function (err) { if (err.message !== 'not logged in') showAlert('resetAlert', "Can't reach the server."); })
      .then(function () { byId('resetButton').disabled = false; });
  });

  function openPatient(u) {
    var rows = byId('patientRows');
    rows.textContent = '';
    [
      ['Name', u.full_name],
      ['Email', u.email],
      ['Contact', u.contact_number || '—'],
      ['Status', capitalize(u.status)],
      ['Number of visits', String(u.visits)],
      ['Last visit', formatDay(u.last_visit)],
      ['Joined', dayText(u.created_at)]
    ].forEach(function (pair) {
      var row = el('div');
      row.appendChild(el('dt', '', pair[0]));
      row.appendChild(el('dd', '', pair[1]));
      rows.appendChild(row);
    });
    byId('patientDialog').showModal();
  }

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

      me = user;
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
          return send('GET', '/api/admin/services');
        })
        .then(function (result) {
          (result.data.services || []).filter(function (s) { return s.is_active; }).forEach(function (s) {
            var option = el('option', '', s.service_name);
            option.value = String(s.service_id);
            byId('uService').appendChild(option);
          });
          return load();
        });
    })
    .catch(function () { });
});
