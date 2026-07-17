const faq = require("../knowledge/faq.json");

function findFAQ(message, language = "en") {

    const text = message.toLowerCase();

    for (const key of Object.keys(faq)) {

        const item = faq[key];

        const found = item.keywords.some(keyword =>
            text.includes(keyword.toLowerCase())
        );

        if (found) {

            return language === "es"
                ? item.response_es
                : item.response_en;

        }

    }

    return null;

}

module.exports = {
    findFAQ
};