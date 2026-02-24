const CURRENT_ACCOUNT_STORAGE_KEY = 'currentAccountId';
const wsErrorNotifiedAt = {};

async function loadAccounts() {
    return runDedupedRequest('loadAccounts', async () => {
        console.log('开始loadAccounts，当前adminToken:', adminToken, '当前currentAccountId:', currentAccountId);
        const list = await api('/api/accounts');
        console.log('loadAccounts返回的list:', list, '类型:', typeof list);
        if (list && list.accounts) {
            console.log('list.accounts存在，长度:', list.accounts.length);
            
            // 检查当前账号的状态是否从运行中变为已停止
            if (currentAccountId) {
                const oldAcc = accounts.find(a => a.id === currentAccountId);
                const newAcc = list.accounts.find(a => a.id === currentAccountId);
                if (oldAcc && newAcc && oldAcc.running === true && newAcc.running === false) {
                    console.log('账号状态从运行中变为已停止，清除本地缓存');
                    // 清除本地缓存的token和code
                    localStorage.removeItem('adminToken');
                    localStorage.removeItem('currentAccountId');
                    adminToken = '';
                    currentAccountId = null;
                    // 显示添加账号弹窗
                    showAddAccountModal();
                    return;
                }
            }
            
            accounts = list.accounts;
            console.log('更新后的accounts:', JSON.stringify(accounts));
            
            // 由于登录后只能看到自己的账号，通常只有一个
            if (accounts.length === 1) {
                // 自动选择唯一的账号
                console.log('自动选择唯一的账号:', JSON.stringify(accounts[0]));
                if (!currentAccountId || currentAccountId !== accounts[0].id) {
                    console.log('调用switchAccount，accountId:', accounts[0].id);
                    switchAccount(accounts[0].id);
                } else {
                    console.log('currentAccountId已经是该账号，直接更新topbar');
                    updateTopbarAccount(accounts[0]);
                }
            } else if (accounts.length === 0) {
                console.log('没有账号');
                $('current-account-name').textContent = '无账号';
                updateTopbarAccount({ name: '无账号' });
                resetDashboardStats();
                clearFarmView('暂无账号');
                clearFriendsView('暂无账号');
                currentAccountId = null;
            } else {
                // 多个账号的情况（不应该发生，但保留兼容性）
                console.log('多个账号的情况');
                renderAccountSelector();
                if (!currentAccountId && accounts.length > 0) {
                    switchAccount(accounts[0].id);
                }
            }
            renderLogFilterOptions();
        } else {
            console.log('loadAccounts: list为null或没有accounts属性，list:', list);
        }
        
        // 更新顶部账号数量显示
        updateTopbarAccountsCount();
    });
}

function updateTopbarAccountsCount() {
    const el = $('topbar-accounts-value');
    console.log('updateTopbarAccountsCount: el:', el);
    if (el) {
        // 获取全部账号的总数
        console.log('updateTopbarAccountsCount: 开始获取全部账号总数');
        fetch(API_ROOT + '/api/system-info')
            .then(r => r.json())
            .then(j => {
                console.log('updateTopbarAccountsCount: 获取到数据:', j);
                if (j.ok && j.data) {
                    console.log('updateTopbarAccountsCount: 账号总数:', j.data.totalAccountsCount);
                    el.textContent = j.data.totalAccountsCount || 0;
                }
            })
            .catch((err) => {
                console.error('updateTopbarAccountsCount: 获取失败:', err);
                // 如果获取失败，使用本地账号数量作为备选
                el.textContent = accounts.length;
            });
    }
}

function renderAccountSelector() {
    const dropdown = $('account-dropdown');
    dropdown.innerHTML = accounts.map(acc => `
        <div class="account-option ${acc.id === currentAccountId ? 'active' : ''}" data-id="${acc.id}">
            <i class="fas fa-user-circle"></i>
            <span>${acc.name}</span>
            ${acc.running ? '<span class="dot online"></span>' : '<span class="dot offline"></span>'}
        </div>
    `).join('');

    dropdown.querySelectorAll('.account-option').forEach(el => {
        el.addEventListener('click', () => {
            switchAccount(el.dataset.id);
            dropdown.classList.remove('show');
        });
    });
}

