/**
 * Socket.IO Client Example
 *
 * This file demonstrates how to connect to the Socket.IO server
 * and listen for friend request notifications.
 *
 * Usage:
 * 1. Install socket.io-client: npm install socket.io-client
 * 2. Replace YOUR_JWT_TOKEN with an actual JWT token from login
 * 3. Run this file: node client-socket-example.js
 */

const io = require('socket.io-client');

// Replace with your actual JWT token
const TOKEN = 'YOUR_JWT_TOKEN';

// Connect to the server
const socket = io('http://localhost:5000', {
  auth: {
    token: TOKEN
  }
});

// Connection successful
socket.on('connect', () => {
  console.log('✅ Connected to server');
  console.log('Socket ID:', socket.id);

  // Emit user online status
  socket.emit('user_online');
});

// Listen for friend request notifications
socket.on('friend_request', (data) => {
  console.log('\n📩 New Friend Request!');
  console.log('Request ID:', data.requestId);
  console.log('From:', data.from.fullName, `(@${data.from.username})`);
  console.log('Message:', data.message);
});

// Listen for friend request accepted
socket.on('friend_request_accepted', (data) => {
  console.log('\n✅ Friend Request Accepted!');
  console.log('Request ID:', data.requestId);
  console.log('User:', data.user.fullName, `(@${data.user.username})`);
  console.log('Message:', data.message);
});

// Listen for friend request rejected
socket.on('friend_request_rejected', (data) => {
  console.log('\n❌ Friend Request Rejected');
  console.log('Request ID:', data.requestId);
  console.log('Message:', data.message);
});

// Listen for user status changes
socket.on('user_status', (data) => {
  console.log('\n👤 User Status Update');
  console.log('User ID:', data.userId);
  console.log('Status:', data.status);
});

// Handle connection errors
socket.on('connect_error', (error) => {
  console.error('❌ Connection Error:', error.message);
});

// Handle disconnection
socket.on('disconnect', (reason) => {
  console.log('❌ Disconnected from server');
  console.log('Reason:', reason);
});

// Keep the script running
console.log('🔄 Waiting for notifications...');
console.log('Press Ctrl+C to exit\n');
