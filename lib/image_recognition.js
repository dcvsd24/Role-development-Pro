var ImageRecognition = {
    /**
     * OCR识别函数
     * @param {number} timeout - 超时时间（毫秒）
     * @param {Object} region - 识别区域（小写 x/y/width/height，与项目其他模块约定一致）
     * @returns {string | null}  - 返回清理后的识别文字（无特殊符号，仅保留/）
     */
    ocrRecognize: function (timeout = 5000, region) {
        let startTime = Date.now();
        let attemptCount = 0;

        while (Date.now() - startTime < timeout) {
            attemptCount++;
            let gameCaptureRegion = null;
            let croppedRegion = null;
            
            try {
                gameCaptureRegion = captureGameRegion();

                croppedRegion = gameCaptureRegion.deriveCrop(
                    region.x,
                    region.y,
                    region.width,
                    region.height
                );

                let results = croppedRegion.findMulti(RecognitionObject.ocrThis);

                // 统一迭代访问（不依赖 count/Count 大小写），消除 M1 大小写不一致风险
                let text = "";
                if (results) {
                    for (const item of results) {
                        if (item && item.text && item.text.trim()) {
                            text += item.text + " ";
                        }
                    }
                }

                const cleanedText = ImageRecognition.cleanOcrText(text);
                if (cleanedText) {
                    return cleanedText;
                }

                if (attemptCount % 100 === 0) {
                    log.debug(`OCR识别第${attemptCount}次重试：未识别到文本`);
                }
            } catch (error) { if (Utils.isCancellationError(error)) throw error;
                if (attemptCount % 100 === 0) {
                    log.warn(`OCR识别发生错误: ${error.message}`);
                }
            } finally {
                if (croppedRegion) croppedRegion.dispose();
                if (gameCaptureRegion) gameCaptureRegion.dispose();
            }
        }
        return null;
    },

    /**
     * 清理Ocr识别文本：仅保留中文、数字、字母、白名单符号（/），去除所有其他标点/特殊符号
     * @param {string} text - 原始识别文本
     * @returns {string} 清理后的文本
     * 注：仅内部使用（被 ocrRecognize 调用）
     */
    cleanOcrText: function (text) {
        if (!text || typeof text !== 'string') return '';
        // 正则说明：
        // [\u4e00-\u9fa5] 匹配中文
        // [0-9a-zA-Z] 匹配数字、大小写字母
        // \/ 匹配白名单符号 /（需转义）
        // + 匹配1个及以上符合规则的字符
        const validCharRegex = /[\u4e00-\u9fa50-9a-zA-Z\/]+/g;
        // 提取所有有效字符片段，以空格拼接保留词边界（避免多段 OCR 无分隔合并导致匹配失败）
        const validParts = text.match(validCharRegex) || [];
        return validParts.join(' ').replace(/\s+/g, ' ').trim();
    },

    /**
     * 识别背包内经验书数量（通过 CountInventoryItem API 批量查询）
     * @return {Promise<{[key: string]: number}|null>} 返回经验书名称和数量的对象，失败返回null
     */
    IdentifyExperienceBook: async function() {
        try {
            const result = {};
            const expBookNames = ['大英雄的经验', '冒险家的经验', '流浪者的经验'];

            log.info(`开始通过 API 批量查询经验书数量（共 ${expBookNames.length} 项）`);

            const countDict = await Utils.countInventoryItemBatch(expBookNames, GridScreenName.CharacterDevelopmentItems);

            for (const bookName of expBookNames) {
                const val = countDict[bookName];
                if (val === undefined || val === null) {
                    log.warn(`未找到【${bookName}】，可能背包中不存在`);
                    result[bookName] = 0;
                } else if (val === -2) {
                    log.warn(`找到【${bookName}】但数字识别失败，视为 0`);
                    result[bookName] = 0;
                } else if (val < 0) {
                    log.warn(`查询【${bookName}】返回异常值 ${val}，视为 0`);
                    result[bookName] = 0;
                } else {
                    result[bookName] = val;
                    log.info(`识别结果：【${bookName}】数量为 ${val}`);
                }
            }

            return result;
        } catch (error) { if (Utils.isCancellationError(error)) throw error;
            log.error(`识别经验书失败：${error.message}`);
            return null;
        }
    },

    /**
     * 识别世界等级
     * @return {Promise<boolean|string>}
     * @constructor
     */
    WorldLevelRecognition: async function(){
        await genshin.returnMainUi();
        await sleep(800);
        keyPress("VK_ESCAPE")
        await sleep(800);
        click(720,260)
        await sleep(800);
        click(980,830)
        await sleep(800);

        let worldLevel = this.ocrRecognize(2000,{x:680, y:400, width:150, height:100})
        if (worldLevel){
            worldLevel = OcrNumberCorrector.correct(worldLevel);
            log.info(`识别到世界等级为：${worldLevel}`);
            return worldLevel;
        } else {return false}
    }
}

var OcrNumberCorrector = {
    // OCR识别错误映射表：覆盖大小写形似字符（注：仅内部使用，被 WorldLevelRecognition 调用）
    errorMap: new Map([
    ['o', '0'], ['O', '0'],
    ['l', '1'], ['I', '1'], ['|', '1'], ['i', '1'],
    ['z', '2'], ['Z', '2'],
    ['s', '5'], ['S', '5'],
    ['B', '8'],
    ['g', '9'], ['G', '9'], ['q', '9'], ['Q', '9'],
    ['b', '6'], ['B', '8'], ['p', '9'],
    ['d', '0'], ['D', '0'],
    ['e', '3'], ['E', '3'],
    ['f', '7'], ['F', '7'],
    ['t', '7'], ['T', '7'],
    ['y', '4'], ['Y', '4']
]),

    // 白名单字符集合：数字 + /
    whitelist : new Set(['/', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9']),

    /**
     * 校正OCR识别的字符串
     * @param {string} rawStr - OCR识别的原始字符串
     * @returns {string} 校正后的结果（仅含数字和/）
     */
    correct: function(rawStr) {
    if (typeof rawStr !== 'string') return '';

    return rawStr.split('')
        .map(char => {
            return this.errorMap.has(char) ? this.errorMap.get(char) : char;
        })
        .filter(char => {
            return this.whitelist.has(char);
        })
        .join('');
    }
}