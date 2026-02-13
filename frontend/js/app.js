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

// Set default date range (past 7 days)
function setDefaultDates() {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 7);

    document.getElementById('startDate').value = start.toISOString().split('T')[0];
    document.getElementById('endDate').value = end.toISOString().split('T')[0];
}

// Tab switching
function switchTab(tabName) {
    // Toggle tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Toggle tab content
    document.getElementById('tab-scanner').style.display = tabName === 'scanner' ? '' : 'none';
    document.getElementById('tab-record').style.display = tabName === 'record' ? '' : 'none';

    // Load data for the active tab
    if (tabName === 'record') {
        loadMasterListTable();
    }
}

// Initialise app
document.addEventListener('DOMContentLoaded', async () => {
    setDefaultDates();
    await loadTopics();
    await loadHistory();
});
