require('dotenv').config();
const { io } = require('socket.io-client');
const jwt = require('jsonwebtoken');

const NUM_CLIENTS = 100;
const TEST_DURATION_MS = 10000;
const SERVER_URL = 'http://localhost:3000';

let messagesSent = 0;
let messagesReceived = 0;
let connectedCount = 0;
let connectFailures = 0;

function makeToken(userId, username) {
    return jwt.sign({ userId, username }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

async function runClient(clientIndex) {
    const userId = (clientIndex % 30) + 1;
    const partnerId = ((clientIndex + 1) % 30) + 1;
    const token = makeToken(userId, `loadtestuser${userId}`);

    return new Promise((resolve) => {
        const socket = io(SERVER_URL, { auth: { token } });

        socket.on('connect', () => {
            connectedCount++;
            socket.emit('joinRoom', partnerId);

            const sendInterval = setInterval(() => {
                socket.emit('sendMessage', { receiverId: partnerId, content: 'load test message' });
                messagesSent++;
            }, 200);

            socket.on('newMessage', () => {
                messagesReceived++;
            });

            setTimeout(() => {
                clearInterval(sendInterval);
                socket.disconnect();
                resolve();
            }, TEST_DURATION_MS);
        });

        socket.on('connect_error', (err) => {
            connectFailures++;
            resolve();
        });
    });
}

async function runLoadTest() {
    console.log(`Spinning up ${NUM_CLIENTS} simulated clients...`);
    const start = Date.now();

    const clientPromises = [];
    for (let i = 0; i < NUM_CLIENTS; i++) {
        clientPromises.push(runClient(i));
    }

    await Promise.all(clientPromises);

    const durationSec = (Date.now() - start) / 1000;

    console.log('--- Load Test Results ---');
    console.log(`Clients attempted: ${NUM_CLIENTS}`);
    console.log(`Successfully connected: ${connectedCount}`);
    console.log(`Connection failures: ${connectFailures}`);
    console.log(`Total messages sent: ${messagesSent}`);
    console.log(`Total messages received (broadcasts): ${messagesReceived}`);
    console.log(`Test duration: ${durationSec.toFixed(1)}s`);
    console.log(`Messages/sec (sent): ${(messagesSent / durationSec).toFixed(1)}`);

    process.exit(0);
}

runLoadTest();