/* Groups tab — CRUD UI for MP/Peer groups */

let _editingGroupId = null;
let _groupMembers = []; // [{id, name}, ...] for the form
let _activeGroupPopoverId = null;

const _PARTY_ABBR = {
    'Conservative': 'Con', 'Labour': 'Lab', 'Liberal Democrats': 'Lib Dem',
    'Scottish National Party': 'SNP', 'Green Party': 'Green', 'Reform UK': 'Reform',
    'Independent': 'Ind', 'Plaid Cymru': 'PC', 'Democratic Unionist Party': 'DUP',
    'Sinn Féin': 'SF', 'Social Democratic & Labour Party': 'SDLP',
    'Alliance': 'Alliance', 'Ulster Unionist Party': 'UUP',
    'Alba Party': 'Alba', 'Traditional Unionist Voice': 'TUV',
    'Workers Party of Britain': 'WPB',
};

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

    body.innerHTML = state.groups.map(g => {
        const count = (g.member_ids || []).length;
        return `
        <tr>
            <td><span class="group-name-editable" onclick="startGroupNameEdit(${g.id}, this)" title="Click to rename">${_escGroup(g.name)}</span></td>
            <td><button class="group-members-btn" onclick="openGroupMembersPopover(${g.id}, this)">${count} member${count === 1 ? '' : 's'}</button></td>
            <td class="alert-actions-cell">
                <div class="alert-actions-dropdown" id="group-actions-${g.id}">
                    <button class="ps-btn ps-btn--ghost ps-btn--sm alert-actions-trigger" onclick="toggleGroupMenu(event, ${g.id})" title="Actions">&#8942;</button>
                    <div class="alert-actions-menu" id="group-menu-${g.id}" style="display:none;">
                        <button onclick="scanGroup(${g.id}); closeGroupMenu(${g.id})">Open in Scanner</button>
                        <div class="alert-menu-divider"></div>
                        <button class="alert-menu-danger" onclick="deleteGroupConfirm(${g.id}); closeGroupMenu(${g.id})">Delete</button>
                    </div>
                </div>
            </td>
        </tr>`;
    }).join('');
}

// ---- Inline name editing ----

function startGroupNameEdit(groupId, el) {
    const group = state.groups.find(g => g.id === groupId);
    if (!group) return;

    const input = document.createElement('input');
    input.className = 'ps-input ps-input--sm group-name-input';
    input.value = group.name;
    el.replaceWith(input);
    input.focus();
    input.select();

    let saved = false;

    async function save() {
        if (saved) return;
        saved = true;
        const newName = input.value.trim();
        if (!newName || newName === group.name) {
            renderGroupsList();
            return;
        }
        try {
            await API.put(`/api/groups/${groupId}`, {
                name: newName,
                member_ids: group.member_ids || [],
                member_names: group.member_names || [],
            });
            await loadGroups();
        } catch (e) {
            const msg = e.message || '';
            if (msg.includes('400')) alert(`A group named "${newName}" already exists.`);
            else console.error(e);
            renderGroupsList();
        }
    }

    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur();
        if (e.key === 'Escape') {
            saved = true;
            renderGroupsList();
        }
    });
}

// ---- Three-dot actions menu ----

function toggleGroupMenu(e, groupId) {
    e.stopPropagation();
    document.querySelectorAll('.alert-actions-menu').forEach(m => {
        if (m.id !== `group-menu-${groupId}`) m.style.display = 'none';
    });
    const menu = document.getElementById(`group-menu-${groupId}`);
    if (!menu) return;
    const isHidden = menu.style.display === 'none' || menu.style.display === '';
    if (isHidden) {
        const rect = e.currentTarget.getBoundingClientRect();
        menu.style.display = 'block';
        const menuW = menu.offsetWidth;
        const left = Math.max(8, rect.right - menuW);
        menu.style.top = (rect.bottom + 4) + 'px';
        menu.style.left = left + 'px';
    } else {
        menu.style.display = 'none';
    }
}

