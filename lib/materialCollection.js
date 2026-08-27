// 材料采集模块（地方特产 / 敌人与魔物 / 武器材料 分批采集与背包扫描）

// 材料采集主函数
async function runMaterialCollection() {
    log.info("===== BGI路径追踪脚本开始执行 =====");
    dispatcher.addTimer(new RealtimeTimer("AutoPick"));
    log.info("📌 正在返回游戏主界面并校准...");
    await genshin.returnMainUi();
    setGameMetrics(1920, 1080, Utils.getScreenDpiScale());
    
    // 读取配置
    const config = Utils.readJson(Constants.CONFIG_PATH);
    const cooldownRecord = Utils.readJson(Constants.SCRIPT_COOLDOWN_RECORD, {});
    const isNoGrassGod = settings.isNoGrassGod || false;
    log.info(`📌 草神路线配置：${isNoGrassGod ? "排除有草神路线" : "默认选择有草神路线"}`);
    
    // 从配置读取UID（已在材料刷取流程中识别并保存）
    const currentUid = config["currentUid"] || Constants.DEFAULT_UID;
    const maskedUid = Utils.maskUid(currentUid);
    log.info(`📌 当前运行账号UID：${maskedUid}`);
    
    // 清理所有材料类型的过期冷却记录
    log.info("📌 正在清理过期冷却记录...");
    Collection.cleanExpiredCooldownRecords(cooldownRecord, currentUid);
    
    // 提取配置参数
    const localKeyword = config["LocalSpecialties"] || "";
    if (localKeyword) {
        Overlay.updateStage('地方特产采集', '采集材料：' + localKeyword + ' ❃准备采集中...', 60);
    }
    let allMagicKeywords = Collection.extractAllMagicKeywords(config);
    let allWeapons1Keywords = Collection.extractAllWeapons1Keywords(config);
    let allWeapons2Keywords = Collection.extractAllWeapons2Keywords(config);
    
    log.info(`读取到配置：`);
    log.info(`- 地方特产：关键词[${localKeyword}]`);
    log.info(`- 敌人与魔物：${allMagicKeywords.length}个关键词`);
    log.info(`- 武器1材料：${allWeapons1Keywords.length}个关键词`);
    log.info(`- 武器2材料：${allWeapons2Keywords.length}个关键词`);
    
    // 检查是否有需要执行的材料采集
    let hasAnyMaterialToCollect = false;
    let hasLocalToCollect = false;
    let hasMagicToCollect = false;
    let hasWeapons1ToCollect = false;
    let hasWeapons2ToCollect = false;
    
    // 队伍切换开关
    let hasSwitchedToLocalTeam = false;
    let hasSwitchedToCombatTeam = false;
    
    // 当前角色名称和UID（用于检查已完成任务）
    const currentCharacterName = getStandardCharacterName(settings.Character) || (settings.Character ? settings.Character.trim() : "未知角色");
    
    // 检查地方特产
    if (localKeyword && Number(config["needLocalAmount"]) > 0) {
        // 检查是否已完成地方特产任务
        const localTaskCompleted = await TaskManager.isTaskCompleted("local", localKeyword, config["needLocalAmount"], currentCharacterName, currentUid);
        if (!localTaskCompleted) {
            hasAnyMaterialToCollect = true;
            hasLocalToCollect = true;
        } else {
            log.info(`✅ [地方特产] 已完成该材料任务，将跳过执行`);
        }
    }
    
    // 检查敌人与魔物
    if (allMagicKeywords.length > 0 && Number(config["needMonsterStar3"]) > 0) {
        const magicMaterialName = buildTaskMaterialName("talentMobMaterialNameRaw");
        const magicTaskCompleted = await TaskManager.isTaskCompleted("magic", magicMaterialName, config["needMonsterStar3"], currentCharacterName, currentUid);
        if (!magicTaskCompleted) {
            hasAnyMaterialToCollect = true;
            hasMagicToCollect = true;
        } else {
            log.info(`✅ [敌人与魔物] 已完成该材料任务，将跳过执行`);
        }
    }
    
    // 检查武器1材料
    if (allWeapons1Keywords.length > 0 && Number(config["needamount1 stars3"]) > 0) {
        const weapons1MaterialName = buildTaskMaterialName("Weapons1 materialNameRaw");
        const weapons1TaskCompleted = await TaskManager.isTaskCompleted("weapons1", weapons1MaterialName, config["needamount1 stars3"], currentCharacterName, currentUid);
        if (!weapons1TaskCompleted) {
            hasAnyMaterialToCollect = true;
            hasWeapons1ToCollect = true;
        } else {
            log.info(`✅ [武器1材料] 已完成该材料任务，将跳过执行`);
        }
    }
    
    // 检查武器2材料
    if (allWeapons2Keywords.length > 0 && Number(config["needamount2 stars3"]) > 0) {
        const weapons2MaterialName = buildTaskMaterialName("Weapons2 materialNameRaw");
        const weapons2TaskCompleted = await TaskManager.isTaskCompleted("weapons2", weapons2MaterialName, config["needamount2 stars3"], currentCharacterName, currentUid);
        if (!weapons2TaskCompleted) {
            hasAnyMaterialToCollect = true;
            hasWeapons2ToCollect = true;
        } else {
            log.info(`✅ [武器2材料] 已完成该材料任务，将跳过执行`);
        }
    }
    
    // 只有在有需要执行的材料采集时，才前往指定地点并切换队伍
    if (hasAnyMaterialToCollect) {
        log.info("📌 正在前往指定地点...");
        await genshin.tp(2297.6201171875, -824.5869140625);
    } else {
        log.info("⚠️ 没有需要执行的材料采集，跳过前往指定地点和切换队伍");
    }
    
    try {
        // 1. 地方特产
        if (localKeyword) {
            if (hasLocalToCollect && !hasSwitchedToLocalTeam) {
                log.info("📌 切换到采集队伍...");
                await Utils.switchPartySafe(settings.teamName2);
                hasSwitchedToLocalTeam = true;
            }
            await executeMaterialCollection({
                type: 'local',
                rootFolder: Constants.FOLDER_LOCAL,
                keywords: localKeyword,
                configKey: 'needLocalAmount',
                isExcludeGrassGod: isNoGrassGod,
                materialType: '地方特产',
                currentUid,
                cooldownRecord
            });
            Utils.sendBufferedNotifications();
            await sleep(1000);
        }
        
        // 2. 敌人与魔物
        // 需求已满足（needMonsterStar3<=0）或存在已完成记录时，提前跳过（在重新获取怪物名称之前）
        if (allMagicKeywords.length > 0 && Number(config["needMonsterStar3"]) <= 0) {
            log.info(`✅ [敌人与魔物] 已完成记录或需求已满足，跳过执行`);
        }
        if (hasMagicToCollect && allMagicKeywords.length > 0) {
            // 总是根据天赋怪物材料名称重新获取天赋怪物名称（避免遗留数据）
            const talentMobMaterialNameRaw = config["talentMobMaterialNameRaw"];

            if (talentMobMaterialNameRaw && talentMobMaterialNameRaw.trim() !== "") {
                // talentMobMaterialNameRaw 为 "1★,2★,3★" 三连串，查魔物名只需 1★ 首值
                const firstTalentMobMaterial = talentMobMaterialNameRaw.split(",")[0].trim();
                log.info(`📌 根据天赋怪物材料【${firstTalentMobMaterial}】重新获取天赋怪物名称...`);
                Overlay.updateStage('敌人与魔物', '正在获取天赋怪物名称...', 70);
                const talentMobName = await WikiFetcher.getTalentMobNameFromMaterialSmart(firstTalentMobMaterial);
                if (talentMobName) {
                    // 将天赋怪物名称写入config
                    const configPath = Constants.CONFIG_PATH;
                    let configData = [];
                    try {
                        configData = JSON.parse(file.readTextSync(configPath));
                    } catch (e) { if (Utils.isCancellationError(e)) throw e;
                        configData = [];
                    }
                    const mobConfigIndex = configData.findIndex(item => item.hasOwnProperty("Magic material0"));
                    if (mobConfigIndex !== -1) {
                        configData[mobConfigIndex]["Magic material0"] = talentMobName;
                    } else {
                        configData.push({ "Magic material0": talentMobName });
                    }
                    file.writeTextSync(configPath, JSON.stringify(configData, null, 2));
                    log.info(`✅ 已更新天赋怪物名称到配置: ${talentMobName}`);
                    // 更新当前的config对象
                    config["Magic material0"] = talentMobName;
                    // 更新allMagicKeywords
                    allMagicKeywords = [];
                    const rawMagicKeywords = (talentMobName || "").toString().split(",");
                    for (const keyword of rawMagicKeywords) {
                        const trimmedKeyword = keyword.trim();
                        if (trimmedKeyword.length > 2) {
                            allMagicKeywords.push(trimmedKeyword);
                        }
                    }
                    log.info(`📌 更新后的敌人与魔物关键词: ${allMagicKeywords.join(", ")}`);
                    // 将天赋怪物材料→魔物映射保存到 Mapping.json
                    // talentMobMaterialNameRaw 已是 "1★,2★,3★" 完整三连，整体传入作为 material 字段
                    if (typeof WikiDataSaver !== 'undefined' && talentMobMaterialNameRaw) {
                        try {
                            WikiDataSaver.saveMappingData(talentMobMaterialNameRaw, talentMobName, "common");
                        } catch (e) { if (Utils.isCancellationError(e)) throw e;
                            log.warn(`⚠️ 保存映射到 Mapping.json 失败: ${e.message}`);
                        }
                    }
                }
            }
            
            if (hasMagicToCollect && !hasSwitchedToCombatTeam) {
                log.info("📌 切换到战斗队伍...");
                await Utils.switchPartySafe(settings.teamName);
                hasSwitchedToCombatTeam = true;
            }
            await executeMaterialCollection({
                type: 'magic',
                rootFolder: Constants.FOLDER_MAGIC,
                keywords: allMagicKeywords,
                configKey: 'needMonsterStar3',
                materialType: '敌人与魔物',
                currentUid,
                cooldownRecord
            });
            await sleep(1000);
        }
        
        // 3. 武器1材料
        // 需求已满足（needamount1 stars3<=0）或存在已完成记录时，提前跳过（在重新获取武器魔物名称之前）
        if (allWeapons1Keywords.length > 0 && Number(config["needamount1 stars3"]) <= 0) {
            log.info(`✅ [武器1材料] 已完成记录或需求已满足，跳过执行`);
        }
        if (hasWeapons1ToCollect && allWeapons1Keywords.length > 0) {
            // 总是根据武器1材料名称重新获取武器魔物名称（避免遗留数据）
            const weapons1MaterialNameRaw = config["Weapons1 materialNameRaw"];

            if (weapons1MaterialNameRaw && weapons1MaterialNameRaw.trim() !== "") {
                // Weapons1 materialNameRaw 为 "1★,2★,3★" 三连串，查魔物名只需 1★ 首值
                const firstWeapons1Material = weapons1MaterialNameRaw.split(",")[0].trim();
                log.info(`📌 根据武器1材料【${firstWeapons1Material}】重新获取武器魔物名称...`);
                Overlay.updateStage('武器1材料', '正在获取武器魔物名称...', 80);
                const weapons1MobName = await WikiFetcher.getWeaponMobNameFromMaterialSmart(firstWeapons1Material);
                if (weapons1MobName) {
                    // 将武器1魔物名称写入config
                    const configPath = Constants.CONFIG_PATH;
                    let configData = [];
                    try {
                        configData = JSON.parse(file.readTextSync(configPath));
                    } catch (e) { if (Utils.isCancellationError(e)) throw e;
                        configData = [];
                    }
                    const weapons1ConfigIndex = configData.findIndex(item => item.hasOwnProperty("Weapons1 material0"));
                    if (weapons1ConfigIndex !== -1) {
                        configData[weapons1ConfigIndex]["Weapons1 material0"] = weapons1MobName;
                    } else {
                        configData.push({ "Weapons1 material0": weapons1MobName });
                    }
                    file.writeTextSync(configPath, JSON.stringify(configData, null, 2));
                    log.info(`✅ 已更新武器1魔物名称到配置: ${weapons1MobName}`);
                    // 更新当前的config对象
                    config["Weapons1 material0"] = weapons1MobName;
                    // 更新allWeapons1Keywords
                    allWeapons1Keywords = [];
                    const rawWeapons1Keywords = (weapons1MobName || "").toString().split(",");
                    for (const keyword of rawWeapons1Keywords) {
                        const trimmedKeyword = keyword.trim();
                        if (trimmedKeyword.length > 2) {
                            allWeapons1Keywords.push(trimmedKeyword);
                        }
                    }
                    log.info(`📌 更新后的武器1材料关键词: ${allWeapons1Keywords.join(", ")}`);
                    // 将武器1材料→魔物映射保存到 Mapping.json
                    // weapons1MaterialNameRaw 已是 "1★,2★,3★" 完整三连，整体传入作为 material 字段
                    if (typeof WikiDataSaver !== 'undefined' && weapons1MaterialNameRaw) {
                        try {
                            WikiDataSaver.saveMappingData(weapons1MaterialNameRaw, weapons1MobName, "common");
                        } catch (e) { if (Utils.isCancellationError(e)) throw e;
                            log.warn(`⚠️ 保存映射到 Mapping.json 失败: ${e.message}`);
                        }
                    }
                }
            }
            
            if (hasWeapons1ToCollect && !hasSwitchedToCombatTeam) {
                log.info("📌 切换到战斗队伍...");
                await Utils.switchPartySafe(settings.teamName);
                hasSwitchedToCombatTeam = true;
            }
            await executeMaterialCollection({
                type: 'weapons1',
                rootFolder: Constants.FOLDER_WEAPONS1,
                keywords: allWeapons1Keywords,
                configKey: 'needamount1 stars3',
                materialType: '武器1材料',
                currentUid,
                cooldownRecord
            });
            await sleep(1000);
        }
        
        // 4. 武器2材料
        // 需求已满足（needamount2 stars3<=0）或存在已完成记录时，提前跳过（在重新获取武器魔物名称之前）
        if (allWeapons2Keywords.length > 0 && Number(config["needamount2 stars3"]) <= 0) {
            log.info(`✅ [武器2材料] 已完成记录或需求已满足，跳过执行`);
        }
        if (hasWeapons2ToCollect && allWeapons2Keywords.length > 0) {
            // 总是根据武器2材料名称重新获取武器魔物名称（避免遗留数据）
            const weapons2MaterialNameRaw = config["Weapons2 materialNameRaw"];

            if (weapons2MaterialNameRaw && weapons2MaterialNameRaw.trim() !== "") {
                // Weapons2 materialNameRaw 为 "1★,2★,3★" 三连串，查魔物名只需 1★ 首值
                const firstWeapons2Material = weapons2MaterialNameRaw.split(",")[0].trim();
                log.info(`📌 根据武器2材料【${firstWeapons2Material}】重新获取武器魔物名称...`);
                Overlay.updateStage('武器2材料', '正在获取武器魔物名称...', 95);
                const weapons2MobName = await WikiFetcher.getWeaponMobNameFromMaterialSmart(firstWeapons2Material);
                if (weapons2MobName) {
                    // 将武器2魔物名称写入config
                    const configPath = Constants.CONFIG_PATH;
                    let configData = [];
                    try {
                        configData = JSON.parse(file.readTextSync(configPath));
                    } catch (e) { if (Utils.isCancellationError(e)) throw e;
                        configData = [];
                    }
                    const weapons2ConfigIndex = configData.findIndex(item => item.hasOwnProperty("Weapons2 material0"));
                    if (weapons2ConfigIndex !== -1) {
                        configData[weapons2ConfigIndex]["Weapons2 material0"] = weapons2MobName;
                    } else {
                        configData.push({ "Weapons2 material0": weapons2MobName });
                    }
                    file.writeTextSync(configPath, JSON.stringify(configData, null, 2));
                    log.info(`✅ 已更新武器2魔物名称到配置: ${weapons2MobName}`);
                    // 更新当前的config对象
                    config["Weapons2 material0"] = weapons2MobName;
                    // 更新allWeapons2Keywords
                    allWeapons2Keywords = [];
                    const rawWeapons2Keywords = (weapons2MobName || "").toString().split(",");
                    for (const keyword of rawWeapons2Keywords) {
                        const trimmedKeyword = keyword.trim();
                        if (trimmedKeyword.length > 2) {
                            allWeapons2Keywords.push(trimmedKeyword);
                        }
                    }
                    log.info(`📌 更新后的武器2材料关键词: ${allWeapons2Keywords.join(", ")}`);
                    // 将武器2材料→魔物映射保存到 Mapping.json
                    // weapons2MaterialNameRaw 已是 "1★,2★,3★" 完整三连，整体传入作为 material 字段
                    if (typeof WikiDataSaver !== 'undefined' && weapons2MaterialNameRaw) {
                        try {
                            WikiDataSaver.saveMappingData(weapons2MaterialNameRaw, weapons2MobName, "Elite");
                        } catch (e) { if (Utils.isCancellationError(e)) throw e;
                            log.warn(`⚠️ 保存映射到 Mapping.json 失败: ${e.message}`);
                        }
                    }
                }
            }
            
            if (hasWeapons2ToCollect && !hasSwitchedToCombatTeam) {
                log.info("📌 切换到战斗队伍...");
                await Utils.switchPartySafe(settings.teamName);
                hasSwitchedToCombatTeam = true;
            }
            await executeMaterialCollection({
                type: 'weapons2',
                rootFolder: Constants.FOLDER_WEAPONS2,
                keywords: allWeapons2Keywords,
                configKey: 'needamount2 stars3',
                materialType: '武器2材料',
                currentUid,
                cooldownRecord
            });
            Utils.sendBufferedNotifications();
        }
        
    } catch (globalErr) { if (Utils.isCancellationError(globalErr)) throw globalErr;
        if (globalErr.message.includes("A task was canceled") || globalErr.message.includes("取消自动任务")) {
            log.error(`[脚本终止] 检测到手动取消任务，脚本正常终止`);
        } else {
            log.error(`[脚本异常] 全局执行错误：${globalErr.message}`);
        }
    }
    
    log.info("===== BGI路径追踪脚本执行结束 =====");
}

