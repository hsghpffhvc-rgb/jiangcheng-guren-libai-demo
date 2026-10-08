# 江城故人 李白篇 Demo

一个使用项目现有四张角色卡、御笔、玉笛和水墨场景素材制作的单页互动叙事 Demo。当前只开放李白路线；屈原、伯牙与钟子期、张之洞保留静态预览入口。

## 已实现流程

1. 江城开场与四人选卡；点击李白卡片直接进入李白篇启幕
2. 李白篇启幕图与“启程”交互，保留可展开的李白引导对白
3. 江城地图点击“抵达 · 黄鹤楼”后叠加透明御笔飞行 GIF，动效结束进入黄鹤楼眺望视角
4. 全程循环播放背景音乐，可用右上角音乐按钮静音或恢复
5. 玉笛、黄鹤两处寻幽：点击任一锚点会弹出对应 GIF 动效，故事卡在动效中央渐显；只能在动效卡上点击“完成旅程”计入 0/2 → 2/2；两处完成后，主场景出现“进入下一旅程 · 一起题诗”按钮
6. 从给定意象中选择 2–3 个，生成最多三版规则演示诗稿；诗句只读，仅可修改诗题
7. 正常链上构建生成包含留言的最终 `keccak256` 内容摘要与 1920×1080 可下载记忆卡 PNG；若链上运行时未加载，则只生成明确标记为本地用途的 SHA-256 回执
8. 终章连接 MetaMask，切换 BOT Chain Mainnet，核验合约代码、李白人格包和 issuer 权限后签发本次 memory；交易确认后以 `MemoryIssued` 事件和 `getMemory` 回读双重核验

当前题诗仍是规则生成的演示内容，尚未接入真实模型服务。链上交互是真实主网交易，不模拟成功状态：只有交易成功、事件字段和合约回读全部一致后，页面才会显示“BOT Chain 主网已登记”。钱包拒绝、网络错误或权限不足均保留本地 PNG 下载。

## BOT Chain Mainnet 核验材料

| 项目 | 可核验材料 |
| --- | --- |
| 网络 | BOT Chain Mainnet，Chain ID `677` |
| 应用合约 | [`0x8DC9E18D2492F19aafa0B96B5bC5f9cd41b45493`](https://scan.botchain.ai/address/0x8DC9E18D2492F19aafa0B96B5bC5f9cd41b45493) |
| 合约部署交易 | [`0x0ae95f482651cef08636c3d1258bda58aa7e1a920b69e3b2986055c465a0f4a7`](https://scan.botchain.ai/tx/0x0ae95f482651cef08636c3d1258bda58aa7e1a920b69e3b2986055c465a0f4a7) |
| 李白人格包 v1 登记交易 | [`0x427481d49ae641c8e4dfac922188d007305ada2dafa4f0a65c61394809c70d5a`](https://scan.botchain.ai/tx/0x427481d49ae641c8e4dfac922188d007305ada2dafa4f0a65c61394809c70d5a) |
| 李白人格包 ID | `0xd0431554c39540f53884fd4442bfd4208ec3b9cb0b7bf0ac9dee68815b6e345e` |
| 李白人格包哈希 | `0x633d8480babc919399ece09ff63a6a7f79b2dfdc3ff40338dd9bfda5e0fd3399` |
| 记忆签发样例 | [`0x04e3582cc38a038a6f4684a6002d74b70ae6b7cf45e954e99c02655ed2fd8e88`](https://scan.botchain.ai/tx/0x04e3582cc38a038a6f4684a6002d74b70ae6b7cf45e954e99c02655ed2fd8e88)，区块 `25921329`，`status=1` |
| 机器可读证据 | [`dist/mainnet-evidence.json`](./dist/mainnet-evidence.json) |

2026-10-08 已通过主网 RPC 实时只读回查：`chainId=677`，合约 runtime bytecode hash 为 `0x53101852e26cd46e3b7fdac9a210fdf64b7591661fc6397e4b14adb896be75c8`，owner 为 `0x3963Dd43d4D86749F535c562Ee5a14E723323f66`，李白人格包 v1 的 ID、版本、哈希与 issuer 均与前端固定配置一致；部署与人格包登记交易回执均为 `status=1`。同日完成一笔真实 `issueMemory` 主网交易，区块浏览器显示成功，前端已核对交易回执、`MemoryIssued` 事件与 `getMemory` 合约回读。本前端仓库不附带 Solidity 编译产物，因此机器证据不宣称可由本仓库独立复现 bytecode 编译匹配。

这里复用的是“李白人格视觉与叙事画像”人格包 v1，再基于它签发本次旅程记忆；不把人格包表述成完整旅程包。合约只保存 `memoryId / packageId / version / payloadHash / issuer / issuedAt`，诗文、留言与随机 nonce 原文不上链。完整 canonical payload 只在用户本地的核验 JSON 中导出，用于重算摘要。

## 本地运行

在本目录执行：

```bash
python3 -m http.server 4173 --directory dist
```

然后访问 `http://127.0.0.1:4173/`。

## 文件结构

- `dist/index.html`：游戏画面与交互结构
- `dist/styles.css`：水墨国风界面、动效和响应式布局
- `dist/game.js`：剧情状态、题诗、记忆卡下载与钱包/合约状态机
- `dist/botchain-config.js`：BOT Chain 主网、应用合约、人格包和最小 ABI 配置
- `dist/mainnet-evidence.json`：部署、人格包登记及实时回读的机器可读证据
- `dist/vendor/ethers.umd.min.js`：随站点部署的 ethers v6 浏览器运行时，避免依赖第三方 CDN
- `dist/assets/`：部署用美术资源副本

前端不会保存私钥，也不会把私钥放进配置或仓库。普通访问者钱包没有合约 issuer 权限时只能下载本地卡片；主网演示签发须使用项目 owner 或已授权 issuer 钱包。后续接入真实 AI 或会话记忆时，可以保留现有前端状态机，替换题诗生成逻辑。PRD 中仍保留若干旧版“三锚点”措辞；本 Demo 以玉笛、黄鹤两节点规则为准。
