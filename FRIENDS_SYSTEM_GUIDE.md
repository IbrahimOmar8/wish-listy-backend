# Friends System Implementation Guide

This guide explains the complete friends system implementation for the Wish-Listy application.

## Overview

The friends system includes:
- User search by username, email, or phone (with friendship status)
- Friend request sending and management
- Friend request acceptance/rejection
- Get my friends list (with wishlist count)
- People you may know (friend suggestions)
- Real-time notifications via Socket.IO
- Notification system with database storage
- User profile viewing
- Logout functionality

## Architecture

### Models

#### User Model
Location: [src/models/User.js](src/models/User.js)

Added fields:
- `email`: String (optional, validated email format)
- `phone`: String (optional)
- `friends`: Array of User ObjectIds (existing)

#### FriendRequest Model
Location: [src/models/FriendRequest.js](src/models/FriendRequest.js)

Fields:
- `from`: ObjectId ref User (required)
- `to`: ObjectId ref User (required)
- `status`: enum ['pending', 'accepted', 'rejected'] (default: 'pending')
- `createdAt`: Date
- `updatedAt`: Date

Indexes:
- Compound unique index on `{from, to, status}` for pending requests only

#### Notification Model
Location: [src/models/Notification.js](src/models/Notification.js)

Fields:
- `user`: ObjectId ref User (required) - The user who receives the notification
- `type`: enum ['friend_request', 'friend_request_accepted', 'friend_request_rejected', 'event_invitation', 'item_purchased', 'wishlist_shared'] (required)
- `title`: String (required) - Notification title
- `message`: String (required) - Notification message
- `relatedUser`: ObjectId ref User (optional) - User related to the notification
- `relatedId`: ObjectId (optional) - ID of related entity (FriendRequest, Event, Item, etc.)
- `isRead`: Boolean (default: false)
- `createdAt`: Date

Indexes:
- Index on `{user, createdAt}` for efficient queries
- Index on `{user, isRead}` for filtering unread notifications

### Controllers

#### User Controller
Location: [src/controllers/userController.js](src/controllers/userController.js)

Methods:
- `searchUsers`: Search users by username, email, or phone with friendship status
- `getUserProfile`: Get public profile information for a user

#### Friend Controller
Location: [src/controllers/friendController.js](src/controllers/friendController.js)

Methods:
- `sendFriendRequest`: Send a friend request to another user (creates notification)
- `getMyFriends`: Get current user's friends list with wishlist counts
- `getFriendRequests`: Get all incoming pending friend requests
- `respondToFriendRequest`: Accept or reject a friend request (creates notification)
- `getFriendSuggestions`: Get friend suggestions based on mutual friends

#### Notification Controller
Location: [src/controllers/notificationController.js](src/controllers/notificationController.js)

Methods:
- `getNotifications`: Get all notifications with filtering and pagination
- `markAsRead`: Mark a single notification as read
- `markAllAsRead`: Mark all notifications as read
- `deleteNotification`: Delete a notification
- `getUnreadCount`: Get count of unread notifications

### Routes

#### User Routes
Location: [src/routes/userRoutes.js](src/routes/userRoutes.js)

- `GET /api/users/search?type={username|email|phone}&value={searchValue}`
- `GET /api/users/:id/profile`

#### Friend Routes
Location: [src/routes/friendRoutes.js](src/routes/friendRoutes.js)

- `GET /api/friends` - Get my friends list
- `POST /api/friends/request` - Send friend request
- `GET /api/friends/requests` - Get incoming requests
- `POST /api/friends/request/:id/respond` - Respond to request
- `GET /api/friends/suggestions` - Get friend suggestions

#### Notification Routes
Location: [src/routes/notificationRoutes.js](src/routes/notificationRoutes.js)

- `GET /api/notifications` - Get all notifications
- `GET /api/notifications/unread-count` - Get unread count
- `PATCH /api/notifications/:id/read` - Mark notification as read
- `PATCH /api/notifications/read-all` - Mark all as read
- `DELETE /api/notifications/:id` - Delete notification

#### Auth Routes (Updated)
Location: [src/routes/authRoutes.js](src/routes/authRoutes.js)

- `POST /api/auth/logout` - Logout user

### Socket.IO Integration

#### Server Setup
Location: [src/socket/index.js](src/socket/index.js)

Features:
- JWT authentication for socket connections
- User rooms for targeted notifications
- Event handlers for user status

