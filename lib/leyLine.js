// 地脉花管理流程（多角色累加：executedChars 为 Main 传入的已执行培养角色数组，
// 元素含 Character/label/requiredExp/moraRequirement 字段；参数缺省按"无角色需求"处理）
async function runLeyLineManagement(executedChars) {
    try {
        log.info("===== 地脉花管理流程开始执行 =====");
        setGameMetrics(1920, 1080, Utils.getScreenDpiScale());
        const minStamina = 20;

        const chars = Array.isArray(executedChars) ? executedChars : [];

        const leyLineConfig = Utils.readJson(Constants.CONFIG_PATH);
        const leyLineUid = leyLineConfig["currentUid"] || Constants.DEFAULT_UID;

        // 逐角色判定经验书/摩拉地脉花完成记录（角色名一律取 executedChars 内的 Character 字段）
        const charStates = chars.map(ch => {
            const characterName = getStandardCharacterName(ch.Character) || (ch.Character ? ch.Character.trim() : "未知角色");
            return {
                name: characterName,
                requiredExp: Number(ch.requiredExp) || 0,
                moraRequirement: Number(ch.moraRequirement) || 0,
                expRecordExists: TaskManager.hasCompletedTaskRecord("exp", "经验书地脉花", characterName, leyLineUid),
                moraRecordExists: TaskManager.hasCompletedTaskRecord("mora", "摩拉地脉花", characterName, leyLineUid)
            };
        });

        // 若所有角色（或无角色）exp 与 mora 记录均存在 → 跳过整个流程
        if (charStates.every(s => s.expRecordExists && s.moraRecordExists)) {
            log.info("✅ 经验书和摩拉地脉花均已有完成记录，跳过整个流程");
            Utils.addNotification("✅ 经验书和摩拉地脉花均已有完成记录，跳过整个流程");
            return;
        }

        // 检查体力值
        const stamina = await Inventory.queryStaminaValue();
        if (stamina < minStamina) {
            log.warn(`体力不足！当前体力：${stamina}，需要：${minStamina}`);
            log.info("体力不足，跳过地脉花流程");
            notification.send("体力不足，跳过地脉花流程");
            return;
        }

        log.info(`体力充足：${stamina}，开始地脉花`);

        // 需求累加：仅统计无对应完成记录角色的需求
        let totalRequiredExp = 0;
        let totalMoraRequired = 0;
        for (const s of charStates) {
            const expNeed = s.expRecordExists ? 0 : s.requiredExp;
            const moraNeed = s.moraRecordExists ? 0 : s.moraRequirement;
            totalRequiredExp += expNeed;
            totalMoraRequired += moraNeed;
            log.info(`📊 角色需求[${s.name}]: 经验 ${s.requiredExp}（${s.expRecordExists ? '已有记录' : '计入 ' + expNeed}），摩拉 ${s.moraRequirement}（${s.moraRecordExists ? '已有记录' : '计入 ' + moraNeed}）`);
        }
        log.info(`📊 Σ需求合计: 经验 ${totalRequiredExp}，摩拉 ${totalMoraRequired}`);

        // 获取世界等级（摩拉/经验书次数计算需要）
        const worldLevel = await getWorldLevelForLeyLine();

        let expRuns = 0;
        let moraRuns = 0;
        // 刷取前经验书总经验快照（用于计算本轮获取量并通知）
        let expBeforeTotal = 0;

        // 经验书缺口：Σ需求 - 背包经验书总经验（识别一次）
        if (totalRequiredExp <= 0) {
            log.info(`无需经验书，跳过经验书地脉花任务`);
        } else {
            const expBookData = await getExperienceBookDataForLeyLine();
            const totalBookExperience = expBookData.totalBookExperience;
            expBeforeTotal = totalBookExperience;
            const expShortage = Math.max(0, totalRequiredExp - totalBookExperience);
            log.info(`经验缺口计算: Σ需求${totalRequiredExp} / 库存${totalBookExperience} / 缺口${expShortage}`);
            if (expShortage > 0) {
                const resinRequirements = resinCalculation.calculateExpBookRequirements(expShortage, worldLevel);
                expRuns = resinRequirements.runs.totalChallenges;
                log.info(`经验缺口: ${expShortage}, 经验书地脉花次数: ${expRuns}`);
            } else {
                log.info(`经验书充足，无需执行经验书地脉花任务`);
                Utils.addNotification(`经验书充足，无需执行经验书地脉花任务`);
            }
        }

        // 摩拉缺口：Σ需求 - 当前摩拉（从 config 读 moraAmount）
        if (totalMoraRequired <= 0) {
            log.info(`无需摩拉，跳过摩拉地脉花任务`);
        } else {
            const currentMora = Number(leyLineConfig["moraAmount"]) || 0;
            const moraShortage = Math.max(0, totalMoraRequired - currentMora);
            log.info(`摩拉缺口计算: Σ需求${totalMoraRequired} / 库存${currentMora} / 缺口${moraShortage}`);
            if (moraShortage > 0) {
                const moraLeyLineResult = resinCalculation.calculateMoraLeyLineRuns(moraShortage, worldLevel);
                moraRuns = moraLeyLineResult.totalRuns;
                log.info(`摩拉地脉花次数: ${moraRuns}, 每次摩拉掉落: ${moraLeyLineResult.moraPerRun}`);
            } else {
                log.info(`摩拉充足，无需执行摩拉地脉花任务`);
            }
        }

        // 完成记录写入：
        // 1) 无记录且自身需求<=0 的角色直接写记录；
        // 2) 总缺口为0（expRuns<=0 / moraRuns<=0）时对所有无记录角色补写记录（避免下次运行重复计算）
        for (const s of charStates) {
            if (!s.expRecordExists && (s.requiredExp <= 0 || expRuns <= 0)) {
                log.info(`[${s.name}] 经验书地脉花需求为零，保存到完成任务记录`);
                await TaskManager.addCompletedTask("exp", "经验书地脉花", 0, s.name, leyLineUid);
                s.expRecordExists = true;
            }
            if (!s.moraRecordExists && (s.moraRequirement <= 0 || moraRuns <= 0)) {
                log.info(`[${s.name}] 摩拉地脉花需求为零，保存到完成任务记录`);
                await TaskManager.addCompletedTask("mora", "摩拉地脉花", 0, s.name, leyLineUid);
                s.moraRecordExists = true;
            }
        }

        // 执行地脉花任务
        if (expRuns > 0 || moraRuns > 0) {
            await runAutoLeyLineOutcropTask(expRuns, moraRuns, stamina);

            // 经验书地脉花：执行后复查背包经验书总经验，差值 = 本轮获取量并通知
            if (expRuns > 0) {
                try {
                    const afterExpData = await getExperienceBookDataForLeyLine();
                    const gainedExp = Math.max(0, afterExpData.totalBookExperience - expBeforeTotal);
                    if (gainedExp > 0) {
                        // 按大经验书（2万经验）近似换算，便于用户直观理解
                        const expBookCount = Math.floor(gainedExp / 20000);
                        Utils.addNotification(`✅ [经验书地脉花] 本轮获取经验 ${gainedExp}（约 ${expBookCount} 本大经验书，刷取前 ${expBeforeTotal} → 刷取后 ${afterExpData.totalBookExperience}）`);
                    } else {
                        log.info(`经验书地脉花执行后未检测到经验增长（差值 ${gainedExp}）`);
                    }
                } catch (e) { if (Utils.isCancellationError(e)) throw e;
                    log.warn(`经验书地脉花复查失败：${e.message}`);
                }
            }
        } else {
            log.info("经验书和摩拉都已充足，无需执行地脉花任务");
            notification.send("经验书和摩拉都已充足，无需执行地脉花任务");
        }

        await genshin.returnMainUi();
        log.info("✅ 地脉花管理流程执行完成");

    } catch (error) { if (Utils.isCancellationError(error)) throw error;
        log.error(`地脉花管理流程执行失败: ${error.message}`);
        log.error(`错误堆栈: ${error.stack}`);
        notification.send(`地脉花管理流程执行失败: ${error.message}`);

        try {
            await genshin.returnMainUi();
        } catch (uiError) { if (Utils.isCancellationError(uiError)) throw uiError;
            log.warn(`返回主界面失败: ${uiError.message}`);
        }
    }

    log.info("===== 地脉花管理流程执行结束 =====");
}

