const Reservation = require('../models/Reservation');
const Item = require('../models/Item');
const Wishlist = require('../models/Wishlist');
const { createNotification } = require('../utils/notificationHelper');

/**
 * Toggle reservation (Reserve/Unreserve) for an item
 * PUT /api/items/:itemId/reserve
 * Body: { quantity: 1, action: "reserve" | "cancel" } 
 *       - action is optional: if not provided, will toggle based on current status
 *       - quantity is optional: defaults to 1
 */
exports.reserveItem = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { quantity = 1, action } = req.body;
    const reserverId = req.user.id;

    // Validate quantity
    if (quantity < 1) {
      return res.status(400).json({
        success: false,
        message: req.t('validation.val_quantity_min', { min: 1 }),
      });
    }

    // Validate action if provided
    if (action && !['reserve', 'cancel'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: req.t('validation.val_action_invalid', { action1: 'reserve', action2: 'cancel' }),
      });
    }

    // Get item with wishlist and owner info
    const item = await Item.findById(itemId).populate({
      path: 'wishlist',
      select: 'owner name _id',
      populate: { path: 'owner', select: 'fullName username' },
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found',
      });
    }

    // Prevent owner from reserving their own items
    if (item.wishlist.owner._id.toString() === reserverId) {
      return res.status(403).json({
        success: false,
        message: 'You cannot reserve your own items',
      });
    }

    // Check if item is already received (owner marked as received)
    if (item.isReceived) {
      return res.status(400).json({
        success: false,
        message: 'Cannot reserve an item that has been received',
      });
    }

    // Check if user already has a reservation for this item
    let reservation = await Reservation.findOne({
      item: itemId,
      reserver: reserverId,
    });

    // Determine action: if action is provided, use it. Otherwise, toggle based on current status.
    let shouldReserve;
    if (action) {
      shouldReserve = action === 'reserve';
    } else {
      // Toggle: if reservation exists and is active, cancel. Otherwise, reserve.
      shouldReserve = !(reservation && reservation.status === 'reserved');
    }

    // Cancel reservation
    if (!shouldReserve) {
      if (!reservation || reservation.status === 'cancelled') {
        return res.status(400).json({
          success: false,
          message: 'No active reservation found to cancel',
        });
      }

      reservation.status = 'cancelled';
      await reservation.save();

      return res.status(200).json({
        success: true,
        message: 'Reservation cancelled successfully',
        data: {
          reservation: {
            id: reservation._id,
            item: itemId,
            quantity: reservation.quantity,
            status: reservation.status,
          },
          isReserved: false,
        },
      });
    }

    // Reserve: Create new reservation or reactivate cancelled one
    // Calculate total reserved quantity (excluding current user's cancelled reservation)
    const existingReservations = await Reservation.find({
      item: itemId,
      status: 'reserved',
    });

    const totalReserved = existingReservations.reduce(
      (sum, res) => {
        // Exclude current user's reservation if we're updating it
        if (reservation && res.reserver.toString() === reserverId && res._id.toString() === reservation._id.toString()) {
          return sum;
        }
        return sum + res.quantity;
      },
      0
    );

    // Check if there's enough quantity available (only for reserve action)
    if (shouldReserve) {
      const availableQuantity = item.quantity - totalReserved;

      if (quantity > availableQuantity) {
        return res.status(400).json({
          success: false,
          message: `Only ${availableQuantity} unit(s) available for reservation`,
        });
      }
    }

    if (reservation && reservation.status === 'cancelled') {
      // Reactivate cancelled reservation
      reservation.status = 'reserved';
      reservation.quantity = quantity;
      await reservation.save();
    } else if (!reservation) {
      // Create new reservation
      reservation = await Reservation.create({
        item: itemId,
        reserver: reserverId,
        quantity,
      });
    } else {
      // Update existing reservation quantity
      reservation.quantity = quantity;
      await reservation.save();
    }

    // Create notification for the item owner (without revealing who reserved it - privacy protection)
    // Ensure we get wishlist ID correctly (handle both populated object and ObjectId)
    let wishlistId;
    if (item.wishlist && typeof item.wishlist === 'object' && item.wishlist._id) {
      wishlistId = item.wishlist._id;
    } else if (item.wishlist) {
      wishlistId = item.wishlist; // It's already an ObjectId
    } else {
      // Fallback: get wishlist from item directly if not populated
      const itemWithWishlist = await Item.findById(itemId).select('wishlist').lean();
      wishlistId = itemWithWishlist?.wishlist;
    }
    
    if (!wishlistId) {
      console.error('Warning: Could not find wishlistId for item:', itemId);
    }
    
    await createNotification({
      recipientId: item.wishlist.owner._id,
      senderId: null, // Don't reveal sender for privacy
      type: 'item_reserved',
      title: 'Item Reserved',
      messageKey: 'notif.item_reserved', // Use translation key for dynamic localization
      messageVariables: {}, // No variables needed for this message
      relatedId: itemId,
      relatedWishlistId: wishlistId, // Critical for smart navigation on frontend
      emitSocketEvent: true,
      socketIo: req.app.get('io')
    });

    return res.status(200).json({
      success: true,
      message: 'Item reserved successfully',
      data: {
        reservation: {
          id: reservation._id,
          item: itemId,
          quantity: reservation.quantity,
          status: reservation.status,
        },
        isReserved: true,
      },
    });
  } catch (error) {
    console.error('Toggle reservation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to toggle reservation',
      error: error.message,
    });
  }
};

