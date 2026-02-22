/* Parliamentary Scanner — Look Ahead (upcoming events) */

const LA_COLORS = {
    oral_questions:    { color: '#6366f1', bg: 'rgba(99,102,241,0.12)',  label: 'Oral Qs' },
    debate:            { color: '#f472b6', bg: 'rgba(244,114,182,0.12)', label: 'Debate' },
    committee:         { color: '#34d399', bg: 'rgba(52,211,153,0.12)',  label: 'Committee' },
    bill_stage:        { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  label: 'Bill Stage' },
    westminster_hall:  { color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', label: 'WH Debate' },
    statement:         { color: '#fb923c', bg: 'rgba(251,146,60,0.12)',  label: 'Statement' },
    general_committee: { color: '#22d3ee', bg: 'rgba(34,211,238,0.12)', label: 'Gen. Committee' },
};

const laState = {
    weekStart: null,
    view: 'week',
    events: [],
    eventsByDate: {},
    starredOnly: false,
    showFilters: false,
    enabledTypes: new Set([
        'debate', 'oral_questions', 'committee', 'bill_stage',
        'westminster_hall', 'statement', 'general_committee',
    ]),
    enabledHouses: new Set(['Commons', 'Lords']),
    activeTopicIds: new Set(),
    showAllEvents: false,   // when true, bypass keyword filtering entirely
    initialized: false,
    loading: false,
    lastFilteredCount: 0,
    recessPeriods: [],      // [{start_date, end_date, house, description}]
};

function initLookahead() {
    if (!laState.initialized) {
        laState.initialized = true;
        _setupLaListeners();
        const today = new Date();
        const monday = new Date(today);
        monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
        monday.setHours(0, 0, 0, 0);
        laState.weekStart = monday;
        // Default: filter by all topics so only relevant events are shown
        _initTopicIds();
        // Restore view/week/filters from URL if navigating directly to /calendar/...
        _restoreCalendarFromUrl();
    }
    _renderLaTopicPills();
    // Sync view toggle buttons to match restored state
    document.querySelectorAll('.la-view-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.view === laState.view);
    });
    _updateWeekNavVisibility();
    _fetchRecessPeriods();
    _loadLaEvents();
}

function _initTopicIds() {
    laState.activeTopicIds = new Set((state.topics || []).map(t => t.id));
}

async function _fetchRecessPeriods() {
    try {
        const data = await API.get('/api/lookahead/recess');
        laState.recessPeriods = data.recess_periods || [];
    } catch (err) {
        console.warn('Could not fetch recess periods:', err);
    }
}

/**
 * Returns a label string if the given YYYY-MM-DD date falls within a recess
 * period, or null if Parliament is sitting. When both houses are in recess for
 * the same named period, returns just the description. When only one house is
 * in recess, returns "<description> (Commons)" or similar.
 */
function _getRecessLabel(dateStr) {
    const matching = laState.recessPeriods.filter(
        p => dateStr >= p.start_date && dateStr <= p.end_date
    );
    if (matching.length === 0) return null;

    // Deduplicate by description — if both houses share the same name, show once
    const byDesc = {};
    for (const p of matching) {
        if (!byDesc[p.description]) byDesc[p.description] = new Set();
        byDesc[p.description].add(p.house);
    }

    const labels = Object.entries(byDesc).map(([desc, houses]) => {
        if (houses.size >= 2 || houses.has('Both')) return desc;
        return `${desc} (${[...houses].join('/')})`;
    });

    return labels[0] || 'Recess';
}

// --- Setup ---

function _setupLaListeners() {
    document.getElementById('laPrevWeek').addEventListener('click', () => {
        laState.weekStart = new Date(laState.weekStart);
        laState.weekStart.setDate(laState.weekStart.getDate() - 7);
        _loadLaEvents();
    });
    document.getElementById('laNextWeek').addEventListener('click', () => {
        laState.weekStart = new Date(laState.weekStart);
        laState.weekStart.setDate(laState.weekStart.getDate() + 7);
        _loadLaEvents();
    });
    document.getElementById('laToday').addEventListener('click', () => {
        const today = new Date();
        const monday = new Date(today);
        monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
        monday.setHours(0, 0, 0, 0);
        laState.weekStart = monday;
        _loadLaEvents();
    });

    // View toggle
    document.querySelectorAll('.la-view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.la-view-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            laState.view = btn.dataset.view;
            _updateWeekNavVisibility();
            _loadLaEvents();
        });
    });

    // Filter panel toggle
    document.getElementById('laFilterBtn').addEventListener('click', () => {
        laState.showFilters = !laState.showFilters;
        const panel = document.getElementById('laFilterPanel');
        if (laState.showFilters) _renderFilterPanel();
        panel.classList.toggle('la-filter-panel--open', laState.showFilters);
        document.getElementById('laFilterBtn').classList.toggle('la-filter-btn--active', laState.showFilters);
        _renderInfoBar(laState.lastFilteredCount);
    });

    // Refresh
    document.getElementById('laRefreshBtn').addEventListener('click', _forceRefresh);
}

