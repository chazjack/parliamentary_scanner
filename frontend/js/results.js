/* Parliamentary Scanner — Results table rendering, sorting, export, history */

let allResults = [];
let currentSort = { col: null, dir: null }; // dir: 'asc' | 'desc' | null
let masterResultIds = new Set(); // Track which result IDs are in the master list

// SVG icons for master list buttons (clean, consistent rendering)
const SVG_PLUS = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="6" y1="2" x2="6" y2="10"/><line x1="2" y1="6" x2="10" y2="6"/></svg>';
const SVG_CHECK = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,6 5,9 10,3"/></svg>';
const SVG_CROSS = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="3" y1="3" x2="9" y2="9"/><line x1="9" y1="3" x2="3" y2="9"/></svg>';

let historyPage = 1;
const HISTORY_PER_PAGE = 5;

// Party colour map
const PARTY_COLOURS = {
    'Conservative': { bg: '#68ADE9', text: '#FFFFFF' },
    'Labour': { bg: '#C32C41', text: '#FFFFFF' },
    'Labour/Co-operative': { bg: '#C32C41', text: '#FFFFFF' },
    'Liberal Democrat': { bg: '#DF6D2D', text: '#FFFFFF' },
    'Lib Dem': { bg: '#DF6D2D', text: '#FFFFFF' },
    'Green': { bg: '#35623F', text: '#FFFFFF' },
    'Green Party': { bg: '#35623F', text: '#FFFFFF' },
    'Reform UK': { bg: '#71BCD3', text: '#000000' },
    'SNP': { bg: '#F8F29C', text: '#000000' },
    'Scottish National Party': { bg: '#F8F29C', text: '#000000' },
    'Plaid Cymru': { bg: '#EACF4D', text: '#FFFFFF' },
    'Crossbench': { bg: '#F2F2F2', text: '#000000' },
    'Independent': { bg: '#F2F2F2', text: '#000000' },
    'Non-affiliated': { bg: '#F2F2F2', text: '#000000' },
    'DUP': { bg: '#F2F2F2', text: '#000000' },
};

const TYPE_COLOURS = {
    'MP': { bg: '#575178', text: '#FFFFFF' },
    'Peer': { bg: '#861E32', text: '#FFFFFF' },
};

function partyPill(party) {
    if (!party || party === '—') return '—';
    const colours = PARTY_COLOURS[party] || { bg: '#F2F2F2', text: '#000000' };
    return `<span class="pill" style="background:${colours.bg};color:${colours.text}">${escapeHtml(party)}</span>`;
}

function typePill(type) {
    if (!type || type === '—') return '—';
    const colours = TYPE_COLOURS[type] || { bg: '#F2F2F2', text: '#000000' };
    return `<span class="pill" style="background:${colours.bg};color:${colours.text}">${escapeHtml(type)}</span>`;
}

async function refreshMasterResultIds() {
    try {
        const data = await API.get('/api/master/result-ids');
        masterResultIds = new Set(data.result_ids || []);
    } catch (err) {
        console.error('Failed to refresh master result IDs:', err);
    }
}

async function loadResults(scanId) {
    await refreshMasterResultIds();
    const data = await API.get(`/api/scans/${scanId}/results`);
    allResults = data.results || [];
    renderResults(allResults);
    document.getElementById('results-section').style.display = '';
}

