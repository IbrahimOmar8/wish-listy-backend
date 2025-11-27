const mongoose = require('mongoose');

// Debug: Check all environment variables
console.log('🔍 DEBUG - process.env.MONGODB_URI:', process.env.MONGODB_URI);
console.log('🔍 DEBUG - All env keys:', Object.keys(process.env).filter(key => key.includes('MONGO')));

if (!process.env.MONGODB_URI) {
  console.error('❌ MongoDB URI is undefined. Please check your .env file.');
  process.exit(1);
}

console.log('🌐 Connecting to MongoDB...' + process.env.MONGODB_URI);

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
