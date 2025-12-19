const FriendRequest = require('../models/FriendRequest');
const User = require('../models/User');
const Notification = require('../models/Notification');
const Wishlist = require('../models/Wishlist');

// Helper function to calculate unreadCount with badge dismissal logic
const getUnreadCountWithBadge = async (userId) => {
  const user = await User.findById(userId).select('lastBadgeSeenAt');
  const query = {
    user: userId,
    isRead: false
  };
  if (user && user.lastBadgeSeenAt) {
    query.createdAt = { $gt: user.lastBadgeSeenAt };
  }
  return await Notification.countDocuments(query);
};

// Send friend request
exports.sendFriendRequest = async (req, res) => {
  try {
    const { toUserId } = req.body;
    const fromUserId = req.user.id;

    // Validation: Check if toUserId is provided
    if (!toUserId) {
      return res.status(400).json({
        success: false,
        message: 'Recipient user ID is required'
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

    // Create notification for the receiver
    await Notification.create({
      user: toUserId,
      type: 'friend_request',
      title: 'New Friend Request',
      message: `${friendRequest.from.fullName} sent you a friend request`,
      relatedUser: fromUserId,
      relatedId: friendRequest._id
    });

    // Calculate recipient's current unreadCount with badge dismissal logic
    const unreadCount = await getUnreadCountWithBadge(toUserId);

    // Emit socket event if io is available
    if (req.app.get('io')) {
      req.app.get('io').to(toUserId).emit('friend_request', {
        requestId: friendRequest._id,
        from: friendRequest.from,
        message: `${friendRequest.from.fullName} sent you a friend request`,
        unreadCount
      });
    }

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
        message: 'Action must be either "accept" or "reject"'
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

      // Create notification for the sender
      await Notification.create({
        user: friendRequest.from._id,
        type: 'friend_request_accepted',
        title: 'Friend Request Accepted',
        message: `${friendRequest.to.fullName} accepted your friend request`,
        relatedUser: friendRequest.to._id,
        relatedId: friendRequest._id
      });

      // Calculate sender's current unreadCount with badge dismissal logic
      const unreadCount = await getUnreadCountWithBadge(friendRequest.from._id);

      // Emit socket event if io is available
      if (req.app.get('io')) {
        req.app.get('io').to(friendRequest.from._id.toString()).emit('friend_request_accepted', {
          requestId: friendRequest._id,
          user: friendRequest.to,
          message: `${friendRequest.to.fullName} accepted your friend request`,
          unreadCount
        });
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

    // Get current user to access friends array
    const currentUser = await User.findById(userId).select('friends');

    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const totalFriends = currentUser.friends.length;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get friends with pagination and sorting
    const friends = await User.find({
      _id: { $in: currentUser.friends }
    })
      .select('_id fullName username profileImage')
      .sort({ fullName: 1 }) // Sort alphabetically by name
      .skip(skip)
      .limit(parseInt(limit));

    // Get wishlist counts for all friends in parallel
    const friendIds = friends.map(friend => friend._id);
    const wishlistCounts = await Wishlist.aggregate([
      {
        $match: {
          owner: { $in: friendIds }
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

// Get friend suggestions (people you may know)
exports.getFriendSuggestions = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get current user with friends
    const currentUser = await User.findById(userId).select('friends');
    const userFriends = currentUser.friends.map(f => f.toString());

    // Get all pending/accepted requests involving the user
    const existingRequests = await FriendRequest.find({
      $or: [
        { from: userId },
        { to: userId }
      ],
      status: { $in: ['pending', 'accepted'] }
    }).select('from to');

    // Extract user IDs to exclude
    const excludedUserIds = new Set([userId, ...userFriends]);
    existingRequests.forEach(req => {
      excludedUserIds.add(req.from.toString());
      excludedUserIds.add(req.to.toString());
    });

    // Get all users except excluded ones
    const candidates = await User.find({
      _id: { $nin: Array.from(excludedUserIds) }
    }).select('_id fullName username profileImage friends');

    // Calculate mutual friends count for each candidate
    const suggestions = candidates.map(candidate => {
      const candidateFriends = candidate.friends.map(f => f.toString());
      const mutualFriendsCount = userFriends.filter(friendId =>
        candidateFriends.includes(friendId)
      ).length;

      return {
        _id: candidate._id,
        fullName: candidate.fullName,
        username: candidate.username,
        profileImage: candidate.profileImage,
        mutualFriendsCount
      };
    });

    // Sort by mutual friends count (descending) and limit to 20
    suggestions.sort((a, b) => b.mutualFriendsCount - a.mutualFriendsCount);
    const topSuggestions = suggestions.slice(0, 20);

    res.status(200).json({
      success: true,
      count: topSuggestions.length,
      data: topSuggestions
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
