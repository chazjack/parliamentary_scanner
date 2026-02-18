/* Parliamentary Scanner — Scan control and SSE progress */

const scanBtn = document.getElementById('scanBtn');
const cancelBtn = document.getElementById('cancelBtn');
const progressSection = document.getElementById('progress-section');
const progressLabel = document.getElementById('progressLabel');
const progressPanels = document.getElementById('progressPanels');
const keywordProgressPanel = document.getElementById('keywordProgress');
const pipelineStatsRow = document.getElementById('pipelineStats');
const sourceCirclesRow = document.getElementById('sourceCirclesRow');

let _liveResultsInterval = null;

scanBtn.addEventListener('click', startScan);
cancelBtn.addEventListener('click', cancelScan);

async function startScan() {
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;

    if (!startDate || !endDate) {
        alert('Please select a date range.');
        return;
    }

    // Use checked topics only
    const topicIds = Array.from(document.querySelectorAll('.topic-checkbox:checked'))
        .map(cb => parseInt(cb.value));
    if (topicIds.length === 0) {
        alert('Please select at least one topic to scan.');
        return;
    }

    // Collect enabled API sources
    const sources = Array.from(document.querySelectorAll('.source-btn.active'))
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
    progressSection.style.display = '';
    progressLabel.textContent = 'Starting scan...';
    progressPanels.style.display = 'none';
    keywordProgressPanel.innerHTML = '';
    pipelineStatsRow.innerHTML = '';
    sourceCirclesRow.style.display = 'none';
    sourceCirclesRow.innerHTML = '';
    document.getElementById('audit-section').style.display = 'none';

    // Reset stage indicator
    resetStageIndicator();

    // Make sure progress content is expanded
    const content = document.getElementById('progressContent');
    const minBtn = document.getElementById('minimizeBtn');
    content.classList.remove('collapsed');
    minBtn.classList.remove('collapsed');
    minBtn.style.display = 'none';

    // Collapse topics to keep progress visible
    const topicList = document.getElementById('topicList');
    const toggleIcon = document.querySelector('.toggle-icon');
    if (!topicList.classList.contains('collapsed')) {
        topicList.classList.add('collapsed');
        toggleIcon.classList.add('collapsed');
    }
    // Render pills since we just collapsed
    if (typeof renderTopicPills === 'function') renderTopicPills();

    try {
        const res = await API.post('/api/scans', {
            start_date: startDate,
            end_date: endDate,
            topic_ids: topicIds,
            sources: sources,
        });

        state.currentScanId = res.scan_id;
        connectSSE(res.scan_id);
    } catch (err) {
        progressSection.style.display = '';
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

    es.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.error) {
            es.close();
            _stopLiveResults();
            progressLabel.textContent = friendlyError(data.error);
            resetScanUI();
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

        // Update stage indicator and progress panels
        if (statsObj) {
            updateStageIndicator(statsObj);
            progressPanels.style.display = '';
            renderKeywordChips(statsObj);
            renderPipelineBoxes(statsObj);
            renderSourceCircles(statsObj);
        }

        if (data.status === 'completed') {
            es.close();
            state.eventSource = null;
            _stopLiveResults();
            onScanComplete(scanId, data, statsObj);
        } else if (data.status === 'cancelled') {
            es.close();
            state.eventSource = null;
            _stopLiveResults();
            progressLabel.textContent = 'Scan cancelled.';
            resetScanUI();
            loadResults(scanId);  // show whatever results were saved
            loadHistory();
        } else if (data.status === 'error') {
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
    try {
        await API.post(`/api/scans/${state.currentScanId}/cancel`);
        progressLabel.textContent = 'Cancelling...';
    } catch (err) {
        console.error('Cancel failed:', err);
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

    // Show minimize button (keep progress visible)
    document.getElementById('minimizeBtn').style.display = '';

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
        setStageCompleted(2);
        setStageActive(3);
    } else if (phase.includes('classifying') || phase.includes('classification')) {
        setStageCompleted(1);
        setStageActive(2);
    } else {
        // Keyword search phase (searching, dedup, pre-filter)
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

/* ---- Minimize toggle ---- */

function toggleProgressContent() {
    const content = document.getElementById('progressContent');
    const btn = document.getElementById('minimizeBtn');
    content.classList.toggle('collapsed');
    btn.classList.toggle('collapsed');
}

/* ---- Keyword Chips (full width panel) ---- */

function renderKeywordChips(stats) {
    if (!state.scanTopicGroups || !keywordProgressPanel) return;

    const kwStatus = stats.kw_status || {};
    const kwCounts = stats.kw_counts || {};
    const totalKw = stats.total_keywords || 0;
    const completedKw = stats.completed_keywords || 0;

    let html = `<div class="kw-summary">Keywords: ${completedKw} / ${totalKw}</div>`;

    for (const group of state.scanTopicGroups) {
        html += '<div class="kw-topic-group">';
        html += `<div class="kw-topic-header">${escapeHtml(group.name)}</div>`;
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
            }

            html += `<span class="${chipClass}">${escapeHtml(kw)}${countBadge}</span>`;
        }

        html += '</div></div>';
    }

    keywordProgressPanel.innerHTML = html;
}

/* ---- Pipeline Stat Boxes (horizontal row) ---- */

function renderPipelineBoxes(stats) {
    if (!pipelineStatsRow) return;

    const boxes = [
        { label: 'Keyword Results', value: stats.total_api_results || 0, cls: '' },
        { label: 'Sent to Classifier', value: stats.sent_to_classifier || 0, cls: '' },
        { label: 'Relevant', value: stats.classified_relevant || 0, cls: 'pipe-box-relevant' },
        { label: 'Discarded', value: stats.classified_discarded || 0, cls: 'pipe-box-discarded' },
    ];

    let html = '';
    for (const box of boxes) {
        html += `<div class="pipe-box ${box.cls}">
            <div class="pipe-box-value">${box.value}</div>
            <div class="pipe-box-label">${box.label}</div>
        </div>`;
    }

    pipelineStatsRow.innerHTML = html;
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
    const sourceCircleClass = {
        'hansard': 'source-hansard', 'written_questions': 'source-written-qs',
        'written_statements': 'source-written-stmts', 'edms': 'source-edms',
        'bills': 'source-bills', 'divisions': 'source-divisions',
    };
    const keyToType = {
        'hansard': 'hansard', 'written_questions': 'written_question',
        'written_statements': 'written_statement', 'edms': 'edm',
        'bills': 'bill', 'divisions': 'division',
    };

    const enabledSources = Array.from(document.querySelectorAll('.source-btn.active'))
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
        const label = sourceLabels[srcKey] || srcKey;
        const circleCls = sourceCircleClass[srcKey] || '';
        html += `<div class="stat-circle ${circleCls}">
            <div class="stat-value">${count}</div>
            <div class="stat-label">${label}</div>
        </div>`;
    }

    sourceCirclesRow.innerHTML = html;
    sourceCirclesRow.style.display = '';
}

function friendlyError(msg) {
    if (!msg) return 'Unknown error. Please try again.';
    const lower = msg.toLowerCase();
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

// Source toggle buttons
document.querySelectorAll('.source-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        btn.classList.toggle('active');
    });
});
