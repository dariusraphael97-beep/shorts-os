// src/lib/render/callback-token.ts
//
// JWT (HS256) tokens passed to the sandbox at dispatch and presented back to
// /api/render/complete. Token carries jobId + short exp.
import 'server-only';
import jwt from 'jsonwebtoken';

export class CallbackTokenError extends Error {
  constructor(message: string) { super(message); this.name = 'CallbackTokenError'; }
}

interface CallbackPayload {
  jobId: string;
}

export function signCallbackToken(args: { jobId: string; ttlSeconds: number }): string {
  const secret = process.env.RENDER_CALLBACK_SECRET;
  if (!secret) throw new Error('RENDER_CALLBACK_SECRET must be set');
  return jwt.sign({ jobId: args.jobId } satisfies CallbackPayload, secret, {
    algorithm: 'HS256',
    expiresIn: args.ttlSeconds,
  });
}

export function verifyCallbackToken(token: string): CallbackPayload {
  const secret = process.env.RENDER_CALLBACK_SECRET;
  if (!secret) throw new Error('RENDER_CALLBACK_SECRET must be set');
  try {
    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    if (!decoded.jobId || typeof decoded.jobId !== 'string') {
      throw new CallbackTokenError('Token missing jobId');
    }
    return { jobId: decoded.jobId };
  } catch (err) {
    if (err instanceof CallbackTokenError) throw err;
    throw new CallbackTokenError(err instanceof Error ? err.message : 'Token verify failed');
  }
}
