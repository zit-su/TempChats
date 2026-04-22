/* ==============================
   TEMPCHAT ADMIN PANEL — admin.js
   ============================== */

// ---- Firebase Config (same as main app) ----
const firebaseConfig = {
    apiKey: "AIzaSyBPF1VE82Y3VkZe6IibjqKxBC-XHjM_Wco",
    authDomain: "chat-2024-ff149.firebaseapp.com",
    databaseURL: "https://chat-2024-ff149-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "chat-2024-ff149",
    storageBucket: "chat-2024-ff149.appspot.com",
    messagingSenderId: "146349109253",
    appId: "1:146349109253:web:e593afbf0584762519ac6c"
};

// ---- Init Firebase ----
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ---- State ----
const state = {
    chats: {},           // chatId -> { messages, participants, presence }
    password: localStorage.getItem('adminPass') || 'admin123',
    autoRefresh: true,
    refreshInterval: 30,
    refreshTimer: null,
    currentModalChat: null,
    showEmpty: true,
    filterText: '',
    msgFilter: '',
    msgChatFilter: ''
};

// ---- DOM helpers ----
const $ = id => document.getElementById(id);
const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
};

// ==============================
// LOGIN
// ==============================
$('loginBtn').addEventListener('click', attemptLogin);
$('passwordInput').addEventListener('keydown', e => { if (e.key === 'Enter') attemptLogin(); });

$('togglePw').addEventListener('click', () => {
    const inp = $('passwordInput');
    inp.type = inp.type === 'password' ? 'text' : 'password';
    $('togglePw').innerHTML = inp.type === 'password'
        ? '<i class="fas fa-eye"></i>'
        : '<i class="fas fa-eye-slash"></i>';
});

function attemptLogin() {
    const val = $('passwordInput').value;
    if (val === state.password) {
        $('loginScreen').classList.add('hidden');
        $('adminPanel').classList.remove('hidden');
        initAdmin();
    } else {
        $('loginError').classList.remove('hidden');
        $('passwordInput').value = '';
        setTimeout(() => $('loginError').classList.add('hidden'), 3000);
    }
}

$('logoutBtn').addEventListener('click', () => {
    $('adminPanel').classList.add('hidden');
    $('loginScreen').classList.remove('hidden');
    $('passwordInput').value = '';
    clearInterval(state.refreshTimer);
});

// ==============================
// NAVIGATION
// ==============================
const pageTitles = {
    dashboard: 'Dashboard',
    chats: 'Active Chats',
    messages: 'Messages',
    users: 'Participants',
    cleanup: 'Database Cleanup',
    settings: 'Settings'
};

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
        e.preventDefault();
        const page = item.dataset.page;
        switchPage(page);
    });
});

function switchPage(page) {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.querySelector(`[data-page="${page}"]`).classList.add('active');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    $(`page-${page}`).classList.add('active');
    $('pageTitle').textContent = pageTitles[page] || page;
    renderPage(page);
}

function renderPage(page) {
    switch (page) {
        case 'dashboard': renderDashboard(); break;
        case 'chats': renderChats(); break;
        case 'messages': renderMessages(); break;
        case 'users': renderUsers(); break;
        case 'cleanup': renderCleanup(); break;
        case 'settings': renderSettings(); break;
    }
}

// ==============================
// SIDEBAR TOGGLE
// ==============================
let sidebarOpen = true;
$('sidebarToggle').addEventListener('click', () => {
    const sidebar = document.querySelector('.sidebar');
    const main = document.querySelector('.main-content');
    if (window.innerWidth <= 768) {
        sidebar.classList.toggle('open');
    } else {
        sidebarOpen = !sidebarOpen;
        sidebar.classList.toggle('collapsed', !sidebarOpen);
        main.classList.toggle('expanded', !sidebarOpen);
    }
});

