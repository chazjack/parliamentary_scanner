/* Member Analysis — standalone timeline panel below the results section */

let _analysisMember  = null;
let _atlTooltipEl    = null;
let _atlHideTimer    = null;
let _inlineResultIds = new Set(); // IDs of dots currently shown in the inline graph
let _inlineScanId    = null;      // Scan ID currently shown in the inline graph

// ── Public API ────────────────────────────────────────────────────────────────

function openMemberProfile(memberName) {
    // If the inline analysis is already showing for this scan, just scroll to it
    const inlineWrap = document.getElementById('inlineAnalysisWrap');
    if (inlineWrap && inlineWrap.style.display !== 'none' && inlineWrap.innerHTML) {
        const rect = inlineWrap.getBoundingClientRect();
        window.scrollTo({ top: window.scrollY + rect.top - 120, behavior: 'smooth' });
        return;
    }

    _analysisMember = memberName;
    const section = document.getElementById('analysis-section');
    if (section) section.style.display = '';
    _renderAnalysis();
    if (section) setTimeout(() => section.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
}

function closeAnalysis() {
    _analysisMember = null;
    const section = document.getElementById('analysis-section');
    if (section) section.style.display = 'none';
    _atlHideTooltip();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns a key identifying the speech/debate a contribution belongs to.
 * For Hansard, strips the #contribution-xxx anchor from the URL, leaving the
 * debate-section URL as the key.  Returns null for non-groupable sources.
 */
function _speechKey(r) {
    if (r.source_type === 'hansard' && r.source_url) {
        return r.source_url.split('#')[0];
    }
    return null;
}

// ── Render ────────────────────────────────────────────────────────────────────

/** Popup analysis panel (no entrance animation — data is already loaded) */
function _renderAnalysis() {
    const nameEl  = document.getElementById('analysisMemberName');
    const content = document.getElementById('analysisContent');
    if (!content) return;

    if (nameEl) nameEl.textContent = _analysisMember || '';

    const allRes = (typeof allResults !== 'undefined') ? allResults : [];
    const raw    = allRes.filter(r => r.member_name === _analysisMember && r.activity_date);

    if (!raw.length) {
        content.innerHTML = '<p class="atl-empty">No contributions with dates found.</p>';
        return;
    }

    _renderAnalysisInto(content, raw, null); // null = no per-dot animation
}

/**
 * Core timeline renderer.
 * @param {HTMLElement} container  — target element to render into
 * @param {Array}       raw        — unprocessed result rows (with activity_date)
 * @param {Set|null}    prevIds    — Set of result IDs already rendered;
 *                                   new IDs get entrance animation.
 *                                   Pass null to skip animation entirely.
 */
function _renderAnalysisInto(container, raw, prevIds) {
    if (!raw || !raw.length) {
        container.innerHTML = '<p class="atl-empty">No contributions with dates found.</p>';
        return;
    }

    // Parse topics + apply scan filter
    const items = raw
        .map(r => {
            let topics = r.topics;
            try { topics = JSON.parse(topics); } catch (e) {}
            let topicNames = Array.isArray(topics) ? topics : [];
            if (typeof currentScanTopicNames !== 'undefined' && currentScanTopicNames && currentScanTopicNames.size > 0) {
                const lowerMap = new Map([...currentScanTopicNames].map(t => [t.toLowerCase(), t]));
                topicNames = topicNames.map(t => lowerMap.get(t.toLowerCase())).filter(Boolean);
            }
            return { ...r, _topics: topicNames };
        })
        .sort((a, b) => a.activity_date.localeCompare(b.activity_date));

    const minDate = new Date(items[0].activity_date);
    const maxDate = new Date(items[items.length - 1].activity_date);
    const spanMs  = Math.max(maxDate - minDate, 86400000);

    // Group by date to stack same-day dots
    const byDate = {};
    for (const item of items) {
        (byDate[item.activity_date] = byDate[item.activity_date] || []).push(item);
    }

    const maxStack = Math.max(...Object.values(byDate).map(g => g.length));
    const DOT = 10, GAP = 5, TOP_PAD = 10;
    const AXIS_Y = TOP_PAD + maxStack * (DOT + GAP);
    const trackH = AXIS_Y + 14;

    let dotsHtml = '', connectorsHtml = '';
    let newDotIndex = 0; // used to stagger entrance animations

    for (const [date, group] of Object.entries(byDate)) {
        const xPct = ((new Date(date) - minDate) / spanMs) * 100;

        // Sort so same-speech contributions are adjacent in the stack
        const keyFirstSeen = {};
        let seenOrder = 0;
        group.forEach(r => {
            const k = _speechKey(r);
            if (k && !(k in keyFirstSeen)) keyFirstSeen[k] = seenOrder++;
        });
        const sortedGroup = [...group].sort((a, b) => {
            const ka = _speechKey(a), kb = _speechKey(b);
            const oa = ka !== null ? keyFirstSeen[ka] : seenOrder + group.indexOf(a);
            const ob = kb !== null ? keyFirstSeen[kb] : seenOrder + group.indexOf(b);
            return oa - ob;
        });

        // Pre-compute animation state for each position — needed by both dots and connectors
        const posInfo = sortedGroup.map(r => {
            const isNew = prevIds !== null && !prevIds.has(r.id);
            const delayS = isNew ? newDotIndex * 0.3 : 0;
            if (isNew) newDotIndex++;
            return { isNew, delayS };
        });

        sortedGroup.forEach((r, i) => {
            const src     = (typeof SOURCE_COLOURS !== 'undefined') ? SOURCE_COLOURS[r.source_type] : null;
            const color   = src ? src.color : '#555';
            const top     = AXIS_Y - DOT - (DOT + GAP) * i;
            const quote   = escapeHtml((r.verbatim_quote || '').slice(0, 400));
            const summary = escapeHtml(r.summary || '');
            const srcLbl  = src ? src.label : (r.source_type || '').replace(/_/g, ' ');
            const srcBg   = src ? src.bg : 'rgba(80,80,80,0.15)';
            const dateStr = (typeof formatDate === 'function') ? formatDate(date) : date;
            const url     = r.source_url || '';

            const { isNew, delayS } = posInfo[i];
            const delayStyle = isNew ? `animation-delay:${delayS.toFixed(1)}s;` : '';

            dotsHtml += `<div class="atl-dot${isNew ? ' atl-dot--new' : ''}"
                style="left:calc(${xPct}% - ${DOT/2}px);top:${top}px;width:${DOT}px;height:${DOT}px;background:${color};box-shadow:0 0 0 2px ${color}33;${delayStyle}"
                data-result-id="${r.id || ''}"
                data-date="${escapeHtml(dateStr)}"
                data-src-label="${escapeHtml(srcLbl)}"
                data-src-color="${escapeHtml(color)}"
                data-src-bg="${escapeHtml(srcBg)}"
                data-summary="${summary}"
                data-quote="${quote}"
                data-url="${escapeHtml(url)}"
                data-topics="${escapeHtml(JSON.stringify(r._topics))}"></div>`;
        });

        // Connector lines for speech groups (2+ contributions from same speech).
        // Appear only after all new dots in the group have finished animating.
        const newDelays = posInfo.filter(p => p.isNew).map(p => p.delayS);
        const groupAnimEnd = newDelays.length > 0 ? Math.max(...newDelays) + 0.5 : 0;

        let runStart = 0;
        while (runStart < sortedGroup.length) {
            const key = _speechKey(sortedGroup[runStart]);
            if (!key) { runStart++; continue; }
            let runEnd = runStart;
            while (runEnd + 1 < sortedGroup.length && _speechKey(sortedGroup[runEnd + 1]) === key) runEnd++;
            if (runEnd > runStart) {
                const src        = (typeof SOURCE_COLOURS !== 'undefined') ? SOURCE_COLOURS[sortedGroup[runStart].source_type] : null;
                const color      = src ? src.color : '#888';
                const lineTop    = AXIS_Y - DOT / 2 - (DOT + GAP) * runEnd;
                const lineHeight = (DOT + GAP) * (runEnd - runStart);
                const connNew    = posInfo.slice(runStart, runEnd + 1).some(p => p.isNew);
                const connAnim   = connNew
                    ? `animation:atl-connector-in 0.4s ease-out ${groupAnimEnd.toFixed(1)}s both;`
                    : '';
                connectorsHtml += `<div class="atl-speech-connector"
                    style="left:calc(${xPct}% - 1px);top:${lineTop}px;height:${lineHeight}px;background:${color}70;${connAnim}"
                    title="${runEnd - runStart + 1} extracts from the same speech"></div>`;
            }
            runStart = runEnd + 1;
        }
    }

    // Axis labels — up to 6 evenly spaced
    const labelCount = Math.min(6, items.length);
    let labelsHtml = '';
    for (let i = 0; i <= labelCount; i++) {
        const frac  = i / labelCount;
        const d     = new Date(minDate.getTime() + frac * spanMs);
        const label = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
        const align = i === 0 ? 'left:0;transform:none;' : i === labelCount ? 'right:0;left:auto;transform:none;' : `left:${frac*100}%;transform:translateX(-50%);`;
        labelsHtml += `<span class="atl-axis-label" style="${align}">${label}</span>`;
    }

    const memberName = raw[0]?.member_name || '';

    container.innerHTML = `
        <div class="atl-header-row">
            ${memberName ? `<span class="analysis-member-chip">${escapeHtml(memberName)}</span>` : ''}
            <div class="atl-legend"></div>
        </div>
        <div class="atl-track-wrap" style="height:${trackH}px;">
            <div class="atl-axis-line" style="top:${AXIS_Y}px;"></div>
            ${connectorsHtml}
            ${dotsHtml}
        </div>
        <div class="atl-axis-labels">${labelsHtml}</div>
        <div class="atl-count">${items.length} contribution${items.length !== 1 ? 's' : ''}</div>
    `;

    // Legend — build from source types present
    const legendEl = container.querySelector('.atl-header-row .atl-legend');
    if (legendEl) {
        const seen = {};
        for (const r of items) {
            if (!seen[r.source_type]) {
                const src = (typeof SOURCE_COLOURS !== 'undefined') ? SOURCE_COLOURS[r.source_type] : null;
                seen[r.source_type] = src ? src.label : (r.source_type || '').replace(/_/g, ' ');
            }
        }
        legendEl.innerHTML = Object.entries(seen).map(([type, label]) => {
            const src   = (typeof SOURCE_COLOURS !== 'undefined') ? SOURCE_COLOURS[type] : null;
            const color = src ? src.color : '#555';
            return `<span class="atl-legend-item"><span class="atl-legend-dot" style="background:${color};"></span>${escapeHtml(label)}</span>`;
        }).join('');
    }

    // Wire hover and click
    container.querySelectorAll('.atl-dot').forEach(dot => {
        dot.addEventListener('mouseenter', _atlShowTooltip);
        dot.addEventListener('mouseleave', _atlScheduleHide);
        dot.addEventListener('click', _atlDotClick);
    });
}

// ── Dot click → scroll to result row ─────────────────────────────────────────

function _atlDotClick(e) {
    const resultId = parseInt(e.currentTarget.dataset.resultId);
    if (!resultId || typeof currentDisplayResults === 'undefined') return;

    const idx = currentDisplayResults.findIndex(r => r.id === resultId);
    if (idx === -1) return;

    const targetPage = Math.floor(idx / RESULTS_PER_PAGE) + 1;
    if (typeof resultsPage !== 'undefined' && targetPage !== resultsPage) {
        resultsPage = targetPage;
        if (typeof renderResultsPage === 'function') renderResultsPage();
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

// ── Tooltip ───────────────────────────────────────────────────────────────────

function _atlShowTooltip(e) {
    clearTimeout(_atlHideTimer);
    _atlHideTooltip();

    const dot     = e.currentTarget;
    const date    = dot.dataset.date;
    const srcLbl  = dot.dataset.srcLabel;
    const srcClr  = dot.dataset.srcColor;
    const srcBg   = dot.dataset.srcBg;
    const summary = dot.dataset.summary;
    const quote   = dot.dataset.quote;
    const url     = dot.dataset.url;

    let topicsArr = [];
    try { topicsArr = JSON.parse(dot.dataset.topics || '[]'); } catch(e) {}

    const srcBadge = srcLbl
        ? `<span class="atl-tip-badge" style="background:${srcBg};color:${srcClr};border-color:${srcClr}44;">${srcLbl}</span>`
        : '';

    const topicBadges = topicsArr.map(t =>
        `<span class="atl-tip-badge atl-tip-topic">${escapeHtml(t)}</span>`
    ).join('');

    const quoteBlock = quote
        ? (url
            ? `<a href="${url}" target="_blank" rel="noopener" class="atl-tip-quote atl-tip-quote--link">"${quote}"</a>`
            : `<span class="atl-tip-quote">"${quote}"</span>`)
        : '';

    const tip = document.createElement('div');
    tip.className = 'atl-tooltip';
    tip.innerHTML = `
        <div class="atl-tip-header">
            <span class="atl-tip-date">${date}</span>
            ${srcBadge}${topicBadges}
        </div>
        ${summary ? `<div class="atl-tip-summary">${summary}</div>` : ''}
        ${quoteBlock ? `<div class="atl-tip-quote-wrap">${quoteBlock}</div>` : ''}
    `;

    tip.addEventListener('mouseenter', () => clearTimeout(_atlHideTimer));
    tip.addEventListener('mouseleave', _atlScheduleHide);

    document.body.appendChild(tip);
    _atlTooltipEl = tip;

    // Position: above the dot, clamped to viewport
    const dotR  = dot.getBoundingClientRect();
    const tipR  = tip.getBoundingClientRect();
    let left = dotR.left + dotR.width / 2 - tipR.width / 2;
    let top  = dotR.top - tipR.height - 10;
    if (top < 8)  top  = dotR.bottom + 10;
    left = Math.max(8, Math.min(window.innerWidth - tipR.width - 8, left));
    tip.style.left = left + 'px';
    tip.style.top  = top  + 'px';
}

function _atlScheduleHide() {
    _atlHideTimer = setTimeout(_atlHideTooltip, 120);
}

function _atlHideTooltip() {
    if (_atlTooltipEl) { _atlTooltipEl.remove(); _atlTooltipEl = null; }
}

// ── Inline analysis (single-member scans, live-updating) ──────────────────────

/**
 * @param {string}     memberName
 * @param {number|null} scanId — current scan ID; used to detect scan switches
 */
function renderInlineAnalysis(memberName, scanId = null) {
    const wrap = document.getElementById('inlineAnalysisWrap');
    if (!wrap) return;

    const allRes = (typeof allResults !== 'undefined') ? allResults : [];
    const raw = allRes.filter(r => r.member_name === memberName && r.activity_date);

    if (!raw.length) {
        clearInlineAnalysis();
        return;
    }

    // When the scan changes, reset tracked IDs so all dots on the new scan animate
    if (scanId !== _inlineScanId) {
        _inlineResultIds = new Set();
        _inlineScanId = scanId;
        if (document.getElementById('inlineAnalysisContent')) {
            wrap.innerHTML = '';
        }
    }

    // prevIds tracks what's already rendered; new IDs get the pop-in animation
    const prevIds = new Set(_inlineResultIds);

    // Preserve or create the inner content div
    if (!document.getElementById('inlineAnalysisContent')) {
        wrap.innerHTML = '<div class="analysis-body" id="inlineAnalysisContent"></div>';
    }

    const container = document.getElementById('inlineAnalysisContent');
    _renderAnalysisInto(container, raw, prevIds);

    // Update the tracked set to reflect what is now rendered
    _inlineResultIds = new Set(raw.map(r => r.id).filter(Boolean));
    wrap.style.display = '';
}

function clearInlineAnalysis() {
    _inlineResultIds = new Set();
    _inlineScanId    = null;
    const wrap = document.getElementById('inlineAnalysisWrap');
    if (wrap) { wrap.style.display = 'none'; wrap.innerHTML = ''; }
}