function switchAccount(id) {
    console.log('switchAccount called with id:', id, 'current accounts:', JSON.stringify(accounts));
    currentAccountId = id;
    localStorage.setItem(CURRENT_ACCOUNT_STORAGE_KEY, String(id || ''));
    expHistory = [];
    lastOperationsData = {};
    renderAccountSelector();
    const acc = accounts.find(a => a.id === id);
    console.log('找到的账号:', JSON.stringify(acc));
    if (acc) {
        console.log('更新topbar账号为:', acc.name);
        $('current-account-name').textContent = acc.name;
        updateTopbarAccount(acc);
    } else {
        console.log('未找到id为', id, '的账号');
    }
    const seedSel = $('seed-select');
    if (seedSel) {
        seedSel.dataset.loaded = '0';
        seedSel.innerHTML = '<option value="0">自动选择 (按策略)</option>';
    }
    renderOpsList({});
    // 刷新所有数据
    pollStatus({ syncNextChecks: true });
    pollFertilizerBuckets(true);
    pollLogs();
    Promise.resolve(loadSettings()).catch(() => null);
    if ($('page-personal').classList.contains('active')) {
        loadDailyGifts();
        loadBag();
        loadFarm();
    }
    if ($('page-friends').classList.contains('active')) loadFriends();
}

$('current-account-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    $('account-dropdown').classList.toggle('show');
});

document.addEventListener('click', () => $('account-dropdown').classList.remove('show'));

// ============ 核心轮询 ============
// 限制经验效率更新频率 (每10秒)
let lastRateUpdate = 0;
let lastFertilizerPollAt = 0;
let localNextFarmRemainSec = NaN;
let localNextFriendRemainSec = NaN;
let nextCheckSyncRequested = false;
let nextCheckSyncPending = false;
const LOG_VIRTUAL_ROW_HEIGHT = 28;
const LOG_VIRTUAL_OVERSCAN = 10;
let logVirtualItems = [];
let logVirtualScrollRaf = null;
let logVirtualBoundWrap = null;

function resetLocalNextChecks() {
    localNextFarmRemainSec = NaN;
    localNextFriendRemainSec = NaN;
    nextCheckSyncRequested = false;
    const farmEl = $('next-farm-check');
    const friendEl = $('next-friend-check');
    if (farmEl) farmEl.textContent = '--';
    if (friendEl) friendEl.textContent = '--';
}

function renderLocalNextChecks() {
    const farmEl = $('next-farm-check');
    const friendEl = $('next-friend-check');
    if (farmEl) {
        farmEl.textContent = Number.isFinite(localNextFarmRemainSec)
            ? fmtTime(Math.max(0, localNextFarmRemainSec))
            : '--';
    }
    if (friendEl) {
        friendEl.textContent = Number.isFinite(localNextFriendRemainSec)
            ? fmtTime(Math.max(0, localNextFriendRemainSec))
            : '--';
    }
}

setInterval(() => {
    let reachedZero = false;
    if (Number.isFinite(localNextFarmRemainSec) && localNextFarmRemainSec > 0) {
        localNextFarmRemainSec = Math.max(0, localNextFarmRemainSec - 1);
        if (localNextFarmRemainSec === 0) reachedZero = true;
    }
    if (Number.isFinite(localNextFriendRemainSec) && localNextFriendRemainSec > 0) {
        localNextFriendRemainSec = Math.max(0, localNextFriendRemainSec - 1);
        if (localNextFriendRemainSec === 0) reachedZero = true;
    }
    renderLocalNextChecks();

    if (reachedZero && !nextCheckSyncRequested && isLoggedIn && currentAccountId) {
        nextCheckSyncRequested = true;
        pollStatus({ syncNextChecks: true })
            .catch(() => null)
            .finally(() => { nextCheckSyncRequested = false; });
    }
}, 1000);

function ensureVirtualLogBinding(wrap) {
    if (!wrap || logVirtualBoundWrap === wrap) return;
    logVirtualBoundWrap = wrap;
    wrap.addEventListener('scroll', () => {
        if (logVirtualScrollRaf) return;
        logVirtualScrollRaf = requestAnimationFrame(() => {
            logVirtualScrollRaf = null;
            renderVirtualLogsWindow(wrap);
        });
    }, { passive: true });
}

