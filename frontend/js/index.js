/* Member Index — embedded in Scanner tab, auto-generates for the active scan */

const INDEX_PAGE_SIZE = 10;

const _idx = {
    selectedId: null,
    data: null,
    activeTopic: null,  // null = cross-topic view
    page: 1,
};

// ── Entry point (called by results.js after loading a scan) ───────────────────

async function _idxGenerateForScan(scanId) {
    // Same scan already loaded — quiet background refresh, preserving filter state
    if (_idx.selectedId === scanId && _idx.data !== null) {
        await _idxSoftRefresh();
        return;
    }
    // New scan selected — full reset
    _idx.selectedId = scanId;
    _idx.data = null;
    _idx.activeTopic = null;
    _idx.page = 1;
    await _idxGenerate();
}

async function _idxSoftRefresh() {
    if (_idx.selectedId === null) return;
    try {
        const data = await API.post('/api/index/generate', { scan_ids: [_idx.selectedId] });
        _idx.data = data;
        // If the selected topic was removed from results, fall back to all-topics view
        if (_idx.activeTopic !== null && !(data.meta.topics || []).includes(_idx.activeTopic)) {
            _idx.activeTopic = null;
            _idx.page = 1;
        }
        _idxRenderTopicChips();
        _idxRenderStandings();
        if (typeof _applyResultsState === 'function') _applyResultsState();
    } catch (e) {
        // Fail silently — non-critical background refresh
    }
}

// ── Generate ──────────────────────────────────────────────────────────────────

async function _idxGenerate() {
    if (_idx.selectedId === null) {
        _idxClearStandings();
        return;
    }

    const tbody = document.getElementById('indexStandingsBody');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--ps-text-secondary);">Generating…</td></tr>';
    }
    document.getElementById('indexTopicChips').style.display = 'none';
    const pag = document.getElementById('indexStandingsPagination');
    if (pag) pag.innerHTML = '';
    if (typeof _applyResultsState === 'function') _applyResultsState();

    try {
        const data = await API.post('/api/index/generate', { scan_ids: [_idx.selectedId] });
        _idx.data = data;
        _idx.activeTopic = null;
        _idx.page = 1;
        _idxRenderTopicChips();
        _idxRenderStandings();
        if (typeof _applyResultsState === 'function') _applyResultsState();
    } catch (e) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--ps-danger);">Failed to generate index.</td></tr>`;
    }
}

