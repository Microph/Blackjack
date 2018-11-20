import * as express from 'express';
import * as http from 'http';
import * as net from 'net';
import * as redis from 'redis';
import * as bluebird from 'bluebird';
bluebird.promisifyAll(redis);

import * as WebSocket from 'ws';
import { isNullOrUndefined } from 'util';

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const callbacks: {[key: string]: Array<Function>} = {};
const redisClient = redis.createClient(6379, "127.0.0.1");

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
    console.log('\nhand: ' + hand.toString());
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
    console.log('value not included aces: ' + totalValue + '\naces: ' + aces + '\n');

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

const startDealerPlayAndGetGameResult = function(playerHand: Array<string>, dealer1stCard: string) : number{
    const deckSet = new Set(fullDeck);
    deckSet.delete(dealer1stCard);
    playerHand.forEach(card => {
        deckSet.delete(card);
    });
    
    const dealerHand = new Array<string>();
    dealerHand.push(dealer1stCard);
    let dealerScore = 0;
    while(true){
        dealerScore = checkHandValue(dealerHand);
        if(dealerScore >= 17){
            break;
        }
        dealerHand.push(drawACard(deckSet));
    }

    const playerScore = checkHandValue(playerHand);
    if (playerScore > dealerScore){
        console.log('player WIN');
        return 1;
    }
    else if(playerScore == dealerScore){
        console.log('the match is DRAW');
        return 0;
    }
    else{
        console.log('player LOSE');
        return -1;
    }
}

//APIs
const cs_startGame = async function(ws: WebSocket, data: JSON){
    if(!isAcceptableUserName(data.username))
        return;

    console.log('start game! ' + data.username);
    let isUserPlaying = {};
    try{
        isUserPlaying = await redisClient.hgetAsync('username:' + data.username, 'isPlaying');
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
    const asyncTasks = [];
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
    if(initialHandValue == 21){
        hasBlackjack = true;
        playResult = startDealerPlayAndGetGameResult([cardForPlayer1st, cardForPlayer2nd], cardForDealer);
        if(playResult === 1){
            win = 1;
        }
        else{
            draw = 1;
        }
    }

    //Update player status in db
    if(isUserPlaying === null){
        console.log('new player start');
        asyncTasks.push( redisClient.hmsetAsync(
            'username:' + data.username, 
            'isPlaying', (!hasBlackjack).toString(), 
            'wins', win, 
            'loses', 0, 
            'draws', draw
        )); 
    }
    else if(isUserPlaying === 'false'){
        console.log('already have account! start playing');
        if(hasBlackjack){
            if(playResult === 1){
                asyncTasks.push( redisClient.hincrbyAsync(
                    'username:' + data.username, 
                    'wins', 1,
                ));
            }
            else{
                asyncTasks.push( redisClient.hincrbyAsync(
                    'username:' + data.username, 
                    'draw', 1,
                ));
            }
        }
        else{
            asyncTasks.push( redisClient.hsetAsync(
                'username:' + data.username, 
                'isPlaying', 'true'
            ));
        }
    }

    //Create game session (if no blackjack)
    if(!hasBlackjack){
        asyncTasks.push( redisClient.hmsetAsync(
            'session:' + data.username, 
            'lastActionTime', Date.now(), 
            'dealer-hand', JSON.stringify([cardForDealer]), 
            'player-hand', JSON.stringify([cardForPlayer1st, cardForPlayer2nd])
        ));
    }

    try{
         await Promise.all(asyncTasks);
    }
    catch(err){
        console.log(err);
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

const cs_hit = async function(ws: WebSocket, data: JSON){
    if(!isAcceptableUserName(data.username))
        return;

    console.log('cs_hit! ' + data.username);
    //check if playing
    let isUserPlaying = {};
    try{
        isUserPlaying = await redisClient.hgetAsync('username:' + data.username, 'isPlaying');
    }
    catch(err){
        console.log(err);
    }
    console.log('isPlaying: ' + isUserPlaying);
    
    if(isUserPlaying !== 'true'){
        console.log('user is not playing!');
        return;
    }

    try{ await redisClient.watchAsync('session:' + data.username); }
    catch(err){ console.log(err); }

    //get current hand
    let cardsDataFromSession: Array<string> = [];
    try{
        cardsDataFromSession = await Promise.all([
            redisClient.hgetAsync('session:' + data.username, 'dealer-hand'),
            redisClient.hgetAsync('session:' + data.username, 'player-hand'),
        ]); 
    }
    catch(err){
        console.log(err);
    }
    const dealerHand = cardsDataFromSession[0];
    const dealerHandArray: Array<string> = JSON.parse(dealerHand);
    const playerHand = cardsDataFromSession[1];
    const playerHandArray: Array<string> = JSON.parse(playerHand);
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
    let result = {};
    try{
        result = await redisClient.multi().hset('session:' + data.username, 'player-hand', JSON.stringify(playerHandArray)).execAsync();
    }
    catch(err){
        console.log(err);
    }

    console.log('result' + result);
    if(result === null){
        console.log('Hit transaction failed');
        return;
    }

    //Check bust
    const playerHandValue = checkHandValue(playerHandArray);
    if(playerHandValue > 21){
        //TODO: implement
    }

    //Response
    const sc_hit = {
        "event" : "sc_hit",
        "data" : {
            "dealer-hand" : dealerHandArray,
            "player-hand" : playerHandArray
        }
    };
    ws.send(JSON.stringify(sc_hit));
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