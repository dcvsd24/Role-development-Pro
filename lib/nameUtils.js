// 名称处理与培养配置工具模块

// 根据用户输入的角色名称获取标准名称（从 combat_avatar.json）
function getStandardCharacterName(inputName) {
    if (!inputName) return null;
    try {
        const avatarData = JSON.parse(file.readTextSync("data/combat_avatar.json"));
        const normalizedInput = inputName.toLowerCase().trim();
        
        for (const avatar of avatarData) {
            // 检查标准名称
            if (avatar.name && avatar.name.toLowerCase() === normalizedInput) {
                return avatar.name;
            }
            // 检查别名数组
            if (avatar.alias && Array.isArray(avatar.alias)) {
                for (const alias of avatar.alias) {
                    if (alias.toLowerCase() === normalizedInput) {
                        return avatar.name;
                    }
                }
            }
        }
        return null;
    } catch (e) { if (Utils.isCancellationError(e)) throw e;
        log.error(`读取 combat_avatar.json 失败: ${e.message}`);
        return null;
    }
}

// 培养等级配置快照：由用户目标配置决定（目标等级/天赋/武器目标），
// 用于区分"已完成任务"后续是否提高了培养等级导致的需求差异。当前角色等级提升只会降低需求，故不纳入。
function getCultivationConfigSnapshot() {
    try {
        return JSON.stringify({
            targetLevel: settings.bossRequireCounts,
            targetTalents: settings.talentBookRequireCounts,
            targetWeaponLevel: settings.weaponMaterialRequireCounts
        });
    } catch (e) { if (Utils.isCancellationError(e)) throw e;
        return "";
    }
}

// 构建任务记录名（扫描/预检/采集记录三处共用同一实现，保证任务 key 一致）：
// 按逗号切分→trim→过滤 length>2→join(', ')。
// 入参必须是"完整三连"原始键（talentMobMaterialNameRaw / Weapons1 materialNameRaw / Weapons2 materialNameRaw），
// 这些键在采集阶段不会被覆盖为魔物名，从而扫描与采集使用同一任务标识。
function buildTaskMaterialName(configKey) {
    try {
        const config = Utils.readJson(Constants.CONFIG_PATH);
        const raw = (config[configKey] || "").toString().trim();
        if (!raw) return "";
        return raw.split(",").map(k => k.trim()).filter(k => k.length > 2).join(", ");
    } catch (e) { if (Utils.isCancellationError(e)) throw e;
        return "";
    }
}