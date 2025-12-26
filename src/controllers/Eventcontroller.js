const Event = require('../models/Event');
const EventInvitation = require('../models/Eventinvitation');
const Wishlist = require('../models/Wishlist');
const User = require('../models/User');
const Notification = require('../models/Notification');

// Helper function to populate invited_friends.user if not already populated
// Handles both old format (array of ObjectIds) and new format (array of objects with user field)
const populateInvitedFriends = async (event) => {
  if (!event || !event.invited_friends || event.invited_friends.length === 0) {
    return event;
  }

  // Check if already populated (has fullName in user object)
  // Also check if user field exists at all
  const needsPopulation = event.invited_friends.some(
    inv => {
      // Check if inv has user field
      if (inv.user) {
        // If user is populated (has fullName), no need for population
        if (typeof inv.user === 'object' && inv.user.fullName) {
          return false;
        }
        // If user is ObjectId string or ObjectId object, needs population
        return typeof inv.user === 'string' || 
               (typeof inv.user === 'object' && inv.user.constructor && inv.user.constructor.name === 'ObjectId');
      }
      // If no user field, we need to populate - user ID might be in _id field or we need to get it from EventInvitation
      // For now, we'll try to get it from EventInvitation collection
      return true;
    }
  );

  if (!needsPopulation) {
    return event; // Already populated
  }

  // Get all user IDs that need to be populated
  // First, try to get user IDs from invited_friends array
  let userIds = event.invited_friends
    .map(inv => {
      // Handle new format: inv has user field
      if (inv.user) {
        if (typeof inv.user === 'string') return inv.user;
        if (inv.user.constructor && inv.user.constructor.name === 'ObjectId') return inv.user.toString();
        // If already populated, skip
        if (inv.user.fullName) return null;
        return inv.user._id || inv.user;
      }
      // If no user field, try to get from EventInvitation
      return null; // Will handle separately
    })
    .filter(Boolean);

  // If we have entries without user field, get user IDs from EventInvitation
  const entriesWithoutUser = event.invited_friends.filter(inv => !inv.user);
  if (entriesWithoutUser.length > 0 && event._id) {
    const invitations = await EventInvitation.find({ event: event._id })
      .select('invitee');
    const inviteeIds = invitations.map(inv => inv.invitee.toString());
    userIds = [...userIds, ...inviteeIds];
  }

  // Remove duplicates
  userIds = [...new Set(userIds)];

  if (userIds.length === 0) {
    return event;
  }

  // Fetch users
  const users = await User.find({ _id: { $in: userIds } })
    .select('_id fullName username profileImage');

  // Create a map for quick lookup
  const userMap = new Map();
  users.forEach(user => {
    userMap.set(user._id.toString(), {
      _id: user._id,
      fullName: user.fullName,
      username: user.username,
      profileImage: user.profileImage
    });
  });

  // Replace user IDs with populated user objects
  // Check if event is Mongoose document (has .set method) or plain object
  const isMongooseDoc = event.set && typeof event.set === 'function';
  
  // Create a map of invitee IDs from EventInvitation if needed
  let inviteeMap = new Map();
  if (entriesWithoutUser.length > 0 && event._id) {
    const invitations = await EventInvitation.find({ event: event._id })
      .select('invitee');
    invitations.forEach(inv => {
      inviteeMap.set(inv._id.toString(), inv.invitee.toString());
    });
  }

  if (isMongooseDoc) {
    // Mongoose document - modify directly
    event.invited_friends = await Promise.all(
      event.invited_friends.map(async (inv, index) => {
        // Handle new format: inv has user field
        if (inv.user) {
          const userId = typeof inv.user === 'string' 
            ? inv.user 
            : (inv.user && inv.user.constructor && inv.user.constructor.name === 'ObjectId'
              ? inv.user.toString()
              : (inv.user?._id || inv.user));
          const populatedUser = userId ? userMap.get(userId.toString()) : null;

          return {
            user: populatedUser || inv.user,
            status: inv.status || 'pending',
            updatedAt: inv.updatedAt || new Date()
          };
        }
        
        // If no user field, try to get from EventInvitation using index or _id
        // This is a fallback - ideally all entries should have user field
        let userId = null;
        if (inv._id && inviteeMap.has(inv._id.toString())) {
          userId = inviteeMap.get(inv._id.toString());
        } else if (event._id) {
          // Get all invitations and match by index (not ideal but works)
          const allInvitations = await EventInvitation.find({ event: event._id })
            .select('invitee')
            .sort({ createdAt: 1 });
          if (allInvitations[index]) {
            userId = allInvitations[index].invitee.toString();
          }
        }
        
        const populatedUser = userId ? userMap.get(userId) : null;
        
        return {
          user: populatedUser || null,
          status: inv.status || 'pending',
          updatedAt: inv.updatedAt || new Date()
        };
      })
    );
  } else {
    // Plain object - return new object with populated users
    const populatedInvitedFriends = await Promise.all(
      event.invited_friends.map(async (inv, index) => {
        // Handle new format: inv has user field
        if (inv.user) {
          const userId = typeof inv.user === 'string' 
            ? inv.user 
            : (inv.user && inv.user.constructor && inv.user.constructor.name === 'ObjectId'
              ? inv.user.toString()
              : (inv.user?._id || inv.user));
          const populatedUser = userId ? userMap.get(userId.toString()) : null;

          return {
            user: populatedUser || inv.user,
            status: inv.status || 'pending',
            updatedAt: inv.updatedAt || new Date()
          };
        }
        
        // If no user field, try to get from EventInvitation
        let userId = null;
        if (inv._id && inviteeMap.has(inv._id.toString())) {
          userId = inviteeMap.get(inv._id.toString());
        } else if (event._id) {
          const allInvitations = await EventInvitation.find({ event: event._id })
            .select('invitee')
            .sort({ createdAt: 1 });
          if (allInvitations[index]) {
            userId = allInvitations[index].invitee.toString();
          }
        }
        
        const populatedUser = userId ? userMap.get(userId) : null;
        
        return {
          user: populatedUser || null,
          status: inv.status || 'pending',
          updatedAt: inv.updatedAt || new Date()
        };
      })
    );
    
    event.invited_friends = populatedInvitedFriends;
  }

  return event;
};