// ==============================
// CLOCK
// ==============================
function updateClock() {
    $('topbarTime').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
setInterval(updateClock, 1000);
updateClock();

// ==============================
// INIT ADMIN
// ==============================
function initAdmin() {
    setupConnectionListener();
    loadAllData();
    startAutoRefresh();
}

function setupConnectionListener() {
    db.ref('.info/connected').on('value', snap => {
        const connected = snap.val();
        const pill = $('connectionPill');
        const label = $('connLabel');
        const badge = $('settingsConn');
        if (connected) {
            pill.className = 'connection-pill connected';
            label.textContent = 'Firebase Connected';
            if (badge) { badge.textContent = 'Online'; badge.className = 'badge-conn badge-green'; }
        } else {
            pill.className = 'connection-pill disconnected';
            label.textContent = 'Disconnected';
            if (badge) { badge.textContent = 'Offline'; badge.className = 'badge-conn badge-red'; }
        }
    });
}

function loadAllData() {
    const refreshIcon = $('refreshBtn');
    refreshIcon.classList.add('spinning');

    db.ref('chats').once('value').then(snap => {
        state.chats = snap.val() || {};
        refreshIcon.classList.remove('spinning');
        // Render current page
        const activePage = document.querySelector('.nav-item.active')?.dataset.page || 'dashboard';
        renderPage(activePage);
        updateGlobalBadges();
    }).catch(err => {
        console.error('Firebase error:', err);
        refreshIcon.classList.remove('spinning');
        showToast('Error loading data: ' + err.message);
    });
}

function startAutoRefresh() {
    if (state.refreshTimer) clearInterval(state.refreshTimer);
    if (state.autoRefresh) {
        state.refreshTimer = setInterval(loadAllData, state.refreshInterval * 1000);
    }
}

$('refreshBtn').addEventListener('click', loadAllData);

// ==============================
// GLOBAL BADGES / STATS
// ==============================
function updateGlobalBadges() {
    const chats = state.chats;
    const chatIds = Object.keys(chats);
    const activeChats = chatIds.filter(id => {
        const p = chats[id].presence || {};
        return Object.values(p).some(v => v === true);
    });
    $('activeChatsCount').textContent = activeChats.length;
}

// ==============================
// STATS HELPERS
// ==============================
function computeStats() {
    const chats = state.chats;
    const chatIds = Object.keys(chats);

    let totalUsers = 0;
    let totalMessages = 0;
    let emptyChats = 0;
    let activeChats = 0;

    chatIds.forEach(id => {
        const chat = chats[id];
        const msgs = chat.messages ? Object.keys(chat.messages).length : 0;
        const presence = chat.presence || {};
        const online = Object.values(presence).filter(v => v === true).length;
        const parts = chat.participants ? Object.keys(chat.participants).length : 0;

        totalMessages += msgs;
        totalUsers += online;

        if (online > 0) activeChats++;
        if (msgs === 0 && parts === 0) emptyChats++;
    });

    return { activeChats, totalUsers, totalMessages, emptyChats, totalChats: chatIds.length };
}

// ==============================
// DASHBOARD
// ==============================
function renderDashboard() {
    const s = computeStats();
    animateCount('statActiveChats', s.activeChats);
    animateCount('statTotalUsers', s.totalUsers);
    animateCount('statTotalMessages', s.totalMessages);
    animateCount('statEmptyChats', s.emptyChats);
    renderTopChats();
    renderRecentActivity();
}

function animateCount(id, target) {
    const el = $(id);
    if (!el) return;
    const start = parseInt(el.textContent) || 0;
    const diff = target - start;
    const steps = 20;
    let step = 0;
    const timer = setInterval(() => {
        step++;
        el.textContent = Math.round(start + (diff * step / steps));
        if (step >= steps) clearInterval(timer);
    }, 20);
}

function renderTopChats() {
    const chats = state.chats;
    const container = $('topChatsList');
    const sorted = Object.entries(chats)
        .map(([id, data]) => ({
            id,
            msgs: data.messages ? Object.keys(data.messages).length : 0,
            users: data.participants ? Object.keys(data.participants).length : 0
        }))
        .sort((a, b) => b.msgs - a.msgs)
        .slice(0, 6);

    if (!sorted.length) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>No chats found</p></div>';
        return;
    }

    container.innerHTML = '';
    sorted.forEach((chat, i) => {
        const row = el('div', 'top-chat-row');
        row.innerHTML = `
            <span class="rank">#${i + 1}</span>
            <span class="top-chat-id">${chat.id}</span>
            <span class="top-chat-meta"><i class="fas fa-message"></i> ${chat.msgs} msgs</span>
            <span class="top-chat-meta"><i class="fas fa-users"></i> ${chat.users}</span>
        `;
        row.addEventListener('click', () => openChatModal(chat.id));
        container.appendChild(row);
    });
}

