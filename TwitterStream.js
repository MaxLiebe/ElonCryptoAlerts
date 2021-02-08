const needle = require('needle');

const rulesURL = 'https://api.twitter.com/2/tweets/search/stream/rules';
const streamURL = 'https://api.twitter.com/2/tweets/search/stream';

let rules = [];
let token;

module.exports.CreateTwitterStream = async (cryptos, bearerToken) => {
    for (let crypto of Object.keys(cryptos)) {
        const keywords = cryptos[crypto].keywords.toRuleSyntax();
        rules.push({
            'value': `(${keywords}) from:elonmusk`,
            'tag': crypto
        });
    }
    token = bearerToken;

    const existingRules = await getAllRules();

    if (Array.isArray(existingRules.data)) {
        await deleteRules(existingRules.data);
    }

    await setRules();

    const stream = await needle.get(streamURL, {
        headers: {
            "User-Agent": "eloncryptoalerts@nodejs",
            "Authorization": `Bearer ${token}`
        },
        timeout: 20000
    });

    return stream;
};

async function getAllRules() {
    const response = await needle('get', rulesURL, {
        headers: {
            "authorization": `Bearer ${token}`
        }
    })

    if (response.statusCode !== 200) {
        throw new Error(response.body);
    }

    return (response.body);
}

async function deleteRules(rules) {
    const ids = rules.map(rule => rule.id);

    const data = {
        "delete": {
            "ids": ids
        }
    }

    const response = await needle('post', rulesURL, data, {
        headers: {
            "content-type": "application/json",
            "authorization": `Bearer ${token}`
        }
    })

    if (response.statusCode !== 200) {
        throw new Error(response.body);
    }

    return (response.body);
}

async function setRules() {
    const data = {
        "add": rules
    }

    const response = await needle('post', rulesURL, data, {
        headers: {
            "content-type": "application/json",
            "authorization": `Bearer ${token}`
        }
    })

    if (response.statusCode !== 201) {
        throw new Error(response.body);
    }

    return (response.body);
}

Array.prototype.toRuleSyntax = function () {
    let result = '';
    for (element of this) {
        result += `${element} OR `;
    }
    return result.slice(0, -4);
}