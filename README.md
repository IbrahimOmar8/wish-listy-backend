# Wish Listy Backend API

A complete RESTful API for the Wish Listy mobile application built with Node.js, Express, and MongoDB.

## Features

- ✅ User registration and login with username and password
- ✅ User profile management
- ✅ Create and manage wishlists (Public/Private/Friends Only)
- ✅ Add/Update/Delete wishlist items
- ✅ Mark items as purchased
- ✅ Category-based wishlists
- ✅ JWT-based authentication
- ✅ MongoDB for data persistence
- ✅ bcryptjs for secure password hashing

## Tech Stack

- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **MongoDB** - Database
- **Mongoose** - ODM
- **JWT** - Authentication
- **bcryptjs** - Password hashing

## Prerequisites

- Node.js (v14 or higher)
- MongoDB (local or Atlas)

## Installation

1. **Clone the repository**
```bash
git clone <your-repo-url>
cd wish-listy-backend
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**

Create a `.env` file in the root directory and add:

```env
# Server
NODE_ENV=development
PORT=5000

# Database
MONGODB_URI=mongodb://localhost:27017/wish-listy

# JWT
JWT_SECRET=your_super_secret_jwt_key_change_this_in_production
JWT_EXPIRE=7d
```

4. **Start MongoDB**
```bash
# If using local MongoDB
mongod

# Or use MongoDB Atlas (cloud)
```

5. **Run the application**
```bash
# Development mode
npm run dev

# Production mode
npm start
```

The server will start on `http://localhost:5000`

## API Endpoints

### Authentication

#### Register New User
```http
POST /api/auth/register
Content-Type: application/json

{
  "fullName": "John Doe",
  "username": "johndoe",
  "password": "securePassword123"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "60f7b3b3b3b3b3b3b3b3b3b3",
    "fullName": "John Doe",
    "username": "johndoe"
  }
}
```

**Validation:**
- `fullName`: Required, min 1 character
- `username`: Required, min 3 characters, unique, alphanumeric with underscores and hyphens
- `password`: Required, min 6 characters

