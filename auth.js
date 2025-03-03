const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

// Initialize Supabase client with service role key for admin operations
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY  // Use service role key for admin operations
);

// Generate a 6-digit OTP
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Validate phone number format
function isValidPhoneNumber(phone) {
    const phoneRegex = /^[0-9]{10}$/;  // Assumes 10-digit phone numbers
    return phoneRegex.test(phone);
}

// Validate username format
function isValidUsername(username) {
    const usernameRegex = /^[a-zA-Z0-9_]{4,20}$/;  // 4-20 characters, alphanumeric and underscore
    return usernameRegex.test(username);
}

// Validate password strength
function isValidPassword(password) {
    // At least 8 characters, 1 uppercase, 1 lowercase, 1 number
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d]{8,}$/;
    return passwordRegex.test(password);
}

// Request OTP
router.post('/request-otp', async (req, res) => {
    try {
        const { phone_number } = req.body;

        // Validate phone number
        if (!phone_number || !isValidPhoneNumber(phone_number)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid phone number format. Please enter a 10-digit number.'
            });
        }

        // First, ensure user exists
        const { data: existingUser, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('phone_number', phone_number)
            .single();

        if (!existingUser) {
            // Create new user if doesn't exist
            const { error: createError } = await supabase
                .from('users')
                .insert([{ 
                    phone_number,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }]);

            if (createError) {
                console.error('Error creating user:', createError);
                throw new Error('Failed to create user account');
            }
        }

        // Generate OTP
        const otp = generateOTP();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

        // Save OTP in database
        const { error: tokenError } = await supabase
            .from('auth_tokens')
            .insert([{
                phone_number,
                token: otp,
                expires_at: expiresAt.toISOString(),
                created_at: new Date().toISOString()
            }]);

        if (tokenError) {
            console.error('Error saving token:', tokenError);
            throw new Error('Failed to generate OTP');
        }

        // In production, you would send this via SMS
        // For development, we'll return it in response
        console.log(`OTP for ${phone_number}: ${otp}`);

        res.json({
            success: true,
            message: 'OTP sent successfully',
            dev_otp: process.env.NODE_ENV === 'development' ? otp : undefined
        });

    } catch (error) {
        console.error('Error in request-otp:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to send OTP'
        });
    }
});

// Verify OTP and login/signup
router.post('/verify-otp', async (req, res) => {
    try {
        const { phone_number, otp } = req.body;

        // Validate inputs
        if (!phone_number || !otp) {
            return res.status(400).json({
                success: false,
                error: 'Phone number and OTP are required'
            });
        }

        // Check OTP
        const { data: tokens, error: tokenError } = await supabase
            .from('auth_tokens')
            .select('*')
            .eq('phone_number', phone_number)
            .eq('token', otp)
            .eq('is_used', false)
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false })
            .limit(1);

        if (tokenError || !tokens || tokens.length === 0) {
            return res.status(401).json({
                success: false,
                error: 'Invalid or expired OTP'
            });
        }

        // Mark OTP as used
        await supabase
            .from('auth_tokens')
            .update({ is_used: true })
            .eq('id', tokens[0].id);

        // Get user data
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('phone_number', phone_number)
            .single();

        if (userError || !user) {
            throw new Error('User not found');
        }

        // Update last sign in
        await supabase
            .from('users')
            .update({ 
                last_sign_in_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('phone_number', phone_number);

        // Generate session
        const { data: authData, error: authError } = await supabase.auth.signUp({
            phone: phone_number,
            password: process.env.DEFAULT_USER_PASSWORD || 'defaultpass123'
        });

        if (authError) {
            throw authError;
        }

        res.json({
            success: true,
            message: 'Login successful',
            user: {
                id: user.id,
                phone_number: user.phone_number,
                last_sign_in: user.last_sign_in_at
            },
            token: authData.session?.access_token
        });

    } catch (error) {
        console.error('Error in verify-otp:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to verify OTP'
        });
    }
});

// Forgot Password (Resend OTP)
router.post('/forgot-password', async (req, res) => {
    try {
        const { phone_number } = req.body;

        if (!phone_number || !isValidPhoneNumber(phone_number)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid phone number format'
            });
        }

        // Check if user exists
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('phone_number', phone_number)
            .single();

        if (userError || !user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Generate and save new OTP
        const otp = generateOTP();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

        const { error: tokenError } = await supabase
            .from('auth_tokens')
            .insert([{
                phone_number,
                token: otp,
                expires_at: expiresAt.toISOString(),
                created_at: new Date().toISOString()
            }]);

        if (tokenError) {
            throw new Error('Failed to generate reset OTP');
        }

        // In production, send OTP via SMS
        console.log(`Reset OTP for ${phone_number}: ${otp}`);

        res.json({
            success: true,
            message: 'Reset OTP sent successfully',
            dev_otp: process.env.NODE_ENV === 'development' ? otp : undefined
        });

    } catch (error) {
        console.error('Error in forgot-password:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to process password reset'
        });
    }
});

// Signup endpoint
router.post('/signup', async (req, res) => {
    try {
        const { phone_number, username, password, confirm_password } = req.body;

        // Validate all required fields
        if (!phone_number || !username || !password || !confirm_password) {
            return res.status(400).json({
                success: false,
                error: 'All fields are required'
            });
        }

        // Validate phone number
        if (!isValidPhoneNumber(phone_number)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid phone number format. Please enter a 10-digit number.'
            });
        }

        // Validate username
        if (!isValidUsername(username)) {
            return res.status(400).json({
                success: false,
                error: 'Username must be 4-20 characters long and can only contain letters, numbers, and underscores'
            });
        }

        // Validate password
        if (!isValidPassword(password)) {
            return res.status(400).json({
                success: false,
                error: 'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, and one number'
            });
        }

        // Check if passwords match
        if (password !== confirm_password) {
            return res.status(400).json({
                success: false,
                error: 'Passwords do not match'
            });
        }

        // Check if phone number already exists
        const { data: existingPhone, error: phoneError } = await supabase
            .from('users')
            .select('phone_number')
            .eq('phone_number', phone_number)
            .single();

        if (existingPhone) {
            return res.status(400).json({
                success: false,
                error: 'Phone number already registered'
            });
        }

        // Check if username already exists
        const { data: existingUsername, error: usernameError } = await supabase
            .from('users')
            .select('username')
            .eq('username', username)
            .single();

        if (existingUsername) {
            return res.status(400).json({
                success: false,
                error: 'Username already taken'
            });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create user
        const { data: newUser, error: createError } = await supabase
            .from('users')
            .insert([{
                phone_number,
                username,
                password: hashedPassword,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (createError) {
            throw createError;
        }

        // Generate session token
        const { data: authData, error: authError } = await supabase.auth.signUp({
            phone: phone_number,
            password: password
        });

        if (authError) {
            throw authError;
        }

        res.json({
            success: true,
            message: 'Account created successfully',
            user: {
                id: newUser.id,
                phone_number: newUser.phone_number,
                username: newUser.username
            },
            token: authData.session?.access_token
        });

    } catch (error) {
        console.error('Error in signup:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to create account'
        });
    }
});

module.exports = router; 