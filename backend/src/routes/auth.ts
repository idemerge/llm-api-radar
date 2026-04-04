import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { userStore } from '../services/userStore';
import { AuthPayload } from '../middleware/auth';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'llm-benchmark-jwt-default-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }

  const user = await userStore.verifyPassword(username, password);
  if (!user) {
    res.status(401).json({ error: 'Invalid username or password' });
    return;
  }

  const payload: AuthPayload = { sub: user.id, username: user.username };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);

  res.json({
    token,
    user: { id: user.id, username: user.username },
    expiresIn: JWT_EXPIRES_IN,
  });
});

router.get('/verify', (req: Request, res: Response) => {
  const user = (req as any).user as AuthPayload | undefined;
  res.json({ valid: true, user });
});

export default router;
