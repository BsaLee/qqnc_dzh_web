# 认证系统迁移指南

## 概述
本指南说明如何从旧的固定密码认证系统迁移到新的 Code 认证系统。

## 迁移步骤

### 1. 备份数据
```bash
# 备份现有的账号数据
cp data/accounts.json data/accounts.json.backup
cp data/store.json data/store.json.backup
```

### 2. 更新代码
```bash
# 拉取最新代码
git pull origin main

# 或者手动替换以下文件：
# - src/admin.js
# - client.js
# - panel/js/core.js
# - panel/js/polling-accounts.js
# - panel/js/init.js
# - panel/index.html
```

### 3. 重启服务
```bash
# 停止现有服务
npm stop

# 启动新服务
npm start
```

### 4. 首次登录
- 打开管理面板
- 输入任意一个账号的 Code
- 系统会验证 Code 并生成 token
- 登录成功后只能看到该账号的信息

## 数据兼容性

### 账号数据
- 现有的账号数据完全兼容
- 每个账号的 Code 字段用于认证
- 无需修改 accounts.json

### 配置数据
- 现有的配置数据完全兼容
- store.json 中的 adminPasswordHash 字段不再使用
- 可以安全删除该字段

### 日志数据
- 现有的日志数据完全兼容
- 无需迁移

## 常见问题

### Q: 如何处理没有 Code 的旧账号？
A: 旧账号应该已经有 Code（在添加时设置）。如果没有，需要手动编辑 accounts.json 添加 Code 字段。

### Q: 如何重置用户的认证？
A: 用户需要使用新的 Code 重新登录。旧的 token 会自动失效。

### Q: 如何处理多个用户共享一个 Code？
A: 不建议这样做。每个用户应该有自己的 Code。如果需要共享，可以创建多个账号，每个账号使用不同的 Code。

### Q: 如何禁用某个用户的访问？
A: 删除该账号即可。用户的 token 会在下次请求时失效。

### Q: 如何更改用户的 Code？
A: 编辑 accounts.json 中的 code 字段，或通过 API 更新账号信息。

## 回滚计划

如果需要回滚到旧系统：

```bash
# 恢复备份
cp data/accounts.json.backup data/accounts.json
cp data/store.json.backup data/store.json

# 恢复旧代码
git checkout <old-commit-hash>

# 重启服务
npm stop
npm start
```

## 性能影响

- 登录速度：无显著变化
- 内存占用：略微增加（存储 token-accountId 映射）
- 数据库查询：无变化

## 安全性改进

1. **隐式认证**: 每个用户通过自己的 Code 认证
2. **Token 隔离**: 防止跨账号访问
3. **权限检查**: 用户只能操作自己的账号
4. **无全局密码**: 移除了全局管理员密码的风险

## 支持

如有问题，请参考：
- AUTHENTICATION_CHANGES.md - 详细的改动说明
- TESTING_CHECKLIST.md - 测试清单
