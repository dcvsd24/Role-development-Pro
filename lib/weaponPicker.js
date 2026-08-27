// 武器选择遮罩页面模块
// 从 data/Weapons_data.json 读取所有武器名称，弹出选择遮罩页面，返回用户选择的武器名称
// 由 main.js 在设置弹窗收到 /openWeaponPicker 消息时调用

var WeaponPicker = {
    /**
     * 显示武器选择遮罩页面
     * @returns {string|null} 用户选择的武器名称；取消或超时返回 null
     */
    show: async function() {
        if (typeof htmlMask === 'undefined' || !htmlMask || typeof htmlMask.show !== 'function') {
            log.error('WeaponPicker: htmlMask 不可用，无法显示武器选择遮罩');
            return null;
        }

        // 读取 Weapons_data.json 中的所有武器名称
        let weaponList = [];
        try {
            const rawData = file.readTextSync("data/Weapons_data.json");
            const parsed = JSON.parse(rawData);
            weaponList = parsed
                .map(item => ({
                    name: (item.weapon || "").toString().trim(),
                    star: (item["star rating"] || "").toString().trim(),
                    weaponType: (item.weapon_type || "").toString().trim()
                }))
                .filter(item => item.name);
            log.info(`WeaponPicker: 已加载 ${weaponList.length} 条武器数据`);
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            log.error(`WeaponPicker: 读取 data/Weapons_data.json 失败: ${e.message}`);
            return null;
        }

        if (weaponList.length === 0) {
            log.warn('WeaponPicker: 武器列表为空，无法显示选择遮罩');
            return null;
        }

        // 打开武器选择遮罩页面
        const pickerWinId = htmlMask.show("assets/weapon-picker.html", "weapon-picker");
        htmlMask.setClickThrough(pickerWinId, false);

        const initData = JSON.stringify({ weapons: weaponList });
        let initSent = false;
        let selectedWeapon = null;
        let startTime = Date.now();
        const timeoutMs = 120000; // 2 分钟超时

        while (htmlMask.exists(pickerWinId)) {
            if (Date.now() - startTime >= timeoutMs) {
                htmlMask.close(pickerWinId);
                log.warn('WeaponPicker: 选择超时（2分钟），自动关闭');
                break;
            }

            const msg = await htmlMask.receive(pickerWinId, 1000);
            if (msg) {
                try {
                    const parsed = JSON.parse(msg);
                    if (parsed.url === '/ready') {
                        if (!initSent) {
                            htmlMask.send(pickerWinId, "/initWeapons", initData);
                            initSent = true;
                        }
                    } else if (parsed.url === '/close') {
                        htmlMask.close(pickerWinId);
                        break;
                    } else if (parsed.url === '/selectWeapon') {
                        let data = parsed.data;
                        if (typeof data === 'string') {
                            try { data = JSON.parse(data); } catch (e) { if (Utils.isCancellationError(e)) throw e; data = {}; }
                        }
                        if (data && data.weapon) {
                            selectedWeapon = data.weapon;
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

        if (selectedWeapon) {
            log.info(`WeaponPicker: 用户选择了武器 [${selectedWeapon}]`);
        } else {
            log.info('WeaponPicker: 用户未选择武器（取消或超时）');
        }

        return selectedWeapon;
    }
};