function closeGroupMenu(groupId) {
    const menu = document.getElementById(`group-menu-${groupId}`);
    if (menu) menu.style.display = 'none';
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

        function renderDropdown(members) {
            if (!members || members.length === 0) {
                dropdown.innerHTML = '<div class="member-autocomplete__empty">No results found</div>';
                dropdown.style.display = '';
                return;
            }
            const alreadySelected = new Set(_groupMembers.map(m => m.id));
            let html = '';
            for (const m of members) {
                const party = _PARTY_ABBR[m.party] || m.party || '';
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

// ---- Group members popover ----

function openGroupMembersPopover(groupId, anchorEl) {
    if (_activeGroupPopoverId === groupId) {
        closeGroupMembersPopover();
        return;
    }

    const group = state.groups.find(g => g.id === groupId);
    if (!group) return;

    _activeGroupPopoverId = groupId;

    const popover = document.getElementById('groupMembersPopover');
    document.getElementById('groupPopoverTitle').textContent = group.name;
    _renderGroupPopoverMembers(group);

    const input = document.getElementById('groupPopoverSearchInput');
    const dropdown = document.getElementById('groupPopoverDropdown');
    if (input) input.value = '';
    if (dropdown) { dropdown.style.display = 'none'; dropdown.innerHTML = ''; }

    const rect = anchorEl.getBoundingClientRect();
    popover.style.display = 'block';
    const popW = popover.offsetWidth;
    const viewW = window.innerWidth;
    let left = rect.left;
    if (left + popW > viewW - 16) left = viewW - popW - 16;
    popover.style.top = (rect.bottom + 6) + 'px';
    popover.style.left = Math.max(8, left) + 'px';

    setTimeout(() => { if (input) input.focus(); }, 50);
}

function closeGroupMembersPopover() {
    _activeGroupPopoverId = null;
    document.getElementById('groupMembersPopover').style.display = 'none';
}

function _renderGroupPopoverMembers(group) {
    const container = document.getElementById('groupPopoverMembers');
    if (!container) return;
    const members = (group.member_ids || []).map((id, i) => ({
        id: String(id),
        name: (group.member_names || [])[i] || String(id),
    }));
    if (!members.length) {
        container.innerHTML = '<span class="topic-popover__empty">No members yet.</span>';
        return;
    }
    container.innerHTML = members.map(m =>
        `<span class="keyword-chip">
            ${_escGroup(m.name)}
            <span class="remove-kw" onclick="_removeGroupMemberFromPopover('${_escGroup(m.id)}')">&times;</span>
        </span>`
    ).join('');
}

async function _removeGroupMemberFromPopover(memberId) {
    if (_activeGroupPopoverId === null) return;
    const group = state.groups.find(g => g.id === _activeGroupPopoverId);
    if (!group) return;

    const newIds = (group.member_ids || []).filter(id => String(id) !== String(memberId));
    const newNames = (group.member_names || []).filter((_, i) =>
        String((group.member_ids || [])[i]) !== String(memberId)
    );

    try {
        await API.put(`/api/groups/${_activeGroupPopoverId}`, {
            name: group.name,
            member_ids: newIds,
            member_names: newNames,
        });
        await loadGroups();
        const updated = state.groups.find(g => g.id === _activeGroupPopoverId);
        if (updated) _renderGroupPopoverMembers(updated);
    } catch (e) {
        console.error('Failed to remove member:', e);
    }
}

async function _addGroupMemberToPopover(id, name) {
    if (_activeGroupPopoverId === null) return;
    const group = state.groups.find(g => g.id === _activeGroupPopoverId);
    if (!group) return;

    if ((group.member_ids || []).some(mid => String(mid) === String(id))) return;

    try {
        await API.put(`/api/groups/${_activeGroupPopoverId}`, {
            name: group.name,
            member_ids: [...(group.member_ids || []), id],
            member_names: [...(group.member_names || []), name],
        });

        const input = document.getElementById('groupPopoverSearchInput');
        const dropdown = document.getElementById('groupPopoverDropdown');
        if (input) { input.value = ''; input.focus(); }
        if (dropdown) dropdown.style.display = 'none';

        await loadGroups();
        const updated = state.groups.find(g => g.id === _activeGroupPopoverId);
        if (updated) _renderGroupPopoverMembers(updated);
    } catch (e) {
        console.error('Failed to add member:', e);
    }
}

// Close popover when clicking outside
document.addEventListener('click', (e) => {
    if (_activeGroupPopoverId === null) return;
    const popover = document.getElementById('groupMembersPopover');
    if (!popover.contains(e.target) && !e.target.closest('.group-members-btn')) {
        closeGroupMembersPopover();
    }
});

// ---- Member autocomplete for popover ----

(function initGroupPopoverAutocomplete() {
    function setup() {
        const input = document.getElementById('groupPopoverSearchInput');
        const dropdown = document.getElementById('groupPopoverDropdown');
        if (!input || !dropdown) return;

        let debounceTimer = null;

        function renderDropdown(members) {
            if (!members || members.length === 0) {
                dropdown.innerHTML = '<div class="member-autocomplete__empty">No results found</div>';
                dropdown.style.display = '';
                return;
            }
            const group = _activeGroupPopoverId ? state.groups.find(g => g.id === _activeGroupPopoverId) : null;
            const alreadySelected = new Set((group ? (group.member_ids || []) : []).map(id => String(id)));
            let html = '';
            for (const m of members) {
                const party = _PARTY_ABBR[m.party] || m.party || '';
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
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    _addGroupMemberToPopover(item.dataset.id, item.dataset.name);
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
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setup);
    } else {
        setup();
    }
})();
