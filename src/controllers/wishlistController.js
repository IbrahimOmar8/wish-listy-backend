const Wishlist = require('../models/Wishlist');
const Item = require('../models/Item');

exports.createWishlist = async (req, res) => {
  try {
    const { name, description, privacy, category } = req.body;

    const wishlist = await Wishlist.create({
      name,
      description,
      privacy: privacy || 'public',
      category: category || 'general',
      owner: req.user.id
    });

    res.status(201).json({
      success: true,
      wishlist
    });
  } catch (error) {
    console.error('Create Wishlist Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create wishlist'
    });
  }
};

exports.getMyWishlists = async (req, res) => {
  try {
    const wishlists = await Wishlist.find({ owner: req.user.id })
      .populate('items')
      .sort('-createdAt');

    // Calculate stats for each wishlist
    const wishlistsWithStats = await Promise.all(
      wishlists.map(async (wishlist) => {
        const items = await Item.find({ wishlist: wishlist._id });
        const totalItems = items.length;
        const purchasedItems = items.filter(item => item.isPurchased).length;
        const purchasePercentage = totalItems > 0 ? Math.round((purchasedItems / totalItems) * 100) : 0;

        return {
          ...wishlist.toObject(),
          stats: {
            totalItems,
            purchasedItems,
            purchasePercentage
          }
        };
      })
    );

    res.status(200).json({
      success: true,
      count: wishlistsWithStats.length,
      wishlists: wishlistsWithStats
    });
  } catch (error) {
    console.error('Get Wishlists Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get wishlists'
    });
  }
};

exports.getWishlistById = async (req, res) => {
  try {
    const wishlist = await Wishlist.findById(req.params.id)
      .populate('owner', 'fullName phoneNumber profileImage')
      .populate('items');

    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Wishlist not found'
      });
    }

    // Check privacy settings
    if (wishlist.privacy === 'private' && wishlist.owner._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.status(200).json({
      success: true,
      wishlist
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get wishlist'
    });
  }
};

exports.updateWishlist = async (req, res) => {
  try {
    let wishlist = await Wishlist.findById(req.params.id);

    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Wishlist not found'
      });
    }

    // Check ownership
    if (wishlist.owner.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this wishlist'
      });
    }

    wishlist = await Wishlist.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      wishlist
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update wishlist'
    });
  }
};

exports.deleteWishlist = async (req, res) => {
  try {
    const wishlist = await Wishlist.findById(req.params.id);

    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Wishlist not found'
      });
    }

    // Check ownership
    if (wishlist.owner.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this wishlist'
      });
    }

    // Delete all items in wishlist
    await Item.deleteMany({ wishlist: req.params.id });

    await wishlist.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Wishlist deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete wishlist'
    });
  }
};
