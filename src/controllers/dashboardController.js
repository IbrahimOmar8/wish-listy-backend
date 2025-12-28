const User = require('../models/User');
const Wishlist = require('../models/Wishlist');
const EventInvitation = require('../models/Eventinvitation');
const Item = require('../models/Item');
const Notification = require('../models/Notification');

// @desc    Get dashboard home data
// @route   GET /api/dashboard/home
// @access  Private
exports.getHomeData = async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();

    // Get user details first (needed for friends list)
    const user = await User.findById(userId).select('fullName profileImage friends');
    const friendIds = user?.friends || [];

    // Fetch all data in parallel using Promise.all
    const [
      wishlists,
      totalWishlistsCount,
      eventInvitations,
      unreadNotificationsCount
    ] = await Promise.all([
      // 1. Get top 5 wishlists (sorted by updatedAt desc)
      Wishlist.find({ owner: userId })
        .select('_id name description privacy category updatedAt items')
        .sort({ updatedAt: -1 })
        .limit(5),

      // 2. Get total wishlists count
      Wishlist.countDocuments({ owner: userId }),

      // 3. Get upcoming event invitations (accepted or pending, date in future)
      EventInvitation.find({
        invitee: userId,
        status: { $in: ['accepted', 'pending'] }
      })
        .populate({
          path: 'event',
          match: { date: { $gte: now } }, // Filter events with future dates
          populate: {
            path: 'creator',
            select: '_id fullName username profileImage'
          },
          select: '_id name description date time type privacy location creator'
        }),

      // 4. Count unread notifications
      Notification.countDocuments({
        user: userId,
        isRead: false
      })
    ]);

    // Extract firstName from fullName
    const firstName = user?.fullName ? user.fullName.split(' ')[0] : 'User';

    // Filter out null events (events that don't match the date filter) and sort by date
    const upcomingOccasions = eventInvitations
      .filter(inv => inv.event && inv.event.date) // Ensure event exists and has date
      .map(inv => ({
        _id: inv.event._id,
        name: inv.event.name,
        description: inv.event.description,
        date: inv.event.date,
        time: inv.event.time,
        type: inv.event.type,
        privacy: inv.event.privacy,
        location: inv.event.location,
        creator: inv.event.creator,
        invitationStatus: inv.status
      }))
      .sort((a, b) => new Date(a.date) - new Date(b.date)); // Sort by date ascending (nearest first)

    // Get latest activity preview (optional - limit to 3 for dashboard preview)
    let latestActivityPreview = [];
    if (friendIds.length > 0) {
      const activityTypes = [
        'item_purchased',
        'item_reserved',
        'wishlist_shared',
        'event_invitation_accepted'
      ];

      const previewNotifications = await Notification.find({
        relatedUser: { $in: friendIds },
        type: { $in: activityTypes }
      })
        .populate({
          path: 'relatedUser',
          select: '_id fullName username profileImage'
        })
        .sort({ createdAt: -1 })
        .limit(3)
        .lean();

      latestActivityPreview = previewNotifications.map(notif => ({
        _id: notif._id,
        type: notif.type,
        message: notif.message,
        actor: {
          _id: notif.relatedUser._id,
          fullName: notif.relatedUser.fullName,
          username: notif.relatedUser.username,
          profileImage: notif.relatedUser.profileImage
        },
        createdAt: notif.createdAt
      }));
    }

    // Construct response
    res.status(200).json({
      success: true,
      data: {
        user: {
          firstName,
          avatar: user?.profileImage || null
        },
        stats: {
          wishlistsCount: totalWishlistsCount,
          unreadNotificationsCount
        },
        myWishlists: wishlists.map(w => ({
          _id: w._id,
          name: w.name,
          description: w.description,
          privacy: w.privacy,
          category: w.category,
          itemCount: w.items ? w.items.length : 0,
          updatedAt: w.updatedAt
        })),
        upcomingOccasions,
        latestActivityPreview
      }
    });
  } catch (error) {
    console.error('Get Dashboard Home Data Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard data'
    });
  }
};
