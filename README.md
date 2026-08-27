# 角色养成一条龙Pro版 - 功能说明

## 项目简介

该项目是一个自动养成角色的脚本，它可以自动获取养成角色的材料，包括刷取天赋和武器的秘境材料、BOSS 材料，地图追踪采集区域特产与魔物材料、圣遗物副本刷取、经验书、摩拉等。支持 **多角色培养**（角色1/2/3 分页配置）、**圣遗物多副本按天轮换刷取**、**地脉花智能管理**、**Wiki 数据获取** 与 **多账号 UID 隔离**。
⚠️ BGI最低版本要求0.63

## 项目文件结构

```
角色养成一条龙3.0/
├── main.js                          # 主入口：模块加载 + Main 主流程编排 + 设置弹窗
├── manifest.json                    # 脚本元数据（版本号、作者、HTTP 权限、保存文件清单）
├── settings.json                    # BGI 配置项定义（UI schema）
├── README.md                        # 用户使用说明（本文档）
├── CODE_WIKI.md                     # 开发者代码知识库（架构/模块/依赖详解）
│
├── lib/                             # 核心模块库（33 个 JS 文件，由 main.js 按序 eval 加载）
│   ├── constants.js                 # 全局常量（路径/冷却/OCR区域/天赋书与武器映射/规则表）
│   ├── utils.js                     # 通用工具（消息缓冲/JSON读写/模糊匹配/UID脱敏/取消异常判定/系统DPI读取）
│   ├── checkVersion.js              # CNB 远程版本检查（printVersion / needUpdate）
│   ├── nameUtils.js                 # 角色标准名解析 / 培养配置快照 / 任务材料名构建
│   ├── multiCharacter.js            # 多角色培养：共享材料需求基线、培养角色列表构建、配置应用/快照恢复
│   ├── farmingStages.js             # 三阶段刷取：天赋书 / 武器材料 / BOSS 材料
│   ├── userSettings.js              # 用户设置按 UID 分区的读写（user_settings.json）
│   ├── recognitionCache.js          # 角色识别结果缓存（三天过期清理、设置指纹）
│   ├── progressLogger.js            # 刷取进度持久化（farming_progress.json）
│   ├── taskManager.js               # 已完成任务记录 + 材料需求全零检测
│   ├── ocrHelper.js                 # OCR 识别（五级匹配策略/重试/图文联动）
│   ├── navigation.js                # 游戏内导航（传送检测/滚动查找/领奖/秘境进入）
│   ├── combat.js                    # 战斗执行（Boss战斗/能量恢复/结束检测）
│   ├── inventoryRecordWriter.js     # 背包快照写入（latest_record.txt）
│   ├── inventory.js                 # 背包材料数量查询（体力/天赋书/武器/Boss材料 OCR）
│   ├── backStats.js                 # Wiki 模式背包图片扫描（滚动+模板匹配）
│   ├── farming.js                   # 材料刷取循环（体力计算/缺口更新）
│   ├── collection.js                # 材料采集脚本管理（别名/扫描/冷却/断点续传）
│   ├── character.js                 # 角色信息识别（等级/突破/天赋/武器/命座）
│   ├── ui_navigator.js              # 背包/角色页 UI 导航与状态检测
│   ├── calculator.js                # 纯计算（经验/树脂/摩拉/材料需求）
│   ├── image_recognition.js         # 图像识别（经验书数量等）
│   ├── file_utils.js                # 文件读写与经验书数据汇总
│   ├── overlay.js                   # HTML 遮罩进度显示（含单调不降保护/UID遮挡/快捷键）
│   ├── wikiDataSaver.js             # Wiki 数据保存到本地 JSON
│   ├── wikiFetcher.js               # bilibili wiki 网页抓取
│   ├── wikiLocal.js                 # Wiki 本地数据查询（本地优先 + Smart 回退网页）
│   ├── configGenerator.js           # 从用户设置生成 config.json
│   ├── leyLine.js                   # 地脉花完整流程（经验书/摩拉次数计算与执行）
│   ├── artifactDomain.js            # 圣遗物副本刷取（多副本按天轮换/树脂精确计算/须臾树脂/自动分解）
│   ├── materialCollection.js        # 材料采集统一控制器（4类材料分批执行）
│   ├── weaponPicker.js              # 武器选择遮罩页面
│   └── characterPicker.js           # 角色选择遮罩页面
│
├── assets/                          # 资源文件
│   ├── settings-modal.html          # 设置弹窗（三角色标签页 + 圣遗物/轮换/功能设置）
│   ├── progress-mask.html           # 进度遮罩页面
│   ├── warning-modal.html           # 警告弹窗页面
│   ├── character-picker.html        # 角色选择页面
│   ├── weapon-picker.html           # 武器选择页面
│   ├── theme.css                    # 遮罩主题样式
│   ├── RecognitionObject/           # 图像识别模板（背包/确认/返回/UID遮挡等）
│   ├── boss/                        # 40+ Boss 图标（用于材料识别）
│   ├── goToBoss/                    # Boss 前往路径 JSON
│   ├── images/                      # 材料图标（地方特产/怪物掉落素材）
│   ├── bookDomain.png / weaponDomain.png / weapon_star.png  # 秘境与星级图标
│   └── *天赋.png / *武器.png        # 各国家天赋书/武器秘境图标
│
├── data/                            # 数据文件
│   ├── combat_avatar.json           # 角色别名映射（id/name/alias/element/weapon）
│   ├── Character Data.json          # Wiki 缓存的角色材料数据
│   ├── Weapons_data.json            # Wiki 缓存的武器材料数据
│   ├── Mapping.json                 # 材料名 → 魔物名映射（1★/2★/3★）
│   ├── user_settings.json           # 用户设置（按 UID 分区 + 轮换起始日）
│   ├── 滚轮下滑.json                # 鼠标滚轮脚本（Navigation 使用）
│   └── run_data/                    # 运行时数据
│       ├── config.json              # 主配置（运行时生成）
│       ├── completed_tasks.json     # 已完成任务记录
│       ├── script_cooldown_record.json  # 脚本冷却记录
│       ├── abnormal_paths.json      # 异常路径记录
│       ├── farming_progress.json    # 刷取进度
│       └── latest_record.txt        # 最新背包快照
│
└── .trae/                           # Trae 开发工具配置（设计文档/规格说明）
```

