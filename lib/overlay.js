// HTML 遮罩管理模块 - 用于显示当前任务进度
// 需要 BetterGI >= 0.60.2-alpha.3

var Overlay = (function() {
    const MIN_MASK_VERSION = '0.60.2-alpha.3';
    let progressWinId = null;
    let useMask = false;
    let keyHook = null;
    let startTime = null;
    let totalStages = 0;
    let currentStage = 0;
    // 已显示过的最大百分比，用于保证进度条单调不降
    let maxPercentageSeen = 0;
    // 多角色培养进度窗口（{start, end}），非空时子阶段百分比线性映射到该窗口
    let charWindow = null;

    // 版本检测与初始化
    function initOverlay(version) {
        // 检查 htmlMask API 是否可用（运行时检测，而非版本号比较）
        try {
            if (typeof htmlMask !== 'undefined' && htmlMask && typeof htmlMask.show === 'function') {
                useMask = true;
                log.info(`✅ HTML 遮罩功能已启用（检测到 htmlMask API 可用）`);
            } else {
                log.warn(`htmlMask API 不可用，遮罩功能已禁用`);
            }
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            log.warn(`遮罩功能初始化失败: ${e.message}`);
        }
    }

    // 显示遮罩
    async function showOverlay(initialData) {
        if (!useMask) return;
        try {
            progressWinId = htmlMask.show("assets/progress-mask.html", "character-cultivation-progress");
            if (progressWinId) {
                await htmlMask.receive(progressWinId, 10000);
                log.info("✅ 遮罩已就绪");
            }
            if (progressWinId && initialData) {
                htmlMask.send(progressWinId, "/progress", JSON.stringify(initialData));
            }
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            log.error("遮罩显示失败:", e);
            progressWinId = null;
        }
    }

    // 发送进度数据
    function sendProgress(data) {
        if (!progressWinId) {
            log.warn('sendProgress: progressWinId 为空，无法发送进度');
            return;
        }
        try {
            if (typeof htmlMask.exists === 'function' && !htmlMask.exists(progressWinId)) {
                log.warn('sendProgress: 遮罩窗口已不存在，清除 progressWinId');
                progressWinId = null;
                return;
            }
            const jsonData = JSON.stringify(data);
            htmlMask.send(progressWinId, "/progress", jsonData);
            log.debug(`进度已更新: ${data.stage || ''} - ${data.status || ''} (${data.percentage || 0}%)`);
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            log.error('sendProgress 发送失败:', e.message || e);
        }
    }

    // 更新任务阶段进度
    // percentage 为总体进度（0-100）。current 由 percentage 推算得到，避免多次
    // updateStage 调用导致 current 超过 total；同时保证百分比单调不降。
    function updateStage(stageName, status, percentage) {
        const elapsed = getElapsedTime();

        let reportedPct;
        if (typeof percentage === 'number' && percentage >= 0) {
            // 多角色培养窗口非空时，先将子阶段百分比（0-100）线性映射到窗口区间
            if (charWindow) {
                percentage = charWindow.start + (percentage / 100) * (charWindow.end - charWindow.start);
            }
            // 子阶段可能传入更小的百分比，取历史最大值避免进度条回退
            reportedPct = Math.min(100, Math.max(maxPercentageSeen, percentage));
            maxPercentageSeen = reportedPct;
            // 根据 percentage 推算 current，确保在 [1, totalStages] 范围内
            if (percentage > 0 && totalStages > 0) {
                currentStage = Math.min(totalStages, Math.max(1, Math.round(reportedPct / 100 * totalStages)));
            }
            // percentage === 0 视为同阶段内的状态更新，保持 currentStage 不变
        } else {
            currentStage++;
            reportedPct = (totalStages > 0) ? Math.round((currentStage / totalStages) * 100) : 0;
            if (reportedPct > maxPercentageSeen) maxPercentageSeen = reportedPct;
        }

        sendProgress({
            stage: stageName,
            status: status || '执行中',
            extraInfo: '',
            percentage: reportedPct,
            current: currentStage,
            total: totalStages,
            elapsedTime: elapsed
        });
    }

    // 更新状态文本（不递增阶段计数器，用于同阶段内的细粒度更新）
    function updateStatus(status, extraInfo) {
        sendProgress({
            status: status || '执行中',
            extraInfo: extraInfo || '',
            elapsedTime: getElapsedTime()
        });
    }

    // 关闭遮罩
    function closeOverlay() {
        if (!progressWinId) return;
        try {
            htmlMask.close(progressWinId);
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            // 静默忽略关闭失败
        }
        progressWinId = null;
    }

    // 设置总阶段数
    function setTotalStages(count) {
        totalStages = count;
        currentStage = 0;
        maxPercentageSeen = 0;
    }

    // 设置多角色培养进度窗口：updateStage 传入的子阶段百分比（0-100）将线性映射到 [start, end]
    function setCharacterProgressWindow(start, end) {
        charWindow = { start: start, end: end };
    }

    // 清除多角色培养进度窗口，恢复 updateStage 原始百分比
    function clearCharacterProgressWindow() {
        charWindow = null;
    }

    // 开始计时
    function startTimer() {
        startTime = Date.now();
    }

    // 获取已用时间
    function getElapsedTime() {
        if (!startTime) return '00分00秒';
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        return `${String(minutes).padStart(2, '0')}分${String(seconds).padStart(2)}秒`;
    }

    // 注册快捷键（N键切换最小化）
    function initKeyHook() {
        if (!useMask) return;
        try {
            keyHook = new KeyMouseHook();
            keyHook.OnKeyDown(function(key) {
                if (key === 'N' && progressWinId && htmlMask.exists(progressWinId)) {
                    htmlMask.send(progressWinId, '/toggle', '{}');
                }
            });
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            // kmCallback 不可用时静默跳过
        }
    }

    // 清理快捷键
    function disposeKeyHook() {
        try {
            if (keyHook) {
                // 先移除所有事件监听器，防止回调在 dispose 后被触发
                try {
                    keyHook.RemoveAllListeners();
                } catch (e) { if (Utils.isCancellationError(e)) throw e;
                    // 静默忽略移除监听器失败
                }
                // 再释放资源
                try {
                    keyHook.dispose();
                } catch (e) { if (Utils.isCancellationError(e)) throw e;
                    // 静默忽略释放失败
                }
            }
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            // 全局静默忽略任何清理错误
        }
        keyHook = null;
    }

    // 设置角色名称
    function setCharacterName(characterName) {
        if (!progressWinId) {
            log.warn('setCharacterName: progressWinId 为空，无法发送角色名称');
            return;
        }
        try {
            if (typeof htmlMask.exists === 'function' && !htmlMask.exists(progressWinId)) {
                log.warn('setCharacterName: 遮罩窗口已不存在，清除 progressWinId');
                progressWinId = null;
                return;
            }
            htmlMask.send(progressWinId, "/character", JSON.stringify({ characterName: characterName }));
            log.debug(`角色名称已设置: ${characterName}`);
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            log.error('setCharacterName 发送失败:', e.message || e);
        }
    }

    // 检查遮罩是否可用
    function isAvailable() {
        return useMask;
    }

    // 显示 UID 遮挡图片（使用现有的 progressWinId 窗口）
    function showUidMask(positionX, positionY) {
        if (!progressWinId) {
            log.warn('showUidMask: progressWinId 为空，无法显示 UID 遮挡');
            return;
        }
        try {
            if (typeof htmlMask.exists === 'function' && !htmlMask.exists(progressWinId)) {
                log.warn('showUidMask: 遮罩窗口已不存在');
                progressWinId = null;
                return;
            }
            htmlMask.send(progressWinId, "/uidmask", JSON.stringify({
                action: 'show',
                x: positionX || 0,
                y: positionY || 0
            }));
            log.info("✅ UID遮挡图片已显示");
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            log.error("UID遮挡显示失败:", e);
        }
    }

    // 更新 UID 遮挡图片位置
    function updateUidMaskPosition(x, y) {
        if (!progressWinId) return;
        try {
            if (typeof htmlMask.exists === 'function' && !htmlMask.exists(progressWinId)) {
                log.warn('updateUidMaskPosition: 遮罩窗口已不存在');
                progressWinId = null;
                return;
            }
            htmlMask.send(progressWinId, "/uidmask", JSON.stringify({
                action: 'position',
                x: x || 0,
                y: y || 0
            }));
            log.debug(`UID遮挡位置已更新: x=${x}, y=${y}`);
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            log.error('updateUidMaskPosition 发送失败:', e.message || e);
        }
    }

    // 关闭 UID 遮挡图片
    function closeUidMask() {
        if (!progressWinId) return;
        try {
            if (typeof htmlMask.exists === 'function' && htmlMask.exists(progressWinId)) {
                htmlMask.send(progressWinId, "/uidmask", JSON.stringify({ action: 'hide' }));
                log.info("UID遮挡图片已关闭");
            }
        } catch (e) { if (Utils.isCancellationError(e)) throw e;
            // 静默忽略关闭失败
        }
    }

    return {
        initOverlay: initOverlay,
        showOverlay: showOverlay,
        sendProgress: sendProgress,
        updateStage: updateStage,
        updateStatus: updateStatus,
        closeOverlay: closeOverlay,
        setTotalStages: setTotalStages,
        setCharacterProgressWindow: setCharacterProgressWindow,
        clearCharacterProgressWindow: clearCharacterProgressWindow,
        startTimer: startTimer,
        initKeyHook: initKeyHook,
        disposeKeyHook: disposeKeyHook,
        isAvailable: isAvailable,
        setCharacterName: setCharacterName,
        showUidMask: showUidMask,
        updateUidMaskPosition: updateUidMaskPosition,
        closeUidMask: closeUidMask
    };
})();