---

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "johndoe",
  "password": "securePassword123"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "60f7b3b3b3b3b3b3b3b3b3b3",
    "fullName": "John Doe",
    "username": "johndoe",
    "profileImage": null
  }
}
```

**Error Responses:**
```json
{
  "success": false,
  "message": "User not found"
}
```
```json
{
  "success": false,
  "message": "Invalid password"
}
```

---

#### Get Current User
```http
GET /api/auth/me
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "user": {
    "_id": "60f7b3b3b3b3b3b3b3b3b3b3",
    "fullName": "John Doe",
    "username": "johndoe",
    "profileImage": null,
    "isVerified": true,
    "friends": [],
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

---

### Items

#### Add Item to Wishlist
```http
POST /api/items
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "iPhone 15 Pro",
  "description": "Latest iPhone",
  "wishlistId": "60f7b3b3b3b3b3b3b3b3b3b3",
  "priority": "high"
}
```

**Optional location fields (send only the relevant one(s) based on user input):**

**Option 1: Product URL**
```json
{
  "name": "iPhone 15 Pro",
  "description": "Latest iPhone",
  "wishlistId": "60f7b3b3b3b3b3b3b3b3b3b3",
  "url": "https://apple.com/iphone-15-pro",
  "priority": "high"
}
```

**Option 2: Store Details**
```json
{
  "name": "Winter Jacket",
  "description": "Blue winter jacket",
  "wishlistId": "60f7b3b3b3b3b3b3b3b3b3b3",
  "storeName": "H&M",
  "storeLocation": "Downtown Mall, Street 5",
  "priority": "medium"
}
```

**Option 3: Custom Text**
```json
{
  "name": "Book - Clean Code",
  "description": "Programming book",
  "wishlistId": "60f7b3b3b3b3b3b3b3b3b3b3",
  "notes": "Available at any bookstore or online",
  "priority": "low"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "item": {
    "_id": "60f7b3b3b3b3b3b3b3b3b3b3",
    "name": "iPhone 15 Pro",
    "description": "Latest iPhone",
    "url": "https://apple.com/iphone-15-pro",
    "storeName": null,
    "storeLocation": null,
    "notes": null,
    "priority": "high",
    "wishlistId": "60f7b3b3b3b3b3b3b3b3b3b3",
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

---

#### Get Items in Wishlist
```http
GET /api/items/wishlist/:wishlistId
Authorization: Bearer <token>
```

---

#### Update Item
```http
PUT /api/items/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated Item Name",
  "description": "Updated description",
  "url": "https://updated-url.com",
  "storeName": "Updated Store",
  "storeLocation": "Updated Location",
  "notes": "Updated notes",
  "priority": "high"
}
```

**Note:** All fields are optional. Update only the fields you want to change.

**Response (200 OK):**
```json
{
  "success": true,
  "item": {
    "_id": "60f7b3b3b3b3b3b3b3b3b3b3",
    "name": "Updated Item Name",
    "description": "Updated description",
    // ...other updated fields
  }
}
```

---

#### Mark Item as Purchased
```http
PUT /api/items/:id/purchase
Authorization: Bearer <token>
```

---

#### Delete Item
```http
DELETE /api/items/:id
Authorization: Bearer <token>
```

---

### Wishlists

#### Create Wishlist
```http
POST /api/wishlists
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "My Birthday Wishlist",
  "description": "Things I want for my birthday",
  "privacy": "public",
  "category": "birthday"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "wishlist": {
    "_id": "60f7b3b3b3b3b3b3b3b3b3b3",
    "name": "My Birthday Wishlist",
    "description": "Things I want for my birthday",
    "privacy": "public",
    "category": "birthday",
    "owner": "60f7b3b3b3b3b3b3b3b3b3b3"
  }
}
```

---

#### Get My Wishlists
```http
GET /api/wishlists
Authorization: Bearer <token>
```

---

#### Get Wishlist by ID
```http
GET /api/wishlists/:id
Authorization: Bearer <token>
```

---

#### Update Wishlist
```http
PUT /api/wishlists/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated Wishlist Name",
  "description": "Updated description",
  "privacy": "private",
  "category": "wedding"
}
```

**Note:** All fields are optional. Update only the fields you want to change.

**Response (200 OK):**
```json
{
  "success": true,
  "wishlist": {
    "_id": "60f7b3b3b3b3b3b3b3b3b3b3",
    "name": "Updated Wishlist Name",
    "description": "Updated description",
    "privacy": "private",
    "category": "wedding",
    // ...other fields
  }
}
```

---

#### Delete Wishlist
```http
DELETE /api/wishlists/:id
Authorization: Bearer <token>
```

---

## Project Structure

```
wish-listy-backend/
├── src/
│   ├── config/
│   │   └── database.js           # MongoDB connection
│   ├── models/
│   │   ├── User.js               # User model
│   │   ├── Wishlist.js           # Wishlist model
│   │   └── Item.js               # Item model
│   ├── controllers/
│   │   ├── authController.js     # Auth logic
│   │   ├── wishlistController.js # Wishlist logic
│   │   └── itemController.js     # Item logic
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── wishlistRoutes.js
│   │   └── itemRoutes.js
│   ├── middleware/
│   │   ├── auth.js               # JWT verification
│   │   └── errorHandler.js       # Error handling
│   ├── utils/
│   │   └── jwt.js                # JWT utilities
│   ├── app.js                    # Express app
│   └── server.js                 # Server entry point
├── .env                          # Environment variables
├── .gitignore
├── package.json
└── README.md
```

## Authentication

This API uses JWT (JSON Web Tokens) for authentication.

**How to use:**
1. Register or login to get a token
2. Include the token in the `Authorization` header for protected routes
3. Format: `Authorization: Bearer <your_token_here>`

**Token Details:**
- Expires in 7 days
- Secret key stored in `JWT_SECRET` environment variable

---

## Error Handling

All endpoints return errors in the following format:

```json
{
  "success": false,
  "message": "Error description"
}
```

**Common HTTP Status Codes:**
- `200` - OK
- `201` - Created
- `400` - Bad Request (validation error)
- `401` - Unauthorized (missing or invalid token)
- `404` - Not Found
- `500` - Server Error

---

## User Model

```javascript
{
  _id: ObjectId,
  fullName: String (required),
  username: String (required, unique, 3+ chars),
  password: String (required, 6+ chars, hashed),
  profileImage: String (optional),
  isVerified: Boolean (default: false),
  friends: [ObjectId],
  createdAt: Date,
  updatedAt: Date
}
```

---

## Security Notes

- Always use HTTPS in production
- Keep `JWT_SECRET` secure and unique
- Use environment variables for all secrets
- Implement rate limiting for login attempts
- Add input validation and sanitization
- Use helmet for security headers
- Passwords are hashed with bcryptjs (10 salt rounds)
- Password field is excluded from default queries (`select: false`)

---

## Development Tips

1. **Testing with Postman**
   - Import API endpoints
   - Set Authorization header with Bearer token
   - Test each endpoint

2. **MongoDB**
   - Use MongoDB Compass for GUI
   - Or use mongo shell for CLI

3. **JWT Token**
   - Access token expires in 90 days by default (`JWT_EXPIRE=90d` in `.env`)
   - Refresh token (1 year default) is returned on login/verify; use `POST /api/auth/refresh` with body `{ "refreshToken": "..." }` to get a new access token when it expires
   - Include access token in Authorization header: `Bearer <token>`
   - On logout, send optional body `{ "refreshToken": "..." }` to revoke that session, or `{ "all": true }` to revoke all sessions (logout from all devices)

---

## Deployment

### Heroku
```bash
heroku create wish-listy-api
heroku config:set NODE_ENV=production
heroku config:set MONGODB_URI=<your-mongodb-uri>
heroku config:set JWT_SECRET=<your-secret>
git push heroku main
```

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

---

## License

MIT License

---

## Support

For issues and questions, please open an issue on GitHub.

---

Built with ❤️ for Wish Listy
