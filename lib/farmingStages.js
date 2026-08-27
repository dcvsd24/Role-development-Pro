// 材料刷取阶段模块（自 main.js 外移，逻辑/阈值/文案均原样保留）
// 包含三个刷取阶段：天赋书刷取（runTalentBookFarming）、武器材料刷取（runWeaponMaterialFarming）、
// 首领材料刷取（runBossMaterialFarming，含"根据Boss材料重新获取Boss名称并写入 config"整段逻辑）。
// currentUid 原为 Main 闭包变量，外移后改为函数参数传入；
// settings/getConfigValue/getStandardCharacterName/Overlay/TaskManager/Farming/WikiFetcher/Utils/notification/log/file/Constants 均为全局可用。

// 天赋书刷取（原 main.js 天赋书刷取循环整体外移）
async function runTalentBookFarming(currentUid) {
    for (let i = 0; i < 1; i++) {
        const talentBookCandidates = [
            "自由",
            "抗争",
            "诗文",
            "繁荣",
            "勤劳",
            "黄金",
            "浮世",
            "风雅",
            "天光",
            "净言",
            "巧思",
            "笃行",
            "公平",
            "正义",
            "秩序",
            "角逐",
            "焚燔",
            "纷争",
            "月光",
            "乐园",
            "浪迹"
        ];
        const talentBookNameFromConfig = getConfigValue("talentDomainName");
        if (!talentBookNameFromConfig || talentBookNameFromConfig.trim() === "") {
            log.info(`天赋书配置为空，跳过执行`);
            continue;
        }
        const talentBookResult = Utils.fuzzyMatch(talentBookNameFromConfig, talentBookCandidates);
        const talentBookName = talentBookResult ? talentBookResult.match : talentBookNameFromConfig.trim();
        if (!talentBookResult) {
            log.warn(`天赋书"${talentBookNameFromConfig}"模糊匹配失败，未找到匹配项，直接使用当前值: ${talentBookName}`);
        }
        if (talentBookName) {
            Overlay.updateStage('天赋书刷取', '刷取材料：' + talentBookName+  ' ❃获取中...', 24);
        }
        const currentCharacterName = getStandardCharacterName(settings.Character) || (settings.Character ? settings.Character.trim() : "未知角色");
        if (talentBookName && talentBookName !== "无") {
            try {
                const talentBookConfigKey = `talentBookRequireCounts${i}`;
                const talentBookCountsStr = getConfigValue(talentBookConfigKey);
                let bookRequireCounts = Utils.parseAndValidateCounts(talentBookCountsStr, 3);
                log.info(`天赋书${i + 1}方案解析成功: ${bookRequireCounts.join(', ')}`);

                const isCompleted = await TaskManager.isTaskCompleted("talent", talentBookName, bookRequireCounts, currentCharacterName, currentUid);
                if (isCompleted) {
                    log.info(`天赋书${talentBookName} 已刷取至目标数量，跳过执行`);
                    Utils.addNotification(`天赋书${talentBookName} 已刷取至目标数量，跳过执行`);
                } else {
                    // 共享材料判定基数：前面角色对该天赋书的累计需求（多角色共用同种天赋书时避免误判满足）
                    const talentBaseline = currentDemandBase[getConfigValue("talentDomainName")] || [0, 0, 0];
                    await Farming.getTalentBook(talentBookName, bookRequireCounts, currentCharacterName, currentUid, talentBaseline);
                }
            } catch (error) { if (Utils.isCancellationError(error)) throw error;
                notification.send(`天赋书${talentBookName}刷取失败，错误信息: ${error.message}`);
            }
        } else {
            log.info(`没有选择刷取天赋书${i + 1}，跳过执行`);
        }
    }
}