// 计算当前角色的经验书/摩拉总需求（多角色地脉累加用；读当前 config 与 settings）
function calculateCurrentCharacterExpAndMoraRequirement() {
    const validated = readAndValidateSettingsForLeyLine();
    const requiredExp = expCalculator.calculateExpRequired(validated.characterLevel, 0, validated.targetRoleLevel);
    const bookRequirements = requiredExp > 0 ? expCalculator.convertExpToBooks(requiredExp) : { purple: 0, blue: 0, green: 0 };
    const moraConfig = {
        characterLevel: validated.characterLevel,
        characterBreak: validated.characterBreak,
        targetRoleLevel: validated.targetRoleLevel,
        targetBreakLevel: validated.targetBreakLevel,
        talentLevels: validated.talentLevels,
        targetTalentLevels: validated.targetTalentLevels,
        weaponStar: validated.weaponStar,
        weaponLevel: validated.weaponLevel,
        weaponBreakLevel: validated.weaponBreakLevel,
        targetWeaponLevel: validated.targetWeaponLevel,
        targetWeaponBreakLevel: validated.targetWeaponBreakLevel,
        bookRequirements: bookRequirements,
        currentMora: validated.moraAmount
    };
    const moraResult = moraCalculation.calculateTotalMoraRequirement(moraConfig);
    return { requiredExp: requiredExp, totalMoraRequired: moraResult.totalMoraRequired || 0 };
}

