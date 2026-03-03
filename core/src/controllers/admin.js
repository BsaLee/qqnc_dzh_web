const crypto = require('node:crypto');
/**
 * 管理面板 HTTP 服务
 * 改写为接收 DataProvider 模式
 */

const fs = require('node:fs');
const path = require('node:path');
const process = require('node:process');
const express = require('express');
const { Server: SocketIOServer } = require('socket.io');
const { version } = require('../../package.json');
const { CONFIG } = require('../config/config');
const { getLevelExpProgress } = require('../config/gameConfig');
const { getResourcePath } = require('../config/runtime-paths');
const store = require('../models/store');
const { addOrUpdateAccount, deleteAccount } = store;
const { findAccountByRef, normalizeAccountRef, resolveAccountId } = require('../services/account-resolver');
const { createModuleLogger } = require('../services/logger');
const { MiniProgramLoginSession } = require('../services/qrlogin');
const { getSchedulerRegistrySnapshot } = require('../services/scheduler');

const hashPassword = (pwd) => crypto.createHash('sha256').update(String(pwd || '')).digest('hex');
const adminLogger = createModuleLogger('admin');

// 安全配置
const SECURITY_CONFIG = {
    maxLoginAttempts: 5,
    lockoutDuration: 15 * 60 * 1000,
    tokenExpiry: 24 * 60 * 60 * 1000,
    rateLimitWindow: 15 * 60 * 1000,
    rateLimitMax: 10,
    minPasswordLength: 8,
    maxUsernameLength: 32,
    minUsernameLength: 3,
    cleanupInterval: 60 * 60 * 1000,
};

// 登录尝试记录
const loginAttempts = new Map();
// 速率限制记录
const rateLimitStore = new Map();

// 定期清理过期记录
function cleanupExpiredRecords() {
    const now = Date.now();
    
    // 清理过期的登录尝试记录
    for (const [key, attempts] of loginAttempts.entries()) {
        if (attempts.lockedUntil && now > attempts.lockedUntil + SECURITY_CONFIG.lockoutDuration) {
            loginAttempts.delete(key);
        } else if (!attempts.lockedUntil && attempts.count > 0) {
            loginAttempts.delete(key);
        }
    }
    
    // 清理过期的速率限制记录
    for (const [key, record] of rateLimitStore.entries()) {
        if (now > record.resetAt) {
            rateLimitStore.delete(key);
        }
    }
    
    adminLogger.debug('清理过期安全记录', { 
        loginAttemptsRemaining: loginAttempts.size,
        rateLimitRecordsRemaining: rateLimitStore.size 
    });
}

// 启动定期清理
let cleanupTimer = null;
function startCleanupTimer() {
    if (cleanupTimer) clearInterval(cleanupTimer);
    cleanupTimer = setInterval(cleanupExpiredRecords, SECURITY_CONFIG.cleanupInterval);
}

function checkRateLimit(key) {
    const now = Date.now();
    const record = rateLimitStore.get(key) || { count: 0, resetAt: now + SECURITY_CONFIG.rateLimitWindow };
    
    if (now > record.resetAt) {
        record.count = 0;
        record.resetAt = now + SECURITY_CONFIG.rateLimitWindow;
    }
    
    record.count++;
    rateLimitStore.set(key, record);
    
    return record.count <= SECURITY_CONFIG.rateLimitMax;
}

function checkLoginLockout(key) {
    const attempts = loginAttempts.get(key);
    if (!attempts) return { locked: false };
    
    if (attempts.lockedUntil && Date.now() < attempts.lockedUntil) {
        return { 
            locked: true, 
            remainingTime: Math.ceil((attempts.lockedUntil - Date.now()) / 1000 / 60)
        };
    }
    
    return { locked: false };
}

function recordLoginAttempt(key, success) {
    if (success) {
        loginAttempts.delete(key);
        return;
    }
    
    const attempts = loginAttempts.get(key) || { count: 0 };
    attempts.count++;
    
    if (attempts.count >= SECURITY_CONFIG.maxLoginAttempts) {
        attempts.lockedUntil = Date.now() + SECURITY_CONFIG.lockoutDuration;
        adminLogger.warn('账户锁定', { key, attempts: attempts.count });
    }
    
    loginAttempts.set(key, attempts);
}

function validateUsername(name) {
    if (!name || name.length < SECURITY_CONFIG.minUsernameLength) {
        return { valid: false, error: `用户名至少${SECURITY_CONFIG.minUsernameLength}个字符` };
    }
    if (name.length > SECURITY_CONFIG.maxUsernameLength) {
        return { valid: false, error: `用户名最多${SECURITY_CONFIG.maxUsernameLength}个字符` };
    }
    if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(name)) {
        return { valid: false, error: '用户名只能包含字母、数字、下划线或中文' };
    }
    const lowerName = name.toLowerCase();
    if (lowerName === 'admin' || lowerName === 'administrator' || lowerName === '管理员') {
        return { valid: false, error: '该用户名已被保留，请使用其他用户名' };
    }
    return { valid: true };
}

