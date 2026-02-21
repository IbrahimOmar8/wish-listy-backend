const mongoose = require('mongoose');
const FriendRequest = require('../models/FriendRequest');
const User = require('../models/User');
const Notification = require('../models/Notification');
const Wishlist = require('../models/Wishlist');
const Event = require('../models/Event');
const EventInvitation = require('../models/Eventinvitation');
const Item = require('../models/Item');
const Reservation = require('../models/Reservation');
const { createNotification, getUnreadCountWithBadge } = require('../utils/notificationHelper');

// Send friend request
exports.sendFriendRequest = async (req, res) => {
  try {
    const { toUserId } = req.body;
    const fromUserId = req.user.id;

    // Validation: Check if toUserId is provided
    if (!toUserId) {
      return res.status(400).json({
        success: false,
        message: req.t('validation.val_recipient_id_required')
      });
    }

    // Validation: Cannot send request to self
    if (fromUserId === toUserId) {
      return res.status(400).json({
        success: false,
        message: 'You cannot send a friend request to yourself'
      });
    }

    // Check if recipient exists
    const toUser = await User.findById(toUserId);
    if (!toUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if already friends
    const currentUser = await User.findById(fromUserId);
    if (currentUser.friends.includes(toUserId)) {
      return res.status(400).json({
        success: false,
        message: 'You are already friends with this user'
      });
    }

    // Check if pending request already exists (either direction)
    const existingRequest = await FriendRequest.findOne({
      $or: [
        { from: fromUserId, to: toUserId, status: 'pending' },
        { from: toUserId, to: fromUserId, status: 'pending' }
      ]
    });

    if (existingRequest) {
      return res.status(400).json({
        success: false,
        message: 'A pending friend request already exists between you and this user'
      });
    }

    // Create new friend request
    const friendRequest = await FriendRequest.create({
      from: fromUserId,
      to: toUserId
    });

    // Populate the from user data for response
    await friendRequest.populate('from', '_id fullName username profileImage');
    await friendRequest.populate('to', '_id fullName username profileImage');

    // 🚀 DEBUG: Friend Request Notification Flow
    console.log('═══════════════════════════════════════════════════════');
    console.log('🚀 FRIEND REQUEST NOTIFICATION DEBUG');
    console.log('📤 From User ID:', fromUserId);
    console.log('📥 To User ID (Recipient):', toUserId);
    console.log('🆔 Friend Request ID:', friendRequest._id);
    console.log('═══════════════════════════════════════════════════════');

    // Create notification for the receiver with dynamic localization
    // Note: relatedId (friendRequest._id) will be available as data.relatedId (requestId)
    //       and senderId (fromUserId) will be available as data.relatedUser._id (senderId)
    await createNotification({
      recipientId: toUserId,
      senderId: fromUserId, // This becomes data.relatedUser._id (senderId) in notification
      type: 'friend_request',
      title: 'New Friend Request',
      messageKey: 'notif.friend_request',
      messageVariables: {
        senderName: friendRequest.from.fullName
      },
      relatedId: friendRequest._id, // This becomes data.relatedId (requestId) in notification
      emitSocketEvent: true,
      socketIo: req.app.get('io')
    });

    // Socket event is now handled by createNotification helper

    res.status(201).json({
      success: true,
      message: 'Friend request sent successfully',
      data: friendRequest
    });
  } catch (error) {
    console.error('Send friend request error:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending friend request',
      error: error.message
    });
  }
};

// Get incoming friend requests
exports.getFriendRequests = async (req, res) => {
  try {
    const userId = req.user.id;

    const requests = await FriendRequest.find({
      to: userId,
      status: 'pending'
    })
      .populate('from', '_id fullName username profileImage')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: requests.length,
      data: requests
    });
  } catch (error) {
    console.error('Get friend requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching friend requests',
      error: error.message
    });
  }
};

