/**
 * Wiki 本地数据查询模块
 * 优先从本地 JSON 文件（Character Data.json / Weapons_data.json / Mapping.json）获取材料数据，
 * 未找到时回退到 WikiFetcherWeb 进行网页获取。
 * 
 * 全局名称 WikiFetcher 保持向后兼容（main.js / configGenerator.js 通过此名称调用 Smart 方法）。
 */
var WikiFetcher = {
    // 本地数据缓存
    _localCharData: null,
    _localWeaponData: null,
    _localMappingData: null,

    // ========== 本地数据加载 ==========

    _loadLocalCharData() {
        if (this._localCharData === null) {
            try {
                this._localCharData = JSON.parse(file.readTextSync("data/Character Data.json"));
                log.info(`📌 已加载本地角色数据: ${this._localCharData.length} 条记录`);
            } catch (e) { if (Utils.isCancellationError(e)) throw e;
                log.error(`读取 data/Character Data.json 失败: ${e.message}`);
                this._localCharData = [];
            }
        }
        return this._localCharData;
    },

    _loadLocalWeaponData() {
        if (this._localWeaponData === null) {
            try {
                this._localWeaponData = JSON.parse(file.readTextSync("data/Weapons_data.json"));
                log.info(`📌 已加载本地武器数据: ${this._localWeaponData.length} 条记录`);
            } catch (e) { if (Utils.isCancellationError(e)) throw e;
                log.error(`读取 data/Weapons_data.json 失败: ${e.message}`);
                this._localWeaponData = [];
            }
        }
        return this._localWeaponData;
    },

    _loadLocalMappingData() {
        if (this._localMappingData === null) {
            try {
                this._localMappingData = JSON.parse(file.readTextSync("data/Mapping.json"));
                log.info(`📌 已加载本地材料映射数据: ${this._localMappingData.length} 条记录`);
            } catch (e) { if (Utils.isCancellationError(e)) throw e;
                log.error(`读取 data/Mapping.json 失败: ${e.message}`);
                this._localMappingData = [];
            }
        }
        return this._localMappingData;
    },

    // ========== 本地查询方法 ==========

    /**
     * 从本地 Character Data.json 获取角色培养材料信息
     * @param {string} characterName - 角色名称（支持别名）
     * @returns {Object|null} - 包含材料信息的对象，未找到返回 null
     */
    getCharacterMaterialsLocal(characterName) {
        try {
            const standardName = WikiFetcherWeb.getStandardCharacterName(characterName);
            if (!standardName) return null;

            const charData = this._loadLocalCharData();
            for (const char of charData) {
                if (char.name === standardName || char.name === characterName.trim()) {
                    const materials = char.materials || {};
                    // 天赋怪物材料名 = common_material 完整字符串（如 "牢固的箭簇,锐利的箭簇,历战的箭簇"）
                    // 与网页模式保持一致，使用处会 split 取第一个
                    const talentMobMaterialName = materials.common_material || null;

                    // 天赋书名称 = talent_book 中「」内的文字（如 "「风雅」的哲学" → "风雅"）
                    let talentBookName = null;
                    const talentBookRaw = materials.talent_book || "";
                    const bookMatch = talentBookRaw.match(/「([^」]+)」/);
                    if (bookMatch) {
                        talentBookName = bookMatch[1];
                    } else {
                        talentBookName = talentBookRaw || null;
                    }

                    // 天赋怪物名称 = "name of magic" 的第一项
                    const magicNames = (materials["name of magic"] || "").split(",").map(s => s.trim()).filter(s => s);
                    const talentMobName = magicNames[0] || null;

                    log.info(`✅ 从本地 Character Data.json 获取到角色【${standardName}】的材料信息`);
                    return {
                        bossMaterialName: materials.ascension_boss || null,
                        talentMobMaterialName: talentMobMaterialName,
                        specialtyName: materials.local_specialty || null,
                        talentBookName: talentBookName,
                        // 以下字段为本地数据额外提供，用于跳过后续网页延迟获取
                        bossName: materials.boss || null,
                        talentMobName: talentMobName
                    };
                }
            }
            return null;
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            log.error(`本地角色数据查询失败: ${e.message}`);
            return null;
        }
    },

    /**
     * 从本地 Weapons_data.json 获取武器材料信息
     * @param {string} weaponName - 武器名称
     * @returns {Object|null} - 包含武器材料信息的对象，未找到返回 null
     */
    getWeaponInfoLocal(weaponName) {
        try {
            if (!weaponName) return null;

            const weaponData = this._loadLocalWeaponData();
            for (const weapon of weaponData) {
                if (weapon.weapon === weaponName.trim()) {
                    const materials = weapon.materials || {};
                    // 武器秘境名称 = "weapons material" 的前四个字
                    let weaponDomainName = null;
                    if (materials["weapons material"]) {
                        weaponDomainName = materials["weapons material"].substring(0, 4);
                    }
                    // 通过 Mapping.json 查找武器材料对应的怪物名称
                    // 字段映射约定（与 wikiDataSaver.js saveWeaponData 保持一致）：
                    //   common_material2  = weapons1Material （第一种武器魔物材料）
                    //   common_material   = weapons2Material （第二种武器魔物材料）
                    const weapons1MobName = this.getMobNameFromMaterialLocal(materials.common_material2);
                    const weapons2MobName = this.getMobNameFromMaterialLocal(materials.common_material);

                    log.info(`✅ 从本地 Weapons_data.json 获取到武器【${weaponName}】的材料信息`);
                    return {
                        starLevel: weapon["star rating"] || null, // 本地数据中的星级信息（如 "五星"、"四星"）
                        weaponDomainName: weaponDomainName,
                        weapons1MaterialName: materials.common_material2 || null,
                        weapons2MaterialName: materials.common_material || null,
                        // 以下字段为本地数据额外提供，用于跳过后续网页延迟获取
                        weapons1MobName: weapons1MobName,
                        weapons2MobName: weapons2MobName
                    };
                }
            }
            return null;
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            log.error(`本地武器数据查询失败: ${e.message}`);
            return null;
        }
    },

    /**
     * 从本地 Mapping.json 根据材料名查找所有掉落该材料的怪物名称
     * 不同怪物可能掉落相同材料，因此会收集所有匹配怪物的 alias 数组中所有名称
     * alias 数组已包含 name 字段的值，无需额外加入 name
     * @param {string} materialName - 材料名称
     * @returns {string|null} - 逗号分隔的所有怪物名称（含别名），未找到返回 null
     */
    getMobNameFromMaterialLocal(materialName) {
        if (!materialName) return null;
        try {
            const mappingData = this._loadLocalMappingData();
            const trimmedInput = materialName.trim();
            const collected = [];   // 保持首次出现顺序
            const seen = new Set();  // 去重用
            const addName = (n) => {
                if (!n) return;
                const trimmed = String(n).trim();
                if (trimmed && !seen.has(trimmed)) {
                    seen.add(trimmed);
                    collected.push(trimmed);
                }
            };

            for (const entry of mappingData) {
                const materials = (entry.material || "").split(",").map(s => s.trim());
                if (!materials.includes(trimmedInput)) continue;
                // 命中：仅收集 alias 数组中的所有名称（alias 已包含 name）
                if (Array.isArray(entry.alias)) {
                    for (const alias of entry.alias) addName(alias);
                }
            }

            if (collected.length === 0) return null;
            return collected.join(",");
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            log.error(`本地材料映射查询失败: ${e.message}`);
            return null;
        }
    },

    /**
     * 从本地 Character Data.json 根据 Boss 材料名查找 Boss 名称
     * @param {string} bossMaterialName - Boss 材料名称
     * @returns {string|null} - Boss 名称，未找到返回 null
     */
    getBossNameFromMaterialLocal(bossMaterialName) {
        if (!bossMaterialName) return null;
        try {
            const charData = this._loadLocalCharData();
            for (const char of charData) {
                if (char.materials && char.materials.ascension_boss === bossMaterialName.trim()) {
                    return char.materials.boss || null;
                }
            }
            return null;
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            log.error(`本地 Boss 材料查询失败: ${e.message}`);
            return null;
        }
    },

    // ========== Smart 方法：本地优先，未找到回退网页 ==========

    /**
     * 智能获取角色培养材料：本地 Character Data.json 优先，未找到回退网页
     * @param {string} characterName - 角色名称
     * @returns {Object} - 包含 bossMaterialName, talentMobMaterialName, specialtyName, talentBookName
     */
    async getCharacterMaterialsSmart(characterName) {
        const localResult = this.getCharacterMaterialsLocal(characterName);
        if (localResult) {
            return localResult;
        }
        log.info(`📌 本地数据文件未找到角色【${characterName}】，从网页获取...`);
        const fastResult = await WikiFetcherWeb.getCharacterMaterialsFast(characterName);
        // 将网页获取的角色材料数据保存到 Character Data.json
        if (fastResult && typeof WikiDataSaver !== 'undefined') {
            try {
                const standardName = WikiFetcherWeb.getStandardCharacterName(characterName);

                // 尝试从本地已有数据中补全 Boss 名称和天赋怪物名称
                // （其他角色可能使用了相同的 Boss 材料/天赋怪物材料，且已保存了来源名称）
                const detailedResult = {};
                if (fastResult.bossMaterialName) {
                    const localBossName = this.getBossNameFromMaterialLocal(fastResult.bossMaterialName);
                    if (localBossName) {
                        detailedResult.bossName = localBossName;
                        log.info(`✅ 从本地数据补全 Boss 名称: ${localBossName}`);
                    }
                }
                if (fastResult.talentMobMaterialName) {
                    const localMobName = this.getMobNameFromMaterialLocal(fastResult.talentMobMaterialName);
                    if (localMobName) {
                        detailedResult.talentMobName = localMobName;
                        log.info(`✅ 从本地数据补全天赋怪物名称: ${localMobName}`);
                    }
                }

                WikiDataSaver.saveCharacterData(standardName, fastResult,
                    Object.keys(detailedResult).length > 0 ? detailedResult : null);
            } catch (e) { if (Utils.isCancellationError(e)) throw e;
                log.warn(`⚠️ 保存角色数据到 Character Data.json 失败: ${e.message}`);
            }
        }
        return fastResult;
    },

    /**
     * 智能获取武器信息：本地 Weapons_data.json 优先，未找到回退网页
     * 本地数据含 star rating 字段时直接使用；缺失时从网页获取星级
     * @param {string} weaponName - 武器名称
     * @returns {Object} - 包含 starLevel, weaponDomainName, weapons1MaterialName, weapons2MaterialName
     */
    async getWeaponInfoSmart(weaponName) {
        const localResult = this.getWeaponInfoLocal(weaponName);
        if (localResult) {
            // 本地 star rating 字段缺失时，从网页补全星级
            if (!localResult.starLevel) {
                try {
                    log.info(`📌 本地数据无武器【${weaponName}】星级，从网页获取星级...`);
                    const webInfo = await WikiFetcherWeb.getWeaponInfoFast(weaponName);
                    localResult.starLevel = webInfo?.starLevel || null;
                } catch (e) { if (Utils.isCancellationError(e)) throw e;
                    log.warn(`⚠️ 从网页获取武器星级失败: ${e.message}`);
                }
            }
            return localResult;
        }
        log.info(`📌 本地数据文件未找到武器【${weaponName}】，从网页获取...`);
        const fastResult = await WikiFetcherWeb.getWeaponInfoFast(weaponName);
        // 将网页获取的武器材料数据保存到 Weapons_data.json
        if (fastResult && typeof WikiDataSaver !== 'undefined' && fastResult.materialNames) {
            try {
                WikiDataSaver.saveWeaponData(weaponName, fastResult.starLevel, fastResult.weaponType, fastResult.materialNames);
            } catch (e) { if (Utils.isCancellationError(e)) throw e;
                log.warn(`⚠️ 保存武器数据到 Weapons_data.json 失败: ${e.message}`);
            }
        }
        return fastResult;
    },

    /**
     * 智能获取 Boss 名称：本地 Character Data.json 优先，未找到回退网页
     * @param {string} bossMaterialName - Boss 材料名称
     * @returns {string|null} - Boss 名称
     */
    async getBossNameFromMaterialSmart(bossMaterialName) {
        const localBossName = this.getBossNameFromMaterialLocal(bossMaterialName);
        if (localBossName) {
            log.info(`✅ 从本地数据文件获取到 Boss 材料【${bossMaterialName}】对应的 Boss 名称: ${localBossName}`);
            return localBossName;
        }
        log.info(`📌 本地数据文件未找到 Boss 材料【${bossMaterialName}】，从网页获取...`);
        return await WikiFetcherWeb.getBossNameFromMaterial(bossMaterialName);
    },

    /**
     * 智能获取天赋怪物名称：本地 Mapping.json 优先，未找到回退网页
     * 本地匹配可能返回逗号分隔的多名称（含 alias 数组中的所有别名），此时逐个调用 cleanMobName 清理后再合并
     * @param {string} talentMobMaterialName - 天赋怪物材料名称
     * @returns {string|null} - 天赋怪物名称（可能为逗号分隔的多名称）
     */
    async getTalentMobNameFromMaterialSmart(talentMobMaterialName) {
        const localMobName = this.getMobNameFromMaterialLocal(talentMobMaterialName);
        if (localMobName) {
            log.info(`✅ 从本地数据文件获取到材料【${talentMobMaterialName}】对应的怪物名称: ${localMobName}`);
            // 多名称时分别清理，再合并
            const names = localMobName.split(",").map(n => n.trim()).filter(Boolean);
            const cleaned = names.map(n => WikiFetcherWeb.cleanMobName(n)).filter(Boolean);
            return cleaned.join(",");
        }
        log.info(`📌 本地数据文件未找到材料【${talentMobMaterialName}】，从网页获取...`);
        return await WikiFetcherWeb.getTalentMobNameFromMaterial(talentMobMaterialName);
    },

    /**
     * 智能获取武器魔物名称：本地 Mapping.json 优先，未找到回退网页
     * 本地匹配可能返回逗号分隔的多名称（含 alias 数组中的所有别名），此时逐个调用 cleanMobName 清理后再合并
     * @param {string} weaponMaterialName - 武器材料名称
     * @returns {string|null} - 武器魔物名称（可能为逗号分隔的多名称）
     */
    async getWeaponMobNameFromMaterialSmart(weaponMaterialName) {
        const localMobName = this.getMobNameFromMaterialLocal(weaponMaterialName);
        if (localMobName) {
            log.info(`✅ 从本地数据文件获取到材料【${weaponMaterialName}】对应的怪物名称: ${localMobName}`);
            // 多名称时分别清理，再合并
            const names = localMobName.split(",").map(n => n.trim()).filter(Boolean);
            const cleaned = names.map(n => WikiFetcherWeb.cleanMobName(n)).filter(Boolean);
            return cleaned.join(",");
        }
        log.info(`📌 本地数据文件未找到材料【${weaponMaterialName}】，从网页获取...`);
        return await WikiFetcherWeb.getWeaponMobNameFromMaterial(weaponMaterialName);
    }
};

// WikiFetcher 已定义为全局变量，无需额外导出（兼容 BetterGI 的 eval 加载方式）
// WikiFetcherWeb 需在之前加载（lib/wikiFetcher.js）