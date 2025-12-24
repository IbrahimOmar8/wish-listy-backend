const express = require('express');
const router = express.Router();
const itemController = require('../controllers/itemController');
const { protect } = require('../middleware/auth');

router.use(protect);

// Add Item to Wishlist
router.post('/', itemController.addItem);
// Get Item by ID
router.get('/:id', itemController.getItemById);

// Get Items by Wishlist ID
router.get('/wishlist/:wishlistId', itemController.getItemsByWishlist);

// Update Item
router.put('/:id', itemController.updateItem);

// Mark Item as Purchased
router.put('/:id/purchase', itemController.markItemAsPurchased);

// Toggle item reservation (guest action)
router.put('/:id/reserve', itemController.toggleItemReservation);

// Update item status - isReceived (owner action)
router.put('/:id/status', itemController.updateItemStatus);

// Delete Item
router.delete('/:id', itemController.deleteItem);

module.exports = router;