/* Parliamentary Scanner — Look Ahead (upcoming events) */

const LA_COLORS = {
    debate:            { bg: '#dbeafe', border: '#2563eb', text: '#1e40af', label: 'Debate' },
    oral_questions:    { bg: '#ede9fe', border: '#7c3aed', text: '#5b21b6', label: 'Oral Qs' },
    committee:         { bg: '#cffafe', border: '#0891b2', text: '#155e75', label: 'Committee' },
    bill_stage:        { bg: '#fee2e2', border: '#dc2626', text: '#991b1b', label: 'Bill Stage' },
    westminster_hall:  { bg: '#fef9c3', border: '#ca8a04', text: '#854d0e', label: 'Westminster Hall' },
    statement:         { bg: '#dcfce7', border: '#16a34a', text: '#166534', label: 'Statement' },
    general_committee: { bg: '#f3e8ff', border: '#9333ea', text: '#6b21a8', label: 'Gen. Committee' },
};

const laState = {
    weekStart: null,
    view: 'week',
    events: [],
    eventsByDate: {},
    showAll: true,
    starredOnly: false,
    enabledTypes: new Set([
        'debate', 'oral_questions', 'committee', 'bill_stage',
        'westminster_hall', 'statement', 'general_committee',
    ]),
    enabledHouses: new Set(['Commons', 'Lords']),
    initialized: false,
    loading: false,
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

    }
    _renderLaTopicPills();
    _loadLaEvents();
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
            _loadLaEvents();
        });
    });

    // Event type checkboxes
    document.querySelectorAll('.la-type-checkbox').forEach(cb => {
        cb.addEventListener('change', () => {
            if (cb.checked) {
                laState.enabledTypes.add(cb.dataset.type);
            } else {
                laState.enabledTypes.delete(cb.dataset.type);
            }
            _renderLaView();
        });
    });

    // House checkboxes
    document.querySelectorAll('.la-house-checkbox').forEach(cb => {
        cb.addEventListener('change', () => {
            if (cb.checked) {
                laState.enabledHouses.add(cb.dataset.house);
            } else {
                laState.enabledHouses.delete(cb.dataset.house);
            }
            _renderLaView();
        });
    });

    // Show all checkbox
    document.getElementById('laShowAll').addEventListener('change', (e) => {
        laState.showAll = e.target.checked;
        _updateTopicCheckboxState();
        _loadLaEvents();
    });

    // Starred only checkbox
    document.getElementById('laStarredOnly').addEventListener('change', (e) => {
        laState.starredOnly = e.target.checked;
        _renderLaView();
    });

    // Refresh
    document.getElementById('laRefreshBtn').addEventListener('click', _forceRefresh);
}

// --- Data loading ---

async function _loadLaEvents() {
    if (laState.loading) return;
    laState.loading = true;

    const start = _fmtDate(laState.weekStart);
    let endDate;
    if (laState.view === 'list') {
        endDate = new Date(laState.weekStart);
        endDate.setDate(endDate.getDate() + 90);
    } else {
        endDate = new Date(laState.weekStart);
        endDate.setDate(endDate.getDate() + 6);
    }
    const end = _fmtDate(endDate);

    // Build topic_ids param
    let topicParam = '';
    if (!laState.showAll) {
        topicParam = _getSelectedTopicIds().join(',');
    }

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
        btn.textContent = '\u21BB Refresh';
    }
}

// --- Rendering ---

