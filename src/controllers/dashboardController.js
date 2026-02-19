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
    // Fetch activities directly from Items (not from Notifications)
    let latestActivityPreview = [];
    if (friendIds.length > 0) {
      // Time constraint: Only activities from the last 15 days
      const fifteenDaysAgo = new Date(now.getTime() - (15 * 24 * 60 * 60 * 1000));

      // Get wishlist IDs owned by friends - exclude private (only public/friends visible to friends)
      const friendWishlists = await Wishlist.find({
        owner: { $in: friendIds },
        privacy: { $in: ['public', 'friends'] }
      })
        .select('_id owner name')
        .populate({
          path: 'owner',
          select: '_id fullName username profileImage'
        })
        .lean();

      if (friendWishlists.length > 0) {
        const wishlistIds = friendWishlists.map(w => w._id);
        const wishlistOwnerMap = new Map(
          friendWishlists.map(w => [w._id.toString(), w.owner])
        );
        const wishlistNameMap = new Map(
          friendWishlists.map(w => [w._id.toString(), w.name])
        );

        // Get items added by friends (created in last 15 days)
        const addedItems = await Item.find({
          wishlist: { $in: wishlistIds },
          createdAt: { $gte: fifteenDaysAgo }
        })
          .select('_id name wishlist createdAt')
          .sort({ createdAt: -1 })
          .limit(10)
          .lean();

        // Get items marked as received by friends (updated in last 15 days)
        const receivedItems = await Item.find({
          wishlist: { $in: wishlistIds },
          isReceived: true,
          updatedAt: { $gte: fifteenDaysAgo }
        })
          .select('_id name wishlist updatedAt')
          .sort({ updatedAt: -1 })
          .limit(10)
          .lean();

        // Combine and transform activities
        const activities = [];

        // Add "item_added" activities
        for (const item of addedItems) {
          const wishlistIdStr = item.wishlist.toString();
          const owner = wishlistOwnerMap.get(wishlistIdStr);
          const wishlistName = wishlistNameMap.get(wishlistIdStr);
          
          if (owner) {
            activities.push({
              _id: item._id,
              type: 'wishlist_item_added',
              actor: {
                _id: owner._id,
                fullName: owner.fullName,
                username: owner.username,
                profileImage: owner.profileImage
              },
              target: {
                type: 'item',
                itemName: item.name,
                wishlistName: wishlistName
              },
              createdAt: item.createdAt
            });
          }
        }

        // Add "item_received" activities
        for (const item of receivedItems) {
          const wishlistIdStr = item.wishlist.toString();
          const owner = wishlistOwnerMap.get(wishlistIdStr);
          const wishlistName = wishlistNameMap.get(wishlistIdStr);
          
          if (owner) {
            activities.push({
              _id: item._id,
              type: 'item_received',
              actor: {
                _id: owner._id,
                fullName: owner.fullName,
                username: owner.username,
                profileImage: owner.profileImage
              },
              target: {
                type: 'item',
                itemName: item.name,
                wishlistName: wishlistName
              },
              createdAt: item.updatedAt
            });
          }
        }

        // Sort by createdAt descending and limit to 3
        latestActivityPreview = activities
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          .slice(0, 3);
      }
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
