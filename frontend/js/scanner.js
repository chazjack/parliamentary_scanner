/* Parliamentary Scanner — Scan control and SSE progress */

function toggleSection(sectionId) {
    const section = document.getElementById(sectionId);
    if (!section) return;
    const body = section.querySelector('.section-body');
    const btn = section.querySelector('.section-collapse-btn');
    const nowCollapsed = !section.classList.contains('is-collapsed');
    section.classList.toggle('is-collapsed', nowCollapsed);
    if (body) body.style.display = nowCollapsed ? 'none' : '';
    if (btn) btn.classList.toggle('is-collapsed', nowCollapsed);
}

function expandSection(sectionId) {
    const section = document.getElementById(sectionId);
    if (!section || !section.classList.contains('is-collapsed')) return;
    toggleSection(sectionId);
}

let _resultsTab = 'results';   // 'results' | 'audit'
let _resultsView = 'mentions'; // 'mentions' | 'members'

function _applyResultsState() {
    const onResults = _resultsTab === 'results';
    const onMentions = onResults && _resultsView === 'mentions';
    const onMembers  = onResults && _resultsView === 'members';

    const el = id => document.getElementById(id);

    // Sub-view selector visibility
    el('resultsViewSelector').style.display = onResults ? '' : 'none';

    // Content panels
    el('mentionsContent').style.display = onMentions ? '' : 'none';
    el('membersContent').style.display  = onMembers  ? '' : 'none';
    el('auditTabContent').style.display = onResults  ? 'none' : '';

    // Export buttons
    el('exportBtn').style.display = onMentions ? '' : 'none';
    const hasIndexData = typeof _idx !== 'undefined' && _idx.data !== null;
    el('indexExportBtn').style.display = (onMembers && hasIndexData) ? '' : 'none';

    // Tab button states
    el('resultsTabBtn').classList.toggle('results-tab-active', onResults);
    el('auditTabBtn').classList.toggle('results-tab-active', !onResults);

    // View button states
    el('mentionsViewBtn').classList.toggle('results-view-active', _resultsView === 'mentions');
    el('membersViewBtn').classList.toggle('results-view-active', _resultsView === 'members');
}

function switchResultsTab(tab) {
    expandSection('results-section');
    _resultsTab = tab;
    _applyResultsState();
}

function switchResultsView(view) {
    _resultsView = view;
    _applyResultsState();
}

function setSummaryBadge(status) {
    const badge = document.getElementById('summaryStatusBadge');
    if (!badge) return;
    if (!status) { badge.className = ''; badge.textContent = ''; return; }
    badge.className = `history-status ${status}`;
    const labels = { paused: 'Paused' };
    badge.textContent = labels[status] || (status.charAt(0).toUpperCase() + status.slice(1));
    const killBtn = document.getElementById('summaryCancelBtn');
    if (killBtn) {
        const isActive = status === 'running' || status === 'queued' || status === 'paused';
        killBtn.style.display = isActive ? '' : 'none';
        killBtn.disabled = false;
        killBtn.textContent = 'Cancel Scan';
    }
}

const scanBtn = document.getElementById('scanBtn');
const cancelBtn = document.getElementById('cancelBtn');
const progressSection = document.getElementById('progress-section');
const progressLabel = document.getElementById('progressLabel');
const progressPanels = document.getElementById('progressPanels');
const keywordProgressPanel = document.getElementById('keywordProgress');
const memberFilterDisplay = document.getElementById('memberFilterDisplay');
const pipelineStatsRow = document.getElementById('pipelineStats');
const sourceCirclesRow = document.getElementById('sourceCirclesRow');

let _liveResultsInterval = null;

scanBtn.addEventListener('click', startScan);
cancelBtn.addEventListener('click', cancelScan);
document.getElementById('summaryCancelBtn').addEventListener('click', cancelScan);

