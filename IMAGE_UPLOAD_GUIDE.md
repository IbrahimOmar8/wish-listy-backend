# 📸 دليل رفع الصور - Cloudinary (مجاني)

## 🎯 نظرة عامة

تم إضافة نظام رفع الصور المجاني باستخدام **Cloudinary** مع:
- ✅ **25 GB** تخزين مجاني
- ✅ **25 GB** bandwidth شهرياً
- ✅ تحسين تلقائي للصور
- ✅ CDN سريع عالمياً
- ✅ دعم WebP للمتصفحات الحديثة

---

## 🚀 الخطوة 1: إعداد Cloudinary (3 دقائق)

### 1.1 إنشاء حساب مجاني

1. اذهب إلى [cloudinary.com/users/register_free](https://cloudinary.com/users/register_free)
2. سجل بالبريد الإلكتروني
3. فعّل الحساب من البريد

### 1.2 الحصول على Credentials

بعد تسجيل الدخول، ستجد في Dashboard:

```
Cloud Name: dxxxxxxxxxxxx
API Key: 123456789012345
API Secret: abcdefghijklmnopqrstuvwx-yz
```

**✅ احفظهم!**

---

## 🔧 الخطوة 2: إضافة Credentials للمشروع

### محلياً (Development):

في ملف `.env`:
```env
CLOUDINARY_CLOUD_NAME=dxxxxxxxxxxxx
CLOUDINARY_API_KEY=123456789012345
CLOUDINARY_API_SECRET=abcdefghijklmnopqrstuvwx-yz
```

### على Render (Production):

1. اذهب إلى [Render Dashboard](https://dashboard.render.com/)
2. افتح service الخاص بك
3. **Settings** → **Environment**
4. أضف المتغيرات الثلاثة:

| Key | Value |
|-----|-------|
| `CLOUDINARY_CLOUD_NAME` | dxxxxxxxxxxxx |
| `CLOUDINARY_API_KEY` | 123456789012345 |
| `CLOUDINARY_API_SECRET` | abcdefghijklmnopqrstuvwx-yz |

5. **Save Changes** → سيتم Redeploy تلقائياً

---

## 📡 APIs المتاحة

### 1. رفع صورة البروفايل

**Endpoint:**
```
POST /api/upload/profile
```

**Headers:**
```
Authorization: Bearer <jwt_token>
Content-Type: multipart/form-data
```

**Body (Form Data):**
```
image: [file]  (Max 5MB, jpg/jpeg/png/gif/webp)
```

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Profile image uploaded successfully",
  "data": {
    "imageUrl": "https://res.cloudinary.com/cloud/image/upload/v123/wishlisty/profiles/abc123.jpg",
    "user": {
      "fullName": "Ahmed Ali",
      "username": "ahmed123",
      "profileImage": "https://..."
    }
  }
}
```

**مميزات:**
- ✅ صورة مربعة 400x400 (crop تلقائي مع focus على الوجه)
- ✅ جودة تلقائية محسّنة
- ✅ WebP للمتصفحات الحديثة

---

### 2. رفع صورة لعنصر Wishlist

**Endpoint:**
```
POST /api/upload/item/:itemId
```

**Headers:**
```
Authorization: Bearer <jwt_token>
Content-Type: multipart/form-data
```

**Body (Form Data):**
```
image: [file]  (Max 5MB)
```

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Item image uploaded successfully",
  "data": {
    "imageUrl": "https://res.cloudinary.com/cloud/image/upload/v123/wishlisty/items/xyz789.jpg",
    "item": {
      "_id": "item_id",
      "name": "iPhone 15",
      "image": "https://..."
    }
  }
}
```

**مميزات:**
- ✅ حجم أقصى 600x600
- ✅ تحسين تلقائي

---

### 3. رفع صورة من Base64 (للموبايل)

**Endpoint:**
```
POST /api/upload/base64
```

**Headers:**
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "image": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAA...",
  "type": "profile"
}
```

**Types:**
- `profile` - صورة بروفايل (400x400)
- `item` - صورة عنصر (600x600)

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Profile image uploaded successfully",
  "data": {
    "imageUrl": "https://...",
    "user": { ... }
  }
}
```

---

### 4. حذف صورة البروفايل

**Endpoint:**
```
DELETE /api/upload/profile
```

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Profile image deleted successfully"
}
```

---

## 🧪 أمثلة على الاستخدام

### مثال 1: رفع صورة بروفايل من Frontend

**HTML + JavaScript:**
```html
<input type="file" id="profileImage" accept="image/*">
<button onclick="uploadProfile()">Upload</button>

<script>
async function uploadProfile() {
  const fileInput = document.getElementById('profileImage');
  const file = fileInput.files[0];

  if (!file) {
    alert('Please select an image');
    return;
  }

  const formData = new FormData();
  formData.append('image', file);

  try {
    const response = await fetch('https://your-api.com/api/upload/profile', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + localStorage.getItem('token')
      },
      body: formData
    });

    const result = await response.json();

    if (result.success) {
      alert('Image uploaded successfully!');
      console.log('Image URL:', result.data.imageUrl);
    }
  } catch (error) {
    console.error('Upload error:', error);
  }
}
</script>
```

---

### مثال 2: React Native (Base64)

```javascript
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';