// 武器材料刷取（原 main.js 武器材料刷取循环整体外移）
async function runWeaponMaterialFarming(currentUid) {
    // 武器材料刷取逻辑
    Overlay.updateStage('武器材料刷取', '准备刷取武器材料...', 28);
    for (let i = 0; i < 1; i++) {
        const weaponDomainCandidates = [
            "高塔孤王",
            "凛风奔狼",
            "狮牙斗士",
            "孤云寒林",
            "雾海云间",
            "漆黑陨铁",
            "远海夷地",
            "鸣神御灵",
            "今昔剧话",
            "谧林涓露",
            "绿洲花园",
            "烈日威权",
            "悠古弦音",
            "纯圣露滴",
            "无垢之海",
            "贡祭炽心",
            "谵妄圣主",
            "神合秘烟",
            "奇巧秘器",
            "长夜燧火",
            "终北遗嗣"
        ];
        const weaponDomainNameFromConfig = getConfigValue("weaponDomainName");
        if (!weaponDomainNameFromConfig || weaponDomainNameFromConfig.trim() === "") {
            log.info(`武器材料配置为空，跳过执行`);
            continue;
        }
        const weaponResult = Utils.fuzzyMatch(weaponDomainNameFromConfig, weaponDomainCandidates);
        const weaponName = weaponResult ? weaponResult.match : weaponDomainNameFromConfig.trim();
        if (!weaponResult) {
            log.warn(`武器材料"${weaponDomainNameFromConfig}"模糊匹配失败，未找到匹配项，直接使用当前值: ${weaponName}`);
        }
        if (weaponName) {
            Overlay.updateStage('武器材料刷取', '刷取材料：' + weaponName+  '  ❃获取中...', 33);
        }
        const currentCharacterName = getStandardCharacterName(settings.Character) || (settings.Character ? settings.Character.trim() : "未知角色");
        if (weaponName && weaponName !== "无") {
            try {
                const weaponConfigKey = `weaponMaterialRequireCounts${i}`;
                const weaponCountsStr = getConfigValue(weaponConfigKey);
                let weaponRequireCounts = Utils.parseAndValidateCounts(weaponCountsStr, 4);
                log.info(`武器材料${i + 1}方案解析成功: ${weaponRequireCounts.join(', ')}`);

                const isCompleted = await TaskManager.isTaskCompleted("weapon", weaponName, weaponRequireCounts, currentCharacterName, currentUid);
                if (isCompleted) {
                    log.info(`武器材料${weaponName} 已刷取至目标数量，跳过执行`);
                    Utils.addNotification(`武器材料${weaponName} 已刷取至目标数量，跳过执行`);
                } else {
                    // 共享材料判定基数：前面角色对该武器秘境材料的累计需求（多角色共用同种武器材料时避免误判满足）
                    const weaponBaseline = currentDemandBase[getConfigValue("weaponDomainName")] || [0, 0, 0, 0];
                    await Farming.getWeaponMaterial(weaponName, weaponRequireCounts, currentCharacterName, currentUid, weaponBaseline);
                }
            } catch (error) { if (Utils.isCancellationError(error)) throw error;
                notification.send(`武器材料${weaponName}刷取失败，错误信息: ${error.message}`);
            }
        } else {
            log.info(`没有选择刷取武器材料${i + 1}，跳过执行`);
        }
    }
}

