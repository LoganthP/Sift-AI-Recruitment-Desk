import { handle } from 'hono/vercel';
import app from './_lib/app';

// Vercel Edge Function: one entry point for every /api/* route (see vercel.json rewrite).
export const config = { runtime: 'edge' };

export default handle(app);
