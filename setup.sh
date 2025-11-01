#!/bin/bash

# Wish Listy Backend - Automated Setup Script
# This script sets up your development environment

echo "🎉 Welcome to Wish Listy Backend Setup!"
echo "========================================"
echo ""

# Check Node.js installation
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    echo "Visit: https://nodejs.org"
    exit 1
fi

echo "✅ Node.js version: $(node -v)"
echo "✅ npm version: $(npm -v)"
echo ""

# Check MongoDB installation
if ! command -v mongod &> /dev/null; then
    echo "⚠️  MongoDB is not installed locally."
    echo "You can either:"
    echo "  1. Install MongoDB locally"
    echo "  2. Use MongoDB Atlas (cloud)"
    read -p "Continue anyway? (y/n): " continue_setup
    if [ "$continue_setup" != "y" ]; then
        exit 1
    fi
else
    echo "✅ MongoDB is installed"
fi
echo ""

# Create directory structure
echo "📁 Creating directory structure..."
mkdir -p src/config
mkdir -p src/models
mkdir -p src/controllers
mkdir -p src/routes
mkdir -p src/middleware
mkdir -p src/utils

echo "✅ Directory structure created"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install express mongoose dotenv cors helmet morgan jsonwebtoken bcryptjs twilio joi express-validator

echo ""
echo "📦 Installing dev dependencies..."
npm install --save-dev nodemon

echo "✅ Dependencies installed"
echo ""

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "⚙️  Creating .env file..."
    cat > .env << EOF
# Server
NODE_ENV=development
PORT=5000

# Database
MONGODB_URI=mongodb://localhost:27017/wish-listy

# JWT
JWT_SECRET=change_this_to_a_secure_random_string_in_production
JWT_EXPIRE=7d

# Twilio (for SMS OTP)
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=your_twilio_phone_number

# OTP Settings
OTP_EXPIRY_MINUTES=10
EOF
    echo "✅ .env file created"
    echo "⚠️  IMPORTANT: Update .env with your actual credentials!"
else
    echo "ℹ️  .env file already exists, skipping..."
fi
echo ""

# Create .gitignore if it doesn't exist
if [ ! -f .gitignore ]; then
    echo "📝 Creating .gitignore..."
    cat > .gitignore << EOF
node_modules/
.env
.env.local
.env.development
.env.production
npm-debug.log*
.DS_Store
logs/
*.log
dist/
build/
coverage/
.vscode/
.idea/
EOF
    echo "✅ .gitignore created"
else
    echo "ℹ️  .gitignore already exists, skipping..."
fi
echo ""

# Initialize git if not already initialized
if [ ! -d .git ]; then
    echo "🔧 Initializing git repository..."
    git init
    echo "✅ Git initialized"
else
    echo "ℹ️  Git already initialized, skipping..."
fi
echo ""

# Create README if it doesn't exist
if [ ! -f README.md ]; then
    echo "📄 Creating README.md..."
    echo "# Wish Listy Backend API" > README.md
    echo "✅ README.md created"
fi
echo ""

# Summary
echo "========================================"
echo "✨ Setup Complete! ✨"
echo "========================================"
echo ""
echo "📋 Next Steps:"
echo ""
echo "1. Update your .env file with real credentials:"
echo "   - Get MongoDB URI (local or Atlas)"
echo "   - Get Twilio credentials from twilio.com"
echo "   - Generate a secure JWT_SECRET"
echo ""
echo "2. Start MongoDB (if using local):"
echo "   $ mongod"
echo ""
echo "3. Run the development server:"
echo "   $ npm run dev"
echo ""
echo "4. Test the API:"
echo "   Open: http://localhost:5000"
echo ""
echo "5. Import Postman collection for testing"
echo ""
echo "📚 Documentation:"
echo "   - README.md - Project overview"
echo "   - DEPLOYMENT.md - Deployment guide"
echo ""
echo "🎯 Happy coding!"
echo ""