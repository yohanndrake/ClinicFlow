//index.js - landing page script, theme switch, phone menu, live service cards every 10 seconds and login aware buttons
function savedTheme() {
  try {
    return localStorage.getItem('cf-theme');
  } catch (err) {
    return null;
  }
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem('cf-theme', theme);
  } catch (err) {
  }
  document.querySelectorAll('[data-theme-set]').forEach(function (button) {
    button.setAttribute('aria-pressed', String(button.dataset.themeSet === theme));
  });
}

var startTheme = savedTheme() ||
  (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
document.documentElement.setAttribute('data-theme', startTheme);

function el(tag, className, text) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatTime(value) {
  var parts = String(value).split(':');
  var hour = Number(parts[0]);
  return (hour % 12 || 12) + ':' + parts[1] + ' ' + (hour >= 12 ? 'PM' : 'AM');
}

document.addEventListener('DOMContentLoaded', function () {
  setTheme(startTheme);
  document.querySelectorAll('[data-theme-set]').forEach(function (button) {
    button.addEventListener('click', function () {
      setTheme(button.dataset.themeSet);
    });
  });
});

document.addEventListener('DOMContentLoaded', function () {
  var REFRESH_SECONDS = 10;

  var menuButton = document.getElementById('menuButton');
  var siteMenu = document.getElementById('siteMenu');
  var servicesEl = document.getElementById('services');
  var queueMessage = document.getElementById('queueMessage');

  menuButton.addEventListener('click', function () {
    var open = siteMenu.classList.toggle('is-open');
    menuButton.setAttribute('aria-expanded', String(open));
  });

  function homeFor(user) {
    if (user.mustChangePassword) return '/force-password/force-password.html';
    if (user.role === 'admin') return '/admin/dashboard.html';
    if (user.role === 'staff') return '/staff/console.html';
    return '/patient/home.html';
  }

  fetch('/api/auth/me')
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (data) {
      if (!data || !data.user) return;
      var home = homeFor(data.user);
      document.getElementById('menuLogin').hidden = true;
      document.getElementById('menuRegister').hidden = true;
      var account = document.getElementById('menuAccount');
      account.href = home;
      account.hidden = false;

      document.getElementById('takeNumberButton').href =
        data.user.role === 'patient' && !data.user.mustChangePassword ? '/patient/take-number.html' : home;
    })
    .catch(function () { });

  function cardState(service) {
    if (service.state === 'open' && service.unavailable_reason === 'Outside opening hours') return 'closed';
    return service.state;
  }

  function fact(label, value, className) {
    var box = el('div', 'fact' + (className ? ' ' + className : ''));
    box.appendChild(el('dt', '', label));
    box.appendChild(el('dd', '', value));
    return box;
  }

  function drawService(service) {
    var state = cardState(service);
    var card = el('article', 'cf-card cf-card-raised');

    var head = el('div', 'service-head');
    head.appendChild(el('h3', '', service.service_name));
    head.appendChild(el('span', 'cf-badge cf-' + state, state.charAt(0).toUpperCase() + state.slice(1)));
    card.appendChild(head);

    var hours = formatTime(service.open_time) + ' - ' + formatTime(service.close_time);
    var facts = el('dl', 'facts');

    if (state === 'open') {
      var serving = service.serving.map(function (item) { return item.ticket_label; }).join(', ');
      facts.appendChild(fact('Now serving', serving || '–', 'big'));
      facts.appendChild(fact('Queue', service.waiting_count ? service.waiting_count + ' waiting' : 'No one waiting'));
      facts.appendChild(fact('Hours', hours, 'wide'));
      card.appendChild(facts);
      if (service.rooms.length) {
        card.appendChild(el('p', 'service-note', service.rooms.join(', ')));
      }
    } else {
      card.appendChild(el('p', 'service-note',
        state === 'paused'
          ? 'This service is paused' + (service.status_note ? ': ' + service.status_note : '.')
          : 'This service is closed.'));
      facts.appendChild(fact('Hours', hours, 'wide'));
      card.appendChild(facts);
    }
    return card;
  }

  function showFooterHours(services) {
    if (!services.length) return;
    var open = services[0].open_time;
    var close = services[0].close_time;
    services.forEach(function (s) {
      if (s.open_time < open) open = s.open_time;
      if (s.close_time > close) close = s.close_time;
    });
    document.getElementById('footerHours').textContent = formatTime(open) + ' - ' + formatTime(close);
  }

  function loadQueue() {
    fetch('/api/public/board', { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('bad status');
        return res.json();
      })
      .then(function (data) {
        if (data.clinic_name) {
          document.getElementById('heroClinicName').textContent = data.clinic_name;
          document.getElementById('footerName').textContent = data.clinic_name;
        }

        servicesEl.textContent = '';
        data.services.forEach(function (service) {
          servicesEl.appendChild(drawService(service));
        });

        queueMessage.hidden = data.services.length > 0;
        if (!data.services.length) queueMessage.textContent = 'No services are available right now.';
        showFooterHours(data.services);
      })

      .catch(function () {
        if (!servicesEl.children.length) {
          queueMessage.hidden = false;
          queueMessage.textContent = "Can't load today's queue right now. Please try again in a moment.";
        }
      });
  }

  loadQueue();
  setInterval(loadQueue, REFRESH_SECONDS * 1000);
});
