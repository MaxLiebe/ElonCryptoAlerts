
const express = require('express');
const firebaseAdmin = require('firebase-admin');

const config = require('./config.json');

const app = express();
const port = process.env.PORT || 8000;

const serviceAccount = require('./firebase-service-key.json');
firebaseAdmin.initializeApp({ credential: firebaseAdmin.credential.cert(serviceAccount) });
const notificationService = firebaseAdmin.messaging();
const firestore = firebaseAdmin.firestore();

const { CreateTwitterStream } = require('./TwitterStream');

const Binance = require('node-binance-api');
const binance = new Binance().options({
    APIKEY: config.BINANCE_API_KEY,
    APISECRET: config.BINANCE_SECRET_KEY
});

(async () => {
    try {
        const stream = await CreateTwitterStream(config.CRYPTOS, config.TWITTER_BEARER_TOKEN);

        stream.on('data', data => {
            try {
                const json = JSON.parse(data);
                const cryptos = json.matching_rules.map(rule => rule.tag);
                const url = `https://twitter.com/elonmusk/status/${json.data.id}`;
                broadcastNewTweet(url, cryptos);
            } catch (e) {
                // Keep alive signal received. Do nothing.
            }
        }).on('error', error => {
            throw error;
        });
    }
    catch (error) {
        console.log(error);
        process.exit(1);
    }
})();

app.get('/register/:token', async (req, res) => {
    const token = req.params.token;
    const fcmTokens = firestore.collection('fcm_tokens');
    const result = await fcmTokens.where('token', '==', token).get();
    if (!result.empty) {
        res.send();
    } else {
        await notificationService.subscribeToTopic(token, 'updates');
        const tokenDocument = fcmTokens.doc();
        await tokenDocument.set({ token });
        res.send();
    }
});

const broadcastNewTweet = async (tweetUrl, cryptos) => {
    console.log('Got tweet! Broadcasting notification...');
    console.log(`Tweet URL: ${tweetUrl}`);
    let isGeneral = (cryptos.length === 1 && cryptos.includes('General'));
    let generalIndex = cryptos.indexOf('General');
    if (generalIndex !== -1) {
        cryptos.splice(generalIndex, 1);
    }
    const message = {
        notification: {
            title: 'Elon Musk just tweeted about crypto!',
            body: getNotificationBodyMessage(isGeneral, cryptos),
            click_action: 'action.open.tweet',
        },
        data: { tweetUrl }
    };
    const options = {
        priority: "high",
        timeToLive: 60 * 60 * 4,
    };
    notificationService.sendToTopic('updates', message, options);

    //holy fuck this is a dumb idea. but fuck it.
    if (!isGeneral) {
        let ticker;
        let decimals = 2;
        switch (cryptos[0]) {
            case "Bitcoin": ticker = "BTCUSDT"; break;
            case "Ethereum": ticker = "ETHUSDT"; break;
            case "Dogecoin": ticker = "DOGEUSDT"; decimals = 0; break;
            case "Cardano": ticker = "ADAUSDT"; decimals = 0; break;
            default: return;
        }

        let targetCost = parseFloat(config.TARGET_PRICE);
        let leverage = parseInt(config.LEVERAGE);
        let price = (await binance.futuresPrices())[ticker];
        let amountToBuy = (targetCost * leverage / price).toFixed(decimals);
        await binance.futuresLeverage(ticker, leverage);
        await binance.futuresMarginType(ticker, 'CROSSED');
        await binance.futuresMarketBuy(ticker, amountToBuy);
        setTimeout(async () => {
            await binance.futuresMarketSell(ticker, amountToBuy);
        }, parseInt(config.EXIT_POSITION_COUNTDOWN) * 1000);
    }
}

const getNotificationBodyMessage = (general, cryptos) => {
    if (general) {
        return 'No specific crypto mentioned.';
    } else {
        return `Mentioned crypto(s): ${cryptos.toNotificationSyntax()}`;
    }
}

app.listen(port, () => {
    console.log(`Token registration service listening on port ${port}`)
});

Array.prototype.toNotificationSyntax = function () {
    let result = '';
    for (element of this) {
        result += `${element} and `;
    }
    return result.slice(0, -5);
}