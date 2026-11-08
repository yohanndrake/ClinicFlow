//change-password/change-password.js - change password script, checks the form, saves the new password then logs the user out
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

function initials(name) {
  var words = String(name).trim().split(/\s+/);
  var letters = words[0].charAt(0) + (words.length > 1 ? words[words.length - 1].charAt(0) : '');
  return letters.toUpperCase();
}

function homeFor(role) {
  if (role === 'admin') return '/admin/dashboard.html';
  if (role === 'staff') return '/staff/console.html';
  return '/patient/home.html';
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

document.addEventListener('DOMContentLoaded', function () {
  var form = document.getElementById('passwordForm');
  var saveButton = document.getElementById('saveButton');
  var formAlert = document.getElementById('formAlert');
  var successPanel = document.getElementById('successPanel');

  var fields = {
    current: { input: document.getElementById('current'), error: document.getElementById('currentError') },
    newPassword: { input: document.getElementById('newPassword'), error: document.getElementById('newPasswordError') },
    confirm: { input: document.getElementById('confirm'), error: document.getElementById('confirmError') }
  };

  document.querySelectorAll('.show-hide').forEach(function (button) {
    button.addEventListener('click', function () {
      var input = document.getElementById(button.dataset.target);
      var hidden = input.type === 'password';
      input.type = hidden ? 'text' : 'password';
      button.textContent = hidden ? 'Hide' : 'Show';
    });
  });

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
      if (data.user.mustChangePassword) {
        window.location.replace('/force-password/force-password.html');
        return;
      }
      document.getElementById('headerName').textContent = data.user.name;
      document.getElementById('headerInitials').textContent = initials(data.user.name);
      document.getElementById('backButton').href = homeFor(data.user.role);
    })
    .catch(function () { });

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

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    clearErrors();

    var current = fields.current.input.value;
    var newPassword = fields.newPassword.input.value;
    var confirm = fields.confirm.input.value;
    var valid = true;

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
          form.hidden = true;
          successPanel.hidden = false;
          closeMenu();
          successPanel.querySelector('a').focus();
          return;
        }
        if (result.status === 401 && /current password/i.test(message)) {
          showFieldError('current', 'Your current password is incorrect.');
        } else if (result.status === 401) {
          window.location.replace('/login/login.html');
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
