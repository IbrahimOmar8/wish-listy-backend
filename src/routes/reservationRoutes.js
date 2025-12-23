const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  reserveItem,
  cancelReservation,
  getMyReservations,
} = require('../controllers/reservationController');

// All routes require authentication
router.use(protect);

// Reserve an item
router.post('/items/:itemId/reserve', reserveItem);

// Cancel a reservation
router.delete('/items/:itemId/reserve', cancelReservation);

// Get my reservations
router.get('/reservations', getMyReservations);

module.exports = router;
