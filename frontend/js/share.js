/* ParliScan — Shared results page (no auth required) */

// Global results array — used by member-profile.js
let allResults = [];
// Global topic names set — used by member-profile.js timeline
let currentScanTopicNames = null;

let _shareView = 'mentions';
let _sharePage = 1;
const _SHARE_PER_PAGE = 10;
let _shareDisplayResults = [];

// ── Colour maps (mirrored from results.js) ────────────────────────────────────

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

const SOURCE_COLOURS = {
    'hansard':          { color: '#f87171', bg: 'rgba(248,113,113,0.15)', label: 'Hansard'           },
    'written_question': { color: '#fbbf24', bg: 'rgba(251,191,36,0.15)', label: 'Written Question'   },
    'written_answer':   { color: '#fbbf24', bg: 'rgba(251,191,36,0.15)', label: 'Written Answer'     },
    'written_statement':{ color: '#4ade80', bg: 'rgba(74,222,128,0.15)', label: 'Written Statement'  },
    'edm':              { color: '#e879f9', bg: 'rgba(232,121,249,0.15)', label: 'EDM'               },
    'bill':             { color: '#fb923c', bg: 'rgba(251,146,60,0.15)', label: 'Bill'               },
    'division':         { color: '#7dd3fc', bg: 'rgba(125,211,252,0.15)', label: 'Division'          },
    'oral_evidence':    { color: '#a78bfa', bg: 'rgba(167,139,250,0.15)', label: 'Oral Evidence'     },
};

// ── Utilities ─────────────────────────────────────────────────────────────────

function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = String(str == null ? '' : str);
    return d.innerHTML;
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

function trimQuote(text, max = 70) {
    if (!text) return text;
    const words = text.split(/\s+/);
    if (words.length <= max) return text;
    return words.slice(0, max).join(' ') + '…';
}

function topicChip(name) {
    const MAX = 15, TRUNC = 13;
    const display = name.length > MAX ? name.slice(0, TRUNC) + '…' : name;
    const titleAttr = name.length > MAX ? ` title="${escapeHtml(name)}"` : '';
    return `<span class="ps-chip-topic-wrap ps-chip-topic-wrap--view-only"${titleAttr}><span class="ps-chip">${escapeHtml(display)}</span></span>`;
}

function partyPill(party) {
    if (!party || party === '—') return '—';
    const c = PARTY_COLOURS[party];
    if (c) return `<span class="ps-badge" style="background:${c.bg};color:${c.color};border-color:${c.color}55">${escapeHtml(party)}</span>`;
    return `<span class="ps-badge ps-badge--muted">${escapeHtml(party)}</span>`;
}

function typePill(type) {
    if (!type || type === '—') return '—';
    const c = TYPE_COLOURS[type];
    if (c) return `<span class="ps-badge" style="background:${c.bg};color:${c.color};border-color:${c.color}55">${escapeHtml(type)}</span>`;
    return `<span class="ps-badge">${escapeHtml(type)}</span>`;
}

function forumCell(sourceType, forum, dateStr) {
    const src = SOURCE_COLOURS[sourceType];
    const label = src ? src.label : (sourceType || '—');
    const badgeHtml = src
        ? `<span class="ps-badge" style="background:${src.bg};color:${src.color};border-color:${src.color}55">${escapeHtml(label)}</span>`
        : `<span class="ps-badge">${escapeHtml(label)}</span>`;
    const colonIdx = forum ? forum.indexOf(': ') : -1;
    const detail = colonIdx >= 0 ? forum.slice(colonIdx + 2) : '';
    const detailHtml = detail ? `<br><span class="ps-forum-detail">${escapeHtml(detail)}</span>` : '';
    const dateHtml = dateStr ? `<small class="ps-forum-date"><strong>${dateStr}</strong></small>` : '';
    return badgeHtml + detailHtml + dateHtml;
}

// ── Source key → display label + result source_type mapping ──────────────────
// Keys match scanner chip data-source values; result_types match source_type in results