function buildLogRowHtml(l) {
    const name = l.accountName ? `【${l.accountName}】` : '';
    const timeStr = ((l.time || '').split(' ')[1] || (l.time || ''));
    const moduleMap = {
        farm: '农场',
        friend: '好友',
        warehouse: '仓库',
        task: '任务',
        system: '系统',
    };
    const moduleKey = (l.meta && l.meta.module) ? String(l.meta.module) : '';
    const moduleLabel = moduleMap[moduleKey] || '系统';
    const eventKey = (l.meta && l.meta.event) ? String(l.meta.event) : '';
    const eventLabel = LOG_EVENT_LABELS[eventKey] || '';
    const ev = eventLabel ? `[${eventLabel}]` : '';
    return `<div class="log-row ${l.isWarn ? 'warn' : ''}">
        <span class="log-time">${escapeHtml(timeStr)}</span>
        <span class="log-tag">[${escapeHtml(moduleLabel)}]</span>
        <span class="log-msg">${escapeHtml(`${name}${ev} ${l.msg}`)}</span>
    </div>`;
}

function renderVirtualLogsWindow(wrap) {
    if (!wrap) return;
    ensureVirtualLogBinding(wrap);
    if (!logVirtualItems.length) {
        wrap.innerHTML = '<div class="log-row">暂无日志</div>';
        return;
    }

    const total = logVirtualItems.length;
    const viewportH = Math.max(1, wrap.clientHeight || 320);
    const visibleCount = Math.max(1, Math.ceil(viewportH / LOG_VIRTUAL_ROW_HEIGHT) + LOG_VIRTUAL_OVERSCAN * 2);
    const start = Math.max(0, Math.floor(wrap.scrollTop / LOG_VIRTUAL_ROW_HEIGHT) - LOG_VIRTUAL_OVERSCAN);
    const end = Math.min(total, start + visibleCount);
    const topPad = start * LOG_VIRTUAL_ROW_HEIGHT;
    const bottomPad = Math.max(0, (total - end) * LOG_VIRTUAL_ROW_HEIGHT);
    const rows = logVirtualItems.slice(start, end).map(buildLogRowHtml).join('');
    wrap.innerHTML = `<div style="height:${topPad}px"></div>${rows}<div style="height:${bottomPad}px"></div>`;
}

function formatBucketHoursText(item) {
    if (!item) return '0.0h';
    const raw = String(item.hoursText || '').trim();
    if (raw) return raw.replace('小时', 'h');
    const count = Number(item.count || 0);
    const hoursFloor1 = Math.floor((count / 3600) * 10) / 10;
    return `${hoursFloor1.toFixed(1)}h`;
}

async function pollFertilizerBuckets(force = false) {
    if (!currentAccountId) return;
    const now = Date.now();
    if (!force && now - lastFertilizerPollAt < 15000) return;
    lastFertilizerPollAt = now;
    const key = `pollFertilizerBuckets:${currentAccountId}`;
    return runDedupedRequest(key, async () => {
        const data = await api('/api/bag');
        const items = (data && Array.isArray(data.items)) ? data.items : [];
        const normal = items.find(it => Number(it.id || 0) === 1011);
        const organic = items.find(it => Number(it.id || 0) === 1012);
        const collectNormal = items.find(it => Number(it.id || 0) === 3001);
        const collectRare = items.find(it => Number(it.id || 0) === 3002);
        updateValueWithAnim('fert-normal-hours', formatBucketHoursText(normal));
        updateValueWithAnim('fert-organic-hours', formatBucketHoursText(organic));
        updateValueWithAnim('collect-normal', String(Number((collectNormal && collectNormal.count) || 0)));
        updateValueWithAnim('collect-rare', String(Number((collectRare && collectRare.count) || 0)));
    });
}

