/**
 * Wiki 网页数据获取模块
 * 从 bilibili wiki 获取角色/武器培养材料信息（纯网页抓取，无本地数据依赖）
 */
var WikiFetcherWeb = {
    WIKI_BASE_URL: "https://wiki.biligame.com/ys/",
    _hasFirstRequestSent: false, // 全局标记：是否已发送首次请求

    /**
     * 通用的HTTP请求函数（带延迟和重试机制）
     * @param {string} url - 请求URL
     * @param {string} description - 请求描述（用于日志和错误消息）
     * @param {string} errorType - 错误类型："character" 或 "weapon" 或 "material"（用于错误消息）
     * @returns {string|null} - HTML内容或null
     * @throws {Error} - 404状态码立即报错，超过最大重试次数时抛出错误
     */
    async fetchPage(url, description, errorType = null) {
        try {
            log.info(`📌 正在获取${description}...`);

            // 首次请求（角色材料）不等待，后续请求全部等待5.6秒
            if (!this._hasFirstRequestSent) {
                this._hasFirstRequestSent = true;
                log.info("🚀 首次请求，绿色通道，不等待");
            } else {
                // 添加请求延迟，避免请求频率过高（状态码567）
                await sleep(7600);
            }

            // 重试机制：最多重试5次，失败后等待1分钟再重试一轮，总共最多10次
            const maxRetries = 5;
            let response = null;
            let totalRetries = 0;
            const maxTotalRetries = 10;
            let lastStatusCode = 0;

            while (totalRetries < maxTotalRetries) {
                for (let retry = 0; retry < maxRetries && totalRetries < maxTotalRetries; retry++) {
                    totalRetries++;
                    response = await http.request("GET", url);
                    lastStatusCode = response.status_code;

                    if (response.status_code === 200) {
                        return response.body;
                    }

                    // 404 状态码表示页面不存在，立即报错
                    if (response.status_code === 404) {
                        const nameMatch = description.match(/【(.+)】/);
                        const name = nameMatch ? nameMatch[1] : description;
                        log.error(`❌ ${name}名字错误或不存在（状态码: 404）`);

                        if (errorType === "character") {
                            throw new Error(`${name}名字错误或角色不存在`);
                        } else if (errorType === "weapon") {
                            throw new Error(`${name}名称错误或武器不存在`);
                        } else if (errorType === "material") {
                            throw new Error(`${name}材料名称错误或不存在`);
                        } else {
                            throw new Error(`${name}名字错误或不存在`);
                        }
                    }

                    log.warn(`获取页面失败，状态码: ${response.status_code}，第 ${retry + 1} 次重试（总共第 ${totalRetries} 次）...`);

                    if (totalRetries >= maxTotalRetries) {
                        break;
                    }

                    if (retry < maxRetries - 1) {
                        await sleep(10000 + retry * 2000);
                    }
                }

                if (totalRetries >= maxTotalRetries) {
                    break;
                }

                log.warn(`已重试 ${maxRetries} 次全部失败，等待1分钟后继续重试...`);
                await sleep(60000);
            }

            // 超过最大重试次数，根据状态码抛出错误
            const nameMatch = description.match(/【(.+)】/);
            const name = nameMatch ? nameMatch[1] : description;

            if (errorType === "character") {
                throw new Error(`${name}获取失败（状态码: ${lastStatusCode}，已重试 ${totalRetries} 次）`);
            } else if (errorType === "weapon") {
                throw new Error(`${name}获取失败（状态码: ${lastStatusCode}，已重试 ${totalRetries} 次）`);
            } else if (errorType === "material") {
                throw new Error(`${name}材料获取失败（状态码: ${lastStatusCode}，已重试 ${totalRetries} 次）`);
            } else {
                throw new Error(`${name}获取失败（状态码: ${lastStatusCode}，已重试 ${totalRetries} 次）`);
            }
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            if (e.message.includes("名字错误") || e.message.includes("名称错误") || e.message.includes("不存在") || e.message.includes("获取失败")) {
                throw e;
            }
            log.error(`HTTP请求失败: ${e.message}`);
            throw new Error(`网络请求异常: ${e.message}`);
        }
    },

    /**
     * 根据用户输入的角色名称获取标准名称（从 combat_avatar.json）
     * @param {string} inputName - 用户输入的角色名称
     * @returns {string|null} - 标准角色名称或 null
     */
    getStandardCharacterName(inputName) {
        if (!inputName) return null;
        try {
            const avatarData = JSON.parse(file.readTextSync("data/combat_avatar.json"));
            const normalizedInput = inputName.toLowerCase().trim();
            
            for (const avatar of avatarData) {
                // 检查标准名称
                if (avatar.name && avatar.name.toLowerCase() === normalizedInput) {
                    return avatar.name;
                }
                // 检查别名数组
                if (avatar.alias && Array.isArray(avatar.alias)) {
                    for (const alias of avatar.alias) {
                        if (alias.toLowerCase() === normalizedInput) {
                            return avatar.name;
                        }
                    }
                }
            }
            // 如果找不到标准名称，返回原始输入（可能 wiki 上有这个角色）
            return inputName.trim();
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            log.error(`读取 combat_avatar.json 失败: ${e.message}`);
            return inputName.trim();
        }
    },

    /**
     * 获取角色培养材料信息（快速模式，只获取材料名称，不获取详细来源）
     * @param {string} characterName - 角色名称（可以是别名，会自动转换为标准名称）
     * @returns {Object} - 包含 bossMaterialName, talentMobMaterialName, specialtyName, talentBookName, weeklyBossName
     */
    async getCharacterMaterialsFast(characterName) {
        try {
            // 获取标准角色名称
            const standardName = this.getStandardCharacterName(characterName);
            if (!standardName) {
                log.error(`无法识别角色名称: ${characterName}`);
                return null;
            }
            
            const encodedName = encodeURIComponent(standardName);
            const characterUrl = this.WIKI_BASE_URL + encodedName;

            // 使用通用请求函数获取角色页面（传递 errorType 为 "character"）
            const html = await this.fetchPage(characterUrl, `角色【${standardName}】页面`, "character");
            if (!html) {
                return null;
            }
            
            // 调试：显示 HTML 内容长度
            log.info(`📌 获取到 HTML 内容，长度: ${html.length}`);
            
            // 解析角色页面获取材料名称
            const materialNames = this.parseCharacterPage(html);
            
            if (!materialNames) {
                log.error(`解析角色页面失败，未找到材料信息`);
                return null;
            }
            
            log.info(`📌 角色页面解析结果: Boss材料=${materialNames.bossMaterial}, 区域特产=${materialNames.specialty}, 天赋普通材料=${materialNames.talentMobMaterial}, 天赋书=${materialNames.talentBookRaw}, 周本材料=${materialNames.weeklyBoss}, 星级=${materialNames.starRating}`);

            // 提取天赋书名称（「」内的文字）
            const talentBookName = this.extractTalentBookName(materialNames.talentBookRaw);

            const result = {
                bossMaterialName: materialNames.bossMaterial,  // Boss材料名称（如"雷光棱镜"）
                talentMobMaterialName: materialNames.talentMobMaterial,  // 天赋怪物材料名称（如"「诗人」"）
                specialtyName: materialNames.specialty,  // 区域特产名称
                talentBookName: talentBookName,  // 天赋书名称
                weeklyBossName: materialNames.weeklyBoss,  // 周本Boss材料名称（如"狂人的约束"）
                starRating: materialNames.starRating,  // 角色星级（如"五星"）
                weapon: materialNames.weapon,  // 武器类型（如"双手剑"）
                element: materialNames.element  // 元素属性（如"冰"）
            };

            log.info(`✅ Wiki 材料名称获取完成: Boss材料=${materialNames.bossMaterial}, 天赋怪物材料=${materialNames.talentMobMaterial}, 区域特产=${materialNames.specialty}, 天赋书=${talentBookName}, 周本材料=${materialNames.weeklyBoss}, 星级=${materialNames.starRating}, 武器=${materialNames.weapon}, 元素=${materialNames.element}`);

            return result;
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            // 如果是我们抛出的错误，直接向上传递
            if (e.message.includes("名字错误") || e.message.includes("名称错误") || e.message.includes("不存在") || e.message.includes("获取失败")) {
                throw e;
            }
            log.error(`获取角色材料失败: ${e.message}`);
            throw new Error(`获取角色材料失败: ${e.message}`);
        }
    },

    /**
     * 根据Boss材料名称获取Boss名称（延迟获取）
     * @param {string} bossMaterialName - Boss材料名称（如"雷光棱镜"）
     * @returns {string} - Boss名称（如"雷音权现"）
     */
    async getBossNameFromMaterial(bossMaterialName) {
        try {
            if (!bossMaterialName) {
                log.warn("Boss材料名称为空，无法获取Boss名称");
                return null;
            }
            
            log.info(`📌 根据Boss材料【${bossMaterialName}】获取Boss名称...`);
            const bossName = await this.getMaterialSource(bossMaterialName, "boss");
            if (bossName) {
                log.info(`✅ Boss名称获取完成: ${bossName}`);
            }
            return bossName;
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            log.error(`获取Boss名称失败: ${e.message}`);
            return null;
        }
    },

    /**
     * 根据天赋怪物材料名称获取天赋怪物名称（延迟获取）
     * @param {string} talentMobMaterialName - 天赋怪物材料名称（如"「诗人」"）
     * @returns {string} - 天赋怪物名称（如"深渊法师"）
     */
    async getTalentMobNameFromMaterial(talentMobMaterialName) {
        try {
            if (!talentMobMaterialName) {
                log.warn("天赋怪物材料名称为空，无法获取天赋怪物名称");
                return null;
            }
            
            log.info(`📌 根据天赋怪物材料【${talentMobMaterialName}】获取天赋怪物名称...`);
            let talentMobName = await this.getMaterialSource(talentMobMaterialName, "mob");
            if (talentMobName) {
                talentMobName = this.cleanMobName(talentMobName);
                log.info(`✅ 天赋怪物名称获取完成: ${talentMobName}`);
            }
            return talentMobName;
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            log.error(`获取天赋怪物名称失败: ${e.message}`);
            return null;
        }
    },

    /**
     * 获取角色培养材料信息（完整模式，立即获取所有详细信息）
     * @param {string} characterName - 角色名称（可以是别名，会自动转换为标准名称）
     * @returns {Object} - 包含 bossName, talentMobName, specialtyName, talentBookName
     */
    async getCharacterMaterials(characterName) {
        try {
            // 先获取材料名称（快速模式）
            const fastResult = await this.getCharacterMaterialsFast(characterName);
            if (!fastResult) {
                return null;
            }
            
            // 然后获取Boss名称和天赋怪物名称（详细模式）
            let bossName = null;
            if (fastResult.bossMaterialName) {
                bossName = await this.getBossNameFromMaterial(fastResult.bossMaterialName);
            }
            
            let talentMobName = null;
            if (fastResult.talentMobMaterialName) {
                // common_material 格式为 "一星,二星,三星"，取第一个（一星）用于查怪物名
                const firstTalentMobMaterial = fastResult.talentMobMaterialName.split(",")[0].trim();
                talentMobName = await this.getTalentMobNameFromMaterial(firstTalentMobMaterial);
            }
            
            const result = {
                bossName: bossName,
                talentMobName: talentMobName,
                specialtyName: fastResult.specialtyName,
                talentBookName: fastResult.talentBookName
            };
            
            log.info(`✅ Wiki 完整数据获取完成: Boss=${bossName}, 天赋怪物=${talentMobName}, 区域特产=${fastResult.specialtyName}, 天赋书=${fastResult.talentBookName}`);

            // 将网页获取的数据保存到本地 JSON 文件
            const standardName = this.getStandardCharacterName(characterName);
            if (typeof WikiDataSaver !== 'undefined') {
                WikiDataSaver.saveCharacterData(standardName, fastResult, result);
                // Boss 材料不存入 Mapping.json（按需求跳过）
                if (talentMobName && fastResult.talentMobMaterialName) {
                    // common_material 格式为 "一星,二星,三星"，为每个材料分别保存映射
                    const talentMobMaterialNames = fastResult.talentMobMaterialName.split(",").map(s => s.trim()).filter(s => s);
                    for (const matName of talentMobMaterialNames) {
                        WikiDataSaver.saveMappingData(matName, talentMobName, "common");
                    }
                }
            }

            return result;
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            // 如果是我们抛出的错误，直接向上传递
            if (e.message.includes("名字错误") || e.message.includes("名称错误") || e.message.includes("不存在") || e.message.includes("获取失败")) {
                throw e;
            }
            log.error(`获取角色材料信息失败: ${e.message}`);
            throw new Error(`获取角色材料信息失败: ${e.message}`);
        }
    },

    /**
     * 解析角色页面获取材料名称
     * @param {string} html - HTML 内容
     * @returns {Object} - { bossMaterial, specialty, talentMobMaterial, talentBookRaw, weeklyBoss }
     */
    parseCharacterPage(html) {
        try {
            log.info(`📌 开始解析HTML，搜索材料名称...`);
            
            // 解析 Boss 材料
            const bossMaterial = this.findBossMaterial(html);
            log.info(`📌 Boss材料匹配结果: ${bossMaterial}`);
            
            // 解析区域特产
            const specialty = this.findSpecialty(html);
            log.info(`📌 区域特产匹配结果: ${specialty}`);
            
            // 解析天赋普通材料
            const talentMobMaterial = this.findTalentMobMaterial(html);
            log.info(`📌 天赋普通材料匹配结果: ${talentMobMaterial}`);
            
            // 解析天赋书
            const talentBookRaw = this.findTalentBook(html);
            log.info(`📌 天赋书匹配结果: ${talentBookRaw}`);
            
            // 解析周本Boss材料（在智识之冕之前）
            const weeklyBoss = this.findWeeklyBoss(html);
            log.info(`📌 周本材料匹配结果: ${weeklyBoss}`);

            // 解析角色星级（稀有度）
            const starRating = this.findStarRating(html);
            log.info(`📌 角色星级匹配结果: ${starRating}`);

            // 解析武器类型和元素属性
            const weaponElement = this.findWeaponAndElement(html);
            log.info(`📌 武器类型匹配结果: ${weaponElement.weapon}`);
            log.info(`📌 元素类型匹配结果: ${weaponElement.element}`);

            return {
                bossMaterial: bossMaterial,
                specialty: specialty,
                talentMobMaterial: talentMobMaterial,
                talentBookRaw: talentBookRaw,
                weeklyBoss: weeklyBoss,
                starRating: starRating,
                weapon: weaponElement.weapon,
                element: weaponElement.element
            };
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            log.error(`解析角色页面失败: ${e.message}`);
            return null;
        }
    },

    /**
     * 提取 HTML 中的某个区域
     * 改进：查找标题标签（h2/h3）后面的内容，而不是简单的文本搜索
     */
    extractSection(html, startMarker, endMarker) {
        // 尝试多种方式查找标题
        // 方式1: 查找 <h2 id="xxx"> 或 <h2>xxx</h2>
        let startIndex = -1;
        
        // 尝试匹配 <h2 id="突破"> 或 <h2>突破</h2>
        const h2Patterns = [
            new RegExp(`<h2[^>]*id="${startMarker}"[^>]*>`, 'gi'),
            new RegExp(`<h2[^>]*>${startMarker}</h2>`, 'gi'),
            new RegExp(`<h2[^>]*>${startMarker}`, 'gi')
        ];
        
        for (const pattern of h2Patterns) {
            const match = html.match(pattern);
            if (match) {
                startIndex = html.indexOf(match[0]);
                // 从标题结束位置开始
                startIndex = startIndex + match[0].length;
                break;
            }
        }
        
        // 如果没找到h2，尝试简单文本搜索（但跳过目录导航）
        if (startIndex === -1) {
            const simpleIndex = html.indexOf(startMarker);
            if (simpleIndex !== -1) {
                // 检查是否在目录导航中（toc）
                const beforeContent = html.substring(Math.max(0, simpleIndex - 100), simpleIndex);
                if (beforeContent.includes('toc') || beforeContent.includes('目录')) {
                    // 在目录中，跳过，查找下一个出现位置
                    const nextIndex = html.indexOf(startMarker, simpleIndex + startMarker.length);
                    if (nextIndex !== -1) {
                        startIndex = nextIndex;
                    }
                } else {
                    startIndex = simpleIndex;
                }
            }
        }
        
        if (startIndex === -1) return "";
        
        // 查找结束位置
        let endIndex = html.indexOf(endMarker, startIndex);
        if (endIndex === -1) {
            // 如果没找到结束标记，尝试查找下一个标题
            const nextTitleMatch = html.substring(startIndex).match(/<h2[^>]*>/gi);
            if (nextTitleMatch) {
                endIndex = startIndex + html.substring(startIndex).indexOf(nextTitleMatch[0]);
            } else {
                endIndex = startIndex + 5000; // 限制长度
            }
        }
        
        return html.substring(startIndex, endIndex);
    },

    /**
     * 查找 Boss 材料（数量为46的材料）
     */
    findBossMaterial(html) {
        // Boss材料数量固定为46
        // 网页结构：<div class="ys-iconLTop">46</div> ... <div class="ys-iconLBottom">...<font class="textBDHZ">材料名称</font>...</div>
        
        // 搜索数量46对应的材料名称
        // 方法：找到 ys-iconLTop 包含46的位置，然后在附近找 ys-iconLBottom 中的材料名称
        
        // 模式1: ys-iconLTop>46 后面紧跟 ys-iconLBottom
        const pattern1 = /ys-iconLTop[^>]*>46[^<]*<[^>]*>[^<]*<[^>]*ys-iconLBottom[^>]*>[^<]*<a[^>]*title="([^"]+)"[^>]*>/gi;
        const match1 = html.match(pattern1);
        if (match1) {
            log.info(`📌 Boss材料模式1匹配: ${match1[0]}`);
            const nameMatch = match1[0].match(/title="([^"]+)"/);
            if (nameMatch) {
                return nameMatch[1].trim();
            }
        }
        
        // 模式2: ys-iconLTop>46 后面找 textBDHZ
        const pattern2 = /ys-iconLTop[^>]*>46[^<]*<[^>]*>[\s\S]{0,200}textBDHZ[^>]*>([^<]+)<\/font>/gi;
        const match2 = html.match(pattern2);
        if (match2) {
            log.info(`📌 Boss材料模式2匹配: ${match2[0]}`);
            const nameMatch = match2[0].match(/textBDHZ[^>]*>([^<]+)<\/font>/);
            if (nameMatch) {
                return nameMatch[1].trim();
            }
        }
        
        // 模式3: 直接搜索 ys-iconLTop 包含46，然后找最近的 title
        const topPattern = /<div[^>]*class="ys-iconLTop"[^>]*>\s*46\s*<\/div>/gi;
        const topMatch = html.match(topPattern);
        if (topMatch) {
            const topIndex = html.indexOf(topMatch[0]);
            // 在后面200字符内找 ys-iconLBottom
            const nearbyContent = html.substring(topIndex, topIndex + 300);
            const bottomMatch = nearbyContent.match(/title="([^"]+)"[^>]*>/);
            if (bottomMatch) {
                return bottomMatch[1].trim();
            }
        }

        log.info(`📌 Boss材料未找到匹配`);
        return null;
    },

    /**
     * 查找区域特产（数量为168的材料）
     */
    findSpecialty(html) {
        // 区域特产数量固定为168
        
        // 模式1: ys-iconLTop>168 后面紧跟 ys-iconLBottom
        const pattern1 = /ys-iconLTop[^>]*>168[^<]*<[^>]*>[\s\S]{0,200}ys-iconLBottom[^>]*>[^<]*<a[^>]*title="([^"]+)"[^>]*>/gi;
        const match1 = html.match(pattern1);
        if (match1) {
            log.info(`📌 区域特产模式1匹配: ${match1[0]}`);
            const nameMatch = match1[0].match(/title="([^"]+)"/);
            if (nameMatch) {
                return nameMatch[1].trim();
            }
        }
        
        // 模式2: ys-iconLTop>168 后面找 textBDHZ
        const pattern2 = /ys-iconLTop[^>]*>168[^<]*<[^>]*>[\s\S]{0,200}textBDHZ[^>]*>([^<]+)<\/font>/gi;
        const match2 = html.match(pattern2);
        if (match2) {
            log.info(`📌 区域特产模式2匹配: ${match2[0]}`);
            const nameMatch = match2[0].match(/textBDHZ[^>]*>([^<]+)<\/font>/);
            if (nameMatch) {
                return nameMatch[1].trim();
            }
        }
        
        // 模式3: 直接搜索 ys-iconLTop 包含168，然后找最近的 title
        const topPattern = /<div[^>]*class="ys-iconLTop"[^>]*>\s*168\s*<\/div>/gi;
        const topMatch = html.match(topPattern);
        if (topMatch) {
            const topIndex = html.indexOf(topMatch[0]);
            const nearbyContent = html.substring(topIndex, topIndex + 300);
            const bottomMatch = nearbyContent.match(/title="([^"]+)"[^>]*>/);
            if (bottomMatch) {
                return bottomMatch[1].trim();
            }
        }

        log.info(`📌 区域特产未找到匹配`);
        return null;
    },

    /**
     * 查找天赋普通材料（一星18、二星30、三星36）
     * 返回逗号分隔的三个材料名称，如 "牢固的箭簇,锐利的箭簇,历战的箭簇"
     * 网页中有多个18和30，必须在摩拉总数标记（如"210万"）之后查找
     */
    findTalentMobMaterial(html) {
        // 天赋普通材料数量：低级18(一星)、中级30(二星)、高级36(三星)

        // 1. 找到摩拉总数标记（如 "210万"）作为搜索起点
        //    网页中有多个18和30，必须限定在摩拉标记之后查找
        const moraPattern = /textBDHZ[^>]*>\s*\d+万\s*<\/font>/gi;
        const moraMatch = html.match(moraPattern);
        let searchStart = 0;
        if (moraMatch) {
            searchStart = html.indexOf(moraMatch[0]) + moraMatch[0].length;
            log.info(`📌 找到摩拉总数标记【${moraMatch[0].replace(/<[^>]+>/g, '').trim()}】，从其后开始搜索`);
        } else {
            log.info(`📌 未找到摩拉总数标记，使用全文搜索`);
        }

        // 2. 找到等级表格标记（如 "<th>20级</th>"）作为搜索终点
        //    摩拉标记与等级表格之间是突破材料总览区域，18/30/36只应在此范围内
        const levelPattern = /20级/g;
        const levelMatch = html.substring(searchStart).match(levelPattern);
        let searchEnd = html.length;
        if (levelMatch) {
            searchEnd = searchStart + html.substring(searchStart).indexOf(levelMatch[0]);
            log.info(`📌 找到等级表格标记【20级】，搜索范围限定在摩拉标记与等级表格之间`);
        } else {
            log.info(`📌 未找到等级表格标记，搜索到文末`);
        }

        // 3. 在摩拉标记与等级表格之间搜索18、30、36
        const searchHtml = html.substring(searchStart, searchEnd);

        // === 调试：保存完整网页HTML和截取的搜索范围到文件 ===
        try {
            const debugData = {
                timestamp: new Date().toISOString(),
                moraMarker: moraMatch ? moraMatch[0] : null,
                searchStart: searchStart,
                searchEnd: searchEnd,
                searchRangeLength: searchHtml.length,
                searchHtml: searchHtml
            };
            file.writeTextSync("data/debug_findTalentMobMaterial.json", JSON.stringify(debugData, null, 2));
            log.info(`📌 调试信息已保存到 data/debug_findTalentMobMaterial.json（搜索范围长度: ${searchHtml.length}）`);
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            log.warn(`📌 调试信息保存失败: ${e.message}`);
        }

        // 4. 用简单字符串搜索查找18、30、36对应的材料名
        //    实际HTML结构：<a ... title="材料名">... <font class="textBDHZ">数量</font>
        //    title在数量之前，取最近的title
        const quantities = [18, 30, 36];
        const materials = [];

        for (const qty of quantities) {
            let materialName = null;

            // 在搜索范围内查找 textBDHZ 后跟数量的模式
            // 用字符串搜索代替正则，避免引擎兼容问题
            const marker = 'textBDHZ">' + qty + '</font>';
            const qtyIdx = searchHtml.indexOf(marker);

            if (qtyIdx !== -1) {
                log.info(`📌 找到数量${qty}，位置: ${qtyIdx}`);
                // 向前搜索最近的 title="..."
                const beforeContent = searchHtml.substring(0, qtyIdx);
                const lastTitleIdx = beforeContent.lastIndexOf('title="');
                if (lastTitleIdx !== -1) {
                    const titleStart = lastTitleIdx + 7; // 'title="'.length
                    const titleEnd = beforeContent.indexOf('"', titleStart);
                    if (titleEnd !== -1) {
                        materialName = beforeContent.substring(titleStart, titleEnd).trim();
                    }
                }
            }

            // 备用：尝试 title='材料名' （单引号）
            if (!materialName) {
                const marker2 = "textBDHZ'>" + qty + "</font>";
                const qtyIdx2 = searchHtml.indexOf(marker2);
                if (qtyIdx2 !== -1) {
                    const beforeContent = searchHtml.substring(0, qtyIdx2);
                    const lastTitleIdx = beforeContent.lastIndexOf("title='");
                    if (lastTitleIdx !== -1) {
                        const titleStart = lastTitleIdx + 7;
                        const titleEnd = beforeContent.indexOf("'", titleStart);
                        if (titleEnd !== -1) {
                            materialName = beforeContent.substring(titleStart, titleEnd).trim();
                        }
                    }
                }
            }

            if (materialName) {
                materials.push(materialName);
                log.info(`📌 天赋普通材料(数量${qty})匹配: ${materialName}`);
            } else {
                log.info(`📌 天赋普通材料(数量${qty})未找到匹配`);
            }
        }

        if (materials.length > 0) {
            return materials.join(",");
        }

        log.info(`📌 天赋普通材料未找到任何匹配`);
        return null;
    },

    /**
     * 查找天赋书名称
     */
    findTalentBook(html) {
        // 天赋书格式：「乐园」的教导、「自由」的指引 等
        // 天赋书数量：教导9、指引63、哲学114
        // 使用数量9来定位天赋书名称
        
        // 定义数量16的正则表达式模式
        const topPattern16 = /<div[^>]*class="ys-iconLTop"[^>]*>\s*16\s*<\/div>/gi;
        
        // 搜索数量16对应的材料名称
        const topMatch16 = html.match(topPattern16);
        if (topMatch16) {
            const topIndex = html.indexOf(topMatch16[0]);
            const nearbyContent = html.substring(topIndex, topIndex + 300);
            // 匹配「」内的天赋书名称
            const bookMatch = nearbyContent.match(/title="「([^」]+)」[^"]*"/);
            if (bookMatch) {
                return bookMatch[1];
            }
            // 也可能没有「」符号
            const simpleMatch = nearbyContent.match(/title="([^"]+)的教导"/);
            if (simpleMatch) {
                return simpleMatch[1];
            }
        }

        // 如果没找到数量16，尝试找数量12或2
        const fallbackCounts = [12, 2];
        for (const count of fallbackCounts) {
            const topPattern = new RegExp(`<div[^>]*class="ys-iconLTop"[^>]*>\\s*${count}\\s*<\/div>`, 'gi');
            const topMatch = html.match(topPattern);
            if (topMatch) {
                const topIndex = html.indexOf(topMatch[0]);
                // 搜索数量${count}对应的材料名称
                // 提取数量${count}对应的材料名称
                const nearbyContent = html.substring(topIndex, topIndex + 300);
                // 匹配「」内的天赋书名称
                const bookMatch = nearbyContent.match(/title="「([^」]+)」[^"]*"/);
                if (bookMatch) {
                    return bookMatch[1];
                }
                // 也可能没有「」符号
                const simpleMatch = nearbyContent.match(/title="([^"]+)的(指引|哲学)"/);
                if (simpleMatch) {
                    return simpleMatch[1];
                }
            }
        }

        log.info(`📌 天赋书未找到匹配`);
        return null;
    },

    /**
     * 查找周本Boss材料（在智识之冕之前的数量2的材料）
     * 网页结构：... <div class="ys-iconLTop">2</div> ... <a title="狂人的约束"> ... 智识之冕 ...
     */
    findWeeklyBoss(html) {
        // 智识之冕固定出现，以它作为锚点向前找数量2的材料
        const crownIndex = html.indexOf("智识之冕");
        if (crownIndex === -1) {
            log.info(`📌 未找到智识之冕锚点，无法定位周本材料`);
            return null;
        }

        // 在智识之冕之前搜索数量2
        const beforeCrown = html.substring(0, crownIndex);
        const topPattern = /<div[^>]*class="ys-iconLTop"[^>]*>\s*2\s*<\/div>/gi;
        // 找最后一个匹配（最靠近智识之冕的那个）
        let lastMatch = null;
        let match;
        while ((match = topPattern.exec(beforeCrown)) !== null) {
            lastMatch = match;
        }
        if (lastMatch) {
            const topIndex = beforeCrown.lastIndexOf(lastMatch[0]);
            const nearbyContent = html.substring(topIndex, topIndex + 300);
            const titleMatch = nearbyContent.match(/title="([^"]+)"[^>]*>/);
            if (titleMatch) {
                return titleMatch[1].trim();
            }
        }

        log.info(`📌 周本材料未找到匹配`);
        return null;
    },

    /**
     * 查找角色稀有度（星级）
     * 网页结构：<tr><th>稀有度</th><td><img alt="5星.png" ...></td></tr>
     * 提取 alt 中的数字 N，转换为 "N星" 格式（如 5 → "五星"）
     * @param {string} html - HTML 内容
     * @returns {string|null} - 稀有度（如 "五星"），未找到返回 null
     */
    findStarRating(html) {
        // 以"稀有度"作为锚点
        const startIdx = html.indexOf('稀有度');
        if (startIdx === -1) {
            log.info(`📌 未找到"稀有度"锚点，无法提取星级`);
            return null;
        }

        // 在稀有度之后查找 img alt="N星.png"
        const searchRange = html.substring(startIdx, startIdx + 500);
        const altMatch = searchRange.match(/<img[^>]*alt="(\d+)星\.png"[^>]*>/i);
        if (altMatch) {
            const num = parseInt(altMatch[1], 10);
            // 数字转中文星级：5 → "五星"，4 → "四星"
            const chineseNum = { 1: '一', 2: '二', 3: '三', 4: '四', 5: '五' };
            const starRating = (chineseNum[num] || String(num)) + '星';
            log.info(`📌 角色星级匹配: ${starRating}（来源 alt=${altMatch[0]}）`);
            return starRating;
        }

        log.info(`📌 稀有度行未匹配到 img alt=N星.png`);
        return null;
    },

    /**
     * 查找武器类型
     * 网页结构：<div class="card-title3">武器类型</div><div class="card-content3">双手剑</div>
     * @param {string} html - HTML 内容
     * @returns {string|null} - 武器类型（如 "双手剑"），未找到返回 null
     */
    findWeaponType(html) {
        // 以"武器类型"作为锚点，在其后查找 card-content3 的内容
        const titleIdx = html.indexOf('武器类型');
        if (titleIdx === -1) {
            log.info(`📌 未找到"武器类型"锚点，无法提取武器类型`);
            return null;
        }

        // 在武器类型之后查找 card-content3 的内容
        const searchRange = html.substring(titleIdx, titleIdx + 500);
        const contentMatch = searchRange.match(/<div[^>]*class="card-content3"[^>]*>([^<]+)<\/div>/i);
        if (contentMatch) {
            const weaponType = contentMatch[1].trim();
            log.info(`📌 武器类型匹配: ${weaponType}`);
            return weaponType;
        }

        log.info(`📌 武器类型未找到匹配（card-content3）`);
        return null;
    },

    /**
     * 查找角色武器类型和元素属性
     * 从wiki角色页面的信息表格中提取，使用"常驻/限定"作为起点锚点，"武器类型"作为终点锚点
     * 元素在"星之楔"行中（如"冰"），武器类型在"武器类型"行中（如"双手剑"）
     * @param {string} html - HTML 内容
     * @returns {Object} - { weapon: 武器类型, element: 元素属性 }
     */
    findWeaponAndElement(html) {
        // 已知的元素和武器类型值
        const knownElements = ["冰", "火", "水", "雷", "风", "岩", "草"];
        const knownWeapons = ["单手剑", "双手剑", "弓", "法器", "长柄武器"];

        let weapon = null;
        let element = null;

        // 1. 找到"常驻/限定"作为搜索起点
        const startIdx = html.indexOf('常驻/限定');
        if (startIdx === -1) {
            log.info(`📌 未找到"常驻/限定"锚点，无法提取武器和元素`);
            return { weapon: null, element: null };
        }

        // 2. 找到"武器类型"作为锚点
        const weaponTypeIdx = html.indexOf('武器类型', startIdx);
        if (weaponTypeIdx === -1) {
            log.info(`📌 未找到"武器类型"锚点，无法提取武器和元素`);
            return { weapon: null, element: null };
        }

        // 3. 在"常驻/限定"和"武器类型"之间查找元素
        //    元素行标题可能是"星之楔"、"神之眼"或其他，因此不依赖具体行标题，
        //    而是在整段范围内搜索已知元素值
        const elementRange = html.substring(startIdx, weaponTypeIdx);
        for (const elem of knownElements) {
            if (elementRange.indexOf(elem) !== -1) {
                element = elem;
                log.info(`📌 元素类型匹配: ${element}`);
                break;
            }
        }

        if (!element) {
            element = "none";
            log.info(`📌 范围内未匹配到已知元素，设置为none`);
        }

        // 4. 在"武器类型"之后查找武器类型
        //    在"武器类型"后的500字符内搜索已知武器值
        const weaponRange = html.substring(weaponTypeIdx, weaponTypeIdx + 500);
        for (const w of knownWeapons) {
            if (weaponRange.indexOf(w) !== -1) {
                weapon = w;
                log.info(`📌 武器类型匹配: ${weapon}`);
                break;
            }
        }

        if (!weapon) {
            log.info(`📌 武器类型未找到匹配`);
        }

        return { weapon: weapon, element: element };
    },

    /**
     * 提取天赋书名称（「」内的文字）
     */
    extractTalentBookName(talentBookRaw) {
        if (!talentBookRaw) return null;
        
        // 已经是提取后的名称，直接返回
        return talentBookRaw;
    },

    /**
     * 获取材料的来源信息
     * @param {string} materialName - 材料名称
     * @param {string} type - 类型: "boss" 或 "mob" 或 "weaponMob"
     * @returns {string} - Boss名称或怪物名称
     * @throws {Error} - 当获取失败时抛出错误
     */
    async getMaterialSource(materialName, type) {
        try {
            const encodedName = encodeURIComponent(materialName);
            const materialUrl = this.WIKI_BASE_URL + encodedName;

            // 使用通用请求函数获取材料页面（传递 errorType 为 "material"）
            const html = await this.fetchPage(materialUrl, `材料【${materialName}】页面`, "material");
            if (!html) {
                return null;
            }

            // 查找"来源"部分
            const sourceSection = this.extractSourceSection(html);

            if (type === "boss") {
                return this.extractBossName(sourceSection);
            } else if (type === "mob" || type === "weaponMob") {
                return this.extractMobName(sourceSection);
            }

            return null;
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            // 如果是我们抛出的错误，直接向上传递
            if (e.message.includes("名字错误") || e.message.includes("名称错误") || e.message.includes("不存在") || e.message.includes("获取失败")) {
                throw e;
            }
            log.error(`获取材料来源失败: ${e.message}`);
            throw new Error(`获取材料【${materialName}】来源失败: ${e.message}`);
        }
    },

    /**
     * 提取来源部分
     */
    extractSourceSection(html) {
        // 查找"来源"标题后的内容
        // 网页结构：<tr><th>来源</th><td>...</td></tr>

        log.info(`📌 开始提取来源部分...`);

        // 模式1: <th>来源</th> 后面紧跟 <td>...</td>
        // 注意：th 和 td 之间可能有换行和空格
        const pattern1 = /<th[^>]*>\s*来源\s*<\/th>\s*<td[^>]*>([\s\S]{0,500})<\/td>/gi;
        const match1 = html.match(pattern1);
        if (match1) {
            return match1[0];
        }

        // 模式2: <tr><th>来源</th>...<td>...</td></tr>
        // 查找包含"来源"的 th 标签，然后找同一行的 td 标签
        const pattern2 = /<tr[^>]*>[\s\S]*?<th[^>]*>\s*来源\s*<\/th>[\s\S]*?<td[^>]*>([\s\S]{0,500})<\/td>[\s\S]*?<\/tr>/gi;
        const match2 = html.match(pattern2);
        if (match2) {
            return match2[0];
        }

        // 模式3: 查找包含"掉落"的内容（作为备用）
        const pattern3 = /(怪物掉落[\s\S]{0,300}|精英怪物掉落[\s\S]{0,300}|普通怪物掉落[\s\S]{0,300}|BOSS掉落[\s\S]{0,300})/gi;
        const match3 = html.match(pattern3);
        if (match3) {
            return match3[0];
        }

        log.info(`📌 来源部分未找到匹配`);
        return "";
    },

    /**
     * 从来源部分提取 Boss 名称
     */
    extractBossName(section) {
        // Boss材料来源格式：
        // <b>BOSS掉落</b><br>"30级以上"<a title="秘源机兵·构型械">秘源机兵·构型械</a>"掉落"

        // 查找 Boss 名称链接（在 BOSS掉落 后面）
        // 先找到 BOSS掉落 的位置，然后在附近找 <a> 标签
        const bossDropIndex = section.indexOf("BOSS掉落");
        if (bossDropIndex !== -1) {
            const afterBossDrop = section.substring(bossDropIndex, bossDropIndex + 300);

            // 匹配 <a title="Boss名称"> 或 <a ...>Boss名称</a>
            const linkMatch = afterBossDrop.match(/<a[^>]*title="([^"]+)"[^>]*>/gi);
            if (linkMatch) {
                const nameMatch = linkMatch[0].match(/title="([^"]+)"/);
                if (nameMatch) {
                    return nameMatch[1].trim();
                }
            }

            // 匹配 <a ...>Boss名称</a>
            const textMatch = afterBossDrop.match(/<a[^>]*>([^<]+)<\/a>/gi);
            if (textMatch) {
                return textMatch[0].match(/>([^<]+)<\/a>/)[1].trim();
            }
        }

        // 直接查找 <a> 标签中的 Boss 名称
        const linkPattern = /<a[^>]*title="([^"]+)"[^>]*>/gi;
        const linkMatch = section.match(linkPattern);
        if (linkMatch) {
            for (const match of linkMatch) {
                const nameMatch = match.match(/title="([^"]+)"/);
                if (nameMatch) {
                    return nameMatch[1].trim();
                }
            }
        }

        return null;
    },

    /**
     * 获取武器信息（快速模式，只获取材料名称，不获取详细来源）
     * @param {string} weaponName - 武器名称
     * @returns {Object} - 包含 starLevel, weaponDomainName, weapons1MaterialName, weapons2MaterialName
     */
    async getWeaponInfoFast(weaponName) {
        try {
            if (!weaponName) {
                log.error("武器名称为空，无法获取信息");
                return null;
            }

            const encodedName = encodeURIComponent(weaponName);
            const weaponUrl = this.WIKI_BASE_URL + encodedName;

            // 使用通用请求函数获取武器页面（传递 errorType 为 "weapon"）
            const html = await this.fetchPage(weaponUrl, `武器【${weaponName}】页面`, "weapon");
            if (!html) {
                return null;
            }

            // 解析武器页面获取星级
            const starLevel = this.parseWeaponStar(html);
            if (starLevel) {
                log.info(`✅ 武器【${weaponName}】星级: ${starLevel}`);
            }

            // 解析武器页面获取武器类型
            const weaponType = this.findWeaponType(html);

            // 解析武器页面获取材料名称
            const materialNames = this.parseWeaponMaterials(html);
            
            // 提取武器秘境名称（前四个字）
            let weaponDomainName = null;
            if (materialNames && materialNames.weaponDomainMaterial) {
                weaponDomainName = materialNames.weaponDomainMaterial.substring(0, 4);
                log.info(`📌 武器秘境名称（前四个字）: ${weaponDomainName}`);
            }

            const result = {
                starLevel: starLevel,
                weaponType: weaponType,  // 武器类型（如"双手剑"）
                weaponDomainName: weaponDomainName,
                weapons1MaterialName: materialNames?.weapons1Material,  // 武器1材料名称（1★，不获取魔物名称）
                weapons2MaterialName: materialNames?.weapons2Material,  // 武器2材料名称（1★，不获取魔物名称）
                // 2★/3★ 武器材料名（仅供传递给 Mapping.json 拼三连，不写入 Weapons_data）
                weapons1MaterialName2: materialNames?.weapons1Material2 || null,
                weapons2MaterialName2: materialNames?.weapons2Material2 || null,
                weapons1MaterialName3: materialNames?.weapons1Material3 || null,
                weapons2MaterialName3: materialNames?.weapons2Material3 || null,
                // 完整材料对象（供 WikiDataSaver.saveWeaponData 使用，包含 weaponDomainMaterial/weapons1Material2/3 等）
                materialNames: materialNames || null
            };
            
            log.info(`✅ 武器材料名称获取完成: 星级=${starLevel}, 武器类型=${weaponType}, 秘境=${weaponDomainName}, 武器材料1=${materialNames?.weapons1Material}, 武器材料2=${materialNames?.weapons2Material}`);

            return result;
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            // 如果是我们抛出的错误，直接向上传递
            if (e.message.includes("名字错误") || e.message.includes("名称错误") || e.message.includes("不存在") || e.message.includes("获取失败")) {
                throw e;
            }
            log.error(`获取武器信息失败: ${e.message}`);
            throw new Error(`获取武器信息失败: ${e.message}`);
        }
    },

    /**
     * 根据武器材料名称获取武器魔物名称（延迟获取）
     * @param {string} weaponMaterialName - 武器材料名称
     * @returns {string} - 武器魔物名称
     */
    async getWeaponMobNameFromMaterial(weaponMaterialName) {
        try {
            if (!weaponMaterialName) {
                log.warn("武器材料名称为空，无法获取武器魔物名称");
                return null;
            }
            
            log.info(`📌 根据武器材料【${weaponMaterialName}】获取武器魔物名称...`);
            let mobName = await this.getMaterialSource(weaponMaterialName, "weaponMob");
            if (mobName) {
                mobName = this.cleanMobName(mobName);
                log.info(`✅ 武器魔物名称获取完成: ${mobName}`);
            }
            return mobName;
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            log.error(`获取武器魔物名称失败: ${e.message}`);
            return null;
        }
    },

    /**
     * 获取武器完整信息（星级和材料）- 完整模式
     * 合并 getWeaponStar 和 getWeaponMaterials，避免重复请求同一页面
     * @param {string} weaponName - 武器名称
     * @returns {Object} - 包含 starLevel, weaponDomainName, weapons1MobName, weapons2MobName
     */
    async getWeaponInfo(weaponName) {
        try {
            if (!weaponName) {
                log.error("武器名称为空，无法获取信息");
                return null;
            }

            const encodedName = encodeURIComponent(weaponName);
            const weaponUrl = this.WIKI_BASE_URL + encodedName;

            // 使用通用请求函数获取武器页面（传递 errorType 为 "weapon"）
            const html = await this.fetchPage(weaponUrl, `武器【${weaponName}】页面`, "weapon");
            if (!html) {
                return null;
            }

            // 解析武器页面获取星级
            const starLevel = this.parseWeaponStar(html);
            if (starLevel) {
                log.info(`✅ 武器【${weaponName}】星级: ${starLevel}`);
            }

            // 解析武器页面获取武器类型
            const weaponType = this.findWeaponType(html);

            // 解析武器页面获取材料名称
            const materialNames = this.parseWeaponMaterials(html);
            
            // 提取武器秘境名称（前四个字）
            let weaponDomainName = null;
            if (materialNames && materialNames.weaponDomainMaterial) {
                weaponDomainName = materialNames.weaponDomainMaterial.substring(0, 4);
                log.info(`📌 武器秘境名称（前四个字）: ${weaponDomainName}`);
            }
            
            // 获取第一种武器魔物名称
            let weapons1MobName = null;
            if (materialNames && materialNames.weapons1Material) {
                weapons1MobName = await this.getMaterialSource(materialNames.weapons1Material, "weaponMob");
                if (weapons1MobName) {
                    weapons1MobName = this.cleanMobName(weapons1MobName);
                }
            }
            
            // 获取第二种武器魔物名称
            let weapons2MobName = null;
            if (materialNames && materialNames.weapons2Material) {
                weapons2MobName = await this.getMaterialSource(materialNames.weapons2Material, "weaponMob");
                if (weapons2MobName) {
                    weapons2MobName = this.cleanMobName(weapons2MobName);
                }
            }

            const result = {
                starLevel: starLevel,
                weaponType: weaponType,  // 武器类型（如"双手剑"）
                weaponDomainName: weaponDomainName,
                weapons1MobName: weapons1MobName,
                weapons2MobName: weapons2MobName
            };
            
            log.info(`✅ 武器信息获取完成: 星级=${starLevel}, 武器类型=${weaponType}, 秘境=${weaponDomainName}, 武器魔物1=${weapons1MobName}, 武器魔物2=${weapons2MobName}`);

            // 将网页获取的数据保存到本地 JSON 文件
            if (typeof WikiDataSaver !== 'undefined' && materialNames) {
                WikiDataSaver.saveWeaponData(weaponName, starLevel, weaponType, materialNames);
                if (weapons1MobName && materialNames.weapons1Material) {
                    WikiDataSaver.saveMappingData(materialNames.weapons1Material, weapons1MobName, "common");
                }
                if (weapons2MobName && materialNames.weapons2Material) {
                    WikiDataSaver.saveMappingData(materialNames.weapons2Material, weapons2MobName, "Elite");
                }
            }

            return result;
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            // 如果是我们抛出的错误，直接向上传递
            if (e.message.includes("名字错误") || e.message.includes("名称错误") || e.message.includes("不存在") || e.message.includes("获取失败")) {
                throw e;
            }
            log.error(`获取武器信息失败: ${e.message}`);
            throw new Error(`获取武器信息失败: ${e.message}`);
        }
    },

    /**
     * 获取武器星级信息（单独调用，用于不需要材料的情况）
     * @param {string} weaponName - 武器名称
     * @returns {string} - 武器星级（如"四星"、"五星"等）
     */
    async getWeaponStar(weaponName) {
        try {
            if (!weaponName) {
                log.error("武器名称为空，无法获取星级");
                return null;
            }
            
            const encodedName = encodeURIComponent(weaponName);
            const weaponUrl = this.WIKI_BASE_URL + encodedName;

            // 使用通用请求函数获取武器页面（传递 errorType 为 "weapon"）
            const html = await this.fetchPage(weaponUrl, `武器【${weaponName}】页面`, "weapon");
            if (!html) {
                return null;
            }

            // 解析武器页面获取星级
            const starLevel = this.parseWeaponStar(html);

            if (starLevel) {
                log.info(`✅ 武器【${weaponName}】星级: ${starLevel}`);
                return starLevel;
            } else {
                log.error(`解析武器页面失败，未找到星级信息`);
                return null;
            }
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            // 如果是我们抛出的错误，直接向上传递
            if (e.message.includes("名字错误") || e.message.includes("名称错误") || e.message.includes("不存在") || e.message.includes("获取失败")) {
                throw e;
            }
            log.error(`获取武器星级信息失败: ${e.message}`);
            throw new Error(`获取武器星级信息失败: ${e.message}`);
        }
    },

    /**
     * 获取武器材料信息
     * @param {string} weaponName - 武器名称
     * @returns {Object} - 包含 weaponDomainName, weapons1MobName, weapons2MobName
     */
    async getWeaponMaterials(weaponName) {
        try {
            if (!weaponName) {
                log.error("武器名称为空，无法获取材料信息");
                return null;
            }

            const encodedName = encodeURIComponent(weaponName);
            const weaponUrl = this.WIKI_BASE_URL + encodedName;

            // 使用通用请求函数获取武器页面（传递 errorType 为 "weapon"）
            const html = await this.fetchPage(weaponUrl, `武器【${weaponName}】页面（材料）`, "weapon");
            if (!html) {
                return null;
            }

            // 解析武器页面获取材料名称
            const materialNames = this.parseWeaponMaterials(html);

            if (!materialNames) {
                log.error(`解析武器页面失败，未找到材料信息`);
                return null;
            }

            log.info(`📌 武器页面解析结果: 秘境材料=${materialNames.weaponDomainMaterial}, 武器魔物材料1=${materialNames.weapons1Material}, 武器魔物材料2=${materialNames.weapons2Material}`);
            
            // 提取武器秘境名称（前四个字）
            let weaponDomainName = null;
            if (materialNames.weaponDomainMaterial) {
                weaponDomainName = materialNames.weaponDomainMaterial.substring(0, 4);
                log.info(`📌 武器秘境名称（前四个字）: ${weaponDomainName}`);
            }
            
            // 获取第一种武器魔物名称
            let weapons1MobName = null;
            if (materialNames.weapons1Material) {
                weapons1MobName = await this.getMaterialSource(materialNames.weapons1Material, "weaponMob");
                // 清理魔物名称
                if (weapons1MobName) {
                    weapons1MobName = this.cleanMobName(weapons1MobName);
                }
            }
            
            // 获取第二种武器魔物名称
            let weapons2MobName = null;
            if (materialNames.weapons2Material) {
                weapons2MobName = await this.getMaterialSource(materialNames.weapons2Material, "weaponMob");
                // 清理魔物名称
                if (weapons2MobName) {
                    weapons2MobName = this.cleanMobName(weapons2MobName);
                }
            }
            
            const result = {
                weaponDomainName: weaponDomainName,
                weapons1MobName: weapons1MobName,
                weapons2MobName: weapons2MobName
            };
            
            log.info(`✅ 武器材料获取完成: 秘境=${weaponDomainName}, 武器魔物1=${weapons1MobName}, 武器魔物2=${weapons2MobName}`);

            return result;
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            // 如果是我们抛出的错误，直接向上传递
            if (e.message.includes("名字错误") || e.message.includes("名称错误") || e.message.includes("不存在") || e.message.includes("获取失败")) {
                throw e;
            }
            log.error(`获取武器材料信息失败: ${e.message}`);
            throw new Error(`获取武器材料信息失败: ${e.message}`);
        }
    },

    /**
     * 解析武器页面获取材料名称
     * @param {string} html - HTML 内容
     * @returns {Object} - { weaponDomainMaterial, weapons1Material, weapons2Material }
     */
    parseWeaponMaterials(html) {
        try {
            log.info(`📌 开始解析武器页面，搜索材料名称...`);
            
            // 解析思路：
            // 网页中存在多个 "20级"/"突破"，为避免提取到无关内容，
            // 先截取 "突破材料" 到 "80级" 之间的内容作为解析范围。
            // 然后分别从 20级+突破、60级+突破、70级+突破 提取 title 属性：
            //   - 20级+突破 的 3 个 title：秘境材料(1★)、武器材料1(1★)、武器材料2(1★)
            //   - 60级+突破 的 3 个 title：秘境材料(2★)、武器材料1(2★)、武器材料2(2★)
            //   - 70级+突破 的 3 个 title：秘境材料(3★)、武器材料1(3★)、武器材料2(3★)
            // 按需求保留：
            //   - weaponDomainMaterial = 秘境材料(1★)（用于武器秘境名称）
            //   - weapons1Material / weapons2Material = 1★ 武器材料1/2
            //   - weapons1Material2 / weapons2Material2 = 2★ 武器材料1/2
            //   - weapons1Material3 / weapons2Material3 = 3★ 武器材料1/2

            // 1. 定位突破材料表格
            //    注意：页面中 "突破材料" 字样会出现多次（目录 toctext、章节标题 mw-headline）。
            //    只有真正的突破材料表格才有 <table class="YS-MatTable">，因此用它作为锚点。
            const tableStart = html.indexOf('<table class="YS-MatTable">');
            if (tableStart === -1) {
                log.error(`📌 未找到突破材料表格（<table class="YS-MatTable">）锚点`);
                return null;
            }
            const tableEnd = html.indexOf('</table>', tableStart);
            if (tableEnd === -1) {
                log.error(`📌 未找到突破材料表格结束标记 </table>`);
                return null;
            }
            // 解析范围：突破材料表格内部
            const parseRange = html.substring(tableStart, tableEnd);
            log.info(`📌 已截取突破材料表格，长度: ${parseRange.length}`);

            // === 调试：保存武器页面解析范围，便于排查 "20级+突破" 等提取失败的原因 ===
            try {
                // 统计 parseRange 中各种关键标记的出现情况，帮助快速定位问题
                const markers = ['突破材料', '突破', '80级', '60级', '70级', '20级',
                                 '<big><b>20级</b></big>', '<big><b>60级</b></big>', '<big><b>70级</b></big>',
                                 '<big>', '<b>', '级', '材料', 'title="'];
                const markerStats = {};
                for (const mk of markers) {
                    let cnt = 0, pos = parseRange.indexOf(mk);
                    while (pos !== -1) { cnt++; pos = parseRange.indexOf(mk, pos + 1); }
                    markerStats[mk] = cnt;
                }
                const debugData = {
                    timestamp: new Date().toISOString(),
                    purpose: "parseWeaponMaterials 解析范围调试",
                    parseRangeLength: parseRange.length,
                    markerStats: markerStats,
                    parseRange: parseRange,
                    fullHtmlLength: html.length,
                    fullHtml: html
                };
                file.writeTextSync("data/debug_parseWeaponMaterials.json", JSON.stringify(debugData, null, 2));
                log.info(`📌 武器页面解析范围已保存到 data/debug_parseWeaponMaterials.json（长度: ${parseRange.length}）`);
            } catch (e) { if (Utils.isCancellationError(e)) throw e;
                log.warn(`📌 武器页面调试信息保存失败: ${e.message}`);
            }

            // 辅助：在指定 level（如 20/60/70）之后找到第一个 "突破"，
            //       再从 "突破" 之后提取 count 个 title 属性，返回 title 数组。
            const extractTitlesAfterLevel = (levelStr, count) => {
                // 定位 <big><b>${levelStr}</b></big>
                const levelPattern = new RegExp(`<big><b>${levelStr}</b></big>`, "i");
                const levelMatch = parseRange.match(levelPattern);
                if (!levelMatch) {
                    log.info(`📌 未找到 "${levelStr}" 标记`);
                    return [];
                }
                const levelIdx = parseRange.indexOf(levelMatch[0]);
                const afterLevel = parseRange.substring(levelIdx);

                // 在 level 之后找第一个 "突破"
                const breakthroughRelIdx = afterLevel.indexOf('突破');
                if (breakthroughRelIdx === -1) {
                    log.info(`📌 未找到 "${levelStr}" 之后的 "突破" 标记`);
                    return [];
                }
                const afterBreakthrough = afterLevel.substring(breakthroughRelIdx);

                // 提取 title 属性
                const titlePattern = /title="([^"]+)"/gi;
                const titles = [];
                let m;
                while ((m = titlePattern.exec(afterBreakthrough)) !== null) {
                    titles.push(m[1]);
                    if (titles.length >= count) break;
                }
                log.info(`📌 "${levelStr}+突破" 提取到 ${titles.length} 个 title: ${titles.join(', ')}`);
                return titles;
            };

            // 2. 从 20级+突破 提取 3 个 title（1★ 材料）
            const titles20 = extractTitlesAfterLevel('20级', 3);
            // 3. 从 60级+突破 提取 3 个 title（2★ 材料）
            const titles60 = extractTitlesAfterLevel('60级', 3);
            // 4. 从 70级+突破 提取 3 个 title（3★ 材料）
            const titles70 = extractTitlesAfterLevel('70级', 3);

            // 至少需要 20级 的 3 个 title（核心数据）
            if (titles20.length < 3) {
                log.error(`📌 20级+突破 的 title 数量不足（${titles20.length}/3），无法解析核心材料`);
                return null;
            }

            // 1★ 材料
            const weaponDomainMaterial = titles20[0];      // 秘境材料(1★)
            const weapons1Material = titles20[1];          // 武器材料1(1★)
            const weapons2Material = titles20[2];          // 武器材料2(1★)

            // 2★ 材料（排除第一个秘境材料 title，后面两个是武器材料1/2）
            let weapons1Material2 = null;
            let weapons2Material2 = null;
            if (titles60.length >= 3) {
                weapons1Material2 = titles60[1];
                weapons2Material2 = titles60[2];
            }

            // 3★ 材料（排除第一个秘境材料 title，后面两个是武器材料1/2）
            let weapons1Material3 = null;
            let weapons2Material3 = null;
            if (titles70.length >= 3) {
                weapons1Material3 = titles70[1];
                weapons2Material3 = titles70[2];
            }

            log.info(`📌 解析结果: 秘境材料(1★)=${weaponDomainMaterial}, 武器材料1(1★)=${weapons1Material}, 武器材料2(1★)=${weapons2Material}`);
            log.info(`📌 解析结果: 武器材料1(2★)=${weapons1Material2}, 武器材料2(2★)=${weapons2Material2}`);
            log.info(`📌 解析结果: 武器材料1(3★)=${weapons1Material3}, 武器材料2(3★)=${weapons2Material3}`);

            return {
                weaponDomainMaterial: weaponDomainMaterial,
                weapons1Material: weapons1Material,
                weapons2Material: weapons2Material,
                weapons1Material2: weapons1Material2,
                weapons2Material2: weapons2Material2,
                weapons1Material3: weapons1Material3,
                weapons2Material3: weapons2Material3
            };
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            log.error(`解析武器材料失败: ${e.message}`);
            return null;
        }
    },

    /**
     * 清理魔物名称
     * @param {string} name - 原始魔物名称
     * @returns {string} - 清理后的魔物名称
     */
    cleanMobName(name) {
        if (!name) return null;

        // 去掉 "xx级以上"、"掉落"、"星尘兑换"、"合成获得" 等文字
        let cleaned = name;

        // 去掉数字+级以上
        cleaned = cleaned.replace(/\d+级以上/g, '');

        // 去掉 "掉落"
        cleaned = cleaned.replace(/掉落/g, '');

        // 去掉 "星尘兑换"
        cleaned = cleaned.replace(/星尘兑换/g, '');

        // 去掉 "合成获得"
        cleaned = cleaned.replace(/合成获得/g, '');

        // 去掉引号
        cleaned = cleaned.replace(/"/g, '');

        // 去掉多余空格
        cleaned = cleaned.trim();

        log.info(`📌 清理魔物名称: ${name} -> ${cleaned}`);

        return cleaned;
    },

    /**
     * 解析武器页面获取星级
     * @param {string} html - HTML 内容
     * @returns {string} - 武器星级（如"四星"、"五星"等）
     */
    parseWeaponStar(html) {
        try {
            // 武器星级格式：<div style="color:#FFAF52;font-size:x-large;">★★★★</div>
            // 星星数量代表星级
            
            // 匹配包含星星的 div 标签
            const starPattern = /<div[^>]*style="[^"]*color:\s*#FFAF52[^"]*"[^>]*>([^<]+)<\/div>/gi;
            const match = html.match(starPattern);
            
            if (match) {
                log.info(`📌 找到星级匹配: ${match[0]}`);
                // 提取星星数量
                const starContent = match[0].replace(/<[^>]+>/g, '').trim();
                const starCount = (starContent.match(/★/g) || []).length;
                
                log.info(`📌 星星数量: ${starCount}`);
                
                // 根据星星数量返回对应的中文名称
                const starNames = {
                    1: "一星",
                    2: "二星",
                    3: "三星",
                    4: "四星",
                    5: "五星"
                };
                
                return starNames[starCount] || null;
            }
            
            // 备用匹配模式：查找 font-size:x-large 或类似样式
            const altPattern = /<div[^>]*font-size:\s*x-large[^>]*>([^<]+)<\/div>/gi;
            const altMatch = html.match(altPattern);
            
            if (altMatch) {
                log.info(`📌 备用星级匹配: ${altMatch[0]}`);
                const starContent = altMatch[0].replace(/<[^>]+>/g, '').trim();
                const starCount = (starContent.match(/★/g) || []).length;
                
                log.info(`📌 备用星星数量: ${starCount}`);
                
                const starNames = {
                    1: "一星",
                    2: "二星",
                    3: "三星",
                    4: "四星",
                    5: "五星"
                };
                
                return starNames[starCount] || null;
            }
            
            log.info(`📌 武器星级未找到匹配`);
            return null;
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            log.error(`解析武器星级失败: ${e.message}`);
            return null;
        }
    },

    /**
     * 从来源部分提取怪物名称
     */
    extractMobName(section) {
        // 怪物材料来源格式有多种：
        // 1. <b>精英怪物掉落</b><br><a href="..." title="深邃拟覆叶">深邃拟覆叶</a>掉落
        // 2. <b>普通怪物掉落</b><br>部族龙形武士掉落<br>星尘兑换
        // 3. <b>普通怪物掉落</b><br><b>合成获得</b><br>60级以上巡陆艇掉落
        // 4. 多个魔物：<b>普通怪物掉落</b><br />先遣队掉落<br />债务处理人少量掉落<br /><a title="雷萤术士">雷萤术士</a>少量掉落

        // 尝试匹配 "精英怪物掉落" 或 "普通怪物掉落"
        const dropTypes = ["精英怪物掉落", "普通怪物掉落", "怪物掉落"];

        for (const dropType of dropTypes) {
            const dropIndex = section.indexOf(dropType);
            if (dropIndex !== -1) {
                const afterDrop = section.substring(dropIndex, dropIndex + 400);

                // 收集所有魔物名称
                const mobNames = [];

                // 模式1: 提取所有 <a href="..." title="怪物名称"> 标签中的名称
                const linkPattern = /<a[^>]*title="([^"]+)"[^>]*>/gi;
                let linkMatch;
                while ((linkMatch = linkPattern.exec(afterDrop)) !== null) {
                    let name = linkMatch[1].trim();
                    // 过滤掉 "（页面不存在）" 等无用括号内容
                    name = name.replace(/\（[^）]*\）/g, "").trim();
                    name = name.replace(/\([^)]*\)/g, "").trim();
                    if (name.length > 2) {
                        log.info(`📌 从 <a> 标签提取怪物名称: ${name}`);
                        mobNames.push(name);
                    }
                }

                // 模式2: 提取所有 <br>怪物名称掉落 或 <br />怪物名称掉落
                const brPattern = /<br\s*\/?>\s*([^<]+)掉落/gi;
                let brMatch;
                while ((brMatch = brPattern.exec(afterDrop)) !== null) {
                    let name = brMatch[1].replace(/掉落/g, "").trim();
                    // 去掉 "xx级以上" 等前缀
                    name = name.replace(/\d+级以上/g, "").trim();
                    // 去掉 "少量" 等修饰词
                    name = name.replace(/少量/g, "").trim();
                    log.info(`📌 从 <br> 后提取怪物名称候选: ${name}`);

                    // 处理括号内的具体类型展开，如 "龙蜥（幼岩/岩/深海/深海幼）"
                    const bracketMatch = name.match(/^(.+?)\（([^）]+)\）$|^(.+?)\(([^)]+)\)$/);
                    if (bracketMatch) {
                        const baseName = bracketMatch[1] || bracketMatch[3];
                        const types = bracketMatch[2] || bracketMatch[4];
                        // 先添加基础名称
                        if (baseName.length > 2 && !mobNames.includes(baseName)) {
                            log.info(`📌 添加基础怪物名称: ${baseName}`);
                            mobNames.push(baseName);
                        }
                        // 分割括号内的类型（使用斜杠分隔）
                        const typeList = types.split(/[\/与]/).map(t => t.trim()).filter(t => t.length > 0);
                        for (const type of typeList) {
                            const fullName = type + baseName;
                            if (fullName.length > 2 && !mobNames.includes(fullName)) {
                                log.info(`📌 从括号展开提取怪物名称: ${fullName}`);
                                mobNames.push(fullName);
                            }
                        }
                    } else {
                        // 处理多种分隔符的情况：斜杠、与字
                        const splitNames = name.split(/[\/与]/).map(n => n.trim()).filter(n => n.length > 2);
                        if (splitNames.length > 1) {
                            for (const splitName of splitNames) {
                                if (!mobNames.includes(splitName)) {
                                    log.info(`📌 从分隔符分割提取怪物名称: ${splitName}`);
                                    mobNames.push(splitName);
                                }
                            }
                        } else if (name.length > 2 && !mobNames.includes(name)) {
                            mobNames.push(name);
                        }
                    }
                }

                // 如果找到了魔物名称，用逗号分隔返回
                if (mobNames.length > 0) {
                    const result = mobNames.join(", ");
                    log.info(`📌 最终提取怪物名称（多个）: ${result}`);
                    return result;
                }

                // 模式3: 直接从文本中提取（去掉HTML标签后）
                // 移除所有HTML标签，然后查找"掉落"前面的怪物名称
                const cleanText = afterDrop.replace(/<[^>]+>/g, "").trim();

                // 查找所有 "xxx掉落" 的模式
                const cleanPattern = /([\u4e00-\u9fa5]+)掉落/gi;
                let cleanMatch;
                while ((cleanMatch = cleanPattern.exec(cleanText)) !== null) {
                    let name = cleanMatch[1].replace(/掉落/g, "").trim();
                    // 去掉 "xx级以上" 等前缀
                    name = name.replace(/\d+级以上/g, "").trim();
                    // 去掉 "少量" 等修饰词
                    name = name.replace(/少量/g, "").trim();
                    log.info(`📌 从文本提取怪物名称候选: ${name}`);

                    // 处理括号内的具体类型展开，如 "龙蜥（幼岩/岩/深海/深海幼）"
                    const bracketMatch = name.match(/^(.+?)\（([^）]+)\）$|^(.+?)\(([^)]+)\)$/);
                    if (bracketMatch) {
                        const baseName = bracketMatch[1] || bracketMatch[3];
                        const types = bracketMatch[2] || bracketMatch[4];
                        // 先添加基础名称
                        if (baseName.length > 2 && !mobNames.includes(baseName)) {
                            log.info(`📌 添加基础怪物名称: ${baseName}`);
                            mobNames.push(baseName);
                        }
                        // 分割括号内的类型（使用斜杠分隔）
                        const typeList = types.split(/[\/与]/).map(t => t.trim()).filter(t => t.length > 0);
                        for (const type of typeList) {
                            const fullName = type + baseName;
                            if (fullName.length > 2 && !mobNames.includes(fullName)) {
                                log.info(`📌 从括号展开提取怪物名称: ${fullName}`);
                                mobNames.push(fullName);
                            }
                        }
                    } else {
                        // 处理多种分隔符的情况：斜杠、与字
                        const splitNames = name.split(/[\/与]/).map(n => n.trim()).filter(n => n.length > 2);
                        if (splitNames.length > 1) {
                            for (const splitName of splitNames) {
                                if (!mobNames.includes(splitName)) {
                                    log.info(`📌 从分隔符分割提取怪物名称: ${splitName}`);
                                    mobNames.push(splitName);
                                }
                            }
                        } else if (name.length > 2 && !mobNames.includes(name)) {
                            mobNames.push(name);
                        }
                    }
                }

                // 如果找到了魔物名称，用逗号分隔返回
                if (mobNames.length > 0) {
                    const result = mobNames.join(", ");
                    log.info(`📌 最终提取怪物名称（多个）: ${result}`);
                    return result;
                }
            }
        }

        log.info(`📌 怪物名称未找到匹配`);
        return null;
    }
};