function renderRecentActivity() {
    const chats = state.chats;
    const container = $('recentActivity');
    const events = [];

    Object.entries(chats).forEach(([chatId, data]) => {
        if (data.messages) {
            Object.values(data.messages).forEach(msg => {
                events.push({
                    type: 'message',
                    chatId,
                    text: `Message in <strong>${chatId}</strong>`,
                    time: msg.timestamp || 0,
                    color: 'var(--accent)'
                });
            });
        }
        if (data.participants) {
            Object.entries(data.participants).forEach(([uid, info]) => {
                events.push({
                    type: 'join',
                    chatId,
                    text: `User joined <strong>${chatId}</strong>`,
                    time: info.joinedAt || 0,
                    color: 'var(--green)'
                });
            });
        }
    });

    events.sort((a, b) => b.time - a.time);
    const recent = events.slice(0, 10);

    if (!recent.length) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-history"></i><p>No activity yet</p></div>';
        return;
    }

    container.innerHTML = '';
    recent.forEach(ev => {
        const item = el('div', 'activity-item');
        item.innerHTML = `
            <div class="activity-dot" style="background:${ev.color}; box-shadow: 0 0 6px ${ev.color}"></div>
            <span class="activity-text">${ev.text}</span>
            <span class="activity-time">${ev.time ? timeAgo(ev.time) : '—'}</span>
        `;
        container.appendChild(item);
    });
}

// ==============================
// CHATS PAGE
// ==============================
let chatSearchQuery = '';
$('chatSearch').addEventListener('input', e => {
    chatSearchQuery = e.target.value.toUpperCase();
    renderChats();
});

$('deleteAllEmptyBtn').addEventListener('click', () => {
    confirmAction(
        'Delete Empty Chats',
        'Are you sure you want to delete all chats with no messages and no participants? This cannot be undone.',
        deleteEmptyChats
    );
});

