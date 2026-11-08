//patient/ticket.js - my ticket script, live position, people ahead, estimated wait, called countdown, i'm here and cancel
document.addEventListener('DOMContentLoaded', function () {
  var REFRESH_SECONDS = 5;

  var pageAlert = document.getElementById('pageAlert');
  var pageNotice = document.getElementById('pageNotice');
  var hereButton = document.getElementById('hereButton');
  var cancelButton = document.getElementById('cancelButton');
  var alertsButton = document.getElementById('alertsButton');
  var cancelDialog = document.getElementById('cancelDialog');

  var ticket = null;
  var lastState = null;
  var lastFetchAt = 0;
  var busy = false;

  var stateNames = {
    waiting: 'Waiting', near: 'Near', called: 'Called', completed: 'Completed',
    skipped: 'Skipped', cancelled: 'Cancelled', expired: 'Expired'
  };
  var stepOf = { waiting: 0, near: 1, called: 2, completed: 3 };

  function show(id, visible) {
    document.getElementById(id).hidden = !visible;
  }

  function say(message) {
    pageNotice.textContent = message;
    pageNotice.hidden = !message;
  }

  function post(url) {
    return fetch(url, { method: 'POST' }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { status: res.status, data: data };
      });
    });
  }

  function tick() {
    if (lastFetchAt) {
      var seconds = Math.round((Date.now() - lastFetchAt) / 1000);
      document.getElementById('updated').textContent =
        'Updated ' + (seconds < 5 ? 'just now' : seconds + ' sec ago');
    }

    if (ticket && ticket.state === 'called' && ticket.arrive_by) {
      var left = Math.max(0, Math.round((new Date(ticket.arrive_by).getTime() - Date.now()) / 1000));
      var clock = pad(Math.floor(left / 60)) + ':' + pad(left % 60);
      document.getElementById('arriveBy').textContent = clock;
      document.getElementById('calledSub').textContent =
        left > 0 ? 'Please arrive within ' + clock : 'Your time is up. Ask the front desk if you are still here.';
    }
  }

  function updateAlertsButton() {
    var supported = 'Notification' in window;
    if (!supported) {
      alertsButton.hidden = true;
      document.getElementById('alertsText').textContent =
        'This browser cannot show alerts. Keep this page open to watch your ticket.';
    } else if (Notification.permission === 'granted') {
      alertsButton.textContent = 'Alerts are on';
      alertsButton.disabled = true;
    } else if (Notification.permission === 'denied') {
      alertsButton.disabled = true;
      alertsButton.textContent = 'Alerts are blocked';
      document.getElementById('alertsText').textContent =
        'Alerts are blocked in your browser settings. Keep this page open to watch your ticket.';
    }
  }

  alertsButton.addEventListener('click', function () {
    if (!('Notification' in window)) return;
    Notification.requestPermission().then(updateAlertsButton);
  });

  function notifyChange(newTicket) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (lastState === newTicket.state) return;
    var message = null;
    if (newTicket.state === 'near') message = 'Your turn is near. Please get ready.';
    if (newTicket.state === 'called') {
      message = "It's your turn" + (newTicket.room ? ': go to ' + newTicket.room : '') + '.';
    }
    if (message) {
      try {
        new Notification('Ticket ' + newTicket.ticket_label, { body: message });
      } catch (err) {
      }
    }
  }

  function showActive(t) {
    show('activeArea', true);
    show('endCard', false);
    show('noneCard', false);

    var badge = document.getElementById('ticketBadge');
    badge.className = 'cf-badge cf-' + t.state;
    badge.textContent = stateNames[t.state] || capitalize(t.state);

    document.getElementById('ticketNumber').textContent = t.ticket_label;
    document.getElementById('ticketService').textContent = t.service_name;
    document.getElementById('ticketRoom').textContent = t.room || '';
    document.getElementById('ticketRoom').hidden = !t.room;

    var current = stepOf[t.state];
    document.querySelectorAll('.steps li').forEach(function (item) {
      var step = Number(item.dataset.step);
      item.className = step < current ? 'is-done' : step === current ? 'is-current' : '';
      if (step === current) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
    });

    var called = t.state === 'called';
    show('calledBanner', called);
    show('calledFacts', called);
    show('positionBox', !called);

    if (called) {
      var room = t.room || 'the counter';
      document.getElementById('calledTitle').textContent = "It's your turn, go to " + room;
      document.getElementById('destination').textContent = t.room || 'Counter';
    } else {
      var ahead = t.people_ahead;
      document.getElementById('positionMain').textContent = 'Position ' + t.position;
      document.getElementById('positionAhead').textContent =
        ahead === 0 ? 'No one ahead of you' : ahead + (ahead === 1 ? ' person ahead' : ' people ahead');
      document.getElementById('positionWait').textContent =
        ahead === 0 ? "You're next" : 'About ' + t.estimated_wait_minutes + ' min';
    }

    var arrived = !!t.arrived_at;
    show('hereButton', !arrived);
    show('cancelButton', t.status === 'waiting');
    hereButton.disabled = busy;
    cancelButton.disabled = busy;

    var q = t.queue;
    var queueState = q.queue_status;
    var queueBadge = document.getElementById('queueBadge');
    queueBadge.className = 'cf-badge cf-' + queueState;
    queueBadge.textContent = capitalize(queueState);
    document.getElementById('nowServing').textContent =
      q.now_serving ? 'Now serving: ' + q.now_serving : 'Nobody is being served yet';
    var meta = t.service_name + (t.room ? ' · ' + t.room : '');
    document.getElementById('queueMeta').textContent =
      meta + ' · ' + q.waiting_count + ' waiting · ' + formatTime(q.open_time) + ' - ' + formatTime(q.close_time);
    if (queueState === 'paused' && q.status_note) {
      document.getElementById('queueMeta').textContent += ' · Paused: ' + q.status_note;
    }
  }

  function endRow(label, value) {
    var row = el('div');
    row.appendChild(el('dt', '', label));
    row.appendChild(el('dd', '', value));
    return row;
  }

  function showEnded(t) {
    show('activeArea', false);
    show('calledBanner', false);
    show('noneCard', false);
    show('endCard', true);

    var state = t.state;
    var badge = document.getElementById('endBadge');
    badge.className = 'cf-badge cf-' + state;
    badge.textContent = stateNames[state] || capitalize(state);
    document.getElementById('endTitle').textContent =
      state === 'cancelled' || state === 'expired' ? 'Cancelled or Expired' : stateNames[state];
    document.getElementById('endTicket').textContent = t.ticket_label + ' · ' + t.service_name;

    var rows = document.getElementById('endRows');
    rows.textContent = '';
    var message = document.getElementById('endMessage');
    var action = document.getElementById('endAction');
    action.textContent = 'Take a new number';
    action.href = '/patient/take-number.html';

    if (state === 'completed') {
      rows.appendChild(endRow('Wait time', minutesText(t.wait_minutes)));
      rows.appendChild(endRow('Service time', minutesText(t.service_minutes)));
      message.textContent = 'Thank you for visiting. We hope you feel better soon.';
      action.textContent = 'Back to home';
      action.href = '/patient/home.html';
    } else if (state === 'skipped') {
      message.textContent = 'Your ticket was skipped because you were not present when called.';
    } else {
      rows.appendChild(endRow('Reason', t.status_reason || (state === 'expired' ? 'Expired - end of day' : 'Cancelled')));
      message.textContent = 'This ticket is no longer active.';
    }
  }

  function showNone() {
    show('activeArea', false);
    show('calledBanner', false);
    show('endCard', false);
    show('noneCard', true);
  }

  function draw(t) {
    document.getElementById('loading').hidden = true;
    if (!t) {
      showNone();
    } else if (t.status === 'waiting' || t.status === 'serving') {
      showActive(t);
    } else {
      showEnded(t);
    }
    tick();
  }

  function load() {
    return Promise.all([getJson('/api/patient/tickets/current'), loadBell()])
      .then(function (results) {
        var fresh = results[0].ticket;
        if (fresh) notifyChange(fresh);
        lastState = fresh ? fresh.state : null;
        ticket = fresh;
        lastFetchAt = Date.now();
        pageAlert.hidden = true;
        draw(fresh);
      })
      .catch(function (err) {
        if (err.message === 'not logged in' || err.message === 'not allowed') return;
        pageAlert.textContent = "Can't reach the server. Showing the last information we had; trying again...";
        pageAlert.hidden = false;
        document.getElementById('loading').hidden = true;
      });
  }

  hereButton.addEventListener('click', function () {
    if (busy || !ticket) return;
    busy = true;
    hereButton.disabled = true;
    say('');

    post('/api/patient/tickets/' + ticket.ticket_id + '/arrived')
      .then(function (result) {
        if (result.status === 200) {
          say("Thanks, the clinic knows you're here.");
        } else {
          pageAlert.textContent = result.data.error || 'Something went wrong. Please try again.';
          pageAlert.hidden = false;
        }
      })
      .catch(function () {
        pageAlert.textContent = "Can't reach the server. Please try again.";
        pageAlert.hidden = false;
      })
      .then(function () {
        busy = false;
        return load();
      });
  });

  cancelButton.addEventListener('click', function () {
    if (busy) return;
    cancelDialog.showModal();
  });

  cancelDialog.addEventListener('close', function () {
    if (cancelDialog.returnValue !== 'cancel' || !ticket) return;
    busy = true;
    cancelButton.disabled = true;
    say('');

    post('/api/patient/tickets/' + ticket.ticket_id + '/cancel')
      .then(function (result) {
        if (result.status === 200) {
          say('Your ticket was cancelled.');
        } else {
          pageAlert.textContent = result.data.error || 'Something went wrong. Please try again.';
          pageAlert.hidden = false;
        }
      })
      .catch(function () {
        pageAlert.textContent = "Can't reach the server. Please try again.";
        pageAlert.hidden = false;
      })
      .then(function () {
        busy = false;
        return load();
      });
  });

  updateAlertsButton();

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

      return load()
        .then(function () {
          setInterval(tick, 1000);
          setInterval(function () { if (!busy) load(); }, REFRESH_SECONDS * 1000);
          document.addEventListener('visibilitychange', function () {
            if (!document.hidden && !busy) load();
          });
        });
    })
    .catch(function () { });
});