function _renderLaView() {
    // Client-side filter by type, house, starred
    const filtered = laState.events.filter(ev =>
        laState.enabledTypes.has(ev.event_type) &&
        laState.enabledHouses.has(ev.house) &&
        (!laState.starredOnly || ev.is_starred)
    );

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

function _renderWeekView(events) {
    const container = document.getElementById('la-week-view');
    container.innerHTML = '';

    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const todayStr = _fmtDate(new Date());

    // Group filtered events by date
    const byDate = {};
    for (const ev of events) {
        if (!byDate[ev.start_date]) byDate[ev.start_date] = [];
        byDate[ev.start_date].push(ev);
    }

    for (let i = 0; i < 5; i++) {
        const dayDate = new Date(laState.weekStart);
        dayDate.setDate(dayDate.getDate() + i);
        const dateStr = _fmtDate(dayDate);
        const dayEvents = byDate[dateStr] || [];

        const col = document.createElement('div');
        col.className = 'la-day-column';
        if (dateStr === todayStr) col.classList.add('la-today');

        const header = document.createElement('div');
        header.className = 'la-day-header';
        header.innerHTML = `
            <span class="la-day-name">${dayNames[i]}</span>
            <span class="la-day-date">${dayDate.getDate()} ${monthNames[dayDate.getMonth()]}</span>
            <span class="la-day-count">${dayEvents.length}</span>
        `;
        col.appendChild(header);

        if (dayEvents.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'la-no-events';
            empty.textContent = 'No events';
            col.appendChild(empty);
        } else {
            dayEvents.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
            const eventsWrap = document.createElement('div');
            eventsWrap.className = 'la-day-events';
            for (const ev of dayEvents) {
                eventsWrap.appendChild(_createEventCard(ev));
            }
            col.appendChild(eventsWrap);
        }

        container.appendChild(col);
    }
}


function _createEventCard(ev) {
    const colors = LA_COLORS[ev.event_type] || LA_COLORS.debate;
    const card = document.createElement('div');
    card.className = 'la-event-card';
    card.style.borderLeftColor = colors.border;
    card.style.background = colors.bg;

    const timeStr = ev.start_time
        ? `<span class="la-event-time">${ev.start_time}${ev.end_time ? ' – ' + ev.end_time : ''}</span>`
        : '';

    let titleText = _escHtml(ev.title);
    // Truncate long titles
    if (titleText.length > 120) {
        titleText = titleText.substring(0, 117) + '...';
    }

    const url = ev.source_url || '';
    const titleHtml = url
        ? `<a href="${_escHtml(url)}" target="_blank" rel="noopener" class="la-event-link">${titleText}</a>`
        : titleText;

    const starClass = ev.is_starred ? 'la-star-btn starred' : 'la-star-btn';
    const starChar = ev.is_starred ? '\u2605' : '\u2606';

    card.innerHTML = `
        ${timeStr}
        <div class="la-event-title">${titleHtml}</div>
        <div class="la-event-meta">
            <span class="la-event-type-badge" style="background:${colors.border}">${colors.label}</span>
            <span class="la-event-house">${_escHtml(ev.house || '')}</span>
            <button class="${starClass}" data-event-id="${_escHtml(ev.id)}" title="Star this event">${starChar}</button>
        </div>
    `;

    // Committee / inquiry info
    if (ev.committee_name) {
        const detail = document.createElement('div');
        detail.className = 'la-event-detail';
        detail.textContent = ev.committee_name;
        if (ev.inquiry_name) {
            detail.textContent += ': ' + ev.inquiry_name;
        }
        card.querySelector('.la-event-title').after(detail);
    }

    // Star button handler
    const starBtn = card.querySelector('.la-star-btn');
    starBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        _toggleStar(ev.id, ev.is_starred, starBtn);
    });

    return card;
}

