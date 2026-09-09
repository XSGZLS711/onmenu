import { handleOrderRequest } from '@/lib/order-api';
export const dynamic = 'force-dynamic';
export const GET = (request: Request) => handleOrderRequest(request, 'guest');
export const POST = GET;
