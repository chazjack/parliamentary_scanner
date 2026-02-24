/* Groups tab — CRUD UI for MP/Peer groups */

let _editingGroupId = null;
let _groupMembers = []; // [{id, name}, ...] for the form

// ---- Utility ----

function _escGroup(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ---- Load & Render ----

async function loadGroups() {
    try {
        state.groups = await API.get('/api/groups');
        renderGroupsList();
    } catch (e) {
        console.error('Failed to load groups:', e);
    }
}

function renderGroupsList() {
    const body = document.getElementById('groupsTableBody');
    if (!body) return;

    if (!state.groups.length) {
        body.innerHTML = '<tr><td colspan="3" class="empty-state-preview">No groups yet. Create one to get started.</td></tr>';
        return;
    }

    body.innerHTML = state.groups.map(g => `
        <tr>
            <td><strong>${_escGroup(g.name)}</strong></td>
            <td>${(g.member_ids || []).length} member${(g.member_ids || []).length === 1 ? '' : 's'}</td>
            <td style="white-space:nowrap;">
                <button class="ps-btn ps-btn--ghost ps-btn--sm" onclick="scanGroup(${g.id})" title="Open in Scanner">Scan</button>
                <button class="ps-btn ps-btn--ghost ps-btn--sm" onclick="editGroup(${g.id})" title="Edit">Edit</button>
                <button class="ps-btn ps-btn--ghost ps-btn--sm" style="color:var(--ps-danger);" onclick="deleteGroupConfirm(${g.id})" title="Delete">Delete</button>
            </td>
        </tr>
    `).join('');
}

// ---- Form ----

function showGroupForm(groupId) {
    _editingGroupId = groupId ?? null;
    const formSection = document.getElementById('groupFormSection');
    const listSection = document.getElementById('groupsListSection');
    const title = document.getElementById('groupFormTitle');

    if (_editingGroupId) {
        const group = state.groups.find(g => g.id === _editingGroupId);
        if (!group) return;
        title.textContent = `Edit: ${group.name}`;
        document.getElementById('groupName').value = group.name;
        _groupMembers = (group.member_ids || []).map((id, i) => ({
            id: String(id),
            name: group.member_names[i] || String(id),
        }));
    } else {
        title.textContent = 'New Group';
        document.getElementById('groupName').value = '';
        _groupMembers = [];
    }

    _renderGroupMemberPills();
    listSection.style.display = 'none';
    formSection.style.display = '';
    document.getElementById('groupName').focus();
}

function hideGroupForm() {
    document.getElementById('groupFormSection').style.display = 'none';
    document.getElementById('groupsListSection').style.display = '';
    _editingGroupId = null;
    _groupMembers = [];
    // Clear search input
    const input = document.getElementById('groupMemberSearchInput');
    const dropdown = document.getElementById('groupMemberDropdown');
    if (input) input.value = '';
    if (dropdown) { dropdown.style.display = 'none'; dropdown.innerHTML = ''; }
}

function _renderGroupMemberPills() {
    const container = document.getElementById('groupMemberPills');
    if (!container) return;
    if (!_groupMembers.length) {
        container.innerHTML = '';
        return;
    }
    container.innerHTML = _groupMembers.map(m => `
        <span class="member-selected-pill" data-id="${_escGroup(m.id)}">
            <span class="member-selected-pill__name">${_escGroup(m.name)}</span>
            <button class="member-selected-pill__clear" data-id="${_escGroup(m.id)}" title="Remove" onclick="removeGroupMember('${_escGroup(m.id)}')">&#x2715;</button>
        </span>
    `).join('');
}

function removeGroupMember(id) {
    _groupMembers = _groupMembers.filter(m => m.id !== String(id));
    _renderGroupMemberPills();
}

function _addGroupMember(id, name) {
    if (_groupMembers.some(m => m.id === String(id))) return;
    _groupMembers.push({ id: String(id), name });
    _renderGroupMemberPills();
    const input = document.getElementById('groupMemberSearchInput');
    const dropdown = document.getElementById('groupMemberDropdown');
    if (input) { input.value = ''; input.focus(); }
    if (dropdown) dropdown.style.display = 'none';
}

async function saveGroup() {
    const name = (document.getElementById('groupName').value || '').trim();
    if (!name) {
        alert('Please enter a group name.');
        return;
    }

    const payload = {
        name,
        member_ids: _groupMembers.map(m => m.id),
        member_names: _groupMembers.map(m => m.name),
    };

    try {
        if (_editingGroupId) {
            await API.put(`/api/groups/${_editingGroupId}`, payload);
        } else {
            await API.post('/api/groups', payload);
        }
        hideGroupForm();
        await loadGroups();
    } catch (e) {
        const msg = e.message || '';
        if (msg.includes('400')) {
            alert(`A group named "${name}" already exists.`);
        } else {
            alert('Failed to save group. Please try again.');
            console.error(e);
        }
    }
}

async function deleteGroupConfirm(id) {
    const group = state.groups.find(g => g.id === id);
    if (!group) return;
    if (!confirm(`Delete group "${group.name}"? This cannot be undone.`)) return;
    try {
        await API.del(`/api/groups/${id}`);
        await loadGroups();
    } catch (e) {
        alert('Failed to delete group.');
        console.error(e);
    }
}

function editGroup(id) {
    showGroupForm(id);
}

// ---- "Scan this group" button ----

function scanGroup(id) {
    const group = state.groups.find(g => g.id === id);
    if (!group) return;
    switchTab('scanner');
    // Programmatically select the group in the scanner member search
    if (typeof addGroupToScanner === 'function') {
        addGroupToScanner(group);
    }
}

// ---- Member autocomplete within groups form ----

(function initGroupMemberAutocomplete() {
    // Defer until DOM is ready
    function setup() {
        const input = document.getElementById('groupMemberSearchInput');
        const dropdown = document.getElementById('groupMemberDropdown');
        if (!input || !dropdown) return;

        let debounceTimer = null;

        const PARTY_ABBR = {
            'Conservative': 'Con', 'Labour': 'Lab', 'Liberal Democrats': 'Lib Dem',
            'Scottish National Party': 'SNP', 'Green Party': 'Green', 'Reform UK': 'Reform',
            'Independent': 'Ind', 'Plaid Cymru': 'PC', 'Democratic Unionist Party': 'DUP',
            'Sinn Féin': 'SF', 'Social Democratic & Labour Party': 'SDLP',
            'Alliance': 'Alliance', 'Ulster Unionist Party': 'UUP',
            'Alba Party': 'Alba', 'Traditional Unionist Voice': 'TUV',
            'Workers Party of Britain': 'WPB',
        };

        function renderDropdown(members) {
            if (!members || members.length === 0) {
                dropdown.innerHTML = '<div class="member-autocomplete__empty">No results found</div>';
                dropdown.style.display = '';
                return;
            }
            const alreadySelected = new Set(_groupMembers.map(m => m.id));
            let html = '';
            for (const m of members) {
                const party = PARTY_ABBR[m.party] || m.party || '';
                const type = m.member_type || '';
                const meta = [party, type].filter(Boolean).join(' · ');
                const dimmed = alreadySelected.has(String(m.id)) ? ' style="opacity:0.45;"' : '';
                html += `<div class="member-autocomplete__item" data-id="${_escGroup(String(m.id))}" data-name="${_escGroup(m.name)}"${dimmed}>
                    <span class="member-autocomplete__item-name">${_escGroup(m.name)}</span>
                    ${meta ? `<span class="member-autocomplete__item-meta">${_escGroup(meta)}</span>` : ''}
                </div>`;
            }
            dropdown.innerHTML = html;
            dropdown.style.display = '';

            dropdown.querySelectorAll('.member-autocomplete__item').forEach(item => {
                item.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    _addGroupMember(item.dataset.id, item.dataset.name);
                });
            });
        }

        async function doSearch(q) {
            try {
                const members = await API.get(`/api/scans/members/search?q=${encodeURIComponent(q)}`);
                renderDropdown(members);
            } catch (e) {
                dropdown.style.display = 'none';
            }
        }

        input.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            const q = input.value.trim();
            if (q.length < 2) { dropdown.style.display = 'none'; return; }
            debounceTimer = setTimeout(() => doSearch(q), 300);
        });

        input.addEventListener('focus', () => {
            const q = input.value.trim();
            if (q.length >= 2 && dropdown.innerHTML.trim()) dropdown.style.display = '';
        });

        document.addEventListener('click', (e) => {
            const wrap = document.getElementById('groupMemberAutocomplete');
            if (wrap && !wrap.contains(e.target)) dropdown.style.display = 'none';
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setup);
    } else {
        setup();
    }
})();
