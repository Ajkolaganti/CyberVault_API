import * as roleService from '../services/roleService.js';
import { validationResult, body } from 'express-validator';

export async function list(req, res, next) {
  try {
    const users = await roleService.listUsers();
    res.json(users);
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const { role } = req.body;
    const updated = await roleService.updateUserRole({
      userId: req.params.id,
      role,
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
} 