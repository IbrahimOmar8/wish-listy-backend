const Item = require('../models/Item');
const Wishlist = require('../models/Wishlist');

exports.addItem = async (req, res) => {
  try {
    const { name, description, wishlistId, priority, url, storeName, storeLocation, notes } = req.body;

    // Validation
    if (!name || !wishlistId) {
      return res.status(400).json({
        success: false,
        message: 'Item name and wishlistId are required'
      });
    }

    if (typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Item name must be a non-empty string'
      });
    }

    // Check if wishlist exists and verify ownership
    const wishlist = await Wishlist.findById(wishlistId);
    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Wishlist not found'
      });
    }

    // Optional: Check if user owns the wishlist
    if (req.user && wishlist.owner.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to add items to this wishlist'
      });
    }

    // Create item with proper field mapping
    const item = await Item.create({
      name: name.trim(),
      description: description ? description.trim() : undefined,
      wishlist: wishlistId,
      priority: priority || 'medium',
      url: url || null,
      storeName: storeName || null,
      storeLocation: storeLocation || null,
      notes: notes || null
    });

    // Update the Wishlist by adding the Item ID
    await Wishlist.findByIdAndUpdate(
      wishlistId,
      { 
        $push: { items: item._id },
        updatedAt: Date.now()
      }
    );

    res.status(201).json({
      success: true,
      item
    });
  } catch (error) {
    console.error('Add Item Error:', error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to add item'
    });
  }
};

exports.deleteItem = async (req, res) => {
  try {
    const { id } = req.params;

    const item = await Item.findById(id);
    
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    // Remove the Item from the Wishlist before deletion
    if (item.wishlist) {
      await Wishlist.findByIdAndUpdate(
        item.wishlist,
        { 
          $pull: { items: item._id },
          updatedAt: Date.now()
        }
      );
    }

    // Delete the Item
    await Item.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Item deleted successfully'
    });
  } catch (error) {
    console.error('Delete Item Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete item'
    });
  }
};

// Other functions remain the same with minor improvements
exports.getItemsByWishlist = async (req, res) => {
  try {
    const { wishlistId } = req.params;

    const items = await Item.find({ wishlist: wishlistId })
      .populate('purchasedBy', 'fullName username'); // Add populate for purchaser info

    res.status(200).json({
      success: true,
      items
    });
  } catch (error) {
    console.error('Get Items Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get items'
    });
  }
};

exports.updateItem = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Fields that can be updated
    const allowedFields = ['name', 'description', 'url', 'storeName', 'storeLocation', 'notes', 'priority', 'image'];
    const filteredUpdates = {};

    allowedFields.forEach(field => {
      if (updates.hasOwnProperty(field)) {
        filteredUpdates[field] = updates[field];
      }
    });

    const item = await Item.findByIdAndUpdate(
      id, 
      filteredUpdates, 
      { new: true, runValidators: true }
    );

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    res.status(200).json({
      success: true,
      item
    });
  } catch (error) {
    console.error('Update Item Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update item'
    });
  }
};

exports.markItemAsPurchased = async (req, res) => {
  try {
    const { id } = req.params;
    const { purchasedBy } = req.body;

    const item = await Item.findByIdAndUpdate(
      id,
      {
        isPurchased: true,
        purchasedBy: purchasedBy || req.user?.id || null,
        purchasedAt: new Date()
      },
      { new: true }
    ).populate('purchasedBy', 'fullName username');

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    res.status(200).json({
      success: true,
      item
    });
  } catch (error) {
    console.error('Mark Item as Purchased Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark item as purchased'
    });
  }
};