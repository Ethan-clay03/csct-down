#!/usr/bin/env node

// TCP connection test server - equivalent to PowerShell Test-NetConnection
// Returns TCP connectivity status as JSON
// Run with: node test-connection.js

const net = require('net');
const http = require('http');

const TARGET_HOST = 'csctcloud.uwe.ac.uk';
const TARGET_PORT = 22;
const SERVER_PORT = 8080;

function testNetConnection() {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const socket = new net.Socket();
    
    socket.setTimeout(5000);
    
    socket.on('connect', () => {
      const latency = Date.now() - startTime;
      socket.destroy();
      resolve({
        success: true,
        latency,
        host: TARGET_HOST,
        port: TARGET_PORT,
        message: 'TcpTestSucceeded'
      });
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      const latency = Date.now() - startTime;
      resolve({
        success: false,
        latency,
        host: TARGET_HOST,
        port: TARGET_PORT,
        message: 'Connection timeout'
      });
    });
    
    socket.on('error', (error) => {
      const latency = Date.now() - startTime;
      resolve({
        success: false,
        latency,
        host: TARGET_HOST,
        port: TARGET_PORT,
        message: error.message
      });
    });
    
    socket.connect(TARGET_PORT, TARGET_HOST);
  });
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  if (req.url === '/test' && req.method === 'GET') {
    try {
      const result = await testNetConnection();
      res.writeHead(200);
      res.end(JSON.stringify(result));
      console.log(`[${new Date().toISOString()}] Test-NetConnection result: ${result.success ? 'SUCCESS' : 'FAILED'} - Latency: ${result.latency}ms`);
    } catch (error) {
      res.writeHead(500);
      res.end(JSON.stringify({ success: false, message: error.message }));
    }
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(SERVER_PORT, () => {
  console.log(`Test-NetConnection server running on http://localhost:${SERVER_PORT}`);
  console.log(`Testing connectivity to ${TARGET_HOST}:${TARGET_PORT}`);
  console.log(`Endpoint: GET /test`);
});
