// 角色选择遮罩页面模块
// 从 data/Character Data.json 读取所有角色名称及属性，弹出选择遮罩页面，返回用户选择的角色名称
// 由 main.js 在设置弹窗收到 /openCharacterPicker 消息时调用

var CharacterPicker = {
    /**
     * 显示角色选择遮罩页面
     * @returns {string|null} 用户选择的角色名称；取消或超时返回 null
     */
    show: async function() {
        if (typeof htmlMask === 'undefined' || !htmlMask || typeof htmlMask.show !== 'function') {
            log.error('CharacterPicker: htmlMask 不可用，无法显示角色选择遮罩');
            return null;
        }

        // 读取 Character Data.json 中的所有角色数据
        let characterList = [];
        try {
            const rawData = file.readTextSync("data/Character Data.json");
            const parsed = JSON.parse(rawData);
            characterList = parsed
                .map(item => ({
                    name: (item.name || "").toString().trim(),
                    star: (item["star rating"] || "").toString().trim(),
                    weapon: (item.weapon || "").toString().trim(),
                    element: (item.element || "").toString().trim()
                }))
                .filter(item => item.name);
            log.info(`CharacterPicker: 已加载 ${characterList.length} 条角色数据`);
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            log.error(`CharacterPicker: 读取 data/Character Data.json 失败: ${e.message}`);
            return null;
        }

        if (characterList.length === 0) {
            log.warn('CharacterPicker: 角色列表为空，无法显示选择遮罩');
            return null;
        }

        // 打开角色选择遮罩页面
        const pickerWinId = htmlMask.show("assets/character-picker.html", "character-picker");
        htmlMask.setClickThrough(pickerWinId, false);

        const initData = JSON.stringify({ characters: characterList });
        let initSent = false;
        let selectedCharacter = null;
        let startTime = Date.now();
        const timeoutMs = 120000; // 2 分钟超时

        while (htmlMask.exists(pickerWinId)) {
            if (Date.now() - startTime >= timeoutMs) {
                htmlMask.close(pickerWinId);
                log.warn('CharacterPicker: 选择超时（2分钟），自动关闭');
                break;
            }

            const msg = await htmlMask.receive(pickerWinId, 1000);
            if (msg) {
                try {
                    const parsed = JSON.parse(msg);
                    if (parsed.url === '/ready') {
                        if (!initSent) {
                            htmlMask.send(pickerWinId, "/initCharacters", initData);
                            initSent = true;
                        }
                    } else if (parsed.url === '/close') {
                        htmlMask.close(pickerWinId);
                        break;
                    } else if (parsed.url === '/selectCharacter') {
                        let data = parsed.data;
                        if (typeof data === 'string') {
                            try { data = JSON.parse(data); } catch (e) { if (Utils.isCancellationError(e)) throw e; data = {}; }
                        }
                        if (data && data.name) {
                            selectedCharacter = data.name;
                        }
                        htmlMask.close(pickerWinId);
                        break;
                    } else if (parsed.url === '/userActive') {
                        startTime = Date.now();
                    }
                } catch (parseError) { if (Utils.isCancellationError(parseError)) throw parseError;
                    if (msg === '/close') {
                        htmlMask.close(pickerWinId);
                        break;
                    }
                }
            }
        }

        if (selectedCharacter) {
            log.info(`CharacterPicker: 用户选择了角色 [${selectedCharacter}]`);
        } else {
            log.info('CharacterPicker: 用户未选择角色（取消或超时）');
        }

        return selectedCharacter;
    }
};
