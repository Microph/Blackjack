import * as express from 'express';
import * as http from 'http';
import * as net from 'net';
import * as redis from 'redis';

import * as WebSocket from 'ws';

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const redisClient = redis.createClient(6379, "127.0.0.1");

redisClient.on('connect', function() {
    console.log('Redis client connected');
});

wss.on('connection', (ws: WebSocket) => {
    ws.isAlive = true;

    ws.on('pong', () => {
        ws.isAlive = true;
    });

    //connection is up, let's add a simple simple event
    ws.on('message', (message: string) => {

        let jsonReqObj = JSON.parse(message);

        //log the received message
        console.log(`event: ${jsonReqObj.event}\ndata:\n${JSON.stringify(jsonReqObj.data)}\n`);
    });

    //send immediatly a feedback to the incoming connection    
    ws.send('Hi there, I am a WebSocket server');
});

setInterval(() => {
    wss.clients.forEach((ws: WebSocket) => {
        
        if (!ws.isAlive)
        {
            //TODO: if the client is playing game -> immediately lose
            return ws.terminate();
        } 
        
        ws.isAlive = false;
        ws.ping();
    });
}, 1000);

//start our server
server.listen(process.env.PORT || 8080, () => {
    const { port } = server.address() as net.AddressInfo;
    console.log(`Server started on port ${port}`);
});