function _idxClearStandings() {
    _idx.data = null;
    _idx.selectedId = null;
    const tbody = document.getElementById('indexStandingsBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="empty-state-preview">No scan selected or active.</td></tr>';
    document.getElementById('indexTopicChips').style.display = 'none';
    const pag = document.getElementById('indexStandingsPagination');
    if (pag) pag.innerHTML = '';
    if (typeof _applyResultsState === 'function') _applyResultsState();
}

// ── Topic chips ───────────────────────────────────────────────────────────────

function _idxRenderTopicChips() {
    const data = _idx.data;
    const wrap = document.getElementById('indexTopicChips');
    const items = document.getElementById('indexTopicChipItems');
    if (!wrap || !items || !data) return;

    const topics = data.meta.topics || [];
    if (!topics.length) {
        wrap.style.display = 'none';
        return;
    }

    wrap.style.display = '';
    const active = _idx.activeTopic;

    const chips = [
        ...(topics.length > 1 ? [`<span class="ps-chip-topic-wrap ps-chip-topic-wrap--view-only${active === null ? ' ps-chip-topic-wrap--active' : ''}"><button class="ps-chip${active === null ? ' ps-chip--active' : ''}" onclick="_idxSetTopic(null)">All Topics</button></span>`] : []),
        ...topics.map(t =>
            `<span class="ps-chip-topic-wrap ps-chip-topic-wrap--view-only${active === t ? ' ps-chip-topic-wrap--active' : ''}"><button class="ps-chip${active === t ? ' ps-chip--active' : ''}" onclick='_idxSetTopic(${JSON.stringify(t)})'>${escapeHtml(t)}</button></span>`
        ),
    ];
    items.innerHTML = chips.join('');
}

function _idxSetTopic(topic) {
    _idx.activeTopic = topic;
    _idx.page = 1;
    _idxRenderTopicChips();
    _idxRenderStandings();
}

// ── Standings table ───────────────────────────────────────────────────────────

function _idxRenderStandings() {
    const data = _idx.data;
    const tbody = document.getElementById('indexStandingsBody');
    if (!data || !tbody) return;

    const topic = _idx.activeTopic;
    const rows = topic === null ? (data.cross_topic || []) : (data.topics[topic] || []);

    const total = rows.length;
    const page = _idx.page;
    const pageRows = rows.slice((page - 1) * INDEX_PAGE_SIZE, page * INDEX_PAGE_SIZE);

    tbody.innerHTML = '';

    for (const m of pageRows) {
        const tr = document.createElement('tr');
        tr.className = 'index-standings-row';

        const partyBadge = (typeof partyPill === 'function') ? partyPill(m.party || '—') : escapeHtml(m.party || '—');
        const typeBadge = (typeof typePill === 'function') ? typePill(m.member_type || '—') : escapeHtml(m.member_type || '—');

        tr.innerHTML = `
            <td style="text-align:center;font-weight:600;color:var(--ps-text-secondary);">${m.rank}</td>
            <td><div class="ps-member"><span class="ps-member__name">${escapeHtml(m.member_name)}</span></div></td>
            <td><div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;">${partyBadge}${typeBadge}</div></td>
            <td style="text-align:center;color:var(--ps-text-secondary);">${m.mentions}</td>
        `;

        tr.addEventListener('click', () => _idxToggleRow(tr, m.activities || []));
        tbody.appendChild(tr);
    }

    _idxRenderPagination(total, page);
}

// ── Activity expansion ────────────────────────────────────────────────────────

function _idxToggleRow(tr, activities) {
    const colCount = 4;

    // If already open, close it
    const next = tr.nextElementSibling;
    if (next && next.classList.contains('index-act-row')) {
        next.remove();
        tr.classList.remove('index-row-open');
        return;
    }

    // Close any other open rows
    document.querySelectorAll('#indexStandingsBody .index-act-row').forEach(r => r.remove());
    document.querySelectorAll('#indexStandingsBody .index-row-open').forEach(r => r.classList.remove('index-row-open'));

    tr.classList.add('index-row-open');

    const subRow = document.createElement('tr');
    subRow.className = 'index-act-row';

    let html = '<div class="master-act-list">';
    if (!activities.length) {
        html += '<span class="master-act-empty">No activities recorded.</span>';
    } else {
        for (const a of activities) {
            const dateStr = (typeof formatDate === 'function') ? formatDate(a.activity_date) : (a.activity_date || '');
            const src = (typeof SOURCE_COLOURS !== 'undefined') ? SOURCE_COLOURS[a.source_type] : null;
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
                    <div class="master-act-body">
                        ${summaryContent}
                    </div>
                </div>`;
        }
    }
    html += '</div>';

    subRow.innerHTML = `<td colspan="${colCount}">${html}</td>`;
    tr.after(subRow);
}

// ── Pagination ────────────────────────────────────────────────────────────────

function _idxRenderPagination(total, page) {
    const container = document.getElementById('indexStandingsPagination');
    if (!container) return;
    const totalPages = Math.ceil(total / INDEX_PAGE_SIZE);
    if (totalPages <= 1) { container.innerHTML = ''; return; }

    container.innerHTML = `
        <button class="ps-btn ps-btn--ghost ps-btn--sm" ${page <= 1 ? 'disabled' : ''} onclick="_idxPage(${page - 1})">&larr;</button>
        <span class="page-info">Page ${page} of ${totalPages}</span>
        <button class="ps-btn ps-btn--ghost ps-btn--sm" ${page >= totalPages ? 'disabled' : ''} onclick="_idxPage(${page + 1})">&rarr;</button>
    `;
}

function _idxPage(n) {
    document.querySelectorAll('#indexStandingsBody .index-act-row').forEach(r => r.remove());
    document.querySelectorAll('#indexStandingsBody .index-row-open').forEach(r => r.classList.remove('index-row-open'));
    _idx.page = n;
    _idxRenderStandings();
}

// ── Excel export ──────────────────────────────────────────────────────────────

function exportIndexExcel() {
    if (_idx.selectedId === null) { alert('No scan selected.'); return; }
    window.location.href = `/api/index/export?scan_ids=${_idx.selectedId}`;
}