function renderChats() {
    const chats = state.chats;
    const container = $('chatsList');
    let entries = Object.entries(chats);

    if (!state.showEmpty) {
        entries = entries.filter(([, d]) => {
            const parts = d.participants ? Object.keys(d.participants).length : 0;
            const msgs = d.messages ? Object.keys(d.messages).length : 0;
            return parts > 0 || msgs > 0;
        });
    }

    if (chatSearchQuery) {
        entries = entries.filter(([id]) => id.includes(chatSearchQuery));
    }

    if (!entries.length) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>No chats found</p></div>';
        return;
    }

    const table = el('table');
    table.innerHTML = `
        <thead>
            <tr>
                <th>Chat ID</th>
                <th>Messages</th>
                <th>Participants</th>
                <th>Status</th>
                <th>Actions</th>
            </tr>
        </thead>
    `;
    const tbody = el('tbody');

    entries.forEach(([chatId, data]) => {
        const msgs = data.messages ? Object.keys(data.messages).length : 0;
        const parts = data.participants ? Object.keys(data.participants).length : 0;
        const presence = data.presence || {};
        const online = Object.values(presence).filter(v => v === true).length;

        let statusBadge;
        if (online > 0) {
            statusBadge = `<span class="badge badge-green"><i class="fas fa-circle"></i> Live</span>`;
        } else if (parts > 0 || msgs > 0) {
            statusBadge = `<span class="badge badge-orange">Inactive</span>`;
        } else {
            statusBadge = `<span class="badge badge-gray">Empty</span>`;
        }

        const tr = el('tr');
        tr.innerHTML = `
            <td><span class="chat-id-cell">${chatId}</span></td>
            <td>${msgs}</td>
            <td>${parts}</td>
            <td>${statusBadge}</td>
            <td>
                <div class="action-btns">
                    <button class="tbl-btn view-btn" data-id="${chatId}">
                        <i class="fas fa-eye"></i> View
                    </button>
                    <button class="tbl-btn danger del-btn" data-id="${chatId}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    container.innerHTML = '';
    container.appendChild(table);

    // Bind buttons
    container.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => openChatModal(btn.dataset.id));
    });
    container.querySelectorAll('.del-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            confirmAction(
                `Delete Chat ${btn.dataset.id}`,
                `Permanently delete chat ${btn.dataset.id} and all its messages?`,
                () => deleteChat(btn.dataset.id)
            );
        });
    });
}

// ==============================
// MESSAGES PAGE
// ==============================
let msgSearchQuery = '';
let msgChatFilterValue = '';

$('msgSearch').addEventListener('input', e => {
    msgSearchQuery = e.target.value.toLowerCase();
    renderMessages();
});

$('msgChatFilter').addEventListener('change', e => {
    msgChatFilterValue = e.target.value;
    renderMessages();
});

function renderMessages() {
    const chats = state.chats;
    const container = $('messagesList');
    const filterSelect = $('msgChatFilter');

    // Populate filter
    const currentVal = filterSelect.value;
    filterSelect.innerHTML = '<option value="">All Chats</option>';
    Object.keys(chats).forEach(id => {
        const opt = document.createElement('option');
        opt.value = id; opt.textContent = id;
        if (id === currentVal) opt.selected = true;
        filterSelect.appendChild(opt);
    });

    const allMessages = [];
    Object.entries(chats).forEach(([chatId, data]) => {
        if (msgChatFilterValue && chatId !== msgChatFilterValue) return;
        if (data.messages) {
            Object.entries(data.messages).forEach(([msgId, msg]) => {
                if (!msgSearchQuery || msg.text?.toLowerCase().includes(msgSearchQuery)) {
                    allMessages.push({ chatId, msgId, ...msg });
                }
            });
        }
    });

    allMessages.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    if (!allMessages.length) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-comment-slash"></i><p>No messages found</p></div>';
        return;
    }

    const table = el('table');
    table.innerHTML = `
        <thead>
            <tr>
                <th>Chat ID</th>
                <th>Sender</th>
                <th>Message</th>
                <th>Time</th>
                <th>Actions</th>
            </tr>
        </thead>
    `;
    const tbody = el('tbody');

    allMessages.slice(0, 200).forEach(msg => {
        const tr = el('tr');
        tr.innerHTML = `
            <td><span class="chat-id-cell">${msg.chatId}</span></td>
            <td><span style="color:var(--text-2);font-size:11px">${truncate(msg.senderId || '—', 14)}</span></td>
            <td>${escapeHtml(truncate(msg.text || '', 60))}</td>
            <td style="font-size:11px;color:var(--text-3)">${msg.timestamp ? new Date(msg.timestamp).toLocaleString() : '—'}</td>
            <td>
                <button class="tbl-btn danger del-msg-btn" data-chat="${msg.chatId}" data-msg="${msg.msgId}">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    container.innerHTML = '';
    container.appendChild(table);

    container.querySelectorAll('.del-msg-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            confirmAction(
                'Delete Message',
                'Permanently delete this message?',
                () => deleteMessage(btn.dataset.chat, btn.dataset.msg)
            );
        });
    });
}