async function startScan() {
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;

    if (!startDate || !endDate) {
        alert('Please select a date range.');
        return;
    }

    // Use checked topics only
    const topicIds = Array.from(checkedTopicIds);

    // Expand groups into flat member arrays
    const allMemberIds = [
        ...selectedMembers.map(m => m.id),
        ...selectedGroups.flatMap(g => g.member_ids),
    ];
    const allMemberNames = [
        ...selectedMembers.map(m => m.name),
        ...selectedGroups.flatMap(g => g.member_names),
    ];

    if (topicIds.length === 0 && allMemberIds.length === 0) {
        alert('Please select at least one topic or a member to scan.');
        return;
    }

    const memberIds = allMemberIds;
    const memberNames = allMemberNames;

    // Collect enabled API sources
    const sources = Array.from(document.querySelectorAll('#source-toggles .ps-chip--active'))
        .map(btn => btn.dataset.source);
    if (sources.length === 0) {
        alert('Please select at least one API source.');
        return;
    }

    // Build topic-keyword mapping for progress display (before UI changes)
    const selectedTopics = state.topics.filter(t => topicIds.includes(t.id));
    state.scanTopicGroups = selectedTopics
        .map(t => ({ name: t.name, keywords: [...t.keywords] }))
        .filter(g => g.keywords.length > 0);

    scanBtn.disabled = true;
    cancelBtn.style.display = '';
    setSummaryBadge('running');
    const _dp = document.getElementById('summaryScanDate');
    if (_dp) { _dp.textContent = ''; _dp.style.display = 'none'; }
    progressLabel.textContent = 'Starting scan...';
    progressPanels.style.display = 'none';
    keywordProgressPanel.innerHTML = '';
    memberFilterDisplay.innerHTML = '';
    memberFilterDisplay.style.display = 'none';
    pipelineStatsRow.innerHTML = '';
    sourceCirclesRow.style.display = 'none';
    sourceCirclesRow.innerHTML = '';
    const _filterEntries = [
        ...(window.selectedGroups || []).map(g => ({ name: g.name, isGroup: true, count: (g.member_ids || []).length })),
        ...(window.selectedMembers || []).map(m => ({ name: m.name, meta: m.meta })),
    ];
    renderMemberFilterDisplay(_filterEntries);
    document.getElementById('auditSummary').innerHTML = '';
    document.getElementById('auditList').innerHTML = '<p class="empty-state-preview">Scanning...</p>';

    // Reset stage indicator
    resetStageIndicator();

    // Make sure progress content is expanded
    const content = document.getElementById('progressContent');
    content.classList.remove('collapsed');

    try {
        const res = await API.post('/api/scans', {
            start_date: startDate,
            end_date: endDate,
            topic_ids: topicIds,
            sources: sources,
            target_member_ids: memberIds,
            target_member_names: memberNames,
        });

        state.currentScanId = res.scan_id;
        connectSSE(res.scan_id);
    } catch (err) {
        progressLabel.textContent = friendlyError(err.message);
        resetScanUI();
    }
}

function connectSSE(scanId) {
    if (state.eventSource) {
        state.eventSource.close();
    }

    const es = new EventSource(`/api/scans/${scanId}/progress`);
    state.eventSource = es;

    // Show results section and start live-polling for results
    document.getElementById('results-section').style.display = '';
    _startLiveResults(scanId);
    loadHistory();

    es.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.error) {
            es.close();
            _stopLiveResults();
            progressLabel.textContent = friendlyError(data.error);
            resetScanUI();
            return;
        }

        if (data.status === 'queued') {
            progressLabel.textContent = 'Queued — waiting for another scan to complete...';
            setSummaryBadge('queued');
            return;
        }

        // Try to parse current_phase as JSON (detailed stats)
        let phaseText = data.current_phase || `${data.status}... ${Math.round(data.progress)}%`;
        let statsObj = null;
        try {
            statsObj = JSON.parse(data.current_phase);
            phaseText = statsObj.phase || phaseText;
        } catch (e) {
            // Not JSON — use as plain text (backward compat)
        }

        progressLabel.textContent = phaseText;

        // Update badge to reflect paused/running state
        if (data.status === 'running') {
            setSummaryBadge(statsObj && statsObj.api_paused ? 'paused' : 'running');
        }

        // Update stage indicator and progress panels
        if (statsObj) {
            updateStageIndicator(statsObj);
            progressPanels.style.display = '';
            renderKeywordChips(statsObj);
            renderPipelineBoxes(statsObj);
            renderSourceCircles(statsObj);
        }

        if (data.status === 'completed') {
            setSummaryBadge('completed');
            es.close();
            state.eventSource = null;
            _stopLiveResults();
            onScanComplete(scanId, data, statsObj);
        } else if (data.status === 'cancelled') {
            setSummaryBadge('cancelled');
            es.close();
            state.eventSource = null;
            _stopLiveResults();
            progressLabel.textContent = 'Scan cancelled.';
            document.querySelectorAll('.kw-chip:not(.kw-done)').forEach(el => {
                el.classList.remove('kw-active');
                el.classList.add('kw-cancelled');
            });
            resetScanUI();
            loadResults(scanId);  // show whatever results were saved
            loadHistory();
        } else if (data.status === 'error') {
            setSummaryBadge('error');
            es.close();
            state.eventSource = null;
            _stopLiveResults();
            progressLabel.textContent = 'Scan failed: ' + friendlyError(data.error_message);
            resetScanUI();
            loadHistory();
        }
    };

    es.onerror = () => {
        es.close();
        state.eventSource = null;
        _stopLiveResults();
        progressLabel.textContent = 'Connection lost. Check scan history for results.';
        resetScanUI();
    };
}

