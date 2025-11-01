const twilioClient = require('../config/twilio');

exports.sendOTP = async (phoneNumber, otp) => {
  try {
    const message = await twilioClient.messages.create({
      body: `Your Wish Listy verification code is: ${otp}. Valid for ${process.env.OTP_EXPIRY_MINUTES} minutes.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phoneNumber
    });
    return message;
  } catch (error) {
    console.error('SMS Error:', error);
    throw new Error('Failed to send OTP');
  }
};

exports.generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};
