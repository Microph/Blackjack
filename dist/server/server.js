"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express = require("express");
const http = require("http");
const redis = require("redis");
const bluebird = require("bluebird");
bluebird.promisifyAll(redis);
const WebSocket = require("ws");
const util_1 = require("util");
const path = require("path");
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const callbacks = {};
const redisClient = process.env.REDIS_URL ? redis.createClient(process.env.REDIS_URL)
    : redis.createClient(6379, '127.0.0.1');
//Middlewares
app.use(express.static(path.join(__dirname, '../../public/')));
redisClient.on('connect', function () {
    //console.log('Redis client connected');
});
wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => {
        ws.isAlive = true;
    });
    ws.on('message', (message) => {
        //console.log('receieve: ' + message);
        let jsonReqObj = {};
        try {
            jsonReqObj = JSON.parse(message);
        }
        catch (err) {
            //console.log('bad client message' + err);
            return;
        }
        processEvent(ws, jsonReqObj.event, jsonReqObj.data);
    });
    ws.send('Enter your name and play!');
});
const processEvent = function (ws, eventName, data) {
    let registeredCallbacks = callbacks[eventName];
    if (util_1.isNullOrUndefined(registeredCallbacks))
        return;
    for (let i = 0; i < registeredCallbacks.length; i++) {
        registeredCallbacks[i](ws, data, redisClient);
    }
};
//Bindings
const bind = function (eventName, callback) {
    callbacks[eventName] = callbacks[eventName] || [];
    callbacks[eventName].push(callback);
};
//APIs
const startGameAPI = require("./apis/cs_startGame");
const hitAPI = require("./apis/cs_hit");
const standAPI = require("./apis/cs_stand");
const leaderboardAPI = require("./apis/cs_leaderboard");
bind('cs_startGame', startGameAPI.cs_startGame);
bind('cs_hit', hitAPI.cs_hit);
bind('cs_stand', standAPI.cs_stand);
bind('cs_leaderboard', leaderboardAPI.cs_leaderboard);
setInterval(() => {
    wss.clients.forEach((ws) => {
        if (!ws.isAlive) {
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 10000);
server.listen(process.env.PORT || 8080, () => {
    const { port } = server.address();
    //console.log('Server started on port ' + port);
});
//Routes
require('./routes')(app);
//# sourceMappingURL=server.js.map