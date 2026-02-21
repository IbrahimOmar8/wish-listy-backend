require('dotenv').config();
const app = require('./src/app');
const connectDB = require('./src/config/database');
const initializeSocket = require('./src/socket');
const { initializeFirebase } = require('./src/config/firebase');

const PORT = process.env.PORT || 4000;

// Connect to database
connectDB();

// Initialize Firebase for push notifications
initializeFirebase();

// Listen on all network interfaces (0.0.0.0) to allow connections from mobile devices on the same network
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  console.log(`📱 Accessible at http://localhost:${PORT} and http://192.168.1.11:${PORT}`);
  
  // Initialize Socket.IO AFTER server is listening
  console.log('🔧 Starting Socket.IO initialization...');
  const io = initializeSocket(server);
  console.log('✅ Socket.IO setup complete and ready for connections');
  
  // Make io accessible to routes via app
  app.set('io', io);

  // Start reservation expiration cron (auto-cancel expired, 48h reminder)
  const { startReservationCron } = require('./src/services/reservationCron');
  startReservationCron(io);

  // Start event reminder cron (48h before event - runs daily at 08:00, staggered from reservation cron)
  const { startEventReminderCron } = require('./src/services/eventCron');
  startEventReminderCron(io);
  
  console.log('✅ Server fully initialized and ready');
});

// Note: io is set inside server.listen callback above

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Rejection:', err);
  server.close(() => process.exit(1));
});