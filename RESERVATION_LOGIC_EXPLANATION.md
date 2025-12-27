# شرح منطق نظام الحجز (Reservation System Logic)

## 📋 المخطط العام

```
┌─────────────────────────────────────────────────────────────┐
│                    Reservation Flow                          │
└─────────────────────────────────────────────────────────────┘

1. Item Model (في قاعدة البيانات):
   - isPurchased: false
   - purchasedBy: null
   - quantity: 2

2. Reservation Collection (منفصلة):
   - User A حجز 1 قطعة → { item: itemId, reserver: userA, quantity: 1, status: 'reserved' }
   - User B حجز 1 قطعة → { item: itemId, reserver: userB, quantity: 1, status: 'reserved' }

3. عند عرض العنصر:
   - totalReserved = 2 (من Reservation collection)
   - availableQuantity = 2 - 2 = 0
   - isReservedByMe = true (إذا كنت User A أو B)
   - isReserved = true (إذا كان محجوز بواسطة شخص آخر)
```

---

## 🔄 عملية الحجز (Reserve Item)

### الخطوة 1: التحقق من الصلاحيات
```javascript
// ❌ المالك لا يمكنه حجز عناصر في قائمته
if (item.wishlist.owner === currentUser) {
  return 403: "You cannot reserve your own items"
}

// ❌ لا يمكن حجز عنصر تم استلامه
if (item.isReceived) {
  return 400: "Cannot reserve an item that has been received"
}
```

### الخطوة 2: تحديد الإجراء (Action Determination)
```javascript
let shouldReserve;

if (action === "cancel") {
  shouldReserve = false;  // إلغاء الحجز
} else if (action === "reserve") {
  shouldReserve = true;   // حجز
} else {
  // Toggle: إذا كان محجوز → إلغاء، وإلا → حجز
  shouldReserve = !(reservationExists && status === 'reserved');
}
```

### الخطوة 3: إلغاء الحجز (Cancel Logic)
```javascript
if (!shouldReserve) {
  // البحث عن الحجز الحالي
  const reservation = await Reservation.findOne({
    item: itemId,
    reserver: currentUser,
    status: 'reserved'
  });

  // تحديث status إلى 'cancelled'
  reservation.status = 'cancelled';
  await reservation.save();

  return {
    message: "Reservation cancelled successfully",
    isReserved: false
  };
}
```

### الخطوة 4: حجز العنصر (Reserve Logic)
```javascript
if (shouldReserve) {
  // 1. حساب إجمالي الحجوزات الحالية
  const existingReservations = await Reservation.find({
    item: itemId,
    status: 'reserved'  // فقط الحجوزات النشطة
  });

  const totalReserved = existingReservations.reduce(
    (sum, res) => sum + res.quantity, 
    0
  );

  // 2. التحقق من الكمية المتاحة
  const availableQuantity = item.quantity - totalReserved;
  
  if (requestedQuantity > availableQuantity) {
    return 400: `Only ${availableQuantity} available`;
  }

  // 3. إنشاء أو تحديث الحجز
  let reservation = await Reservation.findOne({
    item: itemId,
    reserver: currentUser
  });

  if (!reservation) {
    // إنشاء حجز جديد
    reservation = await Reservation.create({
      item: itemId,
      reserver: currentUser,
      quantity: requestedQuantity,
      status: 'reserved'
    });
  } else if (reservation.status === 'cancelled') {
    // إعادة تفعيل حجز سابق
    reservation.status = 'reserved';
    reservation.quantity = requestedQuantity;
    await reservation.save();
  } else {
    // تحديث كمية حجز موجود
    reservation.quantity = requestedQuantity;
    await reservation.save();
  }

  // 4. إرسال إشعار للمالك (بدون كشف من حجز)
  await Notification.create({
    user: item.wishlist.owner,
    type: 'item_reserved',
    message: `Someone has reserved "${item.name}"`
  });

  return {
    message: "Item reserved successfully",
    isReserved: true
  };
}
```

---

## 👁️ عرض العنصر (View Item Logic)

### في `GET /api/wishlists/:id` - عرض القائمة

