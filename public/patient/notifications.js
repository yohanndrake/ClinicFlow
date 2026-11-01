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
  var REFRESH_SECONDS = 15;

  var userButton = document.getElementById('userButton');
  var userMenu = document.getElementById('userMenu');
  var pageAlert = document.getElementById('pageAlert');
  var markAll = document.getElementById('markAll');
  var list = document.getElementById('list');

  var timeZone = undefined;      // the clinic's time zone, known after the board answers
  var filter = 'all';            // 'all' or 'unread'
  var notifications = [];        // everything the server sent (newest first)
  var unreadCount = 0;
  var busy = false;

  // The title shown for each kind of notification
  var titles = {
    near: 'Your turn is near',
    called: 'You are being called',
    skipped: 'Ticket skipped',
    cancelled: 'Ticket cancelled',
    paused: 'Service paused'
  };

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

  // "Maria Santos" -> "MS"
  function initials(name) {
    var words = String(name).trim().split(/\s+/);
    var letters = words[0].charAt(0) + (words.length > 1 ? words[words.length - 1].charAt(0) : '');
    return letters.toUpperCase();
  }

  // Today: "10:24 AM". Other days: "Oct 23, 10:24 AM"
  function timeText(isoTimestamp) {
    var when = new Date(isoTimestamp);
    var options = { hour: 'numeric', minute: '2-digit', timeZone: timeZone };
    var time = when.toLocaleTimeString('en-US', options);
    var dayOf = function (d) {
      return d.toLocaleDateString('en-CA', { timeZone: timeZone });
    };
    if (dayOf(when) === dayOf(new Date())) return time;
    return when.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: timeZone }) + ', ' + time;
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

  function post(url) {
    return fetch(url, { method: 'POST' }).then(function (res) {
      if (res.status === 401) {
        window.location.replace('/login/login.html');
        throw new Error('not logged in');
      }
      if (!res.ok) throw new Error('bad status');
    });
  }

  /* ---------- Drawing the list ---------- */

  function drawItem(n) {
    var li = el('li');
    var item = el('button', 'item' + (n.is_read ? '' : ' is-unread'));
    item.type = 'button';
    // Only unread ones do something when tapped
    if (n.is_read) item.setAttribute('aria-disabled', 'true');

    item.appendChild(el('span', 'dot'));

    var text = el('span');
    text.appendChild(el('span', 'item-title', titles[n.type] || 'Notification'));
    text.appendChild(el('span', 'item-message', n.message));
    text.appendChild(el('span', 'item-time', timeText(n.created_at) + (n.is_read ? '' : ' · Unread')));
    item.appendChild(text);

    // Desktop shows the time and "Unread" on the right
    var side = el('span', 'item-side');
    side.appendChild(el('span', '', timeText(n.created_at)));
    if (!n.is_read) side.appendChild(el('span', 'item-state', 'Unread'));
    item.appendChild(side);

    if (!n.is_read) {
      item.setAttribute('aria-label', 'Mark as read: ' + (titles[n.type] || 'Notification'));
      item.addEventListener('click', function () { markOne(n); });
    }

    li.appendChild(item);
    return li;
  }

  function draw() {
    document.getElementById('loading').hidden = true;

    var shown = notifications.filter(function (n) { return filter === 'all' || !n.is_read; });
    list.textContent = '';
    shown.forEach(function (n) { list.appendChild(drawItem(n)); });
    list.hidden = shown.length === 0;

    var empty = document.getElementById('empty');
    empty.hidden = shown.length > 0;
    if (!shown.length) {
      document.getElementById('emptyTitle').textContent = filter === 'unread' ? 'No unread notifications' : 'No notifications';
      document.getElementById('emptyText').textContent = filter === 'unread'
        ? "You're all caught up."
        : "We'll let you know here when your turn is near or called.";
    }

    document.getElementById('summary').textContent =
      (filter === 'all' ? 'All selected' : 'Unread selected') + ' · ' + unreadCount + ' unread';
    markAll.disabled = unreadCount === 0 || busy;
  }

  /* ---------- Loading ---------- */

  function load() {
    return getJson('/api/patient/notifications?limit=100').then(function (data) {
      notifications = data.notifications;
      unreadCount = data.unread_count;
      pageAlert.hidden = true;
      draw();
    }).catch(function (err) {
      if (err.message === 'not logged in' || err.message === 'not allowed') return;
      document.getElementById('loading').hidden = true;
      pageAlert.textContent = "Can't reach the server. Trying again...";
      pageAlert.hidden = false;
    });
  }

  /* ---------- Marking as read ---------- */

  function failed(err) {
    if (err.message === 'not logged in') return;
    pageAlert.textContent = 'Something went wrong. Please try again.';
    pageAlert.hidden = false;
  }

  function markOne(n) {
    if (busy || n.is_read) return;
    busy = true;
    post('/api/patient/notifications/' + n.notification_id + '/read')
      .then(function () {
        n.is_read = true;
        unreadCount = Math.max(0, unreadCount - 1);
      })
      .catch(failed)
      .then(function () {
        busy = false;
        draw();
      });
  }

  markAll.addEventListener('click', function () {
    if (busy || unreadCount === 0) return;
    busy = true;
    markAll.disabled = true;
    post('/api/patient/notifications/read-all')
      .then(function () {
        notifications.forEach(function (n) { n.is_read = true; });
        unreadCount = 0;
      })
      .catch(failed)
      .then(function () {
        busy = false;
        draw();
      });
  });

  /* ---------- All / Unread ---------- */

  document.querySelectorAll('[data-filter]').forEach(function (button) {
    button.addEventListener('click', function () {
      filter = button.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach(function (other) {
        other.setAttribute('aria-pressed', String(other === button));
      });
      draw();
    });
  });

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
        .catch(function () { /* times just use this device's time zone */ })
        .then(load)
        .then(function () {
          // New alerts arrive while the page is open
          setInterval(function () { if (!busy) load(); }, REFRESH_SECONDS * 1000);
        });
    })
    .catch(function () { /* redirects are already happening */ });
});
