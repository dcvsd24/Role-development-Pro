// 角色经验计算 - 文件读写工具
var FileUtils = {
    nameMapping : {
        '大英雄的经验': 'PURPLE',
        '冒险家的经验': 'BLUE',
        '流浪者的经验': 'GREEN',
    },
    
    normalizeBookData: function (rawData) {
        if (!rawData || Object.keys(rawData).length === 0) {
            return {};
        }

        const result = {
            PURPLE: 0,
            BLUE: 0,
            GREEN: 0
        };

        Object.keys(rawData).forEach(key => {
            const value = rawData[key];
            const normalizedKey = this.nameMapping[key];

            if (normalizedKey) {
                result[normalizedKey] += value;
            } else {
                console.warn(`无法识别的经验书类型: ${key}`);
            }
        });

        return result;
    },

    getExpBookData: function (rawBookData, includeTotal = false) {
        const normalizedData = this.normalizeBookData(rawBookData);

        const result = [];
        let totalExp = 0;
        let totalCount = 0;

        Object.keys(normalizedData).forEach(bookType => {
            const quantity = normalizedData[bookType];

            if (quantity > 0) {
                const bookInfo = expCalculator.EXP_BOOKS[bookType];
                const expValue = bookInfo.experience * quantity;

                result.push({
                    bookName: bookInfo.name,
                    quantity: quantity,
                    totalExp: expValue
                });

                totalExp += expValue;
                totalCount += quantity;
            }
        });

        result.sort((a, b) => b.totalExp - a.totalExp);

        if (includeTotal && result.length > 0) {
            result.push({
                bookName: '总计',
                quantity: totalCount,
                totalExp: totalExp
            });
        }

        return result;
    },
}