```javascript
// 1. جلب جميع العناصر
const wishlist = await Wishlist.findById(id)
  .populate('items')
  .populate('owner');

// 2. جلب جميع الحجوزات النشطة لجميع العناصر في القائمة
const itemIds = wishlist.items.map(item => item._id);

const reservations = await Reservation.find({
  item: { $in: itemIds },
  status: 'reserved'  // فقط النشطة
}).populate('reserver');

// 3. إنشاء خريطة للحجوزات (Map) للبحث السريع
const reservationMap = new Map();

reservations.forEach(reservation => {
  const itemId = reservation.item.toString();
  
  if (!reservationMap.has(itemId)) {
    reservationMap.set(itemId, {
      totalReserved: 0,
      reservedByMe: false,
      reservers: []
    });
  }

  const resInfo = reservationMap.get(itemId);
  resInfo.totalReserved += reservation.quantity;
  
  // هل أنا من حجز هذا العنصر؟
  if (reservation.reserver._id.toString() === currentUser) {
    resInfo.reservedByMe = true;
  }
  
  resInfo.reservers.push(reservation.reserver);
});

// 4. إضافة معلومات الحجز لكل عنصر
const itemsWithStatus = wishlist.items.map(item => {
  const itemId = item._id.toString();
  const resInfo = reservationMap.get(itemId) || {
    totalReserved: 0,
    reservedByMe: false
  };

  // حساب حالة العنصر
  let itemStatus;
  if (item.isPurchased) {
    itemStatus = 'gifted';  // تم شراؤه
  } else if (resInfo.totalReserved > 0) {
    if (isOwner) {
      itemStatus = 'available';  // المالك لا يرى الحجز (مفاجأة)
    } else {
      itemStatus = 'reserved';   // الضيوف يرون الحجز
    }
  } else {
    itemStatus = 'available';    // متاح
  }

  // حساب الحقول المهمة
  const isOwner = wishlist.owner._id.toString() === currentUser;
  const isReserved = !isOwner && resInfo.totalReserved > 0 && !resInfo.reservedByMe;
  
  return {
    ...item,
    itemStatus,
    availableQuantity: isOwner 
      ? item.quantity  // المالك يرى الكمية الكاملة
      : Math.max(0, item.quantity - resInfo.totalReserved),  // الضيوف يرون المتاح
    isReservedByMe: resInfo.reservedByMe,  // هل أنا حجزته؟
    isReserved,  // هل حجزه شخص آخر؟
    totalReserved: resInfo.totalReserved,
    remainingQuantity: Math.max(0, item.quantity - resInfo.totalReserved)
  };
});
```

### في `GET /api/items/:id` - عرض عنصر واحد

```javascript
// 1. جلب العنصر
const item = await Item.findById(id)
  .populate('wishlist')
  .populate('purchasedBy');

// 2. جلب حجزي الخاص (إن وجد)
const myReservation = await Reservation.findOne({
  item: id,
  reserver: currentUser,
  status: 'reserved'
});

// 3. جلب جميع الحجوزات النشطة
const allReservations = await Reservation.find({
  item: id,
  status: 'reserved'
});

const totalReserved = allReservations.reduce(
  (sum, res) => sum + res.quantity, 
  0
);

const isReservedByMe = !!myReservation;
const availableQuantity = Math.max(0, item.quantity - totalReserved);

// 4. تحديد ما يرى المالك vs الضيف
const isOwner = item.wishlist.owner._id.toString() === currentUser;

if (isOwner) {
  // المالك: لا يرى تفاصيل الحجز (للحفاظ على المفاجأة)
  return {
    ...item,
    availableQuantity: item.quantity,  // الكمية الكاملة
    isReservedByMe: false,
    isReserved: false
  };
} else {
  // الضيف: يرى كل شيء
  return {
    ...item,
    availableQuantity,
    isReservedByMe,
    isReserved: totalReserved > 0 && !isReservedByMe,  // حجزه شخص آخر؟
    totalReserved,
    remainingQuantity: availableQuantity
  };
}
```

---

## 🎯 الحقول المهمة في Response

### `itemStatus` (حالة العنصر):
- `"available"`: متاح للحجز
- `"reserved"`: محجوز (يراه الضيوف فقط)
- `"gifted"`: تم شراؤه/استلامه

