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
function cs_stand(ws, data, redisClient) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!blackjackUtil.isAcceptableUserName(data.username))
            return;
        //console.log('cs_stand! ' + data.username);
        let userHasSession = {};
        try {
            userHasSession = yield redisClient.existsAsync('session:' + data.username);
        }
        catch (err) {
            //console.log(err);
        }
        //console.log('userHasSession: ' + userHasSession);
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
        //Dealer start playing
        let playResult = blackjackUtil.startDealerPlayAndGetGameResult(playerHandArray, dealerHandArray);
        //Update player status in db
        let gameStatus = "";
        const redisMulti = redisClient.multi();
        if (playResult === 1) {
            gameStatus = "WIN";
            redisMulti.hincrby('username:' + data.username, 'wins', 1);
        }
        else if (playResult === 0) {
            gameStatus = "DRAW";
            redisMulti.hincrby('username:' + data.username, 'draws', 1);
        }
        else {
            gameStatus = "LOSE";
            redisMulti.hincrby('username:' + data.username, 'losses', 1);
        }
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
        //Response
        const sc_stand = {
            "event": "sc_stand",
            "data": {
                "dealerHand": dealerHandArray,
                "playerHand": playerHandArray,
                "gameStatus": gameStatus
            }
        };
        ws.send(JSON.stringify(sc_stand));
    });
}
exports.cs_stand = cs_stand;
//# sourceMappingURL=cs_stand.js.map