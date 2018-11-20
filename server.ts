import * as express from 'express';
import * as http from 'http';
import * as net from 'net';
import * as redis from 'redis';

import * as WebSocket from 'ws';
import { isNullOrUndefined } from 'util';
import { promisify } from 'util';

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const redisClient = redis.createClient(6379, "127.0.0.1");
const setAsync = promisify(redisClient.set).bind(redisClient);
const hsetAsync = promisify(redisClient.hset).bind(redisClient);
const hmsetAsync = promisify(redisClient.hmset).bind(redisClient);
const getAsync = promisify(redisClient.get).bind(redisClient);
const hgetAsync = promisify(redisClient.hget).bind(redisClient);
const hincrbyAsync = promisify(redisClient.hincrby).bind(redisClient);
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

//Game data
const cardValue : Map<string, number> = new Map<string, number>([
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

const fullDeck : Set<string> = new Set<string>([
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
const drawACard = function(deckSet: Set<string>) : string{
    const deckArray = Array.from(deckSet);
    const drewCard = deckArray[Math.floor(Math.random() * deckArray.length)];
    deckSet.delete(drewCard);
    return drewCard;
}

const checkHandValue = function(hand: Array<string>) : number{
    console.log('hand: ' + hand.toString());
    let totalValue = 0;
    let aces = 0;
    hand.forEach(element => {
        const mappedValue = cardValue.get(element.toString());
        if(mappedValue == 11){
            aces++;
        }
        else if(typeof mappedValue === 'number'){
            totalValue += mappedValue;
        }
        else{
            console.log('error: bad card symbol');
        }
    });
    console.log('value not included aces: ' + totalValue + '\naces: ' + aces);

    for(let i=0; i<aces; i++){
        if(totalValue + 11 <= 21){
            totalValue += 11;
        }
        else{
            totalValue += 1;
        }
    }

    return totalValue;
}

const firstHandBlackjackPlayResult = function(ws: WebSocket, username: string, cardForPlayer1st: string, cardForPlayer2nd: string, cardForDealer: string) : number{
    //TODO: implement
    return 0;
}

//APIs
const cs_startGame = async function(ws: WebSocket, data: JSON){
    if(!isAcceptableUserName(data.username))
        return;

    console.log('start game! ' + data.username);
    let isUserPlaying = {};
    try{
        isUserPlaying = await hgetAsync('username:' + data.username, 'isPlaying');
    }
    catch(err){
        console.log(err);
    }
    console.log('isPlaying: ' + isUserPlaying);
    
    if(isUserPlaying === 'true'){
        console.log('already playing!');
        return;
    }

    if(isUserPlaying !== null && isUserPlaying !== 'false'){
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
    const initialHandValue = checkHandValue([cardForPlayer1st, cardForPlayer2nd]);
    if(initialHandValue == 21){
        hasBlackjack = true;
        const playResult = firstHandBlackjackPlayResult(ws, data.username, cardForPlayer1st, cardForPlayer2nd, cardForDealer);
        if(playResult === 1){ //win
            win = 1;
        }
        else{ //draw
            draw = 1;
        }
    }

    //Update player status in db
    if(isUserPlaying === null){
        console.log('new player start');
        let redisHSETResult = {};
        try{
            redisHSETResult = await hmsetAsync(
                'username:' + data.username, 
                'isPlaying', (!hasBlackjack).toString(), 
                'wins', win, 
                'loses', 0, 
                'draws', draw
            );
        }
        catch(err){
            console.log(err);
        }
        console.log('new player HSET result: ' + redisHSETResult);
    }
    else if(isUserPlaying === 'false'){
        console.log('already have account! start playing');
        let redisHSETResult = {};
        try{
            if(hasBlackjack){
                redisHSETResult = await hincrbyAsync(
                    'username:' + data.username, 
                    'wins', win
                );
            }
            else{
                redisHSETResult = await hsetAsync(
                    'username:' + data.username, 
                    'isPlaying', 'true'
                );
            }
        }
        catch(err){
            console.log(err);
        }
        console.log('isPlaying HSET result: ' + redisHSETResult);
    }

    //Create game session (if no blackjack)
    if(!hasBlackjack){
        let redisHSETResult = {};
        try{
            redisHSETResult = await hmsetAsync(
                'session:' + data.username, 
                'lastActionTime', Date.now(), 
                'dealer-hand', JSON.stringify(cardForDealer), 
                'player-hand', JSON.stringify([cardForPlayer1st, cardForPlayer2nd])
            );
        }
        catch(err){
            console.log(err);
        }
        console.log('new session HSET result: ' + redisHSETResult);    
    }
    
    //Response
    const sc_startGame = {
        "event" : "sc_startGame",
        "data" : {
            "dealer-hand" : [cardForDealer],
            "player-hand" : [cardForPlayer1st, cardForPlayer2nd]
        }
    };
    ws.send(JSON.stringify(sc_startGame));
}

const cs_hit = function(ws: WebSocket, data: JSON){
    if(!isAcceptableUserName(data.username))
        return;

    console.log('cs_hit! ' + data.username);
}

const cs_stand = function(ws: WebSocket, data: JSON){
    if(!isAcceptableUserName(data.username))
        return;

    console.log('cs_stand! ' + data.username);
}

const cs_leaderboard = function(ws: WebSocket, data: JSON){
    console.log('cs_leaderboard!');
}

//Bindings
const bind = function(eventName: string, callback: Function){
    callbacks[eventName] = callbacks[eventName] || [];
    callbacks[eventName].push(callback);
};

bind('cs_startGame', cs_startGame);
bind('cs_hit', cs_hit);
bind('cs_stand', cs_stand);
bind('cs_leaderboard', cs_leaderboard);

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

server.listen(process.env.PORT || 8080, () => {
    const { port } = server.address() as net.AddressInfo;
    console.log('Server started on port ' + port);
});