async function pollStatus(options = {}) {
    if (options && options.syncNextChecks) {
        nextCheckSyncPending = true;
    }
    if (!currentAccountId) {
        $('conn-text').textContent = '请添加账号';
        $('conn-dot').className = 'dot offline';
        resetDashboardStats();
        resetLocalNextChecks();
        nextCheckSyncPending = false;
        return;
    }
    const key = `pollStatus:${currentAccountId}`;
    return runDedupedRequest(key, async () => {
        const data = await api('/api/status');

        if (!data) {
            $('conn-text').textContent = '未连接';
            $('conn-dot').className = 'dot offline';
            lastServerUptime = 0;
            lastSyncTimestamp = 0;
            renderOpsList({});
            resetLocalNextChecks();
            nextCheckSyncPending = false;
            if (currentAccountId) {
                loadAccounts();
            }
            return;
        }

        const isConnected = data.connection?.connected;
        const statusRevision = Number(data.configRevision || 0);
        if (statusRevision > latestConfigRevision) latestConfigRevision = statusRevision;
        if (expectedConfigRevision > 0 && statusRevision >= expectedConfigRevision) {
            pendingAutomationKeys.clear();
        }
        $('conn-text').textContent = isConnected ? '运行中' : '未连接';
        $('conn-dot').className = 'dot ' + (isConnected ? 'online' : 'offline');

        const wsError = data.wsError || null;
        if (wsError && Number(wsError.code) === 400 && currentAccountId) {
            const errAt = Number(wsError.at) || 0;
            const lastNotified = Number(wsErrorNotifiedAt[currentAccountId] || 0);
            if (errAt && errAt > lastNotified) {
                wsErrorNotifiedAt[currentAccountId] = errAt;
                if (typeof editAccount === 'function') {
                    editAccount(currentAccountId);
                }
            }
        }

        // Stats
        $('level').textContent = data.status?.level ? 'Lv' + data.status.level : '-';

        updateValueWithAnim('gold', String(data.status?.gold ?? '-'), 'value-changed-gold');
        updateValueWithAnim('coupon', String(data.status?.coupon ?? 0));
        pollFertilizerBuckets();

        if (data.uptime !== undefined) {
            lastServerUptime = data.uptime;
            lastSyncTimestamp = Date.now();
            updateUptimeDisplay();
        }

        if (nextCheckSyncPending) {
            const farmRemain = toSafeNumber(data.nextChecks?.farmRemainSec, NaN);
            const friendRemain = toSafeNumber(data.nextChecks?.friendRemainSec, NaN);
            localNextFarmRemainSec = Number.isFinite(farmRemain) ? Math.max(0, Math.floor(farmRemain)) : NaN;
            localNextFriendRemainSec = Number.isFinite(friendRemain) ? Math.max(0, Math.floor(friendRemain)) : NaN;
            renderLocalNextChecks();
            nextCheckSyncPending = false;
        }

        // Exp
        const ep = data.expProgress;
        if (ep && ep.needed > 0) {
            const pct = Math.min(100, (ep.current / ep.needed) * 100);
            $('exp-fill').style.width = pct + '%';
            $('exp-num').textContent = ep.current + '/' + ep.needed;
        }

        // Session Gains & History
        const expGain = toSafeNumber(data.sessionExpGained, 0);
        const goldGain = toSafeNumber(data.sessionGoldGained, 0);
        const couponGain = toSafeNumber(data.sessionCouponGained, 0);

        // stat-exp 显示会话总增量
        updateValueWithAnim('stat-exp', (expGain >= 0 ? '+' : '') + Math.floor(expGain));
        updateValueWithAnim('stat-gold', (goldGain >= 0 ? '+' : '') + Math.floor(goldGain), 'value-changed-gold');
        const goldGainEl = $('stat-gold');
        if (goldGainEl) {
            goldGainEl.classList.toggle('negative', goldGain < 0);
        }
        updateValueWithAnim('stat-coupon', (couponGain >= 0 ? '+' : '') + Math.floor(couponGain));
        const couponGainEl = $('stat-coupon');
        if (couponGainEl) {
            couponGainEl.classList.toggle('negative', couponGain < 0);
        }

        // 记录历史数据用于图表 (每分钟记录一次)
        const now = new Date();
        const timeLabel = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
        if (expHistory.length === 0 || expHistory[expHistory.length - 1].time !== timeLabel) {
            expHistory.push({ time: timeLabel, exp: expGain, ts: now.getTime() });
            if (expHistory.length > 60) expHistory.shift();
        }

        // 效率计算 (每10秒更新一次)
        if (Date.now() - lastRateUpdate > 10000) {
            lastRateUpdate = Date.now();
            if (data.uptime > 0) { // 只要运行时间大于0就显示
                const hours = data.uptime / 3600;
                const finalRatePerHour = hours > 0 ? (expGain / hours) : 0;
                const rateDisplay = Math.floor(finalRatePerHour) + '/时';
                $('exp-rate').textContent = rateDisplay;

                // 预计升级
                if (data.expProgress && data.expProgress.needed > 0 && finalRatePerHour > 0) {
                    // 计算还需要多少经验
                    const expNeeded = data.expProgress.needed - data.expProgress.current;
                    if (expNeeded > 0) {
                        const minsToLevel = expNeeded / (finalRatePerHour / 60);
                        if (minsToLevel < 60) {
                            $('time-to-level').textContent = `约 ${Math.ceil(minsToLevel)} 分钟升级`;
                        } else {
                            $('time-to-level').textContent = `约 ${(minsToLevel / 60).toFixed(1)} 小时升级`;
                        }
                    } else {
                        $('time-to-level').textContent = '即将升级';
                    }
                } else if (finalRatePerHour <= 0) {
                    $('time-to-level').textContent = '等待收益...';
                }
            } else {
                $('exp-rate').textContent = '等待数据...';
                $('time-to-level').textContent = '';
            }
        }

        // Automation Switches
        const auto = data.automation || {};
        if (!pendingAutomationKeys.has('farm')) $('auto-farm').checked = !!auto.farm;
        if (!pendingAutomationKeys.has('farm_push')) $('auto-farm-push').checked = !!auto.farm_push;
        if (!pendingAutomationKeys.has('land_upgrade')) $('auto-land-upgrade').checked = !!auto.land_upgrade;
        if (!pendingAutomationKeys.has('friend_help_exp_limit')) $('auto-friend').checked = !!auto.friend_help_exp_limit;
        if (!pendingAutomationKeys.has('task')) $('auto-task').checked = !!auto.task;
        if (!pendingAutomationKeys.has('sell')) $('auto-sell').checked = !!auto.sell;

        // 只有当用户没有正在操作时才更新下拉框，避免打断用户
        if (!pendingAutomationKeys.has('fertilizer') && document.activeElement !== $('fertilizer-select') && auto.fertilizer) {
            $('fertilizer-select').value = auto.fertilizer;
        }

        // 好友细分开关
        if (!pendingAutomationKeys.has('friend_steal')) $('auto-friend-steal').checked = !!auto.friend_steal;
        if (!pendingAutomationKeys.has('friend_help')) $('auto-friend-help').checked = !!auto.friend_help;
        if (!pendingAutomationKeys.has('friend_bad')) $('auto-friend-bad').checked = !!auto.friend_bad;
        updateFriendSubControlsState();

        // Operations Stats
        const opsPayload = (data.operations && typeof data.operations === 'object')
            ? data.operations
            : lastOperationsData;
        renderOpsList(opsPayload || {});

        // Seed Pref
        if (document.activeElement !== $('seed-select') && data.preferredSeed !== undefined) {
            const sel = $('seed-select');
            const strategySel = $('strategy-select');
            const isPreferred = !strategySel || String(strategySel.value || 'preferred') === 'preferred';
            if (isPreferred) {
                if (sel.dataset.loaded !== '1') {
                    await loadSeeds(data.preferredSeed);
                } else {
                    sel.value = String(data.preferredSeed || 0);
                }
            }
        }
    });
}

