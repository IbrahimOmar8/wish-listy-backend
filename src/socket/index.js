const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');

const initializeSocket = (server) => {
  console.log('🔧 Initializing Socket.IO...');
  console.log('📡 Server address:', server.address());
  
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

  // Socket authentication middleware
  io.use((socket, next) => {
    console.log('🔌 Socket connection attempt');
    console.log('Socket ID:', socket.id);
    console.log('Auth:', socket.handshake.auth);
    console.log('Headers:', socket.handshake.headers);
    
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        console.log('❌ Authentication error: Token not provided');
        return next(new Error('Authentication error: Token not provided'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      console.log('✅ Token verified for user:', socket.userId);
      next();
    } catch (error) {
      console.log('❌ Authentication error:', error.message);
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔌 Socket connection established');
    console.log('📌 Socket ID:', socket.id);
    console.log('👤 User ID:', socket.userId);
    console.log('🔑 Auth:', socket.handshake.auth);
    console.log('📋 Headers:', socket.handshake.headers);
    console.log(`✅ User ${socket.userId} connected with Socket ID: ${socket.id}`);
    console.log('═══════════════════════════════════════════════════════');

    // Join user to their personal room
    socket.join(socket.userId);
    console.log(`📍 User ${socket.userId} joined room: ${socket.userId}`);

    // Handle disconnect
    socket.on('disconnect', (reason) => {
      console.log('═══════════════════════════════════════════════════════');
      console.log(`❌ User disconnected`);
      console.log('👤 User ID:', socket.userId);
      console.log('📌 Socket ID:', socket.id);
      console.log('📝 Disconnect reason:', reason);
      console.log('═══════════════════════════════════════════════════════');
    });

    // Optional: Handle user typing events, read receipts, etc.
    socket.on('user_online', () => {
      socket.broadcast.emit('user_status', {
        userId: socket.userId,
        status: 'online'
      });
    });
  });

  return io;
};

module.exports = initializeSocket;
