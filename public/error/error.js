//error/error.js - error page script, theme switch and the message for the error code in the address
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
  var titleEl = document.getElementById('errorTitle');
  var messageEl = document.getElementById('errorMessage');
  var retryButton = document.getElementById('retryButton');

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

  if (code === '500') {
    retryButton.hidden = false;
    retryButton.addEventListener('click', function () {
      if (document.referrer && document.referrer.indexOf(window.location.origin) === 0) {
        window.location.href = document.referrer;
      } else {
        window.location.href = '/';
      }
    });
  }
});
