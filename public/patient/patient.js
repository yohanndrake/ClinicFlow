//patient/patient.js - shared code for all patient pages, theme switch, user menu, logout, notification bell and small helpers
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

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function initials(name) {
  var words = String(name).trim().split(/\s+/);
  var letters = words[0].charAt(0) + (words.length > 1 ? words[words.length - 1].charAt(0) : '');
  return letters.toUpperCase();
}

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

function formatTime(value) {
  var parts = String(value).split(':');
  var hour = Number(parts[0]);
  return (hour % 12 || 12) + ':' + parts[1] + ' ' + (hour >= 12 ? 'PM' : 'AM');
}

function minutesText(minutes) {
  if (minutes === null || minutes === undefined) return '—';
  return Math.round(minutes) + ' min';
}

function formatDay(isoDate) {
  var parts = String(isoDate).split('-');
  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months[Number(parts[1]) - 1] + ' ' + Number(parts[2]) + ', ' + parts[0];
}

function pad(n) {
  return (n < 10 ? '0' : '') + n;
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

function closeMenu() {
  var userMenu = document.getElementById('userMenu');
  var userButton = document.getElementById('userButton');
  if (!userMenu || !userButton) return;
  userMenu.hidden = true;
  userButton.setAttribute('aria-expanded', 'false');
}

document.addEventListener('DOMContentLoaded', function () {
  setTheme(startTheme);
  document.querySelectorAll('[data-theme-set]').forEach(function (button) {
    button.addEventListener('click', function () {
      setTheme(button.dataset.themeSet);
    });
  });

  var userButton = document.getElementById('userButton');
  var userMenu = document.getElementById('userMenu');
  if (userButton && userMenu) {
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
  }

  var logoutButton = document.getElementById('logoutButton');
  if (logoutButton) {
    logoutButton.addEventListener('click', function () {
      fetch('/api/auth/logout', { method: 'POST' })
        .catch(function () { })
        .then(function () { window.location.href = '/login/login.html'; });
    });
  }
});
