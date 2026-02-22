/* Alerts tab — CRUD, toggle, test, run, history */

let alertsList = [];
let editingAlertId = null;

async function loadAlerts() {
    try {
        alertsList = await API.get('/api/alerts');
        renderAlertsList();
    } catch (e) {
        console.error('Failed to load alerts:', e);
    }
}

function renderAlertsList() {
    const tableBody = document.getElementById('alertsListBody');
    const cardList = document.getElementById('alertsCardList');
    if (!tableBody) return;

    if (!alertsList.length) {
        tableBody.innerHTML = '<tr><td colspan="7" class="empty-state-preview">No alerts configured yet. Create one to get started.</td></tr>';
        if (cardList) cardList.innerHTML = '<p class="empty-state-preview">No alerts configured yet. Create one to get started.</p>';
        return;
    }

    // Desktop table rows
    tableBody.innerHTML = alertsList.map(a => {
        const d = _alertDisplayData(a);
        const typeCls = a.alert_type === 'scan' ? 'ps-badge ps-badge--accent' : 'ps-badge ps-badge--success';
        const statusCls = a.enabled ? 'ps-badge ps-badge--success' : 'ps-badge ps-badge--muted';
        return `<tr>
            <td><strong>${_escHtml(a.name)}</strong></td>
            <td><span class="${typeCls}">${d.typeLabel}</span></td>
            <td>${d.cadenceLabel}</td>
            <td>${d.recipientLabel}</td>
            <td>${d.lastRun}</td>
            <td><span class="${statusCls}">${d.statusLabel}</span></td>
            <td class="alert-actions-cell">${_alertActions(a)}</td>
        </tr>`;
    }).join('');

    // Mobile cards
    if (cardList) {
        cardList.innerHTML = alertsList.map(a => {
            const d = _alertDisplayData(a);
            const typeCls = a.alert_type === 'scan' ? 'ps-badge ps-badge--accent' : 'ps-badge ps-badge--success';
            const statusCls = a.enabled ? 'ps-badge ps-badge--success' : 'ps-badge ps-badge--muted';
            return `<div class="alert-card">
                <div class="alert-card-header">
                    <span class="alert-card-name">${_escHtml(a.name)}</span>
                    <span class="${statusCls}">${d.statusLabel}</span>
                </div>
                <div class="alert-card-meta">
                    <span class="${typeCls}">${d.typeLabel}</span>
                    <span>${d.cadenceLabel}</span>
                    <span>${d.recipientLabel}</span>
                </div>
                <div class="alert-card-meta">${d.lastRun}</div>
                <div class="alert-card-actions">${_alertActions(a)}</div>
            </div>`;
        }).join('');
    }
}

function _alertDisplayData(a) {
    const statusClass = a.enabled ? 'completed' : 'cancelled';
    const statusLabel = a.enabled ? 'Enabled' : 'Disabled';
    const lastRunStatus = a.last_run_status;
    const lastRunCls = lastRunStatus === 'completed' ? 'ps-badge ps-badge--success'
        : lastRunStatus === 'failed' ? 'ps-badge ps-badge--danger'
        : 'ps-badge';
    const lastRun = a.last_run_at
        ? `<span class="${lastRunCls}">${lastRunStatus || 'never'}</span> ${_formatDate(a.last_run_at)}`
        : '<span class="ps-badge ps-badge--muted">Never run</span>';
    const recipientCount = (a.recipients || []).length;
    const typeLabel = a.alert_type === 'scan' ? 'Scan' : 'Calendar';
    const typeBg = a.alert_type === 'scan' ? '#e3f2fd' : '#e8f5e9';
    const typeColor = a.alert_type === 'scan' ? '#1565c0' : '#2e7d32';
    const cadenceLabel = a.cadence === 'daily'
        ? `Daily at ${a.send_time}`
        : `${_capitalize(a.day_of_week)}s at ${a.send_time}`;
    const recipientLabel = `${recipientCount} recipient${recipientCount !== 1 ? 's' : ''}`;
    return { statusClass, statusLabel, lastRun, typeLabel, typeBg, typeColor, cadenceLabel, recipientLabel };
}