// 首领材料刷取（原 main.js 首领材料刷取循环整体外移）
async function runBossMaterialFarming(currentUid) {
    // 首领材料刷取逻辑
    Overlay.updateStage('首领材料刷取', '准备挑战首领...', 35);

    for (let i = 0; i < 1; i++) {
        // 总是根据Boss材料名称重新获取Boss名称（避免遗留数据）
        const bossMaterialNameRaw = getConfigValue("bossMaterialNameRaw");

        if (bossMaterialNameRaw && bossMaterialNameRaw.trim() !== "") {
            log.info(`📌 根据Boss材料【${bossMaterialNameRaw}】重新获取Boss名称...`);
            Overlay.updateStage('首领材料刷取', '正在获取Boss名称...', 40);
            const bossName = await WikiFetcher.getBossNameFromMaterialSmart(bossMaterialNameRaw);
            if (bossName) {
                // 将Boss名称写入config
                const configPath = Constants.CONFIG_PATH;
                let configData = [];
                try {
                    configData = JSON.parse(file.readTextSync(configPath));
                } catch (e) { if (Utils.isCancellationError(e)) throw e;
                    configData = [];
                }
                const bossConfigIndex = configData.findIndex(item => item.hasOwnProperty("bossMaterialName"));
                if (bossConfigIndex !== -1) {
                    configData[bossConfigIndex]["bossMaterialName"] = bossName;
                } else {
                    configData.push({ "bossMaterialName": bossName });
                }
                file.writeTextSync(configPath, JSON.stringify(configData, null, 2));
                log.info(`✅ 已更新 Boss 名称到配置: ${bossName}`);
            }
        }

        // 获取Boss名称（用于后续匹配）
        let bossMaterialNameFromConfig = getConfigValue("bossMaterialName");

        const bossMaterialCandidates = [
            "蕴光月守宫",
            "爆炎树",
            "半永恒统辖矩阵",
            "掣电树",
            "纯水精灵",
            "翠翎恐蕈",
            "深罪浸礼者",
            "深邃摹结株",
            "风蚀沙虫",
            "「冰风组曲」歌裴莉娅",
            "「冰风组曲」科培琉司",
            "古岩龙蜥",
            "恒常机关阵列",
            "急冻树",
            "金焰绒翼龙暴君",
            "雷音权现",
            "灵觉隐修的迷者",
            "魔像督军",
            "秘源机兵·统御械",
            "秘源机兵·构型械",
            "魔偶剑鬼",
            "千年珍珠骏麟",
            "熔岩辉龙像",
            "贪食匿叶龙山王",
            "铁甲熔火帝皇",
            "无相之草",
            "无相之火",
            "无相之雷",
            "无相之水",
            "无相之岩",
            "水形幻人",
            "实验性场力发生装置",
            "遗迹巨蛇",
            "隐山猊兽",
            "兆载永劫龙兽",
            "重拳出击鸭",
            "蕴光月幻蝶",
            "霜夜巡天灵主",
            "超重型陆巡舰·机动战垒",
            "深黯魇语之主",
            "守望者・堕天"
        ];
        if (!bossMaterialNameFromConfig || bossMaterialNameFromConfig.trim() === "") {
            log.info(`首领材料配置为空，跳过执行`);
            continue;
        }
        const bossResult = Utils.fuzzyMatch(bossMaterialNameFromConfig, bossMaterialCandidates);
        const bossName = bossResult ? bossResult.match : bossMaterialNameFromConfig.trim();
        if (!bossResult) {
            log.warn(`首领材料"${bossMaterialNameFromConfig}"模糊匹配失败，未找到匹配项，直接使用当前值: ${bossName}`);
        }
        if (bossName) {
            Overlay.updateStage('首领材料刷取', '刷取材料：' + bossName + ' ❃获取中...', 50);
        }
        const currentCharacterName = getStandardCharacterName(settings.Character) || (settings.Character ? settings.Character.trim() : "未知角色");
        if (bossName && bossName !== "无") {
            try {
                const bossConfigKey = `bossRequireCounts${i}`;
                const bossRequireCounts = getConfigValue(bossConfigKey);

                const isCompleted = await TaskManager.isTaskCompleted("boss", bossName, bossRequireCounts, currentCharacterName, currentUid);
                if (isCompleted) {
                    log.info(`首领材料${bossName} 已刷取至目标数量，跳过执行`);
                    Utils.addNotification(`首领材料${bossName} 已刷取至目标数量，跳过执行`);
                } else {
                    // 共享材料判定基数：前面角色对该首领材料的累计需求（多角色共用同种首领材料时避免误判满足）
                    const bossBaseline = currentDemandBase[getConfigValue("bossMaterialNameRaw")] || 0;
                    await Farming.getBossMaterial(bossName, bossRequireCounts, currentCharacterName, currentUid, bossBaseline);
                }
            } catch (error) { if (Utils.isCancellationError(error)) throw error;
                notification.send(`首领材料${bossName}刷取失败，错误信息: ${error.message}`);
            }
        } else {
            log.info(`没有选择挑战首领${i + 1}，跳过执行`);
        }
    }
}