// 统一的材料采集流程控制器
async function executeMaterialCollection(options) {
    const {
        type,
        rootFolder,
        keywords,
        configKey,
        isExcludeGrassGod = false,
        materialType,
        currentUid,
        cooldownRecord
    } = options;
    
    log.info(`\n========== 开始处理${materialType} ==========`);
    
    // 读取当前需求量（统一从config读取，Wiki模式下已在开头设置默认值）
    const config = Utils.readJson(Constants.CONFIG_PATH);
    const currentAmount = Number(config[configKey]) || 0;
    const progressCharacterName = getStandardCharacterName(settings.Character) || (settings.Character ? settings.Character.trim() : "未知角色");
    const progressMaterialName = Array.isArray(keywords) ? keywords.join(', ') : (keywords || materialType);
    if (typeof ProgressLogger !== "undefined") {
        ProgressLogger.upsert({
            uid: currentUid,
            characterName: progressCharacterName,
            materialType: type,
            materialName: progressMaterialName,
            targetAmount: currentAmount,
            remainingAmount: currentAmount,
            status: currentAmount <= 0 ? "completed" : "running"
        });
    }
    
    if (currentAmount <= 0) {
        log.info(`[${materialType}] 需求数量为0，跳过执行`);
        Utils.addNotification(`[${materialType}] 需求数量为0，跳过执行`);
        
        // 需求为零时也保存到完成任务记录
        const currentCharacterName = getStandardCharacterName(settings.Character) || (settings.Character ? settings.Character.trim() : "未知角色");
        const taskInfo = mapTaskInfo(type, keywords);
        if (taskInfo && taskInfo.taskMaterialName) {
            await TaskManager.addCompletedTask(taskInfo.taskMaterialType, taskInfo.taskMaterialName, 0, currentCharacterName, currentUid, getCultivationConfigSnapshot());
        }
        return false;
    }
    
    if (!keywords || (Array.isArray(keywords) && keywords.length === 0)) {
        log.info(`[${materialType}] 未配置关键词，跳过执行`);
        Utils.addNotification(`[${materialType}] 未配置关键词，跳过执行`);
        return false;
    }
    
    // 获取冷却时间
    let cooldown;
    switch (type) {
        case "local": cooldown = Constants.COOLDOWN_LOCAL; break;
        case "magic": cooldown = Constants.COOLDOWN_MAGIC; break;
        case "weapons1": cooldown = Constants.COOLDOWN_WEAPONS1; break;
        case "weapons2": cooldown = Constants.COOLDOWN_WEAPONS2; break;
        default: cooldown = 0;
    }
    
    // 扫描脚本文件
    const keywordList = Array.isArray(keywords) ? keywords : [keywords];
    let allScriptFiles = [];
    
    for (const keyword of keywordList) {
        let targetDirs = [];
        const basePath = "pathing";
        
        if (rootFolder === Constants.FOLDER_LOCAL) {
            const localRootDir = `${Constants.ASSETS_BASE}/${rootFolder}`.replace(/\\/g, "/");
            const relativeLocalRoot = localRootDir.startsWith(basePath + "/") ? localRootDir.substring(basePath.length + 1) : localRootDir;
            try {
                const regionDirs = Array.from(pathingScript.ReadPathSync(relativeLocalRoot) || []);
                for (const regionDir of regionDirs) {
                    const regionRelative = regionDir.replace(/\\/g, "/").replace(/^\/+/, "");
                    if (pathingScript.IsFolder(regionRelative)) {
                        const regionName = regionRelative.split(/[\\/]/).pop();
                        const targetRelative = `${relativeLocalRoot}/${regionName}/${keyword}`.replace(/\\/g, "/");
                        if (pathingScript.IsFolder(targetRelative)) {
                            const targetDir = `${localRootDir}/${regionName}/${keyword}`.replace(/\\/g, "/");
                            targetDirs.push(targetDir);
                            log.info(`✅ 检测到有效路径：${targetDir}`);
                        }
                    }
                }
            } catch (e) { if (Utils.isCancellationError(e)) throw e;
                log.error(`读取目录失败：${e.message}`);
            }
        } else {
            const aliasList = Collection.getAllAliasesByStandardName(keyword);
            for (const alias of aliasList) {
                const aliasRelative = `${rootFolder}/${alias}`.replace(/\\/g, "/").replace(/^\/+/, "");
                if (pathingScript.IsFolder(aliasRelative)) {
                    const aliasDir = `${Constants.ASSETS_BASE}/${rootFolder}/${alias}`.replace(/\\/g, "/");
                    targetDirs.push(aliasDir);
                    log.info(`✅ 匹配到别名目录：${aliasDir}（关键词：${keyword}，匹配别名：${alias}）`);
                }
            }
        }
        
        const uniqueTargetDirs = [...new Set(targetDirs)];
        for (const targetDir of uniqueTargetDirs) {
            const dirFiles = Collection.recursiveScanScriptFiles(targetDir, isExcludeGrassGod);
            allScriptFiles = allScriptFiles.concat(dirFiles);
        }
    }
    
    if (allScriptFiles.length === 0) {
        log.warn(`⚠️ 未找到${materialType}的JSON路径脚本`);
        notification.send(`⚠️ 未找到${materialType}的JSON路径脚本`);
        log.warn("{0}", Constants.ERROR_NO_SCRIPTS);
        log.warn("{0}", Constants.ERROR_NO_PATHING);
        await sleep(15000);
        return false;
    }
    
    log.info(`✅ 共扫描到 ${allScriptFiles.length} 个路径脚本文件`);
    
    // 过滤掉异常路径
    const normalScripts = Collection.filterAbnormalPaths(allScriptFiles);
    
    // 过滤掉在冷却中的脚本
    const availableScripts = Collection.filterScriptsByCooldown(normalScripts, cooldown, cooldownRecord, currentUid);
    
    if (availableScripts.length === 0) {
        log.info(`[${materialType}] 所有脚本都在冷却中，跳过执行`);
        return false;
    }
    
    // 根据材料类型执行不同的控制逻辑
    let isCompleted = false;
    
    if (type === 'local') {
        isCompleted = await executeLocalBatch(availableScripts, isExcludeGrassGod, materialType, currentUid, cooldown, cooldownRecord, type);
    } else {
        isCompleted = await executeMonsterBatch(availableScripts, configKey, materialType, currentUid, cooldown, cooldownRecord, type);
    }
    
    // 采集完成后如果需求变为零，保存到完成任务记录
    if (isCompleted) {
        const newConfig = Utils.readJson(Constants.CONFIG_PATH);
        const newAmount = Number(newConfig[configKey]) || 0;
        if (newAmount <= 0) {
            const currentCharacterName = getStandardCharacterName(settings.Character) || (settings.Character ? settings.Character.trim() : "未知角色");
            const taskInfo = mapTaskInfo(type, keywords);
            if (taskInfo && taskInfo.taskMaterialName) {
                await TaskManager.addCompletedTask(taskInfo.taskMaterialType, taskInfo.taskMaterialName, 0, currentCharacterName, currentUid, getCultivationConfigSnapshot());
            }
        }
    }
    
    return isCompleted;
}

