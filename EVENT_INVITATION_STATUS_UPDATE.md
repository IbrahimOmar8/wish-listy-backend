# 📋 Event Invitation Status Update

## Summary

Updated the Event Model and API to track invitation statuses for each friend in the `invited_friends` array.

---

## 🔄 Schema Changes

### Before:
```javascript
invited_friends: [{
  type: mongoose.Schema.Types.ObjectId,
  ref: 'User'
}]
```

### After:
```javascript
invited_friends: [{
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'declined', 'maybe'],
    default: 'pending'
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}]
```

---

## 📝 Controller Updates

### 1. **createEvent**
- ✅ Creates `invited_friends` array with objects containing `user`, `status: 'pending'`, and `updatedAt`
- ✅ Populates `invited_friends.user` field in response
- ✅ Returns status for each friend

### 2. **updateEvent**
- ✅ Handles `invited_friends` updates with status preservation
- ✅ Preserves existing statuses when updating friends list
- ✅ Sets new friends to `'pending'` status
- ✅ Populates `invited_friends.user` field

### 3. **getEventById**
- ✅ Populates `invited_friends.user` field
- ✅ Calculates stats dynamically from `invited_friends` array:
  - `total_invited`: Total number of invited friends
  - `pending`: Count of friends with 'pending' status
  - `accepted`: Count of friends with 'accepted' status
  - `declined`: Count of friends with 'declined' status
  - `maybe`: Count of friends with 'maybe' status
- ✅ Returns full friend details with status

### 4. **getMyEvents**
- ✅ Populates `invited_friends.user` field for both created and invited events
- ✅ Returns status for each friend

### 5. **respondToInvitation**
- ✅ Updates status in both `EventInvitation` collection AND `Event.invited_friends` array
- ✅ Syncs status changes in real-time
- ✅ Calculates stats from `invited_friends` array
- ✅ Returns updated event with status information

### 6. **inviteFriends**
- ✅ Adds new friends to `invited_friends` array with `status: 'pending'`
- ✅ Prevents duplicate entries
- ✅ Populates `invited_friends.user` field

### 7. **getPublicEvents**
- ✅ Populates `invited_friends.user` field
- ✅ Returns status information

---

## 📊 API Response Format

### Example Response (GET /api/events/:id):

```json
{
  "success": true,
  "data": {
    "_id": "event_id",
    "name": "Birthday Party",
    "creator": {
      "_id": "creator_id",
      "fullName": "John Doe",
      "username": "johndoe",
      "profileImage": "https://..."
    },
    "invited_friends": [
      {
        "user": {
          "_id": "user_id_1",
          "fullName": "Jane Smith",
          "username": "janesmith",
          "profileImage": "https://..."
        },
        "status": "accepted",
        "updatedAt": "2024-01-15T10:30:00.000Z"
      },
      {
        "user": {
          "_id": "user_id_2",
          "fullName": "Bob Wilson",
          "username": "bobwilson",
          "profileImage": "https://..."
        },
        "status": "pending",
        "updatedAt": "2024-01-15T10:00:00.000Z"
      },
      {
        "user": {
          "_id": "user_id_3",
          "fullName": "Alice Brown",
          "username": "alicebrown",
          "profileImage": "https://..."
        },
        "status": "declined",
        "updatedAt": "2024-01-15T11:00:00.000Z"
      }
    ],
    // ... other event fields
  },
  "stats": {
    "total_invited": 3,
    "pending": 1,
    "accepted": 1,
    "declined": 1,
    "maybe": 0
  }
}
```

---

## 🔑 Key Features

1. **Status Tracking**: Each friend's invitation status is stored in the event document
2. **Real-time Sync**: When a user responds to an invitation, the status is updated in both:
   - `EventInvitation` collection (for invitations tracking)
   - `Event.invited_friends` array (for event details)
3. **Dynamic Stats**: Stats are calculated from the `invited_friends` array, not from separate aggregation
4. **Populated User Data**: Frontend receives full friend details (name, username, profileImage) along with status
5. **Status Preservation**: When updating event friends, existing statuses are preserved

---

## ⚠️ Migration Notes

### For Existing Events:
- Existing events with old `invited_friends` structure (array of ObjectIds) will need migration
- You may need to run a migration script to convert old format to new format

### Migration Script Example:
```javascript
// Run this once to migrate existing events
const events = await Event.find({});
for (const event of events) {
  if (event.invited_friends && event.invited_friends.length > 0) {
    // Check if already migrated (has status field)
    if (!event.invited_friends[0].status) {
      event.invited_friends = event.invited_friends.map(userId => ({
        user: userId,
        status: 'pending',
        updatedAt: new Date()
      }));
      await event.save();
    }
  }
}
```

---

## ✅ Testing Checklist

- [ ] Create event with invited_friends
- [ ] Update event with new invited_friends
- [ ] Get event by ID - verify status is returned
- [ ] Get my events - verify status is returned
- [ ] Respond to invitation - verify status updates in event
- [ ] Stats calculation - verify correct counts
- [ ] Public events - verify status is returned

---

## 📚 Related Files

- `src/models/Event.js` - Schema definition
- `src/controllers/Eventcontroller.js` - All controller methods
- `src/models/Eventinvitation.js` - Separate invitation tracking (still used for notifications)

---

**Last Updated**: 2024-01-15
