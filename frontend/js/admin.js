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
                                <td>
                                    <div style="display:flex;gap:6px;justify-content:flex-end;">
                                        <button class="ps-btn ps-btn--ghost ps-btn--sm" onclick="handleResetPassword(${u.id}, '${escapeHtml(u.username)}')">Reset password</button>
                                        ${u.id === selfId ? '' : (u.is_admin && adminCount <= 1) ? '' : `<button class="ps-btn ps-btn--ghost ps-btn--sm" style="color:var(--ps-danger);border-color:var(--ps-danger-border);" onclick="handleDeleteUser(${u.id}, '${escapeHtml(u.username)}')">Delete</button>`}
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
