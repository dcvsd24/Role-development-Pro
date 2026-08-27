/**
 * Wiki 数据保存模块
 * 将从网页获取的材料名称保存到本地数据文件（Character Data.json / Weapons_data.json / Mapping.json）
 * 未获取到的字段留空白字符串
 */
var WikiDataSaver = {
    // 文件路径
    _charDataPath: "data/Character Data.json",
    _weaponDataPath: "data/Weapons_data.json",
    _mappingDataPath: "data/Mapping.json",

    // 缓存与脏标记
    _charData: null,
    _charDataLoaded: false,
    _weaponData: null,
    _weaponDataLoaded: false,
    _mappingData: null,
    _mappingDataLoaded: false,

    // ========== 角色数据 ==========

    /**
     * 保存从网页获取的角色材料数据到 Character Data.json
     * @param {string} standardName - 标准角色名称
     * @param {Object} fastResult - getCharacterMaterialsFast 的返回结果
     * @param {Object} [detailedResult] - getCharacterMaterials 的返回结果（含 bossName, talentMobName）
     */
    saveCharacterData(standardName, fastResult, detailedResult) {
        if (!standardName || !fastResult) return;

        const data = this._loadCharData();
        let entry = data.find(c => c.name === standardName);

        if (!entry) {
            entry = {
                name: standardName,
                "star rating": "",
                weapon: "",
                element: "",
                materials: {
                    ascension_gem: "",
                    ascension_boss: "",
                    boss: "",
                    common_material: "",
                    "name of magic": "",
                    local_specialty: "",
                    talent_book: "",
                    weekly_boss: ""
                }
            };
            data.push(entry);
        }

        // 确保 materials 存在
        if (!entry.materials) {
            entry.materials = {};
        }

        // 填充星级（已有值不覆盖，仅补空白）
        if (fastResult.starRating && !entry["star rating"]) {
            entry["star rating"] = fastResult.starRating;
        }

        // 填充武器和元素（已有值不覆盖，仅补空白）
        if (fastResult.weapon && !entry.weapon) {
            entry.weapon = fastResult.weapon;
        }
        if (fastResult.element && !entry.element) {
            entry.element = fastResult.element;
        }

        // 填充从网页获取的字段（已有值不覆盖，仅补空白）
        if (fastResult.bossMaterialName && !entry.materials.ascension_boss) {
            entry.materials.ascension_boss = fastResult.bossMaterialName;
        }
        if (fastResult.specialtyName && !entry.materials.local_specialty) {
            entry.materials.local_specialty = fastResult.specialtyName;
        }
        if (fastResult.talentMobMaterialName && !entry.materials.common_material) {
            entry.materials.common_material = fastResult.talentMobMaterialName;
        }
        if (fastResult.talentBookName && !entry.materials.talent_book) {
            entry.materials.talent_book = "「" + fastResult.talentBookName + "」的哲学";
        }
        if (fastResult.weeklyBossName && !entry.materials.weekly_boss) {
            entry.materials.weekly_boss = fastResult.weeklyBossName;
        }

        // 详细结果中的 bossName / talentMobName
        if (detailedResult) {
            if (detailedResult.bossName && !entry.materials.boss) {
                entry.materials.boss = detailedResult.bossName;
            }
            if (detailedResult.talentMobName && !entry.materials["name of magic"]) {
                entry.materials["name of magic"] = detailedResult.talentMobName;
            }
        }

        this._saveCharData(data);
        log.info(`💾 WikiDataSaver: 已保存角色【${standardName}】数据到 Character Data.json`);
    },

    // ========== 武器数据 ==========

    /**
     * 保存从网页获取的武器材料数据到 Weapons_data.json
     * @param {string} weaponName - 武器名称
     * @param {string} starLevel - 星级（如 "五星"、"四星"）
     * @param {string} [weaponType] - 武器类型（如 "双手剑"）
     * @param {Object} materialNames - parseWeaponMaterials 的返回结果
     * @param {Object} [detailedResult] - getWeaponInfo 的返回结果（含 mob 名称）
     */
    saveWeaponData(weaponName, starLevel, weaponType, materialNames) {
        if (!weaponName || !materialNames) return;

        const data = this._loadWeaponData();
        let entry = data.find(w => w.weapon === weaponName);

        if (!entry) {
            entry = {
                weapon: weaponName,
                "star rating": "",
                weapon_type: "",
                materials: {
                    common_material: "",
                    common_material2: "",
                    "weapons material": "",
                    weapons1_material2: "",
                    weapons2_material2: "",
                    weapons1_material3: "",
                    weapons2_material3: ""
                }
            };
            data.push(entry);
        }

        // 确保 materials 存在
        if (!entry.materials) {
            entry.materials = {};
        }

        // 填充星级
        if (starLevel && !entry["star rating"]) {
            entry["star rating"] = starLevel;
        }

        // 填充武器类型（已有值不覆盖，仅补空白）
        if (weaponType && !entry.weapon_type) {
            entry.weapon_type = weaponType;
        }

        // 填充材料名称（已有值不覆盖）
        // 字段映射约定（与 wikiLocal.js 保持一致）：
        //   common_material2  ← weapons1Material  （第一种武器魔物材料）
        //   common_material   ← weapons2Material  （第二种武器魔物材料）
        if (materialNames.weapons2Material && !entry.materials.common_material) {
            entry.materials.common_material = materialNames.weapons2Material;
        }
        if (materialNames.weapons1Material && !entry.materials.common_material2) {
            entry.materials.common_material2 = materialNames.weapons1Material;
        }
        if (materialNames.weaponDomainMaterial && !entry.materials["weapons material"]) {
            entry.materials["weapons material"] = materialNames.weaponDomainMaterial;
        }
        // 2★ 武器材料1/2
        if (materialNames.weapons1Material2 && !entry.materials.weapons1_material2) {
            entry.materials.weapons1_material2 = materialNames.weapons1Material2;
        }
        if (materialNames.weapons2Material2 && !entry.materials.weapons2_material2) {
            entry.materials.weapons2_material2 = materialNames.weapons2Material2;
        }
        // 3★ 武器材料1/2
        if (materialNames.weapons1Material3 && !entry.materials.weapons1_material3) {
            entry.materials.weapons1_material3 = materialNames.weapons1Material3;
        }
        if (materialNames.weapons2Material3 && !entry.materials.weapons2_material3) {
            entry.materials.weapons2_material3 = materialNames.weapons2Material3;
        }

        this._saveWeaponData(data);
        log.info(`💾 WikiDataSaver: 已保存武器【${weaponName}】数据到 Weapons_data.json`);
    },

    // ========== 映射数据 ==========

    /**
     * 保存材料→来源（Boss/怪物）的映射到 Mapping.json
     * @param {string} materialName - 材料名称（如 "雷光棱镜"）
     * @param {string} sourceName - 来源名称（如 "无相之雷"），可能是逗号分隔的多名称
     * @param {string} type - 类型 ("boss"、"common" 或 "Elite")
     */
    saveMappingData(materialName, sourceName, type) {
        if (!materialName || !sourceName) return;

        // sourceName 可能是逗号分隔的多名称，拆分并去空
        const sourceNames = String(sourceName)
            .split(",")
            .map(s => s.trim())
            .filter(s => s);
        if (sourceNames.length === 0) return;

        // name 作为主键只保存一个名称（取第一个）
        const primaryKey = sourceNames[0];

        const data = this._loadMappingData();
        let entry = data.find(e => e.name === primaryKey);

        if (!entry) {
            // alias 保存从网页获取到的所有来源名（包括 name 本身）
            const aliasSet = [];
            for (const n of sourceNames) {
                if (!aliasSet.includes(n)) aliasSet.push(n);
            }
            entry = {
                alias: aliasSet,
                id: this._nextMappingId(data),
                name: primaryKey,
                material: materialName,
                nameEn: "",
                type: type || "common"
            };
            data.push(entry);
        } else {
            // alias 追加：把所有 sourceNames 中尚未存在的名称补进去
            if (!Array.isArray(entry.alias)) entry.alias = [];
            for (const n of sourceNames) {
                if (!entry.alias.includes(n)) entry.alias.push(n);
            }
            // 材料列表追加：materialName 可能是 "1★,2★,3★" 三连串
            // 下游 backStats.resolveMaterialStars 按"每3个一组"切片，必须保持组结构
            // 说明（#12）：正常数据下 material 为"每组 3 个、多组互不重名"，任意两项材料名不会重合；
            // 若出现同名重合只可能是保存数据时出错（错误地保存了两个同名材料）。
            // 故此处保持组结构整体追加、不做逐项去重是正确行为。
            const existingMaterials = (entry.material || "")
                .split(",")
                .map(s => s.trim())
                .filter(s => s);
            const newMaterials = String(materialName)
                .split(",")
                .map(s => s.trim())
                .filter(s => s);
            // 若现有列表已包含新三连的全部材料名，视为重复，跳过
            const allContained = newMaterials.length > 0 && newMaterials.every(m => existingMaterials.includes(m));
            if (!allContained) {
                // 整体追加新三连（保持"前3个一组/后3个一组"的组结构）
                for (const m of newMaterials) {
                    if (!existingMaterials.includes(m)) existingMaterials.push(m);
                }
                entry.material = existingMaterials.join(",");
            }
            // 补全 id
            if (!entry.id) {
                entry.id = this._nextMappingId(data);
            }
            // 补全类型
            if (type && !entry.type) {
                entry.type = type;
            }
        }

        this._saveMappingData(data);
        log.info(`💾 WikiDataSaver: 已保存映射 ${materialName} → ${primaryKey} 到 Mapping.json`);
    },

    /**
     * 计算下一个 Mapping id：取现有最后一条 id 的数字部分 +1，保持 4 位补零格式
     * @param {Array} data - 当前 Mapping 数据
     * @returns {string} - 新的 id（如 "0052"）
     */
    _nextMappingId(data) {
        let maxNum = 0;
        for (const entry of data) {
            if (entry && entry.id) {
                const num = parseInt(String(entry.id).replace(/\D/g, ""), 10);
                if (!isNaN(num) && num > maxNum) {
                    maxNum = num;
                }
            }
        }
        return String(maxNum + 1).padStart(4, "0");
    },

    // ========== 私有文件 IO ==========

    _loadCharData() {
        if (!this._charDataLoaded) {
            try {
                this._charData = JSON.parse(file.readTextSync(this._charDataPath));
            } catch (e) { if (Utils.isCancellationError(e)) throw e;
                log.error(`WikiDataSaver: 读取 ${this._charDataPath} 失败: ${e.message}`);
                this._charData = [];
            }
            this._charDataLoaded = true;
        }
        return this._charData;
    },

    _loadWeaponData() {
        if (!this._weaponDataLoaded) {
            try {
                this._weaponData = JSON.parse(file.readTextSync(this._weaponDataPath));
            } catch (e) { if (Utils.isCancellationError(e)) throw e;
                log.error(`WikiDataSaver: 读取 ${this._weaponDataPath} 失败: ${e.message}`);
                this._weaponData = [];
            }
            this._weaponDataLoaded = true;
        }
        return this._weaponData;
    },

    _loadMappingData() {
        if (!this._mappingDataLoaded) {
            try {
                this._mappingData = JSON.parse(file.readTextSync(this._mappingDataPath));
            } catch (e) { if (Utils.isCancellationError(e)) throw e;
                log.error(`WikiDataSaver: 读取 ${this._mappingDataPath} 失败: ${e.message}`);
                this._mappingData = [];
            }
            this._mappingDataLoaded = true;
        }
        return this._mappingData;
    },

    _saveCharData(data) {
        try {
            file.writeTextSync(this._charDataPath, JSON.stringify(data, null, 4));
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            log.error(`WikiDataSaver: 保存 ${this._charDataPath} 失败: ${e.message}`);
        }
    },

    _saveWeaponData(data) {
        try {
            file.writeTextSync(this._weaponDataPath, JSON.stringify(data, null, 4));
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            log.error(`WikiDataSaver: 保存 ${this._weaponDataPath} 失败: ${e.message}`);
        }
    },

    _saveMappingData(data) {
        try {
            file.writeTextSync(this._mappingDataPath, JSON.stringify(data, null, 4));
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            log.error(`WikiDataSaver: 保存 ${this._mappingDataPath} 失败: ${e.message}`);
        }
    }
};