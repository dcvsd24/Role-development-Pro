// 多角色培养辅助模块（仅依赖全局 Utils/Constants/file/log）
// 提供：config.json 配置读取（getConfigValue）、培养角色列表构建（buildCultivationCharacters）、
// 培养角色字段切换（applyCharacterToSettings）、配置快照与恢复（snapshotCharacterConfig/restoreCharacterConfig）。
// settings 为 main.js 中的全局对象，由调用方传入。

// 封装从config.json读取配置的通用函数
// 未找到 key 时返回 undefined（交由调用方按"配置为空"跳过），
// 而不是抛错中断整个主流程（如武器名未配置时 weaponDomainName 不存在）
function getConfigValue(key) {
    try {
        const configContent = file.readTextSync(Constants.CONFIG_PATH);
        const configData = JSON.parse(configContent);
        for (const item of configData) {
            if (item.hasOwnProperty(key)) {
                return item[key];
            }
        }
        log.info(`未在config.json中找到${key}配置，按空处理`);
        return undefined;
    } catch (fileError) { if (Utils.isCancellationError(fileError)) throw fileError;
        throw new Error(`读取/解析config.json失败: ${fileError.message}`);
    }
}

// 构建培养角色列表：
// - 角色1 固定取自主页 settings 的培养字段；Character 为空（trim 后）时 log.error 并返回空数组，
//   是否抛错终止由调用方保证（与现有 main.js 行为一致）；
// - 角色2/角色3 取自 characterSlots 参数（嵌套对象，Character trim 后非空才加入）；
//   嵌套对象不能存入 settings（BetterGI 注入的宿主对象），否则配置组保存时序列化失败；
// - 与已收集角色重名的项 log.warn 后跳过，不加入列表。
function buildCultivationCharacters(settings, characterSlots) {
    const result = [];

    const mainName = (settings.Character || "").trim();
    if (mainName) {
        result.push({
            index: 1,
            label: '角色1',
            isMain: true,
            Character: settings.Character,
            bossRequireCounts: settings.bossRequireCounts,
            weaponMaterialRequireCounts: settings.weaponMaterialRequireCounts,
            talentBookRequireCounts: settings.talentBookRequireCounts,
            weaponName: settings.weaponName
        });
    } else {
        log.error('未配置角色1名称');
        return [];
    }

    const extraSlots = [
        { slot: characterSlots.character2, index: 2, label: '角色2' },
        { slot: characterSlots.character3, index: 3, label: '角色3' }
    ];
    for (const entry of extraSlots) {
        if (!entry.slot || typeof entry.slot !== 'object') {
            continue;
        }
        const name = (entry.slot.Character || "").trim();
        if (!name) {
            continue;
        }
        const isDuplicate = result.some(c => ((c.Character || "").trim()) === name);
        if (isDuplicate) {
            log.warn(`⚠️ 角色${entry.index}【${name}】与已配置角色重名，跳过`);
            continue;
        }
        result.push({
            index: entry.index,
            label: entry.label,
            isMain: false,
            Character: entry.slot.Character,
            bossRequireCounts: entry.slot.bossRequireCounts,
            weaponMaterialRequireCounts: entry.slot.weaponMaterialRequireCounts,
            talentBookRequireCounts: entry.slot.talentBookRequireCounts,
            weaponName: entry.slot.weaponName
        });
    }

    return result;
}

// 将培养角色的字段覆盖到全局 settings。
// 仅覆盖以下五个培养相关字段（值为空时用 '' 兜底）：
// Character / bossRequireCounts / weaponMaterialRequireCounts / talentBookRequireCounts / weaponName；
// 队伍/策略/圣遗物等其余设置沿用主页，不做改动。
function applyCharacterToSettings(settings, char) {
    settings.Character = char.Character || '';
    settings.bossRequireCounts = char.bossRequireCounts || '';
    settings.weaponMaterialRequireCounts = char.weaponMaterialRequireCounts || '';
    settings.talentBookRequireCounts = char.talentBookRequireCounts || '';
    settings.weaponName = char.weaponName || '';
}