// ==============================
// USERS PAGE
// ==============================
function renderUsers() {
    const chats = state.chats;
    const container = $('usersList');
    const allUsers = [];

    Object.entries(chats).forEach(([chatId, data]) => {
        if (data.participants) {
            Object.entries(data.participants).forEach(([uid, info]) => {
                const online = data.presence?.[uid] === true;
                allUsers.push({ chatId, uid, ...info, online });
            });
        }
    });

    if (!allUsers.length) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-user-slash"></i><p>No participants found</p></div>';
        return;
    }

    const table = el('table');
    table.innerHTML = `
        <thead>
            <tr>
                <th>User ID</th>
                <th>Chat</th>
                <th>Role</th>
                <th>Joined</th>
                <th>Status</th>
            </tr>
        </thead>
    `;
    const tbody = el('tbody');

    allUsers.sort((a, b) => (b.joinedAt || 0) - (a.joinedAt || 0));

    allUsers.forEach(user => {
        const tr = el('tr');
        tr.innerHTML = `
            <td style="font-size:11px;color:var(--text-2)">${truncate(user.uid, 20)}</td>
            <td><span class="chat-id-cell">${user.chatId}</span></td>
            <td>
                ${user.isHost
                    ? '<span class="badge badge-blue"><i class="fas fa-crown"></i> Host</span>'
                    : '<span class="badge badge-gray">Member</span>'}
            </td>
            <td style="font-size:11px;color:var(--text-3)">${user.joinedAt ? timeAgo(user.joinedAt) : '—'}</td>
            <td>
                ${user.online
                    ? '<span class="badge badge-green"><i class="fas fa-circle"></i> Online</span>'
                    : '<span class="badge badge-gray">Offline</span>'}
            </td>
        `;
        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    container.innerHTML = '';
    container.appendChild(table);
}

// ==============================
// CLEANUP PAGE
// ==============================
function renderCleanup() {
    const chats = state.chats;
    const chatIds = Object.keys(chats);
    const emptyChats = chatIds.filter(id => {
        const data = chats[id];
        const msgs = data.messages ? Object.keys(data.messages).length : 0;
        const parts = data.participants ? Object.keys(data.participants).length : 0;
        return msgs === 0 && parts === 0;
    });

    $('cleanupEmptyCount').textContent = `${emptyChats.length} empty chat(s) found`;
    $('cleanupTotalCount').textContent = `${chatIds.length} total chat(s)`;
}

$('cleanEmptyBtn')?.addEventListener('click', () => {
    confirmAction('Delete Empty Chats', 'Delete all chats with no messages and no participants?', deleteEmptyChats);
});

$('cleanAllBtn')?.addEventListener('click', () => {
    confirmAction(
        '⚠ NUKE EVERYTHING',
        'This will permanently delete ALL chats, ALL messages, and ALL participant data. There is NO undo. Type carefully: are you 100% sure?',
        deleteAllChats
    );
});

$('exportBtn')?.addEventListener('click', exportData);

// ==============================
// SETTINGS PAGE
// ==============================
function renderSettings() {
    $('autoRefreshToggle').checked = state.autoRefresh;
    $('showEmptyToggle').checked = state.showEmpty;
    $('refreshInterval').value = state.refreshInterval;
}

$('saveSettingsBtn')?.addEventListener('click', () => {
    state.autoRefresh = $('autoRefreshToggle').checked;
    state.showEmpty = $('showEmptyToggle').checked;
    state.refreshInterval = parseInt($('refreshInterval').value) || 30;
    startAutoRefresh();
    showToast('Settings saved');
});

$('savePwBtn')?.addEventListener('click', () => {
    const cur = $('currentPw').value;
    const nw = $('newPw').value;
    const conf = $('confirmPw').value;
    const msg = $('pwMsg');

    if (cur !== state.password) {
        showPwMsg(false, 'Current password is incorrect');
        return;
    }
    if (!nw || nw.length < 4) {
        showPwMsg(false, 'New password must be at least 4 characters');
        return;
    }
    if (nw !== conf) {
        showPwMsg(false, 'Passwords do not match');
        return;
    }

    state.password = nw;
    localStorage.setItem('adminPass', nw);
    $('currentPw').value = '';
    $('newPw').value = '';
    $('confirmPw').value = '';
    showPwMsg(true, 'Password updated successfully');
});

function showPwMsg(success, text) {
    const msg = $('pwMsg');
    msg.className = 'pw-msg ' + (success ? 'success' : 'error');
    msg.textContent = text;
    msg.classList.remove('hidden');
    setTimeout(() => msg.classList.add('hidden'), 4000);
}

// ==============================
// CHAT MODAL
// ==============================
function openChatModal(chatId) {
    state.currentModalChat = chatId;
    const data = state.chats[chatId] || {};
    const msgs = data.messages ? Object.values(data.messages) : [];
    const parts = data.participants ? Object.entries(data.participants) : [];

    $('modalChatId').textContent = `Chat: ${chatId}`;
    $('modalChatSub').textContent = `${msgs.length} messages · ${parts.length} participants`;

    // Messages tab
    const msgsContainer = $('modalMessages');
    if (!msgs.length) {
        msgsContainer.innerHTML = '<div class="empty-state"><i class="fas fa-comment-slash"></i><p>No messages</p></div>';
    } else {
        msgsContainer.innerHTML = '';
        msgs.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        msgs.forEach((msg, i) => {
            const msgId = data.messages ? Object.keys(data.messages)[i] : null;
            const item = el('div', 'msg-item');
            item.innerHTML = `
                <div class="msg-avatar"><i class="fas fa-user"></i></div>
                <div class="msg-content">
                    <div class="msg-sender">${truncate(msg.senderId || 'unknown', 20)}</div>
                    <div class="msg-text">${escapeHtml(msg.text || '')}</div>
                    <div class="msg-time">${msg.timestamp ? new Date(msg.timestamp).toLocaleString() : '—'}</div>
                </div>
                ${msgId ? `<button class="msg-del-btn modal-del-msg" data-chat="${chatId}" data-msg="${msgId}" title="Delete message"><i class="fas fa-trash"></i></button>` : ''}
            `;
            msgsContainer.appendChild(item);
        });
    }

    // Participants tab
    const partsContainer = $('modalParticipants');
    if (!parts.length) {
        partsContainer.innerHTML = '<div class="empty-state"><i class="fas fa-user-slash"></i><p>No participants</p></div>';
    } else {
        partsContainer.innerHTML = '';
        parts.forEach(([uid, info]) => {
            const online = data.presence?.[uid] === true;
            const item = el('div', 'part-item');
            item.innerHTML = `
                <div class="part-avatar"><i class="fas fa-user"></i></div>
                <div class="part-info">
                    <div class="part-id">${uid}</div>
                    <div class="part-meta">
                        ${info.isHost ? '<span style="color:var(--blue)"><i class="fas fa-crown"></i> Host</span> · ' : ''}
                        Joined ${info.joinedAt ? timeAgo(info.joinedAt) : '—'}
                    </div>
                </div>
                ${online
                    ? '<span class="badge badge-green"><i class="fas fa-circle"></i> Online</span>'
                    : '<span class="badge badge-gray">Offline</span>'}
            `;
            partsContainer.appendChild(item);
        });
    }

    $('chatModal').classList.remove('hidden');

    // Bind modal delete message buttons
    $('chatModal').querySelectorAll('.modal-del-msg').forEach(btn => {
        btn.addEventListener('click', () => {
            confirmAction('Delete Message', 'Delete this message permanently?', () => {
                deleteMessage(btn.dataset.chat, btn.dataset.msg, true);
            });
        });
    });
}

// Tab switching in modal
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        $(tab).classList.add('active');
    });
});

