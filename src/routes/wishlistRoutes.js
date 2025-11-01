const express = require('express');
const router = express.Router();
const {
  createWishlist,
  getMyWishlists,
  getWishlistById,
  updateWishlist,
  deleteWishlist
} = require('../controllers/wishlistController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.route('/')
  .post(createWishlist)
  .get(getMyWishlists);

router.route('/:id')
  .get(getWishlistById)
  .put(updateWishlist)
  .delete(deleteWishlist);

module.exports = router;