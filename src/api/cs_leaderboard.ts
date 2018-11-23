module.exports = async function(ws: WebSocket, data: JSON){
  //console.log('cs_leaderboard!');

  let usernames :Array<string> = [];
  try{ 
      usernames = await redisClient.keysAsync('username:*'); 
  }
  catch(err){
      //console.log(err);
  }   

  let leaderBoardDetail: Array<object> = [];
  try{ 
      await Promise.all(usernames.map(async (name) => {
          const userDetailFromDB = await redisClient.hmgetAsync(name, 'wins', 'draws', 'loses');
          leaderBoardDetail.push({
              "username": name.substring(9, name.length),
              "wins": userDetailFromDB[0],
              "draws": userDetailFromDB[1],
              "loses": userDetailFromDB[2],
          });
      }));
  }
  catch(err){
      //console.log('operation failed');
      return;
  }

  leaderBoardDetail.sort(function(a, b){return (2*b.wins + b.draws - b.loses) - (2*a.wins + a.draws - a.loses)});
  //Response
  const sc_leaderboard = {
      "event" : "sc_leaderboard",
      "data" : {
          "leaderboard" : leaderBoardDetail
      }
  };
  ws.send(JSON.stringify(sc_leaderboard));
}