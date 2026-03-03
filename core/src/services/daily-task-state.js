/**
 * 每日任务状态管理类
 * 统一管理各服务的每日任务状态，避免重复代码
 */

const { getDateKey } = require('../utils/utils');

class DailyTaskState {
    constructor(options = {}) {
        this.doneDateKey = '';
        this.lastCheckAt = 0;
        this.lastClaimAt = 0;
        this.lastResult = '';
        this.cooldownMs = options.cooldownMs || 10 * 60 * 1000;
        this.useServerTime = options.useServerTime || false;
    }

    markDone() {
        this.doneDateKey = getDateKey(this.useServerTime);
    }

    isDone() {
        return this.doneDateKey === getDateKey(this.useServerTime);
    }

    shouldCheck(force = false) {
        if (force) return true;
        if (this.isDone()) return false;
        const now = Date.now();
        if (now - this.lastCheckAt < this.cooldownMs) return false;
        this.lastCheckAt = now;
        return true;
    }

    recordClaim(result = '') {
        this.lastClaimAt = Date.now();
        this.lastResult = result;
    }

    reset() {
        this.doneDateKey = '';
        this.lastCheckAt = 0;
        this.lastClaimAt = 0;
        this.lastResult = '';
    }
}

module.exports = { DailyTaskState };
