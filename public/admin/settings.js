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
  var userButton = document.getElementById('userButton');
  var userMenu = document.getElementById('userMenu');
  var form = document.getElementById('settingsForm');

  var timeZone = undefined;   // the clinic's time zone, used for the clock
  var toastTimer = null;

  // The standard values used by "Reset to defaults"
  var DEFAULTS = { near_threshold: 3, grace_minutes: 10, default_travel_minutes: 15 };

  function byId(id) {
    return document.getElementById(id);
  }

  /* Theme buttons */
  setTheme(startTheme);
  document.querySelectorAll('[data-theme-set]').forEach(function (button) {
    button.addEventListener('click', function () {
      setTheme(button.dataset.themeSet);
    });
  });

  /* ---------- Small helpers ---------- */

  // "Clinic Admin" -> "CA"
  function initials(name) {
    var words = String(name).trim().split(/\s+/);
    var letters = words[0].charAt(0) + (words.length > 1 ? words[words.length - 1].charAt(0) : '');
    return letters.toUpperCase();
  }

  function updateClock() {
    var options = {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit'
    };
    try {
      options.timeZone = timeZone;
      byId('clock').textContent = new Date().toLocaleString('en-US', options);
    } catch (err) {
      delete options.timeZone; // an unknown time zone: fall back to this device's
      byId('clock').textContent = new Date().toLocaleString('en-US', options);
    }
  }

  function toast(message, isError) {
    var box = byId('toast');
    box.textContent = message;
    box.className = 'toast' + (isError ? ' is-error' : '');
    box.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { box.hidden = true; }, 4000);
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
    if (event.key === 'Escape') closeMenu();
  });

  byId('logoutButton').addEventListener('click', function () {
    fetch('/api/auth/logout', { method: 'POST' })
      .catch(function () { /* leave the page either way */ })
      .then(function () { window.location.href = '/login/login.html'; });
  });

  /* ---------- Talking to the server ---------- */

  // Sends a request and resolves to { status, data }. A logged-out person goes to the login page.
  function send(method, url, body) {
    var options = { method: method, cache: 'no-store' };
    if (body !== undefined) {
      options.headers = { 'Content-Type': 'application/json' };
      options.body = JSON.stringify(body);
    }
    return fetch(url, options).then(function (res) {
      if (res.status === 401) {
        window.location.replace('/login/login.html');
        throw new Error('not logged in');
      }
      if (res.status === 403) {
        window.location.replace('/error/error.html?code=403');
        throw new Error('not allowed');
      }
      return res.json().catch(function () { return {}; }).then(function (json) {
        return { status: res.status, data: json };
      });
    });
  }

  /* ---------- The form ---------- */

  function fillForm(settings) {
    byId('sName').value = settings.clinic_name;
    byId('sZone').value = settings.time_zone;
    byId('sNear').value = settings.near_threshold;
    byId('sGrace').value = settings.grace_minutes;
    byId('sTravel').value = settings.default_travel_minutes;
  }

  function clearErrors() {
    form.querySelectorAll('.cf-error').forEach(function (node) { node.hidden = true; });
    form.querySelectorAll('.is-error').forEach(function (node) { node.classList.remove('is-error'); });
    byId('pageAlert').hidden = true;
  }

  function fieldError(inputId, message) {
    var input = byId(inputId);
    input.classList.add('is-error');
    byId(inputId + 'Error').textContent = message;
    byId(inputId + 'Error').hidden = false;
    return input;
  }

  // True when the text is a whole number of at least `min`
  function wholeNumber(text, min) {
    return /^\d+$/.test(text) && Number(text) >= min;
  }

  function validZone(zone) {
    try {
      new Intl.DateTimeFormat('en', { timeZone: zone });
      return true;
    } catch (err) {
      return false;
    }
  }

  // Suggestions for the time zone box (not every browser has this function)
  if (Intl.supportedValuesOf) {
    Intl.supportedValuesOf('timeZone').forEach(function (zone) {
      var option = document.createElement('option');
      option.value = zone;
      byId('zoneList').appendChild(option);
    });
  }

  byId('resetButton').addEventListener('click', function () {
    clearErrors();
    byId('sNear').value = DEFAULTS.near_threshold;
    byId('sGrace').value = DEFAULTS.grace_minutes;
    byId('sTravel').value = DEFAULTS.default_travel_minutes;
    toast('Defaults filled in. Press Save to keep them.');
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    clearErrors();

    var name = byId('sName').value.trim();
    var zone = byId('sZone').value.trim();
    var near = byId('sNear').value.trim();
    var grace = byId('sGrace').value.trim();
    var travel = byId('sTravel').value.trim();
    var firstBad = null;

    function bad(id, message) {
      var input = fieldError(id, message);
      if (!firstBad) firstBad = input;
    }

    // The same rules the server checks, so people see the problem before sending
    if (!name) bad('sName', 'Clinic name is required.');
    if (!zone || !validZone(zone)) bad('sZone', 'Enter a valid time zone, for example Asia/Manila.');
    if (!wholeNumber(near, 1)) bad('sNear', 'Enter a whole number, 1 or more.');
    if (!wholeNumber(grace, 0)) bad('sGrace', 'Enter a whole number, 0 or more.');
    if (!wholeNumber(travel, 0)) bad('sTravel', 'Enter a whole number, 0 or more.');
    if (firstBad) {
      firstBad.focus();
      return;
    }

    byId('saveButton').disabled = true;
    send('PATCH', '/api/admin/settings', {
      clinic_name: name,
      time_zone: zone,
      near_threshold: Number(near),
      grace_minutes: Number(grace),
      default_travel_minutes: Number(travel)
    })
      .then(function (result) {
        if (result.status !== 200) {
          byId('pageAlert').textContent = result.data.error || 'Something went wrong.';
          byId('pageAlert').hidden = false;
          return;
        }
        var saved = result.data.settings;
        fillForm(saved);
        timeZone = saved.time_zone;
        updateClock();
        toast('Settings saved');
      })
      .catch(function (err) {
        if (err.message === 'not logged in' || err.message === 'not allowed') return;
        byId('pageAlert').textContent = "Can't reach the server. Check your connection and try again.";
        byId('pageAlert').hidden = false;
      })
      .then(function () { byId('saveButton').disabled = false; });
  });

  /* ---------- Start ---------- */

  send('GET', '/api/auth/me')
    .then(function (result) {
      var user = result.data.user;
      if (!user) return null;
      if (user.mustChangePassword) {
        window.location.replace('/force-password/force-password.html');
        return null;
      }
      if (user.role === 'patient') { window.location.replace('/patient/home.html'); return null; }
      if (user.role === 'staff') { window.location.replace('/staff/console.html'); return null; }

      byId('headerName').textContent = user.name;
      byId('headerInitials').textContent = initials(user.name);

      return send('GET', '/api/admin/settings').then(function (settingsResult) {
        byId('loading').hidden = true;
        if (settingsResult.status !== 200) {
          byId('pageAlert').textContent = settingsResult.data.error || "Can't load settings.";
          byId('pageAlert').hidden = false;
          return;
        }
        var settings = settingsResult.data.settings;
        timeZone = settings.time_zone;
        fillForm(settings);
        form.hidden = false;
        updateClock();
        setInterval(updateClock, 30 * 1000);
      });
    })
    .catch(function (err) {
      if (err.message === 'not logged in' || err.message === 'not allowed') return;
      byId('loading').hidden = true;
      byId('pageAlert').textContent = "Can't load settings. Check your connection and try again.";
      byId('pageAlert').hidden = false;
    });
});