Modified files:
- [server.js](server.js:15-19): Initialize Socket.IO and make it accessible to routes
- [src/app.js](src/app.js:67-68): Mount user and friend routes

## API Endpoints

### 1. Search Users

**Endpoint**: `GET /api/users/search`

**Query Parameters**:
- `type`: One of `username`, `email`, `phone`
- `value`: Search value (case-insensitive for username/email, normalized for phone)

**Features**:
- Excludes current user from results
- Phone search supports normalization (removes non-digits, matches any format)
- Returns friendship status for each user

**Example**:
```bash
GET /api/users/search?type=username&value=john
GET /api/users/search?type=phone&value=01010161601
```

**Response**:
```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "_id": "user_id",
      "fullName": "John Doe",
      "username": "johndoe",
      "profileImage": "https://...",
      "friendshipStatus": "sent",
      "friendRequestId": "request_id",
      "isFriend": false,
      "canSendRequest": false
    },
    {
      "_id": "user_id_2",
      "fullName": "Jane Smith",
      "username": "janesmith",
      "profileImage": "https://...",
      "friendshipStatus": "received",
      "friendRequestId": "request_id_2",
      "isFriend": false,
      "canSendRequest": false
    },
    {
      "_id": "user_id_3",
      "fullName": "Bob Wilson",
      "username": "bobwilson",
      "profileImage": "https://...",
      "friendshipStatus": "none",
      "friendRequestId": null,
      "isFriend": false,
      "canSendRequest": true
    }
  ]
}
```

**Friendship Status Values**:
- `"none"`: No existing relationship, can send request
- `"sent"`: Current user sent a friend request (pending)
- `"received"`: Current user received a friend request (pending)
- `"friends"`: Already friends

**Fields**:
- `friendshipStatus`: Current relationship status
- `friendRequestId`: ID of pending request (if exists)
- `isFriend`: Boolean indicating if already friends
- `canSendRequest`: Boolean indicating if send request button should be enabled

### 2. Get User Profile

**Endpoint**: `GET /api/users/:id/profile`

**Example**:
```bash
GET /api/users/507f1f77bcf86cd799439011/profile
```

**Response**:
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "fullName": "John Doe",
    "username": "johndoe",
    "profileImage": "https://...",
    "friendsCount": 42,
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### 3. Send Friend Request

**Endpoint**: `POST /api/friends/request`

