const mongoose = require('mongoose');

// Set default MONGODB_URI if undefined
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/defaultDB';

if (process.env.MONGODB_URI) {
  console.log('🌐 Connecting to MongoDB...' + process.env.MONGODB_URI);
} else {
  console.error('❌ MongoDB URI is undefined. Please check your .env file.');
  process.exit(1); // Exit if the MongoDB URI is not defined
}

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB Connected Successfully');
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
