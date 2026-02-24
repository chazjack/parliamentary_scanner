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

let resultsPage = 1;
const RESULTS_PER_PAGE = 10;
let currentDisplayResults = [];

// Party colour map — { color: bright text/border, bg: soft fill }
const PARTY_COLOURS = {
    'Conservative':          { color: '#68ADE9', bg: 'rgba(104,173,233,0.15)' },
    'Labour':                { color: '#e05567', bg: 'rgba(195,44,65,0.15)'   },
    'Labour/Co-operative':   { color: '#e05567', bg: 'rgba(195,44,65,0.15)'   },
    'Liberal Democrat':      { color: '#DF6D2D', bg: 'rgba(223,109,45,0.15)'  },
    'Lib Dem':               { color: '#DF6D2D', bg: 'rgba(223,109,45,0.15)'  },
    'Green':                 { color: '#4fa861', bg: 'rgba(53,98,63,0.15)'    },
    'Green Party':           { color: '#4fa861', bg: 'rgba(53,98,63,0.15)'    },
    'Reform UK':             { color: '#71BCD3', bg: 'rgba(113,188,211,0.15)' },
    'SNP':                   { color: '#d4c84e', bg: 'rgba(248,242,156,0.12)' },
    'Scottish National Party': { color: '#d4c84e', bg: 'rgba(248,242,156,0.12)' },
    'Plaid Cymru':           { color: '#d4aa2a', bg: 'rgba(234,207,77,0.12)'  },
    'Crossbench':            { color: '#8a8a8a', bg: 'rgba(160,160,160,0.10)' },
    'Independent':           { color: '#8a8a8a', bg: 'rgba(160,160,160,0.10)' },
    'Non-affiliated':        { color: '#8a8a8a', bg: 'rgba(160,160,160,0.10)' },
    'DUP':                   { color: '#8a8a8a', bg: 'rgba(160,160,160,0.10)' },
};

const TYPE_COLOURS = {
    'MP':   { color: '#9b8fc9', bg: 'rgba(87,81,120,0.15)'  },
    'Peer': { color: '#d4556b', bg: 'rgba(134,30,50,0.15)'  },
};

// Maps full party name to ps-party-dot modifier class
const PARTY_DOT_MAP = {
    'Labour':                    'labour',
    'Labour/Co-operative':       'labour',
    'Conservative':              'conservative',
    'Liberal Democrat':          'libdem',
    'Lib Dem':                   'libdem',
    'SNP':                       'snp',
    'Scottish National Party':   'snp',
    'Green':                     'green',
    'Green Party':               'green',
    'Plaid Cymru':               'plaid',
    'DUP':                       'dup',
    'Democratic Unionist Party': 'dup',
};

function partyDotClass(party) {
    return PARTY_DOT_MAP[party] || 'independent';
}

function partyPill(party) {
    if (!party || party === '—') return '—';
    const c = PARTY_COLOURS[party];
    if (c) {
        return `<span class="ps-badge" style="background:${c.bg};color:${c.color};border-color:${c.color}55">${escapeHtml(party)}</span>`;
    }
    return `<span class="ps-badge ps-badge--muted">${escapeHtml(party)}</span>`;
}

function typePill(type) {
    if (!type || type === '—') return '—';
    const c = TYPE_COLOURS[type];
    if (c) {
        return `<span class="ps-badge" style="background:${c.bg};color:${c.color};border-color:${c.color}55">${escapeHtml(type)}</span>`;
    }
    return `<span class="ps-badge">${escapeHtml(type)}</span>`;
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
    if (data.scan) loadStatus(data.scan);
}