async function uploadProfileImage() {
  // 1. Pick image
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  });

  if (result.canceled) return;

  // 2. Convert to base64
  const base64 = await FileSystem.readAsStringAsync(result.assets[0].uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const base64Image = `data:image/jpeg;base64,${base64}`;

  // 3. Upload
  try {
    const response = await fetch('https://your-api.com/api/upload/base64', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        image: base64Image,
        type: 'profile'
      }),
    });

    const data = await response.json();
    console.log('Uploaded:', data.data.imageUrl);
  } catch (error) {
    console.error('Upload error:', error);
  }
}
```

---

### مثال 3: cURL

```bash
# Upload profile image
curl -X POST https://your-api.com/api/upload/profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "image=@/path/to/image.jpg"

# Upload item image
curl -X POST https://your-api.com/api/upload/item/ITEM_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "image=@/path/to/image.jpg"

# Delete profile image
curl -X DELETE https://your-api.com/api/upload/profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### مثال 4: Postman

1. **Method:** POST
2. **URL:** `https://your-api.com/api/upload/profile`
3. **Headers:**
   - `Authorization`: `Bearer YOUR_TOKEN`
4. **Body:**
   - Type: `form-data`
   - Key: `image` (Type: File)
   - Value: [Select File]

---

## 📐 مواصفات الصور

### صور البروفايل:
```
Folder: wishlisty/profiles/
Size: 400x400 (square crop)
Crop: Fill with gravity on face
Format: Auto (WebP for modern browsers)
Quality: Auto optimization
Max File Size: 5MB
```

### صور العناصر:
```
Folder: wishlisty/items/
Size: Max 600x600 (maintain aspect ratio)
Crop: Limit (no cropping)
Format: Auto (WebP for modern browsers)
Quality: Auto optimization
Max File Size: 5MB
```

---

## 🔒 الأمان

### التحققات المطبقة:

1. ✅ **Authentication Required** - جميع الـ endpoints تحتاج JWT token
2. ✅ **File Type Validation** - فقط الصور (jpg, jpeg, png, gif, webp)
3. ✅ **File Size Limit** - حد أقصى 5MB
4. ✅ **Ownership Verification** - يمكنك رفع صور فقط لعناصرك
5. ✅ **Secure Upload** - الصور تُرفع لـ Cloudinary مباشرة (لا تُحفظ على السيرفر)

---

## 🗂️ بنية التخزين في Cloudinary

```
wishlisty/
├── profiles/
│   ├── user_123_timestamp.jpg
│   ├── user_456_timestamp.jpg
│   └── ...
├── items/
│   ├── item_789_timestamp.jpg
│   ├── item_012_timestamp.jpg
│   └── ...
```

---

## 🚨 معالجة الأخطاء

### خطأ: No image file provided
```json
{
  "success": false,
  "message": "No image file provided"
}
```
**الحل:** تأكد من إرسال الصورة في حقل `image`

---

### خطأ: File size too large
```json
{
  "success": false,
  "message": "File size too large. Maximum size is 5MB."
}
```
**الحل:** ضغط الصورة أو اختر صورة أصغر

---

### خطأ: Only image files are allowed
```json
{
  "success": false,
  "message": "Only image files are allowed (jpeg, jpg, png, gif, webp)"
}
```
**الحل:** استخدم صيغة صورة صحيحة

---

### خطأ: Failed to upload image to Cloudinary
```json
{
  "success": false,
  "message": "Failed to upload image to Cloudinary"
}
```
**الحل:**
1. تحقق من Cloudinary credentials في Environment Variables
2. تحقق من حصة Cloudinary (25GB limit)
3. تحقق من الـ logs لمعرفة الخطأ الفعلي

---

## 📊 Cloudinary Dashboard

راقب الاستخدام في [Cloudinary Console](https://cloudinary.com/console):

```
Media Library: جميع الصور المرفوعة
Usage: استهلاك الـ Storage والـ Bandwidth
Transformations: عدد عمليات التحسين
```

---

## 💰 الحصة المجانية

### Free Plan:
- ✅ **25 GB** Storage
- ✅ **25 GB** Bandwidth/month
- ✅ **25,000** تحويل/شهر
- ✅ **2** أعضاء في الفريق

**يكفي لـ:**
- ~50,000 صورة بروفايل (400x400)
- ~25,000 صورة عنصر (600x600)

---

## 🔄 Migration من النظام القديم

إذا كان لديك صور قديمة:

```javascript
// Script لنقل الصور
const users = await User.find({ profileImage: { $exists: true, $ne: null } });

for (const user of users) {
  if (!user.profileImage.includes('cloudinary.com')) {
    // الصورة القديمة (local أو URL خارجي)
    // يمكنك تركها كما هي أو نقلها
    console.log('Old image:', user.profileImage);
  }
}
```

---

## ✅ Checklist التأكد

- [ ] تم إنشاء حساب Cloudinary
- [ ] تم الحصول على Cloud Name, API Key, API Secret
- [ ] تم إضافة Credentials في `.env` (محلي)
- [ ] تم إضافة Credentials في Render Dashboard (production)
- [ ] تم اختبار رفع صورة بروفايل
- [ ] تم اختبار رفع صورة عنصر
- [ ] تم اختبار حذف صورة

---

## 🎉 الخطوات التالية

1. ✅ أنشئ حساب Cloudinary
2. ✅ أضف Credentials للـ `.env`
3. ✅ اختبر الـ APIs محلياً
4. ✅ ارفع على Render
5. ✅ أضف Credentials في Render
6. ✅ اختبر في Production!

---

**📸 الآن يمكنك رفع الصور بكل سهولة!**

**🔗 الموارد:**
- [Cloudinary Docs](https://cloudinary.com/documentation)
- [Cloudinary Node.js SDK](https://cloudinary.com/documentation/node_integration)
- [Cloudinary Console](https://cloudinary.com/console)

---

**✨ تم إنشاؤه: 28 ديسمبر 2025**
