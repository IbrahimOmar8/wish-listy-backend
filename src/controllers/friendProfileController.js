const User = require('../models/User');
const Wishlist = require('../models/Wishlist');
const Event = require('../models/Event');
const EventInvitation = require('../models/Eventinvitation');
const FriendRequest = require('../models/FriendRequest');
const Reservation = require('../models/Reservation');

/**
 * Helper function to check friendship status
 */
const checkFriendshipStatus = async (currentUserId, targetUserId) => {
  const user = await User.findById(currentUserId);
  const isFriend = user.friends.includes(targetUserId);

  return isFriend;
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

    // Check friendship status
    const isFriend = await checkFriendshipStatus(currentUserId, friendUserId);

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
        friendshipStatus: {
          isFriend,
        },
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
      .select('name description privacy category createdAt')
      .sort({ createdAt: -1 });

    // Get item counts for each wishlist
    const wishlistsWithCounts = await Promise.all(
      wishlists.map(async (wishlist) => {
        const itemCount = wishlist.items ? wishlist.items.length : 0;
        return {
          ...wishlist.toObject(),
          itemCount,
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
 */
exports.getFriendEvents = async (req, res) => {
  try {
    const { friendUserId } = req.params;
    const currentUserId = req.user.id;

    // Check friendship status
    const isFriend = await checkFriendshipStatus(currentUserId, friendUserId);

    // Get events where user is explicitly invited
    const invitations = await EventInvitation.find({
      invitee: currentUserId,
    }).select('event status');

    const invitedEventIds = invitations.map((inv) => inv.event);
    const invitationStatusMap = {};
    invitations.forEach((inv) => {
      invitationStatusMap[inv.event.toString()] = inv.status;
    });

    // Build query based on privacy rules
    const privacyQuery = {
      creator: friendUserId,
      $or: [
        { privacy: 'public' },
        ...(isFriend ? [{ privacy: 'friends_only' }] : []),
        { _id: { $in: invitedEventIds }, privacy: 'private' },
      ],
    };

    const events = await Event.find(privacyQuery)
      .populate('creator', 'fullName username profileImage')
      .populate('wishlist', 'name')
      .sort({ date: 1 });

    // Add invitation status to each event
    const eventsWithStatus = events.map((event) => {
      const eventObj = event.toObject();
      const invitationStatus =
        invitationStatusMap[event._id.toString()] || 'not_invited';

      return {
        ...eventObj,
        invitationStatus,
      };
    });

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
          path: 'purchasedBy',
          select: 'fullName username',
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
      if (item.isPurchased) {
        itemStatus = 'gifted';
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