// Respond to friend request (accept or reject)
exports.respondToFriendRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body;
    const userId = req.user.id;

    // Validate action
    if (!action || !['accept', 'reject'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: req.t('validation.val_action_invalid', { action1: 'accept', action2: 'reject' })
      });
    }

    // Find the friend request
    const friendRequest = await FriendRequest.findById(id)
      .populate('from', '_id fullName username profileImage')
      .populate('to', '_id fullName username profileImage');

    if (!friendRequest) {
      return res.status(404).json({
        success: false,
        message: 'Friend request not found'
      });
    }

    // Verify that the current user is the receiver
    if (friendRequest.to._id.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to respond to this request'
      });
    }

    // Check if request is still pending
    if (friendRequest.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `This request has already been ${friendRequest.status}`
      });
    }

    if (action === 'accept') {
      // Update request status
      friendRequest.status = 'accepted';
      await friendRequest.save();

      // Add each user to the other's friends array
      await User.findByIdAndUpdate(
        friendRequest.from._id,
        { $addToSet: { friends: friendRequest.to._id } }
      );
      await User.findByIdAndUpdate(
        friendRequest.to._id,
        { $addToSet: { friends: friendRequest.from._id } }
      );

      // Create notification for the sender with dynamic localization
      await createNotification({
        recipientId: friendRequest.from._id,
        senderId: friendRequest.to._id,
        type: 'friend_request_accepted',
        title: 'Friend Request Accepted',
        messageKey: 'notif.friend_request_accepted',
        messageVariables: {
          senderName: friendRequest.to.fullName
        },
        relatedId: friendRequest._id,
        emitSocketEvent: true,
        socketIo: req.app.get('io')
      });

      // Permanently delete the "friend request" notification so it no longer appears in the feed
      // and User B cannot accidentally click "Accept" again. Targets only this specific notification
      // (relatedId + user) to avoid affecting other pending friend requests for User B.
      await Notification.deleteMany({
        type: 'friend_request',
        relatedId: friendRequest._id,
        user: friendRequest.to._id,
        relatedUser: friendRequest.from._id
      });
      const receiverUnreadCount = await getUnreadCountWithBadge(friendRequest.to._id);
      if (req.app.get('io')) {
        req.app.get('io').to(friendRequest.to._id.toString()).emit('unread_count_update', { unreadCount: receiverUnreadCount });
      }

      res.status(200).json({
        success: true,
        message: 'Friend request accepted',
        data: friendRequest
      });
    } else {
      // Reject the request
      friendRequest.status = 'rejected';
      await friendRequest.save();

      // Note: No notification created for rejected requests (by design)
      // Only Socket.IO event is sent for real-time updates

      // Permanently delete the "friend request" notification so it no longer appears in the feed.
      await Notification.deleteMany({
        type: 'friend_request',
        relatedId: friendRequest._id,
        user: friendRequest.to._id,
        relatedUser: friendRequest.from._id
      });
      const receiverUnreadCount = await getUnreadCountWithBadge(friendRequest.to._id);
      if (req.app.get('io')) {
        req.app.get('io').to(friendRequest.to._id.toString()).emit('unread_count_update', { unreadCount: receiverUnreadCount });
      }

      // Calculate sender's current unreadCount with badge dismissal logic (for consistency, even though no notification was created)
      const unreadCount = await getUnreadCountWithBadge(friendRequest.from._id);

      // Emit socket event if io is available
      if (req.app.get('io')) {
        req.app.get('io').to(friendRequest.from._id.toString()).emit('friend_request_rejected', {
          requestId: friendRequest._id,
          message: 'Your friend request was rejected',
          unreadCount
        });
      }

      res.status(200).json({
        success: true,
        message: 'Friend request rejected',
        data: friendRequest
      });
    }
  } catch (error) {
    console.error('Respond to friend request error:', error);
    res.status(500).json({
      success: false,
      message: 'Error responding to friend request',
      error: error.message
    });
  }
};

// Get my friends list
exports.getMyFriends = async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 100, page = 1 } = req.query;

    // Get current user to access friends array; exclude blocked users from friends list
    const currentUser = await User.findById(userId).select('friends blockedUsers');

    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const blockedIds = (currentUser.blockedUsers || []).map(b => b.toString());
    const allowedFriendIds = (currentUser.friends || []).filter(
      fid => !blockedIds.includes(fid.toString())
    );

    const totalFriends = allowedFriendIds.length;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get friends with pagination and sorting
    const friends = await User.find({
      _id: { $in: allowedFriendIds }
    })
      .select('_id fullName username handle profileImage')
      .sort({ fullName: 1 }) // Sort alphabetically by name
      .skip(skip)
      .limit(parseInt(limit));

    // Get wishlist counts for all friends in parallel
    const friendIds = friends.map(friend => friend._id);
    const wishlistCounts = await Wishlist.aggregate([
      {
        $match: {
          owner: { $in: friendIds },
          privacy: { $in: ['public', 'friends'] }
        }
      },
      {
        $group: {
          _id: '$owner',
          count: { $sum: 1 }
        }
      }
    ]);

    // Create a map for quick lookup
    const wishlistCountMap = new Map();
    wishlistCounts.forEach(item => {
      wishlistCountMap.set(item._id.toString(), item.count);
    });

    // Enrich friends with wishlist count
    const enrichedFriends = friends.map(friend => ({
      _id: friend._id,
      fullName: friend.fullName,
      username: friend.username,
      handle: friend.handle || friend.username, // Fallback to username if handle doesn't exist
      profileImage: friend.profileImage,
      wishlistCount: wishlistCountMap.get(friend._id.toString()) || 0
    }));

    res.status(200).json({
      success: true,
      count: enrichedFriends.length,
      total: totalFriends,
      page: parseInt(page),
      limit: parseInt(limit),
      data: enrichedFriends
    });
  } catch (error) {
    console.error('Get my friends error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching friends',
      error: error.message
    });
  }
};

