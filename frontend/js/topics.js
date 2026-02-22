/* Parliamentary Scanner — Topic management UI */

// Track which topics are checked (by ID). Empty set means none checked by default.
let checkedTopicIds = new Set();

// Undo stack for topic/keyword changes
let undoStack = [];

// Currently open popover topic id
let activePopoverTopicId = null;

function pushUndo(action) {
    undoStack.push(action);
    updateUndoButton();
}

function updateUndoButton() {
    const btn = document.getElementById('undoBtn');
    if (btn) {
        btn.classList.toggle('disabled', undoStack.length === 0);
    }
}

async function loadTopics() {
    state.topics = await API.get('/api/topics');
    renderTopics();
}

function renderTopics() {
    renderTopicChips();
    // If a popover is open, refresh its contents in place
    if (activePopoverTopicId !== null) {
        const topic = state.topics.find(t => t.id === activePopoverTopicId);
        if (topic) {
            const titleEl = document.querySelector('.topic-popover__title');
            if (titleEl && titleEl.tagName !== 'INPUT') {
                titleEl.textContent = topic.name;
                titleEl.onclick = (e) => { e.stopPropagation(); startRenamePopover(activePopoverTopicId); };
            }
            renderPopoverKeywords(topic);
        } else {
            closeTopicPopover();
        }
    }
}

function renderTopicChips() {
    const container = document.getElementById('topicChipGroup');
    if (!container) return;
    container.innerHTML = state.topics.map(topic => {
        const isActive = checkedTopicIds.has(topic.id);
        const kwCount = topic.keywords.length;
        const isOpen = activePopoverTopicId === topic.id;
        return `
            <span class="ps-chip-topic-wrap${isActive ? ' ps-chip-topic-wrap--active' : ''}">
                <button class="ps-chip${isActive ? ' ps-chip--active' : ''}"
                        data-topic-id="${topic.id}"
                        onclick="toggleTopicChip(${topic.id}, this)"
                        title="${kwCount} keyword${kwCount !== 1 ? 's' : ''}">${escapeHtml(topic.name)}</button>
                <button class="ps-chip-edit${isOpen ? ' open' : ''}" data-topic-id="${topic.id}"
                        onclick="openTopicPopover(${topic.id}, this)"
                        title="Edit keywords">
                    <span class="chip-arrow">›</span>
                </button>
            </span>`;
    }).join('');
}

// ── Popover ──────────────────────────────────────────────────────────────────

function openTopicPopover(topicId, anchorEl) {
    const topic = state.topics.find(t => t.id === topicId);
    if (!topic) return;

    // If clicking the same topic's edit btn, toggle closed
    if (activePopoverTopicId === topicId) {
        closeTopicPopover();
        return;
    }

    // Measure position BEFORE re-rendering (anchorEl gets detached after renderTopicChips)
    const rect = anchorEl.closest('.ps-chip-topic-wrap').getBoundingClientRect();

    activePopoverTopicId = topicId;
    renderTopicChips(); // re-render to apply .open class on arrow

    const popover = document.getElementById('topicPopover');
    const titleEl = document.querySelector('.topic-popover__title');
    titleEl.textContent = topic.name;
    titleEl.onclick = (e) => { e.stopPropagation(); startRenamePopover(topicId); };

    renderPopoverKeywords(topic);

    // Wire up delete button
    const delBtn = document.getElementById('topicPopoverDelete');
    delBtn.onclick = () => deleteTopicFromPopover(topicId);

    // Wire up enter key on input
    const input = document.getElementById('topicPopoverInput');
    input.value = '';
    input.onkeydown = (e) => { if (e.key === 'Enter') addKeywordFromPopover(); };

    // Position popover below the anchor
    popover.style.display = 'block';
    popover.style.position = 'fixed';
    const popW = popover.offsetWidth;
    const viewW = window.innerWidth;
    let left = rect.left;
    if (left + popW > viewW - 16) left = viewW - popW - 16;

    popover.style.top = (rect.bottom + 6) + 'px';
    popover.style.left = Math.max(8, left) + 'px';

    setTimeout(() => input.focus(), 50);
}

