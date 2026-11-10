//board/board.js - board script, theme from ?theme= or the T key (dark by default), redraws the now serving and next up numbers every 5 seconds
(function () {
  var fromUrl = new URLSearchParams(location.search).get('theme');
  if (fromUrl !== 'light' && fromUrl !== 'dark') fromUrl = null;
  var saved = null;
  try {
    saved = localStorage.getItem('cf-board-theme');
  } catch (err) {
  }
  document.documentElement.setAttribute('data-theme', fromUrl || saved || 'dark');
  if (fromUrl) {
    try {
      localStorage.setItem('cf-board-theme', fromUrl);
    } catch (err) {
    }
  }
})();

//apply a theme, remember it, and mark the matching switch button as pressed
function setBoardTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem('cf-board-theme', theme);
  } catch (err) {
  }
  markThemeButtons();
}

function markThemeButtons() {
  var theme = document.documentElement.getAttribute('data-theme');
  document.querySelectorAll('[data-theme-set]').forEach(function (button) {
    button.setAttribute('aria-pressed', String(button.dataset.themeSet === theme));
  });
}

document.addEventListener('keydown', function (e) {
  if ((e.key || '').toLowerCase() !== 't' || e.ctrlKey || e.metaKey || e.altKey) return;
  setBoardTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
});

document.addEventListener('DOMContentLoaded', function () {
  markThemeButtons();
  document.querySelectorAll('[data-theme-set]').forEach(function (button) {
    button.addEventListener('click', function () { setBoardTheme(button.dataset.themeSet); });
  });
});

function el(tag, className, text) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