function _alertActions(a) {
    return `
        <button class="ps-btn ps-btn--ghost ps-btn--sm" onclick="toggleAlertEnabled(${a.id}, ${!a.enabled})" title="${a.enabled ? 'Disable' : 'Enable'}">${a.enabled ? 'Disable' : 'Enable'}</button>
        <button class="ps-btn ps-btn--ghost ps-btn--sm" onclick="testAlert(${a.id})" title="Send test email">Test</button>
        <button class="ps-btn ps-btn--ghost ps-btn--sm" onclick="runAlertNow(${a.id})" title="Run now">Run</button>
        <button class="ps-btn ps-btn--ghost ps-btn--sm" onclick="editAlert(${a.id})" title="Edit">Edit</button>
        <button class="ps-btn ps-btn--ghost ps-btn--sm" onclick="previewAlert(${a.id})" title="Preview email">Preview</button>
        <button class="ps-btn ps-btn--ghost ps-btn--sm" onclick="showAlertHistory(${a.id})" title="History">Log</button>
        <button class="ps-btn ps-btn--sm" style="background:var(--ps-danger);color:#fff;border-color:var(--ps-danger);" onclick="deleteAlertConfirm(${a.id})" title="Delete">&times;</button>`;
}

function showAlertForm(alertType) {
    editingAlertId = null;
    const form = document.getElementById('alertFormSection');
    const title = document.getElementById('alertFormTitle');
    title.textContent = 'Create New Alert';
    form.style.display = '';
    document.getElementById('alertFormList').style.display = 'none';

    // Reset form
    document.getElementById('alertName').value = '';
    document.getElementById('alertType').value = alertType || 'scan';
    document.getElementById('alertCadence').value = 'weekly';
    document.getElementById('alertDayOfWeek').value = 'monday';
    document.getElementById('alertSendTime').value = '09:00';
    document.getElementById('alertTimezone').value = 'Europe/London';
    document.getElementById('alertRecipients').value = '';
    document.getElementById('alertScanPeriod').value = '7';
    document.getElementById('alertLookaheadDays').value = '7';

    _updateFormVisibility();
    _loadTopicCheckboxes();
    _loadSourceCheckboxes();
    _loadEventTypeCheckboxes();
    _loadHouseCheckboxes();
}

function hideAlertForm() {
    document.getElementById('alertFormSection').style.display = 'none';
    document.getElementById('alertFormList').style.display = '';
    editingAlertId = null;
}

function _updateFormVisibility() {
    const type = document.getElementById('alertType').value;
    document.getElementById('alertScanConfig').style.display = type === 'scan' ? '' : 'none';
    document.getElementById('alertLookaheadConfig').style.display = type === 'lookahead' ? '' : 'none';

    const cadence = document.getElementById('alertCadence').value;
    document.getElementById('alertDayOfWeekRow').style.display = cadence === 'weekly' ? '' : 'none';
}

async function _loadTopicCheckboxes() {
    const topics = state.topics || [];
    const html = topics.map(t =>
        `<label class="la-filter-item">
            <input type="checkbox" class="alert-topic-cb" data-id="${t.id}" checked> ${_escHtml(t.name)}
        </label>`
    ).join('');
    document.getElementById('alertTopicCheckboxes').innerHTML = html;
    document.getElementById('alertLookaheadTopicCheckboxes').innerHTML = html.replace(/alert-topic-cb/g, 'alert-la-topic-cb');
}

function _loadSourceCheckboxes() {
    const sources = ['hansard', 'written_questions', 'written_statements', 'edms', 'bills', 'divisions'];
    const container = document.getElementById('alertSourceCheckboxes');
    container.innerHTML = sources.map(s =>
        `<label class="la-filter-item">
            <input type="checkbox" class="alert-source-cb" data-source="${s}" checked> ${_sourceLabel(s)}
        </label>`
    ).join('');
}