// @desc    Create new event
// @route   POST /api/events
// @access  Private
exports.createEvent = async (req, res) => {
  try {
    const {
      name,
      description,
      date,
      time,
      type,
      privacy,
      mode,
      location,
      meeting_link,
      wishlist_id,
      invited_friends ,
      
    } = req.body;

    // Validation - Required fields
    const errors = {};

    if (!name || name.trim().length < 2) {
      errors.name = 'Event name is required and must be at least 2 characters';
    }

    if (!date) {
      errors.date = 'Event date is required';
    } else {
      const eventDate = new Date(date);
      if (isNaN(eventDate.getTime())) {
        errors.date = 'Invalid date format. Use ISO 8601 format';
      } else if (eventDate <= new Date()) {
        errors.date = 'Event date must be in the future';
      }
    }

    if (!time) {
      errors.time = 'Event time is required';
    } else {
      const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/; // HH:MM 24-hour format
      if (!timeRegex.test(time)) {
        errors.time = 'Invalid time format. Use HH:MM in 24-hour format';
      }
    }

    if (!type) {
      errors.type = 'Event type is required';
    } else {
      const validTypes = ['birthday', 'wedding', 'anniversary', 'graduation', 'holiday', 'baby_shower', 'house_warming', 'other'];
      if (!validTypes.includes(type)) {
        errors.type = `Invalid event type. Must be one of: ${validTypes.join(', ')}`;
      }
    }

    if (!privacy) {
      errors.privacy = 'Event privacy is required';
    } else {
      const validPrivacy = ['public', 'private', 'friends_only'];
      if (!validPrivacy.includes(privacy)) {
        errors.privacy = `Invalid privacy option. Must be one of: ${validPrivacy.join(', ')}`;
      }
    }

    if (!mode) {
      errors.mode = 'Event mode is required';
    } else {
      const validModes = ['in_person', 'online', 'hybrid'];
      if (!validModes.includes(mode)) {
        errors.mode = `Invalid event mode. Must be one of: ${validModes.join(', ')}`;
      }
    }

    // Validate meeting_link for online/hybrid events
    if ((mode === 'online' || mode === 'hybrid') && !meeting_link) {
      errors.meeting_link = 'Meeting link is required for online or hybrid events';
    }

    // If there are validation errors, return them
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors
      });
    }

    // Validate wishlist_id if provided
    let linkedWishlist = null;
    if (wishlist_id) {
      linkedWishlist = await Wishlist.findById(wishlist_id);
      if (!linkedWishlist) {
        return res.status(400).json({
          success: false,
          message: 'Wishlist not found',
          errors: { wishlist_id: 'The specified wishlist does not exist' }
        });
      }
      // Check if wishlist belongs to the user
      if (linkedWishlist.owner.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'You can only link your own wishlists to an event'
        });
      }
    }

    // Validate invited_friends if provided
    let invitedFriendsArray = [];
    if (invited_friends !== undefined && invited_friends !== null) {
      // If empty array or null, set to empty array
      if (Array.isArray(invited_friends)) {
        if (invited_friends.length > 0) {
          // Verify all friend IDs exist
          const friendUsers = await User.find({ _id: { $in: invited_friends } });
          const validFriendIds = friendUsers.map(u => u._id);
          
          // Create array of objects with status 'pending'
          invitedFriendsArray = validFriendIds.map(friendId => ({
            user: friendId,
            status: 'pending',
            updatedAt: new Date()
          }));
        }
        // If array is empty, invitedFriendsArray remains []
      }
      // If not an array, invitedFriendsArray remains []
    }

    // Create the event
    const event = await Event.create({
      name: name.trim(),
      description: description ? description.trim() : null,
      date: new Date(date),
      time: time.trim(),
      type,
      privacy,
      mode,
      location: location ? location.trim() : null,
      meeting_link: meeting_link || null,
      creator: req.user.id,
      wishlist: wishlist_id || null,
      invited_friends: invitedFriendsArray 
    });

    // Create EventInvitation records for invited friends
    if (invitedFriendsArray.length > 0) {
      const invitations = invitedFriendsArray.map(invitedFriend => ({
        event: event._id,
        invitee: invitedFriend.user,
        inviter: req.user.id,
        status: 'pending'
      }));

      await EventInvitation.insertMany(invitations, { ordered: false }).catch(err => {
        // Ignore duplicate key errors (in case of re-invitations)
        console.log('Some invitations may have already existed:', err.message);
      });
    }

    // Populate and return the created event
    let populatedEvent = await Event.findById(event._id)
      .populate('creator', 'fullName username profileImage')
      .populate('wishlist', 'name description')
      .populate('invited_friends.user', 'fullName username profileImage');

    // Ensure invited_friends.user is populated (manual populate as fallback)
    await populateInvitedFriends(populatedEvent);

    res.status(201).json({
      success: true,
      message: 'Event created successfully',
      data: {
        id: populatedEvent._id,
        creator_id: populatedEvent.creator._id,
        name: populatedEvent.name,
        description: populatedEvent.description,
        date: populatedEvent.date.toISOString(),
        time: populatedEvent.time,
        type: populatedEvent.type,
        status: populatedEvent.status,
        privacy: populatedEvent.privacy,
        mode: populatedEvent.mode,
        location: populatedEvent.location,
        meeting_link: populatedEvent.meeting_link,
        wishlist_id: populatedEvent.wishlist ? populatedEvent.wishlist._id : null,
        invited_friends: Array.isArray(populatedEvent.invited_friends) 
          ? populatedEvent.invited_friends.map(inv => {
              const userData = inv.user;
              const isPopulated = userData && typeof userData === 'object' && userData.fullName;
              
              return {
                user: isPopulated 
                  ? {
                      _id: userData._id,
                      fullName: userData.fullName,
                      username: userData.username,
                      profileImage: userData.profileImage
                    }
                  : userData,
                status: inv.status || 'pending',
                updatedAt: inv.updatedAt || new Date()
              };
            }) 
          : [],
        created_at: populatedEvent.createdAt.toISOString(),
        updated_at: populatedEvent.updatedAt.toISOString()
      }
    });
  } catch (error) {
    console.error('Create Event Error:', error);

    if (error.name === 'ValidationError') {
      const errors = {};
      Object.keys(error.errors).forEach(key => {
        errors[key] = error.errors[key].message;
      });
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create event'
    });
  }
};

