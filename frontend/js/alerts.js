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
    const toggleLabel = a.enabled ? 'Disable' : 'Enable';
    return `
        <div class="alert-actions-dropdown" id="alert-actions-${a.id}">
            <button class="ps-btn ps-btn--ghost ps-btn--sm alert-actions-trigger" onclick="toggleAlertMenu(event, ${a.id})" title="Actions">&#8942;</button>
            <div class="alert-actions-menu" id="alert-menu-${a.id}" style="display:none;">
                <button onclick="editAlert(${a.id}); closeAlertMenu(${a.id})">Edit</button>
                <button onclick="toggleAlertEnabled(${a.id}, ${!a.enabled}); closeAlertMenu(${a.id})">${toggleLabel}</button>
                <div class="alert-menu-divider"></div>
                <button onclick="testAlert(${a.id}); closeAlertMenu(${a.id})">Send test email</button>
                <button onclick="runAlertNow(${a.id}); closeAlertMenu(${a.id})">Run now</button>
                <button onclick="previewAlert(${a.id}); closeAlertMenu(${a.id})">Preview email</button>
                <button onclick="showAlertHistory(${a.id}); closeAlertMenu(${a.id})">View history</button>
                <div class="alert-menu-divider"></div>
                <button class="alert-menu-danger" onclick="deleteAlertConfirm(${a.id}); closeAlertMenu(${a.id})">Delete</button>
            </div>
        </div>`;
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
    const chips = topics.map(t =>
        `<button class="ps-chip alert-topic-chip" data-id="${t.id}" onclick="this.classList.toggle('ps-chip--active')">${_escHtml(t.name)}</button>`
    ).join('');
    const laChips = topics.map(t =>
        `<button class="ps-chip alert-la-topic-chip" data-id="${t.id}" onclick="this.classList.toggle('ps-chip--active')">${_escHtml(t.name)}</button>`
    ).join('');
    document.getElementById('alertTopicCheckboxes').innerHTML = chips;
    document.getElementById('alertLookaheadTopicCheckboxes').innerHTML = laChips;
}

function _loadSourceCheckboxes() {
    const sources = ['hansard', 'written_questions', 'written_statements', 'edms', 'bills', 'divisions'];
    document.getElementById('alertSourceCheckboxes').innerHTML = sources.map(s =>
        `<button class="ps-chip alert-source-chip" data-source="${s}" onclick="this.classList.toggle('ps-chip--active')">${_sourceLabel(s)}</button>`
    ).join('');
}

function _loadEventTypeCheckboxes() {
    const types = ['debate', 'oral_questions', 'committee', 'bill_stage', 'westminster_hall', 'statement', 'general_committee'];
    document.getElementById('alertEventTypeCheckboxes').innerHTML = types.map(t =>
        `<button class="ps-chip alert-event-type-chip" data-type="${t}" onclick="this.classList.toggle('ps-chip--active')">${t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</button>`
    ).join('');
}

function _loadHouseCheckboxes() {
    document.getElementById('alertHouseCheckboxes').innerHTML = ['Commons', 'Lords'].map(h =>
        `<button class="ps-chip alert-house-chip" data-house="${h}" onclick="this.classList.toggle('ps-chip--active')">${h}</button>`
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
    const topicChipClass = alertType === 'lookahead' ? '.alert-la-topic-chip.ps-chip--active' : '.alert-topic-chip.ps-chip--active';
    const topicIds = [...document.querySelectorAll(topicChipClass)].map(c => parseInt(c.dataset.id));
    const sources = [...document.querySelectorAll('.alert-source-chip.ps-chip--active')].map(c => c.dataset.source);
    const eventTypes = [...document.querySelectorAll('.alert-event-type-chip.ps-chip--active')].map(c => c.dataset.type);
    const houses = [...document.querySelectorAll('.alert-house-chip.ps-chip--active')].map(c => c.dataset.house);
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

    // Set topic chips
    const topicIds = _parseJsonField(a.topic_ids);
    document.querySelectorAll('.alert-topic-chip, .alert-la-topic-chip').forEach(c => {
        c.classList.toggle('ps-chip--active', topicIds.includes(parseInt(c.dataset.id)));
    });

    // Set source chips
    const sources = _parseJsonField(a.sources);
    document.querySelectorAll('.alert-source-chip').forEach(c => {
        c.classList.toggle('ps-chip--active', !sources.length || sources.includes(c.dataset.source));
    });

    // Set event type chips
    const eventTypes = _parseJsonField(a.event_types);
    document.querySelectorAll('.alert-event-type-chip').forEach(c => {
        c.classList.toggle('ps-chip--active', !eventTypes.length || eventTypes.includes(c.dataset.type));
    });

    // Set house chips
    const houses = _parseJsonField(a.houses);
    document.querySelectorAll('.alert-house-chip').forEach(c => {
        c.classList.toggle('ps-chip--active', !houses.length || houses.includes(c.dataset.house));
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

function toggleAlertDropdown(e) {
    e.stopPropagation();
    const menu = document.getElementById('alertNewMenu');
    menu.style.display = menu.style.display === 'none' ? '' : 'none';
}

function selectAlertType(type) {
    document.getElementById('alertNewMenu').style.display = 'none';
    showAlertForm(type);
}

function toggleAlertMenu(e, alertId) {
    e.stopPropagation();
    document.querySelectorAll('.alert-actions-menu').forEach(m => {
        if (m.id !== `alert-menu-${alertId}`) m.style.display = 'none';
    });
    const menu = document.getElementById(`alert-menu-${alertId}`);
    if (!menu) return;
    const isHidden = menu.style.display === 'none' || menu.style.display === '';
    if (isHidden) {
        const rect = e.currentTarget.getBoundingClientRect();
        menu.style.display = 'block';
        const menuW = menu.offsetWidth;
        const left = Math.max(8, rect.right - menuW);
        menu.style.top = (rect.bottom + 4) + 'px';
        menu.style.left = left + 'px';
    } else {
        menu.style.display = 'none';
    }
}

function closeAlertMenu(alertId) {
    const menu = document.getElementById(`alert-menu-${alertId}`);
    if (menu) menu.style.display = 'none';
}

// Close all dropdowns when clicking outside
document.addEventListener('click', () => {
    const newMenu = document.getElementById('alertNewMenu');
    if (newMenu) newMenu.style.display = 'none';
    document.querySelectorAll('.alert-actions-menu').forEach(m => m.style.display = 'none');
});
