//register/register.js - register page script, checks the form, creates the patient account and logs them in
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

document.addEventListener('DOMContentLoaded', function () {
  setTheme(startTheme);
  document.querySelectorAll('[data-theme-set]').forEach(function (button) {
    button.addEventListener('click', function () {
      setTheme(button.dataset.themeSet);
    });
  });
});

document.addEventListener('DOMContentLoaded', function () {
  var form = document.getElementById('registerForm');
  var registerButton = document.getElementById('registerButton');
  var formAlert = document.getElementById('formAlert');
  var menuButton = document.getElementById('menuButton');
  var siteMenu = document.getElementById('siteMenu');

  var fields = {
    fullName: { input: document.getElementById('fullName'), error: document.getElementById('fullNameError') },
    email: { input: document.getElementById('email'), error: document.getElementById('emailError') },
    contact: { input: document.getElementById('contact'), error: document.getElementById('contactError') },
    password: { input: document.getElementById('password'), error: document.getElementById('passwordError') },
    confirm: { input: document.getElementById('confirm'), error: document.getElementById('confirmError') }
  };

  menuButton.addEventListener('click', function () {
    var open = siteMenu.classList.toggle('is-open');
    menuButton.setAttribute('aria-expanded', String(open));
  });

  document.querySelectorAll('.show-hide').forEach(function (button) {
    button.addEventListener('click', function () {
      var input = document.getElementById(button.dataset.target);
      var hidden = input.type === 'password';
      input.type = hidden ? 'text' : 'password';
      button.textContent = hidden ? 'Hide' : 'Show';
    });
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
      if (data && data.user) window.location.replace(homeFor(data.user));
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
    var order = ['fullName', 'email', 'contact', 'password', 'confirm'];
    for (var i = 0; i < order.length; i++) {
      if (!fields[order[i]].error.hidden) {
        fields[order[i]].input.focus();
        return;
      }
    }
  }

  function resetButton() {
    registerButton.disabled = false;
    registerButton.textContent = 'Register';
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    clearErrors();

    var fullName = fields.fullName.input.value.trim();
    var email = fields.email.input.value.trim();
    var contact = fields.contact.input.value.trim();
    var password = fields.password.input.value;
    var confirm = fields.confirm.input.value;
    var valid = true;

    if (!fullName) {
      showFieldError('fullName', 'Enter your full name.');
      valid = false;
    } else if (!/\S\s+\S/.test(fullName)) {
      showFieldError('fullName', 'Enter your first and last name.');
      valid = false;
    }
    if (!email) {
      showFieldError('email', 'Enter your email.');
      valid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showFieldError('email', 'Enter a valid email, like name@example.com.');
      valid = false;
    }
    if (contact && !/^[0-9+()\-\s]{1,20}$/.test(contact)) {
      showFieldError('contact', 'Use only digits, spaces, + - ( ).');
      valid = false;
    }
    if (!password) {
      showFieldError('password', 'Enter a password.');
      valid = false;
    } else if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      showFieldError('password', 'Weak password: use at least 8 characters with a letter and a number.');
      valid = false;
    }
    if (!confirm) {
      showFieldError('confirm', 'Type your password again.');
      valid = false;
    } else if (password && confirm !== password) {
      showFieldError('confirm', "Passwords don't match.");
      valid = false;
    }
    if (!valid) {
      focusFirstError();
      return;
    }

    registerButton.disabled = true;
    registerButton.textContent = 'Creating account...';

    var body = { full_name: fullName, email: email, password: password };
    if (contact) body.contact_number = contact;

    fetch('/api/auth/register', {
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
          window.location.href = '/patient/home.html';
          return;
        }
        if (result.status === 409) {
          showFieldError('email', 'This email is already used. Try logging in instead.');
        } else if (result.status === 400 && /password/i.test(result.data.error || '')) {
          showFieldError('password', result.data.error);
        } else if (result.status === 400 && /contact/i.test(result.data.error || '')) {
          showFieldError('contact', result.data.error);
        } else if (result.status === 400 && /email/i.test(result.data.error || '')) {
          showFieldError('email', result.data.error);
        } else {
          showAlert(result.data.error || 'Something went wrong. Please try again.');
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
