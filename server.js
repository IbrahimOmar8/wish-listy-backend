require('dotenv').config();
const app = require('./src/app');
const connectDB = require('./src/config/database');
const initializeSocket = require('./src/socket');

const PORT = process.env.PORT || 5000;

// Connect to database
connectDB();

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});

// Initialize Socket.IO
const io = initializeSocket(server);

// Make io accessible to routes via app
app.set('io', io);

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Rejection:', err);
  server.close(() => process.exit(1));
});