function renderResults(results) {
    const tbody = document.getElementById('resultsBody');
    tbody.innerHTML = '';

    if (results.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No results found.</td></tr>';
        return;
    }

    for (const r of results) {
        const tr = document.createElement('tr');

        // Parse topics JSON
        let topics = r.topics;
        try { topics = JSON.parse(r.topics); } catch (e) {}
        if (Array.isArray(topics)) topics = topics.join(', ');

        // Format date as dd/mm/yy
        const dateStr = formatDate(r.activity_date);

        // Confidence class
        const confClass = `confidence-${(r.confidence || '').toLowerCase()}`;

        // New badge
        const isNew = r.first_seen_scan_id === r.scan_id;
        const newBadge = isNew ? '<span class="new-badge">New</span>' : '';

        // Quote with link
        let quoteHtml = escapeHtml(r.verbatim_quote || '—');
        if (r.source_url) {
            quoteHtml = `<a href="${escapeHtml(r.source_url)}" target="_blank" class="quote-link">${quoteHtml}</a>`;
        }

        // Master button — three states
        const inMaster = masterResultIds.has(r.id);
        const btnClass = inMaster ? 'btn-add-master state-added' : 'btn-add-master state-add';
        const btnIcon = inMaster ? SVG_CHECK : SVG_PLUS;
        const btnTitle = inMaster ? 'In Master List (hover to remove)' : 'Add to Master List';

        // Escape values for data attributes
        const escapedName = escapeHtml(r.member_name);
        const escapedParty = escapeHtml(r.party || '');
        const escapedType = escapeHtml(r.member_type || '');
        const escapedConstituency = escapeHtml(r.constituency || '');

        tr.innerHTML = `
            <td>${escapeHtml(r.member_name)}${newBadge}</td>
            <td>${partyPill(r.party || '—')}</td>
            <td>${typePill(r.member_type || '—')}</td>
            <td>${escapeHtml(topics || '—')}</td>
            <td>${escapeHtml(r.summary || '—')}<br><small><strong>${dateStr}</strong></small></td>
            <td>${escapeHtml(r.forum || '—')}</td>
            <td>${quoteHtml}</td>
            <td><span class="${confClass}">${escapeHtml(r.confidence || '—')}</span></td>
            <td><button class="${btnClass}" title="${btnTitle}"
                data-result-id="${r.id}"
                data-member-name="${escapedName}"
                data-member-id="${r.member_id || ''}"
                data-party="${escapedParty}"
                data-member-type="${escapedType}"
                data-constituency="${escapedConstituency}">${btnIcon}</button></td>
        `;

        // Wire up button events
        const btn = tr.querySelector('.btn-add-master');
        setupMasterButton(btn);

        tbody.appendChild(tr);
    }
}

function setupMasterButton(btn) {
    const resultId = parseInt(btn.dataset.resultId);
    const inMaster = masterResultIds.has(resultId);

    if (inMaster) {
        // Hover: show ✗ in grey; leave: revert to ✓ green
        btn.addEventListener('mouseenter', () => {
            if (btn.classList.contains('state-added')) {
                btn.innerHTML = SVG_CROSS;
            }
        });
        btn.addEventListener('mouseleave', () => {
            if (btn.classList.contains('state-added')) {
                btn.innerHTML = SVG_CHECK;
            }
        });
        btn.addEventListener('click', async () => {
            await removeFromMasterByResult(resultId, btn);
        });
    } else {
        btn.addEventListener('click', async () => {
            await addToMasterFromBtn(btn);
        });
    }
}

async function addToMasterFromBtn(btn) {
    const resultId = parseInt(btn.dataset.resultId);
    try {
        await API.post('/api/master/add', {
            result_id: resultId,
            member_name: btn.dataset.memberName,
            member_id: btn.dataset.memberId || null,
            party: btn.dataset.party || '',
            member_type: btn.dataset.memberType || '',
            constituency: btn.dataset.constituency || '',
        });

        // Update state
        masterResultIds.add(resultId);

        // Transition button to "added" state
        btn.className = 'btn-add-master state-added';
        btn.innerHTML = SVG_CHECK;
        btn.title = 'In Master List (hover to remove)';

        // Re-wire events for the new state
        btn.replaceWith(btn.cloneNode(true));
        const newBtn = document.querySelector(`.btn-add-master[data-result-id="${resultId}"]`);
        if (newBtn) setupMasterButton(newBtn);

        // Reload master list if visible
        if (typeof loadMasterList === 'function') loadMasterList();
    } catch (err) {
        console.error('Failed to add to master list:', err);
    }
}

async function removeFromMasterByResult(resultId, btn) {
    btn.className = 'btn-add-master state-removing';
    btn.innerHTML = '&hellip;';
    try {
        await API.del(`/api/master/activity/${resultId}`);

        // Update state
        masterResultIds.delete(resultId);

        // Transition back to "add" state
        btn.className = 'btn-add-master state-add';
        btn.innerHTML = SVG_PLUS;
        btn.title = 'Add to Master List';

        // Re-wire events
        btn.replaceWith(btn.cloneNode(true));
        const newBtn = document.querySelector(`.btn-add-master[data-result-id="${resultId}"]`);
        if (newBtn) setupMasterButton(newBtn);

        // Reload master list if visible
        if (typeof loadMasterList === 'function') loadMasterList();
    } catch (err) {
        console.error('Failed to remove from master:', err);
        // Revert
        btn.className = 'btn-add-master state-added';
        btn.innerHTML = SVG_CHECK;
    }
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    return `${dd}/${mm}/${yy}`;
}

