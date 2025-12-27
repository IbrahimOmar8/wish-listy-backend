const Item = require('../models/Item');
const Wishlist = require('../models/Wishlist');
const mongoose = require('mongoose');

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
      description: description ? description.trim() : null,
      wishlist: wishlistId,
      priority: priority || 'medium',
      url: url || null,
      storeName: storeName || null,
      storeLocation: storeLocation || null,
      notes: notes || null
    });

    // Add the item to the wishlist's items array
    await Wishlist.findByIdAndUpdate(
      wishlistId,
      { 
        $push: { items: item._id },
        updatedAt: Date.now()
      }
    );

    // Populate and return full item details
    const populatedItem = await Item.findById(item._id).populate('wishlist');

    res.status(201).json({
      success: true,
      item: {
        _id: populatedItem._id,
        name: populatedItem.name,
        description: populatedItem.description,
        url: populatedItem.url,
        storeName: populatedItem.storeName,
        storeLocation: populatedItem.storeLocation,
        notes: populatedItem.notes,
        priority: populatedItem.priority,
        image: populatedItem.image,
        reservedBy: populatedItem.reservedBy || null,
        isReceived: populatedItem.isReceived || false,
        wishlist: populatedItem.wishlist,
        createdAt: populatedItem.createdAt,
        updatedAt: populatedItem.updatedAt
      }
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
    const Reservation = require('../models/Reservation');

    // Fetch item with wishlist populated to check ownership
    const item = await Item.findById(id).populate({
      path: 'wishlist',
      select: 'owner'
    });
    
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    // Check if user is the owner
    const isOwner = item.wishlist && item.wishlist.owner.toString() === req.user.id;

    // If owner, check if item has active reservations
    if (isOwner) {
      const activeReservations = await Reservation.find({
        item: id,
        status: 'reserved'
      });

      if (activeReservations.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete an item that is currently reserved by a friend.'
        });
      }
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

// @desc    Get all items reserved by the current user
// @route   GET /api/items/reserved
// @access  Private
exports.getMyReservedItems = async (req, res) => {
  try {
    const userId = req.user.id;

    // Find items reserved by current user that haven't been received yet
    const items = await Item.find({
      reservedBy: userId,
      isReceived: false
    })
      .populate({
        path: 'wishlist',
        select: '_id name description',
        populate: {
          path: 'owner',
          select: '_id fullName username profileImage'
        }
      })
      .sort({ updatedAt: -1 }); // Recently reserved first (updatedAt changes when reserved)

    res.status(200).json({
      success: true,
      data: items
    });
  } catch (error) {
    console.error('Get My Reserved Items Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get reserved items'
    });
  }
};

// Other functions remain the same with minor improvements
exports.getItemsByWishlist = async (req, res) => {
  try {
    const { wishlistId } = req.params;

    // Validate wishlistId - it should be a valid MongoDB ObjectId
    if (!wishlistId || !mongoose.Types.ObjectId.isValid(wishlistId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid wishlist ID format'
      });
    }

    // Check if wishlist exists
    const wishlist = await Wishlist.findById(wishlistId);
    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Wishlist not found'
      });
    }

    const items = await Item.find({ wishlist: wishlistId })
      .populate('purchasedBy', 'fullName username profileImage');

    res.status(200).json({
      success: true,
      items
    });
  } catch (error) {
    console.error('Get Items By Wishlist Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get items',
      error: error.message
    });
  }
};
// @desc    Get item by ID with Owner vs Guest logic
// @route   GET /api/items/:id
// @access  Private
exports.getItemById = async (req, res) => {
  try {
    const { id } = req.params;
    const viewerId = req.user.id;
    const Reservation = require('../models/Reservation');

    // Find item with wishlist and purchasedBy populated
    const item = await Item.findById(id)
      .populate('purchasedBy', 'fullName username profileImage')
      .populate({
        path: 'wishlist',
        select: '_id name description owner privacy',
        populate: {
          path: 'owner',
          select: '_id fullName username profileImage'
        }
      });
    
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    // Check if viewer is the owner of the wishlist
    const isOwner = item.wishlist.owner._id.toString() === viewerId;

    // Get reservation info from Reservation collection
    const reservation = await Reservation.findOne({
      item: id,
      reserver: viewerId,
      status: 'reserved'
    });

    // Get all active reservations for this item (for quantity calculation)
    const allReservations = await Reservation.find({
      item: id,
      status: 'reserved'
    });

    const totalReserved = allReservations.reduce((sum, res) => sum + res.quantity, 0);
    const isReservedByMe = !!reservation;
    const availableQuantity = Math.max(0, item.quantity - totalReserved);

    // Convert to object for manipulation
    const itemObj = item.toObject();

    // Owner view: Show reservation status (teaser mode) but not who reserved it
    if (isOwner) {
      // Calculate itemStatus
      let itemStatus;
      if (itemObj.isPurchased) {
        itemStatus = 'gifted';
      } else if (totalReserved > 0) {
        itemStatus = 'reserved';
      } else {
        itemStatus = 'available';
      }

      return res.status(200).json({
        success: true,
        item: {
          ...itemObj,
          availableQuantity: Math.max(0, item.quantity - totalReserved), // Owner sees actual available quantity
          isReservedByMe: false, // Owner always sees false
          isReserved: totalReserved > 0, // Owner sees if item is reserved
          totalReserved, // Owner sees count but not who reserved
          itemStatus, // Owner sees status
          wishlist: itemObj.wishlist
          // Note: No reserver details (names, IDs) are included for owner privacy
        }
      });
    }

    // Guest view: Show reservation info and purchase info
    const responseItem = {
      ...itemObj,
      availableQuantity,
      isReservedByMe,
      isReserved: totalReserved > 0 && !isReservedByMe, // Reserved by someone else
      totalReserved,
      remainingQuantity: availableQuantity,
      wishlist: itemObj.wishlist
    };

    res.status(200).json({
      success: true,
      item: responseItem
    });
  } catch (error) {
    console.error('Get Item by ID Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get item',
      error: error.message
    });
  }
}   