// 读取并验证配置（地脉花管理专用）
function readAndValidateSettingsForLeyLine() {
    const bossRequireCounts = settings.bossRequireCounts;

    const levelMapping = {
        "20级": { level: 40, break: 40 },
        "40级": { level: 50, break: 50 },
        "50级": { level: 60, break: 60 },
        "60级": { level: 70, break: 70 },
        "70级": { level: 80, break: 80 },
        "80级": { level: 90, break: 90 }
    };

    const targetLevelInfo = levelMapping[bossRequireCounts];
    if (!targetLevelInfo) {
        throw new Error("非法输入或未输入目标角色等级，请选择有效的等级");
    }
    const targetRoleLevel = targetLevelInfo.level;
    const targetBreakLevel = targetLevelInfo.break;

    const weaponLevelMapping = {
        "20级": { level: 20, break: 20 },
        "40级": { level: 40, break: 40 },
        "50级": { level: 50, break: 50 },
        "60级": { level: 60, break: 60 },
        "70级": { level: 70, break: 70 },
        "80级": { level: 80, break: 80 }
    };
    const weaponRequireCounts = settings.weaponMaterialRequireCounts;
    const targetWeaponInfo = weaponLevelMapping[weaponRequireCounts] || { level: 80, break: 5 };
    const targetWeaponLevel = targetWeaponInfo.level;
    const targetWeaponBreakLevel = targetWeaponInfo.break;

    let characterLevel = 0;
    let characterBreak = 0;
    let talentLevels = [1, 1, 1];
    let weaponStar = "四星";
    let weaponLevel = 1;
    let weaponBreakLevel = 0;
    let moraAmount = 0;

    try {
        const configContent = file.readTextSync(Constants.CONFIG_PATH);
        const configArray = JSON.parse(configContent);

        const levelConfig = configArray.find(item => item.characterLevel !== undefined);
        if (levelConfig) {
            characterLevel = Number(levelConfig.characterLevel);
        }

        const breakConfig = configArray.find(item => item.characterBreak !== undefined);
        if (breakConfig) {
            const breakStr = breakConfig.characterBreak;
            const match = breakStr.match(/(\d+)级/);
            if (match) {
                const breakLevel = parseInt(match[1]);
                characterBreak = breakStr.includes("已突破") ? 90 : breakLevel;
            }
        }

        const talentConfig = configArray.find(item => item.talentLevels !== undefined);
        if (talentConfig) {
            const talents = talentConfig.talentLevels.split('-').map(Number);
            talentLevels = talents;
        }

        const weaponStarConfig = configArray.find(item => item.weaponStar !== undefined);
        if (weaponStarConfig) {
            weaponStar = weaponStarConfig.weaponStar;
        }

        const weaponLevelConfig = configArray.find(item => item.weaponLevel !== undefined);
        if (weaponLevelConfig) {
            const levelStr = weaponLevelConfig.weaponLevel;
            const match = levelStr.match(/(\d+)级/);
            if (match) {
                weaponLevel = parseInt(match[1]);
                weaponBreakLevel = levelStr.includes("已突破") ? 90 : weaponLevel;
            }
        }

        const moraConfig = configArray.find(item => item.moraAmount !== undefined);
        if (moraConfig) {
            moraAmount = Number(moraConfig.moraAmount);
        }
    } catch (error) { if (Utils.isCancellationError(error)) throw error;
        log.error(`读取config.json失败: ${error.message}`);
        throw new Error("读取config.json失败");
    }

    if (isNaN(characterLevel) || characterLevel <= 0 || characterLevel > 90) {
        throw new Error("config.json中的characterLevel配置无效，请输入1-90之间的有效数字");
    }

    const talentRequireCounts = settings.talentBookRequireCounts;
    const targetTalentLevels = talentRequireCounts ? talentRequireCounts.split('-').map(Number) : [10, 10, 10];
    
    return { 
        targetRoleLevel, 
        targetBreakLevel,
        characterLevel, 
        characterBreak,
        talentLevels,
        targetTalentLevels,
        weaponStar,
        weaponLevel,
        weaponBreakLevel,
        targetWeaponLevel,
        targetWeaponBreakLevel,
        moraAmount
    };
}