function _loadEventTypeCheckboxes() {
    const types = ['debate', 'oral_questions', 'committee', 'bill_stage', 'westminster_hall', 'statement', 'general_committee'];
    const container = document.getElementById('alertEventTypeCheckboxes');
    container.innerHTML = types.map(t =>
        `<label class="la-filter-item">
            <input type="checkbox" class="alert-event-type-cb" data-type="${t}" checked> ${t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
        </label>`
    ).join('');
}

function _loadHouseCheckboxes() {
    const container = document.getElementById('alertHouseCheckboxes');
    container.innerHTML = ['Commons', 'Lords'].map(h =>
        `<label class="la-filter-item">
            <input type="checkbox" class="alert-house-cb" data-house="${h}" checked> ${h}
        </label>`
    ).join('');
}

function _sourceLabel(s) {
    const labels = {
        hansard: 'Hansard', written_questions: 'Written Questions',
        written_statements: 'Written Statements', edms: 'EDMs',
        bills: 'Bills', divisions: 'Divisions'
    };
    return labels[s] || s;
}

function _collectFormData() {
    const alertType = document.getElementById('alertType').value;
    const topicCbClass = alertType === 'lookahead' ? '.alert-la-topic-cb:checked' : '.alert-topic-cb:checked';
    const topicIds = [...document.querySelectorAll(topicCbClass)].map(cb => parseInt(cb.dataset.id));
    const sources = [...document.querySelectorAll('.alert-source-cb:checked')].map(cb => cb.dataset.source);
    const eventTypes = [...document.querySelectorAll('.alert-event-type-cb:checked')].map(cb => cb.dataset.type);
    const houses = [...document.querySelectorAll('.alert-house-cb:checked')].map(cb => cb.dataset.house);
    const recipientsStr = document.getElementById('alertRecipients').value.trim();
    const recipients = recipientsStr ? recipientsStr.split(/[,;\n]+/).map(e => e.trim()).filter(Boolean) : [];

    return {
        name: document.getElementById('alertName').value.trim(),
        alert_type: document.getElementById('alertType').value,
        cadence: document.getElementById('alertCadence').value,
        day_of_week: document.getElementById('alertDayOfWeek').value,
        send_time: document.getElementById('alertSendTime').value,
        timezone: document.getElementById('alertTimezone').value,
        topic_ids: topicIds,
        sources: sources,
        scan_period_days: parseInt(document.getElementById('alertScanPeriod').value) || 7,
        lookahead_days: parseInt(document.getElementById('alertLookaheadDays').value) || 7,
        event_types: eventTypes.length ? eventTypes : null,
        houses: houses.length ? houses : null,
        recipients: recipients,
    };
}

async function saveAlert() {
    const data = _collectFormData();
    if (!data.name) return alert('Please enter an alert name.');
    if (!data.recipients.length) return alert('Please enter at least one recipient email.');

    try {
        if (editingAlertId) {
            await API.put(`/api/alerts/${editingAlertId}`, data);
        } else {
            await API.post('/api/alerts', data);
        }
        hideAlertForm();
        await loadAlerts();
    } catch (e) {
        alert('Failed to save alert: ' + e.message);
    }
}