function validatePassword(pwd) {
    if (!pwd || pwd.length < SECURITY_CONFIG.minPasswordLength) {
        return { valid: false, error: `密码至少${SECURITY_CONFIG.minPasswordLength}个字符` };
    }
    if (pwd.length > 128) {
        return { valid: false, error: '密码最多128个字符' };
    }
    if (!/[a-z]/.test(pwd)) {
        return { valid: false, error: '密码需包含小写字母' };
    }
    if (!/[A-Z]/.test(pwd)) {
        return { valid: false, error: '密码需包含大写字母' };
    }
    if (!/\d/.test(pwd)) {
        return { valid: false, error: '密码需包含数字' };
    }
    return { valid: true };
}

let app = null;
let server = null;
let provider = null;
let io = null;

function emitRealtimeStatus(accountId, status) {
    if (!io) return;
    const id = String(accountId || '').trim();
    if (!id) return;
    io.to(`account:${id}`).emit('status:update', { accountId: id, status });
    io.to('account:all').emit('status:update', { accountId: id, status });
}

function emitRealtimeLog(entry) {
    if (!io) return;
    const payload = (entry && typeof entry === 'object') ? entry : {};
    const id = String(payload.accountId || '').trim();
    if (id) io.to(`account:${id}`).emit('log:new', payload);
    io.to('account:all').emit('log:new', payload);
}

function emitRealtimeAccountLog(entry) {
    if (!io) return;
    const payload = (entry && typeof entry === 'object') ? entry : {};
    const id = String(payload.accountId || '').trim();
    if (id) io.to(`account:${id}`).emit('account-log:new', payload);
    io.to('account:all').emit('account-log:new', payload);
}

