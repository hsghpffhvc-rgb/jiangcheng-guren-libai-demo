# 链上共创合约

`JiangchengCoCreationRegistry.sol` 是“江城故人”面向普通参与者的共创谱系合约。它不复用原合约的 issuer 权限，但在部署时会把原 `JourneyMemoryRegistry` 固定为不可更换的来源注册簿：根作品只有引用已登记的人格包版本才能发布。

这形成两层分工：

- `JourneyMemoryRegistry`：低频登记李白、伯牙等人格包版本；`issueMemory` 只用于可选的项目官方认证。
- `JiangchengCoCreationRegistry`：高频记录普通用户作品、回应和知音关系；写入仍由用户自己的钱包完成。

## 权限边界

- 无 owner、无白名单；任何 EVM 钱包都能发布自己的作品或回应。
- 上联与曲目必须引用来源注册簿中已登记的 `(packageId, version)`；合约不接受伪造或未登记来源。
- 下联自动继承上联的人格包 ID 与版本，不能自行改换来源。
- 上联作者不能使用同一钱包自己对下联。
- 曲目创作者不能使用同一钱包给自己提交知音评价。
- 同一钱包对同一曲目只能提交一次知音评价；这能减少单地址刷屏，但不能防止多钱包 Sybil。
- 只有曲目创作者可追加“认定知音”状态，但无法改写原评价。

## 两条路线

| 路线 | 主网写入 | 链上关系 |
| --- | --- | --- |
| 李白·诗句唱和 | `publishPoemUpper` / `respondPoem` | 李白人格包版本 → 上联 `workId` → 下联 `parentId` |
| 伯牙子期·知音评价 | `publishMusic` / `attestMusic` / `recognizeAttestation` | 伯牙人格包版本 → 曲目指纹 → 评价证言 → 创作者认定 |

## 数据取舍

- 诗句、曲名和短评会保存为公开合约数据并同步发出事件，前端在签名前明示提醒。
- 音乐配方 JSON 不写入合约；主网仅保存 `keccak256(recipeJson)`。
- 分享链接将配方放在 URL fragment，页面会在允许评价前重算 Hash 并与链上记录对比。
- 下联 ID 和知音评价 ID 都有合约内索引；前端通过 getter 回读，不依赖公共 RPC 上可能被禁用的 `eth_getLogs`。
- 这些记录只能证明某钱包在某时做了某次发布或回应，不等同于现实身份或作品质量认证。
- 人格包引用证明作品采用哪个项目底稿版本，不等于版权归属证明。

## 编译基线

- Solidity `0.8.24`
- EVM target `paris`
- Optimizer enabled, `runs = 200`
- SPDX `MIT`

部署构造参数填写现有 `JourneyMemoryRegistry` 地址，部署脚本会先校验该地址的 runtime bytecode。当前主网共创合约已部署至 `0xac364Ef166138B225a00F257B4A66F87999453E1`，部署交易为 `0x180005cdd0592064e9db5cd648d4ac9afb5b89c3613ca091315d17a34a29b719`；前端会同时校验 Chain ID、合约地址与 runtime bytecode，校验失败时停用交易，不会伪造成功状态。
