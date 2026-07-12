const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcryptjs');
const { generateToken } = require('../utils/generateToken.js');

exports.registerUser = async (data) => {
    const { name, email, password, role_name } = data;

    // Verify role exists
    const role = await prisma.role.findUnique({ where: { role_name } });
    if (!role) {
        throw new Error('Invalid role specified.');
    }

    // Hash Password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create User
    const user = await prisma.user.create({
        data: {
            name,
            email,
            password: hashedPassword,
            role_id: role.id
        },
        include: { role: true } // Fetch joined role data
    });

    return { id: user.id, name: user.name, email: user.email, role: user.role.role_name };
};

exports.loginUser = async (email, password) => {
    // Find User
    const user = await prisma.user.findUnique({
        where: { email },
        include: { role: true }
    });

    if (!user || !(await bcrypt.compare(password, user.password))) {
        throw new Error('Invalid email or password.');
    }

    if (user.status !== 'Active') {
        throw new Error('User account is suspended.');
    }

    // Generate Token
    const token = generateToken({ id: user.id, role_name: user.role.role_name });

    return {
        token,
        user: { id: user.id, name: user.name, role: user.role.role_name }
    };
};