/**
 * Cancel a reservation
 * DELETE /api/items/:itemId/reserve
 */
exports.cancelReservation = async (req, res) => {
  try {
    const { itemId } = req.params;
    const reserverId = req.user.id;

    const reservation = await Reservation.findOne({
      item: itemId,
      reserver: reserverId,
    });

    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: 'Reservation not found',
      });
    }

    if (reservation.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Reservation already cancelled',
      });
    }

    reservation.status = 'cancelled';
    await reservation.save();

    // Get item with wishlist to notify owner
    const item = await Item.findById(itemId).populate({
      path: 'wishlist',
      select: 'owner _id',
      populate: { path: 'owner', select: '_id' }
    });

    // Create notification for the item owner when reservation is cancelled
    if (item && item.wishlist && item.wishlist.owner) {
      // Ensure we get wishlist ID correctly (handle both populated object and ObjectId)
      let wishlistId;
      if (item.wishlist && typeof item.wishlist === 'object' && item.wishlist._id) {
        wishlistId = item.wishlist._id;
      } else if (item.wishlist) {
        wishlistId = item.wishlist; // It's already an ObjectId
      }
      
      if (wishlistId) {
        await createNotification({
          recipientId: item.wishlist.owner._id,
          senderId: null, // Don't reveal sender for privacy
          type: 'item_unreserved',
          title: 'Item Available',
          messageKey: 'notif.item_unreserved', // Use translation key for dynamic localization
          messageVariables: {}, // No variables needed for this message
          relatedId: itemId,
          relatedWishlistId: wishlistId, // Critical for smart navigation on frontend
          emitSocketEvent: true,
          socketIo: req.app.get('io')
        });
      } else {
        console.error('Warning: Could not find wishlistId for item:', itemId);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Reservation cancelled successfully',
    });
  } catch (error) {
    console.error('Cancel reservation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to cancel reservation',
      error: error.message,
    });
  }
};

/**
 * Get my reservations
 * GET /api/reservations
 */
exports.getMyReservations = async (req, res) => {
  try {
    const reserverId = req.user.id;
    const { status = 'reserved' } = req.query;

    const reservations = await Reservation.find({
      reserver: reserverId,
      status,
    })
      .populate({
        path: 'item',
        select: 'name description image url priority isReceived reservedBy',
        populate: {
          path: 'wishlist',
          select: 'name owner',
          populate: {
            path: 'owner',
            select: 'fullName username profileImage',
          },
        },
      })
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: {
        reservations,
        count: reservations.length,
      },
    });
  } catch (error) {
    console.error('Get reservations error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get reservations',
      error: error.message,
    });
  }
};
