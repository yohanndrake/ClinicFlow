//profile/profile.js - profile script, loads the account details and saves the name and contact number
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
  var form = document.getElementById('profileForm');
  var saveButton = document.getElementById('saveButton');
  var formAlert = document.getElementById('formAlert');
  var toast = document.getElementById('toast');

  var fields = {
    firstName: { input: document.getElementById('firstName'), error: document.getElementById('firstNameError') },
    lastName: { input: document.getElementById('lastName'), error: document.getElementById('lastNameError') },
    contact: { input: document.getElementById('contact'), error: document.getElementById('contactError') }
  };

  var roleNames = { patient: 'Patient', staff: 'Staff', admin: 'Admin' };

  //words that belong to the last name, like "Dela" in Juan Dela Cruz
  var NAME_PARTICLES = ['de', 'del', 'dela', 'della', 'delos', 'los', 'las', 'la', 'san', 'santa', 'sta.', 'sto.', 'van', 'von', 'da', 'di', 'du'];

  //splits a saved full name into first and last name: the last word, plus any particles before it, is the last name
  function splitName(full) {
    var words = String(full || '').trim().split(/\s+/);
    if (words.length < 2) return { first: words[0] || '', last: '' };
    var start = words.length - 1;
    while (start > 1 && NAME_PARTICLES.indexOf(words[start - 1].toLowerCase()) !== -1) start--;
    return { first: words.slice(0, start).join(' '), last: words.slice(start).join(' ') };
  }

  //capitalizes the first letter of each word (after a space, - or '), leaving the rest as typed
  function capitalizeName(value) {
    return value.replace(/(^|[\s'-])(\p{L})/gu, function (match, before, letter) {
      return before + letter.toUpperCase();
    });
  }

  //checks a first or last name: at least 2 letters, using letters, spaces, - ' . only
  function nameProblem(value, emptyMessage) {
    if (!value) return emptyMessage;
    if (!/^[\p{L}\s.'-]+$/u.test(value)) return "Use letters, spaces, - ' . only.";
    if (value.replace(/[^\p{L}]/gu, '').length < 2) return 'Use at least 2 letters.';
    return '';
  }
  var toastTimer = null;

  function showName(name, role) {
    document.getElementById('headerName').textContent = name;
    document.getElementById('headerInitials').textContent = initials(name);
    document.getElementById('avatarInitials').textContent = initials(name);
    document.getElementById('whoName').textContent = name;
    document.getElementById('whoRole').textContent = roleNames[role] || role;
  }

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

  function showToast() {
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.hidden = true; }, 4000);
  }

  var role = 'patient';

  fetch('/api/auth/me')
    .then(function (res) {
      if (res.status === 401) {
        window.location.replace('/login/login.html');
        return null;
      }
      return res.json();
    })
    .then(function (data) {
      if (!data) return null;

      role = data.user.role;
      document.getElementById('backButton').href = homeFor(role);

      if (data.user.mustChangePassword) {
        window.location.replace('/force-password/force-password.html');
        return null;
      }
      return fetch('/api/auth/profile');
    })
    .then(function (res) {
      if (!res) return null;
      if (!res.ok) throw new Error('bad status');
      return res.json();
    })
    .then(function (data) {
      if (!data) return;
      var profile = data.profile;

      var parts = splitName(profile.full_name);
      fields.firstName.input.value = parts.first;
      fields.lastName.input.value = parts.last;
      fields.contact.input.value = profile.contact_number || '';
      document.getElementById('email').value = profile.email;
      document.getElementById('role').value = roleNames[profile.role] || profile.role;
      showName(profile.full_name, profile.role);

      fields.firstName.input.disabled = false;
      fields.lastName.input.disabled = false;
      fields.contact.input.disabled = false;
      saveButton.disabled = false;
    })

    .catch(function () {
      document.getElementById('whoName').textContent = '';
      showAlert("Can't load your details. Check your connection and refresh the page.");
    });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    clearErrors();
    toast.hidden = true;

    var firstName = capitalizeName(fields.firstName.input.value.trim());
    var lastName = capitalizeName(fields.lastName.input.value.trim());
    fields.firstName.input.value = firstName;
    fields.lastName.input.value = lastName;
    var fullName = firstName + ' ' + lastName;
    var contact = fields.contact.input.value.trim();
    var valid = true;

    var firstProblem = nameProblem(firstName, 'Enter your first name.');
    if (firstProblem) {
      showFieldError('firstName', firstProblem);
      valid = false;
    }
    var lastProblem = nameProblem(lastName, 'Enter your last name.');
    if (lastProblem) {
      showFieldError('lastName', lastProblem);
      valid = false;
    }
    if (contact && !/^[0-9+()\-\s]{1,20}$/.test(contact)) {
      showFieldError('contact', 'Use only digits, spaces, + - ( ).');
      valid = false;
    }
    if (!valid) {
      ['firstName', 'lastName', 'contact'].some(function (name) {
        if (fields[name].error.hidden) return false;
        fields[name].input.focus();
        return true;
      });
      return;
    }

    saveButton.disabled = true;
    saveButton.textContent = 'Saving...';

    fetch('/api/auth/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: fullName, contact_number: contact })
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          return { status: res.status, data: data };
        });
      })

      .then(function (result) {
        if (result.status === 200) {
          showName(fullName, role);
          showToast();
        } else if (result.status === 401) {
          window.location.replace('/login/login.html');
          return;
        } else if (result.status === 400 && /contact/i.test(result.data.error || '')) {
          showFieldError('contact', result.data.error);
        } else if (result.status === 400 && /name/i.test(result.data.error || '')) {
          showFieldError('firstName', result.data.error);
        } else {
          showAlert(result.data.error || 'Something went wrong. Please try again.');
        }
      })

      .catch(function () {
        showAlert("Can't reach the server. Check your connection and try again.");
      })
      .then(function () {
        saveButton.disabled = false;
        saveButton.textContent = 'Save';
      });
  });
});
