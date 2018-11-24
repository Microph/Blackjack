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
function cs_leaderboard(ws, data, redisClient) {
    return __awaiter(this, void 0, void 0, function* () {
        //console.log('cs_leaderboard!');
        let usernames = [];
        try {
            usernames = yield redisClient.keysAsync('username:*');
        }
        catch (err) {
            //console.log(err);
        }
        let leaderBoardDetail = [];
        try {
            yield Promise.all(usernames.map((name) => __awaiter(this, void 0, void 0, function* () {
                const userDetailFromDB = yield redisClient.hmgetAsync(name, 'wins', 'draws', 'losses');
                leaderBoardDetail.push({
                    "username": name.substring(9, name.length),
                    "wins": userDetailFromDB[0],
                    "draws": userDetailFromDB[1],
                    "losses": userDetailFromDB[2],
                });
            })));
        }
        catch (err) {
            //console.log('operation failed');
            return;
        }
        leaderBoardDetail.sort(function (a, b) { return (2 * b.wins + b.draws - b.losses) - (2 * a.wins + a.draws - a.losses); });
        //Response
        const sc_leaderboard = {
            "event": "sc_leaderboard",
            "data": {
                "leaderboard": leaderBoardDetail
            }
        };
        ws.send(JSON.stringify(sc_leaderboard));
    });
}
exports.cs_leaderboard = cs_leaderboard;
//# sourceMappingURL=cs_leaderboard.js.map