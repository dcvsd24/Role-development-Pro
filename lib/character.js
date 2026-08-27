// 角色识别模块

// 解析 OCR 识别到的武器名称文本：按连续的非文字字符（非中文/字母/数字，含空格、全角空格、/、／、|、·等）
// 分割为纯文字段；段数≥2 时取第 2 段起全部拼接（第一个分隔符之后的全部文字），段数为 1 时取该段。
// 覆盖 "单手剑/试作斩岩"、"单手剑 / 试作斩岩"、"单手剑 /试作斩岩"、"单手剑|试作斩岩" 等变体 → 均解析为 "试作斩岩"
function parseWeaponNameFromOcr(rawText) {
    if (!rawText) return "";
    const segments = String(rawText).split(/[^\u4e00-\u9fa5\u3400-\u4dbfa-zA-Z0-9]+/).filter(s => s.length > 0);
    if (segments.length === 0) return "";
    if (segments.length === 1) return segments[0];
    return segments.slice(1).join("");
}

// 武器名称去符号清洗：仅保留中文（含扩展A区）、英文字母、数字，移除其余符号与空白
function cleanWeaponNameForMatch(name) {
    return String(name || "").replace(/[^\u4e00-\u9fa5\u3400-\u4dbfa-zA-Z0-9]/g, "");
}

// 从 Weapons_data.json 获取武器星级（按名称匹配「star rating」，未找到返回 null）
// 用于武器名称校验不匹配时，用配置武器的星级替换识别到的（装备武器的）星级
function getWeaponStarFromLocalData(weaponName) {
    const name = String(weaponName || "").trim();
    if (!name) return null;
    try {
        const weapons = JSON.parse(file.readTextSync("data/Weapons_data.json"));
        if (!Array.isArray(weapons)) return null;
        const cleanName = cleanWeaponNameForMatch(name);
        const target = weapons.find(w => (w && w["weapon"] ? String(w["weapon"]).trim() : "") === name)
            || weapons.find(w => (w && w["weapon"] ? cleanWeaponNameForMatch(w["weapon"]) : "") === cleanName);
        if (!target) return null;
        const star = target["star rating"] ? String(target["star rating"]).trim() : "";
        return star || null;
    } catch (e) { if (Utils.isCancellationError(e)) throw e;
        log.warn(`读取 Weapons_data.json 失败：${e.message}`);
        return null;
    }
}

