const FriendRequest = require('../models/FriendRequest');
const User = require('../models/User');

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

    // Emit socket event if io is available
    if (req.app.get('io')) {
      req.app.get('io').to(toUserId).emit('friend_request', {
        requestId: friendRequest._id,
        from: friendRequest.from,
        message: `${friendRequest.from.fullName} sent you a friend request`
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

      // Emit socket event if io is available
      if (req.app.get('io')) {
        req.app.get('io').to(friendRequest.from._id.toString()).emit('friend_request_accepted', {
          requestId: friendRequest._id,
          user: friendRequest.to,
          message: `${friendRequest.to.fullName} accepted your friend request`
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

      // Emit socket event if io is available
      if (req.app.get('io')) {
        req.app.get('io').to(friendRequest.from._id.toString()).emit('friend_request_rejected', {
          requestId: friendRequest._id,
          message: 'Your friend request was rejected'
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
