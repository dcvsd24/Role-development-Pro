// 圣遗物副本刷取模块
// 说明：仅用原粹树脂刷到耗尽即结束，不预识别体力、不计算轮次；结束后自动分解圣遗物。

// 计算当前"轮换日"序号：以本地时间凌晨4点为每日边界（凌晨4点前归属前一天）
// 返回自纪元以来的连续日序号，保证每天凌晨4点后 +1，驱动按天轮换。
function computeRotationDayIndex() {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const now = new Date();
    // 今天本地凌晨4点
    const today4am = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 4, 0, 0, 0);
    const boundary = now.getTime() >= today4am.getTime() ? today4am : new Date(today4am.getTime() - DAY_MS);
    return Math.floor(boundary.getTime() / DAY_MS);
}

// 读取当前账号的轮换起始日（按 UID 隔离持久化到 user_settings.json 顶层，避免被设置弹窗保存覆盖）
function getRotationStartDay(uid) {
    try {
        const store = readUserSettingsStore();
        const map = store.rotationStartDay || {};
        let startDay = map[uid];
        if (typeof startDay !== 'number' || isNaN(startDay)) {
            startDay = computeRotationDayIndex();
            map[uid] = startDay;
            store.rotationStartDay = map;
            writeUserSettingsStore(store);
            log.info(`多副本轮换：首次启用，今日起算第1天（UID: ${Utils.maskUid(uid)}）`);
        }
        return startDay;
    } catch (e) { if (Utils.isCancellationError(e)) throw e;
        log.warn(`读取轮换起始日失败: ${e.message}，按当天起算`);
        return computeRotationDayIndex();
    }
}

// 多副本轮换选秘境：返回当天应刷取的原始秘境配置串（含 " | 掉落" 后缀）
// - 未启用轮换：返回主秘境（保持原逻辑）
// - 启用轮换：剔除空配置后按 1→2→3 顺序、以天为单位循环；第3个为空自动降级为双副本轮换
// 返回 null 表示无秘境可刷
function selectArtifactDomainForRotation() {
    const primary = settings.domainRunMode;
    if (!settings.artifactDomainRotate) {
        return primary || null;
    }
    const configured = [primary, settings.domainRunMode2, settings.domainRunMode3]
        .map(d => (d ? String(d).trim() : ""))
        .filter(d => d.length > 0);
    if (configured.length === 0) {
        log.error("已启用多副本轮换，但未配置任何秘境，请至少配置一个秘境");
        notification.send("圣遗物多副本轮换：未配置任何秘境，已跳过刷取");
        return null;
    }
    if (configured.length === 1) {
        log.warn("多副本轮换：仅配置 1 个秘境，将始终刷取该秘境（配置 2~3 个秘境才能实际轮换）");
        return configured[0];
    }
    if (configured.length === 2) {
        log.info("多副本轮换：配置 2 个秘境，自动切换为双副本轮换模式");
    } else {
        log.info("多副本轮换：配置 3 个秘境，三副本轮换模式");
    }

    // 当前账号UID（与主流程一致，从配置读取）
    let uid = Constants.DEFAULT_UID;
    try {
        const config = Utils.readJson(Constants.CONFIG_PATH);
        uid = config["currentUid"] || Constants.DEFAULT_UID;
    } catch (e) { if (Utils.isCancellationError(e)) throw e; }

    const startDay = getRotationStartDay(uid);
    const dayIndex = computeRotationDayIndex();
    const rotateIndex = ((dayIndex - startDay) % configured.length + configured.length) % configured.length;
    const selected = configured[rotateIndex];
    log.info(`📅 多副本轮换：第 ${rotateIndex + 1}/${configured.length} 天，今日刷取：${selected}`);
    return selected;
}

