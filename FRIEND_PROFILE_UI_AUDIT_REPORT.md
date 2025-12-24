# Friend Profile UI Requirements - Backend Audit Report

## 📋 Executive Summary

This report audits the backend APIs against the Rich UI requirements for the Friend Profile flow. **2 out of 3 endpoints need modifications** to support the UI requirements.

---

## 1. Friend Profile Header - `GET /api/users/:friendUserId/profile`

### ✅ Status: ⚠️ **Missing Data**

### Current Implementation Analysis:
**Location:** `src/controllers/friendProfileController.js:22-77`

**Current Response:**
```json
{
  "success": true,
  "data": {
    "user": {...},
    "counts": {...},
    "friendshipStatus": {
      "isFriend": true  // ❌ Only boolean!
    }
  }
}
```

### Missing Fields:
- **Detailed `friendshipStatus`** with one of: `pending_sent`, `pending_received`, `friends`, or `none`
- Currently only returns `isFriend: boolean`, which doesn't tell us:
  - If there's a pending request
  - Who sent the request (viewer or friend)
  - If no relationship exists

### Code Suggestion:

**Update `checkFriendshipStatus` helper and `getFriendProfile`:**

```javascript
// src/controllers/friendProfileController.js

/**
 * Helper function to check detailed friendship status
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
      return { status: 'pending_sent', requestId: pendingRequest._id };
    } else {
      return { status: 'pending_received', requestId: pendingRequest._id };
    }
  }

  return { status: 'none' };
};

exports.getFriendProfile = async (req, res) => {
  try {
    const { friendUserId } = req.params;
    const currentUserId = req.user.id;

    // ... existing code to get targetUser ...

    // Get detailed friendship status
    const friendshipInfo = await getFriendshipStatus(currentUserId, friendUserId);

    // ... existing counts code ...

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
        friendshipStatus: friendshipInfo, // ✅ Now returns {status: 'friends'|'pending_sent'|'pending_received'|'none', requestId?: string}
      },
    });
  } catch (error) {
    // ... error handling ...
  }
};
```

**Expected Response After Fix:**
```json
{
  "success": true,
  "data": {
    "friendshipStatus": {
      "status": "pending_received",  // ✅ Detailed status
      "requestId": "request_id_123"  // ✅ For Accept/Reject actions
    }
  }
}
```

---

## 2. Wishlist Cards (Rich Preview) - `GET /api/users/:friendUserId/wishlists`

### ✅ Status: ⚠️ **Missing Data**

### Current Implementation Analysis:
**Location:** `src/controllers/friendProfileController.js:83-131`

**Current Response:**
```json
{
  "success": true,
  "data": {
    "wishlists": [
      {
        "_id": "wishlist_id",
        "name": "Birthday Wishlist",
        "itemCount": 5,  // ❌ Only count, NO items!
        ...
      }
    ]
  }
}
```

**Code Issue:**
- Line 100-103: Query does NOT populate items
- Line 106-114: Only calculates `itemCount` from `wishlist.items.length` (array of ObjectIds)

### Missing Fields:
- **Top 3 Items** with `name` and `image` for preview bubbles
- Items are NOT populated at all in the response

### Code Suggestion:

**Update `getFriendWishlists` to populate top 3 items:**

```javascript
// src/controllers/friendProfileController.js

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
      .select('name description privacy category createdAt items') // ✅ Include items field
      .sort({ createdAt: -1 });

    // ✅ Get top 3 items for each wishlist (with images/names for preview)
    const wishlistsWithItems = await Promise.all(
      wishlists.map(async (wishlist) => {
        const itemCount = wishlist.items ? wishlist.items.length : 0;
        
        // Get top 3 items (by priority: high -> medium -> low, then by creation date)
        const topItems = await Item.find({ 
          _id: { $in: wishlist.items },
          isPurchased: false // ✅ Only show unpurchased items in preview
        })
          .select('name image priority createdAt')
          .sort({ 
            priority: -1, // high priority first
            createdAt: -1 
          })
          .limit(3); // ✅ Only top 3

        return {
          ...wishlist.toObject(),
          itemCount,
          previewItems: topItems.map(item => ({
            _id: item._id,
            name: item.name,
            image: item.image // ✅ For preview bubble
          }))
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: {
        wishlists: wishlistsWithItems,
        count: wishlistsWithItems.length,
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
```

**Don't forget to import Item model:**
```javascript
const Item = require('../models/Item'); // ✅ Add at top of file
```

**Expected Response After Fix:**
```json
{
  "success": true,
  "data": {
    "wishlists": [
      {
        "_id": "wishlist_id",
        "name": "Birthday Wishlist",
        "itemCount": 5,
        "previewItems": [  // ✅ Top 3 items for preview bubbles
          {
            "_id": "item_1",
            "name": "iPhone 15",
            "image": "https://..."
          },
          {
            "_id": "item_2",
            "name": "Watch",
            "image": "https://..."
          },
          {
            "_id": "item_3",
            "name": "Book",
            "image": null
          }
        ],
        ...
      }
    ]
  }
}
```

