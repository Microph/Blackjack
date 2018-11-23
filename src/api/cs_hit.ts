module.exports = async function(ws: WebSocket, data: JSON){
  if(!isAcceptableUserName(data.username))
      return;

  //console.log('cs_hit! ' + data.username);
  //check if playing
  let userHasSession = {};
  try{
      userHasSession = await redisClient.existsAsync('session:' + data.username);
  }
  catch(err){
      //console.log(err);
  }
  
  if(userHasSession !== 1){
      //console.log('user is not playing!');
      return;
  }

  clearTimeout(sessionTimeoutIndexMap.get(data.username));
  try{ await redisClient.watchAsync('session:' + data.username); }
  catch(err){ 
      //console.log(err); 
  }

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
      //console.log(err);
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
  //console.log(playerHandArray);

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
              //console.log('transaction failed');
              return;
          }
  }
  catch(err){
      //console.log(err);
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
              //console.log('transaction error');
              return;
          }
      }
      catch(err){
          //console.log(err);
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