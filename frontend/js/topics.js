/* Parliamentary Scanner — Topic management UI */

// Track which topics are checked (by ID). Empty set means none checked by default.
let checkedTopicIds = new Set();

// Undo stack for topic/keyword changes
let undoStack = [];

function pushUndo(action) {
    undoStack.push(action);
    updateUndoButton();
}

function updateUndoButton() {
    const btn = document.getElementById('undoBtn');
    if (btn) {
        if (undoStack.length > 0) {
            btn.classList.remove('disabled');
        } else {
            btn.classList.add('disabled');
        }
    }
}

async function loadTopics() {
    // Save current checkbox state before reload
    saveCheckedState();
    state.topics = await API.get('/api/topics');
    renderTopics();
}

function saveCheckedState() {
    // No-op: checkedTopicIds is maintained directly via chip clicks
}

function renderTopics() {
    const container = document.getElementById('topicList');
    container.innerHTML = '';

    if (state.topics.length === 0) {
        container.innerHTML = '<p class="empty-state">No topics yet. Add one below.</p>';
        renderTopicChips();
        return;
    }

    for (const topic of state.topics) {
        const el = document.createElement('div');
        el.className = 'topic-item';
        el.dataset.topicId = topic.id;
        el.innerHTML = `
            <div class="topic-header">
                <span class="topic-name">${escapeHtml(topic.name)}</span>
                <div class="topic-actions">
                    <button onclick="deleteTopic(${topic.id})" title="Delete topic">&times;</button>
                </div>
            </div>
            <div class="keyword-list" id="kw-${topic.id}">
                ${topic.keywords.map(kw =>
                    `<span class="keyword-chip">
                        ${escapeHtml(kw)}
                        <span class="remove-kw" onclick="removeKeyword(${topic.id}, '${escapeAttr(kw)}')">&times;</span>
                    </span>`
                ).join('')}
            </div>
            <div class="keyword-input">
                <input class="ps-input" type="text" placeholder="Add keyword..." id="kw-input-${topic.id}"
                       onkeydown="if(event.key==='Enter') addKeyword(${topic.id})">
                <button class="ps-btn ps-btn--ghost ps-btn--sm" onclick="addKeyword(${topic.id})">Add</button>
            </div>
        `;
        container.appendChild(el);
    }

    renderTopicChips();
}

function renderTopicChips() {
    const container = document.getElementById('topicChipGroup');
    if (!container) return;
    container.innerHTML = state.topics.map(topic => {
        const isActive = checkedTopicIds.has(topic.id);
        return `<button class="ps-chip${isActive ? ' ps-chip--active' : ''}" data-topic-id="${topic.id}" onclick="toggleTopicChip(${topic.id}, this)">${escapeHtml(topic.name)}</button>`;
    }).join('');
}

function toggleTopicChip(topicId, btn) {
    if (checkedTopicIds.has(topicId)) {
        checkedTopicIds.delete(topicId);
        btn.classList.remove('ps-chip--active');
    } else {
        checkedTopicIds.add(topicId);
        btn.classList.add('ps-chip--active');
    }
}

function renderTopicPills() {
    // No-op: topics are now shown as ps-chip elements in the filter bar
}

function toggleTopicPill(topicId, pillEl) {
    if (checkedTopicIds.has(topicId)) {
        checkedTopicIds.delete(topicId);
        pillEl.classList.remove('active');
    } else {
        checkedTopicIds.add(topicId);
        pillEl.classList.add('active');
    }

    // Sync with hidden checkboxes
    const checkbox = document.querySelector(`.topic-checkbox[value="${topicId}"]`);
    if (checkbox) checkbox.checked = checkedTopicIds.has(topicId);
}

function expandToTopic(topicId) {
    const list = document.getElementById('topicList');
    const icon = document.querySelector('.toggle-icon');

    // Expand the topic list
    list.classList.remove('collapsed');
    icon.classList.remove('collapsed');

    // Hide pills
    renderTopicPills();

    // Scroll to the topic and highlight it briefly
    requestAnimationFrame(() => {
        const topicEl = document.querySelector(`.topic-item[data-topic-id="${topicId}"]`);
        if (topicEl) {
            topicEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            topicEl.classList.add('highlight');
            setTimeout(() => topicEl.classList.remove('highlight'), 1200);
        }
    });
}

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

async function undoLastAction() {
    if (undoStack.length === 0) return;
    const action = undoStack.pop();
    updateUndoButton();

    switch (action.type) {
        case 'remove_keyword': {
            // Undo of addKeyword: remove the keyword
            const topic = state.topics.find(t => t.id === action.topicId);
            if (topic) {
                const updated = topic.keywords.filter(k => k !== action.keyword);
                await API.put(`/api/topics/${action.topicId}/keywords`, { keywords: updated });
                await loadTopics();
            }
            break;
        }
        case 'add_keyword': {
            // Undo of removeKeyword: re-add the keyword
            const topic = state.topics.find(t => t.id === action.topicId);
            if (topic) {
                const updated = [...topic.keywords, action.keyword];
                await API.put(`/api/topics/${action.topicId}/keywords`, { keywords: updated });
                await loadTopics();
            }
            break;
        }
        case 'restore_topic': {
            // Undo of deleteTopic: recreate the topic
            await API.post('/api/topics', { name: action.name, keywords: action.keywords });
            await loadTopics();
            break;
        }
    }
}

// Add topic button
document.getElementById('addTopicBtn').addEventListener('click', async () => {
    const input = document.getElementById('newTopicName');
    const name = input.value.trim();
    if (!name) return;

    await API.post('/api/topics', { name, keywords: [] });
    input.value = '';
    await loadTopics();
});

// Toggle topic panel
document.getElementById('topicToggle').addEventListener('click', () => {
    const list = document.getElementById('topicList');
    const icon = document.querySelector('.toggle-icon');
    list.classList.toggle('collapsed');
    icon.classList.toggle('collapsed');
    renderTopicPills();
});

// Select all/none
function toggleAllTopics(checked) {
    if (checked) {
        checkedTopicIds = new Set(state.topics.map(t => t.id));
    } else {
        checkedTopicIds = new Set();
    }
    document.querySelectorAll('#topicChipGroup .ps-chip').forEach(chip => {
        chip.classList.toggle('ps-chip--active', checked);
    });
}

// Utility
function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

function escapeAttr(str) {
    return str.replace(/'/g, "\\'").replace(/"/g, '\\"');
}
