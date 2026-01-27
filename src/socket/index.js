const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');

const initializeSocket = (server) => {
  console.log('🔧 Initializing Socket.IO...');
  console.log('📡 Server address:', server.address());
  
  // Global Map to store active user-to-socket mappings
  // Key: userId (string), Value: socketId (string)
  const userSockets = new Map();
  
  const io = socketIO(server, {
    cors: {
      origin: '*', // Allow all origins for development
      credentials: true,
      methods: ['GET', 'POST', 'OPTIONS']
    },
    transports: ['websocket', 'polling'], // Support both transports
    allowEIO3: true, // Allow Engine.IO v3 clients
    pingTimeout: 60000,
    pingInterval: 25000
  });
  
  // Add error handlers at engine level
  io.engine.on('connection_error', (err) => {
    console.log('═══════════════════════════════════════════════════════');
    console.log('❌ Socket.IO Engine Connection Error:');
    console.log('   Error:', err.message);
    console.log('   Context:', err.context);
    console.log('   Type:', err.type);
    console.log('═══════════════════════════════════════════════════════');
  });

  console.log('✅ Socket.IO initialized successfully');
  console.log('📡 Socket.IO is ready to accept connections');

  // Socket authentication middleware - supports optional authentication
  io.use((socket, next) => {
    console.log('🔌 Socket connection attempt');
    console.log('Socket ID:', socket.id);
    console.log('Auth:', socket.handshake.auth);
    console.log('Headers:', socket.handshake.headers);
    
    try {
      const token = socket.handshake.auth.token || 
                    socket.handshake.headers.authorization?.replace('Bearer ', '');

      // Allow connection even without token (authentication can happen later via 'authenticate' event)
      if (!token) {
        console.log('⚠️ No token provided - allowing unauthenticated connection');
        socket.userId = null;
        socket.isAuthenticated = false;
        return next();
      }

      // If token is provided, verify it and set userId
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.userId = decoded.id;
        socket.isAuthenticated = true;
        console.log('✅ Token verified for user:', socket.userId);
      } catch (authError) {
        // Log auth error but don't reject connection (allows 'authenticate' event later)
        console.log('⚠️ Token verification failed:', authError.message);
        console.log('⚠️ Allowing connection - user can authenticate later via "authenticate" event');
        socket.userId = null;
        socket.isAuthenticated = false;
      }
      
      next();
    } catch (error) {
      // Log error but allow connection (allows post-login authentication)
      console.log('⚠️ Authentication middleware error:', error.message);
      console.log('⚠️ Allowing connection - user can authenticate later via "authenticate" event');
      socket.userId = null;
      socket.isAuthenticated = false;
      next();
    }
  });

  io.on('connection', (socket) => {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔌 Socket connection established');
    console.log('📌 Socket ID:', socket.id);
    console.log('👤 User ID:', socket.userId || 'Not authenticated');
    console.log('🔑 Auth:', socket.handshake.auth);
    console.log('📋 Headers:', socket.handshake.headers);
    console.log('═══════════════════════════════════════════════════════');

    // If authenticated on connect, map user and join room
    if (socket.userId) {
      // Map userId to socketId in userSockets Map
      userSockets.set(socket.userId.toString(), socket.id);
      console.log(`✅ User ${socket.userId} mapped to Socket ID: ${socket.id}`);
      
      // Join user to their personal room
      socket.join(socket.userId.toString());
      console.log(`📍 User ${socket.userId} joined room: ${socket.userId}`);
      console.log(`📊 Total active users: ${userSockets.size}`);
    } else {
      console.log('⚠️ Socket connected without authentication - waiting for "authenticate" event');
    }

    // Handle 'authenticate' event for post-login identity sync
    socket.on('authenticate', async (data) => {
      try {
        const { token } = data;

        if (!token) {
          console.log('❌ Authenticate event: Token not provided');
          return socket.emit('authentication_error', {
            message: 'Token is required for authentication'
          });
        }

        // Verify JWT token
        let decoded;
        try {
          decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (verifyError) {
          console.log('❌ Authenticate event: Invalid token -', verifyError.message);
          return socket.emit('authentication_error', {
            message: 'Invalid or expired token'
          });
        }

        // Extract userId from decoded payload
        const userId = decoded.id.toString();

        // If already authenticated with different user, log warning
        if (socket.userId && socket.userId.toString() !== userId) {
          console.log(`⚠️ Socket ${socket.id} re-authenticating as different user: ${userId}`);
          // Remove old mapping
          userSockets.delete(socket.userId.toString());
        }

        // Map socket: userSockets.set(userId, socket.id)
        userSockets.set(userId, socket.id);
        console.log(`✅ User ${userId} authenticated and mapped to Socket ID: ${socket.id}`);

        // Join private room: socket.join(userId)
        socket.join(userId);
        console.log(`📍 User ${userId} joined room: ${userId}`);

        // Set socket.userId for future reference
        socket.userId = userId;
        socket.isAuthenticated = true;

        // Emit 'authenticated' confirmation
        socket.emit('authenticated', { status: 'ok', userId: userId });
        console.log(`✅ Authentication successful for user ${userId}`);
        console.log(`📊 Total active users: ${userSockets.size}`);
      } catch (error) {
        console.error('❌ Authenticate event error:', error);
        socket.emit('authentication_error', {
          message: 'Authentication failed: ' + error.message
        });
      }
    });

    // Handle disconnect
    socket.on('disconnect', (reason) => {
      console.log('═══════════════════════════════════════════════════════');
      console.log(`❌ User disconnected`);
      console.log('👤 User ID:', socket.userId || 'Not authenticated');
      console.log('📌 Socket ID:', socket.id);
      console.log('📝 Disconnect reason:', reason);
      
      // Cleanup: Remove user from userSockets Map if authenticated
      if (socket.userId) {
        const userId = socket.userId.toString();
        // Check if this socket is still mapped to this user (handles re-authentication cases)
        if (userSockets.get(userId) === socket.id) {
          userSockets.delete(userId);
          console.log(`🗑️ Removed user ${userId} from userSockets Map`);
        }
        // Room leaving is handled automatically by Socket.IO
      }
      
      console.log(`📊 Total active users: ${userSockets.size}`);
      console.log('═══════════════════════════════════════════════════════');
    });

    // Optional: Handle user typing events, read receipts, etc.
    socket.on('user_online', () => {
      if (!socket.userId) {
        return socket.emit('error', { message: 'Must be authenticated to use this event' });
      }
      
      socket.broadcast.emit('user_status', {
        userId: socket.userId,
        status: 'online'
      });
    });
  });

  /**
   * Disconnect all sockets for a specific user (used during logout)
   * This ensures complete session termination and prevents "zombie" connections
   * @param {String} userId - User ID to disconnect all sockets for
   * @returns {Object} Result object with disconnected count and success status
   */
  io.disconnectUser = (userId) => {
    if (!userId) {
      console.warn('⚠️ disconnectUser called without userId');
      return { success: false, disconnectedCount: 0, error: 'userId is required' };
    }

    const userIdStr = userId.toString();
    let disconnectedCount = 0;

    try {
      // Get the user's room
      const userRoom = io.sockets.adapter.rooms.get(userIdStr);
      
      if (userRoom) {
        // Get all socket IDs in the user's room
        const socketIds = Array.from(userRoom);
        
        // Disconnect each socket explicitly
        socketIds.forEach((socketId) => {
          const socket = io.sockets.sockets.get(socketId);
          if (socket) {
            // Only disconnect if this socket belongs to the user
            if (socket.userId && socket.userId.toString() === userIdStr) {
              socket.disconnect(true); // Force disconnect
              disconnectedCount++;
              console.log(`🔌 Disconnected socket ${socketId} for user ${userIdStr} (logout)`);
            }
          }
        });
      }

      // Remove from userSockets Map if it exists
      if (userSockets.has(userIdStr)) {
        userSockets.delete(userIdStr);
        console.log(`🗑️ Removed user ${userIdStr} from userSockets Map (logout)`);
      }

      // Ensure the room is cleared (Socket.IO should handle this automatically, but we ensure it)
      io.sockets.adapter.rooms.delete(userIdStr);

      console.log(`✅ Logout cleanup complete for user ${userIdStr}: ${disconnectedCount} socket(s) disconnected`);
      console.log(`📊 Total active users: ${userSockets.size}`);

      return {
        success: true,
        disconnectedCount,
        userId: userIdStr
      };
    } catch (error) {
      console.error(`❌ Error disconnecting user ${userIdStr}:`, error);
      return {
        success: false,
        disconnectedCount,
        userId: userIdStr,
        error: error.message
      };
    }
  };

  return io;
};

module.exports = initializeSocket;
