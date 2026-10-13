# 江城故人 · 李白篇 / 伯牙子期篇 Demo

一个使用项目现有角色卡与水墨场景素材制作的单页互动叙事 Demo。目前开放两条路线：**李白篇**（黄鹤楼诗旅）与**伯牙子期篇**（高山流水）。两条路线都接入独立的“链上共创谱系”页面，让普通参与者用自己的 EVM 钱包发布、回应和回读关系。

## 伯牙子期篇（高山流水）

对应《江城故人 · 伯牙子期（高山流水篇）主线开发交付 PRD》，代码位于 `dist/boya.js`，与李白篇状态机完全隔离，通过 `#game` 的 `inert` 属性接管画面。

**2026-10-13 体验迭代**：开屏替换为专属开屏图（含三程导览与"启程"热区）；开屏后进入江城大地图，琴舟沿虚线水路从长江驶向琴台月湖地标（约 4.4s），抵达后开启月湖与琴台双副本；谱曲屏升级为纸质卷轴风（宣纸底、朱红印章、金线描边）；结算页整体重构为"高山流水人格结算"三栏布局——左侧俞伯牙×钟子期角色卡、中间人格标题与四组品格比例条（山/水、拨/听、缓/疾、独奏/共鸣，由琴音序列实时计算）、右侧专属曲目播放器。

**本篇最终交付物是一段音律**：

- **试听**：OfflineAudioContext 按实时弹拨同源的合成参数（三角波/正弦波、包络、混响、声景层）离线渲染整曲为 AudioBuffer，播放支持停止与进度显示
- **下载音乐**：一键导出 44.1kHz 16-bit 立体声 WAV（`曲名-胶囊编号.wav`）
- **重新谱曲**：清空琴音与声景、解除配方锁定回到五弦舞台，剧情进度与心境选择保留；链上操作进行中会拒绝重新谱曲，避免配方与链上记录错位
- 记忆卡片 PNG 交付已移除；配方 JSON 下载与链上封存（PRD BT05）保留

### 完整流程

1. **P01 开场与选卡**：伯牙卡片解除"筹备中"，点击进入开屏图，点击"启程"热区出发
2. **P02 江城大地图**：琴舟泛舟动画驶向琴台月湖地标，抵达后点击进入副本
3. **P03 月湖与琴台双锚点**：`moon_lake` 台词与水面动效 → 泛舟过渡 → `qin_tai` 高山流水典故与松竹云雾动效
4. **P04 五弦琴音共创**：宫商角徵羽五弦（Canvas 拨弦 / 琴音键），高山=三角波厚重长回响、流水=正弦波轻快短回声，Canvas 山势折线 / 水波涟漪随之切换；至少 3 声方可谱曲，江城声景最多 2 种
5. **P05 人格结算与音律交付**：人格结算 + 试听 + WAV 下载 + 重新谱曲 + 发布到链上共创谱系；项目授权封存降为可选认证
6. **P06 链上独立核验页**：纯只读回读，带超时与网络降级提示

### 关于人格包与链上封存

伯牙路线使用合约工程中已经冻结并通过原始文件哈希校验的“高山流水”人格包；其 `packageId` 按与李白篇相同的规则由 `packageKey` 经 keccak256 推导（`0x0e8dea51…35053c`），并已在 BOT Chain Mainnet 登记。因此前端会：

