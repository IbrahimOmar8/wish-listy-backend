const Item = require('../models/Item');
const Wishlist = require('../models/Wishlist');

exports.addItem = async (req, res) => {
  try {
    const { name, description, price, url, image, priority, wishlistId } = req.body;

    // Check if wishlist exists and user owns it
    const wishlist = await Wishlist.findById(wishlistId);

    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Wishlist not found'
      });
    }

    if (wishlist.owner.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to add items to this wishlist'
      });
    }

    const item = await Item.create({
      name,
      description,
      price,
      url,
      image,
      priority: priority || 'medium',
      wishlist: wishlistId
    });

    // Add item to wishlist
    wishlist.items.push(item._id);
    await wishlist.save();

    res.status(201).json({
      success: true,
      item
    });
  } catch (error) {
    console.error('Add Item Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add item'
    });
  }
};

exports.getWishlistItems = async (req, res) => {
  try {
    const items = await Item.find({ wishlist: req.params.wishlistId })
      .populate('purchasedBy', 'fullName')
      .sort('-createdAt');

    res.status(200).json({
      success: true,
      count: items.length,
      items
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get items'
    });
  }
};

exports.updateItem = async (req, res) => {
  try {
    let item = await Item.findById(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    // Check if user owns the wishlist
    const wishlist = await Wishlist.findById(item.wishlist);

    if (wishlist.owner.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this item'
      });
    }

    item = await Item.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      item
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update item'
    });
  }
};

exports.markAsPurchased = async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    item.isPurchased = true;
    item.purchasedBy = req.user.id;
    item.purchasedAt = Date.now();
    await item.save();

    res.status(200).json({
      success: true,
      item
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to mark item as purchased'
    });
  }
};

exports.deleteItem = async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    // Check if user owns the wishlist
    const wishlist = await Wishlist.findById(item.wishlist);

    if (wishlist.owner.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this item'
      });
    }

    // Remove item from wishlist
    wishlist.items = wishlist.items.filter(
      itemId => itemId.toString() !== req.params.id
    );
    await wishlist.save();

    await item.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Item deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete item'
    });
  }
};