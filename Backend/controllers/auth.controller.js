const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcryptjs');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const generateToken = require('../utils/generateToken');

exports.register = asyncHandler(async (req, res) => {
    const { name, email, password, role_name } = req.body;

    const role = await prisma.role.findUnique({ where: { role_name } });
    if (!role) {
        throw new ApiError(400, 'Invalid role specified.');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
        data: { name, email, password: hashedPassword, role_id: role.id },
        include: { role: true }
    });

    res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: { id: user.id, name: user.name, email: user.email, role: user.role.role_name }
    });
});

exports.login = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
        where: { email },
        include: { role: true }
    });

    if (!user || !(await bcrypt.compare(password, user.password))) {
        throw new ApiError(401, 'Invalid email or password.');
    }

    if (user.status !== 'Active') {
        throw new ApiError(403, 'User account is suspended.');
    }

    const token = generateToken({ id: user.id, role_name: user.role.role_name });

    res.status(200).json({
        success: true,
        message: 'Login successful',
        data: {
            token,
            user: { id: user.id, name: user.name, role: user.role.role_name }
        }
    });
});