const SCAN_SOURCE_MAP = {
    'hansard':            { label: 'Hansard',            result_types: ['hansard']                          },
    'written_questions':  { label: 'Written Questions',  result_types: ['written_question', 'written_answer'] },
    'written_statements': { label: 'Written Statements', result_types: ['written_statement']                 },
    'edms':               { label: 'EDMs',               result_types: ['edm']                              },
    'bills':              { label: 'Bills',               result_types: ['bill']                             },
    'divisions':          { label: 'Divisions',          result_types: ['division']                         },
    'oral_evidence':      { label: 'Oral Evidence',      result_types: ['oral_evidence']                    },
};

// ── Scan summary ──────────────────────────────────────────────────────────────

function renderScanSummary(scan, results, topicNames) {
    const el = document.getElementById('shareScanSummary');
    if (!el) return;

    const fmtShort = (s) => {
        if (!s) return '—';
        const d = new Date(s);
        if (isNaN(d)) return s;
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
    };

    // Topic names that actually have results
    const topicsWithResults = new Set();
    for (const r of results) {
        let t = r.topics;
        try { t = JSON.parse(t); } catch (e) {}
        if (Array.isArray(t)) t.forEach(n => topicsWithResults.add(n));
    }

    // Source types present in results
    const sourceTypesWithResults = new Set(results.map(r => r.source_type));

    // Scan sources list
    let sources = scan.sources || [];
    try { sources = JSON.parse(sources); } catch (e) {}
    if (!Array.isArray(sources)) sources = sources ? [sources] : [];

    // ── Row 1: stat boxes — Period | Scanned | Results ────────────────────────
    const period = `${fmtShort(scan.start_date)} – ${fmtShort(scan.end_date)}`;
    const scannedDate = fmtShort(scan.completed_at || scan.created_at);

    let html = `<div class="share-summary-row">
        <div class="pipe-box" style="flex:0 0 auto;">
            <div class="pipe-box-value" style="font-size:0.95rem;">${escapeHtml(period)}</div>
            <div class="pipe-box-label">Period</div>
        </div>
        <div class="pipe-box" style="flex:0 0 auto;">
            <div class="pipe-box-value" style="font-size:0.95rem;">${escapeHtml(scannedDate)}</div>
            <div class="pipe-box-label">Scanned</div>
        </div>
        <div class="pipe-box pipe-box-relevant" style="flex:0 0 auto;min-width:80px;">
            <div class="pipe-box-value">${escapeHtml(String(scan.total_relevant ?? '—'))}</div>
            <div class="pipe-box-label">Results</div>
        </div>
    </div>`;

    // ── Row 2: member filter (if any) ─────────────────────────────────────────
    if (scan.target_member_name) {
        let names = [];
        try { names = JSON.parse(scan.target_member_name); } catch (e) {
            names = [scan.target_member_name];
        }
        const pills = names.map(n => `
            <span class="member-selected-pill">
                <span class="member-selected-pill__name">${escapeHtml(n)}</span>
            </span>`).join('');
        html += `<div class="share-summary-row" style="align-items:center;">
            <span class="share-summary-section-label">Member</span>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">${pills}</div>
        </div>`;
    }

    // ── Row 3: topics — all shown, grey if no results ─────────────────────────
    if (topicNames.length) {
        const chips = topicNames.map(t => {
            const hasResults = topicsWithResults.has(t);
            const wrapClass = `ps-chip-topic-wrap ps-chip-topic-wrap--view-only${hasResults ? '' : ' ps-chip-topic-wrap--inactive'}`;
            const chipStyle = hasResults ? '' : 'opacity:0.35;';
            return `<span class="${wrapClass}"><span class="ps-chip" style="${chipStyle}">${escapeHtml(t)}</span></span>`;
        }).join('');
        html += `<div class="share-summary-row" style="align-items:center;">
            <span class="share-summary-section-label">Topics</span>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">${chips}</div>
        </div>`;
    }

    // ── Row 4: sources — all shown, colour if results found, grey if not ──────
    if (sources.length) {
        const badges = sources.map(s => {
            const def = SCAN_SOURCE_MAP[s];
            const label = def ? def.label : s.replace(/_/g, ' ');
            const hasResults = def
                ? def.result_types.some(rt => sourceTypesWithResults.has(rt))
                : sourceTypesWithResults.has(s);
            if (hasResults) {
                // Use SOURCE_COLOURS keyed by first result_type, or fallback muted
                const src = def ? SOURCE_COLOURS[def.result_types[0]] : null;
                if (src) return `<span class="ps-badge" style="background:${src.bg};color:${src.color};border-color:${src.color}55">${escapeHtml(label)}</span>`;
            }
            return `<span class="ps-badge ps-badge--muted" style="opacity:0.4;">${escapeHtml(label)}</span>`;
        }).join('');
        html += `<div class="share-summary-row" style="align-items:center;">
            <span class="share-summary-section-label">Sources</span>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">${badges}</div>
        </div>`;
    }

    el.innerHTML = html;
}

