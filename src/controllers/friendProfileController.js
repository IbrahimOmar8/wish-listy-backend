const mongoose = require('mongoose');
const User = require('../models/User');
const Wishlist = require('../models/Wishlist');
const Event = require('../models/Event');
const EventInvitation = require('../models/Eventinvitation');
const FriendRequest = require('../models/FriendRequest');
const Reservation = require('../models/Reservation');
const Item = require('../models/Item');

/**
 * Helper function to check if two users are friends (boolean)
 */
const checkFriendshipStatus = async (currentUserId, targetUserId) => {
  const user = await User.findById(currentUserId);
  const isFriend = user.friends.includes(targetUserId);

  return isFriend;
};

/**
 * Helper function to get detailed friendship status
 * Returns: { status: 'friends'|'pending_sent'|'pending_received'|'none', requestId?: string }
 */
const getFriendshipStatus = async (currentUserId, targetUserId) => {
  // Check if already friends
  const currentUser = await User.findById(currentUserId).select('friends');
  const isFriend = currentUser.friends.includes(targetUserId);

  if (isFriend) {
    return { status: 'friends' };
  }

  // Check for pending friend requests
  const pendingRequest = await FriendRequest.findOne({
    $or: [
      { from: currentUserId, to: targetUserId, status: 'pending' },
      { from: targetUserId, to: currentUserId, status: 'pending' }
    ]
  });

  if (pendingRequest) {
    if (pendingRequest.from.toString() === currentUserId) {
      return { status: 'pending_sent', requestId: pendingRequest._id.toString() };
    } else {
      return { status: 'pending_received', requestId: pendingRequest._id.toString() };
    }
  }

  return { status: 'none' };
};

/**
 * Get friend's profile with basic data and friendship status
 * GET /api/users/:friendUserId/profile
 */
exports.getFriendProfile = async (req, res) => {
  try {
    const { friendUserId } = req.params;
    const currentUserId = req.user.id;

    // Get target user
    const targetUser = await User.findById(friendUserId).select(
      'fullName username profileImage createdAt'
    );

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Get detailed friendship status
    const friendshipStatus = await getFriendshipStatus(currentUserId, friendUserId);

    // Get counts
    const [wishlistCount, eventCount, friendCount] = await Promise.all([
      Wishlist.countDocuments({ owner: friendUserId }),
      Event.countDocuments({ creator: friendUserId }),
      User.findById(friendUserId).select('friends').then(u => u.friends.length),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        user: {
          id: targetUser._id,
          fullName: targetUser.fullName,
          username: targetUser.username,
          profileImage: targetUser.profileImage,
          createdAt: targetUser.createdAt,
        },
        counts: {
          wishlists: wishlistCount,
          events: eventCount,
          friends: friendCount,
        },
        friendshipStatus,
      },
    });
  } catch (error) {
    console.error('Get friend profile error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get friend profile',
      error: error.message,
    });
  }
};

/**
 * Get friend's wishlists based on privacy settings
 * GET /api/users/:friendUserId/wishlists
 */