// --- Data loading ---

async function _loadLaEvents() {
    if (laState.loading) return;
    laState.loading = true;

    let startDate, endDate;
    if (laState.view === 'list') {
        // List view: always start from today, show 6 months ahead
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 180);
    } else {
        startDate = laState.weekStart;
        endDate = new Date(laState.weekStart);
        endDate.setDate(endDate.getDate() + 6);
    }
    const start = _fmtDate(startDate);
    const end = _fmtDate(endDate);

    // showAllEvents bypasses keyword filtering; otherwise send active topic IDs
    const topicParam = laState.showAllEvents ? '' : Array.from(laState.activeTopicIds).join(',');

    _updateDateLabel();

    try {
        const data = await API.get(
            `/api/lookahead/events?start=${start}&end=${end}&topic_ids=${encodeURIComponent(topicParam)}`
        );
        laState.events = data.events || [];
        laState.eventsByDate = data.events_by_date || {};
        _renderLaView();
    } catch (err) {
        console.error('Failed to load lookahead events:', err);
        _showLaEmpty('Failed to load events. Try refreshing.');
    } finally {
        laState.loading = false;
    }
}

async function _forceRefresh() {
    const btn = document.getElementById('laRefreshBtn');
    btn.disabled = true;
    btn.textContent = 'Refreshing...';

    const start = _fmtDate(laState.weekStart);
    const endDate = new Date(laState.weekStart);
    endDate.setDate(endDate.getDate() + (laState.view === 'list' ? 90 : 6));
    const end = _fmtDate(endDate);

    try {
        await API.post(`/api/lookahead/refresh?start=${start}&end=${end}`);
        await _loadLaEvents();
    } catch (err) {
        console.error('Refresh failed:', err);
    } finally {
        btn.disabled = false;
        btn.textContent = '↻ Refresh';
    }
}

// --- Rendering ---

function _renderLaView() {
    _updateCalendarUrl();
    const filtered = laState.events.filter(ev =>
        laState.enabledTypes.has(ev.event_type) &&
        laState.enabledHouses.has(ev.house) &&
        (!laState.starredOnly || ev.is_starred)
    );

    _renderInfoBar(filtered.length);
    if (laState.showFilters) _renderFilterPanel();

    if (laState.view === 'week') {
        _renderWeekView(filtered);
        document.getElementById('la-week-view').style.display = '';
        document.getElementById('la-list-view').style.display = 'none';
    } else {
        _renderListView(filtered);
        document.getElementById('la-week-view').style.display = 'none';
        document.getElementById('la-list-view').style.display = '';
    }
}

// --- Time grid week view ---

function _parseTimeToHours(timeStr) {
    if (!timeStr) return null;
    const [h, m] = timeStr.split(':').map(Number);
    return h + m / 60;
}

