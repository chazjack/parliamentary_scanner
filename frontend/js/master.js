/* Parliamentary Scanner — Master stakeholder list (Record tab) */

// Undo stack for master list deletions
let masterUndoStack = [];

// Cache of activities per master entry (masterId -> activities[])
const masterActivitiesCache = new Map();

async function loadMasterList() {
    // Legacy: reload master table if on Record tab
    loadMasterListTable();
}

async function loadMasterListTable() {
    const tbody = document.getElementById('masterTableBody');
    const emptyMsg = document.getElementById('masterEmpty');
    if (!tbody) return;

    try {
        const entries = await API.get('/api/master');

        if (entries.length === 0) {
            tbody.innerHTML = '';
            if (emptyMsg) emptyMsg.style.display = '';
            return;
        }

        if (emptyMsg) emptyMsg.style.display = 'none';
        tbody.innerHTML = '';
        masterActivitiesCache.clear();

        for (const entry of entries) {
            const tr = document.createElement('tr');
            tr.dataset.masterName = (entry.member_name || '').toLowerCase();
            tr.dataset.masterParty = (entry.party || '').toLowerCase();
            tr.dataset.masterConstituency = (entry.constituency || '').toLowerCase();

            const activities = entry.activities || [];

            // Collect topics across all activities
            const topicSet = new Set();
            let latestDate = '';
            for (const a of activities) {
                try {
                    const topics = JSON.parse(a.topics);
                    (Array.isArray(topics) ? topics : [topics]).forEach(t => topicSet.add(t));
                } catch (e) {}
                if ((a.activity_date || '') > latestDate) latestDate = a.activity_date;
            }

            tr.dataset.masterTopics = Array.from(topicSet).join(' ').toLowerCase();
            tr.dataset.masterId = entry.id;

            const topicPills = Array.from(topicSet)
                .map(t => `<span class="ps-badge ps-badge--accent">${escapeHtml(t)}</span>`)
                .join(' ');

            masterActivitiesCache.set(entry.id, activities);

            const actLabel = activities.length === 1 ? '1 activity' : `${activities.length} activities`;

            tr.innerHTML = `
                <td><div class="ps-member"><span class="ps-member__name">${escapeHtml(entry.member_name)}</span></div></td>
                <td>${partyPill(entry.party || '—')}</td>
                <td>${typePill(entry.member_type || '—')}</td>
                <td>${topicPills || '—'}</td>
                <td><button class="master-activities-toggle" data-master-id="${entry.id}" title="Show activities">${actLabel}</button></td>
                <td>${formatDate(latestDate)}</td>
                <td><button class="master-remove-btn" onclick="removeMasterAndRefresh(${entry.id})" title="Remove">&times;</button></td>
            `;

            const toggleBtn = tr.querySelector('.master-activities-toggle');
            if (toggleBtn) {
                toggleBtn.addEventListener('click', () => toggleMasterActivities(toggleBtn));
            }

            tbody.appendChild(tr);
        }

        // Re-apply filter if search input has a value
        filterMasterList();
    } catch (err) {
        console.error('Failed to load master list:', err);
    }
}

function filterMasterList() {
    const input = document.getElementById('masterSearchInput');
    if (!input) return;
    const query = input.value.toLowerCase().trim();
    const rows = document.querySelectorAll('#masterTableBody tr');

    rows.forEach(tr => {
        if (!query) {
            tr.style.display = '';
            return;
        }
        const name = tr.dataset.masterName || '';
        const party = tr.dataset.masterParty || '';
        const constituency = tr.dataset.masterConstituency || '';
        const topics = tr.dataset.masterTopics || '';
        const match = name.includes(query) || party.includes(query) ||
                      constituency.includes(query) || topics.includes(query);
        tr.style.display = match ? '' : 'none';
    });
}