// 批次采集后：计算本次获取数并将其与最新缺口写入 farming_progress.json（经 ProgressLogger）
// materialType 如 '地方特产'/'敌人与魔物'/'武器1材料'/'武器2材料'；beforeGap/afterGap 为批次前后缺口
function recordMaterialRunProgress(materialType, uid, beforeGap, afterGap) {
    try {
        const typeMap = {
            '地方特产': 'local',
            '敌人与魔物': 'magic',
            '武器1材料': 'weapons1',
            '武器2材料': 'weapons2'
        };
        const type = typeMap[materialType];
        const mapping = WIKI_MATERIAL_TYPE_MAP[materialType];
        if (!type || !mapping) {
            return;
        }
        const config = Utils.readJson(Constants.CONFIG_PATH);
        const newGap = Math.max(0, Number(afterGap) || 0);
        const beforeGapNum = Number(beforeGap) || 0;
        const obtainedThisRun = Math.max(0, beforeGapNum - newGap);
        const totalNeed = Number(config[mapping.totalKey]) || 0;
        const characterName = getStandardCharacterName(settings.Character) || (settings.Character ? settings.Character.trim() : "未知角色");
        const materialName = ((config[mapping.nameKey] || "").toString().split(",")[0] || "").trim();

        if (typeof ProgressLogger !== "undefined") {
            ProgressLogger.upsert({
                uid,
                characterName,
                materialType: type,
                materialName,
                targetAmount: totalNeed,
                remainingAmount: newGap,
                obtainedThisRun,
                status: newGap <= 0 ? "completed" : "running"
            });
        }
        // 通知本轮采集获取量（缺口差值 = 获取数）
        if (obtainedThisRun > 0 && materialName) {
            Utils.addNotification(`✅ [${materialType}] ${materialName} 本轮采集 ${obtainedThisRun} 个（缺口 ${beforeGapNum} → ${newGap}）`);
        }
        log.info(`📊 [${materialType}] 本次获取 ${obtainedThisRun} 个（缺口 ${beforeGapNum} → ${newGap}），已写入刷取进度`);
    } catch (e) { if (Utils.isCancellationError(e)) throw e;
        log.warn(`⚠️ 记录[${materialType}]刷取进度失败: ${e.message}`);
    }
}