async function editAlert(alertId) {
    const a = alertsList.find(x => x.id === alertId);
    if (!a) return;

    editingAlertId = alertId;
    showAlertForm(a.alert_type);
    document.getElementById('alertFormTitle').textContent = 'Edit Alert';

    document.getElementById('alertName').value = a.name;
    document.getElementById('alertType').value = a.alert_type;
    document.getElementById('alertCadence').value = a.cadence || 'weekly';
    document.getElementById('alertDayOfWeek').value = a.day_of_week || 'monday';
    document.getElementById('alertSendTime').value = a.send_time || '09:00';
    document.getElementById('alertTimezone').value = a.timezone || 'Europe/London';
    document.getElementById('alertRecipients').value = (a.recipients || []).join(', ');
    document.getElementById('alertScanPeriod').value = a.scan_period_days || 7;
    document.getElementById('alertLookaheadDays').value = a.lookahead_days || 7;

    _updateFormVisibility();

    // Set topic checkboxes
    const topicIds = _parseJsonField(a.topic_ids);
    document.querySelectorAll('.alert-topic-cb').forEach(cb => {
        cb.checked = topicIds.includes(parseInt(cb.dataset.id));
    });

    // Set source checkboxes
    const sources = _parseJsonField(a.sources);
    document.querySelectorAll('.alert-source-cb').forEach(cb => {
        cb.checked = !sources.length || sources.includes(cb.dataset.source);
    });

    // Set event type checkboxes
    const eventTypes = _parseJsonField(a.event_types);
    document.querySelectorAll('.alert-event-type-cb').forEach(cb => {
        cb.checked = !eventTypes.length || eventTypes.includes(cb.dataset.type);
    });

    // Set house checkboxes
    const houses = _parseJsonField(a.houses);
    document.querySelectorAll('.alert-house-cb').forEach(cb => {
        cb.checked = !houses.length || houses.includes(cb.dataset.house);
    });
}

async function toggleAlertEnabled(alertId, enabled) {
    try {
        await API.post(`/api/alerts/${alertId}/toggle?enabled=${enabled}`);
        await loadAlerts();
    } catch (e) {
        alert('Failed to toggle alert: ' + e.message);
    }
}

async function testAlert(alertId) {
    try {
        const result = await API.post(`/api/alerts/${alertId}/test`);
        alert(result.message || 'Test email sent!');
    } catch (e) {
        alert('Test failed: ' + e.message);
    }
}

async function runAlertNow(alertId) {
    try {
        const result = await API.post(`/api/alerts/${alertId}/run`);
        alert(result.message || 'Alert execution started. Check history for results.');
    } catch (e) {
        alert('Run failed: ' + e.message);
    }
}

async function deleteAlertConfirm(alertId) {
    if (!confirm('Delete this alert? This cannot be undone.')) return;
    try {
        await API.del(`/api/alerts/${alertId}`);
        await loadAlerts();
    } catch (e) {
        alert('Failed to delete alert: ' + e.message);
    }
}

async function showAlertHistory(alertId) {
    const a = alertsList.find(x => x.id === alertId);
    try {
        const history = await API.get(`/api/alerts/${alertId}/history`);
        const container = document.getElementById('alertHistoryPanel');
        const title = document.getElementById('alertHistoryTitle');
        title.textContent = `Run History: ${a ? a.name : 'Alert #' + alertId}`;
        container.style.display = '';

        const tbody = document.getElementById('alertHistoryBody');
        if (!history.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-state-preview">No runs yet.</td></tr>';
            return;
        }

        tbody.innerHTML = history.map(h => {
            const cls = h.status === 'completed' ? 'ps-badge ps-badge--success'
                : h.status === 'failed' ? 'ps-badge ps-badge--danger'
                : 'ps-badge';
            return `<tr>
            <td>${_formatDate(h.run_at)}</td>
            <td><span class="${cls}">${h.status}</span></td>
            <td>${h.recipients_count}</td>
            <td>${h.results_count}</td>
            <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${_escHtml(h.error_message || '')}">${h.error_message || '-'}</td>
        </tr>`;
        }).join('');
    } catch (e) {
        alert('Failed to load history: ' + e.message);
    }
}

function hideAlertHistory() {
    document.getElementById('alertHistoryPanel').style.display = 'none';
}

// Helpers
function _formatDate(dateStr) {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00'));
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return dateStr; }
}

function _capitalize(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

function _escHtml(s) {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _parseJsonField(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    try { return JSON.parse(val); } catch { return []; }
}

function previewAlert(alertId) {
    window.open(`/api/alerts/${alertId}/preview`, '_blank');
}
