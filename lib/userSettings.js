// 用户设置存储模块（按 UID 分区）

// 用户设置存储路径（按UID分区）
const USER_SETTINGS_PATH = "data/user_settings.json";

// 读取设置存储（始终为 { currentUid, accounts } 结构）
function readUserSettingsStore() {
    try {
        const parsed = JSON.parse(file.readTextSync(USER_SETTINGS_PATH));
        if (parsed && typeof parsed === "object" && parsed.accounts && typeof parsed.accounts === "object") {
            return parsed;
        }
    } catch (e) { if (Utils.isCancellationError(e)) throw e;
        // 首次运行或文件损坏，使用空存储
    }
    return { currentUid: Constants.DEFAULT_UID, accounts: {} };
}

function writeUserSettingsStore(store) {
    try {
        file.writeTextSync(USER_SETTINGS_PATH, JSON.stringify(store, null, 2));
    } catch (e) { if (Utils.isCancellationError(e)) throw e;
        log.warn(`保存设置文件失败: ${e.message}`);
    }
}

// 按 UID 取当前账号设置；无则 null（使用默认值）
function getSettingsForUid(store, uid) {
    return store.accounts[uid] || null;
}

// 将某账号设置写回存储（保留其他账号），并记录 currentUid
function setSettingsForUid(store, uid, settingsObj) {
    store.accounts[uid] = settingsObj;
    store.currentUid = uid;
    return store;
}