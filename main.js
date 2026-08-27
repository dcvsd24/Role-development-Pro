// 主入口文件 - 角色养成一条龙Pro版
// 使用模块化架构，通过eval加载lib目录下的模块

log.info("开始加载模块...");

const MODULES = [
    "lib/checkVersion.js",
    "lib/constants.js",
    "lib/utils.js",
    "lib/nameUtils.js",
    "lib/multiCharacter.js",
    "lib/farmingStages.js",
    "lib/userSettings.js",
    "lib/recognitionCache.js",
    "lib/progressLogger.js",
    "lib/taskManager.js",
    "lib/ocrHelper.js",
    "lib/navigation.js",
    "lib/combat.js",
    "lib/inventoryRecordWriter.js",
    "lib/inventory.js",
    "lib/backStats.js",
    "lib/farming.js",
    "lib/collection.js",
    "lib/character.js",
    "lib/calculator.js",
    "lib/image_recognition.js",
    "lib/file_utils.js",
    "lib/overlay.js",
    "lib/wikiDataSaver.js",
    "lib/wikiFetcher.js",
    "lib/wikiLocal.js",
    "lib/configGenerator.js",
    "lib/leyLine.js",
    "lib/artifactDomain.js",
    "lib/materialCollection.js",
    "lib/weaponPicker.js",
    "lib/characterPicker.js"
];

for (const modulePath of MODULES) {
    try {
       // log.info(`正在加载模块: ${modulePath}`);
        eval(file.readTextSync(modulePath));
        log.info(`模块加载成功: ${modulePath}`);
    } catch (e) {
        log.error(`模块加载失败: ${modulePath}, 错误: ${e.message}`);
        throw new Error(`模块加载失败: ${modulePath}, 错误: ${e.message}`);
    }
}

log.info("所有模块加载完成");

// 模块加载验证
function checkModulesLoaded() {
    const requiredModules = ['Constants', 'Utils', 'ProgressLogger', 'TaskManager', 'OcrHelper', 'Navigation', 'Combat', 'InventoryRecordWriter', 'Inventory', 'Farming', 'Collection', 'Character', 'ImageRecognition', 'FileUtils', 'expCalculator', 'moraCalculation', 'resinCalculation', 'CultivationMaterialCalculator', 'ConfigGenerator', 'WeaponPicker', 'CharacterPicker'];
    const missingModules = [];

    for (const moduleName of requiredModules) {
        try {
            const moduleType = eval("typeof " + moduleName);
            if (moduleType === 'undefined') {
                missingModules.push(moduleName);
            }
        } catch (error) { if (Utils.isCancellationError(error)) throw error;
            missingModules.push(moduleName);
        }
    }

    if (missingModules.length > 0) {
        log.error("以下模块加载失败: " + missingModules.join(", "));
        return false;
    }
    return true;
}

// 显示错误弹窗（通用函数）
// options: { title, message, timeout, showAgreeBtn, onAgree }
// 返回: true 表示用户同意（如果 showAgreeBtn 为 true），false 表示用户关闭或超时
async function showErrorModal(options = {}) {
    const {
        title = '错误',
        message = '发生未知错误',
        timeout = 20,
        showAgreeBtn = false,
        onAgree = null
    } = options;

    // htmlMask 不可用时的降级处理
    if (typeof htmlMask === 'undefined' || !htmlMask || typeof htmlMask.show !== 'function') {
        const fallbackMsg = `[${title}] ${message}`;
        log.error(`htmlMask 不可用，无法显示错误弹窗: ${fallbackMsg}`);
        notification.send(`htmlMask 不可用: ${fallbackMsg}`);
        return false;
    }

    const warningWinId = htmlMask.show("assets/warning-modal.html", "warning-modal");
    htmlMask.setClickThrough(warningWinId, false);

    // 等待弹窗就绪
    const startTime = Date.now();
    const timeoutMs = timeout * 1000;
    let userAgreed = false;
    let initSent = false;

    // 先等待弹窗发送 ready 消息
    while (htmlMask.exists(warningWinId)) {
        if (Date.now() - startTime >= timeoutMs) {
            htmlMask.close(warningWinId);
            break;
        }

        const msg = await htmlMask.receive(warningWinId, 1000);
        if (msg) {
            const parsed = JSON.parse(msg);
            if (parsed.url === '/ready') {
                // 弹窗已就绪，等待一小段时间确保消息处理设置完成
                await sleep(500);
                // 发送初始化数据
                if (!initSent) {
                    htmlMask.send(warningWinId, "/initError", JSON.stringify({
                        title: title,
                        message: message,
                        timeout: timeout,
                        showAgreeBtn: showAgreeBtn
                    }));
                    initSent = true;
                }
            } else if (parsed.url === '/close') {
                htmlMask.close(warningWinId);
                break;
            } else if (parsed.url === '/agree') {
                userAgreed = true;
                htmlMask.close(warningWinId);
                if (onAgree) {
                    await onAgree();
                }
                break;
            }
        }
    }

    return userAgreed;
}

// 全局设置对象：供主流程与顶层材料采集函数（runMaterialCollection / executeMaterialCollection 等）共享。
// 若将其声明为 Main 内部的局部变量，顶层函数将读取到 BetterGI 注入的空 settings，导致角色名等显示为"未知角色"。
// ⚠️ 实测：全局 var 赋值无法真正遮蔽 BetterGI 通过 AddHostObject 注入的 settings 宿主对象，
// 对 settings.xxx 的写入会直接落入宿主侧 ExpandoObject（即脚本组配置里的 jsScriptSettingsObject）。
// 因此 settings 中只能存放可 JSON 序列化的扁平值（字符串/数字/布尔）；
// 嵌套 JS 对象一旦写入，脚本结束、V8 引擎释放后，BetterGI 保存配置组时会序列化该对象，
// 抛出 ObjectDisposedException（日志表现为 "保存JS脚本配置组失败: xxx"）。
var settings = {};

// 角色2/角色3 培养配置（嵌套对象）独立存放，严禁写入 settings（原因见上方注释）。
// 数据来源：data/user_settings.json 当前账号分区；运行中由设置弹窗保存消息更新。
var characterSlots = { character2: {}, character3: {} };

// 选择器窗口关闭后，将焦点拉回设置弹窗。
// BGI 宿主在 setClickThrough(windowId, false)（切为可交互）时会调用 SetForegroundWindow 激活窗口，
// 这是激活遮罩窗口的唯一可靠途径（HTML 内的 window.focus() 无法激活宿主窗口）。
// 选择器 WebView2 的销毁是异步的，销毁完成时系统会把焦点还给游戏，故需多次延迟重新激活。
async function refocusSettingsWindow(settingsWinId) {
    const activate = () => {
        try {
            if (htmlMask.exists(settingsWinId)) {
                htmlMask.setClickThrough(settingsWinId, false);
            }
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            // 窗口可能已关闭，忽略激活失败
        }
    };
    activate();
    for (const delay of [300, 700, 1200]) {
        await sleep(delay);
        activate();
    }
}