// ── Mentions table ────────────────────────────────────────────────────────────

function renderShareResultsPage() {
    const tbody = document.getElementById('shareResultsBody');
    tbody.innerHTML = '';

    if (_shareDisplayResults.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state-preview">No results.</td></tr>';
        renderSharePagination();
        return;
    }

    const start = (_sharePage - 1) * _SHARE_PER_PAGE;
    const pageResults = _shareDisplayResults.slice(start, start + _SHARE_PER_PAGE);

    for (const r of pageResults) {
        const tr = document.createElement('tr');
        if (r.id) tr.id = `result-row-${r.id}`;

        let topics = r.topics;
        try { topics = JSON.parse(r.topics); } catch (e) {}
        const topicNames = Array.isArray(topics) ? topics : [];

        const dateStr = formatDate(r.activity_date);
        const trimmedQuote = trimQuote(r.verbatim_quote || '—', 70);
        let quoteHtml = escapeHtml(trimmedQuote);
        if (r.source_url) {
            quoteHtml = `<a href="${escapeHtml(r.source_url)}" target="_blank" class="quote-link">${quoteHtml}</a>`;
        }

        const typeSmall = r.member_type ? ` ${typePill(r.member_type)}` : '';
        const partyLine = (r.party || r.member_type)
            ? `<div class="ps-member__meta">${partyPill(r.party || '—')}${typeSmall}</div>`
            : '';
        const topicBadges = topicNames.length
            ? `<div class="topic-badge-list">${topicNames.map(t => topicChip(t)).join('')}</div>`
            : '—';

        tr.innerHTML = `
            <td><div class="ps-member"><span class="ps-member__name mp-member-link" style="cursor:pointer;">${escapeHtml(r.member_name)}</span>${partyLine}</div></td>
            <td>${topicBadges}</td>
            <td>${escapeHtml(r.summary || '—')}</td>
            <td>${quoteHtml}</td>
            <td>${forumCell(r.source_type || '', r.forum || '', dateStr)}</td>
        `;

        const nameEl = tr.querySelector('.mp-member-link');
        if (nameEl) {
            nameEl.addEventListener('click', (e) => {
                e.stopPropagation();
                openMemberProfile(r.member_name);
            });
        }

        tbody.appendChild(tr);
    }

    renderSharePagination();
}

function renderSharePagination() {
    const container = document.getElementById('shareResultsPagination');
    if (!container) return;
    const totalPages = Math.ceil(_shareDisplayResults.length / _SHARE_PER_PAGE);
    if (totalPages <= 1) { container.innerHTML = ''; return; }
    container.innerHTML = `
        <button class="ps-btn ps-btn--ghost ps-btn--sm" ${_sharePage <= 1 ? 'disabled' : ''}
                onclick="_sharePage--; renderShareResultsPage()">&larr;</button>
        <span class="page-info">Page ${_sharePage} of ${totalPages}</span>
        <button class="ps-btn ps-btn--ghost ps-btn--sm" ${_sharePage >= totalPages ? 'disabled' : ''}
                onclick="_sharePage++; renderShareResultsPage()">&rarr;</button>
    `;
}

// ── Members table ─────────────────────────────────────────────────────────────

let _shareMembersPage = 1;
const _SHARE_MEMBERS_PER_PAGE = 20;
let _shareMembersData = [];