// @desc    Get all events for current user (created + invited)
// @route   GET /api/events
// @access  Private
exports.getMyEvents = async (req, res) => {
  try {
    const { status, type, upcoming } = req.query;

    // Build query for events created by user
    let createdQuery = { creator: req.user.id };

    // Add filters if provided
    if (status) {
      createdQuery.status = status;
    }
    if (type) {
      createdQuery.type = type;
    }
    if (upcoming === 'true') {
      createdQuery.date = { $gte: new Date() };
    }

    // Get events created by user
    const createdEvents = await Event.find(createdQuery)
      .populate('creator', 'fullName username profileImage')
      .populate('wishlist', 'name description')
      .populate('invited_friends.user', 'fullName username profileImage')
      .sort({ date: 1 });

    // Get events where user is invited
    const invitations = await EventInvitation.find({ invitee: req.user.id })
      .populate({
        path: 'event',
        populate: [
          { path: 'creator', select: 'fullName username profileImage' },
          { path: 'wishlist', select: 'name description' },
          { path: 'invited_friends.user', select: 'fullName username profileImage' }
        ]
      });

    const invitedEvents = invitations
      .filter(inv => inv.event) // Filter out null events
      .map(inv => ({
        ...inv.event.toObject(),
        invitation_status: inv.status
      }));

    // Populate invited_friends.user if needed and transform events
    const transformedCreatedEvents = await Promise.all(
      createdEvents.map(async (event) => {
        await populateInvitedFriends(event);
        const eventObj = event.toObject();
        if (eventObj.invited_friends && Array.isArray(eventObj.invited_friends)) {
          eventObj.invited_friends = eventObj.invited_friends.map(inv => {
            const userData = inv.user;
            const isPopulated = userData && typeof userData === 'object' && userData.fullName;
            
            return {
              user: isPopulated 
                ? {
                    _id: userData._id,
                    fullName: userData.fullName,
                    username: userData.username,
                    profileImage: userData.profileImage
                  }
                : userData,
              status: inv.status || 'pending',
              updatedAt: inv.updatedAt || new Date()
            };
          });
        }
        return eventObj;
      })
    );

    // Transform invited events - use EventInvitation as source of truth
    const transformedInvitedEvents = await Promise.all(
      invitedEvents.map(async (event) => {
        const eventObj = { ...event };
        
        // Get user data from EventInvitation collection
        const invitations = await EventInvitation.find({ event: event._id })
          .select('invitee status updatedAt')
          .populate('invitee', '_id fullName username profileImage')
          .sort({ createdAt: 1 });

        // Transform invited_friends using EventInvitation data
        if (invitations.length > 0) {
          eventObj.invited_friends = invitations.map((invitation) => {
            const invitee = invitation.invitee;
            
            return {
              user: invitee ? {
                _id: invitee._id,
                fullName: invitee.fullName,
                username: invitee.username,
                profileImage: invitee.profileImage
              } : null,
              status: invitation.status || 'pending',
              updatedAt: invitation.updatedAt || invitation.createdAt || new Date()
            };
          });
        } else {
          eventObj.invited_friends = [];
        }
        
        return eventObj;
      })
    );

    res.status(200).json({
      success: true,
      data: {
        created: transformedCreatedEvents,
        invited: transformedInvitedEvents
      }
    });
  } catch (error) {
    console.error('Get Events Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get events'
    });
  }
};

