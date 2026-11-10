//staff/console.js - queue console script, call next, complete, skip, walk ins, edit or delete tickets, pause or close the service
document.addEventListener('DOMContentLoaded', function () {
  var REFRESH_SECONDS = 5;

  var userMenu = document.getElementById('userMenu');

  var timeZone = undefined;
  var services = [];
  var serviceId = null;
  var data = null;
  var deletedTickets = [];
  var tab = 'waiting';
  var showDeleted = false;
  var loading = false;
  var failures = 0;
  var toastTimer = null;
  var activeTicket = null;

  function clockText(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: timeZone });
  }

  function dateTimeText(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: timeZone
    });
  }

  function updateClock() {
    byId('clock').textContent = new Date().toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZone: timeZone
    });
  }

  function currentService() {
    return data && data.service;
  }

  document.addEventListener('click', function (event) {
    if (!userMenu.contains(event.target)) closeMenu();
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      closeMenu();
    }
  });

  byId('logoutButton').addEventListener('click', function () {
    fetch('/api/auth/logout', { method: 'POST' })
      .catch(function () { })
      .then(function () { window.location.href = '/login/login.html'; });
  });

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
      return res.json().catch(function () { return {}; }).then(function (json) {
        return { status: res.status, data: json };
      });
    });
  }

  function toast(message, isError) {
    var box = byId('toast');
    box.textContent = message;
    box.className = 'toast' + (isError ? ' is-error' : '');
    box.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { box.hidden = true; }, 4500);
  }

  function closeDialog(id) {
    byId(id).close();
  }

  document.querySelectorAll('[data-close]').forEach(function (button) {
    button.addEventListener('click', function () {
      button.closest('dialog').close();
    });
  });

  function showDialogAlert(id, message) {
    var box = byId(id);
    box.textContent = message;
    box.hidden = false;
  }

  function fieldError(input, errorBox, message) {
    input.classList.add('is-error');
    errorBox.textContent = message;
    errorBox.hidden = false;
    input.focus();
  }

  var STATUS_NAMES = { waiting: 'Waiting', serving: 'Serving', completed: 'Completed', skipped: 'Skipped', cancelled: 'Cancelled' };

  function drawService() {
    var s = data.service;
    byId('serviceName').textContent = s.service_name;
    var badge = byId('serviceBadge');
    badge.className = 'cf-badge cf-' + s.queue_status;
    badge.textContent = capitalize(s.queue_status);
    byId('serviceRoom').textContent = s.counter_label || '';
    byId('serviceMeta').textContent =
      formatTime(s.open_time) + ' - ' + formatTime(s.close_time) + ' · Auto-refresh on';

    var banner = byId('stateBanner');
    if (s.queue_status === 'open') {
      banner.hidden = true;
    } else {
      banner.hidden = false;
      banner.className = 'banner is-' + s.queue_status;
      banner.textContent = s.queue_status === 'paused'
        ? 'Service paused' + (s.status_note ? ' - ' + s.status_note : '')
        : 'Service closed';
    }

    byId('pauseButton').textContent = s.queue_status === 'paused' ? 'Resume Service'
      : s.queue_status === 'closed' ? 'Reopen Service' : 'Pause Service';
    byId('closeButton').hidden = s.queue_status === 'closed';
  }

  function drawCounters() {
    byId('countWaiting').textContent = data.counts.waiting;
    byId('countServing').textContent = data.counts.serving;
    byId('countCompleted').textContent = data.counts.completed;
    byId('countSkipped').textContent = data.counts.skipped;
    byId('countCancelled').textContent = data.counts.cancelled;
  }

  function drawServing() {
    var t = data.current;
    byId('servingNone').hidden = !!t;
    byId('servingHas').hidden = !t;

    var chips = byId('servingChips');
    chips.textContent = '';
    if (!t) return;

    if (t.priority) chips.appendChild(el('span', 'chip', 'Priority'));
    if (t.arrived) chips.appendChild(el('span', 'chip', 'Arrived'));

    byId('servingNumber').textContent = t.ticket_label;
    byId('servingName').textContent = t.display_name || 'Unnamed';
    byId('servingNote').textContent = 'Note: ' + (t.note || '—');
    byId('servingTravel').textContent = 'Travel time: ' + travelText(t.travel_minutes);
    byId('arrivedButton').hidden = t.arrived;
    tickServing();
  }

  function tickServing() {
    var t = data && data.current;
    if (!t) return;
    var minutes = t.called_at ? Math.max(0, Math.floor((Date.now() - new Date(t.called_at).getTime()) / 60000)) : 0;
    byId('servingCalled').textContent = 'Called ' + (minutes === 0 ? 'just now' : minutes + ' min ago');

    var grace = byId('servingGrace');
    if (t.arrived) {
      grace.textContent = 'Patient has arrived';
    } else if (t.arrive_by) {
      var left = Math.max(0, Math.round((new Date(t.arrive_by).getTime() - Date.now()) / 1000));
      grace.textContent = 'Grace countdown ' + pad(Math.floor(left / 60)) + ':' + pad(left % 60);
    } else {
      grace.textContent = '';
    }
  }

  function drawCallNext() {
    var s = data.service;
    var next = data.next_up;
    byId('nextUp').textContent = next ? 'Next up: ' + next.ticket_label : 'No one is waiting';
    byId('callNext').disabled = s.queue_status !== 'open' || !!data.current || !next;
  }

  //a patient's travel time, or a dash for walk-ins who have none
  function travelText(minutes) {
    return minutes === null || minutes === undefined ? '—' : minutes + ' min';
  }

  function drawRow(t) {
    var row = el('tr', t.is_deleted ? 'is-deleted' : '');

    function cell(label, text, className) {
      var td = el('td', className || '', text);
      td.dataset.label = label;
      row.appendChild(td);
      return td;
    }

    cell('Position', t.position === null ? '—' : String(t.position));

    var number = cell('Number', t.ticket_label, 'number-col');
    if (t.is_deleted) number.appendChild(el('span', 'sub-status', 'Deleted'));
    else if (t.status !== 'waiting') number.appendChild(el('span', 'sub-status', STATUS_NAMES[t.status]));

    cell('Name', t.display_name || '—');
    cell('Time joined', clockText(t.queued_at));
    cell('Waiting duration', t.status === 'waiting' || t.status === 'serving' ? minutesText(t.waiting_minutes) : '—');
    cell('Priority', t.priority ? 'Yes' : '—');
    cell('Arrived', t.arrived ? 'Yes' : '—');
    cell('Travel', travelText(t.travel_minutes));
    cell('Note', t.note || '—');

    var actionsCell = el('td', 'actions-col');
    var actions = el('div', 'row-actions');
    addButton(actions, 'Details', '', function () { openDetails(t); });
    if (t.is_deleted) {
      addButton(actions, 'Restore', 'solid', function () { restoreTicket(t); });
    } else {
      addButton(actions, 'Edit', '', function () { openEdit(t); });
      if (t.status === 'waiting' || t.status === 'serving') {
        addButton(actions, 'Cancel', '', function () { openStop(t); });
      }
      addButton(actions, 'Delete', 'danger', function () { openDelete(t); });
      if (t.status === 'skipped') addButton(actions, 'Recall', 'solid', function () { recallTicket(t); });
    }
    actionsCell.appendChild(actions);
    row.appendChild(actionsCell);
    return row;
  }

  function drawTable() {
    var search = byId('search').value.trim().toLowerCase();
    var source = showDeleted ? deletedTickets : data.tickets;

    var shown = source.filter(function (t) {
      if (!showDeleted && tab !== 'all' && t.status !== tab) return false;
      if (!search) return true;
      return ((t.display_name || '') + ' ' + t.ticket_label).toLowerCase().indexOf(search) !== -1;
    });

    var rows = byId('queueRows');
    rows.textContent = '';
    shown.forEach(function (t) { rows.appendChild(drawRow(t)); });

    byId('queueTable').hidden = shown.length === 0;
    var empty = byId('queueEmpty');
    empty.hidden = shown.length > 0;
    if (!shown.length) {
      empty.textContent = search ? 'No tickets match your search.'
        : showDeleted ? 'No deleted tickets.'
        : tab === 'waiting' ? 'No tickets waiting'
        : tab === 'all' ? 'No tickets yet today.'
        : 'No ' + tab + ' tickets.';
    }
  }

  function drawAll() {
    byId('loading').hidden = true;
    byId('consoleArea').hidden = false;
    drawService();
    drawCounters();
    drawServing();
    drawCallNext();
    drawTable();
  }

  function loadQueue() {
    if (loading || serviceId === null) return Promise.resolve();
    loading = true;

    var requests = [send('GET', '/api/staff/queue?service_id=' + serviceId)];
    if (showDeleted) requests.push(send('GET', '/api/staff/queue?deleted=1&service_id=' + serviceId));

    return Promise.all(requests)
      .then(function (results) {
        if (results[0].status !== 200) throw new Error(results[0].data.error || 'bad status');
        data = results[0].data;
        deletedTickets = results[1] && results[1].status === 200 ? results[1].data.tickets : [];
        failures = 0;
        byId('connectionAlert').hidden = true;
        byId('pageAlert').hidden = true;
        drawAll();
      })
      .catch(function (err) {
        if (err.message === 'not logged in') return;
        failures++;
        byId('loading').hidden = true;
        if (data) {
          if (failures >= 2) byId('connectionAlert').hidden = false;
        } else {
          byId('pageAlert').textContent = "Can't load the queue. " + (err.message === 'bad status' ? '' : err.message);
          byId('pageAlert').hidden = false;
        }
      })
      .then(function () { loading = false; });
  }

  function afterAction(result, successMessage) {
    if (result.status >= 200 && result.status < 300) {
      if (successMessage) toast(successMessage);

      return loadQueue().then(function () { return true; });
    }
    toast(result.data.error || 'Something went wrong. Please try again.', true);
    return loadQueue().then(function () { return false; });
  }

  function networkProblem() {
    toast("Can't reach the server. Please try again.", true);
  }

  byId('callNext').addEventListener('click', function () {
    var button = byId('callNext');
    button.disabled = true;
    send('POST', '/api/staff/call-next', { service_id: serviceId })
      .then(function (result) {
        return afterAction(result, result.data.ticket_label ? 'Called ' + result.data.ticket_label : '');
      })
      .catch(function (err) { if (err.message !== 'not logged in') networkProblem(); });
  });

  function ticketAction(path, id, message) {
    return send('POST', '/api/staff/tickets/' + id + '/' + path)
      .then(function (result) { return afterAction(result, message); })
      .catch(function (err) { if (err.message !== 'not logged in') networkProblem(); });
  }

  byId('completeButton').addEventListener('click', function () {
    if (data.current) ticketAction('complete', data.current.ticket_id, data.current.ticket_label + ' completed');
  });
  byId('reannounceButton').addEventListener('click', function () {
    if (data.current) ticketAction('reannounce', data.current.ticket_id, 'Patient called again');
  });
  byId('arrivedButton').addEventListener('click', function () {
    if (data.current) ticketAction('arrived', data.current.ticket_id, 'Marked as arrived');
  });
  byId('skipButton').addEventListener('click', function () { if (data.current) openStop(data.current); });
  byId('cancelServingButton').addEventListener('click', function () { if (data.current) openStop(data.current); });

  function recallTicket(t) {
    ticketAction('recall', t.ticket_id, t.ticket_label + ' is back in the queue');
  }

  function restoreTicket(t) {
    ticketAction('restore', t.ticket_id, t.ticket_label + ' restored');
  }

  function openStop(t) {
    activeTicket = t;
    byId('stopTicket').textContent = t.ticket_label + (t.display_name ? ' · ' + t.display_name : '');
    byId('stopReason').selectedIndex = 0;
    byId('stopExtra').value = '';
    openDialog('stopDialog');
  }

  function submitStop(path, message) {
    if (!activeTicket) return;
    var reason = byId('stopReason').value;
    var extra = byId('stopExtra').value.trim();
    if (extra) reason += ' - ' + extra;
    var label = activeTicket.ticket_label;

    send('POST', '/api/staff/tickets/' + activeTicket.ticket_id + '/' + path, { reason: reason.slice(0, 100) })
      .then(function (result) {
        if (result.status === 200) closeDialog('stopDialog');
        else showDialogAlert('stopAlert', result.data.error || 'Something went wrong.');
        return afterAction(result, label + ' ' + message);
      })
      .catch(function (err) { if (err.message !== 'not logged in') showDialogAlert('stopAlert', "Can't reach the server."); });
  }

  byId('stopSkip').addEventListener('click', function () { submitStop('skip', 'skipped'); });
  byId('stopCancel').addEventListener('click', function () { submitStop('cancel', 'cancelled'); });

  byId('addWalkIn').addEventListener('click', function () {
    byId('walkinName').value = '';
    byId('walkinPriority').checked = false;
    byId('walkinNote').value = '';
    openDialog('walkinDialog');
    byId('walkinName').focus();
  });

  byId('walkinForm').addEventListener('submit', function (event) {
    event.preventDefault();
    var name = byId('walkinName').value.trim();
    if (!name) {
      fieldError(byId('walkinName'), byId('walkinNameError'), 'Name is required.');
      return;
    }
    byId('walkinSubmit').disabled = true;

    send('POST', '/api/staff/walk-ins', {
      service_id: serviceId,
      walk_in_name: name,
      priority: byId('walkinPriority').checked,
      note: byId('walkinNote').value.trim()
    })
      .then(function (result) {
        if (result.status === 201) {
          closeDialog('walkinDialog');
          return afterAction(result, 'Walk-in added: ' + result.data.ticket_label);
        }
        showDialogAlert('walkinAlert', result.data.error || 'Something went wrong.');
      })
      .catch(function (err) { if (err.message !== 'not logged in') showDialogAlert('walkinAlert', "Can't reach the server."); })
      .then(function () { byId('walkinSubmit').disabled = false; });
  });

  function openEdit(t) {
    activeTicket = t;
    byId('editTicket').textContent = t.ticket_label;
    byId('editNote').value = t.note || '';
    byId('editPriority').checked = !!t.priority;
    byId('editNameField').hidden = !t.walk_in_name;
    byId('editName').value = t.walk_in_name || '';
    openDialog('editDialog');
  }

  byId('editForm').addEventListener('submit', function (event) {
    event.preventDefault();
    if (!activeTicket) return;
    var body = { note: byId('editNote').value.trim(), priority: byId('editPriority').checked };

    if (activeTicket.walk_in_name) {
      var name = byId('editName').value.trim();
      if (!name) {
        fieldError(byId('editName'), byId('editNameError'), 'Name is required.');
        return;
      }
      body.walk_in_name = name;
    }
    byId('editSubmit').disabled = true;

    send('PATCH', '/api/staff/tickets/' + activeTicket.ticket_id, body)
      .then(function (result) {
        if (result.status === 200) closeDialog('editDialog');
        else showDialogAlert('editAlert', result.data.error || 'Something went wrong.');
        return afterAction(result, 'Ticket updated');
      })
      .catch(function (err) { if (err.message !== 'not logged in') showDialogAlert('editAlert', "Can't reach the server."); })
      .then(function () { byId('editSubmit').disabled = false; });
  });

  function openDelete(t) {
    activeTicket = t;
    byId('deleteTicket').textContent = t.ticket_label + (t.display_name ? ' · ' + t.display_name : '');
    byId('deleteReason').value = '';
    openDialog('deleteDialog');
    byId('deleteReason').focus();
  }

  byId('deleteForm').addEventListener('submit', function (event) {
    event.preventDefault();
    if (!activeTicket) return;
    var reason = byId('deleteReason').value.trim();
    if (!reason) {
      fieldError(byId('deleteReason'), byId('deleteReasonError'), 'A reason is required.');
      return;
    }
    byId('deleteSubmit').disabled = true;
    var label = activeTicket.ticket_label;

    send('DELETE', '/api/staff/tickets/' + activeTicket.ticket_id, { reason: reason })
      .then(function (result) {
        if (result.status === 200) closeDialog('deleteDialog');
        else showDialogAlert('deleteAlert', result.data.error || 'Something went wrong.');
        return afterAction(result, label + ' deleted');
      })
      .catch(function (err) { if (err.message !== 'not logged in') showDialogAlert('deleteAlert', "Can't reach the server."); })
      .then(function () { byId('deleteSubmit').disabled = false; });
  });

  function setStatus(status, note, dialogId, alertId, buttonId, message) {
    byId(buttonId).disabled = true;
    return send('POST', '/api/staff/service-status', { service_id: serviceId, queue_status: status, status_note: note })
      .then(function (result) {
        if (result.status === 200) {
          if (dialogId) closeDialog(dialogId);
          var extra = result.data.cancelled ? ' (' + result.data.cancelled + ' waiting cancelled)' : '';
          return afterAction(result, message + extra);
        }
        if (alertId) showDialogAlert(alertId, result.data.error || 'Something went wrong.');
        else toast(result.data.error || 'Something went wrong.', true);
      })
      .catch(function (err) {
        if (err.message === 'not logged in') return;
        if (alertId) showDialogAlert(alertId, "Can't reach the server.");
        else networkProblem();
      })
      .then(function () { byId(buttonId).disabled = false; });
  }

  byId('pauseButton').addEventListener('click', function () {
    var s = currentService();
    if (!s) return;
    if (s.queue_status === 'open') {
      byId('pauseService').textContent = s.service_name;
      byId('pauseReason').value = '';
      openDialog('pauseDialog');
    } else {
      setStatus('open', null, null, null, 'pauseButton', 'Service is open');
    }
  });

  byId('pauseForm').addEventListener('submit', function (event) {
    event.preventDefault();
    setStatus('paused', byId('pauseReason').value.trim(), 'pauseDialog', 'pauseAlert', 'pauseSubmit', 'Service paused');
  });

  byId('closeButton').addEventListener('click', function () {
    var s = currentService();
    if (!s) return;
    var waiting = data.counts.waiting;
    byId('closeService').textContent = s.service_name;
    byId('closeCount').textContent = waiting === 1 ? '1 waiting ticket will be cancelled'
      : waiting + ' waiting tickets will be cancelled';
    openDialog('closeDialog');
  });

  byId('closeForm').addEventListener('submit', function (event) {
    event.preventDefault();
    setStatus('closed', null, 'closeDialog', 'closeAlert', 'closeSubmit', 'Service closed for the day');
  });

  var detailTicket = null;

  function openDetails(t) {
    detailTicket = null;
    byId('detailsNumber').textContent = t.ticket_label;
    byId('detailsName').textContent = t.display_name || '';
    byId('detailsService').textContent = currentService() ? currentService().service_name : '';
    byId('detailsBody').textContent = '';
    byId('detailsLoading').hidden = false;
    byId('detailsEdit').hidden = true;
    byId('detailsDelete').hidden = true;
    byId('detailsDialog').showModal();

    send('GET', '/api/staff/tickets/' + t.ticket_id).then(function (result) {
      byId('detailsLoading').hidden = true;
      var body = byId('detailsBody');
      if (result.status !== 200) {
        body.appendChild(el('p', 'alert alert-error', result.data.error || 'Could not load this ticket.'));
        return;
      }
      var d = result.data.ticket;
      detailTicket = d;
      byId('detailsName').textContent = d.display_name || '';
      byId('detailsService').textContent = d.service_name;

      body.appendChild(group('', [
        ['Status', d.is_deleted ? 'Deleted' : STATUS_NAMES[d.status]],
        ['Priority', d.priority ? 'Yes' : '—'],
        ['Travel time', travelText(d.travel_minutes)],
        ['Note', d.note || '—']
      ]));
      body.appendChild(group('Timestamps', [
        ['Taken', dateTimeText(d.queued_at)],
        ['Called', dateTimeText(d.called_at)],
        ['Completed', dateTimeText(d.completed_at)]
      ]));
      body.appendChild(group('Durations', [
        ['Wait time', minutesText(d.wait_minutes)],
        ['Service time', minutesText(d.service_minutes)]
      ]));
      body.appendChild(group('Status history', d.history.map(function (h) {
        var who = h.by_name ? ' · ' + h.by_name : '';
        var why = h.reason ? ' (' + h.reason + ')' : '';
        return [capitalize(h.action) + why, dateTimeText(h.changed_at) + who];
      })));

      byId('detailsEdit').hidden = d.is_deleted;
      byId('detailsDelete').hidden = d.is_deleted;
    }).catch(function (err) {
      if (err.message === 'not logged in') return;
      byId('detailsLoading').hidden = true;
      byId('detailsBody').appendChild(el('p', 'alert alert-error', "Can't reach the server."));
    });
  }

  byId('detailsEdit').addEventListener('click', function () {
    if (!detailTicket) return;
    closeDialog('detailsDialog');
    openEdit(detailTicket);
  });
  byId('detailsDelete').addEventListener('click', function () {
    if (!detailTicket) return;
    closeDialog('detailsDialog');
    openDelete(detailTicket);
  });

  document.querySelectorAll('[data-tab]').forEach(function (button) {
    button.addEventListener('click', function () {
      tab = button.dataset.tab;
      document.querySelectorAll('[data-tab]').forEach(function (other) {
        other.setAttribute('aria-pressed', String(other === button));
      });
      if (data) drawTable();
    });
  });

  byId('search').addEventListener('input', function () { if (data) drawTable(); });

  byId('showDeleted').addEventListener('change', function (event) {
    showDeleted = event.target.checked;
    loadQueue();
  });

  byId('serviceSelect').addEventListener('change', function (event) {
    serviceId = Number(event.target.value);
    data = null;
    byId('consoleArea').hidden = true;
    byId('loading').hidden = false;
    loadQueue();
  });

  send('GET', '/api/auth/me')
    .then(function (result) {
      var user = result.data.user;
      if (!user) return null;
      if (user.mustChangePassword) {
        window.location.replace('/force-password/force-password.html');
        return null;
      }
      if (user.role === 'patient') { window.location.replace('/patient/home.html'); return null; }
      if (user.role === 'admin') { window.location.replace('/admin/dashboard.html'); return null; }

      byId('headerName').textContent = user.name;
      byId('headerInitials').textContent = initials(user.name);

      return fetch('/api/public/board')
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (board) {
          if (board) {
            timeZone = board.time_zone;
          }
        })
        .catch(function () { })
        .then(function () {
          updateClock();
          return send('GET', '/api/staff/services');
        })
        .then(function (res) {
          if (res.status === 403) {
            window.location.replace('/error/error.html?code=403');
            return;
          }

          services = res.data.services || [];
          byId('loading').hidden = true;
          if (!services.length) {
            byId('noService').hidden = false;
            return;
          }

          serviceId = services[0].service_id;
          if (services.length > 1) {
            var select = byId('serviceSelect');
            services.forEach(function (s) {
              var option = el('option', '', s.service_name + (s.counter_label ? ' · ' + s.counter_label : ''));
              option.value = String(s.service_id);
              select.appendChild(option);
            });
            byId('switcher').hidden = false;
          }
          byId('loading').hidden = false;
          return loadQueue().then(function () {
            setInterval(loadQueue, REFRESH_SECONDS * 1000);
            setInterval(tickServing, 1000);

            setInterval(updateClock, 30 * 1000);
          });
        });
    })
    .catch(function () { });
});
