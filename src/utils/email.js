const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Send password reset OTP email
 * @param {string} to - Recipient email address
 * @param {string} otp - The 6-digit OTP code
 * @param {string} userName - User's name for personalization
 * @returns {Promise<Object>} - Resend response object
 */
const sendPasswordResetEmail = async (to, otp, userName = 'User') => {
  const { data, error } = await resend.emails.send({
    from: `${process.env.EMAIL_FROM_NAME || 'Wishlisty'} <onboarding@resend.dev>`,
    to: [to],
    subject: 'Password Reset Code - Wishlisty',
    html: `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Password</title>
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f4f4f4;
          }
          .container {
            background-color: #ffffff;
            border-radius: 10px;
            padding: 30px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
          }
          .header h1 {
            color: #6366f1;
            margin: 0;
            font-size: 28px;
          }
          .content {
            text-align: center;
          }
          .content p {
            font-size: 16px;
            color: #555;
            margin-bottom: 20px;
          }
          .otp-code {
            display: inline-block;
            background-color: #f0f0f0;
            color: #6366f1;
            padding: 20px 40px;
            font-size: 32px;
            font-weight: bold;
            letter-spacing: 8px;
            border-radius: 10px;
            margin: 20px 0;
            font-family: monospace;
          }
          .footer {
            text-align: center;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #eee;
            color: #888;
            font-size: 14px;
          }
          .warning {
            background-color: #fff3cd;
            border: 1px solid #ffc107;
            border-radius: 5px;
            padding: 10px;
            margin-top: 20px;
            font-size: 14px;
            color: #856404;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Wishlisty</h1>
          </div>
          <div class="content">
            <p>مرحباً ${userName}،</p>
            <p>لقد تلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بحسابك.</p>
            <p>استخدم الكود التالي لإعادة تعيين كلمة المرور:</p>
            <div class="otp-code">${otp}</div>
            <div class="warning">
              هذا الكود صالح لمدة 15 دقيقة فقط. إذا لم تطلب إعادة تعيين كلمة المرور، يمكنك تجاهل هذا البريد.
            </div>
          </div>
          <div class="footer">
            <p>فريق Wishlisty</p>
            <p>هذا البريد الإلكتروني تم إرساله تلقائياً، يرجى عدم الرد عليه.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      مرحباً ${userName}،

      لقد تلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بحسابك.

      كود إعادة تعيين كلمة المرور: ${otp}

      هذا الكود صالح لمدة 15 دقيقة فقط.

      إذا لم تطلب إعادة تعيين كلمة المرور، يمكنك تجاهل هذا البريد.

      فريق Wishlisty
    `
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
};

module.exports = {
  sendPasswordResetEmail
};