function _renderListView(events) {
    const tbody = document.getElementById('laListBody');
    tbody.innerHTML = '';

    if (events.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state-preview">No upcoming events match your filters.</td></tr>';
        return;
    }

    events.sort((a, b) => {
        const cmp = (a.start_date || '').localeCompare(b.start_date || '');
        if (cmp !== 0) return cmp;
        return (a.start_time || '').localeCompare(b.start_time || '');
    });

    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

    for (const ev of events) {
        const colors = LA_COLORS[ev.event_type] || LA_COLORS.debate;
        const tr = document.createElement('tr');

        // Format date nicely
        const d = new Date(ev.start_date + 'T00:00:00');
        const dateStr = `${dayNames[d.getDay()]} ${d.getDate()} ${monthNames[d.getMonth()]}`;

        let titleText = _escHtml(ev.title);
        if (titleText.length > 150) titleText = titleText.substring(0, 147) + '...';

        const url = ev.source_url || '';
        const titleHtml = url
            ? `<a href="${_escHtml(url)}" target="_blank" rel="noopener" class="quote-link">${titleText}</a>`
            : titleText;

        // Committee detail
        let detail = '';
        if (ev.committee_name) {
            detail = `<div class="la-list-detail">${_escHtml(ev.committee_name)}${ev.inquiry_name ? ': ' + _escHtml(ev.inquiry_name) : ''}</div>`;
        }

        const timeStr = ev.start_time
            ? `${ev.start_time}${ev.end_time ? ' – ' + ev.end_time : ''}`
            : '';

        const starClass = ev.is_starred ? 'la-star-btn starred' : 'la-star-btn';
        const starChar = ev.is_starred ? '\u2605' : '\u2606';

        tr.innerHTML = `
            <td class="la-list-date">${dateStr}</td>
            <td>${timeStr}</td>
            <td>${titleHtml}${detail}</td>
            <td><span class="la-event-type-badge" style="background:${colors.border}">${colors.label}</span></td>
            <td>${_escHtml(ev.house || '')}</td>
            <td>${_escHtml(ev.location || '')}</td>
            <td><button class="${starClass}" data-event-id="${_escHtml(ev.id)}" title="Star this event">${starChar}</button></td>
        `;

        // Star handler
        const starBtn = tr.querySelector('.la-star-btn');
        starBtn.addEventListener('click', () => {
            _toggleStar(ev.id, ev.is_starred, starBtn);
        });

        tbody.appendChild(tr);
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

        // Update local state
        const ev = laState.events.find(e => e.id === eventId);
        if (ev) ev.is_starred = isCurrentlyStarred ? 0 : 1;

        // Update button
        if (isCurrentlyStarred) {
            btnEl.classList.remove('starred');
            btnEl.textContent = '\u2606';
        } else {
            btnEl.classList.add('starred');
            btnEl.textContent = '\u2605';
        }
    } catch (err) {
        console.error('Failed to toggle star:', err);
    }
}

// --- Topic checkboxes ---

function _renderLaTopicPills() {
    const container = document.getElementById('laTopicCheckboxes');
    if (!container) return;
    container.innerHTML = '';

    if (!state.topics || state.topics.length === 0) return;

    for (const topic of state.topics) {
        const label = document.createElement('label');
        label.className = 'la-filter-item la-topic-filter-item';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = true;
        cb.dataset.topicId = topic.id;
        cb.addEventListener('change', () => {
            if (!laState.showAll) {
                _loadLaEvents();
            }
        });

        label.appendChild(cb);
        label.appendChild(document.createTextNode('\u00a0' + topic.name));
        container.appendChild(label);
    }

    _updateTopicCheckboxState();
}

function _updateTopicCheckboxState() {
    const container = document.getElementById('laTopicCheckboxes');
    if (!container) return;
    container.style.opacity = laState.showAll ? '0.4' : '1';
    container.style.pointerEvents = laState.showAll ? 'none' : '';
}

function _getSelectedTopicIds() {
    const checkboxes = document.querySelectorAll('#laTopicCheckboxes input[type="checkbox"]:checked');
    return Array.from(checkboxes).map(cb => parseInt(cb.dataset.topicId));
}

// --- UI helpers ---

function _updateDateLabel() {
    const label = document.getElementById('laDateLabel');
    if (!label) return;

    const start = laState.weekStart;
    const end = new Date(start);
    end.setDate(end.getDate() + 6);

    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const todayMon = new Date();
    todayMon.setDate(todayMon.getDate() - ((todayMon.getDay() + 6) % 7));
    todayMon.setHours(0, 0, 0, 0);

    if (_fmtDate(start) === _fmtDate(todayMon)) {
        label.textContent = 'This Week';
    } else {
        const nextMon = new Date(todayMon);
        nextMon.setDate(nextMon.getDate() + 7);
        if (_fmtDate(start) === _fmtDate(nextMon)) {
            label.textContent = 'Next Week';
        } else {
            label.textContent = `${start.getDate()} ${monthNames[start.getMonth()]} – ${end.getDate()} ${monthNames[end.getMonth()]}`;
        }
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
