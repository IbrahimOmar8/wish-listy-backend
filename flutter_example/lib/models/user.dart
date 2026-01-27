class User {
  final String id;
  final String fullName;
  final String username;
  final String? handle;
  final bool isVerified;
  final String? verificationMethod; // 'email' or 'phone'
  final String? profileImage;

  User({
    required this.id,
    required this.fullName,
    required this.username,
    this.handle,
    required this.isVerified,
    this.verificationMethod,
    this.profileImage,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id']?.toString() ?? '',
      fullName: json['fullName'] ?? '',
      username: json['username'] ?? '',
      handle: json['handle'],
      isVerified: json['isVerified'] ?? false,
      verificationMethod: json['verificationMethod'],
      profileImage: json['profileImage'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'fullName': fullName,
      'username': username,
      'handle': handle,
      'isVerified': isVerified,
      'verificationMethod': verificationMethod,
      'profileImage': profileImage,
    };
  }
}
