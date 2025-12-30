const User = require('../models/User');
const FriendRequest = require('../models/FriendRequest');
const Wishlist = require('../models/Wishlist');
const Event = require('../models/Event');

// Search users by username, email, or phone
exports.searchUsers = async (req, res) => {
  try {
    const { type, value } = req.query;
    const currentUserId = req.user._id;

    // Validate query parameters
    if (!type || !value) {
      return res.status(400).json({
        success: false,
        message: req.t('validation.val_search_params_required')
      });
    }

    if (!['username', 'email', 'phone'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: req.t('validation.val_search_type_invalid', { types: 'username, email, phone' })
      });
    }

    let searchQuery = {};

    // Build search query based on type
    if (type === 'username') {
      searchQuery.username = { $regex: `^${value}`, $options: 'i' };
    } else if (type === 'email') {
      searchQuery.email = { $regex: `^${value}`, $options: 'i' };
    } else if (type === 'phone') {
      searchQuery.phone = { $regex: `^${value}`, $options: 'i' };
    }

    // Exclude current user from search results
    searchQuery._id = { $ne: currentUserId };

    // Search users and return safe fields only
    const users = await User.find(searchQuery)
      .select('_id fullName username profileImage friends')
      .limit(20);

    // Get current user's friends list and friend requests
    const currentUser = await User.findById(currentUserId).select('friends');
    const friendIds = currentUser.friends.map(f => f.toString());

    // Get all pending friend requests involving current user
    const userIds = users.map(u => u._id.toString());
    const friendRequests = await FriendRequest.find({
      $or: [
        { from: currentUserId, to: { $in: userIds }, status: 'pending' },
        { from: { $in: userIds }, to: currentUserId, status: 'pending' }
      ]
    });

    // Create a map for quick lookup
    const requestMap = new Map();
    friendRequests.forEach(req => {
      const fromId = req.from.toString();
      const toId = req.to.toString();
      if (fromId === currentUserId.toString()) {
        // Current user sent request
        requestMap.set(toId, { 
          status: 'sent', 
          requestId: req._id,
          direction: 'sent' 
        });
      } else {
        // Current user received request
        requestMap.set(fromId, { 
          status: 'received', 
          requestId: req._id,
          direction: 'received' 
        });
      }
    });

    // Enrich users with friendship status
    const enrichedUsers = users.map(user => {
      const userId = user._id.toString();
      const isFriend = friendIds.includes(userId);
      const requestInfo = requestMap.get(userId);

      let friendshipStatus = 'none';
      let friendRequestId = null;
      let canSendRequest = true;

      if (isFriend) {
        friendshipStatus = 'friends';
        canSendRequest = false;
      } else if (requestInfo) {
        friendshipStatus = requestInfo.status;
        friendRequestId = requestInfo.requestId;
        canSendRequest = false;
      }

      return {
        _id: user._id,
        fullName: user.fullName,
        username: user.username,
        profileImage: user.profileImage,
        friendshipStatus,
        friendRequestId,
        isFriend,
        canSendRequest
      };
    });

    res.status(200).json({
      success: true,
      count: enrichedUsers.length,
      data: enrichedUsers
    });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({
      success: false,
      message: 'Error searching users',
      error: error.message
    });
  }
};

// Update user interests
exports.updateUserInterests = async (req, res) => {
  try {
    const { interests } = req.body;
    const userId = req.user.id;

    // Validate that interests is provided and is an array
    if (!Array.isArray(interests)) {
      return res.status(400).json({
        success: false,
        message: req.t('validation.val_interests_array')
      });
    }

    // Define valid interests enum
    const validInterests = [
      'Watches', 'Perfumes', 'Sneakers', 'Jewelry', 'Handbags', 'Makeup & Skincare',
      'Gadgets', 'Gaming', 'Photography', 'Home Decor', 'Plants', 
      'Coffee & Tea', 'Books', 'Fitness Gear', 'Car Accessories', 'Music Instruments', 'Art', 'DIY & Crafts'
    ];

    // Remove duplicates from the array
    const uniqueInterests = [...new Set(interests)];

    // Validate each interest against the enum list
    const invalidInterests = uniqueInterests.filter(interest => !validInterests.includes(interest));

    if (invalidInterests.length > 0) {
      return res.status(400).json({
        success: false,
        message: req.t('validation.val_interests_invalid', { interests: invalidInterests.map(i => `'${i}'`).join(', ') }),
        errors: invalidInterests
      });
    }

    // Update user's interests
    const user = await User.findByIdAndUpdate(
      userId,
      { interests: uniqueInterests },
      { new: true, runValidators: true }
    ).select('interests');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Interests updated successfully',
      data: {
        interests: user.interests
      }
    });
  } catch (error) {
    console.error('Update user interests error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating interests',
      error: error.message
    });
  }
};

// Get user profile by ID
exports.getUserProfile = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id)
      .select('_id fullName username profileImage friends createdAt');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Calculate related counts in parallel
    const [wishlistCount, eventsCount] = await Promise.all([
      Wishlist.countDocuments({ owner: id }),
      Event.countDocuments({ creator: id })
    ]);

    // Return profile with friends, wishlist, and events counts
    res.status(200).json({
      success: true,
      data: {
        _id: user._id,
        fullName: user.fullName,
        username: user.username,
        profileImage: user.profileImage,
        friendsCount: user.friends.length,
        wishlistCount,
        eventsCount,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user profile',
      error: error.message
    });
  }
};
