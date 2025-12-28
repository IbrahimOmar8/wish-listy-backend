const User = require('../models/User');
const Item = require('../models/Item');
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

    // Get wishlist IDs owned by friends with owner info
    const friendWishlists = await Wishlist.find({ owner: { $in: friendIds } })
      .select('_id owner name')
      .populate({
        path: 'owner',
        select: '_id fullName username profileImage'
      })
      .lean();

    if (friendWishlists.length === 0) {
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
      .select('_id name description image url wishlist createdAt')
      .sort({ createdAt: -1 })
      .limit(MAX_TOTAL_RESULTS)
      .lean();

    // Get items marked as received by friends (updated in last 15 days)
    const receivedItems = await Item.find({
      wishlist: { $in: wishlistIds },
      isReceived: true,
      updatedAt: { $gte: fifteenDaysAgo }
    })
      .select('_id name description image url wishlist updatedAt')
      .sort({ updatedAt: -1 })
      .limit(MAX_TOTAL_RESULTS)
      .lean();

    // Combine and transform activities
    const allActivities = [];

    // Add "item_added" activities
    for (const item of addedItems) {
      const wishlistIdStr = item.wishlist.toString();
      const owner = wishlistOwnerMap.get(wishlistIdStr);
      const wishlistName = wishlistNameMap.get(wishlistIdStr);
      
      if (owner) {
        allActivities.push({
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
            wishlistName: wishlistName,
            data: {
              _id: item._id,
              name: item.name,
              description: item.description,
              image: item.image,
              url: item.url,
              wishlist: {
                _id: wishlistIdStr,
                name: wishlistName
              }
            }
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
        allActivities.push({
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
            wishlistName: wishlistName,
            data: {
              _id: item._id,
              name: item.name,
              description: item.description,
              image: item.image,
              url: item.url,
              wishlist: {
                _id: wishlistIdStr,
                name: wishlistName
              }
            }
          },
          createdAt: item.updatedAt
        });
      }
    }

    // Sort by createdAt descending
    allActivities.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Apply total results cap
    const cappedActivities = allActivities.slice(0, MAX_TOTAL_RESULTS);
    const totalItems = cappedActivities.length;

    // Apply pagination
    const paginatedActivities = cappedActivities.slice(skip, skip + limit);

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalItems / limit);
    const hasNextPage = page < totalPages;

    res.status(200).json({
      success: true,
      data: paginatedActivities,
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