// 地方特产分批执行逻辑
async function executeLocalBatch(allScripts, isExcludeGrassGod, materialType, currentUid, cooldown, cooldownRecord, type) {
    let remainingScripts = [...allScripts];
    let isCompleted = false;
    
    const startIndex = Collection.getStartIndex(remainingScripts, currentUid, cooldownRecord, type);
    remainingScripts = remainingScripts.slice(startIndex);
    
    if (startIndex > 0) {
        log.info(`📌 [${materialType}] 断点续传，从第${startIndex + 1}个脚本开始执行`);
    }
    
    while (remainingScripts.length > 0) {
        const config = Utils.readJson(Constants.CONFIG_PATH);
        const currentNeed = Number(config["needLocalAmount"]) || 0;
        
        log.info(`\n📊 [${materialType}] 当前需求量：${currentNeed}，剩余脚本数：${remainingScripts.length}`);
        
        if (currentNeed <= 0) {
            log.info(`✅ [${materialType}] 需求已满足，停止执行`);
            Utils.addNotification(`✅ [${materialType}] 需求已满足，停止执行`);
            isCompleted = true;
            break;
        }
        
        const scriptsToExecute = Collection.filterLocalScriptsByCount(remainingScripts, currentNeed, !isExcludeGrassGod);
        
        if (scriptsToExecute.length === 0) {
            log.info(`⚠️ [${materialType}] 无需要执行的脚本`);
            Utils.addNotification(`⚠️ [${materialType}] 无需要执行的脚本`);
            break;
        }
        
        const totalCanGet = scriptsToExecute.reduce((sum, s) => sum + (s.count || Constants.DEFAULT_LOCAL_COUNT), 0);
        log.info(`🔢 [${materialType}] 本次计划执行${scriptsToExecute.length}个脚本，预计获取${totalCanGet}个特产`);
        
        const result = await Collection.executeScripts(scriptsToExecute, 0, 0, currentUid, cooldown, cooldownRecord,
            function(script, current, total) {
                const keyword = Utils.readJson(Constants.CONFIG_PATH)["LocalSpecialties"] || "";
                Overlay.updateStatus(
                    '采集进度[' + current + '/' + total + ']  预计获取' + totalCanGet + '个特产  采集中...',
                    '采集材料： ' + keyword + '   ▶   ' + script.name
                );
            }
        );
        
        // #7：仅移除成功完成的路径，失败路径保留在 remainingScripts 供下一轮重试
        const executedPaths = new Set(result.successfulPaths || scriptsToExecute.slice(0, result.executedCount).map(s => s.path));
        remainingScripts = remainingScripts.filter(s => !executedPaths.has(s.path));
        
        // 每批固定：仅对当前材料类型（地方特产）做背包 API 扫描，刷新数量缺口
        const beforeGap = currentNeed;
        await scanAndUpdateWikiMaterials(materialType);
        
        const newConfig = Utils.readJson(Constants.CONFIG_PATH);
        const newNeed = Number(newConfig["needLocalAmount"]) || 0;
        // 计算本次获取数并写入刷取进度
        recordMaterialRunProgress(materialType, currentUid, beforeGap, newNeed);
        
        if (newNeed <= 0) {
            log.info(`✅ [${materialType}] 需求已满足，停止执行`);
            Utils.addNotification(`✅ [${materialType}] 需求已满足，停止执行`);
            isCompleted = true;
            break;
        }
        
        if (remainingScripts.length === 0) {
            log.info(`✅ [${materialType}] 所有路径已执行完毕`);
            Utils.addNotification(`✅ [${materialType}] 所有路径已执行完毕`);
            isCompleted = true;
        }
        
        await sleep(1000);
    }
    
    return isCompleted;
}