document.addEventListener('DOMContentLoaded', function () {
  var REFRESH_SECONDS = 5;
  var FAILS_BEFORE_LOST = 2;

  var boardsEl = document.getElementById('boards');
  var emptyMessage = document.getElementById('emptyMessage');
  var loadingMessage = document.getElementById('loadingMessage');
  var footer = document.querySelector('.board-footer');
  var lastUpdatedEl = document.getElementById('lastUpdated');
  var announcer = document.getElementById('announcer');
  var clockDate = document.getElementById('clockDate');
  var clockTime = document.getElementById('clockTime');
  var fullscreenButton = document.getElementById('fullscreenButton');

  var lastData = null;
  var lastUpdatedAt = null;
  var failedInARow = 0;
  var timeZone = undefined;
  var previouslyServing = {};

  if (!document.documentElement.requestFullscreen) {
    fullscreenButton.hidden = true;
  }

  fullscreenButton.addEventListener('click', function () {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen().catch(function () { });
    }
  });

  document.addEventListener('fullscreenchange', function () {
    fullscreenButton.textContent = document.fullscreenElement ? 'Exit full screen' : 'Full screen';
  });

  function updateClock() {
    var now = new Date();
    clockDate.textContent = now.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: timeZone
    });
    clockTime.textContent = now.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', timeZone: timeZone
    });
  }

  function updateLastUpdated() {
    if (!lastUpdatedAt) return;
    var seconds = Math.round((Date.now() - lastUpdatedAt) / 1000);
    var text;
    if (seconds < 10) text = 'just now';
    else if (seconds < 60) text = seconds + ' seconds ago';
    else text = Math.floor(seconds / 60) + ' min ago';

    lastUpdatedEl.textContent = 'Last updated ' + text + '.' +
      (failedInARow >= FAILS_BEFORE_LOST ? ' Trying to reconnect...' : '');
    footer.classList.toggle('is-stale', failedInARow >= FAILS_BEFORE_LOST);
  }

  function formatTime(value) {
    var parts = String(value).split(':');
    var hour = Number(parts[0]);
    var suffix = hour >= 12 ? 'PM' : 'AM';
    return (hour % 12 || 12) + ':' + parts[1] + ' ' + suffix;
  }

  function boardState(service) {
    if (service.state === 'open' && service.unavailable_reason === 'Outside opening hours') return 'closed';
    return service.state;
  }

  function drawService(service, connectionLost) {
    var card = el('section', 'cf-card service-card');
    var head = el('div', 'service-head');
    head.appendChild(el('h2', 'cf-board-label', service.service_name));

    var body = el('div', 'service-body');
    var state = boardState(service);

    if (connectionLost) {
      body.appendChild(el('p', 'board-message', 'Connection lost'));
      body.appendChild(el('p', 'board-note', 'The board cannot receive live updates right now.'));
    } else {
      var badge = el('span', 'cf-badge cf-' + state, state.charAt(0).toUpperCase() + state.slice(1));
      head.appendChild(badge);

      if (state === 'paused') {
        body.appendChild(el('p', 'board-message', 'Service paused'));
        if (service.status_note) body.appendChild(el('p', 'board-note', service.status_note));
      } else if (state === 'closed') {
        body.appendChild(el('p', 'board-message', 'Service closed'));
        body.appendChild(el('p', 'board-note',
          'Hours: ' + formatTime(service.open_time) + ' - ' + formatTime(service.close_time)));
      } else {
        drawOpenService(body, service);
      }
    }

    card.appendChild(head);
    card.appendChild(body);
    return card;
  }

  function drawOpenService(body, service) {
    if (service.serving.length) {
      body.appendChild(el('p', 'board-label', 'Now serving'));
      var list = el('div', 'serving-list');
      service.serving.forEach(function (item) {
        var box = el('div', 'serving-item cf-board-main');
        box.appendChild(el('div', 'board-number cf-board-number', item.ticket_label));
        if (item.room) box.appendChild(el('p', 'board-room', item.room));
        list.appendChild(box);
      });
      body.appendChild(list);
    } else {
      body.appendChild(el('p', 'board-label', 'Nobody serving'));
      var dash = el('div', 'board-number is-empty', '–');
      dash.setAttribute('aria-label', 'No ticket is being served');
      body.appendChild(dash);
    }

    var next = el('div', 'next-up');
    if (service.next_up.length) {
      next.appendChild(el('h3', '', 'Next up'));
      var nextList = el('div', 'next-list cf-board-next');
      service.next_up.forEach(function (label) {
        nextList.appendChild(el('div', 'next-item cf-board-next-item', label));
      });
      next.appendChild(nextList);
    }
    var waiting = service.waiting_count;
    next.appendChild(el('p', 'waiting-count', waiting ? waiting + ' waiting' : 'No one is waiting'));
    body.appendChild(next);
  }

  function draw() {
    if (!lastData) return;
    var lost = failedInARow >= FAILS_BEFORE_LOST;

    boardsEl.textContent = '';
    lastData.services.forEach(function (service) {
      boardsEl.appendChild(drawService(service, lost));
    });
    emptyMessage.hidden = lastData.services.length > 0;
    loadingMessage.hidden = true;
  }

  function announceNewNumbers(data) {
    var now = {};
    data.services.forEach(function (service) {
      service.serving.forEach(function (item) {
        var key = service.service_id + ':' + item.ticket_label;
        now[key] = true;
        if (!previouslyServing[key] && lastUpdatedAt) {
          announcer.textContent = 'Now serving ' + item.ticket_label + (item.room ? ' in ' + item.room : '') + '.';
        }
      });
    });
    previouslyServing = now;
  }

  function refresh() {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 8000);

    fetch('/api/public/board', { signal: controller.signal, cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('bad status');
        return res.json();
      })

      .then(function (data) {
        announceNewNumbers(data);
        lastData = data;
        lastUpdatedAt = Date.now();
        failedInARow = 0;
        timeZone = data.time_zone;
        if (data.clinic_name) {
          document.title = 'Now Serving - ' + data.clinic_name;
        }
        draw();
        updateClock();
        updateLastUpdated();
      })

      .catch(function () {
        failedInARow++;
        if (!lastData) {
          loadingMessage.textContent = "Can't load the queue. Trying again...";
        }
        draw();
        updateLastUpdated();
      })

      .then(function () {
        clearTimeout(timer);
      });
  }

  updateClock();
  refresh();
  setInterval(refresh, REFRESH_SECONDS * 1000);

  setInterval(updateClock, 1000);
  setInterval(updateLastUpdated, 1000);

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) refresh();
  });
});