function renderPopoverKeywords(topic) {
    const container = document.getElementById('topicPopoverKeywords');
    if (!container) return;
    if (topic.keywords.length === 0) {
        container.innerHTML = '<span class="topic-popover__empty">No keywords yet — add one below.</span>';
        return;
    }
    container.innerHTML = topic.keywords.map(kw =>
        `<span class="keyword-chip">
            ${escapeHtml(kw)}
            <span class="remove-kw" onclick="removeKeyword(${topic.id}, '${escapeAttr(kw)}')">&times;</span>
        </span>`
    ).join('');
}

function closeTopicPopover() {
    activePopoverTopicId = null;
    document.getElementById('topicPopover').style.display = 'none';
    renderTopicChips(); // re-render to remove .open class from arrow
}

async function addKeywordFromPopover() {
    if (activePopoverTopicId === null) return;
    const input = document.getElementById('topicPopoverInput');
    const kw = input.value.trim();
    if (!kw) return;

    const topic = state.topics.find(t => t.id === activePopoverTopicId);
    if (!topic) return;

    const updated = [...topic.keywords, kw];
    pushUndo({ type: 'remove_keyword', topicId: activePopoverTopicId, keyword: kw });
    await API.put(`/api/topics/${activePopoverTopicId}/keywords`, { keywords: updated });
    input.value = '';
    await loadTopics();
}

async function deleteTopicFromPopover(topicId) {
    if (!confirm('Delete this topic and all its keywords?')) return;
    const topic = state.topics.find(t => t.id === topicId);
    pushUndo({ type: 'restore_topic', name: topic.name, keywords: [...topic.keywords] });
    closeTopicPopover();
    await API.del(`/api/topics/${topicId}`);
    await loadTopics();
}

// Close popover when clicking outside
document.addEventListener('click', (e) => {
    if (activePopoverTopicId === null) return;
    const popover = document.getElementById('topicPopover');
    if (!popover.contains(e.target) && !e.target.closest('.ps-chip-edit')) {
        closeTopicPopover();
    }
});

// ── Chip toggle ───────────────────────────────────────────────────────────────

function toggleTopicChip(topicId, btn) {
    const wrap = btn.closest('.ps-chip-topic-wrap');
    if (checkedTopicIds.has(topicId)) {
        checkedTopicIds.delete(topicId);
        btn.classList.remove('ps-chip--active');
        wrap && wrap.classList.remove('ps-chip-topic-wrap--active');
    } else {
        checkedTopicIds.add(topicId);
        btn.classList.add('ps-chip--active');
        wrap && wrap.classList.add('ps-chip-topic-wrap--active');
    }
    _syncToggleAllBtn();
}

function toggleAllTopics(checked) {
    if (checked) {
        checkedTopicIds = new Set(state.topics.map(t => t.id));
    } else {
        checkedTopicIds = new Set();
    }
    document.querySelectorAll('#topicChipGroup .ps-chip').forEach(chip => {
        chip.classList.toggle('ps-chip--active', checked);
        const wrap = chip.closest('.ps-chip-topic-wrap');
        wrap && wrap.classList.toggle('ps-chip-topic-wrap--active', checked);
    });
    _syncToggleAllBtn();
}

function toggleAllTopicsBtn() {
    const allSelected = state.topics.length > 0 && checkedTopicIds.size === state.topics.length;
    toggleAllTopics(!allSelected);
}

function _syncToggleAllBtn() {
    const btn = document.getElementById('topicToggleAllBtn');
    if (!btn) return;
    const allSelected = state.topics.length > 0 && checkedTopicIds.size === state.topics.length;
    btn.textContent = allSelected ? 'None' : 'All';
}

// ── Keyword actions ───────────────────────────────────────────────────────────

async function addKeyword(topicId) {
    const input = document.getElementById(`kw-input-${topicId}`);
    const kw = input.value.trim();
    if (!kw) return;

    const topic = state.topics.find(t => t.id === topicId);
    if (!topic) return;

    const updated = [...topic.keywords, kw];
    pushUndo({ type: 'remove_keyword', topicId, keyword: kw });
    await API.put(`/api/topics/${topicId}/keywords`, { keywords: updated });
    input.value = '';
    await loadTopics();
}

async function removeKeyword(topicId, keyword) {
    const topic = state.topics.find(t => t.id === topicId);
    if (!topic) return;

    const updated = topic.keywords.filter(k => k !== keyword);
    pushUndo({ type: 'add_keyword', topicId, keyword });
    await API.put(`/api/topics/${topicId}/keywords`, { keywords: updated });
    await loadTopics();
}

