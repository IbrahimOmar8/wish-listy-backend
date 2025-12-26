const Wishlist = require('../models/Wishlist');
const Item = require('../models/Item');
const Reservation = require('../models/Reservation');

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
      owner: req.user.id,
      items: [] // Ensure starting with empty array
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
      .populate({
        path: 'items',
        match: { isPurchased: false }, // Optional: show only unpurchased items
        options: { sort: { priority: -1, createdAt: -1 } } // Sort by priority and date
      })
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
    const viewerId = req.user.id;

    const wishlist = await Wishlist.findById(id)
      .populate({
        path: 'items',
        populate: {
          path: 'purchasedBy',
          select: 'fullName username'
        }
      })
      .populate('owner', 'fullName username profileImage')
      .populate('sharedWith', 'fullName username profileImage');

    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Wishlist not found'
      });
    }

    const isOwner = wishlist.owner._id.toString() === viewerId;

    // Get all reservations for items in this wishlist
    const itemIds = wishlist.items.map(item => item._id);
    const reservations = await Reservation.find({
      item: { $in: itemIds },
      status: 'reserved'
    });

    // Create a map of item reservations
    const reservationMap = {};
    reservations.forEach(res => {
      const itemId = res.item.toString();
      if (!reservationMap[itemId]) {
        reservationMap[itemId] = {
          totalReserved: 0,
          reservedByMe: false
        };
      }
      reservationMap[itemId].totalReserved += res.quantity;
      if (res.reserver.toString() === viewerId) {
        reservationMap[itemId].reservedByMe = true;
      }
    });

    // Add item status based on viewer perspective
    const itemsWithStatus = wishlist.items.map(item => {
      const itemObj = item.toObject();
      const resInfo = reservationMap[item._id.toString()] || { totalReserved: 0, reservedByMe: false };

      let itemStatus;

      if (item.isPurchased) {
        // Item marked as gifted by owner
        itemStatus = 'gifted';
      } else if (resInfo.totalReserved >= item.quantity) {
        // Fully reserved
        if (isOwner) {
          // Owner sees it as available to maintain surprise
          itemStatus = 'available';
        } else {
          // Friends see it as reserved
          itemStatus = 'reserved';
        }
      } else if (resInfo.totalReserved > 0) {
        // Partially reserved
        if (isOwner) {
          itemStatus = 'available'; // Maintain surprise for owner
        } else {
          itemStatus = 'available'; // Still available for more reservations
        }
      } else {
        // Not reserved at all
        itemStatus = 'available';
      }

      // Calculate isReserved: true if item is reserved by someone else (not by me)
      const isReserved = !isOwner && resInfo.totalReserved > 0 && !resInfo.reservedByMe;

      return {
        ...itemObj,
        itemStatus,
        availableQuantity: isOwner ? item.quantity : item.quantity - resInfo.totalReserved,
        isReservedByMe: resInfo.reservedByMe,
        isReserved, // true if reserved by another friend (not by me)
        // Don't show reservation details to owner (maintain surprise)
        ...(isOwner ? {} : {
          totalReserved: resInfo.totalReserved,
          remainingQuantity: item.quantity - resInfo.totalReserved
        })
      };
    });

    // Additional statistics
    const stats = {
      totalItems: wishlist.items.length,
      purchasedItems: wishlist.items.filter(item => item.isPurchased).length,
      pendingItems: wishlist.items.filter(item => !item.isPurchased).length
    };

    res.status(200).json({
      success: true,
      wishlist: {
        ...wishlist.toObject(),
        items: itemsWithStatus
      },
      stats,
      isOwner
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

    // Verify ownership
    const wishlist = await Wishlist.findById(id);
    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Wishlist not found'
      });
    }

    if (wishlist.owner.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to update this wishlist'
      });
    }

    // Fields that can be updated
    const allowedFields = ['name', 'description', 'privacy', 'category'];
    const filteredUpdates = {};

    allowedFields.forEach(field => {
      if (updates.hasOwnProperty(field)) {
        filteredUpdates[field] = updates[field];
      }
    });

    const updatedWishlist = await Wishlist.findByIdAndUpdate(
      id, 
      filteredUpdates, 
      { new: true, runValidators: true }
    ).populate('items');

    res.status(200).json({
      success: true,
      wishlist: updatedWishlist
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

    const wishlist = await Wishlist.findById(id);
    
    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Wishlist not found'
      });
    }

    // Verify ownership
    if (wishlist.owner.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to delete this wishlist'
      });
    }

    // Delete all related items first
    await Item.deleteMany({ wishlist: id });

    // Delete the wishlist
    await Wishlist.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Wishlist and all related items deleted successfully'
    });
  } catch (error) {
    console.error('Delete Wishlist Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete wishlist'
    });
  }
};

// Additional useful function - Share wishlist with other users
exports.shareWishlist = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    const wishlist = await Wishlist.findById(id);
    
    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Wishlist not found'
      });
    }

    // Verify ownership
    if (wishlist.owner.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to share this wishlist'
      });
    }

    // Check if already shared
    if (wishlist.sharedWith.includes(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Wishlist is already shared with this user'
      });
    }

    // Add user to sharedWith array
    wishlist.sharedWith.push(userId);
    await wishlist.save();

    res.status(200).json({
      success: true,
      message: 'Wishlist shared successfully',
      wishlist
    });
  } catch (error) {
    console.error('Share Wishlist Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to share wishlist'
    });
  }
};