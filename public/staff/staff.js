//staff/staff.js - shared code for the staff pages, theme switch, user menu, logout and small helpers
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

function byId(id) {
  return document.getElementById(id);
}

function el(tag, className, text) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function statusClass(status) {
  if (status === 'serving') return 'cf-called';
  if (status === 'expired') return 'cf-cancelled';
  return 'cf-' + status;
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function initials(name) {
  var words = String(name).trim().split(/\s+/);
  var letters = words[0].charAt(0) + (words.length > 1 ? words[words.length - 1].charAt(0) : '');
  return letters.toUpperCase();
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

function pad(n) {
  return (n < 10 ? '0' : '') + n;
}

function openDialog(id) {
  var dialog = byId(id);
  dialog.querySelectorAll('.alert, .cf-error').forEach(function (node) { node.hidden = true; });
  dialog.querySelectorAll('.is-error').forEach(function (node) { node.classList.remove('is-error'); });
  dialog.showModal();
}

function addButton(box, label, className, onClick) {
  var button = el('button', 'link-button' + (className ? ' ' + className : ''), label);
  button.type = 'button';
  button.addEventListener('click', onClick);
  box.appendChild(button);
}

function group(title, pairs) {
  var box = el('div', 'detail-group');
  if (title) box.appendChild(el('h3', '', title));
  var list = el('dl', 'detail-rows');
  pairs.forEach(function (pair) {
    var row = el('div');
    row.appendChild(el('dt', '', pair[0]));
    row.appendChild(el('dd', '', pair[1]));
    list.appendChild(row);
  });
  box.appendChild(list);
  return box;
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
