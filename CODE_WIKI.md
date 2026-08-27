# 角色养成一条龙 Pro 版 · Code Wiki

> 本文档为 [角色养成一条龙3.0](./) 项目的结构化代码知识库，覆盖项目整体架构、主要模块职责、关键类与函数说明、依赖关系以及项目运行方式等关键信息。
>
> - 项目类型：BetterGI（BGI）JS 自动化脚本
> - BGI 最低版本要求：`0.60.2-alpha.3`
> - 主入口：[main.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/main.js)

---

## 目录

1. [项目简介](#1-项目简介)
2. [整体架构](#2-整体架构)
3. [目录结构](#3-目录结构)
4. [模块加载机制](#4-模块加载机制)
5. [主要模块职责](#5-主要模块职责)
6. [关键类与函数说明](#6-关键类与函数说明)
7. [依赖关系](#7-依赖关系)
8. [数据文件与配置](#8-数据文件与配置)
9. [运行流程](#9-运行流程)
10. [运行方式](#10-运行方式)
11. [开发约束与约定](#11-开发约束与约定)

---

## 1. 项目简介

**角色养成一条龙 Pro 版** 是一个面向原神（Genshin Impact）的 BetterGI 自动化脚本，能够自动完成角色培养的全流程：

- 角色信息识别（等级 / 突破状态 / 天赋等级 / 武器等级）
- 背包已有材料数量扫描（特产 / 怪物 / Boss / 天赋书 / 武器秘境 / 经验书 / 摩拉）
- 智能材料缺口计算（基于当前等级 → 目标等级）
- 自动刷取：天赋书、武器秘境材料、Boss 材料
- 地图追踪采集：地方特产、敌人与魔物、武器魔物材料
- 地脉花智能管理：经验书地脉花、摩拉地脉花
- 任务记录、断点续传、冷却管理、多账号 UID 隔离

材料获取以 **Wiki 数据获取（主流程）** 为准：Wiki 获取材料名称 → 角色识别（仅等级）→ 背包 API 扫描已有数量 → 缺口计算。

---

## 2. 整体架构

### 2.1 架构概览

项目采用 **单文件入口 + 模块化加载** 架构：

```
┌──────────────────────────────────────────────────────────────┐
│                         main.js (入口)                        │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ 1. 通过 eval 顺序加载 lib/*.js 模块                       │ │
│  │ 2. checkModulesLoaded() 验证模块加载完整性                  │ │
│  │ 3. loadSettingsFromJson() 三层设置读取策略                  │ │
│  │ 4. ConfigGenerator 生成 config.json                       │ │
│  │ 5. Wiki 数据获取流程（主流程，无条件执行）               │ │
│  │ 6. 角色识别 / Wiki 背包扫描                                │ │
│  │ 7. 材料刷取（天赋书 / 武器 / Boss）                        │ │
│  │ 8. 材料采集（特产 / 魔物 / 武器魔物）                       │ │
│  │ 9. 地脉花管理                                             │ │
│  └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│  核心模块层    │      │  识别模块层   │      │  数据模块层   │
│ Farming      │      │ Character    │      │ WikiFetcher │
│ Collection  │      │ Inventory    │      │ WikiDataSaver│
│ Combat      │      │ OcrHelper    │      │ TaskManager │
│ Navigation  │      │ ImageRecognit│      │ ProgressLogger│
│ leyLine     │      │ backStats    │      │ ConfigGenerator│
└──────────────┘      └──────────────┘      └──────────────┘
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────────────────────────────────────────────────────┐
│                  BGI 宿主 API（file / log / genshin /         │
│            notification / htmlMask / pathingScript /          │
│            http / RecognitionObject / captureGameRegion ...）  │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 设计模式

- **模块对象模式**：每个 `lib/*.js` 通过 `var Xxx = {...}` 暴露单一全局对象
- **eval 模块加载**：因 BGI JS 环境无 ES Module，使用 `eval(file.readTextSync(path))` 顺序加载
- **分层职责**：核心流程 → 识别 → 数据持久化 → BGI 宿主 API
- **状态隔离**：通过 UID + 角色名 + 材料类型作为复合 key 实现多账号隔离

### 2.3 核心流程图

```
[启动]
   │
   ├─► 加载模块 → 验证模块
   │
   ├─► 三层设置读取（BGI UI > user_settings.json > settings.json default）
   │
   ├─► ConfigGenerator.generateFromUserSettings()
   │
   ├─► Wiki 数据获取 → 写入 config.json
   │
   ├─► 角色识别 OR Wiki 背包扫描
   │
   ├─► UID 识别 → 全零检查 → [可能弹设置窗]
   │
   ├─► 材料刷取阶段
   │     ├─► 天赋书刷取（Farming.getTalentBook）
   │     ├─► 武器材料刷取（Farming.getWeaponMaterial）
   │     └─► Boss 材料刷取（Farming.getBossMaterial）
   │
   ├─► 材料采集阶段（runMaterialCollection）
   │     ├─► 地方特产（executeLocalBatch）
   │     ├─► 敌人与魔物（executeMonsterBatch）
   │     ├─► 武器1材料（executeMonsterBatch）
   │     └─► 武器2材料（executeMonsterBatch）
   │
   └─► 地脉花管理阶段（runLeyLineManagement）
         ├─► 经验书地脉花
         └─► 摩拉地脉花
[结束]
```

---

## 3. 目录结构

```
角色养成一条龙3.0/
├── main.js                          # 主入口文件
├── manifest.json                    # 脚本元数据（版本号/作者/HTTP权限/保存文件清单）
├── README.md                        # 用户使用说明
├── CODE_WIKI.md                     # 本文档（开发者代码知识库）
├── .gitignore                       # Git 忽略配置
│
├── lib/                             # 核心模块库（33 个 JS 文件）
│   ├── constants.js                 # 全局常量
│   ├── utils.js                     # 通用工具函数（含取消异常判定）
│   ├── checkVersion.js              # 版本检查
│   ├── nameUtils.js                 # 角色标准名解析/配置快照
│   ├── multiCharacter.js            # 多角色培养（共享需求基线）
│   ├── farmingStages.js             # 三阶段刷取编排
│   ├── userSettings.js              # 用户设置按 UID 分区存储
│   ├── recognitionCache.js          # 角色识别缓存
│   ├── progressLogger.js            # 进度持久化
│   ├── taskManager.js               # 任务记录管理
│   ├── ocrHelper.js                 # OCR 识别辅助
│   ├── navigation.js                # 游戏内导航
│   ├── combat.js                    # 战斗执行
│   ├── inventory.js                 # 背包材料查询（体力/天赋/武器/Boss）
│   ├── inventoryRecordWriter.js     # 背包快照写入
│   ├── backStats.js                 # 背包材料扫描（CountInventoryItem API）
│   ├── farming.js                   # 材料刷取循环
│   ├── collection.js                # 材料采集脚本管理
│   ├── character.js                 # 角色识别
│   ├── calculator.js                # 经验/树脂/摩拉计算
│   ├── image_recognition.js         # 图像识别
│   ├── file_utils.js                # 文件工具
│   ├── overlay.js                   # HTML 遮罩管理
│   ├── wikiDataSaver.js             # Wiki 数据保存
│   ├── wikiFetcher.js               # Wiki 网页抓取
│   ├── wikiLocal.js                 # Wiki 本地数据查询
│   ├── configGenerator.js           # 配置生成
│   ├── leyLine.js                   # 地脉花流程
│   ├── artifactDomain.js            # 圣遗物副本刷取（多副本轮换）
│   ├── materialCollection.js        # 材料采集统一控制器
│   ├── weaponPicker.js              # 武器选择遮罩
│   └── characterPicker.js           # 角色选择遮罩
│
├── assets/                          # 资源文件
│   ├── RecognitionObject/           # 图像识别模板（背包/确认/返回等）
│   ├── boss/                        # 40+ Boss 图标（用于材料识别）
│   ├── goToBoss/                    # Boss 前往路径 JSON
│   ├── images/                      # 材料图标
│   │   ├── 地方特产/                 # 70+ 地方特产图标
│   │   └── 怪物掉落素材/             # 130+ 怪物材料图标
│   ├── settings-modal.html          # 设置弹窗页面（三角色标签 + 圣遗物/轮换/功能设置）
│   ├── progress-mask.html           # 进度遮罩页面
│   ├── character-picker.html        # 角色选择页面
│   ├── weapon-picker.html           # 武器选择页面
│   ├── warning-modal.html           # 警告弹窗页面
│   ├── theme.css                    # 遮罩主题样式
│   └── *天赋.png / *武器.png        # 各国家天赋/武器秘境图标
│
├── data/                            # 数据文件
│   ├── combat_avatar.json           # 角色别名映射（含 id/name/alias/element/weapon）
│   ├── Character Data.json          # Wiki 缓存的角色材料数据
│   ├── Weapons_data.json            # Wiki 缓存的武器材料数据
│   ├── Mapping.json                 # 材料名 → 魔物名映射（含1★/2★/3★三连）
│   ├── user_settings.json           # 用户设置（按 UID 分区 + 轮换起始日）
│   ├── 滚轮下滑.json                 # 鼠标滚轮脚本（Navigation 使用）
│   └── run_data/                    # 运行时数据
│       ├── config.json              # 主配置（运行时生成）
│       ├── completed_tasks.json     # 已完成任务记录
│       ├── script_cooldown_record.json  # 脚本冷却记录
│       ├── abnormal_paths.json      # 异常路径记录
│       ├── farming_progress.json    # 刷取进度
│       └── latest_record.txt        # 最新背包快照
│
└── .trae/                           # Trae 开发工具配置
    ├── documents/                   # 设计文档
    └── specs/                       # 功能规格说明
```

---

## 4. 模块加载机制

### 4.1 加载顺序

[main.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/main.js#L6-L40) 中定义了模块加载顺序（当前共 33 个模块）：

```javascript
const MODULES = [
    "lib/checkVersion.js",       // 1. 版本检查
    "lib/constants.js",          // 2. 全局常量（基础依赖）
    "lib/utils.js",              // 3. 通用工具
    "lib/nameUtils.js",          // 4. 角色标准名/配置快照
    "lib/multiCharacter.js",     // 5. 多角色共享需求基线
    "lib/farmingStages.js",      // 6. 三阶段刷取编排
    "lib/userSettings.js",       // 7. 用户设置按 UID 分区存储
    "lib/recognitionCache.js",   // 8. 角色识别缓存
    "lib/progressLogger.js",     // 9. 进度日志
    "lib/taskManager.js",        // 10. 任务管理
    "lib/ocrHelper.js",          // 11. OCR 识别
    "lib/navigation.js",         // 12. 导航
    "lib/combat.js",             // 13. 战斗
    "lib/inventoryRecordWriter.js", // 14. 背包记录
    "lib/inventory.js",          // 15. 背包查询
    "lib/backStats.js",          // 16. Wiki 背包扫描
    "lib/farming.js",            // 17. 材料刷取
    "lib/collection.js",         // 18. 材料采集
    "lib/character.js",          // 19. 角色识别
    "lib/calculator.js",         // 20. 经验/树脂/摩拉计算
    "lib/image_recognition.js",  // 21. 图像识别
    "lib/file_utils.js",         // 22. 文件工具
    "lib/overlay.js",            // 23. 遮罩管理
    "lib/wikiDataSaver.js",      // 24. Wiki 数据保存
    "lib/wikiFetcher.js",        // 25. Wiki 网页抓取
    "lib/wikiLocal.js",          // 26. Wiki 本地查询
    "lib/configGenerator.js",    // 27. 配置生成
    "lib/leyLine.js",            // 28. 地脉花
    "lib/artifactDomain.js",     // 29. 圣遗物副本（多副本轮换）
    "lib/materialCollection.js", // 30. 材料采集统一控制器
    "lib/weaponPicker.js",       // 31. 武器选择
    "lib/characterPicker.js"     // 32. 角色选择
];
```

### 4.2 加载实现

```javascript
for (const modulePath of MODULES) {
    try {
        eval(file.readTextSync(modulePath));
    } catch (e) {
        throw new Error(`模块加载失败: ${modulePath}, 错误: ${e.message}`);
    }
}
```

### 4.3 完整性验证

加载完成后调用 [checkModulesLoaded()](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/main.js#L49-L69) 验证以下必备模块存在：

`Constants`, `Utils`, `ProgressLogger`, `TaskManager`, `OcrHelper`, `Navigation`, `Combat`, `InventoryRecordWriter`, `Inventory`, `Farming`, `Collection`, `Character`, `ImageRecognition`, `FileUtils`, `expCalculator`, `moraCalculation`, `resinCalculation`, `CultivationMaterialCalculator`, `ConfigGenerator`, `WeaponPicker`, `CharacterPicker`

---

## 5. 主要模块职责

下表汇总各模块职责，详细说明见 [第 6 节](#6-关键类与函数说明)。

| 模块 | 全局对象 | 职责 | 类型 |
|------|---------|------|------|
| [constants.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/constants.js) | `Constants` | 全局常量（路径、冷却、OCR 区域、规则表） | 配置 |
| [utils.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/utils.js) | `Utils` | 通用工具（消息缓冲、JSON 读写、模糊匹配、UID 脱敏、`isCancellationError` 取消异常判定） | 工具 |
| [checkVersion.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/checkVersion.js) | `printVersion`, `needUpdate` | CNB 远程版本检查 | 工具 |
| [nameUtils.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/nameUtils.js) | `getStandardCharacterName` 等 | 角色别名→标准名解析、培养配置快照、任务材料名构建 | 工具 |
| [multiCharacter.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/multiCharacter.js) | 多函数 | 多角色培养：共享材料需求基线、培养角色列表构建、配置应用/快照恢复 | 核心 |
| [farmingStages.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/farmingStages.js) | `runTalentBookFarming` 等 | 三阶段刷取编排（天赋书/武器材料/Boss） | 核心 |
| [userSettings.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/userSettings.js) | `readUserSettingsStore` 等 | 用户设置按 UID 分区读写（`{currentUid, accounts}`） | 数据 |
| [recognitionCache.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/recognitionCache.js) | 多函数 | 角色识别结果缓存（3 天过期清理、设置指纹） | 数据 |
| [ocrHelper.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/ocrHelper.js) | `OcrHelper` | OCR 文字识别（五级匹配策略） | 识别 |
| [image_recognition.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/image_recognition.js) | `ImageRecognition` | 经验书数量查询（CountInventoryItem API）与世界等级识别 | 识别 |
| [navigation.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/navigation.js) | `Navigation` | 游戏内导航（传送检测、滚动查找、领奖、秘境进入） | 导航 |
| [combat.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/combat.js) | `Combat` | 战斗执行（秘境/Boss） | 核心 |
| [inventory.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/inventory.js) | `Inventory` | 背包材料数量查询（体力/天赋书/武器/Boss OCR） | 识别 |
| [inventoryRecordWriter.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/inventoryRecordWriter.js) | `InventoryRecordWriter` | 背包快照写入 latest_record.txt | 数据 |
| [backStats.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/backStats.js) | `scanWikiBackpackMaterials` | 背包材料扫描（CountInventoryItem API） | 识别 |
| [farming.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/farming.js) | `Farming` | 天赋书/武器材料/Boss 刷取循环 | 核心 |
| [collection.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/collection.js) | `Collection` | 材料采集脚本管理（别名/扫描/过滤） | 核心 |
| [character.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/character.js) | `Character` | 角色信息识别（等级/突破/天赋/武器/命座） | 识别 |
| [calculator.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/calculator.js) | `expCalculator`, `resinCalculation`, `moraCalculation`, `CultivationMaterialCalculator` | 纯计算（经验/树脂/摩拉/材料需求） | 计算 |
| [file_utils.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/file_utils.js) | `FileUtils` | 文件读写与经验书数据汇总 | 工具 |
| [overlay.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/overlay.js) | `Overlay` | HTML 遮罩进度显示（含单调不降保护） | UI |
| [progressLogger.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/progressLogger.js) | `ProgressLogger` | 刷取进度持久化 | 数据 |
| [taskManager.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/taskManager.js) | `TaskManager` | 已完成任务记录与全零检测 | 数据 |
| [configGenerator.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/configGenerator.js) | `ConfigGenerator` | 从用户设置生成 config.json | 数据 |
| [wikiFetcher.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/wikiFetcher.js) | `WikiFetcherWeb` | bilibili wiki 网页抓取 | 数据 |
| [wikiLocal.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/wikiLocal.js) | `WikiFetcher` | Wiki 本地数据查询（含 Smart 回退） | 数据 |
| [wikiDataSaver.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/wikiDataSaver.js) | `WikiDataSaver` | Wiki 数据保存到本地 JSON | 数据 |
| [leyLine.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/leyLine.js) | `runLeyLineManagement()` | 地脉花完整流程 | 核心 |
| [artifactDomain.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/artifactDomain.js) | `runArtifactDomainFarm()` | 圣遗物副本刷取（多副本按天轮换/树脂精确计算/须臾树脂/自动分解） | 核心 |
| [materialCollection.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/materialCollection.js) | `runMaterialCollection()` 等 | 材料采集统一控制器（4 类材料分批执行） | 核心 |
| [weaponPicker.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/weaponPicker.js) | `WeaponPicker` | 武器选择遮罩页面 | UI |
| [characterPicker.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/characterPicker.js) | `CharacterPicker` | 角色选择遮罩页面 | UI |

---

## 6. 关键类与函数说明

### 6.1 main.js 主入口

#### `Main()` — 主流程函数

定义于 [main.js:345](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/main.js#L345)，是整个脚本的编排核心，按顺序执行：

1. `printVersion()` 版本检查
2. `checkModulesLoaded()` 模块验证
3. `Overlay.initOverlay()` 初始化遮罩 + `showOverlay()` 显示（12 个阶段计时）
4. 前置 UID 识别 `Collection.getCurrentAccountUid()` + 与 `user_settings.json` 权威 UID 匹配（新账号自动登记）
5. `loadSettingsFromJson(uid)` 按 UID 读取设置（DEFAULT_SETTINGS 兜底）
6. `ConfigGenerator.generateFromUserSettings()` 生成配置
7. 按账号设置校正 UID 遮挡位置
8. `showSettingsModal()` 始终弹出设置弹窗（30 秒倒计时）
9. 角色名标准化 + 霸王条款检查（未签署弹窗确认）
10. `TaskManager.loadCompletedTasks()` 加载任务记录
11. **多角色培养循环**（`runCharacterCultivation`，见 6.1.1）
12. `runLeyLineManagement()` 地脉花管理
13. `runArtifactDomainFarm()` 圣遗物副本刷取
14. `runMaterialCollection()` 材料采集
15. IIFE + `cleanupResources()` 资源清理，`__genshinMaterialScriptExecuting` 防重复执行锁

#### 6.1.1 多角色培养循环（multiCharacter.js）

- `buildCultivationCharacters(settings, characterSlots)` 从三角色配置构建培养列表
- 每个角色 `runCharacterCultivation(char)`：应用配置 → `runWikiDataFetchFlow()`（主流程）→ `runCharacterRecognitionOrWikiScan()` → 全零检查 → 三阶段刷取（`runTalentBookFarming` / `runWeaponMaterialFarming` / `runBossMaterialFarming`，定义于 farmingStages.js）→ 配置快照
- **共享材料需求基线**（`sharedDemandBaseline` / `currentDemandBase`）：前面角色对同种材料的累计需求累加给后续角色，避免重复刷取

#### `showSettingsModal(currentSettings, options, uid)` — 设置弹窗

[main.js:184](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/main.js#L184) 通过 `htmlMask` 显示 [assets/settings-modal.html](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/assets/settings-modal.html)，30 秒倒计时，支持取消、保存、武器/角色选择器回调。保存时按 `uid` 分区写入 `user_settings.json`（`setSettingsForUid`）。

设置弹窗含三角色标签页，关键选项：
- 圣遗物秘境选择 + **多副本轮换开关**（`artifactDomainRotate`）与第 2/3 秘境（`domainRunMode2/3`）
- **须臾树脂刷取**（`useTransientResin` / `transientResinCount`）
- **结束后自动分解圣遗物**（`autoArtifactSalvage`，默认关闭）
- 五星圣遗物分解（`enable5StarArtifactSalvage`）

#### `runMaterialCollection()` — 材料采集主函数

定义于 [lib/materialCollection.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/materialCollection.js)，编排 4 类材料采集（地方特产 / 敌人与魔物 / 武器1 / 武器2），含队伍切换、断点续传、冷却过滤。

#### `executeMaterialCollection(options)` — 统一采集控制器

[lib/materialCollection.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/materialCollection.js) 接收 `{type, rootFolder, keywords, configKey, ...}` 参数，统一处理脚本扫描、冷却过滤、分批执行。

#### `executeLocalBatch()` / `executeMonsterBatch()`

- 地方特产：按需求量筛选脚本，预计获取数 ≥ 需求时触发角色识别
- 怪物材料：按阈值（20/50）决定批次大小与是否触发识别

#### `scanWikiBackpackMaterials(spec)` — Wiki 背包扫描

主流程中扫描 4 类材料已有数量并计算缺口，定义于 `lib/backStats.js`，由 `scanAndUpdateWikiMaterials()` 调用。

---

### 6.2 Constants 模块（全局常量）

[lib/constants.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/constants.js) 定义项目所有常量：

| 常量组 | 说明 |
|--------|------|
| `COOLDOWN_*` | 冷却时间（特产 46h，怪物/武器 12h） |
| `OCR_RETRY_WAIT`, `OCR_MAX_RETRIES` | OCR 重试配置（600ms / 8 次） |
| `ASSETS_BASE`, `FOLDER_*` | 路径配置（pathing 基目录） |
| `CONFIG_PATH`, `SCRIPT_COOLDOWN_RECORD` 等文件路径 | 运行时文件位置 |
| `bookToPosition` | 天赋书 → 国家/行列映射（21 种天赋书） |
| `weaponMaterialToPosition` | 武器秘境材料 → 国家/行列映射 |
| `weaponMaterialRules` | 武器材料突破规则（按星级 × 等级） |
| `talentBookRules` | 天赋书升级规则 |
| `charBreakMonsterRules` | 角色突破魔物材料规则 |
| `charBreakLocalRules` | 角色突破区域特产规则 |
| `ocrRegions` | OCR 识别区域坐标配置 |
| `replacementMap` | OCR 文字纠错映射（如 "卵"→"卯"） |
| `elements` | 元素列表（火/水/草/雷/风/冰/岩/物） |
| `THRESHOLD_HIGH/LOW`, `PATH_COUNT_*` | 怪物材料批次阈值 |

---

### 6.3 Utils 模块（通用工具）

[lib/utils.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/utils.js) `var Utils = {...}`：

| 方法 | 说明 |
|------|------|
| `addNotification(msg)` / `sendBufferedNotifications()` | 消息缓冲与批量发送 |
| `getNow()` | 当前时间戳 |
| `positiveIntegerJudgment(n)` | 正整数校验 |
| `parseAndValidateCounts(input, expectedCount)` | 解析 "1-2-3" 格式数量 |
| `readJson(path, defaultVal)` | 读取 JSON（数组自动合并为对象） |
| `ocrRecognizeWithRetry(...)` | OCR 带重试识别 |
| `fuzzyMatch(str1, str2)` | 字符串模糊匹配 |
| `switchPartySafe(teamName)` | 安全队伍切换 |
| `maskUid(uid)` | UID 脱敏（保留后 4 位） |
| `calcWeaponMonsterNeed(...)` | 武器魔物材料需求计算 |

---

### 6.4 TaskManager 模块（任务记录）

[lib/taskManager.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/taskManager.js) `var TaskManager = {...}`：

| 方法 | 说明 |
|------|------|
| `loadCompletedTasks()` | 读取已完成任务记录 |
| `saveCompletedTasks(tasks)` | 持久化任务记录 |
| `addCompletedTask(materialType, materialName, requireCounts, characterName, uid)` | 标记任务完成 |
| `isTaskCompleted(...)` | 判断是否已完成（比较需求量数组） |
| `checkAllRequirementsZero(config)` | 检查 8 项材料需求是否全为零 |
| `hasOtherCharactersAllZeroWithin3Days(uid, currentCharacterName)` | 3 天内同 UID 其他角色全零检测（防误判） |

任务记录 key 格式：`{uid}_{角色名}_{材料类型}_{材料名}`，存储于 `data/run_data/completed_tasks.json`。

---

### 6.5 Character 模块（角色识别）

[lib/character.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/character.js) `var Character = {...}`：

| 方法 | 说明 |
|------|------|
| `loadAvatarData()` | 加载 combat_avatar.json（别名/元素映射） |
| `selectElement(element)` | 选择元素筛选 |
| `selectCharacter(name, region, aliasMap)` | 多策略识别角色名 |
| `extractMonsterNames(textList)` | 从文本提取魔物名称 |
| `identifyMonsterAndMaterials()` | 识别魔物名称与材料数量 |
| `findCharacterAndGetLevel(recognitionType)` | **主入口**：识别角色等级/突破/天赋/武器 |

`recognitionType` 支持 `all` / `break` / `weapon`，控制识别范围以提升效率。

---

### 6.6 Farming 模块（材料刷取）

[lib/farming.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/farming.js) `var Farming = {...}`：

| 方法 | 说明 |
|------|------|
| `talentEquivalent(counts)` | 计算天赋书等效紫色数量 |
| `weaponEquivalent(counts)` | 计算武器材料等效紫色数量 |
| `recordProgress(...)` | 写入 ProgressLogger 进度 |
| `getTalentBook(materialName, bookRequireCounts, characterName, uid)` | **天赋书刷取主循环** |
| `getWeaponMaterial(materialName, weaponRequireCounts, characterName, uid)` | **武器材料刷取主循环** |
| `getBossMaterial(bossName, bossRequireCounts, characterName, uid)` | **Boss 材料刷取主循环** |

刷取循环逻辑：查询体力 → 计算可执行次数 → 进入秘境 → 战斗 → 查询背包 → 更新缺口 → 标记完成。

---

### 6.7 Collection 模块（材料采集）

[lib/collection.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/collection.js) `var Collection = {...}`：

| 方法 | 说明 |
|------|------|
| `getAllAliasesByStandardName(standardName)` | 从 Mapping.json 获取所有别名 |
| `fuzzyMatch(str1, str2)` | 字符串模糊匹配 |
| `hasGrassGodDirScripts(scriptList)` | 检测是否含草神路线 |
| `filterLocalScriptsByCount(scriptList, targetCount, isIncludeGrassGod)` | 按需求量筛选特产脚本 |
| `recursiveScanScriptFiles(scriptDir, isExcludeGrassGod)` | 递归扫描 pathing 脚本 |
| `filterAbnormalPaths(scripts)` | 过滤异常路径 |
| `filterScriptsByCooldown(scripts, cooldown, record, uid)` | 过滤冷却中脚本 |
| `executeScripts(scripts, startIdx, batchSize, uid, cooldown, record, callback)` | **执行采集脚本** |
| `getStartIndex(scripts, uid, record, type)` | 获取断点续传起始索引 |
| `cleanExpiredCooldownRecords(record, uid)` | 清理过期冷却记录 |
| `getCurrentAccountUid()` | 识别当前账号 UID |
| `extractAllMagicKeywords(config)` / `extractAllWeapons1Keywords(config)` / `extractAllWeapons2Keywords(config)` | 提取各类材料关键词 |

---

### 6.8 Combat 模块（战斗执行）

[lib/combat.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/combat.js) `var Combat = {...}`：

| 方法 | 说明 |
|------|------|
| `restoredEnergyAutoFightAndEndDetection()` | 充能副本自动战斗与结束检测 |
| `restoredEnergy()` | 恢复能量（执行两次充能副本） |
| `fightBoss(bossName)` | **Boss 战斗**（队伍切换/能量恢复/路径前往/战斗循环） |

Boss 前往路径：`assets/goToBoss/{bossName}前往.json`，支持 40+ 种 Boss。

---

### 6.9 Inventory 模块（背包查询）

[lib/inventory.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/inventory.js) `var Inventory = {...}`：

| 方法 | 说明 |
|------|------|
| `queryStaminaValue()` | 查询当前体力值（F1 → 资源界面 OCR） |
| `getBossMaterialCount(bossName)` | 查询 Boss 材料数量 |
| `getMaterialCount(bookName)` | 查询天赋书三档数量 |
| `getWeaponMaterialCount(...)` | 查询武器材料数量 |

使用 `Navigation.findAndClickWithScroll()` 滚动查找材料图标，再用 OCR 读取数量。

---

### 6.10 Overlay 模块（HTML 遮罩）

[lib/overlay.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/overlay.js) `var Overlay = (function(){...})()`：

| 方法 | 说明 |
|------|------|
| `initOverlay(version)` | 检测 htmlMask API 可用性 |
| `showOverlay(initialData)` | 显示遮罩（assets/progress-mask.html） |
| `sendProgress(data)` | 发送进度 JSON |
| `updateStage(stageName, status, percentage)` | 更新阶段进度（**含单调不降保护**） |
| `updateStatus(status, extraInfo)` | 同阶段内细粒度状态更新 |
| `setTotalStages(n)` / `startTimer()` | 设置总阶段数与计时 |
| `setCharacterName(name)` | 设置遮罩显示的角色名 |
| `showUidMask(x, y)` / `closeUidMask()` | UID 遮挡图片 |
| `initKeyHook()` / `disposeKeyHook()` | 快捷键钩子 |
| `closeOverlay()` | 关闭遮罩 |

遮罩通过 BGI `htmlMask` API 与 [assets/progress-mask.html](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/assets/progress-mask.html) 双向通信。

---

### 6.11 Wiki 相关模块

#### WikiFetcherWeb（网页抓取）

[lib/wikiFetcher.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/wikiFetcher.js) `var WikiFetcherWeb = {...}`：

| 方法 | 说明 |
|------|------|
| `fetchPage(url, description, errorType)` | 通用 HTTP 请求（7.6s 延迟，最多 10 次重试） |
| `getStandardCharacterName(inputName)` | 从 combat_avatar.json 获取标准角色名 |
| `getCharacterMaterialsFast(...)` / `getCharacterMaterials(...)` | 获取角色培养材料 |
| `getWeaponInfo(...)` / `parseWeaponMaterials(...)` | 获取武器材料信息 |
| `getBossNameFromMaterialSmart(material)` | 根据材料名反查 Boss 名 |
| `getTalentMobNameFromMaterialSmart(material)` | 根据材料名反查天赋魔物名 |
| `getWeaponMobNameFromMaterialSmart(material)` | 根据材料名反查武器魔物名 |

数据源：`https://wiki.biligame.com/ys/`

#### WikiFetcher（本地优先 + Smart 回退）

[lib/wikiLocal.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/wikiLocal.js) `var WikiFetcher = {...}`：

| 方法 | 说明 |
|------|------|
| `getCharacterMaterialsLocal(name)` | 本地角色材料查询 |
| `getWeaponInfoLocal(name)` | 本地武器材料查询 |
| `getCharacterMaterialsSmart(...)` | 智能获取（本地优先，未命中回退网页） |
| `getWeaponInfoSmart(...)` | 武器智能获取 |
| `getBossNameFromMaterialSmart(...)` | Boss 名智能获取 |
| `getTalentMobNameFromMaterialSmart(...)` | 天赋魔物名智能获取 |
| `getWeaponMobNameFromMaterialSmart(...)` | 武器魔物名智能获取 |

#### WikiDataSaver（数据保存）

[lib/wikiDataSaver.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/wikiDataSaver.js) `var WikiDataSaver = {...}`：

| 方法 | 说明 |
|------|------|
| `saveCharacterData(standardName, fastResult, detailedResult)` | 保存角色材料数据 |
| `saveWeaponData(weaponName, starLevel, weaponType, materialNames)` | 保存武器材料数据 |
| `saveMappingData(material, mobName, type)` | 保存材料 → 魔物映射 |

保存策略：已有值不覆盖，仅补空白字段。

---

### 6.12 Calculator 模块（纯计算）

[lib/calculator.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/calculator.js) 导出多个计算对象：

| 对象 | 方法 | 说明 |
|------|------|------|
| `expCalculator` | `calculateExpRequired(currentLevel, currentExp, targetLevel)` | 1-90 级升级所需经验 |
| | `convertExpToBooks(expRequired)` | 经验 → 三档经验书数量 |
| `resinCalculation` | `calculateSingleRunExp(worldLevel)` | 单次地脉花经验 |
| `moraCalculation` | 摩拉需求计算 | 含角色/武器/天赋所有摩拉消耗 |
| `CultivationMaterialCalculator` | `parseLevelTarget(s, default)` | 解析 "80级" → 80 |
| | `parseTalentTargets(s)` | 解析 "1-10-10" → [1,10,10] |
| | `calculateLocalNeed(curr, target)` | 地方特产需求量 |
| | `calculateMonsterNeedStar3(...)` | 魔物材料 star3 需求量 |
| | `calculateBossCount(curr, target)` | Boss 材料需求量 |
| | `calculateTalentBookCounts(curr, target)` | 天赋书需求量 |

---

### 6.13 Overlay 弹窗模块（武器/角色选择器）

#### WeaponPicker

[lib/weaponPicker.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/weaponPicker.js) `var WeaponPicker = {...}`：

- `show()` — 显示 [assets/weapon-picker.html](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/assets/weapon-picker.html)，2 分钟超时，返回武器名

#### CharacterPicker

[lib/characterPicker.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/characterPicker.js) `var CharacterPicker = {...}`：

- `show()` — 显示 [assets/character-picker.html](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/assets/character-picker.html)，2 分钟超时，返回角色名

通信协议：`/ready` → `/initWeapons` 或 `/initCharacters` → `/selectWeapon` 或 `/selectCharacter` → `/close`

---

### 6.14 leyLine.js（地脉花流程）

[lib/leyLine.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/leyLine.js) 导出 `runLeyLineManagement()` 异步函数：

流程：
1. `readAndValidateSettingsForLeyLine()` 读取并验证设置
2. `getWorldLevelForLeyLine()` 获取世界等级
3. `getExperienceBookDataForLeyLine()` 获取当前库存经验书
4. 计算经验缺口 → 经验书地脉花次数
5. 计算摩拉缺口 → 摩拉地脉花次数
6. 执行地脉花（考虑树脂剩余）
7. 标记任务完成

---

### 6.15 其他辅助模块

#### OcrHelper（OCR 识别）

[lib/ocrHelper.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/ocrHelper.js) `var OcrHelper = {...}`：

- `recognizeText(text, region, aliasMap, timeout, retry, max)` — **五级匹配**：精确 → 别名 → 模糊 → 部分包含 → 反向包含
- `recognizeMultiText(region, name)` — 多段文字 OCR
- `getTalentLevel(ocrRegion, talentName)` — 识别天赋等级
- `repeatOperationUntilTextFound(...)` — 重复操作直到找到文字
- `waitAndClickImage(...)` — 等待图片出现并点击
- `findImageAndOCR(...)` — 查找图片并 OCR

#### artifactDomain.js（圣遗物副本刷取）

[lib/artifactDomain.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/artifactDomain.js) 导出 `runArtifactDomainFarm()` 与轮换辅助函数：

| 函数 | 说明 |
|------|------|
| `runArtifactDomainFarm()` | 圣遗物副本主流程：识别体力 → 精确计算次数（`floor(体力/20)`）→ `AutoDomainParam` → `dispatcher.runAutoDomainTask` → 可选五星分解 |
| `selectArtifactDomainForRotation()` | 轮换选秘境：剔除空配置，按 1→2→3→1 循环；第 3 个为空自动降级双副本；0 个跳过提示 |
| `computeRotationDayIndex()` | 以本地凌晨 4 点为日界计算连续轮换日序号 |
| `getRotationStartDay(uid)` | 首次启用当天记为第 1 天，按 UID 持久化到 `user_settings.json` 顶层 |

轮换规则：第一天第 1 个秘境 → 第二天第 2 个 → 第三天第 3 个 → 第四天回到第 1 个；当天多次执行保持当天秘境；每天凌晨 4 点轮换。支持须臾树脂（`useTransientResin`）与结束后自动分解（`autoArtifactSalvage`）。

#### materialCollection.js（材料采集统一控制器）

[lib/materialCollection.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/materialCollection.js) 导出：

| 函数 | 说明 |
|------|------|
| `runMaterialCollection()` | 4 类材料采集编排（特产/魔物/武器1/武器2） |
| `executeMaterialCollection(options)` | 统一采集控制器（扫描/冷却过滤/分批） |
| `executeLocalBatch()` / `executeMonsterBatch()` | 地方特产/怪物材料分批执行 |
| `scanAndUpdateWikiMaterials()` | 背包材料扫描更新缺口 |
| `getCollectionDemandBase()` / `recordMaterialRunProgress()` | 采集需求基数/进度记录 |

#### multiCharacter.js（多角色培养）

[lib/multiCharacter.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/multiCharacter.js) 导出多函数：

- `buildCultivationCharacters()` — 从三角色配置构建培养列表
- `applyCharacterToSettings()` / `snapshotCharacterConfig()` / `restoreCharacterConfig()` — 角色配置应用/快照/恢复
- `getSharedBaseline()` / `addSharedBaseline()` / `addCharacterDemandToBaseline()` — 共享材料需求基线（跨角色累计，避免重复刷取）

#### ProgressLogger（进度持久化）

[lib/progressLogger.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/progressLogger.js) `var ProgressLogger = {...}`：

- `makeKey(uid, characterName, materialType, materialName)` — 生成 key
- `load()` / `save(data)` — 读写 `data/run_data/farming_progress.json`
- `upsert(options)` — 新增/更新任务进度（计算百分比）
- `markCompleted(...)` — 标记完成

#### ConfigGenerator（配置生成）

[lib/configGenerator.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/configGenerator.js) `var ConfigGenerator = {...}`：

- `readUserSettings()` — 读取 `data/user_settings.json`
- `generateFromUserSettings(uid)` — **主入口**：从用户设置生成 `data/run_data/config.json`
- `mergeConfigGroups(configArray)` — 按分组合并配置

#### userSettings.js（用户设置按 UID 分区）

[lib/userSettings.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/userSettings.js) 导出：

- `readUserSettingsStore()` — 读取存储（始终 `{currentUid, accounts}` 结构）
- `writeUserSettingsStore(store)` — 写入 `data/user_settings.json`
- `getSettingsForUid(store, uid)` / `setSettingsForUid(store, uid, obj)` — 按 UID 读写账号设置分区

#### recognitionCache.js（角色识别缓存）

[lib/recognitionCache.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/recognitionCache.js) 导出：

- `getRecognitionSettingsFingerprint()` — 按设置生成指纹（缓存命中判定）
- `getRecognitionCacheEntry()` / `saveRecognitionCache()` / `restoreRecognitionCache()` — 缓存读写
- `cleanExpiredRecognitionCache()` / `isRecognitionCacheEntryExpired()` — 3 天过期清理

#### backStats.js（Wiki 背包扫描）

[lib/backStats.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/backStats.js) 独立函数：

- `closeExpiredItemPopup()` — 关闭"物品过期"弹窗
- `calcScrollDistance(anchorText)` — 计算滑动距离（基于首末行 Y 坐标差）
- `scrollUp(distance)` — 鼠标拖拽向上滚动（系数 0.63，短距离 1:1）
- `scanWikiBackpackMaterials(spec)` — 背包材料扫描入口（CountInventoryItem API，替代原图片模板+OCR 方案）

---

## 7. 依赖关系

### 7.1 模块间依赖图

```
                    ┌─────────────┐
                    │ constants.js│ ◄── 几乎所有模块依赖
                    └─────────────┘
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
        ┌──────────┐            ┌──────────┐
        │ utils.js │ ◄──────────│ ocrHelper│
        └──────────┘            └──────────┘
              │                       │
              ▼                       ▼
    ┌─────────────────┐      ┌─────────────────┐
    │ taskManager.js   │      │ character.js    │
    │ progressLogger.js│      │ inventory.js   │
    │ configGenerator  │      │ image_recognit │
    └─────────────────┘      └─────────────────┘
              │                       │
              ▼                       ▼
    ┌─────────────────┐      ┌─────────────────┐
    │ farming.js      │      │ collection.js   │
    │ leyLine.js      │      │ combat.js       │
    │ wikiFetcher.js  │      │ navigation.js   │
    │ wikiLocal.js    │      │ backStats.js    │
    │ wikiDataSaver   │      │ character.js    │
    └─────────────────┘      └─────────────────┘
              │                       │
              └───────────┬───────────┘
                          ▼
                   ┌────────────┐
                   │  main.js   │
                   └────────────┘
```

### 7.2 BGI 宿主 API 依赖

项目深度依赖 BetterGI 提供的宿主 API：

| API | 用途 | 主要使用模块 |
|-----|------|-------------|
| `file.readTextSync` / `writeTextSync` | 文件读写 | 几乎所有模块 |
| `log.info` / `warn` / `error` | 日志 | 所有模块 |
| `genshin.tp` / `returnMainUi` | 游戏传送/返回主界面 | Navigation, Combat, Collection |
| `genshin.simulatedTextEdit` / `click` / `sleep` | 游戏操作 | Character, Inventory, UI |
| `setGameMetrics(1920, 1080, scale)` | 设置游戏分辨率与缩放（scale 动态取 `Utils.getScreenDpiScale()` 系统 DPI） | main.js, Character, Utils |
| `captureGameRegion` | 屏幕截图 | OcrHelper, ImageRecognition, backStats |
| `RecognitionObject` | 图像识别对象 | Navigation, Inventory, UI, backStats |
| `notification.send` / `error` | 系统通知 | Utils, main.js |
| `pathingScript.ReadPathSync` / `IsFolder` / `Run` | 路径脚本 | Collection |
| `dispatcher.addTimer(new RealtimeTimer("AutoPick"))` | 自动拾取 | main.js |
| `htmlMask.show` / `send` / `receive` / `close` | HTML 遮罩 | Overlay, WeaponPicker, CharacterPicker, main.js |
| `http.get` / `post` | HTTP 请求 | WikiFetcherWeb, checkVersion |
| `keyMouseScript.runFile` | 键鼠脚本 | Navigation（滚轮下滑.json） |
| `moveMouseTo` / `moveMouseBy` / `leftButtonDown` / `leftButtonUp` | 鼠标操作 | backStats, Navigation |
| `settings` | BGI 配置对象 | main.js, 所有核心模块 |

### 7.3 数据文件依赖

| 文件 | 读取者 | 写入者 |
|------|--------|--------|
| `data/combat_avatar.json` | Character, WikiFetcher, FileUtils | （静态） |
| `data/Character Data.json` | WikiFetcher (本地) | WikiDataSaver |
| `data/Weapons_data.json` | WikiFetcher (本地), WeaponPicker | WikiDataSaver |
| `data/Mapping.json` | Collection, WikiFetcher (本地) | WikiDataSaver |
| `data/user_settings.json` | userSettings, ConfigGenerator, main.js, artifactDomain | userSettings, main.js, artifactDomain（轮换起始日） |
| `data/run_data/config.json` | 所有核心模块 | ConfigGenerator, main.js |
| `data/run_data/completed_tasks.json` | TaskManager | TaskManager |
| `data/run_data/script_cooldown_record.json` | Collection | Collection |
| `data/run_data/farming_progress.json` | ProgressLogger | ProgressLogger |
| `data/run_data/latest_record.txt` | （规划面板消费） | InventoryRecordWriter |
| `data/run_data/abnormal_paths.json` | Collection | Collection |

---

## 8. 数据文件与配置

### 8.1 设置配置（DEFAULT_SETTINGS + settings-modal.html）

> 注：旧版 `settings.json`（BGI 配置 schema）已移除，配置项默认值迁移至 [main.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/main.js#L382-L411) 的 `DEFAULT_SETTINGS` 常量，配置 UI 由 [assets/settings-modal.html](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/assets/settings-modal.html) 承担（htmlMask 弹窗，三角色标签页）。

**DEFAULT_SETTINGS 关键配置项分组**：

| 分组 | 配置项 | 说明 |
|------|--------|------|
| 角色设置 | `Character`, `bossRequireCounts`, `weaponMaterialRequireCounts`, `talentBookRequireCounts` | 角色名与目标等级 |
| 队伍设置 | `teamName`, `strategyName`, `teamName2`, `isNoGrassGod` | 战斗/采集队伍 |
| 行为开关 | `energyMax`, `unfairContractTerms` | 行为控制 |
| 圣遗物 | `domainRunMode`, `artifactDomainRotate`, `domainRunMode2`, `domainRunMode3` | 秘境选择与多副本轮换 |
| 圣遗物功能 | `useTransientResin`, `transientResinCount`, `autoArtifactSalvage`, `enable5StarArtifactSalvage` | 须臾树脂/自动分解/五星分解 |
| 地脉花 | `adventurePath`, `enableLeyLineDoubleDrop`, `leyLineDoubleDropType` | 地脉花地区与双倍活动 |
| UID 遮挡 | `enableUidMask`, `uidMaskPositionX`, `uidMaskPositionY` | UID 遮挡图片 |

### 8.2 config.json（运行时主配置）

路径：`data/run_data/config.json`，JSON 数组格式，每项为单 key 对象：

```json
[
  {"LocalSpecialties": "琉璃百合"},
  {"needLocalAmount": 60},
  {"Magic material0": "丘丘人"},
  {"needMonsterStar3": 12},
  {"bossMaterialName": "爆炎树"},
  {"bossRequireCounts0": "2"},
  {"talentDomainName": "自由"},
  {"talentBookRequireCounts0": "0-6-16"},
  {"weaponDomainName": "高塔孤王"},
  {"weaponMaterialRequireCounts0": "0-0-0-6"},
  {"characterLevel": 80},
  {"weaponLevel": "80级未突破"},
  {"currentUid": "100012345"}
]
```

**关键配置键**：

| 键 | 说明 |
|----|------|
| `LocalSpecialties` | 地方特产名称 |
| `Magic material0` | 敌人与魔物关键词 |
| `Weapons1 material0` / `Weapons2 material0` | 武器魔物关键词 |
| `bossMaterialName` | Boss 名称 |
| `bossMaterialNameRaw` | Boss 材料原始名（延迟解析） |
| `talentMobMaterialNameRaw` | 天赋魔物材料三连 "1★,2★,3★" |
| `Weapons1 materialNameRaw` / `Weapons2 materialNameRaw` | 武器材料三连 |
| `talentDomainName` | 天赋书名称 |
| `weaponDomainName` | 武器秘境名称 |
| `needLocalAmount` / `needMonsterStar3` / `needamount1 stars3` / `needamount2 stars3` | 各类材料缺口 |
| `totalNeed*` | 总需求量（背包 API 扫描不覆盖） |
| `weaponStar` | 武器星级 |
| `characterLevel` / `characterBreak` / `talentLevels` / `weaponLevel` | 角色当前状态 |

### 8.3 combat_avatar.json（角色别名映射）

```json
[
  {
    "alias": ["旅行者", "主角", "爷", ...],
    "id": "20000000",
    "name": "旅行者",
    "nameEn": "Traveler",
    "weapon": "1",
    "element": "风"
  }
]
```

### 8.4 Mapping.json（材料 → 魔物映射）

```json
[
  {
    "alias": ["巡陆艇"],
    "id": "0001",
    "name": "巡陆艇",
    "material": "毁损机轴,加固机轴,精制机轴",
    "nameEn": "Patrol Boat",
    "type": "common"
  }
]
```

`material` 字段为 "1★,2★,3★" 三连，`type` 区分 `common`（普通）与 `Elite`（精英）。

---

## 9. 运行流程

### 9.1 启动流程详解

```
1. BGI 调度器触发 main.js
2. eval 加载 33 个 lib 模块
3. checkModulesLoaded() 验证模块完整性
4. Overlay.initOverlay() 初始化遮罩（显示 progress-mask.html）
5. Overlay.setTotalStages(12) / startTimer() / showOverlay()
6. 前置 UID 识别（Collection.getCurrentAccountUid）+ 与 user_settings.json 权威 UID 匹配
   - 权威为空 → 采用识别 UID 作为新权威
   - 一致 → 保持权威 UID
   - 不一致 → 作为新账号登记
7. loadSettingsFromJson(uid)：按 UID 分区读取设置（DEFAULT_SETTINGS 兜底）
8. ConfigGenerator.generateFromUserSettings(uid) 生成 config.json
9. 按账号设置显示/关闭 UID 遮挡
10. showSettingsModal() 始终弹出设置弹窗（30 秒倒计时）
11. 角色名标准化（getStandardCharacterName）
12. 霸王条款检查（未签署则弹窗确认，同意后按账号保存）
13. TaskManager.loadCompletedTasks() 加载已完成任务
14. 多角色培养循环 → 地脉花 → 圣遗物副本 → 材料采集
15. IIFE + cleanupResources() 清理（遮罩/UID遮挡/快捷键），防重复执行锁
```

### 9.2 Wiki 数据获取流程（主流程）

每个角色培养循环中无条件执行（`runWikiDataFetchFlow`）：

```
1. WikiFetcher.getCharacterMaterialsSmart(charName)
   - 先查本地 Character Data.json
   - 未命中则网页抓取 bilibili wiki
   - 返回 {bossMaterialName, talentMobMaterialName, specialtyName, talentBookName}
2. 校验 4 个关键字段非空
3. 写入 config.json：
   - bossMaterialNameRaw / talentMobMaterialNameRaw
   - LocalSpecialties / talentDomainName
   - Weapons1/2 materialNameRaw（如有武器）
4. （如有武器）WikiFetcher.getWeaponInfoSmart(weaponName)
   - 返回 {starLevel, weaponDomainName, weapons1MaterialName, ...}
5. CultivationMaterialCalculator 计算材料需求量
6. 写入各类 need* 配置
```

### 9.3 多角色培养循环（multiCharacter.js）

```
1. buildCultivationCharacters(settings, characterSlots) 构建培养列表
2. 对每个角色 runCharacterCultivation(char)：
   - applyCharacterToSettings() 应用角色配置
   - ConfigGenerator.generateFromUserSettings() 重新生成配置
   - runWikiDataFetchFlow()（主流程，无条件执行）
   - runCharacterRecognitionOrWikiScan() 角色识别/背包扫描
   - 全零检查（checkAllRequirementsZero）→ 弹窗提示
   - 三阶段刷取：runTalentBookFarming → runWeaponMaterialFarming → runBossMaterialFarming
   - snapshotCharacterConfig() 保存配置快照
3. 结果：'done' / 'skip' / 'fatal'（主角色失败终止）
4. 共享需求基线跨角色累加，避免重复刷取
```

### 9.4 材料刷取流程

```
天赋书刷取：
1. 从 config 读取 talentDomainName
2. Utils.fuzzyMatch 匹配候选天赋书名
3. Utils.parseAndValidateCounts 解析数量
4. TaskManager.isTaskCompleted 检查是否已完成
5. Farming.getTalentBook(name, counts, charName, uid)
   - 循环：queryStaminaValue → 计算次数 → 进入秘境 → Combat → 查询背包 → 更新缺口
6. 完成后 TaskManager.addCompletedTask

武器材料 / Boss 材料：流程类似
```

### 9.5 圣遗物副本刷取流程（artifactDomain.js）

```
1. selectArtifactDomainForRotation() 选择当天秘境：
   - 未启用轮换 → 主秘境（原逻辑）
   - 启用轮换 → 剔除空配置，按天循环 1→2→3→1
     - 第3个为空 → 双副本轮换；仅1个 → 恒刷；0个 → 跳过
   - 轮换起始日按 UID 持久化（getRotationStartDay）
2. queryStaminaValue() 识别当前原粹树脂
3. 精确计算次数：原粹树脂 40/次（双倍领取）优先、剩余体力按 20/次 补齐（count40 = min(配置, floor(体力/40))；count20 = min(配置−count40, floor((体力−40×count40)/20))），耗尽即结束（无多余次数）
4. 构建 AutoDomainParam：
   - AutoArtifactSalvage = settings.autoArtifactSalvage === true（默认关闭）
   - 先清零全部树脂计数字段，再同时传 OriginalResin40UseCount 与 OriginalResin20UseCount，旧版 BGI 无专用字段时降级传总次数 OriginalResinUseCount
   - TransientResinUseCount = useTransientResin ? min(配置, 拥有数量) : 0
5. dispatcher.runAutoDomainTask(param) 执行刷取
6. 可选五星圣遗物按键分解（enable5StarArtifactSalvage）
```

### 9.6 材料采集流程

```
runMaterialCollection():
1. dispatcher.addTimer(new RealtimeTimer("AutoPick"))  # 启用自动拾取
2. 读取 config / cooldownRecord
3. Collection.cleanExpiredCooldownRecords 清理过期冷却
4. 检查 4 类材料是否需要采集（需求 > 0 且未完成）
5. 如有需采集，genshin.tp(2297.62, -824.59) 前往指定地点
6. 按顺序执行：
   - 地方特产（采集队伍 teamName2）
   - 敌人与魔物（战斗队伍 teamName）
   - 武器1材料（战斗队伍）
   - 武器2材料（战斗队伍）
7. executeMaterialCollection 统一控制器：
   - 扫描 pathing 脚本目录
   - 过滤异常路径 / 冷却中脚本
   - 分批执行（executeLocalBatch / executeMonsterBatch）
   - 达到阈值触发角色识别更新缺口
8. 完成后标记 TaskManager.addCompletedTask
```

### 9.7 地脉花管理流程

```
runLeyLineManagement():
1. 读取设置与世界等级
2. 获取当前库存经验书数据
3. 计算经验缺口 → 经验书地脉花次数
4. 计算摩拉缺口（角色+武器+天赋所有消耗） → 摩拉地脉花次数
5. 根据当前树脂分配刷取次数
6. 执行地脉花（含战斗）
7. 标记任务完成
```

---

## 10. 运行方式

### 10.1 环境要求

- **BetterGI**：≥ `0.60.2-alpha.3`
- **游戏分辨率**：1920×1080（脚本内 `setGameMetrics(1920, 1080, scale)`，scale 通过 `Utils.getScreenDpiScale()` 动态取系统显示缩放，兼容 100%/125%/150% 等任意缩放用户）
- **地图追踪匹配方式**：必须为 `TemplateMatch`（地下地图），不可用 SIFT
- **前置订阅**：
  - 地区特产的所有路径脚本
  - 敌人与魔物的所有路径脚本

### 10.2 配置步骤

1. **订阅脚本**：在 BGI 中订阅本脚本
2. **添加到调度器**：全自动 → 调度器 → 新增配置组 → 添加 JS 脚本
3. **修改 JS 自定义配置**：右键脚本 → 修改 JS 自定义配置
   - 角色设置：角色名 / 元素 / 目标等级 / 天赋等级（三角色标签页）
   - 武器设置：目标等级
   - 队伍设置：战斗队伍 / 采集队伍 / 草神路线
   - 圣遗物设置：秘境选择 / **多副本轮换**（第 2/3 秘境按天轮流）/ 五星分解
   - 功能设置：**须臾树脂刷取次数** / **结束后自动分解圣遗物** / 霸王条款 / UID 遮挡
   - 其他：地脉花地区 / 能量恢复
4. **调度器设置**：开启地图追踪、自动拾取、生存位配置、战斗策略、自动检测战斗结束

### 10.3 启动运行

- 通过调度器运行（**不要直接运行**）
- 启动后始终弹出设置弹窗（遮罩面板），30 秒倒计时
- 进度遮罩显示 12 个阶段的实时进度
- 支持快捷键（通过 `Overlay.initKeyHook()`）

### 10.4 材料数据获取（Wiki 主流程）

每个角色培养前自动执行（无配置开关）：

- 自动从 bilibili wiki 获取角色/武器材料名称（本地缓存优先，未命中回退网页）
- 需在调度器【修改通用设置】中启用「JS HTTP 权限」
- 角色识别（仅等级）→ 背包 API 扫描（CountInventoryItem）计算缺口
- 支持本地缓存（Character Data.json / Weapons_data.json）

### 10.5 多账号支持

- 通过 `Collection.getCurrentAccountUid()` 识别当前 UID
- 任务记录、冷却记录、进度记录均以 UID 为 key 隔离
- UID 脱敏显示（`Utils.maskUid` 保留后 4 位）

---

## 11. 开发约束与约定

### 11.1 工程约定

| 约定 | 说明 |
|------|------|
| 模块加载 | 使用 `eval(file.readTextSync(path))` 顺序加载，每个模块暴露单一全局对象 |
| 图像模板匹配 | `threshold=0.85`, `Use3Channels=true` |
| OCR 重试 | 等待 600ms，最多 8 次 |
| 队伍切换 | 使用 `Utils.switchPartySafe` 安全切换 |
| 文件读写 | 使用 `Utils.readJson` 统一处理（数组自动合并为对象） |
| 进度更新 | `Overlay.updateStage` 含单调不降保护（百分比只能升不能降） |
| 消息通知 | 使用 `Utils.addNotification` 缓冲，`sendBufferedNotifications` 批量发送 |

### 11.2 硬性约束（来自项目记忆）

- 背包材料扫描使用 **CountInventoryItem API**（`dispatcher.runTask(SoloTask("CountInventoryItem", ...))`），替代原图片模板匹配 + OCR 方案
- 材料扫描支持 **多材料并行扫描**
- 扫描期间必须实现 **过期物品弹窗检查**
- 角色养成材料页切换坐标：`(770, 50)`
- 地方特产页切换坐标：`(960, 50)`
- 敌人/武器材料图标：`assets/images/怪物掉落素材`
- 地方特产图标：`assets/images/地方特产`
- 材料扫描最多 **20 次滚动**
- 滚动使用 **拖拽方式**，起始点 `(345, 910)`
- OCR 数量检测区域：`(x-1, y+96, 68, 24)`
- 模板匹配 **不使用** `_new.png` 变体图片
- 滚动距离计算基于锚点文本区域 `(140, 35, 121, 30)` 与第三行材料区域 `(120, 490, 120, 236)`
- 拖拽滚动需 **2.13x 补偿系数** 保证定位准确

### 11.3 错误处理

- 模块加载失败：抛出异常终止脚本
- Wiki 数据获取失败：显示错误弹窗，可回退到现有配置
- 全零检测：弹出设置窗供用户修改（3 天内同 UID 其他角色全零则按原配置继续）
- 手动取消任务：`Utils.isCancellationError()` 识别取消异常（`A task was canceled` / `OperationCanceledException`），所有 catch 块入口守卫 `if (Utils.isCancellationError(e)) throw e;` 立即上抛，顶层 IIFE 统一输出 `[脚本终止]` 并清理，不产生错误日志
- 圣遗物副本：体力不足（< 20）直接跳过；树脂耗尽精确结束，无多余次数
- 资源清理：`finally` 块确保关闭遮罩、UID 遮挡、快捷键钩子

### 11.4 脚本执行保护

[main.js:1456](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/main.js#L1456) 使用 IIFE + 全局锁变量 `__genshinMaterialScriptExecuting` 防止重复执行。

### 11.5 编码规范

- 文件编码：UTF-8
- 代码注释：中文（与用户语言一致）
- 变量命名：模块对象 PascalCase（`Constants`, `Utils`），方法 camelCase
- 日志前缀：`📌`（流程节点）、`✅`（成功）、`⚠️`（警告）、`❌`（错误）、`📊`（数据）、`🔢`（数量）

---

## 附录 A：版本更新日志（节选）

| 版本 | 主要变更 |
|------|---------|
| 2.1.5 | 圣遗物副本刷取（多副本按天轮换/树脂精确计算/须臾树脂/自动分解）、取消异常安全终止、domainRounds 修复 |
| 2.1.4 | Wiki 数据获取模块、地脉花管理、三列 UI、OCR 点击精度提升、任务完成记录 |
| 2.1.3 | HTML 模态框设置弹窗、三层设置读取策略、全零检测、配置默认值优化 |
| 2.1.2 | 新 Boss 适配 |
| 2.1.1 | 版本检查、文件结构重组、弹窗识别、异常路径过滤、OCR 重试机制 |
| 2.1.0 | 挪德卡莱 Boss、自动识别 Boss/天赋/武器秘境 |
| 1.7.0 | 挪德卡莱两只 Boss |

---

## 附录 B：关键路径速查

| 用途 | 路径 |
|------|------|
| 主入口 | [main.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/main.js) |
| 全局常量 | [lib/constants.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/constants.js) |
| 通用工具 | [lib/utils.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/utils.js) |
| 多角色培养 | [lib/multiCharacter.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/multiCharacter.js) |
| 三阶段刷取编排 | [lib/farmingStages.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/farmingStages.js) |
| 材料刷取 | [lib/farming.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/farming.js) |
| 材料采集 | [lib/collection.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/collection.js) |
| 材料采集统一控制器 | [lib/materialCollection.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/materialCollection.js) |
| 圣遗物副本（轮换） | [lib/artifactDomain.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/artifactDomain.js) |
| 角色识别 | [lib/character.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/character.js) |
| 战斗执行 | [lib/combat.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/combat.js) |
| Wiki 抓取 | [lib/wikiFetcher.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/wikiFetcher.js) |
| 遮罩管理 | [lib/overlay.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/overlay.js) |
| 设置弹窗 | [assets/settings-modal.html](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/assets/settings-modal.html) |
| 用户设置（UID 分区） | [lib/userSettings.js](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/lib/userSettings.js) |
| 运行时配置 | data/run_data/config.json |
| 用户设置 | data/user_settings.json |
| 角色别名 | [data/combat_avatar.json](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/data/combat_avatar.json) |
| 材料映射 | [data/Mapping.json](file:///f:/BGI/BetterGI/User/JsScript/角色养成一条龙3.0/data/Mapping.json) |

---

*本文档基于项目代码静态分析生成，最后更新：2026-08-25*
