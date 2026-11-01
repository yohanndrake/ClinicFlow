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
  var form = document.getElementById('passwordForm');
  var saveButton = document.getElementById('saveButton');
  var formAlert = document.getElementById('formAlert');
  var successPanel = document.getElementById('successPanel');
  var userButton = document.getElementById('userButton');
  var userMenu = document.getElementById('userMenu');

  // Each field and the little red message under it
  var fields = {
    current: { input: document.getElementById('current'), error: document.getElementById('currentError') },
    newPassword: { input: document.getElementById('newPassword'), error: document.getElementById('newPasswordError') },
    confirm: { input: document.getElementById('confirm'), error: document.getElementById('confirmError') }
  };

  /* Theme buttons */
  setTheme(startTheme);
  document.querySelectorAll('[data-theme-set]').forEach(function (button) {
    button.addEventListener('click', function () {
      setTheme(button.dataset.themeSet);
    });
  });

  /* ---------- Small helpers ---------- */

  function homeFor(role) {
    if (role === 'admin') return '/admin/dashboard.html';
    if (role === 'staff') return '/staff/console.html';
    return '/patient/home.html';
  }

  // "Maria Santos" -> "MS"
  function initials(name) {
    var words = String(name).trim().split(/\s+/);
    var letters = words[0].charAt(0) + (words.length > 1 ? words[words.length - 1].charAt(0) : '');
    return letters.toUpperCase();
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

  /* ---------- Show / Hide buttons (one for each password box) ---------- */

  document.querySelectorAll('.show-hide').forEach(function (button) {
    button.addEventListener('click', function () {
      var input = document.getElementById(button.dataset.target);
      var hidden = input.type === 'password';
      input.type = hidden ? 'text' : 'password';
      button.textContent = hidden ? 'Hide' : 'Show';
    });
  });

  /* ---------- Who is this? ---------- */

  fetch('/api/auth/me')
    .then(function (res) {
      if (res.status === 401) {
        window.location.replace('/login/login.html');
        return null;
      }
      return res.json();
    })
    .then(function (data) {
      if (!data) return;
      // Someone on a temporary password uses the forced page instead
      if (data.user.mustChangePassword) {
        window.location.replace('/force-password/force-password.html');
        return;
      }
      document.getElementById('headerName').textContent = data.user.name;
      document.getElementById('headerInitials').textContent = initials(data.user.name);
      document.getElementById('backButton').href = homeFor(data.user.role);
    })
    .catch(function () { /* the form still works without the name */ });

  /* ---------- Error helpers ---------- */

  function showFieldError(name, message) {
    var field = fields[name];
    field.input.classList.add('is-error');
    field.input.setAttribute('aria-invalid', 'true');
    field.error.textContent = message;
    field.error.hidden = false;
  }

  function clearErrors() {
    Object.keys(fields).forEach(function (name) {
      fields[name].input.classList.remove('is-error');
      fields[name].input.removeAttribute('aria-invalid');
      fields[name].error.hidden = true;
    });
    formAlert.hidden = true;
  }

  function showAlert(message) {
    formAlert.textContent = message;
    formAlert.hidden = false;
  }

  // Put the cursor in the first field that has a problem
  function focusFirstError() {
    var order = ['current', 'newPassword', 'confirm'];
    for (var i = 0; i < order.length; i++) {
      if (!fields[order[i]].error.hidden) {
        fields[order[i]].input.focus();
        return;
      }
    }
  }

  function resetButton() {
    saveButton.disabled = false;
    saveButton.textContent = 'Save';
  }

  /* ---------- Save ---------- */

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    clearErrors();

    var current = fields.current.input.value;
    var newPassword = fields.newPassword.input.value;
    var confirm = fields.confirm.input.value;
    var valid = true;

    // These are the same rules the server checks, so people see problems before the request is sent.
    if (!current) {
      showFieldError('current', 'Enter your current password.');
      valid = false;
    }
    if (!newPassword) {
      showFieldError('newPassword', 'Enter a new password.');
      valid = false;
    } else if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      showFieldError('newPassword', 'Weak password: use at least 8 characters with a letter and a number.');
      valid = false;
    } else if (current && newPassword === current) {
      showFieldError('newPassword', 'The new password must be different from your current password.');
      valid = false;
    }
    if (!confirm) {
      showFieldError('confirm', 'Type your new password again.');
      valid = false;
    } else if (newPassword && confirm !== newPassword) {
      showFieldError('confirm', "Passwords don't match.");
      valid = false;
    }
    if (!valid) {
      focusFirstError();
      return;
    }

    saveButton.disabled = true;
    saveButton.textContent = 'Saving...';

    fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: current, new_password: newPassword })
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          return { status: res.status, data: data };
        });
      })
      .then(function (result) {
        var message = result.data.error || '';

        if (result.status === 200) {
          // The server has logged the person out, so show the message and the login button.
          form.hidden = true;
          successPanel.hidden = false;
          closeMenu();
          successPanel.querySelector('a').focus();
          return;
        }
        if (result.status === 401 && /current password/i.test(message)) {
          showFieldError('current', 'Your current password is incorrect.');
        } else if (result.status === 401) {
          window.location.replace('/login/login.html'); // the login expired
          return;
        } else if (result.status === 400 && /different/i.test(message)) {
          showFieldError('newPassword', 'The new password must be different from your current password.');
        } else if (result.status === 400 && /password/i.test(message)) {
          showFieldError('newPassword', message);
        } else {
          showAlert(message || 'Something went wrong. Please try again.');
        }
        focusFirstError();
        resetButton();
      })
      .catch(function () {
        showAlert("Can't reach the server. Check your connection and try again.");
        resetButton();
      });
  });
});