## 各文件职责（lib 模块速查表）

| 模块文件 | 全局对象 | 职责 |
|---------|---------|------|
| constants.js | `Constants` | 全局常量：路径、冷却时间、OCR 区域、天赋书/武器材料映射、突破规则、元素列表 |
| utils.js | `Utils` | 通用工具：消息缓冲、JSON 读写、模糊匹配、UID 脱敏、`isCancellationError` 取消异常判定、`getScreenDpiScale` 系统显示缩放读取 |
| checkVersion.js | `printVersion` / `needUpdate` | CNB 远程版本检查，发现新版本时通知 |
| nameUtils.js | `getStandardCharacterName` 等 | 角色别名 → 标准名解析、培养配置快照、任务材料名构建 |
| multiCharacter.js | 多函数 | 多角色共享材料需求基线、培养角色列表构建、角色配置应用/快照恢复 |
| farmingStages.js | `runTalentBookFarming` 等 | 三阶段刷取编排：天赋书 / 武器材料 / BOSS 材料 |
| userSettings.js | `readUserSettingsStore` 等 | 用户设置按 UID 分区读写（`{currentUid, accounts}` 结构） |
| recognitionCache.js | 多函数 | 角色识别缓存（3 天过期清理、按设置指纹区分） |
| progressLogger.js | `ProgressLogger` | 刷取进度持久化（百分比计算） |
| taskManager.js | `TaskManager` | 已完成任务记录（key: uid_角色_类型_材料）、全零检测 |
| ocrHelper.js | `OcrHelper` | OCR 识别：五级匹配（精确→别名→模糊→部分→反向）、重试、图文联动 |
| navigation.js | `Navigation` | 游戏内导航：传送检测、滚动查找、领奖、`gotoAutoDomain` 秘境进入 |
| combat.js | `Combat` | Boss 战斗（路径前往/能量恢复/战斗循环）、充能副本 |
| inventoryRecordWriter.js | `InventoryRecordWriter` | 背包快照写入 latest_record.txt |
| inventory.js | `Inventory` | 体力查询（`queryStaminaValue`）、Boss/天赋书/武器材料数量 OCR |
| backStats.js | `scanWikiBackpackMaterials` | Wiki 模式背包图片扫描（滚动+模板匹配+过期弹窗检查） |
| farming.js | `Farming` | 天赋书/武器/Boss 材料刷取主循环（识别体力→计算次数→进秘境→战斗→更新缺口） |
| collection.js | `Collection` | 采集脚本扫描/别名/冷却过滤/断点续传/UID 识别 |
| character.js | `Character` | 角色等级/突破/天赋/武器/命座识别（`findCharacter`） |
| ui_navigator.js | `UI` / `UiNavigation` | 背包/角色页 UI 导航与状态检测 |
| calculator.js | `expCalculator` 等 | 经验/树脂/摩拉/材料需求纯计算 |
| image_recognition.js | `ImageRecognition` | 经验书数量等图像识别 |
| file_utils.js | `FileUtils` | 文件读写与经验书数据汇总 |
| overlay.js | `Overlay` | 进度遮罩（单调不降保护）、UID 遮挡、快捷键钩子 |
| wikiDataSaver.js | `WikiDataSaver` | Wiki 数据保存（已有值不覆盖） |
| wikiFetcher.js | `WikiFetcherWeb` | bilibili wiki 网页抓取（带重试与延迟） |
| wikiLocal.js | `WikiFetcher` | 本地 Wiki 数据查询，未命中回退网页（Smart 系列） |
| configGenerator.js | `ConfigGenerator` | 从用户设置生成 config.json（分组合并） |
| leyLine.js | `runLeyLineManagement` | 地脉花流程：经验缺口→经验书次数、摩拉缺口→摩拉次数、执行 |
| artifactDomain.js | `runArtifactDomainFarm` | 圣遗物副本刷取：多副本轮换、树脂精确计算、须臾树脂、自动分解 |
| materialCollection.js | `runMaterialCollection` 等 | 材料采集统一控制器（特产/魔物/武器1/武器2 分批执行） |
| weaponPicker.js | `WeaponPicker` | 武器选择遮罩页面 |
| characterPicker.js | `CharacterPicker` | 角色选择遮罩页面 |

