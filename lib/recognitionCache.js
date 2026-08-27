// 角色识别缓存模块（按 UID+角色名 保存/复用识别结果，多角色互不覆盖）

// 缓存有效期：3 天（毫秒）
const RECOGNITION_CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000;

// 判断缓存条目是否过期：无 savedAt（旧版条目）或超过有效期均视为过期
function isRecognitionCacheEntryExpired(entry, now) {
    if (!entry || typeof entry !== "object") return true;
    const savedAt = Number(entry.savedAt);
    if (!Number.isFinite(savedAt) || savedAt <= 0) return true; // 旧版无时间戳 → 视为过期，强制重新识别一次
    return (now - savedAt) >= RECOGNITION_CACHE_TTL_MS;
}

// 清理所有 UID 下已过期的缓存条目；返回是否发生了删除（调用方据此决定是否写回 config.json）
function cleanExpiredRecognitionCache(configArray) {
    if (!Array.isArray(configArray)) return false;
    const now = Date.now();
    let changed = false;
    for (const item of configArray) {
        if (!item || !item.hasOwnProperty("recognitionCache")) continue;
        const cache = item["recognitionCache"];
        if (!cache || typeof cache !== "object") continue;
        for (const uid of Object.keys(cache)) {
            const uidCache = cache[uid];
            if (!uidCache || typeof uidCache !== "object") continue;
            for (const charName of Object.keys(uidCache)) {
                if (isRecognitionCacheEntryExpired(uidCache[charName], now)) {
                    delete uidCache[charName];
                    changed = true;
                }
            }
            // 该 UID 下角色缓存清空后，连 UID 键一起删除，避免残留空对象
            if (Object.keys(uidCache).length === 0) {
                delete cache[uid];
                changed = true;
            }
        }
        // 整个 recognitionCache 清空后移除该字段
        if (Object.keys(cache).length === 0) {
            delete item["recognitionCache"];
            changed = true;
        }
    }
    return changed;
}

// 角色识别缓存指纹：由用户目标配置 + 角色名 + 武器名决定（与识别出的等级无关）。
// 指纹一致 → 复用当前 UID 已保存的识别等级，跳过 OCR 识别。
// 指纹包含武器名称，武器名变更即缓存失效，需重新 OCR 识别。
function getRecognitionSettingsFingerprint() {
    try {
        return JSON.stringify({
            character: (settings.Character || "").trim(),
            targetLevel: settings.bossRequireCounts || "",
            targetTalents: settings.talentBookRequireCounts || "",
            weaponTarget: settings.weaponMaterialRequireCounts || "",
            weaponName: (settings.weaponName || "").trim()
        });
    } catch (e) { if (Utils.isCancellationError(e)) throw e;
        return "";
    }
}

// 读取指定 UID 的角色识别缓存项，并按当前角色名取嵌套缓存项；无记录或非法返回 null
function getRecognitionCacheEntry(configArray, uid) {
    if (!uid || !Array.isArray(configArray)) return null;
    const idx = configArray.findIndex(item => item && item.hasOwnProperty("recognitionCache"));
    if (idx === -1) return null;
    const cache = configArray[idx]["recognitionCache"];
    if (!cache || typeof cache !== "object") return null;
    const uidCache = cache[String(uid)];
    if (!uidCache || typeof uidCache !== "object") return null;
    const charName = (settings.Character || "").trim();
    if (!charName) return null;
    const entry = uidCache[charName];
    if (!entry || typeof entry !== "object") return null;
    return entry;
}

// 将缓存的识别等级回写扁平字段，供下游材料计算读取
function restoreRecognitionCache(configArray, entry) {
    if (!entry || !Array.isArray(configArray)) return;
    const flat = {
        characterLevel: entry.characterLevel,
        characterBreak: entry.characterBreak,
        talentLevels: entry.talentLevels,
        weaponLevel: entry.weaponLevel,
        weaponStar: entry.weaponStar,
        moraAmount: entry.moraAmount
    };
    for (const key of Object.keys(flat)) {
        const val = flat[key];
        if (val === undefined || val === null) continue;
        const idx = configArray.findIndex(item => item && item.hasOwnProperty(key));
        if (idx !== -1) {
            configArray[idx][key] = val;
        } else {
            configArray.push({ [key]: val });
        }
    }
}

// 识别完成后：从扁平字段收集识别结果，写入当前 UID 的缓存项 cache[uid][角色名]（更新或新增）
function saveRecognitionCache(configArray, uid, fingerprint) {
    if (!uid || !Array.isArray(configArray)) return;
    const charName = (settings.Character || "").trim();
    if (!charName) return;
    const getFlat = (key) => {
        const idx = configArray.findIndex(item => item && item.hasOwnProperty(key));
        return idx !== -1 ? configArray[idx][key] : undefined;
    };
    const entry = {
        fingerprint: fingerprint || "",
        savedAt: Date.now(), // 保存时间戳，用于 3 天过期判断
        characterName: charName,
        characterLevel: getFlat("characterLevel"),
        characterBreak: getFlat("characterBreak"),
        talentLevels: getFlat("talentLevels"),
        weaponLevel: getFlat("weaponLevel"),
        weaponStar: getFlat("weaponStar"),
        moraAmount: getFlat("moraAmount")
    };
    const idx = configArray.findIndex(item => item && item.hasOwnProperty("recognitionCache"));
    if (idx !== -1) {
        if (!configArray[idx]["recognitionCache"] || typeof configArray[idx]["recognitionCache"] !== "object") {
            configArray[idx]["recognitionCache"] = {};
        }
        const cache = configArray[idx]["recognitionCache"];
        if (!cache[String(uid)] || typeof cache[String(uid)] !== "object") {
            cache[String(uid)] = {};
        }
        // 清理旧版扁平缓存结构的残留字段（历史版本 cache[uid] 直接存识别结果，升级为按角色名嵌套后遗留），
        // 避免旧配置数据与新嵌套条目并存
        const legacyFlatKeys = ["fingerprint", "characterName", "characterLevel", "characterBreak", "talentLevels", "weaponLevel", "weaponStar", "moraAmount"];
        for (const legacyKey of legacyFlatKeys) {
            delete cache[String(uid)][legacyKey];
        }
        cache[String(uid)][charName] = entry;
    } else {
        configArray.push({ recognitionCache: { [String(uid)]: { [charName]: entry } } });
    }
}