**Body**:
```json
{
  "toUserId": "507f1f77bcf86cd799439011"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Friend request sent successfully",
  "data": {
    "_id": "request_id",
    "from": { /* user object */ },
    "to": { /* user object */ },
    "status": "pending",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Validations**:
- Cannot send request to yourself
- Cannot send if already friends
- Cannot send if pending request exists

**Behavior**:
- Creates notification for the receiver
- Emits Socket.IO event to receiver (if connected)

### 4. Get Friend Requests

**Endpoint**: `GET /api/friends/requests`

**Response**:
```json
{
  "success": true,
  "count": 3,
  "data": [
    {
      "_id": "request_id",
      "from": {
        "_id": "user_id",
        "fullName": "John Doe",
        "username": "johndoe",
        "profileImage": "https://..."
      },
      "status": "pending",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### 5. Respond to Friend Request

**Endpoint**: `POST /api/friends/request/:id/respond`

**Body**:
```json
{
  "action": "accept"
}
```
or
```json
{
  "action": "reject"
}
```

**Response (Accept)**:
```json
{
  "success": true,
  "message": "Friend request accepted",
  "data": { /* request object with status: 'accepted' */ }
}
```

**Behavior**:
- Only the receiver can respond
- On accept: Both users are added to each other's friends array
- On accept: Creates notification for the sender
- On reject: Request status is updated to 'rejected'
- On reject: Creates notification for the sender

### 6. Get My Friends

**Endpoint**: `GET /api/friends`

**Query Parameters** (optional):
- `limit`: Number of results per page (default: 100)
- `page`: Page number (default: 1)

**Response**:
```json
{
  "success": true,
  "count": 5,
  "total": 15,
  "page": 1,
  "limit": 100,
  "data": [
    {
      "_id": "user_id",
      "fullName": "John Doe",
      "username": "johndoe",
      "profileImage": "https://...",
      "wishlistCount": 5
    },
    {
      "_id": "user_id_2",
      "fullName": "Jane Smith",
      "username": "janesmith",
      "profileImage": "https://...",
      "wishlistCount": 12
    }
  ]
}
```

**Features**:
- Returns friends sorted alphabetically by fullName
- Includes wishlist count for each friend
- Supports pagination

### 7. Get Friend Suggestions

**Endpoint**: `GET /api/friends/suggestions`

**Response**:
```json
{
  "success": true,
  "count": 20,
  "data": [
    {
      "_id": "user_id",
      "fullName": "Jane Smith",
      "username": "janesmith",
      "profileImage": "https://...",
      "mutualFriendsCount": 5
    }
  ]
}
```

**Algorithm**:
- Excludes current user, existing friends, and users with pending/accepted requests
- Calculates mutual friends count
- Sorts by mutual friends count (descending)
- Limits to 20 suggestions

### 8. Get Notifications

**Endpoint**: `GET /api/notifications`

**Query Parameters** (optional):
- `read`: Filter by read status (`true` or `false`)
- `limit`: Number of results per page (default: 50)
- `page`: Page number (default: 1)

**Response**:
```json
{
  "success": true,
  "count": 10,
  "total": 25,
  "unreadCount": 5,
  "data": [
    {
      "_id": "notification_id",
      "type": "friend_request",
      "title": "New Friend Request",
      "message": "John Doe sent you a friend request",
      "relatedUser": {
        "_id": "user_id",
        "fullName": "John Doe",
        "username": "johndoe",
        "profileImage": "https://..."
      },
      "relatedId": "friend_request_id",
      "isRead": false,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

**Notification Types**:
- `friend_request`: New friend request received
- `friend_request_accepted`: Friend request accepted
- `friend_request_rejected`: Friend request rejected
- `event_invitation`: Event invitation
- `item_purchased`: Item purchased from wishlist
- `wishlist_shared`: Wishlist shared with user

### 9. Mark Notification as Read

**Endpoint**: `PATCH /api/notifications/:id/read`

**Response**:
```json
{
  "success": true,
  "message": "Notification marked as read",
  "data": { /* notification object */ }
}
```

### 10. Mark All Notifications as Read

**Endpoint**: `PATCH /api/notifications/read-all`

**Response**:
```json
{
  "success": true,
  "message": "All notifications marked as read",
  "updatedCount": 5
}
```

### 11. Get Unread Count

**Endpoint**: `GET /api/notifications/unread-count`

**Response**:
```json
{
  "success": true,
  "unreadCount": 5
}
```

### 12. Delete Notification

**Endpoint**: `DELETE /api/notifications/:id`

**Response**:
```json
{
  "success": true,
  "message": "Notification deleted successfully"
}
```

### 13. Logout

**Endpoint**: `POST /api/auth/logout`

**Response**:
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

**Note**: JWT tokens are stateless, so logout is primarily handled on the client side by removing the token from storage.

## Socket.IO Events

### Client Connection

**For Local Development (Mobile Simulator)**:
```javascript
// Android Emulator
const socket = io('http://10.0.2.2:5000', {
  auth: {
    token: 'YOUR_JWT_TOKEN'
  },
  transports: ['websocket', 'polling']
});

// iOS Simulator or Real Device on same network
const socket = io('http://192.168.1.11:5000', {
  auth: {
    token: 'YOUR_JWT_TOKEN'
  },
  transports: ['websocket', 'polling']
});
```

**Important Notes**:
- Server listens on `0.0.0.0` to accept connections from network devices
- Use `10.0.2.2` for Android emulator (special IP to access host machine)
- Use your machine's local IP (e.g., `192.168.1.11`) for real devices on same network
- Always include `transports: ['websocket', 'polling']` for compatibility

### Events Emitted to Clients

#### 1. friend_request
Sent when a user receives a new friend request.

**Payload**:
```json
{
  "requestId": "request_id",
  "from": {
    "_id": "user_id",
    "fullName": "John Doe",
    "username": "johndoe",
    "profileImage": "https://..."
  },
  "message": "John Doe sent you a friend request"
}
```

#### 2. friend_request_accepted
Sent when someone accepts your friend request.

**Payload**:
```json
{
  "requestId": "request_id",
  "user": {
    "_id": "user_id",
    "fullName": "Jane Smith",
    "username": "janesmith",
    "profileImage": "https://..."
  },
  "message": "Jane Smith accepted your friend request"
}
```

#### 3. friend_request_rejected
Sent when someone rejects your friend request.

**Payload**:
```json
{
  "requestId": "request_id",
  "message": "Your friend request was rejected"
}
```

#### 4. user_status
Broadcast when a user comes online.

**Payload**:
```json
{
  "userId": "user_id",
  "status": "online"
}
```

### Client Example

See [client-socket-example.js](client-socket-example.js) for a complete working example.

## Testing the System

### Prerequisites
1. Start the server: `npm start`
2. Have at least 2 user accounts registered

### Test Flow

1. **Search for users**:
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" \
     "http://localhost:5000/api/users/search?type=username&value=john"
   ```

2. **Send friend request**:
   ```bash
   curl -X POST http://localhost:5000/api/friends/request \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"toUserId": "TARGET_USER_ID"}'
   ```

3. **Check incoming requests** (as the other user):
   ```bash
   curl -H "Authorization: Bearer OTHER_USER_TOKEN" \
     http://localhost:5000/api/friends/requests
   ```

4. **Accept the request**:
   ```bash
   curl -X POST http://localhost:5000/api/friends/request/REQUEST_ID/respond \
     -H "Authorization: Bearer OTHER_USER_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"action": "accept"}'
   ```

5. **Get my friends**:
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" \
     "http://localhost:5000/api/friends?limit=20&page=1"
   ```

6. **Get friend suggestions**:
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:5000/api/friends/suggestions
   ```

7. **Get notifications**:
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" \
     "http://localhost:5000/api/notifications?read=false&limit=20"
   ```

8. **Get unread count**:
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:5000/api/notifications/unread-count
   ```

9. **Mark notification as read**:
   ```bash
   curl -X PATCH http://localhost:5000/api/notifications/NOTIFICATION_ID/read \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

10. **Logout**:
   ```bash
   curl -X POST http://localhost:5000/api/auth/logout \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

## Security Considerations

1. **Authentication**: All routes require JWT authentication via the `protect` middleware
2. **Authorization**: Users can only respond to requests sent to them
3. **Input Validation**: All inputs are validated before processing
4. **Socket Authentication**: Socket.IO connections require valid JWT tokens
5. **Rate Limiting**: Consider adding rate limiting for friend requests to prevent spam

## Error Handling

All endpoints return consistent error responses:

```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message"
}
```

Common HTTP status codes:
- `200`: Success
- `201`: Created (friend request sent)
- `400`: Bad request (validation errors)
- `401`: Unauthorized (invalid/missing token)
- `403`: Forbidden (not authorized for this action)
- `404`: Not found (user/request not found)
- `500`: Server error

## Key Features Implemented

1. ✅ **Phone Search Normalization**: Phone numbers are normalized (non-digits removed) to match any format
2. ✅ **Friendship Status in Search**: Search results include relationship status (sent/received/friends/none)
3. ✅ **Notifications System**: Database-stored notifications for friend requests
4. ✅ **My Friends List**: Get friends with wishlist counts
5. ✅ **Mobile Network Support**: Server listens on 0.0.0.0 for mobile device access
6. ✅ **Socket.IO Mobile Compatibility**: Enhanced configuration for mobile clients

## Future Enhancements

Potential improvements:
1. Block/unblock users functionality
2. Friend request expiration
3. Notification preferences
4. Friend lists/groups
5. Activity feed for friends
6. Online status indicator
7. Last seen timestamp
8. Friend request notifications via email/SMS
9. Mutual friends display (already in suggestions)
10. Friend recommendations based on interests
11. Unfriend functionality
12. Cancel sent friend requests

## Files Created/Modified

### New Files
- `src/models/FriendRequest.js` - Friend request model
- `src/models/Notification.js` - Notification model
- `src/controllers/userController.js` - User search and profile
- `src/controllers/friendController.js` - Friend management
- `src/controllers/notificationController.js` - Notification management
- `src/routes/userRoutes.js` - User routes
- `src/routes/friendRoutes.js` - Friend routes
- `src/routes/notificationRoutes.js` - Notification routes
- `src/socket/index.js` - Socket.IO initialization
- `client-socket-example.js` - Client example

### Modified Files
- `src/models/User.js` - Added email and phone fields
- `src/controllers/userController.js` - Added friendship status in search results, phone normalization
- `src/controllers/friendController.js` - Added getMyFriends, notification creation on friend requests
- `src/controllers/authController.js` - Added logout function
- `src/app.js` - Mounted new routes, updated CORS and Helmet config
- `server.js` - Initialized Socket.IO, listen on 0.0.0.0 for network access
- `src/socket/index.js` - Enhanced Socket.IO configuration for mobile compatibility

## Support

For issues or questions, refer to the inline code comments or check the API response messages for detailed error information.
