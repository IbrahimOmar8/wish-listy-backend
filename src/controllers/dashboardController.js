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
      friendWishlistIds,
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

      // 4. Get wishlist IDs owned by friends (for friend activity)
      friendIds.length > 0
        ? Wishlist.find({ owner: { $in: friendIds } }).distinct('_id')
        : Promise.resolve([]),

      // 5. Count unread notifications
      Notification.countDocuments({
        user: userId,
        isRead: false
      })
    ]);

    // Get friend activity items (after getting friend wishlist IDs)
    const friendItems = friendWishlistIds.length > 0
      ? await Item.find({
          wishlist: { $in: friendWishlistIds }
        })
          .populate({
            path: 'wishlist',
            select: 'owner',
            populate: {
              path: 'owner',
              select: '_id fullName username profileImage'
            }
          })
          .sort({ createdAt: -1 })
          .limit(10)
      : [];

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

    // Transform friend items to include owner info
    const friendActivity = friendItems
      .filter(item => item.wishlist && item.wishlist.owner) // Filter items with valid wishlist and owner
      .map(item => ({
        _id: item._id,
        name: item.name,
        description: item.description,
        image: item.image,
        url: item.url,
        priority: item.priority,
        createdAt: item.createdAt,
        wishlist: {
          _id: item.wishlist._id,
          owner: item.wishlist.owner
        }
      }));

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
        friendActivity
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