function _renderWeekView(events) {
    const container = document.getElementById('la-week-view');
    container.innerHTML = '';

    const HOUR_H = 56;
    const START_H = 9;
    const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const todayStr = _fmtDate(new Date());

    // Group events by date
    const byDate = {};
    for (const ev of events) {
        if (!byDate[ev.start_date]) byDate[ev.start_date] = [];
        byDate[ev.start_date].push(ev);
    }

    const grid = document.createElement('div');
    grid.className = 'la-time-grid';

    // Time gutter
    const gutter = document.createElement('div');
    gutter.className = 'la-time-gutter';
    const gutterSpacer = document.createElement('div');
    gutterSpacer.className = 'la-time-gutter__header';
    gutter.appendChild(gutterSpacer);
    for (const h of HOURS) {
        const label = document.createElement('div');
        label.className = 'la-time-label';
        label.textContent = `${String(h).padStart(2, '0')}:00`;
        gutter.appendChild(label);
    }
    grid.appendChild(gutter);

    // Day columns
    for (let i = 0; i < 5; i++) {
        const dayDate = new Date(laState.weekStart);
        dayDate.setDate(dayDate.getDate() + i);
        const dateStr = _fmtDate(dayDate);
        const isToday = dateStr === todayStr;
        const dayEvents = byDate[dateStr] || [];

        const recessLabel = _getRecessLabel(dateStr);

        const col = document.createElement('div');
        col.className = 'la-grid-col'
            + (isToday ? ' la-grid-col--today' : '')
            + (recessLabel ? ' la-grid-col--recess' : '');

        // Sticky day header
        const header = document.createElement('div');
        header.className = 'la-grid-day-header' + (isToday ? ' la-grid-day-header--today' : '');
        const dayNameEl = document.createElement('span');
        dayNameEl.className = 'la-grid-day-name';
        dayNameEl.textContent = dayNames[i];
        const dayDateEl = document.createElement('span');
        dayDateEl.className = 'la-grid-day-date' + (isToday ? ' la-grid-day-date--today' : '');
        dayDateEl.textContent = dayDate.getDate();
        header.appendChild(dayNameEl);
        header.appendChild(dayDateEl);
        col.appendChild(header);

        if (recessLabel) {
            const banner = document.createElement('div');
            banner.className = 'la-grid-recess-banner';
            banner.textContent = recessLabel;
            col.appendChild(banner);
        }

        // Untimed events strip
        const untimed = dayEvents.filter(ev => !ev.start_time);
        if (untimed.length > 0) {
            const strip = document.createElement('div');
            strip.className = 'la-grid-untimed';
            for (const ev of untimed) {
                const colors = LA_COLORS[ev.event_type] || LA_COLORS.debate;
                const pill = document.createElement('div');
                pill.className = 'la-grid-untimed-pill';
                pill.style.cssText = `background:${colors.bg};border-left:3px solid ${colors.color};color:${colors.color};`;
                pill.textContent = ev.title.length > 42 ? ev.title.substring(0, 39) + '…' : ev.title;
                strip.appendChild(pill);
            }
            col.appendChild(strip);
        }

        // Grid body (relative, fixed height for the hour rows)
        const body = document.createElement('div');
        body.className = 'la-grid-body';
        body.style.height = `${HOURS.length * HOUR_H}px`;

        // Hour grid lines
        for (let hi = 0; hi < HOURS.length; hi++) {
            const line = document.createElement('div');
            line.className = 'la-grid-hour-line';
            line.style.top = `${hi * HOUR_H}px`;
            body.appendChild(line);
        }

        // Lay out timed events with overlap algorithm
        const timed = dayEvents.filter(ev => ev.start_time);
        const sorted = [...timed].sort((a, b) => {
            const ah = _parseTimeToHours(a.start_time);
            const bh = _parseTimeToHours(b.start_time);
            const ad = a.end_time ? _parseTimeToHours(a.end_time) - ah : 1;
            const bd = b.end_time ? _parseTimeToHours(b.end_time) - bh : 1;
            return ah - bh || bd - ad;
        });

        const columns = [];
        const eventLayout = sorted.map(ev => {
            const startH = _parseTimeToHours(ev.start_time);
            const endH = ev.end_time ? _parseTimeToHours(ev.end_time) : startH + 1;
            let col = 0;
            while (columns[col] !== undefined && columns[col] > startH) col++;
            columns[col] = endH;
            return { ev, col, startH, endH };
        });
        const totalCols = columns.length || 1;

        for (const { ev, col: evCol, startH, endH } of eventLayout) {
            const colors = LA_COLORS[ev.event_type] || LA_COLORS.debate;
            const clampedStart = Math.max(startH, START_H);
            const clampedEnd = Math.min(endH, START_H + HOURS.length);
            const top = (clampedStart - START_H) * HOUR_H;
            const height = Math.max((clampedEnd - clampedStart) * HOUR_H - 2, 22);
            const colWidth = 100 / totalCols;
            const leftPct = evCol * colWidth;

            const evEl = document.createElement('div');
            evEl.className = 'la-grid-event';
            evEl.style.cssText = `top:${top}px;height:${height}px;left:calc(${leftPct}% + 2px);width:calc(${colWidth}% - 4px);background:${colors.bg};border-left:3px solid ${colors.color};`;

            const titleEl = document.createElement('div');
            titleEl.className = 'la-grid-event__title';
            titleEl.style.color = colors.color;
            if (ev.source_url) {
                titleEl.innerHTML = `<a href="${_escHtml(ev.source_url)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;">${_escHtml(ev.title)}</a>`;
            } else {
                titleEl.textContent = ev.title;
            }
            evEl.appendChild(titleEl);

            // Popout card (shown on hover, positioned to the side)
            const tooltip = _buildEventTooltip(ev, colors);
            evEl.appendChild(tooltip);
            evEl.addEventListener('mouseenter', () => {
                tooltip.style.display = 'block';
                evEl.style.zIndex = '20';
                // Default: right of event; flip left if it overflows viewport
                tooltip.style.left = 'calc(100% + 6px)';
                tooltip.style.right = 'auto';
                const r = tooltip.getBoundingClientRect();
                if (r.right > window.innerWidth - 8) {
                    tooltip.style.left = 'auto';
                    tooltip.style.right = 'calc(100% + 6px)';
                }
            });
            evEl.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; evEl.style.zIndex = '1'; });

            body.appendChild(evEl);
        }

        col.appendChild(body);
        grid.appendChild(col);
    }

    container.appendChild(grid);
}