## 核心流程与功能

### 1. 启动主流程（main.js → Main）

```
1. printVersion() 版本检查（必定检查，结果缓存一天）
2. eval 按序加载 33 个 lib 模块 → checkModulesLoaded() 验证完整性
3. Overlay.initOverlay() 初始化进度遮罩（12 个阶段计时）
4. 前置 UID 识别 + 与 user_settings.json 权威 UID 匹配（新账号自动登记）
5. loadSettingsFromJson(uid)：按 UID 分区读取设置，缺失字段用默认值
6. ConfigGenerator.generateFromUserSettings(uid)：生成 config.json
7. 按账号设置校正 UID 遮挡位置
8. showSettingsModal()：始终弹出设置弹窗（30 秒倒计时，可保存/取消）
9. 霸王条款检查（未签署则弹窗确认，同意后按账号保存）
10. TaskManager.loadCompletedTasks() 加载已完成任务记录
11. 多角色培养循环 → 三阶段刷取 → 地脉花 → 圣遗物副本 → 材料采集
12. finally 清理资源（关闭遮罩/UID遮挡/快捷键），防重复执行锁
```

### 2. 设置弹窗（assets/settings-modal.html）

- **三角色标签页**：角色1 / 角色2 / 角色3，每个角色独立配置
- **必填设置**：角色名称（支持别名）、战斗队伍、采集队伍
- **目标等级**：角色/武器突破目标等级、天赋等级（格式 普攻-战技-爆发，如 1-10-10）
- **圣遗物设置**：
  - 圣遗物秘境选择（留空不执行）
  - **启用多副本轮换**（开关）：开启后显示第 2/第 3 秘境配置项
  - 五星圣遗物分解开关
- **其他选项**：排除草神线路、能量恢复、战斗策略名、地脉花地区、双倍活动检测
- **功能设置**：
  - ⚠️ 圣遗物秘境使用须臾树脂刷取 + 刷取次数（警告色文字）
  - ⚡ 原粹树脂自动混合领取：40/次（双倍领取）优先，剩余体力按 20/次 补齐（无需配置）
  - ⚠️ 圣遗物秘境结束后自动分解圣遗物（默认关闭，警告色文字）
  - 霸王条款、UID 遮挡位置
- 保存后按 **UID 分区**写入 `data/user_settings.json`，刷新/重开不丢失