function buildMembersData(results) {
    const map = {};
    for (const r of results) {
        if (!map[r.member_name]) {
            map[r.member_name] = { name: r.member_name, party: r.party, type: r.member_type, count: 0, activities: [] };
        }
        map[r.member_name].count++;
        map[r.member_name].activities.push(r);
    }
    // Sort activities by date within each member
    for (const m of Object.values(map)) {
        m.activities.sort((a, b) => (b.activity_date || '').localeCompare(a.activity_date || ''));
    }
    return Object.values(map).sort((a, b) => b.count - a.count);
}

function renderShareMembersPage() {
    const tbody = document.getElementById('shareMembersBody');
    tbody.innerHTML = '';

    if (_shareMembersData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-state-preview">No results.</td></tr>';
        renderShareMembersPagination();
        return;
    }

    const start = (_shareMembersPage - 1) * _SHARE_MEMBERS_PER_PAGE;
    const page = _shareMembersData.slice(start, start + _SHARE_MEMBERS_PER_PAGE);

    page.forEach((m, i) => {
        const rank = start + i + 1;
        const typeSmall = m.type ? `<br>${typePill(m.type)}` : '';
        const tr = document.createElement('tr');
        tr.className = 'index-standings-row';
        tr.style.cursor = 'pointer';
        tr.innerHTML = `
            <td style="text-align:center;font-weight:600;color:var(--ps-text-secondary);">${rank}</td>
            <td><div class="ps-member"><span class="ps-member__name mp-member-link">${escapeHtml(m.name)}</span></div></td>
            <td><div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;">${partyPill(m.party || '—')}${typeSmall}</div></td>
            <td style="text-align:center;color:var(--ps-text-secondary);">${m.count}</td>
        `;

        // Row click → expand activities
        tr.addEventListener('click', () => _shareToggleMemberRow(tr, m.activities));

        // Name click → open analysis panel
        const nameEl = tr.querySelector('.mp-member-link');
        if (nameEl) {
            nameEl.style.cursor = 'pointer';
            nameEl.addEventListener('click', (e) => {
                e.stopPropagation();
                openMemberProfile(m.name);
            });
        }

        tbody.appendChild(tr);
    });

    renderShareMembersPagination();
}

function _shareToggleMemberRow(tr, activities) {
    const next = tr.nextElementSibling;
    if (next && next.classList.contains('index-act-row')) {
        next.remove();
        tr.classList.remove('index-row-open');
        return;
    }

    // Close any other open rows
    document.querySelectorAll('#shareMembersBody .index-act-row').forEach(r => r.remove());
    document.querySelectorAll('#shareMembersBody .index-row-open').forEach(r => r.classList.remove('index-row-open'));

    tr.classList.add('index-row-open');

    const subRow = document.createElement('tr');
    subRow.className = 'index-act-row';

    let html = '<div class="master-act-list">';
    if (!activities.length) {
        html += '<span class="master-act-empty">No activities recorded.</span>';
    } else {
        for (const a of activities) {
            const dateStr = formatDate(a.activity_date);
            const src = SOURCE_COLOURS[a.source_type];
            const srcLabel = src ? src.label : (a.source_type ? a.source_type.replace(/_/g, ' ') : '');
            const badgeHtml = src
                ? `<span class="ps-badge" style="background:${src.bg};color:${src.color};border-color:${src.color}55">${escapeHtml(srcLabel)}</span>`
                : (srcLabel ? `<span class="ps-badge ps-badge--muted">${escapeHtml(srcLabel)}</span>` : '');

            const summary = a.summary || '';
            const summaryContent = a.source_url
                ? `<a href="${escapeHtml(a.source_url)}" target="_blank" rel="noopener" class="index-act-summary index-act-summary--link">${escapeHtml(summary)}</a>`
                : `<span class="index-act-summary">${escapeHtml(summary)}</span>`;

            html += `
                <div class="master-act-item">
                    <div class="master-act-meta">
                        <span class="master-act-date">${escapeHtml(dateStr)}</span>
                        ${badgeHtml}
                    </div>
                    <div class="master-act-body">${summaryContent}</div>
                </div>`;
        }
    }
    html += '</div>';

    subRow.innerHTML = `<td colspan="4">${html}</td>`;
    tr.after(subRow);
}

