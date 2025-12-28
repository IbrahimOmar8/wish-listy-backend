const Notification = require('../models/Notification');
const User = require('../models/User');
const Item = require('../models/Item');
const Event = require('../models/Event');
const Wishlist = require('../models/Wishlist');

/**
 * @desc    Get friend activities (paginated)
 * @route   GET /api/activities
 * @access  Private
 * @query   page (default: 1), limit (default: 10)
 */
exports.getFriendActivities = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Time constraint: Only activities from the last 15 days
    const now = new Date();
    const fifteenDaysAgo = new Date(now.getTime() - (15 * 24 * 60 * 60 * 1000));

    // Maximum total results cap (prevent infinite scrolling into old data)
    const MAX_TOTAL_RESULTS = 100;

    // Get user's friends list
    const user = await User.findById(userId).select('friends');
    const friendIds = user?.friends || [];

    if (friendIds.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        pagination: {
          currentPage: page,
          totalPages: 0,
          totalItems: 0,
          hasNextPage: false,
          limit
        }
      });
    }

    // Query notifications where relatedUser (actor) is in friends list
    // Filter by activity-related notification types and time constraint
    const activityTypes = [
      'item_purchased',
      'item_reserved',
      'wishlist_shared',
      'event_invitation_accepted'
    ];

    // Build query with time constraint
    const baseQuery = {
      relatedUser: { $in: friendIds },
      type: { $in: activityTypes },
      createdAt: { $gte: fifteenDaysAgo }
    };

    // Count total matching notifications for pagination (capped at MAX_TOTAL_RESULTS)
    const totalItemsUncapped = await Notification.countDocuments(baseQuery);
    const totalItems = Math.min(totalItemsUncapped, MAX_TOTAL_RESULTS);

    // Fetch paginated notifications with time constraint and result cap
    // Apply limit to query to respect MAX_TOTAL_RESULTS
    const queryLimit = Math.min(limit, MAX_TOTAL_RESULTS - skip);
    
    // If skip exceeds MAX_TOTAL_RESULTS, return empty results
    if (skip >= MAX_TOTAL_RESULTS || queryLimit <= 0) {
      return res.status(200).json({
        success: true,
        data: [],
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalItems / limit),
          totalItems,
          hasNextPage: false,
          limit
        }
      });
    }

    const notifications = await Notification.find(baseQuery)
      .populate({
        path: 'relatedUser',
        select: '_id fullName username profileImage'
      })
      .sort({ createdAt: -1 }) // Sort descending by createdAt (newest first)
      .skip(skip)
      .limit(queryLimit)
      .lean();

    // Enrich notifications with related entity details
    const enrichedActivities = await Promise.all(
      notifications.map(async (notification) => {
        const activity = {
          _id: notification._id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          actor: {
            _id: notification.relatedUser._id,
            fullName: notification.relatedUser.fullName,
            username: notification.relatedUser.username,
            profileImage: notification.relatedUser.profileImage
          },
          createdAt: notification.createdAt
        };

        // Populate related entity based on type and relatedId
        if (notification.relatedId) {
          if (notification.type === 'item_purchased' || notification.type === 'item_reserved') {
            const item = await Item.findById(notification.relatedId)
              .select('_id name description image url wishlist')
              .populate({
                path: 'wishlist',
                select: '_id name owner',
                populate: {
                  path: 'owner',
                  select: '_id fullName username profileImage'
                }
              })
              .lean();

            if (item) {
              activity.target = {
                type: 'item',
                data: item
              };
            }
          } else if (notification.type.includes('event')) {
            const event = await Event.findById(notification.relatedId)
              .select('_id name description date time type location creator')
              .populate({
                path: 'creator',
                select: '_id fullName username profileImage'
              })
              .lean();

            if (event) {
              activity.target = {
                type: 'event',
                data: event
              };
            }
          } else if (notification.type === 'wishlist_shared') {
            const wishlist = await Wishlist.findById(notification.relatedId)
              .select('_id name description privacy owner')
              .populate({
                path: 'owner',
                select: '_id fullName username profileImage'
              })
              .lean();

            if (wishlist) {
              activity.target = {
                type: 'wishlist',
                data: wishlist
              };
            }
          }
        }

        return activity;
      })
    );

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalItems / limit);
    const hasNextPage = page < totalPages;

    res.status(200).json({
      success: true,
      data: enrichedActivities,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems,
        hasNextPage,
        limit
      }
    });
  } catch (error) {
    console.error('Get Friend Activities Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch friend activities',
      error: error.message
    });
  }
};
