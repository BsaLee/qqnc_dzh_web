# 认证系统改动说明

## 概述
将固定密码登录改为基于 Code 的认证系统。用户使用账号的 Code 作为凭证登录，登录后只能看到自己的账号信息。

## 主要改动

### 1. 后端改动 (src/admin.js)

#### 登录接口变更
- **旧逻辑**: 使用固定的管理员密码进行认证
- **新逻辑**: 使用账号的 Code 进行认证
  - 用户输入 Code
  - 系统查找具有此 Code 的账号
  - 生成 token 并关联到账号 ID
  - 返回 token 和账号信息

```javascript
// 新的登录接口
POST /api/login
请求体: { code: "账号Code" }
响应: { token, accountId, accountName }
```

#### Token 管理
- 从 `Set` 改为 `Map`，用于存储 token 与 accountId 的关联
- 每个 token 对应一个特定的账号

#### 权限控制
- 移除了 `/api/admin/change-password` 接口
- 所有需要认证的接口现在从 token 中获取 accountId
- 账号管理接口 (POST/DELETE) 添加了权限检查，用户只能操作自己的账号

### 2. 后端数据提供者改动 (client.js)

#### getAccounts 方法
- 添加 `requestingAccountId` 参数
- 只返回指定账号的信息
- 用户登录后只能看到自己的账号

```javascript
// 旧: getAccounts() -> 返回所有账号
// 新: getAccounts(accountId) -> 只返回该账号
```

### 3. 前端改动 (panel/js/core.js)

#### 登录流程
- 改为输入 Code 而不是密码
- 登录成功后保存 token 和 currentAccountId 到 localStorage
- 登出时清除 currentAccountId

```javascript
// 旧: doLogin() 使用 password
// 新: doLogin() 使用 code
```

#### 初始化
- 从 localStorage 恢复 currentAccountId
- 确保用户登录后自动选择自己的账号

### 4. 前端 UI 改动 (panel/index.html)

#### 登录界面
- 改为输入 Code 而不是密码
- 移除了密码修改界面

#### 导航栏
- 隐藏账号选择器（因为用户只有一个账号）
- 移除账号管理页面导航

### 5. 前端账号管理改动 (panel/js/polling-accounts.js)

#### 账号加载
- 简化逻辑，自动选择唯一的账号
- 如果有多个账号（不应该发生），显示选择器

### 6. 前端初始化改动 (panel/js/init.js)

#### 登录输入框
- 改为监听 `login-code` 而不是 `login-password`

## 安全性改进

1. **隐式认证**: 每个用户通过自己的 Code 认证，无法看到其他用户的账号
2. **Token 隔离**: 每个 token 关联到特定的账号，防止跨账号访问
3. **权限检查**: 账号管理接口验证用户只能操作自己的账号

## 使用流程

1. 用户访问管理面板
2. 输入账号的 Code（在添加账号时获得）
3. 系统验证 Code 并生成 token
4. 用户登录成功，只能看到自己的账号信息
5. 用户可以管理自己的账号设置、查看日志等

## 注意事项

- Code 必须在添加账号时设置
- 每个 Code 对应一个账号
- 用户无法看到其他账号的信息
- 移除了全局管理员密码的概念
