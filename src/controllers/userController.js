const User = require('../models/User');

// Search users by username, email, or phone
exports.searchUsers = async (req, res) => {
  try {
    const { type, value } = req.query;

    // Validate query parameters
    if (!type || !value) {
      return res.status(400).json({
        success: false,
        message: 'Both type and value query parameters are required'
      });
    }

    if (!['username', 'email', 'phone'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Type must be one of: username, email, phone'
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

    // Search users and return safe fields only
    const users = await User.find(searchQuery)
      .select('_id fullName username profileImage')
      .limit(20);

    res.status(200).json({
      success: true,
      count: users.length,
      data: users
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

    // Return profile with friends count
    res.status(200).json({
      success: true,
      data: {
        _id: user._id,
        fullName: user.fullName,
        username: user.username,
        profileImage: user.profileImage,
        friendsCount: user.friends.length,
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
