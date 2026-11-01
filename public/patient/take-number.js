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
  var form = document.getElementById('ticketForm');
  var submitButton = document.getElementById('submitButton');
  var formAlert = document.getElementById('formAlert');
  var travelInput = document.getElementById('travel');
  var travelError = document.getElementById('travelError');
  var noteInput = document.getElementById('note');

  var timeZone = undefined;     // the clinic's time zone, known after the board answers
  var services = [];            // the latest list from the server
  var selectedId = null;        // which service card is chosen
  var hasActiveTicket = false;  // one ticket at a time
  var travelFilled = false;     // true once we put the default travel time in the box
  var sending = false;

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

  // "08:00:00" -> "8:00 AM"
  function formatTime(value) {
    var parts = String(value).split(':');
    var hour = Number(parts[0]);
    return (hour % 12 || 12) + ':' + parts[1] + ' ' + (hour >= 12 ? 'PM' : 'AM');
  }

  function waitingText(count) {
    return count ? count + ' waiting' : 'No one waiting';
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

  /* ---------- The bell ---------- */

  function loadBell() {
    return getJson('/api/patient/notifications?limit=1').then(function (data) {
      var count = document.getElementById('bellCount');
      count.hidden = data.unread_count === 0;
      count.textContent = data.unread_count > 9 ? '9+' : String(data.unread_count);
      document.getElementById('bell').setAttribute('aria-label',
        data.unread_count ? 'Notifications, ' + data.unread_count + ' unread' : 'Notifications');
    });
  }

  /* ---------- Service cards ---------- */

  function findService(id) {
    return services.filter(function (s) { return s.service_id === id; })[0];
  }

  // The status shown on a card: Open, Paused or Closed (also when outside opening hours)
  function serviceState(service) {
    if (service.queue_status === 'open' && service.unavailable_reason) return 'closed';
    return service.queue_status;
  }

  function fact(label, value, className) {
    var box = el('div', 'fact' + (className ? ' ' + className : ''));
    box.appendChild(el('dt', '', label));
    box.appendChild(el('dd', '', value));
    return box;
  }

  function drawServices() {
    var list = document.getElementById('serviceList');
    list.textContent = '';
    document.getElementById('servicesLoading').hidden = true;

    if (!services.length) {
      list.appendChild(el('p', 'muted', 'No services are available right now.'));
      return;
    }

    services.forEach(function (service) {
      var state = serviceState(service);
      var unavailable = !service.available;

      var label = el('label', 'service-option' + (unavailable ? ' is-unavailable' : ''));
      var radio = el('input');
      radio.type = 'radio';
      radio.name = 'service';
      radio.value = String(service.service_id);
      radio.disabled = unavailable || hasActiveTicket;
      radio.checked = service.service_id === selectedId;
      radio.addEventListener('change', function () {
        selectedId = service.service_id;
        updateSummary();
      });
      label.appendChild(radio);

      var card = el('div', 'cf-card');
      var head = el('div', 'service-head');
      head.appendChild(el('h3', '', service.service_name));
      head.appendChild(el('span', 'cf-badge cf-' + state, capitalize(state)));
      card.appendChild(head);

      if (unavailable) card.appendChild(el('p', 'service-reason', service.unavailable_reason));

      var facts = el('dl', 'facts');
      facts.appendChild(fact('Estimated wait', unavailable ? '—' : service.estimated_wait_minutes + ' min'));
      facts.appendChild(fact('Queue', unavailable ? '—' : waitingText(service.waiting_count)));
      facts.appendChild(fact('Hours', formatTime(service.open_time) + ' - ' + formatTime(service.close_time), 'wide'));
      card.appendChild(facts);

      label.appendChild(card);
      list.appendChild(label);
    });
  }

  // Keep the chosen service if it still exists and works, otherwise pick the first one that works.
  function chooseDefault() {
    var current = findService(selectedId);
    if (current && current.available) return;
    var first = services.filter(function (s) { return s.available; })[0];
    selectedId = first ? first.service_id : null;
  }

  /* ---------- Summary ---------- */

  function updateSummary() {
    var service = findService(selectedId);
    var box = document.getElementById('summaryService');
    box.hidden = !service;
    document.getElementById('summaryEmpty').hidden = !!service;

    if (service) {
      document.getElementById('summaryName').textContent = service.service_name;
      var room = service.rooms && service.rooms.length ? service.rooms.join(', ') + ' · ' : '';
      document.getElementById('summaryMeta').textContent =
        room + formatTime(service.open_time) + ' - ' + formatTime(service.close_time);
      document.getElementById('summaryWaiting').textContent = waitingText(service.waiting_count);
      document.getElementById('summaryWait').textContent = service.estimated_wait_minutes
        ? 'Estimated wait ' + service.estimated_wait_minutes + ' min'
        : 'No wait';
    }
    submitButton.disabled = !service || hasActiveTicket || sending;
  }

  /* ---------- Notice for people who already have a ticket ---------- */

  function showActiveTicket(ticket) {
    hasActiveTicket = !!ticket && (ticket.status === 'waiting' || ticket.status === 'serving');
    document.getElementById('activeBanner').hidden = !hasActiveTicket;
    if (hasActiveTicket) {
      document.getElementById('bannerLink').textContent = 'View ticket · ' + ticket.ticket_label;
    }
  }

  /* ---------- Loading ---------- */

  function loadAll() {
    return Promise.all([
      getJson('/api/patient/services'),
      getJson('/api/patient/tickets/current'),
      loadBell()
    ]).then(function (results) {
      services = results[0].services;
      showActiveTicket(results[1].ticket);

      // Put the clinic's default travel time in the box once (never overwrite what the person typed)
      if (!travelFilled && results[0].default_travel_minutes !== undefined) {
        travelInput.value = results[0].default_travel_minutes;
        travelFilled = true;
      }

      chooseDefault();
      drawServices();
      updateSummary();
      pageAlert.hidden = true;
    }).catch(function (err) {
      if (err.message === 'not logged in' || err.message === 'not allowed') return;
      pageAlert.textContent = "Can't reach the server. Trying again...";
      pageAlert.hidden = false;
      document.getElementById('servicesLoading').hidden = true;
    });
  }

  /* ---------- Note counter ---------- */

  noteInput.addEventListener('input', function () {
    document.getElementById('noteCount').textContent = noteInput.value.length + '/100';
  });

  /* ---------- Get my number ---------- */

  function showTravelError(message) {
    travelInput.classList.add('is-error');
    travelInput.setAttribute('aria-invalid', 'true');
    travelError.textContent = message;
    travelError.hidden = false;
  }

  function clearErrors() {
    travelInput.classList.remove('is-error');
    travelInput.removeAttribute('aria-invalid');
    travelError.hidden = true;
    formAlert.hidden = true;
  }

  function showIssued(ticket) {
    document.getElementById('formArea').hidden = true;
    document.getElementById('activeBanner').hidden = true;
    document.getElementById('pageTitle').textContent = 'Ticket issued';
    document.getElementById('issuedNumber').textContent = ticket.ticket_label;
    document.getElementById('issuedService').textContent = ticket.service_name;
    document.getElementById('issuedPosition').textContent = 'Position ' + ticket.position;
    document.getElementById('issuedWait').textContent =
      ticket.people_ahead === 0 ? "You're next" : 'About ' + ticket.estimated_wait_minutes + ' min';
    var issued = document.getElementById('issued');
    issued.hidden = false;
    document.getElementById('issuedLink').focus();
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (sending || hasActiveTicket || selectedId === null) return;
    clearErrors();

    // Same rule the server checks: a whole number from 0 to 600
    var travel = travelInput.value.trim();
    var body = { service_id: selectedId, note: noteInput.value.trim() };
    if (travel !== '') {
      var minutes = Number(travel);
      if (!Number.isInteger(minutes) || minutes < 0 || minutes > 600) {
        showTravelError('Enter a whole number from 0 to 600.');
        travelInput.focus();
        return;
      }
      body.travel_minutes = minutes;
    }

    sending = true;
    submitButton.disabled = true;
    submitButton.textContent = 'Getting your number...';

    fetch('/api/patient/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          return { status: res.status, data: data };
        });
      })
      .then(function (result) {
        if (result.status === 201) {
          showIssued(result.data.ticket);
          return;
        }
        if (result.status === 401) {
          window.location.replace('/login/login.html');
          return;
        }
        var message = result.data.error || 'Something went wrong. Please try again.';
        if (result.status === 400 && /travel/i.test(message)) {
          showTravelError(message);
          travelInput.focus();
        } else {
          formAlert.textContent = message;
          formAlert.hidden = false;
        }
        // The queue may have changed (service paused, ticket already taken...), so refresh the cards
        return loadAll();
      })
      .catch(function () {
        formAlert.textContent = "Can't reach the server. Check your connection and try again.";
        formAlert.hidden = false;
      })
      .then(function () {
        sending = false;
        submitButton.textContent = 'Get my number';
        updateSummary();
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
        .catch(function () { /* the clock just uses this device's time zone */ })
        .then(function () {
          updateClock();
          return loadAll();
        })
        .then(function () {
          setInterval(updateClock, 30 * 1000);
          // Refresh the queue numbers, but not while a number is being requested or already issued
          setInterval(function () {
            if (!sending && document.getElementById('issued').hidden) loadAll();
          }, REFRESH_SECONDS * 1000);
        });
    })
    .catch(function () { /* redirects are already happening */ });
});
