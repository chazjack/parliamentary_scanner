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

    // Hide sidebar TOC on non-scanner tabs
    const toc = document.getElementById('pageToc');
    if (toc) toc.style.display = tabName === 'scanner' ? '' : 'none';

    // Load data for the active tab
    if (tabName === 'record') {
        loadMasterListTable();
    }
    if (tabName === 'lookahead') {
        initLookahead();
    }
}

// Initialise app
document.addEventListener('DOMContentLoaded', async () => {
    setDefaultDates();
    await loadTopics();
    await loadHistory();

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

    // ---- Sidebar TOC scroll tracking ----
    initTocScrollTracking();

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

function initTocScrollTracking() {
    const tocLinks = document.querySelectorAll('.toc-link');
    const sections = [];
    tocLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (href && href.startsWith('#')) {
            const section = document.getElementById(href.slice(1));
            if (section) sections.push({ link, section });
        }
    });

    if (sections.length === 0) return;

    // IntersectionObserver to track which section is in view
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                tocLinks.forEach(l => l.classList.remove('active'));
                const match = sections.find(s => s.section === entry.target);
                if (match) match.link.classList.add('active');
            }
        });
    }, { rootMargin: '-10% 0px -70% 0px' });

    sections.forEach(({ section }) => observer.observe(section));

    // Click handler: smooth scroll
    tocLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href').slice(1);
            const target = document.getElementById(targetId);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    // Show/hide "Discarded Items" TOC link based on audit section visibility
    const auditLink = document.getElementById('tocAuditLink');
    const auditSection = document.getElementById('audit-section');
    if (auditLink && auditSection) {
        const auditObserver = new MutationObserver(() => {
            auditLink.style.display = auditSection.style.display === 'none' ? 'none' : '';
        });
        auditObserver.observe(auditSection, { attributes: true, attributeFilter: ['style'] });
    }
}