function _buildEventTooltip(ev, colors) {
    const tooltip = document.createElement('div');
    tooltip.className = 'la-event-tooltip';
    const _tooltipBg = colors.bg.replace('0.12)', '0.45)');
    tooltip.style.cssText = `display:none;background:${_tooltipBg};border-left:3px solid ${colors.color};`;

    // Title (full, wrapping)
    const titleEl = document.createElement('div');
    titleEl.className = 'la-tooltip__title';
    titleEl.style.color = colors.color;
    if (ev.source_url) {
        titleEl.innerHTML = `<a href="${_escHtml(ev.source_url)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;">${_escHtml(ev.title)}</a>`;
    } else {
        titleEl.textContent = ev.title;
    }
    tooltip.appendChild(titleEl);

    // Committee / inquiry detail
    if (ev.committee_name) {
        const detail = document.createElement('div');
        detail.className = 'la-tooltip__detail';
        detail.style.color = colors.color + '99';
        detail.textContent = ev.inquiry_name
            ? `${ev.committee_name}: ${ev.inquiry_name}`
            : ev.committee_name;
        tooltip.appendChild(detail);
    }

    // Time + location
    const timeStr = `${ev.start_time || ''}${ev.end_time ? ' – ' + ev.end_time : ''}${ev.location ? ' · ' + ev.location : ''}`.trim();
    if (timeStr) {
        const subEl = document.createElement('div');
        subEl.className = 'la-tooltip__sub';
        subEl.style.color = colors.color + '99';
        subEl.textContent = timeStr;
        tooltip.appendChild(subEl);
    }

    // Footer: house badge + star
    const footer = document.createElement('div');
    footer.className = 'la-tooltip__footer';

    if (ev.house) {
        const houseBadge = document.createElement('span');
        houseBadge.className = 'la-grid-event__house';
        houseBadge.style.cssText = `background:${colors.color}15;color:${colors.color}cc;margin-top:0;`;
        houseBadge.textContent = ev.house;
        footer.appendChild(houseBadge);
    }

    const starBtn = document.createElement('button');
    starBtn.className = ev.is_starred ? 'la-star-btn starred' : 'la-star-btn';
    starBtn.dataset.eventId = ev.id;
    starBtn.title = 'Star this event';
    starBtn.textContent = ev.is_starred ? '★' : '☆';
    starBtn.style.cssText = 'margin-left:auto;margin-top:0;';
    starBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        _toggleStar(ev.id, ev.is_starred, starBtn);
    });
    footer.appendChild(starBtn);
    tooltip.appendChild(footer);

    return tooltip;
}

// --- List view (grouped by day) ---