function _startLiveResults(scanId) {
    _stopLiveResults();
    _liveResultsInterval = setInterval(() => {
        loadResults(scanId);
        loadAudit(scanId);
        loadHistory();
    }, 5000);
}

function _stopLiveResults() {
    if (_liveResultsInterval) {
        clearInterval(_liveResultsInterval);
        _liveResultsInterval = null;
    }
}

async function cancelScan() {
    if (!state.currentScanId) return;
    const killBtn = document.getElementById('summaryCancelBtn');
    if (killBtn) { killBtn.disabled = true; killBtn.textContent = 'Cancelling…'; }
    try {
        await API.post(`/api/scans/${state.currentScanId}/cancel`);
        progressLabel.textContent = 'Cancelling...';
        setSummaryBadge('cancelled');
        loadHistory();
    } catch (err) {
        console.error('Cancel failed:', err);
        if (killBtn) { killBtn.disabled = false; killBtn.textContent = 'Cancel Scan'; }
    }
}

async function onScanComplete(scanId, data, statsObj) {
    progressLabel.textContent = 'Scan complete!';

    // Mark all stages complete
    setStageCompleted(3);

    // Show final progress panels
    if (statsObj) {
        progressPanels.style.display = '';
        renderKeywordChips(statsObj);
        renderPipelineBoxes(statsObj);
        renderSourceCircles(statsObj);
    }

    resetScanUI();
    await loadResults(scanId);
    await loadAudit(scanId);
    await loadHistory();
}

/* ---- Stage Indicator ---- */

function resetStageIndicator() {
    document.querySelectorAll('.stage').forEach(s => {
        s.classList.remove('active', 'completed');
    });
    document.querySelectorAll('.stage-line').forEach(l => {
        l.classList.remove('completed');
    });
    // Start with stage 1 active
    const stage1 = document.querySelector('.stage[data-stage="1"]');
    if (stage1) stage1.classList.add('active');
}

function updateStageIndicator(stats) {
    const phase = (stats.phase || '').toLowerCase();

    if (phase.includes('storing') || phase.includes('scan complete')) {
        document.querySelectorAll('.stage').forEach(s => s.classList.remove('paused'));
        setStageCompleted(2);
        setStageActive(3);
    } else if (stats.api_paused) {
        // API paused — stay on classification stage with paused visual
        setStageCompleted(1);
        setStageActive(2);
        const stage2 = document.querySelector('.stage[data-stage="2"]');
        if (stage2) stage2.classList.add('paused');
    } else if (phase.includes('classifying') || phase.includes('classification') || phase.includes('retrying')) {
        document.querySelectorAll('.stage').forEach(s => s.classList.remove('paused'));
        setStageCompleted(1);
        setStageActive(2);
    } else {
        document.querySelectorAll('.stage').forEach(s => s.classList.remove('paused'));
        setStageActive(1);
    }
}

function setStageActive(stageNum) {
    const stages = document.querySelectorAll('.stage');
    stages.forEach(s => {
        const n = parseInt(s.dataset.stage);
        if (n === stageNum) {
            s.classList.add('active');
            s.classList.remove('completed');
        } else if (n > stageNum) {
            s.classList.remove('active', 'completed');
        }
    });
}

function setStageCompleted(upToStage) {
    const stages = document.querySelectorAll('.stage');
    const lines = document.querySelectorAll('.stage-line');

    stages.forEach(s => {
        const n = parseInt(s.dataset.stage);
        if (n <= upToStage) {
            s.classList.add('completed');
            s.classList.remove('active');
        }
    });

    // Lines between stages
    lines.forEach((line, i) => {
        if (i + 1 < upToStage) {
            line.classList.add('completed');
        }
    });
}

/* ---- Keyword Chips (full width panel) ---- */

function renderKeywordChips(stats, scanStatus) {
    if (!state.scanTopicGroups || !keywordProgressPanel) return;

    const kwStatus = stats.kw_status || {};
    const kwCounts = stats.kw_counts || {};
    const totalKw = stats.total_keywords || 0;
    const completedKw = stats.completed_keywords || 0;

    let html = ``;

    for (const group of state.scanTopicGroups) {
        const allDone = group.keywords.length > 0 && group.keywords.every(kw => (kwStatus[kw] || 'pending') === 'done');
        const tick = allDone ? '<span class="kw-topic-tick" aria-label="Complete">&#10003;</span>' : '';
        html += '<div class="kw-topic-group">';
        html += `<div class="kw-topic-header">${escapeHtml(group.name)}${tick}</div>`;
        html += '<div class="kw-chip-list">';

        for (const kw of group.keywords) {
            const status = kwStatus[kw] || 'pending';
            let chipClass = 'kw-chip';
            let countBadge = '';

            if (status === 'done') {
                chipClass += ' kw-done';
                const count = kwCounts[kw] || 0;
                countBadge = `<span class="kw-count">${count}</span>`;
            } else if (status === 'active') {
                chipClass += ' kw-active';
                const count = kwCounts[kw] || 0;
                if (count > 0) {
                    countBadge = `<span class="kw-count">${count}</span>`;
                }
            } else if (scanStatus === 'cancelled') {
                chipClass += ' kw-cancelled';
            }

            html += `<span class="${chipClass}">${escapeHtml(kw)}${countBadge}</span>`;
        }

        html += '</div></div>';
    }

    keywordProgressPanel.innerHTML = html;
}