async function deleteTopic(topicId) {
    if (!confirm('Delete this topic and all its keywords?')) return;
    const topic = state.topics.find(t => t.id === topicId);
    pushUndo({ type: 'restore_topic', name: topic.name, keywords: [...topic.keywords] });
    await API.del(`/api/topics/${topicId}`);
    await loadTopics();
}

// ── Rename topic ──────────────────────────────────────────────────────────────

async function renameTopic(topicId, newName) {
    newName = newName.trim();
    if (!newName) return;
    const topic = state.topics.find(t => t.id === topicId);
    if (!topic || newName === topic.name) return;
    await API.put(`/api/topics/${topicId}`, { name: newName });
    await loadTopics();
    renderTopicsPage();
}

function startRenameCard(topicId) {
    const card = document.querySelector(`.topics-page-card[data-topic-id="${topicId}"]`);
    if (!card) return;
    const nameEl = card.querySelector('.topics-page-card__name');
    if (!nameEl) return;
    const oldName = nameEl.textContent;

    const input = document.createElement('input');
    input.className = 'ps-input topics-page-card__name-input';
    input.value = oldName;
    nameEl.replaceWith(input);
    input.select();

    let committed = false;

    async function commit() {
        if (committed) return;
        committed = true;
        const newName = input.value.trim();
        if (newName && newName !== oldName) {
            await renameTopic(topicId, newName);
        } else {
            restoreName();
        }
    }

    function restoreName() {
        if (!input.parentNode) return;
        const span = document.createElement('span');
        span.className = 'topics-page-card__name';
        span.title = 'Click to rename';
        span.textContent = oldName;
        span.onclick = () => startRenameCard(topicId);
        input.replaceWith(span);
    }

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { committed = true; restoreName(); }
    });
}

function startRenamePopover(topicId) {
    const titleEl = document.querySelector('.topic-popover__title');
    if (!titleEl || titleEl.tagName === 'INPUT') return;
    const oldName = titleEl.textContent;

    const input = document.createElement('input');
    input.className = 'ps-input topic-popover__title-input';
    input.value = oldName;
    titleEl.replaceWith(input);
    input.select();

    let committed = false;

    async function commit() {
        if (committed) return;
        committed = true;
        const newName = input.value.trim();
        if (newName && newName !== oldName) {
            await renameTopic(topicId, newName);
        } else {
            restoreTitle();
        }
    }

    function restoreTitle() {
        if (!input.parentNode) return;
        const span = document.createElement('span');
        span.className = 'topic-popover__title';
        span.textContent = oldName;
        span.onclick = () => startRenamePopover(topicId);
        input.replaceWith(span);
    }

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { committed = true; restoreTitle(); }
    });
}

// ── Undo ──────────────────────────────────────────────────────────────────────

async function undoLastAction() {
    if (undoStack.length === 0) return;
    const action = undoStack.pop();
    updateUndoButton();

    switch (action.type) {
        case 'remove_keyword': {
            const topic = state.topics.find(t => t.id === action.topicId);
            if (topic) {
                const updated = topic.keywords.filter(k => k !== action.keyword);
                await API.put(`/api/topics/${action.topicId}/keywords`, { keywords: updated });
                await loadTopics();
            }
            break;
        }
        case 'add_keyword': {
            const topic = state.topics.find(t => t.id === action.topicId);
            if (topic) {
                const updated = [...topic.keywords, action.keyword];
                await API.put(`/api/topics/${action.topicId}/keywords`, { keywords: updated });
                await loadTopics();
            }
            break;
        }
        case 'restore_topic': {
            await API.post('/api/topics', { name: action.name, keywords: action.keywords });
            await loadTopics();
            break;
        }
    }
}

// ── Add topic ─────────────────────────────────────────────────────────────────

document.getElementById('addTopicBtn').addEventListener('click', async () => {
    const input = document.getElementById('newTopicName');
    const name = input.value.trim();
    if (!name) return;
    await API.post('/api/topics', { name, keywords: [] });
    input.value = '';
    await loadTopics();
});