// @desc    Get single event by ID
// @route   GET /api/events/:id
// @access  Private
exports.getEventById = async (req, res) => {
  try {
    const { id } = req.params;

    const event = await Event.findById(id)
      .populate('creator', 'fullName username profileImage')
      .populate('wishlist', 'name description items')
      .populate('invited_friends.user', 'fullName username profileImage');

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Check access based on privacy
    const isCreator = event.creator._id.toString() === req.user.id;
    // Check if user is invited using EventInvitation collection
    const userInvitation = await EventInvitation.findOne({ event: id, invitee: req.user.id });
    const isInvited = !!userInvitation;

    // Extract myInvitationStatus for the current user
    const myInvitationStatus = userInvitation ? (userInvitation.status || 'pending') : 'not_invited';

    if (event.privacy === 'private' && !isCreator && !isInvited) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this event'
      });
    }

    // Get user data from EventInvitation collection (more reliable source)
    const invitations = await EventInvitation.find({ event: id })
      .select('invitee status updatedAt')
      .populate('invitee', '_id fullName username profileImage')
      .sort({ createdAt: 1 });

    // Calculate stats from EventInvitation collection (more reliable)
    const invitationStats = await EventInvitation.aggregate([
      { $match: { event: event._id } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const stats = {
      total_invited: invitations.length,
      pending: 0,
      accepted: 0,
      declined: 0,
      maybe: 0
    };

    invitationStats.forEach(stat => {
      stats[stat._id] = stat.count;
    });

    // Transform invited_friends using EventInvitation data as source of truth
    const transformedInvitedFriends = invitations.map((invitation) => {
      const invitee = invitation.invitee;
      
      return {
        user: invitee ? {
          _id: invitee._id,
          fullName: invitee.fullName,
          username: invitee.username,
          profileImage: invitee.profileImage
        } : null,
        status: invitation.status || 'pending',
        updatedAt: invitation.updatedAt || invitation.createdAt || new Date()
      };
    });

    // Get attendees (accepted/maybe) for social proof (excluding current user)
    const acceptedAttendees = await EventInvitation.find({
      event: id,
      status: { $in: ['accepted', 'maybe'] },
      invitee: { $ne: req.user.id } // Exclude current user
    })
      .populate('invitee', 'fullName username profileImage')
      .sort({ updatedAt: -1 }) // Most recent responses first
      .limit(10); // Top 10 for social proof

    // Compute status dynamically based on event date vs current time
    const eventDate = new Date(event.date);
    const now = new Date();
    const computedStatus = eventDate < now ? 'past' : 'upcoming';

    res.status(200).json({
      success: true,
      data: {
        ...event.toObject(),
        isCreator, // ✅ Boolean indicating if current user is the creator
        myInvitationStatus, // ✅ Current user's invitation status ('pending', 'accepted', 'declined', 'maybe', or 'not_invited')
        status: computedStatus, // ✅ Dynamically computed status ('past' or 'upcoming')
        invited_friends: transformedInvitedFriends,
        attendees: acceptedAttendees.map(inv => ({
          _id: inv.invitee._id,
          fullName: inv.invitee.fullName,
          username: inv.invitee.username,
          profileImage: inv.invitee.profileImage
        })) // ✅ Accepted/maybe attendees for social proof
      },
      stats
    });
  } catch (error) {
    console.error('Get Event Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get event'
    });
  }
};

