const User = require('../models/User');
const FriendRequest = require('../models/FriendRequest');
const Wishlist = require('../models/Wishlist');
const Event = require('../models/Event');
const { translateInterests } = require('../utils/interestsTranslator');
const { isValidCountryCode, isValidDateFormat, isNotFutureDate } = require('../utils/validators');

// Search users by fullName, handle, or username (Unified Triple-Field Search)
exports.searchUsers = async (req, res) => {
  try {
    const { q, value, type } = req.query;
    const currentUserId = req.user._id;

    // Support both 'q' (new unified) and 'value' (legacy) query parameters
    const searchInput = q || value;

    // Validate query parameters
    if (!searchInput || searchInput.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: req.t('validation.val_search_params_required')
      });
    }

    // Sanitize and prepare search value
    // Remove @ prefix if present (for handle searches)
    const trimmedValue = searchInput.trim().replace(/^@/, '');
    
    // Escape special regex characters to prevent injection and handle special chars like @ and .
    const escapedValue = trimmedValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    let searchQuery = {};

    // Unified Triple-Field Search: Query fullName, handle, and username simultaneously
    // Uses $or operator - a match in ANY field returns the user
    // Partial & case-insensitive matching with $regex and $options: 'i'
    searchQuery.$or = [
      // Search in fullName (display name) - partial match anywhere in the string
      { fullName: { $regex: escapedValue, $options: 'i' } },
      // Search in handle - match with or without @ prefix
      { handle: { $regex: `^@?${escapedValue}`, $options: 'i' } },
      // Search in username (email or phone) - partial match from start
      { username: { $regex: escapedValue, $options: 'i' } }
    ];

    // Load current user to exclude self and blocked users from search
    const currentUser = await User.findById(currentUserId).select('friends blockedUsers');
    const blockedIds = (currentUser && currentUser.blockedUsers) ? currentUser.blockedUsers : [];
    searchQuery._id = { $nin: [currentUserId, ...blockedIds] };

    // Search users and return safe fields only
    // INDEXING RECOMMENDATION: For optimal performance, ensure indexes exist on:
    // - fullName (text or regular index)
    // - handle (regular index)  
    // - username (regular index - already has unique index)
    // Run: db.users.createIndex({ fullName: 1 })
    // Run: db.users.createIndex({ handle: 1 })
    const users = await User.find(searchQuery)
      .select('_id fullName username handle profileImage friends')
      .limit(20);

    // Use current user's friends list (already loaded above)
    const friendIds = (currentUser && currentUser.friends) ? currentUser.friends.map(f => f.toString()) : [];

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
        handle: user.handle || user.username, // Fallback to username if handle doesn't exist
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

    // Translate interests based on user's preferred language
    const userLanguage = user.preferredLanguage || 'en';
    const translatedInterests = translateInterests(user.interests, userLanguage);

    res.status(200).json({
      success: true,
      message: 'Interests updated successfully',
      data: {
        interests: translatedInterests
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
    const currentUserId = req.user.id; // Authenticated user ID

    const user = await User.findById(id)
      .select('_id fullName username handle email phone profileImage bio gender birth_date country_code friends interests preferredLanguage createdAt');

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

    // Get relationship information between authenticated user and target user
    let relationship = {
      status: 'none',
      isFriend: false,
      isBlockedByMe: false,
      incomingRequest: { exists: false, requestId: null },
      outgoingRequest: { exists: false, requestId: null }
    };

    // Only check relationship if viewing another user's profile (not own profile)
    if (currentUserId.toString() !== id.toString()) {
      // Load current user to check friends and blocked status
      const currentUser = await User.findById(currentUserId).select('friends blockedUsers');
      relationship.isBlockedByMe = (currentUser.blockedUsers || []).some(
        b => b.toString() === id.toString()
      );
      const isFriend = (currentUser.friends || []).some(
        friendId => friendId.toString() === id.toString()
      );

      if (isFriend) {
        relationship.status = 'friends';
        relationship.isFriend = true;
      } else {
        // Check for pending friend requests
        const incomingRequest = await FriendRequest.findOne({
          from: id, // Target user sent request to current user
          to: currentUserId,
          status: 'pending'
        });

        const outgoingRequest = await FriendRequest.findOne({
          from: currentUserId, // Current user sent request to target user
          to: id,
          status: 'pending'
        });

        if (incomingRequest) {
          relationship.status = 'incoming_request';
          relationship.incomingRequest = {
            exists: true,
            requestId: incomingRequest._id.toString()
          };
        } else if (outgoingRequest) {
          relationship.status = 'outgoing_request';
          relationship.outgoingRequest = {
            exists: true,
            requestId: outgoingRequest._id.toString()
          };
        }
      }
    } else {
      // Viewing own profile - set as friends (self); never blocked by me
      relationship.status = 'friends';
      relationship.isFriend = true;
      relationship.isBlockedByMe = false;
    }

    // Translate interests based on user's preferred language (if interests exist)
    let translatedInterests = [];
    if (user.interests && Array.isArray(user.interests)) {
      const userLanguage = user.preferredLanguage || 'en';
      translatedInterests = translateInterests(user.interests, userLanguage);
    }

    // Format birth_date to YYYY-MM-DD if exists
    let formattedBirthDate = null;
    if (user.birth_date) {
      const date = new Date(user.birth_date);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      formattedBirthDate = `${year}-${month}-${day}`;
    }

    // Return profile with friends, wishlist, and events counts, plus relationship info
    res.status(200).json({
      success: true,
      data: {
        _id: user._id,
        fullName: user.fullName,
        username: user.username,
        handle: user.handle || user.username, // Fallback to username if handle doesn't exist
        email: user.email || null,
        phone: user.phone || null,
        profileImage: user.profileImage,
        bio: user.bio || null,
        gender: user.gender || null,
        birth_date: formattedBirthDate,
        country_code: user.country_code || null,
        interests: translatedInterests,
        friendsCount: user.friends.length,
        wishlistCount,
        eventsCount,
        createdAt: user.createdAt,
        relationship
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

// Update user profile by ID (user can only update their own profile)
exports.updateUserProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user.id;

    // Check if user is trying to update their own profile
    if (id !== currentUserId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only update your own profile'
      });
    }

    // Handle both camelCase and snake_case from frontend
    const { 
      bio, 
      gender, 
      birth_date, 
      birthDate, // camelCase from frontend
      country_code, 
      countryCode, // camelCase from frontend
      fullName,
      name, // alias from frontend
      email, 
      phone 
    } = req.body;

    // Normalize field names (support both camelCase and snake_case)
    const normalizedBirthDate = birth_date || birthDate;
    const normalizedCountryCode = country_code || countryCode;
    const normalizedFullName = fullName || name;

    // Build update object with only provided fields
    const updateData = {};

    // Validate and update fullName
    if (normalizedFullName !== undefined) {
      if (typeof normalizedFullName !== 'string' || normalizedFullName.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: req.t('auth.fullname_required')
        });
      }
      updateData.fullName = normalizedFullName.trim();
    }

    // Validate and update email
    if (email !== undefined) {
      if (email && typeof email === 'string' && email.trim().length > 0) {
        const emailRegex = /^\S+@\S+\.\S+$/;
        if (!emailRegex.test(email.trim())) {
          return res.status(400).json({
            success: false,
            message: req.t('validation.invalid_format')
          });
        }
        updateData.email = email.trim().toLowerCase();
      } else {
        updateData.email = null;
      }
    }

    // Validate and update phone
    if (phone !== undefined) {
      updateData.phone = phone ? phone.trim() : null;
    }

    // Validate and update bio
    if (bio !== undefined) {
      if (bio && typeof bio === 'string') {
        if (bio.trim().length > 500) {
          return res.status(400).json({
            success: false,
            message: req.t('validation.max_length')
          });
        }
        updateData.bio = bio.trim() || null;
      } else {
        updateData.bio = null;
      }
    }

    // Validate and update gender
    if (gender !== undefined) {
      if (gender === null || gender === '') {
        updateData.gender = null;
      } else if (!['male', 'female'].includes(gender)) {
        return res.status(400).json({
          success: false,
          message: 'Gender must be either "male" or "female"'
        });
      } else {
        updateData.gender = gender;
      }
    }

    // Validate and update birth_date
    if (normalizedBirthDate !== undefined) {
      if (normalizedBirthDate === null || normalizedBirthDate === '') {
        updateData.birth_date = null;
      } else {
        // Handle ISO 8601 date string from frontend
        let dateString = normalizedBirthDate;
        if (dateString.includes('T')) {
          // Extract date part from ISO 8601 string (YYYY-MM-DDTHH:mm:ss.sssZ)
          dateString = dateString.split('T')[0];
        }

        if (!isValidDateFormat(dateString)) {
          return res.status(400).json({
            success: false,
            message: 'Birth date must be in YYYY-MM-DD format'
          });
        }
        if (!isNotFutureDate(dateString)) {
          return res.status(400).json({
            success: false,
            message: 'Birth date cannot be in the future'
          });
        }
        // Convert YYYY-MM-DD to Date object
        updateData.birth_date = new Date(dateString + 'T00:00:00.000Z');
      }
    }

    // Validate and update country_code
    if (normalizedCountryCode !== undefined) {
      if (normalizedCountryCode === null || normalizedCountryCode === '') {
        updateData.country_code = null;
      } else {
        const upperCode = typeof normalizedCountryCode === 'string' ? normalizedCountryCode.trim().toUpperCase() : normalizedCountryCode;
        if (!isValidCountryCode(upperCode)) {
          return res.status(400).json({
            success: false,
            message: 'Country code must be a valid ISO 3166-1 alpha-2 code (2 uppercase letters, e.g., EG, SA, US)'
          });
        }
        updateData.country_code = upperCode;
      }
    }

    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).select('_id fullName username handle email phone profileImage bio gender birth_date country_code interests preferredLanguage createdAt updatedAt');

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: req.t('user.not_found')
      });
    }

    // Format response
    let userData = updatedUser.toObject();
    
    // Translate interests
    if (userData.interests && Array.isArray(userData.interests)) {
      const userLanguage = userData.preferredLanguage || 'en';
      userData.interests = translateInterests(userData.interests, userLanguage);
    }

    // Format birth_date to YYYY-MM-DD if exists
    if (userData.birth_date) {
      const date = new Date(userData.birth_date);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      userData.birth_date = `${year}-${month}-${day}`;
    }

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: userData
    });
  } catch (error) {
    console.error('Update user profile error:', error);
    
    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }

    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Email or username already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: req.t('common.server_error'),
      error: error.message
    });
  }
};
