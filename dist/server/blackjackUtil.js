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
const util_1 = require("util");
//Game data
exports.TURN_TIME_LIMIT = 10000;
exports.sessionTimeoutIndexMap = new Map();
exports.cardValue = new Map([
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
exports.fullDeck = new Set([
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
//General utility
exports.isAcceptableUserName = function (name) {
    if (util_1.isNullOrUndefined(name))
        return false;
    //Name cannot be empty or have spaces
    if (name.replace(' ', '').length == 0 || name.split(' ').length > 1)
        return false;
    return true;
};
//Game utility
exports.drawACard = function (deckSet) {
    const deckArray = Array.from(deckSet);
    const drewCard = deckArray[Math.floor(Math.random() * deckArray.length)];
    deckSet.delete(drewCard);
    return drewCard;
};
exports.checkHandValue = function (hand) {
    //console.log('\nhand: ' + hand.toString());
    let totalValue = 0;
    let aces = 0;
    hand.forEach(element => {
        const mappedValue = exports.cardValue.get(element.toString());
        if (mappedValue == 11) {
            aces++;
        }
        else if (typeof mappedValue === 'number') {
            totalValue += mappedValue;
        }
        else {
            //console.log('error: bad card symbol');
        }
    });
    //console.log('value not included aces: ' + totalValue + '\naces: ' + aces + '\n');
    for (let i = 0; i < aces; i++) {
        if (totalValue + 11 <= 21) {
            totalValue += 11;
        }
        else {
            totalValue += 1;
        }
    }
    return totalValue;
};
exports.startDealerPlayAndGetGameResult = function (playerHand, dealerHand) {
    const deckSet = new Set(exports.fullDeck);
    deckSet.delete(dealerHand[0]);
    playerHand.forEach(card => {
        deckSet.delete(card);
    });
    let dealerScore = 0;
    while (true) {
        dealerScore = exports.checkHandValue(dealerHand);
        if (dealerScore >= 17) {
            break;
        }
        dealerHand.push(exports.drawACard(deckSet));
    }
    const playerScore = exports.checkHandValue(playerHand);
    if (playerScore <= 21 && (dealerScore > 21 || playerScore > dealerScore)) {
        //console.log('player WIN');
        return 1;
    }
    else if (playerScore == dealerScore) {
        //console.log('the match is DRAW');
        return 0;
    }
    else {
        //console.log('player LOSE');
        return -1;
    }
};
exports.loseByTimeout = function (username, ws, redisClient) {
    return __awaiter(this, void 0, void 0, function* () {
        //console.log('\n---timeout!---');
        const redisMulti = redisClient.multi();
        redisMulti.hincrby('username:' + username, 'losses', 1);
        redisMulti.del('session:' + username);
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
        const sc_loseByTimeout = {
            "event": "sc_loseByTimeout",
            "data": {
                "gameStatus": "LOSE"
            }
        };
        ws.send(JSON.stringify(sc_loseByTimeout));
    });
};
//# sourceMappingURL=blackjackUtil.js.map