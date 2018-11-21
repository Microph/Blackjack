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
const redisClient = redis.createClient(process.env.REDIS_URL);

redisClient.on('connect', function() {
    console.log('Redis client connected');
});

wss.on('connection', (ws: WebSocket) => {
    ws.isAlive = true;

    ws.on('pong', () => {
        ws.isAlive = true;
    });

    ws.on('message', (message: string) => {
        console.log('receieve: ' + message);
        let jsonReqObj = {}
        try{
            jsonReqObj = JSON.parse(message);
        }
        catch(err){
            console.log('bad client message' + err);
            return;
        }
        processEvent(ws, jsonReqObj.event, jsonReqObj.data);
    });

    ws.send('Enter your name and press start!');
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
const TURN_TIME_LIMIT : number = 10000;
const sessionTimeoutIndexMap: Map<string, number> = new Map<string, number>();
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

const startDealerPlayAndGetGameResult = function(playerHand: Array<string>, dealerHand: Array<string>) : number{
    const deckSet = new Set(fullDeck);
    deckSet.delete(dealerHand[0]);
    playerHand.forEach(card => {
        deckSet.delete(card);
    });
    
    let dealerScore = 0;
    while(true){
        dealerScore = checkHandValue(dealerHand);
        if(dealerScore >= 17){
            break;
        }
        dealerHand.push(drawACard(deckSet));
    }

    const playerScore = checkHandValue(playerHand);
    if (playerScore <= 21 && (dealerScore > 21 || playerScore > dealerScore) ){
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

const loseByTimeout = async function(username: string, ws: WebSocket){
    console.log('\n---timeout!---');
    const redisMulti = redisClient.multi();
    redisMulti.hincrby(
        'username:' + username, 
        'loses', 1,
    );

    redisMulti.del(
        'session:' + username
    );

    try{
        const execResult = await redisMulti.execAsync();
        if(execResult === null){
            console.log('transaction error');
            return;
        }
    }
    catch(err){
        console.log(err);
    }

    //Response
    const sc_loseByTimeout = {
        "event" : "sc_loseByTimeout",
        "data" : {
            "gameStatus" : "LOSE"
        }
    };
    ws.send(JSON.stringify(sc_loseByTimeout));
}

//APIs
const cs_startGame = async function(ws: WebSocket, data: JSON){
    if(!isAcceptableUserName(data.username))
        return;

    console.log('start game! ' + data.username);
    let redisResponses: Array<number> = [];
    try{
        redisResponses = await Promise.all([
            redisClient.existsAsync('username:' + data.username),
            redisClient.existsAsync('session:' + data.username)
        ]);
    }
    catch(err){
        console.log(err);
    }
    const userHasAccount = redisResponses[0];
    const userHasSession = redisResponses[1];
    console.log('Has account?: ' + userHasAccount);
    console.log('Has session?: ' + userHasSession);
    
    if(userHasSession === 1){
        console.log('already playing!');
        return;
    }

    //Start game session
    const deckSet = new Set(fullDeck);
    const cardForPlayer1st = drawACard(deckSet);
    const cardForPlayer2nd = drawACard(deckSet);
    const cardForDealer = drawACard(deckSet);
    const cardForDealerArray = new Array<string>(cardForDealer);

    //Check Blackjack condition
    let hasBlackjack = false;
    let win = 0;
    let draw = 0;
    let playResult = 0;
    let gameStatus = "PLAYING";
    const initialHandValue = checkHandValue([cardForPlayer1st, cardForPlayer2nd]);
    if(initialHandValue == 21){
        hasBlackjack = true;
        playResult = startDealerPlayAndGetGameResult([cardForPlayer1st, cardForPlayer2nd], cardForDealerArray);
        if(playResult === 1){
            win = 1;
            gameStatus = "WIN";
        }
        else if(playResult === 0){
            draw = 1;
            gameStatus = "DRAW";
        }
        else{
            console.log("How can you lose when you get blackjack?? (shouldn't be here)");
            return;
        }
    }

    //Update player status in db
    const redisMulti = redisClient.multi();
    if(userHasAccount !== 1){
        console.log('new player start!');
        redisMulti.hmset(
            'username:' + data.username,
            'wins', win, 
            'loses', 0, 
            'draws', draw
        ); 
    }
    else{
        console.log('already have account! start playing');
        if(hasBlackjack){
            if(playResult === 1){
                redisMulti.hincrby(
                    'username:' + data.username, 
                    'wins', 1,
                );
            }
            else{
                redisMulti.hincrby(
                    'username:' + data.username, 
                    'draws', 1,
                );
            }
        }
    }

    //Create game session (if no blackjack)
    if(!hasBlackjack){
        const timeoutIndex = await setTimeout(loseByTimeout, TURN_TIME_LIMIT, data.username, ws);
        sessionTimeoutIndexMap.set(data.username, timeoutIndex);
        redisMulti.hmset(
            'session:' + data.username, 
            'lastActionTime', Date.now(), 
            'dealerHand', JSON.stringify(cardForDealerArray), 
            'playerHand', JSON.stringify([cardForPlayer1st, cardForPlayer2nd])
        );
    }

    try{
         const execResult = await redisMulti.execAsync();
         if(execResult === null){
            console.log('transaction error');
            return;
        }
    }
    catch(err){
        console.log(err);
    }
    
    //Response
    const sc_startGame = {
        "event" : "sc_startGame",
        "data" : {
            "dealerHand" : cardForDealerArray,
            "playerHand" : [cardForPlayer1st, cardForPlayer2nd],
            "gameStatus" : gameStatus
        }
    };
    ws.send(JSON.stringify(sc_startGame));
}

const cs_hit = async function(ws: WebSocket, data: JSON){
    if(!isAcceptableUserName(data.username))
        return;

    console.log('cs_hit! ' + data.username);
    //check if playing
    let userHasSession = {};
    try{
        userHasSession = await redisClient.existsAsync('session:' + data.username);
    }
    catch(err){
        console.log(err);
    }
    
    if(userHasSession !== 1){
        console.log('user is not playing!');
        return;
    }

    clearTimeout(sessionTimeoutIndexMap.get(data.username));
    try{ await redisClient.watchAsync('session:' + data.username); }
    catch(err){ console.log(err); }

    //get current hand
    let dataFromSession: Array<string> = [];
    try{
        dataFromSession = await Promise.all([
            redisClient.hgetAsync('session:' + data.username, 'dealerHand'),
            redisClient.hgetAsync('session:' + data.username, 'playerHand'),
            redisClient.hgetAsync('session:' + data.username, 'lastActionTime')
        ]); 
    }
    catch(err){
        console.log(err);
    }

    //Check timeout
    const lastActionTimeString = dataFromSession[2];
    const lastActionTime = Number(lastActionTimeString);
    if(Date.now() - lastActionTime >= TURN_TIME_LIMIT){
        loseByTimeout(data.username, ws);
        return;
    }

    const dealerHand = dataFromSession[0];
    const dealerHandArray: Array<string> = JSON.parse(dealerHand);
    const playerHand = dataFromSession[1];
    const playerHandArray: Array<string> = JSON.parse(playerHand);
    console.log(playerHandArray);

    //draw
    let gameStatus = "PLAYING";
    const deckSet = new Set(fullDeck);
    dealerHandArray.forEach(card => {
        deckSet.delete(card);
    });
    playerHandArray.forEach(card => {
        deckSet.delete(card);
    });
    playerHandArray.push(drawACard(deckSet));

    //Save to database
    try{
        const execResult = await redisClient.multi()
            .hmset('session:' + data.username, 
                'playerHand', JSON.stringify(playerHandArray),
                'lastActionTime', Date.now()
                )
            .execAsync();
            if(execResult === null){
                console.log('transaction failed');
                return;
            }
    }
    catch(err){
        console.log(err);
    }

    //Check bust
    const playerHandValue = checkHandValue(playerHandArray);
    if(playerHandValue > 21){
        gameStatus = "LOSE";
        const redisMulti = redisClient.multi();
        redisMulti.hincrby(
            'username:' + data.username, 
            'loses', 1,
        );
        redisMulti.del(
            'session:' + data.username
        );

        try{
            const execResult = await redisMulti.execAsync();
            if(execResult === null){
                console.log('transaction error');
                return;
            }
        }
        catch(err){
            console.log(err);
        }
    }
    else{
        const timeoutIndex = setTimeout(loseByTimeout, TURN_TIME_LIMIT, data.username, ws);
        sessionTimeoutIndexMap.set(data.username, timeoutIndex);
    }
    
    //Response
    const sc_hit = {
        "event" : "sc_hit",
        "data" : {
            "dealerHand" : dealerHandArray,
            "playerHand" : playerHandArray,
            "gameStatus" : gameStatus
        }
    };
    ws.send(JSON.stringify(sc_hit));
}

const cs_stand = async function(ws: WebSocket, data: JSON){
    if(!isAcceptableUserName(data.username))
        return;

    console.log('cs_stand! ' + data.username);

    let userHasSession = {};
    try{
        userHasSession = await redisClient.existsAsync('session:' + data.username);
    }
    catch(err){
        console.log(err);
    }
    console.log('userHasSession: ' + userHasSession);
    if(userHasSession !== 1){
        console.log('user is not playing!');
        return;
    }
    
    clearTimeout(sessionTimeoutIndexMap.get(data.username));
    try{ await redisClient.watchAsync('session:' + data.username); }
    catch(err){ console.log(err); }

    //get current hand
    let dataFromSession: Array<string> = [];
    try{
        dataFromSession = await Promise.all([
            redisClient.hgetAsync('session:' + data.username, 'dealerHand'),
            redisClient.hgetAsync('session:' + data.username, 'playerHand'),
            redisClient.hgetAsync('session:' + data.username, 'lastActionTime')
        ]); 
    }
    catch(err){
        console.log(err);
    }

    //Check timeout
    const lastActionTimeString = dataFromSession[2];
    const lastActionTime = Number(lastActionTimeString);
    if(Date.now() - lastActionTime >= TURN_TIME_LIMIT){
        loseByTimeout(data.username, ws);
        return;
    }

    const dealerHand = dataFromSession[0];
    const dealerHandArray: Array<string> = JSON.parse(dealerHand);
    const playerHand = dataFromSession[1];
    const playerHandArray: Array<string> = JSON.parse(playerHand);
    console.log(playerHandArray);

    //Dealer start playing
    let playResult = startDealerPlayAndGetGameResult(playerHandArray, dealerHandArray);

    //Update player status in db
    let gameStatus = "";
    const redisMulti = redisClient.multi();
    if(playResult === 1){
        gameStatus = "WIN";
        redisMulti.hincrby(
            'username:' + data.username, 
            'wins', 1,
        );
    }
    else if(playResult === 0){
        gameStatus = "DRAW";
        redisMulti.hincrby(
            'username:' + data.username, 
            'draws', 1,
        );
    }
    else{
        gameStatus = "LOSE";
        redisMulti.hincrby(
            'username:' + data.username, 
            'loses', 1,
        );
    }

    redisMulti.del(
        'session:' + data.username
    );

    try{
        const execResult = await redisMulti.execAsync();
        if(execResult === null){
            console.log('transaction error');
            return;
        }
    }
    catch(err){
        console.log(err);
    }

    //Response
    const sc_stand = {
        "event" : "sc_stand",
        "data" : {
            "dealerHand" : dealerHandArray,
            "playerHand" : playerHandArray,
            "gameStatus" : gameStatus
        }
    };
    ws.send(JSON.stringify(sc_stand));
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

require('./routes')(app);