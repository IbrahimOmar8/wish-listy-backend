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

// Toggle reservation (Reserve/Unreserve) - PUT method
router.put('/items/:itemId/reserve', reserveItem);

// Get my reservations
router.get('/reservations', getMyReservations);

module.exports = router;
