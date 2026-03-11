// 角色识别模块
var Character = {
    // 加载角色数据
    loadAvatarData: async function() {
        try {
            const json = file.readTextSync(Constants.avatarDataPath);
            const data = JSON.parse(json);
            const aliasMap = {};
            data.forEach(char => {
                aliasMap[char.name] = char.name;
                char.alias.forEach(alias => aliasMap[alias] = char.name);
            });
            return { aliasToNameMap: aliasMap };
        } catch (e) {
            log.error(`加载角色数据失败: ${e}`);
            return { aliasToNameMap: {} };
        }
    },
    
    // 选择元素
    selectElement: async function(element) {
        if (element === "物") return;
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
        for (let i = 0; i < 99; i++) {
            const res = await OcrHelper.recognizeText(name, region, aliasMap);
            if (res) return res.text;
            await click(1840, 540);
            await sleep(200);
        }
        log.warn(`未找到角色：${name}`);
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
            const monsterCheckTextList = await Utils.retryTask(() => {
                const ocr = RecognitionObject.ocr(Constants.ocrRegions.monsterCheck.x, Constants.ocrRegions.monsterCheck.y, Constants.ocrRegions.monsterCheck.width, Constants.ocrRegions.monsterCheck.height);
                const capture = captureGameRegion();
                const resList = capture.findMulti(ocr);
                const items = [];
                for (let i = 0; i < resList.Count; i++) {
                    const res = resList[i];
                    if (res.text && res.text.includes("掉落")) {
                        items.push({x: Math.round(res.x + res.width / 2), y: Math.round(res.y + res.height / 2)});
                    }
                    if (res.Dispose) res.Dispose();
                }
                capture.dispose();
                return items;
            }, "识别掉落");
            
            if (monsterCheckTextList && monsterCheckTextList.length > 0) {
                await click(monsterCheckTextList[0].x, monsterCheckTextList[0].y);
                await sleep(2000);
            } else {
                log.warn("未识别到'掉落'");
            }
            
            for (let i = 0; i < 4; i++) {
                await click(48, 444);
                await sleep(300);
            }
            
            await click(960, 540); await sleep(500);
            await click(1566, 736); await sleep(800);
            
            let star1Coords = { x: 0, y: 0 };
            const probTextList = await Utils.retryTask(() => {
                const ocr = RecognitionObject.ocr(Constants.ocrRegions.probabilityGet.x, Constants.ocrRegions.probabilityGet.y, Constants.ocrRegions.probabilityGet.width, Constants.ocrRegions.probabilityGet.height);
                const capture = captureGameRegion();
                const resList = capture.findMulti(ocr);
                const items = [];
                for (let i = 0; i < resList.Count; i++) {
                    const res = resList[i];
                    if (res.text && res.text.includes("概率获得")) {
                        items.push({x: Math.round(res.x + res.width / 2), y: Math.round(res.y + res.height / 2)});
                    }
                    if (res.Dispose) res.Dispose();
                }
                capture.dispose();
                return items;
            }, "识别概率获得");
            
            if (probTextList && probTextList.length > 0) {
                star1Coords = { x: probTextList[0].x + 270, y: probTextList[0].y + 77 };
                await click(star1Coords.x, star1Coords.y);
                await sleep(800);
            } else {
                log.warn("未识别到'概率获得'");
            }
            
            const star1TextList = await OcrHelper.recognizeMultiText(Constants.ocrRegions.star1MaterialCount, "一星武器材料数量");
            result.star1 = Utils.extractNumber(star1TextList, "当前拥有");
            keyPress("VK_ESCAPE");
            await sleep(500);
            
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
                
                const monsterTextList = await OcrHelper.recognizeMultiText(Constants.ocrRegions.monsterMaterialDesc, "武器魔物材料描述");
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
            await sleep(600);
            await click(1709, 1011);
            log.info("点击停止追踪...");
            await sleep(1500);
            for (let i = 0; i < 2; i++) {
                keyPress("VK_ESCAPE");
                await sleep(1000);
            }
            
        } catch (e) {
            log.error(`武器魔物材料识别失败: ${e.message}`);
        }
        return result;
    },
    
    // 检查命座加成
    checkConstellationBonus: async function(talentName) {
        try {
            const ocr = RecognitionObject.ocr(28, 270, 155, 49);
            const capture = captureGameRegion();
            const resList = capture.findMulti(ocr);
            let hasBonus = false;
            const allTexts = [];
            
            for (let i = 0; i < resList.Count; i++) {
                if (resList[i] && resList[i].text) {
                    const text = resList[i].text.trim();
                    allTexts.push(text);
                    if (text.includes("天赋等级+3") || text.includes("等级+3")) {
                        hasBonus = true;
                        break;
                    }
                }
                if (resList[i] && resList[i].Dispose) resList[i].Dispose();
            }
            
            log.info(`${talentName}命座加成识别文本：${allTexts.join(" | ")}`);
            keyPress("VK_ESCAPE");
            await sleep(1000);
            capture.dispose();
            
            if (!hasBonus && allTexts.length > 0) {
                for (const text of allTexts) {
                    if (text.includes("+3") && (text.includes("天赋") || text.includes("等级"))) {
                        hasBonus = true;
                        log.info(`模糊匹配到${talentName}命座加成`);
                        break;
                    }
                }
            }
            
            return hasBonus;
        } catch (e) {
            log.error(`检查${talentName}命座加成出错：${e.message || e}`);
            return false;
        }
    },
    
    // 主函数：查找角色并获取等级
    findCharacterAndGetLevel: async function() {
        try {
            log.info("📌 校准并返回游戏主界面...");
            setGameMetrics(1920, 1080, 1);
            await genshin.returnMainUi();
            await sleep(1500);
            log.info("✅ 游戏主界面已加载");
            
            const targetName = settings.Character ? settings.Character.trim() : "";
            const targetElement = settings.Element ? settings.Element.trim() : "";
            const targetWeapon = settings.weaponType ? settings.weaponType.trim() : "";
            
            log.info("打开角色页面...");
            keyPress("VK_C");
            await sleep(1500);
            log.info(`查找目标角色：${targetName}（${targetElement}）`);
            let targetFound = false;
            
            const { aliasToNameMap } = await this.loadAvatarData();
            
            const checkCharacter = async (x, y) => {
                click(x, y);
                await sleep(800);
                
                const recogName = await this.selectCharacter(targetName, Constants.ocrRegions.checkChar, aliasToNameMap);
                log.info(`检测到角色：${recogName}（坐标：${x},${y}）`);
                if (!recogName) return false;
                
                setGameMetrics(1920, 1080, 1.25);
                
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
                } catch (e) {
                    log.warn(`角色等级识别失败：${e.message}`);
                }
                //进入武器详情页面
                click(962, 612);
                await sleep(800);
                click(181, 223);
                await sleep(800);
                
                let weaponStar = "未知星级";
                let weaponMaterialResult = {
                    weapon1: { monsterNames: [], star1: 0, star2: 0, star3: 0 },
                    weapon2: { monsterNames: [], star1: 0, star2: 0, star3: 0 }
                };
                
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
                                 `无法识别（${starCount}）`;
                } catch (e) {
                    log.error(`武器星级识别异常：${e.message}`);
                    weaponStar = "识别异常";
                }
                log.info(`武器星级：${weaponStar}`);
                
                let weaponLevel = "";
                let isWeaponMaxLevel = false;
                let moraAmount = 0;
                
                if (weaponStar === "一星") {
                    log.info("💡 一星武器无需培养，跳过武器等级识别");
                    weaponLevel = "一星武器（跳过识别等级）";
                    click(1721, 1007);
                    await sleep(800);
                    
                    try {
                        const moraRegion = { x: 1618, y: 33, width: 165, height: 28 };
                        const moraOcr = RecognitionObject.ocr(moraRegion.x, moraRegion.y, moraRegion.width, moraRegion.height);
                        const capture = captureGameRegion();
                        const resList = capture.findMulti(moraOcr);
                        
                        if (resList && resList.Count > 0) {
                            const moraText = resList[0].text || "";
                            const cleanMoraText = moraText.replace(/[^\d]/g, "");
                            if (cleanMoraText) {
                                moraAmount = parseInt(cleanMoraText, 10);
                                if (!isNaN(moraAmount) && moraAmount >= 0) {
                                    log.info(`识别到摩拉数量：${moraAmount}`);
                                }
                            }
                        }
                        capture.dispose();
                    } catch (e) {
                        log.warn(`摩拉数量识别失败：${e.message}`);
                    }
                    
                    click(1847, 49);
                    await sleep(1000);
                } else {
                    click(1721, 1007);
                    await sleep(800);
                    
                    try {
                        const moraRegion = { x: 1618, y: 33, width: 165, height: 28 };
                        const moraOcr = RecognitionObject.ocr(moraRegion.x, moraRegion.y, moraRegion.width, moraRegion.height);
                        const capture = captureGameRegion();
                        const resList = capture.findMulti(moraOcr);
                        
                        if (resList && resList.Count > 0) {
                            const moraText = resList[0].text || "";
                            const cleanMoraText = moraText.replace(/[^\d]/g, "");
                            if (cleanMoraText) {
                                moraAmount = parseInt(cleanMoraText, 10);
                                if (!isNaN(moraAmount) && moraAmount >= 0) {
                                    log.info(`识别到摩拉数量：${moraAmount}`);
                                }
                            }
                        }
                        capture.dispose();
                    } catch (e) {
                        log.warn(`摩拉数量识别失败：${e.message}`);
                    }
                    
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
                        
                        if (weaponLevel) {
                            log.info("识别武器魔物材料（区域1）...");
                            log.info("识别第一种武器材料...");
                            await click(1640, 880);
                            await sleep(800);
                            weaponMaterialResult.weapon1 = await this.identifyMonsterAndMaterials();
                            log.info(`✅ 第一种武器材料：${JSON.stringify(weaponMaterialResult.weapon1)}`);
                            
                            log.info("识别第二种武器材料...");
                            await click(1524, 881);
                            await sleep(800);
                            weaponMaterialResult.weapon2 = await this.identifyMonsterAndMaterials();
                            log.info(`✅ 第二种武器材料：${JSON.stringify(weaponMaterialResult.weapon2)}`);
                        }
                    }
                    
                    if (!weaponLevel) {
                        click(1529, 1017);
                        await sleep(800);
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
                                
                                log.info("识别武器魔物材料（区域2）...");
                                log.info("识别第一种武器材料...");
                                await click(1099, 491);
                                await sleep(800);
                                weaponMaterialResult.weapon1 = await this.identifyMonsterAndMaterials();
                                log.info(`✅ 第一种武器材料（备用区域）：${JSON.stringify(weaponMaterialResult.weapon1)}`);
                                
                                log.info("识别第二种武器材料...");
                                await click(956, 491);
                                await sleep(800);
                                weaponMaterialResult.weapon2 = await this.identifyMonsterAndMaterials();
                                log.info(`✅ 第二种武器材料（备用区域）：${JSON.stringify(weaponMaterialResult.weapon2)}`);
                            }
                        
                            keyPress("VK_ESCAPE");
                            log.info("退出武器材料详情页面...");
                            await sleep(800);
                        }
                    }
                    
                    if (!weaponLevel) {
                        weaponLevel = "90级已突破（满级）";
                        isWeaponMaxLevel = true;
                        log.info("💡 武器等级识别失败，判定为90级满级，跳过魔物材料识别");
                    }
                    
                    log.info(`武器突破等级：${weaponLevel}`);
                    keyPress("VK_ESCAPE");
                    log.info("退出武器等级页面...");
                    await sleep(1500);
                }
                
                if (weaponStar === "一星") {
                    log.info(`武器突破等级：${weaponLevel}`);
                }
                
                log.info("开始识别天赋等级...");
                click(189, 431);
                await sleep(800);
                
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
                    await sleep(800);
                    if (await this.checkConstellationBonus("元素战技")) {
                        talentLevels[1] = Math.max(1, talentLevels[1] - 3);
                        log.info(`元素战技命座加成修正后等级：${talentLevels[1]} 级`);
                        await click(1085, 381);
                        await sleep(800);
                    }
                }
                
                if (talentLevels[2] > 3) {
                    log.info("检查元素爆发命座加成...");
                    let burstBonusFound = false;
                    
                    if (talentBurst === await OcrHelper.getTalentLevel(Constants.ocrRegions.talentBurst, "元素爆发")) {
                        await click(talentPositions.burst.x, talentPositions.burst.y);
                        await sleep(800);
                        burstBonusFound = await this.checkConstellationBonus("元素爆发(常规)");
                    } else {
                        await click(talentPositions.burstBackup.x, talentPositions.burstBackup.y);
                        await sleep(800);
                        burstBonusFound = await this.checkConstellationBonus("元素爆发(备用)");
                    }
                    
                    if (burstBonusFound) {
                        talentLevels[2] = Math.max(1, talentLevels[2] - 3);
                        log.info(`元素爆发命座加成修正后等级：${talentLevels[2]} 级`);
                    }
                }
                
                const finalTalentLevels = `${talentLevels[0]}-${talentLevels[1]}-${talentLevels[2]}`;
                log.info(`最终天赋等级：${finalTalentLevels}`);
                
                const talentLevelObj = { "talentLevels": finalTalentLevels };
                
                await sleep(800);
                click(170, 152);
                await sleep(800);
                click(1779, 190);
                await sleep(800);
                
                const breakStatus = await Utils.retryTask(() => {
                    const region = RecognitionObject.ocr(Constants.ocrRegions.breakStatus.x, Constants.ocrRegions.breakStatus.y, Constants.ocrRegions.breakStatus.width, Constants.ocrRegions.breakStatus.height);
                    const capture = captureGameRegion();
                    const res = capture.find(region);
                    const text = res.text ? res.text.trim() : "";
                    capture.dispose();
                    return text;
                }, "角色突破状态");
                
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
                
                const currCharLvl = breakResult.match(/(\d+)级/) ? parseInt(breakResult.match(/(\d+)级/)[1]) : 0;
                const targetCharLvl = settings.bossRequireCounts ? parseInt(settings.bossRequireCounts.match(/(\d+)级/)[1]) : 80;
                await sleep(800);
                
                // 提前定义targetTalents，确保在try块内外都能访问
                const targetTalents = (settings && settings.talentBookRequireCounts ? settings.talentBookRequireCounts : "10-10-10")
                    .split('-')
                    .map(l => isNaN(parseInt(l)) ? 10 : parseInt(l));
                
                const materialData = {
                    localSpecialties: "",
                    localAmount: 0,
                    monsterMaterials: [],
                    star1Amount: 0,
                    star2Amount: 0,
                    star3Amount: 0,
                    needMonsterStar3: 0,
                    needLocalAmount: 0
                };
                
                try {
                    log.info("打开魔物材料详情页...");
                    await click(996, 272);
                    await sleep(500);
                    await click(1171, 525);
                    await sleep(1000);
                    
                    log.info("滑动查看材料详情...");
                    moveMouseTo(970, 428);
                    await sleep(100);
                    leftButtonDown();
                    const steps = 14;
                    const stepDistance = -12;
                    for (let j = 0; j < steps; j++) {
                        moveMouseBy(0, stepDistance);
                        await sleep(10);
                    }
                    await sleep(500);
                    leftButtonUp();
                    await sleep(500);
                    
                    log.info("识别魔物材料信息...");
                    const monsterTextList = await OcrHelper.recognizeMultiText(Constants.ocrRegions.monsterMaterialDesc, "魔物材料描述");
                    const monsterNames = this.extractMonsterNames(monsterTextList);
                    log.info(`识别到魔物名称：${monsterNames.join(", ")}`);
                    
                    const star1Count = Utils.extractNumber(monsterTextList, "可合成数量") * 3;
                    materialData.star1Amount = star1Count;
                    log.info(`一星魔物材料数量：${star1Count}`);
                    
                    const star2Count = Utils.extractNumber(monsterTextList, "当前拥有");
                    materialData.star2Amount = star2Count;
                    log.info(`二星魔物材料数量：${star2Count}`);
                    
                    monsterNames.forEach((name, index) => {
                        materialData.monsterMaterials.push({ name: name, amount: 0 });
                    });
                    
                    keyPress("VK_ESCAPE");
                    await sleep(500);
                    
                    log.info("打开三星材料详情页...");
                    await click(1128, 272);
                    await sleep(500);
                    await click(1171, 525);
                    await sleep(800);
                    
                    const threeStarTextList = await OcrHelper.recognizeMultiText(Constants.ocrRegions.threeStarMaterialCount, "三星魔物材料数量");
                    const star3Count = Utils.extractNumber(threeStarTextList, "当前拥有");
                    materialData.star3Amount = star3Count;
                    log.info(`三星魔物材料数量：${star3Count}`);
                    
                    keyPress("VK_ESCAPE");
                    await sleep(500);
                    
                    log.info("打开区域特产材料详情页...");
                    await click(1029, 524);
                    await sleep(1200);
                    
                    const localCountTextList = await OcrHelper.recognizeMultiText(Constants.ocrRegions.localSpecialtyCount, "区域特产数量");
                    const localCount = Utils.extractNumber(localCountTextList, "当前拥有");
                    materialData.localAmount = localCount;
                    log.info(`区域特产数量：${localCount}`);
                    await sleep(500);
                    
                    log.info("识别「前往采集」文字...");
                    const goCollectTextList = await Utils.retryTask(() => {
                        const ocr = RecognitionObject.ocr(Constants.ocrRegions.goCollect.x, Constants.ocrRegions.goCollect.y, Constants.ocrRegions.goCollect.width, Constants.ocrRegions.goCollect.height);
                        const capture = captureGameRegion();
                        const resList = capture.findMulti(ocr);
                        const textWithPos = [];
                        
                        for (let i = 0; i < resList.Count; i++) {
                            const res = resList[i];
                            let text = res.text ? res.text.trim() : "";
                            for (const [wrong, correct] of Object.entries(Constants.replacementMap)) {
                                text = text.replace(new RegExp(wrong, 'g'), correct);
                            }
                            if (text) {
                                textWithPos.push({
                                    text: text,
                                    x: res.x,
                                    y: res.y,
                                    width: res.width,
                                    height: res.height
                                });
                            }
                            if (res.Dispose) res.Dispose();
                        }
                        capture.dispose();
                        return textWithPos;
                    }, "前往采集文字（带坐标）");
                    
                    const targetGoCollect = goCollectTextList.find(item => {
                        return item.text === "前往采集" || 
                               item.text.includes("前往采集") && 
                               !item.text.includes("采集区域") && 
                               !item.text.includes("采集点") && 
                               !item.text.includes("获取区域");
                    });
                    
                    if (targetGoCollect) {
                        log.info(`识别到「前往采集」（精准坐标）：文字="${targetGoCollect.text}"，坐标X=${targetGoCollect.x}, Y=${targetGoCollect.y}`);
                        const clickX = Math.round(targetGoCollect.x + targetGoCollect.width / 2);
                        const clickY = Math.round(targetGoCollect.y + targetGoCollect.height / 2);
                        
                        const validXRange = [Constants.ocrRegions.goCollect.x, Constants.ocrRegions.goCollect.x + Constants.ocrRegions.goCollect.width];
                        const validYRange = [Constants.ocrRegions.goCollect.y, Constants.ocrRegions.goCollect.y + Constants.ocrRegions.goCollect.height];
                        
                        if (clickX >= validXRange[0] && clickX <= validXRange[1] && clickY >= validYRange[0] && clickY <= validYRange[1]) {
                            log.info(`点击「前往采集」中心位置：X=${clickX}, Y=${clickY}`);
                            await click(clickX, clickY);
                            await sleep(2000);
                        } else {
                            log.warn(`「前往采集」坐标超出有效范围，跳过点击：X=${clickX}, Y=${clickY}`);
                            await click(Constants.ocrRegions.goCollect.x + Constants.ocrRegions.goCollect.width / 2, Constants.ocrRegions.goCollect.y + Constants.ocrRegions.goCollect.height / 2);
                            await sleep(2000);
                        }
                        
                        log.info("识别地图详情页的区域特产名称...");
                        const mapNameTextList = await OcrHelper.recognizeMultiText(Constants.ocrRegions.mapLocalName, "地图详情页特产名称");
                        if (mapNameTextList.length > 0) {
                            const rawName = mapNameTextList[0];
                            materialData.localSpecialties = Utils.extractPureLocalName(rawName);
                            log.info(`识别到区域特产名称（原始）：${rawName}`);
                            log.info(`提取纯净名称：${materialData.localSpecialties}`);
                        } else {
                            materialData.localSpecialties = "未知区域特产";
                            log.warn("未识别到地图详情页的特产名称");
                        }
                        
                        await click(1709, 1011);
                        log.info("点击停止追踪采集...");
                        await sleep(500);
                    } else {
                        log.warn("未识别到精准的「前往采集」文字，使用原有逻辑提取特产名称");
                        const localNameTextList = await OcrHelper.recognizeMultiText(Constants.ocrRegions.localSpecialtyName, "区域特产名称");
                        materialData.localSpecialties = localNameTextList.find(text => !text.includes("区域特产")) ? localNameTextList.find(text => !text.includes("区域特产")).trim() : "未知区域特产";
                    }
                    
                    keyPress("VK_ESCAPE");
                    log.info("退出地图详情页...");
                    await sleep(1500);
                    
                    
                    log.info("开始计算所需材料数量...");
                    const charBreakNeed = Utils.calcCharBreakMonster(currCharLvl, targetCharLvl);
                    log.info(`角色突破所需魔物材料 - 一星：${charBreakNeed.star1}，二星：${charBreakNeed.star2}，三星：${charBreakNeed.star3}`);
                    
                    const currTalents = talentLevels;
                    const talentNeed = Utils.calcTalentMonster(currTalents, targetTalents);
                    log.info(`天赋升级所需魔物材料 - 一星：${talentNeed.star1}，二星：${talentNeed.star2}，三星：${talentNeed.star3}`);
                    
                    const totalNeed = {
                        star1: charBreakNeed.star1 + talentNeed.star1,
                        star2: charBreakNeed.star2 + talentNeed.star2,
                        star3: charBreakNeed.star3 + talentNeed.star3
                    };
                    log.info(`总计所需魔物材料 - 一星：${totalNeed.star1}，二星：${totalNeed.star2}，三星：${totalNeed.star3}`);
                    
                    const convertResult = Utils.convertToThreeStar(materialData.star1Amount, materialData.star2Amount, materialData.star3Amount);
                    log.info(`现有材料转换为三星等价物：${convertResult.totalStar3}（剩余一星：${convertResult.remainStar1}，剩余二星：${convertResult.remainStar2}）`);
                    
                    const totalNeedStar3 = Utils.convertToThreeStar(totalNeed.star1, totalNeed.star2, totalNeed.star3).totalStar3;
                    materialData.needMonsterStar3 = Math.max(0, totalNeedStar3 - convertResult.totalStar3);
                    log.info(`角色等级突破和天赋升级还需获取三星魔物材料数量：${materialData.needMonsterStar3}`);
                    
                    const localNeed = Utils.calcCharBreakLocal(currCharLvl, targetCharLvl);
                    materialData.needLocalAmount = Math.max(0, localNeed - materialData.localAmount);
                    log.info(`角色突破所需区域特产：${localNeed}，当前拥有：${materialData.localAmount}，还需：${materialData.needLocalAmount}`);
                    
                } catch (e) {
                    log.error(`材料识别流程异常：${e.message}`);
                }
                
                //keyPress("VK_ESCAPE");
                await sleep(500);
                log.info("已退出突破预览");
                
                const currWeaponLvl = weaponLevel.match(/(\d+)级/) ? parseInt(weaponLevel.match(/(\d+)级/)[1]) : 0;
                const [currTal1 = 0, currTal2 = 0, currTal3 = 0] = talentLevels;
                
                // targetTalents已在函数开头定义，这里直接使用
                
                const targetWeaponLvl = settings.weaponMaterialRequireCounts ? parseInt(settings.weaponMaterialRequireCounts.match(/(\d+)级/)[1]) : 80;
                
                let charMatCount = 0;
                if (currCharLvl <= targetCharLvl && currCharLvl > 0) {
                    for (const lvl of Constants.charLevels) {
                        if (lvl >= currCharLvl && lvl <= targetCharLvl) {
                            charMatCount += Constants.charBossMaterialRules[lvl] || 0;
                        }
                    }
                }
                
                let weaponMatCount = [0, 0, 0, 0];
                if (weaponStar !== "一星" && weaponStar !== "未知星级" && weaponStar !== "识别异常" && currWeaponLvl <= targetWeaponLvl && currWeaponLvl > 0) {
                    const rules = Constants.weaponMaterialRules[weaponStar];
                    for (const lvl of Constants.charLevels) {
                        if (lvl >= currWeaponLvl && lvl <= targetWeaponLvl) {
                            const mat = rules[lvl] || [0, 0, 0, 0];
                            weaponMatCount = weaponMatCount.map((v, i) => v + mat[i]);
                        }
                    }
                }
                
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
                
                const w1Req = Utils.calcWeaponMonsterNeed(currWeaponLvl, targetWeaponLvl, 1);
                const w1Owned = weaponMaterialResult.weapon1.star1 + (weaponMaterialResult.weapon1.star2 * 3) + (weaponMaterialResult.weapon1.star3 * 9);
                const weapon1RemainStar3 = Math.max(0, Math.ceil((w1Req - w1Owned) / 9));
                log.info(`✅第一个魔物材料需${w1Req}个star1，当前拥有${w1Owned}个star1，还需${weapon1RemainStar3}个3星魔物材料`);
                
                const w2Req = Utils.calcWeaponMonsterNeed(currWeaponLvl, targetWeaponLvl, 2);
                const w2Owned = weaponMaterialResult.weapon2.star1 + (weaponMaterialResult.weapon2.star2 * 3) + (weaponMaterialResult.weapon2.star3 * 9);
                const weapon2RemainStar3 = Math.max(0, Math.ceil((w2Req - w2Owned) / 9));
                log.info(`✅第二个魔物材料需${w2Req}个star1，当前拥有${w2Owned}个star1，还需${weapon2RemainStar3}个3星魔物材料`);
                
                const finalConfigArray = [];
                
                const materialObj = {
                    "LocalSpecialties": materialData.localSpecialties,
                    "needLocalAmount": materialData.needLocalAmount,
                    "needMonsterStar3": materialData.needMonsterStar3
                };
                materialData.monsterMaterials.forEach((monster, index) => {
                    materialObj[`Magic material${index}`] = monster.name;
                });
                finalConfigArray.push(materialObj);
                finalConfigArray.push({ "bossRequireCounts0": charMatCount });
                finalConfigArray.push({ "weaponMaterialRequireCounts0": weaponMatCount.join("-") });
                finalConfigArray.push({ "talentBookRequireCounts0": talentMatCount.join("-") });
                finalConfigArray.push({ "characterLevel": characterLevel });
                finalConfigArray.push({ "moraAmount": moraAmount });
                finalConfigArray.push(talentLevelObj);
                
                const weaponConfigObj = {
                    "needamount1 stars3": weapon1RemainStar3
                };
                
                if (weaponMaterialResult.weapon1.monsterNames && weaponMaterialResult.weapon1.monsterNames.length > 0) {
                    weaponMaterialResult.weapon1.monsterNames.forEach((name, index) => {
                        weaponConfigObj[`Weapons1 material${index}`] = name;
                    });
                } else {
                    weaponConfigObj["Weapons1 material0"] = "";
                }
                
                weaponConfigObj["needamount2 stars3"] = weapon2RemainStar3;
                
                if (weaponMaterialResult.weapon2.monsterNames && weaponMaterialResult.weapon2.monsterNames.length > 0) {
                    weaponMaterialResult.weapon2.monsterNames.forEach((name, index) => {
                        weaponConfigObj[`Weapons2 material${index}`] = name;
                    });
                } else {
                    weaponConfigObj["Weapons2 material0"] = "";
                }
                
                finalConfigArray.push(weaponConfigObj);
                
                try {
                    file.writeTextSync("config.json", JSON.stringify(finalConfigArray, null, 2));
                    log.info(`✅ 材料计算完成，已保存到config.json`);
                    log.info(`📊 配置内容：${JSON.stringify(finalConfigArray, null, 2)}`);
                } catch (e) {
                    log.error(`❌ 保存配置失败：${e.message}`);
                }
                
                log.info(`查找完成 - 角色：${targetName}，元素：${targetElement}，角色突破：${breakResult}，武器星级：${weaponStar}，武器突破：${weaponLevel}，天赋等级：${talentLevels}`);
                return true;
            };
            
            const pureElement = targetElement.replace("元素", "").trim();
            log.info(`筛选元素：${pureElement}`);
            await this.selectElement(pureElement);
            
            log.info("遍历第一行角色...");
            const firstRowStartX = 618;
            const firstRowStartY = 175;
            const firstRowXStep = -129;
            const firstRowCols = 5;
            
            for (let col = 0; col < firstRowCols; col++) {
                const x = firstRowStartX + (col * firstRowXStep);
                targetFound = await checkCharacter(x, firstRowStartY);
                if (targetFound) break;
            }
            
            if (!targetFound) {
                log.warn(`未找到目标角色：${targetName}`);
                notification.warn(`未找到目标角色：${targetName}`);
            }
            
        } catch (e) {
            log.error(`脚本执行异常：${e.message}`);
            notification.error(`脚本执行失败：${e.message}`);
        }
    }
};