// 敌人与魔物/武器材料分批执行逻辑（阈值控制）
async function executeMonsterBatch(allScripts, configKey, materialType, currentUid, cooldown, cooldownRecord, type) {
    let remainingScripts = [...allScripts];
    let isCompleted = false;

    const startIndex = Collection.getStartIndex(remainingScripts, currentUid, cooldownRecord, type);
    remainingScripts = remainingScripts.slice(startIndex);

    if (startIndex > 0) {
        log.info(`📌 [${materialType}] 断点续传，从第${startIndex + 1}个脚本开始执行`);
    }

    Overlay.updateStage(materialType, '准备收集...', {
        '地方特产': 56,
        '敌人与魔物': 60,
        '武器1材料': 65,
        '武器2材料': 75
    }[materialType] || 60);

    while (remainingScripts.length > 0) {
        // 读取当前需求量（统一从config读取，Wiki模式下已在开头设置默认值）
        const config = Utils.readJson(Constants.CONFIG_PATH);
        const currentAmount = Number(config[configKey]) || 0;
        
        log.info(`\n📊 [${materialType}] 当前材料需求量：${currentAmount}，剩余脚本数：${remainingScripts.length}`);
        
        if (currentAmount <= 0) {
            log.info(`✅ [${materialType}] 材料需求已满足，停止执行`);
            Utils.addNotification(`✅ [${materialType}] 材料需求已满足，停止执行`);
            isCompleted = true;
            break;
        }
        
        let batchSize = 0;
        
        if (currentAmount <= Constants.THRESHOLD_LOW) {
            batchSize = Constants.PATH_COUNT_LOW;
            log.info(`🔢 [${materialType}] 材料数量<=${Constants.THRESHOLD_LOW}，执行${Constants.PATH_COUNT_LOW}个路径`);
        } else if (currentAmount <= Constants.THRESHOLD_HIGH) {
            batchSize = Constants.PATH_COUNT_HIGH;
            log.info(`🔢 [${materialType}] 材料数量<=${Constants.THRESHOLD_HIGH}且>${Constants.THRESHOLD_LOW}，执行${Constants.PATH_COUNT_HIGH}个路径`);
        } else {
            batchSize = Constants.PATH_COUNT_HIGH;
            log.info(`🔢 [${materialType}] 材料数量>${Constants.THRESHOLD_HIGH}，执行${Constants.PATH_COUNT_HIGH}个路径`);
        }
        
        // 本次批次执行前的缺口
        const beforeGap = currentAmount;
        
        const result = await Collection.executeScripts(remainingScripts, 0, batchSize, currentUid, cooldown, cooldownRecord,
            function(script, current, total) {
                Overlay.updateStatus(
                    '当前进度[' + current + '/' + total + '] 当前材料需求量' + currentAmount + '个  收集中...',
                    materialType + '   ▶   ' + script.name
                );
            }
        );
        // #7：仅移除成功完成的路径，失败路径保留在 remainingScripts 供下一轮重试
        if (Array.isArray(result.successfulPaths)) {
            const executedPaths = new Set(result.successfulPaths);
            remainingScripts = remainingScripts.filter(s => !executedPaths.has(s.path));
        } else {
            remainingScripts = result.remainingScripts;
        }
        
        // 每批固定：仅对当前材料类型做背包 API 扫描，刷新数量缺口
        await scanAndUpdateWikiMaterials(materialType);
        const newConfig = Utils.readJson(Constants.CONFIG_PATH);
        const newAmount = Number(newConfig[configKey]) || 0;
        // 计算本次获取数并写入刷取进度
        recordMaterialRunProgress(materialType, currentUid, beforeGap, newAmount);
        log.info(`📊 [${materialType}] 背包扫描后材料需求量：${newAmount}`);

        if (newAmount <= 0) {
            log.info(`✅ [${materialType}] 材料需求已满足，停止执行剩余路径`);
            Utils.addNotification(`✅ [${materialType}] 材料需求已满足，停止执行剩余路径`);
            isCompleted = true;
            break;
        }
        
        if (remainingScripts.length === 0) {
            log.info(`✅ [${materialType}] 所有路径已执行完毕`);
            Utils.addNotification(`✅ [${materialType}] 所有路径已执行完毕`);
            isCompleted = true;
            break;
        }
        
        await sleep(1000);
    }
    
    return isCompleted;
}