### 3. 多角色培养循环（multiCharacter.js + main.js）

- `buildCultivationCharacters()` 从三角色配置构建培养列表
- 每个角色依次执行：应用配置 → Wiki 数据获取（可选）→ 角色识别 → 全零检查 → 三阶段刷取 → 配置快照
- **共享材料需求基线**：前面角色对同种材料的累计需求会累加给后续角色，避免重复刷取

### 4. 三阶段材料刷取（farmingStages.js / farming.js）

| 阶段 | 入口 | 说明 |
|------|------|------|
| 天赋书 | `runTalentBookFarming` → `Farming.getTalentBook` | 识别体力 → 按缺口与体力计算次数 → 进秘境 → 战斗 → 查询背包 → 更新缺口 |
| 武器材料 | `runWeaponMaterialFarming` → `Farming.getWeaponMaterial` | 同上，武器秘境材料 |
| BOSS 材料 | `runBossMaterialFarming` → `Farming.getBossMaterial` | 前往 Boss → 战斗（可选能量恢复） |

刷取循环统一逻辑：`queryStaminaValue()` 识别体力 → 按缺口/体力精确计算可执行次数 → 秘境/Boss 战斗 → 查询背包 → 缺口清零或体力耗尽即结束。

### 5. 圣遗物副本刷取（artifactDomain.js）

- `runArtifactDomainFarm()`：识别当前原粹树脂 → **精确计算可执行次数**（每次消耗 20 树脂，`floor(体力/20)`，耗尽即结束，不会多刷）→ 构建 `AutoDomainParam` → 执行刷取
- **多副本按天轮换**：
  - `selectArtifactDomainForRotation()` 按当天轮换序号选择秘境
  - 第一天刷第 1 个 → 第二天第 2 个 → 第三天第 3 个 → 第四天回到第 1 个
  - 当天内多次执行保持当天对应秘境；**每天凌晨 4 点轮换**（`computeRotationDayIndex()` 以本地凌晨 4 点为日界）
  - 第 3 个秘境未配置时自动降级为**双副本轮换**；仅 1 个则始终刷该秘境；0 个则跳过并提示
  - 轮换起始日按 **UID 隔离**持久化到 `user_settings.json`
- **须臾树脂**：功能设置开启后使用配置次数刷取（默认 1 次，非法值兜底 1），拥有数量不足时仅按拥有数量执行
- **原粹树脂混合领取**：自动 40/次（双倍领取）优先，剩余体力按 20/次 补齐（如 100 体力 → 40×2 + 20×1；30 体力 → 20×1），耗尽即结束，无需配置
- **自动分解圣遗物**：功能设置开关（默认关闭），开启后秘境结束自动分解
- 结束后可选执行五星圣遗物按键分解

### 6. 地脉花管理（leyLine.js）

- `runLeyLineManagement()`：读取世界等级与经验书库存 → 计算经验缺口（经验书地脉花次数）与摩拉缺口（摩拉地脉花次数，含角色/武器/天赋所有消耗）→ 按当前树脂分配次数 → 执行 → 标记完成
- 可选：双倍活动自动检测（优先执行 2 次地脉花）

### 7. 材料采集（materialCollection.js / collection.js）

- `runMaterialCollection()`：4 类材料分批执行（地方特产 / 敌人与魔物 / 武器1 / 武器2）
- 统一控制器 `executeMaterialCollection()`：扫描 pathing 脚本目录 → 过滤异常路径与冷却中脚本 → 分批执行 → 达到阈值触发角色识别更新缺口
- 支持断点续传、冷却时间管理（特产 46h / 怪物 12h）、草神路线过滤

### 8. 高级特性

- **任务记录**：`TaskManager` 记录已完成任务（key: `uid_角色_类型_材料`），避免重复刷取
- **冷却管理**：`script_cooldown_record.json`，过期自动清理
- **多账号 UID 隔离**：设置/任务/冷却/进度/轮换起始日均按 UID 分区
- **Wiki 数据获取**（可选）：本地缓存优先，未命中回退 bilibili wiki 网页抓取
- **停止/取消安全**：`Utils.isCancellationError` 识别取消异常，所有 catch 块取消时立即上抛，顶层优雅终止并清理资源，不产生错误日志

## 使用方法

### 第一步：添加脚本到调度器

1. 订阅本脚本
2. 在将脚本添加至调度器**不要直接运行**

