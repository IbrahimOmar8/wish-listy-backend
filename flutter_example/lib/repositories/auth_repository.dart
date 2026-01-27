import 'package:dio/dio.dart';
import '../models/user.dart';

class AuthRepository {
  final Dio _dio;

  AuthRepository(this._dio);

  /// Register a new user
  /// 
  /// Handles both new registrations and unverified existing users.
  /// If user exists but is unverified, returns User object instead of throwing exception.
  Future<User> register({
    required String fullName,
    required String username,
    required String password,
  }) async {
    try {
      final response = await _dio.post(
        '/api/auth/register',
        data: {
          'fullName': fullName,
          'username': username,
          'password': password,
        },
      );

      // Handle success response (201 Created)
      if (response.statusCode == 201) {
        final data = response.data;
        
        // Check if this is an unverified existing user or new user
        if (data['requiresVerification'] == true && 
            data['user'] != null && 
            data['user']['isVerified'] == false) {
          // This is a success case - return user and trigger verification flow
          return User.fromJson(data['user']);
        }
        
        // Normal new registration
        if (data['user'] != null) {
          return User.fromJson(data['user']);
        }
      }
      
      throw Exception('Registration failed: Invalid response');
    } on DioException catch (e) {
      // IMPORTANT: Check if backend returned error but with requiresVerification
      // This handles the case where backend returns 400 but with requiresVerification: true
      if (e.response != null && e.response!.statusCode != null) {
        final responseData = e.response!.data;
        
        // Even if status code indicates error, check for requiresVerification
        if (responseData != null && 
            responseData is Map &&
            responseData['requiresVerification'] == true && 
            responseData['user'] != null && 
            responseData['user']['isVerified'] == false) {
          // This is actually a success case - unverified existing user
          // Do NOT throw exception - return User object instead
          return User.fromJson(responseData['user']);
        }
      }
      
      // Re-throw if it's a real error
      final errorMessage = e.response?.data?['message'] ?? 'Registration failed';
      throw Exception(errorMessage);
    } catch (e) {
      throw Exception('Registration failed: $e');
    }
  }

  /// Verify OTP for email or phone
  Future<Map<String, dynamic>> verifyOTP({
    required String username,
    required String otp,
  }) async {
    try {
      final response = await _dio.post(
        '/api/auth/verify-otp',
        data: {
          'username': username,
          'otp': otp,
        },
      );

      if (response.statusCode == 200) {
        return {
          'success': true,
          'token': response.data['token'],
          'user': response.data['user'],
        };
      }
      
      throw Exception('OTP verification failed');
    } on DioException catch (e) {
      final errorMessage = e.response?.data?['message'] ?? 'OTP verification failed';
      throw Exception(errorMessage);
    }
  }
}
