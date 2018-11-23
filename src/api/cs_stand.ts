module.exports = async function(ws: WebSocket, data: JSON){
  if(!isAcceptableUserName(data.username))
      return;

  //console.log('cs_stand! ' + data.username);

  let userHasSession = {};
  try{
      userHasSession = await redisClient.existsAsync('session:' + data.username);
  }
  catch(err){
      //console.log(err);
  }
  //console.log('userHasSession: ' + userHasSession);
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
          //console.log('transaction error');
          return;
      }
  }
  catch(err){
      //console.log(err);
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