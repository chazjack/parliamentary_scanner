/* Parliamentary Scanner — Master stakeholder list (Record tab) */

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
    } catch (err) {
        console.error('Failed to load master list:', err);
    }
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
