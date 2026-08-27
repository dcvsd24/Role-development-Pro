// 工具函数模块
var Utils = {
    // 消息缓冲区
    _messageBuffer: '',
    
    // 累积消息函数
    addNotification: function(message) {
        this._messageBuffer += message + '\n';
    },
    
    // 发送累积的消息
    sendBufferedNotifications: function() {
        if (this._messageBuffer.trim()) {
            notification.send(this._messageBuffer.trim());
            this._messageBuffer = '';
        }
    },
    
    // 获取当前时间戳
    getNow: function() {
        return new Date().getTime();
    },
    
    // 判断异常是否为 BGI 停止快捷键触发的任务取消（TaskCanceledException / OperationCanceledException / 中文「取消任务」变体）
    // 注意：dispatcher 系列 API 手动停止时抛出的错误消息为「取消自动任务」，若不在匹配列表内，
    // 阶段级 catch 会把取消当作普通失败继续执行后续阶段
    isCancellationError: function(e) {
        if (!e) return false;
        const msg = (e && e.message) ? String(e.message) : String(e);
        return msg.includes('A task was canceled') ||
               msg.includes('The operation was canceled') ||
               msg.includes('TaskCanceledException') ||
               msg.includes('OperationCanceledException') ||
               msg.includes('取消自动任务') ||
               msg.includes('取消任务');
    },
    
    // 检查是否为正整数
    positiveIntegerJudgment: function(testNumber) {
        if (typeof testNumber === 'string') {
            const cleaned = testNumber.replace(/[^\d]/g, '');
            testNumber = parseInt(cleaned, 10);
        }
        
        if (typeof testNumber !== 'number' || isNaN(testNumber)) {
            throw new Error(`无效的值: ${testNumber} (必须为数字)`);
        }
        
        if (!Number.isInteger(testNumber)) {
            throw new Error(`必须为整数: ${testNumber}`);
        }
        
        return testNumber;
    },
    
    // 解析并验证数量字符串
    parseAndValidateCounts: function(input, expectedCount) {
        if (typeof input !== 'string') {
            throw new Error(`Input must be a string, got ${typeof input}`);
        }
        
        const parts = input.split('-');
        const result = [];
        
        for (let i = 0; i < expectedCount; i++) {
            if (i < parts.length) {
                const num = parseInt(parts[i], 10);
                if (isNaN(num) || num < 0 || !Number.isInteger(num)) {
                    throw new Error(`Invalid number at position ${i}: '${parts[i]}'. Must be a non-negative integer.`);
                }
                result.push(num);
            } else {
                result.push(0);
            }
        }
        
        return result;
    },
    
    // 读取JSON文件
    readJson: function(path, defaultVal) {
        if (defaultVal === undefined || defaultVal === null) {
            defaultVal = {};
        }
        if (typeof file.readTextSync !== "function") {
            log.error("BGI方法readTextSync不可用");
            return defaultVal;
        }
        
        if (typeof file.isFolder === "function" && file.isFolder(path)) {
            return defaultVal;
        }
        
        try {
            const content = file.readTextSync(path);
            if (!content || content.trim() === "") {
                log.warn(`文件${path}为空，使用默认值`);
                file.writeTextSync(path, JSON.stringify(defaultVal, null, 2));
                return defaultVal;
            }
            let parsed = JSON.parse(content);
            if (path === Constants.MAPPING_PATH) {
                return parsed || defaultVal;
            }
            if (Array.isArray(parsed)) {
                let mergedObj = {};
                parsed.forEach(item => {
                    if (typeof item === "object" && item !== null) {
                        Object.assign(mergedObj, item);
                    }
                });
                parsed = mergedObj;
            }
            return parsed || defaultVal;
        } catch (error) { if (Utils.isCancellationError(error)) throw error;
            if (error.message && error.message.includes("Could not find file")) {
                try {
                    file.writeTextSync(path, JSON.stringify(defaultVal, null, 2));
                } catch (writeErr) { if (Utils.isCancellationError(writeErr)) throw writeErr;
                    log.error(`创建${path}失败: ${writeErr.message}`);
                }
                return defaultVal;
            }
            log.info(`文件${path}解析失败: ${error.message}`);
            return defaultVal;
        }
    },
    
    // 转义正则表达式中的特殊字符
    escapeRegExp: function(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    },
    
    // 通用重试函数
    retryTask: async function(task, name, max, delay) {
        max = max || Constants.OCR_MAX_RETRIES;
        delay = delay || Constants.OCR_RETRY_WAIT;
        let res = null, count = 0;
        while (count < max) {
            try {
                res = await task();
                if (res) return res;
            } catch (e) { if (Utils.isCancellationError(e)) throw e;
                log.warn(`${name}重试${count+1}/${max}：${e.message}`); 
            }
            count++;
            if (count < max) await sleep(delay);
        }
        log.error(`${name}重试${max}次失败`);
        return res;
    },
    
    // 带超时的重试函数
    retryTaskWithTimeout: async function(task, name, interval, maxAttempts) {
        let res = null, count = 0;
        while (count < maxAttempts) {
            try {
                res = await task();
                if (res && (Array.isArray(res) ? res.length > 0 : res !== "")) return res;
            } catch (e) { if (Utils.isCancellationError(e)) throw e;
                log.warn(`${name}重试${count+1}/${maxAttempts}：${e.message}`); 
            }
            count++;
            if (count < maxAttempts) await sleep(interval);
        }
        log.error(`${name}重试${maxAttempts}次失败，超时`);
        return res;
    },
    
    // 提取数字
    extractNumber: function(textList, keyword) {
        for (const text of textList) {
            if (text.includes(keyword)) {
                const match = text.match(/(\d+)/);
                if (match && !isNaN(parseInt(match[1]))) {
                    return parseInt(match[1]);
                }
            }
        }
        return 0;
    },
    
    // 提取纯区域特产名称
    extractPureLocalName: function(text) {
        const pureName = text.replace(/采集区域|采集点|获取区域/g, "").trim();
        return pureName || "未知区域特产";
    },
    
    // 从文件名提取数量
    extractLocalCountFromFileName: function(fileName) {
        const countMatch = fileName.match(/(\d+)个/);
        if (countMatch && countMatch[1]) {
            const count = parseInt(countMatch[1], 10);
            return isNaN(count) ? Constants.DEFAULT_LOCAL_COUNT : count;
        }
        return Constants.DEFAULT_LOCAL_COUNT;
    },
    
        // 模糊匹配
    fuzzyMatch: function(target, candidates) {
        const levenshtein = function(a, b) {
            const m = a.length + 1, n = b.length + 1;
            const d = Array(m).fill(null).map(function() { return Array(n).fill(0); });
            for (let i = 0; i < m; i++) d[i][0] = i;
            for (let j = 0; j < n; j++) d[0][j] = j;
            for (let i = 1; i < m; i++) {
                for (let j = 1; j < n; j++) {
                    const cost = a[i-1] === b[j-1] ? 0 : 1;
                    d[i][j] = Math.min(d[i-1][j]+1, d[i][j-1]+1, d[i-1][j-1]+cost);
                }
            }
            return d[m-1][n-1];
        };
        
        let validMatches = [];
        for (const cand of candidates) {
            const dist = levenshtein(target, cand);
            const maxLen = Math.max(target.length, cand.length);
            const allowedErrors = maxLen <= 4 ? 1 : 2;
            
            if (dist <= allowedErrors) {
                const similarity = 1 - dist / maxLen;
                const kwMatch = cand.includes(target) || target.includes(cand);
                const score = similarity * 0.8 + (kwMatch ? 0.2 : 0);
                validMatches.push({ match: cand, score: score });
            }
        }
        
        if (validMatches.length === 0) {
            return null;
        }
        
        validMatches.sort(function(a, b) { return b.score - a.score; });
        
        if (validMatches.length > 1 && validMatches[0].score === validMatches[1].score) {
            return null;
        }
        
        return validMatches[0];
    },
    
    // 计算武器魔物材料需求
    calcWeaponMonsterNeed: function(curr, target, type) {
        const rules = type === 1 ? 
            { 20: 3, 40: 12, 50: 27, 60: 42, 70: 81, 80: 162 } :
            { 20: 5, 40: 18, 50: 27, 60: 54, 70: 126, 80: 243 };
        
        let total = 0;
        if (curr < target) {
            for (const lvl of [20, 40, 50, 60, 70, 80]) {
                if (lvl >= curr && lvl <= target) {
                    total += rules[lvl] || 0;
                }
            }
        }
        return total;
    },

    // 转换材料为三星等价物
    convertToThreeStar: function(star1, star2, star3) {
        const totalStar2 = star2 + Math.floor(star1 / 3);
        const remainStar1 = star1 % 3;
        const totalStar3 = star3 + Math.floor(totalStar2 / 3);
        const remainStar2 = totalStar2 % 3;
        
        return {
            totalStar3,
            remainStar1,
            remainStar2,
            allConvert: totalStar3 + Math.floor((remainStar2 + Math.floor(remainStar1 / 3)) / 3)
        };
    },
    
    // 计算角色突破所需魔物材料
    calcCharBreakMonster: function(currLvl, targetLvl) {
        const need = { star1: 0, star2: 0, star3: 0 };
        const validLevels = [20, 40, 50, 60, 70, 80];
        const isAlreadyBroken = currLvl === '已突破';
        const isTargetValidNumber = typeof targetLvl === 'number' && validLevels.includes(targetLvl);
        const isCurrValidNumber = typeof currLvl === 'number' && validLevels.includes(currLvl);
        const isLevelDescend = isCurrValidNumber && isTargetValidNumber && targetLvl < currLvl;
        
        if (isAlreadyBroken || !isTargetValidNumber || isLevelDescend) {
            return need;
        }
        
        for (const lvl of Constants.charLevels) {
            if (lvl >= currLvl && lvl <= targetLvl) {
                const rules = Constants.charBreakMonsterRules[lvl];
                if (rules) {
                    need.star1 += rules.star1 || 0;
                    need.star2 += rules.star2 || 0;
                    need.star3 += rules.star3 || 0;
                }
            }
        }
        return need;
    },
    
    // 计算天赋升级所需魔物材料
    calcTalentMonster: function(currTalents, targetTalents) {
        const need = { star1: 0, star2: 0, star3: 0 };
        
        for (let i = 0; i < 3; i++) {
            const curr = currTalents[i] || 1;
            const target = targetTalents[i] || 1;
            
            if (curr >= target) continue;
            
            for (let lvl = curr; lvl < target; lvl++) {
                const key = `${lvl}-${lvl+1}`;
                const rules = Constants.talentMonsterRules[key] || { star1: 0, star2: 0, star3: 0 };
                need.star1 += rules.star1;
                need.star2 += rules.star2;
                need.star3 += rules.star3;
            }
        }
        
        return need;
    },
    
    // 计算角色突破所需区域特产
    calcCharBreakLocal: function(currLvl, targetLvl) {
        let need = 0;
        const breakLevels = Object.keys(Constants.charBreakLocalRules).map(Number).sort(function(a, b) { return a - b; });
        const needLevels = breakLevels.filter(function(lvl) { return lvl >= currLvl && lvl <= targetLvl; });
        
        needLevels.forEach(function(lvl) {
            need += Constants.charBreakLocalRules[lvl];
        });
        
        return need;
    },
    
    // 清理文本
    cleanText: function(str) {
        return str.replace(/[。：、，.·-]/g, "").trim();
    },

    // 获取系统屏幕 DPI 缩放比例（用于 setGameMetrics 的 dpi 参数）
    // 不同系统缩放的用户都能得到精确的相对位移（moveMouseBy 实际位移 = 传入值 × 系统缩放 ÷ 配置dpi）
    getScreenDpiScale: function() {
        try {
            if (typeof genshin !== 'undefined' && genshin.ScreenDpiScale) {
                return genshin.ScreenDpiScale;
            }
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
        }
        return 1; // 兜底：无法获取时按 100% 缩放处理
    },

    // 掩码UID，保护隐私（显示前3位和后3位）
    maskUid: function(uid) {
        if (!uid || uid === Constants.DEFAULT_UID || uid.length < 7) return uid;
        return uid.substring(0, 3) + "***" + uid.substring(uid.length - 3);
    },

    // 解析天赋等级
    parseTalent: function(text) {
        const match = text.trim().match(/Lv\.(\d+)/);
        return match && match[1] ? match[1] : "";
    },
    
    // 切换队伍
    switchPartySafe: async function(teamName) {
        log.info(`准备切换队伍: "${teamName}"`);
        
        if (!teamName) {
            log.warn("未指定队伍名称，跳过切换队伍");
            return false;
        }
         
        try {
            log.info(`正在切换队伍: ${teamName}`);
            const result = await genshin.switchParty(teamName);
            if (result) {
                log.info(`成功切换到队伍: ${teamName}`);
            } else {
                log.warn(`切换队伍 "${teamName}" 失败`);
            }
            return result;
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            log.error(`切换队伍出错: ${e.message}`);
            return false;
        }
    },

    // OCR识别工具函数
    ocrRecognize: async function(x, y, width, height, returnCoordinates = false) {
        const ocr = RecognitionObject.ocr(x, y, width, height);
        const capture = captureGameRegion();
        const resList = capture.findMulti(ocr);
        const items = [];
        for (let i = 0; i < resList.Count; i++) {
            const res = resList[i];
            if (res.text) {
                let text = res.text;
                for (const [wrong, correct] of Object.entries(Constants.replacementMap)) {
                    text = text.replace(new RegExp(wrong, 'g'), correct);
                }
                if (returnCoordinates) {
                    items.push({
                        text: text,
                        x: res.x,
                        y: res.y,
                        width: res.width,
                        height: res.height
                    });
                } else {
                    items.push(text);
                }
            }
            if (res.Dispose) res.Dispose();
        }
        capture.dispose();
        return items;
    },

    // 带重试的OCR识别
    ocrRecognizeWithRetry: async function(x, y, width, height, taskName, interval = 200, maxAttempts = 20, returnCoordinates = false) {
        return await this.retryTaskWithTimeout(async () => {
            return await this.ocrRecognize(x, y, width, height, returnCoordinates);
        }, taskName, interval, maxAttempts);
    },

    // 通过 CountInventoryItem API 查询单个背包物品数量
    // itemName: 物品名称
    // screenName: GridScreenName 枚举值（如 GridScreenName.CharacterDevelopmentItems）
    // 返回: 数量（>= 0 成功），-1 未找到，-2 找到但数字识别失败
    countInventoryItem: async function(itemName, screenName) {
        try {
            const param = new CountInventoryItemParam();
            param.GridScreenName = screenName;
            param.ItemName = itemName;
            param.IconRecognitionMode = ItemIconRecognitionMode.Item;
            const count = await dispatcher.RunCountInventoryItemTask(param);
            return count;
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            log.error(`API 查询物品【${itemName}】失败: ${e.message}`);
            return -1;
        }
    },

    // 通过 CountInventoryItem API 批量查询背包物品数量
    // itemNames: 物品名称数组
    // screenName: GridScreenName 枚举值（如 GridScreenName.CharacterDevelopmentItems）
    // 返回: Dict<物品名, 数量>（键不存在视为未找到=0，值为 -2 表示找到但数字识别失败）
    // 注意：批量查询必须通过 SoloTask + Config 方式，CountInventoryItemParam 类不支持 itemNames 数组
    countInventoryItemBatch: async function(itemNames, screenName) {
        const result = {};
        if (!itemNames || !Array.isArray(itemNames) || itemNames.length === 0) return result;
        try {
            const countDict = await dispatcher.runTask(new SoloTask("CountInventoryItem", {
                gridScreenName: screenName,
                itemNames: itemNames
            }));
            if (countDict && typeof countDict === 'object') {
                for (const key in countDict) {
                    if (Object.prototype.hasOwnProperty.call(countDict, key)) {
                        result[key] = countDict[key];
                    }
                }
            }
            return result;
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            log.error(`API 批量查询物品失败（共 ${itemNames.length} 项）: ${e.message}`);
            return result;
        }
    },

    // 智能查询背包物品数量（先查养成道具页，未找到再查材料页）
    // itemName: 物品名称
    // 返回: 数量（>= 0），未找到或识别失败返回 0
    countInventoryItemSmart: async function(itemName) {
        if (!itemName || itemName.trim() === '') return 0;

        // 先查养成道具页
        let count = await this.countInventoryItem(itemName, GridScreenName.CharacterDevelopmentItems);
        if (count >= 0) {
            log.info(`物品【${itemName}】数量: ${count}（养成道具页）`);
            return count;
        }

        // 未找到，查材料页
        count = await this.countInventoryItem(itemName, GridScreenName.Materials);
        if (count >= 0) {
            log.info(`物品【${itemName}】数量: ${count}（材料页）`);
            return count;
        }

        log.warn(`物品【${itemName}】在养成道具和材料页均未找到`);
        return 0;
    }
};