async function runArtifactDomainFarm() {
    try {
        log.info("===== 圣遗物副本刷取流程开始执行 =====");


        const selectedDomainRaw = selectArtifactDomainForRotation();
        if (!selectedDomainRaw) {
            log.info("未配置圣遗物秘境，跳过圣遗物副本刷取");
            return;
        }

        // 解析秘境名称：取 | 或 丨 之前部分并 trim，如 "山风的荆冕 | ..." -> "山风的荆冕"
        const domainName = String(selectedDomainRaw).split(/[|丨]/)[0].trim();
        if (!domainName) {
            log.info("圣遗物秘境名称解析为空，跳过");
            return;
        }
        log.info(`圣遗物秘境名称：${domainName}`);
        await genshin.returnMainUi();

        // 识别当前原粹树脂，精确计算可执行次数：40/次（双倍领取）优先，剩余体力按 20/次 补齐，混合领取
        // 避免固定大次数导致树脂耗尽后仍多执行一次、出现无法领取奖励的多余次数
        const currentStamina = await Inventory.queryStaminaValue();
        await genshin.returnMainUi();
        // 须臾树脂可执行次数：功能设置开启且识别到拥有数量时才计入；
        // 指定次数大于拥有次数时，仅按拥有次数执行；与原粹树脂为两种独立材料，不共用次数，各自独立刷取
        const configuredTransient = settings.useTransientResin ? (Math.max(1, parseInt(settings.transientResinCount, 10) || 1)) : 0;
        const transientRounds = (settings.useTransientResin && Inventory.transientResinOwned > 0)
            ? Math.min(configuredTransient, Inventory.transientResinOwned)
            : 0;
        // 原粹树脂刷取次数上限：默认刷到耗尽；如需自定义次数，可在设置中配置 domainRounds（正整数）
        const configuredRounds = (settings && settings.domainRounds)
            ? Math.max(1, parseInt(settings.domainRounds, 10) || 999)
            : 999;
        // 原粹树脂可执行次数：优先按 40/次（双倍领取）计算，剩余体力再按 20/次 补齐，两个次数可同时传入混合领取
        const count40 = Math.min(configuredRounds, Math.floor(currentStamina / 40));
        const count20 = Math.min(configuredRounds - count40, Math.floor((currentStamina - 40 * count40) / 20));
        const originalRuns = count40 + count20;
        // 原粹树脂与须臾树脂都无法运行该域时才跳过（两种树脂不共用次数）
        if (originalRuns <= 0 && transientRounds <= 0) {
            log.info(`原粹树脂与须臾树脂均不足（原粹 ${currentStamina}，须臾 ${transientRounds} 次），跳过圣遗物副本刷取`);
            return;
        }
        const originalDetail = (count40 > 0 ? `40×${count40}` : '') + (count40 > 0 && count20 > 0 ? ' + ' : '') + (count20 > 0 ? `20×${count20}` : '');
        notification.send(`圣遗物秘境：${domainName}，本次实际执行 ${originalRuns} 次原粹树脂（${originalDetail}）`
            + (transientRounds > 0 ? `，须臾树脂 ${transientRounds} 次` : ''));
        log.info(`当前原粹树脂：${currentStamina}，本次实际执行 ${originalRuns} 次原粹树脂（${originalDetail}）`
            + (transientRounds > 0 ? `，须臾树脂 ${transientRounds} 次` : ''));
        const param = new AutoDomainParam();
        param.PartyName = settings.teamName || "";
        param.DomainName = domainName;
        // 结束后是否自动分解圣遗物：默认关闭（功能设置中可开启）
        param.AutoArtifactSalvage = settings.autoArtifactSalvage === true;
        param.SpecifyResinUse = true;
        // 清零全部树脂计数字段，避免 AutoDomainParam 构造时从 BetterGI 配置带入默认值混入记录列表
        param.OriginalResinUseCount = 0;
        param.CondensedResinUseCount = 0;
        param.FragileResinUseCount = 0;
        // 探测当前 BGI 版本是否暴露 20/40 专用字段：读回校验（属性不存在时宿主引擎抛异常或返回 undefined）
        let hasResin2040Fields = false;
        try {
            hasResin2040Fields = (typeof param.OriginalResin20UseCount === 'number');
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            hasResin2040Fields = false;
        }
        if (hasResin2040Fields) {
            param.OriginalResin20UseCount = 0;
            param.OriginalResin40UseCount = 0;
            // 40 与 20 次数同时传入：任务按记录依次切换领取界面消耗量后领取，实现混合刷取
            param.OriginalResin40UseCount = count40;
            param.OriginalResin20UseCount = count20;
        } else {
            // 旧版 BGI：无 20/40 专用字段，降级传总次数，仅按总量控制以降低超领风险
            param.OriginalResinUseCount = originalRuns;
            log.warn(`当前 BGI 版本未暴露 OriginalResin20/40UseCount，原粹树脂按通用总次数 ${originalRuns} 次传入；`
                + `请升级 BetterGI 以获得 40/20 混合领取支持`);
        }
        // 须臾树脂刷取副本次数：独立于原粹树脂，不共用次数
        param.TransientResinUseCount = transientRounds;
        if (param.FightConfig) param.FightConfig.StrategyName = settings.strategyName || "";

        log.info(`开始刷取圣遗物：${domainName}（队伍：${param.PartyName}）`
            + `（自动分解：${param.AutoArtifactSalvage ? "开" : "关"}，`
            + `须臾树脂：${param.TransientResinUseCount > 0 ? param.TransientResinUseCount + "次" : "不使用"}）`);
        Overlay.updateStage('圣遗物刷取', '刷取圣遗物中...', 54);
        await dispatcher.runAutoDomainTask(param);
        log.info("✅ 圣遗物副本刷取完成");

        // 五星圣遗物分解：开启时在秘境结束后
        if (settings.enable5StarArtifactSalvage) {
            try {
                await genshin.returnMainUi();
                log.info("开始执行五星圣遗物分解...");
                keyPress("B");
                await sleep(1000);
                click(672, 48);
                await sleep(300);
                click(672, 1021);
                await sleep(1000);
                click(116, 200);
                await sleep(800);
                click(257, 200);
                await sleep(200);
                click(389, 200);
                await sleep(200);
                click(534, 200);
                await sleep(200);
                click(673, 200);
                await sleep(200);
                click(808, 200);
                await sleep(800);
                click(1679, 1024);
                await sleep(800);
                click(1184, 761);
                await sleep(1000);
                keyPress("VK_ESCAPE");
                await sleep(1000);
                keyPress("VK_ESCAPE");
                await sleep(400);
                log.info("✅ 五星圣遗物分解完成");
            } catch (e) { if (Utils.isCancellationError(e)) throw e;
                log.warn(`五星圣遗物分解失败：${e.message}`);
            }
        }

        await genshin.returnMainUi();
        return;
    } catch (error) { if (Utils.isCancellationError(error)) throw error;
        if (error.message && error.message.includes("树脂耗尽")) {
            log.info(`原粹树脂耗尽，圣遗物副本刷取结束`);
        } else {
            log.error(`圣遗物副本刷取失败：${error.message}`);
            notification.send(`圣遗物副本刷取失败：${error.message}`);
        }
        try {
            await genshin.returnMainUi();
        } catch (uiError) { if (Utils.isCancellationError(uiError)) throw uiError;
            log.warn(`返回主界面失败：${uiError.message}`);
        }
    }
    log.info("===== 圣遗物副本刷取流程执行结束 =====");
}