async function pollLogs() {
    const query = buildLogQuery();
    const key = `pollLogs:${query}`;
    return runDedupedRequest(key, async () => {
        const list = await api(`/api/logs?${query}`);
        const wrap = $('logs-list');
        const serverLogs = (Array.isArray(list) ? list : []).filter((l) => !shouldHideLogEntry(l));
        const uiLogs = localUiLogs.filter(matchLogFilters);
        const normalized = [...serverLogs, ...uiLogs].sort((a, b) => toLogTs(a) - toLogTs(b));
        if (!normalized.length) {
            lastLogsRenderKey = '';
            logVirtualItems = [];
            renderVirtualLogsWindow(wrap);
            return;
        }
        const renderKey = JSON.stringify(normalized.map(l => [toLogTs(l), l.time, l.tag, l.msg, !!l.isWarn, l.accountId, (l.meta && l.meta.event) || '', (l.meta && l.meta.module) || '']));
        if (renderKey === lastLogsRenderKey) {
            renderVirtualLogsWindow(wrap);
            return;
        }
        const isNearBottom = wrap ? (wrap.scrollTop + wrap.clientHeight >= wrap.scrollHeight - 12) : false;
        lastLogsRenderKey = renderKey;
        logVirtualItems = normalized;
        renderVirtualLogsWindow(wrap);
        if (isNearBottom && wrap) {
            wrap.scrollTop = wrap.scrollHeight;
            renderVirtualLogsWindow(wrap);
        }
    });
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// ============ 功能模块 ============
