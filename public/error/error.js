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
  var titleEl = document.getElementById('errorTitle');
  var messageEl = document.getElementById('errorMessage');
  var retryButton = document.getElementById('retryButton');

  /* Theme buttons */
  setTheme(startTheme);
  document.querySelectorAll('[data-theme-set]').forEach(function (button) {
    button.addEventListener('click', function () {
      setTheme(button.dataset.themeSet);
    });
  });

  /* Which error is this? Other pages send people here with /error/error.html?code=403.
     A page the server could not find is shown with no code at all, so that counts as 404. */
  var errors = {
    '404': {
      title: '404 Not Found',
      message: "We couldn't find the page you were looking for."
    },
    '403': {
      title: '403 Access Denied',
      message: "You don't have permission to view this page."
    },
    '500': {
      title: 'Something went wrong',
      message: 'Something went wrong on our side. Please try again in a moment.'
    }
  };

  var code = new URLSearchParams(window.location.search).get('code');
  var error = errors[code] || errors['404'];

  titleEl.textContent = error.title;
  messageEl.textContent = error.message;
  document.title = error.title + ' - ClinicFlow';

  // A server error is often temporary, so offer another go.
  if (code === '500') {
    retryButton.hidden = false;
    retryButton.addEventListener('click', function () {
      // go back to the page that failed if there is one, otherwise to the home page
      if (document.referrer && document.referrer.indexOf(window.location.origin) === 0) {
        window.location.href = document.referrer;
      } else {
        window.location.href = '/';
      }
    });
  }
});