// 显示设置弹窗并等待用户操作（复用函数）
// 返回: savedSettings 对象（用户保存了设置）或 null（超时/取消）
// options.showAllZeroHint: 为 true 时显示"角色材料已全部收集完成"的黄色闪烁提示
async function showSettingsModal(currentSettings, options = {}, uid) {
    // htmlMask 不可用时的降级处理
    if (typeof htmlMask === 'undefined' || !htmlMask || typeof htmlMask.show !== 'function') {
        const fallbackMsg = 'htmlMask 不可用，无法显示设置弹窗，请通过 BetterGI 的「修改 JS 自定义配置」进行设置';
        log.error(fallbackMsg);
        notification.send(fallbackMsg);
        return null;
    }

    const settingsWinId = htmlMask.show("assets/settings-modal.html", "settings-modal");
    htmlMask.setClickThrough(settingsWinId, false);

    const initSettingsData = JSON.stringify({
        Character: currentSettings.Character || "",
        bossRequireCounts: currentSettings.bossRequireCounts || "80级",
        weaponMaterialRequireCounts: currentSettings.weaponMaterialRequireCounts || "80级",
        talentBookRequireCounts: currentSettings.talentBookRequireCounts || "1-10-10",
        teamName: currentSettings.teamName || "",
        strategyName: currentSettings.strategyName || "",
        teamName2: currentSettings.teamName2 || "",
        isNoGrassGod: currentSettings.isNoGrassGod || false,
        energyMax: currentSettings.energyMax || false,
        unfairContractTerms: currentSettings.unfairContractTerms || false,
        weaponName: currentSettings.weaponName || "",
        adventurePath: currentSettings.adventurePath || "蒙德",
        enableLeyLineDoubleDrop: currentSettings.enableLeyLineDoubleDrop || false,
        leyLineDoubleDropType: currentSettings.leyLineDoubleDropType || "经验书",
        enableUidMask: currentSettings.enableUidMask || false,
        uidMaskPositionX: currentSettings.uidMaskPositionX || "0",
        uidMaskPositionY: currentSettings.uidMaskPositionY || "0",
        domainRunMode: currentSettings.domainRunMode || "",
        artifactDomainRotate: !!currentSettings.artifactDomainRotate,
        domainRunMode2: currentSettings.domainRunMode2 || "",
        domainRunMode3: currentSettings.domainRunMode3 || "",
        useTransientResin: !!currentSettings.useTransientResin,
        transientResinCount: currentSettings.transientResinCount || "1",
        autoArtifactSalvage: currentSettings.autoArtifactSalvage === true,
        enable5StarArtifactSalvage: !!currentSettings.enable5StarArtifactSalvage,
        character2: characterSlots.character2 || {},
        character3: characterSlots.character3 || {},
        showAllZeroHint: options.showAllZeroHint || false
    });

    let startTime = Date.now();
    const timeoutMs = 30000;
    let savedSettings = null;
    let initSent = false;

    while (htmlMask.exists(settingsWinId)) {
        if (Date.now() - startTime >= timeoutMs) {
            htmlMask.close(settingsWinId);
            break;
        }

        const msg = await htmlMask.receive(settingsWinId, 1000);
        if (msg) {
            try {
                const parsed = JSON.parse(msg);
                if (parsed.url === '/ready') {
                    // HTML 已就绪，发送初始化设置数据
                    if (!initSent) {
                        htmlMask.send(settingsWinId, "/initSettings", initSettingsData);
                        initSent = true;
                    }
                } else if (parsed.url === '/close') {
                    htmlMask.close(settingsWinId);
                    let closeData = parsed.data;
                    if (typeof closeData === 'string') {
                        try { closeData = JSON.parse(closeData); } catch (e) {}
                    }
                    if (closeData && closeData.action === 'cancel') {
                        return null;
                    }
                    break;
                } else if (parsed.url === '/save') {
                    let saveData = parsed.data;
                    if (typeof saveData === 'string') {
                        try { saveData = JSON.parse(saveData); } catch (e) {}
                    }
                    savedSettings = saveData;
                    htmlMask.close(settingsWinId);
                    break;
                } else if (parsed.url === '/userActive') {
                    startTime = Date.now();
                } else if (parsed.url === '/openWeaponPicker') {
                    // 用户在设置弹窗中勾选"可选从遮罩页面选择"，打开武器选择遮罩
                    const selectedWeapon = await WeaponPicker.show();
                    // 将选择结果（可能为 null 表示取消）发送回设置弹窗
                    htmlMask.send(settingsWinId, "/weaponSelected", JSON.stringify({ weapon: selectedWeapon || "" }));
                    // 重置设置弹窗的超时计时，避免选择过程中超时
                    startTime = Date.now();
                    // 选择器窗口异步销毁会把焦点还给游戏，重新激活设置弹窗
                    await refocusSettingsWindow(settingsWinId);
                } else if (parsed.url === '/openCharacterPicker') {
                    // 用户在设置弹窗中勾选"可选从遮罩页面选择"，打开角色选择遮罩
                    const selectedCharacter = await CharacterPicker.show();
                    // 将选择结果（可能为 null 表示取消）发送回设置弹窗
                    htmlMask.send(settingsWinId, "/characterSelected", JSON.stringify({ name: selectedCharacter || "" }));
                    // 重置设置弹窗的超时计时，避免选择过程中超时
                    startTime = Date.now();
                    // 选择器窗口异步销毁会把焦点还给游戏，重新激活设置弹窗
                    await refocusSettingsWindow(settingsWinId);
                }
            } catch (parseError) { if (Utils.isCancellationError(parseError)) throw parseError;
                if (msg === '/close') {
                    htmlMask.close(settingsWinId);
                    return null;
                }
            }
        }
    }
    
    if (savedSettings) {
        try {
            // 按账号分区保存，避免多账号设置互相覆盖
            const store = readUserSettingsStore();
            setSettingsForUid(store, uid || Constants.DEFAULT_UID, savedSettings);
            writeUserSettingsStore(store);
            
            settings.Character = savedSettings.Character;
            settings.bossRequireCounts = savedSettings.bossRequireCounts;
            settings.weaponMaterialRequireCounts = savedSettings.weaponMaterialRequireCounts;
            settings.talentBookRequireCounts = savedSettings.talentBookRequireCounts;
            settings.teamName = savedSettings.teamName;
            settings.strategyName = savedSettings.strategyName;
            settings.teamName2 = savedSettings.teamName2;
            settings.isNoGrassGod = savedSettings.isNoGrassGod;
            settings.energyMax = savedSettings.energyMax;
            settings.unfairContractTerms = savedSettings.unfairContractTerms;
            settings.weaponName = savedSettings.weaponName || "";
            settings.adventurePath = savedSettings.adventurePath;
            settings.enableLeyLineDoubleDrop = savedSettings.enableLeyLineDoubleDrop;
            settings.leyLineDoubleDropType = savedSettings.leyLineDoubleDropType;
            settings.enableUidMask = savedSettings.enableUidMask;
            settings.uidMaskPositionX = savedSettings.uidMaskPositionX;
            settings.uidMaskPositionY = savedSettings.uidMaskPositionY;
            settings.domainRunMode = savedSettings.domainRunMode || "";
            settings.artifactDomainRotate = !!savedSettings.artifactDomainRotate;
            settings.domainRunMode2 = savedSettings.domainRunMode2 || "";
            settings.domainRunMode3 = savedSettings.domainRunMode3 || "";
            settings.useTransientResin = !!savedSettings.useTransientResin;
            settings.transientResinCount = savedSettings.transientResinCount || "1";
            settings.autoArtifactSalvage = savedSettings.autoArtifactSalvage === true;
            settings.enable5StarArtifactSalvage = !!savedSettings.enable5StarArtifactSalvage;
            // 嵌套对象写入 characterSlots，不写入 settings（避免宿主对象残留 V8 对象导致配置组保存失败）
            characterSlots.character2 = savedSettings.character2 || {};
            characterSlots.character3 = savedSettings.character3 || {};

            return savedSettings;
        } catch (saveError) { if (Utils.isCancellationError(saveError)) throw saveError;
            log.error(`保存设置失败: ${saveError.message}`);
            return null;
        }
    }
    
    return null;
}

