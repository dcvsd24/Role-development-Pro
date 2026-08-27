// Farming progress persistence for the planner UI.
var ProgressLogger = {
    getDefaultData: function() {
        return {
            version: 1,
            updatedAt: new Date().toISOString(),
            tasks: {}
        };
    },

    makeKey: function(uid, characterName, materialType, materialName) {
        return [
            uid || Constants.DEFAULT_UID,
            characterName || "unknown",
            materialType || "unknown",
            materialName || "unknown"
        ].join("_");
    },

    load: function() {
        return Utils.readJson(Constants.FARMING_PROGRESS_FILE, this.getDefaultData());
    },

    save: function(data) {
        try {
            data.updatedAt = new Date().toISOString();
            file.writeTextSync(Constants.FARMING_PROGRESS_FILE, JSON.stringify(data, null, 2));
        } catch (error) { if (Utils.isCancellationError(error)) throw error;
            log.warn(`保存刷取进度失败: ${error.message}`);
        }
    },

    normalizeAmount: function(amount) {
        if (Array.isArray(amount)) {
            return amount.reduce((sum, item) => sum + Number(item || 0), 0);
        }
        const value = Number(amount);
        return Number.isFinite(value) ? value : 0;
    },

    upsert: function(options) {
        try {
            const data = this.load();
            const uid = options.uid || Constants.DEFAULT_UID;
            const characterName = options.characterName || "unknown";
            const materialType = options.materialType || "unknown";
            const materialName = options.materialName || "unknown";
            const key = this.makeKey(uid, characterName, materialType, materialName);
            const previous = data.tasks[key] || {};
            const targetAmount = Math.max(
                this.normalizeAmount(options.targetAmount),
                this.normalizeAmount(previous.targetAmount)
            );
            const remainingAmount = Math.max(0, this.normalizeAmount(options.remainingAmount));
            const completedAmount = options.completedAmount !== undefined
                ? Math.max(0, this.normalizeAmount(options.completedAmount))
                : Math.max(0, targetAmount - remainingAmount);
            const percent = targetAmount > 0
                ? Math.min(100, Math.round((completedAmount / targetAmount) * 100))
                : 100;

            const obtainedThisRun = this.normalizeAmount(options.obtainedThisRun);
            const obtainedAmount = Math.max(0, this.normalizeAmount(previous.obtainedAmount) + obtainedThisRun);

            // 完成任务元数据：仅在本次传入时写入，且通过 ...previous 保留历史值，
            // 后续进度 upsert 不再覆盖（options 未提供时以下字段沿用 previous 的值）。
            const metaFields = {};
            if (options.requireCounts !== undefined) metaFields.requireCounts = options.requireCounts;
            if (options.cultivationConfig !== undefined) metaFields.cultivationConfig = options.cultivationConfig;
            if (options.completedAt !== undefined) metaFields.completedAt = options.completedAt;

            data.tasks[key] = {
                ...previous,
                ...metaFields,
                uid,
                characterName,
                materialType,
                materialName,
                targetAmount,
                completedAmount,
                remainingAmount,
                percent,
                obtainedThisRun,
                obtainedAmount,
                lastObtainedAmount: obtainedThisRun,
                status: options.status || (remainingAmount <= 0 ? "completed" : "running"),
                updatedAt: new Date().toISOString()
            };

            this.save(data);
        } catch (error) { if (Utils.isCancellationError(error)) throw error;
            log.warn(`记录刷取进度失败: ${error.message}`);
        }
    },

    markCompleted: function(materialType, materialName, requireCounts, characterName, uid, cultivationConfig) {
        const targetAmount = this.normalizeAmount(requireCounts);
        this.upsert({
            uid,
            characterName,
            materialType,
            materialName,
            targetAmount,
            completedAmount: targetAmount,
            remainingAmount: 0,
            status: "completed",
            requireCounts,
            cultivationConfig,
            completedAt: new Date().toISOString()
        });
    }
};
