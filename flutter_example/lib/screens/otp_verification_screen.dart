import 'package:flutter/material.dart';
import '../repositories/auth_repository.dart';

class OtpVerificationScreen extends StatefulWidget {
  final String username;
  final String verificationMethod; // 'email' or 'phone'

  OtpVerificationScreen({
    required this.username,
    required this.verificationMethod,
  });

  @override
  _OtpVerificationScreenState createState() => _OtpVerificationScreenState();
}

class _OtpVerificationScreenState extends State<OtpVerificationScreen> {
  final _otpController = TextEditingController();
  final AuthRepository _authRepository = AuthRepository(/* Your Dio instance */);
  bool _isLoading = false;

  @override
  void dispose() {
    _otpController.dispose();
    super.dispose();
  }

  Future<void> _verifyOTP() async {
    if (_otpController.text.length != 6) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'الرجاء إدخال رمز التحقق المكون من 6 أرقام',
            style: TextStyle(fontFamily: 'Alexandria'),
          ),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    try {
      setState(() => _isLoading = true);

      final result = await _authRepository.verifyOTP(
        username: widget.username,
        otp: _otpController.text,
      );

      setState(() => _isLoading = false);

      if (result['success'] == true) {
        // Save token and navigate to home
        // await _saveToken(result['token']);
        Navigator.pushReplacementNamed(context, '/home');
      }
    } catch (e) {
      setState(() => _isLoading = false);
      
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            e.toString().replaceAll('Exception: ', ''),
            style: TextStyle(fontFamily: 'Alexandria'),
          ),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('التحقق من الحساب'),
      ),
      body: SingleChildScrollView(
        padding: EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              widget.verificationMethod == 'email'
                  ? 'تم إرسال رمز التحقق إلى بريدك الإلكتروني'
                  : 'تم إرسال رمز التحقق إلى رقم هاتفك',
              style: TextStyle(
                fontSize: 18,
                fontFamily: 'Alexandria',
              ),
              textAlign: TextAlign.center,
            ),
            SizedBox(height: 8),
            Text(
              widget.username,
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                fontFamily: 'Alexandria',
              ),
              textAlign: TextAlign.center,
            ),
            SizedBox(height: 32),
            TextFormField(
              controller: _otpController,
              decoration: InputDecoration(
                labelText: 'رمز التحقق',
                border: OutlineInputBorder(),
                hintText: '123456',
              ),
              keyboardType: TextInputType.number,
              maxLength: 6,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 24,
                letterSpacing: 8,
                fontFamily: 'monospace',
              ),
            ),
            SizedBox(height: 24),
            ElevatedButton(
              onPressed: _isLoading ? null : _verifyOTP,
              child: _isLoading
                  ? CircularProgressIndicator()
                  : Text('تحقق'),
              style: ElevatedButton.styleFrom(
                padding: EdgeInsets.symmetric(vertical: 16),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
