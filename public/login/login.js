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
  var form = document.getElementById('loginForm');
  var emailInput = document.getElementById('email');
  var passwordInput = document.getElementById('password');
  var emailError = document.getElementById('emailError');
  var passwordError = document.getElementById('passwordError');
  var formAlert = document.getElementById('formAlert');
  var loginButton = document.getElementById('loginButton');
  var togglePassword = document.getElementById('togglePassword');
  var menuButton = document.getElementById('menuButton');
  var siteMenu = document.getElementById('siteMenu');

  /* Theme buttons */
  setTheme(startTheme);
  document.querySelectorAll('[data-theme-set]').forEach(function (button) {
    button.addEventListener('click', function () {
      setTheme(button.dataset.themeSet);
    });
  });

  /* Phone menu */
  menuButton.addEventListener('click', function () {
    var open = siteMenu.classList.toggle('is-open');
    menuButton.setAttribute('aria-expanded', String(open));
  });

  /* Show / Hide password */
  togglePassword.addEventListener('click', function () {
    var hidden = passwordInput.type === 'password';
    passwordInput.type = hidden ? 'text' : 'password';
    togglePassword.textContent = hidden ? 'Hide' : 'Show';
  });

  /* Where each kind of user goes after logging in */
  function homeFor(user) {
    if (user.mustChangePassword) return '/force-password/force-password.html';
    if (user.role === 'admin') return '/admin/dashboard.html';
    if (user.role === 'staff') return '/staff/console.html';
    return '/patient/home.html';
  }

  // Already logged in? Skip the form.
  fetch('/api/auth/me')
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (data) {
      if (data && data.user) window.location.replace(homeFor(data.user));
    })
    .catch(function () { /* server not reachable: just show the form */ });

  /* Error helpers */
  function showFieldError(input, errorEl, message) {
    input.classList.add('is-error');
    input.setAttribute('aria-invalid', 'true');
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function clearErrors() {
    [emailInput, passwordInput].forEach(function (input) {
      input.classList.remove('is-error');
      input.removeAttribute('aria-invalid');
    });
    emailError.hidden = true;
    passwordError.hidden = true;
    formAlert.hidden = true;
  }

  function showAlert(message) {
    formAlert.textContent = message;
    formAlert.hidden = false;
  }

  /* Submit */
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    clearErrors();

    var email = emailInput.value.trim();
    var password = passwordInput.value;
    var valid = true;

    if (!email) {
      showFieldError(emailInput, emailError, 'Enter your email.');
      valid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showFieldError(emailInput, emailError, 'Enter a valid email, like name@example.com.');
      valid = false;
    }
    if (!password) {
      showFieldError(passwordInput, passwordError, 'Enter your password.');
      valid = false;
    }
    if (!valid) {
      (emailError.hidden ? passwordInput : emailInput).focus();
      return;
    }

    loginButton.disabled = true;
    loginButton.textContent = 'Logging in...';

    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password })
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          return { status: res.status, data: data };
        });
      })
      .then(function (result) {
        if (result.status === 200) {
          window.location.href = homeFor(result.data.user);
          return;
        }
        // The server's wording is used for the lock message because it says how long to wait.
        if (result.status === 401) showAlert('Invalid email or password.');
        else if (result.status === 403) showAlert('This account is deactivated. Please contact the clinic.');
        else if (result.status === 429) showAlert(result.data.error || 'Too many attempts. Please try again later.');
        else showAlert('Something went wrong. Please try again.');
        loginButton.disabled = false;
        loginButton.textContent = 'Login';
      })
      .catch(function () {
        showAlert("Can't reach the server. Check your connection and try again.");
        loginButton.disabled = false;
        loginButton.textContent = 'Login';
      });
  });
});
