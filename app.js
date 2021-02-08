
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

(async () => {
    try {
        const stream = await CreateTwitterStream(config.CRYPTOS, config.TWITTER_BEARER_TOKEN);

        stream.on('data', data => {
            try {
                const json = JSON.parse(data);
                const cryptos = json.matching_rules.map(rule => rule.tag);
                broadcastNewTweet(cryptos);
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

const broadcastNewTweet = cryptos => {
    console.log('Got tweet! Broadcasting notification...');
    const message = {
        notification: {
            title: 'Elon Musk just tweeted about crypto!',
            body: `Mentioned crypto(s): ${cryptos.toNotificationSyntax()}`
        }
    };
    const options = {
        priority: "high",
        timeToLive: 60 * 60 * 2
    };
    notificationService.sendToTopic('updates', message, options);
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