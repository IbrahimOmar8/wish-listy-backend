const mongoose = require('mongoose');

const wishlistSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Wishlist name is required'],
    trim: true
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  privacy: {
    type: String,
    enum: ['public', 'private', 'friends'],
    default: 'private'
  },
  category: {
    type: String,
    default: 'general'
    // No enum - allows any custom category
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  items: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item'
  }],
  sharedWith: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

wishlistSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Wishlist', wishlistSchema);