### `isReservedByMe` (هل أنا حجزته؟):
- `true`: نعم، أنا حجزت هذا العنصر
- `false`: لا، لم أحجزه

### `isReserved` (هل حجزه شخص آخر؟):
- `true`: نعم، حجزه صديق آخر (ليس أنا)
- `false`: لا، لم يحجزه أحد أو أنا حجزته

**الصيغة:**
```javascript
isReserved = !isOwner && totalReserved > 0 && !isReservedByMe
```

### `availableQuantity` (الكمية المتاحة):
- **للمالك**: يرى الكمية الكاملة (`item.quantity`)
- **للضيف**: يرى الكمية بعد طرح الحجوزات (`item.quantity - totalReserved`)

---

## 🔐 قواعد الخصوصية (Privacy Rules)

### المالك (Owner):
- ❌ لا يرى من حجز العناصر (للحفاظ على المفاجأة)
- ✅ يرى الكمية الكاملة دائماً
- ✅ `isReservedByMe` دائماً `false`
- ✅ `isReserved` دائماً `false`
- ✅ `itemStatus` دائماً `"available"` حتى لو كان محجوز

### الضيف (Guest):
- ✅ يرى تفاصيل الحجز الكاملة
- ✅ يرى `isReservedByMe` و `isReserved`
- ✅ يرى `totalReserved` و `availableQuantity`
- ✅ يرى `itemStatus` الحقيقي (`"reserved"` إذا كان محجوز)

---

## 💡 مثال عملي

### السيناريو:
- عنصر بكمية `quantity: 3`
- User A حجز 1 قطعة
- User B حجز 1 قطعة

### النتيجة:

#### للمالك:
```json
{
  "itemStatus": "available",
  "availableQuantity": 3,
  "isReservedByMe": false,
  "isReserved": false
}
```

#### لـ User A:
```json
{
  "itemStatus": "reserved",
  "availableQuantity": 1,  // 3 - 2 = 1
  "isReservedByMe": true,
  "isReserved": false,  // لا، أنا حجزته
  "totalReserved": 2,
  "remainingQuantity": 1
}
```

#### لـ User C (لم يحجز):
```json
{
  "itemStatus": "reserved",
  "availableQuantity": 1,
  "isReservedByMe": false,
  "isReserved": true,  // نعم، حجزه A و B
  "totalReserved": 2,
  "remainingQuantity": 1
}
```

---

## 🔄 عملية إلغاء الحجز (Cancel Reservation)

```javascript
PUT /api/items/:itemId/reserve
Body: { "action": "cancel" }

// الخطوات:
1. البحث عن الحجز: Reservation.findOne({ item, reserver, status: 'reserved' })
2. تحديث status: reservation.status = 'cancelled'
3. حفظ: await reservation.save()
4. Response: { isReserved: false }
```

**النتيجة:**
- الحجز لا يُحذف من قاعدة البيانات
- فقط `status` يتغير إلى `'cancelled'`
- عند حساب `totalReserved`، نستثني الحجوزات الملغاة (`status: 'reserved'` فقط)

---

## 📊 الفرق بين Purchase و Reservation

| Aspect | Purchase | Reservation |
|--------|----------|-------------|
| **Model** | في `Item` model | في `Reservation` collection |
| **Field** | `isPurchased`, `purchasedBy` | `status: 'reserved'` |
| **المعنى** | تم الشراء فعلياً | وعد بالشراء |
| **يمكن إلغاؤه؟** | لا (دائم) | نعم (يمكن cancel) |
| **يراه المالك؟** | نعم | لا (للحفاظ على المفاجأة) |

---

## ⚠️ ملاحظات مهمة

1. **لا يوجد `reservedBy` في Item model** - الحجز يتم في collection منفصلة
2. **الـ Item model يحتوي على `isPurchased` فقط** - ليس `isReceived`
3. **المالك لا يرى الحجوزات** - للحفاظ على عنصر المفاجأة
4. **الحجوزات الملغاة لا تُحذف** - فقط `status` يتغير
5. **`totalReserved` يحسب من الحجوزات النشطة فقط** - `status === 'reserved'`