> <br />

详细操作： 在软件界面，点击全自动，然后点击调度器，点击新增配置组（如果你没有看到新增配置组，可以在配置组下面右键点击，选择新增组），输入配置组名称，方便你看得懂这个配置组是干什么的（随便写个名称都可以），然后点击新建的配置组名称，点击添加，点击Js脚本，找到这个脚本勾选后，点击确认就添加成功了。

### 第二步：配置脚本设置

添加到调度器后，鼠标右键点击脚本，点击【修改通用配置】，滑动到最底部开启JS HTTP权限。然后点击运行，等待设置窗口弹出，配置好并设置完毕后，点击保存运行。

# 详细配置步骤


1. **必须填设置**
   - 输入角色名称（老角色可使用别名，如"茜特菈莉"可用"奶奶"）
   - 从遮罩页面选择角色，点击勾选后会跳出遮罩弹窗，可用于筛选角色，点击角色名称后，会自动将角色名称输入到输入框中，无需手动输入。
   - 设置战斗队伍名称（用于秘境和BOSS挑战）
   - 设置采集队伍名称（用于材料采集，可能需要水、雷、火、元素等元素角色和草神。）
2. **武器设置**
   - 设置武器武器名称（脚本会识别角色装备的武器是否为当前需要培养的武器，同时获取武器所需的培养材料。）
   - 从遮罩页面选择武器，点击勾选后会跳出遮罩弹窗，可用于筛选武器，点击武器名称后，会自动将武器名称输入到输入框中，无需手动输入。
   - 脚本会自动识别武器星级和当前等级
3. **目标突破等级**
   - 设置角色突破目标等级（你想升到多少级，80级=升到90级）
   - 设置武器突破目标等级（你想升级到多少级，80级=升到90级，70级=升到80级）
   - 设置目标天赋等级（你想升级天赋升到多少级，格式：普攻-战技-爆发，如示例：1-10-10）
4. **圣遗物设置**
   - 选择圣遗物秘境（留空不执行）
   - 可选：启用多副本轮换并配置第 2/第 3 秘境（按天轮流刷取，凌晨4点轮换）
   - 可选：五星圣遗物分解
5. **功能设置**
   - 可选：圣遗物秘境使用须臾树脂刷取及次数
   - 可选：圣遗物秘境结束后自动分解圣遗物
   - 必须签署霸王条款才能使用，提示窗口会出现，脚本将自动结束。
   - 左上角 UID 遮挡，可选择关闭，关闭后会暴露 UID
6. **其他设置**
   - 地脉花战斗策略名称（为空则使用默认策略）
   - 选择地脉花地区（蒙德、璃月、稻妻、枫丹、纳塔、挪德卡莱）
   - 可选：挑战BOSS前恢复满能量

### 第三步：配置调度器设置

详细步骤：找到刚才创建的配置组名称，在跟添加的这个脚本的名字上方有设置2字，点击【设置】2个字，就可以打开调度器设置了。

配置组设置建议：开启地图追踪寻找配置，开启自动拾取。
设置生存位在队伍内的编号，生存位释放元素战技的时间间隔，生存位元素战绩是否长按，行走位主要行走的角色在队伍内的编号（按照你的战斗队伍角色实际情况来设置）。

下面进行战斗配置，开启战斗配置，选择战斗策略（可以选择根据队伍自动选择或者手动选择你的战斗队伍的策略
开启自动检测战斗结束（点击展开箭头，开启更快检测战斗结束，如果你队伍没有芙宁娜，或者没有远程索敌，可以开启旋转寻找敌人位置）
聚材料动作跟据你的战斗队伍是否有万叶/琴选择开启，如果没有万叶，请开启扫描掉落物光柱，如果队伍练度较低请将自动战斗超时延长。

### 运行前置要求

运行前请确保已订阅以下地图追踪脚本：

- 地区特产的所有路径脚本
- 敌人与魔物的所有路径脚本

## 注意事项