/* ---- Member / Group Filter Display (summary section) ---- */

// entries: array of {name, isGroup?, count?} — or null to hide
window.renderMemberFilterDisplay = function renderMemberFilterDisplay(entries) {
    if (!memberFilterDisplay) return;
    if (!entries || entries.length === 0) {
        memberFilterDisplay.style.display = 'none';
        memberFilterDisplay.innerHTML = '';
        return;
    }
    const pillsHtml = entries.map(e => e.isGroup
        ? `<span class="member-selected-pill member-selected-pill--group">
               <span class="member-selected-pill__badge">Group</span>
               <span class="member-selected-pill__name">${escapeHtml(e.name)}${e.count != null ? ` (${e.count} MPs)` : ''}</span>
           </span>`
        : `<span class="member-selected-pill">
               <span class="member-selected-pill__name">${escapeHtml(e.name)}</span>
               ${e.meta ? `<span class="member-selected-pill__meta">${escapeHtml(e.meta)}</span>` : ''}
           </span>`
    ).join('');
    memberFilterDisplay.innerHTML = `<div class="member-filter-display__label">MEMBER(S) SELECTED:</div><div class="member-filter-display__pills">${pillsHtml}</div>`;
    memberFilterDisplay.style.display = '';
};

/* ---- Pipeline Stat Boxes (horizontal row) ---- */

function buildDiscardTooltip(stats) {
    const cats = stats.discard_category_counts || {};
    const LABELS = { procedural: 'Procedural', no_position: 'No Position', off_topic: 'Off-Topic', generic: 'Generic' };
    const COLORS = { procedural: '#d97706', no_position: '#3b82f6', off_topic: '#ef4444', generic: '#8b5cf6' };
    const rows = [];
    for (const [key, label] of Object.entries(LABELS)) {
        if (cats[key]) {
            rows.push(`<span class="pipe-tooltip-row"><span class="pipe-tooltip-num" style="color:${COLORS[key]}">${cats[key]}</span> ${label}</span>`);
        }
    }
    if (rows.length === 0) return '';
    return `<div class="pipe-box-tooltip pipe-box-tooltip--right">${rows.join('')}</div>`;
}

