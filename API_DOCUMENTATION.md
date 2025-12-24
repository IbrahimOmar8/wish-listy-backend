# Wish-Listy API Documentation - New Features

## تحديثات جديدة للـ APIs

### 1. نظام الحجز (Reservation System)

#### حجز عنصر من قائمة أمنيات صديق
```
POST /api/items/:itemId/reserve
```

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "quantity": 1
}
```

**Response (Success - 201):**
```json
{
  "success": true,
  "message": "Item reserved successfully",
  "data": {
    "reservation": {
      "id": "reservation_id",
      "item": "item_id",
      "quantity": 1,
      "status": "reserved"
    }
  }
}
```

**ملاحظات:**
- لا يمكن حجز العناصر الخاصة بك
- يتم إرسال إشعار للمالك بدون الكشف عن هوية الحاجز
- لا يمكن حجز عنصر تم تحديده كـ "Gifted"
- يتم التحقق من الكمية المتاحة قبل الحجز

---

#### إلغاء حجز عنصر
```
DELETE /api/items/:itemId/reserve
```

**Headers:**
```
Authorization: Bearer <token>
```

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Reservation cancelled successfully"
}
```

---

#### الحصول على حجوزاتي
```
GET /api/reservations?status=reserved
```

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `status`: (optional) `reserved` | `cancelled` (default: `reserved`)

**Response (Success - 200):**
```json
{
  "success": true,
  "data": {
    "reservations": [
      {
        "_id": "reservation_id",
        "item": {
          "name": "Item name",
          "description": "Item description",
          "image": "image_url",
          "wishlist": {
            "name": "Wishlist name",
            "owner": {
              "fullName": "Friend Name",
              "username": "friend_username",
              "profileImage": "profile_image_url"
            }
          }
        },
        "quantity": 1,
        "status": "reserved",
        "createdAt": "2025-12-23T..."
      }
    ],
    "count": 1
  }
}
```

---

### 2. بروفايل الصديق (Friend Profile) //////////////////////////////////////////

#### عرض بروفايل صديق
```
GET /api/users/:friendUserId/profile
```

**Headers:**
```
Authorization: Bearer <token>
```