// @desc    Update event
// @route   PUT /api/events/:id
// @access  Private (creator only)
exports.updateEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const event = await Event.findById(id);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Check ownership
    if (event.creator.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to update this event'
      });
    }

    // Allowed fields to update
    const allowedFields = ['name', 'description', 'date', 'type', 'privacy', 'mode', 'location', 'meeting_link', 'status'];
    const filteredUpdates = {};

    allowedFields.forEach(field => {
      if (updates.hasOwnProperty(field)) {
        filteredUpdates[field] = updates[field];
      }
    });

    // Handle invited_friends separately (not in allowedFields because it needs validation)
    let invitedFriendsArray = null;
    if (updates.hasOwnProperty('invited_friends')) {
      const { invited_friends } = updates;
      
      if (invited_friends && Array.isArray(invited_friends)) {
        // Validate friend IDs exist and create array of objects with status
        const friendUsers = await User.find({ _id: { $in: invited_friends } });
        const validFriendIds = friendUsers.map(u => u._id);
        
        // Get existing invited friends to preserve their statuses
        const existingInvitedFriends = event.invited_friends || [];
        const existingFriendMap = new Map();
        existingInvitedFriends.forEach(inv => {
          if (inv.user) {
            existingFriendMap.set(inv.user.toString(), inv.status);
          }
        });
        
        // Create array of objects, preserving existing statuses or setting to 'pending'
        invitedFriendsArray = validFriendIds.map(friendId => {
          const existingStatus = existingFriendMap.get(friendId.toString());
          return {
            user: friendId,
            status: existingStatus || 'pending',
            updatedAt: existingStatus ? existingInvitedFriends.find(inv => inv.user && inv.user.toString() === friendId.toString())?.updatedAt || new Date() : new Date()
          };
        });
      } else {
        invitedFriendsArray = [];
      }
      filteredUpdates.invited_friends = invitedFriendsArray;
    }

    // Validate meeting_link if mode is being updated
    if (filteredUpdates.mode && (filteredUpdates.mode === 'online' || filteredUpdates.mode === 'hybrid')) {
      if (!filteredUpdates.meeting_link && !event.meeting_link) {
        return res.status(400).json({
          success: false,
          message: 'Meeting link is required for online or hybrid events'
        });
      }
    }

    // Update event
    const updatedEvent = await Event.findByIdAndUpdate(
      id,
      filteredUpdates,
      { new: true, runValidators: true }
    )
      .populate('creator', 'fullName username profileImage')
      .populate('wishlist', 'name description')
      .populate('invited_friends.user', 'fullName username profileImage');
    
    // Update EventInvitation records if invited_friends was updated
    if (invitedFriendsArray !== null) {
      // Remove old invitations
      await EventInvitation.deleteMany({ event: id });
      
      // Create new invitations for valid friends
      if (invitedFriendsArray.length > 0) {
        const invitations = invitedFriendsArray.map(invitedFriend => ({
          event: id,
          invitee: invitedFriend.user,
          inviter: req.user.id,
          status: invitedFriend.status || 'pending'
        }));

        await EventInvitation.insertMany(invitations, { ordered: false }).catch(err => {
          console.log('Some invitations may have already existed:', err.message);
        });
      }
      
      // Re-populate the event to get updated invited_friends
      await updatedEvent.populate('invited_friends.user', 'fullName username profileImage');
    }

    // Transform invited_friends to ensure user is properly formatted
    const transformedInvitedFriends = (updatedEvent.invited_friends || []).map(inv => {
      const userData = inv.user;
      const isPopulated = userData && typeof userData === 'object' && userData.fullName;
      
      return {
        user: isPopulated 
          ? {
              _id: userData._id,
              fullName: userData.fullName,
              username: userData.username,
              profileImage: userData.profileImage
            }
          : userData,
        status: inv.status || 'pending',
        updatedAt: inv.updatedAt || new Date()
      };
    });

    const eventData = updatedEvent.toObject();
    eventData.invited_friends = transformedInvitedFriends;

    res.status(200).json({
      success: true,
      message: 'Event updated successfully',
      data: eventData
    });
  } catch (error) {
    console.error('Update Event Error:', error);
    
    if (error.name === 'ValidationError') {
      const errors = {};
      Object.keys(error.errors).forEach(key => {
        errors[key] = error.errors[key].message;
      });
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update event'
    });
  }
};