document.getElementById('topicsPageAddBtn').addEventListener('click', async () => {
    const input = document.getElementById('topicsPageNewName');
    const name = input.value.trim();
    if (!name) return;
    await API.post('/api/topics', { name, keywords: [] });
    input.value = '';
    await loadTopics();
    renderTopicsPage();
});

document.getElementById('topicsPageNewName').addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    const name = e.target.value.trim();
    if (!name) return;
    await API.post('/api/topics', { name, keywords: [] });
    e.target.value = '';
    await loadTopics();
    renderTopicsPage();
});

document.getElementById('newTopicName').addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    const name = e.target.value.trim();
    if (!name) return;
    await API.post('/api/topics', { name, keywords: [] });
    e.target.value = '';
    await loadTopics();
});

// ── Topics page ───────────────────────────────────────────────────────────────

function renderTopicsPage() {
    const grid = document.getElementById('topicsPageGrid');
    if (!grid) return;

    // Sync undo button state
    const undoBtn = document.getElementById('topicsPageUndoBtn');
    if (undoBtn) undoBtn.classList.toggle('disabled', undoStack.length === 0);

    if (state.topics.length === 0) {
        grid.innerHTML = '<p class="empty-state">No topics yet. Add one below.</p>';
        return;
    }

    grid.innerHTML = state.topics.map(topic => `
        <div class="topics-page-card" data-topic-id="${topic.id}">
            <div class="topics-page-card__header">
                <span class="topics-page-card__name" onclick="startRenameCard(${topic.id})" title="Click to rename">${escapeHtml(topic.name)}</span>
                <button class="topics-page-card__delete" onclick="deleteTopicFromPage(${topic.id})" title="Delete topic">&times;</button>
            </div>
            <div class="topics-page-card__keywords">
                ${topic.keywords.length === 0
                    ? '<span class="topic-popover__empty">No keywords yet.</span>'
                    : topic.keywords.map(kw => `
                        <span class="keyword-chip">
                            ${escapeHtml(kw)}
                            <span class="remove-kw" onclick="removeKeywordFromPage(${topic.id}, '${escapeAttr(kw)}')">&times;</span>
                        </span>`).join('')
                }
            </div>
            <div class="topics-page-card__add">
                <input class="ps-input" type="text" id="page-kw-input-${topic.id}" placeholder="Add keyword..."
                       onkeydown="if(event.key==='Enter') addKeywordFromPage(${topic.id})">
                <button class="ps-btn ps-btn--ghost ps-btn--sm" onclick="addKeywordFromPage(${topic.id})">Add</button>
            </div>
        </div>
    `).join('');
}

async function addKeywordFromPage(topicId) {
    const input = document.getElementById(`page-kw-input-${topicId}`);
    const kw = input.value.trim();
    if (!kw) return;
    const topic = state.topics.find(t => t.id === topicId);
    if (!topic) return;
    pushUndo({ type: 'remove_keyword', topicId, keyword: kw });
    await API.put(`/api/topics/${topicId}/keywords`, { keywords: [...topic.keywords, kw] });
    input.value = '';
    await loadTopics();
    renderTopicsPage();
}

async function removeKeywordFromPage(topicId, keyword) {
    const topic = state.topics.find(t => t.id === topicId);
    if (!topic) return;
    pushUndo({ type: 'add_keyword', topicId, keyword });
    await API.put(`/api/topics/${topicId}/keywords`, { keywords: topic.keywords.filter(k => k !== keyword) });
    await loadTopics();
    renderTopicsPage();
}

async function deleteTopicFromPage(topicId) {
    if (!confirm('Delete this topic and all its keywords?')) return;
    const topic = state.topics.find(t => t.id === topicId);
    pushUndo({ type: 'restore_topic', name: topic.name, keywords: [...topic.keywords] });
    await API.del(`/api/topics/${topicId}`);
    await loadTopics();
    renderTopicsPage();
}

// ── No-op stubs kept for any external callers ─────────────────────────────────

function expandToTopic(topicId) {
    const editBtn = document.querySelector(`.ps-chip-edit[data-topic-id="${topicId}"]`);
    if (editBtn) openTopicPopover(topicId, editBtn);
}

function renderTopicPills() {}

// ── Utility ───────────────────────────────────────────────────────────────────

function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

function escapeAttr(str) {
    return str.replace(/'/g, "\\'").replace(/"/g, '\\"');
}
