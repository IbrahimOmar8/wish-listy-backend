# Flutter Auth Fix Guide - Unverified User Registration

## Problem
When a user tries to register with an email/phone that already exists but is unverified, the app currently treats it as an error. We need to handle this as a success path that leads to the OTP verification screen.

## Backend Response
The backend already returns the correct response for unverified existing users:

```json
{
  "success": true,
  "message": "Registration successful! Please check your email for verification code.",
  "requiresVerification": true,
  "verificationMethod": "email",
  "user": {
    "id": "...",
    "fullName": "John Doe",
    "username": "john@example.com",
    "handle": "@johndoe",
    "isVerified": false
  }
}
```

## Solution

### Key Changes in `auth_repository.dart`

**CRITICAL FIX**: Even if the backend returns a status code that you currently catch as an error (like 400), you MUST check the response body for `requiresVerification: true`.

```dart
Future<User> register({...}) async {
  try {
    final response = await _dio.post('/api/auth/register', data: {...});
    
    if (response.statusCode == 201) {
      // Handle success response
      return User.fromJson(response.data['user']);
    }
  } on DioException catch (e) {
    // IMPORTANT: Check response body even for error status codes
    if (e.response != null) {
      final responseData = e.response!.data;
      
      // Check for requiresVerification even in error responses
      if (responseData != null && 
          responseData['requiresVerification'] == true && 
          responseData['user'] != null && 
          responseData['user']['isVerified'] == false) {
        // This is actually a SUCCESS case - return User, don't throw exception
        return User.fromJson(responseData['user']);
      }
    }
    
    // Only throw exception for real errors
    throw Exception(e.response?.data['message'] ?? 'Registration failed');
  }
}
```

### Key Changes in `signup_screen.dart`

When `register()` returns a User object (even for unverified existing users), show the Arabic snackbar and navigate to OTP screen:

```dart
Future<void> _handleRegister() async {
  try {
    final user = await _authRepository.register(...);
    
    if (!user.isVerified) {
      // Show Arabic snackbar with Alexandria font
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'لديك حساب غير مفعّل بالفعل. تم إرسال رمز جديد.',
            style: TextStyle(
              fontFamily: 'Alexandria',
            ),
          ),
          backgroundColor: Colors.orange,
          duration: Duration(seconds: 3),
        ),
      );
      
      // Navigate to OTP screen
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (context) => OtpVerificationScreen(
            username: user.username,
            verificationMethod: user.verificationMethod ?? 'email',
          ),
        ),
      );
    }
  } catch (e) {
    // Only show error for real failures
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(e.toString()),
        backgroundColor: Colors.red,
      ),
    );
  }
}
```

## Complete Implementation Files

I've created example Flutter files in `flutter_example/` directory:

1. **`lib/repositories/auth_repository.dart`** - Updated register method
2. **`lib/models/user.dart`** - User model with isVerified field
3. **`lib/screens/signup_screen.dart`** - Signup screen with snackbar
4. **`lib/screens/otp_verification_screen.dart`** - OTP verification screen

## Flow Diagram

```
User registers with existing unverified email
    ↓
Backend returns: { requiresVerification: true, user: { isVerified: false } }
    ↓
Flutter auth_repository.dart checks: requiresVerification == true && isVerified == false
    ↓
Return User object (NO exception thrown)
    ↓
signup_screen.dart receives User object
    ↓
Show snackbar: "لديك حساب غير مفعّل بالفعل. تم إرسال رمز جديد." (Alexandria font)
    ↓
Navigate to OTP verification screen
```

## Testing Checklist

- [ ] Register with new email → Should go to OTP screen
- [ ] Register again with same unverified email → Should show snackbar and go to OTP screen (NO error)
- [ ] Register with verified email → Should show error "Username already exists"
- [ ] Register with phone → Should handle similarly
- [ ] Verify OTP → Should navigate to home screen

## Important Notes

1. **Font Setup**: Make sure 'Alexandria' font is added to your `pubspec.yaml`:
   ```yaml
   fonts:
     - family: Alexandria
       fonts:
         - asset: fonts/Alexandria-Regular.ttf
   ```

2. **Error Handling**: The key is to check `requiresVerification` in the response body, even if the HTTP status code suggests an error.

3. **User Model**: Ensure your User model includes `isVerified` and `verificationMethod` fields.

4. **Navigation**: The OTP screen should accept `username` and `verificationMethod` to handle both email and phone verification.
