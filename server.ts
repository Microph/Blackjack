import * as express from 'express';
import * as http from 'http';
import * as net from 'net';
import * as redis from 'redis';

import * as WebSocket from 'ws';
import { isNullOrUndefined } from 'util';
import {promisify} from 'util';

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const redisClient = redis.createClient(6379, "127.0.0.1");
const getAsync = promisify(redisClient.get).bind(redisClient);
const callbacks: {[key: string]: Array<Function>} = {};

redisClient.on('connect', function() {
    console.log('Redis client connected');
});

wss.on('connection', (ws: WebSocket) => {
    ws.isAlive = true;

    ws.on('pong', () => {
        ws.isAlive = true;
    });

    ws.on('message', (message: string) => {

        let jsonReqObj = JSON.parse(message);

        //console.log(`event: ${jsonReqObj.event}\ndata:\n${JSON.stringify(jsonReqObj.data)}\n`);
        processEvent(ws, jsonReqObj.event, jsonReqObj.data);
    });

    ws.send('BLACKJACK ONLINE');
});

const processEvent = function(ws: WebSocket, eventName: string, data: JSON){
    let registeredCallbacks = callbacks[eventName];
    if(isNullOrUndefined(registeredCallbacks)) 
        return;

    for(let i = 0; i < registeredCallbacks.length; i++){
        registeredCallbacks[i](ws, data);
    }
};

const isAcceptableUserName = function(name: string) : boolean{
    if(isNullOrUndefined(name))
        return false;
    
    //Name cannot be empty or have spaces
    if(name.replace(' ', '').length == 0 || name.split(' ').length > 1)
        return false;

    return true;
}

//APIs
const startGame = async function(ws: WebSocket, data: JSON){
    if(!isAcceptableUserName(data.username))
        return;

    console.log('start game! ' + data.username);
    redisClient.set("testkey", "haha", redis.print);
    const result = await getAsync('testkey');
    console.log('async get key: ' + result);
}

const hit = function(ws: WebSocket, data: JSON){
    if(!isAcceptableUserName(data.username))
        return;

    console.log('hit! ' + data.username);
}

const stand = function(ws: WebSocket, data: JSON){
    if(!isAcceptableUserName(data.username))
        return;

    console.log('stand! ' + data.username);
}

const leaderboard = function(ws: WebSocket, data: JSON){
    console.log('leaderboard!');
}

//Bindings
const bind = function(eventName: string, callback: Function){
    callbacks[eventName] = callbacks[eventName] || [];
    callbacks[eventName].push(callback);
};
bind('startGame', startGame);
bind('hit', hit);
bind('stand', stand);
bind('leaderboard', leaderboard);

setInterval(() => {
    wss.clients.forEach((ws: WebSocket) => {
        
        if (!ws.isAlive)
        {
            //TODO: if the client is playing game -> immediately lose
            return ws.terminate();
        } 
        
        ws.isAlive = false;
        ws.ping();
    });
}, 10000);

//start our server
server.listen(process.env.PORT || 8080, () => {
    const { port } = server.address() as net.AddressInfo;
    console.log('Server started on port ' + port);
});