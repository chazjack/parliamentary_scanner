/* Parliamentary Scanner — Main app initialisation */

const API = {
    async get(path) {
        const res = await fetch(path);
        if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
        return res.json();
    },
    async post(path, body) {
        const res = await fetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`POST ${path}: ${res.status}`);
        return res.json();
    },
    async put(path, body) {
        const res = await fetch(path, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`PUT ${path}: ${res.status}`);
        return res.json();
    },
    async del(path) {
        const res = await fetch(path, { method: 'DELETE' });
        if (!res.ok) throw new Error(`DELETE ${path}: ${res.status}`);
        return res.json();
    },
};

// Shared state
const state = {
    topics: [],
    currentScanId: null,
    eventSource: null,
};

// Set default date range (past 2 days)
function setDefaultDates() {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 2);

    document.getElementById('startDate').value = start.toISOString().split('T')[0];
    document.getElementById('endDate').value = end.toISOString().split('T')[0];
}

// Tab switching
function switchTab(tabName) {
    // Update URL hash so refresh restores the correct tab
    history.replaceState(null, '', '#' + tabName);

    // Toggle tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Toggle tab content
    document.getElementById('tab-scanner').style.display = tabName === 'scanner' ? '' : 'none';
    document.getElementById('tab-record').style.display = tabName === 'record' ? '' : 'none';
    document.getElementById('tab-lookahead').style.display = tabName === 'lookahead' ? '' : 'none';

    // Load data for the active tab
    if (tabName === 'record') {
        loadMasterListTable();
    }
    if (tabName === 'lookahead') {
        initLookahead();
    }
}

// API health check
async function checkApiHealth() {
    const el = document.getElementById('apiStatus');
    if (!el) return;

    el.className = 'api-status api-status--checking';
    el.querySelector('.api-status-label').textContent = 'Checking API...';
    el.title = 'Checking AI classifier connection...';

    // Abort if no response within 12 seconds
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);

    try {
        const res = await fetch('/api/classifier/health', { signal: controller.signal });
        clearTimeout(timer);
        const data = await res.json();

        if (data.status === 'ok') {
            el.className = 'api-status api-status--ok';
            el.querySelector('.api-status-label').textContent = 'API connected';
            el.title = `Connected to ${data.model}`;
        } else {
            el.className = 'api-status api-status--error';
            el.querySelector('.api-status-label').textContent = 'API not connected';
            el.title = data.message || 'Classifier API error';
        }
    } catch {
        clearTimeout(timer);
        el.className = 'api-status api-status--error';
        el.querySelector('.api-status-label').textContent = 'API not connected';
        el.title = 'Could not reach classifier — check server logs';
    }
}

// Initialise app
document.addEventListener('DOMContentLoaded', async () => {
    setDefaultDates();
    await loadTopics();
    await loadHistory();
    checkApiHealth();
    setInterval(checkApiHealth, 60000); // recheck every 60 seconds

    // Collapse topics by default
    const topicList = document.getElementById('topicList');
    const toggleIcon = document.querySelector('#topic-manager .toggle-icon');
    if (topicList && !topicList.classList.contains('collapsed')) {
        topicList.classList.add('collapsed');
        if (toggleIcon) toggleIcon.classList.add('collapsed');
        if (typeof renderTopicPills === 'function') renderTopicPills();
    }

    // Show empty results prompt
    const resultsSection = document.getElementById('results-section');
    if (resultsSection) {
        renderResults([]);
    }

    // Show empty audit section prompt
    const auditSection = document.getElementById('audit-section');
    const auditList = document.getElementById('auditList');
    if (auditSection && auditList) {
        auditList.innerHTML = '<p class="empty-state-preview">No discarded items yet. Run a scan to see results.</p>';
    }

    // Switch to tab from URL hash, defaulting to Look Ahead
    const validTabs = ['lookahead', 'scanner', 'record'];
    const hash = window.location.hash.slice(1);
    switchTab(validTabs.includes(hash) ? hash : 'lookahead');
});

// Handle browser back/forward navigation
window.addEventListener('hashchange', () => {
    const validTabs = ['lookahead', 'scanner', 'record'];
    const hash = window.location.hash.slice(1);
    if (validTabs.includes(hash)) switchTab(hash);
});

