const express = require('express');
const router = express.Router();
const {
  addItem,
  getWishlistItems,
  updateItem,
  markAsPurchased,
  deleteItem
} = require('../controllers/itemController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.post('/', addItem);
router.get('/wishlist/:wishlistId', getWishlistItems);
router.put('/:id', updateItem);
router.put('/:id/purchase', markAsPurchased);
router.delete('/:id', deleteItem);

module.exports = router;