// Wiki 模式下扫描背包并更新指定类型材料缺口（替代角色识别）
// 材料类型 → 配置键映射
const WIKI_MATERIAL_TYPE_MAP = {
    '地方特产':   { nameKey: 'LocalSpecialties',            needKey: 'needLocalAmount',      totalKey: 'totalNeedLocalAmount',      specField: 'local'   },
    '敌人与魔物': { nameKey: 'talentMobMaterialNameRaw',     needKey: 'needMonsterStar3',    totalKey: 'totalNeedMonsterStar3',      specField: 'magic'   },
    '武器1材料':   { nameKey: 'Weapons1 materialNameRaw',    needKey: 'needamount1 stars3',   totalKey: 'totalNeedamount1Stars3',    specField: 'weapons1' },
    '武器2材料':   { nameKey: 'Weapons2 materialNameRaw',   needKey: 'needamount2 stars3',   totalKey: 'totalNeedamount2Stars3',    specField: 'weapons2' }
};

// 按采集类型映射任务记录类型与材料名（U6：抽取两处重复的 if/else if 映射逻辑）
// 返回 { taskMaterialType, taskMaterialName }，无法映射时返回 null
function mapTaskInfo(type, keywords) {
    if (type === 'local') return { taskMaterialType: 'local', taskMaterialName: keywords };
    if (type === 'magic') return { taskMaterialType: 'magic', taskMaterialName: buildTaskMaterialName("talentMobMaterialNameRaw") };
    if (type === 'weapons1') return { taskMaterialType: 'weapons1', taskMaterialName: buildTaskMaterialName("Weapons1 materialNameRaw") };
    if (type === 'weapons2') return { taskMaterialType: 'weapons2', taskMaterialName: buildTaskMaterialName("Weapons2 materialNameRaw") };
    return null;
}

