const Reservation = require('../models/Reservation');
const Item = require('../models/Item');
const Wishlist = require('../models/Wishlist');
const Notification = require('../models/Notification');
const { emitToUser } = require('../socket');

/**
 * Reserve an item from a friend's wishlist
 * POST /api/items/:itemId/reserve
 */
exports.reserveItem = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { quantity = 1 } = req.body;
    const reserverId = req.user.id;

    // Validate quantity
    if (quantity < 1) {
      return res.status(400).json({
        success: false,
        message: 'Quantity must be at least 1',
      });
    }

    // Get item with wishlist and owner info
    const item = await Item.findById(itemId).populate({
      path: 'wishlist',
      select: 'owner name',
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

    // Calculate total reserved quantity
    const existingReservations = await Reservation.find({
      item: itemId,
      status: 'reserved',
    });

    const totalReserved = existingReservations.reduce(
      (sum, res) => sum + res.quantity,
      0
    );

    // Check if there's enough quantity available
    const availableQuantity = item.quantity - totalReserved;

    if (quantity > availableQuantity) {
      return res.status(400).json({
        success: false,
        message: `Only ${availableQuantity} unit(s) available for reservation`,
      });
    }

    // Check if user already has a reservation for this item
    let reservation = await Reservation.findOne({
      item: itemId,
      reserver: reserverId,
    });

    if (reservation) {
      // Update existing reservation
      if (reservation.status === 'cancelled') {
        reservation.status = 'reserved';
        reservation.quantity = quantity;
      } else {
        // Check if updating quantity would exceed available
        const otherReservations = totalReserved - reservation.quantity;
        if (otherReservations + quantity > item.quantity) {
          return res.status(400).json({
            success: false,
            message: `Only ${
              item.quantity - otherReservations
            } unit(s) available for reservation`,
          });
        }
        reservation.quantity = quantity;
      }
      await reservation.save();
    } else {
      // Create new reservation
      reservation = await Reservation.create({
        item: itemId,
        reserver: reserverId,
        quantity,
      });
    }

    // Create notification for the item owner (without revealing who reserved it)
    const notification = await Notification.create({
      user: item.wishlist.owner._id,
      type: 'item_reserved',
      title: 'Item Reserved',
      message: `Someone has reserved "${item.name}" from your wishlist "${item.wishlist.name}"`,
      relatedId: itemId,
    });

    // Emit real-time notification to owner
    const unreadCount = await Notification.countDocuments({
      user: item.wishlist.owner._id,
      isRead: false,
    });

    emitToUser(item.wishlist.owner._id.toString(), 'item_reserved', {
      notification: await notification.populate('relatedUser', 'fullName username profileImage'),
      unreadCount,
    });

    return res.status(201).json({
      success: true,
      message: 'Item reserved successfully',
      data: {
        reservation: {
          id: reservation._id,
          item: itemId,
          quantity: reservation.quantity,
          status: reservation.status,
        },
      },
    });
  } catch (error) {
    console.error('Reserve item error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reserve item',
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
