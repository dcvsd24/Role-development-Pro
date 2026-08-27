// Wiki 模式背包材料扫描
// 通过 CountInventoryItem API 查询背包材料数量（替代原图片模板匹配 + OCR 方案）
// 通过 data/Mapping.json 将怪物材料展开为 1/2/3 星并计算等效 3 星数量

// 通过 CountInventoryItem API 扫描背包中指定材料的数量
// materialSpec: {local, magic, weapons1, weapons2} 各字段为材料名，空字符串跳过
// 返回: {local: {name, count}, magic: {name, count}, weapons1: {name, count}, weapons2: {name, count}}
async function scanWikiBackpackMaterials(materialSpec) {
    const emptyResult = {
        local: { name: "", count: 0 },
        magic: { name: "", count: 0 },
        weapons1: { name: "", count: 0 },
        weapons2: { name: "", count: 0 }
    };

    try {
        if (!materialSpec || typeof materialSpec !== 'object') {
            log.warn("scanWikiBackpackMaterials: 入参 materialSpec 为空");
            return emptyResult;
        }

        const localName = (materialSpec.local || "").toString().trim();
        const magicName = (materialSpec.magic || "").toString().trim();
        const weapons1Name = (materialSpec.weapons1 || "").toString().trim();
        const weapons2Name = (materialSpec.weapons2 || "").toString().trim();

        log.info(`📌 Wiki 背包扫描入参: 地方特产=[${localName}], 敌人与魔物=[${magicName}], 武器材料1=[${weapons1Name}], 武器材料2=[${weapons2Name}]`);

        // 辅助函数：通过 data/Mapping.json 将单个怪物掉落材料名展开为 [1星, 2星, 3星] 三个材料名
        // Mapping.json 的 material 字段规则：按逗号分割，前 3 个为一组（1/2/3星），后 3 个为另一组（1/2/3星）
        // 根据入参材料名在数组中的位置确定所属组，返回该组的 3 个材料名
        const resolveMaterialStars = (materialName) => {
            if (!materialName) return null;
            try {
                const mappingContent = file.readTextSync("data/Mapping.json");
                const mappingArray = JSON.parse(mappingContent);
                for (const entry of mappingArray) {
                    if (!entry.material) continue;
                    const materials = entry.material.split(',').map(s => s.trim());
                    const idx = materials.indexOf(materialName);
                    if (idx === -1) continue;
                    // 判断属于前 3 个一组还是后 3 个一组
                    // 说明：groupStart 只取 0 或 3 是有意为之——同一怪物可能掉落两种不同材料，
                    // 而消费端只需要其中一种材料的三个星级名称，故按"每 3 个一组"取第一组或第二组；
                    // idx >= 6 的额外材料组不在本流程使用范围内，无需处理。
                    const groupStart = idx < 3 ? 0 : 3;
                    // 确保该组有 3 个材料
                    if (groupStart + 3 > materials.length) {
                        return materials.slice(groupStart);
                    }
                    return materials.slice(groupStart, groupStart + 3); // [1星, 2星, 3星]
                }
                return null;
            } catch (e) { if (Utils.isCancellationError(e)) throw e;
                log.warn(`读取 Mapping.json 失败: ${e.message}`);
                return null;
            }
        };

        // 记录每个怪物材料的 3 星级展开结果，用于扫描后计算等效 3 星数量
        const monsterStarMap = {}; // {原入参名: [star1Name, star2Name, star3Name]}
        // 入参支持三种形式：单个材料名 / 完整"1★,2★,3★"三连串 / 逗号分隔多名
        const expandMonster = (name) => {
            if (!name) return null;
            const names = String(name).split(',').map(s => s.trim()).filter(s => s);
            if (names.length === 0) return null;
            // 1) Mapping.json 优先：任一名称命中 3 星组即采用（保持双组怪的组结构）
            for (const n of names) {
                const stars = resolveMaterialStars(n);
                if (stars && stars.length === 3) {
                    monsterStarMap[name] = stars;
                    return stars;
                }
            }
            // 2) Mapping.json 未命中：入参本身即完整"1★,2★,3★"三连时直接采用
            //    （新材料首次运行时 Mapping.json 尚无条目，但配置 raw 字段已存完整三连）
            if (names.length === 3) {
                monsterStarMap[name] = names;
                return names;
            }
            // 3) 其余情况仅扫描入参材料本身
            monsterStarMap[name] = names;
            return names;
        };

        const magicStars = expandMonster(magicName);
        const weapons1Stars = expandMonster(weapons1Name);
        const weapons2Stars = expandMonster(weapons2Name);

        if (magicStars) log.info(`📌 敌人与魔物 [${magicName}] 展开为 3 星: ${magicStars.join(', ')}`);
        if (weapons1Stars) log.info(`📌 武器材料1 [${weapons1Name}] 展开为 3 星: ${weapons1Stars.join(', ')}`);
        if (weapons2Stars) log.info(`📌 武器材料2 [${weapons2Name}] 展开为 3 星: ${weapons2Stars.join(', ')}`);

        // 若所有材料名均为空，直接返回空结果，不查询
        if (!localName && !magicName && !weapons1Name && !weapons2Name) {
            log.info("📌 Wiki 背包扫描: 4 类材料名均为空，跳过扫描");
            return emptyResult;
        }

        // 通过 CountInventoryItem API 按 gridScreenName 分组批量查询
        // 地方特产 → Materials 标签；怪物材料（1/2/3星） → CharacterDevelopmentItems 标签
        const countDict = {};

        // 收集怪物材料的 1/2/3 星名称（去重），统一在养成道具页批量查询
        const monsterItemNames = [];
        const addMonsterStars = (stars) => {
            if (!stars) return;
            for (const starName of stars) {
                if (starName && !monsterItemNames.includes(starName)) {
                    monsterItemNames.push(starName);
                }
            }
        };
        addMonsterStars(magicStars);
        addMonsterStars(weapons1Stars);
        addMonsterStars(weapons2Stars);

        // 批量查询地方特产（Materials 标签）
        if (localName) {
            log.info(`📌 批量查询地方特产（Materials）: [${localName}]`);
            const localDict = await Utils.countInventoryItemBatch([localName], GridScreenName.Materials);
            for (const key in localDict) {
                if (Object.prototype.hasOwnProperty.call(localDict, key)) {
                    countDict[key] = localDict[key];
                }
            }
        }

        // 批量查询所有怪物材料（CharacterDevelopmentItems 标签，1 次 API 调用）
        if (monsterItemNames.length > 0) {
            log.info(`📌 批量查询怪物材料（CharacterDevelopmentItems）: [${monsterItemNames.join(', ')}]`);
            const monsterDict = await Utils.countInventoryItemBatch(monsterItemNames, GridScreenName.CharacterDevelopmentItems);
            for (const key in monsterDict) {
                if (Object.prototype.hasOwnProperty.call(monsterDict, key)) {
                    countDict[key] = monsterDict[key];
                }
            }
        }

        log.info(`📌 Wiki 背包扫描结果: ${JSON.stringify(countDict)}`);

        // 检查数字识别失败的材料（值为 -2），输出 warn 日志
        for (const name in countDict) {
            if (Object.prototype.hasOwnProperty.call(countDict, name) && countDict[name] === -2) {
                log.warn(`物品【${name}】找到但数字识别失败，按 0 处理`);
            }
        }

        // 辅助函数：按材料名从扫描结果中获取数量
        const findCount = (targetName) => {
            if (!targetName) return 0;
            const val = countDict[targetName];
            if (val === undefined || val === null) return 0;
            return val < 0 ? 0 : val;
        };

        // 辅助函数：计算怪物材料的等效 3 星数量
        // 合成规则：3个1星 = 1个2星，3个2星 = 1个3星
        // 等效3星 = 3星count + Math.floor((2星count + Math.floor(1星count / 3)) / 3)
        const computeEquivalentStar3 = (originalName) => {
            const stars = monsterStarMap[originalName];
            if (!stars || stars.length === 0) return 0;
            if (stars.length !== 3) {
                // Mapping.json 未命中的单名/多名兜底：数量直接求和
                return stars.reduce((sum, n) => sum + findCount(n), 0);
            }
            const [star1Name, star2Name, star3Name] = stars;
            const star1 = findCount(star1Name);
            const star2 = findCount(star2Name);
            const star3 = findCount(star3Name);
            const equivalent = star3 + Math.floor((star2 + Math.floor(star1 / 3)) / 3);
            log.info(`[${originalName}] 1星[${star1Name}]=${star1}, 2星[${star2Name}]=${star2}, 3星[${star3Name}]=${star3}, 等效3星=${equivalent}`);
            return equivalent;
        };

        const result = {
            local: { name: localName, count: findCount(localName) },
            magic: { name: magicName, count: computeEquivalentStar3(magicName) },
            weapons1: { name: weapons1Name, count: computeEquivalentStar3(weapons1Name) },
            weapons2: { name: weapons2Name, count: computeEquivalentStar3(weapons2Name) }
        };

        log.info(`✅ Wiki 背包扫描完成: 地方特产[${result.local.name}]=${result.local.count}, 敌人与魔物[${result.magic.name}]=${result.magic.count}(等效3星), 武器材料1[${result.weapons1.name}]=${result.weapons1.count}(等效3星), 武器材料2[${result.weapons2.name}]=${result.weapons2.count}(等效3星)`);

        return result;
    } catch (e) { if (Utils.isCancellationError(e)) throw e;
        log.error(`❌ Wiki 背包扫描失败: ${e.message}`);
        log.error(`堆栈: ${e.stack || '(无堆栈信息)'}`);
        return null;
    }
}
