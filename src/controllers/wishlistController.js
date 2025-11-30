const Wishlist = require('../models/Wishlist');
const Item = require('../models/Item');

exports.createWishlist = async (req, res) => {
  try {
    const { name, description, privacy, category } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Wishlist name is required'
      });
    }

    const wishlist = await Wishlist.create({
      name,
      description: description || '',
      privacy: privacy || 'private',
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
      .populate('owner', 'fullName username profileImage');

    res.status(200).json({
      success: true,
      wishlists
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
    const { id } = req.params;

    const wishlist = await Wishlist.findById(id)
      .populate('items')
      .populate('owner', 'fullName username profileImage')
      .populate('sharedWith', 'fullName username profileImage');

    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Wishlist not found'
      });
    }

    res.status(200).json({
      success: true,
      wishlist
    });
  } catch (error) {
    console.error('Get Wishlist Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get wishlist'
    });
  }
};

exports.updateWishlist = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Fields that can be updated
    const allowedFields = ['name', 'description', 'privacy', 'category'];
    const filteredUpdates = {};

    allowedFields.forEach(field => {
      if (updates.hasOwnProperty(field)) {
        filteredUpdates[field] = updates[field];
      }
    });

    const wishlist = await Wishlist.findByIdAndUpdate(id, filteredUpdates, { new: true, runValidators: true });

    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Wishlist not found'
      });
    }

    res.status(200).json({
      success: true,
      wishlist
    });
  } catch (error) {
    console.error('Update Wishlist Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update wishlist'
    });
  }
};

exports.deleteWishlist = async (req, res) => {
  try {
    const { id } = req.params;

    const wishlist = await Wishlist.findByIdAndDelete(id);

    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Wishlist not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Wishlist deleted successfully'
    });
  } catch (error) {
    console.error('Delete Wishlist Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete wishlist'
    });
  }
};