// 生成 config.json 配置快照：
// 读取 Constants.CONFIG_PATH 文本，解析校验为 JSON 数组后原样返回文本；
// 读取或解析失败时 log.warn 并返回 null（交由调用方决定后续处理）。
function snapshotCharacterConfig() {
    try {
        const configText = file.readTextSync(Constants.CONFIG_PATH);
        const configData = JSON.parse(configText);
        if (!Array.isArray(configData)) {
            throw new Error('config.json 内容不是 JSON 数组');
        }
        return configText;
    } catch (e) { if (Utils.isCancellationError(e)) throw e;
        log.warn(`生成配置快照失败: ${e.message}`);
        return null;
    }
}

// 恢复配置快照：将快照文本原样写回 config.json。
// 快照为空时 log.warn 并返回 false；写入成功后返回 true。
function restoreCharacterConfig(snapshot) {
    if (!snapshot) {
        log.warn('配置快照为空，跳过恢复');
        return false;
    }
    file.writeTextSync(Constants.CONFIG_PATH, snapshot);
    log.info('✅ 已恢复该角色的配置快照');
    return true;
}

// ==================== 共享背包材料多角色需求累加（渐进基数） ====================
// 背景：摩拉/经验书/天赋书/武器秘境材料/首领材料/地方特产/魔物材料均为账号共享背包资源，
// 脚本按 角色1→2→3 顺序培养时，若每角色缺口都按"本角色总需求 - 背包现有量"判定，
// 多角色共用同种材料会导致背包存量被重复占用而漏刷。
// 引入"渐进基数"口径（与 farming.js / farmingStages.js / materialCollection.js 一致）：
//   缺口 = 前面角色累计需求(基数) + 本角色需求 - 背包现有量
// 本模块维护两张表：
//   sharedDemandBaseline —— 材料名 → 前面角色累计需求（数组或数字），每角色培养完成时累加；
//   currentDemandBase    —— 当前角色判定基数（该角色培养/采集期间"前面角色累计"的快照，
//                           含该角色 7 类材料键），刷取/采集阶段按
//                           "缺口 = currentDemandBase[材料名] + 本角色需求 - 背包现有" 取用，
//                           即渐进判定基数 = 前面角色累计需求 + 当前角色需求。
// 材料名 key 口径（构建与取用两端一致，统一用 config 原始名，不做 fuzzy）：
//   天赋书   talentDomainName 原始值        需求 = Utils.parseAndValidateCounts(talentBookRequireCounts0, 3)
//   武器秘境 weaponDomainName 原始值        需求 = Utils.parseAndValidateCounts(weaponMaterialRequireCounts0, 4)
//   首领     bossMaterialNameRaw 原始值     需求 = Number(bossRequireCounts0)
//   地方特产 LocalSpecialties 原始值        需求 = Number(totalNeedLocalAmount)
//   魔物     talentMobMaterialNameRaw 首值  需求 = Number(totalNeedMonsterStar3)
//   武器1    Weapons1 materialNameRaw 首值  需求 = Number(totalNeedamount1Stars3)
//   武器2    Weapons2 materialNameRaw 首值  需求 = Number(totalNeedamount2Stars3)

// 材料名 → 前面角色累计需求（数组或数字），培养循环逐角色累计
var sharedDemandBaseline = {};

// 当前角色判定基数：材料名 → 前面角色累计需求（当前角色培养/采集期间的快照，
// 当前角色自身需求由各消费端读取 config 后叠加，见上方口径说明）
var currentDemandBase = {};

// 品质数组逐位相加，长度不齐按较长者补 0（如天赋书 3 档 / 武器秘境材料 4 档）
function addDemandArrays(a, b) {
    const arrA = Array.isArray(a) ? a : [];
    const arrB = Array.isArray(b) ? b : [];
    const result = [];
    for (let i = 0; i < Math.max(arrA.length, arrB.length); i++) {
        const va = i < arrA.length ? (Number(arrA[i]) || 0) : 0;
        const vb = i < arrB.length ? (Number(arrB[i]) || 0) : 0;
        result.push(va + vb);
    }
    return result;
}

