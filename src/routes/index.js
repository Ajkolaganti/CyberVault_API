import { Router } from 'express';
import credentialRoutes from './credentialRoutes.js';
import jitRoutes from './jitRoutes.js';
import discoveryRoutes from './discoveryRoutes.js';
import sessionRoutes from './sessionRoutes.js';
import roleRoutes from './roleRoutes.js';
import policyRoutes from './policyRoutes.js';
import auditRoutes from './auditRoutes.js';
import integrationRoutes from './integrationRoutes.js';
import authRoutes from './authRoutes.js';
import dashboardRoutes from './dashboardRoutes.js';
import accountRoutes from './accountRoutes.js';
import safeRoutes from './safeRoutes.js';
import cpmRoutes from './cpmRoutes.js';
import userRoutes from './userRoutes.js';
import validationRoutes from './validationRoutes.js';


const router = Router();

router.use('/credentials', credentialRoutes);
router.use('/jit', jitRoutes);
router.use('/discovery', discoveryRoutes);
router.use('/sessions', sessionRoutes);
router.use('/roles', roleRoutes);
router.use('/policies', policyRoutes);
router.use('/audit', auditRoutes);
router.use('/integrations', integrationRoutes);
router.use('/auth', authRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/accounts', accountRoutes);
router.use('/safes', safeRoutes);
router.use('/cpm', cpmRoutes);
router.use('/user', userRoutes);
router.use('/validation', validationRoutes);
// TODO: add credential, JIT access, discovery, session, policy routes

export default router; 