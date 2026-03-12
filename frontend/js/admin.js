/* Admin dashboard: user management and activity overview */

async function loadAdminDashboard() {
    const container = document.getElementById('adminContent');
    if (!container) return;
    container.innerHTML = '<p style="color:var(--ps-text-muted);padding:8px 0;">Loading...</p>';

    try {
        const data = await API.get('/api/admin/activity');
        renderAdminDashboard(data);
    } catch (e) {
        container.innerHTML = `<p style="color:var(--ps-danger);">Failed to load admin data: ${e.message}</p>`;
    }
}

function renderAdminDashboard(data) {
    const container = document.getElementById('adminContent');
    const { users } = data;
    const selfId = state.currentUser && state.currentUser.id;
    const adminCount = users.filter(u => u.is_admin).length;

    container.innerHTML = `
        <section class="control-group-card" style="padding:0;overflow:hidden;">
            <div style="padding:14px 20px;border-bottom:1px solid var(--ps-border-default);display:flex;align-items:center;gap:10px;">
                <h2 style="font-size:var(--ps-text-lg);font-weight:var(--ps-weight-semi);color:var(--ps-text-primary);margin:0;">Users</h2>
                <span class="ps-badge">${users.length}</span>
            </div>
            <div class="ps-table-wrapper">
                <table class="ps-table">
                    <thead>
                        <tr>
                            <th>Username</th>
                            <th>Role</th>
                            <th>Created</th>
                            <th>Last Online</th>
                            <th>Scans</th>
                            <th>Last Scan</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${users.map(u => `
                            <tr>
                                <td style="color:var(--ps-text-primary);font-weight:var(--ps-weight-medium);">${escapeHtml(u.username)}</td>
                                <td>${u.is_admin
                                    ? '<span class="ps-badge ps-badge--accent">Admin</span>'
                                    : '<span class="ps-badge ps-badge--muted">User</span>'
                                }</td>
                                <td>${u.created_at ? u.created_at.split('T')[0] : '—'}</td>
                                <td>${formatLastOnline(u.last_online_at)}</td>
                                <td>${u.scan_count || 0}</td>
                                <td>${u.last_scan_at ? u.last_scan_at.split('T')[0] : '—'}</td>
                                <td style="text-align:right;">
                                    <div class="audit-actions-dropdown">
                                        <button class="ps-btn ps-btn--ghost ps-btn--sm audit-actions-trigger" onclick="toggleUserMenu(this, ${u.id}, '${escapeHtml(u.username)}', ${u.id === selfId}, ${u.is_admin && adminCount <= 1})">&#8942;</button>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </section>

        <section class="control-group-card" style="margin-top:16px;">
            <div class="results-header" style="margin-bottom:16px;">
                <h2 style="font-size:var(--ps-text-lg);font-weight:var(--ps-weight-semi);color:var(--ps-text-primary);margin:0;">Create New User</h2>
            </div>
            <form onsubmit="handleCreateUser(event)">
                <div class="admin-create-form">
                    <div>
                        <label class="source-label" style="display:block;margin-bottom:4px;">Username</label>
                        <input class="ps-input" type="text" id="newUsername" placeholder="Username" required autocomplete="off">
                    </div>
                    <div>
                        <label class="source-label" style="display:block;margin-bottom:4px;">Password</label>
                        <input class="ps-input" type="password" id="newPassword" placeholder="Password" required autocomplete="new-password">
                    </div>
                    <div style="display:flex;align-items:center;align-self:flex-end;height:37px;">
                        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;color:var(--ps-text-secondary);font-size:var(--ps-text-lg);user-select:none;">
                            <input type="checkbox" id="newIsAdmin" style="width:16px;height:16px;accent-color:var(--ps-accent);cursor:pointer;"> Admin
                        </label>
                    </div>
                    <div style="align-self:flex-end;">
                        <button type="submit" class="ps-btn ps-btn--primary" style="height:33px;">Create</button>
                    </div>
                </div>
                <div id="createUserMsg" style="margin-top:8px;font-size:var(--ps-text-md);min-height:18px;"></div>
            </form>
        </section>
    `;
}

async function handleCreateUser(e) {
    e.preventDefault();
    const username = document.getElementById('newUsername').value.trim();
    const password = document.getElementById('newPassword').value;
    const isAdmin = document.getElementById('newIsAdmin').checked;
    const msg = document.getElementById('createUserMsg');

    try {
        await API.post('/api/admin/users', { username, password, is_admin: isAdmin });
        msg.style.color = 'var(--ps-success)';
        msg.textContent = `User '${username}' created successfully.`;
        document.getElementById('newUsername').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('newIsAdmin').checked = false;
        setTimeout(() => loadAdminDashboard(), 500);
    } catch (e) {
        msg.style.color = 'var(--ps-danger)';
        msg.textContent = `Error: ${e.message}`;
    }
}

function toggleUserMenu(btn, userId, username, isSelf, isLastAdmin) {
    // Close any existing user menus
    document.querySelectorAll('.user-actions-menu').forEach(m => m.remove());

    const existing = btn._menuOpen;
    btn._menuOpen = false;
    if (existing) return;

    const menu = document.createElement('div');
    menu.className = 'audit-actions-menu user-actions-menu';

    const renameBtn = document.createElement('button');
    renameBtn.textContent = 'Rename user';
    renameBtn.onclick = () => { menu.remove(); btn._menuOpen = false; handleRenameUser(userId, username); };
    menu.appendChild(renameBtn);

    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset password';
    resetBtn.onclick = () => { menu.remove(); btn._menuOpen = false; handleResetPassword(userId, username); };
    menu.appendChild(resetBtn);

    if (!isSelf && !isLastAdmin) {
        const sep = document.createElement('div');
        sep.style.cssText = 'height:1px;background:var(--ps-border-default);margin:4px 0;';
        menu.appendChild(sep);

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Delete user';
        deleteBtn.style.color = 'var(--ps-danger)';
        deleteBtn.onclick = () => { menu.remove(); btn._menuOpen = false; handleDeleteUser(userId, username); };
        menu.appendChild(deleteBtn);
    }

    document.body.appendChild(menu);
    btn._menuOpen = true;

    const rect = btn.getBoundingClientRect();
    const menuW = 160;
    let left = rect.right - menuW;
    let top = rect.bottom + 4;
    if (left < 4) left = 4;
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    menu.style.minWidth = menuW + 'px';
    menu.style.position = 'fixed';
    menu.style.zIndex = '9999';

    const close = (e) => {
        if (!menu.contains(e.target) && e.target !== btn) {
            menu.remove();
            btn._menuOpen = false;
            document.removeEventListener('mousedown', close);
        }
    };
    setTimeout(() => document.addEventListener('mousedown', close), 0);
}

async function handleRenameUser(userId, currentUsername) {
    const newUsername = prompt(`Rename '${currentUsername}' to:`, currentUsername);
    if (!newUsername || newUsername.trim() === currentUsername) return;
    try {
        const res = await fetch(`/api/admin/users/${userId}/username`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: newUsername.trim() }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            alert(`Failed to rename user: ${err.detail || res.statusText}`);
            return;
        }
        loadAdminDashboard();
    } catch (e) {
        alert(`Failed to rename user: ${e.message}`);
    }
}

async function handleResetPassword(userId, username) {
    const password = prompt(`Enter new password for '${username}':`);
    if (!password) return;
    try {
        await fetch(`/api/admin/users/${userId}/password`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password }),
        });
        alert(`Password for '${username}' updated successfully.`);
    } catch (e) {
        alert(`Failed to reset password: ${e.message}`);
    }
}

async function handleDeleteUser(userId, username) {
    if (!confirm(`Delete user '${username}' and ALL their data? This cannot be undone.`)) return;
    try {
        await API.del(`/api/admin/users/${userId}`);
        loadAdminDashboard();
    } catch (e) {
        alert(`Failed to delete user: ${e.message}`);
    }
}

function formatLastOnline(ts) {
    if (!ts) return '—';
    const d = new Date(ts.endsWith('Z') ? ts : ts + 'Z');
    const diffMins = Math.floor((Date.now() - d) / 60000);
    if (diffMins < 60) return `${Math.max(1, diffMins)}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toISOString().split('T')[0];
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
