const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true
  },
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    lowercase: true,
    minlength: [3, 'Username must be at least 3 characters long'],
    match: [ /^[a-zA-Z0-9_.@\-]+$/, 'Username can only contain letters, numbers, underscores, hyphens, dots, and @ symbol'
]
  },
  handle: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    lowercase: true,
    minlength: [4, 'Handle must be at least 4 characters long (including @)'],
    maxlength: [31, 'Handle cannot exceed 31 characters (including @)'],
    match: [/^@[a-zA-Z0-9_.]+$/, 'Handle must start with @ and contain only letters, numbers, underscores, and dots'],
    default: null
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address']
  },
  phone: {
    type: String,
    trim: true
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters long'],
    select: false
  },
  profileImage: {
    type: String,
    default: null
  },
  bio: {
    type: String,
    trim: true,
    maxlength: [500, 'Bio cannot exceed 500 characters'],
    default: null
  },
  gender: {
    type: String,
    default: null,
    validate: {
      validator: function(value) {
        // Optional field: allow null/undefined, otherwise must be one of the allowed values
        if (value === null || value === undefined) return true;
        return ['male', 'female'].includes(value);
      },
      message: '{VALUE} is not a valid gender value'
    }
  },
  birth_date: {
    type: Date,
    default: null,
    validate: {
      validator: function(value) {
        // If provided, must be a valid date and not in the future
        if (!value) return true; // Optional field
        const date = new Date(value);
        if (isNaN(date.getTime())) return false;
        return date <= new Date(); // Birth date cannot be in the future
      },
      message: 'Birth date must be a valid date and cannot be in the future'
    }
  },
  country_code: {
    type: String,
    trim: true,
    uppercase: true,
    minlength: [2, 'Country code must be 2 letters'],
    maxlength: [2, 'Country code must be 2 letters'],
    match: [/^[A-Z]{2}$/, 'Country code must be a valid ISO 3166-1 alpha-2 code (2 uppercase letters)'],
    default: null
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  friends: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  interests: [{
    type: String,
    enum: [
      'Watches', 'Perfumes', 'Sneakers', 'Jewelry', 'Handbags', 'Makeup & Skincare',
      'Gadgets', 'Gaming', 'Photography', 'Home Decor', 'Plants', 
      'Coffee & Tea', 'Books', 'Fitness Gear', 'Car Accessories', 'Music Instruments', 'Art', 'DIY & Crafts'
    ],
    default: []
  }],
  preferredLanguage: {
    type: String,
    enum: ['en', 'ar'],
    default: 'en'
  },
  lastBadgeSeenAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

userSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Method to compare passwords
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);