// Sort toggles on column headers
document.querySelectorAll('#resultsTable th[data-col]').forEach(th => {
    th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
        const col = th.dataset.col;

        // Cycle: none -> asc -> desc -> none
        if (currentSort.col !== col) {
            currentSort = { col, dir: 'asc' };
        } else if (currentSort.dir === 'asc') {
            currentSort.dir = 'desc';
        } else {
            currentSort = { col: null, dir: null };
        }

        // Update header indicators
        document.querySelectorAll('#resultsTable th[data-col]').forEach(h => {
            const indicator = h.querySelector('.sort-indicator');
            if (indicator) indicator.remove();
        });

        if (currentSort.col) {
            const indicator = document.createElement('span');
            indicator.className = 'sort-indicator';
            indicator.textContent = currentSort.dir === 'asc' ? ' ▲' : ' ▼';
            th.appendChild(indicator);
        }

        // Sort and re-render
        if (!currentSort.col) {
            renderResults(allResults);
            return;
        }

        const sorted = [...allResults].sort((a, b) => {
            let valA = getCellValue(a, currentSort.col);
            let valB = getCellValue(b, currentSort.col);

            // Confidence ordering: High > Medium > Low
            if (currentSort.col === 'confidence') {
                const order = { 'High': 3, 'Medium': 2, 'Low': 1 };
                valA = order[valA] || 0;
                valB = order[valB] || 0;
            }

            if (valA < valB) return currentSort.dir === 'asc' ? -1 : 1;
            if (valA > valB) return currentSort.dir === 'asc' ? 1 : -1;
            return 0;
        });

        renderResults(sorted);
    });
});

function getCellValue(row, col) {
    if (col === 'topics') {
        let topics = row.topics;
        try { topics = JSON.parse(topics); } catch (e) {}
        if (Array.isArray(topics)) return topics.join(', ').toLowerCase();
        return String(topics || '').toLowerCase();
    }
    if (col === 'summary') {
        return String(row.summary || '').toLowerCase() + ' ' + String(row.activity_date || '');
    }
    return String(row[col] || '').toLowerCase();
}

// Export button
document.getElementById('exportBtn').addEventListener('click', () => {
    if (!state.currentScanId) return;
    window.location.href = `/api/scans/${state.currentScanId}/export`;
});

// Audit panel
async function loadAudit(scanId) {
    const auditSection = document.getElementById('audit-section');
    try {
        const data = await API.get(`/api/scans/${scanId}/audit`);
        const summary = data.summary || {};
        const entries = data.entries || [];

        if (entries.length === 0) {
            auditSection.style.display = 'none';
            return;
        }

        auditSection.style.display = '';

        // Render summary counts
        const summaryDiv = document.getElementById('auditSummary');
        let summaryHtml = '';
        if (summary.procedural_filter) {
            summaryHtml += `<div class="audit-count">
                <span class="count-badge procedural">${summary.procedural_filter}</span>
                <span>Procedural / filtered</span>
            </div>`;
        }
        if (summary.not_relevant) {
            summaryHtml += `<div class="audit-count">
                <span class="count-badge">${summary.not_relevant}</span>
                <span>Not relevant (AI classified)</span>
            </div>`;
        }
        summaryDiv.innerHTML = summaryHtml;

        // Render entries
        const listDiv = document.getElementById('auditList');
        let listHtml = '';
        for (const e of entries) {
            const isProcedural = e.classification === 'procedural_filter';
            listHtml += `<div class="audit-item">
                <span class="audit-member">${escapeHtml(e.member_name)}</span>
                <span class="audit-preview">${escapeHtml(e.text_preview || '')}</span>
                <button class="audit-toggle-btn not-relevant${isProcedural ? ' procedural' : ''}"
                        data-audit-id="${e.id}" data-scan-id="${scanId}"
                        data-state="not-relevant">Not relevant</button>
            </div>`;
        }
        listDiv.innerHTML = listHtml;

        // Wire up toggle buttons
        listDiv.querySelectorAll('.audit-toggle-btn').forEach(btn => {
            setupAuditToggle(btn);
        });
    } catch (err) {
        // Audit not available for older scans — just hide
        auditSection.style.display = 'none';
    }
}

// Audit panel toggle (collapse/expand)
document.getElementById('auditToggle').addEventListener('click', () => {
    const list = document.getElementById('auditList');
    const icon = document.querySelector('#audit-section .toggle-icon');
    list.classList.toggle('collapsed');
    icon.classList.toggle('collapsed');
});