// 获取经验书数据（地脉花管理专用）
async function getExperienceBookDataForLeyLine() {
    try {
        const expBookInfo = await ImageRecognition.IdentifyExperienceBook();
        if (!expBookInfo) {
            return { totalBookExperience: 0 };
        }
        const bookData = FileUtils.getExpBookData(expBookInfo, true);
        if (bookData && bookData.length > 0) {
            const totalItem = bookData.find(item => item.bookName === '总计');
            return { totalBookExperience: totalItem ? totalItem.totalExp : 0 };
        }
        return { totalBookExperience: 0 };
    } catch (error) { if (Utils.isCancellationError(error)) throw error;
        log.warn(`识别经验书失败: ${error.message}`);
        return { totalBookExperience: 0 };
    }
}

// 获取世界等级（地脉花管理专用）
async function getWorldLevelForLeyLine() {
    try {
        const worldLevel = await ImageRecognition.WorldLevelRecognition();
        if (!worldLevel) {
            log.warn("世界等级识别失败，使用默认值0");
            return 0;
        }
        return worldLevel;
    } catch (error) { if (Utils.isCancellationError(error)) throw error;
        log.error(`获取世界等级失败: ${error.message}`);
        log.warn("使用默认世界等级0");
        return 0;
    }
}

// 执行地脉花任务
async function runAutoLeyLineOutcropTask(expRuns, moraRuns, stamina) {
    const minStamina = 20;
    const result = {
        expCompleted: expRuns <= 0,
        moraCompleted: moraRuns <= 0
    };

    try {
        let remainingMoraRuns = moraRuns;
        while (remainingMoraRuns > 0) {
            log.info(`开始执行藏金之花，剩余次数: ${remainingMoraRuns}`);

            // M5：摩拉流程每次迭代前重新检查体力，避免双倍活动消耗后使用过期 stamina
            const currentMoraStamina = await Inventory.queryStaminaValue();
            if (currentMoraStamina < minStamina) {
                log.warn(`体力值${currentMoraStamina}低于${minStamina}，跳过摩拉地脉花`);
                break;
            }

            const resinSupportedCount = Math.floor(currentMoraStamina / 40) + (currentMoraStamina % 40 >= 20 ? 1 : 0);
            const actualCount = Math.min(remainingMoraRuns, resinSupportedCount);
            if (actualCount <= 0) {
                log.warn("当前树脂不足以支持任何摩拉地脉花次数，结束摩拉流程");
                break;
            }

            log.info(`当前树脂: ${currentMoraStamina}, 树脂支持次数: ${resinSupportedCount}, 实际执行次数: ${actualCount}`);
            notification.send(`当前树脂: ${currentMoraStamina}, 树脂支持次数: ${resinSupportedCount}, 实际执行次数: ${actualCount}`);
            Overlay.updateStatus('共进行（' + actualCount + '轮）正在刷取摩拉');

            let taskParam = new AutoLeyLineOutcropParam();
            taskParam.Count = actualCount;
            taskParam.Country = settings.adventurePath || "蒙德";
            taskParam.LeyLineOutcropType = "藏金之花";
            taskParam.Team = settings.teamName || "";
            taskParam.IsResinExhaustionMode = false;
            taskParam.UseAdventurerHandbook = false;
            taskParam.IsGoToSynthesizer = false;
            taskParam.UseFragileResin = false;
            taskParam.UseTransientResin = false;
            taskParam.IsNotification = false;
            taskParam.FightConfig.StrategyName = settings.strategyName || "";
            await dispatcher.RunAutoLeyLineOutcropTask(taskParam);
            remainingMoraRuns -= actualCount;
            log.info(`藏金之花完成，剩余次数: ${remainingMoraRuns}`);
        }
        result.moraCompleted = remainingMoraRuns <= 0;

        let remainingExpRuns = expRuns;
        while (remainingExpRuns > 0) {
            log.info(`开始执行启示之花，剩余次数: ${remainingExpRuns}`);

            // 经验书流程开始前重新检查体力，确保摩拉流程消耗后仍可继续。
            const currentStamina = await Inventory.queryStaminaValue();
            if (currentStamina < minStamina) {
                log.warn(`体力值${currentStamina}低于${minStamina}，跳过经验书地脉花`);
                break;
            }

            const resinSupportedCount = Math.floor(currentStamina / 40) + (currentStamina % 40 >= 20 ? 1 : 0);
            const actualCount = Math.min(remainingExpRuns, resinSupportedCount);
            if (actualCount <= 0) {
                log.warn("当前树脂不足以支持任何经验书地脉花次数，结束经验书流程");
                break;
            }

            log.info(`当前树脂: ${currentStamina}, 树脂支持次数: ${resinSupportedCount}, 实际执行次数: ${actualCount}`);
            notification.send(`当前树脂: ${currentStamina}, 树脂支持次数: ${resinSupportedCount}, 实际执行次数: ${actualCount}`);
            Overlay.updateStatus('共进行（' + actualCount + '轮）正在刷取经验书');
            let taskParam = new AutoLeyLineOutcropParam();
            taskParam.Count = actualCount;
            taskParam.Country = settings.adventurePath || "蒙德";
            taskParam.LeyLineOutcropType = "启示之花";
            taskParam.Team = settings.teamName || "";
            taskParam.IsResinExhaustionMode = false;
            taskParam.UseAdventurerHandbook = false;
            taskParam.IsGoToSynthesizer = false;
            taskParam.UseFragileResin = false;
            taskParam.UseTransientResin = false;
            taskParam.IsNotification = false;
            taskParam.FightConfig.StrategyName = settings.strategyName || "";
            await dispatcher.RunAutoLeyLineOutcropTask(taskParam);
            remainingExpRuns -= actualCount;
            log.info(`启示之花完成，剩余次数: ${remainingExpRuns}`);
        }
        result.expCompleted = remainingExpRuns <= 0;

        log.info("自动地脉花完成");
        notification.send("自动地脉花完成");
        return result;
    } catch (error) { if (Utils.isCancellationError(error)) throw error;
        log.error(`执行地脉花任务失败：${error.message}`);
        if (error.message !== "树脂耗尽，任务结束") {
            throw error;
        }
        return result;
    }
}