function renderPipelineBoxes(stats) {
    if (!pipelineStatsRow) return;

    const totalApiResults = stats.total_api_results || 0;
    const sentToClassifier = stats.sent_to_classifier || 0;

    // Member-only scan: no LLM classification, just show fetched count
    if (sentToClassifier === 0 && totalApiResults > 0) {
        pipelineStatsRow.innerHTML = `<div class="pipe-box pipe-box-relevant" data-scroll-target="results-section" style="cursor:pointer;">
            <div class="pipe-box-value">${totalApiResults}</div>
            <div class="pipe-box-label">Items Fetched</div>
        </div>`;
        pipelineStatsRow.querySelectorAll('[data-scroll-target]').forEach(el => {
            el.addEventListener('click', () => {
                const target = document.getElementById(el.dataset.scrollTarget);
                if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        });
        return;
    }

    const totalClassified = (stats.classified_relevant || 0) + (stats.classified_discarded || 0);

    const uniqueAfterDedup = stats.unique_after_dedup || 0;
    const removedByDedup = Math.max(0, totalApiResults - uniqueAfterDedup);
    const removedByPrefilter = stats.removed_by_prefilter || 0;
    const removedByKeywordFilter = stats.removed_by_keyword_filter || 0;

    const apiErrors = stats.classifier_api_errors || 0;

    const kwTooltipRows = [
        removedByDedup > 0           ? `<span class="pipe-tooltip-row"><span class="pipe-tooltip-num">${removedByDedup}</span> Duplicate${removedByDedup !== 1 ? 's' : ''} removed</span>` : '',
        removedByPrefilter > 0       ? `<span class="pipe-tooltip-row"><span class="pipe-tooltip-num">${removedByPrefilter}</span> Procedural statement${removedByPrefilter !== 1 ? 's' : ''} removed</span>` : '',
        removedByKeywordFilter > 0   ? `<span class="pipe-tooltip-row"><span class="pipe-tooltip-num">${removedByKeywordFilter}</span> No keyword match</span>` : '',
        sentToClassifier > 0         ? `<span class="pipe-tooltip-row pipe-tooltip-row--sent"><span class="pipe-tooltip-num">${sentToClassifier}</span> Passed to classifier</span>` : '',
    ].filter(Boolean).join('');

    // Left-aligned tooltip for keyword results (first box) to prevent left-edge clipping
    const kwTooltip = kwTooltipRows
        ? `<div class="pipe-box-tooltip pipe-box-tooltip--left">${kwTooltipRows}</div>`
        : '';

    // Classified box: incorporate API error info when errors exist
    let classifiedCls = '';
    let classifiedTooltip = '';
    let classifiedBadge = '';
    if (apiErrors > 0) {
        const errorReason = stats.api_error_reason || 'API error';
        const isPaused = stats.api_paused;
        const retryRow = isPaused
            ? `<span class="pipe-tooltip-row pipe-tooltip-row--sent"><span class="pipe-tooltip-num">${apiErrors}</span> item${apiErrors !== 1 ? 's' : ''} queued for retry</span>`
            : `<span class="pipe-tooltip-row pipe-tooltip-row--sent"><span class="pipe-tooltip-num">${apiErrors}</span> item${apiErrors !== 1 ? 's' : ''} retried</span>`;
        classifiedCls = 'pipe-box-has-tooltip';
        classifiedBadge = isPaused ? `<span class="pipe-box-badge" title="Classifier API errors">!</span>` : '';
        classifiedTooltip = `<div class="pipe-box-tooltip">
            <span class="pipe-tooltip-row pipe-tooltip-row--reason">${escapeHtml(errorReason)}</span>
            ${retryRow}
            <span class="pipe-tooltip-row">${isPaused ? 'Retrying automatically...' : 'Retried after reconnect'}</span>
        </div>`;
    }

    const boxes = [
        { label: 'Keyword Results', value: totalApiResults, cls: 'pipe-box-has-tooltip', tooltip: kwTooltip },
        { label: 'Classified', value: `${totalClassified}/${sentToClassifier}`, cls: classifiedCls, tooltip: classifiedTooltip, badge: classifiedBadge },
        { label: 'Relevant', value: stats.classified_relevant || 0, cls: 'pipe-box-relevant', target: 'results-section' },
        { label: 'Discarded', value: stats.classified_discarded || 0, cls: `pipe-box-discarded${buildDiscardTooltip(stats) ? ' pipe-box-has-tooltip' : ''}`, target: 'results-section', resultsTab: 'audit', tooltip: buildDiscardTooltip(stats) },
    ];

    let html = '';
    for (const box of boxes) {
        const clickable = box.target
            ? `data-scroll-target="${box.target}"${box.resultsTab ? ` data-results-tab="${box.resultsTab}"` : ''} style="cursor:pointer;"`
            : '';
        html += `<div class="pipe-box ${box.cls}" ${clickable}>
            ${box.badge || ''}
            <div class="pipe-box-value">${box.value}</div>
            <div class="pipe-box-label">${box.label}</div>
            ${box.tooltip || ''}
        </div>`;
    }

    // Remove any legacy warning banner or error box
    const existing = pipelineStatsRow.parentElement.querySelector('.api-error-warning');
    if (existing) existing.remove();

    pipelineStatsRow.innerHTML = html;

    pipelineStatsRow.querySelectorAll('[data-scroll-target]').forEach(el => {
        el.addEventListener('click', () => {
            if (el.dataset.resultsTab) switchResultsTab(el.dataset.resultsTab);
            else expandSection(el.dataset.scrollTarget);
            const target = document.getElementById(el.dataset.scrollTarget);
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });
}

/* ---- Source Circles (below both columns) ---- */

function renderSourceCircles(stats) {
    if (!sourceCirclesRow) return;

    const perSourceRelevant = stats.per_source_relevant || {};
    const sourceLabels = {
        'hansard': 'Hansard', 'written_questions': 'Written Qs',
        'written_statements': 'Written Stmts', 'edms': 'EDMs',
        'bills': 'Bills', 'divisions': 'Divisions',
    };
    const sourceBadgeClass = {
        'hansard': 'source-badge--hansard', 'written_questions': 'source-badge--written-qs',
        'written_statements': 'source-badge--written-stmts', 'edms': 'source-badge--edms',
        'bills': 'source-badge--bills', 'divisions': 'source-badge--divisions',
    };
    const keyToType = {
        'hansard': 'hansard', 'written_questions': 'written_question',
        'written_statements': 'written_statement', 'edms': 'edm',
        'bills': 'bill', 'divisions': 'division',
    };

    const enabledSources = Array.from(document.querySelectorAll('#source-toggles .ps-chip--active'))
        .map(btn => btn.dataset.source);

    if (enabledSources.length === 0) {
        sourceCirclesRow.style.display = 'none';
        return;
    }

    // Only show once classification has started producing results
    const hasRelevant = Object.values(perSourceRelevant).some(v => v > 0);
    if (!hasRelevant) {
        sourceCirclesRow.style.display = 'none';
        return;
    }

    let html = '';
    for (const srcKey of enabledSources) {
        const srcType = keyToType[srcKey] || srcKey;
        const count = perSourceRelevant[srcType] || 0;
        if (count === 0) continue;
        const label = sourceLabels[srcKey] || srcKey;
        const badgeCls = sourceBadgeClass[srcKey] || '';
        html += `<div class="audit-count">
            <span class="count-badge ${badgeCls}">${count}</span>
            <span>${label}</span>
        </div>`;
    }

    sourceCirclesRow.innerHTML = html;
    sourceCirclesRow.style.display = '';
}

function friendlyError(msg) {
    if (!msg) return 'Unknown error. Please try again.';
    const lower = msg.toLowerCase();
    if (lower.includes('no topics or member')) return 'Please select at least one topic or a member to scan.';
    if (lower.includes('no topics selected')) return 'No topics selected. Please check at least one topic.';
    if (lower.includes('rate limit') || lower.includes('429')) return 'API rate limit reached. Try again in a few minutes or reduce the date range.';
    if (lower.includes('timeout') || lower.includes('timed out')) return 'Request timed out. The Parliament API may be slow — try a shorter date range.';
    if (lower.includes('connection') || lower.includes('connect')) return 'Could not connect to the Parliament API. Check your internet connection.';
    if (lower.includes('authentication') || lower.includes('api key') || lower.includes('401')) return 'AI classifier authentication failed. Check your API key in .env.';
    if (lower.includes('insufficient') || lower.includes('credit') || lower.includes('balance')) return 'Anthropic API credits exhausted. Add credits at console.anthropic.com.';
    if (lower.includes('500') || lower.includes('internal server')) return 'Parliament API returned a server error. Try again shortly.';
    return msg;
}

function resetScanUI() {
    scanBtn.disabled = false;
    cancelBtn.style.display = 'none';
    _stopLiveResults();
}

/* ---- Scan Size Warning ---- */

// Relative classifier load per source, derived from observed audit log proportions
// (written_questions ~69%, hansard ~23%, written_statements ~5%, edms ~3%, bills/divisions ~0%)
const SOURCE_CLASSIFIER_WEIGHTS = {
    written_questions:  0.69,
    hansard:            0.23,
    written_statements: 0.05,
    edms:               0.03,
    bills:              0.00,
    divisions:          0.00,
};

window.updateScanWarning = function updateScanWarning() {
    const warning = document.getElementById('scanWarning');
    if (!warning) return;

    const startVal = document.getElementById('startDate').value;
    const endVal = document.getElementById('endDate').value;

    const selectedTopics = state.topics.filter(t => checkedTopicIds.has(t.id));
    const totalKeywords = selectedTopics.reduce((sum, t) => sum + t.keywords.length, 0);

    // Member-only scan (Case 2) has no LLM; no topics or dates → nothing to warn about
    if (totalKeywords === 0 || !startVal || !endVal) {
        warning.style.display = 'none';
        const card = warning.closest('section.control-group-card');
        if (card) card.classList.remove('scan-card--amber', 'scan-card--red');
        return;
    }

    const days = Math.round((new Date(endVal) - new Date(startVal)) / 86400000) + 1;

    // Scale estimate by which sources are active — written questions alone drives ~69% of
    // classifier calls, so deselecting it should substantially reduce the warning score.
    const activeSources = Array.from(document.querySelectorAll('#source-toggles .ps-chip--active'))
        .map(btn => btn.dataset.source);
    const sourceMultiplier = activeSources.reduce(
        (sum, src) => sum + (SOURCE_CLASSIFIER_WEIGHTS[src] ?? 0), 0
    );

    // Each member adds 0.05 to the multiplier (1 member → ×0.05, 20 members → ×1.0, etc.)
    // Falls back to 1.0 when no members selected (keyword-only scan).
    const memberCount = (window.selectedMembers || []).length
        + (window.selectedGroups || []).reduce((sum, g) => sum + (g.member_ids?.length || 1), 0);
    const memberMultiplier = memberCount > 0 ? memberCount * 0.05 : 1;

    const estimated = totalKeywords * days * Math.max(sourceMultiplier, 0.01) * memberMultiplier;

    const card = warning.closest('section.control-group-card');

    if (estimated > 1000) {
        warning.className = 'scan-warning scan-warning--red';
        warning.textContent = 'Very large scan likely to deplete API credits. Consider fewer keywords or shorter date range.';
        warning.style.display = '';
        if (card) { card.classList.remove('scan-card--amber'); card.classList.add('scan-card--red'); }
    } else if (estimated > 500) {
        warning.className = 'scan-warning scan-warning--amber';
        warning.textContent = 'Large scan likely to consume significant API credits. Consider fewer keywords or shorter date range.';
        warning.style.display = '';
        if (card) { card.classList.remove('scan-card--red'); card.classList.add('scan-card--amber'); }
    } else {
        warning.className = 'scan-warning';
        warning.style.display = 'none';
        if (card) { card.classList.remove('scan-card--amber', 'scan-card--red'); }
    }
};

document.getElementById('startDate').addEventListener('change', window.updateScanWarning);
document.getElementById('endDate').addEventListener('change', window.updateScanWarning);
// Source chip toggles
document.querySelectorAll('#source-toggles .ps-chip').forEach(btn => {
    btn.addEventListener('click', () => {
        btn.classList.toggle('ps-chip--active');
        window.updateScanWarning();
    });
});

function toggleAllSourceChips() {
    const chips = document.querySelectorAll('#source-toggles .ps-chip');
    const allActive = Array.from(chips).every(c => c.classList.contains('ps-chip--active'));
    chips.forEach(c => c.classList.toggle('ps-chip--active', !allActive));
    window.updateScanWarning();
}

// ---- Topic Add Expander ----

(function() {
    const expander = document.getElementById('topicAddExpander');
    const input = document.getElementById('newTopicName');

    if (!expander || !input) return;

    function expand() {
        expander.classList.add('expanded');
        input.focus();
    }

    function collapse() {
        expander.classList.remove('expanded');
        input.value = '';
    }

    expander.addEventListener('click', (e) => {
        if (!expander.classList.contains('expanded')) expand();
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); collapse(); }
        if (e.key === 'Enter') setTimeout(collapse, 80);
    });

    document.addEventListener('click', (e) => {
        if (expander.classList.contains('expanded') && !expander.contains(e.target)) {
            collapse();
        }
    });
})();

// ---- Member Autocomplete (multi-select) ----

window.selectedMembers = []; // [{id, name, meta}, ...]
window.selectedGroups = [];  // [{id, name, member_ids, member_names}, ...]

(function initMemberAutocomplete() {
    const input = document.getElementById('memberSearchInput');
    const dropdown = document.getElementById('memberDropdown');
    const pillsContainer = document.getElementById('memberSelectedPills');

    if (!input) return;

    let debounceTimer = null;

    function renderPills() {
        if (!pillsContainer) return;
        const memberHtml = selectedMembers.map(m => `
            <span class="member-selected-pill" data-id="${escapeHtml(m.id)}">
                <span class="member-selected-pill__name">${escapeHtml(m.name)}</span>
                <button class="member-selected-pill__clear" data-id="${escapeHtml(m.id)}" title="Remove" data-kind="member">&#x2715;</button>
            </span>
        `).join('');

        const groupHtml = selectedGroups.map(g => `
            <span class="member-selected-pill member-selected-pill--group" data-id="${escapeHtml(String(g.id))}">
                <span class="member-selected-pill__name">${escapeHtml(g.name)}</span>
                <button class="member-selected-pill__clear" data-id="${escapeHtml(String(g.id))}" title="Remove" data-kind="group">&#x2715;</button>
            </span>
        `).join('');

        pillsContainer.innerHTML = groupHtml + memberHtml;

        pillsContainer.querySelectorAll('.member-selected-pill__clear').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.dataset.kind === 'group') {
                    removeGroup(btn.dataset.id);
                } else {
                    removeMember(btn.dataset.id);
                }
            });
        });
        window.updateScanWarning?.();
    }

    function addMember(id, name, meta) {
        if (selectedMembers.some(m => m.id === id)) return; // no duplicates
        selectedMembers.push({ id, name, meta });
        renderPills();
        input.value = '';
        dropdown.style.display = 'none';
        input.focus();
    }

    function removeMember(id) {
        selectedMembers = selectedMembers.filter(m => m.id !== id);
        renderPills();
        input.focus();
    }

    function addGroup(group) {
        if (selectedGroups.some(g => g.id === group.id)) return;
        selectedGroups.push(group);
        renderPills();
        input.value = '';
        dropdown.style.display = 'none';
        input.focus();
    }

    function removeGroup(id) {
        selectedGroups = selectedGroups.filter(g => String(g.id) !== String(id));
        renderPills();
        input.focus();
    }

    // Expose addGroup for groups.js "Scan" button
    window.addGroupToScanner = addGroup;

    const PARTY_ABBR = {
        'Conservative': 'Con', 'Labour': 'Lab', 'Liberal Democrats': 'Lib Dem',
        'Scottish National Party': 'SNP', 'Green Party': 'Green', 'Reform UK': 'Reform',
        'Independent': 'Ind', 'Plaid Cymru': 'PC', 'Democratic Unionist Party': 'DUP',
        'Sinn Féin': 'SF', 'Social Democratic & Labour Party': 'SDLP',
        'Alliance': 'Alliance', 'Ulster Unionist Party': 'UUP',
        'Alba Party': 'Alba', 'Traditional Unionist Voice': 'TUV',
        'Workers Party of Britain': 'WPB',
    };

    function formatMemberLabel(m) {
        const party = PARTY_ABBR[m.party] || m.party || '';
        const type = m.member_type || '';
        const suffix = [party, type].filter(Boolean).join(' ');
        return suffix ? `${m.name} — ${suffix}` : m.name;
    }

    function renderDropdown(matchingGroups, members) {
        const hasGroups = matchingGroups && matchingGroups.length > 0;
        const hasMembers = members && members.length > 0;

        if (!hasGroups && !hasMembers) {
            dropdown.innerHTML = `<div class="member-autocomplete__empty">No results found</div>`;
            dropdown.style.display = '';
            return;
        }

        const alreadySelectedMembers = new Set(selectedMembers.map(m => m.id));
        const alreadySelectedGroups = new Set(selectedGroups.map(g => String(g.id)));

        let html = '';

        // Groups first, with distinct styling
        if (hasGroups) {
            for (const g of matchingGroups) {
                const dimmed = alreadySelectedGroups.has(String(g.id)) ? ' style="opacity:0.45;"' : '';
                const count = (g.member_ids || []).length;
                html += `<div class="member-autocomplete__item member-autocomplete__item--group"
                    data-group-id="${escapeHtml(String(g.id))}"
                    data-group-name="${escapeHtml(g.name)}"${dimmed}>
                    <span class="member-autocomplete__item-name">${escapeHtml(g.name)}</span>
                    <span class="member-autocomplete__item-meta">${count} member${count === 1 ? '' : 's'}</span>
                </div>`;
            }
            if (hasMembers) {
                html += `<div class="member-autocomplete__divider"></div>`;
            }
        }

        // Members below
        if (hasMembers) {
            for (const m of members) {
                const meta = [m.party, m.member_type].filter(Boolean).join(' · ');
                const dimmed = alreadySelectedMembers.has(String(m.id)) ? ' style="opacity:0.45;"' : '';
                html += `<div class="member-autocomplete__item" data-id="${escapeHtml(String(m.id))}" data-name="${escapeHtml(m.name)}" data-meta="${escapeHtml(meta)}"${dimmed}>
                    <span class="member-autocomplete__item-name">${escapeHtml(m.name)}</span>
                    ${meta ? `<span class="member-autocomplete__item-meta">${escapeHtml(meta)}</span>` : ''}
                </div>`;
            }
        }

        dropdown.innerHTML = html;
        dropdown.style.display = '';

        // Group click handlers
        dropdown.querySelectorAll('.member-autocomplete__item--group').forEach(item => {
            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                const group = state.groups.find(g => String(g.id) === item.dataset.groupId);
                if (group) addGroup(group);
            });
        });

        // Member click handlers
        dropdown.querySelectorAll('.member-autocomplete__item:not(.member-autocomplete__item--group)').forEach(item => {
            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                addMember(item.dataset.id, item.dataset.name, item.dataset.meta);
            });
        });
    }

    async function doSearch(q) {
        try {
            const qLower = q.toLowerCase();
            const matchingGroups = (state.groups || []).filter(g =>
                g.name.toLowerCase().includes(qLower)
            );
            const url = `/api/scans/members/search?q=${encodeURIComponent(q)}`;
            const members = await API.get(url);
            renderDropdown(matchingGroups, members);
        } catch (e) {
            dropdown.style.display = 'none';
        }
    }

    input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const q = input.value.trim();
        if (q.length < 2) {
            dropdown.style.display = 'none';
            return;
        }
        debounceTimer = setTimeout(() => doSearch(q), 300);
    });

    input.addEventListener('focus', () => {
        // Re-show dropdown if there's a query already typed
        const q = input.value.trim();
        if (q.length >= 2 && dropdown.innerHTML && dropdown.innerHTML.trim()) {
            dropdown.style.display = '';
        }
    });

    document.addEventListener('click', (e) => {
        const wrap = document.getElementById('memberAutocomplete');
        if (wrap && !wrap.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });
})();
