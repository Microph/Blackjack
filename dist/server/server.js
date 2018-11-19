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
const getAsync = util_2.promisify(redisClient.get).bind(redisClient);
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
        redisClient.set("testkey", "haha", redis.print);
        const result = yield getAsync('testkey');
        console.log('async get key:' + result);
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
//start our server
server.listen(process.env.PORT || 8080, () => {
    const { port } = server.address();
    console.log('Server started on port ' + port);
});
//# sourceMappingURL=server.js.map