// 获取材料的累计需求基数（数组或数字），无记录返回 undefined
function getSharedBaseline(key) {
    const value = sharedDemandBaseline[key];
    // 数组返回副本，避免调用方修改污染累计表
    return Array.isArray(value) ? value.slice() : value;
}

// 向累计表同型相加：数组逐位相加 / 数字相加；demand 为 undefined 视为 0；key 为空不入表
function addSharedBaseline(key, demand) {
    if (key === undefined || key === null || String(key).trim() === "") {
        return;
    }
    const existing = sharedDemandBaseline[key];
    const incoming = (demand === undefined || demand === null) ? 0 : demand;
    if (Array.isArray(existing) || Array.isArray(incoming)) {
        sharedDemandBaseline[key] = addDemandArrays(
            Array.isArray(existing) ? existing : [Number(existing) || 0],
            Array.isArray(incoming) ? incoming : [Number(incoming) || 0]
        );
    } else {
        sharedDemandBaseline[key] = (Number(existing) || 0) + (Number(incoming) || 0);
    }
}

// 解析当前角色 7 类共享材料需求（内部使用，configArray 为已解析的 config.json 数组）：
// 返回 [{ name: 材料名, demand: 需求(数组或数字) }, ...]，材料名配置为空的类型跳过不入表
function parseCurrentCharacterSharedDemands(configArray) {
    const demands = [];
    const lookup = (k) => {
        const idx = configArray.findIndex(item => item && Object.prototype.hasOwnProperty.call(item, k));
        return idx !== -1 ? configArray[idx][k] : undefined;
    };
    // 原始名：key 不存在/值为空时返回 ""（各处取值兜底，配置为空的类型跳过）
    const rawName = (k) => {
        const v = lookup(k);
        return (v === undefined || v === null) ? "" : String(v);
    };
    // 首值名：取"1★,2★,3★"三连的首值并 trim
    const firstName = (k) => (rawName(k).split(",")[0] || "").trim();
    const toNumber = (v) => {
        const n = Number(v);
        return isNaN(n) ? 0 : n;
    };
    // 解析"n1-n2-..."品质串；解析失败时按全 0 数组兜底（材料名已配置，保留该键以免丢失前面角色累计）
    const parseCounts = (key, expected) => {
        try {
            return Utils.parseAndValidateCounts(lookup(key), expected);
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            log.warn(`⚠️ 配置 ${key} 解析失败，按全 0 需求处理: ${e.message}`);
            const zeros = [];
            for (let i = 0; i < expected; i++) {
                zeros.push(0);
            }
            return zeros;
        }
    };

    // 1. 天赋书（3 档品质数组）
    const talentName = rawName("talentDomainName");
    if (talentName.trim() !== "") {
        demands.push({ name: talentName, demand: parseCounts("talentBookRequireCounts0", 3) });
    }
    // 2. 武器秘境材料（4 档品质数组）
    const weaponDomainName = rawName("weaponDomainName");
    if (weaponDomainName.trim() !== "") {
        demands.push({ name: weaponDomainName, demand: parseCounts("weaponMaterialRequireCounts0", 4) });
    }
    // 3. 首领材料（数字）
    const bossName = rawName("bossMaterialNameRaw");
    if (bossName.trim() !== "") {
        demands.push({ name: bossName, demand: toNumber(lookup("bossRequireCounts0")) });
    }
    // 4. 地方特产（数字）
    const localName = rawName("LocalSpecialties");
    if (localName.trim() !== "") {
        demands.push({ name: localName, demand: toNumber(lookup("totalNeedLocalAmount")) });
    }
    // 5. 魔物材料（数字，名称取首值）
    const magicName = firstName("talentMobMaterialNameRaw");
    if (magicName !== "") {
        demands.push({ name: magicName, demand: toNumber(lookup("totalNeedMonsterStar3")) });
    }
    // 6. 武器1 魔物材料（数字，名称取首值）
    const weapons1Name = firstName("Weapons1 materialNameRaw");
    if (weapons1Name !== "") {
        demands.push({ name: weapons1Name, demand: toNumber(lookup("totalNeedamount1Stars3")) });
    }
    // 7. 武器2 魔物材料（数字，名称取首值）
    const weapons2Name = firstName("Weapons2 materialNameRaw");
    if (weapons2Name !== "") {
        demands.push({ name: weapons2Name, demand: toNumber(lookup("totalNeedamount2Stars3")) });
    }
    return demands;
}

