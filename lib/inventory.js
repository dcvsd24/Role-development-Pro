// 背包/材料查询模块
var Inventory = {
    // 地脉花双倍活动检测结果（仅在首次树脂识别时检测）
    leyLineDoubleDropDetected: false,
    // 须臾树脂拥有数量检测结果（仅首次树脂检查时检测一次；0 表示未检测到）
    transientResinChecked: false,
    transientResinOwned: 0,
    // 查询体力值
    queryStaminaValue: async function(checkLeyLineDoubleDrop = false) {
        try {
            await genshin.returnMainUi();
            await sleep(2500);
            keyPress("F1");
            await sleep(1800);
            click(300, 540);
            await sleep(500);
            click(1570, 203);
            await sleep(800);
            const staminaList = await Utils.ocrRecognizeWithRetry(1580, 20, 210, 55, "体力识别");
            const rawText = staminaList && staminaList.length > 0 ? staminaList[0] : "";
            log.info(`OCR原始文本：${rawText}`);
            // 多字段时优先使用包含 200（体力上限）的字段，但处理方式不变（仍提取首个数字）：
            // 若该字段仅含 200（如 "160 / 200" 被空格拆分），则用去空白后的完整文本还原 "160/200"
            let parseText = rawText.replace(/\s/g, '');
            const fields = rawText.trim().split(/\s+/).filter(f => f.length > 0);
            if (fields.length > 1) {
                const fieldWith200 = fields.find(f => f.includes("200"));
                if (fieldWith200 && !/^\/?200\/?$/.test(fieldWith200)) {
                    parseText = fieldWith200;
                }
            }
            const standardMatch = parseText.match(/(\d+)/);
            if (standardMatch) {
                const currentValue = standardMatch[1];
                let validatedStamina = Utils.positiveIntegerJudgment(currentValue);
                if (validatedStamina > 11200) validatedStamina = (validatedStamina - 1200) / 10000;
                log.info(`返回体力值：${validatedStamina}`);

                // 须臾树脂状态检测（仅启用时在首次树脂检查执行一次，画面仍停留在资源界面）
                // 匹配成功 → 识别拥有数量，后续按 min(配置次数, 拥有数量) 传入；匹配失败 → 视为数量为零
                if (settings.useTransientResin && !this.transientResinChecked) {
                    this.transientResinChecked = true;
                    this.transientResinOwned = await this.detectTransientResin();
                    log.info(`须臾树脂检测结果：${this.transientResinOwned > 0 ? `✅ 拥有须臾树脂 ${this.transientResinOwned} 个` : "❌ 未检测到须臾树脂"}`);
                }

                // 地脉花双倍活动检测（仅首次树脂识别时执行）
                if (checkLeyLineDoubleDrop && settings.enableLeyLineDoubleDrop) {
                    try {
                        log.info("开始检测地脉花双倍活动...");
                        click(608, 782);
                        await sleep(800);
                        click(465, 207);
                        await sleep(800);
                        click(465, 487);
                        await sleep(800);

                        // OCR 识别区域 (x=1033, y=373, w=267, h=169)，判断是否包含「2倍产出」
                        const doubleDropTextList = await Utils.ocrRecognize(1033, 373, 267, 169);
                        let hasDoubleDrop = false;
                        if (doubleDropTextList && doubleDropTextList.length > 0) {
                            for (const text of doubleDropTextList) {
                                if (text && text.includes("2倍产出")) {
                                    hasDoubleDrop = true;
                                    break;
                                }
                            }
                        }
                        this.leyLineDoubleDropDetected = hasDoubleDrop;
                        log.info(`地脉花双倍活动检测结果：${hasDoubleDrop ? "✅ 检测到双倍活动" : "❌ 未检测到双倍活动"}`);

                        await genshin.returnMainUi();
                        await sleep(800);
                    } catch (detectError) { if (Utils.isCancellationError(detectError)) throw detectError;
                        log.warn(`地脉花双倍活动检测失败：${detectError.message}，视为未检测到`);
                        this.leyLineDoubleDropDetected = false;
                        try {
                            await genshin.returnMainUi();
                        } catch (e) { if (Utils.isCancellationError(e)) throw e; }
                    }
                }

                return validatedStamina;
            }
            // OCR 未匹配到数字时兜底返回 0（避免调用方拿 undefined 做体力比较/次数计算）
            log.warn(`体力OCR未匹配到数字，按 0 处理`);
            return 0;
        } catch (error) { if (Utils.isCancellationError(error)) throw error;
            log.error(`体力识别失败：${error.message}，默认为零`);
            await genshin.returnMainUi();
            return 0;
        }
    },

    // 须臾树脂数量检测：在当前画面（资源界面）通过图像匹配判断是否拥有须臾树脂
    // 匹配区域严格限定：X=754, Y=390, 宽=467, 高=169
    // 匹配成功后在其底部正下方区域（宽 90，高 60）识别拥有数量：仅接受大于 0 的纯数字，最大值不超过 5
    // 返回：拥有数量（>0 表示拥有；0 表示未检测到）
    detectTransientResin: async function() {
        try {
            const templateRo = RecognitionObject.TemplateMatch(
                file.ReadImageMatSync("assets/RecognitionObject/须臾树脂.png"),
                754, 390, 467, 169
            );
            templateRo.Threshold = 0.9;
            const captureRegion = captureGameRegion();
            const result = captureRegion.Find(templateRo);
            captureRegion.dispose();
            if (result.isEmpty()) {
                log.info("须臾树脂图像匹配结果：❌ 匹配失败，视为拥有数量为 0");
                return 0;
            }
            log.info(`须臾树脂图像匹配结果：✅ 匹配成功，位置(${result.x}, ${result.y})，开始识别数量`);
            // 匹配图片底部正下方区域：水平居中于匹配框，宽 90，高 60
            const ocrX = result.x + Math.round((result.width - 90) / 2);
            const ocrY = result.y + result.height;
            const textList = await Utils.ocrRecognize(ocrX, ocrY, 90, 60);
            let ownedCount = 0;
            if (textList && textList.length > 0) {
                for (const text of textList) {
                    const cleaned = (text || "").replace(/\s/g, '');
                    // 只接受大于 0 的纯数字，且最大值不超过 5（须臾树脂持有上限）
                    if (/^\d+$/.test(cleaned)) {
                        const num = parseInt(cleaned, 10);
                        if (num > 0 && num <= 5) {
                            ownedCount = num;
                            break;
                        }
                    }
                }
            }
            // 图标可见即至少拥有 1 个；OCR 未能识别到合法数量时按 1 处理，避免误判为没有
            if (ownedCount <= 0) {
                log.warn("须臾树脂数量OCR未识别到合法数字（大于 0 且不超过 5），按拥有 1 个处理");
                ownedCount = 1;
            }
            log.info(`须臾树脂数量识别结果：拥有 ${ownedCount} 个`);
            return ownedCount;
        } catch (error) { if (Utils.isCancellationError(error)) throw error;
            log.warn(`须臾树脂图像检测失败：${error.message}，视为未拥有须臾树脂`);
            return 0;
        }
    },
    
    // 获取BOSS材料数量
    getBossMaterialCount: async function(bossName) {
        await genshin.returnMainUi();
        await sleep(500);
        keyPress("F1");
        await OcrHelper.repeatOperationUntilTextFound({x: 250, y: 520, width: 100, height: 60, targetText: "讨伐", stepDuration: 0, waitTime: 100, ifClick: true});
        await OcrHelper.repeatOperationUntilTextFound({x: 380, y: 180, width: 100, height: 50, targetText: "全部", stepDuration: 0, waitTime: 100, ifClick: true});
        await OcrHelper.repeatOperationUntilTextFound({x: 400, y: 360, width: 100, height: 50, targetText: "精英", stepDuration: 0, waitTime: 100, ifClick: true});
        await sleep(500);
        await OcrHelper.repeatOperationUntilTextFound({x: 380, y: 180, width: 100, height: 50, targetText: "精英", stepDuration: 0, waitTime: 100, ifClick: true});
        await sleep(500);
        await OcrHelper.repeatOperationUntilTextFound({x: 400, y: 420, width: 100, height: 50, targetText: "首领", stepDuration: 0, waitTime: 100, ifClick: true});
        await sleep(500);
        click(956, 844); await sleep(500);
        click(956, 844); await sleep(500);
        await OcrHelper.waitAndClickImage('boss/wolf');
        click(958, 286); await sleep(500);
        click(958, 286); await sleep(500);
        log.info(`正在查询数量`);
        
        try {
            const targetImageRo = RecognitionObject.TemplateMatch(file.ReadImageMatSync(`assets/boss/${bossName}.png`), 0, 0, 1920, 1080);
            targetImageRo.Threshold = 0.95;
            const stopImageRo = RecognitionObject.TemplateMatch(file.ReadImageMatSync("assets/boss/无相之风.png"), 0, 0, 1920, 1080);
            stopImageRo.Threshold = 0.95;
            await Navigation.findAndClickWithScroll(targetImageRo, stopImageRo, {maxAttempts: 30, scrollNum: 9});
            
            if (bossName == '「冰风组曲」科培琉司') {
                await OcrHelper.waitAndClickImage("好感图标", 160, 30);
            } else {
                await OcrHelper.waitAndClickImage("好感图标", 80, 30);
            }
            
            await sleep(800);
            const result = await OcrHelper.findImageAndOCR("assets/itemQuantityDetection.png", 200, 50, 0, 0);
            if (result !== false) {
                const quantity = Utils.positiveIntegerJudgment(result);
                log.info(`识别到${bossName}材料数量: ${quantity}`);
                if (typeof InventoryRecordWriter !== "undefined") {
                    InventoryRecordWriter.appendSnapshot("首领材料", { [bossName]: quantity });
                }
                return quantity;
            } else {
                log.warn(`${bossName}材料识别失败，请检查相关设置`);
                // 识别失败与异常分支口径统一：返回 0，避免调用方用 undefined 做缺口计算得到 NaN
                return 0;
            }
        } catch (error) { if (Utils.isCancellationError(error)) throw error;
            notification.send(`${bossName}材料刷取失败，错误信息: ${error}`);
            return 0;
        }
    },
    
    // 获取技能书材料数量
    getMaterialCount: async function(bookName) {
        if (!Constants.bookToPosition.hasOwnProperty(bookName)) {
            log.error("无效的技能书名称: " + bookName);
            return [0, 0, 0];
        }
        
        const {country, row} = Constants.bookToPosition[bookName];
        const results = [0, 0, 0];
        
        try {
            await genshin.returnMainUi();
            await sleep(500);
            keyPress("F1");
            await OcrHelper.repeatOperationUntilTextFound({x: 250, y: 420, width: 100, height: 60, targetText: "秘境", stepDuration: 0, waitTime: 100, ifClick: true});
            await OcrHelper.repeatOperationUntilTextFound({x: 415, y: 390, width: 300, height: 195, targetText: "天赋", stepDuration: 0, waitTime: 100, ifClick: true});
            
            log.info(`正在点击${country}副本...`);
            try {
                await OcrHelper.waitAndClickImage(country, 700, 35, true, 1000);
            } catch (error) { if (Utils.isCancellationError(error)) throw error;
                // 秘境未解锁（检测到「待发现」标记）：跳过该材料数量识别，返回 null 以告知调用方跳过刷取
                if (error.message && error.message.includes("秘境未解锁")) {
                    log.warn(`⚠️ ${country}秘境未解锁，跳过材料数量识别`);
                    return null;
                }
                await sleep(500);
                moveMouseTo(1600, 300);
                leftButtonDown();
                await sleep(500);
                moveMouseTo(1600, 700);
                await sleep(500);
                moveMouseTo(1600, 500);
                await sleep(100);
                leftButtonUp();
                await sleep(1000);
                try {
                    await OcrHelper.waitAndClickImage(country, 700, 35, true, 3000);
                } catch (retryError) { if (Utils.isCancellationError(retryError)) throw retryError;
                    // 重试时命中秘境未解锁：跳过该材料数量识别，返回 null 以告知调用方跳过刷取
                    if (retryError.message && retryError.message.includes("秘境未解锁")) {
                        log.warn(`⚠️ ${country}秘境未解锁，跳过材料数量识别`);
                        return null;
                    }
                    throw retryError;
                }
            }
            
            await sleep(500);
            
            for (let col = 0; col < 3; col++) {
                const clickX = Constants.qualityPositions[col].x;
                const clickY = 504 + row * 105;
                
                log.info(`点击位置: (${clickX}, ${clickY})`);
                click(clickX, clickY);
                await sleep(400);
                
                const result = await OcrHelper.findImageAndOCR("assets/itemQuantityDetection.png", 200, 50, 0, 0);
                if (result !== false) {
                    const quantity = Utils.positiveIntegerJudgment(result);
                    results[col] = quantity;
                    log.info(`识别到${["绿色", "蓝色", "紫色"][col]}品质材料数量: ${quantity}`);
                } else {
                    log.warn("识别失败，将重试...");
                    click(clickX, clickY);
                    await sleep(1500);
                    const retryResult = await OcrHelper.findImageAndOCR("assets/itemQuantityDetection.png", 200, 50, 0, 0);
                    results[col] = retryResult !== false ? Utils.positiveIntegerJudgment(retryResult) : 0;
                }
                
                if (col != 2) click(800, 10);
                await sleep(1000);
            }
            
            if (typeof InventoryRecordWriter !== "undefined") {
                InventoryRecordWriter.appendSnapshot("天赋书", {
                    [`${bookName}·绿色`]: results[0],
                    [`${bookName}·蓝色`]: results[1],
                    [`${bookName}·紫色`]: results[2]
                });
            }
            return results;
        } catch (error) { if (Utils.isCancellationError(error)) throw error;
            log.error("获取材料数量时出错: " + error);
            return results;
        }
    },
    
    // 获取武器材料数量
    getWeaponMaterialCount: async function(materialName) {
        if (!Constants.weaponMaterialToPosition.hasOwnProperty(materialName)) {
            log.error("无效的武器材料名称: " + materialName);
            return [0, 0, 0, 0];
        }
        
        const {country, row} = Constants.weaponMaterialToPosition[materialName];
        const results = [0, 0, 0, 0];
        
        try {
            await genshin.returnMainUi();
            await sleep(500);
            keyPress("F1");
            await OcrHelper.repeatOperationUntilTextFound({x: 250, y: 420, width: 100, height: 60, targetText: "秘境", stepDuration: 0, waitTime: 100, ifClick: true});
            await OcrHelper.repeatOperationUntilTextFound({x: 415, y: 300, width: 300, height: 195, targetText: "武器", stepDuration: 0, waitTime: 100, ifClick: true});
            
            log.info(`正在点击${country}副本...`);
            try {
                await OcrHelper.waitAndClickImage(country, 700, 35, true, 1000);
            } catch (error) { if (Utils.isCancellationError(error)) throw error;
                // 秘境未解锁（检测到「待发现」标记）：跳过该材料数量识别，返回 null 以告知调用方跳过刷取
                if (error.message && error.message.includes("秘境未解锁")) {
                    log.warn(`⚠️ ${country}秘境未解锁，跳过材料数量识别`);
                    return null;
                }
                await sleep(500);
                moveMouseTo(1600, 300);
                leftButtonDown();
                await sleep(500);
                moveMouseTo(1600, 700);
                await sleep(500);
                moveMouseTo(1600, 500);
                await sleep(100);
                leftButtonUp();
                await sleep(1000);
                try {
                    await OcrHelper.waitAndClickImage(country, 700, 35, true, 3000);
                } catch (retryError) { if (Utils.isCancellationError(retryError)) throw retryError;
                    // 重试时命中秘境未解锁：跳过该材料数量识别，返回 null 以告知调用方跳过刷取
                    if (retryError.message && retryError.message.includes("秘境未解锁")) {
                        log.warn(`⚠️ ${country}秘境未解锁，跳过材料数量识别`);
                        return null;
                    }
                    throw retryError;
                }
            }
            
            await sleep(500);
            
            for (let col = 0; col < 4; col++) {
                const {x, y, quality} = Constants.weaponQualityPositions[col];
                const clickX = x;
                const clickY = 502 + row * 107;
                
                log.info(`点击${quality}品质材料位置: (${clickX}, ${clickY})`);
                click(clickX, clickY);
                await sleep(400);
                
                const result = await OcrHelper.findImageAndOCR("assets/itemQuantityDetection.png", 200, 50, 0, 0);
                if (result !== false) {
                    const quantity = Utils.positiveIntegerJudgment(result);
                    results[col] = quantity;
                    log.info(`识别到${quality}品质材料数量: ${quantity}`);
                } else {
                    log.warn(`${quality}品质识别失败，将重试...`);
                    click(clickX, clickY);
                    await sleep(1500);
                    const retryResult = await OcrHelper.findImageAndOCR("assets/itemQuantityDetection.png", 200, 50, 0, 0);
                    results[col] = retryResult !== false ? Utils.positiveIntegerJudgment(retryResult) : 0;
                }
                
                if (col != 3) click(800, 10);
                await sleep(500);
            }
            
            const record = {
                green: results[0],
                blue: results[1],
                purple: results[2],
                gold: results[3]
            };
            if (typeof InventoryRecordWriter !== "undefined") {
                InventoryRecordWriter.appendSnapshot("武器材料", {
                    [`${materialName}·绿色`]: record.green,
                    [`${materialName}·蓝色`]: record.blue,
                    [`${materialName}·紫色`]: record.purple,
                    [`${materialName}·金色`]: record.gold
                });
            }
            return record;
        } catch (error) { if (Utils.isCancellationError(error)) throw error;
            log.error("获取武器材料数量时出错: " + error);
            await sleep(1000);
            return { green: 0, blue: 0, purple: 0, gold: 0 };
        }
    }
};
