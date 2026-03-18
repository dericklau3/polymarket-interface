# Polymarket Workshop

一个基于 `yarn + React + ethers` 的 Base Sepolia 预测市场前端 demo。

## 当前实现

- `EIP-6963 + ethers BrowserProvider` 钱包连接
- 目标链固定为 `Base Sepolia (84532)`
- 调用本地部署的 `UmaCtfAdapter.initialize(...)` 创建预测
- 创建前自动检查 USDC allowance，不足时先发 `approve`
- 创建成功后把预测事件写入 `localStorage`
- 首页从 `localStorage` 加载并展示本地创建的预测
- 支持 GitHub Pages 部署

## 本地启动

```bash
yarn install
yarn dev
```

## GitHub Pages

仓库地址按当前配置固定为：

```text
https://github.com/dericklau3/polymarket-interface
```

已做的适配：

- Vite `base` 固定为 `/polymarket-interface/`
- `public/.nojekyll`
- `.github/workflows/deploy.yml` 自动构建并部署到 GitHub Pages

首次启用时，你还需要在 GitHub 仓库设置里把 Pages Source 切到 `GitHub Actions`。

手动本地验证 GitHub Pages 构建：

```bash
yarn build:pages
```