function loadStatus(scan) {
    if (!scan) return;
    const progressSection = document.getElementById('progress-section');
    const pLabel = document.getElementById('progressLabel');
    const pPanels = document.getElementById('progressPanels');

    let statsObj = null;
    try { statsObj = JSON.parse(scan.current_phase); } catch (e) {}

    // Reconstruct scanTopicGroups so keyword chips render correctly
    const topicIds = JSON.parse(scan.topic_ids || '[]');
    state.scanTopicGroups = (state.topics || [])
        .filter(t => topicIds.includes(t.id))
        .map(t => ({ name: t.name, keywords: [...(t.keywords || [])] }))
        .filter(g => g.keywords.length > 0);

    resetStageIndicator();
    setSummaryBadge(scan.status || null);

    const datePill = document.getElementById('summaryScanDate');
    if (datePill) {
        let dateStr = '';
        if (scan.created_at) {
            const d = new Date(scan.created_at);
            if (!isNaN(d)) {
                const dd = String(d.getDate()).padStart(2, '0');
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const yy = String(d.getFullYear()).slice(-2);
                const hh = String(d.getHours()).padStart(2, '0');
                const mi = String(d.getMinutes()).padStart(2, '0');
                dateStr = `${dd}/${mm}/${yy} ${hh}:${mi}`;
            }
        }
        if (dateStr) {
            datePill.textContent = scan.trigger === 'scheduled' ? `Automated at ${dateStr}` : dateStr;
            datePill.style.display = '';
        } else {
            datePill.style.display = 'none';
        }
    }

    // Render member filter display from stored scan data
    if (typeof renderMemberFilterDisplay === 'function') {
        let memberEntries = [];
        try {
            const names = JSON.parse(scan.target_member_name || '[]');
            memberEntries = names.map(n => ({ name: n }));
        } catch (e) {}
        renderMemberFilterDisplay(memberEntries);
    }

    if (statsObj) {
        if (scan.status === 'completed') {
            pLabel.textContent = 'Scan complete!';
            setStageCompleted(3);
        } else {
            pLabel.textContent = statsObj.phase || scan.status || '';
            updateStageIndicator(statsObj);
        }
        pPanels.style.display = '';
        renderKeywordChips(statsObj);
        renderPipelineBoxes(statsObj);
        renderSourceCircles(statsObj);
    } else {
        pLabel.textContent = scan.status || '';
        pPanels.style.display = 'none';
    }
}

function trimQuote(text, max = 70) {
    if (!text) return text;
    const words = text.split(/\s+/);
    if (words.length <= max) return text;
    return words.slice(0, max).join(' ') + '…';
}

function boldKeywords(html, keywords) {
    if (!keywords || keywords.length === 0) return html;
    // Sort longest first to avoid partial matches
    const sorted = [...keywords].sort((a, b) => b.length - a.length);
    for (const kw of sorted) {
        const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`(${escaped})`, 'gi');
        html = html.replace(re, '<strong>$1</strong>');
    }
    return html;
}

function auditSnippet(fullText, keywords) {
    if (!fullText) return '';

    const MAX_WORDS = 60;
    const HALF = Math.floor(MAX_WORDS / 2);

    // Use stored keywords first; fall back to all topic keywords for older scan data
    const kwList = (keywords && keywords.length > 0)
        ? keywords
        : (state.topics || []).flatMap(t => t.keywords || []);

    // Find the earliest keyword match (longest first to prefer more specific matches)
    const sorted = kwList.slice().sort((a, b) => b.length - a.length);
    let bestCharIdx = -1;
    let bestKw = null;
    for (const kw of sorted) {
        const idx = fullText.toLowerCase().indexOf(kw.toLowerCase());
        if (idx !== -1 && (bestCharIdx === -1 || idx < bestCharIdx)) {
            bestCharIdx = idx;
            bestKw = kw;
        }
    }

    const words = fullText.split(/\s+/).filter(w => w.length > 0);

    if (bestCharIdx === -1 || !bestKw) {
        const snippet = words.slice(0, MAX_WORDS).join(' ');
        return escapeHtml(snippet + (words.length > MAX_WORDS ? '…' : ''));
    }

    // Find which word index the keyword starts at
    const kwWordStart = fullText.slice(0, bestCharIdx).split(/\s+/).filter(w => w.length > 0).length;

    // Build a MAX_WORDS window centred on the keyword
    let start = Math.max(0, kwWordStart - HALF);
    let end = Math.min(words.length, start + MAX_WORDS);
    // If we hit the end boundary, pull start back to fill the window
    if (end - start < MAX_WORDS) {
        start = Math.max(0, end - MAX_WORDS);
    }

    let snippet = words.slice(start, end).join(' ');
    if (start > 0) snippet = '…' + snippet;
    if (end < words.length) snippet += '…';

    return boldKeywords(escapeHtml(snippet), [bestKw]);
}