function toggleMasterActivities(btn) {
    const masterId = parseInt(btn.dataset.masterId);
    const tr = btn.closest('tr');
    const colCount = tr.cells.length;

    const existing = tr.nextElementSibling;
    if (existing && existing.classList.contains('master-activities-row')) {
        existing.remove();
        btn.classList.remove('active');
        return;
    }

    btn.classList.add('active');

    const activities = masterActivitiesCache.get(masterId) || [];
    const subRow = document.createElement('tr');
    subRow.className = 'master-activities-row';

    let html = '<div class="master-act-list">';
    if (activities.length === 0) {
        html += '<span class="master-act-empty">No activities recorded.</span>';
    } else {
        for (const a of activities) {
            const dateStr = formatDate(a.activity_date);
            const src = SOURCE_COLOURS[a.source_type];
            const label = src ? src.label : (a.source_type || '');
            const badgeHtml = src
                ? `<span class="ps-badge" style="background:${src.bg};color:${src.color};border-color:${src.color}55">${escapeHtml(label)}</span>`
                : `<span class="ps-badge ps-badge--muted">${escapeHtml(label)}</span>`;

            const colonIdx = a.forum ? a.forum.indexOf(': ') : -1;
            const forumDetail = colonIdx >= 0 ? a.forum.slice(colonIdx + 2) : (a.forum || '');

            const summary = a.summary || '';
            const summaryTrimmed = summary.length > 120 ? summary.slice(0, 120) + '…' : summary;
            const linkHtml = a.source_url
                ? `<a href="${escapeHtml(a.source_url)}" target="_blank" class="master-act-link">View ↗</a>`
                : '';

            html += `
                <div class="master-act-item">
                    <div class="master-act-meta">
                        ${badgeHtml}
                        <span class="master-act-date">${dateStr}</span>
                        ${forumDetail ? `<span class="master-act-forum">${escapeHtml(forumDetail)}</span>` : ''}
                    </div>
                    <div class="master-act-body">
                        ${summaryTrimmed ? `<span class="master-act-summary">${escapeHtml(summaryTrimmed)}</span>` : ''}
                        ${linkHtml}
                    </div>
                </div>`;
        }
    }
    html += '</div>';

    subRow.innerHTML = `<td colspan="${colCount}">${html}</td>`;
    tr.after(subRow);
}

async function updateMaster(masterId, field, value) {
    try {
        const body = {};
        body[field] = value;
        await API.put(`/api/master/${masterId}`, body);
    } catch (err) {
        console.error('Failed to update master entry:', err);
    }
}

async function removeMasterAndRefresh(masterId) {
    try {
        // Capture data before delete for undo
        const entries = await API.get('/api/master');
        const entry = entries.find(e => e.id === masterId);
        if (entry) {
            masterUndoStack.push(entry);
            updateMasterUndoBtn();
        }

        await API.del(`/api/master/${masterId}`);
        await loadMasterListTable();
        // Also refresh masterResultIds if on scanner tab
        if (typeof refreshMasterResultIds === 'function') {
            await refreshMasterResultIds();
        }
    } catch (err) {
        console.error('Failed to remove from master list:', err);
    }
}

function updateMasterUndoBtn() {
    const btn = document.getElementById('masterUndoBtn');
    if (!btn) return;
    if (masterUndoStack.length > 0) {
        btn.style.display = '';
        btn.classList.remove('disabled');
    } else {
        btn.style.display = 'none';
        btn.classList.add('disabled');
    }
}

async function undoMasterDelete() {
    if (masterUndoStack.length === 0) return;
    const entry = masterUndoStack.pop();
    updateMasterUndoBtn();

    try {
        // Re-add the entry — use the first activity's result_id if available
        const activities = entry.activities || [];
        const firstActivity = activities[0];
        await API.post('/api/master/add', {
            result_id: firstActivity ? firstActivity.result_id : null,
            member_name: entry.member_name,
            member_id: entry.member_id || null,
            party: entry.party || '',
            member_type: entry.member_type || '',
            constituency: entry.constituency || '',
        });

        // Restore notes and priority if they were set
        if (entry.notes || entry.priority) {
            const newEntries = await API.get('/api/master');
            const restored = newEntries.find(e => e.member_name === entry.member_name);
            if (restored) {
                if (entry.priority) await API.put(`/api/master/${restored.id}`, { priority: entry.priority });
                if (entry.notes) await API.put(`/api/master/${restored.id}`, { notes: entry.notes });
            }
        }

        await loadMasterListTable();
        if (typeof refreshMasterResultIds === 'function') {
            await refreshMasterResultIds();
        }
    } catch (err) {
        console.error('Failed to undo master delete:', err);
    }
}