function startAdminServer(dataProvider) {
    if (app) return;
    provider = dataProvider;
    
    // 启动定期清理过期记录
    startCleanupTimer();

    app = express();
    app.use(express.json());

    const tokens = new Map();
    const userTokens = new Map();

    const issueToken = () => crypto.randomBytes(24).toString('hex');
    
    const addAdminToken = (token) => {
        tokens.set(token, { createdAt: Date.now() });
    };
    
    const addUserToken = (token, username) => {
        userTokens.set(token, { username, createdAt: Date.now() });
    };
    
    const isTokenExpired = (createdAt) => {
        return Date.now() - createdAt > SECURITY_CONFIG.tokenExpiry;
    };
    
    const authRequired = (req, res, next) => {
        const token = req.headers['x-admin-token'];
        if (!token) {
            return res.status(401).json({ ok: false, error: 'Unauthorized' });
        }
        const tokenData = tokens.get(token);
        if (!tokenData) {
            return res.status(401).json({ ok: false, error: 'Unauthorized' });
        }
        if (isTokenExpired(tokenData.createdAt)) {
            tokens.delete(token);
            return res.status(401).json({ ok: false, error: 'Token已过期，请重新登录' });
        }
        req.adminToken = token;
        req.userType = 'admin';
        next();
    };
    
    const userAuthRequired = (req, res, next) => {
        const token = req.headers['x-admin-token'];
        if (!token) {
            return res.status(401).json({ ok: false, error: 'Unauthorized' });
        }
        const adminTokenData = tokens.get(token);
        if (adminTokenData) {
            if (isTokenExpired(adminTokenData.createdAt)) {
                tokens.delete(token);
                return res.status(401).json({ ok: false, error: 'Token已过期，请重新登录' });
            }
            req.adminToken = token;
            req.userType = 'admin';
            return next();
        }
        const userSession = userTokens.get(token);
        if (!userSession) {
            return res.status(401).json({ ok: false, error: 'Unauthorized' });
        }
        if (isTokenExpired(userSession.createdAt)) {
            userTokens.delete(token);
            return res.status(401).json({ ok: false, error: 'Token已过期，请重新登录' });
        }
        req.userToken = token;
        req.userType = 'user';
        req.username = userSession.username;
        next();
    };

    app.use((req, res, next) => {
        const allowedOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000'];
        const origin = req.headers.origin;
        if (origin && allowedOrigins.includes(origin)) {
            res.header('Access-Control-Allow-Origin', origin);
        } else {
            res.header('Access-Control-Allow-Origin', 'http://localhost:3000');
        }
        res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, x-account-id, x-admin-token');
        res.header('X-Content-Type-Options', 'nosniff');
        res.header('X-Frame-Options', 'DENY');
        res.header('X-XSS-Protection', '1; mode=block');
        if (req.method === 'OPTIONS') return res.sendStatus(200);
        next();
    });

    const webDist = path.join(__dirname, '../../../web/dist');
    if (fs.existsSync(webDist)) {
        app.use(express.static(webDist));
    } else {
        adminLogger.warn('web build not found', { webDist });
        app.get('/', (req, res) => res.send('web build not found. Please build the web project.'));
    }
    app.use('/game-config', express.static(getResourcePath('gameConfig')));

    // ============ 用户注册/登录 API ============
    app.post('/api/user/register', (req, res) => {
        const clientKey = req.ip || req.connection.remoteAddress || 'unknown';
        
        if (!checkRateLimit(`register:${clientKey}`)) {
            return res.status(429).json({ ok: false, error: '请求过于频繁，请稍后再试' });
        }
        
        const { username, password } = req.body || {};
        const name = String(username || '').trim();
        const pwd = String(password || '');
        
        const usernameValidation = validateUsername(name);
        if (!usernameValidation.valid) {
            return res.status(400).json({ ok: false, error: usernameValidation.error });
        }
        
        const passwordValidation = validatePassword(pwd);
        if (!passwordValidation.valid) {
            return res.status(400).json({ ok: false, error: passwordValidation.error });
        }
        
        const existing = store.getUser(name);
        if (existing) {
            return res.status(400).json({ ok: false, error: '用户名已存在' });
        }
        
        const user = store.createUser(name, hashPassword(pwd));
        if (!user) {
            return res.status(500).json({ ok: false, error: '注册失败' });
        }
        
        const token = issueToken();
        addUserToken(token, name);
        adminLogger.info('用户注册成功', { username: name });
        res.json({ ok: true, data: { token, username: name, userType: 'user' } });
    });

    app.post('/api/user/login', (req, res) => {
        const { username, password } = req.body || {};
        const name = String(username || '').trim();
        const pwd = String(password || '');
        const clientKey = `user:${name}`;
        
        const lockout = checkLoginLockout(clientKey);
        if (lockout.locked) {
            return res.status(423).json({ 
                ok: false, 
                error: `账户已锁定，请${lockout.remainingTime}分钟后再试` 
            });
        }
        
        const user = store.validateUser(name, hashPassword(pwd));
        if (!user) {
            recordLoginAttempt(clientKey, false);
            const attempts = (loginAttempts.get(clientKey)?.count || 0);
            const remaining = SECURITY_CONFIG.maxLoginAttempts - attempts;
            return res.status(401).json({ 
                ok: false, 
                error: `用户名或密码错误${remaining > 0 ? `，剩余${remaining}次尝试机会` : ''}` 
            });
        }
        
        recordLoginAttempt(clientKey, true);
        const token = issueToken();
        addUserToken(token, name);
        adminLogger.info('用户登录成功', { username: name });
        res.json({ ok: true, data: { token, username: name, userType: 'user' } });
    });

    // ============ 管理员登录 API ============
    app.post('/api/admin/login', (req, res) => {
        const { password } = req.body || {};
        const input = String(password || '');
        const clientKey = 'admin';
        
        const lockout = checkLoginLockout(clientKey);
        if (lockout.locked) {
            return res.status(423).json({ 
                ok: false, 
                error: `管理员账户已锁定，请${lockout.remainingTime}分钟后再试` 
            });
        }
        
        const storedHash = store.getAdminPasswordHash ? store.getAdminPasswordHash() : '';
        let ok = false;
        if (storedHash) {
            ok = hashPassword(input) === storedHash;
        } else {
            ok = input === String(CONFIG.adminPassword || '');
        }
        if (!ok) {
            recordLoginAttempt(clientKey, false);
            const attempts = (loginAttempts.get(clientKey)?.count || 0);
            const remaining = SECURITY_CONFIG.maxLoginAttempts - attempts;
            return res.status(401).json({ 
                ok: false, 
                error: `密码错误${remaining > 0 ? `，剩余${remaining}次尝试机会` : ''}` 
            });
        }
        
        recordLoginAttempt(clientKey, true);
        const token = issueToken();
        addAdminToken(token);
        adminLogger.info('管理员登录成功');
        res.json({ ok: true, data: { token, userType: 'admin' } });
    });

    // 兼容旧的登录 API
    app.post('/api/login', (req, res) => {
        const { password } = req.body || {};
        const input = String(password || '');
        const clientKey = 'admin';
        
        const lockout = checkLoginLockout(clientKey);
        if (lockout.locked) {
            return res.status(423).json({ 
                ok: false, 
                error: `管理员账户已锁定，请${lockout.remainingTime}分钟后再试` 
            });
        }
        
        const storedHash = store.getAdminPasswordHash ? store.getAdminPasswordHash() : '';
        let ok = false;
        if (storedHash) {
            ok = hashPassword(input) === storedHash;
        } else {
            ok = input === String(CONFIG.adminPassword || '');
        }
        if (!ok) {
            recordLoginAttempt(clientKey, false);
            const attempts = (loginAttempts.get(clientKey)?.count || 0);
            const remaining = SECURITY_CONFIG.maxLoginAttempts - attempts;
            return res.status(401).json({ 
                ok: false, 
                error: `密码错误${remaining > 0 ? `，剩余${remaining}次尝试机会` : ''}` 
            });
        }
        
        recordLoginAttempt(clientKey, true);
        const token = issueToken();
        addAdminToken(token);
        res.json({ ok: true, data: { token } });
    });

    // 用户认证路由白名单
    const publicPaths = ['/login', '/user/register', '/user/login', '/admin/login', '/qr/create', '/qr/check'];
    app.use('/api', (req, res, next) => {
        if (publicPaths.some(p => req.path === p || req.path.startsWith(p + '/'))) return next();
        return userAuthRequired(req, res, next);
    });

    // ============ 用户管理 API（仅管理员） ============
    app.get('/api/users', (req, res, next) => {
        if (req.userType !== 'admin') {
            return res.status(403).json({ ok: false, error: '需要管理员权限' });
        }
        const users = store.getUsers();
        const userList = Object.values(users).map(u => ({
            username: u.username,
            createdAt: u.createdAt,
            isAdmin: u.isAdmin || false,
            enabled: u.enabled !== false,
        }));
        res.json({ ok: true, data: userList });
    });

    app.post('/api/users/:username/toggle', (req, res, next) => {
        if (req.userType !== 'admin') {
            return res.status(403).json({ ok: false, error: '需要管理员权限' });
        }
        const username = req.params.username;
        const user = store.getUser(username);
        if (!user) {
            return res.status(404).json({ ok: false, error: '用户不存在' });
        }
        if (user.isAdmin) {
            return res.status(400).json({ ok: false, error: '不能禁用管理员' });
        }
        const updated = store.updateUser(username, { enabled: !user.enabled });
        res.json({ ok: true, data: { username, enabled: updated.enabled } });
    });

    app.delete('/api/users/:username', (req, res, next) => {
        if (req.userType !== 'admin') {
            return res.status(403).json({ ok: false, error: '需要管理员权限' });
        }
        const username = req.params.username;
        const deleted = store.deleteUser(username);
        if (!deleted) {
            return res.status(400).json({ ok: false, error: '无法删除用户' });
        }
        // 清除该用户的 token
        for (const [token, session] of userTokens.entries()) {
            if (session.username === username) {
                userTokens.delete(token);
            }
        }
        res.json({ ok: true });
    });

    app.post('/api/admin/change-password', (req, res) => {
        const body = req.body || {};
        const oldPassword = String(body.oldPassword || '');
        const newPassword = String(body.newPassword || '');
        if (newPassword.length < 4) {
            return res.status(400).json({ ok: false, error: '新密码长度至少为 4 位' });
        }
        const storedHash = store.getAdminPasswordHash ? store.getAdminPasswordHash() : '';
        const ok = storedHash
            ? hashPassword(oldPassword) === storedHash
            : oldPassword === String(CONFIG.adminPassword || '');
        if (!ok) {
            return res.status(400).json({ ok: false, error: '原密码错误' });
        }
        const nextHash = hashPassword(newPassword);
        if (store.setAdminPasswordHash) {
            store.setAdminPasswordHash(nextHash);
        }
        res.json({ ok: true });
    });

    app.get('/api/ping', (req, res) => {
        res.json({ ok: true, data: { ok: true, uptime: process.uptime(), version } });
    });

    app.get('/api/auth/validate', (req, res) => {
        res.json({ ok: true, data: { valid: true } });
    });

    // API: 调度任务快照（用于调度收敛排查）
    app.get('/api/scheduler', async (req, res) => {
        try {
            const id = getAccId(req);
            if (provider && typeof provider.getSchedulerStatus === 'function') {
                const data = await provider.getSchedulerStatus(id);
                return res.json({ ok: true, data });
            }
            return res.json({ ok: true, data: { runtime: getSchedulerRegistrySnapshot(), worker: null, workerError: 'DataProvider does not support scheduler status' } });
        } catch (e) {
            return handleApiError(res, e);
        }
    });

    app.post('/api/logout', (req, res) => {
        const adminTokenValue = req.adminToken;
        const userTokenValue = req.userToken;
        
        // 清除管理员 Token
        if (adminTokenValue) {
            tokens.delete(adminTokenValue);
            if (io) {
                for (const socket of io.sockets.sockets.values()) {
                    if (String(socket.data.adminToken || '') === String(adminTokenValue)) {
                        socket.disconnect(true);
                    }
                }
            }
        }
        
        // 清除用户 Token
        if (userTokenValue) {
            userTokens.delete(userTokenValue);
            if (io) {
                for (const socket of io.sockets.sockets.values()) {
                    if (String(socket.data.userToken || '') === String(userTokenValue)) {
                        socket.disconnect(true);
                    }
                }
            }
        }
        
        res.json({ ok: true });
    });

    const getAccountList = () => {
        try {
            if (provider && typeof provider.getAccounts === 'function') {
                const data = provider.getAccounts();
                if (data && Array.isArray(data.accounts)) return data.accounts;
            }
        } catch {
            // ignore provider failures
        }
        const data = store.getAccounts ? store.getAccounts() : { accounts: [] };
        return Array.isArray(data.accounts) ? data.accounts : [];
    };

    const isSoftRuntimeError = (err) => {
        const msg = String((err && err.message) || '');
        return msg === '账号未运行' || msg === 'API Timeout';
    };

    function handleApiError(res, err) {
        if (isSoftRuntimeError(err)) {
            return res.json({ ok: false, error: err.message });
        }
        return res.status(500).json({ ok: false, error: err.message });
    }

    const resolveAccId = (rawRef) => {
        const input = normalizeAccountRef(rawRef);
        if (!input) return '';

        if (provider && typeof provider.resolveAccountId === 'function') {
            const resolvedByProvider = normalizeAccountRef(provider.resolveAccountId(input));
            if (resolvedByProvider) return resolvedByProvider;
        }

        const resolved = resolveAccountId(getAccountList(), input);
        return resolved || input;
    };

    // Helper to get account ID from header
    function getAccId(req) {
        return resolveAccId(req.headers['x-account-id']);
    }

    // API: 完整状态
    app.get('/api/status', async (req, res) => {
        const id = getAccId(req);
        if (!id) return res.json({ ok: false, error: 'Missing x-account-id' });

        try {
            const data = provider.getStatus(id);
            if (data && data.status) {
                const { level, exp } = data.status;
                const progress = getLevelExpProgress(level, exp);
                data.levelProgress = progress;
            }
            res.json({ ok: true, data });
        } catch (e) {
            res.json({ ok: false, error: e.message });
        }
    });

    app.post('/api/automation', async (req, res) => {
        const id = getAccId(req);
        if (!id) {
            return res.status(400).json({ ok: false, error: 'Missing x-account-id' });
        }
        try {
            let lastData = null;
            for (const [k, v] of Object.entries(req.body)) {
                lastData = await provider.setAutomation(id, k, v);
            }
            res.json({ ok: true, data: lastData || {} });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 农田详情
    app.get('/api/lands', async (req, res) => {
        const id = getAccId(req);
        if (!id) return res.status(400).json({ ok: false });
        try {
            const data = await provider.getLands(id);
            res.json({ ok: true, data });
        } catch (e) {
            handleApiError(res, e);
        }
    });

    // API: 好友列表
    app.get('/api/friends', async (req, res) => {
        const id = getAccId(req);
        if (!id) return res.status(400).json({ ok: false });
        try {
            const data = await provider.getFriends(id);
            res.json({ ok: true, data });
        } catch (e) {
            handleApiError(res, e);
        }
    });

    // API: 好友农田详情
    app.get('/api/friend/:gid/lands', async (req, res) => {
        const id = getAccId(req);
        if (!id) return res.status(400).json({ ok: false });
        try {
            const data = await provider.getFriendLands(id, req.params.gid);
            res.json({ ok: true, data });
        } catch (e) {
            handleApiError(res, e);
        }
    });

    // API: 对指定好友执行单次操作（偷菜/浇水/除草/捣乱）
    app.post('/api/friend/:gid/op', async (req, res) => {
        const id = getAccId(req);
        if (!id) return res.status(400).json({ ok: false, error: 'Missing x-account-id' });
        try {
            const opType = String((req.body || {}).opType || '');
            const data = await provider.doFriendOp(id, req.params.gid, opType);
            res.json({ ok: true, data });
        } catch (e) {
            handleApiError(res, e);
        }
    });

    // API: 好友黑名单
    app.get('/api/friend-blacklist', (req, res) => {
        const id = getAccId(req);
        if (!id) return res.status(400).json({ ok: false, error: 'Missing x-account-id' });
        const list = store.getFriendBlacklist ? store.getFriendBlacklist(id) : [];
        res.json({ ok: true, data: list });
    });

    app.post('/api/friend-blacklist/toggle', (req, res) => {
        const id = getAccId(req);
        if (!id) return res.status(400).json({ ok: false, error: 'Missing x-account-id' });
        const gid = Number((req.body || {}).gid);
        if (!gid) return res.status(400).json({ ok: false, error: 'Missing gid' });
        const current = store.getFriendBlacklist ? store.getFriendBlacklist(id) : [];
        let next;
        if (current.includes(gid)) {
            next = current.filter(g => g !== gid);
        } else {
            next = [...current, gid];
        }
        const saved = store.setFriendBlacklist ? store.setFriendBlacklist(id, next) : next;
        if (provider && typeof provider.broadcastConfig === 'function') {
            provider.broadcastConfig(id);
        }
        res.json({ ok: true, data: saved });
    });

    app.get('/api/steal-exclude-plants', (req, res) => {
        const id = getAccId(req);
        if (!id) return res.status(400).json({ ok: false, error: 'Missing x-account-id' });
        const list = store.getStealExcludePlants ? store.getStealExcludePlants(id) : [];
        res.json({ ok: true, data: list });
    });

    app.post('/api/steal-exclude-plants/toggle', (req, res) => {
        const id = getAccId(req);
        if (!id) return res.status(400).json({ ok: false, error: 'Missing x-account-id' });
        const plantId = Number((req.body || {}).plantId);
        if (!plantId) return res.status(400).json({ ok: false, error: 'Missing plantId' });
        const current = store.getStealExcludePlants ? store.getStealExcludePlants(id) : [];
        let next;
        if (current.includes(plantId)) {
            next = current.filter(p => p !== plantId);
        } else {
            next = [...current, plantId];
        }
        const saved = store.setStealExcludePlants ? store.setStealExcludePlants(id, next) : next;
        if (provider && typeof provider.broadcastConfig === 'function') {
            provider.broadcastConfig(id);
        }
        res.json({ ok: true, data: saved });
    });

    app.post('/api/steal-exclude-plants', (req, res) => {
        const id = getAccId(req);
        if (!id) return res.status(400).json({ ok: false, error: 'Missing x-account-id' });
        const list = Array.isArray((req.body || {}).plants) ? req.body.plants : [];
        const saved = store.setStealExcludePlants ? store.setStealExcludePlants(id, list) : list;
        if (provider && typeof provider.broadcastConfig === 'function') {
            provider.broadcastConfig(id);
        }
        res.json({ ok: true, data: saved });
    });

    app.get('/api/seeds', async (req, res) => {
        const id = getAccId(req);
        if (!id) return res.status(400).json({ ok: false });
        try {
            const data = await provider.getSeeds(id);
            res.json({ ok: true, data });
        } catch (e) {
            handleApiError(res, e);
        }
    });

    // API: 背包物品
    app.get('/api/bag', async (req, res) => {
        const id = getAccId(req);
        if (!id) return res.status(400).json({ ok: false });
        try {
            const data = await provider.getBag(id);
            res.json({ ok: true, data });
        } catch (e) {
            handleApiError(res, e);
        }
    });

    // API: 每日礼包状态总览
    app.get('/api/daily-gifts', async (req, res) => {
        const id = getAccId(req);
        if (!id) return res.status(400).json({ ok: false });
        try {
            const data = await provider.getDailyGifts(id);
            res.json({ ok: true, data });
        } catch (e) {
            handleApiError(res, e);
        }
    });

    // API: 启动账号
    app.post('/api/accounts/:id/start', (req, res) => {
        try {
            const ok = provider.startAccount(resolveAccId(req.params.id));
            if (!ok) {
                return res.status(404).json({ ok: false, error: 'Account not found' });
            }
            res.json({ ok: true });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 停止账号
    app.post('/api/accounts/:id/stop', (req, res) => {
        try {
            const ok = provider.stopAccount(resolveAccId(req.params.id));
            if (!ok) {
                return res.status(404).json({ ok: false, error: 'Account not found' });
            }
            res.json({ ok: true });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 农场一键操作
    app.post('/api/farm/operate', async (req, res) => {
        const id = getAccId(req);
        if (!id) return res.status(400).json({ ok: false });
        try {
            const { opType } = req.body; // 'harvest', 'clear', 'plant', 'all'
            await provider.doFarmOp(id, opType);
            res.json({ ok: true });
        } catch (e) {
            handleApiError(res, e);
        }
    });

    // API: 数据分析
    app.get('/api/analytics', async (req, res) => {
        try {
            const sortBy = req.query.sort || 'exp';
            const { getPlantRankings } = require('../services/analytics');
            const data = getPlantRankings(sortBy);
            res.json({ ok: true, data });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 设置页统一保存（单次写入+单次广播）
    app.post('/api/settings/save', async (req, res) => {
        const id = getAccId(req);
        if (!id) {
            return res.status(400).json({ ok: false, error: 'Missing x-account-id' });
        }
        try {
            const data = await provider.saveSettings(id, req.body || {});
            res.json({ ok: true, data: data || {} });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 设置面板主题
    app.post('/api/settings/theme', async (req, res) => {
        try {
            const theme = String((req.body || {}).theme || '');
            const data = await provider.setUITheme(theme);
            res.json({ ok: true, data: data || {} });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 保存下线提醒配置
    app.post('/api/settings/offline-reminder', async (req, res) => {
        try {
            const body = (req.body && typeof req.body === 'object') ? req.body : {};
            const data = store.setOfflineReminder ? store.setOfflineReminder(body) : {};
            res.json({ ok: true, data: data || {} });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 获取配置
    app.get('/api/settings', async (req, res) => {
        try {
            const id = getAccId(req);
            const intervals = store.getIntervals(id);
            const strategy = store.getPlantingStrategy(id);
            const preferredSeed = store.getPreferredSeed(id);
            const plantDelaySeconds = store.getPlantDelaySeconds ? store.getPlantDelaySeconds(id) : 1;
            const friendQuietHours = store.getFriendQuietHours(id);
            const automation = store.getAutomation(id);
            const ui = store.getUI();
            const stealExcludePlants = store.getStealExcludePlants ? store.getStealExcludePlants(id) : [];
            const offlineReminder = store.getOfflineReminder
                ? store.getOfflineReminder()
                : { channel: 'webhook', reloginUrlMode: 'none', endpoint: '', token: '', title: '账号下线提醒', msg: '账号下线', offlineDeleteSec: 120 };
            res.json({ ok: true, data: { intervals, strategy, preferredSeed, plantDelaySeconds, friendQuietHours, automation, ui, offlineReminder, stealExcludePlants } });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 账号管理
    app.get('/api/accounts', (req, res) => {
        try {
            const isAdmin = req.userType === 'admin';
            const username = req.username || 'admin';
            const data = provider.getAccounts(isAdmin ? null : username);
            res.json({ ok: true, data });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 更新账号备注（兼容旧接口）
    app.post('/api/account/remark', (req, res) => {
        try {
            const body = (req.body && typeof req.body === 'object') ? req.body : {};
            const rawRef = body.id || body.accountId || body.uin || req.headers['x-account-id'];
            const accountList = getAccountList();
            const target = findAccountByRef(accountList, rawRef);
            if (!target || !target.id) {
                return res.status(404).json({ ok: false, error: 'Account not found' });
            }

            const remark = String(body.remark !== undefined ? body.remark : body.name || '').trim();
            if (!remark) {
                return res.status(400).json({ ok: false, error: 'Missing remark' });
            }

            const accountId = String(target.id);
            const isAdmin = req.userType === 'admin';
            const username = req.username || 'admin';
            const data = addOrUpdateAccount({ id: accountId, name: remark }, username, isAdmin);
            if (provider && typeof provider.setRuntimeAccountName === 'function') {
                provider.setRuntimeAccountName(accountId, remark);
            }
            if (provider && provider.addAccountLog) {
                provider.addAccountLog('update', `更新账号备注: ${remark}`, accountId, remark);
            }
            res.json({ ok: true, data });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.post('/api/accounts', (req, res) => {
        try {
            const body = (req.body && typeof req.body === 'object') ? req.body : {};
            const isUpdate = !!body.id;
            const resolvedUpdateId = isUpdate ? resolveAccId(body.id) : '';
            const payload = isUpdate ? { ...body, id: resolvedUpdateId || String(body.id) } : body;
            
            const isAdmin = req.userType === 'admin';
            const username = req.username || 'admin';
            
            // 更新账号时的权限检查
            if (isUpdate) {
                const allAccounts = provider.getAccounts();
                const existingAccount = allAccounts.accounts.find(a => String(a.id) === payload.id);
                if (!existingAccount) {
                    return res.status(404).json({ ok: false, error: '账号不存在' });
                }
                if (!isAdmin && existingAccount.owner !== username) {
                    return res.status(403).json({ ok: false, error: '无权修改此账号' });
                }
            }
            
            let wasRunning = false;
            if (isUpdate && provider.isAccountRunning) {
                wasRunning = provider.isAccountRunning(payload.id);
            }

            // 检查是否仅修改了备注信息
            let onlyRemarkChanged = false;
            if (isUpdate) {
                const oldAccounts = provider.getAccounts();
                const oldAccount = oldAccounts.accounts.find(a => a.id === payload.id);
                if (oldAccount) {
                    // 检查 payload 中是否只包含 id 和 name 字段
                    const payloadKeys = Object.keys(payload);
                    const onlyIdAndName = payloadKeys.length === 2 && payloadKeys.includes('id') && payloadKeys.includes('name');
                    if (onlyIdAndName) {
                        onlyRemarkChanged = true;
                    }
                }
            }

            const data = addOrUpdateAccount(payload, username, isAdmin);
            if (provider.addAccountLog) {
                const accountId = isUpdate ? String(payload.id) : String((data.accounts[data.accounts.length - 1] || {}).id || '');
                const accountName = payload.name || '';
                provider.addAccountLog(
                    isUpdate ? 'update' : 'add',
                    isUpdate ? `更新账号: ${accountName || accountId}` : `添加账号: ${accountName || accountId}`,
                    accountId,
                    accountName
                );
            }
            // 新增账号不自动启动，由用户手动开启
            if (wasRunning && !onlyRemarkChanged) {
                // 如果是更新，且之前在运行，且不是仅修改备注，则重启
                provider.restartAccount(payload.id);
            }
            res.json({ ok: true, data });
        } catch (e) {
            if (e.code === 'ACCOUNT_LIMIT_EXCEEDED') {
                return res.status(400).json({ ok: false, error: e.message });
            }
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.delete('/api/accounts/:id', (req, res) => {
        try {
            const resolvedId = resolveAccId(req.params.id) || String(req.params.id || '');
            const isAdmin = req.userType === 'admin';
            const username = req.username || 'admin';
            
            const allAccounts = provider.getAccounts();
            const targetAccount = allAccounts.accounts.find(a => String(a.id) === resolvedId);
            
            if (!targetAccount) {
                return res.status(404).json({ ok: false, error: '账号不存在' });
            }
            
            if (!isAdmin && targetAccount.owner !== username) {
                return res.status(403).json({ ok: false, error: '无权删除此账号' });
            }
            
            provider.stopAccount(resolvedId);
            const data = deleteAccount(resolvedId);
            if (provider.addAccountLog) {
                provider.addAccountLog('delete', `删除账号: ${targetAccount.name || req.params.id}`, resolvedId, targetAccount.name || '');
            }
            res.json({ ok: true, data });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 账号日志
    app.get('/api/account-logs', (req, res) => {
        try {
            const limit = Number.parseInt(req.query.limit) || 100;
            const list = provider.getAccountLogs ? provider.getAccountLogs(limit) : [];
            // 与当前 web 前端保持一致：直接返回数组
            res.json(Array.isArray(list) ? list : []);
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 日志
    app.get('/api/logs', (req, res) => {
        const queryAccountIdRaw = (req.query.accountId || '').toString().trim();
        const id = queryAccountIdRaw ? (queryAccountIdRaw === 'all' ? '' : resolveAccId(queryAccountIdRaw)) : getAccId(req);
        const options = {
            limit: Number.parseInt(req.query.limit) || 100,
            tag: req.query.tag || '',
            module: req.query.module || '',
            event: req.query.event || '',
            keyword: req.query.keyword || '',
            isWarn: req.query.isWarn,
            timeFrom: req.query.timeFrom || '',
            timeTo: req.query.timeTo || '',
        };
        const list = provider.getLogs(id, options);
        res.json({ ok: true, data: list });
    });

    // API: 清空账号日志
    app.delete('/api/logs', (req, res) => {
        const queryAccountIdRaw = (req.query.accountId || '').toString().trim();
        const id = queryAccountIdRaw ? (queryAccountIdRaw === 'all' ? '' : resolveAccId(queryAccountIdRaw)) : getAccId(req);
        try {
            if (provider.clearLogs) {
                provider.clearLogs(id);
            }
            res.json({ ok: true });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 封禁账号黑名单
    app.get('/api/banned-accounts', (req, res) => {
        try {
            const list = store.getBannedAccounts();
            res.json({ ok: true, data: list });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.delete('/api/banned-accounts/:id', (req, res) => {
        try {
            const accountId = req.params.id;
            const list = store.removeBannedAccount(accountId);
            res.json({ ok: true, data: list });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // ============ QR Code Login APIs (无需账号选择) ============
    // 这些接口不需要 authRequired 也能调用（用于登录流程）
    app.post('/api/qr/create', async (req, res) => {
        try {
            const result = await MiniProgramLoginSession.requestLoginCode();
            res.json({ ok: true, data: result });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.post('/api/qr/check', async (req, res) => {
        const { code } = req.body || {};
        if (!code) {
            return res.status(400).json({ ok: false, error: 'Missing code' });
        }

        try {
            const result = await MiniProgramLoginSession.queryStatus(code);

            if (result.status === 'OK') {
                const ticket = result.ticket;
                const uin = result.uin || '';
                const nickname = result.nickname || ''; // 获取昵称
                const appid = '1112386029'; // Farm appid

                const authCode = await MiniProgramLoginSession.getAuthCode(ticket, appid);

                let avatar = '';
                if (uin) {
                    avatar = `https://q1.qlogo.cn/g?b=qq&nk=${uin}&s=640`;
                }

                res.json({ ok: true, data: { status: 'OK', code: authCode, uin, avatar, nickname } });
            } else if (result.status === 'Used') {
                res.json({ ok: true, data: { status: 'Used' } });
            } else if (result.status === 'Wait') {
                res.json({ ok: true, data: { status: 'Wait' } });
            } else {
                res.json({ ok: true, data: { status: 'Error', error: result.msg } });
            }
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.get('*', (req, res) => {
        if (req.path.startsWith('/api') || req.path.startsWith('/game-config')) {
             return res.status(404).json({ ok: false, error: 'Not Found' });
        }
        if (fs.existsSync(webDist)) {
            res.sendFile(path.join(webDist, 'index.html'));
        } else {
            res.status(404).send('web build not found. Please build the web project.');
        }
    });

    const applySocketSubscription = (socket, accountRef = '') => {
        const incoming = String(accountRef || '').trim();
        const resolved = incoming && incoming !== 'all' ? resolveAccId(incoming) : '';
        for (const room of socket.rooms) {
            if (room.startsWith('account:')) socket.leave(room);
        }
        if (resolved) {
            socket.join(`account:${resolved}`);
            socket.data.accountId = resolved;
        } else {
            socket.join('account:all');
            socket.data.accountId = '';
        }
        socket.emit('subscribed', { accountId: socket.data.accountId || 'all' });

        try {
            const targetId = socket.data.accountId || '';
            if (targetId && provider && typeof provider.getStatus === 'function') {
                const currentStatus = provider.getStatus(targetId);
                socket.emit('status:update', { accountId: targetId, status: currentStatus });
            }
            if (provider && typeof provider.getLogs === 'function') {
                const currentLogs = provider.getLogs(targetId, { limit: 100 });
                socket.emit('logs:snapshot', {
                    accountId: targetId || 'all',
                    logs: Array.isArray(currentLogs) ? currentLogs : [],
                });
            }
            if (provider && typeof provider.getAccountLogs === 'function') {
                const currentAccountLogs = provider.getAccountLogs(100);
                socket.emit('account-logs:snapshot', {
                    logs: Array.isArray(currentAccountLogs) ? currentAccountLogs : [],
                });
            }
        } catch {
            // ignore snapshot push errors
        }
    };

    const port = CONFIG.adminPort || 3000;
    server = app.listen(port, '0.0.0.0', () => {
        adminLogger.info('admin panel started', { url: `http://localhost:${port}`, port });
    });

    io = new SocketIOServer(server, {
        path: '/socket.io',
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
            allowedHeaders: ['x-admin-token', 'x-account-id'],
        },
    });

    io.use((socket, next) => {
        const authToken = socket.handshake.auth && socket.handshake.auth.token
            ? String(socket.handshake.auth.token)
            : '';
        const headerToken = socket.handshake.headers && socket.handshake.headers['x-admin-token']
            ? String(socket.handshake.headers['x-admin-token'])
            : '';
        const token = authToken || headerToken;
        
        if (!token) {
            return next(new Error('Unauthorized'));
        }
        
        // 检查管理员 Token
        const adminTokenData = tokens.get(token);
        if (adminTokenData) {
            if (isTokenExpired(adminTokenData.createdAt)) {
                tokens.delete(token);
                return next(new Error('Token expired'));
            }
            socket.data.adminToken = token;
            socket.data.userType = 'admin';
            return next();
        }
        
        // 检查用户 Token
        const userSession = userTokens.get(token);
        if (userSession) {
            if (isTokenExpired(userSession.createdAt)) {
                userTokens.delete(token);
                return next(new Error('Token expired'));
            }
            socket.data.userToken = token;
            socket.data.userType = 'user';
            socket.data.username = userSession.username;
            return next();
        }
        
        return next(new Error('Unauthorized'));
    });

    io.on('connection', (socket) => {
        const initialAccountRef = (socket.handshake.auth && socket.handshake.auth.accountId)
            || (socket.handshake.query && socket.handshake.query.accountId)
            || '';
        applySocketSubscription(socket, initialAccountRef);
        socket.emit('ready', { ok: true, ts: Date.now() });

        socket.on('subscribe', (payload) => {
            const body = (payload && typeof payload === 'object') ? payload : {};
            applySocketSubscription(socket, body.accountId || '');
        });
    });
}

module.exports = {
    startAdminServer,
    emitRealtimeStatus,
    emitRealtimeLog,
    emitRealtimeAccountLog,
};
