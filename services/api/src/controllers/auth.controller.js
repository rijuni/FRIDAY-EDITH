import { authService } from '../modules/auth/auth.service.js';

export async function register(req, res, next) {
  try {
    const { email, password, name, role } = req.body;
    const result = await authService.register({ email, password, name, role }, req.ip);
    res.status(201).json({
      status: 'success',
      data: result
    });
  } catch (error) {
    next(error);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const result = await authService.login({ email, password }, req.ip);
    res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (error) {
    next(error);
  }
}

export async function getMe(req, res, next) {
  try {
    const profile = await authService.getProfile(req.user.id);
    res.status(200).json({
      status: 'success',
      data: { user: profile }
    });
  } catch (error) {
    next(error);
  }
}

