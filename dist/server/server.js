"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const app = express();
//initialize a simple http server
const server = http.createServer(app);
//initialize the WebSocket server instance
const wss = new WebSocket.Server({ server });
wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => {
        ws.isAlive = true;
    });
    //connection is up, let's add a simple simple event
    ws.on('message', (message) => {
        let jsonReqObj = JSON.parse(message);
        //log the received message
        console.log(`event: ${jsonReqObj.event}\ndata:\n${JSON.stringify(jsonReqObj.data)}\n`);
    });
    //send immediatly a feedback to the incoming connection    
    ws.send('Hi there, I am a WebSocket server');
});
setInterval(() => {
    wss.clients.forEach((ws) => {
        if (!ws.isAlive)
            return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 10000);
//start our server
server.listen(process.env.PORT || 8080, () => {
    const { port } = server.address();
    console.log(`Server started on port ${port}`);
});
//# sourceMappingURL=server.js.map