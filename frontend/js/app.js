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
    // 'calendar' is the public URL name; 'lookahead' is the internal DOM id
    const domTab = tabName === 'calendar' ? 'lookahead' : tabName;

    // Update URL — don't overwrite calendar sub-paths (view/week/filters) on restore
    if (tabName === 'calendar') {
        if (!window.location.pathname.startsWith('/calendar')) {
            history.pushState(null, '', '/calendar');
        }
    } else if (tabName === 'alerts') {
        if (!window.location.pathname.startsWith('/alerts')) {
            history.pushState(null, '', '/alerts');
        }
    } else {
        history.pushState(null, '', '/' + tabName);
    }

    // Toggle tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Toggle tab content
    document.getElementById('tab-scanner').style.display = domTab === 'scanner' ? '' : 'none';
    document.getElementById('tab-record').style.display = domTab === 'record' ? '' : 'none';
    document.getElementById('tab-lookahead').style.display = domTab === 'lookahead' ? '' : 'none';
    document.getElementById('tab-alerts').style.display = domTab === 'alerts' ? '' : 'none';
    document.getElementById('tab-topics').style.display = domTab === 'topics' ? '' : 'none';

    // Load data for the active tab
    if (domTab === 'record') {
        loadMasterListTable();
    }
    if (domTab === 'lookahead') {
        initLookahead();
    }
    if (domTab === 'alerts') {
        loadAlerts();
    }
    if (domTab === 'topics') {
        renderTopicsPage();
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
        } else if (data.status === 'no_credits') {
            el.className = 'api-status api-status--warning';
            el.querySelector('.api-status-label').textContent = 'No API credits';
            el.title = data.message || 'API credit balance too low';
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

    // Restore sidebar collapsed state
    if (localStorage.getItem('sidebarCollapsed') === 'true') {
        document.querySelector('.ps-sidebar').classList.add('collapsed');
    }

    // Switch to tab from URL path, defaulting to Calendar
    const validTabs = ['calendar', 'scanner', 'record', 'alerts', 'topics'];
    const pathTab = window.location.pathname.slice(1).split('/')[0];
    switchTab(validTabs.includes(pathTab) ? pathTab : 'calendar');
});

// Sidebar collapse toggle
function toggleSidebar() {
    const sidebar = document.querySelector('.ps-sidebar');
    const collapsed = sidebar.classList.toggle('collapsed');
    localStorage.setItem('sidebarCollapsed', collapsed);
}

// Sidebar Quick Search — switches to Record tab and mirrors into #masterSearchInput
function sidebarSearch(value) {
    switchTab('record');
    const main = document.getElementById('masterSearchInput');
    if (main) {
        main.value = value;
        filterMasterList();
    }
}

// Handle browser back/forward navigation
window.addEventListener('popstate', () => {
    const validTabs = ['calendar', 'scanner', 'record', 'alerts', 'topics'];
    const pathTab = window.location.pathname.slice(1).split('/')[0];
    if (!validTabs.includes(pathTab)) return;
    const calendarVisible = document.getElementById('tab-lookahead').style.display !== 'none';
    const alertsVisible = document.getElementById('tab-alerts').style.display !== 'none';
    if (pathTab === 'calendar' && calendarVisible) {
        _restoreCalendarFromUrl();
        _loadLaEvents();
    } else if (pathTab === 'alerts' && alertsVisible) {
        _handleAlertsPopstate();
    } else {
        switchTab(pathTab);
    }
});