function _renderListView(events) {
    const container = document.getElementById('la-list-view');
    container.innerHTML = '';

    if (events.length === 0) {
        container.innerHTML = '<p class="empty-state-preview">No upcoming events match your filters.</p>';
        return;
    }

    events.sort((a, b) => {
        const cmp = (a.start_date || '').localeCompare(b.start_date || '');
        if (cmp !== 0) return cmp;
        return (a.start_time || '').localeCompare(b.start_time || '');
    });

    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const monthNamesShort = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

    // Group by date
    const groups = {};
    const groupOrder = [];
    for (const ev of events) {
        const key = ev.start_date;
        if (!groups[key]) { groups[key] = []; groupOrder.push(key); }
        groups[key].push(ev);
    }

    let currentMonth = null;

    for (const dateKey of groupOrder) {
        const d = new Date(dateKey + 'T00:00:00');
        const monthKey = `${d.getFullYear()}-${d.getMonth()}`;

        // Insert a month header when the month changes
        if (monthKey !== currentMonth) {
            currentMonth = monthKey;
            const monthHeader = document.createElement('div');
            monthHeader.className = 'la-list-month-header';
            monthHeader.textContent = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
            container.appendChild(monthHeader);
        }

        const dayLabel = `${dayNames[d.getDay()]} ${d.getDate()} ${monthNamesShort[d.getMonth()]}`;
        const dayEvents = groups[dateKey];

        const recessLabel = _getRecessLabel(dateKey);

        const group = document.createElement('div');
        group.className = 'la-list-group';

        const groupHeader = document.createElement('div');
        groupHeader.className = 'la-list-group__header';
        if (recessLabel) {
            groupHeader.innerHTML = `${_escHtml(dayLabel)} <span class="la-recess-badge">${_escHtml(recessLabel)}</span>`;
        } else {
            groupHeader.textContent = dayLabel;
        }
        group.appendChild(groupHeader);

        for (const ev of dayEvents) {
            const colors = LA_COLORS[ev.event_type] || LA_COLORS.debate;
            const row = document.createElement('div');
            row.className = 'la-list-row';

            const timeStr = ev.start_time
                ? `${ev.start_time}${ev.end_time ? ' – ' + ev.end_time : ''}`
                : '';

            let titleHtml = `<span>${_escHtml(ev.title)}</span>`;
            if (ev.source_url) {
                titleHtml = `<a href="${_escHtml(ev.source_url)}" target="_blank" rel="noopener" class="la-list-link">${_escHtml(ev.title)}</a>`;
            }

            let subtitle = '';
            if (ev.committee_name) {
                subtitle = _escHtml(ev.committee_name);
                if (ev.inquiry_name) subtitle += ': ' + _escHtml(ev.inquiry_name);
            }
            if (ev.location) {
                subtitle = subtitle ? subtitle + ' · ' + _escHtml(ev.location) : _escHtml(ev.location);
            }

            const houseBadgeStyle = ev.house === 'Lords'
                ? `color:#fbbf24;background:rgba(251,191,36,0.1);`
                : ``;

            const starClass = ev.is_starred ? 'la-star-btn starred' : 'la-star-btn';
            const starChar = ev.is_starred ? '★' : '☆';

            row.innerHTML = `
                <span class="la-list-time">${timeStr}</span>
                <div class="la-list-colour-bar" style="background:${colors.color};"></div>
                <div class="la-list-content">
                    <div class="la-list-title">${titleHtml}</div>
                    ${subtitle ? `<div class="la-list-subtitle">${subtitle}</div>` : ''}
                </div>
                <div class="la-list-badges">
                    <span class="la-list-badge" style="color:${colors.color};background:${colors.bg};">${colors.label}</span>
                    <span class="la-list-badge" style="${houseBadgeStyle}">${_escHtml(ev.house || '')}</span>
                </div>
                <button class="${starClass}" data-event-id="${_escHtml(String(ev.id))}" title="Star">${starChar}</button>
            `;

            const starBtn = row.querySelector('.la-star-btn');
            starBtn.addEventListener('click', () => _toggleStar(ev.id, ev.is_starred, starBtn));

            group.appendChild(row);
        }

        container.appendChild(group);
    }
}

// --- Filter panel ---