$('closeChatModal').addEventListener('click', () => $('chatModal').classList.add('hidden'));
$('chatModal').addEventListener('click', e => { if (e.target === $('chatModal')) $('chatModal').classList.add('hidden'); });

$('deleteChatBtn').addEventListener('click', () => {
    if (!state.currentModalChat) return;
    confirmAction(
        `Delete Chat ${state.currentModalChat}`,
        `Permanently delete chat ${state.currentModalChat} and all its messages?`,
        () => {
            $('chatModal').classList.add('hidden');
            deleteChat(state.currentModalChat);
        }
    );
});

// ==============================
// CONFIRM MODAL
// ==============================
let pendingConfirmAction = null;

function confirmAction(title, message, onConfirm) {
    $('confirmTitle').textContent = title;
    $('confirmMessage').textContent = message;
    pendingConfirmAction = onConfirm;
    $('confirmModal').classList.remove('hidden');
}

$('confirmOk').addEventListener('click', () => {
    $('confirmModal').classList.add('hidden');
    if (pendingConfirmAction) pendingConfirmAction();
    pendingConfirmAction = null;
});

$('confirmCancel').addEventListener('click', () => {
    $('confirmModal').classList.add('hidden');
    pendingConfirmAction = null;
});

$('closeConfirmModal').addEventListener('click', () => {
    $('confirmModal').classList.add('hidden');
    pendingConfirmAction = null;
});

