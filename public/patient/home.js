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
  var REFRESH_SECONDS = 10; // how often the page asks the server for the latest queue

  var userButton = document.getElementById('userButton');
  var userMenu = document.getElementById('userMenu');
  var pageAlert = document.getElementById('pageAlert');
  var timeZone = undefined;   // the clinic's time zone, known after the first answer
  var firstName = '';

  /* Theme buttons */
  setTheme(startTheme);
  document.querySelectorAll('[data-theme-set]').forEach(function (button) {
    button.addEventListener('click', function () {
      setTheme(button.dataset.themeSet);
    });
  });

  /* ---------- Small helpers ---------- */

  // el('p', 'note', 'Hello') -> <p class="note">Hello</p>
  // Text is always added with textContent, so nothing typed by someone else can inject HTML.
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

  // "08:00:00" -> "8:00 AM"
  function formatTime(value) {
    var parts = String(value).split(':');
    var hour = Number(parts[0]);
    return (hour % 12 || 12) + ':' + parts[1] + ' ' + (hour >= 12 ? 'PM' : 'AM');
  }

  // "2026-10-23" -> "Oct 23, 2026"  (the date is already the clinic's day, so no time zone maths)
  function formatDay(isoDate) {
    var parts = String(isoDate).split('-');
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[Number(parts[1]) - 1] + ' ' + Number(parts[2]) + ', ' + parts[0];
  }

  function minutesText(minutes) {
    if (minutes === null || minutes === undefined) return '—';
    return Math.round(minutes) + ' min';
  }

  // "5 min ago", "2 h ago" or the date for older ones
  function timeAgo(isoTimestamp) {
    var seconds = Math.max(0, Math.round((Date.now() - new Date(isoTimestamp).getTime()) / 1000));
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + ' min ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + ' h ago';
    return new Date(isoTimestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: timeZone });
  }

  /* ---------- Date and time in the greeting ---------- */

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

  // Click anywhere else, or press Escape, to close it
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

  // Gets JSON from the server. A logged-out person is sent to the login page.
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

  /* ---------- Active ticket ---------- */

  // What the person sees on the badge for each ticket state
  var stateNames = { waiting: 'Waiting', near: 'Near', called: 'Called - go now' };

  function showTicket(ticket, rooms) {
    var has = document.getElementById('ticketHas');
    var none = document.getElementById('ticketNone');
    document.getElementById('ticketLoading').hidden = true;

    var active = ticket && (ticket.status === 'waiting' || ticket.status === 'serving');
    has.hidden = !active;
    none.hidden = !!active;
    if (!active) return;

    var badge = document.getElementById('ticketBadge');
    badge.className = 'cf-badge cf-' + ticket.state;
    badge.textContent = stateNames[ticket.state] || capitalize(ticket.state);

    document.getElementById('ticketNumber').textContent = ticket.ticket_label;
    document.getElementById('ticketService').textContent = ticket.service_name;
    // A waiting ticket has no room yet, so show the service's room if there is one
    document.getElementById('ticketRoom').textContent = ticket.room || (rooms && rooms[0]) || '';

    if (ticket.status === 'serving') {
      document.getElementById('ticketPosition').textContent = "It's your turn";
      document.getElementById('ticketAhead').textContent = ticket.room ? 'Go to ' + ticket.room : 'Please go to the counter';
      document.getElementById('ticketWait').textContent = 'Now';
    } else {
      var ahead = ticket.people_ahead;
      document.getElementById('ticketPosition').textContent = 'Position ' + ticket.position;
      document.getElementById('ticketAhead').textContent =
        ahead === 0 ? 'No one ahead of you' : ahead + (ahead === 1 ? ' person ahead' : ' people ahead');
      document.getElementById('ticketWait').textContent =
        ahead === 0 ? "You're next" : 'about ' + ticket.estimated_wait_minutes + ' min';
    }
  }

  /* ---------- Service cards ---------- */

  function fact(label, value, className) {
    var box = el('div', 'fact' + (className ? ' ' + className : ''));
    box.appendChild(el('dt', '', label));
    box.appendChild(el('dd', '', value));
    return box;
  }

  function drawService(service) {
    var state = service.queue_status;
    if (state === 'open' && service.unavailable_reason === 'Outside opening hours') state = 'closed';

    var card = el('article', 'cf-card');
    var head = el('div', 'service-head');
    head.appendChild(el('h2', '', service.service_name));
    head.appendChild(el('span', 'cf-badge cf-' + state, capitalize(state)));
    card.appendChild(head);

    var hours = formatTime(service.open_time) + ' - ' + formatTime(service.close_time);
    var facts = el('dl', 'facts');
    if (state === 'open') {
      facts.appendChild(fact('Now serving', service.now_serving || '–', 'big'));
      facts.appendChild(fact('Queue', service.waiting_count ? service.waiting_count + ' waiting' : 'No one waiting'));
      facts.appendChild(fact('Hours', hours, 'wide'));
      card.appendChild(facts);
    } else {
      // Paused or closed: no queue numbers, just the reason
      card.appendChild(el('p', 'service-note', service.unavailable_reason || capitalize(state)));
      facts.appendChild(fact('Hours', hours, 'wide'));
      card.appendChild(facts);
    }
    return card;
  }

  function showServices(services) {
    var box = document.getElementById('services');
    box.textContent = '';
    services.forEach(function (service) { box.appendChild(drawService(service)); });
  }

  /* ---------- Notifications ---------- */

  function showNotifications(data) {
    var list = document.getElementById('alertList');
    list.textContent = '';
    data.notifications.forEach(function (n) {
      var item = el('li', 'alert-item' + (n.is_read ? '' : ' is-unread'), n.message);
      item.appendChild(el('span', 'alert-time', timeAgo(n.created_at)));
      list.appendChild(item);
    });
    document.getElementById('alertsEmpty').hidden = data.notifications.length > 0;

    // The number on the bell
    var count = document.getElementById('bellCount');
    var bell = document.getElementById('bell');
    count.hidden = data.unread_count === 0;
    count.textContent = data.unread_count > 9 ? '9+' : String(data.unread_count);
    bell.setAttribute('aria-label',
      data.unread_count ? 'Notifications, ' + data.unread_count + ' unread' : 'Notifications');
  }

  /* ---------- Recent visits ---------- */

  function visitStatus(ticket) {
    if (ticket.expired) return { css: 'cancelled', label: 'Expired' };
    return { css: ticket.status, label: capitalize(ticket.status) };
  }

  function showVisits(data) {
    var rows = document.getElementById('visitRows');
    rows.textContent = '';
    data.tickets.forEach(function (t) {
      var status = visitStatus(t);
      var row = el('tr');

      var date = el('td', '', formatDay(t.queue_date));
      date.dataset.label = 'Date';
      var number = el('td', 'ticket-col', t.ticket_label);
      number.dataset.label = 'Ticket';
      var statusCell = el('td');
      statusCell.dataset.label = 'Status';
      statusCell.appendChild(el('span', 'cf-badge cf-' + status.css, status.label));
      var wait = el('td', '', minutesText(t.wait_minutes));
      wait.dataset.label = 'Wait time';

      [date, number, statusCell, wait].forEach(function (cell) { row.appendChild(cell); });
      rows.appendChild(row);
    });
    document.getElementById('visitsTable').hidden = data.tickets.length === 0;
    document.getElementById('visitsEmpty').hidden = data.tickets.length > 0;
  }

  /* ---------- Load everything ---------- */

  function loadAll() {
    // The services are needed twice (cards and the room shown on the ticket), so they load first.
    return getJson('/api/patient/services')
      .then(function (data) {
        showServices(data.services);
        return Promise.all([
          getJson('/api/patient/tickets/current'),
          getJson('/api/patient/notifications?limit=3'),
          getJson('/api/patient/tickets/history?page_size=3')
        ]).then(function (results) {
          var ticket = results[0].ticket;
          var service = ticket && data.services.filter(function (s) {
            return s.service_id === ticket.service_id;
          })[0];
          showTicket(ticket, service && service.rooms);
          showNotifications(results[1]);
          showVisits(results[2]);
          pageAlert.hidden = true;
        });
      })
      .catch(function (err) {
        // A redirect is already on its way for logged-out and not-allowed people
        if (err.message === 'not logged in' || err.message === 'not allowed') return;
        pageAlert.textContent = "Can't reach the server. Showing the last information we had; trying again...";
        pageAlert.hidden = false;
        document.getElementById('ticketLoading').hidden = true;
      });
  }

  /* ---------- Start: who is this? ---------- */

  getJson('/api/auth/me')
    .then(function (data) {
      var user = data.user;
      if (user.mustChangePassword) {
        window.location.replace('/force-password/force-password.html');
        return null;
      }
      // Staff and admins have their own start pages
      if (user.role === 'staff') { window.location.replace('/staff/console.html'); return null; }
      if (user.role === 'admin') { window.location.replace('/admin/dashboard.html'); return null; }

      firstName = user.name.trim().split(/\s+/)[0];
      document.getElementById('greeting').textContent = 'Hi, ' + firstName + '.';
      document.getElementById('headerName').textContent = user.name;
      document.getElementById('headerInitials').textContent = initials(user.name);

      // The clinic's name and time zone come from the public board data
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
          return loadAll();
        });
    })
    .then(function () {
      setInterval(updateClock, 30 * 1000);
      setInterval(loadAll, REFRESH_SECONDS * 1000);
      // Coming back to the tab: refresh at once instead of waiting for the next tick.
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) loadAll();
      });
    })
    .catch(function () { /* redirects are already happening */ });
});
