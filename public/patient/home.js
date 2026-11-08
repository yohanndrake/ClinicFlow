//patient/home.js - patient home script, shows the active ticket, services, latest notifications and recent visits, refreshes every 10 seconds
document.addEventListener('DOMContentLoaded', function () {
  var REFRESH_SECONDS = 10;

  var pageAlert = document.getElementById('pageAlert');
  var timeZone = undefined;
  var firstName = '';

  function timeAgo(isoTimestamp) {
    var seconds = Math.max(0, Math.round((Date.now() - new Date(isoTimestamp).getTime()) / 1000));
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + ' min ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + ' h ago';
    return new Date(isoTimestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: timeZone });
  }

  function updateClock() {
    var now = new Date();
    document.getElementById('now').textContent =
      now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: timeZone }) +
      ', ' + now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: timeZone });
  }

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

  function showNotifications(data) {
    var list = document.getElementById('alertList');
    list.textContent = '';
    data.notifications.forEach(function (n) {
      var item = el('li', 'alert-item' + (n.is_read ? '' : ' is-unread'), n.message);
      item.appendChild(el('span', 'alert-time', timeAgo(n.created_at)));
      list.appendChild(item);
    });
    document.getElementById('alertsEmpty').hidden = data.notifications.length > 0;

    var count = document.getElementById('bellCount');
    var bell = document.getElementById('bell');
    count.hidden = data.unread_count === 0;
    count.textContent = data.unread_count > 9 ? '9+' : String(data.unread_count);
    bell.setAttribute('aria-label',
      data.unread_count ? 'Notifications, ' + data.unread_count + ' unread' : 'Notifications');
  }

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

  function loadAll() {
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
        if (err.message === 'not logged in' || err.message === 'not allowed') return;
        pageAlert.textContent = "Can't reach the server. Showing the last information we had; trying again...";
        pageAlert.hidden = false;
        document.getElementById('ticketLoading').hidden = true;
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

      firstName = user.name.trim().split(/\s+/)[0];
      document.getElementById('greeting').textContent = 'Hi, ' + firstName + '.';
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
          return loadAll();
        });
    })
    .then(function () {
      setInterval(updateClock, 30 * 1000);

      setInterval(loadAll, REFRESH_SECONDS * 1000);
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) loadAll();
      });
    })
    .catch(function () { });
});
