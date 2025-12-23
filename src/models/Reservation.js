const mongoose = require('mongoose');

const reservationSchema = new mongoose.Schema(
  {
    item: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Item',
      required: true,
    },
    reserver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    quantity: {
      type: Number,
      default: 1,
      min: 1,
    },
    status: {
      type: String,
      enum: ['reserved', 'cancelled'],
      default: 'reserved',
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to prevent duplicate reservations
reservationSchema.index({ item: 1, reserver: 1 }, { unique: true });

// Index for efficient queries
reservationSchema.index({ item: 1, status: 1 });
reservationSchema.index({ reserver: 1, status: 1 });

const Reservation = mongoose.model('Reservation', reservationSchema);

module.exports = Reservation;