// Get friend suggestions (people you may know) - Optimized with Aggregation Pipeline
exports.getFriendSuggestions = async (req, res) => {
  try {
    const userId = req.user.id;

    // Step 1: Get current user's friends, dismissed suggestions, and blocked users
    const currentUser = await User.findById(userId)
      .select('friends dismissedSuggestions blockedUsers');
    
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const userFriends = currentUser.friends.map(f => f.toString());
    const userFriendsObjIds = currentUser.friends.map(f => new mongoose.Types.ObjectId(f));
    const dismissedUserIds = currentUser.dismissedSuggestions?.map(d => d.userId.toString()) || [];
    const blockedUserIds = (currentUser.blockedUsers || []).map(b => b.toString());

    // Step 2: Get all pending/accepted requests involving the user
    const existingRequests = await FriendRequest.find({
      $or: [
        { from: userId },
        { to: userId }
      ],
      status: { $in: ['pending', 'accepted'] }
    }).select('from to');

    // Build excluded user IDs set (self, friends, dismissed, blocked)
    const excludedUserIds = new Set([
      userId,
      ...userFriends,
      ...dismissedUserIds,
      ...blockedUserIds
    ]);
    
    existingRequests.forEach(req => {
      excludedUserIds.add(req.from.toString());
      excludedUserIds.add(req.to.toString());
    });

    const excludedIdsArray = Array.from(excludedUserIds);
    const formattedExcludedIds = excludedIdsArray.map(id => new mongoose.Types.ObjectId(id.toString()));

    // Step 3: Use MongoDB Aggregation Pipeline for efficient mutual friends calculation
    const suggestions = await User.aggregate([
      // Stage 1: Filter out excluded users (ObjectIds only so $nin matches _id type)
      {
        $match: {
          _id: { $nin: formattedExcludedIds }
        }
      },
      
      // Stage 2: Project necessary fields
      {
        $project: {
          _id: 1,
          fullName: 1,
          username: 1,
          profileImage: 1,
          friends: 1
        }
      },
      
      // Stage 3: Calculate mutual friends (IDs and count) using $setIntersection
      {
        $addFields: {
          mutualFriendIds: {
            $setIntersection: [
              { $ifNull: ['$friends', []] },
              userFriendsObjIds
            ]
          }
        }
      },
      {
        $addFields: {
          mutualFriendsCount: { $size: '$mutualFriendIds' }
        }
      },
      
      // Stage 4: FILTER - Exclude candidates with 0 mutual friends (CRITICAL)
      {
        $match: {
          mutualFriendsCount: { $gt: 0 }
        }
      },
      
      // Stage 5: Sort by mutual friends count (descending)
      {
        $sort: { mutualFriendsCount: -1 }
      },
      
      // Stage 6: Limit to top 50 candidates
      {
        $limit: 50
      },
      
      // Stage 7: Slice up to 3 IDs for preview
      {
        $addFields: {
          previewIds: { $slice: ['$mutualFriendIds', 3] }
        }
      },
      
      // Stage 8: Lookup preview users (_id, fullName, profileImage)
      {
        $lookup: {
          from: 'users',
          let: { ids: '$previewIds' },
          pipeline: [
            { $match: { $expr: { $in: ['$_id', '$$ids'] } } },
            { $project: { _id: 1, fullName: 1, profileImage: 1 } }
          ],
          as: 'preview'
        }
      },
      
      // Stage 9: Project final fields with mutualFriendsData
      {
        $project: {
          _id: 1,
          fullName: 1,
          username: 1,
          avatar: '$profileImage',
          mutualFriendsCount: 1,
          mutualFriendsData: {
            totalCount: '$mutualFriendsCount',
            preview: '$preview'
          }
        }
      }
    ]);

    // Step 4: Randomize - Randomly select 20 from top 50 (if available)
    // Edge case: If list is empty (new user, no connections), return empty array
    let finalSuggestions = [];
    if (suggestions.length > 0) {
      const shuffled = suggestions.sort(() => Math.random() - 0.5);
      finalSuggestions = shuffled.slice(0, 20);
    }

    res.status(200).json({
      success: true,
      data: finalSuggestions
    });
  } catch (error) {
    console.error('Get friend suggestions error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching friend suggestions',
      error: error.message
    });
  }
};

