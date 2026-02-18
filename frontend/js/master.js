/* Parliamentary Scanner — Master stakeholder list (Record tab) */

// Undo stack for master list deletions
let masterUndoStack = [];

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

            const topicPills = Array.from(topicSet)
                .map(t => `<span class="keyword-chip">${escapeHtml(t)}</span>`)
                .join(' ');

            tr.innerHTML = `
                <td><strong>${escapeHtml(entry.member_name)}</strong></td>
                <td>${partyPill(entry.party || '—')}</td>
                <td>${typePill(entry.member_type || '—')}</td>
                <td>${escapeHtml(entry.constituency || '—')}</td>
                <td>${topicPills || '—'}</td>
                <td>
                    <select data-master-id="${entry.id}" data-field="priority" onchange="updateMaster(${entry.id}, 'priority', this.value)">
                        <option value="" ${!entry.priority ? 'selected' : ''}>—</option>
                        <option value="High" ${entry.priority === 'High' ? 'selected' : ''}>High</option>
                        <option value="Medium" ${entry.priority === 'Medium' ? 'selected' : ''}>Medium</option>
                        <option value="Low" ${entry.priority === 'Low' ? 'selected' : ''}>Low</option>
                    </select>
                </td>
                <td>
                    <input type="text" value="${escapeHtml(entry.notes || '')}"
                           onblur="updateMaster(${entry.id}, 'notes', this.value)"
                           placeholder="Add notes...">
                </td>
                <td>${activities.length}</td>
                <td>${formatDate(latestDate)}</td>
                <td><button class="master-remove-btn" onclick="removeMasterAndRefresh(${entry.id})" title="Remove">&times;</button></td>
            `;

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