- 在写入前调用 `packageExists` 与 `getPackage` 回读，核对版本、哈希和 issuer，而不是只相信前端配置
- 登记证据指向交易 [`0xcca61f…2967f`](https://scan.botchain.ai/tx/0xcca61f431e18126f70c90e684ce8c617258e8586d75cef994a479e367cd2967f)，区块 `25866913`，`status=1`
- 本地配方 JSON、音律 WAV 与内容摘要在任何情况下均可正常生成与下载

## 李白篇已实现流程

1. 江城开场与李白、伯牙子期双路线选卡；点击李白卡片直接进入李白篇启幕
2. 李白篇启幕图与“启程”交互，保留可展开的李白引导对白
3. 江城地图点击“抵达 · 黄鹤楼”后叠加透明御笔飞行 GIF，动效结束进入黄鹤楼眺望视角
4. 全程循环播放背景音乐，可用右上角音乐按钮静音或恢复
5. 玉笛、黄鹤两处寻幽：点击任一锚点会弹出对应 GIF 动效，故事卡在动效中央渐显；只能在动效卡上点击“完成旅程”计入 0/2 → 2/2；两处完成后，主场景出现“进入下一旅程 · 一起题诗”按钮
6. 从给定意象中选择 2–3 个，生成最多三版规则演示诗稿；诗句只读，仅可修改诗题
7. 正常链上构建生成包含留言的最终 `keccak256` 内容摘要与 1920×1080 可下载记忆卡 PNG；若链上运行时未加载，则只生成明确标记为本地用途的 SHA-256 回执
8. 终章以“发布到链上共创谱系”为普通用户主路径；项目授权钱包签发 memory 保留在折叠的“官方认证（可选）”区域，交易确认后仍以 `MemoryIssued` 事件和 `getMemory` 回读双重核验

当前题诗仍是规则生成的演示内容，尚未接入真实模型服务。链上交互是真实主网交易，不模拟成功状态：只有交易成功、事件字段和合约回读全部一致后，页面才会显示“BOT Chain 主网已登记”。钱包拒绝、网络错误或权限不足均保留本地 PNG 下载。

## 用户钱包的链上共创

`dist/cocreation.html` 是面向 C 端用户的独立共创入口，通过 EIP-6963 发现 MetaMask、OKX Wallet 等 EVM 钱包，并引导切换到 BOT Chain Mainnet（Chain ID `677`）。它与原有方案共享人格包来源，但使用不同的写入权限：

- **原方案是来源与认证层**：`JourneyMemoryRegistry` 登记不可覆盖的人格包版本；`issueMemory` 保留为项目方可选认证，不是普通用户共创前置条件。
- **共创方案是关系层**：`JiangchengCoCreationRegistry` 在部署时不可变地绑定原注册簿。每个上联或曲目都必须引用已登记的 `(packageId, version)`，下联继承上联来源。

- **李白·诗句唱和**：钱包 A 发布上联，获得带 `workId` 的邀请链接；钱包 B 回读上联后提交下联。合约以 `parentId` 固化两件作品的父子关系，并禁止同一钱包自问自答。
- **伯牙子期·知音评价**：钱包 A 发布音乐配方的 Keccak-256 指纹；钱包 B 通过邀请链接获取配方，前端对比指纹后才允许试听和提交“意境 + 三项评分 + 短评”。每个钱包对同一曲目只能评价一次，钱包 A 可追加一次“认定知音”交易。

共创合约是 **permissionless-user-writes with registered package root**：没有 owner 或 issuer 白名单，但会在合约层校验人格包来源、异钱包回应、作品类型、评分范围和认定权属。诗句、曲名与短评是公开合约数据；音乐配方仅上链 Hash。下联和知音评价都由合约索引并通过 getter 回读，不依赖 `eth_getLogs`。链上记录只证明使用了哪个人格包版本、钱包行为与时序，不自动证明现实身份、原创权属或评价质量。

Solidity 源码与边界说明见 [`contracts/JiangchengCoCreationRegistry.sol`](./contracts/JiangchengCoCreationRegistry.sol) 和 [`contracts/README.md`](./contracts/README.md)。共创合约已部署到 BOT Chain Mainnet；前端连接后还会核验地址上的 runtime code、代码哈希与不可变绑定的 `sourceRegistry`，任一不匹配都会停止写入，不模拟成功。

## BOT Chain Mainnet 核验材料

| 项目 | 可核验材料 |
| --- | --- |
| 网络 | BOT Chain Mainnet，Chain ID `677` |
| 应用合约 | [`0x8DC9E18D2492F19aafa0B96B5bC5f9cd41b45493`](https://scan.botchain.ai/address/0x8DC9E18D2492F19aafa0B96B5bC5f9cd41b45493) |
| 合约部署交易 | [`0x0ae95f482651cef08636c3d1258bda58aa7e1a920b69e3b2986055c465a0f4a7`](https://scan.botchain.ai/tx/0x0ae95f482651cef08636c3d1258bda58aa7e1a920b69e3b2986055c465a0f4a7) |
| 李白人格包 v1 登记交易 | [`0x427481d49ae641c8e4dfac922188d007305ada2dafa4f0a65c61394809c70d5a`](https://scan.botchain.ai/tx/0x427481d49ae641c8e4dfac922188d007305ada2dafa4f0a65c61394809c70d5a) |
| 李白人格包 ID | `0xd0431554c39540f53884fd4442bfd4208ec3b9cb0b7bf0ac9dee68815b6e345e` |
| 李白人格包哈希 | `0x633d8480babc919399ece09ff63a6a7f79b2dfdc3ff40338dd9bfda5e0fd3399` |
| 高山流水人格包 v1 登记交易 | [`0xcca61f431e18126f70c90e684ce8c617258e8586d75cef994a479e367cd2967f`](https://scan.botchain.ai/tx/0xcca61f431e18126f70c90e684ce8c617258e8586d75cef994a479e367cd2967f)，区块 `25866913`，`status=1` |
| 高山流水人格包 ID | `0x0e8dea51bcb23e35f71f640b17d49d39a896f8d83e592482a2e70bdf5c35053c` |
| 用户共创合约 | [`0xac364Ef166138B225a00F257B4A66F87999453E1`](https://scan.botchain.ai/address/0xac364Ef166138B225a00F257B4A66F87999453E1) |
| 用户共创合约部署交易 | [`0x180005cdd0592064e9db5cd648d4ac9afb5b89c3613ca091315d17a34a29b719`](https://scan.botchain.ai/tx/0x180005cdd0592064e9db5cd648d4ac9afb5b89c3613ca091315d17a34a29b719)，区块 `26558421`，`status=1` |
| 记忆签发样例 | [`0x04e3582cc38a038a6f4684a6002d74b70ae6b7cf45e954e99c02655ed2fd8e88`](https://scan.botchain.ai/tx/0x04e3582cc38a038a6f4684a6002d74b70ae6b7cf45e954e99c02655ed2fd8e88)，区块 `25921329`，`status=1` |
| 机器可读证据 | [`dist/mainnet-evidence.json`](./dist/mainnet-evidence.json) |

2026-10-13 再次通过主网 RPC 实时回查：`chainId=677`；来源注册簿、李白与高山流水人格包记录均与配置一致；共创合约地址存在 runtime code，代码哈希为 `0x52307ac0085b8b14ba4ffcaf76559bbdfb2d187602be153a849b731d30850676`，且 `sourceRegistry()` 回读为既有注册簿。部署交易回执 `status=1`，实际消耗 `0.0322318 BOT`。此前的 `issueMemory` 样例也已核对交易回执、`MemoryIssued` 事件与 `getMemory` 合约回读。本前端仓库不附带 Solidity 编译产物，因此机器证据不宣称可由本仓库独立复现 bytecode 编译匹配。

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
- `dist/boya.js`：伯牙子期篇独立状态机、五弦音律、配方与主网封存
- `dist/cocreation.html` / `dist/cocreation.js`：诗句唱和、曲目发布、知音评价与认定的用户钱包页面
- `dist/wallet-provider.js`：EIP-6963 钱包发现与 MetaMask / OKX Wallet 选择器
- `dist/botchain-config.js`：BOT Chain 主网、应用合约、人格包和最小 ABI 配置
- `dist/mainnet-evidence.json`：部署、人格包登记及实时回读的机器可读证据
- `dist/vendor/ethers.umd.min.js`：随站点部署的 ethers v6 浏览器运行时，避免依赖第三方 CDN
- `dist/assets/`：部署用美术资源副本
- `contracts/JiangchengCoCreationRegistry.sol`：无白名单的用户共创谱系合约源码

前端不会保存私钥，也不会把私钥放进配置或仓库。“项目官方认证”仍须使用 owner 或已授权 issuer 钱包；“用户链上共创”不要求 issuer 权限，但根作品引用的人格包版本必须先由项目方登记。任何参与者都用自己的钱包签名并承担少量 BOT 交易费。后续接入真实 AI 或会话记忆时，可以保留现有前端状态机，替换题诗生成逻辑。PRD 中仍保留若干旧版“三锚点”措辞；本 Demo 以玉笛、黄鹤两节点规则为准。