function _renderFilterPanel() {
    const panel = document.getElementById('laFilterPanel');
    panel.innerHTML = '';

    // Event Types
    const typesGroup = document.createElement('div');
    typesGroup.className = 'la-fp-group';
    const typesLabel = document.createElement('span');
    typesLabel.className = 'la-fp-label';
    typesLabel.textContent = 'Event Type';
    typesGroup.appendChild(typesLabel);
    const typesChips = document.createElement('div');
    typesChips.className = 'la-fp-chips';

    for (const [key, c] of Object.entries(LA_COLORS)) {
        const isActive = laState.enabledTypes.has(key);
        const chip = document.createElement('button');
        chip.className = 'la-type-chip' + (isActive ? ' la-type-chip--active' : '');
        if (isActive) {
            chip.style.borderColor = c.color + '55';
            chip.style.background = c.bg;
            chip.style.color = c.color;
        }
        chip.innerHTML = `<span class="la-type-chip__dot" style="background:${isActive ? c.color : '#52525b'};"></span>${c.label}`;
        chip.addEventListener('click', () => {
            if (laState.enabledTypes.has(key)) {
                laState.enabledTypes.delete(key);
            } else {
                laState.enabledTypes.add(key);
            }
            _renderLaView();
        });
        typesChips.appendChild(chip);
    }
    typesGroup.appendChild(typesChips);
    panel.appendChild(typesGroup);

    // House + Starred
    const houseGroup = document.createElement('div');
    houseGroup.className = 'la-fp-group';
    const houseLabel = document.createElement('span');
    houseLabel.className = 'la-fp-label';
    houseLabel.textContent = 'House';
    houseGroup.appendChild(houseLabel);
    const houseChips = document.createElement('div');
    houseChips.className = 'la-fp-chips';

    for (const house of ['Commons', 'Lords']) {
        const isActive = laState.enabledHouses.has(house);
        const chip = document.createElement('button');
        chip.className = 'la-filter-chip' + (isActive ? ' la-filter-chip--active' : '');
        chip.textContent = house;
        chip.addEventListener('click', () => {
            if (laState.enabledHouses.has(house)) {
                laState.enabledHouses.delete(house);
            } else {
                laState.enabledHouses.add(house);
            }
            _renderLaView();
        });
        houseChips.appendChild(chip);
    }

    const starredChip = document.createElement('button');
    starredChip.className = 'la-filter-chip' + (laState.starredOnly ? ' la-filter-chip--active' : '');
    starredChip.textContent = '★ Starred';
    starredChip.addEventListener('click', () => {
        laState.starredOnly = !laState.starredOnly;
        _renderLaView();
    });
    houseChips.appendChild(starredChip);
    houseGroup.appendChild(houseChips);
    panel.appendChild(houseGroup);

    // Topics (if any)
    if (state.topics && state.topics.length > 0) {
        const topicGroup = document.createElement('div');
        topicGroup.className = 'la-fp-group la-fp-group--row2';

        const topicHeaderRow = document.createElement('div');
        topicHeaderRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;';

        const topicLabel = document.createElement('span');
        topicLabel.className = 'la-fp-label';
        topicLabel.style.marginBottom = '0';
        topicLabel.textContent = 'Topics';
        topicHeaderRow.appendChild(topicLabel);

        const modeBtn = document.createElement('button');
        modeBtn.className = 'la-topic-mode-btn' + (laState.showAllEvents ? ' la-topic-mode-btn--all' : '');
        modeBtn.textContent = laState.showAllEvents ? 'Show filtered topics' : 'Show all events';
        modeBtn.addEventListener('click', () => {
            laState.showAllEvents = !laState.showAllEvents;
            if (!laState.showAllEvents) _initTopicIds();
            _renderFilterPanel();
            _loadLaEvents();
        });
        topicHeaderRow.appendChild(modeBtn);
        topicGroup.appendChild(topicHeaderRow);

        const topicChips = document.createElement('div');
        topicChips.className = 'la-fp-chips';

        for (const topic of state.topics) {
            const isActive = !laState.showAllEvents && laState.activeTopicIds.has(topic.id);
            const chip = document.createElement('button');
            chip.className = 'la-filter-chip' + (isActive ? ' la-filter-chip--active' : '');
            if (laState.showAllEvents) chip.style.opacity = '0.4';
            chip.textContent = topic.name;
            chip.addEventListener('click', () => {
                // Clicking a specific topic switches to Topics mode
                if (laState.showAllEvents) {
                    laState.showAllEvents = false;
                    laState.activeTopicIds = new Set([topic.id]);
                    _updateTopicModeToggle();
                } else {
                    if (laState.activeTopicIds.has(topic.id)) {
                        laState.activeTopicIds.delete(topic.id);
                    } else {
                        laState.activeTopicIds.add(topic.id);
                    }
                }
                _renderFilterPanel();
                _loadLaEvents();
            });
            topicChips.appendChild(chip);
        }
        topicGroup.appendChild(topicChips);
        panel.appendChild(topicGroup);
    }
}

function _makeFpDivider() {
    const div = document.createElement('div');
    div.className = 'la-fp-divider';
    return div;
}

// --- Info bar ---