// Update item with field filtering
exports.updateItem = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const Reservation = require('../models/Reservation');

    // Fields that can be updated
    const allowedFields = ['name', 'description', 'url', 'storeName', 'storeLocation', 'notes', 'priority', 'image'];
    const filteredUpdates = {};

    allowedFields.forEach(field => {
      if (updates.hasOwnProperty(field)) {
        filteredUpdates[field] = updates[field];
      }
    });

    // First, fetch item with wishlist to check ownership
    const item = await Item.findById(id).populate({
      path: 'wishlist',
      select: 'owner'
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    // Check if user is the owner
    const isOwner = item.wishlist && item.wishlist.owner.toString() === req.user.id;

    // If owner, check if item has active reservations
    if (isOwner) {
      const activeReservations = await Reservation.find({
        item: id,
        status: 'reserved'
      });

      if (activeReservations.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Cannot edit an item that is currently reserved by a friend.'
        });
      }
    }

    // Proceed with update
    const updatedItem = await Item.findByIdAndUpdate(
      id, 
      filteredUpdates, 
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      item: updatedItem
    });
  } catch (error) {
    console.error('Update Item Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update item'
    });
  }
};

// @desc    Get all items purchased/reserved by the current user
// @route   GET /api/items/reserved
// @access  Private
exports.getMyReservedItems = async (req, res) => {
  try {
    const userId = req.user.id;

    // Find items purchased by current user
    const items = await Item.find({
      purchasedBy: userId,
      isPurchased: true
    })
      .populate({
        path: 'wishlist',
        select: '_id name description',
        populate: {
          path: 'owner',
          select: '_id fullName username profileImage'
        }
      })
      .sort({ purchasedAt: -1, createdAt: -1 }); // Recently purchased first

    res.status(200).json({
      success: true,
      data: items
    });
  } catch (error) {
    console.error('Get My Reserved Items Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get reserved items'
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

// @desc    Toggle item reservation (Reserve/Cancel)
// @route   PUT /api/items/:id/reserve
// @access  Private (Guest only - not owner)
exports.toggleItemReservation = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Find item with wishlist populated
    const item = await Item.findById(id)
      .populate('wishlist', 'owner')
      .populate('reservedBy', 'fullName username profileImage');

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    // Constraint: Cannot reserve if already received
    if (item.isReceived) {
      return res.status(400).json({
        success: false,
        message: 'Cannot reserve an item that has been received'
      });
    }

    // Verify user is not the owner
    if (item.wishlist.owner.toString() === userId) {
      return res.status(403).json({
        success: false,
        message: 'You cannot reserve items from your own wishlist'
      });
    }

    // Toggle logic
    const currentReservedBy = item.reservedBy ? item.reservedBy._id.toString() : null;

    if (!currentReservedBy) {
      // Reserve it
      item.reservedBy = userId;
    } else if (currentReservedBy === userId) {
      // Cancel reservation
      item.reservedBy = null;
    } else {
      // Already reserved by someone else
      return res.status(400).json({
        success: false,
        message: 'This item is already reserved by someone else'
      });
    }

    await item.save();

    // Populate reservedBy for response
    const updatedItem = await Item.findById(id)
      .populate('reservedBy', 'fullName username profileImage');

    // Determine message based on whether item was reserved or cancelled
    const isNowReserved = !!updatedItem.reservedBy;

    res.status(200).json({
      success: true,
      message: isNowReserved ? 'Item reserved successfully' : 'Reservation cancelled successfully',
      item: updatedItem
    });
  } catch (error) {
    console.error('Toggle Item Reservation Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle item reservation'
    });
  }
};

// @desc    Update item status - isReceived (Owner only)
// @route   PUT /api/items/:id/status
// @access  Private (Owner only)
exports.updateItemStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isReceived } = req.body;
    const userId = req.user.id;

    // Find item with wishlist populated
    const item = await Item.findById(id)
      .populate({
        path: 'wishlist',
        select: 'owner',
        populate: {
          path: 'owner',
          select: '_id fullName username'
        }
      });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    // Verify item has a wishlist
    if (!item.wishlist || !item.wishlist.owner) {
      return res.status(400).json({
        success: false,
        message: 'Item does not have a valid wishlist'
      });
    }

    // Verify user is the owner - REJECT if Guest
    if (item.wishlist.owner._id.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Only the wishlist owner can mark items as received'
      });
    }

    // Update isReceived
    item.isReceived = isReceived !== undefined ? isReceived : !item.isReceived;
    await item.save();

    // Fetch updated item for response
    const updatedItem = await Item.findById(id)
      .populate('purchasedBy', 'fullName username profileImage')
      .populate({
        path: 'wishlist',
        select: '_id name description owner privacy',
        populate: {
          path: 'owner',
          select: '_id fullName username profileImage'
        }
      });
    
    const itemObj = updatedItem.toObject();

    res.status(200).json({
      success: true,
      message: `Item marked as ${item.isReceived ? 'received' : 'not received'}`,
      item: itemObj
    });
  } catch (error) {
    console.error('Update Item Status Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update item status'
    });
  }
};