// Dismiss friend suggestion
exports.dismissSuggestion = async (req, res) => {
  try {
    const userId = req.user.id;
    const { targetUserId } = req.body;

    // Validation: Check if targetUserId is provided
    if (!targetUserId) {
      return res.status(400).json({
        success: false,
        message: 'Target user ID is required'
      });
    }

    // Validation: Cannot dismiss yourself
    if (userId === targetUserId) {
      return res.status(400).json({
        success: false,
        message: 'You cannot dismiss yourself'
      });
    }

    // Check if target user exists
    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'Target user not found'
      });
    }

    // Get current user
    const currentUser = await User.findById(userId);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'Current user not found'
      });
    }

    // Check if already dismissed
    const alreadyDismissed = currentUser.dismissedSuggestions?.some(
      d => d.userId.toString() === targetUserId
    );

    if (alreadyDismissed) {
      return res.status(200).json({
        success: true,
        message: 'Suggestion already dismissed'
      });
    }

    // Add to dismissed suggestions (permanent dismissal)
    await User.findByIdAndUpdate(
      userId,
      {
        $push: {
          dismissedSuggestions: {
            userId: targetUserId,
            dismissedAt: new Date()
          }
        }
      }
    );

    res.status(200).json({
      success: true,
      message: 'Suggestion dismissed successfully'
    });
  } catch (error) {
    console.error('Dismiss suggestion error:', error);
    res.status(500).json({
      success: false,
      message: 'Error dismissing suggestion',
      error: error.message
    });
  }
};