// 主逻辑
const Main = async () => {
    try {
        await printVersion();

        if (!checkModulesLoaded()) {
            log.error("模块加载失败，脚本终止");
            return;
        }

        log.info("✅ 所有模块验证通过");

        // 重置 Combat 队伍切换标志（避免跨次运行残留导致不切换队伍）
        if (typeof Combat !== 'undefined' && Combat._partySwitched !== undefined) {
            Combat._partySwitched = false;
        }

        // 初始化 HTML 遮罩
        let currentVersion = JSON.parse(file.readTextSync("manifest.json")).version;
        Overlay.initOverlay(currentVersion);
        
        // 设置总阶段数并启动计时
        Overlay.setTotalStages(12);
        Overlay.startTimer();
        
        // 显示遮罩
        await Overlay.showOverlay({
            stage: '准备中',
            status: '正在初始化...',
            percentage: 0,
            current: 0,
            total: 12,
            elapsedTime: '00分00秒'
        });
        
        // 初始化快捷键
        Overlay.initKeyHook();
        
        // 默认配置（原 settings.json 的 default 值迁移至此）
        const DEFAULT_SETTINGS = {
            Character: "",
            bossRequireCounts: "80级",
            weaponMaterialRequireCounts: "80级",
            talentBookRequireCounts: "1-10-10",
            teamName: "",
            strategyName: "",
            teamName2: "",
            isNoGrassGod: false,
            energyMax: false,
            unfairContractTerms: false,
            weaponName: "",
            adventurePath: "蒙德",
            enableLeyLineDoubleDrop: false,
            leyLineDoubleDropType: "经验书",
            enableUidMask: false,
            uidMaskPositionX: "31",
            uidMaskPositionY: "117",
            domainRunMode: "",
            artifactDomainRotate: false,
            domainRunMode2: "",
            domainRunMode3: "",
            useTransientResin: false,
            transientResinCount: "1",
            autoArtifactSalvage: false,
            enable5StarArtifactSalvage: false
            // 注：角色2/角色3 嵌套配置不在此处，单独存放于全局 characterSlots（不能写入 settings）
        };

        // 防御性初始化：删除 settings.json 后 BetterGI 可能不再注入 settings 全局对象。
        // 注意：此处不能使用 `var settings`，否则会在 Main 内部创建一个局部变量，遮蔽全局 settings，
        // 导致 runMaterialCollection 等顶层函数读取不到已加载的账号设置（表现为角色名"未知角色"）。
        if (!settings || typeof settings !== 'object') {
            settings = {};
        }

        // 按 UID 读取设置：仅读取 data/user_settings.json 中当前账号分区，缺失字段使用 DEFAULT_SETTINGS 默认值
        function loadSettingsFromJson(uid) {
            try {
                const store = readUserSettingsStore();
                const userSettings = getSettingsForUid(store, uid) || {};
                log.info(`按UID读取到用户自定义设置（UID: ${Utils.maskUid(uid)}）`);

                // 遍历 DEFAULT_SETTINGS，优先使用当前账号设置，缺失则用默认值
                for (const key of Object.keys(DEFAULT_SETTINGS)) {
                    if (userSettings[key] !== undefined && userSettings[key] !== null) {
                        settings[key] = userSettings[key];
                    } else {
                        settings[key] = DEFAULT_SETTINGS[key];
                    }
                }

                // 角色2/角色3 嵌套配置单独加载到 characterSlots（不写入 settings，原因见顶部注释）
                characterSlots.character2 = (userSettings.character2 && typeof userSettings.character2 === 'object') ? userSettings.character2 : {};
                characterSlots.character3 = (userSettings.character3 && typeof userSettings.character3 === 'object') ? userSettings.character3 : {};
            } catch (e) { if (Utils.isCancellationError(e)) throw e;
                log.warn(`读取设置文件失败: ${e.message}`);
                // 兜底：确保所有字段有默认值
                for (const key of Object.keys(DEFAULT_SETTINGS)) {
                    if (settings[key] === undefined) {
                        settings[key] = DEFAULT_SETTINGS[key];
                    }
                }
            }
        }
        
        // 前置识别当前账号UID（用于区分不同账号的设置），必须在设置弹窗弹出之前完成
        // UID识别期间即显示遮挡（隐私优先，用默认位置）：识别后按该账号设置校正位置或关闭。
        // 注：遮挡为遮罩浮层，不影响 BetterGI 对游戏窗口的 OCR 抓取。
        {
            const defaultMaskX = parseInt(DEFAULT_SETTINGS.uidMaskPositionX) || 0;
            const defaultMaskY = parseInt(DEFAULT_SETTINGS.uidMaskPositionY) || 0;
            Overlay.showUidMask(defaultMaskX, defaultMaskY);
            log.info(`📌 UID遮挡已在UID识别前显示（默认位置 ${defaultMaskX},${defaultMaskY}），稍后按账号设置校正`);
        }
        let currentUid = await Collection.getCurrentAccountUid();
        log.info(`📌 前置识别当前账号UID：${Utils.maskUid(currentUid)}`);

        // UID 匹配与账号判定：与权威 UID（user_settings.json 的 currentUid）比对，保证后续使用统一 UID
        {
            const settingsStore = readUserSettingsStore();
            const authoritativeUid = String(settingsStore.currentUid || "").trim();
            // 识别成功（非兜底）才参与匹配，识别失败沿用权威
            if (currentUid && currentUid !== Constants.DEFAULT_UID) {
                if (!authoritativeUid || authoritativeUid === Constants.DEFAULT_UID) {
                    // 权威为空/未设置 → 直接使用识别 UID 作为新权威
                    settingsStore.currentUid = currentUid;
                    writeUserSettingsStore(settingsStore);
                    log.info(`✅ 权威 UID 未设置，采用识别 UID：${Utils.maskUid(currentUid)}`);
                } else if (currentUid === authoritativeUid) {
                    // 匹配成功 → 保持使用原权威 UID（避免破坏之前已使用的 UID 配置）
                    currentUid = authoritativeUid;
                    log.info(`✅ UID 匹配成功，保持使用原权威 UID：${Utils.maskUid(currentUid)}`);
                } else {
                    // 不一致 → 视为新 UID 账号，采用识别 UID 并更新权威
                    settingsStore.currentUid = currentUid;
                    writeUserSettingsStore(settingsStore);
                    log.info(`🆕 识别 UID 与权威不一致，作为新账号使用：${Utils.maskUid(currentUid)}`);
                }
            } else {
                // 识别失败（兜底）→ 不覆盖权威，沿用权威 UID（权威也为空则沿用兜底值）
                log.warn(`⚠️ UID 识别失败（兜底），沿用权威 UID：${Utils.maskUid(authoritativeUid)}`);
                currentUid = authoritativeUid || currentUid;
            }
        }

        // 加载设置
        loadSettingsFromJson(currentUid);

        try {
            await ConfigGenerator.generateFromUserSettings(currentUid);
        } catch (configError) { if (Utils.isCancellationError(configError)) throw configError;
            log.warn(`自动生成运行配置失败，将继续使用现有配置: ${configError.message}`);
        }
        
        // 显示/关闭 UID 遮挡图片 - 按当前账号设置校正（识别前已用默认位置显示）
        if (settings.enableUidMask) {
            const uidMaskX = parseInt(settings.uidMaskPositionX) || 0;
            const uidMaskY = parseInt(settings.uidMaskPositionY) || 0;
            Overlay.showUidMask(uidMaskX, uidMaskY);
            log.info(`✅ UID遮挡已启用，位置: (${uidMaskX}, ${uidMaskY})`);
        } else {
            Overlay.closeUidMask();
            log.info("ℹ️ 当前账号未启用UID遮挡，已关闭识别前显示的遮挡");
        }
        
        // 检查角色名称是否为空
        let inputCharacterName = settings.Character ? settings.Character.trim() : "";
        
        log.info(`当前角色名称: "${inputCharacterName}"`);
        
        // 始终显示设置弹窗（遮罩面板）
        log.info("📌 显示设置弹窗（遮罩面板）");
        const savedSettings = await showSettingsModal(settings, {}, currentUid);
        if (savedSettings) {
            inputCharacterName = savedSettings.Character ? savedSettings.Character.trim() : "";

            // 更新 UID 遮挡位置（如果已启用）
            if (settings.enableUidMask) {
                const uidMaskX = parseInt(settings.uidMaskPositionX) || 0;
                const uidMaskY = parseInt(settings.uidMaskPositionY) || 0;
                Overlay.showUidMask(uidMaskX, uidMaskY);
                log.info(`✅ UID遮挡位置已更新: (${uidMaskX}, ${uidMaskY})`);
            } else {
                Overlay.closeUidMask();
            }
        } else {
            // 用户取消或超时
            if (!inputCharacterName) {
                throw new Error('未配置角色名称，脚本终止');
            }
            log.info("📌 用户取消设置弹窗，使用现有配置继续运行");
        }
        
        if (!inputCharacterName) {
            log.warn("角色名称为空，请先配置设置");

            // 复用 showSettingsModal 的 ready-handshake 流程，避免初始化消息竞态
            const savedSettings = await showSettingsModal(settings, {}, currentUid);
            if (savedSettings) {
                inputCharacterName = savedSettings.Character ? savedSettings.Character.trim() : "";

                // 更新 UID 遮挡位置（如果已启用）
                if (settings.enableUidMask) {
                    const uidMaskX = parseInt(settings.uidMaskPositionX) || 0;
                    const uidMaskY = parseInt(settings.uidMaskPositionY) || 0;
                    Overlay.showUidMask(uidMaskX, uidMaskY);
                    log.info(`✅ UID遮挡位置已更新: (${uidMaskX}, ${uidMaskY})`);
                } else {
                    Overlay.closeUidMask();
                }

                log.info("设置已更新，继续运行脚本");
            } else {
                throw new Error('未配置角色名称，脚本终止');
            }
        }
        
        // 设置角色名称（从 combat_avatar.json 获取标准名称）
        if (inputCharacterName) {
            const standardCharacterName = getStandardCharacterName(inputCharacterName);
            if (standardCharacterName) {
                Overlay.setCharacterName(standardCharacterName);
                log.info(`✅ 当前培养角色: ${standardCharacterName}`);
            } else {
                log.warn(`未找到角色 "${inputCharacterName}" 的标准名称`);
            }
        }
        
        // 检查霸王条款
        if (!settings.unfairContractTerms) {
            log.warn("{0}", Constants.ERROR_NO_README_MD);

            const userAgreed = await showErrorModal({
                title: '未签署霸王条款',
                message: '未签署霸王条款，无法使用，点击同意，即可继续。详细信息，请先右键点击脚本名称选择 [ 打开脚本所在目录 ] 阅读README.md文档',
                timeout: 15,
                showAgreeBtn: true,
                onAgree: async () => {
                    // 用户同意，按当前账号分区保存设置到 user_settings.json
                    try {
                        const store = readUserSettingsStore();
                        const cur = getSettingsForUid(store, currentUid) || {};
                        cur.unfairContractTerms = true;
                        setSettingsForUid(store, currentUid, cur);
                        writeUserSettingsStore(store);
                        settings.unfairContractTerms = true;
                        log.info("用户已同意霸王条款，设置已保存");
                    } catch (saveError) { if (Utils.isCancellationError(saveError)) throw saveError;
                        log.error(`保存霸王条款同意状态失败: ${saveError.message}`);
                    }
                }
            });

            if (!userAgreed) {
                throw new Error('未签署霸王条款，无法使用');
            }
        }
        
        // 加载已完成任务记录
        const completedTasks = TaskManager.loadCompletedTasks();
        log.info(`已加载 ${Object.keys(completedTasks).length} 个已完成任务记录`);
        
        // ========== Wiki 数据获取逻辑（如果启用）==========
        async function runWikiDataFetchFlow(charName) {
            log.info("📌 启用了从网页获取角色材料数据功能");
            Overlay.updateStage('Wiki数据获取', '正在从B站Wiki获取材料信息...', 3);
            
            try {
                // 分批次获取策略：开头只获取材料名称，不获取详细来源
                const wikiMaterials = await WikiFetcher.getCharacterMaterialsSmart(charName);
                
                if (wikiMaterials) {
                    log.info(`📌 Wiki 材料名称获取结果: Boss材料=${wikiMaterials.bossMaterialName}, 天赋怪物材料=${wikiMaterials.talentMobMaterialName}, 区域特产=${wikiMaterials.specialtyName}, 天赋书=${wikiMaterials.talentBookName}`);

                    // 校验 Wiki 解析结果，防止材料名为空或关键字段缺失时写入错误配置
                    const requiredWikiFields = ['bossMaterialName', 'talentMobMaterialName', 'specialtyName', 'talentBookName'];
                    const missingWikiFields = requiredWikiFields.filter(field => !wikiMaterials[field] || wikiMaterials[field].toString().trim() === '');
                    if (missingWikiFields.length > 0) {
                        const wikiErrMsg = `Wiki 解析结果校验失败，缺少关键材料字段：${missingWikiFields.join(', ')}，请检查角色名称或稍后重试`;
                        log.error(`❌ ${wikiErrMsg}`);
                        notification.send(wikiErrMsg);
                        throw new Error(wikiErrMsg);
                    }

                    // 自动填充配置（使用正确的字段名称）
                    const configPath = Constants.CONFIG_PATH;
                    let configData = [];
                    try {
                        configData = JSON.parse(file.readTextSync(configPath));
                    } catch (e) { if (Utils.isCancellationError(e)) throw e;
                        configData = [];
                    }
                    
                    // 检查并填充 Boss 材料名称（字段名：bossMaterialNameRaw，用于延迟获取Boss名称）
                    if (wikiMaterials.bossMaterialName) {
                        const bossMaterialConfigIndex = configData.findIndex(item => item.hasOwnProperty("bossMaterialNameRaw"));
                        if (bossMaterialConfigIndex !== -1) {
                            configData[bossMaterialConfigIndex]["bossMaterialNameRaw"] = wikiMaterials.bossMaterialName;
                            log.info(`✅ 已更新 Boss 材料名称: ${wikiMaterials.bossMaterialName}`);
                        } else {
                            configData.push({ "bossMaterialNameRaw": wikiMaterials.bossMaterialName });
                            log.info(`✅ 已添加 Boss 材料名称: ${wikiMaterials.bossMaterialName}`);
                        }
                    }
                    
                    // 检查并填充天赋怪物材料名称（字段名：talentMobMaterialNameRaw，用于延迟获取天赋怪物名称）
                    if (wikiMaterials.talentMobMaterialName) {
                        // common_material 格式为 "一星,二星,三星"，保存完整三连用于 Mapping.json
                        // 下游使用处（背包扫描、查魔物名）自行 split 取首值
                        const rawMagicMaterials = wikiMaterials.talentMobMaterialName.split(",").map(s => s.trim()).filter(s => s).join(",");
                        const firstTalentMobMaterial = wikiMaterials.talentMobMaterialName.split(",")[0].trim();
                        const talentMobMaterialConfigIndex = configData.findIndex(item => item.hasOwnProperty("talentMobMaterialNameRaw"));
                        if (talentMobMaterialConfigIndex !== -1) {
                            configData[talentMobMaterialConfigIndex]["talentMobMaterialNameRaw"] = rawMagicMaterials;
                            log.info(`✅ 已更新天赋怪物材料名称: ${rawMagicMaterials}`);
                        } else {
                            configData.push({ "talentMobMaterialNameRaw": rawMagicMaterials });
                            log.info(`✅ 已添加天赋怪物材料名称: ${rawMagicMaterials}`);
                        }
                        
                        // 同时将天赋怪物材料名称作为临时值写入 Magic material0（后续采集前会更新为真正的怪物名称）
                        const magicMaterialIndex = configData.findIndex(item => item.hasOwnProperty("Magic material0"));
                        if (magicMaterialIndex !== -1) {
                            configData[magicMaterialIndex]["Magic material0"] = firstTalentMobMaterial;
                            log.info(`✅ 已写入天赋怪物材料名称作为临时关键词: ${firstTalentMobMaterial}`);
                        } else {
                            configData.push({ "Magic material0": firstTalentMobMaterial });
                            log.info(`✅ 已添加天赋怪物材料名称作为临时关键词: ${firstTalentMobMaterial}`);
                        }
                    }
                    
                    // 检查并填充区域特产名称（字段名：LocalSpecialties）
                    if (wikiMaterials.specialtyName) {
                        const specialtyConfigIndex = configData.findIndex(item => item.hasOwnProperty("LocalSpecialties"));
                        if (specialtyConfigIndex !== -1) {
                            configData[specialtyConfigIndex]["LocalSpecialties"] = wikiMaterials.specialtyName;
                            log.info(`✅ 已更新区域特产名称: ${wikiMaterials.specialtyName}`);
                        } else {
                            configData.push({ "LocalSpecialties": wikiMaterials.specialtyName });
                            log.info(`✅ 已添加区域特产名称: ${wikiMaterials.specialtyName}`);
                        }
                    }
                    
                    // 检查并填充天赋书名称（字段名：talentDomainName）
                    if (wikiMaterials.talentBookName) {
                        const talentBookConfigIndex = configData.findIndex(item => item.hasOwnProperty("talentDomainName"));
                        if (talentBookConfigIndex !== -1) {
                            configData[talentBookConfigIndex]["talentDomainName"] = wikiMaterials.talentBookName;
                            log.info(`✅ 已更新天赋书名称: ${wikiMaterials.talentBookName}`);
                        } else {
                            configData.push({ "talentDomainName": wikiMaterials.talentBookName });
                            log.info(`✅ 已添加天赋书名称: ${wikiMaterials.talentBookName}`);
                        }
                    }
                    
                    // 获取武器信息（只有武器名称不为空时才获取）- 快速模式，只获取材料名称
                    if (settings.weaponName && settings.weaponName.trim() !== "") {
                        const weaponInfo = await WikiFetcher.getWeaponInfoSmart(settings.weaponName);

                        // 校验 Wiki 武器解析结果，防止武器名为空或关键字段缺失时写入错误配置
                        const requiredWeaponFields = ['starLevel', 'weaponDomainName', 'weapons1MaterialName', 'weapons2MaterialName'];
                        const missingWeaponFields = requiredWeaponFields.filter(field => !weaponInfo || !weaponInfo[field] || weaponInfo[field].toString().trim() === '');
                        if (missingWeaponFields.length > 0) {
                            const weaponErrMsg = `Wiki 武器解析结果校验失败，缺少关键字段：${missingWeaponFields.join(', ')}，请检查武器名称或稍后重试`;
                            log.error(`❌ ${weaponErrMsg}`);
                            notification.send(weaponErrMsg);
                            throw new Error(weaponErrMsg);
                        }

                        if (weaponInfo) {
                            // 处理武器星级
                            if (weaponInfo.starLevel) {
                                const weaponStarConfigIndex = configData.findIndex(item => item.hasOwnProperty("weaponStar"));
                                if (weaponStarConfigIndex !== -1) {
                                    configData[weaponStarConfigIndex]["weaponStar"] = weaponInfo.starLevel;
                                    log.info(`✅ 已更新武器星级: ${weaponInfo.starLevel}`);
                                } else {
                                    const weaponLevelIndex = configData.findIndex(item => item.hasOwnProperty("weaponLevel"));
                                    if (weaponLevelIndex !== -1) {
                                        configData[weaponLevelIndex]["weaponStar"] = weaponInfo.starLevel;
                                        log.info(`✅ 已添加武器星级到现有配置: ${weaponInfo.starLevel}`);
                                    } else {
                                        configData.push({ "weaponStar": weaponInfo.starLevel });
                                        log.info(`✅ 已添加武器星级: ${weaponInfo.starLevel}`);
                                    }
                                }
                            }
                            
                            // 处理武器秘境名称
                            if (weaponInfo.weaponDomainName) {
                                const weaponDomainConfigIndex = configData.findIndex(item => item.hasOwnProperty("weaponDomainName"));
                                if (weaponDomainConfigIndex !== -1) {
                                    configData[weaponDomainConfigIndex]["weaponDomainName"] = weaponInfo.weaponDomainName;
                                    log.info(`✅ 已更新武器秘境名称: ${weaponInfo.weaponDomainName}`);
                                } else {
                                    configData.push({ "weaponDomainName": weaponInfo.weaponDomainName });
                                    log.info(`✅ 已添加武器秘境名称: ${weaponInfo.weaponDomainName}`);
                                }
                            }
                            
                            // 保存武器1材料名称（用于延迟获取武器魔物名称 + Mapping.json 三连）
                            // weapons1MaterialName 为 1★，weapons1MaterialName2/3 为 2★/3★，拼成完整三连存入 raw
                            if (weaponInfo.weapons1MaterialName) {
                                const w1Stars = [weaponInfo.weapons1MaterialName, weaponInfo.weapons1MaterialName2, weaponInfo.weapons1MaterialName3]
                                    .map(s => (s || "").toString().trim())
                                    .filter(Boolean);
                                const rawWeapons1Materials = w1Stars.join(",");
                                const weapons1MaterialConfigIndex = configData.findIndex(item => item.hasOwnProperty("Weapons1 materialNameRaw"));
                                if (weapons1MaterialConfigIndex !== -1) {
                                    configData[weapons1MaterialConfigIndex]["Weapons1 materialNameRaw"] = rawWeapons1Materials;
                                    log.info(`✅ 已更新武器1材料名称: ${rawWeapons1Materials}`);
                                } else {
                                    configData.push({ "Weapons1 materialNameRaw": rawWeapons1Materials });
                                    log.info(`✅ 已添加武器1材料名称: ${rawWeapons1Materials}`);
                                }

                                // 同时将武器1材料名称（1★ 首值）作为临时值写入 Weapons1 material0（后续采集前会更新为真正的魔物名称）
                                const weapons1FirstMaterial = weaponInfo.weapons1MaterialName;
                                const weapons1MobIndex = configData.findIndex(item => item.hasOwnProperty("Weapons1 material0"));
                                if (weapons1MobIndex !== -1) {
                                    configData[weapons1MobIndex]["Weapons1 material0"] = weapons1FirstMaterial;
                                    log.info(`✅ 已写入武器1材料名称作为临时关键词: ${weapons1FirstMaterial}`);
                                } else {
                                    configData.push({ "Weapons1 material0": weapons1FirstMaterial });
                                    log.info(`✅ 已添加武器1材料名称作为临时关键词: ${weapons1FirstMaterial}`);
                                }
                            }

                            // 保存武器2材料名称（用于延迟获取武器魔物名称 + Mapping.json 三连）
                            if (weaponInfo.weapons2MaterialName) {
                                const w2Stars = [weaponInfo.weapons2MaterialName, weaponInfo.weapons2MaterialName2, weaponInfo.weapons2MaterialName3]
                                    .map(s => (s || "").toString().trim())
                                    .filter(Boolean);
                                const rawWeapons2Materials = w2Stars.join(",");
                                const weapons2MaterialConfigIndex = configData.findIndex(item => item.hasOwnProperty("Weapons2 materialNameRaw"));
                                if (weapons2MaterialConfigIndex !== -1) {
                                    configData[weapons2MaterialConfigIndex]["Weapons2 materialNameRaw"] = rawWeapons2Materials;
                                    log.info(`✅ 已更新武器2材料名称: ${rawWeapons2Materials}`);
                                } else {
                                    configData.push({ "Weapons2 materialNameRaw": rawWeapons2Materials });
                                    log.info(`✅ 已添加武器2材料名称: ${rawWeapons2Materials}`);
                                }

                                // 同时将武器2材料名称（1★ 首值）作为临时值写入 Weapons2 material0（后续采集前会更新为真正的魔物名称）
                                const weapons2FirstMaterial = weaponInfo.weapons2MaterialName;
                                const weapons2MobIndex = configData.findIndex(item => item.hasOwnProperty("Weapons2 material0"));
                                if (weapons2MobIndex !== -1) {
                                    configData[weapons2MobIndex]["Weapons2 material0"] = weapons2FirstMaterial;
                                    log.info(`✅ 已写入武器2材料名称作为临时关键词: ${weapons2FirstMaterial}`);
                                } else {
                                    configData.push({ "Weapons2 material0": weapons2FirstMaterial });
                                    log.info(`✅ 已添加武器2材料名称作为临时关键词: ${weapons2FirstMaterial}`);
                                }
                            }
                        }
                    }
                    
                    // 注：材料总需求计算已移至 runCharacterRecognitionOrWikiScan 中角色识别之后执行（基于识别等级）
                    // 此处仅保存材料名称到配置

                    // 保存更新后的配置
                    file.writeTextSync(configPath, JSON.stringify(configData, null, 2));
                    log.info("✅ Wiki 材料数据已保存到配置文件");
                } else {
                    log.warn("⚠️ Wiki 数据获取失败，将使用现有配置继续运行");
                }
            } catch (wikiError) { if (Utils.isCancellationError(wikiError)) throw wikiError;
                // 检查是否是HTTP权限错误
                if (wikiError.message.includes("不允许使用HTTP请求") || wikiError.message.includes("JS HTTP权限")) {
                    log.error(`❌ ${wikiError.message}`);

                    // 显示警告弹窗并结束脚本
                    await showErrorModal({
                        title: 'Wiki数据获取失败',
                        message: wikiError.message + '\n\n请在调度器【修改通用设置】中滑动到最底下，启用「JS HTTP权限」后重试。',
                        timeout: 20
                    });

                    throw new Error(wikiError.message);
                }

                // 检查是否是我们抛出的错误（角色/武器/材料不存在等）
                if (wikiError.message.includes("名字错误") || wikiError.message.includes("名称错误") || wikiError.message.includes("不存在") || wikiError.message.includes("获取失败")) {
                    log.error(`❌ ${wikiError.message}`);

                    // 显示错误弹窗并结束脚本
                    await showErrorModal({
                        title: 'Wiki数据获取失败',
                        message: wikiError.message,
                        timeout: 20
                    });

                    throw new Error(wikiError.message);
                }

                log.error(`❌ Wiki 数据获取出错: ${wikiError.message}`);
                log.info("将使用现有配置继续运行");
            }
        }

        // ========== 第一步：执行角色识别与材料计算流程 ==========
        // 统一流程：角色识别（仅等级）→ 基于识别等级计算材料总需求 → 背包 API 扫描 → 缺口计算
        async function runCharacterRecognitionOrWikiScan(char) {
            log.info("📌 开始执行角色识别与材料计算流程...");
            setGameMetrics(1920, 1080, Utils.getScreenDpiScale());
            Overlay.updateStage('角色识别与材料计算', '正在识别角色材料信息...', 5);

            // 1. 角色识别（仅等级/突破/天赋/武器/摩拉，结果写入 config.json）
            //    优先复用当前 UID 已保存的识别等级（配置未变时跳过 OCR 识别）
            const fingerprint = getRecognitionSettingsFingerprint();
            let recognitionSuccess = false;
            try {
                const cacheParsed = JSON.parse(file.readTextSync(Constants.CONFIG_PATH));
                const cacheArray = Array.isArray(cacheParsed) ? cacheParsed : [];
                // 清理超过 3 天的失效缓存条目，发生删除时写回 config.json
                if (cleanExpiredRecognitionCache(cacheArray)) {
                    file.writeTextSync(Constants.CONFIG_PATH, JSON.stringify(cacheArray, null, 2));
                    log.info("🧹 已清理超过 3 天的角色识别缓存条目");
                }
                const cacheEntry = getRecognitionCacheEntry(cacheArray, currentUid);
                const cacheLevel = cacheEntry ? Number(cacheEntry.characterLevel) : NaN;
                if (cacheEntry && cacheEntry.fingerprint === fingerprint && Number.isInteger(cacheLevel) && cacheLevel > 0) {
                    // 命中缓存：回写扁平字段供下游材料计算读取，跳过 OCR 识别
                    restoreRecognitionCache(cacheArray, cacheEntry);
                    file.writeTextSync(Constants.CONFIG_PATH, JSON.stringify(cacheArray, null, 2));
                    const cacheHitName = getStandardCharacterName(settings.Character) || (settings.Character ? settings.Character.trim() : "未知角色");
                    log.info(`📌 命中角色识别缓存（UID ${Utils.maskUid(currentUid)} / 角色 ${cacheHitName}，配置未变），直接使用已保存等级：角色 ${cacheEntry.characterLevel} 级、天赋 ${cacheEntry.talentLevels || 'N/A'}、武器 ${cacheEntry.weaponLevel || 'N/A'}`);
                    recognitionSuccess = true;
                }
            } catch (cacheError) { if (Utils.isCancellationError(cacheError)) throw cacheError;
                log.warn(`⚠️ 读取角色识别缓存失败: ${cacheError.message}，将执行 OCR 识别`);
            }

            if (!recognitionSuccess) {
                log.info("📌 未命中角色识别缓存，执行 OCR 识别...");
                recognitionSuccess = await Character.findCharacterAndGetLevel();
                if (!recognitionSuccess) {
                    log.error("❌ 角色识别失败，终止主流程");
                    notification.send("角色识别失败，请检查角色是否正确配置");
                    return false;
                }
                // 识别成功 → 将结果写入当前 UID 的缓存快照
                // 仅当识别出的角色等级有效（正整数）才写缓存，避免把默认/无效等级写入缓存
                try {
                    const cacheParsed = JSON.parse(file.readTextSync(Constants.CONFIG_PATH));
                    const cacheArray = Array.isArray(cacheParsed) ? cacheParsed : [];
                    const lvlIdx = cacheArray.findIndex(item => item && item.hasOwnProperty("characterLevel"));
                    const flatLevel = lvlIdx !== -1 ? Number(cacheArray[lvlIdx]["characterLevel"]) : NaN;
                    if (!Number.isInteger(flatLevel) || flatLevel <= 0) {
                        log.warn(`⚠️ 识别出的角色等级无效（${lvlIdx !== -1 ? cacheArray[lvlIdx]["characterLevel"] : "无"}），跳过写入识别缓存`);
                    } else {
                        saveRecognitionCache(cacheArray, currentUid, fingerprint);
                        file.writeTextSync(Constants.CONFIG_PATH, JSON.stringify(cacheArray, null, 2));
                        log.info(`📌 角色识别结果已写入缓存（UID ${Utils.maskUid(currentUid)}），后续配置未变时将直接复用`);
                    }
                } catch (saveError) { if (Utils.isCancellationError(saveError)) throw saveError;
                    log.warn(`⚠️ 保存角色识别缓存失败: ${saveError.message}`);
                }
            }

            // 2. 基于识别等级计算材料总需求 → 写入 need* 和 totalNeed*
            // 3. 背包 API 扫描已有数量 → 计算缺口并覆盖 need*
            try {
                const configContent = file.readTextSync(Constants.CONFIG_PATH);
                let configArray = JSON.parse(configContent);
                if (!Array.isArray(configArray)) {
                    configArray = [];
                }

                const getCfgValue = (key) => {
                    const idx = configArray.findIndex(item => item && item.hasOwnProperty(key));
                    return idx !== -1 ? (configArray[idx][key] || "").toString().trim() : "";
                };

                // 从 config 读取角色识别结果作为"当前等级"基线（替代原 settings.wikiCurrent*）
                const characterLevel = parseInt(getCfgValue("characterLevel")) || 1;
                const talentLevelsStr = getCfgValue("talentLevels") || "1-1-1";
                const weaponLevelStr = getCfgValue("weaponLevel") || "1级未突破";
                const weaponStar = getCfgValue("weaponStar") || "五星";

                // 解析目标等级（来自用户设置）
                const targetLevel = CultivationMaterialCalculator.parseLevelTarget(settings.bossRequireCounts, 80);
                const targetTalents = CultivationMaterialCalculator.parseTalentTargets(settings.talentBookRequireCounts);
                const hasWeapon = settings.weaponName && settings.weaponName.trim() !== "";
                const targetWeaponLvl = hasWeapon ? CultivationMaterialCalculator.parseLevelTarget(settings.weaponMaterialRequireCounts, 80) : 0;

                // 解析当前等级基线（来自角色识别结果）
                const currentLevel = characterLevel;
                const currentTalents = CultivationMaterialCalculator.parseTalentTargets(talentLevelsStr);
                const currentWeaponLvl = hasWeapon ? CultivationMaterialCalculator.parseLevelTarget(weaponLevelStr, 1) : 0;

                // 计算材料总需求
                const localNeed = CultivationMaterialCalculator.calculateLocalNeed(currentLevel, targetLevel);
                const monsterNeedStar3 = CultivationMaterialCalculator.calculateMonsterNeedStar3(currentLevel, targetLevel, currentTalents, targetTalents);
                const bossNeed = CultivationMaterialCalculator.calculateBossCount(currentLevel, targetLevel);
                const talentBookCounts = CultivationMaterialCalculator.calculateTalentBookCounts(currentTalents, targetTalents);
                const talentBookNeedStr = talentBookCounts.join("-");

                const weapon1Need = hasWeapon ? Math.ceil(Utils.calcWeaponMonsterNeed(currentWeaponLvl, targetWeaponLvl, 1) / 9) : 0;
                const weapon2Need = hasWeapon ? Math.ceil(Utils.calcWeaponMonsterNeed(currentWeaponLvl, targetWeaponLvl, 2) / 9) : 0;

                // 武器秘境材料需求（基于武器星级，从当前武器等级→目标武器等级累加）
                let weaponMatCount = [0, 0, 0, 0];
                if (hasWeapon && weaponStar && weaponStar !== "一星" && weaponStar !== "未知星级" && weaponStar !== "识别异常" && targetWeaponLvl >= 1) {
                    const weaponRules = Constants.weaponMaterialRules[weaponStar];
                    if (weaponRules) {
                        for (const lvl of Constants.charLevels) {
                            if (lvl >= currentWeaponLvl && lvl <= targetWeaponLvl) {
                                const mat = weaponRules[lvl] || [0, 0, 0, 0];
                                weaponMatCount = weaponMatCount.map((v, i) => v + (mat[i] || 0));
                            }
                        }
                    }
                }
                const weaponMaterialNeedStr = weaponMatCount.join("-");

                log.info(`📌 等级配置（基于角色识别）: 角色 ${currentLevel}→${targetLevel} 级, 天赋 ${currentTalents.join("-")}→${targetTalents.join("-")}, 武器 ${hasWeapon ? currentWeaponLvl + '→' + targetWeaponLvl + ' 级' : '无'}, 武器星级 ${weaponStar || '未知'}`);
                log.info(`✅ 计算材料总需求(${currentLevel}→${targetLevel}级): 地方特产=${localNeed}, 敌人魔物(star3)=${monsterNeedStar3}, 首领材料=${bossNeed}, 天赋书=${talentBookNeedStr}`);
                log.info(`✅ 计算武器材料总需求(${currentWeaponLvl}→${targetWeaponLvl}级): 武器1(star3)=${weapon1Need}, 武器2(star3)=${weapon2Need}, 武器秘境材料=${weaponMaterialNeedStr}`);

                // 写入天赋书数量配置
                const talentBookDefaultIndex = configArray.findIndex(item => item.hasOwnProperty("talentBookRequireCounts0"));
                if (talentBookDefaultIndex !== -1) {
                    configArray[talentBookDefaultIndex]["talentBookRequireCounts0"] = talentBookNeedStr;
                } else {
                    configArray.push({ "talentBookRequireCounts0": talentBookNeedStr });
                }

                // 写入武器秘境材料数量配置
                const weaponMaterialDefaultIndex = configArray.findIndex(item => item.hasOwnProperty("weaponMaterialRequireCounts0"));
                if (weaponMaterialDefaultIndex !== -1) {
                    configArray[weaponMaterialDefaultIndex]["weaponMaterialRequireCounts0"] = weaponMaterialNeedStr;
                } else {
                    configArray.push({ "weaponMaterialRequireCounts0": weaponMaterialNeedStr });
                }

                // 武器魔物名称：如果武器名称为空，设置为空
                if (!hasWeapon) {
                    // 武器秘境名称一并清空，避免遗留旧值导致武器材料刷取流程误执行
                    const weaponDomainEmptyIndex = configArray.findIndex(item => item.hasOwnProperty("weaponDomainName"));
                    if (weaponDomainEmptyIndex !== -1) {
                        configArray[weaponDomainEmptyIndex]["weaponDomainName"] = "";
                    } else {
                        configArray.push({ "weaponDomainName": "" });
                    }
                    const weapons1EmptyIndex = configArray.findIndex(item => item.hasOwnProperty("Weapons1 material0"));
                    if (weapons1EmptyIndex !== -1) {
                        configArray[weapons1EmptyIndex]["Weapons1 material0"] = "";
                    } else {
                        configArray.push({ "Weapons1 material0": "" });
                    }
                    const weapons1RawIndex = configArray.findIndex(item => item.hasOwnProperty("Weapons1 materialNameRaw"));
                    if (weapons1RawIndex !== -1) {
                        configArray[weapons1RawIndex]["Weapons1 materialNameRaw"] = "";
                    } else {
                        configArray.push({ "Weapons1 materialNameRaw": "" });
                    }
                    const weapons2EmptyIndex = configArray.findIndex(item => item.hasOwnProperty("Weapons2 material0"));
                    if (weapons2EmptyIndex !== -1) {
                        configArray[weapons2EmptyIndex]["Weapons2 material0"] = "";
                    } else {
                        configArray.push({ "Weapons2 material0": "" });
                    }
                    const weapons2RawIndex = configArray.findIndex(item => item.hasOwnProperty("Weapons2 materialNameRaw"));
                    if (weapons2RawIndex !== -1) {
                        configArray[weapons2RawIndex]["Weapons2 materialNameRaw"] = "";
                    } else {
                        configArray.push({ "Weapons2 materialNameRaw": "" });
                    }
                    log.info(`✅ 已清空武器1/2魔物名称（武器名称为空）`);
                }

                // 写入首领材料数量配置
                const bossMaterialDefaultIndex = configArray.findIndex(item => item.hasOwnProperty("bossRequireCounts0"));
                if (bossMaterialDefaultIndex !== -1) {
                    configArray[bossMaterialDefaultIndex]["bossRequireCounts0"] = bossNeed;
                } else {
                    configArray.push({ "bossRequireCounts0": bossNeed });
                }

                // 写入 need* 和 totalNeed*（总需求，后续背包扫描将 need* 覆盖为缺口）
                const writeNeedAndTotal = (needKey, totalKey, nameKey, value) => {
                    const needIdx = configArray.findIndex(item => item.hasOwnProperty(needKey));
                    const nameIdx = configArray.findIndex(item => item.hasOwnProperty(nameKey));
                    if (needIdx !== -1 && needIdx !== nameIdx) {
                        delete configArray[needIdx][needKey];
                    }
                    if (nameIdx !== -1) {
                        configArray[nameIdx][needKey] = value;
                        configArray[nameIdx][totalKey] = value;
                    } else {
                        configArray.push({ [needKey]: value, [totalKey]: value });
                    }
                };
                writeNeedAndTotal("needLocalAmount", "totalNeedLocalAmount", "LocalSpecialties", localNeed);
                writeNeedAndTotal("needMonsterStar3", "totalNeedMonsterStar3", "Magic material0", monsterNeedStar3);
                writeNeedAndTotal("needamount1 stars3", "totalNeedamount1Stars3", "Weapons1 material0", weapon1Need);
                writeNeedAndTotal("needamount2 stars3", "totalNeedamount2Stars3", "Weapons2 material0", weapon2Need);
                log.info(`✅ 已设置地方特产总需求(${currentLevel}→${targetLevel}级): ${localNeed}`);
                log.info(`✅ 已设置敌人与魔物总需求(${currentLevel}→${targetLevel}级): ${monsterNeedStar3}`);
                log.info(`✅ 已设置武器1材料总需求(${currentWeaponLvl}→${targetWeaponLvl}级): ${weapon1Need}`);
                log.info(`✅ 已设置武器2材料总需求(${currentWeaponLvl}→${targetWeaponLvl}级): ${weapon2Need}`);

                // 保存总需求到配置
                file.writeTextSync(Constants.CONFIG_PATH, JSON.stringify(configArray, null, 2));
                log.info(`✅ 材料总需求已写入配置文件`);

                // === 背包 API 扫描已有材料数量，计算缺口并覆盖 need* ===
                try {
                    const localName = getCfgValue("LocalSpecialties");
                    // talentMobMaterialNameRaw / Weapons1/2 materialNameRaw 为完整"1★,2★,3★"三连；
                    // 背包扫描入参传完整三连（scanWikiBackpackMaterials 内部展开并计算等效3星，
                    // Mapping.json 未命中的新材料直接按三连扫描），首值仅用于共享材料基数 key 与非空判断
                    const magicRaw = getCfgValue("talentMobMaterialNameRaw");
                    const weapons1Raw = getCfgValue("Weapons1 materialNameRaw");
                    const weapons2Raw = getCfgValue("Weapons2 materialNameRaw");
                    const magicName = (magicRaw.split(",")[0] || "").trim();
                    const weapons1Name = (weapons1Raw.split(",")[0] || "").trim();
                    const weapons2Name = (weapons2Raw.split(",")[0] || "").trim();

                    if (localName || magicName || weapons1Name || weapons2Name) {
                        // 已完成任务跳过数量检查：按各类型"记录名"判定是否已完成且培养配置未变
                        const scanCharacterName = getStandardCharacterName(settings.Character) || (settings.Character ? settings.Character.trim() : "未知角色");
                        const cultivationConfig = getCultivationConfigSnapshot();
                        // 任务记录名与采集阶段共用 buildTaskMaterialName（基于"完整三连"原始键），保证任务 key 一致
                        const skipLocal = await TaskManager.shouldSkipQuantityCheck("local", localName, cultivationConfig, scanCharacterName, currentUid);
                        const skipMagic = await TaskManager.shouldSkipQuantityCheck("magic", buildTaskMaterialName("talentMobMaterialNameRaw"), cultivationConfig, scanCharacterName, currentUid);
                        const skipW1 = await TaskManager.shouldSkipQuantityCheck("weapons1", buildTaskMaterialName("Weapons1 materialNameRaw"), cultivationConfig, scanCharacterName, currentUid);
                        const skipW2 = await TaskManager.shouldSkipQuantityCheck("weapons2", buildTaskMaterialName("Weapons2 materialNameRaw"), cultivationConfig, scanCharacterName, currentUid);

                        if (skipLocal) log.info(`✅ [地方特产] 已完成该材料任务，跳过数量检查`);
                        if (skipMagic) log.info(`✅ [敌人与魔物] 已完成该材料任务，跳过数量检查`);
                        if (skipW1) log.info(`✅ [武器材料1] 已完成该材料任务，跳过数量检查`);
                        if (skipW2) log.info(`✅ [武器材料2] 已完成该材料任务，跳过数量检查`);

                        // 仅传入未完成的类型（省略已跳过项），避免对该类型发起无意义的数量扫描
                        // 魔物类材料传完整"1★,2★,3★"三连，由 scanWikiBackpackMaterials 内部展开
                        const scanInput = {};
                        if (!skipLocal && localName) scanInput.local = localName;
                        if (!skipMagic && magicName) scanInput.magic = magicRaw;
                        if (!skipW1 && weapons1Name) scanInput.weapons1 = weapons1Raw;
                        if (!skipW2 && weapons2Name) scanInput.weapons2 = weapons2Raw;

                        const writeGap = (needKey, gap) => {
                            const idx = configArray.findIndex(item => item && item.hasOwnProperty(needKey));
                            if (idx !== -1) {
                                configArray[idx][needKey] = gap;
                            } else {
                                configArray.push({ [needKey]: gap });
                            }
                        };

                        if (Object.keys(scanInput).length === 0) {
                            // 全部类型已完成（或名为空）：无需扫描，缺口直接置 0，后续采集阶段据此跳过
                            writeGap("needLocalAmount", 0);
                            writeGap("needMonsterStar3", 0);
                            writeGap("needamount1 stars3", 0);
                            writeGap("needamount2 stars3", 0);
                            file.writeTextSync(Constants.CONFIG_PATH, JSON.stringify(configArray, null, 2));
                            log.info("📌 4 类采集材料任务均已完成，跳过背包数量扫描");
                        } else {
                            log.info("📌 开始扫描背包已有材料数量...");
                            Overlay.updateStage('角色识别与材料计算', '正在扫描背包已有材料...', 10);

                            const scanResult = await scanWikiBackpackMaterials(scanInput);

                            if (scanResult) {
                                // 缺口 = max(0, 总需求(totalNeed*) - 已有)；总需求在上一步写入且不会被覆盖
                                const getTotalNeed = (totalKey) => {
                                    const idx = configArray.findIndex(item => item && item.hasOwnProperty(totalKey));
                                    return idx !== -1 ? Number(configArray[idx][totalKey]) || 0 : 0;
                                };
                                // 共享材料渐进基数：前面角色对该材料的累计需求（当前角色尚未累计入表），
                                // 多角色共用同种材料时避免背包存量被重复占用导致漏刷
                                const localBase = getSharedBaseline(localName) || 0;
                                const magicBase = getSharedBaseline(magicName) || 0;
                                const w1Base = getSharedBaseline(weapons1Name) || 0;
                                const w2Base = getSharedBaseline(weapons2Name) || 0;
                                // 已完成（跳过扫描）类型强制缺口 0；不可依赖 scanResult.x.count（省略后为 0 会算成 totalNeed）
                                // 缺口 = max(0, 前面角色累计(基数) + 本角色总需求 - 背包已有)
                                const localGap = skipLocal ? 0 : Math.max(0, localBase + getTotalNeed("totalNeedLocalAmount") - scanResult.local.count);
                                const magicGap = skipMagic ? 0 : Math.max(0, magicBase + getTotalNeed("totalNeedMonsterStar3") - scanResult.magic.count);
                                const w1Gap = skipW1 ? 0 : Math.max(0, w1Base + getTotalNeed("totalNeedamount1Stars3") - scanResult.weapons1.count);
                                const w2Gap = skipW2 ? 0 : Math.max(0, w2Base + getTotalNeed("totalNeedamount2Stars3") - scanResult.weapons2.count);

                                writeGap("needLocalAmount", localGap);
                                writeGap("needMonsterStar3", magicGap);
                                writeGap("needamount1 stars3", w1Gap);
                                writeGap("needamount2 stars3", w2Gap);

                                file.writeTextSync(Constants.CONFIG_PATH, JSON.stringify(configArray, null, 2));

                                // 扫描后缺口为 0 的类型写入完成记录，避免后续运行重复扫描
                                const cultivationSnapshot = getCultivationConfigSnapshot();
                                if (!skipLocal && localGap === 0 && localName) {
                                    await TaskManager.addCompletedTask("local", localName, 0, scanCharacterName, currentUid, cultivationSnapshot);
                                    log.info(`✅ [地方特产] 缺口为0，已写入完成记录`);
                                }
                                if (!skipMagic && magicGap === 0 && magicName) {
                                    await TaskManager.addCompletedTask("magic", buildTaskMaterialName("talentMobMaterialNameRaw"), 0, scanCharacterName, currentUid, cultivationSnapshot);
                                    log.info(`✅ [敌人与魔物] 缺口为0，已写入完成记录`);
                                }
                                if (!skipW1 && w1Gap === 0 && weapons1Name) {
                                    await TaskManager.addCompletedTask("weapons1", buildTaskMaterialName("Weapons1 materialNameRaw"), 0, scanCharacterName, currentUid, cultivationSnapshot);
                                    log.info(`✅ [武器材料1] 缺口为0，已写入完成记录`);
                                }
                                if (!skipW2 && w2Gap === 0 && weapons2Name) {
                                    await TaskManager.addCompletedTask("weapons2", buildTaskMaterialName("Weapons2 materialNameRaw"), 0, scanCharacterName, currentUid, cultivationSnapshot);
                                    log.info(`✅ [武器材料2] 缺口为0，已写入完成记录`);
                                }

                                log.info(`✅ 材料缺口已回写:`);
                                log.info(`  地方特产${skipLocal ? '（已完成，跳过）' : `[${scanResult.local.name}] 已有 ${scanResult.local.count}`}，需求缺口 ${localGap}${localGap === 0 ? '（已满足）' : ''}`);
                                log.info(`  敌人与魔物${skipMagic ? '（已完成，跳过）' : `[${scanResult.magic.name}] 已有 ${scanResult.magic.count}`}，需求缺口 ${magicGap}${magicGap === 0 ? '（已满足）' : ''}`);
                                log.info(`  武器材料1${skipW1 ? '（已完成，跳过）' : `[${scanResult.weapons1.name}] 已有 ${scanResult.weapons1.count}`}，需求缺口 ${w1Gap}${w1Gap === 0 ? '（已满足）' : ''}`);
                                log.info(`  武器材料2${skipW2 ? '（已完成，跳过）' : `[${scanResult.weapons2.name}] 已有 ${scanResult.weapons2.count}`}，需求缺口 ${w2Gap}${w2Gap === 0 ? '（已满足）' : ''}`);
                                Overlay.updateStage('角色识别与材料计算', `材料缺口：特产${localGap}/魔物${magicGap}/武1${w1Gap}/武2${w2Gap}`, 11);
                            } else {
                                log.warn("⚠️ 背包扫描返回 null，保留默认全量需求");
                            }
                        }
                    } else {
                        log.info("📌 4 类材料名均为空，跳过背包扫描");
                    }
                } catch (scanError) { if (Utils.isCancellationError(scanError)) throw scanError;
                    log.warn(`⚠️ 背包扫描失败: ${scanError.message}，保留默认全量需求`);
                }
            } catch (e) { if (Utils.isCancellationError(e)) throw e;
                log.warn(`基于识别等级计算材料需求失败: ${e.message}`);
            }

            // 构建当前角色的共享材料判定基数（前面角色累计需求；缺口=基数+本角色需求-背包现有），
            // 供刷取(farmingStages)/采集(materialCollection)阶段使用；重新识别路径会再次执行到此段，覆盖赋值即可
            currentDemandBase = buildCurrentDemandBase();
            char.demandBase = JSON.parse(JSON.stringify(currentDemandBase));

            // 计算该角色的经验书/摩拉总需求，供地脉花管理多角色累加使用
            try {
                const expMora = calculateCurrentCharacterExpAndMoraRequirement();
                char.requiredExp = expMora.requiredExp;
                char.moraRequirement = expMora.totalMoraRequired;
            } catch (e) { if (Utils.isCancellationError(e)) throw e;
                log.warn(`⚠️ 计算角色经验/摩拉需求失败: ${e.message}`);
                char.requiredExp = 0;
                char.moraRequirement = 0;
            }
            return true;
        }

        // ============== 材料刷取逻辑开始 ==============
        
        // UID 已在前置阶段识别，此处复用（不再重复按 ESC 打开派蒙菜单）
        const maskedUid = Utils.maskUid(currentUid);
        log.info(`📌 当前运行账号UID：${maskedUid}`);
        
        // 保存UID到配置文件（保持数组格式）
        try {
            const configContent = file.readTextSync(Constants.CONFIG_PATH);
            let configArray = JSON.parse(configContent);
            if (!Array.isArray(configArray)) {
                configArray = [];
            }
            const uidIndex = configArray.findIndex(item => item.hasOwnProperty("currentUid"));
            if (uidIndex !== -1) {
                configArray[uidIndex] = { "currentUid": currentUid };
            } else {
                configArray.push({ "currentUid": currentUid });
            }
            file.writeTextSync(Constants.CONFIG_PATH, JSON.stringify(configArray, null, 2));
            log.info(`✅ UID已保存到配置文件`);
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            log.warn(`保存UID到配置文件失败: ${e.message}`);
        }
        
        setGameMetrics(1920, 1080, Utils.getScreenDpiScale());

        // 地脉花双倍活动检测（首次树脂识别时检测，后续不再检测，全局仅执行一次）
        if (settings.enableLeyLineDoubleDrop) {
            try {
                log.info("📌 开始检测地脉花双倍活动...");
                 Overlay.updateStage('地脉花', '开始检测地脉花双倍活动...', 15);
                const firstStamina = await Inventory.queryStaminaValue(true);
                if (Inventory.leyLineDoubleDropDetected) {
                    log.info("🎉 检测到地脉花双倍活动，优先执行2次地脉花");
                    Overlay.updateStage('地脉花双倍活动', '刷取地脉花...', 20);
                    const doubleDropType = settings.leyLineDoubleDropType || "经验书";
                    if (doubleDropType === "摩拉") {
                        log.info("双倍活动类型：摩拉（藏金之花）");
                        await runAutoLeyLineOutcropTask(0, 2, firstStamina);
                    } else {
                        log.info("双倍活动类型：经验书（启示之花）");
                        await runAutoLeyLineOutcropTask(2, 0, firstStamina);
                    }
                    log.info("✅ 双倍活动地脉花执行完毕，继续天赋书刷取");
                }
            } catch (doubleDropError) { if (Utils.isCancellationError(doubleDropError)) throw doubleDropError;
                log.error(`地脉花双倍活动检测/执行失败：${doubleDropError.message}`);
            }
        }

        // ========== 多角色培养循环 ==========
        const cultivationChars = buildCultivationCharacters(settings, characterSlots);
        if (cultivationChars.length === 0) {
            throw new Error('未配置角色名称，脚本终止');
        }
        log.info(`📌 本次培养角色列表：${cultivationChars.map(c => `${c.label}【${getStandardCharacterName(c.Character) || c.Character.trim()}】`).join(' → ')}`);

        // 单角色培养管线：应用配置 → Wiki获取 → 角色识别与背包扫描 → 全零检查 → 三阶段材料刷取 → 配置快照
        // 返回 'done'（完成）/ 'skip'（跳过该角色）/ 'fatal'（终止主流程）
        async function runCharacterCultivation(char) {
            try {
                applyCharacterToSettings(settings, char);
                const standardName = getStandardCharacterName(char.Character) || char.Character.trim();
                Overlay.setCharacterName(standardName);
                log.info(`🚀 开始执行【${char.label}】${standardName} 的培养流程`);

                // 按当前角色培养配置重新生成运行配置（队伍/策略等其余设置沿用主页）
                try {
                    await ConfigGenerator.generateFromUserSettings(currentUid);
                } catch (configError) { if (Utils.isCancellationError(configError)) throw configError;
                    log.warn(`自动生成运行配置失败，将继续使用现有配置: ${configError.message}`);
                }

                await runWikiDataFetchFlow(char.Character.trim());

                const recognitionOk = await runCharacterRecognitionOrWikiScan(char);
                if (!recognitionOk) {
                    if (char.isMain) {
                        log.error("❌ 角色识别流程失败，终止主流程");
                        return 'fatal';
                    }
                    log.warn(`⚠️ 【${char.label}】角色识别流程失败，跳过该角色`);
                    return 'skip';
                }

                // ===== 全零检查与设置弹窗逻辑（按角色区分）=====
                // 检查同一UID、同一角色的8个材料需求是否全为零
                const configForZeroCheck = Utils.readJson(Constants.CONFIG_PATH);
                const allZero = TaskManager.checkAllRequirementsZero(configForZeroCheck);

                if (allZero) {
                    const currentCharacterNameForCheck = getStandardCharacterName(settings.Character) || (settings.Character ? settings.Character.trim() : "未知角色");
                    log.info(`📌 角色【${currentCharacterNameForCheck}】的8个材料需求全为零`);

                    // 检查3天例外：同一UID下是否有其他角色在3天内材料需求全为零
                    // 如果有，说明可能是多角色共用材料导致数量误判为零，按原配置继续运行
                    const hasOtherAllZero = TaskManager.hasOtherCharactersAllZeroWithin3Days(currentUid, currentCharacterNameForCheck);

                    if (char.isMain) {
                        // 角色1：保留原有 3天例外 + 设置弹窗 + 重新识别 逻辑
                        if (hasOtherAllZero) {
                            log.info(`📌 检测到同一UID下有其他角色在3天内材料需求全为零，可能共用材料导致误判，按原配置继续运行`);
                        } else {
                            log.info(`📌 未检测到3天内的多角色共用材料情况，弹出设置弹窗供用户修改配置`);
                            Overlay.updateStage('配置确认', '材料需求全为零，等待用户修改配置...', 1);

                            const savedSettings = await showSettingsModal(settings, { showAllZeroHint: true }, currentUid);

                            if (savedSettings) {
                                // 用户修改了配置，重新执行角色识别与材料计算流程
                                log.info(`📌 用户已修改配置，重新执行角色识别与材料计算流程`);
                                // 刷新 inputCharacterName（关键：用户可能修改了角色名）
                                inputCharacterName = settings.Character ? settings.Character.trim() : "";
                                // 同步更新进度遮罩中显示的角色名称
                                const updatedCharacterName = getStandardCharacterName(settings.Character) || (settings.Character ? settings.Character.trim() : "未知角色");
                                Overlay.setCharacterName(updatedCharacterName);
                                // 统一流程：重新拉取 Wiki 数据（仅材料名）+ 角色识别 + 背包扫描
                                Overlay.updateStage('Wiki数据获取', '正在重新获取Wiki材料信息...', 3);
                                await runWikiDataFetchFlow(inputCharacterName);
                                Overlay.updateStage('角色识别与材料计算', '正在重新识别角色材料信息...', 5);
                                const reRecognitionOk = await runCharacterRecognitionOrWikiScan(char);
                                if (!reRecognitionOk) {
                                    log.error("❌ 重新角色识别流程失败，终止主流程");
                                    notification.send("重新角色识别流程失败，请检查配置");
                                    return 'fatal';
                                }
                            } else {
                                // 超时未修改：仅配置单角色时与原版一致直接终止；多角色时跳过角色1继续后续角色
                                log.warn(`⚠️ 设置弹窗超时未修改，结束运行`);
                                notification.send("材料需求全为零且超时未修改配置，结束运行");
                                await genshin.returnMainUi();
                                return cultivationChars.length > 1 ? 'skip' : 'fatal';
                            }
                        }
                    } else if (hasOtherAllZero) {
                        log.info(`📌 【${char.label}】检测到同UID下有其他角色3天内材料需求全为零，可能共用材料导致误判，按原配置继续`);
                    } else {
                        log.info(`📌 【${char.label}】材料需求全为零，跳过该角色`);
                        return 'skip';
                    }
                }

                // ===== 三阶段材料刷取（lib/farmingStages.js，原循环已外移）=====
                // 缩放统一使用系统屏幕 DPI（Utils.getScreenDpiScale），识别与刷取阶段无需区分
                setGameMetrics(1920, 1080, Utils.getScreenDpiScale());
                Overlay.updateStage('天赋书刷取', '准备刷取天赋书...', 13);
                await runTalentBookFarming(currentUid);
                await runWeaponMaterialFarming(currentUid);
                await runBossMaterialFarming(currentUid);

                // 将该角色 7 类材料需求累计入共享需求表，供后续角色（及采集循环）判定基数
                addCharacterDemandToBaseline();
                char.configSnapshot = snapshotCharacterConfig();
                log.info(`✅ 【${char.label}】培养流程执行完成`);
                return 'done';
            } catch (cultivationError) { if (Utils.isCancellationError(cultivationError)) throw cultivationError;
                log.error(`❌ 【${char.label}】培养流程执行失败: ${cultivationError.message}`);
                notification.send(`【${char.label}】培养流程执行失败: ${cultivationError.message}`);
                return char.isMain ? 'fatal' : 'skip';
            }
        }

        const executedChars = [];
        for (let ci = 0; ci < cultivationChars.length; ci++) {
            const char = cultivationChars[ci];
            const n = cultivationChars.length;
            const wStart = Math.round((ci * 50) / n);
            let wEnd = Math.round(((ci + 1) * 50) / n);
            if (wEnd <= wStart) wEnd = wStart + 1;
            Overlay.setCharacterProgressWindow(wStart, wEnd);
            const result = await runCharacterCultivation(char);
            if (result === 'fatal') {
                log.error("❌ 角色培养流程失败，终止脚本");
                await genshin.returnMainUi();
                return;
            }
            if (result === 'done') {
                executedChars.push(char);
            }
        }
        Overlay.clearCharacterProgressWindow();

        Utils.sendBufferedNotifications();
        log.info("✅ 所有角色材料刷取逻辑执行完成");
        Overlay.updateStage('材料刷取完成', '准备进入材料采集阶段...', 51);

        // 返回游戏主界面
        log.info("📌 正在校准并返回游戏主界面...");
        await genshin.returnMainUi();
        await sleep(1500);

        // ============== 执行地脉花管理流程 ==========
        log.info("📌 开始执行地脉花管理流程...");
        Overlay.updateStage('地脉花管理', '准备执行地脉花任务...', 52);
        await runLeyLineManagement(executedChars);
        // 返回游戏主界面
        log.info("📌 正在校准并返回游戏主界面...");
        await genshin.returnMainUi();
        await sleep(1500);
        // ============== 执行圣遗物副本刷取流程 ==========
        if (settings.domainRunMode) {
            // 树脂数量检查：低于20则跳过圣遗物秘境
            Overlay.updateStage('圣遗物副本刷取', '准备刷取圣遗物...', 53);
            const artifactStamina = await Inventory.queryStaminaValue();
            if (artifactStamina < 20) {
                log.info(`⚠️ 原粹树脂不足（当前${artifactStamina}，需≥20），跳过圣遗物秘境`);
            } else {
                log.info("📌 开始执行圣遗物副本刷取流程...");
                await runArtifactDomainFarm();
                // 返回游戏主界面
                log.info("📌 正在校准并返回游戏主界面...");
                await genshin.returnMainUi();
                await sleep(1500);
            }
        }
        
        // ===== 最后一步：按角色执行材料采集 =====
        log.info("📌 开始执行材料采集流程...");
        Overlay.updateStage('材料采集', '准备执行材料采集...', 56);
        const m = executedChars.length;
        for (let mi = 0; mi < m; mi++) {
            const char = executedChars[mi];
            const wStart = Math.round(56 + (mi * (95 - 56)) / m);
            let wEnd = Math.round(56 + ((mi + 1) * (95 - 56)) / m);
            if (wEnd <= wStart) wEnd = wStart + 1;
            Overlay.setCharacterProgressWindow(wStart, wEnd);
            // 恢复当前角色的培养字段（角色名/目标等级/武器配置），保证采集阶段的
            // 完成/进度记录、培养配置快照归属当前角色，而非最后一个角色
            applyCharacterToSettings(settings, char);
            // 恢复该角色的共享材料判定基数，保证采集阶段缺口刷新与识别时口径一致
            currentDemandBase = char.demandBase || {};
            if (!restoreCharacterConfig(char.configSnapshot)) {
                log.error(`❌ 【${char.label}】配置快照恢复失败，跳过该角色的材料采集（避免误采集其他角色的材料）`);
                continue;
            }
            const collectName = getStandardCharacterName(char.Character) || char.Character.trim();
            Overlay.setCharacterName(collectName);
            log.info(`📌 开始【${char.label}】${collectName} 的材料采集...`);
            await runMaterialCollection();
            log.info("📌 正在校准并返回游戏主界面...");
            await genshin.returnMainUi();
        }
        Overlay.clearCharacterProgressWindow();

        // 完成所有任务
        Overlay.updateStage('全部完成！', '执行结束', 100);
        log.info("✅ 所有任务执行完成");
        await sleep(3000);
        
        // 关闭遮罩和清理资源
        Overlay.closeOverlay();
        Overlay.closeUidMask();
        Overlay.disposeKeyHook();
        
    } catch (globalError) { if (Utils.isCancellationError(globalError)) throw globalError;
        log.error(`❌ 整体流程执行失败: ${globalError.message}`);
        notification.send(`整体流程执行失败: ${globalError.message}`);
        
        // 确保在出错时也关闭遮罩
        try {
            Overlay.closeOverlay();
            Overlay.closeUidMask();
            Overlay.disposeKeyHook();
        } catch (e) {}
    }
};

