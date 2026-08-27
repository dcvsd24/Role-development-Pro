// 材料刷取模块
var Farming = {
    talentEquivalent: function(counts) {
        return 0.12 * Number(counts[0] || 0) + 0.36 * Number(counts[1] || 0) + Number(counts[2] || 0);
    },

    weaponEquivalent: function(counts) {
        return 0.12 * Number(counts[0] || 0) + 0.36 * Number(counts[1] || 0) + Number(counts[2] || 0) + 3 * Number(counts[3] || 0);
    },

    recordProgress: function(materialType, materialName, targetAmount, remainingAmount, characterName, uid) {
        if (typeof ProgressLogger === "undefined") return;
        ProgressLogger.upsert({
            uid,
            characterName,
            materialType,
            materialName,
            targetAmount,
            remainingAmount,
            status: remainingAmount <= 0 ? "completed" : "running"
        });
    },

    getTalentBook: async function(materialName, bookRequireCounts, characterName, uid, baselineCounts) {
        // 共享材料判定基数：前面角色对同种天赋书的累计需求（[绿,蓝,紫]），未传入时按零处理
        baselineCounts = baselineCounts || [0, 0, 0];
        // 本轮刷取前天赋书数量快照（首次检查时记录，用于计算本轮获取量并通知）
        let firstBookCounts = null;
        while (1) {
            log.info(`准备刷取天赋书，开始检查体力`);
            let afterStamina = await Inventory.queryStaminaValue();
            let res = 9999999;

            if (afterStamina >= 20) {
                try {
                    log.info(`体力充足，开始检测物品数量`);
                    let bookCounts = await Inventory.getMaterialCount(materialName);
                    // 秘境未解锁（返回 null）：跳过整个天赋书刷取循环
                    if (bookCounts === null) {
                        log.warn(`⚠️ ${materialName}天赋书秘境未解锁，跳过刷取`);
                        Utils.addNotification(`${materialName}天赋书秘境未解锁，跳过刷取`);
                        return;
                    }
                    // 记录本轮刷取前数量快照（用于计算本轮获取量并通知）
                    if (firstBookCounts === null) firstBookCounts = [bookCounts[0], bookCounts[1], bookCounts[2]];
                    // 缺口 = 前面角色累计需求(基数) + 本角色需求 - 背包现有（天赋书为账号共享资源）
                    res = 0.12 * (bookRequireCounts[0] + baselineCounts[0] - bookCounts[0]) + 0.36 * (bookRequireCounts[1] + baselineCounts[1] - bookCounts[1]) + (bookRequireCounts[2] + baselineCounts[2] - bookCounts[2]);
                    Farming.recordProgress("talent", materialName, Farming.talentEquivalent(bookRequireCounts) + Farming.talentEquivalent(baselineCounts), Math.max(0, res), characterName, uid);
                    if (res > 0) {
                        log.info(`${materialName}天赋书大约还差${res.toFixed(2)}本紫色品质没有刷取`);
                        
                        let domainRounds = 1;
                        const PURPLE_PER_RUN = 1.7;
                        const STAMINA_PER_RUN = 40;
                        
                        const neededRounds = Math.ceil(res / PURPLE_PER_RUN);
                        const maxRoundsByStamina = Math.floor(afterStamina / STAMINA_PER_RUN);
                        const remainder = afterStamina % STAMINA_PER_RUN;
                        const extraRound = (remainder >= 20) ? 1 : 0;
                        const totalRoundsByStamina = maxRoundsByStamina + extraRound;
                        
                        if (neededRounds > totalRoundsByStamina) {
                            domainRounds = totalRoundsByStamina;
                        } else {
                            domainRounds = neededRounds;
                        }
                        
                        log.info(`根据体力${afterStamina}计算：需要${neededRounds}次，体力最多可执行${totalRoundsByStamina}次，实际执行${domainRounds}次`);
                        await Navigation.gotoAutoDomain(null, null, domainRounds);
                    } else {
                        notifyMaterialGain("天赋书", materialName, firstBookCounts, bookCounts);
                        Utils.addNotification(`${materialName}天赋书数量已经满足要求！！！`);
                        await TaskManager.addCompletedTask("talent", materialName, bookRequireCounts, characterName, uid);
                        return;
                    }
                } catch (error) { if (Utils.isCancellationError(error)) throw error;
                    if (error.message && error.message.includes("检测到复苏界面")) {
                        log.warn(`检测到角色被击败，等待复活后继续刷取`);
                        await sleep(4000);
                        continue;
                    }
                    // 秘境未解锁检测仅应用于「国家+天赋/武器」命名图片（材料数量识别流程），不应用于本刷取流程
                    notification.send(`${materialName}天赋书刷取失败，错误信息: ${error}`);
                    await genshin.tp(2297.6201171875, -824.5869140625);
                    if (error.message != '秘境未在开启时间，跳过执行') {
                        let bookCounts = await Inventory.getMaterialCount(materialName);
                        // 秘境未解锁（返回 null）：跳过整个天赋书刷取循环
                        if (bookCounts === null) {
                            log.warn(`⚠️ ${materialName}天赋书秘境未解锁，跳过刷取`);
                            return;
                        }
                        // 缺口 = 前面角色累计需求(基数) + 本角色需求 - 背包现有（天赋书为账号共享资源）
                        res = 0.12 * (bookRequireCounts[0] + baselineCounts[0] - bookCounts[0]) + 0.36 * (bookRequireCounts[1] + baselineCounts[1] - bookCounts[1]) + (bookRequireCounts[2] + baselineCounts[2] - bookCounts[2]);
                        Farming.recordProgress("talent", materialName, Farming.talentEquivalent(bookRequireCounts) + Farming.talentEquivalent(baselineCounts), Math.max(0, res), characterName, uid);
                    }
                    Utils.addNotification(`${materialName}天赋书大约还差${res.toFixed(2)}本紫色品质没有刷取`);
                    return;
                }
            } else {
                log.info(`体力值为${afterStamina},可能无法刷取${materialName}天赋书`);
                const bookCounts = await Inventory.getMaterialCount(materialName);
                // 秘境未解锁（返回 null）：跳过整个天赋书刷取循环
                if (bookCounts === null) {
                    log.warn(`⚠️ ${materialName}天赋书秘境未解锁，跳过刷取`);
                    Utils.addNotification(`${materialName}天赋书秘境未解锁，跳过刷取`);
                    return;
                }
                // 记录本轮刷取前数量快照（用于计算本轮获取量并通知）
                if (firstBookCounts === null) firstBookCounts = [bookCounts[0], bookCounts[1], bookCounts[2]];
                // 缺口 = 前面角色累计需求(基数) + 本角色需求 - 背包现有（天赋书为账号共享资源）
                let res = 0.12 * (bookRequireCounts[0] + baselineCounts[0] - bookCounts[0]) + 0.36 * (bookRequireCounts[1] + baselineCounts[1] - bookCounts[1]) + (bookRequireCounts[2] + baselineCounts[2] - bookCounts[2]);
                Farming.recordProgress("talent", materialName, Farming.talentEquivalent(bookRequireCounts) + Farming.talentEquivalent(baselineCounts), Math.max(0, res), characterName, uid);
                if (res <= 0) {
                    await TaskManager.addCompletedTask("talent", materialName, bookRequireCounts, characterName, uid);
                    Utils.addNotification(`${materialName}天赋书数量已经满足要求！！！`);
                } else {
                    Utils.addNotification(`${materialName}天赋书大约还差${res.toFixed(2)}本紫色品质没有刷取`);
                }
                notifyMaterialGain("天赋书", materialName, firstBookCounts, bookCounts);
                return;
            }
        }
    },
    
    getWeaponMaterial: async function(materialName, weaponRequireCounts, characterName, uid, baselineCounts) {
        // 共享材料判定基数：前面角色对同种武器秘境材料的累计需求（4品质数组），未传入时按零处理
        baselineCounts = baselineCounts || [0, 0, 0, 0];
        // 本轮刷取前武器材料数量快照（首次检查时记录，用于计算本轮获取量并通知）
        let firstWeaponCounts = null;
        while (1) {
            log.info(`准备刷取武器材料，开始检查体力`);
            let afterStamina = await Inventory.queryStaminaValue();
            let res = 99999999;

            if (afterStamina >= 20) {
                try {
                    log.info(`体力充足，开始检测物品数量`);
                    let weaponCounts = await Inventory.getWeaponMaterialCount(materialName);
                    // 秘境未解锁（返回 null）：跳过整个武器材料刷取循环
                    if (weaponCounts === null) {
                        log.warn(`⚠️ ${materialName}武器秘境未解锁，跳过刷取`);
                        Utils.addNotification(`${materialName}武器秘境未解锁，跳过刷取`);
                        return;
                    }
                    // 记录本轮刷取前数量快照（用于计算本轮获取量并通知）
                    if (firstWeaponCounts === null) firstWeaponCounts = { green: weaponCounts.green, blue: weaponCounts.blue, purple: weaponCounts.purple, gold: weaponCounts.gold };
                    // 缺口 = 前面角色累计需求(基数) + 本角色需求 - 背包现有（武器秘境材料为账号共享资源）
                    res = 0.12 * (weaponRequireCounts[0] + baselineCounts[0] - weaponCounts.green) + 0.36 * (weaponRequireCounts[1] + baselineCounts[1] - weaponCounts.blue) + (weaponRequireCounts[2] + baselineCounts[2] - weaponCounts.purple) + 3 * (weaponRequireCounts[3] + baselineCounts[3] - weaponCounts.gold);
                    Farming.recordProgress("weapon", materialName, Farming.weaponEquivalent(weaponRequireCounts) + Farming.weaponEquivalent(baselineCounts), Math.max(0, res), characterName, uid);
                    if (res > 0) {
                        log.info(`武器材料${materialName}大约还差${res.toFixed(2)}个紫色品质没有刷取`);
                        
                        let domainRounds = 1;
                        const PURPLE_PER_RUN = 1.4;
                        const STAMINA_PER_RUN = 40;
                        
                        const neededRounds = Math.ceil(res / PURPLE_PER_RUN);
                        const maxRoundsByStamina = Math.floor(afterStamina / STAMINA_PER_RUN);
                        const remainder = afterStamina % STAMINA_PER_RUN;
                        const extraRound = (remainder >= 20) ? 1 : 0;
                        const totalRoundsByStamina = maxRoundsByStamina + extraRound;
                        
                        if (neededRounds > totalRoundsByStamina) {
                            domainRounds = totalRoundsByStamina;
                        } else {
                            domainRounds = neededRounds;
                        }
                        
                        log.info(`根据体力${afterStamina}计算：需要${neededRounds}次，体力最多可执行${totalRoundsByStamina}次，实际执行${domainRounds}次`);
                        await Navigation.gotoAutoDomain("weaponDomain", null, domainRounds);
                    } else {
                        notifyMaterialGain("武器材料", materialName, firstWeaponCounts, weaponCounts);
                        Utils.addNotification(`武器材料${materialName}数量已经满足要求！！！`);
                        await TaskManager.addCompletedTask("weapon", materialName, weaponRequireCounts, characterName, uid);
                        return;
                    }
                } catch (error) { if (Utils.isCancellationError(error)) throw error;
                    if (error.message && error.message.includes("检测到复苏界面")) {
                        log.warn(`检测到角色被击败，等待复活后继续刷取`);
                        await sleep(4000);
                        continue;
                    }
                    // 秘境未解锁检测仅应用于「国家+天赋/武器」命名图片（材料数量识别流程），不应用于本刷取流程
                    Utils.addNotification(`武器材料${materialName}刷取失败，错误信息: ${error}`);
                    await genshin.tp(2297.6201171875, -824.5869140625);
                    if (error.message != '秘境未在开启时间，跳过执行') {
                        const weaponCounts = await Inventory.getWeaponMaterialCount(materialName);
                        // 秘境未解锁（返回 null）：跳过整个武器材料刷取循环
                        if (weaponCounts === null) {
                            log.warn(`⚠️ ${materialName}武器秘境未解锁，跳过刷取`);
                            return;
                        }
                        // 缺口 = 前面角色累计需求(基数) + 本角色需求 - 背包现有（武器秘境材料为账号共享资源）
                        res = 0.12 * (weaponRequireCounts[0] + baselineCounts[0] - weaponCounts.green) + 0.36 * (weaponRequireCounts[1] + baselineCounts[1] - weaponCounts.blue) + (weaponRequireCounts[2] + baselineCounts[2] - weaponCounts.purple) + 3 * (weaponRequireCounts[3] + baselineCounts[3] - weaponCounts.gold);
                        Farming.recordProgress("weapon", materialName, Farming.weaponEquivalent(weaponRequireCounts) + Farming.weaponEquivalent(baselineCounts), Math.max(0, res), characterName, uid);
                    }
                    Utils.addNotification(`武器材料${materialName}大约还差${res.toFixed(2)}个紫色品质没有刷取`);
                    return;
                }
            } else {
                log.info(`体力值为${afterStamina},可能无法刷取武器材料${materialName}`);
                const weaponCounts = await Inventory.getWeaponMaterialCount(materialName);
                // 秘境未解锁（返回 null）：跳过整个武器材料刷取循环
                if (weaponCounts === null) {
                    log.warn(`⚠️ ${materialName}武器秘境未解锁，跳过刷取`);
                    Utils.addNotification(`${materialName}武器秘境未解锁，跳过刷取`);
                    return;
                }
                // 记录本轮刷取前数量快照（用于计算本轮获取量并通知）
                if (firstWeaponCounts === null) firstWeaponCounts = { green: weaponCounts.green, blue: weaponCounts.blue, purple: weaponCounts.purple, gold: weaponCounts.gold };
                // 缺口 = 前面角色累计需求(基数) + 本角色需求 - 背包现有（武器秘境材料为账号共享资源）
                let res = 0.12 * (weaponRequireCounts[0] + baselineCounts[0] - weaponCounts.green) + 0.36 * (weaponRequireCounts[1] + baselineCounts[1] - weaponCounts.blue) + (weaponRequireCounts[2] + baselineCounts[2] - weaponCounts.purple) + 3 * (weaponRequireCounts[3] + baselineCounts[3] - weaponCounts.gold);
                Farming.recordProgress("weapon", materialName, Farming.weaponEquivalent(weaponRequireCounts) + Farming.weaponEquivalent(baselineCounts), Math.max(0, res), characterName, uid);
                if (res <= 0) {
                    await TaskManager.addCompletedTask("weapon", materialName, weaponRequireCounts, characterName, uid);
                    Utils.addNotification(`武器材料${materialName}数量已经满足要求！！！`);
                } else {
                    Utils.addNotification(`武器材料${materialName}大约还差${res.toFixed(2)}个紫色品质没有刷取`);
                }
                notifyMaterialGain("武器材料", materialName, firstWeaponCounts, weaponCounts);
                return;
            }
        }
    },
    
    getBossMaterial: async function(bossName, bossRequireCounts, characterName, uid, baselineCounts) {
        // 共享材料判定基数：前面角色对同种首领材料的累计需求（数字），未传入时按零处理
        baselineCounts = baselineCounts || 0;
        // 本轮刷取前首领材料数量快照（首次检查时记录，用于计算本轮获取量并通知）
        let firstBossCounts = null;
        while (1) {
            log.info(`准备刷取 boss 材料，开始检查体力`);
            let afterStamina = await Inventory.queryStaminaValue();
            let res = 99999999;

            if (afterStamina >= 40) {
                try {
                    log.info(`体力充足，开始检测物品数量`);
                    let bossCounts = await Inventory.getBossMaterialCount(bossName);
                    // 记录本轮刷取前数量快照（用于计算本轮获取量并通知）
                    if (firstBossCounts === null) firstBossCounts = bossCounts;
                    // 缺口 = 前面角色累计需求(基数) + 本角色需求 - 背包现有（首领材料为账号共享资源）
                    // 数字化处理：config 中 bossRequireCounts 可能为字符串，直接相加会触发字符串拼接导致缺口被放大
                    res = (Number(bossRequireCounts) || 0) + (Number(baselineCounts) || 0) - bossCounts;
                    Farming.recordProgress("boss", bossName, (Number(bossRequireCounts) || 0) + (Number(baselineCounts) || 0), Math.max(0, res), characterName, uid);
                    if (res > 0) {
                        log.info(`${bossName}还差${res}个材料没有刷取`);
                        await Combat.fightBoss(bossName);
                    } else {
                        notifyMaterialGain("Boss材料", bossName, firstBossCounts, bossCounts);
                        Utils.addNotification(`${bossName}材料数量已经满足要求！！！`);
                        await TaskManager.addCompletedTask("boss", bossName, bossRequireCounts, characterName, uid);
                        return;
                    }
                } catch (error) { if (Utils.isCancellationError(error)) throw error;
                    if (error.message && error.message.includes("检测到复苏界面")) {
                        log.warn(`检测到角色被击败，等待复活后继续刷取`);
                        await sleep(4000);
                        continue;
                    }
                    Utils.addNotification(`${bossName}刷取失败，错误信息: ${error}`);
                    await genshin.tp(2297.6201171875, -824.5869140625);
                    return;
                }
            } else {
                log.info(`体力值为${afterStamina},可能无法刷取首领材料${bossName}`);
                const bossCounts = await Inventory.getBossMaterialCount(bossName);
                // 记录本轮刷取前数量快照（用于计算本轮获取量并通知）
                if (firstBossCounts === null) firstBossCounts = bossCounts;
                // 缺口 = 前面角色累计需求(基数) + 本角色需求 - 背包现有（首领材料为账号共享资源）
                // 数字化处理：config 中 bossRequireCounts 可能为字符串，直接相加会触发字符串拼接导致缺口被放大
                let res = (Number(bossRequireCounts) || 0) + (Number(baselineCounts) || 0) - bossCounts;
                Farming.recordProgress("boss", bossName, (Number(bossRequireCounts) || 0) + (Number(baselineCounts) || 0), Math.max(0, res), characterName, uid);
                if (res > 0) {
                    Utils.addNotification(`${bossName}还差${res}个材料没有刷取`);
                } else {
                    Utils.addNotification(`${bossName}材料数量已经满足要求！！！`);
                    await TaskManager.addCompletedTask("boss", bossName, bossRequireCounts, characterName, uid);
                }
                notifyMaterialGain("Boss材料", bossName, firstBossCounts, bossCounts);
                return;
            }
        }
    }
};