var Character = {
    // 加载角色数据
    loadAvatarData: async function() {
        try {
            const json = file.readTextSync(Constants.avatarDataPath);
            const data = JSON.parse(json);
            const aliasMap = {};
            const elementMap = {};
            data.forEach(char => {
                aliasMap[char.name] = char.name;
                char.alias.forEach(alias => aliasMap[alias] = char.name);
                if (char.element) {
                    elementMap[char.name] = char.element;
                }
            });
            return { aliasToNameMap: aliasMap, nameToElementMap: elementMap };
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            log.error(`加载角色数据失败: ${e}`);
            return { aliasToNameMap: {}, nameToElementMap: {} };
        }
    },
    
    // 选择元素
    selectElement: async function(element) {
        if (!element || element === "物") return;
        const elemIdx = Constants.elements.indexOf(element);
        const clickX = Math.round(787 + elemIdx * 57.5);
        await click(960, 45);
        await sleep(100);
        leftButtonDown();
        for (let j = 0; j < 10; j++) { moveMouseBy(15, 0); await sleep(10); }
        await sleep(500);
        leftButtonUp();
        await sleep(500);
        await click(clickX, 130);
        await sleep(500);
        await click(540, 45);
        await sleep(200);
    },
    
    // 选择角色
    selectCharacter: async function(name, region, aliasMap) {
        const MAX_ITER = 200;           // 安全上限：防止起点角色始终识别不到导致死循环
        const FIRST_CHAR_MAX_ROUND = 3; // 起点角色出现次数上限（即遍历角色库轮数）
        let firstName = null;           // 循环中识别到的第一个角色名（循环起点角色）
        let firstNameCount = 0;         // 起点角色出现次数（爆发组计数）
        let lastFirstSeenAt = 0;        // 上次识别到起点角色的时间戳（1 秒内重复不计）

        for (let i = 0; i < MAX_ITER; i++) {
            const res = await OcrHelper.recognizeText(name, region, aliasMap);
            if (res && res.matched) return res.text;   // 找到目标角色

            // 未匹配目标：用识别到的当前角色名做循环轮数计数
            const currentName = (res && !res.matched && res.text) ? res.text : null;
            if (currentName) {
                const now = Date.now();
                if (firstName === null) {
                    // 暂存第一个识别到的角色名作为循环起点
                    firstName = currentName;
                    firstNameCount = 1;
                    lastFirstSeenAt = now;
                    log.info(`📌 记录循环起点角色：${firstName}`);
                } else if (currentName === firstName) {
                    // 爆发组链式合并：与上次匹配间隔 <1 秒（界面未切换/OCR重复）不计入；≥1 秒开启新一轮计数
                    if (now - lastFirstSeenAt >= 1000) {
                        firstNameCount++;
                        log.info(`📌 循环起点角色 [${firstName}] 已出现 ${firstNameCount} 次`);
                        if (firstNameCount >= FIRST_CHAR_MAX_ROUND) {
                            log.warn(`已遍历角色库 ${FIRST_CHAR_MAX_ROUND} 轮仍未找到角色：${name}，结束查找`);
                            return "";
                        }
                    }
                    lastFirstSeenAt = now;
                }
            }

            await click(1840, 540);
            await sleep(200);
        }
        log.warn(`未找到角色：${name}（已达安全迭代上限 ${MAX_ITER} 次）`);
        return "";
    },
    
    // 提取魔物名称
    extractMonsterNames: function(textList) {
        const monsterNames = [];
        const regex = /(\d+)级以上([^，。\s]+)[:：]?[^\n]*掉落/;
        
        textList.forEach(text => {
            const match = text.match(regex);
            if (match && match[2] && !monsterNames.includes(match[2])) {
                let cleanName = match[2]
                    .replace(/少量|活化状态下|大量|少许|枯焦状态下/g, '')
                    .replace(/[^\u4e00-\u9fa50-9·]/g, '')
                    .trim();
                if (cleanName && !monsterNames.includes(cleanName)) {
                    monsterNames.push(cleanName);
                }
            }
        });
        
        return monsterNames;
    },
    
    // 识别魔物名称和材料数量
    identifyMonsterAndMaterials: async function() {
        const result = { monsterNames: [], star1: 0, star2: 0, star3: 0 };
        try {
            const monsterCheckTextList = await Utils.ocrRecognizeWithRetry(Constants.ocrRegions.monsterCheck.x, Constants.ocrRegions.monsterCheck.y, Constants.ocrRegions.monsterCheck.width, Constants.ocrRegions.monsterCheck.height, "识别掉落", 200, 20, true);
            
            const items = [];
            for (const item of monsterCheckTextList) {
                if (item.text && item.text.includes("掉落")) {
                    items.push({x: Math.round(item.x + item.width / 2), y: Math.round(item.y + item.height / 2)});
                }
            }
            
            if (items && items.length > 0) {
                await click(items[0].x, items[0].y);
                await sleep(2000);
            } else {
                log.warn("未识别到'掉落'");
            }
            
            for (let i = 0; i < 4; i++) {
                await click(48, 444);
                await sleep(300);
            }
            
            await click(960, 540); await sleep(1000);
            await click(1566, 736); await sleep(1000);
            
            let star1Coords = { x: 0, y: 0 };
            const probTextList = await Utils.ocrRecognizeWithRetry(
                Constants.ocrRegions.probabilityGet.x,
                Constants.ocrRegions.probabilityGet.y,
                Constants.ocrRegions.probabilityGet.width,
                Constants.ocrRegions.probabilityGet.height,
                "识别概率获得",
                200,
                20,
                true
            );
            
            const filteredList = (probTextList || []).filter(item => item.text && item.text.includes("概率获得"));
            
            if (filteredList && filteredList.length > 0) {
                const centerX = Math.round(filteredList[0].x + filteredList[0].width / 2);
                const centerY = Math.round(filteredList[0].y + filteredList[0].height / 2);
                star1Coords = { x: centerX + 270, y: centerY + 77 };
                await click(star1Coords.x, star1Coords.y);
                await sleep(800);
            } else {
                log.warn("未识别到'概率获得'");
            }
            
            const star1TextList = await Utils.ocrRecognizeWithRetry(Constants.ocrRegions.star1MaterialCount.x, Constants.ocrRegions.star1MaterialCount.y, Constants.ocrRegions.star1MaterialCount.width, Constants.ocrRegions.star1MaterialCount.height, "一星武器材料数量", 200, 20, false);
            result.star1 = Utils.extractNumber(star1TextList, "当前拥有");
            keyPress("VK_ESCAPE");
            await sleep(1000);
            
            if (star1Coords.x > 0) {
                await click(star1Coords.x - 180, star1Coords.y);
                await sleep(800);
                
                moveMouseTo(970, 428);
                await sleep(100);
                leftButtonDown();
                const steps = 10;
                const stepDist = -9;
                for (let k = 0; k < steps; k++) {
                    moveMouseBy(0, stepDist);
                    await sleep(10);
                }
                await sleep(500);
                leftButtonUp();
                await sleep(800);
                
                const monsterTextList = await Utils.ocrRecognizeWithRetry(
                    Constants.ocrRegions.monsterMaterialDesc.x,
                    Constants.ocrRegions.monsterMaterialDesc.y,
                    Constants.ocrRegions.monsterMaterialDesc.width,
                    Constants.ocrRegions.monsterMaterialDesc.height,
                    "武器魔物材料描述"
                );
                const monsterNames = this.extractMonsterNames(monsterTextList);
                result.monsterNames = monsterNames;
                log.info(`识别到武器材料魔物名称: ${monsterNames.join(", ")}`);
                
                const star1 = Number(result.star1) || 0;
                const star1MultipleOf3 = Math.floor(star1 / 3) * 3;
                const synthesizableCount = Utils.extractNumber(monsterTextList, "可合成数量") || 0;
                result.star2 = Math.round(synthesizableCount * 3 - star1MultipleOf3 / 3);
                result.star3 = Utils.extractNumber(monsterTextList, "当前拥有");
            }

            keyPress("VK_ESCAPE");
            await sleep(900);
            await click(1709, 1011);
            log.info("点击停止追踪...");
            await sleep(1500);
            for (let i = 0; i < 2; i++) {
                keyPress("VK_ESCAPE");
                await sleep(1000);
            }
            
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            log.error(`武器魔物材料识别失败: ${e.message}`);
        }
        return result;
    },
    
    // 检查命座加成
    // 返回值：0=无加成，1=天赋等级+1，3=天赋等级+3
    checkConstellationBonus: async function(talentName) {
        try {
            const ocr = RecognitionObject.ocr(28, 270, 155, 49);
            const capture = captureGameRegion();
            const resList = capture.findMulti(ocr);
            let bonusValue = 0;
            const allTexts = [];

            for (let i = 0; i < resList.Count; i++) {
                if (resList[i] && resList[i].text) {
                    const text = resList[i].text.trim();
                    allTexts.push(text);
                    // 精确匹配天赋等级+3 或 等级+3
                    if (text.includes("天赋等级+3") || text.includes("等级+3")) {
                        bonusValue = 3;
                        break;
                    }
                    // 精确匹配天赋等级+1 或 等级+1
                    if (text.includes("天赋等级+1") || text.includes("等级+1")) {
                        bonusValue = 1;
                        break;
                    }
                }
                if (resList[i] && resList[i].Dispose) resList[i].Dispose();
            }

            log.info(`${talentName}命座加成识别文本：${allTexts.join(" | ")}`);
            keyPress("VK_ESCAPE");
            await sleep(1000);
            capture.dispose();

            // 模糊匹配
            if (bonusValue === 0 && allTexts.length > 0) {
                for (const text of allTexts) {
                    if (text.includes("+3") && (text.includes("天赋") || text.includes("等级"))) {
                        bonusValue = 3;
                        log.info(`模糊匹配到${talentName}命座加成 +3`);
                        break;
                    }
                    if (text.includes("+1") && (text.includes("天赋") || text.includes("等级"))) {
                        bonusValue = 1;
                        log.info(`模糊匹配到${talentName}命座加成 +1`);
                        break;
                    }
                }
            }

            return bonusValue;
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            log.error(`检查${talentName}命座加成出错：${e.message || e}`);
            return 0;
        }
    },
    
    // 查找角色并返回角色信息
    findCharacter: async function() {
        try {
            log.info("📌 校准并返回游戏主界面...");
            setGameMetrics(1920, 1080, Utils.getScreenDpiScale());
            await genshin.returnMainUi();
            await sleep(1500);
            log.info("✅ 游戏主界面已加载");
            
            const targetName = settings.Character ? settings.Character.trim() : "";
            
            const { aliasToNameMap, nameToElementMap } = await this.loadAvatarData();
            const standardName = aliasToNameMap[targetName] || targetName;
            const targetElement = nameToElementMap[standardName] || "";
            
            log.info("尝试按下C键打开角色页面...");
            keyPress("VK_C");
            await sleep(1000);
            
            let isCharacterPageOpen = false;
            for (let verifyCount = 0; verifyCount < 1; verifyCount++) {
                const pageTextList = await Utils.ocrRecognizeWithRetry(200, 990, 110, 37, "验证角色页面");
                const pageText = pageTextList && pageTextList.length > 0 ? pageTextList[0] : "";
                
                if (pageText.includes("指南") || pageText.includes("提升")) {
                    log.info("已成功进入角色页面");
                    isCharacterPageOpen = true;
                    break;
                } else {
                    log.warn(`第${verifyCount + 1}次验证：未识别到角色页面标志，当前识别文本：${pageText}`);
                    if (verifyCount < 2) {
                        keyPress("VK_ESCAPE");
                        await sleep(500);
                        await genshin.returnMainUi();
                        await sleep(500);
                        keyPress("VK_C");
                        await sleep(1500);
                    }
                }
            }
            
            if (!isCharacterPageOpen) {
                log.warn("无法进入角色页面，已验证3次，可能处于剧情中");
                log.info("启动剧情跳过任务...");
                dispatcher.addTimer(new RealtimeTimer("AutoSkip"));
                log.info("剧情任务已启动，等待15秒...");
                
                log.info("再次尝试打开角色页面...");
                await genshin.returnMainUi();
                await sleep(1400);
                dispatcher.clearAllTriggers();
                log.info("剧情任务已清理");
                await sleep(1000);
                keyPress("VK_C");
                await sleep(1500);
                
                const pageTextList = await Utils.ocrRecognizeWithRetry(200, 990, 110, 37, "验证角色页面");
                const pageText = pageTextList && pageTextList.length > 0 ? pageTextList[0] : "";
                
                if (pageText.includes("指南") || pageText.includes("提升")) {
                    log.info("已成功进入角色页面");
                    isCharacterPageOpen = true;
                } else {
                    log.error("无法进入角色页面，剧情跳过后仍失败");
                    return false;
                }
            }
            
            log.info(`查找目标角色：${targetName}（${targetElement}）`);
            
            const checkCharacter = async (x, y) => {
                click(x, y);
                await sleep(800);

                const recogName = await this.selectCharacter(targetName, Constants.ocrRegions.checkChar, aliasToNameMap);
                log.info(`检测到角色：${recogName}（坐标：${x},${y}）`);
                if (!recogName) return false;
                
                setGameMetrics(1920, 1080, Utils.getScreenDpiScale());
                
                let characterLevel = 0;
                try {
                    const levelRegion = { x: 1463, y: 204, width: 109, height: 37 };
                    const levelOcr = RecognitionObject.ocr(levelRegion.x, levelRegion.y, levelRegion.width, levelRegion.height);
                    const capture = captureGameRegion();
                    const resList = capture.findMulti(levelOcr);
                    
                    if (resList && resList.Count > 0) {
                        const levelText = resList[0].text || "";
                        const levelMatch = levelText.match(/等级(\d+)/);
                        if (levelMatch) {
                            characterLevel = parseInt(levelMatch[1], 10);
                            log.info(`识别到角色等级：${characterLevel}`);
                        } else {
                            const numMatch = levelText.match(/(\d+)/);
                            if (numMatch) {
                                characterLevel = parseInt(numMatch[1], 10);
                                log.info(`识别到角色等级：${characterLevel}`);
                            }
                        }
                    }
                    capture.dispose();
                } catch (e) { if (Utils.isCancellationError(e)) throw e;
                    log.warn(`角色等级识别失败：${e.message}`);
                }
                
                return {
                    found: true,
                    characterLevel: characterLevel
                };
            };
            
            const pureElement = targetElement.replace("元素", "").trim();
            log.info(`筛选元素：${pureElement}`);
            await this.selectElement(pureElement);
            
            log.info("从第一个角色开始遍历...");

            // 从第一个角色开始点击，通过角色切换循环（1840,540）逐个遍历，最后一个之后会回到第一个角色
            // selectCharacter 内部基于起点角色计数自动终止，无需外部循环
            const result = await checkCharacter(618, 175);
            if (result && result.found) {
                return result;
            }
            
            log.warn(`未找到目标角色：${targetName}，使用默认值继续执行`);
            notification.send(`未找到目标角色：${targetName}，使用默认值继续执行`);
            return {
                found: false,
                characterLevel: 1,
                characterBreak: "1级未突破",
                talentLevels: [1, 1, 1],
                weaponLevel: "1级未突破",
                weaponStar: "五星",
                moraAmount: 0
            };
            
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            // 异常属于异常情形，不属于「角色未找到」：向上传播，
            // 避免被当作未找到而把默认等级写入 config.json / 识别缓存
            log.error(`查找角色异常：${e.message}`);
            throw e;
        }
    },
    
    // 识别武器信息
    recognizeWeapon: async function(recognitionType = "weapon") {
        try {
            log.info("📌 开始识别武器信息...");
            
            let weaponStar = "未知星级";
            let weaponLevel = "";
            let moraAmount = 0;
            let useBackupRegion = false;
            
            click(962, 612);
            await sleep(800);
            click(181, 223);
            log.info("点击武器...");
            await sleep(800);
            
            try {
                const starCount = await Utils.retryTask(async () => {
                    const capture = captureGameRegion(Constants.starCaptureRegion.X, Constants.starCaptureRegion.Y, Constants.starCaptureRegion.Width, Constants.starCaptureRegion.Height);
                    const template = file.readImageMatSync(Constants.starTemplatePath);
                    if (!template) throw new Error("模板加载失败");
                    
                    const matchObj = RecognitionObject.TemplateMatch(template);
                    const matches = capture.FindMulti(matchObj);
                    const count = matches && matches.Count ? matches.Count : 0;
                    
                    for (let i = 0; i < (matches && matches.Count ? matches.Count : 0); i++) {
                        if (matches[i] && matches[i].Dispose) matches[i].Dispose();
                    }
                    capture.Dispose();
                    template.Dispose();
                    return count;
                }, "武器星级模板匹配");
                
                weaponStar = starCount === 1 ? "一星" : 
                             starCount === 3 ? "三星" : 
                             starCount === 4 ? "四星" : 
                             starCount === 5 ? "五星" : 
                             "0";
            } catch (e) { if (Utils.isCancellationError(e)) throw e;
                log.error(`武器星级识别异常：${e.message}`);
                weaponStar = "0";
            }
            log.info(`武器星级：${weaponStar}`);
            
            let isWeaponMaxLevel = false;
            
            // 点击强化或突破进入武器详情页并识别摩拉（两种星级分支共用）
            click(1721, 1007);
            log.info("点击强化或突破进入武器...");
            await sleep(1800);
            
            moraAmount = await this.recognizeMora();
            
            // ===== 武器名称校验：防止把当前佩戴的其他武器等级/星级误当作培养武器 =====
            // 未配置武器名时跳过校验；名称不匹配时按最低等级 1 级计算培养材料，
            // 且星级改用配置武器在 Weapons_data.json 中的星级（识别到的是装备武器的星级）
            let weaponNameMatched = null; // null=跳过校验, true=匹配成功, false=匹配失败
            const configuredWeaponName = (settings.weaponName || "").trim();
            if (!configuredWeaponName) {
                log.info("💡 未配置武器名称，跳过武器名称校验");
            } else {
                const rawNameText = await Utils.retryTask(() => {
                    const region = RecognitionObject.ocr(Constants.ocrRegions.weaponName.x, Constants.ocrRegions.weaponName.y, Constants.ocrRegions.weaponName.width, Constants.ocrRegions.weaponName.height);
                    const capture = captureGameRegion();
                    const res = capture.find(region);
                    const text = (res.text || "").trim();
                    capture.dispose();
                    return text;
                }, "武器名称");
                
                const extractedName = parseWeaponNameFromOcr(rawNameText);
                const cleanedConfiguredName = cleanWeaponNameForMatch(configuredWeaponName);
                
                if (extractedName && Utils.fuzzyMatch(extractedName, [cleanedConfiguredName])) {
                    weaponNameMatched = true;
                    log.info(`✅ 武器名称校验通过（识别：${extractedName}，配置：${cleanedConfiguredName}），按识别等级进行培养计算`);
                } else {
                    weaponNameMatched = false;
                    log.warn(`⚠️ 武器名称不匹配（OCR原文：${rawNameText || "无"}，提取名称：${extractedName || "无"}，配置培养武器：${cleanedConfiguredName}），按最低等级 1 级计算培养材料`);
                    weaponLevel = "1级未突破";
                    // 识别到的是装备武器的星级，装备≠配置时不可用：从 Weapons_data.json 取配置武器星级
                    const configuredStar = getWeaponStarFromLocalData(configuredWeaponName);
                    if (configuredStar) {
                        log.info(`✅ 已从 Weapons_data.json 获取配置武器【${configuredWeaponName}】星级：${configuredStar}（替换识别到的 ${weaponStar}）`);
                        weaponStar = configuredStar;
                    } else {
                        log.warn(`⚠️ Weapons_data.json 未找到武器【${configuredWeaponName}】的星级，保留识别到的星级 ${weaponStar}`);
                    }
                }
            }
            
            if (weaponStar === "一星" && weaponNameMatched !== false) {
                // 装备确为一星（名称校验通过或未配置名称）→ 无需培养；
                // 名称不匹配时（星级已修正或查不到数据保留原值）一律保持 1级未突破 走材料计算，不写「一星武器（跳过识别等级）」
                log.info("💡 一星武器无需培养，跳过武器等级识别");
                weaponLevel = "一星武器（跳过识别等级）";
                click(1847, 49);
                log.info("点击右上角返回键退出武器...");
                await sleep(1500);
            } else {
                if (weaponNameMatched !== false) {
                    const levelText1 = await Utils.retryTask(() => {
                        const region = RecognitionObject.ocr(Constants.ocrRegions.weaponLevel1.x, Constants.ocrRegions.weaponLevel1.y, Constants.ocrRegions.weaponLevel1.width, Constants.ocrRegions.weaponLevel1.height);
                        const capture = captureGameRegion();
                        const res = capture.find(region);
                        const text = Utils.cleanText(res.text || "");
                        capture.dispose();
                        return text;
                    }, "武器等级（区域1）");
                    
                    if (levelText1) {
                        const match = levelText1.match(/等级(\d+)|(\d+)级/);
                        weaponLevel = match ? `${match[1] || match[2]}级未突破` : "";
                    }
                    
                    if (!weaponLevel) {
                        click(1529, 1017);//打开突破素材预览。
                        await sleep(1000);
                        const levelText2 = await Utils.retryTask(() => {
                            const region = RecognitionObject.ocr(Constants.ocrRegions.weaponLevel2.x, Constants.ocrRegions.weaponLevel2.y, Constants.ocrRegions.weaponLevel2.width, Constants.ocrRegions.weaponLevel2.height);
                            const capture = captureGameRegion();
                            const res = capture.find(region);
                            const text = Utils.cleanText(res.text || "");
                            capture.dispose();
                            return text;
                        }, "武器等级（区域2）");
                        
                        if (levelText2) {
                            const match = levelText2.match(/提升到(\d+)级|等级(\d+)|(\d+)级/);
                            const tempLevel = match ? `${match[1] || match[2] || match[3]}级未突破` : "";
                            
                            if (tempLevel) {
                                weaponLevel = tempLevel;
                                log.info(`备用区域识别到武器等级：${tempLevel}`);
                            }
                        
                            await sleep(1000);
                            click(1350, 302);
                            await sleep(1000);
                            click(1350, 302);
                            log.info("退出武器材料详情页面...");
                            await sleep(1000);
                        }
                    }
                    
                    if (!weaponLevel) {
                        weaponLevel = "90级已突破（满级）";
                        isWeaponMaxLevel = true;
                        log.info("💡 武器等级识别失败，判定为90级满级，跳过魔物材料识别");
                        
                        moraAmount = await this.recognizeMora();
                    }
                }
                
                log.info(`武器突破等级：${weaponLevel}`);
                await sleep(900);
                keyPress("VK_ESCAPE");
                log.info("退出武器页面...");
                await sleep(1500);
            }
            
            if (weaponStar === "一星") {
                log.info(`武器突破等级：${weaponLevel}`);
            }
            
            return {
                weaponStar: weaponStar,
                weaponLevel: weaponLevel,
                moraAmount: moraAmount
            };
            
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            log.error(`武器识别异常：${e.message}`);
            return {
                weaponStar: "未知星级",
                weaponLevel: "",
                moraAmount: 0
            };
        }
    },
    
    // 识别摩拉数量
    // 返回值：大于零的纯数字（识别正确），0 表示识别失败或非纯数字
    recognizeMora: async function() {
        try {
            const moraRegion = { x: 1618, y: 33, width: 165, height: 28 };
            const moraTextList = await Utils.ocrRecognize(moraRegion.x, moraRegion.y, moraRegion.width, moraRegion.height);

            let moraAmount = 0;
            if (moraTextList && moraTextList.length > 0) {
                const moraText = (moraTextList[0] || "").trim();
                // 摩拉数量必须是大于零的纯数字，非纯数字视为识别错误
                if (moraText && /^\d+$/.test(moraText)) {
                    moraAmount = parseInt(moraText, 10);
                    if (!isNaN(moraAmount) && moraAmount > 0) {
                        log.info(`识别到摩拉数量：${moraAmount}`);
                    } else {
                        log.warn(`摩拉数量识别异常：解析值为 ${moraAmount}（非大于零），视为识别错误`);
                        moraAmount = 0;
                    }
                } else {
                    log.warn(`摩拉数量识别异常：文本"${moraText}"非纯数字，视为识别错误`);
                    moraAmount = 0;
                }
            }
            return moraAmount;
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            log.warn(`摩拉数量识别失败：${e.message}`);
            return 0;
        }
    },
    
    // 识别天赋信息
    recognizeTalent: async function() {
        try {
            log.info("📌 开始识别天赋信息...");
            await sleep(1000);
            click(189, 431);
            await sleep(1000);
            
            const talentNormal = await OcrHelper.getTalentLevel(Constants.ocrRegions.talentNormal, "普通攻击");
            const talentSkill = await OcrHelper.getTalentLevel(Constants.ocrRegions.talentSkill, "元素战技");
            let talentBurst = await OcrHelper.getTalentLevel(Constants.ocrRegions.talentBurst, "元素爆发");
            if (!talentBurst) talentBurst = await OcrHelper.getTalentLevel(Constants.ocrRegions.talentBurstBackup, "元素爆发（备用）");
            
            const talentLevels = [
                talentNormal || 1,
                talentSkill || 1,
                talentBurst || 1
            ];
            log.info(`等级识别完成：普攻=${talentLevels[0]} 级, 战技=${talentLevels[1]} 级, 爆发=${talentLevels[2]} 级`);
            
            log.info("开始识别命座加成...");
            
            const talentPositions = {
                skill: { x: 1760, y: 260, name: "战技" },
                burst: { x: 1760, y: 348, name: "爆发" },
                burstBackup: { x: 1760, y: 441, name: "爆发(备用)" }
            };
            
            if (talentLevels[1] > 3) {
                log.info("检查元素战技命座加成...");
                await click(talentPositions.skill.x, talentPositions.skill.y);
                await sleep(1000);
                const skillBonus = await this.checkConstellationBonus("元素战技");
                if (skillBonus > 0) {
                    talentLevels[1] = Math.max(1, talentLevels[1] - skillBonus);
                    log.info(`元素战技命座加成修正后等级：${talentLevels[1]} 级`);
                    await click(1085, 381);
                    await sleep(800);
                }
            }
            
            if (talentLevels[2] > 3) {
                log.info("检查元素爆发命座加成...");
                let burstBonus = 0;

                if (talentBurst === await OcrHelper.getTalentLevel(Constants.ocrRegions.talentBurst, "元素爆发")) {
                    await click(talentPositions.burst.x, talentPositions.burst.y);
                    await sleep(1000);
                    burstBonus = await this.checkConstellationBonus("元素爆发(常规)");
                } else {
                    await click(talentPositions.burstBackup.x, talentPositions.burstBackup.y);
                    await sleep(1000);
                    burstBonus = await this.checkConstellationBonus("元素爆发(备用)");
                }

                if (burstBonus > 0) {
                    talentLevels[2] = Math.max(1, talentLevels[2] - burstBonus);
                    log.info(`元素爆发命座加成修正后等级：${talentLevels[2]} 级`);
                }
            }
            
            const finalTalentLevels = `${talentLevels[0]}-${talentLevels[1]}-${talentLevels[2]}`;
            log.info(`最终天赋等级：${finalTalentLevels}`);
            
            return {
                talentLevels: talentLevels,
                finalTalentLevels: finalTalentLevels
            };
            
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            log.error(`天赋识别异常：${e.message}`);
            return {
                talentLevels: [1, 1, 1],
                finalTalentLevels: "1-1-1"
            };
        }
    },
    // 识别秘境名称工具
    recognizeDomainName: async function(materialType = "domain") {
        try {
            log.info("📌 开始识别秘境名称...");
            
            if (materialType === "talent_name") {
                log.info("材料类型为天赋名称，识别区域文字...");
                
                const talentTextList = await Utils.ocrRecognizeWithRetry(716, 181, 283, 159, "识别天赋名称区域", 200, 20);
                
                if (!talentTextList || talentTextList.length === 0) {
                    log.warn("未识别到天赋名称区域文字");
                    return "";
                }
                
                const fullText = talentTextList.join("");
                log.info(`识别到的完整文字：${fullText}`);
                
                const bracketMatch = fullText.match(/「(.+?)」/);
                if (!bracketMatch || !bracketMatch[1]) {
                    log.warn("未找到「」包裹的文字");
                    return "";
                }
                
                const talentName = bracketMatch[1];
                log.info(`提取到天赋名称：${talentName}`);
                await sleep(800);
                await click(1358, 408);
                await sleep(800);
                await click(1358, 408);
                await sleep(500);
                return talentName;
            }
            
            if (materialType === "weapon_domain") {
                log.info("材料类型为武器秘境名称，识别区域文字...");
                
                const weaponTextList = await Utils.ocrRecognizeWithRetry(716, 85, 314, 290, "识别武器秘境名称区域", 200, 20);
                
                if (!weaponTextList || weaponTextList.length === 0) {
                    log.warn("未识别到武器秘境名称区域文字");
                    return "";
                }
                
                const fullText = weaponTextList.join("");
                log.info(`识别到的完整文字：${fullText}`);
                
                const deIndex = fullText.indexOf('的');
                const zhiIndex = fullText.indexOf('之');
                
                let endIndex = -1;
                if (deIndex !== -1 && zhiIndex !== -1) {
                    endIndex = Math.min(deIndex, zhiIndex);
                } else if (deIndex !== -1) {
                    endIndex = deIndex;
                } else if (zhiIndex !== -1) {
                    endIndex = zhiIndex;
                }
                
                if (endIndex === -1) {
                    log.warn("未找到'的'或'之'字符");
                    return "";
                }
                
                const startIndex = Math.max(0, endIndex - 4);
                const weaponDomainName = fullText.substring(startIndex, endIndex);
                log.info(`提取到武器秘境名称：${weaponDomainName}`);
                await sleep(800);
                await click(1345, 300);
                await sleep(800);

                return weaponDomainName;
            }
            
            moveMouseTo(970, 428);
            await sleep(100);
            leftButtonDown();
            const steps = 10;
            const stepDist = -9;
            for (let k = 0; k < steps; k++) {
                moveMouseBy(0, stepDist);
                await sleep(10);
            }
            await sleep(500);
            leftButtonUp();
            await sleep(800);
            
            let domainName = "";
            let clickOffset = 0;
            
            const ownershipTextList = await Utils.ocrRecognizeWithRetry(742, 834, 398, 196, "识别当前拥有", 200, 20, true);
            
            if (!ownershipTextList || ownershipTextList.length === 0) {
                log.warn("未识别到'当前拥有'文字，超时返回");
                return "";
            }
            
            const ownershipText = ownershipTextList.find(item => item.text.includes("当前拥有"));
            if (!ownershipText) {
                log.warn("未找到包含'当前拥有'的文字");
                return "";
            }
            
            log.info(`识别到文字：${ownershipText.text}`);
            
            clickOffset = 69;
            log.info("材料类型为Boss，偏移量：69");
            
            const clickX = ownershipText.x;
            const clickY = ownershipText.y - clickOffset;
            await click(clickX, clickY);
            await sleep(800);
            
            const nameTextList = await Utils.ocrRecognizeWithRetry(1485, 17, 340, 37, "识别Boss名称", 200, 20);
            
            if (nameTextList && nameTextList.length > 0) {
                domainName = nameTextList[0].trim();
                log.info(`识别到Boss名称：${domainName}`);
            } else {
                log.warn("未识别到Boss名称");
            }
            
            await click(1866, 42);
            await sleep(1500);
            await click(1866, 42);
            await sleep(2500);
            
            if (materialType === "boss" && domainName === "「冰风组曲」") {
                log.info("识别到Boss名称为冰风组曲，开始识别附加文字...");
                const additionalTextList = await Utils.ocrRecognizeWithRetry(965, 222, 169, 47, "识别冰风组曲附加文字", 200, 20);
                
                if (additionalTextList && additionalTextList.length > 0) {
                    const additionalText = additionalTextList[0].trim();
                    log.info(`识别到附加文字：${additionalText}`);
                    domainName = domainName + additionalText;
                    log.info(`组合后的名称：${domainName}`);
                } else {
                    log.warn("未识别到附加文字");
                }
            }
            
            await click(1358, 408);
            await sleep(500);
            
            return domainName;
            
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            log.error(`识别秘境名称异常：${e.message}`);
            return "";
        }
    },
    
    // 查询天赋秘境
    queryTalentDomain: async function(talentLevels) {
        try {
            log.info("📌 开始查询天赋秘境...");
            
            const allMaxLevel = talentLevels.every(level => level >= 10);
            if (allMaxLevel) {
                log.info("所有天赋等级均为10级，跳过天赋秘境检查");
                return "";
            }
            
            const minLevel = Math.min(...talentLevels);
            let selectedTalentIndex = -1;
            
            for (let i = 0; i < talentLevels.length; i++) {
                if (talentLevels[i] === minLevel) {
                    selectedTalentIndex = i;
                    break;
                }
            }
            
            if (selectedTalentIndex === -1) {
                log.warn("无法选择天赋");
                return "";
            }
            
            const talentPositions = [
                { x: 1760, y: 170, name: "普通攻击" },
                { x: 1760, y: 260, name: "战技" },
                { x: 1760, y: 348, name: "爆发" },
                { x: 1760, y: 441, name: "爆发(备用)" }
            ];
            
            let clickPosition;
            if (selectedTalentIndex === 2) {
                const talentBurst = await OcrHelper.getTalentLevel(Constants.ocrRegions.talentBurst, "元素爆发");
                if (talentBurst) {
                    clickPosition = talentPositions[2];
                    log.info(`选择元素爆发（常规位置）：${clickPosition.name}`);
                } else {
                    clickPosition = talentPositions[3];
                    log.info(`选择元素爆发（备用位置）：${clickPosition.name}`);
                }
            } else {
                clickPosition = talentPositions[selectedTalentIndex];
                log.info(`选择天赋：${clickPosition.name}，等级：${talentLevels[selectedTalentIndex]}`);
            }
            
            await click(clickPosition.x, clickPosition.y);
            await sleep(800);
            
            const materialClickX = talentLevels[selectedTalentIndex] >= 9 ? 137 : 214;
            await click(materialClickX, 911);
            await sleep(1000);
            
            const domainName = await this.recognizeDomainName("talent_name");
            await sleep(1000);
            await click(656, 577);
            await sleep(1500);
            if (domainName) {
                log.info(`✅ 获取到天赋秘境名称：${domainName}`);
            } else {
                log.info("未获取到天赋秘境名称");
            }
            
            return domainName;
            
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            log.error(`查询天赋秘境异常：${e.message}`);
            return "";
        }
    },
    
    // 识别角色突破信息
    recognizeCharacterBreak: async function(talentInfo = null, recognitionType = "break") {
        try {
            log.info("📌 开始识别角色突破信息...");
            
            await sleep(1000);
            click(170, 152);
            await sleep(1000);
            click(1779, 190);
            await sleep(1000);
            
            const breakStatusList = await Utils.ocrRecognizeWithRetry(
                Constants.ocrRegions.breakStatus.x,
                Constants.ocrRegions.breakStatus.y,
                Constants.ocrRegions.breakStatus.width,
                Constants.ocrRegions.breakStatus.height,
                "角色突破状态"
            );
            const breakStatus = breakStatusList && breakStatusList.length > 0 ? breakStatusList[0] : "";
            
            let breakResult = "未知突破状态";
            if (breakStatus.includes("已突破")) {
                breakResult = "90级已突破";
            } else {
                const levelMatch = breakStatus.match(/(\d+)级/);
                if (levelMatch) {
                    const level = `${levelMatch[1]}级未突破`;
                    breakResult = ["20", "40", "50", "60", "70", "80"].includes(levelMatch[1]) ? level : `${level}（非标准等级）`;
                } else {
                    breakResult = `无法识别（${breakStatus}）`;
                }
            }
            log.info(`角色突破状态：${breakResult}`);
            
            await sleep(700);
            log.info("已退出突破预览");
            
            return {
                breakResult: breakResult
            };
            
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            log.error(`角色突破识别异常：${e.message}`);
            return {
                breakResult: "未知突破状态"
            };
        }
    },
    
    // 主函数：查找角色并获取等级（支持按需识别）
    findCharacterAndGetLevel: async function(recognitionType = "all") {
        try {
            log.info(`📌 开始角色识别流程（识别类型：${recognitionType}）...`);
            
            let characterInfo = null;
            let weaponInfo = null;
            let talentInfo = null;
            let breakInfo = null;
            
            if (recognitionType === "all" || recognitionType === "weapon" || recognitionType === "break") {
                characterInfo = await this.findCharacter();
                if (!characterInfo.found) {
                    // 角色未找到（已遍历角色库 3 轮）= 未获取该角色：默认等级即正确数据，允许写入配置，
                    // 供材料计算使用（等级 1 / 1级未突破 / 五星）；异常路径则已由 findCharacter 向上抛出
                    log.warn("⚠️ 角色未找到，进入武器页面识别摩拉数量");

                    // 从角色页面导航至武器详情页，识别摩拉（摩拉为全局资源，与显示角色无关）
                    let recognizedMora = 0;
                    try {
                        click(962, 612);
                        await sleep(800);
                        click(181, 223);   // 点击武器
                        await sleep(800);
                        click(1721, 1007);
                        log.info("点击强化或突破进入武器...");
                        await sleep(1800);

                        recognizedMora = await this.recognizeMora();
                        log.info(`未找到角色，识别到摩拉数量：${recognizedMora}`);

                        keyPress("VK_ESCAPE");  // 退出武器页面
                        log.info("退出武器页面");
                        await sleep(500);
                    } catch (e) { if (Utils.isCancellationError(e)) throw e;
                        log.warn(`武器页面摩拉识别失败，使用默认值 9000000：${e.message}`);
                        recognizedMora = 9000000;
                    }

                    weaponInfo = {
                        weaponStar: characterInfo.weaponStar,
                        weaponLevel: characterInfo.weaponLevel,
                        moraAmount: recognizedMora
                    };
                    talentInfo = {
                        talentLevels: characterInfo.talentLevels,
                        finalTalentLevels: characterInfo.talentLevels.join("-")
                    };
                    breakInfo = {
                        breakResult: characterInfo.characterBreak
                    };
                    await this.saveConfig(recognitionType, characterInfo, weaponInfo, talentInfo, breakInfo);
                    log.info(`✅ 角色识别流程完成（识别类型：${recognitionType}，角色未找到，已写入默认配置）`);
                    return true;
                }
            }
            
            if (recognitionType === "all" || recognitionType === "weapon") {
                weaponInfo = await this.recognizeWeapon(recognitionType);
            }
            
            if (recognitionType === "all" || recognitionType === "break") {
                talentInfo = await this.recognizeTalent();
            }
            
            if (recognitionType === "all" || recognitionType === "break") {
                breakInfo = await this.recognizeCharacterBreak(talentInfo, recognitionType);
            }
            
            // 已找到角色但等级识别为 0（等级 OCR 失败）属异常情形，不写入 config，避免用 0 覆盖已有配置
            const recognizedLevel = characterInfo && characterInfo.characterLevel ? characterInfo.characterLevel : 0;
            if (recognizedLevel > 0) {
                await this.saveConfig(recognitionType, characterInfo, weaponInfo, talentInfo, breakInfo);
            } else {
                log.warn(`⚠️ 角色等级识别无效（${recognizedLevel}），不写入 config.json，使用现有配置继续`);
            }
            
            log.info(`✅ 角色识别流程完成（识别类型：${recognitionType}）`);
            return true;
            
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            log.error(`脚本执行异常：${e.message}`);
            notification.send(`脚本执行失败：${e.message}`);
            // 异常属于异常情形：返回 false，让主流程走「角色识别失败，终止主流程」，而非静默当作成功继续
            return false;
        }
    },
    
    // 保存配置（增量更新）
    saveConfig: async function(recognitionType, characterInfo, weaponInfo, talentInfo, breakInfo) {
        try {
            let existingConfig = [];
            try {
                const configContent = file.readTextSync(Constants.CONFIG_PATH);
                existingConfig = JSON.parse(configContent);
            } catch (e) { if (Utils.isCancellationError(e)) throw e;
                log.info("配置文件不存在或读取失败，将创建新配置");
            }
            
            const newConfig = [...existingConfig];
            
            if (recognitionType === "all" || recognitionType === "weapon") {
                const currWeaponLvl = weaponInfo.weaponLevel && weaponInfo.weaponLevel.match(/(\d+)级/) ? parseInt(weaponInfo.weaponLevel.match(/(\d+)级/)[1]) : 0;
                const targetWeaponLvl = settings.weaponMaterialRequireCounts ? parseInt((settings.weaponMaterialRequireCounts.match(/(\d+)级/) || [])[1]) : 80;
                const weaponStar = weaponInfo.weaponStar;
                // 星级/等级识别有效才写入对应字段：识别失败（空值/未知星级/识别异常/0）时不覆盖已有配置
                const weaponStarValid = weaponStar && weaponStar !== "未知星级" && weaponStar !== "识别异常" && weaponStar !== "0";
                const weaponLevelValid = !!(weaponInfo.weaponLevel && String(weaponInfo.weaponLevel).trim() !== "");

                const weaponConfigObj = {};
                if (weaponStarValid) weaponConfigObj["weaponStar"] = weaponStar;
                if (weaponLevelValid) weaponConfigObj["weaponLevel"] = weaponInfo.weaponLevel;

                const moraConfigObj = {
                    "moraAmount": weaponInfo.moraAmount
                };

                let weaponMatCount = [0, 0, 0, 0];
                if (weaponStarValid && weaponStar !== "一星" && currWeaponLvl <= targetWeaponLvl && currWeaponLvl > 0) {
                    const rules = Constants.weaponMaterialRules[weaponStar];
                    for (const lvl of Constants.charLevels) {
                        if (lvl >= currWeaponLvl && lvl <= targetWeaponLvl) {
                            const mat = rules[lvl] || [0, 0, 0, 0];
                            weaponMatCount = weaponMatCount.map((v, i) => v + mat[i]);
                        }
                    }
                }
                const weaponDomainNeedStr = weaponMatCount.join("-");
                log.info(`✅武器秘境材料需求：${weaponDomainNeedStr}`);

                this.updateConfigObject(newConfig, weaponConfigObj);
                this.updateConfigObject(newConfig, moraConfigObj);
                // 星级识别有效才写入材料需求（一星为 0-0-0-0 属正确值；未知/识别失败不覆盖旧配置）
                if (weaponStarValid) {
                    const weaponDomainObj = {
                        "weaponMaterialRequireCounts0": weaponDomainNeedStr
                    };
                    this.updateConfigObject(newConfig, weaponDomainObj);
                }
            }
            
            if (recognitionType === "all" || recognitionType === "break") {
                const targetTalents = (settings && settings.talentBookRequireCounts ? settings.talentBookRequireCounts : "10-10-10")
                    .split('-')
                    .map(l => isNaN(parseInt(l)) ? 10 : parseInt(l));
                
                const [currTal1 = 0, currTal2 = 0, currTal3 = 0] = talentInfo.talentLevels;
                
                const calcTalentMat = (curr, target) => {
                    let total = [0, 0, 0];
                    if (curr >= target || curr < 1 || target > 10) return total;
                    for (let lvl = curr; lvl < target; lvl++) {
                        const key = `${lvl}-${lvl + 1}`;
                        const mat = Constants.talentBookRules[key] || [0, 0, 0];
                        total = total.map((v, i) => v + mat[i]);
                    }
                    return total;
                };
                
                const tal1Mat = calcTalentMat(currTal1, targetTalents[0]);
                const tal2Mat = calcTalentMat(currTal2, targetTalents[1]);
                const tal3Mat = calcTalentMat(currTal3, targetTalents[2]);
                const talentMatCount = [
                    tal1Mat[0] + tal2Mat[0] + tal3Mat[0],
                    tal1Mat[1] + tal2Mat[1] + tal3Mat[1],
                    tal1Mat[2] + tal2Mat[2] + tal3Mat[2]
                ];
                
                const talentLevelObj = {
                    "talentLevels": talentInfo.finalTalentLevels
                };
                const talentBookObj = {
                    "talentBookRequireCounts0": talentMatCount.join("-")
                };
                
                this.updateConfigObject(newConfig, talentLevelObj);
                this.updateConfigObject(newConfig, talentBookObj);
            }
            
            if (recognitionType === "all" || recognitionType === "break") {
                const currCharLvl = breakInfo.breakResult.match(/(\d+)级/) ? parseInt(breakInfo.breakResult.match(/(\d+)级/)[1]) : 0;
                const targetCharLvl = settings.bossRequireCounts ? parseInt((settings.bossRequireCounts.match(/(\d+)级/) || [])[1]) : 80;

                let charMatCount = 0;
                if (currCharLvl <= targetCharLvl && currCharLvl > 0) {
                    for (const lvl of Constants.charLevels) {
                        if (lvl >= currCharLvl && lvl <= targetCharLvl) {
                            charMatCount += Constants.charBossMaterialRules[lvl] || 0;
                        }
                    }
                }

                const charLevelObj = {
                    "characterLevel": characterInfo.characterLevel,
                    "characterBreak": breakInfo.breakResult,
                    "bossRequireCounts0": charMatCount
                };

                this.updateConfigObject(newConfig, charLevelObj);
            }
            
            this.mergeConfigGroups(newConfig);
            file.writeTextSync(Constants.CONFIG_PATH, JSON.stringify(newConfig, null, 2));
            log.info(`✅ 材料计算完成，已保存到config.json`);
            
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            log.error(`❌ 保存配置失败：${e.message}`);
        }
    },
    
    mergeConfigGroups: function(configArray) {
        const groups = [
            ["weaponStar", "weaponLevel"]
        ];
        
        for (const groupKeys of groups) {
            const mergedObj = {};
            const indicesToRemove = new Set();
            
            for (let i = 0; i < configArray.length; i++) {
                const item = configArray[i];
                let hasGroupKey = false;
                for (const key of groupKeys) {
                    if (item.hasOwnProperty(key)) {
                        mergedObj[key] = item[key];
                        hasGroupKey = true;
                    }
                }
                if (hasGroupKey) {
                    indicesToRemove.add(i);
                }
            }
            
            if (Object.keys(mergedObj).length > 0) {
                const sortedIndices = Array.from(indicesToRemove).sort((a, b) => b - a);
                for (const index of sortedIndices) {
                    configArray.splice(index, 1);
                }
                configArray.push(mergedObj);
            }
        }
    },
    
    // 更新配置对象（增量更新）
    updateConfigObject: function(configArray, newObj) {
        const groupKeys = {
            "weaponStar": ["weaponStar", "weaponLevel"],
            "weaponLevel": ["weaponStar", "weaponLevel"]
        };
        
        for (const key in newObj) {
            const existingIndex = configArray.findIndex(item => item.hasOwnProperty(key));
            if (existingIndex !== -1) {
                configArray[existingIndex][key] = newObj[key];
            } else {
                let targetIndex = -1;
                
                if (groupKeys[key]) {
                    const groupKeyList = groupKeys[key];
                    targetIndex = configArray.findIndex(item => 
                        groupKeyList.some(gk => item.hasOwnProperty(gk))
                    );
                }
                
                if (targetIndex !== -1) {
                    configArray[targetIndex][key] = newObj[key];
                } else {
                    configArray.push({ [key]: newObj[key] });
                }
            }
        }
    },
};