exports.getFriendWishlists = async (req, res) => {
  try {
    const { friendUserId } = req.params;
    const currentUserId = req.user.id;

    // Check friendship status
    const isFriend = await checkFriendshipStatus(currentUserId, friendUserId);

    // Build query based on privacy rules
    const privacyQuery = {
      owner: friendUserId,
      $or: [
        { privacy: 'public' },
        ...(isFriend ? [{ privacy: 'friends' }] : []),
      ],
    };

    const wishlists = await Wishlist.find(privacyQuery)
      .populate('owner', 'fullName username profileImage')
      .select('name description privacy category createdAt items')
      .sort({ createdAt: -1 });

    // Get item counts and preview items (top 3) for each wishlist
    const wishlistsWithCounts = await Promise.all(
      wishlists.map(async (wishlist) => {
        const itemCount = wishlist.items ? wishlist.items.length : 0;
        
        // Get top 3 items (by priority: high -> medium -> low, then by creation date)
        // Only show unpurchased items in preview
        const topItems = wishlist.items && wishlist.items.length > 0
          ? await Item.aggregate([
              { $match: { 
                  _id: { $in: wishlist.items },
                  isPurchased: false
                }
              },
              {
                $addFields: {
                  priorityOrder: {
                    $switch: {
                      branches: [
                        { case: { $eq: ['$priority', 'high'] }, then: 3 },
                        { case: { $eq: ['$priority', 'medium'] }, then: 2 },
                        { case: { $eq: ['$priority', 'low'] }, then: 1 }
                      ],
                      default: 0
                    }
                  }
                }
              },
              { $sort: { priorityOrder: -1, createdAt: -1 } },
              { $limit: 3 },
              { $project: { name: 1, image: 1, priority: 1, createdAt: 1, _id: 1 } }
            ])
          : [];

        return {
          ...wishlist.toObject(),
          itemCount,
          previewItems: topItems.map(item => ({
            _id: item._id,
            name: item.name,
            image: item.image
          }))
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: {
        wishlists: wishlistsWithCounts,
        count: wishlistsWithCounts.length,
      },
    });
  } catch (error) {
    console.error('Get friend wishlists error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get friend wishlists',
      error: error.message,
    });
  }
};

/**
 * Get friend's events based on privacy settings and invitations
 * GET /api/users/:friendUserId/events
 * 
 * Privacy Filtering Logic:
 * 1. If viewer == creator: Return all events (Personal Dashboard)
 * 2. If viewer != creator: Return ONLY events where user is explicitly invited (via EventInvitation)
 *    - Exclude events with invitationStatus: "not_invited"
 *    - Only return events where user is in the EventInvitation collection
 */
exports.getFriendEvents = async (req, res) => {
  try {
    const { friendUserId } = req.params;
    const currentUserId = req.user.id;

    // Case 1: If viewer is the creator, return all events (Personal Dashboard)
    if (currentUserId === friendUserId) {
      const allEvents = await Event.find({ creator: friendUserId })
        .populate('creator', 'fullName username profileImage')
        .populate('wishlist', 'name')
        .sort({ date: 1 });

      // Get invitations for invitation status
      const invitations = await EventInvitation.find({
        invitee: currentUserId,
      }).select('event status');

      const invitationStatusMap = {};
      invitations.forEach((inv) => {
        invitationStatusMap[inv.event.toString()] = inv.status;
      });

      // Process events with invitation status and other metadata
      const eventsWithStatus = await Promise.all(
        allEvents.map(async (event) => {
          const eventObj = event.toObject();
          const invitationStatus =
            invitationStatusMap[event._id.toString()] || 'not_invited';

          // Get top 3 accepted attendees
          const acceptedAttendees = await EventInvitation.find({
            event: event._id,
            status: { $in: ['accepted', 'maybe'] },
            invitee: { $ne: currentUserId }
          })
            .populate('invitee', 'fullName username profileImage')
            .sort({ updatedAt: -1 })
            .limit(3);

          // Get all invited friends from EventInvitation
          const allInvitations = await EventInvitation.find({ event: event._id })
            .select('invitee status updatedAt')
            .populate('invitee', '_id fullName username profileImage')
            .sort({ createdAt: 1 });

          const transformedInvitedFriends = allInvitations.map((invitation) => {
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

          // Compute status dynamically
          const eventDate = new Date(event.date);
          const now = new Date();
          const computedStatus = eventDate < now ? 'past' : 'upcoming';

          return {
            ...eventObj,
            status: computedStatus,
            invitationStatus,
            invited_friends: transformedInvitedFriends,
            attendees: acceptedAttendees.map(inv => ({
              _id: inv.invitee._id,
              fullName: inv.invitee.fullName,
              username: inv.invitee.username,
              profileImage: inv.invitee.profileImage
            }))
          };
        })
      );

      return res.status(200).json({
        success: true,
        data: {
          events: eventsWithStatus,
          count: eventsWithStatus.length,
        },
      });
    }

    // Case 2-5: Viewer is NOT the creator — return events they're invited to OR public events
    const invitations = await EventInvitation.find({
      invitee: currentUserId,
    }).select('event status');

    const invitedEventIds = invitations.map((inv) => inv.event.toString());
    const invitationStatusMap = {};
    invitations.forEach((inv) => {
      invitationStatusMap[inv.event.toString()] = inv.status;
    });

    const invitedObjectIds = invitedEventIds.map((id) => new mongoose.Types.ObjectId(id));
    const privacyQuery = {
      creator: friendUserId,
      $or: [
        { _id: { $in: invitedObjectIds } },
        { privacy: 'public' }
      ]
    };

    const events = await Event.find(privacyQuery)
      .populate('creator', 'fullName username profileImage')
      .populate('wishlist', 'name')
      .sort({ date: 1 });

    // Filter: Only return events where user is explicitly invited
    // All events returned should have invitationStatus (not 'not_invited')
    // Add invitation status, attendees (top 3 accepted), and populate invited_friends with user details
    const eventsWithStatus = await Promise.all(
      events.map(async (event) => {
        const eventObj = event.toObject();
        const invitationStatus =
          invitationStatusMap[event._id.toString()] || 'not_invited';

        // Get top 3 accepted attendees (excluding current user for social proof)
        const acceptedAttendees = await EventInvitation.find({
          event: event._id,
          status: { $in: ['accepted', 'maybe'] }, // Include both accepted and maybe
          invitee: { $ne: currentUserId } // Exclude current user
        })
          .populate('invitee', 'fullName username profileImage')
          .sort({ updatedAt: -1 }) // Most recent responses first
          .limit(3);

        // Get all invited friends with user details from EventInvitation collection (source of truth)
        const allInvitations = await EventInvitation.find({ event: event._id })
          .select('invitee status updatedAt')
          .populate('invitee', '_id fullName username profileImage')
          .sort({ createdAt: 1 });

        // Transform invited_friends using EventInvitation data with full user details
        const transformedInvitedFriends = allInvitations.map((invitation) => {
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

        // Compute status dynamically based on event date vs current time
        const eventDate = new Date(event.date);
        const now = new Date();
        const computedStatus = eventDate < now ? 'past' : 'upcoming';

        return {
          ...eventObj,
          status: computedStatus, // ✅ Override static status with computed dynamic status
          invitationStatus,
          invited_friends: transformedInvitedFriends, // ✅ Now includes fullName and user details
          attendees: acceptedAttendees.map(inv => ({
            _id: inv.invitee._id,
            fullName: inv.invitee.fullName,
            username: inv.invitee.username,
            profileImage: inv.invitee.profileImage
          }))
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: {
        events: eventsWithStatus,
        count: eventsWithStatus.length,
      },
    });
  } catch (error) {
    console.error('Get friend events error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get friend events',
      error: error.message,
    });
  }
};

/**
 * Get event attendees with their statuses
 * GET /api/events/:eventId/attendees
 */
exports.getEventAttendees = async (req, res) => {
  try {
    const { eventId } = req.params;
    const currentUserId = req.user.id;

    // Get event
    const event = await Event.findById(eventId).populate('creator', '_id');

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found',
      });
    }

    // Check if user has access to view this event
    const isFriend = await checkFriendshipStatus(
      currentUserId,
      event.creator._id.toString()
    );
    const isInvited = await EventInvitation.exists({
      event: eventId,
      invitee: currentUserId,
    });

    const hasAccess =
      event.privacy === 'public' ||
      (event.privacy === 'friends_only' && isFriend) ||
      (event.privacy === 'private' && isInvited) ||
      event.creator._id.toString() === currentUserId;

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view this event',
      });
    }

    // Get all attendees
    const attendees = await EventInvitation.find({ event: eventId })
      .populate('invitee', 'fullName username profileImage')
      .populate('inviter', 'fullName username')
      .sort({ createdAt: -1 });

    const attendeesList = attendees.map((inv) => ({
      user: inv.invitee,
      status: inv.status,
      invitedBy: inv.inviter,
      respondedAt: inv.respondedAt,
      invitedAt: inv.createdAt,
    }));

    // Get status counts
    const statusCounts = {
      accepted: attendees.filter((inv) => inv.status === 'accepted').length,
      declined: attendees.filter((inv) => inv.status === 'declined').length,
      maybe: attendees.filter((inv) => inv.status === 'maybe').length,
      pending: attendees.filter((inv) => inv.status === 'pending').length,
    };

    return res.status(200).json({
      success: true,
      data: {
        attendees: attendeesList,
        totalCount: attendeesList.length,
        statusCounts,
      },
    });
  } catch (error) {
    console.error('Get event attendees error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get event attendees',
      error: error.message,
    });
  }
};

