/* Member Analysis — standalone timeline panel below the results section */

let _analysisMember = null;
let _atlTooltipEl   = null;
let _atlHideTimer   = null;

// ── Public API ────────────────────────────────────────────────────────────────

function openMemberProfile(memberName) {
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

function _renderAnalysis() {
    const nameEl    = document.getElementById('analysisMemberName');
    const content   = document.getElementById('analysisContent');
    if (!content) return;

    if (nameEl) nameEl.textContent = _analysisMember || '';

    const allRes = (typeof allResults !== 'undefined') ? allResults : [];
    const raw    = allRes.filter(r => r.member_name === _analysisMember && r.activity_date);

    if (!raw.length) {
        content.innerHTML = '<p class="atl-empty">No contributions with dates found.</p>';
        return;
    }

    // Parse + sort
    const items = raw
        .map(r => {
            let topics = r.topics;
            try { topics = JSON.parse(topics); } catch (e) {}
            return { ...r, _topics: Array.isArray(topics) ? topics : [] };
        })
        .sort((a, b) => a.activity_date.localeCompare(b.activity_date));

    const minDate  = new Date(items[0].activity_date);
    const maxDate  = new Date(items[items.length - 1].activity_date);
    const spanMs   = Math.max(maxDate - minDate, 86400000); // at least 1 day

    // Group by exact date to stack same-day dots
    const byDate = {};
    for (const item of items) {
        (byDate[item.activity_date] = byDate[item.activity_date] || []).push(item);
    }

    const maxStack  = Math.max(...Object.values(byDate).map(g => g.length));
    const DOT       = 10;                          // dot diameter px
    const GAP       = 5;                           // gap between stacked dots
    const TOP_PAD   = 10;                          // breathing room above tallest dot
    // Axis sits below all stacked dots
    const AXIS_Y    = TOP_PAD + maxStack * (DOT + GAP);
    const trackH    = AXIS_Y + 14;                 // a little space below the axis

    // Build dots — stack upward from the axis line
    let dotsHtml = '';
    let bracketsHtml = '';
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
            const ka = _speechKey(a);
            const kb = _speechKey(b);
            const oa = ka !== null ? keyFirstSeen[ka] : seenOrder + group.indexOf(a);
            const ob = kb !== null ? keyFirstSeen[kb] : seenOrder + group.indexOf(b);
            return oa - ob;
        });

        sortedGroup.forEach((r, i) => {
            const src   = (typeof SOURCE_COLOURS !== 'undefined') ? SOURCE_COLOURS[r.source_type] : null;
            const color = src ? src.color : '#555';
            // i=0 sits just above the axis, higher i goes further up
            const top   = AXIS_Y - DOT - (DOT + GAP) * i;

            const quote   = escapeHtml((r.verbatim_quote || '').slice(0, 400));
            const summary = escapeHtml(r.summary || '');
            const srcLbl  = src ? src.label : (r.source_type || '').replace(/_/g, ' ');
            const srcBg   = src ? src.bg : 'rgba(80,80,80,0.15)';
            const dateStr = (typeof formatDate === 'function') ? formatDate(date) : date;
            const url     = r.source_url || '';

            dotsHtml += `<div class="atl-dot"
                style="left:calc(${xPct}% - ${DOT/2}px);top:${top}px;width:${DOT}px;height:${DOT}px;background:${color};box-shadow:0 0 0 2px ${color}33;"
                data-date="${escapeHtml(dateStr)}"
                data-src-label="${escapeHtml(srcLbl)}"
                data-src-color="${escapeHtml(color)}"
                data-src-bg="${escapeHtml(srcBg)}"
                data-summary="${summary}"
                data-quote="${quote}"
                data-url="${escapeHtml(url)}"></div>`;
        });

        // Draw brackets for speech groups with 2+ contributions
        // Find consecutive runs of the same speechKey within the sorted stack
        const BRACKET_W = 3;
        const BRACKET_GAP = 3; // gap between bracket and dot edge
        let runStart = 0;
        while (runStart < sortedGroup.length) {
            const key = _speechKey(sortedGroup[runStart]);
            if (!key) { runStart++; continue; }
            let runEnd = runStart;
            while (runEnd + 1 < sortedGroup.length && _speechKey(sortedGroup[runEnd + 1]) === key) {
                runEnd++;
            }
            if (runEnd > runStart) {
                // Dots at indices runStart..runEnd share the same speech
                const topDotTop    = AXIS_Y - DOT - (DOT + GAP) * runEnd;
                const bottomDotBot = AXIS_Y         - (DOT + GAP) * runStart;
                const bracketH     = bottomDotBot - topDotTop;
                const count        = runEnd - runStart + 1;
                const src          = (typeof SOURCE_COLOURS !== 'undefined') ? SOURCE_COLOURS[sortedGroup[runStart].source_type] : null;
                const color        = src ? src.color : '#888';
                bracketsHtml += `<div class="atl-speech-bracket"
                    style="left:calc(${xPct}% - ${DOT/2 + BRACKET_GAP + BRACKET_W}px);top:${topDotTop}px;height:${bracketH}px;border-color:${color}80;"
                    title="${count} extracts from the same speech"></div>`;
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
        // First label left-align, last right-align, others centre
        const align = i === 0 ? 'left:0;transform:none;' : i === labelCount ? 'right:0;left:auto;transform:none;' : `left:${frac*100}%;transform:translateX(-50%);`;
        labelsHtml += `<span class="atl-axis-label" style="${align}">${label}</span>`;
    }

    content.innerHTML = `
        <div class="atl-legend" id="atlLegend"></div>
        <div class="atl-track-wrap" style="height:${trackH}px;">
            <div class="atl-axis-line" style="top:${AXIS_Y}px;"></div>
            ${bracketsHtml}
            ${dotsHtml}
        </div>
        <div class="atl-axis-labels">${labelsHtml}</div>
        <div class="atl-count">${items.length} contribution${items.length !== 1 ? 's' : ''}</div>
    `;

    // Build legend from source types present
    _buildLegend(items);

    // Wire hover
    content.querySelectorAll('.atl-dot').forEach(dot => {
        dot.addEventListener('mouseenter', _atlShowTooltip);
        dot.addEventListener('mouseleave', _atlScheduleHide);
    });
}

function _buildLegend(items) {
    const el = document.getElementById('atlLegend');
    if (!el) return;
    const seen = {};
    for (const r of items) {
        if (!seen[r.source_type]) {
            const src = (typeof SOURCE_COLOURS !== 'undefined') ? SOURCE_COLOURS[r.source_type] : null;
            seen[r.source_type] = src ? src.label : (r.source_type || '').replace(/_/g, ' ');
        }
    }
    el.innerHTML = Object.entries(seen).map(([type, label]) => {
        const src   = (typeof SOURCE_COLOURS !== 'undefined') ? SOURCE_COLOURS[type] : null;
        const color = src ? src.color : '#555';
        return `<span class="atl-legend-item"><span class="atl-legend-dot" style="background:${color};"></span>${escapeHtml(label)}</span>`;
    }).join('');
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

    const srcBadge = srcLbl
        ? `<span class="atl-tip-badge" style="background:${srcBg};color:${srcClr};border-color:${srcClr}44;">${srcLbl}</span>`
        : '';

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
            ${srcBadge}
        </div>
        ${summary ? `<div class="atl-tip-summary">${summary}</div>` : ''}
        ${quoteBlock ? `<div class="atl-tip-quote-wrap">${quoteBlock}</div>` : ''}
    `;

    // Allow hovering over tooltip to keep it open (so user can click the link)
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
