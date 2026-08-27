// Writes OCR material snapshots in the latest_record.txt format consumed by the planner panel.
var InventoryRecordWriter = {
    formatTimestamp: function() {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const day = now.getDate();
        const hour24 = now.getHours();
        const period = hour24 >= 12 ? "下午" : "上午";
        const hour12 = hour24 % 12 || 12;
        const minutes = String(now.getMinutes()).padStart(2, "0");
        const seconds = String(now.getSeconds()).padStart(2, "0");
        return `${year}/${month}/${day} ${period}${hour12}:${minutes}:${seconds}`;
    },

    buildBlock: function(category, items) {
        const pairs = Object.keys(items || {})
            .filter(name => name && items[name] !== undefined && items[name] !== null)
            .map(name => `${name}: ${items[name]}`);

        if (pairs.length === 0) return "";

        return [
            this.formatTimestamp(),
            `全材料扫描 - ${category || "BetterGI OCR"} 种类: ${pairs.length} 数量:`,
            pairs.join(", "),
            ""
        ].join("\n");
    },

    trimHistory: function(content, maxRecords) {
        const lines = content.split(/\r?\n/);
        const dateLinePattern = /^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}/;
        let seen = 0;
        const kept = [];

        for (const line of lines) {
            if (dateLinePattern.test(line.trim())) {
                seen += 1;
            }
            if (seen > maxRecords) {
                break;
            }
            kept.push(line);
        }

        return kept.join("\n").trim();
    },

    appendSnapshot: function(category, items) {
        try {
            const block = this.buildBlock(category, items);
            if (!block) return;

            let previous = "";
            try {
                previous = file.readTextSync(Constants.LATEST_RECORD_FILE);
            } catch (error) { if (Utils.isCancellationError(error)) throw error;
                previous = "";
            }

            const nextContent = this.trimHistory(`${block}\n${previous || ""}`, 40);
            file.writeTextSync(Constants.LATEST_RECORD_FILE, `${nextContent}\n`);
            log.info(`已更新背包扫描记录: ${Constants.LATEST_RECORD_FILE}`);
        } catch (error) { if (Utils.isCancellationError(error)) throw error;
            log.warn(`写入背包扫描记录失败: ${error.message}`);
        }
    }
};
