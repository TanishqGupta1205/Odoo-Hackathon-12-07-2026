const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcryptjs');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const generateToken = require('../utils/generateToken');

/**
 * @desc    Register a new user
 * @route   POST /api/auth/register
 * @access  Public
 */
exports.register = asyncHandler(async (req, res) => {
    // 🔍 Telemetry Diagnostics
    const prismaKeys = Object.keys(prisma).filter(key => !key.startsWith('_') && !key.startsWith('$'));
    console.log("================ PRISMA DIAGNOSTICS ================");
    console.log("Exposed Prisma Client Models:", prismaKeys);
    console.log("====================================================");

    const { name, email, password, role_name } = req.body;

    // 1. Basic Field Validations
    if (!name || !email || !password || !role_name) {
        throw new ApiError(400, 'Please provide all required registration fields (name, email, password, role_name).');
    }

    const normalizedEmail = email.toLowerCase().trim();

    // 2. Resolve User and Role Model Keys Dynamically
    const targetModelKey = prismaKeys.find(key => key.toLowerCase() === 'role' || key.toLowerCase() === 'roles');
    const userModelKey = prismaKeys.find(key => key.toLowerCase() === 'user' || key.toLowerCase() === 'users') || 'user';

    if (!targetModelKey) {
        throw new ApiError(500, `Prisma Client initialization mismatch. Found models: [${prismaKeys.join(', ')}].`);
    }

    const roleSelector = prisma[targetModelKey];
    const userSelector = prisma[userModelKey];

    // 3. Graceful Duplicate Email Check (Prevents P2002 Database Crashes)
    const existingUser = await userSelector.findUnique({
        where: { email: normalizedEmail }
    });

    if (existingUser) {
        throw new ApiError(400, `Registration failed. An account with the email '${normalizedEmail}' already exists.`);
    }

    // 4. Verify System Role Validity
    const role = await roleSelector.findFirst({
        where: {
            role_name: {
                equals: role_name,
                mode: 'insensitive'
            }
        }
    });

    if (!role) {
        throw new ApiError(400, `The system role '${role_name}' does not exist. Ensure seed roles are populated.`);
    }

    // 5. Securely Hash Password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 6. Safe Database Record Insertion
    const user = await userSelector.create({
        data: {
            name,
            email: normalizedEmail,
            password: hashedPassword,
            role_id: role.id
        },
        include: {
            role: true
        }
    });

    // 7. Standardized Network Response
    res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role.role_name
        }
    });
});

/**
 * @desc    Authenticate user & generate JWT session token
 * @route   POST /api/auth/login
 * @access  Public
 */
exports.login = asyncHandler(async (req, res) => {
    const prismaKeys = Object.keys(prisma).filter(key => !key.startsWith('_') && !key.startsWith('$'));
    const { email, password } = req.body;

    if (!email || !password) {
        throw new ApiError(400, 'Please provide both email and password parameters.');
    }

    const userModelKey = prismaKeys.find(key => key.toLowerCase() === 'user' || key.toLowerCase() === 'users') || 'user';
    const userSelector = prisma[userModelKey];

    const user = await userSelector.findUnique({
        where: {
            email: email.toLowerCase().trim()
        },
        include: {
            role: true
        }
    });

    if (!user || !(await bcrypt.compare(password, user.password))) {
        throw new ApiError(401, 'Invalid credential configurations provided.');
    }

    if (user.status !== 'Active') {
        throw new ApiError(403, 'Your account registry state is currently marked as Suspended.');
    }

    const token = generateToken({ id: user.id, role_name: user.role.role_name });

    res.status(200).json({
        success: true,
        message: 'Authentication process completed successfully.',
        data: {
            token,
            user: {
                id: user.id,
                name: user.name,
                role: user.role.role_name
            }
        }
    });
});