// Setup audit toggle button interactions
function setupAuditToggle(btn) {
    btn.addEventListener('mouseenter', () => {
        const state = btn.dataset.state;
        if (state === 'not-relevant' && !btn.disabled) {
            btn.textContent = 'Relevant';
            btn.classList.add('hover-relevant');
        } else if (state === 'relevant' && !btn.disabled) {
            btn.textContent = 'Not relevant';
            btn.classList.add('hover-not-relevant');
        }
    });

    btn.addEventListener('mouseleave', () => {
        const state = btn.dataset.state;
        btn.classList.remove('hover-relevant', 'hover-not-relevant');
        if (state === 'not-relevant') {
            btn.textContent = 'Not relevant';
        } else if (state === 'relevant') {
            btn.textContent = 'Relevant';
        }
    });

    btn.addEventListener('click', () => {
        const state = btn.dataset.state;
        if (state === 'not-relevant') {
            reclassifyAuditItem(btn);
        }
        // Clicking when relevant does nothing (one-way toggle)
    });
}

// Reclassify a discarded audit item
async function reclassifyAuditItem(btn) {
    const auditId = parseInt(btn.dataset.auditId);
    const scanId = parseInt(btn.dataset.scanId);

    btn.disabled = true;
    btn.textContent = '...';
    btn.classList.remove('hover-relevant', 'hover-not-relevant');
    btn.classList.add('processing');
    btn.classList.remove('not-relevant');

    try {
        const result = await API.post('/api/audit/reclassify', {
            audit_id: auditId,
            scan_id: scanId,
        });

        btn.classList.remove('processing');

        if (result.added) {
            btn.textContent = 'Relevant';
            btn.dataset.state = 'relevant';
            btn.classList.add('relevant');
            btn.disabled = false;
            // Reload results to show the new entry
            await loadResults(scanId);
        } else {
            // Classifier still says not relevant — flash and revert
            btn.textContent = 'Not relevant';
            btn.dataset.state = 'not-relevant';
            btn.classList.add('not-relevant');
            btn.disabled = false;
            btn.classList.add('flash-reject');
            setTimeout(() => btn.classList.remove('flash-reject'), 600);
        }
    } catch (err) {
        console.error('Reclassify failed:', err);
        btn.textContent = 'Not relevant';
        btn.dataset.state = 'not-relevant';
        btn.classList.remove('processing');
        btn.classList.add('not-relevant');
        btn.disabled = false;
    }
}

// Scan history
async function loadHistory() {
    const scans = await API.get('/api/scans');
    const container = document.getElementById('historyList');
    container.innerHTML = '';

    if (scans.length === 0) {
        container.innerHTML = '<p class="empty-state">No previous scans.</p>';
        return;
    }

    const totalPages = Math.ceil(scans.length / HISTORY_PER_PAGE);
    if (historyPage > totalPages) historyPage = totalPages;
    if (historyPage < 1) historyPage = 1;

    const start = (historyPage - 1) * HISTORY_PER_PAGE;
    const pageScans = scans.slice(start, start + HISTORY_PER_PAGE);

    for (const s of pageScans) {
        const div = document.createElement('div');
        div.className = 'history-item';
        div.innerHTML = `
            <span class="history-date">${s.start_date} to ${s.end_date}</span>
            <span>${s.total_relevant || 0} results</span>
            <span class="history-status ${s.status}">${s.status}</span>
        `;
        div.addEventListener('click', () => {
            state.currentScanId = s.id;
            loadResults(s.id);
            loadAudit(s.id);
        });
        container.appendChild(div);
    }

    // Add pagination controls if more than one page
    if (totalPages > 1) {
        const nav = document.createElement('div');
        nav.className = 'history-pagination';
        nav.innerHTML = `
            <button class="btn-small" style="min-width:32px;padding:6px 10px;" ${historyPage <= 1 ? 'disabled' : ''}
                    onclick="historyPage--; loadHistory()">&larr;</button>
            <span class="page-info">Page ${historyPage} of ${totalPages}</span>
            <button class="btn-small" style="min-width:32px;padding:6px 10px;" ${historyPage >= totalPages ? 'disabled' : ''}
                    onclick="historyPage++; loadHistory()">&rarr;</button>
        `;
        container.appendChild(nav);
    }
}
