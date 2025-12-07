const express = require('express');
const router = express.Router();
const {
  createEvent,
  getMyEvents,
  getEventById,
  updateEvent,
  deleteEvent,
  linkWishlist,
  inviteFriends,
  respondToInvitation,
  getPublicEvents
} = require('../controllers/Eventcontroller');
const { protect } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// Public events discovery (must be before /:id route)
router.get('/public', getPublicEvents);

// Main event routes
router.route('/')
  .post(createEvent)
  .get(getMyEvents);

router.route('/:id')
  .get(getEventById)
  .put(updateEvent)
  .delete(deleteEvent);

// Wishlist linking
router.put('/:id/wishlist', linkWishlist);

// Invitation routes
router.post('/:id/invite', inviteFriends);
router.put('/:id/respond', respondToInvitation);

module.exports = router;