---

## 3. Event Cards (Social Proof & Actions) - `GET /api/users/:friendUserId/events`

### ✅ Status: ⚠️ **Partially Missing Data**

### Current Implementation Analysis:
**Location:** `src/controllers/friendProfileController.js:137-198`

**Current Response:**
```json
{
  "success": true,
  "data": {
    "events": [
      {
        "_id": "event_id",
        "name": "Birthday Party",
        "invitationStatus": "accepted",  // ✅ Present!
        // ❌ NO attendees array for social proof
        ...
      }
    ]
  }
}
```

**Code Analysis:**
- ✅ Line 174-179: `invitationStatus` is correctly added (viewer's RSVP status)
- ❌ No attendees array is included for social proof preview

### Missing Fields:
- **Attendees array** with top 3 users who accepted (for facepile/avatar stack)
- Should include: `fullName`, `username`, `profileImage` for each attendee

### Code Suggestion:

**Update `getFriendEvents` to include attendees:**

```javascript
// src/controllers/friendProfileController.js

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

    // ✅ Get attendees (top 3 accepted) for each event
    const eventsWithStatusAndAttendees = await Promise.all(
      events.map(async (event) => {
        const eventObj = event.toObject();
        const invitationStatus =
          invitationStatusMap[event._id.toString()] || 'not_invited';

        // ✅ Get top 3 accepted attendees (excluding current user for social proof)
        const acceptedAttendees = await EventInvitation.find({
          event: event._id,
          status: 'accepted',
          invitee: { $ne: currentUserId } // Exclude current user
        })
          .populate('invitee', 'fullName username profileImage')
          .sort({ updatedAt: -1 })
          .limit(3); // ✅ Only top 3 for preview

        return {
          ...eventObj,
          invitationStatus,
          attendees: acceptedAttendees.map(inv => ({
            _id: inv.invitee._id,
            fullName: inv.invitee.fullName,
            username: inv.invitee.username,
            profileImage: inv.invitee.profileImage
          })) // ✅ Social proof preview
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: {
        events: eventsWithStatusAndAttendees,
        count: eventsWithStatusAndAttendees.length,
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
```

**Expected Response After Fix:**
```json
{
  "success": true,
  "data": {
    "events": [
      {
        "_id": "event_id",
        "name": "Birthday Party",
        "invitationStatus": "accepted",  // ✅ Viewer's status
        "attendees": [  // ✅ Top 3 accepted attendees for social proof
          {
            "_id": "user_1",
            "fullName": "Ahmed Ali",
            "username": "ahmed_ali",
            "profileImage": "https://..."
          },
          {
            "_id": "user_2",
            "fullName": "Sarah Mohamed",
            "username": "sarah_m",
            "profileImage": "https://..."
          },
          {
            "_id": "user_3",
            "fullName": "Omar Hassan",
            "username": "omar_h",
            "profileImage": "https://..."
          }
        ],
        ...
      }
    ]
  }
}
```

---

## 📊 Summary Table

| Endpoint | Requirement | Status | Missing Data |
|----------|------------|--------|--------------|
| `GET /users/:id/profile` | Detailed `friendshipStatus` | ⚠️ **Missing** | Status detail (`pending_sent`/`pending_received`/`friends`/`none`) + `requestId` |
| `GET /users/:id/wishlists` | Top 3 items preview | ⚠️ **Missing** | `previewItems` array with `name` and `image` |
| `GET /users/:id/events` | `invitationStatus` | ✅ **Ready** | None (already present) |
| `GET /users/:id/events` | Attendees preview (3 avatars) | ⚠️ **Missing** | `attendees` array with user details |

---

## 🚀 Implementation Priority

1. **HIGH Priority:** `getFriendProfile` - friendshipStatus detail (needed for Action Buttons)
2. **HIGH Priority:** `getFriendWishlists` - previewItems (needed for Rich UI cards)
3. **MEDIUM Priority:** `getFriendEvents` - attendees array (nice-to-have for social proof)

---

## ✅ Verification Checklist

After implementing the fixes, verify:

- [ ] `friendshipStatus.status` returns one of: `'friends'`, `'pending_sent'`, `'pending_received'`, `'none'`
- [ ] `friendshipStatus.requestId` is present when status is `'pending_sent'` or `'pending_received'`
- [ ] Each wishlist in response includes `previewItems` array (max 3 items)
- [ ] `previewItems` contains `name` and `image` fields
- [ ] Only unpurchased items are included in `previewItems`
- [ ] Each event in response includes `attendees` array (max 3 users)
- [ ] `attendees` contains `fullName`, `username`, `profileImage`
- [ ] Only users with `status: 'accepted'` are included in `attendees`
- [ ] Current user is excluded from `attendees` array

---

## 📝 Notes

- All suggested code changes are backward compatible (adding fields, not removing)
- The `previewItems` and `attendees` arrays are limited to 3 items for performance
- Items in `previewItems` are sorted by priority (high → medium → low) then by creation date
- Attendees are sorted by `updatedAt` (most recent acceptances first)