// ==============================
// FIREBASE OPERATIONS
// ==============================
function deleteChat(chatId) {
    db.ref(`chats/${chatId}`).remove()
        .then(() => {
            delete state.chats[chatId];
            showToast(`Chat ${chatId} deleted`);
            updateGlobalBadges();
            const activePage = document.querySelector('.nav-item.active')?.dataset.page || 'dashboard';
            renderPage(activePage);
        })
        .catch(err => showToast('Error: ' + err.message));
}

function deleteMessage(chatId, msgId, reopenModal = false) {
    db.ref(`chats/${chatId}/messages/${msgId}`).remove()
        .then(() => {
            if (state.chats[chatId]?.messages) {
                delete state.chats[chatId].messages[msgId];
            }
            showToast('Message deleted');
            if (reopenModal) openChatModal(chatId);
            const activePage = document.querySelector('.nav-item.active')?.dataset.page || 'dashboard';
            renderPage(activePage);
        })
        .catch(err => showToast('Error: ' + err.message));
}

function deleteEmptyChats() {
    const chats = state.chats;
    const emptyIds = Object.keys(chats).filter(id => {
        const data = chats[id];
        const msgs = data.messages ? Object.keys(data.messages).length : 0;
        const parts = data.participants ? Object.keys(data.participants).length : 0;
        return msgs === 0 && parts === 0;
    });

    if (!emptyIds.length) {
        showToast('No empty chats to delete');
        return;
    }

    const updates = {};
    emptyIds.forEach(id => { updates[`chats/${id}`] = null; });

    db.ref().update(updates).then(() => {
        emptyIds.forEach(id => delete state.chats[id]);
        showToast(`Deleted ${emptyIds.length} empty chat(s)`);
        updateGlobalBadges();
        const activePage = document.querySelector('.nav-item.active')?.dataset.page || 'dashboard';
        renderPage(activePage);
    }).catch(err => showToast('Error: ' + err.message));
}

function deleteAllChats() {
    db.ref('chats').remove().then(() => {
        state.chats = {};
        showToast('All chats deleted');
        updateGlobalBadges();
        const activePage = document.querySelector('.nav-item.active')?.dataset.page || 'dashboard';
        renderPage(activePage);
    }).catch(err => showToast('Error: ' + err.message));
}

function exportData() {
    const json = JSON.stringify(state.chats, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tempchat-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Data exported successfully');
}

// ==============================
// TOAST
// ==============================
let toastTimer;
function showToast(msg) {
    clearTimeout(toastTimer);
    $('toastMsg').textContent = msg;
    $('toast').classList.remove('hidden');
    toastTimer = setTimeout(() => $('toast').classList.add('hidden'), 3000);
}

// ==============================
// UTILS
// ==============================
function timeAgo(timestamp) {
    const diff = Date.now() - timestamp;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
}

function truncate(str, n) {
    return str && str.length > n ? str.slice(0, n) + '…' : str;
}

function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
