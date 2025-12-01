#!/usr/bin/env node

// Simple TCP connection test server
// Returns TCP connectivity status as JSON
// Run with: node test-connection.js

const net = require('net');
const http = require('http');

const TARGET_HOST = 'csctcloud.uwe.ac.uk';
const TARGET_PORT = 22;
const SERVER_PORT = 8080;

function testTcpConnection() {
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
        message: 'Connection succeeded'
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
      const result = await testTcpConnection();
      res.writeHead(200);
      res.end(JSON.stringify(result));
      console.log(`[${new Date().toISOString()}] Test result: ${result.success ? 'SUCCESS' : 'FAILED'} - Latency: ${result.latency}ms`);
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
  console.log(`TCP test server running on http://localhost:${SERVER_PORT}`);
  console.log(`Testing connectivity to ${TARGET_HOST}:${TARGET_PORT}`);
  console.log(`Endpoint: GET /test`);
});