// 读当前 config 构建 currentDemandBase（当前角色判定基数 = 前面角色累计需求的快照，
// 当前角色尚未累计入 sharedDemandBaseline），并返回深拷贝。
// 当前角色 7 类材料键均入表：有累计记录取累计值，无记录按需求类型零值兜底；
// 同时照抄 sharedDemandBaseline 的全部历史条目，保证未用到的材料不丢失累计。
function buildCurrentDemandBase() {
    const base = {};
    // 先照抄前面角色的全部累计需求
    for (const key of Object.keys(sharedDemandBaseline)) {
        const v = sharedDemandBaseline[key];
        base[key] = Array.isArray(v) ? v.slice() : v;
    }
    try {
        const configData = JSON.parse(file.readTextSync(Constants.CONFIG_PATH));
        const configArray = Array.isArray(configData) ? configData : [];
        const demands = parseCurrentCharacterSharedDemands(configArray);
        // 当前角色 7 类材料键入表：值 = 前面角色累计（无记录按类型零值兜底）
        for (const entry of demands) {
            if (!Object.prototype.hasOwnProperty.call(base, entry.name)) {
                // #10：数组型需求（天赋书 3 档/武器 4 档）无累计记录时使用与其长度一致的全零数组，
                // 而非复制当前角色自身需求，确保基数仅代表"前面角色累计需求"
                base[entry.name] = Array.isArray(entry.demand) ? entry.demand.map(() => 0) : 0;
            }
        }
        if (Object.keys(base).length > 0) {
            log.info(`📌 已构建当前角色共享材料判定基数（前面角色累计）: ${JSON.stringify(base)}`);
        }
    } catch (e) { if (Utils.isCancellationError(e)) throw e;
        log.warn(`⚠️ 构建当前角色共享材料判定基数失败: ${e.message}，仅使用已有累计`);
    }
    currentDemandBase = base;
    // 返回深拷贝，避免调用方持有引用后误改全局基数
    return JSON.parse(JSON.stringify(base));
}

// 培养完成时调用：把当前角色 7 类材料需求逐项累计入 sharedDemandBaseline，
// 供后续角色识别（getSharedBaseline）与刷取/采集（buildCurrentDemandBase）作为判定基数。
// 当前 config 即该角色的培养配置（培养流程先 build 后 add，此处在快照恢复前解析）。
function addCharacterDemandToBaseline() {
    try {
        const configData = JSON.parse(file.readTextSync(Constants.CONFIG_PATH));
        const configArray = Array.isArray(configData) ? configData : [];
        const demands = parseCurrentCharacterSharedDemands(configArray);
        if (demands.length === 0) {
            log.info("📌 当前角色无共享材料需求，跳过累计");
            return;
        }
        for (const entry of demands) {
            addSharedBaseline(entry.name, entry.demand);
        }
        log.info(`✅ 已累计当前角色共享材料需求: ${demands.map(d => `${d.name}=${Array.isArray(d.demand) ? d.demand.join('-') : d.demand}`).join('，')}`);
    } catch (e) { if (Utils.isCancellationError(e)) throw e;
        log.warn(`⚠️ 累计当前角色共享材料需求失败: ${e.message}`);
    }
}
