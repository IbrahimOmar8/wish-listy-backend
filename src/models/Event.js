const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Event name is required'],
    trim: true,
    minlength: [2, 'Event name must be at least 2 characters'],
    maxlength: [100, 'Event name cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters'],
    default: null
  },
  date: {
    type: Date,
    required: [true, 'Event date is required'],
    validate: {
      validator: function(value) {
        // Date must be in the future (only for new events)
        if (this.isNew) {
          return value > new Date();
        }
        return true;
      },
      message: 'Event date must be in the future'
    }
  },
  type: {
    type: String,
    required: [true, 'Event type is required'],
    enum: {
      values: ['birthday', 'wedding', 'anniversary', 'graduation', 'holiday', 'baby_shower', 'house_warming', 'other'],
      message: 'Invalid event type'
    }
  },
  status: {
    type: String,
    enum: ['upcoming', 'ongoing', 'completed', 'cancelled'],
    default: 'upcoming'
  },
  privacy: {
    type: String,
    required: [true, 'Event privacy is required'],
    enum: {
      values: ['public', 'private', 'friends_only'],
      message: 'Invalid privacy option'
    }
  },
  mode: {
    type: String,
    required: [true, 'Event mode is required'],
    enum: {
      values: ['in_person', 'online', 'hybrid'],
      message: 'Invalid event mode'
    }
  },
  location: {
    type: String,
    trim: true,
    maxlength: [200, 'Location cannot exceed 200 characters'],
    default: null
  },
  meeting_link: {
    type: String,
    trim: true,
    default: null,
    validate: {
      validator: function(value) {
        // meeting_link is required if mode is 'online' or 'hybrid'
        if ((this.mode === 'online' || this.mode === 'hybrid') && !value) {
          return false;
        }
        // Validate URL format if provided
        if (value) {
          const urlRegex = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;
          return urlRegex.test(value);
        }
        return true;
      },
      message: 'Valid meeting link is required for online/hybrid events'
    }
  },
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  wishlist: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Wishlist',
    default: null
  },
  invited_friends: [{
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

// Pre-save middleware to update timestamps
eventSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Pre-save middleware to validate meeting_link based on mode
eventSchema.pre('save', function(next) {
  if ((this.mode === 'online' || this.mode === 'hybrid') && !this.meeting_link) {
    const error = new Error('Meeting link is required for online or hybrid events');
    error.name = 'ValidationError';
    return next(error);
  }
  next();
});

// Virtual for checking if event is past
eventSchema.virtual('isPast').get(function() {
  return this.date < new Date();
});

// Update status based on date
eventSchema.methods.updateStatus = function() {
  const now = new Date();
  if (this.status === 'cancelled') return;
  
  if (this.date < now) {
    this.status = 'completed';
  } else {
    this.status = 'upcoming';
  }
};

// Index for efficient queries
eventSchema.index({ creator: 1, date: -1 });
eventSchema.index({ privacy: 1 });
eventSchema.index({ type: 1 });

module.exports = mongoose.model('Event', eventSchema);