1. 使用前请先订阅敌人与魔物，地方区域特产的所有地图追踪路径。
2. 目前暂不支持多个角色培养。如需培养多个角色，请在调度器再次添加脚本进行修改【新添加】的脚本自定义配置。
3. ⚠️地下地图需要使用TemplateMatch匹配方式，否则地图追踪路径可能会出错，非JS脚本问题，请前往设置，下滑动找到通用功能设置区域里的，地图追踪优先使用的特征匹配方式，如果为SIFT，请更改为TemplateMatch，注意重启BGI后才会生效。
4. 水下地图，请不要使用纳维莱特等，角色颜色和海底颜色蓝色相同的角色。
5. 首次运行出现ReadTextSync 异常: "Could not find file '\BetterGI\User\JsScript\角色养成一条龙Pro版\data\run\_data\completed\_tasks.json'."的报错为正常现象，后续其他文件config.json，script\_cooldown\_record.json也会同样出现，无需理会，脚本会自动创建文件。
6. ⚠️请确保已开启S HTTP权限，否则，新角色将无法获取材料信息。

## 更新日志

2.1.5：新增圣遗物副本刷取与多项修复。

- ✨ **新增圣遗物副本刷取** - 支持圣遗物秘境自动刷取，识别当前原粹树脂精确计算可执行次数，耗尽即结束（不再多刷一次）
- 🔄 **新增多副本按天轮换** - 可配置 2~3 个圣遗物秘境，按天轮流刷取（第一天第1个 → 第二天第2个 → 第三天第3个 → 第四天回到第1个），每天凌晨4点轮换，当天多次执行保持当天秘境；第三个为空自动降级双副本轮换
- ⚡ **新增须臾树脂刷取** - 功能设置中可开启圣遗物秘境使用须臾树脂刷取并配置次数
- 🗑️ **新增结束后自动分解圣遗物开关** - 功能设置中可控制圣遗物秘境结束后是否自动分解（默认关闭）
- 🔧 **修复停止快捷键残留日志** - 停止任务后不再持续输出错误日志，取消异常立即安全终止并清理资源
- 🐛 **修复圣遗物秘境 domainRounds 未定义报错** - 原粹树脂耗尽不再多执行无法领取奖励的多余次数
- 🎨 **设置弹窗优化** - 增加弹窗宽度；功能设置中圣遗物相关选项以警告色高亮提示

<br />

2.1.4：修复一些bug ，

✨ **新增 Wiki 数据获取模块** - 从 bilibili wiki 自动获取角色培养材料信息

- ✨ **新增地脉花管理流程** - 自动计算并执行经验书/摩拉地脉花任务
- 🎨 **UI 界面大幅优化** - 设置弹窗改为三列布局，新增 Wiki 模式选项
- 🔧 **OCR 点击精度提升** - 改为点击文字中心点，提高点击准确性
- 📋 **任务完成记录功能** - 支持跳过已完成的材料任务

<br />

2.1.3：修复一些bug 。                                                                                                                                                          核心变更:**

- ✨ 新增可视化设置弹窗（HTML模态框），支持30秒倒计时和实时交互
- 🔧 实现三层设置读取策略（BetterGI UI → user\_settings.json → settings.json默认值）
- 📊 新增材料需求全零检测功能，避免多角色共用材料导致的误判
- ⚙️ 优化配置项默认值，新增启动时弹出设置选项

2.1.3：版本更新修复一些bug，添加遮罩控制面板显示。

2.1.2：版本更新修复一些bug。添加新boss的适配。

2.1.1：版本更新

1. 新增：版本更新检查，重组文件结构，提升地图追踪材料采稳定性：添加弹窗识别并关闭弹窗方法 `handlePopupByOCR()`，和异常路径检测与过滤机制
2. 天赋武器秘境根据树脂计算可执行次数
3. 新增异常路径自动检测与过滤机制，自动标记并跳过执行时间超过9分钟的路径脚本
4. 统一重构OCR识别逻辑，引入 Utils.ocrRecognizeWithRetry 方法替代原有直接OCR调用
5. 增强角色页面打开验证机制，添加3次重试逻辑
6. 优化脚本执行时间记录和日志输出
7. 修复自动秘境角色阵亡，复活后不再继续刷材料的bug。

2.1.0：新增挪德卡莱BOSS蕴光月守宫，修复本体自动秘境名称不为空时使用本体的自动秘境名称。新增自动识别：Boss材料名称，天赋秘境，武器秘境，不再需要手动输入。

1.7.0：新增挪德卡莱两只BOSS，超重型陆巡舰·机动战垒和深黯魇语之主，不过地图追踪有些问题，前往BOSS的过程采用了键鼠脚本的方式，可能会有小问题
