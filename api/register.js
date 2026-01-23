// /api/register.js
import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Base61 from './base61.js';

const sql = neon(process.env.DATABASE_URL);
const JWT_SECRET = process.env.JWT_SECRET;

// Function to generate unique user ID
async function generateUniqueUserId() {
  let isUnique = false;
  let userId = '';
  let randomLength = 3;
  
  while (!isUnique) {
    // Generate timestamp in base61
    const timestampBase61 = Base61.generateBase61Timestamp();
    
    // Add random base61 characters
    const randomPart = Base61.random(randomLength);
    
    userId = timestampBase61 + randomPart;
    
    // Check if unique in database
    try {
      const existing = await sql`
        SELECT id FROM users WHERE id = ${userId}
      `;
      
      if (existing.length === 0) {
        isUnique = true;
      } else {
        // Not unique, add one more random character and try again
        randomLength++;
        console.log(`User ID ${userId} exists, trying with ${randomLength} random chars`);
      }
    } catch (error) {
      console.error('Error checking user ID uniqueness:', error);
      throw error;
    }
  }
  
  return userId;
}

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle OPTIONS request for CORS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password required' });
    }

    // Check if user exists
    const existingUser = await sql`
      SELECT id FROM users WHERE email = ${email}
    `;

    if (existingUser.length > 0) {
      return res.status(400).json({ success: false, message: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate unique user ID in base61 format
    const userId = await generateUniqueUserId();
    
    console.log(`Generated user ID: ${userId}`);

    // Create user with new ID format
    const [newUser] = await sql`
      INSERT INTO users (id, email, password_hash, name, created_at)
      VALUES (${userId}, ${email}, ${hashedPassword}, ${name || ''}, NOW())
      RETURNING id, email, name
    `;

    // Generate JWT
    const token = jwt.sign(
      { userId: newUser.id, email: newUser.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: { 
        id: newUser.id, 
        email: newUser.email, 
        name: newUser.name 
      },
      token
    });

  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error.message 
    });
  }
}