function _renderInfoBar(filteredCount) {
    const bar = document.getElementById('laInfoBar');
    if (!bar) return;
    laState.lastFilteredCount = filteredCount;

    const allTypes = Object.keys(LA_COLORS);
    const totalTopics = (state.topics || []).length;
    // Count as a filter if: in All events mode, or narrowed to a subset of topics
    const topicFilterCount = laState.showAllEvents ? 0
        : (laState.activeTopicIds.size < totalTopics ? totalTopics - laState.activeTopicIds.size : 0);
    const filterCount =
        (allTypes.length - laState.enabledTypes.size) +
        (2 - laState.enabledHouses.size) +
        topicFilterCount +
        (laState.starredOnly ? 1 : 0);

    bar.innerHTML = '';

    const countEl = document.createElement('span');
    countEl.className = 'la-info-count';
    countEl.textContent = `${filteredCount} event${filteredCount !== 1 ? 's' : ''}`;
    bar.appendChild(countEl);

    if (filterCount > 0) {
        const dot = document.createElement('span');
        dot.className = 'la-info-sep';
        dot.textContent = '·';
        bar.appendChild(dot);

        const filtersEl = document.createElement('span');
        filtersEl.className = 'la-info-filters';
        filtersEl.textContent = `${filterCount} filter${filterCount > 1 ? 's' : ''} active`;
        bar.appendChild(filtersEl);

        const clearBtn = document.createElement('button');
        clearBtn.className = 'la-info-clear';
        clearBtn.textContent = 'Clear all';
        clearBtn.addEventListener('click', () => {
            laState.enabledTypes = new Set(Object.keys(LA_COLORS));
            laState.enabledHouses = new Set(['Commons', 'Lords']);
            laState.showAllEvents = false;
            _initTopicIds();
            laState.starredOnly = false;
            _updateTopicModeToggle();
            if (laState.showFilters) _renderFilterPanel();
            _loadLaEvents();
        });
        bar.appendChild(clearBtn);
    }

    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    bar.appendChild(spacer);

    // Color legend — hide when filter panel is open (event types are shown there)
    if (!laState.showFilters) {
        const legend = document.createElement('div');
        legend.className = 'la-info-legend';
        for (const [, c] of Object.entries(LA_COLORS)) {
            const item = document.createElement('span');
            item.className = 'la-legend-item';
            item.innerHTML = `<span class="la-legend-dot" style="background:${c.color};"></span>${c.label}`;
            legend.appendChild(item);
        }
        bar.appendChild(legend);
    }

    // Update filter button badge
    _updateFilterBtnBadge(filterCount);
}

function _updateFilterBtnBadge(filterCount) {
    const btn = document.getElementById('laFilterBtn');
    if (!btn) return;
    const existingBadge = btn.querySelector('.la-filter-badge');
    if (existingBadge) existingBadge.remove();
    btn.classList.toggle('la-filter-btn--active', laState.showFilters || filterCount > 0);
    if (filterCount > 0) {
        const badge = document.createElement('span');
        badge.className = 'la-filter-badge';
        badge.textContent = filterCount;
        btn.appendChild(badge);
    }
}

function _showLaEmpty(message) {
    const container = document.getElementById('la-week-view');
    container.innerHTML = `<div class="la-empty-message">${_escHtml(message)}</div>`;
    container.style.display = '';
    document.getElementById('la-list-view').style.display = 'none';
}

// --- Star/bookmark ---

async function _toggleStar(eventId, isCurrentlyStarred, btnEl) {
    try {
        if (isCurrentlyStarred) {
            await API.del(`/api/lookahead/star/${encodeURIComponent(eventId)}`);
        } else {
            await API.post(`/api/lookahead/star/${encodeURIComponent(eventId)}`);
        }
        const ev = laState.events.find(e => e.id === eventId);
        if (ev) ev.is_starred = isCurrentlyStarred ? 0 : 1;
        if (isCurrentlyStarred) {
            btnEl.classList.remove('starred');
            btnEl.textContent = '☆';
        } else {
            btnEl.classList.add('starred');
            btnEl.textContent = '★';
        }
    } catch (err) {
        console.error('Failed to toggle star:', err);
    }
}

function setLaTopicMode(showAll) {
    laState.showAllEvents = showAll;
    // Restore all topic IDs when switching back to Topics mode
    if (!showAll) _initTopicIds();
    _updateTopicModeToggle();
    if (laState.showFilters) _renderFilterPanel();
    _loadLaEvents();
}

