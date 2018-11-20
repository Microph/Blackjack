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
const WebSocket = require("ws");
const util_1 = require("util");
const util_2 = require("util");
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const redisClient = redis.createClient(6379, "127.0.0.1");
const setAsync = util_2.promisify(redisClient.set).bind(redisClient);
const hsetAsync = util_2.promisify(redisClient.hset).bind(redisClient);
const hmsetAsync = util_2.promisify(redisClient.hmset).bind(redisClient);
const getAsync = util_2.promisify(redisClient.get).bind(redisClient);
const hgetAsync = util_2.promisify(redisClient.hget).bind(redisClient);
const callbacks = {};
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
        //console.log(`event: ${jsonReqObj.event}\ndata:\n${JSON.stringify(jsonReqObj.data)}\n`);
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
//APIs
const cs_startGame = function (ws, data) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!isAcceptableUserName(data.username))
            return;
        console.log('start game! ' + data.username);
        let result = {};
        try {
            result = yield hgetAsync('username:' + data.username, 'isPlaying');
        }
        catch (err) {
            console.log(err);
        }
        console.log('isPlaying: ' + result);
        if (result === 'true') {
            console.log('already playing!');
            return;
        }
        if (result === null) {
            console.log('new player start');
            let redisHSETResult = {};
            try {
                redisHSETResult = yield redisClient.hmset('username:' + data.username, 'isPlaying', 'true', 'wins', 0, 'loses', 0, 'draws', 0);
            }
            catch (err) {
                console.log(err);
            }
            console.log('new player HSET result: ' + redisHSETResult);
        }
        else if (result === 'false') {
            console.log('already have account! start playing');
            let redisHSETResult = {};
            try {
                redisHSETResult = yield redisClient.hset('username:' + data.username, 'isPlaying', 'true');
            }
            catch (err) {
                console.log(err);
            }
            console.log('isPlaying HSET result: ' + redisHSETResult);
        }
        else {
            console.log('unwanted database result');
            return;
        }
        //Start game session
        const deckSet = new Set(fullDeck);
        const cardForDealer = drawACard(deckSet);
        const cardForPlayer1st = drawACard(deckSet);
        const cardForPlayer2nd = drawACard(deckSet);
        //TODO: check blackjack condition
        let redisHSETResult = {};
        try {
            redisHSETResult = yield redisClient.hmset('session:' + data.username, 'lastActionTime', Date.now(), 'dealer-hand', JSON.stringify(cardForDealer), 'player-hand', JSON.stringify([cardForPlayer1st, cardForPlayer2nd]));
        }
        catch (err) {
            console.log(err);
        }
        console.log('new player HSET result: ' + redisHSETResult);
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
    if (!isAcceptableUserName(data.username))
        return;
    console.log('cs_hit! ' + data.username);
};
const cs_stand = function (ws, data) {
    if (!isAcceptableUserName(data.username))
        return;
    console.log('cs_stand! ' + data.username);
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