**Response (Success - 200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_id",
      "fullName": "Friend Name",
      "username": "friend_username",
      "profileImage": "image_url",
      "createdAt": "2025-01-01T..."
    },
    "counts": {
      "wishlists": 5,
      "events": 3,
      "friends": 42
    },
    "friendshipStatus": {
      "isFriend": true
    }
  }
}
```

--- //////////////////////////////////////////

#### عرض قوائم أمنيات صديق (مع تطبيق الخصوصية)
```
GET /api/users/:friendUserId/wishlists
```

**Headers:**
```
Authorization: Bearer <token>
```

**Response (Success - 200):**
```json
{
  "success": true,
  "data": {
    "wishlists": [
      {
        "_id": "wishlist_id",
        "name": "Birthday Wishlist",
        "description": "My birthday wishes",
        "privacy": "friends",
        "category": "birthday",
        "owner": {
          "fullName": "Friend Name",
          "username": "friend_username"
        },
        "itemCount": 5,
        "createdAt": "2025-01-01T..."
      }
    ],
    "count": 1
  }
}
```

**قواعد الخصوصية:**
- يتم عرض القوائم ذات الخصوصية `public` للجميع
- يتم عرض القوائم ذات الخصوصية `friends` فقط للأصدقاء
- لا يتم عرض القوائم ذات الخصوصية `private` أبداً

---

#### عرض أحداث صديق (مع تطبيق الخصوصية وحالة الدعوة)
```
GET /api/users/:friendUserId/events
```

**Headers:**
```
Authorization: Bearer <token>
```

**Response (Success - 200):**
```json
{
  "success": true,
  "data": {
    "events": [
      {
        "_id": "event_id",
        "name": "Birthday Party",
        "description": "My 25th birthday celebration",
        "date": "2025-02-15T...",
        "time": "18:00",
        "type": "birthday",
        "privacy": "friends_only",
        "mode": "in_person",
        "location": "Cairo, Egypt",
        "creator": {
          "fullName": "Friend Name",
          "username": "friend_username"
        },
        "wishlist": {
          "name": "Birthday Wishlist"
        },
        "invitationStatus": "accepted"
      }
    ],
    "count": 1
  }
}
```

**قواعد الخصوصية:**
- `public`: يتم عرضها للجميع، حالة الدعوة = `not_invited`
- `friends_only`: تُعرض للأصدقاء فقط، حالة الدعوة = `not_invited` أو حالة الدعوة الفعلية
- `private`: تُعرض فقط للمدعوين، حالة الدعوة = `pending` | `accepted` | `declined` | `maybe`

**حالات الدعوة:**
- `pending`: في انتظار الرد
- `accepted`: تم القبول
- `declined`: تم الرفض
- `maybe`: ربما
- `not_invited`: غير مدعو (للأحداث العامة والأصدقاء)

---

### 3. تفاصيل الحدث (Event Details)

#### عرض تفاصيل حدث (لصديق أو لك)
```
GET /api/events/:eventId
```

**Headers:**
```
Authorization: Bearer <token>
```

**Response (Success - 200):**
```json
{
  "success": true,
  "data": {
    "_id": "event_id",
    "name": "Birthday Party",
    "description": "My 25th birthday celebration",
    "date": "2025-02-15T...",
    "time": "18:00",
    "type": "birthday",
    "privacy": "friends_only",
    "mode": "in_person",
    "location": "Cairo, Egypt",
    "creator": {
      "_id": "creator_id",
      "fullName": "Friend Name",
      "username": "friend_username",
      "profileImage": "profile_image_url"
    },
    "wishlist": {
      "_id": "wishlist_id",
      "name": "Birthday Wishlist",
      "description": "...",
      "items": [...]
    },
    "invited_friends": [
      {
        "user": {
          "_id": "user_id",
          "fullName": "Ahmed Ali",
          "username": "ahmed_ali",
          "profileImage": "image_url"
        },
        "status": "accepted",
        "updatedAt": "2025-01-15T..."
      }
    ]
  },
  "stats": {
    "total_invited": 10,
    "pending": 2,
    "accepted": 7,
    "declined": 1,
    "maybe": 0
  }
}
```

**قواعد الخصوصية والوصول:**
- **`public`**: يمكن لأي مستخدم موثق مشاهدته
- **`friends_only`**: يمكن للأصدقاء فقط مشاهدته
- **`private`**: يمكن للمدعوين والمالك فقط مشاهدته
- إذا لم تكن لديك صلاحية الوصول → `403 Forbidden`

**ملاحظات:**
- يمكن استخدام هذا الـ API لعرض تفاصيل أي event (سواء كان لك أو لصديق)
- يتم التحقق من قواعد الخصوصية تلقائياً
- إذا كان الـ event لصديق، يمكنك رؤية تفاصيله إذا كان `public` أو `friends_only` (وأنت صديقه) أو `private` (وأنت مدعو)

---

#### عرض المدعوين لحدث
```
GET /api/events/:eventId/attendees
```

**Headers:**
```
Authorization: Bearer <token>
```

**Response (Success - 200):**
```json
{
  "success": true,
  "data": {
    "attendees": [
      {
        "user": {
          "fullName": "Ahmed Ali",
          "username": "ahmed_ali",
          "profileImage": "image_url"
        },
        "status": "accepted",
        "invitedBy": {
          "fullName": "Event Creator",
          "username": "creator"
        },
        "respondedAt": "2025-01-15T...",
        "invitedAt": "2025-01-10T..."
      }
    ],
    "totalCount": 10,
    "statusCounts": {
      "accepted": 7,
      "declined": 1,
      "maybe": 1,
      "pending": 1
    }
  }
}
```

---

#### عرض قوائم الأمنيات المرتبطة بالحدث
```
GET /api/events/:eventId/wishlists
```

**Headers:**
```
Authorization: Bearer <token>
```

**Response (Success - 200):**
```json
{
  "success": true,
  "data": {
    "wishlists": [
      {
        "_id": "wishlist_id",
        "name": "Birthday Wishlist",
        "description": "My birthday wishes",
        "privacy": "friends",
        "owner": {
          "fullName": "Friend Name",
          "username": "friend_username"
        },
        "items": [
          {
            "_id": "item_id",
            "name": "Book: Clean Code",
            "description": "Programming book",
            "image": "image_url",
            "priority": "high",
            "quantity": 1,
            "itemStatus": "available",
            "isReservedByMe": false,
            "totalReserved": 0,
            "remainingQuantity": 1
          }
        ]
      }
    ],
    "count": 1
  }
}
```

**ملاحظات:**
- يتم تطبيق قواعد الخصوصية على القوائم المرتبطة
- العناصر تأتي مع حالتها (`available`, `reserved`, `gifted`)
- المالك لا يرى تفاصيل الحجز للحفاظ على المفاجأة

---///////////////////////

### 4. تحديثات على API تفاصيل Wishlist

#### الحصول على قائمة أمنيات بالتفصيل (مع حالات العناصر)
```
GET /api/wishlists/:id
```

**Headers:**
```
Authorization: Bearer <token>
```

**Response (Success - 200):**
```json
{
  "success": true,
  "wishlist": {
    "_id": "wishlist_id",
    "name": "My Birthday Wishlist",
    "description": "Things I want for my birthday",
    "privacy": "friends",
    "owner": {
      "fullName": "User Name",
      "username": "username"
    },
    "items": [
      {
        "_id": "item_id",
        "name": "Book: Clean Code",
        "description": "Programming book",
        "url": "https://amazon.com/...",
        "storeName": "Amazon",
        "priority": "high",
        "quantity": 2,
        "isPurchased": false,
        "itemStatus": "available",
        "availableQuantity": 1,
        "isReservedByMe": false,
        "totalReserved": 1,
        "remainingQuantity": 1
      },
      {
        "_id": "item_id_2",
        "name": "Headphones",
        "itemStatus": "reserved",
        "availableQuantity": 0,
        "isReservedByMe": true,
        "totalReserved": 1,
        "remainingQuantity": 0
      },
      {
        "_id": "item_id_3",
        "name": "Watch",
        "itemStatus": "gifted",
        "isPurchased": true,
        "purchasedBy": {
          "fullName": "Friend Name",
          "username": "friend"
        }
      }
    ]
  },
  "stats": {
    "totalItems": 10,
    "purchasedItems": 2,
    "pendingItems": 8
  },
  "isOwner": false
}
```

**حالات العنصر (itemStatus):**

| الحالة | الوصف | متى تظهر |
|--------|-------|----------|
| `available` | متاح للحجز | العنصر لم يُحجز أو محجوز جزئياً |
| `reserved` | محجوز بالكامل | تم حجز كل الكمية (يراها الأصدقاء فقط) |
| `gifted` | تم استلامه | المالك علّم على العنصر أنه تم استلامه |

**ملاحظات:**
- **للمالك (Owner):** يرى جميع العناصر كـ `available` أو `gifted` فقط (للحفاظ على المفاجأة)
- **للصديق (Friend):** يرى الحالة الفعلية للعناصر مع تفاصيل الحجز
- `isReservedByMe`: هل أنا من حجز هذا العنصر
- `totalReserved`: إجمالي الكمية المحجوزة (لا يظهر للمالك)
- `remainingQuantity`: الكمية المتبقية للحجز (لا يظهر للمالك)

---

## نظام الإشعارات

تم إضافة نوع إشعار جديد: `item_reserved`

**مثال على الإشعار:**
```json
{
  "type": "item_reserved",
  "title": "Item Reserved",
  "message": "Someone has reserved \"Book: Clean Code\" from your wishlist \"Birthday Wishlist\"",
  "relatedId": "item_id",
  "isRead": false
}
```

**Socket.IO Event:**
```javascript
socket.on('item_reserved', (data) => {
  // data.notification
  // data.unreadCount
});
```

---

## أمثلة على سيناريوهات الاستخدام

### السيناريو 1: مشاهدة قائمة أمنيات صديق وحجز عنصر

1. **عرض بروفايل الصديق:**
   ```
   GET /api/users/123/profile
   ```

2. **عرض قوائم الأمنيات:**
   ```
   GET /api/users/123/wishlists
   ```

3. **عرض تفاصيل قائمة معينة:**
   ```
   GET /api/wishlists/456
   ```

4. **حجز عنصر:**
   ```
   POST /api/items/789/reserve
   {
     "quantity": 1
   }
   ```

5. **الصديق يتلقى إشعاراً فورياً** (عبر Socket.IO)

---

### السيناريو 2: مشاهدة حدث صديق وقوائم الأمنيات المرتبطة

1. **عرض أحداث الصديق:**
   ```
   GET /api/users/123/events
   ```

2. **عرض تفاصيل حدث (لصديق):**
   ```
   GET /api/events/456
   ```
   
   **ملاحظة:** يمكن استخدام نفس الـ API لعرض تفاصيل event لصديق - يتم التحقق من قواعد الخصوصية تلقائياً

3. **عرض المدعوين:**
   ```
   GET /api/events/456/attendees
   ```

4. **عرض قوائم الأمنيات المرتبطة:**
   ```
   GET /api/events/456/wishlists
   ```

5. **حجز عنصر من القائمة المرتبطة:**
   ```
   POST /api/items/789/reserve
   ```

---

### السيناريو 3: التحقق من حجوزاتي

1. **عرض جميع حجوزاتي:**
   ```
   GET /api/reservations
   ```

2. **إلغاء حجز:**
   ```
   DELETE /api/items/789/reserve
   ```

---

## قواعد الأمان والخصوصية

### Wishlist Privacy Rules
- **public**: يمكن لأي مستخدم موثق مشاهدتها
- **friends**: يمكن للأصدقاء فقط مشاهدتها
- **private**: يمكن للمالك فقط مشاهدتها

### Event Privacy Rules
- **public**: يمكن لأي مستخدم موثق مشاهدته
- **friends_only**: يمكن للأصدقاء فقط مشاهدته
- **private**: يمكن للمدعوين والمالك فقط مشاهدته

### Reservation Rules
- لا يمكن حجز عناصرك الشخصية
- لا يمكن حجز عنصر تم تحديده كـ Gifted
- لا يتم الكشف عن هوية الحاجز للمالك
- يتم التحقق من الكمية المتاحة تلقائياً
- يمكن للمستخدم تحديث كمية الحجز أو إلغاؤه

---

## نموذج البيانات الجديد

### Reservation Model
```javascript
{
  item: ObjectId (ref: 'Item'),
  reserver: ObjectId (ref: 'User'),
  quantity: Number (default: 1, min: 1),
  status: String (enum: ['reserved', 'cancelled']),
  createdAt: Date,
  updatedAt: Date
}
```

### Item Model Updates
تمت إضافة حقل جديد:
```javascript
{
  quantity: Number (default: 1, min: 1)
}
```

### Notification Types Update
تمت إضافة نوع جديد:
```javascript
{
  type: 'item_reserved'
}
```

---

## Postman Collection

يمكنك استيراد هذه الطلبات في Postman للاختبار:

### Environment Variables
```
base_url: http://localhost:4000/api
token: <your_jwt_token>
```

### Example Requests

**Reserve Item:**
```
POST {{base_url}}/items/{{item_id}}/reserve
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "quantity": 1
}
```

**Get Friend Profile:**
```
GET {{base_url}}/users/{{friend_id}}/profile
Authorization: Bearer {{token}}
```

**Get Friend Wishlists:**
```
GET {{base_url}}/users/{{friend_id}}/wishlists
Authorization: Bearer {{token}}
```

**Get Friend Events:**
```
GET {{base_url}}/users/{{friend_id}}/events
Authorization: Bearer {{token}}
```

**Get Event Details (Friend's Event):**
```
GET {{base_url}}/events/{{event_id}}
Authorization: Bearer {{token}}
```

**Get Event Attendees:**
```
GET {{base_url}}/events/{{event_id}}/attendees
Authorization: Bearer {{token}}
```

**Get Event Wishlists:**
```
GET {{base_url}}/events/{{event_id}}/wishlists
Authorization: Bearer {{token}}
```
