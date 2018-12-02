import * as express from 'express';
import * as http from 'http';
import * as net from 'net';
import * as redis from 'redis';
import * as bluebird from 'bluebird';
bluebird.promisifyAll(redis);

import * as WebSocket from 'ws';
import { isNullOrUndefined } from 'util';
import path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const callbacks: {[key: string]: Array<Function>} = {};
const redisClient = process.env.REDIS_URL? redis.createClient(process.env.REDIS_URL)
                                            : redis.createClient(6379, '127.0.0.1');

//Middlewares
app.use(express.static(path.join(__dirname, '../../public/')));

redisClient.on('connect', function() {
    //console.log('Redis client connected');
});

wss.on('connection', (ws: WebSocket) => {
    ws.isAlive = true;

    ws.on('pong', () => {
        ws.isAlive = true;
    });

    ws.on('message', (message: string) => {
        //console.log('receieve: ' + message);
        let jsonReqObj = {}
        try{
            jsonReqObj = JSON.parse(message);
        }
        catch(err){
            //console.log('bad client message' + err);
            return;
        }
        processEvent(ws, jsonReqObj.event, jsonReqObj.data);
    });

    ws.send('Enter your name and play!');
});

const processEvent = function(ws: WebSocket, eventName: string, data: JSON){
    let registeredCallbacks = callbacks[eventName];
    if(isNullOrUndefined(registeredCallbacks)) 
        return;

    for(let i = 0; i < registeredCallbacks.length; i++){
        registeredCallbacks[i](ws, data, redisClient);
    }
};

//Bindings
const bind = function(eventName: string, callback: Function){
    callbacks[eventName] = callbacks[eventName] || [];
    callbacks[eventName].push(callback);
};

//APIs
import startGameAPI = require('./apis/cs_startGame');
import hitAPI = require('./apis/cs_hit');
import standAPI = require('./apis/cs_stand');
import leaderboardAPI = require('./apis/cs_leaderboard');

bind('cs_startGame', startGameAPI.cs_startGame);
bind('cs_hit', hitAPI.cs_hit);
bind('cs_stand', standAPI.cs_stand);
bind('cs_leaderboard', leaderboardAPI.cs_leaderboard);

setInterval(() => {
    wss.clients.forEach((ws: WebSocket) => {
        
        if (!ws.isAlive)
        {
            return ws.terminate();
        } 
        
        ws.isAlive = false;
        ws.ping();
    });
}, 10000);

server.listen(process.env.PORT || 8080, () => {
    const { port } = server.address() as net.AddressInfo;
    //console.log('Server started on port ' + port);
});

//Routes
require('./routes')(app);