function renderShareMembersPagination() {
    const container = document.getElementById('shareMembersPagination');
    if (!container) return;
    const totalPages = Math.ceil(_shareMembersData.length / _SHARE_MEMBERS_PER_PAGE);
    if (totalPages <= 1) { container.innerHTML = ''; return; }
    container.innerHTML = `
        <button class="ps-btn ps-btn--ghost ps-btn--sm" ${_shareMembersPage <= 1 ? 'disabled' : ''}
                onclick="_shareMembersPage--; renderShareMembersPage()">&larr;</button>
        <span class="page-info">Page ${_shareMembersPage} of ${totalPages}</span>
        <button class="ps-btn ps-btn--ghost ps-btn--sm" ${_shareMembersPage >= totalPages ? 'disabled' : ''}
                onclick="_shareMembersPage++; renderShareMembersPage()">&rarr;</button>
    `;
}

// ── View toggle ───────────────────────────────────────────────────────────────

function shareSetView(view) {
    _shareView = view;
    document.getElementById('shareMentionsContent').style.display = view === 'mentions' ? '' : 'none';
    document.getElementById('shareMembersContent').style.display  = view === 'members'  ? '' : 'none';
    document.getElementById('shareMentionsViewBtn').classList.toggle('results-view-seg__btn--active', view === 'mentions');
    document.getElementById('shareMembersViewBtn').classList.toggle('results-view-seg__btn--active', view === 'members');
}

// ── Dot click: navigate to the row in the mentions table ──────────────────────
// Overrides the version in member-profile.js (share.js loads second)

function _atlDotClick(e) {
    const resultId = parseInt(e.currentTarget.dataset.resultId);
    if (!resultId) return;

    const idx = _shareDisplayResults.findIndex(r => r.id === resultId);
    if (idx === -1) return;

    // Switch to mentions view in case members view is active
    shareSetView('mentions');

    const targetPage = Math.floor(idx / _SHARE_PER_PAGE) + 1;
    if (targetPage !== _sharePage) {
        _sharePage = targetPage;
        renderShareResultsPage();
    }

    requestAnimationFrame(() => {
        const row = document.getElementById(`result-row-${resultId}`);
        if (row) {
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            row.classList.add('result-row--flash');
            setTimeout(() => row.classList.remove('result-row--flash'), 2000);
        }
    });
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

(async function init() {
    const token = location.pathname.split('/share/')[1];
    if (!token) {
        document.getElementById('shareLoading').style.display = 'none';
        document.getElementById('shareError').style.display = '';
        return;
    }

    try {
        const resp = await fetch(`/api/share/${token}`);
        if (!resp.ok) throw new Error('not found');
        const data = await resp.json();

        allResults = data.results || [];
        _shareDisplayResults = allResults;
        _shareMembersData = buildMembersData(allResults);

        // Set topic names for member-profile.js timeline filtering
        const topicNames = data.topic_names || [];
        currentScanTopicNames = topicNames.length ? new Set(topicNames) : null;

        renderScanSummary(data.scan || {}, allResults, topicNames);
        renderShareResultsPage();
        renderShareMembersPage();

        // Inline timeline for single-member scans
        const scan = data.scan || {};
        let memberNames = [];
        try { memberNames = JSON.parse(scan.target_member_name || 'null') || []; } catch (e) {
            if (scan.target_member_name) memberNames = [scan.target_member_name];
        }
        if (!Array.isArray(memberNames)) memberNames = memberNames ? [memberNames] : [];
        if (memberNames.length === 1) {
            renderInlineAnalysis(memberNames[0], scan.id);
            // Members tab is redundant for single-member scans — hide the toggle
            document.getElementById('shareResultsViewSelector').style.display = 'none';
            shareSetView('mentions');
        }

        document.getElementById('shareLoading').style.display = 'none';
        document.getElementById('shareContent').style.display = '';
    } catch (e) {
        document.getElementById('shareLoading').style.display = 'none';
        document.getElementById('shareError').style.display = '';
    }
})();