// 计算并通知本轮刷取的材料获取量（刷取后数量 - 刷取前数量）
// before/after 支持：[绿,蓝,紫] 数组、{green,blue,purple,gold} 对象、数字标量
function notifyMaterialGain(typeName, materialName, before, after) {
    try {
        if (before === null || before === undefined) return;
        const diffOf = (b, a) => {
            if (Array.isArray(b)) return b.map((v, i) => ((a && a[i]) || 0) - (v || 0));
            if (b && typeof b === 'object') return { green: a.green - b.green, blue: a.blue - b.blue, purple: a.purple - b.purple, gold: a.gold - b.gold };
            return (a || 0) - (b || 0);
        };
        const d = diffOf(before, after);
        const sum = Array.isArray(d) ? d.reduce((s, v) => s + Math.max(0, v), 0)
            : (d && typeof d === 'object') ? Math.max(0, d.green) + Math.max(0, d.blue) + Math.max(0, d.purple) + Math.max(0, d.gold)
            : Math.max(0, d);
        if (sum <= 0) return; // 无获取量，不发通知
        const textOf = (v) => Array.isArray(v) ? v.join('/')
            : (v && typeof v === 'object') ? `${v.green}/${v.blue}/${v.purple}/${v.gold}`
            : String(v);
        Utils.addNotification(`✅ [${typeName}] ${materialName} 本轮获取：${textOf(d)}（刷取前 ${textOf(before)} → 刷取后 ${textOf(after)}）`);
    } catch (e) { if (Utils.isCancellationError(e)) throw e; }
}
