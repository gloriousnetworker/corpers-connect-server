import dotenv from 'dotenv';
dotenv.config();

// Override to use test DB
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
process.env.EXPOSE_DEV_OTP = 'true';
