const Wishlist = require('../models/Wishlist');
const Item = require('../models/Item');
const Reservation = require('../models/Reservation');
const mongoose = require('mongoose');

exports.createWishlist = async (req, res) => {
  try {
    const { name, privacy, category, items } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: req.t('validation.val_wishlist_name_required')
      });
    }

    // If items array exists and has items, use transaction
    if (items && Array.isArray(items) && items.length > 0) {
      const session = await mongoose.startSession();
      
      try {
        session.startTransaction();

        // Validate items before creating wishlist
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          
          if (!item.name || typeof item.name !== 'string' || item.name.trim().length === 0) {
            await session.abortTransaction();
            await session.endSession();
            return res.status(400).json({
              success: false,
              message: `Item at index ${i}: name is required and must be a non-empty string`
            });
          }

          // Validate priority if provided
          if (item.priority && !['low', 'medium', 'high'].includes(item.priority)) {
            await session.abortTransaction();
            await session.endSession();
            return res.status(400).json({
              success: false,
              message: `Item at index ${i}: priority must be 'low', 'medium', or 'high'`
            });
          }
        }

        // Create wishlist within transaction
        const wishlist = await Wishlist.create([{
          name,
          privacy: privacy || 'private',
          category: category || 'general',
          owner: req.user.id,
          items: []
        }], { session });

        const createdWishlist = wishlist[0];
        const createdItems = [];

        // Create items within transaction
        for (const itemData of items) {
          const item = await Item.create([{
            name: itemData.name.trim(),
            description: itemData.description ? itemData.description.trim() : null,
            wishlist: createdWishlist._id,
            priority: itemData.priority || 'medium',
            url: itemData.url || null,
            storeName: itemData.storeName || null,
            storeLocation: itemData.storeLocation || null
          }], { session });

          createdItems.push(item[0]);

          // Add item to wishlist's items array
          await Wishlist.findByIdAndUpdate(
            createdWishlist._id,
            { $push: { items: item[0]._id } },
            { session }
          );
        }

        // Commit transaction
        await session.commitTransaction();
        await session.endSession();

        // Populate wishlist with items before returning
        const populatedWishlist = await Wishlist.findById(createdWishlist._id)
          .populate('items')
          .populate('owner', 'fullName username profileImage');

        return res.status(201).json({
          success: true,
          wishlist: populatedWishlist,
          itemsCreated: createdItems.length
        });
      } catch (transactionError) {
        // Abort transaction on error
        if (session.inTransaction()) {
          await session.abortTransaction();
        }
        await session.endSession();
        throw transactionError; // Re-throw to be caught by outer catch
      }
    } else {
      // No items array or empty array - create wishlist normally (backward compatible)
      const wishlist = await Wishlist.create({
        name,
        privacy: privacy || 'private',
        category: category || 'general',
        owner: req.user.id,
        items: []
      });

      // Populate owner before returning
      const populatedWishlist = await Wishlist.findById(wishlist._id)
        .populate('owner', 'fullName username profileImage');

      res.status(201).json({
        success: true,
        wishlist: populatedWishlist,
        itemsCreated: 0
      });
    }
  } catch (error) {
    // Note: session cleanup is handled in the transaction block above

    console.error('Create Wishlist Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create wishlist',
      error: error.message
    });
  }
};

exports.getMyWishlists = async (req, res) => {
  try {
    const wishlists = await Wishlist.find({ owner: req.user.id })
      .populate({
        path: 'items',
        select: '-reservedUntil -reservationReminderSent',
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
          select: 'fullName username profileImage'
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

    // Get all item IDs from this wishlist
    const itemIds = wishlist.items.map(item => item._id);

    // Fetch all active reservations for items in this wishlist
    const reservations = await Reservation.find({
      item: { $in: itemIds },
      status: 'reserved'
    }).populate('reserver', 'fullName username profileImage');

    // Create a map of itemId -> reservation info for quick lookup
    const reservationMap = new Map();
    reservations.forEach(reservation => {
      const itemId = reservation.item.toString();
      if (!reservationMap.has(itemId)) {
        reservationMap.set(itemId, {
          totalReserved: 0,
          reservedByMe: false,
          reservers: []
        });
      }
      const resInfo = reservationMap.get(itemId);
      resInfo.totalReserved += reservation.quantity;
      if (reservation.reserver._id.toString() === viewerId) {
        resInfo.reservedByMe = true;
      }
      resInfo.reservers.push({
        _id: reservation.reserver._id,
        fullName: reservation.reserver.fullName,
        username: reservation.reserver.username,
        profileImage: reservation.reserver.profileImage,
        quantity: reservation.quantity
      });
    });

    // Add item status based on viewer perspective
    const itemsWithStatus = wishlist.items.map(item => {
      const itemObj = item.toObject();
      const itemId = item._id.toString();
      
      // Get reservation info for this item (default if no reservations)
      const resInfo = reservationMap.get(itemId) || {
        totalReserved: 0,
        reservedByMe: false,
        reservers: []
      };

      let itemStatus;

      // Check if item is purchased
      if (itemObj.isPurchased) {
        itemStatus = 'gifted'; // Purchased/received
      } else if (resInfo.totalReserved > 0) {
        // Item has active reservations
        itemStatus = 'reserved'; // Both owner and guests see 'reserved' if totalReserved > 0
      } else {
        // Not reserved at all
        itemStatus = 'available';
      }

      // Original reserved status: owner = any reservation; guest = reserved by others only
      const originalIsReserved = isOwner
        ? resInfo.totalReserved > 0
        : resInfo.totalReserved > 0 && !resInfo.reservedByMe;
      const isReservedByMeVal = isOwner ? false : resInfo.reservedByMe;
      // isReserved MUST be true whenever isReservedByMe is true
      const isReserved = originalIsReserved || isReservedByMeVal;

      // Build response based on viewer type
      const baseItem = {
        ...itemObj,
        itemStatus,
        availableQuantity: Math.max(0, item.quantity - resInfo.totalReserved), // Owner now sees actual available quantity
        isReservedByMe: isReservedByMeVal,
        isReserved,
      };

      // Add reservation details only for guests (not for owner - privacy protection)
      if (!isOwner) {
        baseItem.totalReserved = resInfo.totalReserved;
        baseItem.remainingQuantity = Math.max(0, item.quantity - resInfo.totalReserved);
        // Note: reservers array is not included in response for privacy
      } else {
        // Owner sees totalReserved count but NOT reserver details
        baseItem.totalReserved = resInfo.totalReserved;
      }

      // Privacy: only the guest who reserved (isReservedByMe) may see reservedUntil / reservationReminderSent
      if (!isReservedByMeVal) {
        baseItem.reservedUntil = null;
        baseItem.reservationReminderSent = false;
      }

      return baseItem;
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
        message: req.t('validation.val_user_id_required')
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