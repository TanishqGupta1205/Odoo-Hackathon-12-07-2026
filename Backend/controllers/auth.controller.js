const authService = require('../services/auth.service');

exports.register = async (req, res) => {
    try {
        const user = await authService.registerUser(req.body);
        res.status(201).json({ message: 'User registered successfully', user });
    } catch (error) {
        // Handle Prisma unique constraint error (P2002) for duplicate emails
        if (error.code === 'P2002') {
            return res.status(400).json({ message: 'Email already exists.' });
        }
        res.status(400).json({ message: error.message });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await authService.loginUser(email, password);
        res.status(200).json({ message: 'Login successful', ...result });
    } catch (error) {
        res.status(401).json({ message: error.message });
    }
};