function _updateTopicModeToggle() {
    // No header toggle any more — just re-render the filter panel if open
    if (laState.showFilters) _renderFilterPanel();
}

// --- Topic pills (no-op: topics are rendered inside filter panel) ---

function _renderLaTopicPills() {
    // Topics are rendered in the topic bar and filter panel
}

function _getSelectedTopicIds() {
    return Array.from(laState.activeTopicIds);
}

// --- UI helpers ---

function _updateWeekNavVisibility() {
    const isList = laState.view === 'list';
    ['laPrevWeek', 'laNextWeek', 'laToday'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = isList ? 'none' : '';
    });
    const sep = document.querySelector('.la-cal-sep');
    if (sep) sep.style.display = isList ? 'none' : '';
}

function _updateDateLabel() {
    const label = document.getElementById('laDateLabel');
    if (!label) return;

    if (laState.view === 'list') {
        label.textContent = 'Upcoming';
        return;
    }

    const start = laState.weekStart;
    const end = new Date(start);
    end.setDate(end.getDate() + 6);

    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    const startDay = start.getDate();
    const startMon = monthNames[start.getMonth()];
    const startYear = start.getFullYear();
    const endDay = end.getDate();
    const endMon = monthNames[end.getMonth()];
    const endYear = end.getFullYear();

    if (startYear === endYear) {
        label.textContent = `${startDay} ${startMon} \u2013 ${endDay} ${endMon} ${endYear}`;
    } else {
        label.textContent = `${startDay} ${startMon} ${startYear} \u2013 ${endDay} ${endMon} ${endYear}`;
    }
}

// --- URL sync ---

function _updateCalendarUrl() {
    const parts = ['calendar'];
    if (laState.view === 'list') {
        parts.push('list');
    } else {
        parts.push('week');
        parts.push(_fmtDate(laState.weekStart));
    }

    const params = new URLSearchParams();

    // Only include event types if some are disabled
    const allTypes = Object.keys(LA_COLORS);
    const activeTypes = allTypes.filter(t => laState.enabledTypes.has(t));
    if (activeTypes.length < allTypes.length) {
        params.set('types', activeTypes.join(','));
    }

    // Only include houses if not both enabled
    if (laState.enabledHouses.size < 2) {
        params.set('houses', Array.from(laState.enabledHouses).join(','));
    }

    if (laState.starredOnly) params.set('starred', '1');
    if (laState.showAllEvents) params.set('all', '1');

    // Only include topics if a subset is selected
    if (!laState.showAllEvents) {
        const allTopicIds = (state.topics || []).map(t => t.id);
        if (laState.activeTopicIds.size > 0 && laState.activeTopicIds.size < allTopicIds.length) {
            params.set('topics', Array.from(laState.activeTopicIds).join(','));
        }
    }

    const qs = params.toString();
    history.replaceState(null, '', '/' + parts.join('/') + (qs ? '?' + qs : ''));
}

function _restoreCalendarFromUrl() {
    const parts = window.location.pathname.slice(1).split('/');
    // parts[0] = 'calendar', parts[1] = 'week'|'list', parts[2] = YYYY-MM-DD
    const view = parts[1];
    const weekDate = parts[2];

    if (view === 'list') {
        laState.view = 'list';
    } else if (view === 'week') {
        laState.view = 'week';
        if (weekDate && /^\d{4}-\d{2}-\d{2}$/.test(weekDate)) {
            const d = new Date(weekDate + 'T00:00:00');
            if (!isNaN(d.getTime())) laState.weekStart = d;
        }
    }

    const params = new URLSearchParams(window.location.search);

    if (params.has('types')) {
        const requested = params.get('types').split(',');
        laState.enabledTypes = new Set(requested.filter(t => t in LA_COLORS));
    }
    if (params.has('houses')) {
        const requested = params.get('houses').split(',');
        laState.enabledHouses = new Set(requested.filter(h => ['Commons', 'Lords'].includes(h)));
    }
    if (params.get('starred') === '1') laState.starredOnly = true;
    if (params.get('all') === '1') laState.showAllEvents = true;
    if (params.has('topics') && !laState.showAllEvents) {
        const ids = params.get('topics').split(',').map(Number).filter(n => !isNaN(n));
        if (ids.length > 0) laState.activeTopicIds = new Set(ids);
    }
}

function _fmtDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
}

function _escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}
