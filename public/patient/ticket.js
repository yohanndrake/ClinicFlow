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
  var REFRESH_SECONDS = 5; // how often the ticket is checked

  var userButton = document.getElementById('userButton');
  var userMenu = document.getElementById('userMenu');
  var pageAlert = document.getElementById('pageAlert');
  var pageNotice = document.getElementById('pageNotice');
  var hereButton = document.getElementById('hereButton');
  var cancelButton = document.getElementById('cancelButton');
  var alertsButton = document.getElementById('alertsButton');
  var cancelDialog = document.getElementById('cancelDialog');

  var ticket = null;          // the latest ticket from the server
  var lastState = null;       // used to notice when the state changes (waiting -> near -> called)
  var lastFetchAt = 0;        // when we last heard from the server
  var busy = false;           // true while a button action is being sent

  // Words shown on the badge for each state
  var stateNames = {
    waiting: 'Waiting', near: 'Near', called: 'Called', completed: 'Completed',
    skipped: 'Skipped', cancelled: 'Cancelled', expired: 'Expired'
  };
  // Which of the four bars is filled
  var stepOf = { waiting: 0, near: 1, called: 2, completed: 3 };

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

  function minutesText(minutes) {
    if (minutes === null || minutes === undefined) return '—';
    return Math.round(minutes) + ' min';
  }

  function show(id, visible) {
    document.getElementById(id).hidden = !visible;
  }

  function say(message) {
    pageNotice.textContent = message;
    pageNotice.hidden = !message;
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

  // POST with no body; resolves to { status, data }
  function post(url) {
    return fetch(url, { method: 'POST' }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { status: res.status, data: data };
      });
    });
  }

  function loadBell() {
    return getJson('/api/patient/notifications?limit=1').then(function (data) {
      var count = document.getElementById('bellCount');
      count.hidden = data.unread_count === 0;
      count.textContent = data.unread_count > 9 ? '9+' : String(data.unread_count);
      document.getElementById('bell').setAttribute('aria-label',
        data.unread_count ? 'Notifications, ' + data.unread_count + ' unread' : 'Notifications');
    });
  }

  /* ---------- "Updated 5 sec ago" and the arrive-by countdown ---------- */

  function tick() {
    if (lastFetchAt) {
      var seconds = Math.round((Date.now() - lastFetchAt) / 1000);
      document.getElementById('updated').textContent =
        'Updated ' + (seconds < 5 ? 'just now' : seconds + ' sec ago');
    }

    // Called: count down to the time the patient must arrive by
    if (ticket && ticket.state === 'called' && ticket.arrive_by) {
      var left = Math.max(0, Math.round((new Date(ticket.arrive_by).getTime() - Date.now()) / 1000));
      var clock = pad(Math.floor(left / 60)) + ':' + pad(left % 60);
      document.getElementById('arriveBy').textContent = clock;
      document.getElementById('calledSub').textContent =
        left > 0 ? 'Please arrive within ' + clock : 'Your time is up. Ask the front desk if you are still here.';
    }
  }

  function pad(n) {
    return (n < 10 ? '0' : '') + n;
  }

  /* ---------- Browser alerts (optional) ---------- */

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

  // Pops up a message when the ticket gets closer (only if the person allowed it)
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
        // some phones only allow alerts from an installed app; ignore
      }
    }
  }

  /* ---------- Drawing the page ---------- */

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

    // Progress bars
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

    // Buttons: "I'm here" until it is pressed, Cancel only before being called
    var arrived = !!t.arrived_at;
    show('hereButton', !arrived);
    show('cancelButton', t.status === 'waiting');
    hereButton.disabled = busy;
    cancelButton.disabled = busy;

    // Clinic queue card
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

    var state = t.state; // completed, skipped, cancelled or expired
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

  /* ---------- Load ---------- */

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

  /* ---------- I'm here ---------- */

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

  /* ---------- Cancel (asks first) ---------- */

  cancelButton.addEventListener('click', function () {
    if (busy) return;
    cancelDialog.showModal();
  });

  // The dialog's two buttons close it and set returnValue to "keep" or "cancel"
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

  /* ---------- Start ---------- */

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
          // Coming back to the tab: refresh at once instead of waiting for the next tick.
          document.addEventListener('visibilitychange', function () {
            if (!document.hidden && !busy) load();
          });
        });
    })
    .catch(function () { /* redirects are already happening */ });
});
