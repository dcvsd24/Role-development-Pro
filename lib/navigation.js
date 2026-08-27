// 导航模块
var Navigation = {
    // 检测传送结束
    tpEndDetection: async function() {
        const region1 = RecognitionObject.ocr(1690, 230, 75, 350);
        const region2 = RecognitionObject.ocr(872, 681, 180, 30);
        let tpTime = 0;
        await sleep(1500);
        
        while (tpTime < 300) {
            let capture = captureGameRegion();
            let res1 = capture.find(region1);
            let res2 = capture.find(region2);
            capture.dispose();
            if (!res1.isEmpty() || !res2.isEmpty()) {
                log.info("传送完成");
                await sleep(1000);
                click(960, 810);
                await sleep(500);
                return;
            }
            tpTime++;
            await sleep(100);
        }
        throw new Error('传送时间超时');
    },
    
    // 寻找特定图片并点击，未找到则滚动画面
    findAndClickWithScroll: async function(targetRo, stopRo, options) {
        const {
            maxAttempts = 10,
            scrollNum = 9,
            clickDelay = 500
        } = options || {};
        
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const captureRegion = captureGameRegion();
            
            const targetResult = captureRegion.find(targetRo);
            if (!targetResult.isEmpty()) {
                log.info(`找到目标图片，位置: (${targetResult.x}, ${targetResult.y})`);
                targetResult.click();
                captureRegion.dispose();
                await sleep(clickDelay);
                return;
            }
            
            log.info(`第 ${attempt + 1} 次尝试未找到目标图片，将滚动画面...`);
            for (let i = 0; i < scrollNum; i++) {
                await keyMouseScript.runFile("data/滚轮下滑.json");
            }
            
            const stopResult = captureRegion.find(stopRo);
            captureRegion.dispose();
            if (!stopResult.isEmpty()) {
                throw new Error(`遇到终止图片，停止寻找目标图片。终止位置: (${stopResult.x}, ${stopResult.y})`);
            }
        }
        
        throw new Error(`在 ${maxAttempts} 次尝试后仍未找到目标图片`);
    },
    
    // 征讨之花领奖导航
    autoNavigateToReward: async function() {
        const boxIconRo = RecognitionObject.TemplateMatch(file.ReadImageMatSync("assets/box.png"));
        const rewardTextRo = RecognitionObject.Ocr(1210, 515, 200, 50);
        let advanceNum = 0;
        
        middleButtonClick();
        await sleep(800);
        moveMouseBy(0, 1030);
        await sleep(400);
        moveMouseBy(0, 920);
        await sleep(400);
        moveMouseBy(0, 710);
        log.info("开始领奖");
        
        while (true) {
            let captureRegion = captureGameRegion();
            let rewardTextArea = captureRegion.DeriveCrop(1210, 515, 200, 50);
            let rewardResult = rewardTextArea.find(RecognitionObject.ocrThis);
            
            if (rewardResult.text == "接触征讨之花") {
                log.info(`总计前进第${advanceNum}次`);
                log.info("已到达领奖点，检测到文字: " + rewardResult.text);
                captureRegion.dispose();
                return;
            } else if (advanceNum > 150) {
                log.info(`总计前进第${advanceNum}次`);
                captureRegion.dispose();
                throw new Error('前进时间超时');
            }
            
            for (let i = 0; i < 100; i++) {
                // 释放上一帧捕获区域，避免 while 循环内重复捕获导致资源泄漏
                if (captureRegion) captureRegion.dispose();
                captureRegion = captureGameRegion();
                let iconRes = captureRegion.Find(boxIconRo);
                let climbTextArea = captureRegion.DeriveCrop(1685, 1030, 65, 25);
                let climbResult = climbTextArea.find(RecognitionObject.ocrThis);
                captureRegion.dispose();
                climbTextArea.dispose();
                
                if (climbResult.text == "Space") {
                    log.info("检侧进入攀爬状态，尝试脱离");
                    keyPress("x");
                    await sleep(1000);
                    keyDown("a");
                    await sleep(800);
                    keyUp("a");
                    keyDown("w");
                    await sleep(800);
                    keyUp("w");
                }
                
                if (iconRes.isEmpty()) {
                    log.warn("未找到图标，重试中");
                    await sleep(100);
                    continue;
                }
                
                if (iconRes.x >= 920 && iconRes.x <= 980 && iconRes.y <= 540) {
                    advanceNum++;
                    break;
                } else {
                    if (iconRes.y >= 520) moveMouseBy(0, 920);
                    let adjustAmount = iconRes.x < 920 ? -20 : 20;
                    let distanceToCenter = Math.abs(iconRes.x - 920);
                    let scaleFactor = Math.max(1, Math.floor(distanceToCenter / 50));
                    let adjustAmount2 = iconRes.y < 540 ? scaleFactor : 10;
                    moveMouseBy(adjustAmount * adjustAmount2, 0);
                    await sleep(100);
                }
                
                if (i > 20) {
                    throw new Error('视野调整超时');
                }
            }
            
            keyDown("w");
            await sleep(200);
            keyUp("w");
        }
    },
    
    // 前往秘境
    gotoAutoDomain: async function(imageName, partyName, domainRounds) {
        imageName = imageName || "bookDomain";
        partyName = partyName || settings.teamName;
        domainRounds = domainRounds || 1;
        await sleep(1000);
        
        moveMouseTo(960, 580);
        leftButtonDown();
        await sleep(500);
        moveMouseTo(965, 700);
        await sleep(500);
        moveMouseTo(961, 300);
        await sleep(500);
        leftButtonUp();
        await sleep(500);
        moveMouseTo(50, 50);
        await sleep(400);
        
        await OcrHelper.waitAndClickImage(imageName, 0, 0, true, 10000, 500, 0.8, {x: 715, y: 698, width: 474, height: 243});
        try {
            await OcrHelper.repeatOperationUntilTextFound({
                x: 1640, y: 960, width: 200, height: 100,
                targetText: "传送",
                stepDuration: 0, maxSteps: 25, waitTime: 100, ifClick: true
            });
        } catch (error) { if (Utils.isCancellationError(error)) throw error;
            log.info("秘境未开启");
            await genshin.returnMainUi();
            throw new Error(`秘境未在开启时间，跳过执行`);
        }
        
        log.info("开始前往秘境");
        //await sleep(1000);
        //await click(1691, 1012);
        await sleep(1000);
        await this.tpEndDetection();
        await sleep(3000);
        
        let enterAttempts = 0;
        while (enterAttempts < 3) {
            try {
                const foundText = await OcrHelper.repeatOperationUntilTextFound({
                    x: 1155, y: 398, width: 375, height: 340,
                    stepDuration: 200, waitTime: 100,
                    returnText: true
                });
                // 如果检测到晶蝶相关文字（OCR可能误识别为S七等），说明还没到秘境入口
                // 注意：排除"左Ctrl"等键盘提示的误识别（OCR常把"左Ctrl"识别为"左C七rl"）
                if (foundText && (foundText.includes("晶蝶") || foundText.includes("七") || foundText.includes("蝶")) && !foundText.includes("Ctrl") && !foundText.includes("左C")) {
                    enterAttempts++;
                    log.info(`检测到晶蝶，第${enterAttempts}次重试，继续前进...`);
                    if (enterAttempts >= 3) {
                        throw new Error(`检测到晶蝶超过3次，可能秘境未开启`);
                    }
                    // 主动前进一段距离，避免原地循环检测
                    keyDown("w");
                    await sleep(2500);
                    keyUp("w");
                    continue;
                }
                // 过滤画面零散误识别：文字至少3个字才停止前进
                if (foundText && foundText.replace(/\s/g, '').length < 3) {
                    log.info(`检测到零散文字"${foundText}"，未到达秘境入口，继续前进...`);
                    keyDown("w");
                    await sleep(1500);
                    keyUp("w");
                    continue;
                }
                log.info(`检测到文字: ${foundText}，停止前进`);
                break;
            } catch (error) { if (Utils.isCancellationError(error)) throw error;
                enterAttempts++;
                log.info(`未检测到文字，第${enterAttempts}次重试，正在前进...`);
                if (enterAttempts >= 3) {
                    throw new Error(`进入秘境失败，已重试3次`);
                }
                await sleep(500);
            }
        }
        
        const domainParam = new AutoDomainParam();
        
        domainParam.PartyName = partyName || settings.teamName;
        log.info(`切换队伍: ${domainParam.PartyName}`);
        domainParam.DomainName = "";// 传入空字符串防止使用本体的秘境名称。
        domainParam.SpecifyResinUse = true;// 是否指定树脂使用
        domainParam.AutoArtifactSalvage = false;//结束后是否自动分解圣遗物
        domainParam.OriginalResinUseCount = domainRounds;//用原粹树脂刷取副本次数
        domainParam.CondensedResinUseCount = 0;//用浓缩树脂刷取副本次数
        domainParam.TransientResinUseCount = 0;//使用须臾树脂刷取副本次数
        domainParam.FragileResinUseCount = 0;//使用脆弱树脂刷取副本次数
        
        await dispatcher.runAutoDomainTask(domainParam);
        await sleep(500);
    }
};
