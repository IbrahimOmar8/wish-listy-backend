const express = require('express');
const router = express.Router();
const itemController = require('../controllers/itemController');
const { protect } = require('../middleware/auth');

router.use(protect);

// Add Item to Wishlist
router.post('/', itemController.addItem);

// Get Items by Wishlist ID (must come before /:id to avoid conflict)
router.get('/wishlist/:wishlistId', itemController.getItemsByWishlist);

// Get all items reserved by current user (must come before /:id to avoid conflict)
router.get('/reserved', itemController.getMyReservedItems);

// Specific routes must come before general /:id routes
// Mark Item as Purchased
router.put('/:id/purchase', itemController.markItemAsPurchased);

// Toggle item reservation (guest action)
router.put('/:id/reserve', itemController.toggleItemReservation);

// Update item status - isReceived (owner action)
router.put('/:id/status', itemController.updateItemStatus);

// Get Item by ID
router.get('/:id', itemController.getItemById);

// Update Item
router.put('/:id', itemController.updateItem);

// Delete Item
router.delete('/:id', itemController.deleteItem);

module.exports = router;