// @desc    Delete event
// @route   DELETE /api/events/:id
// @access  Private (creator only)
exports.deleteEvent = async (req, res) => {
  try {
    const { id } = req.params;

    const event = await Event.findById(id);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Check ownership
    if (event.creator.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to delete this event'
      });
    }

    // Delete all related invitations
    await EventInvitation.deleteMany({ event: id });

    // Delete the event
    await Event.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Event and all related invitations deleted successfully'
    });
  } catch (error) {
    console.error('Delete Event Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete event'
    });
  }
};

// @desc    Link/Update wishlist for an event
// @route   PUT /api/events/:id/wishlist
// @access  Private (creator only)
exports.linkWishlist = async (req, res) => {
  try {
    const { id } = req.params;
    const { wishlist_id } = req.body;

    const event = await Event.findById(id);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Check ownership
    if (event.creator.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to update this event'
      });
    }

    // If wishlist_id is provided, verify it exists and belongs to user
    if (wishlist_id) {
      const wishlist = await Wishlist.findById(wishlist_id);
      if (!wishlist) {
        return res.status(404).json({
          success: false,
          message: 'Wishlist not found'
        });
      }
      if (wishlist.owner.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'You can only link your own wishlists'
        });
      }
    }

    // Update event with new wishlist (or null to unlink)
    event.wishlist = wishlist_id || null;
    await event.save();

    const updatedEvent = await Event.findById(id)
      .populate('wishlist', 'name description')
      .populate('invited_friends.user', 'fullName username profileImage');

    res.status(200).json({
      success: true,
      message: wishlist_id ? 'Wishlist linked successfully' : 'Wishlist unlinked successfully',
      data: updatedEvent
    });
  } catch (error) {
    console.error('Link Wishlist Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to link wishlist'
    });
  }
};

