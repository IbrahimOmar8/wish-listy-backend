const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./routes/authRoutes');
const wishlistRoutes = require('./routes/wishlistRoutes');
const itemRoutes = require('./routes/itemRoutes');
const eventRoutes = require('./routes/Eventroutes');
const userRoutes = require('./routes/userRoutes');
const friendRoutes = require('./routes/friendRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

const app = express();

// CORS Configuration
// const corsOptions = {
//   origin: '*', // Allow all origins or specify specific ones
//   credentials: true,
//   methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
//   allowedHeaders: ['Content-Type', 'Authorization']
// };


// Middleware
// Configure helmet to allow Socket.IO connections and localhost access
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for Socket.IO compatibility
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false, // Allow cross-origin resources
  crossOriginOpenerPolicy: false // Allow cross-origin opener
}));
app.use(cors({
  origin: '*', // Allow all origins for development
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  preflightContinue: false,
  optionsSuccessStatus: 204
}));
//app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Set default NODE_ENV if undefined
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

if (!process.env.NODE_ENV) {
  console.error('❌ NODE_ENV is undefined. Please check your .env file.');
  process.exit(1);
}

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Routes
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Wish Listy API is running',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      wishlists: '/api/wishlists',
      items: '/api/items',
      events: '/api/events',
      users: '/api/users',
      friends: '/api/friends',
      notifications: '/api/notifications'
    }
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/wishlists', wishlistRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/users', userRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/notifications', notificationRoutes);

// Error Handler
app.use(errorHandler);

module.exports = app;