// 按材料类型取当前角色的共享需求基数（key 口径与 multiCharacter.js 构建端一致）
function getCollectionDemandBase(materialType) {
    try {
        const config = Utils.readJson(Constants.CONFIG_PATH);
        let key = "";
        if (materialType === '地方特产') {
            key = (config["LocalSpecialties"] || "").toString().trim();
        } else if (materialType === '敌人与魔物') {
            key = ((config["talentMobMaterialNameRaw"] || "").split(",")[0] || "").trim();
        } else if (materialType === '武器1材料') {
            key = ((config["Weapons1 materialNameRaw"] || "").split(",")[0] || "").trim();
        } else if (materialType === '武器2材料') {
            key = ((config["Weapons2 materialNameRaw"] || "").split(",")[0] || "").trim();
        }
        if (!key) return 0;
        const base = currentDemandBase[key];
        return (typeof base === 'number' && !isNaN(base)) ? base : 0;
    } catch (e) { if (Utils.isCancellationError(e)) throw e;
        return 0;
    }
}

async function scanAndUpdateWikiMaterials(materialType) {
    const mapping = WIKI_MATERIAL_TYPE_MAP[materialType];
    if (!mapping) {
        log.warn(`⚠️ Wiki 模式: 未知材料类型【${materialType}】，跳过背包扫描`);
        return null;
    }

    try {
        const configArray = JSON.parse(file.readTextSync(Constants.CONFIG_PATH));
        const getCfgValue = (key) => {
            const idx = configArray.findIndex(item => item && item.hasOwnProperty(key));
            return idx !== -1 ? (configArray[idx][key] || "").toString().trim() : "";
        };

        const materialNameRaw = getCfgValue(mapping.nameKey);
        // raw 字段为 "1★,2★,3★" 完整三连；首值用于日志与非空判断
        const materialName = (materialNameRaw.split(",")[0] || "").trim();

        if (!materialName) {
            log.info(`📌 Wiki 模式: ${materialType} 材料名为空，跳过背包扫描`);
            return null;
        }

        log.info(`📌 Wiki 模式: 开始扫描背包 ${materialType}[${materialName}] 的数量...`);
        Overlay.updateStage(materialType, `正在扫描背包 ${materialType}...`, {
            '地方特产': 56,
            '敌人与魔物': 60,
            '武器1材料': 65,
            '武器2材料': 75
        }[materialType] || 0);

        // 只扫描当前材料类型（其余字段留空，scanWikiBackpackMaterials 会跳过空字段）
        // 魔物类材料传完整"1★,2★,3★"三连（内部展开计算等效3星）；地方特产为单名传首值
        const scanSpec = {};
        scanSpec[mapping.specField] = (mapping.specField === 'local') ? materialName : materialNameRaw;
        const scanResult = await scanWikiBackpackMaterials(scanSpec);

        if (!scanResult) {
            log.warn(`⚠️ Wiki 模式背包扫描返回 null，保留原需求量`);
            return null;
        }

        // 获取扫描结果中对应材料的数量
        const scannedItem = scanResult[mapping.specField];
        const haveCount = scannedItem ? scannedItem.count : 0;

        // 读取总需求量（totalNeed* 在 Wiki 模式初始化时保存，不会被缺口计算覆盖）
        const getTotalNeed = (totalKey, fallbackNeedKey) => {
            const totalIdx = configArray.findIndex(item => item && item.hasOwnProperty(totalKey));
            if (totalIdx !== -1) return Number(configArray[totalIdx][totalKey]) || 0;
            // 回退：如果 totalNeed* 不存在，尝试从 need* 读取（适用于初始扫描前）
            const needIdx = configArray.findIndex(item => item && item.hasOwnProperty(fallbackNeedKey));
            return needIdx !== -1 ? Number(configArray[needIdx][fallbackNeedKey]) || 0 : 0;
        };
        const totalNeed = getTotalNeed(mapping.totalKey, mapping.needKey);
        // 共享材料判定基数：前面角色对该材料的累计需求（多角色共用同种材料时避免误判满足）
        const demandBase = getCollectionDemandBase(materialType);

        // 计算新的缺口 = max(0, 基数 + 总需求 - 背包已有)
        const gap = Math.max(0, demandBase + totalNeed - haveCount);

        // 写入新的缺口到 need* 键
        const writeGap = (needKey, gapValue) => {
            const idx = configArray.findIndex(item => item && item.hasOwnProperty(needKey));
            if (idx !== -1) {
                configArray[idx][needKey] = gapValue;
            } else {
                configArray.push({ [needKey]: gapValue });
            }
        };
        writeGap(mapping.needKey, gap);

        file.writeTextSync(Constants.CONFIG_PATH, JSON.stringify(configArray, null, 2));

        log.info(`✅ Wiki 模式 ${materialType} 材料缺口已更新:`);
        log.info(`  ${materialType}[${materialName}] 已有 ${haveCount}/${totalNeed}，剩余缺口 ${gap}${gap === 0 ? '（已满足）' : ''}`);

        return scanResult;
    } catch (e) { if (Utils.isCancellationError(e)) throw e;
        log.warn(`⚠️ Wiki 模式背包扫描更新失败: ${e.message}`);
        return null;
    }
}