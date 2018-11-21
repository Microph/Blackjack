# Blackjack

Playable at: https://blackjack-by-microph.herokuapp.com/

APIs
Since I use websocket protocol for this project, I create a custom data format for server and client that looks like this
{
  "event" : String,
  "data" : {...}
}

- Start Game
  Client  -> Server
  {
    "event" : "cs_startGame",
    "data" : {
      "username" : String
    }
  }

  Server -> Client
  {
    "event" : "sc_startGame",
    "data" : {
      "dealerHand" : Array<string>,
      "playerHand" : Array<string>,
      "gameStatus" : String
    }
  }
  
- Hit
  Client  -> Server
  {
    "event" : "cs_hit",
    "data" : {
      "username" : String
    }
  }

  Server -> Client
  {
    "event" : "sc_hit",
      "data" : {
        "dealerHand" : Array<string>,
        "playerHand" : Array<string>,
        "gameStatus" : String
      }
  }
  
- Stand
    Client  -> Server
    {
      "event" : "cs_stand",
      "data" : {
        "username" : String
      }
    }

    Server -> Client
    {
      "event" : "sc_stand",
        "data" : {
          "dealerHand" : Array<string>,
          "playerHand" : Array<string>,
          "gameStatus" : String
        }
    }
 
- Leaderboard
    Client  -> Server
    {
      "event" : "cs_leaderboard",
      "data" : {
      }
    }

    Server -> Client
    {
      "event" : "sc_leaderboard",
      "data" : {
        "leaderboard" : Array<JSON>
      }
    }
  
- Lose By Timeout
    Server -> Client
    {
      "event" : "sc_loseByTimeout",
      "data" : {
          "gameStatus" : "LOSE"
      }
    }