// @desc    Invite friends to an event
// @route   POST /api/events/:id/invite
// @access  Private (creator only)
exports.inviteFriends = async (req, res) => {
  try {
    const { id } = req.params;
    const { friend_ids } = req.body;

    if (!friend_ids || !Array.isArray(friend_ids) || friend_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'friend_ids array is required'
      });
    }

    const event = await Event.findById(id);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Check ownership
    if (event.creator.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to invite friends to this event'
      });
    }

    // Verify friend IDs exist
    const validFriends = await User.find({ _id: { $in: friend_ids } });
    const validFriendIds = validFriends.map(f => f._id);

    // Create invitations for new friends
    const newInvitations = [];
    const alreadyInvited = [];

    for (const friendId of validFriendIds) {
      // Check if already invited
      const existingInvitation = await EventInvitation.findOne({
        event: id,
        invitee: friendId
      });

      if (existingInvitation) {
        alreadyInvited.push(friendId);
      } else {
        newInvitations.push({
          event: id,
          invitee: friendId,
          inviter: req.user.id,
          status: 'pending'
        });
      }
    }

    // Insert new invitations
    if (newInvitations.length > 0) {
      await EventInvitation.insertMany(newInvitations);

      // Add to event's invited_friends array with status 'pending'
      const newInvitedFriends = newInvitations.map(inv => ({
        user: inv.invitee,
        status: 'pending',
        updatedAt: new Date()
      }));

      // Get existing invited friends
      const existingInvitedFriends = event.invited_friends || [];
      const existingUserIds = existingInvitedFriends.map(inv => 
        inv.user ? inv.user.toString() : null
      ).filter(Boolean);

      // Only add friends that aren't already invited
      const friendsToAdd = newInvitedFriends.filter(inv => 
        !existingUserIds.includes(inv.user.toString())
      );

      if (friendsToAdd.length > 0) {
        event.invited_friends = [...existingInvitedFriends, ...friendsToAdd];
        await event.save();
      }
    }

    res.status(200).json({
      success: true,
      message: 'Friends invited successfully',
      data: {
        newly_invited: newInvitations.length,
        already_invited: alreadyInvited.length
      }
    });
  } catch (error) {
    console.error('Invite Friends Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to invite friends'
    });
  }
};

