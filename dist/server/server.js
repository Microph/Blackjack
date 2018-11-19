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
//APIs
const startGame = function (ws, data) {
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
            let setResult = {};
            try {
                setResult = yield redisClient.hmset('username:' + data.username, 'isPlaying', 'true', 'wins', 0, 'loses', 0, 'draws', 0);
            }
            catch (err) {
                console.log(err);
            }
            console.log('set result: ' + setResult);
        }
        else if (result === 'false') {
            console.log('already have account! start playing');
            let setResult = {};
            try {
                setResult = yield redisClient.hset('username:' + data.username, 'isPlaying', 'true');
            }
            catch (err) {
                console.log(err);
            }
            console.log('set result: ' + setResult);
        }
        else {
            console.log('unwanted database result');
            return;
        }
        //Start game session
        const output = {
            "event": "startGame",
            "data": {
                "dealer-hand": ["2D"],
                "player-hand": ["10H", "2C"]
            }
        };
        ws.send(JSON.stringify(output));
    });
};
const hit = function (ws, data) {
    if (!isAcceptableUserName(data.username))
        return;
    console.log('hit! ' + data.username);
};
const stand = function (ws, data) {
    if (!isAcceptableUserName(data.username))
        return;
    console.log('stand! ' + data.username);
};
const leaderboard = function (ws, data) {
    console.log('leaderboard!');
};
//Bindings
const bind = function (eventName, callback) {
    callbacks[eventName] = callbacks[eventName] || [];
    callbacks[eventName].push(callback);
};
bind('startGame', startGame);
bind('hit', hit);
bind('stand', stand);
bind('leaderboard', leaderboard);
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