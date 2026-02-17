const express = require('express');
const router = express.Router();
const itemController = require('../controllers/itemController');
const { protect } = require('../middleware/auth');

router.use(protect);

// Add Item to Wishlist
router.post('/', itemController.addItem);

// Get Items by Wishlist ID (must come before /:id to avoid conflict)
router.get('/wishlist/:wishlistId', itemController.getItemsByWishlist);

// Get all items reserved/purchased by current user (must come before /:id to avoid conflict)
router.get('/reserved', itemController.getMyReservedItems);

// Specific routes must come before general /:id routes
// Mark Item as Purchased
router.put('/:id/purchase', itemController.markItemAsPurchased);

// Extend reservation (reserver only)
router.put('/:id/extend-reservation', itemController.extendReservation);

// Update item status - isReceived (Owner only)
router.put('/:id/status', itemController.updateItemStatus);

// Mark as not received / dispute purchase (Owner only)
router.put('/:id/not-received', itemController.markAsNotReceived);

// Get Item by ID
router.get('/:id', itemController.getItemById);

// Update Item (general update)
router.put('/:id', itemController.updateItem);

// Delete Item
router.delete('/:id', itemController.deleteItem);

module.exports = router;