import { Router } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { opportunitiesController } from './opportunities.controller';

const router = Router();

router.use(authenticate);

// ── Feed & CRUD ───────────────────────────────────────────────────────────────
router.get('/', opportunitiesController.getOpportunities);
router.post('/', opportunitiesController.createOpportunity);
router.get('/mine', opportunitiesController.getMyOpportunities);
router.get('/saved', opportunitiesController.getSavedOpportunities);
router.get('/applications/mine', opportunitiesController.getMyApplications);
router.get('/:opportunityId', opportunitiesController.getOpportunity);
router.patch('/:opportunityId', opportunitiesController.updateOpportunity);
router.delete('/:opportunityId', opportunitiesController.deleteOpportunity);

// ── Save / Unsave ─────────────────────────────────────────────────────────────
router.post('/:opportunityId/save', opportunitiesController.saveOpportunity);
router.delete('/:opportunityId/save', opportunitiesController.unsaveOpportunity);

// ── Applications ──────────────────────────────────────────────────────────────
router.post('/:opportunityId/apply', opportunitiesController.applyToOpportunity);
router.get('/:opportunityId/applications', opportunitiesController.getApplications);
router.patch('/applications/:applicationId/status', opportunitiesController.updateApplicationStatus);

export default router;