function getKeywordsForTopics(topicNames) {
    if (!state.topics || !topicNames) return [];
    const keywords = [];
    for (const t of state.topics) {
        if (topicNames.includes(t.name)) {
            keywords.push(...(t.keywords || []));
        }
    }
    return keywords;
}

function renderResults(results) {
    currentDisplayResults = results;
    resultsPage = 1;
    renderResultsPage();
}

function renderResultsPage() {
    const tbody = document.getElementById('resultsBody');
    tbody.innerHTML = '';

    if (currentDisplayResults.length === 0) {
        const msg = state.currentScanId
            ? 'No results.'
            : 'No scan selected or active.';
        tbody.innerHTML = `<tr><td colspan="7" class="empty-state-preview">${msg}</td></tr>`;
        renderResultsPagination();
        return;
    }

    const start = (resultsPage - 1) * RESULTS_PER_PAGE;
    const pageResults = currentDisplayResults.slice(start, start + RESULTS_PER_PAGE);

    for (const r of pageResults) {
        const tr = document.createElement('tr');

        // Parse topics JSON
        let topics = r.topics;
        try { topics = JSON.parse(r.topics); } catch (e) {}
        const topicNames = Array.isArray(topics) ? topics : [];
        const topicsStr = topicNames.join(', ');

        // Format date as dd/mm/yy
        const dateStr = formatDate(r.activity_date);

        // Quote with keyword bolding and word limit
        const trimmedQuote = trimQuote(r.verbatim_quote || '—', 70);
        let quoteHtml = escapeHtml(trimmedQuote);
        // Bold matched keywords from matched topics
        const matchedKeywords = getKeywordsForTopics(topicNames);
        quoteHtml = boldKeywords(quoteHtml, matchedKeywords);
        if (r.source_url) {
            quoteHtml = `<a href="${escapeHtml(r.source_url)}" target="_blank" class="quote-link">${quoteHtml}</a>`;
        }

        // Master button — three states
        const inMaster = masterResultIds.has(r.id);
        const btnClass = inMaster ? 'btn-add-master state-added ps-btn ps-btn--sm' : 'btn-add-master state-add ps-btn ps-btn--secondary ps-btn--sm';
        const btnIcon = inMaster ? SVG_CHECK + ' Added' : 'Add';
        const btnTitle = inMaster ? 'In record (hover to remove)' : 'Add to record';

        // Escape values for data attributes
        const escapedName = escapeHtml(r.member_name);
        const escapedParty = escapeHtml(r.party || '');
        const escapedType = escapeHtml(r.member_type || '');
        const escapedConstituency = escapeHtml(r.constituency || '');

        // Merged Party + Type column
        const typeSmall = r.member_type ? `<br>${typePill(r.member_type)}` : '';

        // One badge per topic
        const topicBadges = topicNames.length
            ? topicNames.map(t => `<span class="ps-badge ps-badge--accent">${escapeHtml(t)}</span>`).join(' ')
            : '—';

        tr.innerHTML = `
            <td><div class="ps-member"><span class="ps-member__name">${escapeHtml(r.member_name)}</span></div></td>
            <td>${partyPill(r.party || '—')}${typeSmall}</td>
            <td>${topicBadges}</td>
            <td>${escapeHtml(r.summary || '—')}</td>
            <td>${quoteHtml}</td>
            <td>${forumCell(r.source_type || '', r.forum || '', dateStr)}</td>
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

    renderResultsPagination();
}

function renderResultsPagination() {
    const container = document.getElementById('resultsPagination');
    if (!container) return;
    const totalPages = Math.ceil(currentDisplayResults.length / RESULTS_PER_PAGE);
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }
    container.innerHTML = `
        <button class="ps-btn ps-btn--ghost ps-btn--sm" ${resultsPage <= 1 ? 'disabled' : ''}
                onclick="resultsPage--; renderResultsPage()">&larr;</button>
        <span class="page-info">Page ${resultsPage} of ${totalPages}</span>
        <button class="ps-btn ps-btn--ghost ps-btn--sm" ${resultsPage >= totalPages ? 'disabled' : ''}
                onclick="resultsPage++; renderResultsPage()">&rarr;</button>
    `;
}

function setupMasterButton(btn) {
    const resultId = parseInt(btn.dataset.resultId);
    const inMaster = masterResultIds.has(resultId);

    if (inMaster) {
        // Hover: show ✗ in grey; leave: revert to ✓ green
        btn.addEventListener('mouseenter', () => {
            if (btn.classList.contains('state-added')) {
                btn.textContent = 'Remove';
            }
        });
        btn.addEventListener('mouseleave', () => {
            if (btn.classList.contains('state-added')) {
                btn.innerHTML = SVG_CHECK + ' Added';
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
        btn.className = 'btn-add-master state-added ps-btn ps-btn--sm';
        btn.innerHTML = SVG_CHECK + ' Added';
        btn.title = 'In record (hover to remove)';

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
    btn.className = 'btn-add-master state-removing ps-btn ps-btn--sm';
    btn.textContent = '…';
    try {
        await API.del(`/api/master/activity/${resultId}`);

        // Update state
        masterResultIds.delete(resultId);

        // Transition back to "add" state
        btn.className = 'btn-add-master state-add ps-btn ps-btn--secondary ps-btn--sm';
        btn.textContent = 'Add';
        btn.title = 'Add to record';

        // Re-wire events
        btn.replaceWith(btn.cloneNode(true));
        const newBtn = document.querySelector(`.btn-add-master[data-result-id="${resultId}"]`);
        if (newBtn) setupMasterButton(newBtn);

        // Reload master list if visible
        if (typeof loadMasterList === 'function') loadMasterList();
    } catch (err) {
        console.error('Failed to remove from master:', err);
        // Revert
        btn.className = 'btn-add-master state-added ps-btn ps-btn--sm';
        btn.innerHTML = SVG_CHECK + ' Added';
    }
}

const SOURCE_COLOURS = {
    'hansard':          { color: '#f87171', bg: 'rgba(248,113,113,0.15)', label: 'Hansard'      },
    'written_question': { color: '#fbbf24', bg: 'rgba(251,191,36,0.15)', label: 'Written Q'    },
    'written_statement':{ color: '#4ade80', bg: 'rgba(74,222,128,0.15)', label: 'Written Stmt' },
    'edm':              { color: '#e879f9', bg: 'rgba(232,121,249,0.15)',label: 'EDM'          },
    'bill':             { color: '#fb923c', bg: 'rgba(251,146,60,0.15)', label: 'Bill'         },
    'division':         { color: '#7dd3fc', bg: 'rgba(125,211,252,0.15)', label: 'Division'     },
};

function forumCell(sourceType, forum, dateStr) {
    const src = SOURCE_COLOURS[sourceType];
    const label = src ? src.label : (sourceType || '—');
    const badgeHtml = src
        ? `<span class="ps-badge" style="background:${src.bg};color:${src.color};border-color:${src.color}55">${escapeHtml(label)}</span>`
        : `<span class="ps-badge">${escapeHtml(label)}</span>`;

    // forum is like "Hansard: Housing Policy" — extract the part after ": " as detail
    const colonIdx = forum ? forum.indexOf(': ') : -1;
    const detail = colonIdx >= 0 ? forum.slice(colonIdx + 2) : '';
    const detailHtml = detail ? `<br><span class="ps-forum-detail">${escapeHtml(detail)}</span>` : '';

    const dateHtml = dateStr ? `<small class="ps-forum-date"><strong>${dateStr}</strong></small>` : '';
    return badgeHtml + detailHtml + dateHtml;
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
        return String(row.summary || '').toLowerCase();
    }
    if (col === 'forum') {
        return String(row.forum || '').toLowerCase() + ' ' + String(row.activity_date || '');
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
    auditSection.style.display = '';
    try {
        const data = await API.get(`/api/scans/${scanId}/audit`);
        const summary = data.summary || {};
        const entries = data.entries || [];

        const listDiv = document.getElementById('auditList');
        const summaryDiv = document.getElementById('auditSummary');

        if (entries.length === 0) {
            // Show empty state instead of hiding
            summaryDiv.innerHTML = '';
            listDiv.innerHTML = '<p class="empty-state-preview">No discarded items.</p>';
            return;
        }

        // Render summary counts by discard category
        const CATEGORY_LABELS = {
            procedural:  'Procedural',
            no_position: 'No Position',
            off_topic:   'Off-Topic',
            generic:     'Generic',
        };
        let summaryHtml = '';
        for (const [cat, label] of Object.entries(CATEGORY_LABELS)) {
            if (summary[cat]) {
                summaryHtml += `<div class="audit-count">
                    <span class="count-badge discard-pill--${cat}">${summary[cat]}</span>
                    <span>${label}</span>
                </div>`;
            }
        }
        summaryDiv.innerHTML = summaryHtml;

        // Render entries
        let listHtml = `<div class="audit-header">
            <span>Name</span>
            <span>Contribution</span>
            <span>Reason discarded</span>
            <span>Action</span>
        </div>`;
        for (const e of entries) {
            const isProcedural = e.classification === 'procedural_filter';
            let keywords = [];
            try { keywords = JSON.parse(e.matched_keywords || '[]'); } catch {}
            const snippetHtml = auditSnippet(e.full_text || e.text_preview || '', keywords);
            const previewContent = e.source_url
                ? `<a href="${escapeHtml(e.source_url)}" target="_blank" rel="noopener" class="audit-preview-link">${snippetHtml}</a>`
                : snippetHtml;
            const cat = isProcedural ? 'procedural' : (e.discard_category || 'generic');
            const CATEGORY_LABELS = { procedural: 'Procedural', no_position: 'No Position', off_topic: 'Off-Topic', generic: 'Generic' };
            const pillLabel = CATEGORY_LABELS[cat] || cat;
            const pill = `<span class="discard-pill discard-pill--${cat}">${pillLabel}</span>`;
            const reasonText = e.discard_reason ? ` ${escapeHtml(e.discard_reason)}` : '';
            const reasonHtml = `<span class="audit-reason">${pill}${reasonText}</span>`;
            listHtml += `<div class="audit-item">
                <span class="audit-member">${escapeHtml(e.member_name)}</span>
                <span class="audit-preview">${previewContent}</span>
                ${reasonHtml}
                <div class="audit-actions-dropdown" id="audit-actions-${e.id}">
                    <button class="ps-btn ps-btn--ghost ps-btn--sm audit-actions-trigger" onclick="toggleAuditMenu(event, ${e.id})" title="Actions">&#8942;</button>
                    <div class="audit-actions-menu" id="audit-menu-${e.id}" style="display:none;">
                        <button onclick="reclassifyAuditItem(${e.id}, ${scanId}); closeAuditMenu(${e.id})">Add to results</button>
                    </div>
                </div>
            </div>`;
        }
        listDiv.innerHTML = listHtml;
    } catch (err) {
        // Audit not available for older scans — show empty state
        const listDiv = document.getElementById('auditList');
        const summaryDiv = document.getElementById('auditSummary');
        summaryDiv.innerHTML = '';
        listDiv.innerHTML = '<p class="empty-state-preview">No discarded items.</p>';
    }
}

// Audit panel toggle (collapse/expand)
document.getElementById('auditToggle').addEventListener('click', () => {
    const list = document.getElementById('auditList');
    const icon = document.querySelector('#audit-section .toggle-icon');
    list.classList.toggle('collapsed');
    icon.classList.toggle('collapsed');
});

// Audit item three-dot menu
function toggleAuditMenu(e, auditId) {
    e.stopPropagation();
    document.querySelectorAll('.audit-actions-menu').forEach(m => {
        if (m.id !== `audit-menu-${auditId}`) m.style.display = 'none';
    });
    const menu = document.getElementById(`audit-menu-${auditId}`);
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

function closeAuditMenu(auditId) {
    const menu = document.getElementById(`audit-menu-${auditId}`);
    if (menu) menu.style.display = 'none';
}

document.addEventListener('click', () => {
    document.querySelectorAll('.audit-actions-menu').forEach(m => m.style.display = 'none');
});

// Reclassify a discarded audit item
async function reclassifyAuditItem(auditId, scanId) {
    try {
        const result = await API.post('/api/audit/reclassify', {
            audit_id: auditId,
            scan_id: scanId,
        });

        if (result.added) {
            // Reload results to show the new entry
            await loadResults(scanId);
            await loadAudit(scanId);
        }
    } catch (err) {
        console.error('Reclassify failed:', err);
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

        // Format the scan conducted date/time
        let conductedStr = '';
        if (s.created_at) {
            const d = new Date(s.created_at);
            if (!isNaN(d)) {
                const dd = String(d.getDate()).padStart(2, '0');
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const yy = String(d.getFullYear()).slice(-2);
                const hh = String(d.getHours()).padStart(2, '0');
                const mi = String(d.getMinutes()).padStart(2, '0');
                conductedStr = `${dd}/${mm}/${yy} ${hh}:${mi}`;
            }
        }

        const automatedDot = s.trigger === 'scheduled'
            ? '<span class="history-automated-dot" title="Automated">A</span>'
            : '';
        const errorMsg = s.error_message || '';
        const errorTitle = errorMsg ? ` title="${errorMsg.replace(/"/g, '&quot;')}"` : '';
        const errorClass = errorMsg ? ' history-status--clickable' : '';
        div.innerHTML = `
            <span class="history-date">${formatDate(s.start_date)} to ${formatDate(s.end_date)}</span>
            <span class="history-conducted">${automatedDot}${conductedStr}</span>
            <span>${s.total_relevant || 0} results</span>
            <span class="history-status-col"><span class="history-status ${s.status}${errorClass}"${errorTitle}>${s.status}</span></span>
        `;
        if (errorMsg) {
            div.querySelector('.history-status').addEventListener('click', (e) => {
                e.stopPropagation();
                document.getElementById('scanErrorModalMsg').textContent = errorMsg;
                document.getElementById('scanErrorModal').style.display = '';
            });
        }
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
            <button class="ps-btn ps-btn--ghost ps-btn--sm" ${historyPage <= 1 ? 'disabled' : ''}
                    onclick="historyPage--; loadHistory()">&larr;</button>
            <span class="page-info">Page ${historyPage} of ${totalPages}</span>
            <button class="ps-btn ps-btn--ghost ps-btn--sm" ${historyPage >= totalPages ? 'disabled' : ''}
                    onclick="historyPage++; loadHistory()">&rarr;</button>
        `;
        container.appendChild(nav);
    }
}