// @desc    Respond to an event invitation
// @route   PUT /api/events/:id/respond or PATCH /api/events/:id/respond
// @access  Private (invitee only)
exports.respondToInvitation = async (req, res) => {
  try {
    const { id } = req.params;
    // Support both 'response' and 'status' field names for backward compatibility
    const { response, status } = req.body;
    const responseStatus = response || status;

    const validResponses = ['accepted', 'declined', 'maybe'];
    if (!responseStatus || !validResponses.includes(responseStatus)) {
      return res.status(400).json({
        success: false,
        message: `Invalid response. Must be one of: ${validResponses.join(', ')}. Provide either 'response' or 'status' field.`
      });
    }

    // Find the invitation
    const invitation = await EventInvitation.findOne({
      event: id,
      invitee: req.user.id
    }).populate('event', 'name creator');

    if (!invitation) {
      return res.status(404).json({
        success: false,
        message: 'You are not invited to this event'
      });
    }

    // Get the event to access creator and name
    const event = invitation.event;
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Update invitation status
    const previousStatus = invitation.status;
    invitation.status = responseStatus;
    invitation.respondedAt = new Date();
    await invitation.save();

    // Update status in event's invited_friends array
    const eventDoc = await Event.findById(id);
    if (eventDoc && eventDoc.invited_friends) {
      const friendInvitation = eventDoc.invited_friends.find(
        inv => inv.user && inv.user.toString() === req.user.id.toString()
      );
      if (friendInvitation) {
        friendInvitation.status = responseStatus;
        friendInvitation.updatedAt = new Date();
        await eventDoc.save();
      }
    }

    // Get the responding user's info for the notification
    const respondingUser = await User.findById(req.user.id).select('fullName username profileImage');
    if (!respondingUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Create notification for the event creator (only if status changed)
    if (previousStatus !== responseStatus && event.creator.toString() !== req.user.id) {
      const statusMessages = {
        'accepted': 'accepted',
        'declined': 'declined',
        'maybe': 'might attend'
      };

      // Set notification type based on response status
      const notificationType = `event_invitation_${responseStatus}`;

      await Notification.create({
        user: event.creator,
        type: notificationType,
        title: 'Event Invitation Response',
        message: `${respondingUser.fullName} ${statusMessages[responseStatus]} your invitation to: ${event.name}`,
        relatedUser: req.user.id,
        relatedId: event._id
      });

      // Helper function to calculate unreadCount (similar to friendController)
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

      // Calculate creator's current unreadCount with badge dismissal logic
      const unreadCount = await getUnreadCountWithBadge(event.creator);

      // Emit socket event if io is available
      if (req.app.get('io')) {
        req.app.get('io').to(event.creator.toString()).emit('event_invitation_response', {
          eventId: event._id,
          eventName: event.name,
          user: {
            _id: respondingUser._id,
            fullName: respondingUser.fullName,
            username: respondingUser.username,
            profileImage: respondingUser.profileImage
          },
          status: responseStatus,
          message: `${respondingUser.fullName} ${statusMessages[responseStatus]} your invitation to: ${event.name}`,
          unreadCount
        });
      }
    }

    // Get the updated event with populated fields
    let updatedEvent = await Event.findById(id)
      .populate('creator', 'fullName username profileImage')
      .populate('wishlist', 'name description items')
      .populate('invited_friends.user', 'fullName username profileImage');

    // Ensure invited_friends.user is populated (manual populate as fallback)
    await populateInvitedFriends(updatedEvent);

    // Calculate stats from invited_friends array
    const stats = {
      total_invited: updatedEvent.invited_friends.length,
      pending: 0,
      accepted: 0,
      declined: 0,
      maybe: 0
    };

    updatedEvent.invited_friends.forEach(invitedFriend => {
      if (invitedFriend.status) {
        stats[invitedFriend.status] = (stats[invitedFriend.status] || 0) + 1;
      } else {
        stats.pending = (stats.pending || 0) + 1;
      }
    });

    // Transform invited_friends to ensure user is properly formatted
    const transformedInvitedFriends = (updatedEvent.invited_friends || []).map(inv => {
      const userData = inv.user;
      const isPopulated = userData && typeof userData === 'object' && userData.fullName;
      
      return {
        user: isPopulated 
          ? {
              _id: userData._id,
              fullName: userData.fullName,
              username: userData.username,
              profileImage: userData.profileImage
            }
          : userData,
        status: inv.status || 'pending',
        updatedAt: inv.updatedAt || new Date()
      };
    });

    res.status(200).json({
      success: true,
      message: `Invitation ${responseStatus} successfully`,
      data: {
        ...updatedEvent.toObject(),
        invited_friends: transformedInvitedFriends
      },
      invitation: {
        _id: invitation._id,
        status: invitation.status,
        respondedAt: invitation.respondedAt
      },
      stats
    });
  } catch (error) {
    console.error('Respond to Invitation Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to respond to invitation',
      error: error.message
    });
  }
};

// @desc    Get public events (for discovery)
// @route   GET /api/events/public
// @access  Private
exports.getPublicEvents = async (req, res) => {
  try {
    const { type, page = 1, limit = 20 } = req.query;

    let query = {
      privacy: 'public',
      date: { $gte: new Date() },
      status: 'upcoming'
    };

    if (type) {
      query.type = type;
    }

    const events = await Event.find(query)
      .populate('creator', 'fullName username profileImage')
      .populate('invited_friends.user', 'fullName username profileImage')
      .sort({ date: 1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Event.countDocuments(query);

    // Populate invited_friends.user if needed and transform events
    const transformedEvents = await Promise.all(
      events.map(async (event) => {
        await populateInvitedFriends(event);
        const eventObj = event.toObject();
        if (eventObj.invited_friends && Array.isArray(eventObj.invited_friends)) {
          eventObj.invited_friends = eventObj.invited_friends.map(inv => {
            const userData = inv.user;
            const isPopulated = userData && typeof userData === 'object' && userData.fullName;
            
            return {
              user: isPopulated 
                ? {
                    _id: userData._id,
                    fullName: userData.fullName,
                    username: userData.username,
                    profileImage: userData.profileImage
                  }
                : userData,
              status: inv.status || 'pending',
              updatedAt: inv.updatedAt || new Date()
            };
          });
        }
        return eventObj;
      })
    );

    res.status(200).json({
      success: true,
      data: transformedEvents,
      pagination: {
        current_page: parseInt(page),
        total_pages: Math.ceil(total / limit),
        total_events: total
      }
    });
  } catch (error) {
    console.error('Get Public Events Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get public events'
    });
  }
};