import { RedisClient } from "redis";
import * as blackjackUtil from './../blackjackUtil';

export async function cs_startGame (ws: WebSocket, data: JSON, redisClient: RedisClient){
  if(!blackjackUtil.isAcceptableUserName(data.username))
      return;

  //console.log('start game! ' + data.username);
  let redisResponses: Array<number> = [];
  try{
      redisResponses = await Promise.all([
          redisClient.existsAsync('username:' + data.username),
          redisClient.existsAsync('session:' + data.username)
      ]);
  }
  catch(err){
      //console.log(err);
  }
  const userHasAccount = redisResponses[0];
  const userHasSession = redisResponses[1];
  //console.log('Has account?: ' + userHasAccount);
  //console.log('Has session?: ' + userHasSession);
  
  if(userHasSession === 1){
      //console.log('already playing!');
      return;
  }

  //Start game session
  const deckSet = new Set(blackjackUtil.fullDeck);
  const cardForPlayer1st = blackjackUtil.drawACard(deckSet);
  const cardForPlayer2nd = blackjackUtil.drawACard(deckSet);
  const cardForDealer = blackjackUtil.drawACard(deckSet);
  const cardForDealerArray = new Array<string>(cardForDealer);

  //Check Blackjack condition
  let hasBlackjack = false;
  let win = 0;
  let draw = 0;
  let playResult = 0;
  let gameStatus = "PLAYING";
  const initialHandValue = blackjackUtil.checkHandValue([cardForPlayer1st, cardForPlayer2nd]);
  if(initialHandValue == 21){
      hasBlackjack = true;
      playResult = blackjackUtil.startDealerPlayAndGetGameResult([cardForPlayer1st, cardForPlayer2nd], cardForDealerArray);
      if(playResult === 1){
          win = 1;
          gameStatus = "WIN";
      }
      else if(playResult === 0){
          draw = 1;
          gameStatus = "DRAW";
      }
      else{
          //console.log("How can you lose when you get blackjack?? (shouldn't be here)");
          return;
      }
  }

  //Update player status in db
  const redisMulti = redisClient.multi();
  if(userHasAccount !== 1){
      //console.log('new player start!');
      redisMulti.hmset(
          'username:' + data.username,
          'wins', win, 
          'losses', 0, 
          'draws', draw
      ); 
  }
  else{
      //console.log('already have account! start playing');
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
      const timeoutIndex = setTimeout(blackjackUtil.loseByTimeout, blackjackUtil.TURN_TIME_LIMIT, data.username, ws);
      blackjackUtil.sessionTimeoutIndexMap.set(data.username, timeoutIndex);
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
          //console.log('transaction error');
          return;
      }
  }
  catch(err){
      //console.log(err);
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
};