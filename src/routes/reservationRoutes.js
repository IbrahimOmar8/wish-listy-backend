const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  reserveItem,
  cancelReservation,
  getMyReservations,
  getPendingReservations,
} = require('../controllers/reservationController');

// All routes require authentication
router.use(protect);

// Toggle reservation (Reserve/Unreserve) - PUT method
router.put('/items/:itemId/reserve', reserveItem);

// Get my reservations
router.get('/reservations', getMyReservations);

// Get my pending reservations (not purchased, not received)
router.get('/reservations/pending', getPendingReservations);

module.exports = router;