// Cancel friend request (for outgoing requests)
exports.cancelFriendRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const currentUserId = req.user.id;

    // Validation: Check if requestId is provided
    if (!requestId) {
      return res.status(400).json({
        success: false,
        message: 'Request ID is required'
      });
    }

    // Find the friend request
    const friendRequest = await FriendRequest.findById(requestId);

    if (!friendRequest) {
      return res.status(404).json({
        success: false,
        message: 'Friend request not found'
      });
    }

    // Verify that the current user is the sender (only sender can cancel)
    if (friendRequest.from.toString() !== currentUserId) {
      return res.status(403).json({
        success: false,
        message: 'You can only cancel friend requests that you sent'
      });
    }

    // Check if request is still pending (can only cancel pending requests)
    if (friendRequest.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel a request that has already been ${friendRequest.status}`
      });
    }

    // Delete the friend request
    await FriendRequest.findByIdAndDelete(requestId);

    // Delete related notification if exists
    await Notification.deleteMany({
      type: 'friend_request',
      relatedId: requestId,
      user: friendRequest.to
    });

    // Emit socket event to notify the receiver (if connected)
    if (req.app.get('io')) {
      req.app.get('io').to(friendRequest.to.toString()).emit('friend_request_cancelled', {
        requestId: requestId,
        message: 'Friend request was cancelled'
      });
      const receiverUnreadCount = await getUnreadCountWithBadge(friendRequest.to);
      req.app.get('io').to(friendRequest.to.toString()).emit('unread_count_update', { unreadCount: receiverUnreadCount });
    }

    res.status(200).json({
      success: true,
      message: 'Friend request cancelled successfully'
    });
  } catch (error) {
    console.error('Cancel friend request error:', error);
    res.status(500).json({
      success: false,
      message: 'Error cancelling friend request',
      error: error.message
    });
  }
};

// Remove friend (Unfriend) - Cascading cleanup for Event Invitations, Reservations, Notifications
exports.removeFriend = async (req, res) => {
  const { friendId } = req.params;
  const currentUserId = req.user.id;
  let session;

  try {
    if (!friendId) {
      return res.status(400).json({
        success: false,
        message: 'Friend ID is required'
      });
    }

    if (currentUserId === friendId) {
      return res.status(400).json({
        success: false,
        message: 'You cannot unfriend yourself'
      });
    }

    const friend = await User.findById(friendId);
    if (!friend) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const currentUser = await User.findById(currentUserId).select('friends');
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'Current user not found'
      });
    }

    const friendIdString = friendId.toString();
    const isFriend = currentUser.friends.some(
      f => f.toString() === friendIdString
    );

    if (!isFriend) {
      return res.status(400).json({
        success: false,
        message: 'You are not friends with this user'
      });
    }

    session = await mongoose.startSession();
    session.startTransaction();

    // 1. Remove friend from both users' friends arrays (bidirectional)
    await User.findByIdAndUpdate(
      currentUserId,
      { $pull: { friends: friendId } },
      { session }
    );
    await User.findByIdAndUpdate(
      friendId,
      { $pull: { friends: currentUserId } },
      { session }
    );

    // 2. Update accepted friend requests between these users to 'rejected'
    await FriendRequest.updateMany(
      {
        $or: [
          { from: currentUserId, to: friendId },
          { from: friendId, to: currentUserId }
        ],
        status: 'accepted'
      },
      { status: 'rejected' },
      { session }
    );

    // 3. Event Invitations: Delete pending/accepted/maybe invitations between the two users
    await EventInvitation.deleteMany(
      {
        $or: [
          { inviter: currentUserId, invitee: friendId },
          { inviter: friendId, invitee: currentUserId }
        ],
        status: { $in: ['pending', 'accepted', 'maybe'] }
      },
      { session }
    );

    // Remove ex-friend from Event.invited_friends for events created by either user
    await Event.updateMany(
      { creator: currentUserId },
      { $pull: { invited_friends: { user: friendId } } },
      { session }
    );
    await Event.updateMany(
      { creator: friendId },
      { $pull: { invited_friends: { user: currentUserId } } },
      { session }
    );

    // 4. Gift Reservations: Cancel reservations where one reserved for the other (reserved only, not purchased)
    const userAWishlists = await Wishlist.find({ owner: currentUserId }).select('_id').session(session);
    const userBWishlists = await Wishlist.find({ owner: friendId }).select('_id').session(session);
    const userAWishlistIds = userAWishlists.map(w => w._id);
    const userBWishlistIds = userBWishlists.map(w => w._id);

    const itemsA = userAWishlistIds.length > 0
      ? await Item.find({ wishlist: { $in: userAWishlistIds }, isPurchased: false }).select('_id').session(session)
      : [];
    const itemsB = userBWishlistIds.length > 0
      ? await Item.find({ wishlist: { $in: userBWishlistIds }, isPurchased: false }).select('_id').session(session)
      : [];

    const itemIdsA = itemsA.map(i => i._id);
    const itemIdsB = itemsB.map(i => i._id);

    // Get item IDs that have reservations we're about to cancel (only those need Item cleanup)
    const affectedIds = [];
    if (itemIdsA.length > 0) {
      const rB = await Reservation.find({ item: { $in: itemIdsA }, reserver: friendId, status: 'reserved' }).select('item').session(session);
      affectedIds.push(...rB.map(r => r.item));
    }
    if (itemIdsB.length > 0) {
      const rA = await Reservation.find({ item: { $in: itemIdsB }, reserver: currentUserId, status: 'reserved' }).select('item').session(session);
      affectedIds.push(...rA.map(r => r.item));
    }

    // B reserved items on A's wishlists → cancel B's reservations
    if (itemIdsA.length > 0) {
      await Reservation.updateMany(
        { item: { $in: itemIdsA }, reserver: friendId, status: 'reserved' },
        { $set: { status: 'cancelled' } },
        { session }
      );
    }
    // A reserved items on B's wishlists → cancel A's reservations
    if (itemIdsB.length > 0) {
      await Reservation.updateMany(
        { item: { $in: itemIdsB }, reserver: currentUserId, status: 'reserved' },
        { $set: { status: 'cancelled' } },
        { session }
      );
    }

    // Clear Item.reservedUntil for items with no remaining active reservations
    const allAffectedItemIds = affectedIds;
    for (const itemId of allAffectedItemIds) {
      const otherActive = await Reservation.countDocuments({
        item: itemId,
        status: 'reserved'
      }).session(session);
      if (otherActive === 0) {
        await Item.findByIdAndUpdate(
          itemId,
          { reservedUntil: null, reservationReminderSent: false, extensionCount: 0 },
          { session }
        );
      }
    }

    // 5. Notifications: Delete notifications between the two users (event invites, reminders, friend requests)
    await Notification.deleteMany(
      {
        $or: [
          { user: currentUserId, relatedUser: friendId },
          { user: friendId, relatedUser: currentUserId }
        ]
      },
      { session }
    );

    await session.commitTransaction();
    await session.endSession();

    res.status(200).json({
      success: true,
      message: 'Friend removed successfully'
    });
  } catch (error) {
    if (session && session.inTransaction()) {
      await session.abortTransaction();
    }
    if (session) {
      await session.endSession();
    }
    console.error('Remove friend error:', error);
    res.status(500).json({
      success: false,
      message: 'Error removing friend',
      error: error.message
    });
  }
};
