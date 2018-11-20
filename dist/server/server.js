"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const express = require("express");
const http = require("http");
const redis = require("redis");
const bluebird = require("bluebird");
bluebird.promisifyAll(redis);
const WebSocket = require("ws");
const util_1 = require("util");
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const callbacks = {};
const redisClient = redis.createClient(6379, "127.0.0.1");
redisClient.on('connect', function () {
    console.log('Redis client connected');
});
wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => {
        ws.isAlive = true;
    });
    ws.on('message', (message) => {
        let jsonReqObj = JSON.parse(message);
        processEvent(ws, jsonReqObj.event, jsonReqObj.data);
    });
    ws.send('BLACKJACK ONLINE');
});
const processEvent = function (ws, eventName, data) {
    let registeredCallbacks = callbacks[eventName];
    if (util_1.isNullOrUndefined(registeredCallbacks))
        return;
    for (let i = 0; i < registeredCallbacks.length; i++) {
        registeredCallbacks[i](ws, data);
    }
};
const isAcceptableUserName = function (name) {
    if (util_1.isNullOrUndefined(name))
        return false;
    //Name cannot be empty or have spaces
    if (name.replace(' ', '').length == 0 || name.split(' ').length > 1)
        return false;
    return true;
};
//Game data
const cardValue = new Map([
    ['AS', 11], ['AH', 11], ['AD', 11], ['AC', 11],
    ['2S', 2], ['2H', 2], ['2D', 2], ['2C', 2],
    ['3S', 3], ['3H', 3], ['3D', 3], ['3C', 3],
    ['4S', 4], ['4H', 4], ['4D', 4], ['4C', 4],
    ['5S', 5], ['5H', 5], ['5D', 5], ['5C', 5],
    ['6S', 6], ['6H', 6], ['6D', 6], ['6C', 6],
    ['7S', 7], ['7H', 7], ['7D', 7], ['7C', 7],
    ['8S', 8], ['8H', 8], ['8D', 8], ['8C', 8],
    ['9S', 9], ['9H', 9], ['9D', 9], ['9C', 9],
    ['10S', 10], ['10H', 10], ['10D', 10], ['10C', 10],
    ['JS', 10], ['JH', 10], ['JD', 10], ['JC', 10],
    ['QS', 10], ['QH', 10], ['QD', 10], ['QC', 10],
    ['KS', 10], ['KH', 10], ['KD', 10], ['KC', 10],
]);
const fullDeck = new Set([
    'AS', 'AH', 'AD', 'AC',
    '2S', '2H', '2D', '2C',
    '3S', '3H', '3D', '3C',
    '4S', '4H', '4D', '4C',
    '5S', '5H', '5D', '5C',
    '6S', '6H', '6D', '6C',
    '7S', '7H', '7D', '7C',
    '8S', '8H', '8D', '8C',
    '9S', '9H', '9D', '9C',
    '10S', '10H', '10D', '10C',
    'JS', 'JH', 'JD', 'JC',
    'QS', 'QH', 'QD', 'QC',
    'KS', 'KH', 'KD', 'KC',
]);
//Game functions
const drawACard = function (deckSet) {
    const deckArray = Array.from(deckSet);
    const drewCard = deckArray[Math.floor(Math.random() * deckArray.length)];
    deckSet.delete(drewCard);
    return drewCard;
};
const checkHandValue = function (hand) {
    console.log('\nhand: ' + hand.toString());
    let totalValue = 0;
    let aces = 0;
    hand.forEach(element => {
        const mappedValue = cardValue.get(element.toString());
        if (mappedValue == 11) {
            aces++;
        }
        else if (typeof mappedValue === 'number') {
            totalValue += mappedValue;
        }
        else {
            console.log('error: bad card symbol');
        }
    });
    console.log('value not included aces: ' + totalValue + '\naces: ' + aces + '\n');
    for (let i = 0; i < aces; i++) {
        if (totalValue + 11 <= 21) {
            totalValue += 11;
        }
        else {
            totalValue += 1;
        }
    }
    return totalValue;
};
const startDealerPlayAndGetGameResult = function (playerHand, dealerHand) {
    const deckSet = new Set(fullDeck);
    deckSet.delete(dealerHand[0]);
    playerHand.forEach(card => {
        deckSet.delete(card);
    });
    let dealerScore = 0;
    while (true) {
        dealerScore = checkHandValue(dealerHand);
        if (dealerScore >= 17) {
            break;
        }
        dealerHand.push(drawACard(deckSet));
    }
    const playerScore = checkHandValue(playerHand);
    if (playerScore > dealerScore) {
        console.log('player WIN');
        return 1;
    }
    else if (playerScore == dealerScore) {
        console.log('the match is DRAW');
        return 0;
    }
    else {
        console.log('player LOSE');
        return -1;
    }
};
//APIs
const cs_startGame = function (ws, data) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!isAcceptableUserName(data.username))
            return;
        console.log('start game! ' + data.username);
        let isUserPlaying = {};
        try {
            isUserPlaying = yield redisClient.hgetAsync('username:' + data.username, 'isPlaying');
        }
        catch (err) {
            console.log(err);
        }
        console.log('isPlaying: ' + isUserPlaying);
        if (isUserPlaying === 'true') {
            console.log('already playing!');
            return;
        }
        if (isUserPlaying !== null && isUserPlaying !== 'false') {
            console.log('database error');
            return;
        }
        //Start game session
        const deckSet = new Set(fullDeck);
        const cardForPlayer1st = drawACard(deckSet);
        const cardForPlayer2nd = drawACard(deckSet);
        const cardForDealer = drawACard(deckSet);
        //Check Blackjack condition
        let hasBlackjack = false;
        let win = 0;
        let draw = 0;
        let playResult = 0;
        const initialHandValue = checkHandValue([cardForPlayer1st, cardForPlayer2nd]);
        if (initialHandValue == 21) {
            hasBlackjack = true;
            playResult = startDealerPlayAndGetGameResult([cardForPlayer1st, cardForPlayer2nd], [cardForDealer]);
            if (playResult === 1) {
                win = 1;
            }
            else if (playResult === 0) {
                draw = 1;
            }
            else {
                console.log("How can you lose when you get blackjack?? (shouldn't be here)");
                return;
            }
        }
        //Update player status in db
        const redisMulti = redisClient.multi();
        if (isUserPlaying === null) {
            console.log('new player start');
            redisMulti.hmset('username:' + data.username, 'isPlaying', (!hasBlackjack).toString(), 'wins', win, 'loses', 0, 'draws', draw);
        }
        else if (isUserPlaying === 'false') {
            console.log('already have account! start playing');
            if (hasBlackjack) {
                if (playResult === 1) {
                    redisMulti.hincrby('username:' + data.username, 'wins', 1);
                }
                else {
                    redisMulti.hincrby('username:' + data.username, 'draw', 1);
                }
            }
            else {
                redisMulti.hset('username:' + data.username, 'isPlaying', 'true');
            }
        }
        //Create game session (if no blackjack)
        if (!hasBlackjack) {
            redisMulti.hmset('session:' + data.username, 'lastActionTime', Date.now(), 'dealer-hand', JSON.stringify([cardForDealer]), 'player-hand', JSON.stringify([cardForPlayer1st, cardForPlayer2nd]));
        }
        try {
            const execResult = yield redisMulti.execAsync();
            if (execResult === null) {
                console.log('transaction error');
                return;
            }
        }
        catch (err) {
            console.log(err);
        }
        //Response
        const sc_startGame = {
            "event": "sc_startGame",
            "data": {
                "dealer-hand": [cardForDealer],
                "player-hand": [cardForPlayer1st, cardForPlayer2nd]
            }
        };
        ws.send(JSON.stringify(sc_startGame));
    });
};
const cs_hit = function (ws, data) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!isAcceptableUserName(data.username))
            return;
        console.log('cs_hit! ' + data.username);
        //check if playing
        let isUserPlaying = {};
        try {
            isUserPlaying = yield redisClient.hgetAsync('username:' + data.username, 'isPlaying');
        }
        catch (err) {
            console.log(err);
        }
        console.log('isPlaying: ' + isUserPlaying);
        if (isUserPlaying !== 'true') {
            console.log('user is not playing!');
            return;
        }
        try {
            yield redisClient.watchAsync('session:' + data.username);
        }
        catch (err) {
            console.log(err);
        }
        //get current hand
        let cardsDataFromSession = [];
        try {
            cardsDataFromSession = yield Promise.all([
                redisClient.hgetAsync('session:' + data.username, 'dealer-hand'),
                redisClient.hgetAsync('session:' + data.username, 'player-hand'),
            ]);
        }
        catch (err) {
            console.log(err);
        }
        const dealerHand = cardsDataFromSession[0];
        const dealerHandArray = JSON.parse(dealerHand);
        const playerHand = cardsDataFromSession[1];
        const playerHandArray = JSON.parse(playerHand);
        console.log(playerHandArray);
        //draw
        const deckSet = new Set(fullDeck);
        dealerHandArray.forEach(card => {
            deckSet.delete(card);
        });
        playerHandArray.forEach(card => {
            deckSet.delete(card);
        });
        playerHandArray.push(drawACard(deckSet));
        //Save to database
        try {
            const execResult = yield redisClient.multi()
                .hset('session:' + data.username, 'player-hand', JSON.stringify(playerHandArray))
                .execAsync();
            if (execResult === null) {
                console.log('transaction failed');
                return;
            }
        }
        catch (err) {
            console.log(err);
        }
        //Check bust
        const playerHandValue = checkHandValue(playerHandArray);
        if (playerHandValue > 21) {
            const redisMulti = redisClient.multi();
            redisMulti.hset('username:' + data.username, 'isPlaying', 'false');
            redisMulti.hincrby('username:' + data.username, 'loses', 1);
            redisMulti.del('session:' + data.username);
            try {
                const execResult = yield redisMulti.execAsync();
                if (execResult === null) {
                    console.log('transaction error');
                    return;
                }
            }
            catch (err) {
                console.log(err);
            }
        }
        //Response
        const sc_hit = {
            "event": "sc_hit",
            "data": {
                "dealer-hand": dealerHandArray,
                "player-hand": playerHandArray
            }
        };
        ws.send(JSON.stringify(sc_hit));
    });
};
const cs_stand = function (ws, data) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!isAcceptableUserName(data.username))
            return;
        console.log('cs_stand! ' + data.username);
        let isUserPlaying = {};
        try {
            isUserPlaying = yield redisClient.hgetAsync('username:' + data.username, 'isPlaying');
        }
        catch (err) {
            console.log(err);
        }
        console.log('isPlaying: ' + isUserPlaying);
        if (isUserPlaying !== 'true') {
            console.log('user is not playing!');
            return;
        }
        try {
            yield redisClient.watchAsync('session:' + data.username);
        }
        catch (err) {
            console.log(err);
        }
        //get current hand
        let cardsDataFromSession = [];
        try {
            cardsDataFromSession = yield Promise.all([
                redisClient.hgetAsync('session:' + data.username, 'dealer-hand'),
                redisClient.hgetAsync('session:' + data.username, 'player-hand'),
            ]);
        }
        catch (err) {
            console.log(err);
        }
        const dealerHand = cardsDataFromSession[0];
        const dealerHandArray = JSON.parse(dealerHand);
        const playerHand = cardsDataFromSession[1];
        const playerHandArray = JSON.parse(playerHand);
        console.log(playerHandArray);
        //Dealer start playing
        let win = 0;
        let draw = 0;
        let lose = 0;
        let playResult = startDealerPlayAndGetGameResult(playerHandArray, dealerHandArray);
        //Update player status in db
        const redisMulti = redisClient.multi();
        if (playResult === 1) {
            redisMulti.hincrby('username:' + data.username, 'wins', 1);
        }
        else if (playResult === 0) {
            redisMulti.hincrby('username:' + data.username, 'draws', 1);
        }
        else {
            redisMulti.hincrby('username:' + data.username, 'loses', 1);
        }
        redisMulti.hset('username:' + data.username, 'isPlaying', 'false');
        redisMulti.del('session:' + data.username);
        try {
            const execResult = yield redisMulti.execAsync();
            if (execResult === null) {
                console.log('transaction error');
                return;
            }
        }
        catch (err) {
            console.log(err);
        }
        //Response
        const sc_stand = {
            "event": "sc_stand",
            "data": {
                "dealer-hand": dealerHandArray,
                "player-hand": playerHandArray
            }
        };
        ws.send(JSON.stringify(sc_stand));
    });
};
const cs_leaderboard = function (ws, data) {
    console.log('cs_leaderboard!');
};
//Bindings
const bind = function (eventName, callback) {
    callbacks[eventName] = callbacks[eventName] || [];
    callbacks[eventName].push(callback);
};
bind('cs_startGame', cs_startGame);
bind('cs_hit', cs_hit);
bind('cs_stand', cs_stand);
bind('cs_leaderboard', cs_leaderboard);
setInterval(() => {
    wss.clients.forEach((ws) => {
        if (!ws.isAlive) {
            //TODO: if the client is playing game -> immediately lose
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 10000);
server.listen(process.env.PORT || 8080, () => {
    const { port } = server.address();
    console.log('Server started on port ' + port);
});
//# sourceMappingURL=server.js.map