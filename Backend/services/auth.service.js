const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { hashPassword, comparePassword, generateToken } = require('../utils/auth.util');

exports.registerUser = async (data) => {
    const { name, email, password, role_name } = data;

    const role = await prisma.role.findUnique({ where: { role_name } });
    if (!role) throw new Error('Invalid role specified.');

    // Using the secure utility helper to hash before saving
    const hashedPassword = await hashPassword(password);

    const user = await prisma.user.create({
        data: {
            name,
            email,
            password: hashedPassword,
            role_id: role.id
        },
        include: { role: true }
    });

    return { id: user.id, name: user.name, email: user.email, role: user.role.role_name };
};

exports.loginUser = async (email, password) => {
    const user = await prisma.user.findUnique({
        where: { email },
        include: { role: true }
    });

    // Validate email existence and safely check hash authenticity
    if (!user || !(await comparePassword(password, user.password))) {
        throw new Error('Invalid email or password.');
    }

    if (user.status !== 'Active') {
        throw new Error('User account is suspended.');
    }

    const token = generateToken({ id: user.id, role_name: user.role.role_name });

    return {
        token,
        user: { id: user.id, name: user.name, role: user.role.role_name }
    };
};