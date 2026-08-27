// OCR识别辅助模块
var OcrHelper = {
    // OCR识别角色名称（支持精确匹配、别名匹配、模糊匹配、部分包含匹配）
    recognizeText: async function(text, region, aliasMap, timeout, retry, max) {
        timeout = timeout || 100;
        retry = retry || 20;
        max = max || 5;
        
        const start = Date.now();
        let count = 0;
        const formalName = aliasMap[text] || text;
        const candidateNames = Object.values(aliasMap);
        let capture = null;
        // 首个识别到但未匹配目标的规范化角色名（用于调用方做循环轮数计数）
        let firstRecognizedName = null;
        
        const cleanText = function(str) {
            return str.replace(/[^\u4e00-\u9fa5a-zA-Z0-9\u3400-\u4dbf]/g, '').trim();
        };
        
        try {
            capture = captureGameRegion();
            const ocr = RecognitionObject.Ocr(region.x, region.y, region.width, region.height);
            ocr.threshold = 0.8;
            
            while (Date.now() - start < timeout && count < max) {
                try {
                    const resList = capture.findMulti(ocr);
                    for (const res of resList) {
                        let corrText = res.text;
                        for (const [wrong, correct] of Object.entries(Constants.replacementMap)) {
                            corrText = corrText.replace(new RegExp(wrong, 'g'), correct);
                        }
                        
                        // 清理OCR结果中的符号
                        const cleanedText = cleanText(corrText);
                        
                        // 第一步：精确匹配（清理后）
                        if (cleanedText === formalName) {
                            return { matched: true, text: formalName, x: res.x, y: res.y };
                        }

                        // 第二步：别名匹配（清理后）
                        const aliasMatch = aliasMap[cleanedText];
                        if (aliasMatch === formalName) {
                            log.info(`识别到[ ${cleanedText} ] 别名匹配为 [ ${aliasMatch} ]`);
                            return { matched: true, text: aliasMatch, x: res.x, y: res.y };
                        }

                        // 第三步：模糊匹配（清理后）
                        const fuzzyResult = Utils.fuzzyMatch(cleanedText, candidateNames);
                        if (fuzzyResult && fuzzyResult.match === formalName) {
                            log.info(`识别到[ ${cleanedText} ] 模糊匹配为 [ ${fuzzyResult.match} ]（分数：${fuzzyResult.score.toFixed(2)}）`);
                            return { matched: true, text: fuzzyResult.match, x: res.x, y: res.y };
                        }

                        // 第四步：部分包含匹配（清理后）
                        if (formalName.includes(cleanedText) && cleanedText.length >= 2) {
                            log.info(`识别到[ ${cleanedText} ] 部分匹配为 [ ${formalName} ]`);
                            return { matched: true, text: formalName, x: res.x, y: res.y };
                        }

                        // 第五步：反向包含匹配（清理后）
                        // 新规则：反向部分匹配成功的前提是字符数量相同，避免匹配到其他角色
                        for (const cand of candidateNames) {
                            const cleanedCand = cleanText(cand);
                            if (cleanedCand === formalName && cleanedText.length === cleanedCand.length && cleanedText.includes(cleanedCand.substring(0, Math.ceil(cleanedCand.length / 2))) && cleanedText.length >= 2) {
                                log.info(`识别到[ ${cleanedText} ] 反向部分匹配为 [ ${formalName} ]`);
                                return { matched: true, text: formalName, x: res.x, y: res.y };
                            }
                        }

                        if (firstRecognizedName === null) {
                            // 规范化：优先别名精确映射 → 已算出的模糊匹配结果 → 原始清理文本
                            firstRecognizedName = aliasMap[cleanedText] || (fuzzyResult ? fuzzyResult.match : null) || cleanedText;
                        }
                        log.info(`识别到[ ${cleanedText} ]，未匹配目标 [ ${formalName} ]`);
                    }
                } catch (e) { if (Utils.isCancellationError(e)) throw e;
                    count++; 
                    log.warn(`OCR重试${count}/${max}：${e.message}`); 
                }
                await sleep(retry);
            }
        } finally {
            if (capture) capture.dispose();
        }
        // 三态返回：目标匹配成功（matched:true）/ 识别到文本但未匹配目标（matched:false + 首个识别名）/ 什么都没识别到（false）
        if (firstRecognizedName !== null) {
            return { matched: false, text: firstRecognizedName };
        }
        return false;
    },
    
    // 识别多段文字OCR（U3：全项目无调用方，保留待用，内部统一迭代访问不依赖 Count 大小写）
    recognizeMultiText: async function(region, name) {
        return await Utils.retryTask(function() {
            const ocr = RecognitionObject.ocr(region.x, region.y, region.width, region.height);
            const capture = captureGameRegion();
            const resList = capture.findMulti(ocr);
            const textList = [];

            for (const res of resList) {
                let text = res.text ? res.text.trim() : "";
                for (const [wrong, correct] of Object.entries(Constants.replacementMap)) {
                    text = text.replace(new RegExp(wrong, 'g'), correct);
                }
                if (text) textList.push(text);
                if (res.Dispose) res.Dispose();
            }

            capture.dispose();
            return textList;
        }, name);
    },
    
    // 识别单个天赋等级
    getTalentLevel: async function(ocrRegion, talentName) {
        try {
            log.info(`${talentName}等级，OCR区域：x=${ocrRegion.x}, y=${ocrRegion.y}, w=${ocrRegion.width}, h=${ocrRegion.height}`);
            
            const allTexts = await Utils.ocrRecognizeWithRetry(
                ocrRegion.x, ocrRegion.y, ocrRegion.width, ocrRegion.height,
                `${talentName}等级识别`
            );
            
            const lvRegexList = [
                /Lv\.(\d+)/i,
                /1v\.(\d+)/i,
                /lv\.(\d+)/i,
                /LV\.(\d+)/,
                /1V\.(\d+)/,
                /[l1][vV]\.(\d+)/
            ];
            
            let level = null;
            
            if (allTexts && allTexts.length > 0) {
                for (const text of allTexts) {
                    for (const regex of lvRegexList) {
                        const match = text.match(regex);
                        if (match) {
                            level = parseInt(match[1], 10);
                            log.info(`${talentName}匹配到等级：${level} 级  文本：${text}`);
                            break;
                        }
                    }
                    if (level) break;
                }
                
                if (!level) {
                    for (const text of allTexts) {
                        const allNumbers = text.match(/\d+/g);
                        if (allNumbers && allNumbers.length > 0) {
                            const lastNum = parseInt(allNumbers[allNumbers.length - 1], 10);
                            if (!isNaN(lastNum) && lastNum >= 1 && lastNum <= 15) {
                                level = lastNum;
                                log.info(`${talentName}从文本中提取末尾数字作为等级：${level}（文本：${text}）`);
                                break;
                            }
                        }
                    }
                }
                
                if (!level) {
                    for (const text of allTexts) {
                        const numMatch = text.match(/\d+/);
                        if (numMatch) {
                            const num = parseInt(numMatch[0], 10);
                            if (!isNaN(num) && num >= 1 && num <= 15) {
                                level = num;
                                log.info(`${talentName}从文本中提取数字作为等级：${level}（文本：${text}）`);
                                break;
                            }
                        }
                    }
                }
            } else {
                log.warn(`${talentName}未识别到任何文本`);
            }
            
            return !isNaN(level) ? level : null;
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            log.error(`识别${talentName}等级出错：${e.message || e}`);
            return null;
        }
    },
    
    // 查找图片并OCR识别
    findImageAndOCR: async function(imagePath, ocrWidth, ocrHeight, offsetX, offsetY) {
        try {
            const templateMat = file.ReadImageMatSync(imagePath);
            const templateRo = RecognitionObject.TemplateMatch(templateMat);
            
            const captureRegion = captureGameRegion();
            const foundRegion = captureRegion.Find(templateRo);
            
            if (foundRegion.isEmpty()) {
                log.info(`未找到模板图片: ${imagePath}`);
                captureRegion.dispose();
                return false;
            }
            
            log.info("找到模板图片，位置({x},{y})", foundRegion.x, foundRegion.y);
            
            const ocrX = foundRegion.x + offsetX;
            const ocrY = foundRegion.y + offsetY;
            
            const ocrRo = RecognitionObject.Ocr(ocrX, ocrY, ocrWidth, ocrHeight);
            const ocrResult = captureRegion.Find(ocrRo);
            captureRegion.dispose();
            
            if (ocrResult.isEmpty() || !ocrResult.text || ocrResult.text.trim() === "") {
                log.info("OCR未识别到内容");
                return false;
            }
            
            log.info("OCR识别结果: {text}", ocrResult.text);
            return ocrResult.text.trim();
            
        } catch (error) { if (Utils.isCancellationError(error)) throw error;
            log.error("识别过程中出错: {error}", error);
            return false;
        }
    },
    // 判断秘境是否已解锁：在找到的秘境图片左上方区域匹配「待发现.png」
    // 匹配成功（检测到待发现标记）→ 未解锁返回 true；匹配失败 → 已解锁返回 false；检测失败按已解锁处理
    // capture 复用与找到图标同一帧的截图（不重新截图），避免滚动动画期间第二帧内容不一致导致误判
    isDomainLocked: async function(capture, foundX, foundY) {
        try {
            const lockTemplate = file.ReadImageMatSync("assets/RecognitionObject/待发现.png");
            const lockRo = RecognitionObject.TemplateMatch(lockTemplate, foundX - 45, foundY - 190, 200, 220);
            lockRo.threshold = 0.8; 
            const lockRes = capture.Find(lockRo);
            if (lockTemplate.Dispose) lockTemplate.Dispose();
            const locked = !lockRes.isEmpty();
            log.info(`秘境解锁检测：检测区域(${foundX - 45}, ${foundY - 190}, 200, 220)，${locked ? "❌ 检测到，秘境未解锁" : "✅ 秘境已解锁"}`);
            return locked;
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            log.warn(`秘境解锁检测失败：${e.message}，按已解锁处理继续`);
            return false;
        }
    },

    // 等待图片出现并点击
    waitAndClickImage: async function(imageName, extraWidth, extraHeight, ifClick, timeout, checkInterval, threshold, region) {
        extraWidth = extraWidth || 0;
        extraHeight = extraHeight || 0;
        ifClick = ifClick !== false;
        timeout = timeout || 10000;
        checkInterval = checkInterval || 500;
        threshold = typeof threshold === 'number' ? threshold : 0.8;
        
        const startTime = Date.now();
        // m2：兼容「无前缀名」（如 boss/wolf）与「完整路径」（如 assets/boss/wolf.png）两种传法
        const imagePath = imageName.startsWith('assets/') ? imageName : `assets/${imageName}.png`;
        const templateMat = file.ReadImageMatSync(imagePath);
        const searchX = region ? region.x : 0;
        const searchY = region ? region.y : 0;
        const searchW = region ? region.width : 1920;
        const searchH = region ? region.height : 1080;
        const recognitionObj = RecognitionObject.TemplateMatch(templateMat, searchX, searchY, searchW, searchH);
        recognitionObj.threshold = threshold;
        
        while (Date.now() - startTime < timeout) {
            let captureRegion = captureGameRegion();
            let result = captureRegion.Find(recognitionObj);

            if (!result.isEmpty()) {
                const regionInfo = region ? `，查找区域X${region.x}，Y${region.y}，W${region.width}，H${region.height}` : '';
                const matchScore = typeof result.matchScore === 'number' ? result.matchScore : null;
                const scoreInfo = matchScore === null ? '' : `，匹配得分${matchScore.toFixed(3)}`;
                log.info(`找到图片 ${imageName}，位置(${result.x}, ${result.y})${scoreInfo}，正在点击...${regionInfo}`);
                // 秘境解锁检测：仅适用于「国家+天赋/武器」命名秘境图标（如 至冬天赋/蒙德天赋/璃月武器/挪德卡莱武器），
                if (imageName.endsWith("天赋") || imageName.endsWith("武器")) {
                    const settleCapture = captureGameRegion();
                    const settleResult = settleCapture.Find(recognitionObj);
                    if (!settleResult.isEmpty()) {
                        captureRegion.dispose();
                        // 点击后检查是否解锁，解锁则点击失败，跳过执行
                        captureRegion = settleCapture;
                        result = settleResult;
                        log.info(`秘境解锁检测：位置(${result.x}, ${result.y})`);
                    } else {
                        settleCapture.dispose();
                    }
                    if (await this.isDomainLocked(captureRegion, result.x, result.y)) {
                        captureRegion.dispose();
                        throw new Error(`秘境未解锁，跳过执行`);
                    }
                }
                captureRegion.dispose();
                if (ifClick) click(result.x + extraWidth, result.y + extraHeight);
                await sleep(300);
                return true;
            }

            captureRegion.dispose();
            await sleep(checkInterval);
        }
        
        throw new Error(`等待图片 ${imageName} 超时`);
    },
    
    // 重复操作直到找到文字（支持多段文字识别并点击）
    repeatOperationUntilTextFound: async function(options) {
        const {
            x = 1210,
            y = 515,
            width = 200,
            height = 50,
            targetText = null,
            maxSteps = 100,
            stepDuration = 200,
            waitTime = 10,
            moveKey = "w",
            ifClick = false,
            returnText = false
        } = options || {};

        const escapeRegExp = function(string) {
            return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        };

        const textPattern = typeof targetText === 'string' 
            ? new RegExp(escapeRegExp(targetText)) 
            : targetText;

        let stepsTaken = 0;
        let foundText = null;
        
        while (stepsTaken <= maxSteps) {
            const captureRegion = captureGameRegion();
            const textArea = captureRegion.DeriveCrop(x, y, width, height);
            
            const ocr = RecognitionObject.ocrThis;
            const resList = textArea.findMulti(ocr);
            
            let foundX = null;
            let foundY = null;
            let foundWidth = null;
            let foundHeight = null;

            for (const res of resList) {
                let corrText = res.text;
                for (const [wrong, correct] of Object.entries(Constants.replacementMap)) {
                    corrText = corrText.replace(new RegExp(wrong, 'g'), correct);
                }

                const matchesTarget = targetText === null
                    ? corrText.trim().length > 0
                    : textPattern.test(corrText);

                if (matchesTarget) {
                    foundText = corrText;
                    foundX = res.x;
                    foundY = res.y;
                    foundWidth = res.width;
                    foundHeight = res.height;
                    break;
                }
            }

            captureRegion.dispose();
            textArea.dispose();

            if (foundText !== null) {
                log.info(`检测到${targetText === null ? '文字' : '目标文字'}: ${foundText}`);
                if (ifClick && foundX != null && foundY != null) {
                    // 点击文字中心点
                    const w = foundWidth || 0;
                    const h = foundHeight || 0;
                    const centerX = Math.round(x + foundX + w / 2);
                    const centerY = Math.round(y + foundY + h / 2);
                    // 验证坐标有效性
                    if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) {
                        log.warn(`点击坐标无效: (${centerX}, ${centerY})，使用左上角坐标`);
                        click(Math.round(x + foundX), Math.round(y + foundY));
                    } else {
                        log.debug(`点击坐标: (${centerX}, ${centerY}), 文字区域: x=${foundX}, y=${foundY}, w=${w}, h=${h}`);
                        click(centerX, centerY);
                    }
                    // 点击后等待界面切换
                    await sleep(500);
                }
                return returnText ? foundText : true;
            }
            
            if (stepsTaken >= maxSteps) {
                throw new Error(`检查次数超过最大限制: ${maxSteps}，未查询到文字"${targetText}"`);
            }
            
            if (stepDuration != 0) {
                keyDown(moveKey);
                await sleep(stepDuration);
                keyUp(moveKey);
            }
            await sleep(waitTime);
            stepsTaken++;
        }
    }
};
