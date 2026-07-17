const library = require("../database/conversationLibrary");

function getResponse(intent, language = "en") {

    const topic = library[intent];

    if (!topic) {
        return null;
    }

    const responses = topic.answers[language];

    if (!responses || responses.length === 0) {
        return null;
    }

    const randomIndex = Math.floor(Math.random() * responses.length);

    return responses[randomIndex];
}

module.exports = {
    getResponse
};