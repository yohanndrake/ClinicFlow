//patient/take-number.js - take a number script, picks an open service, adds travel time and a note, then creates the ticket
document.addEventListener('DOMContentLoaded', function () {
  var REFRESH_SECONDS = 15;

  var pageAlert = document.getElementById('pageAlert');
  var form = document.getElementById('ticketForm');
  var submitButton = document.getElementById('submitButton');
  var formAlert = document.getElementById('formAlert');
  var travelInput = document.getElementById('travel');
  var travelError = document.getElementById('travelError');
  var noteInput = document.getElementById('note');

  var timeZone = undefined;
  var services = [];
  var selectedId = null;
  var hasActiveTicket = false;
  var travelFilled = false;
  var sending = false;

  function waitingText(count) {
    return count ? count + ' waiting' : 'No one waiting';
  }

  function updateClock() {
    var now = new Date();
    document.getElementById('now').textContent =
      now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: timeZone }) +
      ', ' + now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: timeZone });
  }

  function findService(id) {
    return services.filter(function (s) { return s.service_id === id; })[0];
  }

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

  function chooseDefault() {
    var current = findService(selectedId);
    if (current && current.available) return;
    var first = services.filter(function (s) { return s.available; })[0];
    selectedId = first ? first.service_id : null;
  }

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

  function showActiveTicket(ticket) {
    hasActiveTicket = !!ticket && (ticket.status === 'waiting' || ticket.status === 'serving');
    document.getElementById('activeBanner').hidden = !hasActiveTicket;
    if (hasActiveTicket) {
      document.getElementById('bannerLink').textContent = 'View ticket · ' + ticket.ticket_label;
    }
  }

  function loadAll() {
    return Promise.all([
      getJson('/api/patient/services'),
      getJson('/api/patient/tickets/current'),
      loadBell()
    ]).then(function (results) {
      services = results[0].services;
      showActiveTicket(results[1].ticket);

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

  noteInput.addEventListener('input', function () {
    document.getElementById('noteCount').textContent = noteInput.value.length + '/100';
  });

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
          return loadAll();
        })
        .then(function () {
          setInterval(updateClock, 30 * 1000);

          setInterval(function () {
            if (!sending && document.getElementById('issued').hidden) loadAll();
          }, REFRESH_SECONDS * 1000);
        });
    })
    .catch(function () { });
});
