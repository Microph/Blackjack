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
const blackjackUtil = require("./../blackjackUtil");
function cs_hit(ws, data, redisClient) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!blackjackUtil.isAcceptableUserName(data.username))
            return;
        //console.log('cs_hit! ' + data.username);
        //check if playing
        let userHasSession = {};
        try {
            userHasSession = yield redisClient.existsAsync('session:' + data.username);
        }
        catch (err) {
            //console.log(err);
        }
        if (userHasSession !== 1) {
            //console.log('user is not playing!');
            return;
        }
        clearTimeout(blackjackUtil.sessionTimeoutIndexMap.get(data.username));
        try {
            yield redisClient.watchAsync('session:' + data.username);
        }
        catch (err) {
            //console.log(err); 
        }
        //get current hand
        let dataFromSession = [];
        try {
            dataFromSession = yield Promise.all([
                redisClient.hgetAsync('session:' + data.username, 'dealerHand'),
                redisClient.hgetAsync('session:' + data.username, 'playerHand'),
                redisClient.hgetAsync('session:' + data.username, 'lastActionTime')
            ]);
        }
        catch (err) {
            //console.log(err);
        }
        //Check timeout
        const lastActionTimeString = dataFromSession[2];
        const lastActionTime = Number(lastActionTimeString);
        if (Date.now() - lastActionTime >= blackjackUtil.TURN_TIME_LIMIT) {
            blackjackUtil.loseByTimeout(data.username, ws, redisClient);
            return;
        }
        const dealerHand = dataFromSession[0];
        const dealerHandArray = JSON.parse(dealerHand);
        const playerHand = dataFromSession[1];
        const playerHandArray = JSON.parse(playerHand);
        //console.log(playerHandArray);
        //draw
        let gameStatus = "PLAYING";
        const deckSet = new Set(blackjackUtil.fullDeck);
        dealerHandArray.forEach(card => {
            deckSet.delete(card);
        });
        playerHandArray.forEach(card => {
            deckSet.delete(card);
        });
        playerHandArray.push(blackjackUtil.drawACard(deckSet));
        //Save to database
        try {
            const execResult = yield redisClient.multi()
                .hmset('session:' + data.username, 'playerHand', JSON.stringify(playerHandArray), 'lastActionTime', Date.now())
                .execAsync();
            if (execResult === null) {
                //console.log('transaction failed');
                return;
            }
        }
        catch (err) {
            //console.log(err);
        }
        //Check bust
        const playerHandValue = blackjackUtil.checkHandValue(playerHandArray);
        if (playerHandValue > 21) {
            gameStatus = "LOSE";
            const redisMulti = redisClient.multi();
            redisMulti.hincrby('username:' + data.username, 'losses', 1);
            redisMulti.del('session:' + data.username);
            try {
                const execResult = yield redisMulti.execAsync();
                if (execResult === null) {
                    //console.log('transaction error');
                    return;
                }
            }
            catch (err) {
                //console.log(err);
            }
        }
        else {
            const timeoutIndex = setTimeout(blackjackUtil.loseByTimeout, blackjackUtil.TURN_TIME_LIMIT, data.username, ws);
            blackjackUtil.sessionTimeoutIndexMap.set(data.username, timeoutIndex);
        }
        //Response
        const sc_hit = {
            "event": "sc_hit",
            "data": {
                "dealerHand": dealerHandArray,
                "dealerHandValue": blackjackUtil.checkHandValue(dealerHandArray),
                "playerHand": playerHandArray,
                "playerHandValue": playerHandValue,
                "gameStatus": gameStatus
            }
        };
        ws.send(JSON.stringify(sc_hit));
    });
}
exports.cs_hit = cs_hit;
//# sourceMappingURL=cs_hit.js.map