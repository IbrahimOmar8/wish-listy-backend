const mongoose = require('mongoose');
const User = require('../models/User');
const FriendRequest = require('../models/FriendRequest');
const Wishlist = require('../models/Wishlist');
const Item = require('../models/Item');
const Reservation = require('../models/Reservation');
const Report = require('../models/Report');

/**
 * POST /api/users/block/:id
 * Block a user. Cleans up friendship, friend requests, and reservations (blocker's reservations on blocked user's wishlist items).
 */
exports.blockUser = async (req, res) => {
  const currentUserId = req.user.id;
  const targetId = req.params.id;
  let session;

  try {
    if (targetId === currentUserId) {
      return res.status(400).json({
        success: false,
        message: 'You cannot block yourself'
      });
    }

    const targetUser = await User.findById(targetId).select('_id');
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const currentUser = await User.findById(currentUserId).select('blockedUsers');
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'Current user not found'
      });
    }

    const blockedIds = (currentUser.blockedUsers || []).map(b => b.toString());
    if (blockedIds.includes(targetId)) {
      return res.status(400).json({
        success: false,
        message: 'User is already blocked'
      });
    }

    session = await mongoose.startSession();
    session.startTransaction();

    // 1. Friendship: remove from both users' friends arrays
    await User.findByIdAndUpdate(
      currentUserId,
      { $pull: { friends: targetId } },
      { session }
    );
    await User.findByIdAndUpdate(
      targetId,
      { $pull: { friends: currentUserId } },
      { session }
    );

    // 2. FriendRequest: delete any request between the two users
    await FriendRequest.deleteMany(
      {
        $or: [
          { from: currentUserId, to: targetId },
          { from: targetId, to: currentUserId }
        ]
      },
      { session }
    );

    // 3. Reservations: cancel blocker's reservations on blocked user's wishlist items
    const targetWishlists = await Wishlist.find({ owner: targetId }).select('_id').session(session);
    const targetWishlistIds = targetWishlists.map(w => w._id);
    if (targetWishlistIds.length > 0) {
      const itemsInTargetWishlists = await Item.find({ wishlist: { $in: targetWishlistIds } }).select('_id').session(session);
      const itemIds = itemsInTargetWishlists.map(i => i._id);
      if (itemIds.length > 0) {
        await Reservation.updateMany(
          { item: { $in: itemIds }, reserver: currentUserId, status: 'reserved' },
          { $set: { status: 'cancelled' } },
          { session }
        );
      }
    }

    // 4. Add target to current user's blockedUsers
    await User.findByIdAndUpdate(
      currentUserId,
      { $addToSet: { blockedUsers: targetId } },
      { session }
    );

    await session.commitTransaction();
    await session.endSession();

    res.status(200).json({
      success: true,
      message: 'User blocked'
    });
  } catch (error) {
    if (session && session.inTransaction()) {
      await session.abortTransaction();
    }
    if (session) {
      await session.endSession();
    }
    console.error('Block user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to block user',
      error: error.message
    });
  }
};

/**
 * POST /api/users/unblock/:id
 */
exports.unblockUser = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const targetId = req.params.id;

    const currentUser = await User.findById(currentUserId).select('blockedUsers');
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const blockedIds = (currentUser.blockedUsers || []).map(b => b.toString());
    if (!blockedIds.includes(targetId)) {
      return res.status(400).json({
        success: false,
        message: 'User is not blocked'
      });
    }

    await User.findByIdAndUpdate(currentUserId, { $pull: { blockedUsers: targetId } });

    res.status(200).json({
      success: true,
      message: 'User unblocked'
    });
  } catch (error) {
    console.error('Unblock user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to unblock user',
      error: error.message
    });
  }
};

/**
 * GET /api/users/blocked
 */
exports.getBlockedUsers = async (req, res) => {
  try {
    const currentUserId = req.user.id;

    const user = await User.findById(currentUserId)
      .select('blockedUsers')
      .populate('blockedUsers', '_id fullName username handle profileImage');

    const blocked = user && user.blockedUsers ? user.blockedUsers : [];

    res.status(200).json({
      success: true,
      data: blocked
    });
  } catch (error) {
    console.error('Get blocked users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get blocked users',
      error: error.message
    });
  }
};

/**
 * POST /api/users/report/:id
 */
exports.reportUser = async (req, res) => {
  try {
    const reporterId = req.user.id;
    const reportedId = req.params.id;
    const { reason } = req.body;

    if (reportedId === reporterId) {
      return res.status(400).json({
        success: false,
        message: 'You cannot report yourself'
      });
    }

    const reportedUser = await User.findById(reportedId).select('_id');
    if (!reportedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    await Report.create({
      reporter: reporterId,
      reported: reportedId,
      reason: reason != null ? String(reason).trim() : ''
    });

    res.status(201).json({
      success: true,
      message: 'Report submitted'
    });
  } catch (error) {
    console.error('Report user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit report',
      error: error.message
    });
  }
};