/**
 * Get wishlists linked to an event
 * GET /api/events/:eventId/wishlists
 */
exports.getEventWishlists = async (req, res) => {
  try {
    const { eventId } = req.params;
    const currentUserId = req.user.id;

    // Get event
    const event = await Event.findById(eventId)
      .populate('creator', '_id')
      .populate('wishlist');

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found',
      });
    }

    // Check if user has access to view this event
    const isFriend = await checkFriendshipStatus(
      currentUserId,
      event.creator._id.toString()
    );
    const isInvited = await EventInvitation.exists({
      event: eventId,
      invitee: currentUserId,
    });

    const hasAccess =
      event.privacy === 'public' ||
      (event.privacy === 'friends_only' && isFriend) ||
      (event.privacy === 'private' && isInvited) ||
      event.creator._id.toString() === currentUserId;

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view this event',
      });
    }

    // Get linked wishlist if exists
    if (!event.wishlist) {
      return res.status(200).json({
        success: true,
        data: {
          wishlists: [],
          count: 0,
        },
      });
    }

    // Check if user has access to the wishlist based on its privacy
    const wishlist = event.wishlist;
    const wishlistOwnerId = wishlist.owner.toString();
    const isWishlistOwner = wishlistOwnerId === currentUserId;
    const isWishlistFriend = await checkFriendshipStatus(
      currentUserId,
      wishlistOwnerId
    );

    const hasWishlistAccess =
      isWishlistOwner ||
      wishlist.privacy === 'public' ||
      (wishlist.privacy === 'friends' && isWishlistFriend);

    if (!hasWishlistAccess) {
      return res.status(200).json({
        success: true,
        data: {
          wishlists: [],
          count: 0,
          message: 'Wishlist is private',
        },
      });
    }

    // Populate items with status information
    const populatedWishlist = await Wishlist.findById(wishlist._id)
      .populate({
        path: 'items',
        populate: {
          path: 'reservedBy',
          select: 'fullName username profileImage',
        },
      })
      .populate('owner', 'fullName username profileImage');

    // Get reservation info for items
    const itemIds = populatedWishlist.items.map((item) => item._id);
    const reservations = await Reservation.find({
      item: { $in: itemIds },
      status: 'reserved',
    });

    // Create reservation map
    const reservationMap = {};
    reservations.forEach((res) => {
      const itemId = res.item.toString();
      if (!reservationMap[itemId]) {
        reservationMap[itemId] = {
          totalReserved: 0,
          reservedByMe: false,
        };
      }
      reservationMap[itemId].totalReserved += res.quantity;
      if (res.reserver.toString() === currentUserId) {
        reservationMap[itemId].reservedByMe = true;
      }
    });

    // Add status to items
    const itemsWithStatus = populatedWishlist.items.map((item) => {
      const itemObj = item.toObject();
      const resInfo = reservationMap[item._id.toString()] || {
        totalReserved: 0,
        reservedByMe: false,
      };

      let itemStatus;
      // Check if item is received (owner marked as received)
      if (item.isReceived) {
        itemStatus = 'gifted';
      } else if (item.reservedBy) {
        // Item is reserved/purchased (reservedBy is not null)
        itemStatus = isWishlistOwner ? 'available' : 'reserved';
      } else if (resInfo.totalReserved >= item.quantity) {
        itemStatus = isWishlistOwner ? 'available' : 'reserved';
      } else {
        itemStatus = 'available';
      }

      return {
        ...itemObj,
        itemStatus,
        isReservedByMe: resInfo.reservedByMe,
        ...(!isWishlistOwner
          ? {
              totalReserved: resInfo.totalReserved,
              remainingQuantity: item.quantity - resInfo.totalReserved,
            }
          : {}),
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        wishlists: [
          {
            ...populatedWishlist.toObject(),
            items: itemsWithStatus,
          },
        ],
        count: 1,
      },
    });
  } catch (error) {
    console.error('Get event wishlists error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get event wishlists',
      error: error.message,
    });
  }
};