// 使用IIFE包装返回Promise
(async () => {
    // 定义全局唯一标识的锁变量，确保流程只执行一次
    if (typeof __genshinMaterialScriptExecuting === 'undefined') {
        __genshinMaterialScriptExecuting = false;
    }
    
    if (__genshinMaterialScriptExecuting) {
        log.info("⚠️ 脚本正在执行中，跳过重复触发");
        return;
    }
    __genshinMaterialScriptExecuting = true;
    
    // 定义清理函数，确保资源释放
    function cleanupResources() {
        try {
            Overlay.closeOverlay();
        } catch (e) {}
        try {
            Overlay.closeUidMask();
        } catch (e) {}
        try {
            Overlay.disposeKeyHook();
        } catch (e) {}
    }
    
    try {
        await Main();
    } catch (err) {
        // 捕获任何错误（包括手动取消任务）
        if (Utils.isCancellationError(err) || (err.message && err.message.includes("取消自动任务"))) {
            log.info("[脚本终止] 检测到手动取消任务，正在清理资源...");
        } else {
            log.error(`[脚本异常] 执行错误：${err.message}`);
        }
    } finally {
        // 无论正常结束还是异常退出，都确保清理资源
        cleanupResources();
        __genshinMaterialScriptExecuting = false;
    }
})();
