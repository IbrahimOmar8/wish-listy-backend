const Event = require('../models/Event');
const EventInvitation = require('../models/Eventinvitation');
const Wishlist = require('../models/Wishlist');
const User = require('../models/User');

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
    let validFriendIds = [];
    if (invited_friends && Array.isArray(invited_friends) && invited_friends.length > 0) {
      // Verify all friend IDs exist and are friends with the user
      const friendUsers = await User.find({ _id: { $in: invited_friends } });
      validFriendIds = friendUsers.map(u => u._id);
      
      // Optionally: Check if they are actually friends (uncomment if you have friendship validation)
      // const userWithFriends = await User.findById(req.user.id);
      // validFriendIds = validFriendIds.filter(fid => 
      //   userWithFriends.friends.some(f => f.toString() === fid.toString())
      // );
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
      invited_friends: validFriendIds 
    });

    // Create EventInvitation records for invited friends
    if (validFriendIds.length > 0) {
      const invitations = validFriendIds.map(friendId => ({
        event: event._id,
        invitee: friendId,
        inviter: req.user.id,
        status: 'pending'
      }));

      await EventInvitation.insertMany(invitations, { ordered: false }).catch(err => {
        // Ignore duplicate key errors (in case of re-invitations)
        console.log('Some invitations may have already existed:', err.message);
      });
    }

    // Populate and return the created event
    const populatedEvent = await Event.findById(event._id)
      .populate('creator', 'fullName username profileImage')
      .populate('wishlist', 'name description')
      .populate('invited_friends', 'fullName username profileImage');

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
        invited_friends: populatedEvent.invited_friends,
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
      .populate('invited_friends', 'fullName username profileImage')
      .sort({ date: 1 });

    // Get events where user is invited
    const invitations = await EventInvitation.find({ invitee: req.user.id })
      .populate({
        path: 'event',
        populate: [
          { path: 'creator', select: 'fullName username profileImage' },
          { path: 'wishlist', select: 'name description' }
        ]
      });

    const invitedEvents = invitations
      .filter(inv => inv.event) // Filter out null events
      .map(inv => ({
        ...inv.event.toObject(),
        invitation_status: inv.status
      }));

    res.status(200).json({
      success: true,
      data: {
        created: createdEvents,
        invited: invitedEvents
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
      .populate('invited_friends', 'fullName username profileImage');

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Check access based on privacy
    const isCreator = event.creator._id.toString() === req.user.id;
    const isInvited = event.invited_friends.some(f => f._id.toString() === req.user.id);

    if (event.privacy === 'private' && !isCreator && !isInvited) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this event'
      });
    }

    // Get invitation stats
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
      total_invited: event.invited_friends.length,
      pending: 0,
      accepted: 0,
      declined: 0,
      maybe: 0
    };

    invitationStats.forEach(stat => {
      stats[stat._id] = stat.count;
    });

    res.status(200).json({
      success: true,
      data: event,
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
      .populate('invited_friends', 'fullName username profileImage');

    res.status(200).json({
      success: true,
      message: 'Event updated successfully',
      data: updatedEvent
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
      .populate('wishlist', 'name description');

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

      // Add to event's invited_friends array
      const newFriendIds = newInvitations.map(inv => inv.invitee);
      await Event.findByIdAndUpdate(id, {
        $addToSet: { invited_friends: { $each: newFriendIds } }
      });
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
// @route   PUT /api/events/:id/respond
// @access  Private (invitee only)
exports.respondToInvitation = async (req, res) => {
  try {
    const { id } = req.params;
    const { response } = req.body;

    const validResponses = ['accepted', 'declined', 'maybe'];
    if (!response || !validResponses.includes(response)) {
      return res.status(400).json({
        success: false,
        message: `Invalid response. Must be one of: ${validResponses.join(', ')}`
      });
    }

    const invitation = await EventInvitation.findOne({
      event: id,
      invitee: req.user.id
    });

    if (!invitation) {
      return res.status(404).json({
        success: false,
        message: 'You are not invited to this event'
      });
    }

    invitation.status = response;
    invitation.respondedAt = new Date();
    await invitation.save();

    res.status(200).json({
      success: true,
      message: `Invitation ${response} successfully`,
      data: invitation
    });
  } catch (error) {
    console.error('Respond to Invitation Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to respond to invitation'
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
      .sort({ date: 1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Event.countDocuments(query);

    res.